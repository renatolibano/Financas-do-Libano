import { supabase } from "./supabaseClient";

// Gera um código de convite curto (6 caracteres, sem 0/O nem 1/I pra evitar confusão).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(len = 6) {
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// Cria um código de convite vinculado à conta atual (válido por 7 dias, ver schema.sql).
// Tenta algumas vezes em caso de colisão rara de código.
export async function createInviteCode() {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Faça login para gerar um convite.");
  let code = randomCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase.from("invite_codes").insert({ code, created_by: userData.user.id });
    if (!error) return code;
    if (error.code !== "23505") throw new Error(error.message || "Não foi possível gerar o convite.");
    code = randomCode();
  }
  throw new Error("Não foi possível gerar um código. Tente novamente.");
}

// Aceita um código de convite: vincula a conta atual com quem criou o código.
// Roda como função do banco (accept_invite_code) porque a conta que aceita não
// tem permissão de leitura sobre o código de outra pessoa até ele ser validado.
export async function acceptInviteCode(code) {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) throw new Error("Digite o código do convite.");
  const { data, error } = await supabase.rpc("accept_invite_code", { p_code: clean });
  if (error) throw new Error(error.message || "Não foi possível aceitar o convite.");
  return data;
}

// Lista as contas já vinculadas à conta atual (parceiros de metas em conjunto).
export async function getMyPartners() {
  const { data, error } = await supabase.rpc("get_my_partners");
  if (error) throw new Error(error.message || "Não foi possível carregar os parceiros.");
  return data || [];
}
