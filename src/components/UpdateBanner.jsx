import React, { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { isNative, APP_VERSION, checkForUpdate, openExternal } from "../lib/native";

// Aviso de nova versão do app Android (só aparece dentro do APK).
export default function UpdateBanner() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!isNative) return;
    let alive = true;
    checkForUpdate().then(r => { if (alive && r && sessionStorage.getItem("libano-update-dismissed") !== r.version) setInfo(r); });
    return () => { alive = false; };
  }, []);
  if (!info) return null;
  const close = () => { sessionStorage.setItem("libano-update-dismissed", info.version); setInfo(null); };
  return (
    <div className="updateBanner" role="status">
      <span>Nova versão <b>{info.version}</b> disponível (você tem {APP_VERSION}).</span>
      <button type="button" className="primary" onClick={() => openExternal(info.url)}><Download size={14}/> Baixar</button>
      <button type="button" className="ghost" onClick={close} title="Depois"><X size={14}/></button>
    </div>
  );
}
