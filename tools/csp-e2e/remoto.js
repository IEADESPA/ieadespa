// MODO REMOTO — sondagem do endereço real (Azure Static Web Apps): cabeçalhos das respostas de verdade (index.html, eventos.js, script.js,
// verificar.html/js, service-worker.js), registro do service worker e violações de CSP ao carregar. Nenhum pedido a /api/* sai da máquina:
// a interceptação responde com a API simulada (e a sondagem nem entra no painel, então não pede nada à API).
const { Sessao } = require("./cobertor");

const CABECALHOS = ["content-security-policy", "content-security-policy-report-only", "x-frame-options", "x-content-type-options", "strict-transport-security", "referrer-policy", "permissions-policy", "cross-origin-opener-policy", "cache-control", "content-type"];
// os módulos (app/modulos/*.js) vêm do index.html local, na ordem em que ele os carrega (fontes.js) — não precisa editar aqui a cada módulo novo
const MODULOS = require("./fontes").arquivosFront(require("path").join(__dirname, "..", "..", "app")).filter((a) => a !== "script.js").map((a) => "/" + a);
const ARQUIVOS = ["/", "/index.html", "/eventos.js", "/script.js", ...MODULOS, "/style.css", "/verificar.html", "/verificar.js", "/verificar.css", "/service-worker.js", "/vendor/xlsx.full.min.js", "/vendor/simplewebauthn-browser.js"];

async function sondarRemoto(nav, srv, log) {
  const s = new Sessao(nav, srv, { props: [], listas: [], literais: {}, permissoes: [] }, null, "sondagem");
  const ctx = await nav.createBrowserContext();
  const page = await ctx.newPage();
  const respostas = {};
  const csp = [];
  const r = { ok: true, problemas: [] };
  r.swConsole = [];
  // console do PRÓPRIO service worker (erros de CSP no fetch do SW só aparecem ali, não na página)
  ctx.on("targetcreated", async (t) => {
    if (t.type() !== "service_worker") return;
    try { const w = await t.worker(); if (w) w.on("console", (m) => r.swConsole.push(`${m.type()}: ${m.text()}`.slice(0, 300))); } catch (_) {}
  });
  try {
    await s.interceptarApi(page);
    await page.setBypassServiceWorker(false); // aqui o service worker TEM de registrar (a interceptação de /api continua valendo)
    await page.evaluateOnNewDocument(() => {
      window.__csp = [];
      document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.effectiveDirective} bloqueou ${e.blockedURI || "inline"} em ${e.sourceFile || ""}:${e.lineNumber}`), true);
    });
    page.on("response", (resp) => {
      const u = new URL(resp.url());
      if (u.origin !== new URL(srv.url).origin) return;
      const h = resp.headers();
      respostas[u.pathname] = { status: resp.status(), cabecalhos: Object.fromEntries(CABECALHOS.filter(k => h[k] !== undefined).map(k => [k, h[k]])) };
    });
    await page.goto(srv.url + "/index.html", { waitUntil: "load" });
    // service worker: registro, ativação e controle da página (na 2ª carga)
    r.sw = await page.evaluate(() => Promise.race([
      navigator.serviceWorker.ready.then(reg => ({ escopo: reg.scope, script: reg.active && reg.active.scriptURL, estado: reg.active && reg.active.state })),
      new Promise(ok => setTimeout(() => ok({ erro: "não registrou em 20 s" }), 20000))
    ])).catch(e => ({ erro: String(e.message) }));
    await page.reload({ waitUntil: "load" });
    r.swControla = await page.evaluate(() => !!navigator.serviceWorker.controller);
    // caches que o service worker criou (a versão da casca, ex. ieadespa-app-shell-v4) e o que ficou guardado nela
    r.caches = await page.evaluate(async () => { const out = {}; for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map(q => new URL(q.url).pathname); return out; }).catch(e => ({ erro: String(e.message) }));
    r.eventosCarregado = await page.evaluate(() => typeof registrarAcoes === "function" || typeof despacharEventoDaTela === "function");
    csp.push(...(await page.evaluate(() => window.__csp)));
    // um clique de verdade no front real: "Acessar meu Painel" (passa pelo despachante) e volta
    r.cliqueAcessar = await page.evaluate(() => { const a = [...document.querySelectorAll("a")].find(x => /Acessar meu Painel/.test(x.textContent)); if (!a) return "link não achado"; a.click(); return document.getElementById("cxLoginPainel") && getComputedStyle(document.getElementById("telaPainel")).display !== "none" ? "abriu a caixa de entrada" : "não abriu"; });
    csp.push(...(await page.evaluate(() => window.__csp)));
    await page.goto(srv.url + "/verificar.html", { waitUntil: "load" });
    csp.push(...(await page.evaluate(() => window.__csp)));
    // arquivos que a página não pediu nesta carga (ou que vieram do service worker): pede direto para ver o cabeçalho de verdade
    for (const a of ARQUIVOS) {
      if (respostas[a] && respostas[a].status) continue;
      const resp = await page.goto(srv.url + a, { waitUntil: "domcontentloaded" }).catch(() => null);
      if (resp) { const h = resp.headers(); respostas[a] = { status: resp.status(), cabecalhos: Object.fromEntries(CABECALHOS.filter(k => h[k] !== undefined).map(k => [k, h[k]])) }; }
    }
  } catch (e) { r.ok = false; r.problemas.push(String(e && e.message).slice(0, 200)); }
  finally { try { await ctx.close(); } catch (_) {} }
  r.respostas = respostas;
  r.csp = [...new Set(csp)];
  r.apiInterceptada = srv.chamadasDe("sondagem").length;
  log(`SONDAGEM de ${srv.url}:`);
  for (const a of ARQUIVOS) { const x = respostas[a]; if (x) log(`  ${a} → ${x.status}  ${Object.entries(x.cabecalhos).filter(([k]) => k !== "content-type").map(([k, v]) => `${k}: ${v}`).join(" | ")}`); else log(`  ${a} → (sem resposta)`); }
  log(`  service worker: ${JSON.stringify(r.sw)}; controla a página na 2ª carga: ${r.swControla}; eventos.js carregado: ${r.eventosCarregado}; clique em "Acessar meu Painel": ${r.cliqueAcessar}`);
  log(`  caches do service worker: ${JSON.stringify(r.caches)}`);
  log(`  console do service worker: ${r.swConsole.length ? "\n    " + r.swConsole.join("\n    ") : "vazio"}`);
  log(`  violações de CSP ao carregar index/verificar: ${r.csp.length}${r.csp.length ? "\n    " + r.csp.join("\n    ") : ""}`);
  if (r.problemas.length) log(`  problemas: ${r.problemas.join("; ")}`);
  return r;
}

module.exports = { sondarRemoto };
