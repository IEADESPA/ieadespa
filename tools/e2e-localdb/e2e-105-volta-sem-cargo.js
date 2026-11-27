// e2e-105-volta-sem-cargo.js — a regra da rodada 36 (27/11/2026), no Membros: o cargo acaba quando a pessoa sai do rol, e QUEM VOLTA NÃO RECEBE O CARGO DE
// VOLTA (a volta é uma entrada nova; quem cuida daquele nível decide se põe de novo, r29). Contra o SQL Server de verdade, com as rotas de verdade.
// Só dados de mentira. Prova:
//  - a saída do rol pela secretaria (DESLIGADO, carta de mudança) encerra o cargo com acesso, o assento no órgão, a função e o histórico do cargo ministerial;
//  - a volta ao rol ativo (a readmissão pela Secretaria Geral) não devolve nada disso: o cargo continua encerrado, o assento fechado, a função vazia,
//    nenhuma linha nova; e a pessoa não entra mais como liderança (a sessão de cargo dela não existe).
// A saída pela carta nova (a rota da missão B) entra neste roteiro quando existir: o cargo acaba na confirmação, na mesma transação.
// Roda sobre a base cenario-189 (`BASE=cenario-189 bash rodar.sh roteiro e2e-105-volta-sem-cargo.js`).
const L = require("./lib");
const { ok, fim, q, escalar, um } = L;
const { chamarRota } = require("./lib-afm");

const GERAL = 991051, PEDRO = 991052;

async function principal() {
  const [c1] = await q("SELECT TOP 1 CongregacaoId FROM Congregacoes WHERE Ativa = 1 ORDER BY CongregacaoId");
  await q(`DELETE FROM Assentos WHERE MembroId IN (${GERAL}, ${PEDRO}); DELETE FROM Lideranca WHERE MembroId IN (${GERAL}, ${PEDRO});
           DELETE FROM CargosMinisteriaisHistorico WHERE MembroId IN (${GERAL}, ${PEDRO}); DELETE FROM MembroReferencia WHERE MembroId IN (${GERAL}, ${PEDRO})`);
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, Status, SituacaoMembro, CongregacaoId, Sexo, DataNascimento, DataAdmissao, CargoMinisterial) VALUES
    (${GERAL}, N'Secretaria Geral E2E105', N'ATIVO', N'EM_COMUNHAO', @c, N'F', '1970-01-01', '2000-01-01', NULL),
    (${PEDRO}, N'Pedro Tesoureiro E2E105', N'ATIVO', N'EM_COMUNHAO', @c, N'M', '1980-03-03', '2010-05-05', N'DIACONO')`, { c: c1.CongregacaoId });
  const papelTes = await escalar("SELECT TOP 1 PapelId FROM Papeis WHERE Nome = N'Tesoureiro Local'");
  const orgao = await um("SELECT TOP 1 OrgaoId FROM Orgaos WHERE Sigla = 'CONSELHO_FISCAL'");
  ok(!!papelTes && !!orgao, "a base tem o papel de Tesoureiro Local e o Conselho Fiscal");
  await q(`INSERT INTO Lideranca (MembroId, Tipo, Escopo, PapelId, EscopoTipo, EscopoId, AtivoAte) VALUES (${PEDRO}, N'Tesoureiro', N'congregação', @p, N'CONGREGACAO', @c, NULL);
           INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) VALUES (@o, ${PEDRO}, 'FUNCAO', N'Conselheiro E2E105', '2025-01-01');
           INSERT INTO CargosMinisteriaisHistorico (MembroId, Cargo, Desde, Ate, Origem) VALUES (${PEDRO}, N'DIACONO', '2018-06-10', NULL, N'CADASTRO')`,
  { p: papelTes, c: c1.CongregacaoId, o: orgao.OrgaoId });
  const hoje = L.hojeBr();
  const vigentes = async () => ({
    lideranca: await escalar(`SELECT COUNT(*) FROM Lideranca WHERE MembroId = ${PEDRO} AND (AtivoAte IS NULL OR AtivoAte >= @h)`, { h: hoje }),
    liderancaLinhas: await escalar(`SELECT COUNT(*) FROM Lideranca WHERE MembroId = ${PEDRO}`),
    assentos: await escalar(`SELECT COUNT(*) FROM Assentos WHERE MembroId = ${PEDRO} AND DataFim IS NULL`),
    assentosLinhas: await escalar(`SELECT COUNT(*) FROM Assentos WHERE MembroId = ${PEDRO}`),
    funcao: await escalar(`SELECT CargoMinisterial FROM MembroReferencia WHERE MembroId = ${PEDRO}`),
    historicoAberto: await escalar(`SELECT COUNT(*) FROM CargosMinisteriaisHistorico WHERE MembroId = ${PEDRO} AND Ate IS NULL`)
  });
  const antes = await vigentes();
  ok(antes.lideranca === 1 && antes.assentos === 1 && antes.funcao === "DIACONO" && antes.historicoAberto === 1, "antes: o cargo, o assento e a função valem", antes);

  const pessoas = (corpo) => chamarRota("GestaoPessoas/index.js", { metodo: "POST", token: L.GERAL(GERAL, ["pessoas"]), corpo });
  const base = { membroId: PEDRO, nome: "Pedro Tesoureiro E2E105", congregacaoId: c1.CongregacaoId, sexo: "M", dataNascimento: "1980-03-03", dataAdmissao: "2010-05-05" };

  console.log("== a saída do rol (carta de mudança, pela secretaria) ==");
  const saiu = await pessoas({ ...base, status: "DESLIGADO", motivoSaida: "CARTA_MUDANCA" });
  ok(saiu.status === 200 && saiu.body && saiu.body.sucesso !== false, "a saída grava", saiu.body);
  const depoisDaSaida = await vigentes();
  ok(depoisDaSaida.lideranca === 0 && depoisDaSaida.assentos === 0 && depoisDaSaida.funcao === null && depoisDaSaida.historicoAberto === 0,
    "na saída o cargo acaba: sem cargo vigente, o assento fechado, a função vazia, o histórico fechado", depoisDaSaida);

  console.log("== a volta (a readmissão pela Secretaria Geral) ==");
  const voltou = await pessoas({ ...base, status: "ATIVO", situacaoMembro: "EM_COMUNHAO", dataAdmissao: hoje });
  ok(voltou.status === 200 && voltou.body && voltou.body.sucesso !== false, "a volta grava", voltou.body);
  ok((await escalar(`SELECT Status FROM MembroReferencia WHERE MembroId = ${PEDRO}`)) === "ATIVO", "a pessoa está de novo no rol ativo");
  const depoisDaVolta = await vigentes();
  ok(depoisDaVolta.lideranca === 0 && depoisDaVolta.assentos === 0 && depoisDaVolta.funcao === null && depoisDaVolta.historicoAberto === 0,
    "quem volta NÃO recebe o cargo de volta (r36): sem cargo vigente, sem assento, sem função, sem histórico aberto", depoisDaVolta);
  ok(depoisDaVolta.liderancaLinhas === antes.liderancaLinhas && depoisDaVolta.assentosLinhas === antes.assentosLinhas,
    "e nenhuma linha nova de cargo ou de assento (o que houve fica como histórico, encerrado)", depoisDaVolta);
  const sessao = await require(L.path.join(L.API, "shared/sessaoLideranca.js")).buscarLiderancas(await L.obterPool(), PEDRO);
  const ativas = (sessao || []).filter((l) => !(l.ativoAte && l.ativoAte < hoje));
  ok(ativas.length === 0, "a pessoa não entra mais como liderança (nenhum cargo vigente para a sessão)",
    (sessao || []).map((l) => ({ papelId: l.papelId, ativoAte: l.ativoAte })));
}

principal().then(() => fim("e2e-105 (r36: quem volta não recebe o cargo de volta)"))
  .catch((e) => { console.error(e); ok(false, "o roteiro estourou", String(e && e.message)); fim("e2e-105"); });
