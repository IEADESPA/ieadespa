// A gravação da ficha e o desligamento no cadastro de pessoas (GestaoPessoas): a matrícula canônica, a data de saída que fica ao salvar a ficha de quem já
// saiu e a data do dia de Brasília. O banco é simulado por TEXTO da consulta, guardando os parâmetros de cada uma; o comportamento contra o SQL Server está
// em tools/e2e-localdb/e2e-152-acesso.js.
let mockRegras = [];
let mockConsultas = [];
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

function regrasDaFicha(ficha) {
  mockRegras = [
    [/SELECT TOP 1 Nome FROM Congregacoes/, { recordset: [{ Nome: "Central" }] }],
    [/FROM CargosMinisteriais WHERE Sigla/, { recordset: [{ x: 1 }] }],
    [/sp_getapplock/, { recordset: [{ resultado: 0 }] }],
    [/EmProcessoDeCargo/, () => ({ recordset: ficha ? [ficha] : [] })],
    [/UPDATE MembroReferencia SET Nome/, { recordset: [], rowsAffected: [1] }],
    [/INSERT INTO MembroReferencia/, { recordset: [], rowsAffected: [1] }],
    [/COALESCE\(cm\.Nome, m\.Funcao\)/, () => ({ recordset: [membroLido({ status: ficha ? ficha.Status : "ATIVO" })] })]
  ];
}

beforeEach(() => {
  mockConsultas = [];
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
      [/sp_getapplock/, { recordset: [{ resultado: 0 }] }]
    ];
  }
  const consultouSituacao = () => mockConsultas.some((c) => /AlvoAdministra/.test(c.texto));

  test("desligar: fora do nível geral, 403 e nada muda", async () => {
    regrasDoDesligar(situacao(1));
    const r = await chamar("DELETE", { token: local(), membroIdRota: "5" });
    expect(r.status).toBe(403);
    expect(r.body.mensagem).toMatch(/Secretaria \(nível geral\)/);
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
