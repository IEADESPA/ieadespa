// Testes de UNIDADE do envio do mural de oração (api/EnviarPedidoMural, v7.11.1): o pedido grava no Directus e avisa o cuidado pastoral do sistema; com sinal de risco vira
// confidencial (nunca publicado); sistema fora do ar não perde o pedido; corpo ruim, honeypot e limitador. O `fetch` é trocado por um de mentira: sem rede e sem segredos.
// Como rodar (de dentro de site/):  node scripts/testes/mural-unidade.cjs
const assert = require("assert");
const path = require("path").join(__dirname, "../../api/EnviarPedidoMural/index.js");
process.env.DIRECTUS_URL = "https://d.exemplo";
process.env.DIRECTUS_ADMIN_TOKEN = "tok";
process.env.CHAVE_SITE_SISTEMA = "k";
let chamadas = [];
let resposta = {};
global.fetch = async (url, op = {}) => {
  chamadas.push({ url, op, corpo: op.body ? JSON.parse(op.body) : null });
  const r = Object.entries(resposta).find(([p]) => url.includes(p));
  const v = r ? (typeof r[1] === "function" ? r[1](op) : r[1]) : { status: 200, json: {} };
  if (v instanceof Error) throw v;
  return { ok: v.status < 300, status: v.status, json: async () => v.json };
};
const handler = require(path);
let n = 0;
async function chamar(body, ip) {
  const context = { log: Object.assign(() => {}, { warn() {}, error() {} }) };
  await handler(context, { method: "POST", headers: { "x-forwarded-for": ip || `10.0.0.${++n}, 1.1.1.1` }, body });
  return context.res;
}
const ok = (t) => console.log("ok -", t);
(async () => {
  const base = { texto: "pela minha mãe", nome: "Ana", confidencial: false, consentimento: true };
  // comum
  chamadas = []; resposta = { "/items/mural_oracao?": { status: 200, json: { data: { id: 7 } } }, "cuidado-pastoral-site": { status: 200, json: { sucesso: true, gravado: false, risco: false } } };
  let r = await chamar(base);
  assert.deepStrictEqual(r.body, { ok: true, risco: false, confidencial: false });
  assert.strictEqual(chamadas[0].op.headers.Authorization, "Bearer tok");
  assert.deepStrictEqual(chamadas[0].corpo, { texto: "pela minha mãe", nome: "Ana", confidencial: false, consentimento_lgpd: true });
  assert.strictEqual(chamadas[1].op.headers["x-site-key"], "k");
  assert.deepStrictEqual(chamadas[1].corpo, { texto: "pela minha mãe", nome: "Ana", confidencial: false, siteItemId: 7 });
  assert.strictEqual(chamadas.length, 2);
  ok("pedido comum: grava no Directus e avisa o sistema com o id do item");
  // risco → PATCH confidencial
  chamadas = []; resposta["cuidado-pastoral-site"] = { status: 200, json: { sucesso: true, gravado: true, risco: true, avisada: true } }; resposta["/items/mural_oracao/7"] = { status: 200, json: {} };
  r = await chamar({ ...base, texto: "quero morrer" });
  assert.deepStrictEqual(r.body, { ok: true, risco: true, confidencial: true });
  assert.strictEqual(chamadas[2].op.method, "PATCH"); assert.deepStrictEqual(chamadas[2].corpo, { confidencial: true });
  ok("com risco: vira confidencial no Directus (nunca publicado) e responde risco");
  // confidencial com risco: sem PATCH
  chamadas = []; r = await chamar({ ...base, texto: "quero morrer", confidencial: true });
  assert.strictEqual(chamadas.length, 2); assert.strictEqual(r.body.risco, true);
  ok("confidencial com risco: sem PATCH desnecessário");
  // sistema fora do ar → segue só no Directus
  chamadas = []; resposta["cuidado-pastoral-site"] = new TypeError("fetch failed");
  r = await chamar(base);
  assert.deepStrictEqual(r.body, { ok: true, risco: false, confidencial: false });
  resposta["cuidado-pastoral-site"] = { status: 401, json: {} };
  r = await chamar(base); assert.strictEqual(r.status, 200);
  ok("sistema fora do ar ou chave recusada: o pedido fica no Directus, como antes");
  // Directus fora, sistema guardou (confidencial) → ok; comum → 502
  resposta["/items/mural_oracao?"] = { status: 503, json: {} };
  resposta["cuidado-pastoral-site"] = { status: 200, json: { sucesso: true, gravado: true, risco: false } };
  chamadas = []; r = await chamar({ ...base, confidencial: true });
  assert.strictEqual(r.status, 200); assert.ok(!("siteItemId" in chamadas[1].corpo));
  resposta["cuidado-pastoral-site"] = { status: 200, json: { sucesso: true, gravado: false, risco: false } };
  r = await chamar(base); assert.strictEqual(r.status, 502);
  ok("Directus fora: confidencial guardado no sistema vale; comum perdido pede para tentar de novo");
  // sem chave → não chama o sistema
  delete process.env.CHAVE_SITE_SISTEMA; resposta["/items/mural_oracao?"] = { status: 200, json: { data: { id: 8 } } };
  chamadas = []; r = await chamar(base); assert.strictEqual(chamadas.length, 1); assert.strictEqual(r.status, 200);
  process.env.CHAVE_SITE_SISTEMA = "k";
  ok("sem CHAVE_SITE_SISTEMA: não chama o sistema");
  // validações
  chamadas = [];
  for (const [b, msg] of [[{ ...base, consentimento: false }, /autorização/], [{ ...base, texto: "  " }, /Escreva/], [{ ...base, texto: "a".repeat(501) }, /500/], [{ ...base, nome: "a".repeat(81) }, /80/], [{ ...base, nome: 3 }, /Nome/], [{ ...base, confidencial: "sim" }, /inválido/]]) {
    r = await chamar(b); assert.strictEqual(r.status, 400); assert.match(r.body.erro, msg);
  }
  r = await chamar(["x"]); assert.strictEqual(r.status, 400);
  assert.strictEqual(chamadas.length, 0);
  ok("corpo ruim: 400 sem gravar nada");
  // honeypot
  r = await chamar({ ...base, site: "http://spam" }); assert.strictEqual(r.status, 200); assert.strictEqual(chamadas.length, 0);
  ok("honeypot: finge sucesso sem gravar");
  // limitador 10 por IP
  let ultimo; for (let i = 0; i < 11; i++) ultimo = await chamar({ ...base, consentimento: false }, "9.9.9.9, 1.1.1.1");
  assert.strictEqual(ultimo.status, 429);
  ok("limitador: 11º envio do mesmo IP em 5 min recebe 429");
  console.log("TUDO OK");
})().catch((e) => { console.error(e); process.exit(1); });
