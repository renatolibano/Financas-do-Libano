import puppeteer from 'puppeteer-core'; import chromium from '@sparticuz/chromium';
const words="lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(" ");
let seed=5; const rnd=()=> (seed=(seed*16807)%2147483647)/2147483647;
const para=(n)=>Array.from({length:n},()=>words[Math.floor(rnd()*words.length)]).join(" ");
const text = () => { let h=""; for(let i=0;i<70;i++){ if(i%12===0) h+=`<h1>Capitulo ${i/12+1}</h1>`; h+=`<p>${para([20,50,90][i%3])}</p>`; } return h; };
const pdf = () => Array.from({length:3},(_, i)=>`<div class="pdf-import-page" style="width:794px;height:1123px;position:relative;overflow:hidden;background:#fff"><span class="pdf-run" style="position:absolute;left:80px;top:${100+i*5}px;font-size:16px">Pagina ${i+1} texto</span></div>`).join("");
const table = () => `<p>Antes</p><table><tbody>${Array.from({length:90},(_,i)=>`<tr><td>linha ${i}</td><td>${para(8)}</td></tr>`).join("")}</tbody></table><p>Depois</p>`;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b = await puppeteer.launch({ args: chromium.args.concat(['--no-sandbox']), executablePath: await chromium.executablePath(), headless: 'shell' });
async function run(name, html, selectSel, shot) {
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
  const dialogs=[]; p.on('dialog', async d => { dialogs.push(d.message().slice(0,90)); await d.dismiss(); });
  p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0,200)));
  await p.goto('http://localhost:8765/index.html'); await sleep(600);
  await p.evaluate((h) => { localStorage.removeItem('libano.word.pageEngine'); window.__mountWord({ id: "t", title: "T", content: h, page_size: "a4", orientation: "retrato", margins: "normal" }); }, html);
  await sleep(1500);
  // seleciona do início do 1º ao fim do 2º bloco alvo (vários blocos)
  await p.evaluate((sel) => { const body=document.querySelector('.wordRichBody'); const els=[...body.querySelectorAll(sel)].slice(0,2); const r=document.createRange(); r.setStart(els[0],0); r.setEnd(els[els.length-1], els[els.length-1].childNodes.length); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); body.focus(); }, selectSel);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim()==='Layout')?.click()); await sleep(300);
  const btn = await p.evaluateHandle(() => [...document.querySelectorAll('button')].find(b => /Controle de\s*P[aá]gina/.test(b.textContent)));
  const bb = await btn.boundingBox(); await p.mouse.click(bb.x+bb.width/2, bb.y+bb.height/2); await sleep(300);
  const cover = await p.evaluate(() => [...document.querySelectorAll('.wordPageCtlMenu button')].map(b => { const r=b.getBoundingClientRect(); const e=document.elementFromPoint(r.x+r.width/2, r.y+r.height/2); return { t:b.textContent.trim().slice(0,22), ok: !!e && (e===b || b.contains(e)), w: Math.round(r.width) }; }));
  const ruler = await p.evaluate(() => { const r=document.querySelector('.wordRulerBar')?.getBoundingClientRect(); const m=document.querySelector('.wordPageCtlMenu')?.getBoundingClientRect(); return { ruler: r && [Math.round(r.top), Math.round(r.bottom)], menu: m && [Math.round(m.top), Math.round(m.bottom)] }; });
  if (shot) await p.screenshot({ path: shot });
  const item = await p.evaluateHandle(() => [...document.querySelectorAll('.wordPageCtlMenu button')].find(b => /ímpar/.test(b.textContent)));
  const ib = await item.boundingBox(); await p.mouse.click(ib.x+ib.width/2, ib.y+ib.height/2); await sleep(1500);
  const res = await p.evaluate((sel) => { const body=document.querySelector('.wordRichBody'); const els=[...body.querySelectorAll(sel)].slice(0,2); return { ds: els.map(e=>e.dataset.chapter||null), engine: localStorage.getItem('libano.word.pageEngine'), model: !!body.__pageModel, why: body.__pageWhy }; }, selectSel);
  console.log(name, JSON.stringify({ cover, ruler, res, dialogs }));
  await p.close();
}
await run('TEXTO', text(), 'h1, p', '/tmp/bt/app3-text.png');
await run('PDF', pdf(), '.pdf-import-page', null);
await run('TABELA', table(), 'p', null);
await b.close();
