// GestaoPdqProjetos (v4.8, segunda parte)
// Projeto concreto que executa uma meta do PDQ — cronograma físico
// (datas) e financeiro (orçamento previsto). "Atrasado" é CALCULADO NA
// LEITURA (hoje passou do fim do cronograma e o projeto não foi
// concluído/cancelado), nunca marcado à mão — é o dado que a Comissão de
// Acompanhamento de Projetos / PMO Eclesiástico (Art. 30) monitora.
// INSTITUCIONAL (o PDQ é da igreja inteira): ler é para `cli` ou `financeiro`; criar e alterar projeto é só da CLI (`cli`) ou do nível geral (shared/pdqAcesso.js).
// Projeto de plano ENCERRADO não muda nem recebe projeto novo.
// GET  /api/pdq-projetos?metaId= -> lista (com atraso calculado)
// GET  /api/pdq-projetos/{id} -> detalhe + remanejamentos
// POST /api/pdq-projetos -> { metaId, nome, descricao?, orcamentoPrevisto, cronogramaInicio, cronogramaFim, responsavelMembroId? }
// PUT  /api/pdq-projetos/{id} -> { status?, cronogramaFim? }
const auth = require("../shared/auth");
const { exigirAcessoPdq } = require("../shared/pdqAcesso");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { numeroEntre, dataIso, textoAte, textoOpcionalAte, MAX_DECIMAL_12_2 } = require("../shared/entradaFinanceira");

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
  const idBruto = context.bindingData.id;
  const usuario = exigirAcessoPdq(req, context);
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !idBruto) {
    const { metaId } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (metaId !== undefined && metaId !== null && metaId !== "") {
      const meta = auth.idDeRota(metaId);
      if (!meta) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "metaId inválido." } };
        return;
      }
      request.input("metaId", sql.Int, meta);
      where += " AND p.MetaId = @metaId";
    }
    const result = await request.query(`${SELECT_BASE} WHERE ${where} ORDER BY p.CronogramaInicio`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "GET" && idBruto) {
    const id = auth.idDeRota(idBruto);
    const result = id ? await pool.request().input("id", sql.Int, id).query(`${SELECT_BASE} WHERE p.ProjetoId = @id`) : { recordset: [] };
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
    const { metaId: metaBruto, nome, descricao, orcamentoPrevisto, cronogramaInicio, cronogramaFim, responsavelMembroId } = req.body || {};
    if (!metaBruto || typeof nome !== "string" || !nome.trim() || !orcamentoPrevisto || !cronogramaInicio || !cronogramaFim) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: metaId, nome, orcamentoPrevisto, cronogramaInicio, cronogramaFim." } };
      return;
    }
    const nomeOk = textoAte(nome, 200), desc = textoOpcionalAte(descricao, 500), orcamento = numeroEntre(orcamentoPrevisto, 0.01, MAX_DECIMAL_12_2);
    const inicio = dataIso(cronogramaInicio), fim = dataIso(cronogramaFim);
    if (!nomeOk || desc === null) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Confira o nome (até 200 caracteres) e a descrição (até 500)." } };
      return;
    }
    if (orcamento === null) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Orçamento previsto deve ser maior que zero." } };
      return;
    }
    if (!inicio || !fim || new Date(fim) <= new Date(inicio)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "A data de fim do cronograma precisa ser depois da data de início (AAAA-MM-DD)." } };
      return;
    }
    let responsavel = null;
    if (responsavelMembroId !== undefined && responsavelMembroId !== null && responsavelMembroId !== "") {
      responsavel = auth.idDeRota(responsavelMembroId);
      const existe = responsavel ? await pool.request().input("id", sql.Int, responsavel).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`) : { recordset: [] };
      if (existe.recordset.length === 0) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Responsável não encontrado (informe uma matrícula existente)." } };
        return;
      }
    }
    const metaId = auth.idDeRota(metaBruto);
    const meta = metaId ? await pool.request().input("id", sql.Int, metaId).query(
      `SELECT m.MetaId, p.Status AS PlanoStatus FROM PdqMetas m JOIN PdqEixos e ON e.EixoId = m.EixoId JOIN PdqPlanos p ON p.PlanoId = e.PlanoId WHERE m.MetaId = @id`) : { recordset: [] };
    if (meta.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Meta não encontrada." } };
      return;
    }
    if (meta.recordset[0].PlanoStatus === "ENCERRADO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "O plano desta meta está encerrado — não recebe mais projetos." } };
      return;
    }
    const criado = await pool.request()
      .input("metaId", sql.Int, metaId).input("nome", sql.NVarChar(200), nomeOk).input("descricao", sql.NVarChar(500), desc || null)
      .input("orcamentoPrevisto", sql.Decimal(12, 2), orcamento).input("cronogramaInicio", sql.Date, inicio)
      .input("cronogramaFim", sql.Date, fim).input("responsavelMembroId", sql.Int, responsavel)
      .input("criadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO PdqProjetos (MetaId, Nome, Descricao, OrcamentoPrevisto, CronogramaInicio, CronogramaFim, ResponsavelMembroId, CriadoPor)
              OUTPUT INSERTED.ProjetoId
              VALUES (@metaId, @nome, @descricao, @orcamentoPrevisto, @cronogramaInicio, @cronogramaFim, @responsavelMembroId, @criadoPor)`);
    const projetoId = criado.recordset[0].ProjetoId;
    await registrarAuditoria({
      tabela: "PdqProjetos", registroId: projetoId, acao: "Criou projeto do PDQ", usuarioId: usuario.membroId,
      dadosDepois: { metaId, nome: nomeOk, orcamentoPrevisto: orcamento, cronogramaInicio: inicio, cronogramaFim: fim, responsavelMembroId: responsavel }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Projeto criado.", projetoId } };
    return;
  }

  if (req.method === "PUT") {
    if (!idBruto) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/pdq-projetos/{id}" } };
      return;
    }
    const { status, cronogramaFim } = req.body || {};
    if (status && !STATUS.includes(status)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Status inválido. Use um de: ${STATUS.join(", ")}.` } };
      return;
    }
    const novoFim = cronogramaFim ? dataIso(cronogramaFim) : null;
    if (cronogramaFim && !novoFim) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "cronogramaFim inválido (use AAAA-MM-DD)." } };
      return;
    }
    const id = auth.idDeRota(idBruto);
    const achado = id ? await pool.request().input("id", sql.Int, id).query(
      `SELECT pr.*, pl.Status AS PlanoStatus FROM PdqProjetos pr JOIN PdqMetas m ON m.MetaId = pr.MetaId JOIN PdqEixos e ON e.EixoId = m.EixoId JOIN PdqPlanos pl ON pl.PlanoId = e.PlanoId WHERE pr.ProjetoId = @id`) : { recordset: [] };
    if (achado.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Projeto não encontrado." } };
      return;
    }
    const { PlanoStatus, ...antes } = achado.recordset[0];
    if (PlanoStatus === "ENCERRADO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "O plano deste projeto está encerrado — o projeto não pode mais ser alterado." } };
      return;
    }
    if (novoFim && new Date(novoFim) <= new Date(antes.CronogramaInicio)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "A data de fim do cronograma precisa ser depois da data de início." } };
      return;
    }
    await pool.request().input("id", sql.Int, id)
      .input("status", sql.NVarChar(20), status || antes.Status)
      .input("cronogramaFim", sql.Date, novoFim || antes.CronogramaFim)
      .query(`UPDATE PdqProjetos SET Status = @status, CronogramaFim = @cronogramaFim WHERE ProjetoId = @id`);
    await registrarAuditoria({
      tabela: "PdqProjetos", registroId: id, acao: "Atualizou projeto do PDQ", usuarioId: usuario.membroId,
      dadosAntes: antes, dadosDepois: { status, cronogramaFim: novoFim }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Projeto atualizado." } };
    return;
  }
};
