// ambiente.js — monta o front de verdade (index.html + eventos.js + os módulos identidade-visual.js e enquetes.js) dentro de um vm, com o DOM mínimo de ../front-menores/dom.js
// e o servidor imitado de fixtures.js. O que roda é o código real: as funções do script.js e do meus-dados.js que a tela usa (fetchProtegido, confirmarAcao, mostrarToast,
// escaparHtmlEbd, argsAttr, urlSegura, limparSessao, jsonDaTela, a NAVEGAÇÃO entre abas, módulos e sub-abas de Meu Painel...) são EXTRAÍDAS dos arquivos pela árvore do
// JavaScript — não reescritas aqui. Mesmo molde de tools/front-comunicacao/ambiente.js, mais: btoa (a arte vai em base64), o arquivo escolhido no <input type="file"> e o
// seletor "#lista > div" que o formulário de enquete da liderança usa.
// `mutar` troca trechos do código antes de carregar (prova de mutação). IDV_MODULO=<caminho> roda o roteiro contra outra cópia do identidade-visual.js; ENQ_MODULO, do enquetes.js.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const parser = require(path.resolve(__dirname, "../../api/node_modules/@babel/parser"));
const { Documento, Elemento, carregarHtml } = require("../front-menores/dom");

const RAIZ = path.resolve(__dirname, "../..");
const APP = path.join(RAIZ, "app");
const lerApp = (rel) => {
  if (rel === "modulos/identidade-visual.js" && process.env.IDV_MODULO) return fs.readFileSync(process.env.IDV_MODULO, "utf8").replace(/\r\n/g, "\n");
  if (rel === "modulos/enquetes.js" && process.env.ENQ_MODULO) return fs.readFileSync(process.env.ENQ_MODULO, "utf8").replace(/\r\n/g, "\n");
  return fs.readFileSync(path.join(APP, rel), "utf8").replace(/\r\n/g, "\n");   // os arquivos do app estão em CRLF: aqui tudo é LF
};

// ---- o que o dom.js não tem e esta tela usa: hidden gravável; "#id > tag" (lerBlocosPerguntaEnquete) ----
Object.defineProperty(Elemento.prototype, "hidden", { configurable: true, get() { return this.hasAttribute("hidden"); }, set(v) { if (v) this.setAttribute("hidden", ""); else this.removeAttribute("hidden"); } });
const qsaOriginal = Documento.prototype.querySelectorAll;
Documento.prototype.querySelectorAll = function (sel) {
  const filhos = /^#([A-Za-z0-9_-]+) > ([a-z]+)$/.exec(sel);
  if (filhos) { const pai = this.getElementById(filhos[1]); return pai ? pai.children.filter(c => c.nodeType === 1 && c.localName === filhos[2]) : []; }
  return qsaOriginal.call(this, sel);
};

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

// Imagens de verdade, como o servidor exige desde que passou a tirar os metadados (iv.prepararImagem): o PNG percorrido de IHDR a IEND, o JPEG até o fim da imagem (EOI).
// `metadado` acrescenta o que o servidor tira (o texto do autor no PNG; o EXIF no JPEG); `semFim` corta o arquivo antes do IEND/EOI (o servidor recusa).
function pedacoPng(tipo, dados) {
  const d = Buffer.from(dados);
  const b = Buffer.alloc(12 + d.length);
  b.writeUInt32BE(d.length, 0); b.write(tipo, 4, "latin1"); d.copy(b, 8);
  return b;                                                     // o CRC fica zerado: o servidor não confere
}
function pngReal({ metadado = false, semFim = false, desenho = [1, 2, 3, 250, 251, 252, 0, 7] } = {}) {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pedacoPng("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
    ...(metadado ? [pedacoPng("tEXt", Buffer.from("Author Ana Sugestora", "latin1"))] : []), pedacoPng("IDAT", desenho), ...(semFim ? [] : [pedacoPng("IEND", [])])]);
}
function jpegReal({ metadado = false, semFim = false } = {}) {
  const seg = (m, dados) => { const d = Buffer.from(dados); const b = Buffer.alloc(4 + d.length); b[0] = 0xff; b[1] = m; b.writeUInt16BE(d.length + 2, 2); d.copy(b, 4); return b; };
  return Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, [74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), ...(metadado ? [seg(0xe1, Buffer.from("Exif  GPS -1.45 -48.49", "latin1"))] : []),
    seg(0xdb, [0, ...new Array(64).fill(1)]), seg(0xda, [1, 1, 0, 0, 63, 0]), Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56]), ...(semFim ? [] : [Buffer.from([0xff, 0xd9])])]);
}
// Um arquivo escolhido no <input type="file">, como o navegador entrega (name, type, size e arrayBuffer()).
function arquivo({ nome = "arte.png", tipo = "image/png", bytes = null, tamanho = null } = {}) {
  const b = bytes || pngReal();
  return { name: nome, type: tipo, size: tamanho == null ? b.length : tamanho, lidos: 0, async arrayBuffer() { this.lidos++; return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } };
}

// `mutar`: { "modulos/identidade-visual.js": [[de, para], ...] } — cada troca tem de achar o trecho exatamente uma vez
function criarAmbiente({ mutar = {}, agora = new Date().toISOString(), semModulo = false, servidor = null } = {}) {
  const doc = new Documento();
  Object.defineProperty(doc, "activeElement", { configurable: true, get() { return this.body; } });
  // rádio: marcar um desmarca os outros do mesmo nome, como o navegador
  const marcarOriginal = doc.marcar.bind(doc);
  doc.marcar = (el, v) => {
    if (el.type === "radio" && v && el.getAttribute("name")) for (const x of doc.body.descendentes()) if (x !== el && x.localName === "input" && x.type === "radio" && x.getAttribute("name") === el.getAttribute("name")) x.checked = false;
    marcarOriginal(el, v);
  };
  // o console da tela é anotado (e não sai no terminal): sugestão, nome e voto nunca podem estar nele
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
    const chamada = { metodo, url: String(url), caminho: u.pathname.replace(/^\/api\//, ""), consulta: Object.fromEntries(u.searchParams), corpo: opts.body ? JSON.parse(opts.body) : null, corpoBruto: opts.body || null, semFator: !!opts.semFator, cabecalhos, comPrazo: !!opts.signal };
    chamada.chave = `${metodo} ${chamada.caminho}`;
    chamada.comToken = !!cabecalhos["x-auth-token"];
    chamada.token = cabecalhos["x-auth-token"] || null;
    api.chamadas.push(chamada);
    if (api.redeCaida) throw new TypeError("Failed to fetch");
    // a resposta nasce quando o pedido CHEGA ao servidor: uma retenção só atrasa a entrega
    const rota = api.rotas[chamada.chave];
    let r = rota ? await (typeof rota === "function" ? rota(chamada) : rota) : null;
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

  // ---- relógio controlado ----
  ctx.__relogioMs = Date.parse(agora);
  ev(`(() => { const Real = Date; class Falso extends Real { constructor(...a) { if (a.length === 0) super(globalThis.__relogioMs); else super(...a); } static now() { return globalThis.__relogioMs; } } globalThis.Date = Falso; })();`, "relogio");
  ctx.Intl = Intl;
  ctx.btoa = (s) => btoa(s);
  // ---- temporizadores observáveis: nada roda sozinho; o roteiro dispara o que quer provar (o prazo de 20 s) ----
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
  // ---- armazenamento do navegador: anota tudo o que for gravado ----
  const gravacoes = [];
  const armazenamento = (nome) => { const itens = {}; return { getItem: (k) => (k in itens ? itens[k] : null), setItem: (k, v) => { itens[k] = String(v); gravacoes.push({ onde: nome, chave: k, valor: String(v) }); }, removeItem: (k) => { delete itens[k]; }, clear: () => {} }; };
  ctx.localStorage = armazenamento("localStorage");
  ctx.sessionStorage = armazenamento("sessionStorage");
  const ouvintesJanela = {};
  ctx.addEventListener = (tipo, fn) => { (ouvintesJanela[tipo] = ouvintesJanela[tipo] || []).push(fn); };
  ctx.removeEventListener = (tipo, fn) => { ouvintesJanela[tipo] = (ouvintesJanela[tipo] || []).filter(x => x !== fn); };
  ctx.__xss = function (c) { ctx.__xss.chamadas.push(String(c)); };
  ctx.__xss.chamadas = [];
  doc._executar = (codigo) => { try { vm.runInContext(codigo, contexto); } catch (e) { /* o ataque pode falhar; só importa se rodou */ } };

  // ---- a página de verdade ----
  carregarHtml(doc, aplicarMutacoes("index.html", lerApp("index.html")));
  const errosDaPagina = doc._erros.slice();
  doc._erros.length = 0;

  ev("var window = globalThis; var self = globalThis;", "janela");
  ev(`let authToken = null, authNome = null, authMatricula = null, authNivel = null, authGeral = false, authPermissoes = [], ultimaRecusa = null, ebdTurmasProfessor = [];
function marcarSessaoGeralNaPagina() { if (document.body) document.body.classList.toggle("sessao-geral", authGeral); }
function mostrarTelaPainelInicial() { window.__telaInicial = (window.__telaInicial || 0) + 1; }
function mostrarCriarPin() {} function mostrarModalTermos() {}
function avisarResultado(data) { mostrarToast((data && data.mensagem) || "", data && data.sucesso ? "sucesso" : "erro"); }
async function confirmarFatorAgora() { window.__fatorPedidos = (window.__fatorPedidos || 0) + 1; return window.__fatorConfirmar ? await window.__fatorConfirmar() : false; }
function carregarPainelInicial() { window.__painelInicial = (window.__painelInicial || 0) + 1; }`, "prelude");
  ev(aplicarMutacoes("script.js", extrair("script.js", [
    "API_BASE", "mostrarToast", "fecharModal", "confirmarAcao", "escaparHtmlEbd", "argsAttr", "urlSegura", "formatarDataEbd", "mensagemPadraoDaRecusa", "fetchProtegido", "jsonDaTela",
    "sessaoDeLiderancaNaTela", "limparSessao", "NOMES_ABAS", "ABA_PERMISSOES_ALT", "permissoesDaAba", "ABAS_SO_DO_GERAL", "temPermissaoDaAba", "MODULOS",
    "SUB_ABAS_MEUPAINEL", "TITULOS_SUB_MEUPAINEL", "mostrarSubAbaMeupainel", "AJUDA_POR_ABA", "chaveAjudaAtual", "moduloAtual", "subAbaMeupainelAtual"
  ])), "script.js(extraido)");
  ev(extrair("modulos/calendario.js", ["calIso", "calSomarDias", "calHojeBrasilia", "calParaInstante", "calData", "calDataHora"]), "calendario.js(extraido)");
  ev(aplicarMutacoes("modulos/meus-dados.js", extrair("modulos/meus-dados.js", ["capitalize", "mostrarAbaSecretaria", "TITULOS_MODULOS"])), "meus-dados.js(extraido)");
  ev(lerApp("eventos.js"), "eventos.js");
  ev("registrarAcoes({ fecharModal, mostrarSubAbaMeupainel, mostrarTelaPainelInicial, mostrarAbaSecretaria });", "acoes-do-script");
  if (!semModulo) {
    ev(aplicarMutacoes("modulos/enquetes.js", lerApp("modulos/enquetes.js")), "enquetes.js");
    ev(aplicarMutacoes("modulos/identidade-visual.js", lerApp("modulos/identidade-visual.js")), "identidade-visual.js");
  }

  // ---- utilidades de teste ----
  const e = (id) => doc.getElementById(id);
  const ocioso = async () => { for (let i = 0; i < 60; i++) await new Promise(r => setImmediate(r)); };
  // sessão: token do servidor imitado; pin = sessão de membro (sem nível e sem permissões)
  const sessao = ({ matricula, token, pin = false, nivel = "GLOBAL", permissoes = ["identidade_visual"], geral = true }) => {
    ev(`authToken = ${JSON.stringify(token)}; authMatricula = ${JSON.stringify(String(matricula))}; authNivel = ${pin ? "null" : JSON.stringify(nivel)}; authPermissoes = ${JSON.stringify(pin ? [] : permissoes)}; authGeral = ${pin ? false : !!geral};`, "sessao");
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
  return { doc, ctx, api, ev, e, g, ocioso, sessao, retem, toasts, responderModal, limparRegistro, errosDaPagina, resposta, intervalos, temporizadores, dispararTemporizador, gravacoes, consoleDaTela };
}

module.exports = { criarAmbiente, extrair, lerApp, arquivo, pngReal, jpegReal };
