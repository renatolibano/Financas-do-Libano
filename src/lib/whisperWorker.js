// Web Worker: transcreve áudio (mono, 16 kHz) com Whisper rodando no próprio aparelho.
// Processa em fatias de 5 min e devolve os trechos com tempo absoluto, para o app salvar
// o progresso e poder continuar de onde parou.
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;

const SR = 16000;
const SLICE = 300 * SR;
let asr = null;
let asrKey = "";
const post = (m) => self.postMessage(m);

async function load(model) {
  let device = "wasm";
  try { if (self.navigator?.gpu && await self.navigator.gpu.requestAdapter()) device = "webgpu"; } catch { /* sem WebGPU */ }
  const key = model + ":" + device;
  if (asr && asrKey === key) return asr;
  asr = null;
  const progress_callback = (p) => { if (p.status === "progress" && typeof p.progress === "number") post({ type: "load", pct: p.progress }); };
  const attempts = device === "webgpu"
    ? [{ device, dtype: { encoder_model: "fp32", decoder_model_merged: "q4" } }, { device: "wasm", dtype: "q8" }, { device: "wasm", dtype: "fp32" }]
    : [{ device, dtype: "q8" }, { device, dtype: "fp32" }];
  let lastErr;
  for (const o of attempts) {
    try { asr = await pipeline("automatic-speech-recognition", model, { ...o, progress_callback }); asrKey = key; return asr; }
    catch (e) { lastErr = e; }
  }
  throw lastErr;
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type !== "run") return;
  try {
    post({ type: "loading" });
    const pipe = await load(m.model);
    const audio = m.audio;
    const total = audio.length;
    let start = Math.floor((m.fromSec || 0) * SR);
    while (start < total) {
      const end = Math.min(start + SLICE, total);
      const out = await pipe(audio.slice(start, end), {
        chunk_length_s: 30, stride_length_s: 5, return_timestamps: true,
        ...(m.lang ? { language: m.lang, task: "transcribe" } : {}),
      });
      const off = start / SR, sliceEnd = end / SR;
      const segs = (out.chunks || [])
        .map(c => ({ s: off + (c.timestamp?.[0] ?? 0), e: off + (c.timestamp?.[1] ?? (sliceEnd - off)), t: String(c.text || "").trim() }))
        .filter(x => x.t);
      post({ type: "slice", segs, doneSec: sliceEnd, totalSec: total / SR });
      start = end;
    }
    post({ type: "done" });
  } catch (err) {
    post({ type: "error", message: String(err?.message || err) });
  }
};
