import { idbGet, idbSet, idbDelete } from "./idbStorage";
import { downloadBlob } from "./wordExport";

// Guarda no aparelho (IndexedDB) o arquivo EXATO que foi importado no Word (PDF, DOCX, etc.), para poder baixá-lo de volta
// idêntico, byte por byte — sem passar pela conversão do editor. Nada é enviado à nuvem.
const metaKey = (docId) => `word_originals:${docId}`;
const fileKey = (docId, id) => `word_original_file:${docId}:${id}`;

export async function saveWordOriginal(docId, file) {
  if (!docId || !file) return false;
  const bytes = new Blob([await file.arrayBuffer()], { type: file.type || "application/octet-stream" });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const list = await idbGet(metaKey(docId), []);
  const same = list.find((x) => x.name === file.name); // reimportar o mesmo nome substitui o anterior
  const ok = await idbSet(fileKey(docId, id), bytes);
  if (!ok) return false;
  if (same) await idbDelete(fileKey(docId, same.id));
  const next = list.filter((x) => x.name !== file.name).concat({ id, name: file.name, type: file.type || "", size: file.size, at: Date.now() });
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
