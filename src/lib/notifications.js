import { isNative, nativeRequestPermission, nativeNotify } from "./native";
// Toca um som de notificação (dois "bips" curtos) via Web Audio API — não depende de
// nenhum arquivo de áudio externo, então funciona offline como o resto do app.
// Reaproveitado por toda notificação do app (toasts, sininho de lembretes e os
// lembretes com hora marcada), pra dar sempre o mesmo "clique sonoro" ao chegar.
let notifAudioCtx = null;
export function playNotifSound() {
  try {
    if (!notifAudioCtx) notifAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = notifAudioCtx;
    if (ctx.state === "suspended") ctx.resume();
    const playTone = (freq, startOffset, duration) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      const start = ctx.currentTime + startOffset;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.28, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      o.connect(g); g.connect(ctx.destination);
      o.start(start);
      o.stop(start + duration + 0.02);
    };
    playTone(880, 0, 0.14);
    playTone(1180, 0.12, 0.18);
  } catch (err) { console.log("[notificação] não foi possível tocar o som", err); }
}

// Pede permissão de notificações do navegador (uma vez só — se já foi concedida ou
// negada antes, não pergunta de novo). Usado antes de agendar lembretes com hora.
export function requestNotificationPermission() {
  if (isNative) { nativeRequestPermission(); return; }
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

// Dispara uma notificação nativa do navegador/SO (fora da aba, se possível) e toca
// o som de notificação do app. Silenciosamente ignora se o navegador não suportar
// ou se a permissão não tiver sido concedida.
export function fireBrowserNotification(title, body) {
  playNotifSound();
  if (isNative) { nativeNotify(title, body); return; }
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" });
    }
  } catch (err) { console.log("[notificação] não foi possível exibir a notificação", err); }
}

// Notificações rápidas (toast) — usadas, por ex., quando uma Meta vinculada a um PDF é concluída automaticamente.
export function toast(message, type = "success") {
  playNotifSound();
  window.dispatchEvent(new CustomEvent("app:toast", { detail: { message, type } }));
}

// Faz o progresso de uma Meta (modo "Quantidade") vinculada a um PDF conversar automaticamente
// com o Leitor de PDF: conforme a página atual avança, a meta é atualizada e, ao concluir o
// intervalo de páginas definido, marca a meta como concluída e dispara uma notificação.
export function syncLinkedGoalsProgress(studyGoalsEntity, source, pdfId, pdfTitle, currentPage) {
  if (!studyGoalsEntity) return;
  const { data, update } = studyGoalsEntity;
  data.forEach(g => {
    if (g.mode !== "count" || g.link_source !== source || g.link_pdf_id !== pdfId) return;
    if (g.status !== "andamento") return;
    const start = Number(g.link_page_start) || 1;
    const target = Number(g.target_value) || 0;
    if (!target) return;
    const done = Math.max(0, Math.min(target, currentPage - start + 1));
    if (done === Number(g.current_value || 0)) return;
    const patch = { current_value: done };
    const justCompleted = done >= target;
    if (justCompleted) patch.status = "concluida";
    update(g.id, patch);
    if (justCompleted) {
      const label = source === "livro" ? "Leitura concluída" : "Estudo concluído";
      const verb = source === "livro" ? "lidas" : "estudadas";
      toast(`${label} — ${pdfTitle} · ${target} página${target === 1 ? "" : "s"} ${verb}`);
    }
  });
}

// Mesmo princípio da função acima, mas para Metas (modo "Quantidade") vinculadas a Flashcards.
// Como uma meta de flashcards pode reunir várias listas ("Card 1", "Card 2"...), o progresso é
// recalculado toda vez contando quantas das listas vinculadas já foram estudadas até o fim
// (campo "completed" de cada lista), e a meta conclui sozinha quando todas estiverem marcadas.
export function syncLinkedFlashcardGoalsProgress(studyGoalsEntity, listsData, listId, listTitle) {
  if (!studyGoalsEntity) return;
  const { data, update } = studyGoalsEntity;
  data.forEach(g => {
    if (g.mode !== "count" || g.link_source !== "flashcards") return;
    if (g.status !== "andamento") return;
    const linkedIds = Array.isArray(g.link_list_ids) ? g.link_list_ids : [];
    if (!linkedIds.includes(listId)) return;
    const target = Number(g.target_value) || linkedIds.length;
    if (!target) return;
    const done = linkedIds.filter(id => listsData.find(l => l.id === id)?.completed).length;
    if (done === Number(g.current_value || 0)) return;
    const patch = { current_value: done };
    const justCompleted = done >= target;
    if (justCompleted) patch.status = "concluida";
    update(g.id, patch);
    if (justCompleted) toast(`Meta concluída — todos os flashcards estudados 🎉`);
    else toast(`Flashcards estudados — ${listTitle} · ${done}/${target} listas concluídas`);
  });
}

// Marca uma lista de flashcards como estudada (assim que o usuário termina uma rodada completa
// em qualquer um dos modos: Cartões, Aprender ou Combinar) e sincroniza as Metas vinculadas a ela.
export function markFlashcardListStudied(listsEntity, studyGoalsEntity, listId, listTitle) {
  if (!listsEntity) return;
  const list = listsEntity.data.find(l => l.id === listId);
  if (list?.completed) return; // já estava contabilizada, evita atualizações repetidas
  listsEntity.update(listId, { completed: true });
  const updatedLists = listsEntity.data.map(l => l.id === listId ? { ...l, completed: true } : l);
  syncLinkedFlashcardGoalsProgress(studyGoalsEntity, updatedLists, listId, listTitle);
}

// ---------------------------------------------------------------------------
// Metas diárias (modo "diaria" em study_goals): "ler N páginas por dia" de um livro ou
// "ouvir N minutos por dia" de um audiolivro. O progresso do dia fica na própria meta
// (daily_done + daily_date) e zera sozinho quando a data muda.

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const DAILY_UNIT_LABEL = { paginas: "páginas", minutos: "minutos" };

// Quanto da meta já foi feito hoje.
export function dailyGoalToday(g) {
  return g.daily_date === isoToday() ? Number(g.daily_done) || 0 : 0;
}

// Service worker pronto (ou null se não houver / demorar) — "ready" nunca resolve sem registro.
async function getSwRegistration() {
  if (!navigator.serviceWorker) return null;
  try {
    return await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 1500))]);
  } catch (e) { return null; }
}

// Fecha a notificação persistente de uma meta diária (se estiver aparecendo).
export async function closeDailyGoalNotification(goalId) {
  try {
    const reg = await getSwRegistration();
    const list = await reg?.getNotifications({ tag: "daily-goal-" + goalId });
    list?.forEach(n => n.close());
  } catch (err) { /* sem service worker: nada a fechar */ }
}

// Soma progresso (páginas lidas / minutos ouvidos) nas metas diárias ligadas a esse item
// (source: "livro" | "audiolivro") e avisa quando a meta do dia é batida.
export function bumpDailyGoals(studyGoalsEntity, source, itemId, amount) {
  if (!studyGoalsEntity || !(amount > 0)) return;
  const { data, update } = studyGoalsEntity;
  const today = isoToday();
  data.forEach(g => {
    if (g.mode !== "diaria" || g.link_source !== source || g.link_pdf_id !== itemId || g.status !== "andamento") return;
    if (g.start_date && g.start_date > today) return;
    const target = Number(g.daily_target) || 0;
    if (!target) return;
    const before = dailyGoalToday(g);
    const done = Math.round((before + amount) * 100) / 100;
    update(g.id, { daily_done: done, daily_date: today });
    if (before < target && done >= target) {
      closeDailyGoalNotification(g.id);
      toast(`Meta diária concluída — ${g.title} 🎉`);
    }
  });
}

// Mantém a notificação das metas diárias pendentes: a partir do horário escolhido (daily_notify_time),
// mostra uma notificação persistente ("ainda falta ...") e a repete de hora em hora se tiver sido
// dispensada; ela some sozinha assim que a meta do dia é cumprida. Roda a cada minuto e ao voltar pro app.
// Observação: depende do app estar aberto/em segundo plano — sem servidor de push, o navegador não
// acorda um app totalmente fechado.
export async function syncDailyGoalNotifications(goals, { enabled, userId } = {}) {
  const today = isoToday();
  const now = new Date();
  const nowHM = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  const storageKey = "libano-daily-goal-notified-" + today;
  let last = {};
  try { last = JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch (e) { /* ignora */ }
  const reg = await getSwRegistration();

  for (const g of goals) {
    if ((g.mode !== "diaria" && g.mode !== "progressao") || (userId && g.user_id && g.user_id !== userId)) continue;
    // Meta de evolução: "feita hoje" = já registrou o dia (Consegui/Falhei); o lembrete é opcional (sem horário = sem aviso).
    const prog = g.mode === "progressao";
    const target = prog ? 1 : Number(g.daily_target) || 0;
    const done = prog ? (g.prog_date === today ? 1 : 0) : dailyGoalToday(g);
    const active = g.status === "andamento" && target > 0 && (!g.start_date || g.start_date <= today) && (!prog || !!g.daily_notify_time);
    if (!active || done >= target) { closeDailyGoalNotification(g.id); continue; }
    if (!enabled || nowHM < (g.daily_notify_time || "20:00")) continue;
    if (Date.now() - (last[g.id] || 0) < 60 * 60 * 1000) continue;
    const tag = "daily-goal-" + g.id;
    try {
      if (reg && (await reg.getNotifications({ tag })).length) continue; // ainda na bandeja
    } catch (e) { /* ignora */ }
    let title = "Meta diária pendente", body;
    if (prog) {
      const cur = Number(g.current_value) || 0, step = Number(g.prog_step) || 1, tgt = Number(g.target_value) || 0;
      const next = Math.round((tgt > 0 ? Math.min(tgt, cur + step) : cur + step) * 100) / 100;
      title = "Meta de evolução pendente";
      body = g.prog_hold ? `${g.title} — hoje é dia de manter os ${cur} ${g.unit || ""}.` : `${g.title} — hoje: chegue a ${next} ${g.unit || ""} (+${step}).`;
    } else {
      const left = Math.round((target - done) * 10) / 10;
      body = `${g.title} — faltam ${left} ${DAILY_UNIT_LABEL[g.daily_unit] || ""} hoje.`;
    }
    last[g.id] = Date.now();
    try { localStorage.setItem(storageKey, JSON.stringify(last)); } catch (e) { /* ignora */ }
    playNotifSound();
    if (isNative) { nativeNotify(title, body); continue; }
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        const opts = { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", requireInteraction: true, data: { url: "/" } };
        if (reg) await reg.showNotification(title, opts);
        else new Notification(title, opts);
      }
    } catch (err) { console.log("[meta diária] não foi possível exibir a notificação", err); }
  }
}
