// A proposta de reclassificação compulsória depois de arquivar a anterior: a CLI arquiva a proposta para poder reabrir a avaliação que a sustenta; corrigida e
// homologada de novo, ainda reprovada, a proposta nasce outra vez (a arquivada não conta como "já existe"). O banco é simulado por TEXTO da consulta; o
// comportamento contra o SQL Server está em tools/e2e-localdb/e2e-152-acesso.js (seção 4c).
let mockConsultas = [];
jest.mock("../db", () => {
  const novaRequest = () => {
    const entradas = {};
    const r = {
      input: (nome, ...resto) => { entradas[nome] = resto[resto.length - 1]; return r; },
      query: async (texto) => {
        mockConsultas.push({ texto, entradas });
        if (/FROM Congregacoes WHERE CongregacaoId = @id/.test(texto)) return { recordset: [{ CongregacaoId: 7, Nome: "Betel", Ativa: true, Categoria: "CONGREGACAO" }] };
        if (/FROM PscParametros/.test(texto)) return { recordset: [{ PrimeiroExercicio: 2026, PrazoEnvioDias: 90, ExerciciosParaReclassificacao: 2 }] };
        if (/FROM PscAvaliacoes WHERE/.test(texto)) {
          return { recordset: [{ AvaliacaoId: 39, Ano: 2026, Status: "HOMOLOGADA", ReprovadaNivel1: 1 }, { AvaliacaoId: 40, Ano: 2027, Status: "HOMOLOGADA", ReprovadaNivel1: 1 }] };
        }
        if (/INSERT INTO PscReclassificacoes/.test(texto)) return { recordset: [{ ReclassificacaoId: 6 }] };
        return { recordset: [] };
      }
    };
    return r;
  };
  const sql = new Proxy({}, { get: () => () => undefined });
  return { getPool: async () => ({ request: novaRequest }), sql, __novaRequest: novaRequest };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));

const psc = require("../psc");
const pool = { request: require("../db").__novaRequest };

test("a proposta arquivada com o mesmo gatilho não impede a nova; a aberta da congregação continua impedindo", async () => {
  const r = await psc.proporReclassificacaoSeCabivel(pool, { avaliacao: { congregacaoId: 7, ano: 2027 }, reprovadaNivel1: true, membroId: 5 });
  expect(r).toMatchObject({ reclassificacaoId: 6, anoInicial: 2026, anoFinal: 2027 });
  const ja = mockConsultas.find((c) => /SELECT TOP 1 ReclassificacaoId FROM PscReclassificacoes/.test(c.texto));
  expect(ja.texto).toMatch(/AvaliacaoGatilhoId = @av AND Status <> 'ARQUIVADA'/);
  expect(ja.texto).toMatch(/CongregacaoId = @c AND Status IN \('PROPOSTA', 'DECRETADA'\)/);
});
