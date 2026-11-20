// Junta os itens de texto do pdf.js que pertencem à mesma linha numa linha só (um <span> por trecho no editor).
// O pdf.js entrega o vão entre colunas/células de tabela como um item só de espaços com largura enorme; se esse item fosse
// juntado, a linha inteira da tabela viraria um único trecho com largura inflada (o espaçamento entre letras era esticado
// para compensar e as colunas se misturavam). Vão largo = quebra: o próximo trecho começa na sua própria posição.
// raw: [{ str, x, y, size, ang, w, font, rtl }] em px da página.
export function mergeRuns(raw) {
  const runs = [];
  let cur = null;
  const push = () => { if (cur && cur.text.trim()) runs.push(cur); cur = null; };
  for (const it of raw) {
    if (!it.str.trim() && it.w > it.size * 0.7) { push(); continue; } // vão entre colunas/células
    if (cur && !it.rtl && !cur.rtl && it.font === cur.font && Math.abs(it.size - cur.size) < 0.3 && Math.abs(it.ang - cur.ang) < 0.02 && Math.abs(it.ang) < 0.02) {
      const sameLine = Math.abs(it.y - cur.y) < cur.size * 0.25;
      const gap = it.x - (cur.x + cur.w);
      if (sameLine && gap > -cur.size * 0.3 && gap < cur.size * 0.5) {
        if (gap > cur.size * 0.1 && !/\s$/.test(cur.text) && !/^\s/.test(it.str)) cur.text += " ";
        cur.text += it.str;
        cur.w = it.x + it.w - cur.x;
        continue;
      }
    }
    push();
    cur = { text: it.str, x: it.x, y: it.y, size: it.size, ang: it.ang, w: it.w, font: it.font, rtl: it.rtl };
  }
  push();
  return runs;
}
