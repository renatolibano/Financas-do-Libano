import { useCallback } from "react";
import { useEntity } from "./useEntity";

// "AAAA-MM" do mês atual — é a chave que agrupa o resumo (uma linha por mês,
// nunca uma linha por página lida ou por sessão de leitura).
export function currentMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Guarda só um total por mês (páginas lidas, segundos de leitura, livros
// concluídos) — por isso o histórico nunca cresce sem limite e o Dashboard
// nunca precisa buscar mais que a linha do mês atual pra se atualizar.
export function useReadingStats(session) {
  const entity = useEntity("reading_stats", [], session, "desc");
  const { data, add, update } = entity;

  // Soma deltas (positivos) no mês atual, criando a linha do mês na primeira
  // vez que algo é registrado.
  const bump = useCallback(async (deltas) => {
    const month = currentMonthKey();
    const row = data.find(r => r.month === month);
    const patch = {
      pages: (row?.pages || 0) + (deltas.pages || 0),
      seconds: (row?.seconds || 0) + (deltas.seconds || 0),
      books_completed: (row?.books_completed || 0) + (deltas.books_completed || 0),
      updated_at: new Date().toISOString(),
    };
    if (row) await update(row.id, patch);
    else await add({ month, ...patch });
  }, [data, add, update]);

  const current = data.find(r => r.month === currentMonthKey()) || { pages: 0, seconds: 0, books_completed: 0 };
  return { ...entity, bump, current };
}
