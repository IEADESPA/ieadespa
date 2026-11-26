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
//   volta 5); a data de antes do congregado vira a data da CONVERSÃO (o marco que a ficha 360 lê), nunca por cima de uma conversão já registrada
//   (respostas dele à volta 6). A ficha em arrolamento: a pendência fecha junto (RESOLVIDA, COMPLETADA, quem realizou). Cada efetivação deixa uma trilha, com a forma e a data
//   de antes. A conversão vem antes do batismo e nunca no futuro: a data de antes que fura isso não vira conversão (o batismo segue; menor 2 do portão v7).
//  Volta 6 e o menor 3 do portão v7: as rotas de cadeira (/api/assentos, com um pedido VÁLIDO para um membro: o mesmo pedido cria a cadeira do membro em
//   comunhão) e de comissão recusam o congregado e o arrolamento; o ator errado (local, área, PIN) recebe o 403 igual para quem existe e quem não existe, e
//   sem sessão, 401; a composição da CLI no banco não mostra o congregado nem o arrolamento com cadeira antiga (o sem comunhão continua).
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

  console.log("== volta 7: a composição da CLI no banco (a cadeira antiga no Conselho Fiscal entra na CLI por função) ==");
  // o sem comunhão também com cadeira antiga: a composição da CLI o mostra (a regra de antes); o arrolamento e o congregado não aparecem
  await q(`INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) VALUES (@o, 990102, 'FUNCAO', N'Conselheiro E2E101', '2025-01-01')`, { o: orgao.OrgaoId });
  const cli = await um("SELECT TOP 1 OrgaoId FROM Orgaos WHERE Sigla = 'CLI'");
  const naCli = new Set((await universo.composicaoCLI(pool, cli.OrgaoId)).map((m) => Number(m.membroId)));
  const nossos = [...naCli].filter((x) => x >= 990100 && x < 990200);
  ok(!naCli.has(990101) && !naCli.has(990104), "a composição da CLI: o arrolamento e o congregado com cadeira antiga não aparecem", nossos);
  ok(naCli.has(990103) && naCli.has(990102), "a composição da CLI: o em comunhão e o sem comunhão continuam", nossos);

  console.log("== volta 6: o congregado e o arrolamento não têm cadeira (as rotas recusam e explicam) ==");
  // as cadeiras de cima entraram por INSERT direto: fazem o papel da cadeira antiga (de antes da regra), que a leitura já tira do órgão
  const hAssentos = require(L.path.join(L.API, "GestaoAssentos/index.js"));
  const hComissoes = require(L.path.join(L.API, "GestaoComissoes/index.js"));
  const { CATALOGOS_CARGOS_POR_ORGAO } = require(L.path.join(L.API, "shared/diretoria"));
  const geral = L.GERAL(990103, ["pessoas"]);
  const cadeirasAntes = await escalar("SELECT COUNT(*) FROM Assentos WHERE MembroId IN (990101, 990104)");
  // menor 3 do portão da volta 7: o pedido tem de ser VÁLIDO para um membro (um cargo do catálogo do Conselho Fiscal ainda livre); senão a recusa provaria pouco
  const ocupados = new Set((await q("SELECT CargoOuFuncao FROM Assentos WHERE OrgaoId = @o AND DataFim IS NULL", { o: orgao.OrgaoId })).map((l) => l.CargoOuFuncao));
  const cargoLivre = Object.keys(CATALOGOS_CARGOS_POR_ORGAO.CONSELHO_FISCAL).find((k) => !ocupados.has(k));
  ok(!!cargoLivre, "há um cargo do Conselho Fiscal livre para o pedido de cadeira", [...ocupados]);
  const corpoCadeira = (membroId) => ({ membroId, orgaoId: orgao.OrgaoId, tipoAssento: "FUNCAO", cargoOuFuncao: cargoLivre });
  const pedirCadeira = (membroId) => L.chamar(hAssentos, { metodo: "POST", token: geral, corpo: corpoCadeira(membroId) });
  const rCong = await pedirCadeira(990104), rArrol = await pedirCadeira(990101);
  ok(rCong.body && rCong.body.sucesso === false && /congregado ainda não é membro: não tem cadeira em órgão nenhum/.test(rCong.body.mensagem || ""),
    "a cadeira do congregado: recusada, com a explicação", rCong.body);
  ok(rArrol.body && rArrol.body.sucesso === false && /arrolamento a completar/.test(rArrol.body.mensagem || ""), "a cadeira de quem está em arrolamento: recusada, com a explicação", rArrol.body);
  // o controle positivo: o MESMO pedido, para um membro em comunhão sem cadeira, cria a cadeira (o pedido é válido; o que recusou foi a situação)
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, Status, SituacaoMembro) VALUES (990105, N'Elias Em Comunhão E2E101', N'ATIVO', N'EM_COMUNHAO')`);
  const rMembro = await pedirCadeira(990105);
  ok(rMembro.status === 201 && rMembro.body && rMembro.body.sucesso === true && rMembro.body.assento && rMembro.body.assento.cargoOuFuncao === cargoLivre,
    "o mesmo pedido para um membro em comunhão: a cadeira é criada (201)", rMembro.body);
  const pedirComissao = async (membroId) => {
    const ctx = { bindingData: { sigla: "ccj" }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
    await hComissoes(ctx, { method: "POST", query: {}, body: { membroId }, headers: { "x-auth-token": geral } });
    return ctx.res || { body: null };
  };
  const cCong = await pedirComissao(990104), cArrol = await pedirComissao(990101);
  ok(cCong.body && cCong.body.sucesso === false && /congregado ainda não é membro/.test(cCong.body.mensagem || "")
    && cArrol.body && cArrol.body.sucesso === false && /arrolamento a completar/.test(cArrol.body.mensagem || ""), "a vaga na comissão (CCJ): recusada aos dois, com a explicação", [cCong.body, cArrol.body]);
  ok((await escalar("SELECT COUNT(*) FROM Assentos WHERE MembroId IN (990101, 990104)")) === cadeirasAntes
    && (await escalar("SELECT COUNT(*) FROM ComissaoMembros WHERE MembroId IN (990101, 990104)")) === 0, "nada foi gravado (nem cadeira, nem vaga na comissão)");

  console.log("== volta 7: o ator errado nas duas rotas (a recusa não diz a situação de ninguém a quem não é da Geral) ==");
  const rota = async (h, ligado, token, corpo) => {
    const ctx = { bindingData: ligado || {}, log: { error() { }, info() { }, warn() { }, verbose() { } } };
    await h(ctx, { method: "POST", query: {}, body: corpo, headers: token ? { "x-auth-token": token } : {} });
    return ctx.res || { status: 0, body: null };
  };
  const congNome = (await um("SELECT TOP 1 Nome FROM Congregacoes ORDER BY CongregacaoId")).Nome;
  const atores = [["a liderança local", L.LIDER(990103, ["pessoas", "financeiro", "reunioes"], [congNome], "CONGREGACAO")],
    ["a área", L.LIDER(990103, ["pessoas", "financeiro", "reunioes"], [congNome], "AREA")], ["o membro por PIN", L.PIN(990103)]];
  const NAO_EXISTE = 98765432;
  for (const [nome, tk] of atores) {
    const existe = await rota(hAssentos, {}, tk, corpoCadeira(990104)), naoExiste = await rota(hAssentos, {}, tk, corpoCadeira(NAO_EXISTE));
    ok(existe.status === 403 && naoExiste.status === 403 && JSON.stringify(existe.body) === JSON.stringify(naoExiste.body),
      `a cadeira, ${nome}: 403 igual para o congregado que existe e para a matrícula que não existe`, { existe, naoExiste });
    for (const sigla of ["ccj", "pmo", "cder"]) {
      const cE = await rota(hComissoes, { sigla }, tk, { membroId: 990104 }), cN = await rota(hComissoes, { sigla }, tk, { membroId: NAO_EXISTE });
      ok(cE.status === 403 && cN.status === 403 && JSON.stringify(cE.body) === JSON.stringify(cN.body), `a comissão ${sigla.toUpperCase()}, ${nome}: 403 igual para os dois`, { cE, cN });
    }
  }
  const semSessao = await rota(hAssentos, {}, null, corpoCadeira(990104)), semSessaoC = await rota(hComissoes, { sigla: "ccj" }, null, { membroId: 990104 });
  ok(semSessao.status === 401 && semSessaoC.status === 401 && !/congregado|arrolamento/i.test(JSON.stringify([semSessao.body, semSessaoC.body])),
    "sem sessão: 401 nas duas, sem dizer a situação", { semSessao, semSessaoC });
  ok((await escalar("SELECT COUNT(*) FROM Assentos WHERE MembroId IN (990101, 990104)")) === cadeirasAntes
    && (await escalar("SELECT COUNT(*) FROM ComissaoMembros WHERE MembroId IN (990101, 990104)")) === 0, "o ator errado não gravou nada");

  console.log("== volta 9: o aviso à Geral das cadeiras antigas de quem não é membro (o painel de Membros) ==");
  // as cadeiras antigas: a do arrolamento (990101) e a do congregado (990104) no Conselho Fiscal, de antes da regra; uma vaga antiga do congregado na CCJ
  await q(`INSERT INTO ComissaoMembros (Sigla, MembroId) VALUES (N'CCJ', 990104)`);
  const hPessoas = require(L.path.join(L.API, "GestaoPessoas/index.js"));
  const painelDe = async (tk) => (await L.chamar(hPessoas, { metodo: "GET", token: tk, query: { resumo: "1" } })).body;
  const pGeral = await painelDe(geral);
  const fora = pGeral && pGeral.resumo && pGeral.resumo.cadeirasForaDoRol;
  ok(!!fora && fora.cadeiras === 2 && fora.vagas === 1, "a Geral recebe as contas: 2 cadeiras e 1 vaga de comissão de quem não é membro", fora);
  const nomesFora = (fora && fora.itens || []).map((i) => `${i.nome}|${i.onde}|${i.tipo}`);
  ok(nomesFora.length === 3 && nomesFora.includes("Ana Arrolamento E2E101|Conselho Fiscal|CADEIRA") && nomesFora.includes("Davi Congregado E2E101|CCJ|COMISSAO")
    && !nomesFora.some((x) => /Bruno|Carla|Elias/.test(x)), "até 3 nomes com o órgão; o sem comunhão e os membros em comunhão não entram", nomesFora);
  const pLocal = await painelDe(atores[0][1]), pArea = await painelDe(atores[1][1]);
  ok(pLocal && pLocal.sucesso && pLocal.resumo && pLocal.resumo.cadeirasForaDoRol === undefined && pArea && pArea.resumo && pArea.resumo.cadeirasForaDoRol === undefined,
    "a liderança local e a área não recebem o aviso (só a Geral encerra)", [pLocal && pLocal.resumo && pLocal.resumo.cadeirasForaDoRol, pArea && pArea.resumo && pArea.resumo.cadeirasForaDoRol]);
  // a Geral encerra a cadeira do congregado com o motivo: sai do aviso, o motivo fica na cadeira e na trilha; nada se apaga
  const antigaCong = await um("SELECT AssentoId FROM Assentos WHERE MembroId = 990104 AND DataFim IS NULL");
  const ctxEnc = { bindingData: { id: String(antigaCong.AssentoId), acao: "encerrar" }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  await hAssentos(ctxEnc, { method: "POST", query: {}, body: { motivoEncerramento: "Ainda não é membro (congregado) E2E101" }, headers: { "x-auth-token": geral } });
  ok(ctxEnc.res && ctxEnc.res.body && ctxEnc.res.body.sucesso === true, "a Geral encerra a cadeira antiga do congregado", ctxEnc.res && ctxEnc.res.body);
  const encerrada = await um("SELECT CONVERT(varchar(10), DataFim, 120) AS DataFim, MotivoEncerramento FROM Assentos WHERE AssentoId = @id", { id: antigaCong.AssentoId });
  const trilhaEnc = await um("SELECT TOP 1 DadosDepois FROM AuditLog WHERE Tabela = N'Assentos' AND RegistroId = @id ORDER BY AuditId DESC", { id: String(antigaCong.AssentoId) });
  ok(!!encerrada.DataFim && encerrada.MotivoEncerramento === "Ainda não é membro (congregado) E2E101" && /Ainda não é membro \(congregado\) E2E101/.test(trilhaEnc && trilhaEnc.DadosDepois || ""),
    "o motivo fica na cadeira e na trilha; a cadeira continua lá (encerrada, não apagada)", { encerrada, trilhaEnc });
  const fora2 = ((await painelDe(geral)).resumo || {}).cadeirasForaDoRol || {};
  ok(fora2.cadeiras === 1 && fora2.vagas === 1, "encerrada, sai do aviso (fica a do arrolamento e a vaga na CCJ)", fora2);
  await q("DELETE FROM ComissaoMembros WHERE MembroId = 990104");

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
    (990205, N'Kátia Congregada E2E101', N'ATIVO', N'CONGREGADO', NULL, '2008-01-01'),
    (990299, N'Hugo Pastor E2E101', N'ATIVO', N'EM_COMUNHAO', NULL, NULL);
    INSERT INTO FichasPendencias (MembroId, Tipo, Detalhe, Origem, AbertaPor) VALUES (990201, N'ARROLAMENTO', N'Importada do sistema pago (e2e-101).', N'IMPORTACAO', 990299)`);
  const turma = await escalar(`INSERT INTO TurmasBatismo (DataBatismo, Local, TipoLocal, AutorizacaoMesa, Status) OUTPUT inserted.TurmaId
    VALUES ('2026-10-03', N'Templo de mentira', N'TEMPLO', 1, N'REALIZADA')`);
  await q(`INSERT INTO CandidatosBatismo (MembroId, TurmaId, Status) VALUES (990201, @t, N'APROVADO'), (990202, @t, N'APROVADO'), (990203, @t, N'APROVADO'), (990204, @t, N'APROVADO'), (990205, @t, N'APROVADO')`, { t: turma });
  // a Kátia já tem a conversão registrada (2007): o batismo não grava outra nem troca a dela
  await q(`INSERT INTO MarcosMembro (MembroId, Tipo, Descricao, DataMarco, DataAproximada, CriadoPor) VALUES (990205, N'CONVERSAO', N'Aceitou a Jesus (e2e-101).', '2007-05-05', 0, 990299)`);
  const trilhaAntes = await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = N'MembroReferencia' AND RegistroId IN (N'990201', N'990202', N'990203', N'990204', N'990205')");
  const n = await batismo.efetivarTurma(pool, turma, 990299);
  ok(n === 5, "a turma efetiva os 5 aprovados", n);
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
  const conversoes = await q(`SELECT MembroId, CONVERT(varchar(10), DataMarco, 120) AS Data, CriadoPor FROM MarcosMembro WHERE Tipo = N'CONVERSAO'
    AND MembroId IN (990201, 990202, 990203, 990204, 990205) ORDER BY MembroId, MarcoId`);
  ok(conversoes.length === 2 && conversoes[0].MembroId === 990202 && conversoes[0].Data === "2006-03-01" && conversoes[0].CriadoPor === 990299,
    "as duas datas: a congregada desde 2006 ganha a conversão em 2006 (só ela e a Kátia têm conversão; o arrolamento, a carta e o membro antigo, não)", conversoes);
  ok(conversoes[1].MembroId === 990205 && conversoes[1].Data === "2007-05-05", "a Kátia continua com a conversão que já tinha (o batismo não grava por cima nem duplica)", conversoes[1]);
  const fk = await ficha(990205);
  ok(fk.DataAdmissao === "2026-10-03" && fk.FormaAdmissao === "BATISMO", "e a admissão da Kátia é a do batismo (os 90 dias contam dele)", fk);
  const p = await um("SELECT Situacao, Resolucao, ResolvidaPor, Nota FROM FichasPendencias WHERE MembroId = 990201 AND Tipo = N'ARROLAMENTO'");
  ok(p.Situacao === "RESOLVIDA" && p.Resolucao === "COMPLETADA" && p.ResolvidaPor === 990299 && /data de entrada igual à do batismo/.test(p.Nota || ""),
    "a pendência fechou junto: RESOLVIDA, COMPLETADA, por quem realizou, e a nota diz da data de entrada", p);
  ok((await escalar("SELECT COUNT(*) FROM FichasPendencias WHERE MembroId = 990201 AND Situacao = N'ABERTA'")) === 0, "nenhuma pendência aberta sobrou");
  const tr = await q(`SELECT RegistroId, Acao, UsuarioId, DadosAntes, DadosDepois FROM AuditLog WHERE Tabela = N'MembroReferencia' AND RegistroId IN (N'990201', N'990202', N'990203', N'990204', N'990205')
    ORDER BY AuditId`);
  const novas = tr.slice(trilhaAntes);
  const de = (id) => novas.find((x) => Number(x.RegistroId) === id);
  ok(novas.length === 5 && de(990201).Acao === "O batismo completou o arrolamento" && de(990202).Acao === "O batismo admitiu o membro"
    && de(990204).Acao === "O batismo foi registrado na ficha de quem já era membro" && novas.every((x) => x.UsuarioId === 990299),
    "uma trilha por efetivação, por quem realizou (a do arrolamento diz que o batismo o completou)", novas.map((x) => [x.RegistroId, x.Acao]));
  ok(/"dataAdmissao":"2006-03-01"/.test(de(990202).DadosAntes || ""), "a data anterior da congregada fica na trilha (não se perde)", de(990202).DadosAntes);
  ok(/"conversao":"2006-03-01"/.test(de(990202).DadosDepois || "") && !/"conversao"/.test(de(990205).DadosDepois || ""), "a trilha diz quando o batismo guardou a conversão (a da Kátia não: já existia)");
  ok((await escalar("SELECT COUNT(*) FROM CandidatosBatismo WHERE TurmaId = @t AND Status = N'BATIZADO'", { t: turma })) === 5, "os 5 candidatos ficam BATIZADO");
  // o painel do arrolamento: vieram (a pendência, aberta ou resolvida) − faltam (ainda em ARROLAMENTO) = completadas — o batizado conta como completado
  const conta = await um(`SELECT SUM(CASE WHEN fp.Situacao = N'ABERTA' THEN 1 ELSE 0 END) AS abertas, SUM(CASE WHEN m.SituacaoMembro = N'ARROLAMENTO' THEN 1 ELSE 0 END) AS faltam
    FROM FichasPendencias fp JOIN MembroReferencia m ON m.MembroId = fp.MembroId WHERE fp.Tipo = N'ARROLAMENTO' AND fp.MembroId = 990201`);
  ok(conta.abertas === 0 && conta.faltam === 0, "o painel conta o batizado como completado, sem pendência aberta", conta);
  // a cadeia de hashes da trilha continua inteira depois das trilhas dentro da transação
  const cadeia = await um(`SELECT COUNT(*) AS n FROM AuditLog WHERE Tabela = N'MembroReferencia' AND HashRegistro IS NULL`);
  ok(cadeia.n === 0, "toda trilha nova tem o hash da cadeia", cadeia);

  console.log("== volta 8: a conversão vem antes do batismo e nunca no futuro (menor 2 do portão da volta 7) ==");
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, Status, SituacaoMembro, FormaAdmissao, DataAdmissao) VALUES
    (990206, N'Lia Data Depois E2E101', N'ATIVO', N'CONGREGADO', NULL, '2026-11-10'),
    (990207, N'Mário Data Futura E2E101', N'ATIVO', N'CONGREGADO', NULL, '2031-01-01'),
    (990208, N'Nina Normal E2E101', N'ATIVO', N'CONGREGADO', NULL, '2009-09-09'),
    (990209, N'Otávio Turma Futura E2E101', N'ATIVO', N'CONGREGADO', NULL, '2099-01-01')`);
  const turma2 = await escalar(`INSERT INTO TurmasBatismo (DataBatismo, Local, TipoLocal, AutorizacaoMesa, Status) OUTPUT inserted.TurmaId
    VALUES ('2026-10-03', N'Templo de mentira', N'TEMPLO', 1, N'REALIZADA')`);
  await q(`INSERT INTO CandidatosBatismo (MembroId, TurmaId, Status) VALUES (990206, @t, N'APROVADO'), (990207, @t, N'APROVADO'), (990208, @t, N'APROVADO')`, { t: turma2 });
  // a trava do futuro sozinha: a turma lançada com data futura (2099) e a data de antes ANTES dela, mas depois de hoje
  const turma3 = await escalar(`INSERT INTO TurmasBatismo (DataBatismo, Local, TipoLocal, AutorizacaoMesa, Status) OUTPUT inserted.TurmaId
    VALUES ('2099-10-17', N'Templo de mentira', N'TEMPLO', 1, N'REALIZADA')`);
  await q(`INSERT INTO CandidatosBatismo (MembroId, TurmaId, Status) VALUES (990209, @t, N'APROVADO')`, { t: turma3 });
  ok((await batismo.efetivarTurma(pool, turma2, 990299)) === 3 && (await batismo.efetivarTurma(pool, turma3, 990299)) === 1, "as duas turmas efetivam os 4 (o batismo segue)");
  const marcos2 = await q(`SELECT MembroId, CONVERT(varchar(10), DataMarco, 120) AS Data FROM MarcosMembro WHERE Tipo = N'CONVERSAO' AND MembroId IN (990206, 990207, 990208, 990209)`);
  ok(!marcos2.some((x) => x.MembroId === 990206), "a data de antes (10/11/2026) DEPOIS do batismo (03/10/2026) não vira conversão", marcos2);
  ok(!marcos2.some((x) => x.MembroId === 990207), "a data de antes no futuro (2031) não vira conversão", marcos2);
  ok(!marcos2.some((x) => x.MembroId === 990209), "a turma com data futura: a data de antes também no futuro (antes do batismo, depois de hoje) não vira conversão", marcos2);
  ok(marcos2.length === 1 && marcos2[0].MembroId === 990208 && marcos2[0].Data === "2009-09-09", "o caso comum continua: uma conversão, em 2009", marcos2);
  const f206 = await ficha(990206);
  ok(f206.SituacaoMembro === "EM_COMUNHAO" && f206.DataAdmissao === "2026-10-03", "quem tinha a data errada vira membro do mesmo jeito, com a admissão do batismo", f206);
  const tr206 = await um(`SELECT TOP 1 DadosAntes, DadosDepois FROM AuditLog WHERE Tabela = N'MembroReferencia' AND RegistroId = N'990206' ORDER BY AuditId DESC`);
  ok(/"dataAdmissao":"2026-11-10"/.test(tr206.DadosAntes || "") && !/"conversao"/.test(tr206.DadosDepois || ""), "a data errada fica na trilha, sem virar conversão", tr206);

  console.log("== volta 9: a conversão lançada e corrigida à mão (antes do batismo, nunca no futuro) ==");
  const congId = (await um("SELECT TOP 1 CongregacaoId FROM Congregacoes ORDER BY CongregacaoId")).CongregacaoId;
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, Status, SituacaoMembro, DataBatismo, CongregacaoId) VALUES (990211, N'Paulo Batizado E2E101', N'ATIVO', N'EM_COMUNHAO', '2020-05-10', @c)`, { c: congId });
  const hMarco = require(L.path.join(L.API, "RegistrarMarcoMembro/index.js"));
  const hEditarMarco = require(L.path.join(L.API, "EditarMarcoMembro/index.js"));
  const lancar = (dataMarco) => L.chamar(hMarco, { metodo: "POST", token: geral, corpo: { membroId: 990211, tipo: "CONVERSAO", descricao: "Aceitou a Jesus (e2e-101)", dataMarco } });
  const depois = await lancar("2021-01-01"), futura = await lancar("2031-01-01");
  ok(depois.status === 400 && /antes do batismo.*10\/05\/2020/.test(depois.body && depois.body.mensagem || ""), "lançar a conversão depois do batismo: recusada, com a data do batismo", depois.body);
  ok(futura.status === 400 && /futuro/.test(futura.body && futura.body.mensagem || ""), "lançar a conversão no futuro: recusada", futura.body);
  ok((await escalar("SELECT COUNT(*) FROM MarcosMembro WHERE MembroId = 990211")) === 0, "nada foi gravado");
  const noDia = await lancar("2020-05-10");
  ok(noDia.status === 201 && noDia.body && noDia.body.sucesso === true, "no mesmo dia do batismo: vale", noDia.body);
  const corrigir = async (dataMarco) => {
    const ctx = { bindingData: { marcoId: String(noDia.body && noDia.body.marcoId) }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
    await hEditarMarco(ctx, { method: "POST", query: {}, body: { dataMarco, justificativa: "Corrigindo (e2e-101)" }, headers: { "x-auth-token": geral } });
    return ctx.res || { body: null };
  };
  const cDepois = await corrigir("2020-06-01");
  ok(cDepois.status === 400 && /antes do batismo/.test(cDepois.body && cDepois.body.mensagem || ""), "corrigir a conversão para depois do batismo: recusada", cDepois.body);
  ok((await um("SELECT CONVERT(varchar(10), DataMarco, 120) AS D FROM MarcosMembro WHERE MembroId = 990211")).D === "2020-05-10", "a conversão continua com a data de antes");
  const cAntes = await corrigir("2019-01-01");
  ok(cAntes.body && cAntes.body.sucesso === true && (await um("SELECT CONVERT(varchar(10), DataMarco, 120) AS D FROM MarcosMembro WHERE MembroId = 990211")).D === "2019-01-01",
    "corrigir para antes do batismo: vale", cAntes.body);

  console.log("== volta 9: a carteirinha de quem está em arrolamento (a situação neutra, nunca 'em disciplina') ==");
  const hCart = require(L.path.join(L.API, "Carteirinhas/index.js"));
  const hConf = require(L.path.join(L.API, "ConferirCarteirinha/index.js"));
  ok((await escalar("SELECT SituacaoMembro FROM MembroReferencia WHERE MembroId = 990101")) === "ARROLAMENTO", "(a Ana continua em arrolamento)");
  // a ficha importada de verdade tem a data que veio do sistema pago: a carteirinha não a mostra como "membro desde"
  await q("UPDATE MembroReferencia SET DataAdmissao = '2012-05-05' WHERE MembroId = 990101");
  const minha = await L.chamar(hCart, { acao: "minha", token: L.PIN(990101) });
  const cart = minha.body && minha.body.carteirinha;
  ok(minha.status === 200 && cart && cart.situacao === "EM_ATUALIZACAO" && !cart.cargo, "a Minha carteirinha de quem está em arrolamento: ficha em atualização (não 'em disciplina')", minha.body && { situacao: cart && cart.situacao });
  ok(cart && cart.membroDesde === null, "e sem o 'membro desde' (a data do sistema pago tem sentido desconhecido)", cart && cart.membroDesde);
  const codigo = await escalar("SELECT TOP 1 Codigo FROM CarteirinhasQr WHERE MembroId = 990101");
  const ctxConf = { bindingData: { codigo }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  await hConf(ctxConf, { method: "GET", query: {}, body: undefined, headers: { "x-forwarded-for": "177.40.1.9:5000" } });
  const conf = ctxConf.res && ctxConf.res.body;
  ok(conf && conf.situacao === "EM_ATUALIZACAO" && conf.nome === "Ana Arrolamento E2E101" && conf.congregacao === undefined && conf.cargo === undefined && conf.membroDesde === undefined,
    "a página pública do QR: ficha em atualização, só o nome (e a foto, se houver); nada além", conf);
  const ctxFicha = { bindingData: { acao: "ficha", id: "990101" }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  await hCart(ctxFicha, { method: "GET", query: {}, body: undefined, headers: { "x-auth-token": L.GERAL(990103, ["pessoas"]) } });
  const naFicha = ctxFicha.res && ctxFicha.res.body && ctxFicha.res.body.carteirinha;
  ok(naFicha && naFicha.podeImprimir === false && /ficha ainda está para completar/.test(naFicha.porQueNao || "") && !/disciplina/i.test(naFicha.porQueNao || ""),
    "o botão Carteirinha da ficha: não imprime, e o motivo é a ficha a completar (não 'em disciplina')", naFicha);

  await q(`DELETE FROM CandidatosBatismo WHERE TurmaId IN (@t, @t2, @t3); DELETE FROM TurmasBatismo WHERE TurmaId IN (@t, @t2, @t3); DELETE FROM PublicoEnqueteCustom WHERE EnqueteId = @e;
    DELETE FROM Enquetes WHERE EnqueteId = @e; DELETE FROM Assentos WHERE MembroId BETWEEN 990101 AND 990105`, { t: turma, t2: turma2, t3: turma3, e: enq });
  fim("e2e-101 (o voto e o batismo de quem está em arrolamento)");
}
principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
