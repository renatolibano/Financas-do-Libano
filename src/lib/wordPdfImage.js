import { jsPDF } from "jspdf";
import { downloadBlob, safeFileName } from "./wordExport";

// PDF de um documento com páginas de PDF importadas (.pdf-import-page) JÁ EDITADO: cada página é desenhada como imagem
// de alta resolução, igual ao que aparece na tela (texto posicionado, negrito, bordas, caixas, tinta e o que foi escrito).
// Tudo local: o conteúdo vira SVG (foreignObject) -> canvas -> JPEG -> jsPDF. O texto do PDF final não é selecionável.

const SCALE = 2;
const MAX_PIXELS = 14e6;
const JPEG_QUALITY = 0.92;
const PX_TO_PT = 0.75;

const escXml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// CSS do app que afeta o conteúdo do editor (regras do Word, do corpo de notas e do PDF importado + regras genéricas de tags).
function collectCss() {
  const out = [];
  const keepSel = (s) => {
    if (/(^|,)\s*(html|body)\b/.test(s)) return false;
    if (/word|noteRichBody|pdf-/i.test(s)) return true;
    if (s.trim() === ":root") return true;
    return !/[.#\[:]/.test(s);
  };
  const walk = (rules, wrap) => {
    for (const r of rules) {
      if (r.type === 1) { if (keepSel(r.selectorText || "")) out.push(wrap ? `${wrap}{${r.cssText}}` : r.cssText); }
      else if (r.type === 4) {
        const cond = r.media?.mediaText || "";
        if (/print/i.test(cond)) continue;
        walk(r.cssRules, `@media ${cond}`);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    if (rules) walk(rules, "");
  }
  return out.join("\n");
}

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(fr.result);
  fr.onerror = reject;
  fr.readAsDataURL(blob);
});

// Imagens que não são data: (blob:, http) não carregam dentro de um SVG; viram data: antes.
async function inlineImages(doc) {
  await Promise.all(Array.from(doc.images).map(async (img) => {
    const src = img.getAttribute("src") || "";
    if (!src || src.startsWith("data:")) return;
    try { img.setAttribute("src", await blobToDataUrl(await (await fetch(src)).blob())); } catch { /* mantém como está */ }
  }));
  await Promise.all(Array.from(doc.images).map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
}

const loadImage = (url) => new Promise((resolve, reject) => {
  const im = new Image();
  im.onload = () => resolve(im);
  im.onerror = () => reject(new Error("falha ao desenhar a página"));
  im.src = url;
});

export async function downloadWordPdfAsImages({ pageEl, bodyEl, width, height, title, onProgress }) {
  if (!pageEl || !bodyEl) throw new Error("Documento não encontrado.");
  const rawCss = collectCss();
  const css = escXml(rawCss);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = `position:fixed;left:-30000px;top:0;width:${width}px;height:${height}px;border:0;visibility:hidden;pointer-events:none`;
  const loaded = new Promise((r) => { iframe.onload = r; });
  iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>${rawCss}</style></head><body style="margin:0;background:transparent"></body></html>`;
  document.body.appendChild(iframe);
  try {
    await loaded;
    const idoc = iframe.contentDocument;

    // Página + corpo clonados, no modo "impressão" (sem modos de exibição, sombra, marcas de formatação nem edição).
    const page = idoc.importNode(pageEl, false);
    page.className = String(pageEl.className).split(/\s+/).filter((c) => c && !/^(wordPage-(draft|web|outline|grid)|wordInkReplaying)$/.test(c)).join(" ");
    page.style.width = `${width}px`;
    page.style.minHeight = `${height}px`;
    page.style.boxShadow = "none";
    page.style.margin = "0";
    const body = idoc.importNode(bodyEl, false);
    body.className = String(bodyEl.className).split(/\s+/).filter((c) => c && c !== "wordShowMarks" && c !== "wordPainting").join(" ");
    ["contenteditable", "spellcheck"].forEach((a) => body.removeAttribute(a));
    for (const n of Array.from(pageEl.childNodes)) {
      if (n === bodyEl) page.appendChild(body);
      else if (n.nodeType === 1 && n.classList.contains("wordWatermark")) page.appendChild(idoc.importNode(n, true));
    }
    for (const n of Array.from(bodyEl.childNodes)) body.appendChild(idoc.importNode(n, true));
    idoc.body.appendChild(page);
    await inlineImages(idoc);
    await idoc.fonts?.ready?.catch?.(() => {});

    // Páginas: cada bloco .pdf-import-page é uma página; o que vier fora dos blocos (texto escrito depois) flui em páginas do tamanho do documento.
    const pr = page.getBoundingClientRect();
    const totalH = Math.ceil(pr.height);
    const pageW = Math.ceil(pr.width);
    const pages = [];
    let flow = null;
    for (const n of Array.from(body.children)) {
      if (n.classList.contains("word-page-meta") || n.classList.contains("word-ink-layer")) continue;
      const r = n.getBoundingClientRect();
      if (n.classList.contains("pdf-import-page")) {
        flow = null;
        pages.push({ target: n, x: r.left - pr.left, y: r.top - pr.top, w: r.width, h: r.height });
        continue;
      }
      const has = !!(n.textContent || "").trim() || !!n.querySelector("img,table,svg,hr");
      if (!flow) { flow = { top: r.top - pr.top, bottom: r.bottom - pr.top, has }; pages.push(flow); }
      else { flow.bottom = Math.max(flow.bottom, r.bottom - pr.top); flow.has = flow.has || has; }
    }
    const list = [];
    for (const p of pages) {
      if (p.target) { list.push(p); continue; }
      if (!p.has) continue;
      const count = Math.max(1, Math.ceil((p.bottom - p.top) / height));
      for (let k = 0; k < count; k++) list.push({ target: null, x: 0, y: p.top + k * height, w: pageW, h: height });
    }
    if (!list.length) throw new Error("O documento não tem páginas para exportar.");

    const bg = idoc.defaultView.getComputedStyle(page).backgroundColor || "#fff";
    const serializer = new XMLSerializer();
    let pdf = null;

    for (let i = 0; i < list.length; i++) {
      onProgress?.(i + 1, list.length);
      const p = list[i];
      // Só o bloco da página atual vai inteiro; os outros blocos viram caixas vazias do mesmo tamanho (mantêm o layout).
      const pg = page.cloneNode(false);
      for (const c of Array.from(page.childNodes)) {
        if (c !== body) { pg.appendChild(c.cloneNode(true)); continue; }
        const bd = body.cloneNode(false);
        for (const n of Array.from(body.childNodes)) {
          if (n.nodeType === 1 && n.classList.contains("pdf-import-page") && n !== p.target) {
            const ghost = n.cloneNode(false);
            ghost.style.visibility = "hidden";
            bd.appendChild(ghost);
          } else bd.appendChild(n.cloneNode(true));
        }
        pg.appendChild(bd);
      }
      const html = serializer.serializeToString(pg);

      const k = Math.min(SCALE, Math.sqrt(MAX_PIXELS / (p.w * p.h)));
      const cw = Math.max(1, Math.round(p.w * k)), ch = Math.max(1, Math.round(p.h * k));
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}" viewBox="0 0 ${p.w} ${p.h}"><foreignObject x="${-p.x}" y="${-p.y}" width="${pageW}" height="${totalH}"><style xmlns="http://www.w3.org/1999/xhtml">${css}</style>${html}</foreignObject></svg>`;

      const canvas = document.createElement("canvas");
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cw, ch);
      let img;
      const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
      try {
        try { img = await loadImage(blobUrl); }
        catch { img = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)); }
        ctx.drawImage(img, 0, 0, cw, ch);
        await new Promise((r) => setTimeout(r, 0));
        ctx.drawImage(img, 0, 0, cw, ch); // 2ª passada: alguns navegadores terminam de decodificar imagens internas só depois do 1º desenho
      } finally { URL.revokeObjectURL(blobUrl); }
      const jpeg = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      canvas.width = canvas.height = 0;

      const wPt = p.w * PX_TO_PT, hPt = p.h * PX_TO_PT;
      const orientation = wPt > hPt ? "landscape" : "portrait";
      if (!pdf) pdf = new jsPDF({ unit: "pt", format: [wPt, hPt], orientation, compress: true });
      else pdf.addPage([wPt, hPt], orientation);
      pdf.addImage(jpeg, "JPEG", 0, 0, wPt, hPt, undefined, "FAST");
    }
    downloadBlob(pdf.output("blob"), `${safeFileName(title)}.pdf`);
  } finally {
    iframe.remove();
  }
}
