// A gravação da ficha e o desligamento no cadastro de pessoas (GestaoPessoas): a matrícula canônica, a data de saída que fica ao salvar a ficha de quem já
// saiu e a data do dia de Brasília. O banco é simulado por TEXTO da consulta, guardando os parâmetros de cada uma; o comportamento contra o SQL Server está
// em tools/e2e-localdb/e2e-152-acesso.js.
let mockRegras = [];
let mockConsultas = [];
// O cargo de liderança vigente da pessoa (o nível dele decide qual secretaria muda a situação dela no rol); o padrão é um cargo do nível geral.
let mockCargo = { tipo: "GLOBAL", id: null };
jest.mock("../db", () => {
  const executar = async (texto, entradas) => {
    mockConsultas.push({ texto, entradas });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return typeof valor === "function" ? valor(entradas, texto) : valor;
    return { recordset: [], recordsets: [[]], rowsAffected: [0] };
  };
  const novaRequest = () => {
    const entradas = {};
    const r = { input: (nome, ...resto) => { entradas[nome] = resto[resto.length - 1]; return r; }, query: (texto) => executar(texto, entradas), batch: (texto) => executar(texto, entradas) };
    return r;
  };
  class Transaction { async begin() { mockConsultas.push({ texto: "BEGIN" }); } async commit() { mockConsultas.push({ texto: "COMMIT" }); } async rollback() { mockConsultas.push({ texto: "ROLLBACK" }); } request() { return novaRequest(); } }
  class Request { constructor() { return novaRequest(); } }
  const sql = new Proxy({}, { get: (_alvo, nome) => (nome === "Transaction" ? Transaction : nome === "Request" ? Request : () => undefined) });
  return { getPool: async () => ({ request: novaRequest }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async (_t, d) => { mockConsultas.push({ texto: `TRILHA ${d.acao}` }); return true; }), sha256: () => "" }));
jest.mock("../notificacaoEmail", () => ({ enviarEmailNotificacao: jest.fn(async () => true) }));
jest.mock("../vacancia", () => ({ encerrarVinculos: jest.fn(async (_e, _s, id, motivo) => { mockConsultas.push({ texto: `VACANCIA ${id} ${motivo}` }); }) }));
jest.mock("../credencialDb", () => ({ recolherSemFalhar: jest.fn(async () => { mockConsultas.push({ texto: "CREDENCIAL" }); }) }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, urlDocumentoComSas: (u) => u, salvarFoto: jest.fn(), salvarDocumento: jest.fn() }));

const auth = require("../auth");
const hPessoas = require("../../GestaoPessoas/index.js");

const sessao = (membroId, extra = {}) => auth.reassinarSessao({ membroId, via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", permissoes: ["pessoas"],
  escopoCongregacoes: "TODAS", termosPendentes: [], ...extra });
const cab = (token) => ({ "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000", "x-auth-token": token });
async function chamar(metodo, { token, corpo = {}, membroIdRota } = {}) {
  const context = { bindingData: membroIdRota === undefined ? {} : { membroId: membroIdRota }, log: Object.assign(() => {}, { error() {}, info() {}, warn() {}, verbose() {} }) };
  await hPessoas(context, { method: metodo, query: {}, body: corpo, headers: cab(token) });
  return context.res;
}
const gravacoes = () => mockConsultas.filter((c) => /UPDATE MembroReferencia SET Nome|INSERT INTO MembroReferencia|UPDATE MembroReferencia SET Status = 'DESLIGADO'/.test(c.texto));

// A ficha como o banco a devolve na leitura antes de gravar
const fichaNoBanco = (extra = {}) => ({ MembroId: 5, Status: "ATIVO", EmailAnterior: null, MotivoAnterior: null, CargoAnterior: null, DizimistaAnterior: null, SexoAnterior: "F",
  NascimentoAnterior: "1990-01-01", AdmissaoAnterior: "2015-01-01", EstadoCivilAnterior: null, EmProcessoDeCargo: 0, TemExclusao: 0, CongregacaoNome: "Central", ExtensaoNome: null,
  DataSaidaAnterior: null, ...extra });
const membroLido = (extra = {}) => ({ membroId: 5, nome: "Pessoa Cinco", congregacao: "Central", extensao: null, status: "ATIVO", dataNascimento: "1990-01-01", motivoSaida: null, fotoUrl: null, ...extra });
const corpoFicha = (extra = {}) => ({ membroId: 5, nome: "Pessoa Cinco", congregacaoId: 1, status: "ATIVO", dataNascimento: "1990-01-01", dataAdmissao: "2015-01-01", sexo: "F", ...extra });

// O catálogo das situações no rol como as migrações o semeiam (016, 019 e 023), mais uma que a Secretaria desativou. O SQL Server compara sem caixa e sem o
// espaço do fim (a rota usa a sigla que o catálogo devolve). Situação que a Secretaria acrescentou num caso: mockCatalogoExtra.
const CATALOGO_STATUS = [["ATIVO", 1], ["LICENÇA", 1], ["INATIVO", 1], ["DESLIGADO", 1], ["FALECIDO", 1], ["LICENCA_CANDIDATURA", 1], ["TRANSFERIDO", 0]];
let mockCatalogoExtra = [];
const noCatalogo = (sigla) => (typeof sigla !== "string" ? undefined
  : [...CATALOGO_STATUS, ...mockCatalogoExtra].find(([s]) => s.toUpperCase() === sigla.replace(/ +$/, "").toUpperCase()));

function regrasDaFicha(ficha) {
  mockRegras = [
    [/FROM StatusMembro WHERE Sigla = @sigla/, (e) => { const l = noCatalogo(e.sigla); return { recordset: l ? [{ Sigla: l[0], Ativa: l[1] }] : [] }; }],
    [/SELECT TOP 1 Nome FROM Congregacoes/, { recordset: [{ Nome: "Central" }] }],
    [/FROM CargosMinisteriais WHERE Sigla/, { recordset: [{ x: 1 }] }],
    [/sp_getapplock/, { recordset: [{ resultado: 0 }] }],
    [/SELECT l\.EscopoTipo, l\.EscopoId FROM Lideranca l/, () => ({ recordset: [{ EscopoTipo: mockCargo.tipo, EscopoId: mockCargo.id }] })],
    [/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, { recordset: [{ Nome: "Central" }] }],
    [/SELECT Nome FROM Congregacoes WHERE AreaId = @id/, { recordset: [{ Nome: "Central" }, { Nome: "Vila Nova" }] }],
    [/EmProcessoDeCargo/, () => ({ recordset: ficha ? [ficha] : [] })],
    [/UPDATE MembroReferencia SET Nome/, { recordset: [], rowsAffected: [1] }],
    [/INSERT INTO MembroReferencia/, { recordset: [], rowsAffected: [1] }],
    [/COALESCE\(cm\.Nome, m\.Funcao\)/, () => ({ recordset: [membroLido({ status: ficha ? ficha.Status : "ATIVO" })] })]
  ];
}

beforeEach(() => {
  mockConsultas = [];
  mockCargo = { tipo: "GLOBAL", id: null };
  mockCatalogoExtra = [];
  regrasDaFicha(fichaNoBanco());
});

describe("a matrícula do corpo da ficha", () => {
  test.each([[5.9], ["5.9"], ["05"], [-5], [0], ["5 OR 1=1"], [true], [{ a: 1 }], [2147483648]])("matrícula não canônica (%p): 400 e nada é gravado", async (membroId) => {
    const r = await chamar("POST", { token: sessao(5), corpo: corpoFicha({ membroId, cargoMinisterial: "PASTOR", dizimistaFiel: true }) });
    expect(r.status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });

  test("a matrícula em texto com espaço em volta vale como o número", async () => {
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ membroId: " 5 " }) });
    expect(r.status).toBe(200);
    expect(gravacoes()[0].entradas.id).toBe(5);
  });

  test("a própria ficha com o número certo continua barrada no cargo e no dízimo", async () => {
    const r = await chamar("POST", { token: sessao(5), corpo: corpoFicha({ membroId: 5, cargoMinisterial: "PASTOR" }) });
    expect(r.status).toBe(422);
    expect(gravacoes()).toHaveLength(0);
  });

  test("DELETE com matrícula não canônica na rota: 400, sem tocar no banco", async () => {
    const r = await chamar("DELETE", { token: sessao(77), membroIdRota: "5.9" });
    expect(r.status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
});

describe("a data de saída ao salvar a ficha", () => {
  test("quem já saiu: salvar sem o campo da data de saída mantém a data gravada", async () => {
    regrasDaFicha(fichaNoBanco({ Status: "DESLIGADO", MotivoAnterior: "DESLIGAMENTO", DataSaidaAnterior: "2026-11-20" }));
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "DESLIGADO", motivoSaida: "DESLIGAMENTO", telefone: "91900000000" }) });
    expect(r.status).toBe(200);
    expect(gravacoes()[0].entradas.dataSaida).toBe("2026-11-20");
  });

  test("quem já saiu: a data informada no pedido vale", async () => {
    regrasDaFicha(fichaNoBanco({ Status: "FALECIDO", MotivoAnterior: "FALECIMENTO", DataSaidaAnterior: "2026-11-20" }));
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "FALECIDO", motivoSaida: "FALECIMENTO", dataSaida: "2026-11-18" }) });
    expect(r.status).toBe(200);
    expect(gravacoes()[0].entradas.dataSaida).toBe("2026-11-18");
  });

  test("a volta ao rol ativo continua limpando a data de saída", async () => {
    regrasDaFicha(fichaNoBanco({ Status: "DESLIGADO", MotivoAnterior: "DESLIGAMENTO", DataSaidaAnterior: "2026-11-20" }));
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "ATIVO" }) });
    expect(r.status).toBe(200);
    expect(gravacoes()[0].entradas.dataSaida).toBeNull();
  });

  test.each([["2026-02-30"], ["abc"], ["20/11/2026"], [" 2026-11-20 "], [20261120], [{ a: 1 }], ["x".repeat(5000)]])("data de saída que não é um dia (%p): recusada e nada é gravado", async (dataSaida) => {
    regrasDaFicha(fichaNoBanco({ Status: "DESLIGADO", MotivoAnterior: "DESLIGAMENTO", DataSaidaAnterior: "2026-11-20" }));
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "DESLIGADO", motivoSaida: "DESLIGAMENTO", dataSaida }) });
    expect(r.status).toBe(400);
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/data de saída/);
    expect(gravacoes()).toHaveLength(0);
  });

  // Regra do responsável (25/11/2026): a data de saída vai de 2006 (a fundação da igreja) até hoje, pelo dia de Brasília.
  describe("de 2006 até hoje", () => {
    const comRelogio = async (agora, fazer) => {
      jest.useFakeTimers({ now: new Date(agora), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
      try { return await fazer(); } finally { jest.useRealTimers(); }
    };
    const salvarComData = (dataSaida) => {
      regrasDaFicha(fichaNoBanco({ Status: "DESLIGADO", MotivoAnterior: "DESLIGAMENTO", DataSaidaAnterior: "2026-11-20" }));
      return chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "DESLIGADO", motivoSaida: "DESLIGAMENTO", dataSaida }) });
    };

    test.each([["2005-12-31"], ["0001-01-01"], ["2026-11-26"], ["9999-12-31"]])("fora da faixa (%p): 400, com a faixa na mensagem, e nada é gravado", async (dataSaida) => {
      const r = await comRelogio("2026-11-26T01:30:00Z", () => salvarComData(dataSaida));   // 25/11, 22h30 em Brasília: o dia 26 ainda é amanhã
      expect(r.status).toBe(400);
      expect(r.body.mensagem).toMatch(/2006/);
      expect(gravacoes()).toHaveLength(0);
    });

    test.each([["2006-01-01"], ["2026-11-25"]])("dentro da faixa (%p): grava a data informada", async (dataSaida) => {
      const r = await comRelogio("2026-11-26T01:30:00Z", () => salvarComData(dataSaida));
      expect(r.status).toBe(200);
      expect(gravacoes()[0].entradas.dataSaida).toBe(dataSaida);
    });

    test.each([[null], [""]])("o vazio (%p) pela API não apaga a data de quem já saiu", async (dataSaida) => {
      const r = await salvarComData(dataSaida);
      expect(r.status).toBe(200);
      expect(gravacoes()[0].entradas.dataSaida).toBe("2026-11-20");
    });
  });

  test("a saída registrada à noite fica com o dia de Brasília, não o de Greenwich", async () => {
    jest.useFakeTimers({ now: new Date("2026-11-26T01:30:00Z"), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });   // 25/11, 22h30 em Brasília
    try {
      const r = await chamar("POST", { token: sessao(77, { fator: { via: "CHAVE", em: Date.now() } }), corpo: corpoFicha({ status: "FALECIDO", motivoSaida: "FALECIMENTO" }) });
      expect(r.status).toBe(200);
      expect(gravacoes()[0].entradas.dataSaida).toBe("2026-11-25");
    } finally { jest.useRealTimers(); }
  });
});

describe("salvar a ficha numa transação só", () => {
  const passos = () => mockConsultas.map((c) => c.texto).filter((t) => /^(BEGIN|COMMIT|ROLLBACK|VACANCIA|TRILHA|CREDENCIAL)|sp_getapplock|UPDATE MembroReferencia SET Nome|UPDATE SessoesAtivas|INSERT INTO CargosMinisteriaisHistorico/.test(t))
    .map((t) => (/sp_getapplock/.test(t) ? "TRAVA" : /UPDATE MembroReferencia SET Nome/.test(t) ? "FICHA" : /UPDATE SessoesAtivas/.test(t) ? "SESSOES" : /CargosMinisteriaisHistorico/.test(t) ? "HISTORICO" : t));
  const vacancia = require("../vacancia");
  const semCargo = [/AlvoAdministra/, { recordset: [{ TemCargoVigente: 0, AlvoAdministra: 0, Outros: 0 }] }];
  beforeEach(() => { mockRegras.unshift(semCargo, [/sp_getapplock/, { recordset: [{ resultado: 0 }] }]); });

  test("a saída do rol (DESLIGADO): a ficha, a vacância e a trilha juntas; a credencial depois do commit", async () => {
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "DESLIGADO", motivoSaida: "DESLIGAMENTO" }) });
    expect(r.body.sucesso).toBe(true);
    expect(passos()).toEqual(["BEGIN", "TRAVA", "FICHA", "VACANCIA 5 DESLIGAMENTO", "TRILHA Atualizou pessoa", "COMMIT", "CREDENCIAL"]);
  });

  test("a vacância falha no meio: a ficha não fica gravada e o pedido pode ser repetido", async () => {
    vacancia.encerrarVinculos.mockImplementationOnce(async () => { throw new Error("falha passageira"); });
    await expect(chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "DESLIGADO", motivoSaida: "DESLIGAMENTO" }) })).rejects.toThrow("falha passageira");
    expect(passos()).toEqual(["BEGIN", "TRAVA", "FICHA", "ROLLBACK"]);
  });

  test("o falecido sem a causa da saída: a vacância registra FALECIMENTO", async () => {
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "FALECIDO" }) });
    expect(r.body.sucesso).toBe(true);
    expect(passos()).toContain("VACANCIA 5 FALECIMENTO");
  });

  test("a saída para INATIVO: as sessões caem dentro da mesma transação, sem a trava da escada", async () => {
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "INATIVO" }) });
    expect(r.body.sucesso).toBe(true);
    expect(passos()).toEqual(["BEGIN", "FICHA", "SESSOES", "TRILHA Atualizou pessoa", "COMMIT"]);
    expect(mockConsultas.find((c) => /UPDATE SessoesAtivas/.test(c.texto)).texto).toMatch(/^SET XACT_ABORT ON;/);
  });

  test("a troca de cargo: o histórico entra na mesma transação, depois da trava da escada", async () => {
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ cargoMinisterial: "DIACONO" }) });
    expect(r.body.sucesso).toBe(true);
    expect(passos()).toEqual(["BEGIN", "TRAVA", "FICHA", "HISTORICO", "TRILHA Atualizou pessoa", "COMMIT"]);
  });

  test("outra alteração da mesma pessoa em andamento: nada é gravado", async () => {
    mockRegras.unshift([/sp_getapplock/, { recordset: [{ resultado: -1 }] }]);
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ cargoMinisterial: "DIACONO" }) });
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/Tente de novo/);
    expect(passos()).toEqual(["BEGIN", "TRAVA", "ROLLBACK"]);
  });

  test("a ficha sem mudança de cargo nem de situação: só a ficha e a trilha, sem a trava", async () => {
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ telefone: "91900000002" }) });
    expect(r.body.sucesso).toBe(true);
    expect(passos()).toEqual(["BEGIN", "FICHA", "TRILHA Atualizou pessoa", "COMMIT"]);
  });
});

describe("tirar do rol ativo quem tem cargo de liderança", () => {
  const local = () => sessao(77, { nivel: "CONGREGACAO", escopoCongregacoes: ["Central"] });
  const geralSemFator = () => sessao(77, { fator: { via: "NENHUM", em: Date.now() } });
  const situacao = (cargo, alvoAdministra = 0, outros = 1) => [/AlvoAdministra/, { recordset: [{ TemCargoVigente: cargo, AlvoAdministra: alvoAdministra, Outros: outros }] }];
  function regrasDoDesligar(sit, existe = true) {
    mockRegras = [
      sit,
      [/AS CongregacaoNome, e\.Nome AS ExtensaoNome FROM MembroReferencia m/, { recordset: existe ? [{ CongregacaoNome: "Central", ExtensaoNome: null }] : [] }],
      [/UPDATE MembroReferencia SET Status = 'DESLIGADO'/, { recordset: [{ MembroId: 5 }], rowsAffected: [1] }],
      [/sp_getapplock/, { recordset: [{ resultado: 0 }] }],
      [/SELECT l\.EscopoTipo, l\.EscopoId FROM Lideranca l/, () => ({ recordset: [{ EscopoTipo: mockCargo.tipo, EscopoId: mockCargo.id }] })],
      [/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, { recordset: [{ Nome: "Central" }] }],
      [/SELECT Nome FROM Congregacoes WHERE AreaId = @id/, { recordset: [{ Nome: "Central" }, { Nome: "Vila Nova" }] }]
    ];
  }
  const consultouSituacao = () => mockConsultas.some((c) => /AlvoAdministra/.test(c.texto));

  // Regra do responsável (25/11/2026): a secretaria do nível do cargo, ou de cima, muda a situação no rol (cargo local: local, área e Geral; de área: área e
  // Geral; geral: só a Geral), sempre com a confirmação reforçada.
  describe("o nível do cargo decide qual secretaria muda a situação no rol", () => {
    const area = (extra = {}) => sessao(78, { nivel: "AREA", escopoCongregacoes: ["Central", "Vila Nova"], ...extra });
    const localSemFator = () => sessao(77, { nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], fator: { via: "NENHUM", em: Date.now() } });

    test("cargo local: a secretaria local desliga, com a confirmação recente", async () => {
      mockCargo = { tipo: "CONGREGACAO", id: 1 };
      regrasDoDesligar(situacao(1));
      const r = await chamar("DELETE", { token: local(), membroIdRota: "5" });
      expect(r.body.sucesso).toBe(true);
      expect(gravacoes()).toHaveLength(1);
    });

    test("cargo local: a secretaria local sem a confirmação recente recebe 428", async () => {
      mockCargo = { tipo: "CONGREGACAO", id: 1 };
      regrasDoDesligar(situacao(1));
      const r = await chamar("DELETE", { token: localSemFator(), membroIdRota: "5" });
      expect(r.status).toBe(428);
      expect(gravacoes()).toHaveLength(0);
    });

    test("cargo local: a ficha com INATIVO pela secretaria local", async () => {
      mockCargo = { tipo: "CONGREGACAO", id: 1 };
      mockRegras.unshift(situacao(1));
      const r = await chamar("POST", { token: local(), corpo: corpoFicha({ status: "INATIVO" }) });
      expect(r.body.sucesso).toBe(true);
      expect(gravacoes()).toHaveLength(1);
    });

    test("cargo de área: a secretaria local é barrada (403); a da área desliga", async () => {
      mockCargo = { tipo: "AREA", id: 3 };
      regrasDoDesligar(situacao(1));
      const barrada = await chamar("DELETE", { token: local(), membroIdRota: "5" });
      expect(barrada.status).toBe(403);
      expect(gravacoes()).toHaveLength(0);
      const daArea = await chamar("DELETE", { token: area(), membroIdRota: "5" });
      expect(daArea.body.sucesso).toBe(true);
      expect(gravacoes()).toHaveLength(1);
    });

    test("cargo de área: a secretaria local com papel de nível acima, mas só com a própria congregação, também é barrada", async () => {
      mockCargo = { tipo: "AREA", id: 3 };
      regrasDoDesligar(situacao(1));
      const r = await chamar("DELETE", { token: sessao(77, { nivel: "GLOBAL", escopoCongregacoes: ["Central"] }), membroIdRota: "5" });
      expect(r.status).toBe(403);
      expect(gravacoes()).toHaveLength(0);
    });

    test("cargo geral: a secretaria da área é barrada; só a Geral", async () => {
      mockCargo = { tipo: "GLOBAL", id: null };
      regrasDoDesligar(situacao(1, 0, 1));
      const r = await chamar("DELETE", { token: area(), membroIdRota: "5" });
      expect(r.status).toBe(403);
      expect(gravacoes()).toHaveLength(0);
      const geral = await chamar("DELETE", { token: sessao(77), membroIdRota: "5" });
      expect(geral.body.sucesso).toBe(true);
    });

    test("a secretaria de uma Extensão não muda a situação de quem tem cargo da congregação", async () => {
      mockCargo = { tipo: "CONGREGACAO", id: 1 };
      regrasDoDesligar(situacao(1));
      const r = await chamar("DELETE", { token: sessao(79, { nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], escopoExtensaoNome: "Extensão Norte" }), membroIdRota: "5" });
      expect([403]).toContain(r.status);
      expect(gravacoes()).toHaveLength(0);
    });
  });

  test("desligar: fora do nível geral, 403 e nada muda", async () => {
    regrasDoDesligar(situacao(1));
    const r = await chamar("DELETE", { token: local(), membroIdRota: "5" });
    expect(r.status).toBe(403);
    expect(r.body.mensagem).toMatch(/nível do cargo/);
    expect(gravacoes()).toHaveLength(0);
  });

  test("desligar: o nível geral sem a confirmação recente recebe 428 e nada muda", async () => {
    regrasDoDesligar(situacao(1));
    const r = await chamar("DELETE", { token: geralSemFator(), membroIdRota: "5" });
    expect(r.status).toBe(428);
    expect(r.body.precisaFator).toBe(true);
    expect(gravacoes()).toHaveLength(0);
  });

  test("desligar: nunca a última pessoa que administra os acessos", async () => {
    regrasDoDesligar(situacao(1, 1, 0));
    const r = await chamar("DELETE", { token: sessao(77), membroIdRota: "5" });
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/permissoes/);
    expect(gravacoes()).toHaveLength(0);
  });

  test("desligar: o nível geral com a confirmação recente desliga", async () => {
    regrasDoDesligar(situacao(1, 1, 2));
    const r = await chamar("DELETE", { token: sessao(77), membroIdRota: "5" });
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(true);
    expect(gravacoes()).toHaveLength(1);
  });

  test("desligar quem não tem cargo de liderança: a congregação continua desligando", async () => {
    regrasDoDesligar(situacao(0, 0, 0));
    const r = await chamar("DELETE", { token: local(), membroIdRota: "5" });
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(true);
  });

  test("matrícula que não existe e de fora do escopo: a mesma recusa, sem olhar o cargo", async () => {
    regrasDoDesligar(situacao(1), false);
    const inexistente = await chamar("DELETE", { token: local(), membroIdRota: "5" });
    regrasDoDesligar(situacao(1));
    const fora = await chamar("DELETE", { token: sessao(77, { nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"] }), membroIdRota: "5" });
    expect(inexistente.status).toBe(403);
    expect(fora.status).toBe(403);
    expect(JSON.stringify(inexistente.body)).toBe(JSON.stringify(fora.body));
    expect(consultouSituacao()).toBe(false);
  });

  describe("o desligamento numa transação só", () => {
    const passos = () => mockConsultas.map((c) => c.texto).filter((t) => /^(BEGIN|COMMIT|ROLLBACK|VACANCIA|TRILHA|CREDENCIAL)|sp_getapplock|UPDATE MembroReferencia SET Status = 'DESLIGADO'/.test(t))
      .map((t) => (/sp_getapplock/.test(t) ? "TRAVA" : /UPDATE MembroReferencia/.test(t) ? "STATUS" : t));
    const vacancia = require("../vacancia");

    test("status, vacância e trilha dentro da transação; a credencial depois do commit", async () => {
      regrasDoDesligar(situacao(0, 0, 0));
      const r = await chamar("DELETE", { token: sessao(77), membroIdRota: "5" });
      expect(r.body.sucesso).toBe(true);
      expect(passos()).toEqual(["BEGIN", "TRAVA", "STATUS", "VACANCIA 5 DESLIGAMENTO", "TRILHA Desligou pessoa", "COMMIT", "CREDENCIAL"]);
      expect(mockConsultas.find((c) => /UPDATE MembroReferencia SET Status = 'DESLIGADO'/.test(c.texto)).texto).toMatch(/^SET XACT_ABORT ON;/);
    });

    test("a vacância falha no meio: nada fica gravado e o pedido pode ser repetido", async () => {
      regrasDoDesligar(situacao(0, 0, 0));
      vacancia.encerrarVinculos.mockImplementationOnce(async () => { throw new Error("falha passageira"); });
      await expect(chamar("DELETE", { token: sessao(77), membroIdRota: "5" })).rejects.toThrow("falha passageira");
      expect(passos()).toEqual(["BEGIN", "TRAVA", "STATUS", "ROLLBACK"]);
      mockConsultas = [];
      const deNovo = await chamar("DELETE", { token: sessao(77), membroIdRota: "5" });
      expect(deNovo.body.sucesso).toBe(true);
    });

    test("outra alteração da mesma pessoa em andamento: nada muda e pede para tentar de novo", async () => {
      regrasDoDesligar(situacao(0, 0, 0));
      mockRegras.unshift([/sp_getapplock/, { recordset: [{ resultado: -1 }] }]);
      const r = await chamar("DELETE", { token: sessao(77), membroIdRota: "5" });
      expect(r.body.sucesso).toBe(false);
      expect(r.body.mensagem).toMatch(/Tente de novo/);
      expect(passos()).toEqual(["BEGIN", "TRAVA", "ROLLBACK"]);
    });

    test("quem já saiu do rol (desligado ou falecido): nada muda", async () => {
      regrasDoDesligar(situacao(0, 0, 0));
      mockRegras.unshift([/UPDATE MembroReferencia SET Status = 'DESLIGADO'/, { recordset: [], rowsAffected: [0] }]);
      const r = await chamar("DELETE", { token: sessao(77), membroIdRota: "5" });
      expect(r.body.sucesso).toBe(false);
      expect(passos()).toEqual(["BEGIN", "TRAVA", "STATUS", "ROLLBACK"]);
      expect(mockConsultas.find((c) => /UPDATE MembroReferencia SET Status = 'DESLIGADO'/.test(c.texto)).texto).toMatch(/Status NOT IN \('DESLIGADO', 'FALECIDO'\)/);
    });
  });

  test.each([["INATIVO"], ["AFASTADO"], ["DESLIGADO"], ["FALECIDO"]])("a ficha com a situação %s: fora do nível geral, 403 e nada muda", async (status) => {
    mockCatalogoExtra = [["AFASTADO", 1]];   // AFASTADO não vem semeado: aqui a Secretaria o pôs no catálogo
    mockRegras.unshift(situacao(1));
    const r = await chamar("POST", { token: local(), corpo: corpoFicha({ status }) });
    expect(r.status).toBe(403);
    expect(gravacoes()).toHaveLength(0);
  });

  test("a ficha com a situação DESLIGADO: o nível geral sem a confirmação recente recebe 428", async () => {
    mockRegras.unshift(situacao(1));
    const r = await chamar("POST", { token: geralSemFator(), corpo: corpoFicha({ status: "DESLIGADO" }) });
    expect(r.status).toBe(428);
    expect(gravacoes()).toHaveLength(0);
  });

  test("a ficha com a situação INATIVO: nunca a última pessoa que administra os acessos", async () => {
    mockRegras.unshift(situacao(1, 1, 0));
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "INATIVO" }) });
    expect(r.body.sucesso).toBe(false);
    expect(gravacoes()).toHaveLength(0);
  });

  test("quem tem cargo e continua ATIVO: a congregação salva a ficha sem a conferência", async () => {
    mockRegras.unshift(situacao(1));
    const r = await chamar("POST", { token: local(), corpo: corpoFicha({ telefone: "91900000001" }) });
    expect(r.status).toBe(200);
    expect(consultouSituacao()).toBe(false);
  });

  test("quem não tem cargo: a congregação muda a situação para INATIVO", async () => {
    mockRegras.unshift(situacao(0, 0, 0));
    const r = await chamar("POST", { token: local(), corpo: corpoFicha({ status: "INATIVO" }) });
    expect(r.status).toBe(200);
    expect(gravacoes()).toHaveLength(1);
  });
});

describe("a situação no rol pelo catálogo", () => {
  test.each([["XPTO"], ["AFASTADO"], ["ATIVO' OR '1'='1"], [123], [{ a: 1 }], [["ATIVO"]], [true], ["X".repeat(31)]])("situação fora do catálogo (%p): 400 e nada é gravado", async (status) => {
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status }) });
    expect(r.status).toBe(400);
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/situação/i);
    expect(gravacoes()).toHaveLength(0);
  });

  test("a situação que a Secretaria desativou no catálogo não entra de novo", async () => {
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "TRANSFERIDO" }) });
    expect(r.status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });

  test("quem já está numa situação desativada continua nela ao salvar a ficha", async () => {
    regrasDaFicha(fichaNoBanco({ Status: "TRANSFERIDO" }));
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "TRANSFERIDO", telefone: "91900000002" }) });
    expect(r.status).toBe(200);
    expect(gravacoes()[0].entradas.status).toBe("TRANSFERIDO");
  });

  test.each([["desligado"], ["DESLIGADO "], ["Desligado"]])("a situação escrita de outro jeito (%p) grava a sigla do catálogo e roda a saída do rol", async (status) => {
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status, motivoSaida: "DESLIGAMENTO" }) });
    expect(r.status).toBe(200);
    expect(gravacoes()[0].entradas.status).toBe("DESLIGADO");
    expect(mockConsultas.some((c) => c.texto === "VACANCIA 5 DESLIGAMENTO")).toBe(true);
  });

  test("sigla do catálogo maior que a coluna da ficha: 400, sem cortar", async () => {
    mockCatalogoExtra = [["SITUACAO_DE_NOME_LONGO", 1]];
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "SITUACAO_DE_NOME_LONGO" }) });
    expect(r.status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });

  test("a gravação só vale se a situação ainda é a que foi lida (outra mudança no meio: 409)", async () => {
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ telefone: "91900000003" }) });
    expect(r.status).toBe(200);
    expect(gravacoes()[0].texto).toMatch(/AND Status = @statusLido/);
    expect(gravacoes()[0].entradas.statusLido).toBe("ATIVO");
    mockConsultas = [];
    mockRegras.unshift([/UPDATE MembroReferencia SET Nome/, { recordset: [], rowsAffected: [0] }]);
    const r2 = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ telefone: "91900000003" }) });
    expect(r2.status).toBe(409);
    expect(mockConsultas.map((c) => c.texto)).toContain("ROLLBACK");
  });
});

// A licença por candidatura só pela aba "Licença Candidatura" (GestaoLicencasCandidatura): ela grava a licença, o afastamento dos cargos e a volta.
describe("a licença por candidatura não passa pela ficha", () => {
  const semFator = () => sessao(77, { fator: { via: "NENHUM", em: Date.now() } });

  test.each([["LICENCA_CANDIDATURA"], ["licenca_candidatura"]])("pôr em licença pela ficha (%p): 400 com o caminho certo, nada é gravado", async (status) => {
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status }) });
    expect(r.status).toBe(400);
    expect(r.body.mensagem).toMatch(/Licença Candidatura/);
    expect(gravacoes()).toHaveLength(0);
    expect(mockConsultas.some((c) => /^VACANCIA/.test(c.texto))).toBe(false);
  });

  test("pessoa nova já em licença pela ficha: 400", async () => {
    regrasDaFicha(null);
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "LICENCA_CANDIDATURA" }) });
    expect(r.status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });

  test.each([["ATIVO"], ["DESLIGADO"], ["INATIVO"], [undefined]])("tirar da licença pela ficha (%p): 409 com o caminho certo, nada é gravado", async (status) => {
    regrasDaFicha(fichaNoBanco({ Status: "LICENCA_CANDIDATURA" }));
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status }) });
    expect(r.status).toBe(409);
    expect(r.body.mensagem).toMatch(/Licença Candidatura/);
    expect(gravacoes()).toHaveLength(0);
  });

  test("tirar da licença pela ficha sem a confirmação recente: a recusa é a da licença, sem pedir o 428 antes", async () => {
    regrasDaFicha(fichaNoBanco({ Status: "LICENCA_CANDIDATURA" }));
    const r = await chamar("POST", { token: semFator(), corpo: corpoFicha({ status: "INATIVO" }) });
    expect(r.status).toBe(409);
  });

  test("quem está em licença: salvar o telefone com a mesma situação continua valendo", async () => {
    regrasDaFicha(fichaNoBanco({ Status: "LICENCA_CANDIDATURA" }));
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ status: "LICENCA_CANDIDATURA", telefone: "91900000004" }) });
    expect(r.status).toBe(200);
    expect(gravacoes()[0].entradas.status).toBe("LICENCA_CANDIDATURA");
  });
});

describe("as outras datas da ficha", () => {
  const CAMPOS = [["dataNascimento", /nascimento/], ["dataAdmissao", /admissão/], ["dataBatismo", /batismo/], ["dataRitoRecebimento", /rito/], ["dataAfastamento", /afastamento/]];
  const LIXO = [["2026-02-30"], ["abc"], ["20/11/2026"], [" 1990-01-01 "], [19900101], [{ a: 1 }], ["0000-01-01"], ["x".repeat(5000)]];
  const amanha = () => { const d = new Date(`${require("../dataBrasilia").hojeBrasilia()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

  describe.each(CAMPOS)("%s", (campo, nomeNaMensagem) => {
    test.each(LIXO)("formato que não é um dia (%p): 400 com o nome do campo, nada é gravado", async (valor) => {
      const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ [campo]: valor }) });
      expect(r.status).toBe(400);
      expect(r.body.sucesso).toBe(false);
      expect(r.body.mensagem).toMatch(nomeNaMensagem);
      expect(gravacoes()).toHaveLength(0);
    });

    test.each([[null], [""]])("o vazio (%p) continua valendo (sem a data)", async (valor) => {
      const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ [campo]: valor }) });
      expect(r.status).toBe(200);
      expect(gravacoes()[0].entradas[campo]).toBeNull();
    });
  });

  test.each([["dataNascimento", /nascimento/], ["dataAdmissao", /admissão/], ["dataBatismo", /batismo/]])("%s no futuro (amanhã em Brasília): 400", async (campo, nomeNaMensagem) => {
    const r = await chamar("POST", { token: sessao(77), corpo: corpoFicha({ [campo]: amanha() }) });
    expect(r.status).toBe(400);
    expect(r.body.mensagem).toMatch(nomeNaMensagem);
    expect(r.body.mensagem).toMatch(/futuro/);
    expect(gravacoes()).toHaveLength(0);
  });

  test("as datas certas são gravadas como vieram", async () => {
    const corpo = corpoFicha({ dataBatismo: "2001-06-10", dataRitoRecebimento: "2016-03-20", dataAfastamento: "2020-02-01" });
    const r = await chamar("POST", { token: sessao(77), corpo });
    expect(r.status).toBe(200);
    expect(gravacoes()[0].entradas).toMatchObject({ dataNascimento: "1990-01-01", dataAdmissao: "2015-01-01", dataBatismo: "2001-06-10", dataRitoRecebimento: "2016-03-20", dataAfastamento: "2020-02-01" });
  });
});
