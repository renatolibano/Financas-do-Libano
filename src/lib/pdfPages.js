import { PDFDocument } from "pdf-lib";

const A4 = { width: 595.28, height: 841.89 }; // pt

// "Criar PDF" agora só cria o documento em branco (uma página A4 vazia) e o
// coloca na estante na hora — o retangulozinho do PDF aparece igual a
// qualquer outro. As páginas de verdade entram depois, colando prints
// (Ctrl+V) dentro do próprio leitor.
export async function createBlankPdfBlob() {
  const doc = await PDFDocument.create();
  doc.addPage([A4.width, A4.height]);
  const bytes = await doc.save();
  return new Blob([bytes], { type: "application/pdf" });
}

// Anexa uma nova página ao final do PDF a partir de um print colado.
// Usa pdf-lib para copiar o documento existente byte a byte (sem
// re-renderizar as páginas antigas em canvas), então o texto selecionável e
// a nitidez das páginas já existentes não se perdem — só a página nova é
// que nasce como imagem, do jeito que o print entrou.
export async function appendImagePageToPdfBlob(existingBytes, dataUrl, imgWidth, imgHeight) {
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
  page.drawImage(image, { x, y, width: w, height: h });

  const bytes = await doc.save();
  return new Blob([bytes], { type: "application/pdf" });
}
