// dom.js — DOM mínimo para rodar os módulos do front dentro de um vm (só o que o código do app usa).
// Lê o HTML de verdade (o index.html inteiro), monta a árvore, deixa o código mexer (innerHTML, value, checked, style, classList, options...) e dispara eventos
// pelos ouvintes que o eventos.js real registra no document. Tudo que entra por innerHTML é analisado como um navegador analisaria (aspas, entidades, tags que
// fecham sozinhas): um texto de ataque que escape do escape aparece aqui como atributo de evento (onerror=...) ou tag nova — e é EXECUTADO como o navegador faria.
"use strict";
const vm = require("vm");

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const FECHA_P = new Set(["address", "article", "aside", "blockquote", "details", "div", "dl", "fieldset", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "main", "nav", "ol", "p", "pre", "section", "table", "ul"]);
const ENT = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
const decodificar = (t) => t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return Object.prototype.hasOwnProperty.call(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
});
const escTexto = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (t) => escTexto(t).replace(/"/g, "&quot;");

class No { constructor(tipo) { this.nodeType = tipo; this.parentNode = null; } }
class Texto extends No {
  constructor(d) { super(3); this.data = d; }
  get textContent() { return this.data; }
}

class Elemento extends No {
  constructor(doc, tag) {
    super(1);
    this.ownerDocument = doc; this.localName = tag.toLowerCase(); this.tagName = tag.toUpperCase();
    this.attrs = new Map(); this.children = []; this.style = {}; this.onclick = null; this.files = [];
    this._valor = null; this._marcado = null; this._desabilitado = null; this._aberto = null; this._selecionada = null;
  }
  get childNodes() { return this.children; }
  get firstChild() { return this.children[0] || null; }
  // ---- atributos ----
  getAttribute(n) { return this.attrs.has(n.toLowerCase()) ? this.attrs.get(n.toLowerCase()) : null; }
  hasAttribute(n) { return this.attrs.has(n.toLowerCase()); }
  setAttribute(n, v) { this.attrs.set(n.toLowerCase(), String(v)); if (n.toLowerCase() === "style") this.style = estiloDe(String(v)); this.ownerDocument._ligou(this); }
  removeAttribute(n) { this.attrs.delete(n.toLowerCase()); }
  get id() { return this.getAttribute("id") || ""; }
  set id(v) { this.setAttribute("id", v); }
  get className() { return this.getAttribute("class") || ""; }
  set className(v) { this.attrs.set("class", String(v)); }
  get classList() {
    const el = this;
    const lista = () => el.className.split(/\s+/).filter(Boolean);
    const grava = (l) => { el.className = l.join(" "); };
    return {
      add: (...c) => { const l = lista(); c.forEach(x => { if (!l.includes(x)) l.push(x); }); grava(l); },
      remove: (...c) => grava(lista().filter(x => !c.includes(x))),
      contains: (c) => lista().includes(c),
      toggle: (c, forca) => { const tem = lista().includes(c); const quer = forca === undefined ? !tem : !!forca; if (quer && !tem) grava([...lista(), c]); if (!quer && tem) grava(lista().filter(x => x !== c)); return quer; }
    };
  }
  // ---- árvore ----
  appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.children.push(n); return n; }
  removeChild(n) { const i = this.children.indexOf(n); if (i >= 0) this.children.splice(i, 1); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get textContent() { return this.children.map(c => c.textContent).join(""); }
  set textContent(t) { this.children.forEach(c => { c.parentNode = null; }); this.children = []; if (String(t) !== "") this.appendChild(new Texto(String(t))); }
  get innerText() { return this.textContent; }
  get innerHTML() { return this.children.map(c => serializar(c)).join(""); }
  set innerHTML(h) {
    this.children.forEach(c => { c.parentNode = null; });
    this.children = [];
    analisar(this.ownerDocument, this, String(h));
    this.ownerDocument._varrer(this);
  }
  insertAdjacentHTML(pos, h) {
    if (pos !== "beforeend") throw new Error("insertAdjacentHTML só aceita beforeend aqui");
    const n0 = this.children.length;
    analisar(this.ownerDocument, this, String(h));
    this.children.slice(n0).forEach(c => this.ownerDocument._varrer(c));
  }
  *descendentes() { for (const c of this.children) { if (c.nodeType === 1) { yield c; yield* c.descendentes(); } } }
  scrollIntoView() { this.ownerDocument._rolagens.push(this.id); }
  focus() {}
  click() { this.ownerDocument.clicar(this); }
  // ---- controles de formulário ----
  get options() { return this.localName === "select" ? [...this.descendentes()].filter(e => e.localName === "option") : []; }
  get selectedIndex() { const o = this.options; const i = o.findIndex(x => x._selecionada === true || (x._selecionada === null && x.hasAttribute("selected"))); return i >= 0 ? i : (o.length ? 0 : -1); }
  set selectedIndex(i) { this.options.forEach((o, k) => { o._selecionada = k === i; }); }
  get value() {
    if (this.localName === "select") { const o = this.options[this.selectedIndex]; return o ? o.value : ""; }
    if (this.localName === "option") return this.hasAttribute("value") ? this.getAttribute("value") : this.textContent;
    if (this._valor !== null) return this._valor;
    if (this.localName === "textarea") return this.textContent;
    return this.getAttribute("value") || "";
  }
  set value(v) {
    const t = v == null ? "" : String(v);
    if (this.localName === "select") { const o = this.options; const i = o.findIndex(x => x.value === t); o.forEach((x, k) => { x._selecionada = k === i; }); if (i < 0) this._semOpcao = true; return; }
    if (this.localName === "input" && (this.getAttribute("type") || "").toLowerCase() === "file" && t !== "") throw new Error("InvalidStateError: não se escreve valor em input file");
    this._valor = t;
    if (this.localName === "input" && (this.getAttribute("type") || "").toLowerCase() === "file") this.files = [];
  }
  get checked() { return this._marcado !== null ? this._marcado : this.hasAttribute("checked"); }
  set checked(v) { this._marcado = !!v; }
  get disabled() { return this._desabilitado !== null ? this._desabilitado : this.hasAttribute("disabled"); }
  set disabled(v) { this._desabilitado = !!v; }
  get open() { return this._aberto !== null ? this._aberto : this.hasAttribute("open"); }
  set open(v) { this._aberto = !!v; }
  get hidden() { return this.hasAttribute("hidden"); }
  get type() { return (this.getAttribute("type") || (this.localName === "input" ? "text" : "")).toLowerCase(); }
}

function estiloDe(texto) {
  const o = {};
  String(texto).split(";").forEach(p => { const i = p.indexOf(":"); if (i > 0) o[p.slice(0, i).trim().replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = p.slice(i + 1).trim(); });
  return o;
}
function serializar(n) {
  if (n.nodeType === 3) return escTexto(n.data);
  const attrs = [...n.attrs].map(([k, v]) => ` ${k}="${escAttr(v)}"`).join("");
  return VOID.has(n.localName) ? `<${n.localName}${attrs}>` : `<${n.localName}${attrs}>${n.innerHTML}</${n.localName}>`;
}

// ---- analisador de HTML (o suficiente para o que o app gera) ----
function analisar(doc, raiz, h) {
  let i = 0; const pilha = [raiz];
  const topo = () => pilha[pilha.length - 1];
  const anexar = (n) => topo().appendChild(n);
  const texto = (t) => { if (t !== "") { const u = topo(); const ult = u.children[u.children.length - 1]; if (ult && ult.nodeType === 3) ult.data += t; else anexar(new Texto(t)); } };
  while (i < h.length) {
    if (h[i] !== "<") { const j = h.indexOf("<", i); const f = j < 0 ? h.length : j; texto(decodificar(h.slice(i, f))); i = f; continue; }
    if (h.startsWith("<!--", i)) { const j = h.indexOf("-->", i + 4); i = j < 0 ? h.length : j + 3; continue; }
    if (h[i + 1] === "!" || h[i + 1] === "?") { const j = h.indexOf(">", i); i = j < 0 ? h.length : j + 1; continue; }
    if (h[i + 1] === "/") {
      const j = h.indexOf(">", i); const nome = h.slice(i + 2, j < 0 ? h.length : j).trim().toLowerCase(); i = j < 0 ? h.length : j + 1;
      let k = pilha.length - 1; while (k > 0 && pilha[k].localName !== nome) k--;
      if (k > 0) pilha.length = k; else doc._erros.push(`tag de fechamento sem abertura: </${nome}>`);
      continue;
    }
    const m = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(h.slice(i));
    if (!m) { texto("<"); i++; continue; }          // "<" solto vira texto, como no navegador
    const tag = m[1].toLowerCase(); i += m[0].length;
    const el = new Elemento(doc, tag);
    let autoFechada = false;
    for (;;) {                                         // atributos
      while (/\s/.test(h[i] || "")) i++;
      if (i >= h.length) break;
      if (h[i] === ">") { i++; break; }
      if (h[i] === "/" && h[i + 1] === ">") { i += 2; autoFechada = true; break; }
      if (h[i] === "/") { i++; continue; }
      const a = /^[^\s=>\/]+/.exec(h.slice(i)); if (!a) { i++; continue; }
      const nome = a[0].toLowerCase(); i += a[0].length;
      while (/\s/.test(h[i] || "")) i++;
      let valor = "";
      if (h[i] === "=") {
        i++; while (/\s/.test(h[i] || "")) i++;
        if (h[i] === "\"" || h[i] === "'") { const q = h[i]; const j = h.indexOf(q, i + 1); valor = decodificar(h.slice(i + 1, j < 0 ? h.length : j)); i = j < 0 ? h.length : j + 1; }
        else { const u = /^[^\s>]+/.exec(h.slice(i)); valor = decodificar(u ? u[0] : ""); i += u ? u[0].length : 0; }
      }
      if (!el.attrs.has(nome)) el.attrs.set(nome, valor);
    }
    if (el.attrs.has("style")) el.style = estiloDe(el.attrs.get("style"));
    if (tag === "p" || FECHA_P.has(tag)) { for (let k = pilha.length - 1; k > 0; k--) { if (pilha[k].localName === "p") { pilha.length = k; break; } if (!["span", "strong", "em", "b", "i", "small", "a", "label", "code"].includes(pilha[k].localName)) break; } }
    anexar(el);
    if (tag === "script" || tag === "style") { const j = h.toLowerCase().indexOf(`</${tag}`, i); const f = j < 0 ? h.length : j; if (f > i) el.appendChild(new Texto(h.slice(i, f))); i = f; const k = h.indexOf(">", i); i = k < 0 ? h.length : k + 1; continue; }
    if (tag === "textarea") { const j = h.toLowerCase().indexOf("</textarea", i); const f = j < 0 ? h.length : j; if (f > i) el.appendChild(new Texto(decodificar(h.slice(i, f)))); i = f; const k = h.indexOf(">", i); i = k < 0 ? h.length : k + 1; continue; }
    if (!VOID.has(tag) && !autoFechada) pilha.push(el);
  }
  // o que ficou aberto no fim (fora a raiz) é erro de estrutura
  if (pilha.length > 1) doc._erros.push(`tag(s) sem fechamento: ${pilha.slice(1).map(e => e.localName).join(", ")}`);
}

class Documento {
  constructor() {
    this.nodeType = 9; this._ouvintes = {}; this._erros = []; this._rolagens = []; this._ataques = []; this._executar = null;
    this.body = new Elemento(this, "body");
    this.readyState = "complete";
  }
  addEventListener(tipo, fn) { (this._ouvintes[tipo] = this._ouvintes[tipo] || []).push(fn); }
  removeEventListener() {}
  createElement(tag) { return new Elemento(this, tag); }
  createTextNode(t) { return new Texto(String(t)); }
  getElementById(id) { for (const e of this.body.descendentes()) if (e.getAttribute("id") === id) return e; return null; }
  querySelectorAll(sel) {
    if (sel === ".grupo-modulo") return [...this.body.descendentes()].filter(e => e.classList.contains("grupo-modulo"));
    // [id^="prefixo"]: o único seletor de atributo que a tela usa (escalas.js, ao refazer o detalhe do serviço)
    const prefixo = /^\[id\^="([^"]+)"\]$/.exec(sel);
    if (prefixo) return [...this.body.descendentes()].filter(e => String(e.getAttribute("id") || "").startsWith(prefixo[1]));
    return [];
  }
  _ligou() {}
  // Simula o que o navegador faria ao inserir o elemento: <img onerror> com src quebrado executa o onerror na hora; <script> e atributos on* de qualquer tag são o que o ataque quer.
  _varrer(raiz) {
    const todos = raiz.nodeType === 1 ? [raiz, ...raiz.descendentes()] : [];
    for (const e of todos) {
      if (["script", "iframe", "object", "embed", "img", "svg", "base", "meta", "link", "style"].includes(e.localName)) this._ataques.push({ tag: e.localName, atributo: "(tag)", valor: e.getAttribute("src") || "" });
      for (const [k, v] of e.attrs) {
        if (/^on/.test(k)) {
          this._ataques.push({ tag: e.localName, atributo: k, valor: v });
          if (this._executar && e.localName === "img" && k === "onerror") this._executar(v);   // <img src=x onerror=...>: o navegador falha ao carregar e executa na hora
        } else if (/javascript:/i.test(v)) this._ataques.push({ tag: e.localName, atributo: k, valor: v });
      }
    }
  }
  // dispara um evento do navegador pelos ouvintes registrados no document (como o eventos.js espera)
  disparar(el, tipo, extra) {
    const ev = Object.assign({ type: tipo, target: el, cancelBubble: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.cancelBubble = true; } }, extra || {});
    for (const fn of (this._ouvintes[tipo] || [])) fn(ev);
    return ev;
  }
  clicar(el) {
    if (!el || el.disabled) return false;
    this.disparar(el, "click");
    if (typeof el.onclick === "function") el.onclick({ target: el });
    return true;
  }
  // digitar/colar num campo
  digitar(el, v) { el.value = v; this.disparar(el, "input"); this.disparar(el, "change"); }
  marcar(el, v) { el.checked = v; this.disparar(el, "change"); }
  escolher(el, v) { el.value = v; this.disparar(el, "change"); }
}

// o <body> do index.html de verdade vira a árvore do documento
function carregarHtml(doc, html) {
  const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  analisar(doc, doc.body, m ? m[1] : html);
}

module.exports = { Documento, Elemento, Texto, carregarHtml, serializar };
