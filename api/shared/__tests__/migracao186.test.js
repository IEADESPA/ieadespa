// FASE 10, Membros (24/11/2026) — o texto da migração 186: as duas políticas de retenção da importação dos membros do sistema pago aparecem em Proteção de
// Dados → Políticas de retenção, com os nomes que a rotina diária lê (shared/importacaoMembrosDb.js: POLITICA_PREVIA e POLITICA_FORA), os prazos de 7 e 90
// dias e a base legal decidida pela sessão (o texto ele confirma antes da produção). Idempotente: entra só se não existe e o texto só troca o de partida
// (N'x'), para nunca regravar o que o Encarregado editou na tela. A prova contra o banco de verdade: tools/e2e-localdb/e2e-100 (a 186 aplicada duas vezes).
const fs = require("fs");
const path = require("path");
const PASTA = path.join(__dirname, "..", "..", "..", "sql", "migrations");
const NOME = fs.readdirSync(PASTA).find((n) => n.startsWith("186_"));
const TEXTO = NOME ? fs.readFileSync(path.join(PASTA, NOME), "utf8") : "";
const db = require("../importacaoMembrosDb");
const BASE = "LGPD art. 6º, III (necessidade) e art. 16 (eliminação ao fim do tratamento).";
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("migração 186 (as políticas da importação dos membros)", () => {
  test("existe, na faixa do Membros (até a 199)", () => {
    expect(NOME).toMatch(/^186_[a-z0-9_]+\.sql$/);
  });
  for (const [qual, politica, dias, finalidade] of [
    ["a prévia não confirmada", db.POLITICA_PREVIA, 7, "Finalidade: conferir a planilha antes de gravar."],
    ["a lista dos de fora", db.POLITICA_FORA, 90, "Finalidade: a secretaria corrigir os cadastros que não entraram."]]) {
    test(`${qual}: o nome que a rotina lê, ${dias} dias, só se não existe, e o texto só troca o de partida`, () => {
      const cat = esc(politica.categoria);
      expect(politica.categoria.length).toBeLessThanOrEqual(60);
      expect(politica.padrao).toBe(dias);
      expect(TEXTO).toMatch(new RegExp(`IF NOT EXISTS \\(SELECT 1 FROM dbo\\.PoliticasRetencao WHERE Categoria = N'${cat}'\\)\\s+INSERT INTO dbo\\.PoliticasRetencao \\(Categoria, BaseLegal, DiasRetencao\\)\\s+VALUES \\(N'${cat}', N'x', ${dias}\\);`));
      const m = TEXTO.match(new RegExp(`UPDATE dbo\\.PoliticasRetencao\\s+SET BaseLegal = N'([^']+)'\\s+WHERE Categoria = N'${cat}' AND BaseLegal = N'x';`));
      expect(m).not.toBeNull();
      expect(m[1]).toBe(`${BASE} ${finalidade}`);
      expect(m[1].length).toBeLessThanOrEqual(300);
    });
  }
  test("não mexe em mais nada (nem no prazo que o Encarregado ajustar depois)", () => {
    const semComentarios = TEXTO.split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join("\n");
    expect(semComentarios).not.toMatch(/DELETE|DROP|ALTER|DiasRetencao =/i);
    expect((semComentarios.match(/INSERT INTO/g) || []).length).toBe(2);
    expect((semComentarios.match(/UPDATE /g) || []).length).toBe(2);
  });
});
