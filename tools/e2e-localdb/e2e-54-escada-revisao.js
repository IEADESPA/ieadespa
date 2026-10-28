// e2e-54-escada-revisao.js — v8.2 (Escada ministerial): o que as revisões independentes de 28/10/2026 pediram, com os handlers e o banco REAIS, sobre a base "cenario-escada".
// Ninguém mexe no próprio cargo, data, dízimo ou sexo pelo cadastro; ficha aberta antes de uma conclusão não desfaz a promoção (409); sexo não se apaga quando não vem; "no
// cargo desde" antes de 2000; o preenchimento inicial da 157 não roda de novo; a conclusão refeita dentro da trava;
// o CHM usado na promoção; a rematrícula com a data do CHM; o teto das obreiras também para outra convenção; veto só em processo que leva a cargo; candidato (o próprio,
// congregado); a data de Brasília na conclusão; e a matrícula da pessoa que sumiu nunca "passa".
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, path, API, hojeBr } = L;
const E = require("./lib-escada");
const { P, TIPO, SEC, LIDER, req, protocolar, evoluir, concluir, afmPost, salvarPessoa, chamarRota } = E;

console.error = () => { };
const cargo = (m) => escalar("SELECT CargoMinisterial FROM MembroReferencia WHERE MembroId = @m", { m });
const aberta = (m) => um("SELECT Cargo, CONVERT(varchar(10), Desde, 120) AS Desde, Origem FROM CargosMinisteriaisHistorico WHERE MembroId = @m AND Ate IS NULL", { m });

(async () => {
  await obterPool();
  const hoje = hojeBr();
  await E.montarCenario();
  const LID = LIDER();

  console.log("== cadastro: o próprio, a ficha velha, o sexo, a data antiga ==");
  await q("INSERT INTO CargosMinisteriaisHistorico (MembroId, Cargo, Desde, Origem) SELECT 1002, CargoMinisterial, '2015-01-01', 'LEGADO' FROM MembroReferencia WHERE MembroId = 1002 AND CargoMinisterial IS NOT NULL AND NOT EXISTS (SELECT 1 FROM CargosMinisteriaisHistorico WHERE MembroId = 1002 AND Ate IS NULL)");
  for (const [rotulo, mudanca] of [["cargo", { cargoMinisterial: "PASTOR" }], ["data no cargo", { cargoDesde: "2001-01-01", cargoMinisterial: (await cargo(1002)) || "PASTOR" }], ["dízimo", { dizimistaFiel: false }], ["sexo", { sexo: "F" }]]) {
    const antes = await um("SELECT CargoMinisterial, DizimistaFiel, Sexo FROM MembroReferencia WHERE MembroId = 1002");
    const r = await salvarPessoa(1002, mudanca);
    const depois = await um("SELECT CargoMinisterial, DizimistaFiel, Sexo FROM MembroReferencia WHERE MembroId = 1002");
    ok(r.status === 422 && JSON.stringify(antes) === JSON.stringify(depois), `a Secretaria não muda o próprio ${rotulo}`, r.body);
  }
  let r = await salvarPessoa(1002, { telefone: "91988887777" });
  ok(r.status === 200, "o próprio telefone, sim", r.body);
  // ficha aberta (cargo lido = MISSIONARIO); uma consagração a Diácono conclui no meio; salvar a ficha velha não desfaz
  r = await protocolar({ membroId: P.missionario, assunto: TIPO.DIACONO, proponenteMembroId: 1001 });
  await concluir(r.body.consagracao.consagracaoId);
  ok((await cargo(P.missionario)) === "DIACONO", "concluída: Diácono");
  r = await salvarPessoa(P.missionario, { cargoMinisterial: "MISSIONARIO", cargoOriginal: "MISSIONARIO", telefone: "91900001111" });
  ok(r.status === 409 && (await cargo(P.missionario)) === "DIACONO" && (await aberta(P.missionario)).Cargo === "DIACONO", "a ficha velha recebe 409 e a promoção fica", r.body);
  r = await salvarPessoa(P.missionario, { telefone: "91900001111", cargoOriginal: "DIACONO" });
  ok(r.status === 200, "reaberta, salva", r.body);
  const sexoAntes = await escalar("SELECT Sexo FROM MembroReferencia WHERE MembroId = @m", { m: P.missionario });
  const p = await E.pessoa(P.missionario);
  const { sexo, cargoDesde, funcao, congregacao, extensao, capacidade, menorDeIdade, fotoUrl, processoDisciplinarAtivo, ...semSexo } = p;
  r = await chamarRota("GestaoPessoas/index.js", { metodo: "POST", token: SEC(), corpo: { ...semSexo, telefone: "91900002222" } });
  ok(r.status === 200 && (await escalar("SELECT Sexo FROM MembroReferencia WHERE MembroId = @m", { m: P.missionario })) === sexoAntes, "POST sem o campo 'sexo' não apaga o sexo", { status: r.status, sexoAntes });
  r = await salvarPessoa(P.legado, { cargoDesde: "1998-03-15" });
  ok(r.status === 200 && (await aberta(P.legado)).Desde === "1998-03-15", "Diácono desde 1998: aceito", r.body);
  r = await salvarPessoa(P.legado, { cargoDesde: "1949-12-31" });
  ok(r.body.sucesso === false && /antiga demais/.test(r.body.mensagem), "antes de 1950: recusado", r.body);
  r = await salvarPessoa(P.legado, { cargoDesde: "1999-02-29" });
  ok(r.body.sucesso === false, "dia que não existe: recusado", r.body);

  console.log("== migração 157 de novo: o preenchimento inicial não volta ==");
  await q("UPDATE CargosMinisteriaisHistorico SET Desde = NULL WHERE MembroId = @m AND Ate IS NULL", { m: P.vetado });
  await q("DELETE FROM CargosMinisteriaisHistorico WHERE MembroId = @m", { m: P.foraEscopo });
  const { execSync } = require("child_process");
  execSync(`node -r ./shim-mssql.js aplicar-migracao.js 157`, { cwd: __dirname, stdio: "pipe" });
  ok((await aberta(P.vetado)).Desde === null, "a data em branco de propósito continua em branco");
  ok(!(await aberta(P.foraEscopo)), "quem ficou sem linha não ganha uma 'LEGADO' com data antiga");

  console.log("== o CHM usado na promoção; a rematrícula leva a data do CHM ==");
  ok((await um("SELECT CertificadoHabilitacao AS c, CHMEm AS em FROM Matriculas_AFM WHERE MembroId = @m", { m: P.missionario })).c === false, "promovido: o CHM da subida foi usado");
  r = await afmPost("chm", { membroId: P.inativo, conceder: true, data: hoje });
  ok(r.status === 422, "inativo não recebe CHM");
  await q("UPDATE Matriculas_AFM SET CertificadoHabilitacao = 1, CHMEm = '2025-05-05', CHMPor = 1001 WHERE MembroId = @m", { m: P.inativo });
  await q("INSERT INTO AFMDesmatriculas (MatriculaId, MembroId, Motivo, DataDesmatricula, Detalhe, RegistradoPor) SELECT MatriculaId, MembroId, 'REPROVACAO', '2026-09-01', N'Prova de liturgia (e2e)', 1002 FROM Matriculas_AFM WHERE MembroId = @m", { m: P.inativo }).catch(() => null);
  r = await afmPost("rematricular", { membroId: P.inativo, reciclagemAprovadaEm: hoje, observacao: "Reciclagem e2e" });
  const nova = await um("SELECT TOP 1 CertificadoHabilitacao AS c, CONVERT(varchar(10), CHMEm, 120) AS em, CHMPor AS por FROM Matriculas_AFM WHERE MembroId = @m ORDER BY MatriculaId DESC", { m: P.inativo });
  ok(r.status === 201 && nova.c === true && nova.em === "2025-05-05" && nova.por === 1001, "a rematrícula leva o CHM com a data e quem concedeu", { r: r.body, nova });

  console.log("== outra convenção: o teto das obreiras vale ==");
  await q("UPDATE MembroReferencia SET Sexo = 'F' WHERE MembroId = @m", { m: P.forasteiro });
  r = await protocolar({ membroId: P.forasteiro, assunto: TIPO.PASTOR, proponenteMembroId: 1001, modalidade: "OUTRA_CONVENCAO", atoReferencia: "Igreja de origem e2e" });
  ok(r.body.sucesso === false && (r.body.requisitos.itens.find((i) => i.chave === "sexo") || {}).situacao === "FALTA", "pastora de outra convenção: trava no Art. 71, III (decisão a confirmar com o responsável)", r.body.mensagem);

  console.log("== veto só em processo que leva a cargo ==");
  r = await protocolar({ membroId: P.menor, assunto: "Integração", proponenteMembroId: 1002 });
  ok(r.status === 201, "Integração protocolada", r.body);
  r = await afmPost("vetar", { consagracaoId: r.body.consagracao.consagracaoId, motivo: "Tentativa de vetar uma Integração" });
  ok(r.status === 409, "a AFM não veta Integração", r.body);

  console.log("== candidato: o próprio e o congregado ==");
  r = await afmPost("matricular-candidato", { membroId: 1002, nivel: "BASICO", data: hoje });
  ok(r.status === 422, "ninguém matricula a si mesmo", r.body);
  await q("UPDATE MembroReferencia SET SituacaoMembro = 'CONGREGADO', CargoMinisterial = NULL WHERE MembroId = @m", { m: P.menor });
  r = await afmPost("matricular-candidato", { membroId: P.menor, nivel: "BASICO", data: hoje });
  ok(r.status === 422 && /congregado/i.test(r.body.mensagem), "congregado não é candidato", r.body);

  console.log("== conclusão (v8.3: o registro da cerimônia): data de Brasília; refeita dentro da trava ==");
  r = await protocolar({ membroId: P.auxiliar, assunto: TIPO.MISSIONARIO, proponenteMembroId: 1002 });
  const idAux = r.body.consagracao.consagracaoId;
  await evoluir(idAux, "AVANCAR"); await E.parecer(idAux); await E.homologar(idAux); await E.pagarTaxa(idAux);
  let ce = await E.novaCerimonia();
  await E.cerimonias("incluir", { cerimoniaId: ce, ids: [idAux] });
  // entre a homologação e a cerimônia, a AFM revoga o CHM direto no banco (a conferência é feita de novo dentro da transação do registro)
  await q("UPDATE Matriculas_AFM SET CertificadoHabilitacao = 0 WHERE MembroId = @m", { m: P.auxiliar });
  r = await E.cerimonias("registrar", { cerimoniaId: ce, presentes: [idAux], ausentes: [] });
  ok(r.body.sucesso && r.body.resultados[0].resultado === "VOLTOU" && (await cargo(P.auxiliar)) === "AUXILIAR", "sem o CHM, a cerimônia não muda o cargo: volta para a fila", r.body);
  ok((await E.statusDe(idAux)) === "HOMOLOGADO" && !(await escalar("SELECT CerimoniaId FROM Consagracoes WHERE ConsagracaoId = @id", { id: idAux })), "continua homologado, fora da cerimônia");
  await q("UPDATE Matriculas_AFM SET CertificadoHabilitacao = 1 WHERE MembroId = @m", { m: P.auxiliar });
  ce = await E.novaCerimonia();
  await E.cerimonias("incluir", { cerimoniaId: ce, ids: [idAux] });
  r = await E.cerimonias("registrar", { cerimoniaId: ce, presentes: [idAux], ausentes: [] });
  ok(r.body.sucesso && r.body.resultados[0].resultado === "CONSAGRADO" && (await escalar("SELECT CONVERT(varchar(10), DataConclusao, 120) FROM Consagracoes WHERE ConsagracaoId = @id", { id: idAux })) === hoje, "concluída com a data da cerimônia (Brasília)", r.body);

  console.log("== a pessoa que sumiu nunca passa ==");
  const db = require(path.join(API, "shared/escadaDb.js"));
  const sumiu = await db.avaliar(await obterPool(), { membroId: 999999, assunto: TIPO.DIACONO });
  ok(sumiu.avaliacao && sumiu.avaliacao.bloqueado === true, "matrícula inexistente: bloqueado", sumiu);

  fim("e2e-54 escada (revisões)");
})().catch((e) => { console.log("ERRO", e); process.exit(1); });
