// e2e-25-cuidado-seguranca.js — v7.11 (Cuidado pastoral), a bateria de segurança sobre a base "cenario-pastoral": a matriz ator × ação, o "404 igual" para o que não existe e
// para o que a pessoa não pode ver, lixo de toda espécie em cada campo de cada ação (nunca 500, nunca vaza texto interno, recusa nunca mexe no banco), marcação e SQL nos textos,
// método trocado, sessão de PIN com permissão "enxertada" e o cabeçalho no-store.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path, chamar, GET, POST, LIDER, GERAL, PIN, sessao, LIXO } = L;
const H = require(path.join(API, "GestaoCuidadoPastoral/index.js"));

const PERM = ["cuidado_pastoral", "pessoas"];
const C = "Central E2E", V = "Vila Nova E2E";
const DIR_C = LIDER(3001, PERM, [C]), DIR_V = LIDER(3002, PERM, [V]), PAREA = LIDER(3003, PERM, [C, V], "AREA"), SEC = GERAL(1002, ["cuidado_pastoral"]);
const DIR_SEM_PERM = LIDER(3001, ["pessoas", "protecao_menores"], [C]);
const PIN_ENXERTADO = sessao(3001, { via: "PIN", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM });
const P = { ana: 8010, bento: 8011, carla: 8012, gabi: 8016, joao: 8019, iris: 8018, vilaA: 8030 };

async function retrato() {
  const partes = [];
  for (const t of ["CuidadoItens", "CuidadoEventos", "NotasPastorais", "NotasPastoraisLeituras", "PedidosOracao", "Notificacoes"]) partes.push(JSON.stringify(await um(`SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM ${t}`)));
  return partes.join("|");
}
const ACEITOS = [200, 201, 400, 403, 404, 409, 422, 428, 429];
async function fuzz(rotulo, { acao, metodo = "POST", token, base, campos }) {
  let chamadas = 0; const quebras = [], mudancas = [];
  for (const campo of campos) for (const lixo of LIXO) {
    const corpo = { ...base };
    if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
    const antes = await retrato();
    const r = metodo === "GET" ? await chamar(H, { acao, metodo, token, query: corpo }) : await chamar(H, { acao, metodo, token, corpo });
    chamadas++;
    if (!ACEITOS.includes(r.status)) quebras.push(`${rotulo}.${campo} = ${JSON.stringify(lixo).slice(0, 40)} -> ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
    else if (r.status >= 400 && (await retrato()) !== antes) mudancas.push(`${rotulo}.${campo} = ${JSON.stringify(lixo).slice(0, 40)} (${r.status}) mexeu no banco`);
    if (r.body && /SELECT |INSERT |UPDATE |ConnectionError|mssql|tedious|at Object|node_modules|RequestError/i.test(JSON.stringify(r.body))) quebras.push(`${rotulo}.${campo} vazou texto interno: ${JSON.stringify(r.body).slice(0, 160)}`);
  }
  ok(quebras.length === 0, `${rotulo}: ${chamadas} chamadas com lixo, nenhuma 500 nem vazamento`, quebras.slice(0, 5));
  ok(mudancas.length === 0, `${rotulo}: chamada recusada nunca altera o banco`, mudancas.slice(0, 5));
}

(async () => {
  await obterPool();
  const c1 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = @n", { n: C });
  const c2 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = @n", { n: V });
  // o mundo mínimo: um item da Central com a Gabi responsável, uma nota de cada nível, um pedido da Carla
  const it = (await POST(H, "abrir", DIR_C, { tipo: "AFASTAMENTO", congregacaoId: c1, membroId: P.ana, responsavelMembroId: P.gabi })).body.itemId;
  const vis = (await POST(H, "abrir", DIR_C, { tipo: "VISITANTE", congregacaoId: c1, pessoaNome: "Visitante Seg E2E", pessoaContato: "91 90000-0000" })).body.itemId;
  const nota = (await POST(H, "nota", DIR_C, { membroId: P.ana, nivel: "LIDERANCA", texto: "nota da segurança" })).body.notaId;
  const ped = (await POST(H, "pedir-oracao", PIN(P.carla), { categoria: "SAUDE", texto: "pedido da segurança", podeBoletim: true })).body.pedidoId;
  ok(it && vis && nota && ped, "o mundo mínimo da bateria existe", { it, vis, nota, ped });

  console.log("== matriz ator × ação ==");
  const GESTAO_POST = { abrir: { tipo: "VISITANTE", congregacaoId: c1, pessoaNome: "X E2E", pessoaContato: "91 9999" }, atribuir: { itemId: it, responsavelMembroId: P.joao }, adiar: { itemId: it, novoPrazo: "2030-01-01", motivo: "motivo" },
    cancelar: { itemId: it, desfecho: "ENGANO", motivo: "motivo" }, "buscar-pessoas": { congregacaoId: c1, q: "Ana" }, "registrar-pedido": { congregacaoId: c1, membroId: P.bento, categoria: "SAUDE", texto: "texto", podeBoletim: true },
    moderar: { pedidoId: ped, decisao: "NAO_PUBLICAR" }, risco: { pedidoId: ped, marcar: true }, "acompanhar-pedido": { pedidoId: ped } };
  const GESTAO_GET = ["fila", "painel", "congregacoes", "pedidos", "boletim"];
  for (const [rot, tok] of [["membro por PIN", PIN(P.gabi)], ["liderança sem a permissão", DIR_SEM_PERM], ["PIN com permissão enxertada no token", PIN_ENXERTADO]]) {
    const antes = await retrato();
    const res = [];
    for (const [acao, corpo] of Object.entries(GESTAO_POST)) res.push([acao, (await POST(H, acao, tok, corpo)).status]);
    for (const acao of GESTAO_GET) res.push([acao, (await GET(H, acao, tok)).status]);
    ok(res.every(([, s]) => s === 403), `${rot}: TODA ação da liderança responde 403`, res.filter(([, s]) => s !== 403));
    ok((await retrato()) === antes, `${rot}: e nada mudou no banco`);
  }
  ok((await GET(H, "fila", null)).status === 401, "sem sessão: 401");
  ok((await POST(H, "pedir-oracao", null, { categoria: "SAUDE", texto: "x x x x x", podeBoletim: true })).status === 401, "pedir oração sem sessão: 401 (não há canal anônimo aqui)");

  console.log("== o mesmo 404 para o que não existe e para o que não se pode ver ==");
  const iguais = async (rot, a, b) => { ok(a.status === 404 && b.status === 404 && JSON.stringify(a.body) === JSON.stringify(b.body), rot, [a.status, b.status, a.body, b.body]); };
  await iguais("item de outra congregação × inexistente", await GET(H, "item", DIR_V, { itemId: it }), await GET(H, "item", DIR_V, { itemId: 999999 }));
  await iguais("item sobre a própria pessoa × inexistente", await GET(H, "item", PIN(P.ana), { itemId: it }), await GET(H, "item", PIN(P.ana), { itemId: 999999 }));
  await iguais("contato em item alheio × inexistente", await POST(H, "contato", PIN(P.joao), { itemId: it, forma: "LIGACAO", conseguiu: true }), await POST(H, "contato", PIN(P.joao), { itemId: 999999, forma: "LIGACAO", conseguiu: true }));
  await iguais("nota de outra congregação × inexistente", await POST(H, "abrir-nota", DIR_V, { notaId: nota }), await POST(H, "abrir-nota", DIR_V, { notaId: 999999 }));
  await iguais("nota sobre a própria pessoa × inexistente", await POST(H, "abrir-nota", PIN(P.ana), { notaId: nota }), await POST(H, "abrir-nota", PIN(P.ana), { notaId: 999999 }));
  await iguais("notas de membro de outra congregação × membro inexistente", await GET(H, "notas", DIR_V, { membroId: P.ana }), await GET(H, "notas", DIR_V, { membroId: 999999 }));
  await iguais("moderar pedido de outra congregação × inexistente", await POST(H, "moderar", DIR_V, { pedidoId: ped, decisao: "NAO_PUBLICAR" }), await POST(H, "moderar", DIR_V, { pedidoId: 999999, decisao: "NAO_PUBLICAR" }));
  await iguais("risco em pedido de outra congregação × inexistente", await POST(H, "risco", DIR_V, { pedidoId: ped, marcar: true }), await POST(H, "risco", DIR_V, { pedidoId: 999999, marcar: true }));
  await iguais("leituras de nota alheia × inexistente", await GET(H, "leituras", PAREA, { notaId: nota }), await GET(H, "leituras", PAREA, { notaId: 999999 }));
  const proprio = (await POST(H, "pedir-oracao", DIR_C, { categoria: "FAMILIA", texto: "pedido do próprio Dirigente", podeBoletim: true })).body.pedidoId;
  ok(!(await GET(H, "pedidos", DIR_C)).body.pedidos.some((p) => p.pedidoId === proprio), "o Dirigente não modera o pedido que ele mesmo fez");
  ok((await POST(H, "moderar", DIR_C, { pedidoId: proprio, decisao: "APROVAR" })).status === 404, "nem pelo número");
  ok((await GET(H, "pedidos", PAREA)).body.pedidos.some((p) => p.pedidoId === proprio), "quem modera é o degrau de cima (o Pastor de Área)");

  console.log("== método e ação ==");
  ok((await chamar(H, { acao: "fila", metodo: "POST", token: DIR_C, corpo: {} })).status === 404, "POST numa ação de leitura: 404");
  ok((await chamar(H, { acao: "abrir", metodo: "GET", token: DIR_C })).status === 404, "GET numa ação de escrita: 404");
  ok((await chamar(H, { acao: "nada-disso", metodo: "GET", token: DIR_C })).status === 404, "ação inexistente: 404");
  ok((await chamar(H, { acao: "fila", metodo: "PUT", token: DIR_C })).status === 405, "PUT: 405");
  const cab = await GET(H, "item", DIR_C, { itemId: it });
  ok(cab.headers && /no-store/.test(cab.headers["Cache-Control"]), "toda resposta leva Cache-Control: no-store (nome e nota não ficam em cache)");
  ok((await GET(H, "fila", DIR_C, { congregacaoId: "0x10" })).status === 400 && (await GET(H, "item", DIR_C, { itemId: "1e1" })).status === 400, "identificador mal escrito (0x10, 1e1): 400");
  ok((await POST(H, "abrir", DIR_C, [1, 2])).status !== 500, "corpo que é lista não derruba");

  console.log("== marcação e SQL nos textos ==");
  const XSS = "<img src=x onerror=alert(1)>";
  const recusas = [];
  for (const [acao, tok, corpo] of [
    ["abrir", DIR_C, { tipo: "VISITANTE", congregacaoId: c1, pessoaNome: XSS, pessoaContato: "91 9999" }],
    ["abrir", DIR_C, { tipo: "VISITANTE", congregacaoId: c1, pessoaNome: "Nome Ok", pessoaContato: XSS }],
    ["abrir", DIR_C, { tipo: "VISITANTE", congregacaoId: c1, pessoaNome: "Nome Ok", pessoaContato: "91 9999", motivo: XSS }],
    ["contato", PIN(P.gabi), { itemId: it, forma: "VISITA_LAR", conseguiu: true, acompanhante: XSS }],
    ["contato", PIN(P.gabi), { itemId: it, forma: "LIGACAO", conseguiu: true, observacao: XSS }],
    ["nota", DIR_C, { membroId: P.ana, nivel: "EQUIPE", texto: XSS }],
    ["pedir-oracao", PIN(P.bento), { categoria: "SAUDE", texto: XSS, podeBoletim: true }],
    ["pedir-visita", PIN(P.bento), { motivo: XSS }],
    ["moderar", DIR_C, { pedidoId: ped, decisao: "APROVAR", textoBoletim: `Alguém ${XSS}` }],
    ["adiar", DIR_C, { itemId: it, novoPrazo: "2026-12-01", motivo: XSS }],
    ["concluir", DIR_C, { itemId: vis, desfecho: "OUTRO", observacao: XSS }],
    ["risco", DIR_C, { pedidoId: ped, marcar: false, motivo: XSS }]
  ]) { const r = await POST(H, acao, tok, corpo); if (r.status < 400) recusas.push(`${acao} aceitou marcação (${r.status})`); }
  ok(recusas.length === 0, "todo texto com < ou > é recusado na entrada (nada de marcação gravada)", recusas);
  const comMarca = await escalar(`SELECT (SELECT COUNT(*) FROM CuidadoItens WHERE PessoaNome LIKE '%<%' OR PessoaContato LIKE '%<%' OR Motivo LIKE '%<%')
    + (SELECT COUNT(*) FROM CuidadoEventos WHERE Observacao LIKE '%<%' OR Acompanhante LIKE '%<%') + (SELECT COUNT(*) FROM NotasPastorais WHERE Texto LIKE '%<%')
    + (SELECT COUNT(*) FROM PedidosOracao WHERE Texto LIKE '%<%' OR TextoBoletim LIKE '%<%')`);
  ok(comMarca === 0, "e o banco não tem nenhum texto com marcação", comMarca);
  const injecao = "Robert'); DROP TABLE CuidadoItens; --";
  const ri = await POST(H, "abrir", DIR_C, { tipo: "VISITANTE", congregacaoId: c1, pessoaNome: injecao, pessoaContato: "91 9999 ' OR 1=1 --" });
  ok(ri.status === 201 && (await escalar("SELECT COUNT(*) FROM CuidadoItens WHERE PessoaNome = @n", { n: injecao })) === 1, "texto com SQL é gravado como texto (consulta parametrizada) e a tabela continua lá");
  const busca = await POST(H, "buscar-pessoas", DIR_C, { congregacaoId: c1, q: "%" });
  ok(busca.status === 200 && busca.body.pessoas.length === 0, "a busca de pessoas não aceita curinga (% e _): ninguém lista o cadastro inteiro", busca.body);
  const busca2 = await POST(H, "buscar-pessoas", DIR_C, { congregacaoId: c2, q: "Vila" });
  ok(busca2.status === 404, "nem busca pessoas de outra congregação");

  console.log("== lixo em todo campo ==");
  const nPed = async () => (await POST(H, "pedir-oracao", PIN(P.iris), { categoria: "GRATIDAO", texto: "pedido base do fuzz", podeBoletim: true })).body.pedidoId;
  await fuzz("abrir", { acao: "abrir", token: DIR_C, base: { tipo: "VISITANTE", congregacaoId: c1, pessoaNome: "Fuzz E2E", pessoaContato: "91 9999", motivo: "m", urgente: false }, campos: ["tipo", "congregacaoId", "membroId", "pessoaNome", "pessoaContato", "motivo", "responsavelMembroId", "urgente"] });
  await fuzz("contato", { acao: "contato", token: PIN(P.gabi), base: { itemId: it, forma: "LIGACAO", conseguiu: true, observacao: "o" }, campos: ["itemId", "forma", "conseguiu", "acompanhante", "observacao", "data"] });
  await fuzz("atribuir", { acao: "atribuir", token: DIR_C, base: { itemId: it, responsavelMembroId: P.gabi }, campos: ["itemId", "responsavelMembroId"] });
  await fuzz("adiar", { acao: "adiar", token: DIR_C, base: { itemId: it, novoPrazo: "2026-12-01", motivo: "motivo bom" }, campos: ["itemId", "novoPrazo", "motivo"] });
  await fuzz("nota", { acao: "nota", token: DIR_C, base: { membroId: P.ana, nivel: "EQUIPE", texto: "nota fuzz" }, campos: ["membroId", "itemId", "nivel", "texto", "retificaNotaId"] });
  await fuzz("abrir-nota", { acao: "abrir-nota", token: DIR_C, base: { notaId: nota }, campos: ["notaId"] });
  await fuzz("pedir-oracao", { acao: "pedir-oracao", token: PIN(P.joao), base: { categoria: "SAUDE", texto: "pedido fuzz", podeBoletim: true, querContato: false, paraQuem: "PROPRIO" }, campos: ["categoria", "texto", "podeBoletim", "querContato", "paraQuem"] });
  await fuzz("pedir-visita", { acao: "pedir-visita", token: PIN(P.vilaA), base: { motivo: "visita fuzz", hospital: false, contato: "tarde" }, campos: ["motivo", "hospital", "contato"] });
  await fuzz("registrar-pedido", { acao: "registrar-pedido", token: DIR_C, base: { congregacaoId: c1, solicitanteNome: "Fora Fuzz", solicitanteContato: "91 9999", categoria: "SAUDE", texto: "texto fuzz", podeBoletim: true }, campos: ["congregacaoId", "membroId", "solicitanteNome", "solicitanteContato", "categoria", "texto", "podeBoletim"] });
  await fuzz("moderar", { acao: "moderar", token: DIR_C, base: { pedidoId: await nPed(), decisao: "NAO_PUBLICAR" }, campos: ["pedidoId", "decisao", "textoBoletim"] });
  await fuzz("risco", { acao: "risco", token: DIR_C, base: { pedidoId: await nPed(), marcar: false, motivo: "motivo bom" }, campos: ["pedidoId", "marcar", "motivo"] });
  await fuzz("buscar-pessoas", { acao: "buscar-pessoas", token: DIR_C, base: { congregacaoId: c1, q: "Ana" }, campos: ["congregacaoId", "q"] });
  await fuzz("fila (GET)", { acao: "fila", metodo: "GET", token: DIR_C, base: { situacao: "ABERTOS" }, campos: ["situacao", "congregacaoId", "tipo"] });
  await fuzz("pedidos (GET)", { acao: "pedidos", metodo: "GET", token: DIR_C, base: { situacao: "AGUARDANDO" }, campos: ["situacao", "congregacaoId"] });
  await fuzz("notas (GET)", { acao: "notas", metodo: "GET", token: DIR_C, base: { membroId: P.ana }, campos: ["membroId", "itemId"] });
  await fuzz("item (GET)", { acao: "item", metodo: "GET", token: DIR_C, base: { itemId: it }, campos: ["itemId"] });
  await fuzz("concluir", { acao: "concluir", token: DIR_C, base: { itemId: vis, desfecho: "OUTRO" }, campos: ["itemId", "desfecho", "observacao"] });
  await fuzz("cancelar", { acao: "cancelar", token: DIR_C, base: { itemId: 999999, desfecho: "ENGANO", motivo: "motivo bom" }, campos: ["itemId", "desfecho", "motivo"] });
  ok((await escalar("SELECT COUNT(*) FROM sys.tables WHERE name IN ('CuidadoItens', 'CuidadoEventos', 'NotasPastorais', 'NotasPastoraisLeituras', 'PedidosOracao')")) === 5, "depois de tudo, as 5 tabelas continuam lá");

  fim("e2e-25 (segurança do cuidado pastoral)");
})().catch((e) => { console.log("ERRO FATAL:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
