// Testes de UNIDADE do "status" público da camiseta e do evento (api/StatusCamiseta e api/StatusInscricao), sem rede: com a memória vencida e MUITAS aberturas de página no mesmo
// instante, só UMA consulta (por campanha/evento) vai ao Directus e todo mundo recebe a mesma resposta. Medido em 19/10/2026 em produção: 200 aberturas simultâneas levavam ~20 s
// no meio e 4 falhavam (cada uma consultava o Directus por conta própria, antes de a primeira terminar de encher a memória). Como rodar (de dentro de site/):
//   node scripts/testes/status-publico-unidade.cjs
process.env.DIRECTUS_URL = "http://directus.teste";
process.env.DIRECTUS_ADMIN_TOKEN = "token-de-teste";

let falhas = 0;
const eq = (a, b, d) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { falhas++; console.log("  FALHA", d, "→", JSON.stringify(a), "esperado", JSON.stringify(b)); } else console.log("  ok   ", d);
};
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

// uma instância "nova" do Azure Functions: memória e consultas em andamento zeradas
function carregar(nome) {
  for (const k of Object.keys(require.cache)) if (/StatusCamiseta|StatusInscricao|limiteLote/.test(k)) delete require.cache[k];
  return require(`../../api/${nome}/index.js`);
}
const contexto = () => ({ res: null, log: Object.assign(() => {}, { warn() {}, error() {} }) });
async function chamar(handler, params) {
  const context = contexto();
  await handler(context, { params, headers: {} });
  return context.res;
}

const original = global.fetch;
const originalAgora = Date.now;
function fingirDirectus({ atraso = 30, falhar = false } = {}) {
  const chamadas = [];
  global.fetch = async (url) => {
    chamadas.push(String(url));
    await dormir(atraso);
    if (falhar) return json(503, { errors: [{ message: "ocupado" }] });
    const u = String(url);
    if (u.includes("/items/camiseta_grupos/")) return json(200, { data: { id: 10, ativo: true, pedidos_ate: null, tamanhos: ["P", "M"], limite_total: 100, limites_tamanho: null } });
    if (u.includes("/items/camiseta_itens_pedido")) return json(200, { data: [{ tamanho: "M", sum: { quantidade: "5" } }] });
    if (u.includes("/items/eventos/")) return json(200, { data: { id: 7, aceita_inscricao: true, inscricoes_encerradas: false, inscricoes_ate: "2099-12-31", vagas_limite: 50, requer_aprovacao: false } });
    if (u.includes("/items/inscricoes_eventos")) return json(200, { data: [{ count: { id: "12" } }] });
    return json(404, { errors: [] });
  };
  return chamadas;
}

(async () => {
  console.log("== status da camiseta: 300 aberturas ao mesmo tempo, memória vazia ==");
  {
    const H = carregar("StatusCamiseta");
    const chamadas = fingirDirectus();
    const rs = await Promise.all(Array.from({ length: 300 }, () => chamar(H, { grupoId: "10" })));
    eq(rs.every((r) => r.status === 200 && r.body.aberto === true), true, "as 300 recebem 200 e 'aberto'");
    eq(chamadas.length, 2, `só 2 consultas ao Directus no total (a campanha e a soma das peças), não 600 — foram ${chamadas.length}`);
    eq(new Set(rs.map((r) => JSON.stringify(r.body))).size, 1, "todas recebem exatamente a mesma resposta");
    const antes = chamadas.length;
    await Promise.all(Array.from({ length: 300 }, () => chamar(H, { grupoId: "10" })));
    eq(chamadas.length - antes, 0, "logo depois, 300 aberturas a mais NÃO consultam o Directus (memória de 20 s / 5 s)");
    // a memória vence: a próxima rodada refaz UMA consulta de cada
    const t0 = Date.now();
    Date.now = () => t0 + 25000;
    const antes2 = chamadas.length;
    const rs2 = await Promise.all(Array.from({ length: 300 }, () => chamar(H, { grupoId: "10" })));
    Date.now = originalAgora;
    eq([rs2.every((r) => r.status === 200), chamadas.length - antes2], [true, 2], "passados 25 s, 300 aberturas simultâneas refazem só 2 consultas (uma de cada)");
  }

  console.log("== status da camiseta: Directus ocupado ==");
  {
    const H = carregar("StatusCamiseta");
    let chamadas = fingirDirectus({ falhar: true });
    const rs = await Promise.all(Array.from({ length: 100 }, () => chamar(H, { grupoId: "10" })));
    eq([rs.every((r) => r.status === 502), chamadas.length], [true, 1], "Directus fora: as 100 recebem 502 por UMA consulta só (não 100)");
    chamadas = fingirDirectus();
    const depois = await chamar(H, { grupoId: "10" });
    eq(depois.status, 200, "a falha não fica guardada: a abertura seguinte consulta de novo e funciona");
  }

  console.log("== status da camiseta: campanhas diferentes não esperam uma pela outra ==");
  {
    const H = carregar("StatusCamiseta");
    const chamadas = fingirDirectus();
    await Promise.all([...Array.from({ length: 50 }, () => chamar(H, { grupoId: "10" })), ...Array.from({ length: 50 }, () => chamar(H, { grupoId: "11" }))]);
    eq(chamadas.filter((u) => u.includes("/camiseta_grupos/10")).length + chamadas.filter((u) => u.includes("/camiseta_grupos/11")).length, 2, "uma consulta de campanha para cada (10 e 11)");
  }

  console.log("== status do evento: 300 aberturas ao mesmo tempo, memória vazia ==");
  {
    const H = carregar("StatusInscricao");
    const chamadas = fingirDirectus();
    const rs = await Promise.all(Array.from({ length: 300 }, () => chamar(H, { eventoId: "7" })));
    eq(rs.every((r) => r.status === 200 && r.body.aberto === true && r.body.vagasRestantes === 38), true, "as 300 recebem 200, 'aberto' e 38 vagas restantes (50 - 12)");
    eq(chamadas.length, 2, `só 2 consultas ao Directus (o evento e a contagem), não 600 — foram ${chamadas.length}`);
    const antes = chamadas.length;
    await Promise.all(Array.from({ length: 300 }, () => chamar(H, { eventoId: "7" })));
    eq(chamadas.length - antes, 0, "logo depois, nenhuma consulta nova (memória de 20 s)");
  }

  console.log("== status do evento: Directus ocupado ==");
  {
    const H = carregar("StatusInscricao");
    let chamadas = fingirDirectus({ falhar: true });
    const rs = await Promise.all(Array.from({ length: 100 }, () => chamar(H, { eventoId: "7" })));
    eq([rs.every((r) => r.status === 502), chamadas.length], [true, 1], "Directus fora: as 100 recebem 502 por UMA consulta só");
    chamadas = fingirDirectus();
    eq((await chamar(H, { eventoId: "7" })).status, 200, "a falha não fica guardada");
  }

  console.log("== o teste do teste: sem a espera comum, a mesma rajada vira 600 consultas ==");
  {
    // versão "antiga" simulada: cada abertura consulta por conta própria enquanto a memória está vazia
    const memoria = new Map();
    const chamadas = fingirDirectus();
    const antigo = async () => { if (memoria.has("g")) return memoria.get("g"); const r = await (await fetch("http://directus.teste/items/camiseta_grupos/10?fields=*")).json(); await fetch("http://directus.teste/items/camiseta_itens_pedido?x"); memoria.set("g", r); return r; };
    await Promise.all(Array.from({ length: 300 }, antigo));
    eq(chamadas.length, 600, "sem a espera comum, 300 aberturas simultâneas fazem 600 consultas (é o que acontecia)");
  }

  global.fetch = original;
  console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.log("ERRO NO TESTE:", e && e.stack); process.exit(1); });
