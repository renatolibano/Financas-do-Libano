import puppeteer from 'puppeteer-core'; import chromium from '@sparticuz/chromium';
const words="lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(" ");
let seed=11; const rnd=()=> (seed=(seed*16807)%2147483647)/2147483647;
const para=(n)=>Array.from({length:n},()=>words[Math.floor(rnd()*words.length)]).join(" ");
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const variants = {
  plano: () => Array.from({length:40},()=>`<p>${para(150)}</p>`).join(""),
  div:   () => Array.from({length:40},()=>`<div>${para(150)}</div>`).join(""),
  embrulhado: () => `<div>${Array.from({length:40},()=>`<p>${para(150)}</p>`).join("")}</div>`,
  brs:   () => Array.from({length:40},()=>`<p>${para(75)}<br>${para(75)}</p>`).join(""),
};
const b = await puppeteer.launch({ args: chromium.args.concat(['--no-sandbox']), executablePath: await chromium.executablePath(), headless: 'shell' });
for (const [name, mk] of Object.entries(variants)) {
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
  const dialogs=[]; p.on('dialog', async d => { dialogs.push(d.message().slice(0,60)); await d.dismiss(); });
  p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0,150)));
  await p.goto('http://localhost:8765/index.html'); await sleep(500);
  await p.evaluate((h) => { localStorage.setItem('libano.word.pageEngine','model'); window.__mountWord({ id: "t", title: "T", content: h, page_size: "a4", orientation: "retrato", margins: "normal" }); }, mk());
  await sleep(1800);
  // acha um bloco cujas linhas ficam em páginas diferentes
  const find = () => p.evaluate(() => {
    const body=document.querySelector('.wordRichBody'); const bt=body.getBoundingClientRect().top; const ph=1122.52, pt=parseFloat(getComputedStyle(body).paddingTop);
    const lineTops=(el)=>{const r=document.createRange();r.selectNodeContents(el);const out=[];for(const x of r.getClientRects()){if(x.height<2)continue;const t=Math.round(x.top-bt);if(!out.some(o=>Math.abs(o-t)<4))out.push(t);}return out.sort((a,b)=>a-b);};
    const pg=(t)=>Math.floor((t-pt+1)/ph);
    const leaves=[...body.querySelectorAll('p,div')].filter(e=>!e.querySelector('p,div'));
    const info=leaves.map((e,i)=>{const L=lineTops(e);return {i,pages:[...new Set(L.map(pg))]};});
    return { total: leaves.length, split: info.filter(x=>x.pages.length>1).map(x=>x.i), pageCount: document.querySelectorAll('.wg-gap').length+1, model: !!body.__pageModel, why: body.__pageWhy };
  });
  const before = await find();
  if (!before.split.length) { console.log(name, 'nenhum bloco dividido', JSON.stringify(before)); await p.close(); continue; }
  const idx = before.split[0];
  // seleciona o bloco dividido (clique no texto) e aplica "Manter linhas juntas" pelo menu
  await p.evaluate((idx) => { const body=document.querySelector('.wordRichBody'); const leaves=[...body.querySelectorAll('p,div')].filter(e=>!e.querySelector('p,div')); const e=leaves[idx]; e.scrollIntoView({block:'center'}); const r=document.createRange(); r.selectNodeContents(e); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); body.focus(); }, idx);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim()==='Layout')?.click()); await sleep(300);
  const btn = await p.evaluateHandle(() => [...document.querySelectorAll('button')].find(b => /Controle de\s*P[aá]gina/.test(b.textContent)));
  const bb = await btn.boundingBox(); await p.mouse.click(bb.x+bb.width/2, bb.y+bb.height/2); await sleep(300);
  const item = await p.evaluateHandle(() => [...document.querySelectorAll('.wordPageCtlMenu button')].find(b => /juntas/.test(b.textContent)));
  const ib = await item.boundingBox(); await p.mouse.click(ib.x+ib.width/2, ib.y+ib.height/2); await sleep(1500);
  const after = await find();
  const marked = await p.evaluate(() => [...document.querySelectorAll('.wordRichBody [data-keep-together]')].map(e=>e.tagName+':'+e.children.length+':'+(e.textContent.length)));
  console.log(name, JSON.stringify({ blocoDividido: idx, antes: before.split, depois: after.split, model: after.model, why: after.why, marcados: marked.slice(0,3), dialogs }));
  await p.close();
}
await b.close();
