// Camada do app Android (Capacitor). No navegador/PWA nada daqui faz efeito: isNative = false
// e tudo cai nos caminhos que já existiam (Notification do navegador, navigator.mediaSession...).
import { Capacitor } from "@capacitor/core";
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

// Agenda no Android os lembretes com hora (inclusive recorrentes), para tocarem com o app fechado.
// Ids >= 1.000.000.000 são destes agendamentos; a cada sincronização apaga os antigos e recria.
const SYNC_BASE = 1000000000;
const hashId = (str) => { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) | 0; return SYNC_BASE + (Math.abs(h) % 900000000); };
export async function syncReminderNotifications(reminders, enabled = true) {
  if (!isNative) return;
  try {
    const ln = await LN();
    const perm = await ln.checkPermissions();
    const pending = await ln.getPending();
    const old = (pending.notifications || []).filter(n => n.id >= SYNC_BASE);
    if (old.length) await ln.cancel({ notifications: old.map(n => ({ id: n.id })) });
    if (!enabled || perm.display !== "granted") return;
    await ensureChannel(ln);
    const out = [];
    for (const r of reminders || []) {
      if (!r.time || r.kind === "Aniversário" || !/^\d{1,2}:\d{2}$/.test(r.time)) continue;
      const [hour, minute] = r.time.split(":").map(Number);
      const base = { title: r.title, body: `Lembrete · ${r.kind || "Geral"} · ${r.time}`, channelId: CHANNEL, smallIcon: SMALL_ICON };
      const add = (key, on) => out.push({ ...base, id: hashId(r.id + ":" + key), schedule: { on: { ...on, hour, minute }, repeats: true, allowWhileIdle: true } });
      if (r.recurrence === "daily") add("d", {});
      else if (r.recurrence === "weekly") {
        for (const n of String(r.weekdays || "").split(",").filter(Boolean).map(Number)) if (n >= 0 && n <= 6) add("w" + n, { weekday: n + 1 }); // Android: 1 = domingo
      } else {
        const [dd, mm] = String(r.date || "").split("/").map(n => parseInt(n, 10));
        if (!(dd >= 1 && dd <= 31)) continue;
        if (r.recurrence === "monthly") add("m", { day: dd });
        else if (mm >= 1 && mm <= 12) add("y", { month: mm, day: dd }); // data dd/mm repete todo ano, como no app
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

export async function openExternal(url) {
  if (!isNative) { window.open(url, "_blank", "noopener"); return; }
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url });
}
