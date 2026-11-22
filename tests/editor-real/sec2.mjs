import puppeteer from 'puppeteer-core'; import chromium from '@sparticuz/chromium';
import JSZip from 'jszip'; import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const words="lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(" ");
let seed=3; const rnd=()=> (seed=(seed*16807)%2147483647)/2147483647;
const para=(id,n)=>`<p>${id} `+Array.from({length:n},()=>words[Math.floor(rnd()*words.length)]).join(" ")+"</p>";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const SB=(k)=>`<div class="word-page-break word-section-break" data-section="${k}" contenteditable="false"><span>Quebra de seção</span></div>`;
const HEAD='<div class="word-header-band"><div>HEADER-DOC</div></div>';
const FOOT='<div class="word-footer-band"><div>FOOTER-DOC <span class="word-pagenum" contenteditable="false" data-fmt="simple">1</span></div></div>';
const html = HEAD+'<h1>CAPA</h1>'+para('capa',20)+SB('nextpage')+'<h1>Prefacio</h1>'+Array.from({length:14},(_,i)=>para('pref'+i,70)).join('')+SB('nextpage')+'<h1>Capitulo 1</h1>'+Array.from({length:14},(_,i)=>para('cap'+i,70)).join('')+FOOT;
const b = await puppeteer.launch({ args: chromium.args.concat(['--no-sandbox']), executablePath: await chromium.executablePath(), headless: 'shell' });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0,200)));
p.on('dialog', async d => { await d.accept(); });
await p.goto('http://localhost:8765/index.html'); await sleep(400);
await p.evaluate((h) => { localStorage.setItem('libano.word.pageEngine','model'); window.__mountWord({ id: "t", title: "Livro", content: h, page_size: "a4", orientation: "retrato", margins: "normal" }); }, html);
await sleep(1800);
async function openProps(marker) {
  await p.evaluate((m) => { const body=document.querySelector('.wordRichBody'); const el=[...body.querySelectorAll('p,h1')].find(e=>e.textContent.startsWith(m)); const r=document.createRange(); r.selectNodeContents(el); r.collapse(true); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); body.focus(); }, marker);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim()==='Layout')?.click()); await sleep(250);
  const btn = await p.evaluateHandle(() => [...document.querySelectorAll('button')].find(b => /Numera[cç][aã]o\s*da\s*Se/.test(b.textContent)));
  const bb = await btn.boundingBox(); await p.mouse.click(bb.x+bb.width/2, bb.y+bb.height/2); await sleep(400);
}
const clickLabel = (re) => p.evaluate((r) => { [...document.querySelectorAll('label')].find(l=>new RegExp(r).test(l.textContent)).querySelector('input').click(); }, re.source);
const ok = async () => { await p.evaluate(() => [...document.querySelectorAll('button.primary')].find(b=>b.textContent.trim()==='OK')?.click()); await sleep(600); };
// seção 2: cabeçalho e rodapé próprios
await openProps('Prefacio'); await clickLabel(/Cabeçalho próprio/); await clickLabel(/Rodapé próprio/); await ok();
// seção 3: só cabeçalho próprio
await openProps('Capitulo 1'); await clickLabel(/Cabeçalho próprio/); await ok();
// edita os textos das faixas
await p.evaluate(() => { const bands=[...document.querySelectorAll('.wordRichBody [data-secband]')]; const kinds=bands.map(b=>b.className+':'+b.textContent); window.__kinds=kinds; const hs=bands.filter(b=>b.classList.contains('word-header-band')); hs[0].querySelector('div').textContent='PREFACIO-HDR'; hs[1].querySelector('div').textContent='CAP-HDR'; const f=bands.find(b=>b.classList.contains('word-footer-band')); f.querySelector('div').textContent='PREFACIO-FTR'; });
await p.evaluate(() => { const f=document.querySelector('.wordRichBody .word-footer-band[data-secband]'); const r=document.createRange(); r.selectNodeContents(f); r.collapse(false); const sl=window.getSelection(); sl.removeAllRanges(); sl.addRange(r); document.querySelector('.wordRichBody').focus(); });
await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim()==='Inserir')?.click()); await sleep(300);
await p.evaluate(() => [...document.querySelectorAll('.wordRibbon button')].find(b => /N[uú]mero de P[aá]gina/.test(b.textContent))?.click()); await sleep(400);
await p.evaluate(() => { const bs=[...document.querySelectorAll('button')].filter(b => /^Só o número/.test(b.textContent.trim())); (bs[1]||bs[0])?.click(); }); await sleep(500);
console.log('nº no rodapé próprio:', await p.evaluate(() => document.querySelector('.wordRichBody .word-footer-band[data-secband]').innerHTML.replace(/\s+/g,' ').slice(0,200)), '| no do documento:', await p.evaluate(() => document.querySelector('.wordRichBody .word-footer-band:not([data-secband])').querySelectorAll('.word-pagenum').length));
console.log('bandas próprias criadas:', JSON.stringify(await p.evaluate(() => window.__kinds)));
console.log('estrutura:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.wordRichBody > *')].filter(e=>!e.classList.contains('word-page-meta')).map(e=>e.classList.contains('word-section-break')?'SEC':(e.dataset.secband?'BAND:'+e.textContent.slice(0,14):(e.className.includes('band')?'LEGACY:'+e.textContent.slice(0,10):e.tagName.toLowerCase()))).filter((t,i,a)=>t!==a[i-1]))));
await sleep(500);
// reabre o diálogo da seção 3 para conferir o estado (cabeçalho próprio marcado, rodapé não)
await openProps('Capitulo 1');
console.log('diálogo s3:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('label input[type=checkbox]')].map(i=>i.checked))));
await p.evaluate(() => [...document.querySelectorAll('button.ghost')].find(b=>b.textContent.trim()==='Cancelar')?.click()); await sleep(300);
const content = await p.evaluate(() => document.querySelector('.wordRichBody').innerHTML);
const docObj = { title: 'Livro', content, page_size: 'a4', orientation: 'retrato', margins: 'normal' };
await p.evaluate(() => { window.__blobs=[]; URL.createObjectURL = (bl) => { window.__blobs.push(bl); return 'blob:x'; }; });
await p.evaluate((d) => window.__exp.downloadWordDocx(d), docObj); await sleep(1500);
const docx = await p.evaluate(async () => { const bl=window.__blobs[window.__blobs.length-1]; return Array.from(new Uint8Array(await bl.arrayBuffer())); });
const zip = await JSZip.loadAsync(Buffer.from(docx));
const xml = await zip.file('word/document.xml').async('string');
const rels = await zip.file('word/_rels/document.xml.rels').async('string');
const relMap = {}; for (const m of rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2]; for (const m of rels.matchAll(/<Relationship [^>]*Target="([^"]+)"[^>]*Id="([^"]+)"/g)) relMap[m[2]] = m[1];
const txt = async (file) => ((await zip.file('word/'+file).async('string')).match(/<w:t[^>]*>([^<]*)<\/w:t>/g)||[]).map(t=>t.replace(/<[^>]+>/g,'')).join('|');
const sects = [...xml.matchAll(/<w:sectPr[\s\S]*?<\/w:sectPr>/g)].map(m=>m[0]);
const out=[]; for (const sct of sects) { const refs=[...sct.matchAll(/<w:(header|footer)Reference[^>]*w:type="([^"]+)"[^>]*r:id="([^"]+)"/g)]; const o={}; for (const r of refs) { if (r[2]==='default') o[r[1]] = await txt(relMap[r[3]]); } out.push(o); }
console.log('DOCX por seção:', JSON.stringify(out));
const pdfBlob = await p.evaluate(async (d) => { const bl = await window.__exp.downloadWordPdf(d, { asBlob: true }); return Array.from(new Uint8Array(await bl.arrayBuffer())); }, docObj);
const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBlob) }).promise;
const res=[]; for (let i=1;i<=pdf.numPages;i++){ const tc=await (await pdf.getPage(i)).getTextContent(); const items=tc.items.filter(x=>x.str.trim()); const top=items.slice().sort((a,b)=>b.transform[5]-a.transform[5])[0].str.slice(0,14); const bot=items.slice().sort((a,b)=>a.transform[5]-b.transform[5])[0].str.slice(0,18); res.push(top+' / '+bot); }
console.log('PDF topo/rodapé por página:', JSON.stringify(res));
await b.close();
