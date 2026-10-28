// Mala direta: filtrar/ordenar destinatários e regras de mesclagem (IF, SKIPIF, NEXTIF, NEXT, MERGEREC).
// Port de wordcraft: crates/engine/src/cmd/mailings.rs (FilterOp, FilterRule, SortKey, compare_cells,
// rule_holds, select_records, condition e act). A lista, o preview e "Concluir e Mesclar" já existiam
// no editor; aqui ficam só as regras que faltavam.

export const MAX_RULES = 64;
export const MAX_SORT_KEYS = 8;

export const FILTER_OPS = [
  ["equal", "é igual a"], ["notEqual", "é diferente de"], ["less", "é menor que"], ["greater", "é maior que"],
  ["lessOrEqual", "é menor ou igual a"], ["greaterOrEqual", "é maior ou igual a"], ["blank", "está em branco"], ["notBlank", "não está em branco"],
  ["contains", "contém"], ["notContains", "não contém"],
];
export const opHasValue = (op) => op !== "blank" && op !== "notBlank";

const asNumber = (s) => { const t = String(s).trim(); if (t === "") return null; const x = Number(t); return Number.isFinite(x) ? x : null; };

// Números antes de texto; números pelo valor, texto sem diferenciar maiúsculas (ordem total).
export function compareCells(a, b) {
  const x = asNumber(a), y = asNumber(b);
  if (x !== null && y !== null) return x < y ? -1 : x > y ? 1 : 0;
  if (x !== null) return -1;
  if (y !== null) return 1;
  const p = String(a).trim().toLowerCase(), q = String(b).trim().toLowerCase();
  return p < q ? -1 : p > q ? 1 : 0;
}

export function ruleHolds(r, cell) {
  const ord = () => compareCells(cell, r.value ?? "");
  const lower = () => [String(cell).toLowerCase(), String(r.value ?? "").trim().toLowerCase()];
  switch (r.op) {
    case "notEqual": return ord() !== 0;
    case "less": return ord() < 0;
    case "greater": return ord() > 0;
    case "lessOrEqual": return ord() <= 0;
    case "greaterOrEqual": return ord() >= 0;
    case "blank": return String(cell).trim() === "";
    case "notBlank": return String(cell).trim() !== "";
    case "contains": { const [c, v] = lower(); return c.includes(v); }
    case "notContains": { const [c, v] = lower(); return !c.includes(v); }
    default: return ord() === 0;
  }
}

// Índices dos registros que passam no filtro, na ordem de `sort` (estável). Regras/chaves com campo
// que não existe na lista são ignoradas. "E" liga mais forte que "OU".
export function selectRecords(headers, rows, filter = [], sort = []) {
  const col = (f) => headers.findIndex((h) => h.trim().toLowerCase() === String(f).trim().toLowerCase());
  const rules = filter.map((r) => [col(r.field), r]).filter(([c]) => c >= 0);
  const keep = (row) => {
    if (!rules.length) return true;
    let any = false, all = true;
    rules.forEach(([c, r], k) => {
      if (k > 0 && r.join === "or") { any = any || all; all = true; }
      all = all && ruleHolds(r, row[c] ?? "");
    });
    return any || all;
  };
  const out = rows.map((r, i) => [r, i]).filter(([r]) => keep(r)).map(([, i]) => i);
  const keys = sort.map((k) => [col(k.field), !!k.descending]).filter(([c]) => c >= 0);
  if (keys.length) {
    out.sort((a, b) => {
      for (const [c, desc] of keys) {
        const o = compareCells(rows[a][c] ?? "", rows[b][c] ?? "");
        if (o !== 0) return desc ? -o : o;
      }
      return a - b;
    });
  }
  return out;
}

// Condição de uma regra do documento (comparação do Word: números como números, o resto como texto).
function condition(rule, headers, row) {
  const c = headers.indexOf(rule.field);
  const v = c >= 0 ? String(row[c] ?? "") : "";
  const cmp = String(rule.value ?? "");
  const nv = asNumber(v), nc = asNumber(cmp);
  const ord = nv !== null && nc !== null ? (nv < nc ? -1 : nv > nc ? 1 : 0) : v < cmp ? -1 : v > cmp ? 1 : 0;
  switch (rule.op || "=") {
    case "<>": return ord !== 0;
    case "<": return ord < 0;
    case ">": return ord > 0;
    case "<=": return ord <= 0;
    case ">=": return ord >= 0;
    default: return ord === 0;
  }
}

export const RULE_TYPES = { IF: "Se… Então… Senão…", SKIPIF: "Ignorar registro se…", NEXTIF: "Próximo registro se…", NEXT: "Próximo registro", MERGEREC: "Número do registro" };

// Texto mostrado no documento enquanto não há pré-visualização.
export function ruleLabel(rule) {
  const t = rule.type || "IF";
  const cond = `${rule.field} ${rule.op || "="} ${rule.value ?? ""}`;
  if (t === "IF") return `«Se ${cond}»`;
  if (t === "SKIPIF") return `«Ignorar registro se ${cond}»`;
  if (t === "NEXTIF") return `«Próximo registro se ${cond}»`;
  if (t === "NEXT") return "«Próximo registro»";
  return "«Nº do registro»";
}

// O que a regra faz para o registro `row` (índice `index` na lista filtrada): { text } | { skip } | { next }.
export function mergeRuleOutcome(rule, headers, row, index) {
  switch (rule.type || "IF") {
    case "MERGEREC": return { text: String(index + 1) };
    case "NEXT": return { text: "", next: true };
    case "NEXTIF": return condition(rule, headers, row) ? { text: "", next: true } : { text: "" };
    case "SKIPIF": return condition(rule, headers, row) ? { text: "", skip: true } : { text: "" };
    default: return { text: condition(rule, headers, row) ? (rule.then ?? "") : (rule.else ?? "") };
  }
}
