// Leitura em voz alta (texto -> voz) usando a Web Speech API nativa do
// navegador. Não depende de rede, IA ou backend: o áudio é gerado pelo
// próprio dispositivo do usuário (igual ao botão de "escutar" do Quizlet),
// então não consome egress nem crédito de IA.

// Mapeia o código curto de idioma usado no app (ver lib/languages.js) pra uma
// tag BCP-47 que o synthesizer do navegador reconhece melhor.
const SPEECH_LANG_TAGS = {
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  ja: "ja-JP",
  ko: "ko-KR",
  zh: "zh-CN",
  ru: "ru-RU",
  ar: "ar-SA",
  nl: "nl-NL",
  sv: "sv-SE",
  no: "nb-NO",
  da: "da-DK",
  fi: "fi-FI",
  pl: "pl-PL",
  tr: "tr-TR",
  el: "el-GR",
  he: "he-IL",
  hi: "hi-IN",
  th: "th-TH",
  vi: "vi-VN",
  id: "id-ID",
  cs: "cs-CZ",
  ro: "ro-RO",
  hu: "hu-HU",
  uk: "uk-UA",
  la: "it-IT", // não existe voz de latim; italiano é a pronúncia mais próxima
};

export function speechLangTag(code) {
  return SPEECH_LANG_TAGS[code] || "pt-BR";
}

export function ttsSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Remove tags HTML (termos/definições são salvos com formatação rica) antes
// de mandar pro synthesizer, senão ele lê as tags junto com o texto.
function toPlainText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").trim();
}

// Toca o texto em voz alta no idioma indicado (código curto, ex: "en", "pt").
// Cancela qualquer fala em andamento antes de começar (evita sobrepor áudio
// se o usuário clicar em vários botões rápido). onStart/onEnd são opcionais,
// úteis pra animar o botão enquanto fala.
export function speak(html, langCode, { onStart, onEnd } = {}) {
  if (!ttsSupported()) return;
  const text = toPlainText(html);
  if (!text) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = speechLangTag(langCode);
  utterance.rate = 0.95;
  if (onStart) utterance.onstart = onStart;
  if (onEnd) { utterance.onend = onEnd; utterance.onerror = onEnd; }

  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
