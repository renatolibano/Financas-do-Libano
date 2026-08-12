import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Só ativa o modo nuvem se as duas variáveis estiverem configuradas no .env
export const cloudConfigured = Boolean(url && anonKey);

export const supabase = cloudConfigured
  ? createClient(url, anonKey)
  : null;
