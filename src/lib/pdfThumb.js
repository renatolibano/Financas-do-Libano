// Gera a capa (miniatura da página 1) de um PDF já carregado em memória
// (um PDFDocumentProxy do pdf.js), sem precisar baixar o arquivo de novo.
//
// Por quê: antes, a capa de cada livro/PDF na estante era gerada baixando o
// arquivo inteiro do Supabase Storage toda vez que não havia cópia em cache
// local — isso é o maior consumidor de egress do plano gratuito, já que
// cresce com o número de PDFs na estante, e não só com quantos são realmente
// abertos pra leitura. Agora a capa é gerada uma única vez (no upload, quando
// o PDF já está na memória por outro motivo, ou na primeira vez que falta pra
// um item antigo) e guardada como um JPEG pequeno direto na linha do banco
// (coluna cover_thumb) — a estante passa a só carregar esse JPEG leve, nunca
// mais o PDF inteiro, em qualquer aparelho.
export async function renderCoverThumbFromDoc(pdfDoc, targetWidth = 260) {
  const page = await pdfDoc.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const scale = (targetWidth * dpr) / baseViewport.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.85);
}
