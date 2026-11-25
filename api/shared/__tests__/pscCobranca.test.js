// Quais exercícios do PSC são cobrados (o aviso de "não foi enviada" e o "atrasado" do painel): só o ano que a unidade passou inteiro como congregação. Nem o
// ano da fundação (ou da emancipação), nem os anos sob tutela, do decreto ao restabelecimento, contam (regra do responsável, 25/11/2026). O banco é simulado
// por TEXTO da consulta; o comportamento contra o SQL Server está em tools/e2e-localdb/e2e-152-acesso.js.
let mockConsultas = [];
let mockCongregacoes = [];
jest.mock("../db", () => {
  const novaRequest = () => {
    const entradas = {};
    const r = {
      input: (nome, ...resto) => { entradas[nome] = resto[resto.length - 1]; return r; },
      query: async (texto) => {
        mockConsultas.push({ texto, entradas });
        if (/FROM PscParametros/.test(texto)) return { recordset: [{ PrimeiroExercicio: 2026, PrazoEnvioDias: 90, ExerciciosParaReclassificacao: 2 }] };
        if (/FROM Congregacoes c/.test(texto)) return { recordset: mockCongregacoes };
        return { recordset: [] };
      }
    };
    return r;
  };
  const sql = new Proxy({}, { get: () => () => undefined });
  return { getPool: async () => ({ request: novaRequest }), sql, __novaRequest: novaRequest };
});

const psc = require("../psc");
const pool = { request: require("../db").__novaRequest };

beforeEach(() => { mockConsultas = []; mockCongregacoes = []; });

describe("o aviso de avaliação não enviada", () => {
  test("a busca das pendentes deixa de fora o ano da fundação e os anos sob tutela", async () => {
    await psc.detectarAvaliacoesPendentes(pool, { hoje: "2030-06-01" });
    const buscas = mockConsultas.filter((c) => /FROM Congregacoes c/.test(c.texto));
    expect(buscas.map((c) => c.entradas.ano)).toEqual([2026, 2027, 2028, 2029]);
    for (const c of buscas) {
      expect(c.texto).toMatch(/c\.FundacaoAno IS NULL OR @ano > c\.FundacaoAno/);
      expect(c.texto).toMatch(/rt\.Status = 'REVERTIDA'/);
      expect(c.texto).toMatch(/@ano BETWEEN YEAR\(DATEADD\(hour, -3, rt\.DecididaEm\)\) AND YEAR\(DATEADD\(hour, -3, rt\.RestabelecidaEm\)\)/);
    }
  });
});

describe("o painel do exercício", () => {
  const linha = (cobravel) => ({ CongregacaoId: 7, Nome: "Vila Nova", Categoria: "CONGREGACAO", AreaId: 1, AreaNome: "Área 1", Cobravel: cobravel });

  test("ano que não conta para a unidade aparece como 'não se aplica', não como atrasado", async () => {
    mockCongregacoes = [linha(0)];
    const painel = await psc.montarPainel(pool, { ano: 2028, hoje: "2030-06-01" });
    expect(painel.congregacoes[0].prazo.situacao).toBe("NAO_SE_APLICA");
    expect(painel.resumo.atrasadas).toBe(0);
    const busca = mockConsultas.find((c) => /FROM Congregacoes c/.test(c.texto));
    expect(busca.entradas.ano).toBe(2028);
    expect(busca.texto).toMatch(/AS Cobravel/);
  });

  test("ano que conta e sem avaliação enviada continua atrasado", async () => {
    mockCongregacoes = [linha(1)];
    const painel = await psc.montarPainel(pool, { ano: 2028, hoje: "2030-06-01" });
    expect(painel.congregacoes[0].prazo.situacao).toBe("ATRASADO");
    expect(painel.resumo.atrasadas).toBe(1);
  });
});
