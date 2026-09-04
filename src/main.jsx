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
  ClipboardList, Dumbbell, Star, Flag, Brain, Hourglass, CheckCircle2, Filter, Pencil, RotateCcw, ThumbsUp, ThumbsDown,
  Download, Search, ZoomIn, ZoomOut, Maximize2, Minimize2, Bookmark, ArrowRight, Folder, FolderPlus, ImagePlus,
  ChevronLeft, Check, Zap, Lightbulb, LayoutGrid, Sparkles, Trophy,
  PenTool, Eraser, Highlighter, Undo2, Redo2, MousePointer2, Type, Square, Circle, Minus, ArrowUpRight, Eye, EyeOff,
  Box, Cylinder, Pyramid, Cone, Globe,
  Upload, Popcorn, Clapperboard, Play, Pause, Gamepad2,
  Film, Link2, SkipBack, SkipForward, ArrowUp, ArrowDown, ChevronUp,
  ShoppingCart, ExternalLink, PictureInPicture2, Landmark, RefreshCw, FilePlus2, Hand, Crosshair, Lasso, ArrowLeft,
  CalendarDays, PartyPopper, XCircle, CalendarPlus, Flame, Users,
  Tags, Palette, ArchiveRestore, Archive, PaintBucket, AlignLeft, AlignRight, AlignJustify,
  ImageIcon, Copy, ClipboardPaste, Sparkle, Library, ListTree, FolderInput, ImageOff, WifiOff, Lock, AlertTriangle,
  Megaphone, Volume2, PieChart, LineChart, AreaChart, Radar, ScatterChart, Grid3x3,
  Mic, Headphones
} from "lucide-react";
import "./styles.css";
import { supabase, cloudConfigured } from "./lib/supabaseClient";
import { getPluggyConnectToken, syncPluggyItem } from "./lib/bank";
import { createInviteCode, acceptInviteCode, getMyPartners } from "./lib/partners";
import { useEntity } from "./lib/useEntity";
import { useTransactions } from "./lib/useTransactions";
import { clearLocal, usePersistentState, loadLocal, saveLocal, removeLocalKey } from "./lib/storage";
import { hashPin } from "./lib/lock";
import pkg from "../package.json";
import { idbGet, idbSet } from "./lib/idbStorage";
import { clearAllPdfCache } from "./lib/pdfCache";
import { useCachedImageUrl, clearAllImageCache } from "./lib/imageCache";
import { pdfjsLib, pdfWasmUrl } from "./lib/pdf";
import { downloadNotePdf, downloadAllNotesPdf } from "./lib/notesPdf";
import { jsPDF } from "jspdf";
import { uploadBookFile, downloadBookFile, deleteBookFile, peekCachedBookFile, getBookFileUrl, optimizeExistingBookFile } from "./lib/books";
import { uploadStudyPdfFile, downloadStudyPdfFile, deleteStudyPdfFile, optimizeExistingStudyPdfFile } from "./lib/studyPdfs";
import { listPdfAudios, getPdfAudioBlob, addPdfAudio, renamePdfAudio, deletePdfAudio, optimizeAllPdfAudios } from "./lib/pdfAudios";
import { recordingAudioBitsPerSecond } from "./lib/audioOptimize";
import { useReadingStats, currentMonthKey } from "./lib/readingStats";
import { createBlankPdfBlob } from "./lib/pdfPages";
import { renderCoverThumbFromDoc } from "./lib/pdfThumb";
import {
  strokeOutlinePath, detectShapeFromPoints, hitTestAnnotation, findAnnotationAt, annotationBBox,
  translateAnnotation, resizeShapeAnnotation, scaleAnnotationFromAnchor, eraseAnnotationAtPoint, exportAnnotatedPdf, drawAnnotationOnCanvas,
  shape3DGeometry,
} from "./lib/annotations";
import Auth, { ResetPassword } from "./Auth";
import { money, maskMoney, timeAgo, formatBytes, todayIsoDate, formatTxDate } from "./lib/format";
import {
  WEEKDAY_LABELS, MONTH_LABELS, pad2, parseReminderDate, daysUntil, daysUntilMonthlyDay,
  daysUntilISO, urgencyClass, computeSpecialDays, reminderMatchesDay, studyGoalMatchesDay,
  calendarEventMatchesDate, formatWeekdaysLabel, CAL_TYPE_META, getDayEvents, buildMonthGrid,
  sortByProximity,
} from "./lib/calendar";
import { useFullscreen, useSession, useTheme, useDismissedToday } from "./hooks";
import {
  playNotifSound, requestNotificationPermission, fireBrowserNotification, toast,
  syncLinkedGoalsProgress, syncLinkedFlashcardGoalsProgress, markFlashcardListStudied,
} from "./lib/notifications";
import { ReminderCard, ToastHost, notifIcon, NOTIF_KIND_DEFS, NotificationsBell, HandwritingPad } from "./components/shared";
import { LanguagePicker } from "./components/languagePicker";
import { languageName } from "./lib/languages";
import { speak, ttsSupported } from "./lib/tts";
import { fetchTranslationSuggestions } from "./lib/translate";
import { uploadFlashcardImage, deleteFlashcardImage } from "./lib/flashcardImages";
import { uploadShoppingImage, deleteShoppingImage } from "./lib/shoppingImages";
import { uploadMediaItemImage, deleteMediaItemImage, uploadMediaGroupCover, deleteMediaGroupCover } from "./lib/mediaImages";
import { uploadGameItemImage, deleteGameItemImage, uploadGameGroupCover, deleteGameGroupCover } from "./lib/gameImages";
import { uploadWorkoutFolderCover, deleteWorkoutFolderCover } from "./lib/workoutImages";
import { uploadBookGroupCover, deleteBookGroupCover } from "./lib/bookGroupImages";
import { uploadStudyPdfGroupCover, deleteStudyPdfGroupCover } from "./lib/studyPdfGroupImages";

// ---------------------------------------------------------------------
// Modo economia de egress: quando ligado (Configurações), o app evita
// carregar imagens que vêm de um bucket público do Supabase Storage
// (capas de pastas, fotos de flashcard/compras/mídia/jogos, gifs de
// treino) — cada uma delas é uma requisição de rede paga em egress toda
// vez que a tela é aberta. Não afeta a capa de livros/PDFs de estudo
// (cover_thumb), que já vem embutida como base64 na própria linha do
// banco e não custa uma requisição extra; só evita o fallback que baixa
// o PDF inteiro pra gerar essa capa quando ela ainda não existe.
const EgressSaverContext = React.createContext(false);

// Substitui os pares "{src ? <img src={src}/> : <Fallback/>}" espalhados
// pelo app: com o modo economia ligado, nunca chega a montar a tag <img>
// (senão o navegador dispara o request de qualquer forma).
function SaverImg({ src, alt, fallback, className, wrapClassName }) {
  const saver = React.useContext(EgressSaverContext);
  const cachedSrc = useCachedImageUrl(saver ? null : src);
  if (!src || saver || !cachedSrc) return fallback || null;
  const img = <img src={cachedSrc} alt={alt || ""} className={className} />;
  return wrapClassName ? <div className={wrapClassName}>{img}</div> : img;
}

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
const STUDY_ICONS = { target:Target, book:BookOpen, list:ClipboardList, dumbbell:Dumbbell, star:Star, flag:Flag, brain:Brain, flame:Flame };

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

// Opções da "Tela inicial" (Configurações) — mesmas páginas do navTree, numa
// lista plana com o rótulo já resolvido, pra alimentar o <select>. Mantida
// separada do navTree (que é montado dentro do App) porque esse aqui não
// depende de nenhum estado do componente.
const HOME_PAGE_OPTIONS = [
  { group: "Finanças", pages: ["Visão Geral","Movimentações","Pagamentos Fixos","Dívidas","Cartões","Orçamento","Metas","Recorrentes",{key:"Lista de Compras", label:"Lista de compras"}] },
  { group: "Lembretes", pages: [{key:"Lembretes Comuns", label:"Lembretes comuns"},"Aniversários"] },
  { group: "Geral", pages: ["Calendário","Notas","Gráfico"] },
  { group: "Livros", pages: [{key:"Biblioteca", label:"Dashboard da biblioteca"},{key:"Livros Lendo", label:"Lendo agora"},{key:"Livros Lidos", label:"Livros que já li"},{key:"Livros Para Ler", label:"Livros que quero ler"}] },
  { group: "Área de Estudos", pages: [{key:"Metas de Estudo", label:"Metas"},"Flashcards","Nivelamento","Leitor de PDF"] },
  { group: "Área de Lazer", pages: ["Treino","Filmes e Séries","Jogos"] },
];

function Root(){
  const {session, checking, recovery} = useSession();
  const [theme,setTheme] = useTheme();
  const [pinHash, setPinHash] = usePersistentState("libano-app-pin-hash", null);
  // Autotrava por inatividade: 0 = "Nunca" (só o padrão, PIN pedido ao abrir/
  // recarregar). Só a Configurações mexe nesse valor, só faz efeito se
  // também houver um PIN definido.
  const [autoLockMinutes, setAutoLockMinutes] = usePersistentState("libano-auto-lock-minutes", 0);
  const [unlocked, setUnlocked] = useState(false);

  // Cronômetro de inatividade: reseta em qualquer interação enquanto a tela
  // está visível. Ao sair do app (troca de aba/app, tela apagada) marca o
  // instante da saída em vez de resetar — assim o tempo fora conta como
  // inatividade, e ao voltar (visibilitychange) já confere de uma vez, já
  // que um setTimeout sozinho pode ficar pausado em segundo plano.
  const lastActivityRef = useRef(Date.now());
  useEffect(() => {
    if (!pinHash || !autoLockMinutes || !unlocked) return;
    const thresholdMs = autoLockMinutes * 60000;
    const markActivity = () => { lastActivityRef.current = Date.now(); };
    const checkIdle = () => {
      if (Date.now() - lastActivityRef.current >= thresholdMs) setUnlocked(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") checkIdle();
      else markActivity();
    };
    markActivity();
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach(ev => window.addEventListener(ev, markActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    const interval = setInterval(checkIdle, 15000);
    return () => {
      events.forEach(ev => window.removeEventListener(ev, markActivity));
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
    };
  }, [pinHash, autoLockMinutes, unlocked]);

  if(cloudConfigured && checking){
    return <div className="bootScreen">Carregando…</div>;
  }
  // Prioridade sobre o app normal: mesmo já autenticado pelo link de
  // recuperação, o usuário precisa definir a nova senha antes de continuar.
  if(cloudConfigured && recovery){
    return <ResetPassword/>;
  }
  if(cloudConfigured && !session){
    return <Auth/>;
  }
  // PIN local (ver src/lib/lock.js): pedido de novo a cada abertura/recarga
  // do app neste aparelho, mesmo já logado na nuvem — é uma camada separada
  // da conta, guardada só neste dispositivo.
  if(pinHash && !unlocked){
    return <LockScreen pinHash={pinHash} onUnlock={()=>setUnlocked(true)}/>;
  }
  return <App session={session} theme={theme} setTheme={setTheme} pinHash={pinHash} setPinHash={setPinHash} autoLockMinutes={autoLockMinutes} setAutoLockMinutes={setAutoLockMinutes}/>;
}

function LockScreen({ pinHash, onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pin.length < 4 || checking) return;
    setChecking(true);
    const hash = await hashPin(pin);
    setChecking(false);
    if (hash === pinHash) {
      onUnlock();
    } else {
      setError(true);
      setPin("");
      setTimeout(() => setError(false), 1400);
    }
  };

  const forgotPin = () => {
    if (!confirm("Isso remove o PIN deste aparelho — seus dados continuam salvos, só o bloqueio de tela some. Continuar?")) return;
    removeLocalKey("libano-app-pin-hash");
    location.reload();
  };

  return (
    <div className="bootScreen">
      <form className="modal lockScreenModal" onSubmit={submit}>
        <div className="lockScreenIcon"><Lock size={24}/></div>
        <h2>App bloqueado</h2>
        <p className="authSub">Digite o PIN pra continuar.</p>
        <input
          type="password" inputMode="numeric" autoFocus
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          className={"lockScreenPinInput" + (error ? " lockScreenError" : "")}
          placeholder="••••"
        />
        {error && <small className="lockScreenErrorMsg">PIN incorreto.</small>}
        <button className="primary" type="submit" disabled={pin.length < 4 || checking}>Entrar</button>
        <button type="button" className="ghost" onClick={forgotPin}>Esqueci meu PIN</button>
      </form>
    </div>
  );
}

// Confirmação por senha da conta antes de ações da zona de risco (sair da
// conta / limpar dados locais). Reautentica com signInWithPassword só pra
// validar — não navega nem altera a sessão além do necessário.
function AccountPasswordConfirmModal({ email, title, message, confirmLabel, onClose, onConfirmed }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onConfirmed();
    } catch (err) {
      setError("Senha incorreta. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modalBack" onClick={onClose}>
      <form className="modal" onSubmit={submit} onClick={e=>e.stopPropagation()}>
        <div className="modalHead"><h2><AlertTriangle size={16}/> {title}</h2><button type="button" onClick={onClose}><X/></button></div>
        <p className="boardSettingsHint" style={{marginTop:-4}}>{message}</p>
        <label>Senha da conta ({email})
          <div style={{position:"relative"}}>
            <input
              autoFocus
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={e=>{ setPassword(e.target.value); setError(null); }}
              placeholder="Digite sua senha"
              style={{paddingRight:34}}
            />
            <button
              type="button"
              className="ghost"
              onClick={()=>setShowPassword(s=>!s)}
              title={showPassword ? "Ocultar senha" : "Mostrar senha"}
              style={{position:"absolute", right:2, top:2, padding:4}}
            >
              {showPassword ? <EyeOff size={14}/> : <Eye size={14}/>}
            </button>
          </div>
        </label>
        {error && <div className="authMessage">{error}</div>}
        <div className="modalActions">
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="danger" disabled={busy || !password}>{busy ? "Verificando..." : confirmLabel}</button>
        </div>
      </form>
    </div>
  );
}

// Modal "Novas atualizações!" — mostrada sozinha quando o app encontra publicações
// mais novas que a última vista neste aparelho, e também sob demanda (sininho de
// novidades no cabeçalho, ou "Ver atualizações anteriores" nas Configurações).
// `updates` já vem ordenado do mais novo pro mais antigo (useEntity ..., "desc").
function AppUpdatesModal({ updates, loading, onClose }) {
  return (
    <div className="modalBack" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modalHead"><h2><Megaphone size={17}/> Novas atualizações!</h2><button type="button" onClick={onClose}><X/></button></div>
        {loading && updates.length===0 && <p className="emptyHint">Carregando...</p>}
        {!loading && updates.length===0 && <p className="emptyHint">Nenhuma atualização publicada ainda.</p>}
        <div className="updatesList">
          {updates.map(u => (
            <div key={u.id} className="updateEntry">
              <div className="updateEntryHead">
                {u.version && <b>{u.version}</b>}
                <small>{new Date(u.created_at).toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"})}</small>
              </div>
              <ul>
                {(u.items||[]).map((it,i)=><li key={i}>{it}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <button className="add" onClick={onClose}>Entendi</button>
      </div>
    </div>
  );
}

// Formulário de publicação (Configurações → "Publicar atualização"): versão
// opcional + um item de changelog por linha. Vira uma linha em app_updates,
// visível pra todo mundo que usa o app (ver schema.sql).
function PublishUpdateForm({ onPublish }) {
  const [version, setVersion] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const items = text.split("\n").map(l=>l.trim()).filter(Boolean);
    if (items.length===0 || busy) return;
    setBusy(true);
    try {
      await onPublish({ version: version.trim() || null, items });
      setVersion(""); setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{display:"grid", gap:8}}>
      <label>Versão (opcional)
        <input value={version} onChange={e=>setVersion(e.target.value)} placeholder="ex.: v1.4"/>
      </label>
      <label>O que mudou (um item por linha)
        <textarea
          rows={4}
          value={text}
          onChange={e=>setText(e.target.value)}
          placeholder={"Novo botão xxx no leitor de PDF\nCorrigido o bug que fazia xxx"}
        />
      </label>
      <button type="submit" className="add" disabled={busy || !text.trim()}>{busy ? "Publicando..." : "Publicar"}</button>
    </form>
  );
}

function App({session,theme,setTheme,pinHash,setPinHash,autoLockMinutes,setAutoLockMinutes}){
  // Tela inicial (Configurações): a página com que o app abre. Só lê o valor
  // salvo uma vez, na montagem — depois disso "page" navega normalmente e
  // não volta a seguir esse valor até o app ser reaberto/recarregado.
  const [homePage, setHomePage] = usePersistentState("libano-home-page", "Visão Geral");
  const [page,setPage] = useState(homePage);
  // Abas já abertas nesta sessão do app. Usado para adiar (useEntity opts.enabled)
  // a primeira busca das tabelas de abas "pesadas" (Filmes e Séries, Jogos, Treino)
  // até a pessoa realmente entrar nelas, em vez de baixar tudo já na abertura do app.
  const [visitedPages, setVisitedPages] = useState(() => new Set([homePage]));
  useEffect(() => {
    setVisitedPages((prev) => (prev.has(page) ? prev : new Set(prev).add(page)));
  }, [page]);
  const [openNoteId,setOpenNoteId] = useState(null);
  const [mobileOpen,setMobileOpen] = useState(false);
  // Em telas touch o navegador dispara mouseenter/mouseleave "fantasmas" no primeiro toque,
  // o que conflitava com o botão de abrir/fechar. Só reagimos ao hover em dispositivos que de fato têm mouse.
  const canHover = () => typeof window!=="undefined" && window.matchMedia && window.matchMedia("(hover:hover) and (pointer:fine)").matches;
  const transactions = useTransactions(session, initialTransactions);
  const fixed = useEntity("fixed_payments", initialFixed, session);
  const debts = useEntity("debts", initialDebts, session);
  // Listagem enxuta (sem "content", que é o HTML inteiro da nota — só
  // importa quando ela é aberta). Ver useEntity/fetchFull, que completa a
  // linha inteira nesse momento, igual já acontece com livros/PDFs.
  const notes = useEntity("notes", initialNotes, session, "asc", {orderable:true, listSelect: "id,title,tags,preview,sort_order,updated_at,deleted_at,created_at"});
  const reminders = useEntity("reminders", initialReminders, session);
  const cardPurchases = useEntity("card_purchases", initialCardPurchases, session);
  // Livros e PDFs de estudo carregam cover_thumb (capa em JPEG base64) pra
  // cada item já na listagem — então, igual Treino/Filmes/Jogos, adiamos a
  // primeira busca até a pessoa entrar numa aba que realmente usa esses
  // dados, em vez de baixar todas as capas toda vez que o app abre.
  const livrosVisitado = visitedPages.has("Biblioteca") || visitedPages.has("Livros Lendo") || visitedPages.has("Livros Lidos") || visitedPages.has("Livros Para Ler") || visitedPages.has("Metas de Estudo");
  const pdfEstudoVisitado = visitedPages.has("Leitor de PDF") || visitedPages.has("Metas de Estudo");
  // Listagem enxuta (sem notes/drawings/highlights/favorite_excerpts — texto
  // e JSON que só importam quando o item é aberto no leitor). Ver
  // useEntity/fetchFull, que completa a linha inteira nesse momento.
  const books = useEntity("books", initialBooks, session, "asc", {orderable:true, listSelect: "id,title,status,file_path,total_pages,current_page,favorite_pages,important_pages,cover_thumb,group_id,sort_order,created_at", enabled: livrosVisitado});
  const bookGroups = useEntity("book_groups", [], session, "asc", {orderable:true, enabled: livrosVisitado});
  const readingStats = useReadingStats(session);
  const studyPdfs = useEntity("study_pdfs", initialStudyPdfs, session, "asc", {orderable:true, listSelect: "id,title,file_path,total_pages,current_page,favorite_pages,important_pages,group_id,cover_thumb,sort_order,created_at", enabled: pdfEstudoVisitado});
  const studyPdfGroups = useEntity("study_pdf_groups", [], session, "asc", {orderable:true, enabled: pdfEstudoVisitado});
  // Flashcards soltos (criados a partir de um trecho selecionado no Leitor
  // de PDF, fora de uma lista) só são exibidos dentro da própria aba
  // Flashcards — então adiamos a primeira busca até ela ser visitada nesta
  // sessão, em vez de baixar todos eles toda vez que o app abre. O botão
  // "Criar flashcard" do Leitor de PDF continua funcionando normalmente:
  // ele só grava (flashcards.add), não depende de flashcards.data.
  const flashcardsVisitado = visitedPages.has("Flashcards");
  // Listas de flashcards também são lidas por "Metas de Estudo" (pra linkar
  // uma meta a uma lista) — por isso o gate inclui as duas abas, igual já
  // acontece com livrosVisitado/pdfEstudoVisitado acima. Gatear só por
  // "Flashcards" deixaria a Metas de Estudo sem essas listas até a pessoa
  // abrir Flashcards ao menos uma vez na sessão.
  const flashcardsOuMetasVisitado = flashcardsVisitado || visitedPages.has("Metas de Estudo");
  const studyFlashcards = useEntity("study_flashcards", [], session, "asc", {enabled: flashcardsVisitado});
  const studyFlashcardLists = useEntity("study_flashcard_lists", [], session, "asc", {
    orderable: true,
    // A listagem (grade de listas) só precisa desses campos pra mostrar o
    // título/descrição/contagem — o jsonb `cards` (que pode ter fotos e HTML
    // pesado) só é buscado com fetchFull(), no momento de estudar ou editar
    // uma lista específica. Isso evita rebaixar todas as fotos/termos de
    // todas as listas toda vez que a aba Flashcards é aberta.
    listSelect: "id,title,description,folder_id,sort_order,created_at,completed,term_lang,definition_lang,card_count",
    enabled: flashcardsOuMetasVisitado,
  });
  // Só usada dentro da própria aba Flashcards (organização em pastas) e na
  // exportação de dados — mesmo comportamento que Treino/Filmes/Jogos já têm.
  const studyFlashcardFolders = useEntity("study_flashcard_folders", [], session, "asc", {orderable:true, enabled: flashcardsVisitado});
  const budgets = useEntity("budgets", [], session);
  const goals = useEntity("goals", [], session);
  const recurring = useEntity("recurring_payments", [], session);
  const studyGoals = useEntity("study_goals", initialStudyGoals, session);
  // Aba "Gráfico": afazeres cadastrados pela pessoa (ex.: Livros, Inglês,
  // Matemática) e os registros de quais deles foram feitos em cada dia.
  // As três só são lidas dentro de ActivityChartPage — adiadas até a pessoa
  // abrir a aba Gráfico nesta sessão, em vez de baixadas toda vez que o
  // app abre (activity_tracker_logs em especial só cresce com o tempo).
  const graficoVisitado = visitedPages.has("Gráfico");
  const activityItems = useEntity("activity_tracker_items", [], session, "asc", {orderable:true, enabled: graficoVisitado});
  const activityLogs = useEntity("activity_tracker_logs", [], session, "asc", {enabled: graficoVisitado});
  // Tarefas ("afazeres") de fato: texto + categoria (activity_tracker_items)
  // + status feito/pendente. É a partir delas que a aba Gráfico monta a
  // lista de pendentes/concluídos e os gráficos por categoria.
  const activityTodos = useEntity("activity_tracker_todos", [], session, "asc", {enabled: graficoVisitado});
  // Treino, Filmes e Séries e Jogos só são usados dentro da própria aba (o
  // resumo pra IA lê .data, mas tudo bem se vier vazio até a aba ser aberta)
  // — então adiamos a primeira busca até a pessoa realmente entrar em cada
  // uma, em vez de baixar as 6 tabelas toda vez que o app abre.
  const treinoVisitado = visitedPages.has("Treino");
  const filmesVisitado = visitedPages.has("Filmes e Séries");
  const jogosVisitado = visitedPages.has("Jogos");
  const workoutFolders = useEntity("workout_folders", [], session, "asc", {orderable:true, enabled: treinoVisitado});
  const workoutExercises = useEntity("workout_exercises", [], session, "asc", {orderable:true, enabled: treinoVisitado});
  // Lista de compras: usada na própria aba e também no preview "Quadro
  // possível" do Dashboard (Visão Geral) — por isso a busca é adiada até
  // uma dessas duas telas ser visitada nesta sessão, em vez de sempre na
  // abertura do app. Como a Visão Geral costuma ser a tela inicial padrão,
  // isso não muda o comportamento pra quem abre o app nela; só evita a
  // busca de quem definiu outra tela como inicial e não passa por nenhuma
  // das duas.
  const shoppingItemsVisitado = visitedPages.has("Lista de Compras") || visitedPages.has("Visão Geral");
  const shoppingItems = useEntity("shopping_items", [], session, "asc", {orderable:true, enabled: shoppingItemsVisitado});
  const mediaGroups = useEntity("media_groups", [], session, "asc", {orderable:true, enabled: filmesVisitado});
  // Obs.: "seasons" (progresso por temporada) fica de fora do listSelect só
  // não dá pra fazer aqui como em livros/PDFs — a própria linha da prateleira
  // usa "seasons" pra mostrar a % assistida e pro botão "+1 episódio", então
  // teria que estar sempre carregado mesmo na listagem.
  const mediaItems = useEntity("media_items", [], session, "asc", {orderable:true, enabled: filmesVisitado});
  const gameGroups = useEntity("game_groups", [], session, "asc", {orderable:true, enabled: jogosVisitado});
  const gameItems = useEntity("game_items", [], session, "asc", {orderable:true, enabled: jogosVisitado});
  // Não dá pra adiar por página como Treino/Filmes/Jogos: o sino de
  // notificações lê calendarEvents.data em qualquer aba (ver useMemo de
  // notifItems mais abaixo), então gatear por "Calendário visitado"
  // deixaria os avisos de evento recorrente sumidos até a pessoa abrir o
  // Calendário. A tabela também não tem coluna pesada pra cortar via
  // listSelect. TTL mais longo em vez disso: evento recorrente muda raramente,
  // então não faz sentido reconsultar a cada 15min como dado financeiro.
  const calendarEvents = useEntity("calendar_recurring_events", [], session, "asc", { ttlMs: 6 * 60 * 60 * 1000 });
  // Novidades do app: qualquer conta pode publicar (ver Configurações → "Publicar
  // atualização"), e todas as contas enxergam a mesma lista (RLS de app_updates
  // libera leitura pra qualquer usuário autenticado — ver schema.sql). Cada
  // aparelho guarda localmente até quando já viu (lastSeenUpdateAt) e mostra a
  // modal "Novas atualizações!" sozinha quando encontra algo mais novo.
  const appUpdates = useEntity("app_updates", [], session, "desc");
  // app_updates só busca uma vez, na abertura do app — diferente das outras
  // abas, nada mais dispara uma nova busca depois disso. Como o PWA fica
  // rodando em segundo plano (trocar de app não fecha o processo), o sino
  // nunca percebia uma publicação nova enquanto o app não fosse fechado de
  // verdade e reaberto após o cache de 15min vencer. Aqui checamos de novo
  // (ignorando o cache, refresh() = force) toda vez que o app volta pro
  // primeiro plano — tabela pequena, egress desprezível.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") appUpdates.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUpdates.refresh]);
  const [lastSeenUpdateAt, setLastSeenUpdateAt] = usePersistentState("libano-last-seen-update-at", null);
  const [showUpdatesModal, setShowUpdatesModal] = useState(false);
  const [showPublishUpdate, setShowPublishUpdate] = useState(false);
  useEffect(() => {
    if (appUpdates.loading || appUpdates.data.length === 0) return;
    if (lastSeenUpdateAt === null) {
      // Primeiro contato deste aparelho com o recurso: não bombardeia com todo
      // o histórico, só passa a acompanhar novidades a partir de agora.
      setLastSeenUpdateAt(appUpdates.data[0].created_at);
      return;
    }
    const hasUnseen = appUpdates.data.some(u => new Date(u.created_at) > new Date(lastSeenUpdateAt));
    if (hasUnseen) setShowUpdatesModal(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUpdates.loading, appUpdates.data, lastSeenUpdateAt]);
  const unseenUpdatesCount = useMemo(() => {
    if (!lastSeenUpdateAt) return 0;
    return appUpdates.data.filter(u => new Date(u.created_at) > new Date(lastSeenUpdateAt)).length;
  }, [appUpdates.data, lastSeenUpdateAt]);
  const markUpdatesSeen = () => {
    setShowUpdatesModal(false);
    if (appUpdates.data[0]) setLastSeenUpdateAt(appUpdates.data[0].created_at);
  };
  const [showOverviewEdit,setShowOverviewEdit] = useState(false);
  const [showSettings,setShowSettings] = useState(false);
  // Espaço ocupado neste aparelho (Configurações → junto dos botões de
  // limpar cache/dados). navigator.storage.estimate() soma tudo que o app
  // guarda localmente (cache de PDFs, IndexedDB, localStorage) — só calcula
  // quando a modal de Configurações é aberta, não fica rodando à toa.
  const [storageUsage, setStorageUsage] = useState(null);
  const refreshStorageUsage = () => {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) { setStorageUsage(null); return; }
    navigator.storage.estimate().then(({ usage }) => setStorageUsage(usage ?? null)).catch(() => setStorageUsage(null));
  };
  useEffect(() => { if (showSettings) refreshStorageUsage(); }, [showSettings]);
  // Preferências de notificações: chave-mestra liga/desliga tudo; "kinds" guarda
  // por categoria (ausente ou true = ligada, false = desligada). Persistido localmente.
  const [notifSettings, setNotifSettings] = usePersistentState("libano-notif-settings", { enabled: true, kinds: {} });
  // Modo economia de egress: liga/desliga o carregamento de capas de pasta,
  // fotos de flashcard/compras/mídia/jogos e gifs de treino (ver SaverImg,
  // acima). Persistido localmente, não sincroniza entre aparelhos.
  const [egressSaver, setEgressSaver] = usePersistentState("libano-egress-saver", false);
  const setNotifKind = (kind, on) => setNotifSettings(s => ({ ...s, kinds: { ...s.kinds, [kind]: on } }));
  const [mobileNavExpanded,setMobileNavExpanded] = useState(false);
  const [mobileMenuOpen,setMobileMenuOpen] = useState(false);
  const [selectedMonth,setSelectedMonth] = useState(new Date().toISOString().slice(0,7));
  // Busca (sob demanda) as movimentações do mês escolhido — usadas pra
  // Entradas/Saídas da Visão Geral e pro Orçamento. Refaz sempre que o mês
  // muda (loadMonth ignora sozinho se aquele mês já tiver sido carregado).
  // Só roda nessas duas telas — abrir o app direto em "Notas", por exemplo,
  // não deveria puxar o mês financeiro.
  useEffect(() => {
    if (page !== "Visão Geral" && page !== "Orçamento") return;
    transactions.loadMonth(selectedMonth);
  }, [page, selectedMonth, transactions.loadMonth]);

  const monthTransactions = useMemo(()=>transactions.data.filter(x=>{
    const d=String(x.date||"");
    if(/^\d{4}-\d{2}/.test(d)) return d.slice(0,7)===selectedMonth;
    const [dd,mm]=d.split("/");
    return mm===selectedMonth.slice(5);
  }),[transactions.data,selectedMonth]);
  const income = useMemo(()=>monthTransactions.filter(x=>x.type==="in").reduce((a,b)=>a+b.value,0),[monthTransactions]);
  const expense = useMemo(()=>monthTransactions.filter(x=>x.type==="out").reduce((a,b)=>a+b.value,0),[monthTransactions]);
  const balance = useMemo(()=>transactions.data.filter(x=>x.type==="in").reduce((a,b)=>a+b.value,0)-transactions.data.filter(x=>x.type==="out").reduce((a,b)=>a+b.value,0),[transactions.data]);
  // Saldo calculado no banco (soma feita pelo Postgres, sem depender de ter
  // baixado TODAS as movimentações) — ver get_transactions_balance no
  // schema.sql. Fica null até a primeira resposta (ou no modo local, sem
  // nuvem), quando o cálculo feito no navegador acima (`balance`) é usado
  // no lugar. Reconsultado no login e sempre que balanceVersion avança
  // (transação adicionada/removida, ou importação do banco) — não a cada
  // vez que mais um mês é carregado, já que o saldo do banco já considera
  // todas as transações da conta, não só as que o cliente baixou.
  const [cloudBalance, setCloudBalance] = useState(null);
  useEffect(() => {
    let active = true;
    if (!cloudConfigured || !session?.user?.id) {
      setCloudBalance(null);
      return;
    }
    supabase.rpc("get_transactions_balance").then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error("get_transactions_balance error:", error);
        return;
      }
      setCloudBalance(data == null ? null : Number(data));
    });
    return () => { active = false; };
  }, [session?.user?.id, transactions.balanceVersion]);
  const displayedBalance = cloudBalance != null ? cloudBalance : balance;
  const fixedTotal = fixed.data.reduce((a,b)=>a+b.value,0);
  const debtRemaining = debts.data.reduce((a,b)=>a+(b.total-b.paid),0);
  const cardBill = cardPurchases.data.reduce((a,b)=>a+b.value,0);

  // Enquanto não há integração bancária, a pessoa pode preencher esses 4 números
  // na mão. Quando um campo está preenchido, ele substitui o valor calculado a
  // partir das movimentações/compras; vazio (null) volta a calcular automaticamente.
  const [overview, setOverview] = usePersistentState("overview_overrides", {
    balance: null, income: null, expense: null, cardBill: null,
  });
  const effectiveBalance = overview.balance ?? displayedBalance;
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
    // Feriados nacionais, datas comemorativas e eventos recorrentes do Calendário: avisa um dia antes.
    const tomorrow = new Date(); tomorrow.setHours(0,0,0,0); tomorrow.setDate(tomorrow.getDate()+1);
    const tmYear = tomorrow.getFullYear(), tmMonth = tomorrow.getMonth()+1, tmDay = tomorrow.getDate();
    computeSpecialDays(tmYear).forEach(s=>{
      if(s.month===tmMonth && s.day===tmDay){
        items.push({
          id:"special-"+tmYear+"-"+s.title, title:s.title,
          subtitle:(s.type==="holiday"?"Feriado nacional":"Data comemorativa")+" amanhã",
          page:"Calendário", kind:s.type==="holiday"?"Feriado":"Comemorativa",
        });
      }
    });
    calendarEvents.data.forEach(e=>{
      if(calendarEventMatchesDate(e.weekdays, tomorrow)){
        items.push({
          id:"calrec-"+e.id, title:e.title,
          subtitle:"Evento recorrente amanhã"+(e.time?" · "+e.time:""),
          page:"Calendário", kind:"Recorrente",
        });
      }
    });
    return items.filter(it => notifSettings.enabled && notifSettings.kinds[it.kind] !== false);
  },[reminders.data,debts.data,fixed.data,recurring.data,studyGoals.data,calendarEvents.data,notifSettings]);

  // Dispara os Lembretes Comuns que têm uma HORA marcada assim que o relógio bate
  // esse horário no dia certo — notificação do navegador + som, mesmo com o app
  // aberto em outra aba/página. Confere a cada 20s (não precisa ser por segundo:
  // a notificação só precisa aparecer perto do minuto certo, e checar toda hora
  // gastaria bateria à toa). Guarda no localStorage quais já dispararam hoje pra
  // não repetir a notificação a cada nova checagem.
  useEffect(()=>{
    const check = ()=>{
      // Respeita as preferências de notificação: mestre desligado ou categoria
      // "Lembrete" desligada, não dispara notificação nativa nem som.
      if(!notifSettings.enabled || notifSettings.kinds["Lembrete"]===false) return;
      const now = new Date();
      const todayKey = now.toISOString().slice(0,10);
      const storageKey = "libano-timed-reminders-fired-"+todayKey;
      let fired = [];
      try{ fired = JSON.parse(localStorage.getItem(storageKey)||"[]"); }catch(e){}
      const nowHM = String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0");
      reminders.data.forEach(r=>{
        if(r.kind==="Aniversário" || !r.time) return;
        if(daysUntil(r.date)!==0) return; // só dispara no próprio dia do lembrete
        if(r.time>nowHM) return; // ainda não chegou a hora
        if(fired.includes(r.id)) return; // já disparou hoje
        fireBrowserNotification(r.title, "Lembrete · "+(r.kind||"Geral")+" · "+r.time);
        fired.push(r.id);
        try{ localStorage.setItem(storageKey, JSON.stringify(fired)); }catch(e){}
      });
    };
    check();
    const interval = setInterval(check, 20000);
    return ()=>clearInterval(interval);
  },[reminders.data,notifSettings]);

  const [aiInsight,setAiInsight] = useState(null);
  const [aiLoading,setAiLoading] = useState(false);
  const [aiError,setAiError] = useState(null);
  const aiAvailable = cloudConfigured && !!session;

  // Backup: exporta tudo que já está carregado em memória (nenhuma requisição
  // nova ao Supabase — usa só o que as listas já buscaram) como um único JSON
  // baixável. Itens com listagem "enxuta" (livros, PDFs de estudo, notas,
  // listas de flashcards — ver listSelect em useEntity) entram com os campos
  // básicos; anotações/desenhos/conteúdo completo só vêm se o item já tiver
  // sido aberto nesta sessão (o que preenche esses campos via fetchFull).
  const [exportingData, setExportingData] = useState(false);
  // Otimizar arquivos já enviados (Configurações): recomprime PDFs (livros
  // + estudo) sem perda visível, e recomprime áudios gravados (bitrate
  // menor). null = parado; "pdfs" | "audios" enquanto roda.
  const [optimizingFiles, setOptimizingFiles] = useState(null);
  const optimizeUploadedPdfs = async () => {
    if (!session || optimizingFiles) return;
    setOptimizingFiles("pdfs");
    try {
      const [{ data: bookRows }, { data: pdfRows }] = await Promise.all([
        supabase.from("books").select("id,file_path").eq("user_id", session.user.id).not("file_path", "is", null),
        supabase.from("study_pdfs").select("id,file_path").eq("user_id", session.user.id).not("file_path", "is", null),
      ]);
      let savedBytes = 0, changedCount = 0, total = 0;
      for (const row of (bookRows || [])) {
        total++;
        const r = await optimizeExistingBookFile(session.user.id, row.id);
        if (r.changed) { savedBytes += r.savedBytes; changedCount++; }
      }
      for (const row of (pdfRows || [])) {
        total++;
        const r = await optimizeExistingStudyPdfFile(session.user.id, row.id);
        if (r.changed) { savedBytes += r.savedBytes; changedCount++; }
      }
      alert(total === 0
        ? "Nenhum PDF enviado ainda."
        : `Otimização concluída: ${changedCount} de ${total} PDF(s) ficaram menores, economizando ${formatBytes(savedBytes)}.`);
    } catch (e) {
      console.error("[optimizeUploadedPdfs]", e);
      alert("Não deu pra otimizar os PDFs agora. Tenta de novo daqui a pouco.");
    } finally {
      setOptimizingFiles(null);
    }
  };
  const optimizeRecordedAudios = async () => {
    if (optimizingFiles) return;
    setOptimizingFiles("audios");
    try {
      const { savedBytes, changedCount, total } = await optimizeAllPdfAudios();
      alert(total === 0
        ? "Nenhum áudio gravado ainda."
        : `Otimização concluída: ${changedCount} de ${total} áudio(s) ficaram menores, economizando ${formatBytes(savedBytes)}.`);
    } catch (e) {
      console.error("[optimizeRecordedAudios]", e);
      alert("Não deu pra otimizar os áudios agora. Tenta de novo daqui a pouco.");
    } finally {
      setOptimizingFiles(null);
    }
  };
  // Zona de risco (Configurações): "Sair da conta" e "Limpar dados locais"
  // pedem a senha da conta antes de executar, pra evitar apagar tudo ou sair
  // sem querer ao esbarrar no botão. null = fechado; "signout" | "clearlocal".
  const [dangerConfirm, setDangerConfirm] = useState(null);
  const exportAllData = () => {
    setExportingData(true);
    try {
      const payload = {
        app: "Libano", exported_at: new Date().toISOString(), format_version: 1,
        financas: {
          transacoes: transactions.data, pagamentos_fixos: fixed.data, dividas: debts.data,
          compras_cartao: cardPurchases.data, orcamentos: budgets.data, metas: goals.data,
          recorrentes: recurring.data, valores_manuais_visao_geral: overview,
        },
        lembretes_calendario: { lembretes: reminders.data, eventos_recorrentes: calendarEvents.data },
        notas: notes.data,
        livros: { livros: books.data, pastas: bookGroups.data },
        estudos: {
          metas_de_estudo: studyGoals.data, pdfs: studyPdfs.data, pastas_de_pdfs: studyPdfGroups.data,
          flashcards: studyFlashcards.data, listas_de_flashcards: studyFlashcardLists.data, pastas_de_flashcards: studyFlashcardFolders.data,
        },
        treino: { pastas: workoutFolders.data, exercicios: workoutExercises.data },
        lista_de_compras: shoppingItems.data,
        filmes_e_series: { pastas: mediaGroups.data, itens: mediaItems.data },
        jogos: { pastas: gameGroups.data, itens: gameItems.data },
        preferencias_do_app: { tema: theme, notificacoes: notifSettings, modo_economia_de_dados: egressSaver, ocultar_valores: hideValues },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `libano-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error(e);
      alert("Não foi possível gerar o backup: " + (e.message || e));
    } finally {
      setExportingData(false);
    }
  };

  // PIN local (Configurações): pede duas vezes por window.prompt, igual ao
  // padrão já usado em outras ações rápidas do app (renomear pasta, etc.).
  const handleSetPin = () => {
    const p1 = window.prompt("Escolha um PIN (4 a 8 números):");
    if (p1 === null) return;
    if (!/^\d{4,8}$/.test(p1)) { alert("O PIN precisa ter de 4 a 8 números."); return; }
    const p2 = window.prompt("Digite o PIN de novo pra confirmar:");
    if (p2 === null) return;
    if (p1 !== p2) { alert("Os PINs não coincidem. Tente de novo."); return; }
    hashPin(p1).then(hash => setPinHash(hash));
  };
  const handleRemovePin = () => {
    if (!confirm("Remover o PIN? O app vai abrir direto, sem pedir bloqueio.")) return;
    setPinHash(null);
  };

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
    { type:"single", key:"Calendário", icon:CalendarDays },
    { type:"single", key:"Notas", icon:StickyNote },
    { type:"group", key:"livros", label:"Livros", icon:BookOpen, children:[
      { key:"Biblioteca", label:"Dashboard da biblioteca", icon:LayoutDashboard },
      { key:"Livros Lendo", label:"Lendo agora", icon:Bookmark },
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
    { type:"single", key:"Gráfico", icon:PieChart },
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

  return <EgressSaverContext.Provider value={egressSaver}>
  <div className="app">
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
      <header><div><h1>{page}</h1><p>{new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})}</p></div><div className="headerActions"><div className="notifWrap"><button className="notifBellBtn" title="Novidades do app" onClick={()=>{ setShowUpdatesModal(true); appUpdates.refresh(); }}><Megaphone size={19}/>{unseenUpdatesCount>0 && <span className="notifBadge">{unseenUpdatesCount>9?"9+":unseenUpdatesCount}</span>}</button></div><NotificationsBell items={notifItems} goTo={goTo}/>{page==="Visão Geral" && <button className="add" onClick={()=>setShowOverviewEdit(true)}><Pencil size={17}/> Editar valores</button>}</div></header>

      {page==="Visão Geral" && <Dashboard balance={effectiveBalance} income={effectiveIncome} expense={effectiveExpense} cardBill={effectiveCardBill} manualFields={overview} debtRemaining={debtRemaining} fixedTotal={fixedTotal} reminders={reminders.data} notes={notes.data} setPage={setPage} openNote={(id)=>{ setOpenNoteId(id); setPage("Notas"); }} askAI={askAI} aiInsight={aiInsight} aiLoading={aiLoading} aiError={aiError} aiAvailable={aiAvailable} month={selectedMonth} setMonth={setSelectedMonth} budgets={budgets.data} goals={goals.data} hideValues={hideValues} setHideValues={setHideValues} budgetAvailable={budgetAvailable} shoppingItems={shoppingItems.data} fixedCount={fixed.data.length} debtsCount={debts.data.length}/>}
      {page==="Movimentações" && <Transactions entity={transactions} session={session} bankAvailable={cloudConfigured && !!session} onImported={transactions.refresh}/>}
      {page==="Pagamentos Fixos" && <Fixed entity={fixed} total={fixedTotal}/>}
      {page==="Dívidas" && <Debts entity={debts} remaining={debtRemaining}/>}
      {page==="Cartões" && <Cards entity={cardPurchases} bill={cardBill}/>}
      {page==="Orçamento" && <Budgets entity={budgets} transactions={monthTransactions} month={selectedMonth}/>}
      {page==="Metas" && <Goals entity={goals} session={session}/>}
      {page==="Recorrentes" && <Recurring entity={recurring} transactions={transactions}/>}
      {page==="Lista de Compras" && <ShoppingList entity={shoppingItems} session={session}/>}
      {page==="Lembretes Comuns" && <CommonReminders entity={reminders}/>}
      {page==="Aniversários" && <Birthdays entity={reminders}/>}
      {page==="Calendário" && <CalendarPage remindersEntity={reminders} calendarEventsEntity={calendarEvents} studyGoalsEntity={studyGoals}/>}
      {page==="Notas" && <Notes entity={notes} openNoteId={openNoteId} onConsumeOpenNote={()=>setOpenNoteId(null)}/>}
      {page==="Biblioteca" && <LibraryDashboard entity={books} setPage={setPage} readingStats={readingStats}/>}
      {page==="Livros Lendo" && <BookShelf entity={books} status="lendo" session={session} studyGoals={studyGoals} readingStats={readingStats} groupsEntity={bookGroups}/>}
      {page==="Livros Lidos" && <BookShelf entity={books} status="lido" session={session} studyGoals={studyGoals} readingStats={readingStats} groupsEntity={bookGroups}/>}
      {page==="Livros Para Ler" && <BookShelf entity={books} status="quero_ler" session={session} studyGoals={studyGoals} readingStats={readingStats} groupsEntity={bookGroups}/>}
      {page==="Metas de Estudo" && <StudyGoals entity={studyGoals} studyPdfsList={studyPdfs.data} booksList={books.data} flashcardListsList={studyFlashcardLists.data} session={session}/>}
      {page==="Flashcards" && <StudyFlashcards entity={studyFlashcards} listsEntity={studyFlashcardLists} foldersEntity={studyFlashcardFolders} studyGoals={studyGoals} session={session}/>}
      {page==="Nivelamento" && <Nivelamento/>}
      {page==="Leitor de PDF" && <StudyPdfShelf entity={studyPdfs} session={session} flashcards={studyFlashcards} groupsEntity={studyPdfGroups} studyGoals={studyGoals}/>}
      {page==="Treino" && <WorkoutShelf foldersEntity={workoutFolders} exercisesEntity={workoutExercises} session={session}/>}
      {page==="Filmes e Séries" && <MediaShelf groupsEntity={mediaGroups} itemsEntity={mediaItems} session={session}/>}
      {page==="Jogos" && <GameShelf groupsEntity={gameGroups} itemsEntity={gameItems} session={session}/>}
      {page==="Gráfico" && <ActivityChartPage itemsEntity={activityItems} logsEntity={activityLogs} todosEntity={activityTodos}/>}

      <ToastHost/>

      {showOverviewEdit && <OverviewEditModal
        overview={overview}
        auto={{balance, income, expense, cardBill}}
        onSave={(patch)=>{ setOverview(o=>({...o, ...patch})); setShowOverviewEdit(false); }}
        onClose={()=>setShowOverviewEdit(false)}
      />}

      {showUpdatesModal && <AppUpdatesModal updates={appUpdates.data} loading={appUpdates.loading} onClose={markUpdatesSeen}/>}

      {dangerConfirm && <AccountPasswordConfirmModal
        email={session?.user?.email}
        title={dangerConfirm==="signout" ? "Sair da conta" : "Limpar dados locais"}
        message={dangerConfirm==="signout"
          ? "Digite a senha da sua conta para confirmar a saída."
          : "Isso limpa o cache local deste dispositivo (seus dados na nuvem continuam salvos). Digite a senha da sua conta para confirmar."}
        confirmLabel={dangerConfirm==="signout" ? "Sair da conta" : "Limpar dados locais"}
        onClose={()=>setDangerConfirm(null)}
        onConfirmed={()=>{
          if(dangerConfirm==="signout"){
            supabase.auth.signOut();
          } else {
            clearLocal();
            location.reload();
          }
          setDangerConfirm(null);
        }}
      />}

      {showSettings && <div className="modalBack" onClick={()=>setShowSettings(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modalHead"><h2>Configurações</h2><button type="button" onClick={()=>setShowSettings(false)}><X/></button></div>
        <label>Tema
          <div className="themeToggle">
            <button type="button" className={theme==="dark"?"active":""} onClick={()=>setTheme("dark")}><Moon size={14}/> Escuro</button>
            <button type="button" className={theme==="light"?"active":""} onClick={()=>setTheme("light")}><Sun size={14}/> Claro</button>
          </div>
        </label>
        <label>Tela inicial
          <select value={homePage} onChange={e=>setHomePage(e.target.value)}>
            {HOME_PAGE_OPTIONS.map(group => (
              <optgroup key={group.group} label={group.group}>
                {group.pages.map(p => {
                  const key = typeof p === "string" ? p : p.key;
                  const label = typeof p === "string" ? p : p.label;
                  return <option key={key} value={key}>{label}</option>;
                })}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="notifSettingsBlock">
          <label className="notifToggleRow">
            <span><Bell size={15}/> Notificações</span>
            <span className={"switchPill"+(notifSettings.enabled?" on":"")}>
              <input type="checkbox" checked={notifSettings.enabled} onChange={e=>setNotifSettings(s=>({...s, enabled:e.target.checked}))}/>
              <span className="switchKnob"/>
            </span>
          </label>
          {notifSettings.enabled && (
            <div className="notifKindsList">
              {NOTIF_KIND_DEFS.map(k => {
                const on = notifSettings.kinds[k.key] !== false;
                return (
                  <label key={k.key} className="notifKindRow">
                    <span className="notifKindLabel">{notifIcon(k.key, 14)} {k.label}</span>
                    <span className={"switchPill sm"+(on?" on":"")}>
                      <input type="checkbox" checked={on} onChange={e=>setNotifKind(k.key, e.target.checked)}/>
                      <span className="switchKnob"/>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
        <div className="notifSettingsBlock">
          <label className="notifToggleRow">
            <span><ImageOff size={15}/> Economizar dados</span>
            <span className={"switchPill"+(egressSaver?" on":"")}>
              <input type="checkbox" checked={egressSaver} onChange={e=>setEgressSaver(e.target.checked)}/>
              <span className="switchKnob"/>
            </span>
          </label>
          <small className="boardSettingsHint" style={{display:"block", marginTop:4}}>
            Oculta capas de pastas, fotos (compras, mídia, jogos), gifs de exercício e imagens de flashcard pra economizar dados. Livros e PDFs continuam mostrando a capa salva — só param de baixar o arquivo inteiro pra gerar uma nova.
          </small>
        </div>
        <div className="notifSettingsBlock">
          <label className="notifToggleRow" style={{cursor:"default"}}>
            <span><Lock size={15}/> Bloqueio por PIN</span>
            {pinHash
              ? <button type="button" className="ghost" onClick={handleRemovePin}>Remover</button>
              : <button type="button" className="ghost" onClick={handleSetPin}>Definir PIN</button>}
          </label>
          <small className="boardSettingsHint" style={{display:"block", marginTop:4}}>
            {pinHash
              ? "O app pede esse PIN toda vez que é aberto neste aparelho. Não criptografa os dados — é só uma tela antes de entrar."
              : "Peça um PIN de 4 a 8 números pra abrir o app neste aparelho. Útil se o celular fica destravado por perto."}
          </small>
          {pinHash && <button className="resetData" onClick={()=>location.reload()}><Lock size={14}/> Trancar agora</button>}
          {pinHash && (
            <label style={{marginTop:6}}>Trancar sozinho após
              <select value={autoLockMinutes} onChange={e=>setAutoLockMinutes(Number(e.target.value))}>
                <option value={0}>Nunca (só ao abrir/recarregar)</option>
                <option value={1}>1 minuto parado</option>
                <option value={5}>5 minutos parado</option>
                <option value={15}>15 minutos parado</option>
                <option value={30}>30 minutos parado</option>
              </select>
            </label>
          )}
        </div>
        <div className="cloud">
          {cloudConfigured && session ? <Cloud size={20}/> : <CloudOff size={20}/>}
          <div>
            <b>Sincronização</b>
            <small>{cloudConfigured && session ? ("Conectado como "+session.user.email) : "Salvo neste dispositivo"}</small>
          </div>
        </div>
        <button className="resetData" onClick={exportAllData} disabled={exportingData}><Download size={14}/> {exportingData ? "Gerando..." : "Baixar meus dados (backup)"}</button>
        <small className="boardSettingsHint" style={{display:"block", marginTop:-6, marginBottom:8}}>
          Gera um arquivo .json com tudo que está carregado agora (finanças, lembretes, notas, livros, estudos, treino, listas, filmes/séries e jogos). Anotações e desenhos de itens que você não abriu nesta sessão podem não vir completos.
        </small>
        {storageUsage != null && (
          <p className="emptyHint" style={{margin:"-4px 0 0"}}>Ocupando {formatBytes(storageUsage)} neste aparelho (PDFs em cache, imagens e dados locais).</p>
        )}
        <button className="resetData" onClick={async ()=>{
          await clearAllPdfCache();
          refreshStorageUsage();
          alert("Cache de PDFs limpo. Eles serão baixados de novo na próxima leitura.");
        }}><FileText size={14}/> Limpar cache de PDFs</button>
        <button className="resetData" onClick={async ()=>{
          await clearAllImageCache();
          refreshStorageUsage();
          alert("Cache de imagens limpo. Elas serão baixadas de novo na próxima exibição.");
        }}><ImagePlus size={14}/> Limpar cache de imagens</button>

        {cloudConfigured && session && (
          <button className="resetData" onClick={optimizeUploadedPdfs} disabled={!!optimizingFiles}>
            <FileText size={14}/> {optimizingFiles === "pdfs" ? "Otimizando..." : "Otimizar PDFs enviados"}
          </button>
        )}
        <button className="resetData" onClick={optimizeRecordedAudios} disabled={!!optimizingFiles}>
          <Mic size={14}/> {optimizingFiles === "audios" ? "Otimizando..." : "Otimizar áudios gravados"}
        </button>
        <small className="boardSettingsHint" style={{display:"block", marginTop:-6, marginBottom:8}}>
          Recomprime PDFs (livros e PDFs de estudo) sem perder qualidade visível, e regrava os áudios anexados aos PDFs num bitrate menor — bom pra voz, imperceptível ao ouvir. Só troca o arquivo se o resultado ficar mesmo menor. Otimizar PDFs baixa cada arquivo do Storage pra processar (gasta egress) — depois da primeira vez, rodar de novo só gasta egress com PDFs novos ou alterados, os já checados são pulados.
        </small>

        {cloudConfigured && session && (
          <div className="notifSettingsBlock">
            <label className="notifToggleRow" style={{cursor:"pointer"}} onClick={()=>setShowPublishUpdate(s=>!s)}>
              <span><Megaphone size={15}/> Publicar atualização</span>
              {showPublishUpdate ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
            </label>
            <small className="boardSettingsHint" style={{display:"block", marginTop:-4}}>
              Manda uma notificação "Novas atualizações!" pra todo mundo que usa o app.
            </small>
            {showPublishUpdate && <PublishUpdateForm onPublish={async ({version, items})=>{
              const ok = await appUpdates.add({ version, items });
              if(ok) setShowPublishUpdate(false);
            }}/>}
          </div>
        )}
        <button className="resetData" onClick={()=>{ setShowSettings(false); setShowUpdatesModal(true); appUpdates.refresh(); }}><Megaphone size={14}/> Ver atualizações anteriores</button>

        <div className="settingsDangerZone">
          <b className="settingsDangerTitle"><AlertTriangle size={12}/> Zona de risco</b>
          {cloudConfigured && session && <button className="resetData" onClick={()=>setDangerConfirm("signout")}><LogOut size={14}/> Sair da conta</button>}
          <button className="resetData" onClick={()=>{
            if(cloudConfigured && session){
              setDangerConfirm("clearlocal");
            } else if(confirm("Isso vai apagar todos os dados salvos neste dispositivo, sem volta — considere baixar o backup antes. Continuar?")){
              clearLocal();
              location.reload();
            }
          }}><Trash2 size={14}/> Limpar dados locais</button>
        </div>
        <div className="settingsAbout">
          <b>{pkg.name === "libano" ? "Líbano" : pkg.name}</b> <span>v{pkg.version}</span>
          <small>{pkg.description}</small>
        </div>
      </div></div>}
    </main>
  </div>
  </EgressSaverContext.Provider>
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
function Transactions({entity,session,bankAvailable,onImported}){
  const { data, add: onAdd, remove: onDelete, loadMonth, loadedMonths, loadingAny, cloud } = entity;
  const [desc,setDesc]=useState(""); const [cat,setCat]=useState(""); const [value,setValue]=useState(""); const [type,setType]=useState("out");
  const submit=()=>{
    if(!desc.trim()||!value) return;
    onAdd({desc,cat,value:Number(value),type,date:todayIsoDate()});
    setDesc("");setCat("");setValue("");setType("out");
  };
  // O extrato busca só os meses já pedidos (o atual, mais o que a pessoa
  // for carregando manualmente) — em vez de baixar o histórico inteiro de
  // uma vez. "Carregar mês anterior" pede um mês a menos que o mais antigo
  // já carregado.
  const earliestLoaded = loadedMonths && loadedMonths.size > 0
    ? Array.from(loadedMonths).sort()[0]
    : new Date().toISOString().slice(0,7);
  const loadOlder = () => {
    const [y,m] = earliestLoaded.split("-").map(Number);
    const prev = m===1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,"0")}`;
    loadMonth(prev);
  };
  const olderLabel = (() => {
    const [y,m] = earliestLoaded.split("-").map(Number);
    const prevKey = m===1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,"0")}`;
    return new Date(prevKey+"-02").toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
  })();
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
    <div className="panel"><div className="panelTitle"><h2>Extrato</h2><span>{data.length} movimentações</span></div>{data.map(x=><div className="transaction" key={x.id}><div><b>{x.desc}</b><small>{x.cat} · {formatTxDate(x.date)}{x.source==="pluggy" && " · importado do banco"}</small></div><strong className={x.type==="in"?"positive":"negative"}>{x.type==="in"?"+":"-"} {money(x.value)}</strong><button onClick={()=>onDelete(x.id)}><Trash2 size={16}/></button></div>)}
    {data.length===0 && <p className="emptyHint">Nenhuma movimentação por aqui ainda.</p>}
    {cloud && <button className="ghost" style={{marginTop:10}} disabled={loadingAny} onClick={loadOlder}>{loadingAny ? "Carregando..." : `Carregar ${olderLabel}`}</button>}
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
  const [title,setTitle]=useState(""); const [date,setDate]=useState(""); const [kind,setKind]=useState("Financeiro"); const [time,setTime]=useState("");
  const [openMenuId,setOpenMenuId]=useState(null);
  const submit=()=>{
    if(!title.trim()||!date) return;
    add({title,date,kind,time:time||null});
    // Se a pessoa definiu uma hora, já aproveita e pede permissão de notificação
    // (só pergunta de fato na primeira vez — depois disso o navegador lembra a escolha).
    if(time) requestNotificationPermission();
    setTitle("");setDate("");setKind("Financeiro");setTime("");
  };
  return <div className="content">
    <div className="panel">
      <div className="inlineAdd">
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Título do lembrete"/>
        <input value={date} onChange={e=>setDate(e.target.value)} placeholder="Data (dd/mm)"/>
        <input value={time} onChange={e=>setTime(e.target.value)} type="time" title="Hora do lembrete (opcional)" placeholder="Hora"/>
        <select value={kind} onChange={e=>setKind(e.target.value)}><option>Financeiro</option><option>Outros</option></select>
        <button onClick={submit}><Plus/></button>
      </div>
    </div>
    <div className="reminderGrid">
      {filtered.map(x=><ReminderCard
        key={x.id}
        icon={<Bell size={18}/>}
        title={x.title}
        subtitle={x.kind+" · "+x.date+(x.time?" às "+x.time:"")}
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

function CalendarPage({remindersEntity, calendarEventsEntity, studyGoalsEntity}){
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonthIdx, setViewMonthIdx] = useState(today.getMonth());
  const [selected, setSelected] = useState({year:today.getFullYear(), month:today.getMonth()+1, day:today.getDate()});
  const [showSearch, setShowSearch] = useState(false);
  const [showAddRecurring, setShowAddRecurring] = useState(false);

  const reminders = remindersEntity.data;
  const calendarEventsList = calendarEventsEntity.data;
  // Só metas de estudo no modo "Data" (com prazo) fazem sentido aparecer num dia específico do calendário.
  const studyGoalsList = studyGoalsEntity.data.filter(g=>g.mode!=="count" && g.due_date);

  const specialDays = useMemo(()=>computeSpecialDays(viewYear), [viewYear]);
  const cells = useMemo(()=>buildMonthGrid(viewYear, viewMonthIdx), [viewYear, viewMonthIdx]);

  const eventsFor = (cell) => getDayEvents(cell.year, cell.month, cell.day, {
    specialDays: cell.year===viewYear ? specialDays : computeSpecialDays(cell.year),
    reminders, calendarEvents: calendarEventsList, studyGoals: studyGoalsList,
  });
  const selectedSpecialDays = selected.year===viewYear ? specialDays : computeSpecialDays(selected.year);
  const selectedEvents = getDayEvents(selected.year, selected.month, selected.day, {
    specialDays: selectedSpecialDays, reminders, calendarEvents: calendarEventsList, studyGoals: studyGoalsList,
  });

  const prevMonth = ()=>{ if(viewMonthIdx===0){ setViewMonthIdx(11); setViewYear(y=>y-1); } else setViewMonthIdx(m=>m-1); };
  const nextMonth = ()=>{ if(viewMonthIdx===11){ setViewMonthIdx(0); setViewYear(y=>y+1); } else setViewMonthIdx(m=>m+1); };
  const goToday = ()=>{ setViewYear(today.getFullYear()); setViewMonthIdx(today.getMonth()); setSelected({year:today.getFullYear(), month:today.getMonth()+1, day:today.getDate()}); };
  const jumpTo = (y,m,d)=>{ setViewYear(y); setViewMonthIdx(m-1); setSelected({year:y, month:m, day:d}); setShowSearch(false); };

  return <div className="content">
    <div className="panel calToolbar">
      <div className="calNav">
        <button type="button" onClick={prevMonth}><ChevronLeft size={18}/></button>
        <div className="calNavLabel"><b>{MONTH_LABELS[viewMonthIdx]}</b><span>{viewYear}</span></div>
        <button type="button" onClick={nextMonth}><ChevronRight size={18}/></button>
      </div>
      <div className="calNavYear">
        <button type="button" onClick={()=>setViewYear(y=>y-1)}>−1 ano</button>
        <button type="button" className="ghost" onClick={goToday}>Hoje</button>
        <button type="button" onClick={()=>setViewYear(y=>y+1)}>+1 ano</button>
      </div>
      <div className="calActions">
        <button type="button" onClick={()=>setShowSearch(true)}><Search size={16}/> Buscar</button>
        <button type="button" className="add" onClick={()=>setShowAddRecurring(true)}><Plus size={16}/> Evento recorrente</button>
      </div>
    </div>

    <div className="panel calGridPanel">
      <div className="calWeekHead">{WEEKDAY_LABELS.map(w=><span key={w}>{w}</span>)}</div>
      <div className="calGrid">
        {cells.map((cell,i)=>{
          const evts = eventsFor(cell);
          const types = Array.from(new Set(evts.map(e=>e.type)));
          const isToday = cell.year===today.getFullYear() && cell.month===today.getMonth()+1 && cell.day===today.getDate();
          const isSelected = cell.year===selected.year && cell.month===selected.month && cell.day===selected.day;
          return <button
            type="button" key={i}
            className={"calDay "+(cell.current?"":"muted ")+(isToday?"today ":"")+(isSelected?"selected":"")}
            onClick={()=>setSelected({year:cell.year, month:cell.month, day:cell.day})}
          >
            <span className="calDayNum">{cell.day}</span>
            {types.length>0 && <span className="calDots">{types.slice(0,4).map(t=><i key={t} style={{background:CAL_TYPE_META[t].color}}/>)}</span>}
          </button>;
        })}
      </div>
    </div>

    <div className="panel">
      <div className="panelTitle"><h2>{selected.day} de {MONTH_LABELS[selected.month-1]} de {selected.year}</h2></div>
      <div className="calDayEventList">
        {selectedEvents.map(e=>{
          const meta = CAL_TYPE_META[e.type];
          const Icon = meta.icon;
          return <div className="calDayEventRow" key={e.id}>
            <div className="calDayEventIcon" style={{background:meta.color+"22", color:meta.color}}><Icon size={16}/></div>
            <div><b>{e.title}</b><small>{e.subtitle}</small></div>
          </div>;
        })}
        {selectedEvents.length===0 && <p className="emptyHint">Nenhum evento neste dia.</p>}
      </div>
    </div>

    <div className="panel">
      <div className="panelTitle"><h2>Eventos recorrentes</h2><span>dias fixos da semana</span></div>
      <div className="calRecurringList">
        {calendarEventsList.map(e=><div className="calRecurringRow" key={e.id}>
          <div className="calDayEventIcon" style={{background:"#4da3ff22", color:"#4da3ff"}}><Repeat2 size={16}/></div>
          <div><b>{e.title}</b><small>{formatWeekdaysLabel(e.weekdays)}{e.time?" · "+e.time:""}</small></div>
          <button type="button" className="reminderCardMenu" onClick={()=>calendarEventsEntity.remove(e.id)}><Trash2 size={15}/></button>
        </div>)}
        {calendarEventsList.length===0 && <p className="emptyHint">Nenhum evento recorrente cadastrado. Use "Evento recorrente" para adicionar dias de treino, aulas etc.</p>}
      </div>
    </div>

    {showAddRecurring && <AddRecurringEventModal
      onSave={(row)=>{ calendarEventsEntity.add(row); setShowAddRecurring(false); }}
      onClose={()=>setShowAddRecurring(false)}
    />}
    {showSearch && <CalendarSearchModal
      reminders={reminders} calendarEvents={calendarEventsList} studyGoals={studyGoalsList}
      onJump={jumpTo} onClose={()=>setShowSearch(false)}
    />}
  </div>;
}

function AddRecurringEventModal({onSave, onClose}){
  const [title,setTitle] = useState("");
  const [time,setTime] = useState("");
  const [days,setDays] = useState([]);
  const toggleDay = (d)=> setDays(prev => prev.includes(d) ? prev.filter(x=>x!==d) : [...prev, d].sort());
  const submit = ()=>{
    if(!title.trim() || days.length===0) return;
    onSave({title:title.trim(), weekdays:days.join(","), time:time||null});
  };
  return <div className="modalBack" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modalHead"><h2>Novo evento recorrente</h2><button type="button" onClick={onClose}><X/></button></div>
    <label>Título<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Treino, Aula de inglês..."/></label>
    <label>Repete em
      <div className="calWeekdayPicker">
        {WEEKDAY_LABELS.map((w,i)=><button type="button" key={i} className={days.includes(i)?"active":""} onClick={()=>toggleDay(i)}>{w}</button>)}
      </div>
    </label>
    <label>Hora (opcional)<input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>
    <button type="button" className="add" onClick={submit}><Plus size={16}/> Salvar evento</button>
  </div></div>;
}

function CalendarSearchModal({reminders, calendarEvents, studyGoals, onJump, onClose}){
  const [q,setQ] = useState("");
  const results = useMemo(()=>{
    const query = q.trim().toLowerCase();
    if(!query) return [];
    const out = [];
    const thisYear = new Date().getFullYear();
    // Feriados/comemorações: procura no ano atual e no próximo, cobrindo os próximos 12 meses.
    [thisYear, thisYear+1].forEach(y=>{
      computeSpecialDays(y).filter(s=>s.title.toLowerCase().includes(query)).forEach(s=>{
        out.push({id:"sp-"+y+"-"+s.title, title:s.title, subtitle:(s.type==="holiday"?"Feriado":"Data comemorativa")+" · "+pad2(s.day)+"/"+pad2(s.month)+"/"+y, year:y, month:s.month, day:s.day});
      });
    });
    reminders.filter(r=>r.title.toLowerCase().includes(query)).forEach(r=>{
      const parts = String(r.date||"").split("/").map(p=>parseInt(p,10));
      if(parts.length<2 || Number.isNaN(parts[0])) return;
      const [d,m,y] = parts;
      const year = y || thisYear;
      out.push({id:"rem-"+r.id, title:r.title, subtitle:(r.kind==="Aniversário"?"Aniversário":(r.kind||"Lembrete"))+" · "+pad2(d)+"/"+pad2(m), year, month:m, day:d});
    });
    studyGoals.filter(g=>g.due_date && g.title.toLowerCase().includes(query)).forEach(g=>{
      const [y,m,d] = g.due_date.split("-").map(Number);
      out.push({id:"goal-"+g.id, title:g.title, subtitle:"Meta de estudo · "+pad2(d)+"/"+pad2(m)+"/"+y, year:y, month:m, day:d});
    });
    calendarEvents.filter(e=>e.title.toLowerCase().includes(query)).forEach(e=>{
      out.push({id:"cal-"+e.id, title:e.title, subtitle:"Recorrente · "+formatWeekdaysLabel(e.weekdays), recurring:true});
    });
    return out;
  },[q, reminders, calendarEvents, studyGoals]);

  return <div className="modalBack" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}>
    <div className="modalHead"><h2>Buscar no calendário</h2><button type="button" onClick={onClose}><X/></button></div>
    <label>Nome do evento<input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Ex.: Natal, treino, aniversário..."/></label>
    <div className="calSearchResults">
      {results.map(r=><button type="button" key={r.id} className="calSearchResultRow" disabled={r.recurring} onClick={()=>!r.recurring && onJump(r.year, r.month, r.day)}>
        <b>{r.title}</b><small>{r.subtitle}</small>
      </button>)}
      {q.trim() && results.length===0 && <p className="emptyHint">Nada encontrado.</p>}
    </div>
  </div></div>;
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

// Igual a resizeImageToDataUrl, mas devolve um Blob (JPEG) em vez de uma
// string base64 — usado quando o destino é upload pro Storage, pra não pagar
// o custo de ~33% a mais de tamanho que o base64 tem sobre o binário original.
function resizeImageToBlob(file, maxWidth, maxHeight, quality = 0.85) {
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
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error("Falha ao gerar imagem")); return; }
          resolve(blob);
        }, "image/jpeg", quality);
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

// Igual a resizeImageToDataUrl, mas devolve também a largura/altura finais —
// usado onde o chamador precisa desses números (anotações, páginas de PDF
// coladas), já que o dataURL sozinho não diz o tamanho da imagem.
function compressImageForPage(file, maxWidth, maxHeight, quality = 0.82) {
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
        resolve({ dataUrl: canvas.toDataURL("image/jpeg", quality), width, height });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Cache em memória só pra evitar re-render redundante do mesmo <img> dentro
// da mesma sessão de aba. A fonte de verdade da capa é a coluna cover_thumb
// (banco) — isso é o que evita baixar o PDF inteiro de novo em qualquer
// aparelho/sessão nova (ver comentário em src/lib/pdfThumb.js).
const coverCache = new Map();

// Fallback só pra livros enviados antes dessa coluna existir (ou se por
// algum motivo a geração no upload falhou): baixa o PDF uma única vez, gera
// a capa e pede pra "onCoverGenerated" persistir no banco — depois disso,
// nunca mais baixa o arquivo de novo, nem nesse nem em outro aparelho.
function BookCoverThumb({ book, onCoverGenerated }) {
  const saver = React.useContext(EgressSaverContext);
  const [src, setSrc] = useState(book.cover_thumb || coverCache.get(book.file_path) || null);
  useEffect(() => {
    let active = true;
    if (book.cover_thumb) { setSrc(book.cover_thumb); return; }
    // Modo economia: não baixa o PDF inteiro só pra gerar uma capa que
    // ainda não existe — mostra o placeholder até a pessoa desligar o modo
    // ou abrir o livro (o que gera e salva a capa por outro caminho).
    if (saver) return;
    if (!book.file_path || coverCache.has(book.file_path)) return;
    (async () => {
      try {
        const blob = await downloadBookFile(book.file_path);
        const buf = await blob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf, wasmUrl: pdfWasmUrl }).promise;
        const dataUrl = await renderCoverThumbFromDoc(pdf);
        coverCache.set(book.file_path, dataUrl);
        if (active) setSrc(dataUrl);
        onCoverGenerated?.(book.id, dataUrl);
      } catch (e) {
        console.error("Não foi possível gerar a capa:", e);
      }
    })();
    return () => { active = false; };
  }, [book.file_path, book.cover_thumb, saver]);
  return <div className="bookCoverImg">{src ? <img src={src} alt={book.title}/> : <div className="bookCoverPlaceholder"><BookOpen size={28}/></div>}</div>;
}

function BookTile({ book, status, groups=[], menuOpen, opening, onToggleMenu, onOpen, onMarkReading, onMarkRead, onMoveToWantToRead, onMoveToGroup, onDelete, onCoverGenerated, dragProps }) {
  const progress = book.total_pages ? Math.min(100, Math.round((book.current_page / book.total_pages) * 100)) : 0;
  const favCount = book.favorite_pages?.length || 0;
  const impCount = book.important_pages?.length || 0;
  return (
    <div className={"bookTile"+(dragProps?.dragging?" dragging":"")} {...dragProps}>
      <div className="bookCoverWrap" onClick={opening?undefined:onOpen}>
        <BookCoverThumb book={book} onCoverGenerated={onCoverGenerated}/>
        {opening && <div className="bookCoverLoading"><span>Abrindo...</span></div>}
      </div>
      <button className="bookMenuBtn" onClick={(e)=>{e.stopPropagation(); onToggleMenu();}}><MoreVertical size={16}/></button>
      {menuOpen && <div className="bookMenu" onClick={(e)=>e.stopPropagation()}>
        {status!=="lendo" && <button onClick={onMarkReading}>{status==="lido" ? "Ler de novo (marcar lendo)" : "Começar a ler"}</button>}
        {status!=="lido" && <button onClick={onMarkRead}>Marcar como lido</button>}
        {status!=="quero_ler" && <button onClick={onMoveToWantToRead}>Mover para "quero ler"</button>}
        {groups.length>0 && onMoveToGroup && <>
          <small className="bookMenuLabel">Mover para pasta</small>
          {groups.map(g => (
            <button key={g.id} className={book.group_id===g.id?"active":""} onClick={()=>onMoveToGroup(g.id)}>
              <Folder size={13}/> {g.name}
            </button>
          ))}
          {book.group_id && <button onClick={()=>onMoveToGroup(null)}><X size={13}/> Remover da pasta</button>}
        </>}
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

// Linha de "canetas" (swatches de cor) com favoritos escolhidos pela pessoa,
// em vez de uma lista fixa no código. `colors` é a lista persistida (guardada
// com usePersistentState no componente que usa); "value" é a cor selecionada
// no momento; "onPick" troca a cor ativa; "onColorsChange" atualiza a lista
// de favoritos guardada.
function PenSwatches({ colors, onColorsChange, value, onPick, max = 8 }) {
  const [editing, setEditing] = useState(false);
  const isFav = colors.includes(value);
  return (
    <div className="penSwatches">
      {colors.map(c => (
        <button
          key={c}
          type="button"
          className={`penSwatch${value === c ? " active" : ""}${editing ? " editing" : ""}`}
          style={{ background: c }}
          onClick={() => editing ? onColorsChange(colors.filter(x => x !== c)) : onPick(c)}
          title={editing ? "Remover dos favoritos" : c}
        >
          {editing && <X size={10}/>}
        </button>
      ))}
      <input type="color" value={value} onChange={e => onPick(e.target.value)} title="Cor personalizada"/>
      <button
        type="button"
        className="penSwatchStar"
        title={isFav ? "Essa cor já está nos favoritos" : "Favoritar a cor atual"}
        disabled={isFav || colors.length >= max}
        onClick={() => onColorsChange([...colors, value])}
      ><Star size={13} fill={isFav ? "currentColor" : "none"}/></button>
      <button
        type="button"
        className={`penSwatchEdit${editing ? " active" : ""}`}
        title={editing ? "Concluir edição dos favoritos" : "Editar favoritos"}
        onClick={() => setEditing(v => !v)}
      ><Pencil size={13}/></button>
    </div>
  );
}

// Sumário do PDF (quando o arquivo já traz essa estrutura embutida — a
// maioria dos PDFs exportados de um livro/e-book tem). "dest" pode vir como
// string (destino nomeado) ou array; os dois precisam de uma resolução
// assíncrona pra virar um número de página de verdade.
async function resolvePdfOutline(doc, items, depth = 0) {
  const out = [];
  for (const item of items) {
    let page = null;
    try {
      let dest = item.dest;
      if (typeof dest === "string") dest = await doc.getDestination(dest);
      if (Array.isArray(dest) && dest[0] != null) {
        page = (await doc.getPageIndex(dest[0])) + 1;
      }
    } catch (e) { /* item sem destino resolvível (ex.: link externo) — ignora */ }
    const children = item.items?.length ? await resolvePdfOutline(doc, item.items, depth + 1) : [];
    out.push({ title: item.title, page, depth, children });
  }
  return out;
}

// Marca-texto do leitor de livros: espessura/opacidade fixas (só a cor é
// escolhível agora) — ainda mais simples que o modo caneta completo do
// leitor de PDF de estudo, que também tem forma/texto/seleção.
// Usados pelo modo "abrir sem salvar" (ver PdfOpenChooser/StudyPdfReader):
// NOOP no lugar de cada callback de persistência, e um pdfDoc "de mentira"
// (sem id) só pra alimentar o StudyPdfReader com o mesmo formato que ele já
// espera — sem isso ele acha que precisa buscar/gravar algo no Supabase.
const NOOP = () => {};
function buildTempPdfDoc(file) {
  return {
    id: null,
    title: file.name.replace(/\.pdf$/i, ""),
    file_path: null,
    current_page: 1,
    total_pages: 0,
    favorite_pages: [],
    important_pages: [],
    favorite_excerpts: [],
    drawings: {},
    notes: "",
  };
}

const BOOK_HL_THICKNESS = 16;
const BOOK_HL_OPACITY = 0.4;
const BOOK_HL_COLORS = ["#ffd54a", "#ff8a80", "#69db7c", "#5b9dff", "#c084fc"];

// Caixa flutuante mostrada ao clicar em "Adicionar PDF": deixa escolher entre
// abrir o arquivo só nessa sessão (sem tocar a nuvem, sem gastar egress) ou
// seguir o fluxo normal (envia pro Supabase e entra na estante).
function PdfOpenChooser({ onClose, onPickTemp, onPickSave, uploading }) {
  return (
    <div className="modalBack" onClick={onClose}>
      <div className="modal pdfOpenChooser" onClick={e => e.stopPropagation()}>
        <div className="modalHead"><h2>Abrir PDF</h2><button type="button" onClick={onClose}><X/></button></div>
        <div className="pdfOpenChooserOptions">
          <button className="pdfOpenChooserOpt" onClick={onPickTemp}>
            <Eye size={22}/>
            <b>Abrir sem salvar</b>
            <span>Só pra dar uma olhada agora — abre direto do seu aparelho, não sobe pra nuvem nem fica guardado no app.</span>
          </button>
          <button className="pdfOpenChooserOpt" onClick={onPickSave} disabled={uploading}>
            <Upload size={22}/>
            <b>{uploading ? "Enviando..." : "Salvar na estante"}</b>
            <span>Envia o arquivo e adiciona aqui, com progresso, anotações e capa salvos pra sempre.</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function fmtAudioDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

// Painel de "Áudios de estudo" dos leitores de PDF: grava áudio direto do
// microfone ou importa arquivos já baixados no aparelho, e guarda tudo
// junto daquele PDF pra tocar enquanto estuda. Usado tanto no PdfReader
// (livros) quanto no StudyPdfReader (PDFs de estudo).
//
// Tudo fica só no IndexedDB local do navegador (ver lib/pdfAudios.js) —
// nada sobe pra nuvem, então isso não gasta nenhum egress.
function PdfAudioPanel({ pdfKind, pdfId, title }) {
  const [clips, setClips] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [playingId, setPlayingId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [micError, setMicError] = useState(null);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const seekingRef = useRef(false); // ref (não state) pra sempre ler o valor atual dentro do listener ontimeupdate

  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const audioElRef = useRef(null);
  const objectUrlRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    (async () => {
      const list = await listPdfAudios(pdfKind, pdfId);
      if (!cancelled) { setClips(list); setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [pdfKind, pdfId]);

  // Para tudo (gravação e reprodução) se o painel sumir do ar (ex: trocou de aba).
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch (e) { console.log("[pdfAudio] stop no unmount falhou", e); }
      }
      mediaStreamRef.current?.getTracks()?.forEach(t => t.stop());
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = async () => {
    if (pdfId == null) return;
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      // 32kbps é de sobra pra voz falada e evita gravar no bitrate padrão
      // do navegador (~128kbps), que é overkill pra esse uso.
      const mr = new MediaRecorder(stream, { audioBitsPerSecond: recordingAudioBitsPerSecond() });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        chunksRef.current = [];
        const durationSec = recordSecs;
        setRecording(false);
        setRecordSecs(0);
        if (blob.size > 0) {
          setBusy(true);
          const meta = await addPdfAudio(pdfKind, pdfId, {
            blob, durationSec, source: "gravado",
            name: `Gravação ${new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
          });
          if (meta) setClips(list => [meta, ...list]);
          setBusy(false);
        }
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      setRecordSecs(0);
      recordTimerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000);
    } catch (e) {
      console.log("[pdfAudio] getUserMedia falhou", e);
      setMicError("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || pdfId == null) return;
    setBusy(true);
    const tempAudio = document.createElement("audio");
    tempAudio.preload = "metadata";
    const url = URL.createObjectURL(file);
    tempAudio.src = url;
    const finish = async (durationSec) => {
      URL.revokeObjectURL(url);
      const meta = await addPdfAudio(pdfKind, pdfId, {
        blob: file, durationSec, source: "importado",
        name: file.name.replace(/\.[a-z0-9]+$/i, ""),
      });
      if (meta) setClips(list => [meta, ...list]);
      setBusy(false);
    };
    tempAudio.onloadedmetadata = () => finish(Number.isFinite(tempAudio.duration) ? tempAudio.duration : 0);
    tempAudio.onerror = () => finish(0);
  };

  const stopPlayback = () => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.currentTime = 0;
      audioElRef.current.ontimeupdate = null;
      audioElRef.current.onloadedmetadata = null;
      audioElRef.current.ondurationchange = null;
    }
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    seekingRef.current = false;
    setPlayingId(null);
    setCurrentSec(0);
    setDurationSec(0);
  };

  const togglePlay = async (clip) => {
    if (playingId === clip.id) { stopPlayback(); return; }
    stopPlayback();
    const blob = await getPdfAudioBlob(pdfKind, pdfId, clip.id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;
    if (!audioElRef.current) audioElRef.current = new Audio();
    const el = audioElRef.current;
    el.src = url;
    el.onended = () => stopPlayback();
    // Atualiza o cronômetro e a duração real do áudio (o metadata de
    // duração salvo no clip é só uma estimativa arredondada).
    el.ontimeupdate = () => { if (!seekingRef.current) setCurrentSec(el.currentTime); };
    const syncDuration = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setDurationSec(el.duration);
    };
    el.onloadedmetadata = syncDuration;
    el.ondurationchange = syncDuration;
    setDurationSec(clip.durationSec || 0);
    setCurrentSec(0);
    setPlayingId(clip.id);
    try { await el.play(); } catch (e) { console.log("[pdfAudio] play falhou", e); stopPlayback(); }
  };

  // Barra de progresso: arrasta pra qualquer ponto do áudio. `seeking` evita
  // que o timeupdate do áudio "brigue" com o dedo/mouse enquanto arrasta.
  const handleSeekChange = (e) => {
    const val = Number(e.target.value);
    setCurrentSec(val);
  };
  const commitSeek = (e) => {
    const val = Number(e.target.value);
    if (audioElRef.current && playingId != null) audioElRef.current.currentTime = val;
    setCurrentSec(val);
    seekingRef.current = false;
  };

  const handleDownload = async (clip) => {
    const blob = await getPdfAudioBlob(pdfKind, pdfId, clip.id);
    if (!blob) return;
    const ext = (blob.type && blob.type.split("/")[1]) ? blob.type.split("/")[1].split(";")[0] : "webm";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clip.name || "audio"}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoga em seguida (dar um tempinho pro navegador iniciar o download).
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const startRename = (clip) => { setRenamingId(clip.id); setRenameValue(clip.name); };
  const commitRename = async () => {
    if (renamingId == null) return;
    const id = renamingId;
    setRenamingId(null);
    const next = await renamePdfAudio(pdfKind, pdfId, id, renameValue);
    setClips(next);
  };

  const handleDelete = async (clip) => {
    if (playingId === clip.id) stopPlayback();
    const next = await deletePdfAudio(pdfKind, pdfId, clip.id);
    setClips(next);
  };

  return (
    <div className="pdfAudioPanel">
      {pdfId == null ? (
        <p className="emptyHint">Áudios só podem ser gravados/guardados em PDFs salvos na estante — esse aqui está aberto sem salvar.</p>
      ) : (
        <>
          <div className="pdfAudioRecordRow">
            {!recording ? (
              <button className="add pdfAudioRecordBtn" onClick={startRecording} disabled={busy}>
                <Mic size={16}/> Gravar áudio
              </button>
            ) : (
              <button className="add pdfAudioRecordBtn pdfAudioRecording" onClick={stopRecording}>
                <Square size={14}/> Parar ({fmtAudioDuration(recordSecs)})
              </button>
            )}
            <label className="ghost pdfAudioImportBtn">
              <Upload size={15}/> <span>Importar arquivo</span>
              <input type="file" accept="audio/*" hidden onChange={handleImportFile} disabled={busy || recording}/>
            </label>
          </div>
          {micError && <p className="emptyHint pdfAudioError">{micError}</p>}
          <div className="pdfAudioList">
            {!loaded && <p className="emptyHint">Carregando áudios...</p>}
            {loaded && clips.length===0 && <p className="emptyHint">Nenhum áudio ainda. Grave ou importe um áudio de estudo relevante para "{title}".</p>}
            {clips.map(clip => (
              <div key={clip.id} className={`pdfAudioItem${playingId===clip.id ? " pdfAudioItemPlaying" : ""}`}>
                <div className="pdfAudioItemRow">
                  <button className="pdfAudioPlayBtn" title={playingId===clip.id ? "Pausar" : "Tocar"} onClick={()=>togglePlay(clip)}>
                    {playingId===clip.id ? <Pause size={15}/> : <Play size={15}/>}
                  </button>
                  <div className="pdfAudioItemInfo">
                    {renamingId===clip.id ? (
                      <input autoFocus className="pdfAudioRenameInput" value={renameValue}
                        onChange={e=>setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={e=>{ if(e.key==="Enter") commitRename(); if(e.key==="Escape") setRenamingId(null); }}/>
                    ) : (
                      <b className="pdfAudioItemName" onClick={()=>startRename(clip)} title="Toque para renomear">{clip.name}</b>
                    )}
                    <span className="pdfAudioItemMeta">
                      {clip.source==="gravado" ? <Mic size={11}/> : <Headphones size={11}/>}{" "}
                      {playingId===clip.id
                        ? `${fmtAudioDuration(currentSec)} / ${fmtAudioDuration(durationSec || clip.durationSec)}`
                        : fmtAudioDuration(clip.durationSec)}
                    </span>
                  </div>
                  {renamingId!==clip.id && (
                    <button className="pdfAudioItemIconBtn" title="Renomear áudio" onClick={()=>startRename(clip)}><Pencil size={13}/></button>
                  )}
                  <button className="pdfAudioItemIconBtn" title="Baixar áudio" onClick={()=>handleDownload(clip)}><Download size={13}/></button>
                  <button className="pdfAudioItemDelete" title="Excluir áudio" onClick={()=>handleDelete(clip)}><Trash2 size={13}/></button>
                </div>
                {playingId===clip.id && (
                  <input
                    type="range"
                    className="pdfAudioSeek"
                    min={0}
                    max={Math.max(durationSec || clip.durationSec || 0, 0.1)}
                    step={0.1}
                    value={Math.min(currentSec, durationSec || clip.durationSec || 0)}
                    onPointerDown={()=>{ seekingRef.current = true; }}
                    onChange={handleSeekChange}
                    onMouseUp={commitSeek}
                    onTouchEnd={commitSeek}
                    onKeyUp={commitSeek}
                  />
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatação de texto rica, compartilhada por TODAS as áreas de anotação com
// corpo editável: a nota avulsa (NoteEditor), as anotações de livros
// (PdfReader) e as anotações de PDFs de estudo (StudyPdfReader). Manter isso
// num único lugar garante que as três tenham sempre o mesmo conjunto de
// ferramentas (negrito, cor, marca-texto, emoji, alinhamento, lista de
// marcação e links) em vez de cada uma evoluir separadamente e ficar
// desalinhada das outras.

const EMOJIS = [
  "😀","😄","😁","😂","🙂","😉","😍","🤩","🤔","😅",
  "😎","🙃","😴","😭","😡","🥳","😇","🤗","👍","👎",
  "👏","🙏","💪","✨","🔥","⭐","❤️","💡","✅","❌",
  "📌","📅","⏰","🎯","📝","🚀","🎉","☕","💰","📚"
];

const NOTE_TEXT_COLORS = ["#f4f4f5", "#ff8a80", "#ffb74a", "#ffe066", "#69db7c", "#5b9dff", "#c084fc"];
const NOTE_HILITE_COLORS = ["transparent", "#ffe066", "#ffb3ab", "#a9e6a0", "#a9d4ff", "#e2b6ff"];

// Cria a estrutura de um item de marcação (caixinha + texto)
function makeChecklistItem() {
  const item = document.createElement("div");
  item.className = "checklist-item";
  const box = document.createElement("span");
  box.className = "check-box";
  box.setAttribute("contenteditable", "false");
  const text = document.createElement("span");
  text.className = "check-text";
  item.appendChild(box);
  item.appendChild(text);
  return { item, text };
}

// Posiciona o cursor no início do texto do item informado
function placeCursorIn(textEl) {
  const sel = window.getSelection();
  const r = document.createRange();
  r.selectNodeContents(textEl);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

// Acha o filho direto do editor (bodyRef) que contém o nó informado.
// É por causa disso que o item "bugava e criava do lado": ao inserir o
// novo item exatamente na posição do cursor, se o cursor estivesse dentro
// do texto de outro item (uma linha em "flex"), o novo item nascia DENTRO
// daquela linha em vez de virar uma linha nova.
function findTopLevelChild(el, node) {
  let cur = node;
  while (cur && cur.parentNode && cur.parentNode !== el) cur = cur.parentNode;
  return cur && cur.parentNode === el ? cur : null;
}

// Hook com toda a lógica de formatação de um corpo editável (bodyRef).
// onChange é chamado sempre que o conteúdo muda, pra quem estiver usando
// agendar o autosave.
function useNoteFormatting(bodyRef, onChange) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [hiliteOpen, setHiliteOpen] = useState(false);
  const [linkBar, setLinkBar] = useState(null);
  const [linkPopover, setLinkPopover] = useState(null);
  const savedRangeRef = useRef(null);
  const editingAnchorRef = useRef(null);

  // Impede que o clique num botão da barra tire o foco/seleção do texto
  const keepFocus = (e) => e.preventDefault();

  const exec = (command, value = null) => {
    bodyRef.current?.focus();
    document.execCommand(command, false, value);
    onChange();
  };

  const insertEmoji = (emoji) => {
    bodyRef.current?.focus();
    document.execCommand("insertText", false, emoji);
    setEmojiOpen(false);
    onChange();
  };

  const applyTextColor = (c) => {
    exec("foreColor", c);
    setColorOpen(false);
  };

  const applyHilite = (c) => {
    bodyRef.current?.focus();
    // hiliteColor é o comando padrão; backColor é o fallback usado por
    // alguns navegadores mais antigos para o mesmo efeito.
    const ok = document.execCommand("hiliteColor", false, c);
    if (!ok) document.execCommand("backColor", false, c);
    onChange();
    setHiliteOpen(false);
  };

  const insertChecklist = () => {
    const el = bodyRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    const { item, text } = makeChecklistItem();

    let anchor = null;
    if (sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).endContainer)) {
      anchor = findTopLevelChild(el, sel.getRangeAt(0).endContainer);
    }

    // Sempre inseridos como linha independente: depois da linha atual
    // (se houver uma), ou no final do editor.
    if (anchor) anchor.after(item);
    else el.appendChild(item);

    placeCursorIn(text);
    onChange();
  };

  // Alterna o estado marcado/desmarcado ao clicar no quadradinho, e abre
  // links em uma nova aba do navegador ao clicar neles (sem arrastar - se
  // o clique tiver selecionado texto, deixa a seleção em pé em vez de navegar)
  const handleBodyClick = (e) => {
    const box = e.target.closest?.(".check-box");
    if (box) {
      e.preventDefault();
      box.closest(".checklist-item")?.classList.toggle("checked");
      onChange();
      return;
    }
    const link = e.target.closest?.("a");
    if (link && bodyRef.current?.contains(link)) {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        e.preventDefault();
        const href = link.getAttribute("href");
        if (href) window.open(href, "_blank", "noopener,noreferrer");
      }
    }
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

    // Se havia texto selecionado, remove antes de calcular o que sobrou
    // (antes esse texto ficava "perdido" e a estrutura quebrava).
    if (!range0.collapsed) range0.deleteContents();

    // Pega o que ficou depois do cursor para levar para o novo item
    let afterFrag = document.createDocumentFragment();
    if (textEl.lastChild) {
      const afterRange = document.createRange();
      afterRange.setStart(range0.startContainer, range0.startOffset);
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
      const { item: newItem, text } = makeChecklistItem();
      text.appendChild(afterFrag);
      itemEl.after(newItem);
      placeCursorIn(text);
    }
    onChange();
  };

  // Mostra o botãozinho flutuante "Link" acima do trecho selecionado
  // (só quando a seleção tem texto e está dentro do corpo da nota)
  const updateLinkBar = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setLinkBar(null); return; }
    const range = sel.getRangeAt(0);
    if (!bodyRef.current || !bodyRef.current.contains(range.commonAncestorContainer)) { setLinkBar(null); return; }
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) { setLinkBar(null); return; }
    setLinkBar({
      top: rect.top - 42,
      left: Math.min(Math.max(rect.left + rect.width / 2 - 34, 8), window.innerWidth - 76),
    });
  };

  // Abre a caixinha flutuante onde se digita/cola o link. Se a seleção
  // já estiver dentro de um link existente, entra em modo de edição
  // (preenche com a URL atual e mostra o botão de remover).
  const openLinkPopover = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0).cloneRange();
    savedRangeRef.current = range;
    let node = range.commonAncestorContainer;
    if (node.nodeType === 3) node = node.parentElement;
    const anchor = node?.closest?.("a");
    editingAnchorRef.current = (anchor && bodyRef.current?.contains(anchor)) ? anchor : null;
    const rect = range.getBoundingClientRect();
    setLinkPopover({
      top: Math.max(rect.top - 46, 8),
      left: Math.min(Math.max(rect.left, 8), window.innerWidth - 268),
      value: editingAnchorRef.current ? (editingAnchorRef.current.getAttribute("href") || "") : "",
    });
    setLinkBar(null);
  };

  const closeLinkPopover = () => {
    setLinkPopover(null);
    editingAnchorRef.current = null;
    savedRangeRef.current = null;
  };

  const confirmLink = () => {
    const raw = (linkPopover?.value || "").trim();
    if (!raw) { closeLinkPopover(); return; }
    const url = /^([a-z][a-z0-9+.-]*:)/i.test(raw) ? raw : `https://${raw}`;
    bodyRef.current?.focus();
    if (editingAnchorRef.current) {
      editingAnchorRef.current.setAttribute("href", url);
    } else {
      const range = savedRangeRef.current;
      if (range) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        try {
          const a = document.createElement("a");
          a.href = url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.className = "note-link";
          a.appendChild(range.extractContents());
          range.insertNode(a);
          const r = document.createRange();
          r.setStartAfter(a);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
        } catch (err) {
          // seleção cruza limites incompatíveis (ex.: entre itens de marcação) - ignora
        }
      }
    }
    closeLinkPopover();
    onChange();
  };

  const removeLink = () => {
    const a = editingAnchorRef.current;
    if (a && a.parentNode) {
      const parent = a.parentNode;
      while (a.firstChild) parent.insertBefore(a.firstChild, a);
      parent.removeChild(a);
    }
    closeLinkPopover();
    onChange();
  };

  return {
    emojiOpen, setEmojiOpen, colorOpen, setColorOpen, hiliteOpen, setHiliteOpen,
    linkBar, linkPopover, setLinkPopover, editingAnchorRef,
    keepFocus, exec, insertEmoji, applyTextColor, applyHilite, insertChecklist,
    handleBodyClick, handleBodyKeyDown, updateLinkBar,
    openLinkPopover, closeLinkPopover, confirmLink, removeLink,
  };
}

// Botões de formatação em si (sem a <div> de fora, pra quem for usar poder
// colocar botões extras próprios do lado, como o "Baixar em PDF" da nota avulsa).
function NoteFormatButtons({ fmt }) {
  return (
    <>
      <button title="Negrito" onClick={() => fmt.exec("bold")}><Bold size={16}/></button>
      <button title="Itálico" onClick={() => fmt.exec("italic")}><Italic size={16}/></button>
      <button title="Sublinhado" onClick={() => fmt.exec("underline")}><Underline size={16}/></button>
      <span className="noteToolDivider"/>
      <div className="emojiWrap">
        <button title="Cor do texto" onClick={() => { fmt.setColorOpen(o => !o); fmt.setHiliteOpen(false); }}><Palette size={16}/></button>
        {fmt.colorOpen && (
          <div className="colorPopover">
            {NOTE_TEXT_COLORS.map(c => (
              <button key={c} className="colorSwatch" style={{background:c}} onClick={() => fmt.applyTextColor(c)}/>
            ))}
          </div>
        )}
      </div>
      <div className="emojiWrap">
        <button title="Marca-texto" onClick={() => { fmt.setHiliteOpen(o => !o); fmt.setColorOpen(false); }}><PaintBucket size={16}/></button>
        {fmt.hiliteOpen && (
          <div className="colorPopover">
            {NOTE_HILITE_COLORS.map(c => (
              <button key={c} className={"colorSwatch"+(c==="transparent"?" colorSwatchNone":"")} style={{background:c==="transparent"?undefined:c}} title={c==="transparent"?"Remover marca-texto":undefined} onClick={() => fmt.applyHilite(c)}/>
            ))}
          </div>
        )}
      </div>
      <span className="noteToolDivider"/>
      <div className="emojiWrap">
        <button title="Emoji" onClick={() => fmt.setEmojiOpen(o => !o)}><Smile size={16}/></button>
        {fmt.emojiOpen && (
          <div className="emojiPopover">
            {EMOJIS.map(em => (
              <button key={em} className="emojiBtn" onClick={() => fmt.insertEmoji(em)}>{em}</button>
            ))}
          </div>
        )}
      </div>
      <span className="noteToolDivider"/>
      <button title="Alinhar à esquerda" onClick={() => fmt.exec("justifyLeft")}><AlignLeft size={16}/></button>
      <button title="Centralizar texto" onClick={() => fmt.exec("justifyCenter")}><AlignCenter size={16}/></button>
      <button title="Alinhar à direita" onClick={() => fmt.exec("justifyRight")}><AlignRight size={16}/></button>
      <button title="Justificar" onClick={() => fmt.exec("justifyFull")}><AlignJustify size={16}/></button>
      <span className="noteToolDivider"/>
      <button title="Lista com marcadores" onClick={() => fmt.exec("insertUnorderedList")}><List size={16}/></button>
      <button title="Lista numerada (1, 2, 3)" onClick={() => fmt.exec("insertOrderedList")}><ListOrdered size={16}/></button>
      <button title="Lista de marcação" onClick={fmt.insertChecklist}><CheckSquare size={16}/></button>
      <span className="noteToolDivider"/>
      <button title="Transformar seleção em link" onClick={() => { if (window.getSelection()?.isCollapsed === false) fmt.openLinkPopover(); }}><Link2 size={16}/></button>
    </>
  );
}

// Botão flutuante "Link" + caixinha de digitar a URL. Usa position:fixed,
// então não depende de nenhum ancestral posicionado - pode ficar em
// qualquer container.
function NoteLinkFloatingUI({ fmt }) {
  return (
    <>
      {fmt.linkBar && !fmt.linkPopover && (
        <button
          className="noteLinkBarBtn"
          style={{ position: "fixed", top: fmt.linkBar.top, left: fmt.linkBar.left }}
          onMouseDown={fmt.keepFocus}
          onClick={fmt.openLinkPopover}
          title="Transformar em link"
        >
          <Link2 size={13}/> Link
        </button>
      )}
      {fmt.linkPopover && (
        <div
          className="noteLinkPopover"
          style={{ position: "fixed", top: fmt.linkPopover.top, left: fmt.linkPopover.left }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <input
            className="noteLinkInput"
            type="text"
            placeholder="Cole ou digite o link..."
            value={fmt.linkPopover.value}
            autoFocus
            onChange={e => fmt.setLinkPopover(p => ({ ...p, value: e.target.value }))}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); fmt.confirmLink(); }
              if (e.key === "Escape") { e.preventDefault(); fmt.closeLinkPopover(); }
            }}
          />
          <button title="Confirmar link" onClick={fmt.confirmLink}><Check size={14}/></button>
          {fmt.editingAnchorRef.current && (
            <button title="Remover link" onClick={fmt.removeLink}><X size={14}/></button>
          )}
        </div>
      )}
    </>
  );
}

function PdfReader({ book, onClose, onProgress, onNotesChange, onFavoritesChange, onImportantChange, onFavoriteExcerptsChange, onDrawingsChange }) {
  const [pdf, setPdf] = useState(null);
  const [pageNum, setPageNum] = useState(book.current_page || 1);
  const [numPages, setNumPages] = useState(book.total_pages || 0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [nightMode, setNightMode] = useState(false);
  const [basePageSize, setBasePageSize] = useState({ width: 0, height: 0 });

  const [favoritePages, setFavoritePages] = useState(book.favorite_pages || []);
  const [importantPages, setImportantPages] = useState(book.important_pages || []);
  const [favoriteExcerpts, setFavoriteExcerpts] = useState(book.favorite_excerpts || []);
  const [selection, setSelection] = useState(null); // {text, top, left}
  const [outline, setOutline] = useState(null); // sumário/índice do PDF (null = ainda não carregado, [] = sem sumário)
  const textLayerRef = useRef(null);

  const [panel, setPanel] = useState(null); // null | "notas" | "busca" | "marcadores" | "sumario"
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [jumpValue, setJumpValue] = useState("");

  // --- Marca-texto: desenho à mão livre por cima da página, guardado numa
  // camada separada por página (nunca altera o PDF original).
  const [highlightMode, setHighlightMode] = useState(false);
  const [hlColor, setHlColor] = useState(BOOK_HL_COLORS[0]);
  const [hlColorOpen, setHlColorOpen] = useState(false);
  const [drawings, setDrawings] = useState({});
  const [drawingsLoaded, setDrawingsLoaded] = useState(false);
  const [liveHl, setLiveHl] = useState(null);
  const [selectedImgId, setSelectedImgId] = useState(null);
  const imageInputRef = useRef(null);
  const drawSvgRef = useRef(null);
  const pageWrapRef = useRef(null);
  const isDrawingRef = useRef(false);
  const drawSaveTimer = useRef(null);

  // As anotações do marca-texto ficam só no IndexedDB local (mesma ideia do
  // quadro infinito) — nunca mais sobem pro Supabase, porque reenviar o
  // objeto inteiro a cada pausa de desenho gastava rede à toa. Se o livro
  // ainda tiver um "drawings" antigo salvo na nuvem (de antes dessa
  // mudança), migra uma única vez pro IndexedDB e limpa a coluna na nuvem.
  const drawingsIdbKey = book.id != null ? `book_drawings:${book.id}` : null;
  useEffect(() => {
    if (!drawingsIdbKey) { setDrawings({}); setDrawingsLoaded(true); return; }
    let cancelled = false;
    (async () => {
      const fromIdb = await idbGet(drawingsIdbKey, null);
      if (cancelled) return;
      if (fromIdb && Object.keys(fromIdb).length) {
        setDrawings(fromIdb);
        setDrawingsLoaded(true);
        return;
      }
      const legacyCloud = book.drawings;
      if (legacyCloud && Object.keys(legacyCloud).length) {
        setDrawings(legacyCloud);
        await idbSet(drawingsIdbKey, legacyCloud);
        onDrawingsChange(book.id, {}); // esvazia a coluna antiga na nuvem
      }
      setDrawingsLoaded(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingsIdbKey]);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const modalRef = useRef(null);
  const [fullscreen, toggleFullscreen] = useFullscreen(modalRef, { startOpen: true });
  const notesBodyRef = useRef(null);
  const notesSaveTimer = useRef(null);
  const searchToken = useRef(0);
  const renderTaskRef = useRef(null);

  const [offlineReady, setOfflineReady] = useState(false);
  const [downloadingOffline, setDownloadingOffline] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        // Se o livro já foi baixado por completo neste aparelho (ex.: pelo
        // botão "Baixar para leitura offline"), abre a cópia local — 0 egress,
        // funciona sem internet. Senão, abre por streaming: o pdf.js busca só
        // as páginas visitadas via Range requests, em vez do PDF inteiro —
        // importante pra livros grandes que nem sempre são lidos de uma vez.
        const cachedBlob = await peekCachedBookFile(book.file_path);
        let doc;
        if (cachedBlob) {
          const buf = await cachedBlob.arrayBuffer();
          // wasmUrl: ver comentário em src/lib/pdf.js — sem isso, imagens em
          // fax/CCITT (comuns em provas escaneadas) somem da página em silêncio.
          doc = await pdfjsLib.getDocument({ data: buf, wasmUrl: pdfWasmUrl }).promise;
          if (active) setOfflineReady(true);
        } else {
          try {
            const signedUrl = await getBookFileUrl(book.file_path);
            doc = await pdfjsLib.getDocument({
              url: signedUrl,
              wasmUrl: pdfWasmUrl,
              rangeChunkSize: 256 * 1024,
            }).promise;
          } catch (streamErr) {
            // Servidor/rede não deu pra abrir por partes (ex.: sem suporte a
            // Range) — cai pro caminho antigo, baixando o arquivo inteiro.
            console.warn("Streaming do PDF falhou, baixando arquivo inteiro:", streamErr);
            const blob = await downloadBookFile(book.file_path);
            const buf = await blob.arrayBuffer();
            doc = await pdfjsLib.getDocument({ data: buf, wasmUrl: pdfWasmUrl }).promise;
            if (active) setOfflineReady(true);
          }
        }
        if (!active) return;
        setPdf(doc);
        setNumPages(doc.numPages);
        setLoading(false);
        // Sumário do PDF (quando existir) — carregado à parte, pra não atrasar
        // a primeira página aparecendo na tela.
        doc.getOutline().then(async (items) => {
          if (!active || !items) { if (active) setOutline([]); return; }
          const resolved = await resolvePdfOutline(doc, items);
          if (active) setOutline(resolved);
        }).catch(() => { if (active) setOutline([]); });
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
      setBasePageSize({ width: baseViewport.width, height: baseViewport.height });
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
      if (!active) return;

      // Camada de texto invisível, alinhada sobre o canvas — permite selecionar
      // um trecho e guardá-lo como citação (aba Marcadores).
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

  const goTo = (n) => {
    const clamped = Math.max(1, Math.min(numPages || 1, n));
    setPageNum(clamped);
    onProgress(book.id, clamped);
  };

  const zoomIn = () => { setFitWidth(false); setZoom(z => Math.min(3, +(z + 0.15).toFixed(2))); };
  const zoomOut = () => { setFitWidth(false); setZoom(z => Math.max(0.3, +(z - 0.15).toFixed(2))); };
  const resetZoom = () => setFitWidth(true);

  // Baixa o livro inteiro uma vez e guarda localmente (Cache Storage) — pra
  // quando a pessoa sabe que vai ler tudo (ex.: antes de viajar sem
  // internet). Fora isso, o leitor abre por streaming (ver useEffect acima)
  // e nunca baixa mais do que as páginas realmente vistas.
  const handleDownloadOffline = async () => {
    if (downloadingOffline || offlineReady) return;
    try {
      setDownloadingOffline(true);
      await downloadBookFile(book.file_path);
      setOfflineReady(true);
    } catch (e) {
      console.error(e);
      alert("Não foi possível baixar o livro para leitura offline: " + (e.message || e));
    } finally {
      setDownloadingOffline(false);
    }
  };

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

  // Troca de página: fecha qualquer seleção de texto pendente da anterior
  useEffect(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setSelectedImgId(null);
  }, [pageNum]);

  // ---------------------------------------------------------------------
  // Marca-texto (botão único: liga/desliga o desenho do marcador)
  // ---------------------------------------------------------------------

  const scheduleDrawingsSave = (next) => {
    if (!drawingsIdbKey || !drawingsLoaded) return;
    clearTimeout(drawSaveTimer.current);
    drawSaveTimer.current = setTimeout(() => idbSet(drawingsIdbKey, next), 500);
  };
  const flushDrawings = () => {
    if (!drawingsIdbKey || !drawingsLoaded) return;
    clearTimeout(drawSaveTimer.current);
    idbSet(drawingsIdbKey, drawings);
  };

  const toggleHighlightMode = () => {
    setHighlightMode(m => {
      if (m) flushDrawings(); // saindo do modo: garante que o último traço foi salvo
      return !m;
    });
  };

  const toPageCoords = (clientX, clientY) => {
    const rect = drawSvgRef.current.getBoundingClientRect();
    const scale = basePageSize.width / (rect.width || 1);
    return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale };
  };

  const handleHlPointerDown = (e) => {
    if (!highlightMode || !basePageSize.width) return;
    e.preventDefault();
    try { drawSvgRef.current?.setPointerCapture?.(e.pointerId); } catch (err) {}
    const { x, y } = toPageCoords(e.clientX, e.clientY);
    isDrawingRef.current = true;
    setLiveHl({
      id: crypto.randomUUID(), type: "stroke", tool: "highlighter",
      color: hlColor, width: BOOK_HL_THICKNESS, opacity: BOOK_HL_OPACITY, style: "marker",
      points: [{ x, y, p: 0.5 }],
    });
  };

  const handleHlPointerMove = (e) => {
    if (!highlightMode || !isDrawingRef.current) return;
    const { x, y } = toPageCoords(e.clientX, e.clientY);
    setLiveHl(prev => prev ? { ...prev, points: [...prev.points, { x, y, p: 0.5 }] } : prev);
  };

  const handleHlPointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    setLiveHl(prev => {
      // >= 1, não > 1: um toque rápido (sem arrastar) gera um traço de um
      // único ponto — ele é um marcador/ponto legítimo (a renderização já
      // sabe desenhar isso como uma bolinha), então não pode ser descartado.
      if (prev && prev.points.length >= 1) {
        setDrawings(d => {
          const next = { ...d, [pageNum]: [...(d[pageNum] || []), prev] };
          scheduleDrawingsSave(next);
          return next;
        });
      }
      return null;
    });
  };

  const clearPageHighlights = () => {
    if (!(drawings[pageNum] || []).length) return;
    if (!confirm(`Apagar todo o marca-texto da página ${pageNum}?`)) return;
    setDrawings(prev => {
      const next = { ...prev, [pageNum]: [] };
      scheduleDrawingsSave(next);
      return next;
    });
  };

  // ---- Citações: seleciona um trecho de texto real da página (não o
  // marca-texto à mão) e guarda como uma citação pesquisável na lista.
  const handleTextMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) { setSelection(null); return; }
    if (!textLayerRef.current || !textLayerRef.current.contains(sel.anchorNode)) { setSelection(null); return; }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) { setSelection(null); return; }
    setSelection({ text: sel.toString().trim(), top: rect.top, left: rect.left + rect.width / 2 });
  };
  const clearSelection = () => { window.getSelection()?.removeAllRanges(); setSelection(null); };
  const addFavoriteExcerpt = () => {
    const text = selection?.text || window.getSelection()?.toString().trim();
    if (!text) return;
    const entry = { id: crypto.randomUUID(), page: pageNum, text, createdAt: Date.now() };
    const next = [...favoriteExcerpts, entry];
    setFavoriteExcerpts(next);
    onFavoriteExcerptsChange(book.id, next);
    clearSelection();
  };
  const removeFavoriteExcerpt = (id) => {
    const next = favoriteExcerpts.filter(h => h.id !== id);
    setFavoriteExcerpts(next);
    onFavoriteExcerptsChange(book.id, next);
  };

  // ---- Inserir imagem/print como anotação — versão enxuta: dá pra
  // arrastar e redimensionar, mas (diferente do leitor de Estudos) não tem
  // laço/múltipla seleção/copiar-colar entre páginas, já que o leitor de
  // Livros não tem esse "modo caneta" completo.
  const insertImageAnnotation = async (file) => {
    if (!file || !file.type?.startsWith("image/")) return;
    try {
      const { dataUrl, width: iw, height: ih } = await compressImageForPage(file, 1200, 1600, 0.82);
      const maxW = basePageSize.width * 0.55;
      const scale = iw > maxW ? maxW / iw : 1;
      const w = iw * scale, h = ih * scale;
      const cx = basePageSize.width / 2, cy = basePageSize.height / 2;
      const ann = { id: crypto.randomUUID(), type: "shape", shape: "image", src: dataUrl, x1: cx - w/2, y1: cy - h/2, x2: cx + w/2, y2: cy + h/2 };
      setDrawings(prev => {
        const next = { ...prev, [pageNum]: [...(prev[pageNum] || []), ann] };
        scheduleDrawingsSave(next);
        return next;
      });
      setHighlightMode(false);
      setSelectedImgId(ann.id);
    } catch (e) {
      console.error(e);
      alert("Não foi possível inserir essa imagem.");
    }
  };
  const imgDragRef = useRef(null);
  const handleImgPointerDown = (e, ann) => {
    e.stopPropagation();
    setSelectedImgId(ann.id);
    const { x, y } = toPageCoords(e.clientX, e.clientY);
    imgDragRef.current = { id: ann.id, lastX: x, lastY: y, mode: "move" };
  };
  const handleImgResizeDown = (e, ann) => {
    e.stopPropagation();
    imgDragRef.current = { id: ann.id, mode: "resize" };
  };
  const handleImgPointerMove = (e) => {
    if (!imgDragRef.current || !basePageSize.width) return;
    const { x, y } = toPageCoords(e.clientX, e.clientY);
    const drag = imgDragRef.current;
    setDrawings(prev => {
      const list = prev[pageNum] || [];
      const idx = list.findIndex(a => a.id === drag.id);
      if (idx === -1) return prev;
      let updated;
      if (drag.mode === "resize") {
        updated = resizeShapeAnnotation(list[idx], x, y);
      } else {
        const dx = x - drag.lastX, dy = y - drag.lastY;
        drag.lastX = x; drag.lastY = y;
        updated = translateAnnotation(list[idx], dx, dy);
      }
      const nextList = [...list]; nextList[idx] = updated;
      return { ...prev, [pageNum]: nextList };
    });
  };
  const handleImgPointerUp = () => {
    if (!imgDragRef.current) return;
    imgDragRef.current = null;
    scheduleDrawingsSave(drawings);
  };
  const deleteSelectedImage = () => {
    if (!selectedImgId) return;
    setDrawings(prev => {
      const next = { ...prev, [pageNum]: (prev[pageNum]||[]).filter(a => a.id !== selectedImgId) };
      scheduleDrawingsSave(next);
      return next;
    });
    setSelectedImgId(null);
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

  const fmt = useNoteFormatting(notesBodyRef, scheduleNotesSave);

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
            {outline && outline.length>0 && (
              <button className={`ghost${panel==="sumario" ? " active" : ""}`} onClick={()=>togglePanel("sumario")}>
                <ListTree size={15}/> <span>Sumário</span>
              </button>
            )}
            <button className={`ghost${panel==="notas" ? " active" : ""}`} onClick={()=>togglePanel("notas")}>
              <StickyNote size={15}/> <span>Notas</span>
            </button>
            <button className={`ghost${panel==="audios" ? " active" : ""}`} onClick={()=>togglePanel("audios")}>
              <Headphones size={15}/> <span>Áudios</span>
            </button>
            <button onClick={handleClose}><X size={18}/></button>
          </div>
        </div>

        <div className="pdfToolbar">
          <div className="pdfToolbarGroup">
            <button title={highlightMode?"Desativar marca-texto":"Marca-texto — desenhar sobre a página"} className={highlightMode?"active":""} onClick={()=>{ toggleHighlightMode(); setHlColorOpen(false); }}>
              <Highlighter size={16}/> <span>Marca-texto</span>
            </button>
            <div className="emojiWrap">
              <button title="Cor do marca-texto" onClick={()=>setHlColorOpen(o=>!o)} style={{color:hlColor}}><PaintBucket size={16}/></button>
              {hlColorOpen && (
                <div className="colorPopover">
                  {BOOK_HL_COLORS.map(c => (
                    <button key={c} className="colorSwatch" style={{background:c}} onClick={()=>{setHlColor(c); setHlColorOpen(false);}}/>
                  ))}
                </div>
              )}
            </div>
            {highlightMode && (drawings[pageNum]||[]).length>0 && (
              <button title="Apagar marca-texto desta página" onClick={clearPageHighlights}><Trash2 size={16}/></button>
            )}
            <span className="pdfToolbarDivider"/>
            <button title="Inserir imagem/print nesta página" onClick={()=>imageInputRef.current?.click()}><ImageIcon size={16}/></button>
            <input ref={imageInputRef} type="file" accept="image/*" hidden
              onChange={(e)=>{ const f=e.target.files?.[0]; if(f) insertImageAnnotation(f); e.target.value=""; }}/>
            {selectedImgId && (
              <button title="Excluir imagem selecionada" onClick={deleteSelectedImage}><Trash2 size={16}/></button>
            )}
          </div>
          <div className="pdfToolbarGroup">
            <button title="Diminuir zoom" onClick={zoomOut}><ZoomOut size={16}/></button>
            <button title="Ajustar à largura da tela" className={fitWidth?"active":""} onClick={resetZoom}>{Math.round(zoom*100)}%</button>
            <button title="Aumentar zoom" onClick={zoomIn}><ZoomIn size={16}/></button>
          </div>
          <div className="pdfToolbarGroup">
            <button
              title={offlineReady ? "Livro já disponível offline neste aparelho" : "Baixar livro inteiro para ler offline"}
              className={offlineReady ? "active" : ""}
              disabled={downloadingOffline || offlineReady}
              onClick={handleDownloadOffline}
            >
              <Download size={16}/> <span>{downloadingOffline ? "Baixando..." : (offlineReady ? "Offline" : "Baixar offline")}</span>
            </button>
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
              <div ref={pageWrapRef} className="pdfPageWrap" onPointerMove={handleImgPointerMove} onPointerUp={handleImgPointerUp} onPointerLeave={handleImgPointerUp}>
                <canvas ref={canvasRef} className={`readerCanvas${nightMode?" readerCanvasNight":""}`} onClick={()=>{ if(!highlightMode) goTo(pageNum+1); }}/>
                <div ref={textLayerRef} className="textLayer" onMouseUp={handleTextMouseUp}/>
                {basePageSize.width>0 && (
                  <svg
                    ref={drawSvgRef}
                    className="pdfDrawLayer"
                    viewBox={`0 0 ${basePageSize.width} ${basePageSize.height}`}
                    style={{
                      position:"absolute", inset:0, width:"100%", height:"100%",
                      pointerEvents: highlightMode?"auto":"none",
                      touchAction: highlightMode?"none":undefined,
                      cursor: highlightMode?"crosshair":undefined,
                    }}
                    onPointerDown={handleHlPointerDown}
                    onPointerMove={handleHlPointerMove}
                    onPointerUp={handleHlPointerUp}
                    onPointerLeave={handleHlPointerUp}
                    onContextMenu={(e)=>{ if (highlightMode) e.preventDefault(); }}
                  >
                    {(drawings[pageNum]||[]).map(ann => (
                      <AnnotationShape key={ann.id} ann={ann}
                        onPointerDown={ann.shape==="image" && !highlightMode ? (e)=>handleImgPointerDown(e, ann) : undefined}/>
                    ))}
                    {liveHl && <AnnotationShape ann={liveHl} preview/>}
                  </svg>
                )}
                {!highlightMode && selectedImgId && basePageSize.width>0 && (() => {
                  const ann = (drawings[pageNum]||[]).find(a=>a.id===selectedImgId && a.shape==="image");
                  if (!ann) return null;
                  const left = ann.x1/basePageSize.width*100, top = ann.y1/basePageSize.height*100;
                  const w = (ann.x2-ann.x1)/basePageSize.width*100, h = (ann.y2-ann.y1)/basePageSize.height*100;
                  return (
                    <div className="pdfSelectionBox" style={{left:left+"%", top:top+"%", width:w+"%", height:h+"%"}}>
                      <div className="pdfSelectionHandle" onPointerDown={(e)=>handleImgResizeDown(e, ann)}/>
                    </div>
                  );
                })()}
              </div>
            )}
            {selection && (
              <div className="pdfSelectionToolbar" style={{top:selection.top, left:selection.left}} onMouseDown={e=>e.preventDefault()}>
                <button onClick={addFavoriteExcerpt}><Star size={13}/> Adicionar citação</button>
              </div>
            )}
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
                <div className="pdfBookmarksSection">
                  <small><Star size={12}/> Citações</small>
                  {favoriteExcerpts.length===0 && <p className="emptyHint">Selecione um trecho de texto na página pra guardar aqui.</p>}
                  <div className="pdfExcerptList">
                    {favoriteExcerpts.map(h => (
                      <div key={h.id} className="pdfExcerptItem">
                        <button className="pdfExcerptText" onClick={()=>{goTo(h.page); setPanel(null);}}>
                          <b>Página {h.page}</b>
                          <small>{h.text.length>120 ? h.text.slice(0,120)+"…" : h.text}</small>
                        </button>
                        <button className="pdfExcerptDelete" title="Remover citação" onClick={()=>removeFavoriteExcerpt(h.id)}><Trash2 size={13}/></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {panel==="sumario" && (
            <div className="notesPane">
              <div className="notesPaneHead"><b>Sumário</b><span>em "{book.title}"</span></div>
              <div className="notesPaneBody">
                {(!outline || outline.length===0) && <p className="emptyHint">Esse PDF não tem um sumário embutido.</p>}
                <PdfOutlineList items={outline||[]} onGoTo={(p)=>{goTo(p); setPanel(null);}}/>
              </div>
            </div>
          )}

          {panel==="notas" && (
            <div className="notesPane">
              <div className="notesPaneHead"><b>Minhas anotações</b><span>sobre "{book.title}"</span></div>
              <div className="noteToolbar" onMouseDown={(e)=>e.preventDefault()}>
                <NoteFormatButtons fmt={fmt}/>
              </div>
              <div className="notesPaneBody" style={{position:"relative"}} onClick={() => { fmt.setEmojiOpen(false); fmt.setColorOpen(false); fmt.setHiliteOpen(false); fmt.closeLinkPopover(); }}>
                <div
                  ref={notesBodyRef}
                  className="noteTextarea noteRichBody"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={scheduleNotesSave}
                  onBlur={flushNotes}
                  onClick={fmt.handleBodyClick}
                  onKeyDown={fmt.handleBodyKeyDown}
                  onMouseUp={fmt.updateLinkBar}
                  onKeyUp={fmt.updateLinkBar}
                  data-placeholder="Escreva suas anotações sobre este livro..."
                />
                <NoteLinkFloatingUI fmt={fmt}/>
              </div>
            </div>
          )}

          {panel==="audios" && (
            <div className="notesPane">
              <div className="notesPaneHead"><b>Áudios de estudo</b><span>sobre "{book.title}"</span></div>
              <div className="notesPaneBody">
                <PdfAudioPanel pdfKind="book" pdfId={book.id} title={book.title}/>
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

function BookShelf({ entity, status, session, studyGoals, readingStats, groupsEntity }) {
  const { data, add, remove, update, cloud, reorder, fetchFull } = entity;
  const groups = groupsEntity.data;
  const filtered = data.filter(x => x.status === status);
  const [currentGroupId, setCurrentGroupId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [readingBook, setReadingBook] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOverGroupId, setDragOverGroupId] = useState(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [tempFile, setTempFile] = useState(null);
  const fileInputRef = useRef(null);
  const tempFileInputRef = useRef(null);
  const progressTimer = useRef(null);
  const openedAtRef = useRef(null);

  const currentGroup = currentGroupId ? groups.find(g => g.id === currentGroupId) : null;
  const visibleBooks = currentGroupId ? filtered.filter(b => b.group_id === currentGroupId) : filtered.filter(b => !b.group_id);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!cloud) { alert('Enviar PDFs precisa de sincronização ativa (Supabase) — veja o README.'); return; }
    try {
      setUploading(true);
      const buf = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf, wasmUrl: pdfWasmUrl }).promise;
      const totalPages = doc.numPages;
      const id = crypto.randomUUID();
      const defaultTitle = file.name.replace(/\.pdf$/i, "");
      const title = window.prompt("Título do livro:", defaultTitle) || defaultTitle;
      // Gera a capa a partir do PDF que já está em memória (sem custo extra de
      // rede) e guarda junto no banco — a estante nunca mais precisa baixar
      // esse arquivo de novo só pra mostrar a miniatura.
      const cover_thumb = await renderCoverThumbFromDoc(doc).catch(() => null);
      const filePath = await uploadBookFile(session.user.id, id, file);
      await add({ id, title, status, file_path: filePath, total_pages: totalPages, current_page: 1, favorite_pages: [], important_pages: [], favorite_excerpts: [], group_id: currentGroupId, cover_thumb });
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
      const b = data.find(x => x.id === bookId);
      // Um livro que ainda estava em "quero ler" e já passou da primeira
      // página vira "lendo" sozinho — assim o Dashboard reflete a leitura
      // real sem precisar de um clique extra no menu.
      const patch = { current_page: page };
      if (b?.status === "quero_ler" && page > 1) patch.status = "lendo";
      update(bookId, patch);
      syncLinkedGoalsProgress(studyGoals, "livro", bookId, b?.title || "", page);
      // Só soma no resumo do mês o avanço pra frente — voltar página não
      // "desconta", mas também não conta de novo.
      const delta = page - (b?.current_page || page);
      if (delta > 0) readingStats?.bump({ pages: delta });
    }, 400);
  };

  const onNotesChange = (bookId, content) => {
    update(bookId, { notes: content });
  };

  const onFavoritesChange = (bookId, favorite_pages) => update(bookId, { favorite_pages });
  const onImportantChange = (bookId, important_pages) => update(bookId, { important_pages });
  const onFavoriteExcerptsChange = (bookId, favorite_excerpts) => update(bookId, { favorite_excerpts });
  const onDrawingsChange = (bookId, drawings) => update(bookId, { drawings });

  // A listagem vem enxuta (sem notes/drawings — ver listSelect em useEntity).
  // Busca a linha inteira ANTES de montar o leitor (e não depois) porque
  // "notes"/"drawings" alimentam useState só na primeira renderização — se o
  // leitor já tivesse aberto com os campos ainda vazios, a chegada tardia
  // dos dados completos não atualizaria mais esses estados.
  const [openingBookId, setOpeningBookId] = useState(null);
  const handleOpen = async (book) => {
    setOpeningBookId(book.id);
    const full = await fetchFull(book.id);
    setOpeningBookId(null);
    openedAtRef.current = Date.now();
    setReadingBook(full || book);
  };

  const READ_SESSION_CAP_SECONDS = 3 * 60 * 60; // sessão de leitura "aberta e esquecida" não infla o tempo pra sempre
  const handleCloseReader = () => {
    if (openedAtRef.current) {
      const elapsed = Math.round((Date.now() - openedAtRef.current) / 1000);
      openedAtRef.current = null;
      if (elapsed > 2) readingStats?.bump({ seconds: Math.min(elapsed, READ_SESSION_CAP_SECONDS) });
    }
    setReadingBook(null);
  };

  const handleDelete = async (book) => {
    if (!confirm(`Excluir "${book.title}"? Isso também apaga o PDF.`)) return;
    setOpenMenuId(null);
    await remove(book.id);
    if (book.file_path) deleteBookFile(book.file_path);
  };

  const handleMoveToGroup = (book, groupId) => {
    setOpenMenuId(null);
    update(book.id, { group_id: groupId });
  };

  const handleDropOnGroup = (groupId) => {
    setDragOverGroupId(null);
    if (dragId === null) return;
    const draggedId = dragId;
    setDragId(null);
    update(draggedId, { group_id: groupId });
  };

  const handleNewGroup = () => {
    const name = window.prompt("Nome da pasta (ex.: Ficção, Técnico):");
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
    const count = data.filter(b => b.group_id === group.id).length;
    const msg = count>0
      ? `Excluir a pasta "${group.name}"? Os ${count} livro(s) dela voltam para fora da pasta (não são apagados).`
      : `Excluir a pasta "${group.name}"?`;
    if (!confirm(msg)) return;
    if (group.cover_image && cloudConfigured && session?.user?.id && group.cover_image.includes("/book_group_images/")) {
      deleteBookGroupCover(session.user.id, group.id).catch(() => {});
    }
    await Promise.all(data.filter(b => b.group_id === group.id).map(b => update(b.id, { group_id: null })));
    await groupsEntity.remove(group.id);
    if (currentGroupId === group.id) setCurrentGroupId(null);
  };

  const handleSetGroupCover = async (group, file) => {
    setOpenMenuId(null);
    try {
      if (cloudConfigured && session?.user?.id) {
        const blob = await resizeImageToBlob(file, 360, 480, 0.85);
        const url = await uploadBookGroupCover(session.user.id, group.id, blob);
        await groupsEntity.update(group.id, { cover_image: url });
      } else {
        const dataUrl = await resizeImageToDataUrl(file, 360, 480, 0.85);
        await groupsEntity.update(group.id, { cover_image: dataUrl });
      }
    } catch (e) {
      console.error(e);
      alert("Não foi possível usar essa imagem. Tente outra foto.");
    }
  };

  const handleRemoveGroupCover = async (group) => {
    setOpenMenuId(null);
    if (group.cover_image && cloudConfigured && session?.user?.id && group.cover_image.includes("/book_group_images/")) {
      deleteBookGroupCover(session.user.id, group.id).catch(() => {});
    }
    await groupsEntity.update(group.id, { cover_image: null });
  };

  const handleDrop = (targetId) => {
    if (dragId === null || dragId === targetId) { setDragId(null); return; }
    const newVisible = [...visibleBooks];
    const fromIdx = newVisible.findIndex(b => b.id === dragId);
    const toIdx = newVisible.findIndex(b => b.id === targetId);
    setDragId(null);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = newVisible.splice(fromIdx, 1);
    newVisible.splice(toIdx, 0, moved);
    let i = 0;
    const visibleIds = new Set(visibleBooks.map(b => b.id));
    const newFull = data.map(item => visibleIds.has(item.id) ? newVisible[i++] : item);
    reorder(newFull);
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
        <div className="bookTile addTile" onClick={()=>setChooserOpen(true)}>
          <div className="bookCoverWrap addCover">{uploading ? <span>Enviando...</span> : <><Plus size={26}/><span>Adicionar PDF</span></>}</div>
          <input ref={fileInputRef} type="file" accept="application/pdf" hidden onChange={handleFile}/>
          <input ref={tempFileInputRef} type="file" accept="application/pdf" hidden
            onChange={(e)=>{ const f=e.target.files?.[0]; e.target.value=""; if (f) setTempFile(f); }}/>
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
            count={filtered.filter(b => b.group_id === group.id).length}
            unitLabel="livro"
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
        {visibleBooks.map(book => (
          <BookTile
            key={book.id}
            book={book}
            status={status}
            groups={groups}
            menuOpen={openMenuId===book.id}
            opening={openingBookId===book.id}
            onToggleMenu={()=>setOpenMenuId(id=>id===book.id?null:book.id)}
            onOpen={()=>handleOpen(book)}
            onMarkReading={()=>{setOpenMenuId(null); update(book.id, {status:"lendo"});}}
            onMarkRead={()=>{setOpenMenuId(null); update(book.id, {status:"lido"}); if(status!=="lido") readingStats?.bump({books_completed:1});}}
            onMoveToWantToRead={()=>{setOpenMenuId(null); update(book.id, {status:"quero_ler"});}}
            onMoveToGroup={(groupId)=>handleMoveToGroup(book, groupId)}
            onDelete={()=>handleDelete(book)}
            onCoverGenerated={(id, cover_thumb)=>update(id, { cover_thumb })}
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
      {visibleBooks.length===0 && groups.length===0 && cloud && !currentGroup && <p className="emptyHint">Nenhum livro por aqui ainda.</p>}
      {currentGroup && visibleBooks.length===0 && <p className="emptyHint">Nenhum livro nessa pasta ainda.</p>}
      {readingBook && <PdfReader book={readingBook} onClose={handleCloseReader} onProgress={onProgress} onNotesChange={onNotesChange} onFavoritesChange={onFavoritesChange} onImportantChange={onImportantChange} onFavoriteExcerptsChange={onFavoriteExcerptsChange} onDrawingsChange={onDrawingsChange}/>}
      {chooserOpen && (
        <PdfOpenChooser
          onClose={()=>setChooserOpen(false)}
          onPickTemp={()=>{ setChooserOpen(false); tempFileInputRef.current?.click(); }}
          onPickSave={()=>{ setChooserOpen(false); fileInputRef.current?.click(); }}
          uploading={uploading}
        />
      )}
      {tempFile && (
        <StudyPdfReader
          pdfDoc={buildTempPdfDoc(tempFile)}
          tempFile={tempFile}
          onClose={()=>setTempFile(null)}
          onProgress={NOOP}
          onNotesChange={NOOP}
          onFavoritesChange={NOOP}
          onImportantChange={NOOP}
          onFavoriteExcerptsChange={NOOP}
          onCreateFlashcard={NOOP}
          onDrawingsChange={NOOP}
        />
      )}
    </div>
  );
}

function LibraryDashboard({ entity, setPage, readingStats }) {
  const { data } = entity;
  const total = data.length;
  const lendo = data.filter(b => b.status === "lendo");
  const lidos = data.filter(b => b.status === "lido").length;
  const paraLer = data.filter(b => b.status === "quero_ler").length;
  const stats = readingStats?.current || { pages: 0, seconds: 0, books_completed: 0 };
  const hours = Math.floor(stats.seconds / 3600);
  const mins = Math.round((stats.seconds % 3600) / 60);
  const timeLabel = hours > 0 ? `${hours}h ${mins}min` : (mins > 0 ? `${mins}min` : "—");
  const monthLabel = new Date(currentMonthKey() + "-02").toLocaleDateString("pt-BR", { month: "long" });

  return (
    <div className="content">
      <div className="studyGoalsHead">
        <div><h2>Minha leitura</h2><p>Um resumo rápido da sua biblioteca.</p></div>
      </div>

      <div className="studyStats">
        <div className="studyStat libraryStatClick" onClick={()=>setPage("Livros Lendo")}>
          <div className="studyStatIcon" style={{background:"#4c8dff22",color:"#4c8dff"}}><Library size={17}/></div>
          <strong>{total}</strong><small>Livros no total</small>
        </div>
        <div className="studyStat libraryStatClick" onClick={()=>setPage("Livros Lendo")}>
          <div className="studyStatIcon" style={{background:"#f0b42922",color:"#f0b429"}}><BookOpen size={17}/></div>
          <strong>{lendo.length}</strong><small>Em andamento</small>
        </div>
        <div className="studyStat libraryStatClick" onClick={()=>setPage("Livros Lidos")}>
          <div className="studyStatIcon" style={{background:"#3ecf6a22",color:"#3ecf6a"}}><BookCheck size={17}/></div>
          <strong>{lidos}</strong><small>Concluídos</small>
        </div>
        <div className="studyStat libraryStatClick" onClick={()=>setPage("Livros Para Ler")}>
          <div className="studyStatIcon" style={{background:"#a06bff22",color:"#a06bff"}}><BookMarked size={17}/></div>
          <strong>{paraLer}</strong><small>Para ler</small>
        </div>
      </div>

      <div className="studyGoalsListHead"><h3>Este mês ({monthLabel})</h3></div>
      <div className="studyStats">
        <div className="studyStat">
          <div className="studyStatIcon" style={{background:"#4c8dff22",color:"#4c8dff"}}><FileText size={17}/></div>
          <strong>{stats.pages}</strong><small>Páginas lidas</small>
        </div>
        <div className="studyStat">
          <div className="studyStatIcon" style={{background:"#ff9f4322",color:"#ff9f43"}}><Hourglass size={17}/></div>
          <strong>{timeLabel}</strong><small>Tempo de leitura</small>
        </div>
        <div className="studyStat">
          <div className="studyStatIcon" style={{background:"#3ecf6a22",color:"#3ecf6a"}}><BookCheck size={17}/></div>
          <strong>{stats.books_completed}</strong><small>Livros concluídos</small>
        </div>
      </div>

      <div className="studyGoalsListHead"><h3>Lendo agora</h3></div>
      {lendo.length === 0 && <p className="emptyHint">Nenhum livro em andamento — abra um livro de "Quero ler" e continue de onde parou que ele aparece aqui sozinho.</p>}
      {lendo.length > 0 && (
        <div className="libraryReadingList">
          {lendo.map(b => {
            const pct = b.total_pages ? Math.min(100, Math.round((b.current_page / b.total_pages) * 100)) : 0;
            return (
              <div className="libraryReadingRow" key={b.id} onClick={()=>setPage("Livros Lendo")}>
                <div className="bookCoverImg libraryReadingCover">
                  {b.cover_thumb ? <img src={b.cover_thumb} alt={b.title}/> : <div className="bookCoverPlaceholder"><FileText size={20}/></div>}
                </div>
                <div className="libraryReadingInfo">
                  <b>{b.title}</b>
                  <div className="progress"><i style={{width:pct+"%"}}/></div>
                  <small>{pct}% · página {b.current_page} de {b.total_pages}</small>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Ver comentário equivalente em BookCoverThumb: cover_thumb (banco) é a
// fonte de verdade; o download completo só acontece como fallback pontual
// pra itens antigos, e o resultado é persistido pra nunca mais repetir.
const studyPdfCoverCache = new Map();

function StudyPdfCoverThumb({ pdfDoc, onCoverGenerated }) {
  const saver = React.useContext(EgressSaverContext);
  const [src, setSrc] = useState(pdfDoc.cover_thumb || studyPdfCoverCache.get(pdfDoc.file_path) || null);
  useEffect(() => {
    let active = true;
    if (pdfDoc.cover_thumb) { setSrc(pdfDoc.cover_thumb); return; }
    if (saver) return;
    if (!pdfDoc.file_path || studyPdfCoverCache.has(pdfDoc.file_path)) return;
    (async () => {
      try {
        const blob = await downloadStudyPdfFile(pdfDoc.file_path);
        const buf = await blob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf, wasmUrl: pdfWasmUrl }).promise;
        const dataUrl = await renderCoverThumbFromDoc(pdf);
        studyPdfCoverCache.set(pdfDoc.file_path, dataUrl);
        if (active) setSrc(dataUrl);
        onCoverGenerated?.(pdfDoc.id, dataUrl);
      } catch (e) {
        console.error("Não foi possível gerar a capa:", e);
      }
    })();
    return () => { active = false; };
  }, [pdfDoc.file_path, pdfDoc.cover_thumb, saver]);
  return <div className="bookCoverImg">{src ? <img src={src} alt={pdfDoc.title}/> : <div className="bookCoverPlaceholder"><FileText size={28}/></div>}</div>;
}

function StudyPdfTile({ pdfDoc, groups, menuOpen, opening, onToggleMenu, onOpen, onDelete, onMoveToGroup, onCoverGenerated, dragProps }) {
  const progress = pdfDoc.total_pages ? Math.min(100, Math.round((pdfDoc.current_page / pdfDoc.total_pages) * 100)) : 0;
  const favCount = pdfDoc.favorite_pages?.length || 0;
  const impCount = pdfDoc.important_pages?.length || 0;
  return (
    <div className={"bookTile"+(dragProps?.dragging?" dragging":"")} {...dragProps}>
      <div className="bookCoverWrap" onClick={opening?undefined:onOpen}>
        <StudyPdfCoverThumb pdfDoc={pdfDoc} onCoverGenerated={onCoverGenerated}/>
        {opening && <div className="bookCoverLoading"><span>Abrindo...</span></div>}
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

function StudyPdfGroupTile({ group, count, unitLabel="PDF", menuOpen, onToggleMenu, onOpen, onRename, onDelete, onSetCover, onRemoveCover, dropActive, onDragEnterZone, onDragLeaveZone, onDropZone }) {
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
        <SaverImg src={group.cover_image} alt={group.name} wrapClassName="bookCoverImg" fallback={<Folder size={34}/>}/>
      </div>
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        style={{display:"none"}}
        onClick={(e)=>e.stopPropagation()}
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
      <small className="bookProgressLabel">{count} {unitLabel}{count===1?"":"s"}</small>
    </div>
  );
}

function PdfOutlineList({ items, onGoTo }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="pdfOutlineList">
      {items.map((it, i) => (
        <div key={i}>
          <button
            className="pdfOutlineItem"
            style={{ paddingLeft: (12 + it.depth * 16) + "px" }}
            disabled={it.page == null}
            onClick={() => it.page != null && onGoTo(it.page)}
          >
            <span>{it.title}</span>
            {it.page != null && <small>{it.page}</small>}
          </button>
          {it.children?.length > 0 && <PdfOutlineList items={it.children} onGoTo={onGoTo}/>}
        </div>
      ))}
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
// Ícone de "linha tracejada" pro seletor de estilo de linha reta da caneta
// (o lucide-react não tem um pronto). Só 3 tracinhos simples, na cor atual.
function DashedLineIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="1" y1="8" x2="4.2" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="6.9" y1="8" x2="9.1" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="11.8" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Quando um traço de caneta é reconhecido como reta (atalho de linha reta ou
// a correção automática), essa função decide em que tipo de anotação ele
// vira, de acordo com o estilo escolhido no seletor "Linha reta" da caneta:
// linha normal, linha tracejada ou seta. Destacador nunca usa isso (sempre
// vira barra reta normal) — só a caneta tem esse seletor.
function penStraightLineShape({ id, tool, color, width, opacity, x1, y1, x2, y2 }, lineStyle) {
  if (tool === "pen" && lineStyle === "arrow") {
    return { id, type: "shape", shape: "arrow", tool, color, width, opacity, x1, y1, x2, y2 };
  }
  return {
    id, type: "shape", shape: "line", tool, color, width, opacity, x1, y1, x2, y2,
    ...(tool === "pen" && lineStyle === "dashed" ? { dashed: true } : {}),
  };
}

const AnnotationShape = React.memo(function AnnotationShape({ ann, preview, onPointerDown }) {
  if (ann.type === "image") {
    return (
      <image
        href={ann.dataUrl || ann.src} x={ann.x} y={ann.y} width={ann.width} height={ann.height}
        opacity={preview ? 0.85 : (ann.opacity ?? 1)}
        onPointerDown={onPointerDown} style={{ cursor: onPointerDown ? "pointer" : undefined }}
        preserveAspectRatio="none"
      />
    );
  }
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
      if (ann.tool === "highlighter") {
        // Barra de marca-texto reta: ponta quadrada (sem afinar as pontas) e
        // mistura "multiply" pra se comportar igual ao traço do destacador
        // normal (a cor clara "tinge" o que está embaixo em vez de cobrir).
        return <line x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2} stroke={stroke} strokeWidth={sw} strokeLinecap="butt" opacity={op} style={{ mixBlendMode: "multiply", cursor: onPointerDown ? "pointer" : undefined }} onPointerDown={onPointerDown} />;
      }
      return <line x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2} stroke={stroke} strokeWidth={sw} strokeLinecap="round" opacity={op} strokeDasharray={ann.dashed ? `${sw * 2.2} ${sw * 1.8}` : undefined} onPointerDown={onPointerDown} style={{ cursor: onPointerDown ? "pointer" : undefined }} />;
    }
    if (ann.shape === "arrow") {
      // Ponta em "V" aberto (2 traços do mesmo jeito da linha, com ponta e
      // junção arredondadas) em vez de um triângulo preenchido — fica mais
      // fina e parecida com uma seta desenhada à mão, sem aquele efeito de
      // "bico gordo" que o triângulo sólido dava numa linha mais grossa.
      const angle = Math.atan2(ann.y2 - ann.y1, ann.x2 - ann.x1);
      const headLen = Math.max(10, sw * 2.6);
      const spread = Math.PI / 6.2;
      const hx1 = ann.x2 - headLen * Math.cos(angle - spread), hy1 = ann.y2 - headLen * Math.sin(angle - spread);
      const hx2 = ann.x2 - headLen * Math.cos(angle + spread), hy2 = ann.y2 - headLen * Math.sin(angle + spread);
      return (
        <g onPointerDown={onPointerDown} style={{ cursor: onPointerDown ? "pointer" : undefined }}>
          <line x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2} stroke={stroke} strokeWidth={sw} strokeLinecap="round" opacity={op} />
          <path d={`M ${hx1} ${hy1} L ${ann.x2} ${ann.y2} L ${hx2} ${hy2}`} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" opacity={op} />
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
    if (["cube", "pyramid", "cylinder", "cone", "sphere"].includes(ann.shape)) {
      const geo = shape3DGeometry(ann.shape, ann.x1, ann.y1, ann.x2, ann.y2);
      const dash = `${sw * 2} ${sw * 2}`;
      return (
        <g onPointerDown={onPointerDown} style={{ cursor: onPointerDown ? "pointer" : undefined }} opacity={op}>
          {/* alvo invisível cobrindo a caixa inteira, pra facilitar tocar/arrastar a forma */}
          <rect x={Math.min(ann.x1, ann.x2)} y={Math.min(ann.y1, ann.y2)} width={Math.abs(ann.x2 - ann.x1) || 1} height={Math.abs(ann.y2 - ann.y1) || 1} fill="transparent" stroke="none" />
          {(geo.circles || []).map((c, i) => <circle key={"c" + i} cx={c.cx} cy={c.cy} r={c.r} stroke={stroke} strokeWidth={sw} fill="none" />)}
          {(geo.ellipses || []).map((e, i) => <ellipse key={"e" + i} cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} stroke={stroke} strokeWidth={sw} fill="none" />)}
          {(geo.arcs || []).map((a, i) => {
            const ax1 = a.cx + a.rx * Math.cos(a.from), ay1 = a.cy + a.ry * Math.sin(a.from);
            const ax2 = a.cx + a.rx * Math.cos(a.to), ay2 = a.cy + a.ry * Math.sin(a.to);
            const d = `M ${ax1} ${ay1} A ${a.rx} ${a.ry} 0 0 1 ${ax2} ${ay2}`;
            return <path key={"a" + i} d={d} stroke={stroke} strokeWidth={sw} fill="none" strokeDasharray={a.dashed ? dash : undefined} />;
          })}
          {(geo.lines || []).map((l, i) => <line key={"l" + i} x1={l.p1.x} y1={l.p1.y} x2={l.p2.x} y2={l.p2.y} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeDasharray={l.dashed ? dash : undefined} />)}
        </g>
      );
    }
  }
  return null;
});

// =====================================================================
// Configurações do quadro/leitor: fundo, comportamento, ferramentas e
// atalhos de teclado configuráveis. Compartilhado entre o quadro infinito
// e o leitor de PDF de estudo (os dois lugares com um conjunto completo
// de ferramentas de desenho).
// =====================================================================

// Aceita tanto o formato antigo (string "white"/"black") quanto o novo
// ({ type, color }), sempre devolvendo o formato novo.
function normalizeBoardBg(raw) {
  if (!raw) return { type: "white", color: "#f4f4f5" };
  if (typeof raw === "string") {
    return raw === "black" ? { type: "color", color: "#0b0b0c" } : { type: "white", color: "#f4f4f5" };
  }
  return { type: raw.type || "white", color: raw.color || "#f4f4f5" };
}

function isLightHex(hex) {
  const c = (hex || "#ffffff").replace("#", "");
  const full = c.length === 3 ? c.split("").map(ch => ch + ch).join("") : c;
  const r = parseInt(full.substring(0, 2), 16) || 0;
  const g = parseInt(full.substring(2, 4), 16) || 0;
  const b = parseInt(full.substring(4, 6), 16) || 0;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

// Estilo CSS do fundo (cor sólida, quadriculado ou pontinhos). Quando "view"
// é informado, o padrão acompanha o pan/zoom pra dar sensação de profundidade.
function boardBgStyle(bg, view) {
  const light = isLightHex(bg.color);
  const base = { backgroundColor: bg.color };
  const zoom = view?.zoom || 1;
  const posX = view?.x || 0, posY = view?.y || 0;
  if (bg.type === "grid") {
    const line = light ? "rgba(0,0,0,0.09)" : "rgba(255,255,255,0.13)";
    return {
      ...base,
      backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
      backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
      backgroundPosition: `${posX}px ${posY}px`,
    };
  }
  if (bg.type === "dots") {
    const dot = light ? "rgba(0,0,0,0.24)" : "rgba(255,255,255,0.3)";
    return {
      ...base,
      backgroundImage: `radial-gradient(${dot} 1.6px, transparent 1.6px)`,
      backgroundSize: `${22 * zoom}px ${22 * zoom}px`,
      backgroundPosition: `${posX}px ${posY}px`,
    };
  }
  return base;
}

const BOARD_SHORTCUT_META = [
  { id: "pan", label: "Mover quadro (segurar)", desc: "Segura a tecla pra entrar no modo de pan" },
  { id: "zoomModifier", label: "Zoom (scroll do mouse)", desc: "Modificador + scroll aplica zoom" },
  { id: "undo", label: "Desfazer", desc: "Volta o último traço/forma desenhado" },
  { id: "redo", label: "Refazer", desc: "Refaz o que foi desfeito" },
  { id: "deleteSelection", label: "Apagar seleção", desc: "Remove formas selecionadas" },
  { id: "straightLine", label: "Linha reta", desc: "Segure enquanto desenha — o traço vira linha reta" },
  { id: "toolPen", label: "Selecionar caneta", desc: "Atalho rápido pra ativar a caneta" },
  { id: "toolHighlighter", label: "Selecionar marca-texto", desc: "Atalho rápido pra ativar o marca-texto" },
  { id: "toolEraser", label: "Selecionar borracha", desc: "Atalho rápido pra ativar a borracha" },
  { id: "toolShape", label: "Selecionar formas", desc: "Atalho rápido pra ativar formas" },
  { id: "toolText", label: "Selecionar texto", desc: "Atalho rápido pra ativar texto" },
  { id: "toolSelect", label: "Selecionar (ponteiro)", desc: "Atalho rápido pra ativar a seleção" },
  { id: "toolLasso", label: "Selecionar laço", desc: "Atalho rápido pra ativar o laço" },
];

const BOARD_SHORTCUT_DEFAULTS = {
  pan: { key: "Space" },
  zoomModifier: { modifierOnly: "control" },
  undo: { key: "z", ctrl: true },
  redo: { key: "z", ctrl: true, shift: true },
  deleteSelection: { key: "Delete" },
  straightLine: { modifierOnly: "shift" },
  toolPen: { key: "1" },
  toolHighlighter: { key: "2" },
  toolEraser: { key: "3" },
  toolShape: { key: "4" },
  toolText: { key: "5" },
  toolSelect: { key: "6" },
  toolLasso: { key: "7" },
};

const BARE_MODIFIER_KEYS = { shift: "shift", control: "control", alt: "alt", meta: "meta" };
// Conserta na leitura um atalho salvo antigamente como "tecla Shift" comum
// (bug: comparava e.shiftKey === false, o que falhava ao segurar o Shift) —
// converte pro formato correto de "só modificador" sem exigir que o usuário
// resete manualmente os atalhos salvos no aparelho dele.
function normalizeBinding(binding) {
  if (binding && !binding.modifierOnly && typeof binding.key === "string" && !binding.ctrl && !binding.shift && !binding.alt) {
    const normalized = BARE_MODIFIER_KEYS[binding.key.toLowerCase()];
    if (normalized) return { modifierOnly: normalized };
  }
  return binding;
}

// Sempre usar esta função pra ler um atalho: cobre o caso de o usuário ter
// atalhos salvos de uma versão antiga, sem as chaves mais novas.
function getBinding(shortcuts, id) {
  return normalizeBinding((shortcuts && shortcuts[id]) || BOARD_SHORTCUT_DEFAULTS[id]);
}

function formatShortcut(binding) {
  if (!binding) return "—";
  if (binding.modifierOnly) return { control: "Ctrl", alt: "Alt", shift: "Shift", meta: "Cmd" }[binding.modifierOnly] || binding.modifierOnly;
  const parts = [];
  if (binding.ctrl) parts.push("Ctrl");
  if (binding.alt) parts.push("Alt");
  if (binding.shift) parts.push("Shift");
  let keyLabel = binding.key === "Space" ? "Espaço" : binding.key;
  if (keyLabel && keyLabel.length === 1) keyLabel = keyLabel.toUpperCase();
  parts.push(keyLabel);
  return parts.join(" + ");
}

// Deriva um "binding" a partir do evento de teclado capturado ao clicar em
// "Editar". Uma tecla modificadora sozinha (Ctrl/Alt/Shift) vira um atalho
// do tipo "enquanto segurada" (usado por zoom e linha reta).
function bindingFromKeyEvent(e) {
  const rawKey = e.code === "Space" ? "Space" : e.key;
  if (["Control", "Alt", "Shift", "Meta"].includes(rawKey)) return { modifierOnly: rawKey.toLowerCase() };
  return { key: rawKey, ctrl: !!e.ctrlKey, shift: !!e.shiftKey, alt: !!e.altKey };
}

function matchesShortcut(e, binding) {
  if (!binding) return false;
  if (binding.modifierOnly) {
    const map = { control: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
    return !!map[binding.modifierOnly];
  }
  const keyMatches = binding.key === "Space" ? e.code === "Space" : e.key.toLowerCase() === String(binding.key).toLowerCase();
  return keyMatches && !!(e.ctrlKey || e.metaKey) === !!binding.ctrl && !!e.shiftKey === !!binding.shift && !!e.altKey === !!binding.alt;
}

// Detecta o "keyup" que corresponde a um atalho do tipo "enquanto segurada".
function isShortcutReleaseKey(e, binding) {
  if (!binding) return false;
  if (binding.modifierOnly) {
    const keyName = { control: "Control", alt: "Alt", shift: "Shift", meta: "Meta" }[binding.modifierOnly];
    return e.key === keyName;
  }
  return binding.key === "Space" ? e.code === "Space" : e.key === binding.key;
}

// O evento de "wheel" (scroll) não é um KeyboardEvent, mas já traz os
// modificadores pressionados no momento do scroll (ctrlKey/altKey/...).
function wheelMatchesModifier(e, binding) {
  if (!binding) return e.ctrlKey || e.metaKey;
  if (binding.modifierOnly) {
    const map = { control: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
    return !!map[binding.modifierOnly];
  }
  return e.ctrlKey || e.metaKey;
}

// "Segure Shift enquanto desenha" (ou o atalho configurado): trava o traço
// numa linha reta, com o ângulo arredondado pro múltiplo de 45° mais
// próximo — igual ao comportamento clássico de Illustrator/Photoshop.
function snapPointToAngle(p0, p1) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.0001) return p1;
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: p0.x + Math.cos(angle) * dist, y: p0.y + Math.sin(angle) * dist, p: p1.p };
}

function BoardSettingsModal({
  onClose, tabs = ["fundo", "comportamento", "ferramentas", "atalhos"],
  bg, setBg,
  autoShape, setAutoShape, eraserMode, setEraserMode,
  dockPosition, setDockPosition,
  penStyle, onPenStyleChange, thickness, setThickness, opacity, setOpacity,
  hlThickness, setHlThickness, hlOpacity, setHlOpacity,
  eraserRadius, setEraserRadius,
  shortcuts, setShortcuts,
}) {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [editingShortcut, setEditingShortcut] = useState(null);

  useEffect(() => {
    if (!editingShortcut) return;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setEditingShortcut(null); return; }
      setShortcuts(prev => ({ ...prev, [editingShortcut]: bindingFromKeyEvent(e) }));
      setEditingShortcut(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editingShortcut, setShortcuts]);

  const restoreDefaults = () => {
    if (!confirm("Restaurar todos os atalhos para o padrão?")) return;
    setShortcuts({ ...BOARD_SHORTCUT_DEFAULTS });
  };

  const BG_OPTIONS = [
    { type: "white", label: "Branco" },
    { type: "grid", label: "Quadriculado" },
    { type: "dots", label: "Pontinhos" },
    { type: "color", label: "Cor" },
  ];

  return (
    <div className="readerBack" onClick={onClose}>
      <div className="readerModal boardSettingsModal" onClick={e => e.stopPropagation()}>
        <div className="readerHead">
          <b>Configurações do quadro</b>
          <button onClick={onClose}><X size={18}/></button>
        </div>
        <div className="boardSettingsTabs">
          {tabs.includes("fundo") && <button className={activeTab === "fundo" ? "active" : ""} onClick={() => setActiveTab("fundo")}>Fundo</button>}
          {tabs.includes("comportamento") && <button className={activeTab === "comportamento" ? "active" : ""} onClick={() => setActiveTab("comportamento")}>Comportamento</button>}
          {tabs.includes("ferramentas") && <button className={activeTab === "ferramentas" ? "active" : ""} onClick={() => setActiveTab("ferramentas")}>Ferramentas</button>}
          {tabs.includes("atalhos") && <button className={activeTab === "atalhos" ? "active" : ""} onClick={() => setActiveTab("atalhos")}>Atalhos</button>}
        </div>
        <div className="boardSettingsBody">
          {activeTab === "fundo" && bg && (
            <>
              <b className="boardSettingsSectionTitle">Tipo de fundo</b>
              <div className="boardBgTypeGrid">
                {BG_OPTIONS.map(opt => (
                  <button key={opt.type} type="button" className={"boardBgTypeCard" + (bg.type === opt.type ? " active" : "")} onClick={() => setBg(b => ({ ...b, type: opt.type }))}>
                    <div className="boardBgTypePreview" style={boardBgStyle(opt.type === "white" ? { type: "white", color: "#ffffff" } : { type: opt.type, color: bg.color })}/>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
              <small className="boardSettingsHint">Escolha a cor de fundo:</small>
              <div className="boardBgColorPicker">
                <input type="color" value={bg.color} onChange={e => setBg(b => ({ ...b, type: b.type === "white" ? "color" : b.type, color: e.target.value }))}/>
              </div>
            </>
          )}
          {activeTab === "comportamento" && (
            <div className="boardSettingsList">
              <label className="boardSettingsRow">
                <div><b>Corrigir forma automaticamente</b><small>Traços parecidos com linha, retângulo ou círculo viram a forma perfeita</small></div>
                <input type="checkbox" checked={!!autoShape} onChange={e => setAutoShape(e.target.checked)}/>
              </label>
              <div className="boardSettingsRow">
                <div><b>Borracha padrão</b><small>Modo usado ao trocar pra ferramenta de borracha</small></div>
                <div className="penToolGroup">
                  <button type="button" className={eraserMode === "partial" ? "active" : ""} onClick={() => setEraserMode("partial")}>Parcial</button>
                  <button type="button" className={eraserMode === "object" ? "active" : ""} onClick={() => setEraserMode("object")}>Objeto</button>
                </div>
              </div>
              {dockPosition && (
                <div className="boardSettingsRow">
                  <div><b>Posição da barra flutuante</b><small>Onde a barra de ferramentas fica ancorada na tela</small></div>
                  <div className="penToolGroup">
                    <button type="button" className={dockPosition === "left" ? "active" : ""} onClick={() => setDockPosition("left")}>Esquerda</button>
                    <button type="button" className={dockPosition === "right" ? "active" : ""} onClick={() => setDockPosition("right")}>Direita</button>
                    <button type="button" className={dockPosition === "top" ? "active" : ""} onClick={() => setDockPosition("top")}>Cima</button>
                    <button type="button" className={dockPosition === "bottom" ? "active" : ""} onClick={() => setDockPosition("bottom")}>Baixo</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {activeTab === "ferramentas" && (
            <div className="boardSettingsList">
              <div className="boardSettingsRow boardSettingsRowWrap">
                <div><b>Caneta</b><small>Estilo, espessura e opacidade padrão</small></div>
                <div className="boardSettingsRowControls">
                  <select value={penStyle} onChange={e => onPenStyleChange(e.target.value)}>
                    <option value="normal">Normal</option>
                    <option value="pencil">Lápis</option>
                    <option value="marker">Marcador/brush</option>
                  </select>
                  <label className="penSliderLabel">Espessura<input type="range" min="1" max="14" step="0.5" value={thickness} onChange={e => setThickness(+e.target.value)}/></label>
                  <label className="penSliderLabel">Opacidade<input type="range" min="0.2" max="1" step="0.05" value={opacity} onChange={e => setOpacity(+e.target.value)}/></label>
                </div>
              </div>
              <div className="boardSettingsRow boardSettingsRowWrap">
                <div><b>Marca-texto</b><small>Espessura e opacidade padrão</small></div>
                <div className="boardSettingsRowControls">
                  <label className="penSliderLabel">Espessura<input type="range" min="6" max="34" step="1" value={hlThickness} onChange={e => setHlThickness(+e.target.value)}/></label>
                  <label className="penSliderLabel">Opacidade<input type="range" min="0.15" max="0.7" step="0.05" value={hlOpacity} onChange={e => setHlOpacity(+e.target.value)}/></label>
                </div>
              </div>
              <div className="boardSettingsRow boardSettingsRowWrap">
                <div><b>Borracha</b><small>Tamanho padrão (modo parcial)</small></div>
                <div className="boardSettingsRowControls">
                  <label className="penSliderLabel">Tamanho<input type="range" min="4" max="30" step="1" value={eraserRadius} onChange={e => setEraserRadius(+e.target.value)}/></label>
                </div>
              </div>
            </div>
          )}
          {activeTab === "atalhos" && (
            <div className="boardShortcutsList">
              <b className="boardSettingsSectionTitle">Teclas de atalho</b>
              <p className="boardSettingsHint">Clique em "Editar" e pressione a combinação desejada. Use Esc pra cancelar.</p>
              {BOARD_SHORTCUT_META.map(meta => (
                <div className="boardShortcutRow" key={meta.id}>
                  <div><b>{meta.label}</b><small>{meta.desc}</small></div>
                  <div className="boardShortcutRowActions">
                    <span className="boardShortcutKey">{editingShortcut === meta.id ? "Pressione uma tecla..." : formatShortcut(getBinding(shortcuts, meta.id))}</span>
                    <button type="button" onClick={() => setEditingShortcut(meta.id)}>Editar</button>
                  </div>
                </div>
              ))}
              <button type="button" className="boardSettingsRestoreBtn" onClick={restoreDefaults}><RotateCcw size={14}/> Restaurar padrões</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StudyPdfReader({ pdfDoc, tempFile, onClose, onProgress, onNotesChange, onFavoritesChange, onImportantChange, onFavoriteExcerptsChange, onCreateFlashcard, onDrawingsChange }) {
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
  const [penLineStyle, setPenLineStyle] = useState("solid"); // solid | dashed | arrow — em que a linha reta da caneta (atalho/correção automática) vira
  const [color, setColor] = useState("#1f2937");
  const [favPenColors, setFavPenColors] = usePersistentState("pdfFavPenColors", ["#1f2937", "#e11d48", "#2563eb", "#16a34a"]);
  const [thickness, setThickness] = useState(3);
  const [opacity, setOpacity] = useState(1);
  const [hlColor, setHlColor] = useState("#ffd54a");
  const [favHlColors, setFavHlColors] = usePersistentState("pdfFavHlColors", ["#ffd54a", "#ff6b6b", "#4ade80", "#5b9dff"]);
  const [hlThickness, setHlThickness] = useState(16);
  const [hlOpacity, setHlOpacity] = useState(0.4);
  const [eraserRadius, setEraserRadius] = useState(12);
  const [autoShape, setAutoShape] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcuts, setShortcuts] = usePersistentState("studyPdfShortcuts", BOARD_SHORTCUT_DEFAULTS);
  const [dockPosition, setDockPosition] = usePersistentState("studyPdfDockPosition", "left");
  const [styleFlyoutOpen, setStyleFlyoutOpen] = useState(false);
  const straightLineHeldRef = useRef(false);
  // true quando o traço atual foi retificado pelo atalho de linha reta —
  // usado no fim do traço pra virar a mesma "forma" de linha que a correção
  // automática produz, em vez de continuar como um traço à mão livre.
  const straightLineUsedRef = useRef(false);
  const [drawings, setDrawings] = useState({});
  const [drawingsLoaded, setDrawingsLoaded] = useState(false);

  // Modo Caneta agora guarda tudo só no IndexedDB local (mesmo padrão do
  // quadro infinito) — não sobe mais pro Supabase a cada pausa de desenho.
  // Se o PDF ainda tiver um "drawings" antigo salvo na nuvem, migra uma
  // única vez pro IndexedDB e limpa a coluna na nuvem.
  const drawingsIdbKey = pdfDoc.id != null ? `pdf_drawings:${pdfDoc.id}` : null;
  useEffect(() => {
    if (!drawingsIdbKey) { setDrawings({}); setDrawingsLoaded(true); return; }
    let cancelled = false;
    (async () => {
      const fromIdb = await idbGet(drawingsIdbKey, null);
      if (cancelled) return;
      if (fromIdb && Object.keys(fromIdb).length) {
        setDrawings(fromIdb);
        setDrawingsLoaded(true);
        return;
      }
      const legacyCloud = pdfDoc.drawings;
      if (legacyCloud && Object.keys(legacyCloud).length) {
        setDrawings(legacyCloud);
        await idbSet(drawingsIdbKey, legacyCloud);
        onDrawingsChange(pdfDoc.id, {}); // esvazia a coluna antiga na nuvem
      }
      setDrawingsLoaded(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingsIdbKey]);
  const [annotationsVisible, setAnnotationsVisible] = useState(true);
  const [liveAnn, setLiveAnn] = useState(null);
  const [selectedAnnId, setSelectedAnnId] = useState(null);
  const [lassoSelectedIds, setLassoSelectedIds] = useState([]);
  const [lassoPath, setLassoPath] = useState(null);
  const lassoDrawRef = useRef(null);
  const lassoGroupDragRef = useRef(null);
  const [editingTextId, setEditingTextId] = useState(null);
  // Modo "caneta vira texto" da caixa de texto: handwritingId marca qual
  // texto está com o painel de caneta aberto (em vez do textarea), e
  // pendingTextDraft guarda o conteúdo acumulado enquanto alterna entre
  // teclado e caneta (o texto reconhecido vai sendo somado ali).
  const [handwritingId, setHandwritingId] = useState(null);
  const [pendingTextDraft, setPendingTextDraft] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [pastePulse, setPastePulse] = useState(false);
  const [basePageSize, setBasePageSize] = useState({ width: 0, height: 0 });

  // --- Cronômetro (contagem regressiva) do leitor: útil pra simular tempo de
  // prova. Os campos de horas/min/seg definem o tempo; ao começar, conta
  // regressivamente até zero, toca um alarme e pisca até ser zerado.
  // Guardado no localStorage (chave "studyPdfTimer") pra sobreviver ao fechar
  // o leitor: ao sair, o cronômetro é pausado (nunca continua contando em
  // segundo plano) e mantém o tempo restante até a pessoa retomar ou zerar.
  const savedTimer = useRef(loadLocal("studyPdfTimer", null)).current;
  const [timerH, setTimerH] = useState(savedTimer?.h ?? 0);
  const [timerM, setTimerM] = useState(savedTimer?.m ?? 0);
  const [timerS, setTimerS] = useState(savedTimer?.s ?? 0);
  const [timerLeft, setTimerLeft] = useState(savedTimer?.left ?? 0); // segundos restantes, só existe depois de "Começar"
  const [timerRunning, setTimerRunning] = useState(false); // sempre reabre pausado, mesmo se estava rodando ao sair
  const [timerDone, setTimerDone] = useState(savedTimer?.done ?? false); // true = tempo zerou, tocando/piscando
  // Oculta os números do cronômetro (útil em prova, pra não ficar checando o
  // tempo toda hora) sem pausar a contagem — ela continua rodando por trás.
  // Ao zerar o tempo o cronômetro sempre reaparece sozinho.
  const [timerHidden, setTimerHidden] = useState(savedTimer?.hidden ?? false);
  const timerIntervalRef = useRef(null);
  // Horário (epoch ms) em que o cronômetro deve zerar, calculado a partir do
  // relógio real ao começar/retomar. É a partir dele que o tempo restante é
  // recalculado a cada tick — nunca por contagem de ticks do setInterval,
  // que atrasa quando a aba fica em segundo plano (o navegador limita a
  // frequência dos timers pra economizar bateria). Assim, mesmo que o
  // intervalo dispare bem menos vezes que o esperado enquanto a página está
  // escondida, o tempo restante mostrado ao voltar continua correto.
  const timerEndAtRef = useRef(null);
  const alarmIntervalRef = useRef(null);
  const audioCtxRef = useRef(null);
  // Marca quais "horas passadas" e se o aviso dos 30 min finais já apitaram
  // nesta sessão do cronômetro, pra cada um apitar só uma vez.
  const hourBeepsFiredRef = useRef(new Set());
  const finalStretchBeepFiredRef = useRef(false);
  // Aviso visual que acompanha o apito de hora passada / 30 min finais: some
  // sozinho depois de alguns segundos, não precisa de nenhuma ação da pessoa.
  const [timerToast, setTimerToast] = useState(null);
  const timerToastTimeoutRef = useRef(null);
  const showTimerToast = (msg) => {
    clearTimeout(timerToastTimeoutRef.current);
    setTimerToast(msg);
    timerToastTimeoutRef.current = setTimeout(() => setTimerToast(null), 5000);
  };
  // Cursor customizado: uma bolinha da cor/espessura da ferramenta atual,
  // que segue o ponteiro (mouse/caneta) e some enquanto o traço está sendo feito.
  const [showPenCursor, setShowPenCursor] = useState(false);

  const drawSvgRef = useRef(null);
  const isDrawingRef = useRef(false);
  const historyRef = useRef([]);
  const redoRef = useRef([]);
  const dragRef = useRef(null);
  const textResizeAnnRef = useRef(null);
  const eraseGestureRef = useRef(false);
  const drawSaveTimer = useRef(null);
  const penCursorRef = useRef(null);

  // --- Navegar segurando espaço: igual ao quadro (canvas infinito) — segurar a
  // barra de espaço e arrastar rola o PDF, sem ativar o botão que estiver com foco.
  const spaceDownRef = useRef(false);
  const spacePanRef = useRef(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [spacePanning, setSpacePanning] = useState(false);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const modalRef = useRef(null);
  const [fullscreen, toggleFullscreen] = useFullscreen(modalRef, { startOpen: true });
  const textLayerRef = useRef(null);
  const pageWrapRef = useRef(null);
  const notesBodyRef = useRef(null);
  const notesSaveTimer = useRef(null);
  const searchToken = useRef(0);
  const renderTaskRef = useRef(null);
  const pdfBytesRef = useRef(null); // bytes crus do PDF atual, usados pelo "Baixar PDF" (arquivo exatamente como está salvo)

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        // Modo "abrir sem salvar": os bytes já estão no aparelho (o File
        // veio do seletor de arquivo), então nem passa perto do Supabase.
        const blob = tempFile || await downloadStudyPdfFile(pdfDoc.file_path);
        const buf = await blob.arrayBuffer();
        // Guarda uma cópia antes: pdf.js pode "esvaziar" o ArrayBuffer que
        // recebe (transferable), então o que sobra pra reaproveitar depois
        // (botão "Baixar PDF") precisa ser um buffer separado.
        pdfBytesRef.current = buf.slice(0);
        const doc = await pdfjsLib.getDocument({ data: buf, wasmUrl: pdfWasmUrl }).promise;
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
  }, [pdfDoc.file_path, tempFile]);

  useEffect(() => {
    const handlePaste = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type?.startsWith("image/")) {
          e.preventDefault();
          insertImageAnnotation(item.getAsFile());
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
      // O pinça no touchpad sempre chega com ctrlKey=true (convenção do navegador,
      // não é a tecla Ctrl real sendo apertada) — por isso continua funcionando
      // mesmo que o atalho de zoom tenha sido trocado para outro modificador.
      if (!e.ctrlKey && !wheelMatchesModifier(e, getBinding(shortcuts, "zoomModifier"))) return;
      e.preventDefault();
      setFitWidth(false);
      setZoom(z => Math.min(3, Math.max(0.3, +(z - e.deltaY * 0.01).toFixed(2))));
    };
    el.addEventListener("wheel", handleWheelZoom, { passive: false });
    return () => el.removeEventListener("wheel", handleWheelZoom);
  }, [shortcuts]);

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
    if (!drawingsIdbKey || !drawingsLoaded) return;
    clearTimeout(drawSaveTimer.current);
    drawSaveTimer.current = setTimeout(() => idbSet(drawingsIdbKey, next), 500);
  };
  const flushDrawings = () => {
    if (!drawingsIdbKey || !drawingsLoaded) return;
    clearTimeout(drawSaveTimer.current);
    idbSet(drawingsIdbKey, drawings);
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

  // ---- Inserir imagem/print como anotação (uma "figurinha" arrastável e
  // redimensionável sobre a página, igual a um retângulo — reaproveita toda
  // a mesma seleção/arraste/redimensionamento das formas).
  const imageInputRef = useRef(null);
  const insertImageAnnotation = async (file) => {
    if (!file || !file.type?.startsWith("image/")) return;
    try {
      // Comprime antes de guardar: essa imagem entra no JSON de anotações do
      // PDF, então cada byte aqui é baixado de novo toda vez que a página é
      // aberta ou sincronizada.
      const { dataUrl, width: iw, height: ih } = await compressImageForPage(file, 1200, 1600, 0.82);
      const maxW = basePageSize.width * 0.55;
      const scale = iw > maxW ? maxW / iw : 1;
      const w = iw * scale, h = ih * scale;
      const cx = basePageSize.width / 2, cy = basePageSize.height / 2;
      const ann = {
        id: crypto.randomUUID(), type: "shape", shape: "image", src: dataUrl,
        x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2,
      };
      commitAnnotation(ann);
      setTool("select");
      setSelectedAnnId(ann.id);
    } catch (e) {
      console.error(e);
      alert("Não foi possível inserir essa imagem.");
    }
  };

  // ---- Copiar/colar anotações entre páginas: guarda uma cópia "congelada"
  // do que estava selecionado (laço ou seleção única) e cola no ponto onde
  // a página está sendo vista agora, em qualquer página do mesmo PDF.
  const annotationClipboardRef = useRef([]);
  const [clipboardCount, setClipboardCount] = useState(0);
  const copySelection = () => {
    const ids = lassoSelectedIds.length ? lassoSelectedIds : (selectedAnnId ? [selectedAnnId] : []);
    if (!ids.length) return;
    const list = drawings[pageNum] || [];
    const copied = list.filter(a => ids.includes(a.id));
    if (!copied.length) return;
    annotationClipboardRef.current = JSON.parse(JSON.stringify(copied));
    setClipboardCount(copied.length);
    toast?.("Copiado! Troque de página e cole com o botão ou Ctrl+V.");
  };
  const pasteClipboard = () => {
    const items = annotationClipboardRef.current;
    if (!items.length) return;
    pushHistory();
    const newIds = [];
    const pasted = items.map(a => {
      const id = crypto.randomUUID();
      newIds.push(id);
      const offset = 18; // desloca um pouco pra não colar exatamente em cima
      const clone = { ...a, id };
      if (clone.type === "text") { clone.x += offset; clone.y += offset; }
      else if (clone.type === "shape") {
        clone.x1 += offset; clone.y1 += offset; clone.x2 += offset; clone.y2 += offset;
        if (clone.cx != null) { clone.cx += offset; clone.cy += offset; }
      } else if (clone.type === "stroke") {
        clone.points = (clone.points || []).map(p => ({ ...p, x: p.x + offset, y: p.y + offset }));
      }
      return clone;
    });
    setDrawings(prev => {
      const next = { ...prev, [pageNum]: [...(prev[pageNum] || []), ...pasted] };
      scheduleDrawingsSave(next);
      return next;
    });
    setTool("select");
    setLassoSelectedIds(newIds);
    setSelectedAnnId(null);
  };
  useEffect(() => {
    const handler = (e) => {
      if (!penMode) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") { copySelection(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && annotationClipboardRef.current.length) { e.preventDefault(); pasteClipboard(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [penMode, lassoSelectedIds, selectedAnnId, drawings, pageNum]);

  // ---- Apontador laser: só um indicador visual temporário que segue o
  // ponteiro e desaparece sozinho — nunca vira anotação salva.
  const [laserPoints, setLaserPoints] = useState([]);
  const laserFadeRef = useRef(null);
  const addLaserPoint = (x, y) => {
    const id = Date.now() + Math.random();
    setLaserPoints(pts => [...pts.slice(-40), { id, x, y }]);
    clearTimeout(laserFadeRef.current);
    laserFadeRef.current = setTimeout(() => setLaserPoints([]), 900);
  };

  const togglePenMode = () => {
    setPenMode(m => {
      if (m) { flushDrawings(); setSelectedAnnId(null); setEditingTextId(null); }
      return !m;
    });
  };

  // Fecha o painel flutuante de estilo sempre que trocar de ferramenta — ele
  // só reabre com um duplo toque na ferramenta ativa (igual no quadro infinito).
  useEffect(() => { setStyleFlyoutOpen(false); }, [tool]);

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
    if (!penMode || (tool !== "pen" && tool !== "highlighter" && tool !== "eraser")) setShowPenCursor(false);
    if (tool !== "laser") setLaserPoints([]);
  }, [penMode, tool]);

  // Some com a seleção do laço sempre que trocar de ferramenta.
  useEffect(() => {
    if (tool !== "lasso") {
      setLassoSelectedIds([]);
      setLassoPath(null);
      lassoDrawRef.current = null;
      lassoGroupDragRef.current = null;
    }
  }, [tool]);

  const deleteLassoSelection = () => {
    if (!lassoSelectedIds.length) return;
    pushHistory();
    setDrawings(prev => {
      const next = { ...prev, [pageNum]: (prev[pageNum] || []).filter(a => !lassoSelectedIds.includes(a.id)) };
      scheduleDrawingsSave(next);
      return next;
    });
    setLassoSelectedIds([]);
  };

  const changeLassoColor = (hex) => {
    if (!lassoSelectedIds.length) return;
    pushHistory();
    setDrawings(prev => {
      const next = { ...prev, [pageNum]: (prev[pageNum] || []).map(a => lassoSelectedIds.includes(a.id) ? { ...a, color: hex } : a) };
      scheduleDrawingsSave(next);
      return next;
    });
  };

  const addTextAnnotation = (x, y) => {
    const id = crypto.randomUUID();
    const ann = { id, type: "text", x, y, fontSize: 16, color, content: "", width: 220, height: Math.round(16 * 1.6) + 14 };
    commitAnnotation(ann);
    setPendingTextDraft(null);
    setHandwritingId(null);
    setEditingTextId(id);
    // Sem isso a ferramenta continua em "text": a caixa recém-criada fica com
    // pointer-events desligado (só liga com tool==="select"), então o clique
    // no botão "escrever à mão" atravessa a caixa e cai na camada de desenho,
    // que interpreta como um novo toque com a ferramenta texto — criando
    // outra caixa em vez de abrir o painel de caneta.
    setTool("select");
  };

  const commitTextEdit = (id, value) => {
    setEditingTextId(null);
    setHandwritingId(null);
    setPendingTextDraft(null);
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
    if (!eraseGestureRef.current) { pushHistory(); eraseGestureRef.current = true; }
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
      // A bolinha visível fica no canto da bbox + pad (mesma folga usada no
      // render da pdfSelectionBox), então o alvo do clique precisa mirar
      // nesse mesmo ponto — senão a área que responde ao toque fica
      // deslocada da bolinha desenhada na tela.
      const pad = Math.max(basePageSize.width, basePageSize.height) * 0.012;
      if (sel && sel.type === "shape" && Math.hypot(x - (sel.x2 + pad), y - (sel.y2 + pad)) < 14) {
        pushHistory();
        dragRef.current = { mode: "resize", id: sel.id };
        return;
      }
      if (sel && sel.type === "image" && Math.hypot(x - (sel.x + sel.width + pad), y - (sel.y + sel.height + pad)) < 14) {
        pushHistory();
        dragRef.current = { mode: "resize", id: sel.id };
        return;
      }
      if (sel && sel.type === "stroke") {
        const b = annotationBBox(sel);
        if (Math.hypot(x - (b.x + b.w + pad), y - (b.y + b.h + pad)) < 14) {
          pushHistory();
          dragRef.current = { mode: "resize", id: sel.id };
          return;
        }
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
      straightLineUsedRef.current = false;
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
    } else if (tool === "laser") {
      isDrawingRef.current = true;
      addLaserPoint(x, y);
    } else if (tool === "text") {
      addTextAnnotation(x, y);
    } else if (tool === "select") {
      handleSelectPointerDown(x, y);
    } else if (tool === "lasso") {
      if (lassoSelectedIds.length) {
        const list = drawings[pageNum] || [];
        const boxes = list.filter(a => lassoSelectedIds.includes(a.id)).map(annotationBBox);
        if (boxes.length) {
          const b = unionBBox(boxes);
          const pad = Math.max(basePageSize.width, basePageSize.height) * 0.012;
          // A bolinha é desenhada no canto + pad (mesma conta usada no render
          // da pdfSelectionBox), então o teste de clique tem que mirar nesse
          // mesmo ponto — senão a área que realmente responde ao toque fica
          // deslocada da bolinha que aparece na tela.
          if (Math.hypot(x - (b.x + b.w + pad), y - (b.y + b.h + pad)) < 14) {
            pushHistory();
            lassoGroupDragRef.current = { mode: "resize" };
            return;
          }
          if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) {
            pushHistory();
            lassoGroupDragRef.current = { mode: "move", lastX: x, lastY: y };
            return;
          }
        }
      }
      setLassoSelectedIds([]);
      lassoDrawRef.current = { points: [{ x, y }] };
      setLassoPath([{ x, y }]);
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
    } else if (tool === "eraser" && (e.pointerType === "mouse" || e.pointerType === "pen")) {
      movePenCursor(e.clientX, e.clientY);
      setShowPenCursor(true);
    } else if (showPenCursor) {
      setShowPenCursor(false);
    }
    if (textResizeAnnRef.current) {
      const { x } = toPageCoords(e.clientX, e.clientY);
      const { id, startX, startWidth } = textResizeAnnRef.current;
      const newWidth = Math.max(60, startWidth + (x - startX));
      setDrawings(prev => {
        const list = prev[pageNum] || [];
        const next = list.map(a => a.id === id ? { ...a, width: newWidth } : a);
        const nextAll = { ...prev, [pageNum]: next };
        scheduleDrawingsSave(nextAll);
        return nextAll;
      });
      return;
    }
    if (tool === "select") {
      if (!dragRef.current) return;
      const { x, y } = toPageCoords(e.clientX, e.clientY);
      handleSelectPointerMove(x, y);
      return;
    }
    if (tool === "lasso") {
      if (lassoGroupDragRef.current) {
        const { x, y } = toPageCoords(e.clientX, e.clientY);
        const drag = lassoGroupDragRef.current;
        if (drag.mode === "resize") {
          setDrawings(prev => {
            const list = prev[pageNum] || [];
            const selected = list.filter(a => lassoSelectedIds.includes(a.id));
            if (!selected.length) return prev;
            const box = unionBBox(selected.map(annotationBBox));
            const anchor = { x: box.x, y: box.y };
            const scaleX = Math.max(6, x - anchor.x) / (box.w || 1);
            const scaleY = Math.max(6, y - anchor.y) / (box.h || 1);
            const next = list.map(a => lassoSelectedIds.includes(a.id) ? scaleAnnotationFromAnchor(a, anchor, scaleX, scaleY) : a);
            const nextAll = { ...prev, [pageNum]: next };
            scheduleDrawingsSave(nextAll);
            return nextAll;
          });
          return;
        }
        const dx = x - drag.lastX, dy = y - drag.lastY;
        drag.lastX = x; drag.lastY = y;
        setDrawings(prev => {
          const list = prev[pageNum] || [];
          const next = list.map(a => lassoSelectedIds.includes(a.id) ? translateAnnotation(a, dx, dy) : a);
          const nextAll = { ...prev, [pageNum]: next };
          scheduleDrawingsSave(nextAll);
          return nextAll;
        });
        return;
      }
      if (lassoDrawRef.current) {
        const { x, y } = toPageCoords(e.clientX, e.clientY);
        lassoDrawRef.current.points.push({ x, y });
        setLassoPath([...lassoDrawRef.current.points]);
        return;
      }
      return;
    }
    if (!isDrawingRef.current) return;
    const { x, y } = toPageCoords(e.clientX, e.clientY);
    if (tool === "laser") { addLaserPoint(x, y); return; }
    if (tool === "pen" || tool === "highlighter") {
      setLiveAnn(prev => {
        if (!prev) return prev;
        const p = { x, y, p: tool === "highlighter" ? 0.5 : (e.pressure || 0.5) };
        if (straightLineHeldRef.current) {
          const start = prev.points[0];
          straightLineUsedRef.current = true;
          return { ...prev, points: [start, snapPointToAngle(start, p)] };
        }
        return { ...prev, points: [...prev.points, p] };
      });
    } else if (tool === "shape") {
      setLiveAnn(prev => prev ? { ...prev, x2: x, y2: y } : prev);
    } else if (tool === "eraser") {
      if (eraserMode === "object") eraseObjectAt(x, y); else eraseRadiusAt(x, y);
    }
  };

  const handleDrawPointerUp = () => {
    if (textResizeAnnRef.current) { textResizeAnnRef.current = null; return; }
    if (tool === "select") { dragRef.current = null; return; }
    if (tool === "lasso") {
      if (lassoGroupDragRef.current) { lassoGroupDragRef.current = null; return; }
      if (lassoDrawRef.current) {
        const pts = lassoDrawRef.current.points;
        lassoDrawRef.current = null;
        setLassoPath(null);
        if (pts.length > 2) {
          const list = drawings[pageNum] || [];
          const ids = list.filter(a => pointInPolygon(bboxCenter(annotationBBox(a)), pts)).map(a => a.id);
          setLassoSelectedIds(ids);
        } else {
          setLassoSelectedIds([]);
        }
      }
      return;
    }
    if (tool === "eraser") { eraseGestureRef.current = false; isDrawingRef.current = false; return; }
    if (tool === "laser") { isDrawingRef.current = false; return; }
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (!liveAnn) return;
    // >= 1, não > 1: um traço rápido/leve pode gerar só um ponto (sem
    // pointermove entre o down e o up) — isso é um ponto/pingo legítimo
    // (a renderização já sabe desenhar isso como uma bolinha), então não
    // pode ser descartado silenciosamente.
    if ((tool === "pen" || tool === "highlighter") && liveAnn.points.length >= 1) {
      let finalAnn = liveAnn;
      if ((tool === "pen" || tool === "highlighter") && straightLineUsedRef.current && finalAnn.points.length === 2) {
        // Mesmo resultado de quando a "correção automática" reconhece uma
        // reta: vira uma forma de linha de verdade, não um traço à mão livre
        // de 2 pontos — assim o atalho e a correção automática desenham
        // exatamente igual. Pro destacador, vira uma barra de marca-texto
        // reta (ponta quadrada, sem afinar) em vez de uma linha fina. Pra
        // caneta, respeita o estilo escolhido (normal/tracejada/seta).
        const [p0, p1] = finalAnn.points;
        finalAnn = penStraightLineShape({
          id: finalAnn.id, tool: finalAnn.tool, color: finalAnn.color, width: finalAnn.width, opacity: finalAnn.opacity,
          x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y,
        }, penLineStyle);
      } else if (tool === "pen" && autoShape && finalAnn.points.length > 6) {
        const detected = detectShapeFromPoints(finalAnn.points);
        if (detected) {
          finalAnn = detected.type === "line"
            ? penStraightLineShape({
                id: finalAnn.id, tool: finalAnn.tool, color: finalAnn.color, width: finalAnn.width, opacity: finalAnn.opacity,
                x1: detected.x1, y1: detected.y1, x2: detected.x2, y2: detected.y2,
              }, penLineStyle)
            : {
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

  // Baixa o PDF exatamente como está (sem anotações "queimadas").
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

  const fmt = useNoteFormatting(notesBodyRef, scheduleNotesSave);

  // Toca um "bip" curto via Web Audio API (não depende de nenhum arquivo de
  // áudio externo, então funciona offline como o resto do app).
  const playTimerBeep = () => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      o.connect(g); g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.5);
    } catch (err) { console.log("[timer] não foi possível tocar o alarme", err); }
  };

  // Limpa o timeout do aviso visual se o leitor fechar antes dele sumir sozinho.
  useEffect(() => () => clearTimeout(timerToastTimeoutRef.current), []);

  // Contagem regressiva: a cada tick, recalcula quanto falta a partir do
  // horário real de término (timerEndAtRef), em vez de simplesmente
  // decrementar 1s por tick. Isso evita o cronômetro "atrasar" quando a aba
  // fica em segundo plano e o navegador reduz a frequência do setInterval.
  useEffect(() => {
    clearInterval(timerIntervalRef.current);
    if (timerRunning) {
      const tick = () => {
        const remaining = Math.max(0, Math.round((timerEndAtRef.current - Date.now()) / 1000));
        setTimerLeft(remaining);
        if (remaining <= 0) {
          clearInterval(timerIntervalRef.current);
          setTimerRunning(false);
          setTimerDone(true);
        }
      };
      tick(); // corrige na hora, sem esperar o primeiro disparo do intervalo
      timerIntervalRef.current = setInterval(tick, 1000);
    }
    return () => clearInterval(timerIntervalRef.current);
  }, [timerRunning]);

  // Ao voltar pra aba/app (troca de aba, app minimizado, tela bloqueada),
  // recalcula o tempo restante imediatamente com base no relógio real, em vez
  // de esperar o próximo tick do intervalo (que pode ter ficado atrasado
  // durante o tempo em segundo plano).
  useEffect(() => {
    const recomputeNow = () => {
      if (!timerRunning || timerEndAtRef.current == null) return;
      const remaining = Math.max(0, Math.round((timerEndAtRef.current - Date.now()) / 1000));
      setTimerLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timerIntervalRef.current);
        setTimerRunning(false);
        setTimerDone(true);
      }
    };
    const onVisibility = () => { if (document.visibilityState === "visible") recomputeNow(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", recomputeNow);
    window.addEventListener("pageshow", recomputeNow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", recomputeNow);
      window.removeEventListener("pageshow", recomputeNow);
    };
  }, [timerRunning]);

  // Salva o estado do cronômetro no localStorage a cada mudança, pra ele
  // sobreviver ao fechar o leitor (só o "running" nunca é salvo como true —
  // ele sempre reabre pausado, ver comentário na declaração do state acima).
  useEffect(() => {
    saveLocal("studyPdfTimer", { h: timerH, m: timerM, s: timerS, left: timerLeft, done: timerDone, hidden: timerHidden });
  }, [timerH, timerM, timerS, timerLeft, timerDone, timerHidden]);

  // Salva também na hora H de sair do app (aba escondida, PWA minimizado ou
  // fechado no celular) — o efeito acima já salva a cada segundo, mas isso
  // garante que o último instante não se perca se o navegador matar a aba
  // antes do próximo tick do intervalo.
  useEffect(() => {
    const saveNow = () => {
      saveLocal("studyPdfTimer", { h: timerH, m: timerM, s: timerS, left: timerLeft, done: timerDone, hidden: timerHidden });
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") saveNow(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", saveNow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", saveNow);
    };
  }, [timerH, timerM, timerS, timerLeft, timerDone, timerHidden]);

  // Enquanto o tempo tiver zerado (timerDone), repete o bipe até a pessoa zerar.
  // Também reexibe os números automaticamente, mesmo se estava oculto.
  useEffect(() => {
    clearInterval(alarmIntervalRef.current);
    if (timerDone) {
      setTimerHidden(false);
      playTimerBeep();
      alarmIntervalRef.current = setInterval(playTimerBeep, 900);
    }
    return () => clearInterval(alarmIntervalRef.current);
  }, [timerDone]);

  // Apita uma vez a cada hora de prova que já passou, e uma vez ao entrar nos
  // últimos 30 minutos — mesmo com o cronômetro oculto, pra dar uma noção de
  // como o tempo está passando sem precisar olhar os números.
  useEffect(() => {
    if (!timerRunning || timerLeft <= 0) return;
    const elapsed = timerTotalInput - timerLeft;
    if (elapsed > 0 && elapsed % 3600 === 0 && !hourBeepsFiredRef.current.has(elapsed)) {
      hourBeepsFiredRef.current.add(elapsed);
      playTimerBeep();
      const hoursPassed = elapsed / 3600;
      showTimerToast(hoursPassed === 1 ? "Passou-se 1 hora" : `Passaram-se ${hoursPassed} horas`);
    }
    if (timerLeft === 1800 && timerTotalInput > 1800 && !finalStretchBeepFiredRef.current) {
      finalStretchBeepFiredRef.current = true;
      playTimerBeep();
      showTimerToast("Faltam 30 minutos");
    }
  }, [timerLeft, timerRunning]);

  const timerTotalInput = timerH * 3600 + timerM * 60 + timerS;
  const startTimer = () => {
    if (timerTotalInput <= 0) return;
    hourBeepsFiredRef.current = new Set();
    finalStretchBeepFiredRef.current = false;
    setTimerDone(false);
    setTimerLeft(timerTotalInput);
    timerEndAtRef.current = Date.now() + timerTotalInput * 1000;
    setTimerRunning(true);
  };
  const pauseTimer = () => setTimerRunning(false);
  const resumeTimer = () => {
    if (timerLeft > 0) {
      timerEndAtRef.current = Date.now() + timerLeft * 1000;
      setTimerRunning(true);
    }
  };
  const resetTimer = () => {
    timerEndAtRef.current = null;
    clearInterval(timerIntervalRef.current);
    clearInterval(alarmIntervalRef.current);
    clearTimeout(timerToastTimeoutRef.current);
    setTimerToast(null);
    hourBeepsFiredRef.current = new Set();
    finalStretchBeepFiredRef.current = false;
    setTimerRunning(false);
    setTimerDone(false);
    setTimerLeft(0);
    setTimerH(0); setTimerM(0); setTimerS(0);
    setTimerHidden(false);
    removeLocalKey("studyPdfTimer");
  };
  const fmtTimer = (totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  };
  const timerStarted = timerRunning || timerDone || timerLeft > 0;

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
    clearInterval(timerIntervalRef.current);
    clearInterval(alarmIntervalRef.current);
    // Pausa (não zera) o cronômetro ao sair: o tempo restante já está salvo
    // no localStorage pelo efeito acima, então na próxima abertura ele volta
    // pausado com o mesmo tempo, em vez de reiniciar do zero.
    saveLocal("studyPdfTimer", { h: timerH, m: timerM, s: timerS, left: timerLeft, done: timerDone });
    if (document.fullscreenElement) document.exitFullscreen?.().catch(()=>{});
    onClose();
  };

  useEffect(() => {
    const handler = (e) => {
      if (panel==="notas") return; // não interfere na digitação das notas
      if (["INPUT","TEXTAREA"].includes(e.target.tagName)) return;
      const panBinding = getBinding(shortcuts, "pan");
      if (matchesShortcut(e, panBinding)) {
        // preventDefault aqui é essencial: sem ele, se o foco estiver num botão
        // (ex.: o botão "Escrever" logo após ser clicado), o navegador trata o
        // espaço como um clique nesse botão e ele fica abrindo/fechando sozinho.
        e.preventDefault();
        if (!spaceDownRef.current) { spaceDownRef.current = true; setSpaceHeld(true); }
        return;
      }
      if (matchesShortcut(e, getBinding(shortcuts, "straightLine"))) straightLineHeldRef.current = true;
      if (!penMode && e.key === "ArrowRight") goTo(pageNum + 1);
      if (!penMode && e.key === "ArrowLeft") goTo(pageNum - 1);
      if (e.key === "Escape") { if (penMode && tool === "lasso" && lassoSelectedIds.length) setLassoSelectedIds([]); else if (penMode) togglePenMode(); else handleClose(); }
      if (penMode && matchesShortcut(e, getBinding(shortcuts, "redo"))) { e.preventDefault(); redo(); }
      else if (penMode && matchesShortcut(e, getBinding(shortcuts, "undo"))) { e.preventDefault(); undo(); }
      if (penMode && matchesShortcut(e, getBinding(shortcuts, "deleteSelection")) && tool === "lasso" && lassoSelectedIds.length) deleteLassoSelection();
      if (penMode) {
        if (matchesShortcut(e, getBinding(shortcuts, "toolPen"))) setTool("pen");
        else if (matchesShortcut(e, getBinding(shortcuts, "toolHighlighter"))) setTool("highlighter");
        else if (matchesShortcut(e, getBinding(shortcuts, "toolEraser"))) setTool("eraser");
        else if (matchesShortcut(e, getBinding(shortcuts, "toolShape"))) setTool("shape");
        else if (matchesShortcut(e, getBinding(shortcuts, "toolText"))) setTool("text");
        else if (matchesShortcut(e, getBinding(shortcuts, "toolSelect"))) setTool("select");
        else if (matchesShortcut(e, getBinding(shortcuts, "toolLasso"))) setTool("lasso");
      }
    };
    const onKeyUp = (e) => {
      if (isShortcutReleaseKey(e, getBinding(shortcuts, "pan"))) { spaceDownRef.current = false; setSpaceHeld(false); spacePanRef.current = null; setSpacePanning(false); }
      if (isShortcutReleaseKey(e, getBinding(shortcuts, "straightLine"))) straightLineHeldRef.current = false;
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", handler); window.removeEventListener("keyup", onKeyUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNum, numPages, panel, penMode, drawings, tool, lassoSelectedIds, shortcuts]);

  // Se a aba perder o foco enquanto o espaço está pressionado, o "keyup" pode
  // nunca chegar — isso soltaria o espaço "travado", igual já é tratado no quadro.
  useEffect(() => {
    const release = () => { spaceDownRef.current = false; setSpaceHeld(false); spacePanRef.current = null; setSpacePanning(false); };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, []);

  // Arrastar com o espaço segurado rola o PDF (igual ao quadro/canvas infinito).
  // Usa capture pra "roubar" o gesto antes que ele chegue no canvas da página ou
  // na camada de desenho (modo caneta), que também escutam pointerdown/move/up.
  const handleSpacePanPointerDown = (e) => {
    if (!spaceDownRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    spacePanRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
    setSpacePanning(true);
    try { el.setPointerCapture?.(e.pointerId); } catch (err) { console.log("[pdf] setPointerCapture falhou", err); }
  };
  const handleSpacePanPointerMove = (e) => {
    const pan = spacePanRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    el.scrollLeft = pan.scrollLeft - (e.clientX - pan.startX);
    el.scrollTop = pan.scrollTop - (e.clientY - pan.startY);
  };
  const handleSpacePanPointerUp = (e) => {
    const pan = spacePanRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    try { containerRef.current?.releasePointerCapture?.(e.pointerId); } catch (err) { console.log("[pdf] releasePointerCapture falhou", err); }
    spacePanRef.current = null;
    setSpacePanning(false);
  };

  const isFav = favoritePages.includes(pageNum);
  const isImp = importantPages.includes(pageNum);

  return (
    <div className="readerBack" onClick={handleClose}>
      <div ref={modalRef} className={`readerModal readerModalWide${fullscreen ? " readerModalFull" : ""}`} onClick={(e)=>e.stopPropagation()}>
        {timerToast && <div className="pdfTimerToast">{timerToast}</div>}
        <div className="readerHead">
          <b>{pdfDoc.title}{tempFile && <span className="pdfPasteHint" style={{position:"static", marginLeft:8}}>Aberto sem salvar</span>}</b>
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
            <button className={`ghost${panel==="audios" ? " active" : ""}`} onClick={()=>togglePanel("audios")}>
              <Headphones size={15}/> <span>Áudios</span>
            </button>
            <button className={`ghost${panel==="timer" ? " active" : ""}${timerDone ? " pdfTimerBlink" : ""}`} onClick={()=>togglePanel("timer")}>
              <Clock3 size={15}/> <span>{timerStarted ? (timerHidden && !timerDone ? "Contando…" : fmtTimer(timerLeft)) : "Cronômetro"}</span>
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
            <button title="Configurações do leitor" onClick={()=>setSettingsOpen(true)}><Settings size={16}/></button>
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
          {pastePulse && (
            <p className="pdfPasteHint flash">Imagem colada!</p>
          )}
        </div>

        <div className={`readerMain pdfDockPos-${dockPosition}`}>
        {penMode && (
          <>
            {styleFlyoutOpen && (tool === "pen" || tool === "highlighter" || tool === "eraser" || tool === "shape" || tool === "text") && (
              <div className="pdfStylePanel" onPointerDown={e => e.stopPropagation()}>
                {tool === "pen" && (<>
                  <select value={penStyle} onChange={e=>handlePenStyleChange(e.target.value)}>
                    <option value="normal">Caneta normal</option>
                    <option value="pencil">Lápis</option>
                    <option value="marker">Marcador/brush</option>
                  </select>
                  <PenSwatches colors={favPenColors} onColorsChange={setFavPenColors} value={color} onPick={setColor}/>
                  <label className="penSliderLabel">Espessura<input type="range" min="1" max="14" step="0.5" value={thickness} onChange={e=>setThickness(+e.target.value)}/></label>
                  <label className="penSliderLabel">Opacidade<input type="range" min="0.2" max="1" step="0.05" value={opacity} onChange={e=>setOpacity(+e.target.value)}/></label>
                  <label className="penCheckLabel"><input type="checkbox" checked={autoShape} onChange={e=>setAutoShape(e.target.checked)}/> Corrigir forma automaticamente</label>
                  <div className="penToolGroup">
                    <button title="Linha normal" className={penLineStyle==="solid"?"active":""} onClick={()=>setPenLineStyle("solid")}><Minus size={16}/></button>
                    <button title="Linha tracejada" className={penLineStyle==="dashed"?"active":""} onClick={()=>setPenLineStyle("dashed")}><DashedLineIcon size={16}/></button>
                    <button title="Seta" className={penLineStyle==="arrow"?"active":""} onClick={()=>setPenLineStyle("arrow")}><ArrowUpRight size={16}/></button>
                  </div>
                </>)}
                {tool === "highlighter" && (<>
                  <PenSwatches colors={favHlColors} onColorsChange={setFavHlColors} value={hlColor} onPick={setHlColor}/>
                  <label className="penSliderLabel">Espessura<input type="range" min="6" max="34" step="1" value={hlThickness} onChange={e=>setHlThickness(+e.target.value)}/></label>
                  <label className="penSliderLabel">Opacidade<input type="range" min="0.15" max="0.7" step="0.05" value={hlOpacity} onChange={e=>setHlOpacity(+e.target.value)}/></label>
                </>)}
                {tool === "eraser" && (<>
                  <select value={eraserMode} onChange={e=>setEraserMode(e.target.value)}>
                    <option value="partial">Apagar parte do traço</option>
                    <option value="object">Apagar objeto inteiro</option>
                  </select>
                  {eraserMode === "partial" && <label className="penSliderLabel">Tamanho<input type="range" min="4" max="30" step="1" value={eraserRadius} onChange={e=>setEraserRadius(+e.target.value)}/></label>}
                </>)}
                {tool === "shape" && (<>
                  <div className="penToolGroup">
                    <button title="Linha reta" className={shapeType==="line"?"active":""} onClick={()=>setShapeType("line")}><Minus size={16}/></button>
                    <button title="Seta" className={shapeType==="arrow"?"active":""} onClick={()=>setShapeType("arrow")}><ArrowUpRight size={16}/></button>
                    <button title="Retângulo" className={shapeType==="rect"?"active":""} onClick={()=>setShapeType("rect")}><Square size={16}/></button>
                    <button title="Círculo" className={shapeType==="circle"?"active":""} onClick={()=>setShapeType("circle")}><Circle size={16}/></button>
                    <button title="Cubo" className={shapeType==="cube"?"active":""} onClick={()=>setShapeType("cube")}><Box size={16}/></button>
                    <button title="Pirâmide" className={shapeType==="pyramid"?"active":""} onClick={()=>setShapeType("pyramid")}><Pyramid size={16}/></button>
                    <button title="Cilindro" className={shapeType==="cylinder"?"active":""} onClick={()=>setShapeType("cylinder")}><Cylinder size={16}/></button>
                    <button title="Cone" className={shapeType==="cone"?"active":""} onClick={()=>setShapeType("cone")}><Cone size={16}/></button>
                    <button title="Esfera" className={shapeType==="sphere"?"active":""} onClick={()=>setShapeType("sphere")}><Globe size={16}/></button>
                  </div>
                  <PenSwatches colors={favPenColors} onColorsChange={setFavPenColors} value={color} onPick={setColor}/>
                  <label className="penSliderLabel">Espessura<input type="range" min="1" max="10" step="0.5" value={thickness} onChange={e=>setThickness(+e.target.value)}/></label>
                </>)}
                {tool === "text" && (
                  <PenSwatches colors={favPenColors} onColorsChange={setFavPenColors} value={color} onPick={setColor}/>
                )}
              </div>
            )}

            <div className="pdfPenDock">
              <div className="pdfPenDockRow">
                <button title="Caneta (2 toques: opções)" className={tool==="pen"?"active":""} onClick={()=>{setTool("pen"); setSelectedAnnId(null);}} onDoubleClick={()=>setStyleFlyoutOpen(v=>!v)}><PenTool size={16}/></button>
                <button title="Marca-texto (2 toques: opções)" className={tool==="highlighter"?"active":""} onClick={()=>{setTool("highlighter"); setSelectedAnnId(null);}} onDoubleClick={()=>setStyleFlyoutOpen(v=>!v)}><Highlighter size={16}/></button>
                <button title="Borracha (2 toques: opções)" className={tool==="eraser"?"active":""} onClick={()=>{setTool("eraser"); setSelectedAnnId(null);}} onDoubleClick={()=>setStyleFlyoutOpen(v=>!v)}><Eraser size={16}/></button>
                <button title="Formas (2 toques: opções)" className={tool==="shape"?"active":""} onClick={()=>{setTool("shape"); setSelectedAnnId(null);}} onDoubleClick={()=>setStyleFlyoutOpen(v=>!v)}><Square size={16}/></button>
                <button title="Texto (2 toques: opções)" className={tool==="text"?"active":""} onClick={()=>{setTool("text"); setSelectedAnnId(null);}} onDoubleClick={()=>setStyleFlyoutOpen(v=>!v)}><Type size={16}/></button>
                <button title="Selecionar" className={tool==="select"?"active":""} onClick={()=>setTool("select")}><MousePointer2 size={16}/></button>
                <button title="Laço" className={tool==="lasso"?"active":""} onClick={()=>setTool("lasso")}><Lasso size={16}/></button>
                <button title="Apontador laser (não fica salvo)" className={tool==="laser"?"active":""} onClick={()=>setTool("laser")}><Sparkle size={16}/></button>
                <span className="pdfPenDockDivider"/>
                <button title="Inserir imagem/print" onClick={()=>imageInputRef.current?.click()}><ImageIcon size={16}/></button>
                <input ref={imageInputRef} type="file" accept="image/*" hidden
                  onChange={(e)=>{ const f=e.target.files?.[0]; if(f) insertImageAnnotation(f); e.target.value=""; }}/>
                {clipboardCount > 0 && (
                  <button title="Colar (Ctrl+V) nesta página" onClick={pasteClipboard}><ClipboardPaste size={16}/></button>
                )}
                <span className="pdfPenDockDivider"/>
                <button title="Desfazer" onClick={undo}><Undo2 size={16}/></button>
                <button title="Refazer" onClick={redo}><Redo2 size={16}/></button>
                <span className="pdfPenDockDivider"/>
                <button title={annotationsVisible?"Ocultar anotações":"Mostrar anotações"} className={annotationsVisible?"":"active"} onClick={()=>setAnnotationsVisible(v=>!v)}>{annotationsVisible?<Eye size={16}/>:<EyeOff size={16}/>}</button>
                <button title="Limpar página" onClick={clearPage}><Trash2 size={16}/></button>
                <button title={exporting?"Exportando...":"Exportar PDF com as anotações"} disabled={exporting} onClick={handleExportAnnotated}><Download size={16}/></button>
              </div>
              {tool==="select" && (
                <p className="pdfPenDockHint">{selectedAnnId ? "Arraste pra mover. Puxe o cantinho pra redimensionar." : "Toque numa anotação pra selecioná-la."}</p>
              )}
              {tool==="lasso" && (
                <p className="pdfPenDockHint">{lassoSelectedIds.length ? `${lassoSelectedIds.length} ${lassoSelectedIds.length===1?"selecionada":"selecionadas"}` : "Arraste ao redor das anotações."}</p>
              )}
              {tool==="select" && selectedAnnId && <button className="penDeleteBtn" onClick={deleteSelected}><Trash2 size={14}/> Excluir</button>}
              {tool==="lasso" && lassoSelectedIds.length > 0 && <button className="penDeleteBtn" onClick={deleteLassoSelection}><Trash2 size={14}/> Excluir</button>}
            </div>
          </>
        )}
          <div
            className={`readerBody${nightMode?" readerBodyNight":""}${spaceHeld?(spacePanning?" readerBodyGrabbing":" readerBodyGrab"):""}`}
            ref={containerRef}
            onPointerDownCapture={handleSpacePanPointerDown}
            onPointerMoveCapture={handleSpacePanPointerMove}
            onPointerUpCapture={handleSpacePanPointerUp}
            onPointerCancelCapture={handleSpacePanPointerUp}
          >
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
                      cursor: penMode ? (tool==="eraser"?(showPenCursor?"none":"cell"):tool==="select"?"default":tool==="text"?"text":(tool==="pen"||tool==="highlighter")?"none":"crosshair") : undefined,
                    }}
                    onPointerDown={handleDrawPointerDown}
                    onPointerMove={handleDrawPointerMove}
                    onPointerUp={handleDrawPointerUp}
                    onContextMenu={(e)=>{ if (penMode) e.preventDefault(); }}
                    onPointerEnter={(e)=>{
                      if (penMode && (tool==="pen"||tool==="highlighter"||tool==="eraser") && (e.pointerType==="mouse"||e.pointerType==="pen")) {
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
                    {lassoPath && lassoPath.length > 1 && (
                      <path d={lassoPathD(lassoPath)} fill="rgba(91,157,255,0.15)" stroke="var(--accent)" strokeDasharray="6" strokeWidth="1.5"/>
                    )}
                    {tool==="laser" && laserPoints.map((p, i) => (
                      <circle key={p.id} cx={p.x} cy={p.y} r={Math.max(2, 6 - (laserPoints.length - i) * 0.15)} fill="#ff3b3b" opacity={Math.max(0, 1 - (laserPoints.length - i) * 0.03)}/>
                    ))}
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
                {penMode && tool==="eraser" && (
                  <div
                    ref={penCursorRef}
                    className="eraserCursorCircle"
                    style={{
                      display: showPenCursor ? "block" : "none",
                      width: (eraserRadius * 2 * zoom) + "px",
                      height: (eraserRadius * 2 * zoom) + "px",
                    }}
                  />
                )}
                {annotationsVisible && basePageSize.width>0 && (drawings[pageNum]||[]).filter(a=>a.type==="text").map(a => {
                  const aMinH = Math.round(a.fontSize*1.6)+14;
                  const aWidth = a.width ?? 220;
                  const aHeight = a.height ?? aMinH;
                  const autoGrowPdfTextarea = (ta) => {
                    if (!ta) return;
                    ta.style.height = "auto";
                    const newH = Math.max(aMinH, ta.scrollHeight + 2);
                    ta.style.height = newH + "px";
                    if (newH !== aHeight) {
                      setDrawings(prev => {
                        const list = prev[pageNum] || [];
                        const next = list.map(x => x.id === a.id ? { ...x, height: newH } : x);
                        const nextAll = { ...prev, [pageNum]: next };
                        scheduleDrawingsSave(nextAll);
                        return nextAll;
                      });
                    }
                  };
                  return (
                  <div
                    key={a.id}
                    className={`pdfTextAnn${editingTextId===a.id?" editing":""}`}
                    style={{
                      left: (a.x/basePageSize.width*100)+"%",
                      top: (a.y/basePageSize.height*100)+"%",
                      width: (aWidth/basePageSize.width*100)+"%",
                      fontSize: (a.fontSize/basePageSize.height*100)+"vh",
                      color: a.color,
                      pointerEvents: (penMode && tool==="select") || editingTextId===a.id ? "auto" : "none",
                    }}
                    onPointerDown={(e)=>{ if(penMode && tool==="select"){ e.stopPropagation(); setSelectedAnnId(a.id); pushHistory(); const {x,y}=toPageCoords(e.clientX,e.clientY); dragRef.current={mode:"move", id:a.id, lastX:x, lastY:y}; } }}
                    onDoubleClick={()=>{ if(penMode){ setPendingTextDraft(null); setHandwritingId(null); setEditingTextId(a.id); } }}
                  >
                    {editingTextId===a.id && (
                      <div className="textAnnToolbar" onPointerDown={e=>e.stopPropagation()}>
                        <button type="button" title={handwritingId===a.id?"Voltar pro teclado":"Escrever à mão e converter"}
                          className={handwritingId===a.id?"active":""}
                          onClick={()=>{
                            if(handwritingId===a.id){ setHandwritingId(null); return; }
                            setPendingTextDraft(prev => prev ?? a.content ?? "");
                            setHandwritingId(a.id);
                          }}>
                          <Pencil size={13}/>
                        </button>
                      </div>
                    )}
                    {editingTextId===a.id
                      ? (handwritingId===a.id
                          ? <HandwritingPad
                              onCancel={()=>setHandwritingId(null)}
                              onConvert={(text)=>{
                                setPendingTextDraft(prev => {
                                  const base = prev ?? a.content ?? "";
                                  return base ? base + "\n" + text : text;
                                });
                                setHandwritingId(null);
                              }}
                            />
                          : <textarea autoFocus ref={autoGrowPdfTextarea} defaultValue={pendingTextDraft ?? a.content}
                              style={{ height: aHeight + "px" }}
                              onInput={(e)=>autoGrowPdfTextarea(e.target)}
                              onBlur={(e)=>commitTextEdit(a.id, e.target.value)} onPointerDown={e=>e.stopPropagation()}/>)
                      : <div className="pdfTextAnnLabel" style={{ height: aHeight + "px" }}>{a.content || (penMode ? "Toque duas vezes para escrever" : "")}</div>}
                    {editingTextId===a.id && handwritingId!==a.id && (
                      <div className="textAnnResizeHandle"
                        onPointerDown={(e)=>{
                          e.stopPropagation(); e.preventDefault();
                          const { x } = toPageCoords(e.clientX, e.clientY);
                          textResizeAnnRef.current = { id: a.id, startX: x, startWidth: aWidth };
                        }}
                      />
                    )}
                  </div>
                  );
                })}
                {penMode && tool==="select" && selectedAnnId && basePageSize.width>0 && (() => {
                  const ann = (drawings[pageNum]||[]).find(a=>a.id===selectedAnnId);
                  if (!ann) return null;
                  const bbox = annotationBBox(ann);
                  const pad = Math.max(basePageSize.width, basePageSize.height) * 0.012;
                  const left = (bbox.x-pad)/basePageSize.width*100;
                  const top = (bbox.y-pad)/basePageSize.height*100;
                  const w = (bbox.w+pad*2)/basePageSize.width*100;
                  const h = (bbox.h+pad*2)/basePageSize.height*100;
                  const toolbarLeft = (bbox.x+bbox.w/2)/basePageSize.width*100;
                  const toolbarTop = (bbox.y-pad)/basePageSize.height*100;
                  return (
                    <React.Fragment>
                      <div className="pdfSelectionBox" style={{left:left+"%", top:top+"%", width:w+"%", height:h+"%"}}>
                        {(ann.type==="shape" || ann.type==="image" || ann.type==="stroke") && (
                          <div
                            className="pdfSelectionHandle"
                            onPointerDown={(e)=>{ e.stopPropagation(); pushHistory(); dragRef.current={mode:"resize", id:ann.id}; }}
                            onPointerUp={()=>{ dragRef.current=null; }}
                          />
                        )}
                      </div>
                      <div className="lassoToolbar" style={{left:toolbarLeft+"%", top:toolbarTop+"%"}} onPointerDown={e=>e.stopPropagation()}>
                        <button className="lassoToolbarBtn" title="Copiar (cole em qualquer página com Ctrl+V)" onClick={copySelection}><Copy size={15}/></button>
                        <button className="lassoToolbarBtn" title="Excluir" onClick={()=>{ pushHistory(); setDrawings(prev=>{ const next={...prev,[pageNum]:(prev[pageNum]||[]).filter(a=>a.id!==ann.id)}; scheduleDrawingsSave(next); return next; }); setSelectedAnnId(null); }}><Trash2 size={15}/></button>
                      </div>
                    </React.Fragment>
                  );
                })()}
                {penMode && tool==="lasso" && lassoSelectedIds.length > 0 && basePageSize.width>0 && (() => {
                  const list = drawings[pageNum] || [];
                  const boxes = list.filter(a => lassoSelectedIds.includes(a.id)).map(annotationBBox);
                  if (!boxes.length) return null;
                  const b = unionBBox(boxes);
                  const pad = Math.max(basePageSize.width, basePageSize.height) * 0.012;
                  const left = (b.x-pad)/basePageSize.width*100;
                  const top = (b.y-pad)/basePageSize.height*100;
                  const w = (b.w+pad*2)/basePageSize.width*100;
                  const h = (b.h+pad*2)/basePageSize.height*100;
                  const toolbarLeft = (b.x+b.w/2)/basePageSize.width*100;
                  const toolbarTop = (b.y-pad)/basePageSize.height*100;
                  return (
                    <React.Fragment>
                      <div className="pdfSelectionBox" style={{left:left+"%", top:top+"%", width:w+"%", height:h+"%"}}>
                        <div
                          className="pdfSelectionHandle"
                          onPointerDown={(e)=>{ e.stopPropagation(); pushHistory(); lassoGroupDragRef.current={mode:"resize"}; }}
                          onPointerUp={()=>{ lassoGroupDragRef.current=null; }}
                        />
                      </div>
                      <div className="lassoToolbar" style={{left:toolbarLeft+"%", top:toolbarTop+"%"}} onPointerDown={e=>e.stopPropagation()}>
                        <span className="lassoToolbarLabel">COR</span>
                        <div className="lassoToolbarColors">
                          {LASSO_COLORS.map(hex => (
                            <button key={hex} className="lassoColorSwatch" style={{background:hex}} onClick={()=>changeLassoColor(hex)}/>
                          ))}
                        </div>
                        <span className="lassoToolbarDivider"/>
                        <button className="lassoToolbarBtn" title="Copiar (cole em qualquer página com Ctrl+V)" onClick={copySelection}><Copy size={15}/></button>
                        <button className="lassoToolbarBtn" title="Excluir selecionados" onClick={deleteLassoSelection}><Trash2 size={15}/></button>
                      </div>
                    </React.Fragment>
                  );
                })()}
              </div>
            )}
            {selection && (
              <div className="pdfSelectionToolbar" style={{top:selection.top, left:selection.left}} onMouseDown={e=>e.preventDefault()}>
                {!tempFile && <button onClick={createFlashcardFromSelection}><Layers size={13}/> Criar flashcard</button>}
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
                <NoteFormatButtons fmt={fmt}/>
              </div>
              <div className="notesPaneBody" style={{position:"relative"}} onClick={() => { fmt.setEmojiOpen(false); fmt.setColorOpen(false); fmt.setHiliteOpen(false); fmt.closeLinkPopover(); }}>
                <div
                  ref={notesBodyRef}
                  className="noteTextarea noteRichBody"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={scheduleNotesSave}
                  onBlur={flushNotes}
                  onClick={fmt.handleBodyClick}
                  onKeyDown={fmt.handleBodyKeyDown}
                  onMouseUp={fmt.updateLinkBar}
                  onKeyUp={fmt.updateLinkBar}
                  data-placeholder="Escreva suas anotações sobre este PDF..."
                />
                <NoteLinkFloatingUI fmt={fmt}/>
              </div>
            </div>
          )}

          {panel==="audios" && (
            <div className="notesPane">
              <div className="notesPaneHead"><b>Áudios de estudo</b><span>sobre "{pdfDoc.title}"</span></div>
              <div className="notesPaneBody">
                <PdfAudioPanel pdfKind="study" pdfId={pdfDoc.id} title={pdfDoc.title}/>
              </div>
            </div>
          )}

          {panel==="timer" && (
            <div className="notesPane">
              <div className="notesPaneHead"><b>Cronômetro</b><span>contagem regressiva</span></div>
              <div className="notesPaneBody pdfTimerBody">
                {!timerStarted ? (
                  <>
                    <div className="pdfTimerInputs">
                      <label>Horas<input type="number" min="0" max="23" value={timerH} onChange={e=>setTimerH(Math.max(0, Math.min(23, +e.target.value || 0)))}/></label>
                      <label>Minutos<input type="number" min="0" max="59" value={timerM} onChange={e=>setTimerM(Math.max(0, Math.min(59, +e.target.value || 0)))}/></label>
                      <label>Segundos<input type="number" min="0" max="59" value={timerS} onChange={e=>setTimerS(Math.max(0, Math.min(59, +e.target.value || 0)))}/></label>
                    </div>
                    <div className="pdfTimerDisplay">{fmtTimer(timerTotalInput)}</div>
                    <button className="add" disabled={timerTotalInput<=0} onClick={startTimer}><Play size={15}/> Começar</button>
                  </>
                ) : (
                  <>
                    {timerHidden && !timerDone ? (
                      <div className="pdfTimerDisplay pdfTimerHidden">Contando… ⏱</div>
                    ) : (
                      <div className={`pdfTimerDisplay${timerDone ? " pdfTimerBlink" : ""}`}>{fmtTimer(timerLeft)}</div>
                    )}
                    {!timerDone && (
                      <button className="ghost pdfTimerHideBtn" onClick={()=>setTimerHidden(h=>!h)}>
                        {timerHidden ? <><Eye size={15}/> Mostrar tempo</> : <><EyeOff size={15}/> Ocultar tempo</>}
                      </button>
                    )}
                    {timerDone ? (
                      <p className="emptyHint">Tempo esgotado! Toque em "Zerar" para parar o alarme.</p>
                    ) : (
                      <div className="pdfTimerBtnRow">
                        {timerRunning ? (
                          <button className="ghost" onClick={pauseTimer}><Pause size={15}/> Pausar</button>
                        ) : (
                          <button className="add" onClick={resumeTimer}><Play size={15}/> Continuar</button>
                        )}
                      </div>
                    )}
                    <button className="penDeleteBtn" onClick={resetTimer}><RotateCcw size={14}/> Zerar</button>
                  </>
                )}
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
      {settingsOpen && (
        <BoardSettingsModal
          onClose={() => setSettingsOpen(false)}
          tabs={["comportamento", "ferramentas", "atalhos"]}
          autoShape={autoShape} setAutoShape={setAutoShape}
          eraserMode={eraserMode} setEraserMode={setEraserMode}
          dockPosition={dockPosition} setDockPosition={setDockPosition}
          penStyle={penStyle} onPenStyleChange={handlePenStyleChange}
          thickness={thickness} setThickness={setThickness}
          opacity={opacity} setOpacity={setOpacity}
          hlThickness={hlThickness} setHlThickness={setHlThickness}
          hlOpacity={hlOpacity} setHlOpacity={setHlOpacity}
          eraserRadius={eraserRadius} setEraserRadius={setEraserRadius}
          shortcuts={shortcuts} setShortcuts={setShortcuts}
        />
      )}
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

  const { data, add, remove, update, cloud, reorder, fetchFull } = entity;
  const groups = groupsEntity.data;
  const [currentGroupId, setCurrentGroupId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [readingPdf, setReadingPdf] = useState(null);
  const [openingPdfId, setOpeningPdfId] = useState(null);
  const [whiteboardLibraryOpen, setWhiteboardLibraryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOverGroupId, setDragOverGroupId] = useState(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [tempFile, setTempFile] = useState(null);
  const fileInputRef = useRef(null);
  const tempFileInputRef = useRef(null);
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
      const doc = await pdfjsLib.getDocument({ data: buf, wasmUrl: pdfWasmUrl }).promise;
      const totalPages = doc.numPages;
      const id = crypto.randomUUID();
      const defaultTitle = file.name.replace(/\.pdf$/i, "");
      const title = window.prompt("Título do PDF:", defaultTitle) || defaultTitle;
      // Gera a capa a partir do PDF que já está em memória (sem custo extra
      // de rede) e guarda junto no banco — ver comentário equivalente em
      // BookShelf.handleFile.
      const cover_thumb = await renderCoverThumbFromDoc(doc).catch(() => null);
      const filePath = await uploadStudyPdfFile(session.user.id, id, file);
      await add({ id, title, file_path: filePath, total_pages: totalPages, current_page: 1, favorite_pages: [], important_pages: [], favorite_excerpts: [], notes: "", drawings: {}, group_id: currentGroupId, cover_thumb });
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

  // Ver comentário equivalente em BookShelf.handleOpen: a listagem vem enxuta
  // (sem notes/drawings/highlights/favorite_excerpts), então busca a linha
  // inteira antes de montar o leitor.
  const handleOpen = async (pdfDoc) => {
    setOpeningPdfId(pdfDoc.id);
    const full = await fetchFull(pdfDoc.id);
    setOpeningPdfId(null);
    setReadingPdf(full || pdfDoc);
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
    if (group.cover_image && cloudConfigured && session?.user?.id && group.cover_image.includes("/study_pdf_group_images/")) {
      deleteStudyPdfGroupCover(session.user.id, group.id).catch(() => {});
    }
    await Promise.all(data.filter(p => p.group_id === group.id).map(p => update(p.id, { group_id: null })));
    await groupsEntity.remove(group.id);
    if (currentGroupId === group.id) setCurrentGroupId(null);
  };

  const handleSetGroupCover = async (group, file) => {
    setOpenMenuId(null);
    try {
      if (cloudConfigured && session?.user?.id) {
        const blob = await resizeImageToBlob(file, 360, 480, 0.85);
        const url = await uploadStudyPdfGroupCover(session.user.id, group.id, blob);
        await groupsEntity.update(group.id, { cover_image: url });
      } else {
        const dataUrl = await resizeImageToDataUrl(file, 360, 480, 0.85);
        await groupsEntity.update(group.id, { cover_image: dataUrl });
      }
    } catch (e) {
      console.error(e);
      alert("Não foi possível usar essa imagem. Tente outra foto.");
    }
  };

  const handleRemoveGroupCover = async (group) => {
    setOpenMenuId(null);
    if (group.cover_image && cloudConfigured && session?.user?.id && group.cover_image.includes("/study_pdf_group_images/")) {
      deleteStudyPdfGroupCover(session.user.id, group.id).catch(() => {});
    }
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
        <div className="bookTile addTile" onClick={()=>setChooserOpen(true)}>
          <div className="bookCoverWrap addCover">{uploading ? <span>Enviando...</span> : <><Plus size={26}/><span>Adicionar PDF</span></>}</div>
          <input ref={fileInputRef} type="file" accept="application/pdf" hidden onChange={handleFile}/>
          <input ref={tempFileInputRef} type="file" accept="application/pdf" hidden
            onChange={(e)=>{ const f=e.target.files?.[0]; e.target.value=""; if (f) setTempFile(f); }}/>
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
            opening={openingPdfId===pdfDoc.id}
            onToggleMenu={()=>setOpenMenuId(id=>id===pdfDoc.id?null:pdfDoc.id)}
            onOpen={()=>handleOpen(pdfDoc)}
            onDelete={()=>handleDelete(pdfDoc)}
            onMoveToGroup={(groupId)=>handleMoveToGroup(pdfDoc, groupId)}
            onCoverGenerated={(id, cover_thumb)=>update(id, { cover_thumb })}
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
      />}
      {whiteboardLibraryOpen && <WhiteboardLibrary onClose={()=>setWhiteboardLibraryOpen(false)}/>}
      {newPdfDialogOpen && <NewPdfDialog onClose={()=>setNewPdfDialogOpen(false)} onCreate={handleCreatePdf} creating={uploading}/>}
      {chooserOpen && (
        <PdfOpenChooser
          onClose={()=>setChooserOpen(false)}
          onPickTemp={()=>{ setChooserOpen(false); tempFileInputRef.current?.click(); }}
          onPickSave={()=>{ setChooserOpen(false); fileInputRef.current?.click(); }}
          uploading={uploading}
        />
      )}
      {tempFile && (
        <StudyPdfReader
          pdfDoc={buildTempPdfDoc(tempFile)}
          tempFile={tempFile}
          onClose={()=>setTempFile(null)}
          onProgress={NOOP}
          onNotesChange={NOOP}
          onFavoritesChange={NOOP}
          onImportantChange={NOOP}
          onFavoriteExcerptsChange={NOOP}
          onCreateFlashcard={NOOP}
          onDrawingsChange={NOOP}
        />
      )}
    </div>
  );
}

// ---------- Quadro infinito (whiteboard) ----------

// ---------- Laço (seleção múltipla por área livre) ----------
// Usado tanto no quadro infinito quanto no leitor de PDF de estudo: recebe
// um caminho de pontos (o gesto do laço) e testa se um ponto está dentro
// dele (algoritmo clássico de ray casting).
const LASSO_COLORS = ["#111111", "#ffffff", "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7"];
function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
      (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function bboxCenter(b) { return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
function unionBBox(boxes) {
  const minX = Math.min(...boxes.map(b => b.x));
  const minY = Math.min(...boxes.map(b => b.y));
  const maxX = Math.max(...boxes.map(b => b.x + b.w));
  const maxY = Math.max(...boxes.map(b => b.y + b.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
function lassoPathD(points) {
  return "M " + points.map(p => `${p.x},${p.y}`).join(" L ") + " Z";
}

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

// Redimensiona uma imagem "grudando" no tamanho de outra imagem do quadro
// quando os dois ficam bem próximos — pra facilitar deixar imagens do mesmo
// tamanho sem precisar acertar o pixel exato. `zoom` converte a margem (em
// pixels de tela) pra unidades do mundo, e `stickRef` guarda, entre uma
// chamada e outra do mesmo gesto de arrastar, em qual imagem/dimensão já
// tinha grudado — isso cria a "trava": uma vez grudado, só solta quando o
// gesto se afasta o suficiente (margem de saída maior que a de entrada).
const RESIZE_SNAP_ENTER_PX = 10;
const RESIZE_SNAP_EXIT_PX = 26;
function resizeImageWithSnap(el, x, y, otherImages, zoom, stickRef) {
  const ratio = el.height / el.width;
  const rawW = Math.max(24, x - el.x);
  const rawH = rawW * ratio;
  const enterMargin = RESIZE_SNAP_ENTER_PX / zoom;
  const exitMargin = RESIZE_SNAP_EXIT_PX / zoom;

  const prev = stickRef.current && stickRef.current.elId === el.id ? stickRef.current : null;
  if (prev) {
    const target = otherImages.find(o => o.id === prev.targetId);
    if (target) {
      if (prev.dim === "both" && Math.abs(rawW - target.width) < exitMargin && Math.abs(rawH - target.height) < exitMargin) {
        return { width: target.width, height: target.height, targetId: target.id };
      }
      if (prev.dim === "w" && Math.abs(rawW - target.width) < exitMargin) {
        return { width: target.width, height: target.width * ratio, targetId: target.id };
      }
      if (prev.dim === "h" && Math.abs(rawH - target.height) < exitMargin) {
        return { width: target.height / ratio, height: target.height, targetId: target.id };
      }
    }
  }

  let best = null;
  for (const img of otherImages) {
    const dw = Math.abs(rawW - img.width);
    const dh = Math.abs(rawH - img.height);
    let candidate = null;
    if (dw < enterMargin && dh < enterMargin) {
      candidate = { dim: "both", targetId: img.id, score: dw + dh, width: img.width, height: img.height };
    } else if (dw < enterMargin) {
      candidate = { dim: "w", targetId: img.id, score: dw, width: img.width, height: rawH };
    } else if (dh < enterMargin) {
      candidate = { dim: "h", targetId: img.id, score: dh, width: img.height / ratio, height: img.height };
    }
    if (!candidate) continue;
    if (!best) { best = candidate; continue; }
    // "both" (mesmo tamanho nos dois eixos) sempre ganha de um snap de eixo
    // único; dentro do mesmo tipo, fica o candidato mais próximo.
    const candidateRank = candidate.dim === "both" ? 0 : 1;
    const bestRank = best.dim === "both" ? 0 : 1;
    if (candidateRank < bestRank || (candidateRank === bestRank && candidate.score < best.score)) best = candidate;
  }

  if (best) {
    stickRef.current = { elId: el.id, targetId: best.targetId, dim: best.dim };
    return { width: best.width, height: best.height, targetId: best.targetId };
  }
  stickRef.current = null;
  return { width: rawW, height: rawH, targetId: null };
}

// Enquanto uma imagem é só ARRASTADA (sem redimensionar), o tamanho dela não
// muda — então aqui não tem "grudar" tamanho nenhum pra fazer. O que existe é
// só checar se ela já bate com o tamanho de alguma outra imagem do quadro
// (por ter sido ajustada assim antes) e, se sim, mostrar o mesmo aviso visual
// do redimensionamento — pra ajudar a perceber que duas imagens já estão do
// mesmo tamanho enquanto uma delas é reposicionada.
const MOVE_SAME_SIZE_TOLERANCE = 0.75;
function findSameSizeImage(el, otherImages) {
  return otherImages.find(img => (
    Math.abs(img.width - el.width) < MOVE_SAME_SIZE_TOLERANCE &&
    Math.abs(img.height - el.height) < MOVE_SAME_SIZE_TOLERANCE
  )) || null;
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
  const bg = normalizeBoardBg(board?.bg).color;
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
  const [boards, setBoards] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);

  // Os quadros ficam no IndexedDB (não no localStorage) porque acumulam
  // imagens em base64 e estourariam fácil o teto de 5-10MB do localStorage.
  // Isso é armazenamento local do navegador — nada disso sai pela rede.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fromIdb = await idbGet("whiteboards_v2", null);
      if (cancelled) return;
      if (Array.isArray(fromIdb)) {
        setBoards(fromIdb);
        setLoaded(true);
        return;
      }
      // Migração única: primeiro tenta o localStorage novo (whiteboards_v2),
      // depois o formato antigo de quadro único (whiteboard_v1). Depois de
      // migrar pro IndexedDB, limpa as chaves antigas do localStorage pra
      // liberar aquele espaço apertado.
      const savedLocal = loadLocal("whiteboards_v2", null);
      if (Array.isArray(savedLocal)) {
        setBoards(savedLocal);
        await idbSet("whiteboards_v2", savedLocal);
        removeLocalKey("whiteboards_v2");
        setLoaded(true);
        return;
      }
      const legacy = loadLocal("whiteboard_v1", null);
      const migrated = legacy?.elements?.length
        ? [{ id: crypto.randomUUID(), name: "Quadro 1", elements: legacy.elements, bg: "black", updatedAt: Date.now() }]
        : [];
      setBoards(migrated);
      if (migrated.length) {
        await idbSet("whiteboards_v2", migrated);
        removeLocalKey("whiteboard_v1");
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return; // evita sobrescrever com [] antes do load terminar
    idbSet("whiteboards_v2", boards);
  }, [boards, loaded]);

  const createBoard = () => {
    const number = boards.length + 1;
    const name = window.prompt("Nome do quadro:", `Quadro ${number}`);
    if (!name?.trim()) return;
    const board = { id: crypto.randomUUID(), name: name.trim(), elements: [], bg: { type: "color", color: "#0b0b0c" }, updatedAt: Date.now() };
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
            {loaded && boards.map(board => (
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
          {loaded && !boards.length && <div className="whiteboardLibraryEmpty"><LayoutGrid size={34}/><b>Nenhum quadro criado</b><span>Crie quantos quadros quiser para separar matérias, projetos ou anotações.</span></div>}
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
  const [bg, setBg] = useState(() => normalizeBoardBg(board?.bg));
  const saveTimer = useRef(null);
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onSave?.({ elements, bg }), 450);
    return () => clearTimeout(saveTimer.current);
  }, [elements, bg, onSave]);
  const [tool, setTool] = useState("pen"); // pen|highlighter|eraser|shape|text|select|pan
  const [shapeType, setShapeType] = useState("line");
  const [penLineStyle, setPenLineStyle] = useState("solid"); // solid | dashed | arrow — em que a linha reta da caneta (atalho/correção automática) vira
  const [penStyle, setPenStyle] = useState("normal");
  const [eraserMode, setEraserMode] = useState("partial");
  const [eraserRadius, setEraserRadius] = useState(14);
  const [autoShape, setAutoShape] = useState(true);
  const [color, setColor] = useState("#f5f5f5");
  const [favPenColors, setFavPenColors] = usePersistentState("quadroFavPenColors", ["#f5f5f5", "#e11d48", "#5b9dff", "#4ade80"]);
  const [showFavColorBar, setShowFavColorBar] = usePersistentState("quadroShowFavColorBar", false);
  const [thickness, setThickness] = useState(3);
  const [opacity, setOpacity] = useState(1);
  const [hlColor, setHlColor] = useState("#ffd54a");
  const [favHlColors, setFavHlColors] = usePersistentState("quadroFavHlColors", ["#ffd54a", "#ff6b6b", "#4ade80", "#5b9dff"]);
  const [hlThickness, setHlThickness] = useState(16);
  const [hlOpacity, setHlOpacity] = useState(0.4);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcuts, setShortcuts] = usePersistentState("quadroShortcuts", BOARD_SHORTCUT_DEFAULTS);
  const straightLineHeldRef = useRef(false);
  const straightLineUsedRef = useRef(false);

  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [selectedId, setSelectedId] = useState(null);
  const [lassoSelectedIds, setLassoSelectedIds] = useState([]);
  const [lassoPath, setLassoPath] = useState(null);
  const lassoDrawRef = useRef(null);
  const lassoGroupDragRef = useRef(null);
  const [editingTextId, setEditingTextId] = useState(null);
  const [handwritingId, setHandwritingId] = useState(null);
  const [pendingTextDraft, setPendingTextDraft] = useState(null);
  const [liveEl, setLiveEl] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [flash, setFlash] = useState(false);
  const [showPenCursor, setShowPenCursor] = useState(false);

  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const modalRef = useRef(null);
  const [styleFlyoutOpen, setStyleFlyoutOpen] = useState(false);
  const isDrawingRef = useRef(false);
  const dragRef = useRef(null);
  const textResizeRef = useRef(null);
  // Guarda o "estado grudado" do snap de tamanho ao redimensionar uma imagem:
  // enquanto o alvo continuar dentro da margem de saída, o snap se mantém
  // mesmo com pequenos tremores do dedo/mouse — só solta quando o gesto
  // realmente se afasta do tamanho encontrado.
  const resizeStickRef = useRef(null);
  const [snapGuideTargetId, setSnapGuideTargetId] = useState(null);
  // Guarda o id da imagem de ORIGEM (a que está sendo arrastada/redimensionada)
  // quando ela bate com o tamanho de outra — assim dá pra desenhar o aviso
  // visual nas duas imagens (origem e alvo), não só na de referência.
  const [snapGuideSourceId, setSnapGuideSourceId] = useState(null);
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
    if (tool !== "pen" && tool !== "highlighter" && tool !== "eraser") setShowPenCursor(false);
  }, [tool]);

  // Some com a seleção do laço sempre que trocar de ferramenta.
  useEffect(() => {
    if (tool !== "lasso") {
      setLassoSelectedIds([]);
      setLassoPath(null);
      lassoDrawRef.current = null;
      lassoGroupDragRef.current = null;
    }
  }, [tool]);

  // Fecha o painel de estilo (cor/espessura/opacidade) sempre que trocar de
  // ferramenta — ele só reabre com um duplo toque na ferramenta ativa.
  useEffect(() => { setStyleFlyoutOpen(false); }, [tool]);

  const changeSelectedColor = (hex) => {
    if (!selectedId) return;
    pushHistory();
    setElements(prev => prev.map(el => (el.id === selectedId && el.type !== "image") ? { ...el, color: hex } : el));
  };

  const deleteLassoSelection = () => {
    if (!lassoSelectedIds.length) return;
    pushHistory();
    setElements(prev => prev.filter(el => !lassoSelectedIds.includes(el.id)));
    setLassoSelectedIds([]);
  };

  const changeLassoColor = (hex) => {
    if (!lassoSelectedIds.length) return;
    pushHistory();
    setElements(prev => prev.map(el => (lassoSelectedIds.includes(el.id) && el.type !== "image") ? { ...el, color: hex } : el));
  };

  // ---- Duplicar seleção: como o quadro é uma superfície única (sem
  // páginas), "colar" aqui cria uma cópia deslocada ao lado da original —
  // não existe "trocar de página" pra colar em outro lugar.
  const elementsClipboardRef = useRef([]);
  const [boardClipboardCount, setBoardClipboardCount] = useState(0);
  const copySelection = () => {
    const ids = lassoSelectedIds.length ? lassoSelectedIds : (selectedId ? [selectedId] : []);
    if (!ids.length) return;
    const copied = elements.filter(el => ids.includes(el.id));
    if (!copied.length) return;
    elementsClipboardRef.current = JSON.parse(JSON.stringify(copied));
    setBoardClipboardCount(copied.length);
    toast?.("Copiado! Cole com o botão ou Ctrl+V.");
  };
  const pasteClipboard = () => {
    const items = elementsClipboardRef.current;
    if (!items.length) return;
    pushHistory();
    const offset = 24 / view.zoom;
    const newIds = [];
    const pasted = items.map(el => {
      const id = crypto.randomUUID();
      newIds.push(id);
      const clone = { ...el, id };
      if (clone.type === "text" || clone.type === "image") { clone.x += offset; clone.y += offset; }
      else if (clone.type === "shape") {
        clone.x1 += offset; clone.y1 += offset; clone.x2 += offset; clone.y2 += offset;
        if (clone.cx != null) { clone.cx += offset; clone.cy += offset; }
      } else if (clone.type === "stroke") {
        clone.points = (clone.points || []).map(p => ({ ...p, x: p.x + offset, y: p.y + offset }));
      }
      return clone;
    });
    setElements(prev => [...prev, ...pasted]);
    setTool("lasso");
    setLassoSelectedIds(newIds);
    setSelectedId(null);
  };

  // ---- Apontador laser: rastro visual temporário, nunca vira elemento salvo.
  const [laserPoints, setLaserPoints] = useState([]);
  const laserFadeRef = useRef(null);
  const addLaserPoint = (x, y) => {
    const id = Date.now() + Math.random();
    setLaserPoints(pts => [...pts.slice(-40), { id, x, y }]);
    clearTimeout(laserFadeRef.current);
    laserFadeRef.current = setTimeout(() => setLaserPoints([]), 900);
  };
  useEffect(() => { if (tool !== "laser") setLaserPoints([]); }, [tool]);

  const imageInputRef = useRef(null);

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
    commitElement({ id, type: "text", x, y, fontSize: 18, color, content: "", width: 220, height: Math.round(18 * 1.6) + 14 });
    setPendingTextDraft(null);
    setHandwritingId(null);
    setEditingTextId(id);
    // Idem ao leitor de PDF: sem trocar pra "select" aqui, um clique no botão
    // "escrever à mão" (dentro do foreignObject) borbulha pro pointerdown do
    // <svg>, que ainda está em modo "text" e cria outro elemento de texto.
    setTool("select");
  };
  const commitTextEdit = (id, value) => {
    setEditingTextId(null);
    setHandwritingId(null);
    setPendingTextDraft(null);
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
    if (!eraseGestureRef.current) { pushHistory(); eraseGestureRef.current = true; }
    setElements(prev => prev.filter(a => a.id !== hit.id));
  };
  const deleteSelected = () => {
    if (!selectedId) return;
    pushHistory();
    setElements(prev => prev.filter(a => a.id !== selectedId));
    setSelectedId(null);
  };

  // Botão de atalho pra deixar a imagem selecionada do mesmo tamanho da
  // imagem mais próxima do quadro (por centro), num toque só — sem precisar
  // arrastar a alça de redimensionar até grudar. Útil pro fluxo de colar
  // imagem, escrever embaixo, colar outra imagem, repetir — mantendo todas
  // no mesmo tamanho.
  const matchImageSizeToNearest = () => {
    const el = elements.find(a => a.id === selectedId);
    if (!el || el.type !== "image") return;
    const others = elements.filter(o => o.type === "image" && o.id !== el.id);
    if (!others.length) return;
    const elCx = el.x + el.width / 2, elCy = el.y + el.height / 2;
    let nearest = null, bestDist = Infinity;
    for (const img of others) {
      const cx = img.x + img.width / 2, cy = img.y + img.height / 2;
      const dist = Math.hypot(cx - elCx, cy - elCy);
      if (dist < bestDist) { bestDist = dist; nearest = img; }
    }
    if (!nearest) return;
    if (Math.abs(nearest.width - el.width) < 0.5 && Math.abs(nearest.height - el.height) < 0.5) {
      toast?.("Essa imagem já está do mesmo tamanho.");
      return;
    }
    pushHistory();
    setElements(prev => prev.map(a => a.id === el.id ? { ...a, width: nearest.width, height: nearest.height } : a));
    // Pisca o mesmo aviso visual usado ao arrastar/redimensionar, só pra
    // confirmar visualmente qual foi a imagem usada de referência.
    setSnapGuideSourceId(el.id);
    setSnapGuideTargetId(nearest.id);
    setTimeout(() => { setSnapGuideSourceId(null); setSnapGuideTargetId(null); }, 900);
  };

  const handleSelectPointerDown = (x, y, pointerId) => {
    if (selectedId) {
      const sel = elements.find(a => a.id === selectedId);
      if (sel && (sel.type === "shape" || sel.type === "image" || sel.type === "text" || sel.type === "stroke")) {
        const b = elementBBox(sel);
        const cx = sel.type === "shape" ? sel.x2 : b.x + b.w;
        const cy = sel.type === "shape" ? sel.y2 : b.y + b.h;
        if (Math.hypot(x - cx, y - cy) < 20 / view.zoom) {
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
    if (drag.mode === "resize") {
      const el = elements.find(a => a.id === drag.id);
      if (el && el.type === "image") {
        const others = elements.filter(o => o.type === "image" && o.id !== el.id);
        const { width, height, targetId } = resizeImageWithSnap(el, x, y, others, view.zoom, resizeStickRef);
        setSnapGuideTargetId(targetId);
        setSnapGuideSourceId(targetId ? el.id : null);
        setElements(prev => prev.map(a => (a.id === el.id ? { ...a, width, height } : a)));
        return;
      }
      setElements(prev => prev.map(a => (a.id === drag.id ? resizeElementCorner(a, x, y) : a)));
      return;
    }
    // dx/dy precisam ser calculados e o drag.lastX/Y atualizado AQUI, de forma
    // síncrona, antes de chamar setElements. O updater passado pro setElements
    // só roda depois (o React agenda/faz batch), então se a leitura de
    // drag.lastX acontecesse lá dentro, ela já pegaria o valor novo (igual a
    // "x"), zerando o delta e travando o elemento no lugar mesmo com o dedo
    // ainda deslizando — era exatamente esse o bug.
    const el = elements.find(a => a.id === drag.id);
    const dx = x - drag.lastX, dy = y - drag.lastY;
    drag.lastX = x; drag.lastY = y;
    setElements(prev => prev.map(a => (a.id === drag.id ? translateElement(a, dx, dy) : a)));
    // Mesmo aviso visual do redimensionamento, mas aqui pra quando a imagem
    // arrastada JÁ tem o mesmo tamanho de outra do quadro (arrastar não muda
    // tamanho, então é só uma checagem de igualdade, sem "grudar" nada).
    if (el && el.type === "image") {
      const others = elements.filter(o => o.type === "image" && o.id !== el.id);
      const match = findSameSizeImage(el, others);
      setSnapGuideSourceId(match ? el.id : null);
      setSnapGuideTargetId(match ? match.id : null);
    } else if (snapGuideSourceId || snapGuideTargetId) {
      setSnapGuideSourceId(null);
      setSnapGuideTargetId(null);
    }
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
    // Comprime antes de guardar: essa imagem entra no JSON do quadro, então
    // pesa em toda sincronização/abertura do quadro daqui pra frente.
    compressImageForPage(file, 1400, 1400, 0.82).then(({ dataUrl, width, height }) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const centerWorld = rect ? { x: (rect.width / 2 - view.x) / view.zoom, y: (rect.height / 2 - view.y) / view.zoom } : { x: 0, y: 0 };
      addImageAt(dataUrl, width, height, centerWorld.x, centerWorld.y);
    }).catch(e => console.error(e));
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
      if (matchesShortcut(e, getBinding(shortcuts, "pan"))) { spaceDownRef.current = true; e.preventDefault(); }
      if (matchesShortcut(e, getBinding(shortcuts, "straightLine"))) straightLineHeldRef.current = true;
      if (e.key === "Escape") { if (editingTextId) { setEditingTextId(null); setHandwritingId(null); setPendingTextDraft(null); } else if (tool === "lasso" && lassoSelectedIds.length) setLassoSelectedIds([]); else onClose(); }
      if (matchesShortcut(e, getBinding(shortcuts, "redo"))) { e.preventDefault(); redo(); }
      else if (matchesShortcut(e, getBinding(shortcuts, "undo"))) { e.preventDefault(); undo(); }
      if (matchesShortcut(e, getBinding(shortcuts, "deleteSelection"))) {
        if (selectedId) deleteSelected();
        if (tool === "lasso" && lassoSelectedIds.length) deleteLassoSelection();
      }
      if (matchesShortcut(e, getBinding(shortcuts, "toolPen"))) setTool("pen");
      else if (matchesShortcut(e, getBinding(shortcuts, "toolHighlighter"))) setTool("highlighter");
      else if (matchesShortcut(e, getBinding(shortcuts, "toolEraser"))) setTool("eraser");
      else if (matchesShortcut(e, getBinding(shortcuts, "toolShape"))) setTool("shape");
      else if (matchesShortcut(e, getBinding(shortcuts, "toolText"))) setTool("text");
      else if (matchesShortcut(e, getBinding(shortcuts, "toolSelect"))) setTool("select");
      else if (matchesShortcut(e, getBinding(shortcuts, "toolLasso"))) setTool("lasso");
      const tag = e.target?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable;
      if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") copySelection();
      if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && elementsClipboardRef.current.length) { e.preventDefault(); pasteClipboard(); }
    };
    const onKeyUp = (e) => {
      if (isShortcutReleaseKey(e, getBinding(shortcuts, "pan"))) spaceDownRef.current = false;
      if (isShortcutReleaseKey(e, getBinding(shortcuts, "straightLine"))) straightLineHeldRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, tool, editingTextId, elements, lassoSelectedIds, shortcuts]);

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
    if (wheelMatchesModifier(e, getBinding(shortcuts, "zoomModifier"))) {
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
  }, [shortcuts]);

  const isPanning = () => tool === "pan" || spaceDownRef.current;

  const handlePointerDown = (e) => {
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
    if ((e.pointerType === "touch" || e.pointerType === "mouse") && tool !== "lasso" && tool !== "laser") {
      // Antes de checar o hit-test normal, vê se o toque começou perto da
      // bolinha de redimensionar do item selecionado — sem isso, com o dedo
      // (impreciso) o clique quase sempre "erra" a bolinha por pouco e cai
      // no hit-test comum, que só sabe mover, nunca redimensionar.
      let nearResizeHandle = false;
      if (selectedId) {
        const sel = elements.find(a => a.id === selectedId);
        if (sel && (sel.type === "shape" || sel.type === "image" || sel.type === "text" || sel.type === "stroke")) {
          const b = elementBBox(sel);
          const cx = sel.type === "shape" ? sel.x2 : b.x + b.w;
          const cy = sel.type === "shape" ? sel.y2 : b.y + b.h;
          nearResizeHandle = Math.hypot(x - cx, y - cy) < 20 / view.zoom;
        }
      }
      const hit = nearResizeHandle || findElementAt(elements, x, y, 8);
      if (hit) {
        handleSelectPointerDown(x, y, e.pointerId);
      } else {
        // Clicar em área vazia sempre desmarca e já inicia a navegação —
        // antes, se algo estivesse selecionado, esse clique só desmarcava e
        // "perdia" o gesto (nem movia nada nem navegava), sendo preciso um
        // segundo clique pra conseguir arrastar o quadro.
        if (selectedId) setSelectedId(null);
        panRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y };
      }
      return;
    }
    if (tool === "pen" || tool === "highlighter") {
      isDrawingRef.current = e.pointerId;
      straightLineUsedRef.current = false;
      if (showPenCursor) setShowPenCursor(false);
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
    } else if (tool === "lasso") {
      if (lassoSelectedIds.length) {
        const boxes = elements.filter(el => lassoSelectedIds.includes(el.id)).map(elementBBox);
        if (boxes.length) {
          const b = unionBBox(boxes);
          const pad = 10 / view.zoom;
          if (Math.hypot(x - (b.x + b.w), y - (b.y + b.h)) < 18 / view.zoom) {
            pushHistory();
            lassoGroupDragRef.current = { mode: "resize" };
            return;
          }
          if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) {
            pushHistory();
            lassoGroupDragRef.current = { mode: "move", lastX: x, lastY: y };
            return;
          }
        }
      }
      setLassoSelectedIds([]);
      lassoDrawRef.current = { points: [{ x, y }] };
      setLassoPath([{ x, y }]);
    } else if (tool === "laser") {
      isDrawingRef.current = e.pointerId;
      addLaserPoint(x, y);
    }
  };

  const handlePointerMove = (e) => {
    // Acompanha a bolinha de cursor colorida (só aparece pra caneta de
    // verdade — mouse/trackpad nesse quadro não desenha, então não precisa
    // dela; e enquanto está desenhando, o próprio traço já mostra onde está,
    // então a bolinha deve SUMIR, não ficar parada no ponto onde o traço
    // começou). Já a borracha continua mostrando o círculo mesmo enquanto
    // apaga, pra dar pra ver o alcance dela durante o gesto.
    if ((tool === "pen" || tool === "highlighter") && e.pointerType === "pen") {
      if (isDrawingRef.current) {
        if (showPenCursor) setShowPenCursor(false);
      } else {
        movePenCursor(e.clientX, e.clientY);
        setShowPenCursor(true);
      }
    } else if (tool === "eraser" && e.pointerType === "pen") {
      movePenCursor(e.clientX, e.clientY);
      setShowPenCursor(true);
    } else if (showPenCursor) {
      setShowPenCursor(false);
    }
    if (textResizeRef.current) {
      const { x } = toWorld(e.clientX, e.clientY);
      const { id, startX, startWidth } = textResizeRef.current;
      const newWidth = Math.max(60, startWidth + (x - startX));
      setElements(prev => prev.map(a => a.id === id ? { ...a, width: newWidth } : a));
      return;
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
    if (lassoGroupDragRef.current) {
      const { x, y } = toWorld(e.clientX, e.clientY);
      const drag = lassoGroupDragRef.current;
      if (drag.mode === "resize") {
        setElements(prev => {
          const selected = prev.filter(a => lassoSelectedIds.includes(a.id));
          if (!selected.length) return prev;
          const box = unionBBox(selected.map(elementBBox));
          const anchor = { x: box.x, y: box.y };
          const scaleX = Math.max(6 / view.zoom, x - anchor.x) / (box.w || 1);
          const scaleY = Math.max(6 / view.zoom, y - anchor.y) / (box.h || 1);
          return prev.map(a => lassoSelectedIds.includes(a.id) ? scaleAnnotationFromAnchor(a, anchor, scaleX, scaleY) : a);
        });
        return;
      }
      const dx = x - drag.lastX, dy = y - drag.lastY;
      drag.lastX = x; drag.lastY = y;
      setElements(prev => prev.map(a => lassoSelectedIds.includes(a.id) ? translateElement(a, dx, dy) : a));
      return;
    }
    if (lassoDrawRef.current) {
      const { x, y } = toWorld(e.clientX, e.clientY);
      lassoDrawRef.current.points.push({ x, y });
      setLassoPath([...lassoDrawRef.current.points]);
      return;
    }
    if (!isDrawingRef.current) return;
    const { x, y } = toWorld(e.clientX, e.clientY);
    if (tool === "laser") { addLaserPoint(x, y); return; }
    if (tool === "pen" || tool === "highlighter") {
      setLiveEl(prev => {
        if (!prev) return prev;
        const p = { x, y, p: tool === "highlighter" ? 0.5 : (e.pressure || 0.5) };
        // Atalho de linha reta: em vez de acumular pontos, mantém só o
        // primeiro e o atual (com ângulo arredondado pro múltiplo de 45°).
        if (straightLineHeldRef.current) {
          const start = prev.points[0];
          straightLineUsedRef.current = true;
          return { ...prev, points: [start, snapPointToAngle(start, p)] };
        }
        return { ...prev, points: [...prev.points, p] };
      });
    } else if (tool === "shape") {
      setLiveEl(prev => prev ? { ...prev, x2: x, y2: y } : prev);
    } else if (tool === "eraser") {
      if (eraserMode === "object") eraseObjectAt(x, y); else eraseRadiusAt(x, y);
    }
  };

  const handlePointerUp = (e) => {
    if (textResizeRef.current) { textResizeRef.current = null; return; }
    if (panRef.current) {
      panRef.current = null;
      return;
    }
    if (dragRef.current) {
      dragRef.current = null;
      resizeStickRef.current = null;
      setSnapGuideTargetId(null);
      setSnapGuideSourceId(null);
      return;
    }
    if (lassoGroupDragRef.current) { lassoGroupDragRef.current = null; return; }
    if (lassoDrawRef.current) {
      const pts = lassoDrawRef.current.points;
      lassoDrawRef.current = null;
      setLassoPath(null);
      if (pts.length > 2) {
        const ids = elements.filter(el => pointInPolygon(bboxCenter(elementBBox(el)), pts)).map(el => el.id);
        setLassoSelectedIds(ids);
      } else {
        setLassoSelectedIds([]);
      }
      return;
    }
    if (tool === "eraser") { eraseGestureRef.current = false; isDrawingRef.current = false; return; }
    if (tool === "laser") { isDrawingRef.current = false; return; }
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (!liveEl) return;
    // >= 1, não > 1: escrevendo rápido, um ponto (pingo de "i", vírgula,
    // ponto final) pode virar um traço de um único ponto (sem pointermove
    // entre o down e o up) — isso é legítimo, a renderização já sabe
    // desenhar isso como uma bolinha, então não pode ser descartado.
    if ((tool === "pen" || tool === "highlighter") && liveEl.points.length >= 1) {
      let finalEl = liveEl;
      if ((tool === "pen" || tool === "highlighter") && straightLineUsedRef.current && finalEl.points.length === 2) {
        // Mesmo resultado de quando a "correção automática" reconhece uma
        // reta: vira uma forma de linha de verdade, não um traço à mão livre
        // de 2 pontos — assim o atalho e a correção automática desenham
        // exatamente igual. Pro destacador, vira uma barra de marca-texto
        // reta (ponta quadrada, sem afinar) em vez de uma linha fina. Pra
        // caneta, respeita o estilo escolhido (normal/tracejada/seta).
        const [p0, p1] = finalEl.points;
        finalEl = penStraightLineShape({
          id: finalEl.id, tool: finalEl.tool, color: finalEl.color, width: finalEl.width, opacity: finalEl.opacity,
          x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y,
        }, penLineStyle);
      } else if (tool === "pen" && autoShape && finalEl.points.length > 6) {
        const detected = detectShapeFromPoints(finalEl.points);
        if (detected) {
          finalEl = detected.type === "line"
            ? penStraightLineShape({
                id: finalEl.id, tool: finalEl.tool, color: finalEl.color, width: finalEl.width, opacity: finalEl.opacity,
                x1: detected.x1, y1: detected.y1, x2: detected.x2, y2: detected.y2,
              }, penLineStyle)
            : {
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
      compressImageForPage(f, 1400, 1400, 0.82)
        .then(({ dataUrl, width, height }) => addImageAt(dataUrl, width, height, x, y))
        .catch(err => console.error(err));
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
      ctx.fillStyle = bg.color || "#ffffff";
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
    <div className="readerBack whiteboardBackFull" onClick={onClose}>
      <div ref={modalRef} className="readerModal whiteboardModalFull" onClick={(e) => e.stopPropagation()}>
        <div className="readerBody whiteboardBody" style={boardBgStyle(bg, view)} ref={containerRef} onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
          <button className="whiteboardBackBtn" onClick={onClose}><ArrowLeft size={16}/><span>{board?.name || "Quadro infinito"}</span></button>
          <button className="whiteboardSettingsBtn" title="Configurações do quadro" onClick={() => setSettingsOpen(true)}><Settings size={16}/></button>
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
                {elements.filter(el => el.type === "text").map(el => {
                  const elMinH = Math.round(el.fontSize * 1.6) + 14;
                  const elWidth = el.width ?? 220;
                  const elHeight = el.height ?? elMinH;
                  const autoGrowWhiteboardTextarea = (ta) => {
                    if (!ta) return;
                    ta.style.height = "auto";
                    const newH = Math.max(elMinH, ta.scrollHeight + 2);
                    ta.style.height = newH + "px";
                    if (newH !== elHeight) {
                      setElements(prev => prev.map(a => a.id === el.id ? { ...a, height: newH } : a));
                    }
                  };
                  return (
                  <foreignObject key={el.id} x={el.x} y={el.y}
                    width={handwritingId === el.id ? 380 : elWidth}
                    height={handwritingId === el.id ? 190 : elHeight}
                    style={{ overflow: "visible" }}
                  >
                    {editingTextId === el.id && (
                      <div className="textAnnToolbar" style={{ position: "absolute", bottom: "100%", left: 0 }} onPointerDown={e => e.stopPropagation()}>
                        <button type="button" title={handwritingId === el.id ? "Voltar pro teclado" : "Escrever à mão e converter"}
                          className={handwritingId === el.id ? "active" : ""}
                          onClick={() => {
                            if (handwritingId === el.id) { setHandwritingId(null); return; }
                            setPendingTextDraft(prev => prev ?? el.content ?? "");
                            setHandwritingId(el.id);
                          }}>
                          <Pencil size={13}/>
                        </button>
                      </div>
                    )}
                    {editingTextId === el.id && handwritingId === el.id ? (
                      <HandwritingPad
                        onCancel={() => setHandwritingId(null)}
                        onConvert={(text) => {
                          setPendingTextDraft(prev => {
                            const base = prev ?? el.content ?? "";
                            return base ? base + "\n" + text : text;
                          });
                          setHandwritingId(null);
                        }}
                      />
                    ) : editingTextId === el.id ? (
                      <textarea
                        autoFocus
                        ref={autoGrowWhiteboardTextarea}
                        defaultValue={pendingTextDraft ?? el.content}
                        className="whiteboardTextInput"
                        style={{ color: el.color, fontSize: el.fontSize, width: elWidth + "px", height: elHeight + "px" }}
                        onInput={e => autoGrowWhiteboardTextarea(e.target)}
                        onBlur={e => commitTextEdit(el.id, e.target.value)}
                        onPointerDown={e => e.stopPropagation()}
                      />
                    ) : (
                      <div
                        className="whiteboardTextLabel"
                        style={{ color: el.color, fontSize: el.fontSize, width: elWidth + "px", height: elHeight + "px", pointerEvents: tool === "select" ? "auto" : "none" }}
                        onPointerDown={e => { if (tool === "select") { e.stopPropagation(); try { svgRef.current?.setPointerCapture?.(e.pointerId); } catch (err) { console.log("[quadro] setPointerCapture falhou", err); } setSelectedId(el.id); pushHistory(); const { x, y } = toWorld(e.clientX, e.clientY); dragRef.current = { mode: "move", id: el.id, lastX: x, lastY: y, pointerId: e.pointerId }; } }}
                        onDoubleClick={() => { setPendingTextDraft(null); setHandwritingId(null); setEditingTextId(el.id); }}
                      >
                        {el.content || (tool === "select" ? "Duplo toque para escrever" : "")}
                      </div>
                    )}
                    {editingTextId === el.id && handwritingId !== el.id && (
                      <div className="textAnnResizeHandle"
                        onPointerDown={e => {
                          e.stopPropagation(); e.preventDefault();
                          try { svgRef.current?.setPointerCapture?.(e.pointerId); } catch (err) {}
                          const { x } = toWorld(e.clientX, e.clientY);
                          textResizeRef.current = { id: el.id, startX: x, startWidth: elWidth };
                        }}
                      />
                    )}
                  </foreignObject>
                  );
                })}
                {selectedId && (() => {
                  const el = elements.find(a => a.id === selectedId);
                  if (!el) return null;
                  const b = elementBBox(el);
                  const pad = 6 / view.zoom;
                  return (
                    <g>
                      <rect x={b.x - pad} y={b.y - pad} width={b.w + pad * 2} height={b.h + pad * 2} fill="none" stroke="var(--accent)" strokeDasharray={4 / view.zoom} strokeWidth={1.5 / view.zoom}/>
                      {(el.type === "shape" || el.type === "image" || el.type === "text" || el.type === "stroke") && (() => {
                        const hx = el.type === "shape" ? el.x2 : b.x + b.w;
                        const hy = el.type === "shape" ? el.y2 : b.y + b.h;
                        const onResizeStart = e => { e.stopPropagation(); try { svgRef.current?.setPointerCapture?.(e.pointerId); } catch (err) { console.log("[quadro] setPointerCapture falhou", err); } pushHistory(); dragRef.current = { mode: "resize", id: el.id, pointerId: e.pointerId }; };
                        return (
                          <g style={{ cursor: "nwse-resize" }} onPointerDown={onResizeStart}>
                            {/* alvo invisível maior, só pra facilitar tocar com o dedo/trackpad */}
                            <circle cx={hx} cy={hy} r={18 / view.zoom} fill="transparent"/>
                            <circle cx={hx} cy={hy} r={6 / view.zoom} fill="var(--accent)" pointerEvents="none"/>
                          </g>
                        );
                      })()}
                    </g>
                  );
                })()}
                {(snapGuideSourceId || snapGuideTargetId) && (() => {
                  // Contorno tracejado sobre as DUAS imagens (a que está sendo
                  // arrastada/redimensionada e a de referência) sempre que elas
                  // estiverem do mesmo tamanho — tanto durante o redimensionamento
                  // (que "gruda" no tamanho encontrado) quanto durante o simples
                  // arrastar (que só mostra o aviso, sem mudar tamanho nenhum).
                  const ids = [...new Set([snapGuideSourceId, snapGuideTargetId].filter(Boolean))];
                  const pad = 6 / view.zoom;
                  return ids.map(id => {
                    const target = elements.find(a => a.id === id);
                    if (!target) return null;
                    const b = elementBBox(target);
                    return (
                      <rect key={id} x={b.x - pad} y={b.y - pad} width={b.w + pad * 2} height={b.h + pad * 2} fill="none" stroke="#f5a524" strokeDasharray={4 / view.zoom} strokeWidth={1.5 / view.zoom} pointerEvents="none"/>
                    );
                  });
                })()}
                {lassoPath && lassoPath.length > 1 && (
                  <path d={lassoPathD(lassoPath)} fill="rgba(91,157,255,0.15)" stroke="var(--accent)" strokeDasharray={5 / view.zoom} strokeWidth={1.5 / view.zoom}/>
                )}
                {tool === "lasso" && lassoSelectedIds.length > 0 && (() => {
                  const boxes = elements.filter(el => lassoSelectedIds.includes(el.id)).map(elementBBox);
                  if (!boxes.length) return null;
                  const b = unionBBox(boxes);
                  const pad = 8 / view.zoom;
                  const onResizeStart = e => { e.stopPropagation(); try { svgRef.current?.setPointerCapture?.(e.pointerId); } catch (err) {} pushHistory(); lassoGroupDragRef.current = { mode: "resize" }; };
                  return (
                    <g>
                      <rect x={b.x - pad} y={b.y - pad} width={b.w + pad * 2} height={b.h + pad * 2} fill="none" stroke="var(--accent)" strokeDasharray={4 / view.zoom} strokeWidth={1.5 / view.zoom}/>
                      <g style={{ cursor: "nwse-resize" }} onPointerDown={onResizeStart}>
                        <circle cx={b.x + b.w + pad} cy={b.y + b.h + pad} r={18 / view.zoom} fill="transparent"/>
                        <circle cx={b.x + b.w + pad} cy={b.y + b.h + pad} r={6 / view.zoom} fill="var(--accent)" pointerEvents="none"/>
                      </g>
                    </g>
                  );
                })()}
                {tool === "laser" && laserPoints.map((p, i) => (
                  <circle key={p.id} cx={p.x} cy={p.y} r={Math.max(2, 6 - (laserPoints.length - i) * 0.15) / view.zoom} fill="#ff3b3b" opacity={Math.max(0, 1 - (laserPoints.length - i) * 0.03)}/>
                ))}
              </g>
            </svg>
            {tool === "lasso" && lassoSelectedIds.length > 0 && (() => {
              const boxes = elements.filter(el => lassoSelectedIds.includes(el.id)).map(elementBBox);
              if (!boxes.length) return null;
              const b = unionBBox(boxes);
              const left = (b.x + b.w / 2) * view.zoom + view.x;
              const top = b.y * view.zoom + view.y;
              return (
                <div className="lassoToolbar" style={{ left, top }} onPointerDown={e => e.stopPropagation()}>
                  <span className="lassoToolbarLabel">COR</span>
                  <div className="lassoToolbarColors">
                    {LASSO_COLORS.map(hex => (
                      <button key={hex} className="lassoColorSwatch" style={{ background: hex }} onClick={() => changeLassoColor(hex)}/>
                    ))}
                  </div>
                  <span className="lassoToolbarDivider"/>
                  <button className="lassoToolbarBtn" title="Copiar (cole com Ctrl+V)" onClick={copySelection}><Copy size={15}/></button>
                  <button className="lassoToolbarBtn" title="Excluir selecionados" onClick={deleteLassoSelection}><Trash2 size={15}/></button>
                </div>
              );
            })()}
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
            {tool === "eraser" && (
              <div
                ref={penCursorRef}
                className="eraserCursorCircle"
                style={{
                  display: showPenCursor ? "block" : "none",
                  width: (eraserRadius * 2 * view.zoom) + "px",
                  height: (eraserRadius * 2 * view.zoom) + "px",
                }}
              />
            )}
            {selectedId && (() => {
              const el = elements.find(a => a.id === selectedId);
              if (!el) return null;
              const b = elementBBox(el);
              const left = (b.x + b.w / 2) * view.zoom + view.x;
              const top = b.y * view.zoom + view.y;
              return (
                <div className="lassoToolbar" style={{ left, top }} onPointerDown={e => e.stopPropagation()}>
                  {el.type !== "image" && (<>
                    <span className="lassoToolbarLabel">COR</span>
                    <div className="lassoToolbarColors">
                      {LASSO_COLORS.map(hex => (
                        <button key={hex} className="lassoColorSwatch" style={{ background: hex }} onClick={() => changeSelectedColor(hex)}/>
                      ))}
                    </div>
                    <span className="lassoToolbarDivider"/>
                  </>)}
                  {el.type === "image" && (
                    <button className="lassoToolbarBtn" title="Deixar do mesmo tamanho da imagem mais próxima" onClick={matchImageSizeToNearest}><Maximize2 size={15}/></button>
                  )}
                  <button className="lassoToolbarBtn" title="Copiar (cole com Ctrl+V)" onClick={copySelection}><Copy size={15}/></button>
                  <button className="lassoToolbarBtn" title="Excluir" onClick={deleteSelected}><Trash2 size={15}/></button>
                </div>
              );
            })()}

            {styleFlyoutOpen && (tool === "pen" || tool === "highlighter" || tool === "eraser" || tool === "shape" || tool === "text") && (
              <div className="whiteboardStylePanel" onPointerDown={e => e.stopPropagation()}>
                {tool === "pen" && (<>
                  <select value={penStyle} onChange={e => handlePenStyleChange(e.target.value)}>
                    <option value="normal">Caneta normal</option>
                    <option value="pencil">Lápis</option>
                    <option value="marker">Marcador/brush</option>
                  </select>
                  <PenSwatches colors={favPenColors} onColorsChange={setFavPenColors} value={color} onPick={setColor}/>
                  <label className="penSliderLabel">Espessura<input type="range" min="1" max="14" step="0.5" value={thickness} onChange={e => setThickness(+e.target.value)}/></label>
                  <label className="penSliderLabel">Opacidade<input type="range" min="0.2" max="1" step="0.05" value={opacity} onChange={e => setOpacity(+e.target.value)}/></label>
                  <label className="penCheckLabel"><input type="checkbox" checked={autoShape} onChange={e => setAutoShape(e.target.checked)}/> Corrigir forma automaticamente</label>
                  <div className="penToolGroup">
                    <button title="Linha normal" className={penLineStyle==="solid"?"active":""} onClick={()=>setPenLineStyle("solid")}><Minus size={16}/></button>
                    <button title="Linha tracejada" className={penLineStyle==="dashed"?"active":""} onClick={()=>setPenLineStyle("dashed")}><DashedLineIcon size={16}/></button>
                    <button title="Seta" className={penLineStyle==="arrow"?"active":""} onClick={()=>setPenLineStyle("arrow")}><ArrowUpRight size={16}/></button>
                  </div>
                  <label className="penCheckLabel"><input type="checkbox" checked={showFavColorBar} onChange={e=>setShowFavColorBar(e.target.checked)}/> Barra de cores favoritas sempre visível</label>
                </>)}
                {tool === "highlighter" && (<>
                  <PenSwatches colors={favHlColors} onColorsChange={setFavHlColors} value={hlColor} onPick={setHlColor}/>
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
                    <button title="Cubo" className={shapeType === "cube" ? "active" : ""} onClick={() => setShapeType("cube")}><Box size={16}/></button>
                    <button title="Pirâmide" className={shapeType === "pyramid" ? "active" : ""} onClick={() => setShapeType("pyramid")}><Pyramid size={16}/></button>
                    <button title="Cilindro" className={shapeType === "cylinder" ? "active" : ""} onClick={() => setShapeType("cylinder")}><Cylinder size={16}/></button>
                    <button title="Cone" className={shapeType === "cone" ? "active" : ""} onClick={() => setShapeType("cone")}><Cone size={16}/></button>
                    <button title="Esfera" className={shapeType === "sphere" ? "active" : ""} onClick={() => setShapeType("sphere")}><Globe size={16}/></button>
                  </div>
                  <PenSwatches colors={favPenColors} onColorsChange={setFavPenColors} value={color} onPick={setColor}/>
                  <label className="penSliderLabel">Espessura<input type="range" min="1" max="14" step="0.5" value={thickness} onChange={e => setThickness(+e.target.value)}/></label>
                </>)}
                {tool === "text" && (
                  <PenSwatches colors={favPenColors} onColorsChange={setFavPenColors} value={color} onPick={setColor}/>
                )}
              </div>
            )}

            <div className="whiteboardDock">
              {showFavColorBar && (
                <div className="whiteboardDockRow whiteboardFavColorBar">
                  {favPenColors.map(hex => (
                    <button key={hex} type="button" title={hex} style={{ background: hex }}
                      className={color === hex ? "active" : ""}
                      onClick={() => setColor(hex)}/>
                  ))}
                </div>
              )}
              <div className="whiteboardDockRow">
                <button title="Caneta (2 toques: opções)" className={tool === "pen" ? "active" : ""} onClick={() => { setTool("pen"); setSelectedId(null); }} onDoubleClick={() => setStyleFlyoutOpen(v => !v)}><PenTool size={16}/></button>
                <button title="Marca-texto (2 toques: opções)" className={tool === "highlighter" ? "active" : ""} onClick={() => { setTool("highlighter"); setSelectedId(null); }} onDoubleClick={() => setStyleFlyoutOpen(v => !v)}><Highlighter size={16}/></button>
                <button title="Borracha (2 toques: opções)" className={tool === "eraser" ? "active" : ""} onClick={() => { setTool("eraser"); setSelectedId(null); }} onDoubleClick={() => setStyleFlyoutOpen(v => !v)}><Eraser size={16}/></button>
                <button title="Formas (2 toques: opções)" className={tool === "shape" ? "active" : ""} onClick={() => { setTool("shape"); setSelectedId(null); }} onDoubleClick={() => setStyleFlyoutOpen(v => !v)}><Square size={16}/></button>
                <button title="Texto (2 toques: opções)" className={tool === "text" ? "active" : ""} onClick={() => { setTool("text"); setSelectedId(null); }} onDoubleClick={() => setStyleFlyoutOpen(v => !v)}><Type size={16}/></button>
                <span className="whiteboardDockDivider"/>
                <button title="Selecionar" className={tool === "select" ? "active" : ""} onClick={() => setTool("select")}><MousePointer2 size={16}/></button>
                <button title="Laço" className={tool === "lasso" ? "active" : ""} onClick={() => { setTool("lasso"); setSelectedId(null); }}><Lasso size={16}/></button>
                <button title="Apontador laser (não fica salvo)" className={tool === "laser" ? "active" : ""} onClick={() => { setTool("laser"); setSelectedId(null); }}><Sparkle size={16}/></button>
                <button title="Mover o quadro" className={tool === "pan" ? "active" : ""} onClick={() => { setTool("pan"); setSelectedId(null); }}><Hand size={16}/></button>
                <button title="Recentralizar visão" onClick={fitToContent}><Crosshair size={16}/></button>
                <span className="whiteboardDockDivider"/>
                <button title="Inserir imagem/print" onClick={()=>imageInputRef.current?.click()}><ImageIcon size={16}/></button>
                <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(e)=>{ const f=e.target.files?.[0]; if(f) addImageFromFile(f); e.target.value=""; }}/>
                {boardClipboardCount > 0 && (
                  <button title="Colar (Ctrl+V)" onClick={pasteClipboard}><ClipboardPaste size={16}/></button>
                )}
                <span className="whiteboardDockDivider"/>
                <button title="Desfazer" onClick={undo}><Undo2 size={16}/></button>
                <button title="Refazer" onClick={redo}><Redo2 size={16}/></button>
                <button title="Limpar tudo" onClick={clearAll}><Trash2 size={16}/></button>
              </div>
              <div className="whiteboardDockRow">
                <button title="Diminuir zoom" onClick={() => zoomAt(0.85, containerRef.current.getBoundingClientRect().width / 2 + containerRef.current.getBoundingClientRect().left, containerRef.current.getBoundingClientRect().height / 2 + containerRef.current.getBoundingClientRect().top)}><ZoomOut size={16}/></button>
                <button className="whiteboardDockZoomLabel" title={`${elements.length} ${elements.length === 1 ? "item" : "itens"} no quadro — redefinir zoom`} onClick={() => setView(v => ({ ...v, zoom: 1 }))}>{zoomPct}%</button>
                <button title="Aumentar zoom" onClick={() => zoomAt(1.18, containerRef.current.getBoundingClientRect().width / 2 + containerRef.current.getBoundingClientRect().left, containerRef.current.getBoundingClientRect().height / 2 + containerRef.current.getBoundingClientRect().top)}><ZoomIn size={16}/></button>
                <span className="whiteboardDockDivider"/>
                <button title={downloading ? "Gerando..." : "Baixar PDF"} disabled={downloading || !elements.length} onClick={handleDownload}><Download size={16}/></button>
              </div>
            </div>
          </div>
      </div>
      {settingsOpen && (
        <BoardSettingsModal
          onClose={() => setSettingsOpen(false)}
          tabs={["fundo", "comportamento", "ferramentas", "atalhos"]}
          bg={bg} setBg={setBg}
          autoShape={autoShape} setAutoShape={setAutoShape}
          eraserMode={eraserMode} setEraserMode={setEraserMode}
          penStyle={penStyle} onPenStyleChange={handlePenStyleChange}
          thickness={thickness} setThickness={setThickness}
          opacity={opacity} setOpacity={setOpacity}
          hlThickness={hlThickness} setHlThickness={setHlThickness}
          hlOpacity={hlOpacity} setHlOpacity={setHlOpacity}
          eraserRadius={eraserRadius} setEraserRadius={setEraserRadius}
          shortcuts={shortcuts} setShortcuts={setShortcuts}
        />
      )}
    </div>
  );
}

// ---------- Lista de compras (Finanças) ----------

function ShoppingList({ entity, session }) {
  const { data, add, remove, update } = entity;
  const [formOpen, setFormOpen] = useState(null); // null | "new" | item sendo editado
  const [openMenuId, setOpenMenuId] = useState(null);

  const confirmDelete = (item) => {
    setOpenMenuId(null);
    if (confirm(`Excluir "${item.name}" da lista de compras?`)) {
      if (item.photo && cloudConfigured && session?.user?.id && item.photo.includes("/shopping_images/")) {
        deleteShoppingImage(session.user.id, item.id).catch(() => {});
      }
      remove(item.id);
    }
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
          session={session}
          onClose={() => setFormOpen(null)}
          onSave={(payload) => {
            if (formOpen === "new") add(payload);
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
        <SaverImg src={item.photo} alt={item.name} wrapClassName="bookCoverImg" fallback={<ShoppingCart size={30}/>}/>
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

function ShoppingItemModal({ item, session, onClose, onSave }) {
  const [itemId] = useState(() => item?.id || crypto.randomUUID());
  const [name, setName] = useState(item?.name || "");
  const [price, setPrice] = useState(item?.price ?? "");
  const [link, setLink] = useState(item?.link || "");
  const [photo, setPhoto] = useState(item?.photo || "");
  const cachedPhoto = useCachedImageUrl(photo);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      if (cloudConfigured && session?.user?.id) {
        // Sobe pro Storage e guarda só a URL — evita embutir o base64 no
        // banco, que era baixado por inteiro toda vez que a lista abria.
        const blob = await resizeImageToBlob(file, 480, 480, 0.85);
        const url = await uploadShoppingImage(session.user.id, itemId, blob);
        setPhoto(url);
      } else {
        const dataUrl = await resizeImageToDataUrl(file, 480, 480, 0.85);
        setPhoto(dataUrl);
      }
    } catch (e) {
      console.error(e);
      alert("Não foi possível usar essa imagem. Tente outra foto.");
    }
    setUploading(false);
  };

  const handleRemovePhoto = () => {
    if (photo && cloudConfigured && session?.user?.id && photo.includes("/shopping_images/")) {
      deleteShoppingImage(session.user.id, itemId).catch(() => {});
    }
    setPhoto("");
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({ id: itemId, name: name.trim(), price: price === "" ? null : Number(price), link: link.trim() || null, photo: photo || null });
  };

  return (
    <div className="modalBack" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modalHead"><h2>{item ? "Editar item" : "Novo item"}</h2><button type="button" onClick={onClose}><X/></button></div>

        <label>Foto do produto
          <div className="exerciseGifPreview shoppingPhotoPreview" onClick={() => fileRef.current?.click()}>
            {photo ? <img src={cachedPhoto || photo} alt="Prévia"/> : <ShoppingCart size={28}/>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handleFile(f); }}/>
          <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>{uploading ? "Enviando..." : (photo ? "Trocar foto" : "Escolher foto")}</button>
          {photo && <button type="button" className="ghost" onClick={handleRemovePhoto}><X size={13}/> Remover foto</button>}
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

function WorkoutShelf({ foldersEntity, exercisesEntity, session }) {
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
      if (cloudConfigured && session?.user?.id) {
        const blob = await resizeImageToBlob(file, 480, 480, 0.85);
        const url = await uploadWorkoutFolderCover(session.user.id, folder.id, blob);
        await updateFolder(folder.id, { cover_image: url });
      } else {
        const dataUrl = await resizeImageToDataUrl(file, 480, 480, 0.85);
        await updateFolder(folder.id, { cover_image: dataUrl });
      }
    } catch (e) {
      console.error(e);
      alert("Não foi possível usar essa imagem. Tente outra foto.");
    }
  };
  const handleRemoveCover = (folder) => {
    setOpenMenuId(null);
    if (folder.cover_image && cloudConfigured && session?.user?.id && folder.cover_image.includes("/workout_images/")) {
      deleteWorkoutFolderCover(session.user.id, folder.id).catch(() => {});
    }
    updateFolder(folder.id, { cover_image: null });
  };

  const confirmDeleteFolder = (folder) => {
    setOpenMenuId(null);
    const count = exercises.filter(e => e.folder_id === folder.id).length;
    const msg = count > 0
      ? `Excluir o treino "${folder.name}"? Os ${count} exercício(s) dele também serão apagados.`
      : `Excluir o treino "${folder.name}"?`;
    if (!confirm(msg)) return;
    if (folder.cover_image && cloudConfigured && session?.user?.id && folder.cover_image.includes("/workout_images/")) {
      deleteWorkoutFolderCover(session.user.id, folder.id).catch(() => {});
    }
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
        <SaverImg src={folder.cover_image} alt={folder.name} wrapClassName="bookCoverImg" fallback={<Dumbbell size={34}/>}/>
      </div>
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onClick={(e) => e.stopPropagation()}
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
        <SaverImg src={exercise.gif_url} alt={exercise.name} fallback={<Film size={22}/>}/>
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
  const cachedGifUrl = useCachedImageUrl(gifUrl);
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
            {gifUrl ? <img src={cachedGifUrl || gifUrl} alt="Prévia do exercício"/> : <Film size={30}/>}
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
              <SaverImg src={ex.gif_url} alt={ex.name} fallback={<Film size={40}/>}/>
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

// ---------- Filmes e Séries (Área de Lazer) ----------
// Guarda tanto filmes quanto séries que a pessoa quer/está/já assistiu.
// "media_groups" funciona como pasta: agrupa filmes de uma mesma franquia
// (ex.: trilogia) ou séries de um mesmo universo (ex.: Breaking Bad +
// Better Call Saul), cada uma com seu próprio progresso.

// % de episódios assistidos de UMA série (considera temporadas, se houver).
function mediaSeriesPct(item) {
  if (item.has_seasons) {
    const seasons = item.seasons || [];
    const total = seasons.reduce((a, s) => a + (Number(s.total_episodes) || 0), 0);
    const current = seasons.reduce((a, s) => a + Math.min(Number(s.current_episode) || 0, Number(s.total_episodes) || 0), 0);
    return total ? Math.round((current / total) * 100) : 0;
  }
  const total = Number(item.total_episodes) || 0;
  const current = Math.min(Number(item.current_episode) || 0, total);
  return total ? Math.round((current / total) * 100) : 0;
}

// % de filmes já assistidos dentro de uma franquia.
function mediaFranchisePct(items) {
  if (!items.length) return 0;
  const watched = items.filter(i => i.status === "concluido").length;
  return Math.round((watched / items.length) * 100);
}

function mediaStatusLabel(status) {
  if (status === "assistindo") return "Assistindo";
  if (status === "concluido") return "Concluído";
  return "Quero ver";
}

function MediaShelf({ groupsEntity, itemsEntity, session }) {
  const { data: groups, add: addGroup, remove: removeGroup, update: updateGroup } = groupsEntity;
  const { data: items, add: addItem, remove: removeItem, update: updateItem } = itemsEntity;

  const [tab, setTab] = useState("filme"); // "filme" | "serie"
  const [currentGroupId, setCurrentGroupId] = useState(null);
  const [groupModal, setGroupModal] = useState(null); // null | "new" | grupo sendo renomeado
  const [itemForm, setItemForm] = useState(null); // null | "new" | item sendo editado
  const [openMenuId, setOpenMenuId] = useState(null);

  useEffect(() => { setCurrentGroupId(null); setOpenMenuId(null); }, [tab]);

  const currentGroup = currentGroupId ? groups.find(g => g.id === currentGroupId) : null;
  const kindGroups = groups.filter(g => g.kind === tab);
  const visibleItems = currentGroupId
    ? items.filter(i => i.group_id === currentGroupId)
    : items.filter(i => i.kind === tab && !i.group_id);

  const handleSaveGroup = (name) => {
    if (groupModal === "new") addGroup({ name, kind: tab, cover_image: null });
    else updateGroup(groupModal.id, { name });
    setGroupModal(null);
  };

  const handleSetCover = async (group, file) => {
    setOpenMenuId(null);
    try {
      if (cloudConfigured && session?.user?.id) {
        // Sobe pro Storage e guarda só a URL — evita embutir o base64 no
        // banco, rebaixado por inteiro toda vez que a estante era aberta.
        const blob = await resizeImageToBlob(file, 480, 480, 0.85);
        const url = await uploadMediaGroupCover(session.user.id, group.id, blob);
        await updateGroup(group.id, { cover_image: url });
      } else {
        const dataUrl = await resizeImageToDataUrl(file, 480, 480, 0.85);
        await updateGroup(group.id, { cover_image: dataUrl });
      }
    } catch (e) {
      console.error(e);
      alert("Não foi possível usar essa imagem. Tente outra foto.");
    }
  };
  const handleRemoveCover = (group) => {
    setOpenMenuId(null);
    if (group.cover_image && cloudConfigured && session?.user?.id && group.cover_image.includes("/media_images/")) {
      deleteMediaGroupCover(session.user.id, group.id).catch(() => {});
    }
    updateGroup(group.id, { cover_image: null });
  };

  const confirmDeleteGroup = (group) => {
    setOpenMenuId(null);
    const count = items.filter(i => i.group_id === group.id).length;
    const msg = count > 0
      ? `Excluir "${group.name}"? Os ${count} título(s) dentro dela também serão apagados.`
      : `Excluir "${group.name}"?`;
    if (!confirm(msg)) return;
    const cloudCleanup = cloudConfigured && session?.user?.id;
    if (cloudCleanup && group.cover_image?.includes("/media_images/")) {
      deleteMediaGroupCover(session.user.id, group.id).catch(() => {});
    }
    items.filter(i => i.group_id === group.id).forEach(i => {
      if (cloudCleanup && i.photo?.includes("/media_images/")) {
        deleteMediaItemImage(session.user.id, i.id).catch(() => {});
      }
      removeItem(i.id);
    });
    removeGroup(group.id);
    if (currentGroupId === group.id) setCurrentGroupId(null);
  };

  const confirmDeleteItem = (item) => {
    setOpenMenuId(null);
    if (confirm(`Excluir "${item.title}"?`)) {
      if (item.photo && cloudConfigured && session?.user?.id && item.photo.includes("/media_images/")) {
        deleteMediaItemImage(session.user.id, item.id).catch(() => {});
      }
      removeItem(item.id);
    }
  };

  if (itemForm !== null) {
    return <MediaItemForm
      item={itemForm === "new" ? null : itemForm}
      kind={tab}
      session={session}
      onCancel={() => setItemForm(null)}
      onSave={(payload) => {
        if (itemForm === "new") addItem({ kind: tab, group_id: currentGroupId, ...payload });
        else updateItem(itemForm.id, payload);
        setItemForm(null);
      }}
    />;
  }

  return (
    <div className="content" onClick={() => setOpenMenuId(null)}>
      <div className="flashHead">
        <div className="flashHeadInfo">
          <div className="flashHeadIcon"><Clapperboard size={22}/></div>
          <div>
            <small>ÁREA DE LAZER</small>
            <h2>{currentGroup ? currentGroup.name : "Filmes e Séries"}</h2>
            <p>{currentGroup
              ? `${visibleItems.length} título(s) aqui.`
              : "Guarde o que você quer assistir, acompanhe episódios e organize franquias e universos."}</p>
          </div>
        </div>
        <div className="flashHeadActions">
          {currentGroup && <button className="ghost" onClick={() => setCurrentGroupId(null)}><ChevronLeft size={16}/> Voltar</button>}
          <button className="add" onClick={(e) => { e.stopPropagation(); setItemForm("new"); }}><Plus size={16}/> Adicionar {tab === "filme" ? "filme" : "série"}</button>
        </div>
      </div>

      {!currentGroup && (
        <div className="themeToggle exerciseModeToggle" style={{ marginBottom: 16, maxWidth: 320 }}>
          <button type="button" className={tab === "filme" ? "active" : ""} onClick={() => setTab("filme")}><Film size={14}/> Filmes</button>
          <button type="button" className={tab === "serie" ? "active" : ""} onClick={() => setTab("serie")}><Clapperboard size={14}/> Séries</button>
        </div>
      )}

      {!currentGroup && (
        <div className="flashSection">
          <h3>{tab === "filme" ? "Franquias" : "Universos"}</h3>
          <div className="shelf">
            <div className="bookTile addTile" onClick={() => setGroupModal("new")}>
              <div className="bookCoverWrap addCover"><FolderPlus size={26}/><span>{tab === "filme" ? "Nova franquia" : "Novo universo"}</span></div>
            </div>
            {kindGroups.map(group => {
              const groupItems = items.filter(i => i.group_id === group.id);
              return (
                <MediaGroupTile
                  key={group.id}
                  group={group}
                  count={groupItems.length}
                  pct={tab === "filme" ? mediaFranchisePct(groupItems) : null}
                  menuOpen={openMenuId === "g:" + group.id}
                  onToggleMenu={(e) => { e?.stopPropagation?.(); setOpenMenuId(id => id === "g:" + group.id ? null : "g:" + group.id); }}
                  onOpen={() => setCurrentGroupId(group.id)}
                  onRename={() => { setOpenMenuId(null); setGroupModal(group); }}
                  onDelete={() => confirmDeleteGroup(group)}
                  onSetCover={(file) => handleSetCover(group, file)}
                  onRemoveCover={() => handleRemoveCover(group)}
                />
              );
            })}
            {kindGroups.length === 0 && <p className="emptyHint">{tab === "filme" ? "Nenhuma franquia criada ainda." : "Nenhum universo criado ainda."}</p>}
          </div>
        </div>
      )}

      <div className="flashSection">
        {!currentGroup && <h3>{tab === "filme" ? "Filmes avulsos" : "Séries avulsas"}</h3>}
        {visibleItems.length === 0 ? (
          <p className="emptyHint">{currentGroup
            ? `Nenhum título nesse ${tab === "filme" ? "franquia" : "universo"} ainda.`
            : `Nenhum${tab === "filme" ? " filme" : "a série"} por aqui ainda.`}</p>
        ) : (
          <div className="exerciseList">
            {visibleItems.map(item => (
              <MediaItemRow
                key={item.id}
                item={item}
                menuOpen={openMenuId === item.id}
                onToggleMenu={(e) => { e.stopPropagation(); setOpenMenuId(id => id === item.id ? null : item.id); }}
                onEdit={() => { setOpenMenuId(null); setItemForm(item); }}
                onDelete={() => confirmDeleteItem(item)}
                onStatusChange={(status) => updateItem(item.id, { status })}
                onPatch={(patch) => updateItem(item.id, patch)}
              />
            ))}
          </div>
        )}
      </div>

      {groupModal && (
        <FolderModal
          folder={groupModal === "new" ? null : groupModal}
          onClose={() => setGroupModal(null)}
          onSave={handleSaveGroup}
        />
      )}
    </div>
  );
}

function MediaGroupTile({ group, count, pct, menuOpen, onToggleMenu, onOpen, onRename, onDelete, onSetCover, onRemoveCover }) {
  const coverInputRef = useRef(null);
  return (
    <div className="bookTile groupTile" onClick={onOpen}>
      <div className="bookCoverWrap groupCover">
        <SaverImg src={group.cover_image} alt={group.name} wrapClassName="bookCoverImg" fallback={<Clapperboard size={34}/>}/>
      </div>
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onSetCover(file); }}
      />
      <button className="bookMenuBtn" onClick={(e) => { e.stopPropagation(); onToggleMenu(e); }}><MoreVertical size={16}/></button>
      {menuOpen && <div className="bookMenu" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => coverInputRef.current?.click()}><ImagePlus size={13}/> {group.cover_image ? "Trocar foto da capa" : "Colocar foto na capa"}</button>
        {group.cover_image && <button onClick={onRemoveCover}><X size={13}/> Remover foto da capa</button>}
        <button onClick={onRename}><Pencil size={13}/> Renomear</button>
        <button className="danger" onClick={onDelete}><Trash2 size={13}/> Excluir</button>
      </div>}
      <b className="bookTitle">{group.name}</b>
      {pct != null && <div className="progress" style={{ marginTop: 6 }}><i style={{ width: pct + "%" }}/></div>}
      <small className="bookProgressLabel">{count} título{count === 1 ? "" : "s"}{pct != null ? ` · ${pct}%` : ""}</small>
    </div>
  );
}

function MediaItemRow({ item, menuOpen, onToggleMenu, onEdit, onDelete, onStatusChange, onPatch }) {
  const isSeries = item.kind === "serie";
  const pct = isSeries ? mediaSeriesPct(item) : null;
  const seasons = item.seasons || [];
  const currentSeason = isSeries && item.has_seasons
    ? (seasons.find(s => Number(s.season) === Number(item.current_season)) || seasons[0])
    : null;

  // Soma 1 episódio assistido — respeita a temporada atual quando a série tem temporadas.
  const bumpEpisode = () => {
    if (!isSeries) return;
    if (item.has_seasons) {
      if (!currentSeason) return;
      const total = Number(currentSeason.total_episodes) || 0;
      const next = Math.min(total, (Number(currentSeason.current_episode) || 0) + 1);
      const patch = { seasons: seasons.map(s => s.season === currentSeason.season ? { ...s, current_episode: next } : s) };
      // Zerou os episódios da temporada atual: já avança pra próxima automaticamente, se existir.
      if (total > 0 && next >= total) {
        const nextSeason = seasons
          .filter(s => Number(s.season) > Number(currentSeason.season))
          .sort((a, b) => Number(a.season) - Number(b.season))[0];
        if (nextSeason) patch.current_season = Number(nextSeason.season);
      }
      onPatch(patch);
    } else {
      const total = Number(item.total_episodes) || 0;
      const next = Math.min(total, (Number(item.current_episode) || 0) + 1);
      onPatch({ current_episode: next });
    }
  };

  return (
    <div className="exerciseRow">
      <div className="exerciseThumb">
        <SaverImg src={item.photo} alt={item.title} fallback={isSeries ? <Clapperboard size={22}/> : <Film size={22}/>}/>
      </div>
      <div className="exerciseInfo">
        <b>{item.title}</b>
        <small>
          <select className="mediaStatusSelect" value={item.status || "quero_ver"} onClick={e => e.stopPropagation()} onChange={e => onStatusChange(e.target.value)}>
            <option value="quero_ver">Quero ver</option>
            <option value="assistindo">Assistindo</option>
            <option value="concluido">Concluído</option>
          </select>
          {isSeries && (item.has_seasons
            ? (currentSeason ? <>· Temp. {currentSeason.season} · Ep. {currentSeason.current_episode || 0}/{currentSeason.total_episodes || 0}</> : "· Sem temporadas cadastradas")
            : <>· Ep. {item.current_episode || 0}/{item.total_episodes || 0}</>)}
        </small>
        {isSeries && <div className="progress" style={{ marginTop: 6, maxWidth: 320 }}><i style={{ width: pct + "%" }}/></div>}
      </div>
      <div className="mediaItemActions">
        {isSeries && <button className="ghost" title="Somar 1 episódio assistido" onClick={bumpEpisode}><Plus size={13}/> Ep.</button>}
        {item.link && <a className="ghost" href={item.link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}><ExternalLink size={13}/> Assistir</a>}
      </div>
      <button className="exerciseMenuBtn" onClick={onToggleMenu}><MoreVertical size={16}/></button>
      {menuOpen && (
        <div className="exerciseMenuPop flashMenuPop" onClick={e => e.stopPropagation()}>
          <button onClick={onEdit}><Pencil size={13}/> Editar</button>
          <button className="danger" onClick={onDelete}><Trash2 size={13}/> Excluir</button>
        </div>
      )}
    </div>
  );
}

function MediaItemForm({ item, kind, session, onCancel, onSave }) {
  const isSeries = kind === "serie";
  const [itemId] = useState(() => item?.id || crypto.randomUUID());
  const [title, setTitle] = useState(item?.title || "");
  const [link, setLink] = useState(item?.link || "");
  const [status, setStatus] = useState(item?.status || "quero_ver");
  const [photo, setPhoto] = useState(item?.photo || "");
  const cachedPhoto = useCachedImageUrl(photo);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef(null);
  const [hasSeasons, setHasSeasons] = useState(item?.has_seasons || false);
  const [totalEpisodes, setTotalEpisodes] = useState(item?.total_episodes ?? 0);
  const [currentEpisode, setCurrentEpisode] = useState(item?.current_episode ?? 0);
  const [currentSeason, setCurrentSeason] = useState(item?.current_season ?? 1);
  const [seasons, setSeasons] = useState(item?.seasons?.length ? item.seasons : [{ season: 1, total_episodes: 0, current_episode: 0 }]);

  const handlePhotoFile = async (file) => {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      if (cloudConfigured && session?.user?.id) {
        const blob = await resizeImageToBlob(file, 480, 480, 0.85);
        const url = await uploadMediaItemImage(session.user.id, itemId, blob);
        setPhoto(url);
      } else {
        const dataUrl = await resizeImageToDataUrl(file, 480, 480, 0.85);
        setPhoto(dataUrl);
      }
    } catch (e) {
      console.error(e);
      alert("Não foi possível usar essa imagem. Tente outra foto.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    if (photo && cloudConfigured && session?.user?.id && photo.includes("/media_images/")) {
      deleteMediaItemImage(session.user.id, itemId).catch(() => {});
    }
    setPhoto("");
  };

  const setSeasonField = (season, field, value) => setSeasons(ss => ss.map(s => s.season === season ? { ...s, [field]: value } : s));
  const addSeason = () => setSeasons(ss => [...ss, { season: (Math.max(0, ...ss.map(s => Number(s.season) || 0)) + 1), total_episodes: 0, current_episode: 0 }]);
  const removeSeason = (season) => setSeasons(ss => ss.length > 1 ? ss.filter(s => s.season !== season) : ss);

  const handleSubmit = () => {
    if (!title.trim()) return;
    const payload = { id: itemId, title: title.trim(), link: link.trim() || null, status, photo: photo || null };
    if (isSeries) {
      payload.has_seasons = hasSeasons;
      if (hasSeasons) {
        const cleanSeasons = seasons.map(s => ({
          season: Number(s.season) || 1,
          total_episodes: Number(s.total_episodes) || 0,
          current_episode: Math.min(Number(s.current_episode) || 0, Number(s.total_episodes) || 0),
        }));
        payload.seasons = cleanSeasons;
        payload.current_season = Number(currentSeason) || cleanSeasons[0]?.season || 1;
        payload.total_episodes = 0;
        payload.current_episode = 0;
      } else {
        payload.total_episodes = Number(totalEpisodes) || 0;
        payload.current_episode = Math.min(Number(currentEpisode) || 0, Number(totalEpisodes) || 0);
        payload.seasons = [];
        payload.current_season = 1;
      }
    }
    onSave(payload);
  };

  return (
    <div className="content">
      <div className="flashFormHead">
        <h2>{item ? "Editar" : "Adicionar"} {isSeries ? "série" : "filme"}</h2>
        <div className="flashHeadActions">
          <button className="ghost" onClick={onCancel}>Cancelar</button>
          <button className="add" disabled={!title.trim()} onClick={handleSubmit}><Check size={16}/> Salvar</button>
        </div>
      </div>

      <div className="exerciseFormFields" style={{ maxWidth: 520 }}>
        <label>Foto (opcional)
          <div className="exerciseGifPreview shoppingPhotoPreview" onClick={() => photoInputRef.current?.click()}>
            {photo ? <img src={cachedPhoto || photo} alt="Prévia"/> : (isSeries ? <Clapperboard size={28}/> : <Film size={28}/>)}
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handlePhotoFile(f); }}/>
          <button type="button" className="ghost" onClick={() => photoInputRef.current?.click()}>{uploadingPhoto ? "Enviando..." : (photo ? "Trocar foto" : "Escolher foto")}</button>
          {photo && <button type="button" className="ghost" onClick={handleRemovePhoto}><X size={13}/> Remover foto</button>}
        </label>
        <label>Título<input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder={isSeries ? "Ex.: Breaking Bad" : "Ex.: Interestelar"}/></label>
        <label>Link para assistir (opcional)<input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..."/></label>
        <label>Status
          <div className="themeToggle exerciseModeToggle">
            <button type="button" className={status === "quero_ver" ? "active" : ""} onClick={() => setStatus("quero_ver")}>Quero ver</button>
            <button type="button" className={status === "assistindo" ? "active" : ""} onClick={() => setStatus("assistindo")}>Assistindo</button>
            <button type="button" className={status === "concluido" ? "active" : ""} onClick={() => setStatus("concluido")}>Concluído</button>
          </div>
        </label>

        {isSeries && (
          <label className="penCheckLabel"><input type="checkbox" checked={hasSeasons} onChange={e => setHasSeasons(e.target.checked)}/> Essa série tem temporadas separadas</label>
        )}

        {isSeries && !hasSeasons && (<>
          <label>Total de episódios<input type="number" min="0" value={totalEpisodes} onChange={e => setTotalEpisodes(e.target.value)}/></label>
          <label>Episódio atual<input type="number" min="0" value={currentEpisode} onChange={e => setCurrentEpisode(e.target.value)}/></label>
        </>)}

        {isSeries && hasSeasons && (<>
          <label>Temporada atual<input type="number" min="1" value={currentSeason} onChange={e => setCurrentSeason(e.target.value)}/></label>
          <div className="seasonsEditor">
            <small className="bookMenuLabel">Temporadas</small>
            {seasons.map(s => (
              <div className="seasonRow" key={s.season}>
                <span>Temp. {s.season}</span>
                <input type="number" min="0" value={s.total_episodes} onChange={e => setSeasonField(s.season, "total_episodes", e.target.value)} placeholder="Total de episódios"/>
                <input type="number" min="0" value={s.current_episode} onChange={e => setSeasonField(s.season, "current_episode", e.target.value)} placeholder="Episódio atual"/>
                <button type="button" className="ghost" onClick={() => removeSeason(s.season)}><Trash2 size={13}/></button>
              </div>
            ))}
            <button type="button" className="ghost" onClick={addSeason}><Plus size={14}/> Adicionar temporada</button>
          </div>
        </>)}
      </div>
    </div>
  );
}

// ---------- Jogos (Área de Lazer) ----------
// Guarda os jogos que a pessoa quer jogar, está jogando ou já zerou.
// "game_groups" funciona como pasta: agrupa jogos de uma mesma franquia
// (ex.: God of War, Zelda), cada uma com seu próprio progresso.

function gameFranchisePct(items) {
  if (!items.length) return 0;
  const done = items.filter(i => i.status === "zerado").length;
  return Math.round((done / items.length) * 100);
}

function GameShelf({ groupsEntity, itemsEntity, session }) {
  const { data: groups, add: addGroup, remove: removeGroup, update: updateGroup } = groupsEntity;
  const { data: items, add: addItem, remove: removeItem, update: updateItem } = itemsEntity;

  const [currentGroupId, setCurrentGroupId] = useState(null);
  const [groupModal, setGroupModal] = useState(null); // null | "new" | grupo sendo renomeado
  const [itemForm, setItemForm] = useState(null); // null | "new" | item sendo editado
  const [openMenuId, setOpenMenuId] = useState(null);

  const currentGroup = currentGroupId ? groups.find(g => g.id === currentGroupId) : null;
  const visibleItems = currentGroupId
    ? items.filter(i => i.group_id === currentGroupId)
    : items.filter(i => !i.group_id);

  const handleSaveGroup = (name) => {
    if (groupModal === "new") addGroup({ name, cover_image: null });
    else updateGroup(groupModal.id, { name });
    setGroupModal(null);
  };

  const handleSetCover = async (group, file) => {
    setOpenMenuId(null);
    try {
      if (cloudConfigured && session?.user?.id) {
        const blob = await resizeImageToBlob(file, 480, 480, 0.85);
        const url = await uploadGameGroupCover(session.user.id, group.id, blob);
        await updateGroup(group.id, { cover_image: url });
      } else {
        const dataUrl = await resizeImageToDataUrl(file, 480, 480, 0.85);
        await updateGroup(group.id, { cover_image: dataUrl });
      }
    } catch (e) {
      console.error(e);
      alert("Não foi possível usar essa imagem. Tente outra foto.");
    }
  };
  const handleRemoveCover = (group) => {
    setOpenMenuId(null);
    if (group.cover_image && cloudConfigured && session?.user?.id && group.cover_image.includes("/game_images/")) {
      deleteGameGroupCover(session.user.id, group.id).catch(() => {});
    }
    updateGroup(group.id, { cover_image: null });
  };

  const confirmDeleteGroup = (group) => {
    setOpenMenuId(null);
    const count = items.filter(i => i.group_id === group.id).length;
    const msg = count > 0
      ? `Excluir "${group.name}"? Os ${count} jogo(s) dentro dela também serão apagados.`
      : `Excluir "${group.name}"?`;
    if (!confirm(msg)) return;
    const cloudCleanup = cloudConfigured && session?.user?.id;
    if (cloudCleanup && group.cover_image?.includes("/game_images/")) {
      deleteGameGroupCover(session.user.id, group.id).catch(() => {});
    }
    items.filter(i => i.group_id === group.id).forEach(i => {
      if (cloudCleanup && i.photo?.includes("/game_images/")) {
        deleteGameItemImage(session.user.id, i.id).catch(() => {});
      }
      removeItem(i.id);
    });
    removeGroup(group.id);
    if (currentGroupId === group.id) setCurrentGroupId(null);
  };

  const confirmDeleteItem = (item) => {
    setOpenMenuId(null);
    if (confirm(`Excluir "${item.title}"?`)) {
      if (item.photo && cloudConfigured && session?.user?.id && item.photo.includes("/game_images/")) {
        deleteGameItemImage(session.user.id, item.id).catch(() => {});
      }
      removeItem(item.id);
    }
  };

  if (itemForm !== null) {
    return <GameItemForm
      item={itemForm === "new" ? null : itemForm}
      session={session}
      onCancel={() => setItemForm(null)}
      onSave={(payload) => {
        if (itemForm === "new") addItem({ group_id: currentGroupId, ...payload });
        else updateItem(itemForm.id, payload);
        setItemForm(null);
      }}
    />;
  }

  return (
    <div className="content" onClick={() => setOpenMenuId(null)}>
      <div className="flashHead">
        <div className="flashHeadInfo">
          <div className="flashHeadIcon"><Gamepad2 size={22}/></div>
          <div>
            <small>ÁREA DE LAZER</small>
            <h2>{currentGroup ? currentGroup.name : "Jogos"}</h2>
            <p>{currentGroup
              ? `${visibleItems.length} jogo(s) aqui.`
              : "Guarde os jogos que você quer jogar, acompanhe o progresso e organize por franquia."}</p>
          </div>
        </div>
        <div className="flashHeadActions">
          {currentGroup && <button className="ghost" onClick={() => setCurrentGroupId(null)}><ChevronLeft size={16}/> Voltar</button>}
          <button className="add" onClick={(e) => { e.stopPropagation(); setItemForm("new"); }}><Plus size={16}/> Adicionar jogo</button>
        </div>
      </div>

      {!currentGroup && (
        <div className="flashSection">
          <h3>Franquias</h3>
          <div className="shelf">
            <div className="bookTile addTile" onClick={() => setGroupModal("new")}>
              <div className="bookCoverWrap addCover"><FolderPlus size={26}/><span>Nova franquia</span></div>
            </div>
            {groups.map(group => {
              const groupItems = items.filter(i => i.group_id === group.id);
              return (
                <GameGroupTile
                  key={group.id}
                  group={group}
                  count={groupItems.length}
                  pct={gameFranchisePct(groupItems)}
                  menuOpen={openMenuId === "g:" + group.id}
                  onToggleMenu={(e) => { e?.stopPropagation?.(); setOpenMenuId(id => id === "g:" + group.id ? null : "g:" + group.id); }}
                  onOpen={() => setCurrentGroupId(group.id)}
                  onRename={() => { setOpenMenuId(null); setGroupModal(group); }}
                  onDelete={() => confirmDeleteGroup(group)}
                  onSetCover={(file) => handleSetCover(group, file)}
                  onRemoveCover={() => handleRemoveCover(group)}
                />
              );
            })}
            {groups.length === 0 && <p className="emptyHint">Nenhuma franquia criada ainda.</p>}
          </div>
        </div>
      )}

      <div className="flashSection">
        {!currentGroup && <h3>Jogos avulsos</h3>}
        {visibleItems.length === 0 ? (
          <p className="emptyHint">{currentGroup ? "Nenhum jogo nessa franquia ainda." : "Nenhum jogo por aqui ainda."}</p>
        ) : (
          <div className="exerciseList">
            {visibleItems.map(item => (
              <GameItemRow
                key={item.id}
                item={item}
                menuOpen={openMenuId === item.id}
                onToggleMenu={(e) => { e.stopPropagation(); setOpenMenuId(id => id === item.id ? null : item.id); }}
                onEdit={() => { setOpenMenuId(null); setItemForm(item); }}
                onDelete={() => confirmDeleteItem(item)}
                onStatusChange={(status) => updateItem(item.id, { status })}
              />
            ))}
          </div>
        )}
      </div>

      {groupModal && (
        <FolderModal
          folder={groupModal === "new" ? null : groupModal}
          onClose={() => setGroupModal(null)}
          onSave={handleSaveGroup}
        />
      )}
    </div>
  );
}

function GameGroupTile({ group, count, pct, menuOpen, onToggleMenu, onOpen, onRename, onDelete, onSetCover, onRemoveCover }) {
  const coverInputRef = useRef(null);
  return (
    <div className="bookTile groupTile" onClick={onOpen}>
      <div className="bookCoverWrap groupCover">
        <SaverImg src={group.cover_image} alt={group.name} wrapClassName="bookCoverImg" fallback={<Gamepad2 size={34}/>}/>
      </div>
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onSetCover(file); }}
      />
      <button className="bookMenuBtn" onClick={(e) => { e.stopPropagation(); onToggleMenu(e); }}><MoreVertical size={16}/></button>
      {menuOpen && <div className="bookMenu" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => coverInputRef.current?.click()}><ImagePlus size={13}/> {group.cover_image ? "Trocar foto da capa" : "Colocar foto na capa"}</button>
        {group.cover_image && <button onClick={onRemoveCover}><X size={13}/> Remover foto da capa</button>}
        <button onClick={onRename}><Pencil size={13}/> Renomear</button>
        <button className="danger" onClick={onDelete}><Trash2 size={13}/> Excluir</button>
      </div>}
      <b className="bookTitle">{group.name}</b>
      <div className="progress" style={{ marginTop: 6 }}><i style={{ width: pct + "%" }}/></div>
      <small className="bookProgressLabel">{count} jogo{count === 1 ? "" : "s"} · {pct}%</small>
    </div>
  );
}

function GameItemRow({ item, menuOpen, onToggleMenu, onEdit, onDelete, onStatusChange }) {
  return (
    <div className="exerciseRow">
      <div className="exerciseThumb">
        <SaverImg src={item.photo} alt={item.title} fallback={<Gamepad2 size={22}/>}/>
      </div>
      <div className="exerciseInfo">
        <b>{item.title}</b>
        <small>
          <select className="mediaStatusSelect" value={item.status || "quero_jogar"} onClick={e => e.stopPropagation()} onChange={e => onStatusChange(e.target.value)}>
            <option value="quero_jogar">Quero jogar</option>
            <option value="jogando">Jogando</option>
            <option value="zerado">Zerado</option>
          </select>
        </small>
      </div>
      <div className="mediaItemActions">
        {item.link && <a className="ghost" href={item.link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}><ExternalLink size={13}/> Abrir</a>}
      </div>
      <button className="exerciseMenuBtn" onClick={onToggleMenu}><MoreVertical size={16}/></button>
      {menuOpen && (
        <div className="exerciseMenuPop flashMenuPop" onClick={e => e.stopPropagation()}>
          <button onClick={onEdit}><Pencil size={13}/> Editar</button>
          <button className="danger" onClick={onDelete}><Trash2 size={13}/> Excluir</button>
        </div>
      )}
    </div>
  );
}

function GameItemForm({ item, session, onCancel, onSave }) {
  const [itemId] = useState(() => item?.id || crypto.randomUUID());
  const [title, setTitle] = useState(item?.title || "");
  const [link, setLink] = useState(item?.link || "");
  const [status, setStatus] = useState(item?.status || "quero_jogar");
  const [photo, setPhoto] = useState(item?.photo || "");
  const cachedPhoto = useCachedImageUrl(photo);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef(null);

  const handlePhotoFile = async (file) => {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      if (cloudConfigured && session?.user?.id) {
        const blob = await resizeImageToBlob(file, 480, 480, 0.85);
        const url = await uploadGameItemImage(session.user.id, itemId, blob);
        setPhoto(url);
      } else {
        const dataUrl = await resizeImageToDataUrl(file, 480, 480, 0.85);
        setPhoto(dataUrl);
      }
    } catch (e) {
      console.error(e);
      alert("Não foi possível usar essa imagem. Tente outra foto.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    if (photo && cloudConfigured && session?.user?.id && photo.includes("/game_images/")) {
      deleteGameItemImage(session.user.id, itemId).catch(() => {});
    }
    setPhoto("");
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSave({ id: itemId, title: title.trim(), link: link.trim() || null, status, photo: photo || null });
  };

  return (
    <div className="content">
      <div className="flashFormHead">
        <h2>{item ? "Editar" : "Adicionar"} jogo</h2>
        <div className="flashHeadActions">
          <button className="ghost" onClick={onCancel}>Cancelar</button>
          <button className="add" disabled={!title.trim()} onClick={handleSubmit}><Check size={16}/> Salvar</button>
        </div>
      </div>

      <div className="exerciseFormFields" style={{ maxWidth: 520 }}>
        <label>Foto (opcional)
          <div className="exerciseGifPreview shoppingPhotoPreview" onClick={() => photoInputRef.current?.click()}>
            {photo ? <img src={cachedPhoto || photo} alt="Prévia"/> : <Gamepad2 size={28}/>}
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handlePhotoFile(f); }}/>
          <button type="button" className="ghost" onClick={() => photoInputRef.current?.click()}>{uploadingPhoto ? "Enviando..." : (photo ? "Trocar foto" : "Escolher foto")}</button>
          {photo && <button type="button" className="ghost" onClick={handleRemovePhoto}><X size={13}/> Remover foto</button>}
        </label>
        <label>Título<input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: The Legend of Zelda: Tears of the Kingdom"/></label>
        <label>Link (loja, wiki etc. — opcional)<input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..."/></label>
        <label>Status
          <div className="themeToggle exerciseModeToggle">
            <button type="button" className={status === "quero_jogar" ? "active" : ""} onClick={() => setStatus("quero_jogar")}>Quero jogar</button>
            <button type="button" className={status === "jogando" ? "active" : ""} onClick={() => setStatus("jogando")}>Jogando</button>
            <button type="button" className={status === "zerado" ? "active" : ""} onClick={() => setStatus("zerado")}>Zerado</button>
          </div>
        </label>
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

function StudyFlashcards({ entity, listsEntity, foldersEntity, studyGoals, session }) {
  const { data: pdfCards, remove: removePdfCard } = entity;
  const { data: lists, add: addList, remove: removeList, update: updateList, fetchFull: fetchFullList } = listsEntity;
  const { data: folders, add: addFolder, remove: removeFolder, update: updateFolder } = foldersEntity;

  const [openFolderId, setOpenFolderId] = useState(null);
  const [folderModal, setFolderModal] = useState(null); // null | "new" | folder being renamed
  const [listForm, setListForm] = useState(null); // null | "new" | list being edited
  const [viewingListId, setViewingListId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null); // "list:<id>" | "folder:<id>"
  const [openingListId, setOpeningListId] = useState(null); // id cujo `cards` completo está sendo buscado

  const viewingList = viewingListId ? lists.find(l => l.id === viewingListId) : null;
  const currentFolder = openFolderId ? folders.find(f => f.id === openFolderId) : null;
  const visibleLists = lists.filter(l => (l.folder_id || null) === openFolderId);

  // `cards` só entra na lista depois que fetchFullList busca a linha inteira
  // uma vez (a listagem inicial vem enxuta, sem esse campo — ver listSelect
  // em useEntity). Se já tiver sido buscado nesta sessão, reabrir a mesma
  // lista pra estudar/editar não precisa gastar egress de novo — os dados já
  // estão em memória (cloudData) e refletem qualquer edição feita aqui no app.
  const openListToStudy = async (id) => {
    const cached = lists.find(l => l.id === id);
    if (cached?.cards) { setViewingListId(id); return; }
    setOpeningListId(id);
    try {
      await fetchFullList(id);
      setViewingListId(id);
    } finally {
      setOpeningListId(null);
    }
  };

  const openListToEdit = async (l) => {
    setOpenMenuId(null);
    if (l.cards) { setListForm(l); return; }
    setOpeningListId(l.id);
    try {
      const full = await fetchFullList(l.id);
      setListForm(full || l);
    } finally {
      setOpeningListId(null);
    }
  };

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
      session={session}
      onBack={() => setViewingListId(null)}
      onEdit={() => { setListForm(viewingList); setViewingListId(null); }}
      onFinish={(listId, listTitle) => markFlashcardListStudied(listsEntity, studyGoals, listId, listTitle)}
    />;
  }

  if (listForm !== null) {
    return <FlashcardListForm
      list={listForm === "new" ? null : listForm}
      defaultFolderId={openFolderId}
      session={session}
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
                {visibleLists.map(l => {
                  const cardCount = l.card_count ?? l.cards?.length ?? 0;
                  return (
                  <div key={l.id} className="flashListTile">
                    <span className="flashListBadge"><Layers size={12}/> {cardCount} termo{cardCount===1?"":"s"}</span>
                    <h4>{l.title || "Lista sem título"}</h4>
                    <p>{l.description || "Sem descrição"}</p>
                    <div className="flashListTileFoot">
                      <button className="flashStudyBtn" disabled={openingListId===l.id} onClick={() => openListToStudy(l.id)}><Zap size={14}/> {openingListId===l.id ? "Abrindo..." : "Estudar"}</button>
                      <button className="flashTileMenuBtn" onClick={(e) => { e.stopPropagation(); setOpenMenuId(id => id===`list:${l.id}`?null:`list:${l.id}`); }}><MoreVertical size={16}/></button>
                    </div>
                    {openMenuId===`list:${l.id}` && (
                      <div className="flashMenuPop" onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>openListToEdit(l)}><Pencil size={13}/> Editar</button>
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
                  );
                })}
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

function FlashcardListForm({ list, defaultFolderId, session, onCancel, onSave }) {
  const [title, setTitle] = useState(list?.title || "");
  const [description, setDescription] = useState(list?.description || "");
  // Par de idiomas do termo/definição — usado só pra dar sugestão de tradução
  // enquanto a pessoa digita (não afeta o estudo/o jogo, é opcional).
  const [termLang, setTermLang] = useState(list?.term_lang || null);
  const [defLang, setDefLang] = useState(list?.definition_lang || null);
  const [rows, setRows] = useState(
    list?.cards?.length ? list.cards.map(c => ({ id: c.id || rid(), term: c.term || "", definition: c.definition || "", image: c.image || null }))
      : [{ id: rid(), term: "", definition: "", image: null }, { id: rid(), term: "", definition: "", image: null }]
  );
  const [uploadingId, setUploadingId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  const setRow = (id, field, value) => setRows(rs => rs.map(r => r.id===id ? {...r, [field]: value} : r));
  const removeRow = (id) => {
    setRows(rs => {
      const row = rs.find(r => r.id === id);
      if (row?.image && cloudConfigured && session?.user?.id && row.image.includes("/flashcard_images/")) {
        // Best-effort: não trava a remoção da linha se o storage falhar.
        deleteFlashcardImage(session.user.id, id).catch(() => {});
      }
      return rs.filter(r => r.id !== id);
    });
  };
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
      if (cloudConfigured && session?.user?.id) {
        // Logado na nuvem: sobe pro Storage e guarda só a URL no cartão — assim
        // o navegador cacheia a imagem normalmente, em vez de baixar um base64
        // embutido no JSON toda vez que a lista é carregada (isso é o que mais
        // pesava no egress do plano gratuito nas listas com fotos).
        const blob = await resizeImageToBlob(file, 640, 640, 0.82);
        const url = await uploadFlashcardImage(session.user.id, id, blob);
        setRow(id, "image", url);
      } else {
        // Modo local (sem login/Supabase configurado): não há onde subir o
        // arquivo, então mantém o comportamento antigo de embutir o base64.
        const dataUrl = await resizeImageToDataUrl(file, 640, 640, 0.82);
        setRow(id, "image", dataUrl);
      }
    } catch (e) {
      console.error(e);
      alert("Não foi possível usar essa imagem. Tente outra foto.");
    } finally {
      setUploadingId(null);
    }
  };

  const handleRemoveRowImage = (id) => {
    const row = rows.find(r => r.id === id);
    if (row?.image && cloudConfigured && session?.user?.id && row.image.includes("/flashcard_images/")) {
      deleteFlashcardImage(session.user.id, id).catch(() => {});
    }
    setRow(id, "image", null);
  };

  const submit = () => {
    const cards = rows.filter(r => stripHtml(r.term).trim() || stripHtml(r.definition).trim() || r.image).map(r => ({ id: r.id, term: r.term, definition: r.definition, image: r.image || null }));
    if (cards.length === 0) { alert("Adicione pelo menos um cartão com termo ou definição."); return; }
    onSave({
      title: title.trim() || "Lista sem título",
      description: description.trim(),
      folder_id: list ? (list.folder_id ?? null) : (defaultFolderId ?? null),
      term_lang: termLang,
      definition_lang: defLang,
      cards,
      card_count: cards.length,
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

      <div className="flashLangBar">
        <div className="flashLangBarCol">
          <span>TERMO</span>
          <LanguagePicker value={termLang} onChange={setTermLang}/>
        </div>
        <div className="flashLangBarCol">
          <span>DEFINIÇÃO</span>
          <LanguagePicker value={defLang} onChange={setDefLang}/>
        </div>
      </div>
      {termLang && defLang && termLang !== defLang && (
        <p className="flashLangHint">
          <Sparkle size={13}/> Digite o termo em {languageName(termLang)} e vamos sugerir a tradução em {languageName(defLang)}.
        </p>
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
          onRemoveImage={handleRemoveRowImage}
          termLang={termLang}
          defLang={defLang}
        />
      ))}

      <button className="flashAddRowBtn" onClick={addRow}><Plus size={15}/> Adicionar cartão</button>
    </div>
  );
}

const FLASH_HIGHLIGHT_COLOR = "#997700";

function FlashFormRow({ row, index, uploading, onChangeField, onRemove, onImage, onRemoveImage, termLang, defLang }) {
  const termRef = useRef(null);
  const defRef = useRef(null);
  const cachedRowImage = useCachedImageUrl(row.image);

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

  // Sugestões de tradução: enquanto a pessoa digita o termo (com os dois
  // idiomas escolhidos), busca opções de tradução e mostra num dropdown
  // embaixo do campo de definição — clicar numa opção preenche a definição.
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimerRef = useRef(null);
  const suggestReqIdRef = useRef(0);
  const translationEnabled = !!(termLang && defLang && termLang !== defLang);

  useEffect(() => {
    if (!translationEnabled) { setSuggestions([]); setShowSuggestions(false); return; }
    const plain = stripHtml(row.term || "").trim();
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    if (!plain) { setSuggestions([]); setShowSuggestions(false); return; }
    const reqId = ++suggestReqIdRef.current;
    suggestTimerRef.current = setTimeout(async () => {
      setSuggestLoading(true);
      const result = await fetchTranslationSuggestions(plain, languageName(termLang), languageName(defLang));
      if (reqId !== suggestReqIdRef.current) return; // resposta antiga, termo já mudou
      setSuggestLoading(false);
      setSuggestions(result);
      setShowSuggestions(result.length > 0);
    }, 500);
    return () => clearTimeout(suggestTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.term, termLang, defLang, translationEnabled]);

  const applySuggestion = (text) => {
    if (defRef.current) {
      defRef.current.innerHTML = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      onChangeField(row.id, "definition", defRef.current.innerHTML);
    }
    setShowSuggestions(false);
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
            data-placeholder={termLang ? `Digite em ${languageName(termLang)}` : "Digite o termo"}
            onInput={()=>onChangeField(row.id, "term", termRef.current.innerHTML)}
          />
          <label>TERMO</label>
        </div>
        <div className="flashDefFieldWrap">
          <div
            ref={defRef}
            className="flashRichField"
            contentEditable
            suppressContentEditableWarning
            data-placeholder={defLang ? `Digite em ${languageName(defLang)}` : "Digite a definição"}
            onInput={()=>{ onChangeField(row.id, "definition", defRef.current.innerHTML); setShowSuggestions(false); }}
            onFocus={()=>{ if (suggestions.length) setShowSuggestions(true); }}
          />
          <label>DEFINIÇÃO</label>
          {translationEnabled && (suggestLoading || (showSuggestions && suggestions.length > 0)) && (
            <div className="flashSuggestPop">
              {suggestLoading ? (
                <div className="flashSuggestLoading">Buscando traduções...</div>
              ) : (
                suggestions.map((s, i) => (
                  <button type="button" key={i} className="flashSuggestItem" onMouseDown={(e)=>{ e.preventDefault(); applySuggestion(s); }}>
                    {s}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <div className="flashFormImageField">
          <label className="flashFormImageBtn">
            {uploading ? (
              <span>Enviando...</span>
            ) : row.image ? (
              <img src={cachedRowImage || row.image} alt="Imagem do cartão"/>
            ) : (
              <><ImagePlus size={16}/><span>Imagem</span></>
            )}
            <input type="file" accept="image/*" hidden onChange={e=>{ const f=e.target.files?.[0]; e.target.value=""; if (f) onImage(row.id, f); }}/>
          </label>
          {row.image && <button className="flashFormImageRemove" onClick={()=>onRemoveImage(row.id)}><X size={12}/></button>}
          <label>IMAGEM</label>
        </div>
      </div>
    </div>
  );
}

const FLASHCARD_MODES = [
  { id: "cards", label: "Cartões", hint: "Vire e revise", icon: Zap, iconClass: "flashTabIconOrange" },
  { id: "learn", label: "Aprender", hint: "Quiz de múltipla escolha", icon: Lightbulb, iconClass: "flashTabIconPurple" },
  { id: "match", label: "Combinar", hint: "Jogo de pares", icon: LayoutGrid, iconClass: "flashTabIconGreen" },
];

function FlashcardModeGrid({ activeTab, onPick }) {
  return (
    <div className="flashTabs">
      {FLASHCARD_MODES.map(m => (
        <div key={m.id} className={"flashTab"+(activeTab===m.id?" active":"")} onClick={()=>onPick(m.id)}>
          <div className={"flashTabIcon "+m.iconClass}><m.icon size={18}/></div>
          <div><b>{m.label}</b><small>{m.hint}</small></div>
        </div>
      ))}
    </div>
  );
}

function FlashcardModeSwitchModal({ activeTab, onPick, onClose }) {
  return (
    <div className="modalBack" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modalHead"><h2>Trocar modo</h2><button type="button" onClick={onClose}><X/></button></div>
        <FlashcardModeGrid activeTab={activeTab} onPick={(id)=>{ onPick(id); onClose(); }}/>
      </div>
    </div>
  );
}

function FlashcardListStudy({ list, session, onBack, onEdit, onFinish }) {
  const [tab, setTab] = useState(null);
  const [switchingMode, setSwitchingMode] = useState(false);
  const [hideDefs, setHideDefs] = useState(false);
  const [aiQuizOpen, setAiQuizOpen] = useState(false);
  const cards = list.cards || [];
  const notifyFinished = () => onFinish && onFinish(list.id, list.title || "Lista sem título");
  const fullRef = useRef(null);
  const [fullscreen, toggleFullscreen] = useFullscreen(fullRef);

  return (
    <div className={"content flashStudyRoot"+(fullscreen?" flashStudyRootFull":"")} ref={fullRef}>
      <div className="flashFormHead">
        <div><h2>{list.title || "Lista sem título"}</h2><small className="flashListMeta">{cards.length} cartão{cards.length===1?"":"s"}</small></div>
        <div className="flashHeadActions">
          {tab && <button className="ghost" onClick={()=>setSwitchingMode(true)}><ArrowLeftRight size={15}/> Trocar modo</button>}
          <button className="ghost" title={fullscreen?"Sair da tela cheia":"Tela cheia"} onClick={toggleFullscreen}>{fullscreen?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button>
          <button className="ghost" onClick={onEdit}><Pencil size={15}/> Editar</button>
          <button className="ghost" onClick={onBack}><ChevronLeft size={16}/> Voltar</button>
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="emptyHint">Esta lista ainda não tem cartões. Clique em "Editar" para adicionar.</p>
      ) : !tab ? (
        <>
          <p className="emptyHint">Escolha um modo para começar a estudar.</p>
          <FlashcardModeGrid activeTab={tab} onPick={setTab}/>

          <div className="flashIntroTerms">
            <div className="flashIntroTermsHead"><b>Termos nesta lista ({cards.length})</b></div>
            {cards.map(c => (
              <div key={c.id} className="flashIntroTermRow">
                <div className="flashIntroTermFront">
                  <SaverImg src={c.image} className="flashIntroTermImg" fallback={null}/>
                  {stripHtml(c.term).trim() ? <span dangerouslySetInnerHTML={{__html: c.term}}/> : <span className="flashIntroTermEmpty">(sem termo)</span>}
                </div>
                {!hideDefs && (
                  <div className="flashIntroTermBack">
                    {stripHtml(c.definition).trim() ? <span dangerouslySetInnerHTML={{__html: c.definition}}/> : <span className="flashIntroTermEmpty">(sem definição)</span>}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flashIntroBar">
            <button className="flashIntroBarBtn" onClick={()=>setHideDefs(h=>!h)}>
              {hideDefs ? <Eye size={15}/> : <EyeOff size={15}/>}
              {hideDefs ? "Mostrar definições" : "Esconder definições"}
            </button>
            <button className="flashAIBtn" title="Estudar com IA" onClick={()=>setAiQuizOpen(true)}><Sparkles size={17}/></button>
          </div>
        </>
      ) : tab === "cards" ? <FlashcardFlipMode cards={cards} onComplete={notifyFinished} termLang={list.term_lang} defLang={list.definition_lang}/>
        : tab === "learn" ? <FlashcardLearnMode cards={cards} onComplete={notifyFinished}/>
        : <FlashcardMatchMode cards={cards} onComplete={notifyFinished}/>}

      {switchingMode && <FlashcardModeSwitchModal activeTab={tab} onPick={setTab} onClose={()=>setSwitchingMode(false)}/>}
      {aiQuizOpen && <FlashcardAIQuiz listId={list.id} cards={cards} session={session} onClose={()=>setAiQuizOpen(false)}/>}
    </div>
  );
}

function FlashcardAIQuiz({ listId, cards, session, onClose }) {
  const aiAvailable = cloudConfigured && !!session;
  const [messages, setMessages] = useState([]); // [{role:"user"|"model", text}] — só para exibir o chat, nunca reenviado ao servidor
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const startedRef = useRef(false);
  const bodyRef = useRef(null);

  // Estado resumido da sessão de quiz, mantido só no cliente (troca de texto
  // por dados). Em vez de reenviar o histórico bruto da conversa a cada
  // pergunta — o que faz o payload crescer a cada turno (O(n²) na sessão
  // inteira) — mandamos pro servidor só isto, que cresce no máximo com o
  // número de termos da lista, não com o número de perguntas já feitas:
  //   progress: [{ term, correct }] — termos já cobertos e se acertou
  //   pendingQuestion/pendingTerm — a última pergunta feita pela IA, para
  //     poder reenviá-la (só ela, não o resto da conversa) junto da resposta
  //     atual do usuário, e o servidor conseguir avaliar contra o termo certo.
  const progressRef = useRef([]); // [{term, correct}]
  const pendingRef = useRef({ question: null, term: null });

  // Usado só pra saber se a lista tem termo suficiente pra liberar o quiz —
  // os cartões em si não são mais mandados pro servidor a cada mensagem (ver
  // sendTurn): a edge function busca eles direto no banco pelo listId, uma
  // vez, em vez de o cliente reenviar a lista inteira em toda mensagem do chat.
  const cardsPayload = useMemo(() => cards.map(c => ({
    term: stripHtml(c.term || "").trim(),
    definition: stripHtml(c.definition || "").trim(),
  })).filter(c => c.term || c.definition), [cards]);

  const sendTurn = async (nextMessages, answerText) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("flashcard-quiz", {
        body: {
          listId,
          progress: progressRef.current,
          pendingQuestion: pendingRef.current.question,
          answer: answerText ?? null,
        },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      // Se essa chamada respondeu a uma pergunta pendente, registra o
      // resultado no resumo de progresso antes de seguir pra próxima.
      if (pendingRef.current.term && typeof data.previousAnswerCorrect === "boolean") {
        progressRef.current = [
          ...progressRef.current,
          { term: pendingRef.current.term, correct: data.previousAnswerCorrect },
        ];
      }
      pendingRef.current = { question: data.reply, term: data.nextTerm || null };

      setMessages([...nextMessages, { role: "model", text: data.reply }]);
    } catch (err) {
      setError(err.message || "Não foi possível consultar a IA agora.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (startedRef.current || !aiAvailable || cardsPayload.length === 0) return;
    startedRef.current = true;
    sendTurn([], null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiAvailable]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, loading]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    sendTurn([...messages, { role: "user", text }], text);
  };

  return (
    <div className="modalBack" onClick={onClose}>
      <div className="flashAIQuizPanel" onClick={e => e.stopPropagation()}>
        <div className="flashAIQuizHead">
          <div className="flashAIQuizHeadIcon"><Sparkles size={18}/></div>
          <div><b>Estudar com IA</b><small>Quiz interativo sobre esta lista</small></div>
          <button className="flashAIQuizClose" onClick={onClose}><X size={18}/></button>
        </div>

        {!aiAvailable ? (
          <p className="emptyHint" style={{padding:"0 20px 20px"}}>Para usar a IA, configure a sincronização (Supabase) e entre com sua conta — veja o README.</p>
        ) : cardsPayload.length === 0 ? (
          <p className="emptyHint" style={{padding:"0 20px 20px"}}>Esta lista não tem termos suficientes para gerar um quiz.</p>
        ) : (
          <>
            <div className="flashAIQuizBody" ref={bodyRef}>
              {messages.map((m, i) => (
                <div key={i} className={"flashAIQuizMsg "+m.role}>
                  <div className="flashAIQuizBubble">{m.text}</div>
                  {m.role === "model" && (
                    <div className="flashAIQuizFeedbackRow">
                      <button title="Boa resposta"><ThumbsUp size={13}/></button>
                      <button title="Não ajudou"><ThumbsDown size={13}/></button>
                      <button title="Reportar"><Flag size={13}/></button>
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flashAIQuizMsg model">
                  <div className="flashAIQuizBubble flashAIQuizTyping"><span></span><span></span><span></span></div>
                </div>
              )}
              {error && <p className="aiErrorMsg">{error}</p>}
            </div>

            <div className="flashAIQuizInputBar">
              <button className="flashAIQuizPlus" type="button" tabIndex={-1}><Plus size={16}/></button>
              <input
                className="flashAIQuizInput"
                placeholder="Responda aqui"
                value={input}
                disabled={loading}
                onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{ if (e.key === "Enter") handleSend(); }}
              />
              <button className="flashAIQuizSend" disabled={!input.trim() || loading} onClick={handleSend}><ArrowUp size={16}/></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Atalhos de teclado do modo "Cartões" (virar/marcar). Guardados no
// localStorage pra persistir entre sessões e poderem ser trocados no botão
// de atalhos. "flip" aceita 2 teclas (ex.: W e S, como setas pra cima/baixo);
// "back" e "next" aceitam 1 cada.
const DEFAULT_FLASHCARD_SHORTCUTS = { flip: ["w", "s"], back: ["a"], next: ["d"] };

// Botão de "ouvir" (ícone de alto-falante) usado nas faces do cartão. Lê o
// texto em voz alta no idioma configurado pra aquele lado da lista (termo ou
// definição). Usa a Web Speech API do navegador — sem custo de rede/IA.
function FlashSpeakBtn({ text, lang }) {
  const [speaking, setSpeaking] = useState(false);
  if (!ttsSupported()) return null;
  return (
    <button
      type="button"
      className={"flashFlipSpeakBtn" + (speaking ? " speaking" : "")}
      title="Ouvir"
      onClick={(e) => {
        e.stopPropagation();
        speak(text, lang, { onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) });
      }}
    >
      <Volume2 size={15}/>
    </button>
  );
}

function FlashcardFlipMode({ cards, onComplete, termLang, defLang }) {
  // Modo "sei / não sei" (com marcação e estatísticas) vs. modo "só passar os
  // cartões" (só virar e navegar, sem marcar nada). Fica salvo entre sessões.
  const [trackMode, setTrackMode] = usePersistentState("flashFlipTrackMode", true);
  // Embaralhar a ordem dos cartões. Também fica salvo entre sessões.
  const [shuffleMode, setShuffleMode] = usePersistentState("flashFlipShuffleMode", false);
  const [deck, setDeck] = useState(() => shuffleMode ? shuffleArr(cards) : cards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [feedback, setFeedback] = useState(null); // null | "know" | "learning"
  const [results, setResults] = useState([]); // [{id, know}]
  const [finished, setFinished] = useState(false);
  // Enquanto true, a virada da carta não anima (transição desligada) — usado
  // só na troca automática de cartão pra trocar o conteúdo instantaneamente,
  // sem mostrar nem a pergunta do cartão anterior nem a resposta do próximo
  // durante o meio da animação.
  const [noFlipAnim, setNoFlipAnim] = useState(false);
  const card = deck[index];
  const [shortcuts, setShortcuts] = usePersistentState("flashKeyboardShortcuts", DEFAULT_FLASHCARD_SHORTCUTS);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const finishDeck = () => {
    setFinished(true);
    // Só conta como "lista estudada" quando o baralho revisado é o completo (não a rodada de refazer só os que faltam).
    if (deck.length === cards.length) onComplete && onComplete();
  };

  // Troca pro cartão seguinte/anterior sem transição de virada — usado depois
  // do feedback e na navegação manual, pra nunca mostrar o cartão errado
  // (nem o anterior, nem o próximo) durante a animação.
  const swapCardInstantly = (updateFn) => {
    setNoFlipAnim(true);
    setFlipped(false);
    updateFn();
    // Duplo requestAnimationFrame: o 1º garante que o navegador já pintou o
    // estado sem transição; o 2º reativa a transição só depois disso, senão
    // o próprio "religamento" pode ser pego pelo navegador ainda no mesmo frame.
    requestAnimationFrame(() => requestAnimationFrame(() => setNoFlipAnim(false)));
  };

  const go = (dir) => {
    // No modo "só passar", chegar ao fim do baralho encerra a revisão em vez
    // de simplesmente travar no último cartão sem fazer nada.
    if (!trackMode && dir > 0 && index === deck.length - 1) {
      if (flipped) { setFlipped(false); setTimeout(finishDeck, 420); } else finishDeck();
      return;
    }
    if (flipped) {
      swapCardInstantly(() => setIndex(i => Math.max(0, Math.min(deck.length-1, i+dir))));
    } else {
      setIndex(i => Math.max(0, Math.min(deck.length-1, i+dir)));
    }
  };

  const respond = (type) => {
    if (feedback) return;
    setFeedback(type);
    setTimeout(() => {
      setFeedback(null);
      // Assim que a tela de feedback some, troca direto pro próximo cartão já
      // de frente, sem animação — nada de mostrar a pergunta do cartão
      // anterior nem a resposta do próximo durante a virada.
      swapCardInstantly(() => {
        setResults(r => [...r, { id: card.id, know: type==="know" }]);
        if (index < deck.length-1) { setIndex(i => i+1); }
        else finishDeck();
      });
    }, 700);
  };

  const restartAll = () => { setDeck(shuffleMode ? shuffleArr(cards) : cards); setIndex(0); setResults([]); setFinished(false); setFlipped(false); };
  const restartFailed = () => {
    const failedIds = new Set(results.filter(r => !r.know).map(r => r.id));
    const failedCards = cards.filter(c => failedIds.has(c.id));
    if (failedCards.length === 0) return;
    setDeck(shuffleMode ? shuffleArr(failedCards) : failedCards); setIndex(0); setResults([]); setFinished(false); setFlipped(false);
  };
  // Liga/desliga o embaralhamento no meio da revisão: reordena o baralho atual
  // (mantendo os mesmos cartões, mudando só a ordem) e volta pro início, já
  // que os índices deixam de fazer sentido com a nova ordem.
  const toggleShuffle = (checked) => {
    setShuffleMode(checked);
    setDeck(checked ? shuffleArr(deck) : cards);
    setIndex(0); setFlipped(false); setResults([]); setFinished(false); setFeedback(null);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (finished || shortcutsOpen) return;
      if (["INPUT","TEXTAREA"].includes(e.target.tagName)) return;
      if (e.code === "Space") { e.preventDefault(); if (!feedback) setFlipped(f=>!f); return; }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const isFlipKey = shortcuts.flip.includes(key);
      const isBackKey = shortcuts.back.includes(key);
      const isNextKey = shortcuts.next.includes(key);
      if (trackMode) {
        // Modo com marcação: ←/→ (fixas) e a tecla "next"/"back" já respondem
        // "já sei"/"ainda aprendendo"; ↑/↓ (fixas) e a tecla "flip" só viram o cartão.
        if (e.key === "ArrowRight" || isNextKey) { e.preventDefault(); respond("know"); }
        else if (e.key === "ArrowLeft" || isBackKey) { e.preventDefault(); respond("learning"); }
        else if (e.key === "ArrowUp" || e.key === "ArrowDown" || isFlipKey) { e.preventDefault(); if (!feedback) setFlipped(f=>!f); }
      } else {
        // Modo "só passar": ←/→ (fixas) e a tecla "next"/"back" navegam entre os cartões.
        if (e.key === "ArrowRight" || isNextKey) { e.preventDefault(); go(1); }
        else if (e.key === "ArrowLeft" || isBackKey) { e.preventDefault(); go(-1); }
        else if (e.key === "ArrowUp" || e.key === "ArrowDown" || isFlipKey) { e.preventDefault(); if (!feedback) setFlipped(f=>!f); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, trackMode, feedback, flipped, index, deck.length, shortcuts, shortcutsOpen]);

  const trackToggle = (
    <label className="flashTrackToggle">
      <span>{trackMode ? "Marcar sei / não sei" : "Só passar os cartões"}</span>
      <span className={"switchPill"+(trackMode?" on":"")}>
        <input type="checkbox" checked={trackMode} onChange={e=>setTrackMode(e.target.checked)}/>
        <span className="switchKnob"/>
      </span>
    </label>
  );

  const shuffleToggle = (
    <label className="flashTrackToggle">
      <span>Embaralhar</span>
      <span className={"switchPill"+(shuffleMode?" on":"")}>
        <input type="checkbox" checked={shuffleMode} onChange={e=>toggleShuffle(e.target.checked)}/>
        <span className="switchKnob"/>
      </span>
    </label>
  );

  if (finished) {
    const knowCount = results.filter(r => r.know).length;
    const learningCount = results.filter(r => !r.know).length;
    return (
      <div className="flashStudyArea">
        <div className="flashFlipDone">
          <div className="flashFlipDoneIcon"><Trophy size={32}/></div>
          <h3>Boa! Você revisou os {deck.length} cartão{deck.length===1?"":"s"} 🎉</h3>
          {trackMode && (
            <div className="flashFlipDoneStats">
              <div className="flashFlipDoneStat know"><strong>{knowCount}</strong><span>Já sei</span></div>
              <div className="flashFlipDoneStat learning"><strong>{learningCount}</strong><span>Ainda aprendendo</span></div>
            </div>
          )}
          <div className="flashFlipDoneActions">
            <button className="ghost flashFlipDoneBtn" onClick={restartAll}><RotateCcw size={15}/> Estudar tudo de novo</button>
            {trackMode && learningCount > 0 && (
              <button className="flashFlipRetryBtn" onClick={restartFailed}><Zap size={15}/> Só os que falta aprender ({learningCount})</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const knowSoFar = results.filter(r => r.know).length;
  const learningSoFar = results.filter(r => !r.know).length;
  const atLast = index === deck.length - 1;

  return (
    <div className="flashStudyArea">
      <div className="flashFlipTopBar">
        {trackMode ? (
          <div className="flashFlipLiveStats">
            <span className="flashFlipLiveStat know"><Check size={13}/> {knowSoFar}</span>
            <span className="flashFlipLiveStat learning"><X size={13}/> {learningSoFar}</span>
          </div>
        ) : <span/>}
        <div className="flashFlipToggles">
          <button className="ghost flashShortcutsBtn" title="Atalhos de teclado" onClick={()=>setShortcutsOpen(true)}><Settings size={15}/></button>
          {shuffleToggle}
          {trackToggle}
        </div>
      </div>
      {shortcutsOpen && (
        <FlashcardShortcutsModal
          shortcuts={shortcuts}
          onChange={setShortcuts}
          onClose={()=>setShortcutsOpen(false)}
        />
      )}
      <div className="flashFlipCard" onClick={()=>{ if(!feedback) setFlipped(f=>!f); }}>
        <div className={"flashFlipInner"+(flipped?" flipped":"")+(noFlipAnim?" noFlipAnim":"")}>
          <div className="flashFlipFace flashFlipFront">
            <small>TERMO</small>
            {stripHtml(card.term).trim() && <FlashSpeakBtn text={card.term} lang={termLang}/>}
            <SaverImg src={card.image} className="flashFlipImage" fallback={null}/>
            {stripHtml(card.term).trim() ? <span dangerouslySetInnerHTML={{__html: card.term}}/> : <span>(sem termo)</span>}
          </div>
          <div className="flashFlipFace flashFlipBack">
            <small>DEFINIÇÃO</small>
            {stripHtml(card.definition).trim() && <FlashSpeakBtn text={card.definition} lang={defLang}/>}
            {stripHtml(card.definition).trim() ? <span dangerouslySetInnerHTML={{__html: card.definition}}/> : <span>(sem definição)</span>}
          </div>
        </div>
        {feedback && (
          <div className={"flashFlipFeedback"+(feedback==="know"?" know":" learning")}>
            {feedback==="know" ? "Já sei" : "Ainda aprendendo"}
          </div>
        )}
      </div>
      {trackMode && (
        <div className="flashFlipActions">
          <button className="flashFlipNo" disabled={!!feedback} onClick={()=>respond("learning")}><X size={16}/> Ainda aprendendo</button>
          <button className="flashFlipYes" disabled={!!feedback} onClick={()=>respond("know")}><Check size={16}/> Já sei</button>
        </div>
      )}
      <div className="flashPager">
        {!trackMode && <button disabled={index===0} onClick={()=>go(-1)}><ChevronLeft size={16}/></button>}
        <span>{index+1} / {deck.length}</span>
        {!trackMode && <button onClick={()=>go(1)}>{atLast ? <Check size={16}/> : <ArrowRight size={16}/>}</button>}
      </div>
    </div>
  );
}

// Teclas que não podem ser usadas como atalho (já têm função fixa na tela,
// ou atrapalhariam digitar em outro lugar do app).
const FLASHCARD_SHORTCUT_BLOCKED_KEYS = new Set([" ", "arrowup", "arrowdown", "arrowleft", "arrowright", "escape", "tab", "enter", "shift", "control", "alt", "meta", "capslock"]);

// Modal pra remapear as teclas do modo "Cartões". Cada linha mostra a(s)
// tecla(s) atuais da ação; clicar em "Trocar" entra em modo de escuta e a
// PRÓXIMA tecla pressionada assume aquele lugar (removendo-a de qualquer
// outra ação que já a usasse, pra nunca ter duas ações na mesma tecla).
function FlashcardShortcutsModal({ shortcuts, onChange, onClose }) {
  const [listening, setListening] = useState(null); // null | {action, slot}

  useEffect(() => {
    if (!listening) return;
    const onKey = (e) => {
      e.preventDefault();
      if (e.key === "Escape") { setListening(null); return; }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (FLASHCARD_SHORTCUT_BLOCKED_KEYS.has(key.toLowerCase())) return;
      onChange(prev => {
        const next = { flip: [...prev.flip], back: [...prev.back], next: [...prev.next] };
        // Remove essa tecla de qualquer ação que já a usava.
        for (const act of ["flip", "back", "next"]) {
          next[act] = next[act].map(k => k === key ? "" : k);
        }
        next[listening.action][listening.slot] = key;
        return next;
      });
      setListening(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listening, onChange]);

  const restoreDefaults = () => onChange(DEFAULT_FLASHCARD_SHORTCUTS);

  const row = (action, label, hint) => (
    <div className="flashShortcutRow">
      <div><b>{label}</b><small>{hint}</small></div>
      <div className="flashShortcutKeys">
        {shortcuts[action].map((k, slot) => {
          const isListening = listening?.action === action && listening?.slot === slot;
          return (
            <button
              key={slot}
              className={"flashShortcutKeyBtn" + (isListening ? " listening" : "")}
              onClick={() => setListening({ action, slot })}
            >
              {isListening ? "Pressione uma tecla..." : (k ? k.toUpperCase() : "—")}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="modalBack" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modalHead"><h2>Atalhos de teclado</h2><button type="button" onClick={onClose}><X/></button></div>
        <div className="flashShortcutsBody">
          {row("flip", "Virar cartão", "Mostra o verso / volta pra frente")}
          {row("back", "Voltar", "No modo com marcação: \"Ainda aprendendo\". No modo só passar: cartão anterior")}
          {row("next", "Avançar", "No modo com marcação: \"Já sei\". No modo só passar: próximo cartão")}
          <p className="flashShortcutsHint">As setas do teclado e a barra de espaço continuam funcionando sempre, além dessas teclas.</p>
          <button type="button" className="ghost flashShortcutsRestore" onClick={restoreDefaults}><RotateCcw size={14}/> Restaurar padrão (W/S, A, D)</button>
        </div>
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
        <SaverImg src={card.image} className="flashLearnImage" fallback={null}/>
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
                <SaverImg src={t.image} className="flashMatchImage" fallback={null}/>
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

function Goals({entity, session}){
  const {data,add,remove,update}=entity;
  const [name,setName]=useState(""); const [target,setTarget]=useState(""); const [saved,setSaved]=useState(""); const [shareNew,setShareNew]=useState(false);
  const myId = session?.user?.id;
  const canShare = cloudConfigured && !!session;

  const [partners,setPartners] = useState([]);
  const [inviteModal,setInviteModal] = useState(null); // null | "generate" | "accept"
  const [inviteCode,setInviteCode] = useState("");
  const [acceptCode,setAcceptCode] = useState("");
  const [inviteBusy,setInviteBusy] = useState(false);
  const [inviteError,setInviteError] = useState(null);

  const loadPartners = async ()=>{
    try{ setPartners(await getMyPartners()); }catch(e){ console.error(e); }
  };
  useEffect(()=>{ if(canShare) loadPartners(); }, [canShare, myId]);

  // Se a pessoa abriu um link de convite (?invite=CODIGO), já deixa o código pronto pra aceitar.
  useEffect(()=>{
    if(!canShare) return;
    const code = new URLSearchParams(window.location.search).get("invite");
    if(code){ setAcceptCode(code.toUpperCase()); setInviteModal("accept"); }
  }, [canShare]);

  const partnerEmail = (userId)=> partners.find(p=>p.partner_user_id===userId)?.partner_email;

  const submit=()=>{
    if(!name.trim()||!target)return;
    add({name,target:Number(target),saved:Number(saved)||0, ...(canShare?{shared:shareNew}:{})});
    setName("");setTarget("");setSaved("");setShareNew(false);
  };

  const openGenerate = async ()=>{
    setInviteError(null); setInviteBusy(true); setInviteModal("generate"); setInviteCode("");
    try{ setInviteCode(await createInviteCode()); }
    catch(e){ setInviteError(e.message); }
    finally{ setInviteBusy(false); }
  };

  const submitAccept = async ()=>{
    if(!acceptCode.trim()) return;
    setInviteError(null); setInviteBusy(true);
    try{
      await acceptInviteCode(acceptCode);
      await loadPartners();
      setInviteModal(null); setAcceptCode("");
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      window.history.replaceState({}, "", url.pathname + url.search);
      toast("Conta vinculada! Agora vocês podem criar metas em conjunto.");
    }catch(e){ setInviteError(e.message); }
    finally{ setInviteBusy(false); }
  };

  const inviteLink = inviteCode ? (window.location.origin + window.location.pathname + "?invite=" + inviteCode) : "";

  return <div className="content">
    <div className="panel">
      <div className="panelTitle">
        <h2>Metas financeiras</h2>
        {canShare && <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          <button className="ghost" onClick={()=>{setInviteError(null); setInviteModal("accept");}}>Tenho um código</button>
          <button className="ghost" onClick={openGenerate}>Convidar parceiro(a)</button>
        </div>}
      </div>
      {canShare && partners.length>0 && <p className="emptyHint">Vinculado com: {partners.map(p=>p.partner_email).join(", ")}</p>}
      {!canShare && <p className="emptyHint">Ative a sincronização (Supabase) para criar metas em conjunto com outra conta.</p>}
      <div className="inlineAdd">
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Computador"/>
        <input value={target} onChange={e=>setTarget(e.target.value)} type="number" step="0.01" min="0" placeholder="Valor da meta"/>
        <input value={saved} onChange={e=>setSaved(e.target.value)} type="number" step="0.01" min="0" placeholder="Já guardado"/>
        <button onClick={submit}><Plus/></button>
      </div>
      {canShare && partners.length>0 && <label className="penCheckLabel" style={{marginTop:8}}>
        <input type="checkbox" checked={shareNew} onChange={e=>setShareNew(e.target.checked)}/> Meta em conjunto (visível para {partners.map(p=>p.partner_email).join(", ")})
      </label>}
    </div>
    <div className="goalGrid">
      {data.map(x=>{
        const pct=x.target?Math.min(100,Math.round(x.saved/x.target*100)):0;
        const mine = !canShare || x.user_id===myId;
        const otherEmail = partnerEmail(x.user_id);
        return <div className="goalCard" key={x.id}>
          <div className="panelTitle">
            <h3><Target size={17}/> {x.name}</h3>
            {mine && <button onClick={()=>remove(x.id)}><Trash2 size={15}/></button>}
          </div>
          {x.shared && <small style={{opacity:0.7, display:"block", marginBottom:4}}>
            {mine ? `Em conjunto com ${otherEmail||"parceiro(a)"}` : `Meta de ${otherEmail||"parceiro(a)"} · em conjunto`}
          </small>}
          <strong>{money(x.saved)}</strong><small> de {money(x.target)}</small>
          <div className="progress"><i style={{width:pct+"%"}}/></div>
          <div className="goalActions">
            <span>{pct}% concluído</span>
            <button onClick={()=>{const n=Number(prompt("Quanto adicionar à meta?"));if(n>0)update(x.id,{saved:Math.min(x.target,x.saved+n)})}}>+ Adicionar</button>
          </div>
        </div>;
      })}
      {!data.length&&<p className="emptyHint">Crie uma meta para acompanhar seu progresso.</p>}
    </div>

    {inviteModal==="generate" && <div className="modalBack" onClick={()=>setInviteModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modalHead"><h2>Convidar parceiro(a)</h2><button type="button" onClick={()=>setInviteModal(null)}><X/></button></div>
      <p className="authSub">Envie este código (ou o link) para quem você quer compartilhar metas. A pessoa precisa ter conta no FinLife e usar o botão "Tenho um código". Válido por 7 dias.</p>
      {inviteBusy && <p className="emptyHint">Gerando código...</p>}
      {inviteError && <p className="aiErrorMsg">{inviteError}</p>}
      {inviteCode && <>
        <label>Código<input readOnly value={inviteCode} onFocus={e=>e.target.select()}/></label>
        <label>Link<input readOnly value={inviteLink} onFocus={e=>e.target.select()}/></label>
        <button type="button" className="ghost" onClick={()=>{navigator.clipboard?.writeText(inviteLink); toast("Link copiado!");}}>Copiar link</button>
      </>}
    </div></div>}

    {inviteModal==="accept" && <div className="modalBack" onClick={()=>setInviteModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modalHead"><h2>Aceitar convite</h2><button type="button" onClick={()=>setInviteModal(null)}><X/></button></div>
      <label>Código recebido<input value={acceptCode} onChange={e=>setAcceptCode(e.target.value.toUpperCase())} placeholder="Ex.: 7K9QXZ" autoFocus/></label>
      {inviteError && <p className="aiErrorMsg">{inviteError}</p>}
      <button className="primary" type="button" disabled={inviteBusy} onClick={submitAccept}>{inviteBusy?"Vinculando...":"Vincular contas"}</button>
    </div></div>}
  </div>;
}

// ---------- Gráfico (registro de afazeres) ----------
const ACTIVITY_CHART_PERIODS = [
  { key:"semana", label:"7 dias", days:7 },
  { key:"mes", label:"30 dias", days:30 },
  { key:"ano", label:"365 dias", days:365 },
];
const ACTIVITY_CHART_TYPES = [
  { key:"barras", label:"Barras", icon:BarChart3 },
  { key:"pizza", label:"Pizza", icon:PieChart },
  { key:"rosca", label:"Rosca", icon:Circle },
  { key:"linha", label:"Linha", icon:LineChart },
  { key:"radar", label:"Radar", icon:Radar },
  { key:"area", label:"Área", icon:AreaChart },
  { key:"dispersao", label:"Dispersão", icon:ScatterChart },
  { key:"calor", label:"Mapa de calor", icon:Grid3x3 },
];
// "Afazeres por categoria" mostra contagem por categoria (barras/linha/etc.);
// "Distribuição dos afazeres" mostra proporção (pizza/rosca) — cada painel
// oferece só os tipos de gráfico que fazem sentido pra ele.
const ACTIVITY_COUNT_CHART_TYPES = ACTIVITY_CHART_TYPES.filter(c=>c.key!=="pizza"&&c.key!=="rosca");
const ACTIVITY_SHARE_CHART_TYPES = ACTIVITY_CHART_TYPES.filter(c=>c.key==="pizza"||c.key==="rosca");

// Monta a dica de equilíbrio a partir da contagem de cada afazer no período
// selecionado: prioriza avisar sobre o que ficou zerado, depois sobre o que
// está dominando demais o tempo, depois sobre o que está bem abaixo da média.
function activityTip(counts){
  if(counts.length<2) return {text:"Cadastre mais de um afazer para comparar o quanto você dedica a cada um.", tone:"neutral"};
  const total = counts.reduce((s,c)=>s+c.count,0);
  if(total===0) return {text:"Ainda não há registros nesse período. Marque o que você fez em \"Registrar o dia\".", tone:"neutral"};
  const avg = total/counts.length;
  const sorted = [...counts].sort((a,b)=>a.count-b.count);
  const lowest = sorted[0];
  const highest = sorted[sorted.length-1];
  const zeroed = counts.filter(c=>c.count===0);

  if(zeroed.length===1){
    return {text:`"${zeroed[0].item.name}" está zerado nesse período. Que tal encaixar um pouco nos próximos dias?`, tone:"warn"};
  }
  if(zeroed.length>1){
    return {text:`Esses afazeres ficaram de fora nesse período: ${zeroed.map(c=>c.item.name).join(", ")}. Tente dar uma atenção a eles.`, tone:"warn"};
  }
  if(highest.count >= avg*2 && highest.count>=3){
    return {text:`Você está dando muito foco a "${highest.item.name}". Tente equilibrar mais com as outras atividades.`, tone:"warn"};
  }
  if(lowest.count < avg*0.5){
    return {text:`"${lowest.item.name}" está bem baixo comparado ao resto. Foque mais lá para equilibrar.`, tone:"warn"};
  }
  return {text:"Bom equilíbrio entre suas atividades nesse período! Continue assim.", tone:"good"};
}

function ActivityBarChart({counts}){
  const max = Math.max(1, ...counts.map(c=>c.count));
  const H = 190, padBottom = 32, padTop = 14;
  const colW = 68;
  const W = Math.max(260, counts.length*colW);
  const barW = Math.min(40, colW-22);
  return <div className="actChartScroll">
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="actBarSvg" preserveAspectRatio="xMinYMid meet">
      <line x1="0" y1={H-padBottom} x2={W} y2={H-padBottom} stroke="var(--border)" strokeWidth="1"/>
      {counts.map((c,i)=>{
        const hex = colorHex(c.item.color);
        const barH = c.count===0 ? 0 : Math.max(4, (c.count/max)*(H-padBottom-padTop));
        const x = i*colW + (colW-barW)/2;
        const y = H-padBottom-barH;
        const label = c.item.name.length>9 ? c.item.name.slice(0,8)+"…" : c.item.name;
        return <g key={c.item.id}>
          {c.count>0 && <text x={x+barW/2} y={y-6} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-1)">{c.count}</text>}
          <rect x={x} y={y} width={barW} height={barH} rx="7" fill={hex}/>
          <text x={x+barW/2} y={H-padBottom+15} textAnchor="middle" fontSize="10" fill="var(--text-2)">{label}</text>
        </g>;
      })}
    </svg>
  </div>;
}

function ActivityPieChart({counts, donut}){
  const filled = counts.filter(c=>c.count>0);
  const total = filled.reduce((s,c)=>s+c.count,0);
  let acc = 0;
  const stops = filled.map(c=>{
    const hex = colorHex(c.item.color);
    const start = (acc/total)*360;
    acc += c.count;
    const end = (acc/total)*360;
    return `${hex} ${start}deg ${end}deg`;
  }).join(", ");
  return <div className="actPieWrap">
    <div className="actPieCircle" style={{background:`conic-gradient(${stops})`}}>
      {donut && <div className="actPieHole">
        <span className="actPieTotalNum">{total}</span>
        <span className="actPieTotalLabel">Total</span>
      </div>}
    </div>
    <div className="actLegend">
      {filled.map(c=>{
        const hex = colorHex(c.item.color);
        const pct = Math.round((c.count/total)*100);
        return <div className="actLegendItem" key={c.item.id}>
          <span className="actLegendDot" style={{background:hex}}/>
          <span className="actLegendName">{c.item.name}</span>
          <span className="actLegendVal">{c.count}x · {pct}%</span>
        </div>;
      })}
    </div>
  </div>;
}

function ActivityLineChart({counts}){
  const max = Math.max(1, ...counts.map(c=>c.count));
  const H = 190, padBottom = 32, padTop = 22;
  const colW = 68;
  const W = Math.max(260, counts.length*colW);
  const usableH = H-padBottom-padTop;
  const pts = counts.map((c,i)=>({
    x: i*colW + colW/2,
    y: H-padBottom-(c.count/max)*usableH,
    c,
  }));
  const path = pts.map((p,i)=>(i===0?"M":"L")+p.x+","+p.y).join(" ");
  return <div className="actChartScroll">
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="actBarSvg" preserveAspectRatio="xMinYMid meet">
      <line x1="0" y1={H-padBottom} x2={W} y2={H-padBottom} stroke="var(--border)" strokeWidth="1"/>
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
      {pts.map(p=>{
        const hex = colorHex(p.c.item.color);
        const label = p.c.item.name.length>9 ? p.c.item.name.slice(0,8)+"…" : p.c.item.name;
        return <g key={p.c.item.id}>
          {p.c.count>0 && <text x={p.x} y={p.y-10} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-1)">{p.c.count}</text>}
          <circle cx={p.x} cy={p.y} r="5" fill={hex} stroke="var(--bg-surface)" strokeWidth="2"/>
          <text x={p.x} y={H-padBottom+15} textAnchor="middle" fontSize="10" fill="var(--text-2)">{label}</text>
        </g>;
      })}
    </svg>
  </div>;
}

function ActivityAreaChart({counts}){
  const max = Math.max(1, ...counts.map(c=>c.count));
  const H = 190, padBottom = 32, padTop = 22;
  const colW = 68;
  const W = Math.max(260, counts.length*colW);
  const usableH = H-padBottom-padTop;
  const baseY = H-padBottom;
  const pts = counts.map((c,i)=>({
    x: i*colW + colW/2,
    y: baseY-(c.count/max)*usableH,
    c,
  }));
  const linePath = pts.map((p,i)=>(i===0?"M":"L")+p.x+","+p.y).join(" ");
  const areaPath = pts.length ? `M${pts[0].x},${baseY} ` + pts.map(p=>`L${p.x},${p.y}`).join(" ") + ` L${pts[pts.length-1].x},${baseY} Z` : "";
  return <div className="actChartScroll">
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="actBarSvg" preserveAspectRatio="xMinYMid meet">
      <defs>
        <linearGradient id="actAreaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.45"/>
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.04"/>
        </linearGradient>
      </defs>
      <line x1="0" y1={baseY} x2={W} y2={baseY} stroke="var(--border)" strokeWidth="1"/>
      <path d={areaPath} fill="url(#actAreaFill)" stroke="none"/>
      <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
      {pts.map(p=>{
        const hex = colorHex(p.c.item.color);
        const label = p.c.item.name.length>9 ? p.c.item.name.slice(0,8)+"…" : p.c.item.name;
        return <g key={p.c.item.id}>
          {p.c.count>0 && <text x={p.x} y={p.y-10} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-1)">{p.c.count}</text>}
          <circle cx={p.x} cy={p.y} r="5" fill={hex} stroke="var(--bg-surface)" strokeWidth="2"/>
          <text x={p.x} y={H-padBottom+15} textAnchor="middle" fontSize="10" fill="var(--text-2)">{label}</text>
        </g>;
      })}
    </svg>
  </div>;
}

function ActivityScatterChart({counts}){
  const max = Math.max(1, ...counts.map(c=>c.count));
  const H = 190, padBottom = 32, padTop = 22;
  const colW = 68;
  const W = Math.max(260, counts.length*colW);
  const usableH = H-padBottom-padTop;
  return <div className="actChartScroll">
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="actBarSvg" preserveAspectRatio="xMinYMid meet">
      <line x1="0" y1={H-padBottom} x2={W} y2={H-padBottom} stroke="var(--border)" strokeWidth="1"/>
      {counts.map((c,i)=>{
        const hex = colorHex(c.item.color);
        const x = i*colW + colW/2;
        const y = H-padBottom-(c.count/max)*usableH;
        const r = c.count===0 ? 5 : Math.min(16, 6+(c.count/max)*10);
        const label = c.item.name.length>9 ? c.item.name.slice(0,8)+"…" : c.item.name;
        return <g key={c.item.id}>
          {c.count>0 && <text x={x} y={y-r-6} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-1)">{c.count}</text>}
          <circle cx={x} cy={y} r={r} fill={hex} fillOpacity="0.7" stroke={hex} strokeWidth="1.5"/>
          <text x={x} y={H-padBottom+15} textAnchor="middle" fontSize="10" fill="var(--text-2)">{label}</text>
        </g>;
      })}
    </svg>
  </div>;
}

function ActivityRadarChart({counts}){
  const n = counts.length;
  if(n<3){
    return <ActivityBarChart counts={counts}/>;
  }
  const max = Math.max(1, ...counts.map(c=>c.count));
  const size = 260, cx = size/2, cy = size/2, radius = 92, rings = 4;
  const angleFor = i => (Math.PI*2*i/n) - Math.PI/2;
  const pointFor = (i, frac) => {
    const a = angleFor(i);
    return [cx+Math.cos(a)*radius*frac, cy+Math.sin(a)*radius*frac];
  };
  const ringPolys = Array.from({length:rings}, (_,ri)=>{
    const frac = (ri+1)/rings;
    return Array.from({length:n}, (_,i)=>pointFor(i,frac).join(",")).join(" ");
  });
  const valuePoly = counts.map((c,i)=>pointFor(i, c.count/max).join(",")).join(" ");
  return <div className="actChartScroll">
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="actBarSvg" preserveAspectRatio="xMidYMid meet">
      {ringPolys.map((pts,ri)=><polygon key={ri} points={pts} fill="none" stroke="var(--border)" strokeWidth="1"/>)}
      {counts.map((c,i)=>{
        const [x,y] = pointFor(i,1);
        return <line key={c.item.id} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="1"/>;
      })}
      <polygon points={valuePoly} fill="var(--accent)" fillOpacity="0.35" stroke="var(--accent)" strokeWidth="2"/>
      {counts.map((c,i)=>{
        const hex = colorHex(c.item.color);
        const [x,y] = pointFor(i, c.count/max);
        const [lx,ly] = pointFor(i, 1.2);
        const label = c.item.name.length>10 ? c.item.name.slice(0,9)+"…" : c.item.name;
        const anchor = Math.abs(Math.cos(angleFor(i)))<0.3 ? "middle" : (Math.cos(angleFor(i))>0 ? "start" : "end");
        return <g key={c.item.id}>
          <circle cx={x} cy={y} r="4.5" fill={hex} stroke="var(--bg-surface)" strokeWidth="1.5"/>
          <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" fontSize="10.5" fill="var(--text-2)">{label}</text>
        </g>;
      })}
    </svg>
  </div>;
}

function ActivityHeatmapChart({items, logs, effectiveToday, windowDays}){
  const cell = 13, gap = 3, labelW = 92;
  const dates = Array.from({length:windowDays}, (_,i)=>isoAddDays(effectiveToday, -(windowDays-1-i)));
  const doneSet = new Set(logs.map(l=>l.item_id+"|"+l.date));
  const showEveryLabel = windowDays<=31;
  return <div className="actChartScroll">
    <div className="actHeatWrap" style={{minWidth: labelW+dates.length*(cell+gap)+20}}>
      {items.map(it=>{
        const hex = colorHex(it.color);
        return <div className="actHeatRow" key={it.id}>
          <span className="actHeatRowLabel" style={{width:labelW}}>{it.name}</span>
          <div className="actHeatCells">
            {dates.map(d=>{
              const on = doneSet.has(it.id+"|"+d);
              return <span key={d} className="actHeatCell" title={d+(on?` · ${it.name}`:"")}
                style={{width:cell, height:cell, background:on?hex:"var(--bg-surface-3)", opacity:on?1:0.6}}/>;
            })}
          </div>
        </div>;
      })}
      <div className="actHeatRow actHeatAxis">
        <span className="actHeatRowLabel" style={{width:labelW}}/>
        <div className="actHeatCells">
          {dates.map((d,i)=>{
            const show = showEveryLabel ? true : (i%Math.ceil(dates.length/12)===0);
            const dt = new Date(d+"T00:00:00");
            return <span key={d} className="actHeatDateLabel" style={{width:cell}}>{show ? pad2(dt.getDate())+"/"+pad2(dt.getMonth()+1) : ""}</span>;
          })}
        </div>
      </div>
    </div>
  </div>;
}

// Data "efetiva" de hoje pro Gráfico: se a pessoa costuma estudar/dormir
// depois da meia-noite, os registros feitos até dayEndHour ainda contam
// como o dia anterior (configurável em "Configurações do gráfico").
function activityEffectiveTodayISO(dayEndHour){
  const now = new Date();
  if(dayEndHour>0 && now.getHours()<dayEndHour) now.setDate(now.getDate()-1);
  return now.getFullYear()+"-"+pad2(now.getMonth()+1)+"-"+pad2(now.getDate());
}
const ACTIVITY_DAY_END_OPTIONS = [0,1,2,3,4,5,6];

// A partir de um timestamp ISO completo (ex.: completed_at), devolve só a
// data local (yyyy-mm-dd) — usado pra saber em qual dia um afazer concluído
// entra (respeitando o fuso do aparelho) e pra filtrar "concluídos hoje".
function isoDateFromTimestamp(ts){
  const d = new Date(ts);
  return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());
}
// Formata só o horário (HH:MM) de um timestamp — mostrado ao lado de cada
// afazer no painel "Concluídos hoje".
function timeFromTimestamp(ts){
  const d = new Date(ts);
  return pad2(d.getHours())+":"+pad2(d.getMinutes());
}

function ActivityChartPage({itemsEntity, logsEntity, todosEntity}){
  const {data:items, add:addItem, remove:removeItem} = itemsEntity;
  const {data:todos, add:addTodo, remove:removeTodo, update:updateTodo} = todosEntity;
  const [dayEndHour,setDayEndHour] = usePersistentState("libano-activity-day-end-hour", 0);
  const [showDaySettings,setShowDaySettings] = useState(false);
  const effectiveToday = activityEffectiveTodayISO(dayEndHour);

  const [taskText,setTaskText] = useState("");
  const [taskCat,setTaskCat] = useState("");
  const [showCatInput,setShowCatInput] = useState(false);
  const [newCatName,setNewCatName] = useState("");
  const [todoTab,setTodoTab] = useState("pendentes");
  const [period,setPeriod] = useState("semana");
  const [countChartType,setCountChartType] = useState("barras");
  const [shareChartType,setShareChartType] = useState("rosca");

  // Mantém a categoria escolhida pro novo afazer sempre válida (primeira
  // categoria cadastrada, por padrão; vazio se ainda não há nenhuma).
  useEffect(()=>{
    if(items.length===0){ if(taskCat) setTaskCat(""); return; }
    if(!items.some(it=>it.id===taskCat)) setTaskCat(items[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const addCategory = ()=>{
    const name = newCatName.trim();
    if(!name) return;
    if(items.some(it=>it.name.toLowerCase()===name.toLowerCase())){ alert("Você já tem uma categoria com esse nome."); return; }
    const color = STUDY_COLORS[items.length % STUDY_COLORS.length].key;
    addItem({name, color});
    setNewCatName("");
    setShowCatInput(false);
  };

  const confirmRemoveCategory = (it)=>{
    if(!confirm(`Excluir a categoria "${it.name}"? Os afazeres dela também serão apagados.`)) return;
    todos.filter(t=>t.item_id===it.id).forEach(t=>removeTodo(t.id));
    removeItem(it.id);
  };

  const addTodoTask = ()=>{
    const text = taskText.trim();
    if(!text) return;
    if(!taskCat){ alert("Cadastre uma categoria antes de adicionar um afazer."); return; }
    addTodo({item_id:taskCat, text, done:false, completed_at:null});
    setTaskText("");
  };

  const toggleTodo = (t)=>{
    if(t.done) updateTodo(t.id, {done:false, completed_at:null});
    else updateTodo(t.id, {done:true, completed_at:new Date().toISOString()});
  };

  const confirmRemoveTodo = (t)=>{
    if(!confirm(`Excluir "${t.text}"?`)) return;
    removeTodo(t.id);
  };

  const pendingTodos = todos.filter(t=>!t.done);
  const doneTodosAll = todos.filter(t=>t.done).slice()
    .sort((a,b)=> new Date(b.completed_at||b.created_at) - new Date(a.completed_at||a.created_at));
  const doneTodayTodos = doneTodosAll.filter(t=>t.completed_at && isoDateFromTimestamp(t.completed_at)===effectiveToday);

  const clearCompletedToday = ()=>{
    if(doneTodayTodos.length===0) return;
    if(!confirm("Limpar os afazeres concluídos hoje da lista? Essa ação não pode ser desfeita.")) return;
    doneTodayTodos.forEach(t=>removeTodo(t.id));
  };

  const windowDays = ACTIVITY_CHART_PERIODS.find(p=>p.key===period).days;
  const inWindow = (dateStr)=>{
    const diff = daysBetweenISO(dateStr, effectiveToday);
    return diff>=0 && diff<windowDays;
  };
  const completionsInWindow = doneTodosAll.filter(t=>t.completed_at && inWindow(isoDateFromTimestamp(t.completed_at)));
  const counts = items.map(it=>({
    item: it,
    count: completionsInWindow.filter(t=>t.item_id===it.id).length,
  }));
  const total = counts.reduce((s,c)=>s+c.count,0);
  const tip = activityTip(counts);
  const rangeStart = isoAddDays(effectiveToday, -(windowDays-1));

  const catBadge = (itemId)=>{
    const cat = items.find(it=>it.id===itemId);
    if(!cat) return null;
    const hex = colorHex(cat.color);
    return <span className="actCatBadge" style={{color:hex, background:hex+"18"}}><span className="actCatDot" style={{background:hex}}/>{cat.name}</span>;
  };

  return <div className="content">
    <div className="flashHead">
      <div className="flashHeadInfo">
        <div>
          <h2 style={{fontSize:20, margin:"0 0 4px"}}>Gráficos</h2>
          <p style={{margin:0}}>Acompanhe seu desempenho e organização de forma visual.</p>
        </div>
      </div>
      <div className="flashHeadActions">
        <span className="actRangeBadge"><CalendarDays size={14}/> {formatTxDate(rangeStart)} - {formatTxDate(effectiveToday)}</span>
        <button type="button" className="actIconBtn" title="Configurações do gráfico" onClick={()=>setShowDaySettings(true)}><Settings size={16}/></button>
      </div>
    </div>

    <div className="grid2">
      <div>
        <div className="panel">
          <div className="panelTitle"><h2>Adicionar novo afazer</h2></div>
          <div className="inlineAdd">
            <input value={taskText} onChange={e=>setTaskText(e.target.value)} placeholder="Ex.: Estudar matemática por 1 hora" onKeyDown={e=>{if(e.key==="Enter") addTodoTask();}}/>
            <select value={taskCat} onChange={e=>setTaskCat(e.target.value)} disabled={items.length===0}>
              {items.length===0 && <option value="">Sem categorias</option>}
              {items.map(it=><option key={it.id} value={it.id}>{it.name}</option>)}
            </select>
            <button onClick={addTodoTask} disabled={items.length===0}><Plus/></button>
          </div>
          <div className="actChipRow">
            {items.map(it=>{
              const hex = colorHex(it.color);
              const selected = it.id===taskCat;
              return <span className="actChip" key={it.id} onClick={()=>setTaskCat(it.id)}
                style={{borderColor:selected?hex:hex+"55", color:hex, background:hex+(selected?"2c":"18")}}>
                {it.name}
                <button onClick={(e)=>{e.stopPropagation(); confirmRemoveCategory(it);}} title="Excluir categoria"><X size={12}/></button>
              </span>;
            })}
            {!showCatInput && <span className="actChip actChipAdd" onClick={()=>setShowCatInput(true)} title="Nova categoria"><Plus size={13}/></span>}
            {showCatInput && <span className="actChip actChipInput">
              <input autoFocus value={newCatName} onChange={e=>setNewCatName(e.target.value)} placeholder="Nova categoria"
                onKeyDown={e=>{ if(e.key==="Enter") addCategory(); if(e.key==="Escape"){ setShowCatInput(false); setNewCatName(""); } }}/>
              <button onClick={addCategory} title="Salvar"><Check size={12}/></button>
              <button onClick={()=>{setShowCatInput(false); setNewCatName("");}} title="Cancelar"><X size={12}/></button>
            </span>}
            {items.length===0 && !showCatInput && <p className="emptyHint">Nenhuma categoria cadastrada ainda.</p>}
          </div>
        </div>

        <div className="panel">
          <div className="panelTitle"><h2>Meus afazeres</h2></div>
          <div className="actTabs" style={{marginBottom:14}}>
            <button type="button" className={todoTab==="pendentes"?"active":""} onClick={()=>setTodoTab("pendentes")}>Pendentes</button>
            <button type="button" className={todoTab==="concluidos"?"active":""} onClick={()=>setTodoTab("concluidos")}>Concluídos</button>
          </div>

          {todoTab==="pendentes" ? (
            pendingTodos.length===0
              ? <p className="emptyHint">Nenhum afazer pendente. Adicione um acima.</p>
              : <div className="actTodoList">
                  {pendingTodos.map(t=><div className="actTodoRow" key={t.id}>
                    <button type="button" className="actTodoCheck" onClick={()=>toggleTodo(t)} title="Marcar como concluído"><Circle size={18}/></button>
                    <span className="actTodoText">{t.text}</span>
                    {catBadge(t.item_id)}
                    <button type="button" className="actTodoDelete" onClick={()=>confirmRemoveTodo(t)} title="Excluir"><Trash2 size={15}/></button>
                  </div>)}
                </div>
          ) : (
            doneTodosAll.length===0
              ? <p className="emptyHint">Nenhum afazer concluído ainda.</p>
              : <div className="actTodoList">
                  {doneTodosAll.map(t=>{
                    const cat = items.find(it=>it.id===t.item_id);
                    const hex = cat?colorHex(cat.color):"var(--text-3)";
                    return <div className="actTodoRow done" key={t.id}>
                      <button type="button" className="actTodoCheck on" style={{color:hex}} onClick={()=>toggleTodo(t)} title="Marcar como pendente"><CheckCircle2 size={18}/></button>
                      <span className="actTodoText strike">{t.text}</span>
                      {catBadge(t.item_id)}
                      <button type="button" className="actTodoDelete" onClick={()=>confirmRemoveTodo(t)} title="Excluir"><Trash2 size={15}/></button>
                    </div>;
                  })}
                </div>
          )}
          {todoTab==="pendentes" && pendingTodos.length>0 && <p className="actTodoCount">{pendingTodos.length} {pendingTodos.length===1?"afazer pendente":"afazeres pendentes"}</p>}
        </div>

        {doneTodayTodos.length>0 && <div className="panel actDonePanel">
          <div className="panelTitle"><h2>Concluídos hoje</h2></div>
          <div className="actTodoList">
            {doneTodayTodos.map(t=><div className="actTodoRow done" key={t.id}>
              <span className="actDoneCheck"><CheckCircle2 size={17}/></span>
              <span className="actTodoText strike">{t.text}</span>
              {catBadge(t.item_id)}
              <span className="actDoneTime">{timeFromTimestamp(t.completed_at)}</span>
            </div>)}
          </div>
          <div className="actDoneFooter">
            <span>{doneTodayTodos.length} {doneTodayTodos.length===1?"afazer concluído":"afazeres concluídos"}</span>
            <button type="button" className="ghost" onClick={clearCompletedToday}>Limpar concluídos</button>
          </div>
        </div>}

        <div className={"actMotivate "+(doneTodayTodos.length>0?"good":"neutral")}>
          <Trophy size={16}/>
          <span>{doneTodayTodos.length>0 ? "Continue assim! Consistência é o que te leva longe." : "Cada afazer concluído é um passo a mais. Bora começar?"}</span>
        </div>
      </div>

      <div>
        <div className="panel actChartCard">
          <div className="panelTitle">
            <h2>Afazeres por categoria</h2>
            <select className="actChartSelect" value={countChartType} onChange={e=>setCountChartType(e.target.value)}>
              {ACTIVITY_COUNT_CHART_TYPES.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div className="actTabs actPeriodTabs">
            {ACTIVITY_CHART_PERIODS.map(p=><button key={p.key} type="button" className={period===p.key?"active":""} onClick={()=>setPeriod(p.key)}>{p.label}</button>)}
          </div>
          {items.length===0
            ? <p className="emptyHint">Cadastre uma categoria para ver o gráfico.</p>
            : total===0
            ? <p className="emptyHint">Nenhum afazer concluído nesse período ainda.</p>
            : (countChartType==="barras" ? <ActivityBarChart counts={counts}/>
              : countChartType==="linha" ? <ActivityLineChart counts={counts}/>
              : countChartType==="area" ? <ActivityAreaChart counts={counts}/>
              : countChartType==="dispersao" ? <ActivityScatterChart counts={counts}/>
              : countChartType==="radar" ? <ActivityRadarChart counts={counts}/>
              : countChartType==="calor" ? <ActivityHeatmapChart items={items} logs={completionsInWindow.map(t=>({item_id:t.item_id, date:isoDateFromTimestamp(t.completed_at)}))} effectiveToday={effectiveToday} windowDays={windowDays}/>
              : null)}
        </div>

        <div className="panel actChartCard">
          <div className="panelTitle">
            <h2>Distribuição dos afazeres</h2>
            <select className="actChartSelect" value={shareChartType} onChange={e=>setShareChartType(e.target.value)}>
              {ACTIVITY_SHARE_CHART_TYPES.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          {total===0
            ? <p className="emptyHint">Nenhum afazer concluído nesse período ainda.</p>
            : <ActivityPieChart counts={counts} donut={shareChartType==="rosca"}/>}
        </div>

        {total>0 && <div className={"actTip "+tip.tone}><Lightbulb size={16}/><span>{tip.text}</span></div>}
      </div>
    </div>

    {showDaySettings && <div className="modalBack" onClick={()=>setShowDaySettings(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modalHead"><h2>Configurações do gráfico</h2><button type="button" onClick={()=>setShowDaySettings(false)}><X/></button></div>
      <label>Considerar o dia até
        <select value={dayEndHour} onChange={e=>setDayEndHour(Number(e.target.value))}>
          {ACTIVITY_DAY_END_OPTIONS.map(h=><option key={h} value={h}>{h===0 ? "Meia-noite (padrão)" : pad2(h)+":00"}</option>)}
        </select>
      </label>
      <p className="emptyHint">Se você estuda ou dorme depois da meia-noite, os afazeres concluídos até esse horário ainda contam como o dia anterior — assim uma virada de página às 2h da manhã não some do dia certo.</p>
      <button className="primary" type="button" onClick={()=>setShowDaySettings(false)}>Concluído</button>
    </div></div>}
  </div>;
}

// Data de hoje em ISO (yyyy-mm-dd), mesmo formato usado por due_date/start_date.
function todayISO(){
  const d = new Date();
  return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());
}
// Soma (ou subtrai, com delta negativo) dias a uma data ISO (yyyy-mm-dd).
function isoAddDays(iso, delta){
  const d = new Date(iso+"T00:00:00");
  d.setDate(d.getDate()+delta);
  return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());
}
// Quantos dias inteiros existem entre duas datas ISO (yyyy-mm-dd).
function daysBetweenISO(fromISO, toISO){
  const a = new Date(fromISO+"T00:00:00"), b = new Date(toISO+"T00:00:00");
  if(Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b-a)/86400000);
}
// Progresso de uma meta "por dias": conta automaticamente 1 dia a cada dia corrido
// desde a data de início, até bater a meta. Se ainda não chegou a data de início,
// fica em 0 (Agendada). Se a meta foi marcada como Falha, o contador congela no
// dia em que a falha foi registrada (failed_at).
function studyGoalDaysProgress(g){
  const target = Number(g.target_value)||0;
  const start = g.start_date || todayISO();
  const today = todayISO();
  if(start > today) return {current:0, target, scheduled:true};
  const limit = (g.status==="falhou" && g.failed_at) ? g.failed_at : today;
  const current = Math.max(0, Math.min(target, daysBetweenISO(start, limit) + 1));
  return {current, target, scheduled:false};
}
function studyGoalPct(g){
  if(g.mode==="dias"){
    const {current, target} = studyGoalDaysProgress(g);
    return target ? Math.min(100, Math.round(current/target*100)) : 0;
  }
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
  if(g.status==="falhou") return {label:"Falhou", color:"#ff5c5c"};
  if(g.status==="concluida") return {label:"Concluída", color:"#3ecf6a"};
  if(g.status==="pausada") return {label:"Pausada", color:"#8d95a4"};
  if(g.start_date && g.start_date > todayISO()) return {label:"Agendada", color:"#3ea0ff"};
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
  const [draft,setDraft] = usePersistentState("nivelamento_rascunho",null); // sessão em andamento não concluída
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

  // Salva o progresso do nivelamento em andamento a cada resposta/segundo, para
  // poder ser retomado caso a página seja recarregada ou fechada antes de terminar.
  useEffect(()=>{
    if(phase==="running"){
      setDraft({pattern, history, seconds});
    }
  },[phase, history, seconds, pattern]);

  const resumeDraft = ()=>{
    if(!draft) return;
    setPattern(draft.pattern);
    setHistory(draft.history||[]);
    setSeconds(draft.seconds||0);
    setPaused(false);
    setLastResult(null);
    setPhase("running");
  };
  const discardDraft = ()=>{ setDraft(null); };

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
    setDraft(null);
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
  const clearHistory = ()=>{
    if(!confirm("Apagar todo o histórico de nivelamento? Essa ação não pode ser desfeita.")) return;
    setSessions([]);
  };
  const exitRunning = ()=>{
    if(confirm("Sair do nivelamento em andamento? Seu progresso fica salvo e você pode retomar depois.")){
      clearInterval(timerRef.current);
      setPhase("config");
    }
  };

  const windowSlice = parsed ? history.slice(-parsed.win) : [];
  const inWindowCorrect = windowSlice.filter(Boolean).length;
  const progressPct = parsed && parsed.need>0 ? Math.min(100, Math.round((inWindowCorrect/parsed.need)*100)) : 0;

  const dotsStartIdx = parsed ? Math.max(0, history.length-parsed.win) : 0;
  const visibleDots = parsed ? history.slice(dotsStartIdx) : history;

  return <div className="content levelWrap">
    <div className="studyGoalsHead">
      <div><h2>Nivelamento</h2><p>Treine questões e descubra se você já está nivelado no padrão desejado.</p></div>
    </div>

    {phase==="config" && <>
      {draft && draft.history && draft.history.length>0 && <div className="levelConfigCard levelDraftCard">
        <div className="levelConfigIcon"><RotateCcw size={22}/></div>
        <h3>Nivelamento não concluído</h3>
        <p className="levelConfigHint">Padrão {draft.pattern} · {draft.history.length} questão(ões) respondida(s) · {levelFmtTime(draft.seconds||0)}</p>
        <div className="levelDraftBtns">
          <button className="add levelStartBtn" onClick={resumeDraft}><Play size={16}/> Continuar de onde parei</button>
          <button className="ghost" onClick={discardDraft}><Trash2 size={14}/> Descartar</button>
        </div>
      </div>}

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
        <div className="levelHistoryHead">
          <h3>Histórico</h3>
          <button className="ghost levelClearHistoryBtn" onClick={clearHistory}><Trash2 size={14}/> Limpar histórico</button>
        </div>
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
            {visibleDots.map((c,i)=><div key={dotsStartIdx+i} className={"levelDot "+(c?"correct":"wrong")}>{dotsStartIdx+i+1}</div>)}
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
        {visibleDots.map((c,i)=><div key={dotsStartIdx+i} className={"levelDot "+(c?"correct":"wrong")}>{dotsStartIdx+i+1}</div>)}
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

function StudyGoals({entity, studyPdfsList=[], booksList=[], flashcardListsList=[], session}){
  const {data,add,remove,update} = entity;
  const [filter,setFilter] = useState("todas");
  const [openMenuId,setOpenMenuId] = useState(null);
  const [modal,setModal] = useState(null); // null | "new" | goal being edited

  const myId = session?.user?.id;
  const canShare = cloudConfigured && !!session;

  const [partners,setPartners] = useState([]);
  const [inviteModal,setInviteModal] = useState(null); // null | "generate" | "accept"
  const [inviteCode,setInviteCode] = useState("");
  const [acceptCode,setAcceptCode] = useState("");
  const [inviteBusy,setInviteBusy] = useState(false);
  const [inviteError,setInviteError] = useState(null);

  const loadPartners = async ()=>{
    try{ setPartners(await getMyPartners()); }catch(e){ console.error(e); }
  };
  useEffect(()=>{ if(canShare) loadPartners(); }, [canShare, myId]);

  // Se a pessoa abriu um link de convite (?invite=CODIGO), já deixa o código pronto pra aceitar.
  useEffect(()=>{
    if(!canShare) return;
    const code = new URLSearchParams(window.location.search).get("invite");
    if(code){ setAcceptCode(code.toUpperCase()); setInviteModal("accept"); }
  }, [canShare]);

  const partnerEmail = (userId)=> partners.find(p=>p.partner_user_id===userId)?.partner_email;

  const openGenerate = async ()=>{
    setInviteError(null); setInviteBusy(true); setInviteModal("generate"); setInviteCode("");
    try{ setInviteCode(await createInviteCode()); }
    catch(e){ setInviteError(e.message); }
    finally{ setInviteBusy(false); }
  };

  const submitAccept = async ()=>{
    if(!acceptCode.trim()) return;
    setInviteError(null); setInviteBusy(true);
    try{
      await acceptInviteCode(acceptCode);
      await loadPartners();
      setInviteModal(null); setAcceptCode("");
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      window.history.replaceState({}, "", url.pathname + url.search);
      toast("Conta vinculada! Agora vocês podem criar metas de estudo em conjunto.");
    }catch(e){ setInviteError(e.message); }
    finally{ setInviteBusy(false); }
  };

  const inviteLink = inviteCode ? (window.location.origin + window.location.pathname + "?invite=" + inviteCode) : "";

  // Metas "por dias" completam sozinhas assim que o contador (dias corridos desde
  // o início, sem contar os dias congelados por uma Falha) bate a meta.
  useEffect(()=>{
    data.forEach(g=>{
      const mine = !canShare || g.user_id===myId;
      if(mine && g.mode==="dias" && g.status==="andamento"){
        const {current,target} = studyGoalDaysProgress(g);
        if(target>0 && current>=target) update(g.id,{status:"concluida"});
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[data]);

  const total = data.length;
  const emAndamento = data.filter(g=>g.status==="andamento").length;
  const concluidas = data.filter(g=>g.status==="concluida").length;
  const pausadas = data.filter(g=>g.status==="pausada").length;
  const filtered = filter==="todas" ? data : data.filter(g=>g.status===filter);

  const confirmRemove = (id)=>{ if(confirm("Excluir esta meta?")){ setOpenMenuId(null); remove(id); } };

  return <div className="content">
    <div className="studyGoalsHead">
      <div><h2>Metas</h2><p>Acompanhe suas metas e conquistas.</p></div>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        {canShare && <button className="ghost" onClick={()=>{setInviteError(null); setInviteModal("accept");}}>Tenho um código</button>}
        {canShare && <button className="ghost" onClick={openGenerate}>Convidar parceiro(a)</button>}
        <button className="add" onClick={()=>setModal("new")}><Plus size={17}/> Nova meta</button>
      </div>
    </div>

    {canShare && partners.length>0 && <p className="emptyHint">Vinculado com: {partners.map(p=>p.partner_email).join(", ")}</p>}
    {!canShare && <p className="emptyHint">Ative a sincronização (Supabase) para criar metas de estudo em conjunto com outra conta.</p>}

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
        <option value="falhou">Falhadas</option>
      </select></div>
    </div>

    <div className="studyGoalList" onClick={()=>setOpenMenuId(null)}>
      {filtered.map(g=>{
        const pct = studyGoalPct(g);
        const hex = colorHex(g.color);
        const Icon = STUDY_ICONS[g.icon] || Target;
        const badge = studyGoalBadge(g);
        const daysInfo = g.mode==="dias" ? studyGoalDaysProgress(g) : null;
        const mine = !canShare || g.user_id===myId;
        const otherEmail = partnerEmail(g.user_id);
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
                  {g.mode==="dias"
                    ? (daysInfo.scheduled
                        ? <><CalendarPlus size={13}/> Começa em {studyGoalFmtDate(g.start_date)}</>
                        : <><Flame size={13}/> Dia {daysInfo.current} de {daysInfo.target}{g.status==="falhou" ? " · congelado na falha" : ""}</>)
                    : g.mode==="count"
                      ? <><ClipboardList size={13}/> Progresso: {g.current_value||0} / {g.target_value||0} {g.unit||""}</>
                      : (g.start_date && g.start_date>todayISO()
                          ? <><CalendarPlus size={13}/> Começa em {studyGoalFmtDate(g.start_date)}</>
                          : (g.due_date ? <><CalendarClock size={13}/> Conclusão: {studyGoalFmtDate(g.due_date)}</> : ""))}
                </span>
                {g.link_source && g.link_source!=="none" && (
                  <span className="studyGoalFootInfo studyGoalFootLink">
                    {g.link_source==="flashcards"
                      ? <><Layers size={13}/> Vinculada aos flashcards · {(g.link_list_ids||[]).length} lista(s) (atualiza sozinha)</>
                      : <><FileText size={13}/> Vinculada ao {g.link_source==="livro"?"livro":"PDF de estudo"}
                          {g.link_page_start ? ` · pág. ${g.link_page_start}–${g.link_page_end}` : ""} (atualiza sozinha)</>}
                  </span>
                )}
                {g.shared && <span className="studyGoalFootInfo studyGoalFootLink">
                  <Users size={13}/> {mine ? `Em conjunto com ${otherEmail||"parceiro(a)"}` : `Meta de ${otherEmail||"parceiro(a)"} · em conjunto`}
                </span>}
              </div>
              <span className="studyGoalBadge" style={{color:badge.color, borderColor:badge.color}}>{badge.label}</span>
            </div>
          </div>
          {openMenuId===g.id && <div className="studyGoalMenuPop" onClick={e=>e.stopPropagation()}>
            <button onClick={()=>{setOpenMenuId(null); setModal(g);}}><Pencil size={13}/> Editar</button>
            {g.status!=="concluida" && <button onClick={()=>{setOpenMenuId(null); update(g.id,{status:"concluida"});}}><CheckCircle2 size={13}/> Marcar como concluída</button>}
            {g.status==="andamento" && <button onClick={()=>{setOpenMenuId(null); update(g.id,{status:"pausada"});}}><Hourglass size={13}/> Pausar</button>}
            {g.status!=="falhou" && <button onClick={()=>{setOpenMenuId(null); update(g.id,{status:"falhou", failed_at:todayISO()});}}><XCircle size={13}/> Marcar como falha</button>}
            {(g.status==="pausada"||g.status==="concluida"||g.status==="falhou") && <button onClick={()=>{setOpenMenuId(null); update(g.id,{status:"andamento", failed_at:null});}}><RotateCcw size={13}/> Reativar</button>}
            {mine && <button className="danger" onClick={()=>confirmRemove(g.id)}><Trash2 size={13}/> Excluir</button>}
          </div>}
        </div>;
      })}
      {filtered.length===0 && <p className="emptyHint">{data.length===0 ? "Crie sua primeira meta de estudo." : "Nenhuma meta nesse filtro."}</p>}
    </div>

    {modal && <StudyGoalModal goal={modal==="new"?null:modal} studyPdfsList={studyPdfsList} booksList={booksList} flashcardListsList={flashcardListsList}
      canShare={canShare} partners={partners}
      onClose={()=>setModal(null)} onSave={(payload)=>{
      if(modal==="new") add(payload); else update(modal.id, payload);
      setModal(null);
    }}/>}

    {inviteModal==="generate" && <div className="modalBack" onClick={()=>setInviteModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modalHead"><h2>Convidar parceiro(a)</h2><button type="button" onClick={()=>setInviteModal(null)}><X/></button></div>
      <p className="authSub">Envie este código (ou o link) para quem você quer compartilhar metas de estudo. A pessoa precisa ter conta no FinLife e usar o botão "Tenho um código". Válido por 7 dias.</p>
      {inviteBusy && <p className="emptyHint">Gerando código...</p>}
      {inviteError && <p className="aiErrorMsg">{inviteError}</p>}
      {inviteCode && <>
        <label>Código<input readOnly value={inviteCode} onFocus={e=>e.target.select()}/></label>
        <label>Link<input readOnly value={inviteLink} onFocus={e=>e.target.select()}/></label>
        <button type="button" className="ghost" onClick={()=>{navigator.clipboard?.writeText(inviteLink); toast("Link copiado!");}}>Copiar link</button>
      </>}
    </div></div>}

    {inviteModal==="accept" && <div className="modalBack" onClick={()=>setInviteModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modalHead"><h2>Aceitar convite</h2><button type="button" onClick={()=>setInviteModal(null)}><X/></button></div>
      <label>Código recebido<input value={acceptCode} onChange={e=>setAcceptCode(e.target.value.toUpperCase())} placeholder="Ex.: 7K9QXZ" autoFocus/></label>
      {inviteError && <p className="aiErrorMsg">{inviteError}</p>}
      <button className="primary" type="button" disabled={inviteBusy} onClick={submitAccept}>{inviteBusy?"Vinculando...":"Vincular contas"}</button>
    </div></div>}
  </div>;
}

function StudyGoalModal({goal, studyPdfsList=[], booksList=[], flashcardListsList=[], canShare=false, partners=[], onClose, onSave}){
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
  const [startDate,setStartDate] = useState(goal?.start_date || "");
  const [status,setStatus] = useState(goal?.status || "andamento");
  const [linkSource,setLinkSource] = useState(goal?.link_source || "none");
  const [linkPdfId,setLinkPdfId] = useState(goal?.link_pdf_id || "");
  const [linkPageStart,setLinkPageStart] = useState(goal?.link_page_start ?? "");
  const [linkPageEnd,setLinkPageEnd] = useState(goal?.link_page_end ?? "");
  const [linkListIds,setLinkListIds] = useState(goal?.link_list_ids || []);
  const [shared,setShared] = useState(goal?.shared || false);

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
      ...(canShare ? {shared} : {}),
      percent: mode==="percent" ? Math.min(100,Math.max(0,Number(percent)||0)) : 0,
      due_date: mode==="dias" ? null : (dueDate || null),
      start_date: startDate || null,
      failed_at: status==="falhou" ? (goal?.failed_at || todayISO()) : null,
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
      payload.target_value = (mode==="count" || mode==="dias") ? Number(targetValue)||0 : 0;
      payload.unit = mode==="count" ? unit.trim() : (mode==="dias" ? "dias" : "");
    }

    onSave(payload);
  };

  return <div className="modalBack" onClick={onClose}>
    <form className="modal" onClick={e=>e.stopPropagation()} onSubmit={submit}>
      <div className="modalHead"><h2>{goal?"Editar meta":"Nova meta"}</h2><button type="button" onClick={onClose}><X/></button></div>
      <label>Título<input value={title} onChange={e=>setTitle(e.target.value)} required placeholder="Ex.: Aprovação na EsPCEx"/></label>
      <label>Descrição<input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Ex.: Estudar com constância e conquistar minha vaga."/></label>

      {canShare && partners.length>0 && <label className="penCheckLabel">
        <input type="checkbox" checked={shared} onChange={e=>setShared(e.target.checked)}/> Meta em conjunto (visível para {partners.map(p=>p.partner_email).join(", ")})
      </label>}

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
          <button type="button" className={mode==="dias"?"active":""} onClick={()=>setMode("dias")}>Por dias</button>
        </div>
      </label>

      {mode==="percent" && <label>Progresso atual (%)<input type="number" min="0" max="100" value={percent} onChange={e=>setPercent(e.target.value)}/></label>}

      {mode==="dias" && <>
        <label>Meta (em dias)<input type="number" min="1" value={targetValue} onChange={e=>setTargetValue(e.target.value)} placeholder="Ex.: 7"/></label>
        <p className="fieldHint"><Flame size={13}/> A cada dia corrido a partir da data de início, o progresso avança sozinho, sem precisar marcar nada. Se em algum dia você não conseguir manter a meta, marque-a como Falha na lista — o contador congela nesse dia.</p>
      </>}

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

      <label>Data de início (opcional)<input type="date" value={startDate||""} onChange={e=>setStartDate(e.target.value)}/></label>
      <p className="fieldHint"><CalendarPlus size={13}/> Deixe em branco pra começar imediatamente, ou escolha uma data futura pra programar a meta (ela fica como "Agendada" até chegar o dia).</p>

      {mode!=="dias" && <label>Data de conclusão (opcional)<input type="date" value={dueDate||""} onChange={e=>setDueDate(e.target.value)}/></label>}

      <label>Status
        <select value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="andamento">Em andamento</option>
          <option value="concluida">Concluída</option>
          <option value="pausada">Pausada</option>
          <option value="falhou">Falhou</option>
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

const NOTE_TRASH_DAYS = 30; // itens na lixeira somem sozinhos depois desse prazo

function Notes({entity, openNoteId, onConsumeOpenNote}){
  const { data, add, remove, update, reorder, fetchFull, cloud } = entity;
  const [openMenuId, setOpenMenuId] = useState(null);
  const [activeNote, setActiveNote] = useState(null);
  const [openingNoteId, setOpeningNoteId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [view, setView] = useState("notas"); // "notas" | "lixeira"
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState(null);
  // Resultado da busca no servidor (texto completo) — null quando não há
  // busca ativa nesse momento; nesse caso a lista usa o filtro local (que só
  // enxerga título/tags/preview, ver visibleNotes).
  const [searchResults, setSearchResults] = useState(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const purgedRef = useRef(false);
  const searchTimer = useRef(null);
  const searchToken = useRef(0);

  const activeNotes = useMemo(() => data.filter(n => !n.deleted_at), [data]);
  const trashedNotes = useMemo(() => data.filter(n => n.deleted_at), [data]);

  // Some sozinho da lixeira depois de NOTE_TRASH_DAYS — roda uma vez por
  // carregamento, não a cada render.
  useEffect(() => {
    if (purgedRef.current) return;
    purgedRef.current = true;
    const cutoff = Date.now() - NOTE_TRASH_DAYS * 24 * 60 * 60 * 1000;
    trashedNotes.forEach(n => {
      if (new Date(n.deleted_at).getTime() < cutoff) remove(n.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Abre uma nota pra edição: a listagem só tem o "preview" (ver useEntity
  // listSelect), então o "content" (HTML) completo é buscado só agora — do
  // jeito que já acontece com livros/PDFs de estudo.
  const openNote = async (note) => {
    if (!note) return;
    setOpeningNoteId(note.id);
    try {
      const full = await fetchFull(note.id);
      setActiveNote(full || note);
    } finally {
      setOpeningNoteId(null);
    }
  };

  useEffect(() => {
    if (!openNoteId) return;
    const note = data.find(n => n.id === openNoteId);
    if (note) openNote(note);
    onConsumeOpenNote?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNoteId, data]);

  // Busca no servidor: só dispara com texto digitado e na aba "Minhas notas"
  // (a lixeira já é pequena e a função search_notes nem devolve itens
  // excluídos). Sem isso, uma busca por um trecho fora dos ~200 caracteres do
  // preview nunca encontraria a nota — o preview.trim() abaixo cobre esse caso.
  useEffect(() => {
    if (!cloud || view !== "notas") { setSearchResults(null); return; }
    const q = query.trim();
    if (!q) { setSearchResults(null); return; }
    const myToken = ++searchToken.current;
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const { data: rows, error } = await supabase.rpc("search_notes", { p_query: q });
      if (myToken !== searchToken.current) return; // busca antiga, uma mais nova já está a caminho
      if (error) {
        console.error("Busca de notas:", error);
        return; // mantém o filtro local (por preview) como já estava
      }
      setSearchResults(rows || []);
    }, 400);
    return () => clearTimeout(searchTimer.current);
  }, [query, view, cloud]);

  const createNote = async () => {
    const title = window.prompt("Título da nota:", "Nova nota");
    if (!title) return;
    setCreating(true);
    try {
      await add({ title, content: "", preview: "", tags: [] });
    } finally {
      setCreating(false);
    }
  };

  const handleTrash = async (note) => {
    setOpenMenuId(null);
    await update(note.id, { deleted_at: new Date().toISOString() });
    if (activeNote?.id === note.id) setActiveNote(null);
  };

  const handleRestore = async (note) => {
    setOpenMenuId(null);
    await update(note.id, { deleted_at: null });
  };

  const handlePermanentDelete = async (note) => {
    if (!confirm(`Excluir definitivamente "${note.title}"? Essa ação não pode ser desfeita.`)) return;
    setOpenMenuId(null);
    await remove(note.id);
  };

  const handleDrop = (targetId) => {
    if (dragId === null || dragId === targetId) { setDragId(null); return; }
    const newData = [...activeNotes];
    const fromIdx = newData.findIndex(n => n.id === dragId);
    const toIdx = newData.findIndex(n => n.id === targetId);
    setDragId(null);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = newData.splice(fromIdx, 1);
    newData.splice(toIdx, 0, moved);
    reorder(newData);
  };

  // Usa o "content" quando ele já estiver em memória (modo local, ou a nota
  // que acabou de ser editada) e cai pro "preview" leve quando não (listagem
  // vinda da nuvem, que não traz o HTML inteiro — ver useEntity listSelect).
  const preview = (note) => {
    const raw = note.content != null ? stripHtml(note.content) : (note.preview || "");
    const text = raw.trim();
    return !text ? "Nota vazia" : (text.length > 90 ? text.slice(0, 90) + "…" : text);
  };

  // Baixa o conteúdo completo de uma nota específica (menu "Baixar PDF") na
  // hora, já que a listagem não guarda mais o HTML inteiro.
  const downloadOneNotePdf = async (note) => {
    setOpenMenuId(null);
    const full = cloud ? (await fetchFull(note.id)) || note : note;
    downloadNotePdf(full);
  };

  // "Baixar todas": busca o content completo de todas as notas ativas de uma
  // vez só, nesse momento — é uma ação explícita da pessoa, então o egress
  // aqui é esperado (bem diferente de baixar tudo só pra abrir a biblioteca).
  const handleDownloadAll = async () => {
    if (downloadingAll) return;
    setDownloadingAll(true);
    try {
      if (!cloud) { downloadAllNotesPdf(activeNotes); return; }
      const { data: rows, error } = await supabase
        .from("notes")
        .select("*")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      downloadAllNotesPdf(rows || []);
    } catch (e) {
      console.error(e);
      alert("Não foi possível baixar as notas: " + (e.message || e));
    } finally {
      setDownloadingAll(false);
    }
  };

  const allTags = useMemo(() => {
    const set = new Set();
    activeNotes.forEach(n => (n.tags || []).forEach(t => set.add(t)));
    return [...set].sort();
  }, [activeNotes]);

  const visibleNotes = useMemo(() => {
    if (view === "notas" && cloud && query.trim() && searchResults) {
      return tagFilter ? searchResults.filter(n => (n.tags||[]).includes(tagFilter)) : searchResults;
    }
    const pool = view === "lixeira" ? trashedNotes : activeNotes;
    const q = query.trim().toLowerCase();
    return pool.filter(n => {
      if (tagFilter && view !== "lixeira" && !(n.tags || []).includes(tagFilter)) return false;
      if (!q) return true;
      const bodyText = n.content != null ? stripHtml(n.content) : (n.preview || "");
      const hay = (n.title + " " + bodyText + " " + (n.tags || []).join(" ")).toLowerCase();
      return hay.includes(q);
    });
  }, [view, activeNotes, trashedNotes, query, tagFilter, cloud, searchResults]);

  return (
    <div className="content">
      <div className="notesActions">
        <div className="notesViewSwitch">
          <button className={view==="notas"?"active":""} onClick={()=>setView("notas")}><StickyNote size={14}/> Minhas notas</button>
          <button className={view==="lixeira"?"active":""} onClick={()=>setView("lixeira")}><Archive size={14}/> Lixeira{trashedNotes.length>0?` (${trashedNotes.length})`:""}</button>
        </div>
        <div className="notesSearchRow">
          <div className="notesSearchBox">
            <Search size={14}/>
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder={view==="lixeira"?"Buscar na lixeira...":"Buscar em título, texto ou tags..."}/>
          </div>
          {view==="notas" && activeNotes.length > 0 && (
            <button className="ghost" disabled={downloadingAll} onClick={handleDownloadAll}>
              <Download size={15}/> {downloadingAll ? "Baixando..." : "Baixar todas em PDF"}
            </button>
          )}
        </div>
      </div>

      {view==="notas" && allTags.length > 0 && (
        <div className="notesTagChips">
          <button className={tagFilter===null?"active":""} onClick={()=>setTagFilter(null)}>Todas</button>
          {allTags.map(t => (
            <button key={t} className={tagFilter===t?"active":""} onClick={()=>setTagFilter(f=>f===t?null:t)}>#{t}</button>
          ))}
        </div>
      )}

      {view==="lixeira" && trashedNotes.length > 0 && (
        <p className="emptyHint notesTrashHint">Notas na lixeira somem sozinhas depois de {NOTE_TRASH_DAYS} dias.</p>
      )}

      <div className="notesGrid" onClick={() => setOpenMenuId(null)}>
        {view==="notas" && (
          <div className="noteTile addTile" onClick={createNote}>
            <div className="noteCoverWrap addCover">
              {creating ? <span>Criando...</span> : <><Plus size={26}/><span>Nova nota</span></>}
            </div>
          </div>
        )}
        {visibleNotes.map(note => (
          <div
            className={"noteTile"+(dragId===note.id?" dragging":"")}
            key={note.id}
            draggable={view==="notas"}
            onDragStart={(e)=>{ e.stopPropagation(); setDragId(note.id); e.dataTransfer.effectAllowed="move"; }}
            onDragOver={(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect="move"; }}
            onDrop={(e)=>{ e.preventDefault(); e.stopPropagation(); handleDrop(note.id); }}
            onDragEnd={()=>setDragId(null)}
          >
            <div className="noteCoverWrap" onClick={() => view==="notas" ? openNote(note) : null}>
              <b className="noteTitle">{note.title}</b>
              <p className="notePreview">{openingNoteId===note.id ? "Abrindo..." : preview(note)}</p>
              <div className="noteTileFoot">
                {(note.tags||[]).length > 0 && <span className="noteTileTags">{(note.tags||[]).slice(0,3).map(t=>`#${t}`).join(" ")}</span>}
                <small className="noteTileTime">{view==="lixeira" ? `excluída ${timeAgo(note.deleted_at)}` : (note.updated_at ? `editado ${timeAgo(note.updated_at)}` : "")}</small>
              </div>
            </div>
            <button className="bookMenuBtn" onClick={(e) => { e.stopPropagation(); setOpenMenuId(id => id === note.id ? null : note.id); }}>
              <MoreVertical size={15}/>
            </button>
            {openMenuId === note.id && view==="notas" && (
              <div className="bookMenu" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setOpenMenuId(null); openNote(note); }}><StickyNote size={14}/> Abrir</button>
                <button onClick={() => downloadOneNotePdf(note)}><Download size={14}/> Baixar PDF</button>
                <button className="danger" onClick={() => handleTrash(note)}><Trash2 size={14}/> Mover para lixeira</button>
              </div>
            )}
            {openMenuId === note.id && view==="lixeira" && (
              <div className="bookMenu" onClick={e => e.stopPropagation()}>
                <button onClick={() => handleRestore(note)}><ArchiveRestore size={14}/> Restaurar</button>
                <button className="danger" onClick={() => handlePermanentDelete(note)}><Trash2 size={14}/> Excluir definitivamente</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {visibleNotes.length === 0 && view==="notas" && (
        <p className="emptyHint">{activeNotes.length===0 ? "Nenhuma nota por aqui ainda." : "Nenhuma nota encontrada."}</p>
      )}
      {visibleNotes.length === 0 && view==="lixeira" && (
        <p className="emptyHint">A lixeira está vazia.</p>
      )}
      {activeNote && (
        <NoteEditor
          note={activeNote}
          onClose={() => setActiveNote(null)}
          onSave={(patch) => {
            const fullPatch = { ...patch, updated_at: new Date().toISOString() };
            // Mantém o "preview" (coluna leve da listagem) em dia sempre que
            // o corpo da nota muda — é o que evita ter que baixar o content
            // inteiro de novo só pra mostrar o resuminho na estante.
            if (patch.content !== undefined) {
              const text = stripHtml(patch.content).trim();
              fullPatch.preview = !text ? "" : text.slice(0, 200);
            }
            update(activeNote.id, fullPatch);
          }}
        />
      )}
    </div>
  );
}

function NoteEditor({ note, onClose, onSave }) {
  const [title, setTitle] = useState(note.title);
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

  const fmt = useNoteFormatting(bodyRef, handleBodyInput);

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
        <div className="noteToolbar" onMouseDown={fmt.keepFocus}>
          <NoteFormatButtons fmt={fmt}/>
          <span className="noteToolDivider"/>
          <button title="Baixar esta nota em PDF" onClick={() => downloadNotePdf({ title, content: bodyRef.current?.innerHTML || "" })}><Download size={16}/></button>
        </div>
        <div className="noteEditorBody" onClick={() => { fmt.setEmojiOpen(false); fmt.setColorOpen(false); fmt.setHiliteOpen(false); fmt.closeLinkPopover(); }}>
          <div
            ref={bodyRef}
            className="noteTextarea noteRichBody"
            contentEditable
            suppressContentEditableWarning
            onInput={handleBodyInput}
            onClick={fmt.handleBodyClick}
            onKeyDown={fmt.handleBodyKeyDown}
            onMouseUp={fmt.updateLinkBar}
            onKeyUp={fmt.updateLinkBar}
            data-placeholder="Escreva o que quiser..."
          />
          <NoteLinkFloatingUI fmt={fmt}/>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Root/>);
