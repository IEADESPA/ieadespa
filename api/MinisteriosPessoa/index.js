// MinisteriosPessoa (FASE 10, as sobras de Membros, 19/11/2026) — onde a pessoa serve (shared/ministeriosPessoa.js, migração 181).
//  GET  pessoas/{membroId}/ministerios                         (pessoas, no escopo) a lista
//  POST pessoas/{membroId}/ministerios {departamentoId, desde?} (pessoas, no escopo) registrar
//  POST pessoas/{membroId}/ministerios/encerrar {id}           (pessoas, no escopo) deixou de servir
// Fora do escopo e matrícula que não existe: 404 igual.
const auth = require("../shared/auth");
const { getPool } = require("../shared/db");
const { pessoaAlcancavel } = require("../shared/escopoRotas");
const db = require("../shared/ministeriosPessoa");

const erro = (context, status, mensagem) => { context.res = { status, headers: { "Cache-Control": "no-store" }, body: { sucesso: false, mensagem } }; };

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;
  const acao = String((context.bindingData && context.bindingData.acao) || "");
  const metodo = String(req.method || "GET").toUpperCase();
  const corpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const pool = await getPool();
  const p = await pessoaAlcancavel(pool, usuario, context.bindingData && context.bindingData.membroId);
  if (!p) return erro(context, 404, "Matrícula não encontrada.");
  if (metodo === "GET" && !acao) {
    context.res = { status: 200, headers: { "Cache-Control": "no-store" }, body: { sucesso: true, ministerios: await db.listar(pool, p.membroId) } };
    return;
  }
  if (metodo !== "POST") return erro(context, 404, "Ação inválida.");
  let r;
  if (!acao) r = await db.registrar(pool, { membroId: p.membroId, departamentoId: corpo.departamentoId, desde: corpo.desde, por: usuario.membroId });
  else if (acao === "encerrar") {
    const id = auth.idDeRota(corpo.id);
    if (!id) return erro(context, 404, "Registro não encontrado.");
    r = await db.encerrar(pool, { membroId: p.membroId, id, por: usuario.membroId });
  } else return erro(context, 404, "Ação inválida.");
  if (r.naoExiste) return erro(context, 404, "Registro não encontrado.");
  const { naoExiste, ...resto } = r;
  context.res = { status: r.sucesso ? (acao ? 200 : 201) : 422, headers: { "Cache-Control": "no-store" }, body: resto };
};
