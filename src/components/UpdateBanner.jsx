import React, { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { isNative, APP_VERSION, checkForUpdate, openExternal, installUpdate } from "../lib/native";

// Aviso de nova versão do app Android (só aparece dentro do APK).
export default function UpdateBanner() {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!isNative) return;
    let alive = true;
    checkForUpdate().then(r => { if (alive && r && sessionStorage.getItem("libano-update-dismissed") !== r.version) setInfo(r); });
    return () => { alive = false; };
  }, []);
  if (!info) return null;
  const close = () => { sessionStorage.setItem("libano-update-dismissed", info.version); setInfo(null); };
  const update = async () => {
    if (busy) return;
    setBusy(true); setPct(0); setMsg("");
    try {
      const status = await installUpdate(info.url, setPct);
      if (status === "permission") setMsg("Permita instalar apps deste app e toque em Atualizar de novo.");
    } catch (err) {
      console.log("[atualização] falhou, abrindo no navegador", err);
      openExternal(info.url, true);
    }
    setBusy(false);
  };
  return (
    <div className="updateBanner" role="status">
      <span>{msg || <>Nova versão <b>{info.version}</b> disponível (você tem {APP_VERSION}).</>}</span>
      <button type="button" className="primary" disabled={busy} onClick={update}><Download size={14}/> {busy ? `Baixando ${pct}%` : "Atualizar"}</button>
      <button type="button" className="ghost" onClick={close} title="Depois"><X size={14}/></button>
    </div>
  );
}
