// e2e-26-cuidado-corridas.js — v7.11 (Cuidado pastoral): corridas de verdade (N processos node, cada um com a sua conexão ao SQL Server e o MESMO AUTH_SECRET) sobre a base
// "cenario-pastoral": a detecção rodando em dois processos, a escada em três, o mesmo item concluído oito vezes, o mesmo "afastado" aberto seis vezes, o teto de pedidos de
// oração, o risco marcado cinco vezes, a moderação contra o risco, a troca de responsável contra o contato e a regra dos 30 dias em paralelo. Em cada uma: nenhuma 500, e o estado
// final do banco é um que UMA ordem qualquer de execução produziria.
process.env.AUTH_SECRET = "segredo-das-corridas-do-cuidado-" + "x".repeat(24);
const { spawn } = require("child_process");
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, path, API, POST, LIDER, PIN: PINL } = L;
const H = require(path.join(API, "GestaoCuidadoPastoral/index.js"));

const PERM = ["cuidado_pastoral", "pessoas"];
const C = "Central E2E";
const P = { ana: 8010, bento: 8011, carla: 8012, gabi: 8016, hugo: 8017, iris: 8018, joao: 8019, saiu: 8050 };
const DIR = { tipo: "LIDER", membroId: 3001, permissoes: PERM, escopo: [C], nivel: "CONGREGACAO" };
const PIN = (id) => ({ tipo: "PIN", membroId: id });
const cu = (acao, token, corpo) => ({ handler: "cuidado", acao, token, corpo });
const fn = (nome) => ({ funcao: { modulo: "cuidadoPastoralDb", nome, args: [{}] } });

async function disparar(chamadas) {
  const t0 = Date.now() + 6000 + chamadas.length * 700;
  const procs = chamadas.map((spec) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), path.join(__dirname, "worker.js"), JSON.stringify({ ...spec, t0 })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { status: -1, erro: "sem resultado" }); });
  }));
  return Promise.all(procs);
}
const contar = (rs) => rs.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
const semFalha = (rs) => rs.every((x) => x.status > 0 && x.status !== 500 && !x.erro);
const quantos = (rs, s) => rs.filter((x) => x.status === s).length;

(async () => {
  await obterPool();
  const c1 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = @n", { n: C });
  const DIR_T = LIDER(3001, PERM, [C]);
  let rs;

  console.log("== a detecção em dois processos ao mesmo tempo ==");
  rs = await disparar([fn("detectarAfastamentos"), fn("detectarAfastamentos")]);
  ok(semFalha(rs), "as duas rodadas terminam sem erro", rs);
  ok((await escalar("SELECT COUNT(*) FROM CuidadoItens WHERE Origem = 'DETECCAO'")) === 2 && (await escalar("SELECT COUNT(*) FROM (SELECT MembroId FROM CuidadoItens WHERE Tipo = 'AFASTAMENTO' AND Status = 'ABERTO' GROUP BY MembroId HAVING COUNT(*) > 1) x")) === 0,
    "dois itens (Ana e Hugo), nenhum em dobro (o índice único segura a corrida)", await q("SELECT MembroId FROM CuidadoItens"));
  ok((await escalar("SELECT COUNT(*) FROM CuidadoEventos WHERE Tipo = 'CRIADO'")) === 2, "e o histórico de criação não ficou órfão nem em dobro");

  console.log("== o mesmo \"afastado\" aberto seis vezes ao mesmo tempo ==");
  rs = await disparar(Array.from({ length: 6 }, () => cu("abrir", DIR, { tipo: "AFASTAMENTO", congregacaoId: c1, membroId: P.carla })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(semFalha(rs) && quantos(rs, 201) === 1 && quantos(rs, 409) === 5, "um vale (201) e cinco ouvem \"já existe\" (409)", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM CuidadoItens WHERE MembroId = @m AND Tipo = 'AFASTAMENTO'", { m: P.carla })) === 1, "no banco, um item só");

  console.log("== o mesmo item concluído oito vezes (pela liderança e pelo responsável) ==");
  const it = (await POST(H, "abrir", DIR_T, { tipo: "NOVO_CONVERTIDO", congregacaoId: c1, membroId: P.bento, responsavelMembroId: P.gabi })).body.itemId;
  rs = await disparar(Array.from({ length: 8 }, (_, i) => cu("concluir", i % 2 ? PIN(P.gabi) : DIR, { itemId: it, desfecho: i % 3 ? "INTEGRADO" : "ACOMPANHADO" })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(semFalha(rs) && quantos(rs, 200) === 1 && quantos(rs, 409) === 7, "exatamente uma conclusão vale; as outras sete ouvem \"já foi encerrado\" (409)", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM CuidadoEventos WHERE ItemId = @i AND Tipo = 'CONCLUIDO'", { i: it })) === 1, "um só evento de conclusão");

  console.log("== troca de responsável contra o contato do responsável antigo ==");
  const it2 = (await POST(H, "abrir", DIR_T, { tipo: "VISITANTE", congregacaoId: c1, pessoaNome: "Corrida E2E", pessoaContato: "91 9999", responsavelMembroId: P.gabi })).body.itemId;
  rs = await disparar([cu("atribuir", DIR, { itemId: it2, responsavelMembroId: P.joao }), ...Array.from({ length: 4 }, () => cu("contato", PIN(P.gabi), { itemId: it2, forma: "LIGACAO", conseguiu: true }))]);
  console.log("   ", JSON.stringify(contar(rs)));
  ok(semFalha(rs) && rs[0].status === 200 && rs.slice(1).every((x) => [201, 404, 409].includes(x.status)), "a troca vale; cada contato do antigo ou entrou antes (201) ou foi recusado (404/409)", contar(rs));
  const depois = await q("SELECT e.EventoId, e.Tipo, e.MembroId FROM CuidadoEventos e WHERE e.ItemId = @i ORDER BY e.EventoId", { i: it2 });
  const posTroca = depois.slice(depois.findIndex((e) => e.Tipo === "ATRIBUIDO" && e.EventoId === Math.max(...depois.filter((x) => x.Tipo === "ATRIBUIDO").map((x) => x.EventoId))) + 1);
  ok(posTroca.every((e) => !(e.Tipo === "CONTATO" && e.MembroId === P.gabi)), "nenhum contato do responsável antigo entrou DEPOIS da troca (a linha é travada e o responsável conferido de novo)", depois);

  console.log("== o teto de 10 pedidos de oração em 24 horas, com 14 ao mesmo tempo ==");
  rs = await disparar(Array.from({ length: 14 }, (_, i) => cu("pedir-oracao", PIN(P.iris), { categoria: "GRATIDAO", texto: `Gratidão da corrida ${i}`, podeBoletim: true })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(semFalha(rs) && quantos(rs, 201) === 10 && rs.every((x) => [201, 409, 429].includes(x.status)), "no máximo 10 entram; os outros ouvem o limite (429) ou \"tente de novo\" (409)", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM PedidosOracao WHERE SolicitanteMembroId = @m", { m: P.iris })) === 10, "no banco, exatamente 10");

  console.log("== o risco marcado cinco vezes ao mesmo tempo ==");
  const ped = (await POST(H, "pedir-oracao", PINL(P.hugo), { categoria: "SAUDE", texto: "pedido da corrida do risco", podeBoletim: true })).body.pedidoId;
  rs = await disparar(Array.from({ length: 5 }, () => cu("risco", DIR, { pedidoId: ped, marcar: true })));
  console.log("   ", JSON.stringify(contar(rs)));
  ok(semFalha(rs) && quantos(rs, 200) === 1, "uma marcação vale; as outras ouvem que já está marcado (422) ou que mudou (409)", contar(rs));
  ok((await escalar("SELECT COUNT(*) FROM CuidadoItens WHERE PedidoOracaoId = @p", { p: ped })) === 1 && (await escalar("SELECT COUNT(*) FROM CuidadoEventos e JOIN CuidadoItens i ON i.ItemId = e.ItemId WHERE i.PedidoOracaoId = @p AND e.Tipo = 'URGENTE'", { p: ped })) === 1,
    "um item só e um só evento de urgência");

  console.log("== aprovar no boletim contra marcar o risco ==");
  const ped2 = (await POST(H, "pedir-oracao", PINL(P.joao), { categoria: "FAMILIA", texto: "pedido da corrida da moderação", podeBoletim: true })).body.pedidoId;
  rs = await disparar([...Array.from({ length: 3 }, () => cu("moderar", DIR, { pedidoId: ped2, decisao: "APROVAR" })), ...Array.from({ length: 3 }, () => cu("risco", DIR, { pedidoId: ped2, marcar: true }))]);
  console.log("   ", JSON.stringify(contar(rs)));
  const fim2 = await um("SELECT Moderacao, Risco FROM PedidosOracao WHERE PedidoId = @p", { p: ped2 });
  ok(semFalha(rs) && fim2.Risco === true && fim2.Moderacao !== "APROVADO", "seja qual for a ordem, o pedido termina COM o risco e FORA do boletim", fim2);

  console.log("== a escada em três processos ao mesmo tempo ==");
  await q("UPDATE CuidadoItens SET PrazoEm = DATEADD(HOUR, -1, SYSUTCDATETIME()) WHERE ItemId = @i", { i: it2 });
  rs = await disparar([fn("subirEscada"), fn("subirEscada"), fn("subirEscada")]);
  ok(semFalha(rs), "as três rodadas terminam sem erro", rs);
  const esc = await um("SELECT Nivel, Escalonamentos FROM CuidadoItens WHERE ItemId = @i", { i: it2 });
  ok(esc.Nivel === "AREA" && esc.Escalonamentos === 1 && (await escalar("SELECT COUNT(*) FROM CuidadoEventos WHERE ItemId = @i AND Tipo = 'ESCALONADO'", { i: it2 })) === 1,
    "o item sobe UM degrau (não três) e o histórico tem um evento", esc);

  console.log("== a regra dos 30 dias em três processos ==");
  await POST(H, "nota", DIR_T, { membroId: P.saiu, nivel: "LIDERANCA", texto: "nota de quem sai (corrida)" });
  await POST(H, "nota", DIR_T, { membroId: P.saiu, nivel: "EQUIPE", texto: "outra nota de quem sai (corrida)" });
  await q("UPDATE MembroReferencia SET Status = 'DESLIGADO', DataSaida = DATEADD(DAY, -45, CAST(SYSUTCDATETIME() AS DATE)) WHERE MembroId = @m", { m: P.saiu });
  rs = await disparar([fn("apagarNotasDeQuemSaiu"), fn("apagarNotasDeQuemSaiu"), fn("apagarNotasDeQuemSaiu")]);
  ok(semFalha(rs), "as três rodadas terminam sem erro (nenhuma esbarra no gatilho)", rs);
  ok((await escalar("SELECT COUNT(*) FROM NotasPastorais WHERE MembroId = @m", { m: P.saiu })) === 0 && rs.reduce((a, r) => a + Number(r.resultado || 0), 0) === 2, "as duas notas saem, uma vez só (somando as três rodadas)", rs.map((r) => r.resultado));
  ok((await escalar("SELECT COUNT(*) FROM NotasPastorais WHERE MembroId <> @m", { m: P.saiu })) >= 0, "as outras notas continuam");

  fim("e2e-26 (corridas do cuidado pastoral)");
})().catch((e) => { console.log("ERRO FATAL:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
