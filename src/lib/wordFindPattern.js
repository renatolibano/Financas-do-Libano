// Localizar e Substituir do Word — port de wordcraft (crates/engine/src/cmd/find_pattern.rs).
// Caracteres especiais (^p, ^t, ^#, ^$, ^?, ^w…), códigos numéricos (^13, ^0151, ^u8212), a
// linguagem de "Usar curingas" (? * [a-z] [!x] {n,m} @ < > ( ) \1) e opções (maiúsculas, palavra
// inteira, prefixo, sufixo, ignorar pontuação/espaços, regex), traduzidos para RegExp (flag u).
// O texto buscado é o do corpo com uma marca de parágrafo "\r" entre blocos e "\n" nas quebras de
// linha manuais; buildTextMap guarda de onde vem cada caractere para virar um Range no DOM.

export const PARA_MARK = "\r";
export const MAX_PATTERN = 1024;
const MAX_COUNT = 1000;
export const MAX_MATCHES = 5000;

export const DEFAULT_FIND_OPTS = {
  matchCase: false, wholeWord: false, prefix: false, suffix: false,
  ignorePunct: false, ignoreSpace: false, wildcards: false, regex: false,
};

const ANY = "[^\\r\\u{1D}]";
const WORD = "[\\p{L}\\p{N}_]";
const WB_L = `(?<!${WORD})`;
const WB_R = `(?!${WORD})`;

// O que um código ^ vira em "Localizar".
const FIND_CODE = {
  p: "\\r", b: "\\u{1D}", t: "\\t", "?": ANY, "#": "[0-9]", $: "\\p{L}", "^": "\\^", l: "\\n",
  m: "\\u{0C}", n: "\\u{0E}", "+": "\\u{2014}", "=": "\\u{2013}", s: "\\u{A0}", "~": "\\u{2011}",
  "-": "\\u{AD}", w: "[ \\t\\u{A0}]+", g: "\\u{FFFC}", "%": "§", v: "¶",
};
// ...e em "Substituir por".
const REPLACE_CODE = {
  p: "\r", t: "\t", "^": "^", l: "\n", m: "\u000C", n: "\u000E", "+": "\u2014", "=": "\u2013",
  s: "\u00A0", "~": "\u2011", "-": "\u00AD", "%": "§", v: "¶",
};

const isControl = (c) => /\p{Cc}/u.test(c);
function codeChar(n) {
  switch (n) {
    case 13: return PARA_MARK;
    case 11: return "\n";
    case 12: return "\u000C";
    case 14: return "\u000E";
    case 30: return "\u2011";
    case 31: return "\u00AD";
    default: {
      if (!(n >= 0 && n <= 0x10ffff) || (n >= 0xd800 && n <= 0xdfff)) return null;
      const c = String.fromCodePoint(n);
      return isControl(c) && c !== "\t" ? null : c;
    }
  }
}
// Windows-1252: 128–159 são caracteres tipográficos ("^0151" é o travessão).
const ANSI_HIGH = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];
const ansi = (n) => (n >= 128 && n < 160 ? ANSI_HIGH[n - 128] : n);

// Lê o código numérico depois de "^" (13, 0151, u8212) em chars[i]; devolve [caractere, tamanho] ou null.
function numericCode(chars, i) {
  const unicode = chars[i] === "u";
  const start = unicode ? i + 1 : i;
  const max = unicode ? 5 : 4;
  let digits = "";
  while (digits.length < max && /[0-9]/.test(chars[start + digits.length] ?? "")) digits += chars[start + digits.length];
  if (!digits) return null;
  let n = parseInt(digits, 10);
  if (!unicode && digits.startsWith("0")) n = ansi(n);
  const ch = codeChar(n);
  return ch == null ? null : [ch, start - i + digits.length];
}

const escapeLit = (c) => (c === PARA_MARK ? "\\r" : c === "\n" ? "\\n" : c.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&"));
const escapeClass = (c) => (c === PARA_MARK ? "\\r" : c === "\n" ? "\\n" : c.replace(/[\\\]^[-]/g, "\\$&"));
const escapeAll = (s) => Array.from(s).map(escapeLit).join("");

const isPunct = (c) => /[\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e\u2010-\u2027\u00a1\u00bf\u00ab\u00bb]/.test(c);
const isSpace = (c) => c === " " || c === "\t" || c === "\u00a0";

// Busca normal: texto literal com códigos ^, podendo pular pontuação e espaços.
function special(query, o) {
  const chars = Array.from(query);
  const atoms = [];
  let spans = false;
  let i = 0;
  while (i < chars.length) {
    const c = chars[i++];
    if (c === "^" && i < chars.length) {
      const n = chars[i];
      if (FIND_CODE[n] !== undefined) { spans ||= n === "p" || n === "b"; atoms.push(FIND_CODE[n]); i++; continue; }
      const num = numericCode(chars, i);
      if (num) { spans ||= num[0] === PARA_MARK; atoms.push(escapeLit(num[0])); i += num[1]; continue; }
    }
    if ((o.ignorePunct && isPunct(c)) || (o.ignoreSpace && isSpace(c))) continue;
    atoms.push(escapeLit(c));
  }
  const filler = o.ignorePunct && o.ignoreSpace ? "[\\p{P} \\t\\u{A0}]*" : o.ignorePunct ? "\\p{P}*" : o.ignoreSpace ? "[ \\t\\u{A0}]*" : "";
  return [atoms.join(filler), spans];
}

function countOf(body) {
  const bad = () => new Error(`{${body}} não é uma contagem válida`);
  const num = (s) => {
    const t = s.trim();
    if (!t) return null;
    if (!/^[0-9]+$/.test(t)) throw bad();
    const n = parseInt(t, 10);
    if (n > MAX_COUNT) throw new Error(`as contagens vão até ${MAX_COUNT}`);
    return n;
  };
  const m = /[,;]/.exec(body);
  if (!m) { const n = num(body); if (n == null) throw bad(); return `{${n}}`; }
  const a = num(body.slice(0, m.index)) ?? 0;
  const b = num(body.slice(m.index + 1));
  if (b != null && b < a) throw bad();
  return b != null ? `{${a},${b}}` : `{${a},}`;
}

function classOf(inner) {
  let neg = false;
  let chars = inner;
  if (chars[0] === "!") { neg = true; chars = chars.slice(1); }
  if (!chars.length) throw new Error("[ ] precisa de ao menos um caractere");
  let out = neg ? "[^\\r\\u{1D}" : "[";
  let i = 0;
  while (i < chars.length) {
    let c = chars[i];
    if (c === "\\" && i + 1 < chars.length) { i++; c = chars[i]; }
    i++;
    if (chars[i] === "-" && i + 1 < chars.length) {
      const hi = chars[i + 1];
      if (hi < c) throw new Error(`[${c}-${hi}] não está em ordem crescente`);
      out += `${escapeClass(c)}-${escapeClass(hi)}`;
      i += 2;
    } else out += escapeClass(c);
  }
  return out + "]";
}

// "Usar curingas".
function wildcards(query) {
  const chars = Array.from(query);
  let out = "";
  let spans = false;
  let i = 0;
  while (i < chars.length) {
    const c = chars[i++];
    switch (c) {
      case "?": out += ANY; break;
      case "*": out += `${ANY}*?`; break;
      case "@": out += "+"; break;
      case "<": out += `${WB_L}(?=${WORD})`; break;
      case ">": out += `(?<=${WORD})${WB_R}`; break;
      case "(": case ")": out += c; break;
      case "{": {
        const end = chars.indexOf("}", i);
        if (end < 0) throw new Error("um { precisa de um } para fechar");
        out += countOf(chars.slice(i, end).join(""));
        i = end + 1;
        break;
      }
      case "[": {
        const end = chars.indexOf("]", i);
        if (end < 0) throw new Error("um [ precisa de um ] para fechar");
        out += classOf(chars.slice(i, end));
        i = end + 1;
        break;
      }
      case "\\": {
        const n = chars[i];
        if (n !== undefined && /[0-9]/.test(n)) throw new Error("referências (\\1) funcionam em Substituir por, não em Localizar");
        if (n !== undefined) { out += escapeLit(n); i++; } else out += "\\\\";
        break;
      }
      case "^": {
        const n = chars[i];
        if (n === undefined) { out += "\\^"; break; }
        if (FIND_CODE[n] !== undefined) { spans ||= n === "p" || n === "b"; out += FIND_CODE[n]; i++; break; }
        const num = numericCode(chars, i);
        if (num) { spans ||= num[0] === PARA_MARK; out += escapeLit(num[0]); i += num[1]; } else out += "\\^";
        break;
      }
      default: out += escapeLit(c);
    }
  }
  return [out, spans];
}

// Compila o texto de "Localizar". Devolve { regex, spansParas } ou { error }.
export function compileFind(query, o = DEFAULT_FIND_OPTS) {
  if (Array.from(query).length > MAX_PATTERN) return { error: `o texto a localizar passa de ${MAX_PATTERN} caracteres` };
  try {
    let pat, spans = false;
    if (o.regex) pat = query;
    else if (o.wildcards) [pat, spans] = wildcards(query);
    else [pat, spans] = special(query, o);
    const wrap = (p) => `(?:${p})`;
    if (!(o.wildcards && !o.regex)) {
      if (o.wholeWord || (o.prefix && o.suffix)) pat = `${WB_L}${wrap(pat)}${WB_R}`;
      else if (o.prefix) pat = `${WB_L}${wrap(pat)}`;
      else if (o.suffix) pat = `${wrap(pat)}${WB_R}`;
    }
    // a busca com curingas do Word sempre diferencia maiúsculas
    const ci = !o.matchCase && (!o.wildcards || o.regex);
    return { regex: new RegExp(pat, "gu" + (ci ? "i" : "")), spansParas: spans };
  } catch (e) {
    return { error: String(e?.message || e).replace(/^Invalid regular expression: /, "expressão inválida: ") };
  }
}

// ---- Substituir por ----------------------------------------------------------------------------
// Peças: { lit } | { found } (^&) | { group: n } (\1 com curingas) | { clip } (^c)
export function parseReplace(withText, o = DEFAULT_FIND_OPTS) {
  if (o.regex) return [{ lit: withText }];
  const chars = Array.from(withText);
  const out = [];
  let cur = "";
  const flush = () => { if (cur) { out.push({ lit: cur }); cur = ""; } };
  let i = 0;
  while (i < chars.length) {
    const c = chars[i++];
    if (c === "\\" && o.wildcards && i < chars.length) {
      const d = chars[i];
      if (/[1-9]/.test(d)) { flush(); out.push({ group: Number(d) }); i++; continue; }
      cur += d; i++; continue;
    }
    if (c === "^" && i < chars.length) {
      const n = chars[i];
      if (n === "&" || n === "c") { flush(); out.push(n === "&" ? { found: true } : { clip: true }); i++; continue; }
      if (REPLACE_CODE[n] !== undefined) { cur += REPLACE_CODE[n]; i++; continue; }
      const num = numericCode(chars, i);
      if (num) { cur += num[0]; i += num[1]; continue; }
    }
    cur += c;
  }
  flush();
  return out;
}

export const replaceNeedsClipboard = (pieces) => pieces.some((p) => p.clip);

// Texto de uma substituição para uma ocorrência (`m` = resultado de RegExp.exec).
export function expandReplace(pieces, m, clip = "") {
  let out = "";
  for (const p of pieces) {
    if (p.lit !== undefined) out += p.lit;
    else if (p.found) out += m[0];
    else if (p.group) out += m[p.group] ?? "";
    else if (p.clip) out += clip.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
  }
  return out;
}

// Com regex, "Substituir por" segue a sintaxe do JS ($1, $&); devolve o texto expandido.
export function expandRegexReplace(withText, m) {
  return withText.replace(/\$(\$|&|\d{1,2}|<([^>]+)>)/g, (all, k, name) => {
    if (k === "$") return "$";
    if (k === "&") return m[0];
    if (name) return m.groups?.[name] ?? "";
    return m[Number(k)] ?? "";
  });
}

// ---- texto do DOM <-> índices --------------------------------------------------------------------
const BLOCK_TAGS = new Set(["P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "TD", "TH", "TR", "TABLE", "UL", "OL", "FIGURE", "HR"]);
const BLOCK_SEL = "p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre,td,th,tr,table,ul,ol,figure,hr";
const SKIP_SEL = ".word-del, [contenteditable='false'], .word-page-meta, script, style";

// Texto do corpo e de onde vem cada trecho: { text, segs: [{ node, start, len }] }.
export function buildTextMap(root) {
  let text = "";
  const segs = [];
  let started = false;     // já entrou num parágrafo (folha)
  let afterBlock = false;  // acabou de sair de um bloco: texto solto depois pede uma marca de parágrafo
  const walk = (node) => {
    if (node.nodeType === 3) {
      const t = node.nodeValue;
      if (!t) return;
      if (afterBlock && started && !text.endsWith(PARA_MARK)) text += PARA_MARK;
      afterBlock = false;
      segs.push({ node, start: text.length, len: t.length });
      text += t;
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node;
    if (el.matches?.(SKIP_SEL)) return;
    if (el.tagName === "BR") {
      const p = el.parentNode;
      const sole = p && p !== root && Array.from(p.childNodes).every((n) => n === el || (n.nodeType === 3 && !n.nodeValue));
      if (!sole) { afterBlock = false; text += "\n"; }
      return;
    }
    const block = BLOCK_TAGS.has(el.tagName);
    const leaf = block && !el.querySelector(BLOCK_SEL);
    if (leaf) { if (started) text += PARA_MARK; started = true; afterBlock = false; }
    el.childNodes.forEach(walk);
    if (block) afterBlock = true;
  };
  root.childNodes.forEach(walk);
  return { text, segs };
}

const segAt = (segs, idx) => { // última seg com start <= idx
  let lo = 0, hi = segs.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].start <= idx) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
};

// Range do trecho [s, e) do texto mapeado. Marcas virtuais (parágrafo, quebra de linha) não existem no
// DOM: uma busca por "^p" vira um Range que vai do fim de um parágrafo ao início do seguinte.
export function rangeFor(map, s, e) {
  const { segs } = map;
  if (!segs.length) return null;
  const real = (idx) => { const k = segAt(segs, idx); return k >= 0 && idx < segs[k].start + segs[k].len ? k : -1; };
  let sNode, sOff, eNode, eOff;
  const ks = real(s);
  if (ks >= 0) { sNode = segs[ks].node; sOff = s - segs[ks].start; }
  else { // virtual: logo depois do último caractere real antes de s
    const k = segAt(segs, s - 1);
    if (k >= 0) { sNode = segs[k].node; sOff = segs[k].len; } else { sNode = segs[0].node; sOff = 0; }
  }
  const ke = e > 0 ? real(e - 1) : -1;
  if (ke >= 0) { eNode = segs[ke].node; eOff = e - segs[ke].start; }
  else { // virtual: logo antes do primeiro caractere real a partir de e
    let k = segAt(segs, e);
    if (k >= 0 && segs[k].start < e) k++;
    if (k >= 0 && k < segs.length) { eNode = segs[k].node; eOff = 0; } else { const l = segs[segs.length - 1]; eNode = l.node; eOff = l.len; }
  }
  const r = document.createRange();
  r.setStart(sNode, sOff);
  r.setEnd(eNode, eOff);
  if (r.collapsed && e > s && !map.text.slice(s, e).includes("\n") && !map.text.slice(s, e).includes(PARA_MARK)) return null;
  return r;
}

// Todas as ocorrências no corpo: [{ range, m }] (m = resultado do RegExp); ignora ocorrências vazias.
export function findAll(root, compiled) {
  const map = buildTextMap(root);
  const out = [];
  const re = compiled.regex;
  re.lastIndex = 0;
  let m;
  while (out.length < MAX_MATCHES && (m = re.exec(map.text)) !== null) {
    if (m[0] === "") { re.lastIndex++; continue; }
    const range = rangeFor(map, m.index, m.index + m[0].length);
    if (range) out.push({ range, m });
  }
  return out;
}
