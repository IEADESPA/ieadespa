// VenderNumeroSorteio (v4.4)
// Venda de um "número da sorte" de uma campanha do tipo SORTEIO — gera um
// LancamentoTesouraria normal (mesmo fluxo de sempre: Termo nº, fechamento,
// contabilização) tipado como categoria 'CAMPANHA' (fundo RESTRITO, v4.2)
// e vinculado à campanha via CampanhaId, e além disso registra o número
// sequencial do sorteio (CampanhaSorteioNumeros) — gerado pelo servidor,
// nunca digitado à mão, mesmo princípio do Termo nº
// (shared/tesouraria.js::proximoNumeroTermo), só que por campanha.
// POST /api/campanhas/{campanhaId}/numeros-sorteio -> { congregacaoId, dizimistaId?,
//        nomeAvulso?, formaPagamento, valorPix?, comprovanteBase64?, mimeType?, mesReferencia }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const tesouraria = require("../shared/tesouraria");

const FORMAS = ["DINHEIRO", "PIX", "MISTO"];
const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;
const REGEX_MES = /^\d{4}-\d{2}$/;

module.exports = async function (context, req) {
  const campanhaId = context.bindingData.campanhaId;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (!campanhaId) {
    context.res = { status: 400, body: { erro: "Informe o campanhaId na rota." } };
    return;
  }
  const { congregacaoId, dizimistaId, nomeAvulso, formaPagamento, valorPix, comprovanteBase64, mimeType, mesReferencia } = req.body || {};
  if (!congregacaoId || !formaPagamento || !mesReferencia) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: congregacaoId, formaPagamento, mesReferencia." } };
    return;
  }
  if (!dizimistaId && (!nomeAvulso || !nomeAvulso.trim())) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o dizimista ou um nome avulso do comprador do número." } };
    return;
  }
  if (!FORMAS.includes(formaPagamento)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: `Forma de pagamento inválida. Use um de: ${FORMAS.join(", ")}.` } };
    return;
  }
  if (!REGEX_MES.test(mesReferencia)) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "mesReferencia deve estar no formato AAAA-MM." } };
    return;
  }

  const pool = await getPool();

  const congNome = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
  if (congNome.recordset.length === 0 || !auth.estaNoEscopo(usuario, congNome.recordset[0].Nome)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
    return;
  }

  const campanha = await pool.request().input("id", sql.Int, campanhaId).query(`SELECT * FROM Campanhas WHERE CampanhaId = @id`);
  if (campanha.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Campanha não encontrada." } };
    return;
  }
  const camp = campanha.recordset[0];
  if (camp.Tipo !== "SORTEIO") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Esta campanha não é do tipo Sorteio." } };
    return;
  }
  if (camp.Status !== "ATIVA") {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Esta campanha não está ativa." } };
    return;
  }

  const valor = camp.PrecoNumeroSorteio;
  let valorPixFinal = null;
  if (formaPagamento === "MISTO") {
    if (valorPix == null || Number(valorPix) <= 0 || Number(valorPix) >= Number(valor)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Em pagamento misto, informe valorPix maior que zero e menor que o valor total (o restante é considerado dinheiro)." } };
      return;
    }
    valorPixFinal = valorPix;
  }

  const fechado = await pool.request()
    .input("congregacaoId", sql.Int, congregacaoId).input("mesReferencia", sql.Char(7), mesReferencia)
    .query(`SELECT TOP 1 FechamentoId FROM FechamentosTesouraria WHERE CongregacaoId = @congregacaoId AND MesReferencia = @mesReferencia`);
  if (fechado.recordset.length > 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Este mês já foi fechado — não é mais possível vender números nele." } };
    return;
  }

  let comprovanteUrl = null;
  if (comprovanteBase64) {
    if (!mimeType || !MIME_PERMITIDOS.includes(mimeType)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Formato de comprovante inválido. Use um de: ${MIME_PERMITIDOS.join(", ")}.` } };
      return;
    }
    let buffer;
    try { buffer = Buffer.from(comprovanteBase64, "base64"); } catch (e) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "comprovanteBase64 inválido." } };
      return;
    }
    if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO_BYTES) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Comprovante vazio ou maior que 15 MB." } };
      return;
    }
    try {
      comprovanteUrl = await storage.salvarDocumento(buffer, mimeType);
    } catch (erroUpload) {
      context.log.error("Falha ao salvar comprovante no Blob Storage:", erroUpload.message);
      context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar o comprovante. Avise a equipe técnica: " + erroUpload.message } };
      return;
    }
  }

  const termoNumero = await tesouraria.proximoNumeroTermo(pool, sql, congregacaoId);
  const lancamentoCriado = await pool.request()
    .input("congregacaoId", sql.Int, congregacaoId)
    .input("dizimistaId", sql.Int, dizimistaId || null)
    .input("nomeAvulso", sql.NVarChar(200), dizimistaId ? null : nomeAvulso.trim())
    .input("termoNumero", sql.Int, termoNumero)
    .input("valor", sql.Decimal(10, 2), valor)
    .input("formaPagamento", sql.NVarChar(20), formaPagamento)
    .input("valorPix", sql.Decimal(10, 2), valorPixFinal)
    .input("comprovanteUrl", sql.NVarChar(500), comprovanteUrl)
    .input("mesReferencia", sql.Char(7), mesReferencia)
    .input("registradoPor", sql.Int, usuario.membroId)
    .input("campanhaId", sql.Int, campanhaId)
    .query(`INSERT INTO LancamentosTesouraria
              (CongregacaoId, DizimistaId, NomeAvulso, TermoNumero, Tipo, Valor, FormaPagamento, ValorPix, ComprovanteUrl, MesReferencia, RegistradoPor, CampanhaId)
            OUTPUT INSERTED.LancamentoId
            VALUES (@congregacaoId, @dizimistaId, @nomeAvulso, @termoNumero, 'CAMPANHA', @valor, @formaPagamento, @valorPix, @comprovanteUrl, @mesReferencia, @registradoPor, @campanhaId)`);
  const lancamentoId = lancamentoCriado.recordset[0].LancamentoId;

  const proximoNumero = await pool.request().input("campanhaId", sql.Int, campanhaId)
    .query(`SELECT ISNULL(MAX(Numero), 0) + 1 AS proximo FROM CampanhaSorteioNumeros WHERE CampanhaId = @campanhaId`);
  const numero = proximoNumero.recordset[0].proximo;

  await pool.request()
    .input("campanhaId", sql.Int, campanhaId).input("numero", sql.Int, numero).input("lancamentoId", sql.Int, lancamentoId)
    .input("dizimistaId", sql.Int, dizimistaId || null).input("nomeAvulso", sql.NVarChar(200), dizimistaId ? null : nomeAvulso.trim())
    .query(`INSERT INTO CampanhaSorteioNumeros (CampanhaId, Numero, LancamentoId, DizimistaId, NomeAvulso) VALUES (@campanhaId, @numero, @lancamentoId, @dizimistaId, @nomeAvulso)`);

  await registrarAuditoria({
    tabela: "CampanhaSorteioNumeros", registroId: lancamentoId, acao: "Vendeu número de sorteio", usuarioId: usuario.membroId,
    dadosDepois: { campanhaId, numero, congregacaoId, valor, formaPagamento, mesReferencia }
  });

  context.res = {
    status: 201, headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: `✅ Número ${numero} vendido — Termo nº ${termoNumero}.`, numero, termoNumero, lancamentoId }
  };
};
