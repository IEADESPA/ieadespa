// RegistrarAuditoria (endpoint HTTP)
// Uso direto: quando uma ação da secretaria precisa ser logada e não passou
// por outra Function que já chama o módulo shared/auditoria.js internamente.
const { registrarAuditoria } = require("../shared/auditoria");

module.exports = async function (context, req) {
  const { tabela, registroId, acao, usuarioId, dadosAntes, dadosDepois } = req.body || {};

  if (!tabela || !acao) {
    context.res = { status: 400, body: { erro: "Campos obrigatórios: tabela, acao" } };
    return;
  }

  await registrarAuditoria({ tabela, registroId, acao, usuarioId, dadosAntes, dadosDepois });

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true }
  };
};
