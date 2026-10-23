// ExecutarExclusaoLGPD × check-in infantil e consentimento do responsável (Trava 7-B, 20/10/2026). A exclusão já anonimizava contato e foto; faltava a saúde da criança
// (CheckinInfantilSaude e as cópias nos registros de check-in), os consentimentos do responsável sobre ela (IMAGEM e SAUDE_CRACHA) e as autorizações de retirada em que o titular
// é o autorizado. Tudo na MESMA transação da exclusão; o registro de custódia (quem trouxe e quem retirou) fica. O banco é simulado pelo TEXTO da consulta.
let mockRegras = [];
let mockConsultas = [];
let mockEventos = [];
jest.mock("../db", () => {
  const rodar = async (texto, inputs, tx) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs }, tx });
    for (const [padrao, valor, afetadas] of mockRegras) {
      if (padrao.test(texto)) {
        const rs = typeof valor === "function" ? valor(inputs) : valor;
        if (rs instanceof Error) throw rs;
        return { recordset: rs, rowsAffected: [afetadas === undefined ? 1 : afetadas] };
      }
    }
    return { recordset: [], rowsAffected: [0] };
  };
  const novaRequisicao = (tx) => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: (texto) => rodar(texto, inputs, tx) }; return r; };
  class Transaction { async begin() { mockEventos.push("begin"); } async commit() { mockEventos.push("commit"); } async rollback() { mockEventos.push("rollback"); } }
  class Request { constructor(t) { return novaRequisicao(!!t); } }
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => ({ request: () => novaRequisicao(false) }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../storage", () => ({ excluirFoto: jest.fn(async () => undefined) }));
jest.mock("../escopoRotas", () => ({ exigirGeral: jest.fn(() => ({ membroId: 5 })) }));
jest.mock("../auth", () => ({ ...jest.requireActual("../auth"), exigirFatorRecente: () => true }));

const { registrarAuditoria } = require("../auditoria");
const mc = require("../menoresConsentimento");
const handler = require("../../ExecutarExclusaoLGPD/index.js");

const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const escritas = () => mockConsultas.filter((c) => /^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.test(c.sql));
async function chamar() {
  const context = { bindingData: { id: "9" }, log: Object.assign(() => {}, { error() {} }) };
  await handler(context, { method: "POST", headers: {}, body: {} });
  return context.res;
}
function mundo() {
  quando(/SELECT \* FROM SolicitacoesTitularLGPD/, [{ SolicitacaoId: 9, Tipo: "EXCLUSAO", Status: "PENDENTE", MembroId: 30 }]);
  quando(/SELECT Telefone, Email, Endereco, FotoUrl FROM MembroReferencia/, [{ Telefone: "91 9", Email: null, Endereco: null, FotoUrl: null }]);
  quando(/UPDATE SolicitacoesTitularLGPD SET Status = 'ATENDIDA'/, [], 1);
  quando(/DELETE FROM CheckinInfantilSaude WHERE MenorMembroId = @mat/, [{ n: 1 }]);
  quando(/UPDATE CheckinInfantilRegistros SET SaudeTexto = NULL/, [{ n: 2 }]);
  // só a SAUDE_CRACHA ainda concedia (a última linha da IMAGEM já era revogação): o INSERT ... SELECT grava 1 linha para ela e 0 para a imagem
  quando(/INSERT INTO MinisterioMenoresConsentimentos/, (i) => [{ n: i.f === "SAUDE_CRACHA" ? 1 : 0 }]);
  quando(/UPDATE CheckinInfantilAutorizados SET RevogadoEm = SYSUTCDATETIME\(\)/, [{ n: 1 }]);
}
beforeEach(() => { mockRegras = []; mockConsultas = []; mockEventos = []; jest.clearAllMocks(); });

describe("a exclusão LGPD alcança o check-in infantil", () => {
  test("apaga a saúde da criança e as cópias, revoga o consentimento do responsável e as autorizações de retirada — tudo DENTRO da transação, antes do commit", async () => {
    mundo();
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sucesso: true, saudeApagada: true, consentimentosRevogados: ["SAUDE_CRACHA"], autorizacoesRevogadas: 1 });
    expect(r.body.mensagem).toMatch(/Dado de saúde do check-in infantil apagado/);
    expect(r.body.mensagem).toMatch(/prova de custódia, 5 anos/);
    const saude = escritas().find((c) => /DELETE FROM CheckinInfantilSaude/.test(c.sql));
    const copias = escritas().find((c) => /UPDATE CheckinInfantilRegistros/.test(c.sql));
    const consent = escritas().filter((c) => /INSERT INTO MinisterioMenoresConsentimentos/.test(c.sql));
    const autorizados = escritas().find((c) => /UPDATE CheckinInfantilAutorizados/.test(c.sql));
    for (const c of [saude, copias, autorizados, ...consent]) expect(c.tx).toBe(true);
    expect(mockEventos).toEqual(["begin", "commit"]);
    expect(saude.inputs).toEqual({ mat: 30 });
    // as cópias: só as colunas de saúde (o gatilho TR_CheckinRegistros_Protegido não deixa mexer no resto), e nada de anonimizar ou apagar o registro de custódia
    expect(copias.sql).toMatch(/SET SaudeTexto = NULL, SaudeOrigem = NULL, SaudeTextoVersao = NULL, SaudeTextoHash = NULL\s+WHERE MenorMembroId = @mat AND SaudeTexto IS NOT NULL/);
    // (v7.11: a exclusão também anonimiza o cuidado pastoral — CuidadoItens, CuidadoEventos, PedidosOracao —, e a v7.12 as entregas de comunicados — ComunicacaoEntregas —,
    // que não são registro de custódia; a v7.14, as sugestões e artes da identidade visual)
    expect(escritas().filter((c) => !/CuidadoItens|CuidadoEventos|PedidosOracao|NotasPastorais|ComunicacaoEntregas|ComunicacaoConsentimentos|IdentidadeSugestoes|IdentidadeArtes/.test(c.sql)).some((c) => /AnonimizadoEm|DELETE FROM CheckinInfantilRegistros|TrouxeNome|RetiradoNome/.test(c.sql))).toBe(false);
    // o consentimento: as duas finalidades, a linha só entra se a ÚLTIMA concede, com o texto vigente; ficha registrada pelo Encarregado, ou o próprio responsável se for ele
    expect(consent.map((c) => c.inputs.f)).toEqual(["IMAGEM", "SAUDE_CRACHA"]);
    const s = consent[1];
    expect(s.inputs).toMatchObject({ mn: 30, por: 5, ver: mc.textoDe("SAUDE_CRACHA").versao, h: mc.textoDe("SAUDE_CRACHA").hash, ip: mc.IP_INDISPONIVEL });
    expect(s.inputs.ref).toMatch(/Solicitação LGPD 9/);
    expect(s.sql).toMatch(/u\.Concedido = 1 AND u\.ConsentimentoId = \(SELECT MAX\(x\.ConsentimentoId\)/);
    expect(s.sql).toMatch(/CASE WHEN u\.ResponsavelMembroId = @por THEN N'CLICK_RESP' ELSE N'FICHA_FISICA' END/);
    expect(autorizados.sql).toMatch(/WHERE AutorizadoMembroId = @mat AND RevogadoEm IS NULL/);
    expect(autorizados.inputs).toEqual({ mat: 30, por: 5 });
    // a auditoria leva só o que foi feito, nunca o texto da saúde
    const aud = registrarAuditoria.mock.calls.map((c) => c[0]).find((a) => a.tabela === "CheckinInfantilSaude");
    expect(aud.dadosDepois).toEqual({ saudeApagada: true, consentimentosRevogados: ["SAUDE_CRACHA"], autorizacoesRevogadas: 1, motivo: "EXCLUSAO_LGPD" });
  });
  test("se qualquer passo do check-in falha, NADA fica (rollback): nem o contato anonimizado, nem a solicitação atendida", async () => {
    mundo();
    mockRegras.unshift([/UPDATE CheckinInfantilAutorizados/, new Error("falha no banco")]);
    const r = await chamar();
    expect(r.status).toBe(500);
    expect(mockEventos).toEqual(["begin", "rollback"]);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("titular sem nada no check-in: a exclusão segue igual, sem auditoria do check-in e sem frase de saúde", async () => {
    mundo();
    mockRegras.unshift([/DELETE FROM CheckinInfantilSaude/, [{ n: 0 }]], [/UPDATE CheckinInfantilRegistros/, [{ n: 0 }]], [/INSERT INTO MinisterioMenoresConsentimentos/, [{ n: 0 }]], [/UPDATE CheckinInfantilAutorizados/, [{ n: 0 }]]);
    const r = await chamar();
    expect(r.body).toMatchObject({ sucesso: true, saudeApagada: false, consentimentosRevogados: [], autorizacoesRevogadas: 0 });
    expect(r.body.mensagem).not.toMatch(/saúde/);
    expect(registrarAuditoria.mock.calls.some((c) => c[0].tabela === "CheckinInfantilSaude")).toBe(false);
  });
});
