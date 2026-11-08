import React, { useState, useEffect, useMemo, useRef } from "react";
import { Quote, Sparkles, Loader2, Check, X } from "lucide-react";
import { usePersistentState } from "./lib/storage";
import { getTranscript } from "./lib/audiobooks";
import { runNoteAi } from "./lib/noteAi";
import { diffParts, applyParts, joinTokens } from "./lib/textDiff";
import { fmtClock } from "./lib/audiobooks";

// Termos que aparecem com inicial maiúscula no meio das frases da transcrição (nomes, lugares, apelidos)
// e se repetem: provavelmente estão certos e a IA não deve mexer neles.
function recurringTerms(segs) {
  const counts = new Map();
  for (const g of segs) {
    const w = String(g.t || "").split(/\s+/).filter(Boolean);
    for (let i = 1; i < w.length; i++) {
      if (/[.!?…]["”)]?$/.test(w[i - 1])) continue;
      if (!/^\p{Lu}[\p{L}'’-]{2,}/u.test(w[i])) continue;
      let term = w[i].replace(/[^\p{L}'’-]+$/u, "");
      let j = i + 1;
      while (j < w.length && j < i + 3 && /^\p{Lu}[\p{L}'’-]+/u.test(w[j]) && !/[.,;:!?…]$/.test(w[j - 1])) { term += " " + w[j].replace(/[^\p{L}'’-]+$/u, ""); j++; }
      counts.set(term, (counts.get(term) || 0) + 1);
    }
  }
  return [...counts].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([t]) => t);
}

// Janela flutuante para criar/editar uma citação. "Corrigir com IA" mostra as correções como no
// controle de alterações: palavra antiga riscada + termo novo, com aceitar/recusar uma a uma.
export default function QuoteEditor({ book, draft, onSave, onCancel }) {
  const tracks = book.tracks || [];
  const [text, setText] = useState(draft.text || "");
  const [mode, setMode] = useState("edit");     // edit | review
  const [parts, setParts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [keepOpen, setKeepOpen] = useState(false);
  const [keep, setKeep] = usePersistentState(`audiobookKeepTerms:${book.id}`, ""); // termos que a IA não deve alterar
  const [segs, setSegs] = useState([]);
  const tokenRef = useRef(0);
  const isEdit = !!draft.id;

  useEffect(() => {
    let alive = true;
    const t = tracks[draft.track];
    if (t) getTranscript(book.id, t.id).then(tr => { if (alive) setSegs(tr?.segments || []); });
    return () => { alive = false; };
  }, [book.id, draft.track]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { if (mode === "review") setMode("edit"); else onCancel(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, onCancel]);

  const context = useMemo(() => {
    const near = segs.filter(g => g.e >= draft.pos - 90 && g.s <= draft.pos + 90).map(g => g.t).join(" ").slice(0, 1800);
    const terms = recurringTerms(segs);
    const mine = keep.split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
    return [
      `Livro: "${book.title}"${book.author ? `, de ${book.author}` : ""}.`,
      mine.length ? `Termos que NÃO devem ser alterados (informados pelo usuário): ${mine.join(", ")}.` : "",
      terms.length ? `Termos recorrentes do livro (provavelmente corretos): ${terms.join(", ")}.` : "",
      near ? `Transcrição ao redor deste ponto: ${near}` : "",
    ].filter(Boolean).join("\n");
  }, [segs, draft.pos, book.title, book.author, keep]);

  const fixWithAi = async () => {
    const original = text.trim();
    if (!original) return;
    const token = ++tokenRef.current;
    setBusy(true); setMsg("");
    let res = await runNoteAi({ action: "quote_fix", text: original, context });
    if (res.error === "Ação inválida.") { // função ainda sem a ação nova: usa a instrução livre (limite de 500 caracteres)
      const mine = keep.split(/[,;\n]/).map(x => x.trim()).filter(Boolean).join(", ");
      const instruction = `Corrija pontuação e gramática desta transcrição automática de áudio e troque palavras mal reconhecidas pelo termo certo do contexto (ex.: "igoyás" -> "e Goiás"). NÃO altere nomes, apelidos e termos do livro "${String(book.title).slice(0, 60)}"${mine ? ` (${mine.slice(0, 150)})` : ""}. Não reescreva. Devolva só o texto corrigido.`.slice(0, 500);
      res = await runNoteAi({ action: "custom", text: original, instruction });
    }
    if (tokenRef.current !== token) return;
    setBusy(false);
    if (res.error) { setMsg(res.error); return; }
    const ps = diffParts(original, String(res.result || "").trim());
    if (!ps.some(p => p.type === "change")) { setMsg("A IA não encontrou nada para corrigir."); return; }
    setParts(ps); setMode("review");
  };

  const setState = (id, state) => setParts(ps => ps.map(p => (p.type === "change" && p.id === id ? { ...p, state } : p)));
  const setAll = (state) => setParts(ps => ps.map(p => (p.type === "change" ? { ...p, state } : p)));
  const changes = parts.filter(p => p.type === "change");
  const nRej = changes.filter(p => p.state === "rejected").length;
  const apply = () => { setText(applyParts(parts)); setMode("edit"); setMsg(`Correções aplicadas (${changes.length - nRej} de ${changes.length}). Revise e salve.`); };
  const lead = (p) => (p.ins[0] || p.del[0])?.sp || "";
  const inner = (toks) => joinTokens(toks).replace(/^\s+/, "");

  return (
    <div className="abQModalBack">
      <div className="abQModal abQModalWide" role="dialog" aria-label={isEdit ? "Editar citação" : "Nova citação"}>
        <h3><Quote size={16}/> {isEdit ? "Editar citação" : "Nova citação"}</h3>
        <small>Ponto: {tracks.length > 1 ? `Cap. ${draft.track + 1} · ` : ""}{fmtClock(draft.pos)}. Corrija o texto, se precisar, antes de salvar.</small>

        {mode === "edit" ? (
          <>
            <textarea
              autoFocus rows={8} value={text} placeholder="Escreva a citação (sem as aspas)..."
              onChange={e => { setText(e.target.value); setMsg(""); }}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim()) onSave(text); }}
            />
            <div className="abQAiRow">
              <button type="button" className="ghost abQAiBtn" onClick={fixWithAi} disabled={busy || !text.trim()}>
                {busy ? <Loader2 size={14} className="noteAiSpin"/> : <Sparkles size={14}/>} {busy ? "Corrigindo..." : "Corrigir com IA"}
              </button>
              <button type="button" className="abQLink" onClick={() => setKeepOpen(o => !o)}>{keepOpen ? "Ocultar termos" : "Termos que a IA não deve alterar"}{keep.trim() && !keepOpen ? " ✓" : ""}</button>
            </div>
            {keepOpen && (
              <input className="abQKeep" value={keep} onChange={e => setKeep(e.target.value)} placeholder="Separe por vírgula. Ex.: Kid Preto, Goiás" />
            )}
            {msg && <small className="abQMsg">{msg}</small>}
            <div className="abQuoteActions">
              <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
              <button type="button" className="primary" onClick={() => onSave(text)} disabled={!text.trim()}>{isEdit ? "Salvar alterações" : "Salvar citação"}</button>
            </div>
          </>
        ) : (
          <>
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
                      {p.state !== "accepted" && <button type="button" title="Aceitar esta alteração" onClick={() => setState(p.id, "accepted")}><Check size={12}/></button>}
                      {p.state !== "rejected" && <button type="button" title="Recusar esta alteração" onClick={() => setState(p.id, "rejected")}><X size={12}/></button>}
                    </span>
                  </span>
                </span>
              ))}
            </div>
            <small className="abQMsg">Riscado = como estava · verde = sugestão da IA. Alterações que você não decidir serão aplicadas.</small>
            <div className="abQuoteActions">
              <button type="button" className="ghost" onClick={() => setMode("edit")}>Cancelar revisão</button>
              <button type="button" className="primary" onClick={apply}>Aplicar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
