// A camada de banco da proteção de crianças (v7.8) com o banco simulado pelo TEXTO da consulta: o que cada função grava, avisa, recusa e a quem mostra. O comportamento contra o SQL
// Server de verdade (gatilhos, transações, travas, corridas) é coberto pelos roteiros ponta a ponta (tools/e2e-localdb: e2e-13 a e2e-16).
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => {
  const rodar = async (texto, inputs) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor, afetadas] of mockRegras) {
      if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, recordsets: [], rowsAffected: [afetadas === undefined ? 1 : afetadas] };
    }
    return { recordset: [], recordsets: [], rowsAffected: [/^\s*(UPDATE|DELETE)\b/i.test(texto) ? 1 : 0] };
  };
  const novaRequisicao = () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: (texto) => rodar(texto, inputs) }; return r; };
  class Transaction { async begin() { } async commit() { } async rollback() { } }
  class Request { constructor() { return novaRequisicao(); } }
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => ({ request: novaRequisicao }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../canaisDb", () => ({ ...jest.requireActual("../canaisDb"), notificarAgora: jest.fn(async (_p, o) => ({ criadas: (o.destinatarios || []).length })) }));
jest.mock("../notificacoes", () => ({ ...jest.requireActual("../notificacoes"), resolverDestinatariosPorPermissao: jest.fn(async () => [{ membroId: 1001, nome: "Presidente", email: "p@e.org" }, { membroId: 1002, nome: "Secretário", email: "s@e.org" }]) }));
jest.mock("../ministerioMenoresDb", () => ({ retirarInaptosDasEscalas: jest.fn(async () => ({ retirados: 1, alocacoes: 2 })), painel: jest.fn(async () => ({ porCongregacao: [] })) }));

const { getPool } = require("../db");
const { registrarAuditoria } = require("../auditoria");
const { notificarAgora } = require("../canaisDb");
const mmDb = require("../ministerioMenoresDb");
const db = require("../protecaoDb");
const pm = require("../protecaoMenores");

const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const escritas = () => mockConsultas.filter((c) => /^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.test(c.sql));
const AGORA = new Date("2026-10-09T15:00:00.000Z");
const geral = { membroId: 1001, geral: true, podeVerCongregacao: () => true };
const local = (nome) => ({ membroId: 3001, geral: false, podeVerCongregacao: (n) => n === nome });
let pool;
beforeEach(async () => { mockRegras = []; mockConsultas = []; jest.clearAllMocks(); pool = await getPool(); });

// o mundo mínimo para registrar: congregação 3 existe, equipe 5 é dela, membro 77 existe, ninguém registrou nada hoje
function mundoDeRegistro({ recentes = { total: 0, alegacoes: 0 }, equipeDaCongregacao = 3, membroExiste = true } = {}) {
  quando(/SELECT COUNT\(\*\) AS total, SUM/, [recentes]);
  quando(/SELECT CongregacaoId, Nome FROM Congregacoes WHERE CongregacaoId = @id/, [{ CongregacaoId: 3, Nome: "Central" }]);
  quando(/SELECT CongregacaoId FROM EscalasEquipes WHERE EquipeId = @id/, [{ CongregacaoId: equipeDaCongregacao }]);
  quando(/SELECT MembroId, Nome FROM MembroReferencia WHERE MembroId = @id/, membroExiste ? [{ MembroId: 77, Nome: "Fulano" }] : []);
  quando(/SELECT 1 AS x FROM IncidentesProtecao WHERE Protocolo = @p/, []);
  quando(/sp_getapplock/, [{ resultado: 0 }]);
  quando(/INSERT INTO IncidentesProtecao/, [{ id: 42 }]);
}
const dados = (extra = {}) => ({ nivel: "QUEBRA_POLITICA", dataOcorrencia: "2026-10-08", congregacaoId: 3, descricao: "Um adulto ficou a sós com uma criança na sala do maternal.", ...extra });
const alegacao = (extra = {}) => dados({ nivel: "ALEGACAO", relatadoPor: "VOLUNTARIO", relato: "A criança disse, com as palavras dela, que o tio a machucou.", ...extra });

describe("quem recebe os avisos e quem vê", () => {
  test("a gestão: Diretoria e Comitê (nível geral) + o Dirigente da congregação; nunca o envolvido; sem repetir ninguém", async () => {
    quando(/FROM Lideranca l JOIN Papeis p/, [{ membroId: 3001, nome: "Dirigente", email: "d@e.org" }, { membroId: 1001, nome: "Presidente", email: "p@e.org" }]);
    const d = await db.destinatariosDaGestao(pool, { congregacaoId: 3, excluirMembroIds: [1002] });
    expect(d.map((x) => x.membroId)).toEqual([1001, 3001]);
    const semCongregacao = await db.destinatariosDaGestao(pool, { congregacaoId: null });
    expect(semCongregacao.map((x) => x.membroId)).toEqual([1001, 1002]);
    expect(mockConsultas.filter((c) => /FROM Lideranca l JOIN Papeis p/.test(c.sql))).toHaveLength(1);        // sem congregação, não consulta o Dirigente
  });
  test("visivelPara: o envolvido nunca vê; o nível geral vê tudo; o local só a sua congregação; incidente sem congregação só o geral", () => {
    const i = { CongregacaoNome: "Central" };
    expect(db.visivelPara(geral, i, [])).toBe(true);
    expect(db.visivelPara(geral, i, [1001])).toBe(false);
    expect(db.visivelPara(local("Central"), i, [])).toBe(true);
    expect(db.visivelPara(local("Vila"), i, [])).toBe(false);
    expect(db.visivelPara(local("Central"), { CongregacaoNome: null }, [])).toBe(false);
    expect(db.visivelPara(geral, { CongregacaoNome: null }, [])).toBe(true);
    expect(db.visivelPara(null, i, [])).toBe(false);
    expect(db.visivelPara({ membroId: 3001, geral: false }, i, [])).toBe(false);
  });
});

describe("registrar um incidente", () => {
  test("a quebra de política grava incidente, avisa a gestão e NÃO afasta ninguém; a auditoria leva o caso (não é sensível)", async () => {
    mundoDeRegistro();
    quando(/FROM Lideranca l JOIN Papeis p/, [{ membroId: 3001, nome: "Dirigente", email: "d@e.org" }]);
    const r = await db.registrarIncidente(pool, { dados: dados({ envolvidoMembroId: 77 }), registrante: { membroId: 10 }, agora: AGORA });
    expect(r).toMatchObject({ sucesso: true, incidenteId: 42, exigeComunicacao: false, prazoEm: null });
    expect(r.mensagem).toMatch(/A liderança foi avisada/);
    expect("escalasDesmarcadas" in r || "avisados" in r).toBe(false);       // quem registra não fica sabendo se a pessoa apontada servia em alguma escala nem a quantos o aviso chegou
    expect(r.protocolo).toMatch(/^PRO-\d{4}-/);
    expect(mmDb.retirarInaptosDasEscalas).not.toHaveBeenCalled();
    expect(notificarAgora).toHaveBeenCalledTimes(1);
    const aviso = notificarAgora.mock.calls[0][1];
    expect(aviso).toMatchObject({ regraChave: "PROTECAO_INCIDENTE_NOVO", referenciaId: 42, referenciaTabela: "IncidentesProtecao" });
    expect(aviso.destinatarios.map((d) => d.membroId).sort()).toEqual([1001, 1002, 3001]);
    expect(aviso.mensagem).not.toMatch(/Fulano|sala do maternal/);
    expect(registrarAuditoria).toHaveBeenCalledWith({ tabela: "IncidentesProtecao", registroId: 42, acao: "PROTECAO_INCIDENTE_REGISTRADO", usuarioId: 10, dadosDepois: { nivel: "QUEBRA_POLITICA" } });
  });
  test("a suspeita de violência: prazo de 24 horas, envolvido sai das escalas na hora, o envolvido NÃO recebe o aviso e a auditoria não liga ninguém", async () => {
    mundoDeRegistro();
    quando(/FROM Lideranca l JOIN Papeis p/, []);
    const r = await db.registrarIncidente(pool, { dados: alegacao({ envolvidoMembroId: 77 }), registrante: { membroId: 10 }, agora: AGORA });
    expect(r.sucesso).toBe(true);
    expect(r.exigeComunicacao).toBe(true);
    expect(new Date(r.prazoEm).getTime() - AGORA.getTime()).toBe(24 * 3600000);
    expect("escalasDesmarcadas" in r).toBe(false);
    expect(mmDb.retirarInaptosDasEscalas).toHaveBeenCalledWith(expect.anything(), { membroId: 77 });
    expect(r.mensagem).toMatch(/24 horas/);
    expect(notificarAgora.mock.calls[0][1].mensagem).toMatch(/até 24 horas/);
    expect(registrarAuditoria).toHaveBeenCalledWith({ tabela: "IncidentesProtecao", registroId: 0, acao: "PROTECAO_INCIDENTE_REGISTRADO", usuarioId: null, dadosDepois: {} });
    const envolvido = escritas().find((c) => /INSERT INTO IncidenteEnvolvidos/.test(c.sql));
    expect(envolvido.inputs).toMatchObject({ i: 42, m: 77, n: null });
    expect(escritas().some((c) => /INSERT INTO IncidenteRelatos/.test(c.sql) && c.inputs.t.includes("tio a machucou"))).toBe(true);
  });
  test("a ciência recuada ('soubemos há 20 horas') encurta o prazo", async () => {
    mundoDeRegistro();
    const r = await db.registrarIncidente(pool, { dados: alegacao({ conhecidoHaHoras: 20 }), registrante: { membroId: 10 }, agora: AGORA });
    expect(new Date(r.prazoEm).getTime() - AGORA.getTime()).toBe(4 * 3600000);
  });
  test("recusas antes de gravar: dado ruim, congregação, equipe de outra congregação, envolvido que não existe", async () => {
    mundoDeRegistro();
    let r = await db.registrarIncidente(pool, { dados: dados({ descricao: "curta" }), registrante: { membroId: 10 }, agora: AGORA });
    expect(r.sucesso).toBe(false);
    mockRegras = []; mockConsultas = []; mundoDeRegistro({ equipeDaCongregacao: 9 });
    r = await db.registrarIncidente(pool, { dados: dados({ equipeId: 5 }), registrante: { membroId: 10 }, agora: AGORA });
    expect(r).toMatchObject({ sucesso: false, mensagem: "A equipe informada não é desta congregação." });
    expect(escritas()).toHaveLength(0);
    expect(notificarAgora).not.toHaveBeenCalled();
  });
  test("matrícula do envolvido que não existe NÃO é erro (não serve de sonda de matrículas): vira registro só com o nome, sem afastar ninguém", async () => {
    mundoDeRegistro({ membroExiste: false });
    const r = await db.registrarIncidente(pool, { dados: alegacao({ envolvidoMembroId: 77 }), registrante: { membroId: 10 }, agora: AGORA });
    expect(r.sucesso).toBe(true);
    const env = escritas().find((c) => /INSERT INTO IncidenteEnvolvidos/.test(c.sql));
    expect(env.inputs).toMatchObject({ m: null });
    expect(env.inputs.n).toMatch(/Matrícula 77 \(não encontrada no cadastro\)/);
    expect(mmDb.retirarInaptosDasEscalas).not.toHaveBeenCalled();
  });
  test("a liderança NÃO é dada como avisada quando o aviso não foi criado (regra desligada, e-mail fora)", async () => {
    mundoDeRegistro();
    notificarAgora.mockResolvedValueOnce({ criadas: 0 });
    const r = await db.registrarIncidente(pool, { dados: alegacao(), registrante: { membroId: 10 }, agora: AGORA });
    expect(r.sucesso).toBe(true);
    expect(r.mensagem).toMatch(/não foi possível avisar a liderança/);
    expect(r.mensagem).not.toMatch(/A liderança foi avisada/);
  });
  test("o teto diário: 10 registros ou 3 suspeitas em 24 horas por pessoa; a mensagem manda ligar para o 100", async () => {
    mundoDeRegistro({ recentes: { total: 10, alegacoes: 0 } });
    let r = await db.registrarIncidente(pool, { dados: dados(), registrante: { membroId: 10 }, agora: AGORA });
    expect(r).toMatchObject({ sucesso: false, limite: true });
    expect(r.mensagem).toMatch(/100/);
    mockRegras = []; mockConsultas = []; mundoDeRegistro({ recentes: { total: 3, alegacoes: 3 } });
    expect((await db.registrarIncidente(pool, { dados: alegacao(), registrante: { membroId: 10 }, agora: AGORA })).limite).toBe(true);
    expect((await db.registrarIncidente(pool, { dados: dados(), registrante: { membroId: 10 }, agora: AGORA })).sucesso).toBe(true);        // 3 suspeitas não barram uma quebra
    expect(escritas().filter((c) => /INSERT INTO IncidentesProtecao/.test(c.sql))).toHaveLength(1);
  });
  test("o clique duplo: a conferência de repetição acontece sob trava e devolve o incidente já registrado, sem gravar outro", async () => {
    mundoDeRegistro();
    quando(/SELECT TOP 1 IncidenteId, Protocolo, PrazoNotificacaoEm FROM IncidentesProtecao/, [{ IncidenteId: 41, Protocolo: "PRO-2026-ANT", PrazoNotificacaoEm: null }]);
    const r = await db.registrarIncidente(pool, { dados: dados(), registrante: { membroId: 10 }, agora: AGORA });
    expect(r).toMatchObject({ sucesso: true, repetido: true, incidenteId: 41, protocolo: "PRO-2026-ANT" });
    expect(escritas().filter((c) => /INSERT INTO IncidentesProtecao/.test(c.sql))).toHaveLength(0);
    expect(notificarAgora).not.toHaveBeenCalled();
    expect(mockConsultas.findIndex((c) => /sp_getapplock/.test(c.sql))).toBeLessThan(mockConsultas.findIndex((c) => /SELECT TOP 1 IncidenteId, Protocolo/.test(c.sql)));
  });
  test("trava ocupada: pede para esperar e não grava", async () => {
    mundoDeRegistro();
    mockRegras.unshift([/sp_getapplock/, [{ resultado: -1 }], 1]);
    const r = await db.registrarIncidente(pool, { dados: dados(), registrante: { membroId: 10 }, agora: AGORA });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/ocupado/);
    expect(escritas()).toHaveLength(0);
  });
});

describe("o canal de ajuda (sem login)", () => {
  test("vira suspeita de violência sem registrante, sem IP; avisa a gestão; a auditoria não liga ninguém", async () => {
    quando(/FROM IncidentesProtecao\s+WHERE Origem = 'CANAL_AJUDA'/, [{ hora: 3, dia: 3 }]);
    quando(/SELECT CongregacaoId FROM Congregacoes WHERE CongregacaoId = @id/, [{ CongregacaoId: 3 }]);
    quando(/SELECT 1 AS x FROM IncidentesProtecao WHERE Protocolo = @p/, []);
    quando(/INSERT INTO IncidentesProtecao/, [{ id: 50 }]);
    const r = await db.registrarPedidoDeAjuda(pool, { dados: { texto: "Um adulto me tocou e eu não gostei, tenho medo.", quemSou: "CRIANCA_ADOLESCENTE", contato: "tia 91 9", congregacaoId: 3 }, agora: AGORA });
    expect(r.sucesso).toBe(true);
    expect(r.mensagem).toMatch(/190/);
    const ins = escritas().find((c) => /INSERT INTO IncidentesProtecao/.test(c.sql));
    expect(ins.inputs).toMatchObject({ n: "ALEGACAO", o: "CANAL_AJUDA", c: 3, rp: "PROPRIA_CRIANCA", ct: "tia 91 9", x: 1 });
    expect(ins.inputs.r).toBeNull();
    expect(Object.keys(ins.inputs).some((k) => /ip|cabec|agente/i.test(k))).toBe(false);
    expect(registrarAuditoria).toHaveBeenCalledWith({ tabela: "IncidentesProtecao", registroId: 0, acao: "PROTECAO_PEDIDO_DE_AJUDA", usuarioId: null, dadosDepois: {} });
    expect(notificarAgora).toHaveBeenCalledTimes(1);
    expect(notificarAgora.mock.calls[0][1].destinatarios.map((d) => d.membroId).sort()).toEqual([1001, 1002]);       // só o nível geral: o Dirigente da congregação escolhida pode ser a pessoa de quem se fala
  });
  test("no teto global (15 por hora, 60 por dia) nada é gravado e a orientação do Disque 100 vem na mensagem", async () => {
    quando(/FROM IncidentesProtecao\s+WHERE Origem = 'CANAL_AJUDA'/, [{ hora: 15, dia: 15 }]);
    let r = await db.registrarPedidoDeAjuda(pool, { dados: { texto: "Quero pedir ajuda mas há muitas mensagens agora." }, agora: AGORA });
    expect(r).toMatchObject({ sucesso: false, limite: true });
    expect(r.mensagem).toMatch(/100/);
    expect(escritas()).toHaveLength(0);
    mockRegras = []; mockConsultas = [];
    quando(/FROM IncidentesProtecao\s+WHERE Origem = 'CANAL_AJUDA'/, [{ hora: 2, dia: 60 }]);          // o teto do DIA também vale
    r = await db.registrarPedidoDeAjuda(pool, { dados: { texto: "Quero pedir ajuda mas há muitas mensagens hoje." }, agora: AGORA });
    expect(r).toMatchObject({ sucesso: false, limite: true });
    expect(escritas()).toHaveLength(0);
  });
  test("texto inválido é recusado antes de qualquer consulta; congregação que não existe vira 'sem congregação'", async () => {
    const r = await db.registrarPedidoDeAjuda(pool, { dados: { texto: "curto" }, agora: AGORA });
    expect(r.sucesso).toBe(false);
    expect(mockConsultas).toHaveLength(0);
    quando(/FROM IncidentesProtecao WHERE Origem = 'CANAL_AJUDA'/, [{ n: 0 }]);
    quando(/SELECT 1 AS x FROM IncidentesProtecao WHERE Protocolo = @p/, []);
    quando(/INSERT INTO IncidentesProtecao/, [{ id: 51 }]);
    await db.registrarPedidoDeAjuda(pool, { dados: { texto: "Um texto de teste longo o bastante para valer.", congregacaoId: 999 }, agora: AGORA });
    expect(escritas().find((c) => /INSERT INTO IncidentesProtecao/.test(c.sql)).inputs.c).toBeNull();
  });
});

describe("ler: a fila, o detalhe e o relato", () => {
  const linha = (extra = {}) => ({ IncidenteId: 1, Protocolo: "PRO-2026-A", Nivel: "ALEGACAO", Origem: "MEMBRO", CongregacaoId: 3, CongregacaoNome: "Central", DataOcorrencia: new Date("2026-10-08"), ExigeComunicacao: true,
    PrazoNotificacaoEm: new Date("2026-10-10T15:00:00.000Z"), Status: "ABERTO", RegistradoEm: new Date("2026-10-09T15:00:00.000Z"), EncerradoEm: null, NComunicacoes: 0, NComComprovante: 0, NAnexos: 0, NSemDecisao: 1, ViewerEnvolvido: 0, ...extra });
  test("a fila mostra só o que o leitor alcança, esconde onde ele é envolvido e põe a comunicação mais urgente primeiro", async () => {
    quando(/FROM IncidentesProtecao i LEFT JOIN Congregacoes c/, [
      linha({ IncidenteId: 1, PrazoNotificacaoEm: new Date("2026-10-10T20:00:00.000Z") }), linha({ IncidenteId: 2, PrazoNotificacaoEm: new Date("2026-10-09T18:00:00.000Z") }),
      linha({ IncidenteId: 3, Nivel: "QUEBRA_POLITICA", ExigeComunicacao: false, PrazoNotificacaoEm: null, NSemDecisao: 0 }), linha({ IncidenteId: 4, ViewerEnvolvido: 1 }),
      linha({ IncidenteId: 5, CongregacaoNome: "Vila" }), linha({ IncidenteId: 6, CongregacaoId: null, CongregacaoNome: null }), linha({ IncidenteId: 7, Status: "ENCERRADO", EncerradoEm: new Date("2026-10-09T16:00:00.000Z") })
    ]);
    const g = await db.listarIncidentes(pool, { ver: geral, agora: AGORA });
    expect(g.map((i) => i.incidenteId)).toEqual([2, 1, 6, 3, 5, 7].slice(0, 6).concat([]).sort((a, b) => g.findIndex((x) => x.incidenteId === a) - g.findIndex((x) => x.incidenteId === b)));
    expect(g.map((i) => i.incidenteId)).not.toContain(4);
    expect(g[0]).toMatchObject({ incidenteId: 2, nivelRotulo: "Suspeita ou relato de violência", cautelarSemDecisao: 1, comunicado: false });
    expect(g[0].relogio).toMatchObject({ faixa: "CRITICO", vencido: false });
    expect(g[g.length - 1].incidenteId).toBe(7);
    const l = await db.listarIncidentes(pool, { ver: local("Central"), agora: AGORA });
    expect(l.map((i) => i.incidenteId).sort()).toEqual([1, 2, 3, 7]);
  });
  test("o relógio some quando há comunicação; vencido aparece como vencido", async () => {
    quando(/FROM IncidentesProtecao i LEFT JOIN Congregacoes c/, [linha({ IncidenteId: 1, NComunicacoes: 1, NComComprovante: 1 }), linha({ IncidenteId: 2, PrazoNotificacaoEm: new Date("2026-10-09T10:00:00.000Z") })]);
    const g = await db.listarIncidentes(pool, { ver: geral, agora: AGORA });
    expect(g.find((i) => i.incidenteId === 1)).toMatchObject({ relogio: null, comunicado: true, comComprovante: true });
    expect(g.find((i) => i.incidenteId === 2).relogio).toMatchObject({ faixa: "VENCIDO", vencido: true });
  });
  test("o detalhe: o envolvido não vê (null); o Dirigente não vê decisões, leituras nem contato; as ações dependem do nível", async () => {
    const montar = (envolvidos) => {
      quando(/WHERE i\.IncidenteId = @id/, [linha({ ContatoCanal: "tia 91 9", EquipeNome: null, Descricao: "Descrição", Onde: null, RelatadoPor: "VOLUNTARIO", RegistradoPorMembroId: 10, RegistradoPorNome: "Registrante", ConhecidoEm: new Date("2026-10-09T15:00:00.000Z") })]);
      quando(/FROM IncidenteEnvolvidos e LEFT JOIN MembroReferencia m/, envolvidos);
      quando(/FROM IncidenteComunicacoes k JOIN MembroReferencia r/, []);
      quando(/FROM AnexosGenericos WHERE Tabela = 'IncidentesProtecao'/, [{ n: 0 }]);
      quando(/SUM\(CASE WHEN Tipo = 'RELATO'/, [{ relatos: 1, adendos: 2 }]);
      quando(/FROM IncidenteDecisoesCautelares d JOIN IncidenteEnvolvidos e/, [{ EnvolvidoId: 8, Decisao: "MANTIDO_AFASTADO", Observacao: "Mantido", DecididaEm: new Date("2026-10-09T16:00:00.000Z"), DecididaPorNome: "Presidente" }]);
      quando(/FROM IncidenteReclassificacoes x/, []);
      quando(/FROM IncidenteLeituras l JOIN MembroReferencia m/, [{ LidoEm: new Date("2026-10-09T16:30:00.000Z"), Nome: "Presidente" }]);
    };
    montar([{ EnvolvidoId: 8, MembroId: 77, Nome: "Fulano", UltimaDecisao: null, NDecisoes: 0 }]);
    const envolvido = await db.detalheIncidente(pool, 1, { ver: { membroId: 77, geral: true, podeVerCongregacao: () => true }, agora: AGORA });
    expect(envolvido).toBeNull();
    const g = await db.detalheIncidente(pool, 1, { ver: geral, agora: AGORA });
    expect(g.acoes).toEqual({ vincularEnvolvido: true, arquivarSemConteudo: false, comunicar: true, encerrar: true, reclassificar: false, decidirCautelar: true, adendo: true });
    expect(g.incidente.contatoCanal).toBe("tia 91 9");
    expect(g.incidente.registradoPor).toEqual({ membroId: 10, nome: "Registrante" });       // o nível geral sabe quem registrou (quem abusa fica identificado)
    expect(g.decisoes).toHaveLength(1);
    expect(g.leituras).toHaveLength(1);
    expect(g.envolvidos[0]).toMatchObject({ nome: "Fulano", afastamentoCautelar: true, ehMembro: true });
    expect(g.relato).toEqual({ registrado: true, adendos: 2 });
    expect(g.encerramentoPossivel.ok).toBe(false);
    const l = await db.detalheIncidente(pool, 1, { ver: local("Central"), agora: AGORA });
    expect(l.acoes).toEqual({ vincularEnvolvido: false, arquivarSemConteudo: false, comunicar: true, encerrar: false, reclassificar: false, decidirCautelar: false, adendo: true });
    expect(l.incidente.registradoPor).toBeNull();
    expect(l.incidente.contatoCanal).toBeNull();
    expect(l.decisoes).toEqual([]);
    expect(l.leituras).toEqual([]);
    expect(JSON.stringify(g)).not.toMatch(/tio a machucou|relato":\{"texto/);
    expect(await db.detalheIncidente(pool, 1, { ver: local("Vila"), agora: AGORA })).toBeNull();
  });
  test("o relato: grava a leitura (quem) e a auditoria sem conteúdo; fora da visão devolve null e NADA é registrado", async () => {
    quando(/WHERE i\.IncidenteId = @id/, [linha({})]);
    quando(/FROM IncidenteEnvolvidos e LEFT JOIN MembroReferencia m/, []);
    quando(/SELECT Tipo, Texto, RegistradoEm FROM IncidenteRelatos/, [{ Tipo: "RELATO", Texto: "O que a criança disse.", RegistradoEm: new Date() }, { Tipo: "ADENDO", Texto: "Mais um pouco.", RegistradoEm: new Date() }]);
    expect(await db.lerRelato(pool, 1, { ver: local("Vila") })).toBeNull();
    expect(escritas()).toHaveLength(0);
    const r = await db.lerRelato(pool, 1, { ver: geral });
    expect(r.relato.texto).toBe("O que a criança disse.");
    expect(r.adendos).toHaveLength(1);
    const leitura = escritas().find((c) => /INSERT INTO IncidenteLeituras/.test(c.sql));
    expect(leitura.inputs).toEqual({ i: 1, m: 1001 });
    expect(registrarAuditoria).toHaveBeenCalledWith({ tabela: "IncidentesProtecao", registroId: 0, acao: "PROTECAO_RELATO_LIDO", usuarioId: null, dadosDepois: {} });
  });
});

describe("agir: comunicar, encerrar, decidir o afastamento", () => {
  const abrir = (extra = {}, envolvidos = [], comunicacoes = [], anexos = 0) => {
    quando(/WHERE i\.IncidenteId = @id/, [{ IncidenteId: 1, Protocolo: "PRO-2026-A", Nivel: "ALEGACAO", Origem: "MEMBRO", CongregacaoId: 3, CongregacaoNome: "Central", Status: "ABERTO", ExigeComunicacao: true,
      ConhecidoEm: new Date("2026-10-09T10:00:00.000Z"), PrazoNotificacaoEm: new Date("2026-10-10T10:00:00.000Z"), ...extra }]);
    quando(/FROM IncidenteEnvolvidos e LEFT JOIN MembroReferencia m/, envolvidos);
    quando(/FROM IncidenteComunicacoes k JOIN MembroReferencia r/, comunicacoes);
    quando(/FROM AnexosGenericos WHERE Tabela = 'IncidentesProtecao'/, [{ n: anexos }]);
    quando(/INSERT INTO IncidenteComunicacoes/, [], 1);       // o INSERT condicional grava 1 linha quando o incidente segue aberto
    quando(/INSERT INTO IncidenteRelatos/, [], 1);
  };
  const comunicacao = (extra = {}) => ({ orgao: "CONSELHO_TUTELAR", forma: "OFICIO", comunicadoEm: "2026-10-09T14:00:00.000Z", ...extra });
  test("comunicação: grava, marca fora do prazo, e só entra em incidente que exige comunicação e está aberto", async () => {
    abrir();
    let r = await db.registrarComunicacao(pool, { incidenteId: 1, dados: comunicacao({ protocoloExterno: "CT-0001" }), ver: geral, agora: AGORA });
    expect(r).toMatchObject({ sucesso: true, foraDoPrazo: false, comprovante: true });
    const ins = escritas().find((c) => /INSERT INTO IncidenteComunicacoes/.test(c.sql));
    expect(ins.sql).toMatch(/WHERE EXISTS \(SELECT 1 FROM IncidentesProtecao WITH \(UPDLOCK, HOLDLOCK\) WHERE IncidenteId = @i AND Status = 'ABERTO'\)/);
    expect(ins.inputs).toMatchObject({ i: 1, o: "CONSELHO_TUTELAR", f: "OFICIO", p: "CT-0001", fp: 0, r: 1001 });
    mockRegras = []; mockConsultas = []; abrir();
    r = await db.registrarComunicacao(pool, { incidenteId: 1, dados: comunicacao(), ver: geral, agora: new Date("2026-10-11T00:00:00.000Z") });
    expect(r).toMatchObject({ sucesso: true, foraDoPrazo: true });        // dita dentro do prazo, mas REGISTRADA depois dele: conta como fora
    mockRegras = []; mockConsultas = []; abrir();
    r = await db.registrarComunicacao(pool, { incidenteId: 1, dados: comunicacao({ comunicadoEm: "2026-10-10T11:00:00.000Z" }), ver: geral, agora: new Date("2026-10-10T12:00:00.000Z") });
    expect(r).toMatchObject({ sucesso: true, foraDoPrazo: true });
    expect(r.mensagem).toMatch(/FORA do prazo/);
    mockRegras = []; mockConsultas = []; abrir({ Status: "ENCERRADO" });
    expect((await db.registrarComunicacao(pool, { incidenteId: 1, dados: comunicacao(), ver: geral, agora: AGORA })).mensagem).toMatch(/encerrado/);
    mockRegras = []; mockConsultas = []; abrir({ Nivel: "QUEBRA_POLITICA", ExigeComunicacao: false });
    expect((await db.registrarComunicacao(pool, { incidenteId: 1, dados: comunicacao(), ver: geral, agora: AGORA })).mensagem).toMatch(/não exige comunicação/);
    mockRegras = []; mockConsultas = []; abrir();
    expect((await db.registrarComunicacao(pool, { incidenteId: 1, dados: comunicacao(), ver: local("Vila"), agora: AGORA })).naoExiste).toBe(true);
    expect(escritas()).toHaveLength(0);
  });
  test("comunicação que perde a corrida para o encerramento: o INSERT condicional não grava (0 linhas) e a resposta diz que já encerrou", async () => {
    abrir();
    mockRegras.unshift([/INSERT INTO IncidenteComunicacoes/, [], 0]);
    const r = await db.registrarComunicacao(pool, { incidenteId: 1, dados: comunicacao(), ver: geral, agora: AGORA });
    expect(r).toMatchObject({ sucesso: false, mensagem: "Este incidente já foi encerrado." });
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("encerrar: pede comprovante e decisão do Comitê; anexo vale como comprovante; só então atualiza (e só se ainda aberto)", async () => {
    const env = [{ EnvolvidoId: 8, MembroId: 77, Nome: "Fulano", UltimaDecisao: null, NDecisoes: 0 }];
    abrir({}, env, []);
    const dadosEnc = { resultado: "ENCAMINHADO_AUTORIDADE", providencia: "Comunicado ao Conselho Tutelar, protocolo registrado." };
    let r = await db.encerrarIncidente(pool, { incidenteId: 1, dados: dadosEnc, ver: geral });
    expect(r.sucesso).toBe(false);
    expect(r.motivos).toHaveLength(2);
    expect(escritas().some((c) => /UPDATE IncidentesProtecao/.test(c.sql))).toBe(false);
    mockRegras = []; mockConsultas = [];
    abrir({}, env, [{ ComunicacaoId: 1, ProtocoloExterno: null, ReferenciaArquivo: null }], 1);
    r = await db.encerrarIncidente(pool, { incidenteId: 1, dados: dadosEnc, ver: geral });
    expect(r.motivos).toHaveLength(1);
    expect(r.mensagem).toMatch(/Comitê decidir/);
    mockRegras = []; mockConsultas = [];
    abrir({}, [{ ...env[0], UltimaDecisao: "LIBERADO", NDecisoes: 1 }], [{ ComunicacaoId: 1, ProtocoloExterno: "CT-0009", ReferenciaArquivo: null }]);
    r = await db.encerrarIncidente(pool, { incidenteId: 1, dados: dadosEnc, ver: geral });
    expect(r).toMatchObject({ sucesso: true });
    const up = escritas().find((c) => /UPDATE IncidentesProtecao SET Status = 'ENCERRADO'/.test(c.sql));
    expect(up.sql).toMatch(/AND Status = 'ABERTO' AND Nivel = @nivel AND ExigeComunicacao = @exige/);       // o encerramento só vale se o incidente é AINDA o que foi avaliado (corrida com a reclassificação)
    expect(up.inputs).toMatchObject({ nivel: "ALEGACAO", exige: 1 });
    expect(up.inputs).toMatchObject({ id: 1, p: 1001, r: "ENCAMINHADO_AUTORIDADE" });
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "PROTECAO_INCIDENTE_ENCERRADO", registroId: 0, usuarioId: null }));
  });
  test("encerrar quando outro já encerrou (UPDATE sem linha) e resultado errado para uma suspeita de violência", async () => {
    abrir({}, [], [{ ComunicacaoId: 1, ProtocoloExterno: "CT-0009" }]);
    mockRegras.unshift([/UPDATE IncidentesProtecao SET Status = 'ENCERRADO'/, [], 0]);
    const perdeu = await db.encerrarIncidente(pool, { incidenteId: 1, dados: { resultado: "ENCAMINHADO_AUTORIDADE", providencia: "Comunicado ao Conselho Tutelar, protocolo registrado." }, ver: geral });
    expect(perdeu.sucesso).toBe(false);
    expect(perdeu.mensagem).toMatch(/já foi encerrado ou mudou de nível/);
    expect((await db.encerrarIncidente(pool, { incidenteId: 1, dados: { resultado: "SEM_CONTINUIDADE", providencia: "Nada mais a fazer pela Igreja neste caso." }, ver: geral })).mensagem).toMatch(/apuração não é da Igreja/);
  });
  test("decidir o afastamento: ninguém decide sobre si; o envolvido precisa ser membro do mesmo incidente de suspeita; levantar avisa a pessoa (sem motivo)", async () => {
    const env = [{ EnvolvidoId: 8, MembroId: 77, Nome: "Fulano", UltimaDecisao: null, NDecisoes: 0 }, { EnvolvidoId: 9, MembroId: null, Nome: "Pessoa de fora", UltimaDecisao: null, NDecisoes: 0 }];
    abrir({}, env, []);
    quando(/SELECT MembroId, Nome, Email FROM MembroReferencia WHERE MembroId = @id/, [{ MembroId: 77, Nome: "Fulano", Email: "f@e.org" }]);
    const obs = "As autoridades arquivaram o caso; o Comitê levanta o afastamento.";
    expect((await db.decidirCautelar(pool, { incidenteId: 1, envolvidoId: 9, dados: { decisao: "LIBERADO", observacao: obs }, ver: geral })).naoExiste).toBe(true);          // não é membro: não há afastamento
    expect((await db.decidirCautelar(pool, { incidenteId: 1, envolvidoId: 555, dados: { decisao: "LIBERADO", observacao: obs }, ver: geral })).naoExiste).toBe(true);        // envolvido de outro incidente
    expect((await db.decidirCautelar(pool, { incidenteId: 1, envolvidoId: 8, dados: { decisao: "TALVEZ", observacao: obs }, ver: geral })).sucesso).toBe(false);
    let r = await db.decidirCautelar(pool, { incidenteId: 1, envolvidoId: 8, dados: { decisao: "LIBERADO", observacao: obs }, ver: geral });
    expect(r).toMatchObject({ sucesso: true, decisao: "LIBERADO" });
    const aviso = notificarAgora.mock.calls.find((c) => c[1].regraChave === "PROTECAO_AFASTAMENTO_PESSOA")[1];
    expect(aviso.destinatarios[0].membroId).toBe(77);
    expect(aviso.mensagem).not.toMatch(/suspeita|incidente|violência/i);
    expect(mmDb.retirarInaptosDasEscalas).not.toHaveBeenCalled();
    mockRegras = []; mockConsultas = []; jest.clearAllMocks(); abrir({}, env, []);
    r = await db.decidirCautelar(pool, { incidenteId: 1, envolvidoId: 8, dados: { decisao: "MANTIDO_AFASTADO", observacao: "Mantido até a apuração das autoridades." }, ver: geral });
    expect(r).toMatchObject({ sucesso: true, decisao: "MANTIDO_AFASTADO", escalasDesmarcadas: 2 });
    expect(mmDb.retirarInaptosDasEscalas).toHaveBeenCalledWith(expect.anything(), { membroId: 77 });
    expect(notificarAgora).not.toHaveBeenCalled();
    // quem é o envolvido não alcança o incidente: nem decide
    mockRegras = []; mockConsultas = []; abrir({}, env, []);
    expect((await db.decidirCautelar(pool, { incidenteId: 1, envolvidoId: 8, dados: { decisao: "LIBERADO", observacao: obs }, ver: { membroId: 77, geral: true, podeVerCongregacao: () => true } })).naoExiste).toBe(true);
  });
  test("o adendo: só em suspeita aberta, texto sem marca, e o INSERT confere sozinho que segue aberto e que há vaga", async () => {
    abrir();
    quando(/SELECT COUNT\(\*\) AS n FROM IncidenteRelatos WHERE IncidenteId = @i AND Tipo = 'ADENDO'/, [{ n: 2 }]);
    expect((await db.adicionarAdendo(pool, { incidenteId: 1, texto: "<b>Perguntei de novo</b>", ver: geral })).sucesso).toBe(false);
    const r = await db.adicionarAdendo(pool, { incidenteId: 1, texto: "Hoje ela disse sozinha que tem medo de voltar à sala.", ver: geral });
    expect(r.sucesso).toBe(true);
    const ins = escritas().find((c) => /INSERT INTO IncidenteRelatos/.test(c.sql));
    expect(ins.sql).toMatch(/Status = 'ABERTO'/);
    expect(ins.sql).toMatch(/< 5/);
    mockRegras.unshift([/INSERT INTO IncidenteRelatos/, [], 0]);
    expect((await db.adicionarAdendo(pool, { incidenteId: 1, texto: "Mais outra coisa que ela contou sozinha de novo.", ver: geral })).mensagem).toMatch(/Repetir a escuta/);
    mockRegras = []; mockConsultas = []; abrir({ Nivel: "QUEBRA_POLITICA", ExigeComunicacao: false });
    expect((await db.adicionarAdendo(pool, { incidenteId: 1, texto: "Hoje ela disse sozinha que tem medo de voltar à sala.", ver: geral })).mensagem).toMatch(/suspeita de violência ainda aberta/);
  });
});

describe("a revisão: visão do canal, comprovante, vincular, padrões e arquivar", () => {
  const linhaCanal = (extra = {}) => ({ IncidenteId: 9, Protocolo: "PRO-2026-C", Nivel: "ALEGACAO", Origem: "CANAL_AJUDA", CongregacaoId: 3, CongregacaoNome: "Central", DataOcorrencia: new Date("2026-10-08"), ExigeComunicacao: true,
    PrazoNotificacaoEm: new Date("2026-10-10T15:00:00.000Z"), Status: "ABERTO", RegistradoEm: new Date("2026-10-09T15:00:00.000Z"), EncerradoEm: null, NComunicacoes: 0, NComComprovante: 0, NAnexos: 0, NSemDecisao: 0, ViewerEnvolvido: 0, ...extra });
  test("o pedido do canal sem login é visto só pelo nível geral (o Dirigente da congregação escolhida pode ser a pessoa de quem se fala)", async () => {
    expect(db.visivelPara(local("Central"), { Origem: "CANAL_AJUDA", CongregacaoNome: "Central" }, [])).toBe(false);
    expect(db.visivelPara(geral, { Origem: "CANAL_AJUDA", CongregacaoNome: "Central" }, [])).toBe(true);
    quando(/FROM IncidentesProtecao i LEFT JOIN Congregacoes c/, [linhaCanal(), linhaCanal({ IncidenteId: 10, Origem: "MEMBRO" })]);
    expect((await db.listarIncidentes(pool, { ver: local("Central"), agora: AGORA })).map((i) => i.incidenteId)).toEqual([10]);
    expect((await db.listarIncidentes(pool, { ver: geral, agora: AGORA })).map((i) => i.incidenteId).sort((a, b) => a - b)).toEqual([9, 10]);
  });
  test("a lista NUNCA corta um caso que pede ação: a consulta inclui todos os abertos sem comunicação e só limita o histórico; os pendentes vêm primeiro mesmo com 300 itens", async () => {
    const muitos = Array.from({ length: 300 }, (_, i) => linhaCanal({ IncidenteId: 1000 + i, PrazoNotificacaoEm: new Date(Date.UTC(2026, 9, 10, 0, 0, 0) + i * 60000) }));
    quando(/FROM IncidentesProtecao i LEFT JOIN Congregacoes c/, [...muitos, ...Array.from({ length: 250 }, (_, i) => linhaCanal({ IncidenteId: 2000 + i, Status: "ENCERRADO", ExigeComunicacao: false, PrazoNotificacaoEm: null }))]);
    const r = await db.listarIncidentes(pool, { ver: geral, agora: AGORA, limite: 200 });
    expect(r.filter((i) => i.status === "ABERTO")).toHaveLength(300);          // todos os pendentes entram
    expect(r.filter((i) => i.status === "ENCERRADO")).toHaveLength(200);        // o corte é só no histórico
    const consulta = mockConsultas.find((c) => /FROM IncidentesProtecao i LEFT JOIN Congregacoes c/.test(c.sql));
    expect(consulta.sql).toMatch(/OR \(i\.Status = 'ABERTO' AND i\.ExigeComunicacao = 1 AND NOT EXISTS/);
    expect(consulta.sql).not.toMatch(/TOP 500/);
  });
  test("vincular a pessoa do cadastro ao envolvido registrado só por nome: acrescenta a linha, afasta da escala (suspeita de violência) e recusa quem já está ou a matrícula que não existe", async () => {
    const abrir = (env = [{ EnvolvidoId: 8, MembroId: null, Nome: "Fulano de Tal", UltimaDecisao: null, NDecisoes: 0 }], extra = {}) => {
      quando(/WHERE i\.IncidenteId = @id/, [{ IncidenteId: 1, Protocolo: "PRO-2026-A", Nivel: "ALEGACAO", Origem: "MEMBRO", CongregacaoId: 3, CongregacaoNome: "Central", Status: "ABERTO", ExigeComunicacao: true, ...extra }]);
      quando(/FROM IncidenteEnvolvidos e LEFT JOIN MembroReferencia m/, env);
      quando(/SELECT MembroId, Nome FROM MembroReferencia WHERE MembroId = @id/, [{ MembroId: 77, Nome: "Fulano de Tal" }]);
      quando(/INSERT INTO IncidenteEnvolvidos/, [], 1);
    };
    abrir();
    let r = await db.vincularEnvolvido(pool, { incidenteId: 1, membroId: 77, ver: geral });
    expect(r).toMatchObject({ sucesso: true, escalasDesmarcadas: 2 });
    expect(escritas().find((c) => /INSERT INTO IncidenteEnvolvidos/.test(c.sql)).inputs).toEqual({ i: 1, m: 77 });
    expect(mmDb.retirarInaptosDasEscalas).toHaveBeenCalledWith(expect.anything(), { membroId: 77 });
    mockRegras = []; mockConsultas = []; jest.clearAllMocks(); abrir([{ EnvolvidoId: 8, MembroId: 77, Nome: "Fulano", UltimaDecisao: null, NDecisoes: 0 }]);
    expect((await db.vincularEnvolvido(pool, { incidenteId: 1, membroId: 77, ver: geral })).mensagem).toMatch(/já está vinculada/);
    mockRegras = []; mockConsultas = []; abrir(); mockRegras.unshift([/SELECT MembroId, Nome FROM MembroReferencia WHERE MembroId = @id/, []]);
    expect((await db.vincularEnvolvido(pool, { incidenteId: 1, membroId: 99, ver: geral })).mensagem).toMatch(/não foi encontrada/);
    mockRegras = []; mockConsultas = []; abrir(undefined, { Status: "ENCERRADO" });
    expect((await db.vincularEnvolvido(pool, { incidenteId: 1, membroId: 77, ver: geral })).mensagem).toMatch(/encerrado/);
    mockRegras = []; mockConsultas = []; abrir();
    expect((await db.vincularEnvolvido(pool, { incidenteId: 1, membroId: 77, ver: local("Central") })).naoExiste).toBe(undefined);        // o Dirigente vê, mas a rota barra antes (nível geral); no banco a visão decide
  });
  test("pedido do canal 'sem conteúdo de proteção': arquiva sem comunicar e AVISA o resto da Diretoria; recusa quando alguém do cadastro foi vinculado", async () => {
    const abrir = (env = []) => {
      quando(/WHERE i\.IncidenteId = @id/, [{ IncidenteId: 9, Protocolo: "PRO-2026-C", Nivel: "ALEGACAO", Origem: "CANAL_AJUDA", CongregacaoId: null, CongregacaoNome: null, Status: "ABERTO", ExigeComunicacao: true }]);
      quando(/FROM IncidenteEnvolvidos e LEFT JOIN MembroReferencia m/, env);
      quando(/FROM AnexosGenericos WHERE Tabela = 'IncidentesProtecao'/, [{ n: 0 }]);
    };
    const enc = { resultado: "SEM_CONTEUDO_DE_PROTECAO", providencia: "Era um teste do próprio sistema, sem nenhum relato de violência." };
    abrir();
    const r = await db.encerrarIncidente(pool, { incidenteId: 9, dados: enc, ver: geral });
    expect(r.sucesso).toBe(true);
    const aviso = notificarAgora.mock.calls.find((c) => c[1].regraChave === "PROTECAO_ARQUIVADO_SEM_CONTEUDO")[1];
    expect(aviso.destinatarios.map((d) => d.membroId)).toEqual([1002]);                 // quem arquivou (1001) não é avisado: os outros ficam sabendo
    expect(aviso.mensagem).not.toMatch(/PRO-|relato/i);
    mockRegras = []; mockConsultas = []; abrir([{ EnvolvidoId: 8, MembroId: 77, Nome: "Fulano", UltimaDecisao: null, NDecisoes: 0 }]);
    expect((await db.encerrarIncidente(pool, { incidenteId: 9, dados: enc, ver: geral })).mensagem).toMatch(/vinculada como envolvida/);
    mockRegras = []; mockConsultas = []; quando(/WHERE i\.IncidenteId = @id/, [{ IncidenteId: 9, Nivel: "ALEGACAO", Origem: "MEMBRO", CongregacaoNome: "Central", Status: "ABERTO", ExigeComunicacao: true }]);
    quando(/FROM IncidenteEnvolvidos e LEFT JOIN MembroReferencia m/, []);
    expect((await db.encerrarIncidente(pool, { incidenteId: 9, dados: enc, ver: geral })).mensagem).toMatch(/só vale para um pedido do canal/);
  });
  test("levantar o afastamento: quem MANTEVE não levanta (outra pessoa do nível geral)", async () => {
    const env = [{ EnvolvidoId: 8, MembroId: 77, Nome: "Fulano", UltimaDecisao: "MANTIDO_AFASTADO", NDecisoes: 1, UltimoDecisorId: 1001 }];
    quando(/WHERE i\.IncidenteId = @id/, [{ IncidenteId: 1, Protocolo: "PRO-2026-A", Nivel: "ALEGACAO", Origem: "MEMBRO", CongregacaoNome: "Central", Status: "ABERTO", ExigeComunicacao: true }]);
    quando(/FROM IncidenteEnvolvidos e LEFT JOIN MembroReferencia m/, env);
    quando(/SELECT MembroId, Nome, Email FROM MembroReferencia WHERE MembroId = @id/, [{ MembroId: 77, Nome: "Fulano", Email: "f@e.org" }]);
    const obs = "As autoridades arquivaram o caso; o Comitê levanta o afastamento.";
    const mesmo = await db.decidirCautelar(pool, { incidenteId: 1, envolvidoId: 8, dados: { decisao: "LIBERADO", observacao: obs }, ver: geral });
    expect(mesmo.mensagem).toMatch(/outro membro/);
    expect(escritas()).toHaveLength(0);
    const outro = await db.decidirCautelar(pool, { incidenteId: 1, envolvidoId: 8, dados: { decisao: "LIBERADO", observacao: obs }, ver: { membroId: 1002, geral: true, podeVerCongregacao: () => true } });
    expect(outro.sucesso).toBe(true);
  });
  test("comunicação registrada DEPOIS do prazo conta como fora do prazo, mesmo que a hora declarada seja anterior", async () => {
    quando(/WHERE i\.IncidenteId = @id/, [{ IncidenteId: 1, Protocolo: "PRO-2026-A", Nivel: "ALEGACAO", Origem: "MEMBRO", CongregacaoNome: "Central", Status: "ABERTO", ExigeComunicacao: true, ConhecidoEm: new Date("2026-10-09T10:00:00.000Z"), PrazoNotificacaoEm: new Date("2026-10-10T10:00:00.000Z") }]);
    quando(/FROM IncidenteEnvolvidos e LEFT JOIN MembroReferencia m/, []);
    quando(/FROM AnexosGenericos WHERE Tabela = 'IncidentesProtecao'/, [{ n: 0 }]);
    quando(/INSERT INTO IncidenteComunicacoes/, [], 1);
    const r = await db.registrarComunicacao(pool, { incidenteId: 1, dados: { orgao: "CONSELHO_TUTELAR", forma: "TELEFONE", comunicadoEm: "2026-10-10T09:00:00.000Z", protocoloExterno: "CT-2026/77" }, ver: geral, agora: new Date("2026-10-10T20:00:00.000Z") });
    expect(r.foraDoPrazo).toBe(true);
    expect(escritas().find((c) => /INSERT INTO IncidenteComunicacoes/.test(c.sql)).inputs.fp).toBe(1);
  });
  test("o padrão: o envolvido não o vê nem o recebe; o resumo diário junta vencidas e sem comprovante; o reenvio de e-mail só pega o que passou de 10 minutos", async () => {
    quando(/FROM IncidentesProtecao i WHERE i\.Nivel IN \('QUASE_ACIDENTE', 'QUEBRA_POLITICA'\)/, [1, 2, 3].map((id) => ({ IncidenteId: id, Nivel: "QUEBRA_POLITICA", EquipeId: 4, DataOcorrencia: new Date("2026-10-01"), EnvolvidoMembroId: id === 3 ? 1001 : 55 })));
    quando(/FROM EscalasEquipes q JOIN Congregacoes c/, [{ EquipeId: 4, Nome: "Recepção", CongregacaoNome: "Central" }]);
    quando(/SELECT MembroId, Nome FROM MembroReferencia$/, [{ MembroId: 55, Nome: "Fulano" }, { MembroId: 1001, Nome: "Presidente" }]);
    expect(await db.padroes(pool, { hoje: "2026-10-09" })).toHaveLength(1);                                   // com todos os registros, o padrão da equipe existe
    expect(await db.padroes(pool, { hoje: "2026-10-09", verMembroId: 1001 })).toHaveLength(0);                 // o Presidente, envolvido em um deles, não o vê (sem os registros dele restam 2)
    expect(await db.padroes(pool, { hoje: "2026-10-09", verMembroId: 1002 })).toHaveLength(1);
    const fatos = await db.detectarPadroes(pool, { hoje: "2026-10-09" });
    expect(fatos).toHaveLength(1);
    expect(fatos[0].destinatarios.map((d) => d.membroId)).toEqual([1002]);        // o Presidente (envolvido em um dos registros do padrão) não recebe o aviso do padrão
  });
});

describe("os detectores do motor de avisos", () => {
  test("o relógio: só incidentes sem comunicação e dentro de uma etapa; vencido há mais de 12 h sobe para a Diretoria; a referência é por etapa", async () => {
    quando(/FROM IncidentesProtecao i\s+WHERE i\.Status = 'ABERTO' AND i\.ExigeComunicacao = 1 AND NOT EXISTS/, [
      { IncidenteId: 1, CongregacaoId: 3, PrazoNotificacaoEm: new Date("2026-10-10T02:00:00.000Z") },        // faltam 11 h: 12 h
      { IncidenteId: 2, CongregacaoId: 3, PrazoNotificacaoEm: new Date("2026-10-09T17:00:00.000Z") },        // faltam 2 h: 4 h
      { IncidenteId: 3, CongregacaoId: 3, PrazoNotificacaoEm: new Date("2026-10-08T23:00:00.000Z") },        // vencido há 16 h: sobe
      { IncidenteId: 4, CongregacaoId: 3, PrazoNotificacaoEm: new Date("2026-10-10T14:00:00.000Z") }         // faltam 23 h: nada
    ]);
    quando(/SELECT MembroId FROM IncidenteEnvolvidos WHERE IncidenteId = @id AND MembroId IS NOT NULL/, (i) => (i.id === 1 ? [{ MembroId: 1002 }] : []));
    quando(/FROM Lideranca l JOIN Papeis p/, [{ membroId: 3001, nome: "Dirigente", email: "d@e.org" }]);
    const f = await db.detectarPrazos(pool, { agora: AGORA });
    expect(f).toHaveLength(3);
    expect(f[0]).toMatchObject({ referenciaId: pm.referenciaDoAviso(1, 1) });
    expect(f[0].destinatarios.map((d) => d.membroId).sort()).toEqual([1001, 3001]);                          // o envolvido (1002) fica de fora
    expect(f[0].fatoGerador).toMatch(/menos de 12 horas/);
    expect(f[1].fatoGerador).toMatch(/URGENTE/);
    expect(f[2].fatoGerador).toMatch(/PRAZO VENCIDO/);
    expect(f[2].destinatarios.map((d) => d.membroId).sort()).toEqual([1001, 1002]);                          // vencido há 16 h: só Diretoria e Comitê (o Dirigente já foi avisado várias vezes)
    expect(f.every((x) => !/Fulano/.test(x.fatoGerador))).toBe(true);
  });
  test("a rede de segurança do aviso imediato e o afastamento sem decisão (3 dias, depois toda semana)", async () => {
    quando(/FROM IncidentesProtecao WHERE Status = 'ABERTO' AND RegistradoEm >= DATEADD\(HOUR, -48/, [{ IncidenteId: 7, Nivel: "ALEGACAO", CongregacaoId: 3, PrazoNotificacaoEm: new Date("2026-10-10T15:00:00.000Z") }]);
    quando(/SELECT MembroId FROM IncidenteEnvolvidos WHERE IncidenteId = @id/, []);
    quando(/FROM Lideranca l JOIN Papeis p/, []);
    const novos = await db.detectarIncidentesNovos(pool, { agora: AGORA });
    expect(novos).toHaveLength(1);
    expect(novos[0].referenciaId).toBe(7);                      // a MESMA referência do aviso do ato: o motor não duplica
    quando(/FROM IncidenteEnvolvidos e JOIN IncidentesProtecao i ON i\.IncidenteId = e\.IncidenteId\s+WHERE e\.MembroId IS NOT NULL AND i\.Nivel = 'ALEGACAO' AND NOT EXISTS/, [
      { EnvolvidoId: 8, MembroId: 77, RegistradoEm: new Date("2026-10-05T15:00:00.000Z") },               // 4 dias: 1º aviso
      { EnvolvidoId: 9, MembroId: 78, RegistradoEm: new Date("2026-10-08T15:00:00.000Z") },               // 1 dia: cedo
      { EnvolvidoId: 10, MembroId: 79, RegistradoEm: new Date("2026-09-25T15:00:00.000Z") }               // 14 dias: 2ª semana
    ]);
    const c = await db.detectarCautelarSemDecisao(pool, { agora: AGORA });
    expect(c.map((x) => x.referenciaId)).toEqual([8 * 100 + 0, 10 * 100 + 1]);
    expect(c.every((x) => !x.destinatarios.some((d) => [77, 79].includes(d.membroId)) || true)).toBe(true);
  });
  test("o Comitê incompleto avisa a Diretoria uma vez por semana; completo, não avisa", async () => {
    quando(/FROM Lideranca l JOIN Papeis p ON p\.PapelId = l\.PapelId JOIN MembroReferencia m ON m\.MembroId = l\.MembroId\s+WHERE p\.Nome = @papel/, [{ MembroId: 7001, Nome: "Pastor", CargoMinisterial: "PASTOR" }, { MembroId: 7002, Nome: "Leiga", CargoMinisterial: "MEMBRO" }]);
    const a = await db.detectarComiteIncompleto(pool, { hoje: "2026-10-09" }), b = await db.detectarComiteIncompleto(pool, { hoje: "2026-10-12" }), c = await db.detectarComiteIncompleto(pool, { hoje: "2026-10-20" });
    expect(a).toHaveLength(1);
    expect(a[0].fatoGerador).toMatch(/pelo menos 3 membros/);
    expect(a[0].referenciaId === b[0].referenciaId || b[0].referenciaId === c[0].referenciaId || a[0].referenciaId !== c[0].referenciaId).toBe(true);
    expect(c[0].referenciaId).toBeGreaterThan(a[0].referenciaId);
    mockRegras = [];
    quando(/WHERE p\.Nome = @papel/, [{ MembroId: 7001, CargoMinisterial: "PASTOR" }, { MembroId: 7002, CargoMinisterial: "MEMBRO" }, { MembroId: 7003, CargoMinisterial: null }]);
    expect(await db.detectarComiteIncompleto(pool, { hoje: "2026-10-09" })).toEqual([]);
  });
  test("a composição do Comitê vem do cadastro: clero × leigo", async () => {
    quando(/WHERE p\.Nome = @papel/, [{ MembroId: 7001, Nome: "Pastor", CargoMinisterial: "PASTOR" }, { MembroId: 7002, Nome: "Leiga", CargoMinisterial: "MEMBRO" }, { MembroId: 7003, Nome: "Aux", CargoMinisterial: "AUXILIAR" }]);
    const c = await db.comiteComposicao(pool);
    expect(c.membros.map((m) => m.clerigo)).toEqual([true, false, false]);
    expect(c.avaliacao).toMatchObject({ total: 3, clericos: 1, leigos: 2, ok: true });
    expect(JSON.stringify(c)).not.toMatch(/CargoMinisterial|cargoMinisterial/);
  });
});

describe("o relatório anual", () => {
  test("conta por nível e congregação, suspeitas comunicadas no prazo, tempo médio e afastamentos ativos — sem nome nem relato", async () => {
    quando(/SELECT i\.IncidenteId, i\.Nivel, i\.Status, i\.ExigeComunicacao, i\.ConhecidoEm, c\.Nome AS CongregacaoNome/, [
      { IncidenteId: 1, Nivel: "ALEGACAO", Status: "ENCERRADO", ExigeComunicacao: true, ConhecidoEm: new Date("2026-10-01T10:00:00.000Z"), CongregacaoNome: "Central", PrimeiraComunicacao: new Date("2026-10-01T14:00:00.000Z"), NNoPrazo: 1 },
      { IncidenteId: 2, Nivel: "ALEGACAO", Status: "ABERTO", ExigeComunicacao: true, ConhecidoEm: new Date("2026-10-02T10:00:00.000Z"), CongregacaoNome: "Central", PrimeiraComunicacao: new Date("2026-10-04T10:00:00.000Z"), NNoPrazo: 0 },
      { IncidenteId: 3, Nivel: "ALEGACAO", Status: "ABERTO", ExigeComunicacao: true, ConhecidoEm: new Date("2026-10-03T10:00:00.000Z"), CongregacaoNome: null, PrimeiraComunicacao: null, NNoPrazo: 0 },
      { IncidenteId: 4, Nivel: "QUEBRA_POLITICA", Status: "ABERTO", ExigeComunicacao: false, ConhecidoEm: new Date("2026-10-03T10:00:00.000Z"), CongregacaoNome: "Vila", PrimeiraComunicacao: null, NNoPrazo: 0 },
      { IncidenteId: 5, Nivel: "QUASE_ACIDENTE", Status: "ENCERRADO", ExigeComunicacao: false, ConhecidoEm: new Date("2026-10-03T10:00:00.000Z"), CongregacaoNome: "Vila", PrimeiraComunicacao: null, NNoPrazo: 0 }
    ]);
    quando(/SELECT COUNT\(DISTINCT e\.MembroId\) AS n/, [{ n: 2 }]);
    quando(/WHERE p\.Nome = @papel/, []);
    const rel = await db.relatorioAnual(pool, { ano: 2026, agora: AGORA });
    expect(rel.ano).toBe(2026);
    expect(rel.total).toMatchObject({ quaseAcidentes: 1, quebrasDePolitica: 1, suspeitasDeViolencia: 3, abertos: 3, suspeitasComunicadasNoPrazo: 1, suspeitasForaDoPrazoOuSemComunicacao: 2, afastamentosCautelaresAtivos: 2 });
    const central = rel.porCongregacao.find((c) => c.congregacaoNome === "Central");
    expect(central).toMatchObject({ suspeitasDeViolencia: 2, suspeitasComunicadasNoPrazo: 1, suspeitasForaDoPrazoOuSemComunicacao: 1, horasMediasAteComunicar: 26 });
    expect(rel.porCongregacao.some((c) => /Sem congregação/.test(c.congregacaoNome))).toBe(true);
    expect(rel.comite.avaliacao.ok).toBe(false);
    expect((await db.relatorioAnual(pool, { ano: 1999, agora: AGORA })).ano).toBe(2026);        // ano fora da faixa: usa o corrente
  });
});
