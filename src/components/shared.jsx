import React, { useState, useEffect, useRef } from "react";
import { MoreVertical, CheckCircle2, Bell, CheckCheck, Cake, CircleDollarSign, CalendarClock, Repeat2, Target, Flag, PartyPopper } from "lucide-react";
import { urgencyClass } from "../lib/calendar";
import { playNotifSound } from "../lib/notifications";
import { useDismissedToday } from "../hooks";

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
