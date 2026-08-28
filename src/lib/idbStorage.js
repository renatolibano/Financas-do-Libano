// Armazenamento local via IndexedDB — mesma ideia do storage.js (localStorage),
// mas sem o teto de ~5-10MB por origem. Cota do IndexedDB costuma ser uma
// fração do espaço livre em disco (geralmente centenas de MB a alguns GB),
// o que aguenta numa boa entidades cheias de imagens em base64 (capas de
// livros/PDFs, fotos de pasta, GIFs de exercício, fotos de item de compra).
//
// Tudo aqui roda 100% no navegador do usuário — nenhuma chamada de rede,
// nenhum egress. É só um banco de dados local, maior que o localStorage.

import { useState, useEffect } from "react";
import { loadLocal, removeLocalKey } from "./storage";

const DB_NAME = "libano-idb";
const DB_VERSION = 1;
const STORE_NAME = "kv";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function idbGet(key, fallback) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result === undefined ? fallback : req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("Não foi possível carregar (IndexedDB)", key, e);
    return fallback;
  }
}

export async function idbSet(key, value) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch (e) {
    // Mesmo o IndexedDB tem cota (bem maior, mas não infinita). Se estourar,
    // cai aqui — melhor avisar do que falhar 100% em silêncio.
    console.warn("Não foi possível salvar (IndexedDB)", key, e);
    return false;
  }
}

export async function idbDelete(key) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("Não foi possível remover (IndexedDB)", key, e);
  }
}

// Sentinela pra distinguir "não achei nada" de "achei um valor falsy/vazio"
// (ex: [] ou false são valores legítimos salvos, não ausência de dado).
const NOT_FOUND = Symbol("idb-not-found");

// Hook de estado persistente igual ao usePersistentState do storage.js, só
// que gravando no IndexedDB em vez do localStorage. Na primeira vez que uma
// chave é lida, se não houver nada ainda no IndexedDB, ele automaticamente
// migra o que já estiver salvo no localStorage (onde esse dado vivia antes),
// grava no IndexedDB e libera a chave antiga do localStorage.
export function useIdbPersistentState(key, fallback) {
  const [state, setState] = useState(fallback);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    (async () => {
      const fromIdb = await idbGet(key, NOT_FOUND);
      if (cancelled) return;
      if (fromIdb !== NOT_FOUND) {
        setState(fromIdb);
        setLoaded(true);
        return;
      }
      const fromLocal = loadLocal(key, undefined);
      if (fromLocal !== undefined) {
        setState(fromLocal);
        await idbSet(key, fromLocal);
        removeLocalKey(key);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!loaded) return; // evita sobrescrever o IndexedDB com o fallback antes do load terminar
    idbSet(key, state);
  }, [key, state, loaded]);

  return [state, setState, loaded];
}
