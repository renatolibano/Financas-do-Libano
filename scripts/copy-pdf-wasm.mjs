// Copia os arquivos .wasm dos decodificadores do pdf.js (JBIG2/CCITT, OpenJPEG
// etc.) de node_modules pra public/, pra serem servidos como arquivo estático
// e apontados pelo wasmUrl em src/lib/pdf.js. Sem isso, imagens em preto-e-
// branco compactadas em fax/CCITT (comuns em provas escaneadas) somem da
// página silenciosamente — o pdf.js só ignora a imagem e loga um aviso.
// Roda sozinho depois de "npm install" (ver "postinstall" no package.json),
// então nunca precisa fazer isso manualmente nem versionar a pasta copiada.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, "../node_modules/pdfjs-dist/wasm");
const dest = path.resolve(__dirname, "../public/pdf-wasm");

if (!existsSync(src)) {
  console.warn("[copy-pdf-wasm] node_modules/pdfjs-dist/wasm não encontrado — pulei a cópia.");
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("[copy-pdf-wasm] Copiado node_modules/pdfjs-dist/wasm -> public/pdf-wasm");
