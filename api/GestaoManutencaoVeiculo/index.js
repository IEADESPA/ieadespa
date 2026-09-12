// GestaoManutencaoVeiculo (v4.23 — Frota de veículos, item 5)
// Manutenção preventiva/corretiva por veículo. Licenciamento (VeiculosFrota,
// v4.23) e seguro (ApolicesSeguro, v4.16, por BemId) já existem — aqui só
// juntamos os três num alerta único de vencimento por veículo.
// GET  /api/manutencoes-veiculo?bemId= -> lista manutenções
// GET  /api/manutencoes-veiculo/alertas -> consolidado: licenciamento + seguro + manutenção preventiva vencendo/vencidos, por veículo
// POST /api/manutencoes-veiculo -> { bemId, tipoManutencao, dataAgendada, descricao, valor? }
// PUT  /api/manutencoes-veiculo/{id} -> { dataRealizada, valor? } — conclui a manutenção
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const TIPOS = ["PREVENTIVA", "CORRETIVA"];
const DIAS_ALERTA = 30;

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();
  const hoje = new Date();

  if (req.method === "GET" && recurso === "alertas") {
    const result = await pool.request().query(`
      SELECT b.BemId, b.Descricao AS bemDescricao, v.LicenciamentoVencimento,
             (SELECT TOP 1 DataFim FROM ApolicesSeguro s WHERE s.BemId = b.BemId AND s.Status = 'ATIVA' ORDER BY s.DataFim DESC) AS seguroVencimento,
             (SELECT TOP 1 DataAgendada FROM ManutencoesVeiculo mv WHERE mv.BemId = b.BemId AND mv.DataRealizada IS NULL ORDER BY mv.DataAgendada) AS proximaManutencaoAgendada
      FROM BensPatrimoniais b LEFT JOIN VeiculosFrota v ON v.BemId = b.BemId
      WHERE b.Tipo = 'VEICULO'
    `);
    const alertas = result.recordset.map(v => {
      const diasLic = v.LicenciamentoVencimento ? Math.ceil((new Date(v.LicenciamentoVencimento) - hoje) / 864e5) : null;
      const diasSeg = v.seguroVencimento ? Math.ceil((new Date(v.seguroVencimento) - hoje) / 864e5) : null;
      const diasManut = v.proximaManutencaoAgendada ? Math.ceil((new Date(v.proximaManutencaoAgendada) - hoje) / 864e5) : null;
      return {
        bemId: v.BemId, bemDescricao: v.bemDescricao,
        licenciamentoVencimento: v.LicenciamentoVencimento, licenciamentoAlerta: diasLic != null && diasLic <= DIAS_ALERTA,
        seguroVencimento: v.seguroVencimento, seguroAlerta: diasSeg == null || diasSeg <= DIAS_ALERTA,
        proximaManutencaoAgendada: v.proximaManutencaoAgendada, manutencaoAlerta: diasManut != null && diasManut <= DIAS_ALERTA
      };
    }).filter(a => a.licenciamentoAlerta || a.seguroAlerta || a.manutencaoAlerta);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: alertas };
    return;
  }

  if (req.method === "GET" && !recurso) {
    const { bemId } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (bemId) { request.input("bemId", sql.Int, bemId); where += " AND m.BemId = @bemId"; }
    const result = await request.query(`
      SELECT m.*, b.Descricao AS bemDescricao FROM ManutencoesVeiculo m
      JOIN BensPatrimoniais b ON b.BemId = m.BemId WHERE ${where} ORDER BY m.DataAgendada DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST" && !recurso) {
    const { bemId, tipoManutencao, dataAgendada, descricao, valor } = req.body || {};
    if (!bemId || !tipoManutencao || !TIPOS.includes(tipoManutencao) || !dataAgendada || !descricao || !descricao.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Campos obrigatórios: bemId, tipoManutencao (${TIPOS.join("|")}), dataAgendada, descricao.` } };
      return;
    }
    const veiculo = await pool.request().input("bemId", sql.Int, bemId).query(`SELECT BemId FROM BensPatrimoniais WHERE BemId = @bemId AND Tipo = 'VEICULO'`);
    if (veiculo.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Veículo não encontrado (verifique se o bem é do tipo VEICULO)." } };
      return;
    }
    const criada = await pool.request().input("bemId", sql.Int, bemId).input("tipo", sql.NVarChar(20), tipoManutencao)
      .input("data", sql.Date, dataAgendada).input("desc", sql.NVarChar(300), descricao.trim())
      .input("valor", sql.Decimal(10, 2), valor || null).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO ManutencoesVeiculo (BemId, TipoManutencao, DataAgendada, Descricao, Valor, RegistradoPor)
              OUTPUT INSERTED.ManutencaoId VALUES (@bemId, @tipo, @data, @desc, @valor, @por)`);
    await registrarAuditoria({
      tabela: "ManutencoesVeiculo", registroId: criada.recordset[0].ManutencaoId, acao: "Agendou manutenção de veículo", usuarioId: usuario.membroId,
      dadosDepois: { bemId, tipoManutencao, dataAgendada, descricao }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Manutenção agendada.", manutencaoId: criada.recordset[0].ManutencaoId } };
    return;
  }

  if (req.method === "PUT" && recurso) {
    const atual = await pool.request().input("id", sql.Int, recurso).query(`SELECT * FROM ManutencoesVeiculo WHERE ManutencaoId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Manutenção não encontrada." } };
      return;
    }
    const { dataRealizada, valor } = req.body || {};
    if (!dataRealizada) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe dataRealizada." } };
      return;
    }
    await pool.request().input("id", sql.Int, recurso).input("data", sql.Date, dataRealizada).input("valor", sql.Decimal(10, 2), valor != null ? valor : atual.recordset[0].Valor)
      .query(`UPDATE ManutencoesVeiculo SET DataRealizada = @data, Valor = @valor WHERE ManutencaoId = @id`);
    await registrarAuditoria({
      tabela: "ManutencoesVeiculo", registroId: Number(recurso), acao: "Concluiu manutenção de veículo", usuarioId: usuario.membroId, dadosDepois: { dataRealizada, valor }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Manutenção concluída." } };
  }
};
