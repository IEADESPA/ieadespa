// Quais exercícios do PSC são cobrados (o aviso de "não foi enviada" e o "atrasado" do painel): só o ano que a unidade passou inteiro como congregação. Nem o
// ano da fundação (ou da emancipação), nem os anos sob tutela, do decreto ao restabelecimento, contam (regra do responsável, 25/11/2026). O banco é simulado
// por TEXTO da consulta; o comportamento contra o SQL Server está em tools/e2e-localdb/e2e-152-acesso.js.
let mockConsultas = [];
let mockCongregacoes = [];
let mockAvaliacoes = [];
let mockReclassificacoes = [];
jest.mock("../db", () => {
  const novaRequest = () => {
    const entradas = {};
    const r = {
      input: (nome, ...resto) => { entradas[nome] = resto[resto.length - 1]; return r; },
      query: async (texto) => {
        mockConsultas.push({ texto, entradas });
        if (/FROM PscParametros/.test(texto)) return { recordset: [{ PrimeiroExercicio: 2026, PrazoEnvioDias: 90, ExerciciosParaReclassificacao: 2 }] };
        if (/FROM PscAvaliacoes a JOIN/.test(texto)) return { recordset: mockAvaliacoes };
        if (/FROM PscReclassificacoes r JOIN/.test(texto)) return { recordset: mockReclassificacoes };
        if (/FROM Congregacoes c/.test(texto)) return { recordset: mockCongregacoes };
        if (/FROM Lideranca l/.test(texto)) return { recordset: [{ membroId: 1, nome: "Gestora", email: null }] };
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

beforeEach(() => { mockConsultas = []; mockCongregacoes = []; mockAvaliacoes = []; mockReclassificacoes = []; });

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

// A avaliação enviada e depois devolvida (ou reaberta) para correção não "deixou de ser enviada": o aviso diz o que aconteceu (Ciclo = quantas vezes foi enviada).
describe("o texto do aviso", () => {
  test("nunca enviada: 'não foi enviada até o prazo'", async () => {
    mockCongregacoes = [{ CongregacaoId: 7, Nome: "Betel", CicloAtual: null }];
    const fatos = await psc.detectarAvaliacoesPendentes(pool, { hoje: "2027-06-01" });
    expect(fatos).toHaveLength(1);
    expect(fatos[0].fatoGerador).toMatch(/A avaliação do PSC 2026 de Betel não foi enviada até 31\/03\/2027/);
  });
  test("enviada e devolvida ou reaberta: o aviso diz que voltou para correção e ainda não foi reenviada", async () => {
    mockCongregacoes = [{ CongregacaoId: 7, Nome: "Betel", CicloAtual: 1 }];
    const fatos = await psc.detectarAvaliacoesPendentes(pool, { hoje: "2027-06-01" });
    expect(fatos).toHaveLength(1);
    expect(fatos[0].fatoGerador).not.toMatch(/não foi enviada/);
    expect(fatos[0].fatoGerador).toMatch(/voltou para correção/);
    expect(fatos[0].fatoGerador).toMatch(/ainda não foi reenviada/);
    expect(mockConsultas.find((c) => /FROM Congregacoes c/.test(c.texto)).texto).toMatch(/AS CicloAtual/);
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

// Os avisos da CLI (avaliação validada para homologar, proposta de reclassificação) vão a quem tem a permissão de homologar E alcança a congregação, como os
// outros avisos do PSC: a mesma lista que a tela mostra a essa pessoa.
describe("os avisos da CLI saem por congregação", () => {
  const permissaoDaLista = () => mockConsultas.filter((c) => /FROM Lideranca l/.test(c.texto)).map((c) => [c.entradas.permissaoNome, c.entradas.congregacaoId]);
  test("avaliação validada: os destinatários de quem homologa naquela congregação", async () => {
    mockAvaliacoes = [{ AvaliacaoId: 31, CongregacaoId: 7, Ano: 2026, Ciclo: 1, Nome: "Betel" }];
    const fatos = await psc.detectarAvaliacoesParaHomologar(pool);
    expect(fatos).toHaveLength(1);
    expect(fatos[0].destinatarios).toEqual([{ membroId: 1, nome: "Gestora", email: null }]);
    expect(permissaoDaLista()).toEqual([["psc_homologacao", 7]]);
    expect(mockConsultas.find((c) => /FROM PscAvaliacoes a/.test(c.texto)).texto).toMatch(/a\.CongregacaoId/);
  });
  test("proposta de reclassificação: os destinatários de quem homologa naquela congregação", async () => {
    mockReclassificacoes = [{ ReclassificacaoId: 4, CongregacaoId: 9, AnoInicial: 2026, AnoFinal: 2027, ExerciciosConsecutivos: 2, Nome: "Vila Nova" }];
    const fatos = await psc.detectarReclassificacoesPropostas(pool);
    expect(fatos).toHaveLength(1);
    expect(fatos[0].destinatarios).toEqual([{ membroId: 1, nome: "Gestora", email: null }]);
    expect(permissaoDaLista()).toEqual([["psc_homologacao", 9]]);
    expect(mockConsultas.find((c) => /FROM PscReclassificacoes r/.test(c.texto)).texto).toMatch(/r\.CongregacaoId/);
  });
});

// A chave do aviso de pendência: um aviso por exercício enquanto nunca foi enviado (a chave de sempre) e um aviso novo a cada volta para correção (o ciclo
// entra na chave), sem colidir com a chave de sempre e sem passar do INT do banco.
describe("a chave do aviso de pendência", () => {
  const chave = async (congregacaoId, cicloAtual) => {
    mockCongregacoes = [{ CongregacaoId: congregacaoId, Nome: "Betel", CicloAtual: cicloAtual }];
    mockConsultas = [];
    return (await psc.detectarAvaliacoesPendentes(pool, { hoje: "2027-06-01" }))[0].referenciaId;
  };
  test("nunca enviada: a chave de sempre (congregação * 10000 + ano)", async () => {
    expect(await chave(7, null)).toBe(72026);
    expect(await chave(7, 0)).toBe(72026);
  });
  test("cada volta para correção tem chave própria, diferente da de sempre e das outras voltas", async () => {
    const chaves = [await chave(7, null), await chave(7, 1), await chave(7, 2), await chave(8, 1)];
    expect(new Set(chaves).size).toBe(4);
    for (const k of chaves) expect(Number.isInteger(k) && k > 0 && k <= 2147483647).toBe(true);
  });
  test("o ciclo e a congregação no limite cabem no INT (o ciclo tem teto: depois de 20 voltas, a chave repete)", async () => {
    const k = await chave(9999, 500);
    expect(Number.isInteger(k) && k > 0 && k <= 2147483647).toBe(true);
    expect(k).toBe(await chave(9999, 20));
    expect(k).not.toBe(await chave(9999, 19));
    expect(k).not.toBe(await chave(9999, null));
  });
});
