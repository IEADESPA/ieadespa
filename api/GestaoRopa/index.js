// GestaoRopa (vB.8 — LGPD: ROPA e RIPD)
// Restrito à permissão "protecaodedados" (Encarregado de Dados) — mesma
// permissão que já existe pra ExecutarExclusaoLGPD/anonimizar Ouvidoria,
// nunca inventada nova aqui.
// GET /api/lgpd/ropa       -> Registro de Operações de Tratamento, com
//                             contagem real de registros por tabela
// GET /api/lgpd/ropa/ripd  -> Relatório de Impacto (tratamentos de risco)
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const { montarRopa } = require("../shared/ropa");
const { RIPDS } = require("../shared/ripd");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "protecaodedados");
  if (!usuario) return;
  const recurso = context.bindingData.recurso;

  if (recurso === "ripd") {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: RIPDS };
    return;
  }

  const pool = await getPool();
  const registros = await montarRopa(pool, sql);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: registros };
};
