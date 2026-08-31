// GetOrgaos
// GET    /api/orgaos             -> lista órgãos (público)
// POST   /api/orgaos             -> cria/atualiza órgão (permissão "pessoas")
// DELETE /api/orgaos/{orgaoId}   -> exclui órgão (permissão "pessoas")
const auth = require("../shared/auth");
const mockDb = require("../shared/mockDb");

module.exports = async function (context, req) {
  const method = (req.method || "GET").toUpperCase();

  if (method === "GET") {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: mockDb.listarOrgaos() };
    return;
  }

  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  if (method === "POST") {
    const { orgaoId, sigla, nome, quorumMinimoPct, quorumDeliberativoPct, faltasParaPerdaAssento } = req.body || {};
    if (!sigla || !nome) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe sigla e nome do órgão." } };
      return;
    }
    const dados = { sigla, nome, quorumMinimoPct, quorumDeliberativoPct, faltasParaPerdaAssento };
    const orgao = orgaoId ? mockDb.atualizarOrgao(orgaoId, dados) : mockDb.criarOrgao(dados);
    if (!orgao) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Órgão não encontrado." } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Órgão salvo.", orgao } };
    return;
  }

  if (method === "DELETE") {
    const orgaoId = context.bindingData.orgaoId;
    if (!orgaoId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o órgão na rota: /api/orgaos/{orgaoId}" } };
      return;
    }
    const ok = mockDb.excluirOrgao(orgaoId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: ok, mensagem: ok ? "✅ Órgão excluído." : "Órgão não encontrado." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
