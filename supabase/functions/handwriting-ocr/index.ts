// Edge Function: handwriting-ocr
// Recebe uma imagem (PNG em base64) com um traço escrito à mão pela pessoa
// no quadro infinito ou no anotador de PDF, e devolve o texto transcrito
// pelo Gemini (Google) — usado no modo "caneta vira texto" da ferramenta
// de texto. A chave da API fica só aqui no servidor — nunca é exposta ao
// navegador. Usa a MESMA chave secreta já configurada para ai-insights.
//
// Deploy: supabase functions deploy handwriting-ocr
// (não precisa configurar segredo novo — reaproveita o GEMINI_API_KEY)

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

    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(JSON.stringify({ error: "Faltou imageBase64." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt =
      "A imagem tem um texto escrito à mão (com caneta/stylus) sobre um fundo " +
      "transparente ou claro. Transcreva EXATAMENTE o que está escrito, em texto " +
      "puro, preservando quebras de linha quando fizerem sentido. Não descreva a " +
      "imagem, não adicione comentários, não use markdown — responda só com o " +
      "texto transcrito. Se não conseguir identificar nenhum texto legível, " +
      "responda com uma string vazia.";

    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType || "image/png", data: imageBase64 } },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 800,
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

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro em handwriting-ocr:", err);
    return new Response(JSON.stringify({ error: "Erro interno." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
