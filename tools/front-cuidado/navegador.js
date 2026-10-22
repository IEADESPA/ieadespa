// navegador.js — a tela da v7.11 (Cuidado pastoral) no Edge de verdade (headless), com a CSP final do projeto, a 390 px e a 1280 px: sem rolagem lateral, sem violação de CSP, nenhum
// erro de JavaScript ou do console, nada do texto de ataque executado, botões com pelo menos 44 px de altura (campos com pelo menos 40 px) e os fluxos principais desenhados.
// O front vem do disco (app/), servido com a CSP de app/staticwebapp.config.json; /api/cuidado-pastoral/* é respondido aqui pelo SERVIDOR IMITADO de fixtures.js (o handler de verdade, o
// auth.js e o escopoRotas.js de verdade e a camada de banco inteira de verdade contra o banco falso), com texto de ataque (<img onerror=...>) em TODO rótulo e nome que vem dele. Nada chega
// à API de verdade (o resolvedor de nomes do navegador só conhece 127.0.0.1).
// Percorre: a liderança (senha: Pessoas & Membresia → Cuidado Pastoral — a fila, abrir acompanhamento, o detalhe, registrar contato, a nota pastoral aberta e fechada, os pedidos e o
// sinal de risco, o boletim e a impressão dele, o painel) e o membro por PIN (Meu Painel → Cuidado — Meus acompanhamentos, o detalhe, pedir oração com sinal de risco, os telefones).
// SEGURANÇA DA MÁQUINA: o navegador sobe SEMPRE com --disable-gpu (a memória de vídeo derrubou o notebook com a tela azul 0x10E em 19/10/2026), um só navegador por vez, e ele é
// fechado no finally aconteça o que acontecer.
"use strict";
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const puppeteerCaminho = [process.env.PUPPETEER_CORE, path.resolve(__dirname, "../csp-e2e/node_modules/puppeteer-core")].filter(Boolean).find(p => fs.existsSync(p));
if (!puppeteerCaminho) { console.error("puppeteer-core não encontrado: rode `npm ci` em tools/csp-e2e (ou aponte PUPPETEER_CORE para a pasta do puppeteer-core)"); process.exit(3); }
const puppeteer = require(puppeteerCaminho);
const F = require("./fixtures");
const { HORA } = F;

const APP = path.resolve(__dirname, "../../app");
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(p => fs.existsSync(p));
if (!EDGE) { console.error("Microsoft Edge não encontrado"); process.exit(3); }
const CONFIG = JSON.parse(fs.readFileSync(path.join(APP, "staticwebapp.config.json"), "utf8"));
// a política final do projeto, igual à de produção (só sem "upgrade-insecure-requests", que não vale para http://127.0.0.1)
const CSP = CONFIG.globalHeaders["Content-Security-Policy"].replace(/;?\s*upgrade-insecure-requests/, "");
const OUT = path.join(os.tmpdir(), "front-cuidado-img");       // as capturas não são versionadas
fs.mkdirSync(OUT, { recursive: true });
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

// ---------------------------------------------------------------- a API simulada (um servidor imitado com estado por largura de tela)
function criarEstado() {
  const agoraMs = Date.now();
  const srv = F.criarServidor({ ataque: true, agoraMs });
  // os dados de sempre (os mesmos do roteiro): visitante, afastamento detectado e vencido que subiu para a Área, pedido de visita urgente sem responsável, novo convertido menor
  const it1 = srv.novoItem({ tipo: "VISITANTE", pessoaNome: "Carla Visitante", pessoaContato: "(91) 99999-0000", motivo: "Veio com a família no domingo", responsavel: 30, prazoH: 30.5 });
  const it2 = srv.novoItem({ tipo: "AFASTAMENTO", membroId: 50, origem: "DETECCAO", deteccaoResumo: "EBD: antes 9 de 10 (90%); nas últimas 6 semanas 1 de 6 (17%).", motivo: "A frequência caiu em relação ao costume da própria pessoa.", prazoH: -50.5, nivel: "AREA", criadoPor: null, responsavel: 30 });
  srv.novoItem({ tipo: "PEDIDO_VISITA", membroId: 51, urgente: true, responsavel: null, prazoH: 10.5, origem: "PEDIDO_MEMBRO", motivo: "Saí do hospital, queria uma oração em casa" });
  srv.novoItem({ tipo: "NOVO_CONVERTIDO", membroId: 52, responsavel: 30, prazoH: 100.5, motivo: "Aceitou a Jesus no culto de jovens" });
  srv.novoEvento({ ItemId: it2.ItemId, Tipo: "ESCALONADO", NivelDe: "CONGREGACAO", NivelPara: "AREA", PrazoNovo: new Date(agoraMs - 50 * HORA), Em: new Date(agoraMs - 2 * 24 * HORA) });
  srv.novoEvento({ ItemId: it2.ItemId, Tipo: "CONTATO", MembroId: 31, Forma: "VISITA_LAR", Conseguiu: true, Acompanhante: "Irmã Rute", Observacao: "Foi bem recebida, pediu oração" });
  srv.novaNota({ membroId: 50, nivel: "EQUIPE", texto: "NOTA-EQUIPE-AAA: a família pediu discrição.", autor: 30, h: 30 });
  srv.novaNota({ membroId: 50, nivel: "PASTORAL", texto: "NOTA-MINHA-DDD: oramos juntos.", autor: 10, h: 2 });
  srv.novaNota({ itemId: it1.ItemId, nivel: "EQUIPE", texto: "NOTA-VIS-EEE: ligar depois das 18h.", autor: 31, h: 4 });
  srv.novoPedido({ solicitante: 60, texto: "Pela cirurgia da minha mãe, na semana que vem", categoria: "SAUDE", querContato: true });
  srv.novoPedido({ solicitante: 31, texto: "Pelo emprego do meu filho", categoria: "TRABALHO", podeBoletim: false });
  srv.novoPedido({ solicitante: 50, texto: "Ele bate no meu filho quando bebe", categoria: "FAMILIA", risco: true, riscoCrianca: true });
  srv.novoPedido({ congregacaoId: 1, solicitante: 31, texto: "outro", moderacao: "APROVADO", textoBoletim: "Alguém da Congregação Central pede oração pela família.", boletimAte: new Date(agoraMs + 5 * 24 * HORA).toISOString().slice(0, 10) });
  srv.novoPedido({ congregacaoId: 2, solicitante: 11, texto: "outro", moderacao: "APROVADO", textoBoletim: "Alguém da Congregação Vila Nova agradece a Deus e pede que a igreja agradeça junto.", boletimAte: new Date(agoraMs + 9 * 24 * HORA).toISOString().slice(0, 10) });
  srv.S.sessoes.lid.fator = true;   // a confirmação reforçada já está fresca (a nota "somente pastor" abre direto)
  srv.log = [];
  return srv;
}
// o login: a senha da liderança (matrícula 10) e o PIN do membro (30: responsável por acompanhamentos; 60: quem pede oração)
const LOGIN_LIDERANCA = { "10": { senha: "senha-simulada-dirigente", token: "lid", nome: "Pr. Paulo Dirigente", permissoes: ["cuidado_pastoral", "pessoas"], nivel: "CONGREGACAO", escopo: ["Central"], geral: false } };
const LOGIN_PIN = { "30": "pin30", "60": "pin60" };
async function api(srv, metodo, caminho, consulta, corpo, cabecalhos, urlCompleta) {
  const ok = (c, status = 200) => ({ status, corpo: c });
  const chave = `${metodo} ${caminho}`;
  if (chave === "POST membro/entrar") {
    const t = LOGIN_PIN[String(corpo.matricula)];
    return ok(t && corpo.pin === "1234" ? { sucesso: true, token: t, nome: "Membro Teste", permissoes: [], nivel: null, escopo: null, geral: false, termosPendentes: [] } : { sucesso: false, mensagem: "Matrícula ou PIN incorretos." });
  }
  if (chave === "POST auth/login") {
    const l = LOGIN_LIDERANCA[String(corpo.matricula)];
    return ok(l && corpo.senha === l.senha ? { sucesso: true, token: l.token, nome: l.nome, permissoes: l.permissoes, nivel: l.nivel, escopo: l.escopo, geral: l.geral, termosPendentes: [] } : { sucesso: false, mensagem: "Matrícula ou senha incorretos." });
  }
  if (/^cuidado-pastoral\//.test(caminho)) {
    srv.log.push(`${metodo} ${urlCompleta}`);
    const r = await srv.servidor({ metodo, caminho, consulta, corpo, cabecalhos });
    return r || ok({ sucesso: false, mensagem: "sem imitação" }, 404);
  }
  if (/^GET membros\/\d+\/frequencia$/.test(chave)) return ok({ sucesso: true, membro: { membroId: 20, nome: "Membro Teste", funcao: "Membro", congregacao: "Central", status: "ATIVO" }, assentos: [], resumo: { totalReunioes: 0, totalPresencas: 0, totalFaltas: 0, totalJustificadas: 0, percentualPresenca: null }, historico: [] });
  if (/^GET lgpd\/consentimento\/\d+$/.test(chave)) return ok({ sucesso: true, consentimentos: [] });
  if (/^GET lgpd\/solicitacoes\/\d+$/.test(chave)) return ok({ sucesso: true, solicitacoes: [] });
  if (chave === "GET painel-inicial") return ok({ sucesso: true, blocos: [] });
  if (chave === "GET notificacoes/contagem") return ok({ sucesso: true, total: 0, naoLidas: 0 });
  if (/^GET minha-foto\/\d+$/.test(chave)) return ok({ sucesso: true, fotoUrl: null, consentimentoConcedido: false, menorDeIdade: false });
  if (metodo === "POST") return ok({ sucesso: true, mensagem: "Registrado." });
  return ok({ sucesso: true });
}

function servidorHttp(srv) {
  const s = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const base = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": CSP };
    if (url.pathname.startsWith("/api/")) {
      let bruto = ""; req.on("data", c => { bruto += c; });
      req.on("end", async () => {
        let corpo = null; try { corpo = bruto ? JSON.parse(bruto) : null; } catch (_) { /* corpo vazio */ }
        let r;
        try { r = await api(srv, req.method, url.pathname.replace(/^\/api\//, ""), Object.fromEntries(url.searchParams), corpo, req.headers, url.pathname + url.search); } catch (e) { r = { status: 500, corpo: { sucesso: false, mensagem: "erro na imitação: " + e.message } }; srv.S.erros.push(String(e.stack || e)); }
        res.writeHead(r.status || 200, Object.assign({ "Content-Type": "application/json; charset=utf-8" }, base)); res.end(JSON.stringify(r.corpo));
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
  return new Promise(ok => s.listen(0, "127.0.0.1", () => ok({ s, url: `http://127.0.0.1:${s.address().port}` })));
}

// ---------------------------------------------------------------- o que se mede dentro da página
const RAIZES_DA_TELA = ["#abaCuidadopastoral", "#subMeupainelCuidado"];
const medir = (raizes) => {
  const de = document.documentElement, W = de.clientWidth;
  const vis = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const rolante = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll") return p; } return null; };
  const nome = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}`;
  const ofensores = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el)) continue;
    if (el.closest("#modalOverlay") === null && el.closest("#sidebar")) continue;
    if (el.closest("#toastContainer")) continue;   // o aviso entra deslizando 24 px (animação do sistema): medido no meio da entrada passaria da borda
    const r = el.getBoundingClientRect();
    if (r.right > W + 1) { const p = rolante(el); if (!p || p.getBoundingClientRect().right > W + 1) ofensores.push(`${nome(el)} (${Math.round(r.right)}>${W})`); }
  }
  const lateral = de.scrollWidth > W || document.body.scrollWidth > W;
  const botoesPequenos = [], camposPequenos = [];
  let botoes = 0;
  const lista = raizes.map(s => document.querySelector(s)).filter(r => r && vis(r));
  for (const raiz of lista) {
    for (const el of raiz.querySelectorAll("button, a.cpa-tel, label.cpa-opcao")) {
      if (!vis(el)) continue;
      botoes++;
      const r = el.getBoundingClientRect();
      if (r.height < 43.5) botoesPequenos.push(`${nome(el)} "${(el.textContent || "").trim().slice(0, 24)}" h=${Math.round(r.height)}`);
    }
    for (const el of raiz.querySelectorAll("select, input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea")) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 39.5) camposPequenos.push(`${nome(el)} h=${Math.round(r.height)}`);
    }
  }
  return { rolagemLateral: lateral, scrollW: de.scrollWidth, clientW: W, ofensores: ofensores.slice(0, 6), botoesPequenos: botoesPequenos.slice(0, 6), camposPequenos: camposPequenos.slice(0, 6), botoes };
};

async function rodarViewport(nav, nome, viewport) {
  const srv = criarEstado();
  const http1 = await servidorHttp(srv);
  const base = http1.url;
  const relatorio = { nome, problemas: [], medidas: [], csp: [], erros: [], xss: 0, notas: [] };
  const ctx = await nav.createBrowserContext();
  try {
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
      if (m.rolagemLateral || m.ofensores.length) problema(`${rotulo}: rolagem lateral=${m.rolagemLateral} (scrollW ${m.scrollW} > ${m.clientW}) ofensores=${m.ofensores.join("; ")}`);
      if (m.botoesPequenos.length) problema(`${rotulo}: botão com menos de 44 px de altura: ${m.botoesPequenos.join("; ")}`);
      if (m.camposPequenos.length) problema(`${rotulo}: campo com menos de 40 px de altura: ${m.camposPequenos.join("; ")}`);
      if (!m.botoes) problema(`${rotulo}: nenhum botão visível na tela (a tela não abriu?)`);
    };
    const foto = async (seletor, arq) => { const h = await page.$(seletor); if (h) { try { await h.screenshot({ path: path.join(OUT, `${nome}-${arq}.png`), captureBeyondViewport: true }); } catch (e) { problema(`captura ${arq}: ${e.message.slice(0, 80)}`); } } };
    const calmo = async (ms = 450) => { await new Promise(r => setTimeout(r, ms)); };
    const porTexto = (seletor, texto, escopo) => page.evaluate((s, t, esc) => { const raiz = esc ? document.querySelector(esc) : document; if (!raiz) return false; const el = [...raiz.querySelectorAll(s)].find(x => x.textContent.includes(t) && x.getClientRects().length); if (!el) return false; el.focus(); el.click(); return true; }, seletor, texto, escopo);
    const clicarTexto = async (seletor, texto, escopo) => { const ok = await porTexto(seletor, texto, escopo); if (!ok) problema(`não achei "${texto}" em ${escopo || "a página"}`); await calmo(); return ok; };
    const clicarId = async (id) => { const ok = await page.evaluate((i) => { const el = document.getElementById(i); if (!el || !el.getClientRects().length) return false; el.focus(); el.click(); return true; }, id); if (!ok) problema(`não achei o botão #${id}`); await calmo(); return ok; };
    const preencher = (id, valor) => page.evaluate((i, v) => { const el = document.getElementById(i); if (!el) return false; el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; }, id, valor);
    const marcar = (id) => page.evaluate((i) => { const el = document.getElementById(i); if (!el) return false; el.click(); return true; }, id);
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
    const armazenamento = () => page.evaluate(() => JSON.stringify([Object.assign({}, localStorage), Object.assign({}, sessionStorage)]));
    const semTexto = async (t, onde) => {
      const r = await page.evaluate((x) => ({ corpo: document.documentElement.innerHTML.includes(x), url: location.href.includes(x) }), t);
      const arm = (await armazenamento()).includes(t);
      if (r.corpo || r.url || arm) problema(`${onde}: "${t}" ainda está ${[r.corpo && "na página", r.url && "no endereço", arm && "no armazenamento"].filter(Boolean).join(", ")}`);
    };

    // ===== antes de entrar: a aba e a sub-aba nascem escondidas pelo CSS (sem JavaScript); os telefones de ajuda já estão no HTML
    await page.goto(base + "/", { waitUntil: "load" });
    const nascem = await page.evaluate(() => ["subMeupainelCuidado", "abaCuidadopastoral"].map(id => [id, getComputedStyle(document.getElementById(id)).display]));
    if (nascem.some(([, d]) => d !== "none")) problema(`a aba e a sub-aba deviam nascer escondidas pelo CSS: ${JSON.stringify(nascem)}`);
    const telFixos = await page.evaluate(() => [...document.querySelectorAll("#cpaAjudaFixa a.cpa-tel")].map(a => a.getAttribute("href")));
    if (JSON.stringify(telFixos) !== JSON.stringify(["tel:188", "tel:190", "tel:180", "tel:100"])) problema(`os telefones de ajuda deviam estar no HTML: ${JSON.stringify(telFixos)}`);

    // ================= A LIDERANÇA (senha): Pessoas & Membresia → Cuidado Pastoral
    await entrar("10", "senha-simulada-dirigente");
    await page.evaluate(() => { const c = [...document.querySelectorAll(".card-modulo")].find(x => x.textContent.includes("Pessoas & Membresia")); if (c) c.click(); });
    await calmo();
    await abrirMenuCelular();
    await clicarId("btnAbaCuidadopastoral");
    await esperar(() => document.querySelectorAll("#cpaFilaLista .cpa-cartao").length === 4, "os 4 cartões da fila");
    await calmo(); await medida("Liderança / fila"); await foto("#abaCuidadopastoral", "lideranca-fila");
    const fila = await page.evaluate(() => { const c = [...document.querySelectorAll("#cpaFilaLista .cpa-cartao")]; return { primeiro: c[0] ? c[0].textContent : "", urgente: !!document.querySelector("#cpaFilaLista .cpa-cartao-urgente"), vencido: !!document.querySelector("#cpaFilaLista .cpa-vencido"), filtros: document.getElementById("cpaFiltroCong").options.length }; });
    if (!/URGENTE/.test(fila.primeiro) || !/SEM RESPONSÁVEL/.test(fila.primeiro) || !fila.urgente || !fila.vencido || fila.filtros < 2) problema(`a fila devia mostrar o urgente primeiro (SEM RESPONSÁVEL), o vencido e os filtros: ${JSON.stringify(fila).slice(0, 300)}`);
    // abrir acompanhamento (o formulário)
    await clicarTexto("button", "➕ Abrir acompanhamento", "#cpaFilaCx");
    await esperar(() => document.getElementById("cpaNovoTipo"), "o formulário de abrir acompanhamento");
    await calmo(); await conferirFoco("cpaNovoTipo", "abrir o formulário");
    await page.select("#cpaNovoTipo", "VISITANTE"); await marcar("cpaNovoCadNao"); await calmo(200);
    await medida("Liderança / abrir acompanhamento (visitante)"); await foto("#cpaNovoCx", "lideranca-abrir");
    await preencher("cpaNovoNome", "Visitante do Navegador"); await preencher("cpaNovoContato", "(91) 98877-6655"); await preencher("cpaNovoMotivo", "Visitou no domingo com a esposa");
    await clicarId("cpaNovoBotao");
    await esperar(() => document.getElementById("cpaNovoCx").innerHTML === "" && /Visitante do Navegador/.test(document.getElementById("cpaFilaLista").textContent), "o novo acompanhamento na fila");
    await calmo();
    // o detalhe do acompanhamento (Maria: detectada, vencida, subiu para a Área)
    await page.evaluate(() => { const c = [...document.querySelectorAll("#cpaFilaLista .cpa-cartao")].find(x => x.textContent.includes("Maria Afastada")); const b = c && [...c.querySelectorAll("button")].find(x => x.textContent.includes("Abrir acompanhamento")); if (b) { b.focus(); b.click(); } });
    await esperar(() => document.getElementById("cpaDetTitulo") && document.getElementById("cpaNotasCx") && document.getElementById("cpaNotasCx").innerHTML !== "", "o detalhe do acompanhamento");
    await calmo(); await conferirFoco("cpaDetTitulo", "abrir o acompanhamento");
    await medida("Liderança / detalhe do acompanhamento"); await foto("#cpaDetalheGesCx", "lideranca-detalhe");
    const tel = await page.evaluate(() => [...document.querySelectorAll("#cpaDetalheGes a")].map(a => a.getAttribute("href")).filter(h => /^tel:/.test(h)));
    if (!tel.length || !tel.every(h => /^tel:\d{8,13}$/.test(h))) problema(`o telefone do acompanhado devia virar link tel: só com algarismos: ${JSON.stringify(tel)}`);
    // registrar contato (visita: a regra "nunca a sós")
    await clicarTexto("button", "Registrar contato", "#cpaDetalheGes");
    await esperar(() => document.getElementById("cpaFcForma"), "o formulário do contato");
    await calmo(); await conferirFoco("cpaFcForma", "abrir o formulário do contato");
    await page.select("#cpaFcForma", "VISITA_LAR"); await calmo(200);
    const regra = await page.evaluate(() => getComputedStyle(document.getElementById("cpaFcRegra")).display);
    if (regra === "none") problema("visita no lar devia mostrar a regra 'visita nunca a sós'");
    await medida("Liderança / registrar contato (visita)"); await foto("#cpaFormAcao", "lideranca-contato");
    await marcar("cpaFcSim"); await preencher("cpaFcAcompanhante", "Irmã Rute"); await preencher("cpaFcObs", "Visitamos e oramos juntos");
    await clicarId("cpaFormBotao");
    await esperar(() => /Contato registrado/.test(document.getElementById("cpaDetalheGesMsg").textContent) && !document.getElementById("cpaFcForma"), "o contato registrado");
    await calmo();
    // a nota pastoral: a lista não traz o texto; aberta (só por textContent), fechada (o texto sai da página)
    const notasNaLista = await page.evaluate(() => document.querySelectorAll("#cpaNotasCx li.cpa-nota").length);
    if (notasNaLista < 2) problema(`a lista de notas devia ter as notas que o Dirigente pode ler: ${notasNaLista}`);
    await semTexto("NOTA-MINHA-DDD", "a lista de notas (antes de abrir)");
    await page.evaluate(() => { const li = [...document.querySelectorAll("#cpaNotasCx li.cpa-nota")].find(x => x.textContent.includes("(você)")); const b = li && [...li.querySelectorAll("button")].find(x => x.textContent.includes("Abrir a nota")); if (b) { b.focus(); b.click(); } });
    await esperar(() => /NOTA-MINHA-DDD/.test(document.getElementById("cpaNotaCorpo").textContent), "a nota aberta");
    await calmo(); await conferirFoco("cpaNotaCx", "abrir a nota");
    await medida("Liderança / nota pastoral aberta"); await foto("#cpaNotasCx", "lideranca-nota");
    await clicarId("cpaNotaFechar");
    await calmo(); await conferirFoco("cpaNotasTitulo", "fechar a nota");
    await semTexto("NOTA-MINHA-DDD", "depois de fechar a nota");
    // escrever nota (o formulário)
    await clicarTexto("button", "Escrever nota", "#cpaNotasCx");
    await esperar(() => document.getElementById("cpaFnNivel"), "o formulário da nota");
    await calmo(); await medida("Liderança / escrever nota"); await foto("#cpaNotaForm", "lideranca-escrever-nota");
    await clicarTexto("button", "Fechar", "#cpaNotaForm");
    // voltar à fila: o foco volta ao botão de onde veio
    await clicarTexto("button", "Voltar à fila", "#cpaDetalheGesCx");
    await calmo();
    // (o contato registrado releu a fila: o botão do cartão de onde veio é outro, e o foco vai para o título da fila)
    const voltou = await page.evaluate(() => { const a = document.activeElement; return { detalhe: document.getElementById("cpaDetalheGes").innerHTML === "", foco: !!a && (a.id === "cpaFilaTitulo" || a.textContent.includes("Abrir acompanhamento")), focoEm: a ? (a.id || a.tagName) : "" }; });
    if (!voltou.detalhe || !voltou.foco) problema(`voltar à fila devia esvaziar o detalhe e levar o foco ao título da fila (ou ao botão do cartão): ${JSON.stringify(voltou)}`);
    // os pedidos de oração e o sinal de risco
    await clicarId("btnCpaSecaoPedidos");
    await esperar(() => document.querySelectorAll("#cpaPedLista .cpa-pedido").length >= 2, "os pedidos esperando moderação");
    await calmo(); await medida("Liderança / pedidos esperando"); await foto("#cpaSecaoPedidos", "lideranca-pedidos");
    await clicarTexto("button", "Publicar no boletim", "#cpaPedLista");
    await esperar(() => document.getElementById("cpaPubTexto") && document.getElementById("cpaPubTexto").value.length > 10, "a linha sugerida do boletim");
    await calmo(); await conferirFoco("cpaPubTexto", "abrir o publicar"); await medida("Liderança / publicar no boletim");
    await clicarTexto("button", "Fechar", "#cpaPedLista");
    await clicarId("btnCpaPedRisco");
    await esperar(() => document.querySelector("#cpaPedLista .cpa-pedido-risco"), "o pedido com sinal de risco");
    await calmo(); await medida("Liderança / sinal de risco"); await foto("#cpaSecaoPedidos", "lideranca-risco");
    const risco = await page.evaluate(() => { const c = document.querySelector("#cpaPedLista .cpa-pedido-risco"); return { atenda: /Atenda agora/.test(c.textContent), tels: [...c.querySelectorAll("a.cpa-tel")].map(a => a.getAttribute("href")), protecao: /Proteção de Crianças/.test(c.textContent), publicar: /Publicar/.test(c.textContent) }; });
    if (!risco.atenda || JSON.stringify(risco.tels) !== JSON.stringify(["tel:188", "tel:190", "tel:180", "tel:100"]) || !risco.protecao || risco.publicar) problema(`o cartão do risco devia dizer "Atenda agora", com os 4 telefones, a Proteção de Crianças e sem Publicar: ${JSON.stringify(risco)}`);
    // as outras duas pílulas: no boletim e todos
    await clicarId("btnCpaPedAprovados");
    await esperar(() => document.getElementById("btnCpaPedAprovados").getAttribute("aria-pressed") === "true" && document.querySelectorAll("#cpaPedLista .cpa-pedido").length >= 1 && !/Carregando/.test(document.getElementById("cpaPedMsg").textContent), "os pedidos no boletim");
    await calmo(); await medida("Liderança / pedidos no boletim");
    await clicarId("btnCpaPedTodos");
    await esperar(() => document.getElementById("btnCpaPedTodos").getAttribute("aria-pressed") === "true" && document.querySelectorAll("#cpaPedLista .cpa-pedido").length >= 4 && !/Carregando/.test(document.getElementById("cpaPedMsg").textContent), "todos os pedidos");
    await calmo(); await medida("Liderança / todos os pedidos");
    await clicarTexto("button", "Registrar pedido recebido em mãos", "#cpaSecaoPedidos");
    await esperar(() => document.getElementById("cpaRpCong"), "o formulário do pedido recebido em mãos");
    await calmo(); await conferirFoco("cpaRpCong", "abrir o pedido em mãos"); await marcar("cpaRpCadNao"); await calmo(200);
    await medida("Liderança / pedido recebido em mãos"); await foto("#cpaRegPedCx", "lideranca-em-maos");
    await clicarTexto("button", "Fechar", "#cpaRegPedCx");
    // o boletim e a impressão
    await clicarId("btnCpaSecaoBoletim");
    await esperar(() => /Vila Nova/.test(document.getElementById("cpaBolImprimivel").textContent), "o boletim de oração");
    await calmo(); await medida("Liderança / boletim"); await foto("#cpaSecaoBoletim", "lideranca-boletim");
    await clicarTexto("button", "Imprimir", "#cpaSecaoBoletim");
    // a classe fica até o navegador avisar que acabou de imprimir (afterprint: no celular a folha é montada depois de o print() voltar)
    const imp = await page.evaluate(() => ({ lista: window.__impressoes.slice(), depois: document.body.className }));
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    const depoisDoAfterprint = await page.evaluate(() => document.body.className);
    if (imp.lista.length !== 1 || !/cpa-imprimindo/.test(imp.lista[0]) || !/cpa-imprimindo/.test(imp.depois) || /cpa-imprimindo/.test(depoisDoAfterprint))
      problema(`imprimir devia pôr a classe cpa-imprimindo antes do window.print() e tirá-la só no afterprint: ${JSON.stringify(Object.assign(imp, { depoisDoAfterprint }))}`);
    await page.emulateMediaType("print");
    await page.evaluate(() => document.body.classList.add("cpa-imprimindo"));
    const iso = await page.evaluate(() => { const v = (s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).visibility : "ausente"; }; return { boletim: v("#cpaBolImprimivel li"), menu: v("#sidebar"), pilulas: v("#cpaPilulas") }; });
    await page.evaluate(() => document.body.classList.remove("cpa-imprimindo"));
    await page.emulateMediaType("screen");
    if (iso.boletim !== "visible" || iso.menu === "visible" || iso.pilulas === "visible") problema(`na impressão só o boletim devia aparecer: ${JSON.stringify(iso)}`);
    // o painel (a tabela rola dentro da caixa, não a página)
    await clicarId("btnCpaSecaoPainel");
    await esperar(() => document.querySelector("#cpaPainelLista .cpa-rolagem table"), "a tabela do painel");
    await calmo(); await medida("Liderança / painel"); await foto("#cpaSecaoPainel", "lideranca-painel");
    // sair da aba: a fila e os pedidos saem da página
    await clicarId("btnCpaSecaoFila");
    await esperar(() => document.querySelectorAll("#cpaFilaLista .cpa-cartao").length >= 4, "a fila de novo");
    await abrirMenuCelular();
    await clicarTexto("button", "Painel Principal", "#sidebar");
    const saida = await page.evaluate(() => ({ fila: document.getElementById("cpaFilaLista").innerHTML === "", pedidos: document.getElementById("cpaPedLista").innerHTML === "", aba: getComputedStyle(document.getElementById("abaCuidadopastoral")).display }));
    if (!saida.fila || !saida.pedidos || saida.aba !== "none") problema(`sair da aba devia esvaziar a fila e os pedidos: ${JSON.stringify(saida)}`);
    await semTexto("Maria Afastada", "depois de sair da aba");

    // ================= O MEMBRO POR PIN (o diácono 30, responsável): Meu Painel → Cuidado
    await entrar("30", "1234");
    await abrirMenuCelular();
    await clicarId("btnSubMeupainelCuidado");
    await esperar(() => document.querySelectorAll("#cpaMeusLista .cpa-cartao").length >= 2 && document.getElementById("cpaPoTexto"), "Meus acompanhamentos e o pedido de oração");
    await calmo(); await medida("Meu Painel / Cuidado"); await foto("#subMeupainelCuidado", "meupainel-cuidado");
    const ajuda = await page.evaluate(() => [...document.querySelectorAll("#cpaAjudaFixa a.cpa-tel")].map(a => a.getAttribute("href")));
    if (JSON.stringify(ajuda) !== JSON.stringify(["tel:188", "tel:190", "tel:180", "tel:100"])) problema(`os telefones de ajuda (188, 190, 180, 100) deviam continuar embaixo do pedido: ${JSON.stringify(ajuda)}`);
    const ajudaVisivel = await page.evaluate(() => { const el = document.getElementById("cpaAjudaFixa"); const r = el.getBoundingClientRect(); return r.height > 0 && getComputedStyle(el).display !== "none"; });
    if (!ajudaVisivel) problema("o bloco dos telefones de ajuda devia estar à vista no Meu Painel");
    await page.evaluate(() => { const c = [...document.querySelectorAll("#cpaMeusLista .cpa-cartao")].find(x => x.textContent.includes("Maria Afastada")); const b = c && [...c.querySelectorAll("button")].find(x => x.textContent.includes("Abrir acompanhamento")); if (b) { b.focus(); b.click(); } });
    await esperar(() => document.getElementById("cpaDetTitulo") && document.querySelector("#cpaDetalheMeu #cpaNotasCx li.cpa-nota"), "o detalhe no Meu Painel");
    await calmo(); await conferirFoco("cpaDetTitulo", "abrir o acompanhamento no Meu Painel");
    await medida("Meu Painel / detalhe do acompanhamento"); await foto("#cpaDetalheMeuCx", "meupainel-detalhe");
    const semGestao = await page.evaluate(() => !/Trocar responsável|Adiar prazo/.test(document.getElementById("cpaDetalheMeu").textContent));
    if (!semGestao) problema("o responsável por PIN não pode ter Trocar responsável nem Adiar prazo");
    await clicarTexto("button", "Voltar", "#cpaDetalheMeuCx");
    await calmo();
    // pedir oração com sinal de risco: a resposta do servidor, os telefones e o foco nela
    await page.select("#cpaPoCategoria", "ESPIRITUAL");
    await page.click("#cpaPoTexto"); await page.type("#cpaPoTexto", "Não aguento mais, quero morrer.", { delay: 15 });
    const contador = await texto("#cpaPoContador");
    if (contador !== String("Não aguento mais, quero morrer.".length)) problema(`o contador devia acompanhar o que se digita: ${contador}`);
    await marcar("cpaPoBolNao");
    await medida("Meu Painel / pedido de oração preenchido"); await foto("#cpaOracaoForm", "meupainel-oracao");
    await clicarId("cpaPoBotao");
    await esperar(() => document.querySelector("#cpaOracaoResultado .cpa-risco-resposta"), "a resposta do sinal de risco");
    await calmo(); await conferirFoco("cpaOracaoResultado", "a resposta do risco");
    await medida("Meu Painel / resposta do sinal de risco"); await foto("#cpaOracaoResultado", "meupainel-risco");
    const resp = await page.evaluate(() => { const c = document.getElementById("cpaOracaoResultado"); return { alerta: !!c.querySelector("[role=alert]"), tels: [...c.querySelectorAll("a.cpa-tel")].length, campo: document.getElementById("cpaPoTexto").value }; });
    if (!resp.alerta || resp.tels !== 4 || resp.campo !== "") problema(`a resposta do risco devia ser alerta com os 4 telefones e o campo vazio: ${JSON.stringify(resp)}`);
    // pedir visita (o formulário)
    await preencher("cpaPvMotivo", "Saí do hospital e queria uma oração em casa"); await marcar("cpaPvHospital");
    await clicarId("cpaPvBotao");
    await esperar(() => /Pedido de visita recebido/.test(document.getElementById("cpaVisitaResultado").textContent), "a visita recebida");
    await calmo(); await medida("Meu Painel / visita pedida");
    // sair da sub-aba: o que a pessoa escrevia sai da página
    await preencher("cpaPoTexto", "TEXTO-DIGITADO-NAVEGADOR");
    await abrirMenuCelular();
    await clicarId("btnSubMeupainelPerfil");
    await calmo();
    await semTexto("TEXTO-DIGITADO-NAVEGADOR", "depois de sair da sub-aba");
    await semTexto("Maria Afastada", "depois de sair da sub-aba");
    relatorio.xss = await page.evaluate(() => (window.__xssLista || []).length).catch(() => -1);
    relatorio.cspVioladas = await page.evaluate(() => window.__cspLista).catch(() => []);
  } catch (e) {
    relatorio.problemas.push("EXCEÇÃO: " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
  } finally {
    relatorio.cspVioladas = relatorio.cspVioladas || [];
    // nome, nota e pedido nunca vão em endereço
    const urlsComDado = srv.log.filter(l => /Maria|Carla|NOTA-|morrer|hospital|Navegador/i.test(decodeURIComponent(l)));
    if (urlsComDado.length) relatorio.problemas.push(`dado pessoal em endereço pedido ao servidor: ${urlsComDado.slice(0, 2).join(" ; ")}`);
    if (srv.S.erros.length) relatorio.problemas.push(`o servidor imitado teve erro interno: ${srv.S.erros[0].slice(0, 200)}`);
    if (srv.consultasSemImitacao.length) relatorio.problemas.push(`consulta sem imitação: ${srv.consultasSemImitacao[0]}`);
    relatorio.pedidos = srv.log.length;
    await ctx.close().catch(() => {});
    http1.s.close();
  }
  return relatorio;
}

(async () => {
  let nav = null;
  const resultados = [];
  try {
    nav = await puppeteer.launch({
      executablePath: EDGE, headless: true, userDataDir: path.join(os.tmpdir(), "cpa-edge-" + Date.now()),
      // --disable-gpu é OBRIGATÓRIO nesta máquina (tela azul 0x10E pela memória de vídeo em 19/10/2026)
      args: ["--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync", "--lang=pt-BR"],
      protocolTimeout: 180000
    });
    // cada largura tem o seu servidor imitado (estado limpo); a 390 e a 1280 px
    const larguras = [["390", { width: 390, height: 844, isMobile: true, deviceScaleFactor: 1 }], ["1280", { width: 1280, height: 900, deviceScaleFactor: 1 }]];
    for (const [nome, vp] of larguras) resultados.push(await rodarViewport(nav, nome, vp));
  } finally {
    if (nav) await nav.close().catch(() => {});
  }
  let falhou = false;
  for (const r of resultados) {
    console.log(`\n=== ${r.nome} px ===`);
    console.log(`medidas: ${r.medidas.length} (sem rolagem lateral, botões ≥ 44 px e campos ≥ 40 px: ${r.medidas.filter(m => !m.rolagemLateral && !m.ofensores.length && !m.botoesPequenos.length && !m.camposPequenos.length).length}; botões medidos: ${r.medidas.reduce((s, m) => s + m.botoes, 0)})`);
    console.log(`violações de CSP: ${r.csp.length + r.cspVioladas.length} · código do ataque executado: ${r.xss} · erros de JavaScript/console: ${r.erros.length} · pedidos à API imitada: ${r.pedidos}`);
    r.notas.forEach(x => console.log("  " + x));
    r.csp.slice(0, 5).forEach(x => console.log("  CSP: " + x)); r.cspVioladas.slice(0, 5).forEach(x => console.log("  CSP(evento): " + x));
    r.erros.slice(0, 8).forEach(x => console.log("  erro: " + x.replace(/\n/g, " | ")));
    r.problemas.forEach(x => console.log("  ✗ " + x));
    if (r.problemas.length || r.csp.length || r.cspVioladas.length || r.xss !== 0 || r.erros.length) falhou = true;
  }
  if (resultados.length !== 2) falhou = true;
  console.log(`\ncapturas em ${OUT}`);
  console.log(falhou ? "\nRESULTADO: com problemas" : "\nRESULTADO: limpo");
  process.exit(falhou ? 1 : 0);
})();
