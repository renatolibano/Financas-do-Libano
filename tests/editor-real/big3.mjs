import puppeteer from 'puppeteer-core'; import chromium from '@sparticuz/chromium';
import JSZip from 'jszip'; import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const words="lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(" ");
let seed=7; const rnd=()=> (seed=(seed*16807)%2147483647)/2147483647;
const para=(n)=>Array.from({length:n},()=>words[Math.floor(rnd()*words.length)]).join(" ");
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const N=2500;
const html = Array.from({length:N},(_,i)=>(i%40===0?`<h1>Capitulo ${i/40+1}</h1>`:'')+`<p>${para([20,50,90][i%3])}</p>`).join('');
const b = await puppeteer.launch({ args: chromium.args.concat(['--no-sandbox']), executablePath: await chromium.executablePath(), headless: 'shell' });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0,160)));
await p.goto('http://localhost:8765/index.html'); await sleep(300);
await p.evaluate((h) => { localStorage.setItem('libano.word.pageEngine','model'); window.__mountWord({ id: "t", title: "Livro grande", content: h, page_size: "a4", orientation: "retrato", margins: "normal" }); }, html);
await sleep(6000);
// 1) salvar: o conteúdo salvo reflete o que foi digitado (HTML lido só na hora de salvar)
await p.evaluate(() => { const body=document.querySelector('.wordRichBody'); const ps=body.querySelectorAll('p'); const el=ps[1200]; el.scrollIntoView({block:'center'}); const r=document.createRange(); r.selectNodeContents(el); r.collapse(false); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); body.focus(); window.__saves=[]; });
await p.keyboard.type('ZZZSALVO'); await sleep(1500);
const saved = await p.evaluate(() => { const s=window.__saves; const last=s[s.length-1]; return { n: s.length, temZZZ: !!last && typeof last.content==='string' && last.content.includes('ZZZSALVO'), tam: last?.content?.length }; });
console.log('salvamento:', JSON.stringify(saved));
// 2) desfazer / refazer
const undoState = () => p.evaluate(() => { const bt=document.querySelector('.rbQatBtn[data-qat="undo"]'); return { undoDesabilitado: bt?.disabled, temTexto: document.querySelector('.wordRichBody').textContent.includes('ZZZSALVO') }; });
console.log('antes de desfazer', JSON.stringify(await undoState()));
await p.keyboard.down('Control'); await p.keyboard.press('z'); await p.keyboard.up('Control'); await sleep(1200);
console.log('após Ctrl+Z   ', JSON.stringify(await undoState()));
await p.keyboard.down('Control'); await p.keyboard.press('y'); await p.keyboard.up('Control'); await sleep(1200);
console.log('após Ctrl+Y   ', JSON.stringify(await undoState()));
// 3) sumário em documento grande
const t1 = Date.now();
await p.evaluate(() => { const body=document.querySelector('.wordRichBody'); const el=body.querySelector('h1'); const r=document.createRange(); r.selectNodeContents(el); r.collapse(true); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); body.focus(); });
await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim()==='Referências')?.click()); await sleep(300);
const tb = await (await p.evaluateHandle(() => [...document.querySelectorAll('.wordRibbon button')].filter(b => /Sum[aá]rio/.test(b.textContent) && b.getBoundingClientRect().width > 0)[0])).boundingBox();
await p.mouse.click(tb.x+tb.width/2, tb.y+tb.height/2);
await p.waitForSelector('.word-toc-entry', { timeout: 60000 }); await sleep(1500);
console.log('sumário:', JSON.stringify(await p.evaluate(() => { const es=[...document.querySelectorAll('.word-toc-entry')]; return { entradas: es.length, primeira: es[0].textContent.slice(0,30), ultima: es[es.length-1].textContent.slice(0,30) }; })), (Date.now()-t1)+' ms');
// 4) exportações
const content = await p.evaluate(() => document.querySelector('.wordRichBody').innerHTML);
const docObj = { title: 'Livro grande', content, page_size: 'a4', orientation: 'retrato', margins: 'normal' };
await p.evaluate(() => { window.__blobs=[]; URL.createObjectURL = (bl) => { window.__blobs.push(bl); return 'blob:x'; }; });
let t = Date.now();
await p.evaluate((d) => window.__exp.downloadWordDocx(d), docObj); 
const docx = await p.evaluate(async () => { const bl=window.__blobs[window.__blobs.length-1]; return Array.from(new Uint8Array(await bl.arrayBuffer())); });
const zip = await JSZip.loadAsync(Buffer.from(docx)); const xml = await zip.file('word/document.xml').async('string');
console.log('DOCX:', ((docx.length/1024)|0)+' KB', 'parágrafos:', (xml.match(/<w:p[ >]/g)||[]).length, (Date.now()-t)+' ms');
t = Date.now();
const pdfBlob = await p.evaluate(async (d) => { const bl = await window.__exp.downloadWordPdf(d, { asBlob: true }); return Array.from(new Uint8Array(await bl.arrayBuffer())); }, docObj);
const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBlob) }).promise;
console.log('PDF:', ((pdfBlob.length/1024)|0)+' KB', 'páginas:', pdf.numPages, (Date.now()-t)+' ms');
await b.close();
