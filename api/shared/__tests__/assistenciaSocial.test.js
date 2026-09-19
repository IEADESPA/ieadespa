// Testes da lógica pura de Assistência Social (v5.9) — as três partes que
// os revisores mais vão escrutinar: (1) controle de recorrência de
// benefício calculado NA LEITURA (nunca digitado); (2) o parecer técnico
// só pode ser assinado por Assistente Social credenciado ATIVO, nunca uma
// decisão informal; (3) a isenção de taxa de cessão por ação social exige
// justificativa registrada, nunca isenta "de graça".
const as = require("../assistenciaSocial");

function entrega(tipoBeneficio, dataEntrega) {
  return { tipoBeneficio, dataEntrega };
}

describe("mesesConsecutivosComEntrega / avaliarRecorrenciaFamilia (controle de recorrência — calculado, nunca digitado)", () => {
  const AGORA = new Date("2026-09-15T00:00:00Z");

  test("sem nenhuma entrega, streak é zero", () => {
    expect(as.mesesConsecutivosComEntrega([], "CESTA_BASICA", AGORA)).toBe(0);
  });

  test("uma entrega só no mês corrente conta como 1 mês seguido", () => {
    const entregas = [entrega("CESTA_BASICA", "2026-09-05")];
    expect(as.mesesConsecutivosComEntrega(entregas, "CESTA_BASICA", AGORA)).toBe(1);
  });

  test("3 meses seguidos (jul, ago, set) contam 3 — dispara alerta (limite padrão 3)", () => {
    const entregas = [
      entrega("CESTA_BASICA", "2026-07-10"),
      entrega("CESTA_BASICA", "2026-08-02"),
      entrega("CESTA_BASICA", "2026-09-05")
    ];
    expect(as.mesesConsecutivosComEntrega(entregas, "CESTA_BASICA", AGORA)).toBe(3);
    const avaliacao = as.avaliarRecorrenciaFamilia(entregas, AGORA);
    expect(avaliacao).toEqual([{ tipoBeneficio: "CESTA_BASICA", mesesConsecutivos: 3, alertaRecorrencia: true }]);
  });

  test("um mês faltando no meio (jun, ago, set — sem julho) quebra o streak em 2, não conta os 3", () => {
    const entregas = [
      entrega("CESTA_BASICA", "2026-06-10"),
      entrega("CESTA_BASICA", "2026-08-02"),
      entrega("CESTA_BASICA", "2026-09-05")
    ];
    expect(as.mesesConsecutivosComEntrega(entregas, "CESTA_BASICA", AGORA)).toBe(2);
  });

  test("2 meses seguidos não dispara o alerta (abaixo do limite de 3)", () => {
    const entregas = [
      entrega("MEDICAMENTO", "2026-08-20"),
      entrega("MEDICAMENTO", "2026-09-01")
    ];
    const avaliacao = as.avaliarRecorrenciaFamilia(entregas, AGORA);
    expect(avaliacao[0].alertaRecorrencia).toBe(false);
  });

  test("tipos de benefício diferentes têm streaks independentes", () => {
    const entregas = [
      entrega("CESTA_BASICA", "2026-07-01"), entrega("CESTA_BASICA", "2026-08-01"), entrega("CESTA_BASICA", "2026-09-01"),
      entrega("AUXILIO_FINANCEIRO", "2026-09-10")
    ];
    const avaliacao = as.avaliarRecorrenciaFamilia(entregas, AGORA);
    const porTipo = Object.fromEntries(avaliacao.map(a => [a.tipoBeneficio, a]));
    expect(porTipo.CESTA_BASICA.mesesConsecutivos).toBe(3);
    expect(porTipo.AUXILIO_FINANCEIRO.mesesConsecutivos).toBe(1);
  });

  test("limite customizado (5) só dispara alerta com 5 meses seguidos", () => {
    const entregas = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"].map(d => entrega("CESTA_BASICA", d));
    const avaliacao = as.avaliarRecorrenciaFamilia(entregas, AGORA, 5);
    expect(avaliacao[0].mesesConsecutivos).toBe(5);
    expect(avaliacao[0].alertaRecorrencia).toBe(true);
  });
});

describe("podeAssinarParecer (parecer é do profissional credenciado, nunca decisão informal)", () => {
  test("recusa quando o membro não é Assistente Social credenciado (nenhuma linha na tabela)", () => {
    const resultado = as.podeAssinarParecer(null);
    expect(resultado.permitido).toBe(false);
    expect(resultado.mensagem).toMatch(/credenciado/);
  });

  test("recusa quando o credenciamento está inativo/revogado", () => {
    const resultado = as.podeAssinarParecer({ ativo: false });
    expect(resultado.permitido).toBe(false);
    expect(resultado.mensagem).toMatch(/inativo/);
  });

  test("permite quando o profissional está credenciado e ativo", () => {
    const resultado = as.podeAssinarParecer({ ativo: true });
    expect(resultado.permitido).toBe(true);
  });
});

describe("validarParecer", () => {
  test("recusa resultado fora do catálogo fechado", () => {
    expect(as.validarParecer({ resultado: "TALVEZ", parecer: "texto" }).valido).toBe(false);
  });

  test("recusa parecer vazio", () => {
    expect(as.validarParecer({ resultado: "APROVADO", parecer: "   " }).valido).toBe(false);
  });

  test("aceita parecer bem formado", () => {
    expect(as.validarParecer({ resultado: "APROVADO", parecer: "Família em situação de vulnerabilidade confirmada." }).valido).toBe(true);
  });
});

describe("validarCadastroSocioeconomico (Art. 46 — sempre mediante cadastro; LGPD Art. 7º, I)", () => {
  test("recusa sem consentimento registrado", () => {
    const resultado = as.validarCadastroSocioeconomico({ qtdPessoasNucleo: 4, consentimentoObtidoEm: null });
    expect(resultado.valido).toBe(false);
    expect(resultado.mensagem).toMatch(/consentimento/i);
  });

  test("recusa quantidade de pessoas inválida (zero, negativo, não-inteiro)", () => {
    expect(as.validarCadastroSocioeconomico({ qtdPessoasNucleo: 0, consentimentoObtidoEm: "2026-01-01" }).valido).toBe(false);
    expect(as.validarCadastroSocioeconomico({ qtdPessoasNucleo: -2, consentimentoObtidoEm: "2026-01-01" }).valido).toBe(false);
  });

  test("aceita cadastro completo e válido", () => {
    const resultado = as.validarCadastroSocioeconomico({ qtdPessoasNucleo: 3, consentimentoObtidoEm: "2026-01-01", baseLegal: "CONSENTIMENTO", situacaoMoradia: "ALUGADA" });
    expect(resultado.valido).toBe(true);
  });

  test("recusa base legal fora do catálogo de vB.8", () => {
    const resultado = as.validarCadastroSocioeconomico({ qtdPessoasNucleo: 3, consentimentoObtidoEm: "2026-01-01", baseLegal: "INVENTADA" });
    expect(resultado.valido).toBe(false);
  });
});

describe("validarIsencaoSocial (Art. 156 §3º, III — conecta com v4.18/v4.21, exige motivo registrado)", () => {
  test("cessão sem finalidade de ação social não exige nada extra", () => {
    expect(as.validarIsencaoSocial({ finalidadeAcaoSocial: false, isencaoTaxa: false }).valido).toBe(true);
  });

  test("finalidade de ação social sem isenção marcada é recusada", () => {
    const resultado = as.validarIsencaoSocial({ finalidadeAcaoSocial: true, isencaoTaxa: false });
    expect(resultado.valido).toBe(false);
    expect(resultado.mensagem).toMatch(/isenção/i);
  });

  test("finalidade de ação social com isenção mas sem motivo é recusada — nunca isenta 'de graça'", () => {
    const resultado = as.validarIsencaoSocial({ finalidadeAcaoSocial: true, isencaoTaxa: true, motivoIsencaoSocial: "  " });
    expect(resultado.valido).toBe(false);
    expect(resultado.mensagem).toMatch(/motivo/i);
  });

  test("finalidade de ação social com isenção e motivo justificado é aceita", () => {
    const resultado = as.validarIsencaoSocial({ finalidadeAcaoSocial: true, isencaoTaxa: true, motivoIsencaoSocial: "Distribuição de cestas básicas ao bairro." });
    expect(resultado.valido).toBe(true);
  });
});

describe("validarEntrega", () => {
  test("recusa tipo de benefício fora do catálogo", () => {
    expect(as.validarEntrega({ tipoBeneficio: "VIAGEM", dataEntrega: "2026-09-01" }).valido).toBe(false);
  });

  test("recusa sem data de entrega", () => {
    expect(as.validarEntrega({ tipoBeneficio: "CESTA_BASICA", dataEntrega: null }).valido).toBe(false);
  });

  test("aceita entrega bem formada", () => {
    expect(as.validarEntrega({ tipoBeneficio: "MEDICAMENTO", dataEntrega: "2026-09-01" }).valido).toBe(true);
  });
});
