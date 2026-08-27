import { supabase } from "./supabaseClient";

const BUCKET = "flashcard_images";

// Cada imagem de flashcard fica em <user_id>/<card_id>.jpg — pasta por usuário,
// igual aos outros buckets (books, study_pdfs). Diferente deles, esse bucket é
// PÚBLICO: a imagem é só uma ilustração do cartão (não é dado sensível), e
// assim o navegador guarda a URL no cache HTTP normal em vez de rebaixar o
// mesmo base64 toda vez que a lista é carregada (ver schema.sql).
export function flashcardImagePath(userId, cardId) {
  return `${userId}/${cardId}.jpg`;
}

// Recebe um Blob (já redimensionado/comprimido pelo chamador) e devolve a URL
// pública definitiva pra salvar no campo `image` do cartão.
export async function uploadFlashcardImage(userId, cardId, blob) {
  const path = flashcardImagePath(userId, cardId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Adiciona um parâmetro pra "quebrar" o cache do navegador quando a mesma
  // foto é trocada (upsert mantém o mesmo path, então sem isso o navegador
  // continuaria mostrando a imagem antiga em cache).
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function deleteFlashcardImage(userId, cardId) {
  const path = flashcardImagePath(userId, cardId);
  await supabase.storage.from(BUCKET).remove([path]);
}
