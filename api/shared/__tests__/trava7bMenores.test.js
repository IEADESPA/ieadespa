// Trava de Revisão 7-B (20/10/2026): os achados da revisão no ministério com menores, no portão da EBD e na sala do check-in. O banco é simulado pelo TEXTO da consulta (como em
// ministerioMenoresDb.test.js); a aptidão de cada pessoa é escolhida pelo teste (a regra pura da v7.7 é testada em ministerioMenores.test.js). O comportamento contra o SQL Server de
// verdade é dos roteiros ponta a ponta.
const fs = require("fs");
const path = require("path");

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
jest.mock("../canaisDb", () => ({ ...jest.requireActual("../canaisDb"), notificarAgora: jest.fn(async () => ({ criadas: 1, externas: 1 })) }));
jest.mock("../notificacoes", () => ({ ...jest.requireActual("../notificacoes"), resolverDestinatariosPorPermissao: jest.fn(async () => [{ membroId: 1, nome: "Presidente", email: "p@e.org" }]) }));
jest.mock("../trilhas", () => ({ ...jest.requireActual("../trilhas"), listarRequisitos: jest.fn(async () => []), avaliarRequisitos: jest.fn(async () => ({ bloqueado: false, alertas: [] })) }));
jest.mock("../psc", () => ({
  ...jest.requireActual("../psc"),
  resolverDestinatariosDaCongregacao: jest.fn(async (_p, { permissao }) => (permissao === "habilitacao_voluntarios" ? [{ membroId: 40, nome: "Secretaria", email: "sec@e.org" }]
    : permissao === "ebd_gestao" ? [{ membroId: 41, nome: "Superintendente", email: "ebd@e.org" }] : []))
}));
// A aptidão é escolhida pelo teste pela marca no Status do cadastro: APTO_ADULTO, APTO_ADOLESCENTE ou qualquer outra (vai à regra real: sem habilitação, inapto).
jest.mock("../ministerioMenores", () => {
  const real = jest.requireActual("../ministerioMenores");
  const validades = { antecedentes: { situacao: "VIGENTE", validoAte: "2026-10-20" }, treinamento: { situacao: "VIGENTE", modo: "MANUAL", validoAte: "2027-06-01" }, ficha: { validoAte: "2027-03-01" } };
  return {
    ...real,
    avaliarAptidao: (f, o) => {
      const st = f.membro && f.membro.status;
      if (st === "APTO_ADULTO") return { apto: true, contaComoAdulto: true, menorDeIdade: false, idade: 40, bloqueios: [], validades, proximoVencimento: real.proximoVencimento(validades, o.hoje) };
      if (st === "APTO_ADOLESCENTE") return { apto: true, contaComoAdulto: false, menorDeIdade: true, idade: 16, bloqueios: [], validades, proximoVencimento: real.proximoVencimento(validades, o.hoje) };
      return real.avaliarAptidao(f, o);
    }
  };
});

const auth = require("../auth");
const { getPool } = require("../db");
const { registrarAuditoria } = require("../auditoria");
const { notificarAgora } = require("../canaisDb");
const db = require("../ministerioMenoresDb");
const ebd = require("../ebdTurmas");
const hChamada = require("../../GestaoEbdChamada/index.js");
const hCaderneta = require("../../GestaoEbdCaderneta/index.js");
const hSala = require("../../GestaoEbdSalaAula/index.js");
const hRevistas = require("../../GestaoEbdRevistas/index.js");
const hAtiv = require("../../GestaoEbdAtividades/index.js");

const HOJE = "2026-10-09";
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const escritas = () => mockConsultas.filter((c) => /^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.test(c.sql));
// O status de aptidão de cada matrícula (ver o mock acima). Sem marca: inapto.
let mockStatus = {};
const FATOS_DO_MEMBRO = /SELECT MembroId, DataNascimento, DataAdmissao, Status, SituacaoMembro FROM MembroReferencia WHERE MembroId IN/;
const comStatus = () => quando(FATOS_DO_MEMBRO, (i) => Object.entries(i).filter(([k]) => /^m\d+$/.test(k)).map(([, id]) => ({ MembroId: id, DataNascimento: new Date("1980-01-01"), DataAdmissao: new Date("2010-01-01"), Status: mockStatus[id] || "ATIVO", SituacaoMembro: "EM_COMUNHAO" })));
const LER_MEMBRO = /FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId/;
const lerMembroPorId = () => quando(LER_MEMBRO, (i) => [{ MembroId: i.id, Nome: `Pessoa ${i.id}`, Email: `p${i.id}@e.org`, DataNascimento: new Date("1980-01-01"), Status: "ATIVO", SituacaoMembro: "EM_COMUNHAO", CongregacaoId: 1, CongregacaoNome: "Central" }]);
let pool;
beforeEach(async () => { mockRegras = []; mockConsultas = []; mockStatus = {}; jest.clearAllMocks(); db.limparCacheDoPainel(); pool = await getPool(); });

// ================================================================================================
// 1) O professor da turma da EBD com menores entra no painel, na escada de avisos de vencimento e no aviso mensal
// ================================================================================================
describe("1) professor de turma da EBD marcada \"com menores\" é voluntário com menores", () => {
  const equipeLinhas = [{ MembroId: 8, Nome: "Bia Equipe", CongregacaoId: 1, CongregacaoNome: "Central", EquipeId: 4, EquipeNome: "Berçário", LiderMembroId: 30 }];
  const turmaLinhas = [
    { MembroId: 7, Nome: "Ana Professora", CongregacaoId: 1, CongregacaoNome: "Central", TurmaId: 3, TurmaNome: "Juniores" },
    { MembroId: 8, Nome: "Bia Equipe", CongregacaoId: 1, CongregacaoNome: "Central", TurmaId: 5, TurmaNome: "Maternal" }
  ];
  const preparar = () => {
    quando(/FROM EscalasEquipeMembros em JOIN EscalasEquipes e/, equipeLinhas);
    quando(/FROM EbdTurmaProfessores tp JOIN EbdTurmas t ON t\.TurmaId = tp\.TurmaId AND t\.Ativa = 1 AND t\.ContatoComMenores = 1\s+JOIN MembroReferencia m/, turmaLinhas);
  };
  test("a lista traz quem só leciona e junta, sem duplicar, quem está numa equipe e numa turma", async () => {
    preparar();
    const r = await db.voluntariosComMenores(pool, {});
    expect(r.map((p) => p.membroId)).toEqual([7, 8]);
    expect(r[0]).toMatchObject({ membroId: 7, equipes: [], turmas: [{ turmaId: 3, nome: "Juniores", congregacaoId: 1 }] });
    expect(r[1].equipes.map((e) => e.nome)).toEqual(["Berçário"]);
    expect(r[1].turmas.map((t) => t.nome)).toEqual(["Maternal"]);
    const sqlTurmas = mockConsultas.find((c) => /FROM EbdTurmaProfessores tp/.test(c.sql)).sql;
    expect(sqlTurmas).toMatch(/WHERE tp\.Ativo = 1/);
  });
  test("o filtro de congregação vale também para a turma (e a lista vazia não consulta nada)", async () => {
    preparar();
    await db.voluntariosComMenores(pool, { congregacaoIds: [1, 2] });
    const t = mockConsultas.find((c) => /FROM EbdTurmaProfessores tp/.test(c.sql));
    expect(t.sql).toMatch(/AND t\.CongregacaoId IN \(@c0,@c1\)/);
    expect(t.inputs).toMatchObject({ c0: 1, c1: 2 });
    mockConsultas = [];
    expect(await db.voluntariosComMenores(pool, { congregacaoIds: [] })).toEqual([]);
    expect(mockConsultas).toHaveLength(0);
  });
  test("o painel mostra a turma do professor", async () => {
    preparar();
    comStatus();
    mockStatus = { 7: "APTO_ADULTO" };
    const p = await db.painel(pool, { hoje: HOJE });
    const ana = p.voluntarios.find((v) => v.membroId === 7);
    expect(ana).toMatchObject({ equipes: [], turmas: ["Juniores"] });
    expect(p.resumo.total).toBe(2);
  });
  test("a escada de vencimento avisa o professor, a secretaria e a gestão da EBD da congregação da turma (antes ele saía da turma sem aviso prévio)", async () => {
    preparar();
    comStatus();
    mockStatus = { 7: "APTO_ADULTO" };
    quando(/SELECT \* FROM VoluntariosHabilitacao WHERE MembroId IN/, [{ HabilitacaoId: 70, MembroId: 7 }]);
    lerMembroPorId();
    const fatos = await db.detectarVencimentos(pool, { faixa: 15, hoje: HOJE });       // a certidão vence em 2026-10-20: 11 dias
    const doProfessor = fatos.filter((f) => f.destinatarios.some((d) => d.membroId === 7));
    expect(doProfessor).toHaveLength(1);
    const daGestao = fatos.find((f) => f.destinatarios.some((d) => d.membroId === 41));
    expect(daGestao.destinatarios.map((d) => d.membroId).sort()).toEqual([40, 41]);
    expect(daGestao.fatoGerador).toMatch(/Ana Professora/);
    expect(daGestao.fatoGerador).toMatch(/sai automaticamente das turmas da EBD com menores/);
  });
  test("o aviso mensal das certidões a renovar inclui o professor da turma", async () => {
    preparar();
    comStatus();
    mockStatus = { 7: "APTO_ADULTO", 8: "APTO_ADULTO" };
    const fatos = await db.detectarVistoriasARenovar(pool, { hoje: HOJE });
    expect(fatos).toHaveLength(1);
    expect(fatos[0].fatoGerador).toMatch(/Ana Professora/);
  });
  test("Meu Painel lista as turmas com menores da pessoa", async () => {
    comStatus();
    mockStatus = { 7: "APTO_ADULTO" };
    quando(/SELECT t\.TurmaId, t\.Nome FROM EbdTurmaProfessores tp JOIN EbdTurmas t/, [{ TurmaId: 3, Nome: "Juniores" }]);
    const s = await db.minhaSituacao(pool, 7, { hoje: HOJE });
    expect(s.turmas).toEqual([{ turmaId: 3, nome: "Juniores" }]);
  });
});

// ================================================================================================
// 2) Migração 147
// ================================================================================================
describe("2) migração 147", () => {
  const ARQ = path.join(__dirname, "..", "..", "..", "sql", "migrations", "147_trava_7b_menores.sql");
  const SQL = fs.existsSync(ARQ) ? fs.readFileSync(ARQ, "utf8") : "";
  const TEXTO = SQL.split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join("\n").replace(/\s+/g, " ");
  test("a regra das certidões a renovar passa a ser obrigatória (só onde ainda não é)", () => {
    expect(TEXTO).toContain("UPDATE dbo.NotificacaoRegras SET Obrigatoria = 1 WHERE Chave = N'MENORES_VISTORIAS_A_RENOVAR' AND Obrigatoria = 0;");
  });
  test("a regra nova da saída obrigatória da sala: MENORES, e-mail, obrigatória, criada só se não existe; push só onde a coluna existe", () => {
    expect(TEXTO).toMatch(/IF NOT EXISTS \(SELECT 1 FROM dbo\.NotificacaoRegras WHERE Chave = N'CHECKIN_SAIDA_OBRIGATORIA'\) INSERT INTO dbo\.NotificacaoRegras \(Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, Obrigatoria\) VALUES \(N'CHECKIN_SAIDA_OBRIGATORIA', N'[^']+', N'MENORES', NULL, NULL, 1, 1\);/);
    expect(TEXTO).toMatch(/IF EXISTS \(SELECT 1 FROM sys\.columns WHERE object_id = OBJECT_ID\(N'dbo\.NotificacaoRegras'\) AND name = N'CanalPush'\) EXEC\(N'UPDATE dbo\.NotificacaoRegras SET CanalPush = 1 WHERE Chave = N''CHECKIN_SAIDA_OBRIGATORIA''/);
  });
  test("todas as regras MENORES_* e CHECKIN_* criadas nas migrações do ministério e do check-in nascem obrigatórias ou são corrigidas pela 147", () => {
    const pasta = path.join(__dirname, "..", "..", "..", "sql", "migrations");
    for (const nome of ["143_ministerio_menores.sql", "145_checkin_infantil.sql"]) {
      const t = fs.readFileSync(path.join(pasta, nome), "utf8").replace(/\s+/g, " ");
      for (const m of t.matchAll(/INSERT INTO dbo\.NotificacaoRegras \(([^)]*)\) VALUES \(N'((?:MENORES|CHECKIN)_[A-Z_]+)'/g)) {
        if (!/Obrigatoria/.test(m[1])) expect(TEXTO).toContain(`SET Obrigatoria = 1 WHERE Chave = N'${m[2]}'`);
      }
    }
  });
  test("o arquivo separa os lotes com GO", () => {
    expect(SQL.split(/^\s*GO\s*$/gim).length).toBeGreaterThanOrEqual(4);
  });
});

// ================================================================================================
// 3) Meus Dados mostra a retirada da turma da EBD
// ================================================================================================
describe("3) Meus Dados: a retirada da turma da EBD aparece", () => {
  test("LEFT JOIN nas equipes e nas turmas: a linha da turma (sem equipe) vem com o nome da turma", async () => {
    quando(/FROM MinisterioMenoresRetiradas r/, [
      { RetiradoEm: new Date("2026-10-08T10:00:00Z"), AlocacoesCanceladas: 1, EquipeId: null, TurmaId: 3, EquipeNome: null, TurmaNome: "Juniores" },
      { RetiradoEm: new Date("2026-10-01T10:00:00Z"), AlocacoesCanceladas: 2, EquipeId: 4, TurmaId: null, EquipeNome: "Berçário", TurmaNome: null }
    ]);
    const d = await db.dadosDoTitular(pool, 7);
    const q = mockConsultas.find((c) => /FROM MinisterioMenoresRetiradas r/.test(c.sql)).sql;
    expect(q).toMatch(/LEFT JOIN EscalasEquipes e ON e\.EquipeId = r\.EquipeId/);
    expect(q).toMatch(/LEFT JOIN EbdTurmas t ON t\.TurmaId = r\.TurmaId/);
    expect(d.retiradasDaEscala).toEqual([
      { origem: "TURMA_EBD", equipe: "Turma Juniores (EBD)", turma: "Juniores", em: "2026-10-08T10:00:00.000Z", escalasDesmarcadas: 0 },
      { origem: "EQUIPE", equipe: "Berçário", turma: null, em: "2026-10-01T10:00:00.000Z", escalasDesmarcadas: 2 }
    ]);
  });
});

// ================================================================================================
// 4) Portão da EBD tão forte quanto o do check-in
// ================================================================================================
describe("4a) designar professor em turma com menores exige ADULTO apto", () => {
  test("o adolescente apto é barrado na turma marcada (não conta como adulto); o adulto apto passa", async () => {
    quando(/SELECT ContatoComMenores FROM EbdTurmas WHERE TurmaId = @t/, [{ ContatoComMenores: 1 }]);
    comStatus();
    mockStatus = { 7: "APTO_ADULTO", 9: "APTO_ADOLESCENTE" };
    const r = await db.aptosParaTurma(pool, { turmaId: 3, membroIds: [7, 9], hoje: HOJE });
    expect([...r.aptos]).toEqual([7]);
    expect(r.bloqueados.get(9)).toMatch(/só leciona adulto \(18 anos ou mais\)/);
  });
  test("a designação recusa o adolescente com a mensagem clara, sem gravar", async () => {
    quando(/SELECT \* FROM EbdTurmas WHERE TurmaId = @id/, [{ TurmaId: 3, CongregacaoId: 1, Nome: "Juniores", Ativa: 1, ContatoComMenores: 1 }]);
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, [{ MembroId: 9 }]);
    quando(/SELECT ContatoComMenores FROM EbdTurmas WHERE TurmaId = @t/, [{ ContatoComMenores: 1 }]);
    comStatus();
    mockStatus = { 9: "APTO_ADOLESCENTE" };
    const r = await ebd.designarProfessor(pool, { turmaId: 3, membroId: 9, principal: false, designadoPorMembroId: 5 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/marcada como "com menores" e o professor não pode ser designado: em turma com menores só leciona adulto/);
    expect(escritas()).toHaveLength(0);
  });
  test("a rotina não tira de uma vez o adolescente apto já cadastrado (só os inaptos saem); quem o barra é o portão no ato", async () => {
    quando(/FROM EbdTurmaProfessores tp JOIN EbdTurmas t ON t\.TurmaId = tp\.TurmaId\s+WHERE tp\.Ativo = 1 AND t\.Ativa = 1/, [{ TurmaProfessorId: 1, TurmaId: 3, MembroId: 9, TurmaNome: "Juniores", CongregacaoId: 1 }]);
    comStatus();
    mockStatus = { 9: "APTO_ADOLESCENTE" };
    expect(await db.retirarInaptosDasTurmas(pool, { hoje: HOJE })).toEqual({ retirados: 0, vinculos: 0 });
    expect(escritas()).toHaveLength(0);
  });
});

describe("4b) as rotas da turma: na turma marcada, o professor só age apto hoje e adulto", () => {
  const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
  const professor = (id) => tokenDe(id, { via: "PIN" });
  const gestor = (id = 5) => tokenDe(id, { via: "SENHA", nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], permissoes: ["ebd_gestao"] });
  async function chamar(handler, acao, { metodo = "GET", query = {}, corpo = {}, token } = {}) {
    const context = { bindingData: { acao }, log: { error(...a) { if (process.env.VER_ERRO) console.error(...a); }, info() { }, warn() { }, verbose() { } } };
    await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
    return context.res;
  }
  let marcada;
  let professores;
  beforeEach(() => {
    marcada = 1;
    professores = new Set([7, 9]);
    quando(/SELECT \* FROM EbdTurmas WHERE TurmaId = @id/, () => [{ TurmaId: 3, CongregacaoId: 1, Nome: "Juniores", Ativa: 1, ContatoComMenores: marcada }]);
    quando(/FROM EbdTurmas t JOIN Congregacoes c ON c\.CongregacaoId = t\.CongregacaoId\s+WHERE t\.TurmaId = @id/, () => [{ TurmaId: 3, Nome: "Juniores", CongregacaoId: 1, Ativa: 1, CongregacaoNome: "Central" }]);
    quando(/FROM EbdTurmaProfessores WHERE TurmaId = @turmaId AND MembroId = @membroId AND Ativo = 1/, (i) => (i.turmaId === 3 && professores.has(i.membroId) ? [{ ContatoComMenores: marcada }] : []));
    quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, [{ Nome: "Central" }]);
    quando(/SELECT AlunoId, TurmaId FROM EbdAlunos WHERE AlunoId = @id AND Ativo = 1/, [{ AlunoId: 40, TurmaId: 3 }]);
    quando(/SELECT \* FROM EbdPedidosRevistas WHERE PedidoId = @id/, [{ PedidoId: 1, TurmaId: 3 }]);
    comStatus();
  });
  const roster = (token) => chamar(hChamada, "roster", { query: { turmaId: "3", licaoId: "9" }, token });

  test("professor apto e adulto: 200; inapto: 403 com a mensagem do portão, sem o motivo", async () => {
    mockStatus = { 7: "APTO_ADULTO" };
    expect((await roster(professor(7))).status).toBe(200);
    mockStatus = {};                                                     // perdeu a aptidão (o vínculo continua ativo até a rotina)
    const r = await roster(professor(7));
    expect(r.status).toBe(403);
    expect(r.body.mensagem).toBe(ebd.MENSAGEM_PROFESSOR_INAPTO);
    expect(r.body.mensagem).not.toMatch(/certid|antecedent|incidente|Diretoria|treinamento|política/i);
  });
  test("adolescente apto cadastrado como professor: 403 \"só adultos\"", async () => {
    mockStatus = { 9: "APTO_ADOLESCENTE" };
    const r = await roster(professor(9));
    expect(r.status).toBe(403);
    expect(r.body.mensagem).toBe(ebd.MENSAGEM_PROFESSOR_ADOLESCENTE);
  });
  test("turma SEM a marca: o vínculo basta (nada muda, nem a aptidão é calculada)", async () => {
    marcada = 0;
    expect((await roster(professor(7))).status).toBe(200);
    expect(mockConsultas.some((c) => FATOS_DO_MEMBRO.test(c.sql))).toBe(false);
  });
  test("gestão da EBD no escopo que não é professor da turma segue como antes; o gestor que É professor inapto da turma é recusado", async () => {
    expect((await roster(gestor(5))).status).toBe(200);
    professores.add(5);
    const r = await roster(gestor(5));
    expect(r.status).toBe(403);
    expect(r.body.mensagem).toBe(ebd.MENSAGEM_PROFESSOR_INAPTO);
  });
  test("quem não é professor nem gestor continua com a recusa de sempre", async () => {
    const r = await roster(professor(30));
    expect(r.status).toBe(403);
    expect(r.body.mensagem).toBe("Fora do seu escopo de atuação nesta turma.");
  });
  test("as outras rotas da turma (presença, caderneta, sala de aula, revistas, atividades) passam pelo mesmo portão", async () => {
    mockStatus = {};
    const tk = professor(7);
    const respostas = [
      await chamar(hChamada, "presenca", { metodo: "POST", corpo: { licaoId: 9, turmaId: 3, alunoId: 40, status: "PRESENTE" }, token: tk }),
      await chamar(hChamada, "offline/pacote", { query: { turmaId: "3", data: HOJE }, token: tk }),
      await chamar(hCaderneta, "caderneta/salvar", { metodo: "POST", corpo: { licaoId: 9, turmaId: 3, biblias: 1, revistas: 1 }, token: tk }),
      await chamar(hCaderneta, "caderneta/turma", { query: { licaoId: "9", turmaId: "3" }, token: tk }),
      await chamar(hSala, "ausentes", { query: { turmaId: "3" }, token: tk }),
      await chamar(hSala, "planos/turma", { query: { turmaId: "3", data: HOJE }, token: tk }),
      await chamar(hRevistas, "pedidos", { query: { turmaId: "3" }, token: tk }),
      await chamar(hRevistas, "pedido", { query: { pedidoId: "1" }, token: tk }),
      await chamar(hAtiv, "resposta", { metodo: "POST", corpo: { questaoId: 100, alunoId: 40, resposta: true }, token: tk }),
      await chamar(hAtiv, "resumo", { query: { atividadeId: "50", turmaId: "3" }, token: tk })
    ];
    for (const r of respostas) {
      expect(r.status).toBe(403);
      expect(r.body.mensagem).toBe(ebd.MENSAGEM_PROFESSOR_INAPTO);
    }
    expect(escritas()).toHaveLength(0);
  });
});

// ================================================================================================
// 5) Quem perde a aptidão no meio do culto sai da sala do check-in
// ================================================================================================
describe("5) a retirada encerra a presença aberta na sala do check-in e avisa quem precisa agir", () => {
  const PRESENCAS = /FROM CheckinInfantilVoluntarios v JOIN EscalasServicos s ON s\.ServicoId = v\.ServicoId/;
  const presenca = (extra = {}) => ({ PresencaId: 900, ServicoId: 11, EquipeId: 4, MembroId: 7, Nome: "Pessoa Sete", EquipeNome: "Berçário", LiderMembroId: 30, CongregacaoId: 1, FaixaEtariaMenores: null, DataHora: new Date("2026-10-09T19:00:00Z"), ...extra });
  const preparar = ({ restantes = [8], criancas = 3 } = {}) => {
    quando(PRESENCAS, [presenca()]);
    comStatus();
    quando(/SELECT MembroId FROM CheckinInfantilVoluntarios WHERE ServicoId = @s AND EquipeId = @e AND SaiuEm IS NULL/, restantes.map((id) => ({ MembroId: id })));
    quando(/SELECT COUNT\(\*\) AS n FROM CheckinInfantilRegistros WHERE ServicoId = @s AND EquipeId = @e AND Situacao <> 'RETIRADA'/, [{ n: criancas }]);
    lerMembroPorId();
  };

  test("inapto presente: a presença é encerrada, o evento VOLUNTARIO_SAIU \"retirado pela liderança\" é gravado e o líder e a gestão recebem o aviso obrigatório (sem motivo), que diz que a sala furou", async () => {
    preparar();
    mockStatus = { 8: "APTO_ADULTO" };                                   // 7 (o que estava na sala) não é apto; 8 continua
    const r = await db.retirarInaptosDasEscalas(pool, { hoje: HOJE });
    expect(r).toMatchObject({ presencasEncerradas: 1 });
    const q = mockConsultas.find((c) => PRESENCAS.test(c.sql));
    expect(q.sql).toMatch(/v\.SaiuEm IS NULL AND CAST\(s\.DataHora AS DATE\) = @hoje/);
    expect(q.inputs.hoje).toBe(HOJE);
    const up = escritas().find((c) => /UPDATE CheckinInfantilVoluntarios SET SaiuEm = SYSUTCDATETIME\(\)/.test(c.sql));
    expect(up.sql).toMatch(/WHERE PresencaId = @p AND SaiuEm IS NULL/);
    expect(up.inputs.p).toBe(900);
    const ev = escritas().find((c) => /INSERT INTO CheckinInfantilEventos/.test(c.sql));
    expect(ev.inputs).toMatchObject({ s: 11, e: 4, t: "VOLUNTARIO_SAIU", a: 7, d: "retirado pela liderança", r: null });
    const aud = registrarAuditoria.mock.calls.map((c) => c[0]).find((a) => a.acao === "CHECKIN_VOLUNTARIO_SAIU");
    expect(aud).toMatchObject({ tabela: "CheckinInfantilVoluntarios", usuarioId: null, dadosDepois: { servicoId: 11, equipeId: 4 } });
    expect(JSON.stringify(aud)).not.toMatch(/"membroId"/);
    const aviso = notificarAgora.mock.calls.map((c) => c[1]).find((a) => a.regraChave === "CHECKIN_SAIDA_OBRIGATORIA");
    expect(aviso).toMatchObject({ referenciaId: 900, referenciaTabela: "CheckinInfantilVoluntarios" });
    expect(aviso.destinatarios.map((d) => d.membroId).sort()).toEqual([30, 40]);    // o líder da equipe e a gestão da congregação (habilitacao_voluntarios)
    expect(aviso.mensagem).toMatch(/uma pessoa da equipe precisa sair da sala agora/);
    expect(aviso.mensagem).toMatch(/Pessoa Sete/);
    expect(aviso.mensagem).toMatch(/a sala ficou com 1 adulto\(s\) habilitado\(s\) para 3 criança\(s\) e precisa de ao menos 2/);
    expect(aviso.mensagem).not.toMatch(/pendência|certid|antecedent|incidente|Diretoria|autodenúncia|treinamento/i);
  });
  test("a sala que continua com os dois adultos não ganha o alerta de sala furada", async () => {
    preparar({ restantes: [8, 10] });
    mockStatus = { 8: "APTO_ADULTO", 10: "APTO_ADULTO" };
    await db.retirarInaptosDasEscalas(pool, { hoje: HOJE });
    const aviso = notificarAgora.mock.calls.map((c) => c[1]).find((a) => a.regraChave === "CHECKIN_SAIDA_OBRIGATORIA");
    expect(aviso.mensagem).not.toMatch(/Atenção/);
  });
  test("o adolescente que sobra na sala não conta como adulto (como a sala conta)", async () => {
    preparar({ restantes: [8, 12] });
    mockStatus = { 8: "APTO_ADULTO", 12: "APTO_ADOLESCENTE" };
    await db.retirarInaptosDasEscalas(pool, { hoje: HOJE });
    const aviso = notificarAgora.mock.calls.map((c) => c[1]).find((a) => a.regraChave === "CHECKIN_SAIDA_OBRIGATORIA");
    expect(aviso.mensagem).toMatch(/ficou com 1 adulto\(s\)/);
  });
  test("quem está apto na sala fica (nada é gravado nem avisado)", async () => {
    preparar();
    mockStatus = { 7: "APTO_ADULTO", 8: "APTO_ADULTO" };
    const r = await db.retirarInaptosDasEscalas(pool, { hoje: HOJE });
    expect(r.presencasEncerradas).toBe(0);
    expect(escritas()).toHaveLength(0);
    expect(notificarAgora).not.toHaveBeenCalled();
  });
  test("a pessoa saiu sozinha entre a leitura e o encerramento: nada de evento nem aviso", async () => {
    quando(/UPDATE CheckinInfantilVoluntarios SET SaiuEm/, [], 0);
    preparar();
    const r = await db.retirarInaptosDasEscalas(pool, { hoje: HOJE });
    expect(r.presencasEncerradas).toBe(0);
    expect(escritas().some((c) => /INSERT INTO CheckinInfantilEventos/.test(c.sql))).toBe(false);
    expect(notificarAgora).not.toHaveBeenCalled();
  });
  test("a retirada imediata de UMA pessoa (ato da Diretoria / Comitê) filtra pela pessoa; a de uma equipe, pela equipe", async () => {
    await db.retirarInaptosDasEscalas(pool, { hoje: HOJE, membroId: 7 });
    let q = mockConsultas.find((c) => PRESENCAS.test(c.sql));
    expect(q.sql).toMatch(/AND v\.MembroId = @m/);
    expect(q.inputs.m).toBe(7);
    mockConsultas = [];
    await db.retirarInaptosDasEscalas(pool, { hoje: HOJE, equipeId: 4 });
    q = mockConsultas.find((c) => PRESENCAS.test(c.sql));
    expect(q.sql).toMatch(/AND v\.EquipeId = @eq/);
    expect(q.inputs.eq).toBe(4);
  });
  test("o líder que é a própria pessoa retirada não recebe o aviso; se ninguém pode ser avisado, a presença continua encerrada e o resultado diz", async () => {
    quando(PRESENCAS, [presenca({ LiderMembroId: 7 })]);
    preparar();
    require("../psc").resolverDestinatariosDaCongregacao.mockResolvedValueOnce([]);
    const erro = jest.spyOn(console, "error").mockImplementation(() => { });
    const r = await db.retirarInaptosDasEscalas(pool, { hoje: HOJE });
    erro.mockRestore();
    expect(r).toMatchObject({ presencasEncerradas: 1, saidasSemAviso: 1 });
    expect(notificarAgora.mock.calls.some((c) => c[1].regraChave === "CHECKIN_SAIDA_OBRIGATORIA")).toBe(false);
  });
  test("o texto do aviso nunca passa de 1000 caracteres", () => {
    expect(db.textoSaidaObrigatoria({ equipe: "x".repeat(900), quando: "09/10/2026 19:00", nome: "y".repeat(300), adultos: 0, criancas: 9, minimo: 2, porAdulto: 3, furou: true }).length).toBeLessThanOrEqual(1000);
  });
});
