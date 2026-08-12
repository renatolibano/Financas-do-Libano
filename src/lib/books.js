import { supabase } from "./supabaseClient";

const BUCKET = "books";

// Cada PDF fica guardado em uma pasta por usuário: <user_id>/<book_id>.pdf
// As políticas do bucket (em schema.sql) garantem que só o dono acessa.
export function bookFilePath(userId, bookId) {
  return `${userId}/${bookId}.pdf`;
}

export async function uploadBookFile(userId, bookId, file) {
  const path = bookFilePath(userId, bookId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function downloadBookFile(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  return data; // Blob
}

export async function deleteBookFile(path) {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}
