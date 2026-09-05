import { supabase, cloudConfigured } from "./supabaseClient";

// Pede à edge function "handwriting-ocr" (Gemini) pra transcrever um traço
// desenhado à mão (canvas PNG em data URL) — usado no modo "caneta vira
// texto" da ferramenta de texto, tanto no anotador de PDF quanto no quadro
// infinito. Diferente da sugestão de tradução, aqui o erro é repassado pra
// UI mostrar, já que é uma ação explícita da pessoa (clicou em "Converter").
export async function recognizeHandwriting(pngDataUrl) {
  if (!cloudConfigured) {
    throw new Error("Para usar esse modo, configure a sincronização (Supabase) primeiro — veja o README.");
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Entre na sua conta pra usar o modo caneta-vira-texto.");
  }
  const commaIdx = pngDataUrl.indexOf(",");
  const imageBase64 = commaIdx >= 0 ? pngDataUrl.slice(commaIdx + 1) : pngDataUrl;

  const { data, error } = await supabase.functions.invoke("handwriting-ocr", {
    body: { imageBase64, mimeType: "image/png" },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data?.text || "").trim();
}
