import assert from "node:assert/strict";
import { buildPageLabeler, formatNumber } from "../src/lib/wordSections.js";
// Capa (sem número) | Prefácio em romano | Capítulos reiniciando em 1
const L = buildPageLabeler([
  { startPage: 0, hide: true },                                   // capa
  { startPage: 1, fmt: "lower-roman", restart: true, start: 1 },  // prefácio e sumário: i, ii
  { startPage: 3, fmt: "decimal", restart: true, start: 1 },      // capítulo 1 = página 1
], 8);
assert.equal(L.at(0).hidden, true);
assert.deepEqual([1, 2].map(p => L.at(p).label), ["i", "ii"]);
assert.deepEqual([3, 4, 7].map(p => L.at(p).label), ["1", "2", "5"]);
assert.equal(L.at(3).hidden, false);
// continuar numeração da seção anterior (sem reiniciar)
const C = buildPageLabeler([{ startPage: 0 }, { startPage: 2 }, { startPage: 4, fmt: "upper-roman" }], 6);
assert.deepEqual([0, 1, 2, 3].map(p => C.at(p).label), ["1", "2", "3", "4"]);
assert.deepEqual([4, 5].map(p => C.at(p).label), ["V", "VI"]);
// primeira seção começando em outro número (como o documento inteiro hoje)
assert.equal(buildPageLabeler([{ startPage: 0, start: 5 }], 3).at(2).label, "7");
// sem seções informadas e páginas além do total
assert.equal(buildPageLabeler([], 3).at(1).label, "2");
assert.equal(buildPageLabeler([{ startPage: 0 }]).at(40).label, "41");
assert.equal(formatNumber(14, "upper-roman"), "XIV");
console.log("OK wordSections");
