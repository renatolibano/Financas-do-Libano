import { supabase } from "./supabaseClient";

const BUCKET = "workout_images";

// <user_id>/group-<folder_id>.jpg — capa da pasta de treino.
// PÚBLICO, mesmo padrão dos outros buckets de imagem do app.
function groupPath(userId, folderId) {
  return `${userId}/group-${folderId}.jpg`;
}

export async function uploadWorkoutFolderCover(userId, folderId, blob) {
  const path = groupPath(userId, folderId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function deleteWorkoutFolderCover(userId, folderId) {
  await supabase.storage.from(BUCKET).remove([groupPath(userId, folderId)]);
}
