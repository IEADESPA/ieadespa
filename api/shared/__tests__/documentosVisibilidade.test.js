// Documentos (atas, termos, memorandos): cada um diz para quem é (PUBLICO, MEMBROS, LIDERANCA); sem login só os públicos; quem registra e quem apaga respeita o escopo.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor, afetadas] of mockRegras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [afetadas === undefined ? 1 : afetadas] };
    return { recordset: [], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../storage", () => ({ urlDocumentoComSas: (u) => `${u}?sas`, salvarDocumento: jest.fn(async () => "https://blob/doc-1.pdf") }));
jest.mock("../escopo", () => ({ ...jest.requireActual("../escopo"), membroAutorizadoNoOrgaoLocal: jest.fn() }));

const auth = require("../auth");
const { registrarAuditoria } = require("../auditoria");
const escopo = require("../escopo");
const storage = require("../storage");
const handler = require("../../GestaoDocumentos/index.js");

const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const token = (extra = {}) => auth.reassinarSessao({ membroId: 5, termosPendentes: [], via: "SENHA", permissoes: ["reunioes"], nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], ...extra });
const GERAL = () => token({ nivel: "GLOBAL", escopoCongregacoes: "TODAS" });
const LOCAL = () => token();
const MEMBRO = () => token({ via: "PIN", permissoes: [], nivel: null, escopoCongregacoes: [] });
let n = 1;
const ip = () => `177.55.${Math.floor(n / 250)}.${(n++ % 250) + 1}:1, 40.70.146.136:2`;
async function chamar({ metodo = "GET", tk, corpo = {}, id, headers } = {}) {
  const context = { bindingData: { id }, log: { error() {} } };
  await handler(context, { method: metodo, query: {}, body: corpo, headers: { "x-forwarded-for": ip(), ...(tk ? { "x-auth-token": tk } : {}), ...(headers || {}) } });
  return context.res;
}
const gravacoes = () => mockConsultas.filter(c => /^\s*(INSERT INTO Documentos|UPDATE Documentos|DELETE FROM Documentos)/.test(c.sql));
const doc = (extra = {}) => ({ documentoId: 1, tipo: "ATA", orgaoId: 2, orgaoNome: "Diretoria", referenciaId: 9, descricao: "Ata", urlBlob: "https://blob/a.pdf", registradoPor: 77, registradoPorNome: "Maria", criadoEm: "2026-01-01T00:00:00", dataSessaoReferencia: null, categoria: null, diasRetencaoPolitica: null, visibilidade: "PUBLICO", ...extra });
const arquivo = { tipo: "ATA", descricao: "Ata da JAI", arquivoBase64: Buffer.from("%PDF-1.4 teste").toString("base64"), mimeType: "application/pdf" };
beforeEach(() => { mockRegras = []; mockConsultas = []; registrarAuditoria.mockClear(); escopo.membroAutorizadoNoOrgaoLocal.mockReset(); storage.salvarDocumento.mockClear(); });

describe("GET: cada um vê o que é para ele", () => {
  const consultaDaLista = () => mockConsultas.find(c => /FROM Documentos d/.test(c.sql)).sql;
  test("sem login: SÓ os públicos (a consulta já filtra no banco) e sem dados internos (quem registrou, ligação com a sessão)", async () => {
    quando(/FROM Documentos d/, [doc()]);
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(consultaDaLista()).toMatch(/d\.Visibilidade IN \('PUBLICO'\)/);
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({ documentoId: 1, tipo: "ATA", descricao: "Ata", urlAssinada: "https://blob/a.pdf?sas", visibilidade: "PUBLICO" });
    for (const campo of ["registradoPor", "registradoPorNome", "referenciaId", "urlBlob"]) expect(r.body[0]).not.toHaveProperty(campo);
  });
  test("membro logado (sessão de PIN): públicos + de membros; vê quem registrou", async () => {
    quando(/FROM Documentos d/, [doc({ visibilidade: "MEMBROS" })]);
    const r = await chamar({ tk: MEMBRO() });
    expect(consultaDaLista()).toMatch(/d\.Visibilidade IN \('PUBLICO', 'MEMBROS'\)/);
    expect(consultaDaLista()).not.toMatch(/LIDERANCA/);
    expect(r.body[0]).toMatchObject({ registradoPorNome: "Maria", referenciaId: 9 });
  });
  test("liderança (entrou com a senha): os três níveis", async () => {
    quando(/FROM Documentos d/, []);
    await chamar({ tk: LOCAL() });
    expect(consultaDaLista()).toMatch(/d\.Visibilidade IN \('PUBLICO', 'MEMBROS', 'LIDERANCA'\)/);
  });
  test("a mesma pessoa que é liderança, mas entrou pelo PIN, vê como membro", async () => {
    quando(/FROM Documentos d/, []);
    await chamar({ tk: token({ via: "PIN", permissoes: [], nivel: null }) });
    expect(consultaDaLista()).not.toMatch(/LIDERANCA/);
  });
  test("token inválido, vencido ou forjado: 401 (a tela precisa pedir o login de novo; não vira 'visitante')", async () => {
    const agora = jest.spyOn(Date, "now");
    try {
      const t0 = Date.now();
      const vencido = LOCAL();                                     // assinado agora...
      agora.mockReturnValue(t0 + 13 * 3600 * 1000);                // ...e visto 13 h depois (a sessão dura 12 h)
      for (const tk of ["lixo.lixo", "x", vencido]) expect((await chamar({ tk })).status).toBe(401);
    } finally { agora.mockRestore(); }
    expect(mockConsultas).toHaveLength(0);
  });
  test("sessão de PIN provisório: 403 (precisa criar o PIN antes)", async () => {
    expect((await chamar({ tk: token({ via: "PIN", permissoes: [], pinProvisorio: true }) })).status).toBe(403);
  });
  test("a lista pública tem limite por origem: depois de 60 consultas no minuto, 429", async () => {
    quando(/FROM Documentos d/, []);
    const mesma = { "x-forwarded-for": "177.99.5.5:1, 40.70.146.136:2" };
    let r;
    for (let i = 0; i < 60; i++) { r = await chamar({ headers: mesma }); expect(r.status).toBe(200); }
    r = await chamar({ headers: mesma });
    expect(r.status).toBe(429);
    expect(Number(r.headers["Retry-After"])).toBeGreaterThan(0);
  });
  test("o filtro de tipo e de órgão continua funcionando junto com a visibilidade", async () => {
    quando(/FROM Documentos d/, []);
    const context = { bindingData: {}, log: { error() {} } };
    await handler(context, { method: "GET", query: { tipo: "ATA", orgaoId: "2" }, body: {}, headers: { "x-forwarded-for": ip() } });
    const s = consultaDaLista();
    expect(s).toMatch(/d\.Tipo = @tipo/);
    expect(s).toMatch(/d\.OrgaoId = @orgaoId/);
    expect(s).toMatch(/d\.Visibilidade IN \('PUBLICO'\)/);
  });
});

describe("POST: quem registra", () => {
  test("sem sessão 401; sessão de PIN 403", async () => {
    expect((await chamar({ metodo: "POST", corpo: arquivo })).status).toBe(401);
    expect((await chamar({ metodo: "POST", tk: MEMBRO(), corpo: arquivo })).status).toBe(403);
    expect(gravacoes()).toHaveLength(0);
  });
  test("o geral registra qualquer documento; sem dizer a visibilidade nasce MEMBROS (o comportamento de sempre)", async () => {
    quando(/INSERT INTO Documentos/, [{ DocumentoId: 31 }]);
    const r = await chamar({ metodo: "POST", tk: GERAL(), corpo: { ...arquivo, orgaoId: 2 } });
    expect(r.status).toBe(201);
    expect(gravacoes()[0].inputs).toMatchObject({ visibilidade: "MEMBROS", orgaoId: 2, registradoPor: 5 });
    expect(registrarAuditoria.mock.calls[0][0].dadosDepois.visibilidade).toBe("MEMBROS");
  });
  test("só o geral publica para todo mundo; o geral publica", async () => {
    quando(/INSERT INTO Documentos/, [{ DocumentoId: 32 }]);
    const r = await chamar({ metodo: "POST", tk: GERAL(), corpo: { ...arquivo, visibilidade: "PUBLICO" } });
    expect(r.status).toBe(201);
    expect(gravacoes()[0].inputs.visibilidade).toBe("PUBLICO");
    mockConsultas = [];
    // o líder local tem escopo VÁLIDO (ata de sessão do órgão local em que atua): o que o barra aqui é só a regra de publicar
    quando(/FROM Sessoes WHERE SessaoId = @id/, [{ OrgaoLocalId: 4 }]);
    escopo.membroAutorizadoNoOrgaoLocal.mockResolvedValue(true);
    const semPublicar = await chamar({ metodo: "POST", tk: LOCAL(), corpo: { ...arquivo, visibilidade: "LIDERANCA", referenciaId: 9 } });
    expect(semPublicar.status).toBe(201);
    mockConsultas = [];
    const local = await chamar({ metodo: "POST", tk: LOCAL(), corpo: { ...arquivo, visibilidade: "PUBLICO", referenciaId: 9 } });
    expect(local.status).toBe(403);
    expect(local.body.mensagem).toMatch(/administração geral publica/);
    expect(gravacoes()).toHaveLength(0);
    expect(storage.salvarDocumento).toHaveBeenCalledTimes(2);          // o do geral e o do local que só mudou a visibilidade; o PUBLICO do local nem chegou ao armazenamento
  });
  test.each(["publico", "SECRETO", "", 1, null, ["PUBLICO"], {}])("visibilidade inválida %p: 400, nada gravado", async (visibilidade) => {
    const r = await chamar({ metodo: "POST", tk: GERAL(), corpo: { ...arquivo, visibilidade } });
    expect(r.status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });
  test("líder local: ata de sessão de órgão LOCAL em que ele atua → registra; o arquivo é salvo", async () => {
    quando(/FROM Sessoes WHERE SessaoId = @id/, [{ OrgaoLocalId: 4 }]);
    quando(/INSERT INTO Documentos/, [{ DocumentoId: 33 }]);
    escopo.membroAutorizadoNoOrgaoLocal.mockResolvedValue(true);
    const r = await chamar({ metodo: "POST", tk: LOCAL(), corpo: { ...arquivo, referenciaId: 9 } });
    expect(r.status).toBe(201);
    expect(escopo.membroAutorizadoNoOrgaoLocal).toHaveBeenCalledTimes(1);
    expect(escopo.membroAutorizadoNoOrgaoLocal.mock.calls[0].slice(2)).toEqual([5, 4]);
    expect(gravacoes()[0].inputs).toMatchObject({ referenciaId: 9, visibilidade: "MEMBROS" });
  });
  test.each([
    ["sessão de OUTRO órgão local (não atua nele)", { corpo: { referenciaId: 9 }, sessao: { OrgaoLocalId: 4 }, autorizado: false }],
    ["sessão de órgão CENTRAL (sem órgão local)", { corpo: { referenciaId: 9 }, sessao: { OrgaoLocalId: null }, autorizado: true }],
    ["sessão que não existe", { corpo: { referenciaId: 9 }, sessao: undefined, autorizado: true }],
    ["órgão central informado no pedido", { corpo: { referenciaId: 9, orgaoId: 2 }, sessao: { OrgaoLocalId: 4 }, autorizado: true }],
    ["documento solto (sem sessão)", { corpo: {}, sessao: { OrgaoLocalId: 4 }, autorizado: true }],
    ["tipo que não é ata", { corpo: { tipo: "TERMO", referenciaId: 9 }, sessao: { OrgaoLocalId: 4 }, autorizado: true }],
    ["referência malformada", { corpo: { referenciaId: "0x9" }, sessao: { OrgaoLocalId: 4 }, autorizado: true }]
  ])("líder local: %s → 403, sem salvar arquivo nem gravar", async (_nome, { corpo, sessao, autorizado }) => {
    quando(/FROM Sessoes WHERE SessaoId = @id/, sessao ? [sessao] : []);
    escopo.membroAutorizadoNoOrgaoLocal.mockResolvedValue(autorizado);
    const r = await chamar({ metodo: "POST", tk: LOCAL(), corpo: { ...arquivo, ...corpo } });
    expect(r.status).toBe(403);
    expect(r.body.mensagem).toBe("Fora do seu escopo de atuação.");
    expect(gravacoes()).toHaveLength(0);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
  });
  test("erro do armazenamento não vaza a mensagem interna", async () => {
    storage.salvarDocumento.mockRejectedValueOnce(new Error("DefaultEndpointsProtocol=https;AccountKey=SEGREDO"));
    const r = await chamar({ metodo: "POST", tk: GERAL(), corpo: arquivo });
    expect(JSON.stringify(r.body)).not.toMatch(/SEGREDO|AccountKey/);
  });
});

describe("PUT e DELETE: só o geral, ou quem registrou o documento", () => {
  beforeEach(() => { quando(/DELETE FROM Documentos/, [], 1); quando(/UPDATE Documentos/, [], 1); });
  const existente = (registradoPor, extra = {}) => quando(/SELECT \* FROM Documentos WHERE DocumentoId = @id/, (i) => (i.id === 1 ? [{ DocumentoId: 1, RegistradoPor: registradoPor, Visibilidade: "MEMBROS", ...extra }] : []));
  test("quem registrou muda a visibilidade (menos para PUBLICO) e apaga o próprio", async () => {
    existente(5);
    const ok = await chamar({ metodo: "PUT", tk: LOCAL(), id: "1", corpo: { visibilidade: "LIDERANCA" } });
    expect(ok.body.sucesso).toBe(true);
    expect(gravacoes()[0].inputs).toMatchObject({ id: 1, v: "LIDERANCA" });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "Alterou a visibilidade do documento", dadosAntes: { visibilidade: "MEMBROS" }, dadosDepois: { visibilidade: "LIDERANCA" } });
    mockConsultas = [];
    const publico = await chamar({ metodo: "PUT", tk: LOCAL(), id: "1", corpo: { visibilidade: "PUBLICO" } });
    expect(publico.status).toBe(403);
    expect(gravacoes()).toHaveLength(0);
    const del = await chamar({ metodo: "DELETE", tk: LOCAL(), id: "1" });
    expect(del.body.sucesso).toBe(true);
    expect(gravacoes()[0].sql).toMatch(/DELETE FROM Documentos/);
  });
  test("documento de OUTRA pessoa e documento que não existe recebem a MESMA resposta; nada é alterado nem apagado", async () => {
    existente(77);
    const alheio = await chamar({ metodo: "DELETE", tk: LOCAL(), id: "1" });
    const inexistente = await chamar({ metodo: "DELETE", tk: LOCAL(), id: "2" });
    expect(alheio.body).toEqual({ sucesso: false, mensagem: "Documento não encontrado." });
    expect(inexistente.body).toEqual(alheio.body);
    const putAlheio = await chamar({ metodo: "PUT", tk: LOCAL(), id: "1", corpo: { visibilidade: "LIDERANCA" } });
    expect(putAlheio.body).toEqual(alheio.body);
    expect(gravacoes()).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("o geral muda e apaga o de qualquer um, e publica", async () => {
    existente(77);
    expect((await chamar({ metodo: "PUT", tk: GERAL(), id: "1", corpo: { visibilidade: "PUBLICO" } })).body.sucesso).toBe(true);
    expect((await chamar({ metodo: "DELETE", tk: GERAL(), id: "1" })).body.sucesso).toBe(true);
    expect(gravacoes().map(g => g.sql.trim().split(" ")[0])).toEqual(["UPDATE", "DELETE"]);
  });
  test("id malformado: 400; visibilidade inválida no PUT: 400; sem sessão 401; PIN 403", async () => {
    existente(5);
    for (const id of ["0x1", "abc", "1e1", "-1", undefined]) expect((await chamar({ metodo: "DELETE", tk: GERAL(), id })).status).toBe(400);
    expect((await chamar({ metodo: "PUT", tk: GERAL(), id: "1", corpo: { visibilidade: "X" } })).status).toBe(400);
    expect((await chamar({ metodo: "DELETE", id: "1" })).status).toBe(401);
    expect((await chamar({ metodo: "PUT", tk: MEMBRO(), id: "1", corpo: { visibilidade: "MEMBROS" } })).status).toBe(403);
    expect(gravacoes()).toHaveLength(0);
  });
});
