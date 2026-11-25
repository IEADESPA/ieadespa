// A gravação da ficha e o desligamento no cadastro de pessoas (GestaoPessoas): a matrícula canônica, a data de saída que fica ao salvar a ficha de quem já
// saiu e a data do dia de Brasília. O banco é simulado por TEXTO da consulta, guardando os parâmetros de cada uma; o comportamento contra o SQL Server está
// em tools/e2e-localdb/e2e-152-acesso.js.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => {
  const executar = async (texto, entradas) => {
    mockConsultas.push({ texto, entradas });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return typeof valor === "function" ? valor(entradas, texto) : valor;
    return { recordset: [], recordsets: [[]], rowsAffected: [0] };
  };
  const novaRequest = () => {
    const entradas = {};
    const r = { input: (nome, ...resto) => { entradas[nome] = resto[resto.length - 1]; return r; }, query: (texto) => executar(texto, entradas), batch: (texto) => executar(texto, entradas) };
    return r;
  };
  class Transaction { async begin() {} async commit() {} async rollback() {} request() { return novaRequest(); } }
  class Request { constructor() { return novaRequest(); } }
  const sql = new Proxy({}, { get: (_alvo, nome) => (nome === "Transaction" ? Transaction : nome === "Request" ? Request : () => undefined) });
  return { getPool: async () => ({ request: novaRequest }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../notificacaoEmail", () => ({ enviarEmailNotificacao: jest.fn(async () => true) }));
jest.mock("../vacancia", () => ({ encerrarVinculos: jest.fn(async () => {}) }));
jest.mock("../credencialDb", () => ({ recolherSemFalhar: jest.fn(async () => {}) }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, urlDocumentoComSas: (u) => u, salvarFoto: jest.fn(), salvarDocumento: jest.fn() }));

const auth = require("../auth");
const hPessoas = require("../../GestaoPessoas/index.js");

const sessao = (membroId, extra = {}) => auth.reassinarSessao({ membroId, via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", permissoes: ["pessoas"],
  escopoCongregacoes: "TODAS", termosPendentes: [], ...extra });
const cab = (token) => ({ "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000", "x-auth-token": token });
async function chamar(metodo, { token, corpo = {}, membroIdRota } = {}) {
  const context = { bindingData: membroIdRota === undefined ? {} : { membroId: membroIdRota }, log: Object.assign(() => {}, { error() {}, info() {}, warn() {}, verbose() {} }) };
  await hPessoas(context, { method: metodo, query: {}, body: corpo, headers: cab(token) });
  return context.res;
}
const gravacoes = () => mockConsultas.filter((c) => /UPDATE MembroReferencia SET Nome|INSERT INTO MembroReferencia|UPDATE MembroReferencia SET Status = 'DESLIGADO'/.test(c.texto));

// A ficha como o banco a devolve na leitura antes de gravar
const fichaNoBanco = (extra = {}) => ({ MembroId: 5, Status: "ATIVO", EmailAnterior: null, MotivoAnterior: null, CargoAnterior: null, DizimistaAnterior: null, SexoAnterior: "F",
  NascimentoAnterior: "1990-01-01", AdmissaoAnterior: "2015-01-01", EstadoCivilAnterior: null, EmProcessoDeCargo: 0, TemExclusao: 0, CongregacaoNome: "Central", ExtensaoNome: null,
  DataSaidaAnterior: null, ...extra });
const membroLido = (extra = {}) => ({ membroId: 5, nome: "Pessoa Cinco", congregacao: "Central", extensao: null, status: "ATIVO", dataNascimento: "1990-01-01", motivoSaida: null, fotoUrl: null, ...extra });
const corpoFicha = (extra = {}) => ({ membroId: 5, nome: "Pessoa Cinco", congregacaoId: 1, status: "ATIVO", dataNascimento: "1990-01-01", dataAdmissao: "2015-01-01", sexo: "F", ...extra });

function regrasDaFicha(ficha) {
  mockRegras = [
    [/SELECT TOP 1 Nome FROM Congregacoes/, { recordset: [{ Nome: "Central" }] }],
    [/FROM CargosMinisteriais WHERE Sigla/, { recordset: [{ x: 1 }] }],
    [/EmProcessoDeCargo/, () => ({ recordset: ficha ? [ficha] : [] })],
    [/UPDATE MembroReferencia SET Nome/, { recordset: [], rowsAffected: [1] }],
    [/INSERT INTO MembroReferencia/, { recordset: [], rowsAffected: [1] }],
    [/COALESCE\(cm\.Nome, m\.Funcao\)/, () => ({ recordset: [membroLido({ status: ficha ? ficha.Status : "ATIVO" })] })]
  ];
}

beforeEach(() => {
  mockConsultas = [];
  regrasDaFicha(fichaNoBanco());
});

describe("a matrícula do corpo da ficha", () => {
  test.each([[5.9], ["5.9"], ["05"], [-5], [0], ["5 OR 1=1"], [true], [{ a: 1 }], [2147483648]])("matrícula não canônica (%p): 400 e nada é gravado", async (membroId) => {
    const r = await chamar("POST", { token: sessao(5), corpo: corpoFicha({ membroId, cargoMinisterial: "PASTOR", dizimistaFiel: true }) });
    expect(r.status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });

  test("a matrícula em texto com espaço em volta vale como o número", async () => {
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ membroId: " 5 " }) });
    expect(r.status).toBe(200);
    expect(gravacoes()[0].entradas.id).toBe(5);
  });

  test("a própria ficha com o número certo continua barrada no cargo e no dízimo", async () => {
    const r = await chamar("POST", { token: sessao(5), corpo: corpoFicha({ membroId: 5, cargoMinisterial: "PASTOR" }) });
    expect(r.status).toBe(422);
    expect(gravacoes()).toHaveLength(0);
  });

  test("DELETE com matrícula não canônica na rota: 400, sem tocar no banco", async () => {
    const r = await chamar("DELETE", { token: sessao(77), membroIdRota: "5.9" });
    expect(r.status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
});

describe("a data de saída ao salvar a ficha", () => {
  test("quem já saiu: salvar sem o campo da data de saída mantém a data gravada", async () => {
    regrasDaFicha(fichaNoBanco({ Status: "DESLIGADO", MotivoAnterior: "DESLIGAMENTO", DataSaidaAnterior: "2026-11-20" }));
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "DESLIGADO", motivoSaida: "DESLIGAMENTO", telefone: "91900000000" }) });
    expect(r.status).toBe(200);
    expect(gravacoes()[0].entradas.dataSaida).toBe("2026-11-20");
  });

  test("quem já saiu: a data informada no pedido vale", async () => {
    regrasDaFicha(fichaNoBanco({ Status: "FALECIDO", MotivoAnterior: "FALECIMENTO", DataSaidaAnterior: "2026-11-20" }));
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "FALECIDO", motivoSaida: "FALECIMENTO", dataSaida: "2026-11-18" }) });
    expect(r.status).toBe(200);
    expect(gravacoes()[0].entradas.dataSaida).toBe("2026-11-18");
  });

  test("a volta ao rol ativo continua limpando a data de saída", async () => {
    regrasDaFicha(fichaNoBanco({ Status: "DESLIGADO", MotivoAnterior: "DESLIGAMENTO", DataSaidaAnterior: "2026-11-20" }));
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "ATIVO" }) });
    expect(r.status).toBe(200);
    expect(gravacoes()[0].entradas.dataSaida).toBeNull();
  });

  test("a saída registrada à noite fica com o dia de Brasília, não o de Greenwich", async () => {
    jest.useFakeTimers({ now: new Date("2026-11-26T01:30:00Z"), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });   // 25/11, 22h30 em Brasília
    try {
      const r = await chamar("POST", { token: sessao(77, { fator: { via: "CHAVE", em: Date.now() } }), corpo: corpoFicha({ status: "FALECIDO", motivoSaida: "FALECIMENTO" }) });
      expect(r.status).toBe(200);
      expect(gravacoes()[0].entradas.dataSaida).toBe("2026-11-25");
    } finally { jest.useRealTimers(); }
  });
});
