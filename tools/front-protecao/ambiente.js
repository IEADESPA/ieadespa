// ambiente.js — monta o front de verdade (index.html + eventos.js + o módulo protecao.js) dentro de um vm, com o DOM mínimo de ../front-menores/dom.js e uma API simulada.
// O que roda é o código real: as funções do script.js e do meus-dados.js que a tela usa (fetchProtegido com a confirmação reforçada 428, confirmarAcao, mostrarToast,
// escaparHtmlEbd, argsAttr, limparSessao, esconderTodasAsTelas, a NAVEGAÇÃO entre abas e módulos, o modal de anexos...) são EXTRAÍDAS dos arquivos pela árvore do JavaScript —
// não reescritas aqui. Além do molde de front-menores, este ambiente tem: relógio controlado (Date falso), setInterval/clearInterval observáveis, localStorage/sessionStorage
// que anotam tudo o que lhes é gravado, window.print observável e o registro dos cabeçalhos de cada chamada (para provar que o canal público não leva token).
// `mutar` troca trechos do código antes de carregar (prova de mutação).
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const parser = require(path.resolve(__dirname, "../../api/node_modules/@babel/parser"));
const { Documento, carregarHtml } = require("../front-menores/dom");

const RAIZ = path.resolve(__dirname, "../..");
const APP = path.join(RAIZ, "app");
const lerApp = (rel) => fs.readFileSync(path.join(APP, rel), "utf8").replace(/\r\n/g, "\n");   // os arquivos do app estão em CRLF: aqui tudo é LF (as mutações e o vm não ligam)

// ---- extração de declarações de nível superior (funções, const/let) pelo nome ----
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

// `mutar`: { "modulos/protecao.js": [[de, para], ...] } — cada troca tem de achar o trecho exatamente uma vez
function criarAmbiente({ mutar = {}, agora = "2026-10-09T15:00:00.000Z" } = {}) {
  const doc = new Documento();
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

  // ---- estado da API simulada ----
  const api = { chamadas: [], rotas: {}, retencoes: [], redeCaida: false };
  const ctx = contexto;
  ctx.fetch = async (url, opts = {}) => {
    const u = new URL(url, "http://local");
    const metodo = (opts.method || "GET").toUpperCase();
    const cabecalhos = Object.fromEntries(Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const chamada = { metodo, caminho: u.pathname.replace(/^\/api\//, ""), consulta: Object.fromEntries(u.searchParams), corpo: opts.body ? JSON.parse(opts.body) : null, semFator: !!opts.semFator, cabecalhos };
    chamada.chave = `${metodo} ${chamada.caminho}`;
    chamada.comToken = "x-auth-token" in cabecalhos || "authorization" in cabecalhos;
    api.chamadas.push(chamada);
    // a resposta nasce quando o pedido CHEGA ao servidor (como num servidor de verdade): uma retenção só atrasa a entrega, e quem trocou de login enquanto isso recebe o que era de quem pediu
    const rota = api.rotas[chamada.chave] || api.rotas[`${metodo} ${chamada.caminho.replace(/\?.*/, "")}`];
    const r = rota ? (typeof rota === "function" ? rota(chamada) : rota) : null;
    const reten = api.retencoes.find(x => !x.usada && x.casa(chamada));
    if (reten) { reten.usada = true; reten.chegou = true; await reten.promessa; }
    if (api.redeCaida) throw new TypeError("Failed to fetch");
    if (!r) return resposta(404, { sucesso: false, mensagem: `rota sem fixture: ${chamada.chave}` });
    return resposta(r.status || 200, r.corpo, r.naoJson);
  };

  // ---- relógio controlado: Date falso (new Date() e Date.now() devolvem o relógio do ambiente) ----
  ctx.__relogioMs = Date.parse(agora);
  ev(`(() => { const Real = Date; class Falso extends Real { constructor(...a) { if (a.length === 0) super(globalThis.__relogioMs); else super(...a); } static now() { return globalThis.__relogioMs; } } globalThis.Date = Falso; })();`, "relogio");
  // ---- intervalos observáveis: nada roda sozinho; o roteiro dispara o tique ----
  const intervalos = new Map();
  let proximoIntervalo = 1;
  ctx.setInterval = (fn, ms) => { const id = proximoIntervalo++; intervalos.set(id, { fn, ms }); return id; };
  ctx.clearInterval = (id) => { intervalos.delete(id); };
  ctx.setTimeout = () => 0;            // os toasts e o resto ficam parados: a conferência conta o que ficou na tela
  ctx.clearTimeout = () => {};
  ctx.setImmediate = setImmediate;
  // ---- armazenamento do navegador: anota tudo o que for gravado (o texto de uma criança nunca pode estar aqui) ----
  const gravacoes = [];
  const armazenamento = (nome) => { const itens = {}; return { getItem: (k) => (k in itens ? itens[k] : null), setItem: (k, v) => { itens[k] = String(v); gravacoes.push({ onde: nome, chave: k, valor: String(v) }); }, removeItem: (k) => { delete itens[k]; }, clear: () => {} }; };
  ctx.localStorage = armazenamento("localStorage");
  ctx.sessionStorage = armazenamento("sessionStorage");
  // ---- impressão observável ----
  const impressoes = [];
  ctx.print = () => { impressoes.push({ classeImprimindo: doc.body.classList.contains("prt-imprimindo") }); };
  ctx.__xss = function (c) { ctx.__xss.chamadas.push(String(c)); };
  ctx.__xss.chamadas = [];
  doc._executar = (codigo) => { try { vm.runInContext(codigo, contexto); } catch (e) { /* o ataque pode falhar; só importa se rodou */ } };

  // ---- a página de verdade ----
  carregarHtml(doc, aplicarMutacoes("index.html", lerApp("index.html")));
  const errosDaPagina = doc._erros.length;
  doc._erros.length = 0;

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
    "mostrarToast", "fecharModal", "confirmarAcao", "escaparHtmlEbd", "argsAttr", "urlSegura", "formatarDataEbd", "mensagemPadraoDaRecusa", "fetchProtegido", "sessaoDeLiderancaNaTela", "listaDaApi", "jsonDaTela",
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
  ev(aplicarMutacoes("modulos/protecao.js", lerApp("modulos/protecao.js")), "protecao.js");

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
  const limparRegistro = () => { api.chamadas.length = 0; e("toastContainer").innerHTML = ""; ctx.__xss.chamadas.length = 0; doc._ataques.length = 0; };
  // relógio do roteiro: avança o "agora" do aparelho e dispara os intervalos que estiverem ativos (o setInterval de 30 s)
  const avancar = (ms) => { ctx.__relogioMs += ms; };
  const tique = () => { [...intervalos.values()].forEach(i => i.fn()); };
  const relogioMs = () => ctx.__relogioMs;
  return { doc, ctx, api, ev, e, g, ocioso, sessao, retem, toasts, modal, responderModal, limparRegistro, errosDaPagina, resposta, intervalos, gravacoes, impressoes, avancar, tique, relogioMs };
}

module.exports = { criarAmbiente, extrair, lerApp };
