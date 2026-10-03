// Defesa em profundidade no banco — contrato das migrações 127 a 131 (sql/migrations). Estas migrações rodam a CADA deploy sobre dados de produção que ninguém vê daqui, então a
// regra de segurança é testada no TEXTO: cada índice ÚNICO (1) só é criado se o índice ainda não existir E não houver repetição hoje (o mesmo filtro e a mesma chave da conferência
// e do índice), (2) havendo repetição só IMPRIME um aviso com contagem (nunca dado de pessoa — o log do GitHub de repositório público é público) e segue, (3) cria dentro de
// TRY/CATCH (uma repetição que surja no meio vira aviso, não falha de deploy), (4) nunca apaga nem altera linha. O comportamento real (banco limpo cria; banco com repetição
// passa sem criar; depois de limpar cria; rodar de novo; o índice recusa a segunda gravação) foi provado em SQL Server de verdade e está descrito no README (fase 7).
// Aqui também: a lista de códigos de cargo do índice de Assentos acompanha o catálogo do código (api/shared/diretoria.js) e nenhum INSERT do repositório depende dos defaults
// que a migração 131 troca para 0.
const fs = require("fs");
const path = require("path");
const { CATALOGOS_CARGOS_POR_ORGAO } = require("../diretoria");

const RAIZ = path.join(__dirname, "..", "..", "..");
const PASTA_MIGRACOES = path.join(RAIZ, "sql", "migrations");
// espaço em branco colapsado e sem espaço depois de "(" nem antes de ")": a conferência e o índice podem quebrar linha de jeitos diferentes
const norm = (s) => s.replace(/\s+/g, " ").replace(/\(\s/g, "(").replace(/\s\)/g, ")").trim();
const arquivoDe = (numero) => {
  const nome = fs.readdirSync(PASTA_MIGRACOES).find(n => n.startsWith(`${String(numero).padStart(3, "0")}_`));
  if (!nome) throw new Error(`migração ${numero} não encontrada`);
  return nome;
};
const lerMigracao = (numero) => fs.readFileSync(path.join(PASTA_MIGRACOES, arquivoDe(numero)), "utf8");
const lotesDe = (texto) => texto.split(/^\s*GO\s*$/gim).map(l => l.trim()).filter(Boolean);
const semComentarios = (texto) => texto.split(/\r?\n/).filter(l => !/^\s*--/.test(l)).join("\n");

// os códigos dos cargos fixos de todos os catálogos do código (Diretoria, Conselho Fiscal, CEI, Conselho Consultivo)...
const CODIGOS_DE_CARGO = [...new Set(Object.values(CATALOGOS_CARGOS_POR_ORGAO).flatMap(catalogo => Object.keys(catalogo)))];
// ...e a lista que o filtro do índice de Assentos tem de ter (na ordem do arquivo). Os dois têm de ser o MESMO conjunto (teste de acompanhamento mais abaixo).
const CODIGOS_NO_ARQUIVO = ["PRESIDENTE", "VICE_PRESIDENTE_1", "VICE_PRESIDENTE_2", "VICE_PRESIDENTE_3", "VICE_PRESIDENTE_4", "SECRETARIO_1", "SECRETARIO_2", "SECRETARIO_3", "TESOUREIRO_1", "TESOUREIRO_2",
  "TITULAR_1", "TITULAR_2", "TITULAR_3", "TITULAR_4", "TITULAR_5", "TITULAR_6", "TITULAR_7", "SUPLENTE_1", "SUPLENTE_2", "SUPLENTE_3", "MEMBRO_1", "MEMBRO_2", "MEMBRO_3", "MEMBRO_4", "MEMBRO_5"];
const LISTA_CARGOS = (codigos) => `(${codigos.map(c => `N'${c}'`).join(", ")})`;

// [migração, índice, tabela, colunas, filtro]
const CONTRATO = [
  [124, "UX_Lideranca_Membro", "Lideranca", "MembroId", null],
  [127, "UX_Orgaos_Sigla", "Orgaos", "Sigla", null],
  [127, "UX_OrgaosLocais_Unidade_Sigla", "OrgaosLocais", "Nivel, ReferenciaId, Sigla", "ReferenciaId IS NOT NULL"],
  [127, "UX_Assentos_CargoAtivo", "Assentos", "OrgaoId, CargoOuFuncao", `DataFim IS NULL AND CargoOuFuncao IN ${LISTA_CARGOS(CODIGOS_NO_ARQUIVO)}`],
  [127, "UX_ComissaoMembros_Ativo", "ComissaoMembros", "Sigla, MembroId", "DataFim IS NULL"],
  [128, "UX_CredenciamentosAssembleia_Credenciado", "CredenciamentosAssembleia", "SessaoId, MembroId", "Resultado = N'CREDENCIADO'"],
  [128, "UX_Presencas_Sessao_Membro", "Presencas", "SessaoId, MembroId", null],
  [129, "UX_RemessaItens_SaidaViva", "RemessaItens", "SaidaId", "Status IN (N'PENDENTE', N'PROCESSADO')"],
  [129, "UX_RemessasBancarias_Numero", "RemessasBancarias", "NumeroSequencial", null],
  [129, "UX_PrebendaGeracoes_Mes_Prebendado", "PrebendaGeracoes", "MesReferencia, PrebendadoId", null],
  [130, "UX_Congregacoes_Nome", "Congregacoes", "Nome", null],
  [130, "UX_Congregacoes_Slug", "Congregacoes", "Slug", "Slug IS NOT NULL AND Slug <> N''"],
  [130, "UX_CargosMinisteriais_Sigla", "CargosMinisteriais", "Sigla", null],
  [130, "UX_Departamentos_Sigla", "Departamentos", "Sigla", null],
  [130, "UX_Papeis_Nome", "Papeis", "Nome", null],
  [130, "UX_SituacoesMembro_Sigla", "SituacoesMembro", "Sigla", null],
  [130, "UX_StatusMembro_Sigla", "StatusMembro", "Sigla", null],
  [130, "UX_Prazos_Sigla", "Prazos", "Sigla", null],
  [130, "UX_Funcionalidades_Chave", "Funcionalidades", "Chave", null]
];

const loteDoIndice = (numero, indice) => {
  const lotes = lotesDe(lerMigracao(numero)).filter(l => norm(l).includes(`CREATE UNIQUE INDEX ${indice} ON`));
  expect(lotes).toHaveLength(1);                                         // um índice, um lote: a conferência e a criação andam juntas
  return norm(lotes[0]);
};
const pos = (texto, trecho, depoisDe = 0) => {
  const i = texto.indexOf(trecho, depoisDe);
  expect(i).toBeGreaterThanOrEqual(0);
  return i;
};

describe.each(CONTRATO)("migração %i — %s", (numero, indice, tabela, colunas, filtro) => {
  const onde = filtro ? ` WHERE ${filtro}` : "";
  test(`cria UNIQUE em ${tabela} (${colunas})${filtro ? ` WHERE ${filtro.length > 60 ? `${filtro.slice(0, 57)}...` : filtro}` : ""}, com a MESMA chave e o MESMO filtro da conferência de repetição`, () => {
    const lote = loteDoIndice(numero, indice);
    expect(lote).toContain(`CREATE UNIQUE INDEX ${indice} ON dbo.${tabela} (${colunas})${onde};`);
    expect(lote).toContain(`SELECT @repetidos = COUNT(*) FROM (SELECT 1 AS x FROM dbo.${tabela}${onde} GROUP BY ${colunas} HAVING COUNT(*) > 1) d;`);
  });
  test("só age se o índice ainda não existe (idempotente) e a conferência vem antes da criação, que fica dentro de TRY/CATCH", () => {
    const lote = loteDoIndice(numero, indice);
    // (PrebendaGeracoes só GARANTE: o guarda procura qualquer índice único com a mesma chave, com o nome que for — ver o teste próprio abaixo)
    const guarda = pos(lote, tabela === "PrebendaGeracoes"
      ? "IF NOT EXISTS (SELECT 1 FROM sys.indexes i WHERE i.object_id = OBJECT_ID(N'dbo.PrebendaGeracoes')"
      : `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'${indice}' AND object_id = OBJECT_ID(N'dbo.${tabela}'))`);
    const conferencia = pos(lote, "SELECT @repetidos = COUNT(*)", guarda);
    const decide = pos(lote, "IF @repetidos > 0", conferencia);
    const aviso = pos(lote, `PRINT N'AVISO migração ${numero}: índice ${indice} NÃO criado — há '`, decide);
    const senao = pos(lote, "ELSE", aviso);
    const tenta = pos(lote, "BEGIN TRY", senao);
    const cria = pos(lote, `CREATE UNIQUE INDEX ${indice}`, tenta);
    const fimTenta = pos(lote, "END TRY", cria);
    const pega = pos(lote, "BEGIN CATCH", fimTenta);
    const avisoErro = pos(lote, `PRINT N'AVISO migração ${numero}: índice ${indice} NÃO criado — ' + ERROR_MESSAGE();`, pega);
    pos(lote, "END CATCH", avisoErro);
  });
  test("o aviso carrega só a CONTAGEM (nada de dado de pessoa no log público)", () => {
    const lote = loteDoIndice(numero, indice);
    expect(lote).toContain("CAST(@repetidos AS NVARCHAR(12))");
    // a única coisa que a conferência lê é COUNT(*): nenhuma coluna de dado vai para uma variável nem para o PRINT
    expect(lote.match(/SELECT @\w+ = /g)).toEqual(["SELECT @repetidos = "]);
    const prints = lote.match(/PRINT [^;]*;/g);
    expect(prints).toHaveLength(2);
    for (const p of prints) expect(p).not.toMatch(/@(?!repetidos)\w+/);
  });
});

describe("migração 129 — PrebendaGeracoes: só GARANTE a unicidade que a 060 já criou", () => {
  test("não faz nada se já existe índice/restrição único sem filtro com exatamente (MesReferencia, PrebendadoId), com o nome que for", () => {
    const lote = norm(lotesDe(lerMigracao(129)).find(l => l.includes("UX_PrebendaGeracoes_Mes_Prebendado")));
    expect(lote).toContain("IF NOT EXISTS (SELECT 1 FROM sys.indexes i WHERE i.object_id = OBJECT_ID(N'dbo.PrebendaGeracoes') AND i.is_unique = 1 AND i.has_filter = 0");
    expect(lote).toContain("= 2 AND (SELECT COUNT(*) FROM sys.index_columns ic JOIN sys.columns c");
    expect(lote).toContain("c.name IN (N'MesReferencia', N'PrebendadoId')) = 2)");
    expect(lote).toContain("CREATE UNIQUE INDEX UX_PrebendaGeracoes_Mes_Prebendado ON dbo.PrebendaGeracoes (MesReferencia, PrebendadoId);");
  });
  test("a restrição original da 060 continua sendo (MesReferencia, PrebendadoId): é ela que a migração 129 reconhece", () => {
    expect(norm(lerMigracao(60))).toContain("CONSTRAINT UQ_PrebendaGeracao_MesPessoa UNIQUE (MesReferencia, PrebendadoId)");
  });
});

describe("migrações 127 a 131 — nunca apagam nem alteram linha, nunca derrubam o deploy", () => {
  const todas = [124, 127, 128, 129, 130, 131];
  test.each(todas)("%i: nenhum DELETE, TRUNCATE, UPDATE, INSERT, MERGE nem DROP de tabela/índice no código (só comentário os cita)", (numero) => {
    const codigo = semComentarios(lerMigracao(numero));
    for (const proibido of [/\bDELETE\b/i, /\bTRUNCATE\b/i, /\bUPDATE\b/i, /\bINSERT\b/i, /\bMERGE\b/i, /\bDROP\s+TABLE\b/i, /\bDROP\s+INDEX\b/i, /\bALTER\s+COLUMN\b/i, /\bDROP\s+COLUMN\b/i]) {
      expect(codigo).not.toMatch(proibido);
    }
  });
  test.each(todas)("%i: toda criação/troca está dentro de TRY/CATCH que só avisa (PRINT), e cada lote termina com GO", (numero) => {
    const lotes = lotesDe(lerMigracao(numero));
    expect(lotes.length).toBeGreaterThan(0);
    for (const lote of lotes) {
      const l = norm(semComentarios(lote));
      if (/CREATE UNIQUE INDEX|ADD CONSTRAINT/.test(l)) {
        expect(l).toContain("BEGIN TRY");
        expect(l).toContain("BEGIN CATCH");
        expect(l).toMatch(/BEGIN CATCH [^]*PRINT N'AVISO migração \d+:/);
        expect(l).not.toMatch(/\bTHROW\b|\bRAISERROR\b/);                 // nunca relança: aviso, não falha
      }
    }
    expect(lerMigracao(numero).replace(/\s+$/, "")).toMatch(/\bGO$/);
  });
  test("cada nome de índice criado pelas migrações do repositório aponta para UMA tabela só (sem colisão de nome entre migrações)", () => {
    const tabelaPorIndice = new Map();
    for (const nome of fs.readdirSync(PASTA_MIGRACOES).filter(n => n.endsWith(".sql"))) {
      const texto = fs.readFileSync(path.join(PASTA_MIGRACOES, nome), "utf8");
      for (const m of texto.matchAll(/CREATE\s+UNIQUE\s+INDEX\s+(\w+)\s+ON\s+(?:dbo\.)?(\w+)/gi)) {
        const anterior = tabelaPorIndice.get(m[1]);
        if (anterior) expect([m[1], anterior]).toEqual([m[1], m[2]]);
        tabelaPorIndice.set(m[1], m[2]);
      }
    }
    for (const [, indice] of CONTRATO.map(c => [c[0], c[1]])) expect(tabelaPorIndice.has(indice)).toBe(true);
  });
});

describe("migração 127 — Assentos: os códigos do filtro acompanham o catálogo de cargos fixos do código", () => {
  const codigosDoTexto = (trecho) => [...trecho.matchAll(/N'([A-Z_0-9]+)'/g)].map(m => m[1]);
  test("o filtro do índice lista exatamente os códigos de CATALOGOS_CARGOS_POR_ORGAO (cargo novo no código sem migração nova quebra aqui)", () => {
    const lote = loteDoIndice(127, "UX_Assentos_CargoAtivo");
    const criacao = lote.slice(lote.indexOf("CREATE UNIQUE INDEX UX_Assentos_CargoAtivo"));
    const listaNoIndice = codigosDoTexto(criacao.slice(criacao.indexOf("CargoOuFuncao IN")));
    expect([...listaNoIndice].sort()).toEqual([...CODIGOS_DE_CARGO].sort());
    expect([...CODIGOS_NO_ARQUIVO].sort()).toEqual([...CODIGOS_DE_CARGO].sort());
    expect(CODIGOS_DE_CARGO.length).toBeGreaterThanOrEqual(25);
  });
  test("a conferência de repetição usa a MESMA lista do índice (senão o aviso e o índice divergiriam)", () => {
    const lote = loteDoIndice(127, "UX_Assentos_CargoAtivo");
    const conferencia = lote.slice(lote.indexOf("SELECT @repetidos"), lote.indexOf("IF @repetidos"));
    const criacao = lote.slice(lote.indexOf("CREATE UNIQUE INDEX UX_Assentos_CargoAtivo"));
    expect(codigosDoTexto(conferencia).sort()).toEqual(codigosDoTexto(criacao.slice(criacao.indexOf("CargoOuFuncao IN"))).sort());
  });
  test("o filtro só vale para cadeira VIVA (DataFim IS NULL): cadeira encerrada guarda o histórico e pode repetir o cargo", () => {
    expect(loteDoIndice(127, "UX_Assentos_CargoAtivo")).toContain("WHERE DataFim IS NULL AND CargoOuFuncao IN (");
  });
  test("o catálogo cobre os quatro órgãos que o código trata como cargo fixo", () => {
    expect(Object.keys(CATALOGOS_CARGOS_POR_ORGAO).sort()).toEqual(["CEI", "CONSELHO_CONSULTIVO_TECNICO", "CONSELHO_FISCAL", "DIRETORIA_EXECUTIVA"]);
  });
});

describe("migração 131 — a coluna de 'confirmado' nasce NÃO confirmada, sem tocar nas linhas existentes", () => {
  const lotes = () => lotesDe(lerMigracao(131)).map(l => norm(semComentarios(l)));
  test.each([["Fornecedores", "DadosBancariosConfirmados", "DF_Fornecedores_DadosBancariosConfirmados"], ["PerfisRateioDepartamental", "Confirmado", "DF_PerfisRateioDepartamental_Confirmado"]])(
    "%s.%s: descobre a restrição antiga no catálogo (nome gerado pelo SQL Server), troca por DEFAULT 0 numa transação e só avisa se falhar", (tabela, coluna, restricao) => {
      const lote = lotes().find(l => l.includes(`ADD CONSTRAINT ${restricao} DEFAULT 0 FOR ${coluna};`));
      expect(lote).toBeDefined();
      expect(lote).toContain("FROM sys.default_constraints dc JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id");
      expect(lote).toContain(`dc.parent_object_id = OBJECT_ID(N'dbo.${tabela}') AND c.name = N'${coluna}'`);
      expect(lote).toContain(`SET @ddl = N'ALTER TABLE dbo.${tabela} DROP CONSTRAINT ' + QUOTENAME(@nome);`);
      expect(lote).not.toMatch(/DF__/);                                             // o nome gerado nunca é escrito à mão
      expect(lote).toContain("@definicao NOT IN (N'((0))', N'(0)')");                // já em 0: não faz nada (idempotente)
      const inicio = pos(lote, "BEGIN TRANSACTION"), drop = pos(lote, "DROP CONSTRAINT"), add = pos(lote, "ADD CONSTRAINT"), fim = pos(lote, "COMMIT TRANSACTION");
      expect([inicio, drop, add, fim].every((p, i, a) => i === 0 || p > a[i - 1])).toBe(true);
      expect(lote).toMatch(/BEGIN CATCH IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION; PRINT N'AVISO migração 131:/);
    });
});

// Quem depende do default antigo? Ninguém: todo INSERT do repositório informa a coluna. Confere o código (api/) e as migrações.
describe("nenhum INSERT do repositório depende do DEFAULT que a migração 131 troca", () => {
  const arquivos = (dir, ok) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const caminho = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name === "__tests__" ? [] : arquivos(caminho, ok);
    return ok(e.name) ? [caminho] : [];
  });
  const insercoes = (texto, tabela) => [...texto.matchAll(new RegExp(`INSERT\\s+INTO\\s+(?:dbo\\.)?${tabela}\\s*\\(([^)]*)\\)`, "gi"))].map(m => m[1]);
  const codigoApi = () => arquivos(path.join(RAIZ, "api"), n => n.endsWith(".js")).map(a => [a, fs.readFileSync(a, "utf8")]);
  const sqls = () => fs.readdirSync(PASTA_MIGRACOES).filter(n => n.endsWith(".sql")).map(n => [n, fs.readFileSync(path.join(PASTA_MIGRACOES, n), "utf8")]);

  test("INSERT INTO Fornecedores (api e migrações): sempre com DadosBancariosConfirmados na lista de colunas", () => {
    const todos = [...codigoApi(), ...sqls()].flatMap(([nome, texto]) => insercoes(texto, "Fornecedores").map(cols => [nome, cols]));
    expect(todos.length).toBeGreaterThanOrEqual(1);                              // GestaoFornecedores
    for (const [nome, colunas] of todos) expect([nome, /DadosBancariosConfirmados/.test(colunas)]).toEqual([nome, true]);
  });
  test("INSERT INTO PerfisRateioDepartamental (api e migrações): sempre com Confirmado na lista de colunas", () => {
    const todos = [...codigoApi(), ...sqls()].flatMap(([nome, texto]) => insercoes(texto, "PerfisRateioDepartamental").map(cols => [nome, cols]));
    expect(todos.length).toBeGreaterThanOrEqual(8);                              // os 8 perfis semeados pela migração 095
    for (const [nome, colunas] of todos) expect([nome, /\bConfirmado\b/.test(colunas)]).toEqual([nome, true]);
  });
  test("a rota de fornecedor grava a coluna de forma explícita: pendente (0) quando o cadastro traz dado bancário", () => {
    const fonte = fs.readFileSync(path.join(RAIZ, "api", "GestaoFornecedores", "index.js"), "utf8");
    expect(fonte).toMatch(/\.input\("confirmados", sql\.Bit, temDadoBancario \? 0 : 1\)/);
  });
});
