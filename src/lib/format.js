export const money = n => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const maskMoney = (n, hidden) => hidden ? "R$ ••••" : money(n);
