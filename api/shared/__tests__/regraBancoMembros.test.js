// A regra 4 do "Banco" (api/CLAUDE.md): nada de função sobre a coluna no filtro (ISNULL(col…) desliga o índice). Revisão de 24/11/2026, achado A5: o
// arrolamento (o filtro "no rol" e a gravação) e a pendência da importação usavam ISNULL na coluna. O sentido continua o mesmo: a ficha sem Status está no rol.
const fs = require("fs");
const path = require("path");

const fonte = (arq) => fs.readFileSync(path.join(__dirname, "..", arq), "utf8");
// ISNULL cujo primeiro argumento é uma coluna (não um @parâmetro nem um agregado como MAX(...))
const ISNULL_NA_COLUNA = /ISNULL\(\s*(?!@)(?![A-Z]+\()[A-Za-z_][A-Za-z0-9_.]*\s*,/g;

describe("a regra 4 do Banco no Membros (sem ISNULL na coluna do filtro)", () => {
  test.each(["arrolamentoDb.js", "importacaoMembrosDb.js"])("%s não usa ISNULL sobre coluna", (arq) => {
    expect(fonte(arq).match(ISNULL_NA_COLUNA) || []).toEqual([]);
  });

  test("o filtro 'no rol' do arrolamento continua aceitando a ficha sem Status (IS NULL OR NOT IN)", () => {
    const f = fonte("arrolamentoDb.js");
    expect(f).toMatch(/const NO_ROL = "\(m\.Status IS NULL OR m\.Status NOT IN \(N'DESLIGADO', N'FALECIDO'\)\)"/);
    expect(f).toMatch(/AND \(Status IS NULL OR Status NOT IN \(N'DESLIGADO', N'FALECIDO'\)\)/);
  });

  test("a pendência da importação compara o outro membro sem ISNULL (o igual e o nulo dos dois lados)", () => {
    expect(fonte("importacaoMembrosDb.js")).toMatch(/\(OutroMembroId = @o OR \(OutroMembroId IS NULL AND @o IS NULL\)\)/);
  });
});
