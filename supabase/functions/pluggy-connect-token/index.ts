// Edge Function: pluggy-connect-token
// Gera um "connect token" de curta duração (30 min) para o widget Pluggy Connect
// abrir no navegador do usuário. O CLIENT_ID e CLIENT_SECRET da Pluggy nunca
// saem do servidor — só o connect token (de acesso bem restrito) vai pro app.
//
// Deploy: supabase functions deploy pluggy-connect-token
// Configurar as chaves secretas (uma vez só):
//   supabase secrets set PLUGGY_CLIENT_ID=seu-client-id
//   supabase secrets set PLUGGY_CLIENT_SECRET=seu-client-secret

import { createClient } from "jsr:@supabase/supabase-js@2";

const PLUGGY_CLIENT_ID = Deno.env.get("PLUGGY_CLIENT_ID");
const PLUGGY_CLIENT_SECRET = Deno.env.get("PLUGGY_CLIENT_SECRET");
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
    if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
      return new Response(
        JSON.stringify({ error: "PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET não configurados no projeto Supabase." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Confirma que quem está chamando é um usuário autenticado
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

    // Opcional: se o app estiver atualizando uma conexão já existente
    // (reconectar/renovar credenciais), o front pode mandar { itemId }.
    let itemId;
    try {
      const body = await req.json();
      itemId = body?.itemId;
    } catch {
      // body vazio é ok — é uma conexão nova
    }

    // 1) Autentica com a API da Pluggy usando CLIENT_ID/CLIENT_SECRET → API key (dura 2h)
    const authRes = await fetch("https://api.pluggy.ai/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: PLUGGY_CLIENT_ID,
        clientSecret: PLUGGY_CLIENT_SECRET,
      }),
    });
    if (!authRes.ok) {
      const errText = await authRes.text();
      console.error("Pluggy auth error:", errText);
      return new Response(JSON.stringify({ error: "Falha ao autenticar com a Pluggy." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { apiKey } = await authRes.json();

    // 2) Cria o connect token (dura 30 min), vinculado ao usuário via clientUserId
    const tokenRes = await fetch("https://api.pluggy.ai/connect_token", {
      method: "POST",
      headers: { "content-type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify({
        clientUserId: user.id,
        ...(itemId ? { itemId } : {}),
        options: { avoidDuplicates: true },
      }),
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Pluggy connect_token error:", errText);
      return new Response(JSON.stringify({ error: "Falha ao gerar o token de conexão." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { accessToken } = await tokenRes.json();

    return new Response(JSON.stringify({ connectToken: accessToken }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Erro inesperado no servidor." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
