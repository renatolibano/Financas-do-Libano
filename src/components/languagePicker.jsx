import React, { useState, useRef, useEffect } from "react";
import { LANGUAGES, languageName } from "../lib/languages";

// Botão de texto ("ESCOLHER IDIOMA" / nome do idioma escolhido) que abre um
// dropdown com busca — usado nas colunas TERMO/DEFINIÇÃO do formulário de
// flashcards pra definir o par de idiomas usado nas sugestões de tradução.
export function LanguagePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = LANGUAGES.filter(l => l.name.toLowerCase().includes(query.trim().toLowerCase()));
  const currentName = value ? languageName(value) : null;

  return (
    <div className="langPickerWrap" ref={ref}>
      <button
        type="button"
        className="langPickerBtn"
        onClick={() => { setOpen(o => !o); setQuery(""); }}
      >
        {currentName ? currentName.toUpperCase() : "ESCOLHER IDIOMA"}
      </button>
      {open && (
        <div className="langPickerPop">
          <input
            autoFocus
            className="langPickerSearch"
            placeholder="Buscar idiomas"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="langPickerList">
            {value && (
              <button type="button" className="langPickerClear" onClick={() => { onChange(null); setOpen(false); }}>
                Nenhum (desativar sugestões)
              </button>
            )}
            {filtered.map(l => (
              <button
                type="button"
                key={l.code}
                className={"langPickerItem" + (l.code === value ? " active" : "")}
                onClick={() => { onChange(l.code); setOpen(false); }}
              >
                {l.name}
              </button>
            ))}
            {filtered.length === 0 && <p className="langPickerEmpty">Nenhum idioma encontrado.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
