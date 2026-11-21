import puppeteer from 'puppeteer-core'; import chromium from '@sparticuz/chromium';
const words="lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(" ");
let seed=21; const rnd=()=> (seed=(seed*16807)%2147483647)/2147483647;
const para=(id,n)=>`<p>${id} `+Array.from({length:n},()=>words[Math.floor(rnd()*words.length)]).join(" ")+"</p>";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const BR='<div class="word-page-break" contenteditable="false"><span>Quebra de página</span></div>';
const b = await puppeteer.launch({ args: chromium.args.concat(['--no-sandbox']), executablePath: await chromium.executablePath(), headless: 'shell' });
async function run(name, html, engine, caretMarker, clickRibbon=true) {
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
  const dlg=[]; p.on('dialog', async d => { dlg.push(d.message().slice(0,50)); await d.accept(); });
  p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0,200)));
  await p.goto('http://localhost:8765/index.html'); await sleep(400);
  await p.evaluate((h,eng) => { localStorage.setItem('libano.word.pageEngine',eng); window.__mountWord({ id: "t", title: "T", content: h, page_size: "a4", orientation: "retrato", margins: "normal" }); }, html, engine);
  await sleep(1500);
  const snap = () => p.evaluate(() => { const body=document.querySelector('.wordRichBody'); const bt=body.getBoundingClientRect().top; const ph=1122.52, pt=parseFloat(getComputedStyle(body).paddingTop);
    const rows=[...body.children].filter(e=>!e.classList.contains('word-page-meta')).map(e=>{ if(e.classList.contains('word-page-break')) return 'BR'; const r=document.createRange(); r.selectNodeContents(e); const q=[...r.getClientRects()].filter(x=>x.height>1); const f=q[0]; return (e.textContent||'').slice(0,4).trim()+'@p'+(f?Math.floor((f.top-bt-pt+1)/ph)+1:'?'); });
    return { rows, pages: document.querySelectorAll('.wg-gap').length+1 }; });
  const before = await snap();
  await p.evaluate((m) => { const body=document.querySelector('.wordRichBody'); const el=[...body.querySelectorAll('p')].find(e=>e.textContent.startsWith(m)); el.scrollIntoView({block:'center'}); const r=document.createRange(); r.selectNodeContents(el); r.collapse(true); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); body.focus(); }, caretMarker);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim()==='Inserir')?.click()); await sleep(300);
  const btn = await p.evaluateHandle(() => [...document.querySelectorAll('button')].find(b => /Excluir\s*P[aá]gina/.test(b.textContent)));
  const bb = await btn.boundingBox(); await p.mouse.click(bb.x+bb.width/2, bb.y+bb.height/2); await sleep(1500);
  const after = await snap();
  console.log(name, '\n  antes ', JSON.stringify(before), '\n  depois', JSON.stringify(after), '\n  dialogs', JSON.stringify(dlg));
  await p.close();
}
const mk = (ids, lens) => ids.map((id,i)=>para(id, lens[i]||50)).join("");
// 1) texto corrido: ~4 páginas, cursor na página 2
const t1 = mk(Array.from({length:32},(_,i)=>'P'+String(i).padStart(2,'0')), Array.from({length:32},()=>60));
await run('1) texto corrido, motor novo', t1, 'model', 'P14');
await run('1b) texto corrido, motor clássico', t1, 'classic', 'P14');
// 2) quebras manuais: [A..][BR][B..][BR][C..] — exclui a do meio
const t2 = mk(['A1','A2','A3'],[40,40,40]) + BR + mk(['B1','B2'],[40,40]) + BR + mk(['C1','C2'],[40,40]);
await run('2) quebras manuais, exclui a do meio', t2, 'model', 'B1');
// 3) última página
await run('3) exclui a última página', t2, 'model', 'C1');
await b.close();
