// Bateria de verificação da API pública de camisetas, contra um site de verdade (06/10/2026).
// Cria um grupo de teste, exercita as rotas do site e apaga tudo no fim — os dados de teste
// nunca aparecem no site (slug "teste-…" é ignorado pela versão do conteúdo e o grupo é apagado).
//
// Variáveis: SITE_URL (padrão: produção), DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN, TELEFONE_CHAVE_SEGREDO.
// Uso local: ver site/scripts/testes/README.md. No CI: .github/workflows/site-testes.yml.
const crypto = require("node:crypto");
const { ambiente, Verificador, esperar } = require("./comum.cjs");

async function main() {
  const { SITE, dx, site, PEPPER } = ambiente();
  const v = new Verificador("camisetas");
  const tel = () => "9499" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");

  const slug = "teste-blindagem-" + Date.now();
  const g = await dx("POST", "/items/camiseta_grupos", { slug, nome: "TESTE DE BLINDAGEM (apagar)", ativo: true, limite_uma_por_pessoa: true, tamanhos: ["M"], modelos: ["Unico"], pedidos_ate: "2026-12-31" });
  if (!g.ok) { console.log("não criou grupo:", g.status, g.erro); process.exit(1); }
  const G = g.data.id; console.log(`[${SITE}] grupo de teste: ${G}`);
  try {
    let r = await site("GET", `/api/status-camiseta/${G}`); v.ok("status aberto", r.status === 200 && r.j.aberto === true, `${r.ms} ms`);
    const t1 = tel();
    r = await site("POST", "/api/criar-pedido-camiseta", { grupoId: G, nome: "Teste Um da Silva", telefone: t1, email: "Teste.Um@Exemplo.com", itens: [{ tamanho: "M", modelo: "Unico", quantidade: 1 }], respostas: [] });
    v.ok("pedido criado", r.status === 200 && r.j.pedidoId, `${r.ms} ms`);
    const ped1 = r.j.pedidoId, lote1 = r.j.lote;
    const gravado = (await dx("GET", `/items/camiseta_pedidos/${ped1}?fields=telefone,telefone_chave,email,itens.id`)).data;
    const chaveEsperada = crypto.createHmac("sha256", PEPPER).update(t1.slice(-8)).digest("hex");
    v.ok("chave gravada = HMAC esperado; e-mail minúsculo; item gravado junto", gravado?.telefone_chave === chaveEsperada && /:/.test(gravado?.telefone || "") && gravado?.email === "teste.um@exemplo.com" && (gravado?.itens || []).length === 1);
    r = await site("POST", "/api/criar-pedido-camiseta", { grupoId: G, nome: "Outro Nome", telefone: `(94) ${t1.slice(2, 7)}-${t1.slice(7)}`, itens: [{ tamanho: "M", modelo: "Unico", quantidade: 1 }] });
    v.ok("duplicado pelo telefone recusado (409)", r.status === 409, `${r.ms} ms`);
    r = await site("POST", "/api/criar-pedido-camiseta", { grupoId: G, nome: "Outro Nome", telefone: tel(), email: "teste.um@exemplo.com", itens: [{ tamanho: "M", modelo: "Unico", quantidade: 1 }] });
    v.ok("duplicado pelo e-mail recusado (409)", r.status === 409, `${r.ms} ms`);
    r = await site("POST", "/api/consultar-pedidos-camiseta", { telefone: t1 });
    v.ok("Meus pedidos acha pelo telefone (caminho rápido)", r.status === 200 && r.j.pedidos?.length === 1 && r.j.pedidos[0].retiradaLocal !== undefined && r.j.pedidos[0].loteNumero === 1, `${r.ms} ms`);
    // telefone cifrado -> botão de WhatsApp do painel (só com token do Directus que enxerga o pedido)
    const semToken = await fetch(`${SITE}/api/telefone-pedido/${ped1}`); v.ok("telefone-pedido sem token → 401", semToken.status === 401);
    const comTokenRuim = await fetch(`${SITE}/api/telefone-pedido/${ped1}`, { headers: { Authorization: "Bearer token-invalido" } }); v.ok("telefone-pedido com token inválido → 401", comTokenRuim.status === 401);
    const comToken = await fetch(`${SITE}/api/telefone-pedido/${ped1}`, { headers: { Authorization: "Bearer " + process.env.DIRECTUS_ADMIN_TOKEN } }); const tj = await comToken.json().catch(() => ({}));
    v.ok("telefone-pedido com token válido → número e link do WhatsApp", comToken.status === 200 && tj.digitos === t1 && tj.whatsapp === `https://wa.me/55${t1}` && /^\(\d{2}\) \d{5}-\d{4}$/.test(tj.telefone || ""), JSON.stringify({ tel: tj.telefone, wa: tj.whatsapp }));
    // pedido "antigo" (sem chave) simulado
    const t2 = tel(); const salt = crypto.randomBytes(16).toString("hex"); const hash = crypto.scryptSync(t2.slice(-8), salt, 64).toString("hex");
    const antigo = await dx("POST", "/items/camiseta_pedidos", { grupo: G, lote: lote1, nome: "Teste Antigo Pereira", telefone: `${salt}:${hash}`, telefone_chave: null });
    r = await site("POST", "/api/consultar-pedidos-camiseta", { telefone: t2 });
    v.ok("antigo: só telefone → pede o nome", r.status === 200 && r.j.pedidos?.length === 0 && r.j.precisaNome === true, `${r.ms} ms`);
    r = await site("POST", "/api/consultar-pedidos-camiseta", { telefone: t2, nome: "antigo pereira" });
    v.ok("antigo: telefone + nome → acha", r.status === 200 && r.j.pedidos?.length === 1 && r.j.pedidos[0].nome === "Teste Antigo Pereira", `${r.ms} ms`);
    const reind = (await dx("GET", `/items/camiseta_pedidos/${antigo.data.id}?fields=telefone_chave,telefone_cifrado`)).data;
    v.ok("antigo: chave e telefone cifrado gravados após achar", !!reind?.telefone_chave && /^v1:/.test(reind?.telefone_cifrado || ""));
    const antigoTel = await fetch(`${SITE}/api/telefone-pedido/${antigo.data.id}`, { headers: { Authorization: "Bearer " + process.env.DIRECTUS_ADMIN_TOKEN } }); const aj = await antigoTel.json().catch(() => ({}));
    v.ok("antigo: depois de achado, o painel já consegue o WhatsApp", antigoTel.status === 200 && aj.digitos === t2, JSON.stringify(aj.whatsapp));
    r = await site("POST", "/api/consultar-pedidos-camiseta", { telefone: t2 });
    v.ok("antigo: segunda consulta só com telefone → acha", r.status === 200 && r.j.pedidos?.length === 1, `${r.ms} ms`);
    r = await site("POST", "/api/consultar-pedidos-camiseta", { telefone: "94900000000", nome: "Teste Antigo Pereira" });
    v.ok("telefone errado com nome certo → nada", r.status === 200 && r.j.pedidos?.length === 0, `${r.ms} ms`);
    // separado → retirada na consulta; lote fechado → andamento
    await dx("PATCH", `/items/camiseta_grupos/${G}`, { retirada_local: "Secretaria da Sede, seg a sex 8h-12h", email_retirada_corpo: "Sua camiseta chegou. Traga o comprovante." });
    await dx("PATCH", `/items/camiseta_pedidos/${ped1}`, { separado: true, separado_em: new Date().toISOString() });
    await dx("PATCH", `/items/camiseta_lotes/${lote1}`, { status: "fechado", fechado_em: new Date().toISOString() });
    r = await site("POST", "/api/consultar-pedidos-camiseta", { telefone: t1 });
    const p = r.j.pedidos?.[0] || {};
    v.ok("separado: retirada, mensagem e lote fechado aparecem na consulta", p.separado === true && /Secretaria/.test(p.retiradaLocal || "") && /comprovante/.test(p.mensagemRetirada || "") && p.loteStatus === "fechado" && !!p.loteFechadoEm && !!p.criadoEm, `${r.ms} ms`);
    // prazo e ativo (cache da campanha na API: 10 s)
    await dx("PATCH", `/items/camiseta_grupos/${G}`, { pedidos_ate: "2026-10-05" });
    await esperar(11000);
    r = await site("POST", "/api/criar-pedido-camiseta", { grupoId: G, nome: "Fulano", telefone: tel(), itens: [{ tamanho: "M", modelo: "Unico", quantidade: 1 }] });
    v.ok("prazo vencido → 403", r.status === 403 && r.j.motivo === "prazo", `${r.ms} ms ${r.j.erro}`);
    await dx("PATCH", `/items/camiseta_grupos/${G}`, { pedidos_ate: "2027-01-01", ativo: false });
    await esperar(11000);
    r = await site("POST", "/api/criar-pedido-camiseta", { grupoId: G, nome: "Fulano", telefone: tel(), itens: [{ tamanho: "M", modelo: "Unico", quantidade: 1 }] });
    v.ok("inativo com prazo no futuro → 403 (ativo manda)", r.status === 403 && r.j.motivo === "inativo", `${r.ms} ms`);
    await esperar(21000); // cache do status: 20 s
    r = await site("GET", `/api/status-camiseta/${G}`); v.ok("status fechado após desativar", r.j.aberto === false && r.j.motivo === "inativo", `${r.ms} ms`);
    const lotes = (await dx("GET", `/items/camiseta_lotes?filter[grupo][_eq]=${G}&fields=id,status`)).data || [];
    v.ok("um lote só no grupo de teste", lotes.length === 1, JSON.stringify(lotes));
  } finally {
    await limparGrupo(dx, G);
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
