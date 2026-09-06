// ComposicaoCLI (v2.3)
// Visão calculada de quem compõe a CLI (Art. 15 — mista, por Ordenação e por
// Função) — mesma lógica de shared/universo.js (composicaoCLI), reaproveitada
// aqui pra exibição. Sempre mostra todo mundo, nunca mascara quem está fora
// por disciplina/sem comunhão (mesmo princípio de GestaoElegiveisAssembleia):
// útil pra Secretaria enxergar exatamente por que alguém não conta mais.
// GET /api/cli/composicao
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const disciplina = require("../shared/disciplina");
const { composicaoCLI } = require("../shared/universo");

module.exports = async function (context, req) {
  const usuario = auth.exigirAlgumaPermissao(req, context, ["reunioes", "assembleia", "cli"]);
  if (!usuario) return;

  const pool = await getPool();
  const orgaoResult = await pool.request().query(`SELECT OrgaoId AS orgaoId FROM Orgaos WHERE Sigla = 'CLI'`);
  const orgao = orgaoResult.recordset[0];
  if (!orgao) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Órgão CLI não está cadastrado." } };
    return;
  }

  const composicao = await composicaoCLI(pool, orgao.orgaoId);
  const idsSobDisciplina = await disciplina.membrosSobDisciplina(pool);
  const comFlag = composicao.map(m => Object.assign({}, m, {
    processoDisciplinarAtivo: idsSobDisciplina.has(m.membroId),
    emComunhao: m.situacaoMembro !== "SEM_COMUNHAO"
  }));

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: comFlag };
};
