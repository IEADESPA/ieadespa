// Cobertor de navegador: Edge headless (puppeteer-core) + instrumento. Executa ações (caminho de passos + passo final gravado) cada uma numa
// janela anônima nova (sem estado herdado), e faz a exploração sistemática (descoberta em largura) que gera o PLANO a partir da versão ORIGINAL.
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");
const { instrumento } = require("./instrumento");

// Navegador: Edge nesta máquina (Windows); no CI (Linux, vD.1) o Chrome do runner — `NAVEGADOR=<caminho>` manda em ambos.
const CANDIDATOS_NAVEGADOR = [
  process.env.NAVEGADOR,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium"
].filter(Boolean);
const EDGE = CANDIDATOS_NAVEGADOR.find((p) => { try { return fs.existsSync(p); } catch (_) { return false; } }) || CANDIDATOS_NAVEGADOR[0];
const AQUI = __dirname;

const PERFIS = {
  // sem sessão: portaria, entrada, código por e-mail e criação do PIN; para no PIN criado (o painel do membro é coberto pelo perfil "membro")
  anonimo: { pagina: "index.html", login: null, profundidade: 5 },
  geral: { pagina: "index.html", login: { matricula: "5", segredo: "senha-simulada-geral" } },   // senha (não é PIN de 4 números): vai direto a /api/auth/login
  membro: { pagina: "index.html", login: { matricula: "20", segredo: "1234" } }                  // PIN: /api/membro/entrar
};
// sessão que o login pelo formulário deixa no sessionStorage (a ação de entrada de cada perfil passa pelo formulário de verdade; as demais começam
// com a sessão já gravada e clicam em "Acessar meu Painel" — mesmo estado, um pedido a menos)
function sessaoGravada(perfil, permissoes) {
  if (perfil === "geral") return { authToken: "tok-geral-simulado", authNome: "Líder Geral Teste", authPermissoes: JSON.stringify(permissoes), authMatricula: "5", authNivel: "GLOBAL", authGeral: "1" };
  if (perfil === "membro") return { authToken: "tok-membro-simulado", authNome: "Membro Teste", authPermissoes: "[]", authMatricula: "20", authGeral: "0" };
  return null;
}

// arquivos de teste para campos de arquivo
function arquivosDeTeste() {
  const dir = path.join(AQUI, "arquivos-teste");
  fs.mkdirSync(dir, { recursive: true });
  const pdf = path.join(dir, "documento-teste.pdf");
  if (!fs.existsSync(pdf)) fs.writeFileSync(pdf, "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  const png = path.join(dir, "imagem-teste.png");
  if (!fs.existsSync(png)) fs.writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  const xlsx = path.join(dir, "pessoas-teste.xlsx");
  if (!fs.existsSync(xlsx)) gerarPlanilhaPessoas(xlsx);
  const txt = path.join(dir, "texto-teste.txt");
  if (!fs.existsSync(txt)) fs.writeFileSync(txt, "arquivo de teste\n");
  return { pdf, png, xlsx, txt };
}
// planilha .xlsx de verdade, gerada com o SheetJS que o próprio app usa (vendor). Linhas: matrícula que já existe (101), nome igual a quem já existe
// (Nome B, matrícula nova) e uma pessoa nova — os três caminhos da revisão de importação.
function gerarPlanilhaPessoas(destino, pastaApp) {
  const XLSX = require(path.join(pastaApp || path.join(AQUI, "original", "app"), "vendor", "xlsx.full.min.js"));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([["Matrícula", "Nome", "Situação"], [101, "Nome A da Planilha", "EM_COMUNHAO"], [555, "Nome B", "EM_COMUNHAO"], [777, "Maria da Silva Teste", "CONGREGADO"]]);
  XLSX.utils.book_append_sheet(wb, ws, "Pessoas");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  fs.writeFileSync(destino, buf);
}
function arquivoPara(accept, id, arqs) {
  const a = (accept || "") + " " + (id || "");
  if (/sheet|xlsx|xls|excel|csv/i.test(a)) return arqs.xlsx;
  if (/pdf/i.test(a)) return arqs.pdf;
  if (/image|png|jpe?g|foto/i.test(a)) return arqs.png;
  if (/text|txt/i.test(a)) return arqs.txt;
  return arqs.pdf;
}

async function abrirNavegador(perfilDir, opcoes = {}) {
  fs.mkdirSync(perfilDir, { recursive: true });
  return puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    userDataDir: perfilDir,
    args: [
      // local: nada sai para a internet (fontes do Google falham na hora, igual nas duas versões); remoto: o front vem do endereço real
      ...(opcoes.remoto ? [] : ["--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"]),
      "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync", "--disable-component-update",
      "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
      "--disable-features=Translate,EdgeCollections,msEdgeShopping,AutofillServerCommunication",
      "--lang=pt-BR"
    ],
    // vD.6: --celular = janela de celular (360×740, como a revisão do Meu Painel do membro em 07/10/2026); o retrato
    // de cada ação passa a trazer a rolagem lateral da página (ver instrumento.js, R.retrato), que vira divergência
    defaultViewport: opcoes.celular ? { width: 360, height: 740, isMobile: true, hasTouch: false, deviceScaleFactor: 1 } : { width: 1366, height: 900 },
    protocolTimeout: 120000
  });
}

const ehContextoDestruido = (e) => /Execution context was destroyed|Cannot find context|detached|Target closed|navigat/i.test(String(e && e.message));

class Sessao {
  constructor(nav, srv, modelo, arqs, acaoId) { this.nav = nav; this.srv = srv; this.modelo = modelo; this.arqs = arqs; this.acaoId = String(acaoId).replace(/[^\x20-\x7e]/g, "_"); this.navegacoes = 0; this.popups = []; this.problemas = []; }
  async abrir(perfil, paginaExtra) {
    // contexto do trabalhador (reaproveita o cache HTTP do script de 1,2 MB); sem ele, um contexto anônimo só desta ação
    if (this.ctxTrabalhador) { this.ctx = this.ctxTrabalhador; this.ctxProprio = false; }
    else { this.ctx = await this.nav.createBrowserContext(); this.ctxProprio = true; }
    this.page = await this.ctx.newPage();
    const page = this.page;
    page.setDefaultTimeout(30000);
    if (this.srv.remoto) await this.interceptarApi(page);
    else await page.setExtraHTTPHeaders({ "x-acao": this.acaoId });
    if (paginaExtra) this.paginaExtra = paginaExtra;
    await page.evaluateOnNewDocument(instrumento, { modelo: this.modelo, guardarBlobs: !!this.guardarBlobs });
    this.sessaoPronta = this.loginRapido ? sessaoGravada(perfil, this.modelo.permissoes) : null;
    if (this.sessaoPronta) await page.evaluateOnNewDocument((s) => { if (!sessionStorage.getItem("__sessaoTeste")) { for (const k in s) sessionStorage.setItem(k, s[k]); sessionStorage.setItem("__sessaoTeste", "1"); } }, this.sessaoPronta);
    page.on("popup", (p) => { this.popups.push(String(p.url()).replace(this.srv.url, "ORIGEM")); p.close().catch(() => {}); });
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) this.navegacoes++; });
    page.on("dialog", (d) => { this.problemas.push("dialogo nativo: " + d.message()); d.dismiss().catch(() => {}); });
    await page.goto(this.srv.url + "/" + (this.paginaExtra || PERFIS[perfil].pagina), { waitUntil: "load" });
    this.navegacoes = 0;
    await this.calmo();
  }
  // MODO REMOTO: todo pedido a /api/* (de qualquer endereço) é segurado no navegador e respondido pela API simulada — nada chega à API de verdade.
  // Usa o domínio Fetch do protocolo com padrão só de /api (a interceptação geral do puppeteer desligaria o cache e baixaria o script a cada ação).
  async interceptarApi(page) {
    await page.setBypassServiceWorker(true);
    const cdp = await page.createCDPSession();
    this.cdp = cdp;
    cdp.on("Fetch.requestPaused", async (ev) => {
      try {
        let bruto = ev.request.postData || "";
        if (!bruto && ev.request.hasPostData) { try { bruto = (await cdp.send("Fetch.getRequestPostData", { requestId: ev.requestId })).postData || ""; } catch (_) {} }
        const r = this.srv.responder(this.acaoId, ev.request.method, ev.request.url, bruto);
        await cdp.send("Fetch.fulfillRequest", { requestId: ev.requestId, responseCode: r.status, responseHeaders: Object.entries(r.cabecalhos).map(([name, value]) => ({ name, value })), body: Buffer.from(r.corpo, "utf8").toString("base64") });
      } catch (e) {
        this.problemas.push("interceptação: " + String(e && e.message).slice(0, 120));
        try { await cdp.send("Fetch.failRequest", { requestId: ev.requestId, errorReason: "BlockedByClient" }); } catch (_) {}
      }
    });
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/*", requestStage: "Request" }] });
  }
  async avaliar(fn, ...args) {
    for (let t = 0; t < 3; t++) {
      try { return await this.page.evaluate(fn, ...args); } catch (e) {
        if (!ehContextoDestruido(e)) throw e;
        this.problemas.push("contexto trocado (navegação) durante avaliação");
        await this.page.waitForFunction(() => window.__reg && document.readyState === "complete", { timeout: 15000 }).catch(() => {});
      }
    }
    throw new Error("página não estabilizou após navegação");
  }
  async calmo(maxMs = 8000) {
    const r = await this.avaliar((m) => window.__reg.esperarCalmo(m, 60), maxMs);
    if (!r.estavel) this.instavel = (this.instavel || 0) + 1;
    return r;
  }
  async login(perfil) {
    const l = PERFIS[perfil].login;
    if (!l) return true;
    const a = await this.avaliar(() => window.__reg.passoLogin(1));
    await this.calmo();
    if (this.sessaoPronta) return a;
    const b = await this.avaliar((m, s) => window.__reg.passoLogin(2, m, s), l.matricula, l.segredo);
    await this.calmo();
    return a && b;
  }
  // um passo: preenche campos, anexa arquivos nos campos de arquivo vazios, age no alvo, espera acalmar, confirma modais de confirmação do app
  async passo(p) {
    const ehArquivoAlvo = p.tipo === "file";
    let arquivos;
    if (!ehArquivoAlvo) {
      // caminho rápido: tudo numa ida só ao navegador
      let r;
      try { r = await this.page.evaluate((a, e) => window.__reg.passoInteiro(a, e, false, 8000), p.alvo, p.evento); }
      catch (e) {
        if (!ehContextoDestruido(e)) throw e;
        // a ação navegou (ex.: formulário enviado sem preventDefault): espera a página nova e segue
        this.problemas.push("a página navegou durante o passo");
        await this.page.waitForFunction(() => window.__reg && document.readyState === "complete", { timeout: 15000 }).catch(() => {});
        await this.calmo();
        return { achado: true, confirmacoes: [] };
      }
      if (!r.arquivos) { this.instavel = (this.instavel || 0) + (r.instavel || 0); return r; }
      arquivos = r.arquivos;
    } else arquivos = await this.avaliar(() => window.__reg.preencher());
    for (const a of arquivos) {
      if (ehArquivoAlvo && a.tag === p.alvo.tag && a.rotulo === p.alvo.rotulo && a.ord === p.alvo.ord) continue;
      const h = await this.page.evaluateHandle((x) => window.__reg.localizar(x), a);
      const el = h.asElement();
      if (el) { await el.uploadFile(arquivoPara(a.accept, a.id, this.arqs)).catch(() => {}); }
      await h.dispose();
    }
    if (arquivos.length) await this.calmo();
    let info;
    if (ehArquivoAlvo && (p.evento === "change" || p.evento === "input")) {
      const h = await this.page.evaluateHandle((x) => window.__reg.localizar(x), p.alvo);
      const el = h.asElement();
      if (!el) info = { achado: false };
      else {
        const acc = await this.page.evaluate((e) => (e.getAttribute("accept") || "") + " " + e.id, el);
        await el.uploadFile(arquivoPara(acc, "", this.arqs));
        info = { achado: true };
      }
      await h.dispose();
    } else {
      // depois de anexar os arquivos: o resto do passo numa ida só, sem preencher de novo
      try {
        const r = await this.page.evaluate((a, e) => window.__reg.passoInteiro(a, e, true, 8000), p.alvo, p.evento);
        this.instavel = (this.instavel || 0) + (r.instavel || 0);
        return r;
      } catch (e) {
        if (!ehContextoDestruido(e)) throw e;
        this.problemas.push("a página navegou durante o passo");
        await this.page.waitForFunction(() => window.__reg && document.readyState === "complete", { timeout: 15000 }).catch(() => {});
        await this.calmo();
        return { achado: true, confirmacoes: [] };
      }
    }
    if (!info.achado) return info;
    await this.calmo();
    info.confirmacoes = [];
    for (let k = 0; k < 3; k++) {
      const t = await this.avaliar(() => window.__reg.confirmarModal());
      if (t === null) break;
      info.confirmacoes.push(t);
      await this.calmo();
    }
    return info;
  }
  async fechar() {
    if (this.ctxProprio) { try { await this.ctx.close(); } catch (_) {} return; }
    // contexto reaproveitado: apaga tudo que a página guardou (localStorage, IndexedDB, cookies...) — só o cache HTTP fica
    try {
      const c = await this.page.createCDPSession();
      await c.send("Storage.clearDataForOrigin", { origin: this.srv.url, storageTypes: "cookies,file_systems,indexeddb,local_storage,shader_cache,websql,service_workers,cache_storage" });
      await c.detach();
    } catch (_) {}
    try { await this.page.close(); } catch (_) {}
  }
}

// executa UMA ação do plano e devolve o transcrito do passo final
async function executarAcao(nav, srv, modelo, arqs, acao, opcoes = {}) {
  const s = new Sessao(nav, srv, modelo, arqs, acao.id + "@" + (opcoes.rotulo || ""));
  if (opcoes.ctx) s.ctxTrabalhador = opcoes.ctx;
  s.loginRapido = !!acao.alvo; // a ação de entrada (sem alvo) sempre entra pelo formulário
  const tr = { id: acao.id, perfil: acao.perfil, alvo: acao.alvo ? `${acao.alvo.tag} "${acao.alvo.rotulo}" #${acao.alvo.ord} (${acao.evento})` : "(entrada)", caminho: (acao.caminho || []).map(p => `${p.alvo.tag} "${p.alvo.rotulo}" #${p.alvo.ord} (${p.evento})`) };
  const ini = Date.now();
  try {
    const tempos = tr.tempos = {};
    let tt = Date.now();
    const marcarTempo = (k) => { tempos[k] = Date.now() - tt; tt = Date.now(); };
    await s.abrir(acao.perfil);
    marcarTempo("abrir");
    const raiz = !acao.alvo;
    if (raiz) { await s.avaliar(() => window.__reg.zerar()); }
    const marcaLogin = srv.marca();
    const okLogin = await s.login(acao.perfil);
    if (!okLogin && acao.perfil !== "anonimo") tr.loginFalhou = true;
    marcarTempo("login");
    for (let i = 0; i < (acao.caminho || []).length; i++) {
      const r = await s.passo(acao.caminho[i]);
      if (!r.achado) { tr.caminhoQuebrado = i; break; }
    }
    marcarTempo("caminho");
    let marca = marcaLogin;
    if (!raiz && tr.caminhoQuebrado === undefined) {
      await s.avaliar(() => window.__reg.zerar());
      s.instavel = 0;
      marca = srv.marca();
      const navAntes = s.navegacoes;
      tr.manipuladorNoAlvo = await s.avaliar((a) => window.__reg.manipuladorDe(a), acao.alvo);
      const r = await s.passo({ alvo: acao.alvo, evento: acao.evento, tipo: acao.tipo });
      tr.achado = r.achado;
      tr.valido = r.valido;
      tr.confirmacoes = r.confirmacoes || [];
      tr.navegou = s.navegacoes - navAntes;
    }
    marcarTempo("final");
    if (tr.caminhoQuebrado === undefined) {
      // janelas de impressão: o print() vem 300 ms depois; o calmo já esperou os temporizadores curtos
      const fim = await s.avaliar(() => ({ c: Object.assign(window.__reg.coletar(), { cspTotal: window.__reg.cspTotal.slice() }), r: window.__reg.retrato(), k: window.__reg.controles() }));
      Object.assign(tr, fim.c);
      tr.retrato = fim.r;
      tr.controlesDepois = fim.k;
      if (opcoes.htmlJanelas && tr.janelas && tr.janelas.length) tr.htmlJanelas = await s.avaliar(() => window.__reg.janelas.map((_, i) => window.__reg.htmlJanela(i)));
    }
    marcarTempo("coleta");
    tr.api = srv.chamadasDe(s.acaoId, marca).map(c => `${c.metodo} ${c.rota}${c.corpo ? " " + c.corpo : ""}`);
    tr.instavel = s.instavel || 0;
    tr.popups = s.popups;
    tr.problemas = s.problemas;
  } catch (e) {
    tr.falhaDoEquipamento = String(e && e.message || e).slice(0, 300);
  } finally {
    await s.fechar();
    srv.esquecer(s.acaoId);
  }
  tr.ms = Date.now() - ini;
  return tr;
}

// fila com N trabalhadores
async function emParalelo(itens, n, fn, aoTerminar) {
  const res = new Array(itens.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async (_, w) => {
    while (i < itens.length) { const k = i++; res[k] = await fn(itens[k], k, w); if (aoTerminar) aoTerminar(k, res[k]); }
  }));
  return res;
}
// um contexto de navegador por trabalhador (criado por rodada: o cache HTTP não passa de uma versão para a outra)
// nav pode ser um navegador ou uma lista deles (os trabalhadores são distribuídos em rodízio: vários processos do Edge rendem mais que um só)
async function contextosDosTrabalhadores(nav, n) { const navs = Array.isArray(nav) ? nav : [nav]; return Promise.all(Array.from({ length: n }, (_, i) => navs[i % navs.length].createBrowserContext())); }
async function fecharContextos(lista) { for (const c of lista) { try { await c.close(); } catch (_) {} } }

// chave de deduplicação da exploração (só na ORIGINAL): evento + código do manipulador com números trocados por #; no máximo 2 por chave
function chaveDe(c, ev) {
  if (c.fonte === "prop") return `${ev}|prop|${c.tag}|${c.rotulo}`;
  return `${ev}|${String(c.codigo[ev]).replace(/\d+/g, "#").replace(/\s+/g, " ").trim()}`;
}
// até 5 por chave: as listas simuladas têm 5 linhas e cada linha pode levar a uma tela diferente (ex.: um botão por órgão)
const LIMITE_POR_CHAVE = 5;
const EVENTOS_ACIONAVEIS = new Set(["click", "submit", "change", "input", "keydown", "keyup"]);

// descoberta em largura a partir do estado logado. Cada ação nova = caminho do pai + passo do pai; o transcrito de cada ação já é a 1ª rodada.
async function explorar(nav, srv, modelo, arqs, perfil, opcoes) {
  const profundidadeMax = PERFIS[perfil].profundidade || opcoes.profundidade || 6;
  const limiteAcoes = opcoes.limiteAcoes || 6000;
  const vistos = new Map();
  const plano = [];
  const transcritos = {};
  let nAcoes = 0;
  const novaAcao = (caminho, c, ev) => ({ id: `${perfil}:${++nAcoes}`, perfil, caminho, chave: chaveDe(c, ev), alvo: { tag: c.tag, rotulo: c.rotulo, ord: c.ord }, evento: ev, tipo: c.tipo, codigo: c.codigo[ev], fonte: c.fonte, profundidade: caminho.length + 1 });
  const raiz = { id: `${perfil}:0`, perfil, caminho: [], alvo: null, profundidade: 0 };
  plano.push(raiz);
  let nivel = [raiz];
  const ctxs = await contextosDosTrabalhadores(nav, opcoes.workers);
  while (nivel.length) {
    const t0 = Date.now();
    const res = await emParalelo(nivel, opcoes.workers, (a, k, w) => executarAcao(nav, srv, modelo, arqs, a, { rotulo: "descoberta", ctx: ctxs[w] }), opcoes.progresso);
    const prox = [];
    for (let k = 0; k < nivel.length; k++) {
      const a = nivel[k], tr = res[k];
      transcritos[a.id] = tr;
      if (!tr.controlesDepois || a.profundidade >= profundidadeMax) continue;
      if (a.alvo && tr.achado === false) continue;
      const caminhoFilho = a.alvo ? a.caminho.concat([{ alvo: a.alvo, evento: a.evento, tipo: a.tipo }]) : [];
      for (const c of tr.controlesDepois) {
        if (c.desabilitado) continue;
        for (const ev of c.eventos) {
          if (!EVENTOS_ACIONAVEIS.has(ev)) continue;
          const ch = chaveDe(c, ev);
          const n = vistos.get(ch) || 0;
          if (n >= (c.fonte === "prop" ? 1 : LIMITE_POR_CHAVE)) continue;
          if (nAcoes >= limiteAcoes) continue;
          vistos.set(ch, n + 1);
          const nova = novaAcao(caminhoFilho, c, ev);
          plano.push(nova); prox.push(nova);
        }
      }
    }
    if (opcoes.log) opcoes.log(`  ${perfil}: nível ${nivel[0].profundidade} — ${nivel.length} ações em ${Math.round((Date.now() - t0) / 1000)} s; próximas: ${prox.length}`);
    nivel = prox;
  }
  await fecharContextos(ctxs);
  return { plano, transcritos };
}

module.exports = { abrirNavegador, executarAcao, explorar, emParalelo, arquivosDeTeste, gerarPlanilhaPessoas, PERFIS, Sessao, contextosDosTrabalhadores, fecharContextos };
