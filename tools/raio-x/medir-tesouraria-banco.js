// tools/raio-x/medir-tesouraria-banco.js — o tempo SÓ DO BANCO das consultas de lançamentos e saídas (17/11/2026), sem a transferência das linhas: no LocalDB a
// ponte do equipamento converte cada linha em texto e domina o tempo das listas grandes; aqui cada consulta vira uma soma sobre ela mesma (COUNT e SUM de uma coluna calculada, para o banco não pular as junções nem a marca de duplicidade), com e sem os
// índices da migração 175 (o script derruba os índices, mede, recria e mede de novo). Uso: cd tools/e2e-localdb && node -r ./shim-mssql.js ../raio-x/medir-tesouraria-banco.js
const fs = require("fs");
const path = require("path");
const L = require("../e2e-localdb/lib");
const { q, obterPool } = L;

const CONSULTAS = {
  "lançamentos da Geral, sem filtro": `SELECT l.LancamentoId, LEN(c.Nome) + LEN(ISNULL(d.Nome, N'')) + LEN(ISNULL(cat.Nome, N'')) + LEN(ISNULL(camp.Nome, N'')) AS peso FROM LancamentosTesouraria l JOIN Congregacoes c ON c.CongregacaoId = l.CongregacaoId
    LEFT JOIN Dizimistas d ON d.DizimistaId = l.DizimistaId LEFT JOIN CategoriasEntrada cat ON cat.Codigo = l.Tipo LEFT JOIN Campanhas camp ON camp.CampanhaId = l.CampanhaId`,
  "lançamentos de uma congregação no mês": `SELECT l.LancamentoId, LEN(c.Nome) AS peso FROM LancamentosTesouraria l JOIN Congregacoes c ON c.CongregacaoId = l.CongregacaoId
    WHERE l.CongregacaoId = @cong AND l.MesReferencia = @mes`,
  "saídas da Geral (com a marca de duplicidade)": `SELECT s.SaidaId, CASE WHEN EXISTS (SELECT 1 FROM SaidasTesouraria s2 WHERE s2.SaidaId <> s.SaidaId AND s2.FornecedorId = s.FornecedorId
    AND s2.Valor = s.Valor AND s2.Status NOT IN ('REJEITADA', 'CANCELADA') AND ABS(DATEDIFF(DAY, s2.SolicitadoEm, s.SolicitadoEm)) <= 7) THEN 1 ELSE 0 END AS peso
    FROM SaidasTesouraria s JOIN Congregacoes c ON c.CongregacaoId = s.CongregacaoId JOIN Fornecedores f ON f.FornecedorId = s.FornecedorId`,
  "saídas de uma congregação (com a marca de duplicidade)": `SELECT s.SaidaId, CASE WHEN EXISTS (SELECT 1 FROM SaidasTesouraria s2 WHERE s2.SaidaId <> s.SaidaId AND s2.FornecedorId = s.FornecedorId
    AND s2.Valor = s.Valor AND s2.Status NOT IN ('REJEITADA', 'CANCELADA') AND ABS(DATEDIFF(DAY, s2.SolicitadoEm, s.SolicitadoEm)) <= 7) THEN 1 ELSE 0 END AS peso
    FROM SaidasTesouraria s WHERE s.CongregacaoId = @cong`
};

async function medirTodas(rotulo, params) {
  const out = {};
  for (const [nome, sqlTexto] of Object.entries(CONSULTAS)) {
    const vezes = [];
    for (let i = 0; i < 3; i++) {
      const t = await q(`DECLARE @t0 DATETIME2 = SYSDATETIME(); DECLARE @n BIGINT = (SELECT SUM(CAST(peso AS BIGINT)) + COUNT(*) FROM (${sqlTexto}) x); SELECT @n AS n, DATEDIFF(MICROSECOND, @t0, SYSDATETIME()) / 1000.0 AS ms`, params);
      vezes.push(Number(t[0].ms));
    }
    out[nome] = Math.min(...vezes);
    console.error(`${rotulo} | ${nome}: ${out[nome].toFixed(1)} ms (o melhor de 3)`);
  }
  return out;
}

async function principal() {
  await obterPool();
  const cong = (await q(`SELECT TOP 1 CongregacaoId FROM LancamentosTesouraria GROUP BY CongregacaoId ORDER BY COUNT(*) DESC`))[0].CongregacaoId;
  const mes = (await q(`SELECT TOP 1 MesReferencia FROM LancamentosTesouraria WHERE CongregacaoId = @c ORDER BY MesReferencia DESC`, { c: cong }))[0].MesReferencia;
  const params = { cong, mes };
  const comIndices = await medirTodas("com os índices da 175", params);
  const nomes = (await q(`SELECT i.name, OBJECT_NAME(i.object_id) AS tabela FROM sys.indexes i WHERE i.name LIKE N'IX_LancamentosTesouraria_%' OR i.name LIKE N'IX_SaidasTesouraria_%'`));
  for (const n of nomes) await q(`DROP INDEX ${n.name} ON dbo.${n.tabela}`);
  const semIndices = await medirTodas("sem os índices", params);
  const migracao = fs.readFileSync(path.join(__dirname, "..", "..", "sql", "migrations", "175_indices_velocidade.sql"), "utf8").split(/^GO\s*$/m).map((b) => b.trim()).filter((b) => b && !/^--/.test(b.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).join("\n") === "" ? "--" : "x"));
  for (const bloco of migracao) await q(bloco);
  console.log(JSON.stringify({ congregacao: cong, mes, semIndices, comIndices }));
  L.shimEncerrar();
}

principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
