// Edge Function: gif-search
// Recebe { name } (em português) e procura o GIF do exercício:
//   1) no gifdotreino.com (mesma busca que o próprio site usa: get_exercise_folders.php + search_gifs.php);
//   2) se não achar, no fitsmove.com (biblioteca em inglês): o nome é traduzido pela IA (Gemini, mesma chave GEMINI_API_KEY
//      já usada nas outras funções) e comparado com a lista de exercícios do site.
// Devolve { found: true, url, name, source } ou { found: false }.
// O navegador não consegue chamar esses sites direto (CORS), por isso a busca passa por aqui.
//
// Deploy: supabase functions deploy gif-search

const SITE = "https://www.gifdotreino.com/";
const FM = "https://fitsmove.com";
const FM_BODY_PARTS = ["upper-arms", "upper-legs", "back", "waist", "chest", "shoulders", "lower-legs", "lower-arms", "cardio", "neck"];
const GEMINI_MODEL = "gemini-3.6-flash";
const UA = { "User-Agent": "Mozilla/5.0" };

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
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const txt = (await res.text()).replace(/^\uFEFF/, "");
  return JSON.parse(txt);
}

// ---------- 1) gifdotreino.com ----------
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

async function findPrimary(name: string): Promise<{ url: string; name: string } | null> {
  const wanted = norm(name);
  if (!wanted) return null;
  const tokens = wanted.split(" ").filter(Boolean);
  const folders = await getFolders();

  // busca pelo nome inteiro; se vier vazio, busca por cada palavra (maiores primeiro) e exige todas no nome.
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
  if (!results.length) return null;

  const score = (g: Gif) => {
    const n = norm(g.name);
    if (n === wanted) return 0;
    if (n.startsWith(wanted)) return 1;
    if (n.includes(wanted)) return 2;
    return 3 + Math.abs(n.length - wanted.length) / 100;
  };
  const best = [...results].sort((a, b) => score(a) - score(b))[0];
  return { url: new URL(best.path, SITE).href, name: best.name };
}

// ---------- 2) fitsmove.com (inglês) ----------
type FmEx = { name: string; tokens: string[]; gif: string };

const STOP = new Set(["the", "of", "with", "on", "a", "an", "and", "to", "for", "in"]);
const stem = (t: string) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);
const tokenize = (s: string) => norm(s).split(" ").filter((t) => t && !STOP.has(t)).map(stem);

// A lista do site vem das páginas por parte do corpo: cada exercício tem o link /en/e/<id>-<slug>.html e a miniatura
// /images/<id>-<hash>.jpg; o GIF fica em /videos/<id>-<hash>.gif.
let fmCache: FmEx[] | null = null;
async function getFitsmove(): Promise<FmEx[]> {
  if (fmCache) return fmCache;
  const pages = await Promise.all(FM_BODY_PARTS.map(async (b) => {
    try {
      const r = await fetch(`${FM}/en/b/${b}.html`, { signal: AbortSignal.timeout(10000), headers: UA });
      return r.ok ? await r.text() : "";
    } catch {
      return "";
    }
  }));
  const byId = new Map<string, FmEx>();
  for (const html of pages) {
    const hashes = new Map<string, string>();
    for (const m of html.matchAll(/\/images\/(\d{3,5})-([A-Za-z0-9_]+)\.jpg/g)) hashes.set(m[1], m[2]);
    for (const m of html.matchAll(/\/en\/e\/(\d{3,5})-([a-z0-9-]+)\.html/g)) {
      const hash = hashes.get(m[1]);
      if (!hash || byId.has(m[1])) continue;
      const name = m[2].replace(/-/g, " ");
      byId.set(m[1], { name, tokens: tokenize(name), gif: `${FM}/videos/${m[1]}-${hash}.gif` });
    }
  }
  const list = [...byId.values()];
  if (list.length > 200) fmCache = list; // só guarda se carregou o suficiente
  return list;
}

async function gemini(prompt: string): Promise<any | null> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return null;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 400, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } },
    }),
  });
  if (!res.ok) {
    console.error("Gemini API error:", await res.text());
    return null;
  }
  const d = await res.json();
  const raw = (d.candidates?.[0]?.content?.parts || [])
    .filter((p: { text?: string }) => typeof p.text === "string")
    .map((p: { text: string }) => p.text)
    .join("\n")
    .trim();
  try {
    return JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch {
    console.error("Resposta da IA ilegível:", raw);
    return null;
  }
}

async function findFitsmove(name: string): Promise<{ url: string; name: string } | null> {
  const exercises = await getFitsmove();
  if (!exercises.length) return null;

  // 1) nome do exercício em inglês, no estilo da biblioteca (ExerciseDB)
  const tr = await gemini(
    `Exercício de academia em português: "${name}".\n` +
    `Dê até 3 nomes em inglês, do mais provável ao menos provável, no estilo da biblioteca ExerciseDB ` +
    `(ex.: "lever leg extension", "sled 45 degrees leg press", "barbell full squat", "dumbbell lunge", "lever seated leg curl", "push-up"). ` +
    `Inclua o equipamento quando fizer parte do nome.\n` +
    `Responda APENAS com JSON: {"names": ["...", "..."]}`
  );
  const queries: string[] = (Array.isArray(tr?.names) ? tr.names : []).filter((x: unknown) => typeof x === "string" && x.trim()).slice(0, 3);
  if (!queries.length) return null;

  // 2) pré-seleção: exercícios que contêm as palavras do nome traduzido
  const scored = exercises.map((e) => {
    let best = 0, exact = false;
    for (const q of queries) {
      const qt = tokenize(q);
      if (!qt.length) continue;
      const hit = qt.filter((t) => e.tokens.includes(t)).length;
      const recall = hit / qt.length, precision = hit / e.tokens.length;
      if (recall === 1 && precision === 1) exact = true;
      best = Math.max(best, recall * 0.7 + precision * 0.3);
    }
    return { e, best, exact };
  }).filter((x) => x.best >= 0.5).sort((a, b) => b.best - a.best);
  if (!scored.length) return null;
  const exact = scored.find((x) => x.exact);
  if (exact) return { url: exact.e.gif, name: exact.e.name };

  // 3) a IA escolhe, entre as opções, a que é o mesmo exercício (ou nenhuma)
  const shortlist = scored.slice(0, 25).map((x) => x.e);
  const pick = await gemini(
    `Exercício procurado (em português): "${name}".\nOpções (em inglês):\n` +
    shortlist.map((e, i) => `${i + 1}. ${e.name}`).join("\n") +
    `\n\nQual opção é o mesmo exercício, com o mesmo movimento e o mesmo equipamento? ` +
    `Se nenhuma for realmente o mesmo exercício, responda null.\nResponda APENAS com JSON: {"choice": <número ou null>}`
  );
  const idx = Number(pick?.choice);
  if (!Number.isInteger(idx) || idx < 1 || idx > shortlist.length) return null;
  const chosen = shortlist[idx - 1];
  return { url: chosen.gif, name: chosen.name };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { name } = await req.json();
    if (!norm(name)) return json({ found: false });

    const primary = await findPrimary(name).catch((e) => { console.error("gifdotreino:", e); return null; });
    if (primary) return json({ found: true, ...primary, source: "gifdotreino" });

    const secondary = await findFitsmove(name).catch((e) => { console.error("fitsmove:", e); return null; });
    if (secondary) return json({ found: true, ...secondary, source: "fitsmove" });

    return json({ found: false });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
