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
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => undefined), sha256: () => "" }));
jest.mock("../segredoSessao", () => ({ resolverSegredo: () => "segredo-de-teste-com-mais-de-16-caracteres" }));
jest.mock("../financeiroSeguro", () => ({ ...jest.requireActual("../financeiroSeguro"), obterTrava: jest.fn(async () => true) }));
jest.mock("../canaisDb", () => ({ ...jest.requireActual("../canaisDb"), notificarAgora: jest.fn(async () => ({ criadas: 1, externas: 1 })), lerPrazoDias: jest.fn(async (_p, _s, padrao) => padrao) }));
jest.mock("../ministerioMenoresDb", () => ({
  aptidaoDe: jest.fn(), aptidaoEmLote: jest.fn(), lerPrazos: jest.fn(async () => ({ adultosMinimos: 2 })), lerPrazosFaixas: jest.fn(async () => ({}))
}));
jest.mock("../menoresConsentimentoDb", () => ({ consentimentoVigente: jest.fn(async () => false) }));
jest.mock("../psc", () => ({ ...jest.requireActual("../psc"), resolverDestinatariosDaCongregacao: jest.fn(async () => [{ membroId: 900, nome: "Dirigente", email: "d@e.org" }]) }));

const { getPool } = require("../db");
const { registrarAuditoria, registrarAuditoriaNaTransacao } = require("../auditoria");
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
  db.limparCaches();                                                    // a configuração dos prazos fica 15 s em memória: cada teste parte do zero
  notificarAgora.mockImplementation(async () => ({ criadas: 1, externas: 1 }));
  require("../canaisDb").lerPrazoDias.mockImplementation(async (_p, _s, padrao) => padrao);
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
    mockRegras = []; mockConsultas = []; escalado(); presenteNaSala();
    const e = new Error("duplicado"); e.number = 2601;
    quando(/INSERT INTO CheckinInfantilVoluntarios/, () => { throw e; });
    expect(await db.entrarNaSala(pool, { sala: SALA, membroId: 10, hoje: HOJE, agoraIso: AGORA })).toMatchObject({ sucesso: true, jaEstava: true });
  });
  // Achado na prova no banco real (e2e-19): o índice UX_CheckinVol_UmaSala (uma pessoa, um serviço, uma sala) também dispara o erro de duplicidade; responder "você já está na sala"
  // a quem está em OUTRA sala fazia a tela achar que ela operava esta e o primeiro ato caía em "entre na sala primeiro".
  test("duplicidade por estar em OUTRA sala do mesmo serviço: recusa clara, nunca 'já estava'", async () => {
    escalado(); presenteNaSala(false);
    const e = new Error("duplicado em outra sala"); e.number = 2601;
    quando(/INSERT INTO CheckinInfantilVoluntarios/, () => { throw e; });
    const r = await db.entrarNaSala(pool, { sala: SALA, membroId: 10, hoje: HOJE, agoraIso: AGORA });
    expect(r.sucesso).toBe(false);
    expect(r.jaEstava).toBeUndefined();
    expect(r.mensagem).toMatch(/em outra sala deste serviço/);
    expect(com(/INSERT INTO CheckinInfantilEventos/)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
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

  describe("aviso ao responsável quando quem trouxe é um terceiro (decisão de 20/10/2026)", () => {
    const TERCEIRO = { nome: "Rosa Lima", parentesco: "TIA", documento: "RG", contato: "94991112222" };
    const responsaveisDoBanco = (...ids) => quando(/SELECT p\.MembroId, p\.Nome, p\.Email FROM VoluntariadoResponsaveis/, ids.map((i) => ({ MembroId: i, Nome: `Responsável ${i}`, Email: `r${i}@e.org` })));
    const avisosDoTerceiro = () => notificarAgora.mock.calls.filter((c) => /^CHECKIN_TERCEIRO_/.test(c[1].regraChave));
    const doisIrmaos = () => {
      quando(/SELECT MembroId, Nome, DataNascimento, CongregacaoId FROM MembroReferencia WHERE MembroId IN/, [criancaBanco(), criancaBanco({ MembroId: 31, Nome: "Dara Souza" })]);
      mockRegras.unshift(mockRegras.pop());
    };

    test("nome livre + criança membro: os responsáveis cadastrados são avisados, com o nome do terceiro e o primeiro nome da criança, e nada mais", async () => {
      prepararFeliz(); responsaveisDoBanco(40, 41);
      const r = await checkin(dadosMembro({ trouxe: TERCEIRO }));
      expect(r).toMatchObject({ sucesso: true, avisados: 1, semAviso: false, mensagem: "Criança entregue na sala." });
      const av = avisosDoTerceiro();
      expect(av).toHaveLength(1);
      expect(av[0][1]).toMatchObject({ regraChave: "CHECKIN_TERCEIRO_ENTREGA", referenciaId: 100, referenciaTabela: "CheckinInfantilRegistros", aguardarEntrega: false });
      expect(av[0][1].destinatarios.map((d) => d.membroId)).toEqual([40, 41]);
      expect(av[0][1].mensagem).toMatch(/Caio foi entregue na sala Maternal por Rosa Lima/);
      expect(av[0][1].mensagem).not.toMatch(/Souza|RG|94991112222|saúde/i);
    });
    test("quem trouxe é responsável cadastrado: ninguém é avisado", async () => {
      prepararFeliz(); responsaveisDoBanco(40, 41);
      const r = await checkin(dadosMembro());
      expect(r).toMatchObject({ sucesso: true, avisados: 0, semAviso: false });
      expect(avisosDoTerceiro()).toHaveLength(0);
    });
    test("irmãos com os mesmos responsáveis: um aviso só, com os dois primeiros nomes", async () => {
      prepararFeliz(); responsaveisDoBanco(40); doisIrmaos();
      const r = await checkin(dadosMembro({ trouxe: TERCEIRO, criancas: [{ tipo: "MEMBRO", menorId: 30 }, { tipo: "MEMBRO", menorId: 31 }] }));
      expect(r.sucesso).toBe(true);
      const av = avisosDoTerceiro();
      expect(av).toHaveLength(1);
      expect(av[0][1].mensagem).toMatch(/^Caio e Dara foram entregues/);
      expect(av[0][1].referenciaId).toBe(100);
    });
    test("irmãos com responsáveis diferentes: um aviso para cada grupo", async () => {
      prepararFeliz(); doisIrmaos();
      quando(/SELECT p\.MembroId, p\.Nome, p\.Email FROM VoluntariadoResponsaveis/, (i) => (i.m === 30 ? [{ MembroId: 40, Nome: "A", Email: "a@e.org" }] : [{ MembroId: 50, Nome: "B", Email: "b@e.org" }]));
      const r = await checkin(dadosMembro({ trouxe: TERCEIRO, criancas: [{ tipo: "MEMBRO", menorId: 30 }, { tipo: "MEMBRO", menorId: 31 }] }));
      expect(r.sucesso).toBe(true);
      const av = avisosDoTerceiro();
      expect(av.map((c) => c[1].destinatarios.map((d) => d.membroId))).toEqual([[40], [50]]);
      expect(av.map((c) => c[1].referenciaId)).toEqual([100, 101]);
      expect(av[0][1].mensagem).toMatch(/^Caio foi entregue/); expect(av[1][1].mensagem).toMatch(/^Dara foi entregue/);
    });
    test("o aviso falha (erro ou nenhum criado): a entrada vale e está gravada, mas a resposta diz que ninguém foi avisado (semAviso)", async () => {
      for (const falha of [async () => { throw new Error("fila fora do ar"); }, async () => ({ criadas: 0 })]) {
        mockRegras = []; mockConsultas = [];
        prepararFeliz(); responsaveisDoBanco(40);
        notificarAgora.mockImplementation(falha);
        const r = await checkin(dadosMembro({ trouxe: TERCEIRO }));
        expect(r.sucesso).toBe(true);
        expect(r.etiquetas).toHaveLength(1);
        expect(r.semAviso).toBe(true);
        expect(r.mensagem).toMatch(/não conseguiu avisar o responsável cadastrado/);
        expect(com(/INSERT INTO CheckinInfantilRegistros/)).toHaveLength(1);
      }
    });
    test("o aviso que ficou SÓ no sino do app (nenhum e-mail aceito, nenhum push) não conta como avisado: semAviso (Trava 7-B)", async () => {
      prepararFeliz(); responsaveisDoBanco(40, 41);
      notificarAgora.mockImplementation(async () => ({ criadas: 2, externas: 0 }));
      const r = await checkin(dadosMembro({ trouxe: TERCEIRO }));
      expect(r).toMatchObject({ sucesso: true, avisados: 0, semAviso: true });
      expect(r.mensagem).toMatch(/não conseguiu avisar o responsável cadastrado/);
    });
    test("não conseguir nem montar a lista de responsáveis também é semAviso (e não derruba a entrada)", async () => {
      prepararFeliz();
      quando(/SELECT p\.MembroId, p\.Nome, p\.Email FROM VoluntariadoResponsaveis/, () => { throw new Error("banco caiu"); });
      const r = await checkin(dadosMembro({ trouxe: TERCEIRO }));
      expect(r).toMatchObject({ sucesso: true, semAviso: true });
      expect(avisosDoTerceiro()).toHaveLength(0);
    });
    test("visitante e criança sem responsável cadastrado: não há a quem avisar, e isso não é alarme", async () => {
      prepararFeliz();
      const v = await checkin({ servicoId: 5, equipeId: 7, criancas: [{ tipo: "VISITANTE", nome: "Davi Lima", nascimento: "2021-03-02", idade: 5, saude: null }], trouxe: TERCEIRO, extras: [] });
      expect(v).toMatchObject({ sucesso: true, avisados: 0, semAviso: false });
      mockRegras = []; mockConsultas = [];
      prepararFeliz(); responsaveisDoBanco();
      const m = await checkin(dadosMembro({ trouxe: TERCEIRO }));
      expect(m).toMatchObject({ sucesso: true, avisados: 0, semAviso: false });
      expect(avisosDoTerceiro()).toHaveLength(0);
    });
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

  describe("aviso ao responsável quando quem retira é um terceiro (decisão de 20/10/2026)", () => {
    const responsaveis = (...ids) => quando(/SELECT p\.MembroId, p\.Nome, p\.Email FROM VoluntariadoResponsaveis/, ids.map((i) => ({ MembroId: i, Nome: `Responsável ${i}`, Email: `r${i}@e.org` })));
    const doTerceiro = () => notificarAgora.mock.calls.filter((c) => /^CHECKIN_TERCEIRO_/.test(c[1].regraChave));
    const liberar = () => quando(/UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA'/, [{ n: 1 }]);
    const livre = { TrouxeMembroId: null, TrouxeNome: "Rosa Lima", TrouxeNomeResolvido: "Rosa Lima" };

    test("retira quem trouxe sem ser responsável cadastrado: os responsáveis são avisados (CHECKIN_TERCEIRO_RETIRADA), com o nome do terceiro e o primeiro nome da criança", async () => {
      preparar({ reg: registro(livre) }); liberar(); responsaveis(40, 41);
      const r = await retirar(dados({ retirante: { ref: "TROUXE" } }));
      expect(r).toMatchObject({ sucesso: true, retirada: true, avisados: 1, semAviso: false, mensagem: "Criança entregue a quem a retirou." });
      const av = doTerceiro();
      expect(av).toHaveLength(1);
      expect(av[0][1]).toMatchObject({ regraChave: "CHECKIN_TERCEIRO_RETIRADA", referenciaId: 9, referenciaTabela: "CheckinInfantilRegistros", aguardarEntrega: false });
      expect(av[0][1].destinatarios.map((d) => d.membroId)).toEqual([40, 41]);
      expect(av[0][1].mensagem).toMatch(/Caio foi retirado\(a\) da sala Maternal por Rosa Lima/);
      expect(av[0][1].mensagem).not.toMatch(/Souza/);
    });
    test("retira o indicado só para a visita por um terceiro: avisa; indicado por um responsável cadastrado, não", async () => {
      const visita = [{ AutorizadoVisitaId: 7, RegistroId: 9, Nome: "Carla Dias", Parentesco: "TIO" }];
      preparar({ reg: registro(livre) }); liberar(); responsaveis(40);
      trocar(/FROM CheckinInfantilAutorizadosVisita WHERE RegistroId IN/, visita);
      await retirar(dados({ retirante: { ref: "VIS:7" } }));
      expect(doTerceiro()).toHaveLength(1);
      expect(doTerceiro()[0][1].mensagem).toMatch(/por Carla Dias/);
      mockRegras = []; mockConsultas = []; notificarAgora.mockClear();
      preparar(); liberar(); responsaveis(40);                                                      // quem trouxe é o responsável 40
      trocar(/FROM CheckinInfantilAutorizadosVisita WHERE RegistroId IN/, visita);
      const r = await retirar(dados({ retirante: { ref: "VIS:7" } }));
      expect(r).toMatchObject({ sucesso: true, retirada: true, avisados: 0, semAviso: false });
      expect(doTerceiro()).toHaveLength(0);
    });
    test("retira o responsável cadastrado, quem trouxe sendo responsável ou alguém da lista fixa: nenhum aviso de terceiro", async () => {
      preparar(); liberar(); responsaveis(40);
      for (const ref of ["RESP:40", "TROUXE"]) {
        notificarAgora.mockClear(); mockConsultas = [];
        expect(await retirar(dados({ retirante: { ref } }))).toMatchObject({ sucesso: true, retirada: true, avisados: 0, semAviso: false });
        expect(doTerceiro()).toHaveLength(0);
      }
      quando(/FROM CheckinInfantilAutorizados a\s+WHERE a\.MenorMembroId IN/, [{ AutorizadoId: 5, MenorMembroId: 30, AutorizadoMembroId: null, Nome: "Dona Lúcia", Parentesco: "AVO", ValidoAte: null }]);
      notificarAgora.mockClear();
      expect(await retirar(dados({ retirante: { ref: "AUT:5" } }))).toMatchObject({ sucesso: true, retirada: true, semAviso: false });
      expect(doTerceiro()).toHaveLength(0);
    });
    test("o aviso falha: a criança JÁ saiu (vale e está gravado), e a resposta manda avisar (semAviso)", async () => {
      for (const falha of [async () => { throw new Error("fila fora do ar"); }, async () => ({ criadas: 0 })]) {
        mockRegras = []; mockConsultas = [];
        preparar({ reg: registro(livre) }); liberar(); responsaveis(40);
        notificarAgora.mockImplementation(falha);
        const r = await retirar(dados({ retirante: { ref: "TROUXE" } }));
        expect(r).toMatchObject({ sucesso: true, retirada: true, semAviso: true });
        expect(r.mensagem).toMatch(/não conseguiu avisar o responsável cadastrado/);
        expect(com(/UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA'/)).toHaveLength(1);
      }
    });
    test("criança visitante (sem responsável cadastrado) retirada por quem trouxe: sem aviso e sem alarme; e a retirada divergente segue só com o aviso próprio", async () => {
      preparar({ reg: registro({ ...livre, MenorMembroId: null, VisitanteNome: "Davi Lima", CriancaNome: "Davi Lima" }) }); liberar();
      expect(await retirar(dados({ retirante: { ref: "TROUXE" } }))).toMatchObject({ sucesso: true, retirada: true, avisados: 0, semAviso: false });
      expect(doTerceiro()).toHaveLength(0);
      mockRegras = []; mockConsultas = []; notificarAgora.mockClear();
      preparar({ reg: registro(livre) }); responsaveis(40);
      quando(/UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA_PENDENTE'/, [{ n: 1 }]);
      const d = await retirar(dados({ retirante: { outro: { nome: "Roberto Dias", parentesco: "AMIGO_FAMILIA", documento: "RG" } } }));
      expect(d).toMatchObject({ sucesso: true, divergente: true });
      expect(doTerceiro()).toHaveLength(0);
      expect(notificarAgora.mock.calls.every((c) => c[1].regraChave === "CHECKIN_RETIRADA_DIVERGENTE")).toBe(true);
    });
  });

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
    // Achado na prova no banco real (e2e-19): CheckinInfantilRegistros tem gatilho, e o SQL Server recusa "UPDATE ... OUTPUT" sem "INTO" numa tabela com gatilho (erro 334): a retirada
    // com código inteira caía em 500. O OUTPUT tem de ir para uma variável de tabela.
    expect(reserva.sql).toMatch(/OUTPUT[^;]*\bINTO @reservada\b/);
    expect(reserva.sql).toMatch(/SELECT tentativas, hash, geracao FROM @reservada/);
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
  test("contar e gravar são UM ato sob a trava da criança (vários pedidos ao mesmo tempo não furam o teto de 8; o e2e-21 achou 13 de 14 entrando)", async () => {
    responsavel();
    quando(/SELECT COUNT\(\*\) AS n FROM CheckinInfantilAutorizados a WHERE a\.MenorMembroId = @m AND a\.RevogadoEm IS NULL/, [{ n: 2 }]);
    quando(/INSERT INTO CheckinInfantilAutorizados/, [{ AutorizadoId: 12 }]);
    // a trava é simulada (financeiroSeguro.obterTrava); aqui ela deixa uma marca na lista de consultas para conferir a ORDEM: trava, depois contagem, depois gravação
    require("../financeiroSeguro").obterTrava.mockImplementationOnce(async (_exec, nome) => { mockConsultas.push({ sql: "TRAVA", inputs: { r: nome } }); return true; });
    await db.adicionarAutorizado(pool, { dados: dadosAut(), atorId: 40, forma: "RESPONSAVEL", hoje: HOJE });
    const ordem = mockConsultas.map((c) => c.sql);
    const iBegin = ordem.indexOf("BEGIN");
    const iTrava = ordem.indexOf("TRAVA");
    const iConta = ordem.findIndex((s) => /SELECT COUNT\(\*\) AS n FROM CheckinInfantilAutorizados/.test(s));
    const iGrava = ordem.findIndex((s) => /INSERT INTO CheckinInfantilAutorizados/.test(s));
    const iCommit = ordem.indexOf("COMMIT");
    expect(iBegin).toBeGreaterThanOrEqual(0);
    expect([iBegin < iTrava, iTrava < iConta, iConta < iGrava, iGrava < iCommit]).toEqual([true, true, true, true]);
    expect(mockConsultas[iTrava].inputs).toMatchObject({ r: "checkin-autorizados:30" });
  });
  test("teto de 8 atingido: recusa DENTRO da transação (sem gravar) e solta a trava", async () => {
    responsavel();
    quando(/SELECT COUNT\(\*\) AS n FROM CheckinInfantilAutorizados a WHERE a\.MenorMembroId = @m AND a\.RevogadoEm IS NULL/, [{ n: 8 }]);
    const r = await db.adicionarAutorizado(pool, { dados: dadosAut(), atorId: 40, forma: "RESPONSAVEL", hoje: HOJE });
    expect(r).toMatchObject({ sucesso: false });
    expect(r.mensagem).toMatch(/até 8 pessoas autorizadas/);
    expect(escritas()).toHaveLength(0);
    expect(mockConsultas.map((c) => c.sql)).toContain("ROLLBACK");
  });
  test("o responsável ativo adiciona; o adulto que já é membro vem com a matrícula; auditoria só com ids", async () => {
    responsavel();
    quando(/SELECT COUNT\(\*\) AS n FROM CheckinInfantilAutorizados a WHERE a\.MenorMembroId = @m AND a\.RevogadoEm IS NULL/, [{ n: 2 }]);
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
    quando(/SELECT MembroId, Nome, DataNascimento FROM MembroReferencia WHERE MembroId = @m/, [{ MembroId: 55, Nome: "Joaquim Pereira", DataNascimento: new Date("2015-01-01T00:00:00Z") }]);
    expect((await db.adicionarAutorizado(pool, { dados: dadosAut({ membroId: 55 }), atorId: 40, forma: "RESPONSAVEL", hoje: HOJE })).mensagem).toMatch(/Só maiores de 18/);
    mockRegras = mockRegras.filter(([p]) => !/DataNascimento FROM MembroReferencia WHERE MembroId = @m/.test(p.source));
    quando(/SELECT MembroId, Nome, DataNascimento FROM MembroReferencia WHERE MembroId = @m/, [{ MembroId: 30, Nome: "Caio Souza", DataNascimento: new Date("1990-01-01T00:00:00Z") }]);
    expect((await db.adicionarAutorizado(pool, { dados: dadosAut({ membroId: 30 }), atorId: 40, forma: "RESPONSAVEL", hoje: HOJE })).mensagem).toMatch(/a si mesma/);
    expect(com(/INSERT INTO CheckinInfantilAutorizados/)).toHaveLength(0);
  });
  test("o mesmo adulto duas vezes (índice único) é mensagem, não erro", async () => {
    responsavel();
    quando(/SELECT COUNT\(\*\) AS n FROM CheckinInfantilAutorizados/, [{ n: 1 }]);
    quando(/SELECT MembroId, Nome, DataNascimento FROM MembroReferencia WHERE MembroId = @m/, [{ MembroId: 55, Nome: "Joaquim Pereira", DataNascimento: new Date("1980-01-01T00:00:00Z") }]);
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
    quando(/UPDATE v SET PessoaNome = NULL, PessoaMembroId = NULL FROM CheckinInfantilSegundasVias/, [{ n: 3 }]);
    quando(/UPDATE CheckinInfantilAutorizados SET Nome = N'\(anonimizado\)'/, [{ n: 5 }]);
    const r = await db.aplicarRetencao(pool, { hoje: HOJE });
    expect(r).toEqual({ contatosApagados: 4, anonimizados: 2, autorizadosDeVisitaAnonimizados: 1, segundasViasAnonimizadas: 3, autorizadosAnonimizados: 5 });
    const curto = com(/SET TrouxeContato = NULL, SaudeTexto = CASE/)[0];
    expect(curto.inputs.d).toBe(90);
    expect(curto.sql).toMatch(/SaudeOrigem = 'BALCAO'/);
    const longo = com(/SET VisitanteNome = CASE/)[0];
    expect(longo.inputs.d).toBe(1825);
    expect(longo.sql).toMatch(/Situacao = 'RETIRADA'/);          // criança ainda na sala nunca é anonimizada
    expect(longo.sql).toMatch(/AnonimizadoEm = SYSUTCDATETIME\(\)/);
    // Achado na prova no banco real (e2e-19): o registro de criança MEMBRO "anonimizado" continuava ligado às pessoas pelas matrículas (criança, quem trouxe, quem retirou).
    expect(longo.sql).toMatch(/MenorMembroId = NULL, TrouxeMembroId = NULL, RetiradoMembroId = NULL/);
    // Revisão da v7.10: os textos livres que a liderança e o voluntário escreveram (motivo da decisão, do pedido e da baixa) saem junto com o nome
    expect(longo.sql).toMatch(/DivergenciaMotivo = NULL, DivergenciaPedidoMotivo = NULL, BaixaMotivo = NULL/);
    // ... o nome de quem pediu a segunda via (texto livre e matrícula) sai com o registro anonimizado
    const vias = com(/UPDATE v SET PessoaNome = NULL, PessoaMembroId = NULL FROM CheckinInfantilSegundasVias/)[0];
    expect(vias.sql).toMatch(/r\.AnonimizadoEm IS NOT NULL/);
    // ... e quem foi autorizado a retirar perde o nome, a matrícula e a referência da ficha 5 anos depois de revogado ou vencido (o texto neutro cumpre a coluna obrigatória)
    const aut = com(/UPDATE CheckinInfantilAutorizados SET Nome = N'\(anonimizado\)'/)[0];
    expect(aut.inputs.d).toBe(1825);
    expect(aut.sql).toMatch(/AutorizadoMembroId = NULL/);
    expect(aut.sql).toMatch(/RevogadoEm IS NOT NULL AND RevogadoEm < DATEADD\(DAY, -@d/);
    expect(aut.sql).toMatch(/ValidoAte IS NOT NULL AND ValidoAte < DATEADD\(DAY, -@d/);
    expect(aut.sql).toMatch(/Forma = 'FICHA_FISICA' THEN N'\(anonimizado\)'/);        // a ficha exige referência: o texto neutro no lugar
  });
  test("o histórico do responsável só traz as crianças de que ele é responsável ATIVO e nunca o código, o voluntário ou a saúde", async () => {
    quando(/WHERE r\.MenorMembroId IS NOT NULL AND m\.DataNascimento IS NOT NULL/, [{
      RegistroId: 9, MenorMembroId: 30, CriancaNome: "Caio Souza", EquipeNome: "Maternal", CongregacaoNome: "Central", ServicoDataHora: new Date("2026-10-18T09:00:00Z"), EntregueEm: new Date("2026-10-18T12:05:00Z"),
      RetiradoEm: new Date("2026-10-18T13:30:00Z"), Situacao: "RETIRADA", TrouxeNomeResolvido: "Maria Souza", RetiradoNomeResolvido: "Dona Lúcia", Divergente: 0, CodigoHash: "h", SaudeTexto: "alergia", EntreguePorMembroId: 10
    }]);
    const h = await db.historicoDoResponsavel(pool, { responsavelId: 40, menorId: 30 });
    const consulta = com(/WHERE r\.MenorMembroId IS NOT NULL/)[0];
    expect(consulta.sql).toMatch(/v\.ResponsavelMembroId = @r AND v\.RevogadoEm IS NULL/);
    expect(consulta.inputs).toMatchObject({ r: 40, m: 30 });
    // (revisão) só de quem AINDA é menor: quem fez 18 anos sai do histórico do responsável
    expect(consulta.sql).toMatch(/m\.DataNascimento > DATEADD\(YEAR, -18, @hoje\)/);
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

// Achados da prova no SQL Server de verdade (tools/e2e-localdb, e2e-19 a e2e-22): cada teste abaixo reprova sem a correção correspondente.
describe("achados da prova no banco real", () => {
  const SALA_BANCO = { ServicoId: 5, EquipeId: 7, EquipeNome: "Maternal", FaixaEtariaMenores: "MATERNAL", LiderMembroId: 600, ContatoComMenores: 1, Ativa: 1, CongregacaoId: 1, CongregacaoNome: "Central", DataHora: new Date("2026-10-18T09:00:00Z"), ServicoStatus: "PUBLICADA" };
  const salaDoBanco = (extra = {}) => quando(/FROM EscalasServicos s\s+JOIN EscalasEquipes e ON e\.EquipeId = @e/, [{ ...SALA_BANCO, ...extra }]);

  test("a criança que JÁ está na sala continua alcançável se a equipe perde a marca no meio do serviço (retirar, segunda via, destravar, decidir); só criança NOVA exige a marca", async () => {
    salaDoBanco({ ContatoComMenores: 0 });
    quando(/WHERE r\.RegistroId = @r/, [{ RegistroId: 9, ServicoId: 5, EquipeId: 7, Situacao: "NA_SALA" }]);
    const rs = await db.registroComSala(pool, 9);
    expect(rs.sucesso).toBe(true);
    expect(rs.sala).toMatchObject({ servicoId: 5, equipeId: 7, comMarca: false });
    expect(await db.contextoDaSala(pool, { servicoId: 5, equipeId: 7 })).toMatchObject({ sucesso: false, mensagem: ck.MENSAGENS.SALA_SEM_MARCA });
    expect((await db.contextoDaSala(pool, { servicoId: 5, equipeId: 7 }, { exigirMarca: false })).sucesso).toBe(true);
  });
  test("equipe DESATIVADA não recebe voluntário novo nem criança nova", async () => {
    escalado(); presenteNaSala(); salaCom([10, 11], 0);
    const desativada = { ...SALA, equipeAtiva: false };
    const e = await db.entrarNaSala(pool, { sala: desativada, membroId: 10, hoje: HOJE, agoraIso: AGORA });
    expect(e).toMatchObject({ sucesso: false, mensagem: ck.MENSAGENS.EQUIPE_DESATIVADA });
    const c = await db.fazerCheckin(pool, { sala: desativada, operadorId: 10, dados: { servicoId: 5, equipeId: 7, criancas: [{ tipo: "VISITANTE", nome: "Davi Lima", nascimento: "2021-03-02", idade: 5, saude: null }], trouxe: { nome: "Paula Lima", parentesco: "MAE", documento: "RG", contato: "94991112222" }, extras: [] }, hoje: HOJE, agoraIso: AGORA });
    expect(c).toMatchObject({ sucesso: false, mensagem: ck.MENSAGENS.EQUIPE_DESATIVADA });
    expect(escritas()).toHaveLength(0);
  });
  test("o responsável cadastrado (responsavelId) só vale com criança MEMBRO no pedido: com só visitante, recusa e nem consulta a matrícula (não vira sonda nem deixa qualquer membro virar 'quem trouxe')", async () => {
    escalado(); presenteNaSala(); salaCom([10, 11], 0);
    const dados = { servicoId: 5, equipeId: 7, trouxe: { membroId: 40 }, extras: [], criancas: [{ tipo: "VISITANTE", nome: "Davi Lima", nascimento: "2019-03-02", idade: 7, saude: null }] };
    const r = await db.fazerCheckin(pool, { sala: SALA, operadorId: 10, dados, hoje: HOJE, agoraIso: AGORA });
    expect(r).toMatchObject({ sucesso: false, mensagem: ck.MENSAGENS.RESPONSAVEL_SO_DE_MEMBRO });
    expect(com(/INSERT INTO CheckinInfantilRegistros/)).toHaveLength(0);
    expect(com(/SELECT Nome FROM MembroReferencia WHERE MembroId = @m/)).toHaveLength(0);
  });
  test("relacionadoComASala: o líder da equipe e quem está escalado (aceito ou confirmado) têm relação; quem não está, não", async () => {
    expect(await db.relacionadoComASala(pool, SALA, 600)).toBe(true);
    expect(mockConsultas).toHaveLength(0);                       // o líder nem precisa de consulta
    quando(/FROM EscalasAlocacoes WHERE ServicoId = @s AND EquipeId = @e AND MembroId = @m AND Status IN \('ACEITO','CONFIRMADO'\)/, [{ x: 1 }]);
    expect(await db.relacionadoComASala(pool, SALA, 10)).toBe(true);
    mockRegras = [];
    expect(await db.relacionadoComASala(pool, SALA, 11)).toBe(false);
  });
  test("a lista de salas de hoje mantém a sala que tem criança ou voluntário DENTRO mesmo se a equipe perdeu a marca, foi desativada ou o serviço foi cancelado", async () => {
    await db.minhasSalas(pool, { membroId: 10, hoje: HOJE });
    const consulta = com(/FROM EscalasServicos s\s+JOIN EscalasEquipes e/)[0].sql;
    expect(consulta).toMatch(/OR EXISTS \(SELECT 1 FROM CheckinInfantilRegistros r WHERE r\.ServicoId = s\.ServicoId AND r\.EquipeId = e\.EquipeId AND r\.Situacao <> 'RETIRADA'\)/);
    expect(consulta).toMatch(/OR EXISTS \(SELECT 1 FROM CheckinInfantilVoluntarios v WHERE v\.ServicoId = s\.ServicoId AND v\.EquipeId = e\.EquipeId AND v\.SaiuEm IS NULL\)/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Revisão adversarial da v7.10 (servidor). Cada teste abaixo reprova no código de antes da revisão (git show HEAD:api/shared/checkinInfantilDb.js) e passa no de agora; o banco de verdade
// (gatilhos, CHECK, transações, corridas) é provado em tools/e2e-localdb/e2e-22-checkin-revisao.js.
// ---------------------------------------------------------------------------------------------------------------------------------------------------
describe("A1: encerrar a sala (baixa administrativa)", () => {
  const FECHADA = "2026-10-18T15:30";                                  // o serviço é das 09:00 e a janela fecha 5 horas depois
  const ABERTA = "2026-10-18T10:00";
  const CONTA = /SELECT COUNT\(\*\) AS n FROM CheckinInfantilRegistros WHERE ServicoId = @s AND EquipeId = @e AND Situacao <> 'RETIRADA'/;
  const encerrar = (extra = {}) => db.encerrarSala(pool, { sala: SALA, gestorId: 77, motivo: "Os voluntários esqueceram de registrar as retiradas.", agoraIso: FECHADA, ...extra });
  const ordem = () => mockConsultas.map((c) => c.sql);
  function preparar({ criancas = 3, baixadas = [{ RegistroId: 1, SituacaoAntes: "NA_SALA" }, { RegistroId: 2, SituacaoAntes: "NA_SALA" }, { RegistroId: 3, SituacaoAntes: "RETIRADA_PENDENTE" }], voluntarios = [{ MembroId: 10 }, { MembroId: 11 }] } = {}) {
    quando(CONTA, [{ n: criancas }]);
    quando(/DECLARE @b TABLE/, baixadas);
    quando(/DECLARE @v TABLE/, voluntarios);
  }

  test("com o check-in da sala aberto e criança nela: recusa, desfaz a transação e não grava, não baixa e não audita nada", async () => {
    preparar();
    const r = await encerrar({ agoraIso: ABERTA });
    expect(r).toMatchObject({ sucesso: false, mensagem: ck.MENSAGENS.SALA_AINDA_ABERTA });
    expect(com(/DECLARE @b TABLE/)).toHaveLength(0);
    expect(com(/DECLARE @v TABLE/)).toHaveLength(0);
    expect(escritas()).toHaveLength(0);
    expect(ordem()).toContain("ROLLBACK");
    expect(ordem()).not.toContain("COMMIT");
    expect(registrarAuditoriaNaTransacao).not.toHaveBeenCalled();
  });

  test("janela fechada: UMA baixa em lote (sem retirante, com quem deu a baixa e o motivo), os voluntários saem, os eventos imutáveis e a auditoria entram na MESMA transação, sob a trava da sala", async () => {
    preparar();
    require("../financeiroSeguro").obterTrava.mockImplementationOnce(async (_exec, nome) => { mockConsultas.push({ sql: "TRAVA", inputs: { r: nome } }); return true; });
    const r = await encerrar();
    expect(r).toEqual({ sucesso: true, baixadas: 3, semAviso: false, mensagem: expect.stringMatching(/3 criança\(s\) receberam a baixa administrativa.*2 voluntário\(s\) saíram/) });
    const baixa = com(/DECLARE @b TABLE/)[0];
    expect(baixa.inputs).toMatchObject({ s: 5, e: 7, g: 77, m: "Os voluntários esqueceram de registrar as retiradas." });
    expect(baixa.sql).toMatch(/SET Situacao = 'RETIRADA', RetiradoEm = SYSUTCDATETIME\(\), RetiradoTipo = 'BAIXA_ADM', RetiradoMembroId = NULL, RetiradoNome = NULL, RetiradoParentesco = NULL/);
    expect(baixa.sql).toMatch(/RetiradoPorOperadorId = @g, BaixaMotivo = @m/);
    expect(baixa.sql).toMatch(/WHERE ServicoId = @s AND EquipeId = @e AND Situacao IN \('NA_SALA', 'RETIRADA_PENDENTE'\)/);
    expect(baixa.sql).toMatch(/OUTPUT INSERTED\.RegistroId, DELETED\.Situacao INTO @b/);                       // a tabela tem gatilho: OUTPUT só com INTO
    expect(baixa.sql).toMatch(/UPDATE CheckinInfantilSegundasVias SET CanceladaEm = SYSUTCDATETIME\(\) WHERE ConfirmadaEm IS NULL AND CanceladaEm IS NULL AND RegistroId IN \(SELECT RegistroId FROM @b\)/);
    expect(baixa.sql).not.toMatch(/CodigoHash|CodigoGeracao/);                                                    // a baixa não usa nem troca o código
    expect(com(/DECLARE @v TABLE/)[0].sql).toMatch(/UPDATE CheckinInfantilVoluntarios SET SaiuEm = SYSUTCDATETIME\(\)[\s\S]*WHERE ServicoId = @s AND EquipeId = @e AND SaiuEm IS NULL/);
    const eventos = com(/INSERT INTO CheckinInfantilEventos/).map((c) => c.inputs);
    expect(eventos.map((x) => [x.t, x.r, x.a, x.d])).toEqual([
      ["BAIXA_ADMINISTRATIVA", 1, 77, "NA_SALA"], ["BAIXA_ADMINISTRATIVA", 2, 77, "NA_SALA"], ["BAIXA_ADMINISTRATIVA", 3, 77, "RETIRADA_PENDENTE"],
      ["VOLUNTARIO_SAIU", null, 77, "sala encerrada pela liderança"], ["VOLUNTARIO_SAIU", null, 77, "sala encerrada pela liderança"],
      ["SALA_ENCERRADA", null, 77, "baixadas=3;voluntarios=2"]
    ]);
    // a ordem: BEGIN, trava, baixa, saída dos voluntários, eventos, auditoria (na transação), COMMIT
    const o = ordem();
    const iBegin = o.indexOf("BEGIN"), iTrava = o.indexOf("TRAVA"), iBaixa = o.findIndex((s) => /DECLARE @b TABLE/.test(s)), iEvento = o.findIndex((s) => /INSERT INTO CheckinInfantilEventos/.test(s)), iCommit = o.indexOf("COMMIT");
    expect([iBegin < iTrava, iTrava < iBaixa, iBaixa < iEvento, iEvento < iCommit]).toEqual([true, true, true, true]);
    expect(mockConsultas[iTrava].inputs).toMatchObject({ r: "checkin-sala:5:7" });
    expect(registrarAuditoriaNaTransacao).toHaveBeenCalledTimes(1);
    expect(registrarAuditoriaNaTransacao.mock.calls[0][1]).toMatchObject({ acao: "CHECKIN_SALA_ENCERRADA", usuarioId: 77, dadosDepois: { servicoId: 5, equipeId: 7, baixadas: 3, voluntarios: 2 } });
    expect(registrarAuditoria).not.toHaveBeenCalled();
    // o motivo (texto livre) nunca vai para evento, auditoria nem aviso: só para a coluna da baixa
    expect(JSON.stringify([eventos, registrarAuditoriaNaTransacao.mock.calls.map((c) => c[1]), notificarAgora.mock.calls])).not.toMatch(/esqueceram/);
  });

  test("repetir não baixa de novo nem dá erro: sala já encerrada responde 'já estava' sem gravar evento nenhum", async () => {
    preparar({ criancas: 0, baixadas: [], voluntarios: [] });
    const r = await encerrar();
    expect(r).toMatchObject({ sucesso: true, baixadas: 0, jaEncerrada: true });
    expect(com(/DECLARE @b TABLE/)).toHaveLength(0);               // sem criança aberta nem a consulta da baixa é feita
    expect(com(/INSERT INTO CheckinInfantilEventos/)).toHaveLength(0);
    expect(registrarAuditoriaNaTransacao).not.toHaveBeenCalled();
    expect(ordem()).toContain("ROLLBACK");
  });

  test("sem criança e com voluntário ainda 'presente': encerra mesmo com o check-in aberto (ninguém é baixado, os voluntários saem)", async () => {
    preparar({ criancas: 0, baixadas: [], voluntarios: [{ MembroId: 10 }] });
    const r = await encerrar({ agoraIso: ABERTA });
    expect(r).toMatchObject({ sucesso: true, baixadas: 0 });
    expect(r.jaEncerrada).toBeUndefined();
    expect(com(/INSERT INTO CheckinInfantilEventos/).map((c) => c.inputs.t)).toEqual(["VOLUNTARIO_SAIU", "SALA_ENCERRADA"]);
    expect(ordem()).toContain("COMMIT");
  });

  test("serviço cancelado com criança dentro: encerra mesmo com a janela ainda aberta", async () => {
    preparar();
    const r = await db.encerrarSala(pool, { sala: { ...SALA, servicoStatus: "CANCELADA" }, gestorId: 77, motivo: "Serviço cancelado com a sala ocupada.", agoraIso: ABERTA });
    expect(r).toMatchObject({ sucesso: true, baixadas: 3 });
  });

  test("a sala ocupada por outra operação (trava): recusa sem consultar nem gravar", async () => {
    require("../financeiroSeguro").obterTrava.mockResolvedValueOnce(false);
    const r = await encerrar();
    expect(r.sucesso).toBe(false); expect(r.mensagem).toMatch(/ocupada/);
    expect(com(/DECLARE @b TABLE/)).toHaveLength(0);
    expect(ordem()).toContain("ROLLBACK");
  });

  test("um erro no meio (o evento não grava): desfaz TUDO e propaga (nada fica meio encerrado)", async () => {
    preparar();
    quando(/INSERT INTO CheckinInfantilEventos/, () => { throw new Error("queda do banco"); });
    await expect(encerrar()).rejects.toThrow(/queda do banco/);
    expect(ordem()).toContain("ROLLBACK");
    expect(ordem()).not.toContain("COMMIT");
    expect(registrarAuditoriaNaTransacao).not.toHaveBeenCalled();
  });
});

describe("A2: o que um responsável autorizou só vale enquanto ele continua responsável", () => {
  const EFETIVO = /\(a\.Forma = 'FICHA_FISICA' OR EXISTS \(SELECT 1 FROM VoluntariadoResponsaveis vr WHERE vr\.MenorMembroId = a\.MenorMembroId AND vr\.ResponsavelMembroId = a\.RegistradoPorMembroId AND vr\.RevogadoEm IS NULL\)\)/;
  test("a lista de quem pode retirar (carregarAutorizados) só traz a ficha da Secretaria OU quem foi autorizado por responsável ainda ativo", async () => {
    await db.carregarAutorizados(pool, [{ RegistroId: 9, MenorMembroId: 30 }], { hoje: HOJE });
    const c = com(/FROM CheckinInfantilAutorizados a/)[0];
    expect(c.sql).toMatch(EFETIVO);
    expect(c.sql).toMatch(/a\.RevogadoEm IS NULL AND \(a\.ValidoAte IS NULL OR a\.ValidoAte >= @hoje\)/);
  });
  test("a tela do responsável (autorizados) e o teto de 8 olham a mesma regra (a linha sem efeito nem aparece nem ocupa vaga)", async () => {
    quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c ON c\.CongregacaoId = m\.CongregacaoId WHERE m\.MembroId = @m/, [{ MembroId: 30, Nome: "Caio Souza", DataNascimento: new Date("2021-03-01T00:00:00Z"), CongregacaoId: 1, CongregacaoNome: "Central" }]);
    quando(/FROM VoluntariadoResponsaveis WHERE MenorMembroId = @m AND ResponsavelMembroId = @r AND RevogadoEm IS NULL/, [{ x: 1 }]);
    await db.listarAutorizados(pool, { menorId: 30, atorId: 40, hoje: HOJE });
    expect(com(/SELECT a\.AutorizadoId, a\.Nome, a\.Parentesco/)[0].sql).toMatch(EFETIVO);
    quando(/SELECT COUNT\(\*\) AS n FROM CheckinInfantilAutorizados a/, [{ n: 0 }]);
    quando(/INSERT INTO CheckinInfantilAutorizados/, [{ AutorizadoId: 1 }]);
    await db.adicionarAutorizado(pool, { dados: { menorId: 30, nome: "Dona Lúcia", parentesco: "AVO", membroId: null, validoAte: null, referencia: null }, atorId: 40, forma: "RESPONSAVEL", hoje: HOJE });
    expect(com(/SELECT COUNT\(\*\) AS n FROM CheckinInfantilAutorizados a/)[0].sql).toMatch(EFETIVO);
  });
  test("revogar o responsável revoga o que ele autorizou (só a forma RESPONSAVEL, nunca a ficha), audita só ids e AVISA a liderança sem nome de criança", async () => {
    quando(/UPDATE CheckinInfantilAutorizados SET RevogadoEm = SYSUTCDATETIME\(\), RevogadoPorMembroId = @por/, [{ n: 2 }]);
    const r = await db.tratarAutorizadosDoResponsavelRevogado(pool, { menorId: 30, responsavelMembroId: 40, cadastroId: 12, congregacaoId: 1, por: 5 });
    expect(r).toEqual({ revogados: 2, avisados: 1 });
    const up = com(/UPDATE CheckinInfantilAutorizados SET RevogadoEm/)[0];
    expect(up.inputs).toMatchObject({ m: 30, r: 40, por: 5 });
    expect(up.sql).toMatch(/Forma = 'RESPONSAVEL' AND RegistradoPorMembroId = @r/);
    expect(up.sql).toMatch(/NOT EXISTS \(SELECT 1 FROM VoluntariadoResponsaveis vr WHERE vr\.MenorMembroId = @m AND vr\.ResponsavelMembroId = @r AND vr\.RevogadoEm IS NULL\)/);
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "CHECKIN_AUTORIZADOS_REVOGADOS_COM_RESPONSAVEL", usuarioId: 5, dadosDepois: { menorId: 30, quantidade: 2 } });
    const aviso = notificarAgora.mock.calls[0][1];
    expect(aviso).toMatchObject({ regraChave: "CHECKIN_AUTORIZADOS_DEPENDENTES", referenciaId: 12, referenciaTabela: "VoluntariadoResponsaveis" });
    expect(aviso.destinatarios.map((d) => d.membroId)).toEqual([900]);
    expect(aviso.mensagem).toMatch(/^2 autorização\(ões\)/);
    expect(aviso.mensagem).not.toMatch(/Caio|Souza/);
  });
  test("sem nada a revogar não audita nem avisa; e se o aviso falhar o ato não falha (a leitura já ignora essas autorizações)", async () => {
    quando(/UPDATE CheckinInfantilAutorizados SET RevogadoEm/, [{ n: 0 }]);
    expect(await db.tratarAutorizadosDoResponsavelRevogado(pool, { menorId: 30, responsavelMembroId: 40, cadastroId: 12, congregacaoId: 1, por: 5 })).toEqual({ revogados: 0, avisados: 0 });
    expect(registrarAuditoria).not.toHaveBeenCalled(); expect(notificarAgora).not.toHaveBeenCalled();
    mockRegras = []; quando(/UPDATE CheckinInfantilAutorizados SET RevogadoEm/, [{ n: 1 }]);
    require("../psc").resolverDestinatariosDaCongregacao.mockRejectedValueOnce(new Error("sem banco"));
    expect(await db.tratarAutorizadosDoResponsavelRevogado(pool, { menorId: 30, responsavelMembroId: 40, cadastroId: 12, congregacaoId: 1, por: 5 })).toEqual({ revogados: 1, avisados: 0 });
  });
});

describe("a tela da sala depois da revisão (B5, B10, C17, C24)", () => {
  const REGISTROS = /SELECT r\.RegistroId, r\.ServicoId[\s\S]*WHERE r\.ServicoId = @s AND r\.EquipeId = @e AND r\.Situacao <> 'RETIRADA' ORDER BY r\.RegistroId/;
  const reg = (extra = {}) => ({ RegistroId: 9, ServicoId: 5, EquipeId: 7, MenorMembroId: null, VisitanteNome: "Davi Lima", CriancaNome: "Davi Lima", IdadeAnos: 5, IdadeForaDaFaixa: 0, TrouxeNomeResolvido: "Paula Lima", TrouxeParentesco: "MAE", TrouxeContato: "94991112222",
    SaudeTexto: null, Tentativas: 0, Travado: 0, Situacao: "NA_SALA", EntregueEm: new Date("2026-10-18T12:05:00Z"), ...extra });
  function preparar(regs = [reg()]) {
    salaCom([10, 11, 12], regs.length);
    quando(REGISTROS, regs);
    quando(/SELECT COUNT\(\*\) AS entregues/, [{ entregues: regs.length, retiradas: 0 }]);
    mmDb.aptidaoEmLote.mockImplementation(async (_p, ids) => new Map(ids.map((i) => [Number(i), i === 11 ? { apto: false, contaComoAdulto: false, bloqueios: [{ codigo: "INCIDENTE_EM_APURACAO", mensagem: "x" }] } : APTO])));
  }
  const snapshot = (visao) => db.snapshotDaSala(pool, SALA, { hoje: HOJE, agoraIso: AGORA, visao });

  test("o voluntário NÃO recebe 'apto' dos colegas (só 'contaComoAdulto'); a liderança continua recebendo", async () => {
    preparar();
    const op = await snapshot("OPERADOR");
    expect(op.adultosPresentes).toHaveLength(3);
    for (const a of op.adultosPresentes) { expect("apto" in a).toBe(false); expect(typeof a.contaComoAdulto).toBe("boolean"); expect(Object.keys(a).sort()).toEqual(["contaComoAdulto", "entrouEm", "membroId", "nome"]); }
    expect(op.adultosPresentes.find((a) => a.membroId === 11).contaComoAdulto).toBe(false);
    expect(op.lotacao.adultos).toBe(2);                                               // o colega inapto continua fora da conta da lotação
    expect(JSON.stringify(op)).not.toMatch(/"apto"|INCIDENTE/);
    const gestor = await snapshot("GESTOR");
    expect(gestor.adultosPresentes.find((a) => a.membroId === 11)).toMatchObject({ apto: false, contaComoAdulto: false });
    expect(JSON.stringify(gestor)).not.toMatch(/INCIDENTE/);                           // nem a liderança vê o motivo reservado
  });

  test("a segunda via pendente mostra DE QUEM é o pedido (nome do cadastro quando a pessoa é membro) e o documento conferido", async () => {
    preparar();
    quando(/FROM CheckinInfantilSegundasVias v LEFT JOIN MembroReferencia pm ON pm\.MembroId = v\.PessoaMembroId/, [{ ViaId: 3, RegistroId: 9, PedidaPorMembroId: 10, PedidaEm: new Date(), PessoaTipo: "RESPONSAVEL", PessoaNome: "Maria Souza (do cadastro)", Documento: "CNH" }]);
    const s = await snapshot("OPERADOR");
    expect(s.criancas[0].segundaViaPendente).toMatchObject({ viaId: 3, pedidaPorMembroId: 10, pessoaNome: "Maria Souza (do cadastro)", documento: "CNH" });
    const c = com(/FROM CheckinInfantilSegundasVias v LEFT JOIN/)[0];
    expect(c.sql).toMatch(/COALESCE\(pm\.Nome, v\.PessoaNome\) AS PessoaNome, v\.Documento/);
    expect(c.sql).toMatch(/ConfirmadaEm IS NULL AND v\.CanceladaEm IS NULL/);
  });

  test("o motivo do pedido divergente só vai ao cartão da liderança (nunca ao voluntário)", async () => {
    preparar([reg({ Situacao: "RETIRADA_PENDENTE", DivergenciaPedidaEm: new Date(), RetiradoNomeResolvido: "Roberto Dias", RetiradoParentesco: "AMIGO_FAMILIA", RetiradoDocumento: "RG", RetiradoPorOperadorId: 10, DivergenciaPedidoMotivo: "Disse que a mãe mandou." })]);
    const g = await snapshot("GESTOR"), o = await snapshot("OPERADOR");
    expect(g.criancas[0].divergencia).toMatchObject({ quem: { nome: "Roberto Dias" }, motivo: "Disse que a mãe mandou." });
    expect("motivo" in o.criancas[0].divergencia).toBe(false);
    expect(JSON.stringify(o)).not.toMatch(/mandou/);
  });

  test("criança no teto de erros sem o travamento gravado (queda no meio, ou prazo reduzido depois) aparece TRAVADA e conta como pendência", async () => {
    preparar([reg({ Tentativas: 5, Travado: 0 })]);
    const s = await snapshot("OPERADOR");
    expect(s.criancas[0]).toMatchObject({ travado: true, tentativasRestantes: 0 });
    expect(s.pendencias.travadas).toBe(1);
    mockRegras = []; preparar([reg({ Tentativas: 4, Travado: 0 })]);
    expect((await snapshot("OPERADOR")).criancas[0].travado).toBe(false);
  });

  test("a lista de salas de hoje inclui, para a liderança, a sala de um DIA ANTERIOR que ficou com criança ou voluntário (para encerrar), marcada como diaAnterior; o voluntário não a vê", async () => {
    quando(/SELECT DISTINCT s\.ServicoId, s\.DataHora/, [
      { ServicoId: 4, DataHora: new Date("2026-10-11T09:00:00Z"), Descricao: "Culto", ServicoStatus: "PUBLICADA", EquipeId: 7, EquipeNome: "Maternal", FaixaEtariaMenores: "MATERNAL", LiderMembroId: 600, CongregacaoId: 1, CongregacaoNome: "Central", Meu: 1 },
      { ServicoId: 5, DataHora: new Date("2026-10-18T09:00:00Z"), Descricao: "Culto", ServicoStatus: "PUBLICADA", EquipeId: 7, EquipeNome: "Maternal", FaixaEtariaMenores: "MATERNAL", LiderMembroId: 600, CongregacaoId: 1, CongregacaoNome: "Central", Meu: 1 }
    ]);
    quando(/SELECT \(SELECT COUNT\(\*\) FROM CheckinInfantilRegistros/, [{ criancas: 2, voluntarios: 0 }]);
    const operador = await db.minhasSalas(pool, { membroId: 10, hoje: HOJE, agoraIso: AGORA });
    expect(operador.map((s) => s.servicoId)).toEqual([5]);
    expect(operador[0].diaAnterior).toBe(false);
    const gestao = await db.minhasSalas(pool, { membroId: 77, gestorPodeVer: (n) => n === "Central", hoje: HOJE, agoraIso: AGORA });
    expect(gestao.map((s) => [s.servicoId, s.diaAnterior])).toEqual([[4, true], [5, false]]);
    const lista = com(/SELECT DISTINCT s\.ServicoId, s\.DataHora/)[0].sql;
    expect(lista).toMatch(/CAST\(s\.DataHora AS DATE\) < @hoje/);
  });
});

describe("B9: o aviso obrigatório não falha em silêncio e nenhum erro de aviso vem depois do ato gravado", () => {
  const CODIGO = "AB3K9Z";
  const hashDe = (geracao = 1) => ck.hashCodigo(CODIGO, { registroId: 9, geracao, segredo: SEGREDO });
  const registro = (extra = {}) => ({ RegistroId: 9, ServicoId: 5, EquipeId: 7, CongregacaoId: 1, MenorMembroId: 30, VisitanteNome: null, IdadeAnos: 5, FaixaSala: "MATERNAL", IdadeForaDaFaixa: 0, TrouxeMembroId: 40, TrouxeNome: null, TrouxeNomeResolvido: "Maria Souza",
    TrouxeParentesco: null, SaudeTexto: null, CodigoGeracao: 1, Tentativas: 0, Travado: 0, Situacao: "NA_SALA", EntregueEm: new Date("2026-10-18T12:05:00Z"), EntreguePorMembroId: 10, CriancaNome: "Caio Souza", CodigoHash: hashDe(), ...extra });
  const OUTRO = { registroId: 9, codigo: CODIGO, retirante: { outro: { nome: "Roberto Dias", parentesco: "AMIGO_FAMILIA", documento: "CNH", motivo: "Disse que a mãe mandou." } } };
  const reais = () => notificarAgora.mockImplementation(async (_p, o) => ({ criadas: (o.destinatarios || []).length, externas: (o.destinatarios || []).length }));       // como o motor de verdade: sem destinatário, nada é criado
  function preparar({ reg = registro() } = {}) {
    escalado(); presenteNaSala(); reais();
    quando(/WHERE r\.RegistroId = @r/, [reg]);
    quando(/SELECT r\.MenorMembroId, r\.ResponsavelMembroId, r\.Vinculo, p\.Nome FROM VoluntariadoResponsaveis/, [{ MenorMembroId: 30, ResponsavelMembroId: 40, Vinculo: "MAE", Nome: "Maria Souza" }]);
    quando(/UPDATE CheckinInfantilRegistros SET Tentativas = Tentativas \+ 1/, [{ tentativas: 1, hash: hashDe(), geracao: 1 }]);
    quando(/UPDATE CheckinInfantilRegistros SET Situacao = 'RETIRADA_PENDENTE'/, [{ n: 1 }]);
    quando(/SELECT TOP 1 EventoId FROM CheckinInfantilEventos/, [{ EventoId: 321 }]);
    quando(/SELECT p\.MembroId, p\.Nome, p\.Email FROM VoluntariadoResponsaveis/, [{ MembroId: 40, Nome: "Maria Souza", Email: "maria@e.org" }]);
    quando(/SELECT MembroId, Nome, Email FROM MembroReferencia WHERE MembroId = @m/, [{ MembroId: 600, Nome: "Líder", Email: "l@e.org" }]);
  }
  const retirar = (dados = OUTRO) => db.retirar(pool, { sala: SALA, registroId: 9, operadorId: 10, dados, hoje: HOJE });

  test("retirada divergente: a lista de quem avisar é montada ANTES de gravar o pedido", async () => {
    preparar();
    require("../psc").resolverDestinatariosDaCongregacao.mockImplementationOnce(async () => { mockConsultas.push({ sql: "LISTA_DE_AVISO", inputs: {} }); return [{ membroId: 900, nome: "Dirigente", email: "d@e.org" }]; });
    await retirar();
    const o = mockConsultas.map((c) => c.sql);
    expect(o.indexOf("LISTA_DE_AVISO")).toBeGreaterThanOrEqual(0);
    expect(o.indexOf("LISTA_DE_AVISO")).toBeLessThan(o.findIndex((s) => /SET Tentativas = Tentativas \+ 1/.test(s)));
    expect(o.indexOf("LISTA_DE_AVISO")).toBeLessThan(o.findIndex((s) => /SET Situacao = 'RETIRADA_PENDENTE'/.test(s)));
  });
  test("com o aviso saindo: a resposta diz que foi enviado à liderança (semAviso false) e leva o número de avisados; o motivo vai para a coluna do pedido", async () => {
    preparar();
    const r = await retirar();
    expect(r).toMatchObject({ sucesso: true, divergente: true, aguardaLideranca: true, semAviso: false, avisados: 3 });
    expect(r.mensagem).toMatch(/enviado à liderança/);
    const up = com(/SET Situacao = 'RETIRADA_PENDENTE'/)[0];
    expect(up.sql).toMatch(/DivergenciaPedidoMotivo = @mt/);
    expect(up.inputs.mt).toBe("Disse que a mãe mandou.");
    expect(JSON.stringify(registrarAuditoria.mock.calls)).not.toMatch(/mandou/);
  });
  test("o aviso NÃO sai (regra inativa: o motor devolve criadas 0): a resposta diz CLARAMENTE que a liderança não foi avisada, e o pedido continua válido", async () => {
    preparar();
    notificarAgora.mockImplementation(async () => ({ criadas: 0 }));
    const r = await retirar();
    expect(r).toMatchObject({ sucesso: true, divergente: true, aguardaLideranca: true, semAviso: true, avisados: 0 });
    expect(r.mensagem).toMatch(/NÃO foi avisada/);
    expect(r.mensagem).toMatch(/ligue agora para a liderança/);
    expect(com(/SET Situacao = 'RETIRADA_PENDENTE'/)).toHaveLength(1);
  });
  test("o aviso ficou SÓ no sino do app (criado, mas nenhum e-mail aceito e nenhum push): a liderança NÃO conta como avisada (Trava 7-B)", async () => {
    preparar();
    notificarAgora.mockImplementation(async () => ({ criadas: 2, externas: 0 }));
    const r = await retirar();
    expect(r).toMatchObject({ sucesso: true, divergente: true, semAviso: true, avisados: 0 });
    expect(r.mensagem).toMatch(/ligue agora para a liderança/);
  });
  test("a lista de quem avisar FALHA: o pedido é gravado, nada lança depois do UPDATE, e a resposta diz que ninguém foi avisado (antes: 500 e, na nova tentativa, 'já há um pedido')", async () => {
    preparar();
    require("../psc").resolverDestinatariosDaCongregacao.mockRejectedValueOnce(new Error("banco fora do ar"));
    const r = await retirar();
    expect(r).toMatchObject({ sucesso: true, divergente: true, semAviso: true, avisados: 0 });
    expect(com(/SET Situacao = 'RETIRADA_PENDENTE'/)).toHaveLength(1);
    expect(com(/INSERT INTO CheckinInfantilEventos/)[0].inputs.t).toBe("RETIRADA_DIVERGENTE_PEDIDA");
    expect(notificarAgora).not.toHaveBeenCalled();                     // sem destinatário, nem tenta
  });
  test("o motor de aviso lança depois do UPDATE: ainda assim a resposta é de sucesso (com 'semAviso')", async () => {
    preparar();
    notificarAgora.mockRejectedValue(new Error("fila fora do ar"));
    const r = await retirar();
    expect(r).toMatchObject({ sucesso: true, divergente: true, semAviso: true });
  });
  test("motivo com marcação ou grande demais: recusa ANTES de reservar tentativa (nada é gasto)", async () => {
    preparar();
    for (const motivo of ["<b>x</b>", "m".repeat(301)]) {
      const r = await retirar({ ...OUTRO, retirante: { outro: { ...OUTRO.retirante.outro, motivo } } });
      expect(r.sucesso).toBe(false);
    }
    expect(com(/SET Tentativas = Tentativas \+ 1/)).toHaveLength(0);
  });

  describe("segunda via", () => {
    function prepararVia() {
      escalado(); presenteNaSala(); reais();
      quando(/WHERE r\.RegistroId = @r/, [registro({ EntregueEm: new Date("2026-10-18T12:05:00Z") })]);
      quando(/SELECT TOP 1 ViaId, PedidaPorMembroId FROM CheckinInfantilSegundasVias/, [{ ViaId: 3, PedidaPorMembroId: 10 }]);
      quando(/UPDATE CheckinInfantilSegundasVias SET ConfirmadaPorMembroId/, [{ n: 1 }]);
      quando(/UPDATE CheckinInfantilRegistros SET CodigoHash = @h, CodigoGeracao = @g/, [{ n: 1 }]);
      quando(/SELECT p\.MembroId, p\.Nome, p\.Email FROM VoluntariadoResponsaveis/, [{ MembroId: 40, Nome: "Maria Souza", Email: "m@e.org" }]);
      quando(/SELECT MembroId, Nome, Email FROM MembroReferencia WHERE MembroId = @m/, [{ MembroId: 600, Nome: "Líder", Email: "l@e.org" }]);
    }
    const confirmar = () => db.confirmarSegundaVia(pool, { sala: SALA, operadorId: 11, registroId: 9, hoje: HOJE });
    test("a lista de aviso é montada ANTES do commit e, se falhar, o código novo chega mesmo assim (antes: 500 depois do commit e o código se perdia)", async () => {
      prepararVia();
      require("../psc").resolverDestinatariosDaCongregacao.mockRejectedValueOnce(new Error("banco fora"));
      const r = await confirmar();
      expect(r.sucesso).toBe(true);
      expect(r.etiqueta.codigo).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
      expect(r).toMatchObject({ semAviso: true, avisados: 0 });
      expect(r.mensagem).toMatch(/não conseguiu avisar o responsável/);
      expect(mockConsultas.map((c) => c.sql)).toContain("COMMIT");
    });
    test("o aviso da segunda via ficou SÓ no sino (sem e-mail aceito nem push): semAviso, e o código novo sai (Trava 7-B)", async () => {
      prepararVia();
      notificarAgora.mockImplementation(async () => ({ criadas: 1, externas: 0 }));
      const r = await confirmar();
      expect(r).toMatchObject({ sucesso: true, semAviso: true, avisados: 0 });
      expect(r.etiqueta.codigo).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    });
    test("o aviso lança depois do commit: a resposta continua trazendo o código novo", async () => {
      prepararVia();
      notificarAgora.mockRejectedValue(new Error("fila fora"));
      const r = await confirmar();
      expect(r.sucesso).toBe(true); expect(r.etiqueta.codigo).toBeTruthy(); expect(r.semAviso).toBe(true);
    });
    test("aviso que sai: sem observação; criança visitante (nenhum responsável cadastrado a avisar) também não leva alerta", async () => {
      prepararVia();
      const r = await confirmar();
      expect(r).toMatchObject({ sucesso: true, semAviso: false, avisados: 1 });
      expect(r.mensagem).not.toMatch(/não conseguiu/);
      mockRegras = []; mockConsultas = []; prepararVia();
      trocar(/SELECT p\.MembroId, p\.Nome, p\.Email FROM VoluntariadoResponsaveis/, []);
      trocar(/WHERE r\.RegistroId = @r/, [registro({ MenorMembroId: null, VisitanteNome: "Davi Lima", TrouxeMembroId: null, TrouxeNome: "Paula Lima", TrouxeNomeResolvido: "Paula Lima" })]);
      const v = await confirmar();
      expect(v).toMatchObject({ sucesso: true, semAviso: false, avisados: 0 });
    });
    test("a etiqueta da segunda via traz a hora de ENTRADA original ('instante') e, à parte, a hora da reemissão ('segundaViaEm')", async () => {
      prepararVia();
      const r = await confirmar();
      expect(r.etiqueta.instante).toBe("2026-10-18T12:05:00.000Z");
      expect(new Date(r.etiqueta.segundaViaEm).getTime()).toBeGreaterThan(new Date("2026-10-18T12:05:00Z").getTime());
    });
  });
});

describe("B11: cache de 15 segundos só da CONFIGURAÇÃO (prazos e proporção), nunca de dado de custódia", () => {
  const { lerPrazoDias } = require("../canaisDb");
  test("dez leituras seguidas dos prazos fazem UMA leitura de cada prazo (4 consultas, não 40)", async () => {
    for (let i = 0; i < 10; i++) await db.lerPrazos(pool);
    expect(lerPrazoDias).toHaveBeenCalledTimes(4);
  });
  test("dez chamadas da tela da sala fazem uma leitura dos prazos do check-in e uma dos prazos da proporção (e leem a sala de verdade em TODAS)", async () => {
    salaCom([10, 11, 12], 0);
    for (let i = 0; i < 10; i++) await db.snapshotDaSala(pool, SALA, { hoje: HOJE, agoraIso: AGORA, visao: "OPERADOR" });
    expect(lerPrazoDias).toHaveBeenCalledTimes(4);
    expect(mmDb.lerPrazos).toHaveBeenCalledTimes(1);
    expect(mmDb.lerPrazosFaixas).toHaveBeenCalledTimes(1);
    expect(com(/SELECT v\.MembroId, m\.Nome, v\.EntrouEm FROM CheckinInfantilVoluntarios/)).toHaveLength(10);     // a presença NÃO fica em cache
    expect(com(/SELECT COUNT\(\*\) AS entregues/)).toHaveLength(10);
  });
  test("limparCaches() zera: a leitura seguinte volta ao banco, e o prazo novo vale", async () => {
    await db.lerPrazos(pool); expect(lerPrazoDias).toHaveBeenCalledTimes(4);
    db.limparCaches();
    lerPrazoDias.mockImplementation(async (_p, sigla, padrao) => (sigla === ck.SIGLAS_PRAZO.tentativasCodigo ? 3 : padrao));
    expect((await db.lerPrazos(pool)).tentativasCodigo).toBe(3);
    expect(lerPrazoDias).toHaveBeenCalledTimes(8);
  });
  test("o cache vale por 15 segundos (passado o prazo, lê de novo) e uma leitura que FALHOU não fica guardada", async () => {
    const agora = jest.spyOn(Date, "now");
    try {
      agora.mockReturnValue(1000000);
      await db.lerPrazos(pool); expect(lerPrazoDias).toHaveBeenCalledTimes(4);
      agora.mockReturnValue(1000000 + 14000); await db.lerPrazos(pool); expect(lerPrazoDias).toHaveBeenCalledTimes(4);
      agora.mockReturnValue(1000000 + 15001); await db.lerPrazos(pool); expect(lerPrazoDias).toHaveBeenCalledTimes(8);
      db.limparCaches(); lerPrazoDias.mockClear();
      lerPrazoDias.mockRejectedValueOnce(new Error("banco fora"));
      await expect(db.lerPrazos(pool)).rejects.toThrow(/banco fora/);
      await db.lerPrazos(pool);                                         // a falha não foi guardada: lê de novo e funciona
      expect(lerPrazoDias.mock.calls.length).toBeGreaterThanOrEqual(5);
    } finally { agora.mockRestore(); }
  });
});

describe("C15, C17, C23, C26", () => {
  test("C15: autorizado com matrícula grava o NOME DO CADASTRO, nunca o digitado", async () => {
    quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c ON c\.CongregacaoId = m\.CongregacaoId WHERE m\.MembroId = @m/, [{ MembroId: 30, Nome: "Caio Souza", DataNascimento: new Date("2021-03-01T00:00:00Z"), CongregacaoId: 1, CongregacaoNome: "Central" }]);
    quando(/FROM VoluntariadoResponsaveis WHERE MenorMembroId = @m AND ResponsavelMembroId = @r AND RevogadoEm IS NULL/, [{ x: 1 }]);
    quando(/SELECT MembroId, Nome, DataNascimento FROM MembroReferencia WHERE MembroId = @m/, [{ MembroId: 55, Nome: "Dina Avó do Cadastro", DataNascimento: new Date("1960-01-01T00:00:00Z") }]);
    quando(/SELECT COUNT\(\*\) AS n FROM CheckinInfantilAutorizados a/, [{ n: 0 }]);
    quando(/INSERT INTO CheckinInfantilAutorizados/, [{ AutorizadoId: 12 }]);
    await db.adicionarAutorizado(pool, { dados: { menorId: 30, nome: "Nome Digitado Que Não É Dela", parentesco: "AVO", membroId: 55, validoAte: null, referencia: null }, atorId: 40, forma: "RESPONSAVEL", hoje: HOJE });
    expect(com(/INSERT INTO CheckinInfantilAutorizados/)[0].inputs).toMatchObject({ am: 55, n: "Dina Avó do Cadastro" });
    mockConsultas = [];
    await db.adicionarAutorizado(pool, { dados: { menorId: 30, nome: "Tio Sem Cadastro", parentesco: "TIO", membroId: null, validoAte: null, referencia: null }, atorId: 40, forma: "RESPONSAVEL", hoje: HOJE });
    expect(com(/INSERT INTO CheckinInfantilAutorizados/)[0].inputs).toMatchObject({ am: null, n: "Tio Sem Cadastro" });         // sem matrícula, vale o nome digitado
  });

  test("C17: destravar também zera a criança que está no TETO de erros sem o travamento gravado (usa o prazo de tentativas)", async () => {
    quando(/WHERE r\.RegistroId = @r/, [{ RegistroId: 9, ServicoId: 5, EquipeId: 7, Situacao: "NA_SALA" }]);
    quando(/UPDATE CheckinInfantilRegistros SET Travado = 0, Tentativas = 0/, [{ n: 1 }]);
    expect(await db.destravar(pool, { sala: SALA, registroId: 9, gestorId: 77 })).toMatchObject({ sucesso: true });
    const up = com(/SET Travado = 0, Tentativas = 0/)[0];
    expect(up.sql).toMatch(/\(Travado = 1 OR Tentativas >= @max\)/);
    expect(up.inputs.max).toBe(5);
  });
  test("C17: a retirada de criança no teto sem o travamento responde 'travada' (e não gasta nem reserva tentativa)", async () => {
    escalado(); presenteNaSala();
    quando(/WHERE r\.RegistroId = @r/, [{ RegistroId: 9, ServicoId: 5, EquipeId: 7, MenorMembroId: null, VisitanteNome: "Davi", TrouxeMembroId: null, TrouxeNome: "Paula", Situacao: "NA_SALA", Travado: 0, Tentativas: 5, CodigoGeracao: 1 }]);
    const r = await db.retirar(pool, { sala: SALA, registroId: 9, operadorId: 10, dados: { registroId: 9, codigo: "AB3K9Z", retirante: { ref: "TROUXE" } }, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: false, travada: true });
    expect(com(/SET Tentativas = Tentativas \+ 1/)).toHaveLength(0);
  });

  test("C23: a recusa por lotação grava UM evento por sala por minuto (o histórico imutável não enche): o INSERT só vale se ainda não houve recusa no último minuto", async () => {
    escalado(); presenteNaSala(); salaCom([10], 0);                       // um adulto só: a regra dos dois adultos recusa
    quando(/FROM MembroReferencia WHERE MembroId = @m AND/, []);
    const dados = { servicoId: 5, equipeId: 7, criancas: [{ tipo: "VISITANTE", nome: "Davi Lima", nascimento: "2021-03-01", idade: 5, saude: null }], trouxe: { nome: "Paula Lima", parentesco: "MAE", documento: "RG", contato: "94991112222" }, extras: [] };
    const r = await db.fazerCheckin(pool, { sala: SALA, operadorId: 10, dados, hoje: HOJE, agoraIso: AGORA });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/nunca fica com um adulto só/);
    const ins = com(/INSERT INTO CheckinInfantilEventos/)[0];
    expect(ins.sql).toMatch(/WHERE \(SELECT COUNT\(\*\) FROM CheckinInfantilEventos WHERE ServicoId = @s AND EquipeId = @e AND Tipo = @t AND Em >= DATEADD\(MINUTE, -1, SYSUTCDATETIME\(\)\)\) < @max/);
    expect(ins.inputs).toMatchObject({ s: 5, e: 7, a: 10, t: "SALA_RECUSOU_CHECKIN", max: ck.RECUSAS_POR_SALA_POR_MINUTO });
    expect(ins.inputs.d).toMatch(/^ADULTOS_INSUFICIENTES;adultos=1;criancas=0$/);
    expect(ck.RECUSAS_POR_SALA_POR_MINUTO).toBe(1);
  });

  test("C26: a busca de criança ignora acento e caixa ('joao' acha 'João'), e o visitante digitado de outro jeito é reconhecido dentro da transação", async () => {
    quando(/SELECT TOP 8 m\.MembroId/, []);
    await db.buscarCriancas(pool, { sala: SALA, termo: "joao", hoje: HOJE });
    expect(com(/SELECT TOP 8 m\.MembroId/)[0].sql).toMatch(/m\.Nome COLLATE Latin1_General_CI_AI LIKE @t/);
    mockConsultas = []; mockRegras = [];
    escalado(); presenteNaSala(); salaCom([10, 11], 0);
    quando(/FROM MembroReferencia WHERE MembroId = @m AND/, []);
    quando(/VisitanteNome COLLATE Latin1_General_CI_AI = @vn/, [{ x: 1 }]);
    const dados = { servicoId: 5, equipeId: 7, criancas: [{ tipo: "VISITANTE", nome: "João Lima", nascimento: "2021-03-01", idade: 5, saude: null }], trouxe: { nome: "Paula Lima", parentesco: "MAE", documento: "RG", contato: "94991112222" }, extras: [] };
    const r = await db.fazerCheckin(pool, { sala: SALA, operadorId: 10, dados, hoje: HOJE, agoraIso: AGORA });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/já está numa sala/);
    const dup = com(/VisitanteNome COLLATE Latin1_General_CI_AI = @vn/)[0];
    expect(dup.sql).toMatch(/MenorMembroId IS NULL AND Situacao <> 'RETIRADA' AND VisitanteNascimento = @vd/);
    expect(com(/INSERT INTO CheckinInfantilRegistros/)).toHaveLength(0);
    expect(mockConsultas.map((c) => c.sql)).toContain("ROLLBACK");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Trava 7-B (20/10/2026): as correções da revisão que olhou as versões 7.7, 7.8 e 7.10 juntas. Cada teste reprova no código de antes.
describe("Trava 7-B no check-in", () => {
  const REGISTROS = /SELECT r\.RegistroId, r\.ServicoId[\s\S]*WHERE r\.ServicoId = @s AND r\.EquipeId = @e AND r\.Situacao <> 'RETIRADA' ORDER BY r\.RegistroId/;
  const regSala = (extra = {}) => ({ RegistroId: 9, ServicoId: 5, EquipeId: 7, MenorMembroId: 30, VisitanteNome: null, CriancaNome: "Caio Souza", IdadeAnos: 5, IdadeForaDaFaixa: 0, TrouxeNomeResolvido: "Maria Souza",
    SaudeTexto: "Alergia a amendoim", SaudeOrigem: "CADASTRO", Tentativas: 0, Travado: 0, Situacao: "NA_SALA", EntregueEm: new Date("2026-10-18T12:05:00Z"), ...extra });
  function salaLida(regs) {
    salaCom([10, 11], regs.length);
    quando(REGISTROS, regs);
    quando(/SELECT COUNT\(\*\) AS entregues/, [{ entregues: regs.length, retiradas: 0 }]);
  }
  const snapshot = () => db.snapshotDaSala(pool, SALA, { hoje: HOJE, agoraIso: AGORA, visao: "OPERADOR" });

  test("a saúde copiada do CADASTRO some da tela da sala quando o consentimento não vale mais (o apagar que segue a revogação pode ter falhado); a do balcão continua", async () => {
    salaLida([regSala(), regSala({ RegistroId: 10, MenorMembroId: null, CriancaNome: "Davi Lima", SaudeOrigem: "BALCAO", SaudeTexto: "Asma" })]);
    mcDb.consentimentoVigente.mockResolvedValue(false);
    let s = await snapshot();
    expect(s.criancas.find((c) => c.registroId === 9).saude).toBeNull();
    expect(s.criancas.find((c) => c.registroId === 10).saude).toBe("Asma");
    mcDb.consentimentoVigente.mockResolvedValue(true);
    s = await snapshot();
    expect(s.criancas.find((c) => c.registroId === 9).saude).toBe("Alergia a amendoim");
  });

  test("retirada divergente parada há mais de 20 minutos: a leitura da sala lembra a liderança UMA vez (e nunca derruba a leitura)", async () => {
    const pedida = new Date(Date.now() - 25 * 60000);
    salaLida([regSala({ RegistroId: 77, Situacao: "RETIRADA_PENDENTE", DivergenciaPedidaEm: pedida, SaudeTexto: null })]);
    quando(/SELECT TOP 1 EventoId FROM CheckinInfantilEventos WHERE RegistroId = @r AND Tipo = 'RETIRADA_DIVERGENTE_PEDIDA'/, [{ EventoId: 4321 }]);
    await snapshot(); await snapshot();
    const lembretes = notificarAgora.mock.calls.filter((c) => c[1].regraChave === "CHECKIN_DIVERGENCIA_PARADA");
    expect(lembretes).toHaveLength(1);
    expect(lembretes[0][1]).toMatchObject({ referenciaId: 4321, referenciaTabela: "CheckinInfantilEventos" });
    expect(lembretes[0][1].mensagem).toMatch(/espera a sua decisão na sala Maternal/);
    expect(lembretes[0][1].mensagem).not.toMatch(/Caio/);                                     // aviso à liderança nunca leva nome de criança
    mockRegras = []; mockConsultas = []; notificarAgora.mockClear();
    salaLida([regSala({ RegistroId: 78, Situacao: "RETIRADA_PENDENTE", DivergenciaPedidaEm: new Date(Date.now() - 5 * 60000), SaudeTexto: null })]);
    await snapshot();
    expect(notificarAgora.mock.calls.filter((c) => c[1].regraChave === "CHECKIN_DIVERGENCIA_PARADA")).toHaveLength(0);   // 5 minutos: ainda não
    mockRegras = []; mockConsultas = [];
    salaLida([regSala({ RegistroId: 79, Situacao: "RETIRADA_PENDENTE", DivergenciaPedidaEm: pedida, SaudeTexto: null })]);
    notificarAgora.mockRejectedValueOnce(new Error("fila fora"));
    await expect(snapshot()).resolves.toBeTruthy();
  });

  test("visitante com o nome (sem acento/caixa) e o nascimento de uma criança MEMBRO da congregação é recusado: ela entra como membro", async () => {
    escalado(); presenteNaSala(); salaCom([10, 11], 0);
    quando(/SELECT TOP 1 1 AS x FROM MembroReferencia WHERE CongregacaoId = @c AND DataNascimento = @d AND Nome COLLATE Latin1_General_CI_AI = @n/, [{ x: 1 }]);
    const r = await db.fazerCheckin(pool, { sala: SALA, operadorId: 10, hoje: HOJE, agoraIso: AGORA,
      dados: { servicoId: 5, equipeId: 7, criancas: [{ tipo: "VISITANTE", nome: "Caio Souza", nascimento: "2021-03-01", idade: 5, saude: null }], trouxe: { nome: "Rosa Lima", parentesco: "TIA", documento: "RG", contato: "94991112222" }, extras: [] } });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/já tem cadastro de membro/);
    expect(com(/INSERT INTO CheckinInfantilRegistros/)).toHaveLength(0);
    const c = com(/COLLATE Latin1_General_CI_AI = @n/)[0];
    expect(c.inputs).toMatchObject({ n: "Caio Souza", d: "2021-03-01", c: 1 });
  });

  test("a pessoa escolhida que não é responsável: a mensagem manda informar quem trouxe pelo nome — nunca mais 'faça como visitante'", async () => {
    escalado(); presenteNaSala(); salaCom([10, 11], 0);
    quando(/SELECT MembroId, Nome, DataNascimento, CongregacaoId FROM MembroReferencia WHERE MembroId IN/, [{ MembroId: 30, Nome: "Caio Souza", DataNascimento: new Date("2021-03-01T00:00:00Z"), CongregacaoId: 1 }]);
    quando(/SELECT MenorMembroId, ResponsavelMembroId FROM VoluntariadoResponsaveis WHERE MenorMembroId IN/, [{ MenorMembroId: 30, ResponsavelMembroId: 40 }]);
    const r = await db.fazerCheckin(pool, { sala: SALA, operadorId: 10, hoje: HOJE, agoraIso: AGORA, dados: { servicoId: 5, equipeId: 7, criancas: [{ tipo: "MEMBRO", menorId: 30 }], trouxe: { membroId: 41 }, extras: [] } });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/informe quem trouxe pelo nome/);
    expect(r.mensagem).not.toMatch(/visitante/);
  });

  describe("inclusão de autorizado avisa os responsáveis", () => {
    const crianca = { MembroId: 30, Nome: "Caio Souza", DataNascimento: new Date("2021-03-01T00:00:00Z"), CongregacaoId: 1, CongregacaoNome: "Central" };
    const dados = { menorId: 30, nome: "Dona Lúcia", parentesco: "AVO", membroId: null, validoAte: null, referencia: "Ficha 7" };
    function preparar(resps) {
      quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c ON c\.CongregacaoId = m\.CongregacaoId WHERE m\.MembroId = @m/, [crianca]);
      quando(/FROM VoluntariadoResponsaveis WHERE MenorMembroId = @m AND ResponsavelMembroId = @r AND RevogadoEm IS NULL/, [{ x: 1 }]);
      quando(/INSERT INTO CheckinInfantilAutorizados/, [{ AutorizadoId: 12 }]);
      quando(/SELECT COUNT\(\*\) AS n FROM CheckinInfantilAutorizados a WHERE a\.MenorMembroId = @m/, [{ n: 0 }]);
      quando(/SELECT p\.MembroId, p\.Nome, p\.Email FROM VoluntariadoResponsaveis/, resps.map((i) => ({ MembroId: i, Nome: `R${i}`, Email: `r${i}@e.org` })));
    }
    const doAviso = () => notificarAgora.mock.calls.filter((c) => c[1].regraChave === "CHECKIN_AUTORIZADO_INCLUIDO");
    test("por ficha (liderança): TODOS os responsáveis cadastrados são avisados, com o nome do incluído e o primeiro nome da criança", async () => {
      preparar([40, 41]);
      const r = await db.adicionarAutorizado(pool, { dados, atorId: 5, forma: "FICHA_FISICA", gestorPodeVer: () => true, hoje: HOJE });
      expect(r).toMatchObject({ sucesso: true, autorizadoId: 12, semAviso: false });
      expect(doAviso()).toHaveLength(1);
      expect(doAviso()[0][1].destinatarios.map((d) => d.membroId)).toEqual([40, 41]);
      expect(doAviso()[0][1]).toMatchObject({ referenciaId: 12, referenciaTabela: "CheckinInfantilAutorizados" });
      expect(doAviso()[0][1].mensagem).toMatch(/^Caio tem uma pessoa nova na lista de quem pode retirá-la da sala: Dona Lúcia .*com a ficha assinada/);
      expect(doAviso()[0][1].mensagem).not.toMatch(/Souza/);
    });
    test("pelo próprio responsável: avisa os OUTROS responsáveis (não quem incluiu); sendo o único, não há a quem avisar e não é alarme", async () => {
      preparar([40, 41]);
      await db.adicionarAutorizado(pool, { dados: { ...dados, referencia: null }, atorId: 40, forma: "RESPONSAVEL", hoje: HOJE });
      expect(doAviso()[0][1].destinatarios.map((d) => d.membroId)).toEqual([41]);
      expect(doAviso()[0][1].mensagem).toMatch(/por outro responsável cadastrado/);
      mockRegras = []; mockConsultas = []; notificarAgora.mockClear();
      preparar([40]);
      const r = await db.adicionarAutorizado(pool, { dados: { ...dados, referencia: null }, atorId: 40, forma: "RESPONSAVEL", hoje: HOJE });
      expect(r).toMatchObject({ sucesso: true, semAviso: false });
      expect(doAviso()).toHaveLength(0);
    });
    test("o aviso fica só no sino ou falha: a inclusão vale, e a resposta manda ligar para os responsáveis", async () => {
      for (const falha of [async () => ({ criadas: 2, externas: 0 }), async () => { throw new Error("fora"); }]) {
        mockRegras = []; mockConsultas = [];
        preparar([40, 41]);
        notificarAgora.mockImplementation(falha);
        const r = await db.adicionarAutorizado(pool, { dados, atorId: 5, forma: "FICHA_FISICA", gestorPodeVer: () => true, hoje: HOJE });
        expect(r).toMatchObject({ sucesso: true, semAviso: true });
        expect(r.mensagem).toMatch(/não conseguiu avisar os responsáveis/);
      }
    });
  });

  test("criança sem retirada numa congregação SEM gestão: avisa a gestão de nível geral (antes pulava calado); a janela é de 90 dias", async () => {
    require("../psc").resolverDestinatariosDaCongregacao.mockImplementation(async () => []);
    quando(/FROM CheckinInfantilRegistros r JOIN EscalasServicos s ON s\.ServicoId = r\.ServicoId JOIN EscalasEquipes e/, [{ ServicoId: 5, EquipeId: 7, n: 1, DataHora: new Date("2026-10-18T09:00:00Z"), EquipeNome: "Maternal", CongregacaoId: 1, LiderMembroId: null }]);
    quando(/FROM Lideranca l\s+JOIN Papeis p/, [{ membroId: 1, nome: "Secretário Geral", email: "sg@e.org" }]);
    const fatos = await db.detectarCriancasSemRetirada(pool, { hoje: "2026-10-19" });
    require("../psc").resolverDestinatariosDaCongregacao.mockImplementation(async () => [{ membroId: 900, nome: "Dirigente", email: "d@e.org" }]);
    expect(fatos).toHaveLength(1);
    expect(fatos[0].destinatarios.map((d) => d.membroId)).toEqual([1]);
    expect(com(/DATEADD\(DAY, -90, @hoje\)/)).toHaveLength(1);
  });
});
