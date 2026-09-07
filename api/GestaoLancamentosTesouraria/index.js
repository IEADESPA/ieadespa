// GestaoLancamentosTesouraria (v4.1 + v4.1.1 + v4.1.5)
// O "bloco de dízimo" digital: cada lançamento é uma entrada categorizada,
// com Termo nº gerado pelo servidor (nunca digitado à mão — shared/
// tesouraria.js::proximoNumeroTermo, sequencial contínuo por congregação).
// v4.1.1 (flexibilidade real, a partir de como o processo funciona na
// prática):
//  - PIX/Misto podem ser lançados sem comprovante na hora (chega depois via
//    PUT) — fica marcado como "comprovantePendente" até anexar.
//  - "Misto": parte em dinheiro + parte em PIX no mesmo lançamento
//    (ValorPix é a parte em PIX; o restante de Valor é em dinheiro).
//  - Nunca se exclui um lançamento (equivalente a rasurar o bloco físico) —
//    DELETE virou "cancelar com motivo": preserva o Termo nº e aparece no
//    relatório como CANCELADO, igual à folha arrancada do bloco físico.
// v4.1.5 — correção de rumo (feedback direto): não existe "outras entradas"
// genérica (risco de compliance — um balde sem categoria nomeada é
// exatamente o tipo de rubrica que esconde lavagem de dinheiro). "Tipo"
// agora é o Codigo de um catálogo configurável (CategoriasEntrada, via
// GestaoCatalogos — mesmo padrão de Departamentos/Congregações), com
// Dízimo/Oferta/Entrada de Departamento/Secretaria/Revista/Congresso etc.
// já semeados — todas passam pelo MESMO fluxo (sem aprovação individual
// extra: a supervisão é o fechamento mensal + liberação da Geral de
// sempre). "Descrição" vira opcional pra qualquer categoria (nota livre),
// e dizimista/nome avulso OU descrição — pelo menos um dos dois precisa
// identificar a origem, pra nunca existir uma entrada sem procedência.
// GET   /api/tesouraria-lancamentos?congregacaoId=&mesReferencia=
// POST  /api/tesouraria-lancamentos -> { congregacaoId, dizimistaId?, nomeAvulso?,
//        tipo, descricao?, valor, formaPagamento, valorPix?, comprovanteBase64?, mimeType?, mesReferencia }
// PUT   /api/tesouraria-lancamentos/{id} -> { comprovanteBase64, mimeType } (anexa/troca comprovante, só antes do fechamento)
// DELETE /api/tesouraria-lancamentos/{id} -> { motivo } (cancela, preserva o Termo nº — só antes do fechamento)
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const tesouraria = require("../shared/tesouraria");

const FORMAS = ["DINHEIRO", "PIX", "MISTO"];
const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;
const REGEX_MES = /^\d{4}-\d{2}$/;

function validarEProcessarComprovante(comprovanteBase64, mimeType) {
  if (!MIME_PERMITIDOS.includes(mimeType)) {
    return { erro: `Formato de comprovante inválido. Use um de: ${MIME_PERMITIDOS.join(", ")}.` };
  }
  let buffer;
  try { buffer = Buffer.from(comprovanteBase64, "base64"); } catch (e) {
    return { erro: "comprovanteBase64 inválido." };
  }
  if (buffer.length === 0 || buffer.length > TAMANHO_MAXIMO_BYTES) {
    return { erro: "Comprovante vazio ou maior que 15 MB." };
  }
  return { buffer };
}

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  async function nomeCongregacao(congregacaoId) {
    const r = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
    return r.recordset[0] ? r.recordset[0].Nome : null;
  }

  if (req.method === "GET") {
    const { congregacaoId, mesReferencia } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (congregacaoId) { request.input("congregacaoId", sql.Int, congregacaoId); where += " AND l.CongregacaoId = @congregacaoId"; }
    if (mesReferencia) { request.input("mesReferencia", sql.Char(7), mesReferencia); where += " AND l.MesReferencia = @mesReferencia"; }

    const result = await request.query(`
      SELECT l.LancamentoId AS lancamentoId, l.CongregacaoId AS congregacaoId, c.Nome AS congregacaoNome,
             l.DizimistaId AS dizimistaId, d.Nome AS dizimistaNome, l.NomeAvulso AS nomeAvulso,
             l.TermoNumero AS termoNumero, l.Tipo AS tipo, cat.Nome AS categoriaNome, l.Descricao AS descricao,
             l.Valor AS valor, l.FormaPagamento AS formaPagamento, l.ValorPix AS valorPix,
             l.ComprovanteUrl AS comprovanteUrl, l.MesReferencia AS mesReferencia, l.FechamentoId AS fechamentoId,
             l.ConciliacaoId AS conciliacaoId, l.Status AS status, l.MotivoCancelamento AS motivoCancelamento,
             CONVERT(varchar(33), l.CriadoEm, 126) AS criadoEm
      FROM LancamentosTesouraria l
      JOIN Congregacoes c ON c.CongregacaoId = l.CongregacaoId
      LEFT JOIN Dizimistas d ON d.DizimistaId = l.DizimistaId
      LEFT JOIN CategoriasEntrada cat ON cat.Codigo = l.Tipo
      WHERE ${where}
      ORDER BY l.TermoNumero DESC
    `);
    const lancamentos = result.recordset
      .filter(l => auth.estaNoEscopo(usuario, l.congregacaoNome))
      .map(l => Object.assign({}, l, {
        comprovanteUrl: l.comprovanteUrl ? storage.urlDocumentoComSas(l.comprovanteUrl) : null,
        // "pendente" só se não tem comprovante próprio NEM foi coberto por
        // uma conciliação em lote (ConciliarPixTesouraria) — v4.1.2.
        comprovantePendente: l.status === "ATIVO" && ["PIX", "MISTO"].includes(l.formaPagamento) && !l.comprovanteUrl && !l.conciliacaoId,
        contabilizado: !!l.fechamentoId
      }));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: lancamentos };
    return;
  }

  if (req.method === "POST") {
    const { congregacaoId, dizimistaId, nomeAvulso, tipo, descricao, valor, formaPagamento, valorPix, comprovanteBase64, mimeType, mesReferencia } = req.body || {};
    if (!congregacaoId || !tipo || !valor || !formaPagamento || !mesReferencia) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: congregacaoId, tipo, valor, formaPagamento, mesReferencia." } };
      return;
    }
    const categoria = await pool.request().input("codigo", sql.NVarChar(30), tipo)
      .query(`SELECT Nome FROM CategoriasEntrada WHERE Codigo = @codigo AND Ativa = 1`);
    if (categoria.recordset.length === 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Categoria de entrada inválida ou inativa. Cadastre-a em Catálogos → Categorias de Entrada." } };
      return;
    }
    // Pelo menos um precisa identificar a origem do dinheiro — nunca uma
    // entrada sem procedência (é exatamente esse buraco que vira risco de
    // compliance/AML).
    if (!dizimistaId && !nomeAvulso && (!descricao || !descricao.trim())) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o dizimista, um nome avulso, ou ao menos uma descrição da origem." } };
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

    const congNome = await nomeCongregacao(congregacaoId);
    if (!congNome || !auth.estaNoEscopo(usuario, congNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }

    const fechado = await pool.request()
      .input("congregacaoId", sql.Int, congregacaoId).input("mesReferencia", sql.Char(7), mesReferencia)
      .query(`SELECT TOP 1 FechamentoId FROM FechamentosTesouraria WHERE CongregacaoId = @congregacaoId AND MesReferencia = @mesReferencia`);
    if (fechado.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este mês já foi fechado — não é mais possível lançar entradas nele." } };
      return;
    }

    // Comprovante é opcional na hora do lançamento (PIX/Misto podem chegar
    // sem foto ainda — fica "pendente" até alguém anexar via PUT). Só valida
    // de verdade quando algo foi de fato enviado.
    let comprovanteUrl = null;
    if (comprovanteBase64) {
      if (!mimeType) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o mimeType do comprovante." } };
        return;
      }
      const { erro, buffer } = validarEProcessarComprovante(comprovanteBase64, mimeType);
      if (erro) { context.res = { status: 400, body: { sucesso: false, mensagem: erro } }; return; }
      try {
        comprovanteUrl = await storage.salvarDocumento(buffer, mimeType);
      } catch (erroUpload) {
        context.log.error("Falha ao salvar comprovante no Blob Storage:", erroUpload.message);
        context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar o comprovante. Avise a equipe técnica: " + erroUpload.message } };
        return;
      }
    }

    const termoNumero = await tesouraria.proximoNumeroTermo(pool, sql, congregacaoId);
    const criado = await pool.request()
      .input("congregacaoId", sql.Int, congregacaoId)
      .input("dizimistaId", sql.Int, dizimistaId || null)
      .input("nomeAvulso", sql.NVarChar(200), dizimistaId ? null : (nomeAvulso || null))
      .input("termoNumero", sql.Int, termoNumero)
      .input("tipo", sql.NVarChar(30), tipo)
      .input("descricao", sql.NVarChar(300), descricao ? descricao.trim() : null)
      .input("valor", sql.Decimal(10, 2), valor)
      .input("formaPagamento", sql.NVarChar(20), formaPagamento)
      .input("valorPix", sql.Decimal(10, 2), valorPixFinal)
      .input("comprovanteUrl", sql.NVarChar(500), comprovanteUrl)
      .input("mesReferencia", sql.Char(7), mesReferencia)
      .input("registradoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO LancamentosTesouraria
                (CongregacaoId, DizimistaId, NomeAvulso, TermoNumero, Tipo, Descricao, Valor, FormaPagamento, ValorPix, ComprovanteUrl, MesReferencia, RegistradoPor)
              OUTPUT INSERTED.LancamentoId
              VALUES (@congregacaoId, @dizimistaId, @nomeAvulso, @termoNumero, @tipo, @descricao, @valor, @formaPagamento, @valorPix, @comprovanteUrl, @mesReferencia, @registradoPor)`);
    const lancamentoId = criado.recordset[0].LancamentoId;

    await registrarAuditoria({
      tabela: "LancamentosTesouraria", registroId: lancamentoId, acao: "Lançou entrada de tesouraria", usuarioId: usuario.membroId,
      dadosDepois: { congregacaoId, tipo, descricao: descricao || null, valor, formaPagamento, valorPix: valorPixFinal, mesReferencia, termoNumero, comComprovante: !!comprovanteUrl }
    });
    const avisoPendente = !comprovanteUrl && ["PIX", "MISTO"].includes(formaPagamento) ? " (comprovante pendente — anexe assim que possível)" : "";
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Lançamento nº ${termoNumero} registrado.${avisoPendente}`, lancamentoId, termoNumero } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/tesouraria-lancamentos/{id}" } };
      return;
    }
    const { comprovanteBase64, mimeType } = req.body || {};
    if (!comprovanteBase64 || !mimeType) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe comprovanteBase64 e mimeType." } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`
      SELECT l.*, c.Nome AS congregacaoNome FROM LancamentosTesouraria l JOIN Congregacoes c ON c.CongregacaoId = l.CongregacaoId WHERE l.LancamentoId = @id
    `);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Lançamento não encontrado." } };
      return;
    }
    const registro = atual.recordset[0];
    if (!auth.estaNoEscopo(usuario, registro.congregacaoNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    if (registro.FechamentoId) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este lançamento já está dentro de um mês fechado — não é mais possível anexar comprovante." } };
      return;
    }
    const { erro, buffer } = validarEProcessarComprovante(comprovanteBase64, mimeType);
    if (erro) { context.res = { status: 400, body: { sucesso: false, mensagem: erro } }; return; }
    let comprovanteUrl;
    try {
      comprovanteUrl = await storage.salvarDocumento(buffer, mimeType);
    } catch (erroUpload) {
      context.log.error("Falha ao salvar comprovante no Blob Storage:", erroUpload.message);
      context.res = { status: 200, body: { sucesso: false, mensagem: "Falha ao salvar o comprovante. Avise a equipe técnica: " + erroUpload.message } };
      return;
    }
    await pool.request().input("id", sql.Int, id).input("comprovanteUrl", sql.NVarChar(500), comprovanteUrl)
      .query(`UPDATE LancamentosTesouraria SET ComprovanteUrl = @comprovanteUrl WHERE LancamentoId = @id`);
    await registrarAuditoria({
      tabela: "LancamentosTesouraria", registroId: Number(id), acao: "Anexou comprovante ao lançamento", usuarioId: usuario.membroId
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Comprovante anexado." } };
    return;
  }

  if (req.method === "DELETE") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/tesouraria-lancamentos/{id}" } };
      return;
    }
    const { motivo } = req.body || {};
    if (!motivo || !motivo.trim()) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o motivo do cancelamento (igual à anotação na folha arrancada do bloco físico)." } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`
      SELECT l.*, c.Nome AS congregacaoNome FROM LancamentosTesouraria l JOIN Congregacoes c ON c.CongregacaoId = l.CongregacaoId WHERE l.LancamentoId = @id
    `);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Lançamento não encontrado." } };
      return;
    }
    const registro = atual.recordset[0];
    if (!auth.estaNoEscopo(usuario, registro.congregacaoNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    if (registro.FechamentoId) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este lançamento já está dentro de um mês fechado — não pode mais ser cancelado (corrija com um lançamento de ajuste)." } };
      return;
    }
    if (registro.Status === "CANCELADO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este lançamento já está cancelado." } };
      return;
    }
    await pool.request().input("id", sql.Int, id).input("motivo", sql.NVarChar(300), motivo.trim()).input("canceladoPor", sql.Int, usuario.membroId)
      .query(`UPDATE LancamentosTesouraria SET Status = 'CANCELADO', MotivoCancelamento = @motivo, CanceladoPor = @canceladoPor, CanceladoEm = SYSUTCDATETIME() WHERE LancamentoId = @id`);
    await registrarAuditoria({
      tabela: "LancamentosTesouraria", registroId: Number(id), acao: "Cancelou lançamento (folha arrancada do bloco)", usuarioId: usuario.membroId,
      dadosAntes: registro, dadosDepois: { motivo }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Lançamento nº ${registro.TermoNumero} cancelado — vai aparecer no relatório como cancelado.` } };
    return;
  }

  context.res = { status: 405, body: { erro: "Método não suportado." } };
};
