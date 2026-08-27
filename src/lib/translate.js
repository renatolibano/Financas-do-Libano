import { supabase } from "./supabaseClient";

// Pede à edge function "translate-suggestions" (Gemini) algumas opções de
// tradução curtas para um termo, de um idioma pro outro — usado no formulário
// de flashcards para sugerir a definição enquanto a pessoa digita o termo.
// Retorna sempre um array (vazio em caso de erro, silenciosamente — isso é
// só uma sugestão, não pode travar o formulário se falhar).
export async function fetchTranslationSuggestions(text, sourceLangName, targetLangName) {
  if (!supabase || !text?.trim() || !sourceLangName || !targetLangName) return [];
  try {
    const { data, error } = await supabase.functions.invoke("translate-suggestions", {
      body: { text: text.trim(), sourceLang: sourceLangName, targetLang: targetLangName },
    });
    if (error || data?.error) return [];
    return Array.isArray(data?.suggestions) ? data.suggestions.filter(s => typeof s === "string" && s.trim()) : [];
  } catch (err) {
    console.error("[translate] falha ao buscar sugestões:", err);
    return [];
  }
}
