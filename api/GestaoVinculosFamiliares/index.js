// GestaoVinculosFamiliares
// Núcleo mínimo (v0.2) — cadastro de relacionamentos entre membros (cônjuge, pai/mãe-
// filho, irmão, sogro/genro/nora), base para as vedações de nepotismo de fases futuras
// (v2.6 Conselho Fiscal, v3.1 CEI). Sem cálculo de grau de parentesco por travessia
// ainda (shared/parentesco.js nasce quando houver um consumidor de verdade).
// Exige a permissão "pessoas" (mesma que já vê telefone/e-mail/endereço). A
// validação/criação em si mora em shared/vinculosFamiliares.js (v1.11) — reaproveitada
// também pelo autoatendimento (MeusVinculosFamiliares).
// GET    /api/vinculos-familiares?membroId=123 -> vínculos de uma pessoa (ou todos, sem o filtro)
// POST   /api/vinculos-familiares              -> body: { membroId, membroParenteId, tipoVinculoId }
// DELETE /api/vinculos-familiares/{id}
const auth = require("../shared/auth");
const { getPool, sql } = require("../shared/db");
const vinculos = require("../shared/vinculosFamiliares");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "pessoas");
  if (!usuario) return;

  const method = req.method;
  const idRota = context.bindingData.id;
  const pool = await getPool();

  if (method === "GET") {
    const membroId = (req.query || {}).membroId;
    const lista = membroId
      ? await vinculos.listarVinculosDeMembro(pool, sql, membroId)
      : await vinculos.listarTodosVinculos(pool, sql);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lista };
    return;
  }

  if (method === "POST") {
    const { membroId, membroParenteId, tipoVinculoId, responsavelLegal } = req.body || {};
    const resultado = await vinculos.criarVinculo(pool, sql, { membroId, membroParenteId, tipoVinculoId, responsavelLegal, criadoPor: usuario.membroId });
    context.res = { status: resultado.sucesso ? 201 : 200, headers: { "Content-Type": "application/json" }, body: resultado };
    return;
  }

  if (method === "DELETE") {
    if (!idRota) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/vinculos-familiares/{id}" } };
      return;
    }
    const resultado = await vinculos.removerVinculo(pool, sql, idRota, usuario.membroId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: resultado };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
