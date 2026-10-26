// Estilos de citação e bibliografia do editor "Word".
// Port de wordcraft: crates/engine/src/cmd/citations.rs (tabela STYLES, authors, name_list,
// fill_segment/render, cite, entry). O ABNT continua sendo tratado em main.jsx (não existe no
// WordCraft); aqui ficam os outros 12 estilos, guiados por dados (modelos de entrada).
//
// Modelo de entrada: {n} {names} {year} {title} {city} {publisher} {pub} (cidade: editora)
// {journal} {volume} {pages} {url} {type}. O texto entre ⟦ e ⟧ é omitido quando algum campo
// dentro dele está vazio, e um ponto final nunca se duplica.

const names = (first, rest, sep, two, last, extra = {}) => ({ first, rest, sep, two, last, max: 0, etAl: "", ...extra });

const GOST_BOOK = "{n}. ⟦{names} ⟧{title}. –⟦ {city} :⟧⟦ {publisher},⟧ {year}.⟦ – URL: {url}.⟧";
const GOST_ARTICLE = "{n}. ⟦{names} ⟧{title} // {journal}. – {year}.⟦ – Vol. {volume}.⟧⟦ – P. {pages}.⟧⟦ – URL: {url}.⟧";
const AUTHOR_DATE = { kind: "authorDate", yearSep: " ", pagesSep: ", p. " };

export const CITE_STYLES = [
  { key: "apa", name: "APA", cite: { kind: "authorDate", yearSep: ", ", pagesSep: ", p. " }, and: "&", etAlFrom: 3, order: "author", names: names("LastInitials", "LastInitials", ", ", ", & ", ", & "),
    book: "⟦{names} ⟧({year}). {title}.⟦ {publisher}.⟧⟦ {url}⟧", article: "⟦{names} ⟧({year}). {title}. {journal}⟦, {volume}⟧⟦, {pages}⟧.⟦ {url}⟧", bibTitle: "Referências" },
  { key: "chicago", name: "Chicago", cite: { kind: "authorDate", yearSep: " ", pagesSep: ", " }, and: "and", etAlFrom: 3, order: "author", names: names("LastFirst", "FirstLast", ", ", ", and ", ", and "),
    book: "⟦{names}. ⟧{year}. {title}.⟦ {pub}.⟧⟦ {url}⟧", article: "⟦{names}. ⟧{year}. {title}. {journal}⟦, {volume}⟧⟦, {pages}⟧.⟦ {url}⟧", bibTitle: "Referências" },
  { key: "gb", name: "GB/T 7714", cite: { kind: "number", open: "[", close: "]", pagesSep: ", " }, and: "and", etAlFrom: 3, order: "cited",
    names: names("UpperLastBareInitials", "UpperLastBareInitials", ", ", ", ", ", ", { max: 3, etAl: ", et al." }),
    book: "[{n}] ⟦{names}. ⟧{title}[{type}].⟦ {pub},⟧ {year}.⟦ {url}.⟧", article: "[{n}] ⟦{names}. ⟧{title}[{type}]. {journal}, {year}⟦, {volume}⟧⟦: {pages}⟧.⟦ {url}.⟧", bibTitle: "Referências" },
  { key: "gostname", name: "GOST (ordem por nome)", cite: { kind: "number", open: "[", close: "]", pagesSep: ", p. " }, and: "and", etAlFrom: 3, order: "author",
    names: names("LastSpaceInitials", "LastSpaceInitials", ", ", ", ", ", "), book: GOST_BOOK, article: GOST_ARTICLE, bibTitle: "Referências" },
  { key: "gosttitle", name: "GOST (ordem por título)", cite: { kind: "number", open: "[", close: "]", pagesSep: ", p. " }, and: "and", etAlFrom: 3, order: "title",
    names: names("LastSpaceInitials", "LastSpaceInitials", ", ", ", ", ", "), book: GOST_BOOK, article: GOST_ARTICLE, bibTitle: "Referências" },
  { key: "harvard", name: "Harvard (Anglia)", cite: { kind: "authorDate", yearSep: ", ", pagesSep: ", p. " }, and: "and", etAlFrom: 4, order: "author",
    names: names("LastInitials", "LastInitials", ", ", " and ", " and "),
    book: "⟦{names}, ⟧{year}. {title}.⟦ {pub}.⟧⟦ Available at: <{url}>.⟧", article: "⟦{names}, ⟧{year}. {title}. {journal}⟦, {volume}⟧⟦, pp. {pages}⟧.⟦ Available at: <{url}>.⟧", bibTitle: "Referências" },
  { key: "ieee", name: "IEEE", cite: { kind: "number", open: "[", close: "]", pagesSep: null }, and: "and", etAlFrom: 3, order: "cited",
    names: names("InitialsLast", "InitialsLast", ", ", ", ", ", "),
    book: "[{n}] ⟦{names}, ⟧“{title},”⟦ {pub},⟧ {year}.⟦ {url}⟧", article: "[{n}] ⟦{names}, ⟧“{title},” {journal}⟦, {volume}⟧⟦, {pages}⟧, {year}.⟦ {url}⟧", bibTitle: "Referências" },
  { key: "iso690", name: "ISO 690 (autor-data)", cite: AUTHOR_DATE, and: "and", etAlFrom: 4, order: "author",
    names: names("UpperLastFirst", "UpperLastFirst", ", ", " and ", " and "),
    book: "⟦{names}, ⟧{year}. {title}.⟦ {pub}.⟧⟦ Available from: {url}⟧", article: "⟦{names}, ⟧{year}. {title}. {journal}⟦, {volume}⟧⟦, {pages}⟧.⟦ Available from: {url}⟧", bibTitle: "Referências" },
  { key: "iso690num", name: "ISO 690 (numérico)", cite: { kind: "number", open: "(", close: ")", pagesSep: ", p. " }, and: "and", etAlFrom: 4, order: "cited",
    names: names("UpperLastFirst", "UpperLastFirst", ", ", " and ", " and "),
    book: "{n}. ⟦{names}. ⟧{title}.⟦ {pub},⟧ {year}.⟦ Available from: {url}⟧", article: "{n}. ⟦{names}. ⟧{title}. {journal}. {year}⟦, {volume}⟧⟦, {pages}⟧.⟦ Available from: {url}⟧", bibTitle: "Referências" },
  { key: "mla", name: "MLA", cite: { kind: "authorPage" }, and: "and", etAlFrom: 3, order: "author",
    names: names("LastFirst", "LastFirst", ", ", ", ", ", ", { max: 1, etAl: ", et al." }),
    book: "⟦{names}. ⟧“{title}.”⟦ {publisher},⟧ {year}.⟦ {url}⟧", article: "⟦{names}. ⟧“{title}.” {journal}⟦, {volume}⟧⟦, {pages}⟧, {year}.⟦ {url}⟧", bibTitle: "Obras Citadas" },
  { key: "sist02", name: "SIST02", cite: { kind: "number", open: "(", close: ")", pagesSep: ", p. " }, and: "and", etAlFrom: 3, order: "cited",
    names: names("LastFirst", "LastFirst", "; ", "; ", "; "),
    book: "{n}) ⟦{names}. ⟧{title}.⟦ {city},⟧⟦ {publisher},⟧ {year}.⟦ {url}⟧", article: "{n}) ⟦{names}. ⟧{title}. {journal}. {year}⟦, vol. {volume}⟧⟦, p. {pages}⟧.⟦ {url}⟧", bibTitle: "Referências" },
  { key: "turabian", name: "Turabian", cite: { kind: "authorDate", yearSep: " ", pagesSep: ", " }, and: "and", etAlFrom: 4, order: "author",
    names: names("LastFirst", "FirstLast", ", ", ", and ", ", and "),
    book: "⟦{names}. ⟧{title}.⟦ {pub},⟧ {year}.⟦ {url}.⟧", article: "⟦{names}. ⟧“{title}.” {journal}⟦ {volume}⟧ ({year})⟦: {pages}⟧.⟦ {url}.⟧", bibTitle: "Bibliografia" },
];

export const findCiteStyle = (key) => CITE_STYLES.find((s) => s.key === key) || null;

// "Sobrenome, Nome; Outro, Nome" ou "Nome Sobrenome" -> [[sobrenome, nome], ...]
export function parseAuthors(a) {
  return String(a || "").split(";").map((x) => x.trim()).filter(Boolean).map((x) => {
    const c = x.indexOf(",");
    if (c >= 0) return [x.slice(0, c).trim(), x.slice(c + 1).trim()];
    const sp = x.lastIndexOf(" ");
    return sp >= 0 ? [x.slice(sp + 1).trim(), x.slice(0, sp).trim()] : [x, ""];
  });
}

function initials(first, dots) {
  const sep = dots ? ". " : " ";
  let out = first.split(/\s+/).filter(Boolean).map((w) => Array.from(w)[0]).join(sep);
  if (dots && out) out += ".";
  return out;
}

function fmtName(form, last, first) {
  const join = (a, sep, b) => (!a || !b ? a + b : a + sep + b);
  switch (form) {
    case "LastFirst": return join(last, ", ", first);
    case "FirstLast": return join(first, " ", last);
    case "LastInitials": return join(last, ", ", initials(first, true));
    case "InitialsLast": return join(initials(first, true), " ", last);
    case "LastSpaceInitials": return join(last, " ", initials(first, true));
    case "UpperLastFirst": return join(last.toUpperCase(), ", ", first);
    case "UpperLastBareInitials": return join(last.toUpperCase(), " ", initials(first, false));
    default: return join(last, ", ", first);
  }
}

function nameList(au, f) {
  const shown = f.max > 0 ? au.slice(0, f.max) : au;
  const parts = shown.map(([l, fi], i) => fmtName(i === 0 ? f.first : f.rest, l, fi));
  let out;
  if (parts.length === 0) out = "";
  else if (parts.length === 1) out = parts[0];
  else if (parts.length === 2) out = parts[0] + f.two + parts[1];
  else out = parts.slice(0, -1).join(f.sep) + f.last + parts[parts.length - 1];
  if (shown.length < au.length) out += f.etAl;
  return out;
}

// Acrescenta `s`, descartando o ponto inicial quando `out` já termina em ponto ("M." + ". ").
const pushText = (out, s) => (s.startsWith(".") && out.endsWith(".") ? out + s.slice(1) : out + s);

function fillSegment(seg, field, optional) {
  let out = "", rest = seg;
  for (;;) {
    const i = rest.indexOf("{");
    if (i < 0) break;
    out = pushText(out, rest.slice(0, i));
    const after = rest.slice(i + 1);
    const j = after.indexOf("}");
    if (j < 0) return pushText(out, after);
    const value = field(after.slice(0, j));
    if (value === "" && optional) return null;
    out = pushText(out, value);
    rest = after.slice(j + 1);
  }
  return pushText(out, rest);
}

function render(template, field) {
  let out = "", rest = template;
  while (rest) {
    let seg, optional, after;
    if (rest.startsWith("⟦")) {
      const g = rest.slice(1), k = g.indexOf("⟧");
      optional = true;
      if (k >= 0) { seg = g.slice(0, k); after = g.slice(k + 1); } else { seg = g; after = ""; }
    } else {
      const k = rest.indexOf("⟦");
      optional = false;
      if (k >= 0) { seg = rest.slice(0, k); after = rest.slice(k); } else { seg = rest; after = ""; }
    }
    const t = fillSegment(seg, field, optional);
    if (t != null) out = pushText(out, t);
    rest = after;
  }
  return out;
}

// Citação no texto. `n` = número da fonte nos estilos numerados (ordem da primeira citação).
export function citeInText(src, styleKey, n = 1, pages = "") {
  const st = findCiteStyle(styleKey) || CITE_STYLES[0];
  const lasts = parseAuthors(src.author).map((a) => a[0]);
  let who;
  if (!lasts.length) who = src.title || "";
  else if (lasts.length === 1) who = lasts[0];
  else if (lasts.length >= Math.max(2, st.etAlFrom)) who = `${lasts[0]} et al.`;
  else if (lasts.length === 2) who = `${lasts[0]} ${st.and} ${lasts[1]}`;
  else who = `${lasts.slice(0, -1).join(", ")} ${st.and} ${lasts[lasts.length - 1]}`;
  const year = src.year || "";
  const c = st.cite;
  if (c.kind === "authorPage") return pages ? `(${who} ${pages})` : `(${who})`;
  if (c.kind === "authorDate") return pages ? `(${who}${c.yearSep}${year}${c.pagesSep}${pages})` : `(${who}${c.yearSep}${year})`;
  return c.pagesSep && pages ? `${c.open}${n}${c.pagesSep}${pages}${c.close}` : `${c.open}${n}${c.close}`;
}

function gbType(src) {
  const kind = String(src.kind || "").toLowerCase();
  if (kind === "website" || kind === "web") return "EB/OL";
  const code = src.journal ? "J" : kind === "book" || kind === "" ? "M" : kind === "article" ? "J" : kind === "report" ? "R" : "Z";
  return src.url ? `${code}/OL` : code;
}

// Entrada da bibliografia (texto puro; o chamador escapa/formata). Fontes sem ano: "n.d.".
export function bibEntryText(src, styleKey, n = 1) {
  const st = findCiteStyle(styleKey) || CITE_STYLES[0];
  const au = parseAuthors(src.author);
  const field = (key) => {
    switch (key) {
      case "n": return String(n);
      case "names": return nameList(au, st.names);
      case "year": return src.year || "s.d.";
      case "title": return src.title || "";
      case "city": return src.city || "";
      case "publisher": return src.publisher || "";
      case "pub": return [src.city, src.publisher].filter(Boolean).join(": ");
      case "journal": return src.journal || "";
      case "volume": return src.volume || "";
      case "pages": return src.pages || "";
      case "url": return src.url || "";
      case "type": return gbType(src);
      default: return "";
    }
  };
  return render(src.journal ? st.article : st.book, field);
}

// Ordena as fontes como o estilo manda: por autor, por título ou pela ordem da primeira citação
// (`citedIds` = ids na ordem em que aparecem no texto).
export function orderSources(list, styleKey, citedIds = []) {
  const st = findCiteStyle(styleKey) || CITE_STYLES[0];
  const copy = list.slice();
  if (st.order === "cited") {
    const pos = (s) => { const i = citedIds.indexOf(s.id); return i < 0 ? 1e9 : i; };
    return copy.sort((a, b) => pos(a) - pos(b));
  }
  if (st.order === "title") return copy.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  return copy.sort((a, b) => (parseAuthors(a.author)[0]?.[0] || a.title || "").localeCompare(parseAuthors(b.author)[0]?.[0] || b.title || ""));
}

export const isNumberedStyle = (key) => findCiteStyle(key)?.cite.kind === "number";
