// Teste do ROPA (vB.8) — a única parte com lógica de verdade é a contagem
// real por tabela; o resto (finalidade/base legal) é catálogo estático.
const { criarPoolFalso } = require("./testUtils");
const { REGISTROS_TRATAMENTO, montarRopa } = require("../ropa");

describe("montarRopa", () => {
  test("consulta COUNT(*) uma vez por tabela envolvida, na ordem do catálogo, e anexa em `contagens`", async () => {
    const totalTabelas = REGISTROS_TRATAMENTO.reduce((soma, r) => soma + r.tabelasEnvolvidas.length, 0);
    const recordsets = REGISTROS_TRATAMENTO.flatMap((r) => r.tabelasEnvolvidas.map((_, i) => [{ total: i + 1 }]));
    const { pool, chamadas } = criarPoolFalso(recordsets);
    const registros = await montarRopa(pool, {});
    expect(chamadas).toHaveLength(totalTabelas);
    expect(registros).toHaveLength(REGISTROS_TRATAMENTO.length);
    expect(registros[0].contagens[REGISTROS_TRATAMENTO[0].tabelasEnvolvidas[0]]).toBe(1);
    // nunca perde os campos curados originais (finalidade, base legal etc.)
    expect(registros[0].finalidade).toBe(REGISTROS_TRATAMENTO[0].finalidade);
  });
});
