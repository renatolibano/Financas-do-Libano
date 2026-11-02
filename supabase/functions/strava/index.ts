// Edge Function: strava
// Conecta a conta do Strava ao Libano (OAuth) e importa as corridas para a
// tabela strava_runs. O Client Secret e os tokens ficam só aqui no servidor.
//
// Deploy: supabase functions deploy strava
// Segredos: supabase secrets set STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=...
//
// Ações (body JSON { action, ... }):
//   auth-url   { redirectUri }  -> { url } para abrir a autorização do Strava
//   status                      -> { connected, athleteName, lastSyncedAt }
//   exchange   { code, scope }  -> troca o código por tokens e faz a 1ª importação completa
//   sync       { full? }        -> importa corridas novas (incremental) ou tudo (full)
//   disconnect                  -> revoga o acesso e apaga tokens e corridas importadas

import { createClient } from "jsr:@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("STRAVA_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("STRAVA_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);
const PER_PAGE = 200;
const MAX_PAGES = 10; // até 2.000 atividades por sincronização

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function stravaToken(params: Record<string, string>) {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  if (!res.ok) {
    console.error("Strava token error:", res.status, await res.text());
    throw new HttpError("O Strava recusou a autorização. Tente conectar de novo.", 502);
  }
  return await res.json();
}

// deno-lint-ignore no-explicit-any
async function validAccessToken(admin: any, conn: any) {
  const now = Math.floor(Date.now() / 1000);
  if (conn.expires_at > now + 120) return conn.access_token as string;
  const t = await stravaToken({ grant_type: "refresh_token", refresh_token: conn.refresh_token });
  const { error } = await admin
    .from("strava_connections")
    .update({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at })
    .eq("user_id", conn.user_id);
  if (error) throw new HttpError("Não foi possível renovar o acesso ao Strava.", 500);
  return t.access_token as string;
}

// deno-lint-ignore no-explicit-any
async function runSync(admin: any, userId: string, full: boolean) {
  const { data: conn } = await admin.from("strava_connections").select("*").eq("user_id", userId).maybeSingle();
  if (!conn) throw new HttpError("Strava não conectado.", 400);
  const token = await validAccessToken(admin, conn);

  // Incremental: reimporta os últimos 3 dias (pega edições recentes de atividades)
  const after = full || !conn.last_synced_at
    ? 0
    : Math.max(0, Math.floor(new Date(conn.last_synced_at).getTime() / 1000) - 3 * 86400);

  // deno-lint-ignore no-explicit-any
  const rows: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=${PER_PAGE}&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.status === 429) throw new HttpError("Limite de requisições do Strava atingido. Tente de novo em ~15 minutos.", 429);
    if (res.status === 401) throw new HttpError("O Strava revogou o acesso. Desconecte e conecte de novo.", 401);
    if (!res.ok) {
      console.error("Strava activities error:", res.status, await res.text());
      throw new HttpError("Falha ao buscar as atividades no Strava.", 502);
    }
    const list = await res.json();
    for (const a of list) {
      const type = a.sport_type || a.type;
      if (!RUN_TYPES.has(type)) continue;
      rows.push({
        user_id: userId,
        strava_id: a.id,
        name: a.name ?? "Corrida",
        sport_type: type,
        start_date: a.start_date,
        start_date_local: a.start_date_local,
        distance: a.distance ?? 0,
        moving_time: a.moving_time ?? 0,
        elapsed_time: a.elapsed_time ?? 0,
        elevation: a.total_elevation_gain ?? 0,
        avg_speed: a.average_speed ?? null,
        max_speed: a.max_speed ?? null,
        avg_hr: a.average_heartrate ?? null,
        max_hr: a.max_heartrate ?? null,
        avg_cadence: a.average_cadence ?? null,
        polyline: a.map?.summary_polyline || null,
      });
    }
    if (list.length < PER_PAGE) break;
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from("strava_runs")
      .upsert(rows.slice(i, i + 500), { onConflict: "user_id,strava_id" });
    if (error) {
      console.error("strava_runs upsert error:", error);
      throw new HttpError("Não foi possível salvar as corridas.", 500);
    }
  }

  const lastSyncedAt = new Date().toISOString();
  await admin.from("strava_connections").update({ last_synced_at: lastSyncedAt }).eq("user_id", userId);
  return { imported: rows.length, lastSyncedAt };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return json({ error: "STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET não configurados no projeto Supabase." }, 500);
    }
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado." }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Sessão inválida." }, 401);

    // Cliente de serviço: só ele lê/escreve strava_connections (tokens nunca chegam ao navegador)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "auth-url") {
      if (!body.redirectUri) throw new HttpError("redirectUri é obrigatório.");
      const q = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        redirect_uri: body.redirectUri,
        approval_prompt: "auto",
        scope: "read,activity:read_all",
        state: "strava",
      });
      return json({ url: `https://www.strava.com/oauth/authorize?${q}` });
    }

    if (action === "status") {
      const { data } = await admin
        .from("strava_connections")
        .select("athlete_name,last_synced_at")
        .eq("user_id", user.id)
        .maybeSingle();
      return json({
        connected: !!data,
        athleteName: data?.athlete_name ?? null,
        lastSyncedAt: data?.last_synced_at ?? null,
      });
    }

    if (action === "exchange") {
      if (!body.code) throw new HttpError("code é obrigatório.");
      if (!String(body.scope || "").includes("activity:read")) {
        throw new HttpError("Para ver suas corridas, autorize o acesso às atividades no Strava.");
      }
      const t = await stravaToken({ grant_type: "authorization_code", code: body.code });
      const athlete = t.athlete || {};
      const { error } = await admin.from("strava_connections").upsert({
        user_id: user.id,
        athlete_id: athlete.id ?? null,
        athlete_name: [athlete.firstname, athlete.lastname].filter(Boolean).join(" ") || null,
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expires_at: t.expires_at,
        scope: body.scope,
        last_synced_at: null,
      }, { onConflict: "user_id" });
      if (error) {
        console.error("strava_connections upsert error:", error);
        throw new HttpError("Não foi possível salvar a conexão.", 500);
      }
      const r = await runSync(admin, user.id, true);
      return json({ connected: true, athleteName: [athlete.firstname, athlete.lastname].filter(Boolean).join(" ") || null, ...r });
    }

    if (action === "sync") {
      const r = await runSync(admin, user.id, !!body.full);
      return json(r);
    }

    if (action === "disconnect") {
      const { data: conn } = await admin.from("strava_connections").select("*").eq("user_id", user.id).maybeSingle();
      if (conn) {
        try {
          const token = await validAccessToken(admin, conn);
          await fetch("https://www.strava.com/oauth/deauthorize", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch (e) {
          console.error("Strava deauthorize error:", e);
        }
      }
      await admin.from("strava_runs").delete().eq("user_id", user.id);
      await admin.from("strava_connections").delete().eq("user_id", user.id);
      return json({ connected: false });
    }

    throw new HttpError("Ação inválida.");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error("strava function error:", e);
    return json({ error: "Erro interno." }, 500);
  }
});
