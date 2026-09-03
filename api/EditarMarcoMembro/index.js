// EditarMarcoMembro
// Corrige um marco já lançado na Linha do Tempo (era teste, data errada etc.) — v1.6.
// Restrito a papel de nível GLOBAL, sempre com justificativa (mesmo padrão de
// AJUSTAR_PRAZO em EvoluirProcessoDisciplinar). A correção NUNCA apaga o marco nem
// mexe na Auditoria já existente — gera um NOVO registro de auditoria com
// dadosAntes/dadosDepois, provando quem corrigiu o quê e por quê.
// POST /api/marcos-membro/{marcoId}/editar -> body: { descricao?, dataMarco?, dataAproximada?, justificativa }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const usuario = auth.exigirNivelGlobal(req, context);
  if (!usuario) return;

  const marcoId = context.bindingData.marcoId;
  const { descricao, dataMarco, dataAproximada, justificativa } = req.body || {};
  if (!marcoId) {
    context.res = { status: 400, body: { erro: "Informe marcoId na rota." } };
    return;
  }
  if (!justificativa || !String(justificativa).trim()) {
    context.res = { status: 400, body: { erro: "Justificativa é obrigatória para corrigir um marco." } };
    return;
  }

  const pool = await getPool();
  const atualResult = await pool.request().input("id", sql.Int, marcoId).query(`SELECT * FROM MarcosMembro WHERE MarcoId = @id`);
  const atual = atualResult.recordset[0];
  if (!atual) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Marco não encontrado." } };
    return;
  }

  const descricaoFinal = descricao !== undefined ? String(descricao).trim() : atual.Descricao;
  const dataMarcoFinal = dataMarco !== undefined ? dataMarco : atual.DataMarco;
  const dataAproximadaFinal = dataAproximada !== undefined ? Boolean(dataAproximada) : atual.DataAproximada;

  await pool.request()
    .input("id", sql.Int, marcoId)
    .input("descricao", sql.NVarChar(500), descricaoFinal)
    .input("dataMarco", sql.Date, dataMarcoFinal || null)
    .input("dataAproximada", sql.Bit, dataAproximadaFinal)
    .input("justificativa", sql.NVarChar(300), String(justificativa).trim())
    .input("atualizadoPor", sql.Int, usuario.membroId)
    .query(`
      UPDATE MarcosMembro SET Descricao = @descricao, DataMarco = @dataMarco, DataAproximada = @dataAproximada,
             Justificativa = @justificativa, AtualizadoPor = @atualizadoPor, AtualizadoEm = SYSUTCDATETIME()
      WHERE MarcoId = @id
    `);

  await registrarAuditoria({
    tabela: "MarcosMembro",
    registroId: Number(marcoId),
    acao: "Corrigiu marco da linha do tempo",
    usuarioId: usuario.membroId,
    dadosAntes: { descricao: atual.Descricao, dataMarco: atual.DataMarco, dataAproximada: atual.DataAproximada },
    dadosDepois: { descricao: descricaoFinal, dataMarco: dataMarcoFinal, dataAproximada: dataAproximadaFinal, justificativa: String(justificativa).trim() }
  });

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Marco corrigido — a correção ficou registrada na Auditoria." } };
};
