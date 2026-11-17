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
  const pages = await renderWordThumbPages(html, { ...pageInfo, targetW: outW });
  return pages.slice(0, MAX_PAGES);
}
