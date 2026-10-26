// Importação/exportação do editor "Word" em outros formatos: TXT, Markdown, HTML, RTF,
// LaTeX e ODT (e leitura de .docx). Port de wordcraft: crates/formats (txt.rs, markdown.rs,
// html.rs, rtf.rs, latex.rs, odt.rs, model.rs).
//
// Como no WordCraft, todo formato passa por um modelo de fluxo pequeno ("flow"):
//   { type:"para", kind:"normal|heading|title|quote|code|rule|pagebreak", level, align,
//     runs:[{text,bold,italic,underline,strike,sup,sub,color,highlight,font,fontSizePt,link,code}
//           | {image,alt}], list?:{ordered,level,start} }
//   { type:"table", rows:[[{runs, colspan, header, align}]] }
// O editor guarda HTML (contentEditable); htmlToFlow() lê esse HTML (mesmas regras de
// wordExport.js: ignora marcador de página, texto excluído, etc.) e cada exportador escreve
// o flow. Os importadores fazem o caminho inverso, direto para HTML saneado.

import { collectRuns, downloadBlob, safeFileName } from "./wordExport";

// ---------------------------------------------------------------------------
// Utilitários

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// wordcraft_doc::link::is_safe_href — só destinos web/relativos (nada de javascript:, file:, UNC).
export function isSafeHref(l) {
  const s = String(l || "").trim();
  if (!s) return false;
  if (/^(https?:|mailto:|tel:)/i.test(s)) return true;
  if (s.startsWith("#")) return true;
  if (s.startsWith("\\\\") || s.startsWith("//")) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(s);
}

const FMT_KEYS = ["bold", "italic", "underline", "strike", "sup", "sub", "color", "highlight", "font", "fontSizePt", "link", "code"];
const sameFmt = (a, b) => FMT_KEYS.every((k) => (a[k] || null) === (b[k] || null));

function mergeRuns(runs) {
  const out = [];
  for (const r of runs) {
    if (r.pageField) { out.push({ text: "" }); continue; }
    const last = out[out.length - 1];
    if (last && last.text != null && r.text != null && sameFmt(last, r)) last.text += r.text;
    else out.push({ ...r });
  }
  return out.filter((r) => r.image || (r.text != null && r.text !== ""));
}

const runsText = (runs) => runs.map((r) => (r.image ? "" : r.text || "")).join("");
const isEmptyRuns = (runs) => !runs.some((r) => r.image || (r.text || "").replace(/\n/g, "").trim() !== "");

function alignOf(el) {
  const a = el.style?.textAlign || el.getAttribute?.("align") || "";
  return a === "center" || a === "right" || a === "justify" ? a : null;
}

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "TABLE", "BLOCKQUOTE", "PRE", "HR", "SECTION", "ARTICLE", "FIGURE"]);

// ---------------------------------------------------------------------------
// HTML do editor -> flow

export function htmlToFlow(html) {
  const root = document.createElement("div");
  root.innerHTML = html || "";
  const out = [];

  const para = (el, extra = {}) => {
    let runs = mergeRuns(collectRuns(el, {}));
    if (runs.length === 1 && runs[0].text === "\n") runs = [];
    out.push({ type: "para", kind: "normal", align: alignOf(el), runs, ...extra });
  };

  const walkList = (listEl, level) => {
    const ordered = listEl.tagName === "OL";
    let start = parseInt(listEl.getAttribute("start") || "1", 10) || 1;
    for (const li of Array.from(listEl.children)) {
      if (li.tagName !== "LI") continue;
      const runs = [];
      const nested = [];
      for (const ch of Array.from(li.childNodes)) {
        if (ch.nodeType === 1 && (ch.tagName === "UL" || ch.tagName === "OL")) nested.push(ch);
        else runs.push(...collectRuns(ch, {}));
      }
      out.push({ type: "para", kind: "normal", align: alignOf(li), runs: mergeRuns(runs), list: { ordered, level, start } });
      start = 1; // só o primeiro item usa o "start"
      nested.forEach((n) => walkList(n, level + 1));
    }
  };

  const walkTable = (t) => {
    const rows = Array.from(t.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.children).filter((c) => c.tagName === "TD" || c.tagName === "TH").map((td) => ({
        runs: mergeRuns(collectRuns(td, {})),
        colspan: Math.max(1, parseInt(td.getAttribute("colspan") || "1", 10) || 1),
        header: td.tagName === "TH",
        align: alignOf(td),
      })));
    if (rows.length) out.push({ type: "table", rows });
  };

  const visit = (el) => {
    const cl = el.classList;
    if (cl?.contains("word-page-meta") || cl?.contains("word-header-band") || cl?.contains("word-footer-band")
      || cl?.contains("word-header-band-first") || cl?.contains("word-footer-band-first")) return;
    if (cl?.contains("word-page-break")) { out.push({ type: "para", kind: "pagebreak", runs: [] }); return; }
    if (cl?.contains("word-toc")) {
      out.push({ type: "para", kind: "heading", level: 2, runs: [{ text: "Sumário" }] });
      el.querySelectorAll(".word-toc-entry").forEach((a) => out.push({ type: "para", kind: "normal", runs: [{ text: a.textContent || "" }] }));
      return;
    }
    if (cl?.contains("word-footnotes")) {
      el.querySelectorAll(".word-footnotes-list > li").forEach((li, i) => out.push({ type: "para", kind: "normal", runs: [{ text: `${li.dataset.fn || i + 1}. ${li.textContent || ""}` }] }));
      return;
    }
    if (cl?.contains("checklist-item")) {
      out.push({ type: "para", kind: "normal", runs: [{ text: (cl.contains("checked") ? "[x] " : "[ ] ") + (el.querySelector(".check-text")?.textContent || "") }] });
      return;
    }
    if (cl?.contains("word-smartart")) {
      el.querySelectorAll(".word-smartart-box").forEach((b) => out.push({ type: "para", kind: "normal", runs: [{ text: b.textContent || "", bold: true }] }));
      return;
    }
    if (cl?.contains("word-block")) { // sumário/bibliografia/índice gerados: o corpo vira texto
      el.querySelectorAll(".word-block-body > *").forEach(visit);
      return;
    }
    switch (el.tagName) {
      case "H1": case "H2": case "H3": case "H4": case "H5": case "H6":
        para(el, { kind: "heading", level: Number(el.tagName[1]) }); return;
      case "BLOCKQUOTE": para(el, { kind: "quote" }); return;
      case "PRE": {
        (el.textContent || "").replace(/\n$/, "").split("\n").forEach((l) => out.push({ type: "para", kind: "code", runs: l ? [{ text: l, code: true }] : [] }));
        return;
      }
      case "HR": out.push({ type: "para", kind: "rule", runs: [] }); return;
      case "UL": case "OL": walkList(el, 0); return;
      case "TABLE": walkTable(el); return;
      case "IMG": out.push({ type: "para", kind: "normal", runs: [{ image: el.getAttribute("src"), alt: el.getAttribute("alt") || "" }] }); return;
      case "DIV": case "SECTION": case "ARTICLE": case "FIGURE": {
        const hasBlock = Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName) || c.classList?.contains("word-block"));
        if (hasBlock && !cl?.contains("word-title") && !cl?.contains("word-subtitle")) { Array.from(el.childNodes).forEach(visitNode); return; }
        para(el, cl?.contains("word-title") ? { kind: "title" } : {});
        return;
      }
      default: para(el, cl?.contains("word-title") ? { kind: "title" } : {});
    }
  };
  const visitNode = (n) => {
    if (n.nodeType === 1) visit(n);
    else if (n.nodeType === 3 && n.textContent.trim()) out.push({ type: "para", kind: "normal", runs: [{ text: n.textContent }] });
  };
  Array.from(root.childNodes).forEach(visitNode);
  return out;
}

// ---------------------------------------------------------------------------
// Numeração de listas (model.rs ListCounter)

function letters(n) { let s = ""; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s; }
function roman(n) {
  const t = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let s = ""; for (const [v, r] of t) while (n >= v) { s += r; n -= v; } return s;
}

class ListCounter {
  constructor() { this.reset(); }
  reset() { this.counts = Array(9).fill(0); this.ordered = Array(9).fill(false); }
  next(li) {
    const lv = Math.min(li.level, 8);
    if (this.ordered[lv] !== li.ordered) { this.ordered[lv] = li.ordered; this.counts[lv] = 0; }
    if (this.counts[lv] === 0) this.counts[lv] = Math.max(0, (li.start || 1) - 1);
    this.counts[lv] += 1;
    for (let d = lv + 1; d < 9; d++) this.counts[d] = 0;
    return this.counts[lv];
  }
  label(li) {
    const n = this.next(li);
    if (!li.ordered) return ["•", "◦", "▪"][li.level % 3];
    return [`${n}.`, `${letters(n)}.`, `${roman(n)}.`][li.level % 3];
  }
}

// ---------------------------------------------------------------------------
// TXT (txt.rs export): CRLF; item de lista = tabs por nível + marcador + tab; tabela = células separadas por tab

export function flowToText(flow) {
  const lines = [];
  const lc = new ListCounter();
  for (const b of flow) {
    if (b.type === "table") {
      lc.reset();
      for (const row of b.rows) lines.push(row.map((c) => runsText(c.runs).replace(/\s*\n\s*/g, " ")).join("\t"));
      continue;
    }
    if (b.kind === "pagebreak") continue;
    let line = "";
    if (b.list) line += "\t".repeat(b.list.level) + lc.label(b.list) + "\t"; else lc.reset();
    if (b.kind === "rule") line += "----------";
    else line += runsText(b.runs).replace(/\n/g, "\r\n").replace(/[\u000C\u000E]/g, "");
    lines.push(line);
  }
  return lines.join("\r\n");
}

// ---------------------------------------------------------------------------
// Markdown (markdown.rs export)

const mdEscape = (s) => s.replace(/[\\`*_[\]<>~|&]/g, (c) => "\\" + c).replace(/[\u000C\u000E]/g, "");
const thematicBreak = (t) => { const s = t.replace(/[ \t]/g, ""); return s.length >= 3 && /^(-+|_+|\*+)$/.test(s); };

function escapeLineStart(s) {
  const t = s.replace(/^[ \t]+/, "");
  const lead = s.slice(0, s.length - t.length);
  const cols = [...lead].reduce((n, c) => n + (c === "\t" ? 4 : 1), 0);
  const indent = " ".repeat(Math.min(cols, 3));
  const d = (t.match(/^\d*/) || [""])[0].length;
  const rest = t.slice(d);
  const needs = t.startsWith("#") || t.startsWith(">") || t.startsWith("- ") || t.startsWith("+ ") || t.startsWith("-\t") || t.startsWith("+\t")
    || t === "-" || t === "+" || t.startsWith("=")
    || (t.startsWith("-") && /^-+$/.test(t.replace(/[ \t]+$/, "")))
    || thematicBreak(t)
    || (d > 0 && (rest.startsWith(". ") || rest.startsWith(") ") || rest.startsWith(".\t") || rest.startsWith(")\t") || rest === "." || rest === ")"));
  if (!needs) return cols > 3 || lead.includes("\t") ? indent + t : s;
  if (d > 0) { const m = /^\d+[.)]/.exec(t); if (m) return `${indent}${t.slice(0, d)}\\${t.slice(d)}`; }
  return `${indent}\\${t}`;
}
const escapeLines = (body) => (body.includes("\\\n") ? body.split("\\\n").map(escapeLineStart).join("\\\n") : escapeLineStart(body));

function codeSpan(t) {
  let longest = 0, cur = 0;
  for (const c of t) { if (c === "`") { cur++; longest = Math.max(longest, cur); } else cur = 0; }
  const ticks = "`".repeat(longest + 1);
  const pad = t.startsWith("`") || t.endsWith("`") || (t.startsWith(" ") && t.endsWith(" ") && t.trim() !== "") ? " " : "";
  return `${ticks}${pad}${t}${pad}${ticks}`;
}

const mdLinkTarget = (l) => (/[ ()<>]/.test(l) ? `<${l.replace(/[<>\n]/g, "")}>` : l);
const MD_MARK = { bold: "**", italic: "*", strike: "~~" };

function imageExt(src) {
  const m = /^data:image\/([a-z0-9.+-]+)/i.exec(src || "");
  const e = m ? m[1].toLowerCase() : "png";
  return e === "jpeg" ? "jpg" : e === "svg+xml" ? "svg" : e;
}

function inlinesMd(runs, inTable = false) {
  const pieces = [];
  for (const r of runs) {
    if (r.image != null) { pieces.push({ raw: `![${mdEscape(r.alt || "")}](image.${imageExt(r.image)})` }); continue; }
    const t = r.text || "";
    if ((r.bold || r.italic || r.strike) && !r.code) {
      const core = t.replace(/^[ \t\n]+|[ \t\n]+$/g, "");
      const lead = t.slice(0, t.length - t.replace(/^[ \t\n]+/, "").length);
      const trail = t.slice(t.replace(/[ \t\n]+$/, "").length);
      const plain = { ...r, bold: false, italic: false, strike: false };
      if (lead) pieces.push({ text: lead, f: plain });
      if (core) pieces.push({ text: core, f: r });
      if (trail && core) pieces.push({ text: trail, f: plain });
    } else pieces.push({ text: t, f: r });
  }
  let out = "";
  let stack = [];
  let link = null;
  const closeAll = () => { while (stack.length) out += MD_MARK[stack.pop()]; };
  for (const p of pieces) {
    const f = p.f || {};
    const fl = f.link && isSafeHref(f.link) ? f.link : null;
    if (fl !== link || p.raw != null) {
      closeAll();
      if (link) out += `](${mdLinkTarget(link)})`;
      link = null;
      if (p.raw != null) { out += p.raw; continue; }
      if (fl) { out += "["; link = fl; }
    }
    const want = ["bold", "italic", "strike"].filter((k) => f[k]);
    let pos;
    while ((pos = stack.findIndex((m) => !want.includes(m))) >= 0) while (stack.length > pos) out += MD_MARK[stack.pop()];
    for (const m of want) if (!stack.includes(m)) { out += MD_MARK[m]; stack.push(m); }
    if (f.code) out += codeSpan(inTable ? p.text.replace(/\|/g, "\\|") : p.text);
    else out += mdEscape(p.text).replace(/\n/g, "\\\n").replace(/\t/g, "    ");
  }
  closeAll();
  if (link) out += `](${mdLinkTarget(link)})`;
  return out;
}

function tableMd(t, out) {
  const cols = Math.max(1, ...t.rows.map((r) => r.reduce((n, c) => n + c.colspan, 0)));
  const rowMd = (r) => {
    const v = [];
    for (const c of r) { v.push(inlinesMd(c.runs, true).replace(/\\\n/g, "<br>").replace(/\n/g, " ")); for (let i = 1; i < Math.min(c.colspan, 63); i++) v.push(""); }
    while (v.length < cols) v.push("");
    return v;
  };
  const head = t.rows[0];
  if (!head) return;
  out.push(`| ${rowMd(head).join(" | ")} |`);
  const aligns = [];
  for (const c of head) { aligns.push(c.align); for (let i = 1; i < Math.min(c.colspan, 63); i++) aligns.push(null); }
  while (aligns.length < cols) aligns.push(null);
  out.push(`| ${aligns.map((a) => (a === "center" ? ":---:" : a === "right" ? "---:" : a === "left" ? ":---" : "---")).join(" | ")} |`);
  t.rows.slice(1).forEach((r) => out.push(`| ${rowMd(r).join(" | ")} |`));
}

export function flowToMarkdown(flow) {
  const out = [];
  let counters = Array(9).fill(0);
  let prevList = false, prevTopOrdered = false;
  for (let i = 0; i < flow.length; i++) {
    const b = flow[i];
    if (b.type === "table") { tableMd(b, out); out.push(""); prevList = false; continue; }
    if (b.kind === "pagebreak") continue;
    if (b.kind === "code" && !b.list) {
      const lines = [];
      while (i < flow.length && flow[i].type === "para" && flow[i].kind === "code" && !flow[i].list) { lines.push(runsText(flow[i].runs)); i++; }
      i--;
      const longest = Math.max(0, ...lines.map((l) => (l.match(/`/g) || []).length));
      const fence = "`".repeat(Math.max(3, longest + 1));
      out.push(fence, ...lines, fence, "");
      prevList = false;
      continue;
    }
    const body = inlinesMd(b.runs);
    if (b.list) {
      const li = b.list, lv = Math.min(li.level, 8);
      if (!prevList || (lv === 0 && prevTopOrdered !== li.ordered)) counters = Array(9).fill(0);
      if (lv === 0) prevTopOrdered = li.ordered;
      if (counters[lv] === 0) counters[lv] = Math.max(0, (li.start || 1) - 1);
      counters[lv] += 1;
      const n = counters[lv];
      for (let d = lv + 1; d < 9; d++) counters[d] = 0;
      const marker = li.ordered ? `${n}.` : "-";
      const pad = " ".repeat(4 * lv);
      const cont = " ".repeat(4 * lv + marker.length + 1);
      let text = escapeLines(body).replace(/\\\n/g, `\\\n${cont}`);
      if (thematicBreak(`${marker} ${text}`)) text = `\\${text}`;
      out.push(`${pad}${marker} ${text}`.replace(/\s+$/, ""));
      prevList = true;
      const nx = flow[i + 1];
      if (!(nx && nx.type === "para" && nx.list)) out.push("");
      continue;
    }
    prevList = false;
    let line;
    if (b.kind === "heading") line = `${"#".repeat(Math.min(6, Math.max(1, b.level || 1)))} ${body.replace(/\\\n/g, " ")}`;
    else if (b.kind === "title") line = `# ${body.replace(/\\\n/g, " ")}`;
    else if (b.kind === "rule") line = "---";
    else if (b.kind === "quote") line = `> ${escapeLines(body).replace(/\\\n/g, "\\\n> ")}`;
    else { if (!body) continue; line = escapeLines(body); }
    out.push(line, "");
  }
  let s = out.join("\n");
  while (s.endsWith("\n\n")) s = s.slice(0, -1);
  if (!s.endsWith("\n")) s += "\n";
  return s;
}

// ---------------------------------------------------------------------------
// HTML (html.rs export_flow): documento completo, mesmo CSS do WordCraft

function spanHtml(r) {
  if (r.image != null) return `<img src="${esc(r.image)}" alt="${esc(r.alt || "")}">`;
  let s = esc(r.text || "").replace(/\n/g, "<br>");
  if (!s) return "";
  const style = [];
  if (r.color && r.color.toLowerCase() !== "000000") style.push(`color:#${r.color}`);
  if (r.highlight) style.push(`background-color:#${r.highlight}`);
  if (r.fontSizePt) style.push(`font-size:${r.fontSizePt}pt`);
  if (r.font && !r.code) style.push(`font-family:'${r.font.replace(/['"]/g, "")}'`);
  if (style.length) s = `<span style="${style.join(";")}">${s}</span>`;
  if (r.code) s = `<code>${s}</code>`;
  if (r.sup) s = `<sup>${s}</sup>`; else if (r.sub) s = `<sub>${s}</sub>`;
  if (r.bold) s = `<strong>${s}</strong>`;
  if (r.italic) s = `<em>${s}</em>`;
  if (r.underline) s = `<u>${s}</u>`;
  if (r.strike) s = `<s>${s}</s>`;
  if (r.link && isSafeHref(r.link)) s = `<a href="${esc(r.link)}">${s}</a>`;
  return s;
}
const runsHtml = (runs) => runs.map(spanHtml).join("");

export function flowToHtmlBody(flow) {
  let out = "";
  const stack = []; // listas abertas: "ul" | "ol"
  const closeTo = (n) => { while (stack.length > n) out += `</li></${stack.pop()}>\n`; };
  for (const b of flow) {
    if (b.type === "para" && b.list) {
      const tag = b.list.ordered ? "ol" : "ul";
      const depth = b.list.level + 1;
      if (stack.length > depth) closeTo(depth);
      if (stack.length === depth) { if (stack[depth - 1] !== tag) { closeTo(depth - 1); } else out += "</li>\n"; }
      while (stack.length < depth) {
        const start = stack.length === depth - 1 && tag === "ol" && b.list.start > 1 ? ` start="${b.list.start}"` : "";
        out += `<${stack.length === depth - 1 ? tag : "ul"}${start}>\n`;
        stack.push(stack.length === depth - 1 ? tag : "ul");
      }
      out += `<li>${runsHtml(b.runs)}`;
      continue;
    }
    closeTo(0);
    if (b.type === "table") {
      out += '<table border="1" cellpadding="4">\n';
      b.rows.forEach((row, ri) => {
        out += "<tr>";
        row.forEach((c) => {
          const tag = c.header || ri === 0 && row.every((x) => x.header) ? "th" : "td";
          out += `<${tag}${c.colspan > 1 ? ` colspan="${c.colspan}"` : ""}${c.align ? ` style="text-align:${c.align}"` : ""}>${runsHtml(c.runs)}</${tag}>`;
        });
        out += "</tr>\n";
      });
      out += "</table>\n";
      continue;
    }
    const al = b.align ? ` style="text-align:${b.align}"` : "";
    if (b.kind === "pagebreak") out += '<div style="page-break-after:always"></div>\n';
    else if (b.kind === "rule") out += "<hr>\n";
    else if (b.kind === "heading") { const n = Math.min(6, Math.max(1, b.level || 1)); out += `<h${n}${al}>${runsHtml(b.runs)}</h${n}>\n`; }
    else if (b.kind === "title") out += `<h1${al} class="word-title">${runsHtml(b.runs)}</h1>\n`;
    else if (b.kind === "quote") out += `<blockquote${al}>${runsHtml(b.runs)}</blockquote>\n`;
    else if (b.kind === "code") out += `<pre>${esc(runsText(b.runs))}</pre>\n`;
    else out += `<p${al}>${runsHtml(b.runs) || "<br>"}</p>\n`;
  }
  closeTo(0);
  // <pre> consecutivos viram um só bloco de código
  return out.replace(/<\/pre>\n<pre>/g, "\n");
}

export function flowToHtmlDocument(flow, { title = "", lang = "pt-BR" } = {}) {
  return "<!DOCTYPE html>\n"
    + `<html lang="${esc(lang)}">\n<head>\n<meta charset="utf-8">\n<meta name="generator" content="Libano">\n<title>${esc(title)}</title>\n`
    + "<style>\nbody{font-family:Aptos,Calibri,'Segoe UI',Arial,sans-serif;font-size:12pt;line-height:1.15;max-width:48em;margin:2em auto;padding:0 1em}\n"
    + "table{border-collapse:collapse;margin:0.5em 0}\nblockquote{margin:0.5em 2em;font-style:italic;color:#404040}\n"
    + "pre{background:#f5f5f5;padding:0.5em;font-family:'Courier New',monospace;font-size:10pt}\n</style>\n</head>\n<body>\n"
    + flowToHtmlBody(flow)
    + "</body>\n</html>\n";
}

// ---------------------------------------------------------------------------
// RTF (rtf.rs export): \rtf1\ansi, fonttbl/colortbl/stylesheet, \uN? para Unicode, listas
// com \listtable, tabelas \trowd/\cell/\row, links como campos HYPERLINK.

const RTF_HEAD_SIZES = [20, 16, 14, 12, 12, 11];

function rtfEsc(s) {
  let o = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i], code = s.charCodeAt(i);
    if (c === "\\") o += "\\\\";
    else if (c === "{") o += "\\{";
    else if (c === "}") o += "\\}";
    else if (c === "\n" || c === "\u000B") o += "\\line ";
    else if (c === "\t") o += "\\tab ";
    else if (code < 32) { /* controle: descarta */ }
    else if (code > 126) o += `\\u${code > 32767 ? code - 65536 : code}?`;
    else o += c;
  }
  return o;
}

function imageSize(dataUrl) {
  // PNG (IHDR) ou JPEG (marcador SOF) -> { fmt, w, h, hex }
  const m = /^data:image\/(png|jpe?g);base64,(.*)$/is.exec(dataUrl || "");
  if (!m) return null;
  let bin;
  try { bin = atob(m[2]); } catch { return null; }
  const u = (i) => bin.charCodeAt(i);
  let w = 0, h = 0, fmt;
  if (m[1].toLowerCase() === "png") {
    if (bin.length < 24) return null;
    fmt = "png"; w = (u(16) << 24 | u(17) << 16 | u(18) << 8 | u(19)) >>> 0; h = (u(20) << 24 | u(21) << 16 | u(22) << 8 | u(23)) >>> 0;
  } else {
    fmt = "jpeg";
    let i = 2;
    while (i + 9 < bin.length) {
      if (u(i) !== 0xFF) { i++; continue; }
      const mk = u(i + 1);
      if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) { h = u(i + 5) << 8 | u(i + 6); w = u(i + 7) << 8 | u(i + 8); break; }
      i += 2 + (u(i + 2) << 8 | u(i + 3));
    }
  }
  if (!w || !h) return null;
  let hex = "";
  for (let i = 0; i < bin.length; i++) hex += u(i).toString(16).padStart(2, "0");
  return { fmt, w, h, hex };
}

export function flowToRtf(flow) {
  const fonts = ["Calibri"];
  const colors = [];
  const fontIdx = (n) => { let i = fonts.indexOf(n); if (i < 0) { fonts.push(n); i = fonts.length - 1; } return i; };
  const colorIdx = (hex) => { const h = hex.toLowerCase(); let i = colors.indexOf(h); if (i < 0) { colors.push(h); i = colors.length - 1; } return i + 1; };
  const lists = []; // por lista: array de 9 booleans (ordenada?)

  const charCtl = (r) => {
    let c = "";
    if (r.bold) c += "\\b";
    if (r.italic) c += "\\i";
    if (r.underline) c += "\\ul";
    if (r.strike) c += "\\strike";
    if (r.sup) c += "\\super"; else if (r.sub) c += "\\sub";
    const f = r.code ? "Courier New" : r.font;
    if (f) c += `\\f${fontIdx(f)}`;
    if (r.fontSizePt) c += `\\fs${Math.round(Math.min(1638, Math.max(1, r.fontSizePt)) * 2)}`;
    if (r.color && r.color.toLowerCase() !== "000000") c += `\\cf${colorIdx(r.color)}`;
    if (r.highlight) c += `\\highlight${colorIdx(r.highlight)}`;
    return c;
  };
  const run = (r) => {
    if (r.image != null) {
      const im = imageSize(r.image);
      if (!im) return "[imagem]";
      const wg = Math.round(im.w * 15), hg = Math.round(im.h * 15);
      return `{\\pict\\${im.fmt === "png" ? "pngblip" : "jpegblip"}\\picw${im.w}\\pich${im.h}\\picwgoal${wg}\\pichgoal${hg} ${im.hex}}`;
    }
    const ctl = charCtl(r);
    const body = ctl ? `{${ctl} ${rtfEsc(r.text || "")}}` : rtfEsc(r.text || "");
    if (r.link && isSafeHref(r.link)) return `{\\field{\\*\\fldinst{HYPERLINK "${rtfEsc(r.link.replace(/"/g, "%22"))}"}}{\\fldrslt{${body}}}}`;
    return body;
  };
  const alignCtl = (a) => (a === "center" ? "\\qc" : a === "right" ? "\\qr" : a === "justify" ? "\\qj" : "");

  let body = "";
  const lc = new ListCounter();
  let curList = null, topOrdered = false;
  flow.forEach((b, i) => {
    const last = i === flow.length - 1;
    if (b.type === "table") {
      curList = null;
      const cols = Math.max(1, ...b.rows.map((r) => r.reduce((n, c) => n + c.colspan, 0)));
      const w = 9360 / cols;
      b.rows.forEach((row) => {
        body += "\\trowd\\trgaph108\\trleft0";
        if (row.length && row.every((c) => c.header)) body += "\\trhdr";
        let x = 0;
        row.forEach((c) => {
          x += w * c.colspan;
          body += "\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10" + `\\cellx${Math.round(x)}`;
        });
        row.forEach((c) => { body += `\\pard\\plain\\intbl${alignCtl(c.align)} ${c.runs.map(run).join("")}\\cell\n`; });
        body += "\\row\n";
      });
      body += "\\pard\\plain \\par\n";
      return;
    }
    if (b.kind === "pagebreak") { body += "\\pard\\plain \\page\n"; return; }
    let lsCtl = "", label = "";
    if (b.list) {
      if (b.list.level === 0 && curList && topOrdered !== b.list.ordered) curList = null;
      if (b.list.level === 0) topOrdered = b.list.ordered;
      if (!curList) {
        const kinds = Array(9).fill(b.list.ordered), seen = Array(9).fill(false);
        for (let j = i; j < flow.length && flow[j].type === "para" && flow[j].list; j++) {
          const q = flow[j].list, l = Math.min(q.level, 8);
          if (l === 0 && seen[0] && kinds[0] !== q.ordered) break;
          if (!seen[l]) { seen[l] = true; kinds[l] = q.ordered; }
        }
        lists.push(kinds); curList = lists.length; lc.reset();
      }
      label = lc.label(b.list);
      lsCtl = `\\ls${curList}\\ilvl${Math.min(b.list.level, 8)}`;
    } else curList = null;

    let ctl = "\\pard\\plain" + alignCtl(b.align);
    let inner = b.runs.map(run).join("");
    if (b.kind === "heading") { const n = Math.min(6, Math.max(1, b.level || 1)); ctl += `\\s${n}\\outlinelevel${n - 1}\\keepn\\b\\fs${RTF_HEAD_SIZES[n - 1] * 2}`; }
    else if (b.kind === "title") ctl += "\\s7\\fs56";
    else if (b.kind === "quote") ctl += "\\s8\\li720\\ri720\\i";
    else if (b.kind === "code") { ctl += `\\s9\\sa0\\fs20\\f${fontIdx("Courier New")}`; }
    else if (b.kind === "rule") { ctl += "\\brdrb\\brdrs\\brdrw10\\brsp20"; inner = ""; }
    if (lsCtl) ctl += `${lsCtl}`;
    const lab = b.list ? `{\\*\\listtext ${rtfEsc(label)}\\tab}` : "";
    body += `${ctl} ${lab}${inner}${last ? "" : "\\par"}\n`;
    if (last) body += "\\par\n";
  });

  let out = "{\\rtf1\\ansi\\ansicpg1252\\deff0\\deflang1033\\uc1\n{\\fonttbl";
  fonts.forEach((f, i) => { out += `{\\f${i}${/courier|mono|consolas/i.test(f) ? "\\fmodern" : "\\fswiss"}\\fcharset0 ${rtfEsc(f)};}`; });
  out += "}\n{\\colortbl;";
  colors.forEach((c) => { out += `\\red${parseInt(c.slice(0, 2), 16)}\\green${parseInt(c.slice(2, 4), 16)}\\blue${parseInt(c.slice(4, 6), 16)};`; });
  out += "}\n{\\*\\generator Libano;}\n{\\stylesheet{\\s0\\snext0 Normal;}";
  for (let n = 1; n <= 6; n++) out += `{\\s${n}\\sbasedon0\\snext0\\outlinelevel${n - 1}\\keepn\\b\\fs${RTF_HEAD_SIZES[n - 1] * 2} heading ${n};}`;
  out += "{\\s7\\sbasedon0\\snext0\\fs56 Title;}{\\s8\\sbasedon0\\snext0\\li720\\ri720\\i Quote;}{\\s9\\sbasedon0\\snext9\\sa0\\fs20 Code;}}\n";
  if (lists.length) {
    out += "{\\*\\listtable";
    lists.forEach((kinds, i) => {
      const id = i + 1;
      out += `\n{\\list\\listtemplateid${id}\\listhybrid`;
      kinds.forEach((ordered, l) => {
        const indent = 720 * (l + 1);
        if (ordered) {
          const nfc = [0, 4, 2][l % 3];
          out += `{\\listlevel\\levelnfc${nfc}\\levelnfcn${nfc}\\leveljc0\\leveljcn0\\levelfollow0\\levelstartat1\\levelspace0\\levelindent0{\\leveltext\\'02\\'${l.toString(16).padStart(2, "0")}.;}{\\levelnumbers\\'01;}\\fi-360\\li${indent}\\lin${indent}}`;
        } else {
          const ch = ["\u2022", "\u25E6", "\u25AA"][l % 3].codePointAt(0);
          out += `{\\listlevel\\levelnfc23\\levelnfcn23\\leveljc0\\leveljcn0\\levelfollow0\\levelstartat1\\levelspace0\\levelindent0{\\leveltext\\'01\\u${ch}?;}{\\levelnumbers;}\\fi-360\\li${indent}\\lin${indent}}`;
        }
      });
      out += `{\\listname ;}\\listid${id}}`;
    });
    out += "}\n{\\*\\listoverridetable";
    lists.forEach((_, i) => { out += `{\\listoverride\\listid${i + 1}\\listoverridecount0\\ls${i + 1}}`; });
    out += "}\n";
  }
  return `${out}\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440\n${body}}`;
}

// ---------------------------------------------------------------------------
// LaTeX (latex.rs export): article + hyperref; \section*, itemize/enumerate, tabular, verbatim

const LATEX_SECTIONS = ["section", "subsection", "subsubsection", "paragraph", "subparagraph", "subparagraph"];
const LINE_WIDTH = 468, TABCOLSEP = 6;

export function latexEscape(s) {
  let o = "", prev = "", lineHasText = false;
  for (const c of s) {
    switch (c) {
      case "\\": o += "\\textbackslash{}"; break;
      case "{": o += "\\{"; break;
      case "}": o += "\\}"; break;
      case "$": case "&": case "#": case "%": case "_": o += "\\" + c; break;
      case "~": o += "\\textasciitilde{}"; break;
      case "^": o += "\\textasciicircum{}"; break;
      case "<": o += "\\textless{}"; break;
      case ">": o += "\\textgreater{}"; break;
      case "|": o += "\\textbar{}"; break;
      case "\u00A0": o += "~"; break;
      case "[": o += lineHasText ? "[" : "{[}"; break;
      case "-": o += prev === "-" ? "{}-" : "-"; break;
      case "`": o += "\\textasciigrave{}"; break;
      case "'": o += prev === "'" ? "{}'" : "'"; break;
      case "\t": o += "\\quad{}"; break;
      case "\n": case "\u000B":
        o += lineHasText ? "\\\\\n" : "\\mbox{}\\\\\n";
        lineHasText = false; prev = c; continue;
      default:
        if (c.charCodeAt(0) < 32 || (c.charCodeAt(0) >= 127 && c.charCodeAt(0) < 160)) continue;
        o += c;
    }
    if (!/\s/.test(c)) lineHasText = true;
    prev = c;
  }
  return o;
}
const latexUrl = (u) => u.replace(/\\/g, "/").replace(/%/g, "\\%").replace(/#/g, "\\#").replace(/\{/g, "%7B").replace(/\}/g, "%7D");

export function flowToLatex(flow, { title = "" } = {}) {
  const uses = { ulem: false, color: false };
  const span = (r) => {
    if (r.image != null) return `\\textit{[${latexEscape(r.alt ? `Imagem: ${r.alt}` : "Imagem")}]}`;
    let s = r.code ? latexEscape((r.text || "").replace(/ /g, "\u00A0")) : latexEscape(r.text || "");
    if (!s) return s;
    const wrap = (x, cmd) => `\\${cmd}{${x}}`;
    if (r.code) s = wrap(s, "texttt");
    if (r.sup) s = wrap(s, "textsuperscript"); else if (r.sub) s = wrap(s, "textsubscript");
    if (r.bold) s = wrap(s, "textbf");
    if (r.italic) s = wrap(s, "textit");
    if (r.underline) { uses.ulem = true; s = wrap(s, "uline"); }
    if (r.strike) { uses.ulem = true; s = wrap(s, "sout"); }
    if (r.color && r.color.toLowerCase() !== "000000") { uses.color = true; s = `\\textcolor[HTML]{${r.color.toUpperCase()}}{${s}}`; }
    if (r.fontSizePt && r.fontSizePt >= 1 && r.fontSizePt <= 1638) s = `{\\fontsize{${r.fontSizePt}}{${(r.fontSizePt * 1.2).toFixed(1).replace(/\.0$/, "")}}\\selectfont ${s}}`;
    if (r.link) {
      if (r.link.startsWith("#")) s = `\\hyperlink{${latexUrl(r.link.slice(1))}}{${s}}`;
      else if (isSafeHref(r.link)) s = `\\href{${latexUrl(r.link)}}{${s}}`;
    }
    return s;
  };
  const inl = (runs) => runs.map(span).join("");

  let out = "";
  const titleAt = flow.findIndex((b) => b.type === "para" && b.kind === "title" && !isEmptyRuns(b.runs));
  const titleText = titleAt >= 0 ? inl(flow[titleAt].runs) : "";
  const lists = [];
  const closeList = () => {
    const ordered = lists.pop();
    out += `${"  ".repeat(lists.length)}\\end{${ordered ? "enumerate" : "itemize"}}\n`;
    if (!lists.length) out += "\n";
  };
  const pageBreak = (b) => { if (b.kind === "pagebreak") out += "\\clearpage\n\n"; };

  for (let i = 0; i < flow.length; i++) {
    const b = flow[i];
    const li = b.type === "para" ? b.list : null;
    if (li) {
      const depth = Math.min(li.level, 3) + 1;
      while (lists.length > depth || (lists.length === depth && lists[lists.length - 1] !== li.ordered)) closeList();
      while (lists.length < depth) { out += `${"  ".repeat(lists.length)}\\begin{${li.ordered ? "enumerate" : "itemize"}}\n`; lists.push(li.ordered); }
    } else while (lists.length) closeList();

    if (b.type === "table") {
      const cols = Math.max(1, Math.min(63, ...[Math.max(...b.rows.map((r) => r.reduce((n, c) => n + c.colspan, 0)))]));
      const w = LINE_WIDTH / cols;
      const col = (x) => `p{${Math.max(12, x - 2 * TABCOLSEP).toFixed(1).replace(/\.0$/, "")}pt}`;
      let t = `\\noindent\\begin{tabular}{|${Array(cols).fill(`${col(w)}|`).join("")}}\n\\hline\n`;
      b.rows.forEach((row) => {
        const cells = row.map((c, k) => {
          let body = c.runs.length ? inl(c.runs).replace(/\n/g, " ") : "";
          if (c.header) body = `\\textbf{${body}}`;
          if (c.colspan > 1) body = `\\multicolumn{${c.colspan}}{${k === 0 ? "|" : ""}${col(w * c.colspan)}|}{${body}}`;
          return body;
        });
        if (cells.length) t += `${cells.join(" & ")} \\\\\n\\hline\n`;
      });
      out += `${t}\\end{tabular}\n\n`;
      continue;
    }
    if (li) {
      pageBreak(b);
      out += `${"  ".repeat(lists.length)}\\item ${inl(b.runs).trim()}\n`;
      continue;
    }
    if (b.kind === "code") {
      const lines = [];
      while (i < flow.length && flow[i].type === "para" && flow[i].kind === "code" && !flow[i].list) { lines.push(runsText(flow[i].runs)); i++; }
      i--;
      out += "\\begin{verbatim}\n" + lines.map((l) => l.replace(/\\end\{verbatim\}/g, "\\end {verbatim}").replace(/[\u0000-\u0008\u000A-\u001F]/g, "")).join("\n") + "\n\\end{verbatim}\n\n";
      continue;
    }
    if (b.kind === "quote") {
      const paras = [];
      while (i < flow.length && flow[i].type === "para" && flow[i].kind === "quote" && !flow[i].list) { paras.push(inl(flow[i].runs).trim()); i++; }
      i--;
      out += `\\begin{quote}\n${paras.filter(Boolean).join("\n\n")}\n\\end{quote}\n\n`;
      continue;
    }
    pageBreak(b);
    if (b.kind === "pagebreak") continue;
    if (b.kind === "rule") { out += "\\noindent\\rule{\\linewidth}{0.4pt}\n\n"; continue; }
    if (i === titleAt) { out += "\\maketitle\n\n"; continue; }
    const text = inl(b.runs).trim();
    if (!text) continue;
    if (b.kind === "heading") out += `\\${LATEX_SECTIONS[Math.min(6, Math.max(1, b.level || 1)) - 1]}*{${text.replace(/\\\\\n/g, " ")}}\n\n`;
    else if (b.kind === "title") out += `\\begin{center}\n{\\LARGE ${text}\\par}\n\\end{center}\n\n`;
    else if (b.align === "center") out += `\\begin{center}\n${text}\n\\end{center}\n\n`;
    else if (b.align === "right") out += `\\begin{flushright}\n${text}\n\\end{flushright}\n\n`;
    else out += `${text}\n\n`;
  }
  while (lists.length) closeList();

  let o = "% Gerado pelo Libano (formato baseado no WordCraft).\n\\documentclass{article}\n\\usepackage[T1]{fontenc}\n\\usepackage[utf8]{inputenc}\n";
  if (uses.ulem) o += "\\usepackage[normalem]{ulem}\n";
  if (uses.color) o += "\\usepackage[table]{xcolor}\n";
  o += "\\usepackage{hyperref}\n";
  if (title.trim()) o += `\\hypersetup{pdftitle={${latexEscape(title.trim())}}}\n`;
  if (titleAt >= 0) o += `\\title{${titleText}}\n\\author{}\n\\date{}\n`;
  o += `\n\\begin{document}\n\n${out.trimEnd()}\n\n\\end{document}\n`;
  return o;
}

// ---------------------------------------------------------------------------
// ODT (odt.rs): pacote ZIP com mimetype (sem compressão, primeiro), content.xml, styles.xml,
// meta.xml e META-INF/manifest.xml. Usa jszip (já instalado como dependência do "docx").

const ODT_NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" '
  + 'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" '
  + 'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" '
  + 'xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" '
  + 'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.3"';

const xesc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function flowToOdt(flow, { title = "" } = {}) {
  const { default: JSZip } = await import("jszip");
  const textStyles = new Map(); // chave -> nome
  const paraStyles = new Map();
  const images = []; // {name, bytes, mime}
  const dims = (w, h) => `svg:width="${(Math.min(w, 600) / 96).toFixed(3)}in" svg:height="${(Math.min(w, 600) / w * h / 96).toFixed(3)}in"`;

  const textStyle = (r) => {
    const props = [];
    if (r.bold) props.push('fo:font-weight="bold"');
    if (r.italic) props.push('fo:font-style="italic"');
    if (r.underline) props.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"');
    if (r.strike) props.push('style:text-line-through-style="solid"');
    if (r.sup) props.push('style:text-position="super 58%"'); else if (r.sub) props.push('style:text-position="sub 58%"');
    if (r.color && r.color.toLowerCase() !== "000000") props.push(`fo:color="#${r.color}"`);
    if (r.highlight) props.push(`fo:background-color="#${r.highlight}"`);
    if (r.fontSizePt) props.push(`fo:font-size="${r.fontSizePt}pt"`);
    const font = r.code ? "Courier New" : r.font;
    if (font) props.push(`style:font-name="${xesc(font)}" fo:font-family="${xesc(font)}"`);
    if (!props.length) return null;
    const key = props.join(" ");
    if (!textStyles.has(key)) textStyles.set(key, `T${textStyles.size + 1}`);
    return textStyles.get(key);
  };
  const paraStyle = (b) => {
    const props = [];
    if (b.align) props.push(`fo:text-align="${b.align === "justify" ? "justify" : b.align}"`);
    if (b.kind === "pagebreak") props.push('fo:break-before="page"');
    if (b.kind === "rule") props.push('fo:border-bottom="0.75pt solid #000000" fo:padding-bottom="0.04in"');
    if (b.kind === "quote") props.push('fo:margin-left="0.5in" fo:margin-right="0.5in" fo:font-style="italic"');
    const parent = b.kind === "code" ? "Preformatted_20_Text" : b.kind === "title" ? "Title" : b.kind === "heading" ? `Heading_20_${Math.min(6, Math.max(1, b.level || 1))}` : "Standard";
    if (!props.length) return parent;
    const key = `${parent}|${props.join(" ")}`;
    if (!paraStyles.has(key)) paraStyles.set(key, { name: `P${paraStyles.size + 1}`, parent, props: props.join(" ") });
    return paraStyles.get(key).name;
  };

  const inline = (runs) => runs.map((r) => {
    if (r.image != null) {
      const im = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(r.image);
      if (!im) return "";
      const ext = imageExt(r.image);
      const name = `Pictures/img${images.length + 1}.${ext}`;
      let w = 300, h = 200;
      const sz = imageSize(r.image);
      if (sz) { w = sz.w; h = sz.h; }
      images.push({ name, b64: im[2], mime: im[1] });
      return `<draw:frame draw:name="img${images.length}" text:anchor-type="as-char" ${dims(w, h)}><draw:image xlink:href="${name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`;
    }
    const parts = String(r.text || "").split(/(\n|\t| {2,})/);
    let s = parts.map((p) => (p === "\n" ? "<text:line-break/>" : p === "\t" ? "<text:tab/>" : /^ {2,}$/.test(p) ? `<text:s text:c="${p.length}"/>` : xesc(p))).join("");
    const st = textStyle(r);
    if (st) s = `<text:span text:style-name="${st}">${s}</text:span>`;
    if (r.link && isSafeHref(r.link)) s = `<text:a xlink:type="simple" xlink:href="${xesc(r.link)}">${s}</text:a>`;
    return s;
  }).join("");

  let body = "";
  const stack = [];
  const closeTo = (n) => { while (stack.length > n) { body += "</text:list-item></text:list>"; stack.pop(); } };
  let tableN = 0;
  for (const b of flow) {
    if (b.type === "para" && b.list) {
      const depth = b.list.level + 1, kind = b.list.ordered ? "LNum" : "LBul";
      if (stack.length > depth) closeTo(depth);
      if (stack.length === depth) { if (stack[depth - 1] !== kind) closeTo(depth - 1); else body += "</text:list-item>"; }
      while (stack.length < depth) {
        const k = stack.length === depth - 1 ? kind : "LBul";
        body += stack.length === 0 ? `<text:list text:style-name="${k}">` : `<text:list>`;
        stack.push(k);
        if (stack.length < depth) body += "<text:list-item>";
      }
      body += `<text:list-item><text:p text:style-name="${paraStyle(b)}">${inline(b.runs)}</text:p>`;
      continue;
    }
    closeTo(0);
    if (b.type === "table") {
      const cols = Math.max(1, ...b.rows.map((r) => r.reduce((n, c) => n + c.colspan, 0)));
      tableN++;
      body += `<table:table table:name="Tabela${tableN}" table:style-name="Tbl"><table:table-column table:number-columns-repeated="${cols}"/>`;
      b.rows.forEach((row) => {
        body += "<table:table-row>";
        row.forEach((c) => {
          const span = c.colspan > 1 ? ` table:number-columns-spanned="${c.colspan}"` : "";
          body += `<table:table-cell table:style-name="Cel" office:value-type="string"${span}><text:p text:style-name="${paraStyle({ align: c.align, kind: "normal" })}">${inline(c.runs)}</text:p></table:table-cell>`;
          for (let k = 1; k < c.colspan; k++) body += "<table:covered-table-cell/>";
        });
        body += "</table:table-row>";
      });
      body += "</table:table>";
      continue;
    }
    if (b.kind === "heading") body += `<text:h text:style-name="${paraStyle(b)}" text:outline-level="${Math.min(6, Math.max(1, b.level || 1))}">${inline(b.runs)}</text:h>`;
    else body += `<text:p text:style-name="${paraStyle(b)}">${b.kind === "rule" ? "" : inline(b.runs)}</text:p>`;
  }
  closeTo(0);

  const autoText = [...textStyles].map(([k, n]) => `<style:style style:name="${n}" style:family="text"><style:text-properties ${k}/></style:style>`).join("");
  const autoPara = [...paraStyles.values()].map((p) => `<style:style style:name="${p.name}" style:family="paragraph" style:parent-style-name="${p.parent}"><style:paragraph-properties ${p.props}/></style:style>`).join("");
  const bulletLevel = (l) => `<text:list-level-style-bullet text:level="${l + 1}" text:bullet-char="${["•", "◦", "▪"][l % 3]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:margin-left="${0.5 * (l + 1)}in" fo:text-indent="-0.25in"/></style:list-level-properties></text:list-level-style-bullet>`;
  const numLevel = (l) => `<text:list-level-style-number text:level="${l + 1}" style:num-suffix="." style:num-format="${["1", "a", "i"][l % 3]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:margin-left="${0.5 * (l + 1)}in" fo:text-indent="-0.25in"/></style:list-level-properties></text:list-level-style-number>`;
  const lvls = [...Array(9).keys()];
  const listStyles = `<text:list-style style:name="LBul">${lvls.map(bulletLevel).join("")}</text:list-style><text:list-style style:name="LNum">${lvls.map(numLevel).join("")}</text:list-style>`;
  const tableStyles = '<style:style style:name="Tbl" style:family="table"><style:table-properties style:width="6.5in" table:align="margins"/></style:style>'
    + '<style:style style:name="Cel" style:family="table-cell"><style:table-cell-properties fo:padding="0.04in" fo:border="0.5pt solid #000000"/></style:style>';

  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ${ODT_NS}><office:automatic-styles>${autoText}${autoPara}${listStyles}${tableStyles}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`;
  const heading = (n, size) => `<style:style style:name="Heading_20_${n}" style:display-name="Heading ${n}" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:default-outline-level="${n}"><style:paragraph-properties fo:margin-top="0.17in" fo:margin-bottom="0.08in" fo:keep-with-next="always"/><style:text-properties fo:font-size="${size}pt" fo:font-weight="bold"/></style:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles ${ODT_NS}><office:styles>`
    + '<style:style style:name="Standard" style:family="paragraph"><style:text-properties style:font-name="Calibri" fo:font-size="11pt"/></style:style>'
    + RTF_HEAD_SIZES.map((s, i) => heading(i + 1, s)).join("")
    + '<style:style style:name="Title" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="28pt"/></style:style>'
    + '<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties style:font-name="Courier New" fo:font-size="10pt"/></style:style>'
    + "</office:styles></office:document-styles>";
  const meta = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-meta ${ODT_NS}><office:meta><dc:title>${xesc(title)}</dc:title><meta:generator>Libano</meta:generator></office:meta></office:document-meta>`;
  const manifest = '<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">'
    + '<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>'
    + '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>'
    + '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>'
    + '<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>'
    + images.map((im) => `<manifest:file-entry manifest:full-path="${im.name}" manifest:media-type="${im.mime}"/>`).join("")
    + "</manifest:manifest>";

  const zip = new JSZip();
  zip.file("mimetype", "application/vnd.oasis.opendocument.text", { compression: "STORE" });
  zip.file("META-INF/manifest.xml", manifest);
  zip.file("content.xml", content);
  zip.file("styles.xml", styles);
  zip.file("meta.xml", meta);
  images.forEach((im) => zip.file(im.name, im.b64, { base64: true }));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.oasis.opendocument.text" });
}

// ===========================================================================
// IMPORTAÇÃO — todos os formatos terminam em HTML saneado para o contentEditable.
// ===========================================================================

const ALLOWED_TAGS = new Set(["P", "DIV", "BR", "H1", "H2", "H3", "H4", "H5", "H6", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL", "SUP", "SUB",
  "CODE", "PRE", "BLOCKQUOTE", "UL", "OL", "LI", "A", "SPAN", "HR", "IMG", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "MARK"]);
const DROP_WITH_CONTENT = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "NOSCRIPT", "TEMPLATE", "HEAD", "TITLE", "META", "LINK", "SVG", "MATH", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "VIDEO", "AUDIO", "CANVAS"]);
const STYLE_KEEP = ["color", "background-color", "font-size", "font-family", "font-weight", "font-style", "text-decoration", "text-align", "vertical-align"];

// Whitelist de tags/atributos: nada de script, eventos on*, url() ou javascript:.
export function sanitizeImportedHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ""}</body>`, "text/html");
  const walk = (node) => {
    for (const ch of Array.from(node.childNodes)) {
      if (ch.nodeType === 8) { ch.remove(); continue; }
      if (ch.nodeType !== 1) continue;
      const tag = ch.tagName;
      if (DROP_WITH_CONTENT.has(tag)) { ch.remove(); continue; }
      walk(ch);
      if (!ALLOWED_TAGS.has(tag)) { ch.replaceWith(...Array.from(ch.childNodes)); continue; }
      const href = ch.getAttribute("href"), src = ch.getAttribute("src"), alt = ch.getAttribute("alt");
      const style = ch.getAttribute("style"), colspan = ch.getAttribute("colspan"), start = ch.getAttribute("start");
      for (const a of Array.from(ch.attributes)) ch.removeAttribute(a.name);
      if (tag === "A" && href && isSafeHref(href)) { ch.setAttribute("href", href); ch.setAttribute("target", "_blank"); ch.setAttribute("rel", "noopener noreferrer"); }
      if (tag === "IMG") {
        if (src && /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i.test(src)) { ch.setAttribute("src", src.replace(/\s/g, "")); if (alt) ch.setAttribute("alt", alt); }
        else { ch.remove(); continue; }
      }
      if ((tag === "TD" || tag === "TH") && /^\d{1,2}$/.test(colspan || "")) ch.setAttribute("colspan", colspan);
      if (tag === "OL" && /^\d{1,6}$/.test(start || "")) ch.setAttribute("start", start);
      if (style) {
        const keep = style.split(";").map((d) => d.trim()).filter((d) => {
          const [k, ...v] = d.split(":");
          const val = v.join(":");
          return STYLE_KEEP.includes((k || "").trim().toLowerCase()) && !/url\(|expression|javascript|@import|[<>]/i.test(val);
        });
        if (keep.length) ch.setAttribute("style", keep.join(";"));
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

export function decodeText(buf) {
  const u = new Uint8Array(buf);
  if (u[0] === 0xEF && u[1] === 0xBB && u[2] === 0xBF) return new TextDecoder("utf-8").decode(u.subarray(3));
  if (u[0] === 0xFF && u[1] === 0xFE) return new TextDecoder("utf-16le").decode(u.subarray(2));
  if (u[0] === 0xFE && u[1] === 0xFF) return new TextDecoder("utf-16be").decode(u.subarray(2));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(u); } catch { return new TextDecoder("windows-1252").decode(u); }
}

// ---- TXT ------------------------------------------------------------------

export function txtToHtml(text) {
  const clean = text.replace(/\r\n?/g, "\n").replace(/[^\S\n\t\u000C]|[\u0000-\u0008\u000B\u000E-\u001F]/g, (c) => (c === " " ? c : /\s/.test(c) ? " " : ""));
  return clean.split("\n").map((l) => (l === "" ? "<p><br></p>" : `<p>${esc(l.replace(/\u000C/g, ""))}</p>`)).join("");
}

// ---- Markdown ---------------------------------------------------------------

function mdInline(src, refs) {
  const hold = [];
  const keep = (h) => `\u0000${hold.push(h) - 1}\u0000`;
  let s = src;
  // escapes e spans de código viram marcadores para não serem reinterpretados
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!|<>~&"'])/g, (_, c) => keep(esc(c)));
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, __, c) => keep(`<code>${esc(c.replace(/^ (.*[^ ].*) $/, "$1"))}</code>`));
  s = s.replace(/<(https?:\/\/[^\s>]+|mailto:[^\s>]+)>/g, (_, u) => keep(`<a href="${esc(u)}">${esc(u)}</a>`));
  s = s.replace(/<br\s*\/?>/gi, () => keep("<br>"));
  s = s.replace(/<a id="[^"]*"><\/a>/g, "");
  s = esc(s).replace(/&amp;(#?\w+;)/g, "&$1");
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, u) => keep(/^data:image\//i.test(u) ? `<img src="${u}" alt="${alt}">` : esc(alt ? `[${alt}]` : "")));
  const link = (text, url) => (isSafeHref(url.replace(/^<|>$/g, "")) ? `<a href="${url.replace(/^&lt;|&gt;$/g, "")}">${text}</a>` : text);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, t, u) => link(t, u));
  s = s.replace(/\[([^\]]+)\]\[([^\]]*)\]|\[([^\]]+)\](?!\()/g, (m, t, id, t2) => {
    const key = (id || t || t2).trim().toLowerCase().replace(/\s+/g, " ");
    return refs[key] ? link(t || t2, esc(refs[key])) : m;
  });
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "<strong>$2</strong>");
  s = s.replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?![\w*])/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^\w_])_(?=\S)([^_]*?\S)_(?![\w_])/g, "$1<em>$2</em>");
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<s>$1</s>");
  s = s.replace(/(?:\\| {2,})\n/g, "<br>").replace(/\n/g, " ");
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => hold[Number(n)]);
}

export function markdownToHtml(md) {
  let lines = md.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  const refs = {};
  // definições [id]: url (fora de blocos de código)
  let fence = null;
  lines = lines.filter((l) => {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(l);
    if (f && !fence) fence = f[1][0]; else if (f && f[1][0] === fence) fence = null;
    if (fence) return true;
    const m = /^ {0,3}\[([^\]]+)\]:\s*<?(\S+?)>?(?:\s+["'(].*)?$/.exec(l);
    if (m) { refs[m[1].trim().toLowerCase().replace(/\s+/g, " ")] = m[2]; return false; }
    return true;
  });

  const blank = (l) => l.trim() === "";
  const hr = (l) => /^ {0,3}([-*_])( *\1){2,} *$/.test(l);
  const listM = (l) => /^( *)([-*+]|\d{1,9}[.)])\s+(.*)$/.exec(l);
  const splitRow = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));

  const renderList = (items) => {
    // items: [{indent, ordered, start, text}] -> HTML aninhado
    const build = (i, indent) => {
      const ordered = items[i].ordered;
      let html = `<${ordered ? "ol" : "ul"}${ordered && items[i].start > 1 ? ` start="${items[i].start}"` : ""}>`;
      while (i < items.length && items[i].indent >= indent) {
        if (items[i].indent > indent) { // sublista dentro do <li> anterior
          const [sub, next] = build(i, items[i].indent);
          html = html.replace(/<\/li>$/, "") + sub + "</li>";
          i = next; continue;
        }
        if (items[i].ordered !== ordered) break;
        html += `<li>${mdInline(items[i].text, refs)}</li>`;
        i++;
      }
      return [`${html}</${ordered ? "ol" : "ul"}>`, i];
    };
    let out = "", i = 0;
    while (i < items.length) { const [h, n] = build(i, items[i].indent); out += h; i = n; }
    return out;
  };

  const parse = (ls) => {
    let out = "";
    let i = 0;
    while (i < ls.length) {
      const l = ls[i];
      if (blank(l)) { i++; continue; }
      let m;
      if ((m = /^ {0,3}(`{3,}|~{3,})\s*(\S*)/.exec(l))) {
        const ch = m[1][0], len = m[1].length, code = [];
        i++;
        while (i < ls.length && !new RegExp(`^ {0,3}\\${ch}{${len},}\\s*$`).test(ls[i])) code.push(ls[i++]);
        i++;
        out += `<pre>${esc(code.join("\n"))}</pre>`;
        continue;
      }
      if ((m = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(l))) { out += `<h${m[1].length}>${mdInline(m[2], refs)}</h${m[1].length}>`; i++; continue; }
      if (hr(l)) { out += "<hr>"; i++; continue; }
      if (/^ {0,3}>/.test(l)) {
        const q = [];
        while (i < ls.length && /^ {0,3}>/.test(ls[i])) q.push(ls[i++].replace(/^ {0,3}> ?/, ""));
        out += `<blockquote>${parse(q).replace(/<\/p><p>/g, "<br><br>").replace(/^<p>|<\/p>$/g, "")}</blockquote>`;
        continue;
      }
      if (l.includes("|") && i + 1 < ls.length && /^ {0,3}\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(ls[i + 1]) && ls[i + 1].includes("-")) {
        const head = splitRow(l), al = splitRow(ls[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /^-+:$/.test(c) ? "right" : /^:-+$/.test(c) ? "left" : ""));
        i += 2;
        const cell = (tag, c, k) => `<${tag}${al[k] ? ` style="text-align:${al[k]}"` : ""}>${mdInline(c.replace(/<br\s*\/?>/gi, "\n"), refs).replace(/\n/g, "<br>")}</${tag}>`;
        let t = `<table><tr>${head.map((c, k) => cell("th", c, k)).join("")}</tr>`;
        while (i < ls.length && !blank(ls[i]) && ls[i].includes("|")) { t += `<tr>${splitRow(ls[i]).map((c, k) => cell("td", c, k)).join("")}</tr>`; i++; }
        out += `${t}</table>`;
        continue;
      }
      if ((m = listM(l)) && !hr(l)) {
        const items = [];
        while (i < ls.length) {
          const lm = listM(ls[i]);
          if (lm && !hr(ls[i])) {
            const ordered = /\d/.test(lm[2][0]);
            items.push({ indent: lm[1].length >= 2 ? Math.floor(lm[1].length / 2) * 2 : 0, ordered, start: ordered ? parseInt(lm[2], 10) : 1, text: lm[3] });
            i++;
          } else if (!blank(ls[i]) && /^ {2,}\S/.test(ls[i]) && items.length) { items[items.length - 1].text += `\n${ls[i].trim()}`; i++; }
          else if (blank(ls[i]) && i + 1 < ls.length && (listM(ls[i + 1]) || /^ {2,}\S/.test(ls[i + 1]))) i++;
          else break;
        }
        // normaliza recuos para níveis crescentes
        const stack = [];
        items.forEach((it) => {
          while (stack.length && stack[stack.length - 1] > it.indent) stack.pop();
          if (!stack.length || stack[stack.length - 1] < it.indent) stack.push(it.indent);
          it.indent = (stack.length - 1) * 2;
        });
        out += renderList(items);
        continue;
      }
      if (/^ {4,}\S/.test(l)) {
        const code = [];
        while (i < ls.length && (/^ {4}/.test(ls[i]) || blank(ls[i]))) code.push(ls[i++].replace(/^ {4}/, ""));
        while (code.length && blank(code[code.length - 1])) code.pop();
        out += `<pre>${esc(code.join("\n"))}</pre>`;
        continue;
      }
      const para = [l.trim()];
      i++;
      while (i < ls.length && !blank(ls[i]) && !/^ {0,3}(#{1,6}\s|>|`{3,}|~{3,})/.test(ls[i]) && !hr(ls[i]) && !listM(ls[i])) {
        if (/^ {0,3}(=+|-+)\s*$/.test(ls[i])) { const h = /^ *=/.test(ls[i]) ? 1 : 2; out += `<h${h}>${mdInline(para.join("\n"), refs)}</h${h}>`; para.length = 0; i++; break; }
        para.push(ls[i].replace(/^\s+/, "")); i++;
      }
      if (para.length) out += `<p>${mdInline(para.map((p, k) => (k < para.length - 1 && / {2,}$/.test(p) ? p : p.replace(/ +$/, ""))).join("\n"), refs)}</p>`;
    }
    return out;
  };
  return parse(lines);
}

// ---- HTML -------------------------------------------------------------------

export function htmlFileToHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title = (doc.querySelector("title")?.textContent || "").trim();
  return { title, html: sanitizeImportedHtml(doc.body ? doc.body.innerHTML : html) };
}

// ---- flow -> HTML saneado (usado por RTF/LaTeX/ODT/DOCX) --------------------

const flowToHtml = (flow) => sanitizeImportedHtml(flowToHtmlBody(flow));

// ---- RTF --------------------------------------------------------------------

const CP1252 = { 128: "€", 130: "‚", 131: "ƒ", 132: "„", 133: "…", 134: "†", 135: "‡", 136: "ˆ", 137: "‰", 138: "Š", 139: "‹", 140: "Œ", 142: "Ž", 145: "‘", 146: "’", 147: "“", 148: "”", 149: "•", 150: "–", 151: "—", 152: "˜", 153: "™", 154: "š", 155: "›", 156: "œ", 158: "ž", 159: "Ÿ" };
const RTF_SKIP = new Set(["fonttbl", "colortbl", "stylesheet", "info", "listtable", "listoverridetable", "listtext", "pntext", "pn", "header", "footer", "headerl", "headerr", "headerf", "footerl", "footerr", "footerf",
  "revtbl", "generator", "themedata", "colorschememapping", "datastore", "latentstyles", "xmlnstbl", "rsidtbl", "fldinst", "filetbl", "private", "oldcprops", "oldpprops", "factoidname", "mmathPr", "pgdsctbl", "shpinst", "falt", "panose", "bkmkstart", "bkmkend", "shptxt"]);
const hexColor = (r, g, b) => [r, g, b].map((n) => Math.min(255, n).toString(16).padStart(2, "0")).join("");

export function rtfToFlow(rtf) {
  if (!/^\s*\{\\rtf/.test(rtf)) throw new Error("Arquivo RTF inválido.");
  // campos HYPERLINK: guarda a URL num marcador próprio (o grupo \*\fldinst é ignorado como destino)
  const urls = [];
  rtf = rtf.replace(/\{\\field\s*\{\\\*\\fldinst\s*\{?\s*HYPERLINK\s+"([^"]+)"[^}]*\}?\}\s*\{\\fldrslt/g, (_, u) => `{\\libanolink${urls.push(u) - 1} {\\fldrslt`);
  const colors = [null];
  const ct = /\{\\colortbl\s*;?([^}]*)\}/.exec(rtf);
  if (ct) ct[1].split(";").forEach((c) => { const r = /\\red(\d+)\\green(\d+)\\blue(\d+)/.exec(c); if (r) colors.push(hexColor(+r[1], +r[2], +r[3])); });
  const fonts = {};
  const ft = /\{\\fonttbl([\s\S]*?)\}\s*\n?\{\\(?:colortbl|\*|stylesheet)/.exec(rtf);
  if (ft) for (const m of ft[1].matchAll(/\\f(\d+)[^;{}]*?\s([^;{}\\]+);/g)) fonts[m[1]] = m[2].trim();
  // listas: \ls -> \listid -> níveis (\levelnfc 23 = marcador)
  const listKinds = {}, lsToList = {};
  for (const m of rtf.matchAll(/\{\\list\\listtemplateid\d+[\s\S]*?\\listid(\d+)\}/g)) {
    listKinds[m[1]] = [...m[0].matchAll(/\\levelnfc(\d+)/g)].map((x) => x[1] !== "23");
  }
  for (const m of rtf.matchAll(/\\listoverride\\listid(\d+)\\listoverridecount\d+\\ls(\d+)/g)) lsToList[m[2]] = m[1];

  const flow = [];
  let row = null, cellRuns = [], states = [];
  let st = { b: false, i: false, ul: false, strike: false, sup: false, sub: false, fs: null, cf: 0, hl: 0, f: null, skip: false, uc: 1, link: null, pict: null, field: false };
  let para = { align: null, style: 0, ls: null, ilvl: 0, intbl: false, quote: false, code: false };
  let pend = []; // runs do parágrafo atual
  let inPict = null;
  const fmt = () => ({ bold: st.b, italic: st.i, underline: st.ul, strike: st.strike, sup: st.sup, sub: st.sub, color: st.cf ? colors[st.cf] : null, highlight: st.hl ? colors[st.hl] : null, font: st.f != null ? fonts[st.f] : null, fontSizePt: st.fs ? st.fs / 2 : null, link: st.link, code: st.f != null && /courier|mono|consolas/i.test(fonts[st.f] || "") });
  const addText = (t) => { if (!t || st.skip || inPict) return; pend.push({ text: t, ...fmt() }); };
  const endPara = () => {
    const runs = mergeRuns(pend); pend = [];
    if (para.intbl) { if (cellRuns.length && runs.length) cellRuns.push({ text: "\n" }); cellRuns.push(...runs); return; }
    const blk = { type: "para", kind: "normal", align: para.align, runs };
    if (para.style >= 1 && para.style <= 6) { blk.kind = "heading"; blk.level = para.style; }
    else if (para.style === 7) blk.kind = "title";
    else if (para.style === 8) blk.kind = "quote";
    else if (para.style === 9) blk.kind = "code";
    if (blk.kind !== "normal") blk.runs.forEach((r) => { if (r.text != null) { r.fontSizePt = null; if (blk.kind === "heading" || blk.kind === "title") r.bold = false; if (blk.kind === "quote") r.italic = false; if (blk.kind === "code") { r.font = null; r.code = true; } } });
    blk.runs = mergeRuns(blk.runs);
    if (para.ls != null) {
      const kinds = listKinds[lsToList[para.ls]];
      blk.list = { ordered: kinds ? kinds[Math.min(para.ilvl, kinds.length - 1)] !== false : false, level: para.ilvl, start: 1 };
    }
    flow.push(blk);
  };
  const resetPara = () => { para = { align: null, style: 0, ls: null, ilvl: 0, intbl: para.intbl && false, quote: false, code: false }; };

  let i = 0;
  const n = rtf.length;
  while (i < n) {
    const c = rtf[i];
    if (c === "{") { states.push({ ...st }); i++; continue; }
    if (c === "}") {
      if (inPict && states.length - 1 < inPict.depth) {
        const im = inPict; inPict = null;
        if (im.hex.length > 20) {
          const bytes = im.hex.match(/../g).map((h) => String.fromCharCode(parseInt(h, 16))).join("");
          pend.push({ image: `data:image/${im.type};base64,${btoa(bytes)}`, alt: "" });
        }
      }
      st = states.pop() || st; i++;
      continue;
    }
    if (c === "\\") {
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i, i + 40));
      if (m) {
        i += m[0].length;
        const w = m[1], p = m[2] != null ? parseInt(m[2], 10) : null;
        if (st.skip) { continue; }
        if (RTF_SKIP.has(w)) { st.skip = true; continue; }
        switch (w) {
          case "pict": inPict = { depth: states.length, type: "png", hex: "" }; break;
          case "pngblip": if (inPict) inPict.type = "png"; break;
          case "jpegblip": if (inPict) inPict.type = "jpeg"; break;
          case "par": endPara(); resetPara(); break;
          case "line": addText("\n"); break;
          case "tab": addText("\t"); break;
          case "page": case "sect": endPara(); flow.push({ type: "para", kind: "pagebreak", runs: [] }); break;
          case "pard": para.align = null; para.style = 0; para.ls = null; para.ilvl = 0; para.intbl = false; break;
          case "plain": st = { ...st, b: false, i: false, ul: false, strike: false, sup: false, sub: false, fs: null, cf: 0, hl: 0, f: null }; break;
          case "b": st.b = p !== 0; break;
          case "i": st.i = p !== 0; break;
          case "ul": st.ul = p !== 0; break;
          case "ulnone": st.ul = false; break;
          case "strike": st.strike = p !== 0; break;
          case "super": st.sup = true; st.sub = false; break;
          case "sub": st.sub = true; st.sup = false; break;
          case "nosupersub": st.sup = st.sub = false; break;
          case "fs": st.fs = p; break;
          case "cf": st.cf = p; break;
          case "highlight": case "cb": st.hl = p; break;
          case "f": st.f = String(p); break;
          case "uc": st.uc = p; break;
          case "qc": para.align = "center"; break;
          case "qr": para.align = "right"; break;
          case "qj": para.align = "justify"; break;
          case "ql": para.align = null; break;
          case "s": para.style = p; break;
          case "ls": para.ls = String(p); break;
          case "ilvl": para.ilvl = p; break;
          case "intbl": para.intbl = true; break;
          case "trowd": row = []; cellRuns = []; break;
          case "cell": {
            if (pend.length) { cellRuns.push(...mergeRuns(pend)); pend = []; }
            if (row) row.push({ runs: mergeRuns(cellRuns), colspan: 1, header: false, align: null });
            cellRuns = [];
            break;
          }
          case "row": if (row) { if (row.length) { const last = flow[flow.length - 1]; if (last && last.type === "table" && last.open) last.rows.push(row); else flow.push({ type: "table", rows: [row], open: true }); } row = null; } break;
          case "emdash": addText("—"); break;
          case "endash": addText("–"); break;
          case "bullet": addText("•"); break;
          case "lquote": addText("‘"); break;
          case "rquote": addText("’"); break;
          case "ldblquote": addText("“"); break;
          case "rdblquote": addText("”"); break;
          case "u": {
            let code = p; if (code < 0) code += 65536;
            addText(String.fromCharCode(code));
            // pula os \uc caracteres de substituição
            for (let k = 0; k < st.uc && i < n; k++) { if (rtf[i] === "\\" && rtf[i + 1] === "'") i += 4; else if (rtf[i] !== "\\" && rtf[i] !== "{" && rtf[i] !== "}") i++; }
            break;
          }
          case "libanolink": { const u = urls[p]; if (u && isSafeHref(u)) st.link = u; break; }
          default: break;
        }
        if (w === "par" || w === "row") continue;
        continue;
      }
      const d = rtf[i + 1];
      if (d === "'") { const code = parseInt(rtf.slice(i + 2, i + 4), 16); if (!st.skip) addText(CP1252[code] || String.fromCharCode(code)); i += 4; continue; }
      if (d === "*") { const next = /^\\\*\\([a-zA-Z]+)/.exec(rtf.slice(i, i + 40)); i += 2; if (next && next[1] === "fldinst") { /* tratado abaixo */ } else if (!/^\\(?:shppict|nonshppict)/.test(rtf.slice(i, i + 12))) st.skip = true; continue; }
      if (d === "\\" || d === "{" || d === "}") { addText(d); i += 2; continue; }
      if (d === "~") { addText("\u00A0"); i += 2; continue; }
      if (d === "-") { i += 2; continue; }
      if (d === "_") { addText("\u2011"); i += 2; continue; }
      i += 2;
      continue;
    }
    if (c === "\n" || c === "\r") { i++; continue; }
    // texto literal / hex de imagem
    let j = i;
    while (j < n && rtf[j] !== "\\" && rtf[j] !== "{" && rtf[j] !== "}") j++;
    const chunk = rtf.slice(i, j);
    if (inPict) inPict.hex += chunk.replace(/\s/g, "");
    else {
      // campo HYPERLINK: o destino fldinst é ignorado como grupo; recupera a URL do texto bruto
      addText(chunk.replace(/[\r\n]/g, ""));
    }
    i = j;
  }
  if (pend.length) endPara();
  flow.forEach((b) => { if (b.open) delete b.open; });
  return flow.length ? flow : [{ type: "para", kind: "normal", runs: [] }];
}

// ---- LaTeX (latex.rs import, subconjunto: o que o próprio exportador escreve + comandos comuns) ----

function texReadBalanced(s, i) { // s[i] === "{" -> [conteúdo, índice depois do "}"]
  let depth = 0, j = i;
  for (; j < s.length; j++) {
    if (s[j] === "\\") { j++; continue; }
    if (s[j] === "{") depth++;
    else if (s[j] === "}") { depth--; if (depth === 0) return [s.slice(i + 1, j), j + 1]; }
  }
  return [s.slice(i + 1), s.length];
}
const TEX_ACCENTS = { "'": { a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú" }, "`": { a: "à", e: "è", o: "ò", A: "À" }, "^": { a: "â", e: "ê", o: "ô", A: "Â", E: "Ê", O: "Ô" }, "~": { a: "ã", o: "õ", n: "ñ", A: "Ã", O: "Õ" }, '"': { a: "ä", e: "ë", o: "ö", u: "ü", A: "Ä", O: "Ö", U: "Ü" } };
const TEX_SYMBOLS = { textbackslash: "\\", textasciitilde: "~", textasciicircum: "^", textless: "<", textgreater: ">", textbar: "|", textasciigrave: "`", quad: "\u2003", qquad: "\u2003\u2003", ldots: "…", dots: "…", LaTeX: "LaTeX", TeX: "TeX", copyright: "©", textregistered: "®", texttrademark: "™", ss: "ß", aa: "å", ae: "æ", oe: "œ", o: "ø", l: "ł", S: "§", P: "¶", dag: "†", ddag: "‡" };

function texInline(s, f = {}) {
  const runs = [];
  const push = (text, fm) => { if (text) runs.push({ text, ...fm }); };
  let buf = "", i = 0;
  const flush = () => { push(buf, f); buf = ""; };
  const withFmt = (extra, arg) => { flush(); runs.push(...texInline(arg, { ...f, ...extra })); };
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") {
      const nm = /^\\([a-zA-Z]+)\*?/.exec(s.slice(i));
      if (!nm) {
        const d = s[i + 1];
        if (d === "\\") { buf += "\n"; i += 2; if (s[i] === "[") { const k = s.indexOf("]", i); if (k > 0) i = k + 1; } continue; }
        if (d && TEX_ACCENTS[d]) { const rest = s.slice(i + 2).replace(/^\{?(\w)\}?/, (m, l) => { buf += TEX_ACCENTS[d][l] || l; return ""; }); i = s.length - rest.length; continue; }
        if (d === "&" || d === "%" || d === "$" || d === "#" || d === "_" || d === "{" || d === "}") { buf += d; i += 2; continue; }
        if (d === " " || d === ",") { buf += " "; i += 2; continue; }
        i += 2; continue;
      }
      const name = nm[1];
      i += nm[0].length;
      const skipWs = () => { while (s[i] === " ") i++; };
      const opt = () => { if (s[i] === "[") { const k = s.indexOf("]", i); if (k > 0) { const v = s.slice(i + 1, k); i = k + 1; return v; } } return null; };
      const arg = () => { skipWs(); if (s[i] === "{") { const [a, nx] = texReadBalanced(s, i); i = nx; return a; } return ""; };
      switch (name) {
        case "textbf": withFmt({ bold: true }, arg()); break;
        case "textit": case "emph": case "textsl": withFmt({ italic: true }, arg()); break;
        case "underline": case "uline": withFmt({ underline: true }, arg()); break;
        case "sout": withFmt({ strike: true }, arg()); break;
        case "texttt": withFmt({ code: true }, arg()); break;
        case "textsuperscript": withFmt({ sup: true }, arg()); break;
        case "textsubscript": withFmt({ sub: true }, arg()); break;
        case "textcolor": { const model = opt(); const col = arg(); const body = arg(); const hex = model === "HTML" && /^[0-9a-fA-F]{6}$/.test(col) ? col.toLowerCase() : null; withFmt(hex ? { color: hex } : {}, body); break; }
        case "href": { const u = arg().replace(/\\([%#&_])/g, "$1"); const body = arg(); withFmt(isSafeHref(u) ? { link: u } : {}, body); break; }
        case "hyperlink": { const t = arg(); const body = arg(); withFmt({ link: `#${t}` }, body); break; }
        case "url": { const u = arg().replace(/\\([%#&_])/g, "$1"); flush(); push(u, isSafeHref(u) ? { ...f, link: u } : f); break; }
        case "fontsize": { const sz = parseFloat(arg()); arg(); skipWs(); if (s.startsWith("\\selectfont", i)) i += 11; const rest = s.slice(i); i = s.length; flush(); runs.push(...texInline(rest, sz > 0 ? { ...f, fontSizePt: sz } : f)); break; }
        case "mbox": case "textrm": case "textnormal": case "hbox": case "noindent": case "centering": case "selectfont": case "par": case "relax": case "hfill": case "vspace": case "hspace": case "label": case "index":
          if (name === "par") buf += "\n"; else if (["mbox", "textrm", "textnormal", "hbox"].includes(name)) withFmt({}, arg()); else if (["vspace", "hspace", "label", "index"].includes(name)) { opt(); arg(); }
          break;
        case "item": break;
        default:
          if (TEX_SYMBOLS[name] != null) { buf += TEX_SYMBOLS[name]; if (s[i] === "{" && s[i + 1] === "}") i += 2; else skipWs(); }
          else { opt(); }
      }
      continue;
    }
    if (c === "$") { // matemática: mantém o código-fonte em itálico
      const k = s.indexOf("$", i + 1);
      if (k > 0) { flush(); push(s.slice(i + 1, k), { ...f, italic: true }); i = k + 1; continue; }
    }
    if (c === "{" || c === "}") { i++; continue; }
    if (c === "~") { buf += "\u00A0"; i++; continue; }
    if (c === "-" && s.startsWith("---", i)) { buf += "—"; i += 3; continue; }
    if (c === "-" && s.startsWith("--", i)) { buf += "–"; i += 2; continue; }
    if (c === "`" && s[i + 1] === "`") { buf += "“"; i += 2; continue; }
    if (c === "'" && s[i + 1] === "'") { buf += "”"; i += 2; continue; }
    if (c === "`") { buf += "‘"; i++; continue; }
    if (c === "\n") { buf += " "; i++; continue; }
    buf += c; i++;
  }
  flush();
  return runs;
}

function texFindEnd(s, name, from) { // índice do \end{name} que fecha o \begin{name} anterior a `from`
  const re = new RegExp(`\\\\(begin|end)\\{${name.replace(/\*/g, "\\*")}\\}`, "g");
  re.lastIndex = from;
  let depth = 1, m;
  while ((m = re.exec(s))) { depth += m[1] === "begin" ? 1 : -1; if (depth === 0) return m.index; }
  return -1;
}

function texList(inner, ordered, level, out) {
  const parts = [];
  let depth = 0, last = -1;
  const re = /\\(begin|end)\{(itemize|enumerate)\}|\\item\b/g;
  let m;
  while ((m = re.exec(inner))) {
    if (m[1] === "begin") depth++; else if (m[1] === "end") depth--;
    else if (depth === 0) { if (last >= 0) parts.push(inner.slice(last, m.index)); last = m.index + m[0].length; }
  }
  if (last >= 0) parts.push(inner.slice(last));
  for (const part of parts) {
    const nested = /\\begin\{(itemize|enumerate)\}/.exec(part);
    const text = nested ? part.slice(0, nested.index) : part;
    out.push({ type: "para", kind: "normal", runs: mergeRuns(texInline(text.replace(/^\s*\[[^\]]*\]/, "").trim())), list: { ordered, level, start: 1 } });
    let rest = nested ? part.slice(nested.index) : "";
    while (rest) {
      const b = /\\begin\{(itemize|enumerate)\}/.exec(rest);
      if (!b) break;
      const endAt = texFindEnd(rest, b[1], b.index + b[0].length);
      if (endAt < 0) break;
      texList(rest.slice(b.index + b[0].length, endAt), b[1] === "enumerate", level + 1, out);
      rest = rest.slice(endAt + `\\end{${b[1]}}`.length);
    }
  }
}

function texTable(inner) {
  const rows = [];
  const cleaned = inner.replace(/\\(hline|toprule|midrule|bottomrule)\b/g, "").replace(/\\cline\{[^}]*\}/g, "");
  let depth = 0, cell = "", row = [];
  const endCell = () => { row.push(cell); cell = ""; };
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (c === "\\" && cleaned[i + 1] === "\\" && depth === 0) { endCell(); if (row.some((x) => x.trim())) rows.push(row); row = []; i++; continue; }
    if (c === "\\") { cell += c + (cleaned[i + 1] || ""); i++; continue; }
    if (c === "{") depth++; else if (c === "}") depth--;
    if (c === "&" && depth === 0) { endCell(); continue; }
    cell += c;
  }
  endCell(); if (row.some((x) => x.trim())) rows.push(row);
  return {
    type: "table",
    rows: rows.map((r, ri) => r.map((txt) => {
      let colspan = 1;
      let t = txt.trim();
      const mc = /^\\multicolumn\{(\d+)\}\{[^}]*\}\s*\{([\s\S]*)\}$/.exec(t);
      if (mc) { colspan = parseInt(mc[1], 10); t = mc[2]; }
      t = t.replace(/\\cellcolor(\[[^\]]*\])?\{[^}]*\}/g, "");
      return { runs: mergeRuns(texInline(t)), colspan, header: false, align: null, _ri: ri };
    })),
  };
}

function texBlocks(s, ctx, out, meta) {
  let buf = "", i = 0;
  const flush = () => {
    const t = buf.trim(); buf = "";
    if (!t) return;
    const runs = mergeRuns(texInline(t));
    if (runs.length) out.push({ type: "para", kind: ctx.kind || "normal", align: ctx.align || null, runs });
  };
  while (i < s.length) {
    const rest = s.slice(i, i + 200);
    let m;
    if ((m = /^\n[ \t]*\n\s*/.exec(rest))) { flush(); i += m[0].length; continue; }
    if ((m = /^\\begin\{([a-zA-Z*]+)\}/.exec(rest))) {
      const name = m[1];
      const endAt = texFindEnd(s, name, i + m[0].length);
      if (endAt >= 0) {
        flush();
        let inner = s.slice(i + m[0].length, endAt);
        i = endAt + `\\end{${name}}`.length;
        if (name === "itemize" || name === "enumerate") texList(inner, name === "enumerate", 0, out);
        else if (name === "verbatim" || name === "lstlisting") inner.replace(/^\n/, "").replace(/\n$/, "").split("\n").forEach((l) => out.push({ type: "para", kind: "code", runs: l ? [{ text: l, code: true }] : [] }));
        else if (name === "tabular" || name === "tabularx" || name === "longtable") { inner = inner.replace(/^\s*(\[[^\]]*\])?\s*(\{(?:[^{}]|\{[^{}]*\})*\})?/, ""); out.push(texTable(inner)); }
        else if (name === "quote" || name === "quotation") texBlocks(inner, { ...ctx, kind: "quote" }, out, meta);
        else if (name === "center") texBlocks(inner, { ...ctx, align: "center" }, out, meta);
        else if (name === "flushright") texBlocks(inner, { ...ctx, align: "right" }, out, meta);
        else if (/^(equation|align|gather|displaymath|math|eqnarray)\*?$/.test(name)) out.push({ type: "para", kind: "normal", align: "center", runs: [{ text: inner.trim(), italic: true }] });
        else texBlocks(inner, ctx, out, meta);
        continue;
      }
    }
    if ((m = /^\\(chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(\[[^\]]*\])?\s*\{/.exec(rest))) {
      flush();
      const [arg, nx] = texReadBalanced(s, i + m[0].length - 1);
      const lvl = { chapter: 1, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 }[m[1]];
      out.push({ type: "para", kind: "heading", level: lvl, runs: mergeRuns(texInline(arg)) });
      i = nx; continue;
    }
    if ((m = /^\\title\s*\{/.exec(rest))) { const [arg, nx] = texReadBalanced(s, i + m[0].length - 1); meta.title = arg; i = nx; continue; }
    if ((m = /^\\(author|date)\s*\{/.exec(rest))) { const [, nx] = texReadBalanced(s, i + m[0].length - 1); i = nx; continue; }
    if (/^\\maketitle\b/.test(rest)) { flush(); if (meta.title) out.push({ type: "para", kind: "title", runs: mergeRuns(texInline(meta.title)) }); i += 10; continue; }
    if ((m = /^\\(clearpage|newpage|pagebreak)\b/.exec(rest))) { flush(); out.push({ type: "para", kind: "pagebreak", runs: [] }); i += m[0].length; continue; }
    if ((m = /^(\\noindent\s*)?\\rule\s*\{[^}]*\}\s*\{[^}]*\}/.exec(rest))) { flush(); out.push({ type: "para", kind: "rule", runs: [] }); i += m[0].length; continue; }
    if (rest.startsWith("\\[")) { const k = s.indexOf("\\]", i); if (k > 0) { flush(); out.push({ type: "para", kind: "normal", align: "center", runs: [{ text: s.slice(i + 2, k).trim(), italic: true }] }); i = k + 2; continue; } }
    buf += s[i]; i++;
  }
  flush();
}

export function latexToFlow(src) {
  let s = src.replace(/\r\n?/g, "\n").replace(/(^|[^\\])%.*$/gm, "$1");
  const meta = {};
  const t = /\\title\s*\{/.exec(s);
  if (t) meta.title = texReadBalanced(s, t.index + t[0].length - 1)[0];
  const b = s.indexOf("\\begin{document}");
  if (b >= 0) { const e = s.lastIndexOf("\\end{document}"); s = s.slice(b + 16, e > b ? e : undefined); }
  const out = [];
  texBlocks(s, {}, out, meta);
  return { flow: out.length ? out : [{ type: "para", kind: "normal", runs: [] }], title: meta.title ? runsText(texInline(meta.title)) : "" };
}

// ---- XML (ODT / DOCX) --------------------------------------------------------

const xmlDoc = (str) => new DOMParser().parseFromString(str, "application/xml");
const elKids = (el) => Array.from(el.childNodes).filter((n) => n.nodeType === 1);
const attr = (el, name) => el.getAttribute(name) ?? el.getAttributeNS?.("*", name.split(":").pop()) ?? null;

async function openZip(buf) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buf);
  const total = Object.values(zip.files).reduce((n, f) => n + (f._data?.uncompressedSize || 0), 0);
  if (total > 200 * 1024 * 1024) throw new Error("Arquivo grande demais.");
  return zip;
}
async function zipImages(zip, prefix) {
  const map = {};
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith(prefix) || zip.files[name].dir) continue;
    const ext = name.split(".").pop().toLowerCase();
    const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp" }[ext];
    if (mime) map[name] = `data:${mime};base64,${await zip.files[name].async("base64")}`;
  }
  return map;
}

// ---- ODT -----------------------------------------------------------------------

export async function odtToFlow(buf) {
  const zip = await openZip(buf);
  const contentFile = zip.file("content.xml");
  if (!contentFile) throw new Error("Arquivo ODT inválido.");
  const content = xmlDoc(await contentFile.async("string"));
  const stylesXml = zip.file("styles.xml") ? xmlDoc(await zip.file("styles.xml").async("string")) : null;
  const images = await zipImages(zip, "Pictures/");
  const styles = {}, listStyles = {};
  for (const d of [stylesXml, content]) {
    if (!d) continue;
    for (const st of Array.from(d.getElementsByTagName("style:style"))) {
      const name = st.getAttribute("style:name");
      const tp = st.getElementsByTagName("style:text-properties")[0];
      const pp = st.getElementsByTagName("style:paragraph-properties")[0];
      const a = (e, k) => e?.getAttribute(k) || null;
      styles[name] = {
        parent: st.getAttribute("style:parent-style-name"),
        bold: a(tp, "fo:font-weight") === "bold", italic: a(tp, "fo:font-style") === "italic",
        underline: !!a(tp, "style:text-underline-style") && a(tp, "style:text-underline-style") !== "none",
        strike: !!a(tp, "style:text-line-through-style") && a(tp, "style:text-line-through-style") !== "none",
        sup: /^super/.test(a(tp, "style:text-position") || ""), sub: /^sub/.test(a(tp, "style:text-position") || ""),
        color: /^#[0-9a-f]{6}$/i.test(a(tp, "fo:color") || "") && a(tp, "fo:color").toLowerCase() !== "#000000" ? a(tp, "fo:color").slice(1).toLowerCase() : null,
        highlight: /^#[0-9a-f]{6}$/i.test(a(tp, "fo:background-color") || "") ? a(tp, "fo:background-color").slice(1).toLowerCase() : null,
        fontSizePt: /pt$/.test(a(tp, "fo:font-size") || "") ? parseFloat(a(tp, "fo:font-size")) : null,
        font: a(tp, "fo:font-family") || a(tp, "style:font-name"),
        align: { center: "center", end: "right", right: "right", justify: "justify" }[a(pp, "fo:text-align")] || null,
        pageBreak: a(pp, "fo:break-before") === "page",
        indent: !!a(pp, "fo:margin-left") && parseFloat(a(pp, "fo:margin-left")) > 0.2,
      };
    }
    for (const ls of Array.from(d.getElementsByTagName("text:list-style"))) {
      listStyles[ls.getAttribute("text:style-name") || ls.getAttribute("style:name")] = elKids(ls).map((l) => l.localName === "list-level-style-number");
    }
  }
  const resolve = (name) => { // junta a cadeia de estilos pai
    const out = {}; const chain = []; let n = name, guard = 0;
    while (n && styles[n] && guard++ < 10) { chain.unshift(styles[n]); n = styles[n].parent; }
    chain.forEach((s) => Object.entries(s).forEach(([k, v]) => { if (v && k !== "parent") out[k] = v; }));
    return out;
  };
  const baseFmt = (name) => { if (/^(Standard|Heading|Title|Preformatted|Quotations|Text_20_body|Default)/.test(name || "")) return {}; const r = resolve(name); return { bold: r.bold, italic: r.italic, underline: r.underline, strike: r.strike, sup: r.sup, sub: r.sub, color: r.color, highlight: r.highlight, fontSizePt: r.fontSizePt, font: null, code: /courier|mono|consolas/i.test(r.font || "") }; };

  const inline = (el, f, out) => {
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3) { out.push({ text: n.nodeValue.replace(/\s+/g, " "), ...f }); continue; }
      if (n.nodeType !== 1) continue;
      switch (n.nodeName) {
        case "text:span": inline(n, { ...f, ...Object.fromEntries(Object.entries(baseFmt(n.getAttribute("text:style-name"))).filter(([, v]) => v)) }, out); break;
        case "text:a": { const h = n.getAttribute("xlink:href"); inline(n, h && isSafeHref(h) ? { ...f, link: h } : f, out); break; }
        case "text:line-break": out.push({ text: "\n", ...f }); break;
        case "text:tab": out.push({ text: "\t", ...f }); break;
        case "text:s": out.push({ text: " ".repeat(parseInt(n.getAttribute("text:c") || "1", 10) || 1), ...f }); break;
        case "draw:frame": { const im = n.getElementsByTagName("draw:image")[0]; const src = im && images[im.getAttribute("xlink:href")]; if (src) out.push({ image: src, alt: n.getElementsByTagName("svg:title")[0]?.textContent || "" }); break; }
        case "text:note": case "office:annotation": break;
        default: inline(n, f, out);
      }
    }
  };
  const flow = [];
  const para = (el, extra = {}) => {
    const sn = el.getAttribute("text:style-name");
    const r = resolve(sn);
    if (r.pageBreak) flow.push({ type: "para", kind: "pagebreak", runs: [] });
    const runs = []; inline(el, baseFmt(sn), runs);
    let kind = extra.kind || "normal";
    if (kind === "normal" && /Preformatted|Source/i.test(sn || "") ) kind = "code";
    if (kind === "normal" && /Quotation/i.test(sn || "")) kind = "quote";
    if (kind === "normal" && /^Title$/i.test(sn || "")) kind = "title";
    flow.push({ type: "para", kind, level: extra.level, align: r.align, runs: mergeRuns(runs), list: extra.list });
  };
  const walkList = (ul, level, styleName) => {
    const sn = ul.getAttribute("text:style-name") || styleName;
    const kinds = listStyles[sn];
    for (const item of elKids(ul)) {
      if (item.localName !== "list-item" && item.localName !== "list-header") continue;
      for (const ch of elKids(item)) {
        if (ch.nodeName === "text:p" || ch.nodeName === "text:h") para(ch, { list: { ordered: kinds ? !!kinds[Math.min(level, kinds.length - 1)] : false, level, start: 1 } });
        else if (ch.nodeName === "text:list") walkList(ch, level + 1, sn);
      }
    }
  };
  const walk = (parent) => {
    for (const el of elKids(parent)) {
      switch (el.nodeName) {
        case "text:h": para(el, { kind: "heading", level: parseInt(el.getAttribute("text:outline-level") || "1", 10) || 1 }); break;
        case "text:p": para(el); break;
        case "text:list": walkList(el, 0); break;
        case "table:table": {
          const rows = [];
          for (const tr of Array.from(el.getElementsByTagName("table:table-row"))) {
            const cells = [];
            for (const td of elKids(tr)) {
              if (td.nodeName !== "table:table-cell") continue;
              const runs = [];
              elKids(td).forEach((p, k) => { if (k) runs.push({ text: "\n" }); inline(p, baseFmt(p.getAttribute("text:style-name")), runs); });
              cells.push({ runs: mergeRuns(runs), colspan: parseInt(td.getAttribute("table:number-columns-spanned") || "1", 10) || 1, header: false, align: null });
            }
            rows.push(cells);
          }
          if (rows.length) flow.push({ type: "table", rows });
          break;
        }
        case "text:section": case "text:table-of-content": walk(el); break;
        default: break;
      }
    }
  };
  const body = content.getElementsByTagName("office:text")[0];
  if (body) walk(body);
  const title = xmlDoc(zip.file("meta.xml") ? await zip.file("meta.xml").async("string") : "<a/>").getElementsByTagName("dc:title")[0]?.textContent || "";
  return { flow: flow.length ? flow : [{ type: "para", kind: "normal", runs: [] }], title };
}

// ---- DOCX (leitura) ----------------------------------------------------------------

const DOCX_HILITE = { yellow: "ffff00", green: "00ff00", cyan: "00ffff", magenta: "ff00ff", blue: "0000ff", red: "ff0000", darkBlue: "000080", darkCyan: "008080", darkGreen: "008000", darkMagenta: "800080", darkRed: "800000", darkYellow: "808000", darkGray: "808080", lightGray: "c0c0c0" };

export async function docxToFlow(buf) {
  const zip = await openZip(buf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Arquivo DOCX inválido.");
  const doc = xmlDoc(await docFile.async("string"));
  const stylesDoc = zip.file("word/styles.xml") ? xmlDoc(await zip.file("word/styles.xml").async("string")) : null;
  const numDoc = zip.file("word/numbering.xml") ? xmlDoc(await zip.file("word/numbering.xml").async("string")) : null;
  const relsDoc = zip.file("word/_rels/document.xml.rels") ? xmlDoc(await zip.file("word/_rels/document.xml.rels").async("string")) : null;
  const media = await zipImages(zip, "word/media/");
  const rels = {};
  if (relsDoc) for (const r of Array.from(relsDoc.getElementsByTagName("Relationship"))) rels[r.getAttribute("Id")] = { target: r.getAttribute("Target"), external: r.getAttribute("TargetMode") === "External" };
  const W = (el, name) => elKids(el).find((c) => c.nodeName === `w:${name}`);
  const val = (el) => el?.getAttribute("w:val");
  const on = (el) => !!el && !["0", "false", "none", "off"].includes((val(el) || "true").toLowerCase());

  const styleNames = {};
  if (stylesDoc) for (const s of Array.from(stylesDoc.getElementsByTagName("w:style"))) styleNames[s.getAttribute("w:styleId")] = (val(W(s, "name")) || "").toLowerCase();
  // numeração: numId -> abstractNum -> formato por nível
  const abs = {}, numToAbs = {};
  if (numDoc) {
    for (const a of Array.from(numDoc.getElementsByTagName("w:abstractNum"))) {
      abs[a.getAttribute("w:abstractNumId")] = Array.from(a.getElementsByTagName("w:lvl")).map((l) => ({ lvl: parseInt(l.getAttribute("w:ilvl"), 10), fmt: val(W(l, "numFmt")) || "decimal", start: parseInt(val(W(l, "start")) || "1", 10) }));
    }
    for (const n of Array.from(numDoc.getElementsByTagName("w:num"))) numToAbs[n.getAttribute("w:numId")] = val(W(n, "abstractNumId"));
  }
  const listInfo = (numId, ilvl) => {
    const lv = (abs[numToAbs[numId]] || []).find((l) => l.lvl === ilvl);
    return { ordered: lv ? lv.fmt !== "bullet" && lv.fmt !== "none" : false, level: ilvl, start: lv?.start || 1 };
  };

  const flow = [];
  const rFmt = (rPr) => {
    if (!rPr) return {};
    const f = {};
    if (on(W(rPr, "b"))) f.bold = true;
    if (on(W(rPr, "i"))) f.italic = true;
    if (on(W(rPr, "u"))) f.underline = true;
    if (on(W(rPr, "strike")) || on(W(rPr, "dstrike"))) f.strike = true;
    const va = val(W(rPr, "vertAlign")); if (va === "superscript") f.sup = true; else if (va === "subscript") f.sub = true;
    const col = val(W(rPr, "color")); if (col && /^[0-9a-f]{6}$/i.test(col) && col.toLowerCase() !== "000000") f.color = col.toLowerCase();
    const hl = val(W(rPr, "highlight")); if (hl && DOCX_HILITE[hl]) f.highlight = DOCX_HILITE[hl];
    const sz = parseInt(val(W(rPr, "sz")) || "", 10); if (sz > 0) f.fontSizePt = sz / 2;
    const rf = W(rPr, "rFonts"); const font = rf?.getAttribute("w:ascii"); if (font) { f.font = font; if (/courier|consolas|mono/i.test(font)) f.code = true; }
    return f;
  };
  const drawing = (el) => {
    const blip = el.getElementsByTagName("a:blip")[0];
    const id = blip?.getAttribute("r:embed");
    const r = id && rels[id];
    if (!r || r.external) return null;
    const path = ("word/" + r.target).replace(/\/\.\//g, "/").replace(/word\/\.\.\//, "");
    const src = media[path] || media[r.target.replace(/^\//, "")];
    const alt = el.getElementsByTagName("wp:docPr")[0]?.getAttribute("descr") || "";
    return src ? { image: src, alt } : null;
  };
  const runsOf = (p, link) => {
    const runs = [];
    const visit = (node, linkHref) => {
      for (const ch of elKids(node)) {
        if (ch.nodeName === "w:r") {
          const f = { ...rFmt(W(ch, "rPr")), ...(linkHref ? { link: linkHref } : {}) };
          for (const c of elKids(ch)) {
            if (c.nodeName === "w:t") runs.push({ text: c.textContent, ...f });
            else if (c.nodeName === "w:tab") runs.push({ text: "\t", ...f });
            else if (c.nodeName === "w:br") { if (c.getAttribute("w:type") === "page") runs.push({ pageBreak: true }); else runs.push({ text: "\n", ...f }); }
            else if (c.nodeName === "w:drawing" || c.nodeName === "w:pict") { const im = drawing(c); if (im) runs.push(im); }
          }
        } else if (ch.nodeName === "w:hyperlink") {
          const rid = ch.getAttribute("r:id"), anchor = ch.getAttribute("w:anchor");
          const href = rid && rels[rid]?.external ? rels[rid].target : anchor ? `#${anchor}` : null;
          visit(ch, href && isSafeHref(href) ? href : null);
        } else if (["w:ins", "w:smartTag", "w:sdt", "w:sdtContent", "w:fldSimple"].includes(ch.nodeName)) visit(ch, linkHref);
      }
    };
    visit(p, link);
    return runs;
  };
  const para = (p, intoRuns) => {
    const pPr = W(p, "pPr");
    const sid = val(pPr && W(pPr, "pStyle"));
    const sname = styleNames[sid] || (sid || "").toLowerCase();
    const jc = val(pPr && W(pPr, "jc"));
    const numPr = pPr && W(pPr, "numPr");
    const all = runsOf(p);
    if (intoRuns) { intoRuns.push(...all.filter((r) => !r.pageBreak)); return; }
    let cur = [];
    const emit = () => {
      const blk = { type: "para", kind: "normal", align: { center: "center", right: "right", both: "justify" }[jc] || null, runs: mergeRuns(cur) };
      const h = /^heading\s*(\d)/.exec(sname) || /^(?:título|titulo)\s*(\d)/.exec(sname);
      if (h) { blk.kind = "heading"; blk.level = Math.min(6, +h[1]); }
      else if (sname === "title" || sname === "título" || sname === "titulo") blk.kind = "title";
      else if (/quote|citação|citacao/.test(sname)) blk.kind = "quote";
      else if (/^code|preformatted|source code/.test(sname)) blk.kind = "code";
      if (numPr && val(W(numPr, "numId")) !== "0" && !h) blk.list = listInfo(val(W(numPr, "numId")), parseInt(val(W(numPr, "ilvl")) || "0", 10));
      flow.push(blk); cur = [];
    };
    for (const r of all) { if (r.pageBreak) { emit(); flow.push({ type: "para", kind: "pagebreak", runs: [] }); } else cur.push(r); }
    emit();
  };
  const body = doc.getElementsByTagName("w:body")[0];
  const walk = (parent) => {
    for (const el of elKids(parent)) {
      if (el.nodeName === "w:p") para(el);
      else if (el.nodeName === "w:sdt") { const c = W(el, "sdtContent"); if (c) walk(c); }
      else if (el.nodeName === "w:tbl") {
        const rows = [];
        for (const tr of elKids(el).filter((x) => x.nodeName === "w:tr")) {
          const header = !!W(W(tr, "trPr") || tr, "tblHeader");
          const cells = [];
          for (const tc of elKids(tr).filter((x) => x.nodeName === "w:tc")) {
            const runs = [];
            elKids(tc).filter((x) => x.nodeName === "w:p").forEach((p, k) => { if (k) runs.push({ text: "\n" }); para(p, runs); });
            const span = parseInt(val(W(W(tc, "tcPr") || tc, "gridSpan")) || "1", 10) || 1;
            cells.push({ runs: mergeRuns(runs), colspan: span, header, align: null });
          }
          rows.push(cells);
        }
        if (rows.length) flow.push({ type: "table", rows });
      }
    }
  };
  if (body) walk(body);
  return { flow: flow.length ? flow : [{ type: "para", kind: "normal", runs: [] }], title: "" };
}

// ===========================================================================
// API pública
// ===========================================================================

export const EXPORT_FORMATS = {
  txt: { ext: "txt", mime: "text/plain;charset=utf-8", label: "Texto simples (.txt)" },
  md: { ext: "md", mime: "text/markdown;charset=utf-8", label: "Markdown (.md)" },
  html: { ext: "html", mime: "text/html;charset=utf-8", label: "Página da Web (.html)" },
  rtf: { ext: "rtf", mime: "application/rtf", label: "Rich Text (.rtf)" },
  tex: { ext: "tex", mime: "application/x-tex;charset=utf-8", label: "LaTeX (.tex)" },
  odt: { ext: "odt", mime: "application/vnd.oasis.opendocument.text", label: "OpenDocument (.odt)" },
};

export const IMPORT_ACCEPT = ".docx,.odt,.rtf,.html,.htm,.md,.markdown,.txt,.tex";

export async function exportWordAs(doc, kind) {
  const f = EXPORT_FORMATS[kind];
  if (!f) throw new Error("Formato não suportado.");
  const flow = htmlToFlow(doc.content);
  const title = (doc.title || "").trim();
  let data;
  switch (kind) {
    case "txt": data = flowToText(flow); break;
    case "md": data = flowToMarkdown(flow); break;
    case "html": data = flowToHtmlDocument(flow, { title, lang: doc.lang || "pt-BR" }); break;
    case "rtf": data = flowToRtf(flow); break;
    case "tex": data = flowToLatex(flow, { title }); break;
    case "odt": return flowToOdt(flow, { title });
    default: throw new Error("Formato não suportado.");
  }
  return new Blob([data], { type: f.mime });
}

export async function downloadWordAs(doc, kind) {
  const blob = await exportWordAs(doc, kind);
  downloadBlob(blob, `${safeFileName(doc.title)}.${EXPORT_FORMATS[kind].ext}`);
}

// Lê um arquivo do disco e devolve { title, html } pronto para o editor.
export async function importWordFile(file) {
  if (file.size > 25 * 1024 * 1024) throw new Error("Arquivo grande demais (máximo 25 MB).");
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const base = file.name.replace(/\.[^.]+$/, "");
  const buf = await file.arrayBuffer();
  const finish = (flow, title) => ({ title: (title || base).trim() || base, html: flowToHtml(flow) });
  switch (ext) {
    case "txt": case "text": return { title: base, html: txtToHtml(decodeText(buf)) };
    case "md": case "markdown": return { title: base, html: sanitizeImportedHtml(markdownToHtml(decodeText(buf))) };
    case "html": case "htm": case "xhtml": { const r = htmlFileToHtml(decodeText(buf)); return { title: r.title || base, html: r.html }; }
    case "rtf": return finish(rtfToFlow(decodeText(buf)), base);
    case "tex": case "latex": case "ltx": { const r = latexToFlow(decodeText(buf)); return finish(r.flow, r.title || base); }
    case "odt": { const r = await odtToFlow(buf); return finish(r.flow, r.title || base); }
    case "docx": { const r = await docxToFlow(buf); return finish(r.flow, base); }
    default: throw new Error("Formato não suportado. Use .docx, .odt, .rtf, .html, .md, .txt ou .tex.");
  }
}
