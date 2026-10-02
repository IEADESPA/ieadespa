// RelatorioInformeRendimentos (v4.19 — Informe anual de rendimentos)
// Gerado do próprio sistema (nunca digitado à mão): ministros (prebendas,
// IRRF na fonte — v4.10) e prestadores (pagamentos do ano — v4.5). É o
// Informe de Rendimentos pra declaração de IRPF.
// GET /api/informes-rendimentos/{ano?}
const { exigirGeral } = require("../shared/escopoRotas");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");

module.exports = async function (context, req) {
  // Matéria da Tesouraria Geral (CPF e rendimento de todos os ministros e prestadores): só o nível GERAL — papel Global E escopo de todas as congregações.
  const usuario = exigirGeral(req, context, "financeiro");
  if (!usuario) return;
  const ano = parseInt(context.bindingData.ano, 10) || new Date().getFullYear();
  if (ano < 1900 || ano > 2200) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Ano inválido." } };
    return;
  }
  const pool = await getPool();

  const ministros = await pool.request().input("ano", sql.Int, ano).query(`
    SELECT m.Nome AS nome, p.Cpf AS cpfCnpj, SUM(g.ValorBruto) AS valorTotal, SUM(g.IrrfRetido) AS irrfRetido
    FROM PrebendaGeracoes g
    JOIN Prebendados p ON p.PrebendadoId = g.PrebendadoId
    JOIN MembroReferencia m ON m.MembroId = p.MembroId
    WHERE YEAR(g.GeradaEm) = @ano GROUP BY m.Nome, p.Cpf ORDER BY m.Nome
  `);

  const prestadores = await pool.request().input("ano", sql.Int, ano).query(`
    SELECT f.Nome AS nome, f.CpfCnpj AS cpfCnpj, SUM(s.Valor) AS valorTotal
    FROM SaidasTesouraria s JOIN Fornecedores f ON f.FornecedorId = s.FornecedorId
    WHERE s.Status = 'PAGA' AND YEAR(s.PagoEm) = @ano GROUP BY f.Nome, f.CpfCnpj ORDER BY f.Nome
  `);

  // Trilha de acesso: a resposta traz CPF e rendimento de todos os ministros e prestadores.
  await registrarAuditoria({
    tabela: "InformeRendimentos", registroId: ano, acao: "Consultou o informe anual de rendimentos", usuarioId: usuario.membroId,
    dadosDepois: { ano, ministros: ministros.recordset.length, prestadores: prestadores.recordset.length }
  });

  context.res = {
    status: 200, headers: { "Content-Type": "application/json" },
    body: {
      anoReferencia: ano,
      ministros: ministros.recordset,
      prestadores: prestadores.recordset,
      totalMinistros: ministros.recordset.reduce((s, m) => s + Number(m.valorTotal), 0),
      totalIrrfRetido: ministros.recordset.reduce((s, m) => s + Number(m.irrfRetido), 0),
      totalPrestadores: prestadores.recordset.reduce((s, p) => s + Number(p.valorTotal), 0)
    }
  };
};
