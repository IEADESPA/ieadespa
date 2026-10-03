// Rotas de AUTOATENDIMENTO (fecho da v7.5). Antes tratavam a matrícula da URL como a própria pessoa, sem sessão: qualquer um que soubesse o número lia e
// alterava dados de qualquer membro. Agora: sem sessão 401; matrícula malformada 400; matrícula de OUTRA pessoa 403 — sem consultar o banco, e igual para
// matrícula que existe e que não existe. As poucas rotas que a Secretaria também usa (consentimento e PDF da carta) aceitam o titular OU a permissão "pessoas"
// com a congregação da pessoa no escopo.
const consultas = [];
let respostas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => { mockConsultas.push({ sql: texto, inputs: { ...inputs } }); return { recordset: mockRespostas.length ? mockRespostas.shift() : [], rowsAffected: [0] }; } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, salvarFoto: jest.fn(async () => "u"), salvarDocumento: jest.fn(async () => "u") }));
jest.mock("../directusContas", () => ({ garantirContaSite: jest.fn(async () => true) }));
// Os nomes mockConsultas/mockRespostas existem para o jest deixar a fábrica acima enxergá-los.
const mockConsultas = consultas;
let mockRespostas = respostas;

const auth = require("../auth");
const H = {
  lancamentos: require("../../MeusLancamentosTesouraria/index.js"),
  autolanc: require("../../AutolancamentoTesouraria/index.js"),
  foto: require("../../MinhaFoto/index.js"),
  dados: require("../../AtualizarMeusDados/index.js"),
  vinculos: require("../../MeusVinculosFamiliares/index.js"),
  edicao: require("../../SolicitarEdicaoPessoa/index.js"),
  solicitacoes: require("../../MinhasSolicitacoesLGPD/index.js"),
  frequencia: require("../../MinhaFrequencia/index.js"),
  justificativa: require("../../SolicitarJustificativa/index.js"),
  consentimento: require("../../GestaoConsentimentoLGPD/index.js"),
  cartas: require("../../SolicitarCarta/index.js"),
  cartaPdf: require("../../CartaPdf/index.js"),
  radar: require("../../RadarDisciplinar/index.js")
};

const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
async function chamar(handler, { metodo = "GET", ligacao = {}, query = {}, corpo = {}, token } = {}) {
  const context = { bindingData: ligacao, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
beforeEach(() => { consultas.length = 0; respostas.length = 0; });

// [rótulo, handler, como montar a chamada para a matrícula `m`]
const SO_DO_TITULAR = [
  ["MeusLancamentosTesouraria GET", H.lancamentos, (m) => ({ ligacao: { matricula: m } })],
  ["AutolancamentoTesouraria POST", H.autolanc, (m) => ({ metodo: "POST", ligacao: { matricula: m }, corpo: { tipo: "DIZIMO", valor: 10, formaPagamento: "DINHEIRO", mesReferencia: "2026-10" } })],
  ["MinhaFoto GET", H.foto, (m) => ({ ligacao: { matricula: m } })],
  ["MinhaFoto POST", H.foto, (m) => ({ metodo: "POST", ligacao: { matricula: m }, corpo: { fotoBase64: "AAAA", mimeType: "image/png" } })],
  ["AtualizarMeusDados GET", H.dados, (m) => ({ ligacao: { matricula: m } })],
  ["AtualizarMeusDados POST", H.dados, (m) => ({ metodo: "POST", ligacao: { matricula: m }, corpo: { email: "x@y.org" } })],
  ["MeusVinculosFamiliares GET", H.vinculos, (m) => ({ ligacao: { matricula: m } })],
  ["MeusVinculosFamiliares POST", H.vinculos, (m) => ({ metodo: "POST", ligacao: { matricula: m }, corpo: { membroParenteId: 2, tipoVinculoId: 1 } })],
  ["MeusVinculosFamiliares DELETE", H.vinculos, (m) => ({ metodo: "DELETE", ligacao: { matricula: m, id: "3" } })],
  ["SolicitarEdicaoPessoa GET", H.edicao, (m) => ({ ligacao: { matricula: m } })],
  ["SolicitarEdicaoPessoa POST", H.edicao, (m) => ({ metodo: "POST", ligacao: { matricula: m }, corpo: { campos: { dataNascimento: "1990-01-01" } } })],
  ["MinhasSolicitacoesLGPD GET", H.solicitacoes, (m) => ({ ligacao: { matricula: m } })],
  ["MinhasSolicitacoesLGPD POST", H.solicitacoes, (m) => ({ metodo: "POST", ligacao: { matricula: m }, corpo: { tipo: "ACESSO" } })],
  ["MinhaFrequencia GET", H.frequencia, (m) => ({ ligacao: { matricula: m } })],
  ["SolicitarJustificativa POST", H.justificativa, (m) => ({ metodo: "POST", ligacao: { matricula: m, sessaoId: "9" }, corpo: { motivo: "Estava doente" } })],
  ["SolicitarCarta GET (matrícula na query)", H.cartas, (m) => ({ query: { matricula: m } })],
  ["SolicitarCarta POST (matrícula no corpo)", H.cartas, (m) => ({ metodo: "POST", corpo: { matricula: m, tipo: "RECOMENDACAO" } })]
];
const TITULAR_OU_SECRETARIA = [
  ["GestaoConsentimentoLGPD GET", H.consentimento, (m) => ({ ligacao: { matricula: m } })],
  ["GestaoConsentimentoLGPD POST", H.consentimento, (m) => ({ metodo: "POST", ligacao: { matricula: m }, corpo: { tipo: "FOTO", concedido: true } })],
  ["CartaPdf GET", H.cartaPdf, (m) => ({ ligacao: { id: "5" }, query: { matricula: m } })]
];

describe.each([...SO_DO_TITULAR, ...TITULAR_OU_SECRETARIA])("%s", (_rotulo, handler, montar) => {
  test("sem sessão: 401, e nada é consultado", async () => {
    const r = await chamar(handler, montar("20"));
    expect(r.status).toBe(401);
    expect(consultas).toHaveLength(0);
  });
  test("token adulterado ou lixo: 401", async () => {
    for (const token of ["lixo", tokenDe(20) + "x", "a.b.c"]) expect((await chamar(handler, { ...montar("20"), token })).status).toBe(401);
    expect(consultas).toHaveLength(0);
  });
  test("matrícula malformada: 400, nada consultado", async () => {
    for (const m of ["abc", "0x14", "1e1", "20.0", "-20", "0", "020 ", "1;DROP TABLE X", "99999999999999999999"]) {
      const r = await chamar(handler, { ...montar(m), token: tokenDe(20) });
      expect(r.status).toBe(400);
    }
    expect(consultas).toHaveLength(0);
  });
});

describe.each(SO_DO_TITULAR)("%s", (_rotulo, handler, montar) => {
  test("matrícula de OUTRA pessoa: 403 igual para quem existe e para quem não existe, sem consultar o banco", async () => {
    const existente = await chamar(handler, { ...montar("21"), token: tokenDe(20) });
    const inexistente = await chamar(handler, { ...montar("99999999"), token: tokenDe(20) });
    expect(existente.status).toBe(403);
    expect(inexistente.status).toBe(403);
    expect(existente.body).toEqual(inexistente.body);
    expect(consultas).toHaveLength(0);
  });
  test("nem quem tem todas as permissões e escopo total vê os dados de outra pessoa por esta rota", async () => {
    const t = tokenDe(5, { permissoes: ["pessoas", "financeiro", "disciplina", "auditoria"], escopoCongregacoes: "TODAS", nivel: "GLOBAL" });
    expect((await chamar(handler, { ...montar("20"), token: t })).status).toBe(403);
    expect(consultas).toHaveLength(0);
  });
  test("a PRÓPRIA matrícula passa pela guarda (o resto é da regra de cada rota)", async () => {
    const r = await chamar(handler, { ...montar("20"), token: tokenDe(20) });
    expect([401, 403]).not.toContain(r.status);
    expect(r.status).not.toBe(400);
  });
  test("termos pendentes não bloqueiam o dado da própria pessoa", async () => {
    const r = await chamar(handler, { ...montar("20"), token: tokenDe(20, { termosPendentes: ["CONFIDENCIALIDADE"] }) });
    expect([401, 403]).not.toContain(r.status);
  });
});

describe("a matrícula do corpo/da query de SolicitarCarta não vale se não for a da sessão", () => {
  test("GET e POST com a matrícula de outra pessoa: 403", async () => {
    expect((await chamar(H.cartas, { query: { matricula: "21" }, token: tokenDe(20) })).status).toBe(403);
    expect((await chamar(H.cartas, { metodo: "POST", corpo: { matricula: 21, tipo: "RECOMENDACAO" }, token: tokenDe(20) })).status).toBe(403);
    expect((await chamar(H.cartas, { metodo: "POST", corpo: { tipo: "RECOMENDACAO" }, token: tokenDe(20) })).status).toBe(400);      // sem matrícula
  });
});

describe("consentimento LGPD e PDF da carta: o titular, ou a Secretaria com permissão E escopo", () => {
  const secretaria = (extra = {}) => tokenDe(5, { permissoes: ["pessoas"], escopoCongregacoes: ["Central"], ...extra });
  const montarConsent = { metodo: "POST", ligacao: { matricula: "20" }, corpo: { tipo: "FOTO", concedido: true } };

  test("Secretaria com 'pessoas' e a congregação da pessoa no escopo: passa (e o consentimento fica marcado como registrado pela Secretaria)", async () => {
    respostas.push([{ CongregacaoNome: "Central" }], [{ MembroId: 20 }], []);
    const r = await chamar(H.consentimento, { ...montarConsent, token: secretaria() });
    expect(r.status).toBe(200);
    const insercao = consultas.find(c => /INSERT INTO ConsentimentosLGPD/.test(c.sql));
    expect(insercao.inputs.registradoPor).toBe(5);                   // quem está na sessão, não o que o corpo disser
    expect(insercao.inputs.observacao).toMatch(/Registrado pela Secretaria/);
  });
  test("registradoPor, baseLegal e tipo inventados no corpo não valem", async () => {
    respostas.push([{ MembroId: 20 }], []);
    const r = await chamar(H.consentimento, { metodo: "POST", ligacao: { matricula: "20" }, corpo: { tipo: "FOTO", concedido: true, registradoPor: 777, baseLegal: "OUTRA" }, token: tokenDe(20) });
    expect(r.status).toBe(200);
    const insercao = consultas.find(c => /INSERT INTO ConsentimentosLGPD/.test(c.sql));
    expect(insercao.inputs.registradoPor).toBe(20);
    expect(insercao.inputs.baseLegal).toBe("CONSENTIMENTO");
    respostas.push([{ MembroId: 20 }]);
    const tipoRuim = await chamar(H.consentimento, { metodo: "POST", ligacao: { matricula: "20" }, corpo: { tipo: "QUALQUER", concedido: true }, token: tokenDe(20) });
    expect(tipoRuim.status).toBe(400);
    for (const concedido of ["true", 1, null, undefined]) {
      respostas.push([{ MembroId: 20 }]);
      expect((await chamar(H.consentimento, { metodo: "POST", ligacao: { matricula: "20" }, corpo: { tipo: "FOTO", concedido }, token: tokenDe(20) })).status).toBe(400);
    }
  });
  test("congregação da pessoa fora do escopo: 403", async () => {
    respostas.push([{ CongregacaoNome: "Vila Nova" }]);
    expect((await chamar(H.consentimento, { ...montarConsent, token: secretaria() })).status).toBe(403);
  });
  test("pessoa que não existe: 403 (igual a fora do escopo — não revela quem tem cadastro)", async () => {
    respostas.push([]);
    const r = await chamar(H.consentimento, { ...montarConsent, token: secretaria() });
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).not.toMatch(/não encontrada/i);
  });
  test("sem a permissão 'pessoas': 403, sem consultar", async () => {
    expect((await chamar(H.consentimento, { ...montarConsent, token: tokenDe(5, { permissoes: ["financeiro"], escopoCongregacoes: "TODAS" }) })).status).toBe(403);
    expect(consultas).toHaveLength(0);
  });
  test("termos de confidencialidade pendentes: quem acessa dado alheio precisa assinar antes (403 com a lista)", async () => {
    const r = await chamar(H.consentimento, { ...montarConsent, token: secretaria({ termosPendentes: ["CONFIDENCIALIDADE"] }) });
    expect(r.status).toBe(403);
    expect(r.body.termosPendentes).toEqual(["CONFIDENCIALIDADE"]);
  });
  test("PDF da carta: a Secretaria com permissão e escopo chega até a busca da carta; sem permissão, 403", async () => {
    respostas.push([{ CongregacaoNome: "Central" }], []);                              // congregação da pessoa; depois a carta (não existe)
    const ok = await chamar(H.cartaPdf, { ligacao: { id: "5" }, query: { matricula: "20" }, token: secretaria() });
    expect(ok.status).toBe(404);
    const negado = await chamar(H.cartaPdf, { ligacao: { id: "5" }, query: { matricula: "20" }, token: tokenDe(21) });
    expect(negado.status).toBe(403);
  });
  test("PDF da carta: id malformado é 400", async () => {
    expect((await chamar(H.cartaPdf, { ligacao: { id: "abc" }, query: { matricula: "20" }, token: tokenDe(20) })).status).toBe(400);
  });
});

describe("SolicitarJustificativa: reunião e motivo", () => {
  test("reunião malformada, motivo ausente, de outro tipo ou grande demais: 400", async () => {
    const base = { metodo: "POST", token: tokenDe(20) };
    expect((await chamar(H.justificativa, { ...base, ligacao: { matricula: "20", sessaoId: "0x9" }, corpo: { motivo: "ok" } })).status).toBe(400);
    expect((await chamar(H.justificativa, { ...base, ligacao: { matricula: "20", sessaoId: "9" }, corpo: {} })).status).toBe(400);
    expect((await chamar(H.justificativa, { ...base, ligacao: { matricula: "20", sessaoId: "9" }, corpo: { motivo: ["a"] } })).status).toBe(400);
    expect((await chamar(H.justificativa, { ...base, ligacao: { matricula: "20", sessaoId: "9" }, corpo: { motivo: "x".repeat(301) } })).status).toBe(400);
  });
});

describe("RadarDisciplinar", () => {
  const linhas = [{ membroId: 1, nome: "Ana", congregacao: "Central", faltas: 4 }, { membroId: 2, nome: "Beto", congregacao: "Vila Nova", faltas: 3 }];
  test("sem sessão 401; membro comum 403", async () => {
    expect((await chamar(H.radar, {})).status).toBe(401);
    expect((await chamar(H.radar, { token: tokenDe(20) })).status).toBe(403);
    expect(consultas).toHaveLength(0);
  });
  test("com a permissão 'disciplina', só as congregações do escopo", async () => {
    respostas.push(linhas);
    const r = await chamar(H.radar, { token: tokenDe(5, { permissoes: ["disciplina"], escopoCongregacoes: ["Central"] }) });
    expect(r.status).toBe(200);
    expect(r.body.membrosEmRisco.map(x => x.nome)).toEqual(["Ana"]);
  });
  test("escopo total vê todas; órgão malformado é 400", async () => {
    respostas.push(linhas);
    const t = tokenDe(5, { permissoes: ["disciplina"], escopoCongregacoes: "TODAS" });
    expect((await chamar(H.radar, { token: t })).body.membrosEmRisco).toHaveLength(2);
    expect((await chamar(H.radar, { token: t, query: { orgaoId: "0x10" } })).status).toBe(400);
    expect((await chamar(H.radar, { token: t, query: { orgaoId: "abc" } })).status).toBe(400);
  });
});
