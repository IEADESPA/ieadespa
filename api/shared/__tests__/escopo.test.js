// Testes de shared/escopo.js — foco no bug real da v5.3: EscopoTipo=
// 'DEPARTAMENTO' (Líder Geral, v2.7) precisa resolver como campo inteiro
// ('TODAS'), nunca como zero congregações.
const { criarPoolFalso } = require("./testUtils");
const escopo = require("../escopo");

describe("resolverEscopoCongregacoes", () => {
  test("GLOBAL sempre resolve como TODAS, sem tocar o banco", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const r = await escopo.resolverEscopoCongregacoes(pool, "GLOBAL", null);
    expect(r).toBe("TODAS");
    expect(chamadas).toHaveLength(0);
  });

  test("DEPARTAMENTO (Líder Geral) resolve como TODAS — bug da v2.7 corrigido na v5.3", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const r = await escopo.resolverEscopoCongregacoes(pool, "DEPARTAMENTO", 7);
    expect(r).toBe("TODAS");
    expect(chamadas).toHaveLength(0); // não deve nem consultar o banco
  });

  test.each(["CONGREGACAO", "AREA", "REGIAO", "QUADRANTE", "DISTRITO", "EXTENSAO"])("escopo territorial %s SEM id resolve como NENHUMA congregação (antes valia como TODAS: furo de acesso geral)", async (tipo) => {
    const { pool, chamadas } = criarPoolFalso([]);
    for (const semId of [null, undefined, 0, ""]) expect(await escopo.resolverEscopoCongregacoes(pool, tipo, semId)).toEqual([]);
    expect(chamadas).toHaveLength(0);
  });
  test("GLOBAL e DEPARTAMENTO continuam TODAS mesmo sem id", async () => {
    const { pool } = criarPoolFalso([]);
    expect(await escopo.resolverEscopoCongregacoes(pool, "GLOBAL", null)).toBe("TODAS");
    expect(await escopo.resolverEscopoCongregacoes(pool, "DEPARTAMENTO", null)).toBe("TODAS");
    expect(await escopo.resolverEscopoCongregacoes(pool, null, null)).toBe("TODAS");
  });

  test("CONGREGACAO resolve pro nome real, consultando o banco", async () => {
    const { pool } = criarPoolFalso([[{ Nome: "Sede" }]]);
    const r = await escopo.resolverEscopoCongregacoes(pool, "CONGREGACAO", 1);
    expect(r).toEqual(["Sede"]);
  });

  test("tipo territorial desconhecido continua devolvendo array vazio (modo seguro)", async () => {
    const { pool } = criarPoolFalso([]);
    const r = await escopo.resolverEscopoCongregacoes(pool, "TIPO_QUE_NAO_EXISTE", 1);
    expect(r).toEqual([]);
  });
});
