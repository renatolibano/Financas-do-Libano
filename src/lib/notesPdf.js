import { jsPDF } from "jspdf";

// Converte o HTML de uma nota (contentEditable) em linhas de texto simples,
// preservando checklists e listas com marcadores/numeradas.
function htmlToLines(html) {
  const container = document.createElement("div");
  container.innerHTML = html || "";
  const lines = [];

  const handleElement = (node) => {
    if (node.classList?.contains("checklist-item")) {
      const checked = node.classList.contains("checked");
      const text = node.querySelector(".check-text")?.textContent?.trim() || "";
      lines.push((checked ? "[x] " : "[ ] ") + text);
      return;
    }
    if (node.tagName === "UL" || node.tagName === "OL") {
      const ordered = node.tagName === "OL";
      Array.from(node.children).forEach((li, i) => {
        const text = li.textContent.trim();
        if (text) lines.push((ordered ? `${i + 1}. ` : "• ") + text);
      });
      return;
    }
    if (node.tagName === "BR") {
      lines.push("");
      return;
    }
    const text = node.textContent.trim();
    if (text) lines.push(text);
  };

  Array.from(container.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent.trim();
      if (t) lines.push(t);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      handleElement(node);
    }
  });

  return lines.length ? lines : [""];
}

const safeFileName = (title) =>
  (title || "nota").trim().replace(/[^\p{L}\p{N}\-_ ]+/gu, "").replace(/\s+/g, "_").slice(0, 60) || "nota";

// As fontes padrão do jsPDF (helvetica) só suportam a codificação WinAnsi
// (~Latin-1). Emojis são pares substitutos em UTF-16 e, quando passam para
// doc.text/splitTextToSize, quebram tanto o glifo (vira "Ø=Þ" etc.) quanto o
// cálculo de largura da linha inteira, espalhando as letras. Por isso
// removemos emojis e outros símbolos fora do Latin-1 antes de desenhar.
function sanitizeForPdf(text) {
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
