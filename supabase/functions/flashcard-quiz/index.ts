// Edge Function: flashcard-quiz
// Recebe o id de uma lista de flashcards do app Libano e o ESTADO RESUMIDO da
// sessão de quiz (não o histórico bruto da conversa), e devolve a próxima
// fala de um "tutor" gerado pela API do Gemini (Google), que conduz um quiz
// interativo pergunta a pergunta. A chave da API fica só aqui no servidor —
// nunca é exposta ao navegador.
//
// Os cartões são buscados aqui mesmo (via listId, respeitando RLS) em vez de
// virem no corpo da requisição — evita reenviar o texto da lista inteira do
// cliente pro servidor em toda mensagem do chat.
//
// Custo por turno: em vez de reenviar o texto de TODA a conversa anterior a
// cada pergunta (o que faz o volume de tokens de entrada crescer O(n²) ao
// longo de uma sessão), cada chamada manda só:
//   1. o prefixo fixo (system prompt + lista de cards) — sempre idêntico,
//      então continua batendo no cache implícito do Gemini para modelos Flash;
//   2. a ÚLTIMA pergunta feita pela IA + a resposta atual do usuário a ela;
//   3. um resumo compacto do progresso (termos já cobertos e se acertou ou
//      errou cada um), mantido pelo cliente — não o texto de cada troca.
// Isso deixa o tamanho de cada requisição praticamente constante, não importa
// se é a pergunta 2 ou a pergunta 20 da sessão.
//
// Como a IA agora recebe só o resumo (e não o texto literal da pergunta/
// resposta anteriores acumuladas), ela responde em JSON estruturado
// (message / previousAnswerCorrect / nextTerm) para que o cliente consiga
// atualizar esse resumo sem precisar reprocessar texto livre.
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

Regras pedagógicas:
- Faça UMA pergunta por vez sobre um dos termos da lista, sem revelar a resposta na própria pergunta.
- Varie o jeito de perguntar (não repita sempre "o que é X"): peça a estrutura, o conceito, um exemplo, a diferença entre termos parecidos, etc., sempre usando só o conteúdo fornecido.
- Quando houver uma resposta do usuário para avaliar, diga claramente se ela está certa ou errada, explique o motivo de forma breve e clara, e só então faça a próxima pergunta sobre outro termo.
- A cada turno você recebe um resumo dos termos já cobertos nesta sessão (e se foram acertados ou errados). Use esse resumo — não sua memória de turnos anteriores — para não repetir um termo já respondido corretamente antes de passar por todos os outros, a menos que a lista tenha poucos termos.
- Nunca invente termos, definições ou fatos que não estejam na lista fornecida.
- Seja direto e encorajador. Não use markdown pesado (pode usar **negrito** ocasional para destacar um termo).
- Responda sempre em português do Brasil.
- Na primeiríssima pergunta da sessão (quando ainda não há nada para avaliar), apenas cumprimente rapidamente e já faça a primeira pergunta, sem longas introduções.

Formato de saída — responda SEMPRE em JSON válido, sem nenhum texto fora do JSON:
{
  "message": "<texto que o usuário vai ler: feedback da resposta anterior (se houver) + a nova pergunta>",
  "previousAnswerCorrect": <true ou false, se você acabou de avaliar uma resposta; omita este campo se esta for a primeira pergunta da sessão>,
  "nextTerm": "<o termo, exatamente como aparece na lista, sobre o qual é a NOVA pergunta que você acabou de fazer em "message">"
}`;

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
    const listId = typeof body.listId === "string" ? body.listId : null;

    // Estado resumido da sessão (mantido no cliente), NÃO o histórico bruto:
    // - progress: termos já cobertos e se foram acertados
    // - pendingQuestion: texto da última pergunta feita pela IA (a que a
    //   resposta atual está respondendo) — ausente na primeira chamada
    // - answer: resposta atual do usuário a essa pergunta — ausente na
    //   primeira chamada, quando só estamos pedindo a pergunta inicial
    const progress = Array.isArray(body.progress)
      ? body.progress.filter((p) => p && typeof p.term === "string")
      : [];
    const pendingQuestion = typeof body.pendingQuestion === "string" ? body.pendingQuestion : null;
    const answer = typeof body.answer === "string" ? body.answer : null;

    if (!listId) {
      return new Response(JSON.stringify({ error: "listId não informado." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca os cartões direto no banco pelo id da lista, usando o client já
    // autenticado com o token do usuário (RLS garante que só a própria lista
    // dele é lida).
    const { data: listRow, error: listError } = await supabaseClient
      .from("study_flashcard_lists")
      .select("cards")
      .eq("id", listId)
      .maybeSingle();

    if (listError || !listRow) {
      return new Response(JSON.stringify({ error: "Lista de flashcards não encontrada." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripHtml = (html) => (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const cards = (Array.isArray(listRow.cards) ? listRow.cards : [])
      .map((c) => ({ term: stripHtml(c.term), definition: stripHtml(c.definition) }))
      .filter((c) => c.term || c.definition);

    if (cards.length === 0) {
      return new Response(JSON.stringify({ error: "Esta lista não tem termos para gerar um quiz." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cardsList = cards
      .map((c, i) => `${i + 1}. Termo: ${c.term || "(sem termo)"} | Definição: ${c.definition || "(sem definição)"}`)
      .join("\n");

    // Turno fixo: SEMPRE o mesmo texto para uma dada lista, não importa em
    // que pergunta da sessão o usuário está. É isso que preserva o cache
    // implícito de prefixo do Gemini — ele nunca muda entre chamadas.
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

    // A partir daqui, só o necessário para o turno ATUAL — nunca o histórico
    // inteiro acumulado. O tamanho disso não cresce com o número de perguntas
    // já feitas na sessão (cresce, no máximo, com o número de termos da
    // lista, que é bem menor e fixo).
    if (pendingQuestion && answer) {
      const correctCount = progress.filter((p) => p.correct).length;
      const wrongCount = progress.length - correctCount;
      const progressSummary = progress.length
        ? `Termos já cobertos nesta sessão (${progress.length}/${cards.length}): ` +
          progress.map((p) => `${p.term} (${p.correct ? "certo" : "errado"})`).join(", ") +
          `. Placar: ${correctCount} acerto(s), ${wrongCount} erro(s).`
        : "Nenhum termo foi coberto ainda nesta sessão.";

      contents.push({ role: "model", parts: [{ text: pendingQuestion }] });
      contents.push({
        role: "user",
        parts: [{ text: `${answer}\n\n[Estado da sessão: ${progressSummary}]` }],
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
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                message: { type: "STRING" },
                previousAnswerCorrect: { type: "BOOLEAN" },
                nextTerm: { type: "STRING" },
              },
              required: ["message", "nextTerm"],
            },
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

    if (!rawText) {
      console.error("Gemini retornou sem texto:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "A IA não retornou uma resposta." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (parseErr) {
      console.error("Falha ao parsear JSON da IA:", rawText);
      return new Response(JSON.stringify({ error: "A IA retornou uma resposta em formato inesperado." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!parsed || typeof parsed.message !== "string" || !parsed.message.trim()) {
      console.error("JSON da IA sem 'message':", rawText);
      return new Response(JSON.stringify({ error: "A IA não retornou uma resposta válida." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        reply: parsed.message.trim(),
        nextTerm: typeof parsed.nextTerm === "string" ? parsed.nextTerm : null,
        previousAnswerCorrect: typeof parsed.previousAnswerCorrect === "boolean" ? parsed.previousAnswerCorrect : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Erro inesperado no servidor." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
