// Localiza, dentro de um elemento (camada de texto do PDF ou modo leitura),
// os trechos citados e devolve Ranges prontos para o CSS Custom Highlight API.
// Ignora espaços e hífens na comparação, pra casar mesmo quando a quebra de
// linha/hifenização difere entre o PDF original e o modo leitura.
const SKIP = /[\s\-\u00AD\u2010\u2011]/;

export function findExcerptRanges(root, texts) {
  if (!root || !texts.length) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let flat = "";
  const map = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.nodeValue;
    for (let i = 0; i < t.length; i++) {
      if (SKIP.test(t[i])) continue;
      flat += t[i];
      map.push([n, i]);
    }
  }
  const ranges = [];
  texts.forEach((text) => {
    const needle = text.replace(/[\s\-\u00AD\u2010\u2011]+/g, "");
    if (!needle) return;
    const idx = flat.indexOf(needle);
    if (idx < 0) return;
    const a = map[idx], b = map[idx + needle.length - 1];
    const r = document.createRange();
    r.setStart(a[0], a[1]);
    r.setEnd(b[0], b[1] + 1);
    ranges.push(r);
  });
  return ranges;
}

// Retângulos (um por trecho de linha) de um Range, sem sobreposição. Range.getClientRects()
// devolve também as caixas dos elementos inteiros contidos (parágrafos, spans), que se
// sobrepõem ao texto e deixam o grifo (semi-transparente) mais escuro no meio das citações
// grandes. Aqui usamos só as caixas do texto e unimos as que ficam na mesma linha.
export function excerptLineRects(range) {
  const raw = [];
  const rootNode = range.commonAncestorContainer;
  const walkRoot = rootNode.nodeType === 3 ? rootNode.parentNode : rootNode;
  const walker = document.createTreeWalker(walkRoot, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!range.intersectsNode(n)) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    if (n === range.startContainer) r.setStart(n, range.startOffset);
    if (n === range.endContainer) r.setEnd(n, range.endOffset);
    for (const c of r.getClientRects()) {
      if (c.width >= 1 && c.height >= 1) raw.push({ left: c.left, top: c.top, right: c.right, bottom: c.bottom });
    }
  }
  // Agrupa por linha (sobreposição vertical > 50% da menor altura) e une os trechos que se tocam.
  raw.sort((a, b) => a.top - b.top || a.left - b.left);
  const lines = [];
  for (const r of raw) {
    const line = lines.find(l => {
      const overlap = Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top);
      return overlap > 0.5 * Math.min(l.bottom - l.top, r.bottom - r.top);
    });
    if (line) { line.items.push(r); line.top = Math.min(line.top, r.top); line.bottom = Math.max(line.bottom, r.bottom); }
    else lines.push({ top: r.top, bottom: r.bottom, items: [r] });
  }
  const out = [];
  for (const l of lines) {
    l.items.sort((a, b) => a.left - b.left);
    let cur = null;
    for (const r of l.items) {
      if (cur && r.left <= cur.right + 2) cur.right = Math.max(cur.right, r.right);
      else { if (cur) out.push(cur); cur = { left: r.left, right: r.right, top: l.top, bottom: l.bottom }; }
    }
    if (cur) out.push(cur);
  }
  return out.map(r => ({ left: r.left, top: r.top, width: r.right - r.left, height: r.bottom - r.top }));
}
