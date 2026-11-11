import { Flag, PartyPopper, Bell, Cake, Repeat2, Target } from "lucide-react";

export const WEEKDAY_LABELS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
export const MONTH_LABELS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
export const pad2 = n => String(n).padStart(2,"0");
// Horários de um lembrete: guardados como "08:00,12:00,20:00" (um só horário continua "08:00").
export function parseTimes(v){
  const out=[];
  String(v||"").split(/[,;\s]+/).forEach(t=>{
    const m=/^(\d{1,2}):(\d{2})$/.exec(t);
    if(m && +m[1]<24 && +m[2]<60){ const hm=pad2(m[1])+":"+m[2]; if(!out.includes(hm)) out.push(hm); }
  });
  return out.sort();
}
export const timesLabel = v => parseTimes(v).join(", ");

// dd/mm ou dd/mm/aaaa -> Date. Sem ano informado, usa o ano atual (ou o próximo, se a data já passou este ano).
export function parseReminderDate(dateStr){
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

export function daysUntil(dateStr){
  const d = parseReminderDate(dateStr);
  if(!d) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((d-today)/86400000);
}

// Para pagamentos fixos/recorrentes que só têm o "dia do mês" (sem data completa):
// calcula quantos dias faltam até a próxima ocorrência (este mês ou o próximo, se já passou).
export function daysUntilMonthlyDay(day){
  const d = Number(day);
  if(!d || Number.isNaN(d)) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  let target = new Date(today.getFullYear(), today.getMonth(), d);
  if(target < today) target = new Date(today.getFullYear(), today.getMonth()+1, d);
  return Math.round((target-today)/86400000);
}

// Metas de estudo guardam a data de conclusão em formato ISO (yyyy-mm-dd), diferente do DD/MM usado no resto do app.
export function daysUntilISO(dateStr){
  if(!dateStr) return null;
  const d = new Date(dateStr+"T00:00:00");
  if(Number.isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((d-today)/86400000);
}

export function urgencyClass(days){
  if(days===null || days===undefined) return "gray";
  if(days<=7) return "red";
  if(days<=20) return "yellow";
  return "green";
}

// Algoritmo de Gauss/Meeus para calcular a data da Páscoa em qualquer ano —
// a partir dela derivamos Carnaval, Sexta-feira Santa e Corpus Christi.
export function computeEaster(year){
  const a=year%19, b=Math.floor(year/100), c=year%100;
  const d=Math.floor(b/4), e=b%4, f=Math.floor((b+8)/25), g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30, i=Math.floor(c/4), k=c%4;
  const l=(32+2*e+2*i-h-k)%7, m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31), day=((h+l-7*m+114)%31)+1;
  return new Date(year, month-1, day);
}
export function addDaysToDate(date,n){ const d=new Date(date); d.setDate(d.getDate()+n); return d; }
export function nthWeekdayOfMonth(year, monthIdx, weekday, n){
  let d=new Date(year, monthIdx, 1), count=0;
  while(true){ if(d.getDay()===weekday){ count++; if(count===n) return d; } d.setDate(d.getDate()+1); }
}
export function lastWeekdayOfMonth(year, monthIdx, weekday){
  let d=new Date(year, monthIdx+1, 0);
  while(d.getDay()!==weekday) d.setDate(d.getDate()-1);
  return d;
}

// Feriados nacionais e datas comemorativas do Brasil, recalculados a cada ano exibido
// (os móveis dependem da Páscoa; "Dia das Mães"/"Dia dos Pais" dependem do dia da semana).
export function computeSpecialDays(year){
  const md = d => ({month:d.getMonth()+1, day:d.getDate()});
  const easter = computeEaster(year);
  return [
    {...md(new Date(year,0,1)), title:"Ano Novo", type:"holiday"},
    {...md(addDaysToDate(easter,-48)), title:"Carnaval (segunda-feira)", type:"event"},
    {...md(addDaysToDate(easter,-47)), title:"Carnaval", type:"holiday"},
    {...md(addDaysToDate(easter,-2)), title:"Sexta-feira Santa", type:"holiday"},
    {...md(easter), title:"Páscoa", type:"event"},
    {...md(new Date(year,3,21)), title:"Tiradentes", type:"holiday"},
    {...md(new Date(year,4,1)), title:"Dia do Trabalho", type:"holiday"},
    {...md(nthWeekdayOfMonth(year,4,0,2)), title:"Dia das Mães", type:"event"},
    {...md(addDaysToDate(easter,60)), title:"Corpus Christi", type:"holiday"},
    {month:6, day:12, title:"Dia dos Namorados", type:"event"},
    {...md(nthWeekdayOfMonth(year,7,0,2)), title:"Dia dos Pais", type:"event"},
    {month:7, day:26, title:"Dia dos Avós", type:"event"},
    {...md(new Date(year,8,7)), title:"Independência do Brasil", type:"holiday"},
    {...md(new Date(year,9,12)), title:"Nossa Sr.ª Aparecida / Dia das Crianças", type:"holiday"},
    {month:10, day:15, title:"Dia do Professor", type:"event"},
    {month:10, day:31, title:"Halloween", type:"event"},
    {...md(new Date(year,10,2)), title:"Finados", type:"holiday"},
    {...md(new Date(year,10,15)), title:"Proclamação da República", type:"holiday"},
    {...md(new Date(year,10,20)), title:"Consciência Negra", type:"holiday"},
    {...md(lastWeekdayOfMonth(year,10,5)), title:"Black Friday", type:"event"},
    {month:12, day:25, title:"Natal", type:"holiday"},
    {month:12, day:31, title:"Réveillon", type:"event"},
  ];
}

// Lembretes/aniversários guardam dd/mm (repete todo ano) ou dd/mm/aaaa (data única).
export function reminderMatchesDay(dateStr, year, month, day){
  if(!dateStr) return false;
  const parts = String(dateStr).split("/").map(p=>parseInt(p,10));
  if(parts.length<2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return false;
  const [d,m,y] = parts;
  if(y) return d===day && m===month && y===year;
  return d===day && m===month;
}
// ---- Lembretes recorrentes ----
// recurrence: "daily" (todo dia) | "weekly" (dias da semana em `weekdays`, ex.: "3" ou "1,3,5") |
// "monthly" (todo mês, no dia de `date`). Sem recurrence, vale o comportamento antigo (dd/mm).
const FULL_WEEKDAYS = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
const weekdaySet = (str) => String(str||"").split(",").filter(Boolean).map(n=>parseInt(n,10)).filter(n=>n>=0 && n<=6);
const monthlyDay = (dateStr) => { const d = parseInt(String(dateStr||"").split("/")[0],10); return d>=1 && d<=31 ? d : null; };

// Dias até a próxima ocorrência (0 = hoje). Para lembretes comuns usa a mesma conta de daysUntil.
export function reminderDaysUntil(r){
  if(r?.recurrence==="daily") return 0;
  if(r?.recurrence==="weekly"){
    const set = weekdaySet(r.weekdays);
    if(!set.length) return null;
    const dow = new Date().getDay();
    return Math.min(...set.map(d=>(d-dow+7)%7));
  }
  if(r?.recurrence==="monthly") return daysUntilMonthlyDay(monthlyDay(r.date));
  return daysUntil(r?.date);
}
export function reminderOccursOn(r, year, month, day){
  if(r.recurrence==="daily") return true;
  if(r.recurrence==="weekly") return weekdaySet(r.weekdays).includes(new Date(year, month-1, day).getDay());
  if(r.recurrence==="monthly") return monthlyDay(r.date)===day;
  return reminderMatchesDay(r.date, year, month, day);
}
// "Todo dia", "Toda quarta", "Seg, Qua e Sex", "Todo dia 15"... (vazio se o lembrete não repete)
export function recurrenceLabel(r){
  if(r?.recurrence==="daily") return "Todo dia";
  if(r?.recurrence==="weekly"){
    const set = weekdaySet(r.weekdays);
    if(set.length===1) return "Toda "+FULL_WEEKDAYS[set[0]]+(set[0]===0||set[0]===6?"":"-feira");
    return "Toda semana: "+set.map(n=>WEEKDAY_LABELS[n]).join(", ");
  }
  if(r?.recurrence==="monthly"){ const d = monthlyDay(r.date); return d ? "Todo dia "+d : "Todo mês"; }
  return "";
}
export function studyGoalMatchesDay(dueDate, year, month, day){
  return !!dueDate && dueDate===`${year}-${pad2(month)}-${pad2(day)}`;
}
export function calendarEventMatchesDate(weekdaysStr, dateObj){
  return String(weekdaysStr||"").split(",").filter(Boolean).map(n=>parseInt(n,10)).includes(dateObj.getDay());
}
export function formatWeekdaysLabel(weekdaysStr){
  return String(weekdaysStr||"").split(",").filter(Boolean).map(n=>WEEKDAY_LABELS[parseInt(n,10)]).join(", ");
}

export const CAL_TYPE_META = {
  holiday: {color:"#ff5c5c", label:"Feriado nacional", icon:Flag},
  event: {color:"#a06bff", label:"Data comemorativa", icon:PartyPopper},
  reminder: {color:"#3ecf6a", label:"Lembrete", icon:Bell},
  birthday: {color:"#f0b429", label:"Aniversário", icon:Cake},
  recurring: {color:"#4da3ff", label:"Recorrente", icon:Repeat2},
  goal: {color:"#ff7ad9", label:"Meta de estudo", icon:Target},
};

// Junta feriados/comemorações, lembretes, aniversários, eventos recorrentes e metas de
// estudo que caem num dia específico — usado tanto nos "pontinhos" do grid quanto no
// painel de detalhes do dia selecionado.
export function getDayEvents(year, month, day, {specialDays, reminders, calendarEvents, studyGoals}){
  const dateObj = new Date(year, month-1, day);
  const items = [];
  specialDays.filter(s=>s.month===month && s.day===day).forEach(s=>{
    items.push({id:"special-"+s.title, title:s.title, subtitle:s.type==="holiday"?"Feriado nacional":"Data comemorativa", type:s.type});
  });
  reminders.forEach(r=>{
    if(reminderOccursOn(r, year, month, day)){
      const isBday = r.kind==="Aniversário";
      items.push({id:"rem-"+r.id, title:r.title, subtitle:isBday?"Aniversário":((r.kind||"Lembrete")+(r.time?" · "+timesLabel(r.time):"")), type:isBday?"birthday":"reminder"});
    }
  });
  calendarEvents.forEach(e=>{
    if(calendarEventMatchesDate(e.weekdays, dateObj)){
      items.push({id:"cal-"+e.id, title:e.title, subtitle:"Recorrente"+(e.time?" · "+e.time:""), type:"recurring", recurringId:e.id});
    }
  });
  studyGoals.forEach(g=>{
    if(studyGoalMatchesDay(g.due_date, year, month, day)){
      items.push({id:"goal-"+g.id, title:g.title, subtitle:"Meta de estudo · conclui hoje", type:"goal"});
    }
  });
  return items;
}

export function buildMonthGrid(year, monthIdx){
  const startWeekday = new Date(year, monthIdx, 1).getDay();
  const daysInMonth = new Date(year, monthIdx+1, 0).getDate();
  const daysInPrevMonth = new Date(year, monthIdx, 0).getDate();
  const cells = [];
  for(let i=0;i<startWeekday;i++){
    cells.push({day:daysInPrevMonth-startWeekday+1+i, current:false, month:monthIdx===0?12:monthIdx, year:monthIdx===0?year-1:year});
  }
  for(let d=1; d<=daysInMonth; d++) cells.push({day:d, current:true, month:monthIdx+1, year});
  const totalCells = Math.ceil((startWeekday+daysInMonth)/7)*7;
  const trailing = totalCells-(startWeekday+daysInMonth);
  for(let d=1; d<=trailing; d++){
    cells.push({day:d, current:false, month:monthIdx===11?1:monthIdx+2, year:monthIdx===11?year+1:year});
  }
  return cells;
}

export function sortByProximity(list){
  return [...list].sort((a,b)=>{
    const da = reminderDaysUntil(a);
    const db = reminderDaysUntil(b);
    if(da===null && db===null) return 0;
    if(da===null) return 1;
    if(db===null) return -1;
    return da-db;
  });
}
