import { supabase } from "./supabaseClient";
import { loadLocal, saveLocal } from "./storage";

// Fila de alterações feitas sem internet: o app grava na tela e no cache na hora, e envia ao Supabase quando a conexão volta.
// Cada operação é { kind: "insert" | "update" | "delete", table, id?, row?, patch? }, enviadas na ordem em que foram feitas.
const key = (uid) => `outbox:${uid}`;
const listeners = new Set();
const notify = (ev) => listeners.forEach((fn) => { try { fn(ev); } catch { /* ignora */ } });

export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
// Falha de rede (sem conexão, Wi-Fi sem internet): vale guardar na fila. Erro do banco (dado inválido, permissão) não.
export const isNetworkError = (err) => isOffline() || /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(String(err?.message || err || ""));

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const pendingCount = (uid) => (uid ? loadLocal(key(uid), []).length : 0);
export const subscribeOutbox = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function enqueue(uid, op) {
  const q = loadLocal(key(uid), []);
  q.push(op);
  saveLocal(key(uid), q);
  notify("changed");
}

let flushing = false;
export async function flushOutbox(uid) {
  if (!uid || flushing || isOffline() || !supabase) return 0;
  flushing = true;
  let sent = 0;
  try {
    const q = loadLocal(key(uid), []);
    while (q.length) {
      const op = q[0];
      let error = null;
      try {
        if (op.kind === "insert") ({ error } = await supabase.from(op.table).insert(op.row));
        else if (op.kind === "update") ({ error } = await supabase.from(op.table).update(op.patch).eq("id", op.id));
        else if (op.kind === "delete") ({ error } = await supabase.from(op.table).delete().eq("id", op.id));
      } catch (e) { error = e; }
      if (error && isNetworkError(error)) break; // conexão caiu de novo: tenta depois, sem perder a fila
      if (error) console.error("Fila offline: operação descartada", op, error); // erro do banco (ex.: já existe): não trava as demais
      q.shift();
      saveLocal(key(uid), q);
      sent++;
    }
  } finally {
    flushing = false;
    notify(sent > 0 ? "flushed" : "changed");
  }
  return sent;
}
