// FASE 10 (19/11/2026) — a lista de pessoas ordenada pelo CABEÇALHO (telas novas de Membros): só valores de uma lista fechada viram SQL; o resto cai no nome.
jest.mock("../db", () => ({ getPool: async () => { throw new Error("sem banco neste teste"); }, sql: new Proxy({}, { get: () => () => undefined }) }));
const { ordemDaLista } = require("../../GestaoPessoas/index.js");

describe("ordem da lista de pessoas (?ordem= e ?direcao=)", () => {
  test("cada coluna da tela tem a sua ordem, com o desempate pelo nome e pela matrícula", () => {
    expect(ordemDaLista({ ordem: "area", direcao: "desc" })).toBe("ar.Nome DESC, m.Nome ASC, m.MembroId ASC");
    expect(ordemDaLista({ ordem: "congregacao" })).toBe("c.Nome ASC, m.Nome ASC, m.MembroId ASC");
    expect(ordemDaLista({ ordem: "situacao", direcao: "asc" })).toBe("m.SituacaoMembro ASC, m.Nome ASC, m.MembroId ASC");
    expect(ordemDaLista({ ordem: "cargo" })).toBe("COALESCE(cm.Nome, m.Funcao) ASC, m.Nome ASC, m.MembroId ASC");
    expect(ordemDaLista({ ordem: "departamento", direcao: "desc" })).toBe("m.DepartamentoId DESC, m.Nome ASC, m.MembroId ASC");
    expect(ordemDaLista({ ordem: "matricula", direcao: "desc" })).toBe("m.MembroId DESC");
    expect(ordemDaLista({ ordem: "nome", direcao: "desc" })).toBe("m.Nome DESC, m.MembroId DESC");
  });
  test("sem ordem, ordem desconhecida, injeção ou chave do protótipo: o nome, crescente", () => {
    for (const q of [undefined, {}, { ordem: "x; DROP TABLE MembroReferencia--" }, { ordem: "__proto__" }, { ordem: "constructor" }, { ordem: ["nome"] }, { ordem: "nome", direcao: "DESC; --" }]) {
      expect(ordemDaLista(q)).toBe("m.Nome ASC, m.MembroId ASC");
    }
  });
});
