// "Meus Dados" (LGPD art. 18, I): o direito de acesso é do PRÓPRIO titular. Antes (v1.9) a rota era aberta a quem soubesse o número da matrícula; a revisão
// de segurança da v7.5 achou isso ao acrescentar o IP do aceite do voluntariado ao pacote. O pool aqui é mockFila de respostas: importa a ordem das mockConsultas
// (membro, 8 mockConsultas paralelas do cadastro, 6 do voluntariado) e que NADA seja consultado quando o acesso é recusado.
const mockConsultas = [];
let mockFila = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => { mockConsultas.push({ sql: texto, inputs: { ...inputs } }); return { recordset: mockFila.shift() || [] }; } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../storage", () => ({ urlComSas: (u) => u }));

const auth = require("../auth");
const { registrarAuditoria } = require("../auditoria");
const handler = require("../../MeusDadosLGPD/index.js");

const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], ...extra });
async function chamar(matricula, headers) {
  const context = { bindingData: { matricula }, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: "GET", query: {}, headers: headers || {} });
  return context.res;
}

beforeEach(() => { mockConsultas.length = 0; mockFila = []; registrarAuditoria.mockClear(); });

describe("só o próprio titular acessa os próprios dados", () => {
  test("sem sessão: 401, e nada é consultado nem auditado", async () => {
    const r = await chamar("20", {});
    expect(r.status).toBe(401);
    expect(mockConsultas).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("token adulterado ou lixo: 401", async () => {
    for (const t of ["lixo", tokenDe(20) + "x", "a.b.c", ""]) expect((await chamar("20", { "x-auth-token": t })).status).toBe(401);
    expect(mockConsultas).toHaveLength(0);
  });
  test("matrícula de outra pessoa: 403, sem consultar o banco — nem para dizer se ela existe", async () => {
    for (const m of ["21", "1", "999999999"]) {
      const r = await chamar(m, { "x-auth-token": tokenDe(20) });
      expect(r.status).toBe(403);
      expect(JSON.stringify(r.body)).not.toMatch(/não encontrada/i);
    }
    expect(mockConsultas).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("a secretaria, a gestão e quem tem todas as permissões também só veem os próprios dados por esta rota", async () => {
    const t = tokenDe(5, { permissoes: ["pessoas", "escalas", "habilitacao_voluntarios"], escopoCongregacoes: "TODAS", nivel: "CONVENCAO" });
    expect((await chamar("20", { "x-auth-token": t })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("matrícula que não é um inteiro positivo escrito direito: 400, sem consultar", async () => {
    for (const m of ["abc", "1;DROP TABLE X", "0", "-20", "20.0", "2e1", "0x14", " 20", "020", "99999999999999999999"]) {
      expect((await chamar(m, { "x-auth-token": tokenDe(20) })).status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("termos pendentes não impedem o acesso aos próprios dados (o direito não depende de assinar nada)", async () => {
    const r = await chamar("20", { "x-auth-token": tokenDe(20, { termosPendentes: ["CONFIDENCIALIDADE"] }) });
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(403);
  });
});

describe("a própria pessoa recebe o pacote, com o voluntariado", () => {
  test("devolve o cadastro e o bloco de voluntariado (adesão com IP e cadeia, equipes, serviços, remoções sem o motivo escrito)", async () => {
    mockFila = [
      [{ membroId: 20, nome: "Ana Souza", fotoUrl: null }],                                                   // cadastro
      [], [], [], [], [], [], [], [],                                                                          // lideranças... licenças (8)
      [{ AdesaoId: 1, Forma: "CLICKWRAP", TermoVersao: 1, TermoHash: "h".repeat(64), DataAceite: new Date("2026-09-10T00:00:00Z"), AceitoEm: new Date("2026-09-10T14:03:00Z"), EnderecoIp: "177.87.165.132",
        CadeiaCabecalhos: "{\"x-forwarded-for\":\"177.87.165.132:1, 40.70.146.136:2\"}", CanalMensageria: null, Referencia: null, ResponsavelNome: null, ResponsavelVinculo: null, RegistradoPorMembroId: null, RegistradoEm: new Date("2026-09-10T14:03:00Z") }],
      [{ Equipe: "Limpeza", Congregacao: "Central", Ativo: 1, CriadoEm: new Date("2026-01-05T10:00:00Z") }],
      [{ DataHora: new Date("2026-09-12T11:00:00Z"), Descricao: "Limpeza do templo", Equipe: "Limpeza", Status: "CONFIRMADO" }],
      [{ DataInicio: new Date("2026-12-20T00:00:00Z"), DataFim: new Date("2026-12-31T00:00:00Z"), Motivo: "Viagem" }],
      [{ DesligadoEm: new Date("2026-06-01T12:00:00Z"), Equipe: "Limpeza", TipoMotivo: "OUTRO", RemovidoDaEscala: 1, ReintegradoEm: null }],
      [{ Rodizio: "Limpeza do templo", Grupo: "Grupo A", EntrouEm: new Date("2026-02-01T10:00:00Z"), SaiuEm: null }]
    ];
    const r = await chamar("20", { "x-auth-token": tokenDe(20) });
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(true);
    const v = r.body.voluntariado;
    expect(v.adesao).toMatchObject({ forma: "CLICKWRAP", dataAceite: "2026-09-10", enderecoIp: "177.87.165.132", registradaPelaSecretaria: false });
    expect(v.adesao.cadeiaCabecalhos).toContain("177.87.165.132");
    expect(v.equipes).toEqual([expect.objectContaining({ equipe: "Limpeza", congregacao: "Central", ativo: true })]);
    expect(v.servicos).toEqual([expect.objectContaining({ equipe: "Limpeza", situacao: "CONFIRMADO" })]);
    expect(v.indisponibilidades).toEqual([{ dataInicio: "2026-12-20", dataFim: "2026-12-31", motivo: "Viagem" }]);
    expect(v.remocoesDaEscala).toEqual([expect.objectContaining({ tipo: "OUTRO", removidoDaEscala: true, reintegradoEm: null })]);
    expect(v.gruposDeRodizio).toEqual([expect.objectContaining({ rodizio: "Limpeza do templo", grupo: "Grupo A" })]);
    expect(v.aviso).toMatch(/Encarregado/);
    // o texto livre escrito por outras pessoas e a identidade de quem registrou ficam de fora
    expect(JSON.stringify(v)).not.toMatch(/Motivo\b.*remo|registradoPorMembroId|RegistradoPorMembroId/);
    expect(mockConsultas.some(c => /d\.Motivo\b|Motivo AS/.test(c.sql) && /VoluntariosDesligamentos/.test(c.sql))).toBe(false);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
  test("quem nunca foi voluntário recebe o bloco vazio, não um erro", async () => {
    mockFila = [[{ membroId: 20, nome: "Ana Souza", fotoUrl: null }]];
    const r = await chamar("20", { "x-auth-token": tokenDe(20) });
    expect(r.status).toBe(200);
    expect(r.body.voluntariado).toMatchObject({ adesao: null, equipes: [], servicos: [], indisponibilidades: [], remocoesDaEscala: [], gruposDeRodizio: [] });
  });
  test("todas as mockConsultas do voluntariado são pela matrícula da sessão", async () => {
    mockFila = [[{ membroId: 20, nome: "Ana Souza", fotoUrl: null }]];
    await chamar("20", { "x-auth-token": tokenDe(20) });
    const doVol = mockConsultas.filter(c => /VoluntariadoAdesoes|EscalasEquipeMembros|EscalasAlocacoes|EscalasIndisponibilidades|VoluntariosDesligamentos|EscalasRodizioGrupoMembros|VoluntariadoResponsaveis/.test(c.sql));
    expect(doVol).toHaveLength(9);
    for (const c of doVol) expect(c.inputs.m).toBe(20);
  });
});
