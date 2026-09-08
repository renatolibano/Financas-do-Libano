import { jsPDF } from "jspdf";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, LevelFormat, WidthType, PageBreak, PageOrientation,
} from "docx";

// ---------------------------------------------------------------------------
// Exportação do "Word" (Área de Estudos) como .docx de verdade (preserva
// negrito/itálico/cor/alinhamento/listas/tabelas/imagens) ou como PDF rápido
// (só texto, igual ao downloadNotePdf em notesPdf.js — mesmo nível de
// simplicidade já aceito ali). Tudo roda no navegador: nenhum arquivo passa
// por servidor nenhum pra ser gerado, então não gasta egress além do próprio
// download final.

const safeFileName = (title) =>
  (title || "documento").trim().replace(/[^\p{L}\p{N}\-_ ]+/gu, "").replace(/\s+/g, "_").slice(0, 60) || "documento";

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Conversão de cor: o navegador normaliza qualquer cor aplicada via
// execCommand (mesmo passada como "#ff5c5c") para "rgb(255, 92, 92)" no
// style computado. docx e jsPDF precisam de hex/decimal, não de "rgb(...)".
function rgbToHex(c) {
  if (!c) return null;
  c = c.trim();
  if (c.startsWith("#")) return c.replace("#", "").slice(0, 6).padStart(6, "0");
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return [1, 2, 3].map((i) => parseInt(m[i], 10).toString(16).padStart(2, "0")).join("");
}
function hexToRgb(hex) {
  if (!hex) return [0, 0, 0];
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function pxOrPtToPt(v) {
  const n = parseFloat(v);
  if (!n) return null;
  if (v.endsWith("pt")) return Math.round(n);
  if (v.endsWith("px")) return Math.round(n * 0.75);
  return Math.round(n);
}
// docx só aceita nomes de cor pré-definidos pra marca-texto (highlight), não
// hex livre — aproxima pela cor mais próxima da nossa paleta de marca-texto.
const HILITE_HEX_TO_DOCX = {
  ffe066: "yellow", a9e6a0: "green", a9d4ff: "cyan", e2b6ff: "magenta", ffb3ab: "red",
};

function parseAlign(el) {
  const a = el.style?.textAlign || "";
  if (a === "center") return "center";
  if (a === "right") return "right";
  if (a === "justify") return "justify";
  return "left";
}

// Percorre um nó (e filhos) acumulando formatação herdada, devolvendo uma
// lista plana de "runs" de texto já com bold/italic/underline/etc resolvidos.
function collectRuns(node, ctx) {
  let runs = [];
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.textContent) runs.push({ text: node.textContent, ...ctx });
    return runs;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return runs;
  if (node.tagName === "BR") { runs.push({ text: "\n", ...ctx }); return runs; }
  if (node.tagName === "IMG") { runs.push({ image: node.getAttribute("src") }); return runs; }

  const next = { ...ctx };
  const tag = node.tagName;
  if (tag === "B" || tag === "STRONG") next.bold = true;
  if (tag === "I" || tag === "EM") next.italic = true;
  if (tag === "U") next.underline = true;
  if (tag === "S" || tag === "STRIKE" || tag === "DEL") next.strike = true;
  if (tag === "SUP") next.sup = true;
  if (tag === "SUB") next.sub = true;
  const style = node.style;
  if (style) {
    if (style.color) next.color = rgbToHex(style.color) || next.color;
    if (style.backgroundColor && style.backgroundColor !== "transparent") next.highlight = rgbToHex(style.backgroundColor) || next.highlight;
    const fw = style.fontWeight;
    if (fw === "bold" || (fw && parseInt(fw, 10) >= 700)) next.bold = true;
    if (style.fontStyle === "italic") next.italic = true;
    const td = style.textDecorationLine || style.textDecoration || "";
    if (td.includes("underline")) next.underline = true;
    if (td.includes("line-through")) next.strike = true;
    if (style.fontSize) next.fontSizePt = pxOrPtToPt(style.fontSize) || next.fontSizePt;
    if (style.fontFamily) next.font = style.fontFamily.split(",")[0].replace(/['"]/g, "").trim();
  }
  if (node.getAttribute?.("face")) next.font = node.getAttribute("face");
  if (node.getAttribute?.("color")) next.color = rgbToHex(node.getAttribute("color")) || next.color;

  Array.from(node.childNodes).forEach((child) => { runs = runs.concat(collectRuns(child, next)); });
  return runs;
}

function stripHtmlLocal(html) {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return d.textContent || "";
}

// Converte o HTML do documento numa lista de blocos normalizados, usada por
// AMBOS os exportadores (.docx e PDF) — evita duas implementações divergentes.
function parseBlocks(html) {
  const container = document.createElement("div");
  container.innerHTML = html || "";
  const blocks = [];

  const pushParagraphLike = (el, type = "paragraph", extra = {}) => {
    blocks.push({ type, align: parseAlign(el), runs: collectRuns(el, {}), ...extra });
  };

  const walkListItems = (listEl, ordered, level = 0) => {
    Array.from(listEl.children).forEach((li) => {
      if (li.tagName !== "LI") return;
      const nestedList = li.querySelector(":scope > ul, :scope > ol");
      const runs = [];
      Array.from(li.childNodes).forEach((ch) => {
        if (ch.nodeType === Node.ELEMENT_NODE && (ch.tagName === "UL" || ch.tagName === "OL")) return;
        runs.push(...collectRuns(ch, {}));
      });
      blocks.push({ type: "list", ordered, level, runs, align: parseAlign(li) });
      if (nestedList) walkListItems(nestedList, nestedList.tagName === "OL", level + 1);
    });
  };

  const walkTable = (tableEl) => {
    const rows = Array.from(tableEl.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.children).map((td) => stripHtmlLocal(td.innerHTML).trim())
    );
    if (rows.length) blocks.push({ type: "table", rows });
  };

  Array.from(container.children).forEach((el) => {
    if (el.classList?.contains("word-page-break")) { blocks.push({ type: "pagebreak" }); return; }
    if (el.classList?.contains("checklist-item")) {
      blocks.push({
        type: "checklist",
        checked: el.classList.contains("checked"),
        runs: [{ text: el.querySelector(".check-text")?.textContent || "" }],
      });
      return;
    }
    switch (el.tagName) {
      case "H1": pushParagraphLike(el, "heading", { level: 1 }); break;
      case "H2": pushParagraphLike(el, "heading", { level: 2 }); break;
      case "H3": pushParagraphLike(el, "heading", { level: 3 }); break;
      case "BLOCKQUOTE": pushParagraphLike(el, "quote"); break;
      case "UL": walkListItems(el, false); break;
      case "OL": walkListItems(el, true); break;
      case "TABLE": walkTable(el); break;
      case "IMG": blocks.push({ type: "image", src: el.getAttribute("src") }); break;
      default: pushParagraphLike(el, "paragraph"); break;
    }
  });

  if (!blocks.length) blocks.push({ type: "paragraph", runs: [] });
  return blocks;
}

// ---------------------------------------------------------------------------
// .DOCX — abre direto no Word/Google Docs/LibreOffice, com formatação real.

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function imageTypeFromDataUrl(dataUrl) {
  if (dataUrl.startsWith("data:image/png")) return "png";
  if (dataUrl.startsWith("data:image/gif")) return "gif";
  if (dataUrl.startsWith("data:image/bmp")) return "bmp";
  return "jpg";
}

function runsToTextRuns(runs, extra = {}) {
  const list = (runs || []).filter((r) => r.text != null && r.text !== "");
  if (!list.length) return [new TextRun("")];
  return list.map((r) => new TextRun({
    text: r.text,
    bold: r.bold || extra.bold || undefined,
    italics: r.italic || extra.italics || undefined,
    underline: (r.underline || extra.underline) ? {} : undefined,
    strike: r.strike || undefined,
    superScript: r.sup || undefined,
    subScript: r.sub || undefined,
    color: r.color || undefined,
    highlight: r.highlight ? HILITE_HEX_TO_DOCX[r.highlight] : undefined,
    size: r.fontSizePt ? r.fontSizePt * 2 : undefined, // docx usa meios-pontos
    font: r.font || undefined,
  }));
}

function alignMap(a) {
  if (a === "center") return AlignmentType.CENTER;
  if (a === "right") return AlignmentType.RIGHT;
  if (a === "justify") return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

function buildDocxTable(rows) {
  const colCount = Math.max(...rows.map((r) => r.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells) => new TableRow({
      children: Array.from({ length: colCount }).map((_, i) => new TableCell({
        width: { size: Math.round(100 / colCount), type: WidthType.PERCENTAGE },
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun(cells[i] || "")] })],
      })),
    })),
  });
}

const MARGIN_TWIPS = { estreita: 720, normal: 1440, larga: 2160 };

export async function downloadWordDocx(doc) {
  const blocks = parseBlocks(doc.content);
  const children = [];

  for (const b of blocks) {
    if (b.type === "pagebreak") { children.push(new Paragraph({ children: [new PageBreak()] })); continue; }
    if (b.type === "heading") {
      children.push(new Paragraph({
        heading: b.level === 1 ? HeadingLevel.HEADING_1 : b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        alignment: alignMap(b.align),
        children: runsToTextRuns(b.runs),
      }));
      continue;
    }
    if (b.type === "quote") {
      children.push(new Paragraph({ alignment: alignMap(b.align), indent: { left: 480 }, children: runsToTextRuns(b.runs, { italics: true }) }));
      continue;
    }
    if (b.type === "checklist") {
      children.push(new Paragraph({ children: [new TextRun(b.checked ? "☑ " : "☐ "), ...runsToTextRuns(b.runs, b.checked ? { strike: true } : {})] }));
      continue;
    }
    if (b.type === "list") {
      children.push(new Paragraph({ numbering: { reference: b.ordered ? "ordered-list" : "bullet-list", level: b.level || 0 }, children: runsToTextRuns(b.runs) }));
      continue;
    }
    if (b.type === "table") { children.push(buildDocxTable(b.rows)); continue; }
    if (b.type === "image" && b.src?.startsWith("data:")) {
      try {
        const img = await new Promise((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = b.src;
        });
        const maxW = 500;
        const ratio = Math.min(maxW / img.width, 1);
        children.push(new Paragraph({
          children: [new ImageRun({
            data: dataUrlToBytes(b.src),
            type: imageTypeFromDataUrl(b.src),
            transformation: { width: Math.round(img.width * ratio), height: Math.round(img.height * ratio) },
          })],
        }));
      } catch { /* imagem corrompida — ignora e segue o documento */ }
      continue;
    }
    children.push(new Paragraph({ alignment: alignMap(b.align), children: runsToTextRuns(b.runs) }));
  }

  const marginTwips = MARGIN_TWIPS[doc.margins] || MARGIN_TWIPS.normal;
  const cmToTwips = (cm) => Math.round(cm * 566.9291339);
  const leftTwips = doc.margin_left != null ? cmToTwips(doc.margin_left) : marginTwips;
  const rightTwips = doc.margin_right != null ? cmToTwips(doc.margin_right) : marginTwips;
  const landscape = doc.orientation === "paisagem";

  const document = new Document({
    numbering: {
      config: [
        { reference: "ordered-list", levels: [0, 1, 2].map((level) => ({ level, format: LevelFormat.DECIMAL, text: `%${level + 1}.`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 360 * (level + 2), hanging: 360 } } } })) },
        { reference: "bullet-list", levels: [0, 1, 2].map((level) => ({ level, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 360 * (level + 2), hanging: 360 } } } })) },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: { top: marginTwips, bottom: marginTwips, left: leftTwips, right: rightTwips },
        },
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(document);
  downloadBlob(blob, `${safeFileName(doc.title)}.docx`);
}

// ---------------------------------------------------------------------------
// PDF — rápido e universal, mas só com texto simples (sem negrito/cor por
// trecho), no mesmo nível de simplicidade já usado em notesPdf.js.

function blockToLines(b) {
  if (b.type === "checklist") return [(b.checked ? "☑ " : "☐ ") + (b.runs[0]?.text || "")];
  if (b.type === "list") return [(b.ordered ? "• " : "• ") + b.runs.map((r) => r.text).join("")];
  const text = (b.runs || []).map((r) => r.text).join("");
  return [text];
}

export function downloadWordPdf(doc) {
  const landscape = doc.orientation === "paisagem";
  const format = doc.page_size === "carta" ? "letter" : "a4";
  const marginPt = doc.margins === "estreita" ? 36 : doc.margins === "larga" ? 72 : 54;
  const cmToPt = (cm) => cm * 28.3464567;
  const marginLeftPt = doc.margin_left != null ? cmToPt(doc.margin_left) : marginPt;
  const marginRightPt = doc.margin_right != null ? cmToPt(doc.margin_right) : marginPt;

  const pdf = new jsPDF({ unit: "pt", format, orientation: landscape ? "landscape" : "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxWidth = pageWidth - marginLeftPt - marginRightPt;
  let y = marginPt;

  const ensureSpace = (lineHeight) => {
    if (y > pageHeight - marginPt) { pdf.addPage(); y = marginPt; }
  };

  const blocks = parseBlocks(doc.content);
  blocks.forEach((b) => {
    if (b.type === "pagebreak") { pdf.addPage(); y = marginPt; return; }
    if (b.type === "table") {
      const cols = Math.max(...b.rows.map((r) => r.length));
      const colWidth = maxWidth / cols;
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
      b.rows.forEach((row) => {
        const cellLines = Array.from({ length: cols }).map((_, i) => pdf.splitTextToSize(row[i] || "", colWidth - 8));
        const rowLines = Math.max(1, ...cellLines.map((l) => l.length));
        const rowHeight = rowLines * 13 + 8;
        ensureSpace(rowHeight);
        pdf.rect(marginLeftPt, y, maxWidth, rowHeight);
        for (let i = 1; i < cols; i++) pdf.line(marginLeftPt + colWidth * i, y, marginLeftPt + colWidth * i, y + rowHeight);
        cellLines.forEach((lines, i) => lines.forEach((line, li) => pdf.text(line, marginLeftPt + colWidth * i + 4, y + 13 + li * 13)));
        y += rowHeight;
      });
      y += 8;
      return;
    }
    if (b.type === "image" && b.src?.startsWith("data:")) {
      try {
        const props = pdf.getImageProperties(b.src);
        const w = Math.min(maxWidth, props.width);
        const h = (props.height * w) / props.width;
        ensureSpace(h);
        pdf.addImage(b.src, "JPEG", marginLeftPt, y, w, h);
        y += h + 10;
      } catch { /* ignora imagem inválida */ }
      return;
    }
    let size = 11, font = "normal", indent = 0;
    if (b.type === "heading") { size = b.level === 1 ? 20 : b.level === 2 ? 16 : 13; font = "bold"; }
    if (b.type === "quote") { font = "italic"; indent = 20; }
    pdf.setFont("helvetica", font); pdf.setFontSize(size);
    const lineHeight = size * 1.35;
    if (b.type === "heading") y += 6;
    blockToLines(b).forEach((rawLine) => {
      pdf.splitTextToSize(rawLine || " ", maxWidth - indent).forEach((line) => {
        ensureSpace(lineHeight);
        pdf.text(line, marginLeftPt + indent, y);
        y += lineHeight;
      });
    });
    if (b.type === "heading") y += 4;
  });

  pdf.save(`${safeFileName(doc.title)}.pdf`);
}

// Contagem de palavras/caracteres — usada na barra de status do editor.
export function countWords(html) {
  const text = stripHtmlLocal(html).trim();
  const words = text ? text.split(/\s+/).length : 0;
  const chars = text.length;
  return { words, chars };
}
