import React, { useEffect, useState } from "react";
import { Download, Sparkles, X } from "lucide-react";
import { isNative, APP_VERSION, checkForUpdate, openExternal, installUpdate, notifyUpdateAvailable, clearUpdateNotifications, onUpdateNotificationTap } from "../lib/native";

// Notas da versão (corpo do release no GitHub) -> até 6 linhas de texto simples.
const noteLines = (notes) => String(notes || "").split(/\r?\n/).map(l => l.replace(/^\s*(#{1,6}|[-*+]|\d+[.)])\s*/, "").replace(/[*_`]/g, "").trim()).filter(Boolean).slice(0, 6);

// Aviso de nova versão do app Android (só aparece dentro do APK): janela no centro da tela
// + notificação no celular lembrando de atualizar (tocar nela abre esta janela).
export default function UpdateBanner() {
  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!isNative) return;
    let alive = true, removeTap = () => {};
    const load = () => checkForUpdate();
    load().then(r => {
      if (!alive) return;
      if (!r) { clearUpdateNotifications(); return; }
      setInfo(r);
      if (sessionStorage.getItem("libano-update-dismissed") !== r.version) setOpen(true);
      notifyUpdateAvailable(r.version);
    });
    // Toque na notificação: abre direto a janela de atualização (mesmo que tenha sido dispensada antes).
    onUpdateNotificationTap(async () => {
      const r = await load();
      if (!alive || !r) return;
      setInfo(r); setOpen(true);
    }).then(fn => { if (alive) removeTap = fn; else fn(); });
    return () => { alive = false; removeTap(); };
  }, []);

  if (!info || !open) return null;
  const close = () => { if (busy) return; sessionStorage.setItem("libano-update-dismissed", info.version); setOpen(false); };
  const update = async () => {
    if (busy) return;
    setBusy(true); setPct(0); setMsg("");
    try {
      const status = await installUpdate(info.url, setPct);
      if (status === "permission") setMsg("Permita que o Libano instale apps e toque em Atualizar de novo.");
    } catch (err) {
      console.log("[atualização] falhou, abrindo no navegador", err);
      openExternal(info.url, true);
    }
    setBusy(false);
  };
  const lines = noteLines(info.notes);
  return (
    <div className="updateBack" onClick={close}>
      <div className="updateCard" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <button type="button" className="updateClose" onClick={close} disabled={busy} title="Depois"><X size={16}/></button>
        <div className="updateIcon"><Sparkles size={30}/></div>
        <h2>Nova versão disponível</h2>
        <div className="updateVersions"><span>{APP_VERSION}</span><i>→</i><b>{info.version}</b></div>
        {lines.length > 0 && <ul className="updateNotes">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
        {msg && <p className="updateMsg">{msg}</p>}
        {busy && <div className="updateBar" aria-label={`Baixando ${pct}%`}><div style={{ width: pct + "%" }}/></div>}
        <button type="button" className="updateGo" disabled={busy} onClick={update}><Download size={17}/> {busy ? `Baixando ${pct}%` : "Atualizar agora"}</button>
        <button type="button" className="updateLater" disabled={busy} onClick={close}>Depois</button>
      </div>
    </div>
  );
}
