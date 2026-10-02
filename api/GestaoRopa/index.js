// GestaoRopa (vB.8 — LGPD: ROPA e RIPD)
// Restrito à permissão "protecaodedados" (Encarregado de Dados) — mesma
// permissão que já existe pra ExecutarExclusaoLGPD/anonimizar Ouvidoria,
// nunca inventada nova aqui.
// GET /api/lgpd/ropa       -> Registro de Operações de Tratamento, com
//                             contagem real de registros por tabela
// GET /api/lgpd/ropa/ripd  -> Relatório de Impacto (tratamentos de risco)
const { exigirGeral } = require("../shared/escopoRotas");
const { getPool, sql } = require("../shared/db");
const { montarRopa } = require("../shared/ropa");
const { RIPDS } = require("../shared/ripd");

module.exports = async function (context, req) {
  // O ROPA/RIPD descreve o tratamento de dado pessoal da igreja toda (e conta registros de todas as tabelas): só o nível GERAL (papel Global E escopo de todas as
  // congregações) com a permissão do Encarregado de Dados.
  const usuario = exigirGeral(req, context, "protecaodedados");
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
