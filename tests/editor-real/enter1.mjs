import puppeteer from 'puppeteer-core'; import chromium from '@sparticuz/chromium';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const BQ='border-top:2px solid #333;border-bottom:2px solid #333;text-align:center;font-style:italic;font-weight:700;padding:10px 24px;';
const cases = {
  'H1 com <br>': '<h1 style="text-align:center">Capítulo I<br>O começo</h1><p>fim</p>',
  'H1 simples (último bloco)': '<h1 style="text-align:center">O começo</h1>',
  'BLOCKQUOTE (2 divs)': `<blockquote style="${BQ}"><div>Capítulo I</div><div>O começo</div></blockquote><p>fim</p>`,
  'BLOCKQUOTE (texto + br)': `<blockquote style="${BQ}">Capítulo I<br>O começo</blockquote><p>fim</p>`,
  'DIV com borda': `<div style="${BQ}">Capítulo I<br>O começo</div><p>fim</p>`,
};
const b = await puppeteer.launch({ args: chromium.args.concat(['--no-sandbox']), executablePath: await chromium.executablePath(), headless: 'shell' });
for (const [name, html] of Object.entries(cases)) {
  for (const presses of [1,2]) {
    const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
    await p.goto('http://localhost:8765/index.html'); await sleep(300);
    await p.evaluate((h) => window.__mountWord({ id: "t", title: "T", content: h, page_size: "a4", orientation: "retrato", margins: "normal" }), html);
    await sleep(900);
    await p.evaluate(() => { const body=document.querySelector('.wordRichBody'); const first=[...body.children].find(e=>!e.classList.contains('word-page-meta')); const w=document.createTreeWalker(first,NodeFilter.SHOW_TEXT); let t,last; while((t=w.nextNode())) last=t; const r=document.createRange(); r.setStart(last,last.length); r.collapse(true); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); body.focus(); });
    for (let i=0;i<presses;i++){ await p.keyboard.press('Enter'); await sleep(120); }
    await p.keyboard.type('XYZ'); await sleep(300);
    const res = await p.evaluate(() => { const body=document.querySelector('.wordRichBody'); const w=document.createTreeWalker(body,NodeFilter.SHOW_TEXT); let t; while((t=w.nextNode())) if(t.nodeValue.includes('XYZ')) break; const chain=[]; for(let e=t.parentElement; e && e!==body; e=e.parentElement) chain.push(e.tagName.toLowerCase()); return chain.join('<') + ' | ' + (t.parentElement.closest('div,blockquote,h1,p')||t.parentElement).outerHTML.slice(0,160); });
    console.log(name.padEnd(28), 'Enter x'+presses, '->', 'XYZ em:', res);
    await p.close();
  }
}
await b.close();
