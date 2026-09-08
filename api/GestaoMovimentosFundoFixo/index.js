// GestaoMovimentosFundoFixo (v4.5, segunda parte)
// Uso do dia a dia de um Fundo Fixo de Caixa (petty cash): DESPESA (o
// custodiante gasta uma miudeza, sem precisar da alçada cheia de
// GestaoSaidas) ou REPOSICAO (alguém repõe o fundo, mediante prestação de
// contas dos recibos já registrados). Documento obrigatório nos dois
// casos (recibo da despesa, ou comprovante da reposição). Despesa nunca
// deixa o saldo negativo; reposição nunca deixa o saldo passar do teto —
// ambos calculados na leitura (shared/tesouraria.js::saldoFundoFixo), não
// marcação manual.
// GET  /api/fundos-fixos/{fundoId}/movimentos -> histórico
// POST /api/fundos-fixos/{fundoId}/movimentos -> { tipo: 'DESPESA'|'REPOSICAO', valor, descricao, documentoBase64, mimeType }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const tesouraria = require("../shared/tesouraria");

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;
const TIPOS = ["DESPESA", "REPOSICAO"];

module.exports = async function (context, req) {
  const fundoId = context.bindingData.fundoId;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (!fundoId) {
    context.res = { status: 400, body: { erro: "Informe o fundoId na rota." } };
    return;
  }
  const pool = await getPool();

  const fundo = await pool.request().input("id", sql.Int, fundoId).query(`
    SELECT f.*, c.Nome AS congregacaoNome FROM FundosFixosCaixa f JOIN Congregacoes c ON c.CongregacaoId = f.CongregacaoId WHERE f.FundoId = @id
  `);
  if (fundo.recordset.length === 0) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Fundo Fixo não encontrado." } };
    return;
  }
  const registroFundo = fundo.recordset[0];
  if (!auth.estaNoEscopo(usuario, registroFundo.congregacaoNome)) {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
    return;
  }

  if (req.method === "GET") {
    const result = await pool.request().input("fundoId", sql.Int, fundoId).query(`
      SELECT m.MovimentoId AS movimentoId, m.Tipo AS tipo, m.Valor AS valor, m.Descricao AS descricao,
             m.DocumentoUrl AS documentoUrl, m.RegistradoPor AS registradoPor, r.Nome AS registradoPorNome,
             CONVERT(varchar(33), m.CriadoEm, 126) AS criadoEm
      FROM FundoFixoMovimentos m JOIN MembroReferencia r ON r.MembroId = m.RegistradoPor
      WHERE m.FundoId = @fundoId ORDER BY m.CriadoEm DESC
    `);
    const movimentos = result.recordset.map(m => Object.assign({}, m, { documentoUrl: storage.urlDocumentoComSas(m.documentoUrl) }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: movimentos };
    return;
  }

  if (req.method === "POST") {
    if (registroFundo.Status !== "ATIVO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este Fundo Fixo está encerrado." } };
      return;
    }
    const { tipo, valor, descricao, documentoBase64, mimeType } = req.body || {};
    if (!TIPOS.includes(tipo)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Tipo inválido. Use um de: ${TIPOS.join(", ")}.` } };
      return;
    }
    if (!valor || Number(valor) <= 0 || !descricao || !descricao.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe valor (maior que zero) e descrição." } };
      return;
    }
    if (!documentoBase64 || !mimeType) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Anexe ${tipo === "DESPESA" ? "o recibo da despesa" : "o comprovante da reposição"}.` } };
      return;
    }
    if (!MIME_PERMITIDOS.includes(mimeType)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Formato inválido. Use um de: ${MIME_PERMITIDOS.join(", ")}.` } };
      return;
    }
    let buffer;
    try { buffer = Buffer.from(documentoBase64, "base64"); } catch (e) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Arquivo inválido." } };
      return;
    }
    if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO_BYTES) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Arquivo vazio ou maior que 15 MB." } };
      return;
    }

    const saldoAtual = await tesouraria.saldoFundoFixo(pool, sql, fundoId);
    if (tipo === "DESPESA" && Number(valor) > saldoAtual) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Saldo insuficiente no Fundo Fixo (disponível: R$ ${saldoAtual.toFixed(2)}).` } };
      return;
    }
    if (tipo === "REPOSICAO" && (saldoAtual + Number(valor)) > Number(registroFundo.ValorTeto)) {
      context.res = { status: 200, body: { sucesso: false, mensagem: `Esta reposição levaria o fundo acima do teto (R$ ${Number(registroFundo.ValorTeto).toFixed(2)}) — reponha no máximo R$ ${(Number(registroFundo.ValorTeto) - saldoAtual).toFixed(2)}.` } };
      return;
    }

    let documentoUrl;
    try {
      documentoUrl = await storage.salvarDocumento(buffer, mimeType);
    } catch (erroUpload) {
      context.log.error("Falha ao salvar arquivo no Blob Storage:", erroUpload.message);
      context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar o arquivo. Avise a equipe técnica: " + erroUpload.message } };
      return;
    }

    const criado = await pool.request()
      .input("fundoId", sql.Int, fundoId).input("tipo", sql.NVarChar(20), tipo).input("valor", sql.Decimal(10, 2), valor)
      .input("descricao", sql.NVarChar(300), descricao.trim()).input("documentoUrl", sql.NVarChar(500), documentoUrl)
      .input("registradoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO FundoFixoMovimentos (FundoId, Tipo, Valor, Descricao, DocumentoUrl, RegistradoPor)
              OUTPUT INSERTED.MovimentoId VALUES (@fundoId, @tipo, @valor, @descricao, @documentoUrl, @registradoPor)`);
    const movimentoId = criado.recordset[0].MovimentoId;

    await registrarAuditoria({
      tabela: "FundoFixoMovimentos", registroId: movimentoId, acao: tipo === "DESPESA" ? "Registrou despesa do Fundo Fixo" : "Registrou reposição do Fundo Fixo", usuarioId: usuario.membroId,
      dadosDepois: { fundoId, tipo, valor, descricao }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Movimento registrado.", movimentoId } };
    return;
  }
};
