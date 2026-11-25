// FASE 10, Membros — a migração 187 (a importação parada e a do resto): a chave estrangeira RestoDe tem o seu índice NA MESMA MIGRAÇÃO (regra 3 do Banco
// no api/CLAUDE.md; menor 5 do portão da volta 5). O índice único UX_ImportacoesMembros_Resto é filtrado (só CONCLUIDA) e não serve à conferência da chave
// nem à procura do resto de uma importação. Idempotente (o deploy roda todas as migrações a cada vez). A prova contra o banco: tools/e2e-localdb/e2e-102.
const fs = require("fs");
const path = require("path");
const PASTA = path.join(__dirname, "..", "..", "..", "sql", "migrations");
const NOME = fs.readdirSync(PASTA).find((n) => n.startsWith("187_"));
const TEXTO = NOME ? fs.readFileSync(path.join(PASTA, NOME), "utf8") : "";

describe("migração 187 (a importação parada e a do resto)", () => {
  test("existe, na faixa do Membros (até a 199)", () => {
    expect(NOME).toMatch(/^187_[a-z0-9_]+\.sql$/);
  });
  test("a chave estrangeira RestoDe tem índice próprio, sem filtro, criado só se não existe", () => {
    expect(TEXTO).toMatch(/IF NOT EXISTS \(SELECT 1 FROM sys\.indexes WHERE name = N'IX_ImportacoesMembros_RestoDe' AND object_id = OBJECT_ID\(N'dbo\.ImportacoesMembros'\)\)\s+CREATE INDEX IX_ImportacoesMembros_RestoDe ON dbo\.ImportacoesMembros \(RestoDe\);/);
  });
  test("não apaga dado nem tabela", () => {
    const semComentarios = TEXTO.split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join("\n");
    expect(semComentarios).not.toMatch(/DELETE |DROP TABLE|DROP INDEX|TRUNCATE/i);
  });
});
