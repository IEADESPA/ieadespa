// Fluxos (vB.3 — Motor de workflow genérico)
// Painel único "o que está comigo" / "o que está atrasado", por pessoa —
// qualquer fluxo novo (fases 5-11) que chamar shared/workflow.js aparece
// aqui sozinho, sem precisar de tela própria por módulo.
// GET /api/fluxos?filtro=comigo|atrasados (default comigo)
// PUT /api/fluxos/{id} -> { acao: 'APROVAR' | 'REJEITAR' | 'DEVOLVER', observacao? }
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { listarFluxosDoUsuario, avancarEtapa, resolverResponsaveisEtapa } = require("../shared/workflow");

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const filtro = (req.query && req.query.filtro) || "comigo";
    const lista = await listarFluxosDoUsuario(pool, usuario, { apenasAtrasados: filtro === "atrasados" });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lista };
    return;
  }

  if (req.method === "PUT" && id) {
    const { acao, observacao } = req.body || {};
    if (!["APROVAR", "REJEITAR", "DEVOLVER"].includes(acao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida. Use APROVAR, REJEITAR ou DEVOLVER." } };
      return;
    }
    const instancia = (await pool.request().input("id", sql.Int, id).query(`
      SELECT i.CongregacaoId, e.ResponsavelPermissao, e.ResponsavelNivelMinimo, i.EscalonadoNivel
      FROM FluxoInstancias i JOIN FluxoEtapas e ON e.TipoFluxo = i.TipoFluxo AND e.Ordem = i.EtapaAtualOrdem
      WHERE i.InstanciaId = @id
    `)).recordset[0];
    if (!instancia) {
      context.res = { status: 404, body: { sucesso: false, mensagem: "Fluxo não encontrado." } };
      return;
    }
    // Mesma resolução usada pra montar "o que está comigo" — nunca confia
    // só no fato de estar logado, confere que É responsável por ESSA etapa.
    const nivel = instancia.EscalonadoNivel || instancia.ResponsavelNivelMinimo || "GLOBAL";
    const responsaveis = await resolverResponsaveisEtapa(pool, { permissao: instancia.ResponsavelPermissao, nivel, congregacaoId: instancia.CongregacaoId });
    if (!responsaveis.some(r => r.membroId === usuario.membroId)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Você não é responsável pela etapa atual deste fluxo." } };
      return;
    }
    const resultado = await avancarEtapa(pool, { instanciaId: Number(id), acao, usuarioMembroId: usuario.membroId, observacao });
    context.res = { status: resultado.sucesso ? 200 : 400, headers: { "Content-Type": "application/json" }, body: resultado };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Requisição inválida." } };
};
