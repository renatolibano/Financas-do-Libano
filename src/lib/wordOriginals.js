import { idbGet, idbSet, idbDelete } from "./idbStorage";
import { downloadBlob, safeFileName } from "./wordExport";

// Guarda no aparelho (IndexedDB) o arquivo EXATO que foi importado no Word (PDF, DOCX, etc.), para poder baixá-lo de volta
// idêntico, byte por byte — sem passar pela conversão do editor. Nada é enviado à nuvem.
const metaKey = (docId) => `word_originals:${docId}`;
const fileKey = (docId, id) => `word_original_file:${docId}:${id}`;

// Assinatura curta do conteúdo do editor: se continuar igual à da importação, o documento não foi editado.
export function sigOf(str) {
  let h = 5381;
  const t = String(str || "");
  for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) | 0;
  return t.length + ":" + (h >>> 0).toString(36);
}

export async function setWordOriginalSig(docId, id, sig) {
  const list = await idbGet(metaKey(docId), []);
  return idbSet(metaKey(docId), list.map((x) => (x.id === id ? { ...x, sig } : x)));
}

export async function saveWordOriginal(docId, file, sig) {
  if (!docId || !file) return false;
  const bytes = new Blob([await file.arrayBuffer()], { type: file.type || "application/octet-stream" });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const list = await idbGet(metaKey(docId), []);
  const same = list.find((x) => x.name === file.name); // reimportar o mesmo nome substitui o anterior
  const ok = await idbSet(fileKey(docId, id), bytes);
  if (!ok) return false;
  if (same) await idbDelete(fileKey(docId, same.id));
  const next = list.filter((x) => x.name !== file.name).concat({ id, name: file.name, type: file.type || "", size: file.size, at: Date.now(), ...(sig ? { sig } : {}) });
  return idbSet(metaKey(docId), next);
}

export const listWordOriginals = (docId) => (docId ? idbGet(metaKey(docId), []) : Promise.resolve([]));

export async function downloadWordOriginal(docId, meta) {
  const blob = await idbGet(fileKey(docId, meta.id), null);
  if (!blob) throw new Error("O arquivo original não está salvo neste aparelho.");
  downloadBlob(new Blob([blob], { type: meta.type || "application/octet-stream" }), meta.name);
}

export async function deleteWordOriginals(docId) {
  const list = await idbGet(metaKey(docId), []);
  for (const m of list) await idbDelete(fileKey(docId, m.id));
  await idbDelete(metaKey(docId));
}

// PDF do documento montado só com PDFs importados e ainda sem edições: junta os PDFs ORIGINAIS na ordem em que entraram
// (as páginas são copiadas como estão, sem reconverter). Devolve false quando não dá (então o app gera o PDF pelo editor).
export async function downloadPdfFromOriginals(docId, originals, expectedPages, title) {
  const ordered = (originals || []).slice().sort((a, b) => a.at - b.at);
  if (!ordered.length || !ordered.every((o) => /\.pdf$/i.test(o.name))) return false;
  if (ordered.length === 1) { await downloadWordOriginal(docId, ordered[0]); return true; } // exatamente o arquivo importado
  try {
    const { PDFDocument } = await import("pdf-lib");
    const out = await PDFDocument.create();
    let total = 0;
    for (const o of ordered) {
      const blob = await idbGet(fileKey(docId, o.id), null);
      if (!blob) return false;
      const src = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((pg) => out.addPage(pg));
      total += pages.length;
    }
    if (expectedPages && total !== expectedPages) return false; // o documento não bate com os originais (páginas apagadas/movidas)
    downloadBlob(new Blob([await out.save()], { type: "application/pdf" }), `${safeFileName(title)}.pdf`);
    return true;
  } catch (e) {
    console.warn("Não foi possível juntar os PDFs originais", e);
    return false;
  }
}
