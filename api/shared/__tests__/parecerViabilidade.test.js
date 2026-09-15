// Testes do Parecer de Viabilidade (vB.14, Art. 31) — só reaproveita o que
// já existe (Assentos, AlienacoesBens), sem tabela genérica fabricada.
const { criarPoolFalso } = require("./testUtils");
const parecerViabilidade = require("../parecerViabilidade");

describe("limiteParecerViabilidade", () => {
  test("lê o valor configurado", async () => {
    const { pool } = criarPoolFalso([[{ ValorLimite: 50000 }]]);
    const limite = await parecerViabilidade.limiteParecerViabilidade(pool);
    expect(limite).toBe(50000);
  });
  test("sem configuração, nunca bloqueia (Infinity)", async () => {
    const { pool } = criarPoolFalso([[]]);
    const limite = await parecerViabilidade.limiteParecerViabilidade(pool);
    expect(limite).toBe(Infinity);
  });
});

describe("membroNoConselhoConsultivo", () => {
  test("membro com assento ativo pode emitir parecer", async () => {
    const { pool } = criarPoolFalso([[{ x: 1 }]]);
    expect(await parecerViabilidade.membroNoConselhoConsultivo(pool, 1)).toBe(true);
  });
  test("sem assento ativo, não pode", async () => {
    const { pool } = criarPoolFalso([[]]);
    expect(await parecerViabilidade.membroNoConselhoConsultivo(pool, 1)).toBe(false);
  });
});

describe("possuiParecerFavoravel", () => {
  test("existe parecer FAVORAVEL vinculado", async () => {
    const { pool } = criarPoolFalso([[{ x: 1 }]]);
    expect(await parecerViabilidade.possuiParecerFavoravel(pool, 1)).toBe(true);
  });
  test("sem parecer favorável (nenhum ou só desfavorável)", async () => {
    const { pool } = criarPoolFalso([[]]);
    expect(await parecerViabilidade.possuiParecerFavoravel(pool, 1)).toBe(false);
  });
});

describe("registrarParecer", () => {
  test("insere e devolve o id", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ ParecerId: 9 }]]);
    const id = await parecerViabilidade.registrarParecer(pool, { alienacaoId: 3, decisao: "FAVORAVEL", justificativa: "ok", emitidoPor: 7 });
    expect(id).toBe(9);
    expect(chamadas[0].inputs.decisao).toBe("FAVORAVEL");
  });
});
