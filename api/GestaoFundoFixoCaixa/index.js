// GestaoFundoFixoCaixa (v4.5, segunda parte)
// Fundo Fixo de Caixa (petty cash) por congregação — um teto de valor e um
// custodiante responsável, pra despesa miúda do dia a dia sem precisar da
// alçada cheia de uma Saída normal (GestaoSaidas). Saldo nunca é coluna
// própria — sempre CALCULADO NA LEITURA (shared/tesouraria.js::saldoFundoFixo),
// mesmo princípio de sempre. Criar/editar o fundo (definir teto e
// custodiante) é restrito a nível Global — é uma decisão financeira que
// atravessa a congregação; usar o fundo no dia a dia (GestaoMovimentosFundoFixo)
// é do custodiante local.
// GET  /api/fundos-fixos -> lista (com saldo calculado)
// GET  /api/fundos-fixos/{id} -> detalhe
// POST /api/fundos-fixos -> { congregacaoId, valorTeto, custodiantePor }
// PUT  /api/fundos-fixos/{id} -> { valorTeto?, custodiantePor?, status? }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const tesouraria = require("../shared/tesouraria");

const STATUS = ["ATIVO", "ENCERRADO"];

function exigirFinanceiroGlobal(req, context) {
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return null;
  if (usuario.nivel !== "GLOBAL") {
    context.res = { status: 403, body: { sucesso: false, mensagem: "Criar ou editar um Fundo Fixo de Caixa é restrito a papéis de nível Global." } };
    return null;
  }
  return usuario;
}

module.exports = async function (context, req) {
  const id = context.bindingData.id;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  const pool = await getPool();

  const SELECT_BASE = `
    SELECT f.FundoId AS fundoId, f.CongregacaoId AS congregacaoId, c.Nome AS congregacaoNome,
           f.ValorTeto AS valorTeto, f.CustodiantePor AS custodiantePor, m.Nome AS custodianteNome, f.Status AS status
    FROM FundosFixosCaixa f
    JOIN Congregacoes c ON c.CongregacaoId = f.CongregacaoId
    JOIN MembroReferencia m ON m.MembroId = f.CustodiantePor
  `;

  if (req.method === "GET" && !id) {
    const result = await pool.request().query(`${SELECT_BASE} ORDER BY c.Nome`);
    const fundos = result.recordset.filter(f => auth.estaNoEscopo(usuario, f.congregacaoNome));
    for (const fundo of fundos) fundo.saldoAtual = await tesouraria.saldoFundoFixo(pool, sql, fundo.fundoId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: fundos };
    return;
  }

  if (req.method === "GET" && id) {
    const result = await pool.request().input("id", sql.Int, id).query(`${SELECT_BASE} WHERE f.FundoId = @id`);
    if (result.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Fundo Fixo não encontrado." } };
      return;
    }
    const fundo = result.recordset[0];
    if (!auth.estaNoEscopo(usuario, fundo.congregacaoNome)) {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } };
      return;
    }
    fundo.saldoAtual = await tesouraria.saldoFundoFixo(pool, sql, fundo.fundoId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: fundo };
    return;
  }

  if (req.method === "POST") {
    const usuarioGlobal = exigirFinanceiroGlobal(req, context);
    if (!usuarioGlobal) return;
    const { congregacaoId, valorTeto, custodiantePor } = req.body || {};
    if (!congregacaoId || !valorTeto || Number(valorTeto) <= 0 || !custodiantePor) {
      context.res = { status: 400, body: { sucesso: false, mensagem: "Campos obrigatórios: congregacaoId, valorTeto (maior que zero), custodiantePor." } };
      return;
    }
    const existente = await pool.request().input("congregacaoId", sql.Int, congregacaoId).query(`SELECT FundoId FROM FundosFixosCaixa WHERE CongregacaoId = @congregacaoId`);
    if (existente.recordset.length > 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Esta congregação já tem um Fundo Fixo de Caixa cadastrado." } };
      return;
    }
    const criado = await pool.request()
      .input("congregacaoId", sql.Int, congregacaoId).input("valorTeto", sql.Decimal(10, 2), valorTeto)
      .input("custodiantePor", sql.Int, custodiantePor).input("criadoPor", sql.Int, usuarioGlobal.membroId)
      .query(`INSERT INTO FundosFixosCaixa (CongregacaoId, ValorTeto, CustodiantePor, CriadoPor)
              OUTPUT INSERTED.FundoId VALUES (@congregacaoId, @valorTeto, @custodiantePor, @criadoPor)`);
    const fundoId = criado.recordset[0].FundoId;
    await registrarAuditoria({
      tabela: "FundosFixosCaixa", registroId: fundoId, acao: "Criou Fundo Fixo de Caixa", usuarioId: usuarioGlobal.membroId,
      dadosDepois: { congregacaoId, valorTeto, custodiantePor }
    });
    context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Fundo Fixo de Caixa criado.", fundoId } };
    return;
  }

  if (req.method === "PUT") {
    if (!id) {
      context.res = { status: 400, body: { erro: "Informe o id na rota: /api/fundos-fixos/{id}" } };
      return;
    }
    const usuarioGlobal = exigirFinanceiroGlobal(req, context);
    if (!usuarioGlobal) return;
    const atual = await pool.request().input("id", sql.Int, id).query(`SELECT * FROM FundosFixosCaixa WHERE FundoId = @id`);
    if (atual.recordset.length === 0) {
      context.res = { status: 200, body: { sucesso: false, mensagem: "Fundo Fixo não encontrado." } };
      return;
    }
    const registro = atual.recordset[0];
    const { valorTeto, custodiantePor, status } = req.body || {};
    if (status && !STATUS.includes(status)) {
      context.res = { status: 400, body: { sucesso: false, mensagem: `Status inválido. Use um de: ${STATUS.join(", ")}.` } };
      return;
    }
    await pool.request().input("id", sql.Int, id)
      .input("valorTeto", sql.Decimal(10, 2), valorTeto || registro.ValorTeto)
      .input("custodiantePor", sql.Int, custodiantePor || registro.CustodiantePor)
      .input("status", sql.NVarChar(20), status || registro.Status)
      .query(`UPDATE FundosFixosCaixa SET ValorTeto = @valorTeto, CustodiantePor = @custodiantePor, Status = @status WHERE FundoId = @id`);
    await registrarAuditoria({
      tabela: "FundosFixosCaixa", registroId: Number(id), acao: "Atualizou Fundo Fixo de Caixa", usuarioId: usuarioGlobal.membroId,
      dadosAntes: registro, dadosDepois: { valorTeto, custodiantePor, status }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Fundo Fixo atualizado." } };
    return;
  }
};
