import { supabase } from "./supabaseClient";

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
  return path;
}

export async function downloadStudyPdfFile(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  return data; // Blob
}

export async function deleteStudyPdfFile(path) {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}
