// vD.3 — varredura de rotas num endereço publicado (homologação recém-montada ou produção).
//
// Lê TODAS as Functions HTTP (api/*/function.json), monta um endereço de sonda para cada rota
// (parâmetro vira 1, {*acao} vira "sonda") e chama sem sessão. O que se espera de uma rota que
// carregou: 401 (exige login), 400/403/405/422, ou 200 nas públicas. O que acusa problema:
//   - 404: a Function não existe no endereço (módulo que não carregou no Azure — foi assim que a
//     homologação ficou semanas rodando código velho sem ninguém notar, 04/10/2026);
//   - 5xx persistente: o módulo carregou mas estoura ao receber a chamada (require quebrado, etc.).
// Também confere que o front publicado tem index.html, script.js e todos os módulos de app/modulos/.
//
// Logo depois de um deploy o Static Web App ainda está propagando (vimos 404 e 200 ao acaso por
// uns 10 min): o script espera /api/saude e / responderem 200 três vezes seguidas e repete toda
// sonda que der 404/5xx (3 tentativas, 20 s). Só o que persiste vira falha.
//
// Uso: node scripts/varrer-rotas.js <https://endereco>   (sai com 1 se houver falha)
const fs = require("fs");
const path = require("path");

const BASE = (process.argv[2] || process.env.SISTEMA_URL || "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(BASE)) { console.error("uso: node scripts/varrer-rotas.js <https://endereco>"); process.exit(2); }
const API = path.join(__dirname, "..");
const APP = path.join(API, "..", "app");
const ESPERA_MS = Number(process.env.VARREDURA_ESPERA_MS || 20000);
const TENTATIVAS = Number(process.env.VARREDURA_TENTATIVAS || 3);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function rotasDasFunctions() {
  const rotas = [];
  for (const pasta of fs.readdirSync(API, { withFileTypes: true })) {
    if (!pasta.isDirectory()) continue;
    const arq = path.join(API, pasta.name, "function.json");
    if (!fs.existsSync(arq)) continue;
    let fj; try { fj = JSON.parse(fs.readFileSync(arq, "utf8")); } catch { continue; }
    const b = (fj.bindings || []).find((x) => x.type === "httpTrigger");
    if (!b) continue;
    const rota = (b.route || pasta.name).replace(/^\/+/, "");
    const metodos = (b.methods || ["get"]).map((m) => m.toUpperCase());
    // parâmetro: {id} / {id:int} / {id?} -> 1; {*acao} -> sonda; segmento opcional no fim some
    const sonda = rota.split("/").map((seg) => {
      if (/^\{\*/.test(seg)) return "sonda";
      if (/^\{.*\?\}$/.test(seg)) return "";
      if (/^\{.*\}$/.test(seg)) return "1";
      return seg;
    }).filter(Boolean).join("/");
    rotas.push({ pasta: pasta.name, rota, sonda, metodo: metodos.includes("GET") ? "GET" : metodos[0] });
  }
  return rotas.sort((a, b) => a.sonda.localeCompare(b.sonda));
}

// Devolve o status; um 404 que veio da PRÓPRIA Function (JSON: "recurso não existe", ação desconhecida, código
// inválido) volta como "404-json" e não é problema — o 404 que acusa é o do Static Web App (HTML), que diz que a
// rota não existe no endereço.
async function pedir(url, metodo) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 45000);
  try {
    const r = await fetch(url, { method: metodo, signal: ctl.signal, redirect: "manual", headers: metodo === "GET" ? {} : { "Content-Type": "application/json" }, body: metodo === "GET" ? undefined : "{}" });
    if (r.status === 404) {
      // a Function responde 404 com corpo JSON ({ sucesso:false, mensagem }), às vezes rotulado text/plain;
      // o Static Web App responde 404 sem corpo (ou HTML) quando a rota não existe
      const corpo = await r.text().catch(() => "");
      try { JSON.parse(corpo); return "404-json"; } catch { return 404; }
    }
    return r.status;
  } catch (e) { return `ERRO ${String(e && e.name || e).slice(0, 40)}`; }
  finally { clearTimeout(t); }
}
const ruim = (s) => s === 404 || (typeof s === "number" && s >= 500) || (typeof s === "string" && s !== "404-json");

(async () => {
  console.log(`Varredura de rotas em ${BASE}`);
  // 1) espera o endereço estar servindo de verdade (propagação depois do deploy)
  let seguidos = 0, voltas = 0;
  while (seguidos < 3 && voltas < 40) {
    voltas++;
    const a = await pedir(`${BASE}/api/saude`, "GET"), b = await pedir(`${BASE}/`, "GET");
    if (a === 200 && b === 200) seguidos++; else { seguidos = 0; await dormir(15000); }
  }
  if (seguidos < 3) { console.log(`FALHA: /api/saude ou / não respondeu 200 três vezes seguidas em ${voltas} tentativas`); process.exit(1); }

  // 2) front: index.html publicado tem de carregar exatamente os módulos do repositório, e cada um responder 200
  const problemas = [];
  const index = await (await fetch(`${BASE}/`)).text();
  const publicados = [...index.matchAll(/<script\s+src="(modulos\/[^"]+\.js)"/g)].map((m) => m[1]).sort();
  const locais = fs.existsSync(path.join(APP, "modulos")) ? fs.readdirSync(path.join(APP, "modulos")).filter((n) => n.endsWith(".js")).sort().map((n) => "modulos/" + n) : [];
  if (JSON.stringify(publicados) !== JSON.stringify(locais)) problemas.push(`index.html publicado carrega [${publicados.join(", ")}], o repositório tem [${locais.join(", ")}]`);
  for (const f of ["eventos.js", "script.js", "service-worker.js", "style.css", ...publicados]) {
    let s; for (let i = 0; i < TENTATIVAS; i++) { s = await pedir(`${BASE}/${f}`, "GET"); if (!ruim(s)) break; await dormir(ESPERA_MS); }
    if (s !== 200) problemas.push(`/${f} -> ${s}`);
  }

  // 3) rotas da API
  const rotas = rotasDasFunctions();
  const contagem = {};
  for (const r of rotas) {
    let s;
    for (let i = 0; i < TENTATIVAS; i++) { s = await pedir(`${BASE}/api/${r.sonda}`, r.metodo); if (!ruim(s)) break; await dormir(ESPERA_MS); }
    contagem[s] = (contagem[s] || 0) + 1;
    if (ruim(s)) problemas.push(`${r.metodo} /api/${r.sonda} (${r.pasta}, rota "${r.rota}") -> ${s}`);
  }
  console.log(`${rotas.length} rotas sondadas sem sessão; respostas: ${Object.entries(contagem).map(([k, v]) => `${k}×${v}`).join(", ")}; ${publicados.length} módulos do front conferidos`);
  if (problemas.length) { console.log(`FALHA — ${problemas.length} problema(s):\n  ${problemas.join("\n  ")}`); process.exit(1); }
  console.log("OK: nenhuma rota 404 ou 5xx; front completo.");
})().catch((e) => { console.error("erro da varredura:", e); process.exit(2); });
