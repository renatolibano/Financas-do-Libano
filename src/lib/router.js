// Sincroniza a navegação do app (o estado `page`, e opcionalmente o id de um
// item aberto, como uma nota) com a URL do navegador — sem precisar de
// nenhuma lib de rotas (react-router etc). O app inteiro já decide o que
// mostrar com base numa string `page` (ver navTree em main.jsx); aqui a
// gente só espelha essa string (e um id, quando existe) na URL.
//
// Isso resolve, pra qualquer página mapeada abaixo:
// 1) recarregar a página (F5) sem perder o lugar
// 2) copiar/compartilhar o link de uma seção específica
// 3) o botão voltar/avançar do navegador funcionar
//
// Pra abrir um item específico (ex.: /notas/456) é preciso mais um passo:
// o componente daquela seção precisa avisar o App qual item está aberto
// (ver o padrão `onOpenChange` usado em Notes, dentro de main.jsx).

// Nome da página (como usado internamente, em navTree/setPage) -> slug de URL.
// Adicione aqui qualquer página nova do navTree pra ela também ganhar uma URL.
export const PAGE_TO_SLUG = {
  "Visão Geral": "visao-geral",
  "Movimentações": "movimentacoes",
  "Pagamentos Fixos": "pagamentos-fixos",
  "Dívidas": "dividas",
  "Cartões": "cartoes",
  "Orçamento": "orcamento",
  "Metas": "metas",
  "Recorrentes": "recorrentes",
  "Lista de Compras": "lista-de-compras",
  "Lembretes Comuns": "lembretes",
  "Aniversários": "aniversarios",
  "Calendário": "calendario",
  "Notas": "notas",
  "Biblioteca": "biblioteca",
  "Livros Lendo": "livros/lendo",
  "Livros Lidos": "livros/lidos",
  "Livros Para Ler": "livros/para-ler",
  "Metas de Estudo": "metas-de-estudo",
  "Flashcards": "flashcards",
  "Nivelamento": "nivelamento",
  "Leitor de PDF": "leitor-de-pdf",
  "Word": "word",
  "Treino": "treino",
  "Filmes e Séries": "filmes-e-series",
  "Jogos": "jogos",
  "Teste de PC": "teste-de-pc",
  "Gráfico": "grafico",
};

const SLUG_TO_PAGE = Object.fromEntries(
  Object.entries(PAGE_TO_SLUG).map(([page, slug]) => [slug, page])
);
// Ordena os slugs mais longos primeiro, pra "livros/lendo" ser testado antes
// de um eventual "livros" solto (hoje não existe, mas evita bug se existir).
const SLUGS_BY_LENGTH = Object.keys(SLUG_TO_PAGE).sort((a, b) => b.length - a.length);

// Lê um caminho (ex.: "/notas/456") e devolve { page, itemId } — itemId é
// null quando a URL aponta só pra seção, sem item aberto. Devolve null se a
// URL não bater com nenhuma página conhecida (quem chamar deve usar algum
// fallback, tipicamente a "página inicial" salva em Configurações).
export function parseRoute(pathname) {
  const clean = String(pathname || "/").replace(/^\/+|\/+$/g, "");
  if (!clean) return null;
  for (const slug of SLUGS_BY_LENGTH) {
    const page = SLUG_TO_PAGE[slug];
    if (clean === slug) return { page, itemId: null };
    if (clean.startsWith(slug + "/")) {
      const rest = clean.slice(slug.length + 1);
      if (rest && !rest.includes("/")) return { page, itemId: rest };
    }
  }
  return null;
}

// Monta a URL pra uma página (+ opcionalmente um item aberto dentro dela).
export function buildPath(page, itemId) {
  const slug = PAGE_TO_SLUG[page];
  if (!slug) return "/";
  return itemId ? `/${slug}/${encodeURIComponent(itemId)}` : `/${slug}`;
}
