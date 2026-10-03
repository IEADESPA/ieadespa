// RelatorioDemonstracoesContabeis (v4.9)
// Demonstrações Contábeis exigidas pela ITG 2002 (CFC, Resolução
// 1.409/12) — Balanço Patrimonial, Demonstração do Resultado do Período,
// Mutações do Patrimônio Líquido e Fluxo de Caixa. Toda a conta é
// consolidada da denominação inteira (conta única, v4.1.3), por isso
// restrito a nível Global — não faz sentido "balanço de uma congregação"
// quando o caixa é um só.
// GET /api/demonstracoes-contabeis?tipo=balanco&dataCorte=2026-12-31
// GET /api/demonstracoes-contabeis?tipo=drp|mutacoes|fluxocaixa&dataInicio=2026-01-01&dataFim=2026-12-31
const { exigirGeral } = require("../shared/escopoRotas");
const { getPool, sql } = require("../shared/db");
const demonstracoes = require("../shared/demonstracoes");

const TIPOS = ["balanco", "drp", "mutacoes", "fluxocaixa"];
// Data AAAA-MM-DD que existe no calendário ("2026-02-30" não existe): reconverte e compara.
const dataValida = (v) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

module.exports = async function (context, req) {
  // Consolidado de toda a denominação (conta única): só o nível GERAL — papel Global E escopo de todas as congregações (o papel Global sozinho não basta: papel e escopo
  // são cadastrados em separado).
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
  const { tipo, dataCorte, dataInicio, dataFim } = req.query || {};
  if (!TIPOS.includes(tipo)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: `Informe tipo: ${TIPOS.join(", ")}.` } };
    return;
  }
  if ((tipo === "balanco" && dataCorte && !dataValida(dataCorte)) || (tipo !== "balanco" && ((dataInicio && !dataValida(dataInicio)) || (dataFim && !dataValida(dataFim))))) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Data inválida (use AAAA-MM-DD)." } };
    return;
  }
  const pool = await getPool();

  if (tipo === "balanco") {
    if (!dataCorte) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe dataCorte (AAAA-MM-DD)." } };
      return;
    }
    const resultado = await demonstracoes.calcularBalancoPatrimonial(pool, sql, new Date(dataCorte + "T23:59:59"));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: resultado };
    return;
  }

  if (!dataInicio || !dataFim) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe dataInicio e dataFim (AAAA-MM-DD)." } };
    return;
  }
  const inicio = new Date(dataInicio + "T00:00:00");
  const fim = new Date(dataFim + "T23:59:59");

  let resultado;
  if (tipo === "drp") resultado = await demonstracoes.calcularDRP(pool, sql, inicio, fim);
  if (tipo === "mutacoes") resultado = await demonstracoes.calcularMutacoesPL(pool, sql, inicio, fim);
  if (tipo === "fluxocaixa") resultado = await demonstracoes.calcularFluxoCaixa(pool, sql, inicio, fim);

  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: resultado };
};
