// GestaoRetiradasChave (v4.23 — Frota de veículos, item 3)
// Livro de retirada de chaves (Art. 155 §2º): sem Termo de Autorização
// ATIVO, com CNH vigente e dentro da janela da missão, o veículo NÃO sai —
// bloqueio real, não aviso. É este registro que sustenta a transferência
// de multa/pontos (§2º, II) e de franquia/conserto por imprudência (§2º,
// III) ao condutor que retirou o veículo.
// GET  /api/retiradas-chave?bemId= -> lista (livro de retirada)
// POST /api/retiradas-chave -> { termoAutorizacaoId, observacao? }
// PUT  /api/retiradas-chave/{id} -> { dataHoraDevolucao?, custoConsertoImprudenciaValor?, observacao? } — registra devolução
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const { bemId } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (bemId) { request.input("bemId", sql.Int, bemId); where += " AND r.BemId = @bemId"; }
    const result = await request.query(`
      SELECT r.*, b.Descricao AS bemDescricao, m.Nome AS condutorNome, t.MissaoDescricao FROM RetiradasChave r
      JOIN BensPatrimoniais b ON b.BemId = r.BemId JOIN MembroReferencia m ON m.MembroId = r.CondutorMembroId
      JOIN TermosAutorizacaoConducao t ON t.TermoId = r.TermoAutorizacaoId
      WHERE ${where} ORDER BY r.DataHoraRetirada DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST") {
    const { termoAutorizacaoId, observacao } = req.body || {};
    if (!termoAutorizacaoId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe termoAutorizacaoId." } };
      return;
    }
    const termo = await pool.request().input("id", sql.Int, termoAutorizacaoId).query(`SELECT * FROM TermosAutorizacaoConducao WHERE TermoId = @id`);
    if (termo.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Termo de autorização não encontrado." } };
      return;
    }
    const t = termo.recordset[0];
    const hoje = new Date();
    if (t.Status !== "ATIVO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Termo de autorização não está ativo — o veículo não pode sair (Art. 155 §2º, I)." } };
      return;
    }
    if (new Date(t.CnhValidade) < hoje) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "CNH do condutor vencida — o veículo não pode sair (Art. 155 §2º, I)." } };
      return;
    }
    if (hoje < new Date(t.DataInicioMissao) || hoje > new Date(t.DataFimPrevista)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Fora da janela da missão autorizada neste termo." } };
      return;
    }
    const emAberto = await pool.request().input("bemId", sql.Int, t.BemId).query(`SELECT COUNT(*) AS total FROM RetiradasChave WHERE BemId = @bemId AND DataHoraDevolucao IS NULL`);
    if (emAberto.recordset[0].total > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este veículo já está com a chave retirada e sem devolução registrada." } };
      return;
    }
    const criada = await pool.request().input("termoId", sql.Int, termoAutorizacaoId).input("bemId", sql.Int, t.BemId)
      .input("condutor", sql.Int, t.CondutorMembroId).input("obs", sql.NVarChar(300), observacao || null).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO RetiradasChave (TermoAutorizacaoId, BemId, CondutorMembroId, Observacao, RegistradoPor)
              OUTPUT INSERTED.RetiradaId VALUES (@termoId, @bemId, @condutor, @obs, @por)`);
    await registrarAuditoria({
      tabela: "RetiradasChave", registroId: criada.recordset[0].RetiradaId, acao: "Registrou retirada de chave", usuarioId: usuario.membroId,
      dadosDepois: { termoAutorizacaoId, bemId: t.BemId, condutorMembroId: t.CondutorMembroId }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Retirada de chave registrada.", retiradaId: criada.recordset[0].RetiradaId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/retiradas-chave/{id}" } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM RetiradasChave WHERE RetiradaId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Retirada não encontrada." } };
      return;
    }
    if (atual.recordset[0].DataHoraDevolucao != null) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta retirada já tem devolução registrada." } };
      return;
    }
    const { custoConsertoImprudenciaValor, observacao } = req.body || {};
    await pool.request().input("id", sql.Int, id)
      .input("custo", sql.Decimal(10, 2), custoConsertoImprudenciaValor || null)
      .input("obs", sql.NVarChar(300), observacao || atual.recordset[0].Observacao)
      .query(`UPDATE RetiradasChave SET DataHoraDevolucao = SYSUTCDATETIME(), CustoConsertoImprudenciaValor = @custo, Observacao = @obs WHERE RetiradaId = @id`);
    await registrarAuditoria({
      tabela: "RetiradasChave", registroId: Number(id), acao: "Registrou devolução de chave", usuarioId: usuario.membroId,
      dadosDepois: { custoConsertoImprudenciaValor: custoConsertoImprudenciaValor || null }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Devolução registrada." } };
  }
};
