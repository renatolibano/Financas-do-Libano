import puppeteer from 'puppeteer-core'; import chromium from '@sparticuz/chromium';
import JSZip from 'jszip'; import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const words="lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(" ");
let seed=3; const rnd=()=> (seed=(seed*16807)%2147483647)/2147483647;
const para=(id,n)=>`<p>${id} `+Array.from({length:n},()=>words[Math.floor(rnd()*words.length)]).join(" ")+"</p>";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const SB=(k)=>`<div class="word-page-break word-section-break" data-section="${k}" contenteditable="false"><span>Quebra de seção</span></div>`;
const FOOT='<div class="word-footer-band"><div><span class="word-pagenum" contenteditable="false" data-fmt="simple">1</span></div></div>';
const html = '<h1>CAPA</h1>'+para('capa',20)+SB('nextpage')+'<h1>Prefacio</h1>'+Array.from({length:14},(_,i)=>para('pref'+i,70)).join('')+SB('nextpage')+'<h1>Capitulo 1</h1>'+Array.from({length:14},(_,i)=>para('cap'+i,70)).join('')+FOOT;
const engine = process.argv[2] || 'classic';
const b = await puppeteer.launch({ args: chromium.args.concat(['--no-sandbox']), executablePath: await chromium.executablePath(), headless: 'shell' });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0,200)));
p.on('dialog', async d => { await d.accept(); });
await p.goto('http://localhost:8765/index.html'); await sleep(400);
await p.evaluate((h,eng) => { localStorage.setItem('libano.word.pageEngine',eng); window.__mountWord({ id: "t", title: "Livro", content: h, page_size: "a4", orientation: "retrato", margins: "normal" }); }, html, engine);
await sleep(1800);
const setSel = (labelRe, value) => p.evaluate((re, v) => { const lab=[...document.querySelectorAll('.wordModal label, label')].find(l=>new RegExp(re).test(l.textContent)); const sel=lab?.querySelector('select'); if(!sel) throw new Error('select '+re); const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; setter.call(sel,v); sel.dispatchEvent(new Event('change',{bubbles:true})); }, labelRe.source, value);
const setInput = (labelRe, value) => p.evaluate((re, v) => { const lab=[...document.querySelectorAll('label')].find(l=>new RegExp(re).test(l.textContent)); const inp=lab?.querySelector('input'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(inp,v); inp.dispatchEvent(new Event('input',{bubbles:true})); }, labelRe.source, value);
async function openProps(marker) {
  await p.evaluate((m) => { const body=document.querySelector('.wordRichBody'); const el=[...body.querySelectorAll('p,h1')].find(e=>e.textContent.startsWith(m)); const r=document.createRange(); r.selectNodeContents(el); r.collapse(true); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); body.focus(); }, marker);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim()==='Layout')?.click()); await sleep(250);
  const btn = await p.evaluateHandle(() => [...document.querySelectorAll('button')].find(b => /Numera[cç][aã]o\s*da\s*Se/.test(b.textContent)));
  const bb = await btn.boundingBox(); await p.mouse.click(bb.x+bb.width/2, bb.y+bb.height/2); await sleep(400);
}
const ok = async () => { await p.evaluate(() => [...document.querySelectorAll('button.primary')].find(b=>b.textContent.trim()==='OK')?.click()); await sleep(500); };
// seção 1 (capa): sem número
await openProps('CAPA'); await p.evaluate(() => { const l=[...document.querySelectorAll('label')].find(l=>/Mostrar o n/.test(l.textContent)); l.querySelector('input').click(); }); await ok();
// seção 2 (prefácio): romano minúsculo, reinicia em 1
await openProps('Prefacio'); await setSel(/Formato do n/, 'lower-roman'); await setSel(/Numera[cç][aã]o/, 'restart'); await ok();
// seção 3 (capítulo): decimal, reinicia em 1
await openProps('Capitulo 1'); await setSel(/Formato do n/, 'decimal'); await setSel(/Numera[cç][aã]o/, 'restart'); await ok();
await sleep(800);
const labels = await p.evaluate(() => { const body=document.querySelector('.wordRichBody'); const L=body.__pageLabeler(); const n=document.querySelectorAll('.wg-gap').length+1; return { pages:n, labels:Array.from({length:n},(_,i)=>{const x=L.at(i); return x.hidden?'(sem)':x.label;}), brk:[...body.querySelectorAll('.word-section-break')].map(e=>({...e.dataset})) }; });
console.log('rótulos', JSON.stringify(labels));
// sumário automático
await p.evaluate(() => { const body=document.querySelector('.wordRichBody'); const el=body.querySelector('h1'); const r=document.createRange(); r.selectNodeContents(el); r.collapse(true); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); body.focus(); });
await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim()==='Referências')?.click()); await sleep(300);
console.log('refs:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.wordRibbon button')].map(b=>b.textContent.trim().replace(/\s+/g,' ').slice(0,22)).slice(0,14))));
const tocBtn = await p.evaluateHandle(() => [...document.querySelectorAll('.wordRibbon button')].filter(b => /Sum[aá]rio/.test(b.textContent) && b.getBoundingClientRect().width > 0)[0]);
const tb = await tocBtn.boundingBox(); console.log('tocBtn', JSON.stringify(tb)); await p.mouse.click(tb.x+tb.width/2, tb.y+tb.height/2); await sleep(1500);
console.log('menu sumário:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.wordDropdownMenu button, .rbPop button')].map(b=>b.textContent.trim().slice(0,30)).slice(0,6))));
await p.evaluate(() => { const bs=[...document.querySelectorAll('.wordDropdownMenu button, .rbPop button')]; (bs.find(b=>/autom|Sum[aá]rio 1|Tabela/i.test(b.textContent))||bs[0])?.click(); }); await sleep(1500);
console.log('TOC', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.word-toc-entry')].map(a=>a.querySelector('.t')?.textContent+' -> '+(a.querySelector('.p')?.textContent||a.dataset.pg)))), (await p.evaluate(() => document.querySelector('.word-toc')?.outerHTML.slice(0,300))));
// status bar com o cursor no meio do capítulo 1
await p.evaluate(() => { const body=document.querySelector('.wordRichBody'); const el=[...body.querySelectorAll('p')].find(e=>e.textContent.startsWith('cap5')); el.scrollIntoView({block:'center'}); });
await sleep(900);
console.log('scroll', await p.evaluate(() => { const el=[...document.querySelectorAll('.wordRichBody p')].find(e=>e.textContent.startsWith('cap5')); let a=el, out=[]; while(a && a!==document.body){ if(a.scrollHeight>a.clientHeight+5) out.push(a.className.slice(0,30)+':'+a.scrollTop+'/'+a.scrollHeight); a=a.parentElement;} return out; }));
console.log('status', await p.evaluate(() => [...document.querySelectorAll('.wordStatusItem')].map(e=>e.textContent).find(t=>/Página/.test(t))));
// exporta
const content = await p.evaluate(() => document.querySelector('.wordRichBody').innerHTML);
const docObj = { title: 'Livro', content, page_size: 'a4', orientation: 'retrato', margins: 'normal' };
await p.evaluate(() => { window.__blobs=[]; URL.createObjectURL = (bl) => { window.__blobs.push(bl); return 'blob:x'; }; });
await p.evaluate((d) => window.__exp.downloadWordDocx(d), docObj); await sleep(1500);
const docx = await p.evaluate(async () => { const bl=window.__blobs[window.__blobs.length-1]; return Array.from(new Uint8Array(await bl.arrayBuffer())); });
const zip = await JSZip.loadAsync(Buffer.from(docx));
const xml = await zip.file('word/document.xml').async('string');
const sects = [...xml.matchAll(/<w:sectPr[\s\S]*?<\/w:sectPr>/g)].map(m=>m[0]);
console.log('DOCX seções:', sects.length, JSON.stringify(sects.map(s=>({ type:(s.match(/<w:type w:val="([^"]+)"/)||[])[1], fmt:(s.match(/<w:pgNumType[^>]*w:fmt="([^"]+)"/)||[])[1], start:(s.match(/<w:pgNumType[^>]*w:start="([^"]+)"/)||[])[1], footers:(s.match(/<w:footerReference/g)||[]).length }))));
const pdfBlob = await p.evaluate(async (d) => { const bl = await window.__exp.downloadWordPdf(d, { asBlob: true }); return Array.from(new Uint8Array(await bl.arrayBuffer())); }, docObj);
const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBlob) }).promise;
const foot = []; for (let i=1;i<=pdf.numPages;i++){ const tc=await (await pdf.getPage(i)).getTextContent(); const t=tc.items.map(x=>x.str).filter(s=>s.trim()); foot.push(t[t.length-1].slice(0,14)); }
console.log('PDF páginas:', pdf.numPages, JSON.stringify(foot));
await b.close();
