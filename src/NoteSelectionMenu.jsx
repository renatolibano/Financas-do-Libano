import React, { useState, useRef } from "react";
import {
  Bold, Italic, Underline, Strikethrough, Code, RemoveFormatting, Link2, Palette, PaintBucket,
  List, ListOrdered, Sparkles, SendHorizontal, Loader2, Undo2, Check, X,
} from "lucide-react";
import { runNoteAi } from "./lib/noteAi";

const MENU_W = 264;

const unwrap = (el) => el.replaceWith(...el.childNodes);

// Texto com \n -> nós de texto separados por <br>
function textToNodes(text) {
  const frag = document.createDocumentFragment();
  text.split("\n").forEach((line, i) => {
    if (i > 0) frag.appendChild(document.createElement("br"));
    frag.appendChild(document.createTextNode(line));
  });
  return frag;
}

// Menu flutuante estilo Notion: aparece ao selecionar texto na nota, com
// formatação (B/I/U...) e "Habilidades de IA". O resultado da IA entra no texto
// como diff (antigo riscado + novo destacado) e o usuário aceita ou desfaz.
export default function NoteSelectionMenu({ fmt, bodyRef, onChange, textColors, hiliteColors }) {
  const [ai, setAi] = useState(null); // {status: loading|done|info|explain|error, message}
  const [prompt, setPrompt] = useState("");
  const rangeRef = useRef(null);
  const marksRef = useRef(null);
  const reqRef = useRef(0);

  const bar = fmt.linkBar;

  const finish = () => {
    setAi(null);
    marksRef.current = null;
    rangeRef.current = null;
    window.getSelection()?.removeAllRanges();
    fmt.updateLinkBar();
  };

  const startAi = async (action, instruction) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!text) return;
    if (action === "custom" && !instruction?.trim()) return;
    rangeRef.current = sel.getRangeAt(0).cloneRange();
    const id = ++reqRef.current;
    setAi({ status: "loading" });
    setPrompt("");

    const { result, summary, error } = await runNoteAi({ action, text, instruction });
    if (id !== reqRef.current) return; // cancelado
    if (error) { setAi({ status: "error", message: error }); return; }
    if (action === "explain") { setAi({ status: "explain", message: result }); return; }

    const range = rangeRef.current;
    if (!range || !bodyRef.current?.contains(range.commonAncestorContainer)) {
      setAi({ status: "error", message: "O trecho mudou de lugar. Selecione de novo e tente outra vez." });
      return;
    }
    let out = result.trim();
    if (action === "reformat") out = out.replace(/^- /gm, "• ");
    if (out === text) { setAi({ status: "info", message: "Não encontrei nada para ajustar nesse trecho." }); return; }

    const oldEl = document.createElement("span");
    oldEl.className = "ai-old";
    oldEl.setAttribute("contenteditable", "false");
    oldEl.appendChild(range.extractContents());
    const newEl = document.createElement("span");
    newEl.className = "ai-new";
    newEl.appendChild(textToNodes(out));
    range.insertNode(newEl);
    range.insertNode(oldEl);
    marksRef.current = { oldEl, newEl };
    setAi({ status: "done", message: summary || "Pronto, ajustei o trecho selecionado." });
  };

  const resolve = (accept) => {
    const m = marksRef.current;
    if (m) {
      if (accept) { m.oldEl.remove(); unwrap(m.newEl); }
      else { m.newEl.remove(); unwrap(m.oldEl); }
      bodyRef.current?.normalize();
      onChange();
    }
    finish();
  };

  const cancel = () => { reqRef.current++; finish(); };

  const insertExplanation = () => {
    const range = rangeRef.current;
    const body = bodyRef.current;
    if (range && body?.contains(range.endContainer)) {
      let anchor = range.endContainer;
      while (anchor.parentNode && anchor.parentNode !== body) anchor = anchor.parentNode;
      const div = document.createElement("div");
      div.appendChild(textToNodes(ai.message));
      anchor.after(div);
      onChange();
    }
    finish();
  };

  const toggleCode = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const n = range.commonAncestorContainer;
    const existing = (n.nodeType === 3 ? n.parentElement : n)?.closest?.("code");
    if (existing && bodyRef.current?.contains(existing)) { unwrap(existing); onChange(); return; }
    const code = document.createElement("code");
    code.textContent = sel.toString();
    range.deleteContents();
    range.insertNode(code);
    const r = document.createRange();
    r.selectNodeContents(code);
    sel.removeAllRanges();
    sel.addRange(r);
    onChange();
  };

  let style = null;
  if (bar) {
    const r = bar.rect || { top: bar.top + 42, bottom: bar.top + 42, left: bar.left, width: 0 };
    const left = Math.min(Math.max(r.left + r.width / 2 - MENU_W / 2, 8), window.innerWidth - MENU_W - 8);
    style = r.top > 340
      ? { left, bottom: window.innerHeight - r.top + 8 }
      : { left, top: r.bottom + 8 };
  }

  const aiItems = [
    ["improve", "Melhorar escrita"],
    ["proofread", "Revisão"],
    ["explain", "Explicar"],
    ["reformat", "Reformatar"],
  ];

  return (
    <>
      {bar && !fmt.linkPopover && !ai && (
        <div
          className="noteSelMenu"
          style={{ position: "fixed", width: MENU_W, ...style }}
          onMouseDown={(e) => { if (e.target.tagName !== "INPUT") e.preventDefault(); }}
        >
          <div className="noteSelRow">
            <div className="emojiWrap">
              <button title="Cor do texto" onClick={() => { fmt.setColorOpen(o => !o); fmt.setHiliteOpen(false); }}><Palette size={15}/></button>
              {fmt.colorOpen && (
                <div className="colorPopover">
                  {textColors.map(c => <button key={c} className="colorSwatch" style={{ background: c }} onClick={() => fmt.applyTextColor(c)}/>)}
                </div>
              )}
            </div>
            <button title="Negrito" onClick={() => fmt.exec("bold")}><Bold size={15}/></button>
            <button title="Itálico" onClick={() => fmt.exec("italic")}><Italic size={15}/></button>
            <button title="Sublinhado" onClick={() => fmt.exec("underline")}><Underline size={15}/></button>
            <button title="Tachado" onClick={() => fmt.exec("strikeThrough")}><Strikethrough size={15}/></button>
            <button title="Limpar formatação" onClick={() => fmt.exec("removeFormat")}><RemoveFormatting size={15}/></button>
          </div>
          <div className="noteSelRow">
            <button title="Transformar em link" onClick={fmt.openLinkPopover}><Link2 size={15}/></button>
            <div className="emojiWrap">
              <button title="Marca-texto" onClick={() => { fmt.setHiliteOpen(o => !o); fmt.setColorOpen(false); }}><PaintBucket size={15}/></button>
              {fmt.hiliteOpen && (
                <div className="colorPopover">
                  {hiliteColors.map(c => (
                    <button key={c} className={"colorSwatch" + (c === "transparent" ? " colorSwatchNone" : "")} style={{ background: c === "transparent" ? undefined : c }} title={c === "transparent" ? "Remover marca-texto" : undefined} onClick={() => fmt.applyHilite(c)}/>
                  ))}
                </div>
              )}
            </div>
            <button title="Código" onClick={toggleCode}><Code size={15}/></button>
            <button title="Lista com marcadores" onClick={() => fmt.exec("insertUnorderedList")}><List size={15}/></button>
            <button title="Lista numerada" onClick={() => fmt.exec("insertOrderedList")}><ListOrdered size={15}/></button>
          </div>
          <div className="noteSelSep"/>
          <div className="noteSelLabel"><Sparkles size={12}/> Habilidades de IA</div>
          {aiItems.map(([k, label]) => (
            <button key={k} className="noteSelItem" onClick={() => startAi(k)}>{label}</button>
          ))}
          <div className="noteSelAsk">
            <Sparkles size={14}/>
            <input
              value={prompt}
              placeholder="Editar com IA… (ex.: deixe mais curto)"
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); startAi("custom", prompt); } }}
            />
            <button title="Enviar" disabled={!prompt.trim()} onClick={() => startAi("custom", prompt)}><SendHorizontal size={14}/></button>
          </div>
        </div>
      )}

      {ai && (
        <div className={"noteAiBar" + (ai.status === "explain" ? " noteAiBarTall" : "")}>
          {ai.status === "loading" && (<>
            <Loader2 size={16} className="noteAiSpin"/>
            <span className="noteAiMsg">Trabalhando...</span>
            <button title="Cancelar" onClick={cancel}><X size={15}/></button>
          </>)}
          {ai.status === "done" && (<>
            <Sparkles size={16}/>
            <span className="noteAiMsg">{ai.message}</span>
            <button title="Desfazer" onClick={() => resolve(false)}><Undo2 size={15}/></button>
            <button title="Aceitar" className="noteAiOk" onClick={() => resolve(true)}><Check size={15}/></button>
          </>)}
          {(ai.status === "info" || ai.status === "error") && (<>
            <Sparkles size={16}/>
            <span className="noteAiMsg">{ai.message}</span>
            <button title="Fechar" onClick={cancel}><X size={15}/></button>
          </>)}
          {ai.status === "explain" && (<>
            <Sparkles size={16}/>
            <span className="noteAiMsg noteAiExplain">{ai.message}</span>
            <button title="Inserir abaixo do trecho" onClick={insertExplanation}><Check size={15}/></button>
            <button title="Fechar" onClick={cancel}><X size={15}/></button>
          </>)}
        </div>
      )}
    </>
  );
}
