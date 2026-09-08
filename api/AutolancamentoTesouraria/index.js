// AutolancamentoTesouraria (v4.3)
// O dizimista REGISTRA que deu um dízimo/oferta — não é um gateway de
// pagamento, é só o auto-relato de algo que já aconteceu fora do sistema
// (dinheiro na mão ou PIX já enviado). Fica PENDENTE até o Tesoureiro Local
// CONFIRMAR que de fato recebeu (viu o dinheiro/PIX cair) — só aí o Termo nº
// é atribuído (shared/tesouraria.js::proximoNumeroTermo). Nenhum número de
// termo fica "furado" por algo que a pessoa disse que deu mas nunca foi
// confirmado. Rota pública por matrícula, mesmo padrão de auto-atendimento
// de MeusDadosLGPD/MeusLancamentosTesouraria — a pessoa só lança o próprio
// dízimo, nunca o de outra matrícula.
// POST /api/autolancamento-tesouraria/{matricula} -> { tipo, descricao?, valor,
//        formaPagamento, valorPix?, mesReferencia, comprovanteBase64?, mimeType? }
const { getPool, sql } = require("../shared/db");
const { registrarAuditoria } = require("../shared/auditoria");
const storage = require("../shared/storage");

const FORMAS = ["DINHEIRO", "PIX", "MISTO"];
const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;
const REGEX_MES = /^\d{4}-\d{2}$/;

module.exports = async function (context, req) {
  const matricula = context.bindingData.matricula;
  if (!matricula) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe a matrícula na rota." } };
    return;
  }
  const { tipo, descricao, valor, formaPagamento, valorPix, mesReferencia, comprovanteBase64, mimeType } = req.body || {};
  if (!tipo || !valor || !formaPagamento || !mesReferencia) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: tipo, valor, formaPagamento, mesReferencia." } };
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
  if (Number(valor) <= 0) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Valor deve ser maior que zero." } };
    return;
  }
  let valorPixFinal = null;
  if (formaPagamento === "MISTO") {
    if (valorPix == null || Number(valorPix) <= 0 || Number(valorPix) >= Number(valor)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Em pagamento misto, informe valorPix maior que zero e menor que o valor total (o restante é considerado dinheiro)." } };
      return;
    }
    valorPixFinal = valorPix;
  }

  const pool = await getPool();

  const dizimista = await pool.request().input("mat", sql.Int, matricula).query(`
    SELECT TOP 1 DizimistaId, CongregacaoId FROM Dizimistas WHERE MembroId = @mat AND Ativo = 1
  `);
  if (dizimista.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não cadastrada como dizimista em nenhuma congregação. Procure o Tesoureiro Local." } };
    return;
  }
  const { DizimistaId: dizimistaId, CongregacaoId: congregacaoId } = dizimista.recordset[0];

  const categoria = await pool.request().input("codigo", sql.NVarChar(30), tipo)
    .query(`SELECT Nome FROM CategoriasEntrada WHERE Codigo = @codigo AND Ativa = 1`);
  if (categoria.recordset.length === 0) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Categoria de entrada inválida ou inativa." } };
    return;
  }

  const fechado = await pool.request()
    .input("congregacaoId", sql.Int, congregacaoId).input("mesReferencia", sql.Char(7), mesReferencia)
    .query(`SELECT TOP 1 FechamentoId FROM FechamentosTesouraria WHERE CongregacaoId = @congregacaoId AND MesReferencia = @mesReferencia`);
  if (fechado.recordset.length > 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Este mês já foi fechado na sua congregação — registre no mês corrente." } };
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

  const criado = await pool.request()
    .input("congregacaoId", sql.Int, congregacaoId)
    .input("dizimistaId", sql.Int, dizimistaId)
    .input("tipo", sql.NVarChar(30), tipo)
    .input("descricao", sql.NVarChar(300), descricao ? descricao.trim() : null)
    .input("valor", sql.Decimal(10, 2), valor)
    .input("formaPagamento", sql.NVarChar(20), formaPagamento)
    .input("valorPix", sql.Decimal(10, 2), valorPixFinal)
    .input("comprovanteUrl", sql.NVarChar(500), comprovanteUrl)
    .input("mesReferencia", sql.Char(7), mesReferencia)
    .input("registradoPor", sql.Int, matricula)
    .query(`INSERT INTO LancamentosTesouraria
              (CongregacaoId, DizimistaId, TermoNumero, Tipo, Descricao, Valor, FormaPagamento, ValorPix, ComprovanteUrl, MesReferencia, RegistradoPor, Origem, StatusConfirmacao)
            OUTPUT INSERTED.LancamentoId
            VALUES (@congregacaoId, @dizimistaId, NULL, @tipo, @descricao, @valor, @formaPagamento, @valorPix, @comprovanteUrl, @mesReferencia, @registradoPor, 'AUTOLANCAMENTO', 'PENDENTE')`);
  const lancamentoId = criado.recordset[0].LancamentoId;

  await registrarAuditoria({
    tabela: "LancamentosTesouraria", registroId: lancamentoId, acao: "Autolançamento do dizimista (aguardando confirmação do tesoureiro)", usuarioId: matricula,
    dadosDepois: { congregacaoId, tipo, valor, formaPagamento, valorPix: valorPixFinal, mesReferencia }
  });

  context.res = {
    status: 201, headers: { "Content-Type": "application/json" },
    body: { sucesso: true, mensagem: "✅ Registrado! Aguarde a confirmação do Tesoureiro Local — o número do termo (seu comprovante) é gerado só na confirmação.", lancamentoId }
  };
};
