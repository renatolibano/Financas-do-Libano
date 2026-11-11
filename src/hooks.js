import { useState, useEffect, useRef } from "react";
import { supabase, cloudConfigured } from "./lib/supabaseClient";
import { isNative, setNativeOrientation } from "./lib/native";

// Hook reutilizável de tela cheia: usa a Fullscreen API do navegador no elemento apontado por `ref`,
// o que no celular também esconde a barra de endereço/navegação. Se o navegador não suportar a API
// (ex.: Safari iOS mais antigo), cai para uma classe CSS que expande o elemento ocupando a tela toda.
// Passe { native: false } pra pular a Fullscreen API de propósito e usar só a classe CSS — o próprio
// navegador mostra um botão de "sair da tela cheia" por cima do conteúdo ao mexer o mouse quando a API
// real está ativa, e em algumas telas (como o quadro infinito) isso atrapalha mais do que ajuda.
// Passe { startOpen: true } pra já nascer com a classe CSS de tela cheia aplicada (sem chamar a
// Fullscreen API sozinha, que exige gesto do usuário) — é o mesmo efeito visual do quadro infinito.
export function useFullscreen(ref, { native = true, startOpen = false } = {}) {
  const [fullscreen, setFullscreen] = useState(startOpen);

  useEffect(() => {
    if (!native) return;
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [native]);

  const toggleFullscreen = async () => {
    if (!native) { setFullscreen(f => !f); return; }
    try {
      if (!document.fullscreenElement) {
        await ref.current?.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch (e) {
      setFullscreen(f => !f); // navegador sem suporte: usa a classe CSS de tela cheia mesmo assim
    }
  };

  useEffect(() => () => { if (native && document.fullscreenElement === ref.current) document.exitFullscreen?.().catch(()=>{}); }, [native]);

  return [fullscreen, toggleFullscreen];
}

// Botão de girar a tela (celular): alterna entre horizontal travado e o comportamento normal.
// No app Android usa o plugin nativo; no navegador usa fullscreen + Screen Orientation API
// (que o iOS não suporta — aí avisa).
export function useScreenRotate(ref) {
  const [landscape, setLandscape] = useState(false);
  const onRef = useRef(false);
  const enteredFs = useRef(false);

  const toggle = async () => {
    const next = !onRef.current;
    try {
      if (isNative) await setNativeOrientation(next ? "landscape" : "auto");
      else if (next) {
        if (!document.fullscreenElement) {
          await (ref?.current || document.documentElement).requestFullscreen?.();
          enteredFs.current = !!document.fullscreenElement;
        }
        await screen.orientation.lock("landscape");
      } else {
        screen.orientation.unlock();
        if (enteredFs.current && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        enteredFs.current = false;
      }
      onRef.current = next;
      setLandscape(next);
    } catch (e) {
      alert("Este navegador não permite girar a tela por aqui. No app Android ou no Chrome do celular funciona.");
    }
  };

  useEffect(() => () => {
    if (!onRef.current) return;
    if (isNative) setNativeOrientation("auto").catch(() => {});
    else { try { screen.orientation.unlock(); } catch (e) {} }
  }, []);

  return [landscape, toggle];
}

export function useSession(){
  const [session,setSession] = useState(null);
  const [checking,setChecking] = useState(cloudConfigured);
  // Fica true quando o usuário chega via link de "esqueci minha senha"
  // (Supabase dispara o evento PASSWORD_RECOVERY e já cria uma sessão).
  // Enquanto for true, o Root() mostra a tela de nova senha em vez do app.
  const [recovery,setRecovery] = useState(false);
  useEffect(()=>{
    if(!cloudConfigured){ setChecking(false); return; }
    supabase.auth.getSession().then(({data})=>{
      setSession(data.session);
      setChecking(false);
    });
    const {data:sub} = supabase.auth.onAuthStateChange((event, s)=>{
      setSession(s);
      if(event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return ()=>sub.subscription.unsubscribe();
  },[]);
  return {session, checking, recovery};
}

export function useTheme(){
  const [theme,setTheme] = useState(()=>{
    try{ return localStorage.getItem("libano-theme") || "dark"; }catch(e){ return "dark"; }
  });
  useEffect(()=>{
    document.documentElement.setAttribute("data-theme", theme);
    try{ localStorage.setItem("libano-theme", theme); }catch(e){}
  },[theme]);
  return [theme,setTheme];
}

// Guarda quais notificações já foram marcadas como lidas HOJE (reseta sozinho no dia seguinte).
export function useDismissedToday(){
  const storageKey = "libano-notifs-dismissed-"+new Date().toISOString().slice(0,10);
  const [dismissed,setDismissed] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem(storageKey)||"[]"); }catch(e){ return []; }
  });
  const dismissAll = (ids)=>{
    setDismissed(prev=>{
      const merged = Array.from(new Set([...prev,...ids]));
      try{ localStorage.setItem(storageKey, JSON.stringify(merged)); }catch(e){}
      return merged;
    });
  };
  return [dismissed, dismissAll];
}
