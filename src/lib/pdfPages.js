import { PDFDocument, rgb } from "pdf-lib";

const A4 = { width: 595.28, height: 841.89 }; // pt

const BG_COLORS = {
  white: rgb(1, 1, 1),
  black: rgb(0x0b / 255, 0x0b / 255, 0x0c / 255),
};
const bgColorFor = (bg) => BG_COLORS[bg] || BG_COLORS.white;

// "Criar PDF" agora só cria o documento em branco (uma página A4, na cor de
// fundo escolhida) e o coloca na estante na hora — o retangulozinho do PDF
// aparece igual a qualquer outro. As páginas de verdade entram depois,
// colando prints (Ctrl+V) ou pelo botão "Adicionar página" dentro do leitor.
export async function createBlankPdfBlob(bg = "white") {
  const doc = await PDFDocument.create();
  const page = doc.addPage([A4.width, A4.height]);
  page.drawRectangle({ x: 0, y: 0, width: A4.width, height: A4.height, color: bgColorFor(bg) });
  const bytes = await doc.save();
  return new Blob([bytes], { type: "application/pdf" });
}

// Anexa uma nova página ao final do PDF a partir de um print (colado ou
// escolhido por arquivo). Usa pdf-lib para copiar o documento existente byte
// a byte (sem re-renderizar as páginas antigas em canvas), então o texto
// selecionável e a nitidez das páginas já existentes não se perdem — só a
// página nova é que nasce como imagem, do jeito que o print entrou.
export async function appendImagePageToPdfBlob(existingBytes, dataUrl, imgWidth, imgHeight, bg = "white") {
  const doc = await PDFDocument.load(existingBytes);
  const isPng = dataUrl.startsWith("data:image/png");
  const image = isPng ? await doc.embedPng(dataUrl) : await doc.embedJpg(dataUrl);

  const margin = 24;
  const maxW = A4.width - margin * 2;
  const maxH = A4.height - margin * 2;
  const ratio = Math.min(maxW / imgWidth, maxH / imgHeight, 1) || 1;
  const w = imgWidth * ratio, h = imgHeight * ratio;
  const x = (A4.width - w) / 2, y = (A4.height - h) / 2;

  const page = doc.addPage([A4.width, A4.height]);
  page.drawRectangle({ x: 0, y: 0, width: A4.width, height: A4.height, color: bgColorFor(bg) });
  page.drawImage(image, { x, y, width: w, height: h });

  const bytes = await doc.save();
  return new Blob([bytes], { type: "application/pdf" });
}
