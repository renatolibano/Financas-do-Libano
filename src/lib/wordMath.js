// Equações estruturadas do editor "Word".
// Port de wordcraft: crates/doc/src/math.rs (modelo MNode e formato linear de saída),
// math_linear.rs (parser do formato linear/UnicodeMath), math_latex.rs (parser e saída LaTeX),
// math_symbols.rs e engine/src/math_gallery.rs (dados em wordMathData.js, gerados do Rust).
//
// O WordCraft desenha a árvore com o próprio motor de layout; aqui o desenho fica por conta do
// navegador: toMathML() converte a mesma árvore em MathML Core (Chrome, Edge, Safari e Firefox).
//
// Nós: { t:"run", text, sty, scr, nor, lit } | { t:"frac", kind, num, den } |
//   { t:"script", kind, base, sub, sup } | { t:"rad", deg, degHide, e } |
//   { t:"nary", chr, limLoc, subHide, supHide, sub, sup, e } | { t:"delim", beg, end, sep, elems } |
//   { t:"func", name, e } | { t:"lim", upper, e, lim } | { t:"acc", chr, e } | { t:"bar", top, e } |
//   { t:"borderBox", e } | { t:"boxed", e } | { t:"groupChr", chr, top, e } | { t:"eqArr", rows } |
//   { t:"matrix", rows, colJc } | { t:"phant", show, e }
// Um "arg" é um array de nós.

import { SYMBOLS } from "./wordMathData";

export const MAX_DEPTH = 64;
export const PLACEHOLDER = "⬚";

export const FUNCTION_NAMES = ["arccos", "arccot", "arccsc", "arcsec", "arcsin", "arctan", "arg", "cos", "cosh", "cot", "coth", "csc", "csch", "deg", "det", "dim", "exp",
  "gcd", "hom", "inf", "ker", "lg", "lim", "liminf", "limsup", "ln", "log", "max", "min", "mod", "Pr", "sec", "sech", "sin", "sinh", "sup", "tan", "tanh"];
const LIMIT_NAMES = ["lim", "liminf", "limsup", "max", "min", "sup", "inf", "det", "gcd", "Pr"];

const run = (text, extra = {}) => ({ t: "run", text, ...extra });
const plain = (text) => run(text, { sty: "plain" });
const chars = (s) => Array.from(s);

// ---------------------------------------------------------------------------
// Classes de caracteres (math.rs)

const BIN = new Set(chars("+−-±∓×÷·∙∗*∘⊕⊖⊗⊘⊙⊚⊛∪∩∧∨∖⋅⋆⊎⊓⊔⋄⊞⊟⊠⊡⋉⋊⋋⋌⋎⋏⋒⋓∔∸≀⨿⊼⊻⊽"));
const REL = new Set(chars("=<>≤≥≠≈≡≢∼≃≅≐∝≪≫≺≻≼≽⊂⊃⊆⊇⊄⊅⊈⊉⊊⊋∈∉∋∌⊥∥∦∣∤≔≕≝≜≞≟→←↔⇒⇐⇔↦⟼⟶⟵⟷⟹⟸⟺↑↓↕⇑⇓⇕↗↘↙↖⊢⊣⊨⊩⊪⊬⊭⊮⊯≲≳≍⊏⊐⊑⊒⋢⋣≶≷≮≯≰≱≦≧⩽⩾:∶∷∺∻≗≙≚≑≒≓≖⇌⇋⇄⇆⇇⇉⇈⇊↪↩↼↽⇀⇁↿↾⇃⇂↶↷↺↻⊸↜↝↞↠↢↣↫↬↭⇚⇛↰↱⇝≁≄≉≇≭≨≩⊀⊁⋠⋡⋦⋧⋨⋩⋪⋫⋬⋭⋈∴∵≏≎⋘⋙⊲⊳⊴⊵⋐⋑"));
const OPEN = new Set(chars("([{⟨⌈⌊⟦〈"));
const CLOSE = new Set(chars(")]}⟩⌉⌋⟧〉!"));
const INTEGRALS = new Set(chars("∫∬∭∮∯∰∱∲∳⨌"));
export const isIntegral = (c) => INTEGRALS.has(c);
export const isNaryChar = (c) => INTEGRALS.has(c) || "∑∏∐⋃⋂⋁⋀⨁⨂⨀⨄⨆".includes(c);
export function mathClass(c) {
  if (BIN.has(c)) return "bin";
  if (REL.has(c)) return "rel";
  if (OPEN.has(c)) return "open";
  if (CLOSE.has(c)) return "close";
  if (c === "," || c === ";") return "punct";
  if (isNaryChar(c)) return "op";
  return "ord";
}

// ---------------------------------------------------------------------------
// Alfanuméricos matemáticos (Unicode U+1D400…): negrito, itálico, script, fraktur, duplo

const EXC = {
  doubleStruck: { C: "ℂ", H: "ℍ", N: "ℕ", P: "ℙ", Q: "ℚ", R: "ℝ", Z: "ℤ" },
  script: { B: "ℬ", E: "ℰ", F: "ℱ", H: "ℋ", I: "ℐ", L: "ℒ", M: "ℳ", R: "ℛ", e: "ℯ", g: "ℊ", o: "ℴ" },
  fraktur: { C: "ℭ", H: "ℌ", I: "ℑ", R: "ℜ", Z: "ℨ" },
  italic: { h: "ℎ" },
};
export function mathAlnum(c, bold, italic, scr = "roman") {
  const up = /[A-Z]/.test(c), lo = /[a-z]/.test(c), dg = /[0-9]/.test(c);
  if (!up && !lo && !dg) return c;
  const k = up ? c.charCodeAt(0) - 65 : lo ? c.charCodeAt(0) - 97 : c.charCodeAt(0) - 48;
  const at = (base) => String.fromCodePoint(base + k);
  switch (scr) {
    case "doubleStruck": return EXC.doubleStruck[c] || (dg ? at(0x1D7D8) : up ? at(0x1D538) : at(0x1D552));
    case "script": return EXC.script[c] || (dg ? c : up ? at(bold ? 0x1D4D0 : 0x1D49C) : at(bold ? 0x1D4EA : 0x1D4B6));
    case "fraktur": return EXC.fraktur[c] || (dg ? c : up ? at(bold ? 0x1D56C : 0x1D504) : at(bold ? 0x1D586 : 0x1D51E));
    case "sansSerif": return dg ? at(bold ? 0x1D7EC : 0x1D7E2) : up ? at(bold ? (italic ? 0x1D63C : 0x1D5D4) : (italic ? 0x1D608 : 0x1D5A0)) : at(bold ? (italic ? 0x1D656 : 0x1D5EE) : (italic ? 0x1D622 : 0x1D5BA));
    case "monospace": return dg ? at(0x1D7F6) : up ? at(0x1D670) : at(0x1D68A);
    default:
      if (dg) return bold ? at(0x1D7CE) : c;
      if (bold && italic) return up ? at(0x1D468) : at(0x1D482);
      if (bold) return up ? at(0x1D400) : at(0x1D41A);
      if (italic) return EXC.italic[c] || (up ? at(0x1D434) : at(0x1D44E));
      return c;
  }
}

// símbolo por nome TeX: alpha -> α, doubleR -> ℝ, scriptL -> ℒ, frakturg
export function symbol(name) {
  if (Object.prototype.hasOwnProperty.call(SYMBOLS, name)) return SYMBOLS[name];
  for (const [prefix, scr] of [["double", "doubleStruck"], ["script", "script"], ["fraktur", "fraktur"]]) {
    if (name.startsWith(prefix) && name.length === prefix.length + 1 && /[A-Za-z0-9]/.test(name[prefix.length])) {
      const c = name[prefix.length], m = mathAlnum(c, false, false, scr);
      if (m !== c) return m;
    }
  }
  return null;
}
const NAME_OF = (() => { const m = new Map(); for (const [n, c] of Object.entries(SYMBOLS)) if (!m.has(c)) m.set(c, n); return m; })();

// ---------------------------------------------------------------------------
// Utilitários de árvore

export function mapArgs(n, f) {
  switch (n.t) {
    case "run": return n;
    case "frac": return { ...n, num: f(n.num), den: f(n.den) };
    case "script": return { ...n, base: f(n.base), sub: f(n.sub), sup: f(n.sup) };
    case "rad": return { ...n, deg: f(n.deg), e: f(n.e) };
    case "nary": return { ...n, sub: f(n.sub), sup: f(n.sup), e: f(n.e) };
    case "delim": return { ...n, elems: n.elems.map(f) };
    case "func": return { ...n, name: f(n.name), e: f(n.e) };
    case "lim": return { ...n, e: f(n.e), lim: f(n.lim) };
    case "eqArr": return { ...n, rows: n.rows.map(f) };
    case "matrix": return { ...n, rows: n.rows.map((r) => r.map(f)) };
    default: return { ...n, e: f(n.e) }; // acc, bar, borderBox, boxed, groupChr, phant
  }
}

export function mergeRuns(a) {
  const out = [];
  for (const n of a) {
    if (n.t === "run") {
      const p = out[out.length - 1];
      if (p && p.t === "run" && p.sty === n.sty && p.scr === n.scr && !p.nor === !n.nor && !p.lit === !n.lit) { out[out.length - 1] = { ...p, text: p.text + n.text }; continue; }
      out.push(n);
    } else out.push(mapArgs(n, mergeRuns));
  }
  return out;
}

function restyle(a, sty, scr, nor) {
  return a.map((n) => {
    if (n.t !== "run") return mapArgs(n, (x) => restyle(x, sty, scr, nor));
    const r = { ...n };
    if (sty) r.sty = sty;
    if (scr !== "roman") r.scr = scr;
    if (nor) r.nor = true;
    return r;
  });
}

const group = (a) => ({ t: "delim", beg: null, end: null, sep: null, elems: [a] });
const hasNumberMark = (row) => row.some((n) => n.t === "run" && !n.lit && !n.nor && n.text.includes("#"));

function attachScript(base, sup, s) {
  if (base && base.t === "script" && base.kind === "sub" && sup) return { t: "script", kind: "subsup", base: base.base, sub: base.sub, sup: s };
  if (base && base.t === "script" && base.kind === "sup" && !sup) return { t: "script", kind: "subsup", base: base.base, sub: s, sup: base.sup };
  const b = base ? [base] : [];
  return sup ? { t: "script", kind: "sup", base: b, sub: [], sup: s } : { t: "script", kind: "sub", base: b, sub: s, sup: [] };
}

// Script de LaTeX: se a base é um operador n-ário sem operando, os scripts viram limites dele.
function latexScript(base, sup, s) {
  if (base && base.t === "nary" && base.e.length === 0) return sup ? { ...base, supHide: false, sup: s } : { ...base, subHide: false, sub: s };
  return attachScript(base, sup, s);
}

// ---------------------------------------------------------------------------
// LaTeX -> árvore (math_latex.rs)

const TEXT_COMMANDS = ["text", "textrm", "mbox", "textnormal", "textbf", "textit"];

function tokenizeLatex(s) {
  const cs = chars(s).slice(0, 20000);
  const out = [];
  let i = 0, textNext = false, textDepth = null;
  while (i < cs.length) {
    const c = cs[i++];
    if (textDepth !== null && /[ \t\n\r]/.test(c)) {
      const last = out[out.length - 1];
      if (!(last && last.k === "ch" && last.c === " ")) out.push({ k: "ch", c: " " });
      continue;
    }
    const wasTextNext = textNext; textNext = false;
    if (c === "\\") {
      const start = i;
      while (i < cs.length && /[A-Za-z]/.test(cs[i])) i++;
      if (i === start) {
        if (cs[i] === "\\") { i++; out.push({ k: "row" }); }
        else if (i < cs.length) { out.push({ k: "cmd", c: cs[i] }); i++; }
      } else {
        const name = cs.slice(start, i).join("");
        textNext = textDepth === null && TEXT_COMMANDS.includes(name);
        out.push({ k: "cmd", c: name });
      }
    } else if (c === "{") {
      textDepth = textDepth !== null ? textDepth + 1 : wasTextNext ? 0 : null;
      out.push({ k: "open" });
    } else if (c === "}") {
      textDepth = textDepth === null || textDepth === 0 ? null : textDepth - 1;
      out.push({ k: "close" });
    } else if (c === "^") out.push({ k: "sup" });
    else if (c === "_") out.push({ k: "sub" });
    else if (c === "&") out.push({ k: "amp" });
    else if (/[ \t\n\r]/.test(c)) textNext = wasTextNext;
    else if (c === "~") out.push({ k: "ch", c: "\u00A0" });
    else out.push({ k: "ch", c });
  }
  return out;
}

class LatexParser {
  constructor(toks, depth = 0) { this.t = toks; this.i = 0; this.depth = depth; }
  peek() { return this.t[this.i]; }
  is(k, c) { const p = this.peek(); return !!p && p.k === k && (c === undefined || p.c === c); }

  seq(inGroup) {
    this.depth++;
    let out = [];
    if (this.depth > MAX_DEPTH) { this.i = this.t.length; this.depth--; return out; }
    for (;;) {
      const tok = this.peek();
      if (!tok) break;
      if (tok.k === "close" || tok.k === "amp" || tok.k === "row") break;
      if (tok.k === "cmd" && ["right", "middle", "end"].includes(tok.c)) break;
      if (tok.k === "sup" || tok.k === "sub") {
        this.i++;
        const s = this.arg();
        const base = out.pop();
        out.push(latexScript(base, tok.k === "sup", s));
      } else if (tok.k === "cmd" && ["limits", "nolimits", "displaystyle", "textstyle"].includes(tok.c)) {
        this.i++;
        const last = out[out.length - 1];
        if (last && last.t === "nary") {
          if (tok.c === "nolimits") out[out.length - 1] = { ...last, limLoc: "subSup" };
          if (tok.c === "limits") out[out.length - 1] = { ...last, limLoc: "undOvr" };
        }
      } else out.push(...this.atom());
    }
    this.depth--;
    return naryOperands(out, this.depth);
  }

  arg() {
    const p = this.peek();
    if (!p) return [];
    if (p.k === "open") {
      this.i++;
      const g = this.seq(true);
      if (this.is("close")) this.i++;
      return g;
    }
    return this.atom();
  }

  opt() {
    if (!this.is("ch", "[")) return null;
    this.i++;
    const toks = [];
    let level = 0;
    while (this.peek()) {
      const t = this.peek(); this.i++;
      if (t.k === "ch" && t.c === "]" && level === 0) break;
      if (t.k === "open") level++; else if (t.k === "close") level--;
      toks.push(t);
    }
    return new LatexParser(toks, this.depth).seq(false);
  }

  rawArg() {
    let s = "";
    if (!this.is("open")) {
      const p = this.peek();
      if (p && p.k === "ch") { this.i++; s += p.c; }
      return s;
    }
    this.i++;
    let level = 0, afterWord = false;
    while (this.peek()) {
      const t = this.peek(); this.i++;
      const wasWord = afterWord;
      afterWord = t.k === "cmd" && /^[A-Za-z]+$/.test(t.c);
      if (t.k === "close" && level === 0) break;
      if (t.k === "open" && wasWord && this.is("close")) { this.i++; continue; }
      if (t.k === "open") { level++; s += "{"; }
      else if (t.k === "close") { level--; s += "}"; }
      else if (t.k === "ch") s += t.c;
      else if (t.k === "cmd") {
        if (/^[A-Za-z]+$/.test(t.c)) s += symbol(t.c) ?? t.c; else s += t.c;
        if (t.c === " ") s += " ";
      } else if (t.k === "sup") s += "^";
      else if (t.k === "sub") s += "_";
      else if (t.k === "amp") s += "&";
      else if (t.k === "row") s += "\n";
    }
    return s;
  }

  delim() {
    const t = this.peek();
    if (!t) return null;
    this.i++;
    if (t.k === "ch") return t.c === "." ? null : t.c;
    if (t.k === "cmd") return t.c === "{" ? "{" : t.c === "}" ? "}" : t.c === "|" ? "‖" : symbol(t.c);
    return null;
  }

  atom() {
    if (this.depth > MAX_DEPTH) { this.i = this.t.length; return []; }
    this.depth++;
    const out = this.atomInner();
    this.depth--;
    return out;
  }

  atomInner() {
    const t = this.peek();
    if (!t) return [];
    this.i++;
    switch (t.k) {
      case "open": { const g = this.seq(true); if (this.is("close")) this.i++; return g; }
      case "ch": return [run(t.c)];
      case "cmd": return this.command(t.c);
      default: return [];
    }
  }

  command(c) {
    const one = (n) => [n];
    switch (c) {
      case "frac": case "dfrac": case "tfrac": case "cfrac": { const num = this.arg(), den = this.arg(); return one({ t: "frac", kind: "bar", num, den }); }
      case "binom": case "dbinom": case "tbinom": { const n = this.arg(), k = this.arg(); return one({ t: "delim", beg: "(", end: ")", sep: null, elems: [[{ t: "frac", kind: "noBar", num: n, den: k }]] }); }
      case "sqrt": { const deg = this.opt() || []; const e = this.arg(); return one({ t: "rad", degHide: deg.length === 0, deg, e }); }
      case "left": {
        const beg = this.delim();
        const elems = [this.seq(false)];
        let sep = null, end = null;
        while (this.peek() && this.peek().k === "cmd") {
          const k = this.peek().c; this.i++;
          if (k === "middle") { sep = this.delim() || "|"; elems.push(this.seq(false)); }
          else { if (k === "right") end = this.delim(); break; }
        }
        return one({ t: "delim", beg, end, sep, elems });
      }
      case "bigl": case "Bigl": case "biggl": case "Biggl": case "bigr": case "Bigr": case "biggr": case "Biggr": case "big": case "Big": case "bigg": case "Bigg": {
        const d = this.delim(); return d ? [run(d)] : [];
      }
      case "begin": { const env = this.rawArg(); return this.environment(env.trim()); }
      case "text": case "textrm": case "mbox": case "textnormal": return one(run(this.rawArg(), { nor: true, sty: "plain" }));
      case "textbf": return one(run(this.rawArg(), { nor: true, sty: "bold" }));
      case "textit": return one(run(this.rawArg(), { nor: true, sty: "italic" }));
      case "operatorname": {
        const starred = this.is("ch", "*"); if (starred) this.i++;
        const name = [plain(this.rawArg())];
        if (starred && this.is("sub")) { this.i++; return [{ t: "lim", upper: false, e: name, lim: this.arg() }]; }
        return this.apply(name);
      }
      case "tag": {
        const starred = this.is("ch", "*"); if (starred) this.i++;
        const t = this.rawArg();
        return one(run(starred ? `#${t}` : `# (${t})`));
      }
      case "mathrm": case "rm": return restyle(this.arg(), "plain", "roman", false);
      case "mathbf": case "bf": return restyle(this.arg(), "bold", "roman", false);
      case "mathit": return restyle(this.arg(), "italic", "roman", false);
      case "boldsymbol": case "bm": return restyle(this.arg(), "boldItalic", "roman", false);
      case "mathbb": return restyle(this.arg(), null, "doubleStruck", false);
      case "mathcal": case "mathscr": return restyle(this.arg(), null, "script", false);
      case "mathfrak": return restyle(this.arg(), null, "fraktur", false);
      case "mathsf": return restyle(this.arg(), null, "sansSerif", false);
      case "mathtt": return restyle(this.arg(), null, "monospace", false);
      case "overline": return one({ t: "bar", top: true, e: this.arg() });
      case "underline": return one({ t: "bar", top: false, e: this.arg() });
      case "boxed": case "fbox": return one({ t: "borderBox", e: this.arg() });
      case "phantom": return one({ t: "phant", show: false, e: this.arg() });
      case "overbrace": case "underbrace": case "overparen": case "underparen": case "overbracket": case "underbracket": {
        const top = c.startsWith("over");
        const chr = { overbrace: "⏞", underbrace: "⏟", overparen: "⏜", underparen: "⏝", overbracket: "⎴" }[c] || "⎵";
        const e = this.arg();
        const g = { t: "groupChr", chr, top, e };
        if (this.is(top ? "sup" : "sub")) { this.i++; return one({ t: "lim", upper: top, e: [g], lim: this.arg() }); }
        return one(g);
      }
      case "stackrel": case "overset": { const over = this.arg(), base = this.arg(); return one({ t: "lim", upper: true, e: base, lim: over }); }
      case "underset": { const under = this.arg(), base = this.arg(); return one({ t: "lim", upper: false, e: base, lim: under }); }
      case "hat": case "widehat": case "tilde": case "widetilde": case "dot": case "ddot": case "dddot": case "check": case "breve": case "acute": case "grave": case "vec": case "bar":
      case "overrightarrow": case "overleftarrow": case "overleftrightarrow": case "mathring": {
        const chr = { hat: "\u0302", widehat: "\u0302", tilde: "\u0303", widetilde: "\u0303", dot: "\u0307", ddot: "\u0308", dddot: "\u20DB", check: "\u030C", breve: "\u0306", acute: "\u0301", grave: "\u0300", bar: "\u0305", overleftarrow: "\u20D6", overleftrightarrow: "\u20E1", mathring: "\u030A" }[c] || "\u20D7";
        return one({ t: "acc", chr, e: this.arg() });
      }
      case ",": case "thinspace": return [run("\u2009")];
      case ":": case ">": case "medspace": return [run("\u205F")];
      case ";": case "thickspace": return [run("\u2005")];
      case "!": case "negthinspace": return [];
      case " ": return [run(" ")];
      case "quad": return [run("\u2003")];
      case "qquad": return [run("\u2003\u2003")];
      case "{": case "}": case "%": case "$": case "#": case "&": case "_": return [run(c, { lit: c === "#" })];
      case "|": return [run("‖")];
      default:
    }
    if (FUNCTION_NAMES.includes(c)) {
      const pl = [plain(c)];
      let named;
      if (LIMIT_NAMES.includes(c) && this.is("sub")) { this.i++; named = [{ t: "lim", upper: false, e: pl, lim: this.arg() }]; }
      else if (this.is("sup") || this.is("sub")) { const sup = this.is("sup"); this.i++; const s = this.arg(); named = [latexScript(plain(c), sup, s)]; }
      else named = pl;
      return this.apply(named);
    }
    const ch = symbol(c);
    if (ch != null) {
      if (isNaryChar(ch)) return [{ t: "nary", chr: ch, limLoc: null, subHide: true, supHide: true, sub: [], sup: [], e: [] }];
      return [run(ch)];
    }
    return [run(`\\${c}`)];
  }

  apply(name) {
    let e = this.atom();
    while (this.is("sup") || this.is("sub")) {
      const sup = this.is("sup"); this.i++;
      const s = this.arg();
      const base = e.length === 1 ? e.pop() : group(e.splice(0));
      e.push(latexScript(base, sup, s));
    }
    return e.length ? [{ t: "func", name, e }] : name;
  }

  environment(env) {
    const base = env.replace(/\*+$/, "");
    const colJc = [];
    if (base === "array" || base === "tabular") {
      this.opt();
      for (const ch of this.rawArg()) { if ("lL".includes(ch)) colJc.push("left"); else if ("rR".includes(ch)) colJc.push("right"); else if ("cC".includes(ch)) colJc.push("center"); }
    } else if (base === "aligned") this.opt();
    const rows = [[]];
    for (;;) {
      rows[rows.length - 1].push(this.seq(false));
      const p = this.peek();
      if (!p) break;
      if (p.k === "amp") this.i++;
      else if (p.k === "row") { this.i++; rows.push([]); }
      else if (p.k === "cmd" && p.c === "end") { this.i++; this.rawArg(); break; }
      else this.i++;
    }
    if (rows.length > 1 && rows[rows.length - 1].every((c) => c.length === 0)) rows.pop();
    const delims = { pmatrix: ["(", ")"], bmatrix: ["[", "]"], Bmatrix: ["{", "}"], vmatrix: ["|", "|"], Vmatrix: ["‖", "‖"] }[base];
    const wrap = (inner, beg, end) => ({ t: "delim", beg, end, sep: null, elems: [[inner]] });
    if (["matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix", "smallmatrix", "array", "tabular"].includes(base)) {
      const m = { t: "matrix", rows, colJc };
      return delims ? [wrap(m, delims[0], delims[1])] : [m];
    }
    const eq = { t: "eqArr", rows: rows.map(joinCells) };
    if (base === "cases" || base === "dcases") return [wrap(eq, "{", null)];
    if (base === "rcases") return [wrap(eq, null, "}")];
    return [eq];
  }
}

function joinCells(cells) {
  const out = [];
  cells.forEach((c, i) => { if (i > 0) out.push(run("&")); out.push(...c); });
  return mergeRuns(out);
}

function naryOperands(a, depth) {
  const out = [];
  for (let k = 0; k < a.length; k++) {
    const n = a[k];
    if (n.t === "nary" && n.e.length === 0 && depth < MAX_DEPTH / 2) {
      const body = [];
      while (k + 1 < a.length) {
        const nx = a[k + 1];
        const stop = nx.t === "run" && nx.text && (["rel", "bin", "punct"].includes(mathClass(chars(nx.text)[0])) || nx.text[0] === "&");
        if (stop) break;
        body.push(nx); k++;
      }
      out.push({ ...n, e: mergeRuns(naryOperands(body, depth + 1)) });
    } else out.push(n);
  }
  return out;
}

export function parseLatex(s) {
  const p = new LatexParser(tokenizeLatex(s));
  let out = [];
  while (p.i < p.t.length) {
    out.push(...p.seq(false));
    const t = p.peek();
    if (t && t.k === "amp") out.push(run("&"));
    p.i++;
  }
  out = mergeRuns(out);
  if (out.some((n) => n.t === "run" && !n.nor && n.text.includes("#"))) return [{ t: "eqArr", rows: [out] }];
  return out;
}

// ---------------------------------------------------------------------------
// Formato linear -> árvore (math_linear.rs)

const closerOf = (c) => ({ "(": ")", "[": "]", "{": "}", "⟨": "⟩", "〈": "〉", "⌈": "⌉", "⌊": "⌋", "⟦": "⟧", "〖": "〗" })[c] || null;
const isCloser = (c) => ")]}⟩〉⌉⌋⟧〗┤".includes(c);
const isPrefix = (c) => "√∛∜█■▭□¯▁⟡⏞⏟⏜⏝⎴⎵".includes(c) || isNaryChar(c);
const isCombining = (c) => { const k = c.codePointAt(0); return (k >= 0x300 && k <= 0x36F) || (k >= 0x20D0 && k <= 0x20FF); };
const isBoundary = (c) => " &@#▒│/⁄∕¦\u2061".includes(c) || isCloser(c) || ["bin", "rel", "punct"].includes(mathClass(c));
const isSignChar = (c) => "−-+±∓".includes(c);
const text1 = (c) => run(c);

function stripParens(a) {
  if (a.length === 1 && a[0].t === "delim" && a[0].elems.length === 1 && ((a[0].beg === "(" && a[0].end === ")") || (a[0].beg === null && a[0].end === null))) return a[0].elems[0];
  return a;
}
function operandStart(out) {
  let k = out.length;
  while (k > 0) {
    const n = out[k - 1];
    if (n.t === "run" && chars(n.text).every(isBoundary)) break;
    k--;
  }
  return k;
}

class LinearParser {
  constructor(s) { this.c = chars(s).slice(0, 20000); this.i = 0; this.depth = 0; this.steps = 0; this.noLimits = 0; }
  peek() { return this.c[this.i]; }
  peekAt(k) { return this.c[this.i + k]; }
  tired() { this.steps++; return this.steps > 400000 || this.depth > MAX_DEPTH; }
  rest() { const t = this.c.slice(this.i).join(""); this.i = this.c.length; return t ? [run(t)] : []; }

  expr(stops) {
    this.depth++;
    const out = [];
    if (this.tired()) { this.depth--; return this.rest(); }
    for (;;) {
      const c = this.peek();
      if (c === undefined) break;
      if (stops.includes(c) || (isCloser(c) && stops.length > 0)) break;
      if (this.tired()) { out.push(...this.rest()); break; }
      if ("/⁄∕¦".includes(c)) {
        this.i++;
        const start = operandStart(out);
        const num = stripParens(out.splice(start));
        const den = this.operand(stops);
        out.push({ t: "frac", kind: c === "⁄" ? "skewed" : c === "∕" ? "linear" : c === "¦" ? "noBar" : "bar", num, den });
      } else if (c === "^" || c === "_") {
        const last = out[out.length - 1];
        const pre = !last || (last.t === "run" && (last.text === " " || chars(last.text).every((x) => isBoundary(x) && x !== "#")));
        if (pre) out.push(this.prescript(stops));
        else {
          this.i++;
          const s = this.scriptOperand(stops);
          out.push(attachScript(out.pop(), c === "^", s));
        }
      } else if (c === "┬" || c === "┴") {
        this.i++;
        const lim = this.scriptOperand(stops);
        const n = out.pop();
        out.push({ t: "lim", upper: c === "┴", e: stripParens(n ? [n] : []), lim });
      } else if (isCombining(c)) {
        this.i++;
        const n = out.pop();
        out.push({ t: "acc", chr: c, e: n ? stripParens([n]) : [] });
      } else if (c === "▒" || c === "\u2061") this.i++;
      else if (c === " ") { this.i++; out.push(text1(" ")); }
      else out.push(...this.atom(stops));
    }
    this.depth--;
    return out;
  }

  atom(stops) {
    const c = this.peek();
    if (c === undefined) return [];
    if (closerOf(c)) { this.i++; return [this.group(c, [closerOf(c)])]; }
    if (c === "├") {
      this.i++;
      const d = this.explicitGroup();
      if (d) return [d];
      return [this.group(null, [")", "]", "}", "⟩", "⌉", "⌋", "|", "‖"])];
    }
    if ((c === "|" || c === "‖") && this.c.slice(this.i + 1).includes(c)) { this.i++; return [this.group(c, [c])]; }
    if (isPrefix(c)) { this.i++; return [this.prefix(c, stops)]; }
    if (/[A-Za-z]/.test(c)) return this.word(stops);
    this.i++;
    return [text1(c)];
  }

  group(open, closers) {
    const stops = [...closers, "┤", "│"];
    const elems = [];
    let end = null;
    for (;;) {
      elems.push(this.expr(stops));
      const p = this.peek();
      if (p === "│") this.i++;
      else if (p === "┤") { this.i++; break; }
      else if (p !== undefined && closers.includes(p)) { this.i++; end = p; break; }
      else break;
      if (this.tired()) break;
    }
    const beg = open && open !== "〖" ? open : null;
    return { t: "delim", beg, end: end && end !== "〗" ? end : null, sep: elems.length > 1 ? "|" : null, elems };
  }

  explicitGroup() {
    let level = 1, k = this.i;
    while (k < this.c.length) {
      if (this.c[k] === "├") level++;
      else if (this.c[k] === "┤") { level--; if (level === 0) break; }
      k++;
    }
    if (level !== 0) return null;
    const bracket = (c) => "()[]{}⟨⟩⌈⌉⌊⌋|‖⟦⟧".includes(c);
    const inner = this.c.slice(this.i, k);
    this.i = k + 1;
    const beg = inner.length && bracket(inner[0]) ? inner.shift() : null;
    const paired = () => {
      const last = inner[inner.length - 1];
      const opener = { ")": "(", "]": "[", "}": "{", "⟩": "⟨", "⌉": "⌈", "⌋": "⌊", "⟧": "⟦" }[last];
      if (!opener) return false;
      const body = inner.slice(0, -1);
      return body.filter((x) => x === opener).length > body.filter((x) => x === last).length;
    };
    const end = inner.length && bracket(inner[inner.length - 1]) && !paired() ? inner.pop() : null;
    const sub = new LinearParser(""); sub.c = inner; sub.depth = this.depth + 1; sub.steps = this.steps;
    const elems = [[]];
    while (sub.i < sub.c.length) {
      elems[elems.length - 1].push(...sub.expr(["│"]));
      const p = sub.peek();
      if (p === "│") { sub.i++; elems.push([]); }
      else if (p !== undefined) { sub.i++; elems[elems.length - 1].push(text1(p)); }
      if (sub.tired()) break;
    }
    this.steps = sub.steps;
    return { t: "delim", beg, end, sep: elems.length > 1 ? "|" : null, elems };
  }

  prefix(c, stops) {
    switch (c) {
      case "√": case "∛": case "∜": {
        let deg = c === "∛" ? [text1("3")] : c === "∜" ? [text1("4")] : [];
        let e = this.operand(stops);
        const k = e.findIndex((n) => n.t === "run" && n.text === "&");
        if (k >= 0) { const rest = e.slice(k + 1); deg = e.slice(0, k); e = rest; }
        return { t: "rad", degHide: deg.length === 0, deg, e };
      }
      case "█": case "■": {
        if (this.peek() !== "(") return text1(c);
        this.i++;
        const inner = this.expr([")"]);
        if (this.peek() === ")") this.i++;
        return grid(c === "■", inner);
      }
      case "▭": return { t: "borderBox", e: this.operand(stops) };
      case "□": return { t: "boxed", e: this.operand(stops) };
      case "¯": return { t: "bar", top: true, e: this.operand(stops) };
      case "▁": return { t: "bar", top: false, e: this.operand(stops) };
      case "⟡": return { t: "phant", show: false, e: this.operand(stops) };
      case "⏞": case "⏜": case "⎴": case "⏟": case "⏝": case "⎵": {
        this.noLimits++;
        const e = this.operand(stops);
        this.noLimits--;
        return { t: "groupChr", chr: c, top: "⏞⏜⎴".includes(c), e };
      }
      default: {
        let sub = [], sup = [], hasSub = false, hasSup = false;
        for (;;) {
          const p = this.peek();
          if (p === "_") { this.i++; sub = this.scriptOperand(stops); hasSub = true; }
          else if (p === "^") { this.i++; sup = this.scriptOperand(stops); hasSup = true; }
          else break;
        }
        if (this.peek() === "▒") this.i++;
        const e = this.peek() === " " ? [] : this.operand(stops);
        return { t: "nary", chr: c, limLoc: null, subHide: !hasSub, supHide: !hasSup, sub, sup, e };
      }
    }
  }

  word(stops) {
    const start = this.i;
    let end = start;
    while (end < this.c.length && /[A-Za-z]/.test(this.c[end])) end++;
    const word = this.c.slice(start, end).join("");
    if (!FUNCTION_NAMES.includes(word)) { this.i = start + 1; return [text1(this.c[start])]; }
    this.i = end;
    const pl = [plain(word)];
    let name;
    const p = this.peek();
    if (p === "┬" || p === "┴") { this.i++; name = [{ t: "lim", upper: p === "┴", e: pl, lim: this.scriptOperand(stops) }]; }
    else if (p === "_" && LIMIT_NAMES.includes(word)) { this.i++; name = [{ t: "lim", upper: false, e: pl, lim: this.scriptOperand(stops) }]; }
    else if (p === "^" || p === "_") {
      this.i++;
      let n = attachScript(plain(word), p === "^", this.scriptOperand(stops));
      const p2 = this.peek();
      if (p2 === "^" || p2 === "_") { this.i++; n = attachScript(n, p2 === "^", this.scriptOperand(stops)); }
      name = [n];
    } else name = pl;
    if (" \u2061▒".includes(this.peek() ?? "\0")) this.i++;
    const next = this.peek();
    const applies = next !== undefined && !stops.includes(next) && !isCloser(next) && (!isBoundary(next) || next === "(" || isSignChar(next));
    if (!applies) return name;
    const e = this.operand(stops);
    return e.length ? [{ t: "func", name, e }] : name;
  }

  prescript(stops) {
    let sub = [], sup = [];
    while (this.peek() === "^" || this.peek() === "_") {
      const c = this.peek(); this.i++;
      const s = this.scriptOperand(stops);
      if (c === "^") sup = s; else sub = s;
    }
    if (this.peek() === "▒") this.i++;
    return { t: "script", kind: "pre", base: this.operand(stops), sub, sup };
  }

  operand(stops) {
    if (this.tired()) return this.rest();
    this.depth++;
    let out = [];
    const grp = (open, close) => {
      this.i++;
      const g = this.group(open, [close]);
      out = g.elems.length === 1 && (open !== "(" || g.end === ")") ? g.elems[0] : [g];
      this.postfix(out, stops, true);
    };
    if (this.peek() === "(") grp("(", ")");
    else if (this.peek() === "〖") grp("〖", "〗");
    else {
      const c0 = this.peek();
      if (c0 !== undefined && "−-+±∓".includes(c0) && this.peekAt(1) !== undefined && !isBoundary(this.peekAt(1))) { this.i++; out.push(text1(c0)); }
      for (;;) {
        const c = this.peek();
        if (c === undefined || stops.includes(c) || isBoundary(c) || this.tired()) break;
        const a = this.atom(stops);
        if (!a.length) break;
        out.push(...a);
        this.postfix(out, stops, false);
      }
      const c = this.peek();
      if (!out.length && c !== undefined && c !== " " && !stops.includes(c) && !isCloser(c) && !"/⁄∕¦&@#│▒".includes(c)) { this.i++; out.push(text1(c)); }
    }
    this.depth--;
    return out;
  }

  postfix(out, stops, whole) {
    for (;;) {
      const c = this.peek();
      if (c === undefined || this.tired()) break;
      if (!("^_".includes(c) || ("┬┴".includes(c) && this.noLimits === 0) || isCombining(c))) break;
      this.i++;
      const base = () => {
        if (whole && out.length !== 1) { if (!out.length) return null; return group(out.splice(0)); }
        return out.pop() || null;
      };
      if (c === "^" || c === "_") { const s = this.scriptOperand(stops); const b = base(); out.push(attachScript(b, c === "^", s)); }
      else if (c === "┬" || c === "┴") { const lim = this.scriptOperand(stops); const b = base(); out.push({ t: "lim", upper: c === "┴", e: b ? [b] : [], lim }); }
      else { const b = base(); out.push({ t: "acc", chr: c, e: b ? stripParens([b]) : [] }); }
    }
  }

  scriptOperand(stops) {
    if (this.tired()) return this.rest();
    this.depth++;
    const c = this.peek();
    let out = [];
    const grp = (open, close) => { this.i++; const g = this.group(open, [close]); return g.elems.length === 1 && (open !== "(" || g.end === ")") ? g.elems[0] : [g]; };
    if (c === "(") out = grp("(", ")");
    else if (c === "〖") out = grp("〖", "〗");
    else if (c !== undefined && (isPrefix(c) || closerOf(c))) out = this.atom(stops);
    else if (c !== undefined && /[0-9]/.test(c)) {
      const s = this.i;
      while (this.peek() !== undefined && /[\p{L}\p{N}.]/u.test(this.peek())) this.i++;
      out = [run(this.c.slice(s, this.i).join(""))];
    } else if (c !== undefined && isSignChar(c) && this.peekAt(1) !== undefined && !isBoundary(this.peekAt(1))) {
      this.i++; out = [text1(c), ...this.scriptOperand(stops)];
    } else if (c !== undefined && /\p{L}/u.test(c)) {
      const s = this.i;
      while (this.peek() !== undefined && /[\p{L}\p{N}]/u.test(this.peek())) this.i++;
      const t = this.c.slice(s, this.i).join("");
      out = [FUNCTION_NAMES.includes(t) ? plain(t) : run(t)];
    } else if (c !== undefined && !stops.includes(c) && c !== " " && !isCloser(c)) { this.i++; out = [text1(c)]; }
    this.depth--;
    return out;
  }
}

function grid(matrix, inner) {
  const rows = [[[]]];
  for (const n of inner) {
    if (n.t === "run" && n.text === "@") rows.push([[]]);
    else if (n.t === "run" && n.text === "&" && matrix) rows[rows.length - 1].push([]);
    else rows[rows.length - 1][rows[rows.length - 1].length - 1].push(n);
  }
  return matrix ? { t: "matrix", rows, colJc: [] } : { t: "eqArr", rows: rows.map((r) => r.flat()) };
}

function clean(a) {
  const out = [];
  for (const n of a) {
    if (n.t === "run" && (n.text === " " || chars(n.text).every((c) => c === PLACEHOLDER))) continue;
    out.push(mapArgs(n, clean));
  }
  return mergeRuns(out);
}

export function parseLinear(s) {
  const p = new LinearParser(s);
  let out = [];
  while (p.i < p.c.length) {
    out.push(...p.expr([]));
    const c = p.peek();
    if (c !== undefined) { p.i++; out.push(text1(c)); }
  }
  out = clean(out);
  if (out.some((n) => n.t === "run" && n.text.includes("#"))) out = [{ t: "eqArr", rows: [out] }];
  return out;
}

// ---------------------------------------------------------------------------
// Árvore -> formato linear (math.rs to_linear)

const alnumRun = (s) => chars(s).every((c) => /[\p{L}\p{N}.]/u.test(c));

export function toLinear(nodes) { const s = { v: "" }; linArg(nodes, s, 0); return s.v; }
function linArg(a, s, depth) {
  if (depth > MAX_DEPTH) return;
  a.forEach((n, i) => {
    linNode(n, s, depth + 1);
    if ((n.t === "script" && n.kind !== "pre") || n.t === "lim") {
      const last = chars(s.v).pop();
      const nx = a[i + 1] && firstLinChar(a[i + 1]);
      if (last && /[\p{L}\p{N}.]/u.test(last) && nx && /[\p{L}\p{N}.]/u.test(nx)) s.v += " ";
    }
  });
}
function firstLinChar(n) {
  switch (n.t) {
    case "run": return chars(n.text)[0];
    case "func": return n.name[0] && firstLinChar(n.name[0]);
    case "script": return n.kind !== "pre" && n.base[0] ? firstLinChar(n.base[0]) : undefined;
    case "lim": return n.e[0] && firstLinChar(n.e[0]);
    case "frac": return n.num[0] && firstLinChar(n.num[0]);
    default: return undefined;
  }
}
function linOperand(a, s, depth) {
  const inner = { v: "" };
  linArg(a, inner, depth);
  let simple = false;
  if (a.length === 1 && a[0].t === "run") {
    const cs = chars(a[0].text);
    simple = cs.length === 1 ? !"+-−=/^_ ".includes(cs[0]) : alnumRun(a[0].text);
  } else if (a.length === 1 && a[0].t === "delim") simple = true;
  s.v += simple && inner.v ? inner.v : `(${inner.v})`;
}
function linScript(a, s, depth) {
  if (a.length === 1 && a[0].t === "run" && chars(a[0].text).length > 1) {
    const r = a[0];
    const upName = r.sty === "plain" && FUNCTION_NAMES.includes(r.text);
    const number = /^[0-9]/.test(r.text) && alnumRun(r.text);
    const word = /^\p{L}/u.test(r.text) && chars(r.text).every((c) => /[\p{L}\p{N}]/u.test(c));
    if ((r.sty === "plain" && !upName) || (!number && !word)) { s.v += `(${r.text})`; return; }
  }
  linOperand(a, s, depth);
}
function linNode(n, s, depth) {
  switch (n.t) {
    case "run": s.v += n.text; break;
    case "frac": linOperand(n.num, s, depth); s.v += n.kind === "skewed" ? "⁄" : n.kind === "linear" ? "∕" : n.kind === "noBar" ? "¦" : "/"; linOperand(n.den, s, depth); break;
    case "script":
      if (n.kind === "pre") { s.v += "_"; linScript(n.sub, s, depth); s.v += "^"; linScript(n.sup, s, depth); s.v += "▒"; linOperand(n.base, s, depth); break; }
      linOperand(n.base, s, depth);
      if (n.kind === "sub" || n.kind === "subsup") { s.v += "_"; linScript(n.sub, s, depth); }
      if (n.kind === "sup" || n.kind === "subsup") { s.v += "^"; linScript(n.sup, s, depth); }
      break;
    case "rad":
      if (n.degHide || !n.deg.length) { s.v += "√"; linOperand(n.e, s, depth); }
      else { s.v += "√("; linArg(n.deg, s, depth); s.v += "&"; linArg(n.e, s, depth); s.v += ")"; }
      break;
    case "nary":
      s.v += n.chr;
      if (!n.subHide && n.sub.length) { s.v += "_"; linScript(n.sub, s, depth); }
      if (!n.supHide && n.sup.length) { s.v += "^"; linScript(n.sup, s, depth); }
      s.v += "▒"; linOperand(n.e, s, depth);
      break;
    case "delim": {
      const pair = n.beg && n.end && closerOf(n.beg) === n.end;
      const invisible = !n.beg && !n.end;
      if (pair) s.v += n.beg; else if (invisible) s.v += "〖"; else s.v += "├" + (n.beg || "");
      n.elems.forEach((e, i) => { if (i > 0) s.v += "│"; linArg(e, s, depth); });
      if (pair) s.v += n.end; else if (invisible) s.v += "〗"; else s.v += (n.end || "") + "┤";
      break;
    }
    case "func": linArg(n.name, s, depth); s.v += "\u2061"; linOperand(n.e, s, depth); break;
    case "lim": linOperand(n.e, s, depth); s.v += n.upper ? "┴" : "┬"; linScript(n.lim, s, depth); break;
    case "acc": linOperand(n.e, s, depth); s.v += n.chr; break;
    case "bar": s.v += n.top ? "¯" : "▁"; linOperand(n.e, s, depth); break;
    case "borderBox": s.v += "▭"; linOperand(n.e, s, depth); break;
    case "boxed": s.v += "□"; linOperand(n.e, s, depth); break;
    case "groupChr": s.v += n.chr; linOperand(n.e, s, depth); break;
    case "eqArr":
      if (n.rows.length === 1 && hasNumberMark(n.rows[0])) linArg(n.rows[0], s, depth);
      else { s.v += "█("; n.rows.forEach((r, i) => { if (i > 0) s.v += "@"; linArg(r, s, depth); }); s.v += ")"; }
      break;
    case "matrix":
      s.v += "■(";
      n.rows.forEach((r, i) => { if (i > 0) s.v += "@"; r.forEach((c, j) => { if (j > 0) s.v += "&"; linArg(c, s, depth); }); });
      s.v += ")";
      break;
    case "phant": s.v += "⟡"; linOperand(n.e, s, depth); break;
    default:
  }
}

// ---------------------------------------------------------------------------
// Árvore -> LaTeX (math_latex.rs to_latex, núcleo)

const texChar = (c) => {
  if ("{}$&#%_".includes(c)) return `\\${c}`;
  if (c === "\\") return "\\backslash ";
  if (c === "\u00A0") return "~";
  const name = NAME_OF.get(c);
  return name ? `\\${name} ` : c;
};
export function toLatex(nodes) { const s = { v: "" }; texArg(nodes, s, 0); return s.v.replace(/ +$/, "").replace(/ +([}\])^_])/g, "$1"); }
const texBraced = (a, s, d) => { s.v += "{"; texArg(a, s, d); s.v += "}"; };
function texArg(a, s, d) { if (d > MAX_DEPTH) return; a.forEach((n) => texNode(n, s, d + 1)); }
function texDelim(c, side) { if (!c) return "."; return { "{": "\\{", "}": "\\}", "‖": "\\|", "⟨": "\\langle ", "⟩": "\\rangle ", "⌈": "\\lceil ", "⌉": "\\rceil ", "⌊": "\\lfloor ", "⌋": "\\rfloor " }[c] || c; }
function texNode(n, s, d) {
  switch (n.t) {
    case "run": {
      if (n.nor) { s.v += `\\text{${n.text}}`; break; }
      const wrapCmd = n.scr === "doubleStruck" ? "mathbb" : n.scr === "script" ? "mathcal" : n.scr === "fraktur" ? "mathfrak" : n.scr === "sansSerif" ? "mathsf" : n.scr === "monospace" ? "mathtt" : n.sty === "bold" ? "mathbf" : n.sty === "boldItalic" ? "boldsymbol" : n.sty === "plain" ? "mathrm" : null;
      const body = n.sty === "plain" && FUNCTION_NAMES.includes(n.text) ? `\\${n.text} ` : chars(n.text).map(texChar).join("");
      s.v += wrapCmd && !body.startsWith("\\" + n.text) ? `\\${wrapCmd}{${body}}` : body;
      break;
    }
    case "frac": s.v += n.kind === "noBar" ? "\\binom" : "\\frac"; texBraced(n.num, s, d); texBraced(n.den, s, d); break;
    case "script":
      if (n.kind === "pre") { s.v += "{}"; s.v += "_"; texBraced(n.sub, s, d); s.v += "^"; texBraced(n.sup, s, d); texArg(n.base, s, d); break; }
      s.v += n.base.length > 1 ? "{" : ""; texArg(n.base, s, d); s.v += n.base.length > 1 ? "}" : "";
      if (n.kind === "sub" || n.kind === "subsup") { s.v += "_"; texBraced(n.sub, s, d); }
      if (n.kind === "sup" || n.kind === "subsup") { s.v += "^"; texBraced(n.sup, s, d); }
      break;
    case "rad": s.v += "\\sqrt"; if (!n.degHide && n.deg.length) { s.v += "["; texArg(n.deg, s, d); s.v += "]"; } texBraced(n.e, s, d); break;
    case "nary":
      s.v += texChar(n.chr);
      if (!n.subHide && n.sub.length) { s.v += "_"; texBraced(n.sub, s, d); }
      if (!n.supHide && n.sup.length) { s.v += "^"; texBraced(n.sup, s, d); }
      s.v += " "; texArg(n.e, s, d);
      break;
    case "delim":
      if (!n.beg && !n.end) { texBraced(n.elems.flat(), s, d); break; }
      s.v += `\\left${texDelim(n.beg)}`;
      n.elems.forEach((e, i) => { if (i > 0) s.v += `\\middle${texDelim(n.sep || "|")}`; texArg(e, s, d); });
      s.v += `\\right${texDelim(n.end)}`;
      break;
    case "func": texArg(n.name, s, d); s.v += " "; texArg(n.e, s, d); break;
    case "lim": s.v += n.upper ? "\\overset" : "\\underset"; texBraced(n.lim, s, d); texBraced(n.e, s, d); break;
    case "acc": {
      const name = { "\u0302": "hat", "\u0303": "tilde", "\u0307": "dot", "\u0308": "ddot", "\u20DB": "dddot", "\u030C": "check", "\u0306": "breve", "\u0301": "acute", "\u0300": "grave", "\u0305": "bar", "\u20D7": "vec" }[n.chr] || "hat";
      s.v += `\\${name}`; texBraced(n.e, s, d); break;
    }
    case "bar": s.v += n.top ? "\\overline" : "\\underline"; texBraced(n.e, s, d); break;
    case "borderBox": case "boxed": s.v += "\\boxed"; texBraced(n.e, s, d); break;
    case "groupChr": s.v += { "⏞": "\\overbrace", "⏟": "\\underbrace", "⏜": "\\overparen", "⏝": "\\underparen", "⎴": "\\overbracket", "⎵": "\\underbracket" }[n.chr] || "\\overbrace"; texBraced(n.e, s, d); break;
    case "eqArr": s.v += "\\begin{aligned}"; n.rows.forEach((r, i) => { if (i > 0) s.v += "\\\\ "; texArg(r, s, d); }); s.v += "\\end{aligned}"; break;
    case "matrix": s.v += "\\begin{matrix}"; n.rows.forEach((r, i) => { if (i > 0) s.v += "\\\\ "; r.forEach((c, j) => { if (j > 0) s.v += " & "; texArg(c, s, d); }); }); s.v += "\\end{matrix}"; break;
    case "phant": s.v += "\\phantom"; texBraced(n.e, s, d); break;
    default:
  }
}

// ---------------------------------------------------------------------------
// Árvore -> MathML Core

const xe = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ACCENT_CHARS = { "\u0302": "ˆ", "\u0303": "˜", "\u0307": "˙", "\u0308": "¨", "\u20DB": "⃛", "\u030C": "ˇ", "\u0306": "˘", "\u0301": "´", "\u0300": "`", "\u0305": "¯", "\u20D7": "→", "\u20D6": "←", "\u20E1": "↔", "\u030A": "˚" };

function mrow(a, d) { return `<mrow>${margs(a, d)}</mrow>`; }
function margs(a, d) { return a.length ? a.map((n) => mnode(n, d + 1)).join("") : "<mrow></mrow>"; }
function mrun(r) {
  const t = r.text;
  if (r.nor) return `<mtext${r.sty === "bold" ? ' mathvariant="bold"' : r.sty === "italic" ? ' mathvariant="italic"' : ""}>${xe(t).replace(/ /g, "&#xA0;")}</mtext>`;
  let out = "";
  const bold = r.sty === "bold" || r.sty === "boldItalic";
  const scr = r.scr || "roman";
  const toks = chars(t).reduce((acc, c) => {
    const kind = /\p{L}/u.test(c) ? "i" : /[0-9]/.test(c) || (c === "." && acc.length && acc[acc.length - 1].k === "n") ? "n" : c === " " ? "s" : "o";
    const last = acc[acc.length - 1];
    if (last && last.k === kind && (kind === "n" || (kind === "i" && r.sty === "plain" && FUNCTION_NAMES.includes(t)))) last.s += c; else acc.push({ k: kind, s: c });
    return acc;
  }, []);
  for (const tk of toks) {
    if (tk.k === "i") {
      const upright = r.sty === "plain" || r.sty === "bold" && false;
      const italic = r.sty === "italic" || r.sty === "boldItalic" || (!r.sty && scr === "roman" && chars(tk.s).length === 1);
      const conv = chars(tk.s).map((c) => mathAlnum(c, bold, italic && (bold || r.sty === "italic" || r.sty === "boldItalic"), scr)).join("");
      const mv = scr === "roman" && (upright || (r.sty === "bold")) ? ' mathvariant="normal"' : "";
      out += `<mi${mv}>${xe(conv)}</mi>`;
    } else if (tk.k === "n") out += `<mn>${xe(chars(tk.s).map((c) => mathAlnum(c, bold, false, scr)).join(""))}</mn>`;
    else if (tk.k === "s") out += `<mspace width="0.25em"></mspace>`;
    else out += `<mo>${xe(tk.s)}</mo>`;
  }
  return out;
}

function mnode(n, d) {
  if (d > MAX_DEPTH) return "";
  switch (n.t) {
    case "run": return mrun(n);
    case "frac":
      if (n.kind === "linear" || n.kind === "skewed") return `<mrow>${mrow(n.num, d)}<mo>${n.kind === "skewed" ? "⁄" : "∕"}</mo>${mrow(n.den, d)}</mrow>`;
      return `<mfrac${n.kind === "noBar" ? ' linethickness="0"' : ""}>${mrow(n.num, d)}${mrow(n.den, d)}</mfrac>`;
    case "script":
      if (n.kind === "pre") return `<mmultiscripts>${mrow(n.base, d)}<mprescripts></mprescripts>${n.sub.length ? mrow(n.sub, d) : "<none></none>"}${n.sup.length ? mrow(n.sup, d) : "<none></none>"}</mmultiscripts>`;
      if (n.kind === "sup") return `<msup>${mrow(n.base, d)}${mrow(n.sup, d)}</msup>`;
      if (n.kind === "sub") return `<msub>${mrow(n.base, d)}${mrow(n.sub, d)}</msub>`;
      return `<msubsup>${mrow(n.base, d)}${mrow(n.sub, d)}${mrow(n.sup, d)}</msubsup>`;
    case "rad": return n.degHide || !n.deg.length ? `<msqrt>${margs(n.e, d)}</msqrt>` : `<mroot>${mrow(n.e, d)}${mrow(n.deg, d)}</mroot>`;
    case "nary": {
      const op = `<mo largeop="true" movablelimits="true" stretchy="false">${xe(n.chr)}</mo>`;
      const loc = n.limLoc || (isIntegral(n.chr) ? "subSup" : "undOvr");
      const hasSub = !n.subHide && n.sub.length, hasSup = !n.supHide && n.sup.length;
      let head = op;
      if (hasSub || hasSup) {
        const tag = loc === "subSup" ? ["msub", "msup", "msubsup"] : ["munder", "mover", "munderover"];
        const dm = loc === "undOvr" ? ' displaystyle="true"' : "";
        head = hasSub && hasSup ? `<${tag[2]}>${op}${mrow(n.sub, d)}${mrow(n.sup, d)}</${tag[2]}>` : hasSub ? `<${tag[0]}>${op}${mrow(n.sub, d)}</${tag[0]}>` : `<${tag[1]}>${op}${mrow(n.sup, d)}</${tag[1]}>`;
        void dm;
      }
      return `<mrow>${head}${n.e.length ? mrow(n.e, d) : ""}</mrow>`;
    }
    case "delim": {
      let s = "<mrow>";
      if (n.beg) s += `<mo fence="true" stretchy="true" form="prefix">${xe(n.beg)}</mo>`;
      n.elems.forEach((e, i) => { if (i > 0) s += `<mo fence="true" stretchy="true" separator="true">${xe(n.sep || "|")}</mo>`; s += mrow(e, d); });
      if (n.end) s += `<mo fence="true" stretchy="true" form="postfix">${xe(n.end)}</mo>`;
      return s + "</mrow>";
    }
    case "func": return `<mrow>${margs(n.name, d)}<mo>&#x2061;</mo>${mrow(n.e, d)}</mrow>`;
    case "lim": return `<${n.upper ? "mover" : "munder"}>${mrow(n.e, d)}${mrow(n.lim, d)}</${n.upper ? "mover" : "munder"}>`;
    case "acc": return `<mover accent="true">${mrow(n.e, d)}<mo>${xe(ACCENT_CHARS[n.chr] || n.chr)}</mo></mover>`;
    case "bar": return n.top ? `<mover accent="true">${mrow(n.e, d)}<mo>&#xAF;</mo></mover>` : `<munder>${mrow(n.e, d)}<mo>&#x332;</mo></munder>`;
    case "borderBox": case "boxed": return `<mrow class="wm-box">${margs(n.e, d)}</mrow>`;
    case "groupChr": return `<${n.top ? "mover" : "munder"}>${mrow(n.e, d)}<mo stretchy="true">${xe(n.chr)}</mo></${n.top ? "mover" : "munder"}>`;
    case "eqArr": {
      const rows = n.rows.map((r) => {
        let label = null, cells = r;
        if (hasNumberMark(r)) {
          const k = r.findIndex((x) => x.t === "run" && !x.lit && !x.nor && x.text.includes("#"));
          const [before, after] = r[k].text.split(/#(.*)/s);
          cells = [...r.slice(0, k), ...(before ? [run(before)] : [])];
          label = [run(after || ""), ...r.slice(k + 1)];
        }
        const parts = [[]];
        cells.forEach((x) => { if (x.t === "run" && x.text === "&") parts.push([]); else parts[parts.length - 1].push(x); });
        return { parts, label };
      });
      const numbered = rows.some((r) => r.label);
      return `<mtable columnalign="right left" displaystyle="true">${rows.map((r) => `<mtr>${r.parts.map((p) => `<mtd>${margs(p, d)}</mtd>`).join("")}${numbered ? `<mtd>${r.label ? margs(r.label, d) : ""}</mtd>` : ""}</mtr>`).join("")}</mtable>`;
    }
    case "matrix": return `<mtable>${n.rows.map((r) => `<mtr>${r.map((c, j) => `<mtd${n.colJc && n.colJc[j] && n.colJc[j] !== "center" ? ` columnalign="${n.colJc[j]}"` : ""}>${margs(c, d)}</mtd>`).join("")}</mtr>`).join("")}</mtable>`;
    case "phant": return `<mphantom>${margs(n.e, d)}</mphantom>`;
    default: return "";
  }
}

// MathML pronto para inserir no HTML do editor.
export function toMathML(nodes, display = false) {
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${display ? "block" : "inline"}">${mrow(nodes, 0)}</math>`;
}

// Entrada do usuário: "latex" ou "linear" -> árvore. Placeholders ⬚ são mantidos para edição.
export function parseEquation(src, format = "linear") {
  return format === "latex" ? parseLatex(src) : parseLinear(src);
}

// Texto simples (para exportação e leitores de tela).
export function equationText(nodes) { return toLinear(nodes).replace(/[\u2061]/g, ""); }

const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// HTML do elemento de equação que vai para o documento. `data-eq` guarda o texto-fonte (para
// editar de novo e para exportar); o MathML é só o desenho.
export function buildEquationHtml(src, format = "linear", display = false) {
  const nodes = parseEquation(src, format);
  return `<span class="word-equation word-math" contenteditable="false" data-eq="${escAttr(src)}" data-fmt="${format}" data-display="${display ? 1 : 0}" title="Clique duas vezes para editar">${toMathML(nodes, display)}</span>`;
}

// AutoCorreção de matemática ao digitar (formato linear): "\alpha " vira "α" (o espaço é consumido,
// como no Word); outros separadores ("\pi+") ficam. Devolve { value, caret } ou null.
export function mathAutocorrect(value, caret) {
  const before = value.slice(0, caret);
  const m = /\\([A-Za-z]+)([ \t+\-*/=()^_,.;:|])$/.exec(before);
  if (!m) return null;
  const sym = symbol(m[1]);
  if (sym == null) return null;
  const keep = m[2] === " " || m[2] === "\t" ? "" : m[2];
  return { value: value.slice(0, m.index) + sym + keep + value.slice(caret), caret: m.index + sym.length + keep.length };
}
