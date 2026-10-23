// A camada de banco do ministério com menores (v7.7) com o banco simulado pelo TEXTO da consulta: o que cada função grava, avisa e recusa. O comportamento contra o
// SQL Server de verdade (gatilhos, transações, índices únicos, corridas) é coberto pelos roteiros ponta a ponta (tools/e2e-localdb).
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
jest.mock("../canaisDb", () => ({ ...jest.requireActual("../canaisDb"), notificarAgora: jest.fn(async () => ({ criadas: 1 })) }));
jest.mock("../notificacoes", () => ({ ...jest.requireActual("../notificacoes"), resolverDestinatariosPorPermissao: jest.fn(async () => [{ membroId: 1, nome: "Presidente", email: "p@e.org" }, { membroId: 2, nome: "Secretário", email: "s@e.org" }]) }));
jest.mock("../trilhas", () => ({ ...jest.requireActual("../trilhas"), listarRequisitos: jest.fn(async () => []) }));

const { getPool } = require("../db");
const { registrarAuditoria } = require("../auditoria");
const { notificarAgora } = require("../canaisDb");
const { resolverDestinatariosPorPermissao } = require("../notificacoes");
const mm = require("../ministerioMenores");
const db = require("../ministerioMenoresDb");

const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const escritas = () => mockConsultas.filter((c) => /^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.test(c.sql));
const HOJE = "2026-10-09";
const ipUnico = () => { const e = new Error("duplicado"); e.number = 2601; return e; };
const membro = (extra = {}) => ({ MembroId: 20, Nome: "Ana Souza", Email: "ana@e.org", DataNascimento: new Date("1990-01-01"), DataAdmissao: new Date("2016-01-01"), Status: "ATIVO", SituacaoMembro: "EM_COMUNHAO", CongregacaoId: 1, CongregacaoNome: "Central", ...extra });
const LER_MEMBRO = /FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId/;
let pool;
beforeEach(async () => { mockRegras = []; mockConsultas = []; jest.clearAllMocks(); pool = await getPool(); });

describe("o portão da equipe: o que cada pessoa lê na recusa", () => {
  test("equipe SEM a marca de menores libera todos, com uma única consulta (nada de aptidão)", async () => {
    quando(/SELECT ContatoComMenores FROM EscalasEquipes/, [{ ContatoComMenores: 0 }]);
    const r = await db.aptosParaEquipe(pool, { equipeId: 4, membroIds: [1, 2, 3], hoje: HOJE });
    expect(r.contatoComMenores).toBe(false);
    expect([...r.aptos].sort()).toEqual([1, 2, 3]);
    expect(mockConsultas).toHaveLength(1);
    expect((await db.conferirParaServir(pool, { equipeId: 4, membroId: 9, visao: "PROPRIO" })).ok).toBe(true);
  });
  test("equipe com a marca: quem não tem habilitação é barrado, e cada leitor vê só o que lhe cabe", async () => {
    quando(/SELECT ContatoComMenores FROM EscalasEquipes/, [{ ContatoComMenores: 1 }]);
    quando(/SELECT MembroId, DataNascimento, DataAdmissao, Status, SituacaoMembro FROM MembroReferencia/, [{ MembroId: 9, DataNascimento: new Date("1990-01-01"), DataAdmissao: new Date("2016-01-01"), Status: "ATIVO", SituacaoMembro: "EM_COMUNHAO" }]);
    const proprio = await db.conferirParaServir(pool, { equipeId: 4, membroId: 9, visao: "PROPRIO", hoje: HOJE });
    expect(proprio.ok).toBe(false);
    expect(proprio.mensagem).toMatch(/Você ainda não está habilitado para servir com menores nesta equipe: .*habilitação/);
    const lider = await db.conferirParaServir(pool, { equipeId: 4, membroId: 9, visao: "LIDER", hoje: HOJE });
    expect(lider.mensagem).toMatch(/^O voluntário não pode assumir esta escala: habilitação para servir com menores pendente \(/);
    expect(lider.mensagem).not.toMatch(/Você/);
    const colega = await db.conferirParaServir(pool, { equipeId: 4, membroId: 9, hoje: HOJE });
    expect(colega.mensagem).toBe("O voluntário destino não pode assumir esta escala.");     // o padrão é o mais fechado
    const bloqueados = (await db.aptosParaEquipe(pool, { equipeId: 4, membroIds: [9], hoje: HOJE })).bloqueados;
    expect(bloqueados.get(9)).toMatch(/habilitação para servir com menores pendente/);
  });
  test("ids vazios ou inválidos não consultam nada", async () => {
    const r = await db.aptosParaEquipe(pool, { equipeId: 4, membroIds: [], hoje: HOJE });
    expect(r.aptos.size).toBe(0);
    expect(mockConsultas).toHaveLength(0);
    expect((await db.aptidaoEmLote(pool, ["x", -1, 0, 1.5, null], { hoje: HOJE })).size).toBe(0);
  });
});

describe("política de comunicação", () => {
  test("o aceite repetido (índice único) vira mensagem, não erro", async () => {
    quando(/INSERT INTO MinisterioMenoresPoliticaAceites/, () => { throw ipUnico(); });
    const r = await db.aceitarPolitica(pool, { membroId: 20, aceito: true, textoHash: mm.POLITICA_HASH, ip: "177.8.9.10" });
    expect(r).toMatchObject({ sucesso: false });
    expect(r.mensagem).toMatch(/já aceitou esta versão/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("o aceite grava a versão e o hash do SERVIDOR e audita só ids", async () => {
    quando(/INSERT INTO MinisterioMenoresPoliticaAceites/, [{ id: 7 }]);
    const r = await db.aceitarPolitica(pool, { membroId: 20, aceito: true, textoHash: mm.POLITICA_HASH, ip: "177.8.9.10", cadeia: "x".repeat(900) });
    expect(r.sucesso).toBe(true);
    const ins = escritas()[0];
    expect(ins.inputs).toMatchObject({ m: 20, v: mm.POLITICA_VERSAO, h: mm.POLITICA_HASH, ip: "177.8.9.10" });
    expect(ins.inputs.c.length).toBe(400);                     // a cadeia de cabeçalhos é cortada no tamanho da coluna
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "MENORES_POLITICA_ACEITA", registroId: 7, usuarioId: 20, dadosDepois: { versao: mm.POLITICA_VERSAO } });
  });
  test("o aceite em ficha: quem registra não é quem aceita, a referência é obrigatória e a pessoa tem de existir", async () => {
    expect((await db.registrarPoliticaManual(pool, { membroId: 20, referencia: "Pasta 3, ficha 1", por: 20 }))).toMatchObject({ sucesso: false, proibido: true });
    for (const referencia of ["", "ab", "<b>x</b>", "x".repeat(201), undefined, 12345, ["Pasta"]]) expect((await db.registrarPoliticaManual(pool, { membroId: 20, referencia, por: 5 })).sucesso).toBe(false);
    expect((await db.registrarPoliticaManual(pool, { membroId: 20, referencia: "Pasta 3, ficha 1", por: 5 })).mensagem).toBe("Pessoa não encontrada.");
    expect(escritas()).toHaveLength(0);
    quando(LER_MEMBRO, [membro()]);
    quando(/INSERT INTO MinisterioMenoresPoliticaAceites/, [{ id: 9 }]);
    const r = await db.registrarPoliticaManual(pool, { membroId: 20, referencia: "Pasta 3, ficha 1", por: 5 });
    expect(r.sucesso).toBe(true);
    expect(escritas()[0].sql).toMatch(/'FICHA_FISICA'/);
    expect(escritas()[0].inputs).toMatchObject({ m: 20, ref: "Pasta 3, ficha 1", por: 5 });
    expect(registrarAuditoria.mock.calls[0][0].dadosDepois).toEqual({ membroId: 20, versao: 1, referenciaTamanho: 16 });     // o texto da referência não vai para a trilha
  });
});

describe("salas: crianças previstas e faixa etária", () => {
  test("crianças previstas: valida, grava com MERGE travado (corrida) e audita", async () => {
    for (const criancas of [-1, 201, "0x10", "1e1", true, [3], {}, "abc", 1.5, null, undefined]) expect((await db.definirCriancasPrevistas(pool, { servicoId: 1, equipeId: 2, criancas, por: 5 })).sucesso).toBe(false);
    expect(escritas()).toHaveLength(0);
    const r = await db.definirCriancasPrevistas(pool, { servicoId: 1, equipeId: 2, criancas: "12", por: 5 });
    expect(r).toMatchObject({ sucesso: true, criancas: 12 });
    expect(escritas()[0].sql).toMatch(/MERGE MinisterioMenoresSalas WITH \(HOLDLOCK\)/);
    expect(escritas()[0].inputs).toMatchObject({ s: 1, e: 2, c: 12, por: 5 });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "MENORES_CRIANCAS_PREVISTAS", dadosDepois: { equipeId: 2, criancas: 12 } });
  });
  test("faixa etária: fora da lista é recusada; equipe inexistente também; a válida audita", async () => {
    expect((await db.definirFaixaEquipe(pool, { equipeId: 2, faixa: "ADULTOS", por: 5 })).sucesso).toBe(false);
    quando(/UPDATE EscalasEquipes SET FaixaEtariaMenores/, [], 0);
    expect((await db.definirFaixaEquipe(pool, { equipeId: 99, faixa: "MATERNAL", por: 5 })).mensagem).toBe("Equipe não encontrada.");
    mockRegras = [];
    expect((await db.definirFaixaEquipe(pool, { equipeId: 2, faixa: "MATERNAL", por: 5 }))).toMatchObject({ sucesso: true, faixa: "MATERNAL" });
    expect((await db.definirFaixaEquipe(pool, { equipeId: 2, faixa: null, por: 5 })).mensagem).toMatch(/removida/);
    expect(registrarAuditoria.mock.calls[0][0].acao).toBe("MENORES_FAIXA_DEFINIDA");
  });
});

describe("auto-denúncia", () => {
  const dados = { tipo: "INQUERITO_POLICIAL", dataCiencia: "2026-09-20", ciente: true };
  test("declarar: grava só o tipo e a data, a auditoria não leva nada, a Diretoria e a pessoa são avisadas", async () => {
    quando(LER_MEMBRO, [membro()]);
    quando(/INSERT INTO MinisterioMenoresAutoDenuncias/, [{ id: 31 }]);
    const r = await db.declararAutoDenuncia(pool, { membroId: 20, dados, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: true, autoDenunciaId: 31 });
    const ins = escritas().find((c) => /INSERT INTO MinisterioMenoresAutoDenuncias/.test(c.sql));
    expect(ins.inputs).toMatchObject({ m: 20, t: "INQUERITO_POLICIAL", d: "2026-09-20" });
    // a auditoria é lida por quem tem a permissão "auditoria" (que pode não ser da Diretoria): nem quem comunicou (usuarioId), nem qual comunicação (registroId) — o elo fica só na tabela
    expect(registrarAuditoria.mock.calls[0][0]).toEqual({ tabela: "MinisterioMenoresAutoDenuncias", registroId: 0, acao: "MENORES_AUTODENUNCIA", usuarioId: null, dadosDepois: {} });
    expect(resolverDestinatariosPorPermissao).toHaveBeenCalledWith(expect.anything(), { permissao: "vistoria_antecedentes", nivel: "GLOBAL" });
    const avisoDir = notificarAgora.mock.calls.find((c) => c[1].regraChave === "MENORES_AUTODENUNCIA")[1];
    expect(avisoDir.destinatarios.map((d) => d.membroId)).toEqual([1, 2]);
    expect(avisoDir.mensagem).toMatch(/aguardando a decisão da Diretoria/);
    expect(avisoDir.mensagem).not.toMatch(/Ana|Souza|2026-09-20|20\/09|inquérito/i);      // o e-mail não leva nome, data nem tipo
    const avisoPessoa = notificarAgora.mock.calls.find((c) => c[1].regraChave === "MENORES_AUTODENUNCIA_DECIDIDA")[1];
    expect(avisoPessoa.destinatarios[0].membroId).toBe(20);
    expect(avisoPessoa.mensagem).toMatch(/não é punição/);
  });
  test("duas declarações ao mesmo tempo: o índice único recusa a segunda com a mensagem de 'já comunicou'", async () => {
    quando(LER_MEMBRO, [membro()]);
    quando(/INSERT INTO MinisterioMenoresAutoDenuncias/, () => { throw ipUnico(); });
    const r = await db.declararAutoDenuncia(pool, { membroId: 20, dados, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/já comunicou/);
    expect(notificarAgora).not.toHaveBeenCalled();
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("dados ruins nem chegam ao banco", async () => {
    for (const extra of [{ tipo: "X" }, { dataCiencia: "2999-01-01" }, { ciente: "true" }]) expect((await db.declararAutoDenuncia(pool, { membroId: 20, dados: { ...dados, ...extra }, hoje: HOJE })).sucesso).toBe(false);
    expect(mockConsultas).toHaveLength(0);
  });
  const linha = (extra = {}) => ({ AutoDenunciaId: 5, MembroId: 20, Tipo: "INQUERITO_POLICIAL", DataCiencia: new Date("2026-09-20"), DeclaradaEm: new Date(), Decisao: null, LiberadoEm: null, Nome: "Ana Souza", ...extra });
  test("decidir: exige comunicação existente, não decidida; a corrida (nenhuma linha afetada) vira 'já foi decidida'; audita só o tamanho do motivo", async () => {
    const entrada = { autoDenunciaId: 5, dados: { decisao: "MANTIDO", observacao: "Conversei com a pessoa; segue em dia." }, por: 1, hoje: HOJE };
    expect((await db.decidirAutoDenuncia(pool, entrada)).mensagem).toMatch(/não encontrada/);
    quando(/FROM MinisterioMenoresAutoDenuncias a JOIN MembroReferencia m/, [linha()]);
    quando(/UPDATE MinisterioMenoresAutoDenuncias SET Decisao/, [], 0);
    expect((await db.decidirAutoDenuncia(pool, entrada)).mensagem).toMatch(/já foi decidida/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
    mockRegras = [];
    quando(/FROM MinisterioMenoresAutoDenuncias a JOIN MembroReferencia m/, [linha()]);
    quando(LER_MEMBRO, [membro()]);
    const r = await db.decidirAutoDenuncia(pool, entrada);
    expect(r.sucesso).toBe(true);
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "MENORES_AUTODENUNCIA_DECIDIDA", usuarioId: 1, dadosDepois: { observacaoTamanho: entrada.dados.observacao.length } });
    expect(notificarAgora.mock.calls.at(-1)[1].mensagem).toMatch(/liberado/);
    expect((await db.decidirAutoDenuncia(pool, { ...entrada, por: 20 })).proibido).toBe(true);                 // ninguém decide sobre si
  });
  test("decidir uma já decidida é recusado sem gravar; AFASTADO e MANTIDO dão mensagens diferentes", async () => {
    quando(/FROM MinisterioMenoresAutoDenuncias a JOIN MembroReferencia m/, [linha({ Decisao: "MANTIDO" })]);
    expect((await db.decidirAutoDenuncia(pool, { autoDenunciaId: 5, dados: { decisao: "MANTIDO", observacao: "Observação suficiente." }, por: 1 })).mensagem).toMatch(/já foi decidida/);
    expect(escritas()).toHaveLength(0);
  });
  test("liberar: só o afastamento preventivo, uma vez, por outra pessoa", async () => {
    const entrada = { autoDenunciaId: 5, dados: { observacao: "O processo foi arquivado." }, por: 1 };
    quando(/FROM MinisterioMenoresAutoDenuncias a JOIN MembroReferencia m/, [linha({ Decisao: "MANTIDO" })]);
    expect((await db.liberarAutoDenuncia(pool, entrada)).mensagem).toMatch(/Só se levanta um afastamento preventivo/);
    mockRegras = [];
    quando(/FROM MinisterioMenoresAutoDenuncias a JOIN MembroReferencia m/, [linha({ Decisao: "AFASTADO_PREVENTIVAMENTE", LiberadoEm: new Date() })]);
    expect((await db.liberarAutoDenuncia(pool, entrada)).mensagem).toMatch(/já foi levantado/);
    mockRegras = [];
    quando(/FROM MinisterioMenoresAutoDenuncias a JOIN MembroReferencia m/, [linha({ Decisao: "AFASTADO_PREVENTIVAMENTE" })]);
    quando(/UPDATE MinisterioMenoresAutoDenuncias SET LiberadoEm/, [], 0);
    expect((await db.liberarAutoDenuncia(pool, entrada)).mensagem).toMatch(/já foi levantado/);        // a corrida
    expect((await db.liberarAutoDenuncia(pool, { ...entrada, por: 20 })).proibido).toBe(true);
    mockRegras = [];
    quando(/FROM MinisterioMenoresAutoDenuncias a JOIN MembroReferencia m/, [linha({ Decisao: "AFASTADO_PREVENTIVAMENTE" })]);
    quando(LER_MEMBRO, [membro()]);
    expect((await db.liberarAutoDenuncia(pool, entrada)).sucesso).toBe(true);
    expect(registrarAuditoria.mock.calls.at(-1)[0].acao).toBe("MENORES_AUTODENUNCIA_LIBERADA");
  });
});

describe("retenção e varredura", () => {
  test("anonimiza o IP dos aceites com mais de 1825 dias e só audita quando houve", async () => {
    quando(/UPDATE MinisterioMenoresPoliticaAceites SET EnderecoIp/, [], 0);
    expect((await db.anonimizarIpsVencidos(pool, { hoje: HOJE })).anonimizados).toBe(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
    expect(escritas()[0].inputs.limite).toBe(mm.somarDiasIso(HOJE, -1825));
    mockRegras = [];
    quando(/UPDATE MinisterioMenoresPoliticaAceites SET EnderecoIp/, [], 4);
    const r = await db.anonimizarIpsVencidos(pool, { hoje: HOJE });
    expect(r).toEqual({ anonimizados: 4, retencaoDias: 1825 });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "MENORES_IP_ANONIMIZADO", dadosDepois: { quantidade: 4 } });
  });
  test("sem ninguém escalado nas equipes com menores, a varredura não faz nada (uma consulta nas escalas, uma nas turmas da EBD, uma nas salas do check-in e uma nos acompanhamentos pastorais de menores, e mais nenhuma)", async () => {
    const r = await db.retirarInaptosDasEscalas(pool, { hoje: HOJE });
    expect(r).toEqual({ retirados: 0, alocacoes: 0, turmasRetiradas: 0, presencasEncerradas: 0, cuidadoSoltos: 0 });
    expect(mockConsultas).toHaveLength(4);
    expect(mockConsultas[3].sql).toMatch(/FROM CuidadoItens i JOIN MembroReferencia m/);                   // Trava 7-C: o responsável com pendência sai do item do menor
    expect(mockConsultas[0].sql).toMatch(/FROM EscalasAlocacoes a/);
    expect(mockConsultas[1].sql).toMatch(/FROM EbdTurmaProfessores tp JOIN EbdTurmas t/);
    expect(mockConsultas[2].sql).toMatch(/FROM CheckinInfantilVoluntarios v JOIN EscalasServicos s/);       // Trava 7-B: a presença aberta na sala
    expect(escritas()).toHaveLength(0);
    expect(notificarAgora).not.toHaveBeenCalled();
  });
  test("a varredura de UMA pessoa e de UMA equipe filtra a consulta", async () => {
    await db.retirarInaptosDasEscalas(pool, { hoje: HOJE, membroId: 7 });
    expect(mockConsultas[0].sql).toMatch(/a\.MembroId = @m/);
    expect(mockConsultas[0].inputs.m).toBe(7);
    mockConsultas = [];
    await db.retirarInaptosDasEscalas(pool, { hoje: HOJE, equipeId: 3 });
    expect(mockConsultas[0].sql).toMatch(/a\.EquipeId = @eq/);
    expect(mockConsultas[0].inputs.eq).toBe(3);
    expect(mockConsultas).toHaveLength(2);                         // varrer UMA equipe não olha as turmas da EBD (só as escalas e a sala do check-in DESSA equipe)
    expect(mockConsultas[1].sql).toMatch(/FROM CheckinInfantilVoluntarios v[\s\S]*AND v\.EquipeId = @eq/);
  });
  test("a varredura de uma pessoa também olha as turmas da EBD dela (filtro por professor)", async () => {
    await db.retirarInaptosDasEscalas(pool, { hoje: HOJE, membroId: 7 });
    expect(mockConsultas[1].sql).toMatch(/tp\.MembroId = @m/);
    expect(mockConsultas[1].inputs.m).toBe(7);
  });
});

describe("a ficha cadastral", () => {
  test("sem habilitação aberta não há o que confirmar; com ela, grava e audita; confirmo precisa ser verdadeiro", async () => {
    expect((await db.confirmarFicha(pool, { membroId: 20, por: 20, confirmo: "sim" })).sucesso).toBe(false);
    expect((await db.confirmarFicha(pool, { membroId: 20, por: 20, confirmo: true })).mensagem).toMatch(/ainda não foi aberta/);
    expect(escritas()).toHaveLength(0);
    quando(/SELECT \* FROM VoluntariosHabilitacao WHERE MembroId/, [{ HabilitacaoId: 3, MembroId: 20 }]);
    const r = await db.confirmarFicha(pool, { membroId: 20, por: 5, confirmo: true });
    expect(r.sucesso).toBe(true);
    expect(escritas()[0].sql).toMatch(/FichaAtualizadaEm = SYSUTCDATETIME\(\)/);
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "MENORES_FICHA_CONFIRMADA", registroId: 3, usuarioId: 5 });
  });
});

describe("portão da EBD (v7.10): a turma \"com menores\"", () => {
  const turma = (extra = {}) => ({ TurmaProfessorId: 1, TurmaId: 3, MembroId: 7, TurmaNome: "Juniores", CongregacaoId: 1, ...extra });
  const MEMBRO_DO_PROFESSOR = /FROM MembroReferencia m LEFT JOIN Congregacoes c ON c\.CongregacaoId = m\.CongregacaoId WHERE m\.MembroId/;

  test("turma SEM a marca libera todos com uma única consulta (nada de aptidão)", async () => {
    quando(/SELECT ContatoComMenores FROM EbdTurmas WHERE TurmaId = @t/, [{ ContatoComMenores: 0 }]);
    const r = await db.aptosParaTurma(pool, { turmaId: 3, membroIds: [7, 8], hoje: HOJE });
    expect(r.contatoComMenores).toBe(false);
    expect([...r.aptos].sort()).toEqual([7, 8]);
    expect(mockConsultas).toHaveLength(1);
    expect(await db.turmaComMenores(pool, 3)).toBe(false);
  });
  test("turma COM a marca barra quem não está habilitado, com o motivo curto (sem o detalhe de pendência reservada)", async () => {
    quando(/SELECT ContatoComMenores FROM EbdTurmas WHERE TurmaId = @t/, [{ ContatoComMenores: 1 }]);
    quando(/SELECT MembroId, DataNascimento, DataAdmissao, Status, SituacaoMembro FROM MembroReferencia/, [{ MembroId: 7, DataNascimento: new Date("1990-01-01"), DataAdmissao: new Date("2016-01-01"), Status: "ATIVO", SituacaoMembro: "EM_COMUNHAO" }]);
    const r = await db.aptosParaTurma(pool, { turmaId: 3, membroIds: [7], hoje: HOJE });
    expect(r.contatoComMenores).toBe(true);
    expect(r.aptos.size).toBe(0);
    expect(r.bloqueados.get(7)).toMatch(/habilitação para servir com menores pendente/);
    expect((await db.aptosParaTurma(pool, { turmaId: 3, membroIds: [], hoje: HOJE })).aptos.size).toBe(0);
  });
  // Achado da revisão da v7.10 (B4): a lista [5.9] perdia o elemento em idsValidos, o portão achava que não havia ninguém a conferir e devolvia "turma sem marca" SEM consultar nada, e o
  // driver do banco gravava 5.9 como 5. Uma lista que perdeu elementos é RECUSA (o portão fecha), com a turma marcada ou não.
  test("identificador que perdeu elementos é RECUSA: [5.9], texto, zero, negativo e misturados fecham o portão — nunca viram 'turma sem marca'", async () => {
    quando(/SELECT ContatoComMenores FROM EbdTurmas WHERE TurmaId = @t/, [{ ContatoComMenores: 0 }]);
    for (const lista of [[5.9], ["5.9"], [0], [-1], ["abc"], [true], [null], [7, 5.9], ["05"], [2 ** 40]]) {
      const r = await db.aptosParaTurma(pool, { turmaId: 3, membroIds: lista, hoje: HOJE });
      expect(r.contatoComMenores).toBe(true);
      expect(r.aptos.size).toBe(0);
      expect(r.bloqueados.size).toBeGreaterThan(0);
    }
    expect(mockConsultas).toHaveLength(0);
    const certo = await db.aptosParaTurma(pool, { turmaId: 3, membroIds: [7, "8"], hoje: HOJE });
    expect(certo.contatoComMenores).toBe(false);
    expect([...certo.aptos].sort()).toEqual([7, 8]);
  });
  test("a varredura só olha turma ATIVA, MARCADA e professor ativo; sem ninguém, não faz nada", async () => {
    const r = await db.retirarInaptosDasTurmas(pool, { hoje: HOJE });
    expect(r).toEqual({ retirados: 0, vinculos: 0 });
    expect(mockConsultas).toHaveLength(1);
    expect(mockConsultas[0].sql).toMatch(/tp\.Ativo = 1 AND t\.Ativa = 1 AND t\.ContatoComMenores = 1/);
    expect(escritas()).toHaveLength(0);
    expect(notificarAgora).not.toHaveBeenCalled();
  });
  test("professor sem habilitação sai da turma (UPDATE só se o vínculo ainda está vivo), a retirada é registrada com a TURMA, a auditoria não leva o motivo e a pessoa e os colegas são avisados", async () => {
    quando(/FROM EbdTurmaProfessores tp JOIN EbdTurmas t ON t\.TurmaId = tp\.TurmaId/, [turma()]);
    quando(/SELECT TurmaProfessorId FROM EbdTurmaProfessores WITH \(UPDLOCK, HOLDLOCK\)/, [{ TurmaProfessorId: 1 }]);
    quando(/INSERT INTO MinisterioMenoresRetiradas \(MembroId, TurmaId/, [{ id: 50 }]);
    quando(LER_MEMBRO, [membro({ MembroId: 7, Nome: "Prof Sete" })]);
    quando(/SELECT m\.MembroId, m\.Nome, m\.Email FROM EbdTurmaProfessores tp/, [{ MembroId: 8, Nome: "Colega Oito", Email: "c8@e.org" }]);
    const r = await db.retirarInaptosDasTurmas(pool, { hoje: HOJE });
    expect(r).toEqual({ retirados: 1, vinculos: 1 });
    const up = escritas().find((c) => /UPDATE EbdTurmaProfessores SET Ativo = 0/.test(c.sql));
    expect(up.sql).toMatch(/WHERE TurmaProfessorId = @tp AND Ativo = 1/);
    expect(up.inputs.tp).toBe(1);
    const ins = escritas().find((c) => /INSERT INTO MinisterioMenoresRetiradas/.test(c.sql));
    expect(ins.inputs).toMatchObject({ m: 7, t: 3 });
    expect(ins.sql).toMatch(/AlocacoesCanceladas\) VALUES \(@m, @t, @mot, 1\)/);
    const aud = registrarAuditoria.mock.calls.at(-1)[0];
    expect(aud).toMatchObject({ acao: "MENORES_RETIRADO_DA_TURMA_EBD", registroId: 50, usuarioId: null });
    expect(JSON.stringify(aud)).not.toMatch(/ANTECEDENTES|SEM_HABILITACAO|ESTEIRA|motivo/i);
    const avisos = notificarAgora.mock.calls.map((c) => c[1]);
    expect(avisos.map((a) => a.regraChave)).toEqual(["MENORES_RETIRADO_DA_ESCALA", "EBD_PROFESSOR_RETIRADO"]);
    expect(avisos[0].destinatarios.map((d) => d.membroId)).toEqual([7]);   // a pessoa que saiu da turma
    expect(avisos[0].mensagem).toMatch(/turma Juniores da EBD/);
    expect(avisos[1].destinatarios.map((d) => d.membroId)).toEqual([8]);
    expect(avisos[1].mensagem).toMatch(/Juniores/);
    for (const a of avisos) { expect(a).toMatchObject({ referenciaId: 50, referenciaTabela: "MinisterioMenoresRetiradas" }); expect(a.mensagem).not.toMatch(/ANTECEDENTES|certidão vencida/i); }
  });
  test("duas varreduras ao mesmo tempo: quem já foi tirado (vínculo não vive mais) não é retirado nem avisado de novo", async () => {
    quando(/FROM EbdTurmaProfessores tp JOIN EbdTurmas t ON t\.TurmaId = tp\.TurmaId/, [turma()]);
    quando(/SELECT TurmaProfessorId FROM EbdTurmaProfessores WITH \(UPDLOCK, HOLDLOCK\)/, []);
    const r = await db.retirarInaptosDasTurmas(pool, { hoje: HOJE });
    expect(r).toEqual({ retirados: 0, vinculos: 0 });
    expect(escritas()).toHaveLength(0);
    expect(notificarAgora).not.toHaveBeenCalled();
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("se a gravação de um par falha, o erro sobe no fim com o que já foi feito em parcial (a rotina diária vira alerta)", async () => {
    quando(/FROM EbdTurmaProfessores tp JOIN EbdTurmas t ON t\.TurmaId = tp\.TurmaId/, [turma(), turma({ TurmaProfessorId: 2, MembroId: 9 })]);
    quando(/SELECT TurmaProfessorId FROM EbdTurmaProfessores WITH \(UPDLOCK, HOLDLOCK\)/, [{ TurmaProfessorId: 1 }]);
    let n = 0;
    quando(/INSERT INTO MinisterioMenoresRetiradas \(MembroId, TurmaId/, () => { if (n++ === 0) return [{ id: 51 }]; throw new Error("deu ruim"); });
    quando(LER_MEMBRO, [membro({ MembroId: 7 })]);
    await expect(db.retirarInaptosDasTurmas(pool, { hoje: HOJE })).rejects.toMatchObject({ message: expect.stringMatching(/1 de 2 par\(es\) professor×turma/), parcial: { retirados: 1, vinculos: 1 } });
  });
  test("o invólucro varre escalas E turmas, e o erro de uma não impede a outra", async () => {
    quando(/FROM EbdTurmaProfessores tp JOIN EbdTurmas t ON t\.TurmaId = tp\.TurmaId/, [turma()]);
    quando(/SELECT TurmaProfessorId FROM EbdTurmaProfessores WITH \(UPDLOCK, HOLDLOCK\)/, [{ TurmaProfessorId: 1 }]);
    quando(/INSERT INTO MinisterioMenoresRetiradas \(MembroId, TurmaId/, [{ id: 52 }]);
    quando(LER_MEMBRO, [membro({ MembroId: 7 })]);
    const r = await db.retirarInaptosDasEscalas(pool, { hoje: HOJE });
    expect(r).toMatchObject({ retirados: 0, alocacoes: 0, turmasRetiradas: 1 });
    mockConsultas = []; mockRegras = [];
    quando(/FROM EscalasAlocacoes a JOIN EscalasServicos s/, () => { throw new Error("escalas fora do ar"); });
    quando(/FROM EbdTurmaProfessores tp JOIN EbdTurmas t ON t\.TurmaId = tp\.TurmaId/, [turma()]);
    quando(/SELECT TurmaProfessorId FROM EbdTurmaProfessores WITH \(UPDLOCK, HOLDLOCK\)/, [{ TurmaProfessorId: 1 }]);
    quando(/INSERT INTO MinisterioMenoresRetiradas \(MembroId, TurmaId/, [{ id: 53 }]);
    quando(LER_MEMBRO, [membro({ MembroId: 7 })]);
    await expect(db.retirarInaptosDasEscalas(pool, { hoje: HOJE })).rejects.toMatchObject({ message: "escalas fora do ar", parcial: { turmasRetiradas: 1 } });
    expect(escritas().some((c) => /UPDATE EbdTurmaProfessores SET Ativo = 0/.test(c.sql))).toBe(true);
  });
  test("turma com nome de criança e sem a marca aparece no painel como alerta (a marca nasce desligada)", async () => {
    quando(/SELECT t\.TurmaId, t\.Nome, t\.CongregacaoId, c\.Nome AS CongregacaoNome FROM EbdTurmas t/, [
      { TurmaId: 1, Nome: "Juniores", CongregacaoId: 1, CongregacaoNome: "Central" }, { TurmaId: 2, Nome: "Adultos", CongregacaoId: 1, CongregacaoNome: "Central" }, { TurmaId: 3, Nome: "Crianças da Vila", CongregacaoId: 2, CongregacaoNome: "Vila" }]);
    const r = await db.turmasSemMarcaQueParecemInfantis(pool, {});
    expect(r.map((x) => x.nome)).toEqual(["Juniores", "Crianças da Vila"]);
    expect(mockConsultas[0].sql).toMatch(/t\.Ativa = 1 AND t\.ContatoComMenores = 0/);
    expect(await db.turmasSemMarcaQueParecemInfantis(pool, { congregacaoIds: [] })).toEqual([]);
  });
});
