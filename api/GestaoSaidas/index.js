// GestaoSaidas (v4.5, primeira parte; segunda parte adiciona duplicidade
// e 3 cotações)
// Solicitação de Pagamento → documentação obrigatória (nota fiscal, Reg.
// Art. 120 §2º) → aprovação por ALÇADA DE VALOR (AlcadasAprovacao: quanto
// maior o valor, mais aprovadores distintos e de nível territorial mais
// alto são exigidos) → pagamento → comprovante. Segregação de funções
// (princípio 2.7): quem solicita nunca aprova/rejeita a própria
// solicitação. Saldo do Centro de Custo (Local de uma congregação, ou
// Geral consolidado — v4.1.3) nunca fica negativo: o pagamento é
// bloqueado, não uma marcação manual (shared/tesouraria.js::saldoCentroCusto).
// Se a categoria for de fundo RESTRITO (v4.2), a Saída exige uma Campanha
// (v4.4) de origem e não pode gastar além do que ela arrecadou de fato
// (shared/tesouraria.js::saldoRestanteCampanha) — fecha o ciclo prometido
// em v4.2 ("a Saída correspondente só libera gasto na mesma finalidade").
// Cancelamento nunca é exclusão (mesmo princípio de v4.1.1) — mas uma
// Saída já PAGA não pode ser cancelada (dinheiro já saiu; corrige-se com
// um lançamento de ajuste auditado, não reescrevendo histórico).
// v4.5 (segunda parte):
//  - "possivelDuplicidade" é CALCULADO NA LEITURA (mesmo fornecedor +
//    mesmo valor + janela de 7 dias, status ainda ativo) — vira um alerta
//    visível pra quem aprova, nunca um bloqueio automático (pode ser uma
//    parcela legítima repetida).
//  - Acima do valor de referência configurável (ParametrosSaida), a
//    solicitação exige 3 cotações anexadas (Reg. Art. 62) — sem isso nem
//    entra no sistema.
// GET  /api/saidas?congregacaoId=&status= -> lista dentro do escopo do usuário
// GET  /api/saidas/{id} -> detalhe + aprovações + cotações já registradas
// POST /api/saidas -> { congregacaoId, fornecedorId, tipo, descricao, valor, campanhaId?,
//        documentoFiscalBase64, mimeType, cotacoes?: [{fornecedorNome, valor, documentoBase64, mimeType}] }
// PUT  /api/saidas/{id} -> { acao: 'APROVAR'|'REJEITAR'|'PAGAR'|'CANCELAR', motivo?, comprovanteBase64?, mimeType? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const tesouraria = require("../shared/tesouraria");

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;
const ACOES = ["APROVAR", "REJEITAR", "PAGAR", "CANCELAR"];

async function validarEUpload(comprovanteBase64, mimeType, context) {
  if (!mimeType || !MIME_PERMITIDOS.includes(mimeType)) {
    return { erro: `Formato inválido. Use um de: ${MIME_PERMITIDOS.join(", ")}.` };
  }
  let buffer;
  try { buffer = Buffer.from(comprovanteBase64, "base64"); } catch (e) {
    return { erro: "Arquivo inválido." };
  }
  if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO_BYTES) {
    return { erro: "Arquivo vazio ou maior que 15 MB." };
  }
  try {
    const url = await storage.salvarDocumento(buffer, mimeType);
    return { url };
  } catch (erroUpload) {
    context.log.error("Falha ao salvar arquivo no Blob Storage:", erroUpload.message);
    return { erro: "Falha ao salvar o arquivo. Avise a equipe técnica: " + erroUpload.message };
  }
}

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  const SELECT_BASE = `
    SELECT s.SaidaId AS saidaId, s.CongregacaoId AS congregacaoId, c.Nome AS congregacaoNome,
           s.FornecedorId AS fornecedorId, f.Nome AS fornecedorNome, s.Tipo AS tipo, cs.Nome AS categoriaNome,
           cs.CentroCusto AS centroCusto, s.Descricao AS descricao, s.Valor AS valor, s.CampanhaId AS campanhaId,
           camp.Nome AS campanhaNome, s.DocumentoFiscalUrl AS documentoFiscalUrl, s.ComprovantePagamentoUrl AS comprovantePagamentoUrl,
           s.Status AS status, s.SolicitadoPor AS solicitadoPor, ms.Nome AS solicitadoPorNome,
           CONVERT(varchar(33), s.SolicitadoEm, 126) AS solicitadoEm, s.MotivoRejeicao AS motivoRejeicao,
           s.PagoPor AS pagoPor, CONVERT(varchar(33), s.PagoEm, 126) AS pagoEm,
           s.MotivoCancelamento AS motivoCancelamento,
           CASE WHEN EXISTS (
             SELECT 1 FROM SaidasTesouraria s2
             WHERE s2.SaidaId <> s.SaidaId AND s2.FornecedorId = s.FornecedorId AND s2.Valor = s.Valor
               AND s2.Status NOT IN ('REJEITADA', 'CANCELADA')
               AND ABS(DATEDIFF(DAY, s2.SolicitadoEm, s.SolicitadoEm)) <= 7
           ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS possivelDuplicidade
    FROM SaidasTesouraria s
    JOIN Congregacoes c ON c.CongregacaoId = s.CongregacaoId
    JOIN Fornecedores f ON f.FornecedorId = s.FornecedorId
    JOIN CategoriasSaida cs ON cs.Codigo = s.Tipo
    JOIN MembroReferencia ms ON ms.MembroId = s.SolicitadoPor
    LEFT JOIN Campanhas camp ON camp.CampanhaId = s.CampanhaId
  `;

  if (req.method === "GET" && !id) {
    const { congregacaoId, status } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (congregacaoId) { request.input("congregacaoId", sql.Int, congregacaoId); where += " AND s.CongregacaoId = @congregacaoId"; }
    if (status) { request.input("status", sql.NVarChar(20), status); where += " AND s.Status = @status"; }
    const result = await request.query(`${SELECT_BASE} WHERE ${where} ORDER BY s.SolicitadoEm DESC`);
    const saidas = result.recordset.filter(s => auth.estaNoEscopo(usuario, s.congregacaoNome)).map(s => Object.assign({}, s, {
      documentoFiscalUrl: storage.urlDocumentoComSas(s.documentoFiscalUrl),
      comprovantePagamentoUrl: s.comprovantePagamentoUrl ? storage.urlDocumentoComSas(s.comprovantePagamentoUrl) : null
    }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: saidas };
    return;
  }

  if (req.method === "GET" && id) {
    const result = await pool.request().input("id", sql.Int, id).query(`${SELECT_BASE} WHERE s.SaidaId = @id`);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Saída não encontrada." } };
      return;
    }
    const saida = result.recordset[0];
    if (!auth.estaNoEscopo(usuario, saida.congregacaoNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    const alcada = await pool.request().input("valor", sql.Decimal(10, 2), saida.valor)
      .query(`SELECT TOP 1 * FROM AlcadasAprovacao WHERE ValorMinimo <= @valor ORDER BY ValorMinimo DESC`);
    const aprovacoes = await pool.request().input("id", sql.Int, id).query(`
      SELECT a.AprovadoPor AS aprovadoPor, m.Nome AS aprovadoPorNome, CONVERT(varchar(33), a.AprovadoEm, 126) AS aprovadoEm
      FROM SaidaAprovacoes a JOIN MembroReferencia m ON m.MembroId = a.AprovadoPor WHERE a.SaidaId = @id
    `);
    const cotacoes = await pool.request().input("id", sql.Int, id).query(`
      SELECT CotacaoId AS cotacaoId, FornecedorNome AS fornecedorNome, Valor AS valor, DocumentoUrl AS documentoUrl
      FROM SaidaCotacoes WHERE SaidaId = @id ORDER BY Valor
    `);
    context.res = {
      status: 200, headers: { "Content-Type": "application/json" },
      body: Object.assign({}, saida, {
        documentoFiscalUrl: storage.urlDocumentoComSas(saida.documentoFiscalUrl),
        comprovantePagamentoUrl: saida.comprovantePagamentoUrl ? storage.urlDocumentoComSas(saida.comprovantePagamentoUrl) : null,
        aprovacoes: aprovacoes.recordset,
        cotacoes: cotacoes.recordset.map(c => Object.assign({}, c, { documentoUrl: storage.urlDocumentoComSas(c.documentoUrl) })),
        alcada: alcada.recordset[0] ? { nivelMinimoAprovador: alcada.recordset[0].NivelMinimoAprovador, quantidadeAprovadores: alcada.recordset[0].QuantidadeAprovadores } : null
      })
    };
    return;
  }

  if (req.method === "POST") {
    const { congregacaoId, fornecedorId, tipo, descricao, valor, campanhaId, documentoFiscalBase64, mimeType, cotacoes } = req.body || {};
    if (!congregacaoId || !fornecedorId || !tipo || !descricao || !descricao.trim() || !valor) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: congregacaoId, fornecedorId, tipo, descricao, valor." } };
      return;
    }
    if (Number(valor) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Valor deve ser maior que zero." } };
      return;
    }
    if (!documentoFiscalBase64 || !mimeType) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Anexe a nota fiscal/recibo — documentação obrigatória desde a solicitação (Reg. Art. 120 §2º)." } };
      return;
    }
    // v4.5 (segunda parte) — acima do valor de referência (configurável,
    // Reg. Art. 62), a solicitação exige 3 cotações já anexadas.
    const parametros = await pool.request().query(`SELECT ValorReferenciaCotacoes FROM ParametrosSaida WHERE ParametroId = 1`);
    const valorReferencia = parametros.recordset[0] ? Number(parametros.recordset[0].ValorReferenciaCotacoes) : Infinity;
    const cotacoesValidas = Array.isArray(cotacoes) ? cotacoes.filter(c => c && c.fornecedorNome && c.valor && c.documentoBase64 && c.mimeType) : [];
    if (Number(valor) >= valorReferencia && cotacoesValidas.length < 3) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Valores a partir de R$ ${valorReferencia.toFixed(2)} exigem 3 cotações anexadas (Reg. Art. 62) — anexe pelo menos 3.` } };
      return;
    }
    const congNome = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
    if (congNome.recordset.length === 0 || !auth.estaNoEscopo(usuario, congNome.recordset[0].Nome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    const categoria = await pool.request().input("codigo", sql.NVarChar(30), tipo).query(`SELECT * FROM CategoriasSaida WHERE Codigo = @codigo AND Ativa = 1`);
    if (categoria.recordset.length === 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Categoria de saída inválida ou inativa. Cadastre-a em Financeiro → Plano de Contas → Categorias de Saída." } };
      return;
    }
    const cat = categoria.recordset[0];
    if (cat.TipoFundo === "RESTRITO") {
      if (!campanhaId) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Esta categoria é de fundo restrito — informe a campanhaId de origem do dinheiro." } };
        return;
      }
      const campanha = await pool.request().input("id", sql.Int, campanhaId).query(`SELECT Status FROM Campanhas WHERE CampanhaId = @id`);
      if (campanha.recordset.length === 0 || campanha.recordset[0].Status !== "ATIVA") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Campanha inválida ou não está ativa." } };
        return;
      }
      const saldoRestante = await tesouraria.saldoRestanteCampanha(pool, sql, campanhaId);
      if (Number(valor) > saldoRestante) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `A campanha só tem R$ ${saldoRestante.toFixed(2)} disponível (considerando o que já está aprovado/pago) — reduza o valor ou aguarde mais arrecadação confirmada.` } };
        return;
      }
    } else if (campanhaId) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Esta categoria é de fundo livre — não vincule a uma campanha (isso é só pra categorias restritas)." } };
      return;
    }
    if (cat.CentroCusto === "PDQ") {
      const suspensao = await tesouraria.suspensaoAtivaFundoPdq(pool, sql);
      if (suspensao) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `O Fundo de Execução Estratégica (PDQ) está suspenso pelo Pastor Presidente desde ${new Date(suspensao.SuspensoEm).toLocaleDateString("pt-BR")} — motivo: ${suspensao.MotivoSuspensao}.` } };
        return;
      }
    }

    const fornecedor = await pool.request().input("id", sql.Int, fornecedorId).query(`SELECT * FROM Fornecedores WHERE FornecedorId = @id`);
    if (fornecedor.recordset.length === 0 || !fornecedor.recordset[0].Ativo) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Fornecedor não encontrado ou inativo." } };
      return;
    }
    if (!fornecedor.recordset[0].DadosBancariosConfirmados) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Os dados bancários deste fornecedor foram alterados recentemente e aguardam confirmação — peça pra outra pessoa da Tesouraria confirmar antes de solicitar pagamento." } };
      return;
    }

    // Verificação de pagamento duplicado (mesmo fornecedor + mesmo valor +
    // janela de 7 dias) — ALERTA, nunca bloqueio automático (pode ser uma
    // parcela legítima repetida, ex: aluguel mensal igual todo mês).
    const duplicidade = await pool.request().input("fornecedorId", sql.Int, fornecedorId).input("valor", sql.Decimal(10, 2), valor)
      .query(`SELECT COUNT(*) AS total FROM SaidasTesouraria
              WHERE FornecedorId = @fornecedorId AND Valor = @valor AND Status NOT IN ('REJEITADA', 'CANCELADA')
                AND SolicitadoEm >= DATEADD(DAY, -7, SYSUTCDATETIME())`);
    const avisoDuplicidade = duplicidade.recordset[0].total > 0
      ? " ⚠️ Atenção: já existe outra solicitação para este mesmo fornecedor e valor nos últimos 7 dias — confira antes de aprovar, pode ser pagamento em duplicidade."
      : "";

    const { erro, url } = await validarEUpload(documentoFiscalBase64, mimeType, context);
    if (erro) { context.res = { status: 400, body: { sucesso: false, mensagem: erro } }; return; }

    const criada = await pool.request()
      .input("congregacaoId", sql.Int, congregacaoId)
      .input("fornecedorId", sql.Int, fornecedorId)
      .input("tipo", sql.NVarChar(30), tipo)
      .input("descricao", sql.NVarChar(300), descricao.trim())
      .input("valor", sql.Decimal(10, 2), valor)
      .input("campanhaId", sql.Int, campanhaId || null)
      .input("documentoFiscalUrl", sql.NVarChar(500), url)
      .input("solicitadoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO SaidasTesouraria (CongregacaoId, FornecedorId, Tipo, Descricao, Valor, CampanhaId, DocumentoFiscalUrl, SolicitadoPor)
              OUTPUT INSERTED.SaidaId
              VALUES (@congregacaoId, @fornecedorId, @tipo, @descricao, @valor, @campanhaId, @documentoFiscalUrl, @solicitadoPor)`);
    const saidaId = criada.recordset[0].SaidaId;

    for (const cot of cotacoesValidas) {
      const uploadCotacao = await validarEUpload(cot.documentoBase64, cot.mimeType, context);
      if (uploadCotacao.erro) continue; // não derruba a solicitação já criada por uma cotação com arquivo ruim
      await pool.request().input("saidaId", sql.Int, saidaId).input("fornecedorNome", sql.NVarChar(200), cot.fornecedorNome)
        .input("valor", sql.Decimal(10, 2), cot.valor).input("documentoUrl", sql.NVarChar(500), uploadCotacao.url)
        .query(`INSERT INTO SaidaCotacoes (SaidaId, FornecedorNome, Valor, DocumentoUrl) VALUES (@saidaId, @fornecedorNome, @valor, @documentoUrl)`);
    }

    await registrarAuditoria({
      tabela: "SaidasTesouraria", registroId: saidaId, acao: "Solicitou pagamento", usuarioId: usuario.membroId,
      dadosDepois: { congregacaoId, fornecedorId, tipo, descricao, valor, campanhaId: campanhaId || null, totalCotacoes: cotacoesValidas.length }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Solicitação de pagamento registrada — aguardando aprovação.${avisoDuplicidade}`, saidaId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/saidas/{id}" } };
      return;
    }
    const { acao, motivo, comprovanteBase64, mimeType } = req.body || {};
    if (!ACOES.includes(acao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Ação inválida. Use uma de: ${ACOES.join(", ")}.` } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`
      SELECT s.*, c.Nome AS congregacaoNome, cs.CentroCusto AS centroCusto FROM SaidasTesouraria s
      JOIN Congregacoes c ON c.CongregacaoId = s.CongregacaoId
      JOIN CategoriasSaida cs ON cs.Codigo = s.Tipo
      WHERE s.SaidaId = @id
    `);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Saída não encontrada." } };
      return;
    }
    const registro = atual.recordset[0];
    if (!auth.estaNoEscopo(usuario, registro.congregacaoNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }

    if (acao === "APROVAR") {
      if (registro.Status !== "PENDENTE") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta solicitação não está mais pendente de aprovação." } };
        return;
      }
      if (registro.SolicitadoPor === usuario.membroId) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Quem solicitou o pagamento não pode aprovar a própria solicitação — segregação de funções." } };
        return;
      }
      const jaAprovou = await pool.request().input("saidaId", sql.Int, id).input("membroId", sql.Int, usuario.membroId)
        .query(`SELECT 1 FROM SaidaAprovacoes WHERE SaidaId = @saidaId AND AprovadoPor = @membroId`);
      if (jaAprovou.recordset.length > 0) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Você já registrou sua aprovação para esta solicitação." } };
        return;
      }
      const alcada = await pool.request().input("valor", sql.Decimal(10, 2), registro.Valor)
        .query(`SELECT TOP 1 * FROM AlcadasAprovacao WHERE ValorMinimo <= @valor ORDER BY ValorMinimo DESC`);
      const tier = alcada.recordset[0];
      if (!tier) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Nenhuma alçada de aprovação configurada para este valor — cadastre em Financeiro → Plano de Contas → Alçadas de Aprovação." } };
        return;
      }
      if (!auth.nivelAtingeMinimo(usuario.nivel, tier.NivelMinimoAprovador)) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Esta faixa de valor exige aprovador de nível ${tier.NivelMinimoAprovador} ou superior.` } };
        return;
      }
      await pool.request().input("saidaId", sql.Int, id).input("membroId", sql.Int, usuario.membroId)
        .query(`INSERT INTO SaidaAprovacoes (SaidaId, AprovadoPor) VALUES (@saidaId, @membroId)`);
      const contagem = await pool.request().input("id", sql.Int, id).query(`SELECT COUNT(*) AS total FROM SaidaAprovacoes WHERE SaidaId = @id`);
      const totalAprovacoes = contagem.recordset[0].total;
      let mensagem = `✅ Aprovação registrada (${totalAprovacoes} de ${tier.QuantidadeAprovadores} exigida(s)).`;
      if (totalAprovacoes >= tier.QuantidadeAprovadores) {
        await pool.request().input("id", sql.Int, id).query(`UPDATE SaidasTesouraria SET Status = 'APROVADA' WHERE SaidaId = @id`);
        mensagem = "✅ Última aprovação necessária registrada — solicitação APROVADA, pronta pra pagamento.";
      }
      await registrarAuditoria({
        tabela: "SaidasTesouraria", registroId: Number(id), acao: "Aprovou solicitação de pagamento", usuarioId: usuario.membroId,
        dadosDepois: { totalAprovacoes, exigido: tier.QuantidadeAprovadores }
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem } };
      return;
    }

    if (acao === "REJEITAR") {
      if (!motivo || !motivo.trim()) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o motivo da rejeição." } };
        return;
      }
      if (registro.Status !== "PENDENTE") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta solicitação não está mais pendente." } };
        return;
      }
      if (registro.SolicitadoPor === usuario.membroId) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Quem solicitou o pagamento não pode rejeitar a própria solicitação — cancele em vez disso." } };
        return;
      }
      await pool.request().input("id", sql.Int, id).input("motivo", sql.NVarChar(300), motivo.trim())
        .query(`UPDATE SaidasTesouraria SET Status = 'REJEITADA', MotivoRejeicao = @motivo WHERE SaidaId = @id`);
      await registrarAuditoria({
        tabela: "SaidasTesouraria", registroId: Number(id), acao: "Rejeitou solicitação de pagamento", usuarioId: usuario.membroId,
        dadosAntes: registro, dadosDepois: { motivo }
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "Solicitação rejeitada." } };
      return;
    }

    if (acao === "PAGAR") {
      if (registro.Status !== "APROVADA") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Só é possível pagar uma solicitação já aprovada." } };
        return;
      }
      if (!comprovanteBase64 || !mimeType) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Anexe o comprovante de pagamento." } };
        return;
      }
      const fornecedor = await pool.request().input("id", sql.Int, registro.FornecedorId).query(`SELECT DadosBancariosConfirmados FROM Fornecedores WHERE FornecedorId = @id`);
      if (!fornecedor.recordset[0] || !fornecedor.recordset[0].DadosBancariosConfirmados) {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Os dados bancários deste fornecedor mudaram e ainda não foram confirmados — não é possível pagar agora." } };
        return;
      }
      if (registro.centroCusto === "PDQ") {
        const suspensao = await tesouraria.suspensaoAtivaFundoPdq(pool, sql);
        if (suspensao) {
          context.res = { status: 200, body: { sucesso: false, mensagem: `O Fundo de Execução Estratégica (PDQ) está suspenso pelo Pastor Presidente desde ${new Date(suspensao.SuspensoEm).toLocaleDateString("pt-BR")} — não é possível pagar agora.` } };
          return;
        }
      }
      const saldoDisponivel = await tesouraria.saldoCentroCusto(pool, sql, registro.centroCusto, registro.CongregacaoId);
      if (Number(registro.Valor) > saldoDisponivel) {
        context.res = { status: 200, body: { sucesso: false, mensagem: `Saldo insuficiente no Centro de Custo ${registro.centroCusto === "GERAL" ? "Geral" : registro.centroCusto === "PDQ" ? "PDQ" : "Local"} (disponível: R$ ${saldoDisponivel.toFixed(2)}).` } };
        return;
      }
      if (registro.CampanhaId) {
        const campanha = await pool.request().input("id", sql.Int, registro.CampanhaId).query(`SELECT Status FROM Campanhas WHERE CampanhaId = @id`);
        if (campanha.recordset.length === 0 || campanha.recordset[0].Status === "CANCELADA") {
          context.res = { status: 200, body: { sucesso: false, mensagem: "A campanha de origem deste gasto foi cancelada — não é possível pagar." } };
          return;
        }
      }
      const { erro, url } = await validarEUpload(comprovanteBase64, mimeType, context);
      if (erro) { context.res = { status: 400, body: { sucesso: false, mensagem: erro } }; return; }

      await pool.request().input("id", sql.Int, id).input("pagoPor", sql.Int, usuario.membroId).input("comprovanteUrl", sql.NVarChar(500), url)
        .query(`UPDATE SaidasTesouraria SET Status = 'PAGA', PagoPor = @pagoPor, PagoEm = SYSUTCDATETIME(), ComprovantePagamentoUrl = @comprovanteUrl WHERE SaidaId = @id`);
      await registrarAuditoria({
        tabela: "SaidasTesouraria", registroId: Number(id), acao: "Efetuou pagamento", usuarioId: usuario.membroId,
        dadosAntes: registro, dadosDepois: { valor: registro.Valor }
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Pagamento registrado." } };
      return;
    }

    if (acao === "CANCELAR") {
      if (!motivo || !motivo.trim()) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o motivo do cancelamento." } };
        return;
      }
      if (registro.Status === "PAGA") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta saída já foi paga — dinheiro já saiu, não pode ser cancelada (corrija com um lançamento de ajuste auditado)." } };
        return;
      }
      if (registro.Status === "CANCELADA") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Esta saída já está cancelada." } };
        return;
      }
      await pool.request().input("id", sql.Int, id).input("motivo", sql.NVarChar(300), motivo.trim()).input("canceladoPor", sql.Int, usuario.membroId)
        .query(`UPDATE SaidasTesouraria SET Status = 'CANCELADA', MotivoCancelamento = @motivo, CanceladoPor = @canceladoPor, CanceladoEm = SYSUTCDATETIME() WHERE SaidaId = @id`);
      await registrarAuditoria({
        tabela: "SaidasTesouraria", registroId: Number(id), acao: "Cancelou solicitação de pagamento", usuarioId: usuario.membroId,
        dadosAntes: registro, dadosDepois: { motivo }
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "Saída cancelada." } };
      return;
    }
  }
};
