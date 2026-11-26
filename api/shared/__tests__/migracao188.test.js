// FASE 10, Membros — a migração 188 (o índice do nascimento das fichas; missão C, o ensaio da importação no tamanho real, 26/11/2026). A prévia da importação
// procura as fichas com o mesmo nome e nascimento de cada linha do arquivo (JOIN MembroReferencia ON DataNascimento = ... AND o nome comparável), e a tela
// Fichas repetidas junta as fichas pelo mesmo par. Sem índice na DataNascimento e com poucas fichas no banco (como a produção antes da importação grande),
// o banco lia a lista inteira do arquivo de novo para cada ficha: no ensaio de 6 mil linhas, 1.472.427 páginas numa consulta só (regra 3 do Banco no
// api/CLAUDE.md: índice em toda coluna juntada). O Nome vai junto (INCLUDE), para a comparação do nome não voltar à tabela. Idempotente (o deploy roda
// todas as migrações a cada vez). A prova contra o banco: tools/ensaio-importacao/ensaio-localdb.js (nenhuma consulta passa de 100 mil páginas numa
// execução; sem a 188, na base pequena, cai).
const fs = require("fs");
const path = require("path");
const PASTA = path.join(__dirname, "..", "..", "..", "sql", "migrations");
const NOME = fs.readdirSync(PASTA).find((n) => n.startsWith("188_"));
const TEXTO = NOME ? fs.readFileSync(path.join(PASTA, NOME), "utf8") : "";

describe("migração 188 (o índice do nascimento das fichas)", () => {
  test("existe, na faixa do Membros (até a 199)", () => {
    expect(NOME).toMatch(/^188_[a-z0-9_]+\.sql$/);
  });
  test("o índice da DataNascimento, com o Nome junto, criado só se não existe", () => {
    expect(TEXTO).toMatch(/IF NOT EXISTS \(SELECT 1 FROM sys\.indexes WHERE name = N'IX_MembroReferencia_DataNascimento' AND object_id = OBJECT_ID\(N'dbo\.MembroReferencia'\)\)\s+CREATE INDEX IX_MembroReferencia_DataNascimento ON dbo\.MembroReferencia \(DataNascimento\) INCLUDE \(Nome\);/);
  });
  test("não apaga dado nem tabela", () => {
    const semComentarios = TEXTO.split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join("\n");
    expect(semComentarios).not.toMatch(/DELETE |DROP TABLE|DROP INDEX|TRUNCATE/i);
  });
});
