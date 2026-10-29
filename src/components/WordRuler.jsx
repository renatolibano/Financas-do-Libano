import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PT_PER_CM, RULER_SCALE_CM, cmToPt, ptToCm, rulerMarks, indentMarkerRects, tabGlyphRect, rectsIntersect,
  draggedMargin, snapIndent, snapTab, droppedOff, nextTabKind, tabGlyph, TAB_KIND_LABEL, formatCm, MIN_INDENT_ROOM_PT,
} from "../lib/wordRulerMath";

// Régua horizontal do editor "Word" — port de wordcraft (crates/ui-egui/src/canvas.rs `rulers` e
// ruler_tabs.rs). Fica presa no topo da área da página (sticky), com a largura exata da página:
//  - barra de margens (escura) e área de texto (clara), graduada em cm; os números só aparecem na
//    área de texto (as margens têm só ticks) e rarefazem quando o zoom diminui;
//  - bordas da área de texto arrastam as margens (encaixe de 1/16 pol, sobra ao menos 1 pol de texto);
//  - marcadores de recuo (primeira linha, esquerdo com o retângulo, direito) encaixam de 4,5 pt;
//  - seletor de tabulação no canto (clique = próximo tipo, botão direito = anterior); clique ou arraste
//    na área de texto cria uma parada (Alt = sem encaixe); arrastar uma parada a move; arrastá-la para
//    fora da régua (ou soltar longe dela) a apaga; Esc cancela. O gesto só é aplicado ao soltar.
// Os números e os marcadores ficam em pt (como no Rust) e são convertidos de/para cm nas callbacks.

const H = 15; // altura da barra (a faixa tem 22: 4 em cima, 3 embaixo)

const lineProps = (l) => ({ x1: l[0], y1: l[1], x2: l[2], y2: l[3] });

export default function WordRuler({
  pageWidthCm, zoom = 100, marginLeft, marginRight, onMarginDrag,
  paraIndent, onIndentLeft, onIndentRight, onIndentFirstLine,
  tabStops, tabType, onSetTabType, onAddTab, onMoveTab, onCommitTabOrder, onRemoveTab,
}) {
  const trackRef = useRef(null);
  const [W, setW] = useState(0);
  const [tabDrag, setTabDrag] = useState(null); // { id|null, align, from(pt)|null, at(pt), off, cx, cy }

  // largura real da faixa em px (a faixa acompanha a página; o zoom é aplicado pelo wrapper).
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    const read = () => setW(parseFloat(getComputedStyle(el).width) || 0);
    read();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  // ---- geometria (pt) ------------------------------------------------------------------------
  const pageW = pageWidthCm * PT_PER_CM;
  const mlPt = cmToPt(marginLeft);
  const mrPt = cmToPt(marginRight);
  const textW = Math.max(0, pageW - mlPt - mrPt);
  const s = pageW > 0 && W > 0 ? W / pageW : 0; // px por pt
  const start = mlPt;                            // borda inicial do texto: recuos e tabulações partem dela
  const px = (pt) => (start + pt) * s;
  const indLeft = cmToPt(paraIndent.left);
  const indFirst = cmToPt(paraIndent.firstLine);
  const indRight = cmToPt(paraIndent.right);
  const firstX = px(indLeft + indFirst);
  const leftX = px(indLeft);
  const rightX = px(textW - indRight);
  const le = mlPt * s;
  const re = (pageW - mrPt) * s;
  const stepPt = PT_PER_CM / RULER_SCALE_CM[1] / 2; // passo de encaixe das paradas

  // O que o gesto de tabulação em andamento muda na barra: a parada movida sai de onde estava e
  // reaparece onde cairia; uma parada nova aparece onde seria posta (a menos que esteja fora).
  const movingId = tabDrag?.id ?? null;
  const stops = useMemo(() => (tabStops || []).map((t) => ({ ...t, pt: cmToPt(t.pos) })), [tabStops]);
  const glyphs = [];
  stops.forEach((t) => { if (t.id !== movingId) glyphs.push({ key: t.id, x: px(t.pt), kind: t.type }); });
  if (tabDrag && !tabDrag.off) glyphs.push({ key: "drag", x: px(tabDrag.at), kind: tabDrag.align });

  // ---- graduação (números só na área de texto; fogem dos marcadores) --------------------------------
  const marks = useMemo(
    () => (s > 0 ? rulerMarks(mlPt, textW, pageW, RULER_SCALE_CM, s * (zoom / 100)) : []),
    [s, mlPt, textW, pageW, zoom],
  );
  const keepClear = [
    ...indentMarkerRects(firstX, leftX, rightX, H),
    ...glyphs.map((g) => tabGlyphRect(g.x, H)),
  ];
  let tickPath = "";
  const labels = [];
  for (const m of marks) {
    const x = Math.round(m.d * s) + 0.5;
    let len = m.tick;
    if (m.label !== undefined) {
      const w = String(m.label).length * 5.4 + 1;
      const box = { x0: m.d * s - w / 2, y0: H / 2 - 5.5, x1: m.d * s + w / 2, y1: H / 2 + 5.5 };
      if (!keepClear.some((r) => rectsIntersect(r, box))) { labels.push({ x: m.d * s, n: m.label }); continue; }
      len = 7; // o número fica no lugar do tick de unidade quando bate num marcador
    }
    tickPath += `M${x} ${H / 2 - len / 2}V${H / 2 + len / 2}`;
  }

  // ---- gestos ------------------------------------------------------------------------------------
  // Os handlers de janela leem sempre o estado mais recente (as props mudam durante o arrasto).
  const live = useRef({});
  live.current = {
    pageW, mlPt, mrPt, textW, start, stepPt, indLeft, stops, tabType, W,
    onMarginDrag, onIndentLeft, onIndentRight, onIndentFirstLine, onAddTab, onMoveTab, onCommitTabOrder, onRemoveTab,
  };
  const ptAtClient = (cx) => {
    const r = trackRef.current?.getBoundingClientRect();
    return r && r.width ? ((cx - r.left) / r.width) * live.current.pageW : 0;
  };
  const distAtClient = (cx) => ptAtClient(cx) - live.current.start; // pt desde a borda inicial do texto

  const begin = (e, onMove, onUp, onCancel) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    let done = false;
    const finish = () => {
      done = true;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
    };
    const move = (ev) => { if (!done) onMove(ev); };
    const up = (ev) => { if (done) return; finish(); onUp?.(ev); };
    const cancel = () => { if (done) return; finish(); onCancel?.(); };
    const key = (ev) => { if (ev.key === "Escape" && onCancel) { ev.preventDefault(); ev.stopPropagation(); cancel(); } };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
    // só age quando o ponteiro se mexe (um clique no marcador não desloca nada), como no wordcraft
  };

  const startMargin = (edge) => (e) => begin(e, (ev) => {
    const g = live.current;
    const pt = draggedMargin(edge, ptAtClient(ev.clientX), { pageW: g.pageW, marginLeft: g.mlPt, marginRight: g.mrPt });
    g.onMarginDrag(edge, ptToCm(pt));
  });

  const startIndent = (which) => (e) => begin(e, (ev) => {
    const g = live.current;
    const d = distAtClient(ev.clientX);
    if (which === "left") {
      const pt = Math.min(Math.max(d, -g.start), Math.max(g.textW - MIN_INDENT_ROOM_PT, -g.start));
      g.onIndentLeft(ptToCm(snapIndent(pt)));
    } else if (which === "first") {
      g.onIndentFirstLine(ptToCm(snapIndent(d - g.indLeft)));
    } else {
      const pt = Math.min(Math.max(g.textW - d, -g.mrPt), Math.max(g.textW - MIN_INDENT_ROOM_PT, -g.mrPt));
      g.onIndentRight(ptToCm(snapIndent(pt)));
    }
  });

  // Parada nova (id null) ou parada existente (id) sendo posta/arrastada.
  const startTab = (id, align, from) => (e) => {
    const track = () => trackRef.current?.getBoundingClientRect();
    const upd = (ev) => {
      const g = live.current;
      const r = track();
      const f = r && g.W ? r.width / g.W : 1; // px de tela por px de layout (zoom)
      setTabDrag({
        id, align, from,
        at: snapTab(distAtClient(ev.clientX), g.stepPt, g.textW, ev.altKey),
        off: r ? droppedOff(ev.clientY / f, r.top / f, r.bottom / f) : false,
        cx: ev.clientX, cy: ev.clientY,
      });
    };
    begin(
      e,
      upd,
      (ev) => {
        const g = live.current;
        const r = track();
        const f = r && g.W ? r.width / g.W : 1;
        const at = snapTab(distAtClient(ev.clientX), g.stepPt, g.textW, ev.altKey);
        const off = r ? droppedOff(ev.clientY / f, r.top / f, r.bottom / f) : false;
        setTabDrag(null);
        if (id == null) {
          if (off) return; // parada nova solta longe da régua: não cria
          const dup = g.stops.find((t) => Math.abs(t.pt - at) < 0.5);
          if (dup) g.onRemoveTab(dup.id);
          g.onAddTab(ptToCm(at));
        } else if (off) {
          g.onRemoveTab(id);
        } else if (Math.abs(at - from) >= 0.01) {
          g.onMoveTab(id, ptToCm(at));
          g.onCommitTabOrder();
        }
      },
      () => { setTabDrag(null); },
    );
  };

  // ---- render ------------------------------------------------------------------------------------
  const cornerNudge = tabType === "left" ? -2 : tabType === "right" ? 2 : 0;
  const cornerGlyph = tabGlyph(7 + cornerNudge, 10, tabType);
  const area = tabDrag ? trackRef.current?.closest(".wordPageArea")?.getBoundingClientRect() : null;
  const trackRect = tabDrag ? trackRef.current?.getBoundingClientRect() : null;
  const guideX = trackRect && W ? trackRect.left + (px(tabDrag.at) / W) * trackRect.width : 0;
  const dragLabel = tabDrag ? (tabDrag.off ? "Remover" : `${TAB_KIND_LABEL[tabDrag.align] || ""} ${formatCm(ptToCm(tabDrag.at))}`) : "";

  return (
    <div className="wordRulerBar" onMouseDown={(e) => e.preventDefault()}>
      <button
        type="button"
        className="wordRulerCorner"
        data-tip={"Tabulação: " + (TAB_KIND_LABEL[tabType] || "")}
        data-tipdesc="Clique para o próximo tipo de parada (esquerda, centralizada, direita, decimal) e clique na régua para inserir uma. Botão direito volta ao tipo anterior."
        onClick={() => onSetTabType(nextTabKind(tabType))}
        onContextMenu={(e) => { e.preventDefault(); onSetTabType(nextTabKind(tabType, true)); }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <rect x="0.5" y="0.5" width="13" height="13" rx="2" className="wrBox"/>
          {cornerGlyph.lines.map((l, i) => <line key={i} {...lineProps(l)} className="wrInk"/>)}
          {cornerGlyph.dot && <circle cx={cornerGlyph.dot[0]} cy={cornerGlyph.dot[1]} r={cornerGlyph.dot[2]} className="wrInkFill"/>}
        </svg>
      </button>

      <div className="wordRulerTrack" ref={trackRef}>
        {s > 0 && (
          <svg className="wordRulerSvg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            <rect x="0" y="0" width={W} height={H} className="wrMargin"/>
            <rect x={le} y="0" width={Math.max(0, re - le)} height={H} className="wrText"/>
            <path d={tickPath} className="wrTick"/>
            {labels.map((l) => (
              <text key={l.x} x={l.x} y={H / 2} textAnchor="middle" dominantBaseline="central" className="wrNum">{l.n}</text>
            ))}
            {glyphs.map((g) => {
              const gl = tabGlyph(g.x, H - 1, g.kind);
              return (
                <g key={g.key} className="wrTabGlyph">
                  {gl.lines.map((l, i) => <line key={i} {...lineProps(l)} className="wrInk"/>)}
                  {gl.dot && <circle cx={gl.dot[0]} cy={gl.dot[1]} r={gl.dot[2]} className="wrInkFill"/>}
                </g>
              );
            })}
            <polygon className="wrIndent" points={`${firstX - 4.5},0 ${firstX + 4.5},0 ${firstX},5`}/>
            <polygon className="wrIndent" points={`${leftX - 4.5},${H - 3} ${leftX + 4.5},${H - 3} ${leftX},${H - 8}`}/>
            <rect className="wrIndent" x={leftX - 4.5} y={H - 3} width="9" height="4"/>
            <polygon className="wrIndent" points={`${rightX - 4.5},${H - 1} ${rightX + 4.5},${H - 1} ${rightX},${H - 6}`}/>
          </svg>
        )}

        {s > 0 && (
          <>
            {/* ordem = prioridade: o que vem depois fica por cima (margens < nova parada < paradas < recuos) */}
            <div className="wordRulerZone wordRulerZone-margin" data-tip="Margem esquerda" data-tipdesc="Arraste para ajustar a margem esquerda da página." style={{ left: le - 10, width: 13, top: 0, height: H }} onPointerDown={startMargin("left")}/>
            <div className="wordRulerZone wordRulerZone-margin" data-tip="Margem direita" data-tipdesc="Arraste para ajustar a margem direita da página." style={{ left: re - 3, width: 13, top: 0, height: H }} onPointerDown={startMargin("right")}/>
            <div className="wordRulerZone wordRulerZone-add" style={{ left: le + 4, width: Math.max(0, re - le - 8), top: 0, height: H }} onPointerDown={startTab(null, tabType, null)}/>
            {stops.map((t) => (
              <div
                key={t.id}
                className="wordRulerZone wordRulerZone-tab"
                data-tip={`${TAB_KIND_LABEL[t.type] || "Parada"} ${formatCm(t.pos)}`}
                data-tipdesc="Arraste para mover, ou para fora da régua para remover."
                style={{ left: px(t.pt) - 4.5, width: 9, top: H - 9, height: 10 }}
                onPointerDown={startTab(t.id, t.type, t.pt)}
              />
            ))}
            <div className="wordRulerZone wordRulerZone-indent" data-tip="Recuo da primeira linha" data-tipdesc="Arraste para recuar apenas a primeira linha do parágrafo." style={{ left: firstX - 6, width: 12, top: -2, height: 10 }} onPointerDown={startIndent("first")}/>
            <div className="wordRulerZone wordRulerZone-indent" data-tip="Recuo à esquerda" data-tipdesc="Arraste para recuar o parágrafo inteiro a partir da esquerda." style={{ left: leftX - 6, width: 12, top: H - 9, height: 12 }} onPointerDown={startIndent("left")}/>
            <div className="wordRulerZone wordRulerZone-indent" data-tip="Recuo à direita" data-tipdesc="Arraste para recuar o parágrafo a partir da direita." style={{ left: rightX - 6, width: 12, top: H - 9, height: 12 }} onPointerDown={startIndent("right")}/>
          </>
        )}
      </div>

      {tabDrag && typeof document !== "undefined" && createPortal(
        <>
          {!tabDrag.off && area && <div className="wordRulerGuide" style={{ left: guideX, top: area.top, height: area.height }}/>}
          <div className="wordRulerDragTip" style={{ left: tabDrag.cx + 14, top: tabDrag.cy + 18 }}>{dragLabel}</div>
        </>,
        document.body,
      )}
    </div>
  );
}
