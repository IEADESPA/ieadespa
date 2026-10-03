// GestaoManutencaoVeiculo (v4.23 — Frota de veículos, item 5)
// Manutenção preventiva/corretiva por veículo. Licenciamento (VeiculosFrota,
// v4.23) e seguro (ApolicesSeguro, v4.16, por BemId) já existem — aqui só
// juntamos os três num alerta único de vencimento por veículo.
// ESCOPO (dado da CONGREGAÇÃO dona do veículo, BensPatrimoniais.CongregacaoId): cada pessoa vê e mexe só nos veículos das congregações do seu escopo; veículo da Sede
// (sem congregação) só o nível geral (papel Global com escopo de todas). Veículo de fora do escopo responde igual a veículo que não existe.
// GET  /api/manutencoes-veiculo?bemId= -> lista manutenções
// GET  /api/manutencoes-veiculo/alertas -> consolidado: licenciamento + seguro + manutenção preventiva vencendo/vencidos, por veículo
// POST /api/manutencoes-veiculo -> { bemId, tipoManutencao, dataAgendada, descricao, valor? }
// PUT  /api/manutencoes-veiculo/{id} -> { dataRealizada, valor? } — conclui a manutenção (uma vez só)
const auth = require("../shared/auth");
const { ehGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { numeroEntre, dataIso, textoAte, afetadas, MAX_DECIMAL_10_2 } = require("../shared/entradaFinanceira");

const TIPOS = ["PREVENTIVA", "CORRETIVA"];
const DIAS_ALERTA = 30;

// O veículo (por congregação) está ao alcance de quem pergunta? Sem congregação (Sede/matriz) só o nível geral.
function alcanca(usuario, congregacaoNome) {
  return congregacaoNome ? auth.estaNoEscopo(usuario, congregacaoNome) : ehGeral(usuario);
}

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();
  const hoje = new Date();

  if (req.method === "GET" && recurso === "alertas") {
    const result = await pool.request().query(`
      SELECT b.BemId, b.Descricao AS bemDescricao, c.Nome AS congregacaoNome, v.LicenciamentoVencimento,
             (SELECT TOP 1 DataFim FROM ApolicesSeguro s WHERE s.BemId = b.BemId AND s.Status = 'ATIVA' ORDER BY s.DataFim DESC) AS seguroVencimento,
             (SELECT TOP 1 DataAgendada FROM ManutencoesVeiculo mv WHERE mv.BemId = b.BemId AND mv.DataRealizada IS NULL ORDER BY mv.DataAgendada) AS proximaManutencaoAgendada
      FROM BensPatrimoniais b
      LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
      LEFT JOIN VeiculosFrota v ON v.BemId = b.BemId
      WHERE b.Tipo = 'VEICULO'
    `);
    const alertas = result.recordset.filter(v => alcanca(usuario, v.congregacaoNome)).map(v => {
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
    if (bemId !== undefined && bemId !== null && bemId !== "") {
      const bem = auth.idDeRota(bemId);
      if (!bem) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "bemId inválido." } };
        return;
      }
      request.input("bemId", sql.Int, bem);
      where += " AND m.BemId = @bemId";
    }
    const result = await request.query(`
      SELECT m.*, b.Descricao AS bemDescricao, c.Nome AS congregacaoNome FROM ManutencoesVeiculo m
      JOIN BensPatrimoniais b ON b.BemId = m.BemId
      LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
      WHERE ${where} ORDER BY m.DataAgendada DESC
    `);
    // Só as manutenções de veículos das congregações do escopo — a congregação não sai na resposta.
    const lista = result.recordset.filter(m => alcanca(usuario, m.congregacaoNome)).map(({ congregacaoNome, ...resto }) => resto);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lista };
    return;
  }

  if (req.method === "POST" && !recurso) {
    const { bemId: bemBruto, tipoManutencao, dataAgendada, descricao, valor } = req.body || {};
    if (!bemBruto || !tipoManutencao || !TIPOS.includes(tipoManutencao) || !dataAgendada || !descricao || typeof descricao !== "string" || !descricao.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Campos obrigatórios: bemId, tipoManutencao (${TIPOS.join("|")}), dataAgendada, descricao.` } };
      return;
    }
    const data = dataIso(dataAgendada);
    const desc = textoAte(descricao, 300);
    const valorOk = valor === undefined || valor === null || valor === "" ? null : numeroEntre(valor, 0, MAX_DECIMAL_10_2);
    if (!data || !desc || (valor !== undefined && valor !== null && valor !== "" && valorOk === null)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Confira a data (AAAA-MM-DD), a descrição (até 300 caracteres) e o valor (zero ou mais)." } };
      return;
    }
    // Veículo inexistente, malformado ou de fora do escopo: a mesma resposta.
    const bemId = auth.idDeRota(bemBruto);
    const veiculo = bemId ? await pool.request().input("bemId", sql.Int, bemId).query(`
      SELECT b.BemId, c.Nome AS congregacaoNome FROM BensPatrimoniais b
      LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
      WHERE b.BemId = @bemId AND b.Tipo = 'VEICULO'`) : { recordset: [] };
    if (veiculo.recordset.length === 0 || !alcanca(usuario, veiculo.recordset[0].congregacaoNome)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Veículo não encontrado (verifique se o bem é do tipo VEICULO)." } };
      return;
    }
    const criada = await pool.request().input("bemId", sql.Int, bemId).input("tipo", sql.NVarChar(20), tipoManutencao)
      .input("data", sql.Date, data).input("desc", sql.NVarChar(300), desc)
      .input("valor", sql.Decimal(10, 2), valorOk).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO ManutencoesVeiculo (BemId, TipoManutencao, DataAgendada, Descricao, Valor, RegistradoPor)
              OUTPUT INSERTED.ManutencaoId VALUES (@bemId, @tipo, @data, @desc, @valor, @por)`);
    await registrarAuditoria({
      tabela: "ManutencoesVeiculo", registroId: criada.recordset[0].ManutencaoId, acao: "Agendou manutenção de veículo", usuarioId: usuario.membroId,
      dadosDepois: { bemId, tipoManutencao, dataAgendada: data, descricao: desc }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Manutenção agendada.", manutencaoId: criada.recordset[0].ManutencaoId } };
    return;
  }

  if (req.method === "PUT") {
    const id = auth.idDeRota(recurso);
    // Manutenção inexistente, id malformado ou de veículo fora do escopo: a mesma resposta.
    const atual = id ? await pool.request().input("id", sql.Int, id).query(`
      SELECT m.*, c.Nome AS congregacaoNome FROM ManutencoesVeiculo m
      JOIN BensPatrimoniais b ON b.BemId = m.BemId
      LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
      WHERE m.ManutencaoId = @id`) : { recordset: [] };
    if (atual.recordset.length === 0 || !alcanca(usuario, atual.recordset[0].congregacaoNome)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Manutenção não encontrada." } };
      return;
    }
    const { congregacaoNome, ...registro } = atual.recordset[0];
    const { dataRealizada, valor } = req.body || {};
    const data = dataIso(dataRealizada);
    if (!data) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe dataRealizada (AAAA-MM-DD)." } };
      return;
    }
    const valorInformado = valor !== undefined && valor !== null && valor !== "";
    const valorOk = valorInformado ? numeroEntre(valor, 0, MAX_DECIMAL_10_2) : (registro.Valor !== undefined ? registro.Valor : null);
    if (valorInformado && valorOk === null) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "valor deve ser zero ou mais." } };
      return;
    }
    // Concluir é uma vez só: refazer a conclusão trocaria data e valor de uma manutenção já fechada.
    if (registro.DataRealizada) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta manutenção já foi concluída." } };
      return;
    }
    const gravado = await pool.request().input("id", sql.Int, id).input("data", sql.Date, data).input("valor", sql.Decimal(10, 2), valorOk)
      .query(`UPDATE ManutencoesVeiculo SET DataRealizada = @data, Valor = @valor WHERE ManutencaoId = @id AND DataRealizada IS NULL`);
    if (afetadas(gravado) === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta manutenção já foi concluída." } };
      return;
    }
    await registrarAuditoria({
      tabela: "ManutencoesVeiculo", registroId: id, acao: "Concluiu manutenção de veículo", usuarioId: usuario.membroId,
      dadosAntes: registro, dadosDepois: { dataRealizada: data, valor: valorOk }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Manutenção concluída." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido. Use: alertas ou /{id} (PUT)." } };
};
