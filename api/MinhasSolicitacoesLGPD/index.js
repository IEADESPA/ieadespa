// MinhasSolicitacoesLGPD (público — "Meu Painel", auto-atendimento por matrícula)
// O titular exerce os direitos do Art. 18 LGPD: acesso, exclusão, retificação, portabilidade.
// GET  /api/lgpd/solicitacoes/{matricula}  -> minhas solicitações (mais recentes primeiro)
// POST /api/lgpd/solicitacoes/{matricula}  -> body: { tipo, descricao? } -> cria pedido PENDENTE
const { getPool, sql } = require("../shared/db");
const { registrarAuditoria } = require("../shared/auditoria");

const TIPOS_VALIDOS = ["ACESSO", "EXCLUSAO", "RETIFICACAO", "PORTABILIDADE"];

module.exports = async function (context, req) {
  const matricula = context.bindingData.matricula;
  if (!matricula) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula na rota." } };
    return;
  }

  const pool = await getPool();
  const membro = await pool.request().input("mat", sql.Int, matricula).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @mat`);
  if (membro.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }

  if (req.method === "GET") {
    const result = await pool.request().input("mat", sql.Int, matricula).query(`
      SELECT SolicitacaoId AS solicitacaoId, Tipo AS tipo, Descricao AS descricao, Status AS status,
             CONVERT(varchar(33), DataSolicitacao, 126) AS dataSolicitacao,
             CONVERT(varchar(33), DataResposta, 126) AS dataResposta, RespostaTexto AS respostaTexto
      FROM SolicitacoesTitularLGPD WHERE MembroId = @mat ORDER BY DataSolicitacao DESC`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, solicitacoes: result.recordset } };
    return;
  }

  if (req.method === "POST") {
    const { tipo, descricao } = req.body || {};
    if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Tipo inválido. Use: ${TIPOS_VALIDOS.join(", ")}.` } };
      return;
    }
    const result = await pool.request()
      .input("mat", sql.Int, matricula)
      .input("tipo", sql.NVarChar(30), tipo)
      .input("descricao", sql.NVarChar(500), descricao || null)
      .query(`INSERT INTO SolicitacoesTitularLGPD (MembroId, Tipo, Descricao)
              OUTPUT INSERTED.SolicitacaoId VALUES (@mat, @tipo, @descricao)`);
    const solicitacaoId = result.recordset[0].SolicitacaoId;

    await registrarAuditoria({
      tabela: "SolicitacoesTitularLGPD", registroId: solicitacaoId, acao: "Abriu solicitação LGPD",
      usuarioId: Number(matricula), dadosDepois: { tipo, descricao }
    });

    context.res = {
      status: 201, headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: "✅ Solicitação enviada. O Encarregado de Dados vai analisar.", solicitacaoId }
    };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
