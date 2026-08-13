import React, {useMemo, useState, useEffect, useRef} from "react";
import {createRoot} from "react-dom/client";
import {
  LayoutDashboard, ArrowLeftRight, CreditCard, CircleDollarSign,
  CalendarClock, Bell, StickyNote, Bot, Plus, TrendingUp, TrendingDown,
  WalletCards, Clock3, Trash2, X, LogOut, Cloud, CloudOff,
  Cake, BookOpen, BookMarked, BookCheck, ChevronRight, ChevronDown, MoreVertical,
  Bold, Italic, Underline, AlignCenter, List, ListOrdered, CheckSquare, Smile, Target, PiggyBank, Repeat2,
  GraduationCap, Layers, Swords, BarChart3, Settings, Sun, Moon
} from "lucide-react";
import "./styles.css";
import { supabase, cloudConfigured } from "./lib/supabaseClient";
import { useEntity } from "./lib/useEntity";
import { clearLocal } from "./lib/storage";
import { pdfjsLib } from "./lib/pdf";
import { uploadBookFile, downloadBookFile, deleteBookFile } from "./lib/books";
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
  const budgets = useEntity("budgets", [], session);
  const goals = useEntity("goals", [], session);
  const recurring = useEntity("recurring_payments", [], session);
  const [showAdd,setShowAdd] = useState(false);
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

  const addTransaction = (e)=>{
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const value = Number(f.get("value"));
    transactions.add({
      desc:f.get("desc"), cat:f.get("cat"), value,
      type:f.get("type"), date:new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})
    });
    setShowAdd(false);
    e.currentTarget.reset();
  };

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
          balance, income, expense, fixedTotal, debtRemaining, cardBill,
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
        <div className="brandIcon">L</div>
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
      <header><div><h1>{page}</h1><p>{new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})}</p></div>{page==="Visão Geral" && <button className="add" onClick={()=>setShowAdd(true)}><Plus size={19}/> Nova movimentação</button>}</header>

      {page==="Visão Geral" && <Dashboard balance={balance} income={income} expense={expense} cardBill={cardBill} debtRemaining={debtRemaining} fixedTotal={fixedTotal} reminders={reminders.data} notes={notes.data} setPage={setPage} askAI={askAI} aiInsight={aiInsight} aiLoading={aiLoading} aiError={aiError} aiAvailable={aiAvailable} month={selectedMonth} setMonth={setSelectedMonth} budgets={budgets.data} goals={goals.data}/>}
      {page==="Movimentações" && <Transactions data={transactions.data} onDelete={transactions.remove}/>}
      {page==="Pagamentos Fixos" && <Fixed entity={fixed} total={fixedTotal}/>}
      {page==="Dívidas" && <Debts entity={debts} remaining={debtRemaining}/>}
      {page==="Cartões" && <Cards entity={cardPurchases} bill={cardBill}/>}
      {page==="Orçamento" && <Budgets entity={budgets} transactions={monthTransactions} month={selectedMonth}/>}
      {page==="Metas" && <Goals entity={goals}/>}
      {page==="Recorrentes" && <Recurring entity={recurring} transactions={transactions}/>}
      {page==="Lembretes Comuns" && <CommonReminders entity={reminders}/>}
      {page==="Aniversários" && <Birthdays entity={reminders}/>}
      {page==="Notas" && <Notes entity={notes}/>}
      {page==="Livros Lidos" && <BookShelf entity={books} status="lido" session={session}/>}
      {page==="Livros Para Ler" && <BookShelf entity={books} status="quero_ler" session={session}/>}
      {page==="Metas de Estudo" && <div className="content"><p className="emptyHint">Em breve.</p></div>}
      {page==="Flashcards" && <div className="content"><p className="emptyHint">Em breve.</p></div>}
      {page==="Desafios" && <div className="content"><p className="emptyHint">Em breve.</p></div>}
      {page==="Nivelamento" && <div className="content"><p className="emptyHint">Em breve.</p></div>}

      {showAdd && <div className="modalBack"><form className="modal" onSubmit={addTransaction}>
        <div className="modalHead"><h2>Nova movimentação</h2><button type="button" onClick={()=>setShowAdd(false)}><X/></button></div>
        <label>Descrição<input name="desc" required placeholder="Ex.: Mercado"/></label>
        <label>Categoria<select name="cat"><option>Alimentação</option><option>Transporte</option><option>Assinaturas</option><option>Compras</option><option>Renda</option><option>Outros</option></select></label>
        <label>Valor<input name="value" required type="number" step="0.01" min="0.01" placeholder="0,00"/></label>
        <label>Tipo<select name="type"><option value="out">Saída</option><option value="in">Entrada</option></select></label>
        <button className="primary" type="submit">Adicionar</button>
      </form></div>}

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

function Dashboard({balance,income,expense,cardBill,debtRemaining,fixedTotal,reminders,notes,setPage,askAI,aiInsight,aiLoading,aiError,aiAvailable,month,setMonth,budgets,goals}){
 return <div className="content">
   <div className="monthToolbar"><label>Mês analisado <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><span>{budgets.length} orçamento(s) · {goals.length} meta(s)</span></div><section className="stats">
    <Card title="Saldo atual" value={money(balance)} icon={<WalletCards/>} big/>
    <Card title="Entradas" value={money(income)} icon={<TrendingUp/>} positive/>
    <Card title="Gastos" value={money(expense)} icon={<TrendingDown/>} negative/>
    <Card title="Fatura do cartão" value={money(cardBill)} icon={<CreditCard/>}/>
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
    <div className="panel"><div className="panelTitle"><h2>Próximos lembretes</h2><button onClick={()=>setPage("Lembretes Comuns")}>Ver todos</button></div>{sortByProximity(reminders).slice(0,3).map(r=><div className="row" key={r.id}><div className="rowIcon"><Bell size={17}/></div><div><b>{r.title}</b><small>{r.kind}</small></div><strong>{r.date}</strong></div>)}</div>
    <div className="panel"><div className="panelTitle"><h2>Notas</h2><button onClick={()=>setPage("Notas")}>Ver todas</button></div>{notes.slice(0,3).map(n=><div className="row" key={n.id}><div className="rowIcon"><StickyNote size={17}/></div><div><b>{n.title}</b><small>{stripHtml(n.content)?.slice(0,40)||"Nota vazia"}</small></div></div>)}{notes.length===0 && <p className="emptyHint">Nenhuma nota ainda.</p>}</div>
    <div className="panel mini"><h2>Saúde financeira</h2><div className="score">82<span>/100</span></div><div className="progress"><i style={{width:"82%"}}/></div><p>Boa! Seus gastos estão sob controle.</p></div>
   </section>
 </div>
}

function Card({title,value,icon,positive,negative,big}){return <div className={"stat "+(big?"featured":"")}><div className="statIcon">{icon}</div><small>{title}</small><strong className={positive?"positive":(negative?"negative":"")}>{value}</strong></div>}
function Transactions({data,onDelete}){return <div className="content"><div className="panel"><div className="panelTitle"><h2>Extrato</h2><span>{data.length} movimentações</span></div>{data.map(x=><div className="transaction" key={x.id}><div><b>{x.desc}</b><small>{x.cat} · {x.date}</small></div><strong className={x.type==="in"?"positive":"negative"}>{x.type==="in"?"+":"-"} {money(x.value)}</strong><button onClick={()=>onDelete(x.id)}><Trash2 size={16}/></button></div>)}</div></div>}

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
        const scale = 260 / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
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
      <div className="progress"><i style={{width:progress+"%"}}/></div>
      <small className="bookProgressLabel">{progress}%</small>
    </div>
  );
}

function PdfReader({ book, onClose, onProgress, onNotesChange }) {
  const [pdf, setPdf] = useState(null);
  const [pageNum, setPageNum] = useState(book.current_page || 1);
  const [numPages, setNumPages] = useState(book.total_pages || 0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const notesBodyRef = useRef(null);
  const notesSaveTimer = useRef(null);

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
      const scale = Math.min(2.2, Math.max(0.3, (containerWidth - 24) / baseViewport.width));
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || !active) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
    })();
    return () => { active = false; };
  }, [pdf, pageNum]);

  const goTo = (n) => {
    const clamped = Math.max(1, Math.min(numPages || 1, n));
    setPageNum(clamped);
    onProgress(book.id, clamped);
  };

  // Carrega a nota salva desse livro sempre que o painel de notas é aberto
  useEffect(() => {
    if (notesOpen && notesBodyRef.current) {
      notesBodyRef.current.innerHTML = book.notes || "";
    }
  }, [notesOpen]);

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

  const handleClose = () => {
    if (notesOpen) flushNotes();
    onClose();
  };

  const toggleNotes = () => {
    setNotesOpen((o) => {
      if (o) flushNotes(); // fechando o painel: salva o que estiver pendente
      return !o;
    });
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowRight" && !notesOpen) goTo(pageNum + 1);
      if (e.key === "ArrowLeft" && !notesOpen) goTo(pageNum - 1);
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNum, numPages, notesOpen]);

  return (
    <div className="readerBack" onClick={handleClose}>
      <div className={`readerModal${notesOpen ? " readerModalWide" : ""}`} onClick={(e)=>e.stopPropagation()}>
        <div className="readerHead">
          <b>{book.title}</b>
          <div className="readerHeadActions">
            <button className={`ghost${notesOpen ? " active" : ""}`} onClick={toggleNotes}>
              <StickyNote size={15}/> <span>{notesOpen ? "Fechar notas" : "Notas"}</span>
            </button>
            <button onClick={handleClose}><X size={18}/></button>
          </div>
        </div>
        <div className="readerMain">
          <div className="readerBody" ref={containerRef}>
            {loading && <p className="readerHint">Abrindo PDF...</p>}
            {err && <p className="readerHint">{err}</p>}
            {!loading && !err && <canvas ref={canvasRef} className="readerCanvas" onClick={()=>goTo(pageNum+1)}/>}
          </div>
          {notesOpen && (
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

function BookShelf({ entity, status, session }) {
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
      await add({ id, title, status, file_path: filePath, total_pages: totalPages, current_page: 1 });
    } catch (err) {
      console.error(err);
      alert("Não foi possível enviar o PDF: " + (err.message || err));
    } finally {
      setUploading(false);
    }
  };

  const onProgress = (bookId, page) => {
    clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => { update(bookId, { current_page: page }); }, 400);
  };

  const onNotesChange = (bookId, content) => {
    update(bookId, { notes: content });
  };

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
      {readingBook && <PdfReader book={readingBook} onClose={()=>setReadingBook(null)} onProgress={onProgress} onNotesChange={onNotesChange}/>}
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

function Recurring({entity,transactions}){
  const {data,add,remove}=entity; const [name,setName]=useState(""); const [value,setValue]=useState(""); const [cat,setCat]=useState("Assinaturas"); const [day,setDay]=useState("");
  const submit=()=>{if(!name.trim()||!value||!day)return;add({name,value:Number(value),cat,day:Number(day),type:"out"});setName("");setValue("");setDay("");};
  return <div className="content"><div className="panel"><div className="panelTitle"><h2>Pagamentos recorrentes</h2><span>Modelo para gerar despesas mensais</span></div><div className="inlineAdd"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Netflix"/><input value={value} onChange={e=>setValue(e.target.value)} type="number" step="0.01" min="0" placeholder="Valor"/><input value={day} onChange={e=>setDay(e.target.value)} type="number" min="1" max="31" placeholder="Dia"/><button onClick={submit}><Plus/></button></div></div><div className="panel">{data.map(x=><div className="transaction" key={x.id}><div><b>{x.name}</b><small>{x.cat} · todo dia {x.day}</small></div><strong>{money(x.value)}</strong><button onClick={()=>remove(x.id)}><Trash2 size={16}/></button></div>)}{!data.length&&<p className="emptyHint">Cadastre assinaturas e contas mensais aqui.</p>}</div></div>;
}

function Notes({entity}){
  const { data, add, remove, update, reorder } = entity;
  const [openMenuId, setOpenMenuId] = useState(null);
  const [activeNote, setActiveNote] = useState(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState(null);

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
    bodyRef.current?.focus();
    document.execCommand(
      "insertHTML",
      false,
      '<div class="checklist-item"><span class="check-box" contenteditable="false"></span><span class="check-text">Novo item</span></div><br>'
    );
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
        </div>
        <div className="noteEditorBody" onClick={() => setEmojiOpen(false)}>
          <div
            ref={bodyRef}
            className="noteTextarea noteRichBody"
            contentEditable
            suppressContentEditableWarning
            onInput={handleBodyInput}
            onClick={handleBodyClick}
            data-placeholder="Escreva o que quiser..."
          />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Root/>);
