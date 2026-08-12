// Edge Function: ai-insights
// Recebe um resumo financeiro do app Libano e devolve uma análise gerada
// pela API da Anthropic (Claude). A chave da API fica só aqui no servidor —
// nunca é exposta ao navegador.
//
// Deploy: supabase functions deploy ai-insights
// Configurar a chave secreta (uma vez só):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY não configurada no projeto Supabase." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Confirma que quem está chamando é um usuário autenticado (não qualquer um na internet)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Sessão inválida." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summary = await req.json();

    const prompt = `Aqui está um resumo financeiro do mês de um usuário do app Libano:

- Saldo atual: ${summary.balance}
- Entradas do mês: ${summary.income}
- Gastos do mês: ${summary.expense}
- Total em pagamentos fixos mensais: ${summary.fixedTotal}
- Total restante em dívidas: ${summary.debtRemaining}
- Fatura atual do cartão: ${summary.cardBill}
- Gastos por categoria no cartão: ${JSON.stringify(summary.cardCategories || [])}
- Últimas movimentações: ${JSON.stringify(summary.recentTransactions || [])}

Escreva uma análise curta (no máximo 3 parágrafos curtos, em português do Brasil, tom direto e acolhedor) destacando padrões, pontos de atenção e uma sugestão prática. Não dê conselhos de investimento específicos nem invente dados que não foram fornecidos. Não use markdown, apenas texto corrido.`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 500,
        system:
          "Você é um assistente financeiro dentro do app Libano. Seja objetivo, gentil e nunca prescritivo — ofereça observações e opções, não ordens. Nunca invente números que não foram passados a você.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Anthropic API error:", errText);
      return new Response(JSON.stringify({ error: "Falha ao consultar a IA." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const text = (aiData.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return new Response(JSON.stringify({ insight: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Erro inesperado no servidor." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
