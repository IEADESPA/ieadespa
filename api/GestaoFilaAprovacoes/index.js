// GestaoFilaAprovacoes (v1.11 — staff, permissão "pessoas")
// Fila de decisão dos pedidos de edição que exigem aprovação (ver
// shared/camposEdicaoPessoa.js) — uma solicitação pode ter vários campos, cada
// um decidido separadamente (aprovar um, rejeitar outro) ou todos de uma vez.
// GET  /api/fila-aprovacoes                         -> solicitações pendentes (com campos aninhados)
// POST /api/fila-aprovacoes/{solicitacaoId}/decidir -> body: { decisoes: [{ campoId, decisao: 'APROVADO'|'REJEITADO' }] }
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { registrarAuditoria } = require("../shared/auditoria");
const { CAMPOS_APROVACAO } = require("../shared/camposEdicaoPessoa");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const solicitacaoId = context.bindingData.solicitacaoId;
  const acao = context.bindingData.acao;
  const pool = await getPool();

  // ---- GET: listar solicitações pendentes ----
  if (req.method === "GET" && !solicitacaoId) {
    const result = await pool.request().query(`
      SELECT s.SolicitacaoId AS solicitacaoId, s.MembroId AS membroId, m.Nome AS nome,
             CONVERT(varchar(33), s.DataSolicitacao, 126) AS dataSolicitacao, s.Status AS status,
             c.CampoId AS campoId, c.NomeCampo AS nomeCampo, c.ValorAnterior AS valorAnterior,
             c.ValorProposto AS valorProposto, c.Status AS statusCampo
      FROM SolicitacoesEdicaoPessoa s
      JOIN MembroReferencia m ON m.MembroId = s.MembroId
      JOIN SolicitacoesEdicaoCampos c ON c.SolicitacaoId = s.SolicitacaoId
      WHERE s.Status = 'PENDENTE'
      ORDER BY s.DataSolicitacao ASC, c.CampoId`);

    const porSolicitacao = {};
    result.recordset.forEach(r => {
      if (!porSolicitacao[r.solicitacaoId]) {
        porSolicitacao[r.solicitacaoId] = {
          solicitacaoId: r.solicitacaoId, membroId: r.membroId, nome: r.nome,
          dataSolicitacao: r.dataSolicitacao, status: r.status, campos: []
        };
      }
      porSolicitacao[r.solicitacaoId].campos.push({
        campoId: r.campoId,
        nomeCampo: r.nomeCampo,
        rotulo: (CAMPOS_APROVACAO[r.nomeCampo] || {}).rotulo || r.nomeCampo,
        valorAnterior: r.valorAnterior,
        valorProposto: r.valorProposto,
        status: r.statusCampo
      });
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: Object.values(porSolicitacao) };
    return;
  }

  // ---- POST /{solicitacaoId}/decidir: aprova/rejeita campo a campo ----
  if (req.method === "POST" && solicitacaoId && acao === "decidir") {
    const decisoes = (req.body || {}).decisoes;
    if (!Array.isArray(decisoes) || decisoes.length === 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Envie ao menos uma decisão { campoId, decisao }." } };
      return;
    }

    const solicitacao = await pool.request().input("id", sql.Int, solicitacaoId).query(`SELECT SolicitacaoId, MembroId, Status FROM SolicitacoesEdicaoPessoa WHERE SolicitacaoId = @id`);
    if (solicitacao.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Solicitação não encontrada." } };
      return;
    }
    const membroId = solicitacao.recordset[0].MembroId;

    let aplicados = 0;
    let rejeitados = 0;
    for (const { campoId, decisao } of decisoes) {
      if (!["APROVADO", "REJEITADO"].includes(decisao)) continue;

      const campo = await pool.request().input("id", sql.Int, campoId).input("sol", sql.Int, solicitacaoId)
        .query(`SELECT CampoId, NomeCampo, ValorAnterior, ValorProposto, Status FROM SolicitacoesEdicaoCampos WHERE CampoId = @id AND SolicitacaoId = @sol`);
      if (campo.recordset.length === 0 || campo.recordset[0].Status !== "PENDENTE") continue; // ignora campo de outra solicitação ou já decidido

      const { NomeCampo, ValorAnterior, ValorProposto } = campo.recordset[0];
      const config = CAMPOS_APROVACAO[NomeCampo];

      if (decisao === "APROVADO" && config) {
        const tipoSql = config.tipoData ? sql.Date : sql.NVarChar(300);
        await pool.request().input("id", sql.Int, membroId).input("valor", tipoSql, ValorProposto)
          .query(`UPDATE MembroReferencia SET ${config.coluna} = @valor WHERE MembroId = @id`);
        aplicados++;
      } else {
        rejeitados++;
      }

      await pool.request().input("id", sql.Int, campoId).input("status", sql.NVarChar(20), decisao).input("decididoPor", sql.Int, usuario.membroId)
        .query(`UPDATE SolicitacoesEdicaoCampos SET Status = @status, DecididoPor = @decididoPor, DataDecisao = SYSUTCDATETIME() WHERE CampoId = @id`);

      await registrarAuditoria({
        tabela: "MembroReferencia",
        registroId: Number(membroId),
        acao: decisao === "APROVADO" ? `Aprovou edição de ${config ? config.rotulo : NomeCampo}` : `Rejeitou edição de ${config ? config.rotulo : NomeCampo}`,
        usuarioId: usuario.membroId,
        dadosAntes: { [NomeCampo]: ValorAnterior },
        dadosDepois: { [NomeCampo]: ValorProposto }
      });
    }

    // Se todos os campos da solicitação já foram decididos, encerra a solicitação.
    const pendentesRestantes = await pool.request().input("sol", sql.Int, solicitacaoId)
      .query(`SELECT COUNT(*) AS total FROM SolicitacoesEdicaoCampos WHERE SolicitacaoId = @sol AND Status = 'PENDENTE'`);
    if (pendentesRestantes.recordset[0].total === 0) {
      await pool.request().input("sol", sql.Int, solicitacaoId).query(`UPDATE SolicitacoesEdicaoPessoa SET Status = 'CONCLUIDA' WHERE SolicitacaoId = @sol`);
    }

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: `✅ ${aplicados} campo(s) aprovado(s), ${rejeitados} rejeitado(s).` }
    };
    return;
  }

  context.res = { status: 405, body: { erro: "Método/rota não suportado." } };
};
