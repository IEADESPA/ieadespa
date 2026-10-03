// Auditoria de escopo (02/10/2026) — grupo "disciplina, abandono e consagração": handlers REAIS contra um banco simulado por TEXTO da consulta.
// Regra: quem tem login de liderança só vê e só altera o que está dentro do seu escopo territorial; o nível geral (papel GLOBAL + escopo "todas") vê tudo.
// Fora do escopo a resposta é IGUAL à de "não existe" (nada de sonda) e NADA é gravado. Rotas decisórias (homologar abandono, passos do Conselho, Mesa do batismo) são do geral.
// Congregações do cenário: "A" (o escopo do usuário local) e "B" (de fora). Pessoas: 40 (A), 41 (B), 42 (sem congregação), 43 (A, desligada).
let mockRegras = [];
let mockConsultas = [];
let mockTransacoes = [];
// sql.Transaction / sql.Request(transacao): cada consulta guarda em que transação rodou (null = fora de transação), e a transação guarda como terminou.
jest.mock("../db", () => {
  const novoRequest = (transacao) => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs }, transacao: transacao ? transacao.id : null });
    for (const [padrao, valor, afetadas] of mockRegras) {
      if (padrao.test(texto)) {
        return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [typeof afetadas === "function" ? afetadas(inputs) : (afetadas === undefined ? 0 : afetadas)] };
      }
    }
    return { recordset: [], rowsAffected: [0] };
  } }; return r; };
  class Transaction {
    constructor() { this.id = mockTransacoes.length + 1; this.estado = "nova"; mockTransacoes.push(this); }
    async begin() { this.estado = "aberta"; }
    async commit() { this.estado = "confirmada"; }
    async rollback() { this.estado = "desfeita"; }
  }
  return {
    getPool: async () => ({ request: () => novoRequest(null) }),
    sql: new Proxy({}, { get: (_alvo, chave) => (chave === "Transaction" ? Transaction : chave === "Request" ? function (t) { return novoRequest(t); } : () => undefined) })
  };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../vacancia", () => ({ encerrarVinculos: jest.fn(async () => {}) }));
jest.mock("../mediacaoArbitragem", () => ({ registrarAceiteClausulaCompromissoria: jest.fn(async () => 8) }));
jest.mock("../batismo", () => ({ ...jest.requireActual("../batismo"), registrarAceiteEstatuto: jest.fn(async () => 7) }));

const auth = require("../auth");
const er = require("../escopoRotas");
const { registrarAuditoria, registrarAuditoriaNaTransacao } = require("../auditoria");
const vacancia = require("../vacancia");
const { hojeBrasilia } = require("../dataBrasilia");
const abandonoDigital = require("../abandonoDigital");
const hAbrirProc = require("../../AbrirProcedimentoAbandono/index.js");
const hEvolProc = require("../../EvoluirProcedimentoAbandono/index.js");
const hListarProc = require("../../ListarProcedimentosAbandono/index.js");
const hListarProcessos = require("../../ListarProcessosDisciplinares/index.js");
const hListarTent = require("../../ListarTentativasContato/index.js");
const hRegTent = require("../../RegistrarTentativaContato/index.js");
const hRadar = require("../../RadarAbandono/index.js");
const hRadarDigital = require("../../RadarAbandonoDigital/index.js");
const hCriarCons = require("../../CriarConsagracao/index.js");
const hEvolCons = require("../../EvoluirConsagracao/index.js");
const hListarCons = require("../../ListarConsagracoes/index.js");
const hCandidatos = require("../../GestaoCandidatosBatismo/index.js");
const hTurmas = require("../../GestaoTurmasBatismo/index.js");
const hAbrirProcesso = require("../../AbrirProcessoDisciplinar/index.js");
const hEvolProcesso = require("../../EvoluirProcessoDisciplinar/index.js");

const HOJE = hojeBrasilia();
const diasAtras = (n) => { const d = new Date(`${HOJE}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

async function chamar(handler, { metodo = "POST", corpo = {}, token, ligado = {}, query = {} } = {}) {
  const context = { bindingData: ligado, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const rodou = (padrao) => mockConsultas.filter(c => padrao.test(c.sql));
const escritas = () => mockConsultas.filter(c => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(c.sql));

const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
// Liderança LOCAL: papel de congregação com escopo da congregação "A".
const local = (permissoes, extra = {}) => tokenDe(5, { via: "SENHA", nivel: "CONGREGACAO", permissoes, escopoCongregacoes: ["A"], ...extra });
// GERAL: papel Global com escopo "todas".
const geral = (permissoes, extra = {}) => tokenDe(1, { via: "SENHA", nivel: "GLOBAL", permissoes, escopoCongregacoes: "TODAS", ...extra });
// As duas metades isoladas — nenhuma delas sozinha vale como geral.
const globalComListaDeCongregacoes = (permissoes) => tokenDe(2, { via: "SENHA", nivel: "GLOBAL", permissoes, escopoCongregacoes: ["A"] });
const localComEscopoTodas = (permissoes) => tokenDe(3, { via: "SENHA", nivel: "CONGREGACAO", permissoes, escopoCongregacoes: "TODAS" });
const sessaoDePin = () => tokenDe(40, { via: "PIN" });

const PESSOAS = {
  40: { MembroId: 40, Nome: "Maria", Status: "ATIVO", CongregacaoNome: "A", ExtensaoNome: null },
  41: { MembroId: 41, Nome: "João", Status: "ATIVO", CongregacaoNome: "B", ExtensaoNome: null },
  42: { MembroId: 42, Nome: "Sem Congregação", Status: "ATIVO", CongregacaoNome: null, ExtensaoNome: null },
  43: { MembroId: 43, Nome: "Desligada", Status: "DESLIGADO", CongregacaoNome: "A", ExtensaoNome: null },
  60: { MembroId: 60, Nome: "Oficiante A", Status: "ATIVO", CongregacaoNome: "A", ExtensaoNome: null }
};

beforeEach(() => {
  mockRegras = [];
  mockConsultas = [];
  mockTransacoes = [];
  registrarAuditoria.mockClear();
  registrarAuditoriaNaTransacao.mockClear();
  vacancia.encerrarVinculos.mockClear();
  // carregarPessoa (shared/escopoRotas.js): a pessoa pela matrícula, com congregação e extensão.
  quando(/AS CongregacaoNome/, (i) => (PESSOAS[i.id] ? [{ ...PESSOAS[i.id] }] : []));
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("porta de entrada de todas as rotas do grupo: sem sessão 401; sessão de PIN e papel sem a permissão levam 403 ANTES de tocar no banco", () => {
  const GUID = "11111111-1111-1111-1111-111111111111";
  const ROTAS = [
    ["AbrirProcedimentoAbandono", hAbrirProc, { corpo: { membroId: 40 } }, "disciplina"],
    ["EvoluirProcedimentoAbandono", hEvolProc, { corpo: { acao: "ARQUIVAR" }, ligado: { procedimentoId: 5 } }, "disciplina"],
    ["ListarProcedimentosAbandono", hListarProc, { metodo: "GET" }, "disciplina"],
    ["ListarProcessosDisciplinares", hListarProcessos, { metodo: "GET" }, "disciplina"],
    ["ListarTentativasContato", hListarTent, { metodo: "GET", query: { membroId: "40" } }, "disciplina"],
    ["RegistrarTentativaContato", hRegTent, { corpo: { membroId: 40, canalId: 3 } }, "disciplina"],
    ["RadarAbandono", hRadar, { metodo: "GET" }, "disciplina"],
    ["RadarAbandonoDigital", hRadarDigital, { metodo: "GET" }, "disciplina"],
    ["AbrirProcessoDisciplinar", hAbrirProcesso, { corpo: { membroId: 40, orgaoLocalId: 1, infracoesIds: [1] } }, "disciplina"],
    ["EvoluirProcessoDisciplinar", hEvolProcesso, { corpo: { acao: "CITAR" }, ligado: { processoId: 1 } }, "disciplina"],
    ["CriarConsagracao", hCriarCons, { corpo: { membroId: 40, assunto: "Diaconato", proponenteMembroId: 5 } }, "consagracoes"],
    ["EvoluirConsagracao", hEvolCons, { corpo: { acao: "AVANCAR" }, ligado: { consagracaoId: GUID } }, "consagracoes"],
    ["ListarConsagracoes", hListarCons, { metodo: "GET" }, "consagracoes"],
    ["GestaoCandidatosBatismo", hCandidatos, { metodo: "GET" }, "consagracoes"],
    ["GestaoTurmasBatismo", hTurmas, { metodo: "GET" }, "consagracoes"]
  ];
  describe.each(ROTAS)("%s", (_nome, handler, args, permissao) => {
    test("sem sessão: 401", async () => {
      expect((await chamar(handler, args)).status).toBe(401);
      expect(mockConsultas).toHaveLength(0);
    });
    test("sessão de PIN (permissoes: []): recusada, sem tocar no banco", async () => {
      expect([401, 403]).toContain((await chamar(handler, { ...args, token: sessaoDePin() })).status);
      expect(mockConsultas).toHaveLength(0);
    });
    test("liderança sem a permissão: 403, sem tocar no banco", async () => {
      const outra = permissao === "disciplina" ? "consagracoes" : "disciplina";
      expect((await chamar(handler, { ...args, token: local([outra, "reunioes"]) })).status).toBe(403);
      expect((await chamar(handler, { ...args, token: geral([outra, "reunioes"]) })).status).toBe(403);
      expect(mockConsultas).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("datas da tentativa de contato (shared/abandonoDigital.js)", () => {
  test("dataIsoValida: só AAAA-MM-DD que existe no calendário", () => {
    expect(abandonoDigital.dataIsoValida("2026-05-10")).toBe(true);
    expect(abandonoDigital.dataIsoValida("2024-02-29")).toBe(true);
    for (const ruim of ["2026-02-31", "2026-13-01", "2026-5-1", "2026-05-10T00:00:00", " 2026-05-10", "10/05/2026", "", null, undefined, 20260510, {}, ["2026-05-10"]]) {
      expect(abandonoDigital.dataIsoValida(ruim)).toBe(false);
    }
  });
  test("sem data (vazia) usa o dia do servidor; hoje e até 7 dias atrás valem", () => {
    for (const vazia of [undefined, null, ""]) expect(abandonoDigital.resolverDataTentativa(vazia)).toEqual({ data: null });
    expect(abandonoDigital.resolverDataTentativa(HOJE)).toEqual({ data: HOJE });
    expect(abandonoDigital.resolverDataTentativa(diasAtras(7))).toEqual({ data: diasAtras(7) });
  });
  test("mais antiga que 7 dias, futura ou malformada é recusada (era o que fabricava o prazo de 90 dias)", () => {
    expect(abandonoDigital.resolverDataTentativa(diasAtras(8)).erro).toMatch(/últimos 7 dias/);
    expect(abandonoDigital.resolverDataTentativa(diasAtras(100)).erro).toBeTruthy();
    expect(abandonoDigital.resolverDataTentativa(diasAtras(-1)).erro).toMatch(/futura/);
    expect(abandonoDigital.resolverDataTentativa("2026-02-31").erro).toMatch(/inválida/);
    expect(abandonoDigital.resolverDataTentativa(12345).erro).toMatch(/inválida/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("RegistrarTentativaContato", () => {
  const preparar = () => {
    quando(/FROM CanaisOficiaisComunicacao WHERE CanalId = @id/, (i) => (i.id === 3 ? [{ CanalId: 3, Ativo: 1, Plataforma: "EMAIL", Categoria: "INSTITUCIONAL" }] : (i.id === 4 ? [{ CanalId: 4, Ativo: 1, Plataforma: "WHATSAPP_GRUPO", Categoria: "INSTITUCIONAL" }] : [])));
    quando(/INSERT INTO TentativasContatoAbandono/, [{ TentativaId: 77 }]);
  };
  const reg = (token, corpo) => chamar(hRegTent, { token, corpo });

  test("dentro do escopo: grava a tentativa com a data do servidor (data vazia) e audita", async () => {
    preparar();
    const r = await reg(local(["disciplina"]), { membroId: 40, canalId: 3, observacao: "ligou" });
    expect(r.status).toBe(201);
    const ins = rodou(/INSERT INTO TentativasContatoAbandono/);
    expect(ins).toHaveLength(1);
    expect(ins[0].inputs).toMatchObject({ membroId: 40, canalId: 3, dataTentativa: null, registradoPor: 5 });
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
  test("aceita a data de hoje e a dos últimos 7 dias", async () => {
    preparar();
    expect((await reg(local(["disciplina"]), { membroId: 40, canalId: 3, dataTentativa: diasAtras(3) })).status).toBe(201);
    expect(rodou(/INSERT INTO TentativasContatoAbandono/)[0].inputs.dataTentativa).toBe(diasAtras(3));
  });
  test("data retroativa (mais de 7 dias), futura ou malformada: 400, sem consultar nem gravar nada", async () => {
    preparar();
    for (const dataTentativa of [diasAtras(8), diasAtras(100), diasAtras(-2), "2026-02-31", "ontem"]) {
      const r = await reg(local(["disciplina"]), { membroId: 40, canalId: 3, dataTentativa });
      expect(r.status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("membro FORA do escopo: a mesma resposta de matrícula inexistente ou malformada, e nada é gravado", async () => {
    preparar();
    const fora = await reg(local(["disciplina"]), { membroId: 41, canalId: 3 });
    const semCongregacao = await reg(local(["disciplina"]), { membroId: 42, canalId: 3 });
    const inexistente = await reg(local(["disciplina"]), { membroId: 999, canalId: 3 });
    const malformada = await reg(local(["disciplina"]), { membroId: "0x10", canalId: 3 });
    expect(fora).toEqual({ status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } });
    expect(semCongregacao).toEqual(fora);
    expect(inexistente).toEqual(fora);
    expect(malformada).toEqual(fora);
    expect(escritas()).toHaveLength(0);
    expect(rodou(/FROM CanaisOficiaisComunicacao/)).toHaveLength(0);
  });
  test("o geral registra para qualquer congregação, inclusive para quem não tem congregação", async () => {
    preparar();
    expect((await reg(geral(["disciplina"]), { membroId: 41, canalId: 3 })).status).toBe(201);
    expect((await reg(geral(["disciplina"]), { membroId: 42, canalId: 3 })).status).toBe(201);
  });
  test("papel Global com lista de congregações e papel local com escopo 'todas' (as duas metades) não passam por geral onde isso importa: escopo vale por congregação", async () => {
    preparar();
    expect((await reg(globalComListaDeCongregacoes(["disciplina"]), { membroId: 41, canalId: 3 })).body.mensagem).toBe("Matrícula não encontrada.");
    expect((await reg(localComEscopoTodas(["disciplina"]), { membroId: 41, canalId: 3 })).status).toBe(201);   // escopo "todas" da liderança vale para pessoas; geral é só para o institucional
  });
  test("canal que não serve (grupo) ou inexistente: recusado, nada gravado", async () => {
    preparar();
    for (const canalId of [4, 99, "abc"]) {
      const r = await reg(local(["disciplina"]), { membroId: 40, canalId });
      expect(r.body.sucesso).toBe(false);
    }
    expect(escritas()).toHaveLength(0);
    expect(rodou(/FROM CanaisOficiaisComunicacao/)).toHaveLength(2);        // o canal malformado ("abc") nem chega ao banco
  });
  test("faltando membroId ou canalId: 400", async () => {
    expect((await reg(local(["disciplina"]), { canalId: 3 })).status).toBe(400);
    expect((await reg(local(["disciplina"]), { membroId: 40 })).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("AbrirProcedimentoAbandono", () => {
  const NAO_ENCONTRADA = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
  const preparar = ({ situacao = "SEM_COMUNHAO", afastamento = "2020-01-01" } = {}) => {
    quando(/SituacaoMembro, CONVERT/, (i) => [{ MembroId: i.id, Nome: "X", SituacaoMembro: situacao, DataAfastamento: afastamento }]);
    quando(/SELECT TOP 1 ProcedimentoId FROM ProcedimentosAbandono/, []);
    quando(/INSERT INTO ProcedimentosAbandono/, [{ ProcedimentoId: 9 }]);
    quando(/WHERE pa.ProcedimentoId = @id/, [{ procedimentoId: 9, membroId: 40, nome: "X", tipo: "MATERIAL", status: "NOTIFICADO" }]);
  };
  const abrir = (token, corpo) => chamar(hAbrirProc, { token, corpo });

  test("dentro do escopo: abre o procedimento Material com a data DO SERVIDOR, mesmo que o cliente mande outra, grava QUEM abriu e audita na mesma transação", async () => {
    preparar();
    const r = await abrir(local(["disciplina"]), { membroId: 40, tipo: "MATERIAL", dataNotificacao: "2020-01-01" });
    expect(r.status).toBe(201);
    const ins = rodou(/INSERT INTO ProcedimentosAbandono/);
    expect(ins).toHaveLength(1);
    expect(ins[0].inputs).toMatchObject({ membroId: 40, tipo: "MATERIAL", dataNotificacao: HOJE, abertoPor: 5, tentativaId: null });
    expect(ins[0].transacao).toBe(1);
    expect(mockTransacoes.map(t => t.estado)).toEqual(["confirmada"]);
    expect(registrarAuditoriaNaTransacao).toHaveBeenCalledTimes(1);
    expect(registrarAuditoriaNaTransacao.mock.calls[0][0]).toBe(mockTransacoes[0]);
    // a verificação de "já existe procedimento aberto" é feita dentro da transação, com trava
    expect(rodou(/SELECT TOP 1 ProcedimentoId FROM ProcedimentosAbandono WITH \(UPDLOCK, HOLDLOCK\)/)[0].transacao).toBe(1);
  });
  test("procedimento já aberto para o membro: a transação é desfeita e nada é gravado", async () => {
    preparar();
    mockRegras = mockRegras.filter(([p]) => !/SELECT TOP 1 ProcedimentoId/.test(p.source));
    quando(/SELECT TOP 1 ProcedimentoId FROM ProcedimentosAbandono/, [{ ProcedimentoId: 3 }]);
    const r = await abrir(local(["disciplina"]), { membroId: 40 });
    expect(r.body).toEqual({ sucesso: false, mensagem: "Já existe um procedimento em aberto (notificado) para este membro." });
    expect(escritas()).toHaveLength(0);
    expect(mockTransacoes.map(t => t.estado)).toEqual(["desfeita"]);
  });
  test("edital com data futura é recusado (o prazo também conta do edital)", async () => {
    preparar();
    const r = await abrir(local(["disciplina"]), { membroId: 40, dataEdital: diasAtras(-3) });
    expect(r.status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
    expect((await abrir(local(["disciplina"]), { membroId: 40, dataEdital: diasAtras(2) })).status).toBe(201);
  });
  test("membro FORA do escopo (ou sem congregação, inexistente, malformado): a mesma resposta, e nem a elegibilidade é consultada nem nada é gravado", async () => {
    preparar();
    const respostas = [];
    for (const membroId of [41, 42, 999, "abc", "05"]) respostas.push(await abrir(local(["disciplina"]), { membroId }));
    for (const r of respostas) expect(r).toEqual(NAO_ENCONTRADA);
    expect(escritas()).toHaveLength(0);
    expect(rodou(/SituacaoMembro, CONVERT/)).toHaveLength(0);
  });
  test("Digital: fora do escopo é a mesma recusa, sem consultar as tentativas", async () => {
    preparar();
    quando(/MIN\(DataTentativa\)/, [{ Primeira: "2026-01-01", Ultima: "2026-02-01", CanaisDistintos: 2 }]);
    expect(await abrir(local(["disciplina"]), { membroId: 41, tipo: "DIGITAL", canalNotificacaoId: 3 })).toEqual(NAO_ENCONTRADA);
    expect(rodou(/MIN\(DataTentativa\)/)).toHaveLength(0);
    expect(escritas()).toHaveLength(0);
  });
  const prepararDigital = () => {
    preparar();
    quando(/MIN\(DataTentativa\)/, [{ Primeira: "2026-01-01", Ultima: "2026-02-01", CanaisDistintos: 2 }]);
    quando(/FROM CanaisOficiaisComunicacao WHERE CanalId = @id/, (i) => (i.id === 3 ? [{ CanalId: 3, Ativo: 1, Plataforma: "EMAIL", Categoria: "INSTITUCIONAL" }] : (i.id === 4 ? [{ CanalId: 4, Ativo: 1, Plataforma: "WHATSAPP_GRUPO", Categoria: "INSTITUCIONAL" }] : [])));
    quando(/INSERT INTO TentativasContatoAbandono/, [{ TentativaId: 88 }]);
  };
  test("Digital dentro do escopo: abrir REGISTRA a notificação final (tentativa de hoje, no canal escolhido) e o prazo conta de HOJE — não da última tentativa", async () => {
    prepararDigital();
    const r = await abrir(local(["disciplina"]), { membroId: 40, tipo: "DIGITAL", dataNotificacao: "2026-02-01", canalNotificacaoId: 3 });
    expect(r.status).toBe(201);
    const tentativa = rodou(/INSERT INTO TentativasContatoAbandono/);
    expect(tentativa).toHaveLength(1);
    expect(tentativa[0].inputs).toMatchObject({ membroId: 40, canalId: 3, dataTentativa: HOJE, registradoPor: 5 });
    expect(tentativa[0].inputs.observacao).toMatch(/Notificação final/);
    const ins = rodou(/INSERT INTO ProcedimentosAbandono/)[0];
    expect(ins.inputs).toMatchObject({ dataNotificacao: HOJE, tentativaId: 88, abertoPor: 5 });
    expect(tentativa[0].transacao).toBe(1);
    expect(ins.transacao).toBe(1);
    expect(mockTransacoes.map(t => t.estado)).toEqual(["confirmada"]);
  });
  test("Digital: o banco devolve as datas das tentativas como objeto Date — a elegibilidade tem de funcionar assim (antes dava null e nunca ficava elegível)", async () => {
    prepararDigital();
    mockRegras.unshift([/MIN\(DataTentativa\)/, [{ Primeira: new Date(`${diasAtras(120)}T00:00:00Z`), Ultima: new Date(`${diasAtras(100)}T00:00:00Z`), CanaisDistintos: 2 }]]);
    const r = await abrir(local(["disciplina"]), { membroId: 40, tipo: "DIGITAL", canalNotificacaoId: 3 });
    expect(r.status).toBe(201);
    const e = await abandonoDigital.elegibilidadeAbandonoDigital({ request: () => ({ input() { return this; }, query: async () => ({ recordset: [{ Primeira: new Date(`${diasAtras(120)}T00:00:00Z`), Ultima: new Date(`${diasAtras(100)}T00:00:00Z`), CanaisDistintos: 2 }] }) }) }, { Int: null });
    expect(e).toMatchObject({ elegivel: true, diasDesdePrimeira: 120, ultimaTentativa: diasAtras(100) });
  });
  test("Digital sem o canal da notificação final: 400 sem tocar no banco; canal de grupo ou inexistente: recusado, nada gravado", async () => {
    prepararDigital();
    expect((await abrir(local(["disciplina"]), { membroId: 40, tipo: "DIGITAL" })).status).toBe(400);
    expect((await abrir(local(["disciplina"]), { membroId: 40, tipo: "DIGITAL", canalNotificacaoId: "abc" })).status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
    for (const canalNotificacaoId of [4, 99]) expect((await abrir(local(["disciplina"]), { membroId: 40, tipo: "DIGITAL", canalNotificacaoId })).body.sucesso).toBe(false);
    expect(escritas()).toHaveLength(0);
    expect(mockTransacoes).toHaveLength(0);
  });
  test("falha no meio da abertura Digital (depois da notificação gravada): a transação é desfeita e o erro sobe", async () => {
    prepararDigital();
    mockRegras.unshift([/INSERT INTO ProcedimentosAbandono/, () => { throw new Error("falha simulada"); }]);
    await expect(abrir(local(["disciplina"]), { membroId: 40, tipo: "DIGITAL", canalNotificacaoId: 3 })).rejects.toThrow("falha simulada");
    expect(mockTransacoes.map(t => t.estado)).toEqual(["desfeita"]);
    expect(registrarAuditoriaNaTransacao).not.toHaveBeenCalled();
  });
  test("o geral abre para qualquer congregação", async () => {
    preparar();
    expect((await abrir(geral(["disciplina"]), { membroId: 41 })).status).toBe(201);
    expect((await abrir(geral(["disciplina"]), { membroId: 42 })).status).toBe(201);
  });
  test("membro desligado (dentro do escopo): recusado, nada gravado", async () => {
    preparar();
    const r = await abrir(local(["disciplina"]), { membroId: 43 });
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/membresia ativa/);
    expect(escritas()).toHaveLength(0);
  });
  test("ainda não completou os 90 dias: recusado, nada gravado", async () => {
    preparar({ afastamento: diasAtras(10) });
    const r = await abrir(local(["disciplina"]), { membroId: 40 });
    expect(r.body.sucesso).toBe(false);
    expect(escritas()).toHaveLength(0);
  });
  test("entradas inválidas: sem membroId, tipo inválido ou dataEdital malformada dão 400 sem tocar no banco", async () => {
    preparar();
    expect((await abrir(local(["disciplina"]), {})).status).toBe(400);
    expect((await abrir(local(["disciplina"]), { membroId: 40, tipo: "OUTRO" })).status).toBe(400);
    expect((await abrir(local(["disciplina"]), { membroId: 40, dataEdital: "2026-02-31" })).status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("EvoluirProcedimentoAbandono", () => {
  const PROCEDIMENTOS = {
    5: { MembroId: 40, Tipo: "MATERIAL", Status: "NOTIFICADO", DataNotificacao: "2020-01-01", PrazoDias: 15, DataHomologacao: null },
    6: { MembroId: 41, Tipo: "MATERIAL", Status: "NOTIFICADO", DataNotificacao: "2020-01-01", PrazoDias: 15, DataHomologacao: null },
    7: { MembroId: 43, Tipo: "MATERIAL", Status: "NOTIFICADO", DataNotificacao: "2020-01-01", PrazoDias: 15, DataHomologacao: null },
    8: { MembroId: 40, Tipo: "MATERIAL", Status: "HOMOLOGADO", DataNotificacao: "2020-01-01", PrazoDias: 15, DataHomologacao: HOJE },
    9: { MembroId: 40, Tipo: "DIGITAL", Status: "NOTIFICADO", DataNotificacao: HOJE, PrazoDias: 15, DataHomologacao: null },
    // aberto pelo geral de matrícula 1 (o mesmo token `geral` dos testes) — regra dos dois olhos
    10: { MembroId: 40, Tipo: "MATERIAL", Status: "NOTIFICADO", DataNotificacao: "2020-01-01", PrazoDias: 15, DataHomologacao: null, AbertoPor: 1, AbertoEmBrasilia: "2020-01-01" },
    11: { MembroId: 40, Tipo: "MATERIAL", Status: "NOTIFICADO", DataNotificacao: "2020-01-01", PrazoDias: 15, DataHomologacao: null, AbertoPor: 2, AbertoEmBrasilia: "2020-01-01" },
    // Digital antigo: a notificação herdou a data da última tentativa (velha), mas o procedimento foi aberto há 5 dias — a defesa ainda corre
    12: { MembroId: 40, Tipo: "DIGITAL", Status: "NOTIFICADO", DataNotificacao: "2020-01-01", PrazoDias: 15, DataHomologacao: null, AbertoPor: null, AbertoEmBrasilia: diasAtras(5) },
    // edital publicado há 3 dias: o prazo conta dele
    13: { MembroId: 40, Tipo: "MATERIAL", Status: "NOTIFICADO", DataNotificacao: "2020-01-01", PrazoDias: 15, DataHomologacao: null, AbertoPor: null, AbertoEmBrasilia: "2020-01-01", DataEdital: diasAtras(3) }
  };
  const NAO_ENCONTRADO = { status: 200, body: { sucesso: false, mensagem: "Procedimento não encontrado." } };
  const preparar = ({ afetadasHomologar = 1, afetadasArquivar = 1, statusTravado = null } = {}) => {
    quando(/FROM ProcedimentosAbandono WHERE ProcedimentoId = @id/, (i) => (PROCEDIMENTOS[i.id] ? [{ ...PROCEDIMENTOS[i.id] }] : []));
    // a releitura com trava, dentro da transação da homologação
    quando(/FROM ProcedimentosAbandono WITH \(UPDLOCK, HOLDLOCK\) WHERE ProcedimentoId = @id/, (i) => (PROCEDIMENTOS[i.id] ? [{ Status: statusTravado || PROCEDIMENTOS[i.id].Status, MembroId: PROCEDIMENTOS[i.id].MembroId }] : []));
    quando(/SELECT Status FROM MembroReferencia WITH \(UPDLOCK, HOLDLOCK\)/, (i) => (PESSOAS[i.id] ? [{ Status: PESSOAS[i.id].Status }] : []));
    quando(/FROM Lideranca l JOIN Papeis p/, (i) => [{ MembroId: 2, Nome: "Secretário Geral" }, { MembroId: 1, Nome: "Presidente" }].filter(x => x.MembroId !== i.exceto));
    quando(/UPDATE ProcedimentosAbandono SET Status = 'HOMOLOGADO'/, [], afetadasHomologar);
    quando(/UPDATE ProcedimentosAbandono SET Status = 'ARQUIVADO'/, [], afetadasArquivar);
    quando(/UPDATE ProcedimentosAbandono SET RecursoInterposto/, [], 1);
    quando(/UPDATE MembroReferencia SET Status = 'DESLIGADO'/, [], 1);
  };
  const evoluir = (token, procedimentoId, corpo) => chamar(hEvolProc, { token, corpo, ligado: { procedimentoId } });

  describe("HOMOLOGAR e RECURSO são da CLI: só o geral", () => {
    test.each([["HOMOLOGAR", 5], ["RECURSO", 8]])("%s: liderança local com 'disciplina' (mesmo no próprio escopo) leva 403 ANTES de tocar no banco", async (acao, id) => {
      preparar();
      const r = await evoluir(local(["disciplina"]), id, { acao });
      expect(r).toMatchObject({ status: 403, body: { sucesso: false, mensagem: er.MSG_GERAL } });
      expect(mockConsultas).toHaveLength(0);
    });
    test.each(["HOMOLOGAR", "RECURSO"])("%s: papel Global com escopo de lista e papel local com escopo 'todas' também levam 403 sem tocar no banco", async (acao) => {
      preparar();
      expect((await evoluir(globalComListaDeCongregacoes(["disciplina"]), 5, { acao })).status).toBe(403);
      expect((await evoluir(localComEscopoTodas(["disciplina"]), 5, { acao })).status).toBe(403);
      expect(mockConsultas).toHaveLength(0);
    });
    test("o geral homologa: grava o procedimento, desliga o membro, encerra os vínculos e audita — tudo numa transação só", async () => {
      preparar();
      const r = await evoluir(geral(["disciplina"]), 5, { acao: "HOMOLOGAR" });
      expect(r.status).toBe(200);
      expect(r.body.sucesso).toBe(true);
      const homologou = rodou(/UPDATE ProcedimentosAbandono SET Status = 'HOMOLOGADO'/);
      expect(homologou).toHaveLength(1);
      expect(homologou[0].sql).toMatch(/AND Status = 'NOTIFICADO'/);                        // o estado vai no WHERE
      expect(homologou[0].inputs).toMatchObject({ id: 5, homologadoPor: 1 });
      expect(rodou(/UPDATE MembroReferencia SET Status = 'DESLIGADO'/)[0].inputs).toMatchObject({ id: 40, motivoSaida: "ABANDONO_MATERIAL" });
      expect(vacancia.encerrarVinculos).toHaveBeenCalledTimes(1);
      expect(registrarAuditoriaNaTransacao).toHaveBeenCalledTimes(1);
      expect(registrarAuditoria).not.toHaveBeenCalled();
      // a mesma transação para tudo, e confirmada
      expect(mockTransacoes.map(t => t.estado)).toEqual(["confirmada"]);
      for (const c of escritas()) expect(c.transacao).toBe(1);
      expect(rodou(/FROM ProcedimentosAbandono WITH \(UPDLOCK, HOLDLOCK\)/)[0].transacao).toBe(1);
      expect(registrarAuditoriaNaTransacao.mock.calls[0][0]).toBe(mockTransacoes[0]);
      // a vacância recebe um "pool" cujo request() roda DENTRO da transação
      const poolDaVacancia = vacancia.encerrarVinculos.mock.calls[0][0];
      await poolDaVacancia.request().query("UPDATE Assentos SET DataFim = 1");
      expect(rodou(/UPDATE Assentos/)[0].transacao).toBe(1);
    });
    test("o prazo de recurso (30 dias) vence também quando a data chega do banco como objeto Date (antes nunca vencia)", async () => {
      preparar();
      PROCEDIMENTOS[14] = { MembroId: 40, Tipo: "MATERIAL", Status: "HOMOLOGADO", DataNotificacao: "2020-01-01", PrazoDias: 15, DataHomologacao: new Date(`${diasAtras(40)}T00:00:00Z`) };
      const r = await evoluir(geral(["disciplina"]), 14, { acao: "RECURSO" });
      expect(r.body.sucesso).toBe(false);
      expect(r.body.mensagem).toMatch(/Prazo de recurso/);
      PROCEDIMENTOS[14].DataHomologacao = new Date(`${diasAtras(10)}T00:00:00Z`);
      expect((await evoluir(geral(["disciplina"]), 14, { acao: "RECURSO" })).body.sucesso).toBe(true);
      delete PROCEDIMENTOS[14];
    });
    test("o geral registra o recurso de um procedimento homologado", async () => {
      preparar();
      const r = await evoluir(geral(["disciplina"]), 8, { acao: "RECURSO", resultadoRecurso: "PENDENTE" });
      expect(r.body.sucesso).toBe(true);
      const upd = rodou(/UPDATE ProcedimentosAbandono SET RecursoInterposto/);
      expect(upd).toHaveLength(1);
      expect(upd[0].sql).toMatch(/Status = 'HOMOLOGADO'/);
    });
  });

  describe("guardas da homologação", () => {
    test("o UPDATE não pegou nenhuma linha (já homologado/arquivado por outra pessoa): para ali — não desliga o membro nem encerra vínculos de novo", async () => {
      preparar({ afetadasHomologar: 0 });
      const r = await evoluir(geral(["disciplina"]), 5, { acao: "HOMOLOGAR" });
      expect(r.body.sucesso).toBe(false);
      expect(r.body.mensagem).toMatch(/já foi homologado ou arquivado/);
      expect(rodou(/UPDATE MembroReferencia/)).toHaveLength(0);
      expect(vacancia.encerrarVinculos).not.toHaveBeenCalled();
      expect(registrarAuditoria).not.toHaveBeenCalled();
      expect(registrarAuditoriaNaTransacao).not.toHaveBeenCalled();
      expect(mockTransacoes.map(t => t.estado)).toEqual(["desfeita"]);
    });
    test("a releitura COM TRAVA já encontra o procedimento homologado (outra homologação terminou enquanto esta esperava): desfaz sem gravar nada", async () => {
      preparar({ statusTravado: "HOMOLOGADO" });
      const r = await evoluir(geral(["disciplina"]), 5, { acao: "HOMOLOGAR" });
      expect(r.body.mensagem).toMatch(/já foi homologado ou arquivado/);
      expect(escritas()).toHaveLength(0);
      expect(vacancia.encerrarVinculos).not.toHaveBeenCalled();
      expect(mockTransacoes.map(t => t.estado)).toEqual(["desfeita"]);
    });
    test.each([
      ["no desligamento do membro", () => mockRegras.unshift([/UPDATE MembroReferencia SET Status = 'DESLIGADO'/, () => { throw new Error("falha simulada"); }])],
      ["na vacância (assentos/liderança)", () => vacancia.encerrarVinculos.mockImplementationOnce(async () => { throw new Error("falha simulada"); })],
      ["na trilha de auditoria", () => registrarAuditoriaNaTransacao.mockImplementationOnce(async () => { throw new Error("falha simulada"); })]
    ])("falha %s: a transação inteira é desfeita (nada fica pela metade) e o erro sobe", async (_onde, quebrar) => {
      preparar();
      quebrar();
      await expect(evoluir(geral(["disciplina"]), 5, { acao: "HOMOLOGAR" })).rejects.toThrow("falha simulada");
      expect(mockTransacoes.map(t => t.estado)).toEqual(["desfeita"]);
      for (const c of escritas()) expect(c.transacao).toBe(1);                              // nada foi gravado fora da transação desfeita
    });
    test("regra dos dois olhos: quem ABRIU não homologa — a recusa diz quem pode, e nada é gravado", async () => {
      preparar();
      const r = await evoluir(geral(["disciplina"]), 10, { acao: "HOMOLOGAR" });
      expect(r.body.sucesso).toBe(false);
      expect(r.body.mensagem).toMatch(/Quem abriu o procedimento não pode homologá-lo/);
      expect(r.body.mensagem).toMatch(/Pode homologar: Secretário Geral/);
      expect(r.body.quemPodeHomologar).toEqual(["Secretário Geral"]);
      expect(rodou(/FROM Lideranca l JOIN Papeis p/)[0].sql).toMatch(/p\.Nivel = 'GLOBAL' AND l\.EscopoTipo = 'GLOBAL'/);
      expect(escritas()).toHaveLength(0);
      expect(mockTransacoes).toHaveLength(0);
    });
    test("regra dos dois olhos: sem mais ninguém com a homologação, a recusa diz isso (sem exceção silenciosa)", async () => {
      preparar();
      mockRegras.unshift([/FROM Lideranca l JOIN Papeis p/, []]);
      const r = await evoluir(geral(["disciplina"]), 10, { acao: "HOMOLOGAR" });
      expect(r.body.sucesso).toBe(false);
      expect(r.body.mensagem).toMatch(/ninguém mais tem a homologação/);
      expect(escritas()).toHaveLength(0);
    });
    test("outra pessoa do geral homologa o que foi aberto por alguém; procedimento antigo (sem quem abriu) segue homologável", async () => {
      preparar();
      expect((await evoluir(geral(["disciplina"]), 11, { acao: "HOMOLOGAR" })).body.sucesso).toBe(true);
      expect((await evoluir(geral(["disciplina"]), 5, { acao: "HOMOLOGAR" })).body.sucesso).toBe(true);
    });
    test("o prazo conta do último marco: Digital antigo aberto há 5 dias (notificação herdada de anos atrás) e edital de 3 dias atrás ainda estão em prazo", async () => {
      preparar();
      const digital = await evoluir(geral(["disciplina"]), 12, { acao: "HOMOLOGAR" });
      expect(digital.body.sucesso).toBe(false);
      expect(digital.body.mensagem).toMatch(new RegExp(`contados de ${diasAtras(5)}.*a partir de ${diasAtras(-10)}`));
      const edital = await evoluir(geral(["disciplina"]), 13, { acao: "HOMOLOGAR" });
      expect(edital.body.mensagem).toMatch(new RegExp(`contados de ${diasAtras(3)}`));
      expect(escritas()).toHaveLength(0);
    });
    test("membro que já está desligado: recusa, nada é gravado", async () => {
      preparar();
      const r = await evoluir(geral(["disciplina"]), 7, { acao: "HOMOLOGAR" });
      expect(r.body.sucesso).toBe(false);
      expect(r.body.mensagem).toMatch(/desligado/);
      expect(escritas()).toHaveLength(0);
      expect(vacancia.encerrarVinculos).not.toHaveBeenCalled();
    });
    test("prazo de defesa que ainda não venceu: recusa, nada é gravado", async () => {
      preparar();
      const r = await evoluir(geral(["disciplina"]), 9, { acao: "HOMOLOGAR" });
      expect(r.body.sucesso).toBe(false);
      expect(r.body.mensagem).toMatch(/prazo de defesa/);
      expect(escritas()).toHaveLength(0);
    });
    test("procedimento já homologado não é homologado de novo", async () => {
      preparar();
      expect((await evoluir(geral(["disciplina"]), 8, { acao: "HOMOLOGAR" })).body.sucesso).toBe(false);
      expect(escritas()).toHaveLength(0);
    });
  });

  describe("ARQUIVAR vale dentro do escopo da pessoa", () => {
    test("dentro do escopo: arquiva (com o estado no WHERE) e audita", async () => {
      preparar();
      const r = await evoluir(local(["disciplina"]), 5, { acao: "ARQUIVAR" });
      expect(r.body.sucesso).toBe(true);
      const arq = rodou(/UPDATE ProcedimentosAbandono SET Status = 'ARQUIVADO'/);
      expect(arq).toHaveLength(1);
      expect(arq[0].sql).toMatch(/AND Status = 'NOTIFICADO'/);
      expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    });
    test("o UPDATE não pegou nenhuma linha (já homologado/arquivado por outra pessoa): recusa e não audita", async () => {
      preparar({ afetadasArquivar: 0 });
      const r = await evoluir(local(["disciplina"]), 5, { acao: "ARQUIVAR" });
      expect(r.body.sucesso).toBe(false);
      expect(r.body.mensagem).toMatch(/já foi homologado ou arquivado/);
      expect(registrarAuditoria).not.toHaveBeenCalled();
    });
    test("procedimento de membro FORA do escopo = 'procedimento não encontrado', igual a inexistente e a id malformado; nada é gravado (HOMOLOGAR e RECURSO nem chegam aqui para a liderança local)", async () => {
      preparar();
      const fora = await evoluir(local(["disciplina"]), 6, { acao: "ARQUIVAR" });
      expect(fora).toEqual(NAO_ENCONTRADO);
      expect(await evoluir(local(["disciplina"]), 999, { acao: "ARQUIVAR" })).toEqual(NAO_ENCONTRADO);
      expect(escritas()).toHaveLength(0);
    });
    test("id malformado: a mesma resposta de 'não encontrado', SEM consultar o banco", async () => {
      preparar();
      for (const id of ["abc", "0x5", "05", " 5", "1e1", "-5"]) expect(await evoluir(local(["disciplina"]), id, { acao: "ARQUIVAR" })).toEqual(NAO_ENCONTRADO);
      expect(mockConsultas).toHaveLength(0);
    });
    test("o geral também aqui: procedimento de qualquer congregação", async () => {
      preparar();
      expect((await evoluir(geral(["disciplina"]), 6, { acao: "ARQUIVAR" })).body.sucesso).toBe(true);
    });
    test("o geral vê 'não encontrado' só para o que não existe", async () => {
      preparar();
      expect(await evoluir(geral(["disciplina"]), 999, { acao: "HOMOLOGAR" })).toEqual(NAO_ENCONTRADO);
    });
  });
  test("sem acao ou sem id na rota: 400; ação desconhecida: 400", async () => {
    preparar();
    expect((await evoluir(local(["disciplina"]), 5, {})).status).toBe(400);
    expect((await evoluir(local(["disciplina"]), 5, { acao: "OUTRA" })).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("ListarProcedimentosAbandono", () => {
  const linha = (id, membroId, congregacao, extra = {}) => ({ procedimentoId: id, membroId, nome: `Membro ${membroId}`, tipo: "MATERIAL", status: "NOTIFICADO", dataNotificacao: "2020-01-01", prazoDias: 15, congregacaoDaPessoa: congregacao, extensaoDaPessoa: null, ...extra });
  const preparar = () => quando(/FROM ProcedimentosAbandono pa/, [linha(1, 40, "A"), linha(2, 41, "B"), linha(3, 42, null)]);

  test("lista só os procedimentos de membros do escopo: o de fora e o de membro sem congregação NÃO aparecem", async () => {
    preparar();
    const r = await chamar(hListarProc, { metodo: "GET", token: local(["disciplina"]) });
    expect(r.status).toBe(200);
    expect(r.body.map(p => p.procedimentoId)).toEqual([1]);
    expect(r.body[0]).not.toHaveProperty("congregacaoDaPessoa");
    expect(r.body[0].prazoVencido).toBe(true);
    const sqlLista = rodou(/FROM ProcedimentosAbandono pa/)[0].sql;          // a consulta de verdade traz a congregação e a extensão do membro
    expect(sqlLista).toMatch(/c\.Nome AS congregacaoDaPessoa/);
    expect(sqlLista).toMatch(/ex\.Nome AS extensaoDaPessoa/);
    expect(sqlLista).toMatch(/LEFT JOIN Congregacoes c ON c\.CongregacaoId = m\.CongregacaoId/);
    expect(sqlLista).toMatch(/LEFT JOIN ExtensoesTenda ex ON ex\.ExtensaoId = m\.ExtensaoId/);
  });
  test("o geral vê todos", async () => {
    preparar();
    const r = await chamar(hListarProc, { metodo: "GET", token: geral(["disciplina"]) });
    expect(r.body.map(p => p.procedimentoId)).toEqual([1, 2, 3]);
  });
  test("prazo pelo último marco (abertura/edital) e quem abriu: `abertoPorMim` esconde o Homologar de quem abriu; a data de abertura não sai na resposta", async () => {
    quando(/FROM ProcedimentosAbandono pa/, [
      linha(1, 40, "A", { abertoPor: 1, abertoPorNome: "Presidente", abertoEmBrasilia: "2020-01-01" }),
      linha(2, 40, "A", { abertoPor: 2, abertoEmBrasilia: diasAtras(5) }),
      linha(3, 40, "A", { abertoPor: null, abertoEmBrasilia: null, dataEdital: diasAtras(20) })
    ]);
    const r = await chamar(hListarProc, { metodo: "GET", token: geral(["disciplina"]) });
    expect(r.body.map(p => [p.abertoPorMim, p.prazoVencido])).toEqual([[true, true], [false, false], [false, true]]);
    expect(r.body[1]).toMatchObject({ inicioPrazo: diasAtras(5), prazoVenceEm: diasAtras(-10) });
    expect(r.body[0]).not.toHaveProperty("abertoEmBrasilia");
    expect(rodou(/FROM ProcedimentosAbandono pa/)[0].sql).toMatch(/pa\.AbertoPor AS abertoPor/);
  });
  test("inicioPrazoDefesa: o último marco válido; ausentes ignorados", () => {
    expect(abandonoDigital.inicioPrazoDefesa({ dataNotificacao: "2026-01-01", abertoEmBrasilia: "2026-03-01", dataEdital: "2026-02-01" })).toBe("2026-03-01");
    expect(abandonoDigital.inicioPrazoDefesa({ dataNotificacao: "2026-01-01", abertoEmBrasilia: null, dataEdital: "2026-02-01" })).toBe("2026-02-01");
    expect(abandonoDigital.inicioPrazoDefesa({ dataNotificacao: new Date("2026-01-05T00:00:00Z") })).toBe("2026-01-05");
    expect(abandonoDigital.inicioPrazoDefesa({ dataNotificacao: null })).toBeNull();
    expect(abandonoDigital.situacaoPrazoDefesa({ dataNotificacao: "2026-01-01", prazoDias: 15 }, "2026-01-16")).toMatchObject({ vencido: true, venceEm: "2026-01-16" });
    expect(abandonoDigital.situacaoPrazoDefesa({ dataNotificacao: "2026-01-01", prazoDias: 15 }, "2026-01-15").vencido).toBe(false);
  });
  test("liderança por Extensão da Tenda: só os membros da MESMA extensão (mais estreito que a congregação-mãe)", async () => {
    quando(/FROM ProcedimentosAbandono pa/, [
      linha(1, 40, "A", { extensaoDaPessoa: "Tenda Norte" }), linha(2, 44, "A", { extensaoDaPessoa: "Tenda Sul" }), linha(3, 45, "A")
    ]);
    const r = await chamar(hListarProc, { metodo: "GET", token: local(["disciplina"], { escopoExtensaoNome: "Tenda Norte" }) });
    expect(r.body.map(p => p.procedimentoId)).toEqual([1]);
    const semExtensao = await chamar(hListarProc, { metodo: "GET", token: local(["disciplina"]) });
    expect(semExtensao.body.map(p => p.procedimentoId)).toEqual([1, 2, 3]);                 // sem escopo de extensão, vale a congregação
  });
  test("?membroId malformado devolve lista vazia sem consultar o banco; ?membroId de fora do escopo também vem vazio", async () => {
    preparar();
    expect((await chamar(hListarProc, { metodo: "GET", token: local(["disciplina"]), query: { membroId: "abc" } })).body).toEqual([]);
    expect(mockConsultas).toHaveLength(0);
    mockRegras = [];
    quando(/FROM ProcedimentosAbandono pa/, [linha(2, 41, "B")]);
    expect((await chamar(hListarProc, { metodo: "GET", token: local(["disciplina"]), query: { membroId: "41" } })).body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("ListarTentativasContato", () => {
  const SEM_TENTATIVAS = { tentativas: [], elegibilidade: { elegivel: false, canaisDistintos: 0, diasDesdePrimeira: null, ultimaTentativa: null } };
  const preparar = () => {
    quando(/FROM TentativasContatoAbandono t/, [{ tentativaId: 1, canalId: 3, canal: "E-mail", dataTentativa: "2026-01-01", observacao: "texto livre sensível" }]);
    quando(/MIN\(DataTentativa\)/, [{ Primeira: "2026-01-01", Ultima: "2026-01-01", CanaisDistintos: 1 }]);
  };
  const listar = (token, membroId) => chamar(hListarTent, { metodo: "GET", token, query: { membroId } });

  test("dentro do escopo: devolve as tentativas e a elegibilidade", async () => {
    preparar();
    const r = await listar(local(["disciplina"]), "40");
    expect(r.status).toBe(200);
    expect(r.body.tentativas).toHaveLength(1);
    expect(r.body.elegibilidade.canaisDistintos).toBe(1);
  });
  test("membro FORA do escopo = exatamente a resposta de 'sem tentativas' (a de matrícula inexistente), sem consultar as tentativas", async () => {
    preparar();
    const fora = await listar(local(["disciplina"]), "41");
    const semCongregacao = await listar(local(["disciplina"]), "42");
    const inexistente = await listar(local(["disciplina"]), "999");
    const malformada = await listar(local(["disciplina"]), "0x28");
    expect(fora.body).toEqual(SEM_TENTATIVAS);
    for (const r of [semCongregacao, inexistente, malformada]) expect(r).toEqual(fora);
    expect(rodou(/FROM TentativasContatoAbandono/)).toHaveLength(0);
  });
  test("o geral vê as tentativas de qualquer congregação", async () => {
    preparar();
    expect((await listar(geral(["disciplina"]), "41")).body.tentativas).toHaveLength(1);
  });
  test("sem membroId: 400", async () => {
    expect((await listar(local(["disciplina"]), undefined)).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("RadarAbandono e RadarAbandonoDigital", () => {
  const linhaMaterial = (id, congregacao) => ({ membroId: id, nome: `M${id}`, congregacao, extensao: null, dataAfastamento: "2020-01-01", situacaoMembro: "SEM_COMUNHAO" });
  test("RadarAbandono: só os membros do escopo (fora e sem congregação não aparecem); o geral vê todos", async () => {
    quando(/m.SituacaoMembro = 'SEM_COMUNHAO'/, [linhaMaterial(40, "A"), linhaMaterial(41, "B"), linhaMaterial(42, null)]);
    const l = await chamar(hRadar, { metodo: "GET", token: local(["disciplina"]) });
    expect(l.body.map(m => m.membroId)).toEqual([40]);
    expect(l.body[0]).toMatchObject({ elegivel: true });
    expect(l.body[0]).not.toHaveProperty("extensao");
    const sqlRadar = rodou(/m\.SituacaoMembro = 'SEM_COMUNHAO'/)[0].sql;
    expect(sqlRadar).toMatch(/c\.Nome AS congregacao,/);
    expect(sqlRadar).toMatch(/ex\.Nome AS extensao,/);
    expect(sqlRadar).toMatch(/LEFT JOIN ExtensoesTenda ex ON ex\.ExtensaoId = m\.ExtensaoId/);
    const g = await chamar(hRadar, { metodo: "GET", token: geral(["disciplina"]) });
    expect(g.body.map(m => m.membroId).sort()).toEqual([40, 41, 42]);
  });
  test("RadarAbandonoDigital: só os membros do escopo, e a elegibilidade só é calculada para eles (o filtro vem antes do laço)", async () => {
    quando(/FROM TentativasContatoAbandono t/, [{ membroId: 40, nome: "M40", congregacao: "A", extensao: null }, { membroId: 41, nome: "M41", congregacao: "B", extensao: null }, { membroId: 42, nome: "M42", congregacao: null, extensao: null }]);
    quando(/MIN\(DataTentativa\)/, [{ Primeira: "2026-01-01", Ultima: "2026-02-01", CanaisDistintos: 2 }]);
    const l = await chamar(hRadarDigital, { metodo: "GET", token: local(["disciplina"]) });
    expect(l.body.map(m => m.membroId)).toEqual([40]);
    expect(l.body[0]).not.toHaveProperty("extensao");
    const sqlRadarDigital = rodou(/FROM TentativasContatoAbandono t/)[0].sql;
    expect(sqlRadarDigital).toMatch(/c\.Nome AS congregacao,/);
    expect(sqlRadarDigital).toMatch(/ex\.Nome AS extensao/);
    expect(sqlRadarDigital).toMatch(/LEFT JOIN ExtensoesTenda ex ON ex\.ExtensaoId = m\.ExtensaoId/);
    expect(rodou(/MIN\(DataTentativa\)/)).toHaveLength(1);
    mockConsultas = [];
    const g = await chamar(hRadarDigital, { metodo: "GET", token: geral(["disciplina"]) });
    expect(g.body.map(m => m.membroId).sort()).toEqual([40, 41, 42]);
    expect(rodou(/MIN\(DataTentativa\)/)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("ListarProcessosDisciplinares", () => {
  const processo = (id, membroId, congregacaoReu, extra = {}) => ({
    processoId: id, membroId, nome: `Réu ${membroId}`, orgaoResponsavelId: null, orgaoLocalId: 1, orgaoSigla: "JAI", status: "EM_ANDAMENTO", sigiloso: false,
    motivo: "motivo", relatorMembroId: null, congregacaoReu, extensaoReu: null, ...extra
  });
  const preparar = (extra = []) => {
    quando(/FROM ProcessosDisciplinares p\s/, [
      processo(1, 40, "A"),
      processo(2, 41, "B"),
      processo(3, 40, "A", { orgaoResponsavelId: 1, orgaoLocalId: null, orgaoSigla: "CEI" }),     // órgão CENTRAL
      processo(4, 42, null),
      ...extra
    ]);
    quando(/FROM ProcessoInfracoes pi/, []);
  };
  const listar = (token, query = {}) => chamar(hListarProcessos, { metodo: "GET", token, query });

  test("liderança local: só o processo cujo RÉU está no escopo e que é de órgão territorial (o de outra congregação, o de réu sem congregação e o de órgão central NÃO aparecem)", async () => {
    preparar();
    const r = await listar(local(["disciplina"]));
    expect(r.status).toBe(200);
    expect(r.body.map(p => p.processoId)).toEqual([1]);
    const sqlLista = rodou(/FROM ProcessosDisciplinares p\s/)[0].sql;        // a consulta de verdade traz a congregação e a extensão do RÉU
    expect(sqlLista).toMatch(/cgr\.Nome AS congregacaoReu\b/);
    expect(sqlLista).toMatch(/extr\.Nome AS extensaoReu\b/);
    expect(sqlLista).toMatch(/LEFT JOIN Congregacoes cgr ON cgr\.CongregacaoId = m\.CongregacaoId/);
    expect(sqlLista).toMatch(/LEFT JOIN ExtensoesTenda extr ON extr\.ExtensaoId = m\.ExtensaoId/);
  });
  test("o geral vê todos, inclusive o de órgão central", async () => {
    preparar();
    expect((await listar(geral(["disciplina"]))).body.map(p => p.processoId).sort()).toEqual([1, 2, 3, 4]);
  });
  test("processo de órgão central é do geral: nem papel local com escopo 'todas' nem papel Global com lista de congregações o veem", async () => {
    preparar();
    expect((await listar(localComEscopoTodas(["disciplina"]))).body.map(p => p.processoId).sort()).toEqual([1, 2, 4]);
    expect((await listar(globalComListaDeCongregacoes(["disciplina"]))).body.map(p => p.processoId)).toEqual([1]);
  });
  test("liderança por Extensão da Tenda: só os réus da MESMA extensão (mais estreito que a congregação-mãe)", async () => {
    preparar([processo(6, 44, "A", { extensaoReu: "Tenda Norte" }), processo(7, 45, "A", { extensaoReu: "Tenda Sul" })]);
    const r = await listar(local(["disciplina"], { escopoExtensaoNome: "Tenda Norte" }));
    expect(r.body.map(p => p.processoId)).toEqual([6]);
  });
  test("a JEA/TER enxerga as congregações da sua área/região (escopo em lista)", async () => {
    preparar();
    const jea = local(["disciplina"], { nivel: "AREA", escopoCongregacoes: ["A", "B"] });
    expect((await listar(jea)).body.map(p => p.processoId)).toEqual([1, 2]);
  });
  test("o sigilo continua valendo por cima do escopo (sem 'cei' e sem ser o relator: motivo e infrações somem)", async () => {
    preparar([processo(5, 40, "A", { sigiloso: true })]);
    const r = await listar(local(["disciplina"]));
    const sigiloso = r.body.find(p => p.processoId === 5);
    expect(sigiloso).toMatchObject({ motivo: null, detalhesRestritos: true });
  });
  test("?membroId malformado devolve lista vazia sem consultar o banco; ?membroId de fora do escopo também vem vazio", async () => {
    preparar();
    expect((await listar(local(["disciplina"]), { membroId: "abc" })).body).toEqual([]);
    expect(mockConsultas).toHaveLength(0);
    mockRegras = [];
    quando(/FROM ProcessosDisciplinares p\s/, [processo(2, 41, "B")]);
    expect((await listar(local(["disciplina"]), { membroId: "41" })).body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("AbrirProcessoDisciplinar (escopo do réu + órgão central é do geral)", () => {
  const NAO_ENCONTRADA = { status: 200, headers: { "Content-Type": "application/json" }, body: { sucesso: false, mensagem: "Matrícula não encontrada. Cadastre a pessoa antes." } };
  const preparar = () => {
    quando(/SELECT Sigla, Nome, Nivel, ReferenciaId, Ativo FROM OrgaosLocais/, [{ Sigla: "JAI", Nome: "JAI A", Nivel: 1, ReferenciaId: 1, Ativo: 1 }]);
    quando(/SELECT Sigla, Nome FROM Orgaos WHERE OrgaoId/, [{ Sigla: "CEI", Nome: "CEI" }]);
    quando(/SELECT Nivel, ReferenciaId FROM OrgaosLocais/, [{ Nivel: 1, ReferenciaId: 1 }]);
    quando(/SELECT AreaId FROM Congregacoes/, [{ AreaId: 10 }]);
    quando(/SELECT TOP 1 LiderancaId FROM Lideranca/, [{ LiderancaId: 1 }]);
    quando(/SELECT MembroId, SituacaoMembro FROM MembroReferencia/, (i) => [{ MembroId: i.id, SituacaoMembro: "EM_COMUNHAO" }]);
    quando(/FROM TiposInfracao WHERE Ativo = 1/, [{ InfracaoId: 1 }]);
    quando(/INSERT INTO ProcessosDisciplinares/, [{ ProcessoId: 11 }]);
    quando(/WHERE p.ProcessoId = @id/, [{ processoId: 11, membroId: 40, status: "EM_ANDAMENTO" }]);
  };
  const abrir = (token, corpo) => chamar(hAbrirProcesso, { token, corpo: { infracoesIds: [1], ...corpo } });

  test("liderança local abre contra réu do escopo, no órgão territorial a que pertence", async () => {
    preparar();
    const r = await abrir(local(["disciplina"]), { membroId: 40, orgaoLocalId: 1 });
    expect(r.status).toBe(201);
    expect(rodou(/INSERT INTO ProcessosDisciplinares/)).toHaveLength(1);
  });
  test("réu FORA do escopo (ou sem congregação, inexistente, malformado): a mesma resposta de 'matrícula não encontrada', nada gravado", async () => {
    preparar();
    for (const membroId of [41, 42, 999, "abc"]) expect(await abrir(local(["disciplina"]), { membroId, orgaoLocalId: 1 })).toEqual(NAO_ENCONTRADA);
    expect(escritas()).toHaveLength(0);
  });
  test("órgão CENTRAL só o geral abre: a liderança local (mesmo com 'disciplina') leva 403 e nada é gravado", async () => {
    preparar();
    const r = await abrir(local(["disciplina"]), { membroId: 40, orgaoResponsavelId: 1 });
    expect(r).toMatchObject({ status: 403, body: { sucesso: false, mensagem: er.MSG_GERAL } });
    expect(escritas()).toHaveLength(0);
    expect((await abrir(localComEscopoTodas(["disciplina"]), { membroId: 40, orgaoResponsavelId: 1 })).status).toBe(403);
    expect((await abrir(globalComListaDeCongregacoes(["disciplina"]), { membroId: 40, orgaoResponsavelId: 1 })).status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
  test("o geral abre no órgão central, contra réu de qualquer congregação", async () => {
    preparar();
    expect((await abrir(geral(["disciplina"]), { membroId: 41, orgaoResponsavelId: 1 })).status).toBe(201);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("EvoluirProcessoDisciplinar (escopo do réu + órgão central é do geral + destino do recurso)", () => {
  const NAO_ENCONTRADO = { status: 200, body: { sucesso: false, mensagem: "Processo não encontrado." } };
  const PROCESSOS = {
    1: { MembroId: 40, Status: "EM_ANDAMENTO", OrgaoResponsavelId: null, OrgaoLocalId: 1 },
    2: { MembroId: 41, Status: "EM_ANDAMENTO", OrgaoResponsavelId: null, OrgaoLocalId: 1 },
    3: { MembroId: 40, Status: "EM_ANDAMENTO", OrgaoResponsavelId: 1, OrgaoLocalId: null },
    4: { MembroId: 40, Status: "JULGADO", Resultado: "SANCAO", OrgaoResponsavelId: null, OrgaoLocalId: 1 }
  };
  const ORGAOS_LOCAIS = {
    1: { Sigla: "JAI", Nome: "JAI A", Nivel: 1, ReferenciaId: 1, Ativo: 1 },
    2: { Sigla: "JEA", Nome: "JEA da área do réu", Nivel: 2, ReferenciaId: 10, Ativo: 1 },
    3: { Sigla: "JEA", Nome: "JEA de outra área", Nivel: 2, ReferenciaId: 11, Ativo: 1 }
  };
  const preparar = () => {
    quando(/FROM ProcessosDisciplinares WHERE ProcessoId = @id/, (i) => (PROCESSOS[i.id] ? [{ ...PROCESSOS[i.id] }] : []));
    quando(/SELECT Sigla, Nome, Nivel, ReferenciaId, Ativo FROM OrgaosLocais/, (i) => (ORGAOS_LOCAIS[i.id] ? [{ ...ORGAOS_LOCAIS[i.id] }] : []));
    quando(/SELECT Sigla, Nome FROM Orgaos WHERE OrgaoId/, [{ Sigla: "CEI", Nome: "CEI" }]);
    quando(/SELECT Nivel, ReferenciaId FROM OrgaosLocais/, (i) => (ORGAOS_LOCAIS[i.id] ? [{ Nivel: ORGAOS_LOCAIS[i.id].Nivel, ReferenciaId: ORGAOS_LOCAIS[i.id].ReferenciaId }] : []));
    quando(/SELECT AreaId FROM Congregacoes/, [{ AreaId: 10 }]);
    quando(/SELECT TOP 1 LiderancaId FROM Lideranca/, [{ LiderancaId: 1 }]);
    quando(/UPDATE ProcessosDisciplinares SET CanalCitacao/, [], 1);
    quando(/SELECT InfracaoId FROM ProcessoInfracoes WHERE ProcessoId/, [{ InfracaoId: 1 }]);
    quando(/INSERT INTO ProcessosDisciplinares/, [{ ProcessoId: 12 }]);
    quando(/WHERE p.ProcessoId = @id/, [{ processoId: 1, membroId: 40, status: "EM_ANDAMENTO" }]);
  };
  const evoluir = (token, processoId, corpo) => chamar(hEvolProcesso, { token, corpo, ligado: { processoId } });

  test("dentro do escopo (processo de órgão territorial, réu da congregação): a ação acontece", async () => {
    preparar();
    const r = await evoluir(local(["disciplina"]), 1, { acao: "CITAR", canalCitacao: "WHATSAPP" });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/UPDATE ProcessosDisciplinares SET CanalCitacao/)).toHaveLength(1);
  });
  test("réu FORA do escopo = 'processo não encontrado', igual a inexistente e a id malformado; nada gravado", async () => {
    preparar();
    expect(await evoluir(local(["disciplina"]), 2, { acao: "CITAR", canalCitacao: "WHATSAPP" })).toEqual(NAO_ENCONTRADO);
    expect(await evoluir(local(["disciplina"]), 999, { acao: "CITAR", canalCitacao: "WHATSAPP" })).toEqual(NAO_ENCONTRADO);
    expect(escritas()).toHaveLength(0);
  });
  test("id malformado: a mesma resposta de 'não encontrado', SEM consultar o banco", async () => {
    preparar();
    for (const id of ["abc", "0x1", "01", "1e0"]) expect(await evoluir(local(["disciplina"]), id, { acao: "CITAR", canalCitacao: "WHATSAPP" })).toEqual(NAO_ENCONTRADO);
    expect(mockConsultas).toHaveLength(0);
  });
  test("processo de órgão CENTRAL: a liderança local (mesmo com réu do próprio escopo) recebe 'não encontrado'; o geral age", async () => {
    preparar();
    expect(await evoluir(local(["disciplina"]), 3, { acao: "CITAR", canalCitacao: "WHATSAPP" })).toEqual(NAO_ENCONTRADO);
    expect(await evoluir(localComEscopoTodas(["disciplina"]), 3, { acao: "CITAR", canalCitacao: "WHATSAPP" })).toEqual(NAO_ENCONTRADO);
    expect(escritas()).toHaveLength(0);
    expect((await evoluir(geral(["disciplina"]), 3, { acao: "CITAR", canalCitacao: "WHATSAPP" })).body.sucesso).toBe(true);
  });
  describe("RECORRER: o destino precisa ser a instância acima NO CAMINHO do réu", () => {
    const recorrer = (token, orgaoDestinoId) => evoluir(token, 4, { acao: "RECORRER", orgaoDestinoTipo: "LOCAL", orgaoDestinoId, justificativa: "discordo" });
    test("a JEA da própria área: o recurso é registrado", async () => {
      preparar();
      const r = await recorrer(local(["disciplina"]), 2);
      expect(r.body.sucesso).toBe(true);
      expect(rodou(/INSERT INTO ProcessosDisciplinares/)).toHaveLength(1);
    });
    test("a JEA de OUTRA área: recusado e nada gravado", async () => {
      preparar();
      const r = await recorrer(local(["disciplina"]), 3);
      expect(r.body.sucesso).toBe(false);
      expect(r.body.mensagem).toMatch(/imediatamente superior/);
      expect(escritas()).toHaveLength(0);
    });
    test("o geral escolhe o destino livremente", async () => {
      preparar();
      expect((await recorrer(geral(["disciplina"]), 3)).body.sucesso).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("CriarConsagracao", () => {
  const GUID = "22222222-2222-2222-2222-222222222222";
  const NAO_ENCONTRADA = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada. Cadastre a pessoa antes." } };
  const preparar = () => {
    quando(/SELECT Funcao FROM MembroReferencia/, [{ Funcao: "Diácono" }]);
    quando(/INSERT INTO Consagracoes/, [{ ConsagracaoId: GUID }]);
    quando(/WHERE c.ConsagracaoId = @id/, [{ consagracaoId: GUID, membroId: 40, nome: "Maria", status: "PROTOCOLADO" }]);
  };
  const criar = (token, corpo) => chamar(hCriarCons, { token, corpo: { assunto: "Diaconato", ...corpo } });

  test("liderança local protocola para membro do escopo, sendo ela mesma a proponente", async () => {
    preparar();
    const r = await criar(local(["consagracoes"]), { membroId: 40, proponenteMembroId: 5 });
    expect(r.status).toBe(201);
    const ins = rodou(/INSERT INTO Consagracoes/);
    expect(ins).toHaveLength(1);
    expect(ins[0].inputs).toMatchObject({ membroId: 40, proponenteMembroId: 5 });
    expect((await criar(local(["consagracoes"]), { membroId: 40, proponenteMembroId: "5" })).status).toBe(201);
  });
  test("membro FORA do escopo (ou sem congregação, inexistente, malformado): a mesma resposta de 'matrícula não encontrada', nada gravado", async () => {
    preparar();
    for (const membroId of [41, 42, 999, "abc"]) expect(await criar(local(["consagracoes"]), { membroId, proponenteMembroId: 5 })).toEqual(NAO_ENCONTRADA);
    expect(escritas()).toHaveLength(0);
  });
  test("proponente que não é o usuário: 403 e nada gravado (só o geral protocola em nome de outra pessoa)", async () => {
    preparar();
    const r = await criar(local(["consagracoes"]), { membroId: 40, proponenteMembroId: 6 });
    expect(r.status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
  test("o geral indica outro proponente, desde que ele exista", async () => {
    preparar();
    expect((await criar(geral(["consagracoes"]), { membroId: 41, proponenteMembroId: 40 })).status).toBe(201);
    expect(rodou(/INSERT INTO Consagracoes/)[0].inputs).toMatchObject({ membroId: 41, proponenteMembroId: 40 });
    mockConsultas = [];
    const r = await criar(geral(["consagracoes"]), { membroId: 41, proponenteMembroId: 999 });
    expect(r.body).toMatchObject({ sucesso: false, mensagem: "Proponente não encontrado." });
    expect(escritas()).toHaveLength(0);
  });
  test("campos obrigatórios ausentes: 400", async () => {
    expect((await criar(local(["consagracoes"]), { proponenteMembroId: 5 })).status).toBe(400);
    expect((await criar(local(["consagracoes"]), { membroId: 40 })).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("EvoluirConsagracao: os passos do Conselho e do Plenário são do geral", () => {
  const GUID = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-${String(n).repeat(4)}-${String(n).repeat(4)}-${String(n).repeat(12)}`;
  const CONSAGRACOES = {
    [GUID(1)]: { membroId: 40, status: "PROTOCOLADO", assunto: "Diaconato" },
    [GUID(2)]: { membroId: 40, status: "AGUARDANDO_PLENARIO", assunto: "Diaconato" },
    [GUID(3)]: { membroId: 40, status: "CONCLUIDO", assunto: "Diaconato" }
  };
  const preparar = ({ afetadasUpdate = 1 } = {}) => {
    quando(/FROM Consagracoes WHERE ConsagracaoId = @id/, (i) => (CONSAGRACOES[i.id] ? [{ ...CONSAGRACOES[i.id] }] : []));
    quando(/UPDATE Consagracoes SET/, [], afetadasUpdate);
    quando(/SELECT TOP 1 CargoMinisterialResultante FROM TiposConsagracao/, [{ CargoMinisterialResultante: "DIACONO" }]);
  };
  const evoluir = (token, consagracaoId, corpo) => chamar(hEvolCons, { token, corpo, ligado: { consagracaoId } });

  test.each(["AVANCAR", "REPROVAR"])("%s: liderança local com 'consagracoes' leva 403 ANTES de tocar no banco", async (acao) => {
    preparar();
    expect(await evoluir(local(["consagracoes"]), GUID(1), { acao })).toMatchObject({ status: 403, body: { sucesso: false, mensagem: er.MSG_GERAL } });
    expect(mockConsultas).toHaveLength(0);
  });
  test("papel Global com lista de congregações e papel local com escopo 'todas' também levam 403 sem tocar no banco", async () => {
    preparar();
    expect((await evoluir(globalComListaDeCongregacoes(["consagracoes"]), GUID(1), { acao: "AVANCAR" })).status).toBe(403);
    expect((await evoluir(localComEscopoTodas(["consagracoes"]), GUID(1), { acao: "AVANCAR" })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("o geral avança a etapa: o UPDATE leva a etapa atual no WHERE", async () => {
    preparar();
    const r = await evoluir(geral(["consagracoes"]), GUID(1), { acao: "AVANCAR" });
    expect(r.body).toMatchObject({ sucesso: true, novoStatus: "EM_ANALISE_CONSELHO" });
    const upd = rodou(/UPDATE Consagracoes SET/);
    expect(upd).toHaveLength(1);
    expect(upd[0].sql).toMatch(/AND Status = @etapaAtual/);
    expect(upd[0].inputs).toMatchObject({ status: "EM_ANALISE_CONSELHO", etapaAtual: "PROTOCOLADO" });
  });
  test("concluir grava a função e o cargo ministerial do membro", async () => {
    preparar();
    const r = await evoluir(geral(["consagracoes"]), GUID(2), { acao: "AVANCAR" });
    expect(r.body).toMatchObject({ sucesso: true, novoStatus: "CONCLUIDO" });
    expect(rodou(/UPDATE MembroReferencia SET Funcao/)).toHaveLength(1);
    expect(rodou(/UPDATE MembroReferencia SET CargoMinisterial/)[0].inputs).toMatchObject({ membroId: 40, cargo: "DIACONO" });
  });
  test("o processo mudou de etapa no meio (UPDATE sem linha): não aplica função nem cargo", async () => {
    preparar({ afetadasUpdate: 0 });
    const r = await evoluir(geral(["consagracoes"]), GUID(2), { acao: "AVANCAR" });
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/UPDATE MembroReferencia/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("REPROVAR: o geral reprova; o WHERE exclui o que já está CONCLUIDO/REPROVADO (UPDATE sem linha = recusa)", async () => {
    preparar();
    expect((await evoluir(geral(["consagracoes"]), GUID(1), { acao: "REPROVAR" })).body.sucesso).toBe(true);
    expect(rodou(/UPDATE Consagracoes SET Status = 'REPROVADO'/)[0].sql).toMatch(/Status NOT IN \('CONCLUIDO', 'REPROVADO'\)/);
    mockConsultas = [];
    mockRegras = [];
    preparar({ afetadasUpdate: 0 });
    const r = await evoluir(geral(["consagracoes"]), GUID(3), { acao: "REPROVAR" });
    expect(r.body.sucesso).toBe(false);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);   // só a da reprovação anterior
  });
  test("id malformado ou inexistente: a mesma resposta de 'processo não encontrado'", async () => {
    preparar();
    const inexistente = await evoluir(geral(["consagracoes"]), GUID(9), { acao: "AVANCAR" });
    expect(inexistente).toEqual({ status: 200, body: { sucesso: false, mensagem: "Processo não encontrado." } });
    mockConsultas = [];
    expect(await evoluir(geral(["consagracoes"]), "nao-e-guid", { acao: "AVANCAR" })).toEqual(inexistente);
    expect(await evoluir(geral(["consagracoes"]), 5, { acao: "AVANCAR" })).toEqual(inexistente);
    expect(mockConsultas).toHaveLength(0);                                   // id que não é GUID nem chega ao banco
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("ListarConsagracoes", () => {
  const linha = (id, membroId, congregacao) => ({ consagracaoId: `c${id}`, membroId, nome: `M${membroId}`, assunto: "Diaconato", status: "PROTOCOLADO", congregacao, extensao: null });
  const preparar = () => quando(/FROM Consagracoes c/, [linha(1, 40, "A"), linha(2, 41, "B"), linha(3, 42, null)]);

  test("lista só os processos de membros do escopo; o geral vê todos", async () => {
    preparar();
    const l = await chamar(hListarCons, { metodo: "GET", token: local(["consagracoes"]) });
    expect(l.body.map(c => c.consagracaoId)).toEqual(["c1"]);
    const sqlLista = rodou(/FROM Consagracoes c/)[0].sql;
    expect(sqlLista).toMatch(/cg\.Nome AS congregacao,/);
    expect(sqlLista).toMatch(/ex\.Nome AS extensao/);
    expect(sqlLista).toMatch(/LEFT JOIN Congregacoes cg ON cg\.CongregacaoId = m\.CongregacaoId/);
    expect(sqlLista).toMatch(/LEFT JOIN ExtensoesTenda ex ON ex\.ExtensaoId = m\.ExtensaoId/);
    const g = await chamar(hListarCons, { metodo: "GET", token: geral(["consagracoes"]) });
    expect(g.body.map(c => c.consagracaoId)).toEqual(["c1", "c2", "c3"]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoCandidatosBatismo", () => {
  const candidato = (id, membroId, congregacaoNome, extra = {}) => ({
    candidatoId: id, membroId, nome: `M${membroId}`, dataNascimento: "2000-01-01", estadoCivil: "SOLTEIRO", turmaId: null, status: "AGUARDANDO_TURMA",
    parecerVidaPregressa: "FAVORAVEL", parecerObservacao: null, discipuladoConcluidoManual: true, motivoReprovacao: null, aceiteTermoAssinadoId: 7,
    dataInscricao: "2026-01-01", congregacaoNome, extensaoNome: null, ...extra
  });
  const CANDIDATOS = {
    101: candidato(101, 40, "A"),
    102: candidato(102, 41, "B"),
    103: candidato(103, 40, "A", { status: "BATIZADO" }),
    104: candidato(104, 40, "A", { status: "APROVADO", turmaId: 1 }),
    105: candidato(105, 40, "A", { aceiteTermoAssinadoId: null })
  };
  const TURMAS = {
    1: { Status: "ABERTA", congregacaoId: 1, congregacaoNome: "A" },
    2: { Status: "ABERTA", congregacaoId: 2, congregacaoNome: "B" },
    3: { Status: "REALIZADA", congregacaoId: 1, congregacaoNome: "A" },
    4: { Status: "ABERTA", congregacaoId: null, congregacaoNome: null }
  };
  const preparar = ({ afetadasAprovar = 1 } = {}) => {
    quando(/FROM CandidatosBatismo c JOIN MembroReferencia m/, (i) => (i.id ? (CANDIDATOS[i.id] ? [{ ...CANDIDATOS[i.id] }] : []) : Object.values(CANDIDATOS).map(c => ({ ...c }))));
    quando(/WHERE t.TurmaId = @id/, (i) => (TURMAS[i.id] ? [{ ...TURMAS[i.id] }] : []));
    quando(/SELECT 1 FROM CandidatosBatismo WHERE MembroId/, []);
    quando(/INSERT INTO CandidatosBatismo/, [{ CandidatoId: 200 }]);
    quando(/UPDATE CandidatosBatismo SET Status = 'APROVADO'/, [], afetadasAprovar);
  };
  const NAO_ENCONTRADO = { status: 404, body: { sucesso: false, mensagem: "Candidato não encontrado." } };
  const put = (token, id, corpo) => chamar(hCandidatos, { metodo: "PUT", token, corpo, ligado: { id } });

  describe("lista", () => {
    test("liderança local: só candidatos do escopo; a aptidão só é calculada para eles", async () => {
      preparar();
      const r = await chamar(hCandidatos, { metodo: "GET", token: local(["consagracoes"]) });
      expect(r.body.map(c => c.candidatoId)).toEqual([101, 103, 104, 105]);
      for (const c of r.body) expect(c.aptidao).toBeDefined();
      const sqlLista = rodou(/FROM CandidatosBatismo c JOIN MembroReferencia m/)[0].sql;
      expect(sqlLista).toMatch(/cg\.Nome AS congregacaoNome/);
      expect(sqlLista).toMatch(/ex\.Nome AS extensaoNome/);
      expect(sqlLista).toMatch(/LEFT JOIN Congregacoes cg ON cg\.CongregacaoId = m\.CongregacaoId/);
      expect(sqlLista).toMatch(/LEFT JOIN ExtensoesTenda ex ON ex\.ExtensaoId = m\.ExtensaoId/);
    });
    test("o geral vê todos", async () => {
      preparar();
      const r = await chamar(hCandidatos, { metodo: "GET", token: geral(["consagracoes"]) });
      expect(r.body.map(c => c.candidatoId)).toEqual([101, 102, 103, 104, 105]);
    });
    test("?turmaId malformado devolve lista vazia sem consultar", async () => {
      preparar();
      expect((await chamar(hCandidatos, { metodo: "GET", token: local(["consagracoes"]), query: { turmaId: "abc" } })).body).toEqual([]);
      expect(mockConsultas).toHaveLength(0);
    });
  });

  describe("inscrever (POST)", () => {
    const inscrever = (token, membroId) => chamar(hCandidatos, { token, corpo: { membroId } });
    const RECUSA = { status: 400, body: { sucesso: false, mensagem: "Matrícula não encontrada ou inativa." } };
    test("membro do escopo: inscreve e audita", async () => {
      preparar();
      const r = await inscrever(local(["consagracoes"]), 40);
      expect(r.status).toBe(201);
      expect(rodou(/INSERT INTO CandidatosBatismo/)[0].inputs.membroId).toBe(40);
      expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    });
    test("fora do escopo, sem congregação, inexistente, malformado e inativo: a MESMA resposta, nada gravado", async () => {
      preparar();
      for (const membroId of [41, 42, 999, "abc", 43]) expect(await inscrever(local(["consagracoes"]), membroId)).toEqual(RECUSA);
      expect(escritas()).toHaveLength(0);
    });
    test("o geral inscreve de qualquer congregação", async () => {
      preparar();
      expect((await inscrever(geral(["consagracoes"]), 41)).status).toBe(201);
    });
  });

  describe("agir sobre o candidato (PUT)", () => {
    test.each([
      ["ATRIBUIR_TURMA", { turmaId: 1 }], ["PARECER", { parecerVidaPregressa: "FAVORAVEL" }], ["DISCIPULADO_CONCLUIDO", { concluido: true }],
      ["ACEITAR_ESTATUTO", {}], ["APROVAR", {}], ["REPROVAR", { motivo: "x" }]
    ])("%s em candidato FORA do escopo = 'candidato não encontrado' (igual a inexistente e a id malformado), nada gravado", async (acao, extra) => {
      preparar();
      expect(await put(local(["consagracoes"]), 102, { acao, ...extra })).toEqual(NAO_ENCONTRADO);
      expect(await put(local(["consagracoes"]), 999, { acao, ...extra })).toEqual(NAO_ENCONTRADO);
      expect(escritas()).toHaveLength(0);
    });
    test("id malformado: a mesma resposta de 'candidato não encontrado', SEM consultar o banco", async () => {
      preparar();
      for (const id of ["abc", "0x65", "0101", "1e2"]) expect(await put(local(["consagracoes"]), id, { acao: "PARECER", parecerVidaPregressa: "FAVORAVEL" })).toEqual(NAO_ENCONTRADO);
      expect(mockConsultas).toHaveLength(0);
    });
    test("o geral age em candidato de qualquer congregação", async () => {
      preparar();
      expect((await put(geral(["consagracoes"]), 102, { acao: "PARECER", parecerVidaPregressa: "FAVORAVEL" })).body.sucesso).toBe(true);
    });
    test("PARECER dentro do escopo grava e audita", async () => {
      preparar();
      expect((await put(local(["consagracoes"]), 101, { acao: "PARECER", parecerVidaPregressa: "DESFAVORAVEL", observacao: "ok" })).body.sucesso).toBe(true);
      expect(rodou(/UPDATE CandidatosBatismo SET ParecerVidaPregressa/)).toHaveLength(1);
      expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    });

    describe("ATRIBUIR_TURMA confere candidato E turma", () => {
      const atribuir = (token, id, turmaId) => put(token, id, { acao: "ATRIBUIR_TURMA", turmaId });
      const RECUSA_TURMA = { status: 200, body: { sucesso: false, mensagem: "Turma inválida ou já encerrada." } };
      test("turma da própria congregação: atribui e passa a constar na trilha", async () => {
        preparar();
        expect((await atribuir(local(["consagracoes"]), 101, 1)).body.sucesso).toBe(true);
        expect(rodou(/UPDATE CandidatosBatismo SET TurmaId/)[0].inputs).toMatchObject({ id: 101, turmaId: 1 });
        expect(registrarAuditoria).toHaveBeenCalledTimes(1);
        expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ tabela: "CandidatosBatismo", registroId: 101, dadosDepois: { turmaId: 1 } });
        const sqlTurma = rodou(/WHERE t\.TurmaId = @id/)[0].sql;             // a consulta da turma traz a congregação (id e nome)
        expect(sqlTurma).toMatch(/t\.CongregacaoId AS congregacaoId/);
        expect(sqlTurma).toMatch(/cg\.Nome AS congregacaoNome/);
        expect(sqlTurma).toMatch(/LEFT JOIN Congregacoes cg ON cg\.CongregacaoId = t\.CongregacaoId/);
      });
      test("turma de FORA do escopo, turma da igreja toda (sem congregação), encerrada, inexistente ou malformada: a MESMA recusa", async () => {
        preparar();
        for (const turmaId of [2, 4, 3, 99, "abc"]) expect(await atribuir(local(["consagracoes"]), 101, turmaId)).toEqual(RECUSA_TURMA);
        expect(escritas()).toHaveLength(0);
      });
      test("o geral atribui à turma da igreja toda e à de outra congregação", async () => {
        preparar();
        expect((await atribuir(geral(["consagracoes"]), 101, 4)).body.sucesso).toBe(true);
        expect((await atribuir(geral(["consagracoes"]), 101, 2)).body.sucesso).toBe(true);
      });
      test("turmaId malformada nem chega ao banco", async () => {
        preparar();
        mockConsultas = [];
        expect(await atribuir(local(["consagracoes"]), 101, "abc")).toEqual(RECUSA_TURMA);
        expect(rodou(/FROM TurmasBatismo/)).toHaveLength(0);
      });
      test("candidato já batizado não é reatribuído", async () => {
        preparar();
        expect((await atribuir(geral(["consagracoes"]), 103, 1)).body.sucesso).toBe(false);
        expect(escritas()).toHaveLength(0);
      });
    });

    test("DISCIPULADO_CONCLUIDO passa a ficar na trilha de auditoria", async () => {
      preparar();
      expect((await put(local(["consagracoes"]), 101, { acao: "DISCIPULADO_CONCLUIDO", concluido: true })).body.sucesso).toBe(true);
      expect(rodou(/UPDATE CandidatosBatismo SET DiscipuladoConcluidoManual/)).toHaveLength(1);
      expect(registrarAuditoria).toHaveBeenCalledTimes(1);
      expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ tabela: "CandidatosBatismo", registroId: 101 });
    });

    describe("APROVAR", () => {
      test("candidato na fila e apto: aprova (com o estado no WHERE) e audita", async () => {
        preparar();
        expect((await put(local(["consagracoes"]), 101, { acao: "APROVAR" })).body.sucesso).toBe(true);
        const upd = rodou(/UPDATE CandidatosBatismo SET Status = 'APROVADO'/);
        expect(upd).toHaveLength(1);
        expect(upd[0].sql).toMatch(/AND Status = 'AGUARDANDO_TURMA'/);
        expect(registrarAuditoria).toHaveBeenCalledTimes(1);
      });
      test("candidato que já está APROVADO ou já BATIZADO não é aprovado de novo", async () => {
        preparar();
        for (const id of [104, 103]) expect((await put(local(["consagracoes"]), id, { acao: "APROVAR" })).body.sucesso).toBe(false);
        expect(escritas()).toHaveLength(0);
      });
      test("o status mudou entre a leitura e a gravação (UPDATE sem linha): recusa e não audita", async () => {
        preparar({ afetadasAprovar: 0 });
        expect((await put(local(["consagracoes"]), 101, { acao: "APROVAR" })).body.sucesso).toBe(false);
        expect(registrarAuditoria).not.toHaveBeenCalled();
      });
      test("sem o aceite do Estatuto: recusa", async () => {
        preparar();
        expect((await put(local(["consagracoes"]), 105, { acao: "APROVAR" })).body.sucesso).toBe(false);
        expect(escritas()).toHaveLength(0);
      });
    });

    test("REPROVAR de candidato já BATIZADO é recusado (desfaria o registro do batismo)", async () => {
      preparar();
      expect((await put(geral(["consagracoes"]), 103, { acao: "REPROVAR", motivo: "x" })).body.sucesso).toBe(false);
      expect(escritas()).toHaveLength(0);
      expect((await put(local(["consagracoes"]), 101, { acao: "REPROVAR", motivo: "x" })).body.sucesso).toBe(true);
      expect(rodou(/UPDATE CandidatosBatismo SET Status = 'AGUARDANDO_TURMA'/)[0].sql).toMatch(/Status <> 'BATIZADO'/);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("GestaoTurmasBatismo", () => {
  const TURMAS = {
    1: { Status: "ABERTA", AutorizacaoMesa: 0, congregacaoId: 1, congregacaoNome: "A" },
    2: { Status: "ABERTA", AutorizacaoMesa: 0, congregacaoId: 2, congregacaoNome: "B" },
    3: { Status: "REALIZADA", AutorizacaoMesa: 1, congregacaoId: 1, congregacaoNome: "A" },
    4: { Status: "ABERTA", AutorizacaoMesa: 0, congregacaoId: null, congregacaoNome: null },
    5: { Status: "ABERTA", AutorizacaoMesa: 1, congregacaoId: 1, congregacaoNome: "A" }
  };
  const CONGREGACOES = { 1: "A", 2: "B" };
  const preparar = ({ afetadasMudancaTurma = 1 } = {}) => {
    quando(/ORDER BY t.DataBatismo DESC/, Object.entries(TURMAS).map(([id, t]) => ({ turmaId: Number(id), dataBatismo: "2026-05-10", local: "Templo", tipoLocal: "TEMPLO", autorizacaoMesa: t.AutorizacaoMesa, congregacaoId: t.congregacaoId, congregacaoNome: t.congregacaoNome, status: t.Status })));
    quando(/FROM OficiantesBatismo o/, []);
    quando(/SELECT COUNT\(\*\) AS total FROM CandidatosBatismo/, [{ total: 0 }]);
    quando(/WHERE t.TurmaId = @id/, (i) => (TURMAS[i.id] ? [{ ...TURMAS[i.id] }] : []));
    quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, (i) => (CONGREGACOES[i.id] ? [{ Nome: CONGREGACOES[i.id] }] : []));
    quando(/INSERT INTO TurmasBatismo/, [{ TurmaId: 50 }]);
    quando(/UPDATE TurmasBatismo SET Status = /, [], afetadasMudancaTurma);
    quando(/SELECT DataBatismo FROM TurmasBatismo/, [{ DataBatismo: "2026-05-10" }]);
    quando(/FROM CandidatosBatismo WHERE TurmaId = @turmaId AND Status = 'APROVADO'/, [{ CandidatoId: 101, MembroId: 40 }]);
  };
  const NAO_ENCONTRADA = { status: 404, body: { sucesso: false, mensagem: "Turma não encontrada." } };
  const put = (token, id, acao) => chamar(hTurmas, { metodo: "PUT", token, corpo: { acao }, ligado: { id } });
  const criar = (token, corpo) => chamar(hTurmas, { token, corpo: { dataBatismo: "2026-05-10", local: "Templo Central", tipoLocal: "TEMPLO", ...corpo } });

  describe("lista", () => {
    test("liderança local: só as turmas da própria congregação (a de outra congregação e a da igreja toda NÃO aparecem)", async () => {
      preparar();
      const r = await chamar(hTurmas, { metodo: "GET", token: local(["consagracoes"]) });
      expect(r.body.map(t => t.turmaId).sort()).toEqual([1, 3, 5]);
      const sqlTurma = rodou(/ORDER BY t\.DataBatismo DESC/)[0].sql;
      expect(sqlTurma).toMatch(/t\.CongregacaoId AS congregacaoId/);
      expect(sqlTurma).toMatch(/cg\.Nome AS congregacaoNome/);
    });
    test("a consulta de uma turma (PUT) traz a congregação, que é o que o escopo confere", async () => {
      preparar();
      await put(local(["consagracoes"]), 1, "CANCELAR");
      const sqlTurma = rodou(/WHERE t\.TurmaId = @id/)[0].sql;
      expect(sqlTurma).toMatch(/t\.CongregacaoId AS congregacaoId/);
      expect(sqlTurma).toMatch(/cg\.Nome AS congregacaoNome/);
      expect(sqlTurma).toMatch(/LEFT JOIN Congregacoes cg ON cg\.CongregacaoId = t\.CongregacaoId/);
    });
    test("o geral vê todas, inclusive a da igreja toda", async () => {
      preparar();
      const r = await chamar(hTurmas, { metodo: "GET", token: geral(["consagracoes"]) });
      expect(r.body.map(t => t.turmaId).sort()).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe("criar (POST): o destino precisa estar no escopo", () => {
    test("congregação do escopo + oficiantes do escopo: cria e grava os oficiantes sem repetir", async () => {
      preparar();
      const r = await criar(local(["consagracoes"]), { congregacaoId: 1, oficiantesMembroIds: [60, 60] });
      expect(r.status).toBe(201);
      expect(rodou(/INSERT INTO TurmasBatismo/)[0].inputs).toMatchObject({ congregacaoId: 1, criadoPor: 5 });
      expect(rodou(/INSERT INTO OficiantesBatismo/)).toHaveLength(1);
    });
    test("congregação de FORA, inexistente ou sem informar congregação: 403 igual, nada gravado", async () => {
      preparar();
      const fora = await criar(local(["consagracoes"]), { congregacaoId: 2 });
      expect(fora).toMatchObject({ status: 403, body: er.FORA_DO_ESCOPO });
      expect(await criar(local(["consagracoes"]), { congregacaoId: 99 })).toEqual(fora);
      expect(await criar(local(["consagracoes"]), { congregacaoId: "abc" })).toEqual(fora);
      expect(await criar(local(["consagracoes"]), {})).toEqual(fora);
      expect(escritas()).toHaveLength(0);
    });
    test("oficiante de fora do escopo, inexistente ou malformado: a mesma recusa, e NADA é gravado (nem a turma)", async () => {
      preparar();
      const fora = await criar(local(["consagracoes"]), { congregacaoId: 1, oficiantesMembroIds: [60, 41] });
      expect(fora.status).toBe(400);
      expect(await criar(local(["consagracoes"]), { congregacaoId: 1, oficiantesMembroIds: [999] })).toEqual(fora);
      expect(await criar(local(["consagracoes"]), { congregacaoId: 1, oficiantesMembroIds: [null] })).toEqual(fora);
      expect(escritas()).toHaveLength(0);
    });
    test("mais de 30 oficiantes: 400, nada gravado", async () => {
      preparar();
      const muitos = Array.from({ length: 31 }, () => 60);
      expect((await criar(geral(["consagracoes"]), { oficiantesMembroIds: muitos })).status).toBe(400);
      expect(escritas()).toHaveLength(0);
    });
    test("o geral cria turma da igreja toda e turma de qualquer congregação; congregação inexistente é 400", async () => {
      preparar();
      const r1 = await criar(geral(["consagracoes"]), {});
      expect(r1.status).toBe(201);
      expect(rodou(/INSERT INTO TurmasBatismo/)[0].inputs.congregacaoId).toBeNull();
      expect((await criar(geral(["consagracoes"]), { congregacaoId: 2 })).status).toBe(201);
      expect((await criar(geral(["consagracoes"]), { congregacaoId: 99 })).status).toBe(400);
    });
  });

  describe("AUTORIZAR_MESA e REALIZAR são do geral", () => {
    test.each(["AUTORIZAR_MESA", "REALIZAR"])("%s: liderança local (mesmo na turma da própria congregação), papel Global com lista e papel local com 'todas' levam 403 ANTES de tocar no banco", async (acao) => {
      preparar();
      expect(await put(local(["consagracoes"]), 5, acao)).toMatchObject({ status: 403, body: { sucesso: false, mensagem: er.MSG_GERAL } });
      expect((await put(globalComListaDeCongregacoes(["consagracoes"]), 5, acao)).status).toBe(403);
      expect((await put(localComEscopoTodas(["consagracoes"]), 5, acao)).status).toBe(403);
      expect(mockConsultas).toHaveLength(0);
    });
    test("o geral autoriza a Mesa", async () => {
      preparar();
      expect((await put(geral(["consagracoes"]), 1, "AUTORIZAR_MESA")).body.sucesso).toBe(true);
      expect(rodou(/UPDATE TurmasBatismo SET AutorizacaoMesa = 1/)[0].sql).toMatch(/Status = 'ABERTA'/);
      expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    });
    test("o geral realiza o batismo: marca a turma (com o estado no WHERE) e efetiva os aprovados", async () => {
      preparar();
      const r = await put(geral(["consagracoes"]), 5, "REALIZAR");
      expect(r.body).toMatchObject({ sucesso: true, efetivados: 1 });
      expect(rodou(/UPDATE TurmasBatismo SET Status = 'REALIZADA'/)[0].sql).toMatch(/AND Status = 'ABERTA'/);
      expect(rodou(/UPDATE MembroReferencia SET SituacaoMembro = 'EM_COMUNHAO'/)).toHaveLength(1);
    });
    test("realizar sem a autorização da Mesa, ou turma já realizada: recusa, nada gravado", async () => {
      preparar();
      expect((await put(geral(["consagracoes"]), 1, "REALIZAR")).body.sucesso).toBe(false);
      expect((await put(geral(["consagracoes"]), 3, "REALIZAR")).body.sucesso).toBe(false);
      expect(escritas()).toHaveLength(0);
    });
    test("o UPDATE da turma não pegou nenhuma linha (outra pessoa realizou antes): não efetiva ninguém", async () => {
      preparar({ afetadasMudancaTurma: 0 });
      expect((await put(geral(["consagracoes"]), 5, "REALIZAR")).body.sucesso).toBe(false);
      expect(rodou(/UPDATE MembroReferencia/)).toHaveLength(0);
    });
    test("cancelar com o UPDATE sem linha (outra pessoa cancelou/realizou antes): recusa e não mexe nos candidatos", async () => {
      preparar({ afetadasMudancaTurma: 0 });
      expect((await put(geral(["consagracoes"]), 1, "CANCELAR")).body.sucesso).toBe(false);
      expect(rodou(/UPDATE CandidatosBatismo/)).toHaveLength(0);
      expect(registrarAuditoria).not.toHaveBeenCalled();
    });
  });

  describe("CANCELAR vale dentro do escopo da turma", () => {
    test("turma da própria congregação: cancela (com o estado no WHERE) e devolve os aprovados à fila", async () => {
      preparar();
      expect((await put(local(["consagracoes"]), 1, "CANCELAR")).body.sucesso).toBe(true);
      expect(rodou(/UPDATE TurmasBatismo SET Status = 'CANCELADA'/)[0].sql).toMatch(/AND Status = 'ABERTA'/);
      expect(rodou(/UPDATE CandidatosBatismo SET TurmaId = NULL/)).toHaveLength(1);
    });
    test("turma de FORA do escopo, da igreja toda, inexistente ou malformada: 'turma não encontrada', igual, nada gravado", async () => {
      preparar();
      for (const id of [2, 4, 999, "abc"]) expect(await put(local(["consagracoes"]), id, "CANCELAR")).toEqual(NAO_ENCONTRADA);
      expect(escritas()).toHaveLength(0);
    });
    test("id malformado: a mesma resposta, SEM consultar o banco", async () => {
      preparar();
      for (const id of ["abc", "0x1", "01", "1e0"]) expect(await put(local(["consagracoes"]), id, "CANCELAR")).toEqual(NAO_ENCONTRADA);
      expect(mockConsultas).toHaveLength(0);
    });
    test("turma já realizada não é cancelada", async () => {
      preparar();
      expect((await put(geral(["consagracoes"]), 3, "CANCELAR")).body.sucesso).toBe(false);
      expect(escritas()).toHaveLength(0);
    });
    test("o geral cancela turma de qualquer congregação", async () => {
      preparar();
      expect((await put(geral(["consagracoes"]), 2, "CANCELAR")).body.sucesso).toBe(true);
    });
  });
  test("ação desconhecida: 400", async () => {
    preparar();
    expect((await put(local(["consagracoes"]), 1, "OUTRA")).status).toBe(400);
  });
});
