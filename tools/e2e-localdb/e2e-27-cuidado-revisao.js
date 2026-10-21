// e2e-27-cuidado-revisao.js — v7.11 (Cuidado pastoral): o que a revisão adversarial independente (21/10/2026) pediu, com o handler e a rotina REAIS, sobre a base "cenario-pastoral".
// A mudança de congregação (o acesso acaba na hora e o item passa para a nova), a licença que não apaga nada, a Extensão fora da fila, o cancelamento do urgente, o caso de violência
// que cita a liderança, o socorro que não se perde (limite, pedido aberto, item encerrado), a fila filtrada no banco, a sonda de cadastro fechada, a moderação de mão única, a correção
// que não rebaixa o sigilo, quem vê as leituras, o painel que não conta o próprio item, o teto de lembretes, o urgente que sobe com 24 horas e a anonimização sem sobra de matrícula.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path, GET, POST, LIDER, GERAL, PIN, sessao } = L;
process.env.CRON_SECRET = "segredo-da-rotina-e2e";
const H = require(path.join(API, "GestaoCuidadoPastoral/index.js"));
const AGENDADOR = require(path.join(API, "NotificacoesAgendador/index.js"));
const db = require(path.join(API, "shared/cuidadoPastoralDb.js"));

const PERM = ["cuidado_pastoral", "pessoas"];
const C = "Central E2E", V = "Vila Nova E2E";
const DIR_C = LIDER(3001, PERM, [C]), DIR_V = LIDER(3002, PERM, [V]), PAREA = LIDER(3003, PERM, [C, V], "AREA"), SEC = GERAL(1002, ["cuidado_pastoral", "protecaodedados"]);
const P = { ana: 8010, bento: 8011, carla: 8012, fabio: 8015, gabi: 8016, hugo: 8017, iris: 8018, joao: 8019, beta: 8040 };
const rotina = async () => { const ctx = { bindingData: {}, log: Object.assign(() => { }, { error() { }, info() { }, warn() { }, verbose() { } }) }; await AGENDADOR(ctx, { method: "POST", query: {}, body: {}, headers: { "x-cron-secret": process.env.CRON_SECRET } }); return ctx.res; };
const item = (id) => um("SELECT * FROM CuidadoItens WHERE ItemId = @i", { i: id });
const vencer = (id) => q("UPDATE CuidadoItens SET PrazoEm = DATEADD(HOUR, -1, SYSUTCDATETIME()) WHERE ItemId = @i", { i: id });

(async () => {
  await obterPool();
  const c1 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = @n", { n: C });
  const c2 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = @n", { n: V });

  console.log("== quem muda de congregação: o acesso acaba na hora; o item passa para a nova ==");
  const vis = (await POST(H, "pedir-visita", PIN(P.ana), { motivo: "minha mãe faleceu", hospital: false })).body.itemId;
  ok(vis && (await item(vis)).ResponsavelMembroId === 3001, "a Ana pede visita (Central): o Dirigente da Central é o responsável");
  await POST(H, "nota", DIR_C, { membroId: P.ana, nivel: "EQUIPE", texto: "nota da Central sobre a Ana" });
  await q("UPDATE MembroReferencia SET CongregacaoId = @c, Telefone = N'91 98888-NOVO' WHERE MembroId = @m", { c: c2, m: P.ana });
  ok((await GET(H, "item", DIR_C, { itemId: vis })).status === 404, "mudou para a Vila Nova: o Dirigente da Central já não abre o item (antes da rotina)");
  ok((await GET(H, "notas", DIR_C, { membroId: P.ana })).status === 404, "nem as notas");
  const notaV = (await POST(H, "nota", DIR_V, { membroId: P.ana, nivel: "EQUIPE", texto: "nota da Vila sobre a Ana" })).body.notaId;
  ok(notaV, "o Dirigente da Vila Nova escreve sobre ela");
  ok((await POST(H, "abrir-nota", DIR_C, { notaId: notaV })).status === 404, "e o antigo não lê o que a congregação nova escreveu");
  ok((await GET(H, "fila", PAREA)).body.itens.some((i) => i.itemId === vis), "o Pastor de Área, que alcança as duas, continua vendo");
  await rotina();
  const antigo = await item(vis);
  const novo = await um("SELECT * FROM CuidadoItens WHERE MembroId = @m AND Tipo = 'PEDIDO_VISITA' AND Status = 'ABERTO'", { m: P.ana });
  ok(antigo.Status === "CONCLUIDO" && antigo.Desfecho === "ENCAMINHADO", "na rotina, o item da Central é encerrado como encaminhado");
  ok(novo && novo.CongregacaoId === c2 && novo.ResponsavelMembroId === 3002 && novo.Motivo === "minha mãe faleceu", "e um igual nasce na Vila Nova, com o Dirigente de lá", novo);
  ok((await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'CUIDADO_ATRIBUIDO' AND DestinatarioMembroId = 3002")) >= 1, "que recebe o aviso de responsável");
  ok((await GET(H, "item", DIR_C, { itemId: vis })).status === 404 && (await GET(H, "item", PAREA, { itemId: vis })).body.item.contato === null, "o encerrado não mostra mais o telefone novo a ninguém");

  console.log("== licença não é saída: nada se apaga nem se encerra ==");
  const itIris = (await POST(H, "abrir", DIR_C, { tipo: "NOVO_CONVERTIDO", congregacaoId: c1, membroId: P.iris })).body.itemId;
  await POST(H, "nota", DIR_C, { membroId: P.iris, nivel: "LIDERANCA", texto: "nota da Íris antes da licença" });
  await q("UPDATE MembroReferencia SET Status = 'LICENCA_CANDIDATURA' WHERE MembroId = @m", { m: P.iris });
  await rotina();
  ok((await escalar("SELECT COUNT(*) FROM NotasPastorais WHERE MembroId = @m", { m: P.iris })) === 1, "a nota da Íris em licença continua (só DESLIGADO com data de saída conta)");
  ok((await item(itIris)).Status === "ABERTO", "e o item dela não foi encerrado");
  await q("UPDATE MembroReferencia SET Status = 'ATIVO' WHERE MembroId = @m", { m: P.iris });

  console.log("== a Extensão não opera a fila ==");
  const ext = (await q("IF NOT EXISTS (SELECT 1 FROM ExtensoesTenda WHERE Nome = N'Extensão Cuidado E2E') INSERT INTO ExtensoesTenda (Nome, CongregacaoMaeId) VALUES (N'Extensão Cuidado E2E', @c); SELECT ExtensaoId FROM ExtensoesTenda WHERE Nome = N'Extensão Cuidado E2E'", { c: c1 }))[0];
  ok(!!ext, "a extensão existe");
  const EXT = sessao(3001, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "CONGREGACAO", escopoCongregacoes: [C], escopoExtensaoNome: "Extensão Cuidado E2E", permissoes: PERM });
  ok((await GET(H, "fila", EXT)).status === 403 && (await GET(H, "catalogos", EXT)).body.papeis.gestao === false, "a concessão de Extensão (que veria a congregação-mãe inteira) não vê a fila");
  const DEP = sessao(3001, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "DEPARTAMENTO", escopoCongregacoes: "TODAS", permissoes: PERM });
  ok((await GET(H, "fila", DEP)).status === 403, "nem a de Departamento");

  console.log("== o urgente: o Dirigente não cancela; sobe com 24 horas ==");
  const urg = (await POST(H, "pedir-oracao", PIN(P.joao), { categoria: "OUTRO", texto: "não quero viver", podeBoletim: false })).body.itemId;
  ok((await POST(H, "cancelar", DIR_C, { itemId: urg, desfecho: "ENGANO", motivo: "parece brincadeira" })).status === 403, "o Dirigente sozinho não cancela um acompanhamento urgente");
  await vencer(urg); await rotina();
  const subiu = await item(urg);
  const h = (new Date(subiu.PrazoEm).getTime() - Date.now()) / 3600000;
  ok(subiu.Nivel === "AREA" && h > 23.5 && h <= 24.1, "vencido, sobe com prazo novo de 24 horas (não de 3 dias)", { n: subiu.Nivel, h });
  ok((await POST(H, "cancelar", PAREA, { itemId: urg, desfecho: "ENGANO", motivo: "confirmado com a família" })).status === 200, "o Pastor de Área cancela, com motivo");

  console.log("== violência que cita a liderança: só o nível geral ==");
  const antes = await escalar("SELECT ISNULL(MAX(NotificacaoId), 0) FROM Notificacoes");
  const cit = await POST(H, "pedir-oracao", PIN(P.bento), { categoria: "OUTRO", texto: "o dirigente me agrediu na saída do culto", podeBoletim: false });
  ok(cit.status === 201 && cit.body.risco === true, "o pedido acusa risco", cit.body);
  const dests = (await q("SELECT DISTINCT DestinatarioMembroId AS d FROM Notificacoes WHERE RegraChave = 'CUIDADO_RISCO' AND NotificacaoId > @a", { a: antes })).map((x) => x.d).sort((a, b) => a - b);
  ok(dests.length > 0 && !dests.includes(3001) && !dests.includes(3003) && !dests.includes(8001) && dests.every((d) => [1, 2, 1001, 1002].includes(d)), "o aviso vai SÓ ao nível geral (nem o Dirigente, nem a Área, nem a Região)", dests);
  const itCit = await item(cit.body.itemId);
  ok(itCit.SoNivelGeral === true && itCit.Nivel === "GERAL" && itCit.ResponsavelMembroId === null, "o item nasce no nível geral, sem o Dirigente como responsável");
  ok(!(await GET(H, "pedidos", DIR_C, { situacao: "RISCO" })).body.pedidos.some((p) => p.pedidoId === cit.body.pedidoId) && !(await GET(H, "pedidos", PAREA, { situacao: "RISCO" })).body.pedidos.some((p) => p.pedidoId === cit.body.pedidoId),
    "o Dirigente e o Pastor de Área não leem o pedido");
  ok((await GET(H, "item", DIR_C, { itemId: cit.body.itemId })).status === 404 && !(await GET(H, "fila", DIR_C)).body.itens.some((i) => i.itemId === cit.body.itemId), "nem o item");
  ok((await GET(H, "pedidos", SEC, { situacao: "RISCO" })).body.pedidos.some((p) => p.pedidoId === cit.body.pedidoId && p.soNivelGeral), "o nível geral lê");
  ok((await POST(H, "risco", PAREA, { pedidoId: cit.body.pedidoId, marcar: false, motivo: "não é nada" })).status === 404, "e a Área não consegue desmarcar o que não vê");

  console.log("== o socorro não se perde ==");
  for (let i = 0; i < 10; i++) await POST(H, "pedir-oracao", PIN(P.carla), { categoria: "GRATIDAO", texto: `gratidão ${i}`, podeBoletim: true });
  ok((await POST(H, "pedir-oracao", PIN(P.carla), { categoria: "GRATIDAO", texto: "mais uma gratidão", podeBoletim: true })).status === 429, "o 11º pedido comum do dia é recusado");
  const socorro = await POST(H, "pedir-oracao", PIN(P.carla), { categoria: "OUTRO", texto: "quero me matar", podeBoletim: false });
  ok(socorro.status === 201 && socorro.body.risco === true, "mas o pedido com sinal de risco passa do limite e avisa", socorro.body);
  const pi = (await POST(H, "pedir-visita", PIN(P.fabio), { motivo: "estou internado", hospital: true })).body.itemId;
  const pvr = await POST(H, "pedir-visita", PIN(P.fabio), { motivo: "meu irmão me bate quando bebe", hospital: true });
  ok(pvr.status === 201 && pvr.body.risco === true && pvr.body.itemId === pi, "pedido de visita com risco, já havendo um aberto: o aberto vira o urgente (antes, 409 e nada)", pvr.body);
  ok((await item(pi)).Urgente === true && (await escalar("SELECT COUNT(*) FROM PedidosOracao WHERE PedidoId = @p AND Risco = 1", { p: pvr.body.pedidoId })) === 1, "e o texto vai para a aba do risco");
  const ped = await POST(H, "pedir-oracao", PIN(P.hugo), { categoria: "FAMILIA", texto: "pela família", podeBoletim: true, querContato: true });
  await POST(H, "concluir", DIR_C, { itemId: ped.body.itemId, desfecho: "INTEGRADO" });
  const mk = await POST(H, "risco", DIR_C, { pedidoId: ped.body.pedidoId, marcar: true });
  const novoUrg = await um("SELECT * FROM CuidadoItens WHERE PedidoOracaoId = @p AND Status = 'ABERTO'", { p: ped.body.pedidoId });
  ok(mk.status === 200 && novoUrg && novoUrg.Urgente === true && /foi aberto/.test(mk.body.mensagem), "marcar risco num pedido cujo item já fechou ABRE um urgente novo, e a mensagem diz isso", mk.body);

  console.log("== a fila do Dirigente com mais de 400 itens na igreja ==");
  await q(`;WITH n AS (SELECT TOP 410 ROW_NUMBER() OVER (ORDER BY (SELECT 1)) AS i FROM sys.all_objects)
    INSERT INTO CuidadoItens (Tipo, CongregacaoId, PessoaNome, PessoaContato, Origem, PrazoEm) SELECT 'VISITANTE', @c, CONCAT(N'Visitante massa ', i), N'91 9', 'LIDERANCA', DATEADD(DAY, -2, SYSUTCDATETIME()) FROM n`, { c: c2 });
  const filaC = (await GET(H, "fila", DIR_C)).body.itens;
  ok(filaC.length > 0 && filaC.every((i) => i.congregacaoNome === C), "os 410 da Vila Nova não empurram a Central para fora da fila do Dirigente (o filtro do território vai no banco)", filaC.length);
  const painel = (await GET(H, "painel", DIR_C)).body.congregacoes;
  ok(painel.length === 1 && painel[0].abertos === filaC.length, "o painel e a fila contam o mesmo", { painel: painel[0] && painel[0].abertos, fila: filaC.length });

  console.log("== a sonda do cadastro ==");
  const r1 = await POST(H, "atribuir", DIR_C, { itemId: itIris, responsavelMembroId: P.beta });
  const r2 = await POST(H, "atribuir", DIR_C, { itemId: itIris, responsavelMembroId: 999999 });
  ok(r1.status === 422 && r2.status === 422 && r1.body.mensagem === r2.body.mensagem && r1.body.mensagem === "Pessoa não encontrada.", "membro de fora do território e matrícula inexistente recebem a MESMA resposta", [r1.body, r2.body]);

  console.log("== moderação de mão única, correção e leituras ==");
  const pb = (await POST(H, "pedir-oracao", PIN(P.gabi), { categoria: "SAUDE", texto: "pela recuperação", podeBoletim: true })).body.pedidoId;
  ok((await POST(H, "moderar", DIR_C, { pedidoId: pb, decisao: "APROVAR" })).status === 200, "aprova");
  ok((await POST(H, "moderar", DIR_C, { pedidoId: pb, decisao: "APROVAR", textoBoletim: "Alguém pede oração, está com câncer" })).status === 422, "aprovar de novo (reescrevendo depois de publicado) é recusado");
  ok((await POST(H, "moderar", DIR_C, { pedidoId: pb, decisao: "NAO_PUBLICAR" })).status === 200 && (await GET(H, "boletim-meu", PIN(P.joao))).body.linhas.length === 0, "tirar do boletim pode");
  const pas = (await POST(H, "nota", PAREA, { membroId: P.joao, nivel: "PASTORAL", texto: "aconselhamento" })).body.notaId;
  ok((await POST(H, "nota", PAREA, { membroId: P.joao, nivel: "EQUIPE", texto: "corrige abrindo", retificaNotaId: pas })).status === 422, "a correção não pode abrir o sigilo (equipe corrigindo somente pastor)");
  const corr = (await POST(H, "nota", PAREA, { membroId: P.joao, nivel: "PASTORAL", texto: "corrige no mesmo nível", retificaNotaId: pas })).body.notaId;
  ok(!!corr, "no mesmo nível, pode");
  await POST(H, "abrir-nota", PAREA, { notaId: pas });
  ok((await GET(H, "leituras", SEC, { notaId: pas })).status === 200, "o nível geral vê QUEM leu a \"somente pastor\" mesmo sem ser pastor (não lê o texto)");
  ok((await POST(H, "abrir-nota", SEC, { notaId: pas })).status === 404, "mas não abre o texto");

  console.log("== o painel não conta o próprio item; o teto de lembretes ==");
  const sobre = (await POST(H, "abrir", PAREA, { tipo: "AFASTAMENTO", congregacaoId: c1, membroId: 3001 })).body.itemId;
  const pD = (await GET(H, "painel", DIR_C)).body.congregacoes[0], fD = (await GET(H, "fila", DIR_C, { situacao: "SEM_RESPONSAVEL" })).body.itens;
  ok(pD.semResponsavel === fD.length, "o \"sem responsável\" do painel do Dirigente bate com a fila dele (o item sobre ele não entra)", { painel: pD.semResponsavel, fila: fD.length });
  await q("UPDATE CuidadoItens SET Nivel = 'GERAL', LembretesGerais = 5, PrazoEm = DATEADD(HOUR, -1, SYSUTCDATETIME()) WHERE ItemId = @i", { i: sobre });
  await rotina();
  ok((await item(sobre)).LembretesGerais === 5, "no topo, depois do 5º lembrete, não há sexto (e o CHECK do banco não deixaria)");
  let msg = null; try { await q("UPDATE CuidadoItens SET LembretesGerais = 6 WHERE ItemId = @i", { i: sobre }); } catch (e) { msg = e.message; }
  ok(/CK_CuidadoItens_Contadores/.test(msg || ""), "o banco recusa o 6º", msg);

  console.log("== a anonimização não deixa matrícula ==");
  const vB = (await POST(H, "pedir-visita", PIN(P.bento), { motivo: "quero conversar", hospital: false })).body.itemId;
  const sol = (await q("INSERT INTO SolicitacoesTitularLGPD (MembroId, Tipo, Status) VALUES (@m, 'EXCLUSAO', 'PENDENTE'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { m: P.bento }))[0].id;
  const EX = require(path.join(API, "ExecutarExclusaoLGPD/index.js"));
  const ctx = { bindingData: { id: String(sol) }, log: Object.assign(() => { }, { error() { } }) };
  await EX(ctx, { method: "POST", query: {}, body: {}, headers: { "x-auth-token": SEC } });
  const anon = await item(vB);
  ok(ctx.res.status === 200 && anon.AnonimizadoEm && anon.MembroId === null && anon.CriadoPorMembroId === null, "o pedido que o Bento fez perde a matrícula dele também em \"quem criou\"", anon);
  ok((await escalar("SELECT COUNT(*) FROM CuidadoEventos WHERE ItemId = @i AND (MembroId IS NOT NULL OR ResponsavelMembroId IS NOT NULL)", { i: vB })) === 0, "e no histórico (quem agiu e o responsável)");
  ok((await escalar("SELECT CAST(SESSION_CONTEXT(N'cuidado_purga') AS INT)")) === null, "a marca de purga não ficou ligada");

  fim("e2e-27 (revisão independente do cuidado pastoral)");
})().catch((e) => { console.log("ERRO FATAL:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
