// A marca de pendência da proteção (shared/protecaoPendencia.js) e a rotina horária que a lê (ProtecaoVerificador). Trava 7-B (20/10/2026): se regravar a marca falha ou estoura o
// tempo, a marca antiga ("0 pendentes") não pode ficar valendo — ela faria a rotina horária dormir até as 7h com uma suspeita nova correndo. O Storage e o banco são simulados.
jest.mock("../storage", () => ({ salvarJsonPrivado: jest.fn(async () => undefined), lerJsonPrivado: jest.fn(async () => null) }));
jest.mock("../db", () => ({ getPool: jest.fn(async () => ({ request: () => { throw new Error("o banco não devia ser aberto"); } })), sql: new Proxy({}, { get: () => () => undefined }) }));
jest.mock("../cronAuth", () => ({ exigirSegredoRotina: () => true }));
jest.mock("../notificacaoMotor", () => ({ avaliarRegras: jest.fn(async () => ({ criadas: 0, emailsEnviados: 0, falhas: [] })) }));
jest.mock("../ministerioMenoresDb", () => ({ retirarInaptosDasEscalas: jest.fn(async () => ({ retirados: 0, alocacoes: 0 })) }));
jest.mock("../protecaoDb", () => ({ reenviarEmailsPendentes: jest.fn(async () => ({ tentados: 0 })) }));

const fs = require("fs");
const path = require("path");
const storage = require("../storage");
const { getPool } = require("../db");
const pendencia = require("../protecaoPendencia");

// um pool que responde ao cálculo com `linha` depois de `atrasoMs`
const poolQueResponde = (linha, atrasoMs = 0) => ({ request: () => { const r = { input: () => r, query: () => new Promise((ok) => setTimeout(() => ok({ recordset: [linha] }), atrasoMs)) }; return r; } });
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

let antes;
beforeEach(() => { antes = process.env.AZURE_STORAGE_CONNECTION_STRING; process.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true"; jest.clearAllMocks(); jest.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { if (antes === undefined) delete process.env.AZURE_STORAGE_CONNECTION_STRING; else process.env.AZURE_STORAGE_CONNECTION_STRING = antes; console.error.mockRestore(); });

describe("a marca de pendência nunca fica com o valor velho depois de uma falha", () => {
  test("tudo certo: grava o valor calculado, uma vez", async () => {
    const v = await pendencia.atualizar(poolQueResponde({ n: 2, proximo: null }));
    expect(v).toEqual({ pendentes: 2, proximoPrazo: null });
    expect(storage.salvarJsonPrivado).toHaveBeenCalledTimes(1);
    expect(storage.salvarJsonPrivado.mock.calls[0][1]).toMatchObject({ pendentes: 2 });
  });
  test("a gravação falha: a marca é INVALIDADA (regravada como 'não sei'), e a leitura dela dá null — a rotina horária abre o banco", async () => {
    storage.salvarJsonPrivado.mockRejectedValueOnce(new Error("Storage instável"));
    expect(await pendencia.atualizar(poolQueResponde({ n: 1, proximo: null }))).toBeNull();
    expect(storage.salvarJsonPrivado).toHaveBeenCalledTimes(2);
    const invalida = storage.salvarJsonPrivado.mock.calls[1][1];
    expect(invalida).toMatchObject({ pendentes: null, invalida: true });
    storage.lerJsonPrivado.mockResolvedValueOnce(invalida);
    expect(await pendencia.lerGuardada()).toBeNull();
  });
  test("o cálculo estoura o tempo: invalida a marca e, quando o cálculo atrasado termina, NÃO grava o valor por cima da invalidação", async () => {
    expect(await pendencia.atualizar(poolQueResponde({ n: 0, proximo: null }, 60), { tempoMaximoMs: 10 })).toBeNull();
    expect(storage.salvarJsonPrivado).toHaveBeenCalledTimes(1);
    expect(storage.salvarJsonPrivado.mock.calls[0][1]).toMatchObject({ pendentes: null, invalida: true });
    await esperar(120);
    expect(storage.salvarJsonPrivado).toHaveBeenCalledTimes(1);          // o "0" atrasado não chegou a ser gravado
  });
  test("nem a invalidação grava: não lança (a chamada que provocou a regravação segue)", async () => {
    storage.salvarJsonPrivado.mockRejectedValue(new Error("Storage fora do ar"));
    await expect(pendencia.atualizar(poolQueResponde({ n: 0, proximo: null }))).resolves.toBeNull();
    storage.salvarJsonPrivado.mockReset();
  });
});

describe("a rotina horária (ProtecaoVerificador)", () => {
  const handler = require("../../ProtecaoVerificador/index.js");
  const chamar = async () => { const context = { log: Object.assign(() => {}, { error() {} }) }; await handler(context, { headers: { "x-somente-se-pendente": "1" } }); return context.res; };
  test("com a marca '0 pendentes' dorme sem abrir o banco; com a marca invalidada, na dúvida, abre", async () => {
    storage.lerJsonPrivado.mockResolvedValueOnce({ pendentes: 0, em: "2026-10-20T10:00:00.000Z" });
    expect((await chamar()).body).toMatchObject({ ocioso: true });
    expect(getPool).not.toHaveBeenCalled();
    storage.lerJsonPrivado.mockResolvedValueOnce({ pendentes: null, invalida: true, motivo: "falha ao regravar" });
    getPool.mockResolvedValueOnce(poolQueResponde({ n: 0, proximo: null }));
    expect((await chamar()).body.ocioso).toBeUndefined();
    expect(getPool).toHaveBeenCalledTimes(1);
  });
  test("o comentário do cabeçalho diz o que a rotina avalia de verdade: só as duas regras de REGRAS_DA_PROTECAO (padrões, Comitê e afastamento ficam na rodada diária)", () => {
    const fonte = fs.readFileSync(path.join(__dirname, "..", "..", "ProtecaoVerificador", "index.js"), "utf8");
    const regras = /const REGRAS_DA_PROTECAO = \[([^\]]*)\]/.exec(fonte)[1].split(",").map((s) => s.trim().replace(/"/g, ""));
    expect(regras).toEqual(["PROTECAO_INCIDENTE_NOVO", "PROTECAO_PRAZO_24H"]);
    const passo2 = /\/\/\s+2\)([\s\S]*?)\n\/\/ Resposta 500/.exec(fonte)[1];
    expect(passo2).toMatch(/duas regras/);
    expect(passo2).toMatch(/Padrões, Comitê incompleto, afastamento sem decisão e o resumo ficam na rodada diária/);
    expect(passo2).not.toMatch(/vencido, padrão de quebras, Comitê incompleto, afastamento sem decisão\)/);
  });
});
