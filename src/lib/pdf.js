import * as pdfjsLib from "pdfjs-dist";

// Aponta o worker do pdf.js pro arquivo que vem junto do pacote.
// Esse jeito (new URL + import.meta.url) é o que funciona de forma confiável com o Vite.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// A partir do pdfjs-dist 5/6, os decodificadores de imagens bilevel (fax/
// CCITT — usado nos desenhos de provas escaneadas — e também JBIG2/OpenJPEG)
// rodam em WebAssembly e exigem esse "wasmUrl" apontando pra pasta com os
// .wasm. Sem isso, o pdf.js falha ao decodificar essas imagens e as descarta
// da página em silêncio (só um aviso no console), enquanto o resto da página
// renderiza normal — sintoma: "sumiu só o desenho".
// Os arquivos ficam em public/pdf-wasm (copiados de node_modules/pdfjs-dist/
// wasm pelo script scripts/copy-pdf-wasm.mjs, que roda sozinho após
// "npm install" — ver "postinstall" no package.json).
export const pdfWasmUrl = new URL("/pdf-wasm/", window.location.origin).toString();

export { pdfjsLib };
