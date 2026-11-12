// Tamanhos de papel do editor "Word" (Layout › Tamanho). px = 96 dpi (retrato), cm = medida real,
// pdf = formato do jsPDF. Usado pela página, pela régua, pelo PDF e pelo .docx.
export const PAGE_SIZES = {
  a4: { label: "A4", cm: [21, 29.7], px: [794, 1123], pdf: "a4" },
  carta: { label: "Carta", cm: [21.59, 27.94], px: [816, 1056], pdf: "letter" },
  oficio: { label: "Ofício", cm: [21.59, 35.56], px: [816, 1344], pdf: "legal" },
  tabloide: { label: "Tabloide", cm: [27.94, 43.18], px: [1056, 1632], pdf: "tabloid" },
  executivo: { label: "Executivo", cm: [18.41, 26.67], px: [696, 1008], pdf: [522, 756] },
  a3: { label: "A3", cm: [29.7, 42], px: [1123, 1587], pdf: "a3" },
  a5: { label: "A5", cm: [14.8, 21], px: [559, 794], pdf: "a5" },
  b5: { label: "B5", cm: [17.6, 25], px: [665, 945], pdf: "b5" },
};
export const pageSizeLabel = (k) => PAGE_SIZES[k]?.label || "A4";
export const pageSizeCmText = (k) => { const c = (PAGE_SIZES[k] || PAGE_SIZES.a4).cm; return `${c[0]} x ${c[1]} cm`.replace(/\./g, ","); };
