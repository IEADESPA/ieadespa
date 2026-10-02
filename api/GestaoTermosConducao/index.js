// GestaoTermosConducao (v4.23 — Frota de veículos, item 2)
// Termo de Autorização de Condução por missão específica (Art. 155 §2º, I):
// sem termo ATIVO e CNH vigente na data da missão, o veículo não sai — a
// validação de fato acontece na retirada de chave (GestaoRetiradasChave),
// que exige um TermoId ATIVO e dentro da janela da missão.
// ESCOPO: o termo é do VEÍCULO — vale a congregação do bem (BensPatrimoniais.CongregacaoId). Quem tem `financeiro` só lista, emite,
// encerra ou cancela termo de veículo das congregações do seu escopo; veículo da Sede (sem congregação) é só de quem tem escopo
// TODAS. Fora do escopo a resposta é a MESMA de "não encontrado" (a rota não serve de sonda). O condutor NÃO precisa estar no
// escopo (um pastor de outra área pode dirigir o carro desta congregação) — mas precisa existir.
// GET  /api/termos-conducao?bemId=&status= -> lista
// POST /api/termos-conducao -> { bemId, condutorMembroId, cnhNumero, cnhValidade, missaoDescricao, dataInicioMissao, dataFimPrevista }
// PUT  /api/termos-conducao/{id} -> { acao: 'ENCERRAR'|'CANCELAR' }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { idOpcional, dataIsoValida } = require("../shared/financeiroSeguro");

const ACOES = ["ENCERRAR", "CANCELAR"];
const VEICULO_NAO_ENCONTRADO = { sucesso: false, mensagem: "Veículo não encontrado (verifique se o bem é do tipo VEICULO)." };
const TERMO_NAO_ENCONTRADO = { sucesso: false, mensagem: "Termo não encontrado." };

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const rota = idOpcional(context.bindingData.id);
  const id = rota.id;
  const pool = await getPool();

  if (req.method === "GET" && !rota.presente) {
    const { bemId, status } = req.query || {};
    const filtroBem = idOpcional(bemId);
    if (filtroBem.presente && !filtroBem.id) {
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: [] };
      return;
    }
    const request = pool.request();
    let where = "1=1";
    if (filtroBem.id) { request.input("bemId", sql.Int, filtroBem.id); where += " AND t.BemId = @bemId"; }
    if (status) { request.input("status", sql.NVarChar(20), String(status)); where += " AND t.Status = @status"; }
    const result = await request.query(`
      SELECT t.*, b.Descricao AS bemDescricao, c.Nome AS congregacaoNome, m.Nome AS condutorNome FROM TermosAutorizacaoConducao t
      JOIN BensPatrimoniais b ON b.BemId = t.BemId LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
      JOIN MembroReferencia m ON m.MembroId = t.CondutorMembroId
      WHERE ${where} ORDER BY t.DataInicioMissao DESC
    `);
    const termos = result.recordset.filter(t => auth.estaNoEscopo(usuario, t.congregacaoNome));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: termos };
    return;
  }

  if (req.method === "POST") {
    const { bemId, condutorMembroId, cnhNumero, cnhValidade, missaoDescricao, dataInicioMissao, dataFimPrevista } = req.body || {};
    if (!bemId || !condutorMembroId || typeof cnhNumero !== "string" || !cnhNumero.trim() || !cnhValidade || typeof missaoDescricao !== "string" || !missaoDescricao.trim() || !dataInicioMissao || !dataFimPrevista) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: bemId, condutorMembroId, cnhNumero, cnhValidade, missaoDescricao, dataInicioMissao, dataFimPrevista." } };
      return;
    }
    const bemNum = auth.idDeRota(bemId);
    const condutorNum = auth.idDeRota(condutorMembroId);
    if (!bemNum || !condutorNum) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "bemId e condutorMembroId devem ser números válidos." } };
      return;
    }
    if (!dataIsoValida(cnhValidade) || !dataIsoValida(dataInicioMissao) || !dataIsoValida(dataFimPrevista)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "cnhValidade, dataInicioMissao e dataFimPrevista devem estar no formato AAAA-MM-DD." } };
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
    // O veículo precisa existir E estar no escopo de quem emite: inexistente, de outra unidade e de outro tipo dão a MESMA resposta.
    const veiculo = await pool.request().input("bemId", sql.Int, bemNum).query(`
      SELECT b.BemId, c.Nome AS congregacaoNome FROM BensPatrimoniais b
      LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
      WHERE b.BemId = @bemId AND b.Tipo = 'VEICULO'
    `);
    if (veiculo.recordset.length === 0 || !auth.estaNoEscopo(usuario, veiculo.recordset[0].congregacaoNome)) {
      context.res = { status: 200, body: VEICULO_NAO_ENCONTRADO };
      return;
    }
    const condutor = await pool.request().input("id", sql.Int, condutorNum).query(`SELECT MembroId FROM MembroReferencia WHERE MembroId = @id`);
    if (condutor.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Condutor não encontrado — cadastre a pessoa antes." } };
      return;
    }
    const criado = await pool.request().input("bemId", sql.Int, bemNum).input("condutor", sql.Int, condutorNum)
      .input("cnh", sql.NVarChar(30), cnhNumero.trim()).input("cnhValidade", sql.Date, cnhValidade)
      .input("missao", sql.NVarChar(300), missaoDescricao.trim()).input("inicio", sql.Date, dataInicioMissao)
      .input("fim", sql.Date, dataFimPrevista).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO TermosAutorizacaoConducao (BemId, CondutorMembroId, CnhNumero, CnhValidade, MissaoDescricao, DataInicioMissao, DataFimPrevista, RegistradoPor)
              OUTPUT INSERTED.TermoId VALUES (@bemId, @condutor, @cnh, @cnhValidade, @missao, @inicio, @fim, @por)`);
    await registrarAuditoria({
      tabela: "TermosAutorizacaoConducao", registroId: criado.recordset[0].TermoId, acao: "Emitiu termo de autorização de condução", usuarioId: usuario.membroId,
      dadosDepois: { bemId: bemNum, condutorMembroId: condutorNum, missaoDescricao, dataInicioMissao, dataFimPrevista }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Termo de autorização de condução emitido.", termoId: criado.recordset[0].TermoId } };
    return;
  }

  if (req.method === "PUT") {
    if (!rota.presente) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/termos-conducao/{id}" } };
      return;
    }
    const { acao } = req.body || {};
    if (!ACOES.includes(acao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Ação inválida. Use uma de: ${ACOES.join(", ")}.` } };
      return;
    }
    // O termo só é alcançável se o veículo dele estiver no escopo: fora do escopo = "Termo não encontrado.", igual a inexistente.
    const atual = id ? await pool.request().input("id", sql.Int, id).query(`
      SELECT t.*, c.Nome AS congregacaoNome FROM TermosAutorizacaoConducao t
      JOIN BensPatrimoniais b ON b.BemId = t.BemId LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
      WHERE t.TermoId = @id
    `) : { recordset: [] };
    if (atual.recordset.length === 0 || !auth.estaNoEscopo(usuario, atual.recordset[0].congregacaoNome)) {
      context.res = { status: 200, body: TERMO_NAO_ENCONTRADO };
      return;
    }
    if (atual.recordset[0].Status !== "ATIVO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este termo não está mais ativo." } };
      return;
    }
    const novoStatus = acao === "ENCERRAR" ? "ENCERRADO" : "CANCELADO";
    const mudou = await pool.request().input("id", sql.Int, id).input("status", sql.NVarChar(20), novoStatus)
      .query(`UPDATE TermosAutorizacaoConducao SET Status = @status WHERE TermoId = @id AND Status = 'ATIVO'`);
    if (!mudou.rowsAffected || mudou.rowsAffected[0] !== 1) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este termo não está mais ativo." } };
      return;
    }
    await registrarAuditoria({
      tabela: "TermosAutorizacaoConducao", registroId: id, acao: acao === "ENCERRAR" ? "Encerrou termo de condução" : "Cancelou termo de condução", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Termo ${novoStatus.toLowerCase()}.` } };
  }
};
