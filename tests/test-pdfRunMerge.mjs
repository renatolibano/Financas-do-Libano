import assert from "node:assert/strict";
import { mergeRuns } from "../src/lib/pdfRunMerge.js";
const it = (str, x, w, y = 100) => ({ str, x, y, size: 12, ang: 0, w, font: "f1" });
// saída real do pdf.js para uma linha de tabela: itens de espaço com largura enorme entre as células
let r = mergeRuns([it("01", 50, 13), it(" ", 63, 108), it("20/05 a 02/06/2025", 171, 103), it(" ", 275, 72), it("Periodo de Inscricoes.", 347, 119)]);
assert.deepEqual(r.map(x => [x.text, x.x]), [["01", 50], ["20/05 a 02/06/2025", 171], ["Periodo de Inscricoes.", 347]]);
// palavras de uma frase continuam juntas (espaço normal e espaço de texto justificado)
r = mergeRuns([it("Divulgacao", 10, 60), it(" ", 70, 3.5), it("da", 73.5, 14), it(" ", 87.5, 6), it("relacao", 93.5, 40)]);
assert.equal(r.length, 1); assert.equal(r[0].text, "Divulgacao da relacao");
// linhas diferentes não se juntam
r = mergeRuns([it("A partir de", 10, 60, 100), it("27/05/2025", 10, 55, 114)]);
assert.equal(r.length, 2);
// só espaços não vira trecho
assert.equal(mergeRuns([it(" ", 10, 4)]).length, 0);
console.log("OK pdfRunMerge");
