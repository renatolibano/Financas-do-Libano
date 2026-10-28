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
