// Converte um arquivo (PDF, .docx, .odt, .rtf, .html, .md, .txt, .tex) em imagens de página (JPEG),
// para inserir no editor "Word" como figura. Tudo local, sem rede.
import { renderWordThumbPages } from "./wordThumb";

export const FILE_AS_IMAGE_ACCEPT = "image/*,.pdf,.docx,.odt,.rtf,.html,.htm,.md,.markdown,.txt,.tex,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text";
const MAX_PAGES = 40;

export const isImageFile = (f) => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(f.name);

async function pdfToImages(file, outW) {
  const { pdfjsLib, pdfWasmUrl } = await import("./pdf");
  const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer(), wasmUrl: pdfWasmUrl }).promise;
  const out = [];
  try {
    const n = Math.min(doc.numPages, MAX_PAGES);
    for (let p = 1; p <= n; p++) {
      const page = await doc.getPage(p);
      const v1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: outW / v1.width });
      const cv = document.createElement("canvas");
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      out.push(cv.toDataURL("image/jpeg", 0.85));
      page.cleanup?.();
      cv.width = cv.height = 0;
    }
  } finally { doc.destroy?.(); }
  return out;
}

// pageInfo: { pageClass, pw, ph } da página aberta no editor.
export async function fileToPageImages(file, pageInfo, outW = 1100) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf" || file.type === "application/pdf") return pdfToImages(file, outW);
  const { importWordFile } = await import("./wordFormats");
  const { html } = await importWordFile(file);
  const extra = ext === "docx" ? await docxLayout(file).catch(() => null) : null; // tamanho da página, margens e das figuras do próprio .docx
  const pages = await renderWordThumbPages(html, { ...pageInfo, ...(extra || {}), targetW: outW });
  return pages.slice(0, MAX_PAGES);
}

// Lê do .docx o tamanho da página (pgSz), as margens (pgMar) e o tamanho de cada figura (wp:extent), em px (96 dpi).
async function docxLayout(file) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file("word/document.xml").async("string");
  const d = new DOMParser().parseFromString(xml, "application/xml");
  const tw = (v) => Math.round((parseFloat(v) || 0) / 1440 * 96);
  const sects = d.getElementsByTagName("w:sectPr");
  const sp = sects[sects.length - 1];
  const out = {};
  const sz = sp?.getElementsByTagName("w:pgSz")[0], mg = sp?.getElementsByTagName("w:pgMar")[0];
  if (sz) {
    let w = tw(sz.getAttribute("w:w")), h = tw(sz.getAttribute("w:h"));
    if (sz.getAttribute("w:orient") === "landscape" && h > w) [w, h] = [h, w];
    if (w > 100 && h > 100) { out.pw = w; out.ph = h; }
  }
  if (mg) out.padding = `${tw(mg.getAttribute("w:top"))}px ${tw(mg.getAttribute("w:right"))}px ${tw(mg.getAttribute("w:bottom"))}px ${tw(mg.getAttribute("w:left"))}px`;
  const sizes = [];
  for (const dr of Array.from(d.getElementsByTagName("w:drawing"))) {
    if (!dr.getElementsByTagName("a:blip")[0]) continue;
    const ex = dr.getElementsByTagName("wp:extent")[0];
    if (ex) sizes.push({ w: Math.round(parseFloat(ex.getAttribute("cx")) / 9525), h: Math.round(parseFloat(ex.getAttribute("cy")) / 9525) });
  }
  if (sizes.length) out.imgSizes = sizes;
  return out;
}
