// AutoCorrect / AutoFormat ao digitar do editor "Word".
// Port de wordcraft: crates/engine/src/cmd/text.rs (autoformat, list_autoformat,
// dash_autoformat, border_line, table_line) e crates/engine/src/cmd/tools.rs
// (autocorrect_word, case_fix, ordinal_suffix, starts_sentence, should_capitalize,
// tabela AUTOCORRECT, AutoCorrectPrefs).
//
// Duas camadas:
//  1. Núcleo puro (strings) — sem DOM, testável.
//  2. createAutocorrect() — aplica o núcleo num contentEditable.

const PREFS_KEY = "libano.word.autocorrect";

export const DEFAULT_PREFS = {
  enabled: true,
  replaceText: true,
  twoInitialCaps: true,
  capSentences: true,
  capCells: true,
  capDays: true,
  capsLock: true,
  smartQuotes: true,
  fractions: true,
  ordinals: true,
  dashes: true,
  links: true,
  bullets: true,
  numbering: true,
  borderLines: true,
  entries: [],            // [[de, para]] do usuário
  removed: [],            // entradas internas apagadas
  exceptions: [],         // abreviações extras após as quais a frase não termina
  exceptionsRemoved: [],
  initialCapsExceptions: [],
};

export function loadAutocorrectPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (raw && typeof raw === "object") return { ...DEFAULT_PREFS, ...raw };
  } catch { /* storage indisponível ou JSON inválido: usa o padrão */ }
  return { ...DEFAULT_PREFS };
}

export function saveAutocorrectPrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* sem storage */ }
}

// ---- tabelas (idênticas às do Rust) ----------------------------------------

const SMILEYS = [":-)", ":-(", ":)", ":(", ":|"];

export const AUTOCORRECT = [
  ["teh", "the"], ["adn", "and"], ["recieve", "receive"], ["recieved", "received"],
  ["seperate", "separate"], ["definately", "definitely"], ["occured", "occurred"],
  ["untill", "until"], ["wich", "which"], ["becuase", "because"], ["thier", "their"],
  ["alot", "a lot"], ["accomodate", "accommodate"], ["acheive", "achieve"],
  ["beleive", "believe"], ["calender", "calendar"], ["goverment", "government"],
  ["tommorow", "tomorrow"], ["wierd", "weird"], ["i", "I"], ["dont", "don't"],
  ["cant", "can't"], ["wont", "won't"], ["didnt", "didn't"], ["doesnt", "doesn't"],
  ["isnt", "isn't"], ["(c)", "©"], ["(r)", "®"], ["(tm)", "™"], ["...", "…"],
  ["->", "→"], ["-->", "→"], ["<-", "←"], ["=>", "⇒"], [":)", "☺"], [":-)", "☺"],
  [":(", "☹"], [":-(", "☹"], [":|", "\u{1F610}"], ["1/2", "½"], ["1/4", "¼"], ["3/4", "¾"],
];

const FRACTIONS = ["1/2", "1/4", "3/4"];
const INITIAL_CAPS_EXCEPTIONS = ["CDs", "IDs", "PCs", "TVs", "DJs", "GBs", "KBs", "MBs", "TBs", "VMs"];
const CAPS_LOCK_EXCEPTIONS = ["iOS", "mRNA", "tRNA", "rRNA", "cDNA", "eSIM", "eSATA", "iSCSI", "vCPU"];

// Abreviações cujo ponto não encerra a frase. A lista do WordCraft é em inglês; as
// abreviações em português (última linha) foram acrescentadas para o app em pt-BR.
const NOT_SENTENCE_END = [
  "e.g.", "i.e.", "etc.", "vs.", "cf.", "mr.", "mrs.", "ms.", "dr.", "st.", "no.", "approx.", "fig.", "p.", "pp.", "jr.", "sr.", "ca.", "inc.",
  "ltd.", "co.", "vol.", "a.m.", "p.m.",
  "sra.", "dra.", "prof.", "profa.", "av.", "ex.", "pág.", "págs.", "cap.", "obs.", "tel.", "ltda.", "séc.", "min.", "máx.",
];

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

// ---- utilitários de caracteres ----------------------------------------------

const isAlpha = (c) => /\p{L}/u.test(c);
const isUpper = (c) => c !== c.toLowerCase();
const isLower = (c) => c !== c.toUpperCase();
const isSpace = (c) => /\s/u.test(c);
const chars = (s) => Array.from(s);
const trimEndChars = (s, set) => { let a = chars(s); while (a.length && set.includes(a[a.length - 1])) a.pop(); return a.join(""); };
const trimStartChars = (s, set) => { let a = chars(s); while (a.length && set.includes(a[0])) a.shift(); return a.join(""); };

export function isTurkic(lang) {
  const p = String(lang || "").toLowerCase().split(/[-_]/)[0];
  return ["tr", "tur", "az", "aze", "crh"].includes(p);
}
const upperChar = (c, turkic) => (turkic && c === "i" ? "\u0130" : c.toUpperCase());
const lowerChar = (c, turkic) => (c === "I" && turkic ? "\u0131" : c === "\u0130" ? "i" : c.toLowerCase());

export function isEnglish(lang) {
  const p = String(lang || "").toLowerCase().split(/[-_]/)[0];
  return p === "en" || p === "eng";
}

// ---- núcleo: substituições ----------------------------------------------------

const isEnglishEntry = (from) => chars(from).some(isAlpha) && chars(from).every((c) => isAlpha(c) || c === "'");

export function replacementIn(word, english, prefs = DEFAULT_PREFS) {
  const mine = prefs.entries.find(([a]) => a === word);
  if (mine) return mine[1];
  const hit = AUTOCORRECT
    .filter(([a]) => english || !isEnglishEntry(a))
    .filter(([a]) => !prefs.removed.includes(a) && !prefs.entries.some(([e]) => e === a))
    .filter(([a]) => prefs.fractions || !FRACTIONS.includes(a))
    .find(([a]) => a === word || (chars(a).every(isLower) && word.toLowerCase() === a && isUpper(chars(word)[0])));
  if (!hit) return null;
  const [a, b] = hit;
  if (a !== word && isLower(chars(b)[0])) { const c = chars(b); return c[0].toUpperCase() + c.slice(1).join(""); }
  return b;
}

// TWo INitial CApitals e cAPS LOCK. Devolve { at, letters, reps } ou null.
export function caseFix(prefs, word, turkic = false) {
  if (!prefs.twoInitialCaps && !prefs.capsLock) return null;
  const cs = chars(word);
  const at = cs.findIndex(isAlpha);
  if (at < 0) return null;
  let e = at; while (e < cs.length && isAlpha(cs[e])) e++;
  const letters = cs.slice(at, e);
  const head = cs.slice(0, at), tail = cs.slice(e);
  if (!head.every((c) => "\"'“‘([".includes(c)) || !tail.every((c) => "\"'”’)]".includes(c))) return null;
  if (letters.length < 3) return null;
  const [a, b, ...more] = letters;
  const lettersStr = letters.join("");
  if (prefs.twoInitialCaps && isUpper(a) && isUpper(b) && more.every(isLower)
    && !INITIAL_CAPS_EXCEPTIONS.includes(lettersStr) && !prefs.initialCapsExceptions.includes(lettersStr)) {
    return { at, letters: lettersStr, reps: [a, lowerChar(b, turkic), ...more], twoCaps: true };
  }
  if (prefs.capsLock && isLower(a) && isUpper(b) && more.every(isUpper) && !CAPS_LOCK_EXCEPTIONS.includes(lettersStr)) {
    return { at, letters: lettersStr, reps: [upperChar(a, turkic), lowerChar(b, turkic), ...more.map((c) => lowerChar(c, turkic))] };
  }
  return null;
}

// "1st" -> 2 (tamanho do sufixo a sobrescrever) quando é um ordinal inglês correto.
export function ordinalSuffix(word) {
  const m = /^(\d+)(\D.*)$/.exec(word);
  if (!m) return null;
  const [, num, suffix] = m;
  if (num.length > 9) return null;
  const n = Number(num);
  const r100 = n % 100, r10 = n % 10;
  const want = (r100 >= 11 && r100 <= 13) ? "th" : r10 === 1 ? "st" : r10 === 2 ? "nd" : r10 === 3 ? "rd" : "th";
  return suffix === want ? 2 : null;
}

export function exceptionList(prefs) {
  const removed = prefs.exceptionsRemoved.map((r) => r.toLowerCase());
  const v = NOT_SENTENCE_END.filter((a) => !removed.includes(a)).concat(prefs.exceptions.map((a) => a.toLowerCase()));
  return Array.from(new Set(v)).sort();
}

export function startsSentence(before, exceptions) {
  const t = before.trimEnd();
  if (t === "") return true;
  if (t.length === before.length) return false; // sem espaço entre o texto anterior e a palavra
  const t2 = trimEndChars(t, "\"'”’)]");
  if (!/[.!?]$/.test(t2) || t2.endsWith("..") || t2.endsWith("…")) return false;
  const lastTok = t2.split(/\s/u).pop() || t2;
  const prev = trimStartChars(lastTok, "\"'“‘([");
  const lower = prev.toLowerCase();
  const pc = chars(prev);
  const initial = pc.length === 2 && isUpper(pc[0]);
  return !initial && !exceptions.includes(lower);
}

export function shouldCapitalize(word, next) {
  const trimmed = word.replace(/\.+$/, "");
  if ((next === "." || word.endsWith(".")) && chars(trimmed).length < 2) return false;
  if (word === "e.g." || word === "i.e.") return true;
  const cs = chars(word);
  return cs.length > 0 && isLower(cs[0])
    && cs.every((c) => isAlpha(c) || "'’-.".includes(c))
    && !cs.some(isUpper)
    && !trimmed.includes(".");
}

// Palavra que termina no cursor. `before` = texto do parágrafo até o cursor, incluindo o
// caractere gatilho (espaço ou ,.;:!?) — ou sem ele quando `onEnter`.
// Devolve { start, end, text, format } (substituir before[start..end] por text) ou null.
export function autocorrectWord(before, { onEnter = false, english = false, turkic = false, prefs = DEFAULT_PREFS, inCell = false } = {}) {
  if (!prefs.enabled) return null;
  const all = chars(before);
  const last = all[all.length - 1];
  if (last === undefined) return null;
  if (!(onEnter || last === " " || ",.;:!?".includes(last))) return null;
  const trigger = onEnter ? 0 : 1;
  const body = all.slice(0, all.length - trigger);
  let start = body.length;
  while (start > 0 && !isSpace(body[start - 1])) start--;
  let word = body.slice(start).join("");
  if (!word) return null;
  const startOff = body.slice(0, start).join("").length; // índice UTF-16
  const orig = word;

  // 1) TWo INitial CApitals / cAPS LOCK
  const cf = caseFix(prefs, word, turkic);
  if (cf) {
    const wc = chars(word);
    const fixed = cf.reps.join("");
    word = wc.slice(0, cf.at).join("") + fixed + wc.slice(cf.at + cf.reps.length).join("");
  }

  // 2) substituição da palavra inteira, "wait..." -> "wait…", ou sorriso no fim
  let replaced = false;
  const found = prefs.replaceText ? replacementIn(word, english, prefs) : null;
  if (found != null) { word = found; replaced = true; }
  else if (prefs.replaceText && word.length > 3 && word.endsWith("...")) { word = word.slice(0, -3) + "…"; replaced = true; }
  else if (prefs.replaceText) {
    const m = SMILEYS.find((s) => word.length > s.length && word.endsWith(s));
    if (m) {
      const rep = AUTOCORRECT.find(([a]) => a === m);
      if (rep) { word = word.slice(0, -m.length) + rep[1]; replaced = true; }
    }
  }

  const beforeWord = body.slice(0, start).join("");
  const result = (extra = {}) => ({ start: startOff, end: startOff + orig.length, text: word, changed: word !== orig, ...extra });

  // 3) ordinais -> sobrescrito
  const ord = prefs.ordinals ? ordinalSuffix(word) : null;
  if (ord) return result({ format: { type: "sup", from: startOff + word.length - ord, to: startOff + word.length } });

  // 4) endereços web -> link
  const lower = word.toLowerCase();
  if (prefs.links && (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("www.")) && word.length > 8) {
    const url = trimEndChars(word, ".,;:!?)]\"'”’");
    const href = lower.startsWith("www.") ? `http://${url}` : url;
    return result({ format: { type: "link", from: startOff, to: startOff + url.length, href } });
  }

  // 5) maiúscula no início da frase / nomes de dias
  const sentenceOn = beforeWord.trim() === "" && inCell ? prefs.capCells : prefs.capSentences;
  const first = word.split(/\s+/u).filter(Boolean)[0] || "";
  const next = first.length < word.length ? " " : onEnter ? "\n" : last;
  const sentence = sentenceOn && startsSentence(beforeWord, exceptionList(prefs)) && shouldCapitalize(first, next);
  const day = prefs.capDays && DAYS.includes(first);
  if (sentence || day) {
    const wc = chars(word);
    word = upperChar(wc[0], turkic) + wc.slice(1).join("");
  }
  return result();
}

// "word -- word" -> en dash; "word--word" -> em dash. `before` termina no espaço digitado.
// Devolve { from, to, text } (índices UTF-16 em `before`) ou null.
export function dashAutoformat(before) {
  if (!before.endsWith(" ")) return null;
  const t = before.trimEnd();
  let i = t.lastIndexOf(" -- ");
  if (i >= 0) { const w = t.slice(i + 4); if (w && !w.includes(" ")) return { from: i + 1, to: i + 3, text: "\u2013" }; }
  i = t.lastIndexOf(" - ");
  if (i >= 0 && !t.slice(i + 3).includes(" ")) return { from: i + 1, to: i + 2, text: "\u2013" };
  i = t.lastIndexOf("--");
  if (i > 0 && t[i - 1] !== " ") return { from: i, to: i + 2, text: "\u2014" };
  return null;
}

// Aspas inteligentes: devolve o caractere ou null.
export function smartQuote(c, prev) {
  if (c !== '"' && c !== "'") return null;
  const opening = prev === undefined || isSpace(prev) || "([{<\u2014\u2013\u00AB\u2039\u201E\u201A".includes(prev)
    || (c === '"' && prev === "\u2018") || (c === "'" && prev === "\u201C");
  return c === '"' ? (opening ? "\u201C" : "\u201D") : (opening ? "\u2018" : "\u2019");
}

// Prefixo digitado no início do parágrafo (incluindo o espaço) -> lista.
export const LIST_TRIGGERS = {
  "* ": { tag: "ul", style: "disc", bullet: true },
  "- ": { tag: "ul", style: '"- "', bullet: true },
  "> ": { tag: "ul", style: '"\u27A2 "', bullet: true },
  "-> ": { tag: "ul", style: '"\u2794 "', bullet: true },
  "=> ": { tag: "ul", style: '"\u21E8 "', bullet: true },
  "1. ": { tag: "ol", style: "decimal" },
  "1) ": { tag: "ol", style: "decimal" },
  "a. ": { tag: "ol", style: "lower-alpha" },
  "a) ": { tag: "ol", style: "lower-alpha" },
  "A. ": { tag: "ol", style: "upper-alpha" },
  "i. ": { tag: "ol", style: "lower-roman" },
  "I. ": { tag: "ol", style: "upper-roman" },
};

export function listTrigger(prefix, prefs = DEFAULT_PREFS) {
  const t = LIST_TRIGGERS[prefix];
  if (!t) return null;
  return (t.bullet ? prefs.bullets : prefs.numbering) ? t : null;
}

// Linha de borda: Enter depois de "---", "___", "===", "***", "~~~" ou "###".
export function borderLine(text) {
  if (text.length < 3) return null;
  const c = text[0];
  if (![...text].every((x) => x === c)) return null;
  // CSS não tem borda ondulada: "~" usa tracejado.
  const map = {
    "-": "0.75pt solid", "_": "1.5pt solid", "=": "3px double", "*": "2.25pt dotted", "~": "0.75pt dashed", "#": "4.5px double",
  };
  return map[c] ? { css: `${map[c]} #1a1a1a`, char: c } : null;
}

// "+---+-----+" -> larguras relativas das colunas (nº de hífens), ou null.
export function tableLine(text, maxCols = 63) {
  if (!text.startsWith("+") || !text.endsWith("+") || text.length < 3) return null;
  const cols = [];
  for (const run of text.slice(1, -1).split("+")) {
    if (!run || !/^-+$/.test(run) || cols.length >= maxCols) return null;
    cols.push(run.length);
  }
  return cols;
}

// ============================================================================
// Camada DOM (contentEditable)
// ============================================================================

const BLOCK_SEL = "p,div,li,h1,h2,h3,h4,h5,h6,blockquote,td,th";
const SKIP_SEL = ".word-del, .word-ins, pre, code, [contenteditable='false'], .word-equation, .word-block";
const TRIGGER_CHARS = " ,.;:!?";

function segmentsOf(block) {
  const segs = [];
  let pos = 0;
  const walk = (node) => {
    for (const ch of node.childNodes) {
      if (ch.nodeType === 3) { segs.push({ node: ch, start: pos, len: ch.data.length }); pos += ch.data.length; }
      else if (ch.nodeName === "BR") { segs.push({ br: ch, start: pos, len: 1 }); pos += 1; }
      else if (ch.nodeType === 1) walk(ch);
    }
  };
  walk(block);
  return { segs, text: segs.map((s) => (s.br ? "\n" : s.node.data)).join("") };
}

function caretOffsetIn(block, segs, caret) {
  let off = 0;
  for (const s of segs) {
    if (s.br) {
      const p = s.br.parentNode; const idx = Array.prototype.indexOf.call(p.childNodes, s.br);
      if (caret.comparePoint(p, idx + 1) === -1) off = s.start + 1; else break;
      continue;
    }
    const n = s.node;
    if (n === caret.startContainer) return s.start + caret.startOffset;
    if (caret.comparePoint(n, n.length) === -1) off = s.start + s.len; else break;
  }
  return off;
}

function pointAt(segs, off, preferNext) {
  const textSegs = segs.filter((s) => !s.br);
  for (let i = 0; i < textSegs.length; i++) {
    const s = textSegs[i];
    const inside = preferNext ? off < s.start + s.len : off <= s.start + s.len;
    if (off >= s.start && inside) return { node: s.node, offset: off - s.start };
  }
  const lastSeg = textSegs[textSegs.length - 1];
  return lastSeg ? { node: lastSeg.node, offset: lastSeg.len } : null;
}

function selectOffsets(body, block, from, to) {
  const { segs } = segmentsOf(block);
  const a = pointAt(segs, from, true), b = pointAt(segs, to, false);
  if (!a || !b) return false;
  const r = document.createRange();
  r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  return true;
}

function setCaret(body, block, off) { return selectOffsets(body, block, off, off); }

function replaceOffsets(body, block, from, to, text) {
  if (!selectOffsets(body, block, from, to)) return false;
  if (text === "") { if (from !== to) document.execCommand("delete"); }
  else document.execCommand("insertText", false, text);
  return true;
}

export function createAutocorrect({ getBody, getPrefs, getLang, isTracking, beforeApply, afterApply }) {
  let busy = false;

  const context = () => {
    const body = getBody();
    const sel = window.getSelection();
    if (!body || !sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!body.contains(range.startContainer)) return null;
    const startEl = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
    if (!startEl || startEl.closest(SKIP_SEL)) return null;
    const blockEl = startEl.closest(BLOCK_SEL);
    const block = blockEl && body.contains(blockEl) ? blockEl : body;
    const { segs, text } = segmentsOf(block);
    const off = caretOffsetIn(block, segs, range);
    const lineStart = text.lastIndexOf("\n", off - 1) + 1; // <br> separa "linhas" dentro do bloco
    return { body, block, off, lineStart, before: text.slice(lineStart, off), full: text, range };
  };

  const enabled = () => { const p = getPrefs(); return p.enabled && !isTracking(); };

  const applyList = (ctx, trig) => {
    const { body, block, off, lineStart } = ctx;
    if (block.closest("li") || /^H[1-6]$/.test(block.tagName) || (block === body && lineStart > 0)) return false;
    beforeApply?.();
    if (!replaceOffsets(body, block, lineStart, off, "")) return false;
    document.execCommand(trig.tag === "ol" ? "insertOrderedList" : "insertUnorderedList");
    const sel = window.getSelection();
    let n = sel?.anchorNode; if (n && n.nodeType === 3) n = n.parentElement;
    const list = n?.closest?.(trig.tag);
    if (list && body.contains(list)) list.style.listStyleType = trig.style;
    return true;
  };

  const applyFormat = (ctx, format) => {
    const { body, block } = ctx;
    const cur = context(); // posição do cursor depois da substituição
    const caretOff = cur ? cur.off : ctx.off;
    if (!selectOffsets(body, block, format.from, format.to)) return;
    if (format.type === "sup") { if (!document.queryCommandState("superscript")) document.execCommand("superscript"); }
    else if (format.type === "link") document.execCommand("createLink", false, format.href);
    setCaret(body, block, caretOff);
  };

  const runTrigger = (data) => {
    const prefs = getPrefs();
    let ctx = context();
    if (!ctx) return;
    // 1) lista automática ("* ", "1. ", ...) — só no começo do parágrafo, antes do AutoCorrect
    let listed = false;
    if (data === " ") {
      const trig = listTrigger(ctx.before, prefs);
      if (trig) listed = applyList(ctx, trig);
    }
    if (listed) return;
    // 2) AutoCorrect da palavra que terminou
    const lang = getLang();
    const inCell = !!ctx.block.closest("td,th");
    const res = autocorrectWord(ctx.before, { english: isEnglish(lang), turkic: isTurkic(lang), prefs, inCell });
    if (res && (res.changed || res.format)) {
      beforeApply?.();
      const { body, block, lineStart, off } = ctx;
      if (res.changed) {
        const trigger = ctx.before.slice(res.end);
        replaceOffsets(body, block, lineStart + res.start, off, res.text + trigger);
      }
      const after = context();
      if (res.format && after) applyFormat(after, { ...res.format, from: lineStart + res.format.from, to: lineStart + res.format.to });
      ctx = context();
      if (!ctx) return;
    }
    // 3) travessões
    if (data === " " && prefs.dashes) {
      const d = dashAutoformat(ctx.before);
      if (d) {
        beforeApply?.();
        replaceOffsets(ctx.body, ctx.block, ctx.lineStart + d.from, ctx.lineStart + d.to, d.text);
        // a troca fica no meio da linha: devolve o cursor ao fim do que foi digitado
        setCaret(ctx.body, ctx.block, ctx.off + d.text.length - (d.to - d.from));
      }
    }
  };

  return {
    // onBeforeInput: aspas inteligentes.
    onBeforeInput(e) {
      if (busy || !enabled() || !getPrefs().smartQuotes) return;
      const ne = e.nativeEvent || e;
      if (ne.isComposing || ne.inputType !== "insertText" || !ne.data || ne.data.length !== 1) return;
      const ctx = context();
      if (!ctx) return;
      const prevCh = ctx.before.length ? chars(ctx.before).pop() : undefined;
      const q = smartQuote(ne.data, prevCh);
      if (!q) return;
      e.preventDefault();
      busy = true;
      try { document.execCommand("insertText", false, q); } finally { busy = false; }
    },
    // onInput (depois da inserção nativa): lista, AutoCorrect e travessões.
    onInput(e) {
      if (busy || !enabled()) return false;
      const ne = e.nativeEvent || e;
      if (ne.isComposing || ne.inputType !== "insertText" || !ne.data || ne.data.length !== 1 || !TRIGGER_CHARS.includes(ne.data)) return false;
      busy = true;
      try { runTrigger(ne.data); } finally { busy = false; }
      afterApply?.();
      return true;
    },
    // onKeyDown: Enter encerra a palavra e aplica linhas de borda / tabela "+---+".
    onKeyDown(e) {
      if (busy || e.isComposing || e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || !enabled()) return;
      const prefs = getPrefs();
      const ctx = context();
      if (!ctx) return;
      const { body, block, off, lineStart, full } = ctx;
      const line = full.slice(lineStart);
      const atEnd = off === full.length;
      if (atEnd && !block.closest("li") && block !== body) {
        const b = prefs.borderLines ? borderLine(line) : null;
        if (b) {
          e.preventDefault();
          beforeApply?.();
          replaceOffsets(body, block, lineStart, off, "");
          const prev = block.previousElementSibling;
          const target = prev && prev.matches(BLOCK_SEL) ? prev : block;
          target.style.borderBottom = b.css;
          if (target === block) block.insertAdjacentHTML("afterend", "<div><br></div>");
          afterApply?.();
          return;
        }
        const cols = tableLine(line);
        if (cols && prefs.enabled && block.parentNode === body) {
          e.preventDefault();
          beforeApply?.();
          const total = cols.reduce((a, c) => a + c, 0) || 1;
          const table = document.createElement("table");
          table.className = "word-table";
          const tr = document.createElement("tr");
          cols.forEach((c) => { const td = document.createElement("td"); td.style.width = (100 * c / total).toFixed(2) + "%"; td.innerHTML = "<br>"; tr.appendChild(td); });
          table.appendChild(tr);
          block.textContent = "";
          block.innerHTML = "<br>";
          block.before(table);
          const first = table.querySelector("td");
          const r = document.createRange(); r.setStart(first, 0); r.collapse(true);
          const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
          afterApply?.();
          return;
        }
      }
      // Enter termina a palavra como um espaço faria ("teh" -> "the", maiúscula, link).
      if (off > lineStart) {
        const lang = getLang();
        const res = autocorrectWord(ctx.before, { onEnter: true, english: isEnglish(lang), turkic: isTurkic(lang), prefs, inCell: !!block.closest("td,th") });
        if (res && (res.changed || res.format)) {
          busy = true;
          try {
            beforeApply?.();
            if (res.changed) replaceOffsets(body, block, lineStart + res.start, off, res.text);
            const after = context();
            if (res.format && after) applyFormat(after, { ...res.format, from: lineStart + res.format.from, to: lineStart + res.format.to });
          } finally { busy = false; }
          // deixa o Enter nativo seguir
        }
      }
    },
  };
}
