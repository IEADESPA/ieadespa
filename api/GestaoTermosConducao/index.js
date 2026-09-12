// GestaoTermosConducao (v4.23 — Frota de veículos, item 2)
// Termo de Autorização de Condução por missão específica (Art. 155 §2º, I):
// sem termo ATIVO e CNH vigente na data da missão, o veículo não sai — a
// validação de fato acontece na retirada de chave (GestaoRetiradasChave),
// que exige um TermoId ATIVO e dentro da janela da missão.
// GET  /api/termos-conducao?bemId=&status= -> lista
// POST /api/termos-conducao -> { bemId, condutorMembroId, cnhNumero, cnhValidade, missaoDescricao, dataInicioMissao, dataFimPrevista }
// PUT  /api/termos-conducao/{id} -> { acao: 'ENCERRAR'|'CANCELAR' }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const ACOES = ["ENCERRAR", "CANCELAR"];

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const { bemId, status } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (bemId) { request.input("bemId", sql.Int, bemId); where += " AND t.BemId = @bemId"; }
    if (status) { request.input("status", sql.NVarChar(20), status); where += " AND t.Status = @status"; }
    const result = await request.query(`
      SELECT t.*, b.Descricao AS bemDescricao, m.Nome AS condutorNome FROM TermosAutorizacaoConducao t
      JOIN BensPatrimoniais b ON b.BemId = t.BemId JOIN MembroReferencia m ON m.MembroId = t.CondutorMembroId
      WHERE ${where} ORDER BY t.DataInicioMissao DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST") {
    const { bemId, condutorMembroId, cnhNumero, cnhValidade, missaoDescricao, dataInicioMissao, dataFimPrevista } = req.body || {};
    if (!bemId || !condutorMembroId || !cnhNumero || !cnhNumero.trim() || !cnhValidade || !missaoDescricao || !missaoDescricao.trim() || !dataInicioMissao || !dataFimPrevista) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: bemId, condutorMembroId, cnhNumero, cnhValidade, missaoDescricao, dataInicioMissao, dataFimPrevista." } };
      return;
    }
    if (new Date(cnhValidade) < new Date(dataFimPrevista)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "A CNH do condutor precisa estar vigente até o fim previsto da missão (Art. 155 §2º, I)." } };
      return;
    }
    if (new Date(dataFimPrevista) < new Date(dataInicioMissao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "dataFimPrevista não pode ser anterior a dataInicioMissao." } };
      return;
    }
    const veiculo = await pool.request().input("bemId", sql.Int, bemId).query(`SELECT BemId FROM BensPatrimoniais WHERE BemId = @bemId AND Tipo = 'VEICULO'`);
    if (veiculo.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Veículo não encontrado (verifique se o bem é do tipo VEICULO)." } };
      return;
    }
    const criado = await pool.request().input("bemId", sql.Int, bemId).input("condutor", sql.Int, condutorMembroId)
      .input("cnh", sql.NVarChar(30), cnhNumero.trim()).input("cnhValidade", sql.Date, cnhValidade)
      .input("missao", sql.NVarChar(300), missaoDescricao.trim()).input("inicio", sql.Date, dataInicioMissao)
      .input("fim", sql.Date, dataFimPrevista).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO TermosAutorizacaoConducao (BemId, CondutorMembroId, CnhNumero, CnhValidade, MissaoDescricao, DataInicioMissao, DataFimPrevista, RegistradoPor)
              OUTPUT INSERTED.TermoId VALUES (@bemId, @condutor, @cnh, @cnhValidade, @missao, @inicio, @fim, @por)`);
    await registrarAuditoria({
      tabela: "TermosAutorizacaoConducao", registroId: criado.recordset[0].TermoId, acao: "Emitiu termo de autorização de condução", usuarioId: usuario.membroId,
      dadosDepois: { bemId, condutorMembroId, missaoDescricao, dataInicioMissao, dataFimPrevista }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Termo de autorização de condução emitido.", termoId: criado.recordset[0].TermoId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/termos-conducao/{id}" } };
      return;
    }
    const { acao } = req.body || {};
    if (!ACOES.includes(acao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Ação inválida. Use uma de: ${ACOES.join(", ")}.` } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM TermosAutorizacaoConducao WHERE TermoId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Termo não encontrado." } };
      return;
    }
    if (atual.recordset[0].Status !== "ATIVO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este termo não está mais ativo." } };
      return;
    }
    const novoStatus = acao === "ENCERRAR" ? "ENCERRADO" : "CANCELADO";
    await pool.request().input("id", sql.Int, id).input("status", sql.NVarChar(20), novoStatus)
      .query(`UPDATE TermosAutorizacaoConducao SET Status = @status WHERE TermoId = @id`);
    await registrarAuditoria({
      tabela: "TermosAutorizacaoConducao", registroId: Number(id), acao: acao === "ENCERRAR" ? "Encerrou termo de condução" : "Cancelou termo de condução", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Termo ${novoStatus.toLowerCase()}.` } };
  }
};
