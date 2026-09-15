// GestaoMediacoesArbitragens (vB.16 — Mediação e Arbitragem Eclesiástica, Reg. Art. 161-A)
// Disputa patrimonial/administrativa ENTRE PARTES — via distinta do
// processo disciplinar (FASE 3). Sequência travada pelo sistema: arbitragem
// só abre depois da mediação encerrar SEM acordo.
// GET  /api/mediacoes                 -> lista (permissão "mediacao")
// GET  /api/mediacoes/{id}            -> detalhe + sessões + prazo calculado
// POST /api/mediacoes                 -> instaura (qualquer pessoa logada — qualquer parte pode abrir)
// POST /api/mediacoes/{id}/sessoes    -> registra sessão de mediação (comparecimento)
// PUT  /api/mediacoes/{id}            -> { acao, ... }
//      DESIGNAR_MEDIADOR { mediadorId } | REGISTRAR_ACORDO { resumoAcordo, saidaVinculadaId? }
//      MEDIACAO_SEM_ACORDO { motivo } | DESIGNAR_ARBITRO { arbitroId }
//      REGISTRAR_COMPROMISSO_ARBITRAL {} | REGISTRAR_SENTENCA { sentencaBase64, mimeType }
//      BIFURCAR_DISCIPLINAR { orgaoResponsavelId?, orgaoLocalId?, infracoesIds }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const mediacaoArbitragem = require("../shared/mediacaoArbitragem");

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;

const SELECT_MEDIACAO = `
  SELECT m.MediacaoId AS mediacaoId, m.Assunto AS assunto,
         m.ParteAId AS parteAId, pa.Nome AS parteANome, m.ParteADescricao AS parteADescricao,
         m.ParteBId AS parteBId, pb.Nome AS parteBNome, m.ParteBDescricao AS parteBDescricao,
         m.ValorEnvolvido AS valorEnvolvido, m.PrazoDiasEncerramento AS prazoDiasEncerramento,
         m.Status AS status, m.InstauradoPor AS instauradoPor,
         CONVERT(varchar(10), m.DataInstauracao, 120) AS dataInstauracao,
         m.MediadorId AS mediadorId, mediador.Nome AS mediadorNome,
         CONVERT(varchar(10), m.DataDesignacaoMediador, 120) AS dataDesignacaoMediador,
         CONVERT(varchar(10), m.DataEncerramentoMediacao, 120) AS dataEncerramentoMediacao,
         m.SaidaVinculadaId AS saidaVinculadaId,
         m.ArbitroId AS arbitroId, arbitro.Nome AS arbitroNome,
         CONVERT(varchar(10), m.DataDesignacaoArbitro, 120) AS dataDesignacaoArbitro,
         m.SentencaArbitralUrl AS sentencaArbitralUrl, CONVERT(varchar(10), m.DataSentencaArbitral, 120) AS dataSentencaArbitral,
         m.ProcessoDisciplinarBifurcadoId AS processoDisciplinarBifurcadoId
  FROM MediacoesArbitragens m
  LEFT JOIN MembroReferencia pa ON pa.MembroId = m.ParteAId
  LEFT JOIN MembroReferencia pb ON pb.MembroId = m.ParteBId
  LEFT JOIN MembroReferencia mediador ON mediador.MembroId = m.MediadorId
  LEFT JOIN MembroReferencia arbitro ON arbitro.MembroId = m.ArbitroId`;

function comPrazo(mediacao, hoje) {
  const prazo = mediacaoArbitragem.avaliarPrazoEncerramento(mediacao.dataInstauracao, mediacao.prazoDiasEncerramento, hoje);
  return Object.assign({}, mediacao, prazo);
}

async function candidatoHabilitado(pool, membroId, papelNecessario) {
  const r = await pool.request().input("id", sql.Int, membroId).query(`
    SELECT Papel FROM CatalogoMediadoresArbitros WHERE MembroId = @id AND Ativo = 1
  `);
  const linha = r.recordset[0];
  return !!linha && (linha.Papel === papelNecessario || linha.Papel === "AMBOS");
}

async function uploadArquivo(base64, mimeType, context) {
  if (!mimeType || !MIME_PERMITIDOS.includes(mimeType)) return { erro: `Formato inválido. Use um de: ${MIME_PERMITIDOS.join(", ")}.` };
  let buffer;
  try { buffer = Buffer.from(base64, "base64"); } catch (e) { return { erro: "Arquivo inválido." }; }
  if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO_BYTES) return { erro: "Arquivo vazio ou maior que 15 MB." };
  try {
    const url = await storage.salvarDocumento(buffer, mimeType);
    return { url };
  } catch (erro) {
    context.log.error("Falha ao salvar arquivo no Blob Storage:", erro.message);
    return { erro: "Falha ao salvar o arquivo. Avise a equipe técnica: " + erro.message };
  }
}

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const acao = context.bindingData.acao;
  const pool = await getPool();
  const hoje = new Date().toISOString().slice(0, 10);

  if (req.method === "POST" && !id) {
    const usuario = auth.exigirLogin(req, context);
    if (!usuario) return;
    const { assunto, parteAId, parteADescricao, parteBId, parteBDescricao, valorEnvolvido, prazoDiasEncerramento } = req.body || {};
    if (!assunto || !String(assunto).trim() || !prazoDiasEncerramento) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: assunto, prazoDiasEncerramento." } };
      return;
    }
    if (!parteAId && !String(parteADescricao || "").trim()) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Informe a Parte A: matrícula (se for membro) ou descrição (ex: nome da congregação/departamento)." } };
      return;
    }
    if (!parteBId && !String(parteBDescricao || "").trim()) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Informe a Parte B: matrícula (se for membro) ou descrição." } };
      return;
    }
    const result = await pool.request()
      .input("assunto", sql.NVarChar(500), String(assunto).trim())
      .input("parteAId", sql.Int, parteAId || null).input("parteADescricao", sql.NVarChar(200), String(parteADescricao || "").trim() || null)
      .input("parteBId", sql.Int, parteBId || null).input("parteBDescricao", sql.NVarChar(200), String(parteBDescricao || "").trim() || null)
      .input("valorEnvolvido", sql.Decimal(12, 2), valorEnvolvido || null)
      .input("prazoDiasEncerramento", sql.Int, prazoDiasEncerramento)
      .input("instauradoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO MediacoesArbitragens (Assunto, ParteAId, ParteADescricao, ParteBId, ParteBDescricao, ValorEnvolvido, PrazoDiasEncerramento, InstauradoPor)
              OUTPUT INSERTED.MediacaoId
              VALUES (@assunto, @parteAId, @parteADescricao, @parteBId, @parteBDescricao, @valorEnvolvido, @prazoDiasEncerramento, @instauradoPor)`);
    const mediacaoId = result.recordset[0].MediacaoId;
    await registrarAuditoria({ tabela: "MediacoesArbitragens", registroId: mediacaoId, acao: "Instaurou mediação", usuarioId: usuario.membroId, dadosDepois: { assunto, valorEnvolvido: valorEnvolvido || null } });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Mediação instaurada.", mediacaoId } };
    return;
  }

  if (req.method === "POST" && id && acao === "sessoes") {
    const usuario = auth.exigirPermissao(req, context, "mediacao");
    if (!usuario) return;
    const { dataSessao, parteACompareceu, parteBCompareceu, observacoes } = req.body || {};
    if (!dataSessao) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe dataSessao." } };
      return;
    }
    const criada = await pool.request()
      .input("mediacaoId", sql.Int, id).input("dataSessao", sql.Date, dataSessao)
      .input("parteACompareceu", sql.Bit, parteACompareceu == null ? null : !!parteACompareceu)
      .input("parteBCompareceu", sql.Bit, parteBCompareceu == null ? null : !!parteBCompareceu)
      .input("observacoes", sql.NVarChar(500), observacoes || null)
      .query(`INSERT INTO SessoesMediacao (MediacaoId, DataSessao, ParteACompareceu, ParteBCompareceu, Observacoes)
              OUTPUT INSERTED.SessaoMediacaoId VALUES (@mediacaoId, @dataSessao, @parteACompareceu, @parteBCompareceu, @observacoes)`);
    await registrarAuditoria({ tabela: "SessoesMediacao", registroId: criada.recordset[0].SessaoMediacaoId, acao: "Registrou sessão de mediação", usuarioId: usuario.membroId, dadosDepois: { mediacaoId: Number(id), dataSessao } });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Sessão registrada." } };
    return;
  }

  if (req.method === "GET" && !id) {
    const usuario = auth.exigirPermissao(req, context, "mediacao");
    if (!usuario) return;
    const result = await pool.request().query(`${SELECT_MEDIACAO} ORDER BY m.DataInstauracao DESC`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset.map((m) => comPrazo(m, hoje)) };
    return;
  }

  if (req.method === "GET" && id && !acao) {
    const usuario = auth.exigirPermissao(req, context, "mediacao");
    if (!usuario) return;
    const mediacao = (await pool.request().input("id", sql.Int, id).query(`${SELECT_MEDIACAO} WHERE m.MediacaoId = @id`)).recordset[0];
    if (!mediacao) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Caso não encontrado." } };
      return;
    }
    const sessoes = (await pool.request().input("id", sql.Int, id).query(`
      SELECT SessaoMediacaoId AS sessaoMediacaoId, CONVERT(varchar(10), DataSessao, 120) AS dataSessao,
             ParteACompareceu AS parteACompareceu, ParteBCompareceu AS parteBCompareceu, Observacoes AS observacoes
      FROM SessoesMediacao WHERE MediacaoId = @id ORDER BY DataSessao
    `)).recordset;
    const comSessoes = Object.assign(comPrazo(mediacao, hoje), { sessoes });
    if (comSessoes.sentencaArbitralUrl) comSessoes.sentencaArbitralUrl = storage.urlDocumentoComSas(comSessoes.sentencaArbitralUrl);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: comSessoes };
    return;
  }

  if (req.method === "PUT" && id && !acao) {
    const usuario = auth.exigirPermissao(req, context, "mediacao");
    if (!usuario) return;
    const mediacao = (await pool.request().input("id", sql.Int, id).query(`SELECT * FROM MediacoesArbitragens WHERE MediacaoId = @id`)).recordset[0];
    if (!mediacao) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Caso não encontrado." } };
      return;
    }
    const { acao: acaoPut } = req.body || {};
    const contexto = { mediacaoId: mediacao.MediacaoId, assunto: mediacao.Assunto, parteAId: mediacao.ParteAId, parteBId: mediacao.ParteBId };

    if (acaoPut === "DESIGNAR_MEDIADOR") {
      const { mediadorId } = req.body || {};
      if (!mediadorId) { context.res = { status: 400, body: { sucesso: false, mensagem: "Informe mediadorId." } }; return; }
      if (!(await candidatoHabilitado(pool, mediadorId, "MEDIADOR"))) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta matrícula não está no catálogo de mediadores ativos." } };
        return;
      }
      const impedimento = await mediacaoArbitragem.calcularImpedimento(pool, mediadorId, contexto);
      if (impedimento.impedido) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Mediador impedido: ${impedimento.motivo}` } };
        return;
      }
      await pool.request().input("id", sql.Int, id).input("mediadorId", sql.Int, mediadorId)
        .query(`UPDATE MediacoesArbitragens SET MediadorId = @mediadorId, DataDesignacaoMediador = CAST(SYSUTCDATETIME() AS DATE) WHERE MediacaoId = @id`);
      await registrarAuditoria({ tabela: "MediacoesArbitragens", registroId: Number(id), acao: "Designou mediador", usuarioId: usuario.membroId, dadosDepois: { mediadorId } });
      context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Mediador designado." } };
      return;
    }

    if (acaoPut === "REGISTRAR_ACORDO") {
      if (mediacao.Status !== "MEDIACAO_EM_CURSO") { context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível registrar acordo com a mediação em curso." } }; return; }
      if (!mediacao.MediadorId) { context.res = { status: 200, body: { sucesso: false, mensagem: "Designe um mediador antes de registrar o acordo." } }; return; }
      const { resumoAcordo, saidaVinculadaId } = req.body || {};
      if (!resumoAcordo || !String(resumoAcordo).trim()) { context.res = { status: 400, body: { sucesso: false, mensagem: "Informe resumoAcordo." } }; return; }

      let termoA = null, termoB = null;
      if (mediacao.ParteAId) termoA = await mediacaoArbitragem.registrarAceiteAcordoMediacao(pool, mediacao.ParteAId, resumoAcordo.trim());
      if (mediacao.ParteBId) termoB = await mediacaoArbitragem.registrarAceiteAcordoMediacao(pool, mediacao.ParteBId, resumoAcordo.trim());

      await pool.request().input("id", sql.Int, id).input("termoA", sql.Int, termoA).input("termoB", sql.Int, termoB).input("saidaId", sql.Int, saidaVinculadaId || null)
        .query(`UPDATE MediacoesArbitragens SET Status = 'MEDIACAO_ACORDO', DataEncerramentoMediacao = CAST(SYSUTCDATETIME() AS DATE),
                       TermoAcordoParteAAssinadoId = @termoA, TermoAcordoParteBAssinadoId = @termoB, SaidaVinculadaId = @saidaId
                WHERE MediacaoId = @id`);
      await registrarAuditoria({ tabela: "MediacoesArbitragens", registroId: Number(id), acao: "Registrou acordo de mediação", usuarioId: usuario.membroId, dadosDepois: { resumoAcordo: resumoAcordo.trim(), saidaVinculadaId: saidaVinculadaId || null } });
      context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Acordo registrado — mediação encerrada com acordo." } };
      return;
    }

    if (acaoPut === "MEDIACAO_SEM_ACORDO") {
      if (mediacao.Status !== "MEDIACAO_EM_CURSO") { context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível encerrar sem acordo uma mediação em curso." } }; return; }
      const { motivo } = req.body || {};
      if (!motivo || !String(motivo).trim()) { context.res = { status: 400, body: { sucesso: false, mensagem: "Informe motivo." } }; return; }
      await pool.request().input("id", sql.Int, id)
        .query(`UPDATE MediacoesArbitragens SET Status = 'MEDIACAO_SEM_ACORDO', DataEncerramentoMediacao = CAST(SYSUTCDATETIME() AS DATE) WHERE MediacaoId = @id`);
      await registrarAuditoria({ tabela: "MediacoesArbitragens", registroId: Number(id), acao: "Encerrou mediação sem acordo", usuarioId: usuario.membroId, dadosDepois: { motivo: motivo.trim() } });
      context.res = { status: 200, body: { sucesso: true, mensagem: "Mediação encerrada sem acordo — via de arbitragem liberada (Art. 161-A)." } };
      return;
    }

    if (acaoPut === "DESIGNAR_ARBITRO") {
      // Trava real: arbitragem só abre com mediação encerrada SEM acordo
      // (Art. 161-A e Lei 9.307/1996) — nunca pulando etapa.
      if (mediacao.Status !== "MEDIACAO_SEM_ACORDO") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível abrir arbitragem depois da mediação encerrar SEM acordo." } };
        return;
      }
      const { arbitroId } = req.body || {};
      if (!arbitroId) { context.res = { status: 400, body: { sucesso: false, mensagem: "Informe arbitroId." } }; return; }
      if (!(await candidatoHabilitado(pool, arbitroId, "ARBITRO"))) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta matrícula não está no catálogo de árbitros ativos." } };
        return;
      }
      const impedimento = await mediacaoArbitragem.calcularImpedimento(pool, arbitroId, contexto);
      if (impedimento.impedido) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Árbitro impedido: ${impedimento.motivo}` } };
        return;
      }
      await pool.request().input("id", sql.Int, id).input("arbitroId", sql.Int, arbitroId)
        .query(`UPDATE MediacoesArbitragens SET ArbitroId = @arbitroId, DataDesignacaoArbitro = CAST(SYSUTCDATETIME() AS DATE), Status = 'ARBITRAGEM_EM_CURSO' WHERE MediacaoId = @id`);
      await registrarAuditoria({ tabela: "MediacoesArbitragens", registroId: Number(id), acao: "Designou árbitro", usuarioId: usuario.membroId, dadosDepois: { arbitroId } });
      context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Árbitro designado — arbitragem em curso." } };
      return;
    }

    if (acaoPut === "REGISTRAR_COMPROMISSO_ARBITRAL") {
      if (mediacao.Status !== "ARBITRAGEM_EM_CURSO") { context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível registrar compromisso arbitral com a arbitragem em curso." } }; return; }
      let termoA = null, termoB = null;
      if (mediacao.ParteAId) termoA = await mediacaoArbitragem.registrarCompromissoArbitral(pool, mediacao.ParteAId, mediacao.Assunto);
      if (mediacao.ParteBId) termoB = await mediacaoArbitragem.registrarCompromissoArbitral(pool, mediacao.ParteBId, mediacao.Assunto);
      await pool.request().input("id", sql.Int, id).input("termoA", sql.Int, termoA).input("termoB", sql.Int, termoB)
        .query(`UPDATE MediacoesArbitragens SET CompromissoArbitralParteAAssinadoId = @termoA, CompromissoArbitralParteBAssinadoId = @termoB WHERE MediacaoId = @id`);
      await registrarAuditoria({ tabela: "MediacoesArbitragens", registroId: Number(id), acao: "Registrou compromisso arbitral", usuarioId: usuario.membroId });
      context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Compromisso arbitral registrado." } };
      return;
    }

    if (acaoPut === "REGISTRAR_SENTENCA") {
      if (mediacao.Status !== "ARBITRAGEM_EM_CURSO") { context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível registrar sentença com a arbitragem em curso." } }; return; }
      const { sentencaBase64, mimeType } = req.body || {};
      if (!sentencaBase64 || !mimeType) { context.res = { status: 400, body: { sucesso: false, mensagem: "Anexe a sentença arbitral." } }; return; }
      const { erro, url } = await uploadArquivo(sentencaBase64, mimeType, context);
      if (erro) { context.res = { status: 400, body: { sucesso: false, mensagem: erro } }; return; }
      await pool.request().input("id", sql.Int, id).input("url", sql.NVarChar(500), url)
        .query(`UPDATE MediacoesArbitragens SET SentencaArbitralUrl = @url, DataSentencaArbitral = CAST(SYSUTCDATETIME() AS DATE), Status = 'ARBITRAGEM_SENTENCA' WHERE MediacaoId = @id`);
      await registrarAuditoria({ tabela: "MediacoesArbitragens", registroId: Number(id), acao: "Registrou sentença arbitral", usuarioId: usuario.membroId });
      context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Sentença arbitral registrada (Lei 9.307/1996, art. 18/31 — produz efeitos de sentença judicial, sem necessidade de homologação)." } };
      return;
    }

    if (acaoPut === "BIFURCAR_DISCIPLINAR") {
      const { orgaoResponsavelId, orgaoLocalId, infracoesIds, membroId } = req.body || {};
      if (!membroId) { context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId (quem responde ao processo disciplinar bifurcado)." } }; return; }
      const resultadoProcesso = await mediacaoArbitragem.bifurcarParaProcessoDisciplinar(pool, contexto, { membroId, orgaoResponsavelId, orgaoLocalId, infracoesIds }, usuario.membroId);
      if (!resultadoProcesso.sucesso) { context.res = { status: 200, body: resultadoProcesso }; return; }
      await pool.request().input("id", sql.Int, id).input("processoId", sql.Int, resultadoProcesso.processoId)
        .query(`UPDATE MediacoesArbitragens SET ProcessoDisciplinarBifurcadoId = @processoId WHERE MediacaoId = @id`);
      await registrarAuditoria({ tabela: "MediacoesArbitragens", registroId: Number(id), acao: "Bifurcou pra processo disciplinar", usuarioId: usuario.membroId, dadosDepois: { processoId: resultadoProcesso.processoId } });
      context.res = { status: 200, body: { sucesso: true, mensagem: "✅ Bifurcado — processo disciplinar separado aberto, a mediação/arbitragem continua seu curso normalmente.", processoId: resultadoProcesso.processoId } };
      return;
    }

    context.res = { status: 400, body: { sucesso: false, mensagem: "Ação inválida." } };
    return;
  }

  context.res = { status: 400, body: { sucesso: false, mensagem: "Requisição inválida." } };
};
