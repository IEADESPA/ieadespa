// ConvocarAssembleia (v2.1)
// Separa "Convocar" (agora, com antecedência — Art. 20) de "Iniciar" (no dia
// previsto — feito em AbrirReuniao). Só existe pra Assembleia Geral: os outros
// 4 órgãos continuam abrindo reunião na hora, sem esse passo.
// GET  /api/assembleia/convocar -> lista convocações pendentes (Status=CONVOCADA)
// POST /api/assembleia/convocar -> body: { tipoSessao, dataPrevista, pauta, meiosDivulgacao, senhaAcesso }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const estatuto = require("../shared/estatuto");

const TITULOS_TIPO_SESSAO = {
  AGO: "Assembleia Geral Ordinária (AGO)",
  AGE_GERAL: "Assembleia Geral Extraordinária (AGE)",
  AGE_ESPECIAL: "Assembleia Geral Extraordinária Especial (AGE — reforma/destituição/eleição)"
};

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "assembleia");
  if (!usuario) return;

  const pool = await getPool();
  const orgaoResult = await pool.request().query(`SELECT OrgaoId AS orgaoId FROM Orgaos WHERE Sigla = 'ASSEMBLEIA_GERAL'`);
  const orgao = orgaoResult.recordset[0];
  if (!orgao) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Órgão Assembleia Geral não está cadastrado." } };
    return;
  }

  if (req.method === "GET") {
    const result = await pool.request().input("orgaoId", sql.Int, orgao.orgaoId).query(`
      SELECT SessaoId AS sessaoId, TipoSessao AS tipoSessao, Descricao AS descricao,
             CONVERT(varchar(10), DataConvocacao, 120) AS dataConvocacao,
             CONVERT(varchar(10), DataPrevista, 120) AS dataPrevista,
             Pauta AS pauta, MeiosDivulgacao AS meiosDivulgacao,
             DATEDIFF(day, CAST(SYSUTCDATETIME() AS DATE), DataPrevista) AS diasParaPrevista
      FROM Sessoes WHERE OrgaoId = @orgaoId AND Status = 'CONVOCADA'
      ORDER BY DataPrevista`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  const { tipoSessao, dataPrevista, pauta, meiosDivulgacao, senhaAcesso } = req.body || {};
  if (!tipoSessao || !dataPrevista || !pauta || !senhaAcesso) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: tipoSessao, dataPrevista, pauta, senhaAcesso." } };
    return;
  }

  const validacao = estatuto.validarConvocacaoAssembleia({ tipoSessao, dataPrevista });
  if (!validacao.valido) {
    context.res = { status: 200, body: { sucesso: false, mensagem: validacao.mensagem } };
    return;
  }

  const result = await pool.request()
    .input("orgaoId", sql.Int, orgao.orgaoId)
    .input("tipoSessao", sql.NVarChar(30), tipoSessao)
    .input("descricao", sql.NVarChar(200), TITULOS_TIPO_SESSAO[tipoSessao])
    .input("dataPrevista", sql.Date, dataPrevista)
    .input("pauta", sql.NVarChar(1000), pauta)
    .input("meios", sql.NVarChar(300), meiosDivulgacao || null)
    .input("senha", sql.NVarChar(50), senhaAcesso)
    .query(`
      INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status, SenhaAcesso, DataConvocacao, DataPrevista, Pauta, MeiosDivulgacao)
      OUTPUT INSERTED.SessaoId
      VALUES (@orgaoId, @descricao, @dataPrevista, @tipoSessao, 'CONVOCADA', @senha, CAST(SYSUTCDATETIME() AS DATE), @dataPrevista, @pauta, @meios)
    `);
  const sessaoId = result.recordset[0].SessaoId;

  await registrarAuditoria({
    tabela: "Sessoes",
    registroId: sessaoId,
    acao: "Convocou Assembleia Geral",
    usuarioId: usuario.membroId,
    dadosDepois: { tipoSessao, dataPrevista, pauta }
  });

  context.res = {
    status: 201,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: `✅ Assembleia convocada!\n${TITULOS_TIPO_SESSAO[tipoSessao]} em ${dataPrevista}.`, sessaoId }
  };
};
