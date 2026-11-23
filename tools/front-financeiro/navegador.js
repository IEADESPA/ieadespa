// navegador.js — a prova das telas do Financeiro novo (Svelte) no Edge sem tela, com a CSP final: a casca de app/ e o build de app/svelte de
// verdade; /api/financeiro/blocos/* responde com dados de mentira nos formatos reais (api/shared/finBlocosDb.js) e grava cada pedido; o resto da
// casca usa a API simulada do equipamento da CSP (tools/csp-e2e: servidor.js, instrumento.js, modelo-respostas.json).
// Incremento 2 (23/11/2026): as abas "Folhas do bloco" e "Livro de entrada e saída" (r17-blocos-folhas e r17-blocos-livro, opção 1).
//
// Rodar (pelo PowerShell; pelo Bash o Edge sem tela não abre neste notebook):
//   node tools/front-financeiro/navegador.js            (PUPPETEER_CORE = a pasta do puppeteer-core; sem ela, tools/csp-e2e/node_modules)
//   LISTA=1 mostra cada caso aprovado; SO=folhas ou SO=livro roda só uma parte.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const EQUIP = path.join(__dirname, "..", "csp-e2e");
const puppeteer = require(process.env.PUPPETEER_CORE || path.join(EQUIP, "node_modules", "puppeteer-core"));
const { criarServidor } = require(path.join(EQUIP, "servidor.js"));
const { instrumento } = require(path.join(EQUIP, "instrumento.js"));
const modelo = require(path.join(EQUIP, "modelo-respostas.json"));
const RAIZ = path.join(__dirname, "..", "..", "app");
const EDGE = process.env.EDGE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const SO = process.env.SO || "";

let total = 0, falhas = 0;
const ok = (c, d, det) => {
  total++;
  if (!c) { falhas++; console.log(`  ✗ ${d}${det !== undefined ? ` — ${JSON.stringify(det).slice(0, 400)}` : ""}`); }
  else if (process.env.LISTA) console.log(`  ✓ ${d}`);
};

// ---- os dados de mentira (os do desenho aprovado; o número do bloco sai da 1ª folha) ----
const ATAQUE = '<img src=x onerror="__xss(1)">';
const ESCOPO = {
  geral: { geral: true, congregacoes: 45, area: null, congregacao: null },
  area: { geral: false, congregacoes: 12, area: "Área 2", congregacao: null },
  local: { geral: false, congregacoes: 1, area: "Área 2", congregacao: "Vila Nova" }
};
const blocoMentira = (id, primeira, cong, situacao, usadas, extra = {}) => ({
  id, numero: Math.floor((primeira - 1) / 50), primeiraFolha: primeira, ultimaFolha: primeira + 49, congregacao: cong ? { id: id + 100, nome: cong } : null,
  situacao, entregueEm: cong ? "2026-11-01" : null, devolvidoEm: null, usadas, livres: 50 - usadas, ...extra
});
// bloco 1.401 (70.051 a 70.100): 38 com destino (a 17ª cancelada, a 29ª arrancada), 12 livres
function folhasDoBloco1401(registradas) {
  const f = [];
  for (let i = 1; i <= 38; i++) {
    const destino = i === 17 ? "cancelada" : i === 29 ? "arrancada" : "lancada";
    f.push({ folha: 70050 + i, destino, observacao: destino === "lancada" ? null : destino === "cancelada" ? `Erro no valor ${ATAQUE}` : "Rasgou" });
  }
  for (const r of registradas) f.push(r);
  return f.sort((a, b) => a.folha - b.folha);
}
const OPCOES = [
  { id: 1, numero: 1401, congregacao: "Vila Nova", situacao: "em-uso" }, { id: 2, numero: 1402, congregacao: `Vila Nova ${ATAQUE}`, situacao: "esperando" },
  { id: 5, numero: 1360, congregacao: "Bela Vista", situacao: "fechado" }
];
const LIVRO = [
  { id: 5, tipo: "saida", data: "2026-11-17", registradoPor: "João da Silva", bloco: 1402, congregacao: "Vila Nova", pessoa: "Rute Santos", levadoPelaArea: false, contagem: null },
  { id: 4, tipo: "entrada", data: "2026-11-10", registradoPor: "João da Silva", bloco: 1360, congregacao: "Bela Vista", pessoa: "Lia Fontes", levadoPelaArea: false,
    contagem: { lancadas: 49, canceladas: 1, arrancadas: 0, extraviadas: 0, livres: 0 } },
  { id: 3, tipo: "saida", data: "2026-11-03", registradoPor: "João da Silva", bloco: 1395, congregacao: "Monte Sião", pessoa: `Ezequiel Ramos`, levadoPelaArea: true, contagem: null },
  { id: 2, tipo: "cadastro", data: "2026-10-28", registradoPor: "João da Silva", quantidade: null, lote: { serie: 2026, primeiraFolha: 70001, ultimaFolha: 80000, blocos: 200 } },
  { id: 1, tipo: "entrada", data: "2026-10-21", registradoPor: "João da Silva", bloco: 1352, congregacao: "Sede", pessoa: `Ana Prado ${ATAQUE}`, levadoPelaArea: false,
    contagem: { lancadas: 50, canceladas: 0, arrancadas: 0, extraviadas: 0, livres: 0 } },
  { id: 0, tipo: "chegada", data: "2026-10-20", registradoPor: "João da Silva", quantidade: 100, lote: { serie: 2026, primeiraFolha: 70001, ultimaFolha: 80000, blocos: 200 } }
];
const AGORA = { area: { emUso: 9, esperando: 2, aDevolver: 1 }, local: { emUso: 1, esperando: 1, aDevolver: 0 } };
const PESSOAS_1360 = [{ membroId: null, nome: "Ezequiel Ramos", papel: "quem levou o bloco" }, { membroId: 301, nome: "Lia Fontes", papel: "Tesoureira" }];
function rastreio(folha) {
  if (folha >= 68001 && folha <= 68050) {
    return { sucesso: true, bloco: blocoMentira(5, 68001, "Bela Vista", "em-uso", 50, { entregueEm: "2026-09-08" }),
      contagem: { lancadas: 49, canceladas: 1, arrancadas: 0, extraviadas: 0, livres: 0 }, pessoas: PESSOAS_1360 };
  }
  if (folha >= 70101 && folha <= 70150) {   // ainda na Tesouraria Geral: sem congregação nem entrega
    return { sucesso: true, bloco: blocoMentira(9, 70101, null, "na-geral", 0), contagem: { lancadas: 0, canceladas: 0, arrancadas: 0, extraviadas: 0, livres: 50 }, pessoas: [] };
  }
  if (folha >= 67001 && folha <= 67050) {   // já devolvido
    return { sucesso: true, bloco: blocoMentira(7, 67001, "Monte Sião", "fechado", 50, { devolvidoEm: "2026-10-02" }),
      contagem: { lancadas: 50, canceladas: 0, arrancadas: 0, extraviadas: 0, livres: 0 }, pessoas: [] };
  }
  return { status: 422, corpo: { sucesso: false, mensagem: `Nenhum bloco tem a folha ${folha.toLocaleString("pt-BR")}.` } };
}

const PERFIS = {
  geral: { authToken: "tok-geral-simulado", authNome: "João da Silva", authPermissoes: JSON.stringify(modelo.permissoes), authMatricula: "700002", authNivel: "GLOBAL", authGeral: "1" },
  area: { authToken: "tok-local-simulado", authNome: "Marcos Paiva", authPermissoes: JSON.stringify(["financeiro"]), authMatricula: "700102", authNivel: "AREA", authGeral: "0", authPermissoesGerais: "[]" },
  local: { authToken: "tok-local-simulado", authNome: "Rute Santos", authPermissoes: JSON.stringify(["financeiro"]), authMatricula: "700101", authNivel: "CONGREGACAO", authGeral: "0", authPermissoesGerais: "[]" }
};

// a API simulada do Financeiro: cada página tem o seu estado (as folhas registradas) e a lista dos pedidos
function apiFinanceiro(nivel, opcoes) {
  const estado = { registradas: [], pedidos: [] };
  const responder = (metodo, u, corpo) => {
    const p = u.pathname, q = u.searchParams;
    estado.pedidos.push({ metodo, caminho: p, busca: Object.fromEntries(q.entries()), corpo });
    if (p === "/api/financeiro/blocos" && metodo === "GET") {
      if (opcoes.listaFalha) return { status: 500, corpo: { sucesso: false, mensagem: "Falha simulada." } };
      return { corpo: { sucesso: true, blocos: [blocoMentira(1, 70051, "Vila Nova", "em-uso", 38)], total: 1, pagina: 1, porPagina: 40,
        resumo: nivel === "local" ? { tipo: "seus", emUsoOuEsperando: 2, folhasLivres: 12 } : { tipo: "lote", lote: null }, escopo: ESCOPO[nivel] } };
    }
    if (p === "/api/financeiro/blocos/folhas" && metodo === "GET") {
      if (q.get("bloco") === "5") {
        const f = [];
        for (let i = 1; i <= 50; i++) f.push({ folha: 68000 + i, destino: i === 3 ? "cancelada" : i > 48 ? "extraviada" : "lancada", observacao: i === 3 || i > 48 ? "Perdida" : null });
        f.splice(45, 1);   // a 46ª ficou livre e o bloco voltou assim
        return { corpo: { sucesso: true, bloco: blocoMentira(5, 68001, "Bela Vista", "fechado", 49, { devolvidoEm: "2026-11-10" }), folhas: f, opcoes: OPCOES, escopo: ESCOPO[nivel] } };
      }
      if (q.get("bloco") && !["1", "2"].includes(q.get("bloco"))) return { status: 404, corpo: { sucesso: false, mensagem: "Registro não encontrado." } };
      const reg = estado.registradas;
      return { corpo: { sucesso: true, bloco: blocoMentira(1, 70051, "Vila Nova", "em-uso", 38 + reg.length), folhas: folhasDoBloco1401(reg),
        opcoes: nivel === "local" ? OPCOES.slice(0, 2) : OPCOES, escopo: ESCOPO[nivel] } };
    }
    if (p === "/api/financeiro/blocos/folha" && metodo === "POST") {
      if (corpo && corpo.folha === 70089) return { status: 409, corpo: { sucesso: false, mensagem: "A folha 70.089 já tem destino (cancelada)." } };
      estado.registradas.push({ folha: corpo.folha, destino: corpo.oQueAconteceu, observacao: corpo.observacao });
      return { corpo: { sucesso: true, mensagem: `Folha ${Number(corpo.folha).toLocaleString("pt-BR")} registrada como ${corpo.oQueAconteceu}.` } };
    }
    if (p === "/api/financeiro/blocos/livro" && metodo === "GET") {
      const porPagina = Number(q.get("porPagina")) === 3 ? 3 : 5, pagina = Number(q.get("pagina")) || 1;
      const lista = nivel === "geral" ? LIVRO : LIVRO.filter((r) => r.tipo === "saida" || r.tipo === "entrada");
      return { corpo: { sucesso: true, registros: lista.slice(0, porPagina), total: nivel === "geral" ? 412 : 37, pagina, porPagina,
        agora: nivel === "geral" ? null : AGORA[nivel], escopo: ESCOPO[nivel] } };
    }
    if (p === "/api/financeiro/blocos/rastreio" && metodo === "GET") {
      const r = rastreio(Number(q.get("folha")));
      return r.status ? r : { corpo: r };
    }
    if (p === "/api/financeiro/blocos/devolver" && metodo === "POST") return { corpo: { sucesso: true, mensagem: "Bloco 1.360 devolvido: está de novo com a Tesouraria Geral." } };
    if (p === "/api/financeiro/blocos/entregar" && metodo === "POST") return { corpo: { sucesso: true, mensagem: "Bloco entregue." } };
    return { status: 404, corpo: { sucesso: false, mensagem: "Ação inválida." } };
  };
  return { estado, responder };
}

let nav, srv;
async function abrir(nivel, disp, opcoes = {}) {
  const [largura, altura] = disp === "notebook" ? [1280, 800] : [390, 796];
  const ctx = await nav.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: largura, height: altura, isMobile: largura < 700, hasTouch: largura < 700 });
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e.message)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) erros.push(m.text()); });
  const api = apiFinanceiro(nivel, opcoes);
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (!u.pathname.startsWith("/api/financeiro/")) { req.continue(); return; }
    let corpo = null;
    try { corpo = req.postData() ? JSON.parse(req.postData()) : null; } catch (_) { corpo = req.postData(); }
    const r = api.responder(req.method(), u, corpo);
    req.respond({ status: r.status || 200, contentType: "application/json; charset=utf-8", headers: { "Cache-Control": "no-store" }, body: JSON.stringify(r.corpo) });
  });
  await page.evaluateOnNewDocument(instrumento, { modelo });
  await page.evaluateOnNewDocument((s) => {
    window.__xssChamado = 0;
    window.__xss = () => { window.__xssChamado++; };
    try { localStorage.setItem("ieadespaTema", "claro"); localStorage.setItem("primeiroAcessoVisto", "1"); } catch (e) { }
    if (s && !sessionStorage.getItem("__p")) { for (const k in s) sessionStorage.setItem(k, s[k]); sessionStorage.setItem("__p", "1"); }
  }, PERFIS[nivel]);
  await page.goto(srv.url + "/index.html", { waitUntil: "load" });
  await calmo(page);
  await page.evaluate(() => entrarModulo("financeiro"));
  await calmo(page);
  return { page, ctx, api, erros };
}
const calmo = (page) => page.evaluate(() => window.__reg.esperarCalmo(6000, 80)).catch(() => null);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const pedidos = (api, caminho, metodo = "GET") => api.estado.pedidos.filter((p) => p.caminho === caminho && p.metodo === metodo);
async function esperarPedido(api, caminho, metodo, antes, ms = 3000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (pedidos(api, caminho, metodo).length > antes) return pedidos(api, caminho, metodo).slice(-1)[0]; await espera(50); }
  return null;
}
// o texto visível da área do conteúdo (sem o menu da esquerda)
const textoTela = (page) => page.evaluate(() => (document.querySelector("#financeiroRaiz") || document.body).innerText.replace(/\s+/g, " "));
// clica no 1º botão VISÍVEL do conteúdo cujo texto (sem espaços sobrando) é exatamente `texto`
async function clicar(page, texto, seletor = "button") {
  const feito = await page.evaluate((texto, seletor) => {
    const raiz = document.querySelector("#financeiroRaiz") || document.body;
    const el = [...raiz.querySelectorAll(seletor)].find((b) => b.textContent.replace(/\s+/g, " ").trim() === texto && b.offsetParent !== null);
    if (!el) return false;
    el.click();
    return true;
  }, texto, seletor);
  await calmo(page);
  return feito;
}
// o botão de uma folha (o rótulo acessível começa com "Folha 70.090,")
const folha = (page, n) => page.evaluateHandle((n) => [...document.querySelectorAll("#financeiroRaiz button")].find((b) => (b.getAttribute("aria-label") || "").startsWith(`Folha ${n},`)) || null, n);
async function clicarFolha(page, n) { const h = await folha(page, n); const el = h.asElement(); if (!el) return false; await el.click(); await calmo(page); return true; }
const infoFolha = (page, n) => page.evaluate((n) => {
  const b = [...document.querySelectorAll("#financeiroRaiz button")].find((x) => (x.getAttribute("aria-label") || "").startsWith(`Folha ${n},`));
  return b ? { rotulo: b.getAttribute("aria-label"), desligado: b.disabled, marcado: b.getAttribute("aria-pressed") } : null;
}, n);
// o campo (input ou select) pelo texto do rótulo
const campo = (page, rotulo) => page.evaluateHandle((rotulo) => {
  const l = [...document.querySelectorAll("#financeiroRaiz label")].find((x) => x.textContent.replace(/\s+/g, " ").trim().startsWith(rotulo) && x.offsetParent !== null);
  return (l && (l.control || l.querySelector("input, select"))) || null;
}, rotulo);
async function digitar(page, rotulo, texto) { const el = (await campo(page, rotulo)).asElement(); if (!el) return false; await el.click({ clickCount: 3 }); await el.type(texto); return true; }
async function escolher(page, rotulo, valorOuTexto) {
  const el = (await campo(page, rotulo)).asElement();
  if (!el) return false;
  const v = await el.evaluate((s, t) => { const o = [...s.options].find((x) => x.value === t || x.textContent.trim() === t); return o ? o.value : null; }, valorOuTexto);
  if (v === null) return false;
  await el.select(v);
  await calmo(page);
  return true;
}
const opcoesDe = async (page, rotulo) => { const el = (await campo(page, rotulo)).asElement(); return el ? el.evaluate((s) => [...s.options].map((o) => o.textContent.trim())) : null; };
const ultimoAviso = (page) => page.evaluate(() => { const t = [...document.querySelectorAll("#toastContainer .toast")]; return t.length ? t[t.length - 1].textContent : ""; });
async function fechar(s, nome) {
  const reg = await s.page.evaluate(() => ({ csp: window.__reg.csp.slice(), xss: window.__xssChamado, lado: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }));
  const erros = s.erros.filter((e) => !/Failed to load resource|net::ERR/.test(e));
  ok(!erros.length, `${nome}: nenhum erro de script`, erros.slice(0, 3));
  ok(!reg.csp.length, `${nome}: nenhuma violação de CSP`, reg.csp.slice(0, 2));
  ok(reg.xss === 0, `${nome}: o texto do servidor não vira código (nenhum __xss)`);
  ok(!reg.lado, `${nome}: sem rolagem para o lado`);
  await s.ctx.close();
}

// ---- Folhas do bloco ----
async function provarFolhas() {
  // Geral, notebook
  let s = await abrir("geral", "notebook");
  let { page, api } = s;
  const antes = pedidos(api, "/api/financeiro/blocos/folhas").length;
  ok(await clicar(page, "Folhas do bloco"), "geral: a aba \"Folhas do bloco\" existe");
  const f1 = await esperarPedido(api, "/api/financeiro/blocos/folhas", "GET", antes);
  ok(f1 && !("bloco" in f1.busca), "geral: abre as folhas do bloco em uso (sem escolher bloco)", f1);
  await calmo(page);
  let t = await textoTela(page);
  ok(t.includes("Sede administrativa · as 45 congregações · as folhas de um bloco"), "geral: o subtítulo da aba", t.slice(0, 200));
  ok(t.includes("A folha que você clicou") && t.includes("só escolha o que aconteceu"), "geral: o quadro do formulário");
  ok(t.includes("As 50 folhas do bloco 1.401") && t.includes("70.051 a 70.100 · 38 com destino · 12 livres"), "geral: o quadro das 50 folhas");
  const n = await page.evaluate(() => [...document.querySelectorAll("#financeiroRaiz button")].filter((b) => /^Folha \d/.test(b.getAttribute("aria-label") || "")).length);
  ok(n === 50, "geral: 50 quadradinhos", n);
  const f17 = await infoFolha(page, "70.067"), f29 = await infoFolha(page, "70.079"), f1x = await infoFolha(page, "70.051"), f39 = await infoFolha(page, "70.089");
  ok(f17 && /17ª/.test(f17.rotulo) && /cancelada/.test(f17.rotulo) && f17.desligado, "geral: a 17ª é cancelada e não se clica", f17);
  ok(f29 && /arrancada/.test(f29.rotulo) && f29.desligado, "geral: a 29ª é arrancada", f29);
  ok(f1x && /lançada na planilha/.test(f1x.rotulo) && f1x.desligado, "geral: a 1ª é lançada na planilha", f1x);
  ok(f39 && /livre/.test(f39.rotulo) && !f39.desligado, "geral: a 39ª é livre e se clica", f39);
  ok(["lançada na planilha", "cancelada", "arrancada", "livre", "a que você clicou"].every((x) => t.includes(x)), "geral: a legenda");
  ok(t.includes("Normalmente é automático:") && t.includes("Ninguém digita número: clique na folha e o sistema sabe a posição"), "geral: a nota do automático");
  // escolher a folha: o número vai ao formulário
  ok(await clicarFolha(page, "70.090"), "geral: clicar na 40ª");
  t = await textoTela(page);
  ok(t.includes("70.090 · 40ª"), "geral: a folha clicada aparece no formulário (\"70.090 · 40ª\")");
  ok((await infoFolha(page, "70.090"))?.marcado === "true", "geral: a 40ª fica marcada");
  ok(t.includes("(70.090 = 40ª do bloco 70.051 a 70.100)"), "geral: a nota mostra a conta da folha clicada");
  // registrar sem o que aconteceu: não manda nada
  const postAntes = pedidos(api, "/api/financeiro/blocos/folha", "POST").length;
  await clicar(page, "Registrar");
  ok(pedidos(api, "/api/financeiro/blocos/folha", "POST").length === postAntes, "geral: sem \"o que aconteceu\" não registra");
  ok((await textoTela(page)).includes("Escolha o que aconteceu com a folha"), "geral: diz o que falta");
  ok(await clicar(page, "Arrancada"), "geral: a escolha \"Arrancada\"");
  ok(await page.evaluate(() => [...document.querySelectorAll("#financeiroRaiz button")].some((b) => b.textContent.trim() === "Arrancada" && b.getAttribute("aria-pressed") === "true")), "geral: \"Arrancada\" marcada");
  await clicar(page, "Registrar");
  ok(pedidos(api, "/api/financeiro/blocos/folha", "POST").length === postAntes, "geral: sem a observação não registra");
  ok((await textoTela(page)).includes("Escreva a observação"), "geral: pede a observação");
  ok(await digitar(page, "Observação", "Rasgou na hora de preencher"), "geral: o campo da observação");
  const leituras = pedidos(api, "/api/financeiro/blocos/folhas").length;
  await clicar(page, "Registrar");
  const post = await esperarPedido(api, "/api/financeiro/blocos/folha", "POST", postAntes);
  ok(post && JSON.stringify(post.corpo) === JSON.stringify({ folha: 70090, oQueAconteceu: "arrancada", observacao: "Rasgou na hora de preencher" }), "geral: registra a folha certa, o que aconteceu e a observação", post && post.corpo);
  const releu = await esperarPedido(api, "/api/financeiro/blocos/folhas", "GET", leituras);
  ok(releu && releu.busca.bloco === "1", "geral: depois de registrar, lê de novo o MESMO bloco", releu && releu.busca);
  await calmo(page);
  ok(/registrada como arrancada/.test(await ultimoAviso(page)), "geral: o aviso de sucesso com a mensagem do servidor", await ultimoAviso(page));
  const f40 = await infoFolha(page, "70.090");
  ok(f40 && /arrancada/.test(f40.rotulo) && f40.desligado, "geral: a 40ª agora é arrancada", f40);
  t = await textoTela(page);
  ok(!t.includes("70.090 · 40ª"), "geral: o formulário fica limpo depois de registrar");
  // a recusa do servidor (a folha já tem destino) aparece e a escolha continua
  await clicarFolha(page, "70.089");
  await clicar(page, "Cancelada");
  await digitar(page, "Observação", "Erro no valor");
  await clicar(page, "Registrar");
  await espera(300);
  ok(/já tem destino/.test(await ultimoAviso(page)), "geral: a recusa do servidor aparece", await ultimoAviso(page));
  ok((await textoTela(page)).includes("70.089 · 39ª"), "geral: depois da recusa, a folha continua escolhida");
  // o seletor do bloco
  const ops = await opcoesDe(page, "Bloco");
  ok(ops && ops.length === 3 && ops[0] === "Bloco 1.401 · Vila Nova", "geral: o seletor \"Bloco 1.401 · Vila Nova\" com os blocos", ops);
  const l2 = pedidos(api, "/api/financeiro/blocos/folhas").length;
  ok(await escolher(page, "Bloco", "5"), "geral: escolher o bloco 1.360 (devolvido)");
  const f5 = await esperarPedido(api, "/api/financeiro/blocos/folhas", "GET", l2);
  ok(f5 && f5.busca.bloco === "5", "geral: lê as folhas do bloco escolhido", f5 && f5.busca);
  await calmo(page);
  t = await textoTela(page);
  ok(t.includes("As 50 folhas do bloco 1.360"), "geral: mostra o bloco escolhido");
  const livreDevolvido = await infoFolha(page, "68.046");
  ok(livreDevolvido && livreDevolvido.desligado, "geral: no bloco devolvido nenhuma folha se clica (nem a livre)", livreDevolvido);
  ok(/já foi devolvido/.test(t), "geral: diz que o bloco já foi devolvido e não muda mais");
  const ext = await infoFolha(page, "68.049");
  ok(ext && /extraviada/.test(ext.rotulo), "geral: a folha extraviada se distingue", ext);
  ok(t.includes("extraviada"), "geral: a legenda ganha \"extraviada\" quando o bloco tem uma");
  await fechar(s, "folhas geral notebook");

  // a lista falhou: a aba das folhas diz sozinha quem está vendo
  s = await abrir("area", "notebook", { listaFalha: true });
  await clicar(s.page, "Folhas do bloco");
  await espera(400);
  ok((await textoTela(s.page)).includes("Área 2 · 12 congregações · as folhas de um bloco"), "área: o subtítulo vem da própria aba das folhas");
  ok((await opcoesDe(s.page, "Bloco")) !== null, "área: tem o seletor do bloco");
  s.erros.length = 0;   // a falha simulada da lista (500) é de propósito
  await fechar(s, "folhas área notebook");

  // a congregação: sem seletor, o cadeado
  s = await abrir("local", "notebook");
  await clicar(s.page, "Folhas do bloco");
  await espera(300);
  t = await textoTela(s.page);
  ok(t.includes("Congregação Vila Nova · as folhas de um bloco"), "local: o subtítulo");
  ok((await opcoesDe(s.page, "Bloco")) === null, "local: sem o seletor do bloco (como no desenho)");
  ok(t.includes("As 50 folhas do bloco 1.401"), "local: as folhas do bloco em uso");
  await fechar(s, "folhas local notebook");

  // o celular: as 30 primeiras viram uma linha
  s = await abrir("geral", "celular");
  await clicar(s.page, "Folhas do bloco");
  await espera(300);
  t = await textoTela(s.page);
  ok(t.includes("Bloco 1.401 · 1ª a 30ª: todas com destino ✓"), "celular: as 30 primeiras numa linha", t.slice(0, 300));
  const nCel = await s.page.evaluate(() => [...document.querySelectorAll("#financeiroRaiz button")].filter((b) => /^Folha \d/.test(b.getAttribute("aria-label") || "") && b.offsetParent !== null).length);
  ok(nCel === 20, "celular: aparecem só as 20 que importam (31ª a 50ª)", nCel);
  ok((await opcoesDe(s.page, "Bloco")) === null, "celular: sem o seletor (como no desenho)");
  await clicarFolha(s.page, "70.090");
  ok((await textoTela(s.page)).includes("Folha 70.090 · a 40ª"), "celular: o quadro diz a folha clicada");
  await fechar(s, "folhas geral celular");
}

// ---- Livro de entrada e saída ----
async function provarLivro() {
  let s = await abrir("geral", "notebook");
  let { page, api } = s;
  const l0 = pedidos(api, "/api/financeiro/blocos/livro").length;
  ok(await clicar(page, "Livro de entrada e saída"), "geral: a aba do livro existe");
  const l1 = await esperarPedido(api, "/api/financeiro/blocos/livro", "GET", l0);
  ok(l1 && l1.busca.porPagina === "5" && (!l1.busca.pagina || l1.busca.pagina === "1"), "geral: o livro em páginas de 5 no notebook", l1 && l1.busca);
  await calmo(page);
  let t = await textoTela(page);
  ok(t.includes("Sede administrativa · as 45 congregações · o livro de entrada e saída"), "geral: o subtítulo do livro");
  ok(t.includes("O livro") && t.includes("entradas, saídas e cadastros"), "geral: o quadro do livro");
  const linhas = [
    ["17/11", "Saída: bloco 1.402 entregue a Rute Santos (Vila Nova)", "registrou João da Silva · Tesouraria Geral"],
    ["10/11", "Entrada: bloco 1.360 devolvido por Bela Vista", "recebeu João da Silva · 49 lançadas, 1 cancelada"],
    ["03/11", "Saída: bloco 1.395 entregue a Ezequiel Ramos (Monte Sião)", "levado pela área, sem ficar com ela"],
    ["28/10", "Cadastro: lote da gráfica, série 2026", "10.000 folhas · 70.001 a 80.000 · 200 blocos"],
    ["21/10", "Entrada: bloco 1.352 devolvido pela congregação Sede", "recebeu João da Silva · 50 conferidas"]
  ];
  for (const [d, tit, sub] of linhas) ok(t.includes(`${d} ${tit} ${sub}`), `geral: a linha "${tit}"`, t.slice(t.indexOf("O livro"), t.indexOf("O livro") + 500));
  ok(t.includes("1 a 5 de 412 registros"), "geral: \"1 a 5 de 412 registros\"");
  const l2 = pedidos(api, "/api/financeiro/blocos/livro").length;
  ok(await clicar(page, "2"), "geral: a página 2");
  const p2 = await esperarPedido(api, "/api/financeiro/blocos/livro", "GET", l2);
  ok(p2 && p2.busca.pagina === "2" && p2.busca.porPagina === "5", "geral: pede a página 2", p2 && p2.busca);
  // os botões e o formulário da entrada
  ok(t.includes("Registrar entrada") && t.includes("Registrar saída"), "geral: os botões \"Registrar entrada\" e \"Registrar saída\"");
  ok(t.includes("o bloco volta para a Tesouraria Geral"), "geral: o formulário da entrada aberto");
  ok(t.includes("João da Silva · Tesouraria Geral (quem está entrando)"), "geral: \"Recebido por\" é quem está entrando");
  const r0 = pedidos(api, "/api/financeiro/blocos/rastreio").length;
  ok(await digitar(page, "Primeira folha do bloco", "68.010"), "geral: o campo da primeira folha");
  const r1 = await esperarPedido(api, "/api/financeiro/blocos/rastreio", "GET", r0);
  ok(r1 && r1.busca.folha === "68010", "geral: o rastreio vem sozinho, só com os números", r1 && r1.busca);
  await calmo(page);
  t = await textoTela(page);
  ok(t.includes("Rastreio do bloco 1.360 (veio sozinho): folhas 68.001 a 68.050 · entregue a Bela Vista em 08/09 · 49 lançadas, 1 cancelada, nenhuma livre"), "geral: o texto do rastreio", t.slice(t.indexOf("Rastreio"), t.indexOf("Rastreio") + 200));
  const opsP = await opcoesDe(page, "Devolvido por");
  ok(opsP && opsP.includes("Ezequiel Ramos · quem levou o bloco") && opsP.includes("Lia Fontes · tesoureira de Bela Vista") && opsP.some((o) => /Outra pessoa/.test(o)), "geral: quem pode devolver", opsP);
  const d0 = pedidos(api, "/api/financeiro/blocos/devolver", "POST").length;
  await clicar(page, "Registrar a entrada");
  ok(pedidos(api, "/api/financeiro/blocos/devolver", "POST").length === d0, "geral: sem quem devolveu não registra");
  ok((await textoTela(page)).includes("Escolha quem devolveu"), "geral: pede quem devolveu");
  ok(await escolher(page, "Devolvido por", "Lia Fontes · tesoureira de Bela Vista"), "geral: escolher a Lia");
  const lv = pedidos(api, "/api/financeiro/blocos/livro").length;
  await clicar(page, "Registrar a entrada");
  const dv = await esperarPedido(api, "/api/financeiro/blocos/devolver", "POST", d0);
  ok(dv && JSON.stringify(dv.corpo) === JSON.stringify({ primeiraFolha: 68001, pessoa: { membroId: 301 } }), "geral: devolve pela PRIMEIRA folha do bloco (não a digitada) e a pessoa do cadastro", dv && dv.corpo);
  const relido = await esperarPedido(api, "/api/financeiro/blocos/livro", "GET", lv);
  ok(relido && (!relido.busca.pagina || relido.busca.pagina === "1"), "geral: depois da entrada, o livro volta à 1ª página", relido && relido.busca);
  await calmo(page);
  ok(/devolvido/.test(await ultimoAviso(page)), "geral: o aviso de sucesso", await ultimoAviso(page));
  t = await textoTela(page);
  ok(!t.includes("Rastreio do bloco 1.360"), "geral: o formulário fica limpo depois da entrada");
  // quem levou, escrito sem cadastro: vai o nome
  await digitar(page, "Primeira folha do bloco", "68001");
  await esperarPedido(api, "/api/financeiro/blocos/rastreio", "GET", pedidos(api, "/api/financeiro/blocos/rastreio").length - 1);
  await espera(600);
  await escolher(page, "Devolvido por", "Ezequiel Ramos · quem levou o bloco");
  let dAntes = pedidos(api, "/api/financeiro/blocos/devolver", "POST").length;
  await clicar(page, "Registrar a entrada");
  let dEz = await esperarPedido(api, "/api/financeiro/blocos/devolver", "POST", dAntes);
  ok(dEz && JSON.stringify(dEz.corpo) === JSON.stringify({ primeiraFolha: 68001, pessoa: { nome: "Ezequiel Ramos" } }), "geral: quem levou sem cadastro vai pelo nome", dEz && dEz.corpo);
  // outra pessoa: o nome escrito
  await digitar(page, "Primeira folha do bloco", "68001");
  await espera(700);
  await escolher(page, "Devolvido por", "outra");
  ok(await digitar(page, "Nome de quem devolveu", "Marta Lima"), "geral: \"outra pessoa\" abre o campo do nome");
  dAntes = pedidos(api, "/api/financeiro/blocos/devolver", "POST").length;
  await clicar(page, "Registrar a entrada");
  dEz = await esperarPedido(api, "/api/financeiro/blocos/devolver", "POST", dAntes);
  ok(dEz && JSON.stringify(dEz.corpo) === JSON.stringify({ primeiraFolha: 68001, pessoa: { nome: "Marta Lima" } }), "geral: outra pessoa vai pelo nome escrito", dEz && dEz.corpo);
  // o bloco que ainda está na Geral e o já devolvido: o rastreio não quebra e não oferece o registro
  await digitar(page, "Primeira folha do bloco", "70101");
  await espera(700);
  t = await textoTela(page);
  ok(/Rastreio do bloco 1\.402.*ainda está na Tesouraria Geral/.test(t), "geral: o bloco na Geral: diz que ainda não saiu", t.slice(t.indexOf("Rastreio"), t.indexOf("Rastreio") + 200));
  ok(await page.evaluate(() => { const b = [...document.querySelectorAll("#financeiroRaiz button")].find((x) => x.textContent.trim() === "Registrar a entrada"); return !!b && b.disabled; }), "geral: o bloco na Geral não se registra");
  await digitar(page, "Primeira folha do bloco", "67001");
  await espera(700);
  t = await textoTela(page);
  ok(/Rastreio do bloco 1\.340.*já foi devolvido em 02\/10\/2026/.test(t), "geral: o bloco devolvido: diz quando voltou", t.slice(t.indexOf("Rastreio"), t.indexOf("Rastreio") + 200));
  await digitar(page, "Primeira folha do bloco", "5");
  await espera(700);
  ok((await textoTela(page)).includes("Nenhum bloco tem a folha 5."), "geral: a folha que nenhum bloco tem");
  // a saída: sem formulário aprovado ainda
  const e0 = pedidos(api, "/api/financeiro/blocos/entregar", "POST").length;
  ok(await clicar(page, "Registrar saída"), "geral: o botão \"Registrar saída\"");
  t = await textoTela(page);
  ok(/saída do bloco/.test(t) && /ainda vai ser construíd/.test(t), "geral: a saída avisa que ainda vai ser construída", t.slice(0, 400));
  ok(!t.includes("o bloco volta para a Tesouraria Geral"), "geral: a saída troca o formulário da entrada pelo aviso");
  ok(pedidos(api, "/api/financeiro/blocos/entregar", "POST").length === e0, "geral: a saída não grava nada");
  await clicar(page, "Registrar entrada");
  ok((await textoTela(page)).includes("o bloco volta para a Tesouraria Geral"), "geral: \"Registrar entrada\" volta ao formulário");
  // o aviso do lote da gráfica não promete mais "junto com as folhas e o livro"
  await clicar(page, "Blocos");
  await clicar(page, "Cadastrar lote da gráfica");
  t = await textoTela(page);
  ok(/lote da gráfica/.test(t) && !/junto com as folhas do bloco e o livro/.test(t), "geral: o aviso do lote não fala mais das folhas e do livro");
  await fechar(s, "livro geral notebook");

  // a área: o aviso e os blocos agora, sem formulário
  s = await abrir("area", "notebook");
  await clicar(s.page, "Livro de entrada e saída");
  await espera(300);
  t = await textoTela(s.page);
  ok(t.includes("Entrada e saída de blocos quem registra é a Tesouraria Geral. A área é só intermediária: o bloco nunca fica com a área."), "área: o aviso");
  ok(/Blocos da área agora em uso 9 esperando 2 a devolver 1/.test(t), "área: os blocos da área agora (em uso, esperando, a devolver)", t.slice(t.indexOf("Blocos da área"), t.indexOf("Blocos da área") + 80));
  ok(!t.includes("Registrar entrada") && !t.includes("Primeira folha do bloco"), "área: sem os botões nem o formulário");
  ok(pedidos(s.api, "/api/financeiro/blocos/rastreio").length === 0, "área: nunca pede o rastreio");
  ok(t.includes("Saída: bloco 1.402 entregue a Rute Santos (Vila Nova)"), "área: o livro das suas congregações");
  await fechar(s, "livro área notebook");

  s = await abrir("local", "notebook");
  await clicar(s.page, "Livro de entrada e saída");
  await espera(300);
  t = await textoTela(s.page);
  ok(t.includes("Entrada e saída de blocos quem registra é a Tesouraria Geral. Para pedir um bloco novo, fale com a Tesouraria Geral; a entrega fica registrada aqui."), "local: o aviso");
  ok(/Seus blocos agora em uso 1 esperando 1/.test(t) && !/a devolver/.test(t), "local: seus blocos agora (em uso, esperando)", t.slice(t.indexOf("Seus blocos"), t.indexOf("Seus blocos") + 60));
  ok(t.includes("1 a 5 de 37 registros"), "local: as páginas do livro");
  await fechar(s, "livro local notebook");

  // o celular: a Geral com os dois botões (o formulário só ao tocar); a congregação com o aviso
  s = await abrir("geral", "celular");
  const c0 = pedidos(s.api, "/api/financeiro/blocos/livro").length;
  await clicar(s.page, "Livro de entrada e saída");
  const c1 = await esperarPedido(s.api, "/api/financeiro/blocos/livro", "GET", c0);
  ok(c1 && c1.busca.porPagina === "3", "celular: o livro em páginas de 3", c1 && c1.busca);
  await calmo(s.page);
  t = await textoTela(s.page);
  ok(t.includes("Registrar entrada") && t.includes("Registrar saída") && !t.includes("Primeira folha do bloco"), "celular: os dois botões, sem o formulário aberto");
  await clicar(s.page, "Registrar entrada");
  ok((await textoTela(s.page)).includes("Primeira folha do bloco"), "celular: tocar em \"Registrar entrada\" abre o formulário");
  await fechar(s, "livro geral celular");

  s = await abrir("local", "celular");
  await clicar(s.page, "Livro de entrada e saída");
  await espera(300);
  t = await textoTela(s.page);
  ok(t.includes("Entrada e saída de blocos quem registra é a Tesouraria Geral. Aqui você vê o livro da sua congregação."), "celular local: o aviso");
  await fechar(s, "livro local celular");
}

(async () => {
  srv = await criarServidor({ raiz: RAIZ, csp: true, permissoes: modelo.permissoes });
  nav = await puppeteer.launch({
    executablePath: EDGE, headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "edge-front-financeiro-")),
    args: ["--disable-gpu", "--no-first-run", "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"]
  });
  try {
    if (!SO || SO === "folhas") { console.log("Folhas do bloco"); await provarFolhas(); }
    if (!SO || SO === "livro") { console.log("Livro de entrada e saída"); await provarLivro(); }
  } finally {
    await nav.close();
    await srv.fechar();
  }
  console.log(`${total - falhas}/${total} casos`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
