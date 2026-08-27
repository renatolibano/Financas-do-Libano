import { supabase } from "./supabaseClient";

const BUCKET = "game_images";

// Um bucket só, com prefixo por tipo dentro da pasta do usuário:
// <user_id>/item-<item_id>.jpg   (foto do jogo)
// <user_id>/group-<group_id>.jpg (capa da franquia)
// PÚBLICO, mesmo padrão de flashcard_images, shopping_images e media_images.
function itemPath(userId, itemId) {
  return `${userId}/item-${itemId}.jpg`;
}
function groupPath(userId, groupId) {
  return `${userId}/group-${groupId}.jpg`;
}

async function uploadTo(path, blob) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function uploadGameItemImage(userId, itemId, blob) {
  return uploadTo(itemPath(userId, itemId), blob);
}
export async function deleteGameItemImage(userId, itemId) {
  await supabase.storage.from(BUCKET).remove([itemPath(userId, itemId)]);
}

export async function uploadGameGroupCover(userId, groupId, blob) {
  return uploadTo(groupPath(userId, groupId), blob);
}
export async function deleteGameGroupCover(userId, groupId) {
  await supabase.storage.from(BUCKET).remove([groupPath(userId, groupId)]);
}
