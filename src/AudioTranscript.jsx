import React, { useState, useEffect, useRef, useMemo, useSyncExternalStore } from "react";
import { Quote, Sparkles, X, Trash2, RefreshCw, ArrowDownToLine } from "lucide-react";
import { usePersistentState } from "./lib/storage";
import { getTranscript, deleteTranscript, getLocalTrackIds } from "./lib/audiobooks";
import {
  WHISPER_MODELS, TRANSCRIBE_LANGS, transcribeSupported, subscribeTranscribe, getTranscribeState,
  transcribeTrack, cancelTranscribe,
} from "./lib/audioTranscribe";
import { runNoteAi } from "./lib/noteAi";

const BUSY = ["queued", "decoding", "loading", "running"];

// Transcrição do capítulo no estilo "letra do Spotify": a frase atual fica destacada, tocar numa
// frase pula o áudio para ela, e selecionar um trecho permite salvar como citação ou pedir à IA.
export default function AudioTranscript({ book, track, trackIdx, pos, onSeek, onAddQuote }) {
  const jobs = useSyncExternalStore(subscribeTranscribe, getTranscribeState);
  const [model, setModel] = usePersistentState("audiobookWhisperModel", WHISPER_MODELS[1].id);
  const [lang, setLang] = usePersistentState("audiobookWhisperLang", "portuguese");
  const [tr, setTr] = useState(undefined); // undefined = carregando, null = não existe
  const [follow, setFollow] = useState(true);
  const [sel, setSel] = useState(null);    // {text, top, left, pos}
  const [aiCard, setAiCard] = useState(null);
  const [flash, setFlash] = useState("");
  const listRef = useRef(null);
  const aiTokenRef = useRef(0);
  const job = track ? jobs[`${book.id}:${track.id}`] : null;
  const busy = !!job && BUSY.includes(job.status);
  const bookBusy = Object.values(jobs).some(j => j.bookId === book.id && BUSY.includes(j.status));

  // carrega a transcrição salva (e recarrega a cada fatia concluída)
  useEffect(() => {
    let alive = true;
    if (!track) { setTr(null); return; }
    getTranscript(book.id, track.id).then(t => { if (alive) setTr(t || null); });
    return () => { alive = false; };
  }, [book.id, track?.id, job?.doneSec, job?.status]);

  useEffect(() => { setFollow(true); setSel(null); setAiCard(null); }, [track?.id]);

  const segs = tr?.segments || [];
  const active = useMemo(() => {
    let lo = 0, hi = segs.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (segs[mid].s <= pos + 0.25) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }, [segs, pos]);

  useEffect(() => {
    if (!follow || active < 0) return;
    const box = listRef.current, el = box?.children[active];
    if (box && el) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  }, [active, follow]);

  const start = (t) => transcribeTrack(book.id, t, { model, lang });
  const startAll = async () => {
    const local = new Set(await getLocalTrackIds(book.id));
    for (const t of book.tracks || []) {
      if (!local.has(t.id)) continue;
      const done = await getTranscript(book.id, t.id);
      if (!done?.complete) start(t);
    }
  };
  const remove = async () => { await deleteTranscript(book.id, track.id); setTr(null); setAiCard(null); setSel(null); };

  const readSelection = () => setTimeout(() => {
    const s = window.getSelection();
    const box = listRef.current;
    if (!s || s.isCollapsed || !box || !box.contains(s.anchorNode)) return;
    const text = s.toString().replace(/\s+/g, " ").trim();
    if (!text) return;
    const r = s.getRangeAt(0).getBoundingClientRect();
    const n = s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement;
    const i = Number(n?.closest?.("[data-i]")?.dataset.i);
    setFollow(false);
    setSel({ text, top: Math.max(8, r.top - 46), left: Math.max(130, Math.min(r.left + r.width / 2, window.innerWidth - 130)), pos: Number.isFinite(i) ? segs[i]?.s : undefined });
  }, 0);

  const clearSel = () => { setSel(null); window.getSelection()?.removeAllRanges(); };
  const addQuote = () => {
    if (!sel) return;
    onAddQuote(sel.text, sel.pos != null ? { track: trackIdx, pos: sel.pos } : undefined);
    clearSel(); setFlash("Citação adicionada"); setTimeout(() => setFlash(""), 2000);
  };
  const askAi = async () => {
    if (!sel) return;
    const text = sel.text, token = ++aiTokenRef.current;
    clearSel();
    setAiCard({ text, status: "loading", result: "" });
    const title = String(book.title || "").slice(0, 80);
    const { result, error } = await runNoteAi({
      action: "custom", text,
      instruction: `Esta frase vem do audiolivro "${title}". Explique o sentido dela de forma simples e direta, em 1 a 3 frases, começando com "O sentido:". Em "result" vai só essa explicação.`,
    });
    if (aiTokenRef.current !== token) return;
    setAiCard(error ? { text, status: "error", result: error } : { text, status: "done", result });
  };
  const closeAi = () => { aiTokenRef.current++; setAiCard(null); };

  if (!transcribeSupported()) return <div className="abPanel"><p className="emptyHint">Este navegador não suporta a transcrição no aparelho.</p></div>;
  if (!track) return null;

  const label = !job ? "" : job.status === "queued" ? "Na fila..." : job.status === "decoding" ? "Preparando o áudio..."
    : job.status === "loading" ? `Carregando o modelo (na 1ª vez baixa o arquivo)... ${Math.round(job.loadPct || 0)}%` : `Transcrevendo... ${job.pct || 0}%`;

  return (
    <div className="abPanel abTr">
      {busy ? (
        <div className="abTrProgress">
          <div className="abTrBar"><i style={{ width: `${job.status === "running" ? job.pct : 0}%` }}/></div>
          <span>{label}</span>
          <button type="button" className="ghost" onClick={() => cancelTranscribe(book.id)}>Cancelar</button>
        </div>
      ) : (
        <>
          {job?.status === "error" && <div className="abNotice err"><span>{job.error}</span></div>}
          <div className="abTrOpts">
            <select value={model} onChange={e => setModel(e.target.value)} title="Modelo">
              {WHISPER_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <select value={lang} onChange={e => setLang(e.target.value)} title="Idioma do áudio">
              {TRANSCRIBE_LANGS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>
          <div className="abTrActions">
            {!tr?.complete && <button type="button" className="primary" onClick={() => start(track)}>{tr ? "Continuar transcrição" : "Transcrever este capítulo"}</button>}
            {tr?.complete && <button type="button" className="ghost" onClick={() => start(track)} title="Refazer com o modelo/idioma escolhidos"><RefreshCw size={14}/> Refazer</button>}
            {(book.tracks?.length || 0) > 1 && <button type="button" className="ghost" onClick={startAll}>Transcrever todos os capítulos</button>}
            {tr && <button type="button" className="ghost" onClick={remove} title="Excluir a transcrição deste capítulo"><Trash2 size={14}/></button>}
          </div>
        </>
      )}
      {bookBusy && !busy && <small className="abTrHint">Há outro capítulo sendo transcrito em segundo plano.</small>}
      {flash && <small className="abTrFlash">{flash}</small>}

      {tr === null && !busy && <p className="emptyHint">Este capítulo ainda não foi transcrito. A transcrição roda no seu aparelho e pode demorar; você pode fechar o painel enquanto ela trabalha.</p>}
      {segs.length > 0 && (
        <>
          {!follow && <button type="button" className="abTrFollow" onClick={() => { setFollow(true); setSel(null); }}><ArrowDownToLine size={13}/> Acompanhar áudio</button>}
          <div
            className="abTrList" ref={listRef}
            onWheel={() => setFollow(false)} onTouchMove={() => setFollow(false)}
            onMouseUp={readSelection} onTouchEnd={readSelection}
          >
            {segs.map((g, i) => (
              <p key={i} data-i={i} className={i === active ? "on" : i < active ? "past" : ""}
                onClick={() => { if (window.getSelection()?.isCollapsed) { if (sel) setSel(null); else onSeek(g.s); } }}>{g.t}</p>
            ))}
          </div>
          {!tr?.complete && !busy && <small className="abTrHint">Transcrição parcial ({Math.round(((tr?.doneSec || 0) / (tr?.totalSec || 1)) * 100)}%).</small>}
          <small className="abTrHint">Toque numa frase para ir até ela. Selecione um trecho para citar ou perguntar à IA. A transcrição é automática e pode ter erros.</small>
        </>
      )}

      {aiCard && (
        <div className="bookAiCard abAiInline">
          <div className="bookAiCardHead"><b><Sparkles size={13}/> IA</b><button title="Fechar" onClick={closeAi}><X size={14}/></button></div>
          <blockquote>{aiCard.text.length > 160 ? aiCard.text.slice(0, 160) + "…" : aiCard.text}</blockquote>
          {aiCard.status === "loading"
            ? <p className="bookAiCardMsg">Pensando...</p>
            : <p className={aiCard.status === "error" ? "bookAiCardMsg err" : "bookAiCardBody"}>{aiCard.result}</p>}
        </div>
      )}

      {sel && (
        <div className="abSelToolbar" style={{ top: sel.top, left: sel.left }} onMouseDown={e => e.preventDefault()}>
          <button type="button" onClick={addQuote}><Quote size={13}/> Adicionar citação</button>
          <button type="button" onClick={askAi}><Sparkles size={13}/> Perguntar à IA</button>
        </div>
      )}
    </div>
  );
}
