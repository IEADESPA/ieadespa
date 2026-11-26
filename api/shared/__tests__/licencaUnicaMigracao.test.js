// Migração 301 — uma licença por candidatura aberta por pessoa (revisão de fora, 25/11/2026: L2/E1). A migração roda a CADA deploy sobre dados de produção que
// ninguém vê daqui, então a regra é testada no TEXTO (como em indicesUnicosBanco.test.js): (1) tudo dentro de "o índice ainda não existe", num lote só; (2) ANTES
// do índice, fecha as duplicadas abertas que já existam — fica aberta a mais antiga (CriadoEm, depois LicencaId) e as outras ganham a marca própria DUPLICADA, a
// data e a observação com o número da que ficou; (3) não apaga linha e não grava na trilha (o encadeamento do AuditLog é calculado no Node); (4) cria o índice
// único filtrado dentro de TRY/CATCH e, se falhar, o aviso não leva o valor da chave (o log do deploy de repositório público é público: nunca matrícula);
// (5) a contagem do que fechou sai sem "AVISO" (aviso quer dizer "não aplicado"). A prova contra o SQL Server está no e2e-152 (seção 7): banco sem nenhuma,
// banco com duplicada semeada antes, a segunda aplicação e o índice recusando a segunda licença aberta.
const fs = require("fs");
const path = require("path");

const PASTA = path.join(__dirname, "..", "..", "..", "sql", "migrations");
const nome = fs.readdirSync(PASTA).find((n) => n.startsWith("301_"));
const texto = nome ? fs.readFileSync(path.join(PASTA, nome), "utf8") : "";
const semComentarios = (t) => t.split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join("\n");
const norm = (t) => t.replace(/\s+/g, " ").trim();
const codigo = norm(semComentarios(texto));
const lotes = semComentarios(texto).split(/^\s*GO\s*$/gim).map((l) => norm(l)).filter(Boolean);

describe("migração 301: a licença por candidatura aberta é única", () => {
  test("existe, com o nome que diz o que faz", () => {
    expect(nome).toBe("301_licenca_unica_aberta.sql");
  });

  test("a limpeza e o índice no mesmo lote, os dois dentro de \"o índice ainda não existe\", a limpeza antes", () => {
    const lote = lotes.filter((l) => l.includes("CREATE UNIQUE INDEX UX_LicencasCandidatura_Aberta ON"));
    expect(lote).toHaveLength(1);
    const l = lote[0];
    const guarda = l.indexOf("NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_LicencasCandidatura_Aberta' AND object_id = OBJECT_ID(N'dbo.LicencasCandidatura'))");
    const limpeza = l.indexOf("SET Status = N'DUPLICADA'");
    const indice = l.indexOf("CREATE UNIQUE INDEX");
    expect(guarda).toBeGreaterThanOrEqual(0);
    expect(limpeza).toBeGreaterThan(guarda);
    expect(indice).toBeGreaterThan(limpeza);
  });

  test("o índice: único, pela pessoa, só das licenças EM_LICENCA, dentro de TRY/CATCH", () => {
    expect(codigo).toContain("BEGIN TRY CREATE UNIQUE INDEX UX_LicencasCandidatura_Aberta ON dbo.LicencasCandidatura (MembroId) WHERE Status = N'EM_LICENCA'; END TRY BEGIN CATCH");
  });

  test("a limpeza: só as abertas, fica a mais antiga de cada pessoa, as outras viram DUPLICADA com a data e a observação", () => {
    expect(codigo).toMatch(/ROW_NUMBER\(\) OVER \(PARTITION BY MembroId ORDER BY CriadoEm, LicencaId\) AS Ordem/);
    expect(codigo).toMatch(/FIRST_VALUE\(LicencaId\) OVER \(PARTITION BY MembroId ORDER BY CriadoEm, LicencaId\) AS Mantida/);
    expect(codigo).toMatch(/FROM dbo\.LicencasCandidatura WHERE Status = N'EM_LICENCA'/);
    expect(codigo).toMatch(/WHERE a\.Ordem > 1 AND l\.Status = N'EM_LICENCA'/);
    expect(codigo).toMatch(/DataRetornoDecidida = CONVERT\(date, DATEADD\(hour, -3, SYSUTCDATETIME\(\)\)\)/);
    // a observação aparece no painel do membro: texto simples, sem termo técnico (sem "migração")
    expect(codigo).toMatch(/ObservacaoRetorno = N'Registro em duplicidade, encerrado na conferência do sistema: a licença que vale é a nº ' \+ CAST\(a\.Mantida AS NVARCHAR\(12\)\) \+ N'\.'/);
    const observacao = codigo.match(/ObservacaoRetorno = N'([^']*)'/);
    expect(observacao && observacao[1]).not.toMatch(/migra/i);
  });

  test("não apaga linha, não grava na trilha e não mexe na situação da pessoa no rol", () => {
    expect(codigo).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|\bDROP\b/i);
    expect(codigo).not.toMatch(/AuditLog/i);
    expect(codigo).not.toMatch(/MembroReferencia/);
  });

  test("os PRINT: a contagem do que fechou sem \"AVISO\"; a falha do índice como AVISO, com o número do erro e sem ERROR_MESSAGE (que traz a chave repetida)", () => {
    const prints = [...codigo.matchAll(/PRINT (N'[^;]*);/g)].map((m) => m[1]);
    expect(prints).toHaveLength(2);
    expect(prints[0]).toMatch(/^N'Migração 301: '/);
    expect(prints[0]).toMatch(/CAST\(@fechadas AS NVARCHAR\(12\)\)/);
    expect(prints[1]).toMatch(/^N'AVISO migração 301: índice UX_LicencasCandidatura_Aberta NÃO criado/);
    expect(prints[1]).toMatch(/ERROR_NUMBER\(\)/);
    expect(codigo).not.toMatch(/ERROR_MESSAGE/);
    expect(codigo).toMatch(/IF @fechadas > 0 PRINT/);
  });

  test("a rota procura a licença aberta pelo mesmo filtro do índice", () => {
    const rota = fs.readFileSync(path.join(__dirname, "..", "..", "GestaoLicencasCandidatura", "index.js"), "utf8");
    expect(rota).toMatch(/WHERE MembroId = @id AND Status = 'EM_LICENCA'/);
  });
});
