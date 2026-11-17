import { useCallback, useEffect, useRef, useState } from "react";

// Alças da imagem selecionada no Word: 8 pontos para redimensionar (cantos mantêm a proporção, lados esticam),
// uma alça circular acima para girar e, se a imagem está em posição livre (à frente/atrás do texto), arrastar para mover.
// O quadro é desenhado dentro da página (acompanha o zoom) e o tamanho das alças é compensado para ficar sempre confortável ao toque.

const HANDLES = [
  ["nw", -1, -1], ["n", 0, -1], ["ne", 1, -1],
  ["e", 1, 0], ["se", 1, 1], ["s", 0, 1], ["sw", -1, 1], ["w", -1, 0],
];
const CURSORS = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
const MIN_SIZE = 20;

export default function WordImageHandles({ img, bodyRef, pageRef, onBefore, onEnd, onMakeFree }) {
  const [box, setBox] = useState(null);
  const dragRef = useRef(null);
  const rafRef = useRef(0);

  const compute = useCallback(() => {
    const page = pageRef.current, body = bodyRef.current;
    if (!img || !page || !body || !body.contains(img)) { setBox(null); return; }
    const pr = page.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    const scale = body.offsetWidth ? br.width / body.offsetWidth : 1;
    const r = img.getBoundingClientRect();
    const w = img.offsetWidth, h = img.offsetHeight;
    const cx = (r.left + r.width / 2 - pr.left) / scale - page.clientLeft;
    const cy = (r.top + r.height / 2 - pr.top) / scale - page.clientTop;
    const rot = parseFloat(img.dataset.rotate || "0") || 0;
    const free = img.classList.contains("word-img-free");
    setBox({ left: cx - w / 2, top: cy - h / 2, w, h, rot, scale: scale || 1, free });
  }, [img, bodyRef, pageRef]);

  const schedule = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(compute);
  }, [compute]);

  useEffect(() => {
    compute();
    const body = bodyRef.current, page = pageRef.current;
    if (!img || !body || !page) return undefined;
    const ro = new ResizeObserver(schedule);
    ro.observe(body); ro.observe(page); ro.observe(img);
    const mo = new MutationObserver(schedule);
    mo.observe(img, { attributes: true });
    mo.observe(body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", schedule);
    return () => {
      ro.disconnect(); mo.disconnect();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(rafRef.current);
    };
  }, [img, bodyRef, pageRef, compute, schedule]);

  if (!box) return null;

  const k = 1 / box.scale; // 1 px "de tela" em px de layout
  const hs = 13 * k, hit = 38 * k, line = 2 * k;

  const begin = (e, kind, hx = 0, hy = 0) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onBefore?.();
    const r = img.getBoundingClientRect();
    dragRef.current = {
      kind, hx, hy,
      x: e.clientX, y: e.clientY,
      w: img.offsetWidth, h: img.offsetHeight,
      left: parseFloat(img.style.left) || 0, top: parseFloat(img.style.top) || 0,
      free: img.classList.contains("word-img-free"),
      pending: !img.classList.contains("word-img-free") && !!onMakeFree,
      moved: false,
      rot: box.rot, scale: box.scale,
      cx: r.left + r.width / 2, cy: r.top + r.height / 2,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const move = (e) => {
    const st = dragRef.current;
    if (!st) return;
    const dxv = (e.clientX - st.x) / st.scale, dyv = (e.clientY - st.y) / st.scale;
    if (st.pending) {
      if (Math.hypot(dxv, dyv) < 3) return;
      onMakeFree();
      st.pending = false;
      st.free = true;
      st.w = img.offsetWidth; st.h = img.offsetHeight;
      st.left = parseFloat(img.style.left) || 0; st.top = parseFloat(img.style.top) || 0;
    }
    if (st.kind === "resize") {
      // o movimento do dedo/mouse é projetado nos eixos da imagem (ela pode estar girada)
      const a = (-st.rot * Math.PI) / 180;
      const dx = dxv * Math.cos(a) - dyv * Math.sin(a);
      const dy = dxv * Math.sin(a) + dyv * Math.cos(a);
      let w = st.w, h = st.h;
      if (st.hx && st.hy) {
        const fw = Math.max(MIN_SIZE, st.w + st.hx * dx) / st.w;
        const fh = Math.max(MIN_SIZE, st.h + st.hy * dy) / st.h;
        const f = Math.abs(fw - 1) >= Math.abs(fh - 1) ? fw : fh;
        w = Math.max(MIN_SIZE, st.w * f);
        h = (st.h / st.w) * w;
      } else if (st.hx) w = Math.max(MIN_SIZE, st.w + st.hx * dx);
      else h = Math.max(MIN_SIZE, st.h + st.hy * dy);
      img.style.maxWidth = "none";
      img.style.width = `${Math.round(w)}px`;
      img.style.height = `${Math.round(h)}px`;
      if (st.free) {
        // mantém parado o lado/canto oposto à alça (a rotação é em torno do centro, então o centro é recalculado)
        const rad = (st.rot * Math.PI) / 180, cs = Math.cos(rad), sn = Math.sin(rad);
        const ax = -st.hx * st.w / 2, ay = -st.hy * st.h / 2;
        const bx = -st.hx * w / 2, by = -st.hy * h / 2;
        const ddx = ax - bx, ddy = ay - by;
        const ncx = st.left + st.w / 2 + ddx * cs - ddy * sn;
        const ncy = st.top + st.h / 2 + ddx * sn + ddy * cs;
        img.style.left = `${Math.round(ncx - w / 2)}px`;
        img.style.top = `${Math.round(ncy - h / 2)}px`;
      }
    } else if (st.kind === "move") {
      img.style.left = `${Math.round(st.left + dxv)}px`;
      img.style.top = `${Math.round(st.top + dyv)}px`;
    } else if (st.kind === "rotate") {
      let deg = (Math.atan2(e.clientY - st.cy, e.clientX - st.cx) * 180) / Math.PI + 90;
      deg = ((Math.round(deg) % 360) + 360) % 360;
      const snap = Math.round(deg / 15) * 15;
      if (Math.abs(deg - snap) <= 4) deg = snap % 360;
      img.dataset.rotate = String(deg);
      img.style.transform = deg ? `rotate(${deg}deg)` : "";
    }
    compute();
  };

  const end = (e) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* já liberado */ }
    compute();
    onEnd?.();
  };

  const common = { onPointerMove: move, onPointerUp: end, onPointerCancel: end };

  return (
    <div
      className="wordImgFrame"
      style={{ left: box.left, top: box.top, width: box.w, height: box.h, transform: box.rot ? `rotate(${box.rot}deg)` : undefined }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="wordImgMove" style={{ cursor: "move" }} onPointerDown={(e) => begin(e, "move")} {...common}/>
      <div className="wordImgRotLine" style={{ height: 18 * k, top: -18 * k, width: line }}/>
      <div
        className="wordImgHit wordImgRot"
        style={{ width: hit, height: hit, left: `calc(50% - ${hit / 2}px)`, top: -(18 * k) - hit / 2 - hs / 2 }}
        title="Girar"
        onPointerDown={(e) => begin(e, "rotate")}
        {...common}
      >
        <span style={{ width: hs * 1.5, height: hs * 1.5, borderWidth: line }}>
          <svg viewBox="0 0 24 24" width="70%" height="70%" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>
        </span>
      </div>
      {HANDLES.map(([name, hx, hy]) => (
        <div
          key={name}
          className="wordImgHit"
          style={{
            width: hit, height: hit, cursor: CURSORS[name],
            left: `calc(${(hx + 1) * 50}% - ${hit / 2}px)`, top: `calc(${(hy + 1) * 50}% - ${hit / 2}px)`,
          }}
          onPointerDown={(e) => begin(e, "resize", hx, hy)}
          {...common}
        >
          <span style={{ width: hs, height: hs, borderWidth: line }}/>
        </div>
      ))}
    </div>
  );
}
