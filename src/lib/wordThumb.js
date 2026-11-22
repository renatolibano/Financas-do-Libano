// Miniatura da primeira página de um documento do editor "Word" (igual à capa dos livros).
// Desenha o HTML real da página (com o CSS do app) num SVG/foreignObject e rasteriza num JPEG pequeno.
// A miniatura fica só no aparelho (IndexedDB) — não usa rede nem coluna nova no banco.
import { idbGet, idbSet, idbDelete } from "./idbStorage";

const key = (id) => `word-thumb:${id}`;
export const getWordThumb = (id) => idbGet(key(id), null);
export const setWordThumb = (id, dataUrl) => idbSet(key(id), dataUrl);
export const deleteWordThumb = (id) => idbDelete(key(id));

let cssCache = null;
function pageCss() {
  if (cssCache) return cssCache;
  let out = "";
  for (const sheet of Array.from(document.styleSheets)) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const r of Array.from(rules || [])) {
      if (r.type !== 1) continue; // só regras de estilo simples
      const sel = r.selectorText || "";
      if (/word|note|:root|^\*|^html|^body|^img|^table|^td|^th|^p\b|^h[1-6]\b|^ul|^ol|^li|^blockquote/i.test(sel)) out += r.cssText + "\n";
    }
  }
  cssCache = out;
  return out;
}

const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });

// bodyEl: corpo (.wordRichBody) já no DOM, com o mesmo layout da página. pageClass: classes do .wordPage.
export async function renderWordThumb(bodyEl, { pageClass, pw, ph, bg = "#fff", targetW = 300 }) {
  // só o que está na primeira página: clona o corpo vazio e depois cada bloco da 1ª página (clonar o documento inteiro custava
  // segundos num livro de centenas de páginas)
  const clone = bodyEl.cloneNode(false);
  for (const n of bodyEl.children) { if ((n.offsetTop || 0) < ph) clone.appendChild(n.cloneNode(true)); }
  clone.querySelectorAll(".word-img-selected,.word-cell-active,.word-shape-selected").forEach(n => n.classList.remove("word-img-selected", "word-cell-active", "word-shape-selected"));
  clone.removeAttribute("contenteditable");
  clone.style.flex = "none";
  clone.style.width = bodyEl.offsetWidth + "px";
  clone.style.height = ph + "px";
  clone.style.overflow = "hidden";
  const page = document.createElement("div");
  page.className = pageClass;
  page.style.cssText = `width:${pw}px;height:${ph}px;min-height:0;overflow:hidden;box-shadow:none;background:${bg};position:relative`;
  const shell = document.createElement("div");
  shell.className = "wordBodyShell";
  shell.appendChild(clone);
  page.appendChild(shell);
  const html = new XMLSerializer().serializeToString(page);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${pw}px;height:${ph}px"><style><![CDATA[${pageCss().replace(/]]>/g, "")}]]></style>${html}</div></foreignObject></svg>`;
  if (svg.length > 30e6) return null;
  const im = await loadImg("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
  const scale = Math.min(1, targetW / pw);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(pw * scale); canvas.height = Math.round(ph * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8); // lança erro se o canvas ficar "tainted": quem chama ignora
}

// Para documentos que não estão abertos no editor: monta o corpo fora da tela só para medir/desenhar.
export async function renderWordThumbFromDoc(doc, pw, ph) {
  const pageClass = `wordPage wordPage-${doc.page_size || "a4"} wordPage-${doc.orientation || "retrato"} wordMargin-${doc.margins || "normal"}`;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-99999px;top:0;pointer-events:none;visibility:hidden";
  const page = document.createElement("div");
  page.className = pageClass;
  page.style.cssText = `width:${pw}px;box-shadow:none`;
  const shell = document.createElement("div");
  shell.className = "wordBodyShell";
  const body = document.createElement("div");
  body.className = "noteRichBody wordRichBody";
  if (doc.margin_left != null) body.style.paddingLeft = doc.margin_left + "cm";
  if (doc.margin_right != null) body.style.paddingRight = doc.margin_right + "cm";
  body.innerHTML = doc.content || "";
  shell.appendChild(body); page.appendChild(shell); host.appendChild(page);
  document.body.appendChild(host);
  try {
    await new Promise(r => requestAnimationFrame(() => r()));
    return await renderWordThumb(body, { pageClass, pw, ph });
  } finally {
    host.remove();
  }
}

// Renderiza um HTML em várias páginas (quebrando entre blocos quando possível) → lista de JPEGs.
export async function renderWordThumbPages(html, { pageClass, pw, ph, bg = "#fff", targetW = 1100, padding = null, imgSizes = null }) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-99999px;top:0;pointer-events:none;visibility:hidden";
  const page = document.createElement("div");
  page.className = pageClass;
  page.style.cssText = `width:${pw}px;height:auto;min-height:0;box-shadow:none`;
  const shell = document.createElement("div");
  shell.className = "wordBodyShell";
  const body = document.createElement("div");
  body.className = "noteRichBody wordRichBody";
  body.style.flex = "none"; body.style.width = pw + "px";
  body.innerHTML = html || "";
  if (padding) body.style.padding = padding;
  const fixStyle = document.createElement("style");
  fixStyle.textContent = ".wordRichBody img{display:block;margin-left:auto;margin-right:auto}";
  body.prepend(fixStyle);
  const imgs0 = Array.from(body.querySelectorAll("img"));
  if (imgSizes && imgSizes.length === imgs0.length) imgs0.forEach((im, i) => { im.style.maxWidth = "none"; im.style.width = imgSizes[i].w + "px"; im.style.height = imgSizes[i].h + "px"; });
  shell.appendChild(body); page.appendChild(shell); host.appendChild(page);
  document.body.appendChild(host);
  try {
    await new Promise(r => requestAnimationFrame(() => r()));
    await Promise.all(Array.from(body.querySelectorAll("img")).map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = () => r(); })));
    const cs = getComputedStyle(body);
    const padT = parseFloat(cs.paddingTop) || 0, padB = parseFloat(cs.paddingBottom) || 0;
    const usable = Math.max(100, ph - padB);
    const total = body.scrollHeight;
    // pontos de início de cada página
    const starts = [0];
    const kids = Array.from(body.children);
    for (const k of kids) {
      if (k === fixStyle) continue;
      const top = k.offsetTop, bottom = top + k.offsetHeight;
      let start = starts[starts.length - 1];
      while (bottom > start + usable + 12) {
        if (top > start + padT + 4) start = top - padT;      // quebra antes do bloco
        else start += usable - padT;                          // bloco maior que a página: corta
        starts.push(start);
        if (starts.length > 60) break;
      }
    }
    const out = [];
    const scale = Math.min(2, targetW / pw);
    for (const st of starts) {
      if (st >= total - 4 && out.length) break;
      const clone = body.cloneNode(true);
      clone.style.marginTop = (-st) + "px";
      const pg = document.createElement("div");
      pg.className = pageClass;
      pg.style.cssText = `width:${pw}px;height:${ph}px;min-height:0;overflow:hidden;box-shadow:none;background:${bg};position:relative`;
      const sh = document.createElement("div"); sh.className = "wordBodyShell"; sh.appendChild(clone); pg.appendChild(sh);
      const xml = new XMLSerializer().serializeToString(pg);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${pw}px;height:${ph}px"><style><![CDATA[${pageCss().replace(/]]>/g, "")}]]></style>${xml}</div></foreignObject></svg>`;
      const im = await loadImg("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
      const cv = document.createElement("canvas");
      cv.width = Math.round(pw * scale); cv.height = Math.round(ph * scale);
      const ctx = cv.getContext("2d");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(im, 0, 0, cv.width, cv.height);
      out.push(cv.toDataURL("image/jpeg", 0.85));
    }
    return out;
  } finally { host.remove(); }
}
