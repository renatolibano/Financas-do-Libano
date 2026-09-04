// Gera os dados de uma "capa" totalmente local — sem baixar nem subir
// nenhum byte de imagem. A capa é derivada de forma determinística do
// título (e opcionalmente do autor): mesmo título sempre gera a mesma
// cor/inicial, então o usuário reconhece o livro na estante mesmo sem
// nenhuma miniatura real ter sido baixada.
//
// Usado como alternativa de egress zero ao cover_thumb (JPEG em base64
// guardado no banco) — ver GeneratedBookCover em main.jsx e o toggle
// "Capas geradas" nas Configurações.

// Paleta fixa (mesmo espírito visual do app: fundos escuros, acento vivo).
// Cada entrada é [fundo1, fundo2, cor do texto/traço].
const PALETTE = [
  ["#3b2f63", "#6a4fb3", "#f0e9ff"],
  ["#1f3a5f", "#2f6fb3", "#e8f3ff"],
  ["#5f1f3a", "#b3306a", "#ffe8f0"],
  ["#1f5f4a", "#2fb38a", "#e8fff6"],
  ["#5f4a1f", "#b38a2f", "#fff6e8"],
  ["#2f1f5f", "#5f3ab3", "#eee8ff"],
  ["#5f2f1f", "#b3542f", "#ffece8"],
  ["#1f4a5f", "#2f8ab3", "#e8f9ff"],
  ["#3a1f5f", "#7a3ab3", "#f3e8ff"],
  ["#1f5f2f", "#3ab35a", "#e8ffec"],
];

// Hash simples e determinístico (djb2) — não precisa ser criptográfico,
// só estável entre sessões/aparelhos pro mesmo título sempre cair na
// mesma cor.
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

// Iniciais (até 2 letras) a partir das palavras significativas do título,
// ignorando artigos/preposições comuns em PT e EN pra não pegar "O", "A",
// "De", "The", "Of" etc.
const STOPWORDS = new Set(["o","a","os","as","de","do","da","dos","das","e","em","um","uma","para","com","the","of","a","an","and","in","on"]);
export function coverInitials(title) {
  const words = (title || "")
    .trim()
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w.toLowerCase()));
  const source = words.length ? words : (title || "").trim().split(/\s+/).filter(Boolean);
  if (!source.length) return "?";
  if (source.length === 1) return source[0].slice(0, 2).toUpperCase();
  return (source[0][0] + source[1][0]).toUpperCase();
}

// Retorna { bg1, bg2, fg, initials, seed } — tudo que a UI precisa pra
// desenhar a capa. `seed` é exposto só pra permitir variações determinísticas
// extras (ex.: escolher entre alguns layouts) se quiser evoluir depois.
export function generateCoverArt(title, author) {
  const key = `${title || ""}::${author || ""}`;
  const seed = hashString(key || "livro");
  const [bg1, bg2, fg] = PALETTE[seed % PALETTE.length];
  return { bg1, bg2, fg, initials: coverInitials(title), seed };
}
