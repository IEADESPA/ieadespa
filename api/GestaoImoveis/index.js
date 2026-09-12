// GestaoImoveis (v4.21 — Receitas acessórias e imóveis, item 2)
// O patrimônio (v4.11, BensPatrimoniais Tipo = IMOVEL) registra escritura e
// título, mas não a situação de imunidade tributária do próprio imóvel
// (IPTU/ITBI) — que tem processo de reconhecimento na prefeitura, vigência e
// renovação próprios. Vigência/alerta calculados na leitura (mesmo espírito
// das apólices de seguro, v4.16).
// GET  /api/imoveis -> lista bens Tipo=IMOVEL com situação fiscal + alerta de renovação
// GET  /api/imoveis/{bemId} -> detalhe de um imóvel
// POST /api/imoveis/{bemId} -> cadastra/atualiza a situação fiscal (upsert 1:1 por bemId)
//   { iptuStatus?, iptuNumeroProcesso?, iptuVigenciaInicio?, iptuVigenciaFim?, itbiStatus?, itbiNumeroProcesso?, itbiDataReconhecimento? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

const IPTU_STATUS = ["ISENTO", "EM_ANALISE", "NEGADO"];
const ITBI_STATUS = ["ISENTO", "EM_ANALISE", "NEGADO", "NAO_APLICAVEL"];
const DIAS_ALERTA_RENOVACAO = 60;

function vigenciaImovel(situacao, hoje) {
  if (!situacao || !situacao.IptuVigenciaFim) return "NAO_INFORMADA";
  const fim = new Date(situacao.IptuVigenciaFim);
  if (fim < hoje) return "VENCIDA";
  const diasParaVencer = Math.ceil((fim - hoje) / (1000 * 60 * 60 * 24));
  if (diasParaVencer <= DIAS_ALERTA_RENOVACAO) return "A_VENCER";
  return "VIGENTE";
}

function linhaParaJson(b, hoje) {
  const vigencia = vigenciaImovel(b, hoje);
  return {
    bemId: b.BemId, descricao: b.Descricao, congregacaoId: b.CongregacaoId, congregacaoNome: b.congregacaoNome,
    ehTemploSede: b.EhTemploSede,
    iptuStatus: b.IptuStatus || null, iptuNumeroProcesso: b.IptuNumeroProcesso || null,
    iptuVigenciaInicio: b.IptuVigenciaInicio || null, iptuVigenciaFim: b.IptuVigenciaFim || null,
    itbiStatus: b.ItbiStatus || null, itbiNumeroProcesso: b.ItbiNumeroProcesso || null,
    itbiDataReconhecimento: b.ItbiDataReconhecimento || null,
    vigenciaIptu: vigencia,
    alertaRenovacao: vigencia === "VENCIDA" || vigencia === "A_VENCER",
    situacaoCadastrada: b.ImovelSituacaoFiscalId != null
  };
}

module.exports = async function (context, req) {
  const bemId = context.bindingData.bemId;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();
  const hoje = new Date();

  if (req.method === "GET" && !bemId) {
    const result = await pool.request().query(`
      SELECT b.BemId, b.Descricao, b.CongregacaoId, b.EhTemploSede, c.Nome AS congregacaoNome,
             f.ImovelSituacaoFiscalId, f.IptuStatus, f.IptuNumeroProcesso, f.IptuVigenciaInicio, f.IptuVigenciaFim,
             f.ItbiStatus, f.ItbiNumeroProcesso, f.ItbiDataReconhecimento
      FROM BensPatrimoniais b
      LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
      LEFT JOIN ImoveisSituacaoFiscal f ON f.BemId = b.BemId
      WHERE b.Tipo = 'IMOVEL'
      ORDER BY b.Descricao
    `);
    const imoveis = result.recordset.filter(b => auth.estaNoEscopo(usuario, b.congregacaoNome)).map(b => linhaParaJson(b, hoje));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: imoveis };
    return;
  }

  if (req.method === "GET" && bemId) {
    const result = await pool.request().input("bemId", sql.Int, bemId).query(`
      SELECT b.BemId, b.Descricao, b.CongregacaoId, b.EhTemploSede, c.Nome AS congregacaoNome,
             f.ImovelSituacaoFiscalId, f.IptuStatus, f.IptuNumeroProcesso, f.IptuVigenciaInicio, f.IptuVigenciaFim,
             f.ItbiStatus, f.ItbiNumeroProcesso, f.ItbiDataReconhecimento
      FROM BensPatrimoniais b
      LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
      LEFT JOIN ImoveisSituacaoFiscal f ON f.BemId = b.BemId
      WHERE b.BemId = @bemId AND b.Tipo = 'IMOVEL'
    `);
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
    const { iptuStatus, iptuNumeroProcesso, iptuVigenciaInicio, iptuVigenciaFim, itbiStatus, itbiNumeroProcesso, itbiDataReconhecimento } = req.body || {};
    if (iptuStatus && !IPTU_STATUS.includes(iptuStatus)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `iptuStatus inválido. Use um de: ${IPTU_STATUS.join(", ")}.` } };
      return;
    }
    if (itbiStatus && !ITBI_STATUS.includes(itbiStatus)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `itbiStatus inválido. Use um de: ${ITBI_STATUS.join(", ")}.` } };
      return;
    }

    const existente = await pool.request().input("bemId", sql.Int, bemId).query(`SELECT * FROM ImoveisSituacaoFiscal WHERE BemId = @bemId`);

    if (existente.recordset.length === 0) {
      await pool.request().input("bemId", sql.Int, bemId)
        .input("iptuStatus", sql.NVarChar(20), iptuStatus || "EM_ANALISE").input("iptuProcesso", sql.NVarChar(50), iptuNumeroProcesso || null)
        .input("iptuIni", sql.Date, iptuVigenciaInicio || null).input("iptuFim", sql.Date, iptuVigenciaFim || null)
        .input("itbiStatus", sql.NVarChar(20), itbiStatus || "NAO_APLICAVEL").input("itbiProcesso", sql.NVarChar(50), itbiNumeroProcesso || null)
        .input("itbiData", sql.Date, itbiDataReconhecimento || null).input("por", sql.Int, usuario.membroId)
        .query(`INSERT INTO ImoveisSituacaoFiscal (BemId, IptuStatus, IptuNumeroProcesso, IptuVigenciaInicio, IptuVigenciaFim, ItbiStatus, ItbiNumeroProcesso, ItbiDataReconhecimento, RegistradoPor)
                VALUES (@bemId, @iptuStatus, @iptuProcesso, @iptuIni, @iptuFim, @itbiStatus, @itbiProcesso, @itbiData, @por)`);
      await registrarAuditoria({
        tabela: "ImoveisSituacaoFiscal", registroId: Number(bemId), acao: "Cadastrou situação fiscal do imóvel", usuarioId: usuario.membroId,
        dadosDepois: { iptuStatus, itbiStatus }
      });
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Situação fiscal do imóvel cadastrada." } };
      return;
    }

    const atual = existente.recordset[0];
    await pool.request().input("bemId", sql.Int, bemId)
      .input("iptuStatus", sql.NVarChar(20), iptuStatus || atual.IptuStatus).input("iptuProcesso", sql.NVarChar(50), iptuNumeroProcesso !== undefined ? iptuNumeroProcesso : atual.IptuNumeroProcesso)
      .input("iptuIni", sql.Date, iptuVigenciaInicio !== undefined ? iptuVigenciaInicio : atual.IptuVigenciaInicio).input("iptuFim", sql.Date, iptuVigenciaFim !== undefined ? iptuVigenciaFim : atual.IptuVigenciaFim)
      .input("itbiStatus", sql.NVarChar(20), itbiStatus || atual.ItbiStatus).input("itbiProcesso", sql.NVarChar(50), itbiNumeroProcesso !== undefined ? itbiNumeroProcesso : atual.ItbiNumeroProcesso)
      .input("itbiData", sql.Date, itbiDataReconhecimento !== undefined ? itbiDataReconhecimento : atual.ItbiDataReconhecimento)
      .query(`UPDATE ImoveisSituacaoFiscal SET IptuStatus = @iptuStatus, IptuNumeroProcesso = @iptuProcesso, IptuVigenciaInicio = @iptuIni, IptuVigenciaFim = @iptuFim,
              ItbiStatus = @itbiStatus, ItbiNumeroProcesso = @itbiProcesso, ItbiDataReconhecimento = @itbiData, AtualizadoEm = SYSUTCDATETIME() WHERE BemId = @bemId`);
    await registrarAuditoria({
      tabela: "ImoveisSituacaoFiscal", registroId: Number(bemId), acao: "Atualizou situação fiscal do imóvel", usuarioId: usuario.membroId,
      dadosAntes: atual, dadosDepois: { iptuStatus, itbiStatus }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Situação fiscal do imóvel atualizada." } };
  }
};
