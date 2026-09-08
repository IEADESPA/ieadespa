// ConfirmarDadosBancariosFornecedor (v4.5)
// Segregação de funções aplicada ao vetor de fraude nº1 (dados bancários
// de fornecedor trocados pra desviar pagamento): quem ALTEROU os dados
// nunca pode ser quem CONFIRMA que a mudança é legítima. Só depois dessa
// confirmação o fornecedor volta a poder receber pagamento
// (GestaoSaidas bloqueia Solicitação enquanto DadosBancariosConfirmados=0).
// POST /api/fornecedores/{id}/confirmar-dados-bancarios
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (!id) {
    context.res = { status: 400, body: { erro: "Informe o id na rota." } };
    return;
  }

  const pool = await getPool();
  const atual = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM Fornecedores WHERE FornecedorId = @id`);
  if (atual.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Fornecedor não encontrado." } };
    return;
  }
  const registro = atual.recordset[0];
  if (registro.DadosBancariosConfirmados) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Os dados bancários deste fornecedor já estão confirmados." } };
    return;
  }
  if (registro.DadosBancariosAlteradoPor === usuario.membroId) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Quem alterou os dados bancários não pode confirmar a própria alteração — peça pra outra pessoa da Tesouraria confirmar." } };
    return;
  }

  await pool.request().input("id", sql.Int, id).input("confirmadoPor", sql.Int, usuario.membroId)
    .query(`UPDATE Fornecedores SET DadosBancariosConfirmados = 1, ConfirmadoPor = @confirmadoPor, ConfirmadoEm = SYSUTCDATETIME() WHERE FornecedorId = @id`);

  await registrarAuditoria({
    tabela: "Fornecedores", registroId: Number(id), acao: "Confirmou dados bancários do fornecedor", usuarioId: usuario.membroId,
    dadosAntes: registro
  });
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Dados bancários confirmados — o fornecedor já pode receber pagamento." } };
};
