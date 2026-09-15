// Prints (imagens) de estudo anexados a um PDF (livro ou PDF de estudo).
//
// Tudo fica 100% local, salvo no IndexedDB do navegador — nenhum upload pra
// nuvem, nenhuma chamada de rede, zero egress. Mesmo esquema do
// lib/pdfAudios.js: uma listinha de metadados (nome, dimensões, data)
// guardada numa chave, e cada imagem tem seu Blob (já comprimido) guardado
// à parte, carregado só na hora de exibir/baixar.
//
// `pdfKind` existe pra não misturar prints de "livros" com prints de "PDFs
// de estudo" quando os dois tipos usam ids que podem colidir.

import { idbGet, idbSet, idbDelete } from "./idbStorage";

function listKey(pdfKind, pdfId) {
  return `pdf_prints:${pdfKind}:${pdfId}`;
}
function blobKey(pdfKind, pdfId, printId) {
  return `pdf_print_blob:${pdfKind}:${pdfId}:${printId}`;
}

export async function listPdfPrints(pdfKind, pdfId) {
  if (pdfId == null) return [];
  return await idbGet(listKey(pdfKind, pdfId), []);
}

export async function getPdfPrintBlob(pdfKind, pdfId, printId) {
  return await idbGet(blobKey(pdfKind, pdfId, printId), null);
}

export async function addPdfPrint(pdfKind, pdfId, { blob, name, width, height }) {
  const list = await listPdfPrints(pdfKind, pdfId);
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const meta = {
    id,
    name: (name || "Print sem nome").trim() || "Print sem nome",
    createdAt: new Date().toISOString(),
    width: width || 0,
    height: height || 0,
    mime: blob.type || "image/jpeg",
  };
  const ok = await idbSet(blobKey(pdfKind, pdfId, id), blob);
  if (!ok) return null; // estourou a cota do IndexedDB — não sobra nada pela metade
  const next = [meta, ...list];
  await idbSet(listKey(pdfKind, pdfId), next);
  return meta;
}

export async function renamePdfPrint(pdfKind, pdfId, printId, name) {
  const list = await listPdfPrints(pdfKind, pdfId);
  const next = list.map(a => a.id === printId ? { ...a, name: name.trim() || a.name } : a);
  await idbSet(listKey(pdfKind, pdfId), next);
  return next;
}

export async function deletePdfPrint(pdfKind, pdfId, printId) {
  const list = await listPdfPrints(pdfKind, pdfId);
  const next = list.filter(a => a.id !== printId);
  await idbSet(listKey(pdfKind, pdfId), next);
  await idbDelete(blobKey(pdfKind, pdfId, printId));
  return next;
}
