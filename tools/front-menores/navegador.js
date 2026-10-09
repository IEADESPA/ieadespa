// navegador.js — a tela da v7.7 no Edge de verdade (headless), com a CSP final do projeto, a 390 px e a 1280 px: sem rolagem lateral, sem violação de CSP, nada executado.
// O front vem do disco (app/), servido com os cabeçalhos de app/staticwebapp.config.json; /api/* é respondido aqui com os formatos reais do servidor (fixtures.js) e texto de
// ataque em todos os campos. Nada chega à API de verdade.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.resolve(__dirname, "../csp-e2e/node_modules/puppeteer-core"));
const F = require("./fixtures");
const { ATAQUE, iso } = F;

const APP = path.resolve(__dirname, "../../app");
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(p => fs.existsSync(p));
const CONFIG = JSON.parse(fs.readFileSync(path.join(APP, "staticwebapp.config.json"), "utf8"));
// a política final do projeto, igual à de produção (só sem "upgrade-insecure-requests", que não vale para http://127.0.0.1)
const CSP = CONFIG.globalHeaders["Content-Security-Policy"].replace(/;?\s*upgrade-insecure-requests/, "");
const OUT = path.join(require("os").tmpdir(), "front-menores-img");       // as capturas não são versionadas
fs.mkdirSync(OUT, { recursive: true });
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

// ---------------------------------------------------------------- a API simulada
const sede = { id: 2, nome: ATAQUE("sede") }, norte = { id: 3, nome: "Congregação Norte com um nome bem comprido para esticar o cartão" };
function dadosDoMembro() {
  const sobre = { vistoria: { vistoriaId: 7, resultado: "SEM_RESTRICAO", dataVerificacao: iso(-10), documentos: [{ tipo: "ANTECEDENTES_FEDERAL", dataEmissao: iso(-140) }, { tipo: "ANTECEDENTES_ESTADUAL", dataEmissao: iso(-140) }] }, fichaEm: iso(-185), politicaVersaoAceita: null };
  const s = F.minhaSituacao({ sobre, equipes: [{ equipeId: 3, nome: ATAQUE("equipe") }, { equipeId: 4, nome: "Maternal" }], politicaAceita: false });
  s.situacao.bloqueios.forEach((b, i) => { b.mensagem = ATAQUE(`bloqueio${i}`) + " " + b.mensagem; });
  return s;
}
const estado = { politicaAceita: false, conc: 0 };
function api(metodo, caminho, consulta, corpo, token) {
  const geral = token === "tok-geral-simulado";
  const ok = (c, status = 200) => ({ status, corpo: c });
  const chave = `${metodo} ${caminho}`;
  if (chave === "POST membro/entrar") return ok(String(corpo.matricula) === "20" && corpo.pin === "1234" ? { sucesso: true, token: "tok-membro-simulado", nome: "Membro Teste", permissoes: [], nivel: null, escopo: null, geral: false, termosPendentes: [] } : { sucesso: false, mensagem: "Matrícula ou PIN incorretos." });
  if (chave === "POST auth/login") return ok(String(corpo.matricula) === "5" && corpo.senha === "senha-simulada-geral" ? { sucesso: true, token: "tok-geral-simulado", nome: "Líder Geral Teste", permissoes: ["habilitacao_voluntarios", "vistoria_antecedentes", "escalas", "pessoas"], nivel: "GLOBAL", escopo: "TODAS", geral: true, termosPendentes: [] } : { sucesso: false, mensagem: "Matrícula ou senha incorretos." });
  if (chave === "GET ministerio-menores/catalogos") return ok(F.catalogos(geral ? { gestao: true, geral: true, diretoria: true } : { gestao: false, geral: false, diretoria: false }));
  if (chave === "GET ministerio-menores/minha-situacao") return ok(dadosDoMembro());
  if (chave === "GET ministerio-menores/politica") { const p = F.politica(estado.politicaAceita); p.politica.hash = ATAQUE("hash"); p.politica.titulo = ATAQUE("polTitulo"); p.politica.itens[0].texto = ATAQUE("polItem") + " " + "palavra".repeat(30); return ok(p); }
  if (chave === "POST ministerio-menores/aceitar-politica") { estado.politicaAceita = true; return ok({ sucesso: true, mensagem: "Política aceita. Obrigado por proteger as crianças e os adolescentes." }, 201); }
  if (chave === "POST ministerio-menores/confirmar-ficha") return ok({ sucesso: true, mensagem: "Ficha confirmada. Ela vale por mais 6 meses." });
  if (chave === "POST ministerio-menores/auto-denuncia") return ok({ sucesso: true, mensagem: "Comunicação recebida pela Diretoria Executiva." }, 201);
  if (chave === "GET consentimento-menor/meus-menores") {
    const est = F.estados({ SAUDE_CRACHA: F.linhaConsent("SAUDE_CRACHA", true) }, { visitanteId: 20 });
    est.IMAGEM.mensagem = ATAQUE("estadoMsg");
    return ok(F.menoresDoResponsavel([F.menorDaLista(40, ATAQUE("menor1"), est), F.menorDaLista(41, "Maria Eduarda Pinheiro de Albuquerque Filha", F.estados({ IMAGEM: F.linhaConsent("IMAGEM", false) }, { visitanteId: 20 }))]));
  }
  if (chave === "GET consentimento-menor/textos") { const t = F.textos(); t.textos.forEach(x => { x.titulo = ATAQUE("txTitulo"); x.itens[0].texto = ATAQUE("txItem"); x.itens[0].base = ATAQUE("txBase"); x.hash = ATAQUE("hashTexto"); }); return ok(t); }
  if (chave === "POST consentimento-menor/conceder") { estado.conc++; return ok({ sucesso: true, mensagem: "Autorização registrada." }, 201); }
  if (chave === "POST consentimento-menor/revogar") return ok({ sucesso: true, fotoApagada: true, mensagem: "Autorização revogada. A foto foi apagada e a imagem deixa de ser usada." });
  if (chave === "GET minha-foto/20") return ok({ sucesso: true, fotoUrl: null, consentimentoConcedido: false, menorDeIdade: true });
  if (/^GET membros\/\d+\/frequencia$/.test(chave)) return ok({ sucesso: true, membro: { membroId: 20, nome: "Membro Teste", funcao: "Membro", congregacao: "Sede", status: "ATIVO" }, assentos: [], resumo: { totalReunioes: 0, totalPresencas: 0, totalFaltas: 0, totalJustificadas: 0, percentualPresenca: null }, historico: [] });
  if (/^GET lgpd\/consentimento\/\d+$/.test(chave)) return ok({ sucesso: true, consentimentos: [] });
  if (/^GET lgpd\/solicitacoes\/\d+$/.test(chave)) return ok({ sucesso: true, solicitacoes: [] });
  if (chave === "GET painel-inicial") return ok({ sucesso: true, blocos: [] });
  if (chave === "GET notificacoes/contagem") return ok({ sucesso: true, total: 0, naoLidas: 0 });
  if (chave === "GET lgpd/meus-dados/20") {
    const A = ATAQUE;
    return ok({
      sucesso: true, geradoEm: new Date().toISOString(),
      membro: { nome: A("nomeM"), congregacao: "Sede", extensao: null, status: "ATIVO", situacaoMembro: "ATIVO", fotoUrl: null, funcao: "x", cargoMinisterial: null, departamento: null, dizimistaFiel: 1, criadoEm: F.instante(-400) },
      liderancas: [], assentos: [], processosDisciplinares: [], vinculosFamiliares: [], consentimentos: [], solicitacoesLgpd: [], casamentos: [], licencasCandidatura: [], voluntariado: null,
      consentimentosMenores: {
        comoResponsavel: [{ menor: A("menorR"), finalidade: "Uso da imagem (foto) no cadastro, no crachá e em materiais internos", situacao: "Autorizou", textoVersao: 1, textoHash: "h", forma: "Autorização digital do responsável (com IP, data e hora)", registradoEm: F.instante(-2), referencia: null, registradaPelaSecretaria: false, enderecoIp: "177.10.20.30", cadeiaCabecalhos: null }],
        comoMenor: [{ responsavel: A("respM"), finalidade: "Uso da imagem (foto) no cadastro, no crachá e em materiais internos", situacao: "Revogou", textoVersao: 1, textoHash: "h", forma: "Ficha assinada pelo responsável, registrada pela Secretaria", registradoEm: F.instante(-30), referencia: A("refM"), registradaPelaSecretaria: true }],
        aviso: "O nome de quem registrou cada ficha fica com a Secretaria: peça-o pelo canal do Encarregado de Dados (LGPD art. 18)."
      },
      ministerioMenores: {
        politicaDeComunicacao: [{ versao: 1, forma: "CLICKWRAP", aceitoEm: F.instante(-20), enderecoIp: "177.10.20.30", referencia: null }],
        fichaConfirmadaEm: F.instante(-10), retiradasDaEscala: [{ equipe: A("eqRet"), em: F.instante(-6), escalasDesmarcadas: 3 }],
        comunicacoesADiretoria: [F.mmDb.mapearAutoDenuncia(F.autoDenunciaRow({ AutoDenunciaId: 11, MembroId: 20, Decisao: "AFASTADO_PREVENTIVAMENTE", DecididaEm: new Date(F.instante(-4)), DecisaoObservacao: A("decObs") }))],
        consultasAoCadastroNacional: [{ fonte: "Cadastro Nacional", resultado: "NADA_CONSTA", em: F.instante(-5) }], aviso: "A validade das certidões é calculada pela data de emissão das certidões do Termo de Vistoria."
      }
    });
  }
  // ---- liderança
  if (chave === "GET catalogos/congregacoes") return ok([{ congregacaoId: 2, nome: sede.nome, ativa: true }, { congregacaoId: 3, nome: norte.nome, ativa: true }]);
  const linhas = [
    F.linha(41, ATAQUE("nome41"), sede, { vistoria: { vistoriaId: 9, resultado: "COM_RESTRICAO", dataVerificacao: iso(-5), documentos: [] } }, [{ equipeId: 3, nome: ATAQUE("equipeA"), liderMembroId: 9 }, { equipeId: 4, nome: "Maternal", liderMembroId: 9 }]),
    F.linha(42, "Beltrano da Silva Sauro de Albuquerque Cavalcanti", sede, { autoDenunciaAberta: true }),
    F.linha(43, "Ciclano", sede, { vistoria: { vistoriaId: 10, resultado: "SEM_RESTRICAO", dataVerificacao: iso(-10), documentos: [{ tipo: "ANTECEDENTES_FEDERAL", dataEmissao: iso(-150) }, { tipo: "ANTECEDENTES_ESTADUAL", dataEmissao: iso(-150) }] } }),
    F.linha(44, "Dulcineia", norte, {}), F.linha(45, "Eustáquio", norte, { fichaEm: iso(-200), politicaVersaoAceita: null })
  ];
  if (chave === "GET ministerio-menores/painel-geral") return ok(F.painel(linhas, { reservado: true, equipesSemMarca: [{ equipeId: 8, nome: ATAQUE("infantil"), congregacaoId: 2, congregacaoNome: "Sede" }] }));
  if (chave === "GET ministerio-menores/painel") return ok(F.painel(linhas.filter(l => String(l.congregacaoId) === consulta.congregacaoId), { reservado: true }));
  if (chave === "GET ministerio-menores/auto-denuncias") return ok(F.autoDenuncias([
    F.autoDenunciaRow({ AutoDenunciaId: 11, MembroId: 41, Nome: ATAQUE("nomeAD"), CongregacaoNome: "Sede" }),
    F.autoDenunciaRow({ AutoDenunciaId: 12, MembroId: 42, Nome: "Beltrano", Decisao: "AFASTADO_PREVENTIVAMENTE", DecididaEm: new Date(F.instante(-5)), DecisaoObservacao: ATAQUE("obsDec") })
  ]));
  if (chave === "GET escalas/equipes") return ok({ sucesso: true, equipes: [{ equipeId: 3, nome: ATAQUE("eqNome"), liderMembroId: 9, liderNome: "L", ativa: true, natureza: "FIXA" }, { equipeId: 4, nome: "Maternal", liderMembroId: 9, liderNome: "L", ativa: true, natureza: "FIXA" }] });
  if (chave === "GET escalas/servicos") return ok({ sucesso: true, servicos: [{ servicoId: 5, descricao: "Culto Infantil", dataHora: `${iso(3)}T19:00:00.000Z`, status: "RASCUNHO", rodizioId: null }] });
  if (chave === "GET escalas/servicos-detalhe") {
    const sala = (extra) => F.salaDe(Object.assign({ equipeId: 3, equipeNome: ATAQUE("salaMaternal"), faixa: "MATERNAL", criancasPrevistas: 12, adultos: 2 }, extra));
    return ok(F.servicoDetalhe([sala(), F.salaDe({ equipeId: 6, equipeNome: "Juniores com nome de sala bem comprido para quebrar linha", faixa: null, criancasPrevistas: null, adultos: 1, semHabilitacao: [ATAQUE("semHab")] })]));
  }
  if (chave === "POST escalas/publicar") { const m = F.menoresDoServico([F.salaDe({ equipeId: 3, equipeNome: ATAQUE("salaMaternal"), faixa: "MATERNAL", criancasPrevistas: 12, adultos: 2 }), F.salaDe({ equipeId: 6, equipeNome: "Juniores", faixa: null, criancasPrevistas: null, adultos: 1 })]); return ok({ sucesso: false, mensagem: `Não dá para publicar: ${m.problemas.map(p => p.mensagem).join(" ")}`, problemas: m.problemas, salas: m.salas }, 422); }
  if (chave === "GET habilitacao-voluntarios/equipes-flag") return ok({ sucesso: true, equipes: [{ equipeId: 3, nome: ATAQUE("hvMaternal"), contatoComMenores: true }, { equipeId: 5, nome: "Louvor", contatoComMenores: false }] });
  if (chave === "GET habilitacao-voluntarios/lista") return ok({ sucesso: true, habilitacoes: [] });
  if (chave === "GET consentimento-menor/menor") return ok(F.menorGestao({ nome: ATAQUE("menorNome"), estadosObj: F.estados({ IMAGEM: F.linhaConsent("IMAGEM", true, 20, { forma: "FICHA_FISICA", referencia: ATAQUE("refFicha") }) }, { paraGestao: true }), responsaveis: [{ membroId: 20, nome: ATAQUE("respNome"), vinculo: "MAE", rotuloVinculo: "Mãe" }] }));
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
        chamadas.push(`${req.method} ${url.pathname}${url.search}`);
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

// ---------------------------------------------------------------- o navegador
const medir = () => {
  const de = document.documentElement, W = de.clientWidth;
  const vis = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const rolante = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll") return p; } return null; };
  const ofensores = [];
  for (const el of document.querySelectorAll("#cxPainelConteudo .conteudo *, .conteudo *")) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > W + 1) { const p = rolante(el); if (!p || p.getBoundingClientRect().right > W + 1) ofensores.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} (${Math.round(r.right)}>${W})`); }
  }
  const lateral = de.scrollWidth > W || document.body.scrollWidth > W;
  const largos = [];
  if (lateral) for (const el of document.querySelectorAll("body *")) { if (!vis(el) || rolante(el) || getComputedStyle(el).position === "fixed") continue; const r = el.getBoundingClientRect(); if (r.right > W + 1 || r.width > W + 1 || (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible")) largos.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className ? "." + el.className.split(" ")[0] : ""} w=${Math.round(r.width)} r=${Math.round(r.right)}`); }
  const tab = document.querySelector("#painelEquipesFlag table"), tc = document.getElementById("toastContainer");
  if (lateral) largos.push(`[inner=${innerWidth} vv=${window.visualViewport && Math.round(window.visualViewport.width)} tabela=${tab ? `${getComputedStyle(tab).display}/${getComputedStyle(tab).overflowX} w=${Math.round(tab.getBoundingClientRect().width)} sw=${tab.scrollWidth}` : "-"} toastCx=${tc ? `${getComputedStyle(tc).position} r=${Math.round(tc.getBoundingClientRect().right)} left=${getComputedStyle(tc).left} right=${getComputedStyle(tc).right}` : "-"}]`);
  return { rolagemLateral: lateral, scrollW: de.scrollWidth, clientW: W, ofensores: ofensores.slice(0, 6), largos: largos.slice(0, 9) };
};

async function rodarViewport(nav, base, nome, viewport) {
  const relatorio = { nome, problemas: [], medidas: [], csp: [], erros: [], xss: 0 };
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
  page.on("console", (m) => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) relatorio.csp.push(t.slice(0, 200)); else if (m.type() === "error" && !/Failed to load resource|ERR_NAME_NOT_RESOLVED|ERR_FAILED/.test(t)) relatorio.erros.push(t.slice(0, 200)); });
  page.on("pageerror", (e) => relatorio.erros.push("pageerror: " + String(e.stack || e.message).slice(0, 400)));
  page.on("dialog", (d) => { relatorio.problemas.push("diálogo nativo: " + d.message()); d.dismiss().catch(() => {}); });

  const medida = async (rotulo) => { const m = await page.evaluate(medir); relatorio.medidas.push({ rotulo, ...m }); if (m.rolagemLateral || m.ofensores.length) relatorio.problemas.push(`${rotulo}: rolagem lateral=${m.rolagemLateral} (scrollW ${m.scrollW} > ${m.clientW}) ofensores=${m.ofensores.join("; ")} largos=${(m.largos || []).join(" | ")}`); };
  const foto = async (seletor, arq) => { const h = await page.$(seletor); if (h) { try { await h.screenshot({ path: path.join(OUT, `${nome}-${arq}.png`), captureBeyondViewport: true }); } catch (e) { relatorio.problemas.push(`captura ${arq}: ${e.message.slice(0, 80)}`); } } };
  const calmo = async () => { await new Promise(r => setTimeout(r, 450)); };
  const clicar = async (fn, arg) => { const ok = await page.evaluate(fn, arg); if (!ok) relatorio.problemas.push(`não achei o controle: ${typeof arg === "string" ? arg : JSON.stringify(arg)}`); await calmo(); return ok; };
  const porTexto = (seletor, texto, escopo) => page.evaluate((s, t, esc) => { const raiz = esc ? document.querySelector(esc) : document; const el = [...raiz.querySelectorAll(s)].find(x => x.textContent.includes(t) && x.getClientRects().length); if (!el) return false; el.click(); return true; }, seletor, texto, escopo);
  const abrirMenuCelular = async () => { if (viewport.width <= 640) await page.evaluate(() => { const b = document.getElementById("btnMenuCelular"); if (b && b.offsetParent !== null) b.click(); }); };
  const entrar = async (matricula, segredo) => {
    await page.goto(base + "/", { waitUntil: "load" });
    await clicar(() => { const a = [...document.querySelectorAll("a")].find(x => /Acessar meu Painel/.test(x.textContent)); if (!a) return false; a.click(); return true; });
    await page.evaluate((m, s) => { document.getElementById("matriculaPainel").value = m; document.getElementById("senhaPainel").value = s; document.getElementById("matriculaPainel").closest("form").requestSubmit(); }, matricula, segredo);
    await page.waitForFunction(() => { const c = document.getElementById("cxPainelConteudo"); return c && c.style.display !== "none"; }, { timeout: 15000 }).catch(() => relatorio.problemas.push("o painel não abriu depois do login"));
    await calmo();
  };

  try {
    // ================= MEMBRO por PIN: Meu Painel -> Ministério com menores
    await entrar("20", "1234");
    await abrirMenuCelular();
    await clicar(() => { const b = document.getElementById("btnSubMeupainelMenores"); if (!b) return false; b.click(); return true; });
    await page.waitForFunction(() => document.getElementById("mnrSituacao") && document.getElementById("mnrSituacao").children.length > 0, { timeout: 10000 }).catch(() => relatorio.problemas.push("a situação não carregou"));
    await calmo();
    await medida("Meu Painel / situação");
    await foto("#subMeupainelMenores", "meupainel-situacao");
    // política: marcar e aceitar
    await page.evaluate(() => { const c = document.getElementById("mnrPoliticaAceite"); if (c) { c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); } });
    await calmo(); await medida("Meu Painel / política marcada");
    // abrir o texto de autorização do menor 40 (imagem) e medir
    await porTexto("button", "Ler o texto e autorizar", "#mnrMenoresLista"); await calmo();
    await medida("Meu Painel / texto da autorização"); await foto("#mnrMenoresLista", "meupainel-autorizacao");
    await page.evaluate(() => { const c = document.querySelector("[id^=mnrAutCaixa]"); if (c) { c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); } });
    await porTexto("button", "Autorizar", "#mnrMenoresLista"); await calmo();
    // revogar (modal)
    await porTexto("button", "Revogar a autorização", "#mnrMenoresLista"); await calmo();
    await medida("Meu Painel / confirmação de revogar");
    await page.evaluate(() => { const b = document.getElementById("modalCancelar"); if (b) b.click(); });
    // comunicar à Diretoria: preencher e abrir a confirmação
    await page.evaluate(() => { document.getElementById("mnrAdTipo").value = "PROCESSO_CRIMINAL"; document.getElementById("mnrAdData").value = "2026-09-01"; document.getElementById("mnrAdCiente").checked = true; });
    await porTexto("button", "Comunicar à Diretoria", "#mnrAdFormCx"); await calmo();
    await medida("Meu Painel / confirmação de comunicar");
    await page.evaluate(() => { const b = document.getElementById("modalCancelar"); if (b) b.click(); });
    await medida("Meu Painel / depois");
    // Meus Dados (LGPD) + foto
    await clicar(() => { const b = document.getElementById("btnSubMeupainelLgpd"); if (!b) return false; b.click(); return true; });
    await porTexto("button", "Ver meus dados"); await calmo();
    await medida("Meu Painel / Meus Dados (LGPD)"); await foto("#cxMeusDadosLGPD", "meus-dados"); await foto("#subMeupainelLgpd", "lgpd-foto");
    const foto20 = await page.evaluate(() => ({ envio: document.getElementById("minhaFotoEnvio").style.display, aviso: document.getElementById("minhaFotoAvisoMenor").textContent.slice(0, 60) }));
    if (foto20.envio !== "none" || !/menos de 18/.test(foto20.aviso)) relatorio.problemas.push(`foto de menor: envio=${foto20.envio} aviso="${foto20.aviso}"`);

    // ================= LIDERANÇA GERAL: Habilitação -> Ministério com Menores, Escalas
    await entrar("5", "senha-simulada-geral");
    await clicar(() => { const c = [...document.querySelectorAll(".card-modulo")].find(x => x.textContent.includes("Habilitação de Voluntários")); if (!c) return false; c.click(); return true; });
    await abrirMenuCelular();
    await clicar(() => { const b = document.getElementById("btnAbaMenores"); if (!b) return false; b.click(); return true; });
    await page.waitForFunction(() => { const s = document.getElementById("mnrPainelCong"); return s && s.options.length > 1; }, { timeout: 10000 }).catch(() => relatorio.problemas.push("a aba Ministério com Menores não carregou as congregações"));
    await medida("Secretaria / painel (vazio)");
    await page.evaluate(() => { const s = document.getElementById("mnrPainelCong"); s.value = "TODAS"; s.dispatchEvent(new Event("change", { bubbles: true })); });
    await porTexto("button", "Abrir o painel", "#mnrSecaoPainel"); await calmo();
    await medida("Secretaria / painel do campo inteiro"); await foto("#mnrSecaoPainel", "secretaria-painel");
    await clicar(() => { const b = document.getElementById("btnMnrSecaoFerramentas"); if (!b) return false; b.click(); return true; });
    await page.evaluate(() => { document.getElementById("mnrFcMenor").value = "40"; });
    await porTexto("button", "Consultar", "#mnrSecaoFerramentas"); await calmo();
    await page.evaluate(() => { const s = document.getElementById("mnrFaixaCong"); s.value = "2"; });
    await porTexto("button", "Ver as equipes", "#mnrSecaoFerramentas"); await calmo();
    await medida("Secretaria / ferramentas"); await foto("#mnrSecaoFerramentas", "secretaria-ferramentas");
    await clicar(() => { const b = document.getElementById("btnMnrSecaoComunicacoes"); if (!b || b.style.display === "none") return false; b.click(); return true; });
    await porTexto("button", "Decidir", "#mnrComLista"); await calmo();
    await medida("Secretaria / comunicações"); await foto("#mnrSecaoComunicacoes", "secretaria-comunicacoes");
    // Escalas: detalhe do serviço com as salas, publicar com 422, e a Habilitação com a faixa
    await clicar(() => { const b = document.getElementById("btnVoltarModulo"); if (!b) return false; b.click(); return true; });
    await clicar(() => { const c = [...document.querySelectorAll(".card-modulo")].find(x => x.textContent.includes("Escalas de Serviço")); if (!c) return false; c.click(); return true; });
    await page.waitForFunction(() => { const s = document.getElementById("esCongregacao"); return s && s.options.length > 0; }, { timeout: 10000 }).catch(() => {});
    await porTexto("button", "Abrir", "#abaEscalas"); await calmo();
    await porTexto("button", "Abrir", "#painelServicosEscala"); await calmo();
    await medida("Escalas / detalhe do serviço"); await foto("#painelDetalheServicoEscala", "escalas-detalhe");
    await porTexto("button", "Publicar", "#painelDetalheServicoEscala"); await calmo();
    await medida("Escalas / publicar com problemas"); await foto("#painelDetalheServicoEscala", "escalas-publicar");
    await clicar(() => { const b = document.getElementById("btnVoltarModulo"); if (!b) return false; b.click(); return true; });
    await clicar(() => { const c = [...document.querySelectorAll(".card-modulo")].find(x => x.textContent.includes("Habilitação de Voluntários")); if (!c) return false; c.click(); return true; });
    await page.waitForFunction(() => { const s = document.getElementById("hvCongregacao"); return s && s.options.length > 0; }, { timeout: 10000 }).catch(() => {});
    await porTexto("button", "Abrir", "#abaHabilitacao"); await calmo();
    await medida("Habilitação / equipes com a faixa"); await foto("#painelEquipesFlag", "habilitacao-faixa");
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
    executablePath: EDGE, headless: true, userDataDir: path.join(require("os").tmpdir(), "mnr-edge-" + Date.now()),
    args: ["--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync", "--lang=pt-BR"],
    protocolTimeout: 120000
  });
  const resultados = [];
  for (const [nome, vp] of [["390", { width: 390, height: 844, isMobile: true, deviceScaleFactor: 1 }], ["1280", { width: 1280, height: 900, deviceScaleFactor: 1 }]]) {
    estado.politicaAceita = false;
    resultados.push(await rodarViewport(nav, s.url, nome, vp));
  }
  if (process.env.DEPURAR) console.log("CHAMADAS:\n" + [...new Set(s.chamadas.map(c => c.replace(/\?.*/, "")))].join("\n"));
  await nav.close(); s.srv.close();
  let falhou = false;
  for (const r of resultados) {
    console.log(`\n=== ${r.nome} px ===`);
    console.log(`medidas: ${r.medidas.length} (sem rolagem lateral: ${r.medidas.filter(m => !m.rolagemLateral && !m.ofensores.length).length})`);
    console.log(`violações de CSP: ${r.csp.length + r.cspVioladas.length} · código do ataque executado: ${r.xss} · erros de JavaScript/console: ${r.erros.length}`);
    r.csp.slice(0, 5).forEach(x => console.log("  CSP: " + x)); r.cspVioladas.slice(0, 5).forEach(x => console.log("  CSP(evento): " + x));
    r.erros.slice(0, process.env.DEPURAR ? 40 : 8).forEach(x => console.log("  erro: " + x.replace(/\n/g, " | ")));
    r.problemas.forEach(x => console.log("  ✗ " + x));
    if (r.problemas.length || r.csp.length || r.cspVioladas.length || r.xss !== 0) falhou = true;
  }
  console.log(falhou ? "\nRESULTADO: com problemas" : "\nRESULTADO: limpo");
  process.exit(falhou ? 1 : 0);
})();
