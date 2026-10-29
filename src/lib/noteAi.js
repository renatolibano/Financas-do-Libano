import { supabase } from "./supabaseClient";

// Chama a edge function "note-ai" (Gemini). action: improve | proofread |
// explain | reformat | custom (custom exige `instruction`).
// Sempre resolve: { result, summary } em caso de sucesso, { error } se falhar.
export async function runNoteAi({ action, text, instruction }) {
  if (!supabase) return { error: "A IA precisa da conexão com o servidor." };
  try {
    const { data, error } = await supabase.functions.invoke("note-ai", { body: { action, text, instruction } });
    if (error || data?.error) return { error: data?.error || "Não consegui falar com a IA agora." };
    return { result: data.result, summary: data.summary };
  } catch (err) {
    console.error("[note-ai]", err);
    return { error: "Não consegui falar com a IA agora." };
  }
}
