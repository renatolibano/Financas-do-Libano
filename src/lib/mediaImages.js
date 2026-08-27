import { supabase } from "./supabaseClient";

const BUCKET = "media_images";

// Um bucket só, com prefixo por tipo dentro da pasta do usuário:
// <user_id>/item-<item_id>.jpg   (foto de filme/série)
// <user_id>/group-<group_id>.jpg (capa de franquia/universo)
// PÚBLICO, mesmo padrão de flashcard_images e shopping_images.
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
  // Quebra o cache do navegador quando a mesma foto é trocada (upsert mantém o mesmo path).
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function uploadMediaItemImage(userId, itemId, blob) {
  return uploadTo(itemPath(userId, itemId), blob);
}
export async function deleteMediaItemImage(userId, itemId) {
  await supabase.storage.from(BUCKET).remove([itemPath(userId, itemId)]);
}

export async function uploadMediaGroupCover(userId, groupId, blob) {
  return uploadTo(groupPath(userId, groupId), blob);
}
export async function deleteMediaGroupCover(userId, groupId) {
  await supabase.storage.from(BUCKET).remove([groupPath(userId, groupId)]);
}
