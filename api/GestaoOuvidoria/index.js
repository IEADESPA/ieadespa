// GestaoOuvidoria (v3.7)
// Ouvidoria Eclesiástica (Art. 104) — canal de denúncias/sugestões sigiloso
// e opcionalmente anônimo, vinculado ao NIF (Conselho Fiscal) + CEI,
// independente da Diretoria Executiva.
//
// POST /api/ouvidoria                      -> abrir denúncia/sugestão. Qualquer pessoa
//   logada ("toda a membresia", Art. 104 caput) — sem exigir permissão específica.
//   body: { tipo, anonima?, denunciadoMembroId?, relato }
//   Se anonima=true, NUNCA grava DenuncianteMembroId nem usuarioId na auditoria
//   (anonimato técnico de verdade, Art. 104 §2º — não é só mascarado na leitura).
// GET  /api/ouvidoria                       -> lista, exige permissão "ouvidoria".
// POST /api/ouvidoria/{denunciaId}/evoluir  -> exige "ouvidoria" (ANONIMIZAR exige "protecaodedados").
//   ATRIBUIR_OUVIDOR    -> { ouvidorMembroId }
//   ENCAMINHAR_PROCESSO -> { orgaoResponsavelId?/orgaoLocalId?, infracoesIds }
//   ARQUIVAR / CONCLUIR -> { justificativa }
//   ANONIMIZAR          -> {} (só em ARQUIVADA/CONCLUIDA — Art. 104 §9º)
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { gerarProtocolo, redigirDenuncias } = require("../shared/ouvidoria");
const { criarProcessoDisciplinar } = require("../shared/disciplinar");
const { membroAutorizadoNoOrgaoLocal } = require("../shared/escopo");

const TIPOS_VALIDOS = ["INFRACAO_ETICA", "ASSEDIO", "DESVIO_FINANCEIRO", "ABUSO_AUTORIDADE", "SUGESTAO"];

const SELECT_DENUNCIA = `
  SELECT d.DenunciaId AS denunciaId, d.Protocolo AS protocolo, d.Tipo AS tipo, d.Anonima AS anonima,
         d.DenuncianteMembroId AS denuncianteMembroId,
         CASE WHEN d.Anonima = 1 THEN NULL ELSE denunciante.Nome END AS denuncianteNome,
         d.DenunciadoMembroId AS denunciadoMembroId, denunciado.Nome AS denunciadoNome,
         CASE WHEN diretoria.AssentoId IS NULL THEN 0 ELSE 1 END AS denunciadoEhDiretoria,
         d.Relato AS relato, CONVERT(varchar(33), d.DataProtocolo, 126) AS dataProtocolo,
         d.Status AS status, d.OuvidorMembroId AS ouvidorMembroId, ouvidor.Nome AS ouvidorNome,
         d.ProcessoDisciplinarId AS processoDisciplinarId,
         CONVERT(varchar(33), d.DataConclusao, 126) AS dataConclusao, d.DadosAnonimizados AS dadosAnonimizados
  FROM DenunciasOuvidoria d
  LEFT JOIN MembroReferencia denunciante ON denunciante.MembroId = d.DenuncianteMembroId
  LEFT JOIN MembroReferencia denunciado ON denunciado.MembroId = d.DenunciadoMembroId
  LEFT JOIN MembroReferencia ouvidor ON ouvidor.MembroId = d.OuvidorMembroId
  LEFT JOIN Assentos diretoria ON diretoria.MembroId = d.DenunciadoMembroId AND diretoria.DataFim IS NULL
       AND diretoria.OrgaoId IN (SELECT OrgaoId FROM Orgaos WHERE Sigla = 'DIRETORIA_EXECUTIVA')`;

module.exports = async function (context, req) {
  const denunciaId = context.bindingData.denunciaId;
  const acao = context.bindingData.acao;
  const pool = await getPool();

  // ---- POST /api/ouvidoria (sem id) — abrir denúncia/sugestão ----
  if (req.method === "POST" && !denunciaId) {
    const usuario = auth.exigirLogin(req, context);
    if (!usuario) return;

    const { tipo, anonima, denunciadoMembroId, relato } = req.body || {};
    if (!TIPOS_VALIDOS.includes(tipo) || !relato || !String(relato).trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Informe 'tipo' válido (${TIPOS_VALIDOS.join(", ")}) e 'relato'.` } };
      return;
    }
    const ehAnonima = anonima === true;

    const protocolo = await gerarProtocolo(pool, sql);
    const result = await pool.request()
      .input("protocolo", sql.NVarChar(30), protocolo)
      .input("tipo", sql.NVarChar(30), tipo)
      .input("anonima", sql.Bit, ehAnonima)
      .input("denuncianteMembroId", sql.Int, ehAnonima ? null : usuario.membroId)
      .input("denunciadoMembroId", sql.Int, denunciadoMembroId || null)
      .input("relato", sql.NVarChar(sql.MAX), String(relato).trim())
      .query(`
        INSERT INTO DenunciasOuvidoria (Protocolo, Tipo, Anonima, DenuncianteMembroId, DenunciadoMembroId, Relato)
        OUTPUT INSERTED.DenunciaId
        VALUES (@protocolo, @tipo, @anonima, @denuncianteMembroId, @denunciadoMembroId, @relato)
      `);
    const novaDenunciaId = result.recordset[0].DenunciaId;

    // Anonimato técnico de verdade (Art. 104 §2º): nem a trilha de auditoria
    // guarda quem denunciou — AuditLog.UsuarioId é nullable exatamente pra isso.
    await registrarAuditoria({
      tabela: "DenunciasOuvidoria", registroId: novaDenunciaId, acao: "Abriu denúncia/sugestão",
      usuarioId: ehAnonima ? null : usuario.membroId, dadosDepois: { tipo, anonima: ehAnonima, denunciadoMembroId: denunciadoMembroId || null }
    });

    context.res = {
      status: 201,
      headers: { "Content-Type": "application/json" },
      body: { sucesso: true, mensagem: "✅ Denúncia registrada. Guarde o protocolo — é a única forma de acompanhar.", protocolo }
    };
    return;
  }

  // ---- GET /api/ouvidoria — lista, exige permissão "ouvidoria" ----
  if (req.method === "GET" && !denunciaId) {
    const usuario = auth.exigirPermissao(req, context, "ouvidoria");
    if (!usuario) return;

    const result = await pool.request().query(`${SELECT_DENUNCIA} ORDER BY d.DataProtocolo DESC`);
    const denuncias = await redigirDenuncias(pool, sql, result.recordset, usuario);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: denuncias };
    return;
  }

  // ---- POST /api/ouvidoria/{denunciaId}/evoluir ----
  // Permissão por ação: ANONIMIZAR exige "protecaodedados" (Encarregado de
  // Dados, não necessariamente da Ouvidoria); as demais exigem "ouvidoria".
  if (req.method === "POST" && denunciaId && acao === "evoluir") {
    const usuario = auth.exigirLogin(req, context);
    if (!usuario) return;

    const { acao: acaoEvoluir } = req.body || {};
    const permissaoNecessaria = acaoEvoluir === "ANONIMIZAR" ? "protecaodedados" : "ouvidoria";
    if (!usuario.permissoes || !usuario.permissoes.includes(permissaoNecessaria)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: `Requer a permissão '${permissaoNecessaria}'.` } };
      return;
    }

    const atualResult = await pool.request().input("id", sql.Int, denunciaId).query(`SELECT * FROM DenunciasOuvidoria WHERE DenunciaId = @id`);
    const atual = atualResult.recordset[0];
    if (!atual) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Denúncia não encontrada." } };
      return;
    }

    if (acaoEvoluir === "ATRIBUIR_OUVIDOR") {
      const { ouvidorMembroId } = req.body || {};
      if (!ouvidorMembroId) {
        context.res = { status: 400, body: { erro: "Informe 'ouvidorMembroId'." } };
        return;
      }
      await pool.request().input("id", sql.Int, denunciaId).input("ouvidorId", sql.Int, ouvidorMembroId)
        .query(`UPDATE DenunciasOuvidoria SET OuvidorMembroId = @ouvidorId, Status = 'EM_APURACAO' WHERE DenunciaId = @id`);
      await registrarAuditoria({ tabela: "DenunciasOuvidoria", registroId: Number(denunciaId), acao: "Atribuiu ouvidor", usuarioId: usuario.membroId, dadosDepois: { ouvidorMembroId } });
      context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Ouvidor atribuído." } };
      return;
    }

    if (acaoEvoluir === "ENCAMINHAR_PROCESSO") {
      if (!atual.DenunciadoMembroId) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta denúncia não tem um denunciado — não é possível abrir processo disciplinar." } };
        return;
      }
      const { orgaoResponsavelId, orgaoLocalId, infracoesIds } = req.body || {};
      if (orgaoLocalId && !(await membroAutorizadoNoOrgaoLocal(pool, sql, usuario.membroId, orgaoLocalId))) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Você não tem vínculo com este órgão territorial." } };
        return;
      }
      const resultadoProcesso = await criarProcessoDisciplinar(pool, sql, {
        membroId: atual.DenunciadoMembroId, orgaoResponsavelId, orgaoLocalId, infracoesIds,
        motivo: `Encaminhado da Ouvidoria (protocolo ${atual.Protocolo}).`
      }, usuario.membroId);
      if (!resultadoProcesso.sucesso) {
        context.res = { status: 200, body: resultadoProcesso };
        return;
      }
      await pool.request().input("id", sql.Int, denunciaId).input("processoId", sql.Int, resultadoProcesso.processoId)
        .query(`UPDATE DenunciasOuvidoria SET Status = 'ENCAMINHADA_PROCESSO', ProcessoDisciplinarId = @processoId WHERE DenunciaId = @id`);
      await registrarAuditoria({ tabela: "DenunciasOuvidoria", registroId: Number(denunciaId), acao: "Encaminhou pra processo disciplinar", usuarioId: usuario.membroId, dadosDepois: { processoId: resultadoProcesso.processoId } });
      context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Encaminhado pra processo disciplinar.", processoId: resultadoProcesso.processoId } };
      return;
    }

    if (acaoEvoluir === "ARQUIVAR" || acaoEvoluir === "CONCLUIR") {
      const { justificativa } = req.body || {};
      if (!justificativa || !String(justificativa).trim()) {
        context.res = { status: 400, body: { erro: "Justificativa é obrigatória." } };
        return;
      }
      const novoStatus = acaoEvoluir === "ARQUIVAR" ? "ARQUIVADA" : "CONCLUIDA";
      await pool.request().input("id", sql.Int, denunciaId).input("status", sql.NVarChar(30), novoStatus)
        .query(`UPDATE DenunciasOuvidoria SET Status = @status, DataConclusao = SYSUTCDATETIME() WHERE DenunciaId = @id`);
      await registrarAuditoria({ tabela: "DenunciasOuvidoria", registroId: Number(denunciaId), acao: `${acaoEvoluir === "ARQUIVAR" ? "Arquivou" : "Concluiu"} denúncia`, usuarioId: usuario.membroId, dadosDepois: { justificativa: String(justificativa).trim() } });
      context.res = { status: 200, body: { sucesso: true, mensagem: `✅ Denúncia ${novoStatus === "ARQUIVADA" ? "arquivada" : "concluída"}.` } };
      return;
    }

    if (acaoEvoluir === "ANONIMIZAR") {
      if (!["ARQUIVADA", "CONCLUIDA"].includes(atual.Status)) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível anonimizar uma denúncia já arquivada ou concluída (Art. 104 §9º)." } };
        return;
      }
      await pool.request().input("id", sql.Int, denunciaId)
        .query(`UPDATE DenunciasOuvidoria SET Relato = '[ANONIMIZADO]', DenuncianteMembroId = NULL, DadosAnonimizados = 1 WHERE DenunciaId = @id`);
      await registrarAuditoria({ tabela: "DenunciasOuvidoria", registroId: Number(denunciaId), acao: "Anonimizou dados (Art. 104 §9º)", usuarioId: usuario.membroId });
      context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Dados anonimizados." } };
      return;
    }

    context.res = { status: 400, body: { erro: "Ação inválida. Use ATRIBUIR_OUVIDOR, ENCAMINHAR_PROCESSO, ARQUIVAR, CONCLUIR ou ANONIMIZAR." } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método/rota não suportado." } };
};
