// e2e-153-acesso-revisao.js — as correções da revisão de fora do ramo v10-acesso-ajustes-3 (26/11/2026), contra o SQL Server de verdade. Monta o próprio
// cenário sobre a base cenario-175 (`BASE=cenario-175 bash rodar.sh roteiro e2e-153-acesso-revisao.js`). Cobre:
//   1. a recusa da ficha não entrega a quem não vê a disciplina daquela pessoa que ela tem exclusão julgada: a mesma resposta para a exclusão e para o
//      processo de cargo, e a recusa vem depois de todas as outras que quem salva provoca à vontade (a sonda sem gravar nada responde igual para todos).
process.env.AUTH_SECRET = "segredo-do-roteiro-da-revisao-3-" + "x".repeat(24);
const L = require("./lib");
const { ok, fim, q, escalar, obterPool } = L;
const { chamarRota } = require("./lib-afm");

const BASE_ID = 1530000;
const ID = {
  geral: BASE_ID + 1, secLocal: BASE_ID + 2, comum: BASE_ID + 3, excluido: BASE_ID + 4, emCargo: BASE_ID + 5, proponente: BASE_ID + 6
};
const NOME_SEDE = "Sede Revisao E2E153";
const NOME_OUTRA = "Outra Revisao E2E153";
const resumo = (r) => `${r && r.status} ${JSON.stringify((r && r.body) || {}).slice(0, 220)}`;
const iguais = (a, b) => a.status === b.status && JSON.stringify(a.body) === JSON.stringify(b.body);
const fala = (r) => String((r && r.body && r.body.mensagem) || "");

async function principal() {
  await obterPool();

  console.log("== o cenário ==");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área Revisão E2E153'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const sede = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: NOME_SEDE, a: area }))[0].id;
  await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a)", { n: NOME_OUTRA, a: area });
  for (const [chave, id] of Object.entries(ID)) {
    await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, Sexo, EstadoCivil)
      VALUES (@id, @n, @c, 'ATIVO', 'EM_COMUNHAO', '1984-03-12', '2010-05-02', 'M', 'SOLTEIRO')`, { id, n: `Pessoa ${chave} E2E153`, c: sede });
  }
  const { TERMOS } = require(L.path.join(L.API, "shared/termos.js"));
  for (const m of Object.values(ID)) {
    for (const [tipo, t] of Object.entries(TERMOS)) await q("INSERT INTO TermosAssinados (MembroId, TipoTermo, VersaoTermo) VALUES (@m, @t, @v)", { m, t: tipo, v: t.versao });
  }
  const pessoas = (metodo, opcoes) => chamarRota("GestaoPessoas/index.js", { metodo, ...opcoes });
  const ficha = (id, extra = {}) => ({ membroId: id, nome: `Pessoa ${Object.keys(ID).find((k) => ID[k] === id)} E2E153`, congregacaoId: sede, status: "ATIVO",
    situacaoMembro: "EM_COMUNHAO", dataNascimento: "1984-03-12", dataAdmissao: "2010-05-02", estadoCivil: "SOLTEIRO", sexo: "M", ...extra });
  const admissaoDe = (id) => escalar("SELECT CONVERT(varchar(10), DataAdmissao, 120) FROM MembroReferencia WHERE MembroId = @id", { id });
  const geral = () => L.GERAL(ID.geral, ["pessoas", "disciplina"]);
  const soPessoas = () => L.LIDER(ID.secLocal, ["pessoas"], [NOME_SEDE]);
  const comDisciplina = () => L.LIDER(ID.secLocal, ["pessoas", "disciplina"], [NOME_SEDE]);
  // a disciplina recebida por delegação, mas de OUTRA congregação: não vê a disciplina desta pessoa
  const disciplinaDeOutra = () => L.sessao(ID.secLocal, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "CONGREGACAO", escopoCongregacoes: [NOME_SEDE],
    permissoes: ["pessoas", "disciplina"], concessoes: [
      { tipo: "PROPRIA", permissoes: ["pessoas"], nivel: "CONGREGACAO", escopoCongregacoes: [NOME_SEDE] },
      { tipo: "DELEGACAO", permissoes: ["disciplina"], nivel: "CONGREGACAO", escopoCongregacoes: [NOME_OUTRA] }
    ] });
  // a exclusão julgada (de mentira) e o processo de cargo em andamento
  await q("INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status, Resultado, DataConclusao) VALUES (@m, '2025-01-01', 'JULGADO', 'EXCLUSAO', '2025-03-01')",
    { m: ID.excluido });
  await q(`INSERT INTO Consagracoes (MembroId, Assunto, ProponenteMembroId, Status, CargoAlvo, Modalidade)
    VALUES (@m, N'Separação ao Diaconato', @p, 'PROTOCOLADO', 'DIACONO', 'INDICACAO')`, { m: ID.emCargo, p: ID.proponente });

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 1. a recusa da ficha não entrega a exclusão julgada a quem não vê a disciplina ==");
  const novaAdmissao = { dataAdmissao: "2010-05-03" };
  const rExcluido = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.excluido, novaAdmissao) });
  const rEmCargo = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.emCargo, novaAdmissao) });
  ok(rExcluido.status === 403 && iguais(rExcluido, rEmCargo), "só com \"pessoas\": a exclusão e o processo de cargo recebem a mesma resposta, byte a byte",
    `${resumo(rExcluido)} | ${resumo(rEmCargo)}`);
  ok(!/exclus|disciplin|readmiss|processo/i.test(fala(rExcluido)) && /Secretaria \(nível geral\)/.test(fala(rExcluido)),
    "a mensagem é neutra: não fala em exclusão, disciplina, readmissão nem processo", fala(rExcluido));
  ok((await admissaoDe(ID.excluido)) === "2010-05-02" && (await admissaoDe(ID.emCargo)) === "2010-05-02", "nada gravado");
  // a sonda sem gravar nada (o cargo lido diferente do gravado): a mesma resposta para quem tem exclusão e para quem não tem
  const sondaExcluido = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.excluido, { ...novaAdmissao, cargoOriginal: "PASTOR" }) });
  const sondaComum = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.comum, { ...novaAdmissao, cargoOriginal: "PASTOR" }) });
  ok(sondaComum.status === 409 && iguais(sondaExcluido, sondaComum), "a sonda do cargo lido: 409 igual para quem tem exclusão e para quem não tem",
    `${resumo(sondaExcluido)} | ${resumo(sondaComum)}`);
  // outra recusa que quem salva provoca à vontade (a situação fora do catálogo): também igual
  const sondaStatusExcluido = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.excluido, { ...novaAdmissao, status: "NAO_EXISTE_E2E" }) });
  const sondaStatusComum = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.comum, { ...novaAdmissao, status: "NAO_EXISTE_E2E" }) });
  ok(sondaStatusComum.status === 400 && iguais(sondaStatusExcluido, sondaStatusComum), "a sonda da situação fora do catálogo: 400 igual para os dois",
    `${resumo(sondaStatusExcluido)} | ${resumo(sondaStatusComum)}`);
  ok((await admissaoDe(ID.excluido)) === "2010-05-02" && (await admissaoDe(ID.comum)) === "2010-05-02", "e as sondas não gravaram nada");
  // a disciplina de outra congregação não vê a desta pessoa: a resposta neutra
  const rDeOutra = await pessoas("POST", { token: disciplinaDeOutra(), corpo: ficha(ID.excluido, novaAdmissao) });
  ok(iguais(rDeOutra, rExcluido), "com a disciplina só de outra congregação: a mesma resposta neutra", resumo(rDeOutra));
  // quem vê a disciplina desta pessoa continua recebendo a explicação
  const rComDisc = await pessoas("POST", { token: comDisciplina(), corpo: ficha(ID.excluido, novaAdmissao) });
  ok(rComDisc.status === 403 && /readmissão/.test(fala(rComDisc)), "quem vê a disciplina desta pessoa: a explicação da readmissão", resumo(rComDisc));
  const rComDiscCargo = await pessoas("POST", { token: comDisciplina(), corpo: ficha(ID.emCargo, novaAdmissao) });
  ok(rComDiscCargo.status === 403 && /processo de cargo/.test(fala(rComDiscCargo)), "e a do processo de cargo", resumo(rComDiscCargo));
  // cada regra com o seu gatilho: a exclusão só barra a admissão (o estado civil de quem tem exclusão a secretaria local muda)
  const rEstadoCivil = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.excluido, { estadoCivil: "CASADO" }) });
  ok(rEstadoCivil.status === 200 && rEstadoCivil.body && rEstadoCivil.body.sucesso !== false, "o estado civil de quem tem exclusão: a secretaria local grava", resumo(rEstadoCivil));
  const rCargoEstadoCivil = await pessoas("POST", { token: soPessoas(), corpo: ficha(ID.emCargo, { estadoCivil: "CASADO" }) });
  ok(iguais(rCargoEstadoCivil, rExcluido), "o estado civil de quem tem processo de cargo: a mesma recusa neutra", resumo(rCargoEstadoCivil));
  // a Secretaria (nível geral) registra a readmissão
  const rGeral = await pessoas("POST", { token: geral(), corpo: ficha(ID.excluido, { ...novaAdmissao, estadoCivil: "CASADO" }) });
  ok(rGeral.status === 200 && (await admissaoDe(ID.excluido)) === "2010-05-03", "o nível geral registra a readmissão", resumo(rGeral));
}

principal().then(() => fim("e2e-153 (acesso, revisão de fora)")).catch((e) => { console.error(e); ok(false, "o roteiro quebrou: " + (e && e.message)); fim("e2e-153 (acesso, revisão de fora)"); });
