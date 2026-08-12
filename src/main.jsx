import React, {useMemo, useState, useEffect} from "react";
import {createRoot} from "react-dom/client";
import {
  LayoutDashboard, ArrowLeftRight, CreditCard, CircleDollarSign,
  CalendarClock, Bell, ListTodo, Bot, Plus, TrendingUp, TrendingDown,
  WalletCards, CheckCircle2, Clock3, Trash2, X, LogOut, Cloud, CloudOff,
  Cake, BookOpen, BookMarked, BookCheck, ChevronRight, ChevronDown
} from "lucide-react";
import "./styles.css";
import { supabase, cloudConfigured } from "./lib/supabaseClient";
import { useEntity } from "./lib/useEntity";
import { clearLocal } from "./lib/storage";
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

const initialTodos = [
  {id:1, text:"Comprar um relógio", done:false},
  {id:2, text:"Fazer um curso", done:false},
  {id:3, text:"Viajar para São Paulo", done:true},
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

function Root(){
  const {session, checking} = useSession();

  if(cloudConfigured && checking){
    return <div className="bootScreen">Carregando…</div>;
  }
  if(cloudConfigured && !session){
    return <Auth/>;
  }
  return <App session={session}/>;
}

function App({session}){
  const [page,setPage] = useState("Visão Geral");
  const [mobileOpen,setMobileOpen] = useState(false);
  const transactions = useEntity("transactions", initialTransactions, session, "desc");
  const fixed = useEntity("fixed_payments", initialFixed, session);
  const debts = useEntity("debts", initialDebts, session);
  const todos = useEntity("todos", initialTodos, session);
  const reminders = useEntity("reminders", initialReminders, session);
  const cardPurchases = useEntity("card_purchases", initialCardPurchases, session);
  const books = useEntity("books", initialBooks, session);
  const [showAdd,setShowAdd] = useState(false);

  const income = useMemo(()=>transactions.data.filter(x=>x.type==="in").reduce((a,b)=>a+b.value,0),[transactions.data]);
  const expense = useMemo(()=>transactions.data.filter(x=>x.type==="out").reduce((a,b)=>a+b.value,0),[transactions.data]);
  const balance = income-expense;
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
    ]},
    { type:"group", key:"lembretes", label:"Lembretes", icon:Bell, children:[
      { key:"Lembretes Comuns", label:"Lembretes comuns", icon:Bell },
      { key:"Aniversários", icon:Cake },
    ]},
    { type:"single", key:"Quero fazer", icon:ListTodo },
    { type:"group", key:"livros", label:"Livros", icon:BookOpen, children:[
      { key:"Livros Lidos", label:"Livros que já li", icon:BookCheck },
      { key:"Livros Para Ler", label:"Livros que quero ler", icon:BookMarked },
    ]},
  ];
  const [openGroups,setOpenGroups] = useState({financas:true});
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
      onMouseEnter={()=>setMobileOpen(true)}
      onMouseLeave={()=>setMobileOpen(false)}
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
        {cloudConfigured && session && <button className="resetData" onClick={()=>supabase.auth.signOut()}><LogOut size={14}/> Sair</button>}
        <button className="resetData" onClick={()=>{
          if(confirm(cloudConfigured && session ? "Isso limpa o cache local deste dispositivo (seus dados na nuvem continuam salvos). Continuar?" : "Isso vai apagar todos os dados salvos neste dispositivo. Continuar?")){
            clearLocal();
            location.reload();
          }
        }}><Trash2 size={14}/> Limpar dados locais</button>
      </div>
    </aside>

    <main onClick={()=>{ if(mobileOpen && window.innerWidth<=760) setMobileOpen(false); }}>
      <header><div><h1>{page}</h1><p>Terça-feira, 11 de agosto</p></div><button className="add" onClick={()=>setShowAdd(true)}><Plus size={19}/> Nova movimentação</button></header>

      {page==="Visão Geral" && <Dashboard balance={balance} income={income} expense={expense} cardBill={cardBill} debtRemaining={debtRemaining} fixedTotal={fixedTotal} reminders={reminders.data} todos={todos.data} setPage={setPage} askAI={askAI} aiInsight={aiInsight} aiLoading={aiLoading} aiError={aiError} aiAvailable={aiAvailable}/>}
      {page==="Movimentações" && <Transactions data={transactions.data} onDelete={transactions.remove}/>}
      {page==="Pagamentos Fixos" && <Fixed entity={fixed} total={fixedTotal}/>}
      {page==="Dívidas" && <Debts entity={debts} remaining={debtRemaining}/>}
      {page==="Cartões" && <Cards entity={cardPurchases} bill={cardBill}/>}
      {page==="Lembretes Comuns" && <CommonReminders entity={reminders}/>}
      {page==="Aniversários" && <Birthdays entity={reminders}/>}
      {page==="Quero fazer" && <Todos entity={todos}/>}
      {page==="Livros Lidos" && <BooksList entity={books} status="lido"/>}
      {page==="Livros Para Ler" && <BooksList entity={books} status="quero_ler"/>}

      {showAdd && <div className="modalBack"><form className="modal" onSubmit={addTransaction}>
        <div className="modalHead"><h2>Nova movimentação</h2><button type="button" onClick={()=>setShowAdd(false)}><X/></button></div>
        <label>Descrição<input name="desc" required placeholder="Ex.: Mercado"/></label>
        <label>Categoria<select name="cat"><option>Alimentação</option><option>Transporte</option><option>Assinaturas</option><option>Compras</option><option>Renda</option><option>Outros</option></select></label>
        <label>Valor<input name="value" required type="number" step="0.01" min="0.01" placeholder="0,00"/></label>
        <label>Tipo<select name="type"><option value="out">Saída</option><option value="in">Entrada</option></select></label>
        <button className="primary" type="submit">Adicionar</button>
      </form></div>}
    </main>
  </div>
}

function Dashboard({balance,income,expense,cardBill,debtRemaining,fixedTotal,reminders,todos,setPage,askAI,aiInsight,aiLoading,aiError,aiAvailable}){
 return <div className="content">
   <section className="stats">
    <Card title="Saldo atual" value={money(balance)} icon={<WalletCards/>} big/>
    <Card title="Entradas" value={money(income)} icon={<TrendingUp/>} positive/>
    <Card title="Gastos" value={money(expense)} icon={<TrendingDown/>}/>
    <Card title="Fatura do cartão" value={money(cardBill)} icon={<CreditCard/>}/>
   </section>
   <section className="grid2">
    <div className="panel"><div className="panelTitle"><h2>Resumo do mês</h2><span>Agosto</span></div>
      <div className="chart"><div className="bars">{[45,60,35,72,55,83,65,91,58,76,48,68].map((h,i)=><div key={i} className="barWrap"><div className="bar" style={{height:h+"%"}}></div><small>{i+1}</small></div>)}</div></div>
      <div className="legend"><span><i/>Entradas <b>{money(income)}</b></span><span><i/>Saídas <b>{money(expense)}</b></span></div>
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
    <div className="panel"><div className="panelTitle"><h2>Próximos lembretes</h2><button onClick={()=>setPage("Lembretes Comuns")}>Ver todos</button></div>{reminders.slice(0,3).map(r=><div className="row" key={r.id}><div className="rowIcon"><Bell size={17}/></div><div><b>{r.title}</b><small>{r.kind}</small></div><strong>{r.date}</strong></div>)}</div>
    <div className="panel"><div className="panelTitle"><h2>Quero fazer</h2><button onClick={()=>setPage("Quero fazer")}>Ver todos</button></div>{todos.slice(0,3).map(t=><div className="todoRow" key={t.id}><CheckCircle2 className={t.done?"done":""}/><span className={t.done?"doneText":""}>{t.text}</span></div>)}</div>
    <div className="panel mini"><h2>Saúde financeira</h2><div className="score">82<span>/100</span></div><div className="progress"><i style={{width:"82%"}}/></div><p>Boa! Seus gastos estão sob controle.</p></div>
   </section>
 </div>
}

function Card({title,value,icon,positive,big}){return <div className={"stat "+(big?"featured":"")}><div className="statIcon">{icon}</div><small>{title}</small><strong className={positive?"positive":""}>{value}</strong></div>}
function Transactions({data,onDelete}){return <div className="content"><div className="panel"><div className="panelTitle"><h2>Extrato</h2><span>{data.length} movimentações</span></div>{data.map(x=><div className="transaction" key={x.id}><div><b>{x.desc}</b><small>{x.cat} · {x.date}</small></div><strong className={x.type==="in"?"positive":""}>{x.type==="in"?"+":"-"} {money(x.value)}</strong><button onClick={()=>onDelete(x.id)}><Trash2 size={16}/></button></div>)}</div></div>}

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
    {data.map(x=><div className="panel debt" key={x.id}>
      <div className="panelTitle"><div><h2>{x.name}</h2><span>Próximo pagamento: {x.next}</span></div><b>{Math.round(x.paid/x.total*100)}%</b></div>
      <div className="progress"><i style={{width:(x.paid/x.total*100)+"%"}}/></div>
      <div className="debtNumbers"><span>Pago <b>{money(x.paid)}</b></span><span>Restante <b>{money(x.total-x.paid)}</b></span></div>
      <div className="debtActions"><button className="ghost" onClick={()=>pay(x)}>Registrar pagamento</button><button className="ghost danger" onClick={()=>remove(x.id)}><Trash2 size={14}/> Excluir</button></div>
    </div>)}
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
  const filtered = data.filter(x=>x.kind!=="Aniversário");
  const [title,setTitle]=useState(""); const [date,setDate]=useState(""); const [kind,setKind]=useState("Financeiro");
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
      {filtered.map(x=><div className="row reminder" key={x.id}><div className="rowIcon"><Bell size={18}/></div><div><b>{x.title}</b><small>{x.kind}</small></div><strong>{x.date}</strong><button onClick={()=>remove(x.id)}><Trash2 size={16}/></button></div>)}
      {filtered.length===0 && <p className="emptyHint">Nenhum lembrete por aqui ainda.</p>}
    </div>
  </div>
}

function Birthdays({entity}){
  const {data,add,remove} = entity;
  const filtered = data.filter(x=>x.kind==="Aniversário");
  const [title,setTitle]=useState(""); const [date,setDate]=useState("");
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
      {filtered.map(x=><div className="row reminder" key={x.id}><div className="rowIcon"><Cake size={18}/></div><div><b>{x.title}</b><small>Aniversário</small></div><strong>{x.date}</strong><button onClick={()=>remove(x.id)}><Trash2 size={16}/></button></div>)}
      {filtered.length===0 && <p className="emptyHint">Nenhum aniversário cadastrado ainda.</p>}
    </div>
  </div>
}

function BooksList({entity,status}){
  const {data,add,remove,update} = entity;
  const filtered = data.filter(x=>x.status===status);
  const [title,setTitle]=useState(""); const [author,setAuthor]=useState("");
  const submit=()=>{
    if(!title.trim()) return;
    add({title,author,status});
    setTitle("");setAuthor("");
  };
  const toggleStatus = (x)=>update(x.id, {status: status==="lido" ? "quero_ler" : "lido"});
  return <div className="content">
    <div className="panel">
      <div className="inlineAdd">
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Título do livro"/>
        <input value={author} onChange={e=>setAuthor(e.target.value)} placeholder="Autor (opcional)"/>
        <button onClick={submit}><Plus/></button>
      </div>
      {filtered.map(x=><div className="row reminder" key={x.id}>
        <div className="rowIcon">{status==="lido" ? <BookCheck size={18}/> : <BookMarked size={18}/>}</div>
        <div><b>{x.title}</b>{x.author && <small>{x.author}</small>}</div>
        <button className="ghost" onClick={()=>toggleStatus(x)}>{status==="lido" ? "Mover p/ quero ler" : "Marcar como lido"}</button>
        <button onClick={()=>remove(x.id)}><Trash2 size={16}/></button>
      </div>)}
      {filtered.length===0 && <p className="emptyHint">Nenhum livro por aqui ainda.</p>}
    </div>
  </div>
}

function Todos({entity}){
  const {data,add,remove,update} = entity;
  const [text,setText]=useState("");
  const submit=()=>{if(!text.trim())return;add({text,done:false});setText("")};
  return <div className="content"><div className="panel">
    <div className="todoAdd"><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Algo que você quer fazer..."/><button onClick={submit}><Plus/></button></div>
    {data.map(t=><div className="todoRow bigTodo" key={t.id}>
      <div className="todoMain" onClick={()=>update(t.id, {done:!t.done})}><CheckCircle2 className={t.done?"done":""}/><span className={t.done?"doneText":""}>{t.text}</span></div>
      <button onClick={()=>remove(t.id)}><Trash2 size={15}/></button>
    </div>)}
  </div></div>
}

createRoot(document.getElementById("root")).render(<Root/>);
