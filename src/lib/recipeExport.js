import { jsPDF } from "jspdf";
import { safeFileName, sanitizeForPdf } from "./notesPdf";

// Exportação/importação de receitas da aba Cozinha: texto copiável, PDF e
// arquivo .json para levar a receita para outra conta do app.

const FORMAT_ID = "libano-receita";

const lines = (v) => String(v || "").split(/\r?\n/).map((l) => l.trim());

// Texto simples: nome, link, ingredientes, modo de preparo e observações (só as partes preenchidas).
export function recipeToText(r) {
  const out = [r.title || "Receita"];
  if (r.link) out.push(`Link: ${r.link}`);
  const ings = (r.ingredients || []).filter(Boolean);
  if (ings.length) out.push("", "Ingredientes:", ...ings.map((i) => `- ${i}`));
  if (r.steps) out.push("", "Modo de preparo:", String(r.steps).trim());
  if (r.notes) out.push("", "Observações:", String(r.notes).trim());
  return out.join("\n");
}

export function downloadRecipePdf(r) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 56;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - marginX * 2;
  let y = 64;

  const write = (text, { size = 11, bold = false, gap = 16, color = [0, 0, 0], url } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.splitTextToSize(sanitizeForPdf(text) || " ", maxW).forEach((line) => {
      if (y > pageH - 56) { doc.addPage(); y = 56; }
      if (url) doc.textWithLink(line, marginX, y, { url });
      else doc.text(line, marginX, y);
      y += gap;
    });
  };
  const section = (label) => { y += 10; write(label, { size: 12, bold: true, gap: 20 }); };

  write(r.title || "Receita", { size: 20, bold: true, gap: 28 });
  if (r.link) write(r.link, { size: 10, gap: 14, color: [30, 90, 200], url: r.link });

  const ings = (r.ingredients || []).filter(Boolean);
  if (ings.length) {
    section("Ingredientes");
    ings.forEach((i) => write(`• ${i}`));
  }
  if (r.steps) {
    section("Modo de preparo");
    lines(r.steps).forEach((l) => (l ? write(l) : (y += 8)));
  }
  if (r.notes) {
    section("Observações");
    lines(r.notes).forEach((l) => (l ? write(l) : (y += 8)));
  }

  doc.save(`${safeFileName(r.title || "receita")}.pdf`);
}

const pick = (r) => ({
  title: r.title || "",
  link: r.link || null,
  ingredients: (r.ingredients || []).filter(Boolean),
  steps: r.steps || null,
  notes: r.notes || null,
});

// Arquivo .json para importar em outra conta (botão "Importar" da Cozinha).
export function downloadRecipeFile(r) {
  const payload = { format: FORMAT_ID, version: 1, recipes: [pick(r)] };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `receita-${safeFileName(r.title || "receita")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Lê o texto de um arquivo/código exportado e devolve a lista de receitas já
// validada. Lança Error com mensagem amigável se o conteúdo não servir.
export function parseRecipeImport(text) {
  let data;
  try { data = JSON.parse(String(text || "").trim()); }
  catch { throw new Error("Conteúdo inválido: use um arquivo de receita exportado pelo app."); }

  const raw = Array.isArray(data) ? data : Array.isArray(data?.recipes) ? data.recipes : data?.title ? [data] : [];
  const str = (v, max) => String(v ?? "").trim().slice(0, max);

  const recipes = raw
    .map((x) => {
      const title = str(x?.title, 200);
      if (!title) return null;
      const link = str(x?.link, 2000);
      const ing = Array.isArray(x?.ingredients) ? x.ingredients : lines(x?.ingredients);
      return {
        title,
        link: /^https?:\/\//i.test(link) ? link : null,
        ingredients: ing.map((i) => str(i, 300)).filter(Boolean).slice(0, 200),
        steps: str(x?.steps, 20000) || null,
        notes: str(x?.notes, 20000) || null,
      };
    })
    .filter(Boolean);

  if (!recipes.length) throw new Error("Nenhuma receita encontrada nesse conteúdo.");
  return recipes;
}
