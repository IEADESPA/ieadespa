// MeusVinculosFamiliares (v1.11 — público, autoatendimento por matrícula)
// Campo "editável direto, sem aprovação" (README v1.10): o membro é quem sabe
// de verdade quem é sua família — cadastra/remove os próprios vínculos sem
// precisar da Secretaria. Mesma validação de GestaoVinculosFamiliares
// (shared/vinculosFamiliares.js), só que sem exigir permissão "pessoas" — em
// troca, trava tudo pela matrícula da própria rota (não dá pra mexer em
// vínculo de outra pessoa por aqui).
// GET    /api/meus-vinculos/{matricula}     -> vínculos da própria matrícula
// POST   /api/meus-vinculos/{matricula}     -> body: { membroParenteId, tipoVinculoId, responsavelLegal? }
// DELETE /api/meus-vinculos/{matricula}/{id} -> só remove se o vínculo for da própria matrícula
const { getPool, sql } = require("../shared/db");
const vinculos = require("../shared/vinculosFamiliares");

module.exports = async function (context, req) {
  const matricula = context.bindingData.matricula;
  const idRota = context.bindingData.id;
  if (!matricula) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula na rota." } };
    return;
  }

  const pool = await getPool();
  const method = req.method;

  if (method === "GET") {
    const lista = await vinculos.listarVinculosDeMembro(pool, sql, matricula);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lista };
    return;
  }

  if (method === "POST") {
    const { membroParenteId, tipoVinculoId, responsavelLegal } = req.body || {};
    const resultado = await vinculos.criarVinculo(pool, sql, {
      membroId: matricula, membroParenteId, tipoVinculoId, responsavelLegal, criadoPor: Number(matricula)
    });
    context.res = { status: resultado.sucesso ? 201 : 200, headers: { "Content-Type": "application/json" }, body: resultado };
    return;
  }

  if (method === "DELETE") {
    if (!idRota) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/meus-vinculos/{matricula}/{id}" } };
      return;
    }
    const vinculo = await pool.request().input("id", sql.Int, idRota).query(`SELECT MembroId, MembroParenteId FROM VinculosFamiliares WHERE VinculoId = @id`);
    const pertence = vinculo.recordset[0] && (String(vinculo.recordset[0].MembroId) === String(matricula) || String(vinculo.recordset[0].MembroParenteId) === String(matricula));
    if (!pertence) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Vínculo não encontrado (ou não pertence à sua matrícula)." } };
      return;
    }
    const resultado = await vinculos.removerVinculo(pool, sql, idRota, Number(matricula));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: resultado };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
