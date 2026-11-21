import { pdfjsLib } from "./pdf";

// Imagens de uma página do PDF para o Modo leitura (estilo Kindle).
// Percorre a lista de operações da página acompanhando a matriz de transformação para saber onde cada imagem foi
// desenhada, decodifica as imagens (processamento 100% local) e devolve JPEGs reduzidos, de cima para baixo.
// Ignora ícones/filetes pequenos e imagens que cobrem a página inteira (fundo ou página escaneada).
// Retorna [{ src, w, h, yTop }]: w/h = tamanho natural em px; yTop = topo da imagem em coordenadas do PDF (y cresce para cima).
const MAX_SIDE = 1400;

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

function toCanvas(img) {
  const w = img.width, h = img.height;
  if (!w || !h) return null;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); // JPEG não tem transparência
  if (img.bitmap) { ctx.drawImage(img.bitmap, 0, 0, c.width, c.height); return c; }
  if (!img.data) return null;
  const src = document.createElement("canvas");
  src.width = w; src.height = h;
  const sctx = src.getContext("2d");
  const out = sctx.createImageData(w, h);
  const d = img.data, o = out.data;
  if (img.kind === 3 || d.length >= w * h * 4) { o.set(d.subarray ? d.subarray(0, w * h * 4) : d); }
  else if (img.kind === 2 || d.length >= w * h * 3) { for (let i = 0, j = 0; i < w * h; i++, j += 3) { o[i * 4] = d[j]; o[i * 4 + 1] = d[j + 1]; o[i * 4 + 2] = d[j + 2]; o[i * 4 + 3] = 255; } }
  else { // 1 bit por pixel
    const stride = (w + 7) >> 3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = (d[y * stride + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0; const i = (y * w + x) * 4; o[i] = o[i + 1] = o[i + 2] = v; o[i + 3] = 255; }
  }
  sctx.putImageData(out, 0, 0);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const getObj = (page, id) => new Promise((resolve) => {
  try {
    const store = typeof id === "string" && id.startsWith("g_") ? page.commonObjs : page.objs;
    if (store.has(id)) { resolve(store.get(id)); return; }
    store.get(id, resolve);
    setTimeout(() => resolve(null), 4000);
  } catch { resolve(null); }
});

export async function pageImagesForReflow(page, { maxImages = 12, minPt = 40 } = {}) {
  const OPS = pdfjsLib.OPS;
  const vp = page.getViewport({ scale: 1 });
  const pageArea = vp.width * vp.height;
  const list = await page.getOperatorList();
  const found = [];
  const seen = new Set();
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  for (let i = 0; i < list.fnArray.length && found.length < maxImages * 2; i++) {
    const fn = list.fnArray[i], args = list.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) { if (stack.length) ctm = stack.pop(); }
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (args && args[0]) ctm = mul(ctm, args[0]); }
    else if (fn === OPS.paintFormXObjectEnd) { if (stack.length) ctm = stack.pop(); }
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const wPt = Math.hypot(ctm[0], ctm[1]), hPt = Math.hypot(ctm[2], ctm[3]);
      if (wPt < minPt || hPt < minPt || wPt * hPt > pageArea * 0.9) continue;
      const yTop = ctm[5] + Math.max(0, ctm[3]) + Math.max(0, ctm[1]);
      const key = fn === OPS.paintImageXObject ? args[0] + "@" + Math.round(yTop) : null;
      if (key) { if (seen.has(key)) continue; seen.add(key); }
      found.push({ ref: fn === OPS.paintImageXObject ? args[0] : null, inline: fn === OPS.paintInlineImageXObject ? args[0] : null, yTop });
    }
  }
  found.sort((a, b) => b.yTop - a.yTop);
  const out = [];
  for (const f of found) {
    if (out.length >= maxImages) break;
    try {
      const obj = f.inline || (await getObj(page, f.ref));
      if (!obj) continue;
      const c = toCanvas(obj);
      if (!c) continue;
      out.push({ src: c.toDataURL("image/jpeg", 0.82), w: c.width, h: c.height, yTop: f.yTop });
    } catch { /* imagem não decodificável: segue sem ela */ }
  }
  return out;
}
