// GestaoContasReceber (v4.6)
// Registro de valor ESPERADO, ainda não recebido (ex: acordo de
// parcelamento com um dizimista, boleto emitido pra terceiro) — não conta
// no Centro de Custo (v4.1.3) nem em nenhum relatório financeiro de
// verdade enquanto não for CONFIRMADO: só na confirmação nasce um
// LancamentoTesouraria de verdade (mesmo Termo nº de sempre, mesma
// validação de mês fechado) — não duplica dinheiro, só antecipa a
// visibilidade de "isso ainda vai entrar".
// "Vencido" nunca é gravado — é CALCULADO NA LEITURA (hoje > data de
// vencimento e ainda não confirmado/cancelado), mesmo princípio de
// sempre. Cancelamento nunca é exclusão (mesmo princípio de v4.1.1).
// GET  /api/contas-receber?congregacaoId=&status= -> lista dentro do escopo (status calculado: PREVISTO|VENCIDO|RECEBIDO|CANCELADO)
// GET  /api/contas-receber/{id} -> detalhe
// POST /api/contas-receber -> { congregacaoId, dizimistaId?, nomeAvulso?, tipo, descricao?, valor, dataVencimento, campanhaId? }
// PUT  /api/contas-receber/{id} -> { acao: 'CONFIRMAR'|'CANCELAR', motivo?, formaPagamento?, valorPix?, mesReferencia?, comprovanteBase64?, mimeType? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");
const tesouraria = require("../shared/tesouraria");

const FORMAS = ["DINHEIRO", "PIX", "MISTO"];
const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;
const REGEX_MES = /^\d{4}-\d{2}$/;
const ACOES = ["CONFIRMAR", "CANCELAR"];

const SELECT_BASE = `
  SELECT cr.ContaReceberId AS contaReceberId, cr.CongregacaoId AS congregacaoId, c.Nome AS congregacaoNome,
         cr.DizimistaId AS dizimistaId, d.Nome AS dizimistaNome, cr.NomeAvulso AS nomeAvulso,
         cr.Tipo AS tipo, cat.Nome AS categoriaNome, cr.Descricao AS descricao, cr.Valor AS valor,
         CONVERT(varchar(10), cr.DataVencimento, 120) AS dataVencimento, cr.CampanhaId AS campanhaId, camp.Nome AS campanhaNome,
         cr.Status AS statusGravado, cr.LancamentoId AS lancamentoId, cr.MotivoCancelamento AS motivoCancelamento,
         CONVERT(varchar(33), cr.CriadoEm, 126) AS criadoEm,
         DATEDIFF(DAY, CAST(SYSUTCDATETIME() AS DATE), cr.DataVencimento) AS diasParaVencimento
  FROM ContasAReceber cr
  JOIN Congregacoes c ON c.CongregacaoId = cr.CongregacaoId
  LEFT JOIN Dizimistas d ON d.DizimistaId = cr.DizimistaId
  LEFT JOIN CategoriasEntrada cat ON cat.Codigo = cr.Tipo
  LEFT JOIN Campanhas camp ON camp.CampanhaId = cr.CampanhaId
`;

// Status exibido: PREVISTO vira VENCIDO calculado na leitura quando já
// passou da data — nunca uma marcação manual de "atrasado".
function statusCalculado(linha) {
  if (linha.statusGravado === "PREVISTO" && linha.diasParaVencimento < 0) return "VENCIDO";
  return linha.statusGravado;
}

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET" && !id) {
    const { congregacaoId, status } = req.query || {};
    const request = pool.request();
    let where = "1=1";
    if (congregacaoId) { request.input("congregacaoId", sql.Int, congregacaoId); where += " AND cr.CongregacaoId = @congregacaoId"; }
    const result = await request.query(`${SELECT_BASE} WHERE ${where} ORDER BY cr.DataVencimento ASC`);
    let contas = result.recordset.filter(c => auth.estaNoEscopo(usuario, c.congregacaoNome))
      .map(c => Object.assign({}, c, { status: statusCalculado(c) }));
    if (status) contas = contas.filter(c => c.status === status);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: contas };
    return;
  }

  if (req.method === "GET" && id) {
    const result = await pool.request().input("id", sql.Int, id).query(`${SELECT_BASE} WHERE cr.ContaReceberId = @id`);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Conta a receber não encontrada." } };
      return;
    }
    const conta = result.recordset[0];
    if (!auth.estaNoEscopo(usuario, conta.congregacaoNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: Object.assign({}, conta, { status: statusCalculado(conta) }) };
    return;
  }

  if (req.method === "POST") {
    const { congregacaoId, dizimistaId, nomeAvulso, tipo, descricao, valor, dataVencimento, campanhaId } = req.body || {};
    if (!congregacaoId || !tipo || !valor || !dataVencimento) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: congregacaoId, tipo, valor, dataVencimento." } };
      return;
    }
    if (Number(valor) <= 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Valor deve ser maior que zero." } };
      return;
    }
    if (!dizimistaId && (!nomeAvulso || !nomeAvulso.trim()) && (!descricao || !descricao.trim())) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o dizimista, um nome avulso, ou ao menos uma descrição da origem." } };
      return;
    }
    const congNome = await pool.request().input("id", sql.Int, congregacaoId).query(`SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id`);
    if (congNome.recordset.length === 0 || !auth.estaNoEscopo(usuario, congNome.recordset[0].Nome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    const categoria = await pool.request().input("codigo", sql.NVarChar(30), tipo).query(`SELECT Nome FROM CategoriasEntrada WHERE Codigo = @codigo AND Ativa = 1`);
    if (categoria.recordset.length === 0) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Categoria de entrada inválida ou inativa." } };
      return;
    }
    if (campanhaId) {
      const campanha = await pool.request().input("id", sql.Int, campanhaId).query(`SELECT Status FROM Campanhas WHERE CampanhaId = @id`);
      if (campanha.recordset.length === 0 || campanha.recordset[0].Status !== "ATIVA") {
        context.res = { status: 200, body: { sucesso: false, mensagem: "Campanha inválida ou não está ativa." } };
        return;
      }
    }

    const criada = await pool.request()
      .input("congregacaoId", sql.Int, congregacaoId)
      .input("dizimistaId", sql.Int, dizimistaId || null)
      .input("nomeAvulso", sql.NVarChar(200), dizimistaId ? null : (nomeAvulso || null))
      .input("tipo", sql.NVarChar(30), tipo)
      .input("descricao", sql.NVarChar(300), descricao ? descricao.trim() : null)
      .input("valor", sql.Decimal(10, 2), valor)
      .input("dataVencimento", sql.Date, dataVencimento)
      .input("campanhaId", sql.Int, campanhaId || null)
      .input("registradoPor", sql.Int, usuario.membroId)
      .query(`INSERT INTO ContasAReceber (CongregacaoId, DizimistaId, NomeAvulso, Tipo, Descricao, Valor, DataVencimento, CampanhaId, RegistradoPor)
              OUTPUT INSERTED.ContaReceberId
              VALUES (@congregacaoId, @dizimistaId, @nomeAvulso, @tipo, @descricao, @valor, @dataVencimento, @campanhaId, @registradoPor)`);
    const contaReceberId = criada.recordset[0].ContaReceberId;

    await registrarAuditoria({
      tabela: "ContasAReceber", registroId: contaReceberId, acao: "Registrou conta a receber", usuarioId: usuario.membroId,
      dadosDepois: { congregacaoId, tipo, valor, dataVencimento, campanhaId: campanhaId || null }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Conta a receber registrada — ainda não conta no Centro de Custo, só na confirmação do recebimento.", contaReceberId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/contas-receber/{id}" } };
      return;
    }
    const { acao, motivo, formaPagamento, valorPix, mesReferencia, comprovanteBase64, mimeType } = req.body || {};
    if (!ACOES.includes(acao)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Ação inválida. Use uma de: ${ACOES.join(", ")}.` } };
      return;
    }
    const atual = await pool.request().input("id", sql.Int, id).query(`
      SELECT cr.*, c.Nome AS congregacaoNome FROM ContasAReceber cr JOIN Congregacoes c ON c.CongregacaoId = cr.CongregacaoId WHERE cr.ContaReceberId = @id
    `);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Conta a receber não encontrada." } };
      return;
    }
    const registro = atual.recordset[0];
    if (!auth.estaNoEscopo(usuario, registro.congregacaoNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    if (registro.Status !== "PREVISTO") {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta conta a receber já foi confirmada ou cancelada." } };
      return;
    }

    if (acao === "CANCELAR") {
      if (!motivo || !motivo.trim()) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o motivo do cancelamento." } };
        return;
      }
      await pool.request().input("id", sql.Int, id).input("motivo", sql.NVarChar(300), motivo.trim()).input("canceladoPor", sql.Int, usuario.membroId)
        .query(`UPDATE ContasAReceber SET Status = 'CANCELADO', MotivoCancelamento = @motivo, CanceladoPor = @canceladoPor, CanceladoEm = SYSUTCDATETIME() WHERE ContaReceberId = @id`);
      await registrarAuditoria({
        tabela: "ContasAReceber", registroId: Number(id), acao: "Cancelou conta a receber", usuarioId: usuario.membroId,
        dadosAntes: registro, dadosDepois: { motivo }
      });
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "Conta a receber cancelada." } };
      return;
    }

    // CONFIRMAR — vira um LancamentoTesouraria de verdade, com o mesmo
    // Termo nº sequencial de sempre e a mesma checagem de mês fechado.
    if (!FORMAS.includes(formaPagamento)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Forma de pagamento inválida. Use um de: ${FORMAS.join(", ")}.` } };
      return;
    }
    if (!REGEX_MES.test(mesReferencia)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "mesReferencia deve estar no formato AAAA-MM." } };
      return;
    }
    let valorPixFinal = null;
    if (formaPagamento === "MISTO") {
      if (valorPix == null || Number(valorPix) <= 0 || Number(valorPix) >= Number(registro.Valor)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Em pagamento misto, informe valorPix maior que zero e menor que o valor total." } };
        return;
      }
      valorPixFinal = valorPix;
    }
    const fechado = await pool.request()
      .input("congregacaoId", sql.Int, registro.CongregacaoId).input("mesReferencia", sql.Char(7), mesReferencia)
      .query(`SELECT TOP 1 FechamentoId FROM FechamentosTesouraria WHERE CongregacaoId = @congregacaoId AND MesReferencia = @mesReferencia`);
    if (fechado.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Este mês já foi fechado — confirme num mês ainda aberto." } };
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

    const termoNumero = await tesouraria.proximoNumeroTermo(pool, sql, registro.CongregacaoId);
    const lancamentoCriado = await pool.request()
      .input("congregacaoId", sql.Int, registro.CongregacaoId)
      .input("dizimistaId", sql.Int, registro.DizimistaId)
      .input("nomeAvulso", sql.NVarChar(200), registro.DizimistaId ? null : registro.NomeAvulso)
      .input("termoNumero", sql.Int, termoNumero)
      .input("tipo", sql.NVarChar(30), registro.Tipo)
      .input("descricao", sql.NVarChar(300), registro.Descricao)
      .input("valor", sql.Decimal(10, 2), registro.Valor)
      .input("formaPagamento", sql.NVarChar(20), formaPagamento)
      .input("valorPix", sql.Decimal(10, 2), valorPixFinal)
      .input("comprovanteUrl", sql.NVarChar(500), comprovanteUrl)
      .input("mesReferencia", sql.Char(7), mesReferencia)
      .input("registradoPor", sql.Int, usuario.membroId)
      .input("campanhaId", sql.Int, registro.CampanhaId)
      .query(`INSERT INTO LancamentosTesouraria
                (CongregacaoId, DizimistaId, NomeAvulso, TermoNumero, Tipo, Descricao, Valor, FormaPagamento, ValorPix, ComprovanteUrl, MesReferencia, RegistradoPor, CampanhaId)
              OUTPUT INSERTED.LancamentoId
              VALUES (@congregacaoId, @dizimistaId, @nomeAvulso, @termoNumero, @tipo, @descricao, @valor, @formaPagamento, @valorPix, @comprovanteUrl, @mesReferencia, @registradoPor, @campanhaId)`);
    const lancamentoId = lancamentoCriado.recordset[0].LancamentoId;

    await pool.request().input("id", sql.Int, id).input("lancamentoId", sql.Int, lancamentoId).input("confirmadoPor", sql.Int, usuario.membroId)
      .query(`UPDATE ContasAReceber SET Status = 'RECEBIDO', LancamentoId = @lancamentoId, ConfirmadoPor = @confirmadoPor, ConfirmadoEm = SYSUTCDATETIME() WHERE ContaReceberId = @id`);

    await registrarAuditoria({
      tabela: "ContasAReceber", registroId: Number(id), acao: "Confirmou recebimento (gerou lançamento)", usuarioId: usuario.membroId,
      dadosAntes: registro, dadosDepois: { lancamentoId, termoNumero, formaPagamento }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: `✅ Recebimento confirmado — Termo nº ${termoNumero} gerado.`, lancamentoId, termoNumero } };
    return;
  }
};
