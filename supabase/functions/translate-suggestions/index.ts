// Edge Function: translate-suggestions
// Recebe um termo + idioma de origem/destino e devolve algumas opções curtas
// de tradução (geradas pelo Gemini), pra usar como sugestão no formulário de
// flashcards — a pessoa digita o termo e clica na tradução que quiser usar.
// Usa a MESMA chave secreta já configurada para a função ai-insights.
//
// Deploy: supabase functions deploy translate-suggestions
// (não precisa configurar segredo novo — reaproveita o GEMINI_API_KEY)

import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-2.5-flash";
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

    const { text, sourceLang, targetLang } = await req.json();
    if (!text?.trim() || !sourceLang || !targetLang) {
      return new Response(JSON.stringify({ error: "Faltam text, sourceLang ou targetLang." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Traduza o termo "${text.trim()}" de ${sourceLang} para ${targetLang}.

Responda APENAS com um JSON válido, sem markdown, sem crases, sem texto antes ou depois — um objeto no formato:
{"suggestions": ["opção 1", "opção 2", "opção 3"]}

Regras:
- No máximo 5 opções, cada uma bem curta (uma palavra ou expressão curta, não frases explicativas).
- Se o termo tiver mais de um sentido comum, inclua as traduções para os sentidos mais usados, sem repetir opções iguais.
- Se não souber traduzir, responda {"suggestions": []}.`;

    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 200,
            responseMimeType: "application/json",
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
    const rawText = (aiData.candidates?.[0]?.content?.parts || [])
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text)
      .join("\n")
      .trim();

    let suggestions = [];
    try {
      const cleaned = rawText.replace(/^```json\s*|\s*```$/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed?.suggestions)) {
        suggestions = parsed.suggestions
          .filter((s) => typeof s === "string" && s.trim())
          .map((s) => s.trim())
          .slice(0, 5);
      }
    } catch (parseErr) {
      console.error("Não consegui interpretar a resposta da IA:", rawText);
    }

    return new Response(JSON.stringify({ suggestions }), {
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
