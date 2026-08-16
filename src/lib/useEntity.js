import { useState, useEffect, useCallback } from "react";
import { supabase, cloudConfigured } from "./supabaseClient";
import { usePersistentState } from "./storage";

const uid = () => Date.now() + Math.random();

// table: nome da tabela no Supabase (e também a chave usada no localStorage)
// initialData: dados de exemplo usados apenas no modo local, na primeira vez
// session: sessão atual do Supabase (null se deslogado)
// order: "asc" | "desc" — em que ordem os itens novos entram na lista
export function useEntity(table, initialData, session, order = "asc", opts = {}) {
  const { orderable = false } = opts;
  const cloud = cloudConfigured && !!session;
  const [localData, setLocalData] = usePersistentState(table, initialData);
  const [cloudData, setCloudData] = useState([]);
  const [loading, setLoading] = useState(cloud);
  const [error, setError] = useState(null);

  const fetchCloud = useCallback(async () => {
    if (!cloud) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = supabase.from(table).select("*");
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
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, table, order, orderable]);

  useEffect(() => {
    let active = true;
    fetchCloud().catch((e) => {
      if (active) console.error(e);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, table, session?.user?.id]);

  const data = cloud ? cloudData : localData;

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
        const { data: updated, error } = await supabase
          .from(table)
          .update(patch)
          .eq("id", id)
          .select()
          .single();
        if (error) {
          console.error("Supabase update error:", error);
          alert("Não foi possível atualizar: " + error.message);
          return null;
        }
        if (!updated) {
          console.error("Supabase update returned no row for id:", id);
          alert("Não foi possível atualizar: o PDF não foi encontrado no banco de dados.");
          return null;
        }
        setCloudData((d) => d.map((x) => (x.id === id ? updated : x)));
        return updated;
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

  return { data, add, remove, update, reorder, loading, error, cloud, refresh: fetchCloud };
}
