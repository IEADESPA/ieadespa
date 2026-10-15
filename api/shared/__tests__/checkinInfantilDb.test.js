// A camada de banco do check-in infantil (v7.10) com o banco simulado pelo TEXTO da consulta: o que cada função grava, avisa e recusa. O comportamento contra o SQL Server de
// verdade (gatilhos, CHECK, índices únicos, transações, corridas) é coberto pelos roteiros ponta a ponta (tools/e2e-localdb, e2e-18 em diante).
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => {
  const rodar = async (texto, inputs) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor, afetadas] of mockRegras) {
      if (padrao.test(texto)) {
        const v = typeof valor === "function" ? valor(inputs) : valor;
        return { recordset: v, recordsets: [], rowsAffected: [afetadas === undefined ? 1 : afetadas] };
      }
    }
    return { recordset: [], recordsets: [], rowsAffected: [/^\s*(UPDATE|DELETE)\b/i.test(texto) ? 1 : 0] };
  };
  const novaRequisicao = () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: (texto) => rodar(texto, inputs) }; return r; };
  class Transaction { async begin() { mockConsultas.push({ sql: "BEGIN", inputs: {} }); } async commit() { mockConsultas.push({ sql: "COMMIT", inputs: {} }); } async rollback() { mockConsultas.push({ sql: "ROLLBACK", inputs: {} }); } }
  class Request { constructor() { return novaRequisicao(); } }
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => ({ request: novaRequisicao }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../segredoSessao", () => ({ resolverSegredo: () => "segredo-de-teste-com-mais-de-16-caracteres" }));
jest.mock("../financeiroSeguro", () => ({ ...jest.requireActual("../financeiroSeguro"), obterTrava: jest.fn(async () => true) }));
jest.mock("../canaisDb", () => ({ ...jest.requireActual("../canaisDb"), notificarAgora: jest.fn(async () => ({ criadas: 1 })), lerPrazoDias: jest.fn(async (_p, _s, padrao) => padrao) }));
jest.mock("../ministerioMenoresDb", () => ({
  aptidaoDe: jest.fn(), aptidaoEmLote: jest.fn(), lerPrazos: jest.fn(async () => ({ adultosMinimos: 2 })), lerPrazosFaixas: jest.fn(async () => ({}))
}));
jest.mock("../menoresConsentimentoDb", () => ({ consentimentoVigente: jest.fn(async () => false) }));
jest.mock("../psc", () => ({ ...jest.requireActual("../psc"), resolverDestinatariosDaCongregacao: jest.fn(async () => [{ membroId: 900, nome: "Dirigente", email: "d@e.org" }]) }));

const { getPool } = require("../db");
const { registrarAuditoria } = require("../auditoria");
const { notificarAgora } = require("../canaisDb");
const { obterTrava } = require("../financeiroSeguro");
const mmDb = require("../ministerioMenoresDb");
const mcDb = require("../menoresConsentimentoDb");
const mc = require("../menoresConsentimento");
const ck = require("../checkinInfantil");
const db = require("../checkinInfantilDb");

const SEGREDO = "segredo-de-teste-com-mais-de-16-caracteres";
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const trocar = (padrao, valor, afetadas) => { mockRegras = mockRegras.filter(([p]) => p.source !== padrao.source); quando(padrao, valor, afetadas); };
const escritas = () => mockConsultas.filter((c) => /^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.test(c.sql));
const com = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));
const HOJE = "2026-10-18";
const AGORA = "2026-10-18T09:10";           // dentro da janela do serviço das 09:00
const SALA = { servicoId: 5, equipeId: 7, equipeNome: "Maternal", faixa: "MATERNAL", liderMembroId: 600, congregacaoId: 1, congregacaoNome: "Central", dataHora: "2026-10-18T09:00:00.000Z", servicoStatus: "PUBLICADA", equipeAtiva: true };
const APTO = { apto: true, contaComoAdulto: true, bloqueios: [] };
const apto = () => { mmDb.aptidaoDe.mockResolvedValue(APTO); mmDb.aptidaoEmLote.mockImplementation(async (_p, ids) => new Map(ids.map((i) => [Number(i), APTO]))); };

let pool;
beforeEach(async () => {
  mockRegras = []; mockConsultas = []; jest.clearAllMocks(); apto();
  mmDb.lerPrazos.mockResolvedValue({ adultosMinimos: 2 }); mmDb.lerPrazosFaixas.mockResolvedValue({});
  mcDb.consentimentoVigente.mockResolvedValue(false);
  pool = await getPool();
});

// a sala com N voluntários presentes (todos aptos) e M crianças já nela
function salaCom(presentes, criancas = 0) {
  quando(/SELECT v\.MembroId, m\.Nome, v\.EntrouEm FROM CheckinInfantilVoluntarios/, presentes.map((id) => ({ MembroId: id, Nome: `Voluntário ${id}`, EntrouEm: new Date("2026-10-18T11:55:00Z") })));
  quando(/SELECT COUNT\(\*\) AS n FROM CheckinInfantilRegistros WHERE ServicoId = @s AND EquipeId = @e AND Situacao <> 'RETIRADA'/, [{ n: criancas }]);
}
const escalado = (sim = true) => quando(/FROM EscalasAlocacoes WHERE ServicoId = @s AND EquipeId = @e AND MembroId = @m AND Status IN/, sim ? [{ x: 1 }] : []);
const presenteNaSala = (sim = true) => quando(/FROM CheckinInfantilVoluntarios WHERE ServicoId = @s AND EquipeId = @e AND MembroId = @m AND SaiuEm IS NULL/, sim ? [{ x: 1 }] : []);

describe("entrar na sala", () => {
  test("serviço não publicado e fora da janela: recusa, sem gravar nada", async () => {
    let r = await db.entrarNaSala(pool, { sala: { ...SALA, servicoStatus: "RASCUNHO" }, membroId: 10, hoje: HOJE, agoraIso: AGORA });
    expect(r.sucesso).toBe(false); expect(r.mensagem).toMatch(/não está publicado/);
    r = await db.entrarNaSala(pool, { sala: SALA, membroId: 10, hoje: HOJE, agoraIso: "2026-10-18T06:00" });
    expect(r.sucesso).toBe(false); expect(r.mensagem).toMatch(/abre 60 minutos antes/);
    r = await db.entrarNaSala(pool, { sala: SALA, membroId: 10, hoje: HOJE, agoraIso: "2026-10-18T15:00" });
    expect(r.mensagem).toMatch(/fechou/);
    expect(escritas()).toHaveLength(0);
  });
  test("quem não está escalado nem é o líder não entra; o líder entra sem escala", async () => {
    escalado(false);
    let r = await db.entrarNaSala(pool, { sala: SALA, membroId: 10, hoje: HOJE, agoraIso: AGORA });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    expect(r.mensagem).toBe(ck.MENSAGENS.SEM_ACESSO_A_SALA);
    mockConsultas = [];
    r = await db.entrarNaSala(pool, { sala: SALA, membroId: 600, hoje: HOJE, agoraIso: AGORA });
    expect(r.sucesso).toBe(true);
  });
  test("quem perdeu a habilitação hoje não entra, e a mensagem diz o que falta (visão da própria pessoa)", async () => {
    escalado();
    mmDb.aptidaoDe.mockResolvedValue({ apto: false, contaComoAdulto: false, bloqueios: [{ codigo: "ANTECEDENTES_VENCIDOS", mensagem: "A sua certidão de antecedentes venceu." }] });
    const r = await db.entrarNaSala(pool, { sala: SALA, membroId: 10, hoje: HOJE, agoraIso: AGORA });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    expect(r.mensagem).toMatch(/certidão de antecedentes venceu/);
    expect(com(/INSERT INTO CheckinInfantilVoluntarios/)).toHaveLength(0);
  });
  test("o adolescente apto é auxiliar: não opera o check-in", async () => {
    escalado();
    mmDb.aptidaoDe.mockResolvedValue({ apto: true, contaComoAdulto: false, bloqueios: [] });
    const r = await db.entrarNaSala(pool, { sala: SALA, membroId: 10, hoje: HOJE, agoraIso: AGORA });
    expect(r.sucesso).toBe(false); expect(r.mensagem).toMatch(/Só adultos/);
  });
  test("entra: grava a presença, o evento e audita só ids; entrar de novo (índice único) é 'já estava', não erro", async () => {
    escalado();
    const r = await db.entrarNaSala(pool, { sala: SALA, membroId: 10, hoje: HOJE, agoraIso: AGORA });
    expect(r).toMatchObject({ sucesso: true });
    expect(com(/INSERT INTO CheckinInfantilVoluntarios/)[0].inputs).toMatchObject({ s: 5, e: 7, m: 10 });
    expect(com(/INSERT INTO CheckinInfantilEventos/)[0].inputs).toMatchObject({ t: "VOLUNTARIO_ENTROU", a: 10 });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "CHECKIN_VOLUNTARIO_ENTROU", usuarioId: 10, dadosDepois: { servicoId: 5, equipeId: 7 } });
    mockRegras = []; mockConsultas = []; escalado();
    const e = new Error("duplicado"); e.number = 2601;
    quando(/INSERT INTO CheckinInfantilVoluntarios/, () => { throw e; });
    expect(await db.entrarNaSala(pool, { sala: SALA, membroId: 10, hoje: HOJE, agoraIso: AGORA })).toMatchObject({ sucesso: true, jaEstava: true });
  });
});

describe("sair da sala", () => {
  test("não sai se a sala ficaria fora da regra dos dois adultos com criança dentro; sai com a sala vazia", async () => {
    quando(/SELECT TOP 1 PresencaId FROM CheckinInfantilVoluntarios WITH \(UPDLOCK\)/, [{ PresencaId: 1 }]);
    salaCom([10, 11], 3);
    let r = await db.sairDaSala(pool, { sala: SALA, membroId: 10, hoje: HOJE });
    expect(r.sucesso).toBe(false); expect(r.mensagem).toMatch(/ficaria com 1 adulto/);
    expect(com(/UPDATE CheckinInfantilVoluntarios SET SaiuEm/)).toHaveLength(0);
    expect(com(/ROLLBACK/)).toHaveLength(1);
    mockConsultas = []; mockRegras = [];
    quando(/SELECT TOP 1 PresencaId FROM CheckinInfantilVoluntarios WITH \(UPDLOCK\)/, [{ PresencaId: 1 }]);
    salaCom([10, 11], 0);
    r = await db.sairDaSala(pool, { sala: SALA, membroId: 10, hoje: HOJE });
    expect(r.sucesso).toBe(true);
    expect(com(/UPDATE CheckinInfantilVoluntarios SET SaiuEm/)).toHaveLength(1);
    expect(com(/COMMIT/)).toHaveLength(1);
    expect(obterTrava).toHaveBeenCalled();
    expect(com(/INSERT INTO CheckinInfantilEventos/)[0].inputs).toMatchObject({ t: "VOLUNTARIO_SAIU", a: 10 });
  });
  test("quem não está na sala não sai; a liderança tirando outro registra quem tirou", async () => {
    quando(/SELECT TOP 1 PresencaId FROM CheckinInfantilVoluntarios WITH \(UPDLOCK\)/, []);
    salaCom([], 0);
    expect((await db.sairDaSala(pool, { sala: SALA, membroId: 10, hoje: HOJE })).sucesso).toBe(false);
    mockRegras = []; mockConsultas = [];
    quando(/SELECT TOP 1 PresencaId FROM CheckinInfantilVoluntarios WITH \(UPDLOCK\)/, [{ PresencaId: 4 }]);
    salaCom([10], 0);
    const r = await db.sairDaSala(pool, { sala: SALA, membroId: 10, porId: 77, hoje: HOJE });
    expect(r.sucesso).toBe(true);
    expect(com(/INSERT INTO CheckinInfantilEventos/)[0].inputs).toMatchObject({ t: "VOLUNTARIO_SAIU", a: 77, d: "retirado pela liderança" });
  });
  test("o adolescente auxiliar sai a qualquer hora (não conta como adulto)", async () => {
    quando(/SELECT TOP 1 PresencaId FROM CheckinInfantilVoluntarios WITH \(UPDLOCK\)/, [{ PresencaId: 9 }]);
    salaCom([10, 11, 12], 8);
    mmDb.aptidaoEmLote.mockImplementation(async (_p, ids) => new Map(ids.map((i) => [Number(i), i === 12 ? { apto: true, contaComoAdulto: false, bloqueios: [] } : APTO])));
    expect((await db.sairDaSala(pool, { sala: SALA, membroId: 12, hoje: HOJE })).sucesso).toBe(true);
  });
});

describe("check-in", () => {
  const dadosMembro = (extra = {}) => ({ servicoId: 5, equipeId: 7, criancas: [{ tipo: "MEMBRO", menorId: 30 }], trouxe: { membroId: 40 }, extras: [], ...extra });
  const criancaBanco = (extra = {}) => ({ MembroId: 30, Nome: "Caio Souza", DataNascimento: new Date("2021-03-01T00:00:00Z"), CongregacaoId: 1, ...extra });
  function prepararFeliz({ presentes = [10, 11], criancas = 0, saudeCadastrada = null, responsaveis = [40] } = {}) {
    escalado(); presenteNaSala(); salaCom(presentes, criancas);
    quando(/SELECT MembroId, Nome, DataNascimento, CongregacaoId FROM MembroReferencia WHERE MembroId IN/, [criancaBanco()]);
    quando(/SELECT MenorMembroId, ResponsavelMembroId FROM VoluntariadoResponsaveis WHERE MenorMembroId IN/, responsaveis.map((r) => ({ MenorMembroId: 30, ResponsavelMembroId: r })));
    quando(/SELECT MenorMembroId, Texto FROM CheckinInfantilSaude/, saudeCadastrada ? [{ MenorMembroId: 30, Texto: saudeCadastrada }] : []);
    quando(/SELECT Nome FROM MembroReferencia WHERE MembroId = @m/, [{ Nome: "Maria Souza" }]);
    let proximoId = 100;
    quando(/INSERT INTO CheckinInfantilRegistros/, () => [{ RegistroId: proximoId++ }]);
  }
  const checkin = (dados, extra = {}) => db.fazerCheckin(pool, { sala: SALA, operadorId: 10, dados, hoje: HOJE, agoraIso: AGORA, ...extra });

  test("o caso feliz: grava o registro, guarda SÓ o HMAC do código, devolve etiqueta e recibo, e audita só ids", async () => {
    prepararFeliz();
    const r = await checkin(dadosMembro());
    expect(r.sucesso).toBe(true);
    expect(r.etiquetas).toHaveLength(1);
    const { codigo, nome, sala } = r.etiquetas[0].etiqueta;
    expect(codigo).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(nome).toBe("Caio S.");
    expect(sala).toBe("Maternal");
    expect(r.recibo.criancas).toEqual([{ nome: "Caio S.", codigo }]);
    expect(r.recibo.trouxe).toBe("Maria Souza");
    // o INSERT leva um hash provisório e o UPDATE seguinte, o HMAC verdadeiro, atado ao id do registro e à geração 1
    const ins = com(/INSERT INTO CheckinInfantilRegistros/)[0];
    expect(ins.sql).toMatch(/REPLICATE\('0', 64\)/);
    expect(ins.inputs).toMatchObject({ s: 5, e: 7, c: 1, mn: 30, idade: 5, faixa: "MATERNAL", fora: 0, tm: 40, por: 10 });
    const upd = com(/UPDATE CheckinInfantilRegistros SET CodigoHash = @h/)[0];
    expect(upd.inputs.r).toBe(100);
    expect(ck.confereCodigo(codigo, upd.inputs.h, { registroId: 100, geracao: 1, segredo: SEGREDO })).toBe(true);
    // o texto do código não aparece em NENHUMA consulta nem na auditoria
    const tudo = JSON.stringify([mockConsultas.map((c) => c.inputs), registrarAuditoria.mock.calls]);
    expect(tudo).not.toContain(codigo);
    expect(com(/INSERT INTO CheckinInfantilEventos/)[0].inputs).toMatchObject({ r: 100, t: "CHECKIN", a: 10 });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "CHECKIN_INFANTIL_ENTREGA", usuarioId: 10, registroId: 100, dadosDepois: { servicoId: 5, equipeId: 7, tipo: "MEMBRO" } });
    expect(JSON.stringify(registrarAuditoria.mock.calls)).not.toMatch(/Caio|Souza/);
    expect(obterTrava).toHaveBeenCalledWith(expect.any(Function), "checkin-sala:5:7");
    expect(com(/COMMIT/)).toHaveLength(1);
  });
  test("a lotação é lida DENTRO da transação (com a trava) e recusa a criança que estoura a proporção", async () => {
    prepararFeliz({ presentes: [10, 11], criancas: 10 });          // 2 adultos x 5 (maternal) = 10: a 11ª não cabe
    const r = await checkin(dadosMembro());
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/no limite/);
    expect(r.lotacao.problemas[0].codigo).toBe("SALA_CHEIA");
    expect(com(/INSERT INTO CheckinInfantilRegistros/)).toHaveLength(0);
    // a recusa fica no histórico (e a transação é confirmada só para isso)
    expect(com(/INSERT INTO CheckinInfantilEventos/)[0].inputs).toMatchObject({ t: "SALA_RECUSOU_CHECKIN", a: 10 });
    expect(mockConsultas.findIndex((c) => c.sql === "BEGIN")).toBeLessThan(mockConsultas.findIndex((c) => /SELECT v\.MembroId, m\.Nome, v\.EntrouEm/.test(c.sql)));
  });
  test("um adulto só na sala: recusa (regra dos dois adultos na porta)", async () => {
    prepararFeliz({ presentes: [10] });
    const r = await checkin(dadosMembro());
    expect(r.sucesso).toBe(false); expect(r.mensagem).toMatch(/nunca fica com um adulto só/);
  });
  test("sala sem faixa não recebe criança", async () => {
    prepararFeliz();
    const r = await db.fazerCheckin(pool, { sala: { ...SALA, faixa: null }, operadorId: 10, dados: dadosMembro(), hoje: HOJE, agoraIso: AGORA });
    expect(r.sucesso).toBe(false); expect(r.mensagem).toMatch(/faixa etária/);
  });
  test("quem opera precisa estar apto, escalado E dentro da sala; fora da janela nem consulta o resto", async () => {
    prepararFeliz();
    presenteNaSala(false);
    mockRegras = mockRegras.filter(([p]) => !/SaiuEm IS NULL/.test(p.source) || /SELECT v/.test(p.source));
    presenteNaSala(false);
    let r = await checkin(dadosMembro());
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    expect(r.mensagem).toMatch(/Entre na sala primeiro/);
    r = await checkin(dadosMembro(), { agoraIso: "2026-10-18T20:00" });
    expect(r.sucesso).toBe(false); expect(r.mensagem).toMatch(/fechou/);
    expect(com(/INSERT INTO CheckinInfantilRegistros/)).toHaveLength(0);
  });
  test("a criança precisa ser do cadastro e da congregação da sala, menor e com nascimento conhecido; quem trouxe precisa ser responsável cadastrado dela", async () => {
    prepararFeliz();
    quando(/SELECT MembroId, Nome, DataNascimento, CongregacaoId FROM MembroReferencia WHERE MembroId IN/, [criancaBanco({ CongregacaoId: 2 })]);
    mockRegras.unshift(mockRegras.pop());
    let r = await checkin(dadosMembro());
    expect(r).toMatchObject({ sucesso: false, mensagem: ck.MENSAGENS.CRIANCA_NAO_ACHADA });
    mockRegras = []; prepararFeliz();
    quando(/SELECT MembroId, Nome, DataNascimento, CongregacaoId FROM MembroReferencia WHERE MembroId IN/, [criancaBanco({ DataNascimento: null })]);
    mockRegras.unshift(mockRegras.pop());
    r = await checkin(dadosMembro());
    expect(r.mensagem).toMatch(/não tem a data de nascimento/);
    mockRegras = []; prepararFeliz();
    quando(/SELECT MembroId, Nome, DataNascimento, CongregacaoId FROM MembroReferencia WHERE MembroId IN/, [criancaBanco({ DataNascimento: new Date("2000-01-01T00:00:00Z") })]);
    mockRegras.unshift(mockRegras.pop());
    r = await checkin(dadosMembro());
    expect(r.mensagem).toMatch(/menos de 18 anos/);
    mockRegras = []; prepararFeliz({ responsaveis: [41] });
    r = await checkin(dadosMembro());
    expect(r.sucesso).toBe(false); expect(r.mensagem).toMatch(/não é responsável cadastrado/);
    expect(com(/INSERT INTO CheckinInfantilRegistros/)).toHaveLength(0);
  });
  test("a criança que já está numa sala (índice único) é recusada com a mensagem certa e a transação desfeita", async () => {
    prepararFeliz();
    mockRegras = mockRegras.filter(([p]) => !/INSERT INTO CheckinInfantilRegistros/.test(p.source));
    const e = new Error("duplicado"); e.number = 2601;
    quando(/INSERT INTO CheckinInfantilRegistros/, () => { throw e; });
    const r = await checkin(dadosMembro());
    expect(r).toMatchObject({ sucesso: false });
    expect(r.mensagem).toMatch(/já está numa sala/);
    expect(com(/ROLLBACK/)).toHaveLength(1);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("saúde: a cadastrada só vai para a etiqueta com o consentimento VIGENTE; sem ele, nada sai", async () => {
    prepararFeliz({ saudeCadastrada: "alergia a amendoim" });
    let r = await checkin(dadosMembro());
    expect(r.etiquetas[0].etiqueta.saude).toBeNull();
    expect(com(/INSERT INTO CheckinInfantilRegistros/)[0].inputs).toMatchObject({ st: null, so: null });
    mockRegras = []; mockConsultas = []; mcDb.consentimentoVigente.mockResolvedValue(true);
    prepararFeliz({ saudeCadastrada: "alergia a amendoim" });
    r = await checkin(dadosMembro());
    expect(r.etiquetas[0].etiqueta.saude).toBe("alergia a amendoim");
    expect(com(/INSERT INTO CheckinInfantilRegistros/)[0].inputs).toMatchObject({ st: "alergia a amendoim", so: "CADASTRO", sv: null, sh: null });
    expect(mcDb.consentimentoVigente).toHaveBeenCalledWith(expect.anything(), 30, "SAUDE_CRACHA", expect.anything());
    expect(JSON.stringify(registrarAuditoria.mock.calls)).not.toMatch(/amendoim/);
  });
  test("visitante: nome e nascimento só no registro, quem trouxe com documento e telefone, e a saúde do balcão com o hash do texto", async () => {
    escalado(); presenteNaSala(); salaCom([10, 11], 0);
    quando(/INSERT INTO CheckinInfantilRegistros/, () => [{ RegistroId: 55 }]);
    const t = mc.textoDe("SAUDE_CRACHA");
    const dados = { servicoId: 5, equipeId: 7, trouxe: { nome: "Paula Lima", parentesco: "MAE", documento: "RG", contato: "94991112222" }, extras: [{ nome: "Carla Dias", parentesco: "TIO" }],
      criancas: [{ tipo: "VISITANTE", nome: "Davi Lima", nascimento: "2019-03-02", idade: 7, saude: { texto: "asma leve", textoHash: t.hash } }] };
    const r = await checkin(dados);
    expect(r.sucesso).toBe(true);
    expect(r.recibo.trouxe).toBe("Paula Lima");
    expect(com(/INSERT INTO CheckinInfantilRegistros/)[0].inputs).toMatchObject({ mn: null, vn: "Davi Lima", vd: "2019-03-02", idade: 7, fora: 1, tm: null, tn: "Paula Lima", tp: "MAE", tc: "94991112222", td: "RG", st: "asma leve", so: "BALCAO", sv: t.versao, sh: t.hash });
    expect(com(/INSERT INTO CheckinInfantilAutorizadosVisita/)[0].inputs).toMatchObject({ r: 55, n: "Carla Dias", p: "TIO" });
    // hash de texto que a tela NÃO mostrou: recusa, e ninguém é gravado
    mockConsultas = [];
    const ruim = await checkin({ ...dados, criancas: [{ ...dados.criancas[0], saude: { texto: "asma leve", textoHash: "0".repeat(64) } }] });
    expect(ruim).toMatchObject({ sucesso: false, termoMudou: true });
    expect(com(/INSERT INTO CheckinInfantilRegistros/)).toHaveLength(0);
  });
  test("duas crianças na mesma família: dois registros, dois códigos diferentes", async () => {
    prepararFeliz();
    quando(/SELECT MembroId, Nome, DataNascimento, CongregacaoId FROM MembroReferencia WHERE MembroId IN/, [criancaBanco(), criancaBanco({ MembroId: 31, Nome: "Dara Souza" })]);
    mockRegras.unshift(mockRegras.pop());
    quando(/SELECT MenorMembroId, ResponsavelMembroId FROM VoluntariadoResponsaveis WHERE MenorMembroId IN/, [{ MenorMembroId: 30, ResponsavelMembroId: 40 }, { MenorMembroId: 31, ResponsavelMembroId: 40 }]);
    mockRegras.unshift(mockRegras.pop());
    const r = await checkin(dadosMembro({ criancas: [{ tipo: "MEMBRO", menorId: 30 }, { tipo: "MEMBRO", menorId: 31 }] }));
    expect(r.sucesso).toBe(true);
    expect(r.etiquetas).toHaveLength(2);
    expect(r.etiquetas[0].etiqueta.codigo).not.toBe(r.etiquetas[1].etiqueta.codigo);
    expect(com(/UPDATE CheckinInfantilRegistros SET CodigoHash/).map((c) => c.inputs.r)).toEqual([100, 101]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------

describe("retirada", () => {
  const CODIGO = "AB3K9Z";
  const hashDe = (geracao = 1, id = 9) => ck.hashCodigo(CODIGO, { registroId: id, geracao, segredo: SEGREDO });
  const registro = (extra = {}) => ({ RegistroId: 9, ServicoId: 5, EquipeId: 7, CongregacaoId: 1, MenorMembroId: 30, VisitanteNome: null, IdadeAnos: 5, FaixaSala: "MATERNAL", IdadeForaDaFaixa: 0, TrouxeMembroId: 40, TrouxeNome: null, TrouxeNomeResolvido: "Maria Souza",
    TrouxeParentesco: null, SaudeTexto: null, CodigoGeracao: 1, Tentativas: 0, Travado: 0, Situacao: "NA_SALA", EntregueEm: new Date(), EntreguePorMembroId: 10, CriancaNome: "Caio Souza", CodigoHash: hashDe(), ...extra });
  const dados = (extra = {}) => ({ registroId: 9, codigo: CODIGO, retirante: { ref: "RESP:40" }, ...extra });
  function preparar({ reg = registro(), tentativa = { tentativas: 1, hash: hashDe(), geracao: 1 } } = {}) {
    escalado(); presenteNaSala();
    quando(/WHERE r\.RegistroId = @r/, [reg]);
    quando(/SELECT r\.MenorMembroId, r\.ResponsavelMembroId, r\.Vinculo, p\.Nome FROM VoluntariadoResponsaveis/, [{ MenorMembroId: 30, ResponsavelMembroId: 40, Vinculo: "MAE", Nome: "Maria Souza" }]);
    quando(/FROM CheckinInfantilAutorizados\s+WHERE MenorMembroId IN/, []);
    quando(/FROM CheckinInfantilAutorizadosVisita WHERE RegistroId IN/, []);
    quando(/UPDATE CheckinInfantilRegistros SET Tentativas = Tentativas \+ 1/, tentativa ? [tentativa] : []);
  }
  const retirar = (d = dados(), extra = {}) => db.retirar(pool, { sala: SALA, registroId: 9, operadorId: 10, dados: d, hoje: HOJE, ...extra });

  test("código certo e pessoa da lista: a criança sai, só vale se ainda está na sala com a MESMA geração do código, e a tentativa é zerada", async () => {
    preparar();
    quando(/UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA'/, [{ n: 1 }]);
    const r = await retirar();
    expect(r).toMatchObject({ sucesso: true, retirada: true });
    const up = com(/UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA'/)[0];
    expect(up.sql).toMatch(/WHERE RegistroId = @r AND Situacao = 'NA_SALA' AND Travado = 0 AND CodigoGeracao = @g/);
    expect(up.sql).toMatch(/Tentativas = 0/);
    expect(up.inputs).toMatchObject({ r: 9, g: 1, tp: "RESPONSAVEL", mm: 40, nm: null, op: 10 });
    expect(com(/INSERT INTO CheckinInfantilEventos/)[0].inputs).toMatchObject({ r: 9, t: "RETIRADA", a: 10, d: "RESPONSAVEL" });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "CHECKIN_INFANTIL_RETIRADA", usuarioId: 10 });
    expect(JSON.stringify([mockConsultas.map((c) => c.inputs), registrarAuditoria.mock.calls])).not.toContain(CODIGO);
    expect(notificarAgora).not.toHaveBeenCalled();
  });
  test("a tentativa é RESERVADA antes de conferir (UPDATE com contagem e teto), e o código errado fica no histórico com o número da tentativa", async () => {
    preparar({ tentativa: { tentativas: 2, hash: hashDe(), geracao: 1 } });
    const r = await retirar(dados({ codigo: "ZZZZZZ" }));
    expect(r).toMatchObject({ sucesso: false, codigoErrado: true, tentativasRestantes: 3 });
    const reserva = com(/UPDATE CheckinInfantilRegistros SET Tentativas = Tentativas \+ 1/)[0];
    expect(reserva.sql).toMatch(/WHERE RegistroId = @r AND Situacao = 'NA_SALA' AND Travado = 0 AND Tentativas < @max/);
    expect(reserva.inputs.max).toBe(5);
    expect(com(/INSERT INTO CheckinInfantilEventos/)[0].inputs).toMatchObject({ r: 9, t: "CODIGO_ERRADO", a: 10, d: "tentativa=2/5" });
    expect(com(/SET Situacao = 'RETIRADA'/)).toHaveLength(0);
  });
  test("o quinto erro TRAVA a criança e a mensagem manda chamar a liderança ou emitir a segunda via", async () => {
    preparar({ tentativa: { tentativas: 5, hash: hashDe(), geracao: 1 } });
    const r = await retirar(dados({ codigo: "ZZZZZZ" }));
    expect(r).toMatchObject({ sucesso: false, codigoErrado: true, travada: true });
    expect(r.mensagem).toMatch(/travada depois de 5 erros/);
    expect(com(/UPDATE CheckinInfantilRegistros SET Travado = 1/)).toHaveLength(1);
    expect(com(/INSERT INTO CheckinInfantilEventos/).map((c) => c.inputs.t)).toEqual(["CODIGO_ERRADO", "CRIANCA_TRAVADA"]);
  });
  test("o código da geração ANTIGA não confere depois da segunda via", async () => {
    preparar({ tentativa: { tentativas: 1, hash: ck.hashCodigo("NQVX23", { registroId: 9, geracao: 2, segredo: SEGREDO }), geracao: 2 } });     // o banco já está na geração 2, com OUTRO código; o AB3K9Z era da geração 1
    const r = await retirar();
    expect(r).toMatchObject({ sucesso: false, codigoErrado: true });
  });
  test("o código de OUTRA criança não serve (o HMAC é atado ao registro)", async () => {
    preparar({ tentativa: { tentativas: 1, hash: ck.hashCodigo(CODIGO, { registroId: 99, geracao: 1, segredo: SEGREDO }), geracao: 1 } });
    expect((await retirar()).codigoErrado).toBe(true);
  });
  test("código com formato inválido nem chega ao banco: o decorrente não gasta tentativa", async () => {
    // (a validação do formato é da rota; aqui garantimos que classificar a pessoa errada também NÃO gasta tentativa)
    preparar();
    const r = await retirar(dados({ retirante: { ref: "RESP:99" } }));
    expect(r.sucesso).toBe(false); expect(r.mensagem).toMatch(/não está na lista/);
    expect(com(/UPDATE CheckinInfantilRegistros SET Tentativas/)).toHaveLength(0);
  });
  test("criança travada, já retirada ou com pedido pendente: recusa SEM consultar a lista nem gastar tentativa", async () => {
    for (const [extra, padrao] of [[{ Travado: 1 }, /travada/], [{ Situacao: "RETIRADA" }, /já foi retirada/], [{ Situacao: "RETIRADA_PENDENTE" }, /aguardando a aprovação/]]) {
      mockRegras = []; mockConsultas = [];
      preparar({ reg: registro(extra) });
      const r = await retirar();
      expect(r.sucesso).toBe(false); expect(r.mensagem).toMatch(padrao);
      expect(com(/UPDATE CheckinInfantilRegistros SET Tentativas/)).toHaveLength(0);
    }
  });
  test("corrida: quando a reserva não passa (alguém travou ou retirou no meio), a resposta é travada ou 'mudou', nunca sucesso", async () => {
    preparar({ tentativa: null });
    quando(/WHERE r\.RegistroId = @r/, [registro({ Travado: 1 })]);
    mockRegras.unshift(mockRegras.pop());
    // primeiro a leitura inicial mostra a criança livre; a segunda (depois da reserva recusada) mostra travada
    let leituras = 0;
    mockRegras = mockRegras.filter(([p]) => !/RegistroId = @r/.test(p.source) || /SET Tentativas/.test(p.source));
    quando(/WHERE r\.RegistroId = @r/, () => [registro(leituras++ === 0 ? {} : { Travado: 1 })]);
    let r = await retirar();
    expect(r).toMatchObject({ sucesso: false, travada: true });
    leituras = 5;
    mockRegras = mockRegras.filter(([p]) => !/RegistroId = @r/.test(p.source) || /SET Tentativas/.test(p.source));
    let n = 0;
    quando(/WHERE r\.RegistroId = @r/, () => [registro(n++ === 0 ? {} : { Situacao: "RETIRADA" })]);
    r = await retirar();
    expect(r).toMatchObject({ sucesso: false, mudou: true });
  });
  test("código certo mas a criança mudou de estado entre a conferência e a gravação: 'mudou', sem entregar", async () => {
    preparar();
    quando(/UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA'/, [{ n: 0 }]);
    const r = await retirar();
    expect(r).toMatchObject({ sucesso: false, mudou: true });
    expect(com(/INSERT INTO CheckinInfantilEventos/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("quem não está na lista é DIVERGENTE: com o código certo vira pedido para a liderança, avisa os responsáveis (com o primeiro nome) e a gestão (sem nome de criança)", async () => {
    preparar();
    quando(/SELECT TOP 1 EventoId FROM CheckinInfantilEventos/, [{ EventoId: 321 }]);
    quando(/UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA_PENDENTE'/, [{ n: 1 }]);
    quando(/SELECT p\.MembroId, p\.Nome, p\.Email FROM VoluntariadoResponsaveis/, [{ MembroId: 40, Nome: "Maria Souza", Email: "maria@e.org" }]);
    quando(/SELECT MembroId, Nome, Email FROM MembroReferencia WHERE MembroId = @m/, [{ MembroId: 600, Nome: "Líder", Email: "l@e.org" }]);
    const r = await retirar(dados({ retirante: { outro: { nome: "Roberto Dias", parentesco: "AMIGO_FAMILIA", documento: "CNH" } } }));
    expect(r).toMatchObject({ sucesso: true, divergente: true, aguardaLideranca: true });
    expect(com(/SET Situacao = 'RETIRADA'/)).toHaveLength(0);
    const up = com(/SET Situacao = 'RETIRADA_PENDENTE'/)[0];
    expect(up.inputs).toMatchObject({ nm: "Roberto Dias", pa: "AMIGO_FAMILIA", dc: "CNH", op: 10, g: 1 });
    expect(com(/INSERT INTO CheckinInfantilEventos/)[0].inputs.t).toBe("RETIRADA_DIVERGENTE_PEDIDA");
    expect(notificarAgora).toHaveBeenCalledTimes(2);
    const [pais, gestao] = notificarAgora.mock.calls.map((c) => c[1]);
    expect(pais).toMatchObject({ regraChave: "CHECKIN_RETIRADA_DIVERGENTE", referenciaId: 321, referenciaTabela: "CheckinInfantilEventos" });
    expect(pais.destinatarios.map((d) => d.membroId)).toEqual([40]);
    expect(pais.mensagem).toMatch(/Caio/); expect(pais.mensagem).not.toMatch(/Souza/);
    expect(gestao.destinatarios.map((d) => d.membroId).sort()).toEqual([600, 900]);
    expect(gestao.mensagem).not.toMatch(/Caio|Souza/);
    expect(JSON.stringify(registrarAuditoria.mock.calls)).not.toMatch(/Roberto|Caio|Souza/);
  });
  test("a pessoa que foi quem trouxe a criança pode retirá-la (sem ser responsável cadastrada), e a lista fixa e a da visita valem", async () => {
    preparar({ reg: registro({ MenorMembroId: null, VisitanteNome: "Davi Lima", TrouxeMembroId: null, TrouxeNome: "Paula Lima", TrouxeNomeResolvido: "Paula Lima", TrouxeParentesco: "MAE" }) });
    trocar(/FROM CheckinInfantilAutorizadosVisita WHERE RegistroId IN/, [{ AutorizadoVisitaId: 7, RegistroId: 9, Nome: "Carla Dias", Parentesco: "TIO" }]);
    quando(/UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA'/, [{ n: 1 }]);
    expect((await retirar(dados({ retirante: { ref: "TROUXE" } }))).retirada).toBe(true);
    expect(com(/SET Situacao = 'RETIRADA'/)[0].inputs).toMatchObject({ tp: "TROUXE", mm: null, nm: "Paula Lima" });
    mockConsultas = [];
    expect((await retirar(dados({ retirante: { ref: "VIS:7" } }))).retirada).toBe(true);
    expect(com(/SET Situacao = 'RETIRADA'/)[0].inputs).toMatchObject({ tp: "AUTORIZADO", nm: "Carla Dias" });
  });
  test("quem retira precisa ser operador apto e estar na sala: sem isso, nenhuma tentativa é gasta", async () => {
    preparar(); presenteNaSala(false);
    mockRegras = mockRegras.filter(([p]) => !/SaiuEm IS NULL/.test(p.source));
    presenteNaSala(false);
    const r = await retirar();
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    expect(com(/UPDATE CheckinInfantilRegistros/)).toHaveLength(0);
  });
  test("a criança de outra sala não é retirada por esta sala", async () => {
    preparar({ reg: registro({ EquipeId: 8 }) });
    expect(await retirar()).toMatchObject({ sucesso: false, naoAchou: true });
  });
});

describe("decisão da retirada divergente", () => {
  const pendente = (extra = {}) => ({ RegistroId: 9, ServicoId: 5, EquipeId: 7, Situacao: "RETIRADA_PENDENTE", RetiradoPorOperadorId: 10, CriancaNome: "Caio Souza", ...extra });
  test("quem pediu não decide; só decide o que está pendente", async () => {
    quando(/WHERE r\.RegistroId = @r/, [pendente()]);
    let r = await db.decidirDivergencia(pool, { sala: SALA, registroId: 9, gestorId: 10, aprovar: true, motivo: "Liguei para a mãe e ela confirmou." });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    expect(escritas()).toHaveLength(0);
    mockRegras = [];
    quando(/WHERE r\.RegistroId = @r/, [pendente({ Situacao: "NA_SALA" })]);
    r = await db.decidirDivergencia(pool, { sala: SALA, registroId: 9, gestorId: 77, aprovar: true, motivo: "Liguei para a mãe e ela confirmou." });
    expect(r).toMatchObject({ sucesso: false, mudou: true });
  });
  test("aprovar: a criança sai (só se ainda pendente), com quem decidiu e o motivo; o histórico e a auditoria não levam o motivo", async () => {
    quando(/WHERE r\.RegistroId = @r/, [pendente()]);
    quando(/UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA'/, [{ n: 1 }]);
    const r = await db.decidirDivergencia(pool, { sala: SALA, registroId: 9, gestorId: 77, aprovar: true, motivo: "Liguei para a mãe e ela confirmou." });
    expect(r).toMatchObject({ sucesso: true, aprovada: true });
    const up = com(/SET Situacao = 'RETIRADA'/)[0];
    expect(up.sql).toMatch(/WHERE RegistroId = @r AND Situacao = 'RETIRADA_PENDENTE'/);
    expect(up.inputs).toMatchObject({ r: 9, g: 77, m: "Liguei para a mãe e ela confirmou." });
    expect(com(/INSERT INTO CheckinInfantilEventos/)[0].inputs).toMatchObject({ t: "RETIRADA_DIVERGENTE_APROVADA", a: 77 });
    expect(JSON.stringify([com(/INSERT INTO CheckinInfantilEventos/).map((c) => c.inputs), registrarAuditoria.mock.calls])).not.toMatch(/Liguei/);
  });
  test("negar: a criança volta para a sala, limpando quem pediu, e o código continua valendo", async () => {
    quando(/WHERE r\.RegistroId = @r/, [pendente()]);
    quando(/UPDATE CheckinInfantilRegistros SET Situacao = 'NA_SALA'/, [{ n: 1 }]);
    const r = await db.decidirDivergencia(pool, { sala: SALA, registroId: 9, gestorId: 77, aprovar: false, motivo: "A mãe não conhece essa pessoa." });
    expect(r).toMatchObject({ sucesso: true, negada: true });
    const up = com(/SET Situacao = 'NA_SALA'/)[0];
    expect(up.sql).toMatch(/Divergente = 0, DivergenciaPedidaEm = NULL/);
    expect(up.sql).not.toMatch(/CodigoHash/);
    expect(com(/INSERT INTO CheckinInfantilEventos/)[0].inputs.t).toBe("RETIRADA_DIVERGENTE_NEGADA");
  });
  test("duas decisões ao mesmo tempo: só uma vence (a segunda recebe 'mudou')", async () => {
    quando(/WHERE r\.RegistroId = @r/, [pendente()]);
    quando(/UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA'/, [{ n: 0 }]);
    expect(await db.decidirDivergencia(pool, { sala: SALA, registroId: 9, gestorId: 77, aprovar: true, motivo: "Confirmado pelo telefone." })).toMatchObject({ sucesso: false, mudou: true });
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("destravar só funciona em criança travada e fica no histórico", async () => {
    quando(/WHERE r\.RegistroId = @r/, [pendente({ Situacao: "NA_SALA" })]);
    quando(/UPDATE CheckinInfantilRegistros SET Travado = 0, Tentativas = 0/, [{ n: 1 }]);
    expect(await db.destravar(pool, { sala: SALA, registroId: 9, gestorId: 77 })).toMatchObject({ sucesso: true });
    expect(com(/INSERT INTO CheckinInfantilEventos/)[0].inputs).toMatchObject({ t: "CRIANCA_DESTRAVADA", a: 77 });
    mockRegras = mockRegras.filter(([p]) => !/SET Travado = 0/.test(p.source));
    quando(/UPDATE CheckinInfantilRegistros SET Travado = 0, Tentativas = 0/, [{ n: 0 }]);
    expect(await db.destravar(pool, { sala: SALA, registroId: 9, gestorId: 77 })).toMatchObject({ sucesso: false, mudou: true });
  });
});

describe("segunda via do código (dois olhares)", () => {
  const reg = (extra = {}) => ({ RegistroId: 9, ServicoId: 5, EquipeId: 7, MenorMembroId: 30, TrouxeMembroId: 40, TrouxeNomeResolvido: "Maria Souza", CodigoGeracao: 1, Situacao: "NA_SALA", CriancaNome: "Caio Souza", IdadeAnos: 5, SaudeTexto: null, ...extra });
  function preparar(r = reg()) {
    escalado(); presenteNaSala();
    quando(/WHERE r\.RegistroId = @r/, [r]);
    quando(/SELECT r\.MenorMembroId, r\.ResponsavelMembroId, r\.Vinculo, p\.Nome FROM VoluntariadoResponsaveis/, [{ MenorMembroId: 30, ResponsavelMembroId: 40, Vinculo: "MAE", Nome: "Maria Souza" }]);
  }
  test("pedir: só para quem está na lista, com o documento conferido; quem não está passa pela divergência", async () => {
    preparar();
    quando(/INSERT INTO CheckinInfantilSegundasVias/, [{ ViaId: 3 }]);
    const dados = (ref) => ({ registroId: 9, pessoa: ck.lerRefPessoa(ref), documento: "RG" });
    let r = await db.pedirSegundaVia(pool, { sala: SALA, operadorId: 10, dados: dados("RESP:40"), hoje: HOJE });
    expect(r).toMatchObject({ sucesso: true, viaId: 3 });
    expect(com(/INSERT INTO CheckinInfantilSegundasVias/)[0].inputs).toMatchObject({ r: 9, op: 10, tp: "RESPONSAVEL", pm: 40, dc: "RG" });
    expect(com(/INSERT INTO CheckinInfantilEventos/)[0].inputs.t).toBe("SEGUNDA_VIA_PEDIDA");
    expect(com(/UPDATE CheckinInfantilSegundasVias SET CanceladaEm/)).toHaveLength(1);      // um pedido velho sem confirmação é cancelado (nada se apaga)
    mockConsultas = [];
    r = await db.pedirSegundaVia(pool, { sala: SALA, operadorId: 10, dados: dados("RESP:99"), hoje: HOJE });
    expect(r.sucesso).toBe(false); expect(r.mensagem).toMatch(/não está na lista/);
    expect(com(/INSERT INTO CheckinInfantilSegundasVias/)).toHaveLength(0);
  });
  test("já há um pedido aguardando (índice único): mensagem, não erro; criança já retirada não tem segunda via", async () => {
    preparar();
    const e = new Error("duplicado"); e.number = 2601;
    quando(/INSERT INTO CheckinInfantilSegundasVias/, () => { throw e; });
    expect((await db.pedirSegundaVia(pool, { sala: SALA, operadorId: 10, dados: { registroId: 9, pessoa: ck.lerRefPessoa("RESP:40"), documento: "RG" }, hoje: HOJE })).mensagem).toMatch(/Já há um pedido/);
    mockRegras = []; preparar(reg({ Situacao: "RETIRADA" }));
    expect((await db.pedirSegundaVia(pool, { sala: SALA, operadorId: 10, dados: { registroId: 9, pessoa: ck.lerRefPessoa("RESP:40"), documento: "RG" }, hoje: HOJE })).mensagem).toMatch(/já foi retirada/);
  });
  test("confirmar: quem pediu não confirma; sem pedido válido (ou passado de 10 minutos) recusa", async () => {
    preparar();
    quando(/SELECT TOP 1 ViaId, PedidaPorMembroId FROM CheckinInfantilSegundasVias/, [{ ViaId: 3, PedidaPorMembroId: 10 }]);
    let r = await db.confirmarSegundaVia(pool, { sala: SALA, operadorId: 10, registroId: 9, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    mockRegras = mockRegras.filter(([p]) => !/SELECT TOP 1 ViaId/.test(p.source));
    quando(/SELECT TOP 1 ViaId, PedidaPorMembroId FROM CheckinInfantilSegundasVias/, []);
    r = await db.confirmarSegundaVia(pool, { sala: SALA, operadorId: 11, registroId: 9, hoje: HOJE });
    expect(r.sucesso).toBe(false); expect(r.mensagem).toMatch(/Não há pedido de segunda via/);
    expect(com(/SET CodigoHash = @h, CodigoGeracao/)).toHaveLength(0);
  });
  test("confirmar por OUTRO adulto: o código novo (geração 2) sai UMA vez, o antigo morre, os responsáveis são avisados e nada leva o código", async () => {
    preparar();
    quando(/SELECT TOP 1 ViaId, PedidaPorMembroId FROM CheckinInfantilSegundasVias/, [{ ViaId: 3, PedidaPorMembroId: 10 }]);
    quando(/UPDATE CheckinInfantilSegundasVias SET ConfirmadaPorMembroId/, [{ n: 1 }]);
    quando(/UPDATE CheckinInfantilRegistros SET CodigoHash = @h, CodigoGeracao = @g/, [{ n: 1 }]);
    quando(/SELECT p\.MembroId, p\.Nome, p\.Email FROM VoluntariadoResponsaveis/, [{ MembroId: 40, Nome: "Maria Souza", Email: "m@e.org" }]);
    quando(/SELECT MembroId, Nome, Email FROM MembroReferencia WHERE MembroId = @m/, [{ MembroId: 600, Nome: "Líder", Email: "l@e.org" }]);
    const r = await db.confirmarSegundaVia(pool, { sala: SALA, operadorId: 11, registroId: 9, hoje: HOJE });
    expect(r.sucesso).toBe(true);
    const novo = r.etiqueta.codigo;
    const up = com(/SET CodigoHash = @h, CodigoGeracao = @g/)[0];
    expect(up.sql).toMatch(/Tentativas = 0, Travado = 0 WHERE RegistroId = @r AND Situacao = 'NA_SALA' AND CodigoGeracao = @ant/);
    expect(up.inputs).toMatchObject({ r: 9, g: 2, ant: 1 });
    expect(ck.confereCodigo(novo, up.inputs.h, { registroId: 9, geracao: 2, segredo: SEGREDO })).toBe(true);
    expect(ck.confereCodigo(novo, up.inputs.h, { registroId: 9, geracao: 1, segredo: SEGREDO })).toBe(false);
    expect(com(/INSERT INTO CheckinInfantilEventos/)[0].inputs).toMatchObject({ t: "SEGUNDA_VIA_EMITIDA", a: 11, d: "geracao=2" });
    expect(notificarAgora.mock.calls[0][1]).toMatchObject({ regraChave: "CHECKIN_SEGUNDA_VIA", referenciaId: 3, referenciaTabela: "CheckinInfantilSegundasVias" });
    expect(JSON.stringify([mockConsultas.map((c) => c.inputs), registrarAuditoria.mock.calls, notificarAgora.mock.calls])).not.toContain(novo);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------

describe("lista de autorizados a retirar (criança membro)", () => {
  const crianca = (extra = {}) => ({ MembroId: 30, Nome: "Caio Souza", DataNascimento: new Date("2021-03-01T00:00:00Z"), CongregacaoId: 1, CongregacaoNome: "Central", ...extra });
  const responsavel = (sim = true) => quando(/FROM VoluntariadoResponsaveis WHERE MenorMembroId = @m AND ResponsavelMembroId = @r AND RevogadoEm IS NULL/, sim ? [{ x: 1 }] : []);
  const dadosAut = (extra = {}) => ({ menorId: 30, nome: "Dona Lúcia", parentesco: "AVO", membroId: null, validoAte: null, referencia: null, ...extra });
  beforeEach(() => { quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c ON c\.CongregacaoId = m\.CongregacaoId WHERE m\.MembroId = @m/, [crianca()]); });

  test("quem não é responsável nem gestão da congregação recebe a MESMA recusa de quem não existe (a rota não serve de sonda)", async () => {
    responsavel(false);
    const a = await db.adicionarAutorizado(pool, { dados: dadosAut(), atorId: 99, forma: "RESPONSAVEL", hoje: HOJE });
    expect(a).toMatchObject({ sucesso: false, proibido: true, mensagem: mc.MENSAGENS.NAO_E_RESPONSAVEL });
    mockRegras = []; quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c/, []);
    const b = await db.adicionarAutorizado(pool, { dados: dadosAut({ menorId: 31 }), atorId: 99, forma: "RESPONSAVEL", hoje: HOJE });
    expect(b).toEqual(a);
    expect(escritas()).toHaveLength(0);
  });
  test("o responsável ativo adiciona; o adulto que já é membro vem com a matrícula; auditoria só com ids", async () => {
    responsavel();
    quando(/SELECT COUNT\(\*\) AS n FROM CheckinInfantilAutorizados WHERE MenorMembroId = @m AND RevogadoEm IS NULL/, [{ n: 2 }]);
    quando(/INSERT INTO CheckinInfantilAutorizados/, [{ AutorizadoId: 12 }]);
    const r = await db.adicionarAutorizado(pool, { dados: dadosAut({ validoAte: "2026-12-31" }), atorId: 40, forma: "RESPONSAVEL", hoje: HOJE });
    expect(r).toMatchObject({ sucesso: true, autorizadoId: 12 });
    expect(com(/INSERT INTO CheckinInfantilAutorizados/)[0].inputs).toMatchObject({ m: 30, am: null, n: "Dona Lúcia", p: "AVO", v: "2026-12-31", f: "RESPONSAVEL", ref: null, por: 40 });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "CHECKIN_AUTORIZADO_ADICIONADO", usuarioId: 40, dadosDepois: { menorId: 30, forma: "RESPONSAVEL" } });
    expect(JSON.stringify(registrarAuditoria.mock.calls)).not.toMatch(/Lúcia/);
  });
  test("a ficha assinada: só a gestão no escopo e com a referência; a gestão fora do escopo não passa", async () => {
    quando(/SELECT COUNT\(\*\) AS n FROM CheckinInfantilAutorizados/, [{ n: 0 }]);
    quando(/INSERT INTO CheckinInfantilAutorizados/, [{ AutorizadoId: 13 }]);
    let r = await db.adicionarAutorizado(pool, { dados: dadosAut({ referencia: "Ficha 7" }), atorId: 5, forma: "FICHA_FISICA", gestorPodeVer: (n) => n === "Central", hoje: HOJE });
    expect(r.sucesso).toBe(true);
    expect(com(/INSERT INTO CheckinInfantilAutorizados/)[0].inputs).toMatchObject({ f: "FICHA_FISICA", ref: "Ficha 7", por: 5 });
    mockConsultas = [];
    r = await db.adicionarAutorizado(pool, { dados: dadosAut({ referencia: "Ficha 7" }), atorId: 5, forma: "FICHA_FISICA", gestorPodeVer: (n) => n === "Vila", hoje: HOJE });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    r = await db.adicionarAutorizado(pool, { dados: dadosAut(), atorId: 5, forma: "FICHA_FISICA", gestorPodeVer: () => true, hoje: HOJE });
    expect(r.sucesso).toBe(false); expect(r.mensagem).toMatch(/referência da ficha/);
  });
  test("teto de 8, validade que já passou, menor de 18 como autorizado e a própria criança são recusados", async () => {
    responsavel();
    quando(/SELECT COUNT\(\*\) AS n FROM CheckinInfantilAutorizados/, [{ n: 8 }]);
    expect((await db.adicionarAutorizado(pool, { dados: dadosAut(), atorId: 40, forma: "RESPONSAVEL", hoje: HOJE })).mensagem).toMatch(/até 8 pessoas/);
    mockRegras = mockRegras.filter(([p]) => !/COUNT/.test(p.source)); quando(/SELECT COUNT\(\*\) AS n FROM CheckinInfantilAutorizados/, [{ n: 0 }]);
    expect((await db.adicionarAutorizado(pool, { dados: dadosAut({ validoAte: "2026-10-01" }), atorId: 40, forma: "RESPONSAVEL", hoje: HOJE })).mensagem).toMatch(/já passou/);
    quando(/SELECT MembroId, DataNascimento FROM MembroReferencia WHERE MembroId = @m/, [{ MembroId: 55, DataNascimento: new Date("2015-01-01T00:00:00Z") }]);
    expect((await db.adicionarAutorizado(pool, { dados: dadosAut({ membroId: 55 }), atorId: 40, forma: "RESPONSAVEL", hoje: HOJE })).mensagem).toMatch(/Só maiores de 18/);
    mockRegras = mockRegras.filter(([p]) => !/DataNascimento FROM MembroReferencia WHERE MembroId = @m/.test(p.source));
    quando(/SELECT MembroId, DataNascimento FROM MembroReferencia WHERE MembroId = @m/, [{ MembroId: 30, DataNascimento: new Date("1990-01-01T00:00:00Z") }]);
    expect((await db.adicionarAutorizado(pool, { dados: dadosAut({ membroId: 30 }), atorId: 40, forma: "RESPONSAVEL", hoje: HOJE })).mensagem).toMatch(/a si mesma/);
    expect(com(/INSERT INTO CheckinInfantilAutorizados/)).toHaveLength(0);
  });
  test("o mesmo adulto duas vezes (índice único) é mensagem, não erro", async () => {
    responsavel();
    quando(/SELECT COUNT\(\*\) AS n FROM CheckinInfantilAutorizados/, [{ n: 1 }]);
    quando(/SELECT MembroId, DataNascimento FROM MembroReferencia WHERE MembroId = @m/, [{ MembroId: 55, DataNascimento: new Date("1980-01-01T00:00:00Z") }]);
    const e = new Error("duplicado"); e.number = 2627;
    quando(/INSERT INTO CheckinInfantilAutorizados/, () => { throw e; });
    expect((await db.adicionarAutorizado(pool, { dados: dadosAut({ membroId: 55 }), atorId: 40, forma: "RESPONSAVEL", hoje: HOJE })).mensagem).toMatch(/já está na lista/);
  });
  test("revogar: o responsável revoga, nada se apaga (UPDATE), e revogar o que já estava revogado não é erro", async () => {
    quando(/SELECT AutorizadoId, MenorMembroId, RevogadoEm FROM CheckinInfantilAutorizados WHERE AutorizadoId = @a/, [{ AutorizadoId: 12, MenorMembroId: 30, RevogadoEm: null }]);
    responsavel();
    quando(/UPDATE CheckinInfantilAutorizados SET RevogadoEm/, [{ n: 1 }]);
    const r = await db.revogarAutorizado(pool, { autorizadoId: 12, atorId: 40, hoje: HOJE });
    expect(r.sucesso).toBe(true);
    expect(com(/DELETE FROM CheckinInfantilAutorizados/)).toHaveLength(0);
    expect(com(/UPDATE CheckinInfantilAutorizados SET RevogadoEm/)[0].inputs).toMatchObject({ a: 12, por: 40 });
    mockRegras = mockRegras.filter(([p]) => !/SELECT AutorizadoId, MenorMembroId, RevogadoEm/.test(p.source));
    quando(/SELECT AutorizadoId, MenorMembroId, RevogadoEm FROM CheckinInfantilAutorizados WHERE AutorizadoId = @a/, [{ AutorizadoId: 12, MenorMembroId: 30, RevogadoEm: new Date() }]);
    expect(await db.revogarAutorizado(pool, { autorizadoId: 12, atorId: 40, hoje: HOJE })).toMatchObject({ sucesso: true, jaRevogado: true });
  });
  test("revogar a autorização de outra criança (ou inexistente): a mesma recusa", async () => {
    quando(/SELECT AutorizadoId, MenorMembroId, RevogadoEm FROM CheckinInfantilAutorizados WHERE AutorizadoId = @a/, [{ AutorizadoId: 12, MenorMembroId: 30, RevogadoEm: null }]);
    responsavel(false);
    const a = await db.revogarAutorizado(pool, { autorizadoId: 12, atorId: 99, hoje: HOJE });
    mockRegras = []; quando(/SELECT AutorizadoId, MenorMembroId, RevogadoEm/, []);
    const b = await db.revogarAutorizado(pool, { autorizadoId: 77, atorId: 99, hoje: HOJE });
    expect(a).toMatchObject({ sucesso: false, proibido: true });
    expect(b).toEqual(a);
    expect(com(/UPDATE CheckinInfantilAutorizados/)).toHaveLength(0);
  });
});

describe("saúde da criança membro", () => {
  const crianca = () => ({ MembroId: 30, Nome: "Caio Souza", DataNascimento: new Date("2021-03-01T00:00:00Z"), CongregacaoId: 1, CongregacaoNome: "Central" });
  beforeEach(() => {
    quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c ON c\.CongregacaoId = m\.CongregacaoId WHERE m\.MembroId = @m/, [crianca()]);
    quando(/FROM VoluntariadoResponsaveis WHERE MenorMembroId = @m AND ResponsavelMembroId = @r AND RevogadoEm IS NULL/, [{ x: 1 }]);
  });
  test("sem consentimento vigente a informação NÃO é guardada e a mensagem diz o que fazer", async () => {
    const r = await db.gravarSaude(pool, { dados: { menorId: 30, texto: "alergia a amendoim", referencia: null }, atorId: 40, forma: "RESPONSAVEL", hoje: HOJE });
    expect(r.sucesso).toBe(false); expect(r.mensagem).toMatch(/precisa autorizar primeiro/);
    expect(com(/MERGE CheckinInfantilSaude/)).toHaveLength(0);
  });
  test("com consentimento: guarda (MERGE), e a auditoria NUNCA leva o texto", async () => {
    mcDb.consentimentoVigente.mockResolvedValue(true);
    const r = await db.gravarSaude(pool, { dados: { menorId: 30, texto: "alergia a amendoim", referencia: null }, atorId: 40, forma: "RESPONSAVEL", hoje: HOJE });
    expect(r.sucesso).toBe(true);
    expect(com(/MERGE CheckinInfantilSaude/)[0].inputs).toMatchObject({ m: 30, t: "alergia a amendoim", f: "RESPONSAVEL", ref: null, por: 40 });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "CHECKIN_SAUDE_GRAVADA", dadosDepois: { forma: "RESPONSAVEL" } });
    expect(JSON.stringify(registrarAuditoria.mock.calls)).not.toMatch(/amendoim/);
  });
  test("a ficha assinada exige referência e gestão no escopo; quem não é responsável nem gestão recebe a recusa padrão", async () => {
    mcDb.consentimentoVigente.mockResolvedValue(true);
    expect((await db.gravarSaude(pool, { dados: { menorId: 30, texto: "asma", referencia: null }, atorId: 5, forma: "FICHA_FISICA", gestorPodeVer: () => true, hoje: HOJE })).mensagem).toMatch(/referência da ficha/);
    expect((await db.gravarSaude(pool, { dados: { menorId: 30, texto: "asma", referencia: "Ficha 3" }, atorId: 5, forma: "FICHA_FISICA", gestorPodeVer: () => false, hoje: HOJE }))).toMatchObject({ sucesso: false, proibido: true });
    mockRegras = []; quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c/, [crianca()]); quando(/FROM VoluntariadoResponsaveis WHERE MenorMembroId/, []);
    expect((await db.gravarSaude(pool, { dados: { menorId: 30, texto: "asma", referencia: null }, atorId: 99, forma: "RESPONSAVEL", hoje: HOJE }))).toMatchObject({ sucesso: false, proibido: true });
  });
  test("ler: só o responsável ou a gestão; a saúde só aparece com o consentimento vigente", async () => {
    quando(/SELECT Texto, Forma, AtualizadoEm FROM CheckinInfantilSaude/, [{ Texto: "asma", Forma: "RESPONSAVEL", AtualizadoEm: new Date("2026-10-10T12:00:00Z") }]);
    let r = await db.lerSaudeDaCrianca(pool, { menorId: 30, atorId: 40, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: true, consentimentoVigente: false, saude: null });
    mcDb.consentimentoVigente.mockResolvedValue(true);
    r = await db.lerSaudeDaCrianca(pool, { menorId: 30, atorId: 40, hoje: HOJE });
    expect(r.saude).toMatchObject({ texto: "asma", forma: "RESPONSAVEL" });
  });
  test("apagar o dado de saúde apaga a linha E as cópias nos registros; só audita se houve o que apagar", async () => {
    quando(/DELETE FROM CheckinInfantilSaude WHERE MenorMembroId = @m/, [{ n: 1 }]);
    quando(/UPDATE CheckinInfantilRegistros SET SaudeTexto = NULL/, [{ n: 3 }]);
    expect(await db.apagarSaudeDoMenor(pool, { menorId: 30, por: 40 })).toEqual({ apagou: true });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "CHECKIN_SAUDE_APAGADA", usuarioId: 40 });
    mockRegras = []; mockConsultas = []; jest.clearAllMocks();
    quando(/DELETE FROM CheckinInfantilSaude WHERE MenorMembroId = @m/, [{ n: 0 }]);
    quando(/UPDATE CheckinInfantilRegistros SET SaudeTexto = NULL/, [{ n: 0 }]);
    expect(await db.apagarSaudeDoMenor(pool, { menorId: 30, por: 40 })).toEqual({ apagou: false });
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("a rotina apaga o dado de quem perdeu o consentimento e mantém o de quem ainda tem", async () => {
    quando(/SELECT MenorMembroId FROM CheckinInfantilSaude WHERE 1 = 1/, [{ MenorMembroId: 30 }, { MenorMembroId: 31 }]);
    quando(/SELECT DISTINCT MenorMembroId FROM CheckinInfantilRegistros/, []);
    mcDb.consentimentoVigente.mockImplementation(async (_p, id) => id === 31);
    quando(/DELETE FROM CheckinInfantilSaude WHERE MenorMembroId = @m/, [{ n: 1 }]);
    const r = await db.apagarSaudeSemConsentimento(pool, { hoje: HOJE });
    expect(r.apagadas).toBe(1);
    expect(com(/DELETE FROM CheckinInfantilSaude/).map((c) => c.inputs.m)).toEqual([30]);
  });
});

describe("retenção, histórico do responsável e Meus Dados", () => {
  test("a rotina diária apaga o contato e a saúde do balcão no prazo curto e anonimiza o registro no prazo de guarda", async () => {
    quando(/SELECT TOP 1 DiasRetencao FROM PoliticasRetencao/, [{ DiasRetencao: 1825 }]);
    quando(/SET TrouxeContato = NULL, SaudeTexto = CASE/, [{ n: 4 }]);
    quando(/SET VisitanteNome = CASE WHEN MenorMembroId IS NULL/, [{ n: 2 }]);
    quando(/UPDATE v SET Nome = NULL FROM CheckinInfantilAutorizadosVisita/, [{ n: 1 }]);
    const r = await db.aplicarRetencao(pool, { hoje: HOJE });
    expect(r).toEqual({ contatosApagados: 4, anonimizados: 2, autorizadosDeVisitaAnonimizados: 1 });
    const curto = com(/SET TrouxeContato = NULL, SaudeTexto = CASE/)[0];
    expect(curto.inputs.d).toBe(90);
    expect(curto.sql).toMatch(/SaudeOrigem = 'BALCAO'/);
    const longo = com(/SET VisitanteNome = CASE/)[0];
    expect(longo.inputs.d).toBe(1825);
    expect(longo.sql).toMatch(/Situacao = 'RETIRADA'/);          // criança ainda na sala nunca é anonimizada
    expect(longo.sql).toMatch(/AnonimizadoEm = SYSUTCDATETIME\(\)/);
  });
  test("o histórico do responsável só traz as crianças de que ele é responsável ATIVO e nunca o código, o voluntário ou a saúde", async () => {
    quando(/WHERE r\.MenorMembroId IS NOT NULL AND EXISTS \(SELECT 1 FROM VoluntariadoResponsaveis v/, [{
      RegistroId: 9, MenorMembroId: 30, CriancaNome: "Caio Souza", EquipeNome: "Maternal", CongregacaoNome: "Central", ServicoDataHora: new Date("2026-10-18T09:00:00Z"), EntregueEm: new Date("2026-10-18T12:05:00Z"),
      RetiradoEm: new Date("2026-10-18T13:30:00Z"), Situacao: "RETIRADA", TrouxeNomeResolvido: "Maria Souza", RetiradoNomeResolvido: "Dona Lúcia", Divergente: 0, CodigoHash: "h", SaudeTexto: "alergia", EntreguePorMembroId: 10
    }]);
    const h = await db.historicoDoResponsavel(pool, { responsavelId: 40, menorId: 30 });
    const consulta = com(/WHERE r\.MenorMembroId IS NOT NULL/)[0];
    expect(consulta.sql).toMatch(/v\.ResponsavelMembroId = @r AND v\.RevogadoEm IS NULL/);
    expect(consulta.inputs).toMatchObject({ r: 40, m: 30 });
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ registroId: 9, menorId: 30, crianca: "Caio Souza", sala: "Maternal", quemTrouxe: "Maria Souza", quemRetirou: "Dona Lúcia", situacao: "RETIRADA", retiradaDivergente: false, data: "2026-10-18" });
    expect(JSON.stringify(h)).not.toMatch(/"h"|alergia|CodigoHash|Voluntário|"10"/);
  });
  test("Meus Dados: contagens do que consta sobre a pessoa (como criança, como quem trouxe ou retirou, como autorizada), sem conteúdo", async () => {
    quando(/WHERE MenorMembroId = @m$/, [{ n: 3, ultimo: new Date("2026-10-18T12:00:00Z") }]);
    quando(/WHERE TrouxeMembroId = @m OR RetiradoMembroId = @m/, [{ n: 5, ultimo: new Date("2026-10-11T12:00:00Z") }]);
    quando(/WHERE AutorizadoMembroId = @m AND RevogadoEm IS NULL/, [{ n: 2 }]);
    quando(/FROM CheckinInfantilSaude WHERE MenorMembroId = @m/, [{ n: 1 }]);
    const d = await db.dadosDoTitular(pool, 30);
    expect(d).toEqual({ comoCrianca: { registros: 3, ultimo: "2026-10-18T12:00:00.000Z", saudeGuardada: true }, comoQuemTrouxeOuRetirou: { registros: 5, ultimo: "2026-10-11T12:00:00.000Z" }, comoAutorizado: { criancas: 2 } });
  });
});

describe("a sala hoje (leitura)", () => {
  test("contextoDaSala: a mesma resposta para sala inexistente e de outra congregação; equipe sem a marca é recusada com a mensagem certa", async () => {
    quando(/FROM EscalasServicos s\s+JOIN EscalasEquipes e ON e\.EquipeId = @e AND e\.CongregacaoId = s\.CongregacaoId/, []);
    expect(await db.contextoDaSala(pool, { servicoId: 5, equipeId: 7 })).toMatchObject({ sucesso: false, naoAchou: true, mensagem: ck.MENSAGENS.SALA_NAO_ENCONTRADA });
    mockRegras = [];
    quando(/FROM EscalasServicos s\s+JOIN EscalasEquipes e ON e\.EquipeId = @e/, [{ ServicoId: 5, EquipeId: 7, EquipeNome: "Recepção", ContatoComMenores: 0, CongregacaoId: 1, CongregacaoNome: "Central", DataHora: new Date("2026-10-18T09:00:00Z"), ServicoStatus: "PUBLICADA" }]);
    expect(await db.contextoDaSala(pool, { servicoId: 5, equipeId: 7 })).toMatchObject({ sucesso: false, mensagem: ck.MENSAGENS.SALA_SEM_MARCA });
    mockRegras = [];
    quando(/FROM EscalasServicos s\s+JOIN EscalasEquipes e ON e\.EquipeId = @e/, [{ ServicoId: 5, EquipeId: 7, EquipeNome: "Maternal", FaixaEtariaMenores: "MATERNAL", LiderMembroId: 600, ContatoComMenores: 1, Ativa: 1, CongregacaoId: 1, CongregacaoNome: "Central", DataHora: new Date("2026-10-18T09:00:00Z"), ServicoStatus: "PUBLICADA" }]);
    const r = await db.contextoDaSala(pool, { servicoId: 5, equipeId: 7 });
    expect(r.sala).toMatchObject({ servicoId: 5, equipeId: 7, faixa: "MATERNAL", liderMembroId: 600, congregacaoNome: "Central", dataHora: "2026-10-18T09:00:00.000Z" });
  });
  test("busca de criança: 3+ letras, sem curinga, só da congregação da sala, no máximo 8, com os selos", async () => {
    for (const t of ["ca", "", null, "ca%", "c_a", "a[b", "x".repeat(61)]) expect((await db.buscarCriancas(pool, { sala: SALA, termo: t, hoje: HOJE })).sucesso).toBe(false);
    expect(mockConsultas).toHaveLength(0);
    quando(/SELECT TOP 8 m\.MembroId/, [{ MembroId: 30, Nome: "Caio Souza", DataNascimento: new Date("2021-03-01T00:00:00Z"), Responsaveis: 1, JaNaSala: 0 }, { MembroId: 31, Nome: "Caio Lima", DataNascimento: new Date("2014-03-01T00:00:00Z"), Responsaveis: 0, JaNaSala: 1 }]);
    const r = await db.buscarCriancas(pool, { sala: SALA, termo: " cai ", hoje: HOJE });
    const c = com(/SELECT TOP 8 m\.MembroId/)[0];
    expect(c.sql).toMatch(/m\.CongregacaoId = @c/);
    expect(c.inputs).toMatchObject({ c: 1, t: "%cai%" });
    expect(r.criancas).toEqual([
      { menorId: 30, nome: "Caio Souza", idade: 5, faixa: "MATERNAL", foraDaFaixa: false, temResponsavel: true, jaNaSala: false },
      { menorId: 31, nome: "Caio Lima", idade: 12, faixa: "JUNIORES", foraDaFaixa: true, temResponsavel: false, jaNaSala: true }
    ]);
    expect(JSON.stringify(r)).not.toMatch(/Nascimento|2021|2014/);
  });
  test("o detector da manhã seguinte avisa a gestão (sem nome de criança) das crianças que ficaram sem retirada", async () => {
    quando(/FROM CheckinInfantilRegistros r JOIN EscalasServicos s ON s\.ServicoId = r\.ServicoId JOIN EscalasEquipes e/, [{ ServicoId: 5, EquipeId: 7, n: 2, DataHora: new Date("2026-10-18T09:00:00Z"), EquipeNome: "Maternal", CongregacaoId: 1, LiderMembroId: 600 }]);
    quando(/SELECT MembroId, Nome, Email FROM MembroReferencia WHERE MembroId = @m/, [{ MembroId: 600, Nome: "Líder", Email: "l@e.org" }]);
    const fatos = await db.detectarCriancasSemRetirada(pool, { hoje: "2026-10-19" });
    expect(fatos).toHaveLength(1);
    expect(fatos[0].destinatarios.map((d) => d.membroId).sort()).toEqual([600, 900]);
    expect(fatos[0].fatoGerador).toMatch(/2 criança\(s\) da sala Maternal ficaram sem retirada/);
    expect(fatos[0].referenciaId).toBe(ck.referenciaDeSemRetirada(5, 7));
    expect(com(/CAST\(s\.DataHora AS DATE\) < @hoje/)).toHaveLength(1);
  });
});
