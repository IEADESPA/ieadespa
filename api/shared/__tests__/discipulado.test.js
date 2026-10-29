// v8.5 — a regra pura da trilha de discipulado (shared/discipulado.js): a caminhada, o funil, quando o próximo passo vira acompanhamento e o catálogo.
const d = require("../discipulado");
const { temCiclo } = require("../discipuladoDb");

const ETAPAS = [
  { etapaId: 1, chave: "CONVERSAO", nome: "Conversão", ordem: 1, fonte: "MARCO", geraAcompanhamento: false, preRequisitos: [] },
  { etapaId: 2, chave: "CURSO", nome: "Curso de Discipulado", ordem: 2, fonte: "MARCO", geraAcompanhamento: true, preRequisitos: [1] },
  { etapaId: 3, chave: "BATISMO", nome: "Batismo nas águas", ordem: 3, fonte: "BATISMO_AGUAS", geraAcompanhamento: true, preRequisitos: [2] },
  { etapaId: 4, chave: "SERVICO", nome: "Primeiro serviço", ordem: 4, fonte: "SERVICO_VOLUNTARIO", geraAcompanhamento: true, preRequisitos: [] }
];
const fatos = (obj) => new Map(Object.entries(obj).map(([k, v]) => [Number(k), { data: v }]));

describe("a caminhada", () => {
  test("em ordem, com o próximo passo, o último passo e quem começou", () => {
    const c = d.caminhada(ETAPAS, fatos({ 1: "2026-01-10", 2: "2026-03-01" }));
    expect(c.etapas.map((e) => e.feita)).toEqual([true, true, false, false]);
    expect(c.proximo).toMatchObject({ etapaId: 3, nome: "Batismo nas águas", geraAcompanhamento: true });
    expect(c.ultimoPasso).toBe("2026-03-01");
    expect(c.iniciada).toBe(true);
    expect(c.concluida).toBe(false);
  });
  test("o batismo de urgência antes do curso (Art. 70 §5º): fora de ordem, e o curso é o próximo passo", () => {
    const c = d.caminhada(ETAPAS, fatos({ 1: "2026-01-10", 3: "2026-02-01" }));
    const batismo = c.etapas.find((e) => e.etapaId === 3);
    expect(batismo.foraDeOrdem).toBe(true);
    expect(batismo.preRequisitosPendentes).toEqual(["Curso de Discipulado"]);
    expect(c.proximo.etapaId).toBe(2);
  });
  test("ninguém começou: sem passo; tudo feito: concluída e sem próximo", () => {
    expect(d.caminhada(ETAPAS, new Map())).toMatchObject({ iniciada: false, ultimoPasso: null });
    expect(d.caminhada(ETAPAS, fatos({ 1: "2020-01-01", 2: "2020-02-01", 3: "2020-03-01", 4: "2020-04-01" }))).toMatchObject({ concluida: true, proximo: null });
  });
  test("etapa feita sem data conhecida conta como feita (a data fica vazia)", () => {
    const c = d.caminhada(ETAPAS, fatos({ 1: null }));
    expect(c.etapas[0]).toMatchObject({ feita: true, data: null });
    expect(c.ultimoPasso).toBe(null);
  });
});

describe("o acompanhamento do próximo passo", () => {
  const hoje = "2026-10-29";
  test("passo recente e próximo que pede acompanhamento: abre", () => {
    expect(d.deveAcompanhar(d.caminhada(ETAPAS, fatos({ 1: "2026-10-01", 2: "2026-10-20" })), hoje)).toBe(true);
  });
  test("passo antigo (fora da janela de 180 dias): não inunda a fila com o membro antigo", () => {
    expect(d.deveAcompanhar(d.caminhada(ETAPAS, fatos({ 1: "2010-01-01", 2: "2010-02-01", 3: "2010-03-01" })), hoje)).toBe(false);
  });
  test("o próximo passo que não pede acompanhamento, a trilha concluída e quem não começou: não abre", () => {
    const sem = ETAPAS.map((e) => (e.etapaId === 2 ? { ...e, geraAcompanhamento: false } : e));
    expect(d.deveAcompanhar(d.caminhada(sem, fatos({ 1: "2026-10-20" })), hoje)).toBe(false);
    expect(d.deveAcompanhar(d.caminhada(ETAPAS, fatos({ 1: "2026-10-01", 2: "2026-10-02", 3: "2026-10-03", 4: "2026-10-04" })), hoje)).toBe(false);
    expect(d.deveAcompanhar(d.caminhada(ETAPAS, new Map()), hoje)).toBe(false);
  });
  test("o texto diz o próximo passo e o último", () => {
    const t = d.textoDoAcompanhamento(d.caminhada(ETAPAS, fatos({ 1: "2026-10-01", 2: "2026-10-20" })));
    expect(t.motivo).toBe("Próximo passo: Batismo nas águas.");
    expect(t.resumo).toBe("Último passo: Curso de Discipulado em 20/10/2026.");
  });
});

describe("o funil", () => {
  test("quantos fizeram cada etapa, quantos têm aquela etapa como próximo passo e quantos estão parados antes dela", () => {
    const pessoas = [
      { membroId: 1, caminhada: d.caminhada(ETAPAS, fatos({ 1: "2026-10-01" })) },                                     // próximo: curso (andando)
      { membroId: 2, caminhada: d.caminhada(ETAPAS, fatos({ 1: "2026-01-01" })) },                                     // próximo: curso (parado)
      { membroId: 3, caminhada: d.caminhada(ETAPAS, fatos({ 1: "2026-01-01", 2: "2026-02-01", 3: "2026-03-01" })) },   // próximo: serviço (parado)
      { membroId: 4, caminhada: d.caminhada(ETAPAS, fatos({ 1: "2025-01-01", 2: "2025-02-01", 3: "2025-03-01", 4: "2025-04-01" })) },
      { membroId: 5, caminhada: d.caminhada(ETAPAS, new Map()) }                                                          // não começou: fora
    ];
    const f = d.funil(pessoas, ETAPAS, { hojeIso: "2026-10-29", diasParado: 90 });
    expect(f.iniciadas).toBe(4);
    expect(f.concluiram).toBe(1);
    expect(f.etapas.map((e) => [e.nome, e.fizeram, e.proximoPasso, e.parados])).toEqual([
      ["Conversão", 4, 0, 0], ["Curso de Discipulado", 2, 2, 1], ["Batismo nas águas", 2, 0, 0], ["Primeiro serviço", 1, 1, 1]
    ]);
  });
  test("estaParado segue os dias pedidos", () => {
    const c = d.caminhada(ETAPAS, fatos({ 1: "2026-09-01" }));
    expect(d.estaParado(c, "2026-10-29", 30)).toBe(true);
    expect(d.estaParado(c, "2026-10-29", 90)).toBe(false);
  });
});

describe("o catálogo", () => {
  test("tipo de marco: código em maiúsculas, nome, sim/não", () => {
    expect(d.validarTipoMarco({ codigo: "classe_novos", nome: "Classe de novos" })).toMatchObject({ valido: true, tipo: { codigo: "CLASSE_NOVOS", unico: false, ativo: true } });
    expect(d.validarTipoMarco({ codigo: "x", nome: "Classe" }).valido).toBe(false);
    expect(d.validarTipoMarco({ codigo: "CLASSE", nome: "ab" }).valido).toBe(false);
    expect(d.validarTipoMarco({ codigo: "CLASSE", nome: "Classe", unico: "sim" }).valido).toBe(false);
  });
  test("etapa: a fonte decide o que é obrigatório; ninguém é pré-requisito de si", () => {
    expect(d.validarEtapa({ chave: "CURSO", nome: "Curso", ordem: 2, fonte: "MARCO", tipoMarco: "CURSO_DISCIPULADO" }).valido).toBe(true);
    expect(d.validarEtapa({ chave: "CURSO", nome: "Curso", ordem: 2, fonte: "MARCO" }).valido).toBe(false);
    expect(d.validarEtapa({ chave: "CURSO", nome: "Curso", ordem: 2, fonte: "TRILHA" }).valido).toBe(false);
    expect(d.validarEtapa({ chave: "CURSO", nome: "Curso", ordem: 2, fonte: "TRILHA", trilhaId: 7 }).etapa.trilhaId).toBe(7);
    expect(d.validarEtapa({ chave: "CURSO", nome: "Curso", ordem: 100, fonte: "BATISMO_AGUAS" }).valido).toBe(false);
    expect(d.validarEtapa({ chave: "CURSO", nome: "Curso", ordem: 1, fonte: "INVENTADA" }).valido).toBe(false);
    expect(d.validarEtapa({ etapaId: 3, chave: "CURSO", nome: "Curso", ordem: 1, fonte: "BATISMO_AGUAS", preRequisitos: [3] }).valido).toBe(false);
    expect(d.validarEtapa({ chave: "CURSO", nome: "Curso", ordem: 1, fonte: "BATISMO_AGUAS", preRequisitos: "1" }).valido).toBe(false);
  });
  test("pré-requisitos em círculo são recusados", () => {
    expect(temCiclo([{ EtapaId: 2, PreRequisitoId: 1 }, { EtapaId: 3, PreRequisitoId: 2 }])).toBe(false);
    expect(temCiclo([{ EtapaId: 2, PreRequisitoId: 1 }, { EtapaId: 1, PreRequisitoId: 3 }, { EtapaId: 3, PreRequisitoId: 2 }])).toBe(true);
  });
});

describe("o cuidado pastoral conhece o tipo novo", () => {
  const cp = require("../cuidadoPastoral");
  test("o 'Próximo passo do discipulado' é um aberto por pessoa, nunca aberto à mão, e tem prazo próprio", () => {
    expect(cp.TIPOS.DISCIPULADO).toMatchObject({ sigla: "CUIDADO_PRAZO_DISCIPULADO_DIAS", padrao: 30 });
    expect(cp.TIPOS_UM_ABERTO).toContain("DISCIPULADO");
    expect(cp.TIPOS_ABERTURA_MANUAL).not.toContain("DISCIPULADO");
    expect(cp.validarAbertura({ tipo: "DISCIPULADO", congregacaoId: 1, membroId: 2 }).valido).toBe(false);
    expect(cp.ORIGENS.DISCIPULADO).toBeTruthy();
    expect(cp.DESFECHO_PASSO_DADO.PASSO_DADO).toBeTruthy();
    expect(cp.DESFECHOS_CONCLUSAO.PASSO_DADO).toBeUndefined();   // ninguém conclui à mão com "passo dado": só o sistema
  });
});
