import React, { useState, useEffect, useRef } from "react";
import { MoreVertical, CheckCircle2, Bell, CheckCheck, Cake, CircleDollarSign, CalendarClock, Repeat2, Target, Flag, PartyPopper, Eraser, Keyboard, WandSparkles } from "lucide-react";
import { urgencyClass } from "../lib/calendar";
import { playNotifSound } from "../lib/notifications";
import { useDismissedToday } from "../hooks";
import { recognizeHandwriting } from "../lib/handwriting";

// Painel de "caneta vira texto": um canvas onde a pessoa escreve à mão (com
// o dedo, mouse ou stylus) e um botão "Converter" que manda o desenho pra
// IA transcrever. Usado tanto na caixa de texto do anotador de PDF quanto
// na do quadro infinito — os dois só trocam o textarea por este painel
// enquanto o modo caneta está ativo. Resolução interna do canvas é fixa
// (maior que a caixa na tela) pra a transcrição sair mais nítida.
const HANDWRITING_CANVAS_W = 640;
const HANDWRITING_CANVAS_H = 220;

export function HandwritingPad({ onConvert, onCancel }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPtRef = useRef(null);
  const hasInkRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
    setError(null);
  };

  const handlePointerDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    try { canvasRef.current.setPointerCapture?.(e.pointerId); } catch (err) {}
    drawingRef.current = true;
    lastPtRef.current = getPos(e);
  };
  const handlePointerMove = (e) => {
    if (!drawingRef.current) return;
    e.stopPropagation();
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPtRef.current = pos;
    hasInkRef.current = true;
  };
  const handlePointerUp = (e) => {
    if (drawingRef.current) e.stopPropagation();
    drawingRef.current = false;
  };

  const handleConvert = async () => {
    if (!hasInkRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      const text = await recognizeHandwriting(dataUrl);
      if (!text) {
        setError("Não consegui reconhecer nada legível — tente escrever maior ou mais separado.");
        return;
      }
      onConvert(text);
    } catch (err) {
      setError(err.message || "Não foi possível converter agora.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="handwritingPad" onPointerDown={e => e.stopPropagation()}>
      <canvas
        ref={canvasRef}
        width={HANDWRITING_CANVAS_W}
        height={HANDWRITING_CANVAS_H}
        className="handwritingPadCanvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={e => e.preventDefault()}
      />
      {error && <div className="handwritingPadError">{error}</div>}
      <div className="handwritingPadBar">
        <button type="button" title="Limpar" onClick={clearCanvas} disabled={busy}><Eraser size={15}/></button>
        <button type="button" title="Voltar pro teclado" onClick={onCancel} disabled={busy}><Keyboard size={15}/></button>
        <button type="button" className="handwritingPadConvert" onClick={handleConvert} disabled={busy}>
          <WandSparkles size={15}/> {busy ? "Convertendo…" : "Converter"}
        </button>
      </div>
    </div>
  );
}

export function ReminderCard({icon, title, subtitle, days, onToggleMenu, menuOpen, menuContent, children}){
  const cls = urgencyClass(days);
  return <div className={"reminderCard "+cls}>
    <div className="reminderCardTop">
      <div className="reminderCardLeft">
        <div className="reminderCardIcon">{icon}</div>
        <div><b>{title}</b>{subtitle && <small>{subtitle}</small>}</div>
      </div>
      <div className="reminderCardRight">
        {onToggleMenu && <button className="reminderCardMenu" onClick={(e)=>{e.stopPropagation(); onToggleMenu();}}><MoreVertical size={18}/></button>}
        <div className="reminderCardCount">
          <strong>{days!==null && days!==undefined ? Math.max(days,0) : "—"}</strong>
          <small>{days===1?"DIA RESTANTE":"DIAS RESTANTES"}</small>
        </div>
      </div>
    </div>
    {menuOpen && <div className="reminderCardMenuPop" onClick={e=>e.stopPropagation()}>{menuContent}</div>}
    {children}
  </div>
}

export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const handler = (e) => {
      const id = crypto.randomUUID();
      const { message, type } = e.detail || {};
      setItems(prev => [...prev, { id, message, type }]);
      setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 6000);
    };
    window.addEventListener("app:toast", handler);
    return () => window.removeEventListener("app:toast", handler);
  }, []);
  if (items.length === 0) return null;
  return (
    <div className="toastHost">
      {items.map(t => (
        <div key={t.id} className="toastItem">
          <div className="toastItemIcon"><CheckCircle2 size={16}/></div>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export function notifIcon(kind, size=16){
  if(kind==="Aniversário") return <Cake size={size}/>;
  if(kind==="Dívida") return <CircleDollarSign size={size}/>;
  if(kind==="Fixo") return <CalendarClock size={size}/>;
  if(kind==="Recorrente") return <Repeat2 size={size}/>;
  if(kind==="Meta") return <Target size={size}/>;
  if(kind==="Feriado") return <Flag size={size}/>;
  if(kind==="Comemorativa") return <PartyPopper size={size}/>;
  return <Bell size={size}/>;
}

// Categorias de notificação que aparecem no sininho — usado tanto pra montar a
// lista quanto pra renderizar os toggles individuais na tela de Configurações.
export const NOTIF_KIND_DEFS = [
  { key:"Lembrete", label:"Lembretes comuns" },
  { key:"Aniversário", label:"Aniversários" },
  { key:"Dívida", label:"Dívidas" },
  { key:"Fixo", label:"Pagamentos fixos" },
  { key:"Recorrente", label:"Recorrentes" },
  { key:"Meta", label:"Metas de estudo" },
  { key:"Feriado", label:"Feriados" },
  { key:"Comemorativa", label:"Datas comemorativas" },
];

export function NotificationsBell({items, goTo}){
  const [open,setOpen] = useState(false);
  const [dismissed,dismissAll] = useDismissedToday();
  const ref = useRef(null);
  const seenIdsRef = useRef(null);

  useEffect(()=>{
    const onDoc = (e)=>{ if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return ()=>document.removeEventListener("mousedown", onDoc);
  },[]);

  // Toca o som de notificação sempre que um item NOVO aparece no sininho
  // (ex.: um lembrete que passou a vencer amanhã). Na primeira renderização
  // só registra o que já existe, sem tocar som — o som é só para chegadas novas.
  useEffect(()=>{
    const currentIds = new Set(items.map(it=>it.id));
    if(seenIdsRef.current===null){
      seenIdsRef.current = currentIds;
      return;
    }
    const hasNew = items.some(it=>!seenIdsRef.current.has(it.id));
    if(hasNew) playNotifSound();
    seenIdsRef.current = currentIds;
  },[items]);

  const visible = items.filter(it=>!dismissed.includes(it.id));
  const count = visible.length;

  return <div className="notifWrap" ref={ref}>
    <button className="notifBellBtn" onClick={()=>setOpen(o=>!o)} title="Notificações">
      <Bell size={19}/>
      {count>0 && <span className="notifBadge">{count>9?"9+":count}</span>}
    </button>
    {open && <div className="notifPop">
      <div className="notifPopHead">
        <div className="notifPopIcon"><Bell size={18}/></div>
        <div><b>Notificações</b><small>Vence amanhã, é bom não esquecer</small></div>
      </div>
      <div className="notifList">
        {visible.length===0 && <div className="notifEmpty">
          <div className="notifEmptyIcon"><CheckCheck size={22}/></div>
          <b>Tudo em dia!</b>
          <small>Nada vencendo amanhã.</small>
        </div>}
        {visible.map(it=><button key={it.id} className="notifItem" onClick={()=>{goTo(it.page); setOpen(false);}}>
          <div className="notifItemIcon">{notifIcon(it.kind)}</div>
          <div className="notifItemBody"><b>{it.title}</b><small>{it.subtitle}</small></div>
          <span className="notifItemTag">amanhã</span>
        </button>)}
      </div>
      {visible.length>0 && <div className="notifFoot">
        <button className="notifFootGhost" onClick={()=>dismissAll(visible.map(v=>v.id))}><CheckCheck size={14}/> Marcar como lidas</button>
      </div>}
    </div>}
  </div>
}
