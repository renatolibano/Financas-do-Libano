// Tinta direto na página do Word. Os traços ficam numa camada (.word-ink-layer) dentro do
// próprio corpo do documento — por isso são salvos, desfeitos/refeitos e impressos junto com
// o texto, sem precisar de campo novo no banco. Cada traço é um <path class="word-ink"> com
// os dados em atributos (cor, espessura em pt, ferramenta, ordem de desenho). Coordenadas em
// px, relativas ao corpo da página. O marca-texto fica atrás do texto; caneta e lápis, na frente.
import { recognise, arrowParts, pairParts, shapePaths, bbox } from "./wordInkShape";

const NS = "http://www.w3.org/2000/svg";
export const PT = 96 / 72;
export const MAX_POINTS = 4000;
export const MAX_PENS = 24;

export const INK_DEFAULTS = {
  pen: { color: "#000000", width: 1.5 },
  pencil: { color: "#595959", width: 1 },
  highlighter: { color: "#ffff00", width: 12 },
};
export const INK_ALPHA = { pen: 1, pencil: 0.85, highlighter: 0.5 };
export const INK_WIDTHS = { pen: [0.5, 1, 1.5, 2.5, 3.5, 5], pencil: [0.5, 1, 1.5, 2.5, 3.5, 5], highlighter: [4, 8, 12, 18, 24] };
export const INK_TOOLS = ["pen", "pencil", "highlighter"];

const r1 = (n) => Math.round(n * 10) / 10;

// ---- geometria do atributo d ----------------------------------------------------------
export function parseD(d) {
  const paths = [];
  let cur = null;
  const re = /([MLZ])|(-?\d*\.?\d+(?:e-?\d+)?)/gi;
  let m, nums = [], cmd = null;
  const flush = () => {
    if (cmd === "M" || cmd === "L") {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        if (cmd === "M" && i === 0) { cur = { pts: [], closed: false }; paths.push(cur); }
        cur?.pts.push([nums[i], nums[i + 1]]);
      }
    }
    nums = [];
  };
  while ((m = re.exec(d || ""))) {
    if (m[1]) {
      flush();
      cmd = m[1].toUpperCase();
      if (cmd === "Z" && cur) cur.closed = true;
    } else nums.push(parseFloat(m[2]));
  }
  flush();
  return paths;
}

export function buildD(paths) {
  return paths
    .filter((p) => p.pts.length)
    .map((p) => {
      const [f, ...rest] = p.pts;
      const one = p.pts.length === 1 ? ` L${r1(f[0] + 0.01)} ${r1(f[1])}` : "";
      return `M${r1(f[0])} ${r1(f[1])}${one}` + rest.map(([x, y]) => ` L${r1(x)} ${r1(y)}`).join("") + (p.closed ? " Z" : "");
    })
    .join(" ");
}

export const itemPaths = (el) => parseD(el.getAttribute("d"));
export const itemPoints = (el) => itemPaths(el).flatMap((p) => p.pts);
export const itemTool = (el) => el.dataset.tool || "pen";
export const itemWidthPx = (el) => (parseFloat(el.dataset.width) || 1) * PT;

export function itemBounds(el) {
  const [x, y, w, h] = bbox(itemPoints(el));
  const pad = itemWidthPx(el) / 2;
  return { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 };
}

export function unionBounds(items) {
  if (!items.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const el of items) {
    const b = itemBounds(el);
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---- camada ------------------------------------------------------------------------------
export function getLayer(body, create = false) {
  if (!body) return null;
  let layer = body.querySelector(":scope > .word-ink-layer");
  if (layer || !create) return layer;
  layer = document.createElement("div");
  layer.className = "word-ink-layer";
  layer.setAttribute("contenteditable", "false");
  layer.setAttribute("aria-hidden", "true");
  layer.dataset.next = "1";
  for (const cls of ["word-ink-back", "word-ink-front"]) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "word-ink-svg " + cls);
    svg.setAttribute("xmlns", NS);
    layer.appendChild(svg);
  }
  const empty = !Array.from(body.childNodes).some((n) => (n.nodeType === 3 ? n.textContent.trim() : !n.classList?.contains("word-page-meta")));
  body.insertBefore(layer, body.firstChild);
  if (empty) { const line = document.createElement("div"); line.innerHTML = "<br>"; body.appendChild(line); } // página só com tinta: mantém uma linha pra digitar
  return layer;
}

export function inkItems(body) {
  const layer = getLayer(body);
  if (!layer) return [];
  return Array.from(layer.querySelectorAll(".word-ink")).sort((a, b) => (+a.dataset.order || 0) - (+b.dataset.order || 0));
}

function paint(el, tool, color, widthPt) {
  el.dataset.tool = tool;
  el.dataset.color = color;
  el.dataset.width = String(widthPt);
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", color);
  el.setAttribute("stroke-width", r1(widthPt * PT));
  el.setAttribute("stroke-opacity", String(INK_ALPHA[tool] ?? 1));
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
}

export function addItem(body, { tool, color, width, paths, kind }) {
  const layer = getLayer(body, true);
  const order = parseInt(layer.dataset.next || "1", 10);
  layer.dataset.next = String(order + 1);
  const el = document.createElementNS(NS, "path");
  el.setAttribute("class", "word-ink");
  el.dataset.id = "k" + order;
  el.dataset.order = String(order);
  if (kind) el.dataset.kind = kind;
  paint(el, tool, color, width);
  el.setAttribute("d", buildD(paths));
  layer.querySelector(tool === "highlighter" ? ".word-ink-back" : ".word-ink-front").appendChild(el);
  return el;
}

export const removeItems = (items) => items.forEach((el) => el.remove());

export function moveItems(items, dx, dy) {
  for (const el of items) {
    const paths = itemPaths(el).map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [x + dx, y + dy]) }));
    el.setAttribute("d", buildD(paths));
  }
}

export function recolorItems(items, color) {
  for (const el of items) {
    el.dataset.color = color;
    el.setAttribute("stroke", color);
  }
}

// ---- coordenadas -------------------------------------------------------------------------
// Ponto do ponteiro em px da página (o corpo pode estar com zoom CSS: a escala sai da razão
// entre o tamanho na tela e o tamanho de layout).
export function bodyScale(body) {
  const r = body.getBoundingClientRect();
  return body.offsetWidth ? r.width / body.offsetWidth || 1 : 1;
}
export function clientToBody(body, cx, cy) {
  const r = body.getBoundingClientRect();
  const s = bodyScale(body);
  return [(cx - r.left) / s, (cy - r.top) / s];
}

// ---- acertos -------------------------------------------------------------------------------
function segDist(a, b, p) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}

export function hitItem(el, x, y, slop = 3) {
  const tol = itemWidthPx(el) / 2 + slop;
  for (const { pts, closed } of itemPaths(el)) {
    if (pts.length === 1) { if (Math.hypot(pts[0][0] - x, pts[0][1] - y) <= tol) return true; continue; }
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) if (segDist(pts[i], pts[(i + 1) % pts.length], [x, y]) <= tol) return true;
  }
  return false;
}

export function topItemAt(body, x, y, slop) {
  const items = inkItems(body);
  for (let i = items.length - 1; i >= 0; i--) if (hitItem(items[i], x, y, slop)) return items[i];
  return null;
}

function insidePoly(poly, x, y) {
  let odd = false;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + n - 1) % n];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) odd = !odd;
  }
  return odd;
}

// Laço: seleciona o traço quando a maior parte dos pontos (60%) está dentro da volta.
export function lassoSelect(body, poly) {
  if (poly.length < 3) return [];
  return inkItems(body).filter((el) => {
    const pts = itemPoints(el);
    const step = Math.max(1, Math.ceil(pts.length / 64));
    let n = 0, hits = 0;
    for (let i = 0; i < pts.length; i += step) { n++; if (insidePoly(poly, pts[i][0], pts[i][1])) hits++; }
    return n > 0 && hits * 10 >= n * 6;
  });
}

// ---- Tinta para Forma ---------------------------------------------------------------------
const isPenInk = (el) => itemTool(el) !== "highlighter";

function setShape(el, shape) {
  el.setAttribute("d", buildD(shapePaths(shape)));
  el.dataset.kind = shape.kind;
}

function pieceOf(el) {
  if (!isPenInk(el)) return null;
  const kind = el.dataset.kind;
  const paths = itemPaths(el);
  if (paths.length !== 1) return null;
  const { pts, closed } = paths[0];
  if (kind && !((kind === "line" && pts.length === 2 && !closed) || (kind === "polygon" && pts.length === 3 && closed))) return null;
  const pp = closed && pts[0] ? [...pts, pts[0]] : pts;
  return { el, rect: itemBounds(el), parts: arrowParts(pp), order: +el.dataset.order || 0 };
}

function near(a, b) {
  const m = Math.max(24, 0.2 * Math.max(a.w, a.h, b.w, b.h));
  return a.x - m <= b.x + b.w && b.x - m <= a.x + a.w && a.y - m <= b.y + b.h && b.y - m <= a.y + a.h;
}

function convertOne(el) {
  if (!isPenInk(el) || el.dataset.kind) return null;
  const paths = itemPaths(el);
  if (paths.length !== 1) return null;
  const found = recognise(paths[0].pts);
  if (!found) return null;
  setShape(el, found);
  return found.kind;
}

// Converte os traços dados em formas (pares linha + ponta viram uma seta). Devolve os
// elementos que ficaram (as pontas somem dentro da seta) e quantos foram convertidos.
export function convertItems(items) {
  const pieces = items.map(pieceOf).filter(Boolean);
  const used = new Set(), gone = new Set();
  let count = 0;
  for (const line of pieces.filter((k) => k.parts.line)) {
    for (const head of pieces.filter((k) => k.parts.heads.length)) {
      if (line.el === head.el || used.has(line.el) || used.has(head.el) || !near(line.rect, head.rect)) continue;
      const arrow = pairParts(line.parts, head.parts);
      if (arrow) { setShape(line.el, arrow); used.add(line.el); used.add(head.el); gone.add(head.el); count++; }
    }
  }
  for (const el of items) if (!used.has(el) && convertOne(el)) count++;
  gone.forEach((el) => el.remove());
  return { count, items: items.filter((el) => !gone.has(el)) };
}

// Tinta para Forma ligada: o traço acabado de desenhar vira forma (ou fecha uma seta com um
// traço vizinho).
export function convertNew(body, el) {
  const me = pieceOf(el);
  if (me) {
    const others = inkItems(body).filter((o) => o !== el).map(pieceOf).filter((k) => k && near(me.rect, k.rect)).sort((a, b) => b.order - a.order);
    for (const other of others) {
      for (const [line, head] of [[other, me], [me, other]]) {
        const arrow = pairParts(line.parts, head.parts);
        if (arrow) { setShape(line.el, arrow); head.el.remove(); return line.el; }
      }
    }
  }
  convertOne(el);
  return el;
}

// ---- rasterização (Tinta para Equação / Texto) ----------------------------------------------
export function rasterizeItems(items, { maxSide = 1400 } = {}) {
  const list = items.filter(isPenInk);
  const b = unionBounds(list);
  if (!b) return Promise.resolve(null);
  const pad = 14;
  const vw = b.w + pad * 2, vh = b.h + pad * 2;
  const k = Math.min(maxSide / Math.max(vw, vh), 3);
  const body = list.map((el) => `<path d="${el.getAttribute("d")}" fill="none" stroke="#000" stroke-width="${el.getAttribute("stroke-width")}" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  const svg = `<svg xmlns="${NS}" width="${Math.round(vw * k)}" height="${Math.round(vh * k)}" viewBox="${r1(b.x - pad)} ${r1(b.y - pad)} ${r1(vw)} ${r1(vh)}">${body}</svg>`;
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas");
      c.width = Math.round(vw * k); c.height = Math.round(vh * k);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(im, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/png"));
    };
    im.onerror = reject;
    im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}
