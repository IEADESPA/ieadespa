// navegador.js — a tela da v7.10 (check-in infantil) no Edge de verdade (headless), com a CSP final do projeto, a 390 px e a 1280 px: sem rolagem lateral, sem violação de CSP, nada executado, alvos de
// toque de pelo menos 40 px, contraste de pelo menos 4,5:1 nas cores próprias da tela, o foco no lugar certo, o Enter que envia o formulário, o relógio de 8 s de verdade, a página escondida, e a
// IMPRESSÃO de verdade (o código nunca sai num Ctrl+P comum; etiquetas e recibo isolados; o relatório isolado). O front vem do disco (app/), servido com os cabeçalhos de app/staticwebapp.config.json;
// /api/* é respondido aqui pelo SERVIDOR SIMULADO COM ESTADO de fixtures.js (as regras de verdade do backend) com texto de ataque (<img onerror=...>) em TODO campo. Nada chega à API de verdade.
// Percorre: a voluntária (PIN) da sala — Meu Painel, abrir, entrar, check-in, etiqueta e recibo, retirada (código errado e certo, Enter), segunda via, fechar e apagar o código —, o responsável
// (Meus filhos: histórico, quem pode retirar, saúde) e a liderança (sala com pedido de retirada, decidir com motivo, destravar, relatório e a impressão dele, aprovações, fichas).
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteerCaminho = [process.env.PUPPETEER_CORE, path.resolve(__dirname, "../csp-e2e/node_modules/puppeteer-core")].filter(Boolean).find(p => fs.existsSync(p));
if (!puppeteerCaminho) { console.error("puppeteer-core não encontrado: rode `npm ci` em tools/csp-e2e (ou aponte PUPPETEER_CORE para a pasta do puppeteer-core)"); process.exit(3); }
const puppeteer = require(puppeteerCaminho);
const F = require("./fixtures");
const { MIN } = F;

const APP = path.resolve(__dirname, "../../app");
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(p => fs.existsSync(p));
const CONFIG = JSON.parse(fs.readFileSync(path.join(APP, "staticwebapp.config.json"), "utf8"));
// a política final do projeto, igual à de produção (só sem "upgrade-insecure-requests", que não vale para http://127.0.0.1)
const CSP = CONFIG.globalHeaders["Content-Security-Policy"].replace(/;?\s*upgrade-insecure-requests/, "");
const OUT = path.join(require("os").tmpdir(), "front-checkin-img");       // as capturas não são versionadas
fs.mkdirSync(OUT, { recursive: true });
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

// ---------------------------------------------------------------- a API simulada (um servidor com estado por largura de tela)
const SESSOES = { "tok-41": { membroId: 41, lideranca: false, gestao: false }, "tok-42": { membroId: 42, lideranca: false, gestao: false }, "tok-201": { membroId: 201, lideranca: false, gestao: false },
  "tok-9": { membroId: 9, lideranca: true, gestao: true } };
function criarEstado() {
  const S = F.criarServidor({ ataque: "total", fatorFresco: true });
  const t0 = Date.now(), base = S.agoraMs;
  S.relogioReal = () => { S.agoraMs = base + (Date.now() - t0); };   // o relógio do servidor anda junto com o do navegador (a tela mostra "Atualizado às ..." de verdade)
  S.log = [];
  return S;
}
function api(S, metodo, caminho, consulta, corpo, token, urlCompleta) {
  const ok = (c, status = 200) => ({ status, corpo: c });
  const chave = `${metodo} ${caminho}`;
  const sessao = SESSOES[token];
  if (chave === "POST membro/entrar") {
    const m = String(corpo.matricula);
    return ok(corpo.pin === "1234" && ["41", "42", "201"].includes(m) ? { sucesso: true, token: `tok-${m}`, nome: "Membro Teste", permissoes: [], nivel: null, escopo: null, geral: false, termosPendentes: [] } : { sucesso: false, mensagem: "Matrícula ou PIN incorretos." });
  }
  if (chave === "POST auth/login") return ok(String(corpo.matricula) === "9" && corpo.senha === "senha-simulada-geral" ? { sucesso: true, token: "tok-9", nome: "Líder Geral Teste", permissoes: ["habilitacao_voluntarios"], nivel: "GLOBAL", escopo: "TODAS", geral: true, termosPendentes: [] } : { sucesso: false, mensagem: "Matrícula ou senha incorretos." });
  if (/^checkin-infantil\//.test(caminho)) {
    if (!sessao) return ok({ sucesso: false, mensagem: "Sessão inválida." }, 401);
    S.definirSessao(sessao); S.relogioReal();
    S.log.push(`${metodo} ${urlCompleta}`);
    return S.responder({ metodo, caminho, consulta, corpo });
  }
  if (/^GET membros\/\d+\/frequencia$/.test(chave)) return ok({ sucesso: true, membro: { membroId: 20, nome: "Membro Teste", funcao: "Membro", congregacao: "Sede", status: "ATIVO" }, assentos: [], resumo: { totalReunioes: 0, totalPresencas: 0, totalFaltas: 0, totalJustificadas: 0, percentualPresenca: null }, historico: [] });
  if (/^GET lgpd\/consentimento\/\d+$/.test(chave)) return ok({ sucesso: true, consentimentos: [] });
  if (/^GET lgpd\/solicitacoes\/\d+$/.test(chave)) return ok({ sucesso: true, solicitacoes: [] });
  if (chave === "GET painel-inicial") return ok({ sucesso: true, blocos: [] });
  if (chave === "GET notificacoes/contagem") return ok({ sucesso: true, total: 0, naoLidas: 0 });
  if (/^GET minha-foto\/\d+$/.test(chave)) return ok({ sucesso: true, fotoUrl: null, consentimentoConcedido: false, menorDeIdade: false });
  if (metodo === "POST") return ok({ sucesso: true, mensagem: "Registrado." });
  return ok({ sucesso: true });
}

function servidor(S) {
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const base = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": CSP };
    if (url.pathname.startsWith("/api/")) {
      let bruto = ""; req.on("data", c => { bruto += c; });
      req.on("end", () => {
        let corpo = {}; try { corpo = JSON.parse(bruto || "{}"); } catch (_) { /* corpo vazio */ }
        const r = api(S, req.method, url.pathname.replace(/^\/api\//, ""), Object.fromEntries(url.searchParams), corpo, req.headers["x-auth-token"], url.pathname + url.search) || { status: 404, corpo: { sucesso: false, mensagem: "sem fixture" } };
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
  return new Promise(ok => srv.listen(0, "127.0.0.1", () => ok({ srv, url: `http://127.0.0.1:${srv.address().port}` })));
}

// ---------------------------------------------------------------- o que se mede dentro da página
const RAIZES_DA_TELA = ["#subMeupainelCheckininfantil", "#abaCheckininfantil", "#modalCaixa"];
const medir = (raizes) => {
  const de = document.documentElement, W = de.clientWidth;
  const vis = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const rolante = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll") return p; } return null; };
  const ofensores = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el)) continue;
    if (el.closest("#modalOverlay") === null && el.closest("#sidebar")) continue;
    if (el.closest("#toastContainer")) continue;   // o aviso entra deslizando 24 px (animação do sistema): medido no meio da entrada passaria da borda
    const r = el.getBoundingClientRect();
    if (r.right > W + 1) { const p = rolante(el); if (!p || p.getBoundingClientRect().right > W + 1) ofensores.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} (${Math.round(r.right)}>${W})`); }
  }
  const lateral = de.scrollWidth > W || document.body.scrollWidth > W;
  const alvos = [];
  const lista = raizes.map(s => document.querySelector(s)).filter(r => r && vis(r));
  for (const raiz of lista) for (const el of raiz.querySelectorAll("button, select, input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea, a.chk-tel, summary")) {
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
const SELETORES_CONTRASTE = [".chk-selo", ".chk-contagem", ".chk-aguardando", ".chk-alergia", ".chk-lotacao-linha", ".chk-problemas", ".chk-tel", ".chk-nome", ".chk-lista", ".chk-visita", ".chk-termo-itens", ".chk-recibo-linha",
  ".chk-recibo-titulo", ".chk-codigo", ".cnl-aviso-senha", ".psc-aviso", ".psc-legenda", ".chk-subtitulo", ".chk-fieldset legend", ".cal-pilula", ".chk-tabela th", ".chk-tabela td", ".chk-btn", ".chk-etq-nome", ".chk-etq-sala",
  ".chk-aviso-faixa", ".chk-apr-sala", ".btn-link", ".subtitle", ".cal-selo", ".chk-lotacao"];

async function rodarViewport(nav, nome, viewport) {
  const S = criarEstado();
  const srv = await servidor(S);
  const base = srv.url;
  const relatorio = { nome, problemas: [], medidas: [], csp: [], erros: [], xss: 0, folhas: {}, notas: [] };
  const ctx = await nav.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  page.setDefaultTimeout(20000);
  await page.evaluateOnNewDocument(() => {
    try { delete Navigator.prototype.serviceWorker; } catch (_) { /* sem service worker */ }
    window.__xss = function (c) { (window.__xssLista = window.__xssLista || []).push(String(c)); };
    window.__cspLista = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__cspLista.push(`${e.violatedDirective} ${e.blockedURI} ${String(e.sourceFile || "").slice(-40)}:${e.lineNumber}`));
    // window.print() de verdade abriria o diálogo do sistema: aqui ele só anota as classes do <body> NO MOMENTO de imprimir
    window.__impressoes = [];
    window.print = function () { window.__impressoes.push(document.body.className); };
  });
  page.on("console", (m) => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) relatorio.csp.push(t.slice(0, 200)); else if (m.type() === "error" && !/Failed to load resource|ERR_NAME_NOT_RESOLVED|ERR_FAILED|status of 4\d\d|status of 5\d\d/.test(t)) relatorio.erros.push(t.slice(0, 200)); });
  page.on("pageerror", (e) => relatorio.erros.push("pageerror: " + String(e.stack || e.message).slice(0, 400)));
  page.on("dialog", (d) => { relatorio.problemas.push("diálogo nativo: " + d.message()); d.dismiss().catch(() => {}); });
  const problema = (t) => relatorio.problemas.push(t);

  const medida = async (rotulo) => {
    const m = await page.evaluate(medir, RAIZES_DA_TELA); relatorio.medidas.push({ rotulo, ...m });
    if (m.rolagemLateral || m.ofensores.length) problema(`${rotulo}: rolagem lateral=${m.rolagemLateral} (scrollW ${m.scrollW} > ${m.clientW}) ofensores=${m.ofensores.join("; ")} largos=${m.largos.join(" | ")}`);
    if (m.alvosPequenos.length) problema(`${rotulo}: alvo de toque com menos de 40 px: ${m.alvosPequenos.join("; ")}`);
    const ruins = await page.evaluate(contraste, SELETORES_CONTRASTE);
    if (ruins.length) problema(`${rotulo}: contraste baixo: ${ruins.slice(0, 4).join("; ")}`);
  };
  const foto = async (seletor, arq) => { const h = await page.$(seletor); if (h) { try { await h.screenshot({ path: path.join(OUT, `${nome}-${arq}.png`), captureBeyondViewport: true }); } catch (e) { problema(`captura ${arq}: ${e.message.slice(0, 80)}`); } } };
  const calmo = async (ms = 450) => { await new Promise(r => setTimeout(r, ms)); };
  const porTexto = (seletor, texto, escopo) => page.evaluate((s, t, esc) => { const raiz = esc ? document.querySelector(esc) : document; if (!raiz) return false; const el = [...raiz.querySelectorAll(s)].find(x => x.textContent.includes(t) && x.getClientRects().length); if (!el) return false; el.focus(); el.click(); return true; }, seletor, texto, escopo);
  const clicarTexto = async (seletor, texto, escopo) => { const ok = await porTexto(seletor, texto, escopo); if (!ok) problema(`não achei "${texto}" em ${escopo || "a página"}`); await calmo(); return ok; };
  const clicarId = async (id) => { const ok = await page.evaluate((i) => { const el = document.getElementById(i); if (!el || !el.getClientRects().length) return false; el.focus(); el.click(); return true; }, id); if (!ok) problema(`não achei o botão #${id}`); await calmo(); return ok; };
  const preencher = (id, valor) => page.evaluate((i, v) => { const el = document.getElementById(i); if (!el) return false; el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; }, id, valor);
  const esperar = (fn, rotulo, arg) => page.waitForFunction(fn, { timeout: 10000 }, arg).catch(() => problema(`não apareceu: ${rotulo}`));
  const foco = () => page.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? (a.id || a.tagName.toLowerCase()) : "(corpo)"; });
  const conferirFoco = async (esperado, rotulo) => { const f = await foco(); if (f !== esperado) problema(`${rotulo}: o foco devia estar em #${esperado} (está em ${f})`); };
  const abrirMenuCelular = async () => { if (viewport.width <= 640) await page.evaluate(() => { const b = document.getElementById("btnMenuCelular"); const sb = document.getElementById("sidebar"); if (b && b.offsetParent !== null && sb && !sb.classList.contains("aberto-celular")) b.click(); }); await calmo(200); };
  const texto = (sel) => page.evaluate((s) => { const el = document.querySelector(s); return el ? el.textContent : ""; }, sel);
  const entrar = async (matricula, segredo) => {
    await page.evaluate(() => { try { sessionStorage.clear(); } catch (_) { /* ok */ } });
    await page.goto(base + "/", { waitUntil: "load" });
    await page.evaluate(() => { const a = [...document.querySelectorAll("a")].find(x => /Acessar meu Painel/.test(x.textContent)); if (a) a.click(); });
    await calmo(200);
    await page.evaluate((m, s) => { document.getElementById("matriculaPainel").value = m; document.getElementById("senhaPainel").value = s; document.getElementById("matriculaPainel").closest("form").requestSubmit(); }, matricula, segredo);
    await page.waitForFunction(() => { const c = document.getElementById("cxPainelConteudo"); return c && c.style.display !== "none"; }, { timeout: 15000 }).catch(() => problema(`o painel não abriu depois do login de ${matricula}`));
    await calmo();
  };
  const abrirSubAba = async () => {
    await abrirMenuCelular();
    await clicarId("btnSubMeupainelCheckininfantil");
  };
  const armazenamento = () => page.evaluate(() => JSON.stringify([Object.assign({}, localStorage), Object.assign({}, sessionStorage)]));
  // quantas folhas A4 saem (o Edge recusa uma folha que não existe: a última que ele aceita é o total) e o tamanho do PDF de cada uma (folha em branco = PDF minúsculo)
  const folhas = async (margem) => { let total = 0; const tamanhos = []; for (let n = 1; n <= 12; n++) { try { const pdf = await page.pdf({ format: "A4", printBackground: true, margin: margem, pageRanges: String(n) }); total = n; tamanhos.push(pdf.length); } catch (_) { break; } } folhas.ultimos = tamanhos; return total; };
  const semCodigo = async (codigo, onde) => {
    const r = await page.evaluate((c) => ({ corpo: document.documentElement.innerHTML.toUpperCase().includes(c), texto: document.body.innerText.toUpperCase().includes(c), url: location.href.toUpperCase().includes(c) }), codigo);
    const arm = (await armazenamento()).toUpperCase().includes(codigo);
    if (r.corpo || r.texto || r.url || arm) problema(`${onde}: o código ${codigo} ainda está ${[r.corpo && "no HTML", r.texto && "no texto da tela", r.url && "no endereço", arm && "no armazenamento"].filter(Boolean).join(", ")}`);
  };

  try {
    // ===== antes de entrar: a aba e a sub-aba nascem escondidas pelo CSS (sem JavaScript)
    await page.goto(base + "/", { waitUntil: "load" });
    const nascem = await page.evaluate(() => ["subMeupainelCheckininfantil", "abaCheckininfantil", "chkSecaoAprovacoes", "chkSecaoFichas"].map(id => [id, getComputedStyle(document.getElementById(id)).display]));
    if (nascem.some(([, d]) => d !== "none")) problema(`a aba e a sub-aba deviam nascer escondidas pelo CSS: ${JSON.stringify(nascem)}`);

    // ================= A VOLUNTÁRIA DA SALA (PIN): Meu Painel -> Check-in infantil
    await entrar("41", "1234");
    await abrirSubAba();
    await esperar(() => document.querySelectorAll("#chkMeuSalasLista .chk-sala-cartao").length === 1, "a lista de salas de hoje");
    await calmo(); await medida("Meu Painel / salas de hoje"); await foto("#subMeupainelCheckininfantil", "meupainel-salas");
    await clicarId("chkAbrirMeu501x31");
    await esperar(() => document.getElementById("chkSalaRaiz") && document.getElementById("chkEntrarBotao"), "a tela da sala");
    await calmo(); await conferirFoco("chkSalaTitulo", "abrir a sala");
    await medida("Sala / antes de entrar"); await foto("#subMeupainelCheckininfantil", "sala-antes");
    await clicarId("chkEntrarBotao");
    await esperar(() => document.getElementById("chkSairBotao") && document.getElementById("chkCiForm") && getComputedStyle(document.getElementById("chkCiForm")).display !== "none", "o formulário depois de entrar na sala");
    await medida("Sala / dentro, formulário de check-in"); await foto("#subMeupainelCheckininfantil", "sala-dentro");
    // buscar a criança digitando de verdade (espera de 350 ms) e adicionar
    await page.click("#chkCiBusca"); await page.type("#chkCiBusca", "Ped", { delay: 40 });
    await esperar(() => document.getElementById("chkRes101"), "o resultado da busca");
    await medida("Check-in / resultado da busca");
    await clicarId("chkAdd101");
    await esperar(() => document.getElementById("chkChip0"), "a criança na lista da entrada");
    await page.select("#chkCiTrouxe", "201");
    // um visitante com saúde (texto de autorização à vista)
    await page.evaluate(() => { document.getElementById("chkCiVisDetalhes").open = true; });
    await preencher("chkCiVisNome", "Visitante Browser"); await preencher("chkCiVisNasc", "2021-05-05"); await preencher("chkCiVisSaude", "Alergia a amendoim");
    await calmo(200); await medida("Check-in / visitante com o texto da autorização de saúde"); await foto("#chkCheckinCx", "checkin-visitante");
    await page.evaluate(() => { document.getElementById("chkCiVisConcordo").click(); });
    await clicarId("chkCiVisAdicionar");
    await preencher("chkCiTrouxe", "OUTRA");
    await calmo(200);
    await esperar(() => !!document.getElementById("chkChip1"), "o visitante na lista");
    // com visitante a 'outra pessoa' é a escolha de quem trouxe (os dois têm de ter o mesmo responsável)
    await page.evaluate(() => { document.getElementById("chkCiTrouxe").value = "OUTRA"; document.getElementById("chkCiTrouxe").dispatchEvent(new Event("change", { bubbles: true })); });
    await preencher("chkCiTrouxeNome", "Tia Zeza"); await preencher("chkCiTrouxePar", "MAE"); /* (Trava 7-B) a alergia do visitante na etiqueta só com pai, mãe ou tutor(a) */ await preencher("chkCiTrouxeDoc", "RG"); await preencher("chkCiTrouxeTel", "(11) 99999-0000");
    await medida("Check-in / formulário completo"); await foto("#chkCheckinCx", "checkin-completo");
    await clicarId("chkCiEnviar");
    await esperar(() => document.getElementById("chkImprimivel") && document.querySelector("#chkImprimivel .chk-codigo"), "as etiquetas e o recibo");
    await calmo(); await conferirFoco("chkImpressaoTitulo", "depois do check-in");
    await medida("Etiquetas e recibo"); await foto("#chkImpressaoCx", "etiquetas");
    const codigos = await page.evaluate(() => [...document.querySelectorAll("#chkImprimivel .chk-etiqueta .chk-codigo")].map(x => x.textContent));
    if (codigos.length !== 2 || !codigos.every(c => /^[A-HJKMNP-Z2-9]{6}$/.test(c))) problema(`as duas etiquetas deviam ter um código de 6 símbolos válidos: ${JSON.stringify(codigos)}`);
    const saudeNaEtiqueta = await page.evaluate(() => !!document.querySelector("#chkImprimivel .chk-alergia") && /Alergia a amendoim/.test(document.querySelector("#chkImprimivel .chk-alergia").textContent));
    if (!saudeNaEtiqueta) problema("a alergia do visitante devia sair na etiqueta, em destaque");
    // a impressão de verdade: um Ctrl+P comum NÃO imprime o código; "Imprimir etiquetas e recibo" imprime só as etiquetas e o recibo
    await page.emulateMediaType("print");
    const comum = await page.evaluate(() => getComputedStyle(document.getElementById("chkImpressaoCx")).display);
    await page.emulateMediaType("screen");
    if (comum !== "none") problema(`num Ctrl+P comum o painel com os códigos não pode sair (display=${comum})`);
    await clicarId("chkImprimirBotao");
    // (v7.10, revisão: as classes ficam no <body> até a pessoa responder se as etiquetas saíram — no celular o print() volta antes da prévia; só depois da resposta saem, e o lote conta como impresso)
    const imp = await page.evaluate(() => ({ lista: window.__impressoes.slice(), durante: document.body.className, pergunta: !document.getElementById("modalOverlay").classList.contains("escondido"), alvos: [...document.querySelectorAll("#chkImprimivel .chk-lote-alvo")].length }));
    if (imp.lista.length !== 1 || !/chk-imprimindo/.test(imp.lista[0]) || !/chk-imp-etiquetas/.test(imp.lista[0]) || /chk-imp-relatorio/.test(imp.lista[0]) || !imp.pergunta || !/chk-imprimindo/.test(imp.durante) || imp.alvos !== 1) problema(`imprimir devia pôr as classes das etiquetas e perguntar se saiu, com as classes ainda no <body> e o lote marcado: ${JSON.stringify(imp)}`);
    await clicarId("modalConfirmar");
    const depoisDaResposta = await page.evaluate(() => ({ depois: document.body.className, alvos: [...document.querySelectorAll("#chkImprimivel .chk-lote-alvo")].length, estado: (document.querySelector("#chkImprimivel .chk-lote-estado") || {}).textContent || "" }));
    if (/chk-imp-|chk-imprimindo/.test(depoisDaResposta.depois) || depoisDaResposta.alvos !== 0 || !/Impresso/.test(depoisDaResposta.estado)) problema(`depois da resposta as classes e a marca saem e o lote vira 'Impresso': ${JSON.stringify(depoisDaResposta)}`);
    await page.emulateMediaType("print");
    // (como na impressão de verdade: o corpo leva as classes e os lotes que vão ao papel levam a marca de alvo)
    await page.evaluate(() => { document.body.classList.add("chk-imprimindo", "chk-imp-etiquetas"); document.querySelectorAll("#chkImprimivel .chk-lote").forEach(l => l.classList.add("chk-lote-alvo")); });
    const iso = await page.evaluate(() => { const v = (s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).visibility : "ausente"; }; const d = (s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).display : "ausente"; };
      return { etiqueta: v("#chkImprimivel .chk-etiqueta"), codigo: v("#chkImprimivel .chk-codigo"), recibo: v("#chkImprimivel .chk-recibo"), menu: v("#sidebar"), titulo: v("#subMeupainelCheckininfantil > h3"), menuD: d("#sidebar"), tituloD: d("#subMeupainelCheckininfantil > h3"), listaD: d("#chkSalaCabecalho"), faixa: d("#chkImprimivel .chk-so-tela"), subaba: d("#subMeupainelCheckininfantil"), imprimivel: d("#chkImprimivel") }; });
    const margens = { top: "1cm", bottom: "1cm", left: "1cm", right: "1cm" };
    relatorio.folhas.etiquetas = Math.max(await folhas(undefined), await folhas(margens)); relatorio.tamanhosEtiquetas = folhas.ultimos;
    await page.evaluate(() => { document.body.classList.remove("chk-imprimindo", "chk-imp-etiquetas"); document.querySelectorAll("#chkImprimivel .chk-lote-alvo").forEach(l => l.classList.remove("chk-lote-alvo")); });
    await page.emulateMediaType("screen");
    if (iso.etiqueta !== "visible" || iso.codigo !== "visible" || iso.recibo !== "visible" || iso.menu !== "hidden" || iso.titulo !== "hidden") problema(`na impressão só as etiquetas e o recibo deviam aparecer: ${JSON.stringify(iso)}`);
    if (iso.menuD !== "none" || iso.tituloD !== "none" || iso.listaD !== "none" || iso.subaba === "none" || iso.imprimivel === "none") problema(`na impressão o resto da página devia sair com display:none (sem ocupar folha) e as caixas das etiquetas ficar: ${JSON.stringify(iso)}`);
    if (iso.faixa !== "none" && iso.faixa !== "ausente") problema(`o aviso de idade fora da faixa (só da tela) não pode sair no papel: ${iso.faixa}`);
    if ((relatorio.tamanhosEtiquetas || []).some(t => t < 8000)) problema(`uma folha das etiquetas saiu em branco (PDF por folha: ${relatorio.tamanhosEtiquetas})`);
    if (relatorio.folhas.etiquetas !== 2) problema(`etiquetas na primeira folha e o recibo, numa folha à parte: esperava 2 folhas, saíram ${relatorio.folhas.etiquetas}`);
    // a sala continua a mostrar as duas crianças, sem o código
    await esperar(() => document.querySelectorAll("#chkNaSalaLista .chk-crianca").length === 2, "as duas crianças na lista 'Na sala'");
    await calmo(); await medida("Sala / com as crianças");
    await foto("#subMeupainelCheckininfantil", "sala-criancas");
    const idPedro = await page.evaluate(() => { const el = [...document.querySelectorAll("#chkNaSalaLista .chk-crianca")].find(x => x.textContent.includes("Pedro")); return el ? Number(el.id.replace("chkCrianca", "")) : 0; });
    const idVis = await page.evaluate(() => { const el = [...document.querySelectorAll("#chkNaSalaLista .chk-crianca")].find(x => x.textContent.includes("Visitante Browser")); return el ? Number(el.id.replace("chkCrianca", "")) : 0; });
    const codPedro = S.codigoDe(idPedro), codVis = S.codigoDe(idVis);
    if (!idPedro || !idVis || !codPedro) problema("não achei as crianças na sala");

    // ----- fechar e apagar o código (já foi impresso: fecha sem perguntar); o código sai de tudo
    await clicarId("chkFecharImpressaoBotao");
    await calmo();
    const seAbriuModal = await page.evaluate(() => !document.getElementById("modalOverlay").classList.contains("escondido"));
    if (seAbriuModal) problema("o painel já foi impresso: fechar não devia perguntar");
    await semCodigo(codPedro.toUpperCase(), "depois de fechar o painel das etiquetas"); await semCodigo(codVis.toUpperCase(), "depois de fechar o painel das etiquetas");
    await conferirFoco("chkSalaTitulo", "fechar o painel das etiquetas");

    // ----- a retirada: o Enter envia, código errado limpa o campo e devolve o foco, depois o certo
    await clicarId(`chkRetirar${idPedro}`);
    await esperar(() => document.getElementById("chkRtPainel"), "o painel de retirada");
    await conferirFoco("chkRtQuem", "abrir a retirada");
    await medida("Retirada / painel"); await foto("#chkAcaoCx", "retirada-painel");
    await page.select("#chkRtQuem", "RESP:201");
    await page.click("#chkRtCodigo"); await page.type("#chkRtCodigo", "bbb-bbb", { delay: 30 });
    const dentroDoCampo = await page.evaluate(() => document.getElementById("chkRtCodigo").value);
    await page.keyboard.press("Enter");     // o Enter do teclado envia o formulário (submit nativo, com data-prevent)
    await esperar(() => /Código errado/.test(document.getElementById("chkRtMsg").textContent), "a mensagem de código errado");
    await calmo();
    const aposErro = await page.evaluate(() => ({ campo: document.getElementById("chkRtCodigo").value, foco: document.activeElement && document.activeElement.id, url: location.href }));
    if (aposErro.campo !== "" || aposErro.foco !== "chkRtCodigo") problema(`depois do código errado o campo devia estar vazio e com o foco: ${JSON.stringify(aposErro)} (digitado: ${dentroDoCampo})`);
    if (/\?|#.*bbb/i.test(new URL(aposErro.url).search)) problema(`o Enter não pode recarregar a página com o código no endereço: ${aposErro.url}`);
    await medida("Retirada / código errado");
    await page.type("#chkRtCodigo", codPedro.toLowerCase(), { delay: 30 });
    await page.keyboard.press("Enter");
    await esperar(() => !document.getElementById("chkRtPainel"), "o painel de retirada fechar depois da retirada certa");
    await calmo(700);
    const aposRetirada = await page.evaluate((id) => ({ foco: document.activeElement && document.activeElement !== document.body ? (document.activeElement.id || document.activeElement.tagName) : "(corpo)", sumiu: !document.getElementById(`chkCrianca${id}`), msg: document.getElementById("chkSalaMsg").textContent }), idPedro);
    if (!aposRetirada.sumiu || !/entregue/i.test(aposRetirada.msg)) problema(`a retirada certa devia entregar a criança: ${JSON.stringify(aposRetirada)}`);
    if (aposRetirada.foco === "(corpo)") problema("depois da retirada o foco não pode se perder no corpo da página");
    await semCodigo(codPedro.toUpperCase(), "depois de retirar");
    await conferirFoco("chkSalaTitulo", "depois da retirada (o botão da criança saiu da tela)");
    // ----- segunda via do visitante (quem pede e outro adulto confirma: aqui só o pedido)
    await clicarId(`chkSegVia${idVis}`);
    await esperar(() => document.getElementById("chkSvPainel"), "o painel da segunda via");
    await medida("Segunda via / painel"); await foto("#chkAcaoCx", "segunda-via-painel");
    await page.select("#chkSvQuem", "TROUXE"); await page.select("#chkSvDoc", "RG");
    await page.keyboard.press("Tab"); await page.evaluate(() => document.getElementById("chkSvForm").requestSubmit());
    await esperar(() => !document.getElementById("chkSvPainel"), "o painel da segunda via fechar");
    await calmo(); await medida("Segunda via / pedida");

    // ----- o relógio de verdade (8 s) e a página escondida
    const antesTexto = await texto("#chkSalaAtualizado");
    const pedidos0 = S.log.filter(l => /GET .*sala\?/.test(l)).length;
    if (viewport.width > 640) {
      await new Promise(r => setTimeout(r, 9500));
      const depoisTexto = await texto("#chkSalaAtualizado");
      const pedidos1 = S.log.filter(l => /GET .*sala\?/.test(l)).length;
      if (antesTexto === depoisTexto || pedidos1 <= pedidos0) problema(`a sala devia se atualizar sozinha em 8 s (antes: "${antesTexto.slice(0, 40)}"; depois: "${depoisTexto.slice(0, 40)}"; pedidos ${pedidos0} -> ${pedidos1})`);
      await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get() { return "hidden"; } }); document.dispatchEvent(new Event("visibilitychange")); });
      const escondidoAntes = S.log.filter(l => /GET .*sala\?/.test(l)).length;
      await new Promise(r => setTimeout(r, 9500));
      const escondidoDepois = S.log.filter(l => /GET .*sala\?/.test(l)).length;
      if (escondidoDepois !== escondidoAntes) problema(`com a página escondida a sala não pode ser pedida (${escondidoAntes} -> ${escondidoDepois})`);
      await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get() { return "visible"; } }); document.dispatchEvent(new Event("visibilitychange")); });
      await calmo(700);
      if (S.log.filter(l => /GET .*sala\?/.test(l)).length <= escondidoDepois) problema("ao voltar ao navegador a sala devia ser lida na hora");
    } else relatorio.notas.push("(o relógio de 8 s de verdade só é esperado a 1280 px, para não alongar a prova)");

    // ----- voltar às salas: o foco volta ao botão de onde veio; o código nunca esteve no armazenamento
    await clicarId("chkVoltarBotao");
    await calmo(); await conferirFoco("chkAbrirMeu501x31", "voltar às salas");
    await semCodigo(codPedro.toUpperCase(), "depois de voltar"); await semCodigo(codVis.toUpperCase(), "depois de voltar");

    // ================= O RESPONSÁVEL (PIN): Meus filhos
    S.semear({ menorId: 101, trouxeMembroId: 201, situacao: "RETIRADA" });
    S.membros[1].saude = { texto: "Alergia a amendoim", forma: "RESPONSAVEL", atualizadoEm: S.agoraMs };
    S.membros[0].autorizados.push({ autorizadoId: 7001, nome: "Tia Zeza", parentesco: "TIO", validoAte: "2026-12-31", forma: "FICHA_FISICA", registradoEm: S.agoraMs });
    await entrar("201", "1234");
    await abrirSubAba();
    await esperar(() => document.querySelectorAll("#chkFilhosLista .chk-filho").length === 2, "a lista de filhos");
    await calmo(); await medida("Meus filhos / lista"); await foto("#subMeupainelCheckininfantil", "filhos-lista");
    await clicarId("chkFhBtnHist101"); await esperar(() => document.querySelector("#chkFhHist101 .chk-historico"), "o histórico");
    await clicarId("chkFhBtnAut101"); await esperar(() => document.getElementById("chkFhAutNome101"), "quem pode retirar");
    await clicarId("chkFhBtnSau101"); await esperar(() => /autorizar em Meu Painel/.test(document.getElementById("chkFhSau101").textContent), "o aviso de saúde sem autorização");
    await clicarId("chkFhBtnSau102"); await esperar(() => document.getElementById("chkFhSauTexto102"), "o campo de saúde");
    await calmo(); await medida("Meus filhos / histórico, quem pode retirar e saúde abertos"); await foto("#chkFilhosLista", "filhos-abertos");
    // autorizar uma pessoa com o teclado: o foco vai ao título da lista refeita
    await preencher("chkFhAutNome101", "Vovó Lia"); await preencher("chkFhAutPar101", "AVO");
    await clicarId("chkFhAutEnviar101");
    await esperar(() => /Vovó Lia/.test(document.getElementById("chkFhAut101").textContent), "a pessoa autorizada na lista");
    await calmo(); await conferirFoco("chkFhAutTitulo101", "depois de autorizar uma pessoa");
    // recusa do servidor com o foco no botão: o botão volta a ser habilitado e continua com o foco
    await preencher("chkFhAutNome101", "vovó lia"); await preencher("chkFhAutPar101", "AVO");
    await page.evaluate(() => document.getElementById("chkFhAutEnviar101").focus());
    await page.evaluate(() => document.getElementById("chkFhAutEnviar101").click());
    await esperar(() => /já está na lista/.test(document.getElementById("chkFhAutMsg101").textContent), "a recusa do servidor (nome repetido)");
    await calmo();
    const noBotao = await page.evaluate(() => ({ foco: document.activeElement && document.activeElement.id, desabilitado: document.getElementById("chkFhAutEnviar101").disabled }));
    if (noBotao.foco !== "chkFhAutEnviar101" || noBotao.desabilitado) problema(`depois da recusa o botão devia estar habilitado e com o foco: ${JSON.stringify(noBotao)}`);
    await medida("Meus filhos / recusa do servidor");

    // ================= A LIDERANÇA (senha): Habilitação de Voluntários -> Check-in Infantil
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 });
    S.pedirDivergencia(a.registroId, { nome: "Tia Zeza", parentesco: "TIO", documento: "CNH", operadorId: 42 });
    const t = S.semear({ menorId: 102, trouxeMembroId: 201, travado: true, tentativas: 5 });
    const v = S.semear({ visitante: { nome: "Visitante Seis", nascimento: "2021-02-02" }, trouxeNome: "Tia Zeza", trouxeContato: "11999990000" });
    S.pedirDivergencia(v.registroId, { nome: "Vizinha Dalva", parentesco: "AMIGO_FAMILIA", documento: "RG", operadorId: 42 });
    S.salas[0].voluntarios.push({ membroId: 43, entrouEm: S.agoraMs - 5 * MIN, saiuEm: null });
    await entrar("9", "senha-simulada-geral");
    await page.evaluate(() => { const c = [...document.querySelectorAll(".card-modulo")].find(x => x.textContent.includes("Habilitação de Voluntários")); if (c) c.click(); });
    await calmo();
    await abrirMenuCelular();
    await clicarId("btnAbaCheckininfantil");
    await esperar(() => document.querySelectorAll("#chkGesSalasLista .chk-sala-cartao").length === 2, "as salas do escopo");
    await calmo(); await medida("Liderança / salas de hoje"); await foto("#abaCheckininfantil", "lideranca-salas");
    await clicarId("chkAbrirGes501x31");
    await esperar(() => document.getElementById("chkSalaRaiz") && document.querySelector("#chkNaSalaLista .chk-crianca-divergente"), "a sala com o pedido de retirada");
    await calmo(); await medida("Liderança / sala com pedidos e criança travada"); await foto("#abaCheckininfantil", "lideranca-sala");
    const links = await page.evaluate(() => [...document.querySelectorAll("#chkNaSalaLista a.chk-tel")].map(x => x.getAttribute("href")));
    if (links.length < 3 || !links.every(h => /^tel:\d{8,13}$/.test(h))) problema(`os telefones devem ser links tel: só com números: ${JSON.stringify(links)}`);
    // decidir: aprovar com motivo (a confirmação reforçada já está fresca no servidor simulado)
    await clicarId(`chkAprovar${a.registroId}`);
    await esperar(() => !document.getElementById("modalOverlay").classList.contains("escondido") && /Aprovar a retirada/.test(document.getElementById("modalCaixa").textContent), "a confirmação de aprovar");
    await medida("Liderança / confirmação de aprovar"); await foto("#modalCaixa", "lideranca-confirmacao");
    await page.evaluate(() => document.getElementById("modalConfirmar").click());
    await esperar(() => document.getElementById("modalTexto"), "o pedido do motivo");
    await calmo(200); await medida("Liderança / pedido do motivo");
    await page.evaluate(() => { const c = document.getElementById("modalTexto"); c.value = "Liguei para a mãe, que confirmou."; });
    await page.evaluate(() => document.getElementById("modalConfirmar").click());
    await calmo(800);
    const aprovou = await page.evaluate((id) => ({ sumiu: !document.getElementById(`chkCrianca${id}`), foco: document.activeElement && document.activeElement !== document.body ? (document.activeElement.id || document.activeElement.tagName) : "(corpo)", msg: document.getElementById("chkSalaMsg").textContent }), a.registroId);
    if (!aprovou.sumiu || !/aprovada/i.test(aprovou.msg)) problema(`aprovar devia liberar a criança: ${JSON.stringify(aprovou)}`);
    if (aprovou.foco === "(corpo)") problema("depois de aprovar o foco não pode se perder no corpo da página");
    // destravar
    await clicarId(`chkDestravar${t.registroId}`);
    await page.evaluate(() => document.getElementById("modalConfirmar").click());
    await calmo(800);
    if (S.registro(t.registroId).travado) problema("destravar devia destravar a criança");
    // relatório e a impressão dele
    await clicarId("chkRelatorioBotao");
    await esperar(() => document.querySelectorAll("#chkRelatorioCx table").length === 3, "as três tabelas do relatório");
    await calmo(); await medida("Liderança / relatório do dia"); await foto("#abaCheckininfantil", "lideranca-relatorio");
    await clicarId("chkRelImprimirBotao");
    const impR = await page.evaluate(() => ({ lista: window.__impressoes.slice(-1), depois: document.body.className }));
    if (!/chk-imp-relatorio/.test(impR.lista[0] || "") || /chk-imp-etiquetas/.test(impR.lista[0] || "") || /chk-imp-|chk-imprimindo/.test(impR.depois)) problema(`imprimir o relatório devia pôr as classes do relatório só durante window.print(): ${JSON.stringify(impR)}`);
    await page.emulateMediaType("print");
    await page.evaluate(() => document.body.classList.add("chk-imprimindo", "chk-imp-relatorio"));
    const viewportAntes = page.viewport();
    await page.setViewport(Object.assign({}, viewportAntes, { width: 794, height: 1123 }));   // a largura de uma A4 a 96 dpi (os mesmos sinalizadores: trocar isMobile recarrega a página)
    relatorio.alturaRelatorio = await page.evaluate(() => Math.ceil(document.getElementById("chkRelImprimivel").getBoundingClientRect().height));
    await page.setViewport(viewportAntes);
    const isoR = await page.evaluate(() => { const v = (s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).visibility : "ausente"; }; const d = (s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).display : "ausente"; };
      return { rel: v("#chkRelImprimivel h5"), tabela: v("#chkRelImprimivel table"), menu: v("#sidebar"), pilulas: v("#chkPilulas"), menuD: d("#sidebar"), pilulasD: d("#chkPilulas"), relD: d("#chkRelImprimivel"), abaD: d("#abaCheckininfantil"), etiquetas: d("#chkImpressaoCx") }; });
    relatorio.folhas.relatorio = Math.max(await folhas(undefined), await folhas(margens)); relatorio.tamanhosRelatorio = folhas.ultimos;
    await page.evaluate(() => document.body.classList.remove("chk-imprimindo", "chk-imp-relatorio"));
    await page.emulateMediaType("screen");
    if (isoR.rel !== "visible" || isoR.tabela !== "visible" || isoR.menu !== "hidden" || isoR.pilulas !== "hidden") problema(`na impressão só o relatório devia aparecer: ${JSON.stringify(isoR)}`);
    if (isoR.menuD !== "none" || isoR.pilulasD !== "none" || isoR.relD === "none" || isoR.abaD === "none") problema(`na impressão o resto da página devia sair com display:none e as pastas do relatório ficar: ${JSON.stringify(isoR)}`);
    if ((relatorio.tamanhosRelatorio || []).some(t => t < 8000)) problema(`uma folha do relatório saiu em branco (PDF por folha: ${relatorio.tamanhosRelatorio})`);
    const folhasPrecisas = Math.ceil(relatorio.alturaRelatorio / 1047);       // 1123 px da folha menos 1 cm de margem em cima e embaixo
    if (relatorio.folhas.relatorio < 1 || relatorio.folhas.relatorio > folhasPrecisas + 1) problema(`o relatório (${relatorio.alturaRelatorio} px de conteúdo) pede ${folhasPrecisas} folha(s) e saíram ${relatorio.folhas.relatorio}: folha em branco sobrando?`);
    await clicarId("chkRelFecharBotao");
    // aprovações e fichas
    await clicarId("btnChkSecaoAprovacoes");
    await esperar(() => document.querySelectorAll("#chkAprovacoesLista .chk-crianca").length >= 1, "a fila de aprovações");
    await calmo(); await medida("Liderança / aprovações"); await foto("#abaCheckininfantil", "lideranca-aprovacoes");
    await clicarId("btnChkSecaoFichas");
    await conferirFoco("chkFiMatricula", "abrir as fichas");
    await preencher("chkFiMatricula", "102");
    await clicarId("chkFiBuscar");
    await esperar(() => document.getElementById("chkFiTitulo") && document.getElementById("chkFiSauTexto102"), "a ficha da criança");
    await calmo(); await medida("Liderança / ficha assinada"); await foto("#abaCheckininfantil", "lideranca-ficha");
    await conferirFoco("chkFiTitulo", "abrir a ficha");
    // sair da aba: a fila, a ficha e o relógio saem
    await abrirMenuCelular();
    await clicarTexto("button", "Painel Principal", "#sidebar");
    const saida = await page.evaluate(() => ({ fila: document.getElementById("chkAprovacoesLista").innerHTML === "", ficha: document.getElementById("chkFichaCx").innerHTML === "", aba: getComputedStyle(document.getElementById("abaCheckininfantil")).display }));
    if (!saida.fila || !saida.ficha || saida.aba !== "none") problema(`sair da aba devia esvaziar a fila e a ficha: ${JSON.stringify(saida)}`);
  } catch (e) {
    problema("EXCEÇÃO: " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
  }
  relatorio.xss = await page.evaluate(() => (window.__xssLista || []).length).catch(() => -1);
  relatorio.cspVioladas = await page.evaluate(() => window.__cspLista).catch(() => []);
  // nada do que o código digitado ou impresso apareceu nos endereços pedidos ao servidor
  const urlsComCodigo = S.log.filter(l => /codigo=|BBBBBB/i.test(l));
  if (urlsComCodigo.length) problema(`o código apareceu em endereço pedido ao servidor: ${urlsComCodigo.slice(0, 2).join(" ; ")}`);
  relatorio.pedidos = S.log.length;
  await ctx.close(); srv.srv.close();
  return relatorio;
}

(async () => {
  const nav = await puppeteer.launch({
    executablePath: EDGE, headless: true, userDataDir: path.join(require("os").tmpdir(), "chk-edge-" + Date.now()),
    args: ["--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync", "--lang=pt-BR"],
    protocolTimeout: 180000
  });
  const resultados = [];
  // cada largura tem o seu servidor simulado (estado limpo); a 390 e a 1280 px
  const larguras = [["390", { width: 390, height: 844, isMobile: true, deviceScaleFactor: 1 }], ["1280", { width: 1280, height: 900, deviceScaleFactor: 1 }]];
  for (const [nome, vp] of larguras) resultados.push(await rodarViewport(nav, nome, vp));
  await nav.close();
  let falhou = false;
  for (const r of resultados) {
    console.log(`\n=== ${r.nome} px ===`);
    console.log(`medidas: ${r.medidas.length} (sem rolagem lateral e alvos ≥ 40 px: ${r.medidas.filter(m => !m.rolagemLateral && !m.ofensores.length && !m.alvosPequenos.length).length})`);
    console.log(`violações de CSP: ${r.csp.length + r.cspVioladas.length} · código do ataque executado: ${r.xss} · erros de JavaScript/console: ${r.erros.length} · pedidos à API simulada: ${r.pedidos}`);
    console.log(`impressão: etiquetas+recibo ${r.folhas.etiquetas} folha(s) A4 (PDF por folha, em bytes: ${(r.tamanhosEtiquetas || []).join(", ")}) · relatório ${r.folhas.relatorio} folha(s) A4 (${r.alturaRelatorio} px de conteúdo; PDF por folha: ${(r.tamanhosRelatorio || []).join(", ")})`);
    r.notas.forEach(x => console.log("  " + x));
    r.csp.slice(0, 5).forEach(x => console.log("  CSP: " + x)); r.cspVioladas.slice(0, 5).forEach(x => console.log("  CSP(evento): " + x));
    r.erros.slice(0, 8).forEach(x => console.log("  erro: " + x.replace(/\n/g, " | ")));
    r.problemas.forEach(x => console.log("  ✗ " + x));
    if (r.problemas.length || r.csp.length || r.cspVioladas.length || r.xss !== 0 || r.erros.length) falhou = true;
  }
  console.log(falhou ? "\nRESULTADO: com problemas" : "\nRESULTADO: limpo");
  process.exit(falhou ? 1 : 0);
})();
