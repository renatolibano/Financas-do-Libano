import { useState, useEffect, useCallback } from "react";
import { supabase, cloudConfigured } from "./supabaseClient";
import { loadLocal, saveLocal } from "./storage";
import { useIdbPersistentState } from "./idbStorage";

const uid = () => Date.now() + Math.random();

// Cache local (localStorage) do último resultado de cada tabela — evita
// rebuscar tudo do Supabase toda vez que o PWA é reaberto (fechar e abrir de
// novo é muito comum em app instalado no celular). Se o cache ainda estiver
// "fresco" (dentro do TTL), a tela usa ele direto e nenhuma requisição sai.
// Passado o TTL, a próxima abertura busca do servidor de novo normalmente.
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const cacheKey = (table, userId) => `cache:${table}:${userId}`;

// table: nome da tabela no Supabase (e também a chave usada no localStorage)
// initialData: dados de exemplo usados apenas no modo local, na primeira vez
// session: sessão atual do Supabase (null se deslogado)
// order: "asc" | "desc" — em que ordem os itens novos entram na lista
// opts.listSelect: colunas buscadas na listagem inicial (fetchCloud). Por
// padrão "*" (todas). Passe uma lista enxuta (ex.: sem campos de texto/JSON
// grandes como anotações e desenhos) pra tabelas com colunas pesadas que só
// são necessárias quando o item é aberto — combine com fetchFull(id) pra
// buscar a linha inteira nesse momento, sem pesar a listagem.
export function useEntity(table, initialData, session, order = "asc", opts = {}) {
  const { orderable = false, listSelect = "*" } = opts;
  const cloud = cloudConfigured && !!session;
  const userId = session?.user?.id || null;
  const [localData, setLocalData, localLoaded] = useIdbPersistentState(table, initialData);

  // Estado inicial já tenta ler o cache local — assim a tela mostra algo na
  // hora, em vez de ficar em branco até a primeira resposta da rede.
  const [cloudData, setCloudDataRaw] = useState(() => {
    if (!cloudConfigured || !userId) return [];
    return loadLocal(cacheKey(table, userId), null)?.data || [];
  });
  const [cloudLoading, setCloudLoading] = useState(cloud && cloudData.length === 0);
  const [error, setError] = useState(null);

  // Toda vez que os dados em memória mudam (por fetch OU por add/update/
  // remove/reorder), grava também no cache local — assim uma mutação feita
  // agora já fica disponível pro cache na próxima reabertura do PWA, mesmo
  // que o TTL do fetch original ainda não tenha vencido.
  const setCloudData = useCallback(
    (updater) => {
      setCloudDataRaw((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (cloudConfigured && userId) saveLocal(cacheKey(table, userId), { data: next, ts: Date.now() });
        return next;
      });
    },
    [table, userId]
  );

  const fetchCloud = useCallback(
    async (force = false) => {
      if (!cloud) {
        setCloudLoading(false);
        return;
      }
      if (!force) {
        const cached = loadLocal(cacheKey(table, userId), null);
        if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
          // Cache ainda fresco — usa direto, sem gastar egress nenhum.
          setCloudDataRaw(cached.data);
          setCloudLoading(false);
          return;
        }
      }
      setCloudLoading(true);
      let query = supabase.from(table).select(listSelect);
      query = orderable
        ? query.order("sort_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: order === "asc" })
        : query.order("created_at", { ascending: order === "asc" });
      const { data, error } = await query;
      if (error) {
        console.error(error);
        setError(error.message);
      } else {
        setCloudData(data || []);
      }
      setCloudLoading(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [cloud, table, order, orderable, listSelect, userId, setCloudData]
  );

  useEffect(() => {
    let active = true;
    fetchCloud().catch((e) => {
      if (active) console.error(e);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, table, userId]);

  const data = cloud ? cloudData : localData;
  // No modo nuvem, "carregando" é o fetch do Supabase; no modo local, é só
  // o instante inicial (bem curto) até o IndexedDB responder — evita mostrar
  // os dados de exemplo (initialData) antes do dado real do usuário chegar.
  const loading = cloud ? cloudLoading : !localLoaded;

  const add = useCallback(
    async (row) => {
      if (cloud) {
        const { data: inserted, error } = await supabase
          .from(table)
          .insert({ ...row, user_id: session.user.id })
          .select()
          .maybeSingle();
        if (error) {
          console.error("Supabase insert error:", error);
          alert("Não foi possível salvar: " + error.message);
          return null;
        }
        setCloudData((d) => (order === "desc" ? [inserted, ...d] : [...d, inserted]));
        return inserted;
      } else {
        const item = { id: uid(), ...row };
        setLocalData((d) => (order === "desc" ? [item, ...d] : [...d, item]));
      }
    },
    [cloud, table, session, order, setLocalData]
  );

  const remove = useCallback(
    async (id) => {
      if (cloud) {
        const { error } = await supabase.from(table).delete().eq("id", id);
        if (error) {
          alert("Não foi possível excluir: " + error.message);
          return;
        }
        setCloudData((d) => d.filter((x) => x.id !== id));
      } else {
        setLocalData((d) => d.filter((x) => x.id !== id));
      }
    },
    [cloud, table, setLocalData]
  );

  const update = useCallback(
    async (id, patch) => {
      if (cloud) {
        // Pede de volta só o "id" (não a linha inteira) — o cliente já tem
        // os dados que acabou de enviar em `patch`, então baixar tudo de
        // novo (capa em base64, drawings, etc.) a cada troca de página, nota
        // digitada ou favorito marcado seria egress desperdiçado. O "id" só
        // serve pra confirmar que a linha existe; os dados vêm do merge local.
        const { data: updated, error } = await supabase
          .from(table)
          .update(patch)
          .eq("id", id)
          .select("id")
          .maybeSingle();
        if (error) {
          console.error("Supabase update error:", error);
          alert("Não foi possível atualizar: " + error.message);
          return null;
        }
        if (!updated) {
          console.error("Supabase update returned no row for id:", id);
          alert("Não foi possível atualizar: o item não foi encontrado no banco de dados.");
          return null;
        }
        let merged = null;
        setCloudData((d) =>
          d.map((x) => {
            if (x.id !== id) return x;
            merged = { ...x, ...patch };
            return merged;
          })
        );
        return merged;
      } else {
        setLocalData((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      }
    },
    [cloud, table, setLocalData]
  );

  const reorder = useCallback(
    async (newList) => {
      if (cloud) {
        setCloudData(newList);
        try {
          await Promise.all(
            newList.map((item, idx) =>
              supabase.from(table).update({ sort_order: idx }).eq("id", item.id)
            )
          );
        } catch (e) {
          console.error(e);
        }
      } else {
        setLocalData(newList);
      }
    },
    [cloud, table, setLocalData]
  );

  // Busca a linha inteira (todas as colunas) de um único item — usado pra
  // completar, no momento de abrir, as colunas pesadas que a listagem (com
  // listSelect enxuto) deixou de fora. Devolve o item já mesclado com o que
  // já estava em memória, e atualiza o cloudData pra não buscar de novo.
  const fetchFull = useCallback(
    async (id) => {
      if (!cloud) return localData.find((x) => x.id === id) || null;
      const { data: row, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
      if (error) {
        console.error("Supabase fetchFull error:", error);
        return cloudData.find((x) => x.id === id) || null;
      }
      if (!row) return cloudData.find((x) => x.id === id) || null;
      setCloudData((d) => d.map((x) => (x.id === id ? { ...x, ...row } : x)));
      return row;
    },
    [cloud, table, cloudData, localData]
  );

  const refresh = useCallback(() => fetchCloud(true), [fetchCloud]);

  return { data, add, remove, update, reorder, loading, error, cloud, refresh, fetchFull };
}
