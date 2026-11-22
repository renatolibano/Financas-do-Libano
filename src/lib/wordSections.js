// Seções do Word do Líbano: numeração de páginas por seção (formato, reinício, ocultar), sem DOM.
// Uma quebra de seção guarda as propriedades da seção que COMEÇA depois dela (data-pgfmt, data-pgrestart, data-pgstart, data-pghide);
// a primeira seção usa as do documento (booklayout: pgfmt, pgstart, pghide).
//
// sections: [{ startPage, fmt, restart, start, hide }] em ordem de página (a primeira com startPage 0)
//   fmt: "" = igual à seção anterior | "decimal" | "lower-roman" | "upper-roman"
//   restart: reinicia a numeração em `start` (padrão 1); senão continua a da seção anterior
//   hide: não mostra número de página nas páginas da seção

const ROMAN = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
export function toRoman(n) { let r = ""; for (const [v, s] of ROMAN) while (n >= v) { r += s; n -= v; } return r; }

export function formatNumber(n, fmt) {
  if (fmt === "lower-roman") return toRoman(Math.max(1, n)).toLowerCase();
  if (fmt === "upper-roman") return toRoman(Math.max(1, n));
  return String(n);
}

// Devolve { at(pageIdx0) => { number, label, hidden, section }, sections } com a numeração já resolvida seção a seção.
export function buildPageLabeler(sections, totalPages = Infinity) {
  const secs = (sections && sections.length ? sections : [{ startPage: 0 }])
    .map((s, i) => ({ fmt: "", restart: false, start: 1, hide: false, ...s, startPage: i === 0 ? 0 : Math.max(0, Number(s.startPage) || 0) }))
    .sort((a, b) => a.startPage - b.startPage);
  secs[0].startPage = 0;
  let curFmt = "decimal";
  let nextNumber = 1;
  const resolved = secs.map((s, i) => {
    const endPage = i + 1 < secs.length ? secs[i + 1].startPage : totalPages;
    if (s.fmt) curFmt = s.fmt;
    const first = i === 0 ? (Number(s.start) || 1) : s.restart ? (Number(s.start) || 1) : nextNumber;
    const len = Number.isFinite(endPage) ? Math.max(0, endPage - s.startPage) : 0;
    nextNumber = first + len;
    return { ...s, fmt: curFmt, firstNumber: first, endPage };
  });
  const sectionAt = (p) => { let k = 0; for (let i = 0; i < resolved.length; i++) if (resolved[i].startPage <= p) k = i; return k; };
  return {
    sections: resolved,
    at(p) {
      const k = sectionAt(Math.max(0, p));
      const s = resolved[k];
      const number = s.firstNumber + (Math.max(0, p) - s.startPage);
      return { number, label: formatNumber(number, s.fmt), hidden: !!s.hide, section: k };
    },
  };
}
