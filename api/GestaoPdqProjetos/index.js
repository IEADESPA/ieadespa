// GestaoPdqProjetos (v4.8, segunda parte)
// Projeto concreto que executa uma meta do PDQ — cronograma físico
// (datas) e financeiro (orçamento previsto). "Atrasado" é CALCULADO NA
// LEITURA (hoje passou do fim do cronograma e o projeto não foi
// concluído/cancelado), nunca marcado à mão — é o dado que a Comissão de
// Acompanhamento de Projetos / PMO Eclesiástico (Art. 30) monitora.
// GET  /api/pdq-projetos?metaId= -> lista (com atraso calculado)
// GET  /api/pdq-projetos/{id} -> detalhe + remanejamentos
// POST /api/pdq-projetos -> { metaId, nome, descricao?, orcamentoPrevisto, cronogramaInicio, cronogramaFim, responsavelMembroId? }
// PUT  /api/pdq-projetos/{id} -> { status?, cronogramaFim? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const STATUS = ["PLANEJADO", "EM_EXECUCAO", "CONCLUIDO", "CANCELADO"];

const SELECT_BASE = `
  SELECT p.ProjetoId AS projetoId, p.MetaId AS metaId, m.Descricao AS metaDescricao, p.Nome AS nome, p.Descricao AS descricao,
         p.OrcamentoPrevisto AS orcamentoPrevisto, CONVERT(varchar(10), p.CronogramaInicio, 120) AS cronogramaInicio,
         CONVERT(varchar(10), p.CronogramaFim, 120) AS cronogramaFim, p.ResponsavelMembroId AS responsavelMembroId,
         r.Nome AS responsavelNome, p.Status AS status,
         CASE WHEN p.Status NOT IN ('CONCLUIDO', 'CANCELADO') AND p.CronogramaFim < CAST(SYSUTCDATETIME() AS DATE) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS atrasado
  FROM PdqProjetos p
  JOIN PdqMetas m ON m.MetaId = p.MetaId
  LEFT JOIN MembroReferencia r ON r.MembroId = p.ResponsavelMembroId
`;

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirAlgumaPermissao(req, context, ["cli", "financeiro"]);
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const { metaId } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (metaId) { request.input("metaId", sql.Int, metaId); where += " AND p.MetaId = @metaId"; }
    const result = await request.query(`${SELECT_BASE} WHERE ${where} ORDER BY p.CronogramaInicio`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && id) {
    const result = await pool.request().input("id", sql.Int, id).query(`${SELECT_BASE} WHERE p.ProjetoId = @id`);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Projeto não encontrado." } };
      return;
    }
    const remanejamentos = await pool.request().input("id", sql.Int, id).query(`
      SELECT r.RemanejamentoId AS remanejamentoId, r.ProjetoOrigemId AS projetoOrigemId, po.Nome AS projetoOrigemNome,
             r.ProjetoDestinoId AS projetoDestinoId, pd.Nome AS projetoDestinoNome, r.Valor AS valor,
             r.PercentualOrigem AS percentualOrigem, r.Status AS status, r.MotivoRejeicao AS motivoRejeicao
      FROM PdqRemanejamentos r
      JOIN PdqProjetos po ON po.ProjetoId = r.ProjetoOrigemId
      JOIN PdqProjetos pd ON pd.ProjetoId = r.ProjetoDestinoId
      WHERE r.ProjetoOrigemId = @id OR r.ProjetoDestinoId = @id
      ORDER BY r.RemanejamentoId DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: Object.assign({}, result.recordset[0], { remanejamentos: remanejamentos.recordset }) };
    return;
  }

  if (req.method === "POST") {
    const { metaId, nome, descricao, orcamentoPrevisto, cronogramaInicio, cronogramaFim, responsavelMembroId } = req.body || {};
    if (!metaId || !nome || !nome.trim() || !orcamentoPrevisto || !cronogramaInicio || !cronogramaFim) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: metaId, nome, orcamentoPrevisto, cronogramaInicio, cronogramaFim." } };
      return;
    }
    if (Number(orcamentoPrevisto) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Orçamento previsto deve ser maior que zero." } };
      return;
    }
    if (new Date(cronogramaFim) <= new Date(cronogramaInicio)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "A data de fim do cronograma precisa ser depois da data de início." } };
      return;
    }
    const meta = await pool.request().input("id", sql.Int, metaId).query(`SELECT MetaId FROM PdqMetas WHERE MetaId = @id`);
    if (meta.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Meta não encontrada." } };
      return;
    }
    const criado = await pool.request()
      .input("metaId", sql.Int, metaId).input("nome", sql.NVarChar(200), nome.trim()).input("descricao", sql.NVarChar(500), descricao || null)
      .input("orcamentoPrevisto", sql.Decimal(12, 2), orcamentoPrevisto).input("cronogramaInicio", sql.Date, cronogramaInicio)
      .input("cronogramaFim", sql.Date, cronogramaFim).input("responsavelMembroId", sql.Int, responsavelMembroId || null)
      .input("criadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO PdqProjetos (MetaId, Nome, Descricao, OrcamentoPrevisto, CronogramaInicio, CronogramaFim, ResponsavelMembroId, CriadoPor)
              OUTPUT INSERTED.ProjetoId
              VALUES (@metaId, @nome, @descricao, @orcamentoPrevisto, @cronogramaInicio, @cronogramaFim, @responsavelMembroId, @criadoPor)`);
    const projetoId = criado.recordset[0].ProjetoId;
    await registrarAuditoria({
      tabela: "PdqProjetos", registroId: projetoId, acao: "Criou projeto do PDQ", usuarioId: usuario.membroId,
      dadosDepois: { metaId, nome, orcamentoPrevisto, cronogramaInicio, cronogramaFim }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Projeto criado.", projetoId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/pdq-projetos/{id}" } };
      return;
    }
    const { status, cronogramaFim } = req.body || {};
    if (status && !STATUS.includes(status)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Status inválido. Use um de: ${STATUS.join(", ")}.` } };
      return;
    }
    const antes = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM PdqProjetos WHERE ProjetoId = @id`);
    if (antes.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Projeto não encontrado." } };
      return;
    }
    await pool.request().input("id", sql.Int, id)
      .input("status", sql.NVarChar(20), status || antes.recordset[0].Status)
      .input("cronogramaFim", sql.Date, cronogramaFim || antes.recordset[0].CronogramaFim)
      .query(`UPDATE PdqProjetos SET Status = @status, CronogramaFim = @cronogramaFim WHERE ProjetoId = @id`);
    await registrarAuditoria({
      tabela: "PdqProjetos", registroId: Number(id), acao: "Atualizou projeto do PDQ", usuarioId: usuario.membroId,
      dadosAntes: antes.recordset[0], dadosDepois: { status, cronogramaFim }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Projeto atualizado." } };
    return;
  }
};
