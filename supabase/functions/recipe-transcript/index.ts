// Edge Function: recipe-transcript
// Recebe { videoId } e devolve { text } com a legenda (transcrição) do vídeo
// do YouTube. NÃO usa a API oficial (ela não permite ler legendas de vídeos
// de terceiros) — lê os dados públicos que o próprio player do YouTube usa,
// então pode parar de funcionar se o YouTube mudar o formato ou bloquear.
//
// Deploy: supabase functions deploy recipe-transcript

import { createClient } from "jsr:@supabase/supabase-js@2";

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

type Track = { baseUrl: string; languageCode?: string; kind?: string };

async function getCaptionTracks(videoId: string): Promise<Track[]> {
  // 1) Endpoint interno do player (cliente Android).
  try {
    const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
      },
      body: JSON.stringify({
        context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 34, hl: "pt", gl: "BR" } },
        videoId,
      }),
    });
    const j = await r.json();
    const tracks = j?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (Array.isArray(tracks) && tracks.length) return tracks;
  } catch (e) {
    console.error("innertube falhou:", e);
  }

  // 2) Fallback: lê a lista de legendas embutida na página do vídeo.
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=pt`, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "accept-language": "pt-BR,pt;q=0.9",
      },
    });
    const html = await res.text();
    const m = html.match(/"captionTracks":(\[.*?\])(?:,"audioTracks"|,"translationLanguages")/s);
    if (m) {
      const tracks = JSON.parse(m[1]);
      if (Array.isArray(tracks) && tracks.length) return tracks;
    }
  } catch (e) {
    console.error("fallback da página falhou:", e);
  }
  return [];
}

function pickTrack(tracks: Track[]): Track {
  const isPt = (t: Track) => (t.languageCode || "").toLowerCase().startsWith("pt");
  const isAuto = (t: Track) => t.kind === "asr";
  return (
    tracks.find((t) => isPt(t) && !isAuto(t)) ||
    tracks.find((t) => isPt(t)) ||
    tracks.find((t) => !isAuto(t)) ||
    tracks[0]
  );
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

async function fetchTranscriptText(track: Track): Promise<string> {
  const url = track.baseUrl.replace(/&fmt=[^&]*/g, "") + "&fmt=json3";
  const res = await fetch(url);
  const body = await res.text();
  if (!body.trim()) return "";
  try {
    const j = JSON.parse(body);
    return (j.events || [])
      .map((e: { segs?: { utf8?: string }[] }) => (e.segs || []).map((s) => s.utf8 || "").join(""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    // Formato XML (<text ...>trecho</text>).
    return [...body.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
      .map((m) => decodeEntities(m[1]))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
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

    const { videoId } = await req.json();
    if (!/^[\w-]{11}$/.test(String(videoId || ""))) return json({ error: "Link de vídeo inválido." }, 400);

    const tracks = await getCaptionTracks(videoId);
    if (!tracks.length) return json({ error: "Não consegui obter a legenda desse vídeo (ele pode não ter legenda)." }, 404);

    const track = pickTrack(tracks);
    const text = await fetchTranscriptText(track);
    if (!text) return json({ error: "A legenda desse vídeo veio vazia." }, 404);

    return json({ text: text.slice(0, 20000) });
  } catch (err) {
    console.error(err);
    return json({ error: "Erro inesperado ao buscar a legenda." }, 500);
  }
});
