// Edição livre de documentos importados de PDF (lib/pdfToWord.js): cada página importada é um bloco
// `.pdf-import-page` com trechos de texto (`.pdf-run`), imagens (`img`) e gráficos vetoriais
// (`svg path`) posicionados de forma absoluta. Este módulo deixa mexer em tudo isso como se o
// documento tivesse sido feito no editor: clicar para selecionar, arrastar para mover, redimensionar
// imagens, apagar (Delete / lixeira), mover com as setas e dar duplo clique num espaço vazio para
// escrever um texto novo. Texto continua editável digitando direto no trecho.
// Tudo roda localmente. A seleção é desenhada por uma camada fora do documento (nada disso é salvo).

const TOL = 5; // tolerância (px da tela) para acertar linhas finas
const BLUE = "#4f8cff";

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

function readTranslate(el) {
  const m = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/.exec(el.getAttribute("transform") || "");
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : [0, 0];
}

export function attachPdfFreeEdit(body, hooks) {
  let sel = null; // { kind: "run" | "img" | "path", el }
  let drag = null;

  const mk = (css, text) => {
    const d = document.createElement("div");
    d.style.cssText = css;
    if (text) d.textContent = text;
    return d;
  };
  const box = mk(`position:fixed;z-index:9000;border:1.5px dashed ${BLUE};pointer-events:none;display:none;box-sizing:border-box`);
  const bar = mk("position:fixed;z-index:9001;display:none;gap:2px;padding:2px;border-radius:6px;background:#1f2937;box-shadow:0 2px 8px rgba(0,0,0,.35)");
  const btnCss = "width:26px;height:24px;border:0;border-radius:4px;background:transparent;color:#fff;font-size:14px;line-height:24px;text-align:center;cursor:pointer;user-select:none;touch-action:none";
  const grip = mk(btnCss.replace("cursor:pointer", "cursor:move"), "✥");
  grip.title = "Arraste para mover";
  const del = mk(btnCss, "🗑");
  del.title = "Excluir (Delete)";
  bar.append(grip, del);
  const handle = mk(`position:fixed;z-index:9001;display:none;width:12px;height:12px;background:${BLUE};border:2px solid #fff;border-radius:3px;cursor:nwse-resize;touch-action:none;box-sizing:border-box`);
  handle.title = "Redimensionar (Shift = livre)";
  document.body.append(box, bar, handle);

  const pageOf = (n) => { const p = n?.closest?.(".pdf-import-page"); return p && body.contains(p) ? p : null; };
  const scaleOf = (page) => (page.offsetWidth ? page.getBoundingClientRect().width / page.offsetWidth : 1) || 1;
  const before = () => hooks.before?.();
  const after = () => hooks.after?.();

  const hide = () => { box.style.display = bar.style.display = handle.style.display = "none"; };

  const refresh = () => {
    if (!sel) return hide();
    if (!body.contains(sel.el)) { sel = null; return hide(); }
    const r = sel.el.getBoundingClientRect();
    if (!r.width && !r.height) return hide();
    Object.assign(box.style, { display: "block", left: r.left - 2 + "px", top: r.top - 2 + "px", width: r.width + 4 + "px", height: r.height + 4 + "px" });
    Object.assign(bar.style, { display: "flex", left: Math.max(4, r.left - 2) + "px", top: Math.max(4, r.top - 32) + "px" });
    if (sel.kind === "img") Object.assign(handle.style, { display: "block", left: r.right - 8 + "px", top: r.bottom - 8 + "px" });
    else handle.style.display = "none";
  };

  const dropIfEmptyRun = () => {
    if (sel?.kind !== "run" || !body.contains(sel.el)) return;
    if (!(sel.el.textContent || "").trim() && !sel.el.querySelector("img")) { before(); sel.el.remove(); after(); }
  };
  const select = (kind, el) => {
    if (sel && sel.el !== el) dropIfEmptyRun();
    sel = { kind, el };
    refresh();
  };
  const deselect = () => { dropIfEmptyRun(); sel = null; hide(); };

  const moveBy = (dx, dy) => {
    const el = sel.el;
    if (sel.kind === "path") {
      const [x, y] = readTranslate(el);
      el.setAttribute("transform", `translate(${Math.round((x + dx) * 100) / 100} ${Math.round((y + dy) * 100) / 100})`);
    } else {
      el.style.left = Math.round((num(el.style.left) + dx) * 100) / 100 + "px";
      el.style.top = Math.round((num(el.style.top) + dy) * 100) / 100 + "px";
    }
  };

  const remove = () => {
    if (!sel) return;
    before();
    sel.el.remove();
    sel = null;
    hide();
    after();
  };

  // Linha fina ou forma pequena: acha o gráfico vetorial sob o ponto (menor caixa que contém o clique).
  const hitPath = (page, x, y) => {
    const pr = page.getBoundingClientRect();
    const pageArea = pr.width * pr.height;
    let best = null, bestArea = Infinity;
    page.querySelectorAll("svg path").forEach((p) => {
      const r = p.getBoundingClientRect();
      if (x < r.left - TOL || x > r.right + TOL || y < r.top - TOL || y > r.bottom + TOL) return;
      const area = Math.max(r.width, 1) * Math.max(r.height, 1);
      if (area > pageArea * 0.6) return; // fundo da página: não é alvo
      if (area < bestArea) { best = p; bestArea = area; }
    });
    return best;
  };

  const startDrag = (e, mode) => {
    if (!sel) return;
    e.preventDefault();
    e.stopPropagation();
    before();
    const page = pageOf(sel.el);
    drag = {
      mode, sx: e.clientX, sy: e.clientY, scale: page ? scaleOf(page) : 1, moved: false,
      w: sel.el.offsetWidth || sel.el.getBoundingClientRect().width, h: sel.el.offsetHeight || sel.el.getBoundingClientRect().height,
      lx: e.clientX, ly: e.clientY,
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const onMove = (e) => {
    if (!drag || !sel) return;
    if (drag.mode === "move") {
      moveBy((e.clientX - drag.lx) / drag.scale, (e.clientY - drag.ly) / drag.scale);
      drag.lx = e.clientX; drag.ly = e.clientY;
    } else {
      const dx = (e.clientX - drag.sx) / drag.scale;
      const dy = (e.clientY - drag.sy) / drag.scale;
      const w = Math.max(8, drag.w + dx);
      const h = e.shiftKey ? Math.max(8, drag.h + dy) : Math.max(8, w * (drag.h / (drag.w || 1)));
      sel.el.style.width = Math.round(w * 100) / 100 + "px";
      sel.el.style.height = Math.round(h * 100) / 100 + "px";
    }
    drag.moved = true;
    refresh();
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    const moved = drag?.moved;
    drag = null;
    if (moved) after();
  };

  grip.addEventListener("pointerdown", (e) => startDrag(e, "move"));
  handle.addEventListener("pointerdown", (e) => startDrag(e, "resize"));
  del.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); remove(); });
  bar.addEventListener("pointerdown", (e) => e.preventDefault()); // não tira o foco do texto

  const onPointerDown = (e) => {
    if (e.button !== 0 || !body.isContentEditable) return;
    const page = pageOf(e.target);
    if (!page) return deselect();
    const run = e.target.closest?.(".pdf-run");
    if (run) return select("run", run); // o clique segue normal: coloca o cursor para digitar
    if (e.target.tagName === "IMG") {
      e.preventDefault();
      body.focus({ preventScroll: true });
      return select("img", e.target);
    }
    const p = hitPath(page, e.clientX, e.clientY);
    if (p) {
      e.preventDefault();
      body.focus({ preventScroll: true });
      return select("path", p);
    }
    deselect();
  };

  // Duplo clique num espaço vazio da página: cria um texto novo ali.
  const onDblClick = (e) => {
    if (!body.isContentEditable) return;
    const page = pageOf(e.target);
    if (!page || e.target.closest?.(".pdf-run") || e.target.tagName === "IMG" || hitPath(page, e.clientX, e.clientY)) return;
    e.preventDefault();
    before();
    const pr = page.getBoundingClientRect();
    const k = scaleOf(page);
    const size = 14;
    const run = document.createElement("span");
    run.className = "pdf-run";
    run.setAttribute("style", `font-size:${size}px;font-family:Arial,Helvetica,sans-serif;left:${Math.round((e.clientX - pr.left) / k)}px;top:${Math.round((e.clientY - pr.top) / k - size / 2)}px;`);
    run.textContent = "Texto";
    page.appendChild(run);
    body.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(run);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
    select("run", run);
    after();
  };

  const onKeyDown = (e) => {
    if (!sel || sel.kind === "run") return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); remove(); return; }
    if (e.key === "Escape") { deselect(); return; }
    const step = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d) {
      e.preventDefault();
      e.stopPropagation();
      before();
      moveBy(d[0], d[1]);
      refresh();
      after();
    }
  };

  const onInput = () => refresh();
  body.addEventListener("pointerdown", onPointerDown, true);
  body.addEventListener("dblclick", onDblClick, true);
  body.addEventListener("keydown", onKeyDown, true);
  body.addEventListener("input", onInput);
  window.addEventListener("scroll", refresh, true);
  window.addEventListener("resize", refresh);

  return () => {
    body.removeEventListener("pointerdown", onPointerDown, true);
    body.removeEventListener("dblclick", onDblClick, true);
    body.removeEventListener("keydown", onKeyDown, true);
    body.removeEventListener("input", onInput);
    window.removeEventListener("scroll", refresh, true);
    window.removeEventListener("resize", refresh);
    onUp();
    box.remove(); bar.remove(); handle.remove();
  };
}
