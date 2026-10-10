import { jsPDF } from "jspdf";

// Converte o HTML de uma nota (contentEditable) em linhas de texto simples,
// preservando quebras de linha (<br>, <div>, <p>), checklists e listas
// (com marcadores, numeradas e aninhadas).
const BLOCK_TAGS = new Set(["DIV", "P", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "SECTION", "ARTICLE", "HEADER", "FOOTER", "TR", "TABLE", "TBODY"]);
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "IMG", "SVG", "CANVAS", "VIDEO", "AUDIO", "IFRAME"]);

function htmlToLines(html) {
  const container = document.createElement("div");
  container.innerHTML = html || "";
  const lines = [];
  let cur = "";
  let prefix = ""; // marcador (•, 1., [x]) aplicado só à primeira linha emitida

  // Empurra a linha atual. `force` cria uma linha em branco quando não há texto (caso do <br>).
  const emit = (force = false) => {
    const text = cur.replace(/[\u00a0\s]+/g, " ").trim();
    if (text) { lines.push(prefix + text); prefix = ""; }
    else if (force) lines.push("");
    cur = "";
  };

  const walk = (node, listDepth) => {
    if (node.nodeType === Node.TEXT_NODE) { cur += node.textContent; return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if (SKIP_TAGS.has(tag)) return;

    if (tag === "BR") { emit(true); return; }

    if (node.classList?.contains("checklist-item")) {
      emit();
      const checked = node.classList.contains("checked");
      const text = node.querySelector(".check-text")?.textContent || node.textContent;
      prefix = checked ? "[x] " : "[ ] ";
      cur = text;
      emit();
      prefix = "";
      return;
    }

    if (tag === "UL" || tag === "OL") {
      emit();
      const ordered = tag === "OL";
      let n = 0;
      Array.from(node.children).forEach((li) => {
        if (li.tagName !== "LI") { walk(li, listDepth + 1); return; }
        n += 1;
        emit();
        prefix = ordered ? `${n}. ` : (listDepth === 0 ? "\u2022 " : "- ");
        Array.from(li.childNodes).forEach((c) => walk(c, listDepth + 1));
        emit();
        prefix = "";
      });
      return;
    }

    if (BLOCK_TAGS.has(tag)) {
      emit();
      Array.from(node.childNodes).forEach((c) => walk(c, listDepth));
      emit();
      return;
    }

    // Inline (span, b, i, u, a, font...) e células: só continua a linha atual.
    Array.from(node.childNodes).forEach((c) => walk(c, listDepth));
    if (tag === "TD" || tag === "TH") cur += " ";
  };

  Array.from(container.childNodes).forEach((c) => walk(c, 0));
  emit();

  return lines.length ? lines : [""];
}

export const safeFileName = (title) =>
  (title || "nota").trim().replace(/[^\p{L}\p{N}\-_ ]+/gu, "").replace(/\s+/g, "_").slice(0, 60) || "nota";

// As fontes padrão do jsPDF (helvetica) só suportam a codificação WinAnsi
// (~Latin-1). Emojis são pares substitutos em UTF-16 e, quando passam para
// doc.text/splitTextToSize, quebram tanto o glifo (vira "Ø=Þ" etc.) quanto o
// cálculo de largura da linha inteira, espalhando as letras. Por isso
// removemos emojis e outros símbolos fora do Latin-1 antes de desenhar.
export function sanitizeForPdf(text) {
  return (text || "")
    // emojis, pictogramas, símbolos diversos, dingbats, variation selectors, ZWJ
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u2600-\u27BF]/gu, "")
    .replace(/[\uFE0E\uFE0F\u200D]/gu, "")
    // bandeiras (indicadores regionais)
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    // colapsa espaços duplos deixados pela remoção do emoji
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function writeNoteBody(doc, note, marginX, maxWidth, pageHeight, startY) {
  let y = startY;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.splitTextToSize(sanitizeForPdf(note.title) || "Sem título", maxWidth).forEach((line) => {
    doc.text(line, marginX, y);
    y += 20;
  });
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  htmlToLines(note.content).forEach((rawLine) => {
    const line = sanitizeForPdf(rawLine);
    doc.splitTextToSize(line || " ", maxWidth).forEach((wrapped) => {
      if (y > pageHeight - 56) {
        doc.addPage();
        y = 56;
      }
      doc.text(wrapped, marginX, y);
      y += 16;
    });
  });

  return y;
}

export function downloadNotePdf(note) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 48;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - marginX * 2;

  writeNoteBody(doc, note, marginX, maxWidth, pageHeight, 56);
  doc.save(`${safeFileName(note.title)}.pdf`);
}

export function downloadAllNotesPdf(notes) {
  if (!notes?.length) return;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 48;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - marginX * 2;

  notes.forEach((note, i) => {
    if (i > 0) doc.addPage();
    writeNoteBody(doc, note, marginX, maxWidth, pageHeight, 56);
  });

  doc.save("minhas_notas.pdf");
}
