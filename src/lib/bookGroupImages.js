import { supabase } from "./supabaseClient";

const BUCKET = "book_group_images";

// <user_id>/group-<group_id>.jpg — capa da pasta de livros.
// PÚBLICO, mesmo padrão dos outros buckets de imagem do app.
// (Os livros individuais já usam listSelect + cover_thumb pequeno — só as
// PASTAS ficaram de fora dessa otimização até agora.)
function groupPath(userId, groupId) {
  return `${userId}/group-${groupId}.jpg`;
}

export async function uploadBookGroupCover(userId, groupId, blob) {
  const path = groupPath(userId, groupId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function deleteBookGroupCover(userId, groupId) {
  await supabase.storage.from(BUCKET).remove([groupPath(userId, groupId)]);
}
