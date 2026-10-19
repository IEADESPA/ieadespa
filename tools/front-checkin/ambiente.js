// ambiente.js — monta o front de verdade (index.html + eventos.js + o módulo checkin-infantil.js) dentro de um vm, com o DOM mínimo de ../front-menores/dom.js e uma API simulada.
// O que roda é o código real: as funções do script.js e do meus-dados.js que a tela usa (fetchProtegido com a confirmação reforçada 428, confirmarAcao, pedirTexto, mostrarToast,
// escaparHtmlEbd, argsAttr, limparSessao, esconderTodasAsTelas, a NAVEGAÇÃO entre abas e módulos...) são EXTRAÍDAS dos arquivos pela árvore do JavaScript — não reescritas aqui.
// Mesmo molde de ../front-protecao/ambiente.js; o que este acrescenta: `api.responder` (um servidor simulado com estado, de fixtures.js, responde no lugar das rotas fixas), a
// impressão que anota as classes do <body> NO MOMENTO de imprimir, e o registro das gravações em localStorage/sessionStorage/console (o código de retirada nunca pode estar lá).
// `mutar` troca trechos do código antes de carregar (prova de mutação).
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const parser = require(path.resolve(__dirname, "../../api/node_modules/@babel/parser"));
const { Documento, Elemento: ElementoDoDom, Texto: TextoDoDom, carregarHtml } = require("../front-menores/dom");

const RAIZ = path.resolve(__dirname, "../..");
const APP = path.join(RAIZ, "app");
const lerApp = (rel) => fs.readFileSync(path.join(APP, rel), "utf8").replace(/\r\n/g, "\n");   // os arquivos do app estão em CRLF: aqui tudo é LF (as mutações e o vm não ligam)

// ---- o index.html (6.500 linhas) é analisado UMA vez por texto (original ou já com as trocas de mutação); cada ambiente recebe uma cópia da árvore, bem mais barata que analisar de novo ----
const MODELOS_DE_HTML = new Map();
function clonarNo(no, doc) {
  if (no.nodeType === 3) return new TextoDoDom(no.data);
  const novo = new ElementoDoDom(doc, no.localName);
  for (const [k, v] of no.attrs) novo.attrs.set(k, v);
  novo.style = Object.assign({}, no.style);
  for (const f of no.children) { const c = clonarNo(f, doc); c.parentNode = novo; novo.children.push(c); }
  return novo;
}
function carregarHtmlComCopia(doc, html) {
  if (!MODELOS_DE_HTML.has(html)) { const modelo = new Documento(); carregarHtml(modelo, html); MODELOS_DE_HTML.set(html, { raiz: modelo.body, erros: modelo._erros.slice() }); }
  const m = MODELOS_DE_HTML.get(html);
  for (const f of m.raiz.children) { const c = clonarNo(f, doc); c.parentNode = doc.body; doc.body.children.push(c); }
  doc._erros.push(...m.erros);
}

// ---- extração de declarações de nível superior (funções, const/let) pelo nome ----
// (a árvore de cada arquivo é montada uma vez só por processo: o roteiro cria dezenas de ambientes e a prova de mutação centenas; as trocas de mutação entram DEPOIS, sobre o texto extraído)
const CACHE_EXTRAIDO = new Map();
function extrair(rel, nomes) {
  const chave = `${rel}|${nomes.join(",")}`;
  if (!CACHE_EXTRAIDO.has(chave)) CACHE_EXTRAIDO.set(chave, extrairSemCache(rel, nomes));
  return CACHE_EXTRAIDO.get(chave);
}
function extrairSemCache(rel, nomes) {
  const codigo = lerApp(rel);
  const ast = parser.parse(codigo, { sourceType: "script", errorRecovery: false });
  const achados = new Map();
  for (const n of ast.program.body) {
    if (n.type === "FunctionDeclaration" && nomes.includes(n.id.name)) achados.set(n.id.name, codigo.slice(n.start, n.end));
    if (n.type === "VariableDeclaration") for (const d of n.declarations) if (d.id.type === "Identifier" && nomes.includes(d.id.name)) achados.set(d.id.name, codigo.slice(n.start, n.end));
  }
  const falta = nomes.filter(x => !achados.has(x));
  if (falta.length) throw new Error(`extrair(${rel}): não achei ${falta.join(", ")}`);
  return nomes.map(x => achados.get(x)).join("\n");
}

function resposta(status, corpo, naoJson) {
  const r = { status, ok: status >= 200 && status < 300, json: async () => { if (naoJson) throw new SyntaxError("Unexpected token < in JSON"); return JSON.parse(JSON.stringify(corpo)); } };
  r.clone = () => resposta(status, corpo, naoJson);
  return r;
}

// `mutar`: { "modulos/checkin-infantil.js": [[de, para], ...] } — cada troca tem de achar o trecho exatamente uma vez
function criarAmbiente({ mutar = {}, agora = "2026-10-15T12:30:00.000Z", semModulo = false } = {}) {
  const doc = new Documento();
  // foco, como o navegador: só recebe foco o que é focalizável (campo, botão, link com href ou tabindex), não está desabilitado e não está dentro de algo escondido; elemento retirado da árvore perde o foco (volta ao body)
  const Elemento = doc.body.constructor;
  const focalizavel = (el) => { for (let p = el; p && p.nodeType === 1; p = p.parentNode) if (p.style && p.style.display === "none") return false; return !el.disabled && (el.hasAttribute("tabindex") || ["input", "select", "textarea", "button"].includes(el.localName) && el.type !== "hidden" || (el.localName === "a" && el.hasAttribute("href"))); };
  Elemento.prototype.focus = function () { if (focalizavel(this)) { this.ownerDocument._focado = this; this.ownerDocument._focos.push(this.id || this.localName); } };
  Object.defineProperty(Elemento.prototype, "isConnected", { configurable: true, get() { for (let p = this; p; p = p.parentNode) if (p === this.ownerDocument.body) return true; return false; } });
  // o navegador tira o foco de um botão que é desabilitado enquanto o tem (regra de "focus fixup" do HTML): o ambiente faz o mesmo
  const modeloDisabled = Object.getOwnPropertyDescriptor(Elemento.prototype, "disabled");
  Object.defineProperty(Elemento.prototype, "disabled", { configurable: true, get: modeloDisabled.get, set(v) { modeloDisabled.set.call(this, v); if (v && this.ownerDocument._focado === this) this.ownerDocument._focado = null; } });
  doc._focos = []; doc._focado = null; doc.visibilityState = "visible";
  Object.defineProperty(doc, "activeElement", { configurable: true, get() { return this._focado && this._focado.isConnected ? this._focado : this.body; } });
  doc.createDocumentFragment = () => doc.createElement("div");
  const contexto = vm.createContext({ document: doc, console });
  const ev = (codigo, nome) => vm.runInContext(codigo, contexto, { filename: nome });
  const aplicarMutacoes = (rel, codigo) => {
    for (const [de, para] of (mutar[rel] || [])) {
      const n = codigo.split(de).length - 1;
      if (n !== 1) throw new Error(`mutação inaplicável em ${rel} (${n} ocorrências): ${de.slice(0, 80)}`);
      codigo = codigo.replace(de, () => para);
    }
    return codigo;
  };

  // ---- a API simulada: `responder(chamada)` (o servidor com estado de fixtures.js) ou rotas fixas ----
  const api = { chamadas: [], rotas: {}, retencoes: [], redeCaida: false, responder: null };
  const ctx = contexto;
  ctx.fetch = async (url, opts = {}) => {
    const u = new URL(url, "http://local");
    const metodo = (opts.method || "GET").toUpperCase();
    const cabecalhos = Object.fromEntries(Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const chamada = { metodo, caminho: u.pathname.replace(/^\/api\//, ""), consulta: Object.fromEntries(u.searchParams), corpo: opts.body ? JSON.parse(opts.body) : null, semFator: !!opts.semFator, cabecalhos, url: String(url) };
    chamada.chave = `${metodo} ${chamada.caminho}`;
    chamada.comToken = "x-auth-token" in cabecalhos || "authorization" in cabecalhos;
    api.chamadas.push(chamada);
    // a resposta nasce quando o pedido CHEGA ao servidor (como num servidor de verdade): uma retenção só atrasa a entrega, e quem trocou de login enquanto isso recebe o que era de quem pediu
    const rota = api.rotas[chamada.chave];
    const r = rota ? (typeof rota === "function" ? rota(chamada) : rota) : (api.responder ? api.responder(chamada) : null);
    const reten = api.retencoes.find(x => !x.usada && x.casa(chamada));
    if (reten) {
      reten.usada = true; reten.chegou = true;
      await reten.promessa;
    }
    if (api.redeCaida) throw new TypeError("Failed to fetch");
    if (!r) return resposta(404, { sucesso: false, mensagem: `rota sem fixture: ${chamada.chave}` });
    return resposta(r.status || 200, r.corpo, r.naoJson);
  };

  // ---- relógio controlado: Date falso (new Date() e Date.now() devolvem o relógio do ambiente) ----
  ctx.__relogioMs = Date.parse(agora);
  ev(`(() => { const Real = Date; class Falso extends Real { constructor(...a) { if (a.length === 0) super(globalThis.__relogioMs); else super(...a); } static now() { return globalThis.__relogioMs; } } globalThis.Date = Falso; })();`, "relogio");
  // ---- intervalos e temporizadores observáveis: nada roda sozinho; o roteiro dispara o tique ----
  const intervalos = new Map();
  let proximoIntervalo = 1;
  ctx.setInterval = (fn, ms) => { const id = proximoIntervalo++; intervalos.set(id, { fn, ms }); return id; };
  ctx.clearInterval = (id) => { intervalos.delete(id); };
  const temporizadores = new Map();
  let proximoTemporizador = 1;
  ctx.setTimeout = (fn, ms) => { const id = proximoTemporizador++; temporizadores.set(id, { fn, ms }); return id; };
  ctx.clearTimeout = (id) => { temporizadores.delete(id); };
  const dispararTemporizador = (ms) => { for (const [id, t] of [...temporizadores]) if (t.ms === ms) { temporizadores.delete(id); t.fn(); } };
  ctx.AbortController = AbortController;
  ctx.setImmediate = setImmediate;
  // ---- armazenamento do navegador: anota tudo o que for gravado (o código de retirada nunca pode estar aqui) ----
  const gravacoes = [];
  const armazenamento = (nome) => { const itens = {}; return { getItem: (k) => (k in itens ? itens[k] : null), setItem: (k, v) => { itens[k] = String(v); gravacoes.push({ onde: nome, chave: k, valor: String(v) }); }, removeItem: (k) => { delete itens[k]; }, clear: () => {}, _itens: itens }; };
  ctx.localStorage = armazenamento("localStorage");
  ctx.sessionStorage = armazenamento("sessionStorage");
  // ---- console: o que o módulo escrever (nunca o código) fica registrado ----
  const saidaConsole = [];
  ctx.console = { log: (...a) => saidaConsole.push(a.map(String).join(" ")), error: (...a) => saidaConsole.push(a.map(String).join(" ")), warn: (...a) => saidaConsole.push(a.map(String).join(" ")), info: (...a) => saidaConsole.push(a.map(String).join(" ")) };
  // ---- impressão observável: anota as classes do <body> NO MOMENTO de imprimir ----
  const impressoes = [];
  ctx.print = () => { impressoes.push({ classes: doc.body.className }); };
  ctx.__xss = function (c) { ctx.__xss.chamadas.push(String(c)); };
  ctx.__xss.chamadas = [];
  doc._executar = (codigo) => { try { vm.runInContext(codigo, contexto); } catch (e) { /* o ataque pode falhar; só importa se rodou */ } };

  // ---- a página de verdade ----
  carregarHtmlComCopia(doc, aplicarMutacoes("index.html", lerApp("index.html")));
  const errosDaPagina = doc._erros.length;
  doc._erros.length = 0;
  // o painel aberto, como depois do login (a tela da sala só existe dentro dele): a portaria e o portão de login escondidos
  doc.getElementById("telaCheckin").style.display = "none"; doc.getElementById("cxLoginPainel").style.display = "none";
  doc.getElementById("telaPainel").style.display = "flex"; doc.getElementById("cxPainelConteudo").style.display = "flex";

  ev("var window = globalThis; var self = globalThis;", "janela");
  ev(`const API_BASE = "/api";
let authToken = null, authNome = null, authMatricula = null, authNivel = null, authGeral = false, authPermissoes = [], ultimaRecusa = null, ebdTurmasProfessor = [];
function marcarSessaoGeralNaPagina() { if (document.body) document.body.classList.toggle("sessao-geral", authGeral); }
function mostrarTelaPainelInicial() { window.__telaInicial = (window.__telaInicial || 0) + 1; }
function mostrarCriarPin() {} function mostrarModalTermos() {}
async function confirmarFatorAgora() { window.__fatorPedidos = (window.__fatorPedidos || 0) + 1; return window.__fatorConfirmar ? await window.__fatorConfirmar() : false; }
function carregarPainelInicial() { window.__painelInicial = (window.__painelInicial || 0) + 1; }
function avisarResultado(d) { mostrarToast(d.mensagem, d.sucesso ? "sucesso" : "erro"); }`, "prelude");
  // do script.js: o que o módulo usa, a navegação entre abas/módulos, a limpeza da sessão e o modal de anexos
  ev(aplicarMutacoes("script.js", extrair("script.js", [
    "mostrarToast", "fecharModal", "confirmarAcao", "pedirTexto", "escaparHtmlEbd", "argsAttr", "urlSegura", "formatarDataEbd", "mensagemPadraoDaRecusa", "fetchProtegido", "sessaoDeLiderancaNaTela", "listaDaApi", "jsonDaTela",
    "limparSessao", "esconderTodasAsTelas", "voltarParaCheckin",
    "NOMES_ABAS", "ABA_PERMISSOES_ALT", "permissoesDaAba", "ABAS_SO_DO_GERAL", "temPermissaoDaAba", "MODULOS", "podeAcessarAba", "podeAcessarModulo", "entrarModulo", "sairDoModulo",
    "SUB_ABAS_MEUPAINEL", "TITULOS_SUB_MEUPAINEL", "mostrarSubAbaMeupainel", "AJUDA_POR_ABA", "chaveAjudaAtual", "moduloAtual", "subAbaMeupainelAtual",
    "anexosModalContexto", "abrirModalAnexos", "carregarAnexosModal"
  ])), "script.js(extraido)");
  ev(extrair("modulos/calendario.js", ["calIso", "calHojeBrasilia", "calParaInstante", "calData", "calDataHora"]), "calendario.js(extraido)");
  ev(aplicarMutacoes("modulos/meus-dados.js", extrair("modulos/meus-dados.js", ["capitalize", "mostrarAbaSecretaria", "TITULOS_MODULOS"])), "meus-dados.js(extraido)");
  ev(lerApp("eventos.js"), "eventos.js");
  ev("registrarAcoes({ abrirModalAnexos, fecharModal, mostrarSubAbaMeupainel, mostrarTelaPainelInicial, voltarParaCheckin });", "acoes-do-script");
  // o módulo inteiro
  // (semModulo: o modulos/checkin-infantil.js falta ou está velho no cache do service worker — só o script.js e o meus-dados.js novos rodam)
  if (!semModulo) ev(aplicarMutacoes("modulos/checkin-infantil.js", lerApp("modulos/checkin-infantil.js")), "checkin-infantil.js");

  // ---- utilidades de teste ----
  const e = (id) => doc.getElementById(id);
  const ocioso = async () => { for (let i = 0; i < 40; i++) await new Promise(r => setImmediate(r)); };
  const sessao = ({ matricula, token = "tok", pin = false, nivel = "GLOBAL", permissoes = [], geral = false }) => {
    ev(`authToken = ${JSON.stringify(token)}; authMatricula = ${JSON.stringify(String(matricula))}; authNivel = ${pin ? "null" : JSON.stringify(nivel)}; authPermissoes = ${JSON.stringify(pin ? [] : permissoes)}; authGeral = ${!!geral};`, "sessao");
  };
  const g = (nome) => vm.runInContext(nome, contexto);
  const retem = (casa) => { const r = { casa, usada: false, chegou: false }; r.promessa = new Promise(res => { r.liberar = res; }); api.retencoes.push(r); return r; };
  const toasts = () => [...e("toastContainer").children].map(t => t.textContent);
  const modal = () => ({ aberto: !e("modalOverlay").classList.contains("escondido"), texto: e("modalCaixa").textContent });
  // responde ao modal de confirmação (o real: confirmarAcao) quando ele aparecer
  const responderModal = async (confirmar) => {
    for (let i = 0; i < 40 && e("modalOverlay").classList.contains("escondido"); i++) await new Promise(r => setImmediate(r));
    const aberto = !e("modalOverlay").classList.contains("escondido");
    const texto = e("modalCaixa").textContent;
    if (aberto) doc.clicar(e(confirmar ? "modalConfirmar" : "modalCancelar"));
    return { aberto, texto };
  };
  // responde ao pedido de texto (o real: pedirTexto) com `valor` (ou cancela com null)
  const responderTexto = async (valor) => {
    for (let i = 0; i < 40 && e("modalOverlay").classList.contains("escondido"); i++) await new Promise(r => setImmediate(r));
    const aberto = !e("modalOverlay").classList.contains("escondido");
    const titulo = e("modalCaixa").textContent;
    if (aberto) {
      if (valor == null) doc.clicar(e("modalCancelar"));
      else { e("modalTexto").value = valor; doc.clicar(e("modalConfirmar")); }
    }
    return { aberto, titulo };
  };
  const limparRegistro = () => { api.chamadas.length = 0; e("toastContainer").innerHTML = ""; ctx.__xss.chamadas.length = 0; doc._ataques.length = 0; saidaConsole.length = 0; };
  // relógio do roteiro: avança o "agora" do aparelho e dispara os intervalos que estiverem ativos (o setInterval de 8 s)
  const avancar = (ms) => { ctx.__relogioMs += ms; };
  const tique = () => { [...intervalos.values()].forEach(i => i.fn()); };
  const relogioMs = () => ctx.__relogioMs;
  const foco = () => doc.activeElement;
  const lerMutado = (rel) => aplicarMutacoes(rel, lerApp(rel));   // o mesmo arquivo do app, já com as trocas da prova de mutação (para as conferências de texto do roteiro)
  return { lerMutado, doc, ctx, api, ev, e, g, ocioso, sessao, retem, toasts, modal, responderModal, responderTexto, limparRegistro, errosDaPagina, resposta, intervalos, gravacoes, impressoes, avancar, tique, relogioMs, temporizadores, dispararTemporizador, foco, saidaConsole };
}

module.exports = { criarAmbiente, extrair, lerApp, APP };
