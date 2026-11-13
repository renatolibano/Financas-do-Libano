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

// Relê todas as conexões bancárias do usuário na Pluggy e atualiza saldos, cartões, investimentos e movimentações.
export async function syncAllBankConnections() {
  const { data, error } = await supabase.from("bank_connections").select("item_id");
  if (error) throw error;
  let imported = 0, balances = 0;
  for (const c of data || []) {
    const r = await syncPluggyItem(c.item_id);
    imported += r.imported || 0;
    balances += r.balances || 0;
  }
  return { connections: (data || []).length, imported, balances };
}
