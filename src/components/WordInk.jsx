import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, X } from "lucide-react";
import {
  PT, MAX_POINTS, INK_ALPHA, addItem, bodyScale, clientToBody, convertItems, convertNew, inkItems,
  itemPaths, lassoSelect, moveItems, recolorItems, removeItems, topItemAt, unionBounds,
} from "../lib/wordInk";

const NS = "http://www.w3.org/2000/svg";
const MIN_STEP_PX = 1.5;
const GRAB_SLOP = 4;

const mk = (tag, attrs) => {
  const el = document.createElementNS(NS, tag);
  Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
};

// Deslocamento do corpo da página dentro da camada de captura (px de layout).
function bodyOffset(body, overlay) {
  const s = bodyScale(body);
  const b = body.getBoundingClientRect(), o = overlay.getBoundingClientRect();
  return [(b.left - o.left) / s, (b.top - o.top) / s];
}

function isTypingTarget(t) {
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t.isContentEditable && !t.closest?.(".wordInkCapture")));
}

// Camada de captura do ponteiro enquanto uma caneta, a borracha ou o laço estão em uso:
// traço ao vivo, laço e quadro de seleção são desenhados aqui (fora do documento); só o que é
// confirmado entra na camada de tinta do corpo (um passo de desfazer por ação).
export function WordInkCapture({ bodyRef, mode, color, width, inkToShape, onBefore, onChange, apiRef, onSelection }) {
  const overlayRef = useRef(null);
  const hud = useRef({});
  const drag = useRef(null);
  const sel = useRef([]);
  const props = useRef({});
  props.current = { mode, color, width, inkToShape, onBefore, onChange, onSelection };

  const notify = () => props.current.onSelection?.(sel.current.length);

  const drawFrame = (dx = 0, dy = 0) => {
    const h = hud.current;
    if (!h.frame) return;
    const b = unionBounds(sel.current);
    if (!b) { h.frame.setAttribute("d", ""); return; }
    const x = b.x + dx - 3, y = b.y + dy - 3, w = b.w + 6, hh = b.h + 6;
    h.frame.setAttribute("d", `M${x} ${y}H${x + w}V${y + hh}H${x}Z`);
  };
  const setSel = (items) => { sel.current = items; drawFrame(); notify(); };

  // HUD (traço ao vivo, laço, quadro) — criado uma vez.
  useLayoutEffect(() => {
    const ov = overlayRef.current;
    const svg = mk("svg", { class: "wordInkHud" });
    const g = mk("g");
    const live = mk("path", { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" });
    const lasso = mk("path", { fill: "none", stroke: "var(--accent, #4f8cff)", "stroke-width": "1", "stroke-dasharray": "4 3" });
    const frame = mk("path", { fill: "none", stroke: "var(--accent, #4f8cff)", "stroke-width": "1", "stroke-dasharray": "4 3" });
    g.append(live, lasso, frame);
    svg.appendChild(g);
    ov.appendChild(svg);
    hud.current = { g, live, lasso, frame };
    return () => { svg.remove(); hud.current = {}; };
  }, []);

  // Saiu do laço (ou trocou de ferramenta): solta a seleção.
  useEffect(() => { if (mode !== "lasso" && sel.current.length) setSel([]); }, [mode]);
  useEffect(() => () => { sel.current = []; props.current.onSelection?.(0); if (apiRef) apiRef.current = null; }, []); // eslint-disable-line

  useEffect(() => {
    if (!apiRef) return undefined;
    apiRef.current = {
      selection: () => sel.current.slice(),
      hasSelection: () => sel.current.length > 0,
      recolor: (c) => {
        if (!sel.current.length) return;
        props.current.onBefore?.();
        recolorItems(sel.current, c);
        props.current.onChange?.();
      },
      convert: () => {
        if (!sel.current.length) return 0;
        props.current.onBefore?.();
        const r = convertItems(sel.current);
        if (r.count) { setSel(r.items); props.current.onChange?.(); }
        return r.count;
      },
      removeSelection: () => {
        if (!sel.current.length) return;
        props.current.onBefore?.();
        removeItems(sel.current);
        setSel([]);
        props.current.onChange?.();
      },
      clear: () => setSel([]),
    };
  });

  // Desfazer/refazer troca o HTML do corpo: a seleção que sobrou aponta pra nós soltos.
  useEffect(() => {
    const b = bodyRef.current;
    if (!b) return undefined;
    const mo = new MutationObserver(() => {
      const alive = sel.current.filter((el) => el.isConnected);
      if (alive.length !== sel.current.length) setSel(alive);
    });
    mo.observe(b, { childList: true });
    return () => mo.disconnect();
  }, []); // eslint-disable-line

  // Delete apaga a seleção do laço, Esc solta.
  useEffect(() => {
    const onKey = (e) => {
      if (!sel.current.length || isTypingTarget(e.target)) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); apiRef.current?.removeSelection(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setSel([]); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []); // eslint-disable-line

  const body = () => bodyRef.current;
  const pointOf = (e) => clientToBody(body(), e.clientX, e.clientY);

  const setLive = (pts, tool, col, wpt) => {
    const { live } = hud.current;
    if (!live) return;
    if (!pts) { live.setAttribute("d", ""); return; }
    const d = pts.length === 1 ? `M${pts[0][0]} ${pts[0][1]}l0.01 0` : "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L");
    live.setAttribute("d", d);
    live.setAttribute("stroke", col);
    live.setAttribute("stroke-width", wpt * PT);
    live.setAttribute("stroke-opacity", String(INK_ALPHA[tool] ?? 1));
  };
  const setLoop = (pts) => {
    const { lasso } = hud.current;
    if (!lasso) return;
    lasso.setAttribute("d", pts && pts.length > 1 ? "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z" : "");
  };
  const eraseAt = (x, y) => {
    const hit = topItemAt(body(), x, y, 3);
    if (!hit) return;
    if (!drag.current.erased) { drag.current.erased = true; props.current.onBefore?.(); }
    hit.remove();
  };
  const inFrame = (x, y) => {
    const b = unionBounds(sel.current);
    return !!b && x >= b.x - GRAB_SLOP && x <= b.x + b.w + GRAB_SLOP && y >= b.y - GRAB_SLOP && y <= b.y + b.h + GRAB_SLOP;
  };

  const onPointerDown = (e) => {
    if (e.button > 0 || !body() || drag.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const [ox, oy] = bodyOffset(body(), overlayRef.current);
    hud.current.g?.setAttribute("transform", `translate(${ox} ${oy})`);
    const [x, y] = pointOf(e);
    const m = props.current.mode;
    if (m === "eraser") { drag.current = { kind: "erase", erased: false }; eraseAt(x, y); }
    else if (m === "lasso") {
      if (sel.current.length && inFrame(x, y)) drag.current = { kind: "move", from: [x, y], to: [x, y] };
      else drag.current = { kind: "loop", pts: [[x, y]] };
    } else drag.current = { kind: "pen", tool: m, color: props.current.color, width: props.current.width, pts: [[x, y]] };
    if (drag.current.kind === "pen") setLive(drag.current.pts, m, props.current.color, props.current.width);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) {
      if (props.current.mode === "lasso" && overlayRef.current && body()) {
        const [x, y] = pointOf(e);
        overlayRef.current.style.cursor = sel.current.length && inFrame(x, y) ? "move" : "crosshair";
      }
      return;
    }
    const s = bodyScale(body());
    const evs = (d.kind === "pen" && e.nativeEvent.getCoalescedEvents?.()) || [];
    for (const ev of evs.length ? evs : [e.nativeEvent]) {
      const [x, y] = clientToBody(body(), ev.clientX, ev.clientY);
      if (d.kind === "pen") {
        const l = d.pts[d.pts.length - 1];
        if (Math.hypot(x - l[0], y - l[1]) * s >= MIN_STEP_PX && d.pts.length < MAX_POINTS) d.pts.push([x, y]);
      } else if (d.kind === "loop") {
        const l = d.pts[d.pts.length - 1];
        if (Math.hypot(x - l[0], y - l[1]) * s >= MIN_STEP_PX * 2 && d.pts.length < MAX_POINTS) d.pts.push([x, y]);
      } else if (d.kind === "move") d.to = [x, y];
      else if (d.kind === "erase") eraseAt(x, y);
    }
    if (d.kind === "pen") setLive(d.pts, d.tool, d.color, d.width);
    else if (d.kind === "loop") setLoop(d.pts);
    else if (d.kind === "move") drawFrame(d.to[0] - d.from[0], d.to[1] - d.from[1]);
  };

  const finish = (cancel) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "pen") {
      setLive(null);
      if (cancel || !body()) return;
      props.current.onBefore?.();
      const el = addItem(body(), { tool: d.tool, color: d.color, width: d.width, paths: [{ pts: d.pts, closed: false }] });
      if (props.current.inkToShape && d.tool !== "highlighter") convertNew(body(), el);
      props.current.onChange?.();
    } else if (d.kind === "erase") {
      if (d.erased) props.current.onChange?.();
    } else if (d.kind === "loop") {
      setLoop(null);
      if (cancel) return;
      setSel(d.pts.length >= 3 ? lassoSelect(body(), d.pts) : []);
    } else if (d.kind === "move") {
      const dx = d.to[0] - d.from[0], dy = d.to[1] - d.from[1];
      if (cancel || Math.abs(dx) + Math.abs(dy) <= 0.25) { drawFrame(); return; }
      props.current.onBefore?.();
      moveItems(sel.current, dx, dy);
      drawFrame();
      props.current.onChange?.();
    }
  };

  return (
    <div
      ref={overlayRef}
      className={"wordInkCapture wordInkMode-" + mode}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => finish(false)}
      onPointerCancel={() => finish(true)}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

// ---- Reprodução de Tinta ----------------------------------------------------------------------
const REPLAY_SPEED = 400, REPLAY_GAP = 0.12;
const pathLen = (p) => {
  let l = 0;
  for (let i = 1; i < p.pts.length; i++) l += Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]);
  if (p.closed && p.pts.length > 2) l += Math.hypot(p.pts[0][0] - p.pts[p.pts.length - 1][0], p.pts[0][1] - p.pts[p.pts.length - 1][1]);
  return l;
};
const subD = (p) => "M" + p.pts.map(([x, y]) => `${x} ${y}`).join("L") + (p.closed ? "Z" : p.pts.length === 1 ? `l0.01 0` : "");

// Esconde a tinta da página (a classe wordInkReplaying vem do pai) e a desenha de novo, traço
// por traço, na ordem em que foi feita.
export function WordInkReplay({ bodyRef, onClose }) {
  const overlayRef = useRef(null);
  const [off, setOff] = useState([0, 0]);
  const strokes = useMemo(() => {
    let start = 0;
    return inkItems(bodyRef.current).map((el) => {
      const subs = itemPaths(el).map((p) => ({ d: subD(p), len: pathLen(p) }));
      const total = subs.reduce((a, s) => a + s.len, 0);
      const dur = Math.min(2.5, Math.max(0.15, total / REPLAY_SPEED));
      const s = {
        subs, total, start, dur, color: el.dataset.color || "#000", width: (parseFloat(el.dataset.width) || 1) * PT,
        alpha: INK_ALPHA[el.dataset.tool] ?? 1,
      };
      start += dur + REPLAY_GAP;
      return s;
    });
  }, []); // eslint-disable-line
  const end = strokes.length ? strokes[strokes.length - 1].start + strokes[strokes.length - 1].dur : 0;
  const refs = useRef([]);
  const clock = useRef({ t: 0, playing: true });
  const [ui, setUi] = useState({ playing: true, n: 0 });

  useLayoutEffect(() => {
    if (!strokes.length) { onClose(); return; }
    if (bodyRef.current && overlayRef.current) setOff(bodyOffset(bodyRef.current, overlayRef.current));
  }, []); // eslint-disable-line

  useEffect(() => {
    let raf = 0, last = performance.now(), lastN = -1, lastPlaying = true;
    const render = () => {
      const { t } = clock.current;
      let n = 0;
      strokes.forEach((k, i) => {
        const nodes = refs.current[i];
        if (!nodes) return;
        const started = k.start <= t;
        if (started) n++;
        const frac = k.dur > 0 ? Math.min(1, Math.max(0, (t - k.start) / k.dur)) : 1;
        let left = k.total * frac;
        k.subs.forEach((s, j) => {
          const node = nodes[j];
          if (!node) return;
          const drawn = s.len <= 0.5 ? (started ? s.len : 0) : Math.min(s.len, Math.max(0, left));
          left -= drawn;
          node.style.display = started && (drawn > 0 || s.len <= 0.5) ? "" : "none";
          node.style.strokeDasharray = String(Math.max(s.len, 0.01) + 1);
          node.style.strokeDashoffset = String(Math.max(0, s.len - drawn));
        });
      });
      if (n !== lastN || clock.current.playing !== lastPlaying) { lastN = n; lastPlaying = clock.current.playing; setUi({ playing: clock.current.playing, n }); }
    };
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const c = clock.current;
      if (c.playing) { c.t = Math.min(end, c.t + dt); if (c.t >= end) c.playing = false; }
      render();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", onKey, true); };
  }, [strokes, end]); // eslint-disable-line

  const act = (a) => {
    const c = clock.current;
    if (a === "rewind") c.t = 0;
    else if (a === "play") { if (c.playing) c.playing = false; else { if (c.t >= end) c.t = 0; c.playing = true; } }
    else c.t = strokes.map((s) => s.start + s.dur).find((e) => e > c.t + 1e-3) ?? end;
  };

  return (
    <>
      <div ref={overlayRef} className="wordInkReplayLayer" aria-hidden="true">
        <svg className="wordInkHud">
          <g transform={`translate(${off[0]} ${off[1]})`}>
            {strokes.map((k, i) => (
              <g key={i} fill="none" stroke={k.color} strokeWidth={k.width} strokeOpacity={k.alpha} strokeLinecap="round" strokeLinejoin="round">
                {k.subs.map((s, j) => (
                  <path key={j} d={s.d} style={{ display: "none" }} ref={(n) => { (refs.current[i] ||= [])[j] = n; }}/>
                ))}
              </g>
            ))}
          </g>
        </svg>
      </div>
      <div className="wordInkReplayBar" onMouseDown={(e) => e.preventDefault()}>
        <button type="button" data-tip="Voltar ao início" onClick={() => act("rewind")}><SkipBack size={15}/></button>
        <button type="button" data-tip={ui.playing ? "Pausar" : "Reproduzir"} onClick={() => act("play")}>{ui.playing ? <Pause size={15}/> : <Play size={15}/>}</button>
        <button type="button" data-tip="Avançar" onClick={() => act("forward")}><SkipForward size={15}/></button>
        <span>Traço {ui.n} de {strokes.length}</span>
        <button type="button" data-tip="Fechar" onClick={onClose}><X size={15}/></button>
      </div>
    </>
  );
}
