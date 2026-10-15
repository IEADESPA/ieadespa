// Bateria de "Tirar reserva", "Reenviar aviso" e do aviso em massa SELETIVO, contra um site de verdade (15/10/2026).
// Cria uma campanha "teste-…" (inativa) com dois lotes e pedidos separados/não separados/com e sem e-mail, e um usuário de teste com a função
// "Gestor de Camisetas". NUNCA envia e-mail: o aviso em massa só roda em modo `simular` (conta, não envia nem carimba). Apaga tudo no fim.
//
// Variáveis: SITE_URL (padrão: produção), DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN, TELEFONE_CHAVE_SEGREDO (ver README desta pasta).
const crypto = require("node:crypto");
const { ambiente, Verificador } = require("./comum.cjs");

async function main() {
  const { SITE, URL, dx } = ambiente();
  const v = new Verificador("reserva e aviso seletivo");
  let G = null, usuario = null;
  const papel = ((await dx("GET", "/roles?filter[name][_eq]=Gestor%20de%20Camisetas&fields=id")).data || [])[0];
  v.ok("a função 'Gestor de Camisetas' existe no Directus", !!papel);
  if (!papel) { v.fim(); return; }
  const massa = async (token, corpo) => {
    const r = await fetch(SITE + "/api/avisar-retirada-camisetas", { method: "POST", headers: { "Content-Type": "application/json", "x-painel-token": token }, body: JSON.stringify(corpo) });
    return { status: r.status, j: await r.json().catch(() => ({})) };
  };
  try {
    const g = await dx("POST", "/items/camiseta_grupos", { slug: "teste-reserva-" + Date.now(), nome: "TESTE RESERVA (apagar)", ativo: false, tamanhos: ["M"], modelos: ["Unico"], retirada_local: "Secretaria" });
    if (!g.ok) { console.log("não criou grupo:", g.status, g.erro); process.exit(1); }
    G = g.data.id; console.log(`[${SITE}] campanha de teste: ${G}`);
    const L1 = (await dx("POST", "/items/camiseta_lotes", { grupo: G, numero: 1, status: "aberto" })).data.id;
    const L2 = (await dx("POST", "/items/camiseta_lotes", { grupo: G, numero: 2, status: "fechado", fechado_em: new Date().toISOString() })).data.id;
    const agora = new Date().toISOString();
    const pedido = async (nome, extra) => (await dx("POST", "/items/camiseta_pedidos", { grupo: G, lote: L1, nome, valor_pago: 30, itens: [{ tamanho: "M", modelo: "Unico", quantidade: 1 }], ...extra })).data.id;
    const A = await pedido("Teste A separado com e-mail", { email: "a@exemplo.com", separado: true, separado_em: agora });
    await pedido("Teste B nao separado com e-mail", { email: "b@exemplo.com" });
    await pedido("Teste C separado lote 2", { email: "c@exemplo.com", separado: true, separado_em: agora, lote: L2 });
    await pedido("Teste D separado sem e-mail", { separado: true, separado_em: agora });
    await pedido("Teste E separado ja avisado", { email: "e@exemplo.com", separado: true, separado_em: agora, aviso_retirada_em: agora });
    const adm = process.env.DIRECTUS_ADMIN_TOKEN;

    // aviso em massa: contagens por filtro (só simulação)
    let r = await massa(adm, { grupoId: G, simular: true });
    v.ok("sem filtro: 3 receberiam (A, B, C), 1 já avisado, 1 sem e-mail, não seletivo", r.status === 200 && r.j.restantes === 3 && r.j.jaAvisados === 1 && r.j.semEmail === 1 && r.j.seletivo === false, JSON.stringify(r.j));
    r = await massa(adm, { grupoId: G, simular: true, somenteSeparados: true });
    v.ok("só separados: 2 receberiam (A e C; B tem e-mail mas não tem reserva), seletivo", r.status === 200 && r.j.restantes === 2 && r.j.seletivo === true && r.j.jaAvisados === 1 && r.j.semEmail === 1, JSON.stringify(r.j));
    r = await massa(adm, { grupoId: G, simular: true, loteId: L1 });
    v.ok("só o lote 1: 2 receberiam (A e B)", r.status === 200 && r.j.restantes === 2 && r.j.seletivo === true, JSON.stringify(r.j));
    r = await massa(adm, { grupoId: G, simular: true, somenteSeparados: true, loteId: L1 });
    v.ok("separados do lote 1: só A", r.status === 200 && r.j.restantes === 1, JSON.stringify(r.j));
    r = await massa(adm, { grupoId: G, simular: true, loteId: "abc" });
    v.ok("lote inválido → 400", r.status === 400, JSON.stringify(r.j));
    r = await massa("token-invalido", { grupoId: G, simular: true, somenteSeparados: true });
    v.ok("token inválido → 401", r.status === 401, JSON.stringify(r.j));
    const depois = (await dx("GET", `/items/camiseta_grupos/${G}?fields=retirada_liberada`)).data;
    const carimbados = (await dx("GET", `/items/camiseta_pedidos?filter[grupo][_eq]=${G}&filter[aviso_retirada_em][_nnull]=true&aggregate[count]=id`)).data;
    v.ok("a simulação não liberou a retirada nem carimbou ninguém", depois.retirada_liberada === false && Number(carimbados[0].count.id) === 1, JSON.stringify({ depois, carimbados }));

    // o gestor pode tirar a reserva e carimbar o aviso (o que os botões novos do painel fazem), direto no Directus, com o próprio token
    const senha = crypto.randomBytes(18).toString("base64url");
    const email = `teste-reserva-${Date.now()}@exemplo.com`;
    const u = await dx("POST", "/users", { email, password: senha, first_name: "TESTE", last_name: "reserva (apagar)", role: papel.id, status: "active" });
    usuario = u.data.id;
    const lg = await (await fetch(URL + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: senha, mode: "json" }) })).json();
    const comoGestor = (metodo, caminho, corpo) => fetch(URL + caminho, { method: metodo, headers: { Authorization: "Bearer " + lg.data.access_token, "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }).then((x) => x.status);
    v.ok("gestor TIRA a reserva (separado=false, sem data) com o próprio token", (await comoGestor("PATCH", `/items/camiseta_pedidos/${A}`, { separado: false, separado_em: null })) === 200);
    const A1 = (await dx("GET", `/items/camiseta_pedidos/${A}?fields=separado,separado_em,valor_pago,lote`)).data;
    v.ok("o pedido continua, com valor pago e lote, só sem a reserva", A1.separado === false && A1.separado_em === null && Number(A1.valor_pago) === 30 && A1.lote === L1, JSON.stringify(A1));
    v.ok("gestor carimba 'avisado em' (reenviar aviso)", (await comoGestor("PATCH", `/items/camiseta_pedidos/${A}`, { aviso_retirada_em: new Date().toISOString() })) === 200);
    r = await massa(lg.data.access_token, { grupoId: G, simular: true, somenteSeparados: true });
    v.ok("o gestor consegue conferir o aviso seletivo pelo painel (token dele)", r.status === 200 && r.j.restantes === 1, JSON.stringify(r.j));
    v.ok("e depois de tirada a reserva de A, só C receberia (A não está mais separado)", r.j.restantes === 1);
  } finally {
    if (G) await limparGrupo(dx, G);
    if (usuario) await dx("DELETE", `/users/${usuario}`);
    v.fim();
  }
}

async function limparGrupo(dx, G) {
  const peds = (await dx("GET", `/items/camiseta_pedidos?filter[grupo][_eq]=${G}&fields=id&limit=-1`)).data || [];
  const ids = peds.map((x) => x.id);
  if (ids.length) {
    const itens = (await dx("GET", `/items/camiseta_itens_pedido?filter[pedido][_in]=${ids.join(",")}&fields=id&limit=-1`)).data || [];
    if (itens.length) await dx("DELETE", "/items/camiseta_itens_pedido", itens.map((x) => x.id));
    await dx("DELETE", "/items/camiseta_pedidos", ids);
  }
  const lotes = (await dx("GET", `/items/camiseta_lotes?filter[grupo][_eq]=${G}&fields=id`)).data || [];
  if (lotes.length) await dx("DELETE", "/items/camiseta_lotes", lotes.map((x) => x.id));
  const del = await dx("DELETE", `/items/camiseta_grupos/${G}`);
  console.log("limpeza: pedidos", ids.length, "lotes", lotes.length, "grupo apagado:", del.ok);
}

main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
