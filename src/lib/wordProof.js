// Revisão gramatical do editor "Word" (português do Brasil e inglês).
// Port de wordcraft: crates/proof/src/pt/grammar.rs (regras em português, mensagens em
// português), crates/proof/src/lib.rs (words, grammar_en) e affix.rs (capitalize).
//
// As regras são baratas e conservadoras (ficam quietas na dúvida):
//  - palavra repetida ("ele ele"), exceto repetições legítimas ("sim sim", "não não");
//  - espaço antes da pontuação e espaço duplo (emoticons, reticências e ".5" são ignorados);
//  - letra maiúscula no início da frase (conhece abreviações, iniciais, ordinais, reticências
//    e travessões de diálogo, depois dos quais minúscula está correta);
//  - sinal repetido (",,", "..", ";;").
// A ortografia em português fica por conta do corretor do navegador (o WordCraft usa o
// dicionário Hunspell pt_BR instalado no sistema, que não dá para empacotar aqui).
//
// Camada 1: núcleo puro (strings). Camada 2 (DOM): collectGrammarIssues / realce.

const CLOSING = ['"', "”", "’", "'", ")", "»", "]", "\u0001"];
const OPENING = ['"', "“", "«", "(", "[", "'", "‚", "—"];

const PT_ALLOWED_REPEATS = ["sim", "não", "ora", "olha", "já", "bem", "muito", "vai", "lá", "cá", "aí", "ha", "he", "hi", "oh", "ah", "ai", "ui", "uf", "uxa", "oba", "viva",
  "psiu", "olá", "tchau", "xau", "adeus", "devagar"];

const PT_ABBREVIATIONS = ["etc", "ex", "pág", "págs", "séc", "sécs", "fl", "av", "vol", "p", "pp", "ed", "tel", "min", "max", "art", "par", "prof", "profa", "dr", "dra",
  "sr", "sra", "srta", "eng", "arq", "op", "cit", "cf", "ibid", "id", "vide", "seg", "ter", "qua", "qui", "sex", "sáb", "dom", "jan", "fev", "mar",
  "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez", "s.a", "d.c", "a.c", "pg", "ref", "cod", "dept", "univ", "inst", "lat", "ing",
  "esp", "fr", "it", "al", "obs", "att"];

const isAlpha = (c) => /\p{L}/u.test(c);
const isLower = (c) => c !== c.toUpperCase();
const capitalize = (w) => { const cs = Array.from(w); return cs.length ? cs[0].toUpperCase() + cs.slice(1).join("") : ""; };

// Limites das palavras: letras/dígitos, apóstrofos e hífens (que são aparados nas pontas).
export function words(text) {
  const out = [];
  let start = -1, i = 0;
  const isW = (c) => /[\p{L}\p{N}'’-]/u.test(c);
  for (const c of text) {
    const w = isW(c);
    if (start < 0 && w) start = i;
    else if (start >= 0 && !w) { out.push([start, i]); start = -1; }
    i += c.length;
  }
  if (start >= 0) out.push([start, text.length]);
  const res = [];
  for (const [a, b] of out) {
    const w = text.slice(a, b);
    const lead = w.length - w.replace(/^['’-]+/, "").length;
    const trail = w.length - w.replace(/['’-]+$/, "").length;
    if (a + lead < b - trail) res.push([a + lead, b - trail]);
  }
  return res;
}

const issue = (start, end, message, suggestions, lang) => ({ start, end, kind: "grammar", message, suggestions, lang });
const trimStartSet = (s, set) => { let i = 0; const a = Array.from(s); while (i < a.length && set.includes(a[i])) i++; return a.slice(i).join(""); };

// ---- Português ----------------------------------------------------------------------------

function abbreviationOrNumber(prev) {
  const cs = Array.from(prev);
  return cs.length <= 1 || /[0-9]/.test(prev) || cs.every((c) => "IVXLCDM".includes(c)) || PT_ABBREVIATIONS.includes(prev.toLowerCase());
}

function ptEndsSentence(gap, prev) {
  const t = trimStartSet(gap, CLOSING);
  const end = Array.from(t)[0];
  if (!end || !".!?".includes(end) || t.startsWith("..")) return false;
  if (end === "." && abbreviationOrNumber(prev)) return false;
  const rest = trimStartSet(t.replace(/^[.!?]+/, ""), CLOSING);
  return /^\s/u.test(rest) && Array.from(rest.trimStart()).every((c) => OPENING.includes(c));
}

function ptRepeatedWords(text, ws, v) {
  for (let k = 0; k + 1 < ws.length; k++) {
    const [a0, b0] = ws[k], [a1, b1] = ws[k + 1];
    const w0 = text.slice(a0, b0), w1 = text.slice(a1, b1), gap = text.slice(b0, a1);
    if (gap && /^\s+$/u.test(gap) && Array.from(w0).every(isAlpha) && w0.toLowerCase() === w1.toLowerCase() && !PT_ALLOWED_REPEATS.includes(w0.toLowerCase())) {
      v.push(issue(a0, b1, `Palavra repetida: "${w1}"`, [w0], "pt"));
    }
  }
}

function ptSpaces(text, v) {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== " ") continue;
    const rest = Array.from(text.slice(i + 1, i + 5));
    const p = rest[0];
    if (p === undefined) continue;
    const after = rest[1];
    let flag = false;
    switch (p) {
      case ",": flag = true; break;
      case ";": flag = !(after !== undefined && ")(-PD".includes(after)); break; // ";)" e ";-)" são emoticons
      case ".": flag = after !== "." && !(after !== undefined && /[0-9]/.test(after)); break; // " ..." reticências, " .5" número
      case ":": case "!": case "?": flag = after === undefined || /\s/u.test(after) || ['"', "”", "’", "!", "?"].includes(after); break;
      default:
    }
    if (flag) v.push(issue(i, i + 1 + p.length, "Espaço antes da pontuação", [p], "pt"));
  }
  let pos = 0;
  for (;;) {
    const i = text.indexOf("  ", pos);
    if (i < 0) break;
    pos = i + 2;
    if (i > 0 && text.slice(0, i).endsWith(" ")) continue;
    v.push(issue(i, i + 2, "Espaço duplo", [" "], "pt"));
  }
}

function ptSentenceCapitals(text, ws, capitalFirst, v) {
  const listItem = /[,;]$/.test(text.trimEnd()); // itens de lista ("– maçãs,") podem começar em minúscula
  ws.forEach(([a, b], k) => {
    const w = text.slice(a, b);
    let starts;
    if (k === 0) starts = capitalFirst && !listItem && Array.from(text.slice(0, a)).every((c) => /\s/u.test(c) || OPENING.includes(c));
    else { const [pa, pb] = ws[k - 1]; starts = ptEndsSentence(text.slice(pb, a), text.slice(pa, pb)); }
    const first = Array.from(w)[0];
    if (starts && first && isLower(first) && first !== first.toUpperCase() && Array.from(w).every(isAlpha)) {
      v.push(issue(a, b, "Letra maiúscula no início da frase", [capitalize(w)], "pt"));
    }
  });
}

function ptDoubledPunctuation(text, v) {
  let i = 0;
  while (i < text.length) {
    const b = text[i];
    if (b !== "," && b !== "." && b !== ";") { i++; continue; }
    let run = 0;
    while (text[i + run] === b) run++;
    const flag = b === "." ? run === 2 : run >= 2;
    if (flag) v.push(issue(i, i + run, "Sinal repetido", b === "." ? [".", "…"] : [b], "pt"));
    i += Math.max(run, 1);
  }
}

export function ptGrammar(text, capitalFirst = true) {
  const ws = words(text);
  const v = [];
  ptRepeatedWords(text, ws, v);
  ptSpaces(text, v);
  ptSentenceCapitals(text, ws, capitalFirst, v);
  ptDoubledPunctuation(text, v);
  return v.sort((x, y) => x.start - y.start || x.end - y.end);
}

// ---- Inglês (lib.rs grammar_en) --------------------------------------------------------------

const startsConsonantSound = (w) => ["uni", "use", "usu", "eu", "one", "once", "ubiq", "uti", "ure", "uro"].some((p) => w.toLowerCase().startsWith(p));

export function enGrammar(text, capitalFirst = true) {
  const v = [];
  const ws = words(text);
  const en = (start, end, message, suggestions) => issue(start, end, message, suggestions, "en");
  for (let k = 0; k + 1 < ws.length; k++) {
    const [a0, b0] = ws[k], [a1, b1] = ws[k + 1];
    const w0 = text.slice(a0, b0), w1 = text.slice(a1, b1), gap = text.slice(b0, a1);
    if (gap.trim() === "" && w0.toLowerCase() === w1.toLowerCase() && Array.from(w0).every(isAlpha) && !["had", "that", "bye", "so"].includes(w0.toLowerCase())) {
      v.push(en(a0, b1, `Repeated word: "${w1}"`, [w0]));
    }
    const c1 = Array.from(w1)[0];
    if (gap === " " && (w0 === "a" || w0 === "A") && c1 && "aeiouAEIOU".includes(c1) && !startsConsonantSound(w1)) v.push(en(a0, b0, 'Use "an" before a vowel sound', [w0 === "A" ? "An" : "an"]));
    if (gap === " " && (w0 === "an" || w0 === "An") && c1 && isAlpha(c1) && !"aeiouAEIOUhH".includes(c1) && !Array.from(w1).every((c) => c !== c.toLowerCase())) {
      v.push(en(a0, b0, 'Use "a" before a consonant sound', [w0 === "An" ? "A" : "a"]));
    }
  }
  for (const needle of [" ,", " .", " ;"]) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(needle, from);
      if (i < 0) break;
      from = i + needle.length;
      const r = text.slice(i + 2);
      if (r.startsWith(".") || r.startsWith(",")) continue;
      v.push(en(i, i + 2, "Remove the space before the punctuation", [text.slice(i + 1, i + 2)]));
    }
  }
  let pos = 0;
  for (;;) {
    const i = text.indexOf("  ", pos);
    if (i < 0) break;
    pos = i + 2;
    if (i > 0 && text.slice(0, i).endsWith(" ")) continue;
    v.push(en(i, i + 2, "Extra space", [" "]));
  }
  let afterEnd = capitalFirst;
  for (const [a, b] of ws) {
    const w = text.slice(a, b);
    const first = Array.from(w)[0];
    if (afterEnd && first && isLower(first) && Array.from(w).every(isAlpha)) v.push(en(a, b, "Capitalize the first word of a sentence", [capitalize(w)]));
    const tail = text.slice(b);
    const punct = tail.replace(/^["”)']+/, "");
    afterEnd = /^[.!?]/.test(punct) && !punct.startsWith("..") && punct.replace(/^[.!?"”)]+/, "").startsWith(" ");
  }
  return v.sort((x, y) => x.start - y.start);
}

// Idioma BCP 47 -> regras ("pt-BR" -> português; "en-US" -> inglês; outros: nenhuma, como no WordCraft).
export function proofLangOf(tag) {
  const p = String(tag || "pt-BR").toLowerCase().split(/[-_]/)[0];
  return p === "pt" || p === "por" ? "pt" : p === "en" || p === "eng" ? "en" : null;
}

export function checkGrammar(text, lang, capitalFirst = true) {
  const l = proofLangOf(lang);
  return l === "pt" ? ptGrammar(text, capitalFirst) : l === "en" ? enGrammar(text, capitalFirst) : [];
}

// ============================================================================
// Camada DOM
// ============================================================================

const BLOCK_SEL = "p,div,li,h1,h2,h3,h4,h5,h6,blockquote,td,th";
const SKIP_SEL = ".word-del, pre, code, [contenteditable='false'], .word-equation, .word-block, .word-page-meta, .word-header-band, .word-footer-band, .word-comment-box";

// Blocos de texto "folha" (sem outro bloco dentro) do corpo, com seus nós de texto.
function leafBlocks(body) {
  const blocks = [];
  const consider = (el) => {
    if (el.closest(SKIP_SEL)) return;
    const hasBlockChild = Array.from(el.children).some((c) => c.matches(BLOCK_SEL) || c.matches("ul,ol,table"));
    if (!hasBlockChild) blocks.push(el);
  };
  body.querySelectorAll(BLOCK_SEL).forEach(consider);
  if (!blocks.length) blocks.push(body);
  return blocks;
}

function blockText(block) {
  const segs = [];
  let pos = 0;
  const walk = (node) => {
    for (const ch of node.childNodes) {
      if (ch.nodeType === 3) { segs.push({ node: ch, start: pos }); pos += ch.data.length; }
      else if (ch.nodeName === "BR") { segs.push({ br: true, start: pos }); pos += 1; }
      else if (ch.nodeType === 1 && !ch.matches(SKIP_SEL)) walk(ch);
    }
  };
  walk(block);
  return { segs, text: segs.map((s) => (s.br ? "\n" : s.node.data)).join("") };
}

function rangeFor(segs, start, end) {
  const textSegs = segs.filter((s) => !s.br);
  const at = (off, preferNext) => {
    for (const s of textSegs) {
      const len = s.node.data.length;
      if (off >= s.start && (preferNext ? off < s.start + len : off <= s.start + len)) return { node: s.node, offset: off - s.start };
    }
    return null;
  };
  const a = at(start, true), b = at(end, false);
  if (!a || !b) return null;
  const r = document.createRange();
  r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset);
  return r;
}

// Todos os problemas do documento: [{ id, block, text, issue, range }].
export function collectGrammarIssues(body, lang, ignored = new Set(), limit = 2000) {
  const out = [];
  if (!body || !proofLangOf(lang)) return out;
  const blocks = leafBlocks(body).slice(0, limit);
  for (const block of blocks) {
    const { segs, text } = blockText(block);
    if (!text.trim()) continue;
    const isListItem = !!block.closest("li");
    // cada "linha" (separada por <br>) é um parágrafo para as regras
    let offset = 0;
    for (const line of text.split("\n")) {
      for (const it of checkGrammar(line, lang, !isListItem)) {
        const key = `${it.message}|${line.slice(it.start, it.end)}`;
        if (ignored.has(key)) continue;
        const range = rangeFor(segs, offset + it.start, offset + it.end);
        if (range) out.push({ id: `${out.length}`, key, block, sentence: line, issue: it, range });
      }
      offset += line.length + 1;
    }
  }
  return out;
}

// Realce ondulado azul sem alterar o HTML (CSS Custom Highlight API; ignorado onde não existe).
export function setGrammarHighlights(found) {
  try {
    if (typeof CSS === "undefined" || !CSS.highlights || typeof Highlight === "undefined") return false;
    if (!found || !found.length) { CSS.highlights.delete("word-grammar"); return true; }
    CSS.highlights.set("word-grammar", new Highlight(...found.map((f) => f.range)));
    return true;
  } catch { return false; }
}

// Aplica uma sugestão: seleciona o trecho e troca pelo texto (entra no desfazer do navegador).
export function applyGrammarSuggestion(body, item, text) {
  body.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(item.range);
  document.execCommand("insertText", false, text);
}

export function selectGrammarIssue(body, item) {
  body.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(item.range);
  const el = item.block.nodeType === 1 ? item.block : item.block.parentElement;
  el?.scrollIntoView({ block: "center", behavior: "smooth" });
}
