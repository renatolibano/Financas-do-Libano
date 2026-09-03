// Áudios de estudo anexados a um PDF (livro ou PDF de estudo).
//
// Tudo fica 100% local, salvo no IndexedDB do navegador — nenhum upload pra
// nuvem, nenhuma chamada de rede, zero egress. Cada PDF tem uma listinha de
// metadados (nome, duração, data, quem criou) guardada numa chave, e cada
// áudio tem seu Blob guardado à parte numa outra chave, carregado só na hora
// de tocar (assim abrir o painel não precisa ler todos os áudios de uma vez).
//
// `pdfKind` existe pra não misturar áudios de "livros" com áudios de "PDFs
// de estudo" quando os dois tipos usam ids que podem colidir (ex: id 3 num
// livro e id 3 num PDF de estudo são PDFs diferentes).

import { idbGet, idbSet, idbDelete, idbListKeysWithPrefix } from "./idbStorage";
import { recompressAudioBlob } from "./audioOptimize";

function listKey(pdfKind, pdfId) {
  return `pdf_audios:${pdfKind}:${pdfId}`;
}
function blobKey(pdfKind, pdfId, audioId) {
  return `pdf_audio_blob:${pdfKind}:${pdfId}:${audioId}`;
}

export async function listPdfAudios(pdfKind, pdfId) {
  if (pdfId == null) return [];
  return await idbGet(listKey(pdfKind, pdfId), []);
}

export async function getPdfAudioBlob(pdfKind, pdfId, audioId) {
  return await idbGet(blobKey(pdfKind, pdfId, audioId), null);
}

export async function addPdfAudio(pdfKind, pdfId, { blob, name, durationSec, source }) {
  const list = await listPdfAudios(pdfKind, pdfId);
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const meta = {
    id,
    name: (name || "Áudio sem nome").trim() || "Áudio sem nome",
    createdAt: new Date().toISOString(),
    durationSec: Math.round(durationSec || 0),
    mime: blob.type || "audio/webm",
    source: source || "gravado", // "gravado" | "importado"
  };
  const ok = await idbSet(blobKey(pdfKind, pdfId, id), blob);
  if (!ok) return null; // estourou a cota do IndexedDB — não sobra nada pela metade
  const next = [meta, ...list];
  await idbSet(listKey(pdfKind, pdfId), next);
  return meta;
}

export async function renamePdfAudio(pdfKind, pdfId, audioId, name) {
  const list = await listPdfAudios(pdfKind, pdfId);
  const next = list.map(a => a.id === audioId ? { ...a, name: name.trim() || a.name } : a);
  await idbSet(listKey(pdfKind, pdfId), next);
  return next;
}

export async function deletePdfAudio(pdfKind, pdfId, audioId) {
  const list = await listPdfAudios(pdfKind, pdfId);
  const next = list.filter(a => a.id !== audioId);
  await idbSet(listKey(pdfKind, pdfId), next);
  await idbDelete(blobKey(pdfKind, pdfId, audioId));
  return next;
}

// Recomprime um áudio já gravado (bitrate mais baixo) e substitui o Blob no
// IndexedDB se o resultado ficar menor. Usado pela ação "Otimizar áudios
// gravados" nas Configurações, pra ganhar espaço nos áudios antigos que
// foram gravados antes do bitrate default ser reduzido.
export async function optimizeExistingPdfAudio(pdfKind, pdfId, audioId) {
  const blob = await getPdfAudioBlob(pdfKind, pdfId, audioId);
  if (!blob) return { changed: false, savedBytes: 0 };
  const smaller = await recompressAudioBlob(blob);
  if (!smaller) return { changed: false, savedBytes: 0 };
  const ok = await idbSet(blobKey(pdfKind, pdfId, audioId), smaller);
  if (!ok) return { changed: false, savedBytes: 0 };
  const list = await listPdfAudios(pdfKind, pdfId);
  const next = list.map(a => a.id === audioId ? { ...a, mime: smaller.type || a.mime } : a);
  await idbSet(listKey(pdfKind, pdfId), next);
  return { changed: true, savedBytes: blob.size - smaller.size };
}

// Varre todos os PDFs/livros que têm áudio anexado neste aparelho e tenta
// recomprimir cada gravação. Usado pelo botão "Otimizar áudios gravados"
// nas Configurações. Devolve o total de bytes economizados e quantos
// áudios de fato ficaram menores.
export async function optimizeAllPdfAudios(onProgress) {
  const listKeys = await idbListKeysWithPrefix("pdf_audios:");
  let savedBytes = 0;
  let changedCount = 0;
  let total = 0;
  for (const key of listKeys) {
    const [, pdfKind, pdfId] = key.split(":");
    const list = await idbGet(key, []);
    total += list.length;
    for (const meta of list) {
      const result = await optimizeExistingPdfAudio(pdfKind, pdfId, meta.id);
      if (result.changed) { savedBytes += result.savedBytes; changedCount++; }
      onProgress?.({ done: changedCount, total });
    }
  }
  return { savedBytes, changedCount, total };
}
