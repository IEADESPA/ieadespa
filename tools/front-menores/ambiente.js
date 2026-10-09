// ambiente.js — monta o front de verdade (index.html + eventos.js + os módulos) dentro de um vm, com o DOM mínimo e uma API simulada.
// O que roda é o código real: as funções do script.js usadas pelos módulos (fetchProtegido com a confirmação reforçada 428, confirmarAcao, mostrarToast, escaparHtmlEbd,
// argsAttr...) são EXTRAÍDAS do script.js pela árvore do JavaScript — não reescritas aqui. `mutar` troca trechos do código antes de carregar (prova de mutação).
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const parser = require(path.resolve(__dirname, "../../api/node_modules/@babel/parser"));
const { Documento, carregarHtml } = require("./dom");

const RAIZ = path.resolve(__dirname, "../..");
const APP = path.join(RAIZ, "app");
const lerApp = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

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

function resposta(status, corpo) {
  const r = { status, ok: status >= 200 && status < 300, json: async () => JSON.parse(JSON.stringify(corpo)) };
  r.clone = () => resposta(status, corpo);
  return r;
}

// `mutar`: { "modulos/ministerio-menores.js": [[de, para], ...] } — cada troca tem de achar o trecho exatamente uma vez
function criarAmbiente({ mutar = {} } = {}) {
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

  // estado da API simulada
  const api = { chamadas: [], rotas: {}, retencoes: [], fatorRecente: false, atraso: null };
  const ctx = contexto;
  ctx.fetch = async (url, opts = {}) => {
    const u = new URL(url, "http://local");
    const metodo = (opts.method || "GET").toUpperCase();
    const chamada = { metodo, caminho: u.pathname.replace(/^\/api\//, ""), consulta: Object.fromEntries(u.searchParams), corpo: opts.body ? JSON.parse(opts.body) : null, semFator: !!opts.semFator };
    chamada.chave = `${metodo} ${chamada.caminho}`;
    api.chamadas.push(chamada);
    const reten = api.retencoes.find(r => !r.usada && r.casa(chamada));
    if (reten) { reten.usada = true; reten.chegou = true; await reten.promessa; }
    if (api.redeCaida) throw new TypeError("Failed to fetch");
    const rota = api.rotas[chamada.chave] || api.rotas[`${metodo} ${chamada.caminho.replace(/\?.*/, "")}`];
    if (!rota) return resposta(404, { sucesso: false, mensagem: `rota sem fixture: ${chamada.chave}` });
    const r = typeof rota === "function" ? rota(chamada) : rota;
    return resposta(r.status || 200, r.corpo);
  };
  ctx.setTimeout = () => 0;            // os toasts e o resto ficam parados: a conferência conta o que ficou na tela
  ctx.clearTimeout = () => {};
  ctx.setImmediate = setImmediate;
  ctx.__xss = function (c) { ctx.__xss.chamadas.push(String(c)); };
  ctx.__xss.chamadas = [];
  doc._executar = (codigo) => { try { vm.runInContext(codigo, contexto); } catch (e) { /* o ataque pode falhar; só importa se rodou */ } };

  // a página de verdade
  carregarHtml(doc, lerApp("index.html"));
  const errosDaPagina = doc._erros.length;
  doc._erros.length = 0;

  ev("var window = globalThis; var self = globalThis;", "janela");
  ev(`const API_BASE = "/api";
let authToken = null, authMatricula = null, authNivel = null, authGeral = false, authPermissoes = [], ultimaRecusa = null;
function limparSessao() { authToken = null; authMatricula = null; authNivel = null; authGeral = false; authPermissoes = []; }
function mostrarTelaPainelInicial() { window.__telaInicial = (window.__telaInicial || 0) + 1; }
function mostrarCriarPin() {} function mostrarModalTermos() {}
async function confirmarFatorAgora() { window.__fatorPedidos = (window.__fatorPedidos || 0) + 1; return window.__fatorConfirmar ? await window.__fatorConfirmar() : false; }
function abrirRecorteFoto() { return Promise.resolve({ base64: "AAAA", mimeType: "image/jpeg" }); }
function avisarResultado(d) { mostrarToast(d.mensagem, d.sucesso ? "sucesso" : "erro"); }
let volServicoRodizio = {};
async function volGarantirCatalogos() {} function volCelulaNatureza() { return ""; } function volCarregarEscalasAcao() {} function volCarregarHabilitacaoAcao() {}
function volDataHora(v) { return String(v); } function volData(v) { return String(v); } function volDataParede(v) { return String(v); } function volDataInstante(v) { return String(v); }
function volEsc(v) { return escaparHtmlEbd(v); } function volObter() { return Promise.resolve({ sucesso: false }); } function volEnviar() { return Promise.resolve({ sucesso: false }); } function volMsgErro() { return ""; }
function volCarregarMinhasEscalasAcao() {} function volCarregarTermoAcao() {}
function badgeStatusLgpd(s) { return s; } function carregarConsentimentoLGPD() {} function carregarMinhasSolicitacoesLGPD() {}`, "prelude");
  // do script.js: o que os módulos usam
  ev(extrair("script.js", ["mostrarToast", "fecharModal", "confirmarAcao", "escaparHtmlEbd", "argsAttr", "urlSegura", "formatarDataEbd", "mensagemPadraoDaRecusa", "fetchProtegido", "sessaoDeLiderancaNaTela", "listaDaApi"]), "script.js(extraido)");
  ev(extrair("modulos/calendario.js", ["calIso", "calHojeBrasilia", "calParaInstante", "calData", "calDataHora"]), "calendario.js(extraido)");
  ev(extrair("modulos/meus-dados.js", ["capitalize"]), "meus-dados.js(capitalize)");
  ev(lerApp("eventos.js"), "eventos.js");
  // módulos: o do ministério com menores e o das escalas, inteiros; das demais telas, só as funções que mudaram
  ev(aplicarMutacoes("modulos/ministerio-menores.js", lerApp("modulos/ministerio-menores.js")), "ministerio-menores.js");
  ev(aplicarMutacoes("modulos/escalas.js", lerApp("modulos/escalas.js")), "escalas.js");
  ev(aplicarMutacoes("modulos/meus-dados.js", extrair("modulos/meus-dados.js", ["minhaFotoBloqueadaParaMenor", "minhaFotoDono", "aplicarEnvioDaMinhaFoto", "carregarMinhaFoto", "enviarMinhaFotoAcao"])), "meus-dados.js(foto)");
  ev(aplicarMutacoes("modulos/pessoas.js", extrair("modulos/pessoas.js", ["carregarAbaFoto"])), "pessoas.js(foto)");
  ev(aplicarMutacoes("modulos/meu-painel.js", extrair("modulos/meu-painel.js", ["formatarValorLgpd", "linhaLgpd", "volCartaoMeusDados", "alternarMeusDadosLGPD"])), "meu-painel.js(lgpd)");

  // ---- utilidades de teste ----
  const e = (id) => doc.getElementById(id);
  const ocioso = async () => { for (let i = 0; i < 40; i++) await new Promise(r => setImmediate(r)); };
  const sessao = ({ matricula, token = "tok", pin = false, nivel = "GLOBAL", permissoes = [], geral = false }) => {
    ev(`authToken = ${JSON.stringify(token)}; authMatricula = ${matricula}; authNivel = ${pin ? "null" : JSON.stringify(nivel)}; authPermissoes = ${JSON.stringify(pin ? [] : permissoes)}; authGeral = ${!!geral};`, "sessao");
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
  return { doc, ctx, api, ev, e, g, ocioso, sessao, retem, toasts, modal, responderModal, limparRegistro, errosDaPagina, resposta };
}

module.exports = { criarAmbiente, extrair, lerApp };
