// Camada do app Android (Capacitor). No navegador/PWA nada daqui faz efeito: isNative = false
// e tudo cai nos caminhos que já existiam (Notification do navegador, navigator.mediaSession...).
import { Capacitor, registerPlugin } from "@capacitor/core";
import { MediaSession } from "@jofr/capacitor-media-session";

export const isNative = Capacitor.isNativePlatform();
// Endereço do site (PWA). No APK o app roda em https://localhost, então links de e-mail precisam apontar pra cá.
export const SITE_URL = "https://libanoapp.pages.dev";
export const appOrigin = () => (isNative ? SITE_URL : window.location.origin);
export const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";
const CONFIG = typeof __APP_CONFIG__ !== "undefined" ? __APP_CONFIG__ : {};

// ---------- Media Session (controles na notificação/tela de bloqueio + áudio com tela apagada) ----------
// O WebView do Android não tem navigator.mediaSession; o plugin oferece uma API equivalente.
export const hasMediaSession = () => isNative || (typeof navigator !== "undefined" && "mediaSession" in navigator);
export const makeMediaMetadata = (o) => (isNative ? o : new window.MediaMetadata(o));
export function getMediaSession() {
  if (!isNative) return navigator.mediaSession;
  const quiet = (p) => p?.catch?.(() => {});
  return {
    set metadata(m) { quiet(MediaSession.setMetadata({ title: m.title, artist: m.artist, album: m.album, artwork: m.artwork })); },
    set playbackState(s) { quiet(MediaSession.setPlaybackState({ playbackState: s })); },
    setActionHandler(action, handler) { return quiet(MediaSession.setActionHandler({ action }, handler)); },
    setPositionState(st) { return quiet(MediaSession.setPositionState(st)); },
  };
}

// ---------- Notificações locais ----------
const CHANNEL = "libano-lembretes";
const SMALL_ICON = "ic_stat_icon";
let channelReady = false;
const LN = () => import("@capacitor/local-notifications").then(m => m.LocalNotifications);

async function ensureChannel(ln) {
  if (channelReady) return;
  try { await ln.createChannel({ id: CHANNEL, name: "Lembretes e metas", importance: 4, vibration: true, visibility: 1 }); } catch { /* ignora */ }
  channelReady = true;
}

export async function nativeRequestPermission() {
  if (!isNative) return;
  try {
    const ln = await LN();
    const p = await ln.checkPermissions();
    if (p.display !== "granted") await ln.requestPermissions();
  } catch { /* ignora */ }
}

// Notificação imediata (mesma função que no navegador usava new Notification).
export async function nativeNotify(title, body) {
  if (!isNative) return;
  try {
    const ln = await LN();
    const p = await ln.checkPermissions();
    if (p.display !== "granted") return;
    await ensureChannel(ln);
    await ln.schedule({ notifications: [{ id: Math.floor(Math.random() * 900000000) + 1, title, body, channelId: CHANNEL, smallIcon: SMALL_ICON, schedule: { at: new Date(Date.now() + 300) } }] });
  } catch (err) { console.log("[notificação] falhou no app", err); }
}

// Agenda no Android os lembretes (inclusive recorrentes e aniversários), para tocarem com o app fechado:
//  · 1 dia antes (18h) · no próprio dia (na hora marcada, ou 9h se não tiver hora) · 1h antes (só com hora).
// Ids >= 1.000.000.000 são destes agendamentos; a cada sincronização apaga os antigos e recria.
const SYNC_BASE = 1000000000;
const EVE_HOUR = 18;    // aviso "amanhã"
const MORNING_HOUR = 9; // lembrete sem hora: avisa de manhã no próprio dia
const hashId = (str) => { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) | 0; return SYNC_BASE + (Math.abs(h) % 900000000); };

// Partes da data de cada ocorrência (weekday: 0 = domingo)
function reminderDates(r) {
  if (r.recurrence === "daily") return [{ k: "d" }];
  if (r.recurrence === "weekly") return String(r.weekdays || "").split(",").filter(Boolean).map(Number).filter(n => n >= 0 && n <= 6).map(n => ({ k: "w" + n, weekday: n }));
  const [dd, mm] = String(r.date || "").split("/").map(n => parseInt(n, 10));
  if (!(dd >= 1 && dd <= 31)) return [];
  if (r.recurrence === "monthly") return [{ k: "m", day: dd }];
  return mm >= 1 && mm <= 12 ? [{ k: "y", month: mm, day: dd }] : []; // data dd/mm repete todo ano, como no app
}
// Dia anterior à ocorrência (null quando não dá pra expressar como repetição do Android)
function dayBefore(o) {
  if (o.k === "d") return o;
  if (o.weekday !== undefined) return { k: o.k + "-1", weekday: (o.weekday + 6) % 7 };
  if (o.day > 1) return { ...o, k: o.k + "-1", day: o.day - 1 };
  if (o.k === "m") return null;
  const month = o.month === 1 ? 12 : o.month - 1;
  return { ...o, k: o.k + "-1", month, day: new Date(2001, month, 0).getDate() };
}
const onOf = (o, hour, minute) => {
  const on = { hour, minute };
  if (o.weekday !== undefined) on.weekday = o.weekday + 1; // Android: 1 = domingo
  if (o.month) on.month = o.month;
  if (o.day) on.day = o.day;
  return on;
};

export async function syncReminderNotifications(reminders, enabled = true, birthdaysEnabled = enabled) {
  if (!isNative) return;
  try {
    const ln = await LN();
    const perm = await ln.checkPermissions();
    const pending = await ln.getPending();
    const old = (pending.notifications || []).filter(n => n.id >= SYNC_BASE);
    if (old.length) await ln.cancel({ notifications: old.map(n => ({ id: n.id })) });
    if ((!enabled && !birthdaysEnabled) || perm.display !== "granted") return;
    await ensureChannel(ln);
    const out = [];
    for (const r of reminders || []) {
      const bday = r.kind === "Aniversário";
      if (!(bday ? birthdaysEnabled : enabled)) continue;
      const tm = /^(\d{1,2}):(\d{2})$/.exec(bday ? "" : String(r.time || ""));
      const label = bday ? "Aniversário" : "Lembrete · " + (r.kind || "Geral");
      const add = (o, suffix, hour, minute, body) => out.push({ id: hashId(r.id + ":" + o.k + suffix), title: r.title, body, channelId: CHANNEL, smallIcon: SMALL_ICON, schedule: { on: onOf(o, hour, minute), repeats: true, allowWhileIdle: true } });
      for (const o of reminderDates(r)) {
        // 1 dia antes
        if (o.k !== "d") {
          const eveBody = "Amanhã · " + label + (tm ? " · " + r.time : "");
          const eve = dayBefore(o);
          if (eve) add(eve, "e", EVE_HOUR, 0, eveBody);
          else { // mensal no dia 1: o dia anterior é o último dia do mês (varia), então agenda a próxima ocorrência
            const now = new Date();
            let at = new Date(now.getFullYear(), now.getMonth() + 1, 0, EVE_HOUR, 0);
            if (at <= now) at = new Date(now.getFullYear(), now.getMonth() + 2, 0, EVE_HOUR, 0);
            out.push({ id: hashId(r.id + ":m-1e"), title: r.title, body: eveBody, channelId: CHANNEL, smallIcon: SMALL_ICON, schedule: { at, allowWhileIdle: true } });
          }
        }
        // no próprio dia
        if (tm) {
          const hour = Number(tm[1]), minute = Number(tm[2]);
          add(o, "s", hour, minute, `${label} · ${r.time}`);
          // 1h antes
          if (hour >= 1) add(o, "h", hour - 1, minute, `Em 1 hora · ${label} · ${r.time}`);
          else { const prev = dayBefore(o); if (prev) add(prev, "h", 23, minute, `Em 1 hora · ${label} · ${r.time}`); }
        } else add(o, "s", MORNING_HOUR, 0, bday ? "Aniversário hoje" : "Hoje · " + label);
      }
    }
    if (out.length) await ln.schedule({ notifications: out });
  } catch (err) { console.log("[lembretes] não foi possível agendar no Android", err); }
}

// ---------- Atualização do app (APK publicado no GitHub Releases) ----------
const parseV = (v) => String(v).replace(/^v/i, "").split(".").map(n => parseInt(n, 10) || 0);
const isNewer = (a, b) => { const x = parseV(a), y = parseV(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

export async function checkForUpdate() {
  if (!isNative || !CONFIG.repo || /^SEU-/i.test(CONFIG.repo)) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${CONFIG.repo}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const rel = await res.json();
    const version = String(rel.tag_name || "").replace(/^v/i, "");
    const asset = (rel.assets || []).find(a => a.name === (CONFIG.apkName || "libano.apk"));
    if (!version || !asset || !isNewer(version, APP_VERSION)) return null;
    return { version, url: asset.browser_download_url, notes: String(rel.body || "") };
  } catch { return null; }
}

// system = true: abre no navegador padrão do sistema (downloads, como o do APK, funcionam melhor do que na aba embutida).
// Baixa o APK dentro do app e abre o instalador do Android. Retorna "installing" ou "permission"
// (1ª vez: o Android pede para permitir instalar apps deste app — depois é só tocar em Atualizar de novo).
export async function installUpdate(url, onProgress) {
  const ApkInstaller = registerPlugin("ApkInstaller");
  const handle = await ApkInstaller.addListener("progress", e => onProgress?.(e.percent));
  try { return (await ApkInstaller.install({ url })).status; } finally { handle.remove(); }
}

export async function openExternal(url, system = false) {
  if (!isNative) { window.open(url, "_blank", "noopener"); return; }
  if (system) {
    try {
      const { App } = await import("@capacitor/app");
      await App.openUrl({ url });
      return;
    } catch { /* cai na aba embutida */ }
  }
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url });
}
