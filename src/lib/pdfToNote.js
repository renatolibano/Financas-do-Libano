import { pdfjsLib, pdfWasmUrl } from "./pdf";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Agrupa os itens de texto de uma página em linhas (mesma posição Y) e as
// linhas em parágrafos (quando o espaçamento vertical é maior que o normal).
export function pageToParagraphs(items) {
  const rows = [];
  items.forEach((it) => {
    if (typeof it.str !== "string" || !it.transform) return;
    const y = it.transform[5];
    const h = Math.abs(it.height) || Math.abs(it.transform[3]) || 10;
    const row = rows.find((r) => Math.abs(r.y - y) <= h * 0.5);
    if (row) row.items.push(it);
    else rows.push({ y, h, items: [it] });
  });
  rows.sort((a, b) => b.y - a.y); // topo -> base

  const lines = rows
    .map((r) => {
      r.items.sort((a, b) => a.transform[4] - b.transform[4]);
      let text = "";
      r.items.forEach((it, i) => {
        if (i > 0) {
          const prev = r.items[i - 1];
          const gap = it.transform[4] - (prev.transform[4] + (prev.width || 0));
          if (gap > r.h * 0.15 && !text.endsWith(" ") && !it.str.startsWith(" ")) text += " ";
        }
        text += it.str;
      });
      return { y: r.y, h: r.h, text: text.replace(/\s+/g, " ").trim() };
    })
    .filter((l) => l.text);

  const paragraphs = [];
  let cur = [];
  lines.forEach((l, i) => {
    const prev = lines[i - 1];
    if (prev && prev.y - l.y > Math.max(prev.h, l.h) * 1.8 && cur.length) {
      paragraphs.push(cur.join(" "));
      cur = [];
    }
    cur.push(l.text);
  });
  if (cur.length) paragraphs.push(cur.join(" "));
  return paragraphs;
}

// Reproduz a página fielmente: uma linha por <div>, linhas em branco conforme o
// espaçamento vertical original e espaços/recuos preservados (&nbsp;).
export function pageToHtmlLines(items) {
  const rows = [];
  let wSum = 0, cSum = 0;
  items.forEach((it) => {
    if (typeof it.str !== "string" || !it.transform) return;
    if (it.str.trim() && it.width) { wSum += it.width; cSum += it.str.length; }
    const y = it.transform[5];
    const h = Math.abs(it.height) || Math.abs(it.transform[3]) || 10;
    const row = rows.find((r) => Math.abs(r.y - y) <= h * 0.5);
    if (row) row.items.push(it);
    else rows.push({ y, h, items: [it] });
  });
  rows.sort((a, b) => b.y - a.y);
  const charW = cSum ? wSum / cSum : 5;

  const lines = rows.map((r) => {
    r.items.sort((a, b) => a.transform[4] - b.transform[4]);
    let text = "";
    r.items.forEach((it, i) => {
      if (i > 0) {
        const prev = r.items[i - 1];
        const gap = it.transform[4] - (prev.transform[4] + (prev.width || 0));
        const n = Math.round(gap / charW);
        if (n >= 1) text += " ".repeat(Math.min(n, 60));
        else if (gap > r.h * 0.15 && !text.endsWith(" ") && !it.str.startsWith(" ")) text += " ";
      }
      text += it.str;
    });
    return { y: r.y, h: r.h, x: r.items[0].transform[4], text: text.replace(/\s+$/, "").replace(/^\s+/, "") };
  }).filter((l) => l.text);
  if (!lines.length) return [];

  const minX = Math.min(...lines.map((l) => l.x));
  const hs = lines.map((l) => l.h).sort((a, b) => a - b);
  const medH = hs[Math.floor(hs.length / 2)];
  const gaps = [];
  for (let i = 1; i < lines.length; i++) {
    const g = lines[i - 1].y - lines[i].y;
    if (g >= medH * 0.7) gaps.push(g);
  }
  const step = gaps.length ? Math.min(...gaps) : medH * 1.2;

  const html = [];
  lines.forEach((l, i) => {
    if (i > 0) {
      const blanks = Math.max(0, Math.min(10, Math.round((lines[i - 1].y - l.y) / step) - 1));
      for (let b = 0; b < blanks; b++) html.push("<div><br></div>");
    }
    const indent = Math.min(40, Math.max(0, Math.round((l.x - minX) / charW)));
    const body = esc(" ".repeat(indent) + l.text)
      .replace(/^ +/, (m) => "&nbsp;".repeat(m.length))
      .replace(/ {2,}/g, (m) => "&nbsp;".repeat(m.length - 1) + " ");
    html.push(`<div>${body}</div>`);
  });
  return html;
}

// Lê o texto de um PDF (processamento 100% local) e devolve { title, content }
// no mesmo formato das notas (HTML de contentEditable: um <div> por parágrafo).
export async function pdfFileToNote(file) {
  const buf = await file.arrayBuffer();
  const task = pdfjsLib.getDocument({ data: buf, wasmUrl: pdfWasmUrl });
  const doc = await task.promise;
  const blocks = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const htmlLines = pageToHtmlLines(tc.items);
      if (htmlLines.length) {
        if (blocks.length) blocks.push("<div><br></div>");
        blocks.push(...htmlLines);
      }
      page.cleanup();
    }
  } finally {
    task.destroy();
  }
  if (!blocks.length) throw new Error("Este PDF não tem texto selecionável (parece ser escaneado).");
  return {
    title: file.name.replace(/\.pdf$/i, "").trim() || "Nota",
    content: blocks.join(""),
  };
}
