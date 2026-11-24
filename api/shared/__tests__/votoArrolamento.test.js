// A1 (revisão de 24/11/2026): "sem voto até completar" vale também nas enquetes e na votação do tema. As duas usam o universo geral (universoDoOrgao com
// órgão nulo) e o "apto e em comunhão" de uma pessoa (enquetes.aptoEmComunhao): a ficha em ARROLAMENTO sai das duas. O congregado continua como estava
// (não é desta revisão) e a ficha sem situação (NULL) continua votando. Os universos dos órgãos (presença e quórum das reuniões) não mudam aqui.
jest.mock("../disciplina", () => ({ membrosSobDisciplina: jest.fn(async () => new Set([5])) }));

const fs = require("fs");
const path = require("path");
const universo = require("../universo");

const FICHAS = [
  { membroId: 1, nome: "Ana Arrolamento", situacaoMembro: "ARROLAMENTO" },
  { membroId: 2, nome: "Bruno Sem Comunhão", situacaoMembro: "SEM_COMUNHAO" },
  { membroId: 3, nome: "Carla Em Comunhão", situacaoMembro: "EM_COMUNHAO" },
  { membroId: 4, nome: "Davi Congregado", situacaoMembro: "CONGREGADO" },
  { membroId: 6, nome: "Elisa Sem Situação", situacaoMembro: null },
  { membroId: 5, nome: "Fábio Sob Disciplina", situacaoMembro: "EM_COMUNHAO" }
];
const pool = { request: () => ({ input() { return this; }, query: async () => ({ recordset: FICHAS }) }) };

describe("A1: a ficha em arrolamento não vota nas enquetes nem no tema", () => {
  test("o universo geral (órgão nulo): sai o arrolamento, o sem comunhão e o sob disciplina; o congregado e a ficha sem situação ficam", async () => {
    const ids = (await universo.universoDoOrgao(pool, null)).map((m) => m.membroId).sort();
    expect(ids).toEqual([3, 4, 6]);
  });

  test("o 'apto e em comunhão' de uma pessoa usa o mesmo critério (sem ISNULL na coluna; a ficha sem situação continua apta)", () => {
    const fonte = fs.readFileSync(path.join(__dirname, "..", "enquetes.js"), "utf8");
    const i = fonte.indexOf("async function aptoEmComunhao");
    const corpo = fonte.slice(i, i + fonte.slice(i).search(/\r?\n\}\r?\n/));
    expect(corpo).toMatch(/\(m\.SituacaoMembro IS NULL OR m\.SituacaoMembro NOT IN \('SEM_COMUNHAO', 'ARROLAMENTO'\)\)/);
    expect(corpo).not.toMatch(/ISNULL\(m\.SituacaoMembro/);
  });

  test("os universos dos órgãos (presença e quórum) não mudam: o filtro comum continua só com o sem comunhão e a disciplina", () => {
    const fonte = fs.readFileSync(path.join(__dirname, "..", "universo.js"), "utf8");
    expect(fonte).toMatch(/function emComunhaoAtiva\(membro, idsSobDisciplina\) \{\r?\n\s+return membro\.situacaoMembro !== "SEM_COMUNHAO" && !idsSobDisciplina\.has\(membro\.membroId\);/);
  });
});
