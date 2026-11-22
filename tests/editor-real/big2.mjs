import puppeteer from 'puppeteer-core'; import chromium from '@sparticuz/chromium';
const words="lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(" ");
let seed=7; const rnd=()=> (seed=(seed*16807)%2147483647)/2147483647;
const para=(n)=>Array.from({length:n},()=>words[Math.floor(rnd()*words.length)]).join(" ");
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const html = Array.from({length:1000},(_,i)=>(i%40===0?`<h1>Capitulo ${i/40+1}</h1>`:'')+`<p>${para([20,50,90][i%3])}</p>`).join('');
const b = await puppeteer.launch({ args: chromium.args.concat(['--no-sandbox']), executablePath: await chromium.executablePath(), headless: 'shell' });
async function run(engine) {
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
  p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0,160)));
  await p.goto('http://localhost:8765/index.html'); await sleep(300);
  await p.evaluate((h, eng) => { localStorage.setItem('libano.word.pageEngine', eng); window.__mountWord({ id: "t", title: "T", content: h, page_size: "a4", orientation: "retrato", margins: "normal" }); }, html, engine);
  await sleep(5000);
  const sig = () => p.evaluate(() => [...document.querySelectorAll('.wg-sp,.wg-gap')].map(e=>Math.round(parseFloat(e.style.height))).join(','));
  await p.evaluate(() => { const body=document.querySelector('.wordRichBody'); const ps=body.querySelectorAll('p'); const el=ps[300]; el.scrollIntoView({block:'center'}); const r=document.createRange(); r.selectNodeContents(el); r.collapse(false); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); body.focus(); });
  await sleep(500);
  const steps = [
    ['digita 350 caracteres (parágrafo ganha linhas)', async () => { await p.keyboard.type('x'.repeat(40)+' '.repeat(1)); for (let i=0;i<9;i++) await p.keyboard.type('palavra'.repeat(5)+' '); }],
    ['Enter + novo parágrafo + texto', async () => { await p.keyboard.press('Enter'); await p.keyboard.type('Novo paragrafo com algum texto '.repeat(8)); }],
    ['Backspace apaga 200 caracteres', async () => { for (let i=0;i<200;i++) await p.keyboard.press('Backspace'); }],
    ['Backspace une parágrafos', async () => { for (let i=0;i<60;i++) await p.keyboard.press('Backspace'); }],
  ];
  for (const [name, fn] of steps) {
    await fn(); await sleep(1500);
    const incremental = await sig();
    await p.evaluate(() => { const body=document.querySelector('.wordRichBody'); delete document.querySelector('.wordGapLayer').dataset.sig; body.__syncPageBreaks(); });
    await sleep(300);
    const full = await sig();
    console.log(engine.padEnd(7), name.padEnd(46), incremental === full ? 'OK (layout igual ao recálculo completo)' : 'DIFERENTE!');
    if (incremental !== full) console.log('   inc:', incremental.slice(0,120), '\n   full:', full.slice(0,120));
  }
  await p.close();
}
await run('classic'); await run('model');
await b.close();
