// ConfirmarAutolancamentoTesouraria (v4.3)
// O Tesoureiro Local confirma (viu o dinheiro/PIX cair) ou rejeita um
// autolançamento do dizimista. Só na CONFIRMAÇÃO o Termo nº é gerado
// (shared/tesouraria.js::proximoNumeroTermo) — nunca no autolançamento em
// si, pra nenhum número ficar "furado" por algo que a pessoa disse que deu
// mas nunca foi de fato recebido. Depois de confirmado, o registro vira o
// comprovante do dizimista (visível em Minhas Contribuições) e fica
// protegido pra sempre contra cancelamento (ver bloqueio em
// GestaoLancamentosTesouraria DELETE) — equivalente digital da folhinha do
// bloco físico.
// POST /api/tesouraria-autolancamento-confirmar/{id} -> { acao: 'CONFIRMAR'|'REJEITAR', motivo? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const tesouraria = require("../shared/tesouraria");

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (!id) {
    context.res = { status: 400, body: { erro: "Informe o id na rota: /api/tesouraria-autolancamento-confirmar/{id}" } };
    return;
  }
  const { acao, motivo } = req.body || {};
  if (!["CONFIRMAR", "REJEITAR"].includes(acao)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe acao: CONFIRMAR ou REJEITAR." } };
    return;
  }
  if (acao === "REJEITAR" && (!motivo || !motivo.trim())) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o motivo da rejeição." } };
    return;
  }

  const pool = await getPool();
  const atual = await pool.request().input("id", sql.Int, id).query(`
    SELECT l.*, c.Nome AS congregacaoNome FROM LancamentosTesouraria l JOIN Congregacoes c ON c.CongregacaoId = l.CongregacaoId WHERE l.LancamentoId = @id
  `);
  if (atual.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Lançamento não encontrado." } };
    return;
  }
  const registro = atual.recordset[0];
  if (!auth.estaNoEscopo(usuario, registro.congregacaoNome)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
    return;
  }
  if (registro.Origem !== "AUTOLANCAMENTO") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Este lançamento não é um autolançamento do dizimista." } };
    return;
  }
  if (registro.StatusConfirmacao !== "PENDENTE") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Este autolançamento já foi " + (registro.StatusConfirmacao === "CONFIRMADO" ? "confirmado." : "rejeitado.") } };
    return;
  }

  if (acao === "REJEITAR") {
    await pool.request().input("id", sql.Int, id).input("motivo", sql.NVarChar(300), motivo.trim())
      .query(`UPDATE LancamentosTesouraria SET StatusConfirmacao = 'REJEITADO', MotivoRejeicaoConfirmacao = @motivo WHERE LancamentoId = @id`);
    await registrarAuditoria({
      tabela: "LancamentosTesouraria", registroId: Number(id), acao: "Rejeitou autolançamento do dizimista", usuarioId: usuario.membroId,
      dadosAntes: registro, dadosDepois: { motivo }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "Autolançamento rejeitado — o dizimista verá o motivo em Minhas Contribuições." } };
    return;
  }

  const termoNumero = await tesouraria.proximoNumeroTermo(pool, sql, registro.CongregacaoId);
  await pool.request().input("id", sql.Int, id).input("termoNumero", sql.Int, termoNumero).input("confirmadoPor", sql.Int, usuario.membroId)
    .query(`UPDATE LancamentosTesouraria SET StatusConfirmacao = 'CONFIRMADO', TermoNumero = @termoNumero, ConfirmadoPor = @confirmadoPor, ConfirmadoEm = SYSUTCDATETIME() WHERE LancamentoId = @id`);
  await registrarAuditoria({
    tabela: "LancamentosTesouraria", registroId: Number(id), acao: "Confirmou autolançamento do dizimista (gerou Termo nº)", usuarioId: usuario.membroId,
    dadosAntes: registro, dadosDepois: { termoNumero }
  });
  context.res = {
    status: 200, headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: `✅ Confirmado — Termo nº ${termoNumero} gerado. Agora é o comprovante do dizimista e não pode mais ser cancelado.`, termoNumero }
  };
};
