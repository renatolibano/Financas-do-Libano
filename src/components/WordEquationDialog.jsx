import { useMemo, useRef, useState } from "react";
import { GALLERIES, SYMBOL_SETS, BUILT_INS } from "../lib/wordMathData";
import { parseEquation, parseLinear, toLinear, toLatex, toMathML } from "../lib/wordMath";

// Conteúdo do diálogo "Equação" (a moldura é o WordModal do editor). Port da aba Equação do
// WordCraft: galerias de estruturas (engine/src/math_gallery.rs), conjuntos de símbolos,
// equações prontas e o texto-fonte em formato linear (UnicodeMath) ou LaTeX, com
// pré-visualização em tempo real.
const GALLERY_PT = {
  fraction: "Fração", script: "Script", radical: "Radical", integral: "Integral", largeOperator: "Operador grande", bracket: "Colchetes",
  function: "Função", accent: "Acento", limitLog: "Limite e log", operator: "Operador", matrix: "Matriz",
};
const SET_PT = {
  "Basic Math": "Matemática básica", "Greek Letters": "Letras gregas", "Letter-Like Symbols": "Símbolos de letras", Operators: "Operadores",
  Arrows: "Setas", "Negated Relations": "Relações negadas", Scripts: "Scripts", Geometry: "Geometria",
};
const BUILT_PT = {
  pythagoras: "Teorema de Pitágoras", area: "Área do círculo", quadratic: "Fórmula quadrática", binomial: "Binômio de Newton", expansion: "Expansão",
  euler: "Identidade de Euler", derivative: "Derivada", taylor: "Série de Taylor", gaussian: "Integral gaussiana", fourier: "Série de Fourier",
  trig1: "Identidade trigonométrica 1", trig2: "Identidade trigonométrica 2", normal: "Distribuição normal", bayes: "Teorema de Bayes",
};

const SHOW = (linear) => {
  try { return { __html: toMathML(parseLinear(linear.replace(/⬚/g, "▯")), false) }; } catch { return { __html: "" }; }
};

export default function WordEquationDialog({ form, setF }) {
  const [tab, setTab] = useState("struct");
  const [gid, setGid] = useState(GALLERIES[0].id);
  const [setIdx, setSetIdx] = useState(0);
  const taRef = useRef(null);
  const fmt = form.format || "linear";
  const src = form.src || "";

  const preview = useMemo(() => {
    if (!src.trim()) return "";
    try { return toMathML(parseEquation(src, fmt), !!form.display); } catch { return ""; }
  }, [src, fmt, form.display]);

  const insertText = (text, selectPlaceholder = false) => {
    const ta = taRef.current;
    const a = ta ? ta.selectionStart : src.length, b = ta ? ta.selectionEnd : src.length;
    const next = src.slice(0, a) + text + src.slice(b);
    setF("src", next);
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      const ph = selectPlaceholder ? text.indexOf("⬚") : -1;
      if (ph >= 0) ta.setSelectionRange(a + ph, a + ph + 1); else ta.setSelectionRange(a + text.length, a + text.length);
    });
  };

  const addTemplate = (t) => {
    if (fmt === "latex") insertText(toLatex(parseLinear(t.linear)) || t.linear);
    else insertText(t.linear, true);
  };

  const convert = (to) => {
    if (to === fmt) return;
    try {
      const nodes = parseEquation(src, fmt);
      setF("src", to === "latex" ? toLatex(nodes) : toLinear(nodes));
    } catch { /* mantém o texto */ }
    setF("format", to);
  };

  const gal = GALLERIES.find((g) => g.id === gid) || GALLERIES[0];
  const tabBtn = (id, label) => <button type="button" className={tab === id ? "primary" : "ghost"} onClick={() => setTab(id)}>{label}</button>;

  return (
    <div className="wordEqDialog">
      <div className="wordEqRow">
        <label>Formato
          <select value={fmt} onChange={(e) => convert(e.target.value)}>
            <option value="linear">Linear (UnicodeMath)</option>
            <option value="latex">LaTeX</option>
          </select>
        </label>
        <label>Exibição <input type="checkbox" checked={!!form.display} onChange={(e) => setF("display", e.target.checked)} /> <span style={{ fontSize: 12, opacity: 0.7 }}>em linha própria, centralizada</span></label>
      </div>
      <textarea
        ref={taRef}
        className="wordEqSrc"
        rows={3}
        spellCheck={false}
        placeholder={fmt === "latex" ? "\\frac{a}{b} + \\sqrt{x}" : "a^2+b^2=c^2   ·   (a+b)/2   ·   ∑_(i=1)^n▒i^2"}
        value={src}
        onChange={(e) => setF("src", e.target.value)}
      />
      <div className="wordEqPreview" aria-label="Pré-visualização" dangerouslySetInnerHTML={{ __html: preview || '<span style="opacity:.5">Pré-visualização</span>' }} />
      <div className="wordEqTabs">
        {tabBtn("struct", "Estruturas")}{tabBtn("sym", "Símbolos")}{tabBtn("ready", "Equações prontas")}
      </div>
      {tab === "struct" && (
        <>
          <div className="wordEqChips">
            {GALLERIES.map((g) => <button type="button" key={g.id} className={g.id === gid ? "primary" : "ghost"} onClick={() => setGid(g.id)}>{GALLERY_PT[g.id] || g.label}</button>)}
          </div>
          <div className="wordEqScroll">
            {gal.sections.map((s) => (
              <div key={s.name}>
                <div className="wordEqSection">{s.name}</div>
                <div className="wordEqGrid">
                  {s.items.map((t) => (
                    <button type="button" key={t.id} className="wordEqCell" title={t.label} onClick={() => addTemplate(t)} dangerouslySetInnerHTML={SHOW(t.linear)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {tab === "sym" && (
        <>
          <div className="wordEqChips">
            {SYMBOL_SETS.map(([name], i) => <button type="button" key={name} className={i === setIdx ? "primary" : "ghost"} onClick={() => setSetIdx(i)}>{SET_PT[name] || name}</button>)}
          </div>
          <div className="wordEqScroll">
            <div className="wordEqGrid wordEqSyms">
              {Array.from(SYMBOL_SETS[setIdx][1]).filter((c) => c.trim()).map((c, i) => (
                <button type="button" key={`${c}${i}`} className="wordEqCell wordEqSym" onClick={() => insertText(c)}>{c}</button>
              ))}
            </div>
          </div>
        </>
      )}
      {tab === "ready" && (
        <div className="wordEqScroll">
          {BUILT_INS.map(([id, , linear]) => (
            <button type="button" key={id} className="wordEqReady" onClick={() => { setF("format", "linear"); setF("src", linear); }}>
              <span>{BUILT_PT[id] || id}</span>
              <span dangerouslySetInnerHTML={SHOW(linear)} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
