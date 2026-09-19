// GestaoCertificados (v6.5 — Certificados + página imprimível)
//
// Ver shared/certificados.js pra toda a lógica de decisão (pura, testada
// em isolamento) — este arquivo só expõe HTTP + permissão em cima dela.
//
// Permissão: "ebd_gestao" (v6.1) — mesma permissão que fecha o resto da
// FASE 6 (turmas/v6.1, chamada/v6.2, lições e atividades/v6.3). Emitir um
// certificado não é autoatendimento (o próprio Membro não emite pra si).
// Consultar os certificados JÁ emitidos em seu nome, sim: mesmo modelo de
// SolicitarCarta/CartaPdf — a própria matrícula sempre pode ver os
// próprios certificados; ver os de outra pessoa exige "ebd_gestao".
//
// POST /api/certificados/emitir  body:{membroId, titulo, descricao?, conquistaId?}  -> exige ebd_gestao
// GET  /api/certificados?membroId=                                                   -> próprios certificados, ou de qualquer um com ebd_gestao
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const certificados = require("../shared/certificados");

function erro(context, status, mensagem) {
  context.res = { status, body: { sucesso: false, mensagem } };
}

function temGestao(usuario) {
  return !!(usuario.permissoes && usuario.permissoes.includes("ebd_gestao"));
}

module.exports = async function (context, req) {
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;

  const pool = await getPool();
  const acao = context.bindingData.acao;
  const metodo = req.method;

  try {
    if (acao === "emitir" && metodo === "POST") {
      if (!temGestao(usuario)) return erro(context, 403, "Você não tem permissão para isso. Fale com quem administra as Permissões.");
      const { membroId, titulo, descricao, conquistaId } = req.body || {};
      const resultado = await certificados.emitirCertificado(pool, {
        membroId, titulo, descricao, conquistaId: conquistaId || null, emitidoPorMembroId: usuario.membroId
      });
      context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
      return;
    }

    if (!acao && metodo === "GET") {
      const membroId = Number((req.query && req.query.membroId) || usuario.membroId);
      if (membroId !== usuario.membroId && !temGestao(usuario)) {
        return erro(context, 403, "Só é possível ver os certificados de outra pessoa com a permissão de gestão da EBD.");
      }
      const lista = await certificados.listarCertificadosMembro(pool, membroId);
      context.res = { status: 200, body: { sucesso: true, certificados: lista } };
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoCertificados] erro:", e);
    erro(context, 500, "Erro interno ao processar certificados.");
  }
};
