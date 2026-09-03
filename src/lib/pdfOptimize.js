// Otimização "lossless" de PDF: recomprime a estrutura interna do arquivo
// (object streams) sem tocar em nenhum pixel de imagem ou glifo de texto —
// o PDF resultante é visualmente idêntico ao original, só ocupa menos
// espaço no Storage. Não faz nada com imagens embutidas (isso exigiria
// decidir por PDF se vale re-rasterizar, o que pode piorar PDF de texto
// nativo) — fica pra uma etapa futura, opcional, só pra PDF escaneado.
import { PDFDocument } from "pdf-lib";

// Recebe um Blob/File de PDF e devolve um Blob otimizado SÓ se ele ficar
// menor que o original; caso contrário devolve null (sinal de "não valeu
// a pena, mantenha o original"). Nunca lança pra quem chama — se o PDF
// for inválido ou vier de um jeito que o pdf-lib não entende, só desiste.
export async function optimizePdfBlob(blob) {
  if (!blob || blob.size === 0) return null;
  try {
    const bytes = await blob.arrayBuffer();
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const out = await doc.save({ useObjectStreams: true });
    if (out.byteLength >= blob.size) return null;
    return new Blob([out], { type: "application/pdf" });
  } catch (e) {
    console.warn("[pdfOptimize] não deu pra otimizar este PDF:", e);
    return null;
  }
}
