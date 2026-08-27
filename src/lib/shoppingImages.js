import { supabase } from "./supabaseClient";

const BUCKET = "shopping_images";

// Cada foto fica em <user_id>/<item_id>.jpg — pasta por usuário, igual aos
// outros buckets. PÚBLICO (como flashcard_images): a foto de um item da
// lista de compras não é dado sensível, e URL pública permite cache HTTP
// normal em <img>, em vez de embutir base64 no banco (que era rebaixado
// por completo toda vez que a Lista de Compras era aberta).
export function shoppingImagePath(userId, itemId) {
  return `${userId}/${itemId}.jpg`;
}

export async function uploadShoppingImage(userId, itemId, blob) {
  const path = shoppingImagePath(userId, itemId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Quebra o cache do navegador quando a mesma foto é trocada (upsert mantém
  // o mesmo path, então sem isso o navegador mostraria a imagem antiga).
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function deleteShoppingImage(userId, itemId) {
  const path = shoppingImagePath(userId, itemId);
  await supabase.storage.from(BUCKET).remove([path]);
}
