// Edge Function: youtube-music
// Recebe { action, ... } e devolve dados PÚBLICOS do YouTube, sem chave de API:
//   action "video"    { videoId }  -> { title, artist, duration }
//   action "playlist" { listId }   -> { title, items: [{ videoId, title, artist, duration }] }  (playlist pública, até 500 itens)
//   action "captions" { videoId }  -> { segments: [{ s, t }] }  (legenda do vídeo, usada como letra se não houver outra)
// Lê os mesmos dados que o próprio site/player do YouTube usa, então pode parar de funcionar
// se o YouTube mudar o formato. Playlists privadas e "Mix" (RD...) não funcionam.
//
// Deploy: supabase functions deploy youtube-music

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const WEB_CTX = { client: { clientName: "WEB", clientVersion: "2.20250101.00.00", hl: "pt", gl: "BR" } };
const UA_WEB = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// deno-lint-ignore no-explicit-any
type Any = any;

function walk(node: Any, cb: (key: string, val: Any) => void) {
  if (Array.isArray(node)) { for (const n of node) walk(n, cb); return; }
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) { cb(k, node[k]); walk(node[k], cb); }
  }
}
const textOf = (x: Any): string => (x?.simpleText ?? x?.runs?.map((r: Any) => r.text).join("") ?? "").toString();

async function innertube(path: string, body: Record<string, unknown>, ctx = WEB_CTX, ua = UA_WEB) {
  const r = await fetch(`https://www.youtube.com/youtubei/v1/${path}?prettyPrint=false`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": ua, "accept-language": "pt-BR,pt;q=0.9" },
    body: JSON.stringify({ context: ctx, ...body }),
  });
  return await r.json();
}

async function getVideo(videoId: string) {
  try {
    const j = await innertube(
      "player",
      { videoId },
      { client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 34, hl: "pt", gl: "BR" } },
      "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
    );
    const d = j?.videoDetails;
    if (d?.title) return { title: String(d.title), artist: String(d.author || ""), duration: Number(d.lengthSeconds) || 0 };
  } catch (e) { console.error("player falhou:", e); }
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent("https://www.youtube.com/watch?v=" + videoId)}&format=json`);
    if (r.ok) { const j = await r.json(); return { title: String(j.title || ""), artist: String(j.author_name || ""), duration: 0 }; }
  } catch (e) { console.error("oembed falhou:", e); }
  return null;
}

async function getPlaylist(listId: string) {
  const items: { videoId: string; title: string; artist: string; duration: number }[] = [];
  const seen = new Set<string>();
  let title = "";
  let page = await innertube("browse", { browseId: "VL" + listId });
  for (let i = 0; i < 8; i++) { // ~100 itens por página
    let token: string | null = null;
    walk(page, (k, v) => {
      if (k === "playlistMetadataRenderer" && !title) title = String(v?.title || "");
      if (k === "playlistVideoRenderer" && v?.videoId && !seen.has(v.videoId)) {
        const t = textOf(v.title);
        if (v.isPlayable === false || /^\[(private|deleted) video\]$/i.test(t) || /^(vídeo (privado|excluído))$/i.test(t)) return;
        seen.add(v.videoId);
        items.push({ videoId: v.videoId, title: t, artist: textOf(v.shortBylineText).replace(/\s*-\s*Topic$/i, ""), duration: Number(v.lengthSeconds) || 0 });
      }
      if (k === "continuationItemRenderer") {
        const t = v?.continuationEndpoint?.continuationCommand?.token;
        if (t) token = t;
      }
    });
    if (!token || items.length >= 500) break;
    page = await innertube("browse", { continuation: token });
  }
  return { title, items: items.slice(0, 500) };
}

type Track = { baseUrl: string; languageCode?: string; kind?: string };
async function getCaptionTracks(videoId: string): Promise<Track[]> {
  try {
    const j = await innertube(
      "player",
      { videoId },
      { client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 34, hl: "pt", gl: "BR" } },
      "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
    );
    const tracks = j?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (Array.isArray(tracks) && tracks.length) return tracks;
  } catch (e) { console.error("innertube falhou:", e); }
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=pt`, { headers: { "user-agent": UA_WEB, "accept-language": "pt-BR,pt;q=0.9" } });
    const html = await res.text();
    const m = html.match(/"captionTracks":(\[.*?\])(?:,"audioTracks"|,"translationLanguages")/s);
    if (m) { const tracks = JSON.parse(m[1]); if (Array.isArray(tracks) && tracks.length) return tracks; }
  } catch (e) { console.error("fallback da página falhou:", e); }
  return [];
}

async function getCaptions(videoId: string) {
  const tracks = await getCaptionTracks(videoId);
  if (!tracks.length) return [];
  const isAuto = (t: Track) => t.kind === "asr";
  const t = tracks.find((x) => !isAuto(x)) || tracks[0];
  const res = await fetch(t.baseUrl.replace(/&fmt=[^&]*/g, "") + "&fmt=json3");
  const body = await res.text();
  if (!body.trim()) return [];
  try {
    const j = JSON.parse(body);
    const out: { s: number; t: string }[] = [];
    for (const e of j.events || []) {
      const txt = (e.segs || []).map((s: Any) => s.utf8 || "").join("").replace(/\s+/g, " ").trim();
      if (txt && txt !== "♪" && typeof e.tStartMs === "number") out.push({ s: Math.round(e.tStartMs) / 1000, t: txt });
    }
    return out.slice(0, 800);
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado." }, 401);
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) return json({ error: "Sessão inválida." }, 401);

    const { action, videoId, listId } = await req.json();

    if (action === "video") {
      if (!/^[\w-]{11}$/.test(String(videoId || ""))) return json({ error: "Link de vídeo inválido." }, 400);
      const v = await getVideo(videoId);
      return v ? json(v) : json({ error: "Não consegui ler os dados desse vídeo." }, 404);
    }
    if (action === "playlist") {
      if (!/^[\w-]{10,}$/.test(String(listId || "")) || /^(RD|LL|WL)/.test(listId)) return json({ error: "Essa playlist não pode ser importada (só playlists públicas; Mix e 'Curtidas' não funcionam)." }, 400);
      const p = await getPlaylist(listId);
      if (!p.items.length) return json({ error: "Não achei músicas nessa playlist. Ela precisa ser pública (ou não listada)." }, 404);
      return json(p);
    }
    if (action === "captions") {
      if (!/^[\w-]{11}$/.test(String(videoId || ""))) return json({ error: "Link de vídeo inválido." }, 400);
      const segments = await getCaptions(videoId);
      return segments.length ? json({ segments }) : json({ error: "Esse vídeo não tem legenda." }, 404);
    }
    return json({ error: "Ação inválida." }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: "Erro inesperado ao falar com o YouTube." }, 500);
  }
});
