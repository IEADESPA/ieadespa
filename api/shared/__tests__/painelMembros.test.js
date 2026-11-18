// FASE 10, passo 7a — o PAINEL executivo do módulo Membros (GET /api/pessoas?resumo=1) e os filtros novos da lista em páginas (?falta=, ?rol=).
// O banco é simulado por TEXTO da consulta (como pessoasEscopoBanco.test.js); a consulta de verdade roda no roteiro ponta a ponta do LocalDB.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return typeof valor === "function" ? valor(inputs) : valor;
    return { recordset: [], recordsets: [[]], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../notificacaoEmail", () => ({ enviarEmailNotificacao: jest.fn(async () => {}) }));
jest.mock("../vacancia", () => ({ encerrarVinculos: jest.fn(async () => {}) }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, urlDocumentoComSas: (u) => u, salvarFoto: jest.fn(), salvarDocumento: jest.fn() }));
jest.mock("../dataBrasilia", () => ({ ...jest.requireActual("../dataBrasilia"), hojeBrasilia: () => "2026-11-18" }));

const auth = require("../auth");
const painel = require("../painelMembros");
const hPessoas = require("../../GestaoPessoas/index.js");

const CONGREGACOES = [{ CongregacaoId: 1, Nome: "Central" }, { CongregacaoId: 2, Nome: "Vila Nova" }];
const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
const rodou = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));
const tokenDe = (extra) => auth.reassinarSessao({ membroId: 5, via: "SENHA", permissoes: ["pessoas"], escopoCongregacoes: [], termosPendentes: [], ...extra });
async function pedir(token, query = {}) {
  const context = { bindingData: {}, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await hPessoas(context, { method: "GET", query, body: {}, headers: { "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000", "x-auth-token": token } });
  return context.res;
}

// as linhas do GROUPING SETS: g* = 1 quando a coluna NÃO está no agrupamento daquela linha
const linhaTotal = { gDep: 1, gCong: 1, gSexo: 1, gFaixa: 1, total: 10, es: 4, aguas: 8, cpf: 7, comunhao: 6, congregado: 3, semComunhao: 1, completo: 5, contato: 9, nasc: 8, depOk: 6, sexoOk: 10 };
const grupo = (qual, nome, total, extra = {}) => ({ gDep: qual === "dep" ? 0 : 1, gCong: qual === "cong" ? 0 : 1, gSexo: qual === "sexo" ? 0 : 1, gFaixa: qual === "faixa" ? 0 : 1,
  dep: qual === "dep" ? nome : null, cong: qual === "cong" ? nome : null, sexo: qual === "sexo" ? nome : null, faixa: qual === "faixa" ? nome : null,
  total, es: 1, aguas: 1, cpf: 1, comunhao: 1, completo: 1, ...extra });
const RESPOSTA = {
  recordset: [],
  recordsets: [
    [linhaTotal, grupo("dep", "Senhoras", 6, { es: 3 }), grupo("dep", "Sem departamento", 4), grupo("cong", "Vila Nova", 10, { congId: 2 }), grupo("sexo", "Mulheres", 7), grupo("sexo", "Homens", 3),
      grupo("faixa", "4", 6), grupo("faixa", "2", 1), grupo("faixa", "6", 3)],
    [{ mes: "2026-11", forma: "BATISMO", n: 2 }, { mes: "2026-11", forma: "CARTA_MUDANCA", n: 1 }, { mes: "2026-08", forma: "BATISMO", n: 4 }, { mes: "2025-01", forma: "BATISMO", n: 9 }],
    [{ mes: "2026-10", n: 1 }]
  ]
};

beforeEach(() => {
  mockRegras = []; mockConsultas = [];
  quando(/SELECT CongregacaoId, Nome FROM Congregacoes/, { recordset: CONGREGACOES });
});

describe("painelMembros (as contas)", () => {
  test("a janela dos 6 meses atravessa a virada do ano", () => {
    expect(painel.janelaSeisMeses("2026-03-10")).toEqual({ desde: "2025-10-01", meses: ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"] });
  });
  test("os números do alto, o que falta, os grupos, os novos do mês e o movimento", () => {
    const r = painel.mapear(RESPOSTA.recordsets, "2026-11-18");
    expect(r).toMatchObject({ total: 10, emComunhao: 6, congregados: 3, semComunhao: 1, semCpf: 3, semNascimento: 2, semContato: 1, semDepartamento: 4, semSexo: 0,
      completos: 5, batizadosEspirito: 4, batizadosAguas: 8, novosNoMes: 3, mesAtual: "2026-11" });
    expect(r.novosPorForma).toEqual([{ forma: "por batismo", n: 2 }, { forma: "por carta", n: 1 }]);
    expect(r.grupos.departamento.map((g) => [g.nome, g.total, g.es])).toEqual([["Senhoras", 6, 3], ["Sem departamento", 4, 1]]);
    expect(r.grupos.sexo.map((g) => g.nome)).toEqual(["Mulheres", "Homens"]);
    expect(r.congregacoes).toEqual([{ congregacaoId: 2, nome: "Vila Nova", total: 10 }]);
    // a faixa de idade em ordem (criança -> 60+ -> sem data), com o nome por extenso
    expect(r.grupos.faixa.map((g) => g.nome)).toEqual(["Adolescentes (12 a 17)", "Adultos (30 a 59)", "Sem data de nascimento"]);
    // fora da janela (2025-01) não conta; agosto e novembro sim; a saída de outubro
    expect(r.movimento).toEqual([
      { mes: "2026-06", entradas: 0, saidas: 0 }, { mes: "2026-07", entradas: 0, saidas: 0 }, { mes: "2026-08", entradas: 4, saidas: 0 },
      { mes: "2026-09", entradas: 0, saidas: 0 }, { mes: "2026-10", entradas: 0, saidas: 1 }, { mes: "2026-11", entradas: 3, saidas: 0 }]);
  });
  test("muitos grupos: os 11 maiores e o resto somado em \"Outros\"", () => {
    const lista = Array.from({ length: 15 }, (_, i) => ({ nome: `C${i}`, total: 100 - i, es: 1, aguas: 0, cpf: 0, comunhao: 0, completo: 0 }));
    const r = painel.limitar(lista);
    expect(r).toHaveLength(12);
    expect(r[11]).toMatchObject({ nome: "Outros (4)", total: 89 + 88 + 87 + 86, es: 4 });
  });
});

describe("GET /api/pessoas?resumo=1", () => {
  test("a congregação: a consulta leva o escopo nas três partes e não traz nome de ninguém", async () => {
    quando(/GROUPING SETS/, RESPOSTA);
    const r = await pedir(tokenDe({ nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"] }), { resumo: "1" });
    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(r.body.sucesso).toBe(true);
    expect(r.body.resumo).toMatchObject({ total: 10, emComunhao: 6, novosNoMes: 3 });
    const q = rodou(/GROUPING SETS/);
    expect(q).toHaveLength(1);
    expect(q[0].sql.match(/OPENJSON\(@escopoIds0\)/g)).toHaveLength(3);
    expect(JSON.parse(q[0].inputs.escopoIds0)).toEqual([2]);
    expect(q[0].inputs).toMatchObject({ hojePainel: "2026-11-18", desdePainel: "2026-06-01" });
    // o rol não conta desligado nem falecido; a contagem não lê o nome nem o CPF de ninguém
    expect(q[0].sql).toMatch(/NOT IN \(N'DESLIGADO', N'FALECIDO'\)/);
    expect(q[0].sql).not.toMatch(/m\.Nome\b/);
    expect(q[0].sql).not.toMatch(/SELECT[^;]*m\.Cpf AS/);
    // a lista de quem está sob disciplina não é lida para o painel
    expect(rodou(/Disciplin/i)).toHaveLength(0);
  });
  test("a Geral: sem filtro de escopo", async () => {
    quando(/GROUPING SETS/, RESPOSTA);
    const r = await pedir(tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }), { resumo: "1" });
    expect(r.body.resumo.total).toBe(10);
    expect(rodou(/GROUPING SETS/)[0].sql).not.toMatch(/OPENJSON/);
  });
  test("?congregacaoId: o painel de uma congregação, com o escopo valendo junto; inválida é recusada", async () => {
    quando(/GROUPING SETS/, RESPOSTA);
    await pedir(tokenDe({ nivel: "AREA", escopoCongregacoes: ["Vila Nova", "Central"] }), { resumo: "1", congregacaoId: "2" });
    const q = rodou(/GROUPING SETS/)[0];
    expect(q.inputs.painelCong).toBe(2);
    expect(q.sql.match(/OPENJSON\(@escopoIds0\)\)\)\) AND m\.CongregacaoId = @painelCong/g)).toHaveLength(3);
    mockConsultas = [];
    await pedir(tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }), { resumo: "1", congregacaoId: "1" });
    expect(rodou(/GROUPING SETS/)[0].sql).toMatch(/NOT IN \(N'DESLIGADO', N'FALECIDO'\) AND m\.CongregacaoId = @painelCong/);
    mockConsultas = [];
    const r = await pedir(tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }), { resumo: "1", congregacaoId: "1 OR 1=1" });
    expect(r.status).toBe(400);
    expect(rodou(/GROUPING SETS/)).toHaveLength(0);
  });
  test("escopo que não alcança ninguém: painel zerado, sem ler o cadastro", async () => {
    const r = await pedir(tokenDe({ nivel: "CONGREGACAO", escopoCongregacoes: [] }), { resumo: "1" });
    expect(r.body.resumo).toMatchObject({ total: 0, novosNoMes: 0, grupos: { departamento: [], congregacao: [], sexo: [], faixa: [] } });
    expect(r.body.resumo.movimento).toHaveLength(6);
    expect(rodou(/FROM MembroReferencia/)).toHaveLength(0);
  });
  test("sem a permissão \"pessoas\": recusado", async () => {
    const token = auth.reassinarSessao({ membroId: 5, via: "SENHA", permissoes: [], escopoCongregacoes: [], termosPendentes: [] });
    const r = await pedir(token, { resumo: "1" });
    expect(r.status).toBe(403);
    expect(rodou(/GROUPING SETS/)).toHaveLength(0);
  });
});

describe("GET /api/pessoas?pagina=N — os filtros do que falta e do rol", () => {
  const respostaPaginada = () => ({ recordset: [{ total: 0 }], recordsets: [[{ total: 0 }], []] });
  test("falta CPF e só o rol: as duas condições vão para o banco", async () => {
    quando(/SELECT COUNT\(\*\) AS total/, respostaPaginada);
    await pedir(tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }), { pagina: "1", falta: "cpf", rol: "1" });
    const q = rodou(/SELECT COUNT\(\*\) AS total/)[0];
    expect(q.sql).toMatch(/\(m\.Cpf IS NULL\) AND ISNULL\(m\.Status, N'ATIVO'\) NOT IN \(N'DESLIGADO', N'FALECIDO'\)/);
  });
  test("o departamento vai para o banco; inválido é recusado", async () => {
    quando(/SELECT COUNT\(\*\) AS total/, respostaPaginada);
    await pedir(tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }), { pagina: "1", departamentoId: "4" });
    const q = rodou(/SELECT COUNT\(\*\) AS total/)[0];
    expect(q.inputs.filtroDep).toBe(4);
    expect(q.sql).toMatch(/m\.DepartamentoId = @filtroDep/);
    const r = await pedir(tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }), { pagina: "1", departamentoId: "x" });
    expect(r.status).toBe(400);
  });
  test("a matrícula exata (a ficha 360): igualdade no banco, nunca o LIKE da busca; inválida é recusada", async () => {
    quando(/SELECT COUNT\(\*\) AS total/, respostaPaginada);
    await pedir(tokenDe({ nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"] }), { pagina: "1", porPagina: "1", matricula: "5" });
    const q = rodou(/SELECT COUNT\(\*\) AS total/)[0];
    expect(q.inputs.filtroMatricula).toBe(5);
    expect(q.sql).toMatch(/m\.MembroId = @filtroMatricula/);
    expect(q.sql).not.toMatch(/LIKE @busca/);
    // o escopo continua valendo junto
    expect(q.sql).toMatch(/OPENJSON\(@escopoIds0\)/);
    const r = await pedir(tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }), { pagina: "1", matricula: "5 OR 1=1" });
    expect(r.status).toBe(400);
  });
  test("só quem saiu", async () => {
    quando(/SELECT COUNT\(\*\) AS total/, respostaPaginada);
    await pedir(tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }), { pagina: "1", rol: "saidas" });
    expect(rodou(/SELECT COUNT\(\*\) AS total/)[0].sql).toMatch(/ISNULL\(m\.Status, N'ATIVO'\) IN \(N'DESLIGADO', N'FALECIDO'\)/);
  });
  test.each(["contato", "nascimento", "departamento", "sexo"])("falta %s é aceito", async (falta) => {
    quando(/SELECT COUNT\(\*\) AS total/, respostaPaginada);
    const r = await pedir(tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }), { pagina: "1", falta });
    expect(r.status).toBe(200);
  });
  test("filtro desconhecido (ou texto de SQL) é recusado sem ler o cadastro", async () => {
    const r = await pedir(tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }), { pagina: "1", falta: "cpf) OR (1=1" });
    expect(r.status).toBe(400);
    expect(rodou(/FROM MembroReferencia/)).toHaveLength(0);
    const r2 = await pedir(tokenDe({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }), { pagina: "1", falta: "constructor" });
    expect(r2.status).toBe(400);
  });
});
