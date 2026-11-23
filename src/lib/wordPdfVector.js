import { jsPDF } from "jspdf";
import { formatPageNumber } from "./wordPageModel";
import { downloadBlob, safeFileName } from "./wordExport";

// PDF "de verdade" do editor Word: lê do DOM onde cada palavra, caixa, borda, tabela e imagem está na tela e escreve o PDF com
// TEXTO real (selecionável, fontes embutidas) e desenho vetorial, como o Word faz. Nada vira foto da página.
// Fluxo: 1) coleta (DOM -> itens em coordenadas do corpo)  2) paginação (cada linha/linha de tabela/imagem é uma unidade
// indivisível; nada atravessa a margem inferior)  3) carrega fontes/imagens  4) desenha página por página no jsPDF.
// Fontes: versões compactas (public/fonts) compatíveis em medida com Calibri/Arial/Times/Courier/Cambria. O texto é posicionado
// palavra por palavra nas posições medidas no navegador, então as quebras de linha e a justificação ficam idênticas à tela.

const PX = 0.75; // 1 px CSS = 0.75 pt
const FONT_BASE = () => `${(import.meta.env && import.meta.env.BASE_URL) || "/"}fonts/`;

const FONT_STYLES = {
  Carlito: ["Regular", "Bold", "Italic", "BoldItalic"],
  Caladea: ["Regular", "Bold", "Italic", "BoldItalic"],
  LiberationSans: ["Regular", "Bold", "Italic", "BoldItalic"],
  LiberationSerif: ["Regular", "Bold", "Italic", "BoldItalic"],
  LiberationMono: ["Regular", "Bold", "Italic", "BoldItalic"],
  DejaVuSans: ["Regular", "Bold"],
};
const styleKey = (fam, b, i) => {
  const want = b && i ? "BoldItalic" : b ? "Bold" : i ? "Italic" : "Regular";
  return FONT_STYLES[fam].includes(want) ? want : b ? "Bold" : "Regular";
};

function pickFamily(css) {
  const names = String(css || "").split(",").map((s) => s.replace(/["']/g, "").trim().toLowerCase());
  for (const n of names) {
    if (/mono|courier|consolas|menlo|monaco|cousine|lucida console|fira code|source code/.test(n)) return "LiberationMono";
    if (/cambria|caladea/.test(n)) return "Caladea";
    if (/times|georgia|garamond|palatino|book antiqua|bookman|minion|tinos|liberation serif|^serif$|baskerville|didot|merriweather|playfair|lora/.test(n)) return "LiberationSerif";
    if (/arial|helvetica|arimo|liberation sans|verdana|tahoma|trebuchet|impact/.test(n)) return "LiberationSans";
    if (/calibri|carlito|segoe|candara|corbel|open sans|roboto|inter|system-ui|-apple-system|sf pro|^sans-serif$|ui-sans|poppins|montserrat|nunito/.test(n)) return "Carlito";
  }
  return "Carlito";
}

// ---------- fontes ----------
const fontBuffers = new Map(); // arquivo -> Promise<ArrayBuffer>
const loadBuffer = (file) => {
  if (!fontBuffers.has(file)) {
    fontBuffers.set(file, fetch(`${FONT_BASE()}${file}.ttf`).then((r) => { if (!r.ok) throw new Error("fonte " + file + " indisponível"); return r.arrayBuffer(); }).catch((e) => { fontBuffers.delete(file); throw e; }));
  }
  return fontBuffers.get(file);
};
const toB64 = (buf) => {
  const u8 = new Uint8Array(buf); let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
};
// Mapa de caracteres da fonte (cmap formato 4/12): diz se a fonte tem o glifo, para trocar por DejaVu quando faltar.
function parseCmap(buf) {
  try {
    const dv = new DataView(buf); const n = dv.getUint16(4); let off = -1;
    for (let i = 0; i < n; i++) { const p = 12 + 16 * i; if (String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3)) === "cmap") off = dv.getUint32(p + 8); }
    if (off < 0) return () => true;
    const nt = dv.getUint16(off + 2); let best = null;
    for (let j = 0; j < nt; j++) {
      const pid = dv.getUint16(off + 4 + 8 * j), eid = dv.getUint16(off + 6 + 8 * j), o = off + dv.getUint32(off + 8 + 8 * j), fmt = dv.getUint16(o);
      if (pid === 3 && eid === 10 && fmt === 12) best = { fmt, o };
      else if (((pid === 3 && eid === 1) || pid === 0) && fmt === 4 && (!best || best.fmt !== 12)) best = { fmt, o };
    }
    if (!best) return () => true;
    const o = best.o;
    if (best.fmt === 12) {
      const ng = dv.getUint32(o + 12);
      return (cp) => { for (let g = 0; g < ng; g++) { const b = o + 16 + g * 12; if (cp >= dv.getUint32(b) && cp <= dv.getUint32(b + 4)) return true; } return false; };
    }
    const sc = dv.getUint16(o + 6) / 2, endP = o + 14, startP = endP + sc * 2 + 2, deltaP = startP + sc * 2, roP = deltaP + sc * 2;
    return (cp) => {
      if (cp > 0xffff) return false;
      for (let i = 0; i < sc; i++) {
        if (cp > dv.getUint16(endP + 2 * i)) continue;
        const st = dv.getUint16(startP + 2 * i); if (cp < st) return false;
        const delta = dv.getInt16(deltaP + 2 * i), ro = dv.getUint16(roP + 2 * i);
        if (ro === 0) return ((cp + delta) & 0xffff) !== 0;
        const g = dv.getUint16(roP + 2 * i + ro + 2 * (cp - st));
        return g !== 0 && ((g + delta) & 0xffff) !== 0;
      }
      return false;
    };
  } catch { return () => true; }
}

// ---------- cores ----------
let colorCtx = null;
const colorCache = new Map();
function parseColor(str) {
  if (!str) return null;
  if (colorCache.has(str)) return colorCache.get(str);
  let out = null;
  let m = str.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.%]+))?\s*\)$/);
  if (!m) {
    if (str === "transparent") out = null;
    else {
      try {
        colorCtx = colorCtx || document.createElement("canvas").getContext("2d");
        colorCtx.fillStyle = "#000"; colorCtx.fillStyle = str;
        const v = colorCtx.fillStyle;
        const h = v.match(/^#([0-9a-f]{6})$/i);
        if (h) out = { r: parseInt(h[1].slice(0, 2), 16), g: parseInt(h[1].slice(2, 4), 16), b: parseInt(h[1].slice(4, 6), 16), a: 1 };
        else { m = v.match(/^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/); if (m) out = { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] }; }
      } catch { out = null; }
    }
  } else {
    let a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    out = { r: Math.round(+m[1]), g: Math.round(+m[2]), b: Math.round(+m[3]), a };
  }
  if (out && out.a <= 0.004) out = null;
  colorCache.set(str, out);
  return out;
}

// ---------- marcadores de lista ----------
const ROMAN = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
const toRoman = (n) => { let r = ""; for (const [v, s] of ROMAN) while (n >= v) { r += s; n -= v; } return r; };
const toAlpha = (n) => { let s = ""; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };
const GREEK = "αβγδεζηθικλμνξοπρστυφχψω";
function markerText(type, n) {
  const t = String(type || "").trim();
  if (/^["']/.test(t)) return t.replace(/^["']|["']$/g, "");
  switch (t) {
    case "none": return "";
    case "disc": return "•";
    case "circle": return "◦";
    case "square": return "▪";
    case "decimal": return n + ".";
    case "decimal-leading-zero": return (n < 10 ? "0" : "") + n + ".";
    case "lower-alpha": case "lower-latin": return toAlpha(n) + ".";
    case "upper-alpha": case "upper-latin": return toAlpha(n).toUpperCase() + ".";
    case "lower-roman": return toRoman(n) + ".";
    case "upper-roman": return toRoman(n).toUpperCase() + ".";
    case "lower-greek": return (GREEK[(n - 1) % GREEK.length] || "α") + ".";
    default: return n + ".";
  }
}

// ---------- paginação ----------
// Cada unidade {top,bottom} (px do corpo) é indivisível. Se a unidade não cabe no que resta da página, vai para o topo da seguinte.
// Com a camada de faixas da tela (páginas separadas) nenhuma unidade cruza a margem, então o deslocamento fica zero e as páginas
// coincidem exatamente com a tela; sem ela (modo contínuo/celular) o mesmo cálculo faz as quebras.
function paginateUnits(units, ph, padTop, padBot) {
  const order = units.map((_, i) => i).sort((a, b) => units[a].top - units[b].top || a - b);
  const room = ph - padTop - padBot;
  let shift = 0, minPage = 0;
  for (const i of order) {
    const u = units[i];
    const t = u.top + shift;
    const h = Math.max(0, u.bottom - u.top);
    let k = Math.max(0, Math.floor((t + 0.01) / ph));
    let target = null;
    const tol = Math.min(6, h * 0.3) + 0.5;
    if (u.breakBefore && k >= minPage && t - k * ph > padTop + 2) target = (k + 1) * ph + padTop;
    else if (k < minPage) target = minPage * ph + padTop;
    else if (!u.after) {
      const limit = (k + 1) * ph - padBot;
      const atTop = t - k * ph <= padTop + 1;
      if (k >= 1 && t < k * ph + padTop - 0.5) target = k * ph + padTop;
      else if (t > limit) target = (k + 1) * ph + padTop;
      else if (t + h - tol > limit && h <= room + 1 && !atTop) target = (k + 1) * ph + padTop;
    }
    if (target != null) { shift += target - t; k = Math.floor((u.top + shift + 0.01) / ph); }
    u.shift = shift;
    u.page = Math.max(0, Math.floor((u.top + shift + 0.01) / ph));
    if (u.after) minPage = u.page + 1;
  }
}

const esc = (s) => String(s);

export function vectorExportBlocker(bodyEl) {
  if (!bodyEl) return "sem corpo";
  if (bodyEl.querySelector(":scope > .pdf-import-page")) return "páginas de PDF importadas (layout fixo)";
  const cs = getComputedStyle(bodyEl);
  if (cs.writingMode && cs.writingMode !== "horizontal-tb") return "texto vertical";
  if (cs.columnCount && cs.columnCount !== "auto") return "colunas";
  return "";
}

export async function downloadWordPdfVector({ pageEl, bodyEl, width, height, title, asBlob = false, onProgress }) {
  const blocker = vectorExportBlocker(bodyEl);
  if (blocker) throw new Error("PDF vetorial indisponível: " + blocker);
  const W = Math.round(width), H = Math.round(height);
  const pageRect = pageEl.getBoundingClientRect(), bodyRect = bodyEl.getBoundingClientRect();
  const sc = bodyEl.offsetWidth ? bodyRect.width / bodyEl.offsetWidth : 1;
  const X = (v) => (v - pageRect.left) / sc;
  const Y = (v) => (v - bodyRect.top) / sc;
  const bodyCs = getComputedStyle(bodyEl);
  const padTop = parseFloat(bodyCs.paddingTop) || 0, padBot = parseFloat(bodyCs.paddingBottom) || 0;
  const padLeft = parseFloat(bodyCs.paddingLeft) || 0;
  const bodyLeft = X(bodyRect.left);
  const ph = H;

  // ---------- 1) coleta ----------
  const items = [], units = [];
  const csCache = new Map();
  const styleOf = (el) => { let s = csCache.get(el); if (!s) { s = getComputedStyle(el); csCache.set(el, s); } return s; };
  const needFonts = new Set();
  const newUnit = (top, bottom, extra) => { units.push({ top, bottom, ...(extra || {}) }); return units.length - 1; };
  let pendBreakBefore = false;
  const lineUnit = (top, bottom) => { const id = newUnit(top, bottom, pendBreakBefore ? { breakBefore: true } : null); pendBreakBefore = false; return id; };

  const ascCache = new Map();
  let measureCtx = null;
  const fontAscent = (cs) => {
    const key = cs.fontStyle + cs.fontWeight + cs.fontSize + cs.fontFamily;
    if (ascCache.has(key)) return ascCache.get(key);
    measureCtx = measureCtx || document.createElement("canvas").getContext("2d");
    measureCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = measureCtx.measureText("Hg");
    const size = parseFloat(cs.fontSize) || 16;
    const a = Math.round(m.fontBoundingBoxAscent != null && m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent : size * 0.8);
    ascCache.set(key, a);
    return a;
  };
  const fontSpec = (cs) => {
    const fam = pickFamily(cs.fontFamily);
    const w = cs.fontWeight === "bold" ? 700 : parseInt(cs.fontWeight, 10) || 400;
    const bold = w >= 600, italic = cs.fontStyle === "italic" || cs.fontStyle === "oblique";
    needFonts.add(`${fam}|${styleKey(fam, bold, italic)}`);
    return { fam, bold, italic, size: parseFloat(cs.fontSize) || 16 };
  };
  const decoOf = (el) => { // sublinhado/tachado herdados dos ancestrais
    let u = null, s = null, o = null;
    for (let n = el; n && n !== bodyEl.parentElement; n = n.parentElement) {
      const cs = styleOf(n), l = cs.textDecorationLine || "";
      if (l.includes("underline") && !u) u = parseColor(cs.textDecorationColor) || parseColor(cs.color);
      if (l.includes("line-through") && !s) s = parseColor(cs.textDecorationColor) || parseColor(cs.color);
      if (l.includes("overline") && !o) o = parseColor(cs.textDecorationColor) || parseColor(cs.color);
      if (n === bodyEl) break;
    }
    return (u || s || o) ? { u, s, o } : null;
  };

  const range = document.createRange();
  const collectText = (node, ctx) => {
    const parent = node.parentElement; if (!parent) return;
    const data = node.data; if (!data || !data.trim()) return;
    const cs = styleOf(parent);
    if (cs.visibility === "hidden") return;
    const fs = fontSpec(cs);
    const col = parseColor(cs.color) || { r: 0, g: 0, b: 0, a: 1 };
    const asc = fontAscent(cs);
    const tt = cs.textTransform, sc2 = /small-caps/.test(cs.fontVariantCaps || cs.fontVariant || "");
    const spaced = parseFloat(cs.letterSpacing) || 0;
    const words = [];
    const re = /\S+/g; let m;
    while ((m = re.exec(data))) {
      range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
      const rects = range.getClientRects();
      if (!rects.length) continue;
      if (rects.length === 1) { const r = rects[0]; if (r.width > 0 || r.height > 0) words.push({ t: m[0], r }); }
      else for (let i = 0; i < m[0].length; i++) { // palavra quebrada em duas linhas: caractere a caractere
        range.setStart(node, m.index + i); range.setEnd(node, m.index + i + 1);
        const rc = range.getClientRects(); if (rc.length) words.push({ t: m[0][i], r: rc[0] });
      }
    }
    if (!words.length) return;
    const deco = decoOf(parent);
    const link = parent.closest && parent.closest("a[href]");
    // agrupa por linha
    let line = [];
    const flush = () => {
      if (!line.length) return;
      let top = Infinity, bottom = -Infinity;
      for (const w of line) { top = Math.min(top, w.r.top); bottom = Math.max(bottom, w.r.bottom); }
      const unit = ctx.unit != null ? ctx.unit : lineUnit(Y(top), Y(bottom));
      for (const w of line) {
        let str = w.t;
        if (tt === "uppercase") str = str.toUpperCase(); else if (tt === "lowercase") str = str.toLowerCase();
        else if (tt === "capitalize") str = str.replace(/(^|[\s(["'])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
        let size = fs.size;
        if (sc2 && /[a-zà-ÿ]/.test(str)) { str = str.toUpperCase(); size *= 0.8; }
        items.push({ k: "t", unit, x: X(w.r.left), y: Y(w.r.top) + asc, w: w.r.width / sc, str, fam: fs.fam, bold: fs.bold, italic: fs.italic, size, col, alpha: ctx.alpha * col.a, sp: spaced });
      }
      const first = line[0].r, last = line[line.length - 1].r;
      const x0 = X(first.left), x1 = X(last.right);
      if (deco) {
        const base = Y(first.top) + asc, th = Math.max(0.6, fs.size / 14);
        if (deco.u) items.push({ k: "ln", unit, x0, x1, y: base + fs.size * 0.12, th, col: deco.u, alpha: ctx.alpha });
        if (deco.s) items.push({ k: "ln", unit, x0, x1, y: base - fs.size * 0.3, th, col: deco.s, alpha: ctx.alpha });
        if (deco.o) items.push({ k: "ln", unit, x0, x1, y: Y(first.top), th, col: deco.o, alpha: ctx.alpha });
      }
      if (link) items.push({ k: "lk", unit, x: x0, y: Y(first.top), w: x1 - x0, h: (last.bottom - first.top) / sc, url: link.href });
      line = [];
    };
    for (const w of words) {
      if (line.length) {
        const p = line[line.length - 1].r;
        if (Math.abs(w.r.top - p.top) > Math.min(p.height, w.r.height) * 0.5 || w.r.left < p.left - 1) flush();
      }
      line.push(w);
    }
    flush();
  };

  const edgeBox = (el, cs, ctx, unit) => { // fundo + bordas do elemento
    const bg = parseColor(cs.backgroundColor);
    const bw = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map((v) => parseFloat(v) || 0);
    const bs = [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle];
    const bc = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].map(parseColor);
    const borders = bw.map((w, i) => (w > 0 && bs[i] !== "none" && bs[i] !== "hidden" && bc[i]) ? { w, style: bs[i], col: bc[i] } : null);
    if (!bg && !borders.some(Boolean)) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    let rad = parseFloat(cs.borderTopLeftRadius) || 0;
    if (/%/.test(cs.borderTopLeftRadius)) rad = Math.min(r.width, r.height) / sc * (parseFloat(cs.borderTopLeftRadius) / 100);
    const tb = /^(TD|TH|TABLE)$/.test(el.tagName) ? (el.tagName === "TABLE" ? el : el.closest("table")) : null;
    const collapse = !!(tb && styleOf(tb).borderCollapse === "collapse");
    return { k: "box", unit, collapse, x0: X(r.left), x1: X(r.right), y0: Y(r.top), y1: Y(r.bottom), bg, bgAlpha: ctx.alpha, borders, rad: Math.min(rad, r.height / sc / 2, r.width / sc / 2), padT: parseFloat(cs.paddingTop) || 0, padB: parseFloat(cs.paddingBottom) || 0 };
  };

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "HEAD", "META", "LINK", "COLGROUP", "COL", "AUDIO", "SOURCE", "TRACK", "OPTION"]);
  const bandClass = /(^|\s)word-(header|footer)-band/;
  const walk = (el, ctx) => {
    if (el.nodeType === 3) { collectText(el, ctx); return; }
    if (el.nodeType !== 1 || SKIP_TAGS.has(el.tagName)) return;
    const cl = el.classList;
    if (cl.contains("word-page-meta") || bandClass.test(el.className || "") || cl.contains("wordGapLayer") || cl.contains("wordMarksLayer")) return;
    const cs = styleOf(el);
    if (cs.display === "none" || cs.visibility === "hidden" && !el.querySelector("*")) return;
    const op = parseFloat(cs.opacity);
    const nctx = { unit: ctx.unit, alpha: ctx.alpha * (isNaN(op) ? 1 : op) };
    const tag = el.tagName;

    if (cl.contains("word-page-break") && !cl.contains("word-section-break")) { const r = el.getBoundingClientRect(); newUnit(Y(r.top), Y(r.top), { after: true }); return; }
    if (cl.contains("word-section-break")) { const r = el.getBoundingClientRect(); const kind = el.dataset.section; newUnit(Y(r.top), Y(r.top), kind === "continuous" ? null : { after: true }); return; }
    if (el.dataset && el.dataset.chapter) pendBreakBefore = true;

    if (cl.contains("word-ink-layer")) { const r = el.getBoundingClientRect(); items.push({ k: "ink", el, x: X(r.left), y: Y(r.top), w: r.width / sc, h: r.height / sc }); return; }
    if (tag === "IMG") {
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return;
      const unit = ctx.unit != null ? ctx.unit : newUnit(Y(r.top), Y(r.bottom), pendBreakBefore ? { breakBefore: true } : null); pendBreakBefore = false;
      items.push({ k: "img", unit, el, x: X(r.left), y: Y(r.top), w: r.width / sc, h: r.height / sc, alpha: nctx.alpha }); return;
    }
    if (tag === "svg" || tag === "SVG" || tag === "CANVAS" || tag === "MATH" || tag === "math") {
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return;
      const unit = ctx.unit != null ? ctx.unit : newUnit(Y(r.top), Y(r.bottom));
      items.push({ k: "ras", unit, el, x: X(r.left), y: Y(r.top), w: r.width / sc, h: r.height / sc, alpha: nctx.alpha }); return;
    }
    if (tag === "INPUT" && el.type === "checkbox") {
      const r = el.getBoundingClientRect(); const unit = ctx.unit != null ? ctx.unit : newUnit(Y(r.top), Y(r.bottom));
      items.push({ k: "cb", unit, x: X(r.left), y: Y(r.top), s: Math.min(r.width, r.height) / sc, on: el.checked }); return;
    }

    const isRow = tag === "TR";
    if (isRow && ctx.unit == null) { const r = el.getBoundingClientRect(); nctx.unit = newUnit(Y(r.top), Y(r.bottom), pendBreakBefore ? { breakBefore: true } : null); pendBreakBefore = false; }

    const inline = cs.display === "inline";
    let box = null;
    if (!inline) {
      box = edgeBox(el, cs, nctx, nctx.unit);
      if (box) { box.uA = units.length; items.push(box); }
    } else {
      const bgc = parseColor(cs.backgroundColor);
      if (bgc) {
        for (const r of el.getClientRects()) {
          if (r.width <= 0 || r.height <= 0) continue;
          const unit = nctx.unit != null ? nctx.unit : newUnit(Y(r.top), Y(r.bottom));
          items.push({ k: "box", unit, x0: X(r.left), x1: X(r.right), y0: Y(r.top), y1: Y(r.bottom), bg: bgc, bgAlpha: nctx.alpha, borders: [null, null, null, null], rad: 0, padT: 0, padB: 0 });
        }
      }
    }

    const startIdx = items.length;
    if (cl.contains("check-box") && el.parentElement && el.parentElement.classList.contains("checked")) {
      const r = el.getBoundingClientRect(); const unit = nctx.unit != null ? nctx.unit : newUnit(Y(r.top), Y(r.bottom));
      items.push({ k: "tick", unit, x: X(r.left), y: Y(r.top), s: Math.min(r.width, r.height) / sc });
    }
    for (const c of el.childNodes) walk(c, nctx);

    if (box && nctx.unit == null) {
      box.uB = units.length;
      if (box.uB === box.uA) { box.uA = newUnit(box.y0, box.y1); box.uB = box.uA + 1; }
    }
    if (tag === "LI" && cs.display === "list-item") {
      const first = items.slice(startIdx).find((it) => it.k === "t");
      const lt = cs.listStyleType;
      if (first && lt !== "none") {
        const par = el.parentElement;
        let n = 1;
        if (par && (par.tagName === "OL")) {
          const start = parseInt(par.getAttribute("start") || "1", 10) || 1;
          let idx = 0; for (const s of par.children) { if (s === el) break; if (s.tagName === "LI") idx++; }
          n = el.hasAttribute("value") ? parseInt(el.getAttribute("value"), 10) || 1 : start + idx;
        }
        const txt = markerText(lt, n);
        if (txt) { const f = fontSpec(cs); const col = parseColor(cs.color) || { r: 0, g: 0, b: 0, a: 1 }; items.splice(startIdx, 0, { k: "mk", unit: first.unit, x: first.x - f.size * 0.3, y: first.y, str: txt, fam: f.fam, bold: f.bold, italic: f.italic, size: f.size * (/^(disc|circle|square)$/.test(lt) ? 0.9 : 1), col, alpha: nctx.alpha * col.a }); }
      }
    }
  };
  for (const c of bodyEl.childNodes) walk(c, { unit: null, alpha: 1 });

  // ---------- 2) paginação ----------
  paginateUnits(units, ph, padTop, padBot);
  let nPages = 1;
  for (const u of units) if (!u.after || u.page != null) nPages = Math.max(nPages, (u.page || 0) + 1);
  const lastReal = units.filter((u) => !u.after).reduce((m, u) => Math.max(m, u.page), 0);
  nPages = Math.max(1, lastReal + 1);

  // ---------- cabeçalho/rodapé, marca d'água ----------
  const bandsOf = (kind) => {
    const q = (suffix) => bodyEl.querySelector(`.word-${kind}-band${suffix}`);
    return { def: q(""), first: q("-first"), even: q("-even") };
  };
  const hdr = bandsOf("header"), ftr = bandsOf("footer");
  let book = {};
  try { const meta = bodyEl.querySelector(".word-page-meta"); if (meta && meta.dataset.booklayout) book = JSON.parse(meta.dataset.booklayout) || {}; } catch { book = {}; }
  const pgLabel = (i) => formatPageNumber(i, { fmt: book.pgfmt || "", start: parseInt(book.pgstart, 10) || 1 });
  const bandText = (el, i) => {
    let s = "";
    const rec = (n) => {
      if (n.nodeType === 3) { s += n.data; return; }
      if (n.nodeType !== 1) return;
      if (n.classList.contains("word-pagenum")) { const f = n.dataset.fmt || ""; s += f === "of" ? `${pgLabel(i)} de ${nPages}` : pgLabel(i); return; }
      if (n.classList.contains("word-numpages")) { s += String(nPages); return; }
      if (n.tagName === "BR") { s += "\n"; return; }
      n.childNodes.forEach(rec);
    };
    el.childNodes.forEach(rec);
    return s.replace(/[ \t]+/g, " ").trim();
  };
  const bandFor = (b, i) => (i === 0 && b.first) ? b.first : (i % 2 === 1 && b.even) ? b.even : b.def;
  const bandSpecs = new Map();
  [hdr, ftr].forEach((g) => Object.values(g).forEach((el) => { if (el) { const cs = styleOf(el); bandSpecs.set(el, { fs: fontSpec(cs), col: parseColor(cs.color) || { r: 91, g: 100, b: 114, a: 1 }, align: cs.textAlign }); } }));
  const wmEl = pageEl.querySelector(".wordWatermark");
  let wm = null;
  if (wmEl && wmEl.textContent.trim()) {
    const cs = styleOf(wmEl);
    let ang = 0; try { const mm = new DOMMatrix(cs.transform); ang = Math.atan2(mm.b, mm.a) * 180 / Math.PI; } catch { ang = 0; }
    let txt = wmEl.textContent.trim(); if (cs.textTransform === "uppercase") txt = txt.toUpperCase();
    wm = { txt, fs: fontSpec(cs), col: parseColor(cs.color) || { r: 0, g: 0, b: 0, a: 0.13 }, ang, sp: parseFloat(cs.letterSpacing) || 0 };
  }
  const pageCs = styleOf(pageEl);
  const pageBg = parseColor(pageCs.backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const pageBorders = ["Top", "Right", "Bottom", "Left"].map((s) => { const w = parseFloat(pageCs[`border${s}Width`]) || 0, st = pageCs[`border${s}Style`], col = parseColor(pageCs[`border${s}Color`]); return (w > 0 && st !== "none" && col) ? { w, style: st, col } : null; });
  needFonts.add("DejaVuSans|Regular"); needFonts.add("DejaVuSans|Bold");

  // ---------- 3) fontes e imagens ----------
  const pdf = new jsPDF({ unit: "px", format: [W, H], orientation: W > H ? "landscape" : "portrait", compress: true, hotfixes: ["px_scaling"] });
  pdf.setProperties({ title: title || "Documento" });
  const covers = new Map(); // "Fam|Style" -> fn(cp)
  await Promise.all(Array.from(needFonts).map(async (k) => {
    const [fam, st] = k.split("|");
    const file = `${fam}-${st}`;
    const buf = await loadBuffer(file);
    pdf.addFileToVFS(file + ".ttf", toB64(buf));
    pdf.addFont(file + ".ttf", fam, st === "Regular" ? "normal" : st === "Bold" ? "bold" : st === "Italic" ? "italic" : "bolditalic");
    covers.set(k, parseCmap(buf));
  }));

  const imgCache = new Map(); // el -> {data, fmt, alias}
  const canvasFrom = (w, h, scale) => {
    let s = scale; const maxPx = 12e6;
    if (w * s * h * s > maxPx) s = Math.sqrt(maxPx / (w * h));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    return { c, s };
  };
  const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("imagem")); im.src = src; });
  const prepareImage = async (it) => {
    const el = it.el;
    try { if (!el.complete || !el.naturalWidth) await el.decode(); } catch { /* segue */ }
    if (!el.naturalWidth) return;
    const cs = styleOf(el);
    const src = el.currentSrc || el.src;
    const plain = /^data:image\/(png|jpe?g);/i.test(src) && (!cs.filter || cs.filter === "none") && (!cs.transform || cs.transform === "none") && (cs.objectFit === "fill" || cs.objectFit === "") && cs.clipPath === "none";
    if (plain) { const fmt = /jpe?g/i.test(src.slice(0, 20)) ? "JPEG" : "PNG"; it.data = src; it.fmt = fmt; it.alias = "img" + (src.length) + src.slice(-24); return; }
    const w0 = el.offsetWidth || it.w, h0 = el.offsetHeight || it.h;
    const { c, s } = canvasFrom(it.w, it.h, Math.max(1, Math.min(3, el.naturalWidth / Math.max(1, it.w))));
    const g = c.getContext("2d");
    if (cs.filter && cs.filter !== "none") g.filter = cs.filter;
    g.save();
    g.scale(s, s);
    let mat = null; try { mat = cs.transform && cs.transform !== "none" ? new DOMMatrix(cs.transform) : null; } catch { mat = null; }
    g.translate(it.w / 2, it.h / 2);
    if (mat) g.transform(mat.a, mat.b, mat.c, mat.d, 0, 0);
    // object-fit
    let dw = mat ? w0 : it.w, dh = mat ? h0 : it.h, sx = 0, sy = 0, sw = el.naturalWidth, sh = el.naturalHeight, dx = -dw / 2, dy = -dh / 2;
    const fit = cs.objectFit;
    if (fit === "cover") { const k = Math.max(dw / sw, dh / sh); const vw = dw / k, vh = dh / k; sx = (sw - vw) / 2; sy = (sh - vh) / 2; sw = vw; sh = vh; }
    else if (fit === "contain") { const k = Math.min(dw / sw, dh / sh); dx += (dw - sw * k) / 2; dy += (dh - sh * k) / 2; dw = sw * k; dh = sh * k; }
    g.drawImage(el, sx, sy, sw, sh, dx, dy, dw, dh);
    g.restore();
    const jpeg = /^data:image\/jpe?g/i.test(src);
    if (jpeg) { const f = document.createElement("canvas"); f.width = c.width; f.height = c.height; const fg = f.getContext("2d"); fg.fillStyle = "#fff"; fg.fillRect(0, 0, f.width, f.height); fg.drawImage(c, 0, 0); it.data = f.toDataURL("image/jpeg", 0.92); it.fmt = "JPEG"; }
    else { it.data = c.toDataURL("image/png"); it.fmt = "PNG"; }
    it.alias = null;
  };
  const prepareRaster = async (it) => {
    const el = it.el;
    try {
      const { c, s } = canvasFrom(it.w, it.h, 3);
      const g = c.getContext("2d");
      if (el.tagName === "CANVAS") { g.drawImage(el, 0, 0, c.width, c.height); }
      else {
        const ser = new XMLSerializer();
        let svgText;
        if (el.tagName.toLowerCase() === "svg") {
          const cl = el.cloneNode(true); cl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          cl.setAttribute("width", it.w); cl.setAttribute("height", it.h);
          if (!cl.getAttribute("viewBox")) { const vb = el.getAttribute("viewBox"); if (vb) cl.setAttribute("viewBox", vb); }
          svgText = ser.serializeToString(cl);
        } else {
          const cs = styleOf(el);
          svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${it.w}" height="${it.h}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="font:${cs.font};color:${cs.color}">${ser.serializeToString(el)}</div></foreignObject></svg>`;
        }
        const im = await loadImg("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText));
        g.drawImage(im, 0, 0, c.width, c.height);
      }
      it.data = c.toDataURL("image/png"); it.fmt = "PNG";
    } catch { it.data = null; }
  };
  const prepareInk = async (it) => { // camada de tinta: desenhada uma vez e fatiada por página
    try {
      const el = it.el;
      const svg = el.tagName.toLowerCase() === "svg" ? el : el.querySelector("svg");
      if (!svg || !svg.children.length) return;
      const { c, s } = canvasFrom(it.w, it.h, 1.5);
      const cl = svg.cloneNode(true); cl.setAttribute("xmlns", "http://www.w3.org/2000/svg"); cl.setAttribute("width", it.w); cl.setAttribute("height", it.h);
      const im = await loadImg("data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(cl)));
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      it.canvas = c; it.scale = s;
    } catch { it.canvas = null; }
  };
  await Promise.all(items.filter((i) => i.k === "img").map(prepareImage));
  await Promise.all(items.filter((i) => i.k === "ras").map(prepareRaster));
  await Promise.all(items.filter((i) => i.k === "ink").map(prepareInk));

  // ---------- 4) desenho ----------
  const gsCache = new Map();
  let curAlpha = 1;
  const setAlpha = (a) => {
    a = Math.max(0, Math.min(1, a));
    if (Math.abs(a - curAlpha) < 0.001) return;
    const key = Math.round(a * 1000);
    if (!gsCache.has(key)) gsCache.set(key, new pdf.GState({ opacity: a, "stroke-opacity": a }));
    pdf.setGState(gsCache.get(key)); curAlpha = a;
  };
  const fill = (c) => pdf.setFillColor(c.r, c.g, c.b);
  const stroke = (c) => pdf.setDrawColor(c.r, c.g, c.b);
  const fkey = (fam, b, i) => `${fam}|${styleKey(fam, b, i)}`;
  const setFont = (fam, b, i, size) => {
    const st = styleKey(fam, b, i);
    pdf.setFont(fam, st === "Regular" ? "normal" : st === "Bold" ? "bold" : st === "Italic" ? "italic" : "bolditalic");
    pdf.setFontSize(size * PX);
  };
  // desenha uma palavra no x medido; troca para DejaVu os caracteres que a fonte não tem
  const drawWord = (str, x, y, targetW, fam, bold, italic, size, sp) => {
    const cov = covers.get(fkey(fam, bold, italic)) || (() => true);
    const dj = covers.get("DejaVuSans|" + (bold ? "Bold" : "Regular"));
    const runs = []; let cur = null;
    for (const ch of Array.from(str)) {
      const cp = ch.codePointAt(0);
      if (cp === 0xad || (cp >= 0x200b && cp <= 0x200f) || cp === 0xfeff) continue;
      let f = "main";
      if (!cov(cp)) { if (dj && dj(cp)) f = "dj"; else continue; }
      if (cur && cur.f === f) cur.s += ch; else { cur = { f, s: ch }; runs.push(cur); }
    }
    if (!runs.length) return;
    const widthOf = (r) => { if (r.f === "dj") setFont("DejaVuSans", bold, false, size); else setFont(fam, bold, italic, size); return pdf.getTextWidth(r.s); };
    const widths = runs.map(widthOf);
    const nat = widths.reduce((a, b) => a + b, 0);
    const nch = runs.reduce((a, r) => a + Array.from(r.s).length, 0);
    let cs = 0;
    if (targetW > 0 && nch > 0 && nat > 0) { cs = (targetW - nat) / nch; const lim = size * 0.2; if (cs > lim) cs = lim; if (cs < -lim) cs = -lim; if (Math.abs(cs) < 0.02) cs = 0; }
    let cx = x;
    runs.forEach((r, i) => {
      if (r.f === "dj") setFont("DejaVuSans", bold, false, size); else setFont(fam, bold, italic, size);
      pdf.text(r.s, cx, y, cs ? { charSpace: cs } : undefined);
      cx += widths[i] + cs * Array.from(r.s).length;
    });
  };

  const strokeBorderSide = (side, b, x0, y0, x1, y1) => { // lado: 0 topo, 1 dir, 2 base, 3 esq
    if (!b) return;
    fill(b.col); stroke(b.col);
    const w = b.w;
    if (b.style === "dashed" || b.style === "dotted") {
      pdf.setLineWidth(w);
      pdf.setLineDashPattern(b.style === "dashed" ? [w * 3, w * 2] : [w, w * 1.5], 0);
      const hy = side === 0 ? y0 + w / 2 : y1 - w / 2, vx = side === 3 ? x0 + w / 2 : x1 - w / 2;
      if (side === 0 || side === 2) pdf.line(x0, hy, x1, hy); else pdf.line(vx, y0, vx, y1);
      pdf.setLineDashPattern([], 0);
      return;
    }
    if (b.style === "double" && w >= 3) {
      const t = w / 3;
      if (side === 0) { pdf.rect(x0, y0, x1 - x0, t, "F"); pdf.rect(x0, y0 + 2 * t, x1 - x0, t, "F"); }
      else if (side === 2) { pdf.rect(x0, y1 - t, x1 - x0, t, "F"); pdf.rect(x0, y1 - 3 * t, x1 - x0, t, "F"); }
      else if (side === 3) { pdf.rect(x0, y0, t, y1 - y0, "F"); pdf.rect(x0 + 2 * t, y0, t, y1 - y0, "F"); }
      else { pdf.rect(x1 - t, y0, t, y1 - y0, "F"); pdf.rect(x1 - 3 * t, y0, t, y1 - y0, "F"); }
      return;
    }
    if (side === 0) pdf.rect(x0, y0, x1 - x0, w, "F");
    else if (side === 2) pdf.rect(x0, y1 - w, x1 - x0, w, "F");
    else if (side === 3) pdf.rect(x0, y0, w, y1 - y0, "F");
    else pdf.rect(x1 - w, y0, w, y1 - y0, "F");
  };
  const drawBoxSeg = (b, y0, y1, first, last) => {
    const { x0, x1 } = b;
    if (y1 - y0 <= 0 || x1 - x0 <= 0) return;
    const uniform = b.borders.every((q) => q && q.w === b.borders[0].w && q.style === "solid" && q.col.r === b.borders[0].col.r && q.col.g === b.borders[0].col.g && q.col.b === b.borders[0].col.b);
    if (b.bg) { setAlpha(b.bgAlpha * b.bg.a); fill(b.bg); if (b.rad > 0 && first && last) pdf.roundedRect(x0, y0, x1 - x0, y1 - y0, b.rad, b.rad, "F"); else pdf.rect(x0, y0, x1 - x0, y1 - y0, "F"); }
    setAlpha(b.bgAlpha);
    if (b.rad > 0 && first && last && uniform) {
      const w = b.borders[0].w; stroke(b.borders[0].col); pdf.setLineWidth(w);
      pdf.roundedRect(x0 + w / 2, y0 + w / 2, x1 - x0 - w, y1 - y0 - w, b.rad, b.rad, "S");
      return;
    }
    // tabela com bordas coladas: a linha fica centrada na divisa e células vizinhas desenham no mesmo lugar (uma linha só)
    const bw = (i) => (b.borders[i] ? b.borders[i].w : 0);
    const [ex0, ey0, ex1, ey1] = b.collapse ? [x0 - bw(3) / 2, y0 - bw(0) / 2, x1 + bw(1) / 2, y1 + bw(2) / 2] : [x0, y0, x1, y1];
    if (first) strokeBorderSide(0, b.borders[0], ex0, ey0, ex1, ey1);
    if (last) strokeBorderSide(2, b.borders[2], ex0, ey0, ex1, ey1);
    strokeBorderSide(3, b.borders[3], ex0, ey0, ex1, ey1);
    strokeBorderSide(1, b.borders[1], ex0, ey0, ex1, ey1);
  };

  const pageOps = Array.from({ length: nPages }, () => []);
  const clampPage = (p) => Math.min(nPages - 1, Math.max(0, p));
  const place = (it) => {
    const u = units[it.unit];
    const p = clampPage(u.page), off = u.shift - p * ph;
    return { p, off };
  };
  for (const it of items) {
    if (it.k === "box") {
      let list;
      if (it.unit != null) list = [it.unit]; else { list = []; for (let i = it.uA; i < it.uB; i++) list.push(i); }
      const groups = new Map();
      for (const i of list) { const u = units[i]; if (u.after) continue; const p = clampPage(u.page); const g = groups.get(p) || { top: Infinity, bottom: -Infinity, shiftT: 0, shiftB: 0 }; if (u.top + u.shift < g.top) { g.top = u.top + u.shift; g.shiftT = u.shift; } if (u.bottom + u.shift > g.bottom) { g.bottom = u.bottom + u.shift; g.shiftB = u.shift; } groups.set(p, g); }
      const pages = Array.from(groups.keys()).sort((a, b) => a - b);
      pages.forEach((p, idx) => {
        const g = groups.get(p), first = idx === 0, last = idx === pages.length - 1;
        const y0 = (first ? it.y0 + g.shiftT : g.top - it.padT) - p * ph;
        const y1 = (last ? it.y1 + g.shiftB : g.bottom + it.padB) - p * ph;
        pageOps[p].push({ t: "box", b: it, y0, y1, first, last });
      });
      continue;
    }
    if (it.k === "ink") { for (let p = 0; p < nPages; p++) pageOps[p].push({ t: "ink", it }); continue; }
    const { p, off } = place(it);
    pageOps[p].push({ t: it.k, it, off });
  }

  const drawRasterSlice = (it, p) => {
    if (!it.canvas) return;
    const top = p * ph - it.y, bottom = top + ph; // faixa da camada que cai nesta página
    const y0 = Math.max(0, top), y1 = Math.min(it.h, bottom);
    if (y1 <= y0) return;
    const sh = Math.max(1, Math.round((y1 - y0) * it.scale));
    const c = document.createElement("canvas"); c.width = it.canvas.width; c.height = sh;
    c.getContext("2d").drawImage(it.canvas, 0, Math.round(y0 * it.scale), it.canvas.width, sh, 0, 0, c.width, sh);
    setAlpha(1);
    pdf.addImage(c.toDataURL("image/png"), "PNG", it.x, it.y + y0 - p * ph, it.w, (y1 - y0), undefined, "FAST");
  };

  for (let p = 0; p < nPages; p++) {
    if (p > 0) pdf.addPage([W, H], W > H ? "landscape" : "portrait");
    curAlpha = 1; setAlpha(1);
    fill(pageBg); pdf.rect(0, 0, W, H, "F");
    if (pageBorders.some(Boolean)) pageBorders.forEach((b, i) => strokeBorderSide(i, b, 0, 0, W, H));
    if (wm) {
      setAlpha(wm.col.a); pdf.setTextColor(wm.col.r, wm.col.g, wm.col.b);
      setFont(wm.fs.fam, wm.fs.bold, wm.fs.italic, wm.fs.size);
      pdf.text(wm.txt, W / 2, H / 2, { align: "center", angle: -wm.ang, baseline: "middle", charSpace: wm.sp });
      setAlpha(1);
    }
    for (const op of pageOps[p]) {
      if (op.t === "box") { drawBoxSeg(op.b, op.y0, op.y1, op.first, op.last); continue; }
      const it = op.it;
      if (op.t === "t" || op.t === "mk") {
        setAlpha(it.alpha); pdf.setTextColor(it.col.r, it.col.g, it.col.b);
        if (op.t === "mk") {
          setFont(it.fam, it.bold, it.italic, it.size);
          const w = pdf.getTextWidth(it.str);
          drawWord(it.str, it.x - w, it.y + op.off, w, it.fam, it.bold, it.italic, it.size, 0);
        } else drawWord(it.str, it.x, it.y + op.off, it.w, it.fam, it.bold, it.italic, it.size, it.sp);
      } else if (op.t === "ln") {
        setAlpha(it.alpha); fill(it.col); pdf.rect(it.x0, it.y + op.off, it.x1 - it.x0, it.th, "F");
      } else if (op.t === "lk") {
        pdf.link(it.x, it.y + op.off, it.w, it.h, { url: it.url });
      } else if (op.t === "img" || op.t === "ras") {
        if (!it.data) continue;
        setAlpha(it.alpha);
        pdf.addImage(it.data, it.fmt, it.x, it.y + op.off, it.w, it.h, it.alias || undefined, "FAST");
      } else if (op.t === "cb") {
        setAlpha(1); stroke({ r: 90, g: 90, b: 90 }); pdf.setLineWidth(1); pdf.rect(it.x, it.y + op.off, it.s, it.s, "S");
        if (it.on) { pdf.setLineWidth(1.4); pdf.line(it.x + it.s * 0.2, it.y + op.off + it.s * 0.55, it.x + it.s * 0.42, it.y + op.off + it.s * 0.78); pdf.line(it.x + it.s * 0.42, it.y + op.off + it.s * 0.78, it.x + it.s * 0.8, it.y + op.off + it.s * 0.22); }
      } else if (op.t === "tick") {
        setAlpha(1); stroke({ r: 255, g: 255, b: 255 }); pdf.setLineWidth(Math.max(1.2, it.s / 8));
        const yy = it.y + op.off;
        pdf.line(it.x + it.s * 0.22, yy + it.s * 0.52, it.x + it.s * 0.42, yy + it.s * 0.74); pdf.line(it.x + it.s * 0.42, yy + it.s * 0.74, it.x + it.s * 0.78, yy + it.s * 0.26);
      } else if (op.t === "ink") drawRasterSlice(it, p);
    }
    // cabeçalho e rodapé
    for (const [group, isHeader] of [[hdr, true], [ftr, false]]) {
      const el = bandFor(group, p); if (!el) continue;
      const spec = bandSpecs.get(el), txt = bandText(el, p); if (!spec || !txt) continue;
      const lines = txt.split("\n");
      setAlpha(1); pdf.setTextColor(spec.col.r, spec.col.g, spec.col.b);
      const lh = spec.fs.size * 1.35;
      const contentW = W - padLeft - (parseFloat(bodyCs.paddingRight) || padLeft);
      lines.forEach((ln, li) => {
        const y = isHeader ? Math.max(spec.fs.size + 6, padTop - 14 - (lines.length - 1 - li) * lh) : H - padBot + 22 + li * lh;
        setFont(spec.fs.fam, spec.fs.bold, spec.fs.italic, spec.fs.size);
        const w = pdf.getTextWidth(ln);
        const x = spec.align === "center" ? padLeft + (contentW - w) / 2 : (spec.align === "right" || spec.align === "end") ? padLeft + contentW - w : padLeft;
        drawWord(ln, x, y, w, spec.fs.fam, spec.fs.bold, spec.fs.italic, spec.fs.size, 0);
      });
    }
    if (onProgress) onProgress(p + 1, nPages);
    await new Promise((r) => setTimeout(r, 0));
  }
  void esc; void bodyLeft;
  const blob = pdf.output("blob");
  if (asBlob) return blob;
  downloadBlob(blob, `${safeFileName(title)}.pdf`);
  return null;
}
