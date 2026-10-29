// Cálculos da régua do editor "Word" — port de wordcraft:
// crates/ui-egui/src/canvas.rs (ruler_marks, ruler_density, ruler_scale, dragged_margin,
// indent_marker_rects, ruler_x, ruler_d) e crates/ui-egui/src/ruler_tabs.rs (snap_tab,
// dropped_off, next_kind, draw_tab_glyph). Tudo em pontos (1 pt = 1/72 pol), igual ao Rust;
// o componente converte cm <-> pt com PT_PER_CM.

export const PT_PER_CM = 72 / 2.54;
export const SNAP_PT = 4.5;          // 1/16 pol: passo dos recuos e das margens
export const MIN_TEXT_PT = 72;       // menor largura de texto que um arrasto de margem deixa
export const MIN_INDENT_ROOM_PT = 18; // recuo esquerdo para a menos 18 pt do fim da coluna
export const DROP_OFF_PX = 18;       // distância além da régua em que uma tabulação arrastada é apagada

const UNIT_TICK = 7;
const RULER_LABEL_PX = 30;
const RULER_TICK_PX = 4;
const RULER_SPARSEST = 1 << 20;
const RULER_MAX_MARKS = 2000;

// Graduação: [pontos por passo numerado, divisões por passo, quanto cada passo vale]. O app usa cm.
export const RULER_SCALE_CM = [PT_PER_CM, 4, 1];

export const cmToPt = (cm) => cm * PT_PER_CM;
export const ptToCm = (pt) => pt / PT_PER_CM;

// Quão esparsa fica a régua conforme a página encolhe na tela (#1878).
export function rulerDensity(pxPerUnit, div) {
  const px = Number.isFinite(pxPerUnit) ? Math.max(0, pxPerUnit) : 0;
  const every = (p, room) => { let n = 1; while (p * n < room && n < RULER_SPARSEST) n *= 2; return n; };
  return { labelEvery: every(px, RULER_LABEL_PX), tickEvery: every(px / Math.max(1, div), RULER_TICK_PX) };
}

// As marcas da régua e a distância de cada uma até a borda inicial da página.
// Ticks da borda da página até `width`, na grade da margem inicial `origin`; números só na área de
// texto (as margens ganham só ticks). Retorna [{ d, label }] (número) ou [{ d, tick }] (comprimento).
export function rulerMarks(origin, text, width, [unit, divIn, step], scale) {
  const div = Math.max(2, divIn);
  const marks = [];
  if (![unit, origin, text, width, scale].every(Number.isFinite) || !(unit > 0)) return marks;
  const density = rulerDensity(scale * unit, div);
  const perLabel = div * density.labelEvery;
  const edge = -(Math.min(1e6, Math.max(-1e6, Math.ceil(origin / unit))) * div);
  let k = Math.floor(edge / density.tickEvery) * density.tickEvery;
  for (let i = 0; i < RULER_MAX_MARKS; i++) {
    const d = origin + (k * unit) / div;
    if (d > width + 1e-3) break;
    if (d >= -1e-3 && k !== 0) {
      const inText = k > 0 && d <= origin + text + 1e-3;
      if (k % perLabel === 0 && inText) marks.push({ d, label: (k / div) * step });
      else if (k % div === 0) marks.push({ d, tick: UNIT_TICK });
      else if (k % (div >> 1) === 0) marks.push({ d, tick: 5 });
      else if (div >= 8 && k % (div >> 2) === 0) marks.push({ d, tick: 3 });
      else marks.push({ d, tick: 1.5 });
    }
    k += density.tickEvery;
  }
  return marks;
}

// Posição na tela (pt) de um ponto a `d` pt da borda inicial; parágrafo da direita p/ esquerda espelha.
export const rulerX = (d, pageW, rtl) => (rtl ? pageW - d : d);
// O inverso de rulerX: distância da borda inicial sob a posição `x`.
export const rulerD = (x, pageW, rtl) => (rtl ? pageW - x : x);

// Contornos dos três marcadores de recuo na barra (altura `h`), cada um centrado no seu x:
// primeira linha (bandeira em cima), esquerdo e direito (embaixo). Em px.
export function indentMarkerRects(first, left, right, h) {
  return [
    { x0: first - 4.5, y0: 0, x1: first + 4.5, y1: 5 },
    { x0: left - 4.5, y0: h - 8, x1: left + 4.5, y1: h + 1 },
    { x0: right - 4.5, y0: h - 6, x1: right + 4.5, y1: h - 1 },
  ];
}

// Onde o glifo de uma tabulação fica na barra (para os números não passarem por cima).
export const tabGlyphRect = (x, h) => ({ x0: x - 4.5, y0: h - 1 - 7.5, x1: x + 4.5, y1: h - 1 + 0.5 });

export const rectsIntersect = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// Margem (pt) depois de arrastar a borda `edge` ("left" | "right") até `at` pt da borda esquerda da
// página: encaixa em 1/16 pol, nunca negativa e deixando ao menos 1 pol de texto.
export function draggedMargin(edge, at, { pageW, marginLeft, marginRight }) {
  const [raw, room, cur] = edge === "left"
    ? [at, pageW - marginRight - MIN_TEXT_PT, marginLeft]
    : [pageW - at, pageW - marginLeft - MIN_TEXT_PT, marginRight];
  if (!Number.isFinite(raw) || !Number.isFinite(room)) return cur;
  return Math.min(Math.max(Math.round(raw / SNAP_PT) * SNAP_PT, 0), Math.max(room, 0));
}

export const snapIndent = (pt) => Math.round(pt / SNAP_PT) * SNAP_PT;

// ---- tabulações ---------------------------------------------------------------
// Tipos que o seletor do canto alterna (o app não tem tabulação "barra").
export const TAB_KINDS = ["left", "center", "right", "decimal"];
export const TAB_KIND_LABEL = { left: "Esquerda", center: "Centralizada", right: "Direita", decimal: "Decimal" };

export function nextTabKind(k, back = false) {
  const n = TAB_KINDS.length;
  const i = Math.max(0, TAB_KINDS.indexOf(k));
  return TAB_KINDS[back ? (i + n - 1) % n : (i + 1) % n];
}

// Posição de uma parada: encaixada em `step` (a não ser que `free`, Alt), dentro da coluna.
export function snapTab(pt, step, width, free) {
  const v = Number.isFinite(pt) ? pt : 0;
  const snapped = free || !Number.isFinite(step) || step <= 0 ? v : Math.round(v / step) * step;
  return Math.min(Math.max(snapped, 0), Number.isFinite(width) ? Math.max(width, 0) : 0);
}

// O ponteiro (y) está longe o bastante da barra para tirar a parada?
export const droppedOff = (y, top, bottom) => y > bottom + DROP_OFF_PX || y < top - DROP_OFF_PX;

// Segmentos do glifo de uma parada em pé sobre `base` em `x` (coordenadas da barra, px).
// Devolve { lines: [[x1,y1,x2,y2]], dot: [cx,cy,r] | null }.
export function tabGlyph(x, base, kind, rtl = false) {
  const foot = rtl ? -4 : 4;
  const stem = (top) => [x, top, x, base];
  const along = (a, b) => [x + a, base, x + b, base];
  switch (kind) {
    case "left": return { lines: [stem(base - 5), along(0, foot)], dot: null };
    case "right": return { lines: [stem(base - 5), along(-foot, 0)], dot: null };
    case "center": return { lines: [stem(base - 5), along(-4, 4)], dot: null };
    case "decimal": return { lines: [stem(base - 5), along(-4, 4)], dot: [x + foot * 0.7, base - 3.5, 1.1] };
    default: return { lines: [], dot: null };
  }
}

// "2,5 cm" (vírgula decimal, até 2 casas).
export const formatCm = (cm) => `${String(Math.round(cm * 100) / 100).replace(".", ",")} cm`;
