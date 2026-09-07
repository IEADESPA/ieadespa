// EvoluirProcessoDisciplinar
// v3.2 — o rito do Regimento (Art. 100-103) por cima do núcleo v0.2. Ações
// (não é uma esteira linear de 1 next-state — cada uma é uma operação
// distinta com validação própria):
//   DESIGNAR_RELATOR -> { relatorMembroId } (Art. 91 — suspeição por parentesco/congregação é só aviso, não bloqueia)
//   CITAR            -> { canalCitacao: 'WHATSAPP'|'CARTA_REGISTRADA', dataCitacao? } (Art. 101 — só registro)
//   AFASTAR          -> {} (Art. 100 — Status vira AFASTAMENTO_CAUTELAR)
//   REGISTRAR_DEFESA -> { dataDefesa? } (exige citação prévia)
//   DESIGNAR_DEFENSOR-> { defensorNome } (Art. 102 — texto livre, pode ser advogado externo)
//   JULGAR           -> { resultado: 'ARQUIVADO'|'SANCAO'|'EXCLUSAO', penalidadeId? (obrigatório se SANCAO), diasSancao? }
//   AJUSTAR_PRAZO    -> { novoDiasSancao?, prazoIndeterminado?, justificativa } (justificativa obrigatória)
//   REGISTRAR_PROVA_REINTEGRACAO -> { resultadoProva: 'APROVADO'|'REPROVADO', dataProva? } (Art. 77 — só p/ Disciplina Rigorosa já julgada)
//   RECORRER         -> { orgaoDestinoTipo: 'CENTRAL'|'LOCAL', orgaoDestinoId, justificativa } (v3.6 — JAI/JEA, Art. 108 §3º/123)
//   HOMOLOGAR_EXCLUSAO -> { homologado: true|false } (v3.6 — Exclusão/Disciplina Rigorosa votada por TER, Art. 94 II, exige permissão "cei")
// Exige a permissão "disciplina" (HOMOLOGAR_EXCLUSAO exige também "cei").
// POST /api/processos-disciplinares/{processoId}/evoluir
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const vacancia = require("../shared/vacancia");
const { existeParentescoAte2Grau } = require("../shared/parentesco");
const { selectProcessoComInfracoes, validarOrgaoProcesso, SIGLAS_QUE_PODEM_RECORRER } = require("../shared/disciplinar");
const { membroAutorizadoNoOrgaoLocal } = require("../shared/escopo");

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
    .query(`SELECT MembroId, Status, Resultado, DiasSancao, DataAbertura, DataTerminoPrevisao, DataCitacao, PenalidadeId,
                   OrgaoResponsavelId, OrgaoLocalId, HomologadoPeloCEI
            FROM ProcessosDisciplinares WHERE ProcessoId = @id`);
  const atual = atualResult.recordset[0];
  if (!atual) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Processo não encontrado." } };
    return;
  }
  // v3.6 — resolve a Sigla do órgão (central ou territorial) deste processo,
  // usada nas restrições de competência por instância (JAI/JEA/TER).
  const orgaoAtual = await validarOrgaoProcesso(pool, sql, { orgaoResponsavelId: atual.OrgaoResponsavelId, orgaoLocalId: atual.OrgaoLocalId });

  // v3.6.2 — só quem é membro daquele órgão territorial (Lideranca Papel+
  // Escopo, ou GLOBAL) pode agir no processo. HOMOLOGAR_EXCLUSAO fica de
  // fora: é o CEI (permissão "cei") que homologa, não o órgão territorial.
  if (orgaoAtual.orgaoLocalId && acao !== "HOMOLOGAR_EXCLUSAO" &&
      !(await membroAutorizadoNoOrgaoLocal(pool, sql, usuario.membroId, orgaoAtual.orgaoLocalId))) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Você não tem vínculo com este órgão territorial." } };
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

  // ---- REGISTRAR_PROVA_REINTEGRACAO: Art. 77 — só cabe pra quem já foi
  // julgado com Disciplina Rigorosa (perda de mandato sem prazo fixo de
  // dias); Suspensão Temporária já retoma sozinha quando os dias terminam.
  if (acao === "REGISTRAR_PROVA_REINTEGRACAO") {
    if (atual.Status !== "JULGADO" || atual.Resultado !== "SANCAO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível registrar Prova de Reintegração de um processo julgado com resultado SANCAO." } };
      return;
    }
    const penalidadeAtual = await pool.request().input("id", sql.Int, atual.PenalidadeId || 0).query(`SELECT Codigo FROM TiposPenalidade WHERE PenalidadeId = @id`);
    if (!penalidadeAtual.recordset[0] || penalidadeAtual.recordset[0].Codigo !== "DISCIPLINA_RIGOROSA") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Prova de Reintegração Ética só se aplica a Disciplina Rigorosa." } };
      return;
    }
    const { resultadoProva, dataProva } = req.body || {};
    if (!["APROVADO", "REPROVADO"].includes(resultadoProva)) {
      context.res = { status: 400, body: { erro: "Informe 'resultadoProva' válido: APROVADO ou REPROVADO." } };
      return;
    }
    await pool.request().input("id", sql.Int, processoId).input("resultado", sql.NVarChar(20), resultadoProva).input("data", sql.Date, dataProva || null)
      .query(`UPDATE ProcessosDisciplinares SET ResultadoProvaReintegracao = @resultado, DataProvaReintegracao = COALESCE(@data, CAST(SYSUTCDATETIME() AS DATE)) WHERE ProcessoId = @id`);
    await registrarAuditoria({
      tabela: "ProcessosDisciplinares", registroId: Number(processoId), acao: "Registrou Prova de Reintegração Ética",
      usuarioId: usuario.membroId, dadosDepois: { resultadoProva, dataProva: dataProva || null }
    });
    const processo = await selectProcessoComInfracoes(pool, sql, processoId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Prova de Reintegração registrada.", processo } };
    return;
  }

  // ---- RECORRER (v3.6): JAI/JEA já julgadas — cria um processo NOVO na
  // instância superior (nunca reabre o mesmo registro), copiando as mesmas
  // infrações. Prazo de 5 dias corridos da conclusão (Art. 108 §3º/123).
  if (acao === "RECORRER") {
    if (atual.Status !== "JULGADO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível recorrer de um processo já julgado." } };
      return;
    }
    if (!SIGLAS_QUE_PODEM_RECORRER.includes(orgaoAtual.sigla)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Recurso só cabe de JAI ou JEA." } };
      return;
    }
    const { orgaoDestinoTipo, orgaoDestinoId, justificativa } = req.body || {};
    if (!justificativa || !String(justificativa).trim()) {
      context.res = { status: 400, body: { erro: "Justificativa é obrigatória para recorrer." } };
      return;
    }
    const destino = orgaoDestinoTipo === "CENTRAL"
      ? await validarOrgaoProcesso(pool, sql, { orgaoResponsavelId: orgaoDestinoId })
      : await validarOrgaoProcesso(pool, sql, { orgaoLocalId: orgaoDestinoId });
    if (!destino.valido) {
      context.res = { status: 200, body: { sucesso: false, mensagem: destino.mensagem } };
      return;
    }
    // Central (ex: CEI) sempre serve de destino; territorial precisa ser
    // exatamente 1 nível acima (JAI Nível 1 -> JEA Nível 2; JEA Nível 2 -> TER Nível 3).
    if (destino.orgaoLocalId) {
      const origemNivel = await pool.request().input("id", sql.Int, atual.OrgaoLocalId).query(`SELECT Nivel FROM OrgaosLocais WHERE OrgaoLocalId = @id`);
      const nivelOrigem = origemNivel.recordset[0] ? origemNivel.recordset[0].Nivel : null;
      if (nivelOrigem === null || destino.nivel !== nivelOrigem + 1) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "O destino do recurso precisa ser a instância territorial imediatamente superior." } };
        return;
      }
    }

    const infracoesAtuais = await pool.request().input("id", sql.Int, processoId).query(`SELECT InfracaoId FROM ProcessoInfracoes WHERE ProcessoId = @id`);

    const novoResult = await pool.request()
      .input("membroId", sql.Int, atual.MembroId)
      .input("orgaoResponsavelId", sql.Int, destino.orgaoResponsavelId)
      .input("orgaoLocalId", sql.Int, destino.orgaoLocalId)
      .input("motivo", sql.NVarChar(500), `Recurso do processo #${processoId}: ${String(justificativa).trim()}`)
      .input("origemId", sql.Int, processoId)
      .query(`
        INSERT INTO ProcessosDisciplinares (MembroId, OrgaoResponsavelId, OrgaoLocalId, Motivo, DataAbertura, Status, Sigiloso, ProcessoOrigemId)
        OUTPUT INSERTED.ProcessoId
        VALUES (@membroId, @orgaoResponsavelId, @orgaoLocalId, @motivo, CAST(SYSUTCDATETIME() AS DATE), 'EM_ANDAMENTO', 1, @origemId)
      `);
    const novoProcessoId = novoResult.recordset[0].ProcessoId;
    for (const row of infracoesAtuais.recordset) {
      await pool.request().input("processoId", sql.Int, novoProcessoId).input("infracaoId", sql.Int, row.InfracaoId)
        .query(`INSERT INTO ProcessoInfracoes (ProcessoId, InfracaoId) VALUES (@processoId, @infracaoId)`);
    }
    await pool.request().input("id", sql.Int, processoId).query(`UPDATE ProcessosDisciplinares SET Status = 'EM_RECURSO' WHERE ProcessoId = @id`);

    await registrarAuditoria({
      tabela: "ProcessosDisciplinares", registroId: Number(processoId), acao: `Recorreu para novo processo #${novoProcessoId}`,
      usuarioId: usuario.membroId, dadosDepois: { novoProcessoId, orgaoDestinoTipo, orgaoDestinoId, justificativa: String(justificativa).trim() }
    });
    const processo = await selectProcessoComInfracoes(pool, sql, processoId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Recurso registrado — novo processo #${novoProcessoId}.`, novoProcessoId, processo } };
    return;
  }

  // ---- HOMOLOGAR_EXCLUSAO (v3.6): Exclusão/Disciplina Rigorosa votada pelo
  // TER só produz efeito (vacância) após homologação do CEI (Art. 94, II).
  if (acao === "HOMOLOGAR_EXCLUSAO") {
    if (!usuario.permissoes || !usuario.permissoes.includes("cei")) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Requer a permissão 'cei'." } };
      return;
    }
    if (atual.HomologadoPeloCEI !== false && atual.HomologadoPeloCEI !== 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este processo não está pendente de homologação." } };
      return;
    }
    const { homologado } = req.body || {};
    if (typeof homologado !== "boolean") {
      context.res = { status: 400, body: { erro: "Informe 'homologado' (true ou false)." } };
      return;
    }
    await pool.request().input("id", sql.Int, processoId).input("valor", sql.Bit, homologado)
      .query(`UPDATE ProcessosDisciplinares SET HomologadoPeloCEI = @valor WHERE ProcessoId = @id`);
    if (homologado) {
      await vacancia.encerrarVinculos(pool, sql, atual.MembroId, "DISCIPLINA");
    }
    await registrarAuditoria({
      tabela: "ProcessosDisciplinares", registroId: Number(processoId), acao: homologado ? "Homologou exclusão/disciplina rigorosa (CEI)" : "Não homologou (CEI)",
      usuarioId: usuario.membroId, dadosDepois: { homologado }
    });
    const processo = await selectProcessoComInfracoes(pool, sql, processoId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: homologado ? "✅ Homologado — vínculos encerrados." : "Registrado como não homologado.", processo } };
    return;
  }

  // ---- JULGAR: encerra a fase de instrução com um resultado ----
  if (acao === "JULGAR") {
    if (atual.Status === "JULGADO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este processo já foi julgado." } };
      return;
    }
    const { resultado, diasSancao } = req.body || {};
    let { penalidadeId } = req.body || {};
    if (!RESULTADOS_VALIDOS.includes(resultado)) {
      context.res = { status: 400, body: { erro: "Informe 'resultado' válido: ARQUIVADO, SANCAO ou EXCLUSAO." } };
      return;
    }

    // Art. 95 §2º — nível de pena explícito via catálogo TiposPenalidade.
    // EXCLUSAO resolve sozinha a penalidade correspondente (Codigo='EXCLUSAO');
    // SANCAO exige escolher entre as demais (não pode ser a de código EXCLUSAO).
    let penalidadeCodigo = null;
    if (resultado === "EXCLUSAO") {
      const penalidadeExclusao = await pool.request().query(`SELECT PenalidadeId, Codigo FROM TiposPenalidade WHERE Codigo = 'EXCLUSAO'`);
      penalidadeId = penalidadeExclusao.recordset[0] ? penalidadeExclusao.recordset[0].PenalidadeId : null;
      penalidadeCodigo = "EXCLUSAO";
    } else if (resultado === "SANCAO") {
      if (!penalidadeId) {
        context.res = { status: 400, body: { erro: "Informe 'penalidadeId' (Advertência, Suspensão Temporária ou Disciplina Rigorosa)." } };
        return;
      }
      const penalidadeResult = await pool.request().input("id", sql.Int, penalidadeId)
        .query(`SELECT Codigo FROM TiposPenalidade WHERE PenalidadeId = @id AND Ativo = 1`);
      if (penalidadeResult.recordset.length === 0 || penalidadeResult.recordset[0].Codigo === "EXCLUSAO") {
        context.res = { status: 400, body: { erro: "Penalidade inválida para SANCAO." } };
        return;
      }
      penalidadeCodigo = penalidadeResult.recordset[0].Codigo;
    } else {
      penalidadeId = null;
    }

    // Art. 108 §2º / 123, III — JAI e JEA não podem votar Exclusão nem
    // Disciplina Rigorosa (saem da alçada territorial); Art. 108 — JAI tem
    // teto de 90 dias de suspensão.
    const implicaVacancia = resultado === "EXCLUSAO" || penalidadeCodigo === "DISCIPLINA_RIGOROSA";
    if (implicaVacancia && ["JAI", "JEA"].includes(orgaoAtual.sigla)) {
      context.res = {
        status: 200,
        body: { sucesso: false, mensagem: `${orgaoAtual.sigla} não pode votar Exclusão/Disciplina Rigorosa (Art. 108 §2º/123, III) — julgue com Advertência/Suspensão Temporária ou use 'RECORRER' para a instância superior.` }
      };
      return;
    }
    if (orgaoAtual.sigla === "JAI" && diasSancao && Number(diasSancao) > 90) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "JAI só pode aplicar suspensão de até 90 dias (Art. 108)." } };
      return;
    }

    const diasSancaoFinal = resultado === "SANCAO" && diasSancao ? Number(diasSancao) : null;
    // TER pode votar Exclusão/Disciplina Rigorosa, mas só produz efeito após
    // homologação do CEI (Art. 94, II / 126-C) — a vacância fica pendente.
    const pendenteDeHomologacao = implicaVacancia && orgaoAtual.sigla === "TER";

    await pool.request()
      .input("id", sql.Int, processoId)
      .input("resultado", sql.NVarChar(30), resultado)
      .input("diasSancao", sql.Int, diasSancaoFinal)
      .input("penalidadeId", sql.Int, penalidadeId || null)
      .input("homologadoPeloCei", sql.Bit, pendenteDeHomologacao ? 0 : null)
      .query(`
        UPDATE ProcessosDisciplinares SET
          Status = 'JULGADO', Resultado = @resultado, DiasSancao = @diasSancao, PenalidadeId = @penalidadeId,
          HomologadoPeloCEI = @homologadoPeloCei,
          DataTerminoPrevisao = CASE WHEN @diasSancao IS NOT NULL THEN DATEADD(day, @diasSancao, DataAbertura) ELSE NULL END,
          DataConclusao = CAST(SYSUTCDATETIME() AS DATE)
        WHERE ProcessoId = @id`);

    // Exclusão e Disciplina Rigorosa implicam perda de mandato (Art. 95 §2º,
    // III-IV) — encerram Assentos, Liderança e Cargo Ministerial/Departamento
    // (shared/vacancia.js). Advertência e Suspensão Temporária não perdem o
    // mandato — só ficam sem capacidade eleitoral enquanto durar a sanção
    // (shared/disciplina.js), sem tocar em Assentos/Liderança. Quando o
    // julgamento é do TER, a vacância só acontece na homologação do CEI.
    if (implicaVacancia && !pendenteDeHomologacao) {
      await vacancia.encerrarVinculos(pool, sql, atual.MembroId, "DISCIPLINA");
    }

    await registrarAuditoria({
      tabela: "ProcessosDisciplinares",
      registroId: Number(processoId),
      acao: `Julgou processo: ${resultado}${penalidadeCodigo ? ` (${penalidadeCodigo})` : ""}`,
      usuarioId: usuario.membroId,
      dadosDepois: { resultado, penalidadeId: penalidadeId || null, diasSancao: diasSancaoFinal, pendenteDeHomologacao }
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

  context.res = { status: 400, body: { erro: "Ação inválida. Use DESIGNAR_RELATOR, CITAR, AFASTAR, REGISTRAR_DEFESA, DESIGNAR_DEFENSOR, JULGAR, AJUSTAR_PRAZO ou REGISTRAR_PROVA_REINTEGRACAO." } };
};
