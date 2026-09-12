// GestaoFrota (v4.23 — Frota de veículos, itens 1 e 5)
// Regimento Art. 155: veículo é BensPatrimoniais Tipo = VEICULO (v4.11);
// aqui entra o que é específico de frota — identificação visual obrigatória
// (§1º, II), se é o veículo presidencial (único elegível a custeio de
// combustível, §3º, I) e licenciamento, com alerta de vencimento. Seguro
// (v4.16, ApolicesSeguro) já é vinculado por BemId — só juntamos na leitura.
// GET  /api/frota -> lista veículos (BensPatrimoniais Tipo=VEICULO) + situação de frota
// GET  /api/frota/{bemId} -> detalhe
// POST /api/frota/{bemId} -> cadastra/atualiza dados de frota (upsert 1:1 por bemId)
//   { placa, identificacaoVisualBase64?, mimeType?, ehVeiculoPresidencial?, licenciamentoVencimento? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const storage = require("../shared/storage");

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];
const DIAS_ALERTA_VENCIMENTO = 60;

function estadoVencimento(data, hoje) {
  if (!data) return "NAO_INFORMADO";
  const d = new Date(data);
  if (d < hoje) return "VENCIDO";
  const dias = Math.ceil((d - hoje) / (1000 * 60 * 60 * 24));
  return dias <= DIAS_ALERTA_VENCIMENTO ? "A_VENCER" : "EM_DIA";
}

function linhaParaJson(v, hoje) {
  return {
    bemId: v.BemId, descricao: v.Descricao, congregacaoId: v.CongregacaoId, congregacaoNome: v.congregacaoNome,
    placa: v.Placa || null, identificacaoVisualUrl: v.IdentificacaoVisualUrl || null,
    identificacaoVisualPendente: !v.IdentificacaoVisualUrl,
    ehVeiculoPresidencial: !!v.EhVeiculoPresidencial,
    licenciamentoVencimento: v.LicenciamentoVencimento || null,
    licenciamentoSituacao: estadoVencimento(v.LicenciamentoVencimento, hoje),
    cadastroFrotaCompleto: v.VeiculoFrotaId != null
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
      SELECT b.BemId, b.Descricao, b.CongregacaoId, c.Nome AS congregacaoNome,
             v.VeiculoFrotaId, v.Placa, v.IdentificacaoVisualUrl, v.EhVeiculoPresidencial, v.LicenciamentoVencimento
      FROM BensPatrimoniais b
      LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
      LEFT JOIN VeiculosFrota v ON v.BemId = b.BemId
      WHERE b.Tipo = 'VEICULO'
      ORDER BY b.Descricao
    `);
    const veiculos = result.recordset.filter(v => auth.estaNoEscopo(usuario, v.congregacaoNome)).map(v => linhaParaJson(v, hoje));
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: veiculos };
    return;
  }

  if (req.method === "GET" && bemId) {
    const result = await pool.request().input("bemId", sql.Int, bemId).query(`
      SELECT b.BemId, b.Descricao, b.CongregacaoId, c.Nome AS congregacaoNome,
             v.VeiculoFrotaId, v.Placa, v.IdentificacaoVisualUrl, v.EhVeiculoPresidencial, v.LicenciamentoVencimento
      FROM BensPatrimoniais b
      LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId
      LEFT JOIN VeiculosFrota v ON v.BemId = b.BemId
      WHERE b.BemId = @bemId AND b.Tipo = 'VEICULO'
    `);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Veículo não encontrado (verifique se o bem é do tipo VEICULO)." } };
      return;
    }
    if (!auth.estaNoEscopo(usuario, result.recordset[0].congregacaoNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: linhaParaJson(result.recordset[0], hoje) };
    return;
  }

  if (req.method === "POST") {
    if (!bemId) {
      context.res = { status: 400, body: { erro: "Informe o bem na rota: /api/frota/{bemId}" } };
      return;
    }
    const bem = await pool.request().input("bemId", sql.Int, bemId).query(`
      SELECT b.BemId, c.Nome AS congregacaoNome FROM BensPatrimoniais b
      LEFT JOIN Congregacoes c ON c.CongregacaoId = b.CongregacaoId WHERE b.BemId = @bemId AND b.Tipo = 'VEICULO'
    `);
    if (bem.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Veículo não encontrado (verifique se o bem é do tipo VEICULO)." } };
      return;
    }
    if (!auth.estaNoEscopo(usuario, bem.recordset[0].congregacaoNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    const { placa, identificacaoVisualBase64, mimeType, ehVeiculoPresidencial, licenciamentoVencimento } = req.body || {};
    const existente = await pool.request().input("bemId", sql.Int, bemId).query(`SELECT * FROM VeiculosFrota WHERE BemId = @bemId`);

    let identificacaoVisualUrl = existente.recordset[0] ? existente.recordset[0].IdentificacaoVisualUrl : null;
    if (identificacaoVisualBase64) {
      if (!mimeType || !MIME_PERMITIDOS.includes(mimeType)) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Formato de identificação visual inválido." } };
        return;
      }
      identificacaoVisualUrl = await storage.salvarDocumento(Buffer.from(identificacaoVisualBase64, "base64"), mimeType);
    }

    if (existente.recordset.length === 0) {
      if (!placa || !placa.trim()) {
        context.res = { status: 400, body: { sucesso: false, mensagem: "Campo obrigatório: placa." } };
        return;
      }
      await pool.request().input("bemId", sql.Int, bemId).input("placa", sql.NVarChar(10), placa.trim().toUpperCase())
        .input("url", sql.NVarChar(500), identificacaoVisualUrl).input("presidencial", sql.Bit, ehVeiculoPresidencial ? 1 : 0)
        .input("licenc", sql.Date, licenciamentoVencimento || null).input("por", sql.Int, usuario.membroId)
        .query(`INSERT INTO VeiculosFrota (BemId, Placa, IdentificacaoVisualUrl, EhVeiculoPresidencial, LicenciamentoVencimento, RegistradoPor)
                VALUES (@bemId, @placa, @url, @presidencial, @licenc, @por)`);
      await registrarAuditoria({ tabela: "VeiculosFrota", registroId: Number(bemId), acao: "Cadastrou veículo na frota", usuarioId: usuario.membroId, dadosDepois: { placa } });
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Veículo cadastrado na frota." + (identificacaoVisualUrl ? "" : " ⚠️ Pendente: identificação visual obrigatória (Art. 155 §1º, II).") } };
      return;
    }

    const atual = existente.recordset[0];
    await pool.request().input("bemId", sql.Int, bemId)
      .input("placa", sql.NVarChar(10), placa ? placa.trim().toUpperCase() : atual.Placa)
      .input("url", sql.NVarChar(500), identificacaoVisualUrl)
      .input("presidencial", sql.Bit, ehVeiculoPresidencial !== undefined ? (ehVeiculoPresidencial ? 1 : 0) : atual.EhVeiculoPresidencial)
      .input("licenc", sql.Date, licenciamentoVencimento !== undefined ? (licenciamentoVencimento || null) : atual.LicenciamentoVencimento)
      .query(`UPDATE VeiculosFrota SET Placa = @placa, IdentificacaoVisualUrl = @url, EhVeiculoPresidencial = @presidencial, LicenciamentoVencimento = @licenc WHERE BemId = @bemId`);
    await registrarAuditoria({ tabela: "VeiculosFrota", registroId: Number(bemId), acao: "Atualizou dados de frota do veículo", usuarioId: usuario.membroId, dadosAntes: atual });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Dados de frota atualizados." } };
  }
};
