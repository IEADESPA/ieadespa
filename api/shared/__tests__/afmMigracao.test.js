// O texto da migração 156 (v8.1 — AFM e faltas da CLI): idempotente, os CHECK que fecham o NULL, os gatilhos no molde que trata o UPDATE que não alcança linha, as reuniões
// antigas que não contam falta e os limites das colunas do sistema. A prova contra o banco de verdade está em tools/e2e-localdb/e2e-47.
const fs = require("fs");
const path = require("path");
const TEXTO = fs.readFileSync(path.join(__dirname, "..", "..", "..", "sql", "migrations", "156_afm_e_faltas_cli.sql"), "utf8");
const lotes = TEXTO.split(/^\s*GO\s*$/gim).map((t) => t.trim()).filter(Boolean);

describe("migração 156", () => {
  test("toda tabela, coluna e índice são criados só se não existem", () => {
    const tabelas = [...TEXTO.matchAll(/CREATE TABLE dbo\.(\w+)/g)].map((m) => m[1]);
    expect(tabelas.sort()).toEqual(["AFMCorpoDocente", "AFMDesmatriculas", "CLIExclusoesFaltas"]);
    for (const t of tabelas) expect(TEXTO).toMatch(new RegExp(`IF OBJECT_ID\\(N'dbo\\.${t}', N'U'\\) IS NULL\\s+BEGIN\\s+CREATE TABLE dbo\\.${t}`));
    for (const m of TEXTO.matchAll(/ALTER TABLE dbo\.(\w+) ADD (\w+) /g)) {
      if (m[2] === "CONSTRAINT") continue;
      expect(TEXTO).toMatch(new RegExp(`IF COL_LENGTH\\(N'dbo\\.${m[1]}', N'${m[2]}'\\) IS NULL\\s+ALTER TABLE dbo\\.${m[1]} ADD ${m[2]} `));
    }
    for (const ix of [...TEXTO.matchAll(/CREATE (?:UNIQUE )?INDEX (\w+)/g)].map((m) => m[1])) {
      expect(TEXTO).toMatch(new RegExp(`IF NOT EXISTS \\(SELECT 1 FROM sys\\.indexes WHERE name = N'${ix}'`));
    }
    for (const ck of [...TEXTO.matchAll(/ADD CONSTRAINT (CK_\w+)/g)].map((m) => m[1])) {
      expect(TEXTO).toMatch(new RegExp(`IF NOT EXISTS \\(SELECT 1 FROM sys\\.check_constraints WHERE name = N'${ck}'\\)`));
    }
  });
  test("os CHECK de lista fecham o NULL (col IS NOT NULL AND col IN ...) ou o admitem de propósito (col IS NULL OR ...)", () => {
    for (const m of TEXTO.matchAll(/CHECK \(([^]*?)\)(?:,|\s*;|\s*$)/gm)) {
      const corpo = m[1];
      const lista = corpo.match(/(\w+) IN \(/);
      if (!lista) continue;
      expect(corpo).toMatch(new RegExp(`${lista[1]} IS (NOT )?NULL`));
    }
  });
  test("os gatilhos são CREATE OR ALTER e só tratam como DELETE quando há linha em deleted", () => {
    const gatilhos = [...TEXTO.matchAll(/CREATE OR ALTER TRIGGER dbo\.(\w+)/g)].map((m) => m[1]);
    expect(gatilhos.sort()).toEqual(["TR_AFMDesmatriculas_Protegida", "TR_CLIExclusoesFaltas_Protegida"]);
    for (const g of gatilhos) {
      const corpo = lotes.find((l) => l.includes(`TRIGGER dbo.${g}`));
      expect(corpo).toMatch(/IF NOT EXISTS \(SELECT 1 FROM inserted\) AND EXISTS \(SELECT 1 FROM deleted\)/);
      expect(corpo).not.toMatch(/SESSION_CONTEXT/);            // ninguém apaga: nem a exclusão LGPD (que anonimiza o cadastro, não apaga linhas)
    }
  });
  test("as reuniões antigas não contam falta (a coluna nasce 0) e a rematrícula exige a reciclagem e o ponto de recomeço", () => {
    expect(TEXTO).toMatch(/ADD ContaFaltasCLI BIT NOT NULL CONSTRAINT DF_Sessoes_ContaFaltasCLI DEFAULT 0;/);
    expect(TEXTO).not.toMatch(/UPDATE dbo\.Sessoes SET ContaFaltasCLI/);
    expect(TEXTO).toMatch(/CHECK \(Origem <> N'REMATRICULA' OR \(ReciclagemAprovadaEm IS NOT NULL AND ContagemAposSessaoId IS NOT NULL\)\)/);
  });
  test("os vedados do Art. 149 §2º, II nunca entram no banco: o CHECK só lista o catálogo aceito", () => {
    const aceitos = ["SAUDE", "VIAGEM_PROFISSIONAL", "LUTO", "EMERGENCIA_FAMILIAR", "OUTRO_EXTERNO"];
    const afm = require("../afm");
    expect(Object.keys(afm.MOTIVOS_ACEITOS)).toEqual(aceitos);
    for (const col of ["MotivoCodigo", "PendenteCodigo"]) {
      const m = TEXTO.match(new RegExp(`CHECK \\(${col} IS NULL OR ${col} IN \\(([^)]*)\\)\\)`));
      expect(m).not.toBeNull();
      expect([...m[1].matchAll(/N'(\w+)'/g)].map((x) => x[1])).toEqual(aceitos);
    }
  });
  test("textos dentro dos limites: Funcionalidades.Nome 100, PoliticasRetencao.BaseLegal 300, NotificacaoRegras.Titulo 200", () => {
    const nome = TEXTO.match(/INSERT INTO dbo\.Funcionalidades \(Chave, Nome\) VALUES \('afm', N'([^']*)'\)/);
    expect(nome[1].length).toBeLessThanOrEqual(100);
    for (const m of TEXTO.matchAll(/INSERT INTO dbo\.PoliticasRetencao \(Categoria, BaseLegal, DiasRetencao\)\s+VALUES \(N'([^']*)', N'([^']*)'/g)) {
      expect(m[1].length).toBeLessThanOrEqual(60);           // PoliticasRetencao.Categoria é NVARCHAR(60)
      expect(m[2].length).toBeLessThanOrEqual(300);
    }
    for (const m of TEXTO.matchAll(/VALUES \(N'(?:CLI|AFM)_\w+', N'([^']*)'/g)) expect(m[1].length).toBeLessThanOrEqual(200);
  });
});
