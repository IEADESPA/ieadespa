// Mede as recusas de CSP DENTRO do service worker (o equipamento principal só enxerga a página). node sw-csp.js <url-do-sistema>
// Abre o sistema com o cabeçalho real, espera o service worker ativar, recarrega (agora o SW intercepta) e junta as mensagens do console do SW,
// os eventos de rede bloqueados por CSP e as respostas das fontes do Google.
const puppeteer = require("puppeteer-core");
const url = process.argv[2];
if (!url) { console.error("uso: node sw-csp.js <url>"); process.exit(2); }
(async () => {
  const navegador = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: "new", args: ["--no-sandbox", "--disable-gpu", "--user-data-dir=" + require("os").tmpdir() + "/sw-csp-" + Date.now()] });
  const ocorrencias = [];
  const ligarSW = async (alvo) => {
    try {
      const sessao = await alvo.createCDPSession();
      await sessao.send("Runtime.enable"); await sessao.send("Log.enable"); await sessao.send("Network.enable");
      sessao.on("Log.entryAdded", (e) => ocorrencias.push("[log] " + e.entry.level + ": " + (e.entry.text || "").slice(0, 220) + " " + (e.entry.url || "")));
      sessao.on("Runtime.consoleAPICalled", (e) => ocorrencias.push("[console] " + e.type + ": " + e.args.map((a) => a.value || a.description || "").join(" ").slice(0, 220)));
      sessao.on("Runtime.exceptionThrown", (e) => ocorrencias.push("[excecao] " + (e.exceptionDetails.text || "") + " " + ((e.exceptionDetails.exception || {}).description || "").slice(0, 160)));
      sessao.on("Network.loadingFailed", (e) => ocorrencias.push("[rede falhou] " + (e.errorText || "") + " bloqueio=" + (e.blockedReason || "-") + " " + (e.type || "")));
      sessao.on("Network.requestWillBeSent", (e) => { if (/fonts\.(googleapis|gstatic)/.test(e.request.url)) ocorrencias.push("[SW buscou] " + e.request.url.slice(0, 90)); });
      sessao.on("Network.responseReceived", (e) => { if (/fonts\.(googleapis|gstatic)/.test(e.response.url)) ocorrencias.push("[SW recebeu] " + e.response.status + " " + e.response.url.slice(0, 90)); });
    } catch (e) { ocorrencias.push("[nao consegui anexar ao SW] " + e.message); }
  };
  navegador.on("targetcreated", (t) => { if (t.type() === "service_worker") ligarSW(t); });
  const pagina = await navegador.newPage();
  const violacoes = [];
  await pagina.evaluateOnNewDocument(() => { document.addEventListener("securitypolicyviolation", (e) => { (window.__v = window.__v || []).push(e.violatedDirective + " " + e.blockedURI); }); });
  const respostas = [];
  pagina.on("response", (r) => { if (/fonts\.(googleapis|gstatic)/.test(r.url())) respostas.push(r.status() + " " + r.url().slice(0, 80) + " (pelo SW: " + r.fromServiceWorker() + ")"); });
  pagina.on("requestfailed", (r) => { if (/fonts\.(googleapis|gstatic)/.test(r.url())) respostas.push("FALHOU " + r.url().slice(0, 80) + " " + (r.failure() || {}).errorText); });
  await pagina.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
  await pagina.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await new Promise((r) => setTimeout(r, 4000));
  await pagina.reload({ waitUntil: "networkidle2", timeout: 90000 });   // agora o SW controla e intercepta
  await new Promise((r) => setTimeout(r, 6000));
  const v = await pagina.evaluate(() => window.__v || []);
  const controlada = await pagina.evaluate(() => !!navigator.serviceWorker.controller);
  console.log("página controlada pelo service worker:", controlada);
  console.log("violações de CSP vistas pela PÁGINA:", v.length, v.slice(0, 5));
  console.log("fontes do Google (resposta vista pela página):", respostas.length ? "\n  " + respostas.join("\n  ") : "nenhuma");
  console.log("eventos DENTRO do service worker:", ocorrencias.length ? "\n  " + [...new Set(ocorrencias)].slice(0, 25).join("\n  ") : "nenhum");
  await navegador.close();
})().catch((e) => { console.error("ERRO", e.message); process.exit(1); });
