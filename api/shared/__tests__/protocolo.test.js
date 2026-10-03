// Testes do gerador de protocolo institucional único (vB.4) — o ponto que
// mais importa aqui é o MERGE atômico substituir de vez o padrão
// `SELECT COUNT(*) ... WHERE Protocolo LIKE prefixo%` (que tinha corrida
// real sob concorrência).
const { criarPoolFalso, sqlFalso } = require("./testUtils");
const protocolo = require("../protocolo");

describe("proximoNumero (sequência atômica por Tipo+Ano)", () => {
  test("usa uma única query (MERGE), não ler-depois-escrever em dois passos", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ UltimoNumero: 1 }]]);
    const numero = await protocolo.proximoNumero(pool, "DISC");
    expect(numero).toBe(1);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].sql).toMatch(/MERGE/i);
    expect(chamadas[0].sql).toMatch(/HOLDLOCK/i);
    expect(chamadas[0].inputs.tipo).toBe("DISC");
  });
});

describe("gerarProtocolo (máscara TIPO-ANO-NNNN)", () => {
  test("formata com 4 dígitos por padrão", async () => {
    const { pool } = criarPoolFalso([[{ UltimoNumero: 7 }]]);
    const p = await protocolo.gerarProtocolo(pool, "PROJ");
    const ano = new Date().getFullYear();
    expect(p).toBe(`PROJ-${ano}-0007`);
  });

  test("aceita quantidade de dígitos customizada", async () => {
    const { pool } = criarPoolFalso([[{ UltimoNumero: 42 }]]);
    const p = await protocolo.gerarProtocolo(pool, "DISC", { digitos: 6 });
    const ano = new Date().getFullYear();
    expect(p).toBe(`DISC-${ano}-000042`);
  });
});
