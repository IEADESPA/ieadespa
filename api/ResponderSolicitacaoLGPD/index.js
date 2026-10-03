// ResponderSolicitacaoLGPD — Encarregado de Dados analisa/nega/coloca em análise
// uma solicitação do titular. Exige a permissão "protecaodedados" E o nível GERAL
// (papel Global com escopo de todas as congregações).
// Solicitações do tipo EXCLUSAO só viram ATENDIDA pela rota ExecutarExclusaoLGPD
// (que de fato anonimiza os dados de contato) — aqui só dá pra colocar em
// análise ou negar, pra garantir que "atendida" sempre corresponda a uma ação real.
// POST /api/lgpd/dpo/solicitacoes/{id}/responder  body: { status, respostaTexto? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { exigirGeral } = require("../shared/escopoRotas");

const STATUS_PERMITIDOS = ["EM_ANALISE", "ATENDIDA", "NEGADA"];

module.exports = async function (context, req) {
  const usuario = exigirGeral(req, context, "protecaodedados");
  if (!usuario) return;

  const idBruto = context.bindingData.id;
  const id = auth.idDeRota(idBruto);
  const { status, respostaTexto } = req.body || {};
  if (!idBruto || !status || !STATUS_PERMITIDOS.includes(status)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: `Informe o id na rota e um status válido: ${STATUS_PERMITIDOS.join(", ")}.` } };
    return;
  }

  const pool = await getPool();
  const antes = id ? await pool.request().input("id", sql.Int, id).query(`SELECT * FROM SolicitacoesTitularLGPD WHERE SolicitacaoId = @id`) : { recordset: [] };
  const solicitacao = antes.recordset[0];
  if (!solicitacao) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Solicitação não encontrada." } };
    return;
  }
  if (solicitacao.Tipo === "EXCLUSAO" && status === "ATENDIDA") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Solicitações de exclusão só são atendidas executando a exclusão (botão específico), não por aqui." } };
    return;
  }

  // Exclusão já executada (dados anonimizados) é um fato consumado: a solicitação não volta atrás nem tem a resposta reescrita.
  if (solicitacao.Tipo === "EXCLUSAO" && solicitacao.Status === "ATENDIDA") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Essa exclusão já foi executada; a solicitação não pode ser reaberta." } };
    return;
  }

  await pool.request()
    .input("id", sql.Int, id)
    .input("status", sql.NVarChar(20), status)
    .input("respostaTexto", sql.NVarChar(500), respostaTexto ? String(respostaTexto).slice(0, 500) : null)
    .input("atendidoPor", sql.Int, usuario.membroId)
    .query(`UPDATE SolicitacoesTitularLGPD SET Status = @status, RespostaTexto = @respostaTexto,
            DataResposta = SYSUTCDATETIME(), AtendidoPor = @atendidoPor WHERE SolicitacaoId = @id`);

  await registrarAuditoria({
    tabela: "SolicitacoesTitularLGPD", registroId: Number(id), acao: "Respondeu solicitação LGPD",
    usuarioId: usuario.membroId, dadosAntes: { status: solicitacao.Status }, dadosDepois: { status, respostaTexto }
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Solicitação atualizada." } };
};
