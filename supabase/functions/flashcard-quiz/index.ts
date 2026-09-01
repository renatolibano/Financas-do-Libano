// Edge Function: flashcard-quiz
// Recebe os termos/definições de uma lista de flashcards do app Libano e o
// histórico da conversa, e devolve a próxima fala de um "tutor" gerado pela
// API do Gemini (Google), que conduz um quiz interativo pergunta a pergunta.
// A chave da API fica só aqui no servidor — nunca é exposta ao navegador.
//
// Deploy: supabase functions deploy flashcard-quiz
// Configurar a chave secreta (uma vez só, pode reaproveitar a mesma da
// ai-insights se já tiver configurado):
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

const SYSTEM_PROMPT = `Você é um tutor de estudos dentro do app Libano, conduzindo um quiz interativo com base numa lista de flashcards (termo + definição) fornecida pelo usuário.

Regras:
- Faça UMA pergunta por vez sobre um dos termos da lista, sem revelar a resposta na própria pergunta.
- Varie o jeito de perguntar (não repita sempre "o que é X"): peça a estrutura, o conceito, um exemplo, a diferença entre termos parecidos, etc., sempre usando só o conteúdo fornecido.
- Depois que o usuário responder, diga claramente se a resposta está certa ou errada, explique o motivo de forma breve e clara, e só então faça a próxima pergunta sobre outro termo.
- Não repita um termo que já foi respondido corretamente antes de passar por todos os outros, a menos que a lista tenha poucos termos.
- Nunca invente termos, definições ou fatos que não estejam na lista fornecida.
- Seja direto e encorajador. Não use markdown pesado (pode usar **negrito** ocasional para destacar um termo).
- Responda sempre em português do Brasil.
- Sua primeira mensagem deve apenas cumprimentar rapidamente e já fazer a primeira pergunta, sem longas introduções.`;

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

    const body = await req.json();
    const cards = Array.isArray(body.cards) ? body.cards : [];
    const history = Array.isArray(body.history) ? body.history : [];

    if (cards.length === 0) {
      return new Response(JSON.stringify({ error: "Esta lista não tem termos para gerar um quiz." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cardsList = cards
      .map((c, i) => `${i + 1}. Termo: ${c.term || "(sem termo)"} | Definição: ${c.definition || "(sem definição)"}`)
      .join("\n");

    // O primeiro turno "virtual" injeta a lista de termos como contexto,
    // pedindo pra IA já começar o quiz com a primeira pergunta.
    const contents = [
      {
        role: "user",
        parts: [
          {
            text: `Aqui está a lista de termos e definições desta sessão de estudo:\n\n${cardsList}\n\nComece o quiz agora, com a primeira pergunta.`,
          },
        ],
      },
    ];

    for (const turn of history) {
      if (!turn || typeof turn.text !== "string" || !turn.text.trim()) continue;
      contents.push({
        role: turn.role === "user" ? "user" : "model",
        parts: [{ text: turn.text }],
      });
    }

    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents,
          generationConfig: {
            maxOutputTokens: 512,
            thinkingConfig: { thinkingLevel: "low" },
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
    const text = (aiData.candidates?.[0]?.content?.parts || [])
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text)
      .join("\n")
      .trim();

    if (!text) {
      console.error("Gemini retornou sem texto:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "A IA não retornou uma resposta." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ reply: text }), {
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
