// Diff palavra a palavra (maior subsequência comum) para revisar correções de IA alteração por alteração.
// tokenize: palavras e pontuação, cada uma com o espaço que vinha antes dela (sp), para remontar o texto.
const TOKEN_RE = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu;

export function tokenize(text) {
  const out = [];
  let last = 0, m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text))) {
    out.push({ t: m[0], sp: text.slice(last, m.index) });
    last = m.index + m[0].length;
  }
  return out;
}

// Devolve partes: { type: "same", tok } ou { type: "change", id, del: [tokens antigos], ins: [tokens novos], state }.
// state: "pending" | "accepted" | "rejected".
export function diffParts(original, fixed) {
  const a = tokenize(original), b = tokenize(fixed);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i].t === b[j].t ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const parts = [];
  let del = [], ins = [], id = 0;
  const flush = () => { if (del.length || ins.length) { parts.push({ type: "change", id: id++, del, ins, state: "pending" }); del = []; ins = []; } };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i].t === b[j].t) { flush(); parts.push({ type: "same", tok: b[j] }); i++; j++; }
    else if (dp[i + 1][j] > dp[i][j + 1]) del.push(a[i++]); // no empate prefere inserir antes: troca de palavra vira UMA alteração
    else ins.push(b[j++]);
  }
  while (i < n) del.push(a[i++]);
  while (j < m) ins.push(b[j++]);
  flush();
  return parts;
}

export const joinTokens = (toks) => toks.map(k => k.sp + k.t).join("");

// Monta o texto final: alterações recusadas voltam ao original; as demais (aceitas ou pendentes) valem.
export function applyParts(parts) {
  let s = "";
  for (const p of parts) {
    if (p.type === "same") s += p.tok.sp + p.tok.t;
    else s += joinTokens(p.state === "rejected" ? p.del : p.ins);
  }
  return s.replace(/^\s+/, "").replace(/\s+$/, "");
}
