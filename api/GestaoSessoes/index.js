// GestaoSessoes (vB.9 — Trilha de sessão)
// "Minhas Sessões": dispositivo, quando entrou, e um botão pra encerrar
// remotamente. Limitação real, documentada no README: encerrar aqui marca
// a trilha e some da lista de sessões ativas, mas o TOKEN em si (se ainda
// estiver com alguém, ex: navegador de outro aparelho) só perde validade
// de verdade quando expira sozinho (12h) — o modelo de autenticação é
// stateless de propósito (shared/auth.js), mudar isso pra revogação
// instantânea exigiria tornar exigirLogin assíncrono em ~140 Functions.
// GET /api/minhas-sessoes       -> lista (mais recentes primeiro)
// PUT /api/minhas-sessoes/{id}  -> { acao: 'ENCERRAR' }
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const sessoes = await auth.listarSessoes(pool, sql, usuario.membroId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: sessoes };
    return;
  }

  if (req.method === "PUT" && id) {
    const { acao } = req.body || {};
    if (acao !== "ENCERRAR") {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida. Use ENCERRAR." } };
      return;
    }
    const ok = await auth.encerrarSessaoEspecifica(pool, sql, usuario.membroId, id);
    if (!ok) {
      context.res = { status: 404, body: { sucesso: false, mensagem: "Sessão não encontrada." } };
      return;
    }
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: "✅ Sessão marcada como encerrada — se ainda estiver aberta em outro aparelho, sai sozinha em até 12h." }
    };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Requisição inválida." } };
};
