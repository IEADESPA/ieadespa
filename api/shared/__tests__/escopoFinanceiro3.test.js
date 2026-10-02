// Escopo e dinheiro do grupo "finanças e patrimônio, parte 3" (auditoria de 02/10/2026):
// Prebendados, Prebendas, PrestacoesContas, RateioGeral, RemanejamentoPdq, RemessasBancarias, RepassesInstitucionais, RetiradasChave, Seguros,
// Sorteios, TermosConducao, ProcessarRetornoRemessa, RegistrarRepasseTesouraria + shared/tesouraria.js (podeOperarCentroCusto), shared/cnab240.js
// e shared/financeiroSeguro.js.
//  - INSTITUCIONAL (tudo, menos termos/retiradas e o GET de sorteios): só o GERAL (papel Global + escopo TODAS) — papel local com `financeiro`, papel Global
//    com escopo de lista e papel local com escopo TODAS levam 403 ANTES de tocar no banco;
//  - termos de condução e retiradas de chave: escopo pela congregação do VEÍCULO; veículo da Sede só para o escopo TODAS; fora do escopo = a MESMA resposta de "não encontrado";
//  - dinheiro: geração da folha de prebenda e da remessa bancária em UMA transação com trava; retorno do banco só confirma com ocorrência "00";
//    UPDATEs condicionais (não repassa duas vezes, não homologa duas vezes, não devolve duas vezes).
// O banco é simulado por TEXTO da consulta (como em revisaoV75.test.js); a transação simulada registra BEGIN/COMMIT/ROLLBACK na mesma linha do tempo das consultas.
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

const auth = require("../auth");
const { registrarAuditoria } = require("../auditoria");
const storage = require("../storage");
const cnab240 = require("../cnab240");
const tesouraria = require("../tesouraria");
const seguro = require("../financeiroSeguro");
const hPrebendados = require("../../GestaoPrebendados/index.js");
const hPrebendas = require("../../GestaoPrebendas/index.js");
const hPrestacoes = require("../../GestaoPrestacoesContas/index.js");
const hRateio = require("../../GestaoRateioGeral/index.js");
const hPdq = require("../../GestaoRemanejamentoPdq/index.js");
const hRemessas = require("../../GestaoRemessasBancarias/index.js");
const hRepasses = require("../../GestaoRepassesInstitucionais/index.js");
const hRetiradas = require("../../GestaoRetiradasChave/index.js");
const hSeguros = require("../../GestaoSeguros/index.js");
const hSorteios = require("../../GestaoSorteios/index.js");
const hTermos = require("../../GestaoTermosConducao/index.js");
const hRetorno = require("../../ProcessarRetornoRemessa/index.js");
const hRepasseTes = require("../../RegistrarRepasseTesouraria/index.js");

async function chamar(handler, { metodo = "GET", corpo = {}, token, ligado = {}, query = {} } = {}) {
  const context = { bindingData: ligado, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const rodou = (padrao) => mockConsultas.filter(c => padrao.test(c.sql));
const ESCRITA = /\b(INSERT INTO|UPDATE|DELETE FROM)\b/i;
const escritas = () => mockConsultas.filter(c => ESCRITA.test(c.sql));
const posicao = (padrao) => mockConsultas.findIndex(c => padrao.test(c.sql));
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], via: "SENHA", ...extra });
const geral = (permissoes = ["financeiro"]) => tokenDe(5, { nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes });
const local = (nomes, permissoes = ["financeiro"], nivel = "CONGREGACAO") => tokenDe(6, { nivel, escopoCongregacoes: nomes, permissoes });
const tokenPin = () => tokenDe(7, { via: "PIN", nivel: null, escopoCongregacoes: [], permissoes: [] });
const dia = (deslocamentoDias) => new Date(Date.now() + deslocamentoDias * 86400000).toISOString().slice(0, 10);

beforeEach(() => {
  mockRegras = [];
  mockConsultas = [];
  registrarAuditoria.mockClear();
  storage.salvarDocumento.mockClear();
});

// =============================================================================================================================================================
// 1. Rotas INSTITUCIONAIS: só o geral
// =============================================================================================================================================================
const INSTITUCIONAIS = [
  ["Prebendados GET lista", hPrebendados, { metodo: "GET" }, "financeiro"],
  ["Prebendados GET detalhe", hPrebendados, { metodo: "GET", ligado: { id: "11" } }, "financeiro"],
  ["Prebendados POST", hPrebendados, { metodo: "POST", corpo: { membroId: 40, fornecedorId: 3, cpf: "12345678909", valorMensalReferencia: 100, dataInicio: "2026-01-01" } }, "financeiro"],
  ["Prebendados PUT", hPrebendados, { metodo: "PUT", ligado: { id: "11" }, corpo: { acao: "SUSPENDER" } }, "financeiro"],
  ["Prebendas GET folha", hPrebendas, { metodo: "GET" }, "financeiro"],
  ["Prebendas GET alertas", hPrebendas, { metodo: "GET", ligado: { id: "alertas-risco" } }, "financeiro"],
  ["Prebendas GET detalhe", hPrebendas, { metodo: "GET", ligado: { id: "3" } }, "financeiro"],
  ["Prebendas POST gerar folha", hPrebendas, { metodo: "POST" }, "financeiro"],
  ["Prebendas POST risco", hPrebendas, { metodo: "POST", ligado: { id: "riscos" }, corpo: { prebendadoId: 1, tipoRisco: "JORNADA", descricao: "x" } }, "financeiro"],
  ["Prebendas PUT risco", hPrebendas, { metodo: "PUT", ligado: { id: "riscos" }, corpo: { riscoId: 1, acao: "RESOLVER" } }, "financeiro"],
  ["PrestacoesContas GET", hPrestacoes, { metodo: "GET" }, "financeiro"],
  ["PrestacoesContas POST", hPrestacoes, { metodo: "POST", corpo: { congregacaoId: 3, mesReferencia: "2026-01" } }, "financeiro"],
  ["PrestacoesContas PUT", hPrestacoes, { metodo: "PUT", ligado: { id: "4" }, corpo: { acao: "LIBERAR" } }, "financeiro"],
  ["RateioGeral GET lista", hRateio, { metodo: "GET" }, "financeiro"],
  ["RateioGeral GET pendentes", hRateio, { metodo: "GET", ligado: { id: "pendentes" } }, "financeiro"],
  ["RateioGeral GET detalhe", hRateio, { metodo: "GET", ligado: { id: "2" } }, "financeiro"],
  ["RateioGeral POST", hRateio, { metodo: "POST", corpo: {} }, "financeiro"],
  ["RemanejamentoPdq POST", hPdq, { metodo: "POST", corpo: { projetoOrigemId: 1, projetoDestinoId: 2, valor: 10 } }, "cli"],
  ["RemanejamentoPdq PUT", hPdq, { metodo: "PUT", ligado: { id: "5" }, corpo: { acao: "HOMOLOGAR" } }, "cli"],
  ["RemessasBancarias GET lista", hRemessas, { metodo: "GET" }, "financeiro"],
  ["RemessasBancarias GET detalhe", hRemessas, { metodo: "GET", ligado: { id: "7" } }, "financeiro"],
  ["RemessasBancarias POST", hRemessas, { metodo: "POST", corpo: {} }, "financeiro"],
  ["RepassesInstitucionais GET", hRepasses, { metodo: "GET" }, "financeiro"],
  ["RepassesInstitucionais GET alertas", hRepasses, { metodo: "GET", ligado: { recurso: "alertas" } }, "financeiro"],
  ["RepassesInstitucionais GET parametros", hRepasses, { metodo: "GET", ligado: { recurso: "parametros" } }, "financeiro"],
  ["RepassesInstitucionais PUT parametros", hRepasses, { metodo: "PUT", ligado: { recurso: "parametros" }, corpo: { diasTolerancia: 3 } }, "financeiro"],
  ["RepassesInstitucionais POST", hRepasses, { metodo: "POST", corpo: { origemTipo: "DISTRITO", origemId: 1, origemNome: "X", mesReferencia: "2026-01", valorArrecadadoLiquido: 10 } }, "financeiro"],
  ["RepassesInstitucionais PUT", hRepasses, { metodo: "PUT", corpo: { repasseId: 1, acao: "REPASSAR" } }, "financeiro"],
  ["Seguros GET", hSeguros, { metodo: "GET" }, "financeiro"],
  ["Seguros GET alertas", hSeguros, { metodo: "GET", ligado: { recurso: "alertas" } }, "financeiro"],
  ["Seguros POST", hSeguros, { metodo: "POST", corpo: { tipo: "OUTROS", seguradora: "Seg", numeroApolice: "1", dataInicio: "2026-01-01", dataFim: "2026-12-31" } }, "financeiro"],
  ["Seguros PUT", hSeguros, { metodo: "PUT", corpo: { apoliceId: 1, acao: "CANCELAR" } }, "financeiro"],
  ["Sorteios POST", hSorteios, { metodo: "POST", ligado: { campanhaId: "1" }, corpo: { nome: "S", premios: ["a"] } }, "financeiro"],
  ["Sorteios PUT", hSorteios, { metodo: "PUT", ligado: { campanhaId: "1", id: "2" }, corpo: { status: "REALIZADO" } }, "financeiro"],
  ["ProcessarRetornoRemessa POST", hRetorno, { metodo: "POST", ligado: { id: "7" }, corpo: { arquivoRetornoBase64: "QQ==" } }, "financeiro"],
  ["RegistrarRepasseTesouraria POST", hRepasseTes, { metodo: "POST", ligado: { fechamentoId: "12" }, corpo: {} }, "financeiro"]
];

describe.each(INSTITUCIONAIS)("%s — só o geral", (_nome, handler, args, permissao) => {
  test("sem sessão: 401, sem tocar no banco", async () => {
    const r = await chamar(handler, args);
    expect(r.status).toBe(401);
    expect(mockConsultas).toHaveLength(0);
  });
  test("sessão de PIN (sem permissões): recusada, sem tocar no banco", async () => {
    const r = await chamar(handler, { ...args, token: tokenPin() });
    expect(r.status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("tesoureiro local/de área com a permissão: 403 da administração geral ANTES de tocar no banco", async () => {
    for (const token of [local(["Central"], [permissao]), local(["Central", "Vila Nova"], [permissao], "AREA")]) {
      const r = await chamar(handler, { ...args, token });
      expect(r.status).toBe(403);
      expect(r.body.mensagem).toBe("Esta função é da administração geral da igreja.");
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("papel Global com escopo de lista, ou papel local com escopo TODAS: também 403, sem tocar no banco", async () => {
    for (const token of [tokenDe(8, { nivel: "GLOBAL", escopoCongregacoes: ["Central"], permissoes: [permissao] }), tokenDe(9, { nivel: "CONGREGACAO", escopoCongregacoes: "TODAS", permissoes: [permissao] })]) {
      const r = await chamar(handler, { ...args, token });
      expect(r.status).toBe(403);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("geral sem a permissão: 403, sem tocar no banco", async () => {
    const r = await chamar(handler, { ...args, token: geral(["reunioes"]) });
    expect(r.status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("o geral com a permissão passa pela porta (chega ao banco)", async () => {
    await chamar(handler, { ...args, token: geral([permissao]) }).catch(() => null);
    expect(mockConsultas.length).toBeGreaterThan(0);
  });
});

describe("GestaoSorteios — decisão: LER continua com qualquer `financeiro` (as campanhas já são listáveis); escrever é só do geral", () => {
  test("tesoureiro local lista os sorteios da campanha e vê um sorteio", async () => {
    quando(/FROM Sorteios WHERE CampanhaId = @campanhaId/, [{ sorteioId: 8, nome: "Rifa" }]);
    const lista = await chamar(hSorteios, { token: local(["Central"]), ligado: { campanhaId: "1" } });
    expect(lista.status).toBe(200);
    expect(lista.body).toEqual([{ sorteioId: 8, nome: "Rifa" }]);
    quando(/FROM Sorteios WHERE SorteioId = @id AND CampanhaId = @campanhaId/, [{ sorteioId: 8 }]);
    const um = await chamar(hSorteios, { token: local(["Central"]), ligado: { campanhaId: "1", id: "8" } });
    expect(um.status).toBe(200);
    expect(escritas()).toHaveLength(0);
  });
  test("campanhaId ou id malformado: nada de 500", async () => {
    expect((await chamar(hSorteios, { token: local(["Central"]), ligado: { campanhaId: "0x1" } })).status).toBe(400);
    const r = await chamar(hSorteios, { token: local(["Central"]), ligado: { campanhaId: "1", id: "1e1" } });
    expect(r.body).toEqual({ sucesso: false, mensagem: "Sorteio não encontrado." });
    expect(mockConsultas).toHaveLength(0);
  });
  test("o geral cria sorteio (grava) e edita; id de prêmio malformado é ignorado", async () => {
    quando(/SELECT Status FROM Campanhas/, [{ Status: "ATIVA" }]);
    quando(/INSERT INTO Sorteios/, [{ SorteioId: 8 }]);
    const c = await chamar(hSorteios, { metodo: "POST", token: geral(), ligado: { campanhaId: "1" }, corpo: { nome: "Rifa", premios: ["TV"] } });
    expect(c.status).toBe(201);
    expect(rodou(/INSERT INTO Sorteios /)).toHaveLength(1);
    mockConsultas = [];
    quando(/SELECT \* FROM Sorteios WHERE SorteioId = @id AND CampanhaId = @campanhaId/, [{ SorteioId: 8, Nome: "Rifa", Status: "ATIVO" }]);
    quando(/MAX\(Ordem\)/, [{ maior: 1 }]);
    const e = await chamar(hSorteios, { metodo: "PUT", token: geral(), ligado: { campanhaId: "1", id: "8" }, corpo: { status: "REALIZADO", premios: [{ premioId: "0x5", nomeGanhador: "X" }, null, { premioId: 3, nomeGanhador: "Maria" }] } });
    expect(e.status).toBe(200);
    expect(rodou(/UPDATE SorteioPremios/)).toHaveLength(1);
    expect(rodou(/UPDATE SorteioPremios/)[0].inputs).toMatchObject({ id: 3, nomeGanhador: "Maria" });
  });
});

// =============================================================================================================================================================
// 2. Termos de condução e retiradas de chave: escopo pela congregação do veículo
// =============================================================================================================================================================
const BENS = { 10: { congregacaoNome: "Central" }, 20: { congregacaoNome: "Vila Nova" }, 30: { congregacaoNome: null } };       // 30 = veículo da Sede
const TERMOS = {
  1: { TermoId: 1, BemId: 10, congregacaoNome: "Central", CondutorMembroId: 40, Status: "ATIVO", CnhValidade: dia(300), DataInicioMissao: dia(-1), DataFimPrevista: dia(5) },
  2: { TermoId: 2, BemId: 20, congregacaoNome: "Vila Nova", CondutorMembroId: 41, Status: "ATIVO", CnhValidade: dia(300), DataInicioMissao: dia(-1), DataFimPrevista: dia(5) },
  3: { TermoId: 3, BemId: 30, congregacaoNome: null, CondutorMembroId: 42, Status: "ATIVO", CnhValidade: dia(300), DataInicioMissao: dia(-1), DataFimPrevista: dia(5) }
};
const RETIRADAS = {
  1: { RetiradaId: 1, BemId: 10, congregacaoNome: "Central", DataHoraDevolucao: null, Observacao: null },
  2: { RetiradaId: 2, BemId: 20, congregacaoNome: "Vila Nova", DataHoraDevolucao: null, Observacao: null },
  3: { RetiradaId: 3, BemId: 30, congregacaoNome: null, DataHoraDevolucao: null, Observacao: null }
};
const CORPO_TERMO = (bemId) => ({ bemId, condutorMembroId: 99, cnhNumero: "123456", cnhValidade: dia(400), missaoDescricao: "Visita", dataInicioMissao: dia(1), dataFimPrevista: dia(3) });

function regrasFrota() {
  quando(/FROM BensPatrimoniais b\s+LEFT JOIN Congregacoes c ON c\.CongregacaoId = b\.CongregacaoId\s+WHERE b\.BemId = @bemId AND b\.Tipo = 'VEICULO'/, (i) => (BENS[i.bemId] ? [{ BemId: i.bemId, ...BENS[i.bemId] }] : []));
  quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, (i) => (i.id === 99 ? [{ MembroId: 99 }] : []));
  quando(/INSERT INTO TermosAutorizacaoConducao/, [{ TermoId: 70 }]);
  quando(/SELECT t\.\*, c\.Nome AS congregacaoNome FROM TermosAutorizacaoConducao t/, (i) => (TERMOS[i.id] ? [TERMOS[i.id]] : []));
  quando(/UPDATE TermosAutorizacaoConducao SET Status/, [], 1);
  quando(/SELECT COUNT\(\*\) AS total FROM RetiradasChave/, [{ total: 0 }]);
  quando(/INSERT INTO RetiradasChave/, [{ RetiradaId: 90 }]);
  quando(/SELECT r\.\*, c\.Nome AS congregacaoNome FROM RetiradasChave r/, (i) => (RETIRADAS[i.id] ? [RETIRADAS[i.id]] : []));
  quando(/UPDATE RetiradasChave SET DataHoraDevolucao/, [], 1);
}

describe("GestaoTermosConducao — escopo pela congregação do veículo", () => {
  beforeEach(regrasFrota);

  test("sem sessão: 401; sessão de PIN: recusada; sem nada no banco", async () => {
    expect((await chamar(hTermos)).status).toBe(401);
    expect((await chamar(hTermos, { token: tokenPin() })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("GET: o tesoureiro local só vê termos de veículo da própria congregação (a Sede e as outras não aparecem); o geral vê todos", async () => {
    quando(/SELECT t\.\*, b\.Descricao AS bemDescricao/, [
      { TermoId: 1, congregacaoNome: "Central" }, { TermoId: 2, congregacaoNome: "Vila Nova" }, { TermoId: 3, congregacaoNome: null }
    ]);
    const l = await chamar(hTermos, { token: local(["Central"]) });
    expect(l.body.map(t => t.TermoId)).toEqual([1]);
    const a = await chamar(hTermos, { token: local(["Central", "Vila Nova"], ["financeiro"], "AREA") });
    expect(a.body.map(t => t.TermoId)).toEqual([1, 2]);
    const g = await chamar(hTermos, { token: geral() });
    expect(g.body.map(t => t.TermoId)).toEqual([1, 2, 3]);
    expect(rodou(/LEFT JOIN Congregacoes c ON c\.CongregacaoId = b\.CongregacaoId/).length).toBeGreaterThan(0);
  });
  test("GET com filtro de veículo malformado: lista vazia, sem consultar", async () => {
    const r = await chamar(hTermos, { token: geral(), query: { bemId: "0x10" } });
    expect(r.body).toEqual([]);
    expect(mockConsultas).toHaveLength(0);
  });
  test("POST em veículo de OUTRA congregação: mesma resposta de veículo inexistente, nada é gravado", async () => {
    const fora = await chamar(hTermos, { metodo: "POST", token: local(["Central"]), corpo: CORPO_TERMO(20) });
    const inexistente = await chamar(hTermos, { metodo: "POST", token: local(["Central"]), corpo: CORPO_TERMO(999) });
    expect(fora.status).toBe(200);
    expect(fora.body).toEqual(inexistente.body);
    expect(fora.body.mensagem).toMatch(/Veículo não encontrado/);
    expect(escritas()).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("POST em veículo da SEDE: só o escopo TODAS; o local é recusado como 'não encontrado'", async () => {
    const l = await chamar(hTermos, { metodo: "POST", token: local(["Central"]), corpo: CORPO_TERMO(30) });
    expect(l.body.mensagem).toMatch(/Veículo não encontrado/);
    expect(escritas()).toHaveLength(0);
    const g = await chamar(hTermos, { metodo: "POST", token: geral(), corpo: CORPO_TERMO(30) });
    expect(g.status).toBe(201);
    expect(rodou(/INSERT INTO TermosAutorizacaoConducao/)).toHaveLength(1);
  });
  test("POST em veículo da própria congregação grava o termo (condutor de fora do escopo vale — só precisa existir)", async () => {
    const r = await chamar(hTermos, { metodo: "POST", token: local(["Central"]), corpo: CORPO_TERMO(10) });
    expect(r.status).toBe(201);
    const ins = rodou(/INSERT INTO TermosAutorizacaoConducao/);
    expect(ins).toHaveLength(1);
    expect(ins[0].inputs).toMatchObject({ bemId: 10, condutor: 99, por: 6 });
  });
  test("POST: condutor inexistente é recusado sem gravar; ids malformados e datas inválidas dão 400", async () => {
    const semCondutor = await chamar(hTermos, { metodo: "POST", token: local(["Central"]), corpo: { ...CORPO_TERMO(10), condutorMembroId: 123 } });
    expect(semCondutor.body.mensagem).toMatch(/Condutor não encontrado/);
    expect(escritas()).toHaveLength(0);
    expect((await chamar(hTermos, { metodo: "POST", token: local(["Central"]), corpo: { ...CORPO_TERMO(10), bemId: "0x10" } })).status).toBe(400);
    expect((await chamar(hTermos, { metodo: "POST", token: local(["Central"]), corpo: { ...CORPO_TERMO(10), cnhValidade: "amanhã" } })).status).toBe(400);
    expect((await chamar(hTermos, { metodo: "POST", token: local(["Central"]), corpo: { ...CORPO_TERMO(10), cnhNumero: 123 } })).status).toBe(400);
    expect(escritas()).toHaveLength(0);
  });
  test("PUT em termo de veículo de OUTRA congregação: mesma resposta de termo inexistente, nada é gravado", async () => {
    const fora = await chamar(hTermos, { metodo: "PUT", token: local(["Central"]), ligado: { id: "2" }, corpo: { acao: "CANCELAR" } });
    const inexistente = await chamar(hTermos, { metodo: "PUT", token: local(["Central"]), ligado: { id: "999" }, corpo: { acao: "CANCELAR" } });
    const malformado = await chamar(hTermos, { metodo: "PUT", token: local(["Central"]), ligado: { id: "0x2" }, corpo: { acao: "CANCELAR" } });
    expect(fora.body).toEqual({ sucesso: false, mensagem: "Termo não encontrado." });
    expect(inexistente.body).toEqual(fora.body);
    expect(malformado.body).toEqual(fora.body);
    const sede = await chamar(hTermos, { metodo: "PUT", token: local(["Central"]), ligado: { id: "3" }, corpo: { acao: "ENCERRAR" } });
    expect(sede.body).toEqual(fora.body);
    expect(escritas()).toHaveLength(0);
  });
  test("PUT em termo da própria congregação encerra (UPDATE condicional) e audita; o geral cancela o da Sede", async () => {
    const r = await chamar(hTermos, { metodo: "PUT", token: local(["Central"]), ligado: { id: "1" }, corpo: { acao: "ENCERRAR" } });
    expect(r.body.sucesso).toBe(true);
    const up = rodou(/UPDATE TermosAutorizacaoConducao SET Status/);
    expect(up).toHaveLength(1);
    expect(up[0].sql).toMatch(/AND Status = 'ATIVO'/);
    expect(up[0].inputs).toMatchObject({ id: 1, status: "ENCERRADO" });
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    const g = await chamar(hTermos, { metodo: "PUT", token: geral(), ligado: { id: "3" }, corpo: { acao: "CANCELAR" } });
    expect(g.body.sucesso).toBe(true);
  });
  test("PUT: termo já encerrado por outra chamada (UPDATE não pega a linha) não audita", async () => {
    mockRegras = mockRegras.filter(([p]) => !/UPDATE TermosAutorizacaoConducao/.test(p.source));
    quando(/UPDATE TermosAutorizacaoConducao SET Status/, [], 0);
    const r = await chamar(hTermos, { metodo: "PUT", token: geral(), ligado: { id: "1" }, corpo: { acao: "ENCERRAR" } });
    expect(r.body.sucesso).toBe(false);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe("GestaoRetiradasChave — escopo pela congregação do veículo", () => {
  beforeEach(regrasFrota);

  test("sem sessão: 401; sessão de PIN: recusada; sem nada no banco", async () => {
    expect((await chamar(hRetiradas)).status).toBe(401);
    expect((await chamar(hRetiradas, { token: tokenPin() })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("GET: o tesoureiro local só vê retiradas de veículo da própria congregação; o geral vê todas", async () => {
    quando(/SELECT r\.\*, b\.Descricao AS bemDescricao/, [
      { RetiradaId: 1, congregacaoNome: "Central" }, { RetiradaId: 2, congregacaoNome: "Vila Nova" }, { RetiradaId: 3, congregacaoNome: null }
    ]);
    expect((await chamar(hRetiradas, { token: local(["Central"]) })).body.map(r => r.RetiradaId)).toEqual([1]);
    expect((await chamar(hRetiradas, { token: geral() })).body.map(r => r.RetiradaId)).toEqual([1, 2, 3]);
    expect((await chamar(hRetiradas, { token: geral(), query: { bemId: "abc" } })).body).toEqual([]);
  });
  test("POST com termo de veículo de OUTRA congregação (ou da Sede): mesma resposta de termo inexistente, nada é gravado", async () => {
    const fora = await chamar(hRetiradas, { metodo: "POST", token: local(["Central"]), corpo: { termoAutorizacaoId: 2 } });
    const sede = await chamar(hRetiradas, { metodo: "POST", token: local(["Central"]), corpo: { termoAutorizacaoId: 3 } });
    const inexistente = await chamar(hRetiradas, { metodo: "POST", token: local(["Central"]), corpo: { termoAutorizacaoId: 999 } });
    const malformado = await chamar(hRetiradas, { metodo: "POST", token: local(["Central"]), corpo: { termoAutorizacaoId: "0x1" } });
    expect(fora.body).toEqual({ sucesso: false, mensagem: "Termo de autorização não encontrado." });
    for (const outro of [sede, inexistente, malformado]) expect(outro.body).toEqual(fora.body);
    expect(escritas()).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
    mockConsultas = [];
    await chamar(hRetiradas, { metodo: "POST", token: local(["Central"]), corpo: { termoAutorizacaoId: "0x1" } });
    expect(mockConsultas).toHaveLength(0);                                                       // id malformado nem chega a consultar
  });
  test("POST com termo da própria congregação registra a retirada; o geral registra a da Sede", async () => {
    const r = await chamar(hRetiradas, { metodo: "POST", token: local(["Central"]), corpo: { termoAutorizacaoId: "1", observacao: "ok" } });
    expect(r.status).toBe(201);
    const ins = rodou(/INSERT INTO RetiradasChave/);
    expect(ins).toHaveLength(1);
    expect(ins[0].inputs).toMatchObject({ termoId: 1, bemId: 10, condutor: 40, por: 6 });
    const g = await chamar(hRetiradas, { metodo: "POST", token: geral(), corpo: { termoAutorizacaoId: 3 } });
    expect(g.status).toBe(201);
  });
  test("PUT (devolução) em retirada de veículo de OUTRA congregação: mesma resposta de retirada inexistente, nada é gravado", async () => {
    const fora = await chamar(hRetiradas, { metodo: "PUT", token: local(["Central"]), ligado: { id: "2" }, corpo: { custoConsertoImprudenciaValor: 500 } });
    const sede = await chamar(hRetiradas, { metodo: "PUT", token: local(["Central"]), ligado: { id: "3" }, corpo: { custoConsertoImprudenciaValor: 500 } });
    const inexistente = await chamar(hRetiradas, { metodo: "PUT", token: local(["Central"]), ligado: { id: "999" }, corpo: {} });
    const malformado = await chamar(hRetiradas, { metodo: "PUT", token: local(["Central"]), ligado: { id: "1e0" }, corpo: {} });
    expect(fora.body).toEqual({ sucesso: false, mensagem: "Retirada não encontrada." });
    for (const outro of [sede, inexistente, malformado]) expect(outro.body).toEqual(fora.body);
    expect(escritas()).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("PUT na própria congregação registra a devolução e o custo (UPDATE só pega retirada ainda aberta)", async () => {
    const r = await chamar(hRetiradas, { metodo: "PUT", token: local(["Central"]), ligado: { id: "1" }, corpo: { custoConsertoImprudenciaValor: 350.5, observacao: "arranhão" } });
    expect(r.body.sucesso).toBe(true);
    const up = rodou(/UPDATE RetiradasChave SET DataHoraDevolucao/);
    expect(up).toHaveLength(1);
    expect(up[0].sql).toMatch(/AND DataHoraDevolucao IS NULL/);
    expect(up[0].inputs).toMatchObject({ id: 1, custo: 350.5, obs: "arranhão" });
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
  test("PUT: custo negativo ou que não é número dá 400 sem gravar; devolução repetida (UPDATE não pega) não audita", async () => {
    for (const custo of [-5, "abc"]) {
      expect((await chamar(hRetiradas, { metodo: "PUT", token: geral(), ligado: { id: "1" }, corpo: { custoConsertoImprudenciaValor: custo } })).status).toBe(400);
    }
    expect(escritas()).toHaveLength(0);
    mockRegras = mockRegras.filter(([p]) => !/UPDATE RetiradasChave/.test(p.source));
    quando(/UPDATE RetiradasChave SET DataHoraDevolucao/, [], 0);
    const r = await chamar(hRetiradas, { metodo: "PUT", token: geral(), ligado: { id: "1" }, corpo: {} });
    expect(r.body.sucesso).toBe(false);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

// =============================================================================================================================================================
// 3. shared/tesouraria.js — a Saída da prebenda nasce na congregação do ministro; o tesoureiro local não a opera
// =============================================================================================================================================================
describe("podeOperarCentroCusto — centros da igreja inteira são do geral", () => {
  const CENTROS_GERAIS = ["GERAL", "PDQ", "CONVENCAO", "PREBENDA_PASTORAL"];
  test("o geral opera todos; o tesoureiro local opera só LOCAL e DEPTO_*", () => {
    const g = { permissoes: ["financeiro"], nivel: "GLOBAL", escopoCongregacoes: "TODAS" };
    const l = { permissoes: ["financeiro"], nivel: "CONGREGACAO", escopoCongregacoes: ["Central"] };
    for (const c of [...CENTROS_GERAIS, "LOCAL", "DEPTO_UMADESPA"]) expect(tesouraria.podeOperarCentroCusto(g, c, null)).toBe(true);
    for (const c of ["LOCAL", "DEPTO_UMADESPA"]) expect(tesouraria.podeOperarCentroCusto(l, c, null)).toBe(true);
    for (const c of CENTROS_GERAIS) expect(tesouraria.podeOperarCentroCusto(l, c, null)).toBe(false);
  });
  test("papel Global com escopo de lista e papel local com escopo TODAS também não operam os centros gerais", () => {
    for (const u of [{ nivel: "GLOBAL", escopoCongregacoes: ["Central"] }, { nivel: "CONGREGACAO", escopoCongregacoes: "TODAS" }, { nivel: "AREA", escopoCongregacoes: "TODAS" }]) {
      for (const c of CENTROS_GERAIS) expect(tesouraria.podeOperarCentroCusto({ permissoes: ["financeiro"], ...u }, c, null)).toBe(false);
    }
  });
  test("quem só tem tesouraria_departamental continua restrito ao próprio departamento", () => {
    const u = { permissoes: ["tesouraria_departamental"], nivel: "GLOBAL", escopoCongregacoes: "TODAS" };
    expect(tesouraria.podeOperarCentroCusto(u, "DEPTO_UCADESPA", "UCADESPA")).toBe(true);
    expect(tesouraria.podeOperarCentroCusto(u, "PREBENDA_PASTORAL", "UCADESPA")).toBe(false);
  });
});

// =============================================================================================================================================================
// 4. GestaoPrebendados — valor preso ao ato, CPF do fornecedor = CPF do prebendado, CPF mascarado na trilha
// =============================================================================================================================================================
describe("GestaoPrebendados — integridade do cadastro", () => {
  const corpo = (extra = {}) => ({ membroId: 40, fornecedorId: 3, cpf: "12345678909", valorMensalReferencia: 5000, dataInicio: "2026-01-01", atoDesignacaoId: 7, ...extra });
  const regras = ({ cpfFornecedor = "123.456.789-09", tipo = "PF", valorAto = 5000 } = {}) => {
    quando(/SELECT Nome FROM MembroReferencia WHERE MembroId = @id/, [{ Nome: "Pr. João" }]);
    quando(/SELECT \* FROM Fornecedores WHERE FornecedorId = @id/, [{ Tipo: tipo, CpfCnpj: cpfFornecedor, Nome: "João" }]);
    quando(/SELECT PrebendadoId FROM Prebendados WHERE Cpf = @cpf/, []);
    quando(/FROM AtosDesignacao WHERE AtoDesignacaoId = @id/, [{ AtoDesignacaoId: 7, MembroId: 40, ValorMensal: valorAto }]);
    quando(/INSERT INTO Prebendados/, [{ PrebendadoId: 11 }]);
  };

  test("valor de referência acima do valor do ato: recusado, nada gravado", async () => {
    regras();
    const r = await chamar(hPrebendados, { metodo: "POST", token: geral(), corpo: corpo({ valorMensalReferencia: 5000.01 }) });
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/não pode passar do valor do Ato/);
    expect(escritas()).toHaveLength(0);
  });
  test("CPF do fornecedor PF diferente do CPF do prebendado: recusado, nada gravado (a prebenda não sai para a conta de outra pessoa)", async () => {
    regras({ cpfFornecedor: "111.111.111-11" });
    const r = await chamar(hPrebendados, { metodo: "POST", token: geral(), corpo: corpo() });
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/CPF do fornecedor PF não confere/);
    expect(escritas()).toHaveLength(0);
  });
  test("valor igual ao do ato e CPF igual (com ou sem máscara): grava, e a trilha guarda só os 2 últimos dígitos do CPF", async () => {
    regras();
    const r = await chamar(hPrebendados, { metodo: "POST", token: geral(), corpo: corpo({ cpf: "123.456.789-09" }) });
    expect(r.status).toBe(201);
    expect(rodou(/INSERT INTO Prebendados/)).toHaveLength(1);
    const trilha = registrarAuditoria.mock.calls[0][0];
    expect(trilha.dadosDepois.cpf).toBe("***.***.***-09");
    expect(JSON.stringify(trilha)).not.toMatch(/123\.456\.789|12345678909/);
  });
  test("fornecedor PJ continua vedado; ids/data/CPF malformados dão 400 sem tocar no banco", async () => {
    regras({ tipo: "PJ" });
    expect((await chamar(hPrebendados, { metodo: "POST", token: geral(), corpo: corpo() })).body.mensagem).toMatch(/pejotização/);
    mockConsultas = [];
    for (const ruim of [{ membroId: "0x28" }, { fornecedorId: "1e1" }, { atoDesignacaoId: "abc" }, { dataInicio: "2026-02-30" }, { cpf: 12345678909 }, { valorMensalReferencia: "abc" }]) {
      expect((await chamar(hPrebendados, { metodo: "POST", token: geral(), corpo: corpo(ruim) })).status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("PUT: trocar o valor para além do ato é recusado; dentro do ato grava; trilha sem o CPF", async () => {
    quando(/SELECT \* FROM Prebendados WHERE PrebendadoId = @id/, [{ PrebendadoId: 11, ValorMensalReferencia: 4000, Status: "ATIVO", AtoDesignacaoId: 7, DataFim: null, Observacao: null, Cpf: "12345678909" }]);
    quando(/SELECT ValorMensal FROM AtosDesignacao WHERE AtoDesignacaoId = @id/, [{ ValorMensal: 5000 }]);
    quando(/UPDATE Prebendados SET/, [], 1);
    const acima = await chamar(hPrebendados, { metodo: "PUT", token: geral(), ligado: { id: "11" }, corpo: { valorMensalReferencia: 6000 } });
    expect(acima.body.sucesso).toBe(false);
    expect(escritas()).toHaveLength(0);
    const ok = await chamar(hPrebendados, { metodo: "PUT", token: geral(), ligado: { id: "11" }, corpo: { valorMensalReferencia: 4500, acao: "SUSPENDER" } });
    expect(ok.body.sucesso).toBe(true);
    expect(rodou(/UPDATE Prebendados SET/)[0].inputs).toMatchObject({ valor: 4500, status: "SUSPENSO" });
    const trilha = registrarAuditoria.mock.calls[0][0];
    expect(trilha.dadosAntes.Cpf).toBe("***.***.***-09");
    expect(JSON.stringify(trilha)).not.toMatch(/12345678909/);
  });
  test("PUT/GET com id malformado ou inexistente: a mesma resposta de 'não encontrado'", async () => {
    quando(/FROM Prebendados p/, []);
    const a = await chamar(hPrebendados, { metodo: "GET", token: geral(), ligado: { id: "0x0B" } });
    const c = await chamar(hPrebendados, { metodo: "PUT", token: geral(), ligado: { id: "1e1" }, corpo: { acao: "SUSPENDER" } });
    expect(mockConsultas).toHaveLength(0);                                                       // id malformado nem chega a consultar
    const b = await chamar(hPrebendados, { metodo: "GET", token: geral(), ligado: { id: "999" } });
    expect(a.body).toEqual({ sucesso: false, mensagem: "Prebendado não encontrado." });
    expect(b.body).toEqual(a.body);
    expect(c.body).toEqual(a.body);
    expect(escritas()).toHaveLength(0);
  });
});

// =============================================================================================================================================================
// 5. GestaoPrebendas — a folha do mês numa transação, sob trava
// =============================================================================================================================================================
describe("GestaoPrebendas — gerar a folha de prebenda", () => {
  const candidato = (extra = {}) => ({
    prebendadoId: 11, membroId: 40, nome: "Pr. João", congregacaoId: 3, fornecedorId: 3, valorMensalReferencia: 5000, cpf: "12345678909", fornecedorCpfCnpj: "123.456.789-09",
    atoDesignacaoId: 7, numeroAto: "A-1", ataUrl: "https://blob/ata", valorAto: 5000, ...extra
  });
  const regras = (candidatos = [candidato()], trava = 0) => {
    quando(/sp_getapplock/, [{ resultado: trava }]);
    quando(/NOT EXISTS \(SELECT 1 FROM PrebendaGeracoes/, candidatos);
    quando(/FROM FaixasIrrf/, [{ FaixaMinimo: 0, Aliquota: 0, ParcelaDeduzir: 0 }]);
    quando(/FROM PrebendaRiscosVinculo/, []);
    quando(/INSERT INTO SaidasTesouraria/, [{ SaidaId: 900 }]);
    quando(/INSERT INTO PrebendaGeracoes/, [{ PrebendaGeracaoId: 50 }]);
  };

  test("fluxo: BEGIN, trava, lista de candidatos, Saída, geração, COMMIT — tudo na MESMA transação e nessa ordem", async () => {
    regras();
    const r = await chamar(hPrebendas, { metodo: "POST", token: geral(), corpo: { mesReferencia: "2026-10" } });
    expect(r.status).toBe(201);
    expect(r.body.geradas).toHaveLength(1);
    const ordem = [/<<BEGIN>>/, /sp_getapplock/, /NOT EXISTS \(SELECT 1 FROM PrebendaGeracoes/, /INSERT INTO SaidasTesouraria/, /INSERT INTO PrebendaGeracoes/, /<<COMMIT>>/].map(posicao);
    expect(ordem.every(p => p >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    const dentro = mockConsultas.slice(ordem[0] + 1, ordem[5]);
    expect(dentro.length).toBeGreaterThan(0);
    expect(dentro.every(c => c.emTransacao)).toBe(true);                                         // o IRRF e os riscos também são lidos na transação
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(0);
    expect(rodou(/INSERT INTO SaidasTesouraria/)[0].inputs).toMatchObject({ congregacaoId: 3, fornecedorId: 3, valor: 5000, solicitadoPor: 5 });
    expect(rodou(/INSERT INTO PrebendaGeracoes/)[0].inputs).toMatchObject({ mes: "2026-10", prebendadoId: 11, saidaId: 900 });
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
  test("a trava vem ANTES da leitura dos candidatos (quem esperou enxerga a geração que a chamada anterior gravou)", async () => {
    regras();
    await chamar(hPrebendas, { metodo: "POST", token: geral(), corpo: { mesReferencia: "2026-10" } });
    expect(posicao(/sp_getapplock/)).toBeLessThan(posicao(/NOT EXISTS \(SELECT 1 FROM PrebendaGeracoes/));
    expect(rodou(/sp_getapplock/)[0].inputs.recurso).toBe("PrebendaFolha");
  });
  test("trava não obtida (outra geração em andamento): 409, ROLLBACK, nenhuma Saída criada, candidatos nem lidos", async () => {
    regras([candidato()], -1);
    const r = await chamar(hPrebendas, { metodo: "POST", token: geral(), corpo: { mesReferencia: "2026-10" } });
    expect(r.status).toBe(409);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(escritas()).toHaveLength(0);
    expect(rodou(/NOT EXISTS/)).toHaveLength(0);
  });
  test("falha ao gravar a geração (ex.: UNIQUE do mês): ROLLBACK, sem COMMIT, 500 genérico — a Saída aprovada não fica solta", async () => {
    regras();
    mockRegras = mockRegras.filter(([p]) => !/INSERT INTO PrebendaGeracoes/.test(p.source));
    quando(/INSERT INTO PrebendaGeracoes/, () => { throw new Error("Violation of UNIQUE KEY constraint UQ_PrebendaGeracao_MesPessoa segredo-interno"); });
    const r = await chamar(hPrebendas, { metodo: "POST", token: geral(), corpo: { mesReferencia: "2026-10" } });
    expect(r.status).toBe(500);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(rodou(/INSERT INTO SaidasTesouraria/).every(c => c.emTransacao)).toBe(true);            // a Saída estava dentro da transação revertida
    expect(JSON.stringify(r.body)).not.toMatch(/segredo-interno|UQ_Prebenda|UNIQUE/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("candidato com valor acima do ato, ou com CPF do fornecedor diferente, é PULADO (nenhuma Saída)", async () => {
    regras([candidato({ prebendadoId: 11, valorMensalReferencia: 5000.5 }), candidato({ prebendadoId: 12, nome: "Pr. Pedro", fornecedorCpfCnpj: "999.999.999-99" })]);
    const r = await chamar(hPrebendas, { metodo: "POST", token: geral(), corpo: { mesReferencia: "2026-10" } });
    expect(r.body.geradas).toHaveLength(0);
    expect(r.body.puladas.map(p => p.prebendadoId)).toEqual([11, 12]);
    expect(r.body.puladas[0].motivo).toMatch(/acima do valor do Ato/);
    expect(r.body.puladas[1].motivo).toMatch(/CPF do fornecedor PF não confere/);
    expect(rodou(/INSERT INTO/)).toHaveLength(0);
  });
  test("mês de referência fora do formato AAAA-MM: 400, sem abrir transação", async () => {
    for (const mes of ["2026-13", "2026-1", "26-10", "abc", "2026-10-01", 202610]) {
      const r = await chamar(hPrebendas, { metodo: "POST", token: geral(), corpo: { mesReferencia: mes } });
      expect(r.status).toBe(400);
    }
    expect((await chamar(hPrebendas, { token: geral(), query: { mesReferencia: "x" } })).status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
  test("riscos e detalhes: ids malformados dão 'não encontrado' sem tocar nas tabelas; risco com descrição que não é texto dá 400", async () => {
    const detalhe = await chamar(hPrebendas, { token: geral(), ligado: { id: "0x3" } });
    expect(detalhe.body.mensagem).toBe("Geração de prebenda não encontrada.");
    const risco = await chamar(hPrebendas, { metodo: "POST", token: geral(), ligado: { id: "riscos" }, corpo: { prebendadoId: "1e1", tipoRisco: "JORNADA", descricao: "x" } });
    expect(risco.body.mensagem).toBe("Prebendado não encontrado.");
    const resolver = await chamar(hPrebendas, { metodo: "PUT", token: geral(), ligado: { id: "riscos" }, corpo: { riscoId: "abc", acao: "RESOLVER" } });
    expect(resolver.body.mensagem).toBe("Risco não encontrado.");
    expect((await chamar(hPrebendas, { metodo: "POST", token: geral(), ligado: { id: "riscos" }, corpo: { prebendadoId: 1, tipoRisco: "JORNADA", descricao: 5 } })).status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
});

// =============================================================================================================================================================
// 6. GestaoRemessasBancarias — gerar a remessa numa transação, sob trava
// =============================================================================================================================================================
describe("GestaoRemessasBancarias — gerar a remessa", () => {
  const INSTITUICAO = { CodigoBanco: "001", Agencia: "1234", Conta: "56789", Cnpj: "12345678000190", RazaoSocial: "IEADESPA", NomeBanco: "BANCO", CodigoConvenio: "1", DigitoAgencia: "0", DigitoConta: "1" };
  const CANDIDATA = { saidaId: 900, valor: 4000, nomeFavorecido: "JOAO", bancoFavorecido: "001", agenciaFavorecido: "1234", contaFavorecido: "98765" };
  const regras = ({ trava = 0, candidatas = [CANDIDATA] } = {}) => {
    quando(/FROM DadosBancariosInstituicao/, [INSTITUICAO]);
    quando(/sp_getapplock/, [{ resultado: trava }]);
    quando(/s\.Status = 'APROVADA'/, candidatas);
    quando(/MAX\(NumeroSequencial\)/, [{ proximo: 5 }]);
    quando(/INSERT INTO RemessasBancarias/, [{ RemessaId: 77 }]);
    quando(/INSERT INTO RemessaItens/, []);
  };

  test("fluxo: BEGIN, trava, candidatas, número, remessa, itens, COMMIT — tudo na transação e nessa ordem; o arquivo sobe antes do COMMIT", async () => {
    regras();
    const r = await chamar(hRemessas, { metodo: "POST", token: geral(), corpo: {} });
    expect(r.status).toBe(201);
    expect(r.body.remessaId).toBe(77);
    const ordem = [/<<BEGIN>>/, /sp_getapplock/, /s\.Status = 'APROVADA'/, /MAX\(NumeroSequencial\)/, /INSERT INTO RemessasBancarias/, /INSERT INTO RemessaItens/, /<<COMMIT>>/].map(posicao);
    expect(ordem.every(p => p >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(mockConsultas.slice(ordem[0] + 1, ordem[6]).every(c => c.emTransacao)).toBe(true);
    expect(rodou(/sp_getapplock/)[0].inputs.recurso).toBe("RemessaBancaria");
    expect(rodou(/INSERT INTO RemessaItens/)[0].inputs).toMatchObject({ remessaId: 77, saidaId: 900 });
    expect(storage.salvarDocumento).toHaveBeenCalledTimes(1);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
  test("a seleção das candidatas ignora Saída que já está em remessa PENDENTE/PROCESSADA e é lida DEPOIS da trava", async () => {
    regras();
    await chamar(hRemessas, { metodo: "POST", token: geral(), corpo: {} });
    const selecao = rodou(/s\.Status = 'APROVADA'/)[0];
    expect(selecao.sql).toMatch(/NOT EXISTS \(SELECT 1 FROM RemessaItens ri WHERE ri\.SaidaId = s\.SaidaId AND ri\.Status IN \('PENDENTE', 'PROCESSADO'\)\)/);
    expect(posicao(/sp_getapplock/)).toBeLessThan(posicao(/s\.Status = 'APROVADA'/));
  });
  test("trava não obtida: 409, ROLLBACK, nenhuma remessa criada, nenhum arquivo enviado", async () => {
    regras({ trava: -1 });
    const r = await chamar(hRemessas, { metodo: "POST", token: geral(), corpo: {} });
    expect(r.status).toBe(409);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(escritas()).toHaveLength(0);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
  });
  test("sem candidatas (a geração concorrente já pegou todas): ROLLBACK, sem remessa vazia", async () => {
    regras({ candidatas: [] });
    const r = await chamar(hRemessas, { metodo: "POST", token: geral(), corpo: {} });
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(escritas()).toHaveLength(0);
  });
  test("falha ao gravar um item: ROLLBACK, sem COMMIT, 500 genérico (nada de remessa pela metade)", async () => {
    regras();
    mockRegras = mockRegras.filter(([p]) => !/INSERT INTO RemessaItens/.test(p.source));
    quando(/INSERT INTO RemessaItens/, () => { throw new Error("deadlock victim segredo-interno"); });
    const r = await chamar(hRemessas, { metodo: "POST", token: geral(), corpo: {} });
    expect(r.status).toBe(500);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(JSON.stringify(r.body)).not.toMatch(/segredo-interno|deadlock/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("congregacaoId malformado: 400 sem abrir transação; válido filtra a seleção", async () => {
    regras();
    expect((await chamar(hRemessas, { metodo: "POST", token: geral(), corpo: { congregacaoId: "0x3" } })).status).toBe(400);
    expect(rodou(/<<BEGIN>>/)).toHaveLength(0);
    await chamar(hRemessas, { metodo: "POST", token: geral(), corpo: { congregacaoId: "3" } });
    expect(rodou(/s\.Status = 'APROVADA'/)[0].sql).toMatch(/s\.CongregacaoId = @congregacaoId/);
    expect(rodou(/s\.Status = 'APROVADA'/)[0].inputs.congregacaoId).toBe(3);
  });
  test("GET detalhe: o geral recebe o link assinado do arquivo; id malformado = 'não encontrada'", async () => {
    quando(/SELECT \* FROM RemessasBancarias WHERE RemessaId = @id/, [{ RemessaId: 7, NumeroSequencial: 3, TotalRegistros: 1, ValorTotal: 10, Status: "GERADA", ArquivoUrl: "https://blob/arq", ArquivoRetornoUrl: null }]);
    const ok = await chamar(hRemessas, { token: geral(), ligado: { id: "7" } });
    expect(ok.body.arquivoUrl).toBe("https://blob/arq?sas");
    mockConsultas = [];
    const ruim = await chamar(hRemessas, { token: geral(), ligado: { id: "0x7" } });
    expect(ruim.body).toEqual({ sucesso: false, mensagem: "Remessa não encontrada." });
    expect(mockConsultas).toHaveLength(0);
  });
});

// =============================================================================================================================================================
// 7. Retorno do banco: só a ocorrência "00" confirma o pagamento
// =============================================================================================================================================================
function linhaRetorno(saidaId, ocorrencia) {
  const l = Array(240).fill(" ");
  l[7] = "3"; l[13] = "A";
  String(saidaId).padStart(20, "0").split("").forEach((ch, i) => { l[72 + i] = ch; });
  String(ocorrencia).split("").forEach((ch, i) => { l[230 + i] = ch; });
  return l.join("");
}

describe("cnab240.parsearRetornoCnab240 — ocorrência em branco NÃO é sucesso", () => {
  test("'00' confirma; qualquer outro código e a ocorrência em branco não confirmam", () => {
    const conteudo = [linhaRetorno(900, "00"), linhaRetorno(901, ""), linhaRetorno(902, "05"), linhaRetorno(903, " 0"), linhaRetorno(904, "0")].join("\r\n");
    const r = cnab240.parsearRetornoCnab240(conteudo);
    expect(r.map(x => [x.saidaId, x.sucesso])).toEqual([[900, true], [901, false], [902, false], [903, false], [904, false]]);
    expect(r[1].codigoOcorrencia).toBe("");
  });
  test("o arquivo gerado pelo próprio sistema (ocorrência ainda em branco) não vale como retorno confirmado", () => {
    const inst = { codigoBanco: "001", cnpj: "12345678000190", agencia: "1234", conta: "56789", razaoSocial: "IEADESPA", nomeBanco: "BANCO" };
    const arquivo = cnab240.gerarArquivoCnab240(inst, [{ saidaId: 900, valor: 10, nomeFavorecido: "JOAO", bancoFavorecido: "001", agenciaFavorecido: "1234", contaFavorecido: "98765", digitoAgenciaFavorecido: "", digitoContaFavorecido: "" }], 1);
    const r = cnab240.parsearRetornoCnab240(arquivo);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ saidaId: 900, sucesso: false });
  });
});

describe("ProcessarRetornoRemessa", () => {
  const regras = (statusRemessa = "GERADA") => {
    quando(/SELECT \* FROM RemessasBancarias WHERE RemessaId = @id/, [{ RemessaId: 77, Status: statusRemessa }]);
    quando(/FROM RemessaItens WHERE RemessaId = @remessaId AND SaidaId = @saidaId AND Status = 'PENDENTE'/, (i) => [{ RemessaItemId: 1000 + i.saidaId }]);
  };
  const arquivo = (linhas) => Buffer.from(linhas.join("\r\n"), "utf-8").toString("base64");

  test("só a ocorrência '00' paga a Saída; branco e rejeição marcam FALHOU e a Saída continua APROVADA", async () => {
    regras();
    const r = await chamar(hRetorno, { metodo: "POST", token: geral(), ligado: { id: "77" }, corpo: { arquivoRetornoBase64: arquivo([linhaRetorno(900, "00"), linhaRetorno(901, ""), linhaRetorno(902, "05")]), mimeType: "text/plain" } });
    expect(r.body).toMatchObject({ sucesso: true, confirmados: 1, falharam: 2 });
    const pagas = rodou(/UPDATE SaidasTesouraria SET Status = 'PAGA'/);
    expect(pagas.map(c => c.inputs.saidaId)).toEqual([900]);
    expect(pagas[0].sql).toMatch(/AND Status = 'APROVADA'/);
    const falhas = rodou(/UPDATE RemessaItens SET Status = 'FALHOU'/);
    expect(falhas.map(c => [c.inputs.id, c.inputs.motivo])).toEqual([
      [1901, "Retorno sem código de ocorrência — pagamento não confirmado pelo banco"],
      [1902, "Rejeitado pelo banco — código de ocorrência 05"]
    ]);
    expect(rodou(/UPDATE PrebendaGeracoes SET Status = 'PAGA'/).map(c => c.inputs.saidaId)).toEqual([900]);
    expect(rodou(/UPDATE RemessasBancarias SET Status = 'PROCESSADA'/)).toHaveLength(1);
  });
  test("o arquivo de retorno é gravado SEMPRE como texto puro, qualquer que seja o tipo declarado", async () => {
    regras();
    await chamar(hRetorno, { metodo: "POST", token: geral(), ligado: { id: "77" }, corpo: { arquivoRetornoBase64: arquivo([linhaRetorno(900, "00")]), mimeType: "text/html" } });
    expect(storage.salvarDocumento).toHaveBeenCalledTimes(1);
    expect(storage.salvarDocumento.mock.calls[0][1]).toBe("text/plain");
  });
  test("remessa já processada, inexistente ou com id malformado: recusada sem gravar nada", async () => {
    regras("PROCESSADA");
    const jaFeita = await chamar(hRetorno, { metodo: "POST", token: geral(), ligado: { id: "77" }, corpo: { arquivoRetornoBase64: arquivo([linhaRetorno(900, "00")]) } });
    expect(jaFeita.body.mensagem).toMatch(/já teve o retorno processado/);
    mockRegras = [];
    quando(/SELECT \* FROM RemessasBancarias/, []);
    const inexistente = await chamar(hRetorno, { metodo: "POST", token: geral(), ligado: { id: "78" }, corpo: { arquivoRetornoBase64: arquivo([linhaRetorno(900, "00")]) } });
    const malformada = await chamar(hRetorno, { metodo: "POST", token: geral(), ligado: { id: "0x4D" }, corpo: { arquivoRetornoBase64: arquivo([linhaRetorno(900, "00")]) } });
    expect(inexistente.body).toEqual({ sucesso: false, mensagem: "Remessa não encontrada." });
    expect(malformada.body).toEqual(inexistente.body);
    expect(escritas()).toHaveLength(0);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
  });
  test("arquivo que não é texto base64, vazio ou acima de 15 MB: 400 sem gravar", async () => {
    regras();
    for (const ruim of [123, ["a"], "A".repeat(21000000)]) {
      const r = await chamar(hRetorno, { metodo: "POST", token: geral(), ligado: { id: "77" }, corpo: { arquivoRetornoBase64: ruim } });
      expect(r.status).toBe(400);
    }
    expect(escritas()).toHaveLength(0);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
  });
});

// =============================================================================================================================================================
// 8. RegistrarRepasseTesouraria
// =============================================================================================================================================================
describe("RegistrarRepasseTesouraria", () => {
  const regras = (afetadas = 1, status = "FECHADO") => {
    quando(/SELECT f\.\* FROM FechamentosTesouraria f WHERE f\.FechamentoId = @id/, [{ FechamentoId: 12, Status: status, ValorRetidoLocal: 100 }]);
    quando(/UPDATE FechamentosTesouraria SET/, [], afetadas);
  };
  test("libera o saldo com UPDATE que só pega fechamento ainda NÃO repassado; audita", async () => {
    regras();
    const r = await chamar(hRepasseTes, { metodo: "POST", token: geral(), ligado: { fechamentoId: "12" }, corpo: { formaRepasse: "PIX" } });
    expect(r.body.sucesso).toBe(true);
    const up = rodou(/UPDATE FechamentosTesouraria SET/);
    expect(up).toHaveLength(1);
    expect(up[0].sql).toMatch(/AND Status <> 'REPASSADO'/);
    expect(up[0].inputs).toMatchObject({ id: 12, formaRepasse: "PIX", repassadoPor: 5 });
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
  test("corrida: outra chamada liberou entre a leitura e o UPDATE (0 linhas): 'já foi liberado', sem auditoria nova", async () => {
    regras(0);
    const r = await chamar(hRepasseTes, { metodo: "POST", token: geral(), ligado: { fechamentoId: "12" }, corpo: {} });
    expect(r.body).toEqual({ sucesso: false, mensagem: "Este saldo já foi liberado." });
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("fechamento já REPASSADO, inexistente ou id malformado: recusado sem gravar", async () => {
    regras(1, "REPASSADO");
    expect((await chamar(hRepasseTes, { metodo: "POST", token: geral(), ligado: { fechamentoId: "12" }, corpo: {} })).body.mensagem).toBe("Este saldo já foi liberado.");
    mockRegras = [];
    quando(/FROM FechamentosTesouraria/, []);
    const a = await chamar(hRepasseTes, { metodo: "POST", token: geral(), ligado: { fechamentoId: "99" }, corpo: {} });
    const b = await chamar(hRepasseTes, { metodo: "POST", token: geral(), ligado: { fechamentoId: "0xC" }, corpo: {} });
    expect(a.body).toEqual({ sucesso: false, mensagem: "Fechamento não encontrado." });
    expect(b.body).toEqual(a.body);
    expect(escritas()).toHaveLength(0);
  });
  test("falha do armazenamento do comprovante: a mensagem do erro interno NÃO vai ao cliente", async () => {
    regras();
    storage.salvarDocumento.mockRejectedValueOnce(new Error("segredo-do-blob-account-key"));
    const r = await chamar(hRepasseTes, { metodo: "POST", token: geral(), ligado: { fechamentoId: "12" }, corpo: { comprovanteBase64: "QUJD", mimeType: "application/pdf" } });
    expect(r.body.sucesso).toBe(false);
    expect(JSON.stringify(r.body)).not.toMatch(/segredo-do-blob/);
    expect(escritas()).toHaveLength(0);
  });
  test("comprovante acima de 15 MB ou com tipo não permitido: 400 sem gravar", async () => {
    regras();
    const grande = await chamar(hRepasseTes, { metodo: "POST", token: geral(), ligado: { fechamentoId: "12" }, corpo: { comprovanteBase64: "A".repeat(21000000), mimeType: "application/pdf" } });
    expect(grande.status).toBe(400);
    const tipo = await chamar(hRepasseTes, { metodo: "POST", token: geral(), ligado: { fechamentoId: "12" }, corpo: { comprovanteBase64: "QUJD", mimeType: "text/html" } });
    expect(tipo.status).toBe(400);
    expect(escritas()).toHaveLength(0);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
  });
});

// =============================================================================================================================================================
// 9. GestaoRateioGeral
// =============================================================================================================================================================
describe("GestaoRateioGeral", () => {
  test("mês fora do formato: 400 sem abrir transação", async () => {
    const r = await chamar(hRateio, { metodo: "POST", token: geral(), corpo: { mesReferencia: "2026-13" } });
    expect(r.status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
  test("falha no fechamento: ROLLBACK e 500 SEM a mensagem do erro interno", async () => {
    quando(/sp_getapplock/, [{ resultado: 0 }]);
    quando(/FROM FechamentosTesouraria f\s+JOIN Congregacoes/, () => { throw new Error("conexao com 10.0.0.5 caiu segredo-interno"); });
    const r = await chamar(hRateio, { metodo: "POST", token: geral(), corpo: { mesReferencia: "2026-10" } });
    expect(r.status).toBe(500);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(JSON.stringify(r.body)).not.toMatch(/segredo-interno|10\.0\.0\.5/);
  });
  test("trava não obtida: 409 e ROLLBACK, nada gravado", async () => {
    quando(/sp_getapplock/, [{ resultado: -1 }]);
    const r = await chamar(hRateio, { metodo: "POST", token: geral(), corpo: { mesReferencia: "2026-10" } });
    expect(r.status).toBe(409);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(escritas()).toHaveLength(0);
  });
  test("o geral lê o malote pendente e o detalhe; id malformado = 'não encontrado'", async () => {
    quando(/FROM FechamentosTesouraria f\s+JOIN Congregacoes/, [{ fechamentoId: 1, congregacaoId: 3, congregacaoNome: "Central", mesReferencia: "2026-09", valor: 100, mesesAtraso: 1 }]);
    quando(/FROM RateioGeralDestinos/, [{ Codigo: "CONVENCAO", Nome: "Convenção", Percentual: 10 }]);
    const p = await chamar(hRateio, { token: geral(), ligado: { id: "pendentes" } });
    expect(p.body.totalItens).toBe(1);
    expect(p.body.previsaoDestinos[0].valor).toBe(10);
    mockConsultas = [];
    const ruim = await chamar(hRateio, { token: geral(), ligado: { id: "0x2" } });
    expect(ruim.body).toEqual({ sucesso: false, mensagem: "Rateio Geral não encontrado." });
    expect(mockConsultas).toHaveLength(0);
  });
});

// =============================================================================================================================================================
// 10. GestaoRemanejamentoPdq
// =============================================================================================================================================================
describe("GestaoRemanejamentoPdq — transação e UPDATE condicional", () => {
  const regrasPost = (debito = 1) => {
    quando(/SELECT \* FROM PdqProjetos WHERE ProjetoId = @id/, (i) => [{ ProjetoId: i.id, OrcamentoPrevisto: 1000 }]);
    quando(/SELECT ProjetoId FROM PdqProjetos WHERE ProjetoId = @id/, (i) => [{ ProjetoId: i.id }]);
    quando(/INSERT INTO PdqRemanejamentos/, [{ RemanejamentoId: 5 }]);
    quando(/OrcamentoPrevisto = OrcamentoPrevisto - @valor/, [], debito);
    quando(/OrcamentoPrevisto = OrcamentoPrevisto \+ @valor/, [], 1);
  };
  const corpo = (extra = {}) => ({ projetoOrigemId: 1, projetoDestinoId: 2, valor: 100, ...extra });

  test("até 20%: o registro e os dois ajustes de orçamento acontecem na MESMA transação, com COMMIT no fim", async () => {
    regrasPost();
    const r = await chamar(hPdq, { metodo: "POST", token: geral(["cli"]), corpo: corpo() });
    expect(r.body).toMatchObject({ sucesso: true, status: "APROVADO_AUTOMATICO", remanejamentoId: 5 });
    const ordem = [/<<BEGIN>>/, /INSERT INTO PdqRemanejamentos/, /OrcamentoPrevisto - @valor/, /OrcamentoPrevisto \+ @valor/, /<<COMMIT>>/].map(posicao);
    expect(ordem.every(p => p >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(rodou(/OrcamentoPrevisto - @valor/)[0].sql).toMatch(/AND OrcamentoPrevisto >= @valor/);
  });
  test("a origem já não cobre o valor (UPDATE do débito não pega a linha): ROLLBACK, sem crédito, sem COMMIT", async () => {
    regrasPost(0);
    const r = await chamar(hPdq, { metodo: "POST", token: geral(["cli"]), corpo: corpo() });
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(rodou(/OrcamentoPrevisto \+ @valor/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("acima de 20%: fica PENDENTE_CLI e NÃO mexe nos orçamentos", async () => {
    regrasPost();
    const r = await chamar(hPdq, { metodo: "POST", token: geral(["cli"]), corpo: corpo({ valor: 500 }) });
    expect(r.body.status).toBe("PENDENTE_CLI");
    expect(rodou(/UPDATE PdqProjetos/)).toHaveLength(0);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(1);
  });
  test("ids malformados, valor que não é número e projetos iguais: 400 sem tocar no banco", async () => {
    for (const ruim of [{ projetoOrigemId: "0x1" }, { projetoDestinoId: "1e1" }, { valor: "abc" }, { projetoDestinoId: 1 }]) {
      expect((await chamar(hPdq, { metodo: "POST", token: geral(["cli"]), corpo: corpo(ruim) })).status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  const regrasPut = ({ claim = 1, debito = 1 } = {}) => {
    quando(/SELECT \* FROM PdqRemanejamentos WHERE RemanejamentoId = @id/, [{ RemanejamentoId: 5, Status: "PENDENTE_CLI", ProjetoOrigemId: 1, ProjetoDestinoId: 2, Valor: 300 }]);
    quando(/SET Status = 'HOMOLOGADO'/, [], claim);
    quando(/SET Status = 'REJEITADO'/, [], claim);
    quando(/OrcamentoPrevisto = OrcamentoPrevisto - @valor/, [], debito);
    quando(/OrcamentoPrevisto = OrcamentoPrevisto \+ @valor/, [], 1);
  };
  test("homologar: pega o remanejamento só se ainda PENDENTE_CLI e aplica o ajuste na mesma transação", async () => {
    regrasPut();
    const r = await chamar(hPdq, { metodo: "PUT", token: geral(["cli"]), ligado: { id: "5" }, corpo: { acao: "HOMOLOGAR" } });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/SET Status = 'HOMOLOGADO'/)[0].sql).toMatch(/AND Status = 'PENDENTE_CLI'/);
    expect(rodou(/OrcamentoPrevisto - @valor/)[0].inputs).toMatchObject({ id: 1, valor: 300 });
    expect(rodou(/OrcamentoPrevisto \+ @valor/)[0].inputs).toMatchObject({ id: 2, valor: 300 });
    expect(rodou(/<<COMMIT>>/)).toHaveLength(1);
  });
  test("homologação concorrente (o UPDATE não pega a linha): NENHUM ajuste de orçamento, ROLLBACK", async () => {
    regrasPut({ claim: 0 });
    const r = await chamar(hPdq, { metodo: "PUT", token: geral(["cli"]), ligado: { id: "5" }, corpo: { acao: "HOMOLOGAR" } });
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/UPDATE PdqProjetos/)).toHaveLength(0);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("homologar sem saldo na origem: ROLLBACK (o status volta a PENDENTE_CLI), sem crédito, sem auditoria", async () => {
    regrasPut({ debito: 0 });
    const r = await chamar(hPdq, { metodo: "PUT", token: geral(["cli"]), ligado: { id: "5" }, corpo: { acao: "HOMOLOGAR" } });
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/<<ROLLBACK>>/)).toHaveLength(1);
    expect(rodou(/<<COMMIT>>/)).toHaveLength(0);
    expect(rodou(/OrcamentoPrevisto \+ @valor/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("rejeitar: exige motivo em texto e só pega remanejamento ainda pendente", async () => {
    regrasPut();
    expect((await chamar(hPdq, { metodo: "PUT", token: geral(["cli"]), ligado: { id: "5" }, corpo: { acao: "REJEITAR" } })).status).toBe(400);
    expect((await chamar(hPdq, { metodo: "PUT", token: geral(["cli"]), ligado: { id: "5" }, corpo: { acao: "REJEITAR", motivo: 5 } })).status).toBe(400);
    const ok = await chamar(hPdq, { metodo: "PUT", token: geral(["cli"]), ligado: { id: "5" }, corpo: { acao: "REJEITAR", motivo: "sem verba" } });
    expect(ok.body.sucesso).toBe(true);
    expect(rodou(/SET Status = 'REJEITADO'/)[0].sql).toMatch(/AND Status = 'PENDENTE_CLI'/);
    mockConsultas = [];
    mockRegras = [];
    quando(/SELECT \* FROM PdqRemanejamentos/, [{ RemanejamentoId: 5, Status: "PENDENTE_CLI" }]);
    quando(/SET Status = 'REJEITADO'/, [], 0);
    const corrida = await chamar(hPdq, { metodo: "PUT", token: geral(["cli"]), ligado: { id: "5" }, corpo: { acao: "REJEITAR", motivo: "x" } });
    expect(corrida.body.sucesso).toBe(false);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);                                         // só a rejeição que pegou a linha
  });
  test("id malformado ou inexistente no PUT: 'não encontrado', nada gravado", async () => {
    const a = await chamar(hPdq, { metodo: "PUT", token: geral(["cli"]), ligado: { id: "0x5" }, corpo: { acao: "HOMOLOGAR" } });
    quando(/SELECT \* FROM PdqRemanejamentos/, []);
    const b = await chamar(hPdq, { metodo: "PUT", token: geral(["cli"]), ligado: { id: "99" }, corpo: { acao: "HOMOLOGAR" } });
    expect(a.body).toEqual({ sucesso: false, mensagem: "Remanejamento não encontrado." });
    expect(b.body).toEqual(a.body);
    expect(escritas()).toHaveLength(0);
  });
});

// =============================================================================================================================================================
// 11. GestaoPrestacoesContas — a leitura não grava; mês e arquivo validados
// =============================================================================================================================================================
describe("GestaoPrestacoesContas", () => {
  const LINHA = { congregacaoId: 3, congregacaoNome: "Central", prestacaoId: null, status: null, bloqueioRepasse: 0, temAgua: 0, temLuz: 0 };

  test("GET com mês de referência passado só CALCULA o atraso: nenhuma escrita, nenhuma ata, nenhum arquivo", async () => {
    quando(/FROM Congregacoes c\s+LEFT JOIN PrestacoesContas p/, [LINHA, { ...LINHA, congregacaoId: 4, congregacaoNome: "Vila Nova", prestacaoId: 8, status: "COMPLETA", temAgua: 1, temLuz: 1 }]);
    const r = await chamar(hPrestacoes, { token: geral(), query: { mesReferencia: "2020-01" } });
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(2);
    expect(r.body[0]).toMatchObject({ congregacaoId: 3, status: "PENDENTE", emAtraso: true, bloqueioRepasse: false });
    expect(escritas()).toHaveLength(0);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("mês de referência fora do formato AAAA-MM (GET e POST): 400 sem tocar no banco", async () => {
    for (const mes of ["2020-13", "2020-1", "20-01", "abc", "2020-01-01"]) {
      expect((await chamar(hPrestacoes, { token: geral(), query: { mesReferencia: mes } })).status).toBe(400);
      expect((await chamar(hPrestacoes, { metodo: "POST", token: geral(), corpo: { congregacaoId: 3, mesReferencia: mes } })).status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("filtro de congregação malformado: lista vazia, sem consultar", async () => {
    const r = await chamar(hPrestacoes, { token: geral(), query: { congregacaoId: "0x3" } });
    expect(r.body).toEqual([]);
    expect(mockConsultas).toHaveLength(0);
  });
  const regrasPost = () => {
    quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @cong/, [{ Nome: "Central" }]);
    quando(/SELECT PrestacaoId FROM PrestacoesContas WHERE CongregacaoId/, []);
    quando(/INSERT INTO PrestacoesContas/, [{ PrestacaoId: 21 }]);
  };
  test("POST: comprovante acima de 15 MB é recusado antes de subir e nada é gravado", async () => {
    regrasPost();
    const r = await chamar(hPrestacoes, { metodo: "POST", token: geral(), corpo: { congregacaoId: 3, mesReferencia: "2026-09", comprovanteAguaBase64: "A".repeat(21000000), mimeTypeAgua: "application/pdf" } });
    expect(r.status).toBe(400);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
    expect(escritas()).toHaveLength(0);
  });
  test("POST em mês já vencido, incompleta: nasce com Ata de Pendência e bloqueio (o único lugar onde a ata nasce)", async () => {
    regrasPost();
    const r = await chamar(hPrestacoes, { metodo: "POST", token: geral(), corpo: { congregacaoId: "3", mesReferencia: "2020-01", comprovanteLuzBase64: "QUJD", mimeTypeLuz: "application/pdf" } });
    expect(r.status).toBe(201);
    const ins = rodou(/INSERT INTO PrestacoesContas/);
    expect(ins).toHaveLength(1);
    expect(ins[0].inputs).toMatchObject({ cong: 3, mes: "2020-01", status: "ATA_PENDENCIA", bloqueio: 1 });
    expect(storage.salvarDocumento).toHaveBeenCalledTimes(2);                                    // o comprovante de luz e a ata
  });
  test("POST: congregação inexistente ou id malformado: 'não encontrada', nada gravado", async () => {
    quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @cong/, []);
    const a = await chamar(hPrestacoes, { metodo: "POST", token: geral(), corpo: { congregacaoId: 99, mesReferencia: "2026-09" } });
    const b = await chamar(hPrestacoes, { metodo: "POST", token: geral(), corpo: { congregacaoId: "0x3", mesReferencia: "2026-09" } });
    expect(a.body).toEqual({ sucesso: false, mensagem: "Congregação não encontrada." });
    expect(b.body).toEqual(a.body);
    expect(escritas()).toHaveLength(0);
  });
  test("PUT: só mexe em prestação que existe; inexistente e id malformado dão a mesma resposta", async () => {
    quando(/SELECT PrestacaoId FROM PrestacoesContas WHERE PrestacaoId = @id/, (i) => (i.id === 4 ? [{ PrestacaoId: 4 }] : []));
    quando(/UPDATE PrestacoesContas SET BloqueioRepasse/, [], 1);
    const a = await chamar(hPrestacoes, { metodo: "PUT", token: geral(), ligado: { id: "99" }, corpo: { acao: "LIBERAR" } });
    const b = await chamar(hPrestacoes, { metodo: "PUT", token: geral(), ligado: { id: "0x4" }, corpo: { acao: "LIBERAR" } });
    expect(a.body).toEqual({ sucesso: false, mensagem: "Prestação de contas não encontrada." });
    expect(b.body).toEqual(a.body);
    expect(escritas()).toHaveLength(0);
    const ok = await chamar(hPrestacoes, { metodo: "PUT", token: geral(), ligado: { id: "4" }, corpo: { acao: "BLOQUEAR" } });
    expect(ok.body.sucesso).toBe(true);
    expect(rodou(/UPDATE PrestacoesContas SET BloqueioRepasse/)[0].inputs).toMatchObject({ id: 4, bloqueio: 1 });
  });
});

// =============================================================================================================================================================
// 12. GestaoRepassesInstitucionais e GestaoSeguros
// =============================================================================================================================================================
describe("GestaoRepassesInstitucionais", () => {
  test("confirmar: UPDATE só pega repasse ainda não confirmado; reconfirmar não sobrescreve nem audita", async () => {
    quando(/UPDATE RepassesInstitucionais SET Status = 'REPASSADO'/, [], 1);
    const ok = await chamar(hRepasses, { metodo: "PUT", token: geral(), corpo: { repasseId: "8", acao: "REPASSAR" } });
    expect(ok.body.sucesso).toBe(true);
    const up = rodou(/UPDATE RepassesInstitucionais SET Status = 'REPASSADO'/);
    expect(up[0].sql).toMatch(/AND Status <> 'REPASSADO'/);
    expect(up[0].inputs).toMatchObject({ id: 8, por: 5 });
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    mockRegras = [];
    quando(/UPDATE RepassesInstitucionais SET Status = 'REPASSADO'/, [], 0);
    const denovo = await chamar(hRepasses, { metodo: "PUT", token: geral(), corpo: { repasseId: 8, acao: "REPASSAR" } });
    expect(denovo.body).toEqual({ sucesso: false, mensagem: "Repasse não encontrado ou já confirmado." });
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
  test("id do repasse malformado: 'não encontrado' sem consultar", async () => {
    const r = await chamar(hRepasses, { metodo: "PUT", token: geral(), corpo: { repasseId: "0x8", acao: "REPASSAR" } });
    expect(r.body.mensagem).toBe("Repasse não encontrado ou já confirmado.");
    expect(mockConsultas).toHaveLength(0);
  });
  test("registrar: mês fora do formato, origemId malformado e nome que não é texto dão 400 sem gravar", async () => {
    const base = { origemTipo: "DISTRITO", origemId: 1, origemNome: "Distrito 1", mesReferencia: "2026-09", valorArrecadadoLiquido: 1000 };
    for (const ruim of [{ mesReferencia: "2026-13" }, { origemId: "0x1" }, { origemNome: 5 }]) {
      expect((await chamar(hRepasses, { metodo: "POST", token: geral(), corpo: { ...base, ...ruim } })).status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("registrar: com tudo válido grava com o percentual dos parâmetros", async () => {
    quando(/FROM ParametrosRepasseInstitucional/, [{ PercentualDizimoInstitucional: 10, DiasTolerancia: 5 }]);
    quando(/SELECT RepasseId FROM RepassesInstitucionais WHERE OrigemTipo/, []);
    quando(/INSERT INTO RepassesInstitucionais/, [{ RepasseId: 3 }]);
    const r = await chamar(hRepasses, { metodo: "POST", token: geral(), corpo: { origemTipo: "DISTRITO", origemId: "1", origemNome: "Distrito 1", mesReferencia: "2026-09", valorArrecadadoLiquido: 1000 } });
    expect(r.status).toBe(201);
    expect(rodou(/INSERT INTO RepassesInstitucionais/)[0].inputs).toMatchObject({ origem: 1, mes: "2026-09", valor: 100 });
  });
  test("parâmetros: percentual que não é número dá 400 sem gravar", async () => {
    quando(/FROM ParametrosRepasseInstitucional/, [{ PercentualDizimoInstitucional: 10, DiasTolerancia: 5 }]);
    for (const percentual of ["abc", null, ""]) {
      expect((await chamar(hRepasses, { metodo: "PUT", token: geral(), ligado: { recurso: "parametros" }, corpo: { percentualDizimoInstitucional: percentual } })).status).toBe(400);
    }
    expect(escritas()).toHaveLength(0);
  });
});

describe("GestaoSeguros", () => {
  const apolice = (extra = {}) => ({ tipo: "OUTROS", seguradora: "Seg", numeroApolice: "123", dataInicio: "2026-01-01", dataFim: "2026-12-31", ...extra });
  test("documento acima de 15 MB: 400 antes de subir e sem gravar; dentro do limite grava", async () => {
    quando(/INSERT INTO ApolicesSeguro/, [{ ApoliceId: 4 }]);
    const grande = await chamar(hSeguros, { metodo: "POST", token: geral(), corpo: apolice({ documentoBase64: "A".repeat(21000000), mimeType: "application/pdf" }) });
    expect(grande.status).toBe(400);
    expect(storage.salvarDocumento).not.toHaveBeenCalled();
    expect(escritas()).toHaveLength(0);
    const ok = await chamar(hSeguros, { metodo: "POST", token: geral(), corpo: apolice({ documentoBase64: "QUJD", mimeType: "application/pdf", bemId: "12" }) });
    expect(ok.status).toBe(201);
    expect(rodou(/INSERT INTO ApolicesSeguro/)[0].inputs.bemId).toBe(12);
  });
  test("campos que não são texto, datas inexistentes e bemId malformado: 400 sem gravar", async () => {
    for (const ruim of [{ seguradora: 5 }, { numeroApolice: ["1"] }, { dataFim: "2026-02-30" }, { dataInicio: "ontem" }, { bemId: "0x1" }]) {
      expect((await chamar(hSeguros, { metodo: "POST", token: geral(), corpo: apolice(ruim) })).status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("cancelar apólice que não existe (ou id malformado): 'não encontrada', sem auditoria", async () => {
    const a = await chamar(hSeguros, { metodo: "PUT", token: geral(), corpo: { apoliceId: "0x1", acao: "CANCELAR" } });
    quando(/UPDATE ApolicesSeguro SET Status = 'CANCELADA'/, [], 0);
    const b = await chamar(hSeguros, { metodo: "PUT", token: geral(), corpo: { apoliceId: 99, acao: "CANCELAR" } });
    expect(a.body).toEqual({ sucesso: false, mensagem: "Apólice não encontrada." });
    expect(b.body).toEqual(a.body);
    expect(registrarAuditoria).not.toHaveBeenCalled();
    mockRegras = [];
    quando(/UPDATE ApolicesSeguro SET Status = 'CANCELADA'/, [], 1);
    const ok = await chamar(hSeguros, { metodo: "PUT", token: geral(), corpo: { apoliceId: 4, acao: "CANCELAR" } });
    expect(ok.body.sucesso).toBe(true);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
});

describe("shared/prebenda.prebendadoComCpf — vedação à pejotização", () => {
  const prebenda = require("../prebenda");
  const { criarPoolFalso, sqlFalso } = require("./testUtils");
  test("não pede coluna que não existe (Nome), compara só os dígitos e devolve o prebendado", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ prebendadoId: 11 }]]);
    const r = await prebenda.prebendadoComCpf(pool, sqlFalso, "123.456.789-09");
    expect(r).toEqual({ prebendadoId: 11 });
    expect(chamadas[0].sql).not.toMatch(/\bNome\b/);
    expect(chamadas[0].sql).toMatch(/REPLACE\(REPLACE\(REPLACE\(Cpf/);
    expect(chamadas[0].inputs.cpf).toBe("12345678909");
  });
  test("sem dígitos não consulta; sem prebendado devolve null", async () => {
    const vazio = criarPoolFalso([[]]);
    expect(await prebenda.prebendadoComCpf(vazio.pool, sqlFalso, "")).toBeNull();
    expect(await prebenda.prebendadoComCpf(vazio.pool, sqlFalso, "abc")).toBeNull();
    expect(vazio.chamadas).toHaveLength(0);
    expect(await prebenda.prebendadoComCpf(vazio.pool, sqlFalso, "111.111.111-11")).toBeNull();
  });
});

// =============================================================================================================================================================
// 13. shared/financeiroSeguro.js
// =============================================================================================================================================================
describe("financeiroSeguro", () => {
  test("mesReferenciaValido: só AAAA-MM com mês 01 a 12", () => {
    for (const ok of ["2026-01", "2026-12", "1999-09"]) expect(seguro.mesReferenciaValido(ok)).toBe(true);
    for (const ruim of ["2026-00", "2026-13", "2026-1", "26-01", "2026-01-01", " 2026-01", "2026-01\n", 202601, null, undefined, ["2026-01"]]) expect(seguro.mesReferenciaValido(ruim)).toBe(false);
  });
  test("dataIsoValida: só data que existe no calendário", () => {
    expect(seguro.dataIsoValida("2026-02-28")).toBe(true);
    expect(seguro.dataIsoValida("2024-02-29")).toBe(true);
    for (const ruim of ["2026-02-30", "2026-13-01", "2026-2-1", "amanhã", "", null, 20260101]) expect(seguro.dataIsoValida(ruim)).toBe(false);
  });
  test("soDigitos e mascararCpf", () => {
    expect(seguro.soDigitos("123.456.789-09")).toBe("12345678909");
    expect(seguro.soDigitos(null)).toBe("");
    expect(seguro.mascararCpf("123.456.789-09")).toBe("***.***.***-09");
    expect(seguro.mascararCpf("")).toBeNull();
  });
  test("idOpcional: ausente, válido e malformado", () => {
    expect(seguro.idOpcional(undefined)).toEqual({ presente: false, id: null });
    expect(seguro.idOpcional("")).toEqual({ presente: false, id: null });
    expect(seguro.idOpcional("12")).toEqual({ presente: true, id: 12 });
    expect(seguro.idOpcional(12)).toEqual({ presente: true, id: 12 });
    for (const ruim of ["0x10", "1e1", "05", "-1", "abc", true]) expect(seguro.idOpcional(ruim)).toEqual({ presente: true, id: null });
  });
  test("lerBase64: texto válido vira Buffer; vazio, não-texto e acima de 15 MB dão erro sem alocar o arquivo", () => {
    expect(seguro.lerBase64("QUJD").buffer.toString()).toBe("ABC");
    expect(seguro.lerBase64("").erro).toBeTruthy();
    expect(seguro.lerBase64(123).erro).toBeTruthy();
    expect(seguro.lerBase64({}).erro).toBeTruthy();
    expect(seguro.lerBase64("A".repeat(21000000)).erro).toMatch(/15 MB/);
    expect(seguro.lerBase64("A".repeat(20000000)).buffer.length).toBe(15000000);
  });
  test("obterTrava: resultado 0 ou positivo trava; negativo (espera esgotada) ou sem linha NÃO trava", async () => {
    const fabrica = (resultado) => () => ({ input() { return this; }, async query() { return { recordset: resultado === undefined ? [] : [{ resultado }] }; } });
    expect(await seguro.obterTrava(fabrica(0), "X")).toBe(true);
    expect(await seguro.obterTrava(fabrica(1), "X")).toBe(true);
    expect(await seguro.obterTrava(fabrica(-1), "X")).toBe(false);
    expect(await seguro.obterTrava(fabrica(-3), "X")).toBe(false);
    expect(await seguro.obterTrava(fabrica(undefined), "X")).toBe(false);
  });
});
