// 18/11/2026 (autorizado pelo responsável) — a LISTA de pessoas (GET /api/pessoas, inteira e em páginas) levava no JSON o motivo de uma saída DISCIPLINAR
// (exclusão, abandono) a quem tinha só a permissão "pessoas". Agora o motivo disciplinar vai só a quem tem "disciplina" com a pessoa no escopo; as outras
// causas continuam. O banco é simulado por TEXTO da consulta; o comportamento contra o SQL Server está em tools/e2e-localdb/e2e-87-historico-motivo-saida.js.
let mockRegras = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const r = { input: () => r, query: async (texto) => {
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return typeof valor === "function" ? valor() : valor;
    return { recordset: [], recordsets: [[]], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../notificacaoEmail", () => ({ enviarEmailNotificacao: jest.fn(async () => {}) }));
jest.mock("../vacancia", () => ({ encerrarVinculos: jest.fn(async () => {}) }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, urlDocumentoComSas: (u) => u, salvarFoto: jest.fn(), salvarDocumento: jest.fn() }));

const auth = require("../auth");
const hPessoas = require("../../GestaoPessoas/index.js");

const CONGREGACOES = [{ CongregacaoId: 1, Nome: "Central" }, { CongregacaoId: 2, Nome: "Vila Nova" }];
const pessoa = (membroId, motivoSaida, congregacao = "Central") => ({ membroId, nome: `Pessoa ${membroId}`, congregacao, congregacaoId: congregacao === "Central" ? 1 : 2,
  extensao: null, status: motivoSaida ? "DESLIGADO" : "ATIVO", situacaoMembro: motivoSaida ? "SEM_COMUNHAO" : "EM_COMUNHAO", dataNascimento: "1990-01-01",
  dataAdmissao: "2015-01-01", dataSaida: motivoSaida ? "2026-03-01" : null, motivoSaida, fotoUrl: null, cargoMinisterial: null });
const PESSOAS = [pessoa(1, "EXCLUSAO"), pessoa(2, "ABANDONO_MATERIAL"), pessoa(3, "ABANDONO_DIGITAL"), pessoa(4, "CARTA_MUDANCA"), pessoa(5, "FALECIMENTO"), pessoa(6, null),
  pessoa(7, "EXCLUSAO", "Vila Nova")];

const tokenDe = (extra) => auth.reassinarSessao({ membroId: 99, via: "SENHA", nivel: "GLOBAL", permissoes: ["pessoas"], escopoCongregacoes: "TODAS", termosPendentes: [], ...extra });
async function listar(token, query = {}) {
  const context = { bindingData: {}, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await hPessoas(context, { method: "GET", query, body: {}, headers: { "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000", "x-auth-token": token } });
  const b = context.res.body;
  return Array.isArray(b) ? b : b.itens;
}

beforeEach(() => {
  mockRegras = [
    [/SELECT CongregacaoId, Nome FROM Congregacoes/, { recordset: CONGREGACOES }],
    [/SELECT COUNT\(\*\) AS total/, () => ({ recordset: [], recordsets: [[{ total: PESSOAS.length }], PESSOAS.map((p) => ({ ...p }))] })],
    [/FROM MembroReferencia m/, () => ({ recordset: PESSOAS.map((p) => ({ ...p })) })],
    [/FROM ProcessosDisciplinares/, { recordset: [] }]
  ];
});

describe.each([["a lista inteira", {}], ["a lista em páginas", { pagina: "1" }]])("%s", (_rotulo, query) => {
  test("só \"pessoas\": o motivo disciplinar sai (null), o resto fica; a data da saída continua", async () => {
    const lista = await listar(tokenDe({}), query);
    const por = (id) => lista.find((p) => p.membroId === id);
    expect(por(1).motivoSaida).toBeNull();
    expect(por(2).motivoSaida).toBeNull();
    expect(por(3).motivoSaida).toBeNull();
    expect(por(7).motivoSaida).toBeNull();
    expect(por(1).dataSaida).toBe("2026-03-01");
    expect(por(4).motivoSaida).toBe("CARTA_MUDANCA");
    expect(por(5).motivoSaida).toBe("FALECIMENTO");
    expect(por(6).motivoSaida).toBeNull();
    expect(JSON.stringify(lista)).not.toMatch(/EXCLUSAO|ABANDONO_MATERIAL|ABANDONO_DIGITAL/);
  });
  test("com \"disciplina\" no escopo da pessoa: o motivo vai", async () => {
    const lista = await listar(tokenDe({ permissoes: ["pessoas", "disciplina"] }), query);
    expect(lista.find((p) => p.membroId === 1).motivoSaida).toBe("EXCLUSAO");
    expect(lista.find((p) => p.membroId === 7).motivoSaida).toBe("EXCLUSAO");
  });
  test("\"disciplina\" só em outra congregação: o motivo da pessoa de fora dela não vai", async () => {
    const token = tokenDe({ concessoes: [
      { tipo: "PROPRIA", permissoes: ["pessoas"], nivel: "GLOBAL", escopoCongregacoes: "TODAS" },
      { tipo: "DELEGACAO", permissoes: ["disciplina"], nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"] }] });
    const lista = await listar(token, query);
    expect(lista.find((p) => p.membroId === 1).motivoSaida).toBeNull();
    expect(lista.find((p) => p.membroId === 7).motivoSaida).toBe("EXCLUSAO");
  });
});
