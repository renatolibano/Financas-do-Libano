// Edge Function: activity-insights
// Recebe um resumo da aba Gráfico do app Libano (categorias, contagens do
// período, afazeres pendentes/concluídos hoje) e devolve uma análise gerada
// pela API do Gemini (Google). A chave da API fica só aqui no servidor —
// nunca é exposta ao navegador. Espelha a função ai-insights (financeira).
//
// Deploy: supabase functions deploy activity-insights
// Usa a mesma chave secreta já configurada para ai-insights:
//   supabase secrets set GEMINI_API_KEY=AIza...

import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-3.6-flash";
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
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY não configurada no projeto Supabase." }),
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

    const prompt = `Aqui está um resumo da aba de organização de afazeres (aba "Gráfico") de um usuário do app Libano, referente aos últimos ${summary.periodLabel || "dias"}:

- Categorias cadastradas e quantas vezes cada uma foi concluída no período (kind indica se é "desenvolvimento", "lazer" ou null se não classificada): ${JSON.stringify(summary.categories || [])}
- Total de conclusões no período: ${summary.totalCompletions ?? 0}
- Afazeres pendentes agora: ${summary.pendingCount ?? 0}
- Concluídos hoje: ${summary.doneTodayCount ?? 0}

Escreva uma análise curta (no máximo 3 parágrafos curtos, em português do Brasil, tom direto e acolhedor) sobre como a pessoa está indo: destaque padrões, o equilíbrio entre desenvolvimento pessoal e lazer quando houver dados classificados dos dois tipos, e uma sugestão prática pros próximos dias. Não invente categorias ou números que não foram fornecidos. Não use markdown, apenas texto corrido.`;

    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "Você é um assistente de organização e produtividade dentro do app Libano. Seja objetivo, gentil e nunca prescritivo — ofereça observações e opções, não ordens. Nunca invente números que não foram passados a você.",
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 4096,
            thinkingConfig: { thinkingLevel: "minimal" },
          },
        }),
      }
    );

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Gemini API error:", errText);
      return new Response(JSON.stringify({ error: "Falha ao consultar a IA." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const candidate = aiData.candidates?.[0];
    const text = (candidate?.content?.parts || [])
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text)
      .join("\n")
      .trim();

    if (candidate?.finishReason === "MAX_TOKENS") {
      // O modelo ficou sem espaço (pensamento + resposta) antes de terminar.
      // Isso normalmente aparece pro usuário como um texto cortado no meio.
      console.error("Gemini cortou a resposta por MAX_TOKENS:", JSON.stringify(aiData.usageMetadata || {}));
    }

    if (!text) {
      console.error("Gemini retornou sem texto:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "A IA não retornou uma resposta." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
