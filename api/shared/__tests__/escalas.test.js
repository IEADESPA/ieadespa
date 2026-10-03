// Testes do auto-escalador de Escalas de Serviço (v5.6) — a parte que os
// revisores mais vão escrutinar: indisponibilidade exclui de verdade,
// "quem serviu por último" + frequência escolhe certo, conflito entre
// equipes é detectado (mesma pessoa em 2 equipes no mesmo culto), e uma
// recusa avança a cadeia de convite pro próximo elegível.
const escalas = require("../escalas");

describe("estaIndisponivelNaData", () => {
  test("dentro do período declarado é indisponível", () => {
    const ind = [{ dataInicio: "2026-01-10", dataFim: "2026-01-20" }];
    expect(escalas.estaIndisponivelNaData(ind, "2026-01-15")).toBe(true);
  });
  test("nos limites (inclusive) é indisponível", () => {
    const ind = [{ dataInicio: "2026-01-10", dataFim: "2026-01-20" }];
    expect(escalas.estaIndisponivelNaData(ind, "2026-01-10")).toBe(true);
    expect(escalas.estaIndisponivelNaData(ind, "2026-01-20")).toBe(true);
  });
  test("fora do período é disponível", () => {
    const ind = [{ dataInicio: "2026-01-10", dataFim: "2026-01-20" }];
    expect(escalas.estaIndisponivelNaData(ind, "2026-01-21")).toBe(false);
  });
  test("sem nenhuma indisponibilidade declarada é disponível", () => {
    expect(escalas.estaIndisponivelNaData([], "2026-01-15")).toBe(false);
    expect(escalas.estaIndisponivelNaData(undefined, "2026-01-15")).toBe(false);
  });
});

describe("ordenarCandidatosElegiveis (quem serviu por último + frequência preferida)", () => {
  test("quem nunca serviu vem antes de quem já serviu", () => {
    const candidatos = [
      { membroId: 1, ultimoServicoEm: "2026-01-01", frequenciaPreferidaDias: 30 },
      { membroId: 2, ultimoServicoEm: null, frequenciaPreferidaDias: 30 }
    ];
    const fila = escalas.ordenarCandidatosElegiveis(candidatos, "2026-02-15");
    expect(fila.map(c => c.membroId)).toEqual([2, 1]);
  });

  test("entre quem já serviu, quem espera há mais tempo vem primeiro", () => {
    const candidatos = [
      { membroId: 1, ultimoServicoEm: "2026-01-01", frequenciaPreferidaDias: 30 }, // 45 dias — elegível
      { membroId: 2, ultimoServicoEm: "2025-12-01", frequenciaPreferidaDias: 30 } // 76 dias — elegível e espera há mais tempo
    ];
    const fila = escalas.ordenarCandidatosElegiveis(candidatos, "2026-02-15");
    expect(fila.map(c => c.membroId)).toEqual([2, 1]);
  });

  test("quem serviu há menos dias que a frequência preferida fica de fora (ainda não é elegível)", () => {
    const candidatos = [
      { membroId: 1, ultimoServicoEm: "2026-02-10", frequenciaPreferidaDias: 30 }, // só 5 dias antes do serviço
      { membroId: 2, ultimoServicoEm: "2026-01-01", frequenciaPreferidaDias: 30 } // 45 dias — já elegível
    ];
    const fila = escalas.ordenarCandidatosElegiveis(candidatos, "2026-02-15");
    expect(fila.map(c => c.membroId)).toEqual([2]);
  });

  test("indisponibilidade exclui mesmo quem seria o mais elegível por frequência", () => {
    const candidatos = [
      { membroId: 1, ultimoServicoEm: "2025-01-01", frequenciaPreferidaDias: 30, indisponibilidades: [{ dataInicio: "2026-02-01", dataFim: "2026-02-28" }] },
      { membroId: 2, ultimoServicoEm: "2026-01-01", frequenciaPreferidaDias: 30, indisponibilidades: [] }
    ];
    const fila = escalas.ordenarCandidatosElegiveis(candidatos, "2026-02-15");
    expect(fila.map(c => c.membroId)).toEqual([2]);
  });
});

describe("temConflitoEntreEquipes", () => {
  test("detecta a mesma pessoa ativa em outra equipe no mesmo serviço", () => {
    const alocacoes = [{ membroId: 5, equipeId: 1, status: "ACEITO" }];
    expect(escalas.temConflitoEntreEquipes(alocacoes, 5, 2)).toBe(true);
  });
  test("não conflita consigo mesma equipe", () => {
    const alocacoes = [{ membroId: 5, equipeId: 1, status: "ACEITO" }];
    expect(escalas.temConflitoEntreEquipes(alocacoes, 5, 1)).toBe(false);
  });
  test("alocação RECUSADA ou CANCELADA em outra equipe não conta como conflito (a pessoa está livre)", () => {
    const alocacoes = [
      { membroId: 5, equipeId: 1, status: "RECUSADO" },
      { membroId: 5, equipeId: 3, status: "CANCELADA" }
    ];
    expect(escalas.temConflitoEntreEquipes(alocacoes, 5, 2)).toBe(false);
  });
  test("outra pessoa na outra equipe não conflita", () => {
    const alocacoes = [{ membroId: 9, equipeId: 1, status: "CONFIRMADO" }];
    expect(escalas.temConflitoEntreEquipes(alocacoes, 5, 2)).toBe(false);
  });
});

describe("autoEscalarServico", () => {
  test("escala o mais elegível de cada equipe e evita conflito entre equipes distintas", () => {
    // Membro 1 é o mais elegível pras duas equipes (nunca serviu) — só pode
    // ficar em uma; a outra equipe deve pular pro segundo colocado.
    const equipes = [
      { equipeId: 10, candidatos: [
        { membroId: 1, ultimoServicoEm: null, frequenciaPreferidaDias: 30 },
        { membroId: 2, ultimoServicoEm: "2025-01-01", frequenciaPreferidaDias: 30 }
      ]},
      { equipeId: 20, candidatos: [
        { membroId: 1, ultimoServicoEm: null, frequenciaPreferidaDias: 30 },
        { membroId: 3, ultimoServicoEm: "2025-01-01", frequenciaPreferidaDias: 30 }
      ]}
    ];
    const plano = escalas.autoEscalarServico({ dataServico: "2026-02-15", equipes, alocacoesExistentes: [] });
    const equipe10 = plano.find(p => p.equipeId === 10);
    const equipe20 = plano.find(p => p.equipeId === 20);
    expect(equipe10.convidadoAtual).toBe(1);
    expect(equipe20.convidadoAtual).toBe(3); // não pode ser 1, já ocupado na equipe 10
  });

  test("respeita alocação ativa já existente de outro processo (conflito cruzado pré-existente)", () => {
    const equipes = [
      { equipeId: 20, candidatos: [{ membroId: 1, ultimoServicoEm: null, frequenciaPreferidaDias: 30 }] }
    ];
    const alocacoesExistentes = [{ membroId: 1, equipeId: 10, status: "CONFIRMADO" }];
    const plano = escalas.autoEscalarServico({ dataServico: "2026-02-15", equipes, alocacoesExistentes });
    expect(plano[0].convidadoAtual).toBe(null);
    expect(plano[0].filaConvite).toEqual([]);
  });

  test("fila de convite guarda todos os elegíveis, não só o escolhido (base do convite em cadeia)", () => {
    const equipes = [
      { equipeId: 10, candidatos: [
        { membroId: 1, ultimoServicoEm: "2025-06-01", frequenciaPreferidaDias: 30 },
        { membroId: 2, ultimoServicoEm: "2025-01-01", frequenciaPreferidaDias: 30 },
        { membroId: 3, ultimoServicoEm: "2025-03-01", frequenciaPreferidaDias: 30 }
      ]}
    ];
    const plano = escalas.autoEscalarServico({ dataServico: "2026-02-15", equipes, alocacoesExistentes: [] });
    expect(plano[0].filaConvite).toEqual([2, 3, 1]); // ordem por espera desde o último serviço
    expect(plano[0].convidadoAtual).toBe(2);
  });
});

describe("proximoConviteAposRecusa (convite em cadeia)", () => {
  test("recusou, chama o próximo da fila", () => {
    const { proximoConvidado } = escalas.proximoConviteAposRecusa([2, 3, 1], 2, []);
    expect(proximoConvidado).toBe(3);
  });
  test("pula quem já recusou antes na mesma cadeia", () => {
    const { proximoConvidado, recusados } = escalas.proximoConviteAposRecusa([2, 3, 1], 3, [2]);
    expect(proximoConvidado).toBe(1);
    expect(recusados.sort()).toEqual([2, 3]);
  });
  test("fila esgotada devolve null (ninguém mais elegível — fica pendência manual)", () => {
    const { proximoConvidado } = escalas.proximoConviteAposRecusa([2], 2, []);
    expect(proximoConvidado).toBe(null);
  });
});

describe("listarPendenciasConfirmacao", () => {
  const alocacoes = [
    { alocacaoId: 1, equipeId: 10, membroId: 1, status: "CONVIDADO" },
    { alocacaoId: 2, equipeId: 10, membroId: 2, status: "CONFIRMADO" },
    { alocacaoId: 3, equipeId: 10, membroId: 3, status: "ACEITO" }
  ];
  test("antes do prazo, ninguém vira pendência", () => {
    const r = escalas.listarPendenciasConfirmacao(alocacoes, "2026-02-10", 3, new Date("2026-02-11"));
    expect(r).toEqual([]);
  });
  test("no prazo exato ou depois, CONVIDADO e ACEITO (mas não CONFIRMADO) viram pendência do líder", () => {
    const r = escalas.listarPendenciasConfirmacao(alocacoes, "2026-02-10", 3, new Date("2026-02-13"));
    expect(r.map(a => a.alocacaoId).sort()).toEqual([1, 3]);
  });
  test("sem data de publicação, não há pendência (escala ainda nem foi publicada)", () => {
    expect(escalas.listarPendenciasConfirmacao(alocacoes, null, 3, new Date())).toEqual([]);
  });
});

describe("validarTroca", () => {
  test("recusa troca pra quem está indisponível na data", () => {
    const r = escalas.validarTroca({
      servicoId: 1, equipeId: 10, membroDestinoId: 5, dataServico: "2026-02-15",
      indisponibilidadesDestino: [{ dataInicio: "2026-02-01", dataFim: "2026-02-28" }],
      alocacoesDoServico: []
    });
    expect(r.valido).toBe(false);
  });
  test("recusa troca que criaria conflito entre equipes", () => {
    const r = escalas.validarTroca({
      servicoId: 1, equipeId: 10, membroDestinoId: 5, dataServico: "2026-02-15",
      indisponibilidadesDestino: [],
      alocacoesDoServico: [{ membroId: 5, equipeId: 20, status: "CONFIRMADO" }]
    });
    expect(r.valido).toBe(false);
  });
  test("aprova troca sem conflito e sem indisponibilidade", () => {
    const r = escalas.validarTroca({
      servicoId: 1, equipeId: 10, membroDestinoId: 5, dataServico: "2026-02-15",
      indisponibilidadesDestino: [], alocacoesDoServico: []
    });
    expect(r.valido).toBe(true);
  });
});
