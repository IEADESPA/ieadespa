// Quem recebe os avisos de uma congregação (psc.resolverDestinatariosDaCongregacao, usado pelo PSC, pela sala infantil, pelo ministério com menores e pelo
// voluntariado): só quem entra no sistema com aquela permissão — rol ATIVO, cargo vigente pelo dia de Brasília e a recertificação da permissão em dia (a
// mesma régua do login). O banco é simulado por TEXTO da consulta; o comportamento contra o SQL Server está em tools/e2e-localdb/e2e-152-acesso.js.
let mockConsultas = [];
jest.mock("../db", () => {
  const novaRequest = () => {
    const entradas = {};
    const r = { input: (nome, ...resto) => { entradas[nome] = resto[resto.length - 1]; return r; },
      query: async (texto) => { mockConsultas.push({ texto, entradas }); return { recordset: /FROM Congregacoes/.test(texto) ? [{ AreaId: 3 }] : [] }; } };
    return r;
  };
  const sql = new Proxy({}, { get: () => () => undefined });
  return { getPool: async () => ({ request: novaRequest }), sql, __novaRequest: novaRequest };
});

const psc = require("../psc");
const pool = { request: require("../db").__novaRequest };
const consultaDaLista = () => mockConsultas.find((c) => /FROM Lideranca l/.test(c.texto));

beforeEach(() => { mockConsultas = []; });

test("só quem está ATIVO no rol recebe", async () => {
  await psc.resolverDestinatariosDaCongregacao(pool, { permissao: "psc_gestao", congregacaoId: 7 });
  expect(consultaDaLista().texto).toMatch(/m\.Status = 'ATIVO'/);
});

test("a recertificação vencida daquela permissão tira a pessoa da lista", async () => {
  await psc.resolverDestinatariosDaCongregacao(pool, { permissao: "psc_gestao", congregacaoId: 7 });
  const c = consultaDaLista();
  expect(c.texto).toMatch(/NOT EXISTS \(SELECT 1 FROM RecertificacoesAcesso r/);
  expect(c.entradas.permissaoNome).toBe("psc_gestao");
});

test("o fim do cargo conta pelo dia de Brasília, não pelo de Greenwich", async () => {
  jest.useFakeTimers({ now: new Date("2026-11-26T01:30:00Z"), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });   // 25/11, 22h30 em Brasília
  try {
    await psc.resolverDestinatariosDaCongregacao(pool, { permissao: "psc_gestao", congregacaoId: 7 });
    const c = consultaDaLista();
    expect(c.entradas.hoje).toBe("2026-11-25");
    expect(c.texto).not.toMatch(/AtivoAte >= CAST\(SYSUTCDATETIME\(\) AS DATE\)/);
  } finally { jest.useRealTimers(); }
});

test("o escopo vazio vale como o de todas as congregações, como no login", async () => {
  await psc.resolverDestinatariosDaCongregacao(pool, { permissao: "psc_homologacao", congregacaoId: 7 });
  expect(consultaDaLista().texto).toMatch(/ISNULL\(l\.EscopoTipo, ''\) IN \('', 'GLOBAL', 'DEPARTAMENTO'\)/);
});

// O resolvedor genérico (shared/notificacoes.js, usado pela AFM, canais, crise, cuidado pastoral, distritos e educação continuada): a mesma régua.
describe("o resolvedor genérico por permissão", () => {
  const notificacoes = require("../notificacoes");
  test("ATIVO no rol, recertificação em dia e o fim do cargo pelo dia de Brasília", async () => {
    jest.useFakeTimers({ now: new Date("2026-11-26T01:30:00Z"), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    try {
      await notificacoes.resolverDestinatariosPorPermissao(pool, { permissao: "canais_gestao" });
      const c = consultaDaLista();
      expect(c.texto).toMatch(/m\.Status = 'ATIVO'/);
      expect(c.texto).toMatch(/NOT EXISTS \(SELECT 1 FROM RecertificacoesAcesso r/);
      expect(c.entradas.permissaoNome).toBe("canais_gestao");
      expect(c.entradas.hoje).toBe("2026-11-25");
      expect(c.texto).not.toMatch(/SYSUTCDATETIME/);
    } finally { jest.useRealTimers(); }
  });
});
