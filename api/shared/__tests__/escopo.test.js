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

  test("sem escopoId, resolve como TODAS (mesmo comportamento de sempre)", async () => {
    const { pool } = criarPoolFalso([]);
    const r = await escopo.resolverEscopoCongregacoes(pool, "AREA", null);
    expect(r).toBe("TODAS");
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
