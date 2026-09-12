// GestaoImoveis (v4.21 — item 2; v4.24 acrescenta AVCB/Alvará)
// O patrimônio (v4.11, BensPatrimoniais Tipo = IMOVEL) registra escritura e
// título, mas não a situação de imunidade tributária do próprio imóvel
// (IPTU/ITBI) nem seu licenciamento de segurança/uso (AVCB, Alvará/Habite-se)
// — cada um com processo, vigência e renovação próprios. Vigência/alerta
// calculados na leitura (mesmo espírito das apólices de seguro, v4.16).
// AVCB/Alvará vigentes aqui são o que trava de verdade a inauguração de obra
// nova (GestaoObras, v4.24) — "impedidoReceberCulto" abaixo é só um ALERTA:
// o sistema não tem hoje uma agenda de culto pra travar de fato.
// GET  /api/imoveis -> lista bens Tipo=IMOVEL com situação fiscal + alertas de vencimento
// GET  /api/imoveis/{bemId} -> detalhe de um imóvel
// POST /api/imoveis/{bemId} -> cadastra/atualiza a situação fiscal (upsert 1:1 por bemId)
//   { iptuStatus?, iptuNumeroProcesso?, iptuVigenciaInicio?, iptuVigenciaFim?, itbiStatus?, itbiNumeroProcesso?, itbiDataReconhecimento?,
//     avcbNumero?, avcbVigenciaFim?, avcbDocumentoBase64?, alvaraNumero?, alvaraVigenciaFim?, alvaraDocumentoBase64?, mimeType? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");

const IPTU_STATUS = ["ISENTO", "EM_ANALISE", "NEGADO"];
const ITBI_STATUS = ["ISENTO", "EM_ANALISE", "NEGADO", "NAO_APLICAVEL"];
const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const DIAS_ALERTA_RENOVACAO = 60;

function estadoVigencia(dataFim, hoje) {
  if (!dataFim) return "NAO_INFORMADA";
  const fim = new Date(dataFim);
  if (fim < hoje) return "VENCIDA";
  const diasParaVencer = Math.ceil((fim - hoje) / (1000 * 60 * 60 * 24));
  return diasParaVencer <= DIAS_ALERTA_RENOVACAO ? "A_VENCER" : "VIGENTE";
}

function linhaParaJson(b, hoje) {
  const vigenciaIptu = estadoVigencia(b.IptuVigenciaFim, hoje);
  const vigenciaAvcb = estadoVigencia(b.AvcbVigenciaFim, hoje);
  const vigenciaAlvara = estadoVigencia(b.AlvaraVigenciaFim, hoje);
  return {
    bemId: b.BemId, descricao: b.Descricao, congregacaoId: b.CongregacaoId, congregacaoNome: b.congregacaoNome,
    ehTemploSede: b.EhTemploSede,
    iptuStatus: b.IptuStatus || null, iptuNumeroProcesso: b.IptuNumeroProcesso || null,
    iptuVigenciaInicio: b.IptuVigenciaInicio || null, iptuVigenciaFim: b.IptuVigenciaFim || null,
    itbiStatus: b.ItbiStatus || null, itbiNumeroProcesso: b.ItbiNumeroProcesso || null,
    itbiDataReconhecimento: b.ItbiDataReconhecimento || null,
    avcbNumero: b.AvcbNumero || null, avcbVigenciaFim: b.AvcbVigenciaFim || null, avcbDocumentoUrl: b.AvcbDocumentoUrl || null,
    alvaraNumero: b.AlvaraNumero || null, alvaraVigenciaFim: b.AlvaraVigenciaFim || null, alvaraDocumentoUrl: b.AlvaraDocumentoUrl || null,
    vigenciaIptu, vigenciaAvcb, vigenciaAlvara,
    alertaRenovacao: [vigenciaIptu, vigenciaAvcb, vigenciaAlvara].some(v => v === "VENCIDA" || v === "A_VENCER"),
    impedidoReceberCulto: vigenciaAvcb === "VENCIDA",
    alertaImpedidoReceberCultoObs: vigenciaAvcb === "VENCIDA" ? "⚠️ AVCB vencido — Regimento veda receber culto sem AVCB vigente (alerta; o sistema não tem agenda de culto pra travar de fato)." : null,
    situacaoCadastrada: b.ImovelSituacaoFiscalId != null
  };
}

module.exports = async function (context, req) {
  const bemId = context.bindingData.bemId;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();
  const hoje = new Date();

  const SELECT_BASE = `
    SELECT b.BemId, b.Descricao, b.CongregacaoId, b.EhTemploSede, c.Nome AS congregacaoNome,
           f.ImovelSituacaoFiscalId, f.IptuStatus, f.IptuNumeroProcesso, f.IptuVigenciaInicio, f.IptuVigenciaFim,
           f.ItbiStatus, f.ItbiNumeroProcesso, f.ItbiDataReconhecimento,
           f.AvcbNumero, f.AvcbVigenciaFim, f.AvcbDocumentoUrl, f.AlvaraNumero, f.AlvaraVigenciaFim, f.AlvaraDocumentoUrl
    FROM BensPatrimoniais b
    LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
    LEFT JOIN ImoveisSituacaoFiscal f ON f.BemId = b.BemId
  `;

  if (req.method === "GET" && !bemId) {
    const result = await pool.request().query(`${SELECT_BASE} WHERE b.Tipo = 'IMOVEL' ORDER BY b.Descricao`);
    const imoveis = result.recordset.filter(b => auth.estaNoEscopo(usuario, b.congregacaoNome)).map(b => linhaParaJson(b, hoje));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: imoveis };
    return;
  }

  if (req.method === "GET" && bemId) {
    const result = await pool.request().input("bemId", sql.Int, bemId).query(`${SELECT_BASE} WHERE b.BemId = @bemId AND b.Tipo = 'IMOVEL'`);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Imóvel não encontrado (verifique se o bem é do tipo IMOVEL)." } };
      return;
    }
    const imovel = result.recordset[0];
    if (!auth.estaNoEscopo(usuario, imovel.congregacaoNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: linhaParaJson(imovel, hoje) };
    return;
  }

  if (req.method === "POST") {
    if (!bemId) {
      context.res = { status: 400, body: { erro: "Informe o bem na rota: /api/imoveis/{bemId}" } };
      return;
    }
    const bem = await pool.request().input("bemId", sql.Int, bemId).query(`
      SELECT b.BemId, b.CongregacaoId, c.Nome AS congregacaoNome FROM BensPatrimoniais b
      LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId WHERE b.BemId = @bemId AND b.Tipo = 'IMOVEL'
    `);
    if (bem.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Imóvel não encontrado (verifique se o bem é do tipo IMOVEL)." } };
      return;
    }
    if (!auth.estaNoEscopo(usuario, bem.recordset[0].congregacaoNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    const {
      iptuStatus, iptuNumeroProcesso, iptuVigenciaInicio, iptuVigenciaFim, itbiStatus, itbiNumeroProcesso, itbiDataReconhecimento,
      avcbNumero, avcbVigenciaFim, avcbDocumentoBase64, alvaraNumero, alvaraVigenciaFim, alvaraDocumentoBase64, mimeType
    } = req.body || {};
    if (iptuStatus && !IPTU_STATUS.includes(iptuStatus)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `iptuStatus inválido. Use um de: ${IPTU_STATUS.join(", ")}.` } };
      return;
    }
    if (itbiStatus && !ITBI_STATUS.includes(itbiStatus)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `itbiStatus inválido. Use um de: ${ITBI_STATUS.join(", ")}.` } };
      return;
    }
    if ((avcbDocumentoBase64 || alvaraDocumentoBase64) && (!mimeType || !MIME_PERMITIDOS.includes(mimeType))) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Formato de documento inválido." } };
      return;
    }

    const existente = await pool.request().input("bemId", sql.Int, bemId).query(`SELECT * FROM ImoveisSituacaoFiscal WHERE BemId = @bemId`);
    const atual = existente.recordset[0] || {};
    const avcbUrl = avcbDocumentoBase64 ? await storage.salvarDocumento(Buffer.from(avcbDocumentoBase64, "base64"), mimeType) : (atual.AvcbDocumentoUrl || null);
    const alvaraUrl = alvaraDocumentoBase64 ? await storage.salvarDocumento(Buffer.from(alvaraDocumentoBase64, "base64"), mimeType) : (atual.AlvaraDocumentoUrl || null);

    if (existente.recordset.length === 0) {
      await pool.request().input("bemId", sql.Int, bemId)
        .input("iptuStatus", sql.NVarChar(20), iptuStatus || "EM_ANALISE").input("iptuProcesso", sql.NVarChar(50), iptuNumeroProcesso || null)
        .input("iptuIni", sql.Date, iptuVigenciaInicio || null).input("iptuFim", sql.Date, iptuVigenciaFim || null)
        .input("itbiStatus", sql.NVarChar(20), itbiStatus || "NAO_APLICAVEL").input("itbiProcesso", sql.NVarChar(50), itbiNumeroProcesso || null)
        .input("itbiData", sql.Date, itbiDataReconhecimento || null)
        .input("avcbNumero", sql.NVarChar(50), avcbNumero || null).input("avcbFim", sql.Date, avcbVigenciaFim || null).input("avcbUrl", sql.NVarChar(500), avcbUrl)
        .input("alvaraNumero", sql.NVarChar(50), alvaraNumero || null).input("alvaraFim", sql.Date, alvaraVigenciaFim || null).input("alvaraUrl", sql.NVarChar(500), alvaraUrl)
        .input("por", sql.Int, usuario.membroId)
        .query(`INSERT INTO ImoveisSituacaoFiscal (BemId, IptuStatus, IptuNumeroProcesso, IptuVigenciaInicio, IptuVigenciaFim, ItbiStatus, ItbiNumeroProcesso, ItbiDataReconhecimento,
                  AvcbNumero, AvcbVigenciaFim, AvcbDocumentoUrl, AlvaraNumero, AlvaraVigenciaFim, AlvaraDocumentoUrl, RegistradoPor)
                VALUES (@bemId, @iptuStatus, @iptuProcesso, @iptuIni, @iptuFim, @itbiStatus, @itbiProcesso, @itbiData,
                  @avcbNumero, @avcbFim, @avcbUrl, @alvaraNumero, @alvaraFim, @alvaraUrl, @por)`);
      await registrarAuditoria({
        tabela: "ImoveisSituacaoFiscal", registroId: Number(bemId), acao: "Cadastrou situação fiscal/licenciamento do imóvel", usuarioId: usuario.membroId,
        dadosDepois: { iptuStatus, itbiStatus, avcbNumero, alvaraNumero }
      });
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Situação fiscal/licenciamento do imóvel cadastrada." } };
      return;
    }

    await pool.request().input("bemId", sql.Int, bemId)
      .input("iptuStatus", sql.NVarChar(20), iptuStatus || atual.IptuStatus).input("iptuProcesso", sql.NVarChar(50), iptuNumeroProcesso !== undefined ? iptuNumeroProcesso : atual.IptuNumeroProcesso)
      .input("iptuIni", sql.Date, iptuVigenciaInicio !== undefined ? iptuVigenciaInicio : atual.IptuVigenciaInicio).input("iptuFim", sql.Date, iptuVigenciaFim !== undefined ? iptuVigenciaFim : atual.IptuVigenciaFim)
      .input("itbiStatus", sql.NVarChar(20), itbiStatus || atual.ItbiStatus).input("itbiProcesso", sql.NVarChar(50), itbiNumeroProcesso !== undefined ? itbiNumeroProcesso : atual.ItbiNumeroProcesso)
      .input("itbiData", sql.Date, itbiDataReconhecimento !== undefined ? itbiDataReconhecimento : atual.ItbiDataReconhecimento)
      .input("avcbNumero", sql.NVarChar(50), avcbNumero !== undefined ? avcbNumero : atual.AvcbNumero)
      .input("avcbFim", sql.Date, avcbVigenciaFim !== undefined ? avcbVigenciaFim : atual.AvcbVigenciaFim).input("avcbUrl", sql.NVarChar(500), avcbUrl)
      .input("alvaraNumero", sql.NVarChar(50), alvaraNumero !== undefined ? alvaraNumero : atual.AlvaraNumero)
      .input("alvaraFim", sql.Date, alvaraVigenciaFim !== undefined ? alvaraVigenciaFim : atual.AlvaraVigenciaFim).input("alvaraUrl", sql.NVarChar(500), alvaraUrl)
      .query(`UPDATE ImoveisSituacaoFiscal SET IptuStatus = @iptuStatus, IptuNumeroProcesso = @iptuProcesso, IptuVigenciaInicio = @iptuIni, IptuVigenciaFim = @iptuFim,
              ItbiStatus = @itbiStatus, ItbiNumeroProcesso = @itbiProcesso, ItbiDataReconhecimento = @itbiData,
              AvcbNumero = @avcbNumero, AvcbVigenciaFim = @avcbFim, AvcbDocumentoUrl = @avcbUrl,
              AlvaraNumero = @alvaraNumero, AlvaraVigenciaFim = @alvaraFim, AlvaraDocumentoUrl = @alvaraUrl,
              AtualizadoEm = SYSUTCDATETIME() WHERE BemId = @bemId`);
    await registrarAuditoria({
      tabela: "ImoveisSituacaoFiscal", registroId: Number(bemId), acao: "Atualizou situação fiscal/licenciamento do imóvel", usuarioId: usuario.membroId,
      dadosAntes: atual, dadosDepois: { iptuStatus, itbiStatus, avcbNumero, alvaraNumero }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Situação fiscal/licenciamento do imóvel atualizada." } };
  }
};
