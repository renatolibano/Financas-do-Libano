export const money = n => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const maskMoney = (n, hidden) => hidden ? "R$ ••••" : money(n);

// Data de hoje no formato "AAAA-MM-DD", calculada a partir do horário local
// (não usa toISOString(), que converte pra UTC e pode "voltar" um dia perto
// da meia-noite em fusos atrás de UTC, como o do Brasil).
export function todayIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Formata a data de uma transação pra exibição: "AAAA-MM-DD" (formato usado
// pelas movimentações importadas do banco e, a partir de agora, pelas
// adicionadas manualmente) vira "DD/MM/AAAA". Datas antigas, salvas só como
// "DD/MM" (sem ano — formato usado antes dessa mudança), são mostradas como
// estão, sem tentar adivinhar o ano.
export function formatTxDate(d) {
  const s = String(d || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, day] = s.slice(0, 10).split("-");
    return `${day}/${m}/${y}`;
  }
  return s;
}

// Formata um total de bytes como "84 MB", "1,2 GB" etc. — usado pra mostrar
// quanto o app está ocupando no aparelho (Configurações).
export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1).replace(".", ",")} ${units[i]}`;
}

// Formata uma data (string ISO ou Date) como "há X min/h/dias", caindo para
// a data curta (dd/mm/aa) quando já faz mais de uma semana.
export function timeAgo(dateLike) {
  if (!dateLike) return "";
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d}d`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
