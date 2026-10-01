// EbdFechamentoAutomatico (v6.8 — EBD: fechamento trimestral automático)
// Rodada diária (11h00 UTC = 8h00 em Brasília — depois dos outros dois jobs
// de .github/workflows/rotinas-diarias.yml, de propósito, pra não competir
// pelo mesmo pool de conexão). Fecha, congregação por congregação, os
// trimestres recém-encerrados (7 dias de carência pro último domingo ser
// lançado) que ainda não têm fechamento. Nunca refaz um fechamento que já
// existe — refazer é decisão humana (GestaoEbdCaderneta, fechamento/refazer).
//
// Sem sessão de usuário: só roda com o segredo certo no cabeçalho (mesmo
// padrão de FluxosEscalonador/NotificacoesAgendador, shared/cronAuth.js),
// porque Azure Static Web Apps (modelo gerenciado) não aceita timerTrigger.
const { getPool } = require("../shared/db");
const { fecharTrimestresEncerrados } = require("../shared/ebdCaderneta");
const { exigirSegredoRotina } = require("../shared/cronAuth");
const { aplicarRetencaoEbd } = require("../shared/ebdLgpd");

module.exports = async function (context, req) {
  if (!exigirSegredoRotina(req, context)) return;
  const pool = await getPool();
  const resumo = await fecharTrimestresEncerrados(pool);
  context.log(`[EBD] fechamento trimestral automático: ${resumo.fechados} fechado(s), ${resumo.ignorados} ignorado(s), ${resumo.falhas} falha(s) — trimestres avaliados: ${resumo.trimestres.join(", ") || "nenhum"}.`);
  // Trava 6-B — retenção LGPD da EBD (visitante > 12 meses, aluno não-membro
  // encerrado > 24 meses: anonimizados). Fail-soft: um problema aqui não pode
  // derrubar o fechamento, que já foi feito.
  let retencao = null;
  try {
    retencao = await aplicarRetencaoEbd(pool);
    context.log(`[EBD] retenção LGPD: ${retencao.visitantesAnonimizados} visitante(s) e ${retencao.alunosAnonimizados} aluno(s) não-membro(s) anonimizado(s).`);
  } catch (e) {
    context.log.error("[EBD] falha na retenção LGPD:", e.message);
  }
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { sucesso: true, ...resumo, retencao },
  };
};
