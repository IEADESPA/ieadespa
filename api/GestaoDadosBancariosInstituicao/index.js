// GestaoDadosBancariosInstituicao (v4.7)
// Dados bancários da própria denominação (conta única, v4.1.3) usados
// como remetente no arquivo de remessa bancária (CNAB 240,
// GestaoRemessasBancarias) — nunca hardcoded no código, editável só por
// nível Global (é dado sensível, cross-cutting).
// GET /api/dados-bancarios-instituicao
// PUT /api/dados-bancarios-instituicao -> { razaoSocial, cnpj, codigoBanco, nomeBanco, agencia, digitoAgencia, conta, digitoConta, codigoConvenio }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

function linhaParaJson(l) {
  return {
    razaoSocial: l.RazaoSocial, cnpj: l.Cnpj, codigoBanco: l.CodigoBanco, nomeBanco: l.NomeBanco,
    agencia: l.Agencia, digitoAgencia: l.DigitoAgencia, conta: l.Conta, digitoConta: l.DigitoConta,
    codigoConvenio: l.CodigoConvenio
  };
}

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  if (req.method === "GET") {
    const result = await pool.request().query(`SELECT * FROM DadosBancariosInstituicao WHERE InstituicaoId = 1`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: result.recordset[0] ? linhaParaJson(result.recordset[0]) : {} };
    return;
  }

  if (req.method === "PUT") {
    if (usuario.nivel !== "GLOBAL") {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Editar os dados bancários da instituição é restrito a papéis de nível Global." } };
      return;
    }
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
      dadosAntes: antes.recordset[0], dadosDepois: { razaoSocial, cnpj, codigoBanco, agencia, conta }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Dados bancários atualizados." } };
    return;
  }
};
