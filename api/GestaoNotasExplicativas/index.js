// GestaoNotasExplicativas (v4.9)
// Notas Explicativas das Demonstrações Contábeis (ITG 2002) — o único
// pedaço que não dá pra calcular: texto qualitativo escrito por humano
// (critérios contábeis adotados, eventos relevantes do exercício etc.),
// uma entrada por ano de referência.
// GET /api/notas-explicativas/{ano}
// PUT /api/notas-explicativas/{ano} -> { texto }
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  const ano = context.bindingData.ano;
  const usuario = auth.exigirPermissao(req, context, "financeiro");
  if (!usuario) return;
  if (!ano) {
    context.res = { status: 400, body: { erro: "Informe o ano na rota." } };
    return;
  }
  const pool = await getPool();

  if (req.method === "GET") {
    const result = await pool.request().input("ano", sql.Int, ano).query(`SELECT * FROM NotasExplicativas WHERE Ano = @ano`);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { ano: Number(ano), texto: result.recordset[0] ? result.recordset[0].Texto : "" } };
    return;
  }

  if (req.method === "PUT") {
    if (usuario.nivel !== "GLOBAL") {
      context.res = { status: 403, body: { sucesso: false, mensagem: "Editar as Notas Explicativas é restrito a papéis de nível Global." } };
      return;
    }
    const { texto } = req.body || {};
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
