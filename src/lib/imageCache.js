// Cache local de imagens (capas, fotos, gifs) baixadas do Supabase Storage.
//
// Por quê: cada renderização de uma tela com capas/fotos rebaixava a imagem
// de novo do Storage, mesmo que nada tivesse mudado — isso é egress pago no
// plano gratuito do Supabase. Aqui a gente guarda a imagem já baixada no
// próprio aparelho (via Cache Storage API, a mesma usada pelo pdfCache.js) e
// só baixa de novo quando a URL muda de verdade — o que já acontece
// automaticamente, porque cada upload de capa/foto gera uma URL nova
// (?v=timestamp). Ou seja: a própria URL já funciona como identificador de
// versão, sem precisar comparar nada com o servidor.
//
// Isso é só uma otimização de rede: nunca é a única fonte de verdade — se o
// cache falhar ou o navegador não suportar, cai de volta pro <img src> normal.

import { useState, useEffect, useRef } from "react";

const CACHE_NAME = "libano-image-cache-v1";

async function getCacheStore() {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch (e) {
    console.warn("Cache de imagens indisponível:", e);
    return null;
  }
}

async function getCachedImageBlob(url) {
  const store = await getCacheStore();
  if (store) {
    try {
      const cachedRes = await store.match(url);
      if (cachedRes) return await cachedRes.blob();
    } catch (e) {
      console.warn("Falha ao ler imagem do cache:", e);
    }
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar imagem (${res.status})`);
  const blob = await res.blob();

  if (store) {
    try {
      await store.put(url, new Response(blob, { headers: res.headers }));
    } catch (e) {
      console.warn("Não foi possível guardar a imagem em cache:", e);
    }
  }

  return blob;
}

// Apaga todas as imagens guardadas localmente (botão de configurações). Não
// afeta nada na nuvem — só libera espaço neste aparelho; as imagens voltam a
// ser baixadas normalmente na próxima exibição.
export async function clearAllImageCache() {
  if (typeof caches === "undefined") return;
  try {
    await caches.delete(CACHE_NAME);
  } catch (e) {
    console.warn("Não foi possível limpar o cache de imagens:", e);
  }
}

// Hook: dado uma URL remota (pública, já versionada com ?v=...), devolve uma
// URL local (blob:) pronta pra usar num <img src>. Baixa e cacheia uma única
// vez por versão; nas próximas montagens do componente, serve direto do
// Cache Storage — 0 egress.
export function useCachedImageUrl(remoteUrl) {
  const [localUrl, setLocalUrl] = useState(null);
  const objectUrlRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setLocalUrl(null);

    if (!remoteUrl) return;

    // URLs locais (blob:, data:) não passam pelo Storage — não custam
    // egress, então não há motivo pra cachear; usa direto.
    if (remoteUrl.startsWith("blob:") || remoteUrl.startsWith("data:")) {
      setLocalUrl(remoteUrl);
      return;
    }

    (async () => {
      try {
        const blob = await getCachedImageBlob(remoteUrl);
        if (cancelled) return;
        const objUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objUrl;
        setLocalUrl(objUrl);
      } catch (e) {
        console.warn("Falha ao carregar imagem cacheada:", e);
        if (!cancelled) setLocalUrl(remoteUrl); // fallback: <img> busca direto
      }
    })();

    return () => { cancelled = true; };
  }, [remoteUrl]);

  // Revoga a última object URL criada quando o componente desmonta de vez.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  return localUrl;
}
