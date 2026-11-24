// Financeiro (revisão de 23/11/2026, I3): a regra 3 do banco (api/CLAUDE.md, "Banco (SQL Server)") nas migrações do Financeiro (faixa 200+).
// Toda chave estrangeira das tabelas Fin* tem um índice que começa por ela (a chave primária, um UNIQUE ou um CREATE INDEX), menos a de
// "quem registrou" (CriadoPor, RegistradoPor, DesfeitaPor), que a regra dispensa. Sem o índice, a junção e o "apagar o pai" varrem a tabela.
// A prova no banco de verdade é o e2e-200 (sys.index_columns depois de a 200 e a 201 rodarem duas vezes).
const fs = require("fs");
const path = require("path");

const PASTA = path.join(__dirname, "..", "..", "..", "sql", "migrations");
const QUEM_REGISTROU = new Set(["CriadoPor", "RegistradoPor", "DesfeitaPor"]);

function lerMigracoesDoFinanceiro() {
  return fs.readdirSync(PASTA).filter((n) => /^2\d\d_.*\.sql$/.test(n)).sort().map((n) => ({ nome: n, texto: fs.readFileSync(path.join(PASTA, n), "utf8") }));
}

// as tabelas Fin* com as chaves estrangeiras e as colunas que já começam um índice (a chave primária e os UNIQUE da própria tabela)
function tabelasEChaves(migracoes) {
  const tabelas = new Map();
  for (const { texto } of migracoes) {
    for (const m of texto.matchAll(/CREATE TABLE dbo\.(Fin\w+)\s*\(([\s\S]*?)\n\s*\);/g)) {
      const [, tabela, corpo] = m;
      const chaves = [...corpo.matchAll(/^\s*(\w+)\s+INT\b[^\n]*\bREFERENCES\b/gm)].map((x) => x[1]);
      const comeca = new Set();
      const pk = corpo.match(/^\s*(\w+)\s+INT IDENTITY PRIMARY KEY/m);
      if (pk) comeca.add(pk[1]);
      for (const u of corpo.matchAll(/CONSTRAINT\s+\w+\s+UNIQUE\s*\(\s*(\w+)/g)) comeca.add(u[1]);
      tabelas.set(tabela, { chaves, comeca });
    }
  }
  // a coluna nova de uma migração seguinte (ALTER TABLE dbo.FinX ADD Coluna INT ... REFERENCES ...)
  for (const { texto } of migracoes) {
    for (const m of texto.matchAll(/ALTER TABLE dbo\.(Fin\w+)\s+ADD\s+(\w+)\s+INT\b[^\n]*\bREFERENCES\b/g)) {
      const t = tabelas.get(m[1]);
      if (t && !t.chaves.includes(m[2])) t.chaves.push(m[2]);
    }
  }
  return tabelas;
}

// os índices criados em qualquer migração do Financeiro: tabela → as colunas que começam um índice
function indicesCriados(migracoes) {
  const porTabela = new Map();
  for (const { texto } of migracoes) {
    for (const m of texto.matchAll(/CREATE\s+(?:UNIQUE\s+)?(?:NONCLUSTERED\s+)?INDEX\s+\w+\s+ON\s+dbo\.(\w+)\s*\(\s*(\w+)/gi)) {
      if (!porTabela.has(m[1])) porTabela.set(m[1], new Set());
      porTabela.get(m[1]).add(m[2]);
    }
  }
  return porTabela;
}

describe("as migrações do Financeiro: índice em toda chave estrangeira (regra 3 do banco)", () => {
  const migracoes = lerMigracoesDoFinanceiro();
  const tabelas = tabelasEChaves(migracoes);
  const indices = indicesCriados(migracoes);

  test("a leitura das migrações acha as tabelas e as chaves (o teste não passa por não achar nada)", () => {
    expect(migracoes.length).toBeGreaterThan(0);
    expect(tabelas.get("FinBlocos").chaves).toEqual(expect.arrayContaining(["LoteId", "CongregacaoId"]));
    expect(tabelas.get("FinLivroBlocos").chaves).toEqual(expect.arrayContaining(["LoteId", "BlocoId", "CongregacaoId", "PessoaMembroId", "RegistradoPor"]));
    // a regra de 24/11 (a devolução parcial): cada folha guarda a entrega que a usou, e a entrada guarda a entrega que ela fecha
    expect(tabelas.get("FinFolhas").chaves).toContain("SaidaId");
    expect(tabelas.get("FinLivroBlocos").chaves).toContain("SaidaId");
  });

  test("toda chave estrangeira das tabelas Fin* começa um índice (menos a de quem registrou)", () => {
    const faltam = [];
    for (const [tabela, { chaves, comeca }] of tabelas) {
      const criados = indices.get(tabela) || new Set();
      for (const coluna of chaves) {
        if (QUEM_REGISTROU.has(coluna) || comeca.has(coluna) || criados.has(coluna)) continue;
        faltam.push(`${tabela}.${coluna}`);
      }
    }
    expect(faltam).toEqual([]);
  });

  test("todo índice e toda tabela nova nascem só se não existirem (a migração roda a cada deploy)", () => {
    for (const { nome, texto } of migracoes) {
      const criacoes = [...texto.matchAll(/CREATE\s+(?:UNIQUE\s+)?(?:NONCLUSTERED\s+)?INDEX\s+(\w+)/gi)].map((x) => x[1]);
      for (const indice of criacoes) expect(`${nome}: ${texto.includes(`name = N'${indice}'`) ? "com" : "SEM"} IF NOT EXISTS para ${indice}`).toBe(`${nome}: com IF NOT EXISTS para ${indice}`);
      const tabelasNovas = [...texto.matchAll(/CREATE TABLE dbo\.(\w+)/g)].map((x) => x[1]);
      for (const t of tabelasNovas) expect(texto.includes(`OBJECT_ID(N'dbo.${t}', N'U') IS NULL`)).toBe(true);
    }
  });
});
