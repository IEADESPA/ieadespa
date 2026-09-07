// AprovarEntradaTesouraria (v4.1.4)
// Entradas "OUTRA" (bazar, venda de campanha, evento — dinheiro fora do
// fluxo regular de dízimo/oferta) exigem aprovação individual da
// Tesouraria Geral antes de contar no fechamento — mesmo espírito de
// RegistrarRepasseTesouraria: quem confere/libera é sempre a Geral (nível
// GLOBAL), nunca a própria congregação que lançou.
// POST /api/tesouraria-aprovacao/{lancamentoId} -> { aprovar: true|false, motivoRejeicao? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Só a Tesouraria Geral pode aprovar ou rejeitar este tipo de entrada." } };
    return;
  }

  const lancamentoId = context.bindingData.lancamentoId;
  if (!lancamentoId) {
    context.res = { status: 400, body: { erro: "Informe o lancamentoId na rota." } };
    return;
  }

  const { aprovar, motivoRejeicao } = req.body || {};
  if (typeof aprovar !== "boolean") {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe aprovar (true ou false)." } };
    return;
  }
  if (!aprovar && (!motivoRejeicao || !motivoRejeicao.trim())) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o motivo da rejeição." } };
    return;
  }

  const pool = await getPool();
  const atual = await pool.request().input("id", sql.Int, lancamentoId).query(`SELECT * FROM LancamentosTesouraria WHERE LancamentoId = @id`);
  if (atual.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Lançamento não encontrado." } };
    return;
  }
  const registro = atual.recordset[0];
  if (registro.Tipo !== "OUTRA" || registro.StatusAprovacao !== "PENDENTE") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Este lançamento não está pendente de aprovação." } };
    return;
  }
  if (registro.FechamentoId) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Este lançamento já está dentro de um mês fechado." } };
    return;
  }

  const novoStatus = aprovar ? "APROVADO" : "REJEITADO";
  await pool.request()
    .input("id", sql.Int, lancamentoId)
    .input("statusAprovacao", sql.NVarChar(20), novoStatus)
    .input("motivoRejeicao", sql.NVarChar(300), aprovar ? null : motivoRejeicao.trim())
    .input("aprovadoPor", sql.Int, usuario.membroId)
    .query(`UPDATE LancamentosTesouraria SET StatusAprovacao = @statusAprovacao, MotivoRejeicao = @motivoRejeicao,
              AprovadoPor = @aprovadoPor, AprovadoEm = SYSUTCDATETIME() WHERE LancamentoId = @id`);

  await registrarAuditoria({
    tabela: "LancamentosTesouraria", registroId: Number(lancamentoId), acao: aprovar ? "Aprovou entrada extra" : "Rejeitou entrada extra",
    usuarioId: usuario.membroId, dadosAntes: registro, dadosDepois: { statusAprovacao: novoStatus, motivoRejeicao: motivoRejeicao || null }
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: aprovar ? `✅ Entrada nº ${registro.TermoNumero} aprovada.` : `Entrada nº ${registro.TermoNumero} rejeitada.` } };
};
