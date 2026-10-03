// GestaoNotasExplicativas (v4.9)
// Notas Explicativas das Demonstrações Contábeis (ITG 2002) — o único
// pedaço que não dá pra calcular: texto qualitativo escrito por humano
// (critérios contábeis adotados, eventos relevantes do exercício etc.),
// uma entrada por ano de referência.
// GET /api/notas-explicativas/{ano}
// PUT /api/notas-explicativas/{ano} -> { texto }
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const { inteiroEntre } = require("../shared/entradaFinanceira");

module.exports = async function (context, req) {
  // INSTITUCIONAL: as notas pertencem às demonstrações consolidadas da denominação (RelatorioDemonstracoesContabeis já é só do nível geral) — ler e editar são só do
  // nível geral (papel Global com escopo de todas as congregações).
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
  const ano = inteiroEntre(context.bindingData.ano, 1900, 2200);
  if (!ano) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe o ano na rota (AAAA)." } };
    return;
  }
  const pool = await getPool();

  if (req.method === "GET") {
    const result = await pool.request().input("ano", sql.Int, ano).query(`SELECT * FROM NotasExplicativas WHERE Ano = @ano`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { ano: Number(ano), texto: result.recordset[0] ? result.recordset[0].Texto : "" } };
    return;
  }

  if (req.method === "PUT") {
    const { texto } = req.body || {};
    if (texto !== undefined && texto !== null && typeof texto !== "string") {
      context.res = { status: 400, body: { sucesso: false, mensagem: "texto precisa ser um texto." } };
      return;
    }
    await pool.request().input("ano", sql.Int, ano).input("texto", sql.NVarChar(sql.MAX), texto || null).input("atualizadoPor", sql.Int, usuario.membroId)
      .query(`MERGE NotasExplicativas AS destino
              USING (SELECT @ano AS Ano) AS origem ON destino.Ano = origem.Ano
              WHEN MATCHED THEN UPDATE SET Texto = @texto, AtualizadoPor = @atualizadoPor, AtualizadoEm = SYSUTCDATETIME()
              WHEN NOT MATCHED THEN INSERT (Ano, Texto, AtualizadoPor, AtualizadoEm) VALUES (@ano, @texto, @atualizadoPor, SYSUTCDATETIME());`);
    await registrarAuditoria({
      tabela: "NotasExplicativas", registroId: Number(ano), acao: "Atualizou Notas Explicativas", usuarioId: usuario.membroId,
      dadosDepois: { ano }
    });
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Notas Explicativas atualizadas." } };
    return;
  }
};
