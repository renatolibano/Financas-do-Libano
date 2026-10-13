// Edge Function: gif-search
// Recebe { name } e procura o GIF do exercício no gifdotreino.com (mesma busca que o próprio site usa:
// get_exercise_folders.php + search_gifs.php). Devolve { found: true, url, name } ou { found: false }.
// O navegador não consegue chamar o site direto (CORS), por isso a busca passa por aqui.
//
// Deploy: supabase functions deploy gif-search

const SITE = "https://www.gifdotreino.com/";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const norm = (s: string) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const txt = (await res.text()).replace(/^\uFEFF/, "");
  return JSON.parse(txt);
}

let foldersCache: string[] | null = null;
async function getFolders(): Promise<string[]> {
  if (foldersCache) return foldersCache;
  try {
    const f = await getJson(SITE + "get_exercise_folders.php");
    foldersCache = Array.isArray(f) ? f : [];
  } catch {
    foldersCache = [];
  }
  return foldersCache;
}

type Gif = { name: string; path: string };

async function search(q: string, folders: string[]): Promise<Gif[]> {
  const url = SITE + "search_gifs.php?q=" + encodeURIComponent(q) + "&folders=" + encodeURIComponent(JSON.stringify(folders)) + "&page=1&limit=200";
  const r = await getJson(url);
  return Array.isArray(r) ? r.filter((g) => g && g.name && g.path) : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { name } = await req.json();
    const wanted = norm(name);
    if (!wanted) return json({ found: false });
    const tokens = wanted.split(" ").filter(Boolean);
    const folders = await getFolders();

    // 1) busca pelo nome inteiro; 2) se vier vazio, busca por cada palavra (maiores primeiro) e exige todas no nome.
    let results = await search(String(name).trim(), folders);
    if (!results.length && folders.length) results = await search(String(name).trim(), []);
    if (!results.length) {
      const byLen = [...tokens].sort((a, b) => b.length - a.length).filter((t) => t.length >= 3).slice(0, 3);
      for (const t of byLen) {
        results = (await search(t, folders)).filter((g) => {
          const n = norm(g.name);
          return tokens.every((tk) => n.includes(tk));
        });
        if (results.length) break;
      }
    }
    if (!results.length) return json({ found: false });

    const score = (g: Gif) => {
      const n = norm(g.name);
      if (n === wanted) return 0;
      if (n.startsWith(wanted)) return 1;
      if (n.includes(wanted)) return 2;
      return 3 + Math.abs(n.length - wanted.length) / 100;
    };
    const best = [...results].sort((a, b) => score(a) - score(b))[0];
    const url = new URL(best.path, SITE).href;
    return json({ found: true, url, name: best.name });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
