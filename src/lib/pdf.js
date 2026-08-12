import * as pdfjsLib from "pdfjs-dist";

// Aponta o worker do pdf.js pro arquivo que vem junto do pacote.
// Esse jeito (new URL + import.meta.url) é o que funciona de forma confiável com o Vite.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export { pdfjsLib };
