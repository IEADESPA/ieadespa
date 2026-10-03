// Testes de Mediação e Arbitragem (vB.16, Art. 161-A) — impedimento de
// mediador/árbitro precisa ser calculado certo (parentesco > vínculo com
// congregação > participação prévia), e o prazo de encerramento nunca
// assume um número que o Regimento não informou (é sempre parametrizado).
const { criarPoolFalso } = require("./testUtils");
const mediacaoArbitragem = require("../mediacaoArbitragem");

const MEDIACAO = { mediacaoId: 1, assunto: "Disputa X", parteAId: 10, parteBId: 20 };

describe("avaliarPrazoEncerramento", () => {
  test("dentro do prazo parametrizado", () => {
    const r = mediacaoArbitragem.avaliarPrazoEncerramento("2026-01-01", 30, "2026-01-10");
    expect(r.prazoVencido).toBe(false);
  });
  test("prazo vencido", () => {
    const r = mediacaoArbitragem.avaliarPrazoEncerramento("2026-01-01", 5, "2026-01-10");
    expect(r.prazoVencido).toBe(true);
  });
});

describe("calcularImpedimento (Art. 161-A)", () => {
  test("candidato é uma das próprias partes: impedido, sem consultar banco", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const r = await mediacaoArbitragem.calcularImpedimento(pool, 10, MEDIACAO);
    expect(r.impedido).toBe(true);
    expect(chamadas).toHaveLength(0);
  });

  test("parentesco com uma das partes: impedido", async () => {
    const { pool } = criarPoolFalso([[{ a: 99, b: 10 }]]); // vizinhos: candidato-99 conectado à parte 10
    const r = await mediacaoArbitragem.calcularImpedimento(pool, 99, MEDIACAO);
    expect(r.impedido).toBe(true);
    expect(r.motivo).toMatch(/Parentesco/);
  });

  test("mesma congregação de uma das partes: impedido", async () => {
    const { pool } = criarPoolFalso([
      [], // vizinhos (sem parentesco)
      [{ membroId: 10, congregacaoId: 5 }, { membroId: 20, congregacaoId: 7 }], // congregações das partes
      [{ congregacaoId: 5 }] // congregação do candidato
    ]);
    const r = await mediacaoArbitragem.calcularImpedimento(pool, 99, MEDIACAO);
    expect(r.impedido).toBe(true);
    expect(r.motivo).toMatch(/congregação/);
  });

  test("já atuou em outro caso com uma das mesmas partes: impedido", async () => {
    const { pool } = criarPoolFalso([
      [], // vizinhos
      [{ membroId: 10, congregacaoId: 5 }, { membroId: 20, congregacaoId: 7 }],
      [{ congregacaoId: 99 }], // congregação diferente
      [{ MediacaoId: 4 }] // participação anterior
    ]);
    const r = await mediacaoArbitragem.calcularImpedimento(pool, 99, MEDIACAO);
    expect(r.impedido).toBe(true);
    expect(r.motivo).toMatch(/outro caso/);
  });

  test("sem nenhum impedimento", async () => {
    const { pool } = criarPoolFalso([
      [], [{ membroId: 10, congregacaoId: 5 }, { membroId: 20, congregacaoId: 7 }], [{ congregacaoId: 99 }], []
    ]);
    const r = await mediacaoArbitragem.calcularImpedimento(pool, 99, MEDIACAO);
    expect(r.impedido).toBe(false);
  });
});

describe("registrarAceiteClausulaCompromissoria / registrarAceiteAcordoMediacao / registrarCompromissoArbitral", () => {
  test("cláusula compromissória usa tipo fora do catálogo de termos.js", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ TermoAssinadoId: 1 }]]);
    await mediacaoArbitragem.registrarAceiteClausulaCompromissoria(pool, 5);
    expect(chamadas[0].inputs.tipo).toBe("CLAUSULA_COMPROMISSORIA_MEDIACAO");
  });
  test("acordo de mediação", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ TermoAssinadoId: 2 }]]);
    const id = await mediacaoArbitragem.registrarAceiteAcordoMediacao(pool, 5, "Pagamento de R$ 1000");
    expect(id).toBe(2);
    expect(chamadas[0].inputs.tipo).toBe("ACORDO_MEDIACAO");
  });
  test("compromisso arbitral", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ TermoAssinadoId: 3 }]]);
    const id = await mediacaoArbitragem.registrarCompromissoArbitral(pool, 5, "Disputa X");
    expect(id).toBe(3);
    expect(chamadas[0].inputs.tipo).toBe("COMPROMISSO_ARBITRAL");
  });
});
