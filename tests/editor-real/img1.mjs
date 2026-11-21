import puppeteer from 'puppeteer-core'; import chromium from '@sparticuz/chromium';
const words="lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(" ");
let seed=9; const rnd=()=> (seed=(seed*16807)%2147483647)/2147483647;
const para=(n)=>Array.from({length:n},()=>words[Math.floor(rnd()*words.length)]).join(" ");
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b = await puppeteer.launch({ args: chromium.args.concat(['--no-sandbox']), executablePath: await chromium.executablePath(), headless: 'shell' });
async function run(engine, nParasBefore) {
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
  p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0,160)));
  await p.goto('http://localhost:8765/index.html'); await sleep(500);
  const html = Array.from({length:30},()=>`<p>${para(50)}</p>`).join("");
  await p.evaluate((h, eng) => { localStorage.setItem('libano.word.pageEngine', eng); window.__mountWord({ id: "t", title: "T", content: h, page_size: "a4", orientation: "retrato", margins: "normal" }); }, html, engine);
  await sleep(1500);
  // põe o cursor ao fim do parágrafo N (na 1ª folha) e insere a imagem pelo seletor de arquivos
  await p.evaluate((n) => { const body=document.querySelector('.wordRichBody'); const el=body.querySelectorAll('p')[n]; el.scrollIntoView({block:'center'}); const r=document.createRange(); r.selectNodeContents(el); r.collapse(false); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); body.focus(); }, nParasBefore);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim()==='Inserir')?.click()); await sleep(300);
  const inputs = await p.$$('input[type=file]'); let input=null; for (const i of inputs) { const a = await i.evaluate(e=>e.accept); if (/image\/\*/.test(a)) { input=i; } }
  if(!input) { console.log('inputs:', JSON.stringify(await Promise.all(inputs.map(i=>i.evaluate(e=>e.accept.slice(0,60)))))); process.exit(1); }
  await input.uploadFile('/tmp/bt/big.png'); await sleep(2000);
  const res = await p.evaluate((n) => { const body=document.querySelector('.wordRichBody'); const bt=body.getBoundingClientRect().top; const ph=1122.52, pt=parseFloat(getComputedStyle(body).paddingTop);
    const img=body.querySelector('img'); const r=img.getBoundingClientRect(); const top=r.top-bt, bot=r.bottom-bt;
    const prevP=body.querySelectorAll('p')[n]; const rr=document.createRange(); rr.selectNodeContents(prevP); const lr=[...rr.getClientRects()].pop();
    return { imgW: Math.round(r.width), imgH: Math.round(r.height), imgPage: Math.floor((top-pt+1)/ph)+1, imgBottomPage: Math.floor((bot-pt-1)/ph)+1, prevTextPage: Math.floor((lr.top-bt-pt+1)/ph)+1, style: img.getAttribute('style') }; }, nParasBefore);
  console.log(engine, 'após parágrafo', nParasBefore, JSON.stringify(res));
  await p.close();
}
for (const eng of ['classic','model']) { await run(eng, 2); await run(eng, 8); }
await b.close();
