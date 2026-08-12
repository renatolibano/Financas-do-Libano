import { useState, useEffect, useCallback } from "react";
import { supabase, cloudConfigured } from "./supabaseClient";
import { usePersistentState } from "./storage";

const uid = () => Date.now() + Math.random();

// table: nome da tabela no Supabase (e também a chave usada no localStorage)
// initialData: dados de exemplo usados apenas no modo local, na primeira vez
// session: sessão atual do Supabase (null se deslogado)
// order: "asc" | "desc" — em que ordem os itens novos entram na lista
export function useEntity(table, initialData, session, order = "asc") {
  const cloud = cloudConfigured && !!session;
  const [localData, setLocalData] = usePersistentState(table, initialData);
  const [cloudData, setCloudData] = useState([]);
  const [loading, setLoading] = useState(cloud);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!cloud) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    supabase
      .from(table)
      .select("*")
      .order("created_at", { ascending: order === "asc" })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error(error);
          setError(error.message);
        } else {
          setCloudData(data || []);
        }
        setLoading(false);
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
          .single();
        if (error) {
          alert("Não foi possível salvar: " + error.message);
          return;
        }
        setCloudData((d) => (order === "desc" ? [inserted, ...d] : [...d, inserted]));
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
          alert("Não foi possível atualizar: " + error.message);
          return;
        }
        setCloudData((d) => d.map((x) => (x.id === id ? updated : x)));
      } else {
        setLocalData((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      }
    },
    [cloud, table, setLocalData]
  );

  return { data, add, remove, update, loading, error, cloud };
}
