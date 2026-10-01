// Testes da v7.2 (Calendário Oficial e Agenda Unificada) — o motor puro do
// Regimento: agenda litúrgica do Art. 79, ciclo mensal (Art. 154-A, Art. 81),
// precedência por nível, conflito territorial, trava de Área, Direito Adquirido
// Temporal, Esgotamento de Pauta e a convocação de 48 h (Art. 147 §2º).
const c = require("../calendario");

// ---- fixtures ----
const AREA_DE = { 1: 10, 2: 10, 3: 20, 4: 20, 5: null }; // congregação -> Área (5 = Sede, sem Área)
const ctx = { areaDe: (id) => (id in AREA_DE ? AREA_DE[id] : null) };

const TIPOS = {
  CEIA: { codigo: "SANTA_CEIA_LOCAL", festividade: false, compativeis: ["REUNIAO_CLI"], fechaCongregacoes: false },
  CEIA_GERAL: { codigo: "SANTA_CEIA_GERAL", festividade: false, compativeis: ["REUNIAO_CLI"], fechaCongregacoes: true },
  CLI: { codigo: "REUNIAO_CLI", festividade: false, compativeis: ["SANTA_CEIA_LOCAL", "SANTA_CEIA_GERAL"], fechaCongregacoes: false },
  CONGRESSO: { codigo: "CONGRESSO_UNIFICADO_DEPARTAMENTOS", festividade: false, compativeis: [], fechaCongregacoes: true },
  CRUZADA_GERAL: { codigo: "CRUZADA_GERAL", festividade: false, compativeis: [], fechaCongregacoes: false },
  CRUZADA_AREA: { codigo: "CRUZADA_AREA", festividade: false, compativeis: [], fechaCongregacoes: false },
  ANIVERSARIO: { codigo: "ANIVERSARIO_CONGREGACAO", festividade: true, compativeis: [], fechaCongregacoes: false },
  CAMPANHA: { codigo: "CAMPANHA_ORACAO", festividade: false, compativeis: [], fechaCongregacoes: false },
  CASAMENTO: { codigo: "CASAMENTO_BODAS", festividade: false, compativeis: [], fechaCongregacoes: false }
};
let proximoId = 1;
function ev(parcial) {
  return {
    id: proximoId++, nivel: 4, tipo: TIPOS.ANIVERSARIO, titulo: `evento ${proximoId}`, dataInicio: "2027-03-13", dataFim: "2027-03-13",
    horaInicio: null, horaFim: null, abrangencia: "CONGREGACAO", congregacaoId: 1, areaIds: [], propostaEm: "2027-01-05T10:00:00.000Z",
    status: "HOMOLOGADO", tardia: false, origem: "PROPOSTA", ...parcial
  };
}

describe("datas", () => {
  test("dia da semana, último domingo e n-ésimo domingo de 2027", () => {
    expect(c.diaDaSemana("2027-01-03")).toBe(0);
    expect(c.ultimoDomingo(2027, 1)).toBe("2027-01-31");
    expect(c.ultimoDomingo(2027, 2)).toBe("2027-02-28");
    expect(c.ultimoDomingo(2027, 10)).toBe("2027-10-31");
    expect(c.ultimoDomingo(2027, 12)).toBe("2027-12-26");
    expect(c.enesimoDomingo(2027, 1, 3)).toBe("2027-01-17");
    expect(c.enesimoDomingo(2027, 2, 5)).toBeNull();
  });

  test("somarDias, diasEntre e dataIsoValida", () => {
    expect(c.somarDias("2027-02-27", 2)).toBe("2027-03-01");
    expect(c.somarDias("2027-01-01", -1)).toBe("2026-12-31");
    expect(c.diasEntre("2027-03-01", "2027-03-31")).toBe(30);
    expect(c.dataIsoValida("2027-02-29")).toBe(false);
    expect(c.dataIsoValida("2028-02-29")).toBe(true);
  });

  test("fim de semana: sábado e domingo da mesma semana têm a mesma chave", () => {
    expect(c.chaveFimDeSemana("2027-03-13")).toBe("2027-03-13"); // sábado
    expect(c.chaveFimDeSemana("2027-03-14")).toBe("2027-03-13"); // domingo
    expect(c.chaveFimDeSemana("2027-03-12")).toBeNull();          // sexta
    expect([...c.fimDeSemanasDoPeriodo("2027-03-12", "2027-03-21")].sort()).toEqual(["2027-03-13", "2027-03-20"]);
  });

  test("hora para o site: 19:00 -> 19h, 19:30 -> 19h30", () => {
    expect(c.horaParaSite("19:00")).toBe("19h");
    expect(c.horaParaSite("19:30")).toBe("19h30");
    expect(c.horaParaSite("07:05")).toBe("7h05");
    expect(c.horaParaSite(null)).toBeNull();
    expect(c.horaParaSite("abc")).toBeNull();
  });
});

describe("agenda litúrgica oficial (Art. 79)", () => {
  const regra = (r) => ({ ativo: true, ordem: 0, ...r });
  const regras = [
    regra({ id: 1, dia: "quarta", escopo: "CONGREGACOES", ocorrencia: null, titulo: "USADESPA Local", tipo: "CULTO", ordem: 5 }),
    regra({ id: 2, dia: "quarta", escopo: "CONGREGACOES", ocorrencia: "ultimo", titulo: "UHADESPA (última quarta)", tipo: "CULTO", ordem: 6 }),
    regra({ id: 3, dia: "quinta", escopo: "SEDE", ocorrencia: null, titulo: "USADESPA Local (Sede)", tipo: "CULTO" }),
    regra({ id: 4, dia: "sexta", escopo: "CONGREGACOES", titulo: "Doutrina Local", tipo: "CULTO" }),
    regra({ id: 5, dia: "domingo_noite", escopo: "SEDE", ocorrencia: "4_se_5", titulo: "Fraternal Local", tipo: "CULTO" }),
    regra({ id: 6, dia: "domingo_noite", escopo: "CONGREGACOES", ocorrencia: "4_se_5", titulo: "Tema Livre", tipo: "CULTO" }),
    regra({ id: 7, dia: "domingo_noite", escopo: "TODAS", ocorrencia: "ultimo", titulo: "Santa Ceia", tipo: "CEIA" }),
    regra({ id: 8, dia: "domingo_noite", escopo: "TODAS", ocorrencia: "3", titulo: "Culto da Família", tipo: "CULTO" }),
    regra({ id: 9, dia: "domingo_manha", escopo: "TODAS", titulo: "EBD", tipo: "EBD" }),
    regra({ id: 10, dia: "quarta", escopo: "SEDE", titulo: "Noite livre", tipo: "NOITE_LIVRE" })
  ];
  const titulos = (iso, local) => c.agendaLiturgicaDoDia(regras, iso, local).map(r => r.titulo);

  test("a última quarta-feira da UHADESPA SUBSTITUI a da USADESPA", () => {
    expect(titulos("2026-10-21", "CONGREGACAO")).toEqual(["USADESPA Local"]);
    expect(titulos("2026-10-28", "CONGREGACAO")).toEqual(["UHADESPA (última quarta)"]);
  });

  test("regra de congregação não aparece na Sede e vice-versa", () => {
    expect(titulos("2026-10-21", "SEDE")).toEqual(["Noite livre"]);
    expect(titulos("2026-10-22", "SEDE")).toEqual(["USADESPA Local (Sede)"]);
    expect(titulos("2026-10-22", "CONGREGACAO")).toEqual([]);
  });

  test("o 4º domingo só existe em mês de 5 domingos; senão o 4º é o último (Ceia)", () => {
    const noite = (iso, local) => c.agendaLiturgicaDoDia(regras, iso, local).filter(r => r.dia === "domingo_noite").map(r => r.titulo);
    // março/2026 tem 5 domingos (1, 8, 15, 22, 29): 22 = 4º domingo, 29 = último
    expect(noite("2026-03-22", "SEDE")).toEqual(["Fraternal Local"]);
    expect(noite("2026-03-22", "CONGREGACAO")).toEqual(["Tema Livre"]);
    expect(noite("2026-03-29", "SEDE")).toEqual(["Santa Ceia"]);
    // outubro/2026 tem 4 domingos (4, 11, 18, 25): 25 = último = Ceia, nunca "4º domingo"
    expect(noite("2026-10-25", "SEDE")).toEqual(["Santa Ceia"]);
    expect(noite("2026-10-25", "CONGREGACAO")).toEqual(["Santa Ceia"]);
  });

  test("domingo: EBD de manhã não some por causa da noite", () => {
    const itens = c.agendaLiturgicaDoDia(regras, "2026-10-18", "SEDE").map(r => r.titulo);
    expect(itens).toContain("EBD");
    expect(itens).toContain("Culto da Família");
  });

  test("regraAplicaNaData respeita o dia da semana", () => {
    expect(c.regraAplicaNaData(regras[0], "2026-10-21")).toBe(true);  // quarta
    expect(c.regraAplicaNaData(regras[0], "2026-10-22")).toBe(false); // quinta
  });

  test("liturgiaParaSite: formato da coleção antiga, sem 'noite livre', hora no padrão do site", () => {
    const site = c.liturgiaParaSite([
      ...regras,
      regra({ id: 11, dia: "terca", escopo: "SEDE", titulo: "Doutrina Geral", tipo: "CULTO", horaInicio: "19:30", ordem: 1 }),
      regra({ id: 12, dia: "segunda", escopo: "TODAS", titulo: "Descanso", tipo: "DESCANSO", ordem: -1 })
    ]);
    expect(site.some(i => i.title === "Noite livre")).toBe(false);
    expect(site[0]).toEqual({ day: "segunda", title: "Descanso", scope: "todas", occurrence: null, time: null });
    expect(site.find(i => i.title === "Doutrina Geral")).toEqual({ day: "terca", title: "Doutrina Geral", scope: "sede", occurrence: null, time: "19h30" });
    expect(site.find(i => i.title === "Santa Ceia").occurrence).toBe("ultimo");
    expect(site.find(i => i.title === "UHADESPA (última quarta)").occurrence).toBeNull(); // dia de semana: o título já diz "última quarta"
  });

  test("regra inativa não entra", () => {
    expect(c.agendaLiturgicaDoDia([{ ...regras[0], ativo: false }], "2026-10-21", "CONGREGACAO")).toEqual([]);
  });

  test("evento de Nível 1 absorve a grade do dia; Ceia da grade fica 'coberta' pelo evento oficial", () => {
    const itens = c.agendaLiturgicaDoDia(regras, "2026-10-25", "SEDE");
    const ceia = ev({ nivel: 1, tipo: TIPOS.CEIA, dataInicio: "2026-10-25", dataFim: "2026-10-25", titulo: "Santa Ceia", abrangencia: "CAMPO" });
    const marcados = c.absorverLiturgia(itens, [ceia], "SEDE");
    expect(marcados[0].cobertoPor).toEqual({ eventoId: ceia.id, titulo: "Santa Ceia" });
    expect(marcados[0].absorvido).toBe(false);

    const congresso = ev({ nivel: 1, tipo: TIPOS.CONGRESSO, dataInicio: "2026-10-24", dataFim: "2026-10-24", titulo: "Congresso", abrangencia: "CAMPO" });
    const sexta = c.absorverLiturgia([{ id: 4, dia: "sexta", titulo: "Doutrina Local", tipo: "CULTO" }], [congresso], "CONGREGACAO");
    expect(sexta[0].absorvido).toBe(true);
    expect(sexta[0].fechada).toBe(true);
    expect(sexta[0].absorvidoPor.titulo).toBe("Congresso");
    const sede = c.absorverLiturgia([{ id: 4, dia: "sexta", titulo: "Culto", tipo: "CULTO" }], [congresso], "SEDE");
    expect(sede[0].absorvido).toBe(true);
    expect(sede[0].fechada).toBe(false); // a Sede não "fecha": é o ponto de encontro
  });

  test("sem evento de Nível 1 nada é absorvido; evento cancelado não conta", () => {
    const itens = c.agendaLiturgicaDoDia(regras, "2026-10-21", "CONGREGACAO");
    expect(c.absorverLiturgia(itens, [], "CONGREGACAO")[0].absorvido).toBe(false);
    const cancelado = ev({ nivel: 1, tipo: TIPOS.CONGRESSO, status: "CANCELADO" });
    expect(c.absorverLiturgia(itens, [cancelado], "CONGREGACAO")[0].absorvido).toBe(false);
  });

  test("validarRegraLiturgica", () => {
    expect(c.validarRegraLiturgica({ dia: "quarta", escopo: "congregacoes", ocorrencia: "ultimo", titulo: "UHADESPA", horaInicio: "19:30" }).dados)
      .toEqual({ dia: "quarta", escopo: "CONGREGACOES", ocorrencia: "ultimo", titulo: "UHADESPA", horaInicio: "19:30", tipo: "CULTO", departamentoSigla: null });
    expect(c.validarRegraLiturgica({ dia: "domingo", escopo: "SEDE", titulo: "x y z" }).valido).toBe(false);
    expect(c.validarRegraLiturgica({ dia: "quarta", escopo: "SEDE", ocorrencia: "2", titulo: "Culto" }).mensagem).toMatch(/última do mês/);
    expect(c.validarRegraLiturgica({ dia: "domingo_manha", escopo: "TODAS", ocorrencia: "ultimo", titulo: "EBD" }).valido).toBe(false);
    expect(c.validarRegraLiturgica({ dia: "quarta", escopo: "SEDE", titulo: "ab" }).valido).toBe(false);
    expect(c.validarRegraLiturgica({ dia: "quarta", escopo: "SEDE", titulo: "Culto", horaInicio: "25:99" }).valido).toBe(false);
    expect(c.validarRegraLiturgica({ dia: "quarta", escopo: "SEDE", titulo: "Culto", tipo: "FESTA" }).valido).toBe(false);
  });
});

describe("ciclo mensal de governança e Santa Ceia", () => {
  const ciclo = c.gerarCicloAnual(2027);
  const por = (prefixo) => ciclo.filter(e => e.regraChave.startsWith(prefixo.includes(":") ? prefixo : `${prefixo}:`));

  test("48 eventos: Ceia, CLI, NIF e CEI em cada um dos 12 meses, com chave única", () => {
    expect(ciclo).toHaveLength(48);
    expect(new Set(ciclo.map(e => e.regraChave)).size).toBe(48);
    expect(por("CEIA")).toHaveLength(12);
    expect(por("CLI")).toHaveLength(12);
    expect(por("NIF")).toHaveLength(12);
    expect(por("CEI")).toHaveLength(12);
  });

  test("Ceia e CLI no último domingo; maio e outubro são Ceia GERAL", () => {
    expect(por("CEIA:2027-01")[0].dataInicio).toBe("2027-01-31");
    expect(por("CEIA:2027-02")[0].dataInicio).toBe("2027-02-28");
    expect(por("CEIA:2027-05")[0].tipoCodigo).toBe("SANTA_CEIA_GERAL");
    expect(por("CEIA:2027-10")[0].tipoCodigo).toBe("SANTA_CEIA_GERAL");
    expect(por("CEIA:2027-06")[0].tipoCodigo).toBe("SANTA_CEIA_LOCAL");
    expect(ciclo.filter(e => e.tipoCodigo === "SANTA_CEIA_GERAL")).toHaveLength(2);
    const cli = por("CLI:2027-03")[0];
    expect(cli).toMatchObject({ dataInicio: "2027-03-28", horaInicio: "14:00", horaFim: "17:00", local: "Templo Central", orgaoSigla: "CLI" });
    // todo dia de Ceia/CLI é domingo
    for (const e of [...por("CEIA"), ...por("CLI")]) expect(c.diaDaSemana(e.dataInicio)).toBe(0);
  });

  test("Conselho Fiscal no 3º domingo, 14h-17h, na Sede", () => {
    const nif = por("NIF:2027-01")[0];
    expect(nif).toMatchObject({ dataInicio: "2027-01-17", horaInicio: "14:00", horaFim: "17:00", abrangencia: "CONGREGACAO", congregacaoSlug: "sede" });
    for (const e of por("NIF")) expect(c.diaDaSemana(e.dataInicio)).toBe(0);
  });

  test("CEI numa quinta da semana que antecede o último domingo, às 19h30", () => {
    const cei = por("CEI:2027-01")[0];
    expect(cei.dataInicio).toBe("2027-01-28");
    expect(cei.horaInicio).toBe("19:30");
    for (const e of por("CEI")) {
      expect(c.diaDaSemana(e.dataInicio)).toBe(4);
      expect(c.diasEntre(e.dataInicio, c.ultimoDomingo(Number(e.dataInicio.slice(0, 4)), Number(e.dataInicio.slice(5, 7))))).toBe(3);
    }
  });

  test("a Ceia e a CLI do mesmo dia NÃO conflitam entre si (compatíveis por desenho)", () => {
    const ceia = ev({ nivel: 1, tipo: TIPOS.CEIA, abrangencia: "CAMPO", dataInicio: "2027-01-31", dataFim: "2027-01-31", congregacaoId: null });
    const cli = ev({ nivel: 1, tipo: TIPOS.CLI, abrangencia: "CAMPO", dataInicio: "2027-01-31", dataFim: "2027-01-31", congregacaoId: null, horaInicio: "14:00", horaFim: "17:00" });
    expect(c.detectarConflito(ceia, cli, ctx)).toBeNull();
    expect(c.detectarConflito(cli, ceia, ctx)).toBeNull();
  });
});

describe("conflito entre eventos (Art. 154)", () => {
  test("Nível 1 conflita com qualquer evento no mesmo dia, em qualquer lugar e mesmo com horário diferente", () => {
    const congresso = ev({ nivel: 1, tipo: TIPOS.CONGRESSO, abrangencia: "CAMPO", congregacaoId: null, dataInicio: "2027-06-12", dataFim: "2027-06-13" });
    const local = ev({ nivel: 4, congregacaoId: 3, dataInicio: "2027-06-13", dataFim: "2027-06-13", horaInicio: "08:00", horaFim: "09:00" });
    expect(c.detectarConflito(local, congresso, ctx)).not.toBeNull();
    const outroDia = ev({ nivel: 4, congregacaoId: 3, dataInicio: "2027-06-14", dataFim: "2027-06-14" });
    expect(c.detectarConflito(outroDia, congresso, ctx)).toBeNull();
  });

  test("duas congregações de Áreas diferentes podem fazer festa na mesma data (simultaneidade permitida)", () => {
    const a = ev({ congregacaoId: 1 }), b = ev({ congregacaoId: 3 });
    expect(c.detectarConflito(a, b, ctx)).toBeNull();
  });

  test("a mesma congregação no mesmo dia conflita", () => {
    expect(c.detectarConflito(ev({ congregacaoId: 1 }), ev({ congregacaoId: 1 }), ctx)).toMatchObject({ motivo: "DATA" });
  });

  test("evento de Área cruza com as congregações da Área e só com elas", () => {
    const cruzada = ev({ nivel: 3, tipo: TIPOS.CRUZADA_AREA, abrangencia: "AREAS", areaIds: [10], congregacaoId: null });
    expect(c.detectarConflito(cruzada, ev({ congregacaoId: 2 }), ctx)).not.toBeNull();
    expect(c.detectarConflito(cruzada, ev({ congregacaoId: 3 }), ctx)).toBeNull();
    expect(c.detectarConflito(cruzada, ev({ congregacaoId: 5 }), ctx)).toBeNull(); // Sede sem Área
    const outraArea = ev({ nivel: 3, tipo: TIPOS.CRUZADA_AREA, abrangencia: "AREAS", areaIds: [20], congregacaoId: null });
    expect(c.detectarConflito(cruzada, outraArea, ctx)).toBeNull();
    const duasAreas = ev({ nivel: 3, tipo: TIPOS.CRUZADA_AREA, abrangencia: "AREAS", areaIds: [10, 20], congregacaoId: null });
    expect(c.detectarConflito(cruzada, duasAreas, ctx)).not.toBeNull();
  });

  test("evento do campo todo (Nível 2) cruza com tudo", () => {
    const geral = ev({ nivel: 2, tipo: TIPOS.CRUZADA_GERAL, abrangencia: "CAMPO", congregacaoId: null });
    expect(c.detectarConflito(geral, ev({ congregacaoId: 4 }), ctx)).not.toBeNull();
  });

  test("horários que não se tocam convivem no mesmo dia e local; Nível 1 nunca convive", () => {
    const manha = ev({ nivel: 5, tipo: TIPOS.CASAMENTO, horaInicio: "09:00", horaFim: "11:00" });
    const noite = ev({ nivel: 4, tipo: TIPOS.CAMPANHA, horaInicio: "19:30", horaFim: "21:00" });
    expect(c.detectarConflito(manha, noite, ctx)).toBeNull();
    const tarde = ev({ nivel: 4, tipo: TIPOS.CAMPANHA, horaInicio: "10:00", horaFim: "12:00" });
    expect(c.detectarConflito(manha, tarde, ctx)).not.toBeNull();
    const semHora = ev({ nivel: 4, tipo: TIPOS.CAMPANHA });
    expect(c.detectarConflito(manha, semHora, ctx)).not.toBeNull(); // sem horário num dos lados: dia inteiro
    const n1 = ev({ nivel: 1, tipo: TIPOS.CEIA, abrangencia: "CAMPO", congregacaoId: null, horaInicio: "19:00", horaFim: "21:00" });
    expect(c.detectarConflito(manha, n1, ctx)).not.toBeNull();
  });

  test("sem horário de término assume 2 horas", () => {
    const a = ev({ nivel: 4, tipo: TIPOS.CAMPANHA, horaInicio: "10:00" });
    const b = ev({ nivel: 5, tipo: TIPOS.CASAMENTO, horaInicio: "11:30" });
    expect(c.detectarConflito(a, b, ctx)).not.toBeNull();
    const d = ev({ nivel: 5, tipo: TIPOS.CASAMENTO, horaInicio: "12:00" });
    expect(c.detectarConflito(a, d, ctx)).toBeNull();
  });

  test("evento de vários dias conflita em qualquer dia do intervalo", () => {
    const longo = ev({ dataInicio: "2027-03-10", dataFim: "2027-03-14" });
    expect(c.detectarConflito(longo, ev({ dataInicio: "2027-03-14", dataFim: "2027-03-14" }), ctx)).not.toBeNull();
    expect(c.detectarConflito(longo, ev({ dataInicio: "2027-03-15", dataFim: "2027-03-15" }), ctx)).toBeNull();
  });

  test("TRAVA DE ÁREA: duas festividades de Nível 4 na mesma Área no mesmo fim de semana (sábado x domingo)", () => {
    const sabado = ev({ congregacaoId: 1, dataInicio: "2027-03-13", dataFim: "2027-03-13" });
    const domingo = ev({ congregacaoId: 2, dataInicio: "2027-03-14", dataFim: "2027-03-14" });
    expect(c.detectarConflito(sabado, domingo, ctx)).toMatchObject({ motivo: "TRAVA_AREA" });
    const outraArea = ev({ congregacaoId: 3, dataInicio: "2027-03-14", dataFim: "2027-03-14" });
    expect(c.detectarConflito(sabado, outraArea, ctx)).toBeNull();
    const outroFim = ev({ congregacaoId: 2, dataInicio: "2027-03-20", dataFim: "2027-03-20" });
    expect(c.detectarConflito(sabado, outroFim, ctx)).toBeNull();
    const meioDeSemana = ev({ congregacaoId: 2, dataInicio: "2027-03-17", dataFim: "2027-03-17" });
    expect(c.detectarConflito(sabado, meioDeSemana, ctx)).toBeNull();
  });

  test("a trava só vale para festividade: campanha de oração (Nível 4) na mesma Área convive", () => {
    const festa = ev({ congregacaoId: 1, dataInicio: "2027-03-13", dataFim: "2027-03-13" });
    const campanha = ev({ congregacaoId: 2, tipo: TIPOS.CAMPANHA, dataInicio: "2027-03-14", dataFim: "2027-03-14" });
    expect(c.detectarConflito(festa, campanha, ctx)).toBeNull();
  });

  test("prevalência: nível menor vence; no mesmo nível, a proposta mais antiga (Direito Adquirido Temporal)", () => {
    const n2 = ev({ nivel: 2, propostaEm: "2027-02-01T00:00:00Z" });
    const n4 = ev({ nivel: 4, propostaEm: "2027-01-01T00:00:00Z" });
    expect(c.compararPrevalencia(n2, n4)).toBeLessThan(0);
    const antigo = ev({ nivel: 4, propostaEm: "2027-01-02T08:00:00.000Z" });
    const novo = ev({ nivel: 4, propostaEm: "2027-01-02T08:00:00.001Z" });
    expect(c.compararPrevalencia(antigo, novo)).toBeLessThan(0);
    expect(c.compararPrevalencia(novo, antigo)).toBeGreaterThan(0);
    const igualA = ev({ id: 7, propostaEm: "2027-01-02T08:00:00Z" }), igualB = ev({ id: 9, propostaEm: "2027-01-02T08:00:00Z" });
    expect(c.compararPrevalencia(igualA, igualB)).toBeLessThan(0);
  });
});

describe("avaliar uma proposta contra a pauta", () => {
  test("data livre -> LIVRE", () => {
    const r = c.avaliarProposta(ev({ status: "PROPOSTO", congregacaoId: 3 }), [ev({ congregacaoId: 1 })], ctx);
    expect(r.veredito).toBe("LIVRE");
  });

  test("choque com evento HOMOLOGADO -> recusada por DIREITO_ADQUIRIDO", () => {
    const r = c.avaliarProposta(ev({ status: "PROPOSTO", congregacaoId: 1 }), [ev({ congregacaoId: 1, titulo: "Aniversário da Gênesis" })], ctx);
    expect(r.veredito).toBe("RECUSADA");
    expect(r.motivo).toBe("DIREITO_ADQUIRIDO");
    expect(r.detalhe).toMatch(/Aniversário da Gênesis/);
    expect(r.prevalecidoPorId).toBeDefined();
  });

  test("proposta TARDIA que não cabe -> ESGOTAMENTO_PAUTA, sem encaixe", () => {
    const r = c.avaliarProposta(ev({ status: "PROPOSTO", congregacaoId: 1, tardia: true }), [ev({ congregacaoId: 1 })], ctx, { tardia: true });
    expect(r.motivo).toBe("ESGOTAMENTO_PAUTA");
    expect(r.detalhe).toMatch(/Esgotamento de Pauta/);
    expect(r.detalhe).toMatch(/sem direito a recurso/);
  });

  test("a trava de Área aparece como motivo próprio (no prazo)", () => {
    const r = c.avaliarProposta(ev({ status: "PROPOSTO", congregacaoId: 2, dataInicio: "2027-03-14", dataFim: "2027-03-14" }),
      [ev({ congregacaoId: 1, dataInicio: "2027-03-13", dataFim: "2027-03-13", status: "DEFERIDO" })], ctx);
    expect(r.veredito).toBe("RECUSADA");
    expect(r.motivo).toBe("TRAVA_AREA");
  });

  test("evento de status não ativo (indeferido, cancelado, absorvido) não disputa data", () => {
    for (const status of ["INDEFERIDO", "CANCELADO", "ABSORVIDO"]) {
      const r = c.avaliarProposta(ev({ status: "PROPOSTO", congregacaoId: 1 }), [ev({ congregacaoId: 1, status })], ctx);
      expect(r.veredito).toBe("LIVRE");
    }
  });

  test("Nível 1 ABSORVE os de nível inferior, inclusive homologados (convocação estratégico-institucional)", () => {
    const vitima = ev({ nivel: 4, congregacaoId: 1, dataInicio: "2027-06-12", dataFim: "2027-06-12", status: "HOMOLOGADO" });
    const congresso = ev({ nivel: 1, tipo: TIPOS.CONGRESSO, abrangencia: "CAMPO", congregacaoId: null, dataInicio: "2027-06-12", dataFim: "2027-06-12", status: "PROPOSTO" });
    const r = c.avaliarProposta(congresso, [vitima], ctx);
    expect(r.veredito).toBe("ABSORVE");
    expect(r.absorvidos.map(e => e.id)).toEqual([vitima.id]);
  });

  test("Nível 1 contra outro Nível 1 incompatível: o que já estava prevalece", () => {
    const existente = ev({ nivel: 1, tipo: TIPOS.BATISMO || TIPOS.CONGRESSO, abrangencia: "CAMPO", congregacaoId: null, dataInicio: "2027-06-12", dataFim: "2027-06-12" });
    const novo = ev({ nivel: 1, tipo: TIPOS.CONGRESSO, abrangencia: "CAMPO", congregacaoId: null, dataInicio: "2027-06-12", dataFim: "2027-06-12", status: "PROPOSTO" });
    expect(c.avaliarProposta(novo, [existente], ctx).veredito).toBe("RECUSADA");
  });

  test("Nível 1 que também esbarra em outro Nível 1 não absorve nada (recusa)", () => {
    const n1 = ev({ nivel: 1, tipo: TIPOS.CONGRESSO, abrangencia: "CAMPO", congregacaoId: null, dataInicio: "2027-06-12", dataFim: "2027-06-12" });
    const n4 = ev({ nivel: 4, congregacaoId: 1, dataInicio: "2027-06-12", dataFim: "2027-06-12" });
    const novo = ev({ nivel: 1, tipo: TIPOS.CONGRESSO, abrangencia: "CAMPO", congregacaoId: null, dataInicio: "2027-06-12", dataFim: "2027-06-12", status: "PROPOSTO" });
    expect(c.avaliarProposta(novo, [n1, n4], ctx).veredito).toBe("RECUSADA");
  });

  test("a própria proposta não conflita consigo mesma", () => {
    const p = ev({ status: "PROPOSTO", congregacaoId: 1 });
    expect(c.avaliarProposta(p, [p], ctx).veredito).toBe("LIVRE");
  });

  test("sugerirDatasLivres: mesmo dia da semana, da mais próxima à mais distante, só livres e futuras", () => {
    const base = ev({ status: "PROPOSTO", congregacaoId: 1, dataInicio: "2027-03-13", dataFim: "2027-03-13" });
    const ocupadas = [
      ev({ congregacaoId: 1, dataInicio: "2027-03-13", dataFim: "2027-03-13" }),
      ev({ congregacaoId: 1, dataInicio: "2027-03-20", dataFim: "2027-03-20" })
    ];
    const s = c.sugerirDatasLivres(base, ocupadas, ctx, { hoje: "2027-03-01", maximo: 3 });
    expect(s.length).toBe(3);
    for (const x of s) expect(c.diaDaSemana(x.dataInicio)).toBe(6);
    expect(s.map(x => x.dataInicio)).not.toContain("2027-03-13");
    expect(s.map(x => x.dataInicio)).not.toContain("2027-03-20");
    expect(s[0].dataInicio).toBe("2027-03-06"); // mais próxima livre (a de +7 e +14 estão ocupadas ou vêm depois)
    const passado = c.sugerirDatasLivres(base, [], ctx, { hoje: "2027-03-12", maximo: 5 });
    for (const x of passado) expect(x.dataInicio >= "2027-03-12").toBe(true);
  });

  test("sugerirDatasLivres mantém a duração do evento", () => {
    const base = ev({ status: "PROPOSTO", congregacaoId: 1, dataInicio: "2027-03-12", dataFim: "2027-03-14" });
    const s = c.sugerirDatasLivres(base, [], ctx, { hoje: "2027-03-01", maximo: 1 });
    expect(c.diasEntre(s[0].dataInicio, s[0].dataFim)).toBe(2);
  });
});

describe("consolidação da Secretaria (Art. 154 §2º, II)", () => {
  const dec = (decisoes, id) => decisoes.find(d => d.eventoId === id);

  test("Geral e Congregação pedem a mesma data em janeiro: a data é do Geral (nível menor), mesmo chegando depois", () => {
    const local = ev({ nivel: 4, congregacaoId: 1, status: "PROPOSTO", propostaEm: "2027-01-02T08:00:00Z", dataInicio: "2027-04-17", dataFim: "2027-04-17" });
    const geral = ev({ nivel: 2, tipo: TIPOS.CRUZADA_GERAL, abrangencia: "CAMPO", congregacaoId: null, status: "PROPOSTO", propostaEm: "2027-01-10T08:00:00Z", dataInicio: "2027-04-17", dataFim: "2027-04-17" });
    const r = c.consolidar([local, geral], [], ctx);
    expect(dec(r, geral.id).status).toBe("DEFERIDO");
    expect(dec(r, local.id)).toMatchObject({ status: "INDEFERIDO", motivo: "CONFLITO_HIERARQUIA", prevalecidoPorId: geral.id });
    expect(dec(r, local.id).detalhe).toMatch(/Escolha outra data/);
  });

  test("mesmo nível: vence a ordem de chegada (carimbo), não a ordem da lista", () => {
    const tarde = ev({ id: 1, congregacaoId: 1, status: "PROPOSTO", propostaEm: "2027-01-12T09:00:00.000Z" });
    const cedo = ev({ id: 2, congregacaoId: 1, status: "PROPOSTO", propostaEm: "2027-01-03T09:00:00.000Z" });
    const r = c.consolidar([tarde, cedo], [], ctx);
    expect(dec(r, 2).status).toBe("DEFERIDO");
    expect(dec(r, 1)).toMatchObject({ status: "INDEFERIDO", prevalecidoPorId: 2 });
  });

  test("evento já HOMOLOGADO (fixo) tem a data garantida contra qualquer proposta", () => {
    const fixo = ev({ id: 50, nivel: 4, congregacaoId: 1, status: "HOMOLOGADO" });
    const geral = ev({ nivel: 2, tipo: TIPOS.CRUZADA_GERAL, abrangencia: "CAMPO", congregacaoId: null, status: "PROPOSTO" });
    const r = c.consolidar([geral], [fixo], ctx);
    expect(r[0]).toMatchObject({ status: "INDEFERIDO", motivo: "DIREITO_ADQUIRIDO", prevalecidoPorId: 50 });
  });

  test("simultaneidade em Áreas distintas: as duas festas passam", () => {
    const a = ev({ congregacaoId: 1, status: "PROPOSTO" }), b = ev({ congregacaoId: 3, status: "PROPOSTO" });
    const r = c.consolidar([a, b], [], ctx);
    expect(r.every(d => d.status === "DEFERIDO")).toBe(true);
  });

  test("trava de Área na consolidação: a segunda festa do fim de semana cai", () => {
    const a = ev({ congregacaoId: 1, status: "PROPOSTO", propostaEm: "2027-01-02T00:00:00Z", dataInicio: "2027-03-13", dataFim: "2027-03-13" });
    const b = ev({ congregacaoId: 2, status: "PROPOSTO", propostaEm: "2027-01-03T00:00:00Z", dataInicio: "2027-03-14", dataFim: "2027-03-14" });
    const r = c.consolidar([b, a], [], ctx);
    expect(dec(r, a.id).status).toBe("DEFERIDO");
    expect(dec(r, b.id)).toMatchObject({ status: "INDEFERIDO", motivo: "TRAVA_AREA" });
  });

  test("evento de regra (reunião do NIF) perde para um Nível 1 proposto no mesmo dia", () => {
    const nif = ev({ nivel: 2, tipo: { codigo: "REUNIAO_ORGAO_MENSAL", festividade: false, compativeis: [], fechaCongregacoes: false }, congregacaoId: 5, status: "DEFERIDO", origem: "REGRA", dataInicio: "2027-01-17", dataFim: "2027-01-17", horaInicio: "14:00", horaFim: "17:00" });
    const congresso = ev({ nivel: 1, tipo: TIPOS.CONGRESSO, abrangencia: "CAMPO", congregacaoId: null, status: "PROPOSTO", dataInicio: "2027-01-17", dataFim: "2027-01-17" });
    const r = c.consolidar([nif, congresso], [], ctx);
    expect(dec(r, congresso.id).status).toBe("DEFERIDO");
    expect(dec(r, nif.id)).toMatchObject({ status: "INDEFERIDO", prevalecidoPorId: congresso.id });
  });

  test("proposta tardia só vence se não houver choque com as pontuais; vem depois delas na fila", () => {
    const pontual = ev({ id: 1, nivel: 4, congregacaoId: 1, status: "PROPOSTO", tardia: false, propostaEm: "2027-01-14T00:00:00Z" });
    const tardiaDeNivelMaior = ev({ id: 2, nivel: 3, tipo: TIPOS.CRUZADA_AREA, abrangencia: "AREAS", areaIds: [10], congregacaoId: null, status: "DEFERIDO", tardia: true, propostaEm: "2027-02-01T00:00:00Z" });
    const r = c.consolidar([tardiaDeNivelMaior, pontual], [], ctx);
    expect(dec(r, 1).status).toBe("DEFERIDO");
    expect(dec(r, 2).status).toBe("INDEFERIDO");
  });

  test("é idempotente: consolidar o resultado já deferido de novo dá o mesmo", () => {
    const a = ev({ congregacaoId: 1, status: "PROPOSTO", propostaEm: "2027-01-02T00:00:00Z" });
    const b = ev({ congregacaoId: 1, status: "PROPOSTO", propostaEm: "2027-01-03T00:00:00Z" });
    const r1 = c.consolidar([a, b], [], ctx);
    const aplicados = [a, b].map(e => ({ ...e, status: dec(r1, e.id).status }));
    const r2 = c.consolidar(aplicados.filter(e => e.status !== "INDEFERIDO" || true).map(e => ({ ...e, status: e.status === "INDEFERIDO" ? "PROPOSTO" : e.status })), [], ctx);
    expect(r2.map(d => d.status).sort()).toEqual(r1.map(d => d.status).sort());
  });
});

describe("validação da proposta", () => {
  const tipoLocal = { tipoId: 3, codigo: "ANIVERSARIO_CONGREGACAO", abrangenciasPermitidas: "CONGREGACAO", publicoNoSite: true, ativo: true };
  const tipoArea = { tipoId: 4, codigo: "CRUZADA_AREA", abrangenciasPermitidas: "AREAS", publicoNoSite: true, ativo: true };
  const tipoGeral = { tipoId: 5, codigo: "CRUZADA_GERAL", abrangenciasPermitidas: "CAMPO,AREAS", publicoNoSite: true, ativo: true };
  const cliExtra = { tipoId: 6, codigo: "REUNIAO_CLI_EXTRAORDINARIA", abrangenciasPermitidas: "CAMPO", antecedenciaMinimaHoras: 48, ativo: true };
  const opcoes = { hoje: "2027-01-10", agoraMs: Date.UTC(2027, 0, 10, 15, 0) }; // 12h00 em Brasília

  test("proposta mínima válida; abrangência vem do tipo", () => {
    const r = c.validarProposta({ titulo: "Aniversário da Gênesis", dataInicio: "2027-03-13", congregacaoId: 7 }, { tipo: tipoLocal, ...opcoes });
    expect(r.valido).toBe(true);
    expect(r.dados).toMatchObject({ tipoId: 3, abrangencia: "CONGREGACAO", congregacaoId: 7, dataFim: "2027-03-13", publicoNoSite: true, areaIds: [] });
  });

  test("tipo inválido, título curto, datas ruins", () => {
    expect(c.validarProposta({ titulo: "ok ok", dataInicio: "2027-03-13" }, { tipo: null, ...opcoes }).valido).toBe(false);
    expect(c.validarProposta({ titulo: "ab", dataInicio: "2027-03-13", congregacaoId: 1 }, { tipo: tipoLocal, ...opcoes }).valido).toBe(false);
    expect(c.validarProposta({ titulo: "Evento", dataInicio: "13/03/2027", congregacaoId: 1 }, { tipo: tipoLocal, ...opcoes }).valido).toBe(false);
    expect(c.validarProposta({ titulo: "Evento", dataInicio: "2027-03-13", dataFim: "2027-03-12", congregacaoId: 1 }, { tipo: tipoLocal, ...opcoes }).mensagem).toMatch(/anterior/);
    expect(c.validarProposta({ titulo: "Evento", dataInicio: "2027-01-09", congregacaoId: 1 }, { tipo: tipoLocal, ...opcoes }).mensagem).toMatch(/já passou/);
    expect(c.validarProposta({ titulo: "Evento", dataInicio: "2027-03-01", dataFim: "2027-04-15", congregacaoId: 1 }, { tipo: tipoLocal, ...opcoes }).mensagem).toMatch(/no máximo 30 dias/);
  });

  test("abrangência: congregação exige congregacaoId; Área exige areaIds; o tipo restringe", () => {
    expect(c.validarProposta({ titulo: "Evento", dataInicio: "2027-03-13" }, { tipo: tipoLocal, ...opcoes }).mensagem).toMatch(/congregação/);
    expect(c.validarProposta({ titulo: "Evento", dataInicio: "2027-03-13", abrangencia: "CAMPO" }, { tipo: tipoLocal, ...opcoes }).mensagem).toMatch(/só pode ser/);
    expect(c.validarProposta({ titulo: "Cruzada", dataInicio: "2027-03-13" }, { tipo: tipoArea, ...opcoes }).mensagem).toMatch(/Área/);
    const ok = c.validarProposta({ titulo: "Cruzada", dataInicio: "2027-03-13", areaIds: ["10", 20, 10] }, { tipo: tipoArea, ...opcoes });
    expect(ok.dados.areaIds).toEqual([10, 20]);
    expect(c.validarProposta({ titulo: "Cruzada", dataInicio: "2027-03-13", areaIds: [0] }, { tipo: tipoArea, ...opcoes }).valido).toBe(false);
    const geral = c.validarProposta({ titulo: "Cruzada geral", dataInicio: "2027-03-13" }, { tipo: tipoGeral, ...opcoes });
    expect(geral.dados.abrangencia).toBe("CAMPO");
    expect(c.validarProposta({ titulo: "Cruzada geral", dataInicio: "2027-03-13", abrangencia: "AREAS", areaIds: [10] }, { tipo: tipoGeral, ...opcoes }).dados.abrangencia).toBe("AREAS");
  });

  test("horários: formato, término depois do início, término exige início", () => {
    const base = { titulo: "Evento", dataInicio: "2027-03-13", congregacaoId: 1 };
    expect(c.validarProposta({ ...base, horaInicio: "9:00", horaFim: "11:30" }, { tipo: tipoLocal, ...opcoes }).dados).toMatchObject({ horaInicio: "09:00", horaFim: "11:30" });
    expect(c.validarProposta({ ...base, horaInicio: "25:00" }, { tipo: tipoLocal, ...opcoes }).valido).toBe(false);
    expect(c.validarProposta({ ...base, horaInicio: "10:00", horaFim: "09:00" }, { tipo: tipoLocal, ...opcoes }).valido).toBe(false);
    expect(c.validarProposta({ ...base, horaFim: "09:00" }, { tipo: tipoLocal, ...opcoes }).mensagem).toMatch(/hora de início/);
  });

  test("CLI EXTRAORDINÁRIA: antecedência mínima de 48 horas na convocação (Art. 147 §2º)", () => {
    const base = { titulo: "CLI extraordinária", horaInicio: "19:00" };
    // agora = 10/01 12h (Brasília); 48 h depois = 12/01 12h
    expect(c.validarProposta({ ...base, dataInicio: "2027-01-11" }, { tipo: cliExtra, ...opcoes }).mensagem).toMatch(/antecedência mínima de 48 horas/);
    expect(c.validarProposta({ ...base, dataInicio: "2027-01-12", horaInicio: "11:59" }, { tipo: cliExtra, ...opcoes }).valido).toBe(false);
    expect(c.validarProposta({ ...base, dataInicio: "2027-01-12", horaInicio: "12:00" }, { tipo: cliExtra, ...opcoes }).valido).toBe(true);
    expect(c.validarProposta({ ...base, dataInicio: "2027-01-13" }, { tipo: cliExtra, ...opcoes }).valido).toBe(true);
    expect(c.validarProposta({ titulo: "CLI extraordinária", dataInicio: "2027-01-20" }, { tipo: cliExtra, ...opcoes }).mensagem).toMatch(/hora de início/);
  });

  test("identificador no site: minúsculas, números e hífen", () => {
    const base = { titulo: "Evento", dataInicio: "2027-03-13", congregacaoId: 1 };
    expect(c.validarProposta({ ...base, slugSite: "Festa Grande" }, { tipo: tipoLocal, ...opcoes }).valido).toBe(false);
    expect(c.validarProposta({ ...base, slugSite: "Festa-Grande-2027" }, { tipo: tipoLocal, ...opcoes }).dados.slugSite).toBe("festa-grande-2027");
  });

  test("publicoNoSite: o padrão é o do tipo, mas cada evento pode divergir", () => {
    const base = { titulo: "Evento", dataInicio: "2027-03-13", congregacaoId: 1 };
    expect(c.validarProposta({ ...base }, { tipo: tipoLocal, ...opcoes }).dados.publicoNoSite).toBe(true);
    expect(c.validarProposta({ ...base, publicoNoSite: false }, { tipo: tipoLocal, ...opcoes }).dados.publicoNoSite).toBe(false);
  });

  test("propostaEhTardia: depois de 15/jan; Nível 1 e ciclo gerado nunca são tardios", () => {
    const prazo = c.prazoPropostasDoAno(2027);
    expect(prazo).toBe("2027-01-15");
    expect(c.propostaEhTardia({ nivel: 4, origem: "PROPOSTA", hoje: "2027-01-15", prazoPropostas: prazo })).toBe(false);
    expect(c.propostaEhTardia({ nivel: 4, origem: "PROPOSTA", hoje: "2027-01-16", prazoPropostas: prazo })).toBe(true);
    expect(c.propostaEhTardia({ nivel: 1, origem: "PROPOSTA", hoje: "2027-06-01", prazoPropostas: prazo })).toBe(false);
    expect(c.propostaEhTardia({ nivel: 2, origem: "REGRA", hoje: "2027-06-01", prazoPropostas: prazo })).toBe(false);
  });

  test("horasAteOEvento usa o horário de Brasília (UTC-3)", () => {
    // 10/01/2027 12:00 em Brasília = 15:00 UTC
    const agora = Date.UTC(2027, 0, 10, 15, 0);
    expect(c.horasAteOEvento("2027-01-10", "13:00", agora)).toBe(1);
    expect(c.horasAteOEvento("2027-01-12", "12:00", agora)).toBe(48);
    expect(c.horasAteOEvento("2027-01-10", null, agora)).toBeNull();
  });
});
