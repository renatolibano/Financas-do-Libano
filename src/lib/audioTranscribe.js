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

// Tamanho de cada parte decodificada de uma vez (30 min em mono/16 kHz ≈ 115 MB de memória).
// Arquivos longos (ex.: 13 h) são lidos e transcritos parte por parte, sem decodificar tudo junto.
const PART_SEC = 1800;
const SR = 16000;

async function resampleTo16k(mono, sr) {
  if (sr === SR) return mono;
  const off = new OfflineAudioContext(1, Math.ceil((mono.length * SR) / sr), SR);
  const buf = off.createBuffer(1, mono.length, sr);
  buf.copyToChannel(mono, 0);
  const src = off.createBufferSource();
  src.buffer = buf; src.connect(off.destination); src.start();
  return (await off.startRendering()).getChannelData(0);
}

// Abre o arquivo e devolve { duration, decode(from, to) -> Float32Array mono 16 kHz, close() }.
async function openSource(blob, knownDur) {
  try {
    const { Input, BlobSource, ALL_FORMATS, AudioBufferSink } = await import("mediabunny");
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryAudioTrack();
    if (track && (await track.canDecode())) {
      const duration = knownDur > 0 ? knownDur : await input.computeDuration();
      const sink = new AudioBufferSink(track);
      return {
        duration,
        close: () => input.dispose?.(),
        async decode(from, to) {
          const out = new Float32Array(Math.ceil((to - from) * SR));
          let filled = 0, pend = [], pendLen = 0, pendSr = SR;
          const flush = async () => {
            if (!pendLen) return;
            const mono = new Float32Array(pendLen);
            let o = 0; for (const c of pend) { mono.set(c, o); o += c.length; }
            pend = []; pendLen = 0;
            const rs = await resampleTo16k(mono, pendSr);
            const n = Math.min(rs.length, out.length - filled);
            if (n > 0) out.set(rs.subarray(0, n), filled);
            filled += n;
          };
          for await (const { buffer } of sink.buffers(from, to)) {
            const ch = buffer.numberOfChannels, len = buffer.length;
            const mono = new Float32Array(len);
            for (let c = 0; c < ch; c++) { const d = buffer.getChannelData(c); for (let i = 0; i < len; i++) mono[i] += d[i] / ch; }
            pendSr = buffer.sampleRate; pend.push(mono); pendLen += len;
            if (pendLen >= pendSr * 60) await flush();
            if (filled >= out.length) break;
          }
          await flush();
          return filled < out.length ? out.slice(0, filled) : out;
        },
      };
    }
    input.dispose?.();
  } catch { /* cai para o método antigo */ }
  // Navegador sem suporte ao leitor por partes: decodifica tudo de uma vez (só serve para arquivos menores).
  if (blob.size > 250 * 1024 * 1024) throw new Error("Este navegador não consegue ler este áudio longo por partes. Tente no Chrome ou Safari atualizados.");
  let full;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx({ sampleRate: SR });
    try {
      const ab = await ctx.decodeAudioData(await blob.arrayBuffer());
      const n = ab.numberOfChannels, len = ab.length;
      full = new Float32Array(len);
      for (let c = 0; c < n; c++) { const d = ab.getChannelData(c); for (let i = 0; i < len; i++) full[i] += d[i] / n; }
    } finally { ctx.close?.().catch?.(() => {}); }
  } catch {
    throw new Error("Não consegui decodificar este áudio (formato não suportado pelo navegador).");
  }
  return { duration: full.length / SR, close: () => {}, decode: async (from, to) => full.slice(Math.floor(from * SR), Math.floor(to * SR)) };
}

function runWorker(job, source, fromSec, segments) {
  return new Promise((resolve, reject) => {
    const key = jobKey(job.bookId, job.track.id);
    const total = source.duration;
    let acc = segments.slice();
    let cursor = fromSec, lastDone = fromSec, ended = false;
    const w = new Worker(new URL("./whisperWorker.js", import.meta.url), { type: "module" });
    worker = w;
    const finish = (fn, v) => { if (ended) return; ended = true; w.terminate(); if (worker === w) worker = null; source.close(); fn(v); };
    job.cancel = () => finish(resolve, "cancelled");

    const nextPart = async () => {
      try {
        if (cursor >= total - 1) {
          const prev = await getTranscript(job.bookId, job.track.id);
          if (prev) await saveTranscript(job.bookId, job.track.id, { ...prev, complete: true, updatedAt: Date.now() });
          finish(resolve, "done");
          return;
        }
        setJob(key, { status: "decoding" });
        const audio = await source.decode(cursor, Math.min(cursor + PART_SEC, total));
        if (ended || job.cancelled) return;
        if (audio.length < SR) { cursor = total; nextPart(); return; }
        w.postMessage({ type: "run", audio, baseSec: cursor, model: job.model, lang: job.lang }, [audio.buffer]);
      } catch (err) { finish(reject, err); }
    };

    w.onmessage = async (e) => {
      const m = e.data;
      if (m.type === "loading") setJob(key, { status: "loading", loadPct: 0 });
      else if (m.type === "load") setJob(key, { status: "loading", loadPct: m.pct });
      else if (m.type === "slice") {
        acc = acc.concat(m.segs);
        lastDone = m.doneSec;
        await saveTranscript(job.bookId, job.track.id, { segments: acc, doneSec: m.doneSec, totalSec: total, model: job.model, lang: job.lang, complete: false, updatedAt: Date.now() });
        setJob(key, { status: "running", pct: Math.min(99, Math.round((m.doneSec / total) * 100)), doneSec: m.doneSec });
      } else if (m.type === "done") { cursor = lastDone; nextPart(); }
      else if (m.type === "error") finish(reject, new Error(m.message));
    };
    w.onerror = (ev) => finish(reject, new Error(ev.message || "Falha no transcritor."));
    nextPart();
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
    const source = await openSource(blob, job.track.dur);
    if (job.cancelled) { source.close(); setJob(key, { status: "idle" }); return; }
    const res = await runWorker(job, source, resume ? prev.doneSec || 0 : 0, resume ? prev.segments || [] : []);
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
