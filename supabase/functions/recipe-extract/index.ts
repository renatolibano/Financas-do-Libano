// Edge Function: recipe-extract
// Recebe o texto de uma receita (ex.: descrição de um vídeo do YouTube) e
// devolve { title, ingredients[], steps } usando a API do Gemini. Só é chamada
// quando o app não consegue separar os blocos localmente.
//
// Deploy: supabase functions deploy recipe-extract
// (usa o mesmo segredo GEMINI_API_KEY da função ai-insights)

import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-3.6-flash";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) {
      return json({ error: "GEMINI_API_KEY não configurada no projeto Supabase." }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado." }, 401);
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) return json({ error: "Sessão inválida." }, 401);

    const body = await req.json();
    const text = String(body?.text || "").slice(0, 20000).trim();
    const fromTranscript = body?.source === "transcript";
    if (!text) return json({ error: "Texto vazio." }, 400);

    const prompt = `${fromTranscript ? "Transcrição automática (fala) de um vídeo de receita; pode ter erros de reconhecimento e pontuação. Converta as quantidades faladas em formato de lista" : "Texto de uma receita (pode ser a descrição de um vídeo)"}:\n\n${text}\n\nExtraia a receita e responda SOMENTE com um JSON no formato {"title": string, "ingredients": string[], "steps": string}. "ingredients" tem um item por ingrediente, com a quantidade quando houver. "steps" é o modo de preparo em linhas separadas por \\n. Use apenas o que está no texto; se algo não existir, use "" ou [].`;

    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: "minimal" },
          },
        }),
      }
    );

    if (!aiRes.ok) {
      console.error("Gemini API error:", await aiRes.text());
      return json({ error: "Falha ao consultar a IA." }, 502);
    }

    const aiData = await aiRes.json();
    const raw = (aiData.candidates?.[0]?.content?.parts || [])
      .filter((p: { text?: unknown }) => typeof p.text === "string")
      .map((p: { text: string }) => p.text)
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    let parsed: { title?: unknown; ingredients?: unknown; steps?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("Resposta da IA não é JSON:", raw);
      return json({ error: "A IA não retornou uma resposta válida." }, 502);
    }

    return json({
      title: typeof parsed.title === "string" ? parsed.title : "",
      ingredients: Array.isArray(parsed.ingredients)
        ? parsed.ingredients.map((x) => String(x).trim()).filter(Boolean)
        : [],
      steps: typeof parsed.steps === "string" ? parsed.steps : "",
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Erro inesperado no servidor." }, 500);
  }
});
