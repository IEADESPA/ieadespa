// vD.5 — a versão da agenda pública guardada fora do banco (shared/agendaPublicaVersao.js):
//  - só uma mudança de verdade (calendário/canais/eventos, método que escreve, resposta 2xx) regrava;
//  - sem Storage configurado, nada acontece e nada quebra;
//  - gravação usa a versão do pacote público (a mesma do site), nunca lança para a chamada que a provocou;
//  - a entrada única chama o gancho DEPOIS do handler (conferido no texto do arquivo).
const fs = require("fs");
const path = require("path");

jest.mock("../storage", () => ({ salvarJsonPrivado: jest.fn(async () => {}), lerJsonPrivado: jest.fn(async () => null) }));
jest.mock("../calendarioDb", () => ({ carregarContextoTerritorial: jest.fn(async () => ({ ctx: true })), pacotePublicoCompleto: jest.fn(async () => ({ versao: "0123456789abcdef", eventos: [], liturgia: [], canais: [] })) }));
jest.mock("../db", () => ({ getPool: jest.fn(async () => ({ pool: true })) }));

const storage = require("../storage");
const calendarioDb = require("../calendarioDb");
const versao = require("../agendaPublicaVersao");

const contexto = () => ({ res: { status: 200 }, log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }) });

describe("mudouAAgenda: só mudança de verdade conta", () => {
  test.each([
    ["GestaoCalendario", "POST", 200, true],
    ["GestaoCanais", "PUT", 201, true],
    ["GestaoEventos", "DELETE", undefined, true],
    ["GestaoCalendario", "GET", 200, false],
    ["GestaoCalendario", "POST", 400, false],
    ["GestaoCalendario", "POST", 500, false],
    ["GestaoPsc", "POST", 200, false],
    ["AgendaPublica", "POST", 200, false]
  ])("%s %s -> %s = %s", (pasta, metodo, status, esperado) => {
    expect(versao.mudouAAgenda(pasta, { method: metodo }, status === undefined ? {} : { status })).toBe(esperado);
  });
});

describe("sem AZURE_STORAGE_CONNECTION_STRING (máquina local, testes)", () => {
  const antes = process.env.AZURE_STORAGE_CONNECTION_STRING;
  beforeEach(() => { delete process.env.AZURE_STORAGE_CONNECTION_STRING; versao._zerar(); jest.clearAllMocks(); });
  afterAll(() => { if (antes !== undefined) process.env.AZURE_STORAGE_CONNECTION_STRING = antes; });
  test("lerGuardada devolve null, guardar devolve false, o gancho não faz nada", async () => {
    expect(await versao.lerGuardada()).toBeNull();
    expect(await versao.guardar("0123456789abcdef", "x")).toBe(false);
    expect(await versao.depoisDeMudanca(contexto(), "GestaoCalendario", { method: "POST" })).toBe(false);
    expect(storage.salvarJsonPrivado).not.toHaveBeenCalled();
    expect(calendarioDb.pacotePublicoCompleto).not.toHaveBeenCalled();
  });
});

describe("com Storage configurado", () => {
  beforeEach(() => { process.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true"; versao._zerar(); jest.clearAllMocks(); });
  afterAll(() => { delete process.env.AZURE_STORAGE_CONNECTION_STRING; });

  test("gancho depois de uma mudança: recalcula pelo pacote público e grava versão + instante + motivo", async () => {
    const ctx = contexto();
    expect(await versao.depoisDeMudanca(ctx, "GestaoCalendario", { method: "POST" })).toBe(true);
    expect(calendarioDb.pacotePublicoCompleto).toHaveBeenCalledTimes(1);
    expect(storage.salvarJsonPrivado).toHaveBeenCalledWith(versao.nomeDoBlob(), expect.objectContaining({ versao: "0123456789abcdef", motivo: "mudança em GestaoCalendario" }));
    expect(storage.salvarJsonPrivado.mock.calls[0][1].em).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(ctx.log.warn).not.toHaveBeenCalled();
  });

  test("várias ações seguidas: uma gravação basta (intervalo mínimo)", async () => {
    expect(await versao.depoisDeMudanca(contexto(), "GestaoCanais", { method: "POST" })).toBe(true);
    expect(await versao.depoisDeMudanca(contexto(), "GestaoCanais", { method: "POST" })).toBe(false);
    expect(storage.salvarJsonPrivado).toHaveBeenCalledTimes(1);
  });

  test("GET ou outra função: nem abre o banco", async () => {
    expect(await versao.depoisDeMudanca(contexto(), "GestaoCalendario", { method: "GET" })).toBe(false);
    expect(await versao.depoisDeMudanca(contexto(), "GestaoPsc", { method: "POST" })).toBe(false);
    expect(require("../db").getPool).not.toHaveBeenCalled();
  });

  test("falha no banco ou no Storage: só avisa no log, nunca lança (a mudança do usuário já foi feita)", async () => {
    calendarioDb.pacotePublicoCompleto.mockRejectedValueOnce(new Error("banco fora"));
    const ctx = contexto();
    await expect(versao.depoisDeMudanca(ctx, "GestaoEventos", { method: "POST" })).resolves.toBe(false);
    expect(ctx.log.warn).toHaveBeenCalledWith(expect.stringContaining("não guardou"), "banco fora");
    versao._zerar();
    storage.salvarJsonPrivado.mockRejectedValueOnce(new Error("storage fora"));
    const ctx2 = contexto();
    await expect(versao.depoisDeMudanca(ctx2, "GestaoEventos", { method: "POST" })).resolves.toBe(false);
    expect(ctx2.log.warn).toHaveBeenCalled();
  });

  test("lerGuardada: só aceita versão no formato de 16 hex; blob ausente ou estranho = null", async () => {
    storage.lerJsonPrivado.mockResolvedValueOnce({ versao: "0123456789abcdef", em: "2026-10-07T10:00:00.000Z", motivo: "x" });
    expect(await versao.lerGuardada()).toEqual({ versao: "0123456789abcdef", em: "2026-10-07T10:00:00.000Z", motivo: "x" });
    storage.lerJsonPrivado.mockResolvedValueOnce({ versao: "<script>" });
    expect(await versao.lerGuardada()).toBeNull();
    storage.lerJsonPrivado.mockRejectedValueOnce(new Error("sem acesso"));
    expect(await versao.lerGuardada()).toBeNull();
  });

  test("guardar recusa versão inválida", async () => {
    await expect(versao.guardar("abc", "x")).rejects.toThrow(/inválida/);
  });

  test("um blob por banco: a homologação (mesmo Storage copiado da produção) nunca sobrescreve a versão da produção", () => {
    const antes = process.env.SQL_CONNECTION_STRING;
    process.env.SQL_CONNECTION_STRING = "Server=tcp:x.database.windows.net,1433;Initial Catalog=app-db-prod;User ID=u;Password=p;";
    expect(versao.nomeDoBlob()).toBe("agenda-publica/versao-app-db-prod.json");
    process.env.SQL_CONNECTION_STRING = "Server=tcp:x.database.windows.net,1433;Initial Catalog=ieadespa-homolog;User ID=u;Password=p;";
    expect(versao.nomeDoBlob()).toBe("agenda-publica/versao-ieadespa-homolog.json");
    delete process.env.SQL_CONNECTION_STRING;
    expect(versao.nomeDoBlob()).toBe("agenda-publica/versao-padrao.json");
    if (antes !== undefined) process.env.SQL_CONNECTION_STRING = antes;
  });
});

describe("ligação com o resto do código", () => {
  test("a entrada única chama o gancho DEPOIS do handler, e só para as três funções da agenda", () => {
    const entrada = fs.readFileSync(path.join(__dirname, "..", "entrada.js"), "utf8");
    const posHandler = entrada.indexOf("await handler(context, ...args)");
    const posGancho = entrada.indexOf("agendaPublicaVersao.depoisDeMudanca(");
    expect(posHandler).toBeGreaterThan(-1);
    expect(posGancho).toBeGreaterThan(posHandler);
    expect([...versao.FUNCOES_QUE_MUDAM_A_AGENDA].sort()).toEqual(["GestaoCalendario", "GestaoCanais", "GestaoEventos"]);
    for (const f of versao.FUNCOES_QUE_MUDAM_A_AGENDA) expect(fs.existsSync(path.join(__dirname, "..", "..", f, "index.js"))).toBe(true);
  });
  test("a rota pública da versão responde pelo blob e a rotina diária regrava com o segredo (texto da AgendaPublica)", () => {
    const codigo = fs.readFileSync(path.join(__dirname, "..", "..", "AgendaPublica", "index.js"), "utf8");
    expect(codigo).toMatch(/agendaVersao\.lerGuardada\(\)/);
    expect(codigo).toMatch(/acao === "atualizar-versao"/);
    expect(codigo).toMatch(/exigirSegredoRotina\(req, context\)/);
    const fj = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "AgendaPublica", "function.json"), "utf8"));
    expect(fj.bindings[0].methods).toEqual(["get", "post"]);
  });
});
