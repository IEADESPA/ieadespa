// Despachante de eventos da tela (app/eventos.js) — CSP forte, sem código escrito no HTML. Prova que data-on-<tipo> + data-args-<tipo> imita o antigo
// onclick="..." no que a tela usa: a bolha (filho antes do pai) e a parada (data-stop ou evento.stopPropagation() dentro da ação), data-prevent, os
// argumentos especiais (this, event, this.value, this.checked), ação não registrada (nada roda, nada vira window[nome]), erro isolado, promessa
// rejeitada solta (como antes), submit, elemento criado depois, ativarComTeclado (o cartão vem como argumento: currentTarget agora seria o document) e a
// ORDEM com os ouvintes de "clicar fora fecha" do script.js (registrados na bolha do document): rodam DEPOIS das ações, e não rodam quando a ação para o
// evento — exatamente como com o stopPropagation do atributo antigo.
// Ambiente: um DOM mínimo escrito aqui, com captura -> alvo -> bolha, stopPropagation/stopImmediatePropagation e preventDefault como na especificação do
// DOM (o jest do projeto não traz o jsdom e a regra é não acrescentar dependência). Com JSDOM_DIR=caminho/do/node_modules/jsdom (ou "jsdom" instalado) a
// MESMA bateria roda também no jsdom de verdade — conferido em 04/10/2026 com o jsdom 30 rodando fora do jest (o jest 30 daqui não carrega o jsdom 30,
// que é ESM por dentro): 15 de 15 iguais. A prova em navegador real fica no equipamento de teste da virada da CSP.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const parser = require("@babel/parser");

const APP = path.join(__dirname, "..", "..", "..", "app");
const EVENTOS = fs.readFileSync(path.join(APP, "eventos.js"), "utf8");
const SCRIPT = fs.readFileSync(path.join(APP, "script.js"), "utf8");
// ativarComTeclado de verdade, tirada do script.js
const FONTE_TECLADO = (() => {
  const ast = parser.parse(SCRIPT, { sourceType: "script" });
  const no = ast.program.body.find(n => n.type === "FunctionDeclaration" && n.id.name === "ativarComTeclado");
  return SCRIPT.slice(no.start, no.end);
})();

let JSDOM = null;
try { JSDOM = require(process.env.JSDOM_DIR || "jsdom").JSDOM; } catch (e) { JSDOM = null; if (process.env.JSDOM_DIR) console.log("jsdom não carregou:", String(e && e.stack).slice(0, 600)); }

// ---------- DOM mínimo (só o que o despachante e os testes usam) ----------
function criarDomMinimo() {
  class Evento {
    constructor(type, opcoes = {}) {
      this.type = type; this.bubbles = opcoes.bubbles !== false; this.cancelable = opcoes.cancelable !== false; this.key = opcoes.key;
      this.target = null; this.currentTarget = null; this.defaultPrevented = false; this._parar = false; this._pararJa = false;
    }
    stopPropagation() { this._parar = true; }
    stopImmediatePropagation() { this._parar = true; this._pararJa = true; }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    get cancelBubble() { return this._parar; }
  }
  class No {
    constructor(nodeType, tagName) { this.nodeType = nodeType; this.tagName = tagName; this.parentNode = null; this.childNodes = []; this._attrs = new Map(); this._ouvintes = []; }
    appendChild(f) { if (f.parentNode) f.parentNode.removeChild(f); f.parentNode = this; this.childNodes.push(f); return f; }
    removeChild(f) { this.childNodes = this.childNodes.filter(x => x !== f); f.parentNode = null; return f; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
    setAttribute(k, v) { this._attrs.set(k, String(v)); }
    getAttribute(k) { return this._attrs.has(k) ? this._attrs.get(k) : null; }
    hasAttribute(k) { return this._attrs.has(k); }
    addEventListener(tipo, f, captura) { this._ouvintes.push({ tipo, f, captura: captura === true || !!(captura && captura.capture) }); }
    dispatchEvent(ev) { despachar(this, ev); return !ev.defaultPrevented; }
    click() { this.dispatchEvent(new Evento("click")); }
  }
  const janela = new No(0, null);
  const documento = new No(9, null);
  documento.createElement = (tag) => new No(1, tag.toUpperCase());
  documento.documentElement = documento.appendChild(documento.createElement("html"));
  documento.body = documento.documentElement.appendChild(documento.createElement("body"));
  function despachar(alvo, ev) {
    ev.target = alvo;
    const caminho = [];
    for (let n = alvo; n; n = n.parentNode) caminho.push(n);
    if (caminho[caminho.length - 1] === documento) caminho.push(janela);
    const chamar = (n, fase) => {
      ev.currentTarget = n;
      for (const o of n._ouvintes.slice()) {
        if (o.tipo !== ev.type || (fase === "captura" && !o.captura) || (fase === "bolha" && o.captura)) continue;
        try { o.f.call(n, ev); } catch (e) { errosSoltos.push(e); }
        if (ev._pararJa) return;
      }
    };
    const fim = () => { ev.currentTarget = null; };
    for (let i = caminho.length - 1; i > 0; i--) { chamar(caminho[i], "captura"); if (ev._parar) return fim(); }
    chamar(alvo, "captura"); if (!ev._pararJa) chamar(alvo, "bolha");
    if (ev._parar) return fim();
    if (ev.bubbles) for (let i = 1; i < caminho.length; i++) { chamar(caminho[i], "bolha"); if (ev._parar) break; }
    fim();
  }
  const errosSoltos = [];
  const consoleFalso = { error: jest.fn(), log() {}, warn() {} };
  const ctx = vm.createContext({ document: documento, console: consoleFalso });
  vm.runInContext(EVENTOS + "\n" + FONTE_TECLADO + "\nthis.__api = { registrarAcoes, ARG, ativarComTeclado };", ctx);
  return {
    nome: "DOM mínimo", doc: documento, api: ctx.__api, consoleErro: consoleFalso.error, errosSoltos,
    evento: (tipo, extra = {}) => new Evento(tipo, extra)
  };
}
function criarJsdom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
  const w = dom.window;
  const consoleErro = jest.fn();
  w.console.error = consoleErro;
  w.eval(EVENTOS + "\n" + FONTE_TECLADO + "\nwindow.__api = { registrarAcoes, ARG, ativarComTeclado };");
  return {
    nome: "jsdom", doc: w.document, api: w.__api, consoleErro, errosSoltos: [],
    evento: (tipo, extra = {}) => (tipo === "keydown" ? new w.KeyboardEvent(tipo, Object.assign({ bubbles: true, cancelable: true }, extra)) : new w.Event(tipo, Object.assign({ bubbles: true, cancelable: true }, extra)))
  };
}
const AMBIENTES = [["DOM mínimo", criarDomMinimo]].concat(JSDOM ? [["jsdom", criarJsdom]] : []);

describe.each(AMBIENTES)("despachante de eventos (%s)", (_nome, criar) => {
  let A, doc, log;
  // monta <tag atributos>, com filhos
  const el = (tag, atributos = {}, ...filhos) => {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(atributos)) e.setAttribute(k, typeof v === "string" ? v : JSON.stringify(v));
    for (const f of filhos) e.appendChild(f);
    return e;
  };
  const clicar = (alvo) => { const ev = A.evento("click"); alvo.dispatchEvent(ev); return ev; };
  beforeEach(() => {
    A = criar();
    doc = A.doc;
    log = [];
    A.api.registrarAcoes({
      filho: () => log.push("filho"),
      pai: () => log.push("pai"),
      avo: () => log.push("avo"),
      anotar: (...args) => log.push(args),
      falhar: () => { log.push("falhou"); throw new Error("ação quebrou"); },
      pararAqui: (ev) => { log.push("parou"); ev.stopPropagation(); },
      prevenidoNaHora: (ev) => log.push(ev.defaultPrevented)
    });
    // o "clicar fora fecha" do script.js: ouvinte da BOLHA do document, registrado depois do eventos.js
    doc.addEventListener("click", () => log.push("nativo-document"));
  });

  test("bolha: o clique no filho roda o filho e depois os ancestrais; os ouvintes nativos do document vêm depois", () => {
    const filho = el("span", { "data-on-click": "filho" });
    const pai = el("div", { "data-on-click": "pai" }, el("p", {}, filho));
    doc.body.appendChild(el("section", { "data-on-click": "avo" }, pai));
    clicar(filho);
    expect(log).toEqual(["filho", "pai", "avo", "nativo-document"]);
    log.length = 0;
    clicar(pai);
    expect(log).toEqual(["pai", "avo", "nativo-document"]);
  });

  test("data-stop: para depois da ação (o antigo event.stopPropagation(); f()) — nem o pai nem o 'clicar fora' do document recebem", () => {
    const botao = el("button", { "data-on-click": "filho", "data-stop": "click" });
    doc.body.appendChild(el("div", { "data-on-click": "pai" }, botao));
    clicar(botao);
    expect(log).toEqual(["filho"]);
  });

  test("data-stop sem ação (o antigo onclick=\"event.stopPropagation()\") e só para o tipo marcado", () => {
    const filho = el("span", { "data-on-click": "filho", "data-on-change": "anotar" });
    const meio = el("div", { "data-stop": "click" }, filho);
    doc.body.appendChild(el("div", { "data-on-click": "pai", "data-on-change": "pai" }, meio));
    clicar(filho);
    expect(log).toEqual(["filho"]);
    log.length = 0;
    filho.dispatchEvent(A.evento("change"));
    expect(log).toEqual([[], "pai"]); // change não é parado pelo data-stop="click"
  });

  test("a ação que chama evento.stopPropagation() para a cadeia e o evento de verdade", () => {
    const filho = el("span", { "data-on-click": "pararAqui", "data-args-click": [{ $: "event" }] });
    doc.body.appendChild(el("div", { "data-on-click": "pai" }, filho));
    clicar(filho);
    expect(log).toEqual(["parou"]);
  });

  test("data-prevent: preventDefault ANTES da ação (o antigo event.preventDefault(); f() / f(); return false), só no tipo marcado", () => {
    const a = el("a", { "data-on-click": "prevenidoNaHora", "data-args-click": [{ $: "event" }], "data-prevent": "click" });
    doc.body.appendChild(a);
    const ev = clicar(a);
    expect(ev.defaultPrevented).toBe(true);
    expect(log).toEqual([true, "nativo-document"]);
    const b = el("a", { "data-on-click": "prevenidoNaHora", "data-args-click": [{ $: "event" }], "data-prevent": "submit" });
    doc.body.appendChild(b);
    log.length = 0;
    expect(clicar(b).defaultPrevented).toBe(false);
  });

  test("argumentos especiais resolvidos na hora (inclusive dentro de objeto) e literais intactos", () => {
    const caixa = el("input", { "data-on-change": "anotar", "data-args-change": [{ $: "this" }, { $: "value" }, { $: "checked" }, { ativa: { $: "checked" } }, 7, "G", null, true, { $: "undefined" }, { $: "objeto", v: { $: "this" } }] });
    doc.body.appendChild(caixa);
    caixa.value = "digitado";
    caixa.checked = true;
    const ev = A.evento("change");
    caixa.dispatchEvent(ev);
    const [args] = log;
    expect(args[0]).toBe(caixa);
    expect(args.slice(1, 8)).toEqual(["digitado", true, { ativa: true }, 7, "G", null, true]);
    expect(args.length).toBe(10);
    expect(args[8]).toBeUndefined();
    expect(JSON.parse(JSON.stringify(args[9]))).toEqual({ $: "this" }); // dado com "$" não vira o elemento
    caixa.value = "outro";
    log.length = 0;
    caixa.dispatchEvent(A.evento("change"));
    expect(log[0][1]).toBe("outro");
  });

  test("ação não registrada: nada roda (nem função global de mesmo nome), console.error, e o resto da cadeia segue", () => {
    const filho = el("span", { "data-on-click": "alert" });
    const outro = el("span", { "data-on-click": "constructor" });
    const terceiro = el("span", { "data-on-click": "__proto__" });
    doc.body.appendChild(el("div", { "data-on-click": "pai" }, filho, outro, terceiro));
    clicar(filho); clicar(outro); clicar(terceiro);
    expect(log).toEqual(["pai", "nativo-document", "pai", "nativo-document", "pai", "nativo-document"]);
    expect(A.consoleErro).toHaveBeenCalledTimes(3);
    expect(String(A.consoleErro.mock.calls[0][0])).toMatch(/não registrada: "alert"/);
    expect(() => A.api.registrarAcoes({ texto: "alert(1)" })).toThrow(/não é função/);
  });

  test("erro numa ação não impede o pai nem o ouvinte do document; vai para o console", () => {
    const filho = el("span", { "data-on-click": "falhar" });
    doc.body.appendChild(el("div", { "data-on-click": "pai" }, filho));
    clicar(filho);
    expect(log).toEqual(["falhou", "pai", "nativo-document"]);
    expect(A.consoleErro).toHaveBeenCalledTimes(1);
    expect(A.errosSoltos).toEqual([]);
  });

  test("promessa devolvida pela ação não é esperada nem capturada (rejeição segue para o 'unhandledrejection', como no onclick antigo)", () => {
    const tocada = [];
    class PromessaEspiada extends Promise { then(...a) { tocada.push("then"); return super.then(...a); } catch(...a) { tocada.push("catch"); return super.catch(...a); } }
    let devolvida = null;
    A.api.registrarAcoes({ assincrona: () => { devolvida = PromessaEspiada.resolve(1); return devolvida; } });
    const b = el("button", { "data-on-click": "assincrona" });
    doc.body.appendChild(b);
    clicar(b);
    expect(devolvida).not.toBeNull();
    expect(tocada).toEqual([]);
  });

  test("submit: só o evento submit do formulário chama a ação; data-prevent segura o envio", () => {
    const botao = el("button", { type: "submit" });
    const form = el("form", { "data-on-submit": "anotar", "data-args-submit": ["salvar"], "data-prevent": "submit" }, botao);
    doc.body.appendChild(form);
    clicar(botao);
    expect(log).toEqual(["nativo-document"]); // o clique sozinho não chama a ação do submit
    log.length = 0;
    const ev = A.evento("submit");
    form.dispatchEvent(ev);
    expect(log).toEqual([["salvar"]]);
    expect(ev.defaultPrevented).toBe(true);
  });

  test("delegação: elemento criado depois (innerHTML/template) funciona sem ligar nada", () => {
    const b = el("button", { "data-on-click": "anotar", "data-args-click": [42, "x"] });
    doc.body.appendChild(el("div", {}, el("div", {}, b)));
    clicar(b);
    expect(log).toEqual([[42, "x"], "nativo-document"]);
  });

  test("o caminho é fixado no começo: a ação do filho que tira a área da tela não impede a vez do pai (como no navegador)", () => {
    A.api.registrarAcoes({ redesenhar: (elemento) => { log.push("redesenhou"); elemento.parentNode.parentNode.remove(); } });
    const filho = el("button", { "data-on-click": "redesenhar", "data-args-click": [{ $: "this" }] });
    doc.body.appendChild(el("div", { "data-on-click": "pai" }, el("div", {}, filho)));
    clicar(filho);
    expect(log).toEqual(["redesenhou", "pai", "nativo-document"]);
  });

  test("ativarComTeclado: Enter/Espaço no cartão (ou num filho dele) clica O CARTÃO; outra tecla não faz nada", () => {
    const filhoDoCartao = el("strong", {});
    const cartao = el("div", { "data-on-click": "anotar", "data-args-click": ["entrou"], "data-on-keydown": "ativarComTeclado", "data-args-keydown": [{ $: "event" }, { $: "this" }], tabindex: "0", role: "button" }, filhoDoCartao);
    A.api.registrarAcoes({ ativarComTeclado: A.api.ativarComTeclado });
    doc.body.appendChild(cartao);
    const ev = A.evento("keydown", { key: "Enter" });
    cartao.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(log).toEqual([["entrou"], "nativo-document"]);
    log.length = 0;
    filhoDoCartao.dispatchEvent(A.evento("keydown", { key: " " }));
    expect(log).toEqual([["entrou"], "nativo-document"]);
    log.length = 0;
    const outra = A.evento("keydown", { key: "a" });
    cartao.dispatchEvent(outra);
    expect(log).toEqual([]);
    expect(outra.defaultPrevented).toBe(false);
  });

  test("ordem com ouvinte próprio do elemento: a ação (captura no document) vem antes — a auditoria do script.js não achou elemento com os dois", () => {
    const b = el("button", { "data-on-click": "filho" });
    b.addEventListener("click", () => log.push("ouvinte-do-botao"));
    doc.body.appendChild(b);
    clicar(b);
    expect(log).toEqual(["filho", "ouvinte-do-botao", "nativo-document"]);
  });

  test("data-args inválido: a ação não roda e o erro vai para o console", () => {
    const b = el("button", { "data-on-click": "anotar", "data-args-click": "[1," });
    doc.body.appendChild(b);
    clicar(b);
    expect(log).toEqual(["nativo-document"]);
    expect(A.consoleErro).toHaveBeenCalledTimes(1);
  });
});

test("o ambiente de teste roda pelo menos o DOM mínimo (e o jsdom quando JSDOM_DIR aponta para um que carregue aqui)", () => {
  expect(AMBIENTES.length).toBeGreaterThanOrEqual(1);
  if (process.env.JSDOM_DIR) expect(AMBIENTES.map(a => a[0])).toContain("jsdom");
});
