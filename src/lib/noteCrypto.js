// Senha por nota: o conteúdo é criptografado no aparelho (AES-GCM, chave derivada da senha
// com PBKDF2) antes de ir pro banco — sem a senha, nem o servidor consegue ler. Não há
// como recuperar o texto se a senha for esquecida. Formato: "enc1:" + base64(salt|iv|dados).
const PREFIX = "enc1:";
const ITERATIONS = 150000;

const toB64 = (bytes) => { let s = ""; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s); };
const fromB64 = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

export async function encryptText(password, plain) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain || "")));
  const out = new Uint8Array(salt.length + iv.length + data.length);
  out.set(salt, 0); out.set(iv, salt.length); out.set(data, salt.length + iv.length);
  return PREFIX + toB64(out);
}

// Lança erro se a senha estiver errada (a verificação do AES-GCM falha).
export async function decryptText(password, payload) {
  if (typeof payload !== "string" || !payload.startsWith(PREFIX)) throw new Error("formato inválido");
  const raw = fromB64(payload.slice(PREFIX.length));
  const key = await deriveKey(password, raw.slice(0, 16));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(16, 28) }, key, raw.slice(28));
  return new TextDecoder().decode(plain);
}
