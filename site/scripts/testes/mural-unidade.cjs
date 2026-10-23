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
  // Trava 7-C: a lista de pendentes (GET com filtro em sistema_pendente) responde à parte; por padrão, nenhum pendente
  const PENDENTES = "filter[sistema_pendente]";
  const GUARDADO = "(pedido guardado no sistema da Igreja: Cuidado pastoral → Pedidos de oração, nível geral)";
  const patches = () => chamadas.filter((c) => c.op.method === "PATCH");
  // comum
  chamadas = []; resposta = { [PENDENTES]: { status: 200, json: { data: [] } }, "/items/mural_oracao?": { status: 200, json: { data: { id: 7 } } }, "cuidado-pastoral-site": { status: 200, json: { sucesso: true, gravado: false, risco: false } } };
  let r = await chamar(base);
  assert.deepStrictEqual(r.body, { ok: true, risco: false, confidencial: false });
  assert.strictEqual(chamadas[0].op.headers.Authorization, "Bearer tok");
  assert.deepStrictEqual(chamadas[0].corpo, { texto: "pela minha mãe", nome: "Ana", confidencial: false, consentimento_lgpd: true });
  assert.strictEqual(chamadas[1].op.headers["x-site-key"], "k");
  assert.deepStrictEqual(chamadas[1].corpo, { texto: "pela minha mãe", nome: "Ana", confidencial: false, siteItemId: 7 });
  assert.strictEqual(patches().length, 0);
  assert.ok(chamadas[2].url.includes(PENDENTES));
  assert.strictEqual(chamadas.length, 3);
  ok("pedido comum: grava no Directus, avisa o sistema com o id do item e não mexe no item (só confere se há pendente para reenviar)");
  // risco → o sistema guardou: confidencial e SEM o texto e o nome no Directus (Trava 7-C)
  chamadas = []; resposta["cuidado-pastoral-site"] = { status: 200, json: { sucesso: true, gravado: true, risco: true, avisada: true } }; resposta["/items/mural_oracao/7"] = { status: 200, json: {} };
  r = await chamar({ ...base, texto: "quero morrer" });
  assert.deepStrictEqual(r.body, { ok: true, risco: true, confidencial: true });
  assert.strictEqual(patches().length, 1); assert.deepStrictEqual(patches()[0].corpo, { confidencial: true, texto: GUARDADO, nome: null });
  ok("com risco e guardado no sistema: vira confidencial e o texto e o nome saem do Directus (fica só no sistema)");
  // confidencial guardado: o texto sai do Directus
  chamadas = []; r = await chamar({ ...base, texto: "pela cirurgia do meu pai", confidencial: true });
  assert.strictEqual(r.body.risco, true);
  assert.strictEqual(patches().length, 1); assert.deepStrictEqual(patches()[0].corpo, { confidencial: true, texto: GUARDADO, nome: null });
  ok("confidencial guardado no sistema: o texto e o nome saem do Directus");
  // Trava 7-C: sistema sem resposta → confidencial por padrão + a marca de reenvio com a escolha original
  for (const [falha, rotulo] of [[new TypeError("fetch failed"), "fora do ar"], [{ status: 401, json: {} }, "chave recusada"], [{ status: 500, json: {} }, "erro 500"]]) {
    chamadas = []; resposta["cuidado-pastoral-site"] = falha;
    r = await chamar(base);
    assert.deepStrictEqual(r.body, { ok: true, risco: false, confidencial: false }, rotulo);
    assert.deepStrictEqual(patches().map((c) => c.corpo), [{ confidencial: true }, { sistema_pendente: "PUBLICO" }], rotulo);
    assert.ok(!chamadas.some((c) => c.url.includes(PENDENTES)), "sem resposta do sistema não tenta reenviar os outros");
    chamadas = []; r = await chamar({ ...base, confidencial: true });
    assert.deepStrictEqual(patches().map((c) => c.corpo), [{ confidencial: true }, { sistema_pendente: "CONFIDENCIAL" }], rotulo);
  }
  ok("sistema sem resposta (fora do ar, chave recusada, erro): o pedido vira confidencial no Directus (nunca público por engano) e guarda a marca para reenvio, com a escolha original");
  // o sistema não guardou um com risco (ocupado, limite da hora): também fica pendente
  chamadas = []; resposta["cuidado-pastoral-site"] = { status: 200, json: { sucesso: true, gravado: false, risco: true, limite: true } };
  r = await chamar(base);
  assert.strictEqual(r.body.risco, true);
  assert.deepStrictEqual(patches().map((c) => c.corpo), [{ confidencial: true }, { sistema_pendente: "PUBLICO" }]);
  ok("com risco e NÃO guardado (sistema ocupado): confidencial e pendente de reenvio");
  // reenvio dos pendentes quando o sistema responde a um envio novo
  chamadas = []; resposta["cuidado-pastoral-site"] = (op) => {
    const c = JSON.parse(op.body);
    if (c.siteItemId === 40) return { status: 200, json: { sucesso: true, gravado: true, risco: false } };          // confidencial pendente: guardado (ou já estava: o sistema reconhece o item)
    if (c.siteItemId === 41) return { status: 200, json: { sucesso: true, gravado: false, risco: false } };         // público pendente, sem risco: volta para a moderação
    return { status: 200, json: { sucesso: true, gravado: false, risco: false } };
  };
  resposta[PENDENTES] = { status: 200, json: { data: [{ id: 40, texto: "segredo 40", nome: "B", sistema_pendente: "CONFIDENCIAL" }, { id: 41, texto: "pela chuva", nome: null, sistema_pendente: "PUBLICO" }] } };
  resposta["/items/mural_oracao/40"] = { status: 200, json: {} }; resposta["/items/mural_oracao/41"] = { status: 200, json: {} };
  r = await chamar(base);
  const reenvios = chamadas.filter((c) => c.url.includes("cuidado-pastoral-site")).slice(1).map((c) => c.corpo);
  assert.deepStrictEqual(reenvios, [{ texto: "segredo 40", nome: "B", confidencial: true, siteItemId: 40 }, { texto: "pela chuva", nome: null, confidencial: false, siteItemId: 41 }]);
  assert.deepStrictEqual(patches().map((c) => [c.url.split("/").pop(), c.corpo]), [["40", { confidencial: true, texto: GUARDADO, nome: null, sistema_pendente: null }], ["41", { confidencial: false, sistema_pendente: null }]]);
  ok("o sistema respondeu: até 2 pendentes são reenviados com o número do item; o guardado perde o texto, o comum sem risco volta para a moderação");
  // a lista de pendentes falha (o campo ainda não existe no Directus): nada quebra
  chamadas = []; resposta[PENDENTES] = { status: 400, json: {} }; resposta["cuidado-pastoral-site"] = { status: 200, json: { sucesso: true, gravado: false, risco: false } };
  r = await chamar(base); assert.strictEqual(r.status, 200); assert.strictEqual(patches().length, 0);
  resposta[PENDENTES] = { status: 200, json: { data: [] } };
  ok("sem o campo sistema_pendente no Directus: o envio segue normal");
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
