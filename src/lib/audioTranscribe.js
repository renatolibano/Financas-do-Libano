// Gerenciador da transcrição dos audiolivros. Roda uma tarefa por vez (fila), em um Web Worker,
// e continua mesmo com o painel fechado. Estado exposto via subscribe/getState (useSyncExternalStore).
import { getTrackBlob, getTranscript, saveTranscript } from "./audiobooks";

export const WHISPER_MODELS = [
  { id: "onnx-community/whisper-tiny", label: "Rápido (~40 MB)" },
  { id: "onnx-community/whisper-base", label: "Melhor (~80 MB)" },
];
export const TRANSCRIBE_LANGS = [
  { id: "portuguese", label: "Português" },
  { id: "english", label: "Inglês" },
  { id: "spanish", label: "Espanhol" },
  { id: "", label: "Automático" },
];

export const transcribeSupported = () =>
  typeof window !== "undefined" && typeof Worker !== "undefined" && !!(window.AudioContext || window.webkitAudioContext);

const jobKey = (bookId, trackId) => `${bookId}:${trackId}`;
let state = {};            // key -> { bookId, trackId, status, pct, loadPct, error }
const listeners = new Set();
const queue = [];
let running = null;
let worker = null;

const emit = () => listeners.forEach(f => f());
const setJob = (key, patch) => { state = { ...state, [key]: { ...(state[key] || {}), ...patch } }; emit(); };
const clearJob = (key) => { const { [key]: _x, ...rest } = state; state = rest; emit(); };
export const subscribeTranscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };
export const getTranscribeState = () => state;

// Decodifica o arquivo já em mono/16 kHz (formato que o Whisper espera).
async function decodeMono16k(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx({ sampleRate: 16000 });
  try {
    const ab = await ctx.decodeAudioData(await blob.arrayBuffer());
    const n = ab.numberOfChannels, len = ab.length;
    if (n === 1) return ab.getChannelData(0).slice();
    const out = new Float32Array(len);
    for (let c = 0; c < n; c++) { const d = ab.getChannelData(c); for (let i = 0; i < len; i++) out[i] += d[i] / n; }
    return out;
  } catch {
    throw new Error("Não consegui decodificar este áudio (arquivo muito longo para a memória do aparelho ou formato não suportado).");
  } finally { ctx.close?.().catch?.(() => {}); }
}

function runWorker(job, audio, fromSec, segments) {
  return new Promise((resolve, reject) => {
    const key = jobKey(job.bookId, job.track.id);
    let acc = segments.slice();
    worker = new Worker(new URL("./whisperWorker.js", import.meta.url), { type: "module" });
    const w = worker;
    job.cancel = () => { w.terminate(); if (worker === w) worker = null; resolve("cancelled"); };
    w.onmessage = async (e) => {
      const m = e.data;
      if (m.type === "loading") setJob(key, { status: "loading", loadPct: 0 });
      else if (m.type === "load") setJob(key, { status: "loading", loadPct: m.pct });
      else if (m.type === "slice") {
        acc = acc.concat(m.segs);
        await saveTranscript(job.bookId, job.track.id, { segments: acc, doneSec: m.doneSec, totalSec: m.totalSec, model: job.model, lang: job.lang, complete: false, updatedAt: Date.now() });
        setJob(key, { status: "running", pct: Math.round((m.doneSec / m.totalSec) * 100), doneSec: m.doneSec });
      } else if (m.type === "done") {
        const prev = await getTranscript(job.bookId, job.track.id);
        if (prev) await saveTranscript(job.bookId, job.track.id, { ...prev, complete: true, updatedAt: Date.now() });
        w.terminate(); if (worker === w) worker = null; resolve("done");
      } else if (m.type === "error") { w.terminate(); if (worker === w) worker = null; reject(new Error(m.message)); }
    };
    w.onerror = (ev) => { w.terminate(); if (worker === w) worker = null; reject(new Error(ev.message || "Falha no transcritor.")); };
    w.postMessage({ type: "run", audio, fromSec, model: job.model, lang: job.lang }, [audio.buffer]);
  });
}

async function runNext() {
  if (running) return;
  const job = queue.shift();
  if (!job) return;
  running = job;
  const key = jobKey(job.bookId, job.track.id);
  try {
    setJob(key, { status: "decoding", pct: 0, error: null });
    const blob = await getTrackBlob(job.bookId, job.track.id);
    if (!blob) throw new Error("Este capítulo não está neste aparelho. Toque em ouvi-lo primeiro para baixá-lo.");
    const prev = await getTranscript(job.bookId, job.track.id);
    const resume = prev && !prev.complete && prev.model === job.model && prev.lang === job.lang;
    const audio = await decodeMono16k(blob);
    if (job.cancelled) { setJob(key, { status: "idle" }); return; }
    const res = await runWorker(job, audio, resume ? prev.doneSec || 0 : 0, resume ? prev.segments || [] : []);
    if (res === "cancelled") setJob(key, { status: "idle" }); else clearJob(key);
  } catch (err) {
    setJob(key, { status: "error", error: String(err?.message || err) });
  } finally {
    running = null;
    runNext();
  }
}

export function transcribeTrack(bookId, track, { model, lang }) {
  const key = jobKey(bookId, track.id);
  if (state[key] && ["queued", "decoding", "loading", "running"].includes(state[key].status)) return;
  queue.push({ bookId, track, model, lang });
  setJob(key, { bookId, trackId: track.id, status: "queued", pct: 0, error: null });
  runNext();
}

export function cancelTranscribe(bookId) {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].bookId === bookId) { clearJob(jobKey(bookId, queue[i].track.id)); queue.splice(i, 1); }
  }
  if (running?.bookId === bookId) { running.cancelled = true; running.cancel?.(); }
}
