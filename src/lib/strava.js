import { supabase } from "./supabaseClient";
import { idbGet, idbSet, idbDelete } from "./idbStorage";

// O Strava volta para o site com ?code=...&state=strava. Capturamos isso já na
// carga do módulo (antes do roteador mexer na URL) e guardamos até o painel de
// corridas abrir e concluir a conexão.
const PENDING_KEY = "libano-strava-pending";
try {
  const q = new URLSearchParams(window.location.search);
  if (q.get("state") === "strava") {
    if (q.get("code")) {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ code: q.get("code"), scope: q.get("scope") || "" }));
    } else if (q.get("error")) {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ error: q.get("error") }));
    }
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
  }
} catch (e) { /* sem sessionStorage/URL: ignora */ }

export function hasPendingStravaCallback() {
  try { return !!sessionStorage.getItem(PENDING_KEY); } catch (e) { return false; }
}
// Mantém o retorno em memória até a conexão terminar (o React pode montar o
// painel duas vezes em desenvolvimento) e evita trocar o mesmo código duas vezes.
let taken = null;
export function takePendingStravaCallback() {
  if (taken) return taken;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    taken = raw ? JSON.parse(raw) : null;
  } catch (e) { taken = null; }
  return taken;
}
export const clearTakenStravaCallback = () => { taken = null; };

async function call(action, body = {}) {
  const { data, error } = await supabase.functions.invoke("strava", { body: { action, ...body } });
  if (error) {
    // Erros HTTP da função trazem a mensagem no corpo da resposta
    let msg = error.message;
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch (e) { /* mantém msg */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export const stravaStatus = () => call("status");
export const stravaSync = (full = false) => call("sync", { full });
const exchanges = new Map();
export const stravaExchange = (code, scope) => {
  if (!exchanges.has(code)) exchanges.set(code, call("exchange", { code, scope }));
  return exchanges.get(code);
};
export const stravaDisconnect = () => call("disconnect");

export async function stravaAuthorize() {
  const redirectUri = window.location.origin + window.location.pathname;
  const { url } = await call("auth-url", { redirectUri });
  window.location.href = url;
}

// ---- Corridas: cache no IndexedDB pra abrir instantâneo e gastar pouco egress ----
const CACHE_KEY = "libano-strava-runs-v1";
const COLS = "strava_id,name,sport_type,start_date_local,distance,moving_time,elapsed_time,elevation,avg_speed,avg_hr,max_hr,avg_cadence,polyline";

export const loadCachedRuns = () => idbGet(CACHE_KEY, null);
export const clearCachedRuns = () => idbDelete(CACHE_KEY);

export async function fetchRuns() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("strava_runs")
      .select(COLS)
      .order("start_date_local", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  await idbSet(CACHE_KEY, out);
  return out;
}

// Busca só as corridas recentes (últimos dias) e mescla no cache — evita baixar tudo de novo.
export async function refreshRuns(existing) {
  if (!existing?.length) return fetchRuns();
  const latest = existing.reduce((m, r) => (r.start_date_local > m ? r.start_date_local : m), "");
  const since = new Date(new Date(latest).getTime() - 4 * 864e5).toISOString();
  const { data, error } = await supabase
    .from("strava_runs")
    .select(COLS)
    .gte("start_date_local", since)
    .order("start_date_local", { ascending: false });
  if (error) throw error;
  const map = new Map(existing.map(r => [r.strava_id, r]));
  data.forEach(r => map.set(r.strava_id, r));
  const out = [...map.values()].sort((a, b) => String(b.start_date_local).localeCompare(String(a.start_date_local)));
  await idbSet(CACHE_KEY, out);
  return out;
}
