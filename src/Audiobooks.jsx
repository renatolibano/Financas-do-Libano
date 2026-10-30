import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Headphones, Play, Pause, SkipBack, SkipForward, RotateCcw, RotateCw, Plus, X, MoreVertical, Trash2, Pencil,
  BookmarkPlus, Bookmark, List, Moon, Gauge, ChevronDown, Check, Library, Hourglass, CheckCircle2, Clock3, HardDrive, Search,
} from "lucide-react";
import { usePersistentState } from "./lib/storage";
import {
  getLocalTrackIds, getTrackBlob, saveTrackBlob, deleteLocalFiles, saveLocalPos, loadLocalPos,
  readAudioDuration, fmtClock, fmtHuman, imageToCoverThumb,
} from "./lib/audiobooks";

export const AUDIO_PAGE_STATUS = {
  "Audiolivros Ouvindo": "ouvindo",
  "Audiolivros Ouvidos": "ouvido",
  "Audiolivros Quero Ouvir": "quero_ouvir",
};
const STATUS_LABEL = { ouvindo: "Ouvindo", ouvido: "Já ouvi", quero_ouvir: "Quero ouvir" };
const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
const SLEEP_OPTIONS = [15, 30, 45, 60];
const SKIP_BACK = 15, SKIP_FWD = 30;

const isAudioFile = (f) => (f.type || "").startsWith("audio/") || /\.(mp3|m4a|m4b|aac|ogg|opus|wav|flac|wma)$/i.test(f.name);
const naturalSort = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
const cleanName = (n) => String(n || "").replace(/\.[^.]+$/, "").replace(/_+/g, " ").trim();

function bookProgress(b, live) {
  const tracks = b.tracks || [];
  const total = b.total_seconds || tracks.reduce((n, t) => n + (t.dur || 0), 0);
  if (b.status === "ouvido") return { pct: 100, elapsed: total, total, left: 0 };
  const idx = Math.min(b.current_track || 0, Math.max(0, tracks.length - 1));
  const before = tracks.slice(0, idx).reduce((n, t) => n + (t.dur || 0), 0);
  const elapsed = Math.min(total, live != null ? live : before + (b.current_pos || 0));
  return { pct: total ? Math.min(100, Math.round((elapsed / total) * 100)) : 0, elapsed, total, left: Math.max(0, total - elapsed) };
}

function coverColors(title) {
  const h = Math.abs([...String(title || "")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) % 360;
  return [`hsl(${h},55%,36%)`, `hsl(${(h + 40) % 360},60%,22%)`];
}

function AbCover({ book, generated }) {
  if (book.cover_thumb && !generated) return <div className="bookCoverImg"><img src={book.cover_thumb} alt={book.title}/></div>;
  const [c1, c2] = coverColors(book.title);
  return (
    <div className="abGenCover" style={{ background: `linear-gradient(145deg,${c1},${c2})` }}>
      <Headphones size={30}/>
      <span>{book.title}</span>
    </div>
  );
}

// Barra de busca (capítulo atual) com preenchimento e arrasto suave.
function AbSeek({ value, max, onCommit }) {
  const [scrub, setScrub] = useState(null);
  const v = scrub != null ? scrub : value;
  const pct = max > 0 ? Math.min(100, (v / max) * 100) : 0;
  const commit = () => { if (scrub != null) { onCommit(scrub); setScrub(null); } };
  return (
    <input
      type="range" className="abSeek" min={0} max={Math.max(1, Math.floor(max))} step={1} value={Math.floor(v)}
      style={{ "--pct": pct + "%" }}
      onChange={(e) => setScrub(Number(e.target.value))}
      onPointerUp={commit} onTouchEnd={commit} onKeyUp={commit} onBlur={commit}
    />
  );
}

// Barra do livro inteiro, com divisões de capítulos e pontinhos de marcadores.
function AbOverall({ book, elapsed }) {
  const tracks = book.tracks || [];
  const total = book.total_seconds || tracks.reduce((n, t) => n + (t.dur || 0), 0);
  const pct = total ? Math.min(100, (elapsed / total) * 100) : 0;
  const starts = [];
  let acc = 0;
  tracks.forEach(t => { starts.push(acc); acc += t.dur || 0; });
  return (
    <div className="abOverall">
      <i className="abOverallFill" style={{ width: pct + "%" }}/>
      {total > 0 && tracks.length > 1 && tracks.length <= 80 && starts.slice(1).map((s, i) => <b key={i} className="abOverallTick" style={{ left: (s / total) * 100 + "%" }}/>)}
      {total > 0 && (book.bookmarks || []).map(m => (
        <u key={m.id} className="abOverallMark" style={{ left: Math.min(100, ((starts[m.track] || 0) + m.pos) / total * 100) + "%" }}/>
      ))}
    </div>
  );
}

function AudiobookForm({ mode, book, defaultStatus, busy, onClose, onSubmit }) {
  const [title, setTitle] = useState(book?.title || "");
  const [author, setAuthor] = useState(book?.author || "");
  const [status, setStatus] = useState(book?.status || defaultStatus || "quero_ouvir");
  const [files, setFiles] = useState([]);
  const [coverFile, setCoverFile] = useState(null);
  const [removeCover, setRemoveCover] = useState(false);
  const fileRef = useRef(null), dirRef = useRef(null), coverRef = useRef(null);

  const pickFiles = (list) => {
    const arr = [...(list || [])].filter(isAudioFile).sort(naturalSort);
    if (!arr.length) return;
    setFiles(arr);
    if (!title.trim()) {
      const rel = arr[0].webkitRelativePath;
      setTitle(rel && rel.includes("/") ? rel.split("/")[0] : (arr.length === 1 ? cleanName(arr[0].name) : cleanName(arr[0].name).replace(/[\s\-_.]*(cap[ií]tulo|cap|parte|part|faixa|track)?[\s\-_.]*\d+.*$/i, "").trim() || cleanName(arr[0].name)));
    }
  };
  const totalMB = files.reduce((n, f) => n + f.size, 0) / 1048576;
  const canSave = title.trim() && (mode === "edit" || files.length > 0) && !busy;

  return (
    <div className="modalBack" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modalHead"><h2>{mode === "edit" ? "Editar audiolivro" : "Novo audiolivro"}</h2><button type="button" onClick={onClose} disabled={busy}><X/></button></div>
        {mode === "add" && (
          <div className="abFilePick">
            <div className="abFilePickBtns">
              <button type="button" className="ghost" onClick={() => fileRef.current?.click()}><Plus size={14}/> Escolher arquivos</button>
              <button type="button" className="ghost" onClick={() => dirRef.current?.click()}><Library size={14}/> Escolher pasta</button>
            </div>
            <input ref={fileRef} type="file" multiple hidden accept="audio/*,.m4b,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac" onChange={e => { pickFiles(e.target.files); e.target.value = ""; }}/>
            <input ref={dirRef} type="file" hidden webkitdirectory="" directory="" multiple onChange={e => { pickFiles(e.target.files); e.target.value = ""; }}/>
            <small>{files.length ? `${files.length} arquivo(s) · ${totalMB.toFixed(1)} MB — cada arquivo vira um capítulo, em ordem de nome.` : "Pode ser um arquivo só (m4b/mp3) ou vários capítulos. Ficam guardados neste aparelho."}</small>
          </div>
        )}
        <label>Título<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nome do audiolivro"/></label>
        <label>Autor / narrador<input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Opcional"/></label>
        <label>Estante
          <select value={status} onChange={e => setStatus(e.target.value)}>
            {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <div className="abCoverPick">
          <button type="button" className="ghost" onClick={() => coverRef.current?.click()}><Plus size={14}/> {coverFile ? "Trocar capa" : (book?.cover_thumb && !removeCover ? "Trocar capa" : "Capa (opcional)")}</button>
          {(coverFile || (book?.cover_thumb && !removeCover)) && <button type="button" className="ghost" onClick={() => { setCoverFile(null); setRemoveCover(true); }}>Remover capa</button>}
          <input ref={coverRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setCoverFile(f); setRemoveCover(false); } }}/>
          {coverFile && <small>{coverFile.name}</small>}
        </div>
        <div className="modalActions">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="add" disabled={!canSave} onClick={() => onSubmit({ title: title.trim(), author: author.trim(), status, files, coverFile, removeCover })}>
            <Check size={16}/> {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AudiobookHost({ page, setPage, entity, stats, generatedCovers }) {
  const { data, add, update, remove, cloud } = entity;
  const audioRef = useRef(null);
  const urlRef = useRef(null);
  const attachInputRef = useRef(null);
  const attachTargetRef = useRef(null);

  const [curId, setCurId] = useState(null);
  const [trackIdx, setTrackIdx] = useState(0);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [missing, setMissing] = useState(false);
  const [playErr, setPlayErr] = useState(false);
  const [rate, setRate] = usePersistentState("audiobookRate", 1);
  const [sleep, setSleep] = useState(null); // null | {type:"time", endsAt} | {type:"chapter"}
  const [sleepLeft, setSleepLeft] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [panel, setPanel] = useState(null); // null | speed | sleep | chapters | marks
  const [localIds, setLocalIds] = useState({});
  const [form, setForm] = useState(null); // {mode, book?, status?}
  const [busy, setBusy] = useState(null); // texto de progresso

  const dataRef = useRef(data); dataRef.current = data;
  const updateRef = useRef(update); updateRef.current = update;
  const statsRef = useRef(stats); statsRef.current = stats;
  const curBook = useMemo(() => data.find(b => b.id === curId) || null, [data, curId]);
  const bookRef = useRef(null); bookRef.current = curBook;
  const trackIdxRef = useRef(0);
  const rateRef = useRef(rate); rateRef.current = rate;
  const sleepRef = useRef(null); sleepRef.current = sleep;
  const loadTokenRef = useRef(0);
  const pendingSeekRef = useRef(0);
  const autoplayRef = useRef(false);
  const lastTimeRef = useRef(0);
  const listenedRef = useRef(0);
  const lastUiRef = useRef(0);
  const lastLocalSaveRef = useRef(0);

  // ---- arquivos locais ----
  const refreshLocal = useCallback(async () => {
    const map = {};
    for (const b of dataRef.current) map[b.id] = (await getLocalTrackIds(b.id)).length;
    setLocalIds(map);
  }, []);
  const idsKey = data.map(b => b.id).join(",");
  useEffect(() => { refreshLocal(); }, [idsKey, refreshLocal]);
  const hasFiles = (b) => (b.tracks?.length || 0) > 0 && (localIds[b.id] || 0) >= b.tracks.length;

  // ---- salvar posição / estatística ----
  const persist = useCallback((toCloud) => {
    const b = bookRef.current, a = audioRef.current;
    if (!b || !a || !a.src) return;
    const p = a.currentTime || 0;
    saveLocalPos(b.id, trackIdxRef.current, p);
    if (toCloud && b.status !== "ouvido") {
      updateRef.current(b.id, { current_track: trackIdxRef.current, current_pos: Math.floor(p), last_played_at: new Date().toISOString() });
    }
  }, []);
  const flushStats = useCallback((minSec) => {
    const s = listenedRef.current;
    if (s >= minSec) { listenedRef.current = 0; statsRef.current?.bump({ seconds: Math.round(s) }); }
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => { persist(true); flushStats(30); }, 60000);
    return () => clearInterval(id);
  }, [playing, persist, flushStats]);

  useEffect(() => {
    const onHide = () => { persist(false); };
    const onVis = () => { if (document.visibilityState === "hidden") onHide(); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("pagehide", onHide); document.removeEventListener("visibilitychange", onVis); persist(false); };
  }, [persist]);

  // ---- carregar faixa ----
  const loadTrack = useCallback(async (b, idx, seek = 0, autoplay = true) => {
    const token = ++loadTokenRef.current;
    const t = b.tracks?.[idx];
    trackIdxRef.current = idx;
    setTrackIdx(idx); setPos(seek); setDur(t?.dur || 0); setMissing(false); setPlayErr(false);
    const a = audioRef.current;
    if (!t || !a) return;
    setLoadingFile(true);
    const blob = await getTrackBlob(b.id, t.id);
    if (loadTokenRef.current !== token) return;
    setLoadingFile(false);
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    if (!blob) { a.removeAttribute("src"); a.load(); setMissing(true); setPlaying(false); return; }
    urlRef.current = URL.createObjectURL(blob);
    pendingSeekRef.current = seek;
    autoplayRef.current = autoplay;
    a.src = urlRef.current;
    a.defaultPlaybackRate = rateRef.current;
    a.playbackRate = rateRef.current;
    a.load();
  }, []);

  const openBook = useCallback(async (b, opts = {}) => {
    if (!b) return;
    if (curId === b.id) {
      if (opts.expand) setExpanded(true);
      const a = audioRef.current;
      if (a && a.paused && a.src) a.play().catch(() => {});
      return;
    }
    persist(true); flushStats(5);
    let track = b.current_track || 0, p = b.current_pos || 0;
    const local = loadLocalPos(b.id);
    const cloudTs = b.last_played_at ? Date.parse(b.last_played_at) : 0;
    if (local && local.ts > cloudTs) { track = local.track; p = local.pos; }
    if (b.status === "ouvido") { track = 0; p = 0; }
    track = Math.max(0, Math.min(track, (b.tracks?.length || 1) - 1));
    bookRef.current = b;
    setCurId(b.id); setSleep(null); setPanel(null);
    if (opts.expand) setExpanded(true);
    if (b.status === "quero_ouvir") updateRef.current(b.id, { status: "ouvindo" });
    lastTimeRef.current = p;
    await loadTrack(b, track, p, opts.play !== false);
  }, [curId, persist, flushStats, loadTrack]);

  const closePlayer = useCallback(() => {
    persist(true); flushStats(5);
    const a = audioRef.current;
    if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    loadTokenRef.current++;
    setCurId(null); setPlaying(false); setExpanded(false); setSleep(null); setPanel(null);
  }, [persist, flushStats]);

  useEffect(() => { if (curId && !curBook) closePlayer(); }, [curId, curBook, closePlayer]);

  // ---- controles ----
  const togglePlay = () => {
    const a = audioRef.current;
    if (!a || !a.src) return;
    if (a.paused) a.play().catch(() => setPlaying(false)); else a.pause();
  };
  const seekTo = (sec) => {
    const a = audioRef.current;
    if (!a || !a.src) return;
    const max = Number.isFinite(a.duration) ? a.duration : sec;
    a.currentTime = Math.max(0, Math.min(sec, max));
    lastTimeRef.current = a.currentTime;
    setPos(a.currentTime);
  };
  const goTrack = (idx, seek = 0) => {
    const b = bookRef.current;
    if (!b || idx < 0 || idx >= b.tracks.length) return;
    persist(true);
    loadTrack(b, idx, seek, true);
  };
  const skip = (delta) => {
    const a = audioRef.current, b = bookRef.current;
    if (!a || !b || !a.src) return;
    const t = a.currentTime + delta;
    const idx = trackIdxRef.current;
    if (t < 0 && idx > 0) goTrack(idx - 1, Math.max(0, (b.tracks[idx - 1].dur || 0) + t));
    else if (a.duration && t >= a.duration - 0.5 && idx < b.tracks.length - 1) goTrack(idx + 1, Math.max(0, t - a.duration));
    else seekTo(t);
  };
  const prevChapter = () => {
    const a = audioRef.current;
    if (a && a.currentTime > 5) seekTo(0);
    else if (trackIdxRef.current > 0) goTrack(trackIdxRef.current - 1, 0);
    else seekTo(0);
  };
  const nextChapter = () => { const b = bookRef.current; if (b && trackIdxRef.current < b.tracks.length - 1) goTrack(trackIdxRef.current + 1, 0); };

  const addBookmark = () => {
    const b = bookRef.current, a = audioRef.current;
    if (!b || !a) return;
    const note = window.prompt("Anotação do marcador (opcional):", "");
    if (note === null) return;
    const bm = { id: crypto.randomUUID(), track: trackIdxRef.current, pos: Math.floor(a.currentTime || 0), note: note.trim(), createdAt: Date.now() };
    updateRef.current(b.id, { bookmarks: [...(b.bookmarks || []), bm] });
  };
  const removeBookmark = (id) => { const b = bookRef.current; if (b) updateRef.current(b.id, { bookmarks: (b.bookmarks || []).filter(m => m.id !== id) }); };
  const jumpBookmark = (m) => {
    if (m.track === trackIdxRef.current) seekTo(m.pos); else goTrack(m.track, m.pos);
    const a = audioRef.current; if (a && a.paused) a.play().catch(() => {});
  };

  // ---- efeitos de áudio ----
  useEffect(() => {
    const a = audioRef.current;
    if (a) { a.defaultPlaybackRate = rate; a.playbackRate = rate; }
  }, [rate]);

  useEffect(() => {
    if (!sleep || sleep.type !== "time") { setSleepLeft(0); return; }
    const tick = () => {
      const left = Math.round((sleep.endsAt - Date.now()) / 1000);
      if (left <= 0) { audioRef.current?.pause(); setSleep(null); setSleepLeft(0); } else setSleepLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sleep]);

  // Controles na tela de bloqueio / fones (Media Session)
  useEffect(() => {
    if (!("mediaSession" in navigator) || !curBook) return;
    const ms = navigator.mediaSession;
    try {
      ms.metadata = new window.MediaMetadata({
        title: curBook.tracks?.[trackIdx]?.name || curBook.title,
        artist: curBook.author || "Audiolivro",
        album: curBook.title,
        artwork: curBook.cover_thumb ? [{ src: curBook.cover_thumb, sizes: "360x360", type: "image/jpeg" }] : [],
      });
      ms.setActionHandler("play", () => audioRef.current?.play());
      ms.setActionHandler("pause", () => audioRef.current?.pause());
      ms.setActionHandler("seekbackward", () => skip(-SKIP_BACK));
      ms.setActionHandler("seekforward", () => skip(SKIP_FWD));
      ms.setActionHandler("previoustrack", () => prevChapter());
      ms.setActionHandler("nexttrack", () => nextChapter());
      ms.setActionHandler("seekto", (d) => { if (d.seekTime != null) seekTo(d.seekTime); });
    } catch (e) { /* navegador sem suporte completo */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curBook?.id, curBook?.title, trackIdx]);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
      if (dur > 0) navigator.mediaSession.setPositionState({ duration: dur, playbackRate: rate, position: Math.min(pos, dur) });
    } catch (e) { /* ignora */ }
  }, [playing, dur, rate, Math.floor(pos / 5)]);

  // ---- eventos do <audio> ----
  const onLoadedMetadata = () => {
    const a = audioRef.current;
    setDur(a.duration || 0);
    a.defaultPlaybackRate = rateRef.current; a.playbackRate = rateRef.current;
    const seek = pendingSeekRef.current; pendingSeekRef.current = 0;
    if (seek > 0 && seek < (a.duration || Infinity) - 1) a.currentTime = seek;
    lastTimeRef.current = a.currentTime;
    const b = bookRef.current, i = trackIdxRef.current, t = b?.tracks?.[i];
    if (b && t && Number.isFinite(a.duration) && Math.abs((t.dur || 0) - a.duration) > 2) {
      const tracks = b.tracks.map((x, k) => k === i ? { ...x, dur: Math.round(a.duration) } : x);
      updateRef.current(b.id, { tracks, total_seconds: tracks.reduce((n, x) => n + (x.dur || 0), 0) });
    }
    if (autoplayRef.current) { autoplayRef.current = false; a.play().catch(() => setPlaying(false)); }
  };
  const onTimeUpdate = () => {
    const a = audioRef.current, t = a.currentTime;
    const d = t - lastTimeRef.current; lastTimeRef.current = t;
    if (d > 0 && d < 2) listenedRef.current += d;
    const now = Date.now();
    if (now - lastUiRef.current > 400) { lastUiRef.current = now; setPos(t); }
    if (now - lastLocalSaveRef.current > 4000) {
      lastLocalSaveRef.current = now;
      const b = bookRef.current; if (b) saveLocalPos(b.id, trackIdxRef.current, t);
    }
  };
  const onEnded = () => {
    const b = bookRef.current, idx = trackIdxRef.current;
    if (!b) return;
    if (idx < b.tracks.length - 1) {
      const stopHere = sleepRef.current?.type === "chapter";
      if (stopHere) setSleep(null);
      saveLocalPos(b.id, idx + 1, 0);
      updateRef.current(b.id, { current_track: idx + 1, current_pos: 0, last_played_at: new Date().toISOString() });
      loadTrack(b, idx + 1, 0, !stopHere);
    } else {
      setPlaying(false); setSleep(null);
      saveLocalPos(b.id, 0, 0);
      if (b.status !== "ouvido") {
        updateRef.current(b.id, { status: "ouvido", current_track: 0, current_pos: 0, last_played_at: new Date().toISOString() });
        statsRef.current?.bump({ completed: 1 });
      }
      flushStats(1);
    }
  };

  // ---- importar / anexar / editar ----
  const requestPersist = () => { try { navigator.storage?.persist?.(); } catch (e) { /* ignora */ } };

  const importBook = async ({ title, author, status, files, coverFile }) => {
    const id = crypto.randomUUID();
    requestPersist();
    const tracks = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setBusy(`Guardando arquivo ${i + 1} de ${files.length}…`);
        const f = files[i];
        const d = await readAudioDuration(f);
        const ok = await saveTrackBlob(id, String(i), f);
        if (!ok) throw new Error("Sem espaço livre no aparelho para guardar este áudio.");
        tracks.push({ id: String(i), name: cleanName(f.name), file: f.name, dur: Math.round(d), size: f.size });
      }
      const cover_thumb = coverFile ? await imageToCoverThumb(coverFile).catch(() => null) : null;
      setBusy("Salvando cadastro…");
      const row = {
        id, title, author: author || null, status, tracks,
        total_seconds: tracks.reduce((n, t) => n + t.dur, 0),
        current_track: 0, current_pos: 0, bookmarks: [], cover_thumb,
      };
      const inserted = await add(row);
      if (cloud && !inserted) throw new Error("Não foi possível salvar o cadastro.");
      await refreshLocal();
      return true;
    } catch (e) {
      console.error(e);
      await deleteLocalFiles(id);
      alert(e.message || "Não foi possível adicionar o audiolivro.");
      return false;
    } finally { setBusy(null); }
  };

  const attachFiles = async (b, fileList) => {
    const files = [...fileList].filter(isAudioFile).sort(naturalSort);
    const tracks = b.tracks || [];
    if (!files.length) return;
    let mapping = tracks.map(t => files.find(f => f.name === t.file));
    if (!mapping.every(Boolean)) {
      if (files.length === tracks.length) mapping = files;
      else { alert(`Este audiolivro tem ${tracks.length} arquivo(s). Selecione os mesmos arquivos que você adicionou originalmente.`); return; }
    }
    requestPersist();
    try {
      for (let i = 0; i < tracks.length; i++) {
        setBusy(`Guardando arquivo ${i + 1} de ${tracks.length}…`);
        const ok = await saveTrackBlob(b.id, tracks[i].id, mapping[i]);
        if (!ok) throw new Error("Sem espaço livre no aparelho para guardar este áudio.");
      }
      await refreshLocal();
      if (curId === b.id) loadTrack(b, trackIdxRef.current, audioRef.current?.currentTime || 0, false);
    } catch (e) { alert(e.message || "Não foi possível guardar os arquivos."); }
    finally { setBusy(null); }
  };
  const pickFilesFor = (b) => { attachTargetRef.current = b; attachInputRef.current?.click(); };

  const submitForm = async (v) => {
    if (form.mode === "add") {
      const ok = await importBook(v);
      if (ok) setForm(null);
      return;
    }
    const b = form.book;
    const patch = { title: v.title, author: v.author || null, status: v.status };
    if (v.coverFile) patch.cover_thumb = await imageToCoverThumb(v.coverFile).catch(() => b.cover_thumb);
    else if (v.removeCover) patch.cover_thumb = null;
    if (v.status !== b.status) await changeStatus(b, v.status, patch);
    else await update(b.id, patch);
    setForm(null);
  };

  const changeStatus = async (b, status, extra = {}) => {
    const patch = { ...extra, status };
    if (status === "ouvindo" && b.status === "ouvido") { patch.current_track = 0; patch.current_pos = 0; saveLocalPos(b.id, 0, 0); }
    if (status === "ouvido" && b.status !== "ouvido") statsRef.current?.bump({ completed: 1 });
    await update(b.id, patch);
    if (curId === b.id && status === "ouvindo" && b.status === "ouvido") loadTrack({ ...b, ...patch }, 0, 0, false);
  };

  const deleteBook = async (b) => {
    if (!window.confirm(`Excluir "${b.title}"? Os arquivos também serão removidos deste aparelho.`)) return;
    if (curId === b.id) closePlayer();
    await deleteLocalFiles(b.id);
    await remove(b.id);
    refreshLocal();
  };
  const removeLocal = async (b) => {
    if (!window.confirm(`Remover os arquivos de "${b.title}" deste aparelho? O cadastro e o progresso continuam salvos.`)) return;
    if (curId === b.id) closePlayer();
    await deleteLocalFiles(b.id);
    refreshLocal();
  };

  const live = curBook ? (curBook.tracks || []).slice(0, trackIdx).reduce((n, t) => n + (t.dur || 0), 0) + pos : null;
  const ctl = {
    data, curId, playing, live, localIds, hasFiles, generatedCovers, stats, setPage,
    openBook, togglePlay, changeStatus, deleteBook, removeLocal, pickFilesFor,
    openForm: (f) => setForm(f),
  };

  const status = AUDIO_PAGE_STATUS[page];
  return (
    <>
      {page === "Audiolivros" && <AudiobookDashboard ctl={ctl}/>}
      {status && <AudiobookShelf ctl={ctl} status={status}/>}

      <audio
        ref={audioRef} preload="auto"
        onLoadedMetadata={onLoadedMetadata} onTimeUpdate={onTimeUpdate} onEnded={onEnded}
        onSeeked={() => { const a = audioRef.current; lastTimeRef.current = a.currentTime; setPos(a.currentTime); }}
        onPlay={() => setPlaying(true)}
        onPause={() => { setPlaying(false); persist(true); flushStats(30); }}
        onError={() => { if (audioRef.current?.getAttribute("src")) { setPlayErr(true); setPlaying(false); } }}
      />
      <input ref={attachInputRef} type="file" multiple hidden accept="audio/*,.m4b,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac"
        onChange={e => { const b = attachTargetRef.current; const fl = e.target.files; e.target.value = ""; if (b && fl?.length) attachFiles(b, fl); }}/>

      {curBook && !expanded && (
        <MiniBar book={curBook} trackIdx={trackIdx} pos={pos} dur={dur} live={live} playing={playing} missing={missing} loading={loadingFile}
          generated={generatedCovers} onToggle={togglePlay} onSkip={skip} onExpand={() => setExpanded(true)} onClose={closePlayer} onAttach={() => pickFilesFor(curBook)}/>
      )}
      {curBook && expanded && (
        <FullPlayer
          book={curBook} trackIdx={trackIdx} pos={pos} dur={dur} live={live} playing={playing} missing={missing} loading={loadingFile} playErr={playErr}
          rate={rate} setRate={setRate} sleep={sleep} sleepLeft={sleepLeft} panel={panel} setPanel={setPanel} generated={generatedCovers}
          onToggle={togglePlay} onSkip={skip} onSeek={seekTo} onPrev={prevChapter} onNext={nextChapter}
          onGoTrack={(i) => goTrack(i, 0)} onSleep={setSleep}
          onAddMark={addBookmark} onJumpMark={jumpBookmark} onRemoveMark={removeBookmark}
          onAttach={() => pickFilesFor(curBook)} onCollapse={() => setExpanded(false)} onClose={closePlayer}/>
      )}
      {form && <AudiobookForm mode={form.mode} book={form.book} defaultStatus={form.status} busy={!!busy} onClose={() => setForm(null)} onSubmit={submitForm}/>}
      {busy && <div className="abBusy">{busy}</div>}
      {curBook && !expanded && <div style={{ height: 84 }}/>}
    </>
  );
}

function MiniBar({ book, trackIdx, pos, dur, live, playing, missing, loading, generated, onToggle, onSkip, onExpand, onClose, onAttach }) {
  const pr = bookProgress(book, live);
  return (
    <div className="abMini">
      <div className="abMiniProg"><i style={{ width: pr.pct + "%" }}/></div>
      <button type="button" className="abMiniCover" onClick={onExpand}><AbCover book={book} generated={generated}/></button>
      <button type="button" className="abMiniInfo" onClick={onExpand}>
        <b>{book.title}</b>
        <small>{missing ? "Sem arquivo neste aparelho" : `${book.tracks?.[trackIdx]?.name || ""} · ${fmtClock(pos)} / ${fmtClock(dur)}`}</small>
      </button>
      {missing ? (
        <button type="button" className="ghost abMiniAttach" onClick={onAttach}><HardDrive size={14}/> Anexar</button>
      ) : (
        <div className="abMiniBtns">
          <button type="button" className="abMiniSkip" title={`Voltar ${SKIP_BACK}s`} onClick={() => onSkip(-SKIP_BACK)}><RotateCcw size={18}/></button>
          <button type="button" className="abMiniPlay" title={playing ? "Pausar" : "Ouvir"} onClick={onToggle} disabled={loading}>{playing ? <Pause size={20}/> : <Play size={20}/>}</button>
          <button type="button" className="abMiniSkip" title={`Avançar ${SKIP_FWD}s`} onClick={() => onSkip(SKIP_FWD)}><RotateCw size={18}/></button>
        </div>
      )}
      <button type="button" className="abMiniClose" title="Fechar player" onClick={onClose}><X size={16}/></button>
    </div>
  );
}

function FullPlayer({
  book, trackIdx, pos, dur, live, playing, missing, loading, playErr, rate, setRate, sleep, sleepLeft, panel, setPanel, generated,
  onToggle, onSkip, onSeek, onPrev, onNext, onGoTrack, onSleep, onAddMark, onJumpMark, onRemoveMark, onAttach, onCollapse, onClose,
}) {
  const pr = bookProgress(book, live);
  const tracks = book.tracks || [];
  const track = tracks[trackIdx];
  const toggle = (name) => setPanel(p => p === name ? null : name);
  const marks = [...(book.bookmarks || [])].sort((a, b) => a.track - b.track || a.pos - b.pos);
  return (
    <div className="abFullBack">
      <div className="abFull">
        <div className="abFullTop">
          <button type="button" onClick={onCollapse} title="Minimizar"><ChevronDown size={22}/></button>
          <span>Tocando agora</span>
          <button type="button" onClick={onClose} title="Fechar player"><X size={20}/></button>
        </div>
        <div className="abFullScroll">
          <div className="abFullCover"><AbCover book={book} generated={generated}/></div>
          <div className="abFullTitles">
            <h2>{book.title}</h2>
            {book.author && <p>{book.author}</p>}
            <small>{tracks.length > 1 ? `Capítulo ${trackIdx + 1} de ${tracks.length} · ` : ""}{track?.name}</small>
          </div>

          {missing && (
            <div className="abNotice">
              <HardDrive size={16}/>
              <span>Os arquivos deste audiolivro não estão neste aparelho.</span>
              <button type="button" className="ghost" onClick={onAttach}>Selecionar arquivos</button>
            </div>
          )}
          {playErr && <div className="abNotice err"><span>Não foi possível tocar este arquivo (formato não suportado pelo navegador).</span></div>}

          <div className="abSeekRow">
            <span>{fmtClock(pos)}</span>
            <AbSeek value={pos} max={dur} onCommit={onSeek}/>
            <span>-{fmtClock(Math.max(0, dur - pos))}</span>
          </div>

          <div className="abControls">
            <button type="button" title="Capítulo anterior" onClick={onPrev}><SkipBack size={22}/></button>
            <button type="button" title={`Voltar ${SKIP_BACK}s`} onClick={() => onSkip(-SKIP_BACK)}><RotateCcw size={26}/><em>{SKIP_BACK}</em></button>
            <button type="button" className="abPlayBig" title={playing ? "Pausar" : "Ouvir"} onClick={onToggle} disabled={loading || missing}>
              {playing ? <Pause size={30}/> : <Play size={30}/>}
            </button>
            <button type="button" title={`Avançar ${SKIP_FWD}s`} onClick={() => onSkip(SKIP_FWD)}><RotateCw size={26}/><em>{SKIP_FWD}</em></button>
            <button type="button" title="Próximo capítulo" onClick={onNext} disabled={trackIdx >= tracks.length - 1}><SkipForward size={22}/></button>
          </div>

          <div className="abOverallBlock">
            <AbOverall book={book} elapsed={pr.elapsed}/>
            <div className="abOverallInfo"><span>{pr.pct}% do livro</span><span>{pr.left > 0 ? `restam ${fmtHuman(pr.left)}` : "concluído"}</span></div>
          </div>

          <div className="abTools">
            <button type="button" className={panel === "speed" ? "active" : ""} onClick={() => toggle("speed")}><Gauge size={16}/> {rate}×</button>
            <button type="button" className={panel === "sleep" || sleep ? "active" : ""} onClick={() => toggle("sleep")}>
              <Moon size={16}/> {sleep?.type === "time" ? fmtClock(sleepLeft) : (sleep?.type === "chapter" ? "Fim do cap." : "Timer")}
            </button>
            <button type="button" className={panel === "chapters" ? "active" : ""} onClick={() => toggle("chapters")}><List size={16}/> Capítulos</button>
            <button type="button" className={panel === "marks" ? "active" : ""} onClick={() => toggle("marks")}><Bookmark size={16}/> Marcadores{marks.length ? ` (${marks.length})` : ""}</button>
          </div>

          {panel === "speed" && (
            <div className="abPanel abChips">
              {RATES.map(r => <button key={r} type="button" className={r === rate ? "active" : ""} onClick={() => setRate(r)}>{r}×</button>)}
            </div>
          )}
          {panel === "sleep" && (
            <div className="abPanel abChips">
              {SLEEP_OPTIONS.map(m => <button key={m} type="button" onClick={() => { onSleep({ type: "time", endsAt: Date.now() + m * 60000 }); setPanel(null); }}>{m} min</button>)}
              {tracks.length > 1 && <button type="button" onClick={() => { onSleep({ type: "chapter" }); setPanel(null); }}>Fim do capítulo</button>}
              {sleep && <button type="button" className="danger" onClick={() => { onSleep(null); setPanel(null); }}>Desligar</button>}
            </div>
          )}
          {panel === "chapters" && (
            <div className="abPanel abList">
              {tracks.map((t, i) => (
                <button key={t.id} type="button" className={i === trackIdx ? "active" : ""} onClick={() => onGoTrack(i)}>
                  <span className="abListNum">{i + 1}</span>
                  <span className="abListName">{t.name}</span>
                  <small>{fmtClock(t.dur)}</small>
                </button>
              ))}
            </div>
          )}
          {panel === "marks" && (
            <div className="abPanel abList">
              <button type="button" className="abAddMark" onClick={onAddMark}><BookmarkPlus size={15}/> Marcar este ponto ({fmtClock(pos)})</button>
              {marks.length === 0 && <p className="emptyHint">Nenhum marcador ainda.</p>}
              {marks.map(m => (
                <div key={m.id} className="abMarkRow">
                  <button type="button" onClick={() => onJumpMark(m)}>
                    <span className="abListName">{m.note || `Marcador`}</span>
                    <small>{tracks.length > 1 ? `Cap. ${m.track + 1} · ` : ""}{fmtClock(m.pos)}</small>
                  </button>
                  <button type="button" className="abMarkDel" title="Remover" onClick={() => onRemoveMark(m.id)}><Trash2 size={13}/></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AudiobookShelf({ ctl, status }) {
  const { data, curId, playing, live, localIds, hasFiles, generatedCovers } = ctl;
  const [menuId, setMenuId] = useState(null);
  const [q, setQ] = useState("");
  const list = data
    .filter(b => b.status === status)
    .filter(b => !q.trim() || `${b.title} ${b.author || ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const total = data.filter(b => b.status === status).length;

  return (
    <div className="content">
      {total > 6 && (
        <div className="notesSearchBox abSearch"><Search size={15}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por título ou autor"/></div>
      )}
      <div className="shelf" onClick={() => setMenuId(null)}>
        <div className="bookTile addTile" onClick={() => ctl.openForm({ mode: "add", status })}>
          <div className="bookCoverWrap addCover"><Plus size={26}/><span>Adicionar audiolivro</span></div>
        </div>
        {list.map(b => {
          const pr = bookProgress(b, curId === b.id ? live : null);
          const isCur = curId === b.id;
          const files = hasFiles(b);
          return (
            <div className="bookTile abTile" key={b.id}>
              <div className="bookCoverWrap" onClick={() => ctl.openBook(b, { expand: true })}>
                <AbCover book={b} generated={generatedCovers}/>
                <div className={"abCoverPlay" + (isCur && playing ? " on" : "")}>{isCur && playing ? <Pause size={22}/> : <Play size={22}/>}</div>
                {!files && localIds[b.id] !== undefined && <span className="abNoFile" title="Os arquivos não estão neste aparelho"><HardDrive size={11}/> sem arquivo</span>}
              </div>
              <button className="bookMenuBtn" onClick={(e) => { e.stopPropagation(); setMenuId(id => id === b.id ? null : b.id); }}><MoreVertical size={16}/></button>
              {menuId === b.id && (
                <div className="bookMenu" onClick={e => e.stopPropagation()}>
                  {b.status !== "ouvindo" && <button onClick={() => { setMenuId(null); ctl.changeStatus(b, "ouvindo"); }}>{b.status === "ouvido" ? "Ouvir de novo" : "Começar a ouvir"}</button>}
                  {b.status !== "ouvido" && <button onClick={() => { setMenuId(null); ctl.changeStatus(b, "ouvido"); }}>Marcar como ouvido</button>}
                  {b.status !== "quero_ouvir" && <button onClick={() => { setMenuId(null); ctl.changeStatus(b, "quero_ouvir"); }}>Mover para "quero ouvir"</button>}
                  <button onClick={() => { setMenuId(null); ctl.openForm({ mode: "edit", book: b }); }}><Pencil size={13}/> Editar</button>
                  {!files && <button onClick={() => { setMenuId(null); ctl.pickFilesFor(b); }}><HardDrive size={13}/> Anexar arquivos neste aparelho</button>}
                  {(localIds[b.id] || 0) > 0 && <button onClick={() => { setMenuId(null); ctl.removeLocal(b); }}><HardDrive size={13}/> Liberar espaço (remover arquivos)</button>}
                  <button className="danger" onClick={() => { setMenuId(null); ctl.deleteBook(b); }}><Trash2 size={13}/> Excluir</button>
                </div>
              )}
              <b className="bookTitle">{b.title}</b>
              {b.author && <small className="abAuthor">{b.author}</small>}
              <div className="progress abProgress"><i style={{ width: pr.pct + "%" }}/></div>
              <small className="bookProgressLabel">{pr.pct}% · {b.status === "ouvido" ? fmtHuman(pr.total) : (pr.total ? `restam ${fmtHuman(pr.left)}` : "—")}</small>
            </div>
          );
        })}
      </div>
      {list.length === 0 && <p className="emptyHint">{q ? "Nada encontrado." : `Nenhum audiolivro em "${STATUS_LABEL[status]}" ainda.`}</p>}
    </div>
  );
}

function AudiobookDashboard({ ctl }) {
  const { data, stats, curId, playing, live, generatedCovers, setPage } = ctl;
  const ouvindo = data.filter(b => b.status === "ouvindo");
  const ouvidos = data.filter(b => b.status === "ouvido").length;
  const quero = data.filter(b => b.status === "quero_ouvir").length;
  const libSeconds = data.reduce((n, b) => n + (b.total_seconds || 0), 0);
  const cur = stats?.current || { seconds: 0, completed: 0 };
  const monthLabel = new Date().toLocaleDateString("pt-BR", { month: "long" });
  const last = [...ouvindo].sort((a, b) => (Date.parse(b.last_played_at || 0) || 0) - (Date.parse(a.last_played_at || 0) || 0))[0];
  const lastPr = last ? bookProgress(last, curId === last.id ? live : null) : null;

  return (
    <div className="content">
      <div className="studyGoalsHead"><div><h2>Meus audiolivros</h2><p>Um resumo rápido da sua biblioteca de áudio.</p></div></div>

      {last && (
        <div className="abHero">
          <div className="abHeroCover"><AbCover book={last} generated={generatedCovers}/></div>
          <div className="abHeroInfo">
            <small>Continuar ouvindo</small>
            <b>{last.title}</b>
            {last.author && <span>{last.author}</span>}
            <div className="abOverall"><i className="abOverallFill" style={{ width: lastPr.pct + "%" }}/></div>
            <span className="abHeroMeta">{lastPr.pct}% · restam {fmtHuman(lastPr.left)}</span>
          </div>
          <button type="button" className="abHeroPlay" onClick={() => ctl.openBook(last, { expand: true })}>
            {curId === last.id && playing ? <Pause size={24}/> : <Play size={24}/>}
          </button>
        </div>
      )}

      <div className="studyStats">
        <div className="studyStat libraryStatClick" onClick={() => setPage("Audiolivros Ouvindo")}>
          <div className="studyStatIcon" style={{ background: "#4c8dff22", color: "#4c8dff" }}><Library size={17}/></div>
          <strong>{data.length}</strong><small>Audiolivros no total</small>
        </div>
        <div className="studyStat libraryStatClick" onClick={() => setPage("Audiolivros Ouvindo")}>
          <div className="studyStatIcon" style={{ background: "#f0b42922", color: "#f0b429" }}><Headphones size={17}/></div>
          <strong>{ouvindo.length}</strong><small>Em andamento</small>
        </div>
        <div className="studyStat libraryStatClick" onClick={() => setPage("Audiolivros Ouvidos")}>
          <div className="studyStatIcon" style={{ background: "#3ecf6a22", color: "#3ecf6a" }}><CheckCircle2 size={17}/></div>
          <strong>{ouvidos}</strong><small>Concluídos</small>
        </div>
        <div className="studyStat libraryStatClick" onClick={() => setPage("Audiolivros Quero Ouvir")}>
          <div className="studyStatIcon" style={{ background: "#a06bff22", color: "#a06bff" }}><Clock3 size={17}/></div>
          <strong>{quero}</strong><small>Para ouvir</small>
        </div>
      </div>

      <div className="studyGoalsListHead"><h3>Este mês ({monthLabel})</h3></div>
      <div className="studyStats">
        <div className="studyStat">
          <div className="studyStatIcon" style={{ background: "#ff9f4322", color: "#ff9f43" }}><Hourglass size={17}/></div>
          <strong>{fmtHuman(cur.seconds)}</strong><small>Tempo ouvido</small>
        </div>
        <div className="studyStat">
          <div className="studyStatIcon" style={{ background: "#3ecf6a22", color: "#3ecf6a" }}><CheckCircle2 size={17}/></div>
          <strong>{cur.completed}</strong><small>Audiolivros concluídos</small>
        </div>
        <div className="studyStat">
          <div className="studyStatIcon" style={{ background: "#4c8dff22", color: "#4c8dff" }}><Headphones size={17}/></div>
          <strong>{fmtHuman(stats?.totalSeconds || 0)}</strong><small>Total ouvido</small>
        </div>
        <div className="studyStat">
          <div className="studyStatIcon" style={{ background: "#a06bff22", color: "#a06bff" }}><Library size={17}/></div>
          <strong>{fmtHuman(libSeconds)}</strong><small>De áudio na biblioteca</small>
        </div>
      </div>

      <div className="studyGoalsListHead"><h3>Ouvindo agora</h3></div>
      {ouvindo.length === 0 && <p className="emptyHint">Nenhum audiolivro em andamento — abra um de "Quero ouvir" e ele aparece aqui sozinho.</p>}
      {ouvindo.length > 0 && (
        <div className="libraryReadingList">
          {ouvindo.map(b => {
            const pr = bookProgress(b, curId === b.id ? live : null);
            return (
              <div className="libraryReadingRow" key={b.id} onClick={() => ctl.openBook(b, { expand: true })}>
                <div className="libraryReadingCover"><AbCover book={b} generated={generatedCovers}/></div>
                <div className="libraryReadingInfo">
                  <b>{b.title}</b>
                  <div className="progress"><i style={{ width: pr.pct + "%" }}/></div>
                  <small>{pr.pct}% · restam {fmtHuman(pr.left)}{b.tracks?.length > 1 ? ` · cap. ${Math.min((b.current_track || 0) + 1, b.tracks.length)} de ${b.tracks.length}` : ""}</small>
                </div>
                <button type="button" className="abRowPlay" title="Continuar"><Play size={16}/></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
