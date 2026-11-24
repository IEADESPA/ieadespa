// e2e-101-voto-e-batismo-do-arrolamento.js — a revisão de 24/11/2026 (Membros), contra o SQL Server de verdade. Só dados de mentira.
//  A1. "sem voto até completar" nas enquetes e na votação do tema: o "apto e em comunhão" (enquetes.aptoEmComunhao) e o universo geral
//      (universoDoOrgao com órgão nulo) dão a MESMA resposta para as 4 situações: em arrolamento e sem comunhão ficam de fora; em comunhão e congregado
//      ficam (a situação vazia não existe no banco: MembroReferencia.SituacaoMembro é NOT NULL). Os universos dos órgãos não mudam (a regra para eles não
//      foi decidida).
//  A2. o batismo de quem está em arrolamento (GestaoTurmasBatismo REALIZAR -> batismo.efetivarTurma): a situação e a pendência mudam juntas (RESOLVIDA,
//      COMPLETADA, quem realizou), a trilha diz que foi o batismo, e o painel do arrolamento conta a ficha como completada; quem não estava em arrolamento
//      não ganha trilha nem pendência.
// Roda sobre a base cenario-186 (`BASE=cenario-186 bash rodar.sh roteiro e2e-101-voto-e-batismo-do-arrolamento.js`).
process.env.AUTH_SECRET = "segredo-do-e2e-101-" + "x".repeat(24);
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool } = L;

async function principal() {
  const pool = await obterPool();
  const enquetes = require(L.path.join(L.API, "shared/enquetes"));
  const universo = require(L.path.join(L.API, "shared/universo"));
  const batismo = require(L.path.join(L.API, "shared/batismo"));

  console.log("== A1: as 4 situações, nas duas contas ==");
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, Status, SituacaoMembro) VALUES
    (990101, N'Ana Arrolamento E2E101', N'ATIVO', N'ARROLAMENTO'), (990102, N'Bruno Sem Comunhão E2E101', N'ATIVO', N'SEM_COMUNHAO'),
    (990103, N'Carla Em Comunhão E2E101', N'ATIVO', N'EM_COMUNHAO'), (990104, N'Davi Congregado E2E101', N'ATIVO', N'CONGREGADO')`);
  const esperado = { 990101: false, 990102: false, 990103: true, 990104: true };
  const ids = new Set((await universo.universoDoOrgao(pool, null)).map((m) => m.membroId));
  for (const [id, vota] of Object.entries(esperado)) {
    const apto = await enquetes.aptoEmComunhao(pool, Number(id));
    const situacao = await escalar("SELECT SituacaoMembro FROM MembroReferencia WHERE MembroId = @id", { id: Number(id) });
    ok(apto === vota && ids.has(Number(id)) === vota, `${situacao}: ${vota ? "vota" : "não vota"} nas enquetes e no tema (as duas contas iguais)`, { apto, noUniverso: ids.has(Number(id)) });
  }

  console.log("== A2: o batismo de quem está em arrolamento ==");
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, Status, SituacaoMembro) VALUES
    (990201, N'Fábio Arrolado E2E101', N'ATIVO', N'ARROLAMENTO'), (990202, N'Gina Congregada E2E101', N'ATIVO', N'CONGREGADO'), (990299, N'Hugo Pastor E2E101', N'ATIVO', N'EM_COMUNHAO');
    INSERT INTO FichasPendencias (MembroId, Tipo, Detalhe, Origem, AbertaPor) VALUES (990201, N'ARROLAMENTO', N'Importada do sistema pago (e2e-101).', N'IMPORTACAO', 990299)`);
  const turma = await escalar(`INSERT INTO TurmasBatismo (DataBatismo, Local, TipoLocal, AutorizacaoMesa, Status) OUTPUT inserted.TurmaId
    VALUES ('2026-10-03', N'Templo de mentira', N'TEMPLO', 1, N'REALIZADA')`);
  await q(`INSERT INTO CandidatosBatismo (MembroId, TurmaId, Status) VALUES (990201, @t, N'APROVADO'), (990202, @t, N'APROVADO')`, { t: turma });
  const trilhaAntes = await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = N'MembroReferencia' AND RegistroId IN (N'990201', N'990202')");
  const n = await batismo.efetivarTurma(pool, turma, 990299);
  ok(n === 2, "a turma efetiva os 2 aprovados", n);
  const f = await um("SELECT SituacaoMembro, FormaAdmissao, CONVERT(varchar(10), DataBatismo, 120) AS DataBatismo FROM MembroReferencia WHERE MembroId = 990201");
  ok(f.SituacaoMembro === "EM_COMUNHAO" && f.FormaAdmissao === "BATISMO" && f.DataBatismo === "2026-10-03", "a ficha em arrolamento batizada: em comunhão, pelo batismo", f);
  const p = await um("SELECT Situacao, Resolucao, ResolvidaPor, Nota FROM FichasPendencias WHERE MembroId = 990201 AND Tipo = N'ARROLAMENTO'");
  ok(p.Situacao === "RESOLVIDA" && p.Resolucao === "COMPLETADA" && p.ResolvidaPor === 990299 && /batismo/.test(p.Nota || ""), "a pendência fechou junto: RESOLVIDA, COMPLETADA, por quem realizou", p);
  ok((await escalar("SELECT COUNT(*) FROM FichasPendencias WHERE MembroId = 990201 AND Situacao = N'ABERTA'")) === 0, "nenhuma pendência aberta sobrou");
  const tr = await q("SELECT RegistroId, Acao, UsuarioId FROM AuditLog WHERE Tabela = N'MembroReferencia' AND RegistroId IN (N'990201', N'990202') ORDER BY AuditId");
  ok(tr.length === trilhaAntes + 1 && Number(tr[tr.length - 1].RegistroId) === 990201 && tr[tr.length - 1].Acao === "O batismo completou o arrolamento" && tr[tr.length - 1].UsuarioId === 990299,
    "a trilha diz que foi o batismo (só para quem estava em arrolamento)", tr);
  ok((await escalar("SELECT SituacaoMembro FROM MembroReferencia WHERE MembroId = 990202")) === "EM_COMUNHAO"
    && (await escalar("SELECT COUNT(*) FROM FichasPendencias WHERE MembroId = 990202")) === 0, "a congregada batizada: em comunhão, sem pendência nenhuma (como antes)");
  // o painel do arrolamento: vieram (a pendência, aberta ou resolvida) − faltam (ainda em ARROLAMENTO) = completadas — a batizada conta como completada
  // e a pendência não fica aberta "contando como completada"
  const conta = await um(`SELECT SUM(CASE WHEN fp.Situacao = N'ABERTA' THEN 1 ELSE 0 END) AS abertas, SUM(CASE WHEN m.SituacaoMembro = N'ARROLAMENTO' THEN 1 ELSE 0 END) AS faltam
    FROM FichasPendencias fp JOIN MembroReferencia m ON m.MembroId = fp.MembroId WHERE fp.Tipo = N'ARROLAMENTO' AND fp.MembroId = 990201`);
  ok(conta.abertas === 0 && conta.faltam === 0, "o painel conta a batizada como completada, sem pendência aberta", conta);
  // de novo (a turma já efetivada): nada muda e nenhuma trilha a mais
  const antes = await escalar("SELECT COUNT(*) FROM AuditLog");
  await q("UPDATE CandidatosBatismo SET Status = N'APROVADO' WHERE MembroId = 990201");
  await batismo.efetivarTurma(pool, turma, 990299);
  ok((await escalar("SELECT COUNT(*) FROM AuditLog")) === antes, "a pendência já fechada não fecha de novo (sem trilha a mais)");

  await q(`DELETE FROM CandidatosBatismo WHERE TurmaId = @t; DELETE FROM TurmasBatismo WHERE TurmaId = @t`, { t: turma });
  fim("e2e-101 (o voto e o batismo de quem está em arrolamento)");
}
principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
