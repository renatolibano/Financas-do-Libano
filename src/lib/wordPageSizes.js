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
  livro11x18: { label: "Livro de bolso 11 x 18", cm: [11, 18], px: [416, 680], pdf: [312, 510] },
  livro12x18: { label: "Livro 12 x 18", cm: [12, 18], px: [454, 680], pdf: [340, 510] },
  livro14x21: { label: "Livro 14 x 21", cm: [14, 21], px: [529, 794], pdf: [397, 595] },
  livro16x23: { label: "Livro 16 x 23", cm: [16, 23], px: [605, 869], pdf: [454, 652] },
  livro17x24: { label: "Livro 17 x 24", cm: [17, 24], px: [643, 907], pdf: [482, 680] },
  livro6x9: { label: "Livro 6 x 9 pol", cm: [15.24, 22.86], px: [576, 864], pdf: [432, 648] },
  livro55x85: { label: "Livro 5,5 x 8,5 pol", cm: [13.97, 21.59], px: [528, 816], pdf: [396, 612] },
};
export const pageSizeLabel = (k) => PAGE_SIZES[k]?.label || "A4";
export const pageSizeCmText = (k) => { const c = (PAGE_SIZES[k] || PAGE_SIZES.a4).cm; return `${c[0]} x ${c[1]} cm`.replace(/\./g, ","); };
