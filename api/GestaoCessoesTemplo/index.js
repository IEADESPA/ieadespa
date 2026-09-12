// GestaoCessoesTemplo (v4.18 — Cessão de templo a terceiros)
// Art. 156: o templo pode ser cedido a eventos da comunidade como concessão
// precária — aprovação da Diretoria, censura musical (lista aprovada 48h),
// Taxa de Zeladoria (ressarcimento, não aluguel), Termo de Responsabilidade
// por danos e vedação a comércio/coaches. A cobrança vira Conta a Receber (v4.6).
// GET  /api/cessoes-templo -> lista
// POST /api/cessoes-templo -> { congregacaoId, solicitanteNome, solicitanteContato?, tipoEvento, dataEvento, horaInicio?, horaFim?, taxaZeladoria, isencaoTaxa?, listaMusicalAprovada?, termoResponsabilidadeBase64?, mimeType? }
// PUT  /api/cessoes-templo/{id} -> { acao: 'AUTORIZAR'|'REJEITAR'|'CONCLUIR'|'CANCELAR', motivo? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");

const TIPOS_EVENTO = ["CASAMENTO", "VELORIO", "EVENTO_SOCIAL", "OUTROS"];
const ACOES = ["AUTORIZAR", "REJEITAR", "CONCLUIR", "CANCELAR"];
const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const result = await pool.request().query(`
      SELECT c.CessaoId AS cessaoId, c.CongregacaoId AS congregacaoId, cg.Nome AS congregacaoNome,
             c.SolicitanteNome AS solicitanteNome, c.TipoEvento AS tipoEvento, c.DataEvento AS dataEvento,
             c.TaxaZeladoria AS taxaZeladoria, c.IsencaoTaxa AS isencaoTaxa, c.ListaMusicalAprovada AS listaMusicalAprovada,
             c.Status AS status, c.ContaReceberId AS contaReceberId
      FROM CessoesTemplo c JOIN Congregacoes cg ON cg.CongregacaoId = c.CongregacaoId
      ORDER BY c.DataEvento DESC
    `);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset };
    return;
  }

  if (req.method === "POST") {
    const { congregacaoId, solicitanteNome, solicitanteContato, tipoEvento, dataEvento, horaInicio, horaFim, taxaZeladoria, isencaoTaxa, listaMusicalAprovada, termoResponsabilidadeBase64, mimeType } = req.body || {};
    if (!congregacaoId || !solicitanteNome || !solicitanteNome.trim() || !tipoEvento || !dataEvento) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: congregacaoId, solicitanteNome, tipoEvento, dataEvento." } };
      return;
    }
    if (!TIPOS_EVENTO.includes(tipoEvento)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `tipoEvento inválido. Use um de: ${TIPOS_EVENTO.join(", ")}.` } };
      return;
    }
    let termoUrl = null;
    if (termoResponsabilidadeBase64) {
      if (!mimeType || !MIME_PERMITIDOS.includes(mimeType)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Formato de termo inválido." } };
        return;
      }
      termoUrl = await storage.salvarDocumento(Buffer.from(termoResponsabilidadeBase64, "base64"), mimeType);
    }
    const criada = await pool.request().input("cong", sql.Int, congregacaoId).input("nome", sql.NVarChar(200), solicitanteNome.trim())
      .input("contato", sql.NVarChar(200), solicitanteContato || null).input("tipo", sql.NVarChar(20), tipoEvento)
      .input("data", sql.Date, dataEvento).input("ini", sql.NVarChar(5), horaInicio || null).input("fim", sql.NVarChar(5), horaFim || null)
      .input("taxa", sql.Decimal(10, 2), taxaZeladoria || 0).input("isento", sql.Bit, isencaoTaxa ? 1 : 0)
      .input("lista", sql.Bit, listaMusicalAprovada ? 1 : 0).input("termo", sql.NVarChar(500), termoUrl).input("por", sql.Int, usuario.membroId)
      .query(`INSERT INTO CessoesTemplo (CongregacaoId, SolicitanteNome, SolicitanteContato, TipoEvento, DataEvento, HoraInicio, HoraFim, TaxaZeladoria, IsencaoTaxa, ListaMusicalAprovada, TermoResponsabilidadeUrl, RegistradoPor)
              OUTPUT INSERTED.CessaoId VALUES (@cong, @nome, @contato, @tipo, @data, @ini, @fim, @taxa, @isento, @lista, @termo, @por)`);
    await registrarAuditoria({
      tabela: "CessoesTemplo", registroId: criada.recordset[0].CessaoId, acao: "Registrou solicitação de cessão de templo", usuarioId: usuario.membroId,
      dadosDepois: { congregacaoId, solicitanteNome, tipoEvento, dataEvento, taxaZeladoria }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Solicitação de cessão registrada — aguardando aprovação da Diretoria.", cessaoId: criada.recordset[0].CessaoId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/cessoes-templo/{id}" } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM CessoesTemplo WHERE CessaoId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Cessão não encontrada." } };
      return;
    }
    const registro = atual.recordset[0];
    const { acao, motivo } = req.body || {};
    if (!ACOES.includes(acao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Ação inválida. Use uma de: ${ACOES.join(", ")}.` } };
      return;
    }

    if (acao === "AUTORIZAR") {
      if (usuario.nivel !== "GLOBAL") {
        context.res = { status: 403, body: { sucesso: false, mensagem: "Aprovar cessão de templo é matéria da Diretoria — restrito a nível Global." } };
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
      let contaReceberId = null;
      if (Number(registro.TaxaZeladoria) > 0 && !registro.IsencaoTaxa) {
        const conta = await pool.request().input("cong", sql.Int, registro.CongregacaoId).input("nome", sql.NVarChar(200), registro.SolicitanteNome)
          .input("tipo", sql.NVarChar(30), "CESSAO_TEMPLO").input("descricao", sql.NVarChar(300), "Taxa de Zeladoria — Cessão de templo")
          .input("valor", sql.Decimal(10, 2), registro.TaxaZeladoria).input("venc", sql.Date, registro.DataEvento).input("por", sql.Int, usuario.membroId)
          .query(`INSERT INTO ContasAReceber (CongregacaoId, NomeAvulso, Tipo, Descricao, Valor, DataVencimento, RegistradoPor)
                  OUTPUT INSERTED.ContaReceberId VALUES (@cong, @nome, @tipo, @descricao, @valor, @venc, @por)`);
        contaReceberId = conta.recordset[0].ContaReceberId;
        // v4.21: cessão onerosa é receita acessória — nasce já com o destino
        // declarado (Súmula Vinculante 52), não como entrada de caixa solta.
        await pool.request().input("cong", sql.Int, registro.CongregacaoId).input("cessaoId", sql.Int, id)
          .input("evento", sql.NVarChar(300), `${registro.TipoEvento} — ${registro.SolicitanteNome}`)
          .input("valor", sql.Decimal(12, 2), registro.TaxaZeladoria).input("data", sql.Date, registro.DataEvento)
          .input("aplicacao", sql.NVarChar(500), "Taxa de Zeladoria — ressarcimento de custos operacionais de manutenção do templo (energia, água, limpeza, segurança), aplicada integralmente nas atividades essenciais da congregação.")
          .input("por", sql.Int, usuario.membroId)
          .query(`INSERT INTO ReceitasAcessorias (CongregacaoId, Tipo, CessaoTemploId, EventoDescricao, Valor, DataRecebimento, AplicacaoFinalisticaDescricao, RegistradoPor)
                  VALUES (@cong, 'CESSAO_SALAO', @cessaoId, @evento, @valor, @data, @aplicacao, @por)`);
      }
      await pool.request().input("id", sql.Int, id).input("aprovadoPor", sql.Int, usuario.membroId).input("conta", sql.Int, contaReceberId)
        .query(`UPDATE CessoesTemplo SET Status = 'AUTORIZADA', AprovadoPor = @aprovadoPor, ContaReceberId = @conta WHERE CessaoId = @id`);
      await registrarAuditoria({
        tabela: "CessoesTemplo", registroId: Number(id), acao: "Autorizou cessão de templo", usuarioId: usuario.membroId,
        dadosDepois: { taxaZeladoria: registro.TaxaZeladoria, contaReceberId }
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Cessão autorizada." + (contaReceberId ? " Conta a Receber gerada (Taxa de Zeladoria)." : "") } };
      return;
    }

    if (acao === "REJEITAR") {
      if (!motivo || !motivo.trim()) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o motivo da rejeição." } };
        return;
      }
      await pool.request().input("id", sql.Int, id).input("motivo", sql.NVarChar(300), motivo.trim())
        .query(`UPDATE CessoesTemplo SET Status = 'REJEITADA', MotivoRejeicao = @motivo WHERE CessaoId = @id`);
      await registrarAuditoria({ tabela: "CessoesTemplo", registroId: Number(id), acao: "Rejeitou cessão de templo", usuarioId: usuario.membroId, dadosDepois: { motivo } });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "Cessão rejeitada." } };
      return;
    }

    const novoStatus = acao === "CONCLUIR" ? "CONCLUIDA" : "CANCELADA";
    await pool.request().input("id", sql.Int, id).input("status", sql.NVarChar(20), novoStatus)
      .query(`UPDATE CessoesTemplo SET Status = @status WHERE CessaoId = @id`);
    await registrarAuditoria({
      tabela: "CessoesTemplo", registroId: Number(id), acao: acao === "CONCLUIR" ? "Concluiu cessão de templo" : "Cancelou cessão de templo", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Cessão ${novoStatus.toLowerCase()}.` } };
    return;
  }
};

