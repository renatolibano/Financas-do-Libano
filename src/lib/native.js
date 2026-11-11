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
// ATENÇÃO: não devolva o plugin direto de uma Promise. O plugin do Capacitor é um Proxy: ao resolver a Promise o JS
// procura `.then` nele, o Proxy repassa essa chamada ao Android e ela nunca responde (o `await` trava para sempre).
// Por isso devolvemos um objeto simples que só repassa os métodos usados.
const LN = async () => {
  const { LocalNotifications: P } = await import("@capacitor/local-notifications");
  return {
    checkPermissions: () => P.checkPermissions(),
    requestPermissions: () => P.requestPermissions(),
    createChannel: (o) => P.createChannel(o),
    schedule: (o) => P.schedule(o),
    getPending: () => P.getPending(),
    cancel: (o) => P.cancel(o),
    addListener: (e, f) => P.addListener(e, f),
  };
};

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

// Teste manual (Configurações > Notificações): agenda uma notificação para daqui 5s e devolve um diagnóstico em texto.
// Cada etapa tem limite de tempo: se o Android/plugin não responder, o texto diz em qual etapa parou.
const withTimeout = (label, p, ms = 10000) => Promise.race([
  Promise.resolve(p),
  new Promise((_, rej) => setTimeout(() => rej(new Error(`sem resposta em ${Math.round(ms / 1000)}s`)), ms)),
]).catch((e) => { throw new Error(`etapa "${label}": ${e?.message || e}`); });

export async function testNativeNotification() {
  if (!isNative) return "O teste só funciona no app Android.";
  const done = [];
  const ok = (t) => done.push("✓ " + t);
  const info = `Plataforma: ${Capacitor.getPlatform()} · plugin LocalNotifications: ${Capacitor.isPluginAvailable("LocalNotifications") ? "disponível" : "NÃO disponível"}`;
  try {
    const ln = await withTimeout("carregar plugin", LN()); ok("plugin carregado");
    let p = await withTimeout("ver permissão", ln.checkPermissions()); ok(`permissão atual: ${p.display}`);
    if (p.display !== "granted") { p = await withTimeout("pedir permissão", ln.requestPermissions(), 30000); ok(`permissão após pedir: ${p.display}`); }
    if (p.display !== "granted") return "O Android bloqueou as notificações do app. Ative em Configurações > Apps > Libano > Notificações.\n\n" + info + "\n" + done.join("\n");
    try { await withTimeout("criar canal", ln.createChannel({ id: CHANNEL, name: "Lembretes e metas", importance: 4, vibration: true, visibility: 1 })); ok("canal criado"); channelReady = true; }
    catch (e) { done.push("✗ " + e.message + " (seguindo sem canal)"); }
    await withTimeout("agendar", ln.schedule({ notifications: [{ id: 888888803, title: "Teste do Libano", body: "Se você está vendo isso, as notificações funcionam.", channelId: CHANNEL, smallIcon: SMALL_ICON, schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true } }] })); ok("agendada");
    const pending = await withTimeout("listar agendadas", ln.getPending()); ok(`agendadas no total: ${(pending.notifications || []).length}`);
    return `Teste agendado para daqui 5 segundos — saia do app para conferir.\n\n${info}\n${done.join("\n")}`;
  } catch (err) { return `Falhou — ${err?.message || err}\n\n${info}\n${done.join("\n")}`; }
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

// Uma única vez: abre o aviso do Android "permitir que o app rode em segundo plano" (sem isso a economia de bateria
// da Samsung/Xiaomi etc. pode impedir os lembretes de tocar com o app fechado).
async function allowBackgroundOnce() {
  try {
    if (localStorage.getItem("libano-battery-asked")) return;
    localStorage.setItem("libano-battery-asked", "1");
    await registerPlugin("Background").allowIgnoreBattery();
  } catch { /* ignora */ }
}

export async function syncReminderNotifications(reminders, enabled = true, birthdaysEnabled = enabled) {
  if (!isNative) return;
  try {
    const ln = await LN();
    let perm = await ln.checkPermissions();
    if (perm.display !== "granted" && (enabled || birthdaysEnabled)) perm = await ln.requestPermissions(); // Android 13+: pergunta já na abertura do app
    const pending = await ln.getPending();
    const old = (pending.notifications || []).filter(n => n.id >= SYNC_BASE);
    if (old.length) await ln.cancel({ notifications: old.map(n => ({ id: n.id })) });
    if ((!enabled && !birthdaysEnabled) || perm.display !== "granted") return;
    await ensureChannel(ln);
    const out = [];
    for (const r of reminders || []) {
      const bday = r.kind === "Aniversário";
      if (!(bday ? birthdaysEnabled : enabled)) continue;
      const times = bday ? [] : parseTimes(r.time);
      const label = bday ? "Aniversário" : "Lembrete · " + (r.kind || "Geral");
      const dsc = bday ? "" : String(r.description || "").trim().slice(0, 160);
      const withDsc = (b) => (dsc ? b + "\n" + dsc : b);
      const add = (o, suffix, hour, minute, body) => out.push({ id: hashId(r.id + ":" + o.k + suffix), title: r.title, body: withDsc(body), channelId: CHANNEL, smallIcon: SMALL_ICON, schedule: { on: onOf(o, hour, minute), repeats: true, allowWhileIdle: true } });
      for (const o of reminderDates(r)) {
        // 1 dia antes
        if (o.k !== "d") {
          const eveBody = "Amanhã · " + label + (times.length ? " · " + times.join(", ") : "");
          const eve = dayBefore(o);
          if (eve) add(eve, "e", EVE_HOUR, 0, eveBody);
          else { // mensal no dia 1: o dia anterior é o último dia do mês (varia), então agenda a próxima ocorrência
            const now = new Date();
            let at = new Date(now.getFullYear(), now.getMonth() + 1, 0, EVE_HOUR, 0);
            if (at <= now) at = new Date(now.getFullYear(), now.getMonth() + 2, 0, EVE_HOUR, 0);
            out.push({ id: hashId(r.id + ":m-1e"), title: r.title, body: withDsc(eveBody), channelId: CHANNEL, smallIcon: SMALL_ICON, schedule: { at, allowWhileIdle: true } });
          }
        }
        // no próprio dia
        if (times.length) {
          times.forEach((hm, i) => {
            const [hh, mm] = hm.split(":").map(Number);
            add(o, "s" + i, hh, mm, `${label} · ${hm}`);
            // 1h antes
            if (hh >= 1) add(o, "h" + i, hh - 1, mm, `Em 1 hora · ${label} · ${hm}`);
            else { const prev = dayBefore(o); if (prev) add(prev, "h" + i, 23, mm, `Em 1 hora · ${label} · ${hm}`); }
          });
        } else add(o, "s", MORNING_HOUR, 0, bday ? "Aniversário hoje" : "Hoje · " + label);
      }
    }
    if (out.length) { await ln.schedule({ notifications: out }); allowBackgroundOnce(); }
  } catch (err) { console.log("[lembretes] não foi possível agendar no Android", err); }
}

function parseTimes(v) {
  const out = [];
  String(v || "").split(/[,;\s]+/).forEach((t) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t);
    if (m && +m[1] < 24 && +m[2] < 60) { const hm = String(m[1]).padStart(2, "0") + ":" + m[2]; if (!out.includes(hm)) out.push(hm); }
  });
  return out.sort();
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
// Notificação "Nova versão disponível": uma imediata (1x por versão) + um lembrete diário às 10h até atualizar.
// Ao tocar, o app abre direto no aviso de atualização (ver onUpdateNotificationTap).
const UPDATE_NOTIF_NOW = 888888801, UPDATE_NOTIF_DAILY = 888888802;
export async function notifyUpdateAvailable(version) {
  if (!isNative) return;
  try {
    const ln = await LN();
    let p = await ln.checkPermissions();
    if (p.display !== "granted") p = await ln.requestPermissions();
    if (p.display !== "granted") return;
    await ensureChannel(ln);
    const base = { title: "Nova versão do Libano disponível", body: `A versão ${version} está pronta. Toque para atualizar.`, channelId: CHANNEL, smallIcon: SMALL_ICON, extra: { action: "update" } };
    const list = [{ ...base, id: UPDATE_NOTIF_DAILY, schedule: { on: { hour: 10, minute: 0 }, repeats: true, allowWhileIdle: true } }];
    if (localStorage.getItem("libano-update-notified") !== version) {
      list.push({ ...base, id: UPDATE_NOTIF_NOW, schedule: { at: new Date(Date.now() + 500) } });
      localStorage.setItem("libano-update-notified", version);
    }
    await ln.schedule({ notifications: list });
  } catch (err) { console.log("[atualização] não foi possível notificar", err); }
}
export async function clearUpdateNotifications() {
  if (!isNative) return;
  try { const ln = await LN(); await ln.cancel({ notifications: [{ id: UPDATE_NOTIF_NOW }, { id: UPDATE_NOTIF_DAILY }] }); } catch { /* ignora */ }
}
// Chama cb quando a pessoa toca na notificação de atualização. Retorna a função que remove o ouvinte.
export async function onUpdateNotificationTap(cb) {
  if (!isNative) return () => {};
  try {
    const ln = await LN();
    const h = await ln.addListener("localNotificationActionPerformed", e => { if (e?.notification?.extra?.action === "update") cb(); });
    return () => h.remove();
  } catch { return () => {}; }
}

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

// ---------- Girar a tela (leitor de livros / audiolivros) ----------
// mode: "landscape" | "portrait" | "auto". Só no app Android; no navegador use a Screen Orientation API (ver useScreenRotate).
export async function setNativeOrientation(mode) {
  await registerPlugin("Orientation").setMode({ mode });
}
