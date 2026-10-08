// vD.2 — prova genérica de um módulo do front (rodar de dentro de tools/csp-e2e, que tem o puppeteer-core: `cd tools/csp-e2e && node ../modularizar/prova-modulo.js ...`) (app/modulos/<nome>.js) num endereço publicado (homologação ou produção).
// Confere: todo módulo que o index.html publicado carrega responde 200 como JavaScript e está na casca do service worker;
// as funções de amostra do módulo estão no escopo global e as ações no despachante; zero erro de JavaScript e zero
// violação de CSP ao carregar. Com login (matrícula+senha), entra, abre a aba pedida, clica numa ação do módulo e
// confere que a API real respondeu 200 e a tela desenhou algo. Uso:
//   node prova-modulo.js --base <url> --modulo voluntariado --funcoes volEsc,volCarregarEscalasAcao [--sw v7]
//        [--matricula 900001 --senha ... --aba btnAbaEscalas --acao volCarregarEscalasAcao --api /api/voluntariado/ --alvo "#idDaTela"]
//        [--captura caminho.png]
// o puppeteer-core é o de tools/csp-e2e (instalado lá); de qualquer pasta
const puppeteer = (() => { try { return require("puppeteer-core"); } catch { return require(require("path").join(__dirname, "..", "csp-e2e", "node_modules", "puppeteer-core")); } })();
const EDGE = process.env.NAVEGADOR || process.env.EDGE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";   // no runner do GitHub: NAVEGADOR=/usr/bin/google-chrome

// Abre o navegador com as flags usuais de CI e tenta de novo uma vez (no runner do GitHub o Chrome às vezes não responde
// na primeira abertura: "Timed out ... waiting for the WS endpoint"); na segunda tentativa mostra a saída do próprio navegador.
async function abrirNavegador() {
  const args = ["--no-first-run", "--no-default-browser-check", "--disable-gpu", "--disable-dev-shm-usage", ...(process.platform === "linux" ? ["--no-sandbox"] : []), "--lang=pt-BR"];
  let ultimoErro;
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      return await puppeteer.launch({ executablePath: EDGE, headless: true, args, timeout: 90000, dumpio: tentativa > 1 });
    } catch (e) {
      ultimoErro = e;
      console.log(`navegador não abriu (tentativa ${tentativa}): ${String(e.message || e).split("\n")[0]}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw ultimoErro;
}
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const BASE = (arg("base", "https://white-grass-048208e0f-21.eastus2.6.azurestaticapps.net")).replace(/\/+$/, "");
const MODULO = arg("modulo"), FUNCOES = (arg("funcoes", "") || "").split(",").filter(Boolean), SW = arg("sw");
const MATRICULA = arg("matricula"), SENHA = arg("senha", process.env.SEED_SENHA || "Homolog@2026"), ABA = arg("aba"), ACAO = arg("acao"), API = arg("api"), ALVO = arg("alvo");
const CAPTURA = arg("captura"), CLICAR = arg("clicar"), SELECIONAR = arg("selecionar");   // --selecionar <seletor de <select>>: escolhe a 1ª opção com valor (telas que exigem congregação/equipe antes de carregar)   // --clicar <seletor>: clica num controle depois da aba (ex.: sub-aba do Meu Painel)
if (!MODULO || !FUNCOES.length) { console.error("faltam --modulo e --funcoes"); process.exit(2); }
const checks = [];
const ok = (nome, cond, detalhe = "") => { checks.push({ nome, ok: !!cond }); console.log(`${cond ? "OK " : "FALHA"} ${nome}${detalhe ? "  — " + detalhe : ""}`); };
async function api(caminho, corpo, token) {
  const r = await fetch(`${BASE}/api/${caminho}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { "x-auth-token": token } : {}) }, body: JSON.stringify(corpo) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
(async () => {
  const index = await (await fetch(`${BASE}/`)).text();
  const modulos = [...index.matchAll(/<script\s+src="(modulos\/[^"]+\.js)"/g)].map((m) => m[1]);
  ok(`index.html publicado carrega modulos/${MODULO}.js`, modulos.includes(`modulos/${MODULO}.js`), modulos.join(", "));
  for (const m of modulos) {
    const r = await fetch(`${BASE}/${m}`); const t = await r.text();
    ok(`GET /${m} responde 200 como JavaScript com registrarAcoes`, r.status === 200 && /javascript/i.test(r.headers.get("content-type") || "") && t.includes("registrarAcoes({"), `${r.status} ${t.length} bytes`);
  }
  const sw = await (await fetch(`${BASE}/service-worker.js`)).text();
  const casca = (/const ARQUIVOS_SHELL = (\[[^\]]*\]);/.exec(sw) || [])[1] || "[]";
  ok("service worker publicado tem todos os módulos na casca" + (SW ? ` (cache ${SW})` : ""), modulos.every((m) => casca.includes(`"/${m}"`)) && (!SW ? true : sw.includes(`"ieadespa-app-shell-${SW}"`)), casca.slice(0, 160));

  let login = null;
  if (MATRICULA) {
    login = await api("auth/login", { matricula: Number(MATRICULA), senha: SENHA });
    if (!login.j.token) { console.log("login falhou", login.status, JSON.stringify(login.j).slice(0, 200)); process.exit(1); }
    const pendentes = login.j.termosPendentes || [];
    for (const tipo of pendentes) { const t = await api(`termos/${tipo}`, {}, login.j.token); console.log("termo", tipo, "->", t.status); }
    if (pendentes.length) login = await api("auth/login", { matricula: Number(MATRICULA), senha: SENHA });
  }

  const browser = await abrirNavegador();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const erros = [], csp = [], respostas = [];
    page.on("pageerror", (e) => erros.push(String(e)));
    page.on("console", (m) => { const t = m.text(); if (m.type() === "error" && !/favicon\.ico|status of 404/.test(t)) erros.push(t); if (/Content Security Policy/i.test(t)) csp.push(t); });
    page.on("response", (r) => { const u = r.url(); if ((API && u.includes(API)) || r.status() >= 400) respostas.push({ url: u.replace(BASE, ""), status: r.status() }); });
    page.on("requestfailed", (r) => respostas.push({ url: r.url().replace(BASE, ""), status: "FALHOU " + (r.failure() || {}).errorText }));
    await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 120000 });

    const escopo = await page.evaluate((nomes) => {
      const reg = typeof ACOES_DA_TELA !== "undefined" ? ACOES_DA_TELA : null;
      const acoes = nomes.filter((n) => /Acao$/.test(n));
      return { funcoes: nomes.filter((n) => typeof window[n] === "function"), registradas: reg ? acoes.filter((n) => typeof reg.get(n) === "function") : [], acoes };
    }, FUNCOES);
    ok(`funções do módulo no escopo global (${escopo.funcoes.length}/${FUNCOES.length})`, escopo.funcoes.length === FUNCOES.length, FUNCOES.filter((n) => !escopo.funcoes.includes(n)).join(",") || "todas");
    ok(`ações do módulo registradas no despachante (${escopo.registradas.length}/${escopo.acoes.length})`, escopo.registradas.length === escopo.acoes.length);

    if (MATRICULA) {
      await page.waitForSelector("#matriculaPainel", { visible: true, timeout: 20000 }).catch(async () => {
        await page.evaluate(() => { const a = Array.from(document.querySelectorAll("a, button")).find((el) => /acessar meu painel/i.test(el.textContent || "")); if (a) a.click(); });
        await page.waitForSelector("#matriculaPainel", { visible: true, timeout: 30000 });
      });
      await page.type("#matriculaPainel", String(MATRICULA)); await page.type("#senhaPainel", SENHA); await page.keyboard.press("Enter");
      await page.waitForFunction(() => { const g = document.querySelector("#gradeModulos"); return g && g.children.length > 0; }, { timeout: 60000 }).catch(() => {});
      ok("entrou no painel (grade de módulos montada)", await page.evaluate(() => { const g = document.querySelector("#gradeModulos"); return !!(g && g.children.length); }));
      if (ABA) {
        // --aba btnAbaX clica no botão da aba; --aba X (sem "btnAba") pede a aba pelo nome ao próprio sistema (mostrarAbaSecretaria)
        const porBotao = /^btnAba/.test(ABA);
        await page.evaluate((id, porBotao) => { if (porBotao) { const b = document.querySelector("#" + id); if (b) b.click(); } else if (typeof mostrarAbaSecretaria === "function") mostrarAbaSecretaria(id); }, ABA, porBotao);
        await new Promise((r) => setTimeout(r, 1500));
        const abaId = porBotao ? ABA.replace(/^btnAba/, "aba") : "aba" + ABA.charAt(0).toUpperCase() + ABA.slice(1);
        ok(`aba #${abaId} aberta`, await page.evaluate((id) => { const a = document.querySelector("#" + id); return !!(a && a.style.display !== "none" && a.offsetParent !== null); }, abaId));
      }
      if (CLICAR) {
        const achou = await page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; el.click(); return true; }, CLICAR);
        await new Promise((r) => setTimeout(r, 4000));
        ok(`controle ${CLICAR} clicado`, achou);
      }
      if (SELECIONAR) {
        const escolhido = await page.evaluate((s) => { const sel = document.querySelector(s); if (!sel) return null; const op = Array.from(sel.options).find((o) => o.value); if (!op) return ""; sel.value = op.value; sel.dispatchEvent(new Event("change", { bubbles: true })); return op.textContent.trim() || op.value; }, SELECIONAR);
        await new Promise((r) => setTimeout(r, 2500));
        ok(`opção escolhida em ${SELECIONAR}`, !!escolhido, String(escolhido));
      }
      if (ACAO) {
        const clicou = await page.evaluate((acao) => { const b = Array.from(document.querySelectorAll(`[data-on-click="${acao}"]`)).find((el) => el.offsetParent !== null) || document.querySelector(`[data-on-click="${acao}"]`); if (b) { b.click(); return true; } if (typeof window[acao] === "function") { window[acao](); return "direto"; } return false; }, ACAO);
        await new Promise((r) => setTimeout(r, 5000));
        ok(`ação ${ACAO} acionada`, !!clicou, String(clicou));
      }
      await new Promise((r) => setTimeout(r, 3000));
      if (API) { const ch = respostas.filter((r) => String(r.url).includes(API)); ok(`API real (${API}) chamada pela tela e respondeu 200`, ch.length > 0 && ch.every((r) => r.status === 200), JSON.stringify(ch).slice(0, 300)); }
      if (ALVO) { const txt = await page.evaluate((s) => { const el = document.querySelector(s); return el ? (el.innerHTML || "").length : -1; }, ALVO); ok(`tela desenhou conteúdo em ${ALVO}`, txt > 20, `${txt} chars`); }
    }
    const cache = await page.evaluate(async () => { try { await Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error("sem sw em 15 s")), 15000))]); const chaves = await caches.keys(); const c = await caches.open(chaves.find((k) => k.startsWith("ieadespa-app-shell")) || "x"); const faltam = []; for (const m of Array.from(document.querySelectorAll('script[src^="modulos/"]')).map((s) => "/" + s.getAttribute("src"))) if (!(await c.match(m))) faltam.push(m); return { chaves, faltam }; } catch (e) { return { erro: String(e) }; } });
    ok("service worker ativo e todos os módulos guardados na casca", cache.chaves && cache.chaves.length === 1 && (!SW || cache.chaves[0].endsWith(SW)) && cache.faltam && cache.faltam.length === 0, JSON.stringify(cache));
    ok("zero erro de JavaScript na página", erros.length === 0, erros.slice(0, 3).join(" | ").slice(0, 300));
    const ruins = respostas.filter((r) => (r.status >= 400 || String(r.status).startsWith("FALHOU")) && !/favicon\.ico$/.test(r.url));
    ok("nenhum recurso falhou (favicon.ico fora)", ruins.length === 0, JSON.stringify(ruins).slice(0, 300));
    ok("zero violação de CSP", csp.length === 0, csp.slice(0, 2).join(" | ").slice(0, 200));
    if (CAPTURA) { await page.screenshot({ path: CAPTURA }); console.log("captura:", CAPTURA); }
  } finally { await browser.close(); }
  const falhas = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - falhas}/${checks.length} verificações OK em ${BASE} (módulo ${MODULO})`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("erro do roteiro:", e); process.exit(2); });
