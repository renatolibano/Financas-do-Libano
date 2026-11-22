import { pdfjsLib, pdfWasmUrl } from "./pdf";
import { mergeRuns } from "./pdfRunMerge";

// Importação de PDF para o editor "Word" com o layout preservado: cada página do PDF vira um bloco
// do tamanho da página, com (1) os gráficos vetoriais (bordas, linhas, retângulos, tracejados,
// preenchimentos) como SVG, (2) as imagens e (3) o texto em linhas posicionadas, com fonte, tamanho,
// negrito e itálico. Tudo roda localmente; nada sai pela rede.

const OPS = pdfjsLib.OPS;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r2 = (n) => Math.round(n * 100) / 100;
const mul = (m, n) => pdfjsLib.Util.transform(m, n);
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const MAX_PATHS_PER_PAGE = 8000;
const MAX_IMAGE_SIDE = 1600;
const IMAGE_BUDGET = 9 * 1024 * 1024; // ~9 MB de imagens por documento

// ---------- cor ----------
function colorOf(args) {
  const a = args?.[0];
  if (typeof a === "string") return a === "transparent" ? null : a;
  if (args && args.length >= 3 && typeof args[0] === "number") {
    const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    return "#" + h(args[0]) + h(args[1]) + h(args[2]);
  }
  return "#000000";
}

// ---------- gráficos vetoriais + imagens ----------
async function pageGraphics(page, vp, imgState) {
  const ol = await page.getOperatorList();
  const { fnArray, argsArray } = ol;
  const layers = []; // { type: "svg", paths: [] } | { type: "img", html }
  let cur = null;
  const svgLayer = () => { if (!cur) { cur = { type: "svg", paths: [] }; layers.push(cur); } return cur; };
  const flush = () => { cur = null; };

  let st = { fill: "#000000", stroke: "#000000", lw: 1, dash: null, fa: 1, sa: 1 };
  let ctm = vp.transform.slice();
  const stack = [];
  let pathCount = 0;

  const getObj = (id) => new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    setTimeout(() => fin(null), 2500);
    try {
      const store = typeof id === "string" && id.startsWith("g_") ? page.commonObjs : page.objs;
      store.get(id, fin);
    } catch { fin(null); }
  });

  const drawPath = (op, data) => {
    const stroke = op === OPS.stroke || op === OPS.closeStroke || op === OPS.fillStroke || op === OPS.eoFillStroke || op === OPS.closeFillStroke || op === OPS.closeEOFillStroke;
    const fill = op === OPS.fill || op === OPS.eoFill || op === OPS.fillStroke || op === OPS.eoFillStroke || op === OPS.closeFillStroke || op === OPS.closeEOFillStroke;
    if (!stroke && !fill) return;
    const doFill = fill && st.fill && st.fa > 0;
    const doStroke = stroke && st.stroke && st.sa > 0;
    if (!doFill && !doStroke) return;
    const p = data?.[0];
    if (!p || typeof p.length !== "number" || pathCount >= MAX_PATHS_PER_PAGE) return;
    let d = "";
    for (let i = 0; i < p.length;) {
      const c = p[i++];
      if (c === 0) { const [x, y] = apply(ctm, p[i++], p[i++]); d += `M${r2(x)} ${r2(y)}`; }
      else if (c === 1) { const [x, y] = apply(ctm, p[i++], p[i++]); d += `L${r2(x)} ${r2(y)}`; }
      else if (c === 2) {
        const [x1, y1] = apply(ctm, p[i++], p[i++]); const [x2, y2] = apply(ctm, p[i++], p[i++]); const [x3, y3] = apply(ctm, p[i++], p[i++]);
        d += `C${r2(x1)} ${r2(y1)} ${r2(x2)} ${r2(y2)} ${r2(x3)} ${r2(y3)}`;
      } else if (c === 3) {
        const [x1, y1] = apply(ctm, p[i++], p[i++]); const [x2, y2] = apply(ctm, p[i++], p[i++]);
        d += `Q${r2(x1)} ${r2(y1)} ${r2(x2)} ${r2(y2)}`;
      } else if (c === 4) d += "Z";
      else break;
    }
    if (!d) return;
    const sc = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
    let attrs = `d="${d}"`;
    attrs += doFill ? ` fill="${st.fill}"${op === OPS.eoFill || op === OPS.eoFillStroke || op === OPS.closeEOFillStroke ? ' fill-rule="evenodd"' : ""}${st.fa < 1 ? ` fill-opacity="${r2(st.fa)}"` : ""}` : ' fill="none"';
    if (doStroke) {
      attrs += ` stroke="${st.stroke}" stroke-width="${r2(Math.max(0.5, st.lw * sc))}"`;
      if (st.dash && st.dash.length) attrs += ` stroke-dasharray="${st.dash.map((v) => r2(Math.max(0.1, v * sc))).join(" ")}"`;
      if (st.sa < 1) attrs += ` stroke-opacity="${r2(st.sa)}"`;
    }
    // Traços seguidos com o mesmo estilo (mapas, gráficos, hachuras) viram um único <path>: mesmo desenho, bem menos elementos,
    // e o limite de caminhos por página quase não é atingido. Preenchimentos não são unidos (sentidos opostos poderiam furar a forma).
    const arr = svgLayer().paths;
    if (!doFill && arr.length) {
      const rest = attrs.slice(`d="${d}"`.length);
      const prev = arr[arr.length - 1];
      const tail = `"${rest}/>`;
      if (prev.startsWith('<path d="') && prev.endsWith(tail) && prev.length < 400000) {
        arr[arr.length - 1] = prev.slice(0, prev.length - tail.length) + d + tail;
        return;
      }
    }
    arr.push(`<path ${attrs}/>`);
    pathCount++;
  };

  const placeImage = async (img) => {
    if (!img || imgState.bytes > IMAGE_BUDGET) return;
    const url = await imageToDataUrl(img, imgState);
    if (!url) return;
    const pts = [apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 0, 1), apply(ctm, 1, 1)];
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const l = Math.min(...xs), t = Math.min(...ys), w = Math.max(...xs) - l, h = Math.max(...ys) - t;
    if (w < 1 || h < 1) return;
    const flip = (ctm[0] < 0 ? " scaleX(-1)" : "") + (ctm[3] > 0 ? " scaleY(-1)" : "");
    flush();
    layers.push({ type: "img", url, l, t, w, h, html: `<img src="${url}" contenteditable="false" style="position:absolute;left:${r2(l)}px;top:${r2(t)}px;width:${r2(w)}px;height:${r2(h)}px;${flip ? `transform:${flip.trim()};` : ""}max-width:none">` });
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], a = argsArray[i];
    switch (fn) {
      case OPS.save: stack.push({ st: { ...st }, ctm: ctm.slice() }); break;
      case OPS.restore: { const s = stack.pop(); if (s) { st = s.st; ctm = s.ctm; } break; }
      case OPS.transform: ctm = mul(ctm, a); break;
      case OPS.paintFormXObjectBegin: stack.push({ st: { ...st }, ctm: ctm.slice() }); if (a?.[0]) ctm = mul(ctm, a[0]); break;
      case OPS.paintFormXObjectEnd: { const s = stack.pop(); if (s) { st = s.st; ctm = s.ctm; } break; }
      case OPS.setLineWidth: st.lw = a[0]; break;
      case OPS.setDash: st.dash = Array.isArray(a[0]) && a[0].length ? a[0].slice() : null; break;
      case OPS.setFillRGBColor: st.fill = colorOf(a); break;
      case OPS.setStrokeRGBColor: st.stroke = colorOf(a); break;
      case OPS.setFillTransparent: st.fill = null; break;
      case OPS.setStrokeTransparent: st.stroke = null; break;
      case OPS.setFillColorN: st.fill = null; break; // padrões/gradientes não são reproduzidos
      case OPS.setStrokeColorN: st.stroke = null; break;
      case OPS.setGState:
        for (const [k, v] of a?.[0] || []) {
          if (k === "LW") st.lw = v;
          else if (k === "D" && Array.isArray(v)) st.dash = v[0]?.length ? v[0].slice() : null;
          else if (k === "ca") st.fa = v;
          else if (k === "CA") st.sa = v;
        }
        break;
      case OPS.constructPath: drawPath(a[0], a[1]); break;
      case OPS.paintImageXObject: await placeImage(await getObj(a[0])); break;
      case OPS.paintInlineImageXObject: await placeImage(a[0]); break;
      default: break;
    }
  }
  return layers;
}

async function imageToDataUrl(img, imgState) {
  try {
    let w = img.width, h = img.height;
    let src;
    if (img.bitmap) { src = img.bitmap; w = img.bitmap.width; h = img.bitmap.height; }
    else if (img.data && w && h) {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      const out = ctx.createImageData(w, h);
      const d = img.data, o = out.data;
      if (img.kind === 3 || d.length === w * h * 4) o.set(d.subarray ? d.subarray(0, o.length) : d.slice(0, o.length));
      else if (img.kind === 2 || d.length === w * h * 3) for (let p = 0, q = 0; p < w * h; p++, q += 3) { o[p * 4] = d[q]; o[p * 4 + 1] = d[q + 1]; o[p * 4 + 2] = d[q + 2]; o[p * 4 + 3] = 255; }
      else if (img.kind === 1) {
        const rowBytes = (w + 7) >> 3;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = (d[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0; const p = (y * w + x) * 4; o[p] = o[p + 1] = o[p + 2] = v; o[p + 3] = 255; }
      } else return null;
      ctx.putImageData(out, 0, 0);
      src = c;
    } else return null;
    const k = Math.min(1, MAX_IMAGE_SIDE / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
    const cv = document.createElement("canvas");
    cv.width = cw; cv.height = ch;
    cv.getContext("2d").drawImage(src, 0, 0, cw, ch);
    const url = cw * ch <= 300000 ? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", 0.85);
    imgState.bytes += url.length;
    return url;
  } catch { return null; }
}

// ---------- texto ----------
const BASELINE = { sans: 0.8465, serif: 0.8375, mono: 0.7665 };
const FAMILY = {
  sans: "Arial,Helvetica,sans-serif",
  serif: "'Times New Roman',Times,serif",
  mono: "'Courier New',Courier,monospace",
};
let measureCtx = null;
function measure(text, font) {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

function fontStyle(page, styles, fontName, cache) {
  if (cache.has(fontName)) return cache.get(fontName);
  let f = null;
  try { if (page.commonObjs.has(fontName)) f = page.commonObjs.get(fontName); } catch { f = null; }
  const nm = String(f?.name || "") + " " + String(styles?.[fontName]?.fontFamily || "");
  const generic = String(f?.fallbackName || styles?.[fontName]?.fontFamily || "");
  const bold = !!f?.bold || /bold|black|heavy|semibold|demi/i.test(nm);
  const italic = !!f?.italic || /italic|oblique/i.test(nm);
  let kind = "sans";
  if (/courier|mono|consolas|typewriter/i.test(nm) || /monospace/i.test(generic)) kind = "mono";
  else if ((/times|georgia|garamond|cambria|palatino|minion|bookman|century|roman|serif/i.test(nm) && !/sans/i.test(nm)) || /^serif$/i.test(generic)) kind = "serif";
  const out = { bold, italic, kind };
  cache.set(fontName, out);
  return out;
}

function pageRuns(page, tc, vp) {
  const cache = new Map();
  const raw = [];
  for (const it of tc.items) {
    if (typeof it.str !== "string" || !it.transform) continue;
    const t = mul(vp.transform, it.transform);
    const size = Math.hypot(t[2], t[3]);
    if (!size || size < 1) continue;
    const ang = Math.atan2(t[1], t[0]);
    raw.push({ str: it.str, x: t[4], y: t[5], size, ang, w: (it.width || 0) * vp.scale, font: it.fontName, rtl: it.dir === "rtl" });
  }

  // junta pedaços da mesma linha (vão largo entre colunas/células quebra a linha: ver lib/pdfRunMerge.js)
  const runs = mergeRuns(raw);

  return runs.map((r) => {
    const fs = fontStyle(page, tc.styles, r.font, cache);
    const fam = FAMILY[fs.kind];
    const size = r2(r.size);
    let style = `font-size:${size}px;font-family:${fam};`;
    if (fs.bold) style += "font-weight:700;";
    if (fs.italic) style += "font-style:italic;";
    const k = BASELINE[fs.kind] * r.size;
    let left, top;
    if (Math.abs(r.ang) > 0.02) {
      left = r.x + k * Math.sin(r.ang); top = r.y - k * Math.cos(r.ang);
      style += `transform-origin:0 0;transform:rotate(${r2(r.ang * 180 / Math.PI)}deg);`;
    } else { left = r.x; top = r.y - k; }
    style += `left:${r2(left)}px;top:${r2(top)}px;`;
    if (!r.rtl && !/[\u0590-\u08FF]/.test(r.text) && r.w > 0 && r.text.length > 1) {
      const m = measure(r.text, `${fs.italic ? "italic " : ""}${fs.bold ? "700 " : ""}${size}px ${fam}`);
      const ls = (r.w - m) / r.text.length;
      if (Math.abs(ls) > 0.02) style += `letter-spacing:${r2(Math.max(-0.1 * r.size, Math.min(0.25 * r.size, ls)))}px;`;
    }
    return { html: `<span class="pdf-run"${r.rtl ? ' dir="rtl"' : ""} style="${style}">${esc(r.text)}</span>`, text: r.text, x: r.x, y: r.y, size: r.size, w: r.w, bold: fs.bold, italic: fs.italic, kind: fs.kind, rtl: r.rtl };
  });
}

// ---------- texto corrido (editável como se tivesse sido digitado) ----------
// Em vez de blocos posicionados, o conteúdo da página vira parágrafos, títulos e imagens normais do editor, na ordem de leitura.
const escT = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function flowPage(runs, imgs, W, H) {
  const blocks = []; // { top, html }
  const sorted = runs.filter((r) => r.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const r of sorted) {
    const ln = lines.find((l) => Math.abs(l.y - r.y) < Math.max(l.size, r.size) * 0.4);
    if (ln) { ln.runs.push(r); ln.size = Math.max(ln.size, r.size); } else lines.push({ y: r.y, size: r.size, runs: [r] });
  }
  lines.sort((a, b) => a.y - b.y);
  lines.forEach((l) => { l.runs.sort((a, b) => a.x - b.x); const last = l.runs[l.runs.length - 1]; l.x0 = l.runs[0].x; l.right = last.x + last.w; });

  // tamanho do corpo = tamanho mais comum (ponderado pelo nº de caracteres)
  const bySize = new Map();
  lines.forEach((l) => l.runs.forEach((r) => { const k = Math.round(r.size); bySize.set(k, (bySize.get(k) || 0) + r.text.length); }));
  let bodySize = 12, best = -1;
  bySize.forEach((n, k) => { if (n > best) { best = n; bodySize = k; } });
  const minLeft = lines.length ? Math.min(...lines.map((l) => l.x0)) : 0;
  const maxRight = lines.length ? Math.max(...lines.map((l) => l.right)) : W;

  const inline = (l, base) => {
    let out = "";
    l.runs.forEach((r, i) => {
      if (i > 0) {
        const prev = l.runs[i - 1];
        const gap = r.x - (prev.x + prev.w);
        if (gap > prev.size * 2.5) out += "&emsp;&emsp;";
        else if (gap > prev.size * 0.15 && !/\s$/.test(prev.text) && !/^\s/.test(r.text)) out += " ";
      }
      let h = escT(i === 0 ? r.text.replace(/^\s+/, "") : r.text);
      const css = [];
      if (Math.abs(r.size - base) > 0.6) css.push(`font-size:${r2(r.size)}px`);
      if (r.kind === "mono") css.push("font-family:'Courier New',Courier,monospace");
      else if (r.kind === "serif") css.push("font-family:'Times New Roman',Times,serif");
      if (css.length) h = `<span style="${css.join(";")}">${h}</span>`;
      if (r.italic) h = `<i>${h}</i>`;
      if (r.bold) h = `<b>${h}</b>`;
      out += h;
    });
    return out.replace(/\s+$/, "");
  };

  const paras = [];
  lines.forEach((l) => {
    const p = paras[paras.length - 1];
    const prevLine = p && p.lines[p.lines.length - 1];
    const heading = l.size >= bodySize * 1.2;
    if (p && !heading && !p.heading && (l.y - prevLine.y) <= 1.65 * Math.max(prevLine.size, l.size) && Math.abs(l.size - prevLine.size) < 0.8
      && Math.abs(l.x0 - prevLine.x0) < l.size * 1.2 && prevLine.right >= maxRight - prevLine.size * 3) p.lines.push(l);
    else paras.push({ lines: [l], heading });
  });

  paras.forEach((p, idx) => {
    const first = p.lines[0], last = p.lines[p.lines.length - 1];
    const size = first.size;
    const html = p.lines.map((l) => inline(l, size)).join(" ");
    if (!html) return;
    const indent = first.x0 - minLeft;
    const rightGap = maxRight - last.right;
    let align = "left";
    if (indent > size * 3 && Math.abs((first.x0 + last.right) / 2 - W / 2) < size * 1.5 && p.lines.length <= 2) align = "center";
    else if (indent > (maxRight - minLeft) * 0.4 && rightGap < size * 1.5) align = "right";
    const css = [`font-size:${r2(size)}px`];
    if (align !== "left") css.push(`text-align:${align}`);
    else if (indent > size * 1.5) css.push(`margin-left:${Math.round(Math.min(300, indent))}px`);
    const ratio = size / bodySize;
    const allBold = p.lines.every((l) => l.runs.every((r) => r.bold));
    const tag = ratio >= 1.8 ? "h1" : ratio >= 1.4 ? "h2" : ratio >= 1.2 && allBold ? "h3" : "div";
    const prev = idx ? paras[idx - 1] : null;
    let top = first.y;
    if (prev) {
      const pl = prev.lines[prev.lines.length - 1];
      if (first.y - pl.y >= 1.9 * Math.max(pl.size, size)) blocks.push({ top: first.y - 0.01, html: "<div><br></div>" });
    }
    blocks.push({ top, html: `<${tag} style="${css.join(";")}">${html}</${tag}>` });
  });

  imgs.forEach((im) => {
    if (runs.length && im.w * im.h > W * H * 0.85) return; // imagem de fundo da página inteira: não entra no texto
    const cx = im.l + im.w / 2;
    const align = Math.abs(cx - W / 2) < W * 0.08 ? "center" : cx > W * 0.7 ? "right" : "left";
    blocks.push({ top: im.t, html: `<div${align !== "left" ? ` style="text-align:${align}"` : ""}><img src="${im.url}" style="width:${r2(im.w)}px;height:${r2(im.h)}px;max-width:100%"></div>` });
  });
  blocks.sort((a, b) => a.top - b.top);
  return blocks.map((b) => b.html).join("");
}

// ---------- API ----------
// opts.fit = { w, h } (px): tamanho da página do documento onde o PDF está sendo inserido; cada página do PDF é ajustada
// (sem cortar) e centralizada num bloco exatamente desse tamanho — assim 3 PDFs de 1 página viram 3 páginas certinhas.
export async function pdfFileToWordHtml(file, opts = {}) {
  const buf = await file.arrayBuffer();
  const task = pdfjsLib.getDocument({ data: buf, wasmUrl: pdfWasmUrl, fontExtraProperties: true });
  const doc = await task.promise;
  const pages = [];
  let hasContent = false;
  let meta = { page_size: "a4", orientation: "retrato" };
  const imgState = { bytes: 0 };
  const flow = opts.layout !== true; // padrão: texto corrido editável; opts.layout = true mantém as páginas posicionadas
  try {
    let scale = 1, targetW = 794, pageH = 1123;
    const fit = opts.fit && opts.fit.w > 0 && opts.fit.h > 0 ? opts.fit : null;
    if (fit) { targetW = fit.w; pageH = fit.h; }
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const v1 = page.getViewport({ scale: 1 });
      if (p === 1 && !fit) {
        const land = v1.width > v1.height;
        const ratio = Math.max(v1.width, v1.height) / Math.min(v1.width, v1.height);
        const carta = ratio < 1.354;
        const dims = carta ? { w: 816, h: 1056 } : { w: 794, h: 1123 };
        targetW = land ? dims.h : dims.w;
        pageH = land ? dims.w : dims.h;
        scale = targetW / v1.width;
        meta = { page_size: carta ? "carta" : "a4", orientation: land ? "paisagem" : "retrato" };
      }
      const pageScale = fit ? Math.min(fit.w / v1.width, fit.h / v1.height) : scale;
      const vp = page.getViewport({ scale: pageScale });
      const tc = await page.getTextContent();
      const layers = await pageGraphics(page, vp, imgState); // carrega as fontes do PDF (usadas em pageRuns)
      const runs = pageRuns(page, tc, vp);
      const W = Math.round(vp.width), H = Math.round(vp.height);
      if (flow) {
        const imgs = layers.filter((l) => l.type === "img");
        const h = flowPage(runs, imgs, W, H);
        if (h) { hasContent = true; pages.push(h); }
        page.cleanup();
        continue;
      }
      // O bloco tem sempre o tamanho exato da página (o arredondamento de 1 px por página fazia 3 páginas virarem 4).
      const outW = fit || Math.abs(W - targetW) <= 2 ? targetW : W;
      const outH = fit || Math.abs(H - pageH) <= 2 ? pageH : H;
      const offX = Math.round((outW - W) / 2), offY = Math.round((outH - H) / 2);
      let body = "";
      for (const l of layers) {
        if (l.type === "img") { body += l.html; hasContent = true; }
        else if (l.paths.length) body += `<svg contenteditable="false" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0;pointer-events:none;user-select:none">${l.paths.join("")}</svg>`;
      }
      if (runs.length) hasContent = true;
      body += runs.map((r) => r.html).join("\n");
      if (offX || offY) body = `<div style="position:absolute;left:${offX}px;top:${offY}px;width:${W}px;height:${H}px">${body}</div>`;
      pages.push(`<div class="pdf-import-page" style="position:relative;width:${outW}px;height:${outH}px;overflow:hidden;background:#fff">${body}</div>`);
      page.cleanup();
    }
  } finally {
    task.destroy();
  }
  if (!hasContent) throw new Error("Este PDF não tem texto nem imagens que possam ser importados.");
  return {
    title: file.name.replace(/\.pdf$/i, "").trim() || "Documento",
    html: flow ? pages.join("<div><br></div>") : pages.join("\n"),
    ...meta,
    margins: flow ? "normal" : "estreita",
  };
}
