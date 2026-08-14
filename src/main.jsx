import React, {useMemo, useState, useEffect, useRef} from "react";
import {createRoot} from "react-dom/client";
import {
  LayoutDashboard, ArrowLeftRight, CreditCard, CircleDollarSign,
  CalendarClock, Bell, StickyNote, Bot, Plus, TrendingUp, TrendingDown,
  WalletCards, Clock3, Trash2, X, LogOut, Cloud, CloudOff,
  Cake, BookOpen, BookMarked, BookCheck, ChevronRight, ChevronDown, MoreVertical,
  Bold, Italic, Underline, AlignCenter, List, ListOrdered, CheckSquare, Smile, Target, PiggyBank, Repeat2,
  GraduationCap, Layers, Swords, BarChart3, FileText, Settings, Sun, Moon,
  ClipboardList, Dumbbell, Star, Flag, Brain, Hourglass, CheckCircle2, Filter, Pencil, RotateCcw,
  CheckCheck, Download, Search, ZoomIn, ZoomOut, Maximize2, Minimize2, Bookmark, ArrowRight, Folder, FolderPlus, ImagePlus,
  ChevronLeft, Check, Zap, Lightbulb, LayoutGrid, Sparkles, Trophy
} from "lucide-react";
import "./styles.css";
import { supabase, cloudConfigured } from "./lib/supabaseClient";
import { useEntity } from "./lib/useEntity";
import { clearLocal, usePersistentState } from "./lib/storage";
import { pdfjsLib } from "./lib/pdf";
import { downloadNotePdf, downloadAllNotesPdf } from "./lib/notesPdf";
import { uploadBookFile, downloadBookFile, deleteBookFile } from "./lib/books";
import { uploadStudyPdfFile, downloadStudyPdfFile, deleteStudyPdfFile } from "./lib/studyPdfs";
import Auth from "./Auth";

const initialTransactions = [
  {id:1, desc:"Salário", cat:"Renda", value:3000, type:"in", date:"11/08"},
  {id:2, desc:"Mercado", cat:"Alimentação", value:85.40, type:"out", date:"10/08"},
  {id:3, desc:"Netflix", cat:"Assinaturas", value:39.90, type:"out", date:"09/08"},
  {id:4, desc:"Uber", cat:"Transporte", value:24.50, type:"out", date:"08/08"},
];

const initialFixed = [
  {id:1, name:"Internet", value:100, day:10},
  {id:2, name:"Netflix", value:39.90, day:15},
  {id:3, name:"Academia", value:80, day:20},
];

const initialDebts = [
  {id:1, name:"Celular", total:600, paid:480, next:"15/08"},
];

const initialNotes = [
  {id:1, title:"Ideias para o fim de semana", content:"Rever o orçamento de viagem e escolher um restaurante novo para experimentar."},
  {id:2, title:"Lista de compras", content:"Arroz, feijão, café, frutas."},
];

const initialReminders = [
  {id:1, title:"Aniversário do João", date:"14/08", kind:"Aniversário"},
  {id:2, title:"Fatura do cartão", date:"25/08", kind:"Financeiro"},
  {id:3, title:"Parcela do celular", date:"15/08", kind:"Financeiro"},
];

const initialBooks = [
  {id:1, title:"Dom Casmurro", author:"Machado de Assis", status:"lido"},
  {id:2, title:"O Poder do Hábito", author:"Charles Duhigg", status:"quero_ler"},
];

const initialStudyPdfs = [];

const STUDY_COLORS = [
  {key:"red", hex:"#ff5c5c"},
  {key:"blue", hex:"#4c8dff"},
  {key:"green", hex:"#3ecf6a"},
  {key:"purple", hex:"#a06bff"},
  {key:"gold", hex:"#f0b429"},
  {key:"pink", hex:"#ff6bb0"},
  {key:"cyan", hex:"#31c4d6"},
];
const colorHex = key => (STUDY_COLORS.find(c=>c.key===key)||STUDY_COLORS[0]).hex;
const STUDY_ICONS = { target:Target, book:BookOpen, list:ClipboardList, dumbbell:Dumbbell, star:Star, flag:Flag, brain:Brain };

const initialStudyGoals = [
  {id:1, title:"Aprovação na EsPCEx", description:"Estudar com constância e conquistar minha vaga.", icon:"target", color:"red", mode:"percent", percent:80, current_value:0, target_value:0, unit:"", due_date:"2025-11-15", status:"andamento"},
  {id:2, title:"Ler 10 livros este ano", description:"Expandir conhecimento e vocabulário.", icon:"book", color:"blue", mode:"count", percent:0, current_value:6, target_value:10, unit:"livros", due_date:null, status:"andamento"},
  {id:3, title:"Resolver 1.000 questões", description:"Treinar questões de todas as matérias.", icon:"list", color:"green", mode:"count", percent:0, current_value:450, target_value:1000, unit:"questões", due_date:null, status:"andamento"},
  {id:4, title:"Treinar 4x por semana", description:"Manter disciplina e cuidar da saúde.", icon:"dumbbell", color:"purple", mode:"percent", percent:75, current_value:0, target_value:0, unit:"", due_date:"2025-12-31", status:"andamento"},
  {id:5, title:"Aprender inglês", description:"Alcançar nível intermediário.", icon:"star", color:"gold", mode:"percent", percent:100, current_value:0, target_value:0, unit:"", due_date:"2025-06-10", status:"concluida"},
  {id:6, title:"Revisar Matemática básica", description:"Retomar assim que a rotina de provas acalmar.", icon:"brain", color:"cyan", mode:"count", percent:0, current_value:3, target_value:12, unit:"módulos", due_date:null, status:"pausada"},
];

const initialCardPurchases = [
  {id:1, cat:"🍔 Alimentação", value:240},
  {id:2, cat:"🎮 Entretenimento", value:120},
  {id:3, cat:"🛒 Compras", value:183},
  {id:4, cat:"🚗 Transporte", value:100},
  {id:5, cat:"Outros", value:100},
];

const money = n => n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

// dd/mm ou dd/mm/aaaa -> Date. Sem ano informado, usa o ano atual (ou o próximo, se a data já passou este ano).
function parseReminderDate(dateStr){
  if(!dateStr) return null;
  const parts = String(dateStr).split("/").map(p=>parseInt(p,10));
  if(parts.length<2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  const [day, month, yearPart] = parts;
  const today = new Date(); today.setHours(0,0,0,0);
  let year = yearPart || today.getFullYear();
  let d = new Date(year, month-1, day);
  if(!yearPart && d < today) d = new Date(year+1, month-1, day);
  return d;
}

function daysUntil(dateStr){
  const d = parseReminderDate(dateStr);
  if(!d) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((d-today)/86400000);
}

// Para pagamentos fixos/recorrentes que só têm o "dia do mês" (sem data completa):
// calcula quantos dias faltam até a próxima ocorrência (este mês ou o próximo, se já passou).
function daysUntilMonthlyDay(day){
  const d = Number(day);
  if(!d || Number.isNaN(d)) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  let target = new Date(today.getFullYear(), today.getMonth(), d);
  if(target < today) target = new Date(today.getFullYear(), today.getMonth()+1, d);
  return Math.round((target-today)/86400000);
}

// Metas de estudo guardam a data de conclusão em formato ISO (yyyy-mm-dd), diferente do DD/MM usado no resto do app.
function daysUntilISO(dateStr){
  if(!dateStr) return null;
  const d = new Date(dateStr+"T00:00:00");
  if(Number.isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((d-today)/86400000);
}

function urgencyClass(days){
  if(days===null || days===undefined) return "gray";
  if(days<=7) return "red";
  if(days<=20) return "yellow";
  return "green";
}

function sortByProximity(list){
  return [...list].sort((a,b)=>{
    const da = daysUntil(a.date);
    const db = daysUntil(b.date);
    if(da===null && db===null) return 0;
    if(da===null) return 1;
    if(db===null) return -1;
    return da-db;
  });
}

function ReminderCard({icon, title, subtitle, days, onToggleMenu, menuOpen, menuContent, children}){
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

function useSession(){
  const [session,setSession] = useState(null);
  const [checking,setChecking] = useState(cloudConfigured);
  useEffect(()=>{
    if(!cloudConfigured){ setChecking(false); return; }
    supabase.auth.getSession().then(({data})=>{
      setSession(data.session);
      setChecking(false);
    });
    const {data:sub} = supabase.auth.onAuthStateChange((_event, s)=>setSession(s));
    return ()=>sub.subscription.unsubscribe();
  },[]);
  return {session, checking};
}

function useTheme(){
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
function useDismissedToday(){
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

// Notificações rápidas (toast) — usadas, por ex., quando uma Meta vinculada a um PDF é concluída automaticamente.
function toast(message, type = "success") {
  window.dispatchEvent(new CustomEvent("app:toast", { detail: { message, type } }));
}

function ToastHost() {
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

// Faz o progresso de uma Meta (modo "Quantidade") vinculada a um PDF conversar automaticamente
// com o Leitor de PDF: conforme a página atual avança, a meta é atualizada e, ao concluir o
// intervalo de páginas definido, marca a meta como concluída e dispara uma notificação.
function syncLinkedGoalsProgress(studyGoalsEntity, source, pdfId, pdfTitle, currentPage) {
  if (!studyGoalsEntity) return;
  const { data, update } = studyGoalsEntity;
  data.forEach(g => {
    if (g.mode !== "count" || g.link_source !== source || g.link_pdf_id !== pdfId) return;
    if (g.status !== "andamento") return;
    const start = Number(g.link_page_start) || 1;
    const target = Number(g.target_value) || 0;
    if (!target) return;
    const done = Math.max(0, Math.min(target, currentPage - start + 1));
    if (done === Number(g.current_value || 0)) return;
    const patch = { current_value: done };
    const justCompleted = done >= target;
    if (justCompleted) patch.status = "concluida";
    update(g.id, patch);
    if (justCompleted) {
      const label = source === "livro" ? "Leitura concluída" : "Estudo concluído";
      const verb = source === "livro" ? "lidas" : "estudadas";
      toast(`${label} — ${pdfTitle} · ${target} página${target === 1 ? "" : "s"} ${verb}`);
    }
  });
}

function notifIcon(kind, size=16){
  if(kind==="Aniversário") return <Cake size={size}/>;
  if(kind==="Dívida") return <CircleDollarSign size={size}/>;
  if(kind==="Fixo") return <CalendarClock size={size}/>;
  if(kind==="Recorrente") return <Repeat2 size={size}/>;
  if(kind==="Meta") return <Target size={size}/>;
  return <Bell size={size}/>;
}

function NotificationsBell({items, goTo}){
  const [open,setOpen] = useState(false);
  const [dismissed,dismissAll] = useDismissedToday();
  const ref = useRef(null);

  useEffect(()=>{
    const onDoc = (e)=>{ if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return ()=>document.removeEventListener("mousedown", onDoc);
  },[]);

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

function Root(){
  const {session, checking} = useSession();
  const [theme,setTheme] = useTheme();

  if(cloudConfigured && checking){
    return <div className="bootScreen">Carregando…</div>;
  }
  if(cloudConfigured && !session){
    return <Auth/>;
  }
  return <App session={session} theme={theme} setTheme={setTheme}/>;
}

function App({session,theme,setTheme}){
  const [page,setPage] = useState("Visão Geral");
  const [openNoteId,setOpenNoteId] = useState(null);
  const [mobileOpen,setMobileOpen] = useState(false);
  // Em telas touch o navegador dispara mouseenter/mouseleave "fantasmas" no primeiro toque,
  // o que conflitava com o botão de abrir/fechar. Só reagimos ao hover em dispositivos que de fato têm mouse.
  const canHover = () => typeof window!=="undefined" && window.matchMedia && window.matchMedia("(hover:hover) and (pointer:fine)").matches;
  const transactions = useEntity("transactions", initialTransactions, session, "desc");
  const fixed = useEntity("fixed_payments", initialFixed, session);
  const debts = useEntity("debts", initialDebts, session);
  const notes = useEntity("notes", initialNotes, session, "asc", {orderable:true});
  const reminders = useEntity("reminders", initialReminders, session);
  const cardPurchases = useEntity("card_purchases", initialCardPurchases, session);
  const books = useEntity("books", initialBooks, session, "asc", {orderable:true});
  const studyPdfs = useEntity("study_pdfs", initialStudyPdfs, session, "asc", {orderable:true});
  const studyPdfGroups = useEntity("study_pdf_groups", [], session, "asc", {orderable:true});
  const studyFlashcards = useEntity("study_flashcards", [], session);
  const studyFlashcardLists = useEntity("study_flashcard_lists", [], session, "asc", {orderable:true});
  const studyFlashcardFolders = useEntity("study_flashcard_folders", [], session, "asc", {orderable:true});
  const budgets = useEntity("budgets", [], session);
  const goals = useEntity("goals", [], session);
  const recurring = useEntity("recurring_payments", [], session);
  const studyGoals = useEntity("study_goals", initialStudyGoals, session);
  const [showOverviewEdit,setShowOverviewEdit] = useState(false);
  const [showSettings,setShowSettings] = useState(false);
  const [selectedMonth,setSelectedMonth] = useState(new Date().toISOString().slice(0,7));

  const monthTransactions = useMemo(()=>transactions.data.filter(x=>{
    const d=String(x.date||"");
    if(/^\d{4}-\d{2}/.test(d)) return d.slice(0,7)===selectedMonth;
    const [dd,mm]=d.split("/");
    return mm===selectedMonth.slice(5);
  }),[transactions.data,selectedMonth]);
  const income = useMemo(()=>monthTransactions.filter(x=>x.type==="in").reduce((a,b)=>a+b.value,0),[monthTransactions]);
  const expense = useMemo(()=>monthTransactions.filter(x=>x.type==="out").reduce((a,b)=>a+b.value,0),[monthTransactions]);
  const balance = useMemo(()=>transactions.data.filter(x=>x.type==="in").reduce((a,b)=>a+b.value,0)-transactions.data.filter(x=>x.type==="out").reduce((a,b)=>a+b.value,0),[transactions.data]);
  const fixedTotal = fixed.data.reduce((a,b)=>a+b.value,0);
  const debtRemaining = debts.data.reduce((a,b)=>a+(b.total-b.paid),0);
  const cardBill = cardPurchases.data.reduce((a,b)=>a+b.value,0);

  // Enquanto não há integração bancária, a pessoa pode preencher esses 4 números
  // na mão. Quando um campo está preenchido, ele substitui o valor calculado a
  // partir das movimentações/compras; vazio (null) volta a calcular automaticamente.
  const [overview, setOverview] = usePersistentState("overview_overrides", {
    balance: null, income: null, expense: null, cardBill: null,
  });
  const effectiveBalance = overview.balance ?? balance;
  const effectiveIncome = overview.income ?? income;
  const effectiveExpense = overview.expense ?? expense;
  const effectiveCardBill = overview.cardBill ?? cardBill;

  // Tudo que tem uma data/prazo e falta exatamente 1 dia entra no sininho de notificações.
  const notifItems = useMemo(()=>{
    const items = [];
    reminders.data.forEach(r=>{
      if(daysUntil(r.date)===1){
        const isBday = r.kind==="Aniversário";
        items.push({
          id:"rem-"+r.id, title:r.title,
          subtitle:isBday?"Aniversário amanhã":("Lembrete · "+(r.kind||"Geral")),
          page:isBday?"Aniversários":"Lembretes Comuns",
          kind:isBday?"Aniversário":"Lembrete",
        });
      }
    });
    debts.data.forEach(d=>{
      if(daysUntil(d.next)===1){
        items.push({
          id:"debt-"+d.id, title:d.name,
          subtitle:"Parcela da dívida vence amanhã",
          page:"Dívidas", kind:"Dívida",
        });
      }
    });
    fixed.data.forEach(f=>{
      if(daysUntilMonthlyDay(f.day)===1){
        items.push({
          id:"fixed-"+f.id, title:f.name,
          subtitle:"Pagamento fixo vence amanhã",
          page:"Pagamentos Fixos", kind:"Fixo",
        });
      }
    });
    recurring.data.forEach(r=>{
      if(daysUntilMonthlyDay(r.day)===1){
        items.push({
          id:"rec-"+r.id, title:r.name,
          subtitle:"Pagamento recorrente vence amanhã",
          page:"Recorrentes", kind:"Recorrente",
        });
      }
    });
    studyGoals.data.forEach(g=>{
      if(g.status!=="concluida" && daysUntilISO(g.due_date)===1){
        items.push({
          id:"goal-"+g.id, title:g.title,
          subtitle:"Meta de estudo conclui amanhã",
          page:"Metas de Estudo", kind:"Meta",
        });
      }
    });
    return items;
  },[reminders.data,debts.data,fixed.data,recurring.data,studyGoals.data]);

  const [aiInsight,setAiInsight] = useState(null);
  const [aiLoading,setAiLoading] = useState(false);
  const [aiError,setAiError] = useState(null);
  const aiAvailable = cloudConfigured && !!session;

  const askAI = async ()=>{
    if(!aiAvailable){
      alert("Para usar a IA real, configure a sincronização (Supabase) primeiro — veja o README.");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try{
      const { data, error } = await supabase.functions.invoke("ai-insights", {
        body: {
          balance: effectiveBalance, income: effectiveIncome, expense: effectiveExpense, fixedTotal, debtRemaining, cardBill: effectiveCardBill,
          cardCategories: cardPurchases.data.map(x=>({cat:x.cat, value:x.value})),
          recentTransactions: transactions.data.slice(0,8).map(x=>({desc:x.desc, cat:x.cat, value:x.value, type:x.type, date:x.date})),
        },
      });
      if(error) throw error;
      if(data?.error) throw new Error(data.error);
      setAiInsight(data.insight);
    }catch(err){
      setAiError(err.message || "Não foi possível consultar a IA agora.");
    }finally{
      setAiLoading(false);
    }
  };


  const navTree = [
    { type:"group", key:"financas", label:"Finanças", icon:WalletCards, children:[
      { key:"Visão Geral", icon:LayoutDashboard },
      { key:"Movimentações", icon:ArrowLeftRight },
      { key:"Pagamentos Fixos", icon:CalendarClock },
      { key:"Dívidas", icon:CircleDollarSign },
      { key:"Cartões", icon:CreditCard },
      { key:"Orçamento", icon:PiggyBank },
      { key:"Metas", icon:Target },
      { key:"Recorrentes", icon:Repeat2 },
    ]},
    { type:"group", key:"lembretes", label:"Lembretes", icon:Bell, children:[
      { key:"Lembretes Comuns", label:"Lembretes comuns", icon:Bell },
      { key:"Aniversários", icon:Cake },
    ]},
    { type:"single", key:"Notas", icon:StickyNote },
    { type:"group", key:"livros", label:"Livros", icon:BookOpen, children:[
      { key:"Livros Lidos", label:"Livros que já li", icon:BookCheck },
      { key:"Livros Para Ler", label:"Livros que quero ler", icon:BookMarked },
    ]},
    { type:"group", key:"estudos", label:"Área de Estudos", icon:GraduationCap, children:[
      { key:"Metas de Estudo", label:"Metas", icon:Target },
      { key:"Flashcards", icon:Layers },
      { key:"Desafios", icon:Swords },
      { key:"Nivelamento", icon:BarChart3 },
      { key:"Leitor de PDF", icon:FileText },
    ]},
  ];
  const [openGroups,setOpenGroups] = useState({});
  const goTo = (key)=>{
    setPage(key);
    if(window.innerWidth<=760) setMobileOpen(false);
  };
  const toggleGroup = (key)=>{
    setMobileOpen(true);
    setOpenGroups(g=>({...g, [key]:!g[key]}));
  };

  return <div className="app">
    <aside
      className={"sidebar "+(mobileOpen?"expanded":"")}
      onMouseEnter={()=>{ if(canHover()) setMobileOpen(true); }}
      onMouseLeave={()=>{ if(canHover()) setMobileOpen(false); }}
    >
      <div className="brand">
        <div className="brandIcon"><img src="/icons/icon-192.png" alt="Libano" /></div>
        <div><b>Libano</b><small>Finance + vida</small></div>
      </div>
      <button className="sidebarToggle" onClick={(e)=>{e.stopPropagation();setMobileOpen(o=>!o)}}>
        <ChevronRight size={16}/>
      </button>
      <nav>{navTree.map(item=>{
        if(item.type==="single"){
          const I = item.icon;
          return <button key={item.key} className={page===item.key?"active":""} onClick={()=>goTo(item.key)}>
            <I size={19}/><span>{item.label||item.key}</span>
          </button>
        }
        const GI = item.icon;
        const isOpen = !!openGroups[item.key];
        const groupActive = item.children.some(c=>c.key===page);
        return <div className="navGroup" key={item.key}>
          <button className={"navGroupHead "+(groupActive?"active":"")} onClick={()=>toggleGroup(item.key)}>
            <GI size={19}/><span>{item.label}</span>
            {isOpen ? <ChevronDown size={15} className="chev"/> : <ChevronRight size={15} className="chev"/>}
          </button>
          {isOpen && <div className="navSub">
            {item.children.map(c=>{const CI=c.icon;return <button key={c.key} className={page===c.key?"active":""} onClick={()=>goTo(c.key)}>
              <CI size={17}/><span>{c.label||c.key}</span>
            </button>})}
          </div>}
        </div>
      })}</nav>
      <div className="sidebarBottom">
        <div className="cloud">
          {cloudConfigured && session ? <Cloud size={20}/> : <CloudOff size={20}/>}
          <div>
            <b>Sincronização</b>
            <small>{cloudConfigured && session ? ("Conectado como "+session.user.email) : "Salvo neste dispositivo"}</small>
          </div>
        </div>
        <button className="resetData" onClick={()=>setShowSettings(true)}><Settings size={14}/> Configurações</button>
      </div>
    </aside>

    <main onClick={()=>{ if(mobileOpen && window.innerWidth<=760) setMobileOpen(false); }}>
      <header><div><h1>{page}</h1><p>{new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})}</p></div><div className="headerActions"><NotificationsBell items={notifItems} goTo={goTo}/>{page==="Visão Geral" && <button className="add" onClick={()=>setShowOverviewEdit(true)}><Pencil size={17}/> Editar valores</button>}</div></header>

      {page==="Visão Geral" && <Dashboard balance={effectiveBalance} income={effectiveIncome} expense={effectiveExpense} cardBill={effectiveCardBill} manualFields={overview} debtRemaining={debtRemaining} fixedTotal={fixedTotal} reminders={reminders.data} notes={notes.data} setPage={setPage} openNote={(id)=>{ setOpenNoteId(id); setPage("Notas"); }} askAI={askAI} aiInsight={aiInsight} aiLoading={aiLoading} aiError={aiError} aiAvailable={aiAvailable} month={selectedMonth} setMonth={setSelectedMonth} budgets={budgets.data} goals={goals.data}/>}
      {page==="Movimentações" && <Transactions data={transactions.data} onAdd={transactions.add} onDelete={transactions.remove}/>}
      {page==="Pagamentos Fixos" && <Fixed entity={fixed} total={fixedTotal}/>}
      {page==="Dívidas" && <Debts entity={debts} remaining={debtRemaining}/>}
      {page==="Cartões" && <Cards entity={cardPurchases} bill={cardBill}/>}
      {page==="Orçamento" && <Budgets entity={budgets} transactions={monthTransactions} month={selectedMonth}/>}
      {page==="Metas" && <Goals entity={goals}/>}
      {page==="Recorrentes" && <Recurring entity={recurring} transactions={transactions}/>}
      {page==="Lembretes Comuns" && <CommonReminders entity={reminders}/>}
      {page==="Aniversários" && <Birthdays entity={reminders}/>}
      {page==="Notas" && <Notes entity={notes} openNoteId={openNoteId} onConsumeOpenNote={()=>setOpenNoteId(null)}/>}
      {page==="Livros Lidos" && <BookShelf entity={books} status="lido" session={session} studyGoals={studyGoals}/>}
      {page==="Livros Para Ler" && <BookShelf entity={books} status="quero_ler" session={session} studyGoals={studyGoals}/>}
      {page==="Metas de Estudo" && <StudyGoals entity={studyGoals} studyPdfsList={studyPdfs.data} booksList={books.data}/>}
      {page==="Flashcards" && <StudyFlashcards entity={studyFlashcards} listsEntity={studyFlashcardLists} foldersEntity={studyFlashcardFolders}/>}
      {page==="Desafios" && <div className="content"><p className="emptyHint">Em breve.</p></div>}
      {page==="Nivelamento" && <div className="content"><p className="emptyHint">Em breve.</p></div>}
      {page==="Leitor de PDF" && <StudyPdfShelf entity={studyPdfs} session={session} flashcards={studyFlashcards} groupsEntity={studyPdfGroups} studyGoals={studyGoals}/>}

      <ToastHost/>

      {showOverviewEdit && <OverviewEditModal
        overview={overview}
        auto={{balance, income, expense, cardBill}}
        onSave={(patch)=>{ setOverview(o=>({...o, ...patch})); setShowOverviewEdit(false); }}
        onClose={()=>setShowOverviewEdit(false)}
      />}

      {showSettings && <div className="modalBack" onClick={()=>setShowSettings(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modalHead"><h2>Configurações</h2><button type="button" onClick={()=>setShowSettings(false)}><X/></button></div>
        <label>Tema
          <div className="themeToggle">
            <button type="button" className={theme==="dark"?"active":""} onClick={()=>setTheme("dark")}><Moon size={14}/> Escuro</button>
            <button type="button" className={theme==="light"?"active":""} onClick={()=>setTheme("light")}><Sun size={14}/> Claro</button>
          </div>
        </label>
        <div className="cloud">
          {cloudConfigured && session ? <Cloud size={20}/> : <CloudOff size={20}/>}
          <div>
            <b>Sincronização</b>
            <small>{cloudConfigured && session ? ("Conectado como "+session.user.email) : "Salvo neste dispositivo"}</small>
          </div>
        </div>
        {cloudConfigured && session && <button className="resetData" onClick={()=>supabase.auth.signOut()}><LogOut size={14}/> Sair da conta</button>}
        <button className="resetData" onClick={()=>{
          if(confirm(cloudConfigured && session ? "Isso limpa o cache local deste dispositivo (seus dados na nuvem continuam salvos). Continuar?" : "Isso vai apagar todos os dados salvos neste dispositivo. Continuar?")){
            clearLocal();
            location.reload();
          }
        }}><Trash2 size={14}/> Limpar dados locais</button>
      </div></div>}
    </main>
  </div>
}

function Dashboard({balance,income,expense,cardBill,manualFields,debtRemaining,fixedTotal,reminders,notes,setPage,openNote,askAI,aiInsight,aiLoading,aiError,aiAvailable,month,setMonth,budgets,goals}){
 return <div className="content">
   <div className="monthToolbar"><label>Mês analisado <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><span>{budgets.length} orçamento(s) · {goals.length} meta(s)</span></div><section className="stats">
    <Card title="Saldo atual" value={money(balance)} icon={<WalletCards/>} big manual={manualFields?.balance!=null}/>
    <Card title="Entradas" value={money(income)} icon={<TrendingUp/>} positive manual={manualFields?.income!=null}/>
    <Card title="Gastos" value={money(expense)} icon={<TrendingDown/>} negative manual={manualFields?.expense!=null}/>
    <Card title="Fatura do cartão" value={money(cardBill)} icon={<CreditCard/>} manual={manualFields?.cardBill!=null}/>
   </section>
   <section className="grid2">
    <div className="panel"><div className="panelTitle"><h2>Resumo do mês</h2><span>{month.slice(5)}/{month.slice(0,4)}</span></div>
      <div className="chart"><div className="bars">{[45,60,35,72,55,83,65,91,58,76,48,68].map((h,i)=><div key={i} className="barWrap"><div className="bar" style={{height:h+"%"}}></div><small>{i+1}</small></div>)}</div></div>
      <div className="legend"><span className="in"><i/>Entradas <b>{money(income)}</b></span><span className="out"><i/>Saídas <b>{money(expense)}</b></span></div>
    </div>
    <div className="panel ai"><div className="aiHead"><div className="aiIcon"><Bot/></div><div><h2>Análise da IA</h2><small>{aiAvailable?"Assistente financeiro":"Disponível com sincronização ativa"}</small></div></div>
      {aiInsight
        ? <p className="aiText">{aiInsight}</p>
        : <>
            <p>Seu saldo está positivo. A fatura do cartão representa <b>{Math.round(cardBill/Math.max(income,1)*100)}%</b> das suas entradas deste mês.</p>
            <p className="tip">💡 Você tem <b>{money(fixedTotal)}</b> em pagamentos fixos previstos e <b>{money(debtRemaining)}</b> em dívidas restantes.</p>
          </>
      }
      {aiError && <p className="aiErrorMsg">{aiError}</p>}
      <button className="ghost" onClick={askAI} disabled={aiLoading}>{aiLoading?"Analisando...":(aiInsight?"Analisar de novo →":"Perguntar à IA →")}</button>
    </div>
   </section>
   <section className="grid3">
    <div className="panel"><div className="panelTitle"><h2>Próximos lembretes</h2><button onClick={()=>setPage("Lembretes Comuns")}>Ver todos</button></div>
      <div className="reminderGrid">
        {sortByProximity(reminders).slice(0,3).map(r=><ReminderCard
          key={r.id}
          icon={notifIcon(r.kind, 18)}
          title={r.title}
          subtitle={(r.kind||"Geral")+" · "+r.date}
          days={daysUntil(r.date)}
        />)}
        {reminders.length===0 && <p className="emptyHint">Nenhum lembrete por aqui ainda.</p>}
      </div>
    </div>
    <div className="panel"><div className="panelTitle"><h2>Notas</h2><button onClick={()=>setPage("Notas")}>Ver todas</button></div>{notes.slice(0,3).map(n=><div className="row rowClickable" key={n.id} onClick={()=>openNote(n.id)}><div className="rowIcon"><StickyNote size={17}/></div><div><b>{n.title}</b><small>{stripHtml(n.content)?.slice(0,40)||"Nota vazia"}</small></div></div>)}{notes.length===0 && <p className="emptyHint">Nenhuma nota ainda.</p>}</div>
    <div className="panel mini"><h2>Saúde financeira</h2><div className="score">82<span>/100</span></div><div className="progress"><i style={{width:"82%"}}/></div><p>Boa! Seus gastos estão sob controle.</p></div>
   </section>
 </div>
}

function Card({title,value,icon,positive,negative,big,manual}){return <div className={"stat "+(big?"featured":"")}><div className="statIcon">{icon}</div><small>{title}{manual && <span className="manualBadge">manual</span>}</small><strong className={positive?"positive":(negative?"negative":"")}>{value}</strong></div>}

function OverviewEditModal({overview, auto, onSave, onClose}){
  const [balance,setBalance] = useState(overview.balance ?? "");
  const [income,setIncome] = useState(overview.income ?? "");
  const [expense,setExpense] = useState(overview.expense ?? "");
  const [cardBill,setCardBill] = useState(overview.cardBill ?? "");

  const submit = (e)=>{
    e.preventDefault();
    onSave({
      balance: balance===""?null:Number(balance),
      income: income===""?null:Number(income),
      expense: expense===""?null:Number(expense),
      cardBill: cardBill===""?null:Number(cardBill),
    });
  };

  const resetAll = ()=>{ setBalance(""); setIncome(""); setExpense(""); setCardBill(""); };

  return <div className="modalBack" onClick={onClose}><form className="modal" onSubmit={submit} onClick={e=>e.stopPropagation()}>
    <div className="modalHead"><h2>Editar valores</h2><button type="button" onClick={onClose}><X/></button></div>
    <p className="authSub">Sem integração bancária, você pode preencher esses números na mão. Deixe um campo em branco para voltar a calcular automaticamente a partir das suas movimentações.</p>
    <label>Saldo atual<input type="number" step="0.01" value={balance} onChange={e=>setBalance(e.target.value)} placeholder={"Automático: "+money(auto.balance)}/></label>
    <label>Entradas (do mês)<input type="number" step="0.01" value={income} onChange={e=>setIncome(e.target.value)} placeholder={"Automático: "+money(auto.income)}/></label>
    <label>Gastos (do mês)<input type="number" step="0.01" value={expense} onChange={e=>setExpense(e.target.value)} placeholder={"Automático: "+money(auto.expense)}/></label>
    <label>Fatura do cartão<input type="number" step="0.01" value={cardBill} onChange={e=>setCardBill(e.target.value)} placeholder={"Automático: "+money(auto.cardBill)}/></label>
    <button type="button" className="ghost" onClick={resetAll}><RotateCcw size={14}/> Limpar e voltar ao automático</button>
    <button className="primary" type="submit">Salvar</button>
  </form></div>;
}
function Transactions({data,onAdd,onDelete}){
  const [desc,setDesc]=useState(""); const [cat,setCat]=useState(""); const [value,setValue]=useState(""); const [type,setType]=useState("out");
  const submit=()=>{
    if(!desc.trim()||!value) return;
    onAdd({desc,cat,value:Number(value),type,date:new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})});
    setDesc("");setCat("");setValue("");setType("out");
  };
  return <div className="content">
    <div className="panel">
      <div className="inlineAdd">
        <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Descrição"/>
        <input value={cat} onChange={e=>setCat(e.target.value)} placeholder="Categoria"/>
        <input value={value} onChange={e=>setValue(e.target.value)} type="number" step="0.01" min="0" placeholder="Valor"/>
        <select value={type} onChange={e=>setType(e.target.value)}><option value="out">Saída</option><option value="in">Entrada</option></select>
        <button onClick={submit}><Plus/></button>
      </div>
    </div>
    <div className="panel"><div className="panelTitle"><h2>Extrato</h2><span>{data.length} movimentações</span></div>{data.map(x=><div className="transaction" key={x.id}><div><b>{x.desc}</b><small>{x.cat} · {x.date}</small></div><strong className={x.type==="in"?"positive":"negative"}>{x.type==="in"?"+":"-"} {money(x.value)}</strong><button onClick={()=>onDelete(x.id)}><Trash2 size={16}/></button></div>)}
    {data.length===0 && <p className="emptyHint">Nenhuma movimentação por aqui ainda.</p>}
    </div>
  </div>
}

function Fixed({entity,total}){
  const {data,add,remove} = entity;
  const [name,setName]=useState(""); const [value,setValue]=useState(""); const [day,setDay]=useState("");
  const submit=()=>{
    if(!name.trim()||!value||!day) return;
    add({name,value:Number(value),day:Number(day)});
    setName("");setValue("");setDay("");
  };
  return <div className="content">
    <div className="stats"><Card title="Total fixo mensal" value={money(total)} icon={<CalendarClock/>}/></div>
    <div className="panel">
      <div className="inlineAdd">
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nome (ex.: Internet)"/>
        <input value={value} onChange={e=>setValue(e.target.value)} type="number" step="0.01" min="0" placeholder="Valor"/>
        <input value={day} onChange={e=>setDay(e.target.value)} type="number" min="1" max="31" placeholder="Dia"/>
        <button onClick={submit}><Plus/></button>
      </div>
      {data.map(x=><div className="transaction" key={x.id}><div><b>{x.name}</b><small>Todo dia {x.day}</small></div><strong>{money(x.value)}</strong><button onClick={()=>remove(x.id)}><Trash2 size={16}/></button></div>)}
    </div>
  </div>
}

function Debts({entity,remaining}){
  const {data,add,remove,update} = entity;
  const [name,setName]=useState(""); const [total,setTotal]=useState(""); const [next,setNext]=useState("");
  const [openMenuId,setOpenMenuId]=useState(null);
  const submit=()=>{
    if(!name.trim()||!total) return;
    add({name,total:Number(total),paid:0,next:next||"—"});
    setName("");setTotal("");setNext("");
  };
  const pay=(x)=>{
    const amount = prompt("Valor do pagamento:");
    const n = Number(amount);
    if(!n || n<=0) return;
    update(x.id, {paid:Math.min(x.total, x.paid+n)});
  };
  return <div className="content">
    <div className="stats"><Card title="Total restante" value={money(remaining)} icon={<CircleDollarSign/>}/></div>
    <div className="panel">
      <div className="inlineAdd">
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nome da dívida"/>
        <input value={total} onChange={e=>setTotal(e.target.value)} type="number" step="0.01" min="0" placeholder="Total"/>
        <input value={next} onChange={e=>setNext(e.target.value)} placeholder="Próx. pagamento (dd/mm)"/>
        <button onClick={submit}><Plus/></button>
      </div>
    </div>
    <div className="reminderGrid">
      {data.map(x=>{
        const pct = x.total ? Math.round(x.paid/x.total*100) : 0;
        return <ReminderCard
          key={x.id}
          icon={<CircleDollarSign size={18}/>}
          title={x.name}
          subtitle={"Próximo pagamento: "+x.next}
          days={daysUntil(x.next)}
          menuOpen={openMenuId===x.id}
          onToggleMenu={()=>setOpenMenuId(id=>id===x.id?null:x.id)}
          menuContent={<>
            <button onClick={()=>{setOpenMenuId(null);pay(x);}}>Registrar pagamento</button>
            <button className="danger" onClick={()=>{setOpenMenuId(null);remove(x.id);}}><Trash2 size={13}/> Excluir</button>
          </>}
        >
          <div className="progress" style={{marginTop:14}}><i style={{width:pct+"%"}}/></div>
          <div className="debtNumbers"><span>Pago <b>{money(x.paid)}</b></span><span>Restante <b>{money(x.total-x.paid)}</b></span><span>{pct}%</span></div>
        </ReminderCard>;
      })}
      {data.length===0 && <p className="emptyHint">Nenhuma dívida cadastrada ainda.</p>}
    </div>
  </div>
}

function Cards({entity,bill}){
  const {data,add,remove} = entity;
  const [cat,setCat]=useState(""); const [value,setValue]=useState("");
  const submit=()=>{
    if(!cat.trim()||!value) return;
    add({cat,value:Number(value)});
    setCat("");setValue("");
  };
  return <div className="content">
    <div className="cardVisual"><div><span>Libano Card</span><b>•••• 4821</b></div><strong>{money(bill)}</strong><small>Fatura atual</small></div>
    <div className="panel">
      <div className="panelTitle"><h2>Fatura por categoria</h2></div>
      <div className="inlineAdd">
        <input value={cat} onChange={e=>setCat(e.target.value)} placeholder="Categoria (ex.: Alimentação)"/>
        <input value={value} onChange={e=>setValue(e.target.value)} type="number" step="0.01" min="0" placeholder="Valor"/>
        <button onClick={submit}><Plus/></button>
      </div>
      {data.map(x=><div className="transaction" key={x.id}><b>{x.cat}</b><strong>{money(x.value)}</strong><button onClick={()=>remove(x.id)}><Trash2 size={16}/></button></div>)}
    </div>
  </div>
}

function CommonReminders({entity}){
  const {data,add,remove} = entity;
  const filtered = sortByProximity(data.filter(x=>x.kind!=="Aniversário"));
  const [title,setTitle]=useState(""); const [date,setDate]=useState(""); const [kind,setKind]=useState("Financeiro");
  const [openMenuId,setOpenMenuId]=useState(null);
  const submit=()=>{
    if(!title.trim()||!date) return;
    add({title,date,kind});
    setTitle("");setDate("");setKind("Financeiro");
  };
  return <div className="content">
    <div className="panel">
      <div className="inlineAdd">
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Título do lembrete"/>
        <input value={date} onChange={e=>setDate(e.target.value)} placeholder="Data (dd/mm)"/>
        <select value={kind} onChange={e=>setKind(e.target.value)}><option>Financeiro</option><option>Outros</option></select>
        <button onClick={submit}><Plus/></button>
      </div>
    </div>
    <div className="reminderGrid">
      {filtered.map(x=><ReminderCard
        key={x.id}
        icon={<Bell size={18}/>}
        title={x.title}
        subtitle={x.kind+" · "+x.date}
        days={daysUntil(x.date)}
        menuOpen={openMenuId===x.id}
        onToggleMenu={()=>setOpenMenuId(id=>id===x.id?null:x.id)}
        menuContent={<button className="danger" onClick={()=>{setOpenMenuId(null);remove(x.id);}}><Trash2 size={13}/> Excluir</button>}
      />)}
      {filtered.length===0 && <p className="emptyHint">Nenhum lembrete por aqui ainda.</p>}
    </div>
  </div>
}

function Birthdays({entity}){
  const {data,add,remove} = entity;
  const filtered = sortByProximity(data.filter(x=>x.kind==="Aniversário"));
  const [title,setTitle]=useState(""); const [date,setDate]=useState("");
  const [openMenuId,setOpenMenuId]=useState(null);
  const submit=()=>{
    if(!title.trim()||!date) return;
    add({title,date,kind:"Aniversário"});
    setTitle("");setDate("");
  };
  return <div className="content">
    <div className="panel">
      <div className="inlineAdd">
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Nome"/>
        <input value={date} onChange={e=>setDate(e.target.value)} placeholder="Data (dd/mm)"/>
        <button onClick={submit}><Plus/></button>
      </div>
    </div>
    <div className="reminderGrid">
      {filtered.map(x=><ReminderCard
        key={x.id}
        icon={<Cake size={18}/>}
        title={x.title}
        subtitle={"Aniversário · "+x.date}
        days={daysUntil(x.date)}
        menuOpen={openMenuId===x.id}
        onToggleMenu={()=>setOpenMenuId(id=>id===x.id?null:x.id)}
        menuContent={<button className="danger" onClick={()=>{setOpenMenuId(null);remove(x.id);}}><Trash2 size={13}/> Excluir</button>}
      />)}
      {filtered.length===0 && <p className="emptyHint">Nenhum aniversário cadastrado ainda.</p>}
    </div>
  </div>
}

// Lê uma foto escolhida pelo usuário e devolve um data URL já redimensionado/comprimido
// (evita salvar fotos gigantes no localStorage ou no banco).
function resizeImageToDataUrl(file, maxWidth, maxHeight, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Arquivo não é uma imagem válida"));
      img.onload = () => {
        let { width, height } = img;
        const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const coverCache = new Map();

function BookCoverThumb({ book }) {
  const [src, setSrc] = useState(coverCache.get(book.file_path) || null);
  useEffect(() => {
    let active = true;
    if (!book.file_path || coverCache.has(book.file_path)) return;
    (async () => {
      try {
        const blob = await downloadBookFile(book.file_path);
        const buf = await blob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const dpr = Math.min(3, window.devicePixelRatio || 1);
        const scale = (260 * dpr) / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        coverCache.set(book.file_path, dataUrl);
        if (active) setSrc(dataUrl);
      } catch (e) {
        console.error("Não foi possível gerar a capa:", e);
      }
    })();
    return () => { active = false; };
  }, [book.file_path]);
  return <div className="bookCoverImg">{src ? <img src={src} alt={book.title}/> : <div className="bookCoverPlaceholder"><BookOpen size={28}/></div>}</div>;
}

function BookTile({ book, status, menuOpen, onToggleMenu, onOpen, onMarkRead, onMoveToWantToRead, onDelete, dragProps }) {
  const progress = book.total_pages ? Math.min(100, Math.round((book.current_page / book.total_pages) * 100)) : 0;
  const favCount = book.favorite_pages?.length || 0;
  const impCount = book.important_pages?.length || 0;
  return (
    <div className={"bookTile"+(dragProps?.dragging?" dragging":"")} {...dragProps}>
      <div className="bookCoverWrap" onClick={onOpen}>
        <BookCoverThumb book={book}/>
      </div>
      <button className="bookMenuBtn" onClick={(e)=>{e.stopPropagation(); onToggleMenu();}}><MoreVertical size={16}/></button>
      {menuOpen && <div className="bookMenu" onClick={(e)=>e.stopPropagation()}>
        {status==="lido"
          ? <button onClick={onMoveToWantToRead}>Mover para "quero ler"</button>
          : <button onClick={onMarkRead}>Marcar como lido</button>}
        <button className="danger" onClick={onDelete}><Trash2 size={13}/> Excluir</button>
      </div>}
      <b className="bookTitle">{book.title}</b>
      {book.total_pages !== 1 && <div className="progress"><i style={{width:progress+"%"}}/></div>}
      <small className="bookProgressLabel">
        {progress}%{favCount>0 && <> · <Star size={10}/> {favCount}</>}{impCount>0 && <> · <Flag size={10}/> {impCount}</>}
      </small>
    </div>
  );
}

function PdfReader({ book, onClose, onProgress, onNotesChange, onFavoritesChange, onImportantChange }) {
  const [pdf, setPdf] = useState(null);
  const [pageNum, setPageNum] = useState(book.current_page || 1);
  const [numPages, setNumPages] = useState(book.total_pages || 0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [nightMode, setNightMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const [favoritePages, setFavoritePages] = useState(book.favorite_pages || []);
  const [importantPages, setImportantPages] = useState(book.important_pages || []);

  const [panel, setPanel] = useState(null); // null | "notas" | "busca" | "marcadores"
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [jumpValue, setJumpValue] = useState("");

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const modalRef = useRef(null);
  const notesBodyRef = useRef(null);
  const notesSaveTimer = useRef(null);
  const searchToken = useRef(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const blob = await downloadBookFile(book.file_path);
        const buf = await blob.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        if (!active) return;
        setPdf(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (e) {
        console.error(e);
        if (active) { setErr("Não foi possível abrir esse PDF."); setLoading(false); }
      }
    })();
    return () => { active = false; };
  }, [book.file_path]);

  useEffect(() => {
    if (!pdf) return;
    let active = true;
    (async () => {
      const page = await pdf.getPage(pageNum);
      const containerWidth = containerRef.current?.clientWidth || 800;
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = fitWidth
        ? Math.min(2.2, Math.max(0.3, (containerWidth - 24) / baseViewport.width))
        : zoom;
      if (fitWidth) setZoom(scale);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || !active) return;
      // Renderiza na resolução real da tela (DPR) e só então reduz via CSS,
      // pra não ficar borrado em telas retina/celular.
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height = Math.floor(viewport.height) + "px";
      const ctx = canvas.getContext("2d");
      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;
      await page.render({ canvasContext: ctx, viewport, transform }).promise;
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNum, fitWidth, zoom]);

  const goTo = (n) => {
    const clamped = Math.max(1, Math.min(numPages || 1, n));
    setPageNum(clamped);
    onProgress(book.id, clamped);
  };

  const zoomIn = () => { setFitWidth(false); setZoom(z => Math.min(3, +(z + 0.15).toFixed(2))); };
  const zoomOut = () => { setFitWidth(false); setZoom(z => Math.max(0.3, +(z - 0.15).toFixed(2))); };
  const resetZoom = () => setFitWidth(true);

  const handleJump = (e) => {
    e.preventDefault();
    const n = parseInt(jumpValue, 10);
    if (!isNaN(n)) goTo(n);
    setJumpValue("");
  };

  const toggleFavorite = () => {
    setFavoritePages(prev => {
      const has = prev.includes(pageNum);
      const next = has ? prev.filter(p=>p!==pageNum) : [...prev, pageNum].sort((a,b)=>a-b);
      onFavoritesChange(book.id, next);
      return next;
    });
  };

  const toggleImportant = () => {
    setImportantPages(prev => {
      const has = prev.includes(pageNum);
      const next = has ? prev.filter(p=>p!==pageNum) : [...prev, pageNum].sort((a,b)=>a-b);
      onImportantChange(book.id, next);
      return next;
    });
  };

  const runSearch = async (e) => {
    e?.preventDefault();
    if (!pdf || !searchQuery.trim()) { setSearchResults([]); return; }
    const token = ++searchToken.current;
    setSearching(true);
    setSearchResults([]);
    const q = searchQuery.trim().toLowerCase();
    const found = [];
    for (let n = 1; n <= numPages; n++) {
      if (searchToken.current !== token) return; // uma busca nova começou / leitor fechou
      setSearchProgress(n);
      try {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        const text = content.items.map(it => it.str).join(" ");
        const idx = text.toLowerCase().indexOf(q);
        if (idx !== -1) {
          const start = Math.max(0, idx - 30);
          const snippet = (start>0?"…":"") + text.slice(start, idx+q.length+30).trim() + "…";
          found.push({ page: n, snippet });
        }
      } catch (e) { /* página sem texto extraível, ignora */ }
    }
    if (searchToken.current === token) {
      setSearchResults(found);
      setSearching(false);
    }
  };

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await modalRef.current?.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch (e) {
      setFullscreen(f => !f); // navegador sem suporte: usa a classe CSS de tela cheia mesmo assim
    }
  };

  // Carrega a nota salva desse livro sempre que o painel de notas é aberto
  useEffect(() => {
    if (panel==="notas" && notesBodyRef.current) {
      notesBodyRef.current.innerHTML = book.notes || "";
    }
  }, [panel]);

  const flushNotes = () => {
    clearTimeout(notesSaveTimer.current);
    if (notesBodyRef.current) onNotesChange(book.id, notesBodyRef.current.innerHTML || "");
  };

  const scheduleNotesSave = () => {
    clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(() => {
      onNotesChange(book.id, notesBodyRef.current?.innerHTML || "");
    }, 600);
  };

  const execNote = (command) => {
    notesBodyRef.current?.focus();
    document.execCommand(command, false, null);
    scheduleNotesSave();
  };

  const togglePanel = (name) => {
    setPanel(p => {
      if (p==="notas" && name!=="notas") flushNotes(); // fechando notas ao trocar de painel
      return p===name ? null : name;
    });
  };

  const handleClose = () => {
    if (panel==="notas") flushNotes();
    searchToken.current++;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(()=>{});
    onClose();
  };

  useEffect(() => {
    const handler = (e) => {
      if (panel==="notas") return; // não interfere na digitação das notas
      if (["INPUT","TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "ArrowRight") goTo(pageNum + 1);
      if (e.key === "ArrowLeft") goTo(pageNum - 1);
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNum, numPages, panel]);

  const isFav = favoritePages.includes(pageNum);
  const isImp = importantPages.includes(pageNum);

  return (
    <div className="readerBack" onClick={handleClose}>
      <div ref={modalRef} className={`readerModal${panel ? " readerModalWide" : ""}${fullscreen ? " readerModalFull" : ""}`} onClick={(e)=>e.stopPropagation()}>
        <div className="readerHead">
          <b>{book.title}</b>
          <div className="readerHeadActions">
            <button className={`ghost${panel==="busca" ? " active" : ""}`} onClick={()=>togglePanel("busca")}>
              <Search size={15}/> <span>Buscar</span>
            </button>
            <button className={`ghost${panel==="marcadores" ? " active" : ""}`} onClick={()=>togglePanel("marcadores")}>
              <Bookmark size={15}/> <span>Marcadores</span>
            </button>
            <button className={`ghost${panel==="notas" ? " active" : ""}`} onClick={()=>togglePanel("notas")}>
              <StickyNote size={15}/> <span>Notas</span>
            </button>
            <button onClick={handleClose}><X size={18}/></button>
          </div>
        </div>

        <div className="pdfToolbar">
          <div className="pdfToolbarGroup">
            <button title="Diminuir zoom" onClick={zoomOut}><ZoomOut size={16}/></button>
            <button title="Ajustar à largura da tela" className={fitWidth?"active":""} onClick={resetZoom}>{Math.round(zoom*100)}%</button>
            <button title="Aumentar zoom" onClick={zoomIn}><ZoomIn size={16}/></button>
          </div>
          <form className="pdfToolbarGroup pdfJumpForm" onSubmit={handleJump}>
            <input type="number" min="1" max={numPages||undefined} placeholder={`Ir p/ página (1-${numPages||"?"})`} value={jumpValue} onChange={e=>setJumpValue(e.target.value)}/>
            <button type="submit" title="Ir para a página"><ArrowRight size={15}/></button>
          </form>
          <div className="pdfToolbarGroup">
            <button title={isFav?"Remover dos favoritos":"Favoritar esta página"} className={isFav?"active":""} onClick={toggleFavorite}><Star size={16} fill={isFav?"currentColor":"none"}/></button>
            <button title={isImp?"Desmarcar como importante":"Marcar página como importante"} className={isImp?"active":""} onClick={toggleImportant}><Flag size={16} fill={isImp?"currentColor":"none"}/></button>
            <button title={nightMode?"Desativar modo escuro do leitor":"Modo escuro do leitor"} className={nightMode?"active":""} onClick={()=>setNightMode(n=>!n)}>{nightMode?<Sun size={16}/>:<Moon size={16}/>}</button>
            <button title={fullscreen?"Sair da tela cheia":"Tela cheia"} onClick={toggleFullscreen}>{fullscreen?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button>
          </div>
        </div>

        <div className="readerMain">
          <div className={`readerBody${nightMode?" readerBodyNight":""}`} ref={containerRef}>
            {loading && <p className="readerHint">Abrindo PDF...</p>}
            {err && <p className="readerHint">{err}</p>}
            {!loading && !err && <canvas ref={canvasRef} className={`readerCanvas${nightMode?" readerCanvasNight":""}`} onClick={()=>goTo(pageNum+1)}/>}
          </div>

          {panel==="busca" && (
            <div className="notesPane">
              <div className="notesPaneHead"><b>Buscar no PDF</b><span>em "{book.title}"</span></div>
              <form className="pdfSearchForm" onSubmit={runSearch}>
                <input autoFocus value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Digite uma palavra..."/>
                <button type="submit" disabled={searching}><Search size={15}/></button>
              </form>
              <div className="notesPaneBody pdfSearchResults">
                {searching && <p className="readerHint">Buscando... página {searchProgress} de {numPages}</p>}
                {!searching && searchResults.length===0 && searchQuery && <p className="emptyHint">Nenhum resultado encontrado.</p>}
                {!searching && searchResults.map(r => (
                  <button key={r.page} className="pdfSearchResultItem" onClick={()=>{goTo(r.page); setPanel(null);}}>
                    <b>Página {r.page}</b>
                    <small>{r.snippet}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {panel==="marcadores" && (
            <div className="notesPane">
              <div className="notesPaneHead"><b>Marcadores</b><span>em "{book.title}"</span></div>
              <div className="notesPaneBody pdfBookmarksBody">
                <div className="pdfBookmarksSection">
                  <small><Star size={12}/> Páginas favoritas</small>
                  {favoritePages.length===0 && <p className="emptyHint">Nenhuma página favoritada ainda.</p>}
                  <div className="pdfBookmarksChips">
                    {favoritePages.map(p => <button key={p} className={p===pageNum?"active":""} onClick={()=>goTo(p)}>{p}</button>)}
                  </div>
                </div>
                <div className="pdfBookmarksSection">
                  <small><Flag size={12}/> Páginas importantes</small>
                  {importantPages.length===0 && <p className="emptyHint">Nenhuma página marcada ainda.</p>}
                  <div className="pdfBookmarksChips">
                    {importantPages.map(p => <button key={p} className={p===pageNum?"active":""} onClick={()=>goTo(p)}>{p}</button>)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {panel==="notas" && (
            <div className="notesPane">
              <div className="notesPaneHead"><b>Minhas anotações</b><span>sobre "{book.title}"</span></div>
              <div className="noteToolbar" onMouseDown={(e)=>e.preventDefault()}>
                <button title="Negrito" onClick={() => execNote("bold")}><Bold size={16}/></button>
                <button title="Itálico" onClick={() => execNote("italic")}><Italic size={16}/></button>
                <button title="Sublinhado" onClick={() => execNote("underline")}><Underline size={16}/></button>
                <span className="noteToolDivider"/>
                <button title="Lista com marcadores" onClick={() => execNote("insertUnorderedList")}><List size={16}/></button>
                <button title="Lista numerada (1, 2, 3)" onClick={() => execNote("insertOrderedList")}><ListOrdered size={16}/></button>
              </div>
              <div className="notesPaneBody">
                <div
                  ref={notesBodyRef}
                  className="noteTextarea noteRichBody"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={scheduleNotesSave}
                  onBlur={flushNotes}
                  data-placeholder="Escreva suas anotações sobre este livro..."
                />
              </div>
            </div>
          )}
        </div>
        <div className="readerNav">
          <button className="ghost" onClick={()=>goTo(pageNum-1)} disabled={pageNum<=1}>‹ Anterior</button>
          <span>{numPages ? `Página ${pageNum} de ${numPages}` : "..."}</span>
          <button className="ghost" onClick={()=>goTo(pageNum+1)} disabled={pageNum>=numPages}>Próxima ›</button>
        </div>
      </div>
    </div>
  );
}

function BookShelf({ entity, status, session, studyGoals }) {
  const { data, add, remove, update, cloud, reorder } = entity;
  const filtered = data.filter(x => x.status === status);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [readingBook, setReadingBook] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragId, setDragId] = useState(null);
  const fileInputRef = useRef(null);
  const progressTimer = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!cloud) { alert('Enviar PDFs precisa de sincronização ativa (Supabase) — veja o README.'); return; }
    try {
      setUploading(true);
      const buf = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      const totalPages = doc.numPages;
      const id = crypto.randomUUID();
      const defaultTitle = file.name.replace(/\.pdf$/i, "");
      const title = window.prompt("Título do livro:", defaultTitle) || defaultTitle;
      const filePath = await uploadBookFile(session.user.id, id, file);
      await add({ id, title, status, file_path: filePath, total_pages: totalPages, current_page: 1, favorite_pages: [], important_pages: [] });
    } catch (err) {
      console.error(err);
      alert("Não foi possível enviar o PDF: " + (err.message || err));
    } finally {
      setUploading(false);
    }
  };

  const onProgress = (bookId, page) => {
    clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => {
      update(bookId, { current_page: page });
      const b = data.find(x => x.id === bookId);
      syncLinkedGoalsProgress(studyGoals, "livro", bookId, b?.title || "", page);
    }, 400);
  };

  const onNotesChange = (bookId, content) => {
    update(bookId, { notes: content });
  };

  const onFavoritesChange = (bookId, favorite_pages) => update(bookId, { favorite_pages });
  const onImportantChange = (bookId, important_pages) => update(bookId, { important_pages });

  const handleDelete = async (book) => {
    if (!confirm(`Excluir "${book.title}"? Isso também apaga o PDF.`)) return;
    setOpenMenuId(null);
    await remove(book.id);
    if (book.file_path) deleteBookFile(book.file_path);
  };

  const handleDrop = (targetId) => {
    if (dragId === null || dragId === targetId) { setDragId(null); return; }
    const newFiltered = [...filtered];
    const fromIdx = newFiltered.findIndex(b => b.id === dragId);
    const toIdx = newFiltered.findIndex(b => b.id === targetId);
    setDragId(null);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = newFiltered.splice(fromIdx, 1);
    newFiltered.splice(toIdx, 0, moved);
    let i = 0;
    const newFull = data.map(item => item.status === status ? newFiltered[i++] : item);
    reorder(newFull);
  };

  return (
    <div className="content">
      <div className="shelf" onClick={()=>setOpenMenuId(null)}>
        <div className="bookTile addTile" onClick={()=>fileInputRef.current?.click()}>
          <div className="bookCoverWrap addCover">{uploading ? <span>Enviando...</span> : <><Plus size={26}/><span>Adicionar PDF</span></>}</div>
          <input ref={fileInputRef} type="file" accept="application/pdf" hidden onChange={handleFile}/>
        </div>
        {filtered.map(book => (
          <BookTile
            key={book.id}
            book={book}
            status={status}
            menuOpen={openMenuId===book.id}
            onToggleMenu={()=>setOpenMenuId(id=>id===book.id?null:book.id)}
            onOpen={()=>setReadingBook(book)}
            onMarkRead={()=>{setOpenMenuId(null); update(book.id, {status:"lido"});}}
            onMoveToWantToRead={()=>{setOpenMenuId(null); update(book.id, {status:"quero_ler"});}}
            onDelete={()=>handleDelete(book)}
            dragProps={{
              draggable:true,
              dragging: dragId===book.id,
              onDragStart:(e)=>{ e.stopPropagation(); setDragId(book.id); e.dataTransfer.effectAllowed="move"; },
              onDragOver:(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect="move"; },
              onDrop:(e)=>{ e.preventDefault(); e.stopPropagation(); handleDrop(book.id); },
              onDragEnd:()=>setDragId(null),
            }}
          />
        ))}
      </div>
      {!cloud && <p className="emptyHint">O upload de PDFs precisa de sincronização ativa (Supabase) — veja o README.</p>}
      {filtered.length===0 && cloud && <p className="emptyHint">Nenhum livro por aqui ainda.</p>}
      {readingBook && <PdfReader book={readingBook} onClose={()=>setReadingBook(null)} onProgress={onProgress} onNotesChange={onNotesChange} onFavoritesChange={onFavoritesChange} onImportantChange={onImportantChange}/>}
    </div>
  );
}

const studyPdfCoverCache = new Map();

function StudyPdfCoverThumb({ pdfDoc }) {
  const [src, setSrc] = useState(studyPdfCoverCache.get(pdfDoc.file_path) || null);
  useEffect(() => {
    let active = true;
    if (!pdfDoc.file_path || studyPdfCoverCache.has(pdfDoc.file_path)) return;
    (async () => {
      try {
        const blob = await downloadStudyPdfFile(pdfDoc.file_path);
        const buf = await blob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const dpr = Math.min(3, window.devicePixelRatio || 1);
        const scale = (260 * dpr) / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        studyPdfCoverCache.set(pdfDoc.file_path, dataUrl);
        if (active) setSrc(dataUrl);
      } catch (e) {
        console.error("Não foi possível gerar a capa:", e);
      }
    })();
    return () => { active = false; };
  }, [pdfDoc.file_path]);
  return <div className="bookCoverImg">{src ? <img src={src} alt={pdfDoc.title}/> : <div className="bookCoverPlaceholder"><FileText size={28}/></div>}</div>;
}

function StudyPdfTile({ pdfDoc, groups, menuOpen, onToggleMenu, onOpen, onDelete, onMoveToGroup, dragProps }) {
  const progress = pdfDoc.total_pages ? Math.min(100, Math.round((pdfDoc.current_page / pdfDoc.total_pages) * 100)) : 0;
  const favCount = pdfDoc.favorite_pages?.length || 0;
  const impCount = pdfDoc.important_pages?.length || 0;
  return (
    <div className={"bookTile"+(dragProps?.dragging?" dragging":"")} {...dragProps}>
      <div className="bookCoverWrap" onClick={onOpen}>
        <StudyPdfCoverThumb pdfDoc={pdfDoc}/>
      </div>
      <button className="bookMenuBtn" onClick={(e)=>{e.stopPropagation(); onToggleMenu();}}><MoreVertical size={16}/></button>
      {menuOpen && <div className="bookMenu" onClick={(e)=>e.stopPropagation()}>
        {groups.length>0 && <>
          <small className="bookMenuLabel">Mover para pasta</small>
          {groups.map(g => (
            <button key={g.id} className={pdfDoc.group_id===g.id?"active":""} onClick={()=>onMoveToGroup(g.id)}>
              <Folder size={13}/> {g.name}
            </button>
          ))}
          {pdfDoc.group_id && <button onClick={()=>onMoveToGroup(null)}><X size={13}/> Remover da pasta</button>}
        </>}
        <button className="danger" onClick={onDelete}><Trash2 size={13}/> Excluir</button>
      </div>}
      <b className="bookTitle">{pdfDoc.title}</b>
      {pdfDoc.total_pages !== 1 && <div className="progress"><i style={{width:progress+"%"}}/></div>}
      <small className="bookProgressLabel">
        {progress}%{favCount>0 && <> · <Star size={10}/> {favCount}</>}{impCount>0 && <> · <Flag size={10}/> {impCount}</>}
      </small>
    </div>
  );
}

function StudyPdfGroupTile({ group, count, menuOpen, onToggleMenu, onOpen, onRename, onDelete, onSetCover, onRemoveCover, dropActive, onDragEnterZone, onDragLeaveZone, onDropZone }) {
  const coverInputRef = useRef(null);
  return (
    <div
      className={"bookTile groupTile"+(dropActive?" dropTarget":"")}
      onClick={onOpen}
      onDragOver={(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect="move"; }}
      onDragEnter={(e)=>{ e.preventDefault(); onDragEnterZone?.(); }}
      onDragLeave={onDragLeaveZone}
      onDrop={(e)=>{ e.preventDefault(); e.stopPropagation(); onDropZone?.(); }}
    >
      <div className="bookCoverWrap groupCover">
        {group.cover_image
          ? <div className="bookCoverImg"><img src={group.cover_image} alt={group.name}/></div>
          : <Folder size={34}/>}
      </div>
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        style={{display:"none"}}
        onChange={(e)=>{
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onSetCover(file);
        }}
      />
      <button className="bookMenuBtn" onClick={(e)=>{e.stopPropagation(); onToggleMenu();}}><MoreVertical size={16}/></button>
      {menuOpen && <div className="bookMenu" onClick={(e)=>e.stopPropagation()}>
        <button onClick={()=>coverInputRef.current?.click()}><ImagePlus size={13}/> {group.cover_image ? "Trocar foto da capa" : "Colocar foto na capa"}</button>
        {group.cover_image && <button onClick={onRemoveCover}><X size={13}/> Remover foto da capa</button>}
        <button onClick={onRename}><Pencil size={13}/> Renomear</button>
        <button className="danger" onClick={onDelete}><Trash2 size={13}/> Excluir pasta</button>
      </div>}
      <b className="bookTitle">{group.name}</b>
      <small className="bookProgressLabel">{count} PDF{count===1?"":"s"}</small>
    </div>
  );
}

function StudyPdfReader({ pdfDoc, onClose, onProgress, onNotesChange, onFavoritesChange, onImportantChange, onHighlightsChange, onFavoriteExcerptsChange, onCreateFlashcard }) {
  const [pdf, setPdf] = useState(null);
  const [pageNum, setPageNum] = useState(pdfDoc.current_page || 1);
  const [numPages, setNumPages] = useState(pdfDoc.total_pages || 0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [nightMode, setNightMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });

  const [favoritePages, setFavoritePages] = useState(pdfDoc.favorite_pages || []);
  const [importantPages, setImportantPages] = useState(pdfDoc.important_pages || []);
  const [highlights, setHighlights] = useState(pdfDoc.highlights || []);
  const [favoriteExcerpts, setFavoriteExcerpts] = useState(pdfDoc.favorite_excerpts || []);
  const [selection, setSelection] = useState(null); // {text, top, left}

  const [panel, setPanel] = useState(null); // null | "busca" | "marcadores" | "notas"
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [jumpValue, setJumpValue] = useState("");

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const modalRef = useRef(null);
  const textLayerRef = useRef(null);
  const pageWrapRef = useRef(null);
  const notesBodyRef = useRef(null);
  const notesSaveTimer = useRef(null);
  const searchToken = useRef(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const blob = await downloadStudyPdfFile(pdfDoc.file_path);
        const buf = await blob.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        if (!active) return;
        setPdf(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (e) {
        console.error(e);
        if (active) { setErr("Não foi possível abrir esse PDF."); setLoading(false); }
      }
    })();
    return () => { active = false; };
  }, [pdfDoc.file_path]);

  useEffect(() => {
    if (!pdf) return;
    let active = true;
    (async () => {
      const page = await pdf.getPage(pageNum);
      const containerWidth = containerRef.current?.clientWidth || 800;
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = fitWidth
        ? Math.min(2.5, Math.max(0.3, (containerWidth - 24) / baseViewport.width))
        : zoom;
      if (fitWidth) setZoom(scale);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || !active) return;
      // Renderiza na resolução real da tela (DPR) e só então reduz via CSS,
      // pra não ficar borrado em telas retina/celular.
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height = Math.floor(viewport.height) + "px";
      const ctx = canvas.getContext("2d");
      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;
      await page.render({ canvasContext: ctx, viewport, transform }).promise;
      if (!active) return;
      setPageSize({ width: viewport.width, height: viewport.height });

      // Camada de texto invisível, alinhada sobre o canvas, para permitir
      // selecionar trechos e usar as ferramentas de estudo (destacar, flashcard, favoritar).
      const textLayerDiv = textLayerRef.current;
      if (textLayerDiv) {
        textLayerDiv.innerHTML = "";
        textLayerDiv.style.setProperty("--total-scale-factor", String(scale));
        textLayerDiv.style.setProperty("--scale-round-x", "1px");
        textLayerDiv.style.setProperty("--scale-round-y", "1px");
        try {
          const textContent = await page.getTextContent();
          if (!active) return;
          await new pdfjsLib.TextLayer({ textContentSource: textContent, container: textLayerDiv, viewport }).render();
        } catch (e) { /* página sem texto extraível (ex.: PDF escaneado) */ }
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNum, fitWidth, zoom]);

  // Troca de página: fecha qualquer seleção pendente da página anterior
  useEffect(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, [pageNum]);

  const goTo = (n) => {
    const clamped = Math.max(1, Math.min(numPages || 1, n));
    setPageNum(clamped);
    onProgress(pdfDoc.id, clamped);
  };

  const zoomIn = () => { setFitWidth(false); setZoom(z => Math.min(3, +(z + 0.15).toFixed(2))); };
  const zoomOut = () => { setFitWidth(false); setZoom(z => Math.max(0.3, +(z - 0.15).toFixed(2))); };
  const resetZoom = () => setFitWidth(true);

  const handleJump = (e) => {
    e.preventDefault();
    const n = parseInt(jumpValue, 10);
    if (!isNaN(n)) goTo(n);
    setJumpValue("");
  };

  const toggleFavorite = () => {
    setFavoritePages(prev => {
      const has = prev.includes(pageNum);
      const next = has ? prev.filter(p=>p!==pageNum) : [...prev, pageNum].sort((a,b)=>a-b);
      onFavoritesChange(pdfDoc.id, next);
      return next;
    });
  };

  const toggleImportant = () => {
    setImportantPages(prev => {
      const has = prev.includes(pageNum);
      const next = has ? prev.filter(p=>p!==pageNum) : [...prev, pageNum].sort((a,b)=>a-b);
      onImportantChange(pdfDoc.id, next);
      return next;
    });
  };

  // Ferramentas de estudo: aparecem ao selecionar um trecho de texto no PDF
  const handleTextMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) { setSelection(null); return; }
    if (!textLayerRef.current || !textLayerRef.current.contains(sel.anchorNode)) { setSelection(null); return; }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) { setSelection(null); return; }
    setSelection({ text: sel.toString().trim(), top: rect.top, left: rect.left + rect.width / 2 });
  };

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  const applyHighlight = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !pageWrapRef.current) return;
    const range = sel.getRangeAt(0);
    const wrapRect = pageWrapRef.current.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .filter(r => r.width > 0 && r.height > 0)
      .map(r => ({
        x: (r.left - wrapRect.left) / wrapRect.width,
        y: (r.top - wrapRect.top) / wrapRect.height,
        w: r.width / wrapRect.width,
        h: r.height / wrapRect.height,
      }));
    const text = sel.toString().trim();
    if (!text || rects.length === 0) return;
    const entry = { id: crypto.randomUUID(), page: pageNum, rects, text, createdAt: Date.now() };
    const next = [...highlights, entry];
    setHighlights(next);
    onHighlightsChange(pdfDoc.id, next);
    clearSelection();
  };

  const createFlashcardFromSelection = () => {
    const text = selection?.text || window.getSelection()?.toString().trim();
    if (!text) return;
    const preview = text.length > 140 ? text.slice(0, 140) + "…" : text;
    const back = window.prompt(`Frente do flashcard:\n"${preview}"\n\nQual é a resposta / definição?`, "");
    if (back === null) { clearSelection(); return; } // cancelou
    onCreateFlashcard({ front: text, back: back.trim(), source_title: pdfDoc.title, source_page: pageNum });
    clearSelection();
  };

  const addFavoriteExcerpt = () => {
    const text = selection?.text || window.getSelection()?.toString().trim();
    if (!text) return;
    const entry = { id: crypto.randomUUID(), page: pageNum, text, createdAt: Date.now() };
    const next = [...favoriteExcerpts, entry];
    setFavoriteExcerpts(next);
    onFavoriteExcerptsChange(pdfDoc.id, next);
    clearSelection();
  };

  const removeHighlight = (id) => {
    const next = highlights.filter(h => h.id !== id);
    setHighlights(next);
    onHighlightsChange(pdfDoc.id, next);
  };

  const removeFavoriteExcerpt = (id) => {
    const next = favoriteExcerpts.filter(h => h.id !== id);
    setFavoriteExcerpts(next);
    onFavoriteExcerptsChange(pdfDoc.id, next);
  };

  const runSearch = async (e) => {
    e?.preventDefault();
    if (!pdf || !searchQuery.trim()) { setSearchResults([]); return; }
    const token = ++searchToken.current;
    setSearching(true);
    setSearchResults([]);
    const q = searchQuery.trim().toLowerCase();
    const found = [];
    for (let n = 1; n <= numPages; n++) {
      if (searchToken.current !== token) return; // uma busca nova começou / leitor fechou
      setSearchProgress(n);
      try {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        const text = content.items.map(it => it.str).join(" ");
        const idx = text.toLowerCase().indexOf(q);
        if (idx !== -1) {
          const start = Math.max(0, idx - 30);
          const snippet = (start>0?"…":"") + text.slice(start, idx+q.length+30).trim() + "…";
          found.push({ page: n, snippet });
        }
      } catch (e) { /* página sem texto extraível, ignora */ }
    }
    if (searchToken.current === token) {
      setSearchResults(found);
      setSearching(false);
    }
  };

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await modalRef.current?.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch (e) {
      setFullscreen(f => !f); // navegador sem suporte: usa a classe CSS de tela cheia mesmo assim
    }
  };

  // Carrega a anotação salva desse PDF sempre que o painel de notas é aberto
  useEffect(() => {
    if (panel==="notas" && notesBodyRef.current) {
      notesBodyRef.current.innerHTML = pdfDoc.notes || "";
    }
  }, [panel]);

  const flushNotes = () => {
    clearTimeout(notesSaveTimer.current);
    if (notesBodyRef.current) onNotesChange(pdfDoc.id, notesBodyRef.current.innerHTML || "");
  };

  const scheduleNotesSave = () => {
    clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(() => {
      onNotesChange(pdfDoc.id, notesBodyRef.current?.innerHTML || "");
    }, 600);
  };

  const execNote = (command) => {
    notesBodyRef.current?.focus();
    document.execCommand(command, false, null);
    scheduleNotesSave();
  };

  const togglePanel = (name) => {
    setPanel(p => {
      if (p==="notas" && name!=="notas") flushNotes(); // fechando notas ao trocar de painel
      return p===name ? null : name;
    });
  };

  const handleClose = () => {
    if (panel==="notas") flushNotes();
    searchToken.current++;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(()=>{});
    onClose();
  };

  useEffect(() => {
    const handler = (e) => {
      if (panel==="notas") return; // não interfere na digitação das notas
      if (["INPUT","TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "ArrowRight") goTo(pageNum + 1);
      if (e.key === "ArrowLeft") goTo(pageNum - 1);
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNum, numPages, panel]);

  const isFav = favoritePages.includes(pageNum);
  const isImp = importantPages.includes(pageNum);

  return (
    <div className="readerBack" onClick={handleClose}>
      <div ref={modalRef} className={`readerModal readerModalWide${fullscreen ? " readerModalFull" : ""}`} onClick={(e)=>e.stopPropagation()}>
        <div className="readerHead">
          <b>{pdfDoc.title}</b>
          <div className="readerHeadActions">
            <button className={`ghost${panel==="busca" ? " active" : ""}`} onClick={()=>togglePanel("busca")}>
              <Search size={15}/> <span>Buscar</span>
            </button>
            <button className={`ghost${panel==="marcadores" ? " active" : ""}`} onClick={()=>togglePanel("marcadores")}>
              <Bookmark size={15}/> <span>Marcadores</span>
            </button>
            <button className={`ghost${panel==="notas" ? " active" : ""}`} onClick={()=>togglePanel("notas")}>
              <StickyNote size={15}/> <span>Anotações</span>
            </button>
            <button onClick={handleClose}><X size={18}/></button>
          </div>
        </div>

        <div className="pdfToolbar">
          <div className="pdfToolbarGroup">
            <button title="Diminuir zoom" onClick={zoomOut}><ZoomOut size={16}/></button>
            <button title="Ajustar à largura da tela" className={fitWidth?"active":""} onClick={resetZoom}>{Math.round(zoom*100)}%</button>
            <button title="Aumentar zoom" onClick={zoomIn}><ZoomIn size={16}/></button>
          </div>
          <form className="pdfToolbarGroup pdfJumpForm" onSubmit={handleJump}>
            <input type="number" min="1" max={numPages||undefined} placeholder={`Ir p/ página (1-${numPages||"?"})`} value={jumpValue} onChange={e=>setJumpValue(e.target.value)}/>
            <button type="submit" title="Ir para a página"><ArrowRight size={15}/></button>
          </form>
          <div className="pdfToolbarGroup">
            <button title={isFav?"Remover dos favoritos":"Favoritar esta página"} className={isFav?"active":""} onClick={toggleFavorite}><Star size={16} fill={isFav?"currentColor":"none"}/></button>
            <button title={isImp?"Desmarcar como importante":"Marcar página como importante"} className={isImp?"active":""} onClick={toggleImportant}><Flag size={16} fill={isImp?"currentColor":"none"}/></button>
            <button title={nightMode?"Desativar modo escuro do leitor":"Modo escuro do leitor"} className={nightMode?"active":""} onClick={()=>setNightMode(n=>!n)}>{nightMode?<Sun size={16}/>:<Moon size={16}/>}</button>
            <button title={fullscreen?"Sair da tela cheia":"Tela cheia"} onClick={toggleFullscreen}>{fullscreen?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button>
          </div>
        </div>

        <div className="readerMain">
          <div className={`readerBody${nightMode?" readerBodyNight":""}`} ref={containerRef}>
            {loading && <p className="readerHint">Abrindo PDF...</p>}
            {err && <p className="readerHint">{err}</p>}
            {!loading && !err && (
              <div ref={pageWrapRef} className="pdfPageWrap" style={{width:pageSize.width||undefined, height:pageSize.height||undefined}}>
                <canvas ref={canvasRef} className={`readerCanvas${nightMode?" readerCanvasNight":""}`}/>
                {highlights.filter(h=>h.page===pageNum).map(h => (
                  <div key={h.id} className="pdfHighlightGroup" title={h.text}>
                    {h.rects.map((r,i) => (
                      <span key={i} className="pdfHighlightRect" style={{left:(r.x*100)+"%", top:(r.y*100)+"%", width:(r.w*100)+"%", height:(r.h*100)+"%"}}/>
                    ))}
                  </div>
                ))}
                <div ref={textLayerRef} className="textLayer" onMouseUp={handleTextMouseUp}/>
              </div>
            )}
            {selection && (
              <div className="pdfSelectionToolbar" style={{top:selection.top, left:selection.left}} onMouseDown={e=>e.preventDefault()}>
                <button onClick={applyHighlight}><span className="pdfHighlightSwatch"/> Destacar</button>
                <button onClick={createFlashcardFromSelection}><Layers size={13}/> Criar flashcard</button>
                <button onClick={addFavoriteExcerpt}><Star size={13}/> Adicionar aos favoritos</button>
              </div>
            )}
          </div>

          {panel==="busca" && (
            <div className="notesPane">
              <div className="notesPaneHead"><b>Buscar no PDF</b><span>em "{pdfDoc.title}"</span></div>
              <form className="pdfSearchForm" onSubmit={runSearch}>
                <input autoFocus value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Digite uma palavra..."/>
                <button type="submit" disabled={searching}><Search size={15}/></button>
              </form>
              <div className="notesPaneBody pdfSearchResults">
                {searching && <p className="readerHint">Buscando... página {searchProgress} de {numPages}</p>}
                {!searching && searchResults.length===0 && searchQuery && <p className="emptyHint">Nenhum resultado encontrado.</p>}
                {!searching && searchResults.map(r => (
                  <button key={r.page} className="pdfSearchResultItem" onClick={()=>{goTo(r.page); setPanel(null);}}>
                    <b>Página {r.page}</b>
                    <small>{r.snippet}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {panel==="marcadores" && (
            <div className="notesPane">
              <div className="notesPaneHead"><b>Marcadores</b><span>em "{pdfDoc.title}"</span></div>
              <div className="notesPaneBody pdfBookmarksBody">
                <div className="pdfBookmarksSection">
                  <small><Star size={12}/> Páginas favoritas</small>
                  {favoritePages.length===0 && <p className="emptyHint">Nenhuma página favoritada ainda.</p>}
                  <div className="pdfBookmarksChips">
                    {favoritePages.map(p => <button key={p} className={p===pageNum?"active":""} onClick={()=>goTo(p)}>{p}</button>)}
                  </div>
                </div>
                <div className="pdfBookmarksSection">
                  <small><Flag size={12}/> Páginas importantes</small>
                  {importantPages.length===0 && <p className="emptyHint">Nenhuma página marcada ainda.</p>}
                  <div className="pdfBookmarksChips">
                    {importantPages.map(p => <button key={p} className={p===pageNum?"active":""} onClick={()=>goTo(p)}>{p}</button>)}
                  </div>
                </div>
                <div className="pdfBookmarksSection">
                  <small><span className="pdfHighlightSwatch"/> Trechos destacados</small>
                  {highlights.length===0 && <p className="emptyHint">Nenhum trecho destacado ainda.</p>}
                  <div className="pdfExcerptList">
                    {highlights.map(h => (
                      <div key={h.id} className="pdfExcerptItem">
                        <button className="pdfExcerptText" onClick={()=>{goTo(h.page); setPanel(null);}}>
                          <b>Página {h.page}</b>
                          <small>{h.text.length>120 ? h.text.slice(0,120)+"…" : h.text}</small>
                        </button>
                        <button className="pdfExcerptDelete" title="Remover destaque" onClick={()=>removeHighlight(h.id)}><Trash2 size={13}/></button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pdfBookmarksSection">
                  <small><Star size={12}/> Trechos favoritos</small>
                  {favoriteExcerpts.length===0 && <p className="emptyHint">Nenhum trecho favoritado ainda.</p>}
                  <div className="pdfExcerptList">
                    {favoriteExcerpts.map(h => (
                      <div key={h.id} className="pdfExcerptItem">
                        <button className="pdfExcerptText" onClick={()=>{goTo(h.page); setPanel(null);}}>
                          <b>Página {h.page}</b>
                          <small>{h.text.length>120 ? h.text.slice(0,120)+"…" : h.text}</small>
                        </button>
                        <button className="pdfExcerptDelete" title="Remover dos favoritos" onClick={()=>removeFavoriteExcerpt(h.id)}><Trash2 size={13}/></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {panel==="notas" && (
            <div className="notesPane">
              <div className="notesPaneHead"><b>Minhas anotações</b><span>sobre "{pdfDoc.title}"</span></div>
              <div className="noteToolbar" onMouseDown={(e)=>e.preventDefault()}>
                <button title="Negrito" onClick={() => execNote("bold")}><Bold size={16}/></button>
                <button title="Itálico" onClick={() => execNote("italic")}><Italic size={16}/></button>
                <button title="Sublinhado" onClick={() => execNote("underline")}><Underline size={16}/></button>
                <span className="noteToolDivider"/>
                <button title="Lista com marcadores" onClick={() => execNote("insertUnorderedList")}><List size={16}/></button>
                <button title="Lista numerada (1, 2, 3)" onClick={() => execNote("insertOrderedList")}><ListOrdered size={16}/></button>
              </div>
              <div className="notesPaneBody">
                <div
                  ref={notesBodyRef}
                  className="noteTextarea noteRichBody"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={scheduleNotesSave}
                  onBlur={flushNotes}
                  data-placeholder="Escreva suas anotações sobre este PDF..."
                />
              </div>
            </div>
          )}
        </div>

        <div className="readerNav">
          <button className="ghost" onClick={()=>goTo(pageNum-1)} disabled={pageNum<=1}>‹ Anterior</button>
          <span>{numPages ? `Página ${pageNum} de ${numPages}` : "..."}</span>
          <button className="ghost" onClick={()=>goTo(pageNum+1)} disabled={pageNum>=numPages}>Próxima ›</button>
        </div>
      </div>
    </div>
  );
}

function StudyPdfShelf({ entity, session, flashcards, groupsEntity, studyGoals }) {
  const { data, add, remove, update, cloud, reorder } = entity;
  const groups = groupsEntity.data;
  const [currentGroupId, setCurrentGroupId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [readingPdf, setReadingPdf] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOverGroupId, setDragOverGroupId] = useState(null);
  const fileInputRef = useRef(null);
  const progressTimer = useRef(null);

  const currentGroup = currentGroupId ? groups.find(g => g.id === currentGroupId) : null;
  const visiblePdfs = currentGroupId ? data.filter(p => p.group_id === currentGroupId) : data.filter(p => !p.group_id);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!cloud) { alert('Enviar PDFs precisa de sincronização ativa (Supabase) — veja o README.'); return; }
    try {
      setUploading(true);
      const buf = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      const totalPages = doc.numPages;
      const id = crypto.randomUUID();
      const defaultTitle = file.name.replace(/\.pdf$/i, "");
      const title = window.prompt("Título do PDF:", defaultTitle) || defaultTitle;
      const filePath = await uploadStudyPdfFile(session.user.id, id, file);
      await add({ id, title, file_path: filePath, total_pages: totalPages, current_page: 1, favorite_pages: [], important_pages: [], highlights: [], favorite_excerpts: [], notes: "", group_id: currentGroupId });
    } catch (err) {
      console.error(err);
      alert("Não foi possível enviar o PDF: " + (err.message || err));
    } finally {
      setUploading(false);
    }
  };

  const onProgress = (id, page) => {
    clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => {
      update(id, { current_page: page });
      const d = data.find(x => x.id === id);
      syncLinkedGoalsProgress(studyGoals, "estudo", id, d?.title || "", page);
    }, 400);
  };

  const onNotesChange = (id, notes) => update(id, { notes });
  const onFavoritesChange = (id, favorite_pages) => update(id, { favorite_pages });
  const onImportantChange = (id, important_pages) => update(id, { important_pages });
  const onHighlightsChange = (id, highlights) => update(id, { highlights });
  const onFavoriteExcerptsChange = (id, favorite_excerpts) => update(id, { favorite_excerpts });
  const onCreateFlashcard = (card) => {
    flashcards.add(card);
    alert('Flashcard criado! Confira na aba "Flashcards".');
  };

  const handleDelete = async (pdfDoc) => {
    if (!confirm(`Excluir "${pdfDoc.title}"? Isso também apaga o PDF.`)) return;
    setOpenMenuId(null);
    await remove(pdfDoc.id);
    if (pdfDoc.file_path) deleteStudyPdfFile(pdfDoc.file_path);
  };

  const handleMoveToGroup = (pdfDoc, groupId) => {
    setOpenMenuId(null);
    update(pdfDoc.id, { group_id: groupId });
  };

  const handleDropOnGroup = (groupId) => {
    setDragOverGroupId(null);
    if (dragId === null) return;
    const draggedId = dragId;
    setDragId(null);
    update(draggedId, { group_id: groupId });
  };

  const handleDrop = (targetId) => {
    if (dragId === null || dragId === targetId) { setDragId(null); return; }
    const newList = [...data];
    const fromIdx = newList.findIndex(b => b.id === dragId);
    const toIdx = newList.findIndex(b => b.id === targetId);
    setDragId(null);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = newList.splice(fromIdx, 1);
    newList.splice(toIdx, 0, moved);
    reorder(newList);
  };

  const handleNewGroup = () => {
    const name = window.prompt("Nome da pasta (ex.: Matemática):");
    if (!name || !name.trim()) return;
    groupsEntity.add({ id: crypto.randomUUID(), name: name.trim() });
  };

  const handleRenameGroup = (group) => {
    setOpenMenuId(null);
    const name = window.prompt("Novo nome da pasta:", group.name);
    if (!name || !name.trim() || name.trim()===group.name) return;
    groupsEntity.update(group.id, { name: name.trim() });
  };

  const handleDeleteGroup = async (group) => {
    setOpenMenuId(null);
    const count = data.filter(p => p.group_id === group.id).length;
    const msg = count>0
      ? `Excluir a pasta "${group.name}"? Os ${count} PDF(s) dela voltam para fora da pasta (não são apagados).`
      : `Excluir a pasta "${group.name}"?`;
    if (!confirm(msg)) return;
    await Promise.all(data.filter(p => p.group_id === group.id).map(p => update(p.id, { group_id: null })));
    await groupsEntity.remove(group.id);
    if (currentGroupId === group.id) setCurrentGroupId(null);
  };

  const handleSetGroupCover = async (group, file) => {
    setOpenMenuId(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 360, 480, 0.85);
      await groupsEntity.update(group.id, { cover_image: dataUrl });
    } catch (e) {
      console.error(e);
      alert("Não foi possível usar essa imagem. Tente outra foto.");
    }
  };

  const handleRemoveGroupCover = async (group) => {
    setOpenMenuId(null);
    await groupsEntity.update(group.id, { cover_image: null });
  };

  return (
    <div className="content">
      {currentGroup && (
        <div
          className={"groupBreadcrumb"+(dragOverGroupId==="__root__"?" dropTarget":"")}
          onDragOver={(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect="move"; }}
          onDragEnter={(e)=>{ e.preventDefault(); setDragOverGroupId("__root__"); }}
          onDragLeave={()=>setDragOverGroupId(id=>id==="__root__"?null:id)}
          onDrop={(e)=>{ e.preventDefault(); handleDropOnGroup(null); }}
        >
          <button className="ghost" onClick={()=>setCurrentGroupId(null)}>‹ Pastas</button>
          <Folder size={14}/> <b>{currentGroup.name}</b>
        </div>
      )}
      <div className="shelf" onClick={()=>setOpenMenuId(null)}>
        <div className="bookTile addTile" onClick={()=>fileInputRef.current?.click()}>
          <div className="bookCoverWrap addCover">{uploading ? <span>Enviando...</span> : <><Plus size={26}/><span>Adicionar PDF</span></>}</div>
          <input ref={fileInputRef} type="file" accept="application/pdf" hidden onChange={handleFile}/>
        </div>
        {!currentGroup && (
          <div className="bookTile addTile" onClick={handleNewGroup}>
            <div className="bookCoverWrap addCover"><FolderPlus size={26}/><span>Nova pasta</span></div>
          </div>
        )}
        {!currentGroup && groups.map(group => (
          <StudyPdfGroupTile
            key={group.id}
            group={group}
            count={data.filter(p => p.group_id === group.id).length}
            menuOpen={openMenuId==="g:"+group.id}
            onToggleMenu={(e)=>{e?.stopPropagation?.(); setOpenMenuId(id=>id==="g:"+group.id?null:"g:"+group.id);}}
            onOpen={()=>setCurrentGroupId(group.id)}
            onRename={()=>handleRenameGroup(group)}
            onDelete={()=>handleDeleteGroup(group)}
            onSetCover={(file)=>handleSetGroupCover(group, file)}
            onRemoveCover={()=>handleRemoveGroupCover(group)}
            dropActive={dragOverGroupId===group.id}
            onDragEnterZone={()=>setDragOverGroupId(group.id)}
            onDragLeaveZone={()=>setDragOverGroupId(id=>id===group.id?null:id)}
            onDropZone={()=>handleDropOnGroup(group.id)}
          />
        ))}
        {visiblePdfs.map(pdfDoc => (
          <StudyPdfTile
            key={pdfDoc.id}
            pdfDoc={pdfDoc}
            groups={groups}
            menuOpen={openMenuId===pdfDoc.id}
            onToggleMenu={()=>setOpenMenuId(id=>id===pdfDoc.id?null:pdfDoc.id)}
            onOpen={()=>setReadingPdf(pdfDoc)}
            onDelete={()=>handleDelete(pdfDoc)}
            onMoveToGroup={(groupId)=>handleMoveToGroup(pdfDoc, groupId)}
            dragProps={{
              draggable:true,
              dragging: dragId===pdfDoc.id,
              onDragStart:(e)=>{ e.stopPropagation(); setDragId(pdfDoc.id); e.dataTransfer.effectAllowed="move"; },
              onDragOver:(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect="move"; },
              onDrop:(e)=>{ e.preventDefault(); e.stopPropagation(); handleDrop(pdfDoc.id); },
              onDragEnd:()=>setDragId(null),
            }}
          />
        ))}
      </div>
      {!cloud && <p className="emptyHint">O upload de PDFs precisa de sincronização ativa (Supabase) — veja o README.</p>}
      {visiblePdfs.length===0 && groups.length===0 && cloud && !currentGroup && <p className="emptyHint">Nenhum PDF de estudo por aqui ainda.</p>}
      {currentGroup && visiblePdfs.length===0 && <p className="emptyHint">Nenhum PDF nessa pasta ainda.</p>}
      {readingPdf && <StudyPdfReader
        pdfDoc={readingPdf}
        onClose={()=>setReadingPdf(null)}
        onProgress={onProgress}
        onNotesChange={onNotesChange}
        onFavoritesChange={onFavoritesChange}
        onImportantChange={onImportantChange}
        onHighlightsChange={onHighlightsChange}
        onFavoriteExcerptsChange={onFavoriteExcerptsChange}
        onCreateFlashcard={onCreateFlashcard}
      />}
    </div>
  );
}

function FlashcardTile({ card, onDelete }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className={"flashcardTile"+(flipped?" flipped":"")} onClick={()=>setFlipped(f=>!f)}>
      <button className="flashcardDelete" onClick={(e)=>{e.stopPropagation(); onDelete();}}><Trash2 size={13}/></button>
      <div className="flashcardInner">
        <div className="flashcardFace flashcardFront"><span>{card.front}</span></div>
        <div className="flashcardFace flashcardBack"><span>{card.back || "(sem resposta)"}</span></div>
      </div>
      {card.source_title && <small className="flashcardSource">{card.source_title}{card.source_page ? ` · pág. ${card.source_page}` : ""}</small>}
    </div>
  );
}

const rid = () => Date.now() + "-" + Math.random().toString(36).slice(2, 8);
const shuffleArr = (arr) => { const a=[...arr]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };

function StudyFlashcards({ entity, listsEntity, foldersEntity }) {
  const { data: pdfCards, remove: removePdfCard } = entity;
  const { data: lists, add: addList, remove: removeList, update: updateList } = listsEntity;
  const { data: folders, add: addFolder, remove: removeFolder, update: updateFolder } = foldersEntity;

  const [openFolderId, setOpenFolderId] = useState(null);
  const [folderModal, setFolderModal] = useState(null); // null | "new" | folder being renamed
  const [listForm, setListForm] = useState(null); // null | "new" | list being edited
  const [viewingListId, setViewingListId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null); // "list:<id>" | "folder:<id>"

  const viewingList = viewingListId ? lists.find(l => l.id === viewingListId) : null;
  const currentFolder = openFolderId ? folders.find(f => f.id === openFolderId) : null;
  const visibleLists = lists.filter(l => (l.folder_id || null) === openFolderId);

  const confirmDeleteList = (id) => { setOpenMenuId(null); if (confirm("Excluir esta lista de cartões?")) removeList(id); };
  const confirmDeleteFolder = (id) => {
    setOpenMenuId(null);
    if (confirm("Excluir esta pasta? As listas dentro dela não serão apagadas.")) {
      lists.filter(l => l.folder_id === id).forEach(l => updateList(l.id, { folder_id: null }));
      removeFolder(id);
    }
  };

  if (viewingList) {
    return <FlashcardListStudy
      list={viewingList}
      onBack={() => setViewingListId(null)}
      onEdit={() => { setListForm(viewingList); setViewingListId(null); }}
    />;
  }

  if (listForm !== null) {
    return <FlashcardListForm
      list={listForm === "new" ? null : listForm}
      defaultFolderId={openFolderId}
      onCancel={() => setListForm(null)}
      onSave={(payload) => {
        if (listForm === "new") addList(payload); else updateList(listForm.id, payload);
        setListForm(null);
      }}
    />;
  }

  return (
    <div className="content" onClick={() => setOpenMenuId(null)}>
      <div className="flashHead">
        <div className="flashHeadInfo">
          <div className="flashHeadIcon"><Layers size={22}/></div>
          <div>
            <small>{currentFolder ? currentFolder.name.toUpperCase() : "FERRAMENTAS"}</small>
            <h2>{currentFolder ? currentFolder.name : "Flashcards"}</h2>
            <p>{currentFolder ? `${visibleLists.length} lista(s) nesta pasta.` : "Crie listas de cartões, organize em pastas e estude do seu jeito."}</p>
          </div>
        </div>
        <div className="flashHeadActions">
          {currentFolder
            ? <button className="ghost" onClick={() => setOpenFolderId(null)}><ChevronLeft size={16}/> Voltar</button>
            : <button className="ghost" onClick={(e) => { e.stopPropagation(); setFolderModal("new"); }}><FolderPlus size={16}/> Criar pasta</button>}
          <button className="add" onClick={(e) => { e.stopPropagation(); setListForm("new"); }}><Plus size={16}/> Criar lista</button>
        </div>
      </div>

      {!currentFolder && folders.length === 0 && visibleLists.length === 0 && pdfCards.length === 0 ? (
        <div className="flashEmpty">
          <div className="flashEmptyIcon"><Sparkles size={30}/></div>
          <h3>Nenhuma lista ainda</h3>
          <p>Monte sua primeira lista de cartões com termos e definições. Depois é só estudar do jeito que combina com você.</p>
          <button className="add" onClick={(e) => { e.stopPropagation(); setListForm("new"); }}><Plus size={16}/> Criar minha primeira lista</button>
        </div>
      ) : (
        <>
          {!currentFolder && folders.length > 0 && (
            <div className="flashSection">
              <h3>Pastas</h3>
              <div className="flashFolderGrid">
                {folders.map(f => {
                  const count = lists.filter(l => l.folder_id === f.id).length;
                  return (
                    <div key={f.id} className="flashFolderTile" onClick={() => setOpenFolderId(f.id)}>
                      <div className="flashFolderIcon"><Folder size={18}/></div>
                      <div><b>{f.name}</b><small>{count} lista{count===1?"":"s"}</small></div>
                      <button className="flashTileMenuBtn" onClick={(e) => { e.stopPropagation(); setOpenMenuId(id => id===`folder:${f.id}`?null:`folder:${f.id}`); }}><MoreVertical size={16}/></button>
                      {openMenuId===`folder:${f.id}` && (
                        <div className="flashMenuPop" onClick={e=>e.stopPropagation()}>
                          <button onClick={()=>{ setOpenMenuId(null); setFolderModal(f); }}><Pencil size={13}/> Renomear</button>
                          <button className="danger" onClick={()=>confirmDeleteFolder(f.id)}><Trash2 size={13}/> Excluir</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flashSection">
            <h3>{currentFolder ? "Listas" : "Minhas listas"}</h3>
            {visibleLists.length === 0 ? (
              <p className="emptyHint">Nenhuma lista {currentFolder ? "nesta pasta" : "por aqui"} ainda.</p>
            ) : (
              <div className="flashListGrid">
                {visibleLists.map(l => (
                  <div key={l.id} className="flashListTile">
                    <span className="flashListBadge"><Layers size={12}/> {l.cards.length} termo{l.cards.length===1?"":"s"}</span>
                    <h4>{l.title || "Lista sem título"}</h4>
                    <p>{l.description || "Sem descrição"}</p>
                    <div className="flashListTileFoot">
                      <button className="flashStudyBtn" onClick={() => setViewingListId(l.id)}><Zap size={14}/> Estudar</button>
                      <button className="flashTileMenuBtn" onClick={(e) => { e.stopPropagation(); setOpenMenuId(id => id===`list:${l.id}`?null:`list:${l.id}`); }}><MoreVertical size={16}/></button>
                    </div>
                    {openMenuId===`list:${l.id}` && (
                      <div className="flashMenuPop" onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>{ setOpenMenuId(null); setListForm(l); }}><Pencil size={13}/> Editar</button>
                        {folders.length>0 && (
                          <select defaultValue="__placeholder__" onClick={e=>e.stopPropagation()} onChange={(e)=>{ const v=e.target.value; updateList(l.id, {folder_id: v==="__none__" ? null : v}); setOpenMenuId(null); }}>
                            <option value="__placeholder__" disabled>Mover para pasta...</option>
                            <option value="__none__">Sem pasta</option>
                            {folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                        )}
                        <button className="danger" onClick={()=>confirmDeleteList(l.id)}><Trash2 size={13}/> Excluir</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {!currentFolder && pdfCards.length > 0 && (
            <div className="flashSection">
              <h3>Cartões extraídos de PDFs</h3>
              <div className="flashcardGrid">
                {pdfCards.map(card => <FlashcardTile key={card.id} card={card} onDelete={() => removePdfCard(card.id)}/>)}
              </div>
            </div>
          )}
        </>
      )}

      {folderModal && (
        <FolderModal
          folder={folderModal === "new" ? null : folderModal}
          onClose={() => setFolderModal(null)}
          onSave={(name) => {
            if (folderModal === "new") addFolder({ name }); else updateFolder(folderModal.id, { name });
            setFolderModal(null);
          }}
        />
      )}
    </div>
  );
}

function FolderModal({ folder, onClose, onSave }) {
  const [name, setName] = useState(folder?.name || "");
  return (
    <div className="modalBack" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modalHead"><h2>{folder ? "Renomear pasta" : "Nova pasta"}</h2><button type="button" onClick={onClose}><X/></button></div>
        <label>Nome da pasta<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Português" onKeyDown={e=>{ if(e.key==="Enter" && name.trim()) onSave(name.trim()); }}/></label>
        <div className="modalActions">
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="add" disabled={!name.trim()} onClick={()=>onSave(name.trim())}><Check size={16}/> Salvar</button>
        </div>
      </div>
    </div>
  );
}

function FlashcardListForm({ list, defaultFolderId, onCancel, onSave }) {
  const [title, setTitle] = useState(list?.title || "");
  const [description, setDescription] = useState(list?.description || "");
  const [rows, setRows] = useState(
    list?.cards?.length ? list.cards.map(c => ({ id: c.id || rid(), term: c.term || "", definition: c.definition || "" }))
      : [{ id: rid(), term: "", definition: "" }, { id: rid(), term: "", definition: "" }]
  );

  const setRow = (id, field, value) => setRows(rs => rs.map(r => r.id===id ? {...r, [field]: value} : r));
  const removeRow = (id) => setRows(rs => rs.filter(r => r.id !== id));
  const addRow = () => setRows(rs => [...rs, { id: rid(), term: "", definition: "" }]);

  const submit = () => {
    const cards = rows.filter(r => r.term.trim() || r.definition.trim()).map(r => ({ id: r.id, term: r.term.trim(), definition: r.definition.trim() }));
    if (cards.length === 0) { alert("Adicione pelo menos um cartão com termo ou definição."); return; }
    onSave({
      title: title.trim() || "Lista sem título",
      description: description.trim(),
      folder_id: list ? (list.folder_id ?? null) : (defaultFolderId ?? null),
      cards
    });
  };

  return (
    <div className="content">
      <div className="flashFormHead">
        <h2>{list ? "Editar lista de cartões" : "Criar lista de cartões"}</h2>
        <div className="flashHeadActions">
          <button className="ghost" onClick={onCancel}>Cancelar</button>
          <button className="add" onClick={submit}><Check size={16}/> {list ? "Salvar" : "Criar"}</button>
        </div>
      </div>

      <div className="flashFormPanel">
        <label className="flashFormLabel">Título</label>
        <input className="flashFormTitleInput" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Conjunções — Português"/>
        <input className="flashFormDescInput" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Adicione uma descrição (opcional)"/>
      </div>

      {rows.map((r, i) => (
        <div className="flashFormRow" key={r.id}>
          <div className="flashFormRowHead"><span>{i+1}</span><button onClick={()=>removeRow(r.id)}><Trash2 size={14}/></button></div>
          <div className="flashFormRowFields">
            <div>
              <input value={r.term} onChange={e=>setRow(r.id,"term",e.target.value)} placeholder="Digite o termo"/>
              <label>TERMO</label>
            </div>
            <div>
              <input value={r.definition} onChange={e=>setRow(r.id,"definition",e.target.value)} placeholder="Digite a definição"/>
              <label>DEFINIÇÃO</label>
            </div>
          </div>
        </div>
      ))}

      <button className="flashAddRowBtn" onClick={addRow}><Plus size={15}/> Adicionar cartão</button>
    </div>
  );
}

function FlashcardListStudy({ list, onBack, onEdit }) {
  const [tab, setTab] = useState("cards");
  const cards = list.cards || [];

  return (
    <div className="content">
      <div className="flashFormHead">
        <div><h2>{list.title || "Lista sem título"}</h2><small className="flashListMeta">{cards.length} cartão{cards.length===1?"":"s"}</small></div>
        <div className="flashHeadActions">
          <button className="ghost" onClick={onEdit}><Pencil size={15}/> Editar</button>
          <button className="ghost" onClick={onBack}><ChevronLeft size={16}/> Voltar</button>
        </div>
      </div>

      <div className="flashTabs">
        <div className={"flashTab"+(tab==="cards"?" active":"")} onClick={()=>setTab("cards")}>
          <div className="flashTabIcon flashTabIconOrange"><Zap size={18}/></div>
          <div><b>Cartões</b><small>Vire e revise</small></div>
        </div>
        <div className={"flashTab"+(tab==="learn"?" active":"")} onClick={()=>setTab("learn")}>
          <div className="flashTabIcon flashTabIconPurple"><Lightbulb size={18}/></div>
          <div><b>Aprender</b><small>Quiz de múltipla escolha</small></div>
        </div>
        <div className={"flashTab"+(tab==="match"?" active":"")} onClick={()=>setTab("match")}>
          <div className="flashTabIcon flashTabIconGreen"><LayoutGrid size={18}/></div>
          <div><b>Combinar</b><small>Jogo de pares</small></div>
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="emptyHint">Esta lista ainda não tem cartões. Clique em "Editar" para adicionar.</p>
      ) : tab === "cards" ? <FlashcardFlipMode cards={cards}/>
        : tab === "learn" ? <FlashcardLearnMode cards={cards}/>
        : <FlashcardMatchMode cards={cards}/>}
    </div>
  );
}

function FlashcardFlipMode({ cards }) {
  const [deck, setDeck] = useState(cards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [feedback, setFeedback] = useState(null); // null | "know" | "learning"
  const [results, setResults] = useState([]); // [{id, know}]
  const [finished, setFinished] = useState(false);
  const card = deck[index];

  const go = (dir) => { setFlipped(false); setIndex(i => Math.max(0, Math.min(deck.length-1, i+dir))); };

  const respond = (type) => {
    if (feedback) return;
    setFeedback(type);
    setTimeout(() => {
      setFeedback(null);
      setResults(r => [...r, { id: card.id, know: type==="know" }]);
      if (index < deck.length-1) { setIndex(i => i+1); setFlipped(false); }
      else setFinished(true);
    }, 700);
  };

  const restartAll = () => { setDeck(cards); setIndex(0); setResults([]); setFinished(false); setFlipped(false); };
  const restartFailed = () => {
    const failedIds = new Set(results.filter(r => !r.know).map(r => r.id));
    const failedCards = cards.filter(c => failedIds.has(c.id));
    if (failedCards.length === 0) return;
    setDeck(failedCards); setIndex(0); setResults([]); setFinished(false); setFlipped(false);
  };

  useEffect(() => {
    const onKey = (e) => { if (e.code==="Space" && !finished) { e.preventDefault(); setFlipped(f=>!f); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finished]);

  if (finished) {
    const knowCount = results.filter(r => r.know).length;
    const learningCount = results.filter(r => !r.know).length;
    return (
      <div className="flashStudyArea">
        <div className="flashFlipDone">
          <div className="flashFlipDoneIcon"><Trophy size={32}/></div>
          <h3>Boa! Você revisou os {deck.length} cartão{deck.length===1?"":"s"} 🎉</h3>
          <div className="flashFlipDoneStats">
            <div className="flashFlipDoneStat know"><strong>{knowCount}</strong><span>Já sei</span></div>
            <div className="flashFlipDoneStat learning"><strong>{learningCount}</strong><span>Ainda aprendendo</span></div>
          </div>
          <div className="flashFlipDoneActions">
            <button className="ghost flashFlipDoneBtn" onClick={restartAll}><RotateCcw size={15}/> Estudar tudo de novo</button>
            {learningCount > 0 && (
              <button className="flashFlipRetryBtn" onClick={restartFailed}><Zap size={15}/> Só os que falta aprender ({learningCount})</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flashStudyArea">
      <div className="flashFlipCard" onClick={()=>{ if(!feedback) setFlipped(f=>!f); }}>
        <div className={"flashFlipInner"+(flipped?" flipped":"")}>
          <div className="flashFlipFace flashFlipFront"><small>TERMO</small><span>{card.term || "(sem termo)"}</span></div>
          <div className="flashFlipFace flashFlipBack"><small>DEFINIÇÃO</small><span>{card.definition || "(sem definição)"}</span></div>
        </div>
        {feedback && (
          <div className={"flashFlipFeedback"+(feedback==="know"?" know":" learning")}>
            {feedback==="know" ? "Já sei" : "Ainda aprendendo"}
          </div>
        )}
        <p className="flashFlipHint">Clique ou aperte espaço para virar</p>
      </div>
      <div className="flashFlipActions">
        <button className="flashFlipNo" disabled={!!feedback} onClick={()=>respond("learning")}><X size={16}/> Ainda aprendendo</button>
        <button className="flashFlipYes" disabled={!!feedback} onClick={()=>respond("know")}><Check size={16}/> Já sei</button>
      </div>
      <div className="flashPager">
        <button disabled={index===0} onClick={()=>go(-1)}><ChevronLeft size={16}/></button>
        <span>{index+1} / {deck.length}</span>
        <button disabled={index===deck.length-1} onClick={()=>go(1)}><ArrowRight size={16}/></button>
      </div>
    </div>
  );
}

function FlashcardLearnMode({ cards }) {
  const [order] = useState(() => shuffleArr(cards));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [correctCount, setCorrectCount] = useState(0);

  const finished = index >= order.length;
  const card = finished ? null : order[index];

  const options = useMemo(() => {
    if (!card) return [];
    const wrong = shuffleArr(cards.filter(c => c.id !== card.id)).slice(0, 3).map(c => c.definition);
    return shuffleArr([card.definition, ...wrong]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  if (cards.length < 2) return <p className="emptyHint">Adicione pelo menos 2 cartões para usar o modo Aprender.</p>;

  if (finished) {
    return (
      <div className="flashStudyArea">
        <div className="flashLearnDone">
          <CheckCircle2 size={36}/>
          <h3>Você concluiu esta lista!</h3>
          <p>{correctCount} de {order.length} respostas corretas.</p>
          <button className="add" onClick={()=>{ setIndex(0); setSelected(null); setCorrectCount(0); }}><RotateCcw size={15}/> Estudar de novo</button>
        </div>
      </div>
    );
  }

  const choose = (opt) => {
    if (selected) return;
    setSelected(opt);
    if (opt === card.definition) setCorrectCount(c => c+1);
  };
  const next = () => { setSelected(null); setIndex(i => i+1); };

  return (
    <div className="flashStudyArea">
      <div className="flashLearnQuestion"><small>TERMO</small><h3>{card.term}</h3></div>
      <div className="flashLearnOptions">
        {options.map((opt, i) => {
          let cls = "flashLearnOpt";
          if (selected) {
            if (opt === card.definition) cls += " correct";
            else if (opt === selected) cls += " wrong";
          }
          return <button key={i} className={cls} onClick={()=>choose(opt)}>{opt}</button>;
        })}
      </div>
      {selected && <button className="add flashLearnNext" onClick={next}>Próxima <ArrowRight size={15}/></button>}
      <div className="flashPager"><span>{index+1} / {order.length}</span></div>
    </div>
  );
}

function FlashcardMatchMode({ cards }) {
  const pairCards = cards.slice(0, 8);
  const makeTiles = () => shuffleArr(pairCards.flatMap(c => [
    { key: c.id+"-t", pairId: c.id, text: c.term },
    { key: c.id+"-d", pairId: c.id, text: c.definition }
  ]));
  const [tiles, setTiles] = useState(makeTiles);
  const [selected, setSelected] = useState(null);
  const [matched, setMatched] = useState([]);
  const [wrongFlash, setWrongFlash] = useState([]);

  const restart = () => { setTiles(makeTiles()); setSelected(null); setMatched([]); setWrongFlash([]); };

  if (cards.length < 2) return <p className="emptyHint">Adicione pelo menos 2 cartões para usar o modo Combinar.</p>;

  const onTap = (tile) => {
    if (matched.includes(tile.pairId) || wrongFlash.length) return;
    if (!selected) { setSelected(tile); return; }
    if (selected.key === tile.key) { setSelected(null); return; }
    if (selected.pairId === tile.pairId) {
      setMatched(m => [...m, tile.pairId]);
      setSelected(null);
    } else {
      setWrongFlash([selected.key, tile.key]);
      setTimeout(() => { setWrongFlash([]); setSelected(null); }, 500);
    }
  };

  const done = matched.length === pairCards.length;

  return (
    <div className="flashStudyArea">
      {done ? (
        <div className="flashLearnDone">
          <CheckCircle2 size={36}/>
          <h3>Você encontrou todos os pares!</h3>
          <button className="add" onClick={restart}><RotateCcw size={15}/> Jogar de novo</button>
        </div>
      ) : (
        <div className="flashMatchGrid">
          {tiles.map(t => {
            const isMatched = matched.includes(t.pairId);
            let cls = "flashMatchTile";
            if (isMatched) cls += " matched";
            else if (selected?.key === t.key) cls += " selected";
            else if (wrongFlash.includes(t.key)) cls += " wrong";
            return <button key={t.key} className={cls} disabled={isMatched} onClick={()=>onTap(t)}>{t.text}</button>;
          })}
        </div>
      )}
    </div>
  );
}

function stripHtml(html){
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}


function Budgets({entity,transactions,month}){
  const {data,add,remove}=entity;
  const [cat,setCat]=useState(""); const [limit,setLimit]=useState("");
  const spent=(cat)=>transactions.filter(x=>x.type==="out" && x.cat===cat).reduce((a,b)=>a+b.value,0);
  const submit=()=>{if(!cat.trim()||!limit)return; add({cat,limit_value:Number(limit)});setCat("");setLimit("");};
  return <div className="content"><div className="panel"><div className="panelTitle"><h2>Orçamento mensal</h2><span>{month.slice(5)}/{month.slice(0,4)}</span></div><div className="inlineAdd"><input value={cat} onChange={e=>setCat(e.target.value)} placeholder="Categoria (ex.: Alimentação)"/><input value={limit} onChange={e=>setLimit(e.target.value)} type="number" step="0.01" min="0" placeholder="Limite mensal"/><button onClick={submit}><Plus/></button></div></div><div className="budgetGrid">{data.map(x=>{const s=spent(x.cat),pct=x.limit_value?Math.round(s/x.limit_value*100):0;return <div className="budgetCard" key={x.id}><div className="panelTitle"><h3>{x.cat}</h3><button onClick={()=>remove(x.id)}><Trash2 size={15}/></button></div><b>{money(s)} <small>/ {money(x.limit_value)}</small></b><div className="progress"><i style={{width:Math.min(100,pct)+"%"}}/></div><p>{pct>100?`Você ultrapassou ${money(s-x.limit_value)}.`:`Restam ${money(Math.max(0,x.limit_value-s))}.`}</p></div>})}{!data.length&&<p className="emptyHint">Cadastre limites por categoria para acompanhar seus gastos.</p>}</div></div>;
}

function Goals({entity}){
  const {data,add,remove,update}=entity; const [name,setName]=useState(""); const [target,setTarget]=useState(""); const [saved,setSaved]=useState("");
  const submit=()=>{if(!name.trim()||!target)return;add({name,target:Number(target),saved:Number(saved)||0});setName("");setTarget("");setSaved("");};
  return <div className="content"><div className="panel"><div className="panelTitle"><h2>Metas financeiras</h2></div><div className="inlineAdd"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Computador"/><input value={target} onChange={e=>setTarget(e.target.value)} type="number" step="0.01" min="0" placeholder="Valor da meta"/><input value={saved} onChange={e=>setSaved(e.target.value)} type="number" step="0.01" min="0" placeholder="Já guardado"/><button onClick={submit}><Plus/></button></div></div><div className="goalGrid">{data.map(x=>{const pct=x.target?Math.min(100,Math.round(x.saved/x.target*100)):0;return <div className="goalCard" key={x.id}><div className="panelTitle"><h3><Target size={17}/> {x.name}</h3><button onClick={()=>remove(x.id)}><Trash2 size={15}/></button></div><strong>{money(x.saved)}</strong><small> de {money(x.target)}</small><div className="progress"><i style={{width:pct+"%"}}/></div><div className="goalActions"><span>{pct}% concluído</span><button onClick={()=>{const n=Number(prompt("Quanto adicionar à meta?"));if(n>0)update(x.id,{saved:Math.min(x.target,x.saved+n)})}}>+ Adicionar</button></div></div>})}{!data.length&&<p className="emptyHint">Crie uma meta para acompanhar seu progresso.</p>}</div></div>;
}

function studyGoalPct(g){
  if(g.mode==="count"){
    const t = Number(g.target_value)||0;
    return t ? Math.min(100, Math.round((Number(g.current_value)||0)/t*100)) : 0;
  }
  return Math.min(100, Math.max(0, Number(g.percent)||0));
}
function studyGoalFmtDate(d){
  if(!d) return "";
  const [y,m,dd] = d.split("-");
  return (dd && m && y) ? `${dd}/${m}/${y}` : d;
}
function studyGoalBadge(g){
  if(g.status==="concluida") return {label:"Concluída", color:"#3ecf6a"};
  if(g.status==="pausada") return {label:"Pausada", color:"#8d95a4"};
  return {label:"Em andamento", color: colorHex(g.color)};
}

function StudyGoals({entity, studyPdfsList=[], booksList=[]}){
  const {data,add,remove,update} = entity;
  const [filter,setFilter] = useState("todas");
  const [openMenuId,setOpenMenuId] = useState(null);
  const [modal,setModal] = useState(null); // null | "new" | goal being edited

  const total = data.length;
  const emAndamento = data.filter(g=>g.status==="andamento").length;
  const concluidas = data.filter(g=>g.status==="concluida").length;
  const pausadas = data.filter(g=>g.status==="pausada").length;
  const filtered = filter==="todas" ? data : data.filter(g=>g.status===filter);

  const confirmRemove = (id)=>{ if(confirm("Excluir esta meta?")){ setOpenMenuId(null); remove(id); } };

  return <div className="content">
    <div className="studyGoalsHead">
      <div><h2>Metas</h2><p>Acompanhe suas metas e conquistas.</p></div>
      <button className="add" onClick={()=>setModal("new")}><Plus size={17}/> Nova meta</button>
    </div>

    <div className="studyStats">
      <div className="studyStat"><div className="studyStatIcon" style={{background:"#ff5c5c22",color:"#ff5c5c"}}><Target size={17}/></div><strong>{total}</strong><small>Metas no total</small></div>
      <div className="studyStat"><div className="studyStatIcon" style={{background:"#f0b42922",color:"#f0b429"}}><TrendingUp size={17}/></div><strong>{emAndamento}</strong><small>Em andamento</small></div>
      <div className="studyStat"><div className="studyStatIcon" style={{background:"#3ecf6a22",color:"#3ecf6a"}}><CheckCircle2 size={17}/></div><strong>{concluidas}</strong><small>Concluídas</small></div>
      <div className="studyStat"><div className="studyStatIcon" style={{background:"#a06bff22",color:"#a06bff"}}><Hourglass size={17}/></div><strong>{pausadas}</strong><small>Pausadas</small></div>
    </div>

    <div className="studyGoalsListHead">
      <h3>Minhas metas</h3>
      <div className="filterWrap"><Filter size={13}/><select value={filter} onChange={e=>setFilter(e.target.value)}>
        <option value="todas">Todas</option>
        <option value="andamento">Em andamento</option>
        <option value="concluida">Concluídas</option>
        <option value="pausada">Pausadas</option>
      </select></div>
    </div>

    <div className="studyGoalList" onClick={()=>setOpenMenuId(null)}>
      {filtered.map(g=>{
        const pct = studyGoalPct(g);
        const hex = colorHex(g.color);
        const Icon = STUDY_ICONS[g.icon] || Target;
        const badge = studyGoalBadge(g);
        return <div className="studyGoalCard" key={g.id}>
          <div className="studyGoalIcon" style={{background:hex+"22", color:hex}}><Icon size={20}/></div>
          <div className="studyGoalBody">
            <div className="studyGoalTop">
              <div><h4>{g.title}</h4>{g.description && <p>{g.description}</p>}</div>
              <button className="studyGoalMenuBtn" onClick={(e)=>{e.stopPropagation(); setOpenMenuId(id=>id===g.id?null:g.id);}}><MoreVertical size={18}/></button>
            </div>
            <div className="studyGoalProgressRow">
              <div className="progress"><i style={{width:pct+"%", background:hex}}/></div>
              <span className="studyGoalPct" style={{color:hex}}>{pct}%</span>
            </div>
            <div className="studyGoalFoot">
              <div className="studyGoalFootInfoStack">
                <span className="studyGoalFootInfo">
                  {g.mode==="count"
                    ? <><ClipboardList size={13}/> Progresso: {g.current_value||0} / {g.target_value||0} {g.unit||""}</>
                    : (g.due_date ? <><CalendarClock size={13}/> Conclusão: {studyGoalFmtDate(g.due_date)}</> : "")}
                </span>
                {g.link_source && g.link_source!=="none" && (
                  <span className="studyGoalFootInfo studyGoalFootLink">
                    <FileText size={13}/> Vinculada ao {g.link_source==="livro"?"livro":"PDF de estudo"}
                    {g.link_page_start ? ` · pág. ${g.link_page_start}–${g.link_page_end}` : ""} (atualiza sozinha)
                  </span>
                )}
              </div>
              <span className="studyGoalBadge" style={{color:badge.color, borderColor:badge.color}}>{badge.label}</span>
            </div>
          </div>
          {openMenuId===g.id && <div className="studyGoalMenuPop" onClick={e=>e.stopPropagation()}>
            <button onClick={()=>{setOpenMenuId(null); setModal(g);}}><Pencil size={13}/> Editar</button>
            {g.status!=="concluida" && <button onClick={()=>{setOpenMenuId(null); update(g.id,{status:"concluida"});}}><CheckCircle2 size={13}/> Marcar como concluída</button>}
            {g.status==="andamento" && <button onClick={()=>{setOpenMenuId(null); update(g.id,{status:"pausada"});}}><Hourglass size={13}/> Pausar</button>}
            {(g.status==="pausada"||g.status==="concluida") && <button onClick={()=>{setOpenMenuId(null); update(g.id,{status:"andamento"});}}><RotateCcw size={13}/> Reativar</button>}
            <button className="danger" onClick={()=>confirmRemove(g.id)}><Trash2 size={13}/> Excluir</button>
          </div>}
        </div>;
      })}
      {filtered.length===0 && <p className="emptyHint">{data.length===0 ? "Crie sua primeira meta de estudo." : "Nenhuma meta nesse filtro."}</p>}
    </div>

    {modal && <StudyGoalModal goal={modal==="new"?null:modal} studyPdfsList={studyPdfsList} booksList={booksList} onClose={()=>setModal(null)} onSave={(payload)=>{
      if(modal==="new") add(payload); else update(modal.id, payload);
      setModal(null);
    }}/>}
  </div>;
}

function StudyGoalModal({goal, studyPdfsList=[], booksList=[], onClose, onSave}){
  const [title,setTitle] = useState(goal?.title||"");
  const [description,setDescription] = useState(goal?.description||"");
  const [icon,setIcon] = useState(goal?.icon||"target");
  const [color,setColor] = useState(goal?.color||"red");
  const [mode,setMode] = useState(goal?.mode||"percent");
  const [percent,setPercent] = useState(goal?.percent ?? 0);
  const [currentValue,setCurrentValue] = useState(goal?.current_value ?? "");
  const [targetValue,setTargetValue] = useState(goal?.target_value ?? "");
  const [unit,setUnit] = useState(goal?.unit || "");
  const [dueDate,setDueDate] = useState(goal?.due_date || "");
  const [status,setStatus] = useState(goal?.status || "andamento");
  const [linkSource,setLinkSource] = useState(goal?.link_source || "none");
  const [linkPdfId,setLinkPdfId] = useState(goal?.link_pdf_id || "");
  const [linkPageStart,setLinkPageStart] = useState(goal?.link_page_start ?? "");
  const [linkPageEnd,setLinkPageEnd] = useState(goal?.link_page_end ?? "");

  const linkOptions = linkSource==="livro" ? booksList : studyPdfsList;
  const linkedDoc = linkOptions.find(d=>d.id===linkPdfId);

  const submit = (e) => {
    e.preventDefault();
    if(!title.trim()) return;

    const isLinked = mode==="count" && linkSource!=="none" && linkPdfId && linkPageStart && linkPageEnd;

    const payload = {
      title: title.trim(),
      description: description.trim(),
      icon, color, mode, status,
      percent: mode==="percent" ? Math.min(100,Math.max(0,Number(percent)||0)) : 0,
      due_date: dueDate || null,
      link_source: "none",
      link_pdf_id: null,
      link_page_start: null,
      link_page_end: null,
    };

    if (isLinked) {
      const start = Number(linkPageStart), end = Number(linkPageEnd);
      const target = Math.max(0, end - start + 1);
      const current = Math.max(0, Math.min(target, (linkedDoc?.current_page||1) - start + 1));
      payload.current_value = current;
      payload.target_value = target;
      payload.unit = "páginas";
      payload.link_source = linkSource;
      payload.link_pdf_id = linkPdfId;
      payload.link_page_start = start;
      payload.link_page_end = end;
      if (target>0 && current>=target) payload.status = "concluida";
    } else {
      payload.current_value = mode==="count" ? Number(currentValue)||0 : 0;
      payload.target_value = mode==="count" ? Number(targetValue)||0 : 0;
      payload.unit = mode==="count" ? unit.trim() : "";
    }

    onSave(payload);
  };

  return <div className="modalBack" onClick={onClose}>
    <form className="modal" onClick={e=>e.stopPropagation()} onSubmit={submit}>
      <div className="modalHead"><h2>{goal?"Editar meta":"Nova meta"}</h2><button type="button" onClick={onClose}><X/></button></div>
      <label>Título<input value={title} onChange={e=>setTitle(e.target.value)} required placeholder="Ex.: Aprovação na EsPCEx"/></label>
      <label>Descrição<input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Ex.: Estudar com constância e conquistar minha vaga."/></label>

      <label>Ícone
        <div className="iconColorPicker">
          {Object.entries(STUDY_ICONS).map(([key,Ic])=>
            <button type="button" key={key} className={"iconPickBtn "+(icon===key?"active":"")} onClick={()=>setIcon(key)}><Ic size={17}/></button>
          )}
        </div>
      </label>
      <label>Cor
        <div className="iconColorPicker">
          {STUDY_COLORS.map(c=>
            <button type="button" key={c.key} className={"colorPickBtn "+(color===c.key?"active":"")} style={{background:c.hex}} onClick={()=>setColor(c.key)}/>
          )}
        </div>
      </label>

      <label>Tipo de progresso
        <div className="modeToggle">
          <button type="button" className={mode==="percent"?"active":""} onClick={()=>setMode("percent")}>Percentual</button>
          <button type="button" className={mode==="count"?"active":""} onClick={()=>setMode("count")}>Quantidade</button>
        </div>
      </label>

      {mode==="percent" && <label>Progresso atual (%)<input type="number" min="0" max="100" value={percent} onChange={e=>setPercent(e.target.value)}/></label>}

      {mode==="count" && <>
        <label>Vincular a um PDF (opcional)
          <div className="modeToggle">
            <button type="button" className={linkSource==="none"?"active":""} onClick={()=>{setLinkSource("none"); setLinkPdfId("");}}>Nenhum</button>
            <button type="button" className={linkSource==="estudo"?"active":""} onClick={()=>{setLinkSource("estudo"); setLinkPdfId("");}}>PDF de estudo</button>
            <button type="button" className={linkSource==="livro"?"active":""} onClick={()=>{setLinkSource("livro"); setLinkPdfId("");}}>Livro (PDF)</button>
          </div>
        </label>

        {linkSource==="none" && <>
          <div className="fieldRow">
            <label>Valor atual<input type="number" min="0" value={currentValue} onChange={e=>setCurrentValue(e.target.value)} placeholder="0"/></label>
            <label>Meta<input type="number" min="0" value={targetValue} onChange={e=>setTargetValue(e.target.value)} placeholder="10"/></label>
          </div>
          <label>Unidade<input value={unit} onChange={e=>setUnit(e.target.value)} placeholder="Ex.: livros, questões"/></label>
        </>}

        {linkSource!=="none" && <>
          <label>{linkSource==="livro" ? "Livro" : "PDF de estudo"}
            <select value={linkPdfId} onChange={e=>setLinkPdfId(e.target.value)} required>
              <option value="">Selecione...</option>
              {linkOptions.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </label>
          {linkOptions.length===0 && <p className="fieldHint">Nenhum PDF cadastrado ainda em {linkSource==="livro"?"Livros":"Leitor de PDF"}.</p>}
          <div className="fieldRow">
            <label>Página inicial<input type="number" min="1" max={linkedDoc?.total_pages||undefined} value={linkPageStart} onChange={e=>setLinkPageStart(e.target.value)} placeholder="Ex.: 40" required/></label>
            <label>Página final<input type="number" min="1" max={linkedDoc?.total_pages||undefined} value={linkPageEnd} onChange={e=>setLinkPageEnd(e.target.value)} placeholder="Ex.: 55" required/></label>
          </div>
          <p className="fieldHint">O progresso é atualizado sozinho conforme você avança a leitura desse PDF, e a meta conclui automaticamente ao chegar na página final.</p>
        </>}
      </>}

      <label>Data de conclusão (opcional)<input type="date" value={dueDate||""} onChange={e=>setDueDate(e.target.value)}/></label>

      <label>Status
        <select value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="andamento">Em andamento</option>
          <option value="concluida">Concluída</option>
          <option value="pausada">Pausada</option>
        </select>
      </label>

      <button className="primary" type="submit">{goal?"Salvar":"Criar meta"}</button>
    </form>
  </div>;
}

function Recurring({entity,transactions}){
  const {data,add,remove}=entity; const [name,setName]=useState(""); const [value,setValue]=useState(""); const [cat,setCat]=useState("Assinaturas"); const [day,setDay]=useState("");
  const submit=()=>{if(!name.trim()||!value||!day)return;add({name,value:Number(value),cat,day:Number(day),type:"out"});setName("");setValue("");setDay("");};
  return <div className="content"><div className="panel"><div className="panelTitle"><h2>Pagamentos recorrentes</h2><span>Modelo para gerar despesas mensais</span></div><div className="inlineAdd"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Netflix"/><input value={value} onChange={e=>setValue(e.target.value)} type="number" step="0.01" min="0" placeholder="Valor"/><input value={day} onChange={e=>setDay(e.target.value)} type="number" min="1" max="31" placeholder="Dia"/><button onClick={submit}><Plus/></button></div></div><div className="panel">{data.map(x=><div className="transaction" key={x.id}><div><b>{x.name}</b><small>{x.cat} · todo dia {x.day}</small></div><strong>{money(x.value)}</strong><button onClick={()=>remove(x.id)}><Trash2 size={16}/></button></div>)}{!data.length&&<p className="emptyHint">Cadastre assinaturas e contas mensais aqui.</p>}</div></div>;
}

function Notes({entity, openNoteId, onConsumeOpenNote}){
  const { data, add, remove, update, reorder } = entity;
  const [openMenuId, setOpenMenuId] = useState(null);
  const [activeNote, setActiveNote] = useState(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState(null);

  useEffect(() => {
    if (!openNoteId) return;
    const note = data.find(n => n.id === openNoteId);
    if (note) setActiveNote(note);
    onConsumeOpenNote?.();
  }, [openNoteId, data]);

  const createNote = async () => {
    const title = window.prompt("Título da nota:", "Nova nota");
    if (!title) return;
    setCreating(true);
    try {
      await add({ title, content: "" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (note) => {
    if (!confirm(`Excluir "${note.title}"?`)) return;
    setOpenMenuId(null);
    await remove(note.id);
    if (activeNote?.id === note.id) setActiveNote(null);
  };

  const handleDrop = (targetId) => {
    if (dragId === null || dragId === targetId) { setDragId(null); return; }
    const newData = [...data];
    const fromIdx = newData.findIndex(n => n.id === dragId);
    const toIdx = newData.findIndex(n => n.id === targetId);
    setDragId(null);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = newData.splice(fromIdx, 1);
    newData.splice(toIdx, 0, moved);
    reorder(newData);
  };

  const preview = (content) => {
    const text = stripHtml(content);
    return !text ? "Nota vazia" : (text.length > 90 ? text.slice(0, 90) + "…" : text);
  };

  return (
    <div className="content">
      {data.length > 0 && (
        <div className="notesActions">
          <button className="ghost" onClick={() => downloadAllNotesPdf(data)}>
            <Download size={15}/> Baixar todas em PDF
          </button>
        </div>
      )}
      <div className="notesGrid" onClick={() => setOpenMenuId(null)}>
        <div className="noteTile addTile" onClick={createNote}>
          <div className="noteCoverWrap addCover">
            {creating ? <span>Criando...</span> : <><Plus size={26}/><span>Nova nota</span></>}
          </div>
        </div>
        {data.map(note => (
          <div
            className={"noteTile"+(dragId===note.id?" dragging":"")}
            key={note.id}
            draggable
            onDragStart={(e)=>{ e.stopPropagation(); setDragId(note.id); e.dataTransfer.effectAllowed="move"; }}
            onDragOver={(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect="move"; }}
            onDrop={(e)=>{ e.preventDefault(); e.stopPropagation(); handleDrop(note.id); }}
            onDragEnd={()=>setDragId(null)}
          >
            <div className="noteCoverWrap" onClick={() => setActiveNote(note)}>
              <b className="noteTitle">{note.title}</b>
              <p className="notePreview">{preview(note.content)}</p>
            </div>
            <button className="bookMenuBtn" onClick={(e) => { e.stopPropagation(); setOpenMenuId(id => id === note.id ? null : note.id); }}>
              <MoreVertical size={15}/>
            </button>
            {openMenuId === note.id && (
              <div className="bookMenu" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setOpenMenuId(null); setActiveNote(note); }}><StickyNote size={14}/> Abrir</button>
                <button onClick={() => { setOpenMenuId(null); downloadNotePdf(note); }}><Download size={14}/> Baixar PDF</button>
                <button className="danger" onClick={() => handleDelete(note)}><Trash2 size={14}/> Excluir</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {data.length === 0 && <p className="emptyHint">Nenhuma nota por aqui ainda.</p>}
      {activeNote && (
        <NoteEditor
          note={activeNote}
          onClose={() => setActiveNote(null)}
          onSave={(patch) => update(activeNote.id, patch)}
        />
      )}
    </div>
  );
}

const EMOJIS = [
  "😀","😄","😁","😂","🙂","😉","😍","🤩","🤔","😅",
  "😎","🙃","😴","😭","😡","🥳","😇","🤗","👍","👎",
  "👏","🙏","💪","✨","🔥","⭐","❤️","💡","✅","❌",
  "📌","📅","⏰","🎯","📝","🚀","🎉","☕","💰","📚"
];

function NoteEditor({ note, onClose, onSave }) {
  const [title, setTitle] = useState(note.title);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const saveTimer = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    setTitle(note.title);
    if (bodyRef.current) bodyRef.current.innerHTML = note.content || "";
  }, [note.id]);

  const scheduleSave = (patch) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onSave(patch), 600);
  };

  const handleTitleChange = (e) => {
    const v = e.target.value;
    setTitle(v);
    scheduleSave({ title: v });
  };

  const handleBodyInput = () => {
    scheduleSave({ content: bodyRef.current?.innerHTML || "" });
  };

  // Impede que o clique num botão da barra tire o foco/seleção do texto
  const keepFocus = (e) => e.preventDefault();

  const exec = (command, value = null) => {
    bodyRef.current?.focus();
    document.execCommand(command, false, value);
    handleBodyInput();
  };

  const insertEmoji = (emoji) => {
    bodyRef.current?.focus();
    document.execCommand("insertText", false, emoji);
    setEmojiOpen(false);
    handleBodyInput();
  };

  const insertChecklist = () => {
    const el = bodyRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    const newItem = document.createElement("div");
    newItem.className = "checklist-item";
    const box = document.createElement("span");
    box.className = "check-box";
    box.setAttribute("contenteditable", "false");
    const text = document.createElement("span");
    text.className = "check-text";
    newItem.appendChild(box);
    newItem.appendChild(text);

    if (sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).startContainer)) {
      const range = sel.getRangeAt(0);
      range.collapse(false);
      range.insertNode(newItem);
    } else {
      el.appendChild(newItem);
    }

    const r = document.createRange();
    r.setStart(text, 0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    handleBodyInput();
  };

  // Alterna o estado marcado/desmarcado ao clicar no quadradinho
  const handleBodyClick = (e) => {
    const box = e.target.closest?.(".check-box");
    if (!box) return;
    e.preventDefault();
    box.closest(".checklist-item")?.classList.toggle("checked");
    handleBodyInput();
  };

  // Ao apertar Enter dentro de um item de marcação, cria automaticamente o próximo
  // (mesmo comportamento das listas com bolinhas). Enter num item vazio sai da lista.
  const handleBodyKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range0 = sel.getRangeAt(0);
    const startNode = range0.startContainer;
    const textEl = (startNode.nodeType === 3 ? startNode.parentElement : startNode)?.closest?.(".check-text");
    if (!textEl) return;
    e.preventDefault();
    const itemEl = textEl.closest(".checklist-item");

    // Pega o que ficou depois do cursor para levar para o novo item
    let afterFrag = document.createDocumentFragment();
    if (textEl.lastChild) {
      const afterRange = document.createRange();
      afterRange.setStart(range0.endContainer, range0.endOffset);
      afterRange.setEndAfter(textEl.lastChild);
      afterFrag = afterRange.extractContents();
    }

    const isEmpty = textEl.textContent.trim() === "" && afterFrag.textContent.trim() === "";

    if (isEmpty) {
      // Enter num item vazio: sai da lista de marcação
      const exitLine = document.createElement("div");
      exitLine.innerHTML = "<br>";
      itemEl.replaceWith(exitLine);
      const r = document.createRange();
      r.setStart(exitLine, 0);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    } else {
      const newItem = document.createElement("div");
      newItem.className = "checklist-item";
      const box = document.createElement("span");
      box.className = "check-box";
      box.setAttribute("contenteditable", "false");
      const text = document.createElement("span");
      text.className = "check-text";
      text.appendChild(afterFrag);
      newItem.appendChild(box);
      newItem.appendChild(text);
      itemEl.after(newItem);
      const r = document.createRange();
      r.setStart(text, 0);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    handleBodyInput();
  };

  const handleClose = () => {
    clearTimeout(saveTimer.current);
    onSave({ title: title.trim() || "Sem título", content: bodyRef.current?.innerHTML || "" });
    onClose();
  };

  return (
    <div className="readerBack">
      <div className="readerModal noteModal">
        <div className="readerHead">
          <input className="noteTitleInput" value={title} onChange={handleTitleChange} placeholder="Título da nota" autoFocus/>
          <button onClick={handleClose}><X/></button>
        </div>
        <div className="noteToolbar" onMouseDown={keepFocus}>
          <button title="Negrito" onClick={() => exec("bold")}><Bold size={16}/></button>
          <button title="Itálico" onClick={() => exec("italic")}><Italic size={16}/></button>
          <button title="Sublinhado" onClick={() => exec("underline")}><Underline size={16}/></button>
          <span className="noteToolDivider"/>
          <div className="emojiWrap">
            <button title="Emoji" onClick={() => setEmojiOpen(o => !o)}><Smile size={16}/></button>
            {emojiOpen && (
              <div className="emojiPopover">
                {EMOJIS.map(em => (
                  <button key={em} className="emojiBtn" onClick={() => insertEmoji(em)}>{em}</button>
                ))}
              </div>
            )}
          </div>
          <span className="noteToolDivider"/>
          <button title="Centralizar texto" onClick={() => exec("justifyCenter")}><AlignCenter size={16}/></button>
          <span className="noteToolDivider"/>
          <button title="Lista com marcadores" onClick={() => exec("insertUnorderedList")}><List size={16}/></button>
          <button title="Lista numerada (1, 2, 3)" onClick={() => exec("insertOrderedList")}><ListOrdered size={16}/></button>
          <button title="Lista de marcação" onClick={insertChecklist}><CheckSquare size={16}/></button>
          <span className="noteToolDivider"/>
          <button title="Baixar esta nota em PDF" onClick={() => downloadNotePdf({ title, content: bodyRef.current?.innerHTML || "" })}><Download size={16}/></button>
        </div>
        <div className="noteEditorBody" onClick={() => setEmojiOpen(false)}>
          <div
            ref={bodyRef}
            className="noteTextarea noteRichBody"
            contentEditable
            suppressContentEditableWarning
            onInput={handleBodyInput}
            onClick={handleBodyClick}
            onKeyDown={handleBodyKeyDown}
            data-placeholder="Escreva o que quiser..."
          />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Root/>);
