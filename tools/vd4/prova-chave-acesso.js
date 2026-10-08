// vD.4 — prova em navegador da CHAVE DE ACESSO (passkey) de ponta a ponta, com um AUTENTICADOR VIRTUAL
// (protocolo do navegador: WebAuthn.addVirtualAuthenticator) — o navegador cria e usa uma chave de verdade, sem aparelho.
// Roda contra a homologação (massa fictícia; a semeadura zera as chaves dos fictícios a cada deploy):
// 1) entra com senha (pastor fictício 900007, sem e-mail de propósito): sem chave → entra com aviso (fator NENHUM);
// 2) Meu Painel → Segurança: cadastra este aparelho (a chave pública vai para o banco de homologação);
// 3) sai e entra de novo: a senha certa abre a segunda etapa e o autenticador virtual confirma → sessão com fator CHAVE;
// 4) confirmação reforçada: a função da tela confirma de novo com a chave e a sessão é reassinada;
// 5) remove a chave; entra de novo: volta a entrar sem segunda etapa, com aviso.
// Uso: node tools/vd4/prova-chave-acesso.js [--base <url>]   (NAVEGADOR = caminho do Chrome/Edge; padrão: Edge do Windows)
const path = require("path");
const puppeteer = (() => { try { return require("puppeteer-core"); } catch { return require(path.join(__dirname, "..", "csp-e2e", "node_modules", "puppeteer-core")); } })();
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const NAVEGADOR = process.env.NAVEGADOR || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = (arg("base", process.env.SISTEMA_URL || "https://white-grass-048208e0f-21.eastus2.6.azurestaticapps.net")).replace(/\/+$/, "");
const MATRICULA = Number(arg("matricula", 900007)), SENHA = process.env.SEED_SENHA || "Homolog@2026";
const checks = [];
const ok = (nome, cond, detalhe = "") => { checks.push(!!cond); console.log(`${cond ? "OK " : "FALHA"} ${nome}${detalhe ? "  — " + detalhe : ""}`); };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Abre o navegador com as flags usuais de CI e tenta de novo uma vez (no runner do GitHub o Chrome às vezes não responde
// na primeira abertura: "Timed out ... waiting for the WS endpoint"); na segunda tentativa mostra a saída do próprio navegador.
async function abrirNavegador() {
  const args = ["--no-first-run", "--no-default-browser-check", "--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox", "--lang=pt-BR"];
  let ultimoErro;
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      return await puppeteer.launch({ executablePath: NAVEGADOR, headless: true, args, timeout: 90000, dumpio: tentativa > 1 });
    } catch (e) {
      ultimoErro = e;
      console.log(`navegador não abriu (tentativa ${tentativa}): ${String(e.message || e).split("\n")[0]}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw ultimoErro;
}

(async () => {
  const browser = await abrirNavegador();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const erros = []; page.on("pageerror", (e) => erros.push(String(e)));
    const cdp = await page.createCDPSession();
    await cdp.send("WebAuthn.enable");
    const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    ok("autenticador virtual criado", !!authenticatorId);

    const entrar = async () => {
      await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 120000 });
      await page.waitForSelector("#matriculaPainel", { visible: true, timeout: 20000 }).catch(async () => {
        await page.evaluate(() => { const a = Array.from(document.querySelectorAll("a, button")).find((el) => /acessar meu painel/i.test(el.textContent || "")); if (a) a.click(); });
        await page.waitForSelector("#matriculaPainel", { visible: true, timeout: 30000 });
      });
      await page.type("#matriculaPainel", String(MATRICULA)); await page.type("#senhaPainel", SENHA); await page.keyboard.press("Enter");
      await page.waitForFunction(() => (document.querySelector("#gradeModulos") && document.querySelector("#gradeModulos").children.length > 0) || (document.querySelector("#cxSegundoFator") && document.querySelector("#cxSegundoFator").style.display === "block") || document.querySelector("#resultadoLogin").textContent, { timeout: 90000 }).catch(() => {});
      // com chave cadastrada a segunda etapa é automática (o autenticador virtual confirma sozinho e o painel abre em seguida):
      // espera a entrada terminar, uma mensagem de erro, ou a etapa do código (que fica parada esperando a pessoa)
      await page.waitForFunction(() => (document.querySelector("#gradeModulos") && document.querySelector("#gradeModulos").children.length > 0) || document.querySelector("#resultadoLogin").textContent || (document.querySelector("#cxSegundoFator").style.display === "block" && document.querySelector("#btnUsarChaveAcesso").style.display === "none"), { timeout: 60000 }).catch(() => {});
      await dormir(1500);
      return page.evaluate(() => ({ entrou: !!(document.querySelector("#gradeModulos") && document.querySelector("#gradeModulos").children.length), segundaEtapa: document.querySelector("#cxSegundoFator").style.display === "block", texto: document.querySelector("#segundoFatorTexto").textContent, msg: document.querySelector("#resultadoLogin").textContent }));
    };
    const sair = async () => { await page.evaluate(() => { sessionStorage.clear(); }); };
    const minhasChaves = async () => page.evaluate(async () => { const r = await fetch("/api/chaves-acesso", { headers: { "x-auth-token": sessionStorage.getItem("authToken") } }); return r.json(); });

    // 1) sem chave, sem e-mail: entra com aviso
    const e1 = await entrar();
    ok("1) senha certa sem chave/e-mail: entrou direto (fator NENHUM)", e1.entrou && !e1.segundaEtapa, JSON.stringify(e1).slice(0, 200));
    let s = await minhasChaves();
    ok("   sessão diz fator NENHUM e nenhuma chave", s.sucesso && s.fator && s.fator.via === "NENHUM" && Array.isArray(s.chaves) && s.chaves.length === 0, JSON.stringify(s).slice(0, 160));

    // 2) cadastra este aparelho pela função da tela (o pedido do nome é respondido por nós)
    await page.evaluate(() => { window.pedirTexto = async () => "Celular de prova"; });
    const cadastro = await page.evaluate(async () => { await cadastrarChaveAcessoAcao(); await new Promise((r) => setTimeout(r, 1500)); const r = await fetch("/api/chaves-acesso", { headers: { "x-auth-token": sessionStorage.getItem("authToken") } }); return r.json(); });
    ok("2) chave cadastrada pela tela (Meu Painel → Segurança)", cadastro.sucesso && cadastro.chaves && cadastro.chaves.length === 1 && cadastro.chaves[0].apelido === "Celular de prova", JSON.stringify(cadastro).slice(0, 200));
    const credenciais = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
    ok("   o autenticador virtual guardou a credencial", credenciais.credentials.length === 1);

    // 3) sai e entra de novo: segunda etapa pela chave (o autenticador confirma sozinho)
    await sair();
    const e2 = await entrar();
    ok("3) senha certa COM chave: entrou pela segunda etapa", e2.entrou, JSON.stringify(e2).slice(0, 200));
    s = await minhasChaves();
    ok("   sessão diz fator CHAVE, recente, e a chave registrou o uso", s.sucesso && s.fator && s.fator.via === "CHAVE" && s.fatorRecente === true && s.chaves[0] && s.chaves[0].ultimoUsoEm, JSON.stringify(s.fator));

    // 4) confirmação reforçada: confirma de novo e troca o token
    const antes = await page.evaluate(() => sessionStorage.getItem("authToken"));
    const confirmou = await page.evaluate(async () => { const r = await confirmarFatorAgora(); return { ok: r, token: sessionStorage.getItem("authToken") }; });
    ok("4) confirmação reforçada pela chave: sessão reassinada", confirmou.ok === true && confirmou.token && confirmou.token !== antes);
    const semSessao = await page.evaluate(async () => (await fetch("/api/chaves-acesso/confirmar/opcoes", { method: "POST" })).status);
    ok("   sem sessão, a rota de confirmação responde 401", semSessao === 401, String(semSessao));
    const fora = await page.evaluate(async () => (await fetch("/api/auth/segundo-fator/chave/opcoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bilhete: "F.lixo.lixo" }) })).status);
    ok("   bilhete inválido na segunda etapa: 401", fora === 401, String(fora));

    // 5) remove a chave; entra de novo sem segunda etapa
    const chaveId = s.chaves && s.chaves[0] ? s.chaves[0].chaveId : 0;   // se o passo 3 falhou, o 5 falha sem derrubar o roteiro
    await page.evaluate(() => { window.confirmarAcao = async () => true; });
    const remocao = await page.evaluate(async (id) => { await removerChaveAcessoAcao(id); await new Promise((r) => setTimeout(r, 1200)); const r = await fetch("/api/chaves-acesso", { headers: { "x-auth-token": sessionStorage.getItem("authToken") } }); return r.json(); }, chaveId);
    ok("5) chave removida pela tela", remocao.sucesso && remocao.chaves.length === 0);
    await sair();
    const e3 = await entrar();
    ok("   sem chave de novo: entra direto com aviso", e3.entrou && !e3.segundaEtapa);

    ok("zero erro de JavaScript na página", erros.length === 0, erros.slice(0, 3).join(" | ").slice(0, 200));
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  } finally { await browser.close(); }
  const falhas = checks.filter((c) => !c).length;
  console.log(`\n${checks.length - falhas}/${checks.length} verificações OK em ${BASE}`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("erro do roteiro:", e); process.exit(2); });
