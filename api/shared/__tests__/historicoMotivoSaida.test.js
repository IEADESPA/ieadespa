// 17/11/2026 (aprovado pelo responsável) — o histórico antigo (GET /api/pessoas/{id}/historico) mostrava o MOTIVO de uma saída por exclusão ou abandono a quem
// não tem a permissão "disciplina". Agora a saída disciplinar aparece sem o motivo para quem não tem "disciplina" com a pessoa no escopo; as outras causas seguem à vista.
let mockMembro = {};
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const r = { input: () => r, query: async (texto) => {
    if (/FROM MembroReferencia WHERE MembroId = @id/.test(texto)) return { recordset: [mockMembro] };
    return { recordset: [] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../escopoRotas", () => {
  const real = jest.requireActual("../escopoRotas");
  return { ...real, pessoaAlcancavel: jest.fn(async (_pool, _usuario, id) => ({ membroId: Number(id), congregacaoNome: "Vila Nova", extensaoNome: null })) };
});

const auth = require("../auth");
const hHistorico = require("../../HistoricoMembro/index.js");

const tokenDe = (permissoes, escopoCongregacoes = "TODAS") => auth.reassinarSessao({ membroId: 5, via: "SENHA", permissoes, escopoCongregacoes, termosPendentes: [] });
async function historico(token) {
  const context = { bindingData: { membroId: "700611" }, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await hHistorico(context, { method: "GET", query: {}, body: {}, headers: { "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000", "x-auth-token": token } });
  return context.res;
}
const saida = (res) => (Array.isArray(res.body) ? res.body : res.body.eventos || []).find((e) => e.tipo === "SAIDA");

const membroQueSaiu = (motivo) => ({ Nome: "Fernanda Teste", FormaAdmissao: "BATISMO", DataAdmissao: "2015-04-12", DataBatismo: null, DataRitoRecebimento: null,
  Origem: null, IgrejaAnterior: null, DataSaida: "2026-03-01", MotivoSaida: motivo });

describe("histórico antigo: o motivo de uma saída disciplinar só para quem tem \"disciplina\"", () => {
  test.each(["EXCLUSAO", "ABANDONO_MATERIAL", "ABANDONO_DIGITAL"])("saída por %s: sem \"disciplina\", aparece sem o motivo", async (motivo) => {
    mockMembro = membroQueSaiu(motivo);
    const res = await historico(tokenDe(["pessoas"]));
    expect(res.status).toBe(200);
    const s = saida(res);
    expect(s).toBeTruthy();
    expect(s.descricao).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain(motivo);
  });

  test.each(["EXCLUSAO", "ABANDONO_DIGITAL"])("saída por %s: com \"disciplina\" no escopo, o motivo aparece", async (motivo) => {
    mockMembro = membroQueSaiu(motivo);
    const s = saida(await historico(tokenDe(["pessoas", "disciplina"])));
    expect(s.descricao).toBe(motivo);
  });

  test("\"disciplina\" só em OUTRA congregação não basta", async () => {
    mockMembro = membroQueSaiu("EXCLUSAO");
    const token = auth.reassinarSessao({ membroId: 5, via: "SENHA", permissoes: ["pessoas", "disciplina"], escopoCongregacoes: "TODAS", termosPendentes: [],
      concessoes: [{ tipo: "PROPRIA", permissoes: ["pessoas"], escopoCongregacoes: "TODAS" }, { tipo: "DELEGACAO", permissoes: ["disciplina"], escopoCongregacoes: ["Jardim"] }] });
    const s = saida(await historico(token));
    expect(s.descricao).toBeNull();
  });

  test.each(["FALECIMENTO", "DESLIGAMENTO", "CARTA_MUDANCA"])("saída por %s (não disciplinar): o motivo continua à vista", async (motivo) => {
    mockMembro = membroQueSaiu(motivo);
    const s = saida(await historico(tokenDe(["pessoas"])));
    expect(s.descricao).toBe(motivo);
  });
});
