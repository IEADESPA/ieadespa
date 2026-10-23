// ambiente.js — monta o front de verdade (index.html + eventos.js + o módulo crise-seguranca.js) dentro de um vm, com o DOM mínimo de ../front-menores/dom.js e o servidor
// imitado de fixtures.js. O que roda é o código real: as funções do script.js e do meus-dados.js que a tela usa (fetchProtegido, confirmarAcao, mostrarToast, escaparHtmlEbd,
// argsAttr, urlSegura, limparSessao, a NAVEGAÇÃO entre abas...) são EXTRAÍDAS dos arquivos pela árvore do JavaScript — não reescritas aqui. Mesmo molde de
// tools/front-comunicacao/ambiente.js (leia o README de lá).
// `mutar` troca trechos do código antes de carregar (prova de mutação). CRS_MODULO=<caminho> roda o roteiro contra outra cópia do módulo.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const parser = require(path.resolve(__dirname, "../../api/node_modules/@babel/parser"));
const { Documento, Elemento, carregarHtml } = require("../front-menores/dom");

const RAIZ = path.resolve(__dirname, "../..");
const APP = path.join(RAIZ, "app");
const lerApp = (rel) => {
  if (rel === "modulos/crise-seguranca.js" && process.env.CRS_MODULO) return fs.readFileSync(process.env.CRS_MODULO, "utf8").replace(/\r\n/g, "\n");
  return fs.readFileSync(path.join(APP, rel), "utf8").replace(/\r\n/g, "\n");   // os arquivos do app estão em CRLF: aqui tudo é LF
};
Object.defineProperty(Elemento.prototype, "hidden", { configurable: true, get() { return this.hasAttribute("hidden"); }, set(v) { if (v) this.setAttribute("hidden", ""); else this.removeAttribute("hidden"); } });

function extrair(rel, nomes) {
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

function criarAmbiente({ mutar = {}, agora = new Date().toISOString(), servidor = null } = {}) {
  const doc = new Documento();
  Object.defineProperty(doc, "activeElement", { configurable: true, get() { return this.body; } });
  const marcarOriginal = doc.marcar.bind(doc);
  doc.marcar = (el, v) => {
    if (el.type === "radio" && v && el.getAttribute("name")) for (const x of doc.body.descendentes()) if (x !== el && x.localName === "input" && x.type === "radio" && x.getAttribute("name") === el.getAttribute("name")) x.checked = false;
    marcarOriginal(el, v);
  };
  const consoleDaTela = [];
  const anotar = (tipo) => (...a) => { consoleDaTela.push({ tipo, texto: a.map(x => (x && x.stack) || String(x)).join(" ") }); };
  const contexto = vm.createContext({ document: doc, console: { log: anotar("log"), error: anotar("error"), warn: anotar("warn"), info: anotar("info"), debug: anotar("debug") } });
  const ev = (codigo, nome) => vm.runInContext(codigo, contexto, { filename: nome });
  const aplicarMutacoes = (rel, codigo) => {
    for (const [de, para] of (mutar[rel] || [])) {
      const n = codigo.split(de).length - 1;
      if (n !== 1) throw new Error(`mutação inaplicável em ${rel} (${n} ocorrências): ${de.slice(0, 80)}`);
      codigo = codigo.replace(de, () => para);
    }
    return codigo;
  };

  const api = { chamadas: [], rotas: {}, retencoes: [], redeCaida: false, servidor };
  const ctx = contexto;
  ctx.fetch = async (url, opts = {}) => {
    const u = new URL(url, "http://local");
    const metodo = (opts.method || "GET").toUpperCase();
    const cabecalhos = Object.fromEntries(Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const chamada = { metodo, url: String(url), caminho: u.pathname.replace(/^\/api\//, ""), consulta: Object.fromEntries(u.searchParams), corpo: opts.body ? JSON.parse(opts.body) : null, cabecalhos, comPrazo: !!opts.signal };
    chamada.chave = `${metodo} ${chamada.caminho}`;
    chamada.token = cabecalhos["x-auth-token"] || null;
    api.chamadas.push(chamada);
    if (api.redeCaida) throw new TypeError("Failed to fetch");
    const rota = api.rotas[chamada.chave];
    let r = rota ? (typeof rota === "function" ? rota(chamada) : rota) : null;
    if (!r && api.servidor) r = await api.servidor(chamada);
    const reten = api.retencoes.find(x => !x.usada && x.casa(chamada));
    if (reten) {
      reten.usada = true; reten.chegou = true;
      const abortada = opts.signal ? new Promise((_, rej) => { const f = () => rej(Object.assign(new Error("The operation was aborted."), { name: "AbortError" })); if (opts.signal.aborted) f(); else opts.signal.addEventListener("abort", f, { once: true }); }) : null;
      await (abortada ? Promise.race([reten.promessa, abortada]) : reten.promessa);
    }
    if (!r) return resposta(404, { sucesso: false, mensagem: `rota sem imitação: ${chamada.chave}` });
    return resposta(r.status || 200, r.corpo, r.naoJson);
  };
  ctx.__relogioMs = Date.parse(agora);
  ev(`(() => { const Real = Date; class Falso extends Real { constructor(...a) { if (a.length === 0) super(globalThis.__relogioMs); else super(...a); } static now() { return globalThis.__relogioMs; } } globalThis.Date = Falso; })();`, "relogio");
  ctx.Intl = Intl;
  const temporizadores = new Map();
  let proximo = 1;
  ctx.setTimeout = (fn, ms) => { const id = proximo++; temporizadores.set(id, { fn, ms }); return id; };
  ctx.clearTimeout = (id) => { temporizadores.delete(id); };
  ctx.setInterval = (fn, ms) => { const id = proximo++; temporizadores.set(id, { fn, ms, intervalo: true }); return id; };
  ctx.clearInterval = (id) => { temporizadores.delete(id); };
  const dispararTemporizador = (ms) => { let n = 0; for (const [id, t] of [...temporizadores]) if (t.ms === ms) { temporizadores.delete(id); t.fn(); n++; } return n; };
  ctx.AbortController = AbortController;
  ctx.setImmediate = setImmediate;
  const gravacoes = [];
  const armazenamento = (nome) => { const itens = {}; return { getItem: (k) => (k in itens ? itens[k] : null), setItem: (k, v) => { itens[k] = String(v); gravacoes.push({ onde: nome, chave: k, valor: String(v) }); }, removeItem: (k) => { delete itens[k]; }, clear: () => {} }; };
  ctx.localStorage = armazenamento("localStorage");
  ctx.sessionStorage = armazenamento("sessionStorage");
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.__xss = function (c) { ctx.__xss.chamadas.push(String(c)); };
  ctx.__xss.chamadas = [];
  doc._executar = (codigo) => { try { vm.runInContext(codigo, contexto); } catch (e) { /* o ataque pode falhar; só importa se rodou */ } };

  carregarHtml(doc, aplicarMutacoes("index.html", lerApp("index.html")));
  const errosDaPagina = doc._erros.slice();
  doc._erros.length = 0;

  ev("var window = globalThis; var self = globalThis;", "janela");
  ev(`const API_BASE = "/api";
let authToken = null, authNome = null, authMatricula = null, authNivel = null, authGeral = false, authPermissoes = [], ultimaRecusa = null, ebdTurmasProfessor = [];
function marcarSessaoGeralNaPagina() { if (document.body) document.body.classList.toggle("sessao-geral", authGeral); }
function mostrarCriarPin() {} function mostrarModalTermos() {}
async function confirmarFatorAgora() { window.__fatorPedidos = (window.__fatorPedidos || 0) + 1; return window.__fatorConfirmar ? await window.__fatorConfirmar() : false; }
function carregarPainelInicial() {}`, "prelude");
  ev(aplicarMutacoes("script.js", extrair("script.js", [
    "mostrarToast", "fecharModal", "confirmarAcao", "escaparHtmlEbd", "argsAttr", "urlSegura", "formatarDataEbd", "mensagemPadraoDaRecusa", "fetchProtegido", "sessaoDeLiderancaNaTela",
    "limparSessao", "NOMES_ABAS", "ABA_PERMISSOES_ALT", "permissoesDaAba", "ABAS_SO_DO_GERAL", "temPermissaoDaAba", "MODULOS",
    "SUB_ABAS_MEUPAINEL", "TITULOS_SUB_MEUPAINEL", "mostrarSubAbaMeupainel", "AJUDA_POR_ABA", "chaveAjudaAtual", "moduloAtual", "subAbaMeupainelAtual"
  ])), "script.js(extraido)");
  ev(extrair("modulos/calendario.js", ["calIso", "calSomarDias", "calHojeBrasilia", "calParaInstante", "calData", "calDataHora"]), "calendario.js(extraido)");
  ev(aplicarMutacoes("modulos/meus-dados.js", extrair("modulos/meus-dados.js", ["capitalize", "mostrarAbaSecretaria", "TITULOS_MODULOS"])), "meus-dados.js(extraido)");
  ev(lerApp("eventos.js"), "eventos.js");
  ev("registrarAcoes({ fecharModal, mostrarSubAbaMeupainel, mostrarAbaSecretaria });", "acoes-do-script");
  ev(aplicarMutacoes("modulos/crise-seguranca.js", lerApp("modulos/crise-seguranca.js")), "crise-seguranca.js");

  const e = (id) => doc.getElementById(id);
  const ocioso = async () => { for (let i = 0; i < 80; i++) await new Promise(r => setImmediate(r)); };
  // sessão: token do servidor imitado; pin = sessão de membro (sem nível e sem permissões)
  const sessao = ({ matricula, token, pin = false, nivel = "CONGREGACAO", permissoes = [], geral = false }) => {
    ev(`authToken = ${JSON.stringify(token)}; authMatricula = ${JSON.stringify(String(matricula))}; authNivel = ${pin ? "null" : JSON.stringify(nivel)}; authPermissoes = ${JSON.stringify(pin ? [] : permissoes)}; authGeral = ${!!geral};`, "sessao");
  };
  const g = (nome) => vm.runInContext(nome, contexto);
  const retem = (casa) => { const r = { casa, usada: false, chegou: false }; r.promessa = new Promise(res => { r.liberar = res; }); api.retencoes.push(r); return r; };
  const toasts = () => [...e("toastContainer").children].map(t => t.textContent);
  const responderModal = async (confirmar) => {
    for (let i = 0; i < 80 && e("modalOverlay").classList.contains("escondido"); i++) await new Promise(r => setImmediate(r));
    const aberto = !e("modalOverlay").classList.contains("escondido");
    const texto = e("modalCaixa").textContent;
    if (aberto) doc.clicar(e(confirmar ? "modalConfirmar" : "modalCancelar"));
    return { aberto, texto };
  };
  const limparRegistro = () => { api.chamadas.length = 0; e("toastContainer").innerHTML = ""; };
  return { doc, ctx, api, ev, e, g, ocioso, sessao, retem, toasts, responderModal, limparRegistro, errosDaPagina, temporizadores, dispararTemporizador, gravacoes, consoleDaTela };
}

module.exports = { criarAmbiente, extrair, lerApp };
