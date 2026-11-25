// A1 (decisão dele de 24/11/2026, volta 5): quem está em arrolamento "não vota em nada e não conta em nada" — fica fora das enquetes, da votação do tema, da
// LISTA_CUSTOM e também da presença e do quórum das reuniões de órgão (emComunhaoAtiva): "não consegue nem entrar nessas reuniões". O CONGREGADO segue a tela
// aprovada ("ainda não membro: não vota"): sai das enquetes e do tema (o universo geral e o "apto e em comunhão"), mas continua na presença e no quórum dos
// órgãos (isso não foi decidido). A ficha sem situação (NULL) continua votando. A votação do tema diz o motivo de verdade (menor 7 do portão).
jest.mock("../disciplina", () => ({
  membrosSobDisciplina: jest.fn(async () => new Set([5])),
  CONDICAO_SQL_ATIVO: "1 = 1",
  foraDaReadmissao: () => "1 = 1"
}));

const fs = require("fs");
const path = require("path");
const universo = require("../universo");
const enquetes = require("../enquetes");

const FICHAS = [
  { membroId: 1, nome: "Ana Arrolamento", situacaoMembro: "ARROLAMENTO" },
  { membroId: 2, nome: "Bruno Sem Comunhão", situacaoMembro: "SEM_COMUNHAO" },
  { membroId: 3, nome: "Carla Em Comunhão", situacaoMembro: "EM_COMUNHAO" },
  { membroId: 4, nome: "Davi Congregado", situacaoMembro: "CONGREGADO" },
  { membroId: 6, nome: "Elisa Sem Situação", situacaoMembro: null },
  { membroId: 5, nome: "Fábio Sob Disciplina", situacaoMembro: "EM_COMUNHAO" }
];
const pool = { request: () => ({ input() { return this; }, query: async () => ({ recordset: FICHAS }) }) };
// um pool que guarda o texto de cada consulta e responde com `linhas`
function poolQueGuarda(linhas) {
  const consultas = [];
  return { consultas, request: () => ({ input() { return this; }, query: async (t) => { consultas.push(t); return { recordset: linhas }; } }) };
}
const corpoDe = (arquivo, assinatura) => {
  const fonte = fs.readFileSync(path.join(__dirname, "..", arquivo), "utf8");
  const i = fonte.indexOf(assinatura);
  return fonte.slice(i, i + fonte.slice(i).search(/\r?\n\}\r?\n/));
};

describe("A1: quem está em arrolamento não vota nem conta em nada; o congregado não vota", () => {
  test("o universo geral (enquetes e tema): saem o arrolamento, o congregado, o sem comunhão e o sob disciplina; ficam o em comunhão e a ficha sem situação", async () => {
    const ids = (await universo.universoDoOrgao(pool, null)).map((m) => m.membroId).sort();
    expect(ids).toEqual([3, 6]);
  });

  test("o universo de um órgão (presença e quórum): o arrolamento sai; o congregado continua (a regra dos órgãos para ele não foi decidida)", async () => {
    // o órgão com cadeiras: o universo é quem ocupa um assento ativo (o pool devolve as mesmas fichas para toda consulta)
    const ids = (await universo.universoDoOrgao(pool, { orgaoId: 7, sigla: "DIRETORIA_EXECUTIVA" })).map((m) => m.membroId).sort();
    expect(ids).toEqual([3, 4, 6]);
  });

  test("a reunião de um órgão territorial (todo mundo ATIVO do território): o arrolamento também sai", async () => {
    const pq = poolQueGuarda(FICHAS);
    jest.spyOn(require("../escopo"), "resolverEscopoCongregacoes").mockResolvedValueOnce("TODAS");
    const ids = (await universo.universoDoOrgao(pq, { orgaoLocalId: 3, nivel: 2, referenciaId: 9, sigla: "JAI" })).map((m) => m.membroId).sort();
    expect(ids).toEqual([3, 4, 6]);
  });

  test("o 'apto e em comunhão' de uma pessoa: o mesmo critério do universo geral (sem ISNULL na coluna; a ficha sem situação continua apta)", () => {
    const corpo = corpoDe("enquetes.js", "async function situacaoParaVoto");
    expect(corpo).toMatch(/\(m\.SituacaoMembro IS NULL OR m\.SituacaoMembro NOT IN \('SEM_COMUNHAO', 'ARROLAMENTO', 'CONGREGADO'\)\)/);
    expect(corpo).not.toMatch(/ISNULL\(m\.SituacaoMembro/);
  });

  test("o motivo de quem não vota: arrolamento, congregado ou outro (o tema diz o motivo de verdade)", async () => {
    const motivo = async (linha) => (await enquetes.situacaoParaVoto(poolQueGuarda(linha ? [linha] : []), 10)).motivo;
    expect(await motivo({ apto: 0, situacao: "ARROLAMENTO" })).toBe("ARROLAMENTO");
    expect(await motivo({ apto: 0, situacao: "CONGREGADO" })).toBe("CONGREGADO");
    expect(await motivo({ apto: 0, situacao: "SEM_COMUNHAO" })).toBe("OUTRO");
    expect(await motivo(null)).toBe("OUTRO");
    expect(await enquetes.situacaoParaVoto(poolQueGuarda([{ apto: 1, situacao: "EM_COMUNHAO" }]), 10)).toEqual({ apto: true, motivo: null });
    expect(await enquetes.aptoEmComunhao(poolQueGuarda([{ apto: 0, situacao: "CONGREGADO" }]), 10)).toBe(false);
    expect(await enquetes.aptoEmComunhao(poolQueGuarda([{ apto: 1, situacao: "EM_COMUNHAO" }]), 10)).toBe(true);
  });

  test("a LISTA_CUSTOM: quem está em arrolamento na lista não vota (conferido na leitura, para quem completar depois voltar a votar)", async () => {
    const sql = { Int: "Int" };
    const lista = poolQueGuarda([{ membroId: 3 }]);
    await enquetes.membrosElegiveis(lista, sql, { publicoTipo: "LISTA_CUSTOM", enqueteId: 1 });
    expect(lista.consultas[0]).toMatch(/JOIN MembroReferencia m ON m\.MembroId = p\.MembroId/);
    expect(lista.consultas[0]).toMatch(/m\.SituacaoMembro <> 'ARROLAMENTO'/);
    const uma = poolQueGuarda([]);
    expect(await enquetes.membroElegivel(uma, sql, { publicoTipo: "LISTA_CUSTOM", enqueteId: 1 }, 1)).toBe(false);
    expect(uma.consultas[0]).toMatch(/m\.SituacaoMembro <> 'ARROLAMENTO'/);
  });

  test("o filtro comum dos órgãos (emComunhaoAtiva) tira o sem comunhão, o arrolamento e quem está sob disciplina", () => {
    expect(corpoDe("universo.js", "function emComunhaoAtiva")).toMatch(/"SEM_COMUNHAO"[\s\S]*"ARROLAMENTO"/);
  });
});

describe("menor 7: o tema diz o motivo de verdade a quem não participa", () => {
  const iv = require("../identidadeVisualDb");
  test("arrolamento: a ficha está com o arrolamento a completar (não 'não está em comunhão')", () => {
    expect(iv.textoNaoApto("ARROLAMENTO")).toMatch(/arrolamento a completar/);
    expect(iv.textoNaoApto("ARROLAMENTO")).not.toMatch(/em comunhão participa/);
  });
  test("congregado: ainda não é membro", () => {
    expect(iv.textoNaoApto("CONGREGADO")).toMatch(/congregado ainda não é membro/);
  });
  test("o resto: o texto de sempre (membro ativo e em comunhão, Regimento Art. 159)", () => {
    expect(iv.textoNaoApto("OUTRO")).toMatch(/membro ativo e em comunhão participa/);
    expect(iv.textoNaoApto(null)).toMatch(/membro ativo e em comunhão participa/);
  });
});
