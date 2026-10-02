// GestaoCashPooling (v4.14 — cash pooling)
// Posição consolidada de caixa: onde está a liquidez da denominação
// (centralizadora + caixa GERAL + aplicações do Fundo de Reserva). Os
// movimentos de concentração/desconcentração ficam prontos pra quando
// existirem múltiplas contas (Art. 140); hoje é uma conta só + cofre.
// INSTITUCIONAL (a conta única da igreja, sem dimensão territorial): só o nível GERAL
// (papel Global + escopo TODAS).
// GET  /api/cash-pooling -> posição consolidada (pooled)
// GET  /api/cash-pooling/movimentos -> movimentos de concentração
// POST /api/cash-pooling/movimentos -> { fonteOrigemId, fonteDestinoId, valor, dataMovimento?, tipo, observacao? }
// PUT  /api/cash-pooling/centralizadora -> { fonteId }
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const tesouraria = require("../shared/tesouraria");
const investimentos = require("../shared/investimentos");
const { numeroPositivo } = require("../shared/financeiro1Util");

const TIPOS_MOVIMENTO = ["CONCENTRACAO", "DESCONCENTRACAO"];
const VALOR_MAXIMO = 9999999999.99; // DECIMAL(12,2)

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !recurso) {
    const centralizadora = await pool.request().query(`SELECT FonteId AS fonteId, Nome AS nome, Tipo AS tipo FROM FontesCaixa WHERE Centralizadora = 1`);
    const fontes = await pool.request().query(`SELECT FonteId AS fonteId, Nome AS nome, Tipo AS tipo, Centralizadora AS centralizadora FROM FontesCaixa WHERE Ativa = 1 ORDER BY FonteId`);
    const caixaDisponivel = await tesouraria.saldoCentroCusto(pool, sql, "GERAL", null);
    const portfolio = await investimentos.calcularPortfolio(pool, sql);
    const posicaoTotal = investimentos.round2(caixaDisponivel + portfolio.saldoAplicado);
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: {
        centralizadora: centralizadora.recordset[0] || null,
        fontes: fontes.recordset,
        caixaDisponivel, totalAplicado: portfolio.saldoAplicado, posicaoTotal,
        rentabilidadeAcumulada: portfolio.rentabilidadeAcumulada
      }
    };
    return;
  }

  if (req.method === "GET" && recurso === "movimentos") {
    const result = await pool.request().query(`
      SELECT m.MovimentoId AS movimentoId, m.FonteOrigemId AS fonteOrigemId, fo.Nome AS fonteOrigemNome,
             m.FonteDestinoId AS fonteDestinoId, fd.Nome AS fonteDestinoNome, m.Valor AS valor,
             CONVERT(varchar(10), m.DataMovimento, 120) AS dataMovimento, m.Tipo AS tipo, m.Observacao AS observacao
      FROM CashPoolingMovimentos m
      JOIN FontesCaixa fo ON fo.FonteId = m.FonteOrigemId
      JOIN FontesCaixa fd ON fd.FonteId = m.FonteDestinoId
      ORDER BY m.DataMovimento DESC, m.MovimentoId DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST" && recurso === "movimentos") {
    const corpo = req.body || {};
    const fonteOrigemId = auth.idDeRota(corpo.fonteOrigemId);
    const fonteDestinoId = auth.idDeRota(corpo.fonteDestinoId);
    const { dataMovimento, tipo, observacao } = corpo;
    if (!fonteOrigemId || !fonteDestinoId || !corpo.valor || !tipo || !TIPOS_MOVIMENTO.includes(tipo)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Campos obrigatórios: fonteOrigemId, fonteDestinoId, valor, tipo (${TIPOS_MOVIMENTO.join("|")}).` } };
      return;
    }
    if (fonteOrigemId === fonteDestinoId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Origem e destino não podem ser a mesma fonte." } };
      return;
    }
    const valor = numeroPositivo(corpo.valor, VALOR_MAXIMO);
    if (valor === null) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "valor deve ser maior que zero." } };
      return;
    }
    // As duas fontes precisam existir e estar ativas (antes um id inexistente dava 500 de chave estrangeira).
    const fontes = await pool.request().input("origem", sql.Int, fonteOrigemId).input("destino", sql.Int, fonteDestinoId)
      .query(`SELECT FonteId FROM FontesCaixa WHERE FonteId IN (@origem, @destino) AND Ativa = 1`);
    if (fontes.recordset.length !== 2) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Fonte de caixa não encontrada ou inativa." } };
      return;
    }
    const criado = await pool.request().input("origem", sql.Int, fonteOrigemId).input("destino", sql.Int, fonteDestinoId)
      .input("valor", sql.Decimal(12, 2), valor).input("data", sql.Date, dataMovimento || new Date().toISOString().slice(0, 10))
      .input("tipo", sql.NVarChar(20), tipo).input("obs", sql.NVarChar(300), observacao || null).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO CashPoolingMovimentos (FonteOrigemId, FonteDestinoId, Valor, DataMovimento, Tipo, Observacao, RegistradoPor)
              OUTPUT INSERTED.MovimentoId VALUES (@origem, @destino, @valor, @data, @tipo, @obs, @por)`);
    await registrarAuditoria({
      tabela: "CashPoolingMovimentos", registroId: criado.recordset[0].MovimentoId, acao: "Registrou movimento de cash pooling", usuarioId: usuario.membroId,
      dadosDepois: { fonteOrigemId, fonteDestinoId, valor, tipo }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Movimento de cash pooling registrado." } };
    return;
  }

  if (req.method === "PUT" && recurso === "centralizadora") {
    const fonteId = auth.idDeRota((req.body || {}).fonteId);
    if (!fonteId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe fonteId." } };
      return;
    }
    // Um comando só: ou a nova fonte vira a centralizadora e as demais deixam de ser, ou nada muda (antes eram dois UPDATEs e um id inexistente deixava o sistema sem centralizadora).
    const trocou = await pool.request().input("id", sql.Int, fonteId)
      .query(`UPDATE FontesCaixa SET Centralizadora = CASE WHEN FonteId = @id THEN 1 ELSE 0 END
              WHERE EXISTS (SELECT 1 FROM FontesCaixa WHERE FonteId = @id AND Ativa = 1)`);
    if (trocou.rowsAffected && trocou.rowsAffected[0] === 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Fonte de caixa não encontrada ou inativa." } };
      return;
    }
    await registrarAuditoria({
      tabela: "FontesCaixa", registroId: fonteId, acao: "Definiu conta centralizadora (cash pooling)", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Conta centralizadora definida." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido. Use: movimentos ou centralizadora." } };
};
