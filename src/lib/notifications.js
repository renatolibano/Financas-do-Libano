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
