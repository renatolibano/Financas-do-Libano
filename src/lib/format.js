export const money = n => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const maskMoney = (n, hidden) => hidden ? "R$ ••••" : money(n);

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
