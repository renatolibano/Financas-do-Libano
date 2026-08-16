import React, {useMemo, useState, useEffect, useRef} from "react";
import {createRoot} from "react-dom/client";
import {createPortal} from "react-dom";
import {
  LayoutDashboard, ArrowLeftRight, CreditCard, CircleDollarSign,
  CalendarClock, Bell, StickyNote, Bot, Plus, TrendingUp, TrendingDown,
  WalletCards, Clock3, Trash2, X, LogOut, Cloud, CloudOff,
  Cake, BookOpen, BookMarked, BookCheck, ChevronRight, ChevronDown, MoreVertical,
  Bold, Italic, Underline, AlignCenter, List, ListOrdered, CheckSquare, Smile, Target, PiggyBank, Repeat2,
  GraduationCap, Layers, BarChart3, FileText, Settings, Sun, Moon,
  ClipboardList, Dumbbell, Star, Flag, Brain, Hourglass, CheckCircle2, Filter, Pencil, RotateCcw,
  CheckCheck, Download, Search, ZoomIn, ZoomOut, Maximize2, Minimize2, Bookmark, ArrowRight, Folder, FolderPlus, ImagePlus,
  ChevronLeft, Check, Zap, Lightbulb, LayoutGrid, Sparkles, Trophy,
  PenTool, Eraser, Highlighter, Undo2, Redo2, MousePointer2, Type, Square, Circle, Minus, ArrowUpRight, Eye, EyeOff,
  Upload, Popcorn, Clapperboard, Play, Pause, Gamepad2,
  Film, Link2, SkipBack, SkipForward, ArrowUp, ArrowDown, ChevronUp,
  ShoppingCart, ExternalLink, PictureInPicture2, Landmark, RefreshCw, FilePlus2, Hand, Crosshair
} from "lucide-react";
import "./styles.css";
import { supabase, cloudConfigured } from "./lib/supabaseClient";
import { getPluggyConnectToken, syncPluggyItem } from "./lib/bank";
import { useEntity } from "./lib/useEntity";
import { clearLocal, usePersistentState, loadLocal, saveLocal } from "./lib/storage";
import { pdfjsLib } from "./lib/pdf";
import { downloadNotePdf, downloadAllNotesPdf } from "./lib/notesPdf";
import { jsPDF } from "jspdf";
import { uploadBookFile, downloadBookFile, deleteBookFile } from "./lib/books";
import { uploadStudyPdfFile, downloadStudyPdfFile, deleteStudyPdfFile } from "./lib/studyPdfs";
import { createBlankPdfBlob, appendImagePageToPdfBlob } from "./lib/pdfPages";
import {
  strokeOutlinePath, detectShapeFromPoints, hitTestAnnotation, findAnnotationAt, annotationBBox,
  translateAnnotation, resizeShapeAnnotation, eraseAnnotationAtPoint, exportAnnotatedPdf, drawAnnotationOnCanvas,
} from "./lib/annotations";
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
const maskMoney = (n, hidden) => hidden ? "R$ ••••" : money(n);

// Hook reutilizável de tela cheia: usa a Fullscreen API do navegador no elemento apontado por `ref`,
// o que no celular também esconde a barra de endereço/navegação. Se o navegador não suportar a API
// (ex.: Safari iOS mais antigo), cai para uma classe CSS que expande o elemento ocupando a tela toda.
function useFullscreen(ref) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = async () => {
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

  useEffect(() => () => { if (document.fullscreenElement === ref.current) document.exitFullscreen?.().catch(()=>{}); }, []);

  return [fullscreen, toggleFullscreen];
}


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

// Mesmo princípio da função acima, mas para Metas (modo "Quantidade") vinculadas a Flashcards.
// Como uma meta de flashcards pode reunir várias listas ("Card 1", "Card 2"...), o progresso é
// recalculado toda vez contando quantas das listas vinculadas já foram estudadas até o fim
// (campo "completed" de cada lista), e a meta conclui sozinha quando todas estiverem marcadas.
function syncLinkedFlashcardGoalsProgress(studyGoalsEntity, listsData, listId, listTitle) {
  if (!studyGoalsEntity) return;
  const { data, update } = studyGoalsEntity;
  data.forEach(g => {
    if (g.mode !== "count" || g.link_source !== "flashcards") return;
    if (g.status !== "andamento") return;
    const linkedIds = Array.isArray(g.link_list_ids) ? g.link_list_ids : [];
    if (!linkedIds.includes(listId)) return;
    const target = Number(g.target_value) || linkedIds.length;
    if (!target) return;
    const done = linkedIds.filter(id => listsData.find(l => l.id === id)?.completed).length;
    if (done === Number(g.current_value || 0)) return;
    const patch = { current_value: done };
    const justCompleted = done >= target;
    if (justCompleted) patch.status = "concluida";
    update(g.id, patch);
    if (justCompleted) toast(`Meta concluída — todos os flashcards estudados 🎉`);
    else toast(`Flashcards estudados — ${listTitle} · ${done}/${target} listas concluídas`);
  });
}

// Marca uma lista de flashcards como estudada (assim que o usuário termina uma rodada completa
// em qualquer um dos modos: Cartões, Aprender ou Combinar) e sincroniza as Metas vinculadas a ela.
function markFlashcardListStudied(listsEntity, studyGoalsEntity, listId, listTitle) {
  if (!listsEntity) return;
  const list = listsEntity.data.find(l => l.id === listId);
  if (list?.completed) return; // já estava contabilizada, evita atualizações repetidas
  listsEntity.update(listId, { completed: true });
  const updatedLists = listsEntity.data.map(l => l.id === listId ? { ...l, completed: true } : l);
  syncLinkedFlashcardGoalsProgress(studyGoalsEntity, updatedLists, listId, listTitle);
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
  const workoutFolders = useEntity("workout_folders", [], session, "asc", {orderable:true});
  const workoutExercises = useEntity("workout_exercises", [], session, "asc", {orderable:true});
  const shoppingItems = useEntity("shopping_items", [], session, "asc", {orderable:true});
  const [showOverviewEdit,setShowOverviewEdit] = useState(false);
  const [showSettings,setShowSettings] = useState(false);
  const [mobileNavExpanded,setMobileNavExpanded] = useState(false);
  const [mobileMenuOpen,setMobileMenuOpen] = useState(false);
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

  // Mostrar/ocultar valores na Visão Geral (ícone de olho no celular).
  const [hideValues, setHideValues] = usePersistentState("overview_hide_values", false);

  // Quanto ainda resta dos limites de orçamento cadastrados neste mês.
  const budgetLimitTotal = useMemo(()=>budgets.data.reduce((a,b)=>a+(Number(b.limit_value)||0),0),[budgets.data]);
  const budgetSpentTotal = useMemo(()=>budgets.data.reduce((a,b)=>a+monthTransactions.filter(t=>t.type==="out"&&t.cat===b.cat).reduce((x,y)=>x+y.value,0),0),[budgets.data,monthTransactions]);
  const budgetAvailable = budgetLimitTotal - budgetSpentTotal;

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
      { key:"Lista de Compras", label:"Lista de compras", icon:ShoppingCart },
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
      { key:"Nivelamento", icon:BarChart3 },
      { key:"Leitor de PDF", icon:FileText },
    ]},
    { type:"group", key:"lazer", label:"Área de Lazer", icon:Popcorn, children:[
      { key:"Treino", icon:Dumbbell },
      { key:"Filmes e Séries", icon:Clapperboard },
      { key:"Jogos", icon:Gamepad2 },
    ]},
  ];
  const [openGroups,setOpenGroups] = useState({});
  const goTo = (key)=>{
    setPage(key);
    if(window.innerWidth<=760) setMobileOpen(false);
    // Em telas de toque, o navegador às vezes mantém o estado ":hover"/":active"
    // grudado no botão tocado até o próximo toque em outro lugar. Tirar o foco
    // aqui garante que a barra lateral feche por completo visualmente.
    document.activeElement?.blur?.();
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

    <div className="mobileTabBar">
      <div className={"mobileTabBarPanel "+(mobileNavExpanded?"open":"")}>
        <button onClick={()=>{setMobileMenuOpen(true);setMobileNavExpanded(false);}}>
          <LayoutGrid size={19}/><span>Menu</span>
        </button>
        <button className={page==="Visão Geral"?"active":""} onClick={()=>{goTo("Visão Geral");setMobileNavExpanded(false);}}>
          <LayoutDashboard size={19}/><span>Início</span>
        </button>
        <button onClick={()=>{setShowSettings(true);setMobileNavExpanded(false);}}>
          <Settings size={19}/><span>Configurações</span>
        </button>
      </div>
      <button className="mobileTabBarHandle" onClick={()=>setMobileNavExpanded(o=>!o)} aria-label="Mostrar menu de navegação">
        {mobileNavExpanded ? <ChevronDown size={18}/> : <ChevronUp size={18}/>}
      </button>
    </div>

    {mobileMenuOpen && <MobileMenuOverlay navTree={navTree} page={page} goTo={(k)=>{goTo(k);setMobileMenuOpen(false);}} onClose={()=>setMobileMenuOpen(false)}/>}

    <main onClick={()=>{ if(mobileOpen && window.innerWidth<=760) setMobileOpen(false); }}>
      <header><div><h1>{page}</h1><p>{new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})}</p></div><div className="headerActions"><NotificationsBell items={notifItems} goTo={goTo}/>{page==="Visão Geral" && <button className="add" onClick={()=>setShowOverviewEdit(true)}><Pencil size={17}/> Editar valores</button>}</div></header>

      {page==="Visão Geral" && <Dashboard balance={effectiveBalance} income={effectiveIncome} expense={effectiveExpense} cardBill={effectiveCardBill} manualFields={overview} debtRemaining={debtRemaining} fixedTotal={fixedTotal} reminders={reminders.data} notes={notes.data} setPage={setPage} openNote={(id)=>{ setOpenNoteId(id); setPage("Notas"); }} askAI={askAI} aiInsight={aiInsight} aiLoading={aiLoading} aiError={aiError} aiAvailable={aiAvailable} month={selectedMonth} setMonth={setSelectedMonth} budgets={budgets.data} goals={goals.data} hideValues={hideValues} setHideValues={setHideValues} budgetAvailable={budgetAvailable} shoppingItems={shoppingItems.data} fixedCount={fixed.data.length} debtsCount={debts.data.length}/>}
      {page==="Movimentações" && <Transactions data={transactions.data} onAdd={transactions.add} onDelete={transactions.remove} session={session} bankAvailable={cloudConfigured && !!session} onImported={transactions.refresh}/>}
      {page==="Pagamentos Fixos" && <Fixed entity={fixed} total={fixedTotal}/>}
      {page==="Dívidas" && <Debts entity={debts} remaining={debtRemaining}/>}
      {page==="Cartões" && <Cards entity={cardPurchases} bill={cardBill}/>}
      {page==="Orçamento" && <Budgets entity={budgets} transactions={monthTransactions} month={selectedMonth}/>}
      {page==="Metas" && <Goals entity={goals}/>}
      {page==="Recorrentes" && <Recurring entity={recurring} transactions={transactions}/>}
      {page==="Lista de Compras" && <ShoppingList entity={shoppingItems}/>}
      {page==="Lembretes Comuns" && <CommonReminders entity={reminders}/>}
      {page==="Aniversários" && <Birthdays entity={reminders}/>}
      {page==="Notas" && <Notes entity={notes} openNoteId={openNoteId} onConsumeOpenNote={()=>setOpenNoteId(null)}/>}
      {page==="Livros Lidos" && <BookShelf entity={books} status="lido" session={session} studyGoals={studyGoals}/>}
      {page==="Livros Para Ler" && <BookShelf entity={books} status="quero_ler" session={session} studyGoals={studyGoals}/>}
      {page==="Metas de Estudo" && <StudyGoals entity={studyGoals} studyPdfsList={studyPdfs.data} booksList={books.data} flashcardListsList={studyFlashcardLists.data}/>}
      {page==="Flashcards" && <StudyFlashcards entity={studyFlashcards} listsEntity={studyFlashcardLists} foldersEntity={studyFlashcardFolders} studyGoals={studyGoals}/>}
      {page==="Nivelamento" && <Nivelamento/>}
      {page==="Leitor de PDF" && <StudyPdfShelf entity={studyPdfs} session={session} flashcards={studyFlashcards} groupsEntity={studyPdfGroups} studyGoals={studyGoals}/>}
      {page==="Treino" && <WorkoutShelf foldersEntity={workoutFolders} exercisesEntity={workoutExercises}/>}
      {page==="Filmes e Séries" && <div className="content"><p className="emptyHint">Em breve.</p></div>}
      {page==="Jogos" && <div className="content"><p className="emptyHint">Em breve.</p></div>}

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

function MobileMenuOverlay({navTree,page,goTo,onClose}){
  const [openGroups,setOpenGroups] = useState(()=>{
    const g = {};
    navTree.forEach(item=>{ if(item.type==="group" && item.children.some(c=>c.key===page)) g[item.key]=true; });
    return g;
  });
  const toggle = (key)=>setOpenGroups(g=>({...g,[key]:!g[key]}));
  return <div className="mobileMenuOverlay">
    <div className="mobileMenuHead">
      <div className="brand">
        <div className="brandIcon"><img src="/icons/icon-192.png" alt="Libano"/></div>
        <div><b>Libano</b><small>Finance + vida</small></div>
      </div>
      <button className="mobileMenuClose" onClick={onClose}><X size={20}/></button>
    </div>
    <nav className="mobileMenuNav">
      {navTree.map(item=>{
        if(item.type==="single"){
          const I = item.icon;
          return <button key={item.key} className={page===item.key?"active":""} onClick={()=>goTo(item.key)}>
            <I size={19}/><span>{item.label||item.key}</span>
          </button>;
        }
        const GI = item.icon;
        const isOpen = !!openGroups[item.key];
        const groupActive = item.children.some(c=>c.key===page);
        return <div className="navGroup" key={item.key}>
          <button className={"navGroupHead "+(groupActive?"active":"")} onClick={()=>toggle(item.key)}>
            <GI size={19}/><span>{item.label}</span>
            {isOpen ? <ChevronDown size={15} className="chev"/> : <ChevronRight size={15} className="chev"/>}
          </button>
          {isOpen && <div className="navSub">
            {item.children.map(c=>{const CI=c.icon;return <button key={c.key} className={page===c.key?"active":""} onClick={()=>goTo(c.key)}>
              <CI size={17}/><span>{c.label||c.key}</span>
            </button>})}
          </div>}
        </div>;
      })}
    </nav>
  </div>;
}

function Dashboard({balance,income,expense,cardBill,manualFields,debtRemaining,fixedTotal,reminders,notes,setPage,openNote,askAI,aiInsight,aiLoading,aiError,aiAvailable,month,setMonth,budgets,goals,hideValues,setHideValues,budgetAvailable,shoppingItems,fixedCount,debtsCount}){
 const overdue = reminders.filter(r=>{const d=daysUntil(r.date); return d!==null && d<0;});
 const dueToday = reminders.filter(r=>daysUntil(r.date)===0);
 const dueNext7 = reminders.filter(r=>{const d=daysUntil(r.date); return d!==null && d>0 && d<=7;});
 const monthLabel = new Date(month+"-02").toLocaleDateString("pt-BR",{month:"long"});
 return <div className="content">
   <div className="mobileOverview">
     <div className="mobileBalanceCard">
       <div className="mobileBalanceHead">
         <span>Saldo em contas</span>
         <button className="mobileEyeBtn" onClick={()=>setHideValues(v=>!v)} aria-label="Mostrar ou ocultar valores">
           {hideValues ? <EyeOff size={18}/> : <Eye size={18}/>}
         </button>
       </div>
       <strong className="mobileBalanceValue">{maskMoney(balance,hideValues)}</strong>
       <div className="mobileBalanceSub">
         <span className="in"><ArrowUp size={14}/> {maskMoney(income,hideValues)}</span>
         <small>{monthLabel}</small>
         <span className="out"><ArrowDown size={14}/> {maskMoney(expense,hideValues)}</span>
       </div>
       <div className="mobileMetricsGrid">
         <div className="mobileMetric"><div className="mobileMetricIcon gold"><PiggyBank size={15}/></div><div><small>Limite disp.</small><b>{maskMoney(Math.max(budgetAvailable,0),hideValues)}</b></div></div>
         <div className="mobileMetric right"><div><small>Fatura</small><b>{maskMoney(cardBill,hideValues)}</b></div><div className="mobileMetricIcon orange"><CreditCard size={15}/></div></div>
         <div className="mobileMetric"><div className="mobileMetricIcon red"><CalendarClock size={15}/></div><div><small>A pagar em fim do mês</small><b>{maskMoney(fixedTotal,hideValues)}</b></div></div>
         <div className="mobileMetric right"><div><small>Gasto</small><b className="positive">{maskMoney(expense,hideValues)}</b></div><div className="mobileMetricIcon green"><TrendingDown size={15}/></div></div>
       </div>
     </div>

     <div className="mobileListCard">
       <div className="mobileListRow" onClick={()=>setPage("Lembretes Comuns")}>
         <div className="mobileListIcon orange"><Zap size={16}/></div>
         <b>Atenção</b>
         <span className="mobileListRight">Próximos 7 dias ({dueNext7.length})</span>
         <ChevronRight size={16}/>
       </div>
       <div className="mobileListRow" onClick={()=>setPage("Lembretes Comuns")}>
         <div className="mobileListIcon purple"><Hourglass size={16}/></div>
         <b>Atrasadas</b>
         <span className="mobileListRight">{overdue.length} atrasada{overdue.length===1?"":"s"}</span>
         <ChevronRight size={16}/>
       </div>
       <div className="mobileListRow" onClick={()=>setPage("Lembretes Comuns")}>
         <div className="mobileListIcon blue"><CalendarClock size={16}/></div>
         <b>Hoje</b>
         <span className="mobileListRight">{dueToday.length} hoje</span>
         <ChevronRight size={16}/>
       </div>
     </div>

     <div className="mobileTaskCard" onClick={()=>setPage("Notas")}>
       <div className="mobileListIcon pink"><StickyNote size={17}/></div>
       <div className="mobileTaskInfo"><b>Notas</b><small>suas anotações rápidas</small></div>
       <strong>{notes.length}</strong>
       <ChevronRight size={16}/>
     </div>

     <div className="mobileBoardCard">
       <div className="mobileBoardHead" onClick={()=>setPage("Lista de Compras")}>
         <div className="mobileListIcon white"><Circle size={14}/></div>
         <b>Quadro possível</b>
         <ChevronRight size={16} style={{marginLeft:"auto"}}/>
       </div>
       {shoppingItems.slice(0,2).map((item,i)=>
         <div className="mobileBoardItem" key={item.id}>
           <i className={i%2===0?"purple":"orange"}/>
           <span>{item.name}</span>
           <small>{item.price!=null && item.price!=="" ? maskMoney(Number(item.price)||0,hideValues) : "—"}</small>
         </div>
       )}
       {shoppingItems.length===0 && <p className="emptyHint">Nenhum item na lista de compras ainda.</p>}
     </div>

     <div className="mobileListCard">
       <div className="mobileListRow" onClick={()=>setPage("Pagamentos Fixos")}>
         <div className="mobileListIcon red"><CalendarClock size={16}/></div>
         <b>Vencimentos</b>
         <span className="mobileListRight">próx. mês ({fixedCount+debtsCount})</span>
         <ChevronRight size={16}/>
       </div>
     </div>

     <button className="mobileFab" onClick={()=>setPage("Movimentações")} aria-label="Adicionar movimentação"><Plus size={24}/></button>
   </div>

   <div className="desktopOverview">
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
function Transactions({data,onAdd,onDelete,session,bankAvailable,onImported}){
  const [desc,setDesc]=useState(""); const [cat,setCat]=useState(""); const [value,setValue]=useState(""); const [type,setType]=useState("out");
  const submit=()=>{
    if(!desc.trim()||!value) return;
    onAdd({desc,cat,value:Number(value),type,date:new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})});
    setDesc("");setCat("");setValue("");setType("out");
  };
  return <div className="content">
    {bankAvailable && <BankConnect onImported={onImported}/>}
    <div className="panel">
      <div className="inlineAdd">
        <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Descrição"/>
        <input value={cat} onChange={e=>setCat(e.target.value)} placeholder="Categoria"/>
        <input value={value} onChange={e=>setValue(e.target.value)} type="number" step="0.01" min="0" placeholder="Valor"/>
        <select value={type} onChange={e=>setType(e.target.value)}><option value="out">Saída</option><option value="in">Entrada</option></select>
        <button onClick={submit}><Plus/></button>
      </div>
    </div>
    <div className="panel"><div className="panelTitle"><h2>Extrato</h2><span>{data.length} movimentações</span></div>{data.map(x=><div className="transaction" key={x.id}><div><b>{x.desc}</b><small>{x.cat} · {x.date}{x.source==="pluggy" && " · importado do banco"}</small></div><strong className={x.type==="in"?"positive":"negative"}>{x.type==="in"?"+":"-"} {money(x.value)}</strong><button onClick={()=>onDelete(x.id)}><Trash2 size={16}/></button></div>)}
    {data.length===0 && <p className="emptyHint">Nenhuma movimentação por aqui ainda.</p>}
    </div>
  </div>
}

// Botão "Conectar banco": abre o widget da Pluggy Connect, e ao concluir manda
// o item conectado pro servidor sincronizar (edge function pluggy-sync).
function BankConnect({onImported}){
  const [PluggyConnect,setPluggyConnect] = useState(null);
  const [connectToken,setConnectToken] = useState(null);
  const [opening,setOpening] = useState(false);
  const [syncing,setSyncing] = useState(false);
  const [message,setMessage] = useState(null);

  const openWidget = async ()=>{
    setMessage(null);
    setOpening(true);
    try{
      const [{ PluggyConnect: Widget }, token] = await Promise.all([
        import("react-pluggy-connect"),
        getPluggyConnectToken(),
      ]);
      setPluggyConnect(()=>Widget);
      setConnectToken(token);
    }catch(err){
      setMessage({type:"error", text: err.message || "Não foi possível abrir a conexão com o banco."});
    }finally{
      setOpening(false);
    }
  };

  const onSuccess = async (itemData)=>{
    setConnectToken(null); // fecha o widget
    setSyncing(true);
    setMessage(null);
    try{
      const itemId = itemData?.item?.id;
      const result = await syncPluggyItem(itemId);
      setMessage({type:"success", text: `${result.institutionName}: ${result.imported} movimentações importadas.`});
      onImported && onImported();
    }catch(err){
      setMessage({type:"error", text: err.message || "Banco conectado, mas a importação falhou."});
    }finally{
      setSyncing(false);
    }
  };

  return <div className="panel">
    <div className="inlineAdd" style={{alignItems:"center"}}>
      <button onClick={openWidget} disabled={opening||syncing}>
        <Landmark size={16}/> {syncing ? "Importando..." : opening ? "Abrindo..." : "Conectar banco"}
      </button>
      {message && <small className={message.type==="error"?"negative":"positive"}>{message.text}</small>}
    </div>
    {connectToken && PluggyConnect && (
      <PluggyConnect
        connectToken={connectToken}
        includeSandbox={false}
        onSuccess={onSuccess}
        onError={()=>setMessage({type:"error", text:"Erro ao conectar com o banco."})}
        onClose={()=>setConnectToken(null)}
      />
    )}
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

// Lê um arquivo (ex.: GIF) como data URL sem reprocessar em canvas — usar canvas
// "achataria" um GIF animado numa única imagem estática, então aqui é leitura crua.
function fileToRawDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
    reader.onload = () => resolve(reader.result);
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
      {(book.total_pages !== 1 || favCount>0 || impCount>0) && (
        <small className="bookProgressLabel">
          {book.total_pages !== 1 && <>{progress}%</>}
          {favCount>0 && <> {book.total_pages !== 1 && "· "}<Star size={10}/> {favCount}</>}
          {impCount>0 && <> · <Flag size={10}/> {impCount}</>}
        </small>
      )}
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
  const [fullscreen, toggleFullscreen] = useFullscreen(modalRef);
  const notesBodyRef = useRef(null);
  const notesSaveTimer = useRef(null);
  const searchToken = useRef(0);
  const renderTaskRef = useRef(null);

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
      // Cancela qualquer renderização anterior ainda em andamento nesse mesmo
      // canvas antes de começar a nova — se duas rodarem juntas (ex.: trocando
      // de página rápido), elas disputam a matriz de transformação e a página
      // pode aparecer espelhada/invertida até a próxima renderização "limpa".
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (e) {}
      }
      const task = page.render({ canvasContext: ctx, viewport, transform });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch (e) {
        if (e?.name === "RenderingCancelledException") return;
        throw e;
      }
      if (renderTaskRef.current === task) renderTaskRef.current = null;
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

  // Zoom com o gesto de pinça no touchpad: navegadores reportam esse gesto
  // como um evento "wheel" com ctrlKey=true (mesmo sem a tecla Ctrl estar
  // pressionada de verdade). Precisa ser um listener nativo (não onWheel do
  // React) porque o React registra wheel como passivo por padrão, o que
  // impede o preventDefault e deixaria a página inteira dando zoom junto.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheelZoom = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setFitWidth(false);
      setZoom(z => Math.min(3, Math.max(0.3, +(z - e.deltaY * 0.01).toFixed(2))));
    };
    el.addEventListener("wheel", handleWheelZoom, { passive: false });
    return () => el.removeEventListener("wheel", handleWheelZoom);
  }, []);

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
      {(pdfDoc.total_pages !== 1 || favCount>0 || impCount>0) && (
        <small className="bookProgressLabel">
          {pdfDoc.total_pages !== 1 && <>{progress}%</>}
          {favCount>0 && <> {pdfDoc.total_pages !== 1 && "· "}<Star size={10}/> {favCount}</>}
          {impCount>0 && <> · <Flag size={10}/> {impCount}</>}
        </small>
      )}
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

// Desenha uma anotação (traço à mão livre ou forma) dentro do <svg> de anotações.
// As coordenadas já vêm em "unidades de página" (mesmo sistema do viewBox do svg).
// Envolvido em React.memo: sem isso, toda vez que um traço NOVO ganhava um
// ponto (a cada pequeníssimo movimento do mouse/caneta), TODOS os outros
// traços/formas já existentes na tela recalculavam seu contorno do zero —
// e no quadro infinito, que acumula muito mais conteúdo do que uma página
// de PDF, isso ia deixando o traço cada vez mais travado conforme o quadro
// enchia. Com o memo, um elemento só recalcula quando ele mesmo muda.
const AnnotationShape = React.memo(function AnnotationShape({ ann, preview, onPointerDown }) {
  if (ann.type === "stroke") {
    const isHl = ann.tool === "highlighter";
    const uniform = ann.style === "marker" || isHl;
    const endpoints = ann.points || [];
    return (
      <g
        style={{ mixBlendMode: isHl ? "multiply" : "normal", opacity: preview ? 0.92 : 1, cursor: onPointerDown ? "pointer" : undefined }}
        onPointerDown={onPointerDown}
      >
        {ann.style === "normal" && !isHl && endpoints.length > 0 && (
          <>
            <circle cx={endpoints[0].x} cy={endpoints[0].y} r={(ann.width * (0.55 + (endpoints[0].p ?? 0.5) * 0.9)) / 2} fill={ann.color} opacity={ann.opacity} />
            <circle cx={endpoints[endpoints.length - 1].x} cy={endpoints[endpoints.length - 1].y} r={(ann.width * (0.55 + (endpoints[endpoints.length - 1].p ?? 0.5) * 0.9)) / 2} fill={ann.color} opacity={ann.opacity} />
          </>
        )}
        <path d={strokeOutlinePath(ann.points, ann.width, { uniform })} fill={ann.color} opacity={ann.opacity} />
      </g>
    );
  }
  if (ann.type === "shape") {
    const stroke = ann.color, sw = ann.width, op = ann.opacity;
    if (ann.shape === "line") {
      return <line x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2} stroke={stroke} strokeWidth={sw} strokeLinecap="round" opacity={op} onPointerDown={onPointerDown} />;
    }
    if (ann.shape === "arrow") {
      const angle = Math.atan2(ann.y2 - ann.y1, ann.x2 - ann.x1);
      const headLen = Math.max(8, sw * 3);
      const hx1 = ann.x2 - headLen * Math.cos(angle - Math.PI / 7), hy1 = ann.y2 - headLen * Math.sin(angle - Math.PI / 7);
      const hx2 = ann.x2 - headLen * Math.cos(angle + Math.PI / 7), hy2 = ann.y2 - headLen * Math.sin(angle + Math.PI / 7);
      return (
        <g onPointerDown={onPointerDown} style={{ cursor: onPointerDown ? "pointer" : undefined }}>
          <line x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2} stroke={stroke} strokeWidth={sw} strokeLinecap="round" opacity={op} />
          <polygon points={`${ann.x2},${ann.y2} ${hx1},${hy1} ${hx2},${hy2}`} fill={stroke} opacity={op} />
        </g>
      );
    }
    if (ann.shape === "rect") {
      const x = Math.min(ann.x1, ann.x2), y = Math.min(ann.y1, ann.y2);
      return <rect x={x} y={y} width={Math.abs(ann.x2 - ann.x1)} height={Math.abs(ann.y2 - ann.y1)} stroke={stroke} strokeWidth={sw} fill="none" opacity={op} onPointerDown={onPointerDown} style={{ cursor: onPointerDown ? "pointer" : undefined }} />;
    }
    if (ann.shape === "circle") {
      const cx = ann.cx ?? (ann.x1 + ann.x2) / 2, cy = ann.cy ?? (ann.y1 + ann.y2) / 2;
      const rx = Math.abs(ann.r ?? (ann.x2 - ann.x1) / 2) || 1, ry = Math.abs(ann.r ?? (ann.y2 - ann.y1) / 2) || 1;
      return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} stroke={stroke} strokeWidth={sw} fill="none" opacity={op} onPointerDown={onPointerDown} style={{ cursor: onPointerDown ? "pointer" : undefined }} />;
    }
  }
  return null;
});

function StudyPdfReader({ pdfDoc, onClose, onProgress, onNotesChange, onFavoritesChange, onImportantChange, onFavoriteExcerptsChange, onCreateFlashcard, onDrawingsChange, onTotalPagesChange }) {
  const [pdf, setPdf] = useState(null);
  const [pageNum, setPageNum] = useState(pdfDoc.current_page || 1);
  const [numPages, setNumPages] = useState(pdfDoc.total_pages || 0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [nightMode, setNightMode] = useState(false);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });

  const [favoritePages, setFavoritePages] = useState(pdfDoc.favorite_pages || []);
  const [importantPages, setImportantPages] = useState(pdfDoc.important_pages || []);
  const [favoriteExcerpts, setFavoriteExcerpts] = useState(pdfDoc.favorite_excerpts || []);
  const [selection, setSelection] = useState(null); // {text, top, left}

  const [panel, setPanel] = useState(null); // null | "busca" | "marcadores" | "notas"
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [jumpValue, setJumpValue] = useState("");

  // --- Modo Caneta: desenho à mão livre por cima do PDF, guardado como uma
  // camada separada (nunca altera o PDF original) e sincronizado em drawings.
  const [penMode, setPenMode] = useState(false);
  const [tool, setTool] = useState("pen"); // pen | highlighter | eraser | shape | text | select
  const [penStyle, setPenStyle] = useState("normal"); // normal | pencil | marker
  const [eraserMode, setEraserMode] = useState("partial"); // partial | object
  const [shapeType, setShapeType] = useState("line"); // line | arrow | rect | circle
  const [color, setColor] = useState("#1f2937");
  const [thickness, setThickness] = useState(3);
  const [opacity, setOpacity] = useState(1);
  const [hlColor, setHlColor] = useState("#ffd54a");
  const [hlThickness, setHlThickness] = useState(16);
  const [hlOpacity, setHlOpacity] = useState(0.4);
  const [eraserRadius, setEraserRadius] = useState(12);
  const [autoShape, setAutoShape] = useState(true);
  const [drawings, setDrawings] = useState(pdfDoc.drawings || {});
  const [annotationsVisible, setAnnotationsVisible] = useState(true);
  const [liveAnn, setLiveAnn] = useState(null);
  const [selectedAnnId, setSelectedAnnId] = useState(null);
  const [editingTextId, setEditingTextId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [addingPage, setAddingPage] = useState(false);
  const [pastePulse, setPastePulse] = useState(false);
  const [basePageSize, setBasePageSize] = useState({ width: 0, height: 0 });
  // Cursor customizado: uma bolinha da cor/espessura da ferramenta atual,
  // que segue o ponteiro (mouse/caneta) e some enquanto o traço está sendo feito.
  const [showPenCursor, setShowPenCursor] = useState(false);

  const drawSvgRef = useRef(null);
  const isDrawingRef = useRef(false);
  const historyRef = useRef([]);
  const redoRef = useRef([]);
  const dragRef = useRef(null);
  const eraseGestureRef = useRef(false);
  const drawSaveTimer = useRef(null);
  const penCursorRef = useRef(null);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const modalRef = useRef(null);
  const [fullscreen, toggleFullscreen] = useFullscreen(modalRef);
  const textLayerRef = useRef(null);
  const pageWrapRef = useRef(null);
  const notesBodyRef = useRef(null);
  const notesSaveTimer = useRef(null);
  const searchToken = useRef(0);
  const renderTaskRef = useRef(null);
  const pdfBytesRef = useRef(null); // bytes crus do PDF atual, usados pra anexar página colada

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const blob = await downloadStudyPdfFile(pdfDoc.file_path);
        const buf = await blob.arrayBuffer();
        // Guarda uma cópia antes: pdf.js pode "esvaziar" o ArrayBuffer que
        // recebe (transferable), então o que sobra pra reaproveitar depois
        // (colar uma página nova) precisa ser um buffer separado.
        pdfBytesRef.current = buf.slice(0);
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

  // ---- Colar print (Ctrl+V) ou escolher arquivo direto no leitor: vira uma
  // página nova no final do próprio PDF, e não um arquivo separado montado
  // antes de existir.
  const fileToImage = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const appendPastedImage = async (file) => {
    if (!file || !file.type?.startsWith("image/") || !pdfBytesRef.current) return;
    try {
      setAddingPage(true);
      const img = await fileToImage(file);
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");

      const bg = pdfDoc.bg_color || "white";
      const blob = await appendImagePageToPdfBlob(pdfBytesRef.current, dataUrl, img.width, img.height, bg);
      const newBuf = await blob.arrayBuffer();
      pdfBytesRef.current = newBuf.slice(0);
      const newDoc = await pdfjsLib.getDocument({ data: newBuf }).promise;
      setPdf(newDoc);
      setNumPages(newDoc.numPages);
      setPageNum(newDoc.numPages);
      onTotalPagesChange?.(pdfDoc.id, newDoc.numPages);

      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        const uploadFile = new File([blob], "page.pdf", { type: "application/pdf" });
        await uploadStudyPdfFile(userData.user.id, pdfDoc.id, uploadFile);
      }
    } catch (e) {
      console.error(e);
      alert("Não foi possível adicionar essa página: " + (e.message || e));
    } finally {
      setAddingPage(false);
    }
  };

  useEffect(() => {
    const handlePaste = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type?.startsWith("image/")) {
          e.preventDefault();
          appendPastedImage(item.getAsFile());
          setPastePulse(true);
          setTimeout(() => setPastePulse(false), 260);
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc.id]);

  useEffect(() => {
    if (!pdf) return;
    let active = true;
    (async () => {
      const page = await pdf.getPage(pageNum);
      const containerWidth = containerRef.current?.clientWidth || 800;
      const baseViewport = page.getViewport({ scale: 1 });
      setBasePageSize({ width: baseViewport.width, height: baseViewport.height });
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
      // Cancela qualquer renderização anterior ainda em andamento nesse mesmo
      // canvas antes de começar a nova — se duas rodarem juntas (ex.: trocando
      // de página rápido), elas disputam a matriz de transformação e a página
      // pode aparecer espelhada/invertida até a próxima renderização "limpa".
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (e) {}
      }
      const task = page.render({ canvasContext: ctx, viewport, transform });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch (e) {
        if (e?.name === "RenderingCancelledException") return;
        throw e;
      }
      if (renderTaskRef.current === task) renderTaskRef.current = null;
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

  // Zoom com o gesto de pinça no touchpad: navegadores reportam esse gesto
  // como um evento "wheel" com ctrlKey=true (mesmo sem a tecla Ctrl estar
  // pressionada de verdade). Precisa ser um listener nativo (não onWheel do
  // React) porque o React registra wheel como passivo por padrão, o que
  // impede o preventDefault e deixaria a página inteira dando zoom junto.
  // Aqui também evitamos ativar durante o Modo Caneta, pra não atrapalhar quem
  // estiver desenhando com dois dedos no touchpad.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheelZoom = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setFitWidth(false);
      setZoom(z => Math.min(3, Math.max(0.3, +(z - e.deltaY * 0.01).toFixed(2))));
    };
    el.addEventListener("wheel", handleWheelZoom, { passive: false });
    return () => el.removeEventListener("wheel", handleWheelZoom);
  }, []);

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

  const removeFavoriteExcerpt = (id) => {
    const next = favoriteExcerpts.filter(h => h.id !== id);
    setFavoriteExcerpts(next);
    onFavoriteExcerptsChange(pdfDoc.id, next);
  };

  // ---------------------------------------------------------------------
  // Modo Caneta
  // ---------------------------------------------------------------------

  const scheduleDrawingsSave = (next) => {
    clearTimeout(drawSaveTimer.current);
    drawSaveTimer.current = setTimeout(() => onDrawingsChange(pdfDoc.id, next), 500);
  };
  const flushDrawings = () => {
    clearTimeout(drawSaveTimer.current);
    onDrawingsChange(pdfDoc.id, drawings);
  };

  const pushHistory = () => {
    historyRef.current.push(JSON.stringify(drawings));
    if (historyRef.current.length > 50) historyRef.current.shift();
    redoRef.current = [];
  };
  const undo = () => {
    if (!historyRef.current.length) return;
    redoRef.current.push(JSON.stringify(drawings));
    const prev = JSON.parse(historyRef.current.pop());
    setDrawings(prev);
    scheduleDrawingsSave(prev);
  };
  const redo = () => {
    if (!redoRef.current.length) return;
    historyRef.current.push(JSON.stringify(drawings));
    const next = JSON.parse(redoRef.current.pop());
    setDrawings(next);
    scheduleDrawingsSave(next);
  };
  const commitAnnotation = (ann) => {
    pushHistory();
    setDrawings(prev => {
      const next = { ...prev, [pageNum]: [...(prev[pageNum] || []), ann] };
      scheduleDrawingsSave(next);
      return next;
    });
  };

  const togglePenMode = () => {
    setPenMode(m => {
      if (m) { flushDrawings(); setSelectedAnnId(null); setEditingTextId(null); }
      return !m;
    });
  };

  const handlePenStyleChange = (val) => {
    setPenStyle(val);
    if (val === "normal") { setThickness(3); setOpacity(1); }
    else if (val === "pencil") { setThickness(1.8); setOpacity(0.85); }
    else if (val === "marker") { setThickness(8); setOpacity(0.9); }
  };

  const toPageCoords = (clientX, clientY) => {
    const rect = drawSvgRef.current.getBoundingClientRect();
    const scale = basePageSize.width / (rect.width || 1);
    return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale };
  };

  // Move a bolinha do cursor customizado direto no DOM (sem re-render) para
  // acompanhar o ponteiro com fluidez.
  const movePenCursor = (clientX, clientY) => {
    const el = penCursorRef.current;
    const wrap = pageWrapRef.current;
    if (!el || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    el.style.left = (clientX - rect.left) + "px";
    el.style.top = (clientY - rect.top) + "px";
  };

  // Some com a bolinha sempre que sair do modo caneta ou trocar para uma
  // ferramenta que não desenha traço (borracha, seleção, texto, forma).
  useEffect(() => {
    if (!penMode || (tool !== "pen" && tool !== "highlighter")) setShowPenCursor(false);
  }, [penMode, tool]);

  const addTextAnnotation = (x, y) => {
    const id = crypto.randomUUID();
    const ann = { id, type: "text", x, y, fontSize: 16, color, content: "" };
    commitAnnotation(ann);
    setEditingTextId(id);
  };

  const commitTextEdit = (id, value) => {
    setEditingTextId(null);
    setDrawings(prev => {
      const list = prev[pageNum] || [];
      const next = value.trim()
        ? list.map(a => a.id === id ? { ...a, content: value } : a)
        : list.filter(a => a.id !== id);
      const nextAll = { ...prev, [pageNum]: next };
      scheduleDrawingsSave(nextAll);
      return nextAll;
    });
  };

  const eraseRadiusAt = (x, y) => {
    if (!eraseGestureRef.current) { pushHistory(); eraseGestureRef.current = true; }
    setDrawings(prev => {
      const list = prev[pageNum] || [];
      const next = list.flatMap(ann => eraseAnnotationAtPoint(ann, x, y, eraserRadius));
      const nextAll = { ...prev, [pageNum]: next };
      scheduleDrawingsSave(nextAll);
      return nextAll;
    });
  };

  const eraseObjectAt = (x, y) => {
    const list = drawings[pageNum] || [];
    const hit = findAnnotationAt(list, x, y, 8);
    if (!hit) return;
    pushHistory();
    setDrawings(prev => {
      const next = { ...prev, [pageNum]: (prev[pageNum] || []).filter(a => a.id !== hit.id) };
      scheduleDrawingsSave(next);
      return next;
    });
  };

  const deleteSelected = () => {
    if (!selectedAnnId) return;
    pushHistory();
    setDrawings(prev => {
      const next = { ...prev, [pageNum]: (prev[pageNum] || []).filter(a => a.id !== selectedAnnId) };
      scheduleDrawingsSave(next);
      return next;
    });
    setSelectedAnnId(null);
  };

  const clearPage = () => {
    if (!(drawings[pageNum] || []).length) return;
    if (!confirm(`Apagar todas as anotações da página ${pageNum}?`)) return;
    pushHistory();
    setDrawings(prev => {
      const next = { ...prev, [pageNum]: [] };
      scheduleDrawingsSave(next);
      return next;
    });
    setSelectedAnnId(null);
  };

  const handleSelectPointerDown = (x, y) => {
    const list = drawings[pageNum] || [];
    if (selectedAnnId) {
      const sel = list.find(a => a.id === selectedAnnId);
      if (sel && sel.type === "shape" && Math.hypot(x - sel.x2, y - sel.y2) < 14) {
        pushHistory();
        dragRef.current = { mode: "resize", id: sel.id };
        return;
      }
    }
    const hit = findAnnotationAt(list, x, y, 8);
    if (hit) {
      setSelectedAnnId(hit.id);
      pushHistory();
      dragRef.current = { mode: "move", id: hit.id, lastX: x, lastY: y };
    } else {
      setSelectedAnnId(null);
    }
  };

  const handleSelectPointerMove = (x, y) => {
    const drag = dragRef.current;
    if (!drag) return;
    setDrawings(prev => {
      const list = prev[pageNum] || [];
      const next = list.map(a => {
        if (a.id !== drag.id) return a;
        if (drag.mode === "resize") return resizeShapeAnnotation(a, x, y);
        const dx = x - drag.lastX, dy = y - drag.lastY;
        return translateAnnotation(a, dx, dy);
      });
      const nextAll = { ...prev, [pageNum]: next };
      scheduleDrawingsSave(nextAll);
      return nextAll;
    });
    if (drag.mode === "move") { drag.lastX = x; drag.lastY = y; }
  };

  const handleDrawPointerDown = (e) => {
    if (!penMode || !basePageSize.width) return;
    e.preventDefault();
    // A bolinha de cursor some assim que o traço começa (o próprio traço já
    // aparece embaixo do dedo/caneta, então o indicador só atrapalharia).
    if (tool === "pen" || tool === "highlighter") setShowPenCursor(false);
    try { drawSvgRef.current?.setPointerCapture?.(e.pointerId); } catch (err) {}
    const { x, y } = toPageCoords(e.clientX, e.clientY);
    if (tool === "pen" || tool === "highlighter") {
      isDrawingRef.current = true;
      setLiveAnn({
        id: crypto.randomUUID(), type: "stroke", tool,
        color: tool === "highlighter" ? hlColor : color,
        width: tool === "highlighter" ? hlThickness : thickness,
        opacity: tool === "highlighter" ? hlOpacity : opacity,
        style: tool === "pen" ? penStyle : "marker",
        points: [{ x, y, p: tool === "highlighter" ? 0.5 : (e.pressure || 0.5) }],
      });
    } else if (tool === "shape") {
      isDrawingRef.current = true;
      setLiveAnn({ id: crypto.randomUUID(), type: "shape", shape: shapeType, color, width: thickness, opacity, x1: x, y1: y, x2: x, y2: y });
    } else if (tool === "eraser") {
      isDrawingRef.current = true;
      if (eraserMode === "object") eraseObjectAt(x, y);
      else eraseRadiusAt(x, y);
    } else if (tool === "text") {
      addTextAnnotation(x, y);
    } else if (tool === "select") {
      handleSelectPointerDown(x, y);
    }
  };

  const handleDrawPointerMove = (e) => {
    if (!penMode || !basePageSize.width) return;
    // Atualiza a bolinha de cursor (só para mouse/caneta com hover — no toque
    // com o dedo não existe "passar por cima", então ela nunca aparece).
    if ((tool === "pen" || tool === "highlighter") && (e.pointerType === "mouse" || e.pointerType === "pen")) {
      if (!isDrawingRef.current) {
        movePenCursor(e.clientX, e.clientY);
        setShowPenCursor(true);
      }
    } else if (showPenCursor) {
      setShowPenCursor(false);
    }
    if (tool === "select") {
      if (!dragRef.current) return;
      const { x, y } = toPageCoords(e.clientX, e.clientY);
      handleSelectPointerMove(x, y);
      return;
    }
    if (!isDrawingRef.current) return;
    const { x, y } = toPageCoords(e.clientX, e.clientY);
    if (tool === "pen" || tool === "highlighter") {
      setLiveAnn(prev => prev ? { ...prev, points: [...prev.points, { x, y, p: tool === "highlighter" ? 0.5 : (e.pressure || 0.5) }] } : prev);
    } else if (tool === "shape") {
      setLiveAnn(prev => prev ? { ...prev, x2: x, y2: y } : prev);
    } else if (tool === "eraser" && eraserMode === "partial") {
      eraseRadiusAt(x, y);
    }
  };

  const handleDrawPointerUp = () => {
    if (tool === "select") { dragRef.current = null; return; }
    if (tool === "eraser") { eraseGestureRef.current = false; isDrawingRef.current = false; return; }
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (!liveAnn) return;
    if ((tool === "pen" || tool === "highlighter") && liveAnn.points.length > 1) {
      let finalAnn = liveAnn;
      if (tool === "pen" && autoShape && finalAnn.points.length > 6) {
        const detected = detectShapeFromPoints(finalAnn.points);
        if (detected) {
          finalAnn = {
            id: finalAnn.id, type: "shape", shape: detected.type,
            color: finalAnn.color, width: finalAnn.width, opacity: finalAnn.opacity,
            x1: detected.x1, y1: detected.y1, x2: detected.x2, y2: detected.y2,
            ...(detected.cx != null ? { cx: detected.cx, cy: detected.cy, r: detected.r } : {}),
          };
        }
      }
      commitAnnotation(finalAnn);
    } else if (tool === "shape" && Math.hypot(liveAnn.x2 - liveAnn.x1, liveAnn.y2 - liveAnn.y1) > 2) {
      commitAnnotation(liveAnn);
    }
    setLiveAnn(null);
  };

  // Baixa o PDF exatamente como está (sem anotações "queimadas") — o que já
  // foi colado/adicionado como página entra, claro, porque já faz parte do
  // arquivo salvo.
  const downloadCurrentPdf = () => {
    if (!pdfBytesRef.current) return;
    const blob = new Blob([pdfBytesRef.current], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(pdfDoc.title || "documento").trim() || "documento"}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const addPageFileInputRef = useRef(null);
  const handleAddPageFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(f => f.type?.startsWith("image/"));
    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      await appendPastedImage(file);
    }
  };

  const handleExportAnnotated = async () => {
    if (!pdf) return;
    try {
      setExporting(true);
      await exportAnnotatedPdf(pdf, drawings, pdfDoc.title);
    } catch (e) {
      console.error(e);
      alert("Não foi possível exportar o PDF com anotações.");
    } finally {
      setExporting(false);
    }
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
    flushDrawings();
    searchToken.current++;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(()=>{});
    onClose();
  };

  useEffect(() => {
    const handler = (e) => {
      if (panel==="notas") return; // não interfere na digitação das notas
      if (["INPUT","TEXTAREA"].includes(e.target.tagName)) return;
      if (!penMode && e.key === "ArrowRight") goTo(pageNum + 1);
      if (!penMode && e.key === "ArrowLeft") goTo(pageNum - 1);
      if (e.key === "Escape") { if (penMode) togglePenMode(); else handleClose(); }
      if (penMode && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNum, numPages, panel, penMode, drawings]);

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
            <button className="ghost" onClick={downloadCurrentPdf}>
              <Download size={15}/> <span>Baixar PDF</span>
            </button>
            <button onClick={handleClose}><X size={18}/></button>
          </div>
        </div>

        <div className="pdfToolbar">
          <div className="pdfToolbarGroup">
            <button title={penMode?"Sair do modo caneta":"Modo caneta — escrever no PDF"} className={penMode?"active":""} onClick={togglePenMode}>
              <PenTool size={16}/> <span>Escrever</span>
            </button>
          </div>
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
          <div className="pdfToolbarGroup">
            <button title="Adicionar página a partir de uma imagem" onClick={()=>addPageFileInputRef.current?.click()}>
              <ImagePlus size={16}/> <span>Adicionar página</span>
            </button>
            <input ref={addPageFileInputRef} type="file" accept="image/*" multiple hidden
              onChange={(e)=>{ handleAddPageFiles(e.target.files); e.target.value=""; }}/>
          </div>
          <p className={"pdfPasteHint"+(pastePulse?" flash":"")}>
            {addingPage ? "Adicionando página..." : <>Cole um print com <b>Ctrl+V</b> para virar uma nova página</>}
          </p>
        </div>

        <div className="readerMain">
        {penMode && (
          <div className="penOptionsBar">
            <div className="penToolGroup penToolGroupMain">
              <button title="Caneta" className={tool==="pen"?"active":""} onClick={()=>{setTool("pen"); setSelectedAnnId(null);}}><PenTool size={16}/></button>
              <button title="Marca-texto" className={tool==="highlighter"?"active":""} onClick={()=>{setTool("highlighter"); setSelectedAnnId(null);}}><Highlighter size={16}/></button>
              <button title="Borracha" className={tool==="eraser"?"active":""} onClick={()=>{setTool("eraser"); setSelectedAnnId(null);}}><Eraser size={16}/></button>
              <button title="Formas" className={tool==="shape"?"active":""} onClick={()=>{setTool("shape"); setSelectedAnnId(null);}}><Square size={16}/></button>
              <button title="Texto" className={tool==="text"?"active":""} onClick={()=>{setTool("text"); setSelectedAnnId(null);}}><Type size={16}/></button>
              <button title="Selecionar" className={tool==="select"?"active":""} onClick={()=>setTool("select")}><MousePointer2 size={16}/></button>
              <span className="penToolDivider"/>
              <button title="Desfazer" onClick={undo}><Undo2 size={16}/></button>
              <button title="Refazer" onClick={redo}><Redo2 size={16}/></button>
              <span className="penToolDivider"/>
              <button title={annotationsVisible?"Ocultar anotações":"Mostrar anotações"} className={annotationsVisible?"":"active"} onClick={()=>setAnnotationsVisible(v=>!v)}>{annotationsVisible?<Eye size={16}/>:<EyeOff size={16}/>}</button>
              <button title="Limpar página" onClick={clearPage}><Trash2 size={16}/></button>
              <button title="Exportar PDF com as anotações" disabled={exporting} onClick={handleExportAnnotated}><Download size={16}/> <span>{exporting?"Exportando...":"Exportar"}</span></button>
            </div>

            <div className="penOptionsRow">
              {tool==="pen" && (<>
                <select value={penStyle} onChange={e=>handlePenStyleChange(e.target.value)}>
                  <option value="normal">Caneta normal</option>
                  <option value="pencil">Lápis</option>
                  <option value="marker">Marcador/brush</option>
                </select>
                <div className="penSwatches">
                  {["#1f2937","#e11d48","#2563eb","#16a34a"].map(c=>(
                    <button key={c} className={`penSwatch${color===c?" active":""}`} style={{background:c}} onClick={()=>setColor(c)} title={c}/>
                  ))}
                  <input type="color" value={color} onChange={e=>setColor(e.target.value)} title="Cor personalizada"/>
                </div>
                <label className="penSliderLabel">Espessura<input type="range" min="1" max="14" step="0.5" value={thickness} onChange={e=>setThickness(+e.target.value)}/></label>
                <label className="penSliderLabel">Opacidade<input type="range" min="0.2" max="1" step="0.05" value={opacity} onChange={e=>setOpacity(+e.target.value)}/></label>
                <label className="penCheckLabel"><input type="checkbox" checked={autoShape} onChange={e=>setAutoShape(e.target.checked)}/> Corrigir forma automaticamente</label>
              </>)}
              {tool==="highlighter" && (<>
                <div className="penSwatches">
                  {["#ffd54a","#ff6b6b","#4ade80","#5b9dff"].map(c=>(
                    <button key={c} className={`penSwatch${hlColor===c?" active":""}`} style={{background:c}} onClick={()=>setHlColor(c)} title={c}/>
                  ))}
                  <input type="color" value={hlColor} onChange={e=>setHlColor(e.target.value)} title="Cor personalizada"/>
                </div>
                <label className="penSliderLabel">Espessura<input type="range" min="6" max="34" step="1" value={hlThickness} onChange={e=>setHlThickness(+e.target.value)}/></label>
                <label className="penSliderLabel">Opacidade<input type="range" min="0.15" max="0.7" step="0.05" value={hlOpacity} onChange={e=>setHlOpacity(+e.target.value)}/></label>
              </>)}
              {tool==="eraser" && (<>
                <div className="penToolGroup">
                  <button className={eraserMode==="partial"?"active":""} onClick={()=>setEraserMode("partial")}>Parcial</button>
                  <button className={eraserMode==="object"?"active":""} onClick={()=>setEraserMode("object")}>Apagar objeto</button>
                </div>
                {eraserMode==="partial" && <label className="penSliderLabel">Tamanho<input type="range" min="4" max="30" step="1" value={eraserRadius} onChange={e=>setEraserRadius(+e.target.value)}/></label>}
              </>)}
              {tool==="shape" && (<>
                <div className="penToolGroup">
                  <button title="Linha reta" className={shapeType==="line"?"active":""} onClick={()=>setShapeType("line")}><Minus size={16}/></button>
                  <button title="Seta" className={shapeType==="arrow"?"active":""} onClick={()=>setShapeType("arrow")}><ArrowUpRight size={16}/></button>
                  <button title="Retângulo" className={shapeType==="rect"?"active":""} onClick={()=>setShapeType("rect")}><Square size={16}/></button>
                  <button title="Círculo" className={shapeType==="circle"?"active":""} onClick={()=>setShapeType("circle")}><Circle size={16}/></button>
                </div>
                <div className="penSwatches">
                  {["#1f2937","#e11d48","#2563eb","#16a34a"].map(c=>(
                    <button key={c} className={`penSwatch${color===c?" active":""}`} style={{background:c}} onClick={()=>setColor(c)} title={c}/>
                  ))}
                  <input type="color" value={color} onChange={e=>setColor(e.target.value)} title="Cor personalizada"/>
                </div>
                <label className="penSliderLabel">Espessura<input type="range" min="1" max="10" step="0.5" value={thickness} onChange={e=>setThickness(+e.target.value)}/></label>
              </>)}
              {tool==="text" && (<>
                <div className="penSwatches">
                  {["#1f2937","#e11d48","#2563eb","#16a34a"].map(c=>(
                    <button key={c} className={`penSwatch${color===c?" active":""}`} style={{background:c}} onClick={()=>setColor(c)} title={c}/>
                  ))}
                  <input type="color" value={color} onChange={e=>setColor(e.target.value)} title="Cor personalizada"/>
                </div>
                <p className="penHint">Toque na página para adicionar um texto.</p>
              </>)}
              {tool==="select" && (<>
                <p className="penHint">{selectedAnnId ? "Arraste para mover. Puxe o cantinho pra redimensionar." : "Toque em uma anotação para selecioná-la."}</p>
                {selectedAnnId && <button className="penDeleteBtn" onClick={deleteSelected}><Trash2 size={14}/> Excluir</button>}
              </>)}
            </div>
          </div>
        )}
          <div className={`readerBody${nightMode?" readerBodyNight":""}`} ref={containerRef}>
            {loading && <p className="readerHint">Abrindo PDF...</p>}
            {err && <p className="readerHint">{err}</p>}
            {!loading && !err && (
              <div ref={pageWrapRef} className={`pdfPageWrap${penMode?" pdfPageWrapPenMode":""}`} style={{width:pageSize.width||undefined, height:pageSize.height||undefined}} onContextMenu={(e)=>{ if (penMode) e.preventDefault(); }}>
                <canvas ref={canvasRef} className={`readerCanvas${nightMode?" readerCanvasNight":""}`} onClick={()=>{ if(!penMode) goTo(pageNum+1); }}/>
                <div ref={textLayerRef} className="textLayer" onMouseUp={handleTextMouseUp}/>
                {basePageSize.width>0 && (
                  <svg
                    ref={drawSvgRef}
                    className="pdfDrawLayer"
                    viewBox={`0 0 ${basePageSize.width} ${basePageSize.height}`}
                    style={{
                      position:"absolute", inset:0, width:"100%", height:"100%",
                      pointerEvents: penMode?"auto":"none",
                      touchAction: penMode?"none":undefined,
                      cursor: penMode ? (tool==="eraser"?"cell":tool==="select"?"default":tool==="text"?"text":(tool==="pen"||tool==="highlighter")?"none":"crosshair") : undefined,
                    }}
                    onPointerDown={handleDrawPointerDown}
                    onPointerMove={handleDrawPointerMove}
                    onPointerUp={handleDrawPointerUp}
                    onContextMenu={(e)=>{ if (penMode) e.preventDefault(); }}
                    onPointerEnter={(e)=>{
                      if (penMode && (tool==="pen"||tool==="highlighter") && (e.pointerType==="mouse"||e.pointerType==="pen")) {
                        movePenCursor(e.clientX, e.clientY);
                        setShowPenCursor(true);
                      }
                    }}
                    onPointerLeave={(e)=>{ setShowPenCursor(false); handleDrawPointerUp(e); }}
                  >
                    {annotationsVisible && (drawings[pageNum]||[]).filter(a=>a.type!=="text").map(ann => (
                      <AnnotationShape key={ann.id} ann={ann}/>
                    ))}
                    {liveAnn && liveAnn.type!=="text" && <AnnotationShape ann={liveAnn} preview/>}
                  </svg>
                )}
                {penMode && (tool==="pen"||tool==="highlighter") && (
                  <div
                    ref={penCursorRef}
                    className="penCursorDot"
                    style={{
                      display: showPenCursor ? "block" : "none",
                      width: Math.min(60, Math.max(6, (tool==="highlighter"?hlThickness:thickness) * zoom)) + "px",
                      height: Math.min(60, Math.max(6, (tool==="highlighter"?hlThickness:thickness) * zoom)) + "px",
                      background: tool==="highlighter" ? hlColor : color,
                      opacity: tool==="highlighter" ? Math.max(0.5, hlOpacity) : 1,
                    }}
                  />
                )}
                {annotationsVisible && basePageSize.width>0 && (drawings[pageNum]||[]).filter(a=>a.type==="text").map(a => (
                  <div
                    key={a.id}
                    className={`pdfTextAnn${editingTextId===a.id?" editing":""}`}
                    style={{
                      left: (a.x/basePageSize.width*100)+"%",
                      top: (a.y/basePageSize.height*100)+"%",
                      fontSize: (a.fontSize/basePageSize.height*100)+"vh",
                      color: a.color,
                      pointerEvents: penMode && tool==="select" ? "auto" : "none",
                    }}
                    onPointerDown={(e)=>{ if(penMode && tool==="select"){ e.stopPropagation(); setSelectedAnnId(a.id); pushHistory(); const {x,y}=toPageCoords(e.clientX,e.clientY); dragRef.current={mode:"move", id:a.id, lastX:x, lastY:y}; } }}
                    onDoubleClick={()=>{ if(penMode) setEditingTextId(a.id); }}
                  >
                    {editingTextId===a.id
                      ? <textarea autoFocus defaultValue={a.content} onBlur={(e)=>commitTextEdit(a.id, e.target.value)} onPointerDown={e=>e.stopPropagation()}/>
                      : (a.content || (penMode ? "Toque duas vezes para escrever" : ""))}
                  </div>
                ))}
                {penMode && tool==="select" && selectedAnnId && basePageSize.width>0 && (() => {
                  const ann = (drawings[pageNum]||[]).find(a=>a.id===selectedAnnId);
                  if (!ann) return null;
                  const bbox = annotationBBox(ann);
                  const pad = Math.max(basePageSize.width, basePageSize.height) * 0.012;
                  const left = (bbox.x-pad)/basePageSize.width*100;
                  const top = (bbox.y-pad)/basePageSize.height*100;
                  const w = (bbox.w+pad*2)/basePageSize.width*100;
                  const h = (bbox.h+pad*2)/basePageSize.height*100;
                  return (
                    <div className="pdfSelectionBox" style={{left:left+"%", top:top+"%", width:w+"%", height:h+"%"}}>
                      {ann.type==="shape" && (
                        <div
                          className="pdfSelectionHandle"
                          onPointerDown={(e)=>{ e.stopPropagation(); pushHistory(); dragRef.current={mode:"resize", id:ann.id}; }}
                          onPointerUp={()=>{ dragRef.current=null; }}
                        />
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
            {selection && (
              <div className="pdfSelectionToolbar" style={{top:selection.top, left:selection.left}} onMouseDown={e=>e.preventDefault()}>
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

// ---------- Diálogo "Criar PDF" (título + fundo) ----------

function NewPdfDialog({ onClose, onCreate, creating }) {
  const [title, setTitle] = useState("Novo PDF");
  const [bg, setBg] = useState("white");
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const submit = (e) => {
    e?.preventDefault();
    if (creating) return;
    onCreate(title, bg);
  };

  return (
    <div className="readerBack" onClick={onClose}>
      <form className="readerModal newPdfDialog" onClick={(e)=>e.stopPropagation()} onSubmit={submit}>
        <div className="readerHead">
          <b>Criar PDF</b>
          <button type="button" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="newPdfDialogBody">
          <label className="newPdfDialogLabel">
            Título
            <input ref={inputRef} type="text" value={title} onChange={e=>setTitle(e.target.value)}/>
          </label>
          <div className="newPdfDialogLabel">
            Fundo das páginas
            <div className="newPdfDialogBgRow">
              <button type="button" className={"ghost"+(bg==="white"?" active":"")} onClick={()=>setBg("white")}><Sun size={15}/> <span>Fundo branco</span></button>
              <button type="button" className={"ghost"+(bg==="black"?" active":"")} onClick={()=>setBg("black")}><Moon size={15}/> <span>Fundo preto</span></button>
            </div>
          </div>
          <button type="submit" className="newPdfDialogSubmit" disabled={creating}>{creating?"Criando...":"Criar PDF"}</button>
        </div>
      </form>
    </div>
  );
}

// ---------- Estante de PDFs de estudo ----------

function StudyPdfShelf({ entity, session, flashcards, groupsEntity, studyGoals }) {

  const { data, add, remove, update, cloud, reorder } = entity;
  const groups = groupsEntity.data;
  const [currentGroupId, setCurrentGroupId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [readingPdf, setReadingPdf] = useState(null);
  const [whiteboardLibraryOpen, setWhiteboardLibraryOpen] = useState(false);
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
      await add({ id, title, file_path: filePath, total_pages: totalPages, current_page: 1, favorite_pages: [], important_pages: [], favorite_excerpts: [], notes: "", drawings: {}, group_id: currentGroupId });
    } catch (err) {
      console.error(err);
      alert("Não foi possível enviar o PDF: " + (err.message || err));
    } finally {
      setUploading(false);
    }
  };

  // "Criar PDF" abre um diálogo pra escolher título e fundo, cria o
  // documento em branco e já abre no leitor — os prints viram páginas de
  // dentro dele (ver paste/botão no StudyPdfReader), não antes.
  const [newPdfDialogOpen, setNewPdfDialogOpen] = useState(false);
  const handleCreatePdf = async (title, bg) => {
    if (!cloud) { alert('Criar PDFs precisa de sincronização ativa (Supabase) — veja o README.'); return; }
    try {
      setUploading(true);
      const id = crypto.randomUUID();
      const finalTitle = (title || "").trim() || "Novo PDF";
      const blob = await createBlankPdfBlob(bg);
      const file = new File([blob], `${finalTitle}.pdf`, { type: "application/pdf" });
      const filePath = await uploadStudyPdfFile(session.user.id, id, file);
      const newDoc = { id, title: finalTitle, file_path: filePath, total_pages: 1, current_page: 1, favorite_pages: [], important_pages: [], favorite_excerpts: [], notes: "", drawings: {}, group_id: currentGroupId, bg_color: bg };
      const inserted = await add(newDoc);
      if (!inserted) {
        // Se o registro não foi salvo no Supabase, não abrimos um PDF
        // fantasma no leitor. O erro original já foi mostrado por useEntity.
        await deleteStudyPdfFile(filePath).catch(() => {});
        return;
      }
      setNewPdfDialogOpen(false);
      setReadingPdf(inserted);
    } catch (err) {
      console.error(err);
      alert("Não foi possível criar o PDF: " + (err.message || err));
    } finally {
      setUploading(false);
    }
  };

  const onTotalPagesChange = (id, total_pages) => update(id, { total_pages });

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
  const onFavoriteExcerptsChange = (id, favorite_excerpts) => update(id, { favorite_excerpts });
  const onDrawingsChange = (id, drawings) => update(id, { drawings });
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
        <div className="bookTile addTile" onClick={()=>setNewPdfDialogOpen(true)}>
          <div className="bookCoverWrap addCover">{uploading ? <span>Criando...</span> : <><FilePlus2 size={26}/><span>Criar PDF</span></>}</div>
        </div>
        <div className="bookTile addTile" onClick={()=>setWhiteboardLibraryOpen(true)}>
          <div className="bookCoverWrap addCover"><LayoutGrid size={26}/><span>Quadro infinito</span></div>
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
        onFavoriteExcerptsChange={onFavoriteExcerptsChange}
        onCreateFlashcard={onCreateFlashcard}
        onDrawingsChange={onDrawingsChange}
        onTotalPagesChange={onTotalPagesChange}
      />}
      {whiteboardLibraryOpen && <WhiteboardLibrary onClose={()=>setWhiteboardLibraryOpen(false)}/>}
      {newPdfDialogOpen && <NewPdfDialog onClose={()=>setNewPdfDialogOpen(false)} onCreate={handleCreatePdf} creating={uploading}/>}
    </div>
  );
}

// ---------- Quadro infinito (whiteboard) ----------

function hitTestElement(el, x, y, tol = 6) {
  if (el.type === "image") {
    return x >= el.x - tol && x <= el.x + el.width + tol && y >= el.y - tol && y <= el.y + el.height + tol;
  }
  return hitTestAnnotation(el, x, y, tol);
}
function findElementAt(list, x, y, tol = 6) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (hitTestElement(list[i], x, y, tol)) return list[i];
  }
  return null;
}
function elementBBox(el) {
  if (el.type === "image") return { x: el.x, y: el.y, w: el.width, h: el.height };
  return annotationBBox(el);
}
function translateElement(el, dx, dy) {
  if (el.type === "image") return { ...el, x: el.x + dx, y: el.y + dy };
  return translateAnnotation(el, dx, dy);
}
function resizeElementCorner(el, x, y) {
  if (el.type === "image") {
    const w = Math.max(24, x - el.x);
    const ratio = el.height / el.width;
    return { ...el, width: w, height: w * ratio };
  }
  return resizeShapeAnnotation(el, x, y);
}
function eraseElementAtPoint(el, x, y, radius) {
  // Prints (imagens) nunca são apagados pela borracha — só à mão, selecionando
  // e excluindo. Assim escrever/rabiscar por cima de um print e apagar o
  // rabisco não some com a imagem junto.
  if (el.type === "image") return [el];
  return eraseAnnotationAtPoint(el, x, y, radius);
}

const WhiteboardElementShape = React.memo(function WhiteboardElementShape({ el, onPointerDown }) {
  if (el.type === "image") {
    return <image href={el.dataUrl} x={el.x} y={el.y} width={el.width} height={el.height} onPointerDown={onPointerDown} style={{ cursor: onPointerDown ? "pointer" : undefined }} preserveAspectRatio="none"/>;
  }
  return <AnnotationShape ann={el} onPointerDown={onPointerDown}/>;
});

function WhiteboardThumbnail({ board }) {
  const elements = board?.elements || [];
  const bg = board?.bg === "white" ? "#f4f4f5" : "#0b0b0c";
  if (!elements.length) {
    return <div className="whiteboardThumbEmpty" style={{ background: bg }}><LayoutGrid size={30}/></div>;
  }
  const boxes = elements.map(elementBBox);
  const minX = Math.min(...boxes.map(b => b.x));
  const minY = Math.min(...boxes.map(b => b.y));
  const maxX = Math.max(...boxes.map(b => b.x + b.w));
  const maxY = Math.max(...boxes.map(b => b.y + b.h));
  const w = Math.max(120, maxX - minX);
  const h = Math.max(90, maxY - minY);
  const pad = Math.max(12, Math.max(w, h) * 0.08);
  return (
    <div className="whiteboardThumb" style={{ background: bg }}>
      <svg viewBox={`${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`} preserveAspectRatio="xMidYMid meet">
        {elements.filter(el => el.type !== "text").map(el => <WhiteboardElementShape key={el.id} el={el}/>)}
        {elements.filter(el => el.type === "text").map(el => (
          <text key={el.id} x={el.x} y={el.y + el.fontSize} fill={el.color} fontSize={el.fontSize} fontWeight="600">{(el.content || "").slice(0, 60)}</text>
        ))}
      </svg>
    </div>
  );
}

function WhiteboardLibrary({ onClose }) {
  const [boards, setBoards] = useState(() => {
    const saved = loadLocal("whiteboards_v2", null);
    if (Array.isArray(saved)) return saved;
    const legacy = loadLocal("whiteboard_v1", null);
    return legacy?.elements?.length
      ? [{ id: crypto.randomUUID(), name: "Quadro 1", elements: legacy.elements, bg: "black", updatedAt: Date.now() }]
      : [];
  });
  const [editingId, setEditingId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);

  useEffect(() => {
    saveLocal("whiteboards_v2", boards);
  }, [boards]);

  const createBoard = () => {
    const number = boards.length + 1;
    const name = window.prompt("Nome do quadro:", `Quadro ${number}`);
    if (!name?.trim()) return;
    const board = { id: crypto.randomUUID(), name: name.trim(), elements: [], bg: "black", updatedAt: Date.now() };
    setBoards(prev => [...prev, board]);
    setEditingId(board.id);
  };

  const renameBoard = (board) => {
    setOpenMenuId(null);
    const name = window.prompt("Nome do quadro:", board.name);
    if (!name?.trim()) return;
    setBoards(prev => prev.map(b => b.id === board.id ? { ...b, name: name.trim(), updatedAt: Date.now() } : b));
  };

  const deleteBoard = (board) => {
    setOpenMenuId(null);
    if (!confirm(`Excluir o quadro "${board.name}"? Esta ação não pode ser desfeita.`)) return;
    setBoards(prev => prev.filter(b => b.id !== board.id));
  };

  const saveBoard = (id, patch) => {
    setBoards(prev => prev.map(b => b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b));
  };

  if (editingId) {
    const board = boards.find(b => b.id === editingId);
    if (board) return <WhiteboardErrorBoundary board={board} onClose={() => setEditingId(null)} onSave={patch => saveBoard(board.id, patch)}/>;
  }

  return (
    <div className="readerBack" onClick={onClose}>
      <div className="readerModal readerModalWide whiteboardLibraryModal" onClick={e => e.stopPropagation()}>
        <div className="readerHead">
          <div><b>Quadros infinitos</b><span className="whiteboardLibraryCount">{boards.length} {boards.length === 1 ? "quadro" : "quadros"}</span></div>
          <button onClick={onClose}><X size={18}/></button>
        </div>
        <div className="whiteboardLibraryBody">
          <div className="shelf whiteboardShelf">
            <div className="bookTile addTile" onClick={createBoard}>
              <div className="bookCoverWrap addCover whiteboardNewTile"><Plus size={28}/><span>Novo quadro</span></div>
            </div>
            {boards.map(board => (
              <div className="bookTile whiteboardBookTile" key={board.id} onClick={() => setEditingId(board.id)}>
                <div className="bookCoverWrap whiteboardCover">
                  <WhiteboardThumbnail board={board}/>
                  <button className="whiteboardTileMenu" title="Opções" onClick={e => { e.stopPropagation(); setOpenMenuId(id => id === board.id ? null : board.id); }}><MoreVertical size={17}/></button>
                  {openMenuId === board.id && (
                    <div className="whiteboardTileMenuPop" onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setOpenMenuId(null); setEditingId(board.id); }}>Abrir</button>
                      <button onClick={() => renameBoard(board)}>Renomear</button>
                      <button className="danger" onClick={() => deleteBoard(board)}>Excluir</button>
                    </div>
                  )}
                </div>
                <div className="whiteboardBookTitle">{board.name}</div>
                <div className="whiteboardBookMeta">{board.elements?.length || 0} {board.elements?.length === 1 ? "item" : "itens"}</div>
              </div>
            ))}
          </div>
          {!boards.length && <div className="whiteboardLibraryEmpty"><LayoutGrid size={34}/><b>Nenhum quadro criado</b><span>Crie quantos quadros quiser para separar matérias, projetos ou anotações.</span></div>}
        </div>
      </div>
    </div>
  );
}

// Isola qualquer erro inesperado dentro do quadro infinito. Sem isso, um erro
// não tratado em qualquer lugar do React derruba a árvore inteira do app,
// deixando a tela preta/em branco até recarregar a aba. Com isso, o erro fica
// contido aqui dentro e a pessoa consegue fechar (ou recentralizar) sem sair
// do app nem perder o resto do quadro.
class WhiteboardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Erro no quadro infinito:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="readerBack" onClick={this.props.onClose}>
          <div className="readerModal" onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 32, textAlign: "center" }}>
            <b>O quadro travou num erro inesperado</b>
            <p className="penHint" style={{ maxWidth: 360 }}>Seus desenhos foram salvos automaticamente até a última alteração. Feche e abra o quadro de novo pra continuar.</p>
            <button className="ghost" onClick={() => { this.setState({ error: null }); this.props.onClose(); }}><X size={15}/> <span>Fechar quadro</span></button>
          </div>
        </div>
      );
    }
    return <Whiteboard {...this.props}/>;
  }
}

function Whiteboard({ board, onClose, onSave }) {
  const [elements, setElements] = useState(board?.elements || []);
  const [bg, setBg] = useState(board?.bg || "black"); // "white" | "black"
  const saveTimer = useRef(null);
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onSave?.({ elements, bg }), 450);
    return () => clearTimeout(saveTimer.current);
  }, [elements, bg, onSave]);
  const [tool, setTool] = useState("pen"); // pen|highlighter|eraser|shape|text|select|pan
  const [shapeType, setShapeType] = useState("line");
  const [penStyle, setPenStyle] = useState("normal");
  const [eraserMode, setEraserMode] = useState("partial");
  const [eraserRadius, setEraserRadius] = useState(14);
  const [autoShape, setAutoShape] = useState(true);
  const [color, setColor] = useState("#f5f5f5");
  const [thickness, setThickness] = useState(3);
  const [opacity, setOpacity] = useState(1);
  const [hlColor, setHlColor] = useState("#ffd54a");
  const [hlThickness, setHlThickness] = useState(16);
  const [hlOpacity, setHlOpacity] = useState(0.4);

  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [selectedId, setSelectedId] = useState(null);
  const [editingTextId, setEditingTextId] = useState(null);
  const [liveEl, setLiveEl] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [flash, setFlash] = useState(false);
  const [showPenCursor, setShowPenCursor] = useState(false);

  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const modalRef = useRef(null);
  const [fullscreen, toggleFullscreen] = useFullscreen(modalRef);
  const isDrawingRef = useRef(false);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const eraseGestureRef = useRef(false);
  const spaceDownRef = useRef(false);
  const historyRef = useRef([]);
  const redoRef = useRef([]);
  const firstFit = useRef(false);
  const penCursorRef = useRef(null);

  // Move a bolinha do cursor customizado direto no DOM (sem re-render) pra
  // acompanhar a caneta com fluidez — igual no leitor de PDF.
  const movePenCursor = (clientX, clientY) => {
    const el = penCursorRef.current;
    const wrap = containerRef.current;
    if (!el || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    el.style.left = (clientX - rect.left) + "px";
    el.style.top = (clientY - rect.top) + "px";
  };

  // Some com a bolinha sempre que trocar pra uma ferramenta que não desenha traço.
  useEffect(() => {
    if (tool !== "pen" && tool !== "highlighter") setShowPenCursor(false);
  }, [tool]);

  // Calcula a visão ideal pra caber tudo que já existe no quadro (ou centraliza a origem, se estiver vazio).
  const fitToContent = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (!elements.length) {
      setView({ x: rect.width / 2, y: rect.height / 2, zoom: 1 });
      return;
    }
    const xs1 = elements.map(el => elementBBox(el).x);
    const ys1 = elements.map(el => elementBBox(el).y);
    const xs2 = elements.map(el => { const b = elementBBox(el); return b.x + b.w; });
    const ys2 = elements.map(el => { const b = elementBBox(el); return b.y + b.h; });
    const minX = Math.min(...xs1), minY = Math.min(...ys1), maxX = Math.max(...xs2), maxY = Math.max(...ys2);
    const w = Math.max(40, maxX - minX), h = Math.max(40, maxY - minY);
    const zoom = Math.min(2, Math.max(0.15, Math.min((rect.width - 60) / w, (rect.height - 60) / h)));
    setView({ x: rect.width / 2 - (minX + w / 2) * zoom, y: rect.height / 2 - (minY + h / 2) * zoom, zoom });
  };

  // Ajusta a visão pra caber tudo que já existe, na primeira abertura.
  useEffect(() => {
    if (firstFit.current || !elements.length || !containerRef.current) return;
    firstFit.current = true;
    fitToContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  // Se a aba perder o foco (trocar de app, notificação, etc.) enquanto o espaço
  // está pressionado, o "keyup" pode nunca chegar até nós — o que travaria o
  // quadro permanentemente em modo de arrastar. Isso solta tudo nesses casos.
  useEffect(() => {
    const releasePan = () => { spaceDownRef.current = false; panRef.current = null; };
    window.addEventListener("blur", releasePan);
    document.addEventListener("visibilitychange", releasePan);
    return () => {
      window.removeEventListener("blur", releasePan);
      document.removeEventListener("visibilitychange", releasePan);
    };
  }, []);

  const pushHistory = () => {
    historyRef.current.push(JSON.stringify(elements));
    if (historyRef.current.length > 60) historyRef.current.shift();
    redoRef.current = [];
  };
  const undo = () => {
    if (!historyRef.current.length) return;
    redoRef.current.push(JSON.stringify(elements));
    setElements(JSON.parse(historyRef.current.pop()));
  };
  const redo = () => {
    if (!redoRef.current.length) return;
    historyRef.current.push(JSON.stringify(elements));
    setElements(JSON.parse(redoRef.current.pop()));
  };
  const commitElement = (el) => {
    pushHistory();
    setElements(prev => [...prev, el]);
  };
  const clearAll = () => {
    if (!elements.length) return;
    if (!confirm("Apagar tudo no quadro?")) return;
    pushHistory();
    setElements([]);
    setSelectedId(null);
  };

  const toWorld = (clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    return { x: (clientX - rect.left - view.x) / view.zoom, y: (clientY - rect.top - view.y) / view.zoom };
  };

  const handlePenStyleChange = (val) => {
    setPenStyle(val);
    if (val === "normal") { setThickness(3); setOpacity(1); }
    else if (val === "pencil") { setThickness(1.8); setOpacity(0.85); }
    else if (val === "marker") { setThickness(8); setOpacity(0.9); }
  };

  const addTextElement = (x, y) => {
    const id = crypto.randomUUID();
    commitElement({ id, type: "text", x, y, fontSize: 18, color, content: "" });
    setEditingTextId(id);
  };
  const commitTextEdit = (id, value) => {
    setEditingTextId(null);
    setElements(prev => value.trim() ? prev.map(a => a.id === id ? { ...a, content: value } : a) : prev.filter(a => a.id !== id));
  };

  const eraseRadiusAt = (x, y) => {
    if (!eraseGestureRef.current) { pushHistory(); eraseGestureRef.current = true; }
    setElements(prev => prev.flatMap(el => eraseElementAtPoint(el, x, y, eraserRadius)));
  };
  const eraseObjectAt = (x, y) => {
    // Ignora prints (imagens) — a borracha (em qualquer modo) nunca apaga
    // imagens, só traços, formas e textos. Pra apagar um print é preciso
    // selecioná-lo e excluir manualmente.
    const hit = findElementAt(elements.filter(el => el.type !== "image"), x, y, 8);
    if (!hit) return;
    pushHistory();
    setElements(prev => prev.filter(a => a.id !== hit.id));
  };
  const deleteSelected = () => {
    if (!selectedId) return;
    pushHistory();
    setElements(prev => prev.filter(a => a.id !== selectedId));
    setSelectedId(null);
  };

  const handleSelectPointerDown = (x, y, pointerId) => {
    if (selectedId) {
      const sel = elements.find(a => a.id === selectedId);
      if (sel && (sel.type === "shape" || sel.type === "image")) {
        const cx = sel.type === "image" ? sel.x + sel.width : sel.x2;
        const cy = sel.type === "image" ? sel.y + sel.height : sel.y2;
        if (Math.hypot(x - cx, y - cy) < 14 / view.zoom) {
          pushHistory();
          dragRef.current = { mode: "resize", id: sel.id, pointerId };
          return;
        }
      }
    }
    const hit = findElementAt(elements, x, y, 8);
    if (hit) {
      setSelectedId(hit.id);
      pushHistory();
      dragRef.current = { mode: "move", id: hit.id, lastX: x, lastY: y, pointerId };
    } else {
      setSelectedId(null);
    }
  };
  const handleSelectPointerMove = (x, y) => {
    const drag = dragRef.current;
    if (!drag) return;
    setElements(prev => prev.map(a => {
      if (a.id !== drag.id) return a;
      if (drag.mode === "resize") return resizeElementCorner(a, x, y);
      const dx = x - drag.lastX, dy = y - drag.lastY;
      return translateElement(a, dx, dy);
    }));
    if (drag.mode === "move") { drag.lastX = x; drag.lastY = y; }
  };

  const addImageAt = (dataUrl, naturalW, naturalH, worldX, worldY) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const maxW = rect ? (rect.width * 0.6) / view.zoom : 480;
    const width = Math.min(naturalW, maxW);
    const height = width * (naturalH / naturalW);
    commitElement({ id: crypto.randomUUID(), type: "image", dataUrl, x: worldX - width / 2, y: worldY - height / 2, width, height });
    setFlash(true);
    setTimeout(() => setFlash(false), 260);
  };

  const addImageFromFile = (file) => {
    if (!file || !file.type?.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width; canvas.height = img.height;
        canvas.getContext("2d").drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        const rect = containerRef.current?.getBoundingClientRect();
        const centerWorld = rect ? { x: (rect.width / 2 - view.x) / view.zoom, y: (rect.height / 2 - view.y) / view.zoom } : { x: 0, y: 0 };
        addImageAt(dataUrl, img.width, img.height, centerWorld.x, centerWorld.y);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type?.startsWith("image/")) {
          e.preventDefault();
          addImageFromFile(item.getAsFile());
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.code === "Space") { spaceDownRef.current = true; e.preventDefault(); }
      if (e.key === "Escape") { if (editingTextId) setEditingTextId(null); else onClose(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && tool === "select") deleteSelected();
    };
    const onKeyUp = (e) => { if (e.code === "Space") spaceDownRef.current = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, tool, editingTextId, elements]);

  const zoomAt = (factor, clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    setView(v => {
      const newZoom = Math.min(4, Math.max(0.1, v.zoom * factor));
      const ratio = newZoom / v.zoom;
      return { zoom: newZoom, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio };
    });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Pinça no touchpad (e Ctrl/Cmd+roda) chegam como eventos "wheel" com
      // deltaY de intensidade bem variável — um gesto rápido pode disparar
      // várias dezenas de eventos em poucos milissegundos. Antes o fator de
      // zoom era fixo (±8%) por evento, então esses eventos se multiplicavam
      // entre si e geravam saltos enormes. Agora o fator acompanha a
      // intensidade real do gesto (suave em pinças lentas, mais rápido em
      // pinças fortes) e é limitado por evento pra nenhum pico isolado do
      // touchpad estourar o zoom de uma vez.
      let factor = Math.exp(-e.deltaY * 0.008);
      factor = Math.min(1.12, Math.max(0.89, factor));
      zoomAt(factor, e.clientX, e.clientY);
    } else {
      setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
  };

  // onWheel do React é passivo por padrão (não dá pra bloquear o zoom nativo
  // do navegador com preventDefault ali). Por isso o listener é registrado
  // manualmente como non-passive direto no elemento.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPanning = () => tool === "pan" || spaceDownRef.current;

  const handlePointerDown = (e) => {
    console.log("[quadro] pointerdown", { pointerType: e.pointerType, pointerId: e.pointerId, button: e.button, tool, isPrimary: e.isPrimary });
    if (e.button === 1 || isPanning()) {
      e.preventDefault();
      panRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y };
      try { svgRef.current?.setPointerCapture?.(e.pointerId); } catch (err) { console.log("[quadro] setPointerCapture falhou", err); }
      return;
    }
    e.preventDefault();
    try { svgRef.current?.setPointerCapture?.(e.pointerId); } catch (err) { console.log("[quadro] setPointerCapture falhou", err); }
    const { x, y } = toWorld(e.clientX, e.clientY);
    // Só a caneta/stylus (pointerType "pen") desenha de verdade. Trackpad
    // (que o navegador reporta como "mouse", sem diferenciar de um mouse de
    // verdade) e toque numa tela sensível ao toque nunca desenham, apagam ou
    // criam formas/texto — só selecionam e movem objetos (ou navegam pelo
    // quadro, se tocar/clicar em área vazia).
    if (e.pointerType === "touch" || e.pointerType === "mouse") {
      const hit = findElementAt(elements, x, y, 8);
      if (hit || selectedId) {
        handleSelectPointerDown(x, y, e.pointerId);
      } else {
        panRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y };
      }
      return;
    }
    if (tool === "pen" || tool === "highlighter") {
      isDrawingRef.current = e.pointerId;
      setLiveEl({
        id: crypto.randomUUID(), type: "stroke", tool,
        color: tool === "highlighter" ? hlColor : color,
        width: tool === "highlighter" ? hlThickness : thickness,
        opacity: tool === "highlighter" ? hlOpacity : opacity,
        style: tool === "pen" ? penStyle : "marker",
        points: [{ x, y, p: tool === "highlighter" ? 0.5 : (e.pressure || 0.5) }],
      });
    } else if (tool === "shape") {
      isDrawingRef.current = e.pointerId;
      setLiveEl({ id: crypto.randomUUID(), type: "shape", shape: shapeType, color, width: thickness, opacity, x1: x, y1: y, x2: x, y2: y });
    } else if (tool === "eraser") {
      isDrawingRef.current = e.pointerId;
      if (eraserMode === "object") eraseObjectAt(x, y); else eraseRadiusAt(x, y);
    } else if (tool === "text") {
      addTextElement(x, y);
    } else if (tool === "select") {
      handleSelectPointerDown(x, y, e.pointerId);
    }
  };

  const handlePointerMove = (e) => {
    if (dragRef.current || panRef.current) {
      console.log("[quadro] pointermove", { pointerId: e.pointerId, pointerType: e.pointerType, hasPan: !!panRef.current, hasDrag: !!dragRef.current, clientX: e.clientX, clientY: e.clientY });
    }
    // Acompanha a bolinha de cursor colorida (só aparece pra caneta de
    // verdade — mouse/trackpad nesse quadro não desenha, então não precisa
    // dela; e enquanto está desenhando, o próprio traço já mostra onde está).
    if ((tool === "pen" || tool === "highlighter") && e.pointerType === "pen") {
      if (!isDrawingRef.current) {
        movePenCursor(e.clientX, e.clientY);
        setShowPenCursor(true);
      }
    } else if (showPenCursor) {
      setShowPenCursor(false);
    }
    if (panRef.current) {
      // Importante: tirar esses valores do ref e guardar em variáveis locais
      // ANTES do setView. O React só executa a função de atualização depois
      // (às vezes já depois de um pointerup seguinte ter zerado panRef.current
      // para null) — ler panRef.current *dentro* do callback do setView podia
      // então tentar ler propriedades de null e quebrar o quadro inteiro.
      const { startX, startY, viewX, viewY } = panRef.current;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      setView(v => ({ ...v, x: viewX + dx, y: viewY + dy }));
      return;
    }
    // Verifica pelo gesto que de fato começou (não pela ferramenta atual),
    // porque um toque com o dedo pode ter forçado um "mover objeto" mesmo
    // com a caneta/pincel selecionada.
    if (dragRef.current) {
      const { x, y } = toWorld(e.clientX, e.clientY);
      handleSelectPointerMove(x, y);
      return;
    }
    if (!isDrawingRef.current) return;
    const { x, y } = toWorld(e.clientX, e.clientY);
    if (tool === "pen" || tool === "highlighter") {
      setLiveEl(prev => prev ? { ...prev, points: [...prev.points, { x, y, p: tool === "highlighter" ? 0.5 : (e.pressure || 0.5) }] } : prev);
    } else if (tool === "shape") {
      setLiveEl(prev => prev ? { ...prev, x2: x, y2: y } : prev);
    } else if (tool === "eraser" && eraserMode === "partial") {
      eraseRadiusAt(x, y);
    }
  };

  const handlePointerUp = (e) => {
    console.log("[quadro] pointerup/cancel", { type: e?.type, pointerId: e?.pointerId, hasPan: !!panRef.current, hasDrag: !!dragRef.current, isDrawing: !!isDrawingRef.current });
    if (panRef.current) {
      panRef.current = null;
      return;
    }
    if (dragRef.current) {
      dragRef.current = null;
      return;
    }
    if (tool === "eraser") { eraseGestureRef.current = false; isDrawingRef.current = false; return; }
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (!liveEl) return;
    if ((tool === "pen" || tool === "highlighter") && liveEl.points.length > 1) {
      let finalEl = liveEl;
      if (tool === "pen" && autoShape && finalEl.points.length > 6) {
        const detected = detectShapeFromPoints(finalEl.points);
        if (detected) {
          finalEl = {
            id: finalEl.id, type: "shape", shape: detected.type,
            color: finalEl.color, width: finalEl.width, opacity: finalEl.opacity,
            x1: detected.x1, y1: detected.y1, x2: detected.x2, y2: detected.y2,
            ...(detected.cx != null ? { cx: detected.cx, cy: detected.cy, r: detected.r } : {}),
          };
        }
      }
      commitElement(finalEl);
    } else if (tool === "shape" && Math.hypot(liveEl.x2 - liveEl.x1, liveEl.y2 - liveEl.y1) > 2 / view.zoom) {
      commitElement(liveEl);
    }
    setLiveEl(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type?.startsWith("image/"));
    if (!files.length) return;
    const { x, y } = toWorld(e.clientX, e.clientY);
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => addImageAt(reader.result, img.width, img.height, x, y);
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    });
  };

  const handleDownload = async () => {
    if (!elements.length) { alert("O quadro está vazio."); return; }
    try {
      setDownloading(true);
      const boxes = elements.map(elementBBox);
      const minX = Math.min(...boxes.map(b => b.x));
      const minY = Math.min(...boxes.map(b => b.y));
      const maxX = Math.max(...boxes.map(b => b.x + b.w));
      const maxY = Math.max(...boxes.map(b => b.y + b.h));
      const margin = 32;
      const scale = 2;
      const w = (maxX - minX) + margin * 2, h = (maxY - minY) + margin * 2;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(w * scale);
      canvas.height = Math.ceil(h * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = bg === "black" ? "#0b0b0c" : "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.translate(-minX + margin, -minY + margin);
      for (const el of elements) {
        if (el.type === "image") {
          const img = new Image();
          img.src = el.dataUrl;
          await new Promise(res => { img.onload = res; img.onerror = res; });
          ctx.drawImage(img, el.x, el.y, el.width, el.height);
        } else {
          drawAnnotationOnCanvas(ctx, el);
        }
      }
      const doc = new jsPDF({ unit: "pt", format: [w, h], orientation: w > h ? "landscape" : "portrait" });
      doc.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);
      doc.save(`quadro_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error(e);
      alert("Não foi possível baixar o quadro: " + (e.message || e));
    } finally {
      setDownloading(false);
    }
  };

  const zoomPct = Math.round(view.zoom * 100);

  return (
    <div className="readerBack" onClick={onClose}>
      <div ref={modalRef} className={`readerModal readerModalWide${fullscreen ? " readerModalFull" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="readerHead">
          <b>Quadro infinito</b>
          <div className="readerHeadActions">
            <button title="Fundo branco" className={"ghost" + (bg === "white" ? " active" : "")} onClick={() => setBg("white")}><Sun size={15}/> <span>Fundo branco</span></button>
            <button title="Fundo preto" className={"ghost" + (bg === "black" ? " active" : "")} onClick={() => setBg("black")}><Moon size={15}/> <span>Fundo preto</span></button>
            <button className="ghost" disabled={downloading || !elements.length} onClick={handleDownload}><Download size={15}/> <span>{downloading ? "Gerando..." : "Baixar PDF"}</span></button>
            <button title={fullscreen ? "Sair da tela cheia" : "Tela cheia"} onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button>
            <button onClick={onClose}><X size={18}/></button>
          </div>
        </div>

        <div className="readerMain">
          <div className="penOptionsBar">
            <div className="penToolGroup penToolGroupMain">
              <button title="Caneta" className={tool === "pen" ? "active" : ""} onClick={() => { setTool("pen"); setSelectedId(null); }}><PenTool size={16}/><span>Caneta</span></button>
              <button title="Marca-texto" className={tool === "highlighter" ? "active" : ""} onClick={() => { setTool("highlighter"); setSelectedId(null); }}><Highlighter size={16}/><span>Marca-texto</span></button>
              <button title="Borracha" className={tool === "eraser" ? "active" : ""} onClick={() => { setTool("eraser"); setSelectedId(null); }}><Eraser size={16}/><span>Borracha</span></button>
              <button title="Formas" className={tool === "shape" ? "active" : ""} onClick={() => { setTool("shape"); setSelectedId(null); }}><Square size={16}/><span>Formas</span></button>
              <button title="Texto" className={tool === "text" ? "active" : ""} onClick={() => { setTool("text"); setSelectedId(null); }}><Type size={16}/><span>Texto</span></button>
              <button title="Selecionar" className={tool === "select" ? "active" : ""} onClick={() => setTool("select")}><MousePointer2 size={16}/><span>Selecionar</span></button>
              <button title="Mover o quadro" className={tool === "pan" ? "active" : ""} onClick={() => { setTool("pan"); setSelectedId(null); }}><Hand size={16}/><span>Mover</span></button>
              <button title="Recentralizar visão" onClick={fitToContent}><Crosshair size={16}/><span>Recentralizar</span></button>
              <span className="penToolDivider"/>
              <button title="Desfazer" onClick={undo}><Undo2 size={16}/><span>Desfazer</span></button>
              <button title="Refazer" onClick={redo}><Redo2 size={16}/><span>Refazer</span></button>
              <button title="Limpar tudo" onClick={clearAll}><Trash2 size={16}/><span>Limpar tudo</span></button>
            </div>

            <div className="penOptionsRow">
              {tool === "pen" && (<>
                <select value={penStyle} onChange={e => handlePenStyleChange(e.target.value)}>
                  <option value="normal">Caneta normal</option>
                  <option value="pencil">Lápis</option>
                  <option value="marker">Marcador/brush</option>
                </select>
                <div className="penSwatches">
                  {["#f5f5f5", "#e11d48", "#5b9dff", "#4ade80"].map(c => (
                    <button key={c} className={`penSwatch${color === c ? " active" : ""}`} style={{ background: c }} onClick={() => setColor(c)} title={c}/>
                  ))}
                  <input type="color" value={color} onChange={e => setColor(e.target.value)} title="Cor personalizada"/>
                </div>
                <label className="penSliderLabel">Espessura<input type="range" min="1" max="14" step="0.5" value={thickness} onChange={e => setThickness(+e.target.value)}/></label>
                <label className="penSliderLabel">Opacidade<input type="range" min="0.2" max="1" step="0.05" value={opacity} onChange={e => setOpacity(+e.target.value)}/></label>
                <label className="penCheckLabel"><input type="checkbox" checked={autoShape} onChange={e => setAutoShape(e.target.checked)}/> Corrigir forma automaticamente</label>
              </>)}
              {tool === "highlighter" && (<>
                <div className="penSwatches">
                  {["#ffd54a", "#ff6b6b", "#4ade80", "#5b9dff"].map(c => (
                    <button key={c} className={`penSwatch${hlColor === c ? " active" : ""}`} style={{ background: c }} onClick={() => setHlColor(c)} title={c}/>
                  ))}
                  <input type="color" value={hlColor} onChange={e => setHlColor(e.target.value)} title="Cor personalizada"/>
                </div>
                <label className="penSliderLabel">Espessura<input type="range" min="6" max="34" step="1" value={hlThickness} onChange={e => setHlThickness(+e.target.value)}/></label>
                <label className="penSliderLabel">Opacidade<input type="range" min="0.15" max="0.7" step="0.05" value={hlOpacity} onChange={e => setHlOpacity(+e.target.value)}/></label>
              </>)}
              {tool === "eraser" && (<>
                <select value={eraserMode} onChange={e => setEraserMode(e.target.value)}>
                  <option value="partial">Apagar parte do traço</option>
                  <option value="object">Apagar objeto inteiro</option>
                </select>
                {eraserMode === "partial" && <label className="penSliderLabel">Raio<input type="range" min="4" max="40" step="1" value={eraserRadius} onChange={e => setEraserRadius(+e.target.value)}/></label>}
              </>)}
              {tool === "shape" && (<>
                <div className="penToolGroup">
                  <button title="Linha" className={shapeType === "line" ? "active" : ""} onClick={() => setShapeType("line")}><Minus size={16}/></button>
                  <button title="Seta" className={shapeType === "arrow" ? "active" : ""} onClick={() => setShapeType("arrow")}><ArrowUpRight size={16}/></button>
                  <button title="Retângulo" className={shapeType === "rect" ? "active" : ""} onClick={() => setShapeType("rect")}><Square size={16}/></button>
                  <button title="Círculo" className={shapeType === "circle" ? "active" : ""} onClick={() => setShapeType("circle")}><Circle size={16}/></button>
                </div>
                <div className="penSwatches">
                  {["#f5f5f5", "#e11d48", "#5b9dff", "#4ade80"].map(c => (
                    <button key={c} className={`penSwatch${color === c ? " active" : ""}`} style={{ background: c }} onClick={() => setColor(c)} title={c}/>
                  ))}
                  <input type="color" value={color} onChange={e => setColor(e.target.value)} title="Cor personalizada"/>
                </div>
                <label className="penSliderLabel">Espessura<input type="range" min="1" max="14" step="0.5" value={thickness} onChange={e => setThickness(+e.target.value)}/></label>
              </>)}
              {tool === "text" && (<>
                <div className="penSwatches">
                  {["#f5f5f5", "#e11d48", "#5b9dff", "#4ade80"].map(c => (
                    <button key={c} className={`penSwatch${color === c ? " active" : ""}`} style={{ background: c }} onClick={() => setColor(c)} title={c}/>
                  ))}
                  <input type="color" value={color} onChange={e => setColor(e.target.value)} title="Cor personalizada"/>
                </div>
                <p className="penHint">Toque no quadro para adicionar um texto.</p>
              </>)}
              {tool === "select" && (<>
                <p className="penHint">{selectedId ? "Arraste para mover. Puxe o cantinho pra redimensionar." : "Toque em algo pra selecionar."}</p>
                {selectedId && <button className="penDeleteBtn" onClick={deleteSelected}><Trash2 size={14}/> Excluir</button>}
              </>)}
              {tool === "pan" && <p className="penHint">Arraste para navegar pelo quadro infinito.</p>}
            </div>
          </div>

          <div className={"readerBody whiteboardBody" + (bg === "black" ? " whiteboardBlack" : " whiteboardWhite")} ref={containerRef} onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
            <p className="whiteboardPasteHint">Cole um print com <b>Ctrl+V</b> a qualquer momento</p>
            <svg
              ref={svgRef}
              className={"whiteboardSvg" + (flash ? " flash" : "")}
              style={{
                cursor: showPenCursor ? "none" : isPanning() ? "grab" : tool === "eraser" ? "cell" : tool === "select" ? "default" : tool === "text" ? "text" : (tool === "pen" || tool === "highlighter") ? "crosshair" : "crosshair",
                touchAction: "none",
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={() => setShowPenCursor(false)}
              onContextMenu={e => e.preventDefault()}
            >
              <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
                {elements.filter(el => el.type !== "text").map(el => (
                  <WhiteboardElementShape key={el.id} el={el}/>
                ))}
                {liveEl && liveEl.type !== "text" && <AnnotationShape ann={liveEl} preview/>}
                {elements.filter(el => el.type === "text").map(el => (
                  <foreignObject key={el.id} x={el.x} y={el.y} width={Math.max(160, (el.content?.length || 10) * el.fontSize * 0.6)} height={el.fontSize * 4}>
                    {editingTextId === el.id ? (
                      <textarea
                        autoFocus
                        defaultValue={el.content}
                        className="whiteboardTextInput"
                        style={{ color: el.color, fontSize: el.fontSize }}
                        onBlur={e => commitTextEdit(el.id, e.target.value)}
                        onPointerDown={e => e.stopPropagation()}
                      />
                    ) : (
                      <div
                        className="whiteboardTextLabel"
                        style={{ color: el.color, fontSize: el.fontSize, pointerEvents: tool === "select" ? "auto" : "none" }}
                        onPointerDown={e => { if (tool === "select") { e.stopPropagation(); try { svgRef.current?.setPointerCapture?.(e.pointerId); } catch (err) { console.log("[quadro] setPointerCapture falhou", err); } setSelectedId(el.id); pushHistory(); const { x, y } = toWorld(e.clientX, e.clientY); dragRef.current = { mode: "move", id: el.id, lastX: x, lastY: y, pointerId: e.pointerId }; } }}
                        onDoubleClick={() => setEditingTextId(el.id)}
                      >
                        {el.content || (tool === "select" ? "Duplo toque para escrever" : "")}
                      </div>
                    )}
                  </foreignObject>
                ))}
                {tool === "select" && selectedId && (() => {
                  const el = elements.find(a => a.id === selectedId);
                  if (!el) return null;
                  const b = elementBBox(el);
                  const pad = 6 / view.zoom;
                  return (
                    <g>
                      <rect x={b.x - pad} y={b.y - pad} width={b.w + pad * 2} height={b.h + pad * 2} fill="none" stroke="var(--accent)" strokeDasharray={4 / view.zoom} strokeWidth={1.5 / view.zoom}/>
                      {(el.type === "shape" || el.type === "image") && (
                        <circle
                          cx={el.type === "image" ? el.x + el.width : el.x2}
                          cy={el.type === "image" ? el.y + el.height : el.y2}
                          r={6 / view.zoom}
                          fill="var(--accent)"
                          style={{ cursor: "nwse-resize" }}
                          onPointerDown={e => { e.stopPropagation(); try { svgRef.current?.setPointerCapture?.(e.pointerId); } catch (err) { console.log("[quadro] setPointerCapture falhou", err); } pushHistory(); dragRef.current = { mode: "resize", id: el.id, pointerId: e.pointerId }; }}
                        />
                      )}
                    </g>
                  );
                })()}
              </g>
            </svg>
            {(tool === "pen" || tool === "highlighter") && (
              <div
                ref={penCursorRef}
                className="penCursorDot"
                style={{
                  display: showPenCursor ? "block" : "none",
                  width: Math.min(60, Math.max(6, (tool === "highlighter" ? hlThickness : thickness) * view.zoom)) + "px",
                  height: Math.min(60, Math.max(6, (tool === "highlighter" ? hlThickness : thickness) * view.zoom)) + "px",
                  background: tool === "highlighter" ? hlColor : color,
                  opacity: tool === "highlighter" ? Math.max(0.5, hlOpacity) : 1,
                }}
              />
            )}
          </div>
        </div>

        <div className="readerNav whiteboardNav">
          <span>{elements.length} {elements.length === 1 ? "item" : "itens"} no quadro</span>
          <div className="pdfToolbarGroup">
            <button title="Diminuir zoom" onClick={() => zoomAt(0.85, containerRef.current.getBoundingClientRect().width / 2 + containerRef.current.getBoundingClientRect().left, containerRef.current.getBoundingClientRect().height / 2 + containerRef.current.getBoundingClientRect().top)}><ZoomOut size={16}/></button>
            <button title="Redefinir zoom" onClick={() => setView(v => ({ ...v, zoom: 1 }))}>{zoomPct}%</button>
            <button title="Aumentar zoom" onClick={() => zoomAt(1.18, containerRef.current.getBoundingClientRect().width / 2 + containerRef.current.getBoundingClientRect().left, containerRef.current.getBoundingClientRect().height / 2 + containerRef.current.getBoundingClientRect().top)}><ZoomIn size={16}/></button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Lista de compras (Finanças) ----------

function ShoppingList({ entity }) {
  const { data, add, remove, update } = entity;
  const [formOpen, setFormOpen] = useState(null); // null | "new" | item sendo editado
  const [openMenuId, setOpenMenuId] = useState(null);

  const confirmDelete = (item) => {
    setOpenMenuId(null);
    if (confirm(`Excluir "${item.name}" da lista de compras?`)) remove(item.id);
  };

  return (
    <div className="content" onClick={() => setOpenMenuId(null)}>
      <div className="flashHead">
        <div className="flashHeadInfo">
          <div className="flashHeadIcon"><ShoppingCart size={22}/></div>
          <div>
            <small>FINANÇAS</small>
            <h2>Lista de compras</h2>
            <p>Guarde os itens que você quer comprar, com foto, preço e o link da loja.</p>
          </div>
        </div>
        <div className="flashHeadActions">
          <button className="add" onClick={(e) => { e.stopPropagation(); setFormOpen("new"); }}><Plus size={16}/> Adicionar item</button>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flashEmpty">
          <div className="flashEmptyIcon"><ShoppingCart size={30}/></div>
          <h3>Nenhum item ainda</h3>
          <p>Adicione o que você quer comprar: uma foto, o nome, o preço e um link pra loja de sua preferência.</p>
          <button className="add" onClick={() => setFormOpen("new")}><Plus size={16}/> Adicionar meu primeiro item</button>
        </div>
      ) : (
        <div className="shelf">
          {data.map(item => (
            <ShoppingItemTile
              key={item.id}
              item={item}
              menuOpen={openMenuId === item.id}
              onToggleMenu={(e) => { e.stopPropagation(); setOpenMenuId(id => id === item.id ? null : item.id); }}
              onEdit={() => { setOpenMenuId(null); setFormOpen(item); }}
              onDelete={() => confirmDelete(item)}
            />
          ))}
        </div>
      )}

      {formOpen && (
        <ShoppingItemModal
          item={formOpen === "new" ? null : formOpen}
          onClose={() => setFormOpen(null)}
          onSave={(payload) => {
            if (formOpen === "new") add({ id: crypto.randomUUID(), ...payload });
            else update(formOpen.id, payload);
            setFormOpen(null);
          }}
        />
      )}
    </div>
  );
}

function ShoppingItemTile({ item, menuOpen, onToggleMenu, onEdit, onDelete }) {
  return (
    <div className="bookTile" onClick={(e) => e.stopPropagation()}>
      <div className="bookCoverWrap shoppingCover" onClick={onEdit}>
        {item.photo
          ? <div className="bookCoverImg"><img src={item.photo} alt={item.name}/></div>
          : <ShoppingCart size={30}/>}
      </div>
      <button className="bookMenuBtn" onClick={onToggleMenu}><MoreVertical size={16}/></button>
      {menuOpen && <div className="bookMenu" onClick={(e) => e.stopPropagation()}>
        <button onClick={onEdit}><Pencil size={13}/> Editar</button>
        <button className="danger" onClick={onDelete}><Trash2 size={13}/> Excluir</button>
      </div>}
      <b className="bookTitle">{item.name}</b>
      {item.price != null && item.price !== "" && <small className="bookProgressLabel shoppingPrice">{money(Number(item.price) || 0)}</small>}
      {item.link && (
        <a className="ghost shoppingLinkBtn" href={item.link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
          <ExternalLink size={13}/> Ir para a loja
        </a>
      )}
    </div>
  );
}

function ShoppingItemModal({ item, onClose, onSave }) {
  const [name, setName] = useState(item?.name || "");
  const [price, setPrice] = useState(item?.price ?? "");
  const [link, setLink] = useState(item?.link || "");
  const [photo, setPhoto] = useState(item?.photo || "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 480, 480, 0.85);
      setPhoto(dataUrl);
    } catch (e) {
      console.error(e);
      alert("Não foi possível usar essa imagem. Tente outra foto.");
    }
    setUploading(false);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), price: price === "" ? null : Number(price), link: link.trim() || null, photo: photo || null });
  };

  return (
    <div className="modalBack" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modalHead"><h2>{item ? "Editar item" : "Novo item"}</h2><button type="button" onClick={onClose}><X/></button></div>

        <label>Foto do produto
          <div className="exerciseGifPreview shoppingPhotoPreview" onClick={() => fileRef.current?.click()}>
            {photo ? <img src={photo} alt="Prévia"/> : <ShoppingCart size={28}/>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handleFile(f); }}/>
          <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>{uploading ? "Enviando..." : (photo ? "Trocar foto" : "Escolher foto")}</button>
          {photo && <button type="button" className="ghost" onClick={() => setPhoto("")}><X size={13}/> Remover foto</button>}
        </label>

        <label>Nome do produto<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Tênis de corrida" onKeyDown={e => { if (e.key === "Enter" && name.trim()) handleSubmit(); }}/></label>
        <label>Preço<input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0,00"/></label>
        <label>Link da loja<input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..."/></label>

        <div className="modalActions">
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="add" disabled={!name.trim()} onClick={handleSubmit}><Check size={16}/> Salvar</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Treino (treinos personalizados em pastas, com exercícios em séries e GIF de referência) ----------

const workoutFmtValue = (ex) => {
  if (ex.mode === "tempo") {
    const s = Math.max(0, Number(ex.value) || 0);
    const m = Math.floor(s / 60), r = s % 60;
    return `${m}:${String(r).padStart(2, "0")} min`;
  }
  return `${Number(ex.value) || 0} repetições`;
};

function WorkoutShelf({ foldersEntity, exercisesEntity }) {
  const { data: folders, add: addFolder, remove: removeFolder, update: updateFolder } = foldersEntity;
  const { data: exercises, add: addExercise, remove: removeExercise, update: updateExercise, reorder: reorderExercises } = exercisesEntity;

  const [openFolderId, setOpenFolderId] = useState(null);
  const [folderModal, setFolderModal] = useState(null); // null | "new" | pasta sendo renomeada
  const [exerciseForm, setExerciseForm] = useState(null); // null | "new" | exercício sendo editado
  const [openMenuId, setOpenMenuId] = useState(null);
  const [playerFolderId, setPlayerFolderId] = useState(null);

  const currentFolder = openFolderId ? folders.find(f => f.id === openFolderId) : null;
  const visibleExercises = exercises.filter(e => e.folder_id === openFolderId);

  const handleSaveFolder = (name) => {
    if (folderModal === "new") addFolder({ id: crypto.randomUUID(), name, cover_image: null });
    else updateFolder(folderModal.id, { name });
    setFolderModal(null);
  };

  const handleSetCover = async (folder, file) => {
    setOpenMenuId(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 480, 480, 0.85);
      await updateFolder(folder.id, { cover_image: dataUrl });
    } catch (e) {
      console.error(e);
      alert("Não foi possível usar essa imagem. Tente outra foto.");
    }
  };
  const handleRemoveCover = (folder) => { setOpenMenuId(null); updateFolder(folder.id, { cover_image: null }); };

  const confirmDeleteFolder = (folder) => {
    setOpenMenuId(null);
    const count = exercises.filter(e => e.folder_id === folder.id).length;
    const msg = count > 0
      ? `Excluir o treino "${folder.name}"? Os ${count} exercício(s) dele também serão apagados.`
      : `Excluir o treino "${folder.name}"?`;
    if (!confirm(msg)) return;
    exercises.filter(e => e.folder_id === folder.id).forEach(e => removeExercise(e.id));
    removeFolder(folder.id);
    if (openFolderId === folder.id) setOpenFolderId(null);
  };

  const confirmDeleteExercise = (ex) => {
    setOpenMenuId(null);
    if (confirm(`Excluir "${ex.name}"?`)) removeExercise(ex.id);
  };

  const moveExercise = (ex, dir) => {
    const idx = visibleExercises.findIndex(e => e.id === ex.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= visibleExercises.length) return;
    const a = visibleExercises[idx], b = visibleExercises[swapIdx];
    const fullIdxA = exercises.findIndex(e => e.id === a.id);
    const fullIdxB = exercises.findIndex(e => e.id === b.id);
    const newFull = [...exercises];
    [newFull[fullIdxA], newFull[fullIdxB]] = [newFull[fullIdxB], newFull[fullIdxA]];
    reorderExercises(newFull);
  };

  if (playerFolderId) {
    const folder = folders.find(f => f.id === playerFolderId);
    return <WorkoutPlayer
      folder={folder}
      exercises={exercises.filter(e => e.folder_id === playerFolderId)}
      onClose={() => setPlayerFolderId(null)}
    />;
  }

  if (exerciseForm !== null) {
    return <ExerciseForm
      exercise={exerciseForm === "new" ? null : exerciseForm}
      onCancel={() => setExerciseForm(null)}
      onSave={(payload) => {
        if (exerciseForm === "new") addExercise({ id: crypto.randomUUID(), folder_id: openFolderId, ...payload });
        else updateExercise(exerciseForm.id, payload);
        setExerciseForm(null);
      }}
    />;
  }

  return (
    <div className="content" onClick={() => setOpenMenuId(null)}>
      <div className="flashHead">
        <div className="flashHeadInfo">
          <div className="flashHeadIcon"><Dumbbell size={22}/></div>
          <div>
            <small>{currentFolder ? currentFolder.name.toUpperCase() : "ÁREA DE LAZER"}</small>
            <h2>{currentFolder ? currentFolder.name : "Treino"}</h2>
            <p>{currentFolder ? `${visibleExercises.length} exercício(s) neste treino.` : "Monte treinos personalizados em pastas, com exercícios, séries e GIF de referência."}</p>
          </div>
        </div>
        <div className="flashHeadActions">
          {currentFolder ? <>
            <button className="ghost" onClick={() => setOpenFolderId(null)}><ChevronLeft size={16}/> Voltar</button>
            {visibleExercises.length > 0 && <button className="ghost" onClick={() => setPlayerFolderId(currentFolder.id)}><Play size={16}/> Iniciar treino</button>}
            <button className="add" onClick={(e) => { e.stopPropagation(); setExerciseForm("new"); }}><Plus size={16}/> Adicionar exercício</button>
          </> : (
            <button className="add" onClick={(e) => { e.stopPropagation(); setFolderModal("new"); }}><FolderPlus size={16}/> Novo treino</button>
          )}
        </div>
      </div>

      {!currentFolder && folders.length === 0 ? (
        <div className="flashEmpty">
          <div className="flashEmptyIcon"><Dumbbell size={30}/></div>
          <h3>Nenhum treino ainda</h3>
          <p>Crie uma pasta de treino, escolha uma foto pra capa e comece a adicionar seus exercícios.</p>
          <button className="add" onClick={() => setFolderModal("new")}><Plus size={16}/> Criar meu primeiro treino</button>
        </div>
      ) : !currentFolder ? (
        <div className="shelf">
          <div className="bookTile addTile" onClick={() => setFolderModal("new")}>
            <div className="bookCoverWrap addCover"><FolderPlus size={26}/><span>Novo treino</span></div>
          </div>
          {folders.map(f => (
            <WorkoutFolderTile
              key={f.id}
              folder={f}
              count={exercises.filter(e => e.folder_id === f.id).length}
              menuOpen={openMenuId === `folder:${f.id}`}
              onToggleMenu={(e) => { e?.stopPropagation?.(); setOpenMenuId(id => id === `folder:${f.id}` ? null : `folder:${f.id}`); }}
              onOpen={() => setOpenFolderId(f.id)}
              onRename={() => { setOpenMenuId(null); setFolderModal(f); }}
              onDelete={() => confirmDeleteFolder(f)}
              onSetCover={(file) => handleSetCover(f, file)}
              onRemoveCover={() => handleRemoveCover(f)}
            />
          ))}
        </div>
      ) : visibleExercises.length === 0 ? (
        <div className="flashEmpty">
          <div className="flashEmptyIcon"><ClipboardList size={30}/></div>
          <h3>Nenhum exercício ainda</h3>
          <p>Adicione exercícios com nome, séries, tempo ou repetições — e um GIF de referência se quiser.</p>
          <button className="add" onClick={() => setExerciseForm("new")}><Plus size={16}/> Adicionar exercício</button>
        </div>
      ) : (
        <div className="exerciseList">
          {visibleExercises.map((ex, idx) => (
            <ExerciseRow
              key={ex.id}
              exercise={ex}
              isFirst={idx === 0}
              isLast={idx === visibleExercises.length - 1}
              menuOpen={openMenuId === `ex:${ex.id}`}
              onToggleMenu={(e) => { e.stopPropagation(); setOpenMenuId(id => id === `ex:${ex.id}` ? null : `ex:${ex.id}`); }}
              onEdit={() => { setOpenMenuId(null); setExerciseForm(ex); }}
              onDelete={() => confirmDeleteExercise(ex)}
              onMoveUp={() => moveExercise(ex, -1)}
              onMoveDown={() => moveExercise(ex, 1)}
            />
          ))}
        </div>
      )}

      {folderModal && (
        <FolderModal
          folder={folderModal === "new" ? null : folderModal}
          onClose={() => setFolderModal(null)}
          onSave={handleSaveFolder}
        />
      )}
    </div>
  );
}

function WorkoutFolderTile({ folder, count, menuOpen, onToggleMenu, onOpen, onRename, onDelete, onSetCover, onRemoveCover }) {
  const coverInputRef = useRef(null);
  return (
    <div className="bookTile groupTile" onClick={onOpen}>
      <div className="bookCoverWrap groupCover">
        {folder.cover_image
          ? <div className="bookCoverImg"><img src={folder.cover_image} alt={folder.name}/></div>
          : <Dumbbell size={34}/>}
      </div>
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onSetCover(file);
        }}
      />
      <button className="bookMenuBtn" onClick={(e) => { e.stopPropagation(); onToggleMenu(e); }}><MoreVertical size={16}/></button>
      {menuOpen && <div className="bookMenu" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => coverInputRef.current?.click()}><ImagePlus size={13}/> {folder.cover_image ? "Trocar foto da capa" : "Colocar foto na capa"}</button>
        {folder.cover_image && <button onClick={onRemoveCover}><X size={13}/> Remover foto da capa</button>}
        <button onClick={onRename}><Pencil size={13}/> Renomear</button>
        <button className="danger" onClick={onDelete}><Trash2 size={13}/> Excluir treino</button>
      </div>}
      <b className="bookTitle">{folder.name}</b>
      <small className="bookProgressLabel">{count} exercício{count === 1 ? "" : "s"}</small>
    </div>
  );
}

const workoutFmtRest = (s) => {
  const sec = Math.max(0, Number(s) || 0);
  if (sec === 0) return null;
  if (sec % 60 === 0) return `${sec / 60} min`;
  const m = Math.floor(sec / 60), r = sec % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")} min` : `${sec}s`;
};

function ExerciseRow({ exercise, isFirst, isLast, menuOpen, onToggleMenu, onEdit, onDelete, onMoveUp, onMoveDown }) {
  const restLabel = workoutFmtRest(exercise.rest_seconds);
  return (
    <div className="exerciseRow">
      <div className="exerciseThumb">
        {exercise.gif_url ? <img src={exercise.gif_url} alt={exercise.name}/> : <Film size={22}/>}
      </div>
      <div className="exerciseInfo">
        <b>{exercise.name}</b>
        <small><Repeat2 size={12}/> {Number(exercise.sets) || 1} série{(Number(exercise.sets) || 1) === 1 ? "" : "s"} de {workoutFmtValue(exercise)}{restLabel && <> <Hourglass size={12}/> descanso de {restLabel}</>}</small>
      </div>
      <div className="exerciseOrderBtns">
        <button className="ghost" disabled={isFirst} onClick={onMoveUp}><ArrowUp size={13}/></button>
        <button className="ghost" disabled={isLast} onClick={onMoveDown}><ArrowDown size={13}/></button>
      </div>
      <button className="flashTileMenuBtn exerciseMenuBtn" onClick={onToggleMenu}><MoreVertical size={16}/></button>
      {menuOpen && (
        <div className="flashMenuPop exerciseMenuPop" onClick={e => e.stopPropagation()}>
          <button onClick={onEdit}><Pencil size={13}/> Editar</button>
          <button className="danger" onClick={onDelete}><Trash2 size={13}/> Excluir</button>
        </div>
      )}
    </div>
  );
}

function ExerciseForm({ exercise, onCancel, onSave }) {
  const [name, setName] = useState(exercise?.name || "");
  const [mode, setMode] = useState(exercise?.mode || "reps");
  const [sets, setSets] = useState(exercise?.sets ?? 3);
  const [minutes, setMinutes] = useState(exercise?.mode === "tempo" ? Math.floor((exercise.value || 0) / 60) : 0);
  const [seconds, setSeconds] = useState(exercise?.mode === "tempo" ? (exercise.value || 0) % 60 : 30);
  const [reps, setReps] = useState(exercise?.mode !== "tempo" ? (exercise?.value ?? 15) : 15);
  const [restMinutes, setRestMinutes] = useState(exercise ? Math.floor((exercise.rest_seconds || 0) / 60) : 1);
  const [restSeconds, setRestSeconds] = useState(exercise ? (exercise.rest_seconds || 0) % 60 : 0);
  const [gifUrl, setGifUrl] = useState(exercise?.gif_url || "");
  const [gifMode, setGifMode] = useState("upload"); // "upload" | "url"
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await fileToRawDataUrl(file);
      setGifUrl(dataUrl);
    } catch (e) {
      console.error(e);
      alert("Não foi possível usar esse arquivo. Tente um GIF, imagem ou vídeo curto.");
    }
    setUploading(false);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    const value = mode === "tempo" ? (Number(minutes) || 0) * 60 + (Number(seconds) || 0) : Number(reps) || 0;
    const rest_seconds = (Number(restMinutes) || 0) * 60 + (Number(restSeconds) || 0);
    onSave({ name: name.trim(), mode, sets: Number(sets) || 1, value, rest_seconds, gif_url: gifUrl || null });
  };

  return (
    <div className="content">
      <div className="flashHead">
        <div className="flashHeadInfo">
          <div className="flashHeadIcon"><Dumbbell size={22}/></div>
          <div>
            <small>TREINO</small>
            <h2>{exercise ? "Editar exercício" : "Novo exercício"}</h2>
            <p>Dê um nome, escolha entre tempo ou repetições, e organize em séries.</p>
          </div>
        </div>
        <div className="flashHeadActions">
          <button className="ghost" onClick={onCancel}>Cancelar</button>
          <button className="add" disabled={!name.trim()} onClick={handleSubmit}><Check size={16}/> Salvar</button>
        </div>
      </div>

      <div className="exerciseFormGrid">
        <div className="exerciseFormFields">
          <label>Nome do exercício<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Flexões, Abdominais, Prancha..."/></label>

          <label>Modo
            <div className="themeToggle exerciseModeToggle">
              <button type="button" className={mode === "reps" ? "active" : ""} onClick={() => setMode("reps")}><Repeat2 size={14}/> Repetições</button>
              <button type="button" className={mode === "tempo" ? "active" : ""} onClick={() => setMode("tempo")}><Clock3 size={14}/> Tempo</button>
            </div>
          </label>

          <label>Séries<input type="number" min="1" value={sets} onChange={e => setSets(e.target.value)}/></label>

          {mode === "reps" ? (
            <label>Repetições por série<input type="number" min="1" value={reps} onChange={e => setReps(e.target.value)}/></label>
          ) : (
            <label>Duração por série
              <div className="exerciseTimeRow">
                <input type="number" min="0" value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="min"/>
                <span>min</span>
                <input type="number" min="0" max="59" value={seconds} onChange={e => setSeconds(e.target.value)} placeholder="seg"/>
                <span>seg</span>
              </div>
            </label>
          )}

          <label>Descanso entre séries
            <div className="exerciseTimeRow">
              <input type="number" min="0" value={restMinutes} onChange={e => setRestMinutes(e.target.value)} placeholder="min"/>
              <span>min</span>
              <input type="number" min="0" max="59" value={restSeconds} onChange={e => setRestSeconds(e.target.value)} placeholder="seg"/>
              <span>seg</span>
            </div>
          </label>

          <p className="emptyHint">Prévia: {sets || 1} série{(Number(sets) || 1) === 1 ? "" : "s"} de {mode === "tempo" ? `${Number(minutes) || 0}:${String(Number(seconds) || 0).padStart(2, "0")} min` : `${Number(reps) || 0} repetições`}{((Number(restMinutes) || 0) * 60 + (Number(restSeconds) || 0)) > 0 && ` · descanso de ${workoutFmtRest((Number(restMinutes) || 0) * 60 + (Number(restSeconds) || 0))}`}</p>
        </div>

        <div className="exerciseFormGif">
          <small className="bookMenuLabel">GIF de referência (opcional)</small>
          <div className="exerciseGifPreview">
            {gifUrl ? <img src={gifUrl} alt="Prévia do exercício"/> : <Film size={30}/>}
          </div>
          <div className="themeToggle exerciseModeToggle">
            <button type="button" className={gifMode === "upload" ? "active" : ""} onClick={() => setGifMode("upload")}><Upload size={14}/> Enviar arquivo</button>
            <button type="button" className={gifMode === "url" ? "active" : ""} onClick={() => setGifMode("url")}><Link2 size={14}/> Colar link</button>
          </div>
          {gifMode === "upload" ? (
            <>
              <input ref={fileRef} type="file" accept="image/gif,image/*,video/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handleFile(f); }}/>
              <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>{uploading ? "Enviando..." : "Escolher GIF ou imagem"}</button>
            </>
          ) : (
            <input value={gifUrl} onChange={e => setGifUrl(e.target.value)} placeholder="https://... (link de um GIF)"/>
          )}
          {gifUrl && <button type="button" className="ghost" onClick={() => setGifUrl("")}><X size={13}/> Remover GIF</button>}
        </div>
      </div>
    </div>
  );
}

function WorkoutPlayer({ folder, exercises, onClose }) {
  const [idx, setIdx] = useState(0);
  const [setNum, setSetNum] = useState(1);
  const [phase, setPhase] = useState("exercise"); // "exercise" | "rest"
  const [running, setRunning] = useState(false);
  const ex = exercises[idx];
  const [left, setLeft] = useState(ex?.mode === "tempo" ? (Number(ex.value) || 0) : 0);
  const timerRef = useRef(null);

  const totalSets = Number(ex?.sets) || 1;
  const restSeconds = Number(ex?.rest_seconds) || 0;

  // Reinicia estado do exercício ao trocar de exercício
  useEffect(() => {
    setSetNum(1);
    setPhase("exercise");
    setRunning(false);
    setLeft(ex?.mode === "tempo" ? (Number(ex.value) || 0) : 0);
    return () => clearInterval(timerRef.current);
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cronômetro (conta tanto o tempo do exercício quanto o descanso)
  useEffect(() => {
    clearInterval(timerRef.current);
    const shouldTick = running && (phase === "rest" || ex?.mode === "tempo");
    if (shouldTick) {
      timerRef.current = setInterval(() => {
        setLeft(s => {
          if (s <= 1) { clearInterval(timerRef.current); setRunning(false); return 0; }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [running, phase, ex]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ex) return null;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const goToExercise = (n) => { if (n < 0 || n >= exercises.length) return; setIdx(n); };

  // Avança para o descanso (se houver) ou direto pra próxima série/exercício
  const finishSet = () => {
    clearInterval(timerRef.current);
    setRunning(false);
    if (setNum < totalSets) {
      if (restSeconds > 0) {
        setPhase("rest");
        setLeft(restSeconds);
      } else {
        setSetNum(n => n + 1);
        setPhase("exercise");
        setLeft(ex.mode === "tempo" ? (Number(ex.value) || 0) : 0);
      }
    } else if (idx < exercises.length - 1) {
      goToExercise(idx + 1);
    } else {
      onClose();
    }
  };

  const finishRest = () => {
    clearInterval(timerRef.current);
    setRunning(false);
    setSetNum(n => n + 1);
    setPhase("exercise");
    setLeft(ex.mode === "tempo" ? (Number(ex.value) || 0) : 0);
  };

  return (
    <div className="modalBack" onClick={onClose}>
      <div className="modal workoutPlayerModal" onClick={e => e.stopPropagation()}>
        <div className="modalHead">
          <h2>{folder?.name}</h2>
          <button type="button" onClick={onClose}><X/></button>
        </div>
        <small className="bookMenuLabel">Exercício {idx + 1} de {exercises.length} · Série {Math.min(setNum, totalSets)} de {totalSets}</small>

        {phase === "rest" ? (
          <>
            <div className="exerciseGifPreview workoutPlayerGif workoutRestPreview"><Hourglass size={40}/></div>
            <h2 className="workoutPlayerName">Descanso</h2>
            <p className="emptyHint">Prepare-se: próxima é a série {setNum + 1} de {ex.name}.</p>
            <div className="levelTimerRow workoutPlayerTimer">
              <div className="levelTimer"><Clock3 size={20}/> {fmt(left)}</div>
              <div className="levelTimerBtns">
                <button className="ghost" onClick={() => setLeft(restSeconds)}><RotateCcw size={14}/></button>
                <button className="add" onClick={() => setRunning(r => !r)}>{running ? <Pause size={16}/> : <Play size={16}/>}</button>
              </div>
            </div>
            <div className="modalActions workoutPlayerNav">
              <button className="ghost" disabled={idx === 0 && setNum === 1} onClick={() => { setPhase("exercise"); setRunning(false); setLeft(ex.mode === "tempo" ? (Number(ex.value) || 0) : 0); }}><SkipBack size={15}/> Voltar à série</button>
              <button className="add" onClick={finishRest}>Pular descanso <SkipForward size={15}/></button>
            </div>
          </>
        ) : (
          <>
            <div className="exerciseGifPreview workoutPlayerGif">
              {ex.gif_url ? <img src={ex.gif_url} alt={ex.name}/> : <Film size={40}/>}
            </div>
            <h2 className="workoutPlayerName">{ex.name}</h2>
            <p className="emptyHint">{totalSets} série{totalSets === 1 ? "" : "s"} de {workoutFmtValue(ex)}{restSeconds > 0 && ` · descanso de ${workoutFmtRest(restSeconds)}`}</p>

            {ex.mode === "tempo" ? (
              <div className="levelTimerRow workoutPlayerTimer">
                <div className="levelTimer"><Clock3 size={20}/> {fmt(left)}</div>
                <div className="levelTimerBtns">
                  <button className="ghost" onClick={() => setLeft(Number(ex.value) || 0)}><RotateCcw size={14}/></button>
                  <button className="add" onClick={() => setRunning(r => !r)}>{running ? <Pause size={16}/> : <Play size={16}/>}</button>
                </div>
              </div>
            ) : (
              <p className="emptyHint">Faça as repetições no seu ritmo e conclua a série quando terminar.</p>
            )}

            <div className="modalActions workoutPlayerNav">
              <button className="ghost" disabled={idx === 0} onClick={() => goToExercise(idx - 1)}><SkipBack size={15}/> Exercício anterior</button>
              <button className="add" onClick={finishSet}>
                {setNum < totalSets ? <>Concluir série <SkipForward size={15}/></> : idx === exercises.length - 1 ? <>Concluir treino <Check size={16}/></> : <>Próximo exercício <SkipForward size={15}/></>}
              </button>
            </div>
          </>
        )}
      </div>
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

function StudyFlashcards({ entity, listsEntity, foldersEntity, studyGoals }) {
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
      onFinish={(listId, listTitle) => markFlashcardListStudied(listsEntity, studyGoals, listId, listTitle)}
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
    list?.cards?.length ? list.cards.map(c => ({ id: c.id || rid(), term: c.term || "", definition: c.definition || "", image: c.image || null }))
      : [{ id: rid(), term: "", definition: "", image: null }, { id: rid(), term: "", definition: "", image: null }]
  );
  const [uploadingId, setUploadingId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  const setRow = (id, field, value) => setRows(rs => rs.map(r => r.id===id ? {...r, [field]: value} : r));
  const removeRow = (id) => setRows(rs => rs.filter(r => r.id !== id));
  const addRow = () => setRows(rs => [...rs, { id: rid(), term: "", definition: "", image: null }]);

  const parseImportText = (text) => {
    const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const toHtml = (s) => escapeHtml(s.trim()).replace(/\n+/g, "<br>");

    const lines = text.split(/\r?\n/);
    const hasTabFormat = lines.some(l => l.includes("\t"));

    const cards = [];

    if (hasTabFormat) {
      // Formato padrão do Quizlet: cada cartão começa numa linha "termo<TAB>definição".
      // Linhas seguintes sem TAB são continuação da definição do cartão anterior
      // (ex.: frases de exemplo que o Quizlet exporta em linhas separadas).
      let current = null;
      for (const rawLine of lines) {
        if (rawLine.trim() === "") {
          if (current) current.definition += "\n";
          continue;
        }
        if (rawLine.includes("\t")) {
          const idx = rawLine.indexOf("\t");
          current = { id: rid(), term: rawLine.slice(0, idx).trim(), definition: rawLine.slice(idx + 1).trim() + "\n" };
          cards.push(current);
        } else if (current) {
          current.definition += rawLine.trim() + "\n";
        }
        // linhas sem TAB antes de qualquer cartão começar são ignoradas
      }
    } else {
      // Sem TAB no texto: assume um cartão por linha, separado por " - " ou ",".
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        let term, definition;
        if (/\s-\s/.test(line)) {
          const idx = line.search(/\s-\s/);
          term = line.slice(0, idx); definition = line.slice(idx + 3);
        } else if (line.includes(",")) {
          const idx = line.indexOf(",");
          term = line.slice(0, idx); definition = line.slice(idx + 1);
        } else {
          term = line; definition = "";
        }
        cards.push({ id: rid(), term: term.trim(), definition: definition.trim() + "\n" });
      }
    }

    return cards
      .filter(c => c.term.trim() || c.definition.trim())
      .map(c => ({ id: c.id, term: toHtml(c.term), definition: toHtml(c.definition), image: null }));
  };

  const confirmImport = () => {
    const imported = parseImportText(importText);
    if (imported.length === 0) { alert("Cole o texto exportado do Quizlet antes de importar."); return; }
    setRows(rs => {
      const kept = rs.filter(r => stripHtml(r.term).trim() || stripHtml(r.definition).trim() || r.image);
      return [...kept, ...imported];
    });
    setImportText("");
    setShowImport(false);
  };

  const handleRowImage = async (id, file) => {
    if (!file) return;
    setUploadingId(id);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 640, 640, 0.82);
      setRow(id, "image", dataUrl);
    } catch (e) {
      console.error(e);
      alert("Não foi possível usar essa imagem. Tente outra foto.");
    } finally {
      setUploadingId(null);
    }
  };

  const submit = () => {
    const cards = rows.filter(r => stripHtml(r.term).trim() || stripHtml(r.definition).trim() || r.image).map(r => ({ id: r.id, term: r.term, definition: r.definition, image: r.image || null }));
    if (cards.length === 0) { alert("Adicione pelo menos um cartão com termo ou definição."); return; }
    onSave({
      title: title.trim() || "Lista sem título",
      description: description.trim(),
      folder_id: list ? (list.folder_id ?? null) : (defaultFolderId ?? null),
      cards,
      // Editar os cartões desmarca a lista como "estudada", já que o conteúdo revisado mudou —
      // isso também recoloca a meta vinculada (se houver) em andamento na próxima sincronização.
      ...(list ? { completed: false } : {})
    });
  };

  return (
    <div className="content">
      <div className="flashFormHead">
        <h2>{list ? "Editar lista de cartões" : "Criar lista de cartões"}</h2>
        <div className="flashHeadActions">
          <button className="ghost" onClick={()=>setShowImport(s=>!s)}><Upload size={15}/> Importar do Quizlet</button>
          <button className="ghost" onClick={onCancel}>Cancelar</button>
          <button className="add" onClick={submit}><Check size={16}/> {list ? "Salvar" : "Criar"}</button>
        </div>
      </div>

      <div className="flashFormPanel">
        <label className="flashFormLabel">Título</label>
        <input className="flashFormTitleInput" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Conjunções — Português"/>
        <input className="flashFormDescInput" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Adicione uma descrição (opcional)"/>
      </div>

      {showImport && (
        <div className="flashImportPanel">
          <p className="flashImportHelp">
            No Quizlet, abra o set, toque em <strong>"..."</strong> → <strong>Exportar</strong>, escolha "TAB entre termo e definição" e "Nova linha entre cartões", copie o texto e cole abaixo.
          </p>
          <textarea
            className="flashImportTextarea"
            value={importText}
            onChange={e=>setImportText(e.target.value)}
            placeholder={"gato\tanimal doméstico felino\ncachorro\tanimal doméstico canino"}
            rows={8}
          />
          <div className="flashImportActions">
            <button className="ghost" onClick={()=>{ setShowImport(false); setImportText(""); }}>Cancelar</button>
            <button className="add" onClick={confirmImport}><Upload size={15}/> Importar cartões</button>
          </div>
        </div>
      )}

      {rows.map((r, i) => (
        <FlashFormRow
          key={r.id}
          row={r}
          index={i}
          uploading={uploadingId===r.id}
          onChangeField={setRow}
          onRemove={removeRow}
          onImage={handleRowImage}
        />
      ))}

      <button className="flashAddRowBtn" onClick={addRow}><Plus size={15}/> Adicionar cartão</button>
    </div>
  );
}

const FLASH_HIGHLIGHT_COLOR = "#997700";

function FlashFormRow({ row, index, uploading, onChangeField, onRemove, onImage }) {
  const termRef = useRef(null);
  const defRef = useRef(null);

  useEffect(() => {
    if (termRef.current) termRef.current.innerHTML = row.term || "";
    if (defRef.current) defRef.current.innerHTML = row.definition || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  // Impede que o clique num botão da barra tire o foco/seleção do texto
  const keepFocus = (e) => e.preventDefault();

  const exec = (command, value = null) => {
    document.execCommand(command, false, value);
    if (termRef.current) onChangeField(row.id, "term", termRef.current.innerHTML);
    if (defRef.current) onChangeField(row.id, "definition", defRef.current.innerHTML);
  };

  return (
    <div className="flashFormRow">
      <div className="flashFormRowHead">
        <span>{index+1}</span>
        <div className="flashFormToolbar" onMouseDown={keepFocus}>
          <button title="Negrito" onClick={()=>exec("bold")}><Bold size={14}/></button>
          <button title="Itálico" onClick={()=>exec("italic")}><Italic size={14}/></button>
          <button title="Sublinhado" onClick={()=>exec("underline")}><Underline size={14}/></button>
          <span className="noteToolDivider"/>
          <button title="Marcador de texto amarelo" onClick={()=>exec("hiliteColor", FLASH_HIGHLIGHT_COLOR)}><Highlighter size={14}/></button>
          <span className="noteToolDivider"/>
          <button title="Lista com marcadores" onClick={()=>exec("insertUnorderedList")}><List size={14}/></button>
          <button title="Lista numerada (1, 2, 3)" onClick={()=>exec("insertOrderedList")}><ListOrdered size={14}/></button>
        </div>
        <button onClick={()=>onRemove(row.id)}><Trash2 size={14}/></button>
      </div>
      <div className="flashFormRowFields">
        <div>
          <div
            ref={termRef}
            className="flashRichField"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Digite o termo"
            onInput={()=>onChangeField(row.id, "term", termRef.current.innerHTML)}
          />
          <label>TERMO</label>
        </div>
        <div>
          <div
            ref={defRef}
            className="flashRichField"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Digite a definição"
            onInput={()=>onChangeField(row.id, "definition", defRef.current.innerHTML)}
          />
          <label>DEFINIÇÃO</label>
        </div>
        <div className="flashFormImageField">
          <label className="flashFormImageBtn">
            {uploading ? (
              <span>Enviando...</span>
            ) : row.image ? (
              <img src={row.image} alt="Imagem do cartão"/>
            ) : (
              <><ImagePlus size={16}/><span>Imagem</span></>
            )}
            <input type="file" accept="image/*" hidden onChange={e=>{ const f=e.target.files?.[0]; e.target.value=""; if (f) onImage(row.id, f); }}/>
          </label>
          {row.image && <button className="flashFormImageRemove" onClick={()=>onChangeField(row.id,"image",null)}><X size={12}/></button>}
          <label>IMAGEM</label>
        </div>
      </div>
    </div>
  );
}

function FlashcardListStudy({ list, onBack, onEdit, onFinish }) {
  const [tab, setTab] = useState("cards");
  const cards = list.cards || [];
  const notifyFinished = () => onFinish && onFinish(list.id, list.title || "Lista sem título");
  const fullRef = useRef(null);
  const [fullscreen, toggleFullscreen] = useFullscreen(fullRef);

  return (
    <div className={"content flashStudyRoot"+(fullscreen?" flashStudyRootFull":"")} ref={fullRef}>
      <div className="flashFormHead">
        <div><h2>{list.title || "Lista sem título"}</h2><small className="flashListMeta">{cards.length} cartão{cards.length===1?"":"s"}</small></div>
        <div className="flashHeadActions">
          <button className="ghost" title={fullscreen?"Sair da tela cheia":"Tela cheia"} onClick={toggleFullscreen}>{fullscreen?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button>
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
      ) : tab === "cards" ? <FlashcardFlipMode cards={cards} onComplete={notifyFinished}/>
        : tab === "learn" ? <FlashcardLearnMode cards={cards} onComplete={notifyFinished}/>
        : <FlashcardMatchMode cards={cards} onComplete={notifyFinished}/>}
    </div>
  );
}

function FlashcardFlipMode({ cards, onComplete }) {
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
      else {
        setFinished(true);
        // Só conta como "lista estudada" quando o baralho revisado é o completo (não a rodada de refazer só os que faltam).
        if (deck.length === cards.length) onComplete && onComplete();
      }
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
          <div className="flashFlipFace flashFlipFront">
            <small>TERMO</small>
            {card.image && <img className="flashFlipImage" src={card.image} alt=""/>}
            {stripHtml(card.term).trim() ? <span dangerouslySetInnerHTML={{__html: card.term}}/> : <span>(sem termo)</span>}
          </div>
          <div className="flashFlipFace flashFlipBack"><small>DEFINIÇÃO</small>{stripHtml(card.definition).trim() ? <span dangerouslySetInnerHTML={{__html: card.definition}}/> : <span>(sem definição)</span>}</div>
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

function FlashcardLearnMode({ cards, onComplete }) {
  const [deck, setDeck] = useState(cards);
  const [order, setOrder] = useState(() => shuffleArr(cards));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongIds, setWrongIds] = useState([]);

  const finished = index >= order.length;
  const card = finished ? null : order[index];

  // Só conta como "lista estudada" quando o quiz percorreu todos os cartões (não a rodada de refazer só os errados).
  useEffect(() => {
    if (finished && order.length === cards.length) onComplete && onComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const options = useMemo(() => {
    if (!card) return [];
    const wrong = shuffleArr(cards.filter(c => c.id !== card.id)).slice(0, 3).map(c => c.definition);
    return shuffleArr([card.definition, ...wrong]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  if (cards.length < 2) return <p className="emptyHint">Adicione pelo menos 2 cartões para usar o modo Aprender.</p>;

  const restartAll = () => {
    setDeck(cards); setOrder(shuffleArr(cards)); setIndex(0); setSelected(null); setCorrectCount(0); setWrongIds([]);
  };
  const restartFailed = () => {
    const failedIds = new Set(wrongIds);
    const failedCards = cards.filter(c => failedIds.has(c.id));
    if (failedCards.length === 0) return;
    setDeck(failedCards); setOrder(shuffleArr(failedCards)); setIndex(0); setSelected(null); setCorrectCount(0); setWrongIds([]);
  };

  if (finished) {
    const learningCount = order.length - correctCount;
    return (
      <div className="flashStudyArea">
        <div className="flashFlipDone">
          <div className="flashFlipDoneIcon"><Trophy size={32}/></div>
          <h3>Boa! Você revisou os {order.length} cartão{order.length===1?"":"s"} 🎉</h3>
          <div className="flashFlipDoneStats">
            <div className="flashFlipDoneStat know"><strong>{correctCount}</strong><span>Já sei</span></div>
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

  const choose = (opt) => {
    if (selected) return;
    setSelected(opt);
    if (opt === card.definition) setCorrectCount(c => c+1);
    else setWrongIds(ids => [...ids, card.id]);
  };
  const next = () => { setSelected(null); setIndex(i => i+1); };

  return (
    <div className="flashStudyArea">
      <div className="flashLearnQuestion">
        <small>TERMO</small>
        {card.image && <img className="flashLearnImage" src={card.image} alt=""/>}
        <h3 dangerouslySetInnerHTML={{__html: card.term}}/>
      </div>
      <div className="flashLearnOptions">
        {options.map((opt, i) => {
          let cls = "flashLearnOpt";
          if (selected) {
            if (opt === card.definition) cls += " correct";
            else if (opt === selected) cls += " wrong";
          }
          return <button key={i} className={cls} onClick={()=>choose(opt)} dangerouslySetInnerHTML={{__html: opt}}/>;
        })}
      </div>
      {selected && <button className="add flashLearnNext" onClick={next}>Próxima <ArrowRight size={15}/></button>}
      <div className="flashPager"><span>{index+1} / {order.length}</span></div>
    </div>
  );
}

function FlashcardMatchMode({ cards, onComplete }) {
  const pairCards = cards.slice(0, 8);
  const makeTiles = () => shuffleArr(pairCards.flatMap(c => [
    { key: c.id+"-t", pairId: c.id, text: c.term, image: c.image || null },
    { key: c.id+"-d", pairId: c.id, text: c.definition }
  ]));
  const [tiles, setTiles] = useState(makeTiles);
  const [selected, setSelected] = useState(null);
  const [matched, setMatched] = useState([]);
  const [wrongFlash, setWrongFlash] = useState([]);

  const restart = () => { setTiles(makeTiles()); setSelected(null); setMatched([]); setWrongFlash([]); };

  // O jogo só usa os 8 primeiros pares, então só conta como "lista estudada" quando ela cabe inteira no jogo.
  useEffect(() => {
    if (matched.length > 0 && matched.length === pairCards.length && pairCards.length === cards.length) onComplete && onComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched.length]);

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
            return (
              <button key={t.key} className={cls} disabled={isMatched} onClick={()=>onTap(t)}>
                {t.image && <img className="flashMatchImage" src={t.image} alt=""/>}
                <span dangerouslySetInnerHTML={{__html: t.text}}/>
              </button>
            );
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

function levelParsePattern(str){
  const m = String(str||"").trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if(!m) return null;
  const need = parseInt(m[1],10), win = parseInt(m[2],10);
  if(!need || !win || need>win) return null;
  return {need, win};
}
function levelFmtTime(totalSeconds){
  const s = Math.max(0, Math.floor(totalSeconds||0));
  const m = Math.floor(s/60), r = s%60;
  return String(m).padStart(2,"0")+":"+String(r).padStart(2,"0");
}

function Nivelamento(){
  const [pattern,setPattern] = usePersistentState("nivelamento_padrao","4/5");
  const [sessions,setSessions] = usePersistentState("nivelamento_historico",[]);
  const [phase,setPhase] = useState("config"); // config | running | done
  const [history,setHistory] = useState([]); // array de booleans
  const [seconds,setSeconds] = useState(0);
  const [paused,setPaused] = useState(false);
  const [lastResult,setLastResult] = useState(null);
  const [pipWindow,setPipWindow] = useState(null);
  const timerRef = useRef(null);

  const parsed = levelParsePattern(pattern);

  useEffect(()=>{
    if(phase==="running" && !paused){
      timerRef.current = setInterval(()=>setSeconds(s=>s+1), 1000);
      return ()=>clearInterval(timerRef.current);
    }
  },[phase,paused]);

  // Fecha a janela de picture-in-picture (se estiver aberta) quando a página some ou o nivelamento termina.
  useEffect(()=>{
    if(!pipWindow) return;
    const onPageHide = ()=>setPipWindow(null);
    pipWindow.addEventListener("pagehide", onPageHide);
    return ()=>pipWindow.removeEventListener("pagehide", onPageHide);
  },[pipWindow]);
  useEffect(()=>{
    if(phase!=="running" && pipWindow){ pipWindow.close(); setPipWindow(null); }
  },[phase]);
  useEffect(()=>()=>{ if(pipWindow) pipWindow.close(); },[]);

  const openPip = async ()=>{
    if(!("documentPictureInPicture" in window)){
      toast("Seu navegador não suporta picture-in-picture.", "error");
      return;
    }
    try{
      const pipWin = await window.documentPictureInPicture.requestWindow({width:280, height:230});
      pipWin.document.title = "Nivelamento";
      [...document.styleSheets].forEach(sheet=>{
        try{
          const rules = [...sheet.cssRules].map(r=>r.cssText).join("");
          const style = pipWin.document.createElement("style");
          style.textContent = rules;
          pipWin.document.head.appendChild(style);
        }catch(e){
          if(sheet.href){
            const link = pipWin.document.createElement("link");
            link.rel = "stylesheet"; link.href = sheet.href;
            pipWin.document.head.appendChild(link);
          }
        }
      });
      const theme = document.documentElement.getAttribute("data-theme") || document.body.getAttribute("data-theme");
      if(theme) pipWin.document.documentElement.setAttribute("data-theme", theme);
      pipWin.document.body.style.margin = "0";
      pipWin.document.body.style.background = "var(--bg-grad-3)";
      pipWin.document.body.style.overflow = "hidden";
      setPipWindow(pipWin);
    }catch(err){
      toast("Não foi possível abrir o picture-in-picture.", "error");
    }
  };
  const closePip = ()=>{ if(pipWindow) pipWindow.close(); setPipWindow(null); };

  const start = ()=>{
    if(!parsed){ toast("Use o formato acertos/total, ex: 4/5", "error"); return; }
    setHistory([]); setSeconds(0); setPaused(false); setLastResult(null); setPhase("running");
  };

  const finishSession = (finalHistory)=>{
    clearInterval(timerRef.current);
    const corrects = finalHistory.filter(Boolean).length;
    const pct = Math.round((corrects/finalHistory.length)*100);
    const result = {pattern, solved:finalHistory.length, pct, seconds, date:new Date().toISOString()};
    setLastResult(result);
    setSessions(list=>[result, ...list].slice(0,20));
    setPhase("done");
  };

  const answer = (correct)=>{
    if(phase!=="running" || paused || !parsed) return;
    const nh = [...history, correct];
    setHistory(nh);
    if(nh.length>=parsed.win){
      const inWindow = nh.slice(-parsed.win).filter(Boolean).length;
      if(inWindow>=parsed.need){ finishSession(nh); }
    }
  };
  const undo = ()=>{ if(history.length===0) return; setHistory(h=>h.slice(0,-1)); };
  const restart = ()=>{ setHistory([]); setSeconds(0); setPaused(false); };
  const exitRunning = ()=>{
    if(confirm("Sair do nivelamento em andamento? O progresso desta sessão não será salvo.")){
      clearInterval(timerRef.current);
      setPhase("config");
    }
  };

  const windowSlice = parsed ? history.slice(-parsed.win) : [];
  const inWindowCorrect = windowSlice.filter(Boolean).length;
  const progressPct = parsed && parsed.need>0 ? Math.min(100, Math.round((inWindowCorrect/parsed.need)*100)) : 0;

  return <div className="content levelWrap">
    <div className="studyGoalsHead">
      <div><h2>Nivelamento</h2><p>Treine questões e descubra se você já está nivelado no padrão desejado.</p></div>
    </div>

    {phase==="config" && <>
      <div className="levelConfigCard">
        <div className="levelConfigIcon"><BarChart3 size={22}/></div>
        <h3>Configuração do Nivelamento</h3>
        <label className="levelConfigLabel">Padrão de nivelamento
          <input value={pattern} onChange={e=>setPattern(e.target.value)} placeholder="Ex: 4/5, 5/5, 9/10"/>
        </label>
        <p className="levelConfigHint">Formato: acertos/total (ex: 4/5 significa 4 acertos nas últimas 5 questões)</p>
        {!parsed && pattern.trim()!=="" && <p className="levelConfigError">Padrão inválido. Use o formato acertos/total.</p>}
        <button className="add levelStartBtn" onClick={start} disabled={!parsed}><Play size={16}/> Iniciar Nivelamento</button>
      </div>

      {sessions.length>0 && <div className="levelHistorySection">
        <h3>Histórico</h3>
        <div className="levelHistoryList">
          {sessions.map((s,i)=>(
            <div className="levelHistoryItem" key={i}>
              <div className="levelHistoryItemIcon"><Target size={16}/></div>
              <div className="levelHistoryItemBody">
                <b>Padrão {s.pattern}</b>
                <span>{s.solved} questões · {s.pct}% de acerto · {levelFmtTime(s.seconds)}</span>
              </div>
              <span className="levelHistoryDate">{new Date(s.date).toLocaleDateString("pt-BR")}</span>
            </div>
          ))}
        </div>
      </div>}
    </>}

    {phase==="running" && parsed && <div className="levelRunCard">
      <div className="levelRunHead">
        <div><h3>Nivelamento em progresso</h3><small>Padrão: {parsed.need}/{parsed.win}</small></div>
        <div className="levelRunHeadBtns">
          <button className="levelExitBtn" onClick={pipWindow?closePip:openPip} title={pipWindow?"Fechar picture-in-picture":"Abrir em picture-in-picture"}>
            <PictureInPicture2 size={17}/>
          </button>
          <button className="levelExitBtn" onClick={exitRunning} title="Sair"><X size={18}/></button>
        </div>
      </div>

      {pipWindow && createPortal(
        <div className="levelPipContent">
          <div className="levelHistoryRow">
            {history.length===0 && <span className="emptyHint">Nenhuma resposta ainda.</span>}
            {history.map((c,i)=><div key={i} className={"levelDot "+(c?"correct":"wrong")}>{i+1}</div>)}
          </div>
          <div className="levelAnswerBtns levelPipAnswerBtns">
            <button className="levelBtn correct" onClick={()=>answer(true)} disabled={paused}><CheckCircle2 size={17}/> Correta</button>
            <button className="levelBtn wrong" onClick={()=>answer(false)} disabled={paused}><X size={17}/> Errada</button>
          </div>
        </div>,
        pipWindow.document.body
      )}

      <div className="levelHistoryRow">
        {history.length===0 && <span className="emptyHint">Nenhuma questão respondida ainda.</span>}
        {history.map((c,i)=><div key={i} className={"levelDot "+(c?"correct":"wrong")}>{i+1}</div>)}
      </div>

      <div className="levelProgressBlock">
        <div className="levelProgressLabelRow">
          <span>Questão {history.length+1}</span>
          <span>Progresso: {inWindowCorrect}/{parsed.win} acertos nas últimas {parsed.win} questões</span>
        </div>
        <div className="progress levelProgressBar"><i style={{width:progressPct+"%"}}/></div>
      </div>

      <div className="levelQuestionCard">
        <b>Questão {history.length+1}</b>
        <p>Clique no botão correto ou errado para registrar sua resposta.</p>
      </div>

      <div className="levelAnswerBtns">
        <button className="levelBtn correct" onClick={()=>answer(true)} disabled={paused}><CheckCircle2 size={17}/> Correta</button>
        <button className="levelBtn wrong" onClick={()=>answer(false)} disabled={paused}><X size={17}/> Errada</button>
        <button className="levelBtn back" onClick={undo} disabled={history.length===0}><Undo2 size={17}/> Voltar</button>
      </div>

      <div className="levelTimerRow">
        <div className="levelTimer"><Clock3 size={15}/> <span>{levelFmtTime(seconds)}</span><small>Tempo decorrido</small></div>
        <div className="levelTimerBtns">
          <button className="ghost" onClick={()=>setPaused(p=>!p)}>{paused? <><Play size={14}/> Continuar</> : <><Pause size={14}/> Pausar</>}</button>
          <button className="ghost" onClick={restart}><RotateCcw size={14}/> Reiniciar</button>
        </div>
      </div>
    </div>}

    {phase==="done" && lastResult && <div className="levelDoneWrap">
      <div className="levelDoneIcon"><img src="/icons/icon-192.png" alt="Libano"/></div>
      <h3>Nivelamento concluído! 🎉</h3>
      <div className="levelDoneStats">
        <div className="levelDoneStat"><Trophy size={17}/><strong>{lastResult.solved}</strong><span>Questões resolvidas</span></div>
        <div className="levelDoneStat"><Target size={17}/><strong>{lastResult.pct}%</strong><span>Porcentagem de acerto</span></div>
        <div className="levelDoneStat"><Clock3 size={17}/><strong>{levelFmtTime(lastResult.seconds)}</strong><span>Tempo total</span></div>
      </div>
      <button className="add" onClick={()=>setPhase("config")}>Continuar</button>
    </div>}
  </div>;
}

function StudyGoals({entity, studyPdfsList=[], booksList=[], flashcardListsList=[]}){
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
                    {g.link_source==="flashcards"
                      ? <><Layers size={13}/> Vinculada aos flashcards · {(g.link_list_ids||[]).length} lista(s) (atualiza sozinha)</>
                      : <><FileText size={13}/> Vinculada ao {g.link_source==="livro"?"livro":"PDF de estudo"}
                          {g.link_page_start ? ` · pág. ${g.link_page_start}–${g.link_page_end}` : ""} (atualiza sozinha)</>}
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

    {modal && <StudyGoalModal goal={modal==="new"?null:modal} studyPdfsList={studyPdfsList} booksList={booksList} flashcardListsList={flashcardListsList} onClose={()=>setModal(null)} onSave={(payload)=>{
      if(modal==="new") add(payload); else update(modal.id, payload);
      setModal(null);
    }}/>}
  </div>;
}

function StudyGoalModal({goal, studyPdfsList=[], booksList=[], flashcardListsList=[], onClose, onSave}){
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
  const [linkListIds,setLinkListIds] = useState(goal?.link_list_ids || []);

  const linkOptions = linkSource==="livro" ? booksList : studyPdfsList;
  const linkedDoc = linkOptions.find(d=>d.id===linkPdfId);

  // Ao marcar/desmarcar uma lista de flashcards, o título da meta é preenchido sozinho no formato
  // Fazer os flashcards "Lista 1" "Lista 2" — o usuário ainda pode reescrever o título depois se quiser.
  const toggleLinkList = (id) => {
    setLinkListIds(ids => {
      const next = ids.includes(id) ? ids.filter(x=>x!==id) : [...ids, id];
      const names = flashcardListsList.filter(l=>next.includes(l.id)).map(l=>`"${l.title||"Lista sem título"}"`).join(" ");
      setTitle(next.length ? `Fazer os flashcards ${names}` : "");
      return next;
    });
  };

  const submit = (e) => {
    e.preventDefault();
    if(!title.trim()) return;

    const isLinked = mode==="count" && linkSource!=="none" && (
      linkSource==="flashcards" ? linkListIds.length>0 : (linkPdfId && linkPageStart && linkPageEnd)
    );

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
      link_list_ids: null,
    };

    if (isLinked && linkSource==="flashcards") {
      const target = linkListIds.length;
      const done = linkListIds.filter(id => flashcardListsList.find(l=>l.id===id)?.completed).length;
      payload.current_value = done;
      payload.target_value = target;
      payload.unit = "listas";
      payload.link_source = "flashcards";
      payload.link_list_ids = linkListIds;
      if (target>0 && done>=target) payload.status = "concluida";
    } else if (isLinked) {
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
        <label>Vincular a (opcional)
          <div className="modeToggle">
            <button type="button" className={linkSource==="none"?"active":""} onClick={()=>{setLinkSource("none"); setLinkPdfId("");}}>Nenhum</button>
            <button type="button" className={linkSource==="estudo"?"active":""} onClick={()=>{setLinkSource("estudo"); setLinkPdfId("");}}>PDF de estudo</button>
            <button type="button" className={linkSource==="livro"?"active":""} onClick={()=>{setLinkSource("livro"); setLinkPdfId("");}}>Livro (PDF)</button>
            <button type="button" className={linkSource==="flashcards"?"active":""} onClick={()=>setLinkSource("flashcards")}>Flashcards</button>
          </div>
        </label>

        {linkSource==="none" && <>
          <div className="fieldRow">
            <label>Valor atual<input type="number" min="0" value={currentValue} onChange={e=>setCurrentValue(e.target.value)} placeholder="0"/></label>
            <label>Meta<input type="number" min="0" value={targetValue} onChange={e=>setTargetValue(e.target.value)} placeholder="10"/></label>
          </div>
          <label>Unidade<input value={unit} onChange={e=>setUnit(e.target.value)} placeholder="Ex.: livros, questões"/></label>
        </>}

        {(linkSource==="estudo" || linkSource==="livro") && <>
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

        {linkSource==="flashcards" && <>
          <label>Listas de flashcards
            <div className="flashLinkList">
              {flashcardListsList.length===0 && <p className="fieldHint">Nenhuma lista de flashcards criada ainda.</p>}
              {flashcardListsList.map(l => (
                <label key={l.id} className="flashLinkCheckRow">
                  <input type="checkbox" checked={linkListIds.includes(l.id)} onChange={()=>toggleLinkList(l.id)}/>
                  <span>{l.title || "Lista sem título"}</span>
                  {l.completed && <CheckCircle2 size={13} className="flashLinkDoneIcon"/>}
                </label>
              ))}
            </div>
          </label>
          <p className="fieldHint">O título é preenchido sozinho com o nome das listas marcadas. A meta conclui automaticamente assim que todas elas forem estudadas (em qualquer modo: Cartões, Aprender ou Combinar).</p>
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
    if (document.fullscreenElement) document.exitFullscreen?.().catch(()=>{});
    onClose();
  };

  const modalRef = useRef(null);
  const [fullscreen, toggleFullscreen] = useFullscreen(modalRef);

  return (
    <div className="readerBack">
      <div ref={modalRef} className={"readerModal noteModal"+(fullscreen?" readerModalFull":"")}>
        <div className="readerHead">
          <input className="noteTitleInput" value={title} onChange={handleTitleChange} placeholder="Título da nota" autoFocus/>
          <button title={fullscreen?"Sair da tela cheia":"Tela cheia"} onClick={toggleFullscreen}>{fullscreen?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button>
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
