// Teste do ROPA (vB.8) — a única parte com lógica de verdade é a contagem
// real por tabela; o resto (finalidade/base legal) é catálogo estático.
const { criarPoolFalso } = require("./testUtils");
const { REGISTROS_TRATAMENTO, montarRopa } = require("../ropa");

describe("montarRopa", () => {
  // raio-x de velocidade 3 (17/11/2026): as contagens de todas as tabelas numa consulta só (antes, uma por tabela: 167 consultas por pedido)
  test("conta todas as tabelas envolvidas numa consulta só (UNION ALL) e anexa em `contagens` de cada registro", async () => {
    const tabelas = Array.from(new Set(REGISTROS_TRATAMENTO.flatMap((r) => r.tabelasEnvolvidas)));
    const { pool, chamadas } = criarPoolFalso([tabelas.map((t, i) => ({ tabela: t, total: i + 1 }))]);
    const registros = await montarRopa(pool, {});
    expect(chamadas).toHaveLength(1);
    for (const t of tabelas) expect(chamadas[0].sql).toContain(`SELECT N'${t}' AS tabela, COUNT(*) AS total FROM ${t}`);
    expect(chamadas[0].sql.match(/UNION ALL/g)).toHaveLength(tabelas.length - 1);
    expect(registros).toHaveLength(REGISTROS_TRATAMENTO.length);
    expect(registros[0].contagens[REGISTROS_TRATAMENTO[0].tabelasEnvolvidas[0]]).toBe(tabelas.indexOf(REGISTROS_TRATAMENTO[0].tabelasEnvolvidas[0]) + 1);
    // cada registro só com as SUAS tabelas, na ordem do catálogo
    REGISTROS_TRATAMENTO.forEach((r, i) => expect(Object.keys(registros[i].contagens)).toEqual(r.tabelasEnvolvidas.filter((t, j, a) => a.indexOf(t) === j)));
    // nunca perde os campos curados originais (finalidade, base legal etc.)
    expect(registros[0].finalidade).toBe(REGISTROS_TRATAMENTO[0].finalidade);
  });
});
