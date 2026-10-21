// O texto da migração 148 (v7.11 — cuidado pastoral): idempotente, com os limites das colunas do sistema, os gatilhos no molde que já pagou o preço (o UPDATE que não alcança
// linha também dispara o gatilho), a marca de purga das notas e os avisos com a obrigatoriedade explícita. A prova contra o banco de verdade está em tools/e2e-localdb/e2e-23.
const fs = require("fs");
const path = require("path");
const TEXTO = fs.readFileSync(path.join(__dirname, "..", "..", "..", "sql", "migrations", "148_cuidado_pastoral.sql"), "utf8");
const lotes = TEXTO.split(/^\s*GO\s*$/gim).map((t) => t.trim()).filter(Boolean);

describe("migração 148", () => {
  test("toda tabela e todo índice são criados só se não existem", () => {
    const tabelas = [...TEXTO.matchAll(/CREATE TABLE dbo\.(\w+)/g)].map((m) => m[1]);
    expect(tabelas.sort()).toEqual(["CuidadoEventos", "CuidadoItens", "NotasPastorais", "NotasPastoraisLeituras", "PedidosOracao"]);
    for (const t of tabelas) expect(TEXTO).toMatch(new RegExp(`IF OBJECT_ID\\(N'dbo\\.${t}', N'U'\\) IS NULL\\s+BEGIN\\s+CREATE TABLE dbo\\.${t}`));
    const indices = [...TEXTO.matchAll(/CREATE (?:UNIQUE )?INDEX (\w+)/g)].map((m) => m[1]);
    expect(indices.length).toBeGreaterThanOrEqual(10);
    for (const ix of indices) expect(TEXTO).toMatch(new RegExp(`IF NOT EXISTS \\(SELECT 1 FROM sys\\.indexes WHERE name = N'${ix}'`));
  });
  test("todo gatilho é CREATE OR ALTER e trata o UPDATE que não alcança linha (inserted vazio só é DELETE se há linha em deleted)", () => {
    const gatilhos = [...TEXTO.matchAll(/CREATE OR ALTER TRIGGER dbo\.(\w+)/g)].map((m) => m[1]);
    expect(gatilhos.sort()).toEqual(["TR_CuidadoEventos_Imutavel", "TR_CuidadoItens_Protegido", "TR_NotasPastoraisLeituras_Imutavel", "TR_NotasPastorais_Imutavel", "TR_PedidosOracao_Protegido"]);
    for (const g of ["TR_CuidadoEventos_Imutavel", "TR_CuidadoItens_Protegido", "TR_PedidosOracao_Protegido"]) {
      const corpo = lotes.find((l) => l.includes(`TRIGGER dbo.${g}`));
      expect(corpo).toMatch(/IF NOT EXISTS \(SELECT 1 FROM inserted\)\s+BEGIN\s+IF EXISTS \(SELECT 1 FROM deleted\)/);
    }
  });
  test("a nota só sai com a marca de sessão cuidado_purga; editar, nunca", () => {
    for (const g of ["TR_NotasPastorais_Imutavel", "TR_NotasPastoraisLeituras_Imutavel"]) {
      const corpo = lotes.find((l) => l.includes(`TRIGGER dbo.${g}`));
      expect(corpo).toMatch(/IF EXISTS \(SELECT 1 FROM inserted\)\s+BEGIN\s+RAISERROR/);
      expect(corpo).toMatch(/SESSION_CONTEXT\(N''cuidado_purga''\) AS INT\), 0\) <> 1/);
    }
  });
  test("os limites das colunas do sistema: Funcionalidades.Nome 100, Prazos.Sigla 40, PoliticasRetencao Categoria 60 e BaseLegal 300", () => {
    const func = TEXTO.match(/INSERT INTO dbo\.Funcionalidades \(Chave, Nome\) VALUES \('cuidado_pastoral', N'([^']+)'\)/);
    expect(func && func[1].length).toBeLessThanOrEqual(100);
    for (const [, sigla, nome] of TEXTO.matchAll(/INSERT INTO dbo\.Prazos \(Sigla, Nome, Dias\) VALUES \('(\w+)', N'([^']+)'/g)) { expect(sigla.length).toBeLessThanOrEqual(40); expect(nome.length).toBeLessThanOrEqual(150); }
    for (const [, cat] of TEXTO.matchAll(/INSERT INTO dbo\.PoliticasRetencao \(Categoria, BaseLegal, DiasRetencao\) VALUES \(N'([^']+)'/g)) expect(cat.length).toBeLessThanOrEqual(60);
    const bases = [...TEXTO.matchAll(/SET BaseLegal = N'([^']+)'/g)].map((m) => m[1]);
    expect(bases).toHaveLength(4);
    for (const b of bases) expect(b.length).toBeLessThanOrEqual(300);
  });
  test("os avisos: todos com a obrigatoriedade explícita; só o de risco é obrigatório e vai pelo celular", () => {
    const regras = [...TEXTO.matchAll(/INSERT INTO dbo\.NotificacaoRegras \(Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria\)\s+VALUES \(N'(\w+)', N'([^']+)', N'CUIDADO', NULL, NULL, (\d), (\d), (\d)\)/g)];
    expect(regras.map((r) => r[1]).sort()).toEqual(["CUIDADO_ATRIBUIDO", "CUIDADO_DEGRAU", "CUIDADO_MODERACAO", "CUIDADO_RESUMO_DIARIO", "CUIDADO_RISCO"]);
    const risco = regras.find((r) => r[1] === "CUIDADO_RISCO");
    expect([risco[4], risco[5]]).toEqual(["1", "1"]);
    expect(regras.filter((r) => r[5] === "1")).toHaveLength(1);
    for (const r of regras) expect(r[2].length).toBeLessThanOrEqual(200);
  });
  test("a permissão vai só aos quatro papéis do cuidado (e ao papel novo), sem duplicar", () => {
    expect(TEXTO).toMatch(/WHERE Nome IN \(N'Presidente', N'Secretário Geral', N'Dirigente de Congregação', N'Pastor de Área'\) AND \(',' \+ ISNULL\(Permissoes, ''\) \+ ','\) NOT LIKE '%,cuidado_pastoral,%'/);
    expect(TEXTO).toMatch(/INSERT INTO dbo\.Papeis \(Nome, Nivel, Permissoes\) VALUES \(N'Superintendente Regional', 'REGIAO', 'cuidado_pastoral'\)/);
  });
  test("os CHECK de lista fecham o NULL (\"col IS NOT NULL AND col IN\")", () => {
    for (const [, col] of TEXTO.matchAll(/CHECK \((\w+) IS NOT NULL AND \1 IN/g)) expect(col).toBeTruthy();
    const listas = [...TEXTO.matchAll(/NOT NULL CONSTRAINT CK_\w+\s*(?:\n\s*)?CHECK \((\w+) (?:IS NOT NULL AND \w+ )?IN/g)];
    for (const l of listas) expect(l[0]).toMatch(/IS NOT NULL AND/);
  });
  test("o cabeçalho diz que é idempotente", () => {
    expect(TEXTO).toMatch(/-- Idempotente: seguro para reexecutar sem apagar dados\./);
  });
});
