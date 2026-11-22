import puppeteer from 'puppeteer-core'; import chromium from '@sparticuz/chromium';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const BQ='border-top:2px solid #333;border-bottom:2px solid #333;text-align:center;font-style:italic;font-weight:700;';
const b = await puppeteer.launch({ args: chromium.args.concat(['--no-sandbox']), executablePath: await chromium.executablePath(), headless: 'shell' });
async function run(name, html, caretAt) {
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
  await p.goto('http://localhost:8765/index.html'); await sleep(300);
  await p.evaluate((h) => window.__mountWord({ id: "t", title: "T", content: h, page_size: "a4", orientation: "retrato", margins: "normal" }), html);
  await sleep(900);
  await p.evaluate((at) => { const body=document.querySelector('.wordRichBody'); const first=[...body.children].find(e=>!e.classList.contains('word-page-meta')); const t=document.createTreeWalker(first,NodeFilter.SHOW_TEXT).nextNode(); const r=document.createRange(); r.setStart(t, at==='mid'?Math.floor(t.length/2):t.length); r.collapse(true); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); body.focus(); }, caretAt);
  await p.keyboard.press('Enter'); await sleep(150); await p.keyboard.type('XYZ'); await sleep(300);
  console.log(name, JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.wordRichBody > *')].filter(e=>!e.classList.contains('word-page-meta')).map(e=>e.tagName.toLowerCase()+':'+e.textContent.slice(0,16)))));
  await p.close();
}
await run('meio de título bordado', `<div style="${BQ}border-top:2px solid #333">Capitulo primeiro</div><p>fim</p>`, 'mid');
await run('fim de parágrafo normal', `<p>Texto comum aqui</p><p>fim</p>`, 'end');
await run('fim de parágrafo centrado negrito sem borda', `<div style="text-align:center;font-weight:700">Centro</div>`, 'end');
await b.close();
