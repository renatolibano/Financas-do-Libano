import { supabase } from "./supabaseClient";

export const thumbUrl = (videoId) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

// Aceita links do YouTube e do YouTube Music (watch, youtu.be, shorts, playlist).
// Devolve { videoId, listId } (um dos dois pode ser null) ou null se não for um link válido.
export function parseYouTubeUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  let u;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  if (host !== "youtube.com" && host !== "youtu.be" && host !== "youtube-nocookie.com") return null;
  let videoId = null;
  if (host === "youtu.be") videoId = u.pathname.slice(1).split("/")[0];
  else if (u.pathname === "/watch") videoId = u.searchParams.get("v");
  else { const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/); if (m) videoId = m[1]; }
  if (videoId && !/^[\w-]{11}$/.test(videoId)) videoId = null;
  let listId = u.searchParams.get("list");
  if (listId && (!/^[\w-]{10,}$/.test(listId) || /^(RD|LL|WL)/.test(listId))) listId = null; // Mix/curtidas/assistir depois não são importáveis
  if (!videoId && !listId) return null;
  return { videoId, listId };
}

const NOISE = /\s*[(\[](?:official|oficial|video|vídeo|videoclipe|clipe|lyrics?|letra|audio|áudio|ao vivo|live|hd|4k|remaster(?:ed)?|visuali[sz]er|mv|m\/v)[^)\]]*[)\]]/gi;

// "Artista - Música (Official Video)" -> { title: "Música", artist: "Artista" }
export function guessMeta(rawTitle, channel) {
  let title = String(rawTitle || "").replace(NOISE, "").replace(/\s{2,}/g, " ").trim();
  let artist = String(channel || "").replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
  const m = title.match(/^(.{1,60}?)\s+[-–—]\s+(.+)$/);
  if (m) { artist = m[1].trim(); title = m[2].trim(); }
  return { title: title || String(rawTitle || "").trim(), artist };
}

async function callYt(body) {
  if (!supabase) return { error: "Para importar do YouTube é preciso estar conectado ao servidor (fazer login)." };
  try {
    const { data, error } = await supabase.functions.invoke("youtube-music", { body });
    if (error) {
      // A função respondeu com erro (ex.: 404 "não achei músicas"): lê a mensagem dela em vez de supor que não foi publicada.
      let b = null;
      try { b = await error.context?.json?.(); } catch { /* sem corpo */ }
      if (b?.debug) console.warn("[youtube-music]", b.debug);
      if (b?.error) return { error: b.error + (b.debug ? `\n(detalhe: ${b.debug})` : "") };
      console.error("[youtube-music]", error);
      return { error: "Não consegui falar com o servidor agora." };
    }
    if (data?.error) return { error: data.error };
    return { data };
  } catch (e) {
    console.error("[youtube-music]", e);
    return { error: "Não consegui falar com o servidor agora." };
  }
}

// Dados de uma música. Tenta o servidor; se falhar, tenta o oEmbed público do YouTube.
export async function fetchVideoInfo(videoId) {
  const r = await callYt({ action: "video", videoId });
  if (r.data) return { ...guessMeta(r.data.title, r.data.artist), duration: r.data.duration || 0 };
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent("https://www.youtube.com/watch?v=" + videoId)}&format=json`);
    if (res.ok) { const j = await res.json(); return { ...guessMeta(j.title, j.author_name), duration: 0 }; }
  } catch { /* segue para o erro */ }
  return { error: r.error || "Não consegui ler os dados desse vídeo. Você pode preencher título e artista à mão." };
}

export async function fetchPlaylistInfo(listId) {
  const r = await callYt({ action: "playlist", listId });
  if (r.error) return { error: r.error };
  return { title: r.data.title || "Playlist do YouTube", items: (r.data.items || []).map(it => ({ videoId: it.videoId, duration: it.duration || 0, ...guessMeta(it.title, it.artist) })) };
}

// ---------- letras ----------

const withTimeout = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };

// LRCLIB (lrclib.net): banco público de letras, muitas já com tempo de cada linha.
export async function fetchLrclib({ title, artist, duration }) {
  const get = async (qs) => {
    try {
      const r = await fetch(`https://lrclib.net/api/search?${qs}`, { signal: withTimeout(9000) });
      return r.ok ? await r.json() : [];
    } catch { return []; }
  };
  let list = await get(new URLSearchParams({ track_name: title, ...(artist ? { artist_name: artist } : {}) }).toString());
  if (!list.length) list = await get(new URLSearchParams({ q: `${artist || ""} ${title}`.trim() }).toString());
  list = (list || []).filter(x => x && !x.instrumental && (x.syncedLyrics || x.plainLyrics));
  if (!list.length) return null;
  const score = (x) => (x.syncedLyrics ? 0 : 10) + (duration && x.duration ? Math.min(30, Math.abs(x.duration - duration)) : 5);
  list.sort((a, b) => score(a) - score(b));
  const best = list[0];
  if (duration && best.duration && Math.abs(best.duration - duration) > 25) return null; // outra versão/música
  const synced = best.syncedLyrics || null;
  return { lyrics: best.plainLyrics || (synced ? lrcToPlain(synced) : ""), lyrics_synced: synced, lyrics_source: "lrclib" };
}

// Legenda do próprio vídeo (quando existir), convertida para letra com tempos.
export async function fetchYoutubeCaptions(videoId) {
  const r = await callYt({ action: "captions", videoId });
  const segs = r.data?.segments;
  if (!segs?.length) return null;
  const synced = segs.map(g => `[${fmtLrc(g.s)}]${g.t}`).join("\n");
  return { lyrics: segs.map(g => g.t).join("\n"), lyrics_synced: synced, lyrics_source: "youtube" };
}

const fmtLrc = (sec) => {
  const s = Math.max(0, sec), m = Math.floor(s / 60), r = s - m * 60;
  return `${String(m).padStart(2, "0")}:${r.toFixed(2).padStart(5, "0")}`;
};

// "[01:23.45] texto" -> [{ s: 83.45, t: "texto" }]
export function parseLrc(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const t = line.replace(/\[[^\]]*\]/g, "").trim();
    if (!t) continue;
    for (const m of stamps) out.push({ s: Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number("0." + m[3]) : 0), t });
  }
  return out.sort((a, b) => a.s - b.s);
}
export const looksLikeLrc = (text) => (String(text || "").match(/^\s*\[\d{1,3}:\d{2}/gm) || []).length >= 3;
export const lrcToPlain = (text) => String(text || "").split(/\r?\n/).map(l => l.replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, "").trim()).filter(Boolean).join("\n");
