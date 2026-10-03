// GestaoInvestimentos (v4.14 — Gestão de Investimentos)
// Aplicações do Fundo de Reserva (Reg. Art. 64): CDB, poupança, fundos DI e
// títulos públicos de baixo risco — vedada renda variável/cripto (§2º).
// Rentabilidade e valor atual são CALCULADOS NA LEITURA (shared/investimentos.js).
// INSTITUCIONAL (Fundo de Reserva da igreja inteira, sem congregação): todos os métodos são só do nível geral (papel Global com escopo de todas as congregações).
// GET  /api/investimentos -> portfólio consolidado
// GET  /api/investimentos/aplicacoes -> lista de aplicações
// POST /api/investimentos/aplicacoes -> { fonteId?, tipo, instituicao, valorAplicado, taxaAnual?, dataAplicacao, dataVencimento?, liquidez?, observacao? }
// PUT  /api/investimentos/aplicacoes -> { aplicacaoId, acao: 'RESGATAR'|'ENCERRAR', valorResgatado?, dataResgate? }
// GET  /api/investimentos/liquidez?meses= -> previsão de liquidez com faixa
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const investimentos = require("../shared/investimentos");
const { numeroEntre, dataIso, textoAte, afetadas, MAX_DECIMAL_12_2 } = require("../shared/entradaFinanceira");

const TIPOS = ["CDB", "POUPANCA", "FUNDO_RENDA_FIXA", "TITULO_PUBLICO", "OUTROS"];
const LIQUIDEZES = ["DIARIA", "D30", "D90", "NO_VENCIMENTO"];

function recusar400(context, mensagem) {
  context.res = { status: 400, body: { sucesso: false, mensagem } };
}

module.exports = async function (context, req) {
  const recurso = context.bindingData.recurso;
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !recurso) {
    const portfolio = await investimentos.calcularPortfolio(pool, sql);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: portfolio };
    return;
  }

  if (req.method === "GET" && recurso === "liquidez") {
    const meses = Math.min(Math.max(parseInt((req.query && req.query.meses) || 6, 10) || 6, 1), 12);
    const previsao = await investimentos.previsaoLiquidezComFaixa(pool, sql, meses);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: previsao };
    return;
  }

  if (req.method === "GET" && recurso === "aplicacoes") {
    const result = await pool.request().query(`
      SELECT a.*, ISNULL((SELECT SUM(ValorResgatado) FROM ResgatesAplicacoes r WHERE r.AplicacaoId = a.AplicacaoId), 0) AS totalResgatado
      FROM AplicacoesFinanceiras a ORDER BY a.DataVencimento
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST" && recurso === "aplicacoes") {
    const { fonteId, tipo, instituicao, valorAplicado, taxaAnual, dataAplicacao, dataVencimento, liquidez, observacao } = req.body || {};
    if (!tipo || !instituicao || typeof instituicao !== "string" || !instituicao.trim() || valorAplicado === undefined || valorAplicado === null || valorAplicado === "" || !dataAplicacao) {
      return recusar400(context, "Campos obrigatórios: tipo, instituicao, valorAplicado, dataAplicacao.");
    }
    if (!TIPOS.includes(tipo)) {
      return recusar400(context, `Tipo inválido. Use um de: ${TIPOS.join(", ")}.`);
    }
    const valor = numeroEntre(valorAplicado, 0.01, MAX_DECIMAL_12_2);
    if (valor === null) {
      return recusar400(context, "valorAplicado deve ser um número maior que zero.");
    }
    if (liquidez && !LIQUIDEZES.includes(liquidez)) {
      return recusar400(context, `liquidez inválida. Use uma de: ${LIQUIDEZES.join(", ")}.`);
    }
    const instituicaoOk = textoAte(instituicao, 150);
    if (!instituicaoOk) return recusar400(context, "instituicao: até 150 caracteres.");
    const taxa = taxaAnual === undefined || taxaAnual === null || taxaAnual === "" ? null : numeroEntre(taxaAnual, 0, 999);
    if (taxaAnual !== undefined && taxaAnual !== null && taxaAnual !== "" && taxa === null) {
      return recusar400(context, "taxaAnual deve ser um número entre 0 e 999 (% ao ano).");
    }
    const dataAplic = dataIso(dataAplicacao);
    const venc = dataVencimento ? dataIso(dataVencimento) : null;
    if (!dataAplic || (dataVencimento && !venc)) {
      return recusar400(context, "Datas inválidas (use AAAA-MM-DD).");
    }
    let fonte = null;
    if (fonteId !== undefined && fonteId !== null && fonteId !== "") {
      fonte = auth.idDeRota(fonteId);
      if (!fonte) return recusar400(context, "fonteId inválido.");
    }
    const obs = observacao ? textoAte(String(observacao), 300) : null;
    if (observacao && !obs) return recusar400(context, "observacao: até 300 caracteres.");
    const criada = await pool.request().input("fonte", sql.Int, fonte).input("tipo", sql.NVarChar(30), tipo)
      .input("inst", sql.NVarChar(150), instituicaoOk).input("valor", sql.Decimal(12, 2), valor)
      .input("taxa", sql.Decimal(7, 4), taxa || null).input("dataAplic", sql.Date, dataAplic)
      .input("venc", sql.Date, venc).input("liq", sql.NVarChar(20), liquidez || "NO_VENCIMENTO")
      .input("obs", sql.NVarChar(300), obs).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO AplicacoesFinanceiras (FonteId, Tipo, Instituicao, ValorAplicado, TaxaAnual, DataAplicacao, DataVencimento, Liquidez, Observacao, RegistradoPor)
              OUTPUT INSERTED.AplicacaoId VALUES (@fonte, @tipo, @inst, @valor, @taxa, @dataAplic, @venc, @liq, @obs, @por)`);
    await registrarAuditoria({
      tabela: "AplicacoesFinanceiras", registroId: criada.recordset[0].AplicacaoId, acao: "Registrou aplicação financeira", usuarioId: usuario.membroId,
      dadosDepois: { tipo, instituicao: instituicaoOk, valorAplicado: valor, taxaAnual: taxa, dataVencimento: venc }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Aplicação financeira registrada.", aplicacaoId: criada.recordset[0].AplicacaoId } };
    return;
  }

  if (req.method === "PUT" && recurso === "aplicacoes") {
    const { aplicacaoId: aplicacaoBruto, acao, valorResgatado, dataResgate } = req.body || {};
    const aplicacaoId = auth.idDeRota(aplicacaoBruto);
    if (!aplicacaoId || (acao !== "RESGATAR" && acao !== "ENCERRAR")) {
      return recusar400(context, "Informe aplicacaoId e acao: 'RESGATAR' ou 'ENCERRAR'.");
    }
    const atual = await pool.request().input("id", sql.Int, aplicacaoId).query(`SELECT * FROM AplicacoesFinanceiras WHERE AplicacaoId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Aplicação não encontrada." } };
      return;
    }
    // Aplicação já resgatada não recebe mais resgate nem novo encerramento.
    if (atual.recordset[0].Status === "RESGATADA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta aplicação já foi resgatada por completo." } };
      return;
    }
    const resgatado = await pool.request().input("id", sql.Int, aplicacaoId).query(`SELECT ISNULL(SUM(ValorResgatado), 0) AS total FROM ResgatesAplicacoes WHERE AplicacaoId = @id`);
    const restante = investimentos.round2(Number(atual.recordset[0].ValorAplicado) - Number(resgatado.recordset[0].total));

    if (acao === "RESGATAR") {
      const valor = numeroEntre(valorResgatado, 0.01, MAX_DECIMAL_12_2);
      if (valor === null) {
        return recusar400(context, "Informe valorResgatado maior que zero.");
      }
      const data = dataResgate ? dataIso(dataResgate) : new Date().toISOString().slice(0, 10);
      if (!data) return recusar400(context, "dataResgate inválida (use AAAA-MM-DD).");
      if (valor > restante) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `O resgate não pode passar do saldo aplicado (R$ ${restante.toFixed(2)}).` } };
        return;
      }
      // A conferência do saldo vai de novo dentro da própria gravação: dois resgates simultâneos não passam juntos do que foi aplicado.
      const gravado = await pool.request().input("apl", sql.Int, aplicacaoId).input("valor", sql.Decimal(12, 2), valor)
        .input("data", sql.Date, data).input("por", sql.Int, usuario.membroId)
        .query(`INSERT INTO ResgatesAplicacoes (AplicacaoId, ValorResgatado, DataResgate, RegistradoPor)
                SELECT @apl, @valor, @data, @por
                WHERE EXISTS (SELECT 1 FROM AplicacoesFinanceiras WITH (UPDLOCK, HOLDLOCK) WHERE AplicacaoId = @apl AND Status <> 'RESGATADA')
                  AND @valor <= (SELECT ValorAplicado FROM AplicacoesFinanceiras WHERE AplicacaoId = @apl)
                                - ISNULL((SELECT SUM(ValorResgatado) FROM ResgatesAplicacoes WHERE AplicacaoId = @apl), 0)`);
      if (afetadas(gravado) === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "O saldo da aplicação mudou: confira o valor e tente de novo." } };
        return;
      }
      await registrarAuditoria({
        tabela: "ResgatesAplicacoes", registroId: aplicacaoId, acao: "Resgatou aplicação financeira", usuarioId: usuario.membroId,
        dadosDepois: { valorResgatado: valor, dataResgate: data }
      });
      // Zerou o saldo aplicado: a aplicação passa a RESGATADA.
      if (investimentos.round2(restante - valor) <= 0) {
        await pool.request().input("id", sql.Int, aplicacaoId).query(`UPDATE AplicacoesFinanceiras SET Status = 'RESGATADA' WHERE AplicacaoId = @id AND Status <> 'RESGATADA'`);
        await registrarAuditoria({ tabela: "AplicacoesFinanceiras", registroId: aplicacaoId, acao: "Aplicação financeira resgatada por completo", usuarioId: usuario.membroId });
      }
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Resgate registrado." } };
      return;
    }

    // ENCERRAR (resgatar total e marcar RESGATADA). Primeiro "reserva" o encerramento (só a primeira chamada passa), depois registra o resgate do que sobrou.
    const reservada = await pool.request().input("id", sql.Int, aplicacaoId)
      .query(`UPDATE AplicacoesFinanceiras SET Status = 'RESGATADA' WHERE AplicacaoId = @id AND Status <> 'RESGATADA'`);
    if (afetadas(reservada) === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta aplicação já foi resgatada por completo." } };
      return;
    }
    if (restante > 0) {
      await pool.request().input("apl", sql.Int, aplicacaoId).input("valor", sql.Decimal(12, 2), restante)
        .input("data", sql.Date, new Date().toISOString().slice(0, 10)).input("por", sql.Int, usuario.membroId)
        .query(`INSERT INTO ResgatesAplicacoes (AplicacaoId, ValorResgatado, DataResgate, RegistradoPor) VALUES (@apl, @valor, @data, @por)`);
    }
    await registrarAuditoria({
      tabela: "AplicacoesFinanceiras", registroId: aplicacaoId, acao: "Encerrou aplicação financeira", usuarioId: usuario.membroId,
      dadosAntes: { status: atual.recordset[0].Status }, dadosDepois: { status: "RESGATADA", resgateFinal: restante > 0 ? restante : 0 }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Aplicação encerrada (resgate total)." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Recurso desconhecido. Use: aplicacoes ou liquidez." } };
};
