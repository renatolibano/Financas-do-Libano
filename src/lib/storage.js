import { useState, useEffect } from "react";

const STORAGE_PREFIX = "libano:";

export function loadLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn("Não foi possível carregar", key, e);
    return fallback;
  }
}

export function saveLocal(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn("Não foi possível salvar", key, e);
  }
}

export function clearLocal() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(STORAGE_PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}

export function usePersistentState(key, fallback) {
  const [state, setState] = useState(() => loadLocal(key, fallback));
  useEffect(() => {
    saveLocal(key, state);
  }, [key, state]);
  return [state, setState];
}
