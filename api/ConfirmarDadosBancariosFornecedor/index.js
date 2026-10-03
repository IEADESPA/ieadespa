// ConfirmarDadosBancariosFornecedor (v4.5)
// Segregação de funções aplicada ao vetor de fraude nº1 (dados bancários
// de fornecedor trocados pra desviar pagamento): quem ALTEROU os dados
// nunca pode ser quem CONFIRMA que a mudança é legítima. Só depois dessa
// confirmação o fornecedor volta a poder receber pagamento
// (GestaoSaidas bloqueia Solicitação enquanto DadosBancariosConfirmados=0).
// Fornecedor é cadastro INSTITUCIONAL (compartilhado por todas as congregações, sem
// CongregacaoId; o pastor prebendado é um fornecedor PF). Por isso confirmar a troca de
// banco/PIX é do nível GERAL (papel Global + escopo TODAS): com a permissão "financeiro"
// sozinha, dois tesoureiros locais de congregações diferentes confirmavam a troca um do
// outro e a segregação não valia nada.
// POST /api/fornecedores/{id}/confirmar-dados-bancarios
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { fornecedorParaAuditoria } = require("../shared/financeiro1Util");

module.exports = async function (context, req) {
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
  const bruto = context.bindingData.id;
  if (bruto === undefined || bruto === null || bruto === "") {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota." } };
    return;
  }
  // Id malformado recebe a mesma resposta de "não existe".
  const id = auth.idDeRota(bruto);
  if (!id) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Fornecedor não encontrado." } };
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
  if (registro.DadosBancariosAlteradoPor != null && Number(registro.DadosBancariosAlteradoPor) === Number(usuario.membroId)) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Quem alterou os dados bancários não pode confirmar a própria alteração — peça pra outra pessoa da Tesouraria confirmar." } };
    return;
  }

  // O estado entra no WHERE: duas confirmações simultâneas não gravam duas vezes (a segunda não acha mais a linha pendente).
  const confirmou = await pool.request().input("id", sql.Int, id).input("confirmadoPor", sql.Int, usuario.membroId)
    .query(`UPDATE Fornecedores SET DadosBancariosConfirmados = 1, ConfirmadoPor = @confirmadoPor, ConfirmadoEm = SYSUTCDATETIME() WHERE FornecedorId = @id AND DadosBancariosConfirmados = 0`);
  if (confirmou.rowsAffected && confirmou.rowsAffected[0] === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Os dados bancários deste fornecedor já estão confirmados." } };
    return;
  }

  await registrarAuditoria({
    tabela: "Fornecedores", registroId: id, acao: "Confirmou dados bancários do fornecedor", usuarioId: usuario.membroId,
    dadosAntes: fornecedorParaAuditoria(registro)
  });
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Dados bancários confirmados — o fornecedor já pode receber pagamento." } };
};
