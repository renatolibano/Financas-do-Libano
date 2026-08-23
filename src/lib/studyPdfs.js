import { supabase } from "./supabaseClient";
import { downloadPdfCached, invalidatePdfCache } from "./pdfCache";

const BUCKET = "study_pdfs";

// Cada PDF de estudo fica guardado em uma pasta por usuário: <user_id>/<pdf_id>.pdf
// As políticas do bucket (em schema.sql) garantem que só o dono acessa.
// Bucket separado do de "Livros" para manter as duas estantes independentes.
export function studyPdfFilePath(userId, pdfId) {
  return `${userId}/${pdfId}.pdf`;
}

export async function uploadStudyPdfFile(userId, pdfId, file) {
  const path = studyPdfFilePath(userId, pdfId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw error;
  // O arquivo mudou de conteúdo — descarta a cópia local antiga pra não
  // servir a versão desatualizada nesta mesma sessão.
  await invalidatePdfCache(BUCKET, path);
  return path;
}

// Data de modificação do arquivo no Storage, usada só pra saber se o PDF em
// cache local ainda é válido (evita rebaixar o arquivo à toa).
async function getStudyPdfFileMeta(path) {
  const idx = path.lastIndexOf("/");
  const folder = idx >= 0 ? path.slice(0, idx) : "";
  const filename = idx >= 0 ? path.slice(idx + 1) : path;
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, { search: filename, limit: 1 });
  if (error || !data || !data.length) return null;
  const info = data.find(f => f.name === filename) || data[0];
  return info?.updated_at || null;
}

export async function downloadStudyPdfFile(path) {
  return downloadPdfCached({
    bucket: BUCKET,
    path,
    downloadFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).download(path);
      if (error) throw error;
      return data; // Blob
    },
    getMetaFn: () => getStudyPdfFileMeta(path),
  });
}

export async function deleteStudyPdfFile(path) {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
  await invalidatePdfCache(BUCKET, path);
}
