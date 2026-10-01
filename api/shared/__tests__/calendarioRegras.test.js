// Testes da v7.2 (Calendário) — permissão por nível, escopo de quem propõe e o catálogo
// de tipos da CLI. Lógica pura de shared/calendario.js.
const c = require("../calendario");

describe("permissão e escopo de quem propõe", () => {
  const congs = new Map([
    [1, { nome: "Gênesis", areaId: 10 }], [2, { nome: "Bom Pastor", areaId: 10 }],
    [3, { nome: "Águas Vivas", areaId: 20 }], [5, { nome: "Sede", areaId: null }]
  ]);
  const ctxEscopo = { congregacoes: congs, congregacoesDaArea: (a) => [...congs].filter(([, x]) => x.areaId === a).map(([id]) => id) };

  test("Nível 1 é da Secretaria/CLI; os demais, de quem tem a permissão de proposta", () => {
    expect(c.podeProporNivel(["calendario_proposta"], 1)).toBe(false);
    expect(c.podeProporNivel(["calendario_proposta"], 4)).toBe(true);
    expect(c.podeProporNivel(["calendario_secretaria"], 1)).toBe(true);
    expect(c.podeProporNivel(["calendario_homologacao"], 1)).toBe(true);
    expect(c.podeProporNivel(["calendario_homologacao"], 5)).toBe(true);
    expect(c.podeProporNivel(["pessoas", "reunioes"], 4)).toBe(false);
    expect(c.podeProporNivel(undefined, 4)).toBe(false);
  });

  test("escopo global propõe qualquer coisa", () => {
    expect(c.escopoCobreEvento("TODAS", { abrangencia: "CAMPO" }, ctxEscopo).ok).toBe(true);
    expect(c.escopoCobreEvento(null, { abrangencia: "AREAS", areaIds: [10] }, ctxEscopo).ok).toBe(true);
  });

  test("dirigente só propõe para a própria congregação", () => {
    expect(c.escopoCobreEvento(["Gênesis"], { abrangencia: "CONGREGACAO", congregacaoId: 1 }, ctxEscopo).ok).toBe(true);
    expect(c.escopoCobreEvento(["Gênesis"], { abrangencia: "CONGREGACAO", congregacaoId: 2 }, ctxEscopo).ok).toBe(false);
    expect(c.escopoCobreEvento(["Gênesis"], { abrangencia: "CAMPO" }, ctxEscopo).mensagem).toMatch(/escopo global/);
    expect(c.escopoCobreEvento(["Gênesis"], { abrangencia: "CONGREGACAO", congregacaoId: 404 }, ctxEscopo).ok).toBe(false);
  });

  test("pastor de Área propõe para a Área inteira dele, não para parte dela nem para outra", () => {
    const pastor = ["Gênesis", "Bom Pastor"];
    expect(c.escopoCobreEvento(pastor, { abrangencia: "AREAS", areaIds: [10] }, ctxEscopo).ok).toBe(true);
    expect(c.escopoCobreEvento(pastor, { abrangencia: "AREAS", areaIds: [20] }, ctxEscopo).ok).toBe(false);
    expect(c.escopoCobreEvento(pastor, { abrangencia: "AREAS", areaIds: [10, 20] }, ctxEscopo).ok).toBe(false);
    expect(c.escopoCobreEvento(["Gênesis"], { abrangencia: "AREAS", areaIds: [10] }, ctxEscopo).ok).toBe(false); // só metade da Área
    expect(c.escopoCobreEvento(pastor, { abrangencia: "AREAS", areaIds: [99] }, ctxEscopo).mensagem).toMatch(/sem congregações/);
  });
});

describe("catálogo de tipos (CLI)", () => {
  const base = { codigo: "culto_especial", nome: "Culto especial", nivel: 4, abrangenciasPermitidas: ["congregacao"] };

  test("tipo válido: código em maiúsculas, abrangências normalizadas", () => {
    const r = c.validarTipo(base, { criando: true });
    expect(r.valido).toBe(true);
    expect(r.dados).toMatchObject({ codigo: "CULTO_ESPECIAL", nivel: 4, abrangenciasPermitidas: "CONGREGACAO", festividade: false, publicoNoSite: false, antecedenciaMinimaHoras: null });
  });

  test("recusa código ruim, nome curto, nível e abrangência inválidos", () => {
    expect(c.validarTipo({ ...base, codigo: "1x" }, { criando: true }).valido).toBe(false);
    expect(c.validarTipo({ ...base, nome: "ab" }).valido).toBe(false);
    expect(c.validarTipo({ ...base, nivel: 6 }).valido).toBe(false);
    expect(c.validarTipo({ ...base, abrangenciasPermitidas: [] }).valido).toBe(false);
    expect(c.validarTipo({ ...base, abrangenciasPermitidas: ["PLANETA"] }).valido).toBe(false);
  });

  test("Nível 1 é sempre do campo todo", () => {
    expect(c.validarTipo({ ...base, nivel: 1, abrangenciasPermitidas: ["CONGREGACAO"] }).valido).toBe(false);
    expect(c.validarTipo({ ...base, nivel: 1, abrangenciasPermitidas: ["CAMPO", "AREAS"] }).valido).toBe(false);
    expect(c.validarTipo({ ...base, nivel: 1, abrangenciasPermitidas: "CAMPO" }).valido).toBe(true);
  });

  test("antecedência mínima: 1 a 720 horas; ao atualizar o código não é exigido", () => {
    expect(c.validarTipo({ ...base, antecedenciaMinimaHoras: 48 }).dados.antecedenciaMinimaHoras).toBe(48);
    expect(c.validarTipo({ ...base, antecedenciaMinimaHoras: 0 }).valido).toBe(false);
    expect(c.validarTipo({ ...base, antecedenciaMinimaHoras: 721 }).valido).toBe(false);
    expect(c.validarTipo({ nome: "Culto especial", nivel: 4, abrangenciasPermitidas: "CONGREGACAO" }).valido).toBe(true);
  });
});
