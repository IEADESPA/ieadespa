// GestaoDadosBancariosInstituicao (v4.7)
// Dados bancários da própria denominação (conta única, v4.1.3) usados
// como remetente no arquivo de remessa bancária (CNAB 240,
// GestaoRemessasBancarias) — nunca hardcoded no código. INSTITUCIONAL e sensível
// (agência, conta e convênio da conta única da igreja): ler e editar são só do nível GERAL
// (papel Global + escopo TODAS). O tesoureiro local não precisa dele — a remessa é da Tesouraria Geral.
// GET /api/dados-bancarios-instituicao
// PUT /api/dados-bancarios-instituicao -> { razaoSocial, cnpj, codigoBanco, nomeBanco, agencia, digitoAgencia, conta, digitoConta, codigoConvenio }
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { mascararCampos } = require("../shared/financeiro1Util");

// Na trilha de auditoria o CNPJ e o banco ficam legíveis; agência, conta e convênio só pelo fim do valor.
const CAMPOS_SENSIVEIS = ["agencia", "digitoAgencia", "conta", "digitoConta", "codigoConvenio"];

function linhaParaJson(l) {
  return {
    razaoSocial: l.RazaoSocial, cnpj: l.Cnpj, codigoBanco: l.CodigoBanco, nomeBanco: l.NomeBanco,
    agencia: l.Agencia, digitoAgencia: l.DigitoAgencia, conta: l.Conta, digitoConta: l.DigitoConta,
    codigoConvenio: l.CodigoConvenio
  };
}

module.exports = async function (context, req) {
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET") {
    const result = await pool.request().query(`SELECT * FROM DadosBancariosInstituicao WHERE InstituicaoId = 1`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset[0] ? linhaParaJson(result.recordset[0]) : {} };
    return;
  }

  if (req.method === "PUT") {
    const { razaoSocial, cnpj, codigoBanco, nomeBanco, agencia, digitoAgencia, conta, digitoConta, codigoConvenio } = req.body || {};
    const antes = await pool.request().query(`SELECT * FROM DadosBancariosInstituicao WHERE InstituicaoId = 1`);
    await pool.request()
      .input("razaoSocial", sql.NVarChar(200), razaoSocial || null).input("cnpj", sql.VarChar(18), cnpj || null)
      .input("codigoBanco", sql.VarChar(3), codigoBanco || null).input("nomeBanco", sql.NVarChar(100), nomeBanco || null)
      .input("agencia", sql.VarChar(10), agencia || null).input("digitoAgencia", sql.VarChar(2), digitoAgencia || null)
      .input("conta", sql.VarChar(20), conta || null).input("digitoConta", sql.VarChar(2), digitoConta || null)
      .input("codigoConvenio", sql.VarChar(20), codigoConvenio || null)
      .query(`UPDATE DadosBancariosInstituicao SET RazaoSocial = @razaoSocial, Cnpj = @cnpj, CodigoBanco = @codigoBanco,
                NomeBanco = @nomeBanco, Agencia = @agencia, DigitoAgencia = @digitoAgencia, Conta = @conta,
                DigitoConta = @digitoConta, CodigoConvenio = @codigoConvenio WHERE InstituicaoId = 1`);
    await registrarAuditoria({
      tabela: "DadosBancariosInstituicao", registroId: 1, acao: "Atualizou dados bancários da instituição", usuarioId: usuario.membroId,
      dadosAntes: mascararCampos(antes.recordset[0], CAMPOS_SENSIVEIS),
      dadosDepois: mascararCampos({ razaoSocial, cnpj, codigoBanco, agencia, conta }, CAMPOS_SENSIVEIS)
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Dados bancários atualizados." } };
    return;
  }
};
