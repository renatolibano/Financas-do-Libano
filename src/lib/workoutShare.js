// Texto bonito do treino para copiar e compartilhar (WhatsApp, Telegram, etc. — *negrito* funciona nesses apps).

export const WEEKDAY_FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

const KEYCAPS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
const DIVIDER = "━━━━━━━━━━━━━━";
const fmtNum = (v) => String(Number(v) || 0);

function rangeTxt(a, b) {
  return b != null && Number(b) !== Number(a) ? `${fmtNum(a)}–${fmtNum(b)}` : fmtNum(a);
}

// 90 → "90 s", 120 → "2 min", 90–120 → "90–120 s", 120–180 → "2–3 min"
function timeTxt(min, max) {
  const single = (s) => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s} s`);
  if (max != null && Number(max) !== Number(min)) {
    return min >= 60 && min % 60 === 0 && max % 60 === 0 ? `${min / 60}–${max / 60} min` : `${min}–${max} s`;
  }
  return single(Number(min));
}

function exerciseLines(it, n) {
  const mark = n <= KEYCAPS.length ? KEYCAPS[n - 1] : `${n}.`;
  const out = [`${mark} *${it.name}*`];

  if (it.metric) {
    const sets = Math.max(1, Number(it.sets) || 1);
    const setsTxt = `${sets} ${sets === 1 ? "série" : "séries"}`;
    const reps = it.reps != null ? { txt: rangeTxt(it.reps, it.reps_max), many: it.reps_max != null || Number(it.reps) > 1 }
      : it.metric === "quantidade" && it.amount != null ? { txt: fmtNum(it.amount), many: Number(it.amount) > 1 } : null;
    const repsTxt = reps ? `${reps.txt} ${reps.many ? "repetições" : "repetição"}` : "";

    let effort = "";
    if (it.metric === "carga") effort = [repsTxt, it.amount != null ? `com ${fmtNum(it.amount)} kg` : ""].filter(Boolean).join(" ");
    else if (it.metric === "quantidade") effort = repsTxt;
    else if (it.metric === "tempo") effort = it.amount != null ? timeTxt(Number(it.amount)) : "";

    out.push(`   💪 ${effort ? `${setsTxt} de ${effort}` : setsTxt}`);
    if (Number(it.rest_seconds) > 0) out.push(`   ⏱️ Descanso: ${timeTxt(Number(it.rest_seconds), it.rest_max)}`);
  }

  (it.goals || []).filter(Boolean).forEach((g) => out.push(`   • ${g}`));
  if (it.gif_url) out.push(`   🎬 ${it.gif_url}`);
  return out;
}

function notesLines(notes) {
  const text = String(notes || "").trim();
  return text ? ["📝 *Observações*", text] : [];
}

// days: [{ day: 0..6, items: [...], notes: "..." }] — um dia (copiar dia) ou vários (semana inteira).
export function buildWorkoutShareText(days) {
  const out = [];
  if (days.length === 1) {
    out.push(`🏋️ *TREINO · ${WEEKDAY_FULL[days[0].day]}*`, DIVIDER, "");
    days[0].items.forEach((it, i) => { out.push(...exerciseLines(it, i + 1), ""); });
    const n = notesLines(days[0].notes);
    if (n.length) out.push(...n);
  } else {
    out.push("🏋️ *MEU TREINO DA SEMANA*", DIVIDER, "");
    days.forEach((d, idx) => {
      out.push(`📅 *${WEEKDAY_FULL[d.day]}*`, "");
      d.items.forEach((it, i) => { out.push(...exerciseLines(it, i + 1), ""); });
      const n = notesLines(d.notes);
      if (n.length) out.push(...n, "");
      if (idx < days.length - 1) out.push(DIVIDER, "");
    });
  }
  return out.join("\n").trim();
}
