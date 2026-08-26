import { jsPDF } from "jspdf";

// ---------------------------------------------------------------------------
// Todas as coordenadas de anotação são guardadas em "unidades de página":
// o sistema de coordenadas do PDF na escala 1 (page.getViewport({scale:1})).
// Isso mantém a anotação nítida e no lugar certo em qualquer zoom, porque o
// <svg> que desenha por cima usa viewBox nessas mesmas unidades.
// ---------------------------------------------------------------------------

// Suaviza a linha central do traço com uma média móvel simples (kernel
// 1-2-1) antes de calcular o contorno. Reduz o tremido natural da captura
// do ponteiro sem afastar a curva dos pontos originais (usado só pra
// desenhar; os pontos crus continuam intactos para apagar/selecionar).
function smoothCenterline(points, passes = 2) {
  let pts = points;
  for (let pass = 0; pass < passes; pass++) {
    if (pts.length < 3) break;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
      out.push({ x: (p0.x + 2 * p1.x + p2.x) / 4, y: (p0.y + 2 * p1.y + p2.y) / 4, p: p1.p });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

// Converte os pontos de um traço à mão livre (com pressão opcional em cada
// ponto) em uma lista de pontos do contorno preenchido (uma "fita" de
// largura variável, mais fina onde a pressão foi menor).
export function getStrokeOutlinePoints(points, baseWidth, { uniform = false } = {}) {
  if (!points || points.length === 0) return [];
  if (points.length === 1) {
    const p = points[0];
    const r = (baseWidth * (uniform ? 0.75 : 0.55 + (p.p ?? 0.5) * 0.9)) / 2;
    const steps = 12;
    const circle = [];
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      circle.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r });
    }
    return circle;
  }
  const smoothed = smoothCenterline(points);
  const left = [];
  const right = [];
  for (let i = 0; i < smoothed.length; i++) {
    const p = smoothed[i];
    const prev = smoothed[i - 1] || p;
    const next = smoothed[i + 1] || p;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w = (baseWidth * (uniform ? 0.75 : 0.55 + (p.p ?? 0.5) * 0.9)) / 2;
    left.push({ x: p.x + nx * w, y: p.y + ny * w });
    right.push({ x: p.x - nx * w, y: p.y - ny * w });
  }
  return [...left, ...right.reverse()];
}

// Monta o "d" do <path> conectando os pontos do contorno com curvas de
// Bézier quadráticas (técnica clássica: cada ponto vira o controle de uma
// curva até o meio do próximo ponto) em vez de linhas retas — é isso que
// tira o aspecto "quadradão" e deixa o traço fluido, como numa lousa digital.
function smoothClosedOutlinePath(pts) {
  const n = pts.length;
  if (n < 3) return "M" + pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" L") + " Z";
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(pts[n - 1], pts[0]);
  let d = `M ${start.x.toFixed(2)},${start.y.toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const m = mid(cur, next);
    d += ` Q ${cur.x.toFixed(2)},${cur.y.toFixed(2)} ${m.x.toFixed(2)},${m.y.toFixed(2)}`;
  }
  return d + " Z";
}

export function strokeOutlinePath(points, baseWidth, opts) {
  const pts = getStrokeOutlinePoints(points, baseWidth, opts);
  if (!pts.length) return "";
  return smoothClosedOutlinePath(pts);
}

// ---------------------------------------------------------------------------
// Geometria auxiliar
// ---------------------------------------------------------------------------

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

// "Desenhar -> corrigir forma automaticamente": olha pro traço recém-feito e,
// se ele parecer claramente uma linha reta ou um círculo, devolve a forma
// perfeita equivalente (ou null se não reconhecer nada e o traço continua
// sendo uma anotação à mão livre normal).
export function detectShapeFromPoints(points) {
  if (!points || points.length < 6) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX, h = maxY - minY;
  const diag = Math.hypot(w, h);
  if (diag < 8) return null;

  const a = points[0], b = points[points.length - 1];
  const closed = Math.hypot(b.x - a.x, b.y - a.y) < Math.max(w, h) * 0.22;

  // Linha reta: pouca gente desenha uma reta perfeita à mão.
  const lineLen = Math.hypot(b.x - a.x, b.y - a.y);
  if (!closed && lineLen > 10) {
    let maxDev = 0;
    for (const p of points) maxDev = Math.max(maxDev, distToSegment(p, a, b));
    if (maxDev < Math.max(4, lineLen * 0.045)) {
      return { type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
  }

  // Círculo: traço fechado com raio quase constante em torno do centro.
  if (closed && w > 12 && h > 12) {
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const radii = points.map((p) => Math.hypot(p.x - cx, p.y - cy));
    const avgR = radii.reduce((s, r) => s + r, 0) / radii.length;
    const variance = radii.reduce((s, r) => s + Math.abs(r - avgR), 0) / radii.length;
    const aspect = Math.max(w, h) / Math.min(w, h);
    if (avgR > 0 && variance / avgR < 0.22 && aspect < 1.35) {
      return { type: "circle", cx, cy, r: avgR, x1: cx - avgR, y1: cy - avgR, x2: cx + avgR, y2: cy + avgR };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Formas 3D (cubo, pirâmide, cilindro, cone, esfera): a pessoa desenha
// arrastando uma caixa delimitadora (igual ao retângulo/círculo — x1,y1 é o
// ponto onde tocou, x2,y2 é onde soltou) e essa função devolve a geometria
// (segmentos de reta e elipses/arcos) do "wireframe" que representa o sólido
// dentro dessa caixa. Arestas que ficariam escondidas atrás do sólido vêm
// marcadas com dashed:true, para desenhar tracejado — igual ao desenho de
// referência (cubo/cilindro/pirâmide/esfera em linha). Compartilhada entre a
// prévia em SVG (tela, em AnnotationShape no main.jsx) e o desenho em canvas
// (exportação/download, em drawAnnotationOnCanvas logo abaixo).
// ---------------------------------------------------------------------------
export function shape3DGeometry(shape, x1, y1, x2, y2) {
  const x = Math.min(x1, x2), y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1) || 1, h = Math.abs(y2 - y1) || 1;

  if (shape === "cube") {
    // Caixa vista de frente, com um deslocamento diagonal (d) simulando a
    // profundidade. Face da frente inteira visível (sólida); face de cima e
    // face da direita parcialmente visíveis (sólidas); as 3 arestas que
    // encontram o "canto de trás, embaixo, à esquerda" ficam escondidas.
    const d = Math.min(w, h) * 0.35;
    const fw = w - d, fh = h - d;
    const A = { x, y: y + h };
    const B = { x: x + fw, y: y + h };
    const C = { x: x + fw, y: y + h - fh };
    const D = { x, y: y + h - fh };
    const A2 = { x: x + d, y: y + h - d };
    const B2 = { x: x + fw + d, y: y + h - d };
    const C2 = { x: x + fw + d, y: y + h - fh - d };
    const D2 = { x: x + d, y: y + h - fh - d };
    return {
      lines: [
        { p1: A, p2: B }, { p1: B, p2: C }, { p1: C, p2: D }, { p1: D, p2: A },
        { p1: D, p2: D2 }, { p1: D2, p2: C2 }, { p1: C2, p2: C },
        { p1: B, p2: B2 }, { p1: B2, p2: C2 },
        { p1: A, p2: A2, dashed: true }, { p1: A2, p2: B2, dashed: true }, { p1: A2, p2: D2, dashed: true },
      ],
    };
  }
  if (shape === "pyramid") {
    // Base em losango (quadrado visto em perspectiva) + ápice no topo.
    // As duas arestas da base mais próximas da pessoa e as 3 arestas do
    // ápice até elas ficam sólidas; o canto de trás da base e a aresta do
    // ápice até ele ficam tracejados.
    const apex = { x: x + w / 2, y };
    const L = { x, y: y + h * 0.65 };
    const R = { x: x + w, y: y + h * 0.65 };
    const F = { x: x + w / 2, y: y + h };
    const K = { x: x + w / 2, y: y + h * 0.42 };
    return {
      lines: [
        { p1: L, p2: F }, { p1: F, p2: R },
        { p1: R, p2: K, dashed: true }, { p1: K, p2: L, dashed: true },
        { p1: apex, p2: L }, { p1: apex, p2: R }, { p1: apex, p2: F },
        { p1: apex, p2: K, dashed: true },
      ],
    };
  }
  if (shape === "cylinder") {
    const rx = w / 2, ry = Math.max(3, h * 0.14);
    const cx = x + w / 2;
    const cyTop = y + ry, cyBottom = y + h - ry;
    return {
      lines: [
        { p1: { x, y: cyTop }, p2: { x, y: cyBottom } },
        { p1: { x: x + w, y: cyTop }, p2: { x: x + w, y: cyBottom } },
      ],
      ellipses: [{ cx, cy: cyTop, rx, ry }], // tampa de cima: elipse inteira, visível
      arcs: [
        { cx, cy: cyBottom, rx, ry, from: 0, to: Math.PI }, // frente da base: sólido
        { cx, cy: cyBottom, rx, ry, from: Math.PI, to: Math.PI * 2, dashed: true }, // fundo da base: escondido
      ],
    };
  }
  if (shape === "cone") {
    const rx = w / 2, ry = Math.max(3, h * 0.14);
    const cx = x + w / 2, cy = y + h - ry;
    const apex = { x: cx, y };
    return {
      lines: [
        { p1: apex, p2: { x: cx - rx, y: cy } },
        { p1: apex, p2: { x: cx + rx, y: cy } },
      ],
      arcs: [
        { cx, cy, rx, ry, from: 0, to: Math.PI },
        { cx, cy, rx, ry, from: Math.PI, to: Math.PI * 2, dashed: true },
      ],
    };
  }
  if (shape === "sphere") {
    // Contorno + "linhas de latitude/longitude" pra dar a leitura de esfera
    // (igual ao desenho de referência), tudo sólido — não há aresta escondida
    // numa esfera desenhada assim.
    const r = Math.min(w, h) / 2;
    const cx = x + w / 2, cy = y + h / 2;
    return {
      circles: [{ cx, cy, r }],
      ellipses: [
        { cx, cy, rx: r, ry: r * 0.32 },
        { cx, cy, rx: r * 0.32, ry: r },
      ],
    };
  }
  return { lines: [] };
}

const SHAPE_3D_TYPES = new Set(["cube", "pyramid", "cylinder", "cone", "sphere"]);

// ---------------------------------------------------------------------------
// Hit-testing / seleção / borracha de objeto
// ---------------------------------------------------------------------------

export function hitTestAnnotation(ann, x, y, tol = 6) {
  if (ann.type === "image") {
    return x >= ann.x - tol && x <= ann.x + ann.width + tol && y >= ann.y - tol && y <= ann.y + ann.height + tol;
  }
  if (ann.type === "text") {
    const w = ann.width ?? Math.max(30, (ann.content?.length || 4) * ann.fontSize * 0.55);
    const h = ann.height ?? ann.fontSize * 1.3;
    return x >= ann.x - tol && x <= ann.x + w + tol && y >= ann.y - tol && y <= ann.y + h + tol;
  }
  if (ann.type === "shape") {
    if (ann.shape === "rect" || SHAPE_3D_TYPES.has(ann.shape)) {
      // Formas 3D usam a mesma caixa delimitadora do retângulo pra seleção,
      // arrastar e redimensionar — mais fácil de tocar do que testar cada
      // aresta/elipse do desenho individualmente.
      const bx = Math.min(ann.x1, ann.x2) - tol;
      const by = Math.min(ann.y1, ann.y2) - tol;
      const bw = Math.abs(ann.x2 - ann.x1) + tol * 2;
      const bh = Math.abs(ann.y2 - ann.y1) + tol * 2;
      return x >= bx && x <= bx + bw && y >= by && y <= by + bh;
    }
    if (ann.shape === "circle") {
      const cx = ann.cx ?? (ann.x1 + ann.x2) / 2;
      const cy = ann.cy ?? (ann.y1 + ann.y2) / 2;
      const r = ann.r ?? Math.max(Math.abs(ann.x2 - ann.x1), Math.abs(ann.y2 - ann.y1)) / 2;
      return Math.hypot(x - cx, y - cy) <= r + tol;
    }
    return distToSegment({ x, y }, { x: ann.x1, y: ann.y1 }, { x: ann.x2, y: ann.y2 }) <= tol + (ann.width || 2);
  }
  if (ann.type === "stroke") {
    const pts = ann.points || [];
    if (pts.length === 1) return Math.hypot(x - pts[0].x, y - pts[0].y) <= tol + (ann.width || 2);
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment({ x, y }, pts[i], pts[i + 1]) <= tol + (ann.width || 2)) return true;
    }
    return false;
  }
  return false;
}

export function findAnnotationAt(list, x, y, tol = 6) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (hitTestAnnotation(list[i], x, y, tol)) return list[i];
  }
  return null;
}

export function annotationBBox(ann) {
  if (ann.type === "image") return { x: ann.x, y: ann.y, w: ann.width, h: ann.height };
  if (ann.type === "text") {
    const w = ann.width ?? Math.max(30, (ann.content?.length || 4) * ann.fontSize * 0.55);
    const h = ann.height ?? ann.fontSize * 1.3;
    return { x: ann.x, y: ann.y, w, h };
  }
  if (ann.type === "shape") {
    if (ann.shape === "circle") {
      const cx = ann.cx ?? (ann.x1 + ann.x2) / 2;
      const cy = ann.cy ?? (ann.y1 + ann.y2) / 2;
      const r = ann.r ?? Math.max(Math.abs(ann.x2 - ann.x1), Math.abs(ann.y2 - ann.y1)) / 2;
      return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
    }
    const x = Math.min(ann.x1, ann.x2), y = Math.min(ann.y1, ann.y2);
    return { x, y, w: Math.abs(ann.x2 - ann.x1) || 4, h: Math.abs(ann.y2 - ann.y1) || 4 };
  }
  if (ann.type === "stroke") {
    const pts = ann.points || [{ x: 0, y: 0 }];
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x || 4, h: Math.max(...ys) - y || 4 };
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

export function translateAnnotation(ann, dx, dy) {
  if (ann.type === "image") return { ...ann, x: ann.x + dx, y: ann.y + dy };
  if (ann.type === "text") return { ...ann, x: ann.x + dx, y: ann.y + dy };
  if (ann.type === "shape") {
    const next = { ...ann, x1: ann.x1 + dx, y1: ann.y1 + dy, x2: ann.x2 + dx, y2: ann.y2 + dy };
    if (ann.cx != null) { next.cx = ann.cx + dx; next.cy = ann.cy + dy; }
    return next;
  }
  if (ann.type === "stroke") return { ...ann, points: ann.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) };
  return ann;
}

// Redimensiona uma forma (ou a caixa de um texto) arrastando o "cantinho".
export function resizeShapeAnnotation(ann, x, y) {
  if (ann.type === "image") {
    // Mantém a proporção original da imagem ao redimensionar pelo cantinho.
    const w = Math.max(24, x - ann.x);
    const ratio = ann.height / ann.width || 1;
    return { ...ann, width: w, height: w * ratio };
  }
  if (ann.type === "text") {
    const minW = 60, minH = Math.max(24, ann.fontSize * 1.3);
    return { ...ann, width: Math.max(minW, x - ann.x), height: Math.max(minH, y - ann.y) };
  }
  if (ann.type === "stroke") {
    // Escala todos os pontos do traço a partir do canto oposto (fixo),
    // igual ao comportamento de imagem: o canto superior-esquerdo da caixa
    // delimitadora fica parado e o traço todo acompanha proporcionalmente
    // o cantinho arrastado. A espessura da caneta/marca-texto NÃO muda —
    // fica sempre a mesma, esticando ou encolhendo só o traço em si.
    const box = annotationBBox(ann);
    const newW = Math.max(6, x - box.x);
    const newH = Math.max(6, y - box.y);
    const scaleX = newW / (box.w || newW || 1);
    const scaleY = newH / (box.h || newH || 1);
    const points = (ann.points || []).map((p) => ({
      ...p,
      x: box.x + (p.x - box.x) * scaleX,
      y: box.y + (p.y - box.y) * scaleY,
    }));
    return { ...ann, points };
  }
  if (ann.type !== "shape") return ann;
  const next = { ...ann, x2: x, y2: y };
  if (ann.cx != null) {
    next.cx = (ann.x1 + x) / 2;
    next.cy = (ann.y1 + y) / 2;
    next.r = Math.max(Math.abs(x - ann.x1), Math.abs(y - ann.y1)) / 2;
  }
  return next;
}

// Escala um elemento (de qualquer tipo) a partir de um ponto-âncora fixo —
// usado no redimensionamento de um GRUPO selecionado pelo laço: todo mundo
// escala junto mantendo as posições relativas, com o canto superior-esquerdo
// da seleção (a âncora) parado no lugar, igual a puxar o cantinho de uma
// caixa que envolve tudo.
export function scaleAnnotationFromAnchor(ann, anchor, scaleX, scaleY) {
  if (ann.type === "image") {
    return {
      ...ann,
      x: anchor.x + (ann.x - anchor.x) * scaleX,
      y: anchor.y + (ann.y - anchor.y) * scaleY,
      width: Math.max(6, ann.width * scaleX),
      height: Math.max(6, ann.height * scaleY),
    };
  }
  if (ann.type === "text") {
    const box = annotationBBox(ann);
    return {
      ...ann,
      x: anchor.x + (ann.x - anchor.x) * scaleX,
      y: anchor.y + (ann.y - anchor.y) * scaleY,
      width: Math.max(30, box.w * scaleX),
      height: Math.max(18, box.h * scaleY),
    };
  }
  if (ann.type === "shape") {
    // A espessura da linha (width) não muda — só a geometria (posição/tamanho).
    const next = {
      ...ann,
      x1: anchor.x + (ann.x1 - anchor.x) * scaleX,
      y1: anchor.y + (ann.y1 - anchor.y) * scaleY,
      x2: anchor.x + (ann.x2 - anchor.x) * scaleX,
      y2: anchor.y + (ann.y2 - anchor.y) * scaleY,
    };
    if (ann.cx != null) {
      next.cx = anchor.x + (ann.cx - anchor.x) * scaleX;
      next.cy = anchor.y + (ann.cy - anchor.y) * scaleY;
      next.r = Math.max(2, ann.r * ((scaleX + scaleY) / 2));
    }
    return next;
  }
  if (ann.type === "stroke") {
    // Espessura da caneta/marca-texto fica igual — só os pontos escalam.
    return {
      ...ann,
      points: (ann.points || []).map((p) => ({
        ...p,
        x: anchor.x + (p.x - anchor.x) * scaleX,
        y: anchor.y + (p.y - anchor.y) * scaleY,
      })),
    };
  }
  return ann;
}

// Borracha parcial: remove os pontos de um traço que caíram dentro do raio
// da borracha, quebrando o traço em pedaços menores (como apagar no papel).
// Para formas e textos, a borracha parcial se comporta como objeto (some
// inteiro) por não fazer sentido "recortar" um retângulo/círculo.
export function eraseAnnotationAtPoint(ann, x, y, radius) {
  // Imagens nunca somem com a borracha (só apagando o objeto inteiro, à mão,
  // pela seleção) — assim rabiscar/apagar por cima de um print não o remove junto.
  if (ann.type === "image") return [ann];
  if (ann.type === "text" || ann.type === "shape") {
    return hitTestAnnotation(ann, x, y, radius) ? [] : [ann];
  }
  if (ann.type === "stroke") {
    const pts = ann.points || [];
    const runs = [];
    let current = [];
    for (const p of pts) {
      if (Math.hypot(p.x - x, p.y - y) <= radius) {
        if (current.length >= 2) runs.push(current);
        current = [];
      } else {
        current.push(p);
      }
    }
    if (current.length >= 2) runs.push(current);
    if (runs.length === 0) return [];
    return runs.map((rp, i) => (i === 0 ? { ...ann, points: rp } : { ...ann, id: `${ann.id}-${i}-${Date.now()}`, points: rp }));
  }
  return [ann];
}

// ---------------------------------------------------------------------------
// Exportação: gera um novo PDF (o original nunca é alterado) com as
// anotações "queimadas" nas páginas, renderizando cada página num canvas.
// ---------------------------------------------------------------------------

// Carrega uma dataURL num <img> e devolve uma Promise — usado só na
// exportação (o desenho na tela usa <image> do SVG, que não precisa disso).
function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function drawAnnotationOnCanvas(ctx, ann) {
  ctx.save();
  if (ann.type === "image") {
    try {
      const img = await loadImageEl(ann.dataUrl || ann.src);
      ctx.globalAlpha = ann.opacity ?? 1;
      ctx.drawImage(img, ann.x, ann.y, ann.width, ann.height);
    } catch (e) {
      // imagem corrompida/indisponível: não trava a exportação do resto da página
    }
    ctx.restore();
    return;
  }
  if (ann.type === "stroke") {
    const uniform = ann.style === "marker" || ann.tool === "highlighter";
    const pts = getStrokeOutlinePoints(ann.points, ann.width, { uniform });
    if (pts.length) {
      ctx.globalAlpha = ann.opacity ?? 1;
      if (ann.tool === "highlighter") ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = ann.color;
      ctx.beginPath();
      // Mesma curva suave (Bézier quadrática ponto-a-ponto) usada na tela,
      // pra o PDF exportado sair com o traço igualzinho ao que foi desenhado.
      if (pts.length < 3) {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      } else {
        const n = pts.length;
        const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        const start = mid(pts[n - 1], pts[0]);
        ctx.moveTo(start.x, start.y);
        for (let i = 0; i < n; i++) {
          const cur = pts[i];
          const next = pts[(i + 1) % n];
          const m = mid(cur, next);
          ctx.quadraticCurveTo(cur.x, cur.y, m.x, m.y);
        }
      }
      ctx.closePath();
      ctx.fill();
    }
  } else if (ann.type === "shape") {
    ctx.globalAlpha = ann.opacity ?? 1;
    ctx.strokeStyle = ann.color;
    ctx.fillStyle = ann.color;
    ctx.lineWidth = ann.width || 2;
    ctx.lineCap = "round";
    if (ann.shape === "line" || ann.shape === "arrow") {
      ctx.beginPath();
      ctx.moveTo(ann.x1, ann.y1);
      ctx.lineTo(ann.x2, ann.y2);
      ctx.stroke();
      if (ann.shape === "arrow") {
        const angle = Math.atan2(ann.y2 - ann.y1, ann.x2 - ann.x1);
        const headLen = Math.max(8, (ann.width || 2) * 3);
        ctx.beginPath();
        ctx.moveTo(ann.x2, ann.y2);
        ctx.lineTo(ann.x2 - headLen * Math.cos(angle - Math.PI / 7), ann.y2 - headLen * Math.sin(angle - Math.PI / 7));
        ctx.lineTo(ann.x2 - headLen * Math.cos(angle + Math.PI / 7), ann.y2 - headLen * Math.sin(angle + Math.PI / 7));
        ctx.closePath();
        ctx.fill();
      }
    } else if (ann.shape === "rect") {
      const x = Math.min(ann.x1, ann.x2), y = Math.min(ann.y1, ann.y2);
      ctx.strokeRect(x, y, Math.abs(ann.x2 - ann.x1), Math.abs(ann.y2 - ann.y1));
    } else if (ann.shape === "circle") {
      const cx = ann.cx ?? (ann.x1 + ann.x2) / 2;
      const cy = ann.cy ?? (ann.y1 + ann.y2) / 2;
      const rx = ann.r ?? Math.abs(ann.x2 - ann.x1) / 2;
      const ry = ann.r ?? Math.abs(ann.y2 - ann.y1) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (SHAPE_3D_TYPES.has(ann.shape)) {
      const geo = shape3DGeometry(ann.shape, ann.x1, ann.y1, ann.x2, ann.y2);
      const dash = [Math.max(2, (ann.width || 2) * 1.5), Math.max(2, (ann.width || 2) * 1.5)];
      (geo.lines || []).forEach((seg) => {
        ctx.beginPath();
        ctx.setLineDash(seg.dashed ? dash : []);
        ctx.moveTo(seg.p1.x, seg.p1.y);
        ctx.lineTo(seg.p2.x, seg.p2.y);
        ctx.stroke();
      });
      (geo.circles || []).forEach((c) => {
        ctx.beginPath();
        ctx.setLineDash([]);
        ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
        ctx.stroke();
      });
      (geo.ellipses || []).forEach((e) => {
        ctx.beginPath();
        ctx.setLineDash([]);
        ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
      (geo.arcs || []).forEach((a) => {
        ctx.beginPath();
        ctx.setLineDash(a.dashed ? dash : []);
        ctx.ellipse(a.cx, a.cy, a.rx, a.ry, 0, a.from, a.to);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }
  } else if (ann.type === "text") {
    ctx.globalAlpha = 1;
    ctx.fillStyle = ann.color;
    ctx.font = `${ann.fontSize}px sans-serif`;
    ctx.textBaseline = "top";
    (ann.content || "").split("\n").forEach((line, i) => {
      ctx.fillText(line, ann.x, ann.y + i * ann.fontSize * 1.25);
    });
  }
  ctx.restore();
}

const safeFileName = (title) =>
  (title || "documento").trim().replace(/[^\p{L}\p{N}\-_ ]+/gu, "").replace(/\s+/g, "_").slice(0, 60) || "documento";

// pdfjsDoc: documento já aberto via pdfjsLib.getDocument(...).promise
// drawings: { [pagina]: Annotation[] }
export async function exportAnnotatedPdf(pdfjsDoc, drawings, title) {
  const numPages = pdfjsDoc.numPages;
  const exportScale = 2; // resolução boa pra impressão/zoom sem pesar demais o arquivo
  let doc = null;

  for (let n = 1; n <= numPages; n++) {
    const page = await pdfjsDoc.getPage(n);
    const baseViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: exportScale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    const pageAnns = drawings?.[n] || drawings?.[String(n)] || [];
    if (pageAnns.length) {
      ctx.save();
      ctx.scale(exportScale, exportScale); // desenha em unidades de página (escala 1), igual à tela
      for (const ann of pageAnns) await drawAnnotationOnCanvas(ctx, ann);
      ctx.restore();
    }

    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const pw = baseViewport.width, ph = baseViewport.height;
    const orientation = pw > ph ? "landscape" : "portrait";
    if (!doc) {
      doc = new jsPDF({ unit: "pt", format: [pw, ph], orientation });
    } else {
      doc.addPage([pw, ph], orientation);
    }
    doc.addImage(imgData, "JPEG", 0, 0, pw, ph);
  }

  doc.save(`${safeFileName(title)}_anotado.pdf`);
}
