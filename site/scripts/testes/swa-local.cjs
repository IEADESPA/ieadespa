// Mini emulador do Azure Static Web Apps para TESTAR SEM PRODUÇÃO (16/10/2026): serve o `dist/` do site e roteia `/api/<rota>` para as Azure Functions de verdade (`site/api/*`, pelo
// `function.json` de cada uma), no mesmo processo, apontadas para o Directus que estiver nas variáveis de ambiente. Serve para rodar as baterias de `scripts/testes` (que falam HTTP com o
// `SITE_URL`) contra um Directus LOCAL (ou de teste) em vez do de produção: `SITE_URL=http://127.0.0.1:4400 DIRECTUS_URL=… DIRECTUS_ADMIN_TOKEN=… node scripts/testes/camisetas.cjs`.
//
//   DIRECTUS_URL=… DIRECTUS_ADMIN_TOKEN=… TELEFONE_CHAVE_SEGREDO=… node scripts/testes/swa-local.cjs [porta=4400] [--ip-aleatorio]
//
// Não é o runtime do Azure: sem autenticação do SWA, sem cache, sem proxy. O limitador por IP das funções existe de verdade (por IP); `--ip-aleatorio` dá um IP novo a cada chamada
// para os testes de carga não esbarrarem nele. O `x-forwarded-for` imita o do Azure (o IP de quem chamou + o do proxy, que as funções leem como "penúltimo").
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const porta = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) || process.env.PORT || 4400);
const ipAleatorio = process.argv.includes("--ip-aleatorio");
const RAIZ = path.join(__dirname, "../..");
const DIST = path.join(RAIZ, "dist");
const API = path.join(RAIZ, "api");
process.env.TELEFONE_CHAVE_SEGREDO = process.env.TELEFONE_CHAVE_SEGREDO || "segredo-de-teste-local-nao-usar-em-producao";

// as rotas, lidas dos function.json (ex.: "status-camiseta/{grupoId:int}")
const rotas = [];
for (const pasta of fs.readdirSync(API)) {
  const arquivo = path.join(API, pasta, "function.json");
  if (!fs.existsSync(arquivo) || !fs.existsSync(path.join(API, pasta, "index.js"))) continue;
  const gatilho = (JSON.parse(fs.readFileSync(arquivo, "utf8")).bindings || []).find((b) => b.type === "httpTrigger");
  if (!gatilho) continue;
  const rota = gatilho.route || pasta;
  const nomes = [];
  const regex = new RegExp("^" + rota.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\w+)(?::\w+)?\}/g, (_, nome) => { nomes.push(nome); return "([^/]+)"; }) + "/?$");
  rotas.push({ pasta, metodos: (gatilho.methods || ["get", "post"]).map((m) => m.toLowerCase()), regex, nomes });
}

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8" };

async function chamarFuncao(rota, params, req, corpoTexto) {
  const handler = require(path.join(API, rota.pasta, "index.js"));
  const ip = ipAleatorio ? `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` : req.socket.remoteAddress || "127.0.0.1";
  const cabecalhos = { ...req.headers, "x-forwarded-for": `${ip}, 127.0.0.1` };
  let corpo;
  try { corpo = corpoTexto ? JSON.parse(corpoTexto) : undefined; } catch { corpo = corpoTexto; }
  const url = new URL(req.url, "http://local");
  const contexto = { log: Object.assign((...a) => console.log("[fn]", ...a), { warn: (...a) => console.log("[fn:aviso]", ...a), error: (...a) => console.log("[fn:erro]", ...a), info() {} }), res: undefined };
  await handler(contexto, { method: req.method, headers: cabecalhos, query: Object.fromEntries(url.searchParams), params, body: corpo, rawBody: corpoTexto });
  return contexto.res || { status: 204 };
}

const servidor = http.createServer(async (req, resp) => {
  try {
    const url = new URL(req.url, "http://local");
    if (url.pathname.startsWith("/api/")) {
      const alvo = url.pathname.slice(5).replace(/\/$/, "");
      const metodo = req.method.toLowerCase();
      let achou = null;
      let params = {};
      for (const r of rotas) {
        const m = r.regex.exec(alvo);
        if (m && r.metodos.includes(metodo)) { achou = r; params = Object.fromEntries(r.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])])); break; }
      }
      if (!achou) { resp.writeHead(404, { "Content-Type": "application/json" }); resp.end(JSON.stringify({ erro: "rota da API não encontrada: " + alvo })); return; }
      const pedacos = [];
      for await (const p of req) pedacos.push(p);
      const res = await chamarFuncao(achou, params, req, Buffer.concat(pedacos).toString("utf8"));
      const corpo = res.body === undefined ? "" : typeof res.body === "string" ? res.body : JSON.stringify(res.body);
      resp.writeHead(res.status || 200, { "Content-Type": "application/json", ...(res.headers || {}) });
      resp.end(corpo);
      return;
    }
    let arquivo = path.join(DIST, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith("/")) arquivo = path.join(arquivo, "index.html");
    else if (!path.extname(arquivo)) arquivo += "/index.html";
    if (!arquivo.startsWith(DIST)) { resp.writeHead(403); resp.end(); return; }
    fs.readFile(arquivo, (erro, dados) => {
      if (erro) { resp.writeHead(404); resp.end("não encontrado"); return; }
      resp.writeHead(200, { "Content-Type": TIPOS[path.extname(arquivo)] || "application/octet-stream" });
      resp.end(dados);
    });
  } catch (erro) {
    console.log("[swa-local] erro:", erro && erro.stack);
    resp.writeHead(500, { "Content-Type": "application/json" });
    resp.end(JSON.stringify({ erro: "erro interno do emulador" }));
  }
});
servidor.listen(porta, "127.0.0.1", () => console.log(`swa-local em http://127.0.0.1:${porta} (Directus: ${process.env.DIRECTUS_URL || "NÃO DEFINIDO"}; ${rotas.length} rotas da API; IP ${ipAleatorio ? "aleatório" : "real"})`));
