// GestaoRemanejamentoPdq (v4.8, segunda parte)
// Remanejamento de orçamento entre dois projetos do PDQ (Art. 28) — até
// 20% do orçamento do projeto de origem é aprovado automaticamente e já
// ajusta os dois orçamentos na hora; acima disso é a CLÁUSULA DE BARREIRA
// (Art. 28): fica PENDENTE_CLI até alguém com permissão "cli" e nível
// Global homologar — só aí o ajuste é de fato aplicado.
// POST /api/pdq-remanejamentos -> { projetoOrigemId, projetoDestinoId, valor }
// PUT  /api/pdq-remanejamentos/{id} -> { acao: 'HOMOLOGAR'|'REJEITAR', motivo? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { round2 } = require("../shared/tesouraria");

const LIMITE_PERCENTUAL_AUTOMATICO = 20;

async function ajustarOrcamentos(pool, projetoOrigemId, projetoDestinoId, valor) {
  await pool.request().input("id", sql.Int, projetoOrigemId).input("valor", sql.Decimal(12, 2), valor)
    .query(`UPDATE PdqProjetos SET OrcamentoPrevisto = OrcamentoPrevisto - @valor WHERE ProjetoId = @id`);
  await pool.request().input("id", sql.Int, projetoDestinoId).input("valor", sql.Decimal(12, 2), valor)
    .query(`UPDATE PdqProjetos SET OrcamentoPrevisto = OrcamentoPrevisto + @valor WHERE ProjetoId = @id`);
}

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "cli");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "POST") {
    const { projetoOrigemId, projetoDestinoId, valor } = req.body || {};
    if (!projetoOrigemId || !projetoDestinoId || !valor || Number(valor) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: projetoOrigemId, projetoDestinoId, valor (maior que zero)." } };
      return;
    }
    if (Number(projetoOrigemId) === Number(projetoDestinoId)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Origem e destino precisam ser projetos diferentes." } };
      return;
    }
    const origem = await pool.request().input("id", sql.Int, projetoOrigemId).query(`SELECT * FROM PdqProjetos WHERE ProjetoId = @id`);
    const destino = await pool.request().input("id", sql.Int, projetoDestinoId).query(`SELECT ProjetoId FROM PdqProjetos WHERE ProjetoId = @id`);
    if (origem.recordset.length === 0 || destino.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Projeto de origem ou destino não encontrado." } };
      return;
    }
    const orcamentoOrigem = Number(origem.recordset[0].OrcamentoPrevisto);
    if (Number(valor) > orcamentoOrigem) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `O projeto de origem só tem R$ ${orcamentoOrigem.toFixed(2)} de orçamento previsto.` } };
      return;
    }
    const percentual = round2((Number(valor) / orcamentoOrigem) * 100);
    const statusInicial = percentual <= LIMITE_PERCENTUAL_AUTOMATICO ? "APROVADO_AUTOMATICO" : "PENDENTE_CLI";

    const criado = await pool.request()
      .input("projetoOrigemId", sql.Int, projetoOrigemId).input("projetoDestinoId", sql.Int, projetoDestinoId)
      .input("valor", sql.Decimal(12, 2), valor).input("percentualOrigem", sql.Decimal(5, 2), percentual)
      .input("status", sql.NVarChar(20), statusInicial).input("solicitadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO PdqRemanejamentos (ProjetoOrigemId, ProjetoDestinoId, Valor, PercentualOrigem, Status, SolicitadoPor)
              OUTPUT INSERTED.RemanejamentoId VALUES (@projetoOrigemId, @projetoDestinoId, @valor, @percentualOrigem, @status, @solicitadoPor)`);
    const remanejamentoId = criado.recordset[0].RemanejamentoId;

    let mensagem;
    if (statusInicial === "APROVADO_AUTOMATICO") {
      await ajustarOrcamentos(pool, projetoOrigemId, projetoDestinoId, valor);
      mensagem = `✅ Remanejamento de ${percentual.toFixed(1)}% aprovado automaticamente (até ${LIMITE_PERCENTUAL_AUTOMATICO}% não precisa de homologação).`;
    } else {
      mensagem = `⚠️ Remanejamento de ${percentual.toFixed(1)}% ultrapassa ${LIMITE_PERCENTUAL_AUTOMATICO}% (cláusula de barreira, Art. 28) — fica pendente de homologação da CLI.`;
    }

    await registrarAuditoria({
      tabela: "PdqRemanejamentos", registroId: remanejamentoId, acao: "Solicitou remanejamento de orçamento PDQ", usuarioId: usuario.membroId,
      dadosDepois: { projetoOrigemId, projetoDestinoId, valor, percentual, statusInicial }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem, remanejamentoId, status: statusInicial } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/pdq-remanejamentos/{id}" } };
      return;
    }
    if (usuario.nivel !== "GLOBAL") {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Homologar ou rejeitar um remanejamento acima da cláusula de barreira é restrito a papéis de nível Global (decisão da CLI)." } };
      return;
    }
    const { acao, motivo } = req.body || {};
    if (!["HOMOLOGAR", "REJEITAR"].includes(acao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe acao: HOMOLOGAR ou REJEITAR." } };
      return;
    }
    const registro = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM PdqRemanejamentos WHERE RemanejamentoId = @id`);
    if (registro.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Remanejamento não encontrado." } };
      return;
    }
    if (registro.recordset[0].Status !== "PENDENTE_CLI") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este remanejamento não está mais pendente de homologação." } };
      return;
    }

    if (acao === "REJEITAR") {
      if (!motivo || !motivo.trim()) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o motivo da rejeição." } };
        return;
      }
      await pool.request().input("id", sql.Int, id).input("motivo", sql.NVarChar(300), motivo.trim())
        .query(`UPDATE PdqRemanejamentos SET Status = 'REJEITADO', MotivoRejeicao = @motivo WHERE RemanejamentoId = @id`);
      await registrarAuditoria({
        tabela: "PdqRemanejamentos", registroId: Number(id), acao: "Rejeitou remanejamento (CLI)", usuarioId: usuario.membroId,
        dadosAntes: registro.recordset[0], dadosDepois: { motivo }
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "Remanejamento rejeitado." } };
      return;
    }

    await ajustarOrcamentos(pool, registro.recordset[0].ProjetoOrigemId, registro.recordset[0].ProjetoDestinoId, registro.recordset[0].Valor);
    await pool.request().input("id", sql.Int, id).input("homologadoPor", sql.Int, usuario.membroId)
      .query(`UPDATE PdqRemanejamentos SET Status = 'HOMOLOGADO', HomologadoPor = @homologadoPor, HomologadoEm = SYSUTCDATETIME() WHERE RemanejamentoId = @id`);
    await registrarAuditoria({
      tabela: "PdqRemanejamentos", registroId: Number(id), acao: "Homologou remanejamento (CLI)", usuarioId: usuario.membroId,
      dadosAntes: registro.recordset[0]
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Remanejamento homologado e aplicado." } };
    return;
  }
};
