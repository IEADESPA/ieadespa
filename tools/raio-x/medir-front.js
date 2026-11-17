// tools/raio-x/medir-front.js — raio-x de velocidade (FASE 10, 17/11/2026): quanto o aplicativo baixa e quanto demora para abrir, no notebook e num
// celular simulado (processador 4x mais lento e internet 4G), com a API SIMULADA (respostas vazias e rápidas: mede só o peso do próprio aplicativo).
// Uso: node tools/raio-x/medir-front.js   (Edge headless com --disable-gpu; puppeteer-core do equipamento tools/csp-e2e)
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "csp-e2e", "node_modules", "puppeteer-core"));
const RAIZ = path.join(__dirname, "..", "..", "app");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".jpg": "image/jpeg" };

const srv = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    const corpo = req.method === "GET" ? "[]" : JSON.stringify({ sucesso: true });
    setTimeout(() => { res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(corpo); }, 40);
    return;
  }
  let rel = decodeURIComponent(new URL(req.url, "http://x").pathname); if (rel === "/") rel = "/index.html";
  const arq = path.join(RAIZ, rel);
  fs.readFile(arq, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": TIPOS[path.extname(arq)] || "application/octet-stream", "Cache-Control": "max-age=3600" }); res.end(d); });
});

const MODULOS = ["membresia", "financeiro", "departamentos", "ebd", "eclesiastica", "calendario"];

async function medir(nav, url, perfil) {
  const ctx = await nav.createBrowserContext();
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e.message)));
  const cdp = await page.createCDPSession();
  if (perfil === "celular") {
    await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 80, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (4 * 1024 * 1024) / 8 });
  } else {
    await page.setViewport({ width: 1366, height: 900 });
  }
  let pedidos = [], bytes = 0;
  page.on("request", (r) => pedidos.push(r.url()));
  page.on("response", async (r) => { try { const b = await r.buffer(); bytes += b.length; } catch (e) { } });
  const resultado = { perfil };

  // 1) a primeira abertura (sem nada guardado)
  let t0 = Date.now();
  await page.goto(url + "/index.html", { waitUntil: "load", timeout: 120000 });
  resultado.primeiraAberturaMs = Date.now() - t0;
  const m1 = await page.metrics();
  resultado.scriptSegundos = +m1.ScriptDuration.toFixed(2);
  resultado.pedidosAoAbrir = pedidos.length;
  resultado.baixadoAoAbrirKB = Math.round(bytes / 1024);

  // 2) a segunda abertura (com o que o navegador guardou)
  pedidos = []; bytes = 0;
  t0 = Date.now();
  await page.goto(url + "/index.html", { waitUntil: "load", timeout: 120000 });
  resultado.segundaAberturaMs = Date.now() - t0;

  // 3) entrar (sessão de mentira da Secretaria Geral) e abrir o Início
  await page.evaluate(() => {
    const s = { authToken: "tok-geral-simulado", authNome: "Líder Geral Teste", authPermissoes: JSON.stringify(["pessoas", "financeiro", "departamentos", "ebd", "secretaria", "calendario", "consagracoes"]), authMatricula: "5", authNivel: "GLOBAL", authGeral: "1" };
    for (const k in s) sessionStorage.setItem(k, s[k]);
  });
  await page.goto(url + "/index.html", { waitUntil: "load", timeout: 120000 });
  pedidos = [];
  t0 = Date.now();
  await page.evaluate(() => { mostrarTelaPainelInicial(); });
  await new Promise((r) => setTimeout(r, perfil === "celular" ? 2500 : 1200));
  resultado.inicio = { pedidosApi: pedidos.filter((u) => u.includes("/api/")).length, ms: Date.now() - t0 };

  // 4) abrir cada módulo principal: quantos pedidos à API e o tempo do script até ficar parado
  resultado.modulos = {};
  for (const chave of MODULOS) {
    pedidos = [];
    const antes = (await page.metrics()).ScriptDuration;
    t0 = Date.now();
    try { await page.evaluate((k) => { if (typeof entrarModulo === "function") entrarModulo(k); }, chave); } catch (e) { erros.push(`${chave}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, perfil === "celular" ? 2000 : 900));
    const depois = (await page.metrics()).ScriptDuration;
    resultado.modulos[chave] = { pedidosApi: pedidos.filter((u) => u.includes("/api/")).length, scriptMs: Math.round((depois - antes) * 1000) };
    try { await page.evaluate(() => { if (typeof sairDoModulo === "function") sairDoModulo(); }); } catch (e) { }
  }
  resultado.errosDeScript = erros.length;
  await ctx.close();
  return resultado;
}

(async () => {
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const nav = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--disable-gpu", "--no-first-run", "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"] });
  const saida = [];
  for (const perfil of ["notebook", "celular"]) saida.push(await medir(nav, url, perfil));
  await nav.close();
  srv.close();
  console.log(JSON.stringify(saida, null, 1));
})().catch((e) => { console.error(e); process.exit(2); });
