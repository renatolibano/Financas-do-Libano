// Reconhecedor geométrico de "Tinta para Forma" (port do ink_shape.rs do wordcraft).
// Diz se um traço à mão é uma linha, seta, retângulo/quadrado, elipse/círculo ou
// polígono de até 8 cantos. Qualquer outra coisa (rabisco, curva, letra) continua tinta.
// Formas devolvidas (pontos em px da página):
//   { kind: "line", a, b } | { kind: "arrow", a, b } | { kind: "rect", x, y, w, h }
//   { kind: "ellipse", x, y, w, h } | { kind: "polygon", pts }

const MAX_POINTS = 4000;
const MIN_SIZE = 6;
const MAX_CORNERS = 8;
const BARB_LEN = [0.05, 0.5];
const BARB_ANGLE = [15, 75];
const PAIR_REACH = 0.12;

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const deg = (r) => (r * 180) / Math.PI;

function segDistance(a, b, p) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return dist([a[0] + t * dx, a[1] + t * dy], p);
}

function polygonDistance(c, p) {
  let m = Infinity;
  for (let i = 0; i < c.length; i++) m = Math.min(m, segDistance(c[i], c[(i + 1) % c.length], p));
  return m;
}

export function bbox(pts) {
  if (!pts.length) return [0, 0, 0, 0];
  let x0 = pts[0][0], y0 = pts[0][1], x1 = x0, y1 = y0;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1 - x0, y1 - y0];
}

function clean(pts) {
  const p = [];
  for (const q of pts.slice(0, MAX_POINTS)) {
    if (!Number.isFinite(q[0]) || !Number.isFinite(q[1]) || Math.abs(q[0]) >= 1e6 || Math.abs(q[1]) >= 1e6) continue;
    const l = p[p.length - 1];
    if (!l || l[0] !== q[0] || l[1] !== q[1]) p.push(q);
  }
  return p;
}

function ellipseRms(p, x0, y0, w, h) {
  const rx = w / 2, ry = h / 2;
  if (rx <= 0 || ry <= 0 || !p.length) return Infinity;
  const cx = x0 + rx, cy = y0 + ry;
  let sum = 0;
  for (const [x, y] of p) sum += (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) ** 2;
  return Math.sqrt(sum / p.length);
}

function snapSquare(x, y, w, h) {
  if (Math.abs(w - h) <= 0.12 * Math.max(w, h)) {
    const s = (w + h) / 2;
    return [x + (w - s) / 2, y + (h - s) / 2, s, s];
  }
  return [x, y, w, h];
}

function turning(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
  const lu = Math.hypot(u[0], u[1]), lv = Math.hypot(v[0], v[1]);
  if (lu <= 0 || lv <= 0) return 0;
  return deg(Math.acos(Math.min(1, Math.max(-1, (u[0] * v[0] + u[1] * v[1]) / (lu * lv)))));
}

function rdp(p, eps) {
  const n = p.length;
  if (n < 3) return p.slice();
  const keep = new Array(n).fill(false);
  keep[0] = true; keep[n - 1] = true;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let fi = a, fd = 0;
    for (let i = a + 1; i < b; i++) { const d = segDistance(p[a], p[b], p[i]); if (d > fd) { fd = d; fi = i; } }
    if (fd > eps) { keep[fi] = true; stack.push([a, fi], [fi, b]); }
  }
  return p.filter((_, i) => keep[i]);
}

function corners(p, diag) {
  const eps = 0.05 * diag;
  const start = p[0];
  if (!start) return [];
  let far = 0, fd = 0;
  p.forEach((q, i) => { const d = dist(start, q); if (d > fd) { fd = d; far = i; } });
  const a = p.slice(0, far), b = p.slice(far);
  const ring = rdp([...a, ...(b.length ? [b[0]] : [])], eps);
  const back = rdp([...b, start], eps);
  ring.pop(); back.pop();
  ring.push(...back);
  while (ring.length > 3) {
    const n = ring.length;
    const turn = (i) => turning(ring[(i + n - 1) % n], ring[i], ring[(i + 1) % n]);
    let mi = 0, mt = Infinity;
    for (let i = 0; i < n; i++) { const t = turn(i); if (t < mt) { mt = t; mi = i; } }
    let short = -1;
    for (let j = 0; j < n; j++) if (dist(ring[j], ring[(j + 1) % n]) < 0.1 * diag) { short = j; break; }
    if (mt < 30) ring.splice(mi, 1);
    else if (short >= 0) ring.splice(turn(short) < turn((short + 1) % n) ? short : (short + 1) % n, 1);
    else break;
  }
  return ring;
}

function upright(c) {
  const n = c.length;
  const dirs = c.map((a, i) => {
    const b = c[(i + 1) % n];
    const d = ((deg(Math.atan2(b[1] - a[1], b[0] - a[0])) % 180) + 180) % 180;
    if (d <= 15 || d >= 165) return "across";
    if (d >= 75 && d <= 105) return "down";
    return null;
  });
  return dirs.every((d) => d) && dirs.every((d, i) => d !== dirs[(i + 1) % n]);
}

function shaftTip(p) {
  const tail = p[0];
  if (!tail) return null;
  const dmax = Math.max(...p.map((q) => dist(tail, q)));
  let ti = p.findIndex((q) => dist(tail, q) >= dmax - Math.max(0.03 * dmax, 2));
  if (ti < 0) return null;
  let best = dist(tail, p[ti]);
  for (let i = ti + 1; i < p.length; i++) {
    const d = dist(tail, p[i]);
    if (d >= best) { ti = i; best = d; } else if (d < best - 0.5) break;
  }
  const tip = p[ti];
  const shaft = dist(tail, tip);
  if (shaft < MIN_SIZE || p.slice(0, ti + 1).some((q) => segDistance(tail, tip, q) > Math.max(0.06 * shaft, 1.5))) return null;
  return [ti, tip, shaft];
}

function headFits(tail, tip, apex, b1, b2) {
  const shaft = dist(tail, tip), l1 = dist(apex, b1), l2 = dist(apex, b2);
  if (!(shaft > 0 && l1 > 0 && l2 > 0)) return false;
  const back = [tail[0] - tip[0], tail[1] - tip[1]];
  const angleSide = (e, len) => {
    const u = [e[0] - apex[0], e[1] - apex[1]];
    const ang = deg(Math.acos(Math.min(1, Math.max(-1, (back[0] * u[0] + back[1] * u[1]) / (shaft * len)))));
    return [ang, back[0] * u[1] - back[1] * u[0]];
  };
  const [a1, s1] = angleSide(b1, l1), [a2, s2] = angleSide(b2, l2);
  const ok = (l, a) => l >= BARB_LEN[0] * shaft && l <= BARB_LEN[1] * shaft && a >= BARB_ANGLE[0] && a <= BARB_ANGLE[1];
  const similar = Math.max(l1, l2) <= 2.5 * Math.min(l1, l2) && Math.abs(a1 - a2) <= 35;
  return ok(l1, a1) && ok(l2, a2) && s1 * s2 < 0 && similar;
}

function arrowOpen(p) {
  const tail = p[0];
  const st = shaftTip(p);
  if (!st) return null;
  const [ti, tip, shaft] = st;
  const head = p.slice(ti);
  const reach = Math.max(...head.map((q) => dist(tip, q)));
  const barbs = [];
  let out = false, gap = Infinity;
  for (const q of head) {
    const d = dist(tip, q);
    if (d > 0.25 * reach) {
      if (!out) {
        if (barbs.length === 2) return null;
        barbs.push([d, q]); out = true;
      } else if (barbs.length && d > barbs[barbs.length - 1][0]) barbs[barbs.length - 1] = [d, q];
    } else {
      out = false;
      if (barbs.length === 1) gap = Math.min(gap, d);
    }
  }
  if (barbs.length !== 2) return null;
  const [[l1, b1], [l2, b2]] = barbs;
  if (gap > 0.35 * Math.min(l1, l2) || shaft <= 0) return null;
  return headFits(tail, tip, tip, b1, b2) ? { kind: "arrow", a: tail, b: tip } : null;
}

function arrowClosed(p) {
  const tail = p[0];
  const st = shaftTip(p);
  if (!st) return null;
  const [ti, tip] = st;
  const head = p.slice(ti);
  let b1 = tip;
  for (const q of head) if (dist(tip, q) > dist(tip, b1)) b1 = q;
  let b2 = tip;
  for (const q of head) if (segDistance(tip, b1, q) > segDistance(tip, b1, b2)) b2 = q;
  const l1 = dist(tip, b1), l2 = dist(tip, b2);
  if (Math.min(l1, l2) <= 0 || dist(head[head.length - 1], tip) > 0.35 * Math.min(l1, l2)) return null;
  const tri = [tip, b1, b2];
  if (head.some((q) => polygonDistance(tri, q) > Math.max(0.15 * l1, 1.5))) return null;
  return headFits(tail, tip, tip, b1, b2) ? { kind: "arrow", a: tail, b: tip } : null;
}

export function recognise(pts) {
  const p = clean(pts);
  if (p.length < 2) return null;
  const first = p[0], last = p[p.length - 1];
  const [x0, y0, w, h] = bbox(p);
  const size = Math.max(w, h), diag = Math.hypot(w, h);
  if (size < MIN_SIZE) return null;
  let length = 0;
  for (let i = 1; i < p.length; i++) length += dist(p[i - 1], p[i]);
  const gap = dist(first, last);
  if (gap > 0.85 * length && gap >= MIN_SIZE) {
    const off = Math.max(...p.map((q) => segDistance(first, last, q)));
    if (off <= Math.max(0.06 * gap, 1.5)) return { kind: "line", a: first, b: last };
  }
  const rev = p.slice().reverse();
  const arrow = arrowOpen(p) || arrowOpen(rev) || arrowClosed(p) || arrowClosed(rev);
  if (arrow) return arrow;
  if (gap > 0.2 * size || length < 2 * size) return null;
  const rms = ellipseRms(p, x0, y0, w, h);
  if (w > 0.2 * size && h > 0.2 * size && rms < 0.06) {
    const [x, y, ww, hh] = snapSquare(x0, y0, w, h);
    return { kind: "ellipse", x, y, w: ww, h: hh };
  }
  const cs = corners(p, diag);
  const fits = cs.length >= 3 && p.every((q) => polygonDistance(cs, q) <= 0.08 * diag);
  if (fits && cs.length === 4 && upright(cs)) {
    const [bx, by, bw, bh] = bbox(cs);
    const [x, y, ww, hh] = snapSquare(bx, by, bw, bh);
    return { kind: "rect", x, y, w: ww, h: hh };
  }
  if (fits && cs.length <= MAX_CORNERS) return { kind: "polygon", pts: cs };
  if (w > 0.2 * size && h > 0.2 * size && rms < 0.1) {
    const [x, y, ww, hh] = snapSquare(x0, y0, w, h);
    return { kind: "ellipse", x, y, w: ww, h: hh };
  }
  return null;
}

// --- Setas de dois traços (linha + ponta) --------------------------------------------------

function headsOf(p, found) {
  if (found?.kind === "polygon" && found.pts.length === 3) {
    const [x, y, z] = found.pts;
    return [[x, y, z], [y, z, x], [z, x, y]];
  }
  const f = p[0], l = p[p.length - 1];
  if (!f || !l) return [];
  let ai = -1, ad = -1;
  p.forEach((q, i) => { const d = segDistance(f, l, q); if (d > ad) { ad = d; ai = i; } });
  const straight = (a, b, arm) => {
    const len = dist(a, b);
    return len >= 1 && arm.every((q) => segDistance(a, b, q) <= Math.max(0.12 * len, 1.5));
  };
  if (ai <= 0 || ai + 1 >= p.length || !straight(f, p[ai], p.slice(0, ai + 1)) || !straight(p[ai], l, p.slice(ai))) return [];
  return [[p[ai], f, l]];
}

// O que um traço pode ser numa seta de dois traços: a linha reta que ele é e as pontas possíveis.
export function arrowParts(pts) {
  const p = clean(pts);
  const found = recognise(p);
  return { line: found?.kind === "line" ? [found.a, found.b] : null, heads: headsOf(p, found) };
}

export function pairParts(line, head) {
  if (!line.line) return null;
  const [a, b] = line.line;
  let best = null;
  for (const [apex, b1, b2] of head.heads) {
    for (const [tail, tip] of [[a, b], [b, a]]) {
      const off = dist(apex, tip);
      const near = off <= Math.max(PAIR_REACH * dist(tail, tip), 3);
      if (near && (!best || off < best.off) && headFits(tail, tip, apex, b1, b2)) best = { off, shape: { kind: "arrow", a: tail, b: tip } };
    }
  }
  return best ? best.shape : null;
}

// Geometria (subcaminhos de pontos) de uma forma reconhecida, pronta pra virar `d` de <path>.
// Setas: haste + duas farpas (ponta aberta em V).
export function shapePaths(s) {
  const ELL = 72;
  switch (s.kind) {
    case "line": return [{ pts: [s.a, s.b], closed: false }];
    case "arrow": {
      const [a, b] = [s.a, s.b];
      const len = dist(a, b);
      const ux = (a[0] - b[0]) / (len || 1), uy = (a[1] - b[1]) / (len || 1);
      const bl = Math.min(Math.max(len * 0.2, 8), 28), ang = (28 * Math.PI) / 180;
      const rot = (sgn) => [b[0] + bl * (ux * Math.cos(sgn * ang) - uy * Math.sin(sgn * ang)), b[1] + bl * (ux * Math.sin(sgn * ang) + uy * Math.cos(sgn * ang))];
      return [{ pts: [a, b], closed: false }, { pts: [rot(1), b, rot(-1)], closed: false }];
    }
    case "rect": return [{ pts: [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]], closed: true }];
    case "ellipse": {
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      const pts = Array.from({ length: ELL }, (_, i) => { const t = (i / ELL) * Math.PI * 2; return [cx + (s.w / 2) * Math.cos(t), cy + (s.h / 2) * Math.sin(t)]; });
      return [{ pts, closed: true }];
    }
    default: return [{ pts: s.pts, closed: true }];
  }
}
