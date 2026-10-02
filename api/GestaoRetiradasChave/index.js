// GestaoRetiradasChave (v4.23 — Frota de veículos, item 3)
// Livro de retirada de chaves (Art. 155 §2º): sem Termo de Autorização
// ATIVO, com CNH vigente e dentro da janela da missão, o veículo NÃO sai —
// bloqueio real, não aviso. É este registro que sustenta a transferência
// de multa/pontos (§2º, II) e de franquia/conserto por imprudência (§2º,
// III) ao condutor que retirou o veículo.
// ESCOPO: a retirada é do VEÍCULO — vale a congregação do bem (BensPatrimoniais.CongregacaoId). Quem tem `financeiro` só lista,
// registra a retirada e a devolução de veículo das congregações do seu escopo; veículo da Sede (sem congregação) é só de quem tem
// escopo TODAS. Fora do escopo a resposta é a MESMA de "não encontrado(a)": a rota não serve de sonda, e ninguém de fora lança
// custo de conserto (obrigação financeira) sobre um condutor.
// GET  /api/retiradas-chave?bemId= -> lista (livro de retirada)
// POST /api/retiradas-chave -> { termoAutorizacaoId, observacao? }
// PUT  /api/retiradas-chave/{id} -> { dataHoraDevolucao?, custoConsertoImprudenciaValor?, observacao? } — registra devolução
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { idOpcional } = require("../shared/financeiroSeguro");

const TERMO_NAO_ENCONTRADO = { sucesso: false, mensagem: "Termo de autorização não encontrado." };
const RETIRADA_NAO_ENCONTRADA = { sucesso: false, mensagem: "Retirada não encontrada." };

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const rota = idOpcional(context.bindingData.id);
  const id = rota.id;
  const pool = await getPool();

  if (req.method === "GET" && !rota.presente) {
    const { bemId } = req.query || {};
    const filtroBem = idOpcional(bemId);
    if (filtroBem.presente && !filtroBem.id) {
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: [] };
      return;
    }
    const request = pool.request();
    let where = "1=1";
    if (filtroBem.id) { request.input("bemId", sql.Int, filtroBem.id); where += " AND r.BemId = @bemId"; }
    const result = await request.query(`
      SELECT r.*, b.Descricao AS bemDescricao, c.Nome AS congregacaoNome, m.Nome AS condutorNome, t.MissaoDescricao FROM RetiradasChave r
      JOIN BensPatrimoniais b ON b.BemId = r.BemId LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
      JOIN MembroReferencia m ON m.MembroId = r.CondutorMembroId
      JOIN TermosAutorizacaoConducao t ON t.TermoId = r.TermoAutorizacaoId
      WHERE ${where} ORDER BY r.DataHoraRetirada DESC
    `);
    const retiradas = result.recordset.filter(r => auth.estaNoEscopo(usuario, r.congregacaoNome));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: retiradas };
    return;
  }

  if (req.method === "POST") {
    const { termoAutorizacaoId, observacao } = req.body || {};
    if (!termoAutorizacaoId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe termoAutorizacaoId." } };
      return;
    }
    const termoNum = auth.idDeRota(termoAutorizacaoId);
    // O termo só é alcançável se o veículo dele estiver no escopo: fora do escopo = "não encontrado", igual a inexistente.
    const termo = termoNum ? await pool.request().input("id", sql.Int, termoNum).query(`
      SELECT t.*, c.Nome AS congregacaoNome FROM TermosAutorizacaoConducao t
      JOIN BensPatrimoniais b ON b.BemId = t.BemId LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
      WHERE t.TermoId = @id
    `) : { recordset: [] };
    if (termo.recordset.length === 0 || !auth.estaNoEscopo(usuario, termo.recordset[0].congregacaoNome)) {
      context.res = { status: 200, body: TERMO_NAO_ENCONTRADO };
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
    const criada = await pool.request().input("termoId", sql.Int, termoNum).input("bemId", sql.Int, t.BemId)
      .input("condutor", sql.Int, t.CondutorMembroId).input("obs", sql.NVarChar(300), typeof observacao === "string" ? observacao : null).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO RetiradasChave (TermoAutorizacaoId, BemId, CondutorMembroId, Observacao, RegistradoPor)
              OUTPUT INSERTED.RetiradaId VALUES (@termoId, @bemId, @condutor, @obs, @por)`);
    await registrarAuditoria({
      tabela: "RetiradasChave", registroId: criada.recordset[0].RetiradaId, acao: "Registrou retirada de chave", usuarioId: usuario.membroId,
      dadosDepois: { termoAutorizacaoId: termoNum, bemId: t.BemId, condutorMembroId: t.CondutorMembroId }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Retirada de chave registrada.", retiradaId: criada.recordset[0].RetiradaId } };
    return;
  }

  if (req.method === "PUT") {
    if (!rota.presente) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/retiradas-chave/{id}" } };
      return;
    }
    const atual = id ? await pool.request().input("id", sql.Int, id).query(`
      SELECT r.*, c.Nome AS congregacaoNome FROM RetiradasChave r
      JOIN BensPatrimoniais b ON b.BemId = r.BemId LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
      WHERE r.RetiradaId = @id
    `) : { recordset: [] };
    if (atual.recordset.length === 0 || !auth.estaNoEscopo(usuario, atual.recordset[0].congregacaoNome)) {
      context.res = { status: 200, body: RETIRADA_NAO_ENCONTRADA };
      return;
    }
    if (atual.recordset[0].DataHoraDevolucao != null) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta retirada já tem devolução registrada." } };
      return;
    }
    const { custoConsertoImprudenciaValor, observacao } = req.body || {};
    const temCusto = custoConsertoImprudenciaValor !== undefined && custoConsertoImprudenciaValor !== null && custoConsertoImprudenciaValor !== "";
    if (temCusto && (!Number.isFinite(Number(custoConsertoImprudenciaValor)) || Number(custoConsertoImprudenciaValor) < 0)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "custoConsertoImprudenciaValor deve ser um valor em reais, zero ou maior." } };
      return;
    }
    const devolvida = await pool.request().input("id", sql.Int, id)
      .input("custo", sql.Decimal(10, 2), custoConsertoImprudenciaValor || null)
      .input("obs", sql.NVarChar(300), (typeof observacao === "string" && observacao) || atual.recordset[0].Observacao)
      .query(`UPDATE RetiradasChave SET DataHoraDevolucao = SYSUTCDATETIME(), CustoConsertoImprudenciaValor = @custo, Observacao = @obs WHERE RetiradaId = @id AND DataHoraDevolucao IS NULL`);
    if (!devolvida.rowsAffected || devolvida.rowsAffected[0] !== 1) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta retirada já tem devolução registrada." } };
      return;
    }
    await registrarAuditoria({
      tabela: "RetiradasChave", registroId: id, acao: "Registrou devolução de chave", usuarioId: usuario.membroId,
      dadosDepois: { custoConsertoImprudenciaValor: custoConsertoImprudenciaValor || null }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Devolução registrada." } };
  }
};
