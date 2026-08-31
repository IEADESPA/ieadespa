// ExcluirDados — apaga dados fictícios por categoria (exige permissão "permissoes").
// POST /api/dados/excluir   body: { categorias: ["pessoas", "estrutura", "funcoes", ...] }
const auth = require("../shared/auth");
const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "permissoes");
  if (!usuario) return;

  const { categorias } = req.body || {};
  if (!Array.isArray(categorias) || categorias.length === 0) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe ao menos uma categoria." } };
    return;
  }

  const resultado = mockDb.excluirDadosFicticios(categorias);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: resultado };
};