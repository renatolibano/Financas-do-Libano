// Edge Function: note-ai
// Assistente de IA do editor de notas (menu flutuante ao selecionar texto).
// Recebe { action, text, instruction? } e devolve { result, summary }:
//   - result:  texto novo (ou a explicação, quando action = "explain")
//   - summary: frase curta dizendo o que foi feito (ex.: "Corrigi a ortografia do trecho selecionado.")
// Usa a MESMA chave já configurada para as outras funções de IA (GEMINI_API_KEY).
//
// Deploy: supabase functions deploy note-ai

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

const TASKS: Record<string, string> = {
  improve:
    "Melhore a escrita do trecho: mais clareza, fluidez e coesão, corrigindo erros se houver. Preserve o significado, o tom e o idioma. Não acrescente informações novas.",
  proofread:
    "Faça apenas a revisão do trecho: corrija ortografia, acentuação, pontuação e gramática. Não reescreva nem mude o estilo; altere o mínimo possível. Se não houver nada a corrigir, devolva o trecho igual.",
  explain:
    "Explique o trecho de forma simples e direta, em poucas frases, no mesmo idioma do trecho. Em \"result\" vai a explicação (não repita o trecho).",
  reformat:
    "Reorganize o trecho para ficar bem estruturado e fácil de ler (parágrafos curtos, itens com \"- \" no início da linha quando fizer sentido), sem mudar o conteúdo nem o idioma.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY não configurada no projeto Supabase." }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado." }, 401);
    const supabaseClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) return json({ error: "Sessão inválida." }, 401);

    const { action, text, instruction } = await req.json();
    const clean = typeof text === "string" ? text.trim().slice(0, 8000) : "";
    if (!clean) return json({ error: "Faltou o texto." }, 400);

    let task: string;
    if (action === "custom") {
      const ins = typeof instruction === "string" ? instruction.trim().slice(0, 500) : "";
      if (!ins) return json({ error: "Faltou a instrução." }, 400);
      task = `Aplique ao trecho esta instrução do usuário: "${ins}". Em "result" vai o trecho já com a instrução aplicada (ou a resposta, se a instrução for uma pergunta sobre o trecho).`;
    } else if (TASKS[action]) {
      task = TASKS[action];
    } else {
      return json({ error: "Ação inválida." }, 400);
    }

    const prompt = `Você é o assistente de escrita de um app de notas. ${task}

Responda APENAS com um JSON válido, sem markdown, sem crases, no formato:
{"result": "<texto resultante, usando \\n para quebras de linha>", "summary": "<uma frase curta, na primeira pessoa e no passado, dizendo o que você fez, ex.: Corrigi a ortografia do trecho selecionado.>"}

Regras: devolva só texto simples (sem HTML nem markdown de ênfase); não inclua comentários fora do JSON.

TRECHO:
"""
${clean}
"""`;

    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 4000,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: "low" },
          },
        }),
      },
    );

    if (!aiRes.ok) {
      console.error("Gemini API error:", await aiRes.text());
      return json({ error: "Falha ao consultar a IA." }, 502);
    }

    const aiData = await aiRes.json();
    const rawText = (aiData.candidates?.[0]?.content?.parts || [])
      .filter((p: { text?: unknown }) => typeof p.text === "string")
      .map((p: { text: string }) => p.text)
      .join("\n")
      .trim();

    try {
      const parsed = JSON.parse(rawText.replace(/^```json\s*|\s*```$/g, "").trim());
      const result = typeof parsed?.result === "string" ? parsed.result : "";
      const summary = typeof parsed?.summary === "string" ? parsed.summary.trim() : "";
      if (!result.trim()) return json({ error: "A IA não devolveu resultado." }, 502);
      return json({ result, summary });
    } catch (_e) {
      console.error("Não consegui interpretar a resposta da IA:", rawText);
      return json({ error: "Resposta da IA inválida." }, 502);
    }
  } catch (err) {
    console.error(err);
    return json({ error: "Erro inesperado no servidor." }, 500);
  }
});
