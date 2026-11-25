// e2e-101-voto-e-batismo-do-arrolamento.js — o voto e o batismo de quem está em arrolamento, contra o SQL Server de verdade. Só dados de mentira.
//  A1 (decisões dele de 24/11/2026 e 25/11/2026). Quem está em arrolamento e o CONGREGADO "não votam em nada e não contam em nada":
//   - o "apto e em comunhão" (enquetes.aptoEmComunhao) e o universo geral (universoDoOrgao com órgão nulo) dão a MESMA resposta: em arrolamento, sem
//     comunhão e CONGREGADO ficam de fora (o congregado segue a tela aprovada: "ainda não membro: não vota"); em comunhão fica (a situação vazia não existe
//     no banco: MembroReferencia.SituacaoMembro é NOT NULL);
//   - o universo de um ÓRGÃO (presença e quórum): o arrolamento e o congregado saem ("o congregado fica fora de tudo, também das listas de votantes
//     montadas nome por nome e dos órgãos", 25/11);
//   - a LISTA_CUSTOM: quem está em arrolamento e o congregado na lista não votam (conferido na leitura: completou ou foi batizado, volta a votar).
//  A2 (decisão dele de 24/11/2026). O batismo (GestaoTurmasBatismo REALIZAR -> batismo.efetivarTurma): quem se converteu aqui (o congregado, quem está em
//   arrolamento) recebe a data de entrada igual à do batismo, também por cima de uma data anterior de congregado; quem veio de outra igreja (carta de
//   mudança) fica com a forma e a data da chegada; quem JÁ é membro com a data de entrada (mesmo com a forma em branco) fica com ela (menor 4 do portão da
//   volta 5). A ficha em arrolamento: a pendência fecha junto (RESOLVIDA, COMPLETADA, quem realizou). Cada efetivação deixa uma trilha, com a forma e a data
//   de antes.
// Roda sobre a base cenario-186 (`BASE=cenario-186 bash rodar.sh roteiro e2e-101-voto-e-batismo-do-arrolamento.js`).
process.env.AUTH_SECRET = "segredo-do-e2e-101-" + "x".repeat(24);
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool } = L;

async function principal() {
  const pool = await obterPool();
  const enquetes = require(L.path.join(L.API, "shared/enquetes"));
  const universo = require(L.path.join(L.API, "shared/universo"));
  const batismo = require(L.path.join(L.API, "shared/batismo"));
  const sql = L.sql;

  console.log("== A1: as 4 situações, nas duas contas das enquetes e do tema ==");
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, Status, SituacaoMembro) VALUES
    (990101, N'Ana Arrolamento E2E101', N'ATIVO', N'ARROLAMENTO'), (990102, N'Bruno Sem Comunhão E2E101', N'ATIVO', N'SEM_COMUNHAO'),
    (990103, N'Carla Em Comunhão E2E101', N'ATIVO', N'EM_COMUNHAO'), (990104, N'Davi Congregado E2E101', N'ATIVO', N'CONGREGADO')`);
  const esperado = { 990101: false, 990102: false, 990103: true, 990104: false };
  const ids = new Set((await universo.universoDoOrgao(pool, null)).map((m) => m.membroId));
  for (const [id, vota] of Object.entries(esperado)) {
    const apto = await enquetes.aptoEmComunhao(pool, Number(id));
    const situacao = await escalar("SELECT SituacaoMembro FROM MembroReferencia WHERE MembroId = @id", { id: Number(id) });
    ok(apto === vota && ids.has(Number(id)) === vota, `${situacao}: ${vota ? "vota" : "não vota"} nas enquetes e no tema (as duas contas iguais)`, { apto, noUniverso: ids.has(Number(id)) });
  }
  const motivoArrol = await enquetes.situacaoParaVoto(pool, 990101);
  const motivoCong = await enquetes.situacaoParaVoto(pool, 990104);
  ok(motivoArrol.motivo === "ARROLAMENTO" && motivoCong.motivo === "CONGREGADO", "o motivo de quem não vota: o arrolamento e o congregado (o tema diz o motivo de verdade)", { motivoArrol, motivoCong });

  console.log("== A1: o universo de um órgão (presença e quórum) ==");
  const orgao = await um("SELECT TOP 1 OrgaoId, Sigla FROM Orgaos WHERE Sigla = 'CONSELHO_FISCAL'");
  for (const m of [990101, 990103, 990104]) {
    await q(`INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) VALUES (@o, @m, 'FUNCAO', N'Conselheiro E2E101', '2025-01-01')`, { o: orgao.OrgaoId, m });
  }
  const doOrgao = new Set((await universo.universoDoOrgao(pool, { orgaoId: orgao.OrgaoId, sigla: orgao.Sigla })).map((m) => m.membroId));
  ok(!doOrgao.has(990101), "em arrolamento com cadeira no órgão: fora da presença e do quórum (não consegue nem entrar)", [...doOrgao].filter((x) => x >= 990100 && x < 990200));
  ok(!doOrgao.has(990104), "congregado com cadeira no órgão: fora da presença e do quórum (25/11: o congregado fica fora dos órgãos)", [...doOrgao].filter((x) => x >= 990100 && x < 990200));
  ok(doOrgao.has(990103), "em comunhão com cadeira: continua no órgão");

  console.log("== A1: a LISTA_CUSTOM ==");
  const enq = await L.escalar(`INSERT INTO Enquetes (Titulo, Visibilidade, PublicoTipo, Vinculante, QuorumTipo, Status, CriadoPor)
    OUTPUT INSERTED.EnqueteId VALUES (N'Lista de mentira E2E101', 'SECRETA', 'LISTA_CUSTOM', 0, 'MAIORIA_SIMPLES', 'ABERTA', 990103)`);
  for (const m of [990101, 990103, 990104]) await q("INSERT INTO PublicoEnqueteCustom (EnqueteId, MembroId) VALUES (@e, @m)", { e: enq, m });
  const e = { enqueteId: enq, publicoTipo: "LISTA_CUSTOM" };
  const naLista = await enquetes.membrosElegiveis(pool, sql, e);
  ok(!naLista.has(990101) && naLista.has(990103), "a lista: quem está em arrolamento não vota, mesmo na lista", [...naLista]);
  ok(!naLista.has(990104), "a lista: o congregado não vota, mesmo posto na lista nome por nome (25/11)", [...naLista]);
  ok((await enquetes.membroElegivel(pool, sql, e, 990101)) === false && (await enquetes.membroElegivel(pool, sql, e, 990104)) === false
    && (await enquetes.membroElegivel(pool, sql, e, 990103)) === true, "o voto de uma pessoa da lista: o mesmo critério (o arrolamento e o congregado não votam)");
  await q("UPDATE MembroReferencia SET SituacaoMembro = N'EM_COMUNHAO' WHERE MembroId = 990101");
  ok((await enquetes.membroElegivel(pool, sql, e, 990101)) === true, "completou o arrolamento: volta a votar pela mesma lista (a lista não mudou)");
  await q("UPDATE MembroReferencia SET SituacaoMembro = N'ARROLAMENTO' WHERE MembroId = 990101");
  await q("UPDATE MembroReferencia SET SituacaoMembro = N'EM_COMUNHAO' WHERE MembroId = 990104");
  ok((await enquetes.membroElegivel(pool, sql, e, 990104)) === true, "o congregado batizado (em comunhão): volta a votar pela mesma lista");
  await q("UPDATE MembroReferencia SET SituacaoMembro = N'CONGREGADO' WHERE MembroId = 990104");

  console.log("== A2: o batismo e a data de entrada ==");
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, Status, SituacaoMembro, FormaAdmissao, DataAdmissao) VALUES
    (990201, N'Fábio Arrolado E2E101', N'ATIVO', N'ARROLAMENTO', NULL, NULL),
    (990202, N'Gina Congregada E2E101', N'ATIVO', N'CONGREGADO', NULL, '2006-03-01'),
    (990203, N'Íris Da Carta E2E101', N'ATIVO', N'EM_COMUNHAO', N'CARTA_MUDANCA', '2015-02-01'),
    (990204, N'Jair Membro Antigo E2E101', N'ATIVO', N'EM_COMUNHAO', NULL, '2015-01-01'),
    (990299, N'Hugo Pastor E2E101', N'ATIVO', N'EM_COMUNHAO', NULL, NULL);
    INSERT INTO FichasPendencias (MembroId, Tipo, Detalhe, Origem, AbertaPor) VALUES (990201, N'ARROLAMENTO', N'Importada do sistema pago (e2e-101).', N'IMPORTACAO', 990299)`);
  const turma = await escalar(`INSERT INTO TurmasBatismo (DataBatismo, Local, TipoLocal, AutorizacaoMesa, Status) OUTPUT inserted.TurmaId
    VALUES ('2026-10-03', N'Templo de mentira', N'TEMPLO', 1, N'REALIZADA')`);
  await q(`INSERT INTO CandidatosBatismo (MembroId, TurmaId, Status) VALUES (990201, @t, N'APROVADO'), (990202, @t, N'APROVADO'), (990203, @t, N'APROVADO'), (990204, @t, N'APROVADO')`, { t: turma });
  const trilhaAntes = await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = N'MembroReferencia' AND RegistroId IN (N'990201', N'990202', N'990203', N'990204')");
  const n = await batismo.efetivarTurma(pool, turma, 990299);
  ok(n === 4, "a turma efetiva os 4 aprovados", n);
  const ficha = (id) => um(`SELECT SituacaoMembro, FormaAdmissao, CONVERT(varchar(10), DataBatismo, 120) AS DataBatismo, CONVERT(varchar(10), DataAdmissao, 120) AS DataAdmissao
    FROM MembroReferencia WHERE MembroId = @id`, { id });
  const f1 = await ficha(990201), f2 = await ficha(990202), f3 = await ficha(990203), f4 = await ficha(990204);
  ok(f1.SituacaoMembro === "EM_COMUNHAO" && f1.FormaAdmissao === "BATISMO" && f1.DataBatismo === "2026-10-03" && f1.DataAdmissao === "2026-10-03",
    "em arrolamento, batizado: em comunhão, pelo batismo, a data de entrada igual à do batismo", f1);
  ok(f2.SituacaoMembro === "EM_COMUNHAO" && f2.FormaAdmissao === "BATISMO" && f2.DataAdmissao === "2026-10-03",
    "a congregada desde 2006, batizada em 2026: a data de entrada passa a ser a do batismo (os 90 dias contam dele)", f2);
  ok(f3.SituacaoMembro === "EM_COMUNHAO" && f3.FormaAdmissao === "CARTA_MUDANCA" && f3.DataAdmissao === "2015-02-01" && f3.DataBatismo === "2026-10-03",
    "veio de outra igreja (carta de mudança): fica com a forma e a data da chegada; só a data do batismo entra", f3);
  ok(f4.SituacaoMembro === "EM_COMUNHAO" && f4.FormaAdmissao === null && f4.DataAdmissao === "2015-01-01" && f4.DataBatismo === "2026-10-03",
    "já era membro (a forma em branco, a data de 2015): fica com a data de entrada (não perde os 90 dias); só a data do batismo entra", f4);
  const p = await um("SELECT Situacao, Resolucao, ResolvidaPor, Nota FROM FichasPendencias WHERE MembroId = 990201 AND Tipo = N'ARROLAMENTO'");
  ok(p.Situacao === "RESOLVIDA" && p.Resolucao === "COMPLETADA" && p.ResolvidaPor === 990299 && /data de entrada igual à do batismo/.test(p.Nota || ""),
    "a pendência fechou junto: RESOLVIDA, COMPLETADA, por quem realizou, e a nota diz da data de entrada", p);
  ok((await escalar("SELECT COUNT(*) FROM FichasPendencias WHERE MembroId = 990201 AND Situacao = N'ABERTA'")) === 0, "nenhuma pendência aberta sobrou");
  const tr = await q(`SELECT RegistroId, Acao, UsuarioId, DadosAntes FROM AuditLog WHERE Tabela = N'MembroReferencia' AND RegistroId IN (N'990201', N'990202', N'990203', N'990204')
    ORDER BY AuditId`);
  const novas = tr.slice(trilhaAntes);
  const de = (id) => novas.find((x) => Number(x.RegistroId) === id);
  ok(novas.length === 4 && de(990201).Acao === "O batismo completou o arrolamento" && de(990202).Acao === "O batismo admitiu o membro"
    && de(990204).Acao === "O batismo foi registrado na ficha de quem já era membro" && novas.every((x) => x.UsuarioId === 990299),
    "uma trilha por efetivação, por quem realizou (a do arrolamento diz que o batismo o completou)", novas.map((x) => [x.RegistroId, x.Acao]));
  ok(/"dataAdmissao":"2006-03-01"/.test(de(990202).DadosAntes || ""), "a data anterior da congregada fica na trilha (não se perde)", de(990202).DadosAntes);
  ok((await escalar("SELECT COUNT(*) FROM CandidatosBatismo WHERE TurmaId = @t AND Status = N'BATIZADO'", { t: turma })) === 4, "os 4 candidatos ficam BATIZADO");
  // o painel do arrolamento: vieram (a pendência, aberta ou resolvida) − faltam (ainda em ARROLAMENTO) = completadas — o batizado conta como completado
  const conta = await um(`SELECT SUM(CASE WHEN fp.Situacao = N'ABERTA' THEN 1 ELSE 0 END) AS abertas, SUM(CASE WHEN m.SituacaoMembro = N'ARROLAMENTO' THEN 1 ELSE 0 END) AS faltam
    FROM FichasPendencias fp JOIN MembroReferencia m ON m.MembroId = fp.MembroId WHERE fp.Tipo = N'ARROLAMENTO' AND fp.MembroId = 990201`);
  ok(conta.abertas === 0 && conta.faltam === 0, "o painel conta o batizado como completado, sem pendência aberta", conta);
  // a cadeia de hashes da trilha continua inteira depois das trilhas dentro da transação
  const cadeia = await um(`SELECT COUNT(*) AS n FROM AuditLog WHERE Tabela = N'MembroReferencia' AND HashRegistro IS NULL`);
  ok(cadeia.n === 0, "toda trilha nova tem o hash da cadeia", cadeia);

  await q(`DELETE FROM CandidatosBatismo WHERE TurmaId = @t; DELETE FROM TurmasBatismo WHERE TurmaId = @t; DELETE FROM PublicoEnqueteCustom WHERE EnqueteId = @e;
    DELETE FROM Enquetes WHERE EnqueteId = @e; DELETE FROM Assentos WHERE CargoOuFuncao = N'Conselheiro E2E101'`, { t: turma, e: enq });
  fim("e2e-101 (o voto e o batismo de quem está em arrolamento)");
}
principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
