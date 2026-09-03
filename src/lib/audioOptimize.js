// Recompressão de áudios de estudo (gravados com MediaRecorder, geralmente
// audio/webm;opus no bitrate padrão do navegador, ~128kbps — muito mais do
// que voz precisa). A ideia: decodificar o áudio pra PCM, tocar ele de
// volta em tempo real ligado a um MediaStreamDestination, e regravar com
// MediaRecorder num bitrate bem menor. É "lossy" tecnicamente (perde um
// pouco de faixa de frequência), mas pra voz falada isso é imperceptível —
// bem diferente de recomprimir imagem ou texto, aqui não existe atalho
// realmente sem perdas porque o arquivo original já é opus com perdas.
//
// Só substitui o áudio se o resultado realmente ficar menor; senão devolve
// null e quem chama mantém o original.

const DEFAULT_TARGET_BPS = 32000; // 32kbps: bom o suficiente pra voz

export function recordingAudioBitsPerSecond() {
  return DEFAULT_TARGET_BPS;
}

export async function recompressAudioBlob(blob, targetBitsPerSecond = DEFAULT_TARGET_BPS) {
  if (!blob || blob.size === 0) return null;
  if (typeof window === "undefined" || !window.AudioContext && !window.webkitAudioContext) return null;
  const AudioContextCls = window.AudioContext || window.webkitAudioContext;
  let ctx;
  try {
    const arrayBuffer = await blob.arrayBuffer();
    ctx = new AudioContextCls();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

    const dest = ctx.createMediaStreamDestination();
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(dest);

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : (MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "");
    const mr = new MediaRecorder(dest.stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: targetBitsPerSecond,
    });

    const chunks = [];
    const done = new Promise((resolve, reject) => {
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      mr.onstop = resolve;
      mr.onerror = reject;
    });

    mr.start();
    source.start(0);
    // Regravar precisa acontecer em tempo real (não dá pra acelerar um
    // MediaStreamDestination), então esperamos a duração do áudio + uma
    // margem pequena antes de parar.
    const waitMs = Math.ceil(audioBuffer.duration * 1000) + 200;
    source.onended = () => { try { mr.stop(); } catch (e) { /* já parado */ } };
    await new Promise(r => setTimeout(r, waitMs));
    if (mr.state !== "inactive") { try { mr.stop(); } catch (e) { /* ignore */ } }
    await done;

    const newBlob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
    if (newBlob.size === 0 || newBlob.size >= blob.size) return null;
    return newBlob;
  } catch (e) {
    console.warn("[audioOptimize] não deu pra recomprimir este áudio:", e);
    return null;
  } finally {
    if (ctx) { try { await ctx.close(); } catch (e) { /* ignore */ } }
  }
}
