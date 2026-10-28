// Campos do editor "Word": códigos de campo (DATE, TIME, TITLE, AUTHOR, NUMWORDS, SEQ, QUOTE,
// IF, COMPARE e fórmulas "= ..."), fórmulas de tabela e as ações de campo do Word
// (alternar códigos, editar, desvincular, bloquear, atualizar, ir para o próximo).
// Port de wordcraft: crates/engine/src/cmd/fields.rs (ações), table_formula.rs (fórmulas de
// tabela: SUM(ABOVE), A1:B3, funções, figuras numéricas \# "0.00"), references.rs (avaliação de
// DATE/TIME/SEQ/NUMWORDS) e layout/src/fields.rs (nome do campo, \* formatos).
//
// Um campo no HTML é:
//   <span class="word-field" contenteditable="false" data-code="SEQ Figura \* ARABIC" data-locked="0">
//     <span class="wf-result">1</span><span class="wf-code">{ SEQ Figura \* ARABIC }</span></span>

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MAX_CODE = 4096;
const MAX_FORMULA = 512;
const MAX_PICTURE = 64;
const MAX_DEPTH = 32;
const MAX_CELL_VISITS = 100000;

// ---------------------------------------------------------------------------
// Números por idioma

const isPt = (lang) => /^pt/i.test(lang || "pt-BR");

export function parseNumber(text, lang = "pt-BR") {
  let t = String(text).trim();
  let negative = false;
  const acc = /^\((.*)\)$/s.exec(t);
  if (acc) { t = acc[1].trim(); negative = true; }
  t = t.replace(/^(R\$|US\$|\$|€|£|¥)\s*/, "").replace(/\s*%$/, "").replace(/[\s\u00A0]/g, "");
  if (!t || !/^[-+]?[0-9.,]+(e[-+]?\d+)?$/i.test(t)) return null;
  let norm;
  if (isPt(lang)) norm = t.replace(/\./g, "").replace(",", ".");
  else norm = t.replace(/,/g, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(norm)) return null;
  const x = Number(norm);
  if (!Number.isFinite(x)) return null;
  return negative ? -Math.abs(x) : x;
}

// O que um campo de fórmula mostra: inteiro como está, senão duas casas decimais.
export function formatResult(v, lang = "pt-BR") {
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2);
  return isPt(lang) ? s.replace(".", ",") : s;
}

function groupThousands(digits) {
  let out = "";
  Array.from(digits).forEach((ch, i) => { if (i > 0 && (digits.length - i) % 3 === 0) out += ","; out += ch; });
  return out;
}

// Figura numérica "\# ..." (0 sempre mostra, # só com valor, , milhares, . decimais, % × 100).
export function formatPicture(value, picture) {
  const sections = picture.split(";");
  let section, x, minus;
  if (value < 0 && sections.length >= 2) { section = sections[1]; x = -value; minus = false; }
  else if (value === 0 && sections.length >= 3) { section = sections[2]; x = 0; minus = false; }
  else { section = sections[0]; x = Math.abs(value); minus = value < 0; }
  const start = section.search(/[#0]/);
  if (start < 0) return section;
  const rest = section.slice(start);
  let len = rest.search(/[^#0,.]/);
  if (len < 0) len = rest.length;
  const core = rest.slice(0, len), suffix = rest.slice(len), prefix = section.slice(0, start);
  if (prefix.includes("%") || suffix.includes("%")) x *= 100;
  const dot = core.indexOf(".");
  const intPic = dot >= 0 ? core.slice(0, dot) : core;
  const fracPic = dot >= 0 ? core.slice(dot + 1) : null;
  const minInt = Math.min((intPic.match(/0/g) || []).length, MAX_PICTURE);
  const maxFrac = fracPic ? Math.min((fracPic.match(/[0#]/g) || []).length, 15) : 0;
  const minFrac = fracPic ? Math.min((fracPic.match(/0/g) || []).length, maxFrac) : 0;
  const scale = 10 ** maxFrac;
  const rounded = Math.round(x * scale) / scale;
  if (!Number.isFinite(rounded)) return formatResult(value);
  const digits = rounded.toFixed(maxFrac);
  let [whole, decimals = ""] = digits.split(".");
  whole = whole === "0" && minInt === 0 ? "" : whole.padStart(minInt, "0");
  if (intPic.includes(",")) whole = groupThousands(whole);
  while (decimals.length > minFrac && decimals.endsWith("0")) decimals = decimals.slice(0, -1);
  const body = decimals ? `${whole}.${decimals}` : whole;
  return `${minus && rounded !== 0 ? "-" : ""}${prefix}${body}${suffix}`;
}

// "= ... \# picture": separa a fórmula da figura.
export function splitSwitch(instr) {
  const m = /\\[#*@]/.exec(instr); // a fórmula termina na primeira opção (\#, \* ou \@)
  return m ? [instr.slice(0, m.index).trimEnd(), instr.slice(m.index)] : [instr, null];
}
function pictureOf(sw) {
  if (!sw) return null;
  const rest = sw.slice(2).trimStart();
  const p = rest.startsWith('"') ? rest.slice(1).split('"')[0] : rest.split(/\s/)[0] || "";
  const pic = Array.from(p).slice(0, MAX_PICTURE).join("");
  return pic || null;
}

// ---------------------------------------------------------------------------
// Fórmulas (table_formula.rs)

class FormulaError extends Error {}
const syntax = (m) => new FormulaError(`erro de sintaxe: ${m}`);
const fail = (m) => new FormulaError(m);
const finite = (x) => { if (!Number.isFinite(x)) throw fail("o resultado não é um número"); return x; };

function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) i++;
    else if (/[0-9.]/.test(ch)) {
      let lit = "";
      while (i < s.length && /[0-9.]/.test(s[i])) lit += s[i++];
      const x = Number(lit);
      if (!/^(\d+\.?\d*|\.\d+)$/.test(lit) || !Number.isFinite(x)) throw syntax(`\`${lit}\` não é um número`);
      out.push({ k: "num", v: x });
    } else if (/[A-Za-z]/.test(ch)) {
      let name = "";
      while (i < s.length && /[A-Za-z0-9]/.test(s[i])) name += s[i++].toUpperCase();
      out.push({ k: "name", v: name });
    } else if ("+-*/^(),:%".includes(ch)) { out.push({ k: "op", v: ch }); i++; }
    else if ("<>=".includes(ch)) {
      const nx = s[i + 1];
      let op = ch, n = 1;
      if (ch === "<" && nx === "=") { op = "<="; n = 2; }
      else if (ch === "<" && nx === ">") { op = "<>"; n = 2; }
      else if (ch === ">" && nx === "=") { op = ">="; n = 2; }
      out.push({ k: "cmp", v: op }); i += n;
    } else throw syntax(`\`${ch}\` não faz parte de uma fórmula`);
  }
  return out;
}

export function cellRef(name) {
  const m = /^([A-Z]+)(\d+)$/.exec(name);
  if (!m) return null;
  let col = 0;
  for (const c of m[1]) col = col * 26 + (c.charCodeAt(0) - 64);
  col -= 1;
  const row = parseInt(m[2], 10) - 1;
  return row >= 0 && col >= 0 && col < 63 && row < 32767 ? [row, col] : null;
}

class FParser {
  constructor(toks) { this.t = toks; this.p = 0; this.depth = 0; }
  peekOp(c) { const t = this.t[this.p]; return !!t && t.k === "op" && t.v === c; }
  eatOp(c) { if (this.peekOp(c)) { this.p++; return true; } return false; }
  enter() { if (++this.depth > MAX_DEPTH) throw syntax("a fórmula tem aninhamento demais"); }
  leave() { this.depth = Math.max(0, this.depth - 1); }
  compare() {
    const lhs = this.expr();
    const t = this.t[this.p];
    if (!t || t.k !== "cmp") return lhs;
    this.p++;
    return { e: "cmp", op: t.v, a: lhs, b: this.expr() };
  }
  expr() {
    let lhs = this.term();
    for (;;) {
      const op = this.eatOp("+") ? "+" : this.eatOp("-") ? "-" : null;
      if (!op) return lhs;
      lhs = { e: "bin", op, a: lhs, b: this.term() };
    }
  }
  term() {
    let lhs = this.power();
    for (;;) {
      const op = this.eatOp("*") ? "*" : this.eatOp("/") ? "/" : null;
      if (!op) return lhs;
      lhs = { e: "bin", op, a: lhs, b: this.power() };
    }
  }
  power() {
    const base = this.postfix();
    if (this.eatOp("^")) { this.enter(); const exp = this.power(); this.leave(); return { e: "bin", op: "^", a: base, b: exp }; }
    return base;
  }
  postfix() { // "50%" = 0,5
    let x = this.unary();
    while (this.eatOp("%")) x = { e: "bin", op: "/", a: x, b: { e: "num", v: 100 } };
    return x;
  }
  unary() {
    if (this.eatOp("-")) { this.enter(); const i = this.unary(); this.leave(); return { e: "neg", a: i }; }
    if (this.eatOp("+")) { this.enter(); const i = this.unary(); this.leave(); return i; }
    return this.primary();
  }
  primary() {
    const t = this.t[this.p++];
    if (!t) throw syntax("a fórmula termina cedo demais");
    if (t.k === "num") return { e: "num", v: t.v };
    if (t.k === "op" && t.v === "(") {
      this.enter();
      const inner = this.compare();
      if (!this.eatOp(")")) throw syntax("falta o `)` de um `(`");
      this.leave();
      return inner;
    }
    if (t.k === "name") {
      const name = t.v;
      if (this.eatOp("(")) {
        this.enter();
        const args = [];
        if (!this.eatOp(")")) {
          for (;;) {
            args.push(this.compare());
            if (this.eatOp(")")) break;
            if (!this.eatOp(",") && !this.eatOp(";")) throw syntax(`\`${name}\` precisa de \`,\` ou \`)\` entre os argumentos`);
          }
        }
        this.leave();
        return { e: "call", name, args };
      }
      const side = { ABOVE: "above", LEFT: "left", RIGHT: "right", BELOW: "below", ACIMA: "above", ESQUERDA: "left", DIREITA: "right", ABAIXO: "below" }[name];
      if (side) return { e: "side", side };
      if (name === "TRUE" || name === "FALSE") return { e: "call", name, args: [] };
      const ref = cellRef(name);
      if (!ref) throw syntax(`\`${name}\` não é uma referência de célula nem uma função`);
      if (this.eatOp(":")) {
        const o = this.t[this.p];
        if (!o || o.k !== "name") throw syntax("um intervalo termina com uma referência de célula, como B4");
        this.p++;
        const ref2 = cellRef(o.v);
        if (!ref2) throw syntax(`\`${o.v}\` não é uma referência de célula`);
        return { e: "range", r0: Math.min(ref[0], ref2[0]), g0: Math.min(ref[1], ref2[1]), r1: Math.max(ref[0], ref2[0]), g1: Math.max(ref[1], ref2[1]) };
      }
      return { e: "cell", r: ref[0], g: ref[1], name };
    }
    throw syntax(`\`${t.v}\` está no lugar errado`);
  }
}

// Grade de uma <table> do editor: células por linha, com colspan/rowspan.
export function tableGrid(table) {
  const rows = Array.from(table.rows);
  const grid = [];
  const cells = [];
  rows.forEach((tr, r) => {
    grid[r] = grid[r] || [];
    cells[r] = [];
    let g = 0;
    Array.from(tr.cells).forEach((td, ci) => {
      while (grid[r][g] !== undefined) g++;
      const cs = Math.max(1, td.colSpan || 1), rs = Math.max(1, td.rowSpan || 1);
      cells[r].push(td);
      for (let dr = 0; dr < rs; dr++) {
        grid[r + dr] = grid[r + dr] || [];
        for (let dg = 0; dg < cs; dg++) grid[r + dr][g + dg] = { td, ci };
      }
      g += cs;
    });
  });
  const cols = Math.max(0, ...grid.map((row) => row.length));
  return { rows, grid, cells, cols };
}

function makeHere(table, td, lang) {
  const tg = tableGrid(table);
  let r = -1, c = -1, g = -1;
  tg.rows.forEach((tr, ri) => { const ci = Array.from(tr.cells).indexOf(td); if (ci >= 0) { r = ri; c = ci; } });
  if (r < 0) throw fail("a fórmula precisa estar numa célula de tabela");
  g = tg.grid[r].findIndex((x) => x && x.td === td);
  return { tg, r, c, g, lang, visits: 0 };
}

const visit = (h, n) => { h.visits += n; if (h.visits > MAX_CELL_VISITS) throw fail("Fórmula complexa demais"); };
const cellNumber = (h, td) => parseNumber(td.textContent.replace(/\u00A0/g, " "), h.lang);
function numberAt(h, r, g) {
  visit(h, 1);
  const hit = h.tg.grid[r] && h.tg.grid[r][g];
  return hit ? cellNumber(h, hit.td) : null;
}

function sideNumbers(h, side) {
  const out = [];
  let started = false;
  const take = (v) => { if (v !== null && v !== undefined) { out.push(v); started = true; return true; } return !started; };
  if (side === "above") for (let r = h.r - 1; r >= 0; r--) { if (!take(numberAt(h, r, h.g))) break; }
  else if (side === "below") for (let r = h.r + 1; r < h.tg.rows.length; r++) { if (!take(numberAt(h, r, h.g))) break; }
  else {
    const row = h.tg.cells[h.r] || [];
    visit(h, row.length);
    const nums = row.map((td) => cellNumber(h, td));
    const order = side === "left" ? Array.from({ length: h.c }, (_, i) => h.c - 1 - i) : Array.from({ length: Math.max(0, nums.length - h.c - 1) }, (_, i) => h.c + 1 + i);
    for (const ci of order) if (!take(nums[ci])) break;
  }
  return out;
}

const scalar = (v) => { if (Array.isArray(v)) throw syntax("um intervalo só pode ser usado dentro de uma função"); return finite(v); };
const truth = (b) => (b ? 1 : 0);

function evalExpr(e, h) {
  switch (e.e) {
    case "num": return e.v;
    case "cell": { const x = numberAt(h, e.r, e.g); if (x === null) throw fail(`${e.name} não contém um número`); return x; }
    case "range": {
      const v = [];
      const rEnd = Math.min(h.tg.rows.length, e.r1 + 1), gEnd = Math.min(h.tg.cols, e.g1 + 1);
      for (let r = e.r0; r < rEnd; r++) {
        let lastTd = null;
        for (let g = e.g0; g < gEnd; g++) {
          const hit = h.tg.grid[r] && h.tg.grid[r][g];
          if (hit && hit.td === lastTd) continue;
          lastTd = hit ? hit.td : null;
          const x = numberAt(h, r, g);
          if (x !== null) v.push(x);
        }
      }
      return v;
    }
    case "side": return sideNumbers(h, e.side);
    case "neg": return -scalar(evalExpr(e.a, h));
    case "bin": {
      const x = scalar(evalExpr(e.a, h)), y = scalar(evalExpr(e.b, h));
      if (e.op === "+") return x + y;
      if (e.op === "-") return x - y;
      if (e.op === "*") return x * y;
      if (e.op === "/") { if (y === 0) throw fail("divisão por zero"); return x / y; }
      return finite(x ** y);
    }
    case "cmp": {
      const x = scalar(evalExpr(e.a, h)), y = scalar(evalExpr(e.b, h));
      return truth({ "=": x === y, "<>": x !== y, "<": x < y, "<=": x <= y, ">": x > y }[e.op] ?? x >= y);
    }
    default: return callFn(e.name, e.args, h);
  }
}

const gather = (args, h) => {
  const all = [];
  for (const a of args) { const v = evalExpr(a, h); if (Array.isArray(v)) all.push(...v); else all.push(finite(v)); }
  return all;
};
const one = (name, args, h) => { if (args.length !== 1) throw fail(`${name} recebe um argumento`); return scalar(evalExpr(args[0], h)); };

function callFn(name, args, h) {
  const needsArgs = ["SUM", "COUNT", "AVERAGE", "MAX", "MIN", "PRODUCT", "ABS", "INT", "SIGN", "ROUND", "MOD", "AND", "OR", "NOT", "IF", "DEFINED"];
  if (!args.length && needsArgs.includes(name)) throw syntax(`${name}() precisa de um argumento`);
  switch (name) {
    case "TRUE": case "FALSE": if (args.length) throw fail(`${name} não recebe argumentos`); return truth(name === "TRUE");
    case "NOT": return truth(one(name, args, h) === 0);
    case "AND": case "OR": {
      const v = gather(args, h);
      if (!v.length) throw fail(`${name} não tem números para testar`);
      return truth(name === "AND" ? v.every((x) => x !== 0) : v.some((x) => x !== 0));
    }
    case "IF":
      if (args.length !== 3) throw fail("IF recebe três argumentos: a condição, o valor se verdadeira e o valor se falsa");
      return scalar(evalExpr(args[0], h)) !== 0 ? scalar(evalExpr(args[1], h)) : scalar(evalExpr(args[2], h));
    case "DEFINED": if (args.length !== 1) throw fail("DEFINED recebe um argumento"); try { evalExpr(args[0], h); return 1; } catch { return 0; }
    case "SUM": return gather(args, h).reduce((a, b) => a + b, 0);
    case "COUNT": return gather(args, h).length;
    case "AVERAGE": { const v = gather(args, h); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; }
    case "MAX": { const v = gather(args, h); return v.length ? Math.max(...v) : 0; }
    case "MIN": { const v = gather(args, h); return v.length ? Math.min(...v) : 0; }
    case "PRODUCT": { const v = gather(args, h); return v.length ? v.reduce((a, b) => a * b, 1) : 1; }
    case "ABS": return Math.abs(one(name, args, h));
    case "INT": return Math.floor(one(name, args, h));
    case "SIGN": { const x = one(name, args, h); return x === 0 ? 0 : Math.sign(x); }
    case "ROUND": {
      if (args.length !== 2) throw fail("ROUND recebe dois argumentos");
      const x = scalar(evalExpr(args[0], h));
      const digits = Math.trunc(Math.min(15, Math.max(-15, scalar(evalExpr(args[1], h)))));
      const scale = 10 ** digits, scaled = x * scale;
      return Number.isFinite(scaled) ? finite(Math.round(scaled) / scale) : finite(x);
    }
    case "MOD": {
      if (args.length !== 2) throw fail("MOD recebe dois argumentos");
      const x = scalar(evalExpr(args[0], h)), y = scalar(evalExpr(args[1], h));
      if (y === 0) throw fail("divisão por zero");
      return x - y * Math.floor(x / y);
    }
    default: throw fail(`função de fórmula desconhecida \`${name}\``);
  }
}

// Valor de uma fórmula dentro de uma célula. `table`/`td`: onde o campo está (opcional fora de tabela).
export function evaluateFormula(formula, { table = null, td = null, lang = "pt-BR" } = {}) {
  if (formula.length > MAX_FORMULA) throw syntax(`a fórmula tem mais de ${MAX_FORMULA} caracteres`);
  let body = formula.trim();
  if (body.startsWith("=")) body = body.slice(1);
  const parser = new FParser(tokenize(body));
  const expr = parser.compare();
  if (parser.p !== parser.t.length) throw syntax("texto inesperado depois da fórmula");
  const here = table && td ? makeHere(table, td, lang) : { tg: { rows: [], grid: [], cells: [], cols: 0 }, r: 0, c: 0, g: 0, lang, visits: 0 };
  return finite(scalar(evalExpr(expr, here)));
}

// ---------------------------------------------------------------------------
// Código de campo

// "SEQ Figura \* ARABIC" -> { name: "SEQ", args: ["Figura"], switches: [["*","ARABIC"]], raw }
export function parseFieldCode(code) {
  const raw = String(code).trim();
  const toks = [];
  const re = /"((?:[^"\\]|\\.)*)"|(\\[*#@a-zA-Z])\s*|(\S+)/g;
  let m;
  const body = raw.replace(/^=\s*/, "= ");
  while ((m = re.exec(body))) {
    if (m[1] !== undefined) toks.push({ q: true, v: m[1].replace(/\\(.)/g, "$1") });
    else if (m[2] !== undefined) toks.push({ sw: m[2][1] });
    else toks.push({ v: m[3] });
  }
  const name = (toks[0] && toks[0].v ? toks[0].v : "").replace(/^=/, "=").toUpperCase();
  const args = [], switches = [];
  for (let i = 1; i < toks.length; i++) {
    if (toks[i].sw) {
      const nx = toks[i + 1];
      if (nx && !nx.sw && "*#@".includes(toks[i].sw)) { switches.push([toks[i].sw, nx.v]); i++; }
      else switches.push([toks[i].sw, null]);
    } else args.push(toks[i]);
  }
  return { name, args, switches, raw };
}
export const fieldName = (code) => (String(code).trim().split(/\s+/)[0] || "").replace(/^=/, "=").toUpperCase();

// ---- indicadores e estilos (REF, PAGEREF, STYLEREF) -------------------------------------------------

const cssq = (s) => String(s).replace(/["\\]/g, "\\$&");
export function findBookmark(body, name) {
  return body.querySelector(`.word-bookmark[data-bookmark-name="${cssq(name)}"]`);
}
// Texto do indicador: o trecho que estava selecionado quando foi criado (ao vivo) ou, sem trecho, o
// texto guardado no marcador. Um indicador de ponto (sem texto) devolve null.
export function bookmarkText(body, name) {
  const wrap = body.querySelector(`.word-bookmark-text[data-bookmark-for="${cssq(name)}"]`);
  if (wrap) return (wrap.textContent || "").replace(/\s+/g, " ").trim();
  const mark = findBookmark(body, name);
  const saved = mark && mark.dataset.bookmarkText;
  return saved ? saved : null;
}

// "Título 1", "Heading 2", "3", "Título", "Subtítulo", "Citação", "Legenda" -> seletor CSS.
export function styleSelector(name) {
  const t = String(name).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let m;
  if ((m = /^(?:titulo|heading|cabecalho)?\s*([1-9])$/.exec(t))) return `h${m[1]}`;
  if (t === "titulo" || t === "title") return ".word-title";
  if (t === "subtitulo" || t === "subtitle") return ".word-subtitle";
  if (t === "citacao" || t === "quote" || t === "citacao intensa") return "blockquote";
  if (t === "legenda" || t === "caption") return ".word-caption";
  if (t === "normal") return "p:not(.word-title):not(.word-subtitle):not(.word-caption)";
  return null;
}

// No corpo: do parágrafo do campo para trás, até o começo; se não houver, o primeiro adiante.
export function findStyleRef(body, fieldEl, name) {
  const sel = styleSelector(name);
  if (!sel) return null;
  const all = Array.from(body.querySelectorAll(sel)).filter((e) => !e.closest(".word-field, .word-page-meta, .word-block"));
  if (!all.length) return null;
  if (!fieldEl) return all[0];
  let before = null;
  for (const e of all) {
    if (e.contains(fieldEl) || (e.compareDocumentPosition(fieldEl) & Node.DOCUMENT_POSITION_FOLLOWING)) before = e;
    else break;
  }
  return before || all.find((e) => fieldEl.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING) || all[0];
}

// ---- datas -----------------------------------------------------------------------------------

const pad = (n, w = 2) => String(n).padStart(w, "0");
export function formatDatePicture(date, picture, lang = "pt-BR") {
  const loc = isPt(lang) ? "pt-BR" : /^[a-z]{2}/i.test(lang || "") ? lang : "en-US";
  const month = (style) => new Intl.DateTimeFormat(loc, { month: style }).format(date);
  const weekday = (style) => new Intl.DateTimeFormat(loc, { weekday: style }).format(date);
  const H = date.getHours();
  let out = "";
  for (let i = 0; i < picture.length;) {
    const rest = picture.slice(i);
    let m;
    if ((m = /^(am\/pm|AM\/PM|a\/p|A\/P)/.exec(rest))) { const t = m[1]; const pm = H >= 12; out += t.toLowerCase() === "am/pm" ? (t === "am/pm" ? (pm ? "pm" : "am") : (pm ? "PM" : "AM")) : (t === "a/p" ? (pm ? "p" : "a") : (pm ? "P" : "A")); i += t.length; }
    else if ((m = /^d{1,4}/.exec(rest))) { const n = m[0].length; out += n === 1 ? date.getDate() : n === 2 ? pad(date.getDate()) : n === 3 ? weekday("short") : weekday("long"); i += n; }
    else if ((m = /^M{1,4}/.exec(rest))) { const n = m[0].length; out += n === 1 ? date.getMonth() + 1 : n === 2 ? pad(date.getMonth() + 1) : n === 3 ? month("short").replace(/\.$/, "") : month("long"); i += n; }
    else if ((m = /^y{1,4}/.exec(rest))) { const n = m[0].length; out += n <= 2 ? pad(date.getFullYear() % 100) : String(date.getFullYear()); i += n; }
    else if ((m = /^h{1,2}/.exec(rest))) { const h12 = H % 12 || 12; out += m[0].length === 1 ? h12 : pad(h12); i += m[0].length; }
    else if ((m = /^H{1,2}/.exec(rest))) { out += m[0].length === 1 ? H : pad(H); i += m[0].length; }
    else if ((m = /^m{1,2}/.exec(rest))) { out += m[0].length === 1 ? date.getMinutes() : pad(date.getMinutes()); i += m[0].length; }
    else if ((m = /^s{1,2}/.exec(rest))) { out += m[0].length === 1 ? date.getSeconds() : pad(date.getSeconds()); i += m[0].length; }
    else if (rest[0] === "'") { const k = rest.indexOf("'", 1); if (k > 0) { out += rest.slice(1, k); i += k + 1; } else { out += rest.slice(1); i = picture.length; } }
    else { out += rest[0]; i++; }
  }
  return out;
}

// ---- formatos \* -------------------------------------------------------------------------------

const letters = (n) => { let s = ""; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };
const roman = (n) => { const t = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]]; let s = ""; for (const [v, r] of t) while (n >= v) { s += r; n -= v; } return s; };

// ---- números por extenso -------------------------------------------------------------------------
// Inglês: igual ao Rust (doc/src/section.rs cardinal_text/ordinal_text, com iniciais maiúsculas:
// "Twenty-One", "Twenty-First"). Português do Brasil: acrescentado para o app (minúsculas, como o
// Word em português: "vinte e um", "vigésimo primeiro").
const EN_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const capWords = (s) => { let up = true, out = ""; for (const c of s) { out += up ? c.toUpperCase() : c; up = c === "-" || c === " "; } return out; };

export function cardinalTextEn(n) {
  const words = (k) => {
    if (k < 20) return EN_ONES[k];
    if (k < 100) return k % 10 === 0 ? EN_TENS[Math.floor(k / 10)] : `${EN_TENS[Math.floor(k / 10)]}-${EN_ONES[k % 10]}`;
    if (k < 1000) { const h = `${words(Math.floor(k / 100))} hundred`; return k % 100 === 0 ? h : `${h} ${words(k % 100)}`; }
    const th = `${words(Math.floor(k / 1000))} thousand`;
    return k % 1000 === 0 ? th : `${th} ${words(k % 1000)}`;
  };
  return capWords(words(Math.min(Math.max(0, n), 999999)));
}
export function ordinalTextEn(n) {
  const c = cardinalTextEn(n).toLowerCase();
  const i = Math.max(c.lastIndexOf("-"), c.lastIndexOf(" "));
  const head = i >= 0 ? c.slice(0, i + 1) : "", last = i >= 0 ? c.slice(i + 1) : c;
  const map = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
  const l = map[last] || (last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return capWords(`${head}${l}`);
}
const ordinalSuffixEn = (n) => { const a = n % 100, b = n % 10; return a >= 11 && a <= 13 ? "th" : b === 1 ? "st" : b === 2 ? "nd" : b === 3 ? "rd" : "th"; };

const PT_ONES = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const PT_TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const PT_HUND = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
export function cardinalTextPt(n) {
  n = Math.min(Math.max(0, n), 999999);
  const below1000 = (k) => {
    if (k < 20) return PT_ONES[k];
    if (k < 100) return k % 10 === 0 ? PT_TENS[k / 10] : `${PT_TENS[Math.floor(k / 10)]} e ${PT_ONES[k % 10]}`;
    if (k === 100) return "cem";
    const h = PT_HUND[Math.floor(k / 100)];
    return k % 100 === 0 ? h : `${h} e ${below1000(k % 100)}`;
  };
  if (n < 1000) return below1000(n);
  const th = Math.floor(n / 1000), rest = n % 1000;
  const head = th === 1 ? "mil" : `${below1000(th)} mil`;
  if (rest === 0) return head;
  return rest < 100 || rest % 100 === 0 ? `${head} e ${below1000(rest)}` : `${head} ${below1000(rest)}`;
}
const PT_ORD_U = ["", "primeiro", "segundo", "terceiro", "quarto", "quinto", "sexto", "sétimo", "oitavo", "nono"];
const PT_ORD_T = ["", "décimo", "vigésimo", "trigésimo", "quadragésimo", "quinquagésimo", "sexagésimo", "septuagésimo", "octogésimo", "nonagésimo"];
const PT_ORD_H = ["", "centésimo", "ducentésimo", "trecentésimo", "quadringentésimo", "quingentésimo", "sexcentésimo", "septingentésimo", "octingentésimo", "nongentésimo"];
export function ordinalTextPt(n) {
  if (n <= 0) return "zero";
  if (n === 1000) return "milésimo";
  if (n > 1000) return `${n}º`;
  return [PT_ORD_H[Math.floor(n / 100)], PT_ORD_T[Math.floor((n % 100) / 10)], PT_ORD_U[n % 10]].filter(Boolean).join(" ");
}
const isEnLang = (lang) => /^en/i.test(lang || "");

function applyFormatSwitch(text, fmt, isNumber, n, lang = "pt-BR") {
  if (isNumber && Number.isInteger(n) && n >= 0) {
    const en = isEnLang(lang);
    switch (fmt) {
      case "CardText": case "cardtext": return en ? cardinalTextEn(n) : cardinalTextPt(n);
      case "OrdText": case "ordtext": return en ? ordinalTextEn(n) : ordinalTextPt(n);
      case "Ordinal": case "ordinal": return en ? `${n}${ordinalSuffixEn(n)}` : `${n}º`;
      case "Hex": case "hex": return n.toString(16).toUpperCase();
      default:
    }
  }
  switch (fmt) {
    case "Upper": return text.toUpperCase();
    case "Lower": return text.toLowerCase();
    case "FirstCap": return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    case "Caps": return text.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
    case "roman": return isNumber && n > 0 ? roman(n) : text;
    case "ROMAN": return isNumber && n > 0 ? roman(n).toUpperCase() : text;
    case "alphabetic": return isNumber && n > 0 ? letters(n) : text;
    case "ALPHABETIC": return isNumber && n > 0 ? letters(n).toUpperCase() : text;
    case "Arabic": case "ARABIC": return isNumber ? String(n) : text;
    default: return text;
  }
}

// ---------------------------------------------------------------------------
// Avaliação

// ctx: { now, title, author, filename, lang, wordCount, charCount, seq(id, opts) -> n, table, td }
export function evaluateField(code, ctx = {}) {
  if (String(code).length > MAX_CODE) throw fail("o código do campo é longo demais");
  const lang = ctx.lang || "pt-BR";
  const f = parseFieldCode(code);
  const sw = (k) => { const x = f.switches.find((s) => s[0] === k); return x ? x[1] : undefined; };
  const hasSw = (k) => f.switches.some((s) => s[0] === k);
  let text, number = null;
  const name = f.name;
  if (name.startsWith("=")) {
    const [formula, picSw] = splitSwitch(String(code).trim().replace(/^=\s*/, ""));
    const v = evaluateFormula(formula, { table: ctx.table, td: ctx.td, lang });
    const pic = (sw("#") ? String(sw("#")) : null) || pictureOf(picSw && picSw.startsWith("\\#") ? picSw : null);
    text = pic ? formatPicture(v, pic) : formatResult(v, lang);
    number = v;
  } else {
    switch (name) {
      case "DATE": case "TIME": case "CREATEDATE": case "SAVEDATE": case "PRINTDATE": {
        const pic = sw("@") || (name === "TIME" ? "HH:mm" : "dd/MM/yyyy");
        text = formatDatePicture(ctx.now || new Date(), pic, lang);
        break;
      }
      case "TITLE": text = ctx.title || ""; break;
      case "AUTHOR": text = ctx.author || ""; break;
      case "FILENAME": text = ctx.filename || ctx.title || ""; break;
      case "NUMWORDS": number = ctx.wordCount ?? 0; text = String(number); break;
      case "NUMCHARS": number = ctx.charCount ?? 0; text = String(number); break;
      case "SEQ": {
        const id = f.args[0] ? f.args[0].v : "Item";
        const r = sw("r");
        const opts = { reset: r != null ? parseInt(r, 10) : null, current: hasSw("c"), hidden: hasSw("h"), next: hasSw("n") };
        number = ctx.seq ? ctx.seq(id, opts) : 1;
        text = opts.hidden ? "" : String(number);
        break;
      }
      case "QUOTE": text = f.args.map((a) => a.v).join(" "); break;
      case "PAGE": number = ctx.pageOf ? ctx.pageOf(ctx.el) : 1; text = String(number); break;
      case "NUMPAGES": number = ctx.pages ?? 1; text = String(number); break;
      case "REF": case "PAGEREF": case "STYLEREF": {
        if (!ctx.body) throw fail("sem documento para consultar");
        const target = f.args[0] ? f.args[0].v : "";
        if (!target) throw fail(`${name} precisa do nome de um ${name === "STYLEREF" ? "estilo" : "indicador"}`);
        const pos = (a, b) => (a === b ? "" : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? "abaixo" : "acima"); // a = campo, b = alvo
        if (name === "STYLEREF") {
          const hit = findStyleRef(ctx.body, ctx.el, target);
          if (!hit) throw fail("Nenhum parágrafo neste estilo.");
          text = hasSw("p") ? pos(ctx.el, hit) : (hit.textContent || "").replace(/\s+/g, " ").trim();
          break;
        }
        const mark = findBookmark(ctx.body, target);
        if (!mark) throw fail("Indicador não encontrado.");
        if (hasSw("p")) { text = pos(ctx.el, mark); break; }
        if (name === "PAGEREF") { number = ctx.pageOf ? ctx.pageOf(mark) : 1; text = String(number); break; }
        const wrap = bookmarkText(ctx.body, target);
        if (wrap == null) throw fail("O indicador não contém texto.");
        text = wrap;
        break;
      }
      case "COMPARE": case "IF": {
        const a = f.args;
        if (a.length < 3) throw fail(`${name} precisa de: expressão1 operador expressão2`);
        const [x, op, y] = [a[0].v, a[1].v, a[2].v];
        const nx = parseNumber(x, lang), ny = parseNumber(y, lang);
        let c;
        if (nx !== null && ny !== null && !a[0].q && !a[2].q) c = { "=": nx === ny, "<>": nx !== ny, "<": nx < ny, "<=": nx <= ny, ">": nx > ny, ">=": nx >= ny }[op];
        else {
          const A = String(x).toLowerCase(), B = String(y).toLowerCase();
          const wild = (p) => new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
          c = { "=": wild(B).test(A), "<>": !wild(B).test(A), "<": A < B, "<=": A <= B, ">": A > B, ">=": A >= B }[op];
        }
        if (c === undefined) throw fail(`operador de comparação inválido: ${op}`);
        text = name === "COMPARE" ? String(truth(c)) : c ? (a[3] ? a[3].v : "") : (a[4] ? a[4].v : "");
        break;
      }
      default: throw fail(`campo desconhecido: ${name || "(vazio)"}`);
    }
  }
  // \* aceita vários (um formato numérico e depois uma capitalização: \* CardText \* Upper)
  for (const [k, v] of f.switches) if (k === "*" && v) text = applyFormatSwitch(text, v, number !== null && Number.isInteger(number), number, lang);
  return text;
}

// ---------------------------------------------------------------------------
// Campos no documento (DOM)

export const FIELD_GROUPS = [
  { name: "Data e hora", fields: [["DATE", 'DATE \\@ "dd/MM/yyyy"', "Data atual"], ["TIME", 'TIME \\@ "HH:mm"', "Hora atual"], ["CREATEDATE", 'CREATEDATE \\@ "dd/MM/yyyy"', "Data de criação"], ["SAVEDATE", 'SAVEDATE \\@ "dd/MM/yyyy HH:mm"', "Data do último salvamento"]] },
  { name: "Informações do documento", fields: [["TITLE", "TITLE", "Título do documento"], ["AUTHOR", "AUTHOR", "Autor"], ["FILENAME", "FILENAME", "Nome do arquivo"], ["NUMWORDS", "NUMWORDS", "Quantidade de palavras"], ["NUMCHARS", "NUMCHARS", "Quantidade de caracteres"]] },
  { name: "Numeração", fields: [["SEQ", "SEQ Figura \\* ARABIC", "Sequência numerada (Figura, Tabela, Item…)"], ["PAGE", "PAGE", "Número da página"], ["NUMPAGES", "NUMPAGES", "Total de páginas"]] },
  { name: "Links e referências", fields: [["REF", "REF indicador", "Texto de um indicador"], ["PAGEREF", "PAGEREF indicador", "Página de um indicador"], ["STYLEREF", 'STYLEREF "Título 1"', "Texto do título mais próximo"]] },
  { name: "Fórmulas", fields: [["=", "= 2 + 3 * 4", "Expressão (aceita \\# \"0,00\")"], ["=", "=SUM(ABOVE)", "Soma dos números acima (em tabela)"], ["=", "=AVERAGE(LEFT)", "Média dos números à esquerda (em tabela)"]] },
  { name: "Automação do documento", fields: [["IF", 'IF 1 = 1 "verdadeiro" "falso"', "Texto condicional"], ["COMPARE", "COMPARE 2 > 1", "Compara duas expressões (1 ou 0)"], ["QUOTE", 'QUOTE "texto"', "Insere o texto entre aspas"]] },
];

export function fieldHtml(code, result, { locked = false } = {}) {
  const c = String(code).trim();
  return `<span class="word-field" contenteditable="false" data-code="${esc(c)}" data-locked="${locked ? 1 : 0}"><span class="wf-result">${esc(result)}</span><span class="wf-code">{ ${esc(c)} }</span></span>`;
}

// Contexto de avaliação lido do documento aberto.
export function documentContext(body, doc = {}) {
  const text = body ? body.innerText || body.textContent || "" : "";
  return {
    now: new Date(), body, title: doc.title || "", author: doc.author || "", filename: doc.title || "", lang: doc.lang || "pt-BR", pages: doc.pages, pageOf: doc.pageOf,
    wordCount: (text.match(/\S+/g) || []).length, charCount: text.replace(/\n/g, "").length,
  };
}

// Atualiza (F9) os campos dados, na ordem do documento: `fields` = elementos .word-field.
// Campos bloqueados não mudam. Erros aparecem no próprio campo ("Erro! …"), como no Word.
export function updateFields(body, fields, base) {
  const seqs = {};
  const all = Array.from(body.querySelectorAll(".word-field"));
  const set = new Set(fields);
  const seq = (id, o) => {
    const k = id.toLowerCase();
    if (o.reset != null && !Number.isNaN(o.reset)) seqs[k] = o.reset - 1;
    if (!o.current) seqs[k] = (seqs[k] || 0) + 1;
    return seqs[k] || 0;
  };
  let changed = 0;
  for (const el of all) { // percorre todos (os SEQ anteriores contam) e só grava nos pedidos
    const code = el.dataset.code || "";
    const td = el.closest("td,th");
    const ctx = { ...base, seq, el, table: td ? td.closest("table") : null, td };
    let result;
    try { result = evaluateField(code, ctx); } catch (e) { result = `Erro! ${e.message || e}`; }
    if (!set.has(el) || el.dataset.locked === "1") continue;
    const slot = el.querySelector(".wf-result");
    if (slot && slot.textContent !== result) { slot.textContent = result; changed++; }
  }
  return changed;
}

// ---- ações de campo (fields.rs) ----------------------------------------------------------------

export function fieldsInSelection(body) {
  const sel = window.getSelection();
  if (!body || !sel || !sel.rangeCount) return [];
  const range = sel.getRangeAt(0);
  const all = Array.from(body.querySelectorAll(".word-field"));
  if (range.collapsed) {
    const n = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
    const inside = n && n.closest && n.closest(".word-field");
    if (inside) return [inside];
    // cursor logo antes/depois do campo
    const before = range.startContainer.childNodes && range.startContainer.childNodes[range.startOffset - 1];
    const after = range.startContainer.childNodes && range.startContainer.childNodes[range.startOffset];
    return [before, after].filter((x) => x && x.classList && x.classList.contains("word-field")).slice(0, 1);
  }
  return all.filter((f) => range.intersectsNode(f));
}

export function toggleFieldCodes(fields) {
  const show = !fields.every((f) => f.dataset.showCode === "1");
  fields.forEach((f) => { if (show) f.dataset.showCode = "1"; else delete f.dataset.showCode; });
  return show;
}
export function unlinkFields(fields) {
  fields.forEach((f) => { const t = f.querySelector(".wf-result")?.textContent ?? ""; f.replaceWith(document.createTextNode(t)); });
  return fields.length;
}
export function lockFields(fields, locked) { fields.forEach((f) => { f.dataset.locked = locked ? "1" : "0"; }); return fields.length; }
export function setFieldCode(field, code) {
  const c = String(code).trim();
  if (!c) throw fail("o código do campo está vazio");
  if (c.length > MAX_CODE) throw fail("o código do campo é longo demais");
  field.dataset.code = c;
  const slot = field.querySelector(".wf-code");
  if (slot) slot.textContent = `{ ${c} }`;
}
export function goToField(body, forward) {
  const all = Array.from(body.querySelectorAll(".word-field"));
  if (!all.length) return null;
  const sel = window.getSelection();
  const pos = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
  let target = null;
  if (!pos) target = forward ? all[0] : all[all.length - 1];
  else if (forward) target = all.find((f) => pos.comparePoint(f, 0) > 0 || (pos.comparePoint(f, 0) === 0 && !pos.collapsed && false)) || all[0];
  else target = [...all].reverse().find((f) => pos.comparePoint(f, 0) < 0) || all[all.length - 1];
  const r = document.createRange();
  r.selectNode(target);
  sel.removeAllRanges(); sel.addRange(r);
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  return target;
}
