import assert from "node:assert/strict";
import { paginate, formatPageNumber } from "./wordPageModel.js";

const H = 100;
const para = (id, n, lh = 10, extra = {}) => ({ id, lines: Array(n).fill(lh), height: n * lh, ...extra });
const pg = (r, id) => r.pageOf(id);

// 1. tudo cabe em uma página
let r = paginate([para("a", 3), para("b", 3)], { pageHeight: H });
assert.equal(r.pageCount, 1);

// 2. parágrafo longo continua na página seguinte
r = paginate([para("a", 15)], { pageHeight: H });
assert.equal(r.pageCount, 2);
assert.equal(r.pages[0][0].to, 10);
assert.equal(r.pages[1][0].from, 10);

// 3. viúva: sobra 1 linha -> puxa 1 da página anterior (9 + 2)
r = paginate([para("a", 11)], { pageHeight: H });
assert.equal(r.pages[0][0].to, 9);
assert.equal(r.pages[1][0].to - r.pages[1][0].from, 2);

// 4. órfã: só 1 linha caberia no fim da página -> bloco inteiro vai para a próxima
r = paginate([para("x", 9), para("a", 4)], { pageHeight: H });
assert.equal(pg(r, "a"), 1);
assert.equal(r.pages[1][0].from, 0);

// 5. título junto com o próximo parágrafo
r = paginate([para("x", 9), { id: "h", height: 10, keepNext: true }, para("p", 5)], { pageHeight: H });
assert.equal(pg(r, "h"), 1);
assert.equal(pg(r, "p"), 1);

// 5b. título + parágrafo de 3 linhas (indivisível com 2/2): o título vai junto, não fica sozinho
r = paginate([para("x", 7), { id: "h", height: 10, keepNext: true }, para("p", 3)], { pageHeight: H });
assert.equal(pg(r, "h"), 1);
assert.equal(pg(r, "p"), 1);

// 6. keepTogether não divide
r = paginate([para("x", 6), para("k", 6, 10, { keepTogether: true })], { pageHeight: H });
assert.equal(pg(r, "k"), 1);
assert.equal(r.pages[1][0].to, 6);

// 7. quebra manual
r = paginate([para("a", 2), { id: "br", kind: "break" }, para("b", 2)], { pageHeight: H });
assert.equal(r.pageCount, 2);
assert.equal(pg(r, "b"), 1);

// 8. capítulo em página ímpar insere página em branco
r = paginate([para("a", 2), para("cap", 2, 10, { breakBefore: "odd" })], { pageHeight: H });
assert.equal(pg(r, "cap"), 2); // página 3 (1-based), a 2 fica em branco
assert.equal(r.pages[1].length, 0);

// 9. capítulo que já cai em página ímpar não ganha página extra
r = paginate([para("a", 2), { id: "br", kind: "break" }, para("b", 2), { id: "br2", kind: "break" }, para("cap", 2, 10, { breakBefore: "odd" })], { pageHeight: H });
assert.equal(pg(r, "cap"), 2);
assert.equal(r.pageCount, 3);

// 10. bloco indivisível maior que a página não gera laço infinito
r = paginate([{ id: "img", height: 250 }, para("a", 2)], { pageHeight: H });
assert.deepEqual(r.oversize, ["img"]);
assert.ok(pg(r, "a") >= 2);

// 11. documento longo (centenas de páginas) e estável
const big = Array.from({ length: 20000 }, (_, i) => para("p" + i, 1 + (i % 7)));
const t0 = performance.now();
r = paginate(big, { pageHeight: 900 });
const ms = performance.now() - t0;
assert.ok(r.pageCount > 300, "esperava centenas de páginas: " + r.pageCount);
for (const pgItems of r.pages) assert.ok(pgItems.reduce((a, x) => a + x.height, 0) <= 900 + 1e-9);

// 12. numeração
assert.equal(formatPageNumber(0, { fmt: "lower-roman" }), "i");
assert.equal(formatPageNumber(3, { fmt: "upper-roman" }), "IV");
assert.equal(formatPageNumber(0, { start: 5 }), "5");

console.log(`OK — 12 grupos de testes; ${r.pageCount} páginas em ${ms.toFixed(1)} ms`);
