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
  // v6.9: a aptidão consulta TrilhaRequisitos (BATISMO_DISCIPULADO) — 1 query a
  // mais, sempre a ÚLTIMA da aptidão. Lista vazia = nenhuma trilha configurada.
  const SEM_REQUISITO_DE_TRILHA = [];

  test("candidato apto: todos os 4 itens ok", async () => {
    const { pool } = criarPoolFalso([SEM_REQUISITO_DE_TRILHA]);
    const r = await batismo.calcularAptidaoBatismo(pool, {
      membroId: 1, dataNascimento: "2010-01-01", estadoCivil: "SOLTEIRO",
      parecerVidaPregressa: "FAVORAVEL", discipuladoConcluidoManual: true
    });
    expect(r.apto).toBe(true);
    expect(r.itens.certidaoCivil.detalhe).toBe("Não se aplica");
    expect(r.itens.discipulado.verificadoPorTrilha).toBe(false);
    expect(r.itens.discipulado.detalhe).toMatch(/Atestado manualmente/);
  });

  test("menor de 12 anos nunca é apto, mesmo com tudo mais ok", async () => {
    const { pool } = criarPoolFalso([SEM_REQUISITO_DE_TRILHA]);
    const r = await batismo.calcularAptidaoBatismo(pool, {
      membroId: 1, dataNascimento: new Date().toISOString().slice(0, 10), estadoCivil: "SOLTEIRO",
      parecerVidaPregressa: "FAVORAVEL", discipuladoConcluidoManual: true
    });
    expect(r.apto).toBe(false);
    expect(r.itens.idadeMinima.ok).toBe(false);
  });

  test("união estável sem casamento civil registrado reprova só esse item", async () => {
    const { pool, chamadas } = criarPoolFalso([[], SEM_REQUISITO_DE_TRILHA]); // casamento civil -> nenhum; requisitos de trilha -> nenhum
    const r = await batismo.calcularAptidaoBatismo(pool, {
      membroId: 1, dataNascimento: "2000-01-01", estadoCivil: "UNIAO_ESTAVEL",
      parecerVidaPregressa: "FAVORAVEL", discipuladoConcluidoManual: true
    });
    expect(r.apto).toBe(false);
    expect(r.itens.certidaoCivil.ok).toBe(false);
    expect(chamadas).toHaveLength(2);
  });

  test("união estável COM casamento civil registrado passa nesse item", async () => {
    const { pool } = criarPoolFalso([[{ x: 1 }], SEM_REQUISITO_DE_TRILHA]);
    const r = await batismo.calcularAptidaoBatismo(pool, {
      membroId: 1, dataNascimento: "2000-01-01", estadoCivil: "UNIAO_ESTAVEL",
      parecerVidaPregressa: "FAVORAVEL", discipuladoConcluidoManual: true
    });
    expect(r.apto).toBe(true);
  });

  test("sem parecer favorável, nunca apto", async () => {
    const { pool } = criarPoolFalso([SEM_REQUISITO_DE_TRILHA]);
    const r = await batismo.calcularAptidaoBatismo(pool, {
      membroId: 1, dataNascimento: "2000-01-01", estadoCivil: "SOLTEIRO",
      parecerVidaPregressa: null, discipuladoConcluidoManual: true
    });
    expect(r.apto).toBe(false);
    expect(r.itens.parecerVidaPregressa.detalhe).toBe("Pendente");
  });
});

describe("calcularAptidaoBatismo — item IV verificado por trilha de formação (v6.9)", () => {
  const candidato = {
    membroId: 7, dataNascimento: "2000-01-01", estadoCivil: "SOLTEIRO",
    parecerVidaPregressa: "FAVORAVEL", discipuladoConcluidoManual: true // a atestação manual NÃO pode valer quando há trilha configurada
  };
  const requisito = { RequisitoId: 1, Contexto: "BATISMO_DISCIPULADO", AlvoChave: "", TrilhaId: 5, Modo: "BLOQUEIA", Ativo: true, TrilhaNome: "Discipulado", TrilhaAtiva: true };
  const matricula = (extra) => ({
    MatriculaId: 10, TrilhaId: 5, MembroId: 7, Status: "CONCLUIDA", IniciadaEm: "2026-01-01", ConcluidaEm: "2026-02-01", ValidoAte: null,
    TrilhaNome: "Discipulado", PapelAlvo: null, AvisoDias: 60, CertificadoId: 3, CodigoVerificacao: "ABCDEFGHJKLMNPQR", Protocolo: "CERT-1", RevogadoEm: null,
    ObrigConcluidos: 3, ObrigTotal: 3, ...extra
  });

  test("trilha configurada e nunca iniciada: reprova o item, mesmo com a atestação manual marcada", async () => {
    const { pool } = criarPoolFalso([[requisito], []]); // requisitos; matrículas do membro -> nenhuma
    const r = await batismo.calcularAptidaoBatismo(pool, candidato);
    expect(r.apto).toBe(false);
    expect(r.itens.discipulado.ok).toBe(false);
    expect(r.itens.discipulado.verificadoPorTrilha).toBe(true);
    expect(r.itens.discipulado.detalhe).toMatch(/trilha "Discipulado": ainda não iniciada/);
  });

  test("trilha configurada e concluída com certificado vigente: item ok, sem depender do manual", async () => {
    const { pool } = criarPoolFalso([[requisito], [matricula()]]);
    const r = await batismo.calcularAptidaoBatismo(pool, { ...candidato, discipuladoConcluidoManual: false });
    expect(r.apto).toBe(true);
    expect(r.itens.discipulado.detalhe).toBe("Verificado pela trilha de formação");
  });

  test("certificado da trilha revogado: item reprovado", async () => {
    const { pool } = criarPoolFalso([[requisito], [matricula({ RevogadoEm: "2026-03-01" })]]);
    const r = await batismo.calcularAptidaoBatismo(pool, candidato);
    expect(r.itens.discipulado.ok).toBe(false);
    expect(r.itens.discipulado.detalhe).toMatch(/certificado revogado/);
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
