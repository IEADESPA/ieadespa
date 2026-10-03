// Defesa em profundidade no banco (migrações 127 a 131): os índices ÚNICOS recusam a segunda gravação quando dois pedidos chegam ao mesmo tempo. Aqui se prova o lado da
// APLICAÇÃO: toda rota que grava nessas tabelas responde 409 com uma frase que a pessoa entende — nunca 500 — quando o banco recusa uma repetição (erro 2601/2627), e
// qualquer OUTRO erro continua subindo (não se engole falha de verdade). Os pontos que são "tolerantes por desenho" (fechar a reunião lançando faltas, presença na mesa,
// criação automática de órgão territorial, relatório congelado) seguem em frente em vez de falhar. O banco é simulado por TEXTO da consulta (como em escopoFinanceiro3.test.js).
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => {
  class Requisicao {
    constructor(tx) { this.tx = tx || null; this.inputs = {}; }
    input(nome, _tipo, valor) { this.inputs[nome] = valor; return this; }
    async query(texto) {
      mockConsultas.push({ sql: texto, inputs: { ...this.inputs }, emTransacao: !!this.tx });
      for (const [padrao, valor, afetadas] of mockRegras) {
        if (padrao.test(texto)) {
          const recordset = typeof valor === "function" ? valor(this.inputs, texto) : valor;
          return { recordset, rowsAffected: [afetadas === undefined ? 0 : afetadas] };
        }
      }
      return { recordset: [], rowsAffected: [0] };
    }
  }
  class Transacao {
    constructor(pool) { this.pool = pool; }
    async begin() { mockConsultas.push({ sql: "<<BEGIN>>", inputs: {} }); }
    async commit() { mockConsultas.push({ sql: "<<COMMIT>>", inputs: {} }); }
    async rollback() { mockConsultas.push({ sql: "<<ROLLBACK>>", inputs: {} }); }
  }
  const sqlFalso = new Proxy({}, { get: (_alvo, prop) => (prop === "Transaction" ? Transacao : prop === "Request" ? Requisicao : () => undefined) });
  return { getPool: async () => ({ request: () => new Requisicao(null) }), sql: sqlFalso };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, urlDocumentoComSas: (u) => (u ? `${u}?sas` : u), salvarFoto: jest.fn(), salvarDocumento: jest.fn(async () => "https://blob/doc-1") }));
jest.mock("../universo", () => ({
  composicaoCLI: jest.fn(),
  membrosComCartaMudancaEmitida: jest.fn(async () => new Set()),
  universoDoOrgao: jest.fn(async () => [])
}));
jest.mock("../escopo", () => ({
  ...jest.requireActual("../escopo"),
  membroAutorizadoNoOrgaoLocal: jest.fn(async () => true)
}));

const auth = require("../auth");
const { registrarAuditoria } = require("../auditoria");
const universo = require("../universo");
const { violouUnicidade, conflito, comConflito } = require("../violacaoUnica");
const credenciamento = require("../credenciamento");
const hOrgaos = require("../../GetOrgaos/index.js");
const hAssentos = require("../../GestaoAssentos/index.js");
const hComissoes = require("../../GestaoComissoes/index.js");
const hCatalogos = require("../../GestaoCatalogos/index.js");
const hPresenca = require("../../RegistrarPresenca/index.js");
const hEncerrar = require("../../EncerrarReuniao/index.js");
const hCredenciamento = require("../../GestaoCredenciamento/index.js");
const hRemessas = require("../../GestaoRemessasBancarias/index.js");
const hPrebendas = require("../../GestaoPrebendas/index.js");
const hPrebendados = require("../../GestaoPrebendados/index.js");
const hFornecedores = require("../../GestaoFornecedores/index.js");

async function chamar(handler, { metodo = "GET", corpo = {}, token, ligado = {}, query = {} } = {}) {
  const context = { bindingData: ligado, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const rodou = (padrao) => mockConsultas.filter(c => padrao.test(c.sql));
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], via: "SENHA", ...extra });
const GERAL = (permissoes, membroId = 1) => tokenDe(membroId, { nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes });

// o que o driver devolve quando o banco recusa: número 2601 (índice único) ou 2627 (restrição UNIQUE/PK) e o nome do índice no texto
const erroUnico = (indice, numero = 2601) => Object.assign(new Error(`Cannot insert duplicate key row in object 'dbo.Tabela' with unique index '${indice}'. The duplicate key value is (x).`), { number: numero });
const falhaComum = () => Object.assign(new Error("Timeout expired: segredo-interno"), { number: -2 });
const lancar = (erro) => () => { throw erro; };

beforeEach(() => {
  mockRegras = [];
  mockConsultas = [];
  jest.clearAllMocks();
  universo.universoDoOrgao.mockImplementation(async () => []);
  universo.membrosComCartaMudancaEmitida.mockImplementation(async () => new Set());
});

describe("violouUnicidade / conflito / comConflito", () => {
  test("só 2601 e 2627 contam (direto no erro ou em originalError); qualquer outro número, erro sem número e valores vazios, não", () => {
    expect(violouUnicidade({ number: 2601 })).toBe(true);
    expect(violouUnicidade({ number: 2627 })).toBe(true);
    expect(violouUnicidade({ originalError: { number: 2627 } })).toBe(true);
    expect(violouUnicidade({ number: 2601, originalError: { number: 1 } })).toBe(true);
    for (const outro of [{ number: 547 }, { number: 1205 }, { number: 2600 }, { number: 2628 }, { number: "2601" }, new Error("x"), {}, null, undefined, "2601", 2601]) {
      expect(violouUnicidade(outro)).toBe(false);
    }
  });
  test("o conflito é 409 com { sucesso: false, mensagem } em JSON", () => {
    expect(conflito("já existe")).toEqual({ status: 409, headers: { "Content-Type": "application/json" }, body: { sucesso: false, mensagem: "já existe" } });
  });
  test("comConflito: devolve o que a rota devolve; transforma só a violação de unicidade em 409; repassa a frase calculada pelo erro, pelo context e pelo req; relança o resto", async () => {
    const ok = comConflito(async (context) => { context.res = { status: 200 }; return "feito"; }, "x");
    const c1 = {};
    expect(await ok(c1, {})).toBe("feito");
    expect(c1.res).toEqual({ status: 200 });

    const perde = comConflito(async () => { throw erroUnico("UX_Qualquer"); }, "frase fixa");
    const c2 = {};
    await perde(c2, {});
    expect(c2.res.status).toBe(409);
    expect(c2.res.body).toEqual({ sucesso: false, mensagem: "frase fixa" });

    const calculada = comConflito(async () => { throw erroUnico("UX_Abc"); }, (erro, context, req) => `${/UX_Abc/.test(erro.message)}|${context.id}|${req.id}`);
    const c3 = { id: "ctx" };
    await calculada(c3, { id: "req" });
    expect(c3.res.body.mensagem).toBe("true|ctx|req");

    const falha = comConflito(async () => { throw falhaComum(); }, "x");
    await expect(falha({}, {})).rejects.toThrow("Timeout expired");
  });
});

describe("GetOrgaos — a sigla repetida na corrida (UX_Orgaos_Sigla)", () => {
  test("criar: o INSERT perde para outro pedido → 409 com a frase da sigla, nada na trilha de auditoria", async () => {
    quando(/SELECT TOP 1 OrgaoId FROM Orgaos WHERE Sigla/, []);
    quando(/INSERT INTO Orgaos/, lancar(erroUnico("UX_Orgaos_Sigla")));
    const r = await chamar(hOrgaos, { metodo: "POST", token: GERAL(["pessoas"]), corpo: { sigla: "NOVO", nome: "Novo órgão" } });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ sucesso: false, mensagem: "Já existe um órgão com essa sigla." });
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("renomear para uma sigla que acabou de ser criada por outro: o UPDATE perde → 409", async () => {
    quando(/SELECT TOP 1 OrgaoId FROM Orgaos WHERE Sigla/, []);
    quando(/FROM Orgaos WHERE OrgaoId = @id/, [{ orgaoId: 9, sigla: "VELHA", nome: "Velha" }]);
    quando(/UPDATE Orgaos/, lancar(erroUnico("UX_Orgaos_Sigla")));
    const r = await chamar(hOrgaos, { metodo: "POST", token: GERAL(["pessoas"]), corpo: { orgaoId: 9, sigla: "NOVA", nome: "Velha" } });
    expect(r.status).toBe(409);
    expect(r.body.mensagem).toBe("Já existe um órgão com essa sigla.");
  });
  test("outra falha do banco NÃO vira 409: continua subindo", async () => {
    quando(/SELECT TOP 1 OrgaoId FROM Orgaos WHERE Sigla/, []);
    quando(/INSERT INTO Orgaos/, lancar(falhaComum()));
    await expect(chamar(hOrgaos, { metodo: "POST", token: GERAL(["pessoas"]), corpo: { sigla: "NOVO", nome: "Novo órgão" } })).rejects.toThrow("Timeout expired");
  });
});

describe("GestaoAssentos — o cargo fixo ocupado na corrida (UX_Assentos_CargoAtivo)", () => {
  const regras = () => {
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, [{ MembroId: 40 }]);
    quando(/SELECT OrgaoId, Sigla FROM Orgaos WHERE OrgaoId = @id/, [{ OrgaoId: 3, Sigla: "DIRETORIA_EXECUTIVA" }]);
    quando(/SELECT TOP 1 AssentoId FROM Assentos WHERE OrgaoId/, []);                                        // a conferência de cargoJaOcupado ainda vê o cargo livre
  };
  test("dois pedidos para o mesmo cargo: o segundo INSERT é recusado pelo banco → 409 amigável, sem auditoria", async () => {
    regras();
    quando(/INSERT INTO Assentos/, lancar(erroUnico("UX_Assentos_CargoAtivo")));
    const r = await chamar(hAssentos, { metodo: "POST", token: GERAL(["pessoas"]), corpo: { membroId: 40, orgaoId: 3, tipoAssento: "FUNCAO", cargoOuFuncao: "PRESIDENTE" } });
    expect(r.status).toBe(409);
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/acabou de ser ocupado por outra pessoa \(1 titular por cargo\)/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("o caminho comum não muda: cargo livre grava e responde 201", async () => {
    regras();
    quando(/INSERT INTO Assentos/, [{ AssentoId: 77 }]);
    quando(/FROM Assentos a\s+JOIN MembroReferencia m/, [{ assentoId: 77, membroId: 40 }]);
    const r = await chamar(hAssentos, { metodo: "POST", token: GERAL(["pessoas"]), corpo: { membroId: 40, orgaoId: 3, tipoAssento: "FUNCAO", cargoOuFuncao: "PRESIDENTE" } });
    expect(r.status).toBe(201);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
  test("outra falha do banco NÃO vira 409", async () => {
    regras();
    quando(/INSERT INTO Assentos/, lancar(falhaComum()));
    await expect(chamar(hAssentos, { metodo: "POST", token: GERAL(["pessoas"]), corpo: { membroId: 40, orgaoId: 3, tipoAssento: "FUNCAO", cargoOuFuncao: "PRESIDENTE" } })).rejects.toThrow("Timeout expired");
  });
});

describe("GestaoComissoes — a mesma pessoa ativa duas vezes na comissão (UX_ComissaoMembros_Ativo)", () => {
  const adicionar = (sigla) => chamar(hComissoes, { metodo: "POST", token: GERAL(["pessoas", "financeiro"]), ligado: { sigla }, corpo: { membroId: 40 } });
  const regras = () => {
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, [{ MembroId: 40 }]);
    quando(/FROM ComissaoMembros c\s+JOIN MembroReferencia m/, []);                                        // a conferência "já está na comissão" ainda não vê o outro pedido
  };
  test.each([["ccj", "CCJ"], ["pmo", "PMO"]])("%s: o INSERT perde para outro pedido → 409 'Essa pessoa já está na %s.', sem auditoria", async (rota, sigla) => {
    regras();
    quando(/INSERT INTO ComissaoMembros/, lancar(erroUnico("UX_ComissaoMembros_Ativo")));
    const r = await adicionar(rota);
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ sucesso: false, mensagem: `Essa pessoa já está na ${sigla}.` });
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("o caminho comum não muda: membro novo grava e responde 201", async () => {
    regras();
    quando(/INSERT INTO ComissaoMembros/, [{ ComissaoMembroId: 9 }]);
    const r = await adicionar("ccj");
    expect(r.status).toBe(201);
    expect(r.body.sucesso).toBe(true);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
  test("outra falha do banco NÃO vira 409", async () => {
    regras();
    quando(/INSERT INTO ComissaoMembros/, lancar(falhaComum()));
    await expect(adicionar("ccj")).rejects.toThrow("Timeout expired");
  });
});

describe("GestaoCatalogos — nome/sigla/código repetido (UX_Congregacoes_Nome e demais das migrações 127 e 130)", () => {
  // cada catálogo pede a permissão da própria área (pessoas, permissoes, financeiro...): o geral do teste tem todas
  const criar = (catalogo, corpo) => chamar(hCatalogos, { metodo: "POST", token: GERAL(["pessoas", "permissoes", "financeiro", "disciplina", "mediacao", "estrutura", "catalogos"]), ligado: { catalogo }, corpo });
  test("congregação homônima ao criar → 409 com a frase da congregação (e nada na trilha)", async () => {
    quando(/INSERT INTO Congregacoes/, lancar(erroUnico("UX_Congregacoes_Nome")));
    const r = await criar("congregacoes", { nome: "Sede" });
    expect(r.status).toBe(409);
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/Já existe uma congregação com esse nome/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("renomear congregação para um nome que já existe (UPDATE) → 409", async () => {
    quando(/SELECT \* FROM Congregacoes WHERE CongregacaoId = @id/, [{ CongregacaoId: 3, Nome: "Betel" }]);
    quando(/UPDATE Congregacoes SET/, lancar(erroUnico("UX_Congregacoes_Nome")));
    const r = await criar("congregacoes", { id: 3, nome: "Sede" });
    expect(r.status).toBe(409);
    expect(r.body.mensagem).toMatch(/congregação com esse nome/);
  });
  test("cada índice dos cadastros tem a SUA frase; um índice desconhecido (ou chave primária) cai na frase genérica, ainda 409", async () => {
    const casos = [
      ["congregacoes", "INSERT INTO Congregacoes", "UX_Congregacoes_Slug", /endereço no site/],
      ["cargosMinisteriais", "INSERT INTO CargosMinisteriais", "UX_CargosMinisteriais_Sigla", /cargo ministerial com essa sigla/],
      ["departamentos", "INSERT INTO Departamentos", "UX_Departamentos_Sigla", /departamento com essa sigla/],
      ["papeis", "INSERT INTO Papeis", "UX_Papeis_Nome", /papel com esse nome/],
      ["situacoes", "INSERT INTO SituacoesMembro", "UX_SituacoesMembro_Sigla", /situação de membro com essa sigla/],
      ["statuses", "INSERT INTO StatusMembro", "UX_StatusMembro_Sigla", /status de membro com essa sigla/],
      ["prazos", "INSERT INTO Prazos", "UX_Prazos_Sigla", /prazo com essa sigla/],
      ["funcionalidades", "INSERT INTO Funcionalidades", "UX_Funcionalidades_Chave", /funcionalidade com essa chave/],
      ["orgaosLocais", "INSERT INTO OrgaosLocais", "UX_OrgaosLocais_Unidade_Sigla", /unidade já tem um órgão com essa sigla/],
      ["areas", "INSERT INTO Areas", "PK__Areas__abc", /Já existe um registro com esses dados neste cadastro/]
    ];
    for (const [catalogo, insert, indice, frase] of casos) {
      mockRegras = []; mockConsultas = [];
      quando(new RegExp(insert), lancar(erroUnico(indice, indice.startsWith("PK") ? 2627 : 2601)));
      const r = await criar(catalogo, { nome: "X", sigla: "X", chave: "x", ativo: true, nivel: 1, referenciaId: 1 });
      expect(r.status).toBe(409);
      expect(r.body.mensagem).toMatch(frase);
    }
  });
  test("criar a unidade já cria os órgãos territoriais: se outro pedido criou o mesmo órgão no meio (UX_OrgaosLocais_Unidade_Sigla), segue em frente e a unidade é criada", async () => {
    quando(/INSERT INTO Congregacoes/, [{ CongregacaoId: 8 }]);
    quando(/SELECT \* FROM Congregacoes WHERE CongregacaoId = @id/, [{ CongregacaoId: 8, Nome: "Nova" }]);
    quando(/IF NOT EXISTS \(SELECT 1 FROM OrgaosLocais/, lancar(erroUnico("UX_OrgaosLocais_Unidade_Sigla")));
    const r = await criar("congregacoes", { nome: "Nova" });
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(true);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
  test("na criação automática, uma falha que NÃO é de unicidade não é engolida", async () => {
    quando(/INSERT INTO Congregacoes/, [{ CongregacaoId: 8 }]);
    quando(/SELECT \* FROM Congregacoes WHERE CongregacaoId = @id/, [{ CongregacaoId: 8, Nome: "Nova" }]);
    quando(/IF NOT EXISTS \(SELECT 1 FROM OrgaosLocais/, lancar(falhaComum()));
    await expect(criar("congregacoes", { nome: "Nova" })).rejects.toThrow("Timeout expired");
  });
  test("o caminho comum não muda: cadastro novo grava e responde 200", async () => {
    quando(/INSERT INTO Departamentos/, [{ DepartamentoId: 4 }]);
    quando(/SELECT \* FROM Departamentos WHERE DepartamentoId = @id/, [{ DepartamentoId: 4, Sigla: "NOVO", Nome: "Novo" }]);
    const r = await criar("departamentos", { sigla: "NOVO", nome: "Novo" });
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(true);
  });
});

describe("RegistrarPresenca — dois toques ao mesmo tempo (UX_Presencas_Sessao_Membro)", () => {
  const sessao = { sessaoId: 5, orgaoId: 3, orgaoLocalId: null, descricao: "Reunião", senhaAcesso: "abc", orgaoSigla: "CLI", orgaoNome: "CLI", nivel: null, referenciaId: null };
  const regras = () => {
    quando(/WHERE s\.Status = 'ABERTA'/, [sessao]);
    quando(/FROM MembroReferencia WHERE MembroId = @mat/, [{ membroId: 40, nome: "Ana" }]);
    quando(/SELECT 1 AS x FROM Presencas/, []);                                                              // o "já registrou?" ainda não vê a presença do outro pedido
    universo.universoDoOrgao.mockImplementation(async () => [{ membroId: 40 }]);
  };
  // a origem do pedido entra no limitador por instância: cada teste usa uma matrícula/origem própria para não esbarrar nele
  const presenca = () => chamar(hPresenca, { metodo: "POST", corpo: { matricula: 40, senha: "abc" } });
  test("o segundo INSERT perde → 409 com a mesma frase do 'já registrado' comum, e nenhuma auditoria nova", async () => {
    regras();
    quando(/INSERT INTO Presencas/, lancar(erroUnico("UX_Presencas_Sessao_Membro")));
    const r = await presenca();
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ sucesso: false, mensagem: "Presença JÁ REGISTRADA para hoje!" });
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("o caminho comum não muda: presença nova grava e confirma", async () => {
    regras();
    quando(/INSERT INTO Presencas/, []);
    const r = await presenca();
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(true);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
  test("outra falha do banco NÃO vira 409", async () => {
    regras();
    quando(/INSERT INTO Presencas/, lancar(falhaComum()));
    await expect(presenca()).rejects.toThrow("Timeout expired");
  });
});

describe("EncerrarReuniao — a presença que chega no meio do fechamento não derruba o lançamento das faltas", () => {
  const preparar = (faltaQueFalha) => {
    quando(/FROM Sessoes WHERE SessaoId = @id/, [{ sessaoId: 5, orgaoId: 3, orgaoLocalId: null, status: "ABERTA" }]);
    quando(/FROM Orgaos o WHERE o\.OrgaoId = @id/, [{ orgaoId: 3, sigla: "CLI", orgaoLocalId: null, nivel: null, referenciaId: null }]);
    quando(/FROM Presencas WHERE SessaoId = @id/, [{ membroId: 1, presente: 1, faltaJustificada: 0 }]);
    universo.universoDoOrgao.mockImplementation(async () => [{ membroId: 1 }, { membroId: 2 }, { membroId: 3 }, { membroId: 4 }]);
    quando(/INSERT INTO Presencas/, (inputs) => { if (inputs.mat === faltaQueFalha) throw erroUnico("UX_Presencas_Sessao_Membro"); return []; });
  };
  const encerrar = () => chamar(hEncerrar, { metodo: "POST", token: GERAL(["reunioes"]), ligado: { sessaoId: "5" } });
  test("a falta de quem bateu ponto no meio é recusada pelo banco: as demais faltas continuam sendo lançadas e a resposta conta só as que entraram", async () => {
    preparar(3);
    const r = await encerrar();
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(true);
    expect(r.body.mensagem).toMatch(/Faltas geradas: 2\b/);                                                  // membros 2 e 4 (o 3 já tinha presença; o 1 já constava)
    expect(rodou(/INSERT INTO Presencas/).map(c => c.inputs.mat)).toEqual([2, 3, 4]);                        // tentou os três, sem parar no que falhou
  });
  test("sem conflito: lança as três faltas", async () => {
    preparar(999);
    const r = await encerrar();
    expect(r.body.mensagem).toMatch(/Faltas geradas: 3\b/);
  });
  test("outra falha do banco ao lançar a falta NÃO é engolida", async () => {
    preparar(999);
    mockRegras = mockRegras.filter(([p]) => !/INSERT INTO Presencas/.test(p.source));
    quando(/INSERT INTO Presencas/, lancar(falhaComum()));
    await expect(encerrar()).rejects.toThrow("Timeout expired");
  });
});

describe("GestaoCredenciamento — uma credencial por pessoa por Assembleia (UX_CredenciamentosAssembleia_Credenciado)", () => {
  const apto = { dataNascimento: "1980-01-01", dataAdmissao: "2010-01-01", dizimistaFiel: true, status: "ATIVO", situacaoMembro: "EM_COMUNHAO", extensao: null };
  const ligado = { sessaoId: "5" };
  const regras = () => {
    quando(/FROM Sessoes s\s+LEFT JOIN Orgaos o/, [{ SessaoId: 5, Status: "ABERTA", orgaoSigla: "ASSEMBLEIA_GERAL" }]);
    quando(/SELECT MembroId AS membroId, SituacaoMembro/, [{ membroId: 42, ...apto }]);
  };
  const credenciar = () => chamar(hCredenciamento, { metodo: "POST", token: GERAL(["assembleia"]), ligado, corpo: { membroId: 42 } });

  test("quem já está credenciado nesta sessão: 409 ANTES de avaliar ou gravar (nada de segunda linha CREDENCIADO)", async () => {
    regras();
    quando(/FROM CredenciamentosAssembleia WHERE SessaoId = @id AND MembroId = @mat AND Resultado = 'CREDENCIADO'/, [{ x: 1 }]);
    const r = await credenciar();
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ sucesso: false, mensagem: "Essa pessoa já foi credenciada nesta Assembleia." });
    expect(rodou(/INSERT INTO/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("a conferência é só sobre CREDENCIADO: a recusa anterior não impede uma nova tentativa (a trilha guarda cada uma)", async () => {
    regras();
    const r = await credenciar();
    expect(r.status).toBe(201);
    const conferencia = rodou(/FROM CredenciamentosAssembleia WHERE SessaoId = @id AND MembroId = @mat/)[0];
    expect(conferencia.sql).toMatch(/Resultado = 'CREDENCIADO'/);
    expect(conferencia.inputs).toMatchObject({ id: 5, mat: 42 });
    expect(rodou(/INSERT INTO CredenciamentosAssembleia/)).toHaveLength(1);
  });
  test("dois pedidos ao mesmo tempo: a conferência não vê o outro, o INSERT perde para o índice → 409 com a mesma frase, sem presença nem auditoria", async () => {
    regras();
    quando(/INSERT INTO CredenciamentosAssembleia/, lancar(erroUnico("UX_CredenciamentosAssembleia_Credenciado")));
    const r = await credenciar();
    expect(r.status).toBe(409);
    expect(r.body.mensagem).toBe("Essa pessoa já foi credenciada nesta Assembleia.");
    expect(rodou(/INSERT INTO Presencas/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("a presença da portaria chegou no mesmo instante (UX_Presencas_Sessao_Membro): o credenciamento vale e responde 201", async () => {
    regras();
    quando(/SELECT 1 FROM Presencas WHERE SessaoId = @id AND MembroId = @mat/, []);
    quando(/INSERT INTO Presencas/, lancar(erroUnico("UX_Presencas_Sessao_Membro")));
    const r = await credenciar();
    expect(r.status).toBe(201);
    expect(r.body.sucesso).toBe(true);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
  test("falha de outro tipo ao gravar a presença NÃO é engolida", async () => {
    regras();
    quando(/SELECT 1 FROM Presencas WHERE SessaoId = @id AND MembroId = @mat/, []);
    quando(/INSERT INTO Presencas/, lancar(falhaComum()));
    await expect(credenciar()).rejects.toThrow("Timeout expired");
  });
});

describe("credenciamento.gerarOuObterRelatorioCredenciamento — dois relatórios ao mesmo tempo (restrição UNIQUE por sessão)", () => {
  const poolCom = (regras) => ({
    request: () => {
      const inputs = {};
      const req = { input: (n, _t, v) => { inputs[n] = v; return req; }, query: async (texto) => { for (const [padrao, valor] of regras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor() : valor }; return { recordset: [] }; } };
      return req;
    }
  });
  const congelado = { relatorioId: 9, totalCredenciados: 12, totalImpedidos: 2, geradoEm: "2026-10-02 10:00:00" };
  test("o INSERT perde: devolve o relatório congelado do primeiro (novo: false), sem erro", async () => {
    let leituras = 0;
    const pool = poolCom([
      [/FROM RelatoriosCredenciamento WHERE SessaoId = @id/, () => (++leituras === 1 ? [] : [congelado])],     // 1ª leitura: ainda não existe; depois do conflito: existe
      [/COUNT\(\*\) AS total FROM Presencas/, [{ total: 12 }]],
      [/COUNT\(\*\) AS total FROM CredenciamentosAssembleia/, [{ total: 2 }]],
      [/INSERT INTO RelatoriosCredenciamento/, () => { throw erroUnico("UQ_RelatoriosCredenciamento_Sessao", 2627); }]
    ]);
    const r = await credenciamento.gerarOuObterRelatorioCredenciamento(pool, 5, 1);
    expect(r).toEqual({ ...congelado, novo: false });
  });
  test("o conflito sem relatório visível depois (impossível na prática) relança o erro original em vez de inventar resposta", async () => {
    const pool = poolCom([
      [/FROM RelatoriosCredenciamento WHERE SessaoId = @id/, []],
      [/COUNT\(\*\) AS total FROM Presencas/, [{ total: 1 }]],
      [/COUNT\(\*\) AS total FROM CredenciamentosAssembleia/, [{ total: 0 }]],
      [/INSERT INTO RelatoriosCredenciamento/, () => { throw erroUnico("UQ_RelatoriosCredenciamento_Sessao", 2627); }]
    ]);
    await expect(credenciamento.gerarOuObterRelatorioCredenciamento(pool, 5, 1)).rejects.toThrow(/duplicate key/);
  });
  test("falha que NÃO é de unicidade nunca é tratada como 'outro gerou': mesmo com um relatório visível na releitura, o erro sobe", async () => {
    let leituras = 0;
    const pool = poolCom([
      [/FROM RelatoriosCredenciamento WHERE SessaoId = @id/, () => (++leituras === 1 ? [] : [congelado])],
      [/COUNT\(\*\) AS total FROM Presencas/, [{ total: 12 }]],
      [/COUNT\(\*\) AS total FROM CredenciamentosAssembleia/, [{ total: 2 }]],
      [/INSERT INTO RelatoriosCredenciamento/, () => { throw falhaComum(); }]
    ]);
    await expect(credenciamento.gerarOuObterRelatorioCredenciamento(pool, 5, 1)).rejects.toThrow("Timeout expired");
  });
  test("outra falha ao gravar o relatório NÃO é engolida", async () => {
    const pool = poolCom([
      [/FROM RelatoriosCredenciamento WHERE SessaoId = @id/, []],
      [/COUNT\(\*\) AS total FROM Presencas/, [{ total: 1 }]],
      [/COUNT\(\*\) AS total FROM CredenciamentosAssembleia/, [{ total: 0 }]],
      [/INSERT INTO RelatoriosCredenciamento/, () => { throw falhaComum(); }]
    ]);
    await expect(credenciamento.gerarOuObterRelatorioCredenciamento(pool, 5, 1)).rejects.toThrow("Timeout expired");
  });
});

describe("GestaoRemessasBancarias — o banco recusa o pagamento em duas remessas ou o número repetido (migração 129)", () => {
  const INSTITUICAO = { CodigoBanco: "001", Agencia: "1234", Conta: "56789", Cnpj: "12345678000190", RazaoSocial: "IEADESPA", NomeBanco: "BANCO", CodigoConvenio: "1", DigitoAgencia: "0", DigitoConta: "1" };
  const CANDIDATA = { saidaId: 900, valor: 4000, nomeFavorecido: "JOAO", bancoFavorecido: "001", agenciaFavorecido: "1234", contaFavorecido: "98765", congregacaoId: 1, centroCusto: "LOCAL", fornecedorId: 5, dadosBancariosConfirmados: true };
  const regras = () => {
    quando(/FROM DadosBancariosInstituicao/, [INSTITUICAO]);
    quando(/sp_getapplock/, [{ resultado: 0 }]);
    quando(/s\.Status = 'APROVADA'/, [CANDIDATA]);
    quando(/SUM\(ValorRetidoLocal\)/, [{ total: 100000 }]);
    quando(/s\.Status = 'PAGA' AND cs\.CentroCusto/, [{ total: 0 }]);
    quando(/MAX\(NumeroSequencial\)/, [{ proximo: 5 }]);
    quando(/INSERT INTO RemessasBancarias/, [{ RemessaId: 77 }]);
  };
  const gerar = () => chamar(hRemessas, { metodo: "POST", token: GERAL(["financeiro"]), corpo: {} });
  test.each([["item da remessa (UX_RemessaItens_SaidaViva)", "INSERT INTO RemessaItens", "UX_RemessaItens_SaidaViva"], ["número do arquivo (UX_RemessasBancarias_Numero)", "INSERT INTO RemessasBancarias", "UX_RemessasBancarias_Numero"]])(
    "%s recusado: 409 amigável, a transação inteira volta (ROLLBACK, sem COMMIT) e nada é auditado", async (_n, insert, indice) => {
      regras();
      mockRegras = mockRegras.filter(([p]) => !new RegExp(insert).test(p.source));
      quando(new RegExp(insert), lancar(erroUnico(indice)));
      const r = await gerar();
      expect(r.status).toBe(409);
      expect(r.body.sucesso).toBe(false);
      expect(r.body.mensagem).toMatch(/já entrou em outra remessa \(ou o número do arquivo já foi usado\)/);
      expect(r.body.mensagem).toMatch(/Nada foi alterado/);
      expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
      expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
      expect(registrarAuditoria).not.toHaveBeenCalled();
    });
  test("falha que não é de unicidade segue como 500 genérico (sem vazar o texto interno)", async () => {
    regras();
    quando(/INSERT INTO RemessaItens/, lancar(falhaComum()));
    const r = await gerar();
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/segredo-interno/);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
  });
});

describe("GestaoPrebendas — a geração do mês repetida (restrição UNIQUE mês + prebendado, migração 129)", () => {
  const candidato = { prebendadoId: 11, membroId: 40, nome: "Pr. João", congregacaoId: 3, fornecedorId: 3, valorMensalReferencia: 5000, cpf: "12345678909", fornecedorCpfCnpj: "123.456.789-09", atoDesignacaoId: 7, numeroAto: "A-1", ataUrl: "https://blob/ata", valorAto: 5000 };
  const regras = () => {
    quando(/sp_getapplock/, [{ resultado: 0 }]);
    quando(/NOT EXISTS \(SELECT 1 FROM PrebendaGeracoes/, [candidato]);
    quando(/FROM FaixasIrrf/, [{ FaixaMinimo: 0, Aliquota: 0, ParcelaDeduzir: 0 }]);
    quando(/FROM PrebendaRiscosVinculo/, []);
    quando(/INSERT INTO SaidasTesouraria/, [{ SaidaId: 900 }]);
  };
  test.each([[2627, "restrição UQ_PrebendaGeracao_MesPessoa"], [2601, "índice UX_PrebendaGeracoes_Mes_Prebendado"]])("o INSERT da geração perde (%s, %s): 409 amigável, ROLLBACK (a Saída aprovada não fica solta), sem COMMIT", async (numero, indice) => {
    regras();
    quando(/INSERT INTO PrebendaGeracoes/, lancar(erroUnico(indice, numero)));
    const r = await chamar(hPrebendas, { metodo: "POST", token: GERAL(["financeiro"]), corpo: { mesReferencia: "2026-10" } });
    expect(r.status).toBe(409);
    expect(r.body.mensagem).toMatch(/A folha deste mês já foi gerada para um dos prebendados/);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(rodou(/INSERT INTO SaidasTesouraria/).every(c => c.emTransacao)).toBe(true);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("falha que não é de unicidade segue como 500 genérico", async () => {
    regras();
    quando(/INSERT INTO PrebendaGeracoes/, lancar(falhaComum()));
    const r = await chamar(hPrebendas, { metodo: "POST", token: GERAL(["financeiro"]), corpo: { mesReferencia: "2026-10" } });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/segredo-interno/);
  });
});

describe("GestaoPrebendados e GestaoFornecedores — CPF/CNPJ repetido na corrida (restrições UNIQUE das migrações 052 e 060)", () => {
  test("prebendado com o mesmo CPF de outro que acabou de ser cadastrado: 409 com a frase de sempre", async () => {
    quando(/SELECT Nome FROM MembroReferencia WHERE MembroId = @id/, [{ Nome: "Pr. João" }]);
    quando(/SELECT \* FROM Fornecedores WHERE FornecedorId = @id/, [{ Tipo: "PF", CpfCnpj: "123.456.789-09", Nome: "João" }]);
    quando(/SELECT PrebendadoId FROM Prebendados WHERE Cpf = @cpf/, []);
    quando(/FROM AtosDesignacao WHERE AtoDesignacaoId = @id/, [{ AtoDesignacaoId: 7, MembroId: 40, ValorMensal: 5000 }]);
    quando(/INSERT INTO Prebendados/, lancar(erroUnico("UQ__Prebenda__C1FF9309201EBDD1", 2627)));
    const r = await chamar(hPrebendados, { metodo: "POST", token: GERAL(["financeiro"]), corpo: { membroId: 40, fornecedorId: 3, cpf: "12345678909", valorMensalReferencia: 5000, dataInicio: "2026-01-01", atoDesignacaoId: 7 } });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ sucesso: false, mensagem: "Já existe prebendado com esse CPF." });
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("fornecedor com o mesmo CPF/CNPJ de outro que acabou de ser cadastrado: 409", async () => {
    quando(/SELECT FornecedorId FROM Fornecedores WHERE CpfCnpj = @cpfCnpj/, []);
    quando(/INSERT INTO Fornecedores/, lancar(erroUnico("UQ__Forneced__abc", 2627)));
    const r = await chamar(hFornecedores, { metodo: "POST", token: GERAL(["financeiro"]), corpo: { nome: "Gráfica Beta", cpfCnpj: "98.765.432/0001-10", tipo: "PJ" } });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ sucesso: false, mensagem: "Já existe um fornecedor cadastrado com esse CPF/CNPJ." });
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});
