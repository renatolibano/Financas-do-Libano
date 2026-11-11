import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import {
  Music2, Play, Pause, SkipBack, SkipForward, Plus, X, MoreVertical, Trash2, Pencil, ChevronDown, ChevronLeft,
  Shuffle, Repeat, Repeat1, ListMusic, FileText, Search, Link2, Sparkles, Loader2, Check, RefreshCw, ArrowDownToLine, ListPlus,
} from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { hasMediaSession, getMediaSession, makeMediaMetadata } from "./lib/native";
import { usePersistentState } from "./lib/storage";
import { fmtClock, fmtHuman } from "./lib/audiobooks";
import { runNoteAi } from "./lib/noteAi";
import { diffParts, applyParts, joinTokens } from "./lib/textDiff";
import {
  thumbUrl, parseYouTubeUrl, fetchVideoInfo, fetchPlaylistInfo, fetchLrclib, fetchYoutubeCaptions,
  parseLrc, looksLikeLrc, lrcToPlain,
} from "./lib/music";

export const MUSIC_PAGE = "Músicas";
const SOURCE_LABEL = { lrclib: "LRCLIB", youtube: "legenda do YouTube (pode ter erros)", manual: "escrita por você" };

const shuffleArr = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const pauseOtherAudio = () => document.querySelectorAll("audio").forEach(a => { try { if (!a.paused) a.pause(); } catch { /* ignora */ } });
const byOrder = (a, b) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9);

// ---- API do player do YouTube (carregada uma vez) ----
let ytPromise = null;
function loadYT() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytPromise) return ytPromise;
  ytPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { try { prev?.(); } catch { /* ignora */ } resolve(window.YT); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api"; s.async = true;
    s.onerror = () => { ytPromise = null; reject(new Error("Não consegui carregar o player do YouTube (sem internet?).")); };
    document.head.appendChild(s);
  });
  return ytPromise;
}

function useMinWidth(px) {
  const q = `(min-width:${px}px)`;
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener("change", f); f();
    return () => mq.removeEventListener("change", f);
  }, [q]);
  return m;
}

function Thumb({ videoId, className = "" }) {
  return <div className={"muThumb " + className}>{videoId ? <img src={thumbUrl(videoId)} alt="" loading="lazy" draggable={false}/> : <Music2 size={22}/>}</div>;
}

function Mosaic({ list }) {
  const four = list.slice(0, 4);
  if (four.length < 4) return <Thumb videoId={four[0]?.video_id} className="muMosaicOne"/>;
  return <div className="muMosaic">{four.map(t => <Thumb key={t.id} videoId={t.video_id}/>)}</div>;
}

// =====================================================================
// Host: fica sempre montado (como o AudiobookHost), então a música continua tocando ao trocar de aba.
// =====================================================================
export function MusicHost({ page, tracksEntity, playlistsEntity, session }) {
  const tracks = tracksEntity.data, playlists = playlistsEntity.data;
  const userId = session?.user?.id || null;
  const byId = useMemo(() => new Map(tracks.map(t => [t.id, t])), [tracks]);
  const byIdRef = useRef(byId); byIdRef.current = byId;

  const [queue, setQueue] = useState([]);
  const [qIdx, setQIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [panel, setPanel] = useState(null); // null | queue | lyrics
  const [shuffle, setShuffle] = usePersistentState("musicShuffle", false);
  const [repeat, setRepeat] = usePersistentState("musicRepeat", "off"); // off | all | one

  const playerRef = useRef(null), boxRef = useRef(null), readyRef = useRef(false), creatingRef = useRef(false);
  const pendingRef = useRef(null), queueRef = useRef([]), baseRef = useRef([]), qIdxRef = useRef(-1);
  const shuffleRef = useRef(shuffle); shuffleRef.current = shuffle;
  const repeatRef = useRef(repeat); repeatRef.current = repeat;
  const handlersRef = useRef({}), ctlRef = useRef({}), errTokenRef = useRef(0), durFixedRef = useRef(new Set());

  const setQ = (q) => { queueRef.current = q; setQueue(q); };
  const curId = qIdx >= 0 ? queue[qIdx] : null;
  const cur = curId != null ? byId.get(curId) || null : null;

  // ---- player ----
  const ensurePlayer = useCallback(async () => {
    if (playerRef.current || creatingRef.current || !boxRef.current) return;
    creatingRef.current = true;
    try {
      const YT = await loadYT();
      const el = document.createElement("div");
      boxRef.current.appendChild(el);
      const vars = { playsinline: 1, controls: 0, rel: 0, modestbranding: 1, disablekb: 1, fs: 0 };
      if (/^https?:$/.test(window.location.protocol)) vars.origin = window.location.origin;
      playerRef.current = new YT.Player(el, {
        width: "200", height: "200", playerVars: vars,
        events: {
          onReady: (e) => handlersRef.current.onReady?.(e),
          onStateChange: (e) => handlersRef.current.onState?.(e),
          onError: (e) => handlersRef.current.onError?.(e),
        },
      });
    } catch (e) { setErr(e.message || "Não consegui iniciar o player."); }
    finally { creatingRef.current = false; }
  }, []);

  useEffect(() => { if (page === MUSIC_PAGE) ensurePlayer(); }, [page, ensurePlayer]); // já deixa o player pronto, pra tocar no mesmo toque do usuário

  const loadVideo = useCallback((videoId) => {
    const p = playerRef.current;
    if (p && readyRef.current) { try { p.loadVideoById(videoId); } catch (e) { console.error(e); } }
    else { pendingRef.current = videoId; ensurePlayer(); }
  }, [ensurePlayer]);

  const playIndex = useCallback((i, q = queueRef.current) => {
    const t = byIdRef.current.get(q[i]);
    if (!t) return;
    qIdxRef.current = i; setQIdx(i); setPos(0); setDur(t.duration || 0); setErr("");
    errTokenRef.current++;
    pauseOtherAudio();
    loadVideo(t.video_id);
  }, [loadVideo]);

  const startQueue = (ids, startId, opts = {}) => {
    if (!ids.length) return;
    const sh = opts.shuffle ?? shuffleRef.current;
    baseRef.current = ids;
    let q = ids, i = Math.max(0, ids.indexOf(startId));
    if (sh) {
      const first = ids.includes(startId) ? startId : null;
      const rest = shuffleArr(ids.filter(x => x !== first));
      q = first != null ? [first, ...rest] : rest; i = 0;
    }
    if (sh !== shuffleRef.current) setShuffle(sh);
    setQ(q); playIndex(i, q);
  };

  const toggleShuffle = () => {
    const next = !shuffleRef.current; setShuffle(next);
    const now = queueRef.current[qIdxRef.current];
    if (now == null) return;
    const base = baseRef.current.length ? baseRef.current : queueRef.current;
    let q, i;
    if (next) { q = [now, ...shuffleArr(base.filter(x => x !== now))]; i = 0; }
    else { q = base.includes(now) ? base : queueRef.current; i = q.indexOf(now); }
    setQ(q); qIdxRef.current = i; setQIdx(i);
  };

  const playNext = (id) => {
    if (!queueRef.current.length) { startQueue([id], id); return; }
    const now = queueRef.current[qIdxRef.current];
    if (id === now) return;
    const q = queueRef.current.filter(x => x !== id);
    const cIdx = q.indexOf(now);
    q.splice(cIdx + 1, 0, id);
    baseRef.current = baseRef.current.filter(x => x !== id).concat(id);
    setQ(q); qIdxRef.current = cIdx; setQIdx(cIdx);
  };

  const next = (auto = false) => {
    const q = queueRef.current, i = qIdxRef.current;
    if (!q.length) return;
    let n = i + 1;
    if (n >= q.length) {
      if (repeatRef.current === "all" || (!auto && q.length > 1)) n = 0;
      else { setPlaying(false); return; }
    }
    playIndex(n);
  };
  const prev = () => {
    const p = playerRef.current;
    const t = p?.getCurrentTime ? p.getCurrentTime() : 0;
    if (t > 4 || qIdxRef.current <= 0) { seekTo(0); return; }
    playIndex(qIdxRef.current - 1);
  };
  const seekTo = (sec) => {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    try { p.seekTo(Math.max(0, sec), true); setPos(Math.max(0, sec)); } catch (e) { console.error(e); }
  };
  const togglePlay = () => {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    const st = p.getPlayerState?.();
    if (st === 1 || st === 3) p.pauseVideo(); else { pauseOtherAudio(); p.playVideo(); }
  };
  const closePlayer = () => {
    errTokenRef.current++;
    try { playerRef.current?.stopVideo?.(); } catch { /* ignora */ }
    pendingRef.current = null;
    setQ([]); baseRef.current = []; qIdxRef.current = -1; setQIdx(-1);
    setPlaying(false); setExpanded(false); setPanel(null); setPos(0); setDur(0); setErr("");
  };
  const cycleRepeat = () => setRepeat(r => (r === "off" ? "all" : r === "all" ? "one" : "off"));

  handlersRef.current = {
    onReady: () => {
      readyRef.current = true;
      if (pendingRef.current) { const v = pendingRef.current; pendingRef.current = null; try { playerRef.current.loadVideoById(v); } catch (e) { console.error(e); } }
    },
    onState: (e) => {
      const p = playerRef.current;
      if (e.data === 1) {
        setPlaying(true); setErr("");
        const d = p?.getDuration?.() || 0;
        if (d > 0) {
          setDur(d);
          const t = byIdRef.current.get(queueRef.current[qIdxRef.current]);
          if (t && !t.duration && !durFixedRef.current.has(t.id)) { durFixedRef.current.add(t.id); tracksEntity.update(t.id, { duration: Math.round(d) }); }
        }
        pauseOtherAudio();
      } else if (e.data === 2) setPlaying(false);
      else if (e.data === 0) {
        setPlaying(false);
        if (repeatRef.current === "one") { try { p.seekTo(0, true); p.playVideo(); } catch { /* ignora */ } }
        else next(true);
      }
    },
    onError: (e) => {
      const code = e?.data, token = ++errTokenRef.current;
      setPlaying(false);
      setErr(code === 101 || code === 150 ? "O dono do vídeo não permite tocar fora do YouTube." : code === 100 ? "Vídeo indisponível ou privado." : "Não consegui tocar este vídeo.");
      if (queueRef.current.length > 1) setTimeout(() => { if (errTokenRef.current === token) next(true); }, 2200);
    },
  };
  ctlRef.current = { startQueue, playNext, togglePlay, closePlayer };

  // posição (a cada 0,5 s só enquanto toca)
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const p = playerRef.current;
      if (p?.getCurrentTime) { setPos(p.getCurrentTime() || 0); const d = p.getDuration?.(); if (d > 0) setDur(d); }
    }, 500);
    return () => clearInterval(id);
  }, [playing]);

  // se algum áudio (audiolivro) começar a tocar, a música pausa
  useEffect(() => {
    const f = (e) => { if (e.target?.tagName === "AUDIO") { try { playerRef.current?.pauseVideo?.(); } catch { /* ignora */ } } };
    document.addEventListener("play", f, true);
    return () => document.removeEventListener("play", f, true);
  }, []);

  // faixa apagada enquanto tocava
  useEffect(() => { if (curId != null && !cur) closePlayer(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [curId, cur]);

  // controles na tela de bloqueio / fones
  useEffect(() => {
    if (!hasMediaSession() || !cur) return;
    const ms = getMediaSession();
    try {
      ms.metadata = makeMediaMetadata({ title: cur.title, artist: cur.artist || "Música", album: "Músicas", artwork: [{ src: thumbUrl(cur.video_id), sizes: "480x360", type: "image/jpeg" }] });
      ms.setActionHandler("play", () => ctlRef.current.togglePlay());
      ms.setActionHandler("pause", () => ctlRef.current.togglePlay());
      ms.setActionHandler("previoustrack", () => prev());
      ms.setActionHandler("nexttrack", () => next(false));
      ms.setActionHandler("seekto", (d) => { if (d.seekTime != null) seekTo(d.seekTime); });
    } catch { /* navegador sem suporte completo */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id, playing]);
  useEffect(() => {
    if (!hasMediaSession() || !cur) return;
    try { getMediaSession().playbackState = playing ? "playing" : "paused"; } catch { /* ignora */ }
  }, [playing, cur?.id]);

  // ---- cadastro (músicas / playlists) ----
  const cloud = !!tracksEntity.cloud;
  const nextOrder = (list) => list.reduce((n, t) => Math.max(n, (t.sort_order ?? -1) + 1), 0);

  const addTrack = async (row) => {
    const sameList = tracks.filter(t => (t.playlist_id || null) === (row.playlist_id || null));
    const inserted = await tracksEntity.add({ ...row, sort_order: row.playlist_id ? nextOrder(sameList) : null });
    if (cloud && !inserted) throw new Error("Não foi possível salvar a música.");
  };

  const bulkInsert = async (rows) => {
    if (cloud) {
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100).map(r => ({ ...r, user_id: userId }));
        const { error } = await supabase.from("music_tracks").insert(chunk);
        if (error) throw new Error("Não foi possível salvar as músicas: " + error.message);
      }
      await tracksEntity.refresh();
    } else {
      for (const r of rows) await tracksEntity.add(r);
    }
  };

  const importPlaylist = async ({ title, listId, items }) => {
    const plId = crypto.randomUUID();
    const ins = await playlistsEntity.add({ id: plId, title, source_list_id: listId, sort_order: nextOrder(playlists) });
    if (cloud && !ins) throw new Error("Não foi possível criar a playlist.");
    await bulkInsert(items.map((it, i) => ({
      id: crypto.randomUUID(), playlist_id: plId, video_id: it.videoId, title: it.title, artist: it.artist || null, duration: it.duration || 0, sort_order: i,
    })));
  };

  const refreshPlaylist = async (pl) => {
    const r = await fetchPlaylistInfo(pl.source_list_id);
    if (r.error) { alert(r.error); return; }
    const have = new Set(tracks.filter(t => t.playlist_id === pl.id).map(t => t.video_id));
    const fresh = r.items.filter(it => !have.has(it.videoId));
    if (!fresh.length) { alert("A playlist já está atualizada."); return; }
    let n = nextOrder(tracks.filter(t => t.playlist_id === pl.id));
    try {
      await bulkInsert(fresh.map(it => ({ id: crypto.randomUUID(), playlist_id: pl.id, video_id: it.videoId, title: it.title, artist: it.artist || null, duration: it.duration || 0, sort_order: n++ })));
      alert(`${fresh.length} música(s) nova(s) adicionada(s).`);
    } catch (e) { alert(e.message); }
  };

  const deletePlaylist = async (pl) => {
    const mine = tracks.filter(t => t.playlist_id === pl.id);
    if (!window.confirm(`Excluir a playlist "${pl.title}" e suas ${mine.length} música(s)?`)) return false;
    if (mine.some(t => t.id === curId)) closePlayer();
    if (cloud) { await playlistsEntity.remove(pl.id); await tracksEntity.refresh(); }
    else { for (const t of mine) await tracksEntity.remove(t.id); await playlistsEntity.remove(pl.id); }
    return true;
  };

  const deleteTrack = async (t) => {
    if (!window.confirm(`Excluir "${t.title}"?`)) return;
    if (t.id === curId) closePlayer();
    else {
      const q = queueRef.current, now = q[qIdxRef.current];
      const nq = q.filter(x => x !== t.id), ni = nq.indexOf(now);
      baseRef.current = baseRef.current.filter(x => x !== t.id);
      setQ(nq); qIdxRef.current = ni; setQIdx(ni);
    }
    await tracksEntity.remove(t.id);
  };

  const saveLyrics = (id, patch) => tracksEntity.update(id, patch);

  // Ações estáveis para a biblioteca (não re-renderiza a cada 0,5 s do relógio)
  const actions = useMemo(() => ({
    play: (ids, id, o) => ctlRef.current.startQueue(ids, id, o),
    playNext: (id) => ctlRef.current.playNext(id),
    toggle: () => ctlRef.current.togglePlay(),
    addTrack: (r) => ctlRef.current.addTrack(r),
    importPlaylist: (r) => ctlRef.current.importPlaylist(r),
    refreshPlaylist: (p) => ctlRef.current.refreshPlaylist(p),
    deletePlaylist: (p) => ctlRef.current.deletePlaylist(p),
    deleteTrack: (t) => ctlRef.current.deleteTrack(t),
    updateTrack: (id, patch) => ctlRef.current.updateTrack(id, patch),
    renamePlaylist: (id, title) => ctlRef.current.renamePlaylist(id, title),
    openLyrics: (id) => ctlRef.current.openLyrics(id),
  }), []);
  ctlRef.current = {
    ...ctlRef.current, addTrack, importPlaylist, refreshPlaylist, deletePlaylist, deleteTrack,
    updateTrack: (id, patch) => tracksEntity.update(id, patch),
    renamePlaylist: (id, title) => playlistsEntity.update(id, { title }),
    openLyrics: (id) => {
      const i = queueRef.current.indexOf(id);
      if (i < 0) startQueue([id], id);
      else if (i !== qIdxRef.current) playIndex(i);
      setPanel("lyrics"); setExpanded(true);
    },
  };

  const queueTracks = queue.map(id => byId.get(id)).filter(Boolean);

  return (
    <>
      {page === MUSIC_PAGE && (
        <MusicLibrary tracks={tracks} playlists={playlists} curId={curId} playing={playing} actions={actions} loading={tracksEntity.loading || playlistsEntity.loading}/>
      )}

      <div ref={boxRef} className="muPlayerBox" aria-hidden="true"/>

      {cur && !expanded && (
        <MiniBar track={cur} pos={pos} dur={dur} playing={playing} err={err}
          onToggle={togglePlay} onPrev={prev} onNext={() => next(false)} onExpand={() => setExpanded(true)} onClose={closePlayer}/>
      )}
      {cur && expanded && (
        <FullPlayer
          track={cur} queueTracks={queueTracks} qIdx={qIdx} pos={pos} dur={dur} playing={playing} err={err}
          shuffle={shuffle} repeat={repeat} panel={panel} setPanel={setPanel}
          onToggle={togglePlay} onPrev={prev} onNext={() => next(false)} onSeek={seekTo} onShuffle={toggleShuffle} onRepeat={cycleRepeat}
          onJump={(i) => playIndex(i)} onCollapse={() => setExpanded(false)} onClose={closePlayer}
          fetchFull={tracksEntity.fetchFull} onSaveLyrics={saveLyrics}/>
      )}
      {cur && !expanded && <div style={{ height: 84 }}/>}
    </>
  );
}

// =====================================================================
// Pop-up do player (aparece em qualquer aba)
// =====================================================================
function MiniBar({ track, pos, dur, playing, err, onToggle, onPrev, onNext, onExpand, onClose }) {
  const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
  return (
    <div className="abMini muMini">
      <div className="abMiniProg"><i style={{ width: pct + "%" }}/></div>
      <button type="button" className="abMiniCover" onClick={onExpand}><Thumb videoId={track.video_id}/></button>
      <button type="button" className="abMiniInfo" onClick={onExpand}>
        <b>{track.title}</b>
        <small className={err ? "muErrText" : ""}>{err || `${track.artist ? track.artist + " · " : ""}${fmtClock(pos)} / ${fmtClock(dur)}`}</small>
      </button>
      <div className="abMiniBtns">
        <button type="button" className="muMiniBtn" title="Anterior" onClick={onPrev}><SkipBack size={19}/></button>
        <button type="button" className="abMiniPlay" title={playing ? "Pausar" : "Tocar"} onClick={onToggle}>{playing ? <Pause size={20}/> : <Play size={20}/>}</button>
        <button type="button" className="muMiniBtn" title="Próxima" onClick={onNext}><SkipForward size={19}/></button>
      </div>
      <button type="button" className="abMiniClose" title="Fechar player" onClick={onClose}><X size={16}/></button>
    </div>
  );
}

// =====================================================================
// Player completo (mesmo visual do player dos audiolivros)
// =====================================================================
function FullPlayer({
  track, queueTracks, qIdx, pos, dur, playing, err, shuffle, repeat, panel, setPanel,
  onToggle, onPrev, onNext, onSeek, onShuffle, onRepeat, onJump, onCollapse, onClose, fetchFull, onSaveLyrics,
}) {
  const wide = useMinWidth(900);
  const [lyricsOn, setLyricsOn] = useState(false);
  const lyrics = wide && lyricsOn;
  const sideOpen = lyrics && panel === "queue";
  const toggle = (name) => setPanel(p => (p === name ? null : name));
  const lyricsActive = wide ? lyricsOn : panel === "lyrics";

  // se o painel "Letra" foi pedido de fora (menu da música), liga a coluna da letra no PC
  useEffect(() => { if (wide && panel === "lyrics") { setLyricsOn(true); setPanel(null); } }, [wide, panel, setPanel]);

  const queuePanel = (
    <div className="abPanel abList">
      {queueTracks.map((t, i) => (
        <button key={t.id} type="button" className={i === qIdx ? "active" : ""} onClick={() => onJump(i)}>
          <span className="abListNum">{i + 1}</span>
          <span className="abListName">{t.title}{t.artist ? ` — ${t.artist}` : ""}</span>
          <small>{fmtClock(t.duration)}</small>
        </button>
      ))}
    </div>
  );
  const lyricsEl = <MusicLyrics wide={wide} track={track} pos={pos} onSeek={onSeek} onSave={onSaveLyrics} fetchFull={fetchFull}/>;

  return (
    <div className="abFullBack">
      <div className={"abFull" + (lyrics ? " lyrics" : "")}>
        <div className="abFullTop">
          <button type="button" onClick={onCollapse} title="Minimizar"><ChevronDown size={22}/></button>
          <span>Tocando agora</span>
          <button type="button" onClick={onClose} title="Fechar player"><X size={20}/></button>
        </div>
        {lyrics && <div className="abLyricsCol">{lyricsEl}</div>}
        <div className="abFullScroll">
          {sideOpen ? (
            <div className="abSidePanel">
              <div className="abSideHead">
                <button type="button" onClick={() => setPanel(null)}><ChevronLeft size={16}/> Voltar</button>
                <b>Fila</b>
              </div>
              {queuePanel}
            </div>
          ) : (<>
            <div className="abFullCover"><Thumb videoId={track.video_id} className="muFullThumb"/></div>
            <div className="abFullTitles">
              <h2>{track.title}</h2>
              {track.artist && <p>{track.artist}</p>}
              {queueTracks.length > 1 && <small>Faixa {qIdx + 1} de {queueTracks.length}</small>}
            </div>
            {err && <div className="abNotice err"><span>{err}</span></div>}

            <div className="abSeekRow">
              <span>{fmtClock(pos)}</span>
              <MuSeek value={pos} max={dur} onCommit={onSeek}/>
              <span>-{fmtClock(Math.max(0, dur - pos))}</span>
            </div>

            <div className="abControls">
              <button type="button" className={"muToggle" + (shuffle ? " on" : "")} title="Aleatório" onClick={onShuffle}><Shuffle size={20}/></button>
              <button type="button" title="Anterior" onClick={onPrev}><SkipBack size={24}/></button>
              <button type="button" className="abPlayBig" title={playing ? "Pausar" : "Tocar"} onClick={onToggle}>{playing ? <Pause size={30}/> : <Play size={30}/>}</button>
              <button type="button" title="Próxima" onClick={onNext}><SkipForward size={24}/></button>
              <button type="button" className={"muToggle" + (repeat !== "off" ? " on" : "")} title={repeat === "one" ? "Repetir esta música" : repeat === "all" ? "Repetir a fila" : "Repetir desligado"} onClick={onRepeat}>
                {repeat === "one" ? <Repeat1 size={20}/> : <Repeat size={20}/>}
              </button>
            </div>

            <div className="abTools">
              <button type="button" className={lyricsActive ? "active" : ""} onClick={() => (wide ? setLyricsOn(v => !v) : toggle("lyrics"))}><FileText size={16}/> Letra</button>
              <button type="button" className={panel === "queue" ? "active" : ""} onClick={() => toggle("queue")}><ListMusic size={16}/> Fila ({queueTracks.length})</button>
            </div>
          </>)}
          {!sideOpen && panel === "queue" && queuePanel}
          {!wide && panel === "lyrics" && lyricsEl}
        </div>
      </div>
    </div>
  );
}

function MuSeek({ value, max, onCommit }) {
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

// =====================================================================
// Letra: busca automática (LRCLIB / legenda do YouTube), colar/escrever e "Corrigir com IA"
// =====================================================================
function MusicLyrics({ wide, track, pos, onSeek, onSave, fetchFull }) {
  const id = track.id;
  const [mode, setMode] = useState("view"); // view | edit | review
  const [draft, setDraft] = useState("");
  const [parts, setParts] = useState([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [follow, setFollow] = useState(true);
  const [loaded, setLoaded] = useState(track.lyrics !== undefined);
  const triedRef = useRef(new Set());
  const tokenRef = useRef(0);
  const listRef = useRef(null);
  const has = !!(track.lyrics || track.lyrics_synced);

  const autoFind = async () => {
    const token = ++tokenRef.current;
    setBusy("Buscando a letra…"); setMsg("");
    let r = await fetchLrclib({ title: track.title, artist: track.artist, duration: track.duration });
    if (tokenRef.current !== token) return;
    if (!r) { setBusy("Procurando legenda no YouTube…"); r = await fetchYoutubeCaptions(track.video_id); }
    if (tokenRef.current !== token) return;
    setBusy("");
    if (r) await onSave(id, r);
    else { await onSave(id, { lyrics_source: "none" }); setMsg("Não encontrei a letra automaticamente. Toque em “Colar / escrever letra”."); }
  };

  useEffect(() => {
    tokenRef.current++;
    setMode("view"); setMsg(""); setFollow(true); setBusy(""); setLoaded(track.lyrics !== undefined);
    if (track.lyrics !== undefined) return undefined;
    let alive = true;
    Promise.resolve(fetchFull(id)).catch(() => {}).finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!loaded || has || mode !== "view" || track.lyrics_source === "none" || triedRef.current.has(id)) return;
    triedRef.current.add(id);
    autoFind();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, id, has]);

  const lines = useMemo(() => (track.lyrics_synced ? parseLrc(track.lyrics_synced) : []), [track.lyrics_synced]);
  const synced = lines.length > 0;
  const plain = useMemo(() => String(track.lyrics || "").split(/\r?\n/), [track.lyrics]);

  const active = useMemo(() => {
    let lo = 0, hi = lines.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].s <= pos + 0.35) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }, [lines, pos]);

  useEffect(() => {
    if (!follow || active < 0 || mode !== "view") return;
    const box = listRef.current, el = box?.children[active];
    if (box && el) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  }, [active, follow, mode]);

  const startEdit = () => { setDraft(track.lyrics_synced || track.lyrics || ""); setMsg(""); setMode("edit"); };
  const commit = async (text) => {
    const t = String(text || "").trim();
    if (!t) await onSave(id, { lyrics: null, lyrics_synced: null, lyrics_source: "none" });
    else if (looksLikeLrc(t)) await onSave(id, { lyrics: lrcToPlain(t), lyrics_synced: t, lyrics_source: "manual" });
    else await onSave(id, { lyrics: t, lyrics_synced: null, lyrics_source: "manual" });
    setMode("view"); setMsg("");
  };
  const searchAgain = () => {
    if (has && !window.confirm("Buscar de novo substitui a letra atual. Continuar?")) return;
    triedRef.current.add(id);
    autoFind();
  };

  const fixAi = async () => {
    const original = draft.trim();
    if (!original) return;
    const token = ++tokenRef.current;
    setBusy("Corrigindo com a IA…"); setMsg("");
    const who = `"${String(track.title).slice(0, 60)}"${track.artist ? ` de ${String(track.artist).slice(0, 40)}` : ""}`;
    const instruction = `Esta é a letra da música ${who}, possivelmente com erros de legenda automática. Corrija só palavras mal reconhecidas, grafia e pontuação. Mantenha as quebras de linha e os tempos [mm:ss.xx] exatamente. Não traduza nem reescreva. Devolva só a letra.`.slice(0, 500);
    const res = await runNoteAi({ action: "custom", text: original, instruction });
    if (tokenRef.current !== token) return;
    setBusy("");
    if (res.error) { setMsg(res.error); return; }
    const ps = diffParts(original, String(res.result || "").trim());
    if (!ps.some(p => p.type === "change")) { setMsg("A IA não encontrou nada para corrigir."); return; }
    setParts(ps); setMode("review");
  };
  const setState = (pid, state) => setParts(ps => ps.map(p => (p.type === "change" && p.id === pid ? { ...p, state } : p)));
  const setAll = (state) => setParts(ps => ps.map(p => (p.type === "change" ? { ...p, state } : p)));
  const changes = parts.filter(p => p.type === "change");
  const nRej = changes.filter(p => p.state === "rejected").length;
  const applyReview = () => { setDraft(applyParts(parts)); setMode("edit"); setMsg(`Correções aplicadas (${changes.length - nRej} de ${changes.length}). Revise e salve.`); };
  const lead = (p) => (p.ins[0] || p.del[0])?.sp || "";
  const inner = (toks) => joinTokens(toks).replace(/^\s+/, "");

  const cls = "abPanel abTr muLyrics" + (wide ? " wide" : "");

  if (mode === "edit") {
    return (
      <div className={cls}>
        <textarea className="muLyricsText" autoFocus rows={wide ? 18 : 12} value={draft} onChange={e => { setDraft(e.target.value); setMsg(""); }}
          placeholder={"Cole ou escreva a letra aqui.\n\nDica: se colar uma letra com tempos (ex.: [00:12.30] linha), ela acompanha a música."}/>
        <div className="abQAiRow">
          <button type="button" className="ghost abQAiBtn" onClick={fixAi} disabled={!!busy || !draft.trim()}>
            {busy ? <Loader2 size={14} className="noteAiSpin"/> : <Sparkles size={14}/>} {busy || "Corrigir com IA"}
          </button>
        </div>
        {msg && <small className="abQMsg">{msg}</small>}
        <div className="abQuoteActions">
          <button type="button" className="ghost" onClick={() => setMode("view")}>Cancelar</button>
          <button type="button" className="primary" onClick={() => commit(draft)}>Salvar letra</button>
        </div>
      </div>
    );
  }

  if (mode === "review") {
    return (
      <div className={cls}>
        <div className="abQReviewHead">
          <span>{changes.length} {changes.length === 1 ? "alteração sugerida" : "alterações sugeridas"}{nRej ? ` · ${nRej} recusada${nRej > 1 ? "s" : ""}` : ""}</span>
          <span>
            <button type="button" className="ghost" onClick={() => setAll("rejected")}>Recusar todas</button>
            <button type="button" className="ghost" onClick={() => setAll("accepted")}>Aceitar todas</button>
          </span>
        </div>
        <div className="abQReview">
          {parts.map((p, i) => p.type === "same" ? <span key={i}>{p.tok.sp}{p.tok.t}</span> : (
            <span key={i}>
              {lead(p)}
              <span className={"abQChg " + p.state}>
                {p.state === "pending" && <>
                  {p.del.length > 0 && <del>{inner(p.del)}</del>}{p.del.length > 0 && p.ins.length > 0 && " "}
                  {p.ins.length > 0 && <ins>{inner(p.ins)}</ins>}
                </>}
                {p.state === "accepted" && (p.ins.length > 0 ? <ins>{inner(p.ins)}</ins> : <em className="abQNone">removido</em>)}
                {p.state === "rejected" && (p.del.length > 0 ? <span className="abQKept">{inner(p.del)}</span> : <em className="abQNone">sem “{inner(p.ins)}”</em>)}
                <span className="abQChgBtns">
                  {p.state !== "accepted" && <button type="button" title="Aceitar" onClick={() => setState(p.id, "accepted")}><Check size={12}/></button>}
                  {p.state !== "rejected" && <button type="button" title="Recusar" onClick={() => setState(p.id, "rejected")}><X size={12}/></button>}
                </span>
              </span>
            </span>
          ))}
        </div>
        <small className="abQMsg">Riscado = como estava · verde = sugestão da IA. Alterações que você não decidir serão aplicadas.</small>
        <div className="abQuoteActions">
          <button type="button" className="ghost" onClick={() => setMode("edit")}>Cancelar revisão</button>
          <button type="button" className="primary" onClick={applyReview}>Aplicar</button>
        </div>
      </div>
    );
  }

  return (
    <div className={cls}>
      <div className="abTrActions">
        <button type="button" className="ghost" onClick={startEdit} disabled={!!busy}><Pencil size={14}/> {has ? "Editar letra" : "Colar / escrever letra"}</button>
        <button type="button" className="ghost" onClick={searchAgain} disabled={!!busy}><RefreshCw size={14}/> {has ? "Buscar de novo" : "Buscar automaticamente"}</button>
      </div>
      {busy && <div className="muBusyLine"><Loader2 size={15} className="noteAiSpin"/> {busy}</div>}
      {!busy && !loaded && <div className="muBusyLine"><Loader2 size={15} className="noteAiSpin"/> Carregando…</div>}
      {!busy && loaded && !has && <p className="emptyHint">{msg || "Esta música ainda não tem letra."}</p>}
      {has && (
        <>
          {synced && !follow && <button type="button" className="abTrFollow" onClick={() => setFollow(true)}><ArrowDownToLine size={13}/> Acompanhar música</button>}
          <div className={"abTrList" + (synced ? "" : " plain")} ref={listRef}
            onWheel={() => synced && setFollow(false)} onTouchMove={() => synced && setFollow(false)}>
            {synced
              ? lines.map((g, i) => <p key={i} className={i === active ? "on" : i < active ? "past" : ""} onClick={() => onSeek(g.s)}>{g.t}</p>)
              : plain.map((l, i) => (l.trim() ? <p key={i}>{l}</p> : <p key={i} className="muGap"/>))}
          </div>
          <small className="abTrHint">
            {synced ? "Toque numa linha para ir até ela. " : ""}Fonte: {SOURCE_LABEL[track.lyrics_source] || "—"}.
            {track.lyrics_source === "youtube" ? " Use “Editar letra” › “Corrigir com IA” para acertar erros." : ""}
          </small>
        </>
      )}
    </div>
  );
}

// =====================================================================
// Biblioteca (página da aba)
// =====================================================================
const MusicLibrary = memo(function MusicLibrary({ tracks, playlists, curId, playing, actions, loading }) {
  const [view, setView] = useState("tracks"); // tracks | playlists
  const [openPl, setOpenPl] = useState(null);
  const [q, setQ] = useState("");
  const [menuId, setMenuId] = useState(null);
  const [plMenu, setPlMenu] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { if (!menuId && !plMenu) return undefined; const f = () => { setMenuId(null); setPlMenu(false); }; window.addEventListener("click", f); return () => window.removeEventListener("click", f); }, [menuId, plMenu]);

  const pl = openPl ? playlists.find(p => p.id === openPl) : null;
  useEffect(() => { if (openPl && !pl && !loading) setOpenPl(null); }, [openPl, pl, loading]);

  const plTracks = useCallback((plId) => tracks.filter(t => t.playlist_id === plId).sort(byOrder), [tracks]);
  const loose = useMemo(() => tracks.filter(t => !t.playlist_id).reverse(), [tracks]);
  const needle = q.trim().toLowerCase();
  const found = useMemo(() => (needle ? tracks.filter(t => `${t.title} ${t.artist || ""}`.toLowerCase().includes(needle)) : []), [tracks, needle]);
  const currentList = needle ? found : pl ? plTracks(pl.id) : loose;
  const ids = currentList.map(t => t.id);
  const totalSec = currentList.reduce((n, t) => n + (t.duration || 0), 0);

  const renderRow = (t) => {
    const isCur = curId === t.id;
    return (
      <div key={t.id} className={"muRow" + (isCur ? " cur" : "")}>
        <button type="button" className="muRowMain" onClick={() => (isCur ? actions.toggle() : actions.play(ids, t.id))}>
          <div className="muRowThumb">
            <Thumb videoId={t.video_id}/>
            <span className={"muRowPlay" + (isCur && playing ? " on" : "")}>{isCur && playing ? <Pause size={18}/> : <Play size={18}/>}</span>
          </div>
          <div className="muRowInfo"><b>{t.title}</b><small>{t.artist || "—"}</small></div>
          <span className="muRowDur">{t.duration ? fmtClock(t.duration) : ""}</span>
        </button>
        <div className="muRowMenuWrap">
          <button type="button" className="muIconBtn" title="Mais opções" onClick={(e) => { e.stopPropagation(); setPlMenu(false); setMenuId(m => (m === t.id ? null : t.id)); }}><MoreVertical size={17}/></button>
          {menuId === t.id && (
            <div className="bookMenu muMenu" onClick={e => e.stopPropagation()}>
              <button onClick={() => { setMenuId(null); actions.playNext(t.id); }}><ListPlus size={13}/> Tocar a seguir</button>
              <button onClick={() => { setMenuId(null); actions.openLyrics(t.id); }}><FileText size={13}/> Letra</button>
              <button onClick={() => { setMenuId(null); setEditing(t); }}><Pencil size={13}/> Editar / mover</button>
              {pl && <button onClick={() => { setMenuId(null); actions.updateTrack(t.id, { playlist_id: null }); }}>Tirar da playlist</button>}
              <button className="danger" onClick={() => { setMenuId(null); actions.deleteTrack(t); }}><Trash2 size={13}/> Excluir</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const addBtn = <button type="button" className="primary muAddBtn" onClick={() => setAddOpen(true)}><Plus size={16}/> Adicionar</button>;

  return (
    <div className="content muPage">
      {!pl && (
        <div className="studyGoalsHead muHead">
          <div><h2>Minhas músicas</h2><p>Cole o link de uma música ou playlist do YouTube / YouTube Music.</p></div>
          {addBtn}
        </div>
      )}

      {pl ? (
        <div className="muPlHero">
          <button type="button" className="muBack" onClick={() => { setOpenPl(null); setQ(""); }}><ChevronLeft size={16}/> Playlists</button>
          <div className="muPlHeroBody">
            <div className="muPlHeroCover"><Mosaic list={plTracks(pl.id)}/></div>
            <div className="muPlHeroInfo">
              <h2>{pl.title}</h2>
              <small>{plTracks(pl.id).length} música(s){totalSec ? ` · ${fmtHuman(totalSec)}` : ""}</small>
              <div className="muPlHeroBtns">
                <button type="button" className="primary" disabled={!ids.length} onClick={() => actions.play(ids, ids[0], { shuffle: false })}><Play size={16}/> Tocar</button>
                <button type="button" className="ghost muShufBtn" disabled={!ids.length} onClick={() => actions.play(ids, null, { shuffle: true })}><Shuffle size={15}/> Aleatório</button>
                <button type="button" className="ghost muShufBtn" onClick={() => setAddOpen(true)}><Plus size={15}/> Adicionar</button>
                <div className="muRowMenuWrap">
                  <button type="button" className="muIconBtn" title="Opções da playlist" onClick={(e) => { e.stopPropagation(); setMenuId(null); setPlMenu(m => !m); }}><MoreVertical size={18}/></button>
                  {plMenu && (
                    <div className="bookMenu muMenu" onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setPlMenu(false); const n = window.prompt("Nome da playlist:", pl.title); if (n && n.trim()) actions.renamePlaylist(pl.id, n.trim()); }}><Pencil size={13}/> Renomear</button>
                      {pl.source_list_id && <button onClick={() => { setPlMenu(false); actions.refreshPlaylist(pl); }}><RefreshCw size={13}/> Atualizar do YouTube</button>}
                      <button className="danger" onClick={async () => { setPlMenu(false); if (await actions.deletePlaylist(pl)) setOpenPl(null); }}><Trash2 size={13}/> Excluir playlist</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="muToolbar">
          <div className="muSeg">
            <button type="button" className={view === "tracks" && !needle ? "active" : ""} onClick={() => { setView("tracks"); setQ(""); }}>Músicas ({loose.length})</button>
            <button type="button" className={view === "playlists" && !needle ? "active" : ""} onClick={() => { setView("playlists"); setQ(""); }}>Playlists ({playlists.length})</button>
          </div>
          {tracks.length > 0 && <div className="notesSearchBox muSearch"><Search size={15}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar música ou artista"/></div>}
        </div>
      )}

      {/* Lista de músicas (soltas, de uma playlist ou resultado da busca) */}
      {(pl || view === "tracks" || needle) && (
        <>
          {!pl && ids.length > 0 && (
            <div className="muListBtns">
              <button type="button" className="ghost" onClick={() => actions.play(ids, ids[0], { shuffle: false })}><Play size={14}/> Tocar tudo</button>
              <button type="button" className="ghost" onClick={() => actions.play(ids, null, { shuffle: true })}><Shuffle size={14}/> Aleatório</button>
            </div>
          )}
          <div className="muList">{currentList.map(renderRow)}</div>
          {currentList.length === 0 && !loading && (
            <p className="emptyHint">{needle ? "Nada encontrado." : pl ? "Esta playlist está vazia. Toque em “Adicionar”." : "Nenhuma música solta ainda. Toque em “Adicionar” e cole um link do YouTube."}</p>
          )}
        </>
      )}

      {/* Grade de playlists */}
      {!pl && view === "playlists" && !needle && (
        <>
          <div className="muPlGrid">
            {playlists.map(p => {
              const list = plTracks(p.id);
              return (
                <button type="button" key={p.id} className="muPlCard" onClick={() => setOpenPl(p.id)}>
                  <div className="muPlCardCover"><Mosaic list={list}/></div>
                  <b>{p.title}</b>
                  <small>{list.length} música(s)</small>
                </button>
              );
            })}
          </div>
          {playlists.length === 0 && !loading && <p className="emptyHint">Nenhuma playlist ainda. Cole o link de uma playlist pública do YouTube em “Adicionar” para importar.</p>}
        </>
      )}

      {addOpen && <MusicAddModal playlists={playlists} defaultPlaylistId={pl?.id || null} onClose={() => setAddOpen(false)} onAddTrack={actions.addTrack} onImportPlaylist={actions.importPlaylist}/>}
      {editing && <MusicEditModal track={editing} playlists={playlists} onClose={() => setEditing(null)} onSave={(patch) => { actions.updateTrack(editing.id, patch); setEditing(null); }}/>}
    </div>
  );
});

// =====================================================================
// Modais
// =====================================================================
function MusicAddModal({ playlists, defaultPlaylistId, onClose, onAddTrack, onImportPlaylist }) {
  const [link, setLink] = useState("");
  const [parsed, setParsed] = useState(null);
  const [mode, setMode] = useState("video"); // video | playlist
  const [vInfo, setVInfo] = useState(null);
  const [pInfo, setPInfo] = useState(null);
  const [dest, setDest] = useState(defaultPlaylistId || "none");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const fetchFor = async (p, m) => {
    setBusy(true); setErr("");
    if (m === "video") {
      const r = await fetchVideoInfo(p.videoId);
      if (r.error && !r.title) { setErr(r.error); setVInfo({ title: "", artist: "", duration: 0 }); } else setVInfo(r);
    } else {
      const r = await fetchPlaylistInfo(p.listId);
      if (r.error) setErr(r.error); else setPInfo({ title: r.title, items: r.items });
    }
    setBusy(false);
  };

  const lookup = async (text = link) => {
    setErr(""); setVInfo(null); setPInfo(null);
    const p = parseYouTubeUrl(text);
    if (!p) { setParsed(null); setErr("Esse link não parece ser do YouTube ou do YouTube Music."); return; }
    setParsed(p);
    const m = p.listId && !p.videoId ? "playlist" : "video";
    setMode(m);
    await fetchFor(p, m);
  };
  const switchMode = (m) => {
    setMode(m); setErr("");
    if (m === "video" && !vInfo) fetchFor(parsed, "video");
    if (m === "playlist" && !pInfo) fetchFor(parsed, "playlist");
  };

  const info = mode === "video" ? vInfo : pInfo;
  const canSave = !busy && !saving && info && (mode === "video" ? vInfo.title.trim() : pInfo.items.length > 0 && pInfo.title.trim());
  const save = async () => {
    setSaving(true); setErr("");
    try {
      if (mode === "video") await onAddTrack({ video_id: parsed.videoId, title: vInfo.title.trim(), artist: vInfo.artist.trim() || null, duration: vInfo.duration || 0, playlist_id: dest === "none" ? null : dest });
      else await onImportPlaylist({ title: pInfo.title.trim(), listId: parsed.listId, items: pInfo.items });
      onClose();
    } catch (e) { setErr(e.message || "Não foi possível salvar."); setSaving(false); }
  };

  return (
    <div className="modalBack" onClick={saving ? undefined : onClose}>
      <div className="modal muModal" onClick={e => e.stopPropagation()}>
        <div className="modalHead"><h2>Adicionar música</h2><button type="button" onClick={onClose} disabled={saving}><X/></button></div>
        <label>Link do YouTube / YouTube Music
          <div className="muLinkRow">
            <input autoFocus value={link} placeholder="https://music.youtube.com/watch?v=…" onChange={e => setLink(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") lookup(); }}
              onPaste={e => { const t = e.clipboardData?.getData("text"); if (t) setTimeout(() => lookup(t), 0); }}/>
            <button type="button" className="ghost" onClick={() => lookup()} disabled={busy || !link.trim()}>{busy ? <Loader2 size={14} className="noteAiSpin"/> : <Link2 size={14}/>} Buscar</button>
          </div>
        </label>
        <small className="muHint">Música solta ou playlist <b>pública</b> (a playlist inteira é importada e organizada aqui).</small>

        {parsed?.videoId && parsed?.listId && (
          <div className="muSeg muSegSmall">
            <button type="button" className={mode === "video" ? "active" : ""} onClick={() => switchMode("video")}>Só esta música</button>
            <button type="button" className={mode === "playlist" ? "active" : ""} onClick={() => switchMode("playlist")}>Playlist inteira</button>
          </div>
        )}

        {err && <div className="abNotice err"><span>{err}</span></div>}

        {mode === "video" && vInfo && (
          <>
            <div className="muPreview"><Thumb videoId={parsed.videoId}/><div><small>Confira os dados — você pode corrigir.</small></div></div>
            <label>Título<input value={vInfo.title} onChange={e => setVInfo(v => ({ ...v, title: e.target.value }))}/></label>
            <label>Artista<input value={vInfo.artist} onChange={e => setVInfo(v => ({ ...v, artist: e.target.value }))} placeholder="Opcional (ajuda a achar a letra)"/></label>
            <label>Playlist
              <select value={dest} onChange={e => setDest(e.target.value)}>
                <option value="none">Nenhuma (música solta)</option>
                {playlists.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </label>
          </>
        )}

        {mode === "playlist" && pInfo && (
          <>
            <label>Nome da playlist<input value={pInfo.title} onChange={e => setPInfo(v => ({ ...v, title: e.target.value }))}/></label>
            <div className="muPlPreview">
              <b>{pInfo.items.length} música(s) encontradas</b>
              {pInfo.items.slice(0, 5).map(it => <span key={it.videoId}>{it.title}{it.artist ? ` — ${it.artist}` : ""}</span>)}
              {pInfo.items.length > 5 && <small>e mais {pInfo.items.length - 5}…</small>}
            </div>
          </>
        )}

        <div className="modalActions">
          <button type="button" className="ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="primary" disabled={!canSave} onClick={save}>
            {saving ? <><Loader2 size={15} className="noteAiSpin"/> Salvando…</> : <><Check size={16}/> {mode === "playlist" ? "Importar playlist" : "Salvar"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function MusicEditModal({ track, playlists, onClose, onSave }) {
  const [title, setTitle] = useState(track.title || "");
  const [artist, setArtist] = useState(track.artist || "");
  const [dest, setDest] = useState(track.playlist_id || "none");
  return (
    <div className="modalBack" onClick={onClose}>
      <div className="modal muModal" onClick={e => e.stopPropagation()}>
        <div className="modalHead"><h2>Editar música</h2><button type="button" onClick={onClose}><X/></button></div>
        <label>Título<input value={title} onChange={e => setTitle(e.target.value)}/></label>
        <label>Artista<input value={artist} onChange={e => setArtist(e.target.value)} placeholder="Opcional"/></label>
        <label>Playlist
          <select value={dest} onChange={e => setDest(e.target.value)}>
            <option value="none">Nenhuma (música solta)</option>
            {playlists.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
        <div className="modalActions">
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary" disabled={!title.trim()} onClick={() => onSave({ title: title.trim(), artist: artist.trim() || null, playlist_id: dest === "none" ? null : dest })}><Check size={16}/> Salvar</button>
        </div>
      </div>
    </div>
  );
}
