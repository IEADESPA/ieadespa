// GestaoFundoExecucaoPdq (v4.8, segunda parte; v4.10 passa a receber sua
// fatia pelo Rateio Geral/malote, junto com Convenção e Prebenda Pastoral)
// Fundo de Execução Estratégica do PDQ (Art. 27) — dotação obrigatória de
// um percentual configurável (RateioGeralDestinos, Codigo='PDQ') sobre o
// que a Tesouraria Geral fecha no Rateio Geral mensal, sempre CALCULADA
// NA LEITURA (shared/tesouraria.js::saldoCentroCusto, centroCusto='PDQ'),
// nunca um saldo gravado à parte. Suspender/reativar é uma ação
// EXCEPCIONAL e pessoal do Pastor Presidente — verificado contra o
// Assento de verdade na Diretoria Executiva
// (shared/diretoria.js::ehPresidenteAtual), não uma permissão genérica
// como "financeiro" ou nível Global, que qualquer Tesoureiro Geral tem.
// GET  /api/pdq-fundo-execucao -> saldo calculado + suspensão ativa (se houver)
// POST /api/pdq-fundo-execucao -> { acao: 'SUSPENDER'|'REATIVAR', motivo }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const tesouraria = require("../shared/tesouraria");
const { ehPresidenteAtual } = require("../shared/diretoria");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET") {
    const saldo = await tesouraria.saldoCentroCusto(pool, sql, "PDQ", null);
    const suspensao = await tesouraria.suspensaoAtivaFundoPdq(pool, sql);
    const destino = await pool.request().query(`SELECT Percentual FROM RateioGeralDestinos WHERE Codigo = 'PDQ'`);
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: {
        percentualDotacao: destino.recordset[0] ? destino.recordset[0].Percentual : null, saldoDisponivel: saldo,
        suspenso: !!suspensao,
        suspensao: suspensao ? { motivoSuspensao: suspensao.MotivoSuspensao, suspensoEm: suspensao.SuspensoEm } : null
      }
    };
    return;
  }

  if (req.method === "POST") {
    const { acao, motivo } = req.body || {};
    if (!["SUSPENDER", "REATIVAR"].includes(acao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe acao: SUSPENDER ou REATIVAR." } };
      return;
    }
    if (!motivo || !motivo.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o motivo." } };
      return;
    }
    const ehPresidente = await ehPresidenteAtual(pool, sql, usuario.membroId);
    if (!ehPresidente) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Suspender ou reativar o Fundo de Execução Estratégica é uma ação excepcional e pessoal do Pastor Presidente (Art. 27) — só quem está com o Assento de Presidente ativo na Diretoria Executiva pode fazer isso." } };
      return;
    }

    const suspensaoAtiva = await tesouraria.suspensaoAtivaFundoPdq(pool, sql);
    if (acao === "SUSPENDER") {
      if (suspensaoAtiva) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "O Fundo já está suspenso." } };
        return;
      }
      const criada = await pool.request().input("motivo", sql.NVarChar(300), motivo.trim()).input("suspensoPor", sql.Int, usuario.membroId)
        .query(`INSERT INTO PdqFundoSuspensoes (MotivoSuspensao, SuspensoPor) OUTPUT INSERTED.SuspensaoId VALUES (@motivo, @suspensoPor)`);
      await registrarAuditoria({
        tabela: "PdqFundoSuspensoes", registroId: criada.recordset[0].SuspensaoId, acao: "Pastor Presidente suspendeu o Fundo de Execução Estratégica (PDQ)", usuarioId: usuario.membroId,
        dadosDepois: { motivo }
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Fundo de Execução Estratégica suspenso." } };
      return;
    }

    if (!suspensaoAtiva) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "O Fundo não está suspenso." } };
      return;
    }
    await pool.request().input("id", sql.Int, suspensaoAtiva.SuspensaoId).input("motivo", sql.NVarChar(300), motivo.trim()).input("reativadoPor", sql.Int, usuario.membroId)
      .query(`UPDATE PdqFundoSuspensoes SET MotivoReativacao = @motivo, ReativadoPor = @reativadoPor, ReativadoEm = SYSUTCDATETIME() WHERE SuspensaoId = @id`);
    await registrarAuditoria({
      tabela: "PdqFundoSuspensoes", registroId: suspensaoAtiva.SuspensaoId, acao: "Pastor Presidente reativou o Fundo de Execução Estratégica (PDQ)", usuarioId: usuario.membroId,
      dadosDepois: { motivo }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Fundo de Execução Estratégica reativado." } };
    return;
  }
};
