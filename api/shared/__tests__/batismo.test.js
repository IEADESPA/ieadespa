// Testes da esteira de batismo (vB.11) — a aptidão (Art. 80 §2º) precisa
// ser calculada certo nos 4 itens, e as duas vedações do §3º (mês da turma,
// tipo de local) nunca podem passar quando a regra bloqueia.
const { criarPoolFalso } = require("./testUtils");
const batismo = require("../batismo");

describe("mesValidoParaTurma (Art. 80 §3º, I — só maio e outubro)", () => {
  test("maio e outubro passam", () => {
    expect(batismo.mesValidoParaTurma("2026-05-15")).toBe(true);
    expect(batismo.mesValidoParaTurma("2026-10-03")).toBe(true);
  });
  test("qualquer outro mês é recusado", () => {
    expect(batismo.mesValidoParaTurma("2026-03-01")).toBe(false);
    expect(batismo.mesValidoParaTurma("2026-12-25")).toBe(false);
  });
});

describe("localPermitido (Art. 80 §3º, II-III — vedação de rio/represa)", () => {
  test("templo e outro local aprovado passam", () => {
    expect(batismo.localPermitido("TEMPLO")).toBe(true);
    expect(batismo.localPermitido("OUTRO_APROVADO")).toBe(true);
  });
  test("rio e represa são recusados, case-insensitive", () => {
    expect(batismo.localPermitido("RIO")).toBe(false);
    expect(batismo.localPermitido("represa")).toBe(false);
  });
});

describe("calcularAptidaoBatismo (Art. 80 §2º)", () => {
  test("candidato apto: todos os 4 itens ok", async () => {
    const { pool } = criarPoolFalso([]);
    const r = await batismo.calcularAptidaoBatismo(pool, {
      membroId: 1, dataNascimento: "2010-01-01", estadoCivil: "SOLTEIRO",
      parecerVidaPregressa: "FAVORAVEL", discipuladoConcluidoManual: true
    });
    expect(r.apto).toBe(true);
    expect(r.itens.certidaoCivil.detalhe).toBe("Não se aplica");
  });

  test("menor de 12 anos nunca é apto, mesmo com tudo mais ok", async () => {
    const { pool } = criarPoolFalso([]);
    const r = await batismo.calcularAptidaoBatismo(pool, {
      membroId: 1, dataNascimento: new Date().toISOString().slice(0, 10), estadoCivil: "SOLTEIRO",
      parecerVidaPregressa: "FAVORAVEL", discipuladoConcluidoManual: true
    });
    expect(r.apto).toBe(false);
    expect(r.itens.idadeMinima.ok).toBe(false);
  });

  test("união estável sem casamento civil registrado reprova só esse item", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]); // possuiCasamentoCivilRegistrado -> nenhum
    const r = await batismo.calcularAptidaoBatismo(pool, {
      membroId: 1, dataNascimento: "2000-01-01", estadoCivil: "UNIAO_ESTAVEL",
      parecerVidaPregressa: "FAVORAVEL", discipuladoConcluidoManual: true
    });
    expect(r.apto).toBe(false);
    expect(r.itens.certidaoCivil.ok).toBe(false);
    expect(chamadas).toHaveLength(1);
  });

  test("união estável COM casamento civil registrado passa nesse item", async () => {
    const { pool } = criarPoolFalso([[{ x: 1 }]]);
    const r = await batismo.calcularAptidaoBatismo(pool, {
      membroId: 1, dataNascimento: "2000-01-01", estadoCivil: "UNIAO_ESTAVEL",
      parecerVidaPregressa: "FAVORAVEL", discipuladoConcluidoManual: true
    });
    expect(r.apto).toBe(true);
  });

  test("sem parecer favorável, nunca apto", async () => {
    const { pool } = criarPoolFalso([]);
    const r = await batismo.calcularAptidaoBatismo(pool, {
      membroId: 1, dataNascimento: "2000-01-01", estadoCivil: "SOLTEIRO",
      parecerVidaPregressa: null, discipuladoConcluidoManual: true
    });
    expect(r.apto).toBe(false);
    expect(r.itens.parecerVidaPregressa.detalhe).toBe("Pendente");
  });
});

describe("efetivarTurma (Art. 7º, II — efetivação automática)", () => {
  test("efetiva só os APROVADOS da turma, nunca os pendentes/reprovados", async () => {
    const { pool, chamadas } = criarPoolFalso([
      [{ DataBatismo: "2026-05-16" }], // turma
      [{ CandidatoId: 1, MembroId: 10 }, { CandidatoId: 2, MembroId: 11 }], // aprovados (2)
      [], // update MembroReferencia #1
      [], // update CandidatosBatismo #1
      [], // update MembroReferencia #2
      []  // update CandidatosBatismo #2
    ]);
    const total = await batismo.efetivarTurma(pool, 1);
    expect(total).toBe(2);
    expect(chamadas).toHaveLength(6);
    expect(chamadas[2].sql).toMatch(/SituacaoMembro = 'EM_COMUNHAO'/);
    expect(chamadas[2].inputs.dataBatismo).toBe("2026-05-16");
  });

  test("turma inexistente não efetiva nada", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]);
    const total = await batismo.efetivarTurma(pool, 999);
    expect(total).toBe(0);
    expect(chamadas).toHaveLength(1);
  });
});

describe("registrarAceiteEstatuto", () => {
  test("insere em TermosAssinados com o tipo próprio do aceite de membresia", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ TermoAssinadoId: 7 }]]);
    const id = await batismo.registrarAceiteEstatuto(pool, 42);
    expect(id).toBe(7);
    expect(chamadas[0].inputs.tipo).toBe("ACEITE_ESTATUTO_MEMBRESIA");
    expect(chamadas[0].inputs.membroId).toBe(42);
  });
});
