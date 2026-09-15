// GestaoDelegacoes (vB.9 — Acesso: delegação temporária)
// Qualquer um com Lideranca pode delegar o PRÓPRIO papel — não precisa de
// permissão especial pra isso, é uma decisão sobre o que já é seu (mesmo
// espírito de "sua própria matrícula" no autoatendimento). Cancelar só
// quem delegou.
// GET  /api/delegacoes           -> { meusPapeis, concedidas, recebidas }
// POST /api/delegacoes           -> { liderancaId, delegadoMembroId, dataInicio, dataFim, motivo? }
// PUT  /api/delegacoes/{id}      -> { acao: 'CANCELAR' }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { criarDelegacao, delegacoesAtivasRecebidas } = require("../shared/delegacoes");

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirLogin(req, context);
  if (!usuario) return;
  const pool = await getPool();
  const hoje = new Date().toISOString().slice(0, 10);

  if (req.method === "GET" && !id) {
    const meusPapeis = (await pool.request().input("id", sql.Int, usuario.membroId).query(`
      SELECT l.LiderancaId AS liderancaId, p.Nome AS papelNome, p.Nivel AS papelNivel
      FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId
      WHERE l.MembroId = @id AND (l.AtivoAte IS NULL OR l.AtivoAte >= GETDATE())
    `)).recordset;

    const concedidas = (await pool.request().input("id", sql.Int, usuario.membroId).query(`
      SELECT d.DelegacaoId AS delegacaoId, p.Nome AS papelNome, m.Nome AS delegadoNome,
             CONVERT(varchar(10), d.DataInicio, 120) AS dataInicio, CONVERT(varchar(10), d.DataFim, 120) AS dataFim,
             d.Status AS status, d.Motivo AS motivo
      FROM DelegacoesAcesso d
      JOIN Lideranca l ON l.LiderancaId = d.LiderancaId
      JOIN Papeis p ON p.PapelId = l.PapelId
      JOIN MembroReferencia m ON m.MembroId = d.DelegadoMembroId
      WHERE d.DeleganteMembroId = @id ORDER BY d.DataFim DESC
    `)).recordset;

    const recebidasRaw = await delegacoesAtivasRecebidas(pool, sql, usuario.membroId, hoje);
    const recebidas = recebidasRaw.map((r) => ({
      delegacaoId: r.DelegacaoId, papelNome: r.papelNome, deleganteNome: r.deleganteNome,
      dataFim: r.DataFim, motivo: r.Motivo
    }));

    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { meusPapeis, concedidas, recebidas } };
    return;
  }

  if (req.method === "POST" && !id) {
    const { liderancaId, delegadoMembroId, dataInicio, dataFim, motivo } = req.body || {};
    if (!liderancaId || !delegadoMembroId || !dataInicio || !dataFim) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe liderancaId, delegadoMembroId, dataInicio e dataFim." } };
      return;
    }
    const destinatario = await pool.request().input("id", sql.Int, delegadoMembroId).query(`SELECT 1 FROM MembroReferencia WHERE MembroId = @id AND Status = 'ATIVO'`);
    if (destinatario.recordset.length === 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Matrícula do delegado não encontrada ou inativa." } };
      return;
    }
    const resultado = await criarDelegacao(pool, sql, { liderancaId, deleganteMembroId: usuario.membroId, delegadoMembroId, dataInicio, dataFim, motivo });
    if (!resultado.sucesso) {
      context.res = { status: 200, body: resultado };
      return;
    }
    await registrarAuditoria({
      tabela: "DelegacoesAcesso", registroId: resultado.delegacaoId, usuarioId: usuario.membroId,
      acao: `Delegou papel (LiderancaId ${liderancaId}) pra matrícula ${delegadoMembroId} até ${dataFim}`
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Delegação criada.", delegacaoId: resultado.delegacaoId } };
    return;
  }

  if (req.method === "PUT" && id) {
    const { acao } = req.body || {};
    if (acao !== "CANCELAR") {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida. Use CANCELAR." } };
      return;
    }
    const dona = await pool.request().input("id", sql.Int, id).query(`SELECT DeleganteMembroId FROM DelegacoesAcesso WHERE DelegacaoId = @id`);
    if (dona.recordset.length === 0 || dona.recordset[0].DeleganteMembroId !== usuario.membroId) {
      context.res = { status: 404, body: { sucesso: false, mensagem: "Delegação não encontrada." } };
      return;
    }
    await pool.request().input("id", sql.Int, id).query(`UPDATE DelegacoesAcesso SET Status = 'CANCELADA' WHERE DelegacaoId = @id`);
    await registrarAuditoria({ tabela: "DelegacoesAcesso", registroId: Number(id), usuarioId: usuario.membroId, acao: "Cancelou delegação" });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Delegação cancelada." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Requisição inválida." } };
};
