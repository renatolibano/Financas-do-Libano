// Modelo de páginas do Word do Líbano (sem DOM — recebe alturas medidas e devolve a divisão em páginas).
// Uma única função decide a paginação; tela, sumário, PDF e impressão devem consumir o mesmo resultado.
//
// bloco = {
//   id,                       // identificador estável (ex.: data-bid do elemento)
//   height,                   // altura total em px, já com margens
//   lines?,                   // number[]: altura de cada linha (só em parágrafos que podem ser divididos)
//   keepTogether?,            // não dividir entre páginas
//   keepNext?,                // manter junto com o bloco seguinte (títulos)
//   widowControl?,            // padrão true: mínimo de 2 linhas em cada página
//   breakBefore?,             // true | "next" | "odd" | "even": começa em nova página (capítulo)
//   pageBreakAfter?,          // quebra manual depois do bloco
//   kind?,                    // "break" = quebra manual como bloco próprio (altura ignorada)
// }
// opções = { pageHeight, minLines = 2 }

export function paginate(blocks, { pageHeight, minLines = 2 } = {}) {
  if (!(pageHeight > 0)) throw new Error("pageHeight inválida");
  const pages = [[]];
  const used = [0];
  const where = new Map(); // id -> primeira página (0-based)
  const oversize = [];
  let p = 0;

  const newPage = () => { pages.push([]); used.push(0); p++; };
  const ensureParity = (parity) => { // parity: "odd" => página 1-based ímpar
    const wantOdd = parity === "odd";
    if (((p + 1) % 2 === 1) !== wantOdd) { // página em branco para acertar a paridade
      newPage();
    }
  };
  const startFresh = (parity) => {
    if (used[p] > 0 || pages[p].length) newPage();
    if (parity === "odd" || parity === "even") ensureParity(parity);
  };
  const place = (b, from, to, h) => {
    if (!where.has(b.id)) where.set(b.id, p);
    pages[p].push({ id: b.id, from, to, offset: used[p], height: h });
    used[p] += h;
  };
  const room = () => pageHeight - used[p];

  // Altura mínima que precisa caber na página atual para começar um bloco.
  // Parágrafo divisível: as primeiras minLines linhas — mas se ele tem menos de 2*minLines linhas não pode ser dividido
  // sem criar viúva/órfã, então precisa caber inteiro.
  const headNeed = (b) => {
    if (b.lines && !b.keepTogether) {
      if (b.widowControl === false) return b.lines[0] || b.height;
      if (b.lines.length < 2 * minLines) return b.height;
      return b.lines.slice(0, minLines).reduce((a, x) => a + x, 0);
    }
    return b.height;
  };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === "break") { startFresh(b.breakBefore); where.set(b.id, p); continue; }
    if (b.breakBefore) startFresh(b.breakBefore === "odd" || b.breakBefore === "even" ? b.breakBefore : null);

    // título (keepNext) : precisa caber junto com o começo do próximo bloco
    if (b.keepNext && i + 1 < blocks.length && blocks[i + 1].kind !== "break") {
      const chain = [b];
      let j = i + 1;
      while (chain[chain.length - 1].keepNext && j < blocks.length && blocks[j].kind !== "break") { chain.push(blocks[j]); j++; }
      const last = chain[chain.length - 1];
      const need = chain.slice(0, -1).reduce((a, x) => a + x.height, 0) + headNeed(last);
      if (need <= pageHeight && need > room() && used[p] > 0) newPage();
    }

    const h = b.height;
    if (h <= room()) { place(b, 0, b.lines ? b.lines.length : null, h); }
    else if (b.lines && !b.keepTogether && b.lines.length > 1) {
      // divide por linhas, respeitando viúvas/órfãs
      let start = 0;
      const total = b.lines.length;
      let safety = total + 5;
      while (start < total && safety-- > 0) {
        let n = 0, acc = 0;
        while (start + n < total && acc + b.lines[start + n] <= room()) { acc += b.lines[start + n]; n++; }
        const left = total - start - n;
        if (left === 0) { place(b, start, total, acc); start = total; break; }
        if (b.widowControl !== false) {
          if (n < minLines && start === 0) n = 0;                                  // órfã: nada fica nesta página
          else if (left < minLines) n = Math.max(0, n - (minLines - left));        // viúva: puxa linhas para a próxima
          if (n > 0 && n < minLines && start === 0) n = 0;
        }
        if (n === 0) {
          if (used[p] === 0) n = 1; // página vazia e nada coube: força 1 linha para evitar laço infinito
          else { newPage(); continue; }
        }
        const hh = b.lines.slice(start, start + n).reduce((a, x) => a + x, 0);
        place(b, start, start + n, hh);
        start += n;
        newPage();
      }
    } else if (h > pageHeight) {
      // bloco indivisível maior que a página (imagem/tabela alta): começa no topo e ocupa o que precisar
      if (used[p] > 0) newPage();
      place(b, 0, null, h);
      oversize.push(b.id);
      const extra = Math.ceil(h / pageHeight) - 1;
      used[p] = pageHeight; // fecha a página atual
      for (let k = 0; k < extra; k++) newPage(), used[p] = pageHeight;
    } else {
      newPage();
      place(b, 0, b.lines ? b.lines.length : null, h);
    }
    if (b.pageBreakAfter) newPage();
  }
  // não deixa página final vazia por causa de uma quebra no fim
  while (pages.length > 1 && pages[pages.length - 1].length === 0 && used[used.length - 1] === 0) { pages.pop(); used.pop(); }
  return { pages, pageCount: pages.length, used, where, oversize, pageOf: (id) => where.get(id) };
}

const ROMAN = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
export function toRoman(n) { let r = ""; for (const [v, s] of ROMAN) while (n >= v) { r += s; n -= v; } return r; }

// Rótulo de página: fmt "" | "lower-roman" | "upper-roman"; start = número da 1ª página da seção.
export function formatPageNumber(index0, { fmt = "", start = 1 } = {}) {
  const n = index0 + (Number(start) || 1);
  if (fmt === "lower-roman") return toRoman(n).toLowerCase();
  if (fmt === "upper-roman") return toRoman(n);
  return String(n);
}
