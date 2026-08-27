import { PDFDocument, rgb } from "pdf-lib";

const A4 = { width: 595.28, height: 841.89 }; // pt

const BG_COLORS = {
  white: rgb(1, 1, 1),
  black: rgb(0x0b / 255, 0x0b / 255, 0x0c / 255),
};
const bgColorFor = (bg) => BG_COLORS[bg] || BG_COLORS.white;

// "Criar PDF" agora só cria o documento em branco (uma página A4, na cor de
// fundo escolhida) e o coloca na estante na hora — o retangulozinho do PDF
// aparece igual a qualquer outro. As páginas de verdade entram depois, dentro
// do próprio leitor (desenho, marca-texto, imagens inseridas como anotação).
export async function createBlankPdfBlob(bg = "white") {
  const doc = await PDFDocument.create();
  const page = doc.addPage([A4.width, A4.height]);
  page.drawRectangle({ x: 0, y: 0, width: A4.width, height: A4.height, color: bgColorFor(bg) });
  const bytes = await doc.save();
  return new Blob([bytes], { type: "application/pdf" });
}
