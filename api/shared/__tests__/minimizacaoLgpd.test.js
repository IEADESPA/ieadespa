// Testes da retenção que executa (vB.8) — o ponto que mais importa: o
// prazo vem de PoliticasRetencao (nunca mais hardcoded), e cair pro
// fallback de 30 dias nunca destrava um prazo MAIOR sozinho quando a
// política está ausente/inativa.
const { criarPoolFalso } = require("./testUtils");
const { diasMinimizacaoExMembro, minimizarCamposExMembro, DIAS_MINIMIZACAO_PADRAO } = require("../minimizacaoLgpd");

describe("diasMinimizacaoExMembro", () => {
  test("usa o DiasRetencao da política quando ela existe e está ativa", async () => {
    const { pool } = criarPoolFalso([[{ DiasRetencao: 45 }]]);
    const dias = await diasMinimizacaoExMembro(pool);
    expect(dias).toBe(45);
  });

  test("cai pro padrão (30) quando a política não existe/está inativa", async () => {
    const { pool } = criarPoolFalso([[]]);
    const dias = await diasMinimizacaoExMembro(pool);
    expect(dias).toBe(DIAS_MINIMIZACAO_PADRAO);
  });

  test("cai pro padrão também se a política existe mas DiasRetencao é NULL (indeterminado)", async () => {
    const { pool } = criarPoolFalso([[{ DiasRetencao: null }]]);
    const dias = await diasMinimizacaoExMembro(pool);
    expect(dias).toBe(DIAS_MINIMIZACAO_PADRAO);
  });
});

describe("minimizarCamposExMembro", () => {
  test("encerra vínculos (Assentos/Lideranca/Cargo) antes de zerar os campos operacionais", async () => {
    const { pool, chamadas } = criarPoolFalso([[], [], [], []]);
    await minimizarCamposExMembro(pool, 42, { dataSaida: "2026-01-01", motivo: "Carta de Mudança" });
    expect(chamadas).toHaveLength(4); // 3 de encerrarVinculos + 1 do UPDATE final
    expect(chamadas[3].sql).toMatch(/Telefone = NULL, Email = NULL, Endereco = NULL/);
    expect(chamadas[3].sql).not.toMatch(/Nome\s*=\s*NULL/); // nunca apaga o Registro Histórico Mínimo
    expect(chamadas[3].inputs.id).toBe(42);
  });
});
