// Cálculos puros (sem React) para o painel de corridas do Strava.
// Tudo em "número de dia" (dias desde 1970, no fuso local da corrida) pra evitar
// problemas de fuso/horário de verão.

export const dayNum = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 864e5;
};
export const todayNum = () => {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 864e5;
};
export const dayToDate = (n) => new Date(n * 864e5); // usar com getUTC*
// 1970-01-01 foi quinta: segunda = 0
export const weekStart = (n) => n - ((n + 3) % 7);

export function fmtPace(sec) {
  if (!isFinite(sec) || sec <= 0) return "—";
  let m = Math.floor(sec / 60), s = Math.round(sec % 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, "0")}`;
}
export function fmtDuration(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h${String(m).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
export const fmtKm = (km, d = 1) => (km || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtDM = (n) => {
  const d = dayToDate(n);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const fmtDMY = (n) => `${fmtDM(n)}/${dayToDate(n).getUTCFullYear()}`;

// Normaliza as linhas do banco e descarta lixo (GPS bugado/corrida minúscula)
export function prepRuns(rows) {
  return (rows || [])
    .filter(r => r.distance >= 500 && r.moving_time > 0)
    .map(r => ({
      ...r,
      day: dayNum(r.start_date_local),
      km: r.distance / 1000,
      pace: r.moving_time / (r.distance / 1000),
    }))
    .sort((a, b) => a.day - b.day || String(a.start_date_local).localeCompare(String(b.start_date_local)));
}

export function summarize(list) {
  const n = list.length;
  const km = list.reduce((s, r) => s + r.km, 0);
  const time = list.reduce((s, r) => s + r.moving_time, 0);
  const hrs = list.filter(r => r.avg_hr);
  return {
    n, km, time,
    pace: km > 0 ? time / km : 0,
    longest: list.reduce((m, r) => Math.max(m, r.km), 0),
    elev: list.reduce((s, r) => s + (r.elevation || 0), 0),
    avgHr: hrs.length ? hrs.reduce((s, r) => s + r.avg_hr, 0) / hrs.length : 0,
  };
}

export const RANGES = [
  { key: "4w", label: "4 semanas", days: 28 },
  { key: "12w", label: "12 semanas", days: 84 },
  { key: "6m", label: "6 meses", days: 182 },
  { key: "1y", label: "1 ano", days: 365 },
  { key: "all", label: "Tudo", days: Infinity },
];

export function inWindow(runs, endDay, days) {
  const start = days === Infinity ? -Infinity : endDay - days;
  return runs.filter(r => r.day > start && r.day <= endDay);
}

// km por semana (segunda a domingo), das últimas `count` semanas, incluindo a atual
export function weeklySeries(runs, count, today = todayNum()) {
  const cur = weekStart(today);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const ws = cur - i * 7;
    const list = runs.filter(r => r.day >= ws && r.day < ws + 7);
    out.push({ start: ws, km: list.reduce((s, r) => s + r.km, 0), runs: list.length, current: i === 0 });
  }
  return out;
}

// Regressão linear simples: retorna inclinação (y por dia) e intercepto
export function linreg(points) {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0, den = 0;
  points.forEach(p => { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; });
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}

export function pctChange(cur, prev) {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

// Recordes (por média da corrida inteira, não por parcial de GPS)
export function records(runs) {
  const fastest = (minKm) => runs.filter(r => r.km >= minKm).reduce((b, r) => (!b || r.pace < b.pace ? r : b), null);
  const longest = runs.reduce((b, r) => (!b || r.km > b.km ? r : b), null);
  const climb = runs.reduce((b, r) => (!b || (r.elevation || 0) > (b.elevation || 0) ? r : b), null);
  const weeks = {};
  runs.forEach(r => { const w = weekStart(r.day); weeks[w] = (weeks[w] || 0) + r.km; });
  let bestWeek = null;
  Object.entries(weeks).forEach(([w, km]) => { if (!bestWeek || km > bestWeek.km) bestWeek = { start: Number(w), km }; });
  return {
    p5: fastest(5), p10: fastest(10), p21: fastest(21),
    longest, climb: climb && climb.elevation > 0 ? climb : null, bestWeek,
    totalKm: runs.reduce((s, r) => s + r.km, 0),
  };
}

// Leitura "Estou melhorando?" — compara as últimas 4 semanas com as 4 anteriores
export function progressInsights(runs, today = todayNum()) {
  const cur = inWindow(runs, today, 28);
  const prev = inWindow(runs, today - 28, 28);
  const a = summarize(cur), b = summarize(prev);
  const out = [];

  if (!a.n) {
    out.push({ tone: "warn", text: "Nenhuma corrida nas últimas 4 semanas. Que tal um treino leve hoje para retomar o ritmo?" });
    return { insights: out, cur: a, prev: b };
  }

  if (b.n && a.pace && b.pace) {
    const diff = a.pace - b.pace;
    if (Math.abs(diff) < 2) out.push({ tone: "ok", text: `Pace estável: ${fmtPace(a.pace)}/km nas últimas 4 semanas (antes: ${fmtPace(b.pace)}/km).` });
    else if (diff < 0) out.push({ tone: "good", text: `Você está mais rápido: pace médio de ${fmtPace(a.pace)}/km, ${Math.round(-diff)}s/km melhor que nas 4 semanas anteriores.` });
    else out.push({ tone: "warn", text: `Pace médio de ${fmtPace(a.pace)}/km, ${Math.round(diff)}s/km mais lento que nas 4 semanas anteriores — normal em fases de mais volume ou cansaço.` });
  }

  if (b.km) {
    const p = pctChange(a.km, b.km);
    if (Math.abs(p) < 5) out.push({ tone: "ok", text: `Volume parecido: ${fmtKm(a.km)} km (antes ${fmtKm(b.km)} km).` });
    else if (p > 0) out.push({ tone: "good", text: `Volume em alta: ${fmtKm(a.km)} km, ${Math.round(p)}% a mais que nas 4 semanas anteriores.` });
    else out.push({ tone: "warn", text: `Volume em queda: ${fmtKm(a.km)} km, ${Math.round(-p)}% a menos que nas 4 semanas anteriores.` });
  } else {
    out.push({ tone: "ok", text: `${fmtKm(a.km)} km corridos nas últimas 4 semanas.` });
  }

  const fa = a.n / 4, fb = b.n / 4;
  if (b.n) {
    if (fa > fb + 0.25) out.push({ tone: "good", text: `Mais constante: ${fmtKm(fa)} corridas por semana (antes ${fmtKm(fb)}).` });
    else if (fa < fb - 0.25) out.push({ tone: "warn", text: `Menos frequente: ${fmtKm(fa)} corridas por semana (antes ${fmtKm(fb)}).` });
  }

  // Carga: última semana fechada vs. média das 4 anteriores (regra dos ~10%)
  const lastClosed = weekStart(today) - 7;
  const closed = runs.filter(r => r.day >= lastClosed && r.day < lastClosed + 7).reduce((s, r) => s + r.km, 0);
  const base = [1, 2, 3, 4].map(i => runs.filter(r => r.day >= lastClosed - i * 7 && r.day < lastClosed - (i - 1) * 7).reduce((s, r) => s + r.km, 0));
  const baseAvg = base.reduce((s, v) => s + v, 0) / 4;
  if (baseAvg > 0 && closed > 0) {
    const p = pctChange(closed, baseAvg);
    if (p > 30) out.push({ tone: "bad", text: `Atenção à carga: a semana passada teve ${fmtKm(closed)} km, ${Math.round(p)}% acima da sua média das 4 semanas anteriores. Aumentos acima de ~10% por semana elevam o risco de lesão.` });
    else if (p > 10) out.push({ tone: "warn", text: `A semana passada teve ${fmtKm(closed)} km, ${Math.round(p)}% acima da média anterior — um pouco acima dos ~10% recomendados.` });
  }

  // Distância da longa
  if (b.longest && a.longest > b.longest * 1.05) out.push({ tone: "good", text: `Sua corrida mais longa recente foi de ${fmtKm(a.longest)} km (antes ${fmtKm(b.longest)} km).` });

  return { insights: out, cur: a, prev: b };
}

// Decodifica o "summary_polyline" do Strava (Google polyline, precisão 1e5)
export function decodePolyline(str) {
  const pts = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    let b, shift = 0, res = 0;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << shift; shift += 5; } while (b >= 32 && i < str.length + 1);
    lat += res & 1 ? ~(res >> 1) : res >> 1;
    shift = 0; res = 0;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << shift; shift += 5; } while (b >= 32 && i < str.length + 1);
    lng += res & 1 ? ~(res >> 1) : res >> 1;
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}

// Converte a rota em um "d" de SVG dentro de size x size (com margem)
export function routePath(polyline, size = 100, pad = 6) {
  if (!polyline) return null;
  const pts = decodePolyline(polyline);
  if (pts.length < 2) return null;
  const cosLat = Math.cos((pts[0][0] * Math.PI) / 180);
  const xy = pts.map(([la, lo]) => [lo * cosLat, -la]);
  const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX || 1e-9, h = maxY - minY || 1e-9;
  const k = (size - pad * 2) / Math.max(w, h);
  const ox = (size - w * k) / 2, oy = (size - h * k) / 2;
  const f = (n) => Math.round(n * 10) / 10;
  return xy.map(([x, y], i) => `${i ? "L" : "M"}${f((x - minX) * k + ox)} ${f((y - minY) * k + oy)}`).join("");
}
