// navegador.js — a tela da v7.8 no Edge de verdade (headless), com a CSP final do projeto, a 390 px e a 1280 px: sem rolagem lateral, sem violação de CSP, nada executado, alvos de toque de pelo menos
// 40 px e contraste de pelo menos 4,5:1 nas cores próprias da tela. O front vem do disco (app/), servido com os cabeçalhos de app/staticwebapp.config.json; /api/* é respondido aqui com os
// formatos reais do servidor (fixtures.js) e texto de ataque (<img onerror=...>) em todos os campos. Nada chega à API de verdade.
// Percorre: o painel público "Preciso de ajuda" (sem login, enviar, 429), Meu Painel → Proteção de crianças (PIN: escolher o nível, o roteiro da escuta, confirmar e enviar), e a aba da liderança
// (fila com relógio, ficha, relato, os cinco formulários, padrões, Comitê, relatório anual e a impressão).
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.resolve(__dirname, "../csp-e2e/node_modules/puppeteer-core"));
const F = require("./fixtures");
const { ATAQUE, pm, HORA } = F;

const APP = path.resolve(__dirname, "../../app");
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(p => fs.existsSync(p));
const CONFIG = JSON.parse(fs.readFileSync(path.join(APP, "staticwebapp.config.json"), "utf8"));
// a política final do projeto, igual à de produção (só sem "upgrade-insecure-requests", que não vale para http://127.0.0.1)
const CSP = CONFIG.globalHeaders["Content-Security-Policy"].replace(/;?\s*upgrade-insecure-requests/, "");
const OUT = path.join(require("os").tmpdir(), "front-protecao-img");       // as capturas não são versionadas
fs.mkdirSync(OUT, { recursive: true });
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

// ---------------------------------------------------------------- a API simulada
const TEXTO_CRIANCA = "Meu tio mexe comigo quando ninguém vê. Eu tenho medo de contar para a minha mãe.";
const RELATO_ATAQUE = `Ela disse "'><img src=x onerror="window.__xss('relato')"><svg onload=window.__xss('relato')>[relato] e depois ficou quieta. ${"palavra".repeat(40)}`;
const estado = { ajuda: "ok", registros: 0, ajudas: 0 };
const agoraDe = () => new Date();
const em = (h, m = 0) => new Date(Date.now() + (h * 60 + m) * 60000).toISOString();
function linhas() {
  return [
    { id: 4, protocolo: ATAQUE("prot4"), origem: "CANAL_AJUDA", congregacaoNome: ATAQUE("cong4"), prazoEm: em(-2) },
    { id: 1, protocolo: "PRO-2026-0001 com um número de protocolo bem comprido para esticar o cartão", congregacaoNome: "Congregação Norte com um nome bem comprido para esticar o cartão", prazoEm: em(3, 20) },
    { id: 2, prazoEm: em(8) },
    { id: 5, nComunicacoes: 1, nComComprovante: 0, prazoEm: em(5), registradoEm: em(-5) },
    { id: 9, nSemDecisao: 1, nComunicacoes: 1, nComComprovante: 1, prazoEm: em(2), registradoEm: em(-9) },
    { id: 7, nivel: "QUEBRA_POLITICA", exigeComunicacao: false, registradoEm: em(-7) }
  ];
}
function fichaDe(id) {
  const agora = agoraDe();
  const comum = { descricao: ATAQUE("desc") + " " + "fato ".repeat(60), onde: ATAQUE("onde"), equipeNome: ATAQUE("equipe"), contatoCanal: ATAQUE("contato"), relatadoPor: "PROPRIA_CRIANCA", relato: { registrado: true, adendos: 1 }, leituras: [{ nome: ATAQUE("leitor") }] };
  let d;
  if (id === 4) d = F.detalhe(Object.assign({ id: 4, origem: "CANAL_AJUDA", prazoEm: em(-2), protocolo: ATAQUE("prot4"), congregacaoNome: ATAQUE("cong4"), envolvidos: [{ envolvidoId: 7, membroId: 41, nome: ATAQUE("env") }, { envolvidoId: 8, nome: ATAQUE("envNome"), membroId: null }], comunicacoes: [], nAnexos: 0, possiveisMembros: [{ envolvidoId: 8, membros: [{ membroId: 41, nome: ATAQUE("candidato"), congregacaoNome: ATAQUE("candCong") }, { membroId: 52, nome: "Outra pessoa com o mesmo nome e um sobrenome bem comprido", congregacaoNome: "Congregação Norte" }] }] }, comum), agora);
  else if (id === 2) d = F.detalhe(Object.assign({ id: 2, origem: "CANAL_AJUDA", prazoEm: em(8), protocolo: ATAQUE("prot2"), congregacaoNome: ATAQUE("cong2"), envolvidos: [], comunicacoes: [], nAnexos: 0, registradoPor: { nome: ATAQUE("registrador") } }, comum), agora);
  else if (id === 7) d = F.detalhe({ id: 7, nivel: "QUEBRA_POLITICA", exigeComunicacao: false, protocolo: "PRO-2026-0007", relato: { registrado: false, adendos: 0 }, envolvidos: [], reclassificacoes: [{ de: "QUASE_ACIDENTE", para: "QUEBRA_POLITICA", motivo: ATAQUE("motivo"), porNome: ATAQUE("porRec") }] }, agora);
  else d = F.detalhe(Object.assign({ id, prazoEm: em(3, 20), protocolo: ATAQUE("prot"), congregacaoNome: ATAQUE("cong"), envolvidos: [{ envolvidoId: 7, membroId: 41, nome: ATAQUE("env"), ultimaDecisao: "MANTIDO_AFASTADO", nDecisoes: 1 }], comunicacoes: [{ protocoloExterno: ATAQUE("protExt"), referenciaArquivo: ATAQUE("refArq"), observacao: ATAQUE("obsCom"), registradoPorNome: ATAQUE("porCom"), foraDoPrazo: true }], nAnexos: 2, decisoes: [{ envolvidoId: 7, decisao: "MANTIDO_AFASTADO", observacao: ATAQUE("obsDec"), decididaPorNome: ATAQUE("porDec") }] }, comum), agora);
  d.incidente.relatadoPorRotulo = ATAQUE("relatadoPorRotulo");
  return d;
}
function api(metodo, caminho, consulta, corpo, token) {
  const geral = token === "tok-geral-simulado";
  const ok = (c, status = 200) => ({ status, corpo: c });
  const chave = `${metodo} ${caminho}`;
  if (chave === "POST membro/entrar") return ok(String(corpo.matricula) === "20" && corpo.pin === "1234" ? { sucesso: true, token: "tok-membro-simulado", nome: "Membro Teste", permissoes: [], nivel: null, escopo: null, geral: false, termosPendentes: [] } : { sucesso: false, mensagem: "Matrícula ou PIN incorretos." });
  if (chave === "POST auth/login") return ok(String(corpo.matricula) === "5" && corpo.senha === "senha-simulada-geral" ? { sucesso: true, token: "tok-geral-simulado", nome: "Líder Geral Teste", permissoes: ["protecao_menores"], nivel: "GLOBAL", escopo: "TODAS", geral: true, termosPendentes: [] } : { sucesso: false, mensagem: "Matrícula ou senha incorretos." });
  // ---- público (sem login)
  if (chave === "GET congregacoes-publico") return ok([{ congregacaoId: 2, nome: ATAQUE("congPub"), ativa: true }, { congregacaoId: 3, nome: "Congregação Norte com um nome bem comprido para esticar o seletor" }]);
  if (chave === "POST protecao-ajuda") {
    estado.ajudas++;
    if (token) return ok({ sucesso: false, mensagem: "O canal público recebeu um token: isso não pode acontecer." }, 400);
    if (estado.ajuda === "429") return ok(F.falhaDeAjuda(`Você já enviou mensagens demais por agora. ${pm.CONTATOS_DE_AJUDA[0].descricao} ${ATAQUE("msg429")}`), 429);
    const c = F.confirmacaoDeAjuda(ATAQUE("protocolo")); c.mensagem = `${pm.textoConfirmacaoDeAjuda()} ${ATAQUE("msgOk")}`;
    return ok(c, 201);
  }
  // ---- proteção
  const papeis = geral ? { gestao: true, geral: true } : { gestao: false, geral: false };
  if (chave === "GET protecao-menores/catalogos") return ok(F.catalogosComAtaque(papeis));
  if (chave === "GET protecao-menores/meus") return ok(F.meus([{ protocolo: ATAQUE("meuProt"), nivelRotulo: ATAQUE("meuNivel"), dataOcorrencia: "2026-10-01", situacao: "Em andamento", registradoEm: em(-24) }]));
  if (chave === "POST protecao-menores/registrar") { estado.registros++; const exige = corpo.nivel === "ALEGACAO"; return ok({ sucesso: true, incidenteId: 77, protocolo: ATAQUE("protoNovo"), prazoEm: exige ? em(24) : null, exigeComunicacao: exige, escalasDesmarcadas: exige && corpo.envolvidoMembroId ? 2 : null, avisados: 3, mensagem: `Registrado. A liderança foi avisada. ${ATAQUE("msgReg")}` }, 201); }
  if (chave === "GET protecao-menores/incidentes") return ok(F.filaDe(linhas().filter(l => !consulta.status || (consulta.status === "ENCERRADO") === (l.status === "ENCERRADO")), agoraDe()));
  if (chave === "GET protecao-menores/incidente") return ok(fichaDe(Number(consulta.incidenteId)));
  if (chave === "POST protecao-menores/relato") return ok({ sucesso: true, relato: { texto: RELATO_ATAQUE, registradoEm: em(-3) }, adendos: [{ texto: `Depois contou mais. ${RELATO_ATAQUE}`, registradoEm: em(-1) }] });
  if (chave === "POST protecao-menores/comunicacao" || chave === "POST protecao-menores/adendo" || chave === "POST protecao-menores/reclassificar" || chave === "POST protecao-menores/cautelar-decidir" || chave === "POST protecao-menores/encerrar") return ok({ sucesso: true, mensagem: "Registrado." }, 201);
  if (chave === "GET protecao-menores/padroes") {
    const eventos = [1, 2, 3].map(i => ({ incidenteId: 10 + i, nivel: "QUEBRA_POLITICA", equipeId: 3, envolvidoMembroId: 41, data: F.hoje }));
    return ok(F.padroes(eventos, { "EQUIPE:3": ATAQUE("equipePad") + " com um nome de equipe bem comprido para quebrar linha", "PESSOA:41": ATAQUE("pessoaPad") }));
  }
  if (chave === "GET protecao-menores/comite") return ok(F.comite([{ membroId: 1, nome: ATAQUE("comPastor"), cargoMinisterial: "PASTOR" }, { membroId: 2, nome: ATAQUE("comLeigo"), cargoMinisterial: null }]));
  if (chave === "GET protecao-menores/relatorio-anual") { const r = F.relatorio(Number(consulta.ano) || 2026); r.relatorio.porCongregacao[0].congregacaoNome = ATAQUE("congRel"); r.relatorio.habilitacaoPorCongregacao[0].congregacaoNome = ATAQUE("congHab"); return ok(r); }
  if (chave === "GET anexos") return ok([{ anexoId: 5, nomeArquivo: ATAQUE("anexoNome") + " comprovante-com-um-nome-de-arquivo-bem-comprido.pdf", mimeType: "application/pdf", criadoEm: em(-1), urlAssinada: "https://exemplo.org/arquivo.pdf" }]);
  // ---- o que o painel carrega depois do login
  if (/^GET membros\/\d+\/frequencia$/.test(chave)) return ok({ sucesso: true, membro: { membroId: 20, nome: "Membro Teste", funcao: "Membro", congregacao: "Sede", status: "ATIVO" }, assentos: [], resumo: { totalReunioes: 0, totalPresencas: 0, totalFaltas: 0, totalJustificadas: 0, percentualPresenca: null }, historico: [] });
  if (/^GET lgpd\/consentimento\/\d+$/.test(chave)) return ok({ sucesso: true, consentimentos: [] });
  if (/^GET lgpd\/solicitacoes\/\d+$/.test(chave)) return ok({ sucesso: true, solicitacoes: [] });
  if (chave === "GET painel-inicial") return ok({ sucesso: true, blocos: [] });
  if (chave === "GET notificacoes/contagem") return ok({ sucesso: true, total: 0, naoLidas: 0 });
  if (chave === "GET minha-foto/20") return ok({ sucesso: true, fotoUrl: null, consentimentoConcedido: false, menorDeIdade: false });
  if (metodo === "POST") return ok({ sucesso: true, mensagem: "Registrado." });
  return ok({ sucesso: true });
}

function servidor() {
  const chamadas = [];
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const base = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": CSP };
    if (url.pathname.startsWith("/api/")) {
      let bruto = ""; req.on("data", c => { bruto += c; });
      req.on("end", () => {
        let corpo = {}; try { corpo = JSON.parse(bruto || "{}"); } catch (_) {}
        const r = api(req.method, url.pathname.replace(/^\/api\//, ""), Object.fromEntries(url.searchParams), corpo, req.headers["x-auth-token"]);
        chamadas.push(`${req.method} ${url.pathname}${url.search}${req.headers["x-auth-token"] ? " [com token]" : " [sem token]"}`);
        res.writeHead(r.status, Object.assign({ "Content-Type": "application/json; charset=utf-8" }, base)); res.end(JSON.stringify(r.corpo));
      });
      return;
    }
    let rel = decodeURIComponent(url.pathname); if (rel === "/") rel = "/index.html";
    const arq = path.normalize(path.join(APP, rel));
    if (!arq.startsWith(path.normalize(APP))) { res.writeHead(403, base); res.end(); return; }
    fs.readFile(arq, (err, dados) => {
      if (err) { res.writeHead(404, base); res.end("404"); return; }
      res.writeHead(200, Object.assign({ "Content-Type": TIPOS[path.extname(arq).toLowerCase()] || "application/octet-stream" }, base)); res.end(dados);
    });
  });
  return new Promise(ok => srv.listen(0, "127.0.0.1", () => ok({ srv, url: `http://127.0.0.1:${srv.address().port}`, chamadas })));
}

// ---------------------------------------------------------------- o que se mede dentro da página
const medir = () => {
  const de = document.documentElement, W = de.clientWidth;
  const vis = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const rolante = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll") return p; } return null; };
  const ofensores = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el)) continue;
    if (el.closest("#modalOverlay") === null && el.closest("#sidebar")) continue;
    const r = el.getBoundingClientRect();
    if (r.right > W + 1) { const p = rolante(el); if (!p || p.getBoundingClientRect().right > W + 1) ofensores.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} (${Math.round(r.right)}>${W})`); }
  }
  const lateral = de.scrollWidth > W || document.body.scrollWidth > W;
  // alvos de toque: botões, campos, links de telefone e rótulos dos níveis das telas desta versão, com pelo menos 40 px de altura
  const alvos = [];
  const raizes = ["#prtTelaAjuda", "#subMeupainelProtecao", "#abaProtecao", "#modalCaixa"].map(s => document.querySelector(s)).filter(r => r && vis(r));
  for (const raiz of raizes) for (const el of raiz.querySelectorAll("button, select, input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea, a.prt-tel, label.prt-nivel")) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 39.5) alvos.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} "${(el.textContent || el.value || "").trim().slice(0, 24)}" h=${Math.round(r.height)}`);
  }
  const largos = [];
  if (lateral) for (const el of document.querySelectorAll("body *")) { if (!vis(el) || rolante(el) || getComputedStyle(el).position === "fixed") continue; const r = el.getBoundingClientRect(); if (r.right > W + 1 || r.width > W + 1) largos.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className ? "." + el.className.split(" ")[0] : ""} w=${Math.round(r.width)} r=${Math.round(r.right)}`); }
  return { rolagemLateral: lateral, scrollW: de.scrollWidth, clientW: W, ofensores: ofensores.slice(0, 6), alvosPequenos: alvos.slice(0, 6), largos: largos.slice(0, 6) };
};
// contraste (WCAG) das cores próprias da tela: o fundo é o do próprio elemento ou do primeiro ancestral com fundo
const contraste = (seletores) => {
  const rgb = (s) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(s); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const fundoDe = (el) => { for (let p = el; p; p = p.parentElement) { const c = rgb(getComputedStyle(p).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const ruins = [];
  for (const sel of seletores) for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
    const cor = rgb(getComputedStyle(el).color), fundo = fundoDe(el); if (!cor) continue;
    const l1 = lum(cor), l2 = lum(fundo), razao = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const px = parseFloat(getComputedStyle(el).fontSize), negrito = parseInt(getComputedStyle(el).fontWeight, 10) >= 700;
    const minimo = px >= 24 || (px >= 18.66 && negrito) ? 3 : 4.5;
    if (razao < minimo) ruins.push(`${sel}: ${razao.toFixed(2)} < ${minimo} ("${(el.textContent || "").trim().slice(0, 20)}")`);
  }
  return ruins;
};
const SELETORES_CONTRASTE = [".prt-btn-ajuda", ".prt-btn-ajuda small", ".prt-tel", ".prt-tel-desc", ".prt-acolhe", ".prt-ajuda-aviso", ".prt-ajuda-ok", ".prt-ajuda-ok h4", ".prt-nao-faca", ".prt-roteiro", ".prt-nivel-desc",
  ".prt-relogio", ".prt-contador-rotulo", ".prt-contador-valor", ".prt-texto", ".prt-lista", ".prt-item", ".prt-relato", ".cnl-aviso-senha", ".prt-selo", ".cal-pilula", ".prt-tabela th", ".prt-tabela td"];

async function rodarViewport(nav, base, nome, viewport) {
  const relatorio = { nome, problemas: [], medidas: [], csp: [], erros: [], xss: 0, relogio: "" };
  const ctx = await nav.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  page.setDefaultTimeout(20000);
  await page.evaluateOnNewDocument(() => {
    try { delete Navigator.prototype.serviceWorker; } catch (_) {}
    window.__xss = function (c) { (window.__xssLista = window.__xssLista || []).push(String(c)); };
    window.__cspLista = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__cspLista.push(`${e.violatedDirective} ${e.blockedURI} ${String(e.sourceFile || "").slice(-40)}:${e.lineNumber}`));
  });
  page.on("console", (m) => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) relatorio.csp.push(t.slice(0, 200)); else if (m.type() === "error" && !/Failed to load resource|ERR_NAME_NOT_RESOLVED|ERR_FAILED|status of 4\d\d|status of 5\d\d/.test(t)) relatorio.erros.push(t.slice(0, 200)); });
  page.on("pageerror", (e) => relatorio.erros.push("pageerror: " + String(e.stack || e.message).slice(0, 400)));
  page.on("dialog", (d) => { relatorio.problemas.push("diálogo nativo: " + d.message()); d.dismiss().catch(() => {}); });

  const medida = async (rotulo) => {
    const m = await page.evaluate(medir); relatorio.medidas.push({ rotulo, ...m });
    if (m.rolagemLateral || m.ofensores.length) relatorio.problemas.push(`${rotulo}: rolagem lateral=${m.rolagemLateral} (scrollW ${m.scrollW} > ${m.clientW}) ofensores=${m.ofensores.join("; ")} largos=${m.largos.join(" | ")}`);
    if (m.alvosPequenos.length) relatorio.problemas.push(`${rotulo}: alvo de toque com menos de 40 px: ${m.alvosPequenos.join("; ")}`);
    const ruins = await page.evaluate(contraste, SELETORES_CONTRASTE);
    if (ruins.length) relatorio.problemas.push(`${rotulo}: contraste baixo: ${ruins.slice(0, 4).join("; ")}`);
  };
  const foto = async (seletor, arq) => { const h = await page.$(seletor); if (h) { try { await h.screenshot({ path: path.join(OUT, `${nome}-${arq}.png`), captureBeyondViewport: true }); } catch (e) { relatorio.problemas.push(`captura ${arq}: ${e.message.slice(0, 80)}`); } } };
  const calmo = async () => { await new Promise(r => setTimeout(r, 450)); };
  const clicar = async (fn, arg) => { const ok = await page.evaluate(fn, arg); if (!ok) relatorio.problemas.push(`não achei o controle: ${typeof arg === "string" ? arg : JSON.stringify(arg)}`); await calmo(); return ok; };
  const porTexto = (seletor, texto, escopo) => page.evaluate((s, t, esc) => { const raiz = esc ? document.querySelector(esc) : document; if (!raiz) return false; const el = [...raiz.querySelectorAll(s)].find(x => x.textContent.includes(t) && x.getClientRects().length); if (!el) return false; el.click(); return true; }, seletor, texto, escopo);
  const clicarTexto = async (seletor, texto, escopo) => { const ok = await porTexto(seletor, texto, escopo); if (!ok) relatorio.problemas.push(`não achei "${texto}" em ${escopo || "a página"}`); await calmo(); return ok; };
  const preencher = (id, valor) => page.evaluate((i, v) => { const el = document.getElementById(i); if (!el) return false; el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; }, id, valor);
  const abrirMenuCelular = async () => { if (viewport.width <= 640) await page.evaluate(() => { const b = document.getElementById("btnMenuCelular"); if (b && b.offsetParent !== null) b.click(); }); };
  const entrar = async (matricula, segredo) => {
    await page.evaluate(() => { try { sessionStorage.clear(); } catch (_) {} });
    await page.goto(base + "/", { waitUntil: "load" });
    await clicar(() => { const a = [...document.querySelectorAll("a")].find(x => /Acessar meu Painel/.test(x.textContent)); if (!a) return false; a.click(); return true; });
    await page.evaluate((m, s) => { document.getElementById("matriculaPainel").value = m; document.getElementById("senhaPainel").value = s; document.getElementById("matriculaPainel").closest("form").requestSubmit(); }, matricula, segredo);
    await page.waitForFunction(() => { const c = document.getElementById("cxPainelConteudo"); return c && c.style.display !== "none"; }, { timeout: 15000 }).catch(() => relatorio.problemas.push("o painel não abriu depois do login"));
    await calmo();
  };
  const esperar = (fn, rotulo, arg) => page.waitForFunction(fn, { timeout: 10000 }, arg).catch(() => relatorio.problemas.push(`não apareceu: ${rotulo}`));

  try {
    // ================= PÚBLICO: Preciso de ajuda (sem login)
    await page.goto(base + "/", { waitUntil: "load" });
    await medida("Entrada / botão Preciso de ajuda");
    await foto("#telaCheckin", "entrada");
    await clicarTexto("button", "Preciso de ajuda", "#telaCheckin");
    await esperar(() => document.getElementById("prtAjudaPubTexto"), "o formulário público");
    await esperar(() => document.getElementById("prtAjudaPubCong") && document.getElementById("prtAjudaPubCong").options.length > 2, "a lista de igrejas públicas");
    await medida("Público / abertura"); await foto("#prtTelaAjuda", "publico-abertura");
    const tel = await page.evaluate(() => [...document.querySelectorAll("#prtTelaAjuda a[href^='tel:']")].filter(a => a.getClientRects().length).map(a => a.getAttribute("href")));
    if (!tel.includes("tel:100") || !tel.includes("tel:190")) relatorio.problemas.push(`os telefones 100 e 190 devem estar visíveis: ${tel.join(",")}`);
    // erro de preenchimento (sem culpa): mensagem na tela, nada enviado
    await page.evaluate(() => document.getElementById("prtAjudaPubBotao").click()); await calmo();
    await medida("Público / texto vazio");
    // enviar
    await preencher("prtAjudaPubTexto", TEXTO_CRIANCA); await preencher("prtAjudaPubQuem", "CRIANCA_ADOLESCENTE"); await preencher("prtAjudaPubContato", "WhatsApp 11 99999-0000"); await preencher("prtAjudaPubCong", "2");
    await medida("Público / preenchido");
    await page.evaluate(() => document.getElementById("prtAjudaPubBotao").click());
    await esperar(() => document.getElementById("prtAjudaPubResultado").classList.contains("prt-ajuda-ok"), "a confirmação do envio");
    await calmo(); await medida("Público / enviado"); await foto("#prtTelaAjuda", "publico-enviado");
    const depois = await page.evaluate((t) => ({ campo: document.getElementById("prtAjudaPubTexto").value, local: JSON.stringify(Object.assign({}, localStorage)).includes(t.slice(0, 20)), sessao: JSON.stringify(Object.assign({}, sessionStorage)).includes(t.slice(0, 20)), naTela: document.body.innerText.includes(t.slice(0, 20)) }), TEXTO_CRIANCA);
    if (depois.campo !== "" || depois.local || depois.sessao || depois.naTela) relatorio.problemas.push(`o texto da criança não pode ficar no campo, na tela nem no armazenamento: ${JSON.stringify(depois)}`);
    // o servidor limita (429): mensagem e telefones, o texto continua no campo
    estado.ajuda = "429";
    await preencher("prtAjudaPubTexto", TEXTO_CRIANCA);
    await page.evaluate(() => document.getElementById("prtAjudaPubBotao").click()); await esperar(() => /demais/.test(document.getElementById("prtAjudaPubResultado").textContent), "a mensagem do limite"); await calmo();
    await medida("Público / limite (429)"); await foto("#prtTelaAjuda", "publico-429");
    const apos429 = await page.evaluate(() => ({ campo: document.getElementById("prtAjudaPubTexto").value.length, tels: [...document.querySelectorAll("#prtAjudaPubResultado a[href^='tel:']")].length }));
    if (apos429.campo === 0 || apos429.tels < 2) relatorio.problemas.push(`no 429 o texto devia ficar e os telefones aparecer: ${JSON.stringify(apos429)}`);
    estado.ajuda = "ok";
    await clicarTexto("a", "Voltar", "#prtTelaAjuda");
    const saiu = await page.evaluate(() => ({ campo: document.getElementById("prtAjudaPubForm").innerHTML === "", entrada: getComputedStyle(document.getElementById("telaCheckin")).display }));
    if (!saiu.campo || saiu.entrada === "none") relatorio.problemas.push(`ao voltar, o formulário devia ser desmontado e a entrada reaparecer: ${JSON.stringify(saiu)}`);

    // ================= MEMBRO por PIN: Meu Painel → Proteção de crianças
    await entrar("20", "1234");
    await abrirMenuCelular();
    await clicar(() => { const b = document.getElementById("btnSubMeupainelProtecao"); if (!b) return false; b.click(); return true; });
    await esperar(() => document.querySelectorAll("#prtRegNiveis label").length === 3, "os níveis do incidente");
    await esperar(() => document.getElementById("prtMeusLista").children.length > 0, "Meus registros");
    await calmo(); await medida("Meu Painel / abertura"); await foto("#subMeupainelProtecao", "meupainel-abertura");
    await clicar(() => { const l = document.querySelectorAll("#prtRegNiveis label")[2]; if (!l) return false; l.click(); return true; });
    await medida("Meu Painel / suspeita escolhida (roteiro da escuta)"); await foto("#prtRegCx", "meupainel-suspeita");
    await preencher("prtRegCong", "2"); await preencher("prtRegDescricao", "A criança contou algo sobre um adulto da igreja."); await preencher("prtRegEnvMatricula", "41");
    await preencher("prtRegQuem", "PROPRIA_CRIANCA"); await preencher("prtRegRelato", "Ela disse que o tio mexe com ela quando ninguém vê.");
    await clicarTexto("button", "Registrar o incidente", "#subMeupainelProtecao");
    await esperar(() => !document.getElementById("modalOverlay").classList.contains("escondido"), "a confirmação da suspeita");
    await medida("Meu Painel / confirmação da suspeita"); await foto("#modalCaixa", "meupainel-confirmacao");
    await page.evaluate(() => { const b = document.getElementById("modalConfirmar"); if (b) b.click(); });
    await esperar(() => document.getElementById("prtRegResposta").children.length > 0, "a resposta do registro"); await calmo();
    await medida("Meu Painel / registrado"); await foto("#subMeupainelProtecao", "meupainel-registrado");
    const relatoSaiu = await page.evaluate(() => document.getElementById("prtRegRelato").value === "" && document.getElementById("prtRegDescricao").value === "");
    if (!relatoSaiu) relatorio.problemas.push("depois de enviar a suspeita, o relato devia sair do campo");

    // ================= LIDERANÇA GERAL: Habilitação → Proteção de Crianças
    await entrar("5", "senha-simulada-geral");
    await clicar(() => { const c = [...document.querySelectorAll(".card-modulo")].find(x => x.textContent.includes("Habilitação de Voluntários")); if (!c) return false; c.click(); return true; });
    await esperar(() => document.querySelectorAll("#prtListaIncidentes .cal-cartao").length >= 6, "a fila de incidentes");
    await calmo(); await medida("Fila / abertura"); await foto("#abaProtecao", "fila");
    relatorio.relogio = await page.evaluate(() => { const c = document.querySelector("#prtListaIncidentes .prt-relogio"); return c ? c.textContent : ""; });
    if (!/vencido/.test(relatorio.relogio)) relatorio.problemas.push(`o primeiro cartão devia ser o vencido: "${relatorio.relogio}"`);
    // o intervalo de verdade (setInterval de 30 s): só no desktop, para não alongar a prova — o cartão de 3 h 20 min muda de minuto sozinho
    if (viewport.width > 640) {
      const antes = await page.evaluate(() => { const els = [...document.querySelectorAll("#prtListaIncidentes .prt-relogio")]; return els.map(e => e.textContent); });
      await new Promise(r => setTimeout(r, 62000));
      const depois2 = await page.evaluate(() => { const els = [...document.querySelectorAll("#prtListaIncidentes .prt-relogio")]; return els.map(e => e.textContent); });
      if (JSON.stringify(antes) === JSON.stringify(depois2)) relatorio.problemas.push(`o relógio devia andar sozinho em 60 s: ${antes.join(" | ")}`);
    }
    // a ficha do vencido (com envolvidos, sem comunicação)
    await clicarTexto("button", "Abrir", "#prtListaIncidentes");
    await esperar(() => document.getElementById("prtDetalheConteudo").textContent.length > 200, "a ficha do incidente"); await calmo();
    await medida("Ficha / aberta"); await foto("#prtDetalheCx", "ficha");
    // relato: confirmação, leitura, caixa
    await clicarTexto("button", "Ler o relato", "#prtDetalheConteudo");
    await esperar(() => !document.getElementById("modalOverlay").classList.contains("escondido"), "a confirmação da leitura do relato");
    await medida("Ficha / confirmação do relato");
    await page.evaluate(() => { const b = document.getElementById("modalConfirmar"); if (b) b.click(); });
    await esperar(() => document.getElementById("prtRelatoCx") && getComputedStyle(document.getElementById("prtRelatoCx")).display !== "none" && document.getElementById("prtRelatoCorpo").textContent.length > 20, "o relato na caixa"); await calmo();
    await medida("Ficha / relato aberto"); await foto("#prtRelatoCx", "relato");
    const relatoOk = await page.evaluate(() => ({ imgs: document.querySelectorAll("#prtRelatoCorpo img, #prtRelatoCorpo svg").length, texto: document.getElementById("prtRelatoCorpo").textContent.includes("[relato]") }));
    if (relatoOk.imgs !== 0 || !relatoOk.texto) relatorio.problemas.push(`o relato devia aparecer como texto, sem elementos nascidos dele: ${JSON.stringify(relatoOk)}`);
    // os formulários dos atos
    for (const [botao, rotulo] of [["Registrar a comunicação ao órgão", "comunicação"], ["Adendo", "adendo"], ["Decidir o afastamento", "decidir"], ["Vincular a uma pessoa do cadastro", "vincular"], ["Encerrar o caso", "encerrar"]]) {
      await clicarTexto("#prtDetalheConteudo .prt-acoes-detalhe button, #prtDetalheConteudo button", botao, "#prtDetalheConteudo");
      await medida(`Ficha / formulário ${rotulo}`); await foto("#prtFormAcao", `form-${rotulo}`);
    }
    await clicarTexto("button", "Fechar e apagar", "#prtRelatoCx");
    const apagou = await page.evaluate(() => document.getElementById("prtRelatoCorpo").textContent === "" && !document.body.innerText.includes("[relato]"));
    if (!apagou) relatorio.problemas.push("fechar a caixa devia apagar o relato da tela");
    await clicarTexto("button", "Voltar à lista", "#prtDetalheCx");
    // o pedido do canal de ajuda sem pessoa do cadastro: arquivar como "sem conteúdo de proteção" (aviso do risco) e o modal de anexos (comprovante = prova, sem Excluir)
    await page.evaluate(() => { const c = [...document.querySelectorAll("#prtListaIncidentes .cal-cartao")].find(x => x.textContent.includes("PRO-2026-0002")); const b = c && [...c.querySelectorAll("button")].find(x => /Abrir/.test(x.textContent)); if (b) b.click(); });
    await calmo();
    await clicarTexto("button", "Encerrar o caso", "#prtDetalheConteudo");
    await preencher("prtFeResultado", "SEM_CONTEUDO_DE_PROTECAO");
    await medida("Ficha / arquivar sem conteúdo de proteção"); await foto("#prtFormAcao", "form-arquivar");
    const aviso = await page.evaluate(() => { const a = document.getElementById("prtFeAvisoSemConteudo"); return a && getComputedStyle(a).display !== "none" && /NÃO arquive/.test(a.textContent); });
    if (!aviso) relatorio.problemas.push("ao escolher 'sem conteúdo de proteção' o aviso do risco devia aparecer");
    await clicarTexto("button", "Anexar comprovante", "#prtDetalheConteudo");
    await esperar(() => document.getElementById("listaAnexosModal") && document.getElementById("listaAnexosModal").textContent.includes("prova"), "o anexo (prova) no modal");
    await medida("Ficha / anexos (prova)"); await foto("#modalCaixa", "anexos");
    const semExcluir = await page.evaluate(() => ![...document.querySelectorAll("#modalCaixa button")].some(b => /Excluir/.test(b.textContent)) && /Não coloque o nome da criança no nome do arquivo/.test(document.getElementById("modalCaixa").textContent));
    if (!semExcluir) relatorio.problemas.push("o modal de anexos do incidente devia avisar do nome do arquivo e não oferecer 'Excluir' (é prova)");
    await clicarTexto("button", "Fechar", "#modalCaixa");
    await clicarTexto("button", "Voltar à lista", "#prtDetalheCx");
    // quebra de política: reclassificar
    await page.evaluate(() => { const cartoes = [...document.querySelectorAll("#prtListaIncidentes .cal-cartao")]; const c = cartoes.find(x => /Quebra de política/.test(x.textContent)); const b = c && [...c.querySelectorAll("button")].find(x => /Abrir/.test(x.textContent)); if (b) b.click(); });
    await calmo();
    await clicarTexto("button", "Reclassificar", "#prtDetalheConteudo");
    await preencher("prtFrNivel", "ALEGACAO");
    await medida("Ficha / reclassificar para suspeita"); await foto("#prtFormAcao", "form-reclassificar");
    await clicarTexto("button", "Voltar à lista", "#prtDetalheCx");
    // padrões, Comitê, relatório
    for (const [botao, rotulo, espera] of [["btnPrtSecaoPadroes", "padroes", () => document.querySelectorAll("#prtPadroesLista .cal-cartao").length > 0], ["btnPrtSecaoComite", "comite", () => document.getElementById("prtComiteLista").textContent.length > 30], ["btnPrtSecaoRelatorio", "relatorio", () => document.querySelectorAll("#prtRelImprimivel tr").length > 3]]) {
      await clicar((id) => { const b = document.getElementById(id); if (!b || b.style.display === "none") return false; b.click(); return true; }, botao);
      await esperar(espera, rotulo); await calmo();
      await medida(`Seção ${rotulo}`); await foto("#abaProtecao", `secao-${rotulo}`);
    }
    // a impressão do relatório: só o relatório fica visível
    await page.emulateMediaType("print");
    await page.evaluate(() => document.body.classList.add("prt-imprimindo"));
    const impressao = await page.evaluate(() => { const v = (s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).visibility : "ausente"; }; return { relatorio: v("#prtRelImprimivel h4"), tabela: v("#prtRelImprimivel table"), menu: v("#sidebar"), titulo: v("#abaProtecao > h3"), filtros: v("#prtPilulas") }; });
    await page.evaluate(() => document.body.classList.remove("prt-imprimindo"));
    await page.emulateMediaType("screen");
    if (impressao.relatorio !== "visible" || impressao.tabela !== "visible" || impressao.menu !== "hidden" || impressao.titulo !== "hidden" || impressao.filtros !== "hidden") relatorio.problemas.push(`na impressão só o relatório devia aparecer: ${JSON.stringify(impressao)}`);
    // sair da aba: o intervalo para e o relato/a fila saem
    await clicarTexto("button", "Painel Principal", "#sidebar");
    const saidaDaAba = await page.evaluate(() => ({ fila: document.getElementById("prtListaIncidentes").innerHTML === "", aba: getComputedStyle(document.getElementById("abaProtecao")).display }));
    if (!saidaDaAba.fila || saidaDaAba.aba !== "none") relatorio.problemas.push(`sair da aba devia esvaziar a fila: ${JSON.stringify(saidaDaAba)}`);
  } catch (e) {
    relatorio.problemas.push("EXCEÇÃO: " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
  }
  relatorio.xss = await page.evaluate(() => (window.__xssLista || []).length).catch(() => -1);
  relatorio.cspVioladas = await page.evaluate(() => window.__cspLista).catch(() => []);
  await ctx.close();
  return relatorio;
}

(async () => {
  const s = await servidor();
  const nav = await puppeteer.launch({
    executablePath: EDGE, headless: true, userDataDir: path.join(require("os").tmpdir(), "prt-edge-" + Date.now()),
    args: ["--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync", "--lang=pt-BR"],
    protocolTimeout: 180000
  });
  const resultados = [];
  for (const [nome, vp] of [["390", { width: 390, height: 844, isMobile: true, deviceScaleFactor: 1 }], ["1280", { width: 1280, height: 900, deviceScaleFactor: 1 }]]) {
    estado.ajuda = "ok";
    resultados.push(await rodarViewport(nav, s.url, nome, vp));
  }
  if (process.env.DEPURAR) console.log("CHAMADAS:\n" + [...new Set(s.chamadas.map(c => c.replace(/\?.*?( \[)/, "$1")))].join("\n"));
  // o canal público nunca pode ter recebido token
  const publicoComToken = s.chamadas.filter(c => /POST \/api\/protecao-ajuda/.test(c) && /\[com token\]/.test(c));
  await nav.close(); s.srv.close();
  let falhou = false;
  for (const r of resultados) {
    console.log(`\n=== ${r.nome} px ===`);
    console.log(`medidas: ${r.medidas.length} (sem rolagem lateral e alvos ≥ 40 px: ${r.medidas.filter(m => !m.rolagemLateral && !m.ofensores.length && !m.alvosPequenos.length).length})`);
    console.log(`violações de CSP: ${r.csp.length + r.cspVioladas.length} · código do ataque executado: ${r.xss} · erros de JavaScript/console: ${r.erros.length}`);
    r.csp.slice(0, 5).forEach(x => console.log("  CSP: " + x)); r.cspVioladas.slice(0, 5).forEach(x => console.log("  CSP(evento): " + x));
    r.erros.slice(0, process.env.DEPURAR ? 40 : 8).forEach(x => console.log("  erro: " + x.replace(/\n/g, " | ")));
    r.problemas.forEach(x => console.log("  ✗ " + x));
    if (r.problemas.length || r.csp.length || r.cspVioladas.length || r.xss !== 0 || r.erros.length) falhou = true;
  }
  if (publicoComToken.length) { falhou = true; console.log(`\n  ✗ o canal público recebeu token: ${publicoComToken.join("; ")}`); }
  console.log(falhou ? "\nRESULTADO: com problemas" : "\nRESULTADO: limpo");
  process.exit(falhou ? 1 : 0);
})();
