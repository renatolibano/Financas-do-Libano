import { supabase } from "./supabaseClient";

// Pede ao servidor um connect token novo (dura 30 min) para abrir o widget Pluggy Connect.
export async function getPluggyConnectToken(itemId) {
  const { data, error } = await supabase.functions.invoke("pluggy-connect-token", {
    body: itemId ? { itemId } : {},
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.connectToken;
}

// Depois que o widget conecta o banco (onSuccess), manda o itemId pro servidor
// buscar as contas/transações na Pluggy e importar pro Libano.
export async function syncPluggyItem(itemId) {
  const { data, error } = await supabase.functions.invoke("pluggy-sync", {
    body: { itemId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data; // { institutionName, accounts, imported, skipped }
}
