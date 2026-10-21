// ambiente.js — monta o front de verdade (index.html + eventos.js + o módulo cuidado-pastoral.js) dentro de um vm, com o DOM mínimo de ../front-menores/dom.js e o servidor
// imitado de fixtures.js. O que roda é o código real: as funções do script.js e do meus-dados.js que a tela usa (fetchProtegido, confirmarAcao, mostrarToast, escaparHtmlEbd,
// argsAttr, urlSegura, limparSessao, a NAVEGAÇÃO entre abas, módulos e sub-abas de Meu Painel...) são EXTRAÍDAS dos arquivos pela árvore do JavaScript — não reescritas aqui.
// Mesmo molde de tools/front-protecao/ambiente.js, mais: o servidor imitado (api.servidor) responde a toda chamada que não tiver resposta fixa (api.rotas), o console da tela
// é anotado (nome, nota e pedido nunca podem aparecer nele) e o confirmarFatorAgora (a confirmação reforçada da vD.4) é observável.
// `mutar` troca trechos do código antes de carregar (prova de mutação, que a sessão principal roda à parte).
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const parser = require(path.resolve(__dirname, "../../api/node_modules/@babel/parser"));
const { Documento, carregarHtml } = require("../front-menores/dom");

const RAIZ = path.resolve(__dirname, "../..");
const APP = path.join(RAIZ, "app");
const lerApp = (rel) => fs.readFileSync(path.join(APP, rel), "utf8").replace(/\r\n/g, "\n");   // os arquivos do app estão em CRLF: aqui tudo é LF

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

// `mutar`: { "modulos/cuidado-pastoral.js": [[de, para], ...] } — cada troca tem de achar o trecho exatamente uma vez
function criarAmbiente({ mutar = {}, agora = new Date().toISOString(), semModulo = false, servidor = null } = {}) {
  const doc = new Documento();
  // foco, como o navegador: só recebe foco o que é focalizável e não está dentro de algo escondido; elemento retirado da árvore perde o foco (volta ao body)
  const Elemento = doc.body.constructor;
  const FORA_DA_CONTA = ["telaPainel", "cxPainelConteudo"];
  const focalizavel = (el) => { for (let p = el; p && p.nodeType === 1; p = p.parentNode) if (p.style && p.style.display === "none" && !FORA_DA_CONTA.includes(p.id)) return false; return !el.disabled && (el.hasAttribute("tabindex") || ["input", "select", "textarea", "button"].includes(el.localName) && el.type !== "hidden" || (el.localName === "a" && el.hasAttribute("href"))); };
  Elemento.prototype.focus = function () { if (focalizavel(this)) { this.ownerDocument._focado = this; this.ownerDocument._focos.push(this.id || this.localName); } };
  Object.defineProperty(Elemento.prototype, "isConnected", { configurable: true, get() { for (let p = this; p; p = p.parentNode) if (p === this.ownerDocument.body) return true; return false; } });
  doc._focos = []; doc._focado = null; doc.visibilityState = "visible";
  Object.defineProperty(doc, "activeElement", { configurable: true, get() { return this._focado && this._focado.isConnected ? this._focado : this.body; } });
  // o console da tela é anotado (e não sai no terminal): nome, nota e pedido de oração nunca podem estar nele
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

  // ---- a API: resposta fixa (api.rotas) ou o servidor imitado (api.servidor) ----
  const api = { chamadas: [], rotas: {}, retencoes: [], redeCaida: false, servidor };
  const ctx = contexto;
  ctx.fetch = async (url, opts = {}) => {
    const u = new URL(url, "http://local");
    const metodo = (opts.method || "GET").toUpperCase();
    const cabecalhos = Object.fromEntries(Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const chamada = { metodo, url: String(url), caminho: u.pathname.replace(/^\/api\//, ""), consulta: Object.fromEntries(u.searchParams), corpo: opts.body ? JSON.parse(opts.body) : null, semFator: !!opts.semFator, cabecalhos, comPrazo: !!opts.signal };
    chamada.chave = `${metodo} ${chamada.caminho}`;
    chamada.comToken = "x-auth-token" in cabecalhos || "authorization" in cabecalhos;
    api.chamadas.push(chamada);
    if (api.redeCaida) throw new TypeError("Failed to fetch");
    // a resposta nasce quando o pedido CHEGA ao servidor: uma retenção só atrasa a entrega (quem trocou de login enquanto isso recebe o que era de quem pediu)
    const rota = api.rotas[chamada.chave];
    let r = rota ? (typeof rota === "function" ? rota(chamada) : rota) : null;
    if (!r && api.servidor) r = await api.servidor(chamada);
    const reten = api.retencoes.find(x => !x.usada && x.casa(chamada));
    if (reten) {
      reten.usada = true; reten.chegou = true;
      // o pedido tem prazo (signal): é interrompido quando o sinal dispara, como o fetch de verdade faz
      const abortada = opts.signal ? new Promise((_, rej) => { const f = () => rej(Object.assign(new Error("The operation was aborted."), { name: "AbortError" })); if (opts.signal.aborted) f(); else opts.signal.addEventListener("abort", f, { once: true }); }) : null;
      await (abortada ? Promise.race([reten.promessa, abortada]) : reten.promessa);
    }
    if (!r) return resposta(404, { sucesso: false, mensagem: `rota sem imitação: ${chamada.chave}` });
    return resposta(r.status || 200, r.corpo, r.naoJson);
  };

  // ---- relógio controlado: Date falso (new Date() e Date.now() devolvem o relógio do ambiente) ----
  ctx.__relogioMs = Date.parse(agora);
  ev(`(() => { const Real = Date; class Falso extends Real { constructor(...a) { if (a.length === 0) super(globalThis.__relogioMs); else super(...a); } static now() { return globalThis.__relogioMs; } } globalThis.Date = Falso; })();`, "relogio");
  ctx.Intl = Intl;
  // ---- intervalos e temporizadores observáveis: nada roda sozinho; o roteiro dispara o que quer provar (ex.: o prazo de 20 s) ----
  const intervalos = new Map();
  let proximoIntervalo = 1;
  ctx.setInterval = (fn, ms) => { const id = proximoIntervalo++; intervalos.set(id, { fn, ms }); return id; };
  ctx.clearInterval = (id) => { intervalos.delete(id); };
  const temporizadores = new Map();
  let proximoTemporizador = 1;
  ctx.setTimeout = (fn, ms) => { const id = proximoTemporizador++; temporizadores.set(id, { fn, ms }); return id; };
  ctx.clearTimeout = (id) => { temporizadores.delete(id); };
  const dispararTemporizador = (ms) => { let n = 0; for (const [id, t] of [...temporizadores]) if (t.ms === ms) { temporizadores.delete(id); t.fn(); n++; } return n; };
  ctx.AbortController = AbortController;
  ctx.setImmediate = setImmediate;
  // ---- armazenamento do navegador: anota tudo o que for gravado (nome, nota e pedido nunca podem estar aqui) ----
  const gravacoes = [];
  const armazenamento = (nome) => { const itens = {}; return { getItem: (k) => (k in itens ? itens[k] : null), setItem: (k, v) => { itens[k] = String(v); gravacoes.push({ onde: nome, chave: k, valor: String(v) }); }, removeItem: (k) => { delete itens[k]; }, clear: () => {} }; };
  ctx.localStorage = armazenamento("localStorage");
  ctx.sessionStorage = armazenamento("sessionStorage");
  // ---- impressão observável ----
  const impressoes = [];
  ctx.print = () => { impressoes.push({ classeImprimindo: doc.body.classList.contains("cpa-imprimindo"), conteudo: (doc.getElementById("cpaBolImprimivel") || { textContent: "" }).textContent }); };
  ctx.__xss = function (c) { ctx.__xss.chamadas.push(String(c)); };
  ctx.__xss.chamadas = [];
  doc._executar = (codigo) => { try { vm.runInContext(codigo, contexto); } catch (e) { /* o ataque pode falhar; só importa se rodou */ } };

  // ---- a página de verdade ----
  carregarHtml(doc, aplicarMutacoes("index.html", lerApp("index.html")));
  const errosDaPagina = doc._erros.slice();
  doc._erros.length = 0;

  ev("var window = globalThis; var self = globalThis;", "janela");
  ev(`const API_BASE = "/api";
let authToken = null, authNome = null, authMatricula = null, authNivel = null, authGeral = false, authPermissoes = [], ultimaRecusa = null, ebdTurmasProfessor = [];
function marcarSessaoGeralNaPagina() { if (document.body) document.body.classList.toggle("sessao-geral", authGeral); }
function mostrarTelaPainelInicial() { window.__telaInicial = (window.__telaInicial || 0) + 1; }
function mostrarCriarPin() {} function mostrarModalTermos() {}
async function confirmarFatorAgora() { window.__fatorPedidos = (window.__fatorPedidos || 0) + 1; return window.__fatorConfirmar ? await window.__fatorConfirmar() : false; }
function carregarPainelInicial() { window.__painelInicial = (window.__painelInicial || 0) + 1; }`, "prelude");
  // do script.js: o que o módulo usa, a navegação entre abas/módulos/sub-abas e a limpeza da sessão
  ev(aplicarMutacoes("script.js", extrair("script.js", [
    "mostrarToast", "fecharModal", "confirmarAcao", "escaparHtmlEbd", "argsAttr", "urlSegura", "formatarDataEbd", "mensagemPadraoDaRecusa", "fetchProtegido", "sessaoDeLiderancaNaTela",
    "limparSessao", "NOMES_ABAS", "ABA_PERMISSOES_ALT", "permissoesDaAba", "ABAS_SO_DO_GERAL", "temPermissaoDaAba", "MODULOS", "podeAcessarAba", "podeAcessarModulo", "entrarModulo", "sairDoModulo",
    "SUB_ABAS_MEUPAINEL", "TITULOS_SUB_MEUPAINEL", "mostrarSubAbaMeupainel", "AJUDA_POR_ABA", "chaveAjudaAtual", "moduloAtual", "subAbaMeupainelAtual", "aplicarPermissoesNoMenu", "montarGradeModulos"
  ])), "script.js(extraido)");
  ev(extrair("modulos/calendario.js", ["calIso", "calSomarDias", "calHojeBrasilia", "calParaInstante", "calData", "calDataHora"]), "calendario.js(extraido)");
  ev(aplicarMutacoes("modulos/meus-dados.js", extrair("modulos/meus-dados.js", ["capitalize", "mostrarAbaSecretaria", "TITULOS_MODULOS"])), "meus-dados.js(extraido)");
  ev(lerApp("eventos.js"), "eventos.js");
  ev("registrarAcoes({ fecharModal, mostrarSubAbaMeupainel, mostrarTelaPainelInicial, mostrarAbaSecretaria, sairDoModulo, entrarModulo });", "acoes-do-script");
  // o módulo inteiro (semModulo: o modulos/cuidado-pastoral.js falta ou está velho no cache do service worker — só o script.js e o meus-dados.js novos rodam)
  if (!semModulo) ev(aplicarMutacoes("modulos/cuidado-pastoral.js", lerApp("modulos/cuidado-pastoral.js")), "cuidado-pastoral.js");

  // ---- utilidades de teste ----
  const e = (id) => doc.getElementById(id);
  const ocioso = async () => { for (let i = 0; i < 60; i++) await new Promise(r => setImmediate(r)); };
  // sessão: token do servidor imitado; pin = sessão de membro (sem nível e sem permissões)
  const sessao = ({ matricula, token, pin = false, nivel = "CONGREGACAO", permissoes = ["cuidado_pastoral"], geral = false }) => {
    ev(`authToken = ${JSON.stringify(token)}; authMatricula = ${JSON.stringify(String(matricula))}; authNivel = ${pin ? "null" : JSON.stringify(nivel)}; authPermissoes = ${JSON.stringify(pin ? [] : permissoes)}; authGeral = ${!!geral};`, "sessao");
  };
  const g = (nome) => vm.runInContext(nome, contexto);
  const retem = (casa) => { const r = { casa, usada: false, chegou: false }; r.promessa = new Promise(res => { r.liberar = res; }); api.retencoes.push(r); return r; };
  const toasts = () => [...e("toastContainer").children].map(t => t.textContent);
  const responderModal = async (confirmar) => {
    for (let i = 0; i < 60 && e("modalOverlay").classList.contains("escondido"); i++) await new Promise(r => setImmediate(r));
    const aberto = !e("modalOverlay").classList.contains("escondido");
    const texto = e("modalCaixa").textContent;
    if (aberto) doc.clicar(e(confirmar ? "modalConfirmar" : "modalCancelar"));
    return { aberto, texto };
  };
  const limparRegistro = () => { api.chamadas.length = 0; e("toastContainer").innerHTML = ""; ctx.__xss.chamadas.length = 0; doc._ataques.length = 0; };
  const foco = () => doc.activeElement;
  return { doc, ctx, api, ev, e, g, ocioso, sessao, retem, toasts, responderModal, limparRegistro, errosDaPagina, resposta, intervalos, temporizadores, dispararTemporizador, gravacoes, impressoes, foco, consoleDaTela };
}

module.exports = { criarAmbiente, extrair, lerApp };
