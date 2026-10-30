// v8.6 — a regra pura da educação continuada (shared/educacaoContinuada.js) e a regra única de "quem está nas funções" (afm.licencaLiturgica, credencial).
const ec = require("../educacaoContinuada");
const afm = require("../afm");
const credencial = require("../credencial");

const HOJE = "2026-10-30";
const ED_2025 = { ano: 2025, data: "2025-08-10" };

describe("a reciclagem anual (Art. 68 §3º)", () => {
  test("sem a aprovação da edição do ano anterior: a credencial não foi renovada", () => {
    const s = ec.situacao({ hojeIso: HOJE, obreiroDesde: "2020-01-01", edicaoAnterior: ED_2025, resultadoAnterior: { resultado: "REPROVADO" } });
    expect(s.reciclagemPendente).toBe(true);
    expect(ec.foraDasFuncoes(s)).toBe(true);
    expect(s.pendencias[0]).toMatch(/Art\. 68 §3º/);
  });
  test("aprovado: em dia; sem resultado registrado também conta como pendente (a frequência e a aprovação são exigidas)", () => {
    expect(ec.situacao({ hojeIso: HOJE, edicaoAnterior: ED_2025, resultadoAnterior: { resultado: "APROVADO" } }).reciclagemPendente).toBe(false);
    expect(ec.situacao({ hojeIso: HOJE, edicaoAnterior: ED_2025, resultadoAnterior: null }).reciclagemPendente).toBe(true);
  });
  test("quem virou obreiro depois da edição não tinha como ir; sem edição registrada, nada retroage; quem não é obreiro não deve", () => {
    expect(ec.situacao({ hojeIso: HOJE, obreiroDesde: "2025-09-01", edicaoAnterior: ED_2025 }).reciclagemPendente).toBe(false);
    expect(ec.situacao({ hojeIso: HOJE, edicaoAnterior: null }).reciclagemPendente).toBe(false);
    expect(ec.situacao({ hojeIso: HOJE, ehObreiro: false, edicaoAnterior: ED_2025 }).reciclagemPendente).toBe(false);
  });
  test("o início no ministério: a promoção não zera a contagem; uma interrupção sim; uma linha sem data = legado", () => {
    expect(ec.inicioNoMinisterio([{ desde: "2018-03-01", ate: "2026-12-10" }, { desde: "2026-12-10", ate: null }])).toBe("2018-03-01");
    expect(ec.inicioNoMinisterio([{ desde: "2010-01-01", ate: "2015-01-01" }, { desde: "2020-05-01", ate: null }])).toBe("2020-05-01");
    expect(ec.inicioNoMinisterio([{ desde: null, ate: "2026-12-10" }, { desde: "2026-12-10", ate: null }])).toBe(null);
    expect(ec.inicioNoMinisterio([{ desde: "2010-01-01", ate: "2015-01-01" }])).toBe(null);
    // o promovido em dezembro depois de reprovado na reciclagem de março continua devendo a do ano
    expect(ec.situacao({ hojeIso: "2027-02-01", obreiroDesde: ec.inicioNoMinisterio([{ desde: "2018-03-01", ate: "2026-12-10" }, { desde: "2026-12-10", ate: null }]),
      edicaoAnterior: { ano: 2026, data: "2026-03-15" }, resultadoAnterior: { resultado: "REPROVADO" } }).reciclagemPendente).toBe(true);
  });
  test("a edição que vale é a do ano ANTERIOR (a do ano corrente só vale no exercício seguinte)", () => {
    expect(ec.situacao({ hojeIso: HOJE, edicaoAnterior: { ano: 2026, data: "2026-08-10" } }).reciclagemPendente).toBe(false);
  });
  test("aprovado só com a frequência mínima", () => {
    const ed = { cargaHoraria: 20, frequenciaMinimaPct: 75 };
    expect(ec.horasMinimas(ed)).toBe(15);
    expect(ec.validarResultadoReciclagem({ resultado: "APROVADO", horasPresentes: 14.5 }, ed).valido).toBe(false);
    expect(ec.validarResultadoReciclagem({ resultado: "APROVADO", horasPresentes: "15" }, ed)).toMatchObject({ valido: true, resultado: { horasPresentes: 15 } });
    expect(ec.validarResultadoReciclagem({ resultado: "REPROVADO", horasPresentes: 21 }, ed).valido).toBe(false);
    expect(ec.validarResultadoReciclagem({ resultado: "AUSENTE" }, ed)).toMatchObject({ valido: true, resultado: { horasPresentes: null } });
    expect(ec.validarResultadoReciclagem({ resultado: "TALVEZ" }, ed).valido).toBe(false);
  });
  test("a edição: data, carga e frequência", () => {
    expect(ec.validarEdicao({ data: "2026-08-10", cargaHoraria: "20,5", frequenciaMinimaPct: 75 }, HOJE)).toMatchObject({ valido: true, edicao: { ano: 2026, cargaHoraria: 20.5 } });
    expect(ec.validarEdicao({ data: "2026-02-30", cargaHoraria: 20, frequenciaMinimaPct: 75 }, HOJE).valido).toBe(false);
    expect(ec.validarEdicao({ data: "2026-08-10", cargaHoraria: 0, frequenciaMinimaPct: 75 }, HOJE).valido).toBe(false);
    expect(ec.validarEdicao({ data: "2026-08-10", cargaHoraria: 20, frequenciaMinimaPct: 101 }, HOJE).valido).toBe(false);
  });
});

describe("o exame bienal (Art. 70 §3º)", () => {
  const ex = (...r) => r.map(([tipo, data, resultado]) => ({ tipo, data, resultado }));
  test("reprovado: sob observação (continua oficiando)", () => {
    const s = ec.situacao({ hojeIso: HOJE, exames: ex(["BIENAL", "2025-11-30", "REPROVADO"]) });
    expect(s.sobObservacao).toBe(true);
    expect(ec.foraDasFuncoes(s)).toBe(false);
  });
  test("ausente sem justificativa: suspenso das funções; com justificativa: deve a repescagem, sem sanção", () => {
    expect(ec.foraDasFuncoes(ec.situacao({ hojeIso: HOJE, exames: ex(["BIENAL", "2025-11-30", "AUSENTE"]) }))).toBe(true);
    const j = ec.situacao({ hojeIso: HOJE, exames: ex(["BIENAL", "2025-11-30", "AUSENTE_JUSTIFICADO"]) });
    expect(j.devendoRepescagem).toBe(true);
    expect(ec.foraDasFuncoes(j)).toBe(false);
  });
  test("aprovado na repescagem: em dia; ausente e depois reprovado na repescagem: continua suspenso", () => {
    expect(ec.situacao({ hojeIso: HOJE, exames: ex(["BIENAL", "2025-11-30", "AUSENTE"], ["REPESCAGEM", "2026-02-10", "APROVADO"]) }).suspensoExame).toBe(false);
    const s = ec.situacao({ hojeIso: HOJE, exames: ex(["BIENAL", "2025-11-30", "AUSENTE"], ["REPESCAGEM", "2026-02-10", "REPROVADO"]) });
    expect(s.suspensoExame).toBe(true);   // a reprovação depois da ausência não rebaixa a suspensão: só a aprovação a encerra
    expect(s.sobObservacao).toBe(false);
  });
  test("a sanção só cai com uma aprovação: a ausência justificada ou a reprovação depois não a tiram; um bienal novo sem registro também não", () => {
    const s1 = ec.situacao({ hojeIso: HOJE, exames: ex(["BIENAL", "2025-11-30", "AUSENTE"], ["REPESCAGEM", "2026-02-10", "AUSENTE_JUSTIFICADO"]) });
    expect(s1.suspensoExame).toBe(true);
    expect(s1.devendoRepescagem).toBe(false);
    expect(ec.situacao({ hojeIso: HOJE, exames: ex(["BIENAL", "2025-11-30", "REPROVADO"], ["REPESCAGEM", "2026-02-10", "AUSENTE_JUSTIFICADO"]) }).sobObservacao).toBe(true);
    const s3 = ec.situacao({ hojeIso: HOJE, exames: ex(["BIENAL", "2025-11-30", "AUSENTE"], ["REPESCAGEM", "2026-02-10", "REPROVADO"]) });
    expect([s3.suspensoExame, s3.sobObservacao]).toEqual([true, false]);
    expect(ec.situacao({ hojeIso: "2027-12-01", exames: ex(["BIENAL", "2025-11-30", "AUSENTE"]) }).suspensoExame).toBe(true);   // o bienal de 2027 sem registro dele
    expect(ec.situacao({ hojeIso: "2027-12-01", exames: ex(["BIENAL", "2025-11-30", "AUSENTE"], ["BIENAL", "2027-11-28", "APROVADO"]) }).suspensoExame).toBe(false);
  });
  test("o resultado e o exame validados", () => {
    expect(ec.validarResultadoExame({ resultado: "AUSENTE_JUSTIFICADO" }).valido).toBe(false);
    expect(ec.validarResultadoExame({ resultado: "AUSENTE_JUSTIFICADO", justificativa: "Internado no hospital" }).valido).toBe(true);
    expect(ec.validarResultadoExame({ resultado: "APROVADO", justificativa: "texto qualquer" }).resultado.justificativa).toBe(null);
    expect(ec.validarExame({ tipo: "REPESCAGEM", data: "2026-02-10" }, HOJE).valido).toBe(false);
    expect(ec.validarExame({ tipo: "BIENAL", data: "2026-11-29" }, HOJE)).toMatchObject({ valido: true, exame: { exameOrigemId: null } });
  });
  test("o aviso sai de outubro a dezembro", () => {
    expect(ec.mesDoAlerta("2026-10-01")).toBe(true);
    expect(ec.mesDoAlerta("2026-09-30")).toBe(false);
  });
});

describe("a regra única: a licença para oficiar e o QR", () => {
  const pastor = { cargo: "PASTOR", statusMatricula: "ATIVA", status: "ATIVO", situacaoMembro: "EM_COMUNHAO" };
  test("a reciclagem não renovada e a ausência no exame tiram as funções; sob observação, não", () => {
    expect(afm.licencaLiturgica({ ...pastor, educacao: { reciclagemPendente: true } }).podeOficiar).toBe(false);
    expect(afm.licencaLiturgica({ ...pastor, educacao: { suspensoExame: true } }).motivo).toMatch(/Art\. 70 §3º, II/);
    expect(afm.licencaLiturgica({ ...pastor, educacao: { sobObservacao: true } }).podeOficiar).toBe(true);
  });
  test("o QR: inativo, sob observação ou habilitado", () => {
    const p = { nome: "X", status: "ATIVO", situacaoMembro: "EM_COMUNHAO", cargo: "PASTOR", statusMatricula: "ATIVA", sobDisciplina: false, excluido: false, foraDaComunhao: false };
    const qr = (educacao) => credencial.situacaoPublica({ situacao: "VALIDA", via: 1 }, { ...p, educacao }).funcao;
    expect(qr(null)).toBe("HABILITADO");
    expect(qr({ sobObservacao: true })).toBe("SOB_OBSERVACAO");
    expect(qr({ reciclagemPendente: true })).toBe("INATIVO");
  });
});

describe("a escada", () => {
  const escada = require("../escada");
  test("a educação continuada pendente trava a promoção (nenhuma modalidade dispensa)", () => {
    const base = { cargoAtual: "PRESBITERO", cargoDesde: "2015-01-01", status: "ATIVO", emComunhao: true, sobDisciplina: false, dizimistaFiel: true, sexo: "M",
      dataNascimento: "1970-01-01", dataAdmissao: "1990-01-01", afm: { statusMatricula: "ATIVA", nivel: "AVANCADO", concluido: true, chm: true } };
    const it = (educacao, modalidade = "NOMEACAO_PRESIDENCIAL") => escada.avaliarAscensao({ ...base, educacao }, "EVANGELISTA", { modalidade, hojeIso: HOJE }).itens.find((i) => i.chave === "educacao");
    expect(it(null)).toBeUndefined();
    expect(it({ sobObservacao: true, pendencias: ["Sob observação."] })).toMatchObject({ situacao: "FALTA", tecnico: false });
    expect(it({ devendoRepescagem: true, pendencias: [] })).toMatchObject({ situacao: "AVISO" });   // a ausência justificada é "sem sanção"
    expect(escada.avaliarAscensao({ ...base, educacao: { devendoRepescagem: true, pendencias: [] } }, "EVANGELISTA", { modalidade: "NOMEACAO_PRESIDENCIAL", hojeIso: HOJE }).itens
      .filter((i) => i.situacao === "FALTA" && !i.tecnico).map((i) => i.chave)).not.toContain("educacao");
  });
});
