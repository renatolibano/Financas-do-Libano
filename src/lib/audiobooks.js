import { useCallback, useRef } from "react";
import { useEntity } from "./useEntity";
import { supabase } from "./supabaseClient";
import { idbGet, idbSet, idbDelete } from "./idbStorage";
import { loadLocal, saveLocal } from "./storage";
import { currentMonthKey } from "./readingStats";

// Os arquivos de áudio ficam só no IndexedDB do aparelho (zero egress, igual
// aos áudios de estudo). O que sincroniza entre aparelhos é só o cadastro:
// título, capítulos, posição, marcadores e status.
const trackKey = (bookId, trackId) => `audiobook_blob:${bookId}:${trackId}`;
const filesKey = (bookId) => `audiobook_files:${bookId}`;
const posKey = (bookId) => `audiobook-pos:${bookId}`;

// Cópia na nuvem (bucket privado "audiobooks"): permite ouvir em outro aparelho.
// Cada aparelho baixa um capítulo só quando for tocá-lo e guarda no IndexedDB,
// então o egress acontece uma única vez por aparelho/capítulo.
const BUCKET = "audiobooks";
const cloudPath = (userId, bookId, trackId) => `${userId}/${bookId}/${trackId}`;

// O Supabase limita o tamanho de CADA arquivo (50 MB no plano gratuito). Capítulos maiores que isso
// são enviados em partes de 40 MB (`<id>.p0000`, `<id>.p0001`...) e remontados ao baixar.
// Capítulos pequenos continuam sendo um único arquivo (`<id>`), como antes.
const CLOUD_CHUNK = 40 * 1024 * 1024;
const partPath = (userId, bookId, trackId, i) => `${cloudPath(userId, bookId, trackId)}.p${String(i).padStart(4, "0")}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function withRetry(fn) {
  let err;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fn();
    if (!r.error) return r;
    err = r.error;
    await sleep(800 * (attempt + 1));
  }
  throw err;
}

// Devolve o nº de partes (0 = arquivo único). onProgress(feitas, total) só é chamado quando há partes.
export async function uploadTrackToCloud(userId, bookId, trackId, blob, onProgress) {
  const contentType = blob.type || "audio/mpeg";
  if (blob.size <= CLOUD_CHUNK) {
    const { error } = await supabase.storage.from(BUCKET).upload(cloudPath(userId, bookId, trackId), blob, { contentType, upsert: true });
    if (error) throw error;
    return 0;
  }
  const n = Math.ceil(blob.size / CLOUD_CHUNK);
  for (let i = 0; i < n; i++) {
    const part = blob.slice(i * CLOUD_CHUNK, (i + 1) * CLOUD_CHUNK, contentType);
    await withRetry(() => supabase.storage.from(BUCKET).upload(partPath(userId, bookId, trackId, i), part, { contentType: "application/octet-stream", upsert: true }));
    onProgress?.(i + 1, n);
  }
  return n;
}

// `track` = objeto do capítulo ({ id, cloudParts?, cloudType? }).
export async function downloadTrackFromCloud(userId, bookId, track, onProgress) {
  const parts = track.cloudParts || 0;
  if (!parts) {
    const { data, error } = await supabase.storage.from(BUCKET).download(cloudPath(userId, bookId, track.id));
    if (error) throw error;
    return data;
  }
  const blobs = [];
  for (let i = 0; i < parts; i++) {
    const { data } = await withRetry(() => supabase.storage.from(BUCKET).download(partPath(userId, bookId, track.id, i)));
    blobs.push(data);
    onProgress?.(i + 1, parts);
  }
  return new Blob(blobs, { type: track.cloudType || "audio/mpeg" });
}

export async function deleteCloudTracks(userId, bookId, trackIds) {
  if (!userId || !trackIds?.length) return;
  const folder = `${userId}/${bookId}`;
  const paths = trackIds.map(id => `${folder}/${id}`);
  const { data } = await supabase.storage.from(BUCKET).list(folder, { limit: 1000 });
  for (const f of data || []) if (trackIds.some(id => f.name.startsWith(id + ".p"))) paths.push(`${folder}/${f.name}`);
  await supabase.storage.from(BUCKET).remove(paths);
}

export const getLocalTrackIds = (bookId) => idbGet(filesKey(bookId), []);
export const getTrackBlob = (bookId, trackId) => idbGet(trackKey(bookId, trackId), null);

export async function saveTrackBlob(bookId, trackId, blob) {
  const ok = await idbSet(trackKey(bookId, trackId), blob);
  if (!ok) return false;
  const ids = await idbGet(filesKey(bookId), []);
  if (!ids.includes(trackId)) await idbSet(filesKey(bookId), [...ids, trackId]);
  return true;
}

// Transcrição (texto com tempos) de cada capítulo: também só no aparelho.
const transcriptKey = (bookId, trackId) => `audiobook_transcript:${bookId}:${trackId}`;
export const getTranscript = (bookId, trackId) => idbGet(transcriptKey(bookId, trackId), null);
export const saveTranscript = (bookId, trackId, data) => idbSet(transcriptKey(bookId, trackId), data);
export const deleteTranscript = (bookId, trackId) => idbDelete(transcriptKey(bookId, trackId));

export async function deleteLocalFiles(bookId) {
  const ids = await idbGet(filesKey(bookId), []);
  for (const id of ids) { await idbDelete(trackKey(bookId, id)); await idbDelete(transcriptKey(bookId, id)); }
  await idbDelete(filesKey(bookId));
}

export const saveLocalPos = (bookId, track, pos) => saveLocal(posKey(bookId), { track, pos, ts: Date.now() });
export const loadLocalPos = (bookId) => loadLocal(posKey(bookId), null);

export function readAudioDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    const done = (d) => { URL.revokeObjectURL(url); resolve(Number.isFinite(d) ? d : 0); };
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(0);
    a.src = url;
  });
}

export function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0"), rr = String(r).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${rr}` : `${mm}:${rr}`;
}

export function fmtHuman(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`;
  return m > 0 ? `${m}min` : (s > 0 ? "<1min" : "—");
}

// Capa pequena (JPEG base64) a partir de uma imagem escolhida.
export async function imageToCoverThumb(file, maxSide = 360) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally { URL.revokeObjectURL(url); }
}

// Total por mês (tempo ouvido e audiolivros concluídos) — uma linha por mês,
// mesmo esquema de reading_stats.
export function useAudioStats(session, enabled = true) {
  const entity = useEntity("audio_stats", [], session, "desc", { enabled });
  const { data, add, update } = entity;
  const dataRef = useRef(data);
  dataRef.current = data;
  const chain = useRef(Promise.resolve());
  const bump = useCallback((deltas) => {
    chain.current = chain.current.then(async () => {
      const month = currentMonthKey();
      const row = dataRef.current.find(r => r.month === month);
      const patch = {
        seconds: (row?.seconds || 0) + (deltas.seconds || 0),
        completed: (row?.completed || 0) + (deltas.completed || 0),
        updated_at: new Date().toISOString(),
      };
      if (row) await update(row.id, patch); else await add({ month, ...patch });
      await new Promise(r => setTimeout(r, 80)); // deixa o estado assentar antes da próxima soma
    }).catch(e => console.error(e));
    return chain.current;
  }, [add, update]);
  const current = data.find(r => r.month === currentMonthKey()) || { seconds: 0, completed: 0 };
  const totalSeconds = data.reduce((n, r) => n + (r.seconds || 0), 0);
  return { ...entity, bump, current, totalSeconds };
}
