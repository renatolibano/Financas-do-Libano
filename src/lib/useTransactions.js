import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, cloudConfigured } from "./supabaseClient";
import { useIdbPersistentState } from "./idbStorage";

// "transactions" é a única tabela que cresce sem limite (é o extrato
// financeiro completo, ano após ano) — por isso tem um hook próprio, em vez
// de usar useEntity: em vez de baixar TODAS as movimentações de uma vez,
// cada mês só é buscado quando é efetivamente preciso (mês selecionado na
// Visão Geral/Orçamento, ou quando a pessoa pede "carregar mês anterior" na
// aba Movimentações). O saldo total (Visão Geral) não depende disso — vem
// calculado direto do banco por get_transactions_balance() (ver schema.sql).
//
// A coluna "date" (texto) tem dois formatos possíveis: o atual, "AAAA-MM-DD"
// (com ano, comparável por intervalo), e um formato antigo, "DD/MM" (sem
// ano, de antes da correção que passou a gravar o ano) — que só dá pra
// filtrar pelo mês mesmo, ignorando o ano (mesma regra que o app já usava
// no cliente antes dessa mudança).

const monthOf = (ym) => ym.slice(5, 7);
const monthStartDate = (ym) => `${ym}-01`;
const monthEndDate = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};

async function fetchMonthRows(ym) {
  const mm = monthOf(ym);
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .or(`and(date.gte.${monthStartDate(ym)},date.lt.${monthEndDate(ym)}),date.like.%/${mm}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export function useTransactions(session, initialData) {
  const cloud = cloudConfigured && !!session;
  const userId = session?.user?.id || null;
  const [localData, setLocalData, localLoaded] = useIdbPersistentState("transactions", initialData);

  const [monthsData, setMonthsData] = useState({}); // { "AAAA-MM": linhas[] }
  const [loadedMonths, setLoadedMonths] = useState(() => new Set());
  const [loadingCount, setLoadingCount] = useState(0);
  const [error, setError] = useState(null);
  // Espelha loadedMonths de forma síncrona (o state só atualiza depois do
  // próximo render) — usado só pra decidir, na hora, se um mês já foi
  // pedido antes e pode ser ignorado, sem disparar o mesmo fetch 2x.
  const loadedRef = useRef(new Set());

  // Troca de conta (login/logout/outra conta): zera o cache de meses —
  // cada conta tem seu próprio histórico.
  useEffect(() => {
    setMonthsData({});
    setLoadedMonths(new Set());
    loadedRef.current = new Set();
  }, [userId]);

  const loadMonth = useCallback(
    (ym, force = false) => {
      if (!cloud) return Promise.resolve();
      if (!force && loadedRef.current.has(ym)) return Promise.resolve();
      loadedRef.current.add(ym);
      setLoadingCount((n) => n + 1);
      return fetchMonthRows(ym)
        .then((rows) => {
          setMonthsData((d) => ({ ...d, [ym]: rows }));
          setLoadedMonths((s) => new Set(s).add(ym));
        })
        .catch((e) => {
          console.error(e);
          setError(e.message);
          loadedRef.current.delete(ym); // permite tentar de novo depois
        })
        .finally(() => setLoadingCount((n) => n - 1));
    },
    [cloud]
  );

  const cloudData = Object.keys(monthsData)
    .sort()
    .reverse()
    .flatMap((ym) => monthsData[ym]);
  const data = cloud ? cloudData : localData;
  const loading = cloud ? loadingCount > 0 && loadedMonths.size === 0 : !localLoaded;

  const add = useCallback(
    async (row) => {
      if (cloud) {
        const { data: inserted, error } = await supabase
          .from("transactions")
          .insert({ ...row, user_id: userId })
          .select()
          .maybeSingle();
        if (error) {
          console.error("Supabase insert error:", error);
          alert("Não foi possível salvar: " + error.message);
          return null;
        }
        const ym = String(inserted.date || "").slice(0, 7);
        loadedRef.current.add(ym);
        setMonthsData((d) => ({ ...d, [ym]: [inserted, ...(d[ym] || [])] }));
        setLoadedMonths((s) => new Set(s).add(ym));
        return inserted;
      } else {
        const item = { id: Date.now() + Math.random(), ...row };
        setLocalData((d) => [item, ...d]);
        return item;
      }
    },
    [cloud, userId, setLocalData]
  );

  const remove = useCallback(
    async (id) => {
      if (cloud) {
        const { error } = await supabase.from("transactions").delete().eq("id", id);
        if (error) {
          alert("Não foi possível excluir: " + error.message);
          return;
        }
        setMonthsData((d) => {
          const next = {};
          for (const ym in d) next[ym] = d[ym].filter((x) => x.id !== id);
          return next;
        });
      } else {
        setLocalData((d) => d.filter((x) => x.id !== id));
      }
    },
    [cloud, setLocalData]
  );

  // Recarrega (forçado) todos os meses já vistos — usado depois de importar
  // movimentações do banco, pra pegar as novas sem perder o que já tava carregado.
  const refresh = useCallback(() => {
    if (!cloud) return;
    Array.from(loadedRef.current).forEach((ym) => loadMonth(ym, true));
  }, [cloud, loadMonth]);

  return { data, add, remove, loading, error, cloud, refresh, loadMonth, loadedMonths, loadingAny: loadingCount > 0 };
}
