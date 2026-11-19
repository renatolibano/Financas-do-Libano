// Edge Function: pluggy-sync
// Depois que o usuário conecta o banco pelo widget Pluggy Connect (que devolve
// um itemId), esta função busca as contas e as transações desse item na API
// da Pluggy e grava/atualiza tudo nas tabelas do Libano (bank_connections,
// bank_accounts — saldos, cartões e investimentos — e transactions), evitando duplicar movimentações já importadas.
//
// Deploy: supabase functions deploy pluggy-sync
// Usa os mesmos segredos da pluggy-connect-token:
//   PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET

import { createClient } from "jsr:@supabase/supabase-js@2";

const PLUGGY_CLIENT_ID = Deno.env.get("PLUGGY_CLIENT_ID");
const PLUGGY_CLIENT_SECRET = Deno.env.get("PLUGGY_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

// Histórico buscado na primeira sincronização (a Pluggy guarda até 12 meses) e janela
// das sincronizações seguintes (só o recente, com folga pra movimentações que mudam de status).
const DAYS_BACK_FULL = 365;
const DAYS_BACK_INCREMENTAL = 30;
// Espera (máx.) a Pluggy terminar de ler o banco logo após conectar
const ITEM_POLL_MAX_MS = 60_000;
const ITEM_POLL_EVERY_MS = 3_000;
const INSERT_CHUNK = 200;
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isoDaysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const day = (d: unknown) => (d ? String(d).slice(0, 10) : null);
// dd/mm do vencimento (formato usado no campo "next" das dívidas)
const ddmm = (d: unknown) => {
  const v = day(d);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}` : "—";
};

// Busca todas as páginas de uma listagem da Pluggy (results + next).
async function fetchAll(url: string, headers: Record<string, string>, maxPages = 10) {
  const out: any[] = [];
  let next: string | null = url;
  let page = 0;
  while (next && page < maxPages) {
    const res = await fetch(next, { headers });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    out.push(...(data.results || []));
    const base = next.split("?")[0];
    next = data.next ? (String(data.next).startsWith("http") ? data.next : `${base}${data.next}`) : null;
    page++;
  }
  return out;
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

    // 2) Busca os dados do item (nome do banco, status da conexão). Logo após conectar, a Pluggy
    // ainda está lendo o banco (UPDATING) e as movimentações chegam vazias — espera terminar.
    const getItem = async () => {
      const r = await fetch(`https://api.pluggy.ai/items/${itemId}`, { headers: pluggyHeaders });
      if (!r.ok) {
        console.error("Pluggy item error:", await r.text());
        return null;
      }
      return await r.json();
    };
    let item = await getItem();
    if (!item) return json({ error: "Não foi possível encontrar essa conexão bancária." }, 502);
    const pollStart = Date.now();
    while (["UPDATING", "LOGIN_IN_PROGRESS"].includes(item.status) && Date.now() - pollStart < ITEM_POLL_MAX_MS) {
      await sleep(ITEM_POLL_EVERY_MS);
      item = (await getItem()) || item;
    }
    if (item.status === "LOGIN_ERROR" || item.status === "OUTDATED") {
      return json({ error: "O banco recusou o acesso. Reconecte o banco para renovar a autorização." }, 422);
    }
    const stillUpdating = ["UPDATING", "LOGIN_IN_PROGRESS"].includes(item.status);
    const institutionName = item?.connector?.name || "Banco conectado";

    // 3) Salva/atualiza a conexão em bank_connections
    const { data: prevConn } = await supabaseClient
      .from("bank_connections")
      .select("history_synced")
      .eq("item_id", itemId)
      .maybeSingle();
    const fullSync = !prevConn?.history_synced;
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

    // 4.1) Saldos: guarda cada conta (corrente/poupança), cartão (fatura, limite, vencimento)
    // e investimento em bank_accounts — é isso que alimenta saldo atual, cartões e investimentos no app.
    const nowIso = new Date().toISOString();
    const accountRows: Record<string, unknown>[] = (accounts || []).map((a: any) => ({
      user_id: user.id,
      bank_connection_id: connection.id,
      pluggy_account_id: a.id,
      institution_name: institutionName,
      name: a.marketingName || a.name || null,
      type: a.type || null,
      subtype: a.subtype || null,
      balance: a.balance ?? null,
      credit_limit: a.creditData?.creditLimit ?? null,
      available_credit: a.creditData?.availableCreditLimit ?? null,
      bill_due_date: a.creditData?.balanceDueDate ? String(a.creditData.balanceDueDate).slice(0, 10) : null,
      minimum_payment: a.creditData?.minimumPayment ?? null,
      updated_at: nowIso,
    }));
    try {
      const invRes = await fetch(`https://api.pluggy.ai/investments?itemId=${itemId}&pageSize=500`, { headers: pluggyHeaders });
      if (invRes.ok) {
        const { results: investments } = await invRes.json();
        for (const inv of investments || []) {
          accountRows.push({
            user_id: user.id,
            bank_connection_id: connection.id,
            pluggy_account_id: inv.id,
            institution_name: institutionName,
            name: inv.name || "Investimento",
            type: "INVESTMENT",
            subtype: inv.type || null,
            balance: inv.balance ?? null,
            updated_at: nowIso,
          });
        }
      }
    } catch (err) {
      console.error("Pluggy investments error:", err); // investimentos são opcionais: não derruba a sincronização
    }
    let balances = 0;
    if (accountRows.length > 0) {
      const { error: accErr } = await supabaseClient
        .from("bank_accounts")
        .upsert(accountRows, { onConflict: "pluggy_account_id" });
      if (accErr) console.error("Erro ao salvar bank_accounts:", accErr);
      else balances = accountRows.length;
      // Remove contas/investimentos que não vieram mais nesta conexão.
      const keepIds = accountRows.map((r) => r.pluggy_account_id as string);
      await supabaseClient
        .from("bank_accounts")
        .delete()
        .eq("bank_connection_id", connection.id)
        .not("pluggy_account_id", "in", `(${keepIds.join(",")})`);
    }

    const fromDate = isoDaysAgo(fullSync ? DAYS_BACK_FULL : DAYS_BACK_INCREMENTAL);

    // Categorias em português (a Pluggy manda em inglês por padrão)
    const catNames = new Map<string, string>();
    try {
      const cats = await fetchAll("https://api.pluggy.ai/categories?pageSize=500", pluggyHeaders, 2);
      for (const c of cats) catNames.set(String(c.id), c.descriptionTranslated || c.description);
    } catch (err) {
      console.error("Pluggy categories error:", err); // opcional: cai pra categoria original
    }
    const catOf = (tx: any): string | null => (tx.categoryId && catNames.get(String(tx.categoryId))) || tx.category || null;

    let imported = 0;
    let skipped = 0;
    let txOk = true;
    let cardOk = true;
    const cardRows: Record<string, unknown>[] = [];
    const billRows: Record<string, unknown>[] = [];

    // 5) Contas correntes/poupança → movimentações (entradas e saídas), inseridas em lote.
    //    Cartões de crédito → compras da fatura atual por categoria (card_purchases), pra não
    //    contar duas vezes o gasto (compra no cartão + pagamento da fatura na conta).
    for (const account of accounts || []) {
      const isCard = account.type === "CREDIT";
      let txs: any[] = [];
      try {
        txs = await fetchAll(`https://api.pluggy.ai/transactions?accountId=${account.id}&from=${fromDate}&pageSize=500`, pluggyHeaders);
      } catch (err) {
        console.error("Pluggy transactions error:", err);
        if (isCard) cardOk = false; else txOk = false;
        continue;
      }

      if (isCard) {
        // Fatura atual = a de vencimento mais próximo a partir de hoje
        let upcomingId: string | null = null;
        try {
          const bills = await fetchAll(`https://api.pluggy.ai/bills?accountId=${account.id}`, pluggyHeaders, 2);
          const today = isoDaysAgo(0);
          const upcoming = bills.filter((b) => day(b.dueDate) && day(b.dueDate)! >= today).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
          upcomingId = upcoming?.id || null;
          const idx = accountRows.findIndex((r) => r.pluggy_account_id === account.id);
          if (idx >= 0 && upcoming) {
            if (!accountRows[idx].bill_due_date) accountRows[idx].bill_due_date = day(upcoming.dueDate);
            if (accountRows[idx].minimum_payment == null) accountRows[idx].minimum_payment = upcoming.minimumPaymentAmount ?? null;
            billRows.push(accountRows[idx]);
          }
        } catch (err) {
          console.error("Pluggy bills error:", err); // opcional
        }
        const billIdOf = (t: any) => t.creditCardMetadata?.billId;
        const hasBillIds = txs.some(billIdOf);
        const recentFrom = isoDaysAgo(30);
        for (const t of txs) {
          if (t.type === "CREDIT" || (t.type == null && t.amount > 0)) continue; // pagamentos/estornos não são compras
          const inCurrent = hasBillIds ? !billIdOf(t) || billIdOf(t) === upcomingId : (day(t.date) || "") >= recentFrom;
          if (!inCurrent) continue;
          cardRows.push({ cat: catOf(t) || "Sem categoria", value: Math.abs(t.amount) });
        }
        continue;
      }

      const rows = txs.map((tx) => {
        const isCredit = tx.type === "CREDIT" || (tx.type == null && tx.amount > 0);
        return {
          user_id: user.id,
          desc: tx.description || tx.descriptionRaw || account.name || "Movimentação",
          cat: catOf(tx),
          value: Math.abs(tx.amount),
          type: isCredit ? "in" : "out",
          // Data completa (AAAA-MM-DD): a Pluggy já manda em ISO, só tira a hora.
          date: day(tx.date),
          source: "pluggy",
          pluggy_transaction_id: tx.id,
          bank_connection_id: connection.id,
        };
      });
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const chunk = rows.slice(i, i + INSERT_CHUNK);
        const { data: inserted, error: insertError } = await supabaseClient
          .from("transactions")
          .upsert(chunk, { onConflict: "pluggy_transaction_id", ignoreDuplicates: true })
          .select("id");
        if (insertError) {
          console.error("Erro ao inserir transações:", insertError);
          skipped += chunk.length;
          txOk = false;
        } else {
          imported += inserted?.length || 0;
        }
      }
    }

    // Atualiza datas/pagamento mínimo das faturas (preenchidos acima pelas /bills)
    if (billRows.length > 0) {
      const { error: accErr2 } = await supabaseClient.from("bank_accounts").upsert(billRows, { onConflict: "pluggy_account_id" });
      if (accErr2) console.error("Erro ao atualizar bank_accounts (faturas):", accErr2);
    }

    // 5.1) Compras da fatura atual por categoria → "Fatura por categoria" (substitui as do banco)
    if (cardOk && (accounts || []).some((a: any) => a.type === "CREDIT")) {
      const byCat = new Map<string, number>();
      for (const r of cardRows) byCat.set(r.cat as string, (byCat.get(r.cat as string) || 0) + (r.value as number));
      await supabaseClient.from("card_purchases").delete().eq("bank_connection_id", connection.id);
      const rows = [...byCat.entries()].map(([cat, value]) => ({
        user_id: user.id, cat, value: Math.round(value * 100) / 100, source: "pluggy", bank_connection_id: connection.id,
      }));
      if (rows.length) {
        const { error: cpErr } = await supabaseClient.from("card_purchases").insert(rows);
        if (cpErr) console.error("Erro ao salvar card_purchases:", cpErr);
      }
    }

    // 6) Empréstimos e financiamentos → Dívidas (opcional: nem todo banco expõe)
    let debtsCount = 0;
    try {
      const loans = await fetchAll(`https://api.pluggy.ai/loans?itemId=${itemId}`, pluggyHeaders, 2);
      const debtRows = loans.map((l: any) => {
        const total = Number(l.contractAmount) || 0;
        const remaining = Number(l.payments?.contractOutstandingBalance ?? l.contractOutstandingBalance);
        const paid = Number.isFinite(remaining) && total > 0 ? Math.min(total, Math.max(0, total - remaining)) : 0;
        return {
          user_id: user.id,
          name: l.productName || l.type || "Empréstimo",
          total,
          paid,
          next: ddmm(l.dueDate),
          source: "pluggy",
          pluggy_id: l.id,
          bank_connection_id: connection.id,
        };
      }).filter((r: any) => r.total > 0);
      if (debtRows.length) {
        const { error: dErr } = await supabaseClient.from("debts").upsert(debtRows, { onConflict: "pluggy_id" });
        if (dErr) console.error("Erro ao salvar debts:", dErr);
        else debtsCount = debtRows.length;
      }
    } catch (err) {
      console.error("Pluggy loans error:", err);
    }

    if (txOk && fullSync) {
      await supabaseClient.from("bank_connections").update({ history_synced: true }).eq("id", connection.id);
    }

    return json({ ok: true, institutionName, accounts: (accounts || []).length, balances, imported, skipped, debts: debtsCount, pending: stillUpdating });
  } catch (err) {
    console.error(err);
    return json({ error: "Erro inesperado no servidor." }, 500);
  }
});
