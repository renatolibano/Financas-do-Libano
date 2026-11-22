import puppeteer from 'puppeteer-core'; import chromium from '@sparticuz/chromium';
const words="lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(" ");
let seed=7; const rnd=()=> (seed=(seed*16807)%2147483647)/2147483647;
const para=(n)=>Array.from({length:n},()=>words[Math.floor(rnd()*words.length)]).join(" ");
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const mk = (n) => Array.from({length:n},(_,i)=>(i%40===0?`<h1>Capitulo ${i/40+1}</h1>`:'')+`<p>${para([20,50,90][i%3])}</p>`).join('');
const b = await puppeteer.launch({ args: chromium.args.concat(['--no-sandbox']), executablePath: await chromium.executablePath(), headless: 'shell' });
async function run(label, engine, nParas) {
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
  p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0,160)));
  await p.goto('http://localhost:8765/index.html'); await sleep(300);
  const html = mk(nParas);
  const t0 = Date.now();
  await p.evaluate((h, eng) => { localStorage.setItem('libano.word.pageEngine', eng); window.__t0=performance.now(); window.__mountWord({ id: "t", title: "T", content: h, page_size: "a4", orientation: "retrato", margins: "normal" }); }, html, engine);
  await p.waitForSelector('.wordRichBody'); 
  // espera estabilizar as faixas
  let last=-1, stable=0; for (let i=0;i<80 && stable<3;i++){ await sleep(250); const n=await p.evaluate(()=>document.querySelectorAll('.wg-gap').length); if(n===last && n>0) stable++; else {stable=0; last=n;} }
  const loadMs = Date.now()-t0;
  const sync = await p.evaluate(() => { const body=document.querySelector('.wordRichBody'); const f=body.__syncPageBreaks; const ts=[]; for(let i=0;i<3;i++){ const a=performance.now(); f(); ts.push(Math.round(performance.now()-a)); } return { ts, pages: document.querySelectorAll('.wg-gap').length+1, blocks: body.children.length, model: !!body.__pageModel, why: body.__pageWhy }; });
  // digitação: 25 teclas no meio do documento
  await p.evaluate(() => { const body=document.querySelector('.wordRichBody'); const ps=body.querySelectorAll('p'); const el=ps[Math.floor(ps.length/2)]; el.scrollIntoView({block:'center'}); const r=document.createRange(); r.selectNodeContents(el); r.collapse(false); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); body.focus(); window.__lat=[]; body.addEventListener('keydown',()=>{ const t=performance.now(); requestAnimationFrame(()=>requestAnimationFrame(()=>window.__lat.push(Math.round(performance.now()-t)))); }, true); });
  await sleep(400);
  for (let i=0;i<25;i++){ await p.keyboard.type('a'); await sleep(60); }
  await sleep(1200);
  const lat = await p.evaluate(() => window.__lat.slice().sort((a,b)=>a-b));
  const med = lat[Math.floor(lat.length/2)], p95 = lat[Math.floor(lat.length*0.95)];
  console.log(label.padEnd(26), engine.padEnd(7), JSON.stringify({ paginas: sync.pages, blocos: sync.blocks, modelo: sync.model, carga_ms: loadMs, sync_ms: sync.ts, tecla_mediana_ms: med, tecla_p95_ms: p95 }));
  await p.close();
}
for (const [label, n] of [['~100 páginas', 850], ['~300 páginas', 2500]]) for (const eng of ['classic','model']) await run(label, eng, n);
await b.close();
