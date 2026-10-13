// Bateria da VENDA DE BALCÃO e da função "Gestor de Camisetas", contra um site de verdade (13/10/2026).
// Cria uma campanha FECHADA ao público (inativa, prazo vencido) e usuários de teste do Directus (um Gestor de Camisetas e um
// Editor de contatos), exercita /api/registrar-venda-balcao como o painel faz e apaga tudo no fim — nada aparece no site
// (slug "teste-…" é ignorado pela versão do conteúdo).
//
// Variáveis: SITE_URL (padrão: produção), DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN, TELEFONE_CHAVE_SEGREDO (ver README desta pasta).
const crypto = require("node:crypto");
const { ambiente, Verificador } = require("./comum.cjs");

async function main() {
  const { SITE, URL, PEPPER, dx, site } = ambiente();
  const v = new Verificador("venda de balcão");
  const tel = () => "9498" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
  const usuarios = [];
  let G = null, G2 = null;

  const papeis = (await dx("GET", "/roles?limit=-1&fields=id,name")).data || [];
  const papelGestor = papeis.find((p) => p.name === "Gestor de Camisetas");
  const papelOutro = papeis.find((p) => p.name === "Editor de contatos");
  v.ok("a função 'Gestor de Camisetas' existe no Directus", !!papelGestor);
  if (!papelGestor || !papelOutro) { await limpar(); v.fim(); return; }

  async function criarUsuario(papel, rotulo) {
    const senha = crypto.randomBytes(18).toString("base64url");
    const email = `teste-${rotulo}-${Date.now()}@exemplo.com`;
    const u = await dx("POST", "/users", { email, password: senha, first_name: "TESTE", last_name: `${rotulo} (apagar)`, role: papel.id, status: "active" });
    if (!u.ok) throw new Error("não criou o usuário de teste: " + u.status + " " + u.erro);
    usuarios.push(u.data.id);
    const l = await fetch(URL + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: senha, mode: "json" }) });
    const lj = await l.json().catch(() => ({}));
    if (!lj.data?.access_token) throw new Error("login do usuário de teste falhou: " + l.status);
    return lj.data.access_token;
  }
  const balcao = async (token, corpo) => {
    const t0 = Date.now();
    const r = await fetch(SITE + "/api/registrar-venda-balcao", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { "x-painel-token": token } : {}) }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, j, ms: Date.now() - t0 };
  };
  const comoGestor = (token, caminho, metodo = "GET", corpo) => fetch(URL + caminho, { method: metodo, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined }).then((r) => r.status);
  async function limpar() {
    for (const g of [G, G2]) if (g) await limparGrupo(dx, g);
    for (const id of usuarios) await dx("DELETE", `/users/${id}`);
  }

  try {
    const slug = "teste-balcao-" + Date.now();
    const g = await dx("POST", "/items/camiseta_grupos", { slug, nome: "TESTE BALCÃO (apagar)", ativo: false, limite_uma_por_pessoa: true, tamanhos: ["P", "GG"], modelos: ["Unico"], pedidos_ate: "2020-01-01" });
    if (!g.ok) { console.log("não criou grupo:", g.status, g.erro); await limpar(); process.exit(1); }
    G = g.data.id; console.log(`[${SITE}] campanha de teste: ${G}`);
    const gestor = await criarUsuario(papelGestor, "gestor");
    const outro = await criarUsuario(papelOutro, "outro");
    const item = (tamanho = "GG", quantidade = 1) => [{ tamanho, modelo: "Unico", quantidade }];

    // a função do gestor: vê camisetas, não vê o resto, não apaga campanha
    v.ok("gestor lê pedidos de camiseta", (await comoGestor(gestor, "/items/camiseta_pedidos?limit=1&fields=id")) === 200);
    v.ok("gestor NÃO lê notícias (403)", (await comoGestor(gestor, "/items/noticias?limit=1&fields=id")) === 403);
    v.ok("gestor NÃO lê inscrições de eventos (403)", (await comoGestor(gestor, "/items/inscricoes_eventos?limit=1&fields=id")) === 403);
    v.ok("gestor NÃO apaga campanha (403)", (await comoGestor(gestor, `/items/camiseta_grupos/${G}`, "DELETE")) === 403);

    // a campanha está fechada ao público
    let r = await site("POST", "/api/criar-pedido-camiseta", { grupoId: G, nome: "Fulano", telefone: tel(), itens: [{ tamanho: "GG", modelo: "Unico", quantidade: 1 }] });
    v.ok("o formulário público está fechado para esta campanha (403)", r.status === 403, `${r.ms} ms`);

    // quem pode e quem não pode
    r = await balcao(null, { grupoId: G, nome: "Ana", itens: item() }); v.ok("balcão sem token → 401", r.status === 401, `${r.ms} ms`);
    r = await balcao("token-invalido", { grupoId: G, nome: "Ana", itens: item() }); v.ok("balcão com token inválido → 401", r.status === 401, `${r.ms} ms`);
    r = await balcao(outro, { grupoId: G, nome: "Ana", itens: item() }); v.ok("balcão com outra função (Editor de contatos) → 403", r.status === 403, `${r.ms} ms ${r.j.erro || ""}`);
    v.ok("e nada foi gravado até aqui", ((await dx("GET", `/items/camiseta_pedidos?filter[grupo][_eq]=${G}&fields=id`)).data || []).length === 0);

    // validações
    r = await balcao(gestor, { grupoId: G, nome: "  ", itens: item() }); v.ok("sem nome → 400", r.status === 400, r.j.erro);
    r = await balcao(gestor, { grupoId: G, nome: "Ana", telefone: "123", itens: item() }); v.ok("telefone curto → 400", r.status === 400, r.j.erro);
    r = await balcao(gestor, { grupoId: G, nome: "Ana", email: "ana@x", itens: item() }); v.ok("e-mail inválido → 400", r.status === 400, r.j.erro);
    r = await balcao(gestor, { grupoId: G, nome: "Ana", itens: item("XG") }); v.ok("tamanho fora da lista da campanha → 400", r.status === 400, r.j.erro);
    r = await balcao(gestor, { grupoId: G, nome: "Ana", itens: item("GG", 0) }); v.ok("quantidade 0 → 400", r.status === 400, r.j.erro);
    r = await balcao(gestor, { grupoId: G, nome: "Ana", itens: [] }); v.ok("sem itens → 400", r.status === 400, r.j.erro);
    r = await balcao(gestor, { grupoId: 999999999, nome: "Ana", itens: item() }); v.ok("campanha que não existe → 404", r.status === 404, r.j.erro);
    v.ok("nada gravado pelas recusas", ((await dx("GET", `/items/camiseta_pedidos?filter[grupo][_eq]=${G}&fields=id`)).data || []).length === 0);

    // venda sem telefone nem e-mail, no lote aberto (que ainda não existe: nasce o lote 1)
    r = await balcao(gestor, { grupoId: G, nome: "Maria da Banca", congregacaoId: 1, itens: item("GG", 2), valorPago: 50 });
    v.ok("venda SEM telefone e SEM e-mail, com a campanha fechada → 200, lote 1 criado", r.status === 200 && r.j.pedidoId && r.j.loteNumero === 1 && r.j.telefoneGuardado === false && r.j.avulso === false, `${r.ms} ms ${JSON.stringify(r.j)}`);
    const lote1 = r.j.lote;
    let ped = (await dx("GET", `/items/camiseta_pedidos/${r.j.pedidoId}?fields=nome,telefone,telefone_chave,telefone_cifrado,email,congregacao,lote,avulso,valor_pago,itens.tamanho,itens.modelo,itens.quantidade,itens.quantidade_retirada`)).data;
    v.ok("gravou nome, congregação, lote, valor pago e o item; telefone e e-mail vazios", ped?.nome === "Maria da Banca" && ped.congregacao === 1 && ped.lote === lote1 && ped.avulso === false && Number(ped.valor_pago) === 50 && ped.telefone === null && ped.telefone_chave === null && ped.telefone_cifrado === null && ped.email === null && ped.itens?.length === 1 && ped.itens[0].tamanho === "GG" && ped.itens[0].quantidade === 2 && ped.itens[0].quantidade_retirada === 0, JSON.stringify(ped));

    // venda com telefone e e-mail
    const t1 = tel();
    r = await balcao(gestor, { grupoId: G, nome: "João Telefone", telefone: `(94) ${t1.slice(2, 7)}-${t1.slice(7)}`, email: "Joao.Teste@Exemplo.com", itens: item("P", 1) });
    v.ok("venda com telefone e e-mail → 200 no mesmo lote aberto", r.status === 200 && r.j.loteNumero === 1 && r.j.lote === lote1 && r.j.telefoneGuardado === true, `${r.ms} ms`);
    const ped1 = r.j.pedidoId;
    ped = (await dx("GET", `/items/camiseta_pedidos/${ped1}?fields=telefone,telefone_chave,telefone_cifrado,email`)).data;
    const chave = crypto.createHmac("sha256", PEPPER).update(t1.slice(-8)).digest("hex");
    v.ok("telefone: scrypt com salt + chave HMAC esperada + número cifrado; e-mail em minúsculas", /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(ped?.telefone || "") && ped.telefone_chave === chave && /^v1:/.test(ped.telefone_cifrado || "") && ped.email === "joao.teste@exemplo.com", JSON.stringify({ ...ped, telefone: "…", telefone_cifrado: "…" }));
    const wa = await fetch(`${SITE}/api/telefone-pedido/${ped1}`, { headers: { "x-painel-token": gestor } }); const waj = await wa.json().catch(() => ({}));
    v.ok("o gestor consegue o WhatsApp dessa venda no painel", wa.status === 200 && waj.digitos === t1, JSON.stringify({ status: wa.status, whatsapp: waj.whatsapp }));
    r = await site("POST", "/api/consultar-pedidos-camiseta", { telefone: t1 });
    v.ok("a pessoa acha a venda em 'Meus pedidos' pelo telefone", r.status === 200 && r.j.pedidos?.length === 1 && r.j.pedidos[0].nome === "João Telefone" && r.j.pedidos[0].loteNumero === 1, `${r.ms} ms`);

    // repetido
    r = await balcao(gestor, { grupoId: G, nome: "João de novo", telefone: t1, itens: item("P", 1) });
    v.ok("mesmo telefone na mesma campanha → 409 pedindo confirmação, nada gravado", r.status === 409 && r.j.duplicado === true && r.j.existentes?.[0]?.id === ped1, r.j.erro);
    r = await balcao(gestor, { grupoId: G, nome: "João de novo", email: "joao.teste@exemplo.com", itens: item("P", 1) });
    v.ok("mesmo e-mail → 409", r.status === 409 && r.j.duplicado === true, r.j.erro);
    r = await balcao(gestor, { grupoId: G, nome: "João de novo", telefone: t1, itens: item("P", 1), confirmarDuplicado: true });
    v.ok("com a confirmação do gestor, grava mesmo assim", r.status === 200 && r.j.pedidoId > ped1, `${r.ms} ms`);

    // lotes: um fechado da mesma campanha e um de outra campanha
    const l2 = await dx("POST", "/items/camiseta_lotes", { grupo: G, numero: 2, status: "fechado", fechado_em: new Date().toISOString() });
    const g2 = await dx("POST", "/items/camiseta_grupos", { slug: "teste-balcao-2-" + Date.now(), nome: "TESTE BALCÃO 2 (apagar)", ativo: false, tamanhos: ["P"], modelos: ["Unico"] });
    G2 = g2.data.id;
    const lOutro = await dx("POST", "/items/camiseta_lotes", { grupo: G2, numero: 1, status: "aberto" });
    r = await balcao(gestor, { grupoId: G, nome: "Lote Fechado", lote: l2.data.id, itens: item() });
    v.ok("lote fechado → 409 avisando que a peça fica fora da encomenda", r.status === 409 && r.j.loteFechado === true && /fechado/.test(r.j.erro || ""), r.j.erro);
    r = await balcao(gestor, { grupoId: G, nome: "Lote Fechado", lote: l2.data.id, itens: item(), confirmarLoteFechado: true });
    v.ok("lote fechado com a confirmação → grava nele", r.status === 200 && r.j.lote === l2.data.id && r.j.loteNumero === 2, `${r.ms} ms`);
    r = await balcao(gestor, { grupoId: G, nome: "Lote Alheio", lote: lOutro.data.id, itens: item() });
    v.ok("lote de outra campanha → 400", r.status === 400 && /outra campanha/.test(r.j.erro || ""), r.j.erro);
    r = await balcao(gestor, { grupoId: G, nome: "Lote Fantasma", lote: 999999999, itens: item() });
    v.ok("lote que não existe → 400", r.status === 400, r.j.erro);
    r = await balcao(gestor, { grupoId: G, nome: "No Lote Um", lote: lote1, itens: item() });
    v.ok("lote aberto escolhido pelo número → grava nele", r.status === 200 && r.j.lote === lote1, `${r.ms} ms`);

    // avulso
    r = await balcao(gestor, { grupoId: G, nome: "", lote: "avulso", itens: item("P", 3), valorPago: 90 });
    v.ok("avulso (sem nome) → 200, sem lote, nome 'Venda avulsa'", r.status === 200 && r.j.avulso === true && r.j.lote === null, `${r.ms} ms`);
    ped = (await dx("GET", `/items/camiseta_pedidos/${r.j.pedidoId}?fields=nome,avulso,lote,valor_pago`)).data;
    v.ok("gravado como avulso, sem lote", ped?.avulso === true && ped.lote === null && ped.nome === "Venda avulsa" && Number(ped.valor_pago) === 90, JSON.stringify(ped));

    // só um lote aberto no fim (nada de lote duplicado)
    const lotes = (await dx("GET", `/items/camiseta_lotes?filter[grupo][_eq]=${G}&fields=id,numero,status`)).data || [];
    v.ok("a campanha tem exatamente 2 lotes (1 aberto, 1 fechado)", lotes.length === 2 && lotes.filter((l) => l.status === "aberto").length === 1, JSON.stringify(lotes));
  } finally {
    await limpar();
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
