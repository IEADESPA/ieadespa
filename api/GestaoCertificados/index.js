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

function temGestaoFormacao(usuario) {
  return !!(usuario.permissoes && usuario.permissoes.includes("trilhas_gestao"));
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
      // Trava 6-B: o titular precisa estar no escopo de quem emite.
      if (membroId && !(await certificados.gestorAlcancaMembro(pool, usuario, Number(membroId)))) return erro(context, 403, "Esta pessoa está fora do seu escopo de atuação.");
      const resultado = await certificados.emitirCertificado(pool, {
        membroId, titulo, descricao, conquistaId: conquistaId || null, emitidoPorMembroId: usuario.membroId
      });
      context.res = { status: resultado.sucesso ? 201 : 422, body: resultado };
      return;
    }

    // v6.9 — revogação (anti-fraude/erro de emissão). Quem emite certificado
    // (ebd_gestao, v6.5) ou administra trilhas (trilhas_gestao) pode revogar; o
    // certificado continua existindo e baixável, mas a verificação pública passa
    // a dizer REVOGADO e a formação deixa de valer como requisito.
    if (acao === "revogar" && metodo === "POST") {
      if (!temGestao(usuario) && !temGestaoFormacao(usuario)) return erro(context, 403, "Você não tem permissão para isso. Fale com quem administra as Permissões.");
      const { certificadoId, motivo } = req.body || {};
      if (!certificadoId) return erro(context, 400, "Informe certificadoId.");
      // Trava 6-B: revogar tira o valor da formação como requisito (consagração,
      // liderança, escala) — só quem alcança o titular pode.
      const alvo = await certificados.buscarCertificadoPorId(pool, Number(certificadoId));
      if (!alvo) return erro(context, 404, "Certificado não encontrado.");
      if (!(await certificados.gestorAlcancaMembro(pool, usuario, alvo.membroId))) return erro(context, 403, "O titular deste certificado está fora do seu escopo de atuação.");
      const resultado = await certificados.revogarCertificado(pool, { certificadoId: Number(certificadoId), motivo, revogadoPorMembroId: usuario.membroId });
      context.res = { status: resultado.sucesso ? 200 : 422, body: resultado };
      return;
    }

    if (!acao && metodo === "GET") {
      const membroId = Number((req.query && req.query.membroId) || usuario.membroId);
      if (membroId !== usuario.membroId && !temGestao(usuario) && !temGestaoFormacao(usuario)) {
        return erro(context, 403, "Só é possível ver os certificados de outra pessoa com a permissão de gestão da EBD ou da formação.");
      }
      if (membroId !== usuario.membroId && !(await certificados.gestorAlcancaMembro(pool, usuario, membroId))) {
        return erro(context, 403, "Esta pessoa está fora do seu escopo de atuação.");
      }
      // O selo de integridade é interno (só serve à verificação pública): a API
      // diz apenas se existe.
      const lista = (await certificados.listarCertificadosMembro(pool, membroId)).map(({ hashIntegridade, ...c }) => ({ ...c, temSelo: !!hashIntegridade }));
      context.res = { status: 200, body: { sucesso: true, certificados: lista } };
      return;
    }

    erro(context, 404, "Ação inválida.");
  } catch (e) {
    context.log.error("[GestaoCertificados] erro:", e);
    erro(context, 500, "Erro interno ao processar certificados.");
  }
};
