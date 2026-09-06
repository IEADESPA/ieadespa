// EvoluirProcessoDisciplinar
// v3.2 — o rito do Regimento (Art. 100-103) por cima do núcleo v0.2. Ações
// (não é uma esteira linear de 1 next-state — cada uma é uma operação
// distinta com validação própria):
//   DESIGNAR_RELATOR -> { relatorMembroId } (Art. 91 — suspeição por parentesco/congregação é só aviso, não bloqueia)
//   CITAR            -> { canalCitacao: 'WHATSAPP'|'CARTA_REGISTRADA', dataCitacao? } (Art. 101 — só registro)
//   AFASTAR          -> {} (Art. 100 — Status vira AFASTAMENTO_CAUTELAR)
//   REGISTRAR_DEFESA -> { dataDefesa? } (exige citação prévia)
//   DESIGNAR_DEFENSOR-> { defensorNome } (Art. 102 — texto livre, pode ser advogado externo)
//   JULGAR           -> { resultado: 'ARQUIVADO'|'SANCAO'|'EXCLUSAO', diasSancao? }
//   AJUSTAR_PRAZO    -> { novoDiasSancao?, prazoIndeterminado?, justificativa } (justificativa obrigatória)
// Exige a permissão "disciplina".
// POST /api/processos-disciplinares/{processoId}/evoluir
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const vacancia = require("../shared/vacancia");
const { existeParentescoAte2Grau } = require("../shared/parentesco");
const { selectProcessoComInfracoes } = require("../shared/disciplinar");

const RESULTADOS_VALIDOS = ["ARQUIVADO", "SANCAO", "EXCLUSAO"];
const CANAIS_CITACAO_VALIDOS = ["WHATSAPP", "CARTA_REGISTRADA"];

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const processoId = context.bindingData.processoId;
  const { acao } = req.body || {};
  if (!processoId || !acao) {
    context.res = { status: 400, body: { erro: "Informe processoId na rota e 'acao' no corpo." } };
    return;
  }

  const pool = await getPool();
  const atualResult = await pool.request().input("id", sql.Int, processoId)
    .query(`SELECT MembroId, Status, Resultado, DiasSancao, DataAbertura, DataTerminoPrevisao, DataCitacao FROM ProcessosDisciplinares WHERE ProcessoId = @id`);
  const atual = atualResult.recordset[0];
  if (!atual) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Processo não encontrado." } };
    return;
  }

  // ---- DESIGNAR_RELATOR: suspeição por parentesco (até 3º grau, Art. 91) ou
  // mesma congregação é só AVISO — quem decide continua sendo o órgão julgador.
  if (acao === "DESIGNAR_RELATOR") {
    const { relatorMembroId } = req.body || {};
    if (!relatorMembroId) {
      context.res = { status: 400, body: { erro: "Informe 'relatorMembroId'." } };
      return;
    }
    const parentesco = await existeParentescoAte2Grau(pool, sql, relatorMembroId, new Set([Number(atual.MembroId)]), 3);
    const mesmaCongregacaoResult = await pool.request()
      .input("relatorId", sql.Int, relatorMembroId).input("reuId", sql.Int, atual.MembroId)
      .query(`SELECT (SELECT CongregacaoId FROM MembroReferencia WHERE MembroId = @relatorId) AS relatorCong,
                     (SELECT CongregacaoId FROM MembroReferencia WHERE MembroId = @reuId) AS reuCong`);
    const { relatorCong, reuCong } = mesmaCongregacaoResult.recordset[0];
    const mesmaCongregacao = relatorCong !== null && relatorCong === reuCong;

    await pool.request().input("id", sql.Int, processoId).input("relatorId", sql.Int, relatorMembroId)
      .query(`UPDATE ProcessosDisciplinares SET RelatorMembroId = @relatorId WHERE ProcessoId = @id`);
    await registrarAuditoria({
      tabela: "ProcessosDisciplinares", registroId: Number(processoId), acao: "Designou relator",
      usuarioId: usuario.membroId, dadosDepois: { relatorMembroId }
    });

    const avisos = [];
    if (parentesco.encontrado) avisos.push(`Parentesco até 3º grau com o réu (matrícula ${parentesco.comMembroId}) — considere impedimento (Art. 91).`);
    if (mesmaCongregacao) avisos.push("Relator é da mesma congregação do réu — considere impedimento (Art. 91).");

    const processo = await selectProcessoComInfracoes(pool, sql, processoId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Relator designado.", avisos, processo } };
    return;
  }

  // ---- CITAR: só registro (Art. 101) — o envio real acontece fora do sistema.
  if (acao === "CITAR") {
    const { canalCitacao, dataCitacao } = req.body || {};
    if (!CANAIS_CITACAO_VALIDOS.includes(canalCitacao)) {
      context.res = { status: 400, body: { erro: `Informe 'canalCitacao' válido: ${CANAIS_CITACAO_VALIDOS.join(" ou ")}.` } };
      return;
    }
    await pool.request().input("id", sql.Int, processoId).input("canal", sql.NVarChar(30), canalCitacao).input("data", sql.Date, dataCitacao || null)
      .query(`UPDATE ProcessosDisciplinares SET CanalCitacao = @canal, DataCitacao = COALESCE(@data, CAST(SYSUTCDATETIME() AS DATE)) WHERE ProcessoId = @id`);
    await registrarAuditoria({
      tabela: "ProcessosDisciplinares", registroId: Number(processoId), acao: "Registrou citação",
      usuarioId: usuario.membroId, dadosDepois: { canalCitacao, dataCitacao: dataCitacao || null }
    });
    const processo = await selectProcessoComInfracoes(pool, sql, processoId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Citação registrada.", processo } };
    return;
  }

  // ---- AFASTAR: afastamento cautelar (Art. 100), estado intermediário.
  if (acao === "AFASTAR") {
    if (atual.Status !== "EM_ANDAMENTO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível afastar cautelarmente um processo Em Andamento." } };
      return;
    }
    await pool.request().input("id", sql.Int, processoId).query(`UPDATE ProcessosDisciplinares SET Status = 'AFASTAMENTO_CAUTELAR' WHERE ProcessoId = @id`);
    await registrarAuditoria({ tabela: "ProcessosDisciplinares", registroId: Number(processoId), acao: "Afastamento cautelar", usuarioId: usuario.membroId, dadosDepois: { status: "AFASTAMENTO_CAUTELAR" } });
    const processo = await selectProcessoComInfracoes(pool, sql, processoId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Afastamento cautelar registrado.", processo } };
    return;
  }

  // ---- REGISTRAR_DEFESA: exige citação prévia.
  if (acao === "REGISTRAR_DEFESA") {
    if (!atual.DataCitacao) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Registre a citação antes de registrar a defesa." } };
      return;
    }
    const { dataDefesa } = req.body || {};
    await pool.request().input("id", sql.Int, processoId).input("data", sql.Date, dataDefesa || null)
      .query(`UPDATE ProcessosDisciplinares SET DefesaProtocolada = 1, DataDefesa = COALESCE(@data, CAST(SYSUTCDATETIME() AS DATE)) WHERE ProcessoId = @id`);
    await registrarAuditoria({ tabela: "ProcessosDisciplinares", registroId: Number(processoId), acao: "Registrou defesa", usuarioId: usuario.membroId, dadosDepois: { dataDefesa: dataDefesa || null } });
    const processo = await selectProcessoComInfracoes(pool, sql, processoId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Defesa registrada.", processo } };
    return;
  }

  // ---- DESIGNAR_DEFENSOR: texto livre (Art. 102) — pode ser defensor eclesiástico ou advogado externo, não cadastrado no sistema.
  if (acao === "DESIGNAR_DEFENSOR") {
    const { defensorNome } = req.body || {};
    if (!defensorNome || !String(defensorNome).trim()) {
      context.res = { status: 400, body: { erro: "Informe 'defensorNome'." } };
      return;
    }
    await pool.request().input("id", sql.Int, processoId).input("nome", sql.NVarChar(200), String(defensorNome).trim())
      .query(`UPDATE ProcessosDisciplinares SET DefensorNome = @nome WHERE ProcessoId = @id`);
    await registrarAuditoria({ tabela: "ProcessosDisciplinares", registroId: Number(processoId), acao: "Designou defensor", usuarioId: usuario.membroId, dadosDepois: { defensorNome: String(defensorNome).trim() } });
    const processo = await selectProcessoComInfracoes(pool, sql, processoId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Defensor designado.", processo } };
    return;
  }

  // ---- JULGAR: encerra a fase de instrução com um resultado ----
  if (acao === "JULGAR") {
    if (atual.Status === "JULGADO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este processo já foi julgado." } };
      return;
    }
    const { resultado, diasSancao } = req.body || {};
    if (!RESULTADOS_VALIDOS.includes(resultado)) {
      context.res = { status: 400, body: { erro: "Informe 'resultado' válido: ARQUIVADO, SANCAO ou EXCLUSAO." } };
      return;
    }
    const diasSancaoFinal = resultado === "SANCAO" && diasSancao ? Number(diasSancao) : null;

    await pool.request()
      .input("id", sql.Int, processoId)
      .input("resultado", sql.NVarChar(30), resultado)
      .input("diasSancao", sql.Int, diasSancaoFinal)
      .query(`
        UPDATE ProcessosDisciplinares SET
          Status = 'JULGADO', Resultado = @resultado, DiasSancao = @diasSancao,
          DataTerminoPrevisao = CASE WHEN @diasSancao IS NOT NULL THEN DATEADD(day, @diasSancao, DataAbertura) ELSE NULL END,
          DataConclusao = CAST(SYSUTCDATETIME() AS DATE)
        WHERE ProcessoId = @id`);

    // Exclusão sempre implica perda de tudo (Regimento) — encerra Assentos, Liderança
    // e Cargo Ministerial/Departamento (shared/vacancia.js, v1.5). Os demais resultados
    // (SANCAO) exigem saber o nível de pena pra decidir se há perda de mandato
    // (Disciplina Rigorosa) ou só afastamento temporário (Suspensão Temporária) — isso
    // depende do catálogo TiposPenalidade, que é v3.4.
    if (resultado === "EXCLUSAO") {
      await vacancia.encerrarVinculos(pool, sql, atual.MembroId, "DISCIPLINA");
    }

    await registrarAuditoria({
      tabela: "ProcessosDisciplinares",
      registroId: Number(processoId),
      acao: `Julgou processo: ${resultado}`,
      usuarioId: usuario.membroId,
      dadosDepois: { resultado, diasSancao: diasSancaoFinal }
    });

    const processo = await selectProcessoComInfracoes(pool, sql, processoId);
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: "✅ Processo julgado.", processo }
    };
    return;
  }

  // ---- AJUSTAR_PRAZO: reduz/aumenta/torna indeterminado o prazo de uma sanção já
  // julgada — sempre com justificativa auditada (é o órgão que decide, não o sistema).
  if (acao === "AJUSTAR_PRAZO") {
    if (atual.Status !== "JULGADO" || atual.Resultado !== "SANCAO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível ajustar prazo de um processo já julgado com resultado SANCAO." } };
      return;
    }
    const { novoDiasSancao, prazoIndeterminado, justificativa } = req.body || {};
    if (!justificativa || !String(justificativa).trim()) {
      context.res = { status: 400, body: { erro: "Justificativa é obrigatória para ajustar o prazo de uma sanção." } };
      return;
    }
    if (!prazoIndeterminado && !novoDiasSancao) {
      context.res = { status: 400, body: { erro: "Informe 'novoDiasSancao' ou 'prazoIndeterminado'." } };
      return;
    }
    const diasFinal = prazoIndeterminado ? null : Number(novoDiasSancao);

    await pool.request()
      .input("id", sql.Int, processoId)
      .input("dias", sql.Int, diasFinal)
      .query(`
        UPDATE ProcessosDisciplinares SET
          DiasSancao = @dias,
          DataTerminoPrevisao = CASE WHEN @dias IS NOT NULL THEN DATEADD(day, @dias, DataAbertura) ELSE NULL END
        WHERE ProcessoId = @id`);

    await registrarAuditoria({
      tabela: "ProcessosDisciplinares",
      registroId: Number(processoId),
      acao: "Ajustou prazo da sanção",
      usuarioId: usuario.membroId,
      dadosAntes: { diasSancao: atual.DiasSancao, dataTerminoPrevisao: atual.DataTerminoPrevisao },
      dadosDepois: { diasSancao: diasFinal, justificativa: String(justificativa).trim() }
    });

    const processo = await selectProcessoComInfracoes(pool, sql, processoId);
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: "✅ Prazo ajustado.", processo }
    };
    return;
  }

  context.res = { status: 400, body: { erro: "Ação inválida. Use DESIGNAR_RELATOR, CITAR, AFASTAR, REGISTRAR_DEFESA, DESIGNAR_DEFENSOR, JULGAR ou AJUSTAR_PRAZO." } };
};
