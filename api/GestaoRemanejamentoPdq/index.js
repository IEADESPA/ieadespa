// GestaoRemanejamentoPdq (v4.8, segunda parte)
// Remanejamento de orçamento entre dois projetos do PDQ (Art. 28) — até
// 20% do orçamento do projeto de origem é aprovado automaticamente e já
// ajusta os dois orçamentos na hora; acima disso é a CLÁUSULA DE BARREIRA
// (Art. 28): fica PENDENTE_CLI até alguém com permissão "cli" e nível
// Global homologar — só aí o ajuste é de fato aplicado.
// O PDQ é da igreja inteira (os projetos não pertencem a congregação nenhuma): só o nível GERAL (papel Global com escopo de todas
// as congregações) cria, homologa ou rejeita — antes o POST só pedia a permissão "cli".
// Dinheiro: cada mudança de orçamento acontece numa transação, o débito da origem só vale se ainda houver saldo (UPDATE condicional)
// e a homologação/rejeição só pega remanejamento ainda PENDENTE_CLI (duas homologações simultâneas não aplicam o ajuste duas vezes).
// POST /api/pdq-remanejamentos -> { projetoOrigemId, projetoDestinoId, valor }
// PUT  /api/pdq-remanejamentos/{id} -> { acao: 'HOMOLOGAR'|'REJEITAR', motivo? }
const auth = require("../shared/auth");
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { round2 } = require("../shared/tesouraria");
const { idOpcional } = require("../shared/financeiroSeguro");

const LIMITE_PERCENTUAL_AUTOMATICO = 20;
const SEM_SALDO = "O projeto de origem não tem mais orçamento previsto suficiente para este remanejamento.";

// Debita a origem SÓ se ainda houver saldo (UPDATE condicional) e credita o destino. Devolve false se a origem não cobre o valor.
async function ajustarOrcamentos(novaRequisicao, projetoOrigemId, projetoDestinoId, valor) {
  const debito = await novaRequisicao().input("id", sql.Int, projetoOrigemId).input("valor", sql.Decimal(12, 2), valor)
    .query(`UPDATE PdqProjetos SET OrcamentoPrevisto = OrcamentoPrevisto - @valor WHERE ProjetoId = @id AND OrcamentoPrevisto >= @valor`);
  if (!debito.rowsAffected || debito.rowsAffected[0] !== 1) return false;
  await novaRequisicao().input("id", sql.Int, projetoDestinoId).input("valor", sql.Decimal(12, 2), valor)
    .query(`UPDATE PdqProjetos SET OrcamentoPrevisto = OrcamentoPrevisto + @valor WHERE ProjetoId = @id`);
  return true;
}

module.exports = async function (context, req) {
  const usuario = exigirGeral(req, context, "cli");
  if (!usuario) return;
  const rota = idOpcional(context.bindingData.id);
  const id = rota.id;
  const pool = await getPool();

  if (req.method === "POST") {
    const { projetoOrigemId, projetoDestinoId, valor } = req.body || {};
    if (!projetoOrigemId || !projetoDestinoId || !valor || !Number.isFinite(Number(valor)) || Number(valor) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: projetoOrigemId, projetoDestinoId, valor (maior que zero)." } };
      return;
    }
    const origemNum = auth.idDeRota(projetoOrigemId);
    const destinoNum = auth.idDeRota(projetoDestinoId);
    if (!origemNum || !destinoNum) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "projetoOrigemId e projetoDestinoId devem ser números válidos." } };
      return;
    }
    if (origemNum === destinoNum) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Origem e destino precisam ser projetos diferentes." } };
      return;
    }
    const origem = await pool.request().input("id", sql.Int, origemNum).query(`SELECT * FROM PdqProjetos WHERE ProjetoId = @id`);
    const destino = await pool.request().input("id", sql.Int, destinoNum).query(`SELECT ProjetoId FROM PdqProjetos WHERE ProjetoId = @id`);
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

    // O registro e o ajuste dos orçamentos nascem juntos (ou não nasce nada).
    const transaction = new sql.Transaction(pool);
    const r = () => new sql.Request(transaction);
    await transaction.begin();
    let remanejamentoId;
    try {
      const criado = await r()
        .input("projetoOrigemId", sql.Int, origemNum).input("projetoDestinoId", sql.Int, destinoNum)
        .input("valor", sql.Decimal(12, 2), valor).input("percentualOrigem", sql.Decimal(5, 2), percentual)
        .input("status", sql.NVarChar(20), statusInicial).input("solicitadoPor", sql.Int, usuario.membroId)
        .query(`INSERT INTO PdqRemanejamentos (ProjetoOrigemId, ProjetoDestinoId, Valor, PercentualOrigem, Status, SolicitadoPor)
                OUTPUT INSERTED.RemanejamentoId VALUES (@projetoOrigemId, @projetoDestinoId, @valor, @percentualOrigem, @status, @solicitadoPor)`);
      remanejamentoId = criado.recordset[0].RemanejamentoId;
      if (statusInicial === "APROVADO_AUTOMATICO" && !(await ajustarOrcamentos(r, origemNum, destinoNum, valor))) {
        await transaction.rollback();
        context.res = { status: 200, body: { sucesso: false, mensagem: SEM_SALDO } };
        return;
      }
      await transaction.commit();
    } catch (erro) {
      try { await transaction.rollback(); } catch (e2) { /* já pode ter sido revertida */ }
      context.log.error("Falha ao registrar remanejamento PDQ:", erro.message);
      context.res = { status: 500, body: { sucesso: false, mensagem: "Falha ao registrar o remanejamento — nada foi alterado. Avise a equipe técnica." } };
      return;
    }

    let mensagem;
    if (statusInicial === "APROVADO_AUTOMATICO") {
      mensagem = `✅ Remanejamento de ${percentual.toFixed(1)}% aprovado automaticamente (até ${LIMITE_PERCENTUAL_AUTOMATICO}% não precisa de homologação).`;
    } else {
      mensagem = `⚠️ Remanejamento de ${percentual.toFixed(1)}% ultrapassa ${LIMITE_PERCENTUAL_AUTOMATICO}% (cláusula de barreira, Art. 28) — fica pendente de homologação da CLI.`;
    }

    await registrarAuditoria({
      tabela: "PdqRemanejamentos", registroId: remanejamentoId, acao: "Solicitou remanejamento de orçamento PDQ", usuarioId: usuario.membroId,
      dadosDepois: { projetoOrigemId: origemNum, projetoDestinoId: destinoNum, valor, percentual, statusInicial }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem, remanejamentoId, status: statusInicial } };
    return;
  }

  if (req.method === "PUT") {
    if (!rota.presente) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/pdq-remanejamentos/{id}" } };
      return;
    }
    const { acao, motivo } = req.body || {};
    if (!["HOMOLOGAR", "REJEITAR"].includes(acao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe acao: HOMOLOGAR ou REJEITAR." } };
      return;
    }
    const registro = id ? await pool.request().input("id", sql.Int, id).query(`SELECT * FROM PdqRemanejamentos WHERE RemanejamentoId = @id`) : { recordset: [] };
    if (registro.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Remanejamento não encontrado." } };
      return;
    }
    if (registro.recordset[0].Status !== "PENDENTE_CLI") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este remanejamento não está mais pendente de homologação." } };
      return;
    }

    if (acao === "REJEITAR") {
      if (typeof motivo !== "string" || !motivo.trim()) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o motivo da rejeição." } };
        return;
      }
      const rejeitou = await pool.request().input("id", sql.Int, id).input("motivo", sql.NVarChar(300), motivo.trim())
        .query(`UPDATE PdqRemanejamentos SET Status = 'REJEITADO', MotivoRejeicao = @motivo WHERE RemanejamentoId = @id AND Status = 'PENDENTE_CLI'`);
      if (!rejeitou.rowsAffected || rejeitou.rowsAffected[0] !== 1) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Este remanejamento não está mais pendente de homologação." } };
        return;
      }
      await registrarAuditoria({
        tabela: "PdqRemanejamentos", registroId: id, acao: "Rejeitou remanejamento (CLI)", usuarioId: usuario.membroId,
        dadosAntes: registro.recordset[0], dadosDepois: { motivo }
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "Remanejamento rejeitado." } };
      return;
    }

    // Homologar: pega o remanejamento (só se ainda PENDENTE_CLI) e aplica o ajuste na mesma transação.
    const transaction = new sql.Transaction(pool);
    const r = () => new sql.Request(transaction);
    await transaction.begin();
    try {
      const pegou = await r().input("id", sql.Int, id).input("homologadoPor", sql.Int, usuario.membroId)
        .query(`UPDATE PdqRemanejamentos SET Status = 'HOMOLOGADO', HomologadoPor = @homologadoPor, HomologadoEm = SYSUTCDATETIME() WHERE RemanejamentoId = @id AND Status = 'PENDENTE_CLI'`);
      if (!pegou.rowsAffected || pegou.rowsAffected[0] !== 1) {
        await transaction.rollback();
        context.res = { status: 200, body: { sucesso: false, mensagem: "Este remanejamento não está mais pendente de homologação." } };
        return;
      }
      if (!(await ajustarOrcamentos(r, registro.recordset[0].ProjetoOrigemId, registro.recordset[0].ProjetoDestinoId, registro.recordset[0].Valor))) {
        await transaction.rollback();
        context.res = { status: 200, body: { sucesso: false, mensagem: SEM_SALDO } };
        return;
      }
      await transaction.commit();
    } catch (erro) {
      try { await transaction.rollback(); } catch (e2) { /* já pode ter sido revertida */ }
      context.log.error("Falha ao homologar remanejamento PDQ:", erro.message);
      context.res = { status: 500, body: { sucesso: false, mensagem: "Falha ao homologar o remanejamento — nada foi alterado. Avise a equipe técnica." } };
      return;
    }
    await registrarAuditoria({
      tabela: "PdqRemanejamentos", registroId: id, acao: "Homologou remanejamento (CLI)", usuarioId: usuario.membroId,
      dadosAntes: registro.recordset[0]
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Remanejamento homologado e aplicado." } };
    return;
  }
};
