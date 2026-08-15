// Edge Function: pluggy-sync
// Depois que o usuário conecta o banco pelo widget Pluggy Connect (que devolve
// um itemId), esta função busca as contas e as transações desse item na API
// da Pluggy e grava/atualiza tudo nas tabelas do Libano (bank_connections e
// transactions), evitando duplicar movimentações já importadas.
//
// Deploy: supabase functions deploy pluggy-sync
// Usa os mesmos segredos da pluggy-connect-token:
//   PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET

import { createClient } from "jsr:@supabase/supabase-js@2";

const PLUGGY_CLIENT_ID = Deno.env.get("PLUGGY_CLIENT_ID");
const PLUGGY_CLIENT_SECRET = Deno.env.get("PLUGGY_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

// Quantos dias de histórico buscar numa sincronização (a Pluggy guarda até 12 meses)
const DAYS_BACK = 90;
// Limite de segurança de páginas de transações por conta (500 por página)
const MAX_PAGES_PER_ACCOUNT = 10;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
      return json({ error: "PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET não configurados no projeto Supabase." }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado." }, 401);

    // Cliente "como o usuário" — RLS garante que só lê/escreve os próprios dados
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) return json({ error: "Sessão inválida." }, 401);

    const { itemId } = await req.json();
    if (!itemId) return json({ error: "itemId é obrigatório." }, 400);

    // 1) Autentica na Pluggy
    const authRes = await fetch("https://api.pluggy.ai/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: PLUGGY_CLIENT_ID, clientSecret: PLUGGY_CLIENT_SECRET }),
    });
    if (!authRes.ok) {
      console.error("Pluggy auth error:", await authRes.text());
      return json({ error: "Falha ao autenticar com a Pluggy." }, 502);
    }
    const { apiKey } = await authRes.json();
    const pluggyHeaders = { "content-type": "application/json", "X-API-KEY": apiKey };

    // 2) Busca os dados do item (nome do banco, status da conexão)
    const itemRes = await fetch(`https://api.pluggy.ai/items/${itemId}`, { headers: pluggyHeaders });
    if (!itemRes.ok) {
      console.error("Pluggy item error:", await itemRes.text());
      return json({ error: "Não foi possível encontrar essa conexão bancária." }, 502);
    }
    const item = await itemRes.json();
    const institutionName = item?.connector?.name || "Banco conectado";

    // 3) Salva/atualiza a conexão em bank_connections
    const { data: connection, error: connError } = await supabaseClient
      .from("bank_connections")
      .upsert(
        {
          user_id: user.id,
          item_id: itemId,
          institution_name: institutionName,
          status: item?.executionStatus || "UNKNOWN",
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "item_id" }
      )
      .select()
      .single();
    if (connError) {
      console.error("Erro ao salvar bank_connections:", connError);
      return json({ error: "Falha ao salvar a conexão bancária." }, 500);
    }

    // 4) Busca as contas desse item
    const accountsRes = await fetch(`https://api.pluggy.ai/accounts?itemId=${itemId}`, { headers: pluggyHeaders });
    if (!accountsRes.ok) {
      console.error("Pluggy accounts error:", await accountsRes.text());
      return json({ error: "Falha ao buscar as contas do banco." }, 502);
    }
    const { results: accounts } = await accountsRes.json();

    const fromDate = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    let imported = 0;
    let skipped = 0;

    // 5) Para cada conta, pagina as transações e insere as novas
    for (const account of accounts || []) {
      let url = `https://api.pluggy.ai/transactions?accountId=${account.id}&from=${fromDate}&pageSize=500`;
      let page = 0;
      while (url && page < MAX_PAGES_PER_ACCOUNT) {
        const txRes = await fetch(url, { headers: pluggyHeaders });
        if (!txRes.ok) {
          console.error("Pluggy transactions error:", await txRes.text());
          break;
        }
        const txData = await txRes.json();
        const results = txData.results || [];

        for (const tx of results) {
          const isCredit = tx.type === "CREDIT" || (tx.type == null && tx.amount > 0);
          const row = {
            user_id: user.id,
            desc: tx.description || tx.descriptionRaw || account.name || "Movimentação",
            cat: tx.category || null,
            value: Math.abs(tx.amount),
            type: isCredit ? "in" : "out",
            date: tx.date ? new Date(tx.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : null,
            source: "pluggy",
            pluggy_transaction_id: tx.id,
            bank_connection_id: connection.id,
          };
          const { error: insertError } = await supabaseClient
            .from("transactions")
            .upsert(row, { onConflict: "pluggy_transaction_id", ignoreDuplicates: true });
          if (insertError) {
            console.error("Erro ao inserir transação", tx.id, insertError);
            skipped++;
          } else {
            imported++;
          }
        }

        url = txData.next ? `https://api.pluggy.ai/transactions${txData.next}` : null;
        page++;
      }
    }

    return json({ ok: true, institutionName, accounts: (accounts || []).length, imported, skipped });
  } catch (err) {
    console.error(err);
    return json({ error: "Erro inesperado no servidor." }, 500);
  }
});
