import { supabase } from "./supabaseClient";

const BUCKET = "recipe_images";

// <user_id>/recipe-<recipe_id>.jpg — foto da receita (escolhida do computador/celular).
// PÚBLICO, mesmo padrão dos outros buckets de imagem do app.
function recipePath(userId, recipeId) {
  return `${userId}/recipe-${recipeId}.jpg`;
}

export const isStoredRecipeImage = (url) => typeof url === "string" && url.includes(`/${BUCKET}/`);

export async function uploadRecipeImage(userId, recipeId, blob) {
  const path = recipePath(userId, recipeId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function deleteRecipeImage(userId, recipeId) {
  await supabase.storage.from(BUCKET).remove([recipePath(userId, recipeId)]);
}
