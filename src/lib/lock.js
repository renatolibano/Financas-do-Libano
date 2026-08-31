// PIN local: só uma tela de bloqueio antes de abrir o app neste aparelho —
// não criptografa nada, os dados continuam acessíveis normalmente pela
// nuvem/armazenamento local. É um obstáculo simples contra alguém pegando o
// celular destravado e abrindo o app direto. Guarda o hash (nunca o PIN em
// texto puro) no localStorage.
export async function hashPin(pin) {
  const enc = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
