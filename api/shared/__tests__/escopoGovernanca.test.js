// Escopo territorial nas rotas de reuniões, assembleia e governança (decisão do responsável, 02/10/2026): quem tem login de liderança só vê e só altera o que está dentro do seu
// escopo (dirigente: a congregação; pastor de área: a área; e assim sobe), e o nível GERAL (papel Global COM escopo "TODAS") vê tudo. Rotas INSTITUCIONAIS (órgãos centrais,
// Assembleia, cadeiras, comissões, projetos) são só do geral. Fora do escopo = a MESMA resposta de "não existe" (a rota não serve de sonda) e nada é gravado.
// Os handlers são os de verdade; o banco é simulado por TEXTO da consulta (como em revisaoV75.test.js).
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor, afetadas] of mockRegras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs, texto) : valor, rowsAffected: [afetadas === undefined ? 0 : afetadas] };
    return { recordset: [], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../storage", () => ({
  salvarDocumento: jest.fn(async () => "https://blob.exemplo/documentos/doc-1"),
  excluirDocumento: jest.fn(async () => {}),
  urlDocumentoComSas: (u) => `${u}?sas`
}));
jest.mock("../enquetes", () => ({ membrosElegiveis: jest.fn() }));
jest.mock("../universo", () => ({
  composicaoCLI: jest.fn(),
  membrosComCartaMudancaEmitida: jest.fn(async () => new Set()),
  universoDoOrgao: jest.fn(async () => [])
}));
jest.mock("../protocolo", () => ({ gerarProtocolo: jest.fn(async () => "PROJ-2026-0001") }));
jest.mock("../mediacaoArbitragem", () => ({
  ...jest.requireActual("../mediacaoArbitragem"),
  bifurcarParaProcessoDisciplinar: jest.fn(async () => ({ sucesso: true, processoId: 77 }))
}));
jest.mock("../escopo", () => ({
  ...jest.requireActual("../escopo"),
  membroAutorizadoNoOrgaoLocal: jest.fn(async () => false)
}));

const auth = require("../auth");
const storage = require("../storage");
const { membrosElegiveis } = require("../enquetes");
const universo = require("../universo");
const escopoMod = require("../escopo");
const mediacao = require("../mediacaoArbitragem");
const { registrarAuditoria } = require("../auditoria");

const hOrgaos = require("../../GetOrgaos/index.js");
const hConvocar = require("../../ConvocarAssembleia/index.js");
const hAssentos = require("../../GestaoAssentos/index.js");
const hComissoes = require("../../GestaoComissoes/index.js");
const hAnexos = require("../../AnexosGenericos/index.js");
const hCli = require("../../ComposicaoCLI/index.js");
const hCredenciamento = require("../../GestaoCredenciamento/index.js");
const hElegiveis = require("../../GestaoElegiveisAssembleia/index.js");
const hEnquetes = require("../../GestaoEnquetes/index.js");
const hProjetos = require("../../GestaoProjetos/index.js");
const hMediacoes = require("../../GestaoMediacoesArbitragens/index.js");
const hReunioes = require("../../ListarReunioes/index.js");
const hMinuta = require("../../MinutaAta/index.js");

const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const rodou = (padrao) => mockConsultas.filter(c => padrao.test(c.sql));
const nada = () => mockConsultas.length;

// ---- sessões ----
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const GERAL = (permissoes, membroId = 1) => tokenDe(membroId, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes });
const LOCAL = (permissoes, nomes = ["A"], membroId = 5, nivel = "CONGREGACAO") => tokenDe(membroId, { via: "SENHA", nivel, escopoCongregacoes: nomes, permissoes });
const GLOBAL_COM_LISTA = (permissoes) => tokenDe(6, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: ["A"], permissoes });             // papel Global concedido com escopo de uma congregação
const LIDER_DEPARTAMENTO = (permissoes) => tokenDe(7, { via: "SENHA", nivel: "DEPARTAMENTO", escopoCongregacoes: "TODAS", permissoes });     // escopo TODAS, mas não é o geral
const PIN = (membroId = 20) => tokenDe(membroId, { via: "PIN", nivel: null, permissoes: [], escopoCongregacoes: [] });

async function chamar(handler, { metodo = "GET", corpo = {}, token, ligado = {}, query = {} } = {}) {
  const context = { bindingData: ligado, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}

beforeEach(() => {
  mockRegras = [];
  mockConsultas = [];
  jest.clearAllMocks();
  membrosElegiveis.mockImplementation(async () => new Set());
  escopoMod.membroAutorizadoNoOrgaoLocal.mockImplementation(async () => false);
  universo.membrosComCartaMudancaEmitida.mockImplementation(async () => new Set());
  universo.universoDoOrgao.mockImplementation(async () => []);
});

// =====================================================================================================================
// ROTAS INSTITUCIONAIS: só o geral escreve. Papel local (mesmo com a permissão), Global com lista, escopo TODAS sem ser Global e PIN levam 403 ANTES de tocar o banco.
// =====================================================================================================================
const INSTITUCIONAIS = [
  ["GetOrgaos POST", hOrgaos, { metodo: "POST", corpo: { sigla: "NOVO", nome: "Novo órgão" } }, ["pessoas"]],
  ["GetOrgaos DELETE", hOrgaos, { metodo: "DELETE", ligado: { orgaoId: "9" } }, ["pessoas"]],
  ["ConvocarAssembleia POST (convocar)", hConvocar, { metodo: "POST", corpo: { materias: ["APROVACAO_CONTAS"], dataPrevista: "2099-06-10", pauta: "x", senhaAcesso: "abc" } }, ["assembleia"]],
  ["ConvocarAssembleia POST (editar)", hConvocar, { metodo: "POST", ligado: { sessaoId: "10" }, corpo: { materias: ["APROVACAO_CONTAS"], dataPrevista: "2099-06-10", pauta: "x", senhaAcesso: "abc" } }, ["assembleia"]],
  ["ConvocarAssembleia DELETE", hConvocar, { metodo: "DELETE", ligado: { sessaoId: "10" } }, ["assembleia"]],
  ["GestaoAssentos POST (criar cadeira)", hAssentos, { metodo: "POST", corpo: { membroId: 5, orgaoId: 3, tipoAssento: "FUNCAO", cargoOuFuncao: "PRESIDENTE" } }, ["pessoas"]],
  ["GestaoAssentos POST (encerrar cadeira)", hAssentos, { metodo: "POST", ligado: { id: "8", acao: "encerrar" }, corpo: {} }, ["pessoas"]],
  ["GestaoComissoes POST CCJ", hComissoes, { metodo: "POST", ligado: { sigla: "ccj" }, corpo: { membroId: 40 } }, ["pessoas"]],
  ["GestaoComissoes POST PMO", hComissoes, { metodo: "POST", ligado: { sigla: "pmo" }, corpo: { membroId: 40 } }, ["financeiro"]],
  ["GestaoComissoes encerrar CCJ", hComissoes, { metodo: "POST", ligado: { sigla: "ccj", id: "3", acao: "encerrar" }, corpo: {} }, ["pessoas"]],
  ["GestaoCredenciamento POST (credenciar)", hCredenciamento, { metodo: "POST", ligado: { sessaoId: "5" }, corpo: { membroId: 40 } }, ["assembleia", "reunioes"]],
  ["GestaoCredenciamento POST (relatório)", hCredenciamento, { metodo: "POST", ligado: { sessaoId: "5", acao: "relatorio" }, corpo: {} }, ["assembleia", "reunioes"]],
  ["GestaoProjetos POST (urgência)", hProjetos, { metodo: "POST", ligado: { id: "3", acao: "urgencia" }, corpo: {} }, ["reunioes", "cli"]]
];

describe.each(INSTITUCIONAIS)("%s — institucional: só o geral", (_nome, handler, args, permissoes) => {
  test("sem sessão: 401, sem tocar o banco", async () => {
    expect((await chamar(handler, args)).status).toBe(401);
    expect(nada()).toBe(0);
  });
  test("sessão de PIN (permissoes: []): 403, sem tocar o banco", async () => {
    expect((await chamar(handler, { ...args, token: PIN() })).status).toBe(403);
    expect(nada()).toBe(0);
  });
  test.each([
    ["papel local (Dirigente/Pastor de Área) COM a permissão", () => LOCAL(permissoes)],
    ["Pastor de Área com a permissão e escopo de duas congregações", () => LOCAL(permissoes, ["A", "B"], 5, "AREA")],
    ["papel Global concedido com escopo de uma lista", () => GLOBAL_COM_LISTA(permissoes)],
    ["Líder Geral de Departamento (escopo TODAS, nível DEPARTAMENTO)", () => LIDER_DEPARTAMENTO(permissoes)],
    ["papel local com escopo TODAS por esquecimento", () => LOCAL(permissoes, "TODAS")]
  ])("%s: 403 ANTES de tocar o banco", async (_t, token) => {
    const r = await chamar(handler, { ...args, token: token() });
    expect(r.status).toBe(403);
    expect(r.body.sucesso).toBe(false);
    expect(nada()).toBe(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("o geral sem a permissão da rota também é recusado (403, sem banco)", async () => {
    expect((await chamar(handler, { ...args, token: GERAL(["financeiro_x"]) })).status).toBe(403);
    expect(nada()).toBe(0);
  });
  test("o geral COM a permissão passa pela porta (não é 401 nem 403)", async () => {
    let status;
    try { status = (await chamar(handler, { ...args, token: GERAL(permissoes) })).status; } catch (e) { status = 500; }      // com o banco simulado vazio a rota pode estourar depois da porta: o que importa aqui é a porta
    expect([401, 403]).not.toContain(status);
  });
});

// =====================================================================================================================
// GetOrgaos
// =====================================================================================================================
describe("GetOrgaos", () => {
  const orgaoNovo = { orgaoId: 15, sigla: "NOVO", nome: "Novo órgão", quorumMinimoPct: null, quorumDeliberativoPct: null, faltasParaPerdaAssento: null };
  test("GET exige sessão: sem sessão 401 (antes era público); PIN provisório 403; PIN comum e liderança leem", async () => {
    quando(/FROM Orgaos ORDER BY OrgaoId/, [orgaoNovo]);
    expect((await chamar(hOrgaos, {})).status).toBe(401);
    expect(nada()).toBe(0);
    expect((await chamar(hOrgaos, { token: tokenDe(20, { via: "PIN", pinProvisorio: true }) })).status).toBe(403);
    expect(nada()).toBe(0);
    expect((await chamar(hOrgaos, { token: PIN() })).status).toBe(200);
    const r = await chamar(hOrgaos, { token: LOCAL(["pessoas"]) });
    expect(r.status).toBe(200);
    expect(r.body).toEqual([orgaoNovo]);
  });
  test("geral cria órgão novo (sigla livre) e grava; sigla repetida é recusada SEM gravar", async () => {
    quando(/SELECT TOP 1 OrgaoId FROM Orgaos WHERE Sigla/, []);
    quando(/INSERT INTO Orgaos/, [{ OrgaoId: 15 }]);
    quando(/FROM Orgaos WHERE OrgaoId = @id/, [orgaoNovo]);
    const ok = await chamar(hOrgaos, { metodo: "POST", token: GERAL(["pessoas"]), corpo: { sigla: "NOVO", nome: "Novo órgão", quorumMinimoPct: 50 } });
    expect(ok.body.sucesso).toBe(true);
    expect(rodou(/INSERT INTO Orgaos/)).toHaveLength(1);
    expect(rodou(/INSERT INTO Orgaos/)[0].inputs).toMatchObject({ sigla: "NOVO", nome: "Novo órgão", qmin: 50 });

    mockConsultas = []; mockRegras = [];
    quando(/SELECT TOP 1 OrgaoId FROM Orgaos WHERE Sigla/, [{ OrgaoId: 3 }]);
    const repetida = await chamar(hOrgaos, { metodo: "POST", token: GERAL(["pessoas"]), corpo: { sigla: "DIRETORIA_EXECUTIVA", nome: "Falsa diretoria" } });
    expect(repetida.body).toMatchObject({ sucesso: false, mensagem: "Já existe um órgão com essa sigla." });
    expect(rodou(/INSERT INTO Orgaos|UPDATE Orgaos/)).toHaveLength(0);
  });
  test("a sigla de um órgão que o sistema procura pelo texto não pode ser trocada (nada gravado)", async () => {
    quando(/SELECT TOP 1 OrgaoId FROM Orgaos WHERE Sigla/, []);
    quando(/FROM Orgaos WHERE OrgaoId = @id/, [{ orgaoId: 2, sigla: "ASSEMBLEIA_GERAL", nome: "Assembleia" }]);
    const r = await chamar(hOrgaos, { metodo: "POST", token: GERAL(["pessoas"]), corpo: { orgaoId: 2, sigla: "OUTRA", nome: "Assembleia" } });
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/UPDATE Orgaos/)).toHaveLength(0);
  });
  test("quórum fora de 0-100, faltas fora de 1-100, órgão e campos malformados: 400, nada gravado", async () => {
    for (const corpo of [
      { sigla: "X", nome: "Y", quorumMinimoPct: 150 }, { sigla: "X", nome: "Y", quorumDeliberativoPct: -1 }, { sigla: "X", nome: "Y", faltasParaPerdaAssento: 0 },
      { sigla: "X", nome: "Y", faltasParaPerdaAssento: 1.5 }, { sigla: "X", nome: "Y", orgaoId: "0x10" }, { sigla: 5, nome: "Y" }, { sigla: "X".repeat(31), nome: "Y" }
    ]) {
      const r = await chamar(hOrgaos, { metodo: "POST", token: GERAL(["pessoas"]), corpo });
      expect(r.status).toBe(400);
    }
    expect(rodou(/INSERT INTO Orgaos|UPDATE Orgaos/)).toHaveLength(0);
  });
  test("DELETE: geral exclui órgão que não é do sistema; órgão do sistema é recusado; id malformado 400; órgão em uso (chave estrangeira) é recusado com texto amigável", async () => {
    quando(/SELECT OrgaoId AS orgaoId[\s\S]*FROM Orgaos WHERE OrgaoId = @id/, [{ orgaoId: 9, sigla: "NOVO", nome: "Novo" }]);
    quando(/DELETE FROM Orgaos/, [], 1);
    const ok = await chamar(hOrgaos, { metodo: "DELETE", token: GERAL(["pessoas"]), ligado: { orgaoId: "9" } });
    expect(ok.body.sucesso).toBe(true);
    expect(rodou(/DELETE FROM Orgaos/)).toHaveLength(1);

    mockConsultas = []; mockRegras = [];
    quando(/SELECT OrgaoId AS orgaoId[\s\S]*FROM Orgaos WHERE OrgaoId = @id/, [{ orgaoId: 2, sigla: "CLI", nome: "CLI" }]);
    const sistema = await chamar(hOrgaos, { metodo: "DELETE", token: GERAL(["pessoas"]), ligado: { orgaoId: "2" } });
    expect(sistema.body.sucesso).toBe(false);
    expect(rodou(/DELETE FROM Orgaos/)).toHaveLength(0);

    expect((await chamar(hOrgaos, { metodo: "DELETE", token: GERAL(["pessoas"]), ligado: { orgaoId: "abc" } })).status).toBe(400);

    mockConsultas = []; mockRegras = [];
    quando(/SELECT OrgaoId AS orgaoId[\s\S]*FROM Orgaos WHERE OrgaoId = @id/, [{ orgaoId: 9, sigla: "NOVO", nome: "Novo" }]);
    quando(/DELETE FROM Orgaos/, () => { throw Object.assign(new Error("fk"), { number: 547 }); });
    const emUso = await chamar(hOrgaos, { metodo: "DELETE", token: GERAL(["pessoas"]), ligado: { orgaoId: "9" } });
    expect(emUso.status).toBe(200);
    expect(emUso.body.sucesso).toBe(false);
  });
});

// =====================================================================================================================
// ConvocarAssembleia
// =====================================================================================================================
describe("ConvocarAssembleia", () => {
  const corpoValido = { materias: ["APROVACAO_CONTAS"], dataPrevista: "2099-06-10", pauta: "Contas do exercício", senhaAcesso: "abc123" };
  beforeEach(() => quando(/FROM Orgaos WHERE Sigla = 'ASSEMBLEIA_GERAL'/, [{ orgaoId: 4 }]));

  test("GET segue para quem tem 'assembleia' (Pastor de Área lê as convocações); sem a permissão 403; sem sessão 401", async () => {
    quando(/FROM Sessoes WHERE OrgaoId = @orgaoId AND Status = 'CONVOCADA'/, [{ sessaoId: 10 }]);
    const r = await chamar(hConvocar, { token: LOCAL(["assembleia"], ["A", "B"], 5, "AREA") });
    expect(r.status).toBe(200);
    expect(r.body).toEqual([{ sessaoId: 10 }]);
    expect((await chamar(hConvocar, { token: LOCAL(["reunioes"]) })).status).toBe(403);
    expect((await chamar(hConvocar, {})).status).toBe(401);
  });
  test("geral convoca: grava a convocação e audita", async () => {
    quando(/INSERT INTO Sessoes/, [{ SessaoId: 31 }]);
    const r = await chamar(hConvocar, { metodo: "POST", token: GERAL(["assembleia"]), corpo: corpoValido });
    expect(r.status).toBe(201);
    expect(rodou(/INSERT INTO Sessoes/)).toHaveLength(1);
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ tabela: "Sessoes", acao: "Convocou Assembleia Geral", usuarioId: 1 });
  });
  test("geral edita só convocação DA Assembleia e ainda CONVOCADA: o UPDATE exige Status CONVOCADA", async () => {
    quando(/FROM Sessoes WHERE SessaoId = @id AND OrgaoId = @orgaoId/, [{ sessaoId: 10, status: "CONVOCADA" }]);
    quando(/UPDATE Sessoes SET/, [], 1);
    const r = await chamar(hConvocar, { metodo: "POST", token: GERAL(["assembleia"]), ligado: { sessaoId: "10" }, corpo: corpoValido });
    expect(r.body.sucesso).toBe(true);
    const upd = rodou(/UPDATE Sessoes SET/);
    expect(upd).toHaveLength(1);
    expect(upd[0].sql).toMatch(/Status = 'CONVOCADA'/);
    expect(rodou(/FROM Sessoes WHERE SessaoId = @id AND OrgaoId = @orgaoId/)[0].inputs).toMatchObject({ id: 10, orgaoId: 4 });
  });
  test("cancelar: só a convocação da Assembleia; sessão de outro órgão, já iniciada ou id malformado: 'não encontrada' e NADA é apagado", async () => {
    quando(/FROM Sessoes WHERE SessaoId = @id AND OrgaoId = @orgaoId/, [{ sessaoId: 10, status: "CONVOCADA" }]);
    quando(/DELETE FROM Sessoes/, [], 1);
    const ok = await chamar(hConvocar, { metodo: "DELETE", token: GERAL(["assembleia"]), ligado: { sessaoId: "10" } });
    expect(ok.body.sucesso).toBe(true);
    expect(rodou(/DELETE FROM Sessoes/)[0].sql).toMatch(/Status = 'CONVOCADA'/);

    for (const [regraSessao, ligado] of [[[], { sessaoId: "11" }], [[{ sessaoId: 12, status: "ABERTA" }], { sessaoId: "12" }], [[], { sessaoId: "abc" }]]) {
      mockConsultas = []; mockRegras = [];
      quando(/FROM Orgaos WHERE Sigla = 'ASSEMBLEIA_GERAL'/, [{ orgaoId: 4 }]);
      quando(/FROM Sessoes WHERE SessaoId = @id AND OrgaoId = @orgaoId/, regraSessao);
      const r = await chamar(hConvocar, { metodo: "DELETE", token: GERAL(["assembleia"]), ligado });
      expect(r.status).toBe(200);
      expect(r.body.sucesso).toBe(false);
      expect(rodou(/DELETE FROM Sessoes/)).toHaveLength(0);
    }
    mockConsultas = [];
    const semId = await chamar(hConvocar, { metodo: "DELETE", token: GERAL(["assembleia"]), ligado: {} });
    expect(semId.status).toBe(400);
    expect(rodou(/DELETE FROM Sessoes/)).toHaveLength(0);
  });
});

// =====================================================================================================================
// GestaoAssentos
// =====================================================================================================================
describe("GestaoAssentos", () => {
  test("GET segue para 'pessoas' (inclusive local); filtro malformado: 400", async () => {
    quando(/FROM Assentos a\s+JOIN MembroReferencia/, [{ assentoId: 8, dataFim: null }]);
    const r = await chamar(hAssentos, { token: LOCAL(["pessoas"]) });
    expect(r.status).toBe(200);
    expect((await chamar(hAssentos, { token: LOCAL(["pessoas"]), query: { orgaoId: "abc" } })).status).toBe(400);
    expect((await chamar(hAssentos, { token: LOCAL(["reunioes"]) })).status).toBe(403);
  });
  test("geral cria a cadeira (grava membro, órgão e duração) e audita", async () => {
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, [{ MembroId: 40 }]);
    quando(/SELECT OrgaoId, Sigla FROM Orgaos WHERE OrgaoId = @id/, [{ OrgaoId: 3, Sigla: "CLI" }]);
    quando(/INSERT INTO Assentos/, [{ AssentoId: 8 }]);
    quando(/FROM Assentos a\s+JOIN MembroReferencia[\s\S]*WHERE a\.AssentoId = @id/, [{ assentoId: 8 }]);
    const r = await chamar(hAssentos, { metodo: "POST", token: GERAL(["pessoas"]), corpo: { membroId: "40", orgaoId: "3", tipoAssento: "FUNCAO", cargoOuFuncao: "Membro", duracaoMeses: 12 } });
    expect(r.status).toBe(201);
    const ins = rodou(/INSERT INTO Assentos/);
    expect(ins).toHaveLength(1);
    expect(ins[0].inputs).toMatchObject({ membroId: 40, orgaoId: 3, duracaoMeses: 12 });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ tabela: "Assentos", acao: "Criou cadeira", usuarioId: 1 });
  });
  test("mandato negativo/gigante, data fora do formato e ids malformados: recusados e nada gravado", async () => {
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, [{ MembroId: 40 }]);
    quando(/SELECT OrgaoId, Sigla FROM Orgaos WHERE OrgaoId = @id/, [{ OrgaoId: 3, Sigla: "CLI" }]);
    const base = { membroId: 40, orgaoId: 3, tipoAssento: "FUNCAO" };
    for (const extra of [{ duracaoMeses: -3 }, { duracaoMeses: 0 }, { duracaoMeses: 601 }, { duracaoMeses: 1.5 }, { dataInicio: "10/01/2026" }, { dataInicio: "2026-13-45" }]) {
      expect((await chamar(hAssentos, { metodo: "POST", token: GERAL(["pessoas"]), corpo: { ...base, ...extra } })).status).toBe(400);
    }
    const membroRuim = await chamar(hAssentos, { metodo: "POST", token: GERAL(["pessoas"]), corpo: { ...base, membroId: "0x10" } });
    expect(membroRuim.body).toMatchObject({ sucesso: false, mensagem: "Matrícula não encontrada." });
    const orgaoRuim = await chamar(hAssentos, { metodo: "POST", token: GERAL(["pessoas"]), corpo: { ...base, orgaoId: "1e1" } });
    expect(orgaoRuim.body).toMatchObject({ sucesso: false, mensagem: "Órgão inválido." });
    expect(rodou(/INSERT INTO Assentos/)).toHaveLength(0);
  });
  test("geral encerra cadeira ativa (UPDATE só em cadeira sem DataFim); id malformado ou cadeira inexistente: 'não encontrada', nada gravado", async () => {
    quando(/SELECT \* FROM Assentos WHERE AssentoId = @id/, [{ AssentoId: 8, DataFim: null }]);
    quando(/UPDATE Assentos SET DataFim/, [], 1);
    const ok = await chamar(hAssentos, { metodo: "POST", token: GERAL(["pessoas"]), ligado: { id: "8", acao: "encerrar" }, corpo: { motivoEncerramento: "Fim do mandato" } });
    expect(ok.body.sucesso).toBe(true);
    const upd = rodou(/UPDATE Assentos SET DataFim/);
    expect(upd).toHaveLength(1);
    expect(upd[0].inputs).toMatchObject({ id: 8, motivo: "Fim do mandato" });
    expect(upd[0].sql).toMatch(/DataFim IS NULL/);

    mockConsultas = [];
    const malformado = await chamar(hAssentos, { metodo: "POST", token: GERAL(["pessoas"]), ligado: { id: "abc", acao: "encerrar" }, corpo: {} });
    expect(malformado.body).toMatchObject({ sucesso: false, mensagem: "Cadeira não encontrada." });
    expect(rodou(/UPDATE Assentos/)).toHaveLength(0);
  });
});

// =====================================================================================================================
// GestaoComissoes
// =====================================================================================================================
describe("GestaoComissoes", () => {
  test("GET segue para quem tem as permissões de hoje (local com 'reunioes' lê); sem permissão 403", async () => {
    quando(/FROM ComissaoMembros c/, []);
    quando(/FROM Assentos a/, []);
    const r = await chamar(hComissoes, { token: LOCAL(["reunioes"]) });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ CCJ: [], CFO: [], CEP: [], PMO: [] });
    expect((await chamar(hComissoes, { token: LOCAL(["financeiro"]) })).status).toBe(403);
  });
  test("geral adiciona membro à CCJ (pessoas) e à PMO (financeiro): grava; matrícula malformada = 'não encontrada' sem gravar", async () => {
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, [{ MembroId: 40 }]);
    quando(/FROM ComissaoMembros c/, []);
    quando(/INSERT INTO ComissaoMembros/, [{ ComissaoMembroId: 3 }]);
    const ccj = await chamar(hComissoes, { metodo: "POST", token: GERAL(["pessoas"]), ligado: { sigla: "ccj" }, corpo: { membroId: "40" } });
    expect(ccj.status).toBe(201);
    expect(rodou(/INSERT INTO ComissaoMembros/)[0].inputs).toMatchObject({ sigla: "CCJ", membroId: 40 });
    const pmo = await chamar(hComissoes, { metodo: "POST", token: GERAL(["financeiro"]), ligado: { sigla: "pmo" }, corpo: { membroId: 40 } });
    expect(pmo.status).toBe(201);
    expect(rodou(/INSERT INTO ComissaoMembros/)[1].inputs).toMatchObject({ sigla: "PMO", membroId: 40 });

    mockConsultas = [];
    const ruim = await chamar(hComissoes, { metodo: "POST", token: GERAL(["pessoas"]), ligado: { sigla: "ccj" }, corpo: { membroId: "0x10" } });
    expect(ruim.body).toMatchObject({ sucesso: false, mensagem: "Matrícula não encontrada." });
    expect(rodou(/INSERT INTO ComissaoMembros/)).toHaveLength(0);
  });
  test("geral encerra membro (UPDATE só em quem não saiu); id malformado: 'não encontrado', nada gravado", async () => {
    quando(/SELECT \* FROM ComissaoMembros WHERE ComissaoMembroId = @id AND Sigla = @sigla/, [{ ComissaoMembroId: 3, DataFim: null }]);
    quando(/UPDATE ComissaoMembros SET DataFim/, [], 1);
    const ok = await chamar(hComissoes, { metodo: "POST", token: GERAL(["pessoas"]), ligado: { sigla: "ccj", id: "3", acao: "encerrar" }, corpo: {} });
    expect(ok.body.sucesso).toBe(true);
    expect(rodou(/UPDATE ComissaoMembros SET DataFim/)[0].sql).toMatch(/DataFim IS NULL/);
    mockConsultas = [];
    const ruim = await chamar(hComissoes, { metodo: "POST", token: GERAL(["pessoas"]), ligado: { sigla: "ccj", id: "x", acao: "encerrar" }, corpo: {} });
    expect(ruim.body.sucesso).toBe(false);
    expect(rodou(/UPDATE ComissaoMembros/)).toHaveLength(0);
  });
  test("sigla numérica na URL não derruba a rota (o Azure entrega /comissoes/1 como número)", async () => {
    expect((await chamar(hComissoes, { metodo: "POST", token: GERAL(["pessoas"]), ligado: { sigla: 1 }, corpo: {} })).status).toBe(400);
  });
});

// =====================================================================================================================
// AnexosGenericos — o anexo herda a regra do registro-pai
// =====================================================================================================================
describe("AnexosGenericos", () => {
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n").toString("base64");
  const envio = (extra = {}) => ({ tabela: "Projetos", registroId: 3, nomeArquivo: "parecer.pdf", mimeType: "application/pdf", documentoBase64: pdf, ...extra });
  const FORA = { sucesso: false, mensagem: "Fora do seu escopo de atuação." };
  const anexoLinha = { AnexoId: 1, NomeArquivo: "a.pdf", Url: "https://blob.exemplo/documentos/doc-9", MimeType: "application/pdf", CriadoEm: "2026-01-01", Categoria: null };
  const pessoaPorMatricula = () => quando(/c\.Nome AS CongregacaoNome/, (i) => (i.id === 40 ? [{ MembroId: 40, Nome: "Ana", Status: "ATIVO", CongregacaoNome: "A" }] : i.id === 41 ? [{ MembroId: 41, Nome: "Beto", Status: "ATIVO", CongregacaoNome: "B" }] : []));

  test("sem sessão 401; PIN sem permissão 403 (nada lido); tabela desconhecida ou hostil ('__proto__', 'constructor'): 400, nunca 500", async () => {
    expect((await chamar(hAnexos, { query: { tabela: "Projetos", registroId: "3" } })).status).toBe(401);
    expect((await chamar(hAnexos, { token: PIN(), query: { tabela: "Projetos", registroId: "3" } })).status).toBe(403);
    expect(nada()).toBe(0);
    for (const tabela of ["Outra", "__proto__", "constructor", "toString", "hasOwnProperty", "ProcessosDisciplinares"]) {
      const r = await chamar(hAnexos, { token: GERAL(["reunioes", "financeiro", "disciplina", "ouvidoria"]), query: { tabela, registroId: "3" } });
      expect(r.status).toBe(400);
    }
    expect(nada()).toBe(0);
  });
  test("registroId malformado: 400 sem consultar o banco", async () => {
    for (const registroId of ["abc", "0", "05", "0x10", "1e1", "-3"]) {
      expect((await chamar(hAnexos, { token: GERAL(["reunioes"]), query: { tabela: "Projetos", registroId } })).status).toBe(400);
    }
    expect(nada()).toBe(0);
  });

  describe("Projetos (institucional): lê quem tem a permissão da tabela; escreve só o geral", () => {
    beforeEach(() => quando(/SELECT ProjetoId FROM Projetos WHERE ProjetoId = @id/, (i) => (i.id === 3 ? [{ ProjetoId: 3 }] : [])));
    test("local com 'reunioes' lista os anexos de projeto existente; projeto inexistente = 403 'fora do escopo'", async () => {
      quando(/FROM AnexosGenericos a LEFT JOIN PoliticasRetencao/, [anexoLinha]);
      const ok = await chamar(hAnexos, { token: LOCAL(["reunioes"]), query: { tabela: "Projetos", registroId: "3" } });
      expect(ok.status).toBe(200);
      expect(ok.body[0]).toMatchObject({ anexoId: 1, urlAssinada: `${anexoLinha.Url}?sas` });
      const inexistente = await chamar(hAnexos, { token: LOCAL(["reunioes"]), query: { tabela: "Projetos", registroId: "999" } });
      expect(inexistente.status).toBe(403);
      expect(inexistente.body).toEqual(FORA);
    });
    test("local com 'reunioes' NÃO envia nem apaga: 403 antes de gravar no armazenamento ou no banco", async () => {
      const envia = await chamar(hAnexos, { metodo: "POST", token: LOCAL(["reunioes"]), corpo: envio() });
      expect(envia.status).toBe(403);
      expect(storage.salvarDocumento).not.toHaveBeenCalled();
      expect(rodou(/INSERT INTO AnexosGenericos/)).toHaveLength(0);

      quando(/SELECT Tabela, RegistroId, NomeArquivo, Url FROM AnexosGenericos/, [{ Tabela: "Projetos", RegistroId: 3, NomeArquivo: "a.pdf", Url: "https://blob.exemplo/documentos/doc-9" }]);
      const apaga = await chamar(hAnexos, { metodo: "DELETE", token: LOCAL(["reunioes"]), ligado: { id: "1" } });
      expect(apaga.status).toBe(403);
      expect(apaga.body).toEqual(FORA);
      expect(rodou(/DELETE FROM AnexosGenericos/)).toHaveLength(0);
      expect(storage.excluirDocumento).not.toHaveBeenCalled();
    });
    test("Líder de Departamento (TODAS, nível DEPARTAMENTO) e Global com lista também não escrevem", async () => {
      for (const token of [LIDER_DEPARTAMENTO(["reunioes"]), GLOBAL_COM_LISTA(["reunioes"])]) {
        expect((await chamar(hAnexos, { metodo: "POST", token, corpo: envio() })).status).toBe(403);
      }
      expect(storage.salvarDocumento).not.toHaveBeenCalled();
    });
    test("geral envia (arquivo vai ao armazenamento, linha gravada, trilha) e apaga (linha e arquivo, trilha com o antes)", async () => {
      quando(/INSERT INTO AnexosGenericos/, [{ AnexoId: 12 }]);
      const envia = await chamar(hAnexos, { metodo: "POST", token: GERAL(["reunioes"]), corpo: envio() });
      expect(envia.status).toBe(201);
      expect(storage.salvarDocumento).toHaveBeenCalledTimes(1);
      expect(rodou(/INSERT INTO AnexosGenericos/)[0].inputs).toMatchObject({ tabela: "Projetos", registroId: 3, nomeArquivo: "parecer.pdf", por: 1 });

      quando(/SELECT Tabela, RegistroId, NomeArquivo, Url FROM AnexosGenericos/, [{ Tabela: "Projetos", RegistroId: 3, NomeArquivo: "a.pdf", Url: "https://blob.exemplo/documentos/doc-9" }]);
      quando(/DELETE FROM AnexosGenericos/, [], 1);
      const apaga = await chamar(hAnexos, { metodo: "DELETE", token: GERAL(["reunioes"]), ligado: { id: "1" } });
      expect(apaga.body.sucesso).toBe(true);
      expect(storage.excluirDocumento).toHaveBeenCalledWith("https://blob.exemplo/documentos/doc-9");
      expect(registrarAuditoria.mock.calls.pop()[0]).toMatchObject({ acao: "Excluiu anexo", dadosAntes: { tabela: "Projetos", registroId: 3, nomeArquivo: "a.pdf" } });
    });
    test("anexo em projeto que não existe: recusado (403 igual) e nada vai ao armazenamento", async () => {
      const r = await chamar(hAnexos, { metodo: "POST", token: GERAL(["reunioes"]), corpo: envio({ registroId: 999 }) });
      expect(r.status).toBe(403);
      expect(r.body).toEqual(FORA);
      expect(storage.salvarDocumento).not.toHaveBeenCalled();
    });
  });

  describe("Fornecedores (dados bancários): ler e escrever só o geral", () => {
    beforeEach(() => quando(/SELECT FornecedorId FROM Fornecedores WHERE FornecedorId = @id/, [{ FornecedorId: 3 }]));
    test("Tesoureiro Local (financeiro) não lista, não envia e não apaga; o geral sim", async () => {
      expect((await chamar(hAnexos, { token: LOCAL(["financeiro"]), query: { tabela: "Fornecedores", registroId: "3" } })).status).toBe(403);
      expect((await chamar(hAnexos, { metodo: "POST", token: LOCAL(["financeiro"]), corpo: envio({ tabela: "Fornecedores" }) })).status).toBe(403);
      quando(/SELECT Tabela, RegistroId, NomeArquivo, Url FROM AnexosGenericos/, [{ Tabela: "Fornecedores", RegistroId: 3, NomeArquivo: "c.pdf", Url: "https://blob.exemplo/documentos/doc-3" }]);
      expect((await chamar(hAnexos, { metodo: "DELETE", token: LOCAL(["financeiro"]), ligado: { id: "1" } })).status).toBe(403);
      expect(storage.salvarDocumento).not.toHaveBeenCalled();
      expect(rodou(/INSERT INTO AnexosGenericos|DELETE FROM AnexosGenericos/)).toHaveLength(0);

      quando(/FROM AnexosGenericos a LEFT JOIN PoliticasRetencao/, [anexoLinha]);
      const lista = await chamar(hAnexos, { token: GERAL(["financeiro"]), query: { tabela: "Fornecedores", registroId: "3" } });
      expect(lista.status).toBe(200);
    });
  });

  describe("ProcedimentosAbandono (pessoa): a pessoa do procedimento precisa estar no escopo", () => {
    beforeEach(() => {
      quando(/SELECT ProcedimentoId, MembroId FROM ProcedimentosAbandono WHERE ProcedimentoId = @id/, (i) => (i.id === 4 ? [{ ProcedimentoId: 4, MembroId: 40 }] : i.id === 5 ? [{ ProcedimentoId: 5, MembroId: 41 }] : []));
      pessoaPorMatricula();
    });
    test("Membro da JAI da congregação A lista o procedimento de uma pessoa de A; o de B e o inexistente dão a MESMA resposta", async () => {
      quando(/FROM AnexosGenericos a LEFT JOIN PoliticasRetencao/, [anexoLinha]);
      const dentro = await chamar(hAnexos, { token: LOCAL(["disciplina"]), query: { tabela: "ProcedimentosAbandono", registroId: "4" } });
      expect(dentro.status).toBe(200);
      const fora = await chamar(hAnexos, { token: LOCAL(["disciplina"]), query: { tabela: "ProcedimentosAbandono", registroId: "5" } });
      const inexistente = await chamar(hAnexos, { token: LOCAL(["disciplina"]), query: { tabela: "ProcedimentosAbandono", registroId: "77" } });
      expect(fora.status).toBe(403);
      expect(fora.body).toEqual(FORA);
      expect(inexistente.status).toBe(fora.status);
      expect(inexistente.body).toEqual(fora.body);
    });
    test("fora do escopo não envia (nada ao armazenamento) nem apaga (nada apagado, mesma resposta)", async () => {
      const envia = await chamar(hAnexos, { metodo: "POST", token: LOCAL(["disciplina"]), corpo: envio({ tabela: "ProcedimentosAbandono", registroId: 5 }) });
      expect(envia.status).toBe(403);
      expect(storage.salvarDocumento).not.toHaveBeenCalled();
      quando(/SELECT Tabela, RegistroId, NomeArquivo, Url FROM AnexosGenericos/, [{ Tabela: "ProcedimentosAbandono", RegistroId: 5, NomeArquivo: "e.pdf", Url: "https://blob.exemplo/documentos/doc-5" }]);
      const apaga = await chamar(hAnexos, { metodo: "DELETE", token: LOCAL(["disciplina"]), ligado: { id: "1" } });
      expect(apaga.body).toEqual(FORA);
      expect(rodou(/DELETE FROM AnexosGenericos/)).toHaveLength(0);
      expect(storage.excluirDocumento).not.toHaveBeenCalled();
    });
    test("dentro do escopo envia e apaga; o geral alcança as duas congregações", async () => {
      quando(/INSERT INTO AnexosGenericos/, [{ AnexoId: 13 }]);
      expect((await chamar(hAnexos, { metodo: "POST", token: LOCAL(["disciplina"]), corpo: envio({ tabela: "ProcedimentosAbandono", registroId: 4 }) })).status).toBe(201);
      expect((await chamar(hAnexos, { metodo: "POST", token: GERAL(["disciplina"]), corpo: envio({ tabela: "ProcedimentosAbandono", registroId: 5 }) })).status).toBe(201);
      expect(rodou(/INSERT INTO AnexosGenericos/)).toHaveLength(2);
    });
  });

  describe("DenunciasOuvidoria: a regra de conflito de interesse da Diretoria vale também para as provas anexadas", () => {
    beforeEach(() => {
      quando(/SELECT DenunciaId, DenunciadoMembroId FROM DenunciasOuvidoria WHERE DenunciaId = @id/, (i) => (i.id === 6 ? [{ DenunciaId: 6, DenunciadoMembroId: 99 }] : i.id === 7 ? [{ DenunciaId: 7, DenunciadoMembroId: 55 }] : []));
      // Na Diretoria: o denunciado 99 e o ouvidor 8.
      quando(/FROM Assentos a JOIN Orgaos o ON o\.OrgaoId = a\.OrgaoId/, (i) => ([99, 8].includes(i.membroId) ? [{ AssentoId: 1 }] : []));
      quando(/FROM AnexosGenericos a LEFT JOIN PoliticasRetencao/, [anexoLinha]);
    });
    test("quem NÃO é da Diretoria alcança a denúncia contra a Diretoria; quem é da Diretoria não alcança (mesma resposta de 'não existe')", async () => {
      expect((await chamar(hAnexos, { token: GERAL(["ouvidoria"], 9), query: { tabela: "DenunciasOuvidoria", registroId: "6" } })).status).toBe(200);
      const daDiretoria = await chamar(hAnexos, { token: GERAL(["ouvidoria"], 8), query: { tabela: "DenunciasOuvidoria", registroId: "6" } });
      const inexistente = await chamar(hAnexos, { token: GERAL(["ouvidoria"], 8), query: { tabela: "DenunciasOuvidoria", registroId: "888" } });
      expect(daDiretoria.status).toBe(403);
      expect(daDiretoria.body).toEqual(FORA);
      expect(inexistente).toEqual(daDiretoria);
    });
    test("quem é da Diretoria alcança denúncia contra quem não é da Diretoria; a da Diretoria não pode ser enviada nem apagada por ele", async () => {
      expect((await chamar(hAnexos, { token: GERAL(["ouvidoria"], 8), query: { tabela: "DenunciasOuvidoria", registroId: "7" } })).status).toBe(200);
      const envia = await chamar(hAnexos, { metodo: "POST", token: GERAL(["ouvidoria"], 8), corpo: envio({ tabela: "DenunciasOuvidoria", registroId: 6 }) });
      expect(envia.status).toBe(403);
      expect(storage.salvarDocumento).not.toHaveBeenCalled();
      quando(/SELECT Tabela, RegistroId, NomeArquivo, Url FROM AnexosGenericos/, [{ Tabela: "DenunciasOuvidoria", RegistroId: 6, NomeArquivo: "prova.pdf", Url: "https://blob.exemplo/documentos/doc-6" }]);
      const apaga = await chamar(hAnexos, { metodo: "DELETE", token: GERAL(["ouvidoria"], 8), ligado: { id: "1" } });
      expect(apaga.body).toEqual(FORA);
      expect(rodou(/DELETE FROM AnexosGenericos/)).toHaveLength(0);
      expect(storage.excluirDocumento).not.toHaveBeenCalled();
    });
    test("sem a permissão 'ouvidoria' ninguém alcança, nem o geral", async () => {
      expect((await chamar(hAnexos, { token: GERAL(["reunioes"], 9), query: { tabela: "DenunciasOuvidoria", registroId: "6" } })).status).toBe(403);
    });
  });

  describe("envio: tamanho, conteúdo e sonda no DELETE", () => {
    beforeEach(() => quando(/SELECT ProjetoId FROM Projetos WHERE ProjetoId = @id/, [{ ProjetoId: 3 }]));
    test("arquivo maior que 15 MB é recusado antes de qualquer consulta; conteúdo que não bate com o tipo também; nada no armazenamento", async () => {
      const grande = Buffer.alloc(16 * 1024 * 1024, 65).toString("base64");
      const r1 = await chamar(hAnexos, { metodo: "POST", token: GERAL(["reunioes"]), corpo: envio({ documentoBase64: grande }) });
      expect(r1.status).toBe(400);
      expect(nada()).toBe(0);
      // 15 MB + 1 byte: o texto cabe na folga do pré-teste, quem recusa é a conferência do tamanho decodificado
      const umByteAMais = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(15 * 1024 * 1024 + 1 - 9, 65)]).toString("base64");
      const r2 = await chamar(hAnexos, { metodo: "POST", token: GERAL(["reunioes"]), corpo: envio({ documentoBase64: umByteAMais }) });
      expect(r2.status).toBe(400);
      expect(storage.salvarDocumento).not.toHaveBeenCalled();
      for (const corpo of [
        envio({ documentoBase64: Buffer.from("<html><script>alert(1)</script></html>").toString("base64") }),
        envio({ mimeType: "image/png" }),                                                    // PDF declarado como PNG
        envio({ mimeType: "image/jpeg", documentoBase64: Buffer.from("%PDF-1.4").toString("base64") }),
        envio({ mimeType: "text/html" }),
        envio({ nomeArquivo: "x".repeat(256) }),
        envio({ categoria: "c".repeat(61) })
      ]) {
        expect((await chamar(hAnexos, { metodo: "POST", token: GERAL(["reunioes"]), corpo })).status).toBe(400);
      }
      expect(storage.salvarDocumento).not.toHaveBeenCalled();
    });
    test("PNG e JPEG de verdade passam; falha ao gravar a linha remove o arquivo órfão; categoria inexistente (FK) = 400", async () => {
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("dados")]).toString("base64");
      const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("dados")]).toString("base64");
      quando(/INSERT INTO AnexosGenericos/, [{ AnexoId: 14 }]);
      expect((await chamar(hAnexos, { metodo: "POST", token: GERAL(["reunioes"]), corpo: envio({ mimeType: "image/png", documentoBase64: png }) })).status).toBe(201);
      expect((await chamar(hAnexos, { metodo: "POST", token: GERAL(["reunioes"]), corpo: envio({ mimeType: "image/jpeg", documentoBase64: jpg }) })).status).toBe(201);

      mockRegras = [];
      quando(/SELECT ProjetoId FROM Projetos WHERE ProjetoId = @id/, [{ ProjetoId: 3 }]);
      quando(/INSERT INTO AnexosGenericos/, () => { throw Object.assign(new Error("fk"), { number: 547 }); });
      const r = await chamar(hAnexos, { metodo: "POST", token: GERAL(["reunioes"]), corpo: envio({ categoria: "Inexistente" }) });
      expect(r.status).toBe(400);
      expect(storage.excluirDocumento).toHaveBeenCalledWith("https://blob.exemplo/documentos/doc-1");
    });
    test("falha do armazenamento: o texto técnico do erro NÃO vai para o cliente", async () => {
      storage.salvarDocumento.mockImplementationOnce(async () => { throw new Error("conta fisicamente inacessivel: segredo-do-storage"); });
      const r = await chamar(hAnexos, { metodo: "POST", token: GERAL(["reunioes"]), corpo: envio() });
      expect(r.body.sucesso).toBe(false);
      expect(JSON.stringify(r.body)).not.toMatch(/segredo-do-storage|inacessivel/);
      expect(rodou(/INSERT INTO AnexosGenericos/)).toHaveLength(0);
    });
    test("DELETE: anexo inexistente, malformado e fora do escopo — inexistente e fora do escopo dão exatamente a mesma resposta", async () => {
      const inexistente = await chamar(hAnexos, { metodo: "DELETE", token: LOCAL(["reunioes"]), ligado: { id: "404" } });
      expect(inexistente).toMatchObject({ status: 403, body: FORA });
      expect((await chamar(hAnexos, { metodo: "DELETE", token: LOCAL(["reunioes"]), ligado: { id: "abc" } })).status).toBe(400);
      // sem permissão para a tabela do anexo: a mesma resposta uniforme (não revela que o anexo existe)
      quando(/SELECT Tabela, RegistroId, NomeArquivo, Url FROM AnexosGenericos/, [{ Tabela: "Fornecedores", RegistroId: 3, NomeArquivo: "c.pdf", Url: "https://blob.exemplo/documentos/doc-3" }]);
      const semPermissao = await chamar(hAnexos, { metodo: "DELETE", token: LOCAL(["reunioes"]), ligado: { id: "1" } });
      expect(semPermissao).toEqual(inexistente);
    });
  });
});

// =====================================================================================================================
// ComposicaoCLI — sigilo disciplinar só com 'disciplina' E escopo
// =====================================================================================================================
describe("ComposicaoCLI", () => {
  const composicao = [
    { membroId: 40, nome: "Ana", congregacao: "A", situacaoMembro: "EM_COMUNHAO", cargoMinisterial: "PASTOR" },
    { membroId: 41, nome: "Beto", congregacao: "B", situacaoMembro: "SEM_COMUNHAO", cargoMinisterial: "PASTOR" },
    { membroId: 42, nome: "Caio", congregacao: "B", situacaoMembro: "EM_COMUNHAO", cargoMinisterial: "PRESBITERO" },
    { membroId: 43, nome: "Davi", congregacao: "A", situacaoMembro: "SEM_COMUNHAO", cargoMinisterial: "PASTOR" }
  ];
  beforeEach(() => {
    quando(/FROM Orgaos WHERE Sigla = 'CLI'/, [{ orgaoId: 7 }]);
    quando(/FROM ProcessosDisciplinares/, [{ MembroId: 40 }, { MembroId: 42 }]);
    universo.composicaoCLI.mockImplementation(async () => composicao.map(m => ({ ...m })));
  });
  const porId = (r) => Object.fromEntries(r.body.map(m => [m.membroId, m]));

  test("sem sessão 401; PIN 403; sem 'reunioes/assembleia/cli' 403", async () => {
    expect((await chamar(hCli, {})).status).toBe(401);
    expect((await chamar(hCli, { token: PIN() })).status).toBe(403);
    expect((await chamar(hCli, { token: LOCAL(["pessoas"]) })).status).toBe(403);
    expect(nada()).toBe(0);
  });
  test("local SEM 'disciplina': a lista de nomes vem inteira, mas nenhuma linha leva a marca de disciplina/sem comunhão e a consulta de disciplina nem roda", async () => {
    const r = await chamar(hCli, { token: LOCAL(["reunioes"]) });
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(4);
    for (const m of r.body) expect(m).toMatchObject({ processoDisciplinarAtivo: false, emComunhao: true, situacaoMembro: null });
    expect(rodou(/FROM ProcessosDisciplinares/)).toHaveLength(0);
  });
  test("local COM 'disciplina': vê a marca só das pessoas do seu escopo (A); as de B ficam mascaradas", async () => {
    const m = porId(await chamar(hCli, { token: LOCAL(["reunioes", "disciplina"], ["A"]) }));
    expect(m[40]).toMatchObject({ processoDisciplinarAtivo: true, emComunhao: true, situacaoMembro: "EM_COMUNHAO" });         // de A, sob disciplina
    expect(m[43]).toMatchObject({ processoDisciplinarAtivo: false, emComunhao: false });                                       // de A, sem comunhão
    expect(m[41]).toMatchObject({ processoDisciplinarAtivo: false, emComunhao: true, situacaoMembro: null });                 // de B: mascarado
    expect(m[42]).toMatchObject({ processoDisciplinarAtivo: false, emComunhao: true, situacaoMembro: null });                 // de B, sob disciplina de verdade: mascarado
  });
  test("geral com 'disciplina' vê tudo; geral SEM 'disciplina' também fica mascarado (o sigilo é da permissão)", async () => {
    const m = porId(await chamar(hCli, { token: GERAL(["reunioes", "disciplina"]) }));
    expect(m[42]).toMatchObject({ processoDisciplinarAtivo: true });
    expect(m[41]).toMatchObject({ emComunhao: false });
    const mascarado = porId(await chamar(hCli, { token: GERAL(["reunioes"]) }));
    expect(mascarado[42]).toMatchObject({ processoDisciplinarAtivo: false, emComunhao: true });
  });
});

// =====================================================================================================================
// GestaoCredenciamento — GET filtra por escopo; credenciar/relatório só o geral (testado na tabela das institucionais)
// =====================================================================================================================
describe("GestaoCredenciamento", () => {
  const sessao = (status = "ABERTA", sigla = "ASSEMBLEIA_GERAL") => quando(/FROM Sessoes s\s+LEFT JOIN Orgaos o/, [{ SessaoId: 5, Status: status, orgaoSigla: sigla }]);
  const apto = { dataNascimento: "1980-01-01", dataAdmissao: "2010-01-01", dizimistaFiel: true, status: "ATIVO", situacaoMembro: "EM_COMUNHAO", extensao: null };
  beforeEach(() => {
    quando(/WHERE m\.Status = 'ATIVO'/, [
      { membroId: 40, nome: "Ana", congregacao: "A", ...apto },
      { membroId: 41, nome: "Beto", congregacao: "B", ...apto },
      { membroId: 42, nome: "Caio", congregacao: "A", ...apto },
      { membroId: 43, nome: "Davi", congregacao: "B", ...apto }
    ]);
    quando(/FROM ProcessosDisciplinares/, [{ MembroId: 40 }, { MembroId: 41 }]);
    universo.membrosComCartaMudancaEmitida.mockImplementation(async () => new Set([43]));
    quando(/FROM CredenciamentosAssembleia c JOIN MembroReferencia/, [
      { credenciamentoId: 1, membroId: 40, nome: "Ana", resultado: "RECUSADO", motivoArtigo: "Art. 142, II", motivoDetalhe: "Sob disciplina em curso.", criadoEm: "t", congregacaoNome: "A", extensaoNome: null },
      { credenciamentoId: 2, membroId: 41, nome: "Beto", resultado: "RECUSADO", motivoArtigo: "Art. 142, II", motivoDetalhe: "Sob disciplina em curso.", criadoEm: "t", congregacaoNome: "B", extensaoNome: null }
    ]);
  });
  const ligado = { sessaoId: "5" };

  test("GET: o local de A só recebe impedidos e trilha de pessoas de A (as de B não aparecem) e as colunas internas não vazam", async () => {
    sessao();
    const r = await chamar(hCredenciamento, { token: LOCAL(["reunioes"], ["A"]), ligado });
    expect(r.status).toBe(200);
    expect(r.body.impedidos.map(i => i.membroId)).toEqual([40]);
    expect(r.body.credenciamentos.map(c => c.membroId)).toEqual([1].map(() => 40));
    expect(JSON.stringify(r.body)).not.toMatch(/congregacaoNome|extensaoNome/);
  });
  test("GET: Pastor de Área (A e B) vê os dois; geral vê todos, inclusive quem tem carta de mudança", async () => {
    sessao();
    const area = await chamar(hCredenciamento, { token: LOCAL(["assembleia"], ["A", "B"], 5, "AREA"), ligado });
    expect(area.body.impedidos.map(i => i.membroId).sort()).toEqual([40, 41, 43]);
    expect(area.body.credenciamentos).toHaveLength(2);
    const geral = await chamar(hCredenciamento, { token: GERAL(["assembleia"]), ligado });
    expect(geral.body.impedidos.map(i => i.membroId).sort()).toEqual([40, 41, 43]);
    expect(geral.body.credenciamentos).toHaveLength(2);
  });
  test("GET: sessão que não existe, id malformado e sessão de outro órgão", async () => {
    sessao();
    expect((await chamar(hCredenciamento, { token: LOCAL(["reunioes"]), ligado: { sessaoId: "abc" } })).status).toBe(404);      // o banco acharia a sessão: quem recusa é o id malformado
    expect((await chamar(hCredenciamento, { token: LOCAL(["reunioes"]), ligado: { sessaoId: "05" } })).status).toBe(404);
    mockRegras = mockRegras.filter(([p]) => !/FROM Sessoes s/.test(p.source));
    expect((await chamar(hCredenciamento, { token: LOCAL(["reunioes"]), ligado: { sessaoId: "5" } })).status).toBe(404);   // nenhuma sessão nas regras
    sessao("ABERTA", "CLI");
    expect((await chamar(hCredenciamento, { token: LOCAL(["reunioes"]), ligado })).body.sucesso).toBe(false);
  });
  test("POST credenciar: com a Assembleia ABERTA grava credenciamento e presença; com a sessão encerrada nada é gravado", async () => {
    quando(/SELECT MembroId AS membroId, SituacaoMembro/, [{ membroId: 42, situacaoMembro: "EM_COMUNHAO", ...apto }]);
    sessao("ABERTA");
    const ok = await chamar(hCredenciamento, { metodo: "POST", token: GERAL(["assembleia"]), ligado, corpo: { membroId: 42 } });
    expect(ok.status).toBe(201);
    expect(rodou(/INSERT INTO CredenciamentosAssembleia/)).toHaveLength(1);
    expect(rodou(/INSERT INTO Presencas/)).toHaveLength(1);

    mockConsultas = []; mockRegras = [];
    quando(/SELECT MembroId AS membroId, SituacaoMembro/, [{ membroId: 42, situacaoMembro: "EM_COMUNHAO", ...apto }]);
    for (const status of ["ENCERRADA", "CONVOCADA"]) {
      mockConsultas = []; mockRegras = mockRegras.filter(([p]) => !/FROM Sessoes s/.test(p.source));
      sessao(status);
      const r = await chamar(hCredenciamento, { metodo: "POST", token: GERAL(["assembleia"]), ligado, corpo: { membroId: 42 } });
      expect(r.body).toMatchObject({ sucesso: false });
      expect(rodou(/INSERT INTO CredenciamentosAssembleia|INSERT INTO Presencas/)).toHaveLength(0);
    }
  });
  test("POST credenciar: matrícula malformada = 'não encontrada' sem gravar", async () => {
    sessao("ABERTA");
    quando(/SELECT MembroId AS membroId, SituacaoMembro/, [{ membroId: 42, situacaoMembro: "EM_COMUNHAO", ...apto }]);     // o banco acharia alguém: quem recusa é a matrícula malformada
    const r = await chamar(hCredenciamento, { metodo: "POST", token: GERAL(["assembleia"]), ligado, corpo: { membroId: "0x2a" } });
    expect(r.body).toMatchObject({ sucesso: false, mensagem: "Matrícula não encontrada." });
    expect(rodou(/INSERT INTO/)).toHaveLength(0);
  });
  test("relatório: o geral gera e congela", async () => {
    sessao("ABERTA");
    quando(/FROM RelatoriosCredenciamento WHERE SessaoId = @id/, []);
    quando(/SELECT COUNT\(\*\) AS total FROM Presencas/, [{ total: 4 }]);
    quando(/SELECT COUNT\(\*\) AS total FROM CredenciamentosAssembleia/, [{ total: 1 }]);
    quando(/INSERT INTO RelatoriosCredenciamento/, [{ relatorioId: 2, geradoEm: "t" }]);
    const r = await chamar(hCredenciamento, { metodo: "POST", token: GERAL(["assembleia"]), ligado: { sessaoId: "5", acao: "relatorio" } });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/INSERT INTO RelatoriosCredenciamento/)).toHaveLength(1);
  });
});

// =====================================================================================================================
// GestaoElegiveisAssembleia
// =====================================================================================================================
describe("GestaoElegiveisAssembleia", () => {
  const base = { dataNascimento: "1980-01-01", dataAdmissao: "2010-01-01", dizimistaFiel: true, status: "ATIVO", situacaoMembro: "EM_COMUNHAO", extensao: null };
  beforeEach(() => {
    quando(/FROM MembroReferencia m\s+LEFT JOIN Congregacoes c/, [
      { membroId: 40, nome: "Ana", congregacao: "A", ...base },
      { membroId: 41, nome: "Beto", congregacao: "B", ...base },
      { membroId: 42, nome: "Caio", congregacao: null, ...base },
      { membroId: 43, nome: "Davi", congregacao: "A", ...base, extensao: "Tenda Norte" }
    ]);
  });
  test("sem sessão 401; PIN 403; sem 'assembleia' 403 — sem tocar o banco", async () => {
    expect((await chamar(hElegiveis, {})).status).toBe(401);
    expect((await chamar(hElegiveis, { token: PIN() })).status).toBe(403);
    expect((await chamar(hElegiveis, { token: LOCAL(["reunioes"]) })).status).toBe(403);
    expect(nada()).toBe(0);
  });
  test("Pastor de Área de A: só as pessoas de A e SEM nascimento, admissão, dizimista nem o que se deduz deles", async () => {
    const r = await chamar(hElegiveis, { token: LOCAL(["assembleia"], ["A"], 5, "AREA") });
    expect(r.status).toBe(200);
    expect(r.body.map(m => m.membroId).sort()).toEqual([40, 43]);
    const texto = JSON.stringify(r.body);
    expect(texto).not.toMatch(/dataNascimento|dataAdmissao|dizimistaFiel|elegivelDiretoriaConselhoFiscal|diasIntegracao|processoDisciplinarAtivo|extensao/);
    expect(r.body[0]).toMatchObject({ membroId: 40, nome: "Ana", congregacao: "A", capacidade: { capacidadeAtiva: true } });
  });
  test("escopo por Extensão da Tenda é mais estreito que a congregação-mãe", async () => {
    const r = await chamar(hElegiveis, { token: tokenDe(5, { via: "SENHA", nivel: "CONGREGACAO", escopoCongregacoes: ["A"], escopoExtensaoNome: "Tenda Norte", permissoes: ["assembleia"] }) });
    expect(r.body.map(m => m.membroId)).toEqual([43]);
  });
  test("geral: todos (inclusive sem congregação), com nascimento, admissão e dizimista", async () => {
    const r = await chamar(hElegiveis, { token: GERAL(["assembleia"]) });
    expect(r.body.map(m => m.membroId).sort()).toEqual([40, 41, 42, 43]);
    expect(r.body[0]).toMatchObject({ dataNascimento: "1980-01-01", dataAdmissao: "2010-01-01", dizimistaFiel: true });
    expect(r.body[0]).not.toHaveProperty("extensao");
    expect(r.body[0].capacidade).toHaveProperty("elegivelDiretoriaConselhoFiscal");
  });
  test("papel Global com lista e Líder de Departamento (TODAS) NÃO recebem o dado completo", async () => {
    for (const token of [GLOBAL_COM_LISTA(["assembleia"]), LIDER_DEPARTAMENTO(["assembleia"])]) {
      const r = await chamar(hElegiveis, { token });
      expect(JSON.stringify(r.body)).not.toMatch(/dataNascimento|dizimistaFiel/);
    }
    const lider = await chamar(hElegiveis, { token: LIDER_DEPARTAMENTO(["assembleia"]) });
    expect(lider.body).toHaveLength(4);       // escopo TODAS: todas as pessoas, mas só os campos mínimos
  });
});

// =====================================================================================================================
// GestaoEnquetes
// =====================================================================================================================
describe("GestaoEnquetes", () => {
  // E1: pública para todos os ativos, com 3 respostas (20 sem escopo, 40 de A, 41 de B). E2: secreta, público custom [30].
  const ENQUETES = {
    1: { enqueteId: 1, titulo: "Reforma", descricao: null, visibilidade: "PUBLICA", publicoTipo: "TODOS_ATIVOS", vinculante: false, quorumTipo: null, status: "ABERTA", resultadoAprovado: null, criadoPor: 5 },
    2: { enqueteId: 2, titulo: "Reservada", descricao: null, visibilidade: "SECRETA", publicoTipo: "LISTA_CUSTOM", vinculante: false, quorumTipo: null, status: "ABERTA", resultadoAprovado: null, criadoPor: 1 }
  };
  const RESPOSTAS = { 10: [
    { membroId: 20, nome: "Luz", congregacaoNome: null, extensaoNome: null, opcaoId: 100, textoResposta: null },
    { membroId: 40, nome: "Ana", congregacaoNome: "A", extensaoNome: null, opcaoId: 100, textoResposta: null },
    { membroId: 41, nome: "Beto", congregacaoNome: "B", extensaoNome: null, opcaoId: 101, textoResposta: null },
    { membroId: 42, nome: "Caio", congregacaoNome: "A", extensaoNome: null, opcaoId: 100, textoResposta: null }
  ], 20: [{ membroId: 30, nome: "Dora", congregacaoNome: "B", extensaoNome: null, opcaoId: 200, textoResposta: null }] };
  const montaTudo = () => {
    quando(/SELECT EnqueteId AS enqueteId FROM Enquetes ORDER BY/, [{ enqueteId: 1 }, { enqueteId: 2 }]);
    quando(/FROM Enquetes WHERE EnqueteId = @id/, (i) => (ENQUETES[i.id] ? [{ ...ENQUETES[i.id] }] : []));
    quando(/FROM PerguntasEnquete WHERE EnqueteId = @id ORDER BY Ordem/, (i) => [{ perguntaId: i.id * 10, ordem: 1, titulo: "Aprova?", tipo: "OPCOES" }]);
    quando(/FROM OpcoesEnquete WHERE PerguntaId = @id/, (i) => (i.id === 10 ? [{ opcaoId: 100, texto: "Sim" }, { opcaoId: 101, texto: "Não" }] : [{ opcaoId: 200, texto: "Sim" }, { opcaoId: 201, texto: "Não" }]));
    quando(/FROM RespostasEnquete r JOIN MembroReferencia m/, (i) => RESPOSTAS[i.id] || []);
    membrosElegiveis.mockImplementation(async (_p, _s, enquete) => (enquete.publicoTipo === "LISTA_CUSTOM" ? new Set([30]) : new Set([20, 40, 41, 42, 43])));
  };

  describe("GET", () => {
    beforeEach(montaTudo);
    test("sem sessão 401; PIN provisório 403 (nada lido)", async () => {
      expect((await chamar(hEnquetes, {})).status).toBe(401);
      expect((await chamar(hEnquetes, { token: tokenDe(20, { via: "PIN", pinProvisorio: true }) })).status).toBe(403);
      expect(nada()).toBe(0);
    });
    test("membro (PIN) só vê as enquetes em que está no público, e nelas só a própria participação", async () => {
      const r = await chamar(hEnquetes, { token: PIN(20) });
      expect(r.status).toBe(200);
      expect(r.body.map(e => e.enqueteId)).toEqual([1]);                                  // a E2 é de outro público: nem aparece
      expect(r.body[0].participantes.map(p => p.membroId)).toEqual([20]);
      expect(r.body[0].perguntas[0].respostas.map(x => x.membroId)).toEqual([20]);
      expect(r.body[0].totalVotos).toBe(4);                                               // os totais são agregados e ficam inteiros
      expect(r.body[0].perguntas[0].opcoes.map(o => o.votos)).toEqual([3, 1]);
      expect(JSON.stringify(r.body)).not.toMatch(/criadoPor|congregacaoNome|extensaoNome/);
    });
    test("o público custom vê a sua enquete (e só ela); o criador vê a que criou mesmo fora do público", async () => {
      const dora = await chamar(hEnquetes, { token: PIN(30) });
      expect(dora.body.map(e => e.enqueteId)).toEqual([2]);
      expect(dora.body[0].participantes.map(p => p.membroId)).toEqual([30]);
      // quem criou a E1 (membro 5, fora do público e sem ser da mesa) continua vendo a sua, e só ela
      const criador = await chamar(hEnquetes, { token: LOCAL(["pessoas"], ["A"], 5) });
      expect(criador.body.map(e => e.enqueteId)).toEqual([1]);
    });
    test("a mesa local (reunioes) vê as duas enquetes, mas participantes e respostas só de pessoas do seu escopo (A) ou dela mesma", async () => {
      const r = await chamar(hEnquetes, { token: LOCAL(["reunioes"], ["A"], 5) });
      expect(r.body.map(e => e.enqueteId)).toEqual([1, 2]);
      expect(r.body[0].participantes.map(p => p.membroId)).toEqual([40, 42]);
      expect(r.body[0].perguntas[0].respostas.map(x => x.membroId)).toEqual([40, 42]);
      expect(r.body[1].participantes).toEqual([]);                                         // Dora é de B
      expect(r.body[0].totalVotos).toBe(4);
    });
    test("liderança SEM 'reunioes'/'assembleia' (ex.: só 'pessoas') não é mesa: no público da enquete, vê só a própria participação, não a das pessoas do seu escopo", async () => {
      const r = await chamar(hEnquetes, { token: LOCAL(["pessoas"], ["A"], 40) });
      expect(r.body.map(e => e.enqueteId)).toEqual([1]);
      expect(r.body[0].participantes.map(p => p.membroId)).toEqual([40]);
      expect(r.body[0].perguntas[0].respostas.map(x => x.membroId)).toEqual([40]);
    });
    test("o geral vê tudo, com os nomes", async () => {
      const r = await chamar(hEnquetes, { token: GERAL(["reunioes"]) });
      expect(r.body[0].participantes.map(p => p.membroId).sort()).toEqual([20, 40, 41, 42]);
      expect(r.body[1].participantes.map(p => p.membroId)).toEqual([30]);
    });
    test("o universo 'todos os ativos' é calculado uma vez só por requisição", async () => {
      mockRegras.unshift([/SELECT EnqueteId AS enqueteId FROM Enquetes ORDER BY/, [{ enqueteId: 1 }, { enqueteId: 1 }], 0]);       // duas enquetes "para todos os ativos" na mesma listagem
      await chamar(hEnquetes, { token: PIN(20) });
      const dasTodosAtivos = membrosElegiveis.mock.calls.filter(c => c[2].publicoTipo === "TODOS_ATIVOS");
      expect(dasTodosAtivos).toHaveLength(1);
    });
  });

  describe("POST criar", () => {
    const pergunta = { titulo: "Aprova?", tipo: "OPCOES", opcoes: ["Sim", "Não"] };
    const corpo = (extra = {}) => ({ titulo: "Enquete da congregação", visibilidade: "PUBLICA", publicoTipo: "LISTA_CUSTOM", publicoMembroIds: [40], perguntas: [pergunta], ...extra });
    const pessoasDoPublico = () => quando(/FROM MembroReferencia m\s+LEFT JOIN Congregacoes cg[\s\S]*WHERE m\.MembroId IN/, (_i, texto) => {
      const ids = texto.match(/IN \(([\d,]+)\)/)[1].split(",").map(Number);
      const tabela = { 40: "A", 41: "B", 42: "A" };
      return ids.filter(i => tabela[i]).map(i => ({ membroId: i, congregacaoNome: tabela[i], extensaoNome: null }));
    });
    const criacao = () => {
      pessoasDoPublico();
      quando(/INSERT INTO Enquetes/, [{ EnqueteId: 50 }]);
      quando(/INSERT INTO PerguntasEnquete/, [{ PerguntaId: 500 }]);
      quando(/FROM Enquetes WHERE EnqueteId = @id/, [{ ...ENQUETES[1], enqueteId: 50, criadoPor: 5 }]);
    };
    beforeEach(criacao);

    test("sem sessão 401; PIN 403; sem 'reunioes/assembleia' 403", async () => {
      expect((await chamar(hEnquetes, { metodo: "POST", corpo: corpo() })).status).toBe(401);
      expect((await chamar(hEnquetes, { metodo: "POST", token: PIN(), corpo: corpo() })).status).toBe(403);
      expect((await chamar(hEnquetes, { metodo: "POST", token: LOCAL(["pessoas"]), corpo: corpo() })).status).toBe(403);
      expect(nada()).toBe(0);
    });
    test("papel local NÃO cria enquete vinculante, para todos os ativos (nem por omissão do público) ou de órgão central: 403 e nada gravado", async () => {
      const token = LOCAL(["reunioes"]);
      for (const c of [
        corpo({ vinculante: true, quorumTipo: "MAIORIA_SIMPLES" }),
        corpo({ publicoTipo: "TODOS_ATIVOS", publicoMembroIds: undefined }),
        corpo({ publicoTipo: undefined, publicoMembroIds: undefined }),
        corpo({ orgaoId: 2 })
      ]) {
        const r = await chamar(hEnquetes, { metodo: "POST", token, corpo: c });
        expect(r.status).toBe(403);
      }
      expect(rodou(/INSERT INTO Enquetes/)).toHaveLength(0);
    });
    test("papel local cria enquete de público custom com membros do seu escopo: grava a enquete, as perguntas e o público; o criador é ele", async () => {
      const r = await chamar(hEnquetes, { metodo: "POST", token: LOCAL(["reunioes"], ["A"], 5), corpo: corpo({ publicoMembroIds: [40, "42", 40] }) });
      expect(r.status).toBe(201);
      const ins = rodou(/INSERT INTO Enquetes/);
      expect(ins).toHaveLength(1);
      expect(ins[0].inputs).toMatchObject({ criadoPor: 5, publicoTipo: "LISTA_CUSTOM", vinculante: false });
      expect(rodou(/INSERT INTO PublicoEnqueteCustom/).map(c => c.inputs.membroId)).toEqual([40, 42]);       // sem repetição
      expect(rodou(/INSERT INTO PerguntasEnquete/)).toHaveLength(1);
      expect(rodou(/INSERT INTO OpcoesEnquete/)).toHaveLength(2);
      expect(JSON.stringify(r.body)).not.toMatch(/criadoPor|congregacaoNome/);
    });
    test("público com alguém de FORA do escopo, inexistente ou malformado: recusado (a mesma resposta para fora e inexistente), nada gravado", async () => {
      const token = LOCAL(["reunioes"], ["A"], 5);
      const fora = await chamar(hEnquetes, { metodo: "POST", token, corpo: corpo({ publicoMembroIds: [40, 41] }) });
      const inexistente = await chamar(hEnquetes, { metodo: "POST", token, corpo: corpo({ publicoMembroIds: [40, 999] }) });
      expect(fora.body).toMatchObject({ sucesso: false });
      expect(inexistente).toEqual(fora);
      expect((await chamar(hEnquetes, { metodo: "POST", token, corpo: corpo({ publicoMembroIds: [40, "0x10"] }) })).status).toBe(400);
      expect((await chamar(hEnquetes, { metodo: "POST", token, corpo: corpo({ publicoMembroIds: [40, null] }) })).status).toBe(400);
      expect(rodou(/INSERT INTO Enquetes/)).toHaveLength(0);
    });
    test("sessão vinculada: de órgão local só quem é do órgão; de órgão central só o geral; inexistente = mesma resposta", async () => {
      quando(/SELECT SessaoId, OrgaoId, OrgaoLocalId FROM Sessoes WHERE SessaoId = @id/, (i) => (i.id === 9 ? [{ SessaoId: 9, OrgaoId: null, OrgaoLocalId: 3 }] : i.id === 10 ? [{ SessaoId: 10, OrgaoId: 4, OrgaoLocalId: null }] : []));
      const token = LOCAL(["reunioes"], ["A"], 5);
      escopoMod.membroAutorizadoNoOrgaoLocal.mockImplementation(async () => false);
      const naoDoOrgao = await chamar(hEnquetes, { metodo: "POST", token, corpo: corpo({ sessaoId: 9 }) });
      const inexistente = await chamar(hEnquetes, { metodo: "POST", token, corpo: corpo({ sessaoId: 99 }) });
      expect(naoDoOrgao.body).toMatchObject({ sucesso: false, mensagem: "Sessão não encontrada." });
      expect(inexistente).toEqual(naoDoOrgao);
      expect(rodou(/INSERT INTO Enquetes/)).toHaveLength(0);
      escopoMod.membroAutorizadoNoOrgaoLocal.mockImplementation(async () => true);
      // sessão de órgão CENTRAL: nem quem "tem vínculo" (mock verdadeiro) cria — só o geral
      const central = await chamar(hEnquetes, { metodo: "POST", token, corpo: corpo({ sessaoId: 10 }) });
      expect(central.body).toMatchObject({ sucesso: false, mensagem: "Sessão não encontrada." });
      expect(rodou(/INSERT INTO Enquetes/)).toHaveLength(0);
      expect((await chamar(hEnquetes, { metodo: "POST", token, corpo: corpo({ sessaoId: 9 }) })).status).toBe(201);
      expect(rodou(/INSERT INTO Enquetes/)[0].inputs).toMatchObject({ sessaoId: 9 });
      const chamada = escopoMod.membroAutorizadoNoOrgaoLocal.mock.calls[0];
      expect([chamada[2], chamada[3]]).toEqual([5, 3]);
      expect((await chamar(hEnquetes, { metodo: "POST", token: GERAL(["reunioes"]), corpo: corpo({ sessaoId: 10 }) })).status).toBe(201);      // o geral vincula a sessão central
    });
    test("o geral cria vinculante / para todos os ativos / de órgão central", async () => {
      quando(/SELECT OrgaoId FROM Orgaos WHERE OrgaoId = @id/, [{ OrgaoId: 4 }]);
      const vinculante = await chamar(hEnquetes, { metodo: "POST", token: GERAL(["assembleia"]), corpo: { titulo: "Reforma", publicoTipo: "TODOS_ATIVOS", vinculante: true, quorumTipo: "DOIS_TERCOS", orgaoId: 4, perguntas: [pergunta] } });
      expect(vinculante.status).toBe(201);
      expect(rodou(/INSERT INTO Enquetes/)[0].inputs).toMatchObject({ vinculante: true, quorumTipo: "DOIS_TERCOS", orgaoId: 4, criadoPor: 1 });
      expect(rodou(/INSERT INTO PublicoEnqueteCustom/)).toHaveLength(0);
    });
    test("formulário malformado: recusado antes de gravar (título/pergunta/opções que não são texto, listas gigantes)", async () => {
      const token = GERAL(["reunioes"]);
      for (const c of [
        corpo({ titulo: 123 }), corpo({ titulo: "x".repeat(201) }), corpo({ descricao: "d".repeat(1001) }),
        corpo({ perguntas: Array.from({ length: 51 }, () => pergunta) }),
        corpo({ perguntas: [{ titulo: "q", tipo: "OPCOES", opcoes: ["Sim", { a: 1 }] }] }),
        corpo({ perguntas: [{ titulo: "q", tipo: "OPCOES", opcoes: Array.from({ length: 51 }, (_x, i) => `o${i}`) }] }),
        corpo({ perguntas: [null] }),
        corpo({ publicoMembroIds: Array.from({ length: 5001 }, (_x, i) => i + 1) })
      ]) {
        const r = await chamar(hEnquetes, { metodo: "POST", token, corpo: c });
        expect([200, 400]).toContain(r.status);
        expect(r.body.sucesso).toBe(false);
      }
      expect(rodou(/INSERT INTO Enquetes/)).toHaveLength(0);
    });
    test("falha no meio da criação: o que foi criado é desfeito (a enquete pela metade não fica aberta) e o erro continua subindo", async () => {
      quando(/INSERT INTO OpcoesEnquete/, () => { throw new Error("estourou"); });
      await expect(chamar(hEnquetes, { metodo: "POST", token: LOCAL(["reunioes"], ["A"], 5), corpo: corpo() })).rejects.toThrow("estourou");
      const limpeza = rodou(/DELETE FROM Enquetes WHERE EnqueteId = @enqueteId/);
      expect(limpeza).toHaveLength(1);
      expect(limpeza[0].inputs).toMatchObject({ enqueteId: 50 });
      expect(limpeza[0].sql).toMatch(/DELETE FROM PublicoEnqueteCustom[\s\S]*DELETE o FROM OpcoesEnquete[\s\S]*DELETE FROM PerguntasEnquete/);
    });
  });

  describe("POST encerrar", () => {
    beforeEach(() => {
      montaTudo();
      quando(/UPDATE Enquetes SET Status = 'ENCERRADA'/, [], 1);
    });
    const ligado = { id: "1", acao: "encerrar" };
    test("o criador (local) encerra a sua enquete: o UPDATE roda só em enquete ABERTA e há trilha", async () => {
      const r = await chamar(hEnquetes, { metodo: "POST", token: LOCAL(["reunioes"], ["A"], 5), ligado });
      expect(r.body.sucesso).toBe(true);
      const upd = rodou(/UPDATE Enquetes SET Status = 'ENCERRADA'/);
      expect(upd).toHaveLength(1);
      expect(upd[0].sql).toMatch(/Status = 'ABERTA'/);
      expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ tabela: "Enquetes", registroId: 1, acao: "Encerrou enquete", usuarioId: 5 });
    });
    test("outro papel local (que NÃO criou) recebe a mesma resposta de 'não encontrada' e nada é gravado; enquete inexistente = mesma resposta", async () => {
      const outro = await chamar(hEnquetes, { metodo: "POST", token: LOCAL(["reunioes"], ["A"], 6), ligado });
      const inexistente = await chamar(hEnquetes, { metodo: "POST", token: LOCAL(["reunioes"], ["A"], 6), ligado: { id: "77", acao: "encerrar" } });
      expect(outro.body).toMatchObject({ sucesso: false, mensagem: "Enquete não encontrada." });
      expect(inexistente).toEqual(outro);
      expect(rodou(/UPDATE Enquetes/)).toHaveLength(0);
    });
    test("o geral encerra a enquete de qualquer um; Global com lista e Líder de Departamento (TODAS) não", async () => {
      expect((await chamar(hEnquetes, { metodo: "POST", token: GERAL(["assembleia"], 1), ligado })).body.sucesso).toBe(true);
      expect(rodou(/UPDATE Enquetes/)).toHaveLength(1);
      mockConsultas = [];
      for (const token of [GLOBAL_COM_LISTA(["assembleia"]), LIDER_DEPARTAMENTO(["assembleia"])]) {
        expect((await chamar(hEnquetes, { metodo: "POST", token, ligado })).body.sucesso).toBe(false);
      }
      expect(rodou(/UPDATE Enquetes/)).toHaveLength(0);
    });
    test("sem permissão 403; PIN 403; id malformado 400; enquete que alguém encerrou no meio (0 linhas) não duplica a trilha", async () => {
      expect((await chamar(hEnquetes, { metodo: "POST", token: PIN(), ligado })).status).toBe(403);
      expect((await chamar(hEnquetes, { metodo: "POST", token: LOCAL(["pessoas"]), ligado })).status).toBe(403);
      expect((await chamar(hEnquetes, { metodo: "POST", token: GERAL(["assembleia"]), ligado: { id: "abc", acao: "encerrar" } })).status).toBe(400);
      mockRegras = mockRegras.filter(([p]) => !/UPDATE Enquetes/.test(p.source));
      quando(/UPDATE Enquetes SET Status = 'ENCERRADA'/, [], 0);
      registrarAuditoria.mockClear();
      const r = await chamar(hEnquetes, { metodo: "POST", token: GERAL(["assembleia"]), ligado });
      expect(r.body.sucesso).toBe(false);
      expect(registrarAuditoria).not.toHaveBeenCalled();
    });
  });
});

// =====================================================================================================================
// GestaoProjetos
// =====================================================================================================================
describe("GestaoProjetos", () => {
  describe("urgência", () => {
    const ligado = { id: "3", acao: "urgencia" };
    test("o geral marca urgência: o UPDATE só vale para projeto EM_PARECER e há trilha", async () => {
      quando(/UPDATE Projetos SET RegimeUrgencia = 1/, [], 1);
      const r = await chamar(hProjetos, { metodo: "POST", token: GERAL(["reunioes"]), ligado });
      expect(r.body.sucesso).toBe(true);
      const upd = rodou(/UPDATE Projetos SET RegimeUrgencia = 1/);
      expect(upd).toHaveLength(1);
      expect(upd[0].sql).toMatch(/Status = 'EM_PARECER'/);
      expect(upd[0].inputs).toMatchObject({ id: 3 });
      expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ tabela: "Projetos", registroId: 3, usuarioId: 1 });
    });
    test("projeto arquivado/já apto/inexistente (0 linhas) e id malformado: 'não encontrado', sem trilha", async () => {
      quando(/UPDATE Projetos SET RegimeUrgencia = 1/, [], 0);
      const r = await chamar(hProjetos, { metodo: "POST", token: GERAL(["reunioes"]), ligado });
      expect(r.body.sucesso).toBe(false);
      const ruim = await chamar(hProjetos, { metodo: "POST", token: GERAL(["reunioes"]), ligado: { id: "abc", acao: "urgencia" } });
      expect(ruim.body.sucesso).toBe(false);
      expect(rodou(/UPDATE Projetos/)).toHaveLength(1);                                    // só a primeira chamada chegou a tentar
      expect(registrarAuditoria).not.toHaveBeenCalled();
    });
  });

  describe("protocolar", () => {
    const corpo = (extra = {}) => ({ autorMembroId: 5, titulo: "Projeto X", texto: "Texto do projeto", comissaoTematica: "CFO", ...extra });
    beforeEach(() => {
      quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, (i) => [{ MembroId: i.id }]);
      quando(/INSERT INTO Projetos/, [{ ProjetoId: 70 }]);
    });
    test("papel local protocola em nome próprio (grava com ele como autor, cria os dois pareceres, trilha)", async () => {
      const r = await chamar(hProjetos, { metodo: "POST", token: LOCAL(["reunioes"], ["A"], 5), corpo: corpo() });
      expect(r.status).toBe(201);
      expect(rodou(/INSERT INTO Projetos/)[0].inputs).toMatchObject({ autorMembroId: 5, protocolo: "PROJ-2026-0001" });
      expect(rodou(/INSERT INTO PareceresComissao/).map(c => c.inputs.sigla)).toEqual(["CCJ", "CFO"]);
    });
    test("papel local NÃO protocola em nome de outra pessoa (nem com matrícula em formato disfarçado): 403 e nada gravado", async () => {
      for (const autorMembroId of [1, "1", 6, "05"]) {
        const r = await chamar(hProjetos, { metodo: "POST", token: LOCAL(["reunioes"], ["A"], 5), corpo: corpo({ autorMembroId }) });
        expect(r.status).toBe(403);
      }
      expect(rodou(/INSERT INTO Projetos/)).toHaveLength(0);
    });
    test("o geral protocola em nome de outra pessoa; autor inexistente/malformado = 'não encontrada'; campos que não são texto = 400", async () => {
      const ok = await chamar(hProjetos, { metodo: "POST", token: GERAL(["reunioes"]), corpo: corpo({ autorMembroId: 33 }) });
      expect(ok.status).toBe(201);
      expect(rodou(/INSERT INTO Projetos/)[0].inputs).toMatchObject({ autorMembroId: 33 });
      mockConsultas = [];
      const ruim = await chamar(hProjetos, { metodo: "POST", token: GERAL(["reunioes"]), corpo: corpo({ autorMembroId: "0x10" }) });
      expect(ruim.body.sucesso).toBe(false);
      expect((await chamar(hProjetos, { metodo: "POST", token: GERAL(["reunioes"]), corpo: corpo({ titulo: { a: 1 } }) })).status).toBe(400);
      expect((await chamar(hProjetos, { metodo: "POST", token: GERAL(["reunioes"]), corpo: corpo({ titulo: "t".repeat(201) }) })).status).toBe(400);
      expect(rodou(/INSERT INTO Projetos/)).toHaveLength(0);
    });
    test("sem permissão 403; PIN 403; sem sessão 401", async () => {
      expect((await chamar(hProjetos, { metodo: "POST", corpo: corpo() })).status).toBe(401);
      expect((await chamar(hProjetos, { metodo: "POST", token: PIN(5), corpo: corpo() })).status).toBe(403);
      expect((await chamar(hProjetos, { metodo: "POST", token: LOCAL(["pessoas"], ["A"], 5), corpo: corpo() })).status).toBe(403);
    });
  });

  describe("parecer", () => {
    const ligado = { id: "3", acao: "parecer", sigla: "CCJ" };
    beforeEach(() => quando(/FROM ComissaoMembros c/, [{ comissaoMembroId: 1, membroId: 5, nome: "Ana" }]));
    test("membro da comissão emite o parecer UMA vez e só com o projeto em parecer (a condição está no UPDATE)", async () => {
      quando(/UPDATE PareceresComissao SET Parecer/, [], 1);
      quando(/SELECT Parecer FROM PareceresComissao WHERE ProjetoId = @id/, [{ Parecer: "FAVORAVEL" }]);
      const r = await chamar(hProjetos, { metodo: "POST", token: PIN(5), ligado, corpo: { parecer: "FAVORAVEL" } });
      expect(r.body.sucesso).toBe(true);
      const upd = rodou(/UPDATE PareceresComissao SET Parecer/);
      expect(upd[0].sql).toMatch(/Parecer IS NULL/);
      expect(upd[0].sql).toMatch(/Status = 'EM_PARECER'/);
      expect(upd[0].inputs).toMatchObject({ projetoId: 3, sigla: "CCJ", parecer: "FAVORAVEL" });
    });
    test("parecer já emitido ou projeto fora de parecer (0 linhas): recusado, sem trilha", async () => {
      quando(/UPDATE PareceresComissao SET Parecer/, [], 0);
      const r = await chamar(hProjetos, { metodo: "POST", token: PIN(5), ligado, corpo: { parecer: "CONTRARIO" } });
      expect(r.body.sucesso).toBe(false);
      expect(registrarAuditoria).not.toHaveBeenCalled();
    });
    test("quem não é da comissão, id malformado e parecer inválido: nada é gravado", async () => {
      quando(/UPDATE PareceresComissao SET Parecer/, [], 1);
      expect((await chamar(hProjetos, { metodo: "POST", token: PIN(99), ligado, corpo: { parecer: "FAVORAVEL" } })).body.sucesso).toBe(false);
      expect((await chamar(hProjetos, { metodo: "POST", token: PIN(5), ligado: { id: "abc", acao: "parecer", sigla: "CCJ" }, corpo: { parecer: "FAVORAVEL" } })).body.sucesso).toBe(false);
      expect((await chamar(hProjetos, { metodo: "POST", token: PIN(5), ligado, corpo: { parecer: "TALVEZ" } })).status).toBe(400);
      expect(rodou(/UPDATE PareceresComissao/)).toHaveLength(0);
    });
  });
});

// =====================================================================================================================
// GestaoMediacoesArbitragens
// =====================================================================================================================
describe("GestaoMediacoesArbitragens", () => {
  const caso = (extra = {}) => ({ assunto: "Disputa do terreno", parteAId: 20, parteBDescricao: "Congregação Vila Nova", prazoDiasEncerramento: 60, ...extra });
  beforeEach(() => {
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, (i) => (i.id < 100 ? [{ MembroId: i.id }] : []));
    quando(/INSERT INTO MediacoesArbitragens/, [{ MediacaoId: 60 }]);
  });

  describe("instaurar (POST)", () => {
    test("sem sessão 401; PIN provisório 403", async () => {
      expect((await chamar(hMediacoes, { metodo: "POST", corpo: caso() })).status).toBe(401);
      expect((await chamar(hMediacoes, { metodo: "POST", token: tokenDe(20, { via: "PIN", pinProvisorio: true }), corpo: caso() })).status).toBe(403);
      expect(nada()).toBe(0);
    });
    test("membro que É uma das partes instaura o caso (grava com ele como instaurador)", async () => {
      const r = await chamar(hMediacoes, { metodo: "POST", token: PIN(20), corpo: caso() });
      expect(r.status).toBe(201);
      expect(rodou(/INSERT INTO MediacoesArbitragens/)[0].inputs).toMatchObject({ parteAId: 20, instauradoPor: 20, prazoDiasEncerramento: 60 });
      const comoParteB = await chamar(hMediacoes, { metodo: "POST", token: PIN(21), corpo: caso({ parteAId: undefined, parteADescricao: "Departamento X", parteBId: 21, parteBDescricao: undefined }) });
      expect(comoParteB.status).toBe(201);
    });
    test("membro que NÃO é parte (nem tem 'mediacao') não instaura: 403, e a matrícula alheia nem é consultada (sem sonda)", async () => {
      const r = await chamar(hMediacoes, { metodo: "POST", token: PIN(22), corpo: caso({ parteAId: 20, parteBId: 21, parteBDescricao: undefined }) });
      expect(r.status).toBe(403);
      expect(nada()).toBe(0);
    });
    test("quem tem 'mediacao' instaura caso entre terceiros; parte inexistente ou malformada = 'Matrícula não encontrada.' sem gravar", async () => {
      const ok = await chamar(hMediacoes, { metodo: "POST", token: GERAL(["mediacao"]), corpo: caso({ parteAId: 30, parteBId: 31, parteBDescricao: undefined }) });
      expect(ok.status).toBe(201);
      mockConsultas = [];
      for (const parteAId of [999, "0x10", "abc"]) {
        const r = await chamar(hMediacoes, { metodo: "POST", token: GERAL(["mediacao"]), corpo: caso({ parteAId }) });
        expect(r.body).toMatchObject({ sucesso: false, mensagem: "Matrícula não encontrada." });
      }
      expect(rodou(/INSERT INTO MediacoesArbitragens/)).toHaveLength(0);
    });
    test("prazo/valor/textos inválidos: 400 sem gravar", async () => {
      for (const extra of [{ prazoDiasEncerramento: 0 }, { prazoDiasEncerramento: 4000 }, { prazoDiasEncerramento: 1.5 }, { valorEnvolvido: -5 }, { assunto: "x".repeat(501) }, { assunto: { a: 1 } }, { parteBDescricao: "d".repeat(201) }]) {
        expect((await chamar(hMediacoes, { metodo: "POST", token: PIN(20), corpo: caso(extra) })).status).toBe(400);
      }
      expect(rodou(/INSERT INTO MediacoesArbitragens/)).toHaveLength(0);
    });
  });

  describe("leitura e andamento (permissão 'mediacao')", () => {
    test("id malformado: 'caso não encontrado' (nunca 500) em GET, PUT e sessões; sem 'mediacao' 403", async () => {
      // O banco simulado ACHARIA qualquer id: quem recusa é o id malformado.
      quando(/WHERE m\.MediacaoId = @id/, [{ mediacaoId: 3, dataInstauracao: "2026-01-01", prazoDiasEncerramento: 30 }]);
      quando(/SELECT \* FROM MediacoesArbitragens WHERE MediacaoId = @id/, [{ MediacaoId: 3, Assunto: "x", Status: "MEDIACAO_EM_CURSO" }]);
      quando(/SELECT MediacaoId FROM MediacoesArbitragens WHERE MediacaoId = @id/, [{ MediacaoId: 3 }]);
      for (const [metodo, ligado, corpo] of [["GET", { id: "abc" }], ["PUT", { id: "0x10" }, { acao: "DESIGNAR_MEDIADOR" }], ["POST", { id: "1e1", acao: "sessoes" }, { dataSessao: "2026-01-01" }]]) {
        const r = await chamar(hMediacoes, { metodo, token: GERAL(["mediacao"]), ligado, corpo });
        expect(r.body).toMatchObject({ sucesso: false, mensagem: "Caso não encontrado." });
      }
      expect(rodou(/INSERT INTO SessoesMediacao|UPDATE MediacoesArbitragens/)).toHaveLength(0);
      expect((await chamar(hMediacoes, { token: LOCAL(["reunioes"]), ligado: { id: "3" } })).status).toBe(403);
    });
    test("registrar sessão exige que o caso exista", async () => {
      quando(/SELECT MediacaoId FROM MediacoesArbitragens WHERE MediacaoId = @id/, (i) => (i.id === 3 ? [{ MediacaoId: 3 }] : []));
      quando(/INSERT INTO SessoesMediacao/, [{ SessaoMediacaoId: 1 }]);
      expect((await chamar(hMediacoes, { metodo: "POST", token: GERAL(["mediacao"]), ligado: { id: "3", acao: "sessoes" }, corpo: { dataSessao: "2026-01-01" } })).status).toBe(201);
      expect((await chamar(hMediacoes, { metodo: "POST", token: GERAL(["mediacao"]), ligado: { id: "4", acao: "sessoes" }, corpo: { dataSessao: "2026-01-01" } })).body.sucesso).toBe(false);
      expect(rodou(/INSERT INTO SessoesMediacao/)).toHaveLength(1);
    });
  });

  describe("sentença arbitral", () => {
    const sentenca = () => chamar(hMediacoes, { metodo: "PUT", token: GERAL(["mediacao"]), ligado: { id: "3" }, corpo: { acao: "REGISTRAR_SENTENCA", mimeType: "application/pdf", sentencaBase64: Buffer.from("%PDF-1.4").toString("base64") } });
    test("falha do armazenamento: o texto técnico do erro NÃO vai para o cliente", async () => {
      quando(/SELECT \* FROM MediacoesArbitragens WHERE MediacaoId = @id/, [{ MediacaoId: 3, Assunto: "x", Status: "ARBITRAGEM_EM_CURSO", CompromissoFirmadoEm: "2026-10-01T10:00:00" }]);
      storage.salvarDocumento.mockImplementationOnce(async () => { throw new Error("string-de-conexao-secreta"); });
      const r = await sentenca();
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.body)).not.toMatch(/string-de-conexao-secreta/);
    });
    test("sem o compromisso arbitral FIRMADO pelas duas partes não há sentença: nada é enviado ao armazenamento nem gravado (sem convenção de arbitragem, a sentença seria nula)", async () => {
      quando(/SELECT \* FROM MediacoesArbitragens WHERE MediacaoId = @id/, [{ MediacaoId: 3, Assunto: "x", Status: "ARBITRAGEM_EM_CURSO", CompromissoFirmadoEm: null, CompromissoHashProposto: "abc" }]);
      const r = await sentenca();
      expect(r.body).toMatchObject({ sucesso: false, mensagem: expect.stringMatching(/compromisso arbitral ainda não foi firmado/) });
      expect(storage.salvarDocumento).not.toHaveBeenCalled();
      expect(rodou(/UPDATE MediacoesArbitragens/)).toHaveLength(0);
    });
    test("com o compromisso firmado a sentença é gravada, e só se o caso ainda estiver em arbitragem com compromisso firmado (a corrida não derruba a regra)", async () => {
      quando(/SELECT \* FROM MediacoesArbitragens WHERE MediacaoId = @id/, [{ MediacaoId: 3, Assunto: "x", Status: "ARBITRAGEM_EM_CURSO", CompromissoFirmadoEm: "2026-10-01T10:00:00" }]);
      quando(/UPDATE MediacoesArbitragens SET SentencaArbitralUrl/, [], 1);
      const r = await sentenca();
      expect(r.body.sucesso).toBe(true);
      const gravacao = rodou(/UPDATE MediacoesArbitragens SET SentencaArbitralUrl/);
      expect(gravacao).toHaveLength(1);
      expect(gravacao[0].sql).toMatch(/Status = 'ARBITRAGEM_EM_CURSO' AND CompromissoFirmadoEm IS NOT NULL/);
    });
    test("o caso mudou entre a conferência e a gravação (0 linhas): a resposta diz isso e nada é auditado como sentença registrada", async () => {
      quando(/SELECT \* FROM MediacoesArbitragens WHERE MediacaoId = @id/, [{ MediacaoId: 3, Assunto: "x", Status: "ARBITRAGEM_EM_CURSO", CompromissoFirmadoEm: "2026-10-01T10:00:00" }]);
      quando(/UPDATE MediacoesArbitragens SET SentencaArbitralUrl/, [], 0);
      const r = await sentenca();
      expect(r.body).toMatchObject({ sucesso: false, mensagem: expect.stringMatching(/mudou/) });
      expect(registrarAuditoria).not.toHaveBeenCalledWith(expect.objectContaining({ acao: "Registrou sentença arbitral" }));
    });
  });

  describe("BIFURCAR_DISCIPLINAR abre processo disciplinar: 'disciplina' + a pessoa no escopo", () => {
    const ligado = { id: "3" };
    const bifurcar = (token, extra = {}) => chamar(hMediacoes, { metodo: "PUT", token, ligado, corpo: { acao: "BIFURCAR_DISCIPLINAR", membroId: 40, infracoesIds: [1], ...extra } });
    beforeEach(() => {
      quando(/SELECT \* FROM MediacoesArbitragens WHERE MediacaoId = @id/, [{ MediacaoId: 3, Assunto: "Disputa", ParteAId: 40, ParteBId: 41 }]);
      quando(/c\.Nome AS CongregacaoNome/, (i) => (i.id === 40 ? [{ MembroId: 40, Nome: "Ana", Status: "ATIVO", CongregacaoNome: "A" }] : i.id === 41 ? [{ MembroId: 41, Nome: "Beto", Status: "ATIVO", CongregacaoNome: "B" }] : []));
      quando(/UPDATE MediacoesArbitragens SET ProcessoDisciplinarBifurcadoId/, [], 1);
    });
    test("só com 'mediacao' (sem 'disciplina'): 403 e o processo não é aberto", async () => {
      const r = await bifurcar(LOCAL(["mediacao"], ["A"]));
      expect(r.status).toBe(403);
      expect(mediacao.bifurcarParaProcessoDisciplinar).not.toHaveBeenCalled();
      expect(rodou(/UPDATE MediacoesArbitragens/)).toHaveLength(0);
    });
    test("com 'disciplina' mas a pessoa é de FORA do escopo: a mesma resposta de matrícula inexistente, processo não aberto", async () => {
      const fora = await bifurcar(LOCAL(["mediacao", "disciplina"], ["A"]), { membroId: 41 });
      const inexistente = await bifurcar(LOCAL(["mediacao", "disciplina"], ["A"]), { membroId: 999 });
      expect(fora.body).toMatchObject({ sucesso: false, mensagem: "Matrícula não encontrada. Cadastre a pessoa antes." });
      expect(inexistente).toEqual(fora);
      expect(mediacao.bifurcarParaProcessoDisciplinar).not.toHaveBeenCalled();
    });
    test("pessoa do escopo: abre o processo (com a matrícula canônica) e liga ao caso", async () => {
      const r = await bifurcar(LOCAL(["mediacao", "disciplina"], ["A"]));
      expect(r.body.sucesso).toBe(true);
      expect(mediacao.bifurcarParaProcessoDisciplinar).toHaveBeenCalledTimes(1);
      expect(mediacao.bifurcarParaProcessoDisciplinar.mock.calls[0][2]).toMatchObject({ membroId: 40, infracoesIds: [1] });
      expect(rodou(/UPDATE MediacoesArbitragens SET ProcessoDisciplinarBifurcadoId/)[0].inputs).toMatchObject({ id: 3, processoId: 77 });
    });
    test("o geral alcança qualquer pessoa", async () => {
      expect((await bifurcar(GERAL(["mediacao", "disciplina"]), { membroId: 41 })).body.sucesso).toBe(true);
    });
    test("órgão territorial informado: só se a pessoa que abre é do órgão (mesma regra de AbrirProcessoDisciplinar)", async () => {
      quando(/FROM OrgaosLocais WHERE OrgaoLocalId = @id/, [{ Sigla: "JAI", Nome: "JAI A", Nivel: 1, ReferenciaId: 3, Ativo: true }]);
      escopoMod.membroAutorizadoNoOrgaoLocal.mockImplementation(async () => false);
      const negado = await bifurcar(LOCAL(["mediacao", "disciplina"], ["A"]), { orgaoLocalId: 12 });
      expect(negado.body).toMatchObject({ sucesso: false, mensagem: "Você não tem vínculo com este órgão territorial." });
      expect(mediacao.bifurcarParaProcessoDisciplinar).not.toHaveBeenCalled();
      escopoMod.membroAutorizadoNoOrgaoLocal.mockImplementation(async () => true);
      expect((await bifurcar(LOCAL(["mediacao", "disciplina"], ["A"]), { orgaoLocalId: 12 })).body.sucesso).toBe(true);
    });
  });
});

// =====================================================================================================================
// ListarReunioes
// =====================================================================================================================
describe("ListarReunioes", () => {
  const sessoes = [
    { sessaoId: 1, descricao: "CLI", orgaoId: 3, orgaoLocalId: null, orgaoSigla: "CLI", totalPresentes: 10 },
    { sessaoId: 2, descricao: "JAI A", orgaoId: null, orgaoLocalId: 11, orgaoSigla: "JAI", totalPresentes: 4 },
    { sessaoId: 3, descricao: "JAI B", orgaoId: null, orgaoLocalId: 12, orgaoSigla: "JAI", totalPresentes: 5 },
    { sessaoId: 4, descricao: "CRA", orgaoId: null, orgaoLocalId: 13, orgaoSigla: "CRA", totalPresentes: 6 }
  ];
  beforeEach(() => {
    quando(/FROM Sessoes s\s+LEFT JOIN Orgaos o/, sessoes.map(s => ({ ...s })));
    // 11 = JAI da congregação 3 (A); 12 = JAI da congregação 4 (B); 13 = CRA da região 1 (que cobre A e B)
    quando(/SELECT OrgaoLocalId, Nivel, ReferenciaId FROM OrgaosLocais WHERE OrgaoLocalId IN/, [
      { OrgaoLocalId: 11, Nivel: 1, ReferenciaId: 3 }, { OrgaoLocalId: 12, Nivel: 1, ReferenciaId: 4 }, { OrgaoLocalId: 13, Nivel: 3, ReferenciaId: 1 }
    ]);
    quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, (i) => [{ Nome: i.id === 3 ? "A" : "B" }]);
    quando(/SELECT Nome FROM Congregacoes WHERE AreaId IN/, [{ Nome: "A" }, { Nome: "B" }]);
  });
  const ids = (r) => r.body.map(s => s.sessaoId);

  test("sem sessão 401; PIN 403; sem permissão 403; filtro malformado 400 — nada lido", async () => {
    expect((await chamar(hReunioes, {})).status).toBe(401);
    expect((await chamar(hReunioes, { token: PIN() })).status).toBe(403);
    expect((await chamar(hReunioes, { token: LOCAL(["pessoas"]) })).status).toBe(403);
    expect((await chamar(hReunioes, { token: LOCAL(["reunioes"]), query: { orgaoId: "abc" } })).status).toBe(400);
    expect((await chamar(hReunioes, { token: LOCAL(["reunioes"]), query: { orgaoLocalId: "0x10" } })).status).toBe(400);
    expect(nada()).toBe(0);
  });
  test("Dirigente de A vê o órgão central e a JAI de A; a JAI de B não aparece; a CRA da região que cobre A aparece", async () => {
    const r = await chamar(hReunioes, { token: LOCAL(["reunioes"], ["A"]) });
    expect(ids(r)).toEqual([1, 2, 4]);
  });
  test("Pastor de Área (A e B) vê as duas JAI; sem escopo de lista (vazio) vê só os órgãos centrais", async () => {
    expect(ids(await chamar(hReunioes, { token: LOCAL(["reunioes"], ["A", "B"], 5, "AREA") }))).toEqual([1, 2, 3, 4]);
    expect(ids(await chamar(hReunioes, { token: LOCAL(["reunioes"], []) }))).toEqual([1]);
  });
  test("?orgaoLocalId= de fora do escopo devolve lista vazia, igual a 'não existe'", async () => {
    mockRegras.unshift([/FROM Sessoes s\s+LEFT JOIN Orgaos o[\s\S]*s\.OrgaoLocalId = @orgaoLocalId/, [{ ...sessoes[2] }], 0]);      // o banco, com o filtro, devolve só a JAI de B
    const fora = await chamar(hReunioes, { token: LOCAL(["reunioes"], ["A"]), query: { orgaoLocalId: "12" } });
    expect(fora.status).toBe(200);
    expect(fora.body).toEqual([]);
  });
  test("órgão territorial de nível desconhecido não é alcançado por papel local (falha fechado); o geral o vê", async () => {
    mockRegras.unshift([/SELECT OrgaoLocalId, Nivel, ReferenciaId FROM OrgaosLocais WHERE OrgaoLocalId IN/, [{ OrgaoLocalId: 11, Nivel: 9, ReferenciaId: 3 }], 0]);
    expect(ids(await chamar(hReunioes, { token: LOCAL(["reunioes"], ["A"]) }))).toEqual([1]);
    expect(ids(await chamar(hReunioes, { token: GERAL(["reunioes"]) }))).toEqual([1, 2, 3, 4]);
  });
  test("geral (e Líder de Departamento com escopo TODAS) veem tudo sem consultar a hierarquia", async () => {
    expect(ids(await chamar(hReunioes, { token: GERAL(["reunioes"]) }))).toEqual([1, 2, 3, 4]);
    expect(ids(await chamar(hReunioes, { token: LIDER_DEPARTAMENTO(["reunioes"]) }))).toEqual([1, 2, 3, 4]);
    expect(rodou(/FROM OrgaosLocais WHERE OrgaoLocalId IN/)).toHaveLength(0);
  });
});

// =====================================================================================================================
// MinutaAta
// =====================================================================================================================
describe("MinutaAta", () => {
  const sessaoLocal = { SessaoId: 9, OrgaoId: null, OrgaoLocalId: 11, Descricao: "Reunião da JAI", dataSessao: "2026-01-10", TipoSessao: "ORDINARIA", Status: "ENCERRADA", Pauta: "Pauta", Materias: null, ReformaNucleoFundamental: false, VinculadaSessaoId: null, orgaoNome: "JAI A", orgaoSigla: "JAI", orgaoLocalNivel: 1, orgaoLocalReferenciaId: 3 };
  const sessaoCentral = { ...sessaoLocal, SessaoId: 8, OrgaoId: 3, OrgaoLocalId: null, orgaoNome: "CLI", orgaoSigla: "CLI", orgaoLocalNivel: null, orgaoLocalReferenciaId: null };
  const monta = (sessao) => {
    quando(/FROM Sessoes s\s+LEFT JOIN Orgaos o/, [sessao]);
    quando(/FROM Presencas p JOIN MembroReferencia m/, [
      { presente: true, faltaJustificada: false, motivoJustificativa: null, nome: "Ana" },
      { presente: false, faltaJustificada: true, motivoJustificativa: "Cirurgia de urgência", nome: "Beto" }
    ]);
    quando(/FROM Enquetes WHERE SessaoId = @id/, [{ EnqueteId: 4, Titulo: "Aprovar contas?", Vinculante: true, QuorumTipo: "MAIORIA_SIMPLES", Status: "ENCERRADA", ResultadoAprovado: true }]);
    quando(/FROM PerguntasEnquete p\s+JOIN OpcoesEnquete o/, [{ perguntaId: 40, ordem: 1, pergunta: "Aprova?", opcao: "Sim", total: 7 }, { perguntaId: 40, ordem: 1, pergunta: "Aprova?", opcao: "Não", total: 2 }]);
  };
  const ligado = (sessaoId) => ({ sessaoId: String(sessaoId) });
  const lePresencas = () => rodou(/FROM Presencas p JOIN MembroReferencia m/).length;

  test("sem sessão 401; PIN 403; sem permissão 403; id malformado 404 — nada lido", async () => {
    expect((await chamar(hMinuta, { ligado: ligado(9) })).status).toBe(401);
    expect((await chamar(hMinuta, { token: PIN(), ligado: ligado(9) })).status).toBe(403);
    expect((await chamar(hMinuta, { token: LOCAL(["pessoas"]), ligado: ligado(9) })).status).toBe(403);
    expect((await chamar(hMinuta, { token: LOCAL(["reunioes"]), ligado: ligado("abc") })).status).toBe(404);
    expect(nada()).toBe(0);
  });
  test("sessão de órgão local: quem é do órgão baixa a minuta (.docx); quem não é recebe a MESMA resposta de 'não encontrada' e a lista de presença nem é lida", async () => {
    monta(sessaoLocal);
    escopoMod.membroAutorizadoNoOrgaoLocal.mockImplementation(async () => true);
    const ok = await chamar(hMinuta, { token: LOCAL(["reunioes"], ["A"], 5), ligado: ligado(9) });
    expect(ok.status).toBe(200);
    expect(ok.headers["Content-Disposition"]).toMatch(/minuta-sessao-9\.docx/);
    expect(Buffer.isBuffer(ok.body)).toBe(true);
    const chamada = escopoMod.membroAutorizadoNoOrgaoLocal.mock.calls[0];
    expect([chamada[2], chamada[3]]).toEqual([5, 11]);

    mockConsultas = [];
    escopoMod.membroAutorizadoNoOrgaoLocal.mockImplementation(async () => false);
    const fora = await chamar(hMinuta, { token: LOCAL(["reunioes"], ["B"], 5), ligado: ligado(9) });
    mockRegras = [];
    const inexistente = await chamar(hMinuta, { token: LOCAL(["reunioes"], ["B"], 5), ligado: ligado(77) });
    expect(fora.status).toBe(404);
    expect(fora.body).toMatchObject({ sucesso: false, mensagem: "Reunião não encontrada." });
    expect(inexistente).toEqual(fora);
    expect(lePresencas()).toBe(0);
  });
  test("sessão de órgão central (CLI, Assembleia...): papel local não baixa (não pergunta nem pelo vínculo); o geral baixa", async () => {
    monta(sessaoCentral);
    escopoMod.membroAutorizadoNoOrgaoLocal.mockImplementation(async () => true);
    const local = await chamar(hMinuta, { token: LOCAL(["reunioes"], ["A"], 5), ligado: ligado(8) });
    expect(local.status).toBe(404);
    expect(lePresencas()).toBe(0);
    const lider = await chamar(hMinuta, { token: LIDER_DEPARTAMENTO(["reunioes"]), ligado: ligado(8) });
    expect(lider.status).toBe(404);
    const geral = await chamar(hMinuta, { token: GERAL(["reunioes"]), ligado: ligado(8) });
    expect(geral.status).toBe(200);
    expect(lePresencas()).toBe(1);
  });
  test("o geral baixa a minuta de órgão local sem depender do vínculo; Global com lista não", async () => {
    monta(sessaoLocal);
    expect((await chamar(hMinuta, { token: GERAL(["reunioes"]), ligado: ligado(9) })).status).toBe(200);
    expect(escopoMod.membroAutorizadoNoOrgaoLocal).not.toHaveBeenCalled();
    expect((await chamar(hMinuta, { token: GLOBAL_COM_LISTA(["reunioes"]), ligado: ligado(9) })).status).toBe(404);
  });
  test("a contagem da enquete lê o modelo atual (perguntas/opções/respostas) — a consulta antiga de VotosEnquete dava 500", async () => {
    monta(sessaoLocal);
    const r = await chamar(hMinuta, { token: GERAL(["reunioes"]), ligado: ligado(9) });
    expect(r.status).toBe(200);
    const consulta = rodou(/FROM PerguntasEnquete p/);
    expect(consulta).toHaveLength(1);
    expect(consulta[0].sql).toMatch(/RespostasEnquete/);
    expect(mockConsultas.some(c => /VotosEnquete/.test(c.sql))).toBe(false);
    expect(consulta[0].inputs).toMatchObject({ id: 4 });
  });
});
