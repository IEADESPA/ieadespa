// GestaoVoluntariado — as rotas do responsável legal (fecho da v7.5): quem entra em cada uma e como a entrada malformada é recusada. O banco é um pool que
// responde por TEXTO da consulta; a regra de cada função está em termoMenor.test.js.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [0] };
    return { recordset: [], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));

const auth = require("../auth");
const vol = require("../voluntariado");
const hVol = require("../../GestaoVoluntariado/index.js");

const HOJE_NASC = (anos) => new Date(Date.UTC(new Date().getUTCFullYear() - anos, 0, 1));
const token = (membroId, permissoes = [], extra = {}) => auth.reassinarSessao({ membroId, permissoes, escopoCongregacoes: "TODAS", termosPendentes: [], ...extra });
const CLIENTE = { "x-forwarded-for": "177.87.165.132:24294, 40.70.146.136:36945", "x-azure-clientip": "9.9.9.9" };
async function chamar(metodo, acao, { token: t, corpo, query, headers } = {}) {
  const context = { bindingData: { acao }, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await hVol(context, { method: metodo, query: query || {}, body: corpo === undefined ? {} : corpo, headers: { ...(t ? { "x-auth-token": t } : {}), ...(headers || {}) } });
  return context.res;
}
const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
beforeEach(() => { mockRegras = []; mockConsultas = []; });

describe("aceitar-termo-menor", () => {
  test("sem sessão 401; menorId malformado 400 sem consultar o banco", async () => {
    expect((await chamar("POST", "aceitar-termo-menor", { corpo: { menorId: 30, aceito: true } })).status).toBe(401);
    for (const menorId of [undefined, "abc", "0x1e", 0, -3, "1e1", [30], true, null]) {
      expect((await chamar("POST", "aceitar-termo-menor", { token: token(40), corpo: { menorId, aceito: true }, headers: CLIENTE })).status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("quem não é o responsável cadastrado daquele menor: 403 (e o IP do aceite nem chega a ser considerado)", async () => {
    const r = await chamar("POST", "aceitar-termo-menor", { token: token(40), corpo: { menorId: "30", aceito: true }, headers: CLIENTE });
    expect(r.status).toBe(403);
    expect(r.body.mensagem).toMatch(/responsável cadastrado/);
    expect(mockConsultas.some(c => /INSERT INTO VoluntariadoAdesoes/.test(c.sql))).toBe(false);
  });
  test("o responsável aceita: grava com o IP REAL do responsável (penúltimo do x-forwarded-for), não o x-azure-clientip forjado", async () => {
    quando(/FROM VoluntariadoResponsaveis WHERE MenorMembroId = @mn/, [{ ResponsavelId: 12, Vinculo: "MAE" }]);
    quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id/, (i) => [{ MembroId: i.id, Nome: i.id === 40 ? "Maria" : "Caio", Email: null, DataNascimento: HOJE_NASC(i.id === 40 ? 40 : 14), CongregacaoId: 1, CongregacaoNome: "Central" }]);
    quando(/SELECT TOP 1 \* FROM VoluntariadoAdesoes/, []);
    quando(/INSERT INTO VoluntariadoAdesoes/, [{ id: 9 }]);
    const r = await chamar("POST", "aceitar-termo-menor", { token: token(40), corpo: { menorId: 30, aceito: true }, headers: CLIENTE });
    expect(r.status).toBe(201);
    const ins = mockConsultas.find(c => /INSERT INTO VoluntariadoAdesoes/.test(c.sql));
    expect(ins.inputs).toMatchObject({ m: 30, ip: "177.87.165.132", rs: 40, rn: "Maria", rv: "MAE", v: vol.TERMO_MENOR_VERSAO, h: vol.TERMO_MENOR_HASH });
    expect(JSON.parse(ins.inputs.cad)["x-azure-clientip"]).toBe("9.9.9.9");           // o que foi forjado fica só registrado, para quem examinar depois
  });
  test("sem IP identificável: recusa (422) — o aceite do responsável também é prova de conexão", async () => {
    const r = await chamar("POST", "aceitar-termo-menor", { token: token(40), corpo: { menorId: 30, aceito: true }, headers: { "x-azure-clientip": "177.8.9.10" } });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/IP/);
    expect(mockConsultas).toHaveLength(0);
  });
});

describe("cadastro do responsável pela Secretaria (responsavel, responsavel-revogar, responsaveis)", () => {
  const dados = { menorId: 30, responsavelId: 40, vinculo: "MAE", documento: "Certidão conferida" };
  test("sem a permissão habilitacao_voluntarios: 403 antes de qualquer busca — membro comum, escalas e pessoas não bastam", async () => {
    for (const permissoes of [[], ["escalas"], ["pessoas"], ["financeiro"]]) {
      expect((await chamar("POST", "responsavel", { token: token(5, permissoes), corpo: dados })).status).toBe(403);
      expect((await chamar("POST", "responsavel-revogar", { token: token(5, permissoes), corpo: { responsavelId: 12 } })).status).toBe(403);
      expect((await chamar("GET", "responsaveis", { token: token(5, permissoes), query: { menorId: "30" } })).status).toBe(403);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("sem sessão: 401", async () => {
    expect((await chamar("POST", "responsavel", { corpo: dados })).status).toBe(401);
    expect((await chamar("GET", "responsaveis", { query: { menorId: "30" } })).status).toBe(401);
  });
  test("ids malformados: 400", async () => {
    const t = token(5, ["habilitacao_voluntarios"]);
    for (const [menorId, responsavelId] of [[undefined, 40], [30, undefined], ["abc", 40], [30, "0x28"], [0, 40], [[30], 40]]) {
      expect((await chamar("POST", "responsavel", { token: t, corpo: { ...dados, menorId, responsavelId } })).status).toBe(400);
    }
    expect((await chamar("POST", "responsavel-revogar", { token: t, corpo: { responsavelId: "1e1" } })).status).toBe(400);
    expect((await chamar("GET", "responsaveis", { token: t, query: { menorId: "0x1e" } })).status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
  test("a congregação do MENOR fora do escopo de quem cadastra: 403, e nada é gravado", async () => {
    quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id/, [{ MembroId: 30, Nome: "Caio", DataNascimento: HOJE_NASC(14), CongregacaoId: 2, CongregacaoNome: "Vila Nova" }]);
    const r = await chamar("POST", "responsavel", { token: token(5, ["habilitacao_voluntarios"], { escopoCongregacoes: ["Central"] }), corpo: dados });
    expect(r.status).toBe(403);
    expect(mockConsultas.some(c => /INSERT INTO VoluntariadoResponsaveis/.test(c.sql))).toBe(false);
  });
  test("cadastra: 201 e o vínculo vai maiúsculo para o banco", async () => {
    quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id/, (i) => [{ MembroId: i.id, Nome: i.id === 40 ? "Maria" : "Caio", DataNascimento: HOJE_NASC(i.id === 40 ? 40 : 14), CongregacaoId: 1, CongregacaoNome: "Central" }]);
    quando(/SELECT COUNT\(\*\) AS n FROM VoluntariadoResponsaveis/, [{ n: 0 }]);
    quando(/INSERT INTO VoluntariadoResponsaveis/, [{ id: 12 }]);
    const r = await chamar("POST", "responsavel", { token: token(5, ["habilitacao_voluntarios"]), corpo: { ...dados, vinculo: "mae" } });
    expect(r.status).toBe(201);
    expect(mockConsultas.find(c => /INSERT INTO VoluntariadoResponsaveis/.test(c.sql)).inputs).toMatchObject({ mn: 30, rs: 40, v: "MAE", por: 5 });
  });
});

describe("meu-painel", () => {
  test("quem não é responsável de ninguém não recebe o texto da Autorização, e a lista vem vazia", async () => {
    quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id/, [{ MembroId: 20, Nome: "Ana", DataNascimento: HOJE_NASC(40), CongregacaoId: 1, CongregacaoNome: "Central" }]);
    const r = await chamar("GET", "meu-painel", { token: token(20) });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sucesso: true, menoresSobMinhaResponsabilidade: [], termoMenor: null, meusResponsaveis: [], renovar: false });
  });
  test("o responsável recebe o texto da Autorização (versão, hash, itens) e os menores dele", async () => {
    quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id/, [{ MembroId: 40, Nome: "Maria", DataNascimento: HOJE_NASC(40), CongregacaoId: 1, CongregacaoNome: "Central" }]);
    quando(/FROM VoluntariadoResponsaveis r\s+JOIN MembroReferencia mn/, [{ MenorMembroId: 30, Vinculo: "MAE", Nome: "Caio", DataNascimento: HOJE_NASC(14), AdesaoId: null, Forma: null, DataAceite: null, AdesaoResponsavelNome: null }]);
    const r = await chamar("GET", "meu-painel", { token: token(40) });
    expect(r.body.menoresSobMinhaResponsabilidade).toEqual([expect.objectContaining({ menorId: 30, nome: "Caio", rotuloVinculo: "Mãe", aindaMenor: true, aderiu: false })]);
    expect(r.body.termoMenor).toMatchObject({ versao: vol.TERMO_MENOR_VERSAO, hash: vol.TERMO_MENOR_HASH });
    expect(r.body.termoMenor.itens).toHaveLength(8);
    expect(JSON.stringify(r.body.menoresSobMinhaResponsabilidade)).not.toMatch(/DataNascimento/);
  });
  test("o menor vê quem é o responsável cadastrado dele (nome e vínculo)", async () => {
    quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId = @id/, [{ MembroId: 30, Nome: "Caio", DataNascimento: HOJE_NASC(14), CongregacaoId: 1, CongregacaoNome: "Central" }]);
    quando(/SELECT p\.Nome, r\.Vinculo FROM VoluntariadoResponsaveis r/, [{ Nome: "Maria", Vinculo: "MAE" }]);
    const r = await chamar("GET", "meu-painel", { token: token(30) });
    expect(r.body).toMatchObject({ menorDeIdade: true, podeAderirDigital: false, meusResponsaveis: [{ nome: "Maria", vinculo: "MAE", rotuloVinculo: "Mãe" }] });
  });
});
