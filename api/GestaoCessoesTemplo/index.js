// GestaoCessoesTemplo (v4.18 — Cessão de templo a terceiros)
// Art. 156: o templo pode ser cedido a eventos da comunidade como concessão
// precária — aprovação da Diretoria, censura musical (lista aprovada 48h),
// Taxa de Zeladoria (ressarcimento, não aluguel), Termo de Responsabilidade
// por danos e vedação a comércio/coaches. A cobrança vira Conta a Receber (v4.6).
// Dado de CONGREGAÇÃO (CessoesTemplo.CongregacaoId): o tesoureiro lista, registra e conduz as cessões
// das congregações do SEU escopo (auth.estaNoEscopo); cessão de outra congregação responde igual a "não encontrada".
// Autorizar é da Diretoria (nível geral: papel Global + escopo TODAS). Cada ação só vale a partir de um
// estado: AUTORIZAR/REJEITAR de SOLICITADA, CONCLUIR de AUTORIZADA, CANCELAR de SOLICITADA ou AUTORIZADA
// (e, com a cobrança já gerada, só o nível geral cancela).
// GET  /api/cessoes-templo -> lista (só as do escopo)
// POST /api/cessoes-templo -> { congregacaoId, solicitanteNome, solicitanteContato?, tipoEvento, dataEvento, horaInicio?, horaFim?, taxaZeladoria, isencaoTaxa?, listaMusicalAprovada?, termoResponsabilidadeBase64?, mimeType? }
// PUT  /api/cessoes-templo/{id} -> { acao: 'AUTORIZAR'|'REJEITAR'|'CONCLUIR'|'CANCELAR', motivo? }
const auth = require("../shared/auth");
const { ehGeral, congregacaoNoEscopo } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const { validarIsencaoSocial } = require("../shared/assistenciaSocial");
const { idOpcional, decodificarArquivo } = require("../shared/financeiro1Util");

const TIPOS_EVENTO = ["CASAMENTO", "VELORIO", "EVENTO_SOCIAL", "OUTROS"];
const ACOES = ["AUTORIZAR", "REJEITAR", "CONCLUIR", "CANCELAR"];
const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAXA_MAXIMA = 99999999.99; // DECIMAL(10,2)
const NAO_ENCONTRADA = { sucesso: false, mensagem: "Cessão não encontrada." };

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  // Id malformado recebe a mesma resposta de "não existe".
  const { tem: temId, id } = idOpcional(context.bindingData.id);
  if (temId && !id) {
    context.res = { status: 200, body: NAO_ENCONTRADA };
    return;
  }
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const result = await pool.request().query(`
      SELECT c.CessaoId AS cessaoId, c.CongregacaoId AS congregacaoId, cg.Nome AS congregacaoNome,
             c.SolicitanteNome AS solicitanteNome, c.TipoEvento AS tipoEvento, c.DataEvento AS dataEvento,
             c.TaxaZeladoria AS taxaZeladoria, c.IsencaoTaxa AS isencaoTaxa, c.ListaMusicalAprovada AS listaMusicalAprovada,
             c.Status AS status, c.ContaReceberId AS contaReceberId,
             c.FinalidadeAcaoSocial AS finalidadeAcaoSocial, c.MotivoIsencaoSocial AS motivoIsencaoSocial,
             c.AssistenciaSocialFamiliaId AS assistenciaSocialFamiliaId
      FROM CessoesTemplo c JOIN Congregacoes cg ON cg.CongregacaoId = c.CongregacaoId
      ORDER BY c.DataEvento DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset.filter(c => auth.estaNoEscopo(usuario, c.congregacaoNome)) };
    return;
  }

  if (req.method === "POST") {
    const corpo = req.body || {};
    const congregacaoId = auth.idDeRota(corpo.congregacaoId);
    const { solicitanteNome, solicitanteContato, tipoEvento, dataEvento, horaInicio, horaFim, taxaZeladoria, isencaoTaxa, listaMusicalAprovada, termoResponsabilidadeBase64, mimeType, finalidadeAcaoSocial, motivoIsencaoSocial, assistenciaSocialFamiliaId } = corpo;
    if (!congregacaoId || typeof solicitanteNome !== "string" || !solicitanteNome.trim() || !tipoEvento || !dataEvento) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: congregacaoId, solicitanteNome, tipoEvento, dataEvento." } };
      return;
    }
    if (!TIPOS_EVENTO.includes(tipoEvento)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `tipoEvento inválido. Use um de: ${TIPOS_EVENTO.join(", ")}.` } };
      return;
    }
    // Só se registra cessão em congregação do próprio escopo; congregação inexistente e congregação de fora respondem igual.
    if (!(await congregacaoNoEscopo(pool, usuario, congregacaoId))) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Congregação não encontrada." } };
      return;
    }
    let taxa = 0;
    if (taxaZeladoria !== undefined && taxaZeladoria !== null && taxaZeladoria !== "") {
      taxa = (typeof taxaZeladoria === "number" || typeof taxaZeladoria === "string") ? Number(taxaZeladoria) : NaN;
      if (!Number.isFinite(taxa) || taxa < 0 || taxa > TAXA_MAXIMA) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "taxaZeladoria inválida." } };
        return;
      }
    }
    // v5.9 — isenção de taxa por ação social (Art. 156 §3º, III) exige
    // justificativa registrada; nunca isenta "de graça" (shared/assistenciaSocial.js).
    const validacaoIsencao = validarIsencaoSocial({ finalidadeAcaoSocial, isencaoTaxa, motivoIsencaoSocial });
    if (!validacaoIsencao.valido) {
      context.res = { status: 400, body: { sucesso: false, mensagem: validacaoIsencao.mensagem } };
      return;
    }
    // A família da assistência social vinculada precisa ser da MESMA congregação da cessão (dado sensível: não se liga a família de outra unidade).
    let familiaId = null;
    if (assistenciaSocialFamiliaId) {
      familiaId = auth.idDeRota(assistenciaSocialFamiliaId);
      const familia = familiaId ? await pool.request().input("id", sql.Int, familiaId).query(`SELECT CongregacaoId FROM AssistenciaSocialFamilias WHERE FamiliaId = @id`) : { recordset: [] };
      if (familia.recordset.length === 0 || Number(familia.recordset[0].CongregacaoId) !== congregacaoId) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Família da assistência social não encontrada nesta congregação." } };
        return;
      }
    }
    let termoUrl = null;
    if (termoResponsabilidadeBase64) {
      if (!mimeType || !MIME_PERMITIDOS.includes(mimeType)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Formato de termo inválido." } };
        return;
      }
      const buffer = decodificarArquivo(termoResponsabilidadeBase64);
      if (!buffer) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Arquivo do termo vazio ou maior que 15 MB." } };
        return;
      }
      try { termoUrl = await storage.salvarDocumento(buffer, mimeType); } catch (erro) {
        context.log.error("Falha ao salvar o termo de responsabilidade:", erro.message);
        context.res = { status: 500, body: { sucesso: false, mensagem: "Falha ao salvar o termo. Tente de novo ou avise a equipe técnica." } };
        return;
      }
    }
    const criada = await pool.request().input("cong", sql.Int, congregacaoId).input("nome", sql.NVarChar(200), solicitanteNome.trim())
      .input("contato", sql.NVarChar(200), solicitanteContato || null).input("tipo", sql.NVarChar(20), tipoEvento)
      .input("data", sql.Date, dataEvento).input("ini", sql.NVarChar(5), horaInicio || null).input("fim", sql.NVarChar(5), horaFim || null)
      .input("taxa", sql.Decimal(10, 2), taxa).input("isento", sql.Bit, isencaoTaxa ? 1 : 0)
      .input("lista", sql.Bit, listaMusicalAprovada ? 1 : 0).input("termo", sql.NVarChar(500), termoUrl).input("por", sql.Int, usuario.membroId)
      .input("finalidadeSocial", sql.Bit, finalidadeAcaoSocial ? 1 : 0).input("motivoIsencaoSocial", sql.NVarChar(300), motivoIsencaoSocial || null)
      .input("familiaId", sql.Int, familiaId)
      .query(`INSERT INTO CessoesTemplo (CongregacaoId, SolicitanteNome, SolicitanteContato, TipoEvento, DataEvento, HoraInicio, HoraFim, TaxaZeladoria, IsencaoTaxa, ListaMusicalAprovada, TermoResponsabilidadeUrl, RegistradoPor, FinalidadeAcaoSocial, MotivoIsencaoSocial, AssistenciaSocialFamiliaId)
              OUTPUT INSERTED.CessaoId VALUES (@cong, @nome, @contato, @tipo, @data, @ini, @fim, @taxa, @isento, @lista, @termo, @por, @finalidadeSocial, @motivoIsencaoSocial, @familiaId)`);
    await registrarAuditoria({
      tabela: "CessoesTemplo", registroId: criada.recordset[0].CessaoId, acao: "Registrou solicitação de cessão de templo", usuarioId: usuario.membroId,
      dadosDepois: { congregacaoId, solicitanteNome, tipoEvento, dataEvento, taxaZeladoria: taxa, finalidadeAcaoSocial: !!finalidadeAcaoSocial }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Solicitação de cessão registrada — aguardando aprovação da Diretoria.", cessaoId: criada.recordset[0].CessaoId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o id na rota: /api/cessoes-templo/{id}" } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`
      SELECT c.*, cg.Nome AS CongregacaoNome FROM CessoesTemplo c
      JOIN Congregacoes cg ON cg.CongregacaoId = c.CongregacaoId WHERE c.CessaoId = @id
    `);
    // Cessão inexistente e cessão de outra congregação: a MESMA resposta.
    if (atual.recordset.length === 0 || !auth.estaNoEscopo(usuario, atual.recordset[0].CongregacaoNome)) {
      context.res = { status: 200, body: NAO_ENCONTRADA };
      return;
    }
    const registro = atual.recordset[0];
    const { acao, motivo } = req.body || {};
    if (!ACOES.includes(acao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Ação inválida. Use uma de: ${ACOES.join(", ")}.` } };
      return;
    }

    if (acao === "AUTORIZAR") {
      if (!ehGeral(usuario)) {
        context.res = { status: 403, body: { sucesso: false, mensagem: "Aprovar cessão de templo é matéria da Diretoria — restrito ao nível geral." } };
        return;
      }
      if (registro.Status !== "SOLICITADA") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta solicitação não está mais pendente." } };
        return;
      }
      if (!registro.ListaMusicalAprovada) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Lista musical ainda não aprovada (censura musical, Art. 156 §1º I — 48h de antecedência)." } };
        return;
      }
      if (!registro.TermoResponsabilidadeUrl) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Termo de Responsabilidade por danos não anexado (Art. 156 §4º II)." } };
        return;
      }
      // A autorização, a Conta a Receber e a Receita Acessória entram juntas ou não entram; a transição SOLICITADA→AUTORIZADA vem primeiro e com o estado no WHERE, então dois
      // cliques simultâneos não geram duas cobranças.
      const transaction = new sql.Transaction(pool);
      const r = () => new sql.Request(transaction);
      await transaction.begin();
      let contaReceberId = null;
      try {
        const reservou = await r().input("id", sql.Int, id).input("aprovadoPor", sql.Int, usuario.membroId)
          .query(`UPDATE CessoesTemplo SET Status = 'AUTORIZADA', AprovadoPor = @aprovadoPor WHERE CessaoId = @id AND Status = 'SOLICITADA'`);
        if (reservou.rowsAffected && reservou.rowsAffected[0] === 0) {
          await transaction.rollback();
          context.res = { status: 200, body: { sucesso: false, mensagem: "Esta solicitação não está mais pendente." } };
          return;
        }
        if (Number(registro.TaxaZeladoria) > 0 && !registro.IsencaoTaxa) {
          const conta = await r().input("cong", sql.Int, registro.CongregacaoId).input("nome", sql.NVarChar(200), registro.SolicitanteNome)
            .input("tipo", sql.NVarChar(30), "CESSAO_TEMPLO").input("descricao", sql.NVarChar(300), "Taxa de Zeladoria — Cessão de templo")
            .input("valor", sql.Decimal(10, 2), registro.TaxaZeladoria).input("venc", sql.Date, registro.DataEvento).input("por", sql.Int, usuario.membroId)
            .query(`INSERT INTO ContasAReceber (CongregacaoId, NomeAvulso, Tipo, Descricao, Valor, DataVencimento, RegistradoPor)
                    OUTPUT INSERTED.ContaReceberId VALUES (@cong, @nome, @tipo, @descricao, @valor, @venc, @por)`);
          contaReceberId = conta.recordset[0].ContaReceberId;
          // v4.21: cessão onerosa é receita acessória — nasce já com o destino
          // declarado (Súmula Vinculante 52), não como entrada de caixa solta.
          await r().input("cong", sql.Int, registro.CongregacaoId).input("cessaoId", sql.Int, id)
            .input("evento", sql.NVarChar(300), `${registro.TipoEvento} — ${registro.SolicitanteNome}`)
            .input("valor", sql.Decimal(12, 2), registro.TaxaZeladoria).input("data", sql.Date, registro.DataEvento)
            .input("aplicacao", sql.NVarChar(500), "Taxa de Zeladoria — ressarcimento de custos operacionais de manutenção do templo (energia, água, limpeza, segurança), aplicada integralmente nas atividades essenciais da congregação.")
            .input("por", sql.Int, usuario.membroId)
            .query(`INSERT INTO ReceitasAcessorias (CongregacaoId, Tipo, CessaoTemploId, EventoDescricao, Valor, DataRecebimento, AplicacaoFinalisticaDescricao, RegistradoPor)
                    VALUES (@cong, 'CESSAO_SALAO', @cessaoId, @evento, @valor, @data, @aplicacao, @por)`);
          await r().input("id", sql.Int, id).input("conta", sql.Int, contaReceberId)
            .query(`UPDATE CessoesTemplo SET ContaReceberId = @conta WHERE CessaoId = @id`);
        }
        await transaction.commit();
      } catch (erro) {
        try { await transaction.rollback(); } catch (e) { /* a transação já pode ter sido desfeita */ }
        context.log.error("Falha ao autorizar a cessão de templo:", erro.message);
        context.res = { status: 500, body: { sucesso: false, mensagem: "Não foi possível autorizar a cessão — nada foi gravado. Tente de novo ou avise a equipe técnica." } };
        return;
      }
      await registrarAuditoria({
        tabela: "CessoesTemplo", registroId: id, acao: "Autorizou cessão de templo", usuarioId: usuario.membroId,
        dadosDepois: { taxaZeladoria: registro.TaxaZeladoria, contaReceberId }
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Cessão autorizada." + (contaReceberId ? " Conta a Receber gerada (Taxa de Zeladoria)." : "") } };
      return;
    }

    if (acao === "REJEITAR") {
      if (typeof motivo !== "string" || !motivo.trim()) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o motivo da rejeição." } };
        return;
      }
      if (registro.Status !== "SOLICITADA") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível rejeitar uma cessão que ainda está solicitada." } };
        return;
      }
      const rejeitou = await pool.request().input("id", sql.Int, id).input("motivo", sql.NVarChar(300), motivo.trim())
        .query(`UPDATE CessoesTemplo SET Status = 'REJEITADA', MotivoRejeicao = @motivo WHERE CessaoId = @id AND Status = 'SOLICITADA'`);
      if (rejeitou.rowsAffected && rejeitou.rowsAffected[0] === 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível rejeitar uma cessão que ainda está solicitada." } };
        return;
      }
      await registrarAuditoria({ tabela: "CessoesTemplo", registroId: id, acao: "Rejeitou cessão de templo", usuarioId: usuario.membroId, dadosDepois: { motivo } });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "Cessão rejeitada." } };
      return;
    }

    // CONCLUIR só depois de AUTORIZADA (não pula a aprovação da Diretoria); CANCELAR de SOLICITADA ou AUTORIZADA.
    const estadosDeOrigem = acao === "CONCLUIR" ? ["AUTORIZADA"] : ["SOLICITADA", "AUTORIZADA"];
    if (!estadosDeOrigem.includes(registro.Status)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: acao === "CONCLUIR" ? "Só é possível concluir uma cessão já autorizada." : "Só é possível cancelar uma cessão solicitada ou autorizada." } };
      return;
    }
    // Cessão já autorizada com cobrança gerada (Conta a Receber) só o nível geral cancela: o cancelamento mexe no financeiro da congregação.
    if (acao === "CANCELAR" && registro.ContaReceberId != null && !ehGeral(usuario)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Cancelar uma cessão que já gerou cobrança é da administração geral." } };
      return;
    }
    const novoStatus = acao === "CONCLUIR" ? "CONCLUIDA" : "CANCELADA";
    const mudou = await pool.request().input("id", sql.Int, id).input("status", sql.NVarChar(20), novoStatus)
      .query(`UPDATE CessoesTemplo SET Status = @status WHERE CessaoId = @id AND Status IN (${estadosDeOrigem.map(e => `'${e}'`).join(", ")})`);
    if (mudou.rowsAffected && mudou.rowsAffected[0] === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: acao === "CONCLUIR" ? "Só é possível concluir uma cessão já autorizada." : "Só é possível cancelar uma cessão solicitada ou autorizada." } };
      return;
    }
    await registrarAuditoria({
      tabela: "CessoesTemplo", registroId: id, acao: acao === "CONCLUIR" ? "Concluiu cessão de templo" : "Cancelou cessão de templo", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Cessão ${novoStatus.toLowerCase()}.` } };
    return;
  }
};

