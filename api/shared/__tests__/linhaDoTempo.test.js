// FASE 10, v10.1b passo 2 — a linha do tempo única da pessoa (shared/linhaDoTempo.js) e as duas rotas: a da secretaria (LinhaDoTempoMembro, no escopo, disciplina
// só com a permissão) e a da própria pessoa (MinhaLinhaDoTempo, sem disciplina). O banco é simulado por TEXTO da consulta; o comportamento contra o SQL Server
// de verdade está no roteiro ponta a ponta (tools/e2e-localdb/e2e-86-linha-do-tempo.js).
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return typeof valor === "function" ? valor(inputs, texto) : valor;
    return { recordset: [], recordsets: [[]], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));

const auth = require("../auth");
const linha = require("../linhaDoTempo");
const hSecretaria = require("../../LinhaDoTempoMembro/index.js");
const hMinha = require("../../MinhaLinhaDoTempo/index.js");

const FICHA = { Nome: "Ana Teste", Status: "ATIVO", FormaAdmissao: "BATISMO", DataAdmissao: "2015-04-12", DataBatismo: "2015-04-12", DataRitoRecebimento: "2015-05-03",
  MinistranteRito: "Pr. Exemplo", Origem: null, IgrejaAnterior: null, DataSaida: null, MotivoSaida: null };
const FONTES = () => ({
  membro: { ...FICHA },
  consagracoes: [{ Assunto: "Diaconato", CargoAtual: "DIACONO", Status: "CONCLUIDO", DataProtocolo: "2020-02-01", DataConclusao: "2021-10-17" }],
  cartas: [{ Tipo: "RECOMENDACAO", DataEmissao: "2022-01-10", Destino: "Igreja Irmã" }],
  marcos: [{ MarcoId: 7, Tipo: "CONVERSAO", NomeTipo: "Conversão", Descricao: "Igreja Batista Esperança", DataMarco: "1998-03-01", DataAproximada: true },
    { MarcoId: 8, Tipo: "BATISMO_ESPIRITO_SANTO", NomeTipo: "Batismo no Espírito Santo", Descricao: "culto de oração", DataMarco: "2016-09-20", DataAproximada: false },
    { MarcoId: 9, Tipo: "CURSO_DISCIPULADO", NomeTipo: "Curso de Discipulado", Descricao: "turma de 2014", DataMarco: null, DataAproximada: false }],
  cargos: [{ Cargo: "AUXILIAR", Desde: "2018-01-01", Ate: "2021-10-16", Origem: "CADASTRO" }],
  casamentos: [{ DataCasamento: "2019-02-20", Celebrante: "Pr. Exemplo", Modalidade: "CIVIL_E_RELIGIOSO", Conjuge: "Paulo Teste" }],
  apresentacoes: [{ NomeCrianca: "Lia Teste", DataApresentacao: "2021-06-06", Oficiante: "Pr. Exemplo" }],
  batismo: [{ TurmaId: 3, Status: "BATIZADO", DataInscricao: "2015-02-01", DataBatismoTurma: "2015-04-12", Local: "Templo Sede" }],
  oficiantes: [{ TurmaId: 3, Nome: "Pr. Exemplo" }, { TurmaId: 3, Nome: "Pr. Segundo" }],
  credenciais: [{ Via: 1, Situacao: "SUBSTITUIDA", EmitidaEm: "2021-11-01", EncerradaEm: "2023-03-01", MotivoEncerramento: "perdeu a carteira" },
    { Via: 2, Situacao: "CANCELADA", EmitidaEm: "2023-03-01", EncerradaEm: "2024-05-05", MotivoEncerramento: "Pessoa excluída por decisão disciplinar" }],
  licencas: [{ DataPleito: "2024-10-06", DataInicioLicenca: "2024-07-08", Status: "RETORNOU", DataRetornoDecidida: "2024-11-01" }],
  processos: [{ DataAbertura: "2024-04-01", DataConclusao: "2024-05-05", Status: "JULGADO", Resultado: "EXCLUSAO", DiasSancao: null, PenalidadeNome: "Exclusão" }],
  abandonos: [{ Tipo: "MATERIAL", DataNotificacao: "2023-08-01", DataHomologacao: null }]
});

describe("montarLinhaDoTempo: a regra", () => {
  test("soma todas as fontes, mais recente primeiro, sem data no fim", () => {
    const { eventos } = linha.montarLinhaDoTempo(FONTES(), { disciplina: false });
    const tipos = eventos.map((e) => e.tipo);
    for (const t of ["CONVERSAO", "BATISMO_ESPIRITO_SANTO", "BATISMO_INSCRICAO", "BATISMO_AGUAS", "ADMISSAO", "RITO_RECEBIMENTO", "CONSAGRACAO_PROTOCOLO", "CONSAGRACAO_CONCLUIDA",
      "CARGO_INICIO", "CARGO_FIM", "CASAMENTO", "APRESENTACAO", "CARTA_TRANSITO", "CREDENCIAL_EMITIDA", "CREDENCIAL_ENCERRADA", "LICENCA_INICIO", "LICENCA_FIM", "MARCO"]) {
      expect(tipos).toContain(t);
    }
    const datas = eventos.map((e) => e.data).filter(Boolean);
    expect(datas).toEqual(datas.slice().sort().reverse());
    expect(eventos[eventos.length - 1].data).toBeNull();   // o curso sem data vai para o fim
    expect(eventos.find((e) => e.tipo === "CONVERSAO").aproximada).toBe(true);
  });
  test("o batismo da turma (com local e oficiantes) não se repete com a data da ficha", () => {
    const { eventos, vidaEspiritual } = linha.montarLinhaDoTempo(FONTES());
    const batismos = eventos.filter((e) => e.tipo === "BATISMO_AGUAS");
    expect(batismos).toHaveLength(1);
    expect(batismos[0].detalhe).toBe("Templo Sede · oficiado por Pr. Exemplo, Pr. Segundo");
    expect(vidaEspiritual.batismoAguas).toEqual({ data: "2015-04-12", local: "Templo Sede", oficiantes: "Pr. Exemplo, Pr. Segundo", emOutraIgreja: null });
  });
  test("no mesmo dia, a entrada fica acima do batismo (o que veio depois em cima)", () => {
    const { eventos } = linha.montarLinhaDoTempo(FONTES());
    const doDia = eventos.filter((e) => e.data === "2015-04-12").map((e) => e.tipo);
    expect(doDia).toEqual(["ADMISSAO", "BATISMO_AGUAS"]);
  });
  test("a vida espiritual à vista: conversão, batismo no Espírito Santo, procedência", () => {
    const { vidaEspiritual } = linha.montarLinhaDoTempo(FONTES());
    expect(vidaEspiritual.conversao).toEqual({ data: "1998-03-01", aproximada: true, detalhe: "Igreja Batista Esperança" });
    expect(vidaEspiritual.batismoEspiritoSanto).toEqual({ data: "2016-09-20", aproximada: false, detalhe: "culto de oração" });
    expect(vidaEspiritual.procedencia).toEqual({ formaAdmissao: "por batismo", dataAdmissao: "2015-04-12", igrejaAnterior: null, origem: null });
  });
  test("quem veio de fora por carta: o batismo da ficha diz a igreja", () => {
    const f = FONTES(); f.batismo = []; f.oficiantes = [];
    f.membro = { ...FICHA, FormaAdmissao: "CARTA_MUDANCA", IgrejaAnterior: "AD Outra Cidade", DataBatismo: "2005-01-01" };
    const { eventos, vidaEspiritual } = linha.montarLinhaDoTempo(f);
    expect(eventos.find((e) => e.tipo === "BATISMO_AGUAS").detalhe).toBe("em outra igreja: AD Outra Cidade");
    expect(eventos.find((e) => e.tipo === "ADMISSAO")).toMatchObject({ titulo: "Entrada no rol de membros (por carta de mudança)", detalhe: "Veio de: AD Outra Cidade" });
    expect(vidaEspiritual.batismoAguas.emOutraIgreja).toBe("AD Outra Cidade");
  });
  test("SEM a permissão disciplina: nada de processo, abandono, motivo de recolhimento nem 'depois de exclusão'", () => {
    const f = FONTES();
    f.membro = { ...FICHA, DataAdmissao: "2025-01-10", DataSaida: "2024-05-05", MotivoSaida: "EXCLUSAO", Status: "ATIVO" };
    const r = linha.montarLinhaDoTempo(f, { disciplina: false });
    const texto = JSON.stringify(r);
    expect(r.eventos.some((e) => e.categoria === "DISCIPLINA")).toBe(false);
    expect(texto).not.toMatch(/exclus|disciplinar|abandono/i);
    expect(r.eventos.find((e) => e.tipo === "SAIDA").titulo).toBe("Saída do rol de membros");
    expect(r.eventos.find((e) => e.tipo === "READMISSAO").titulo).toBe("Readmissão no rol de membros");
    expect(r.eventos.find((e) => e.titulo === "Credencial recolhida (2ª via)").detalhe).toBeNull();
  });
  test("COM a permissão disciplina: os processos, o abandono, o motivo e a readmissão depois de exclusão", () => {
    const f = FONTES();
    f.membro = { ...FICHA, DataAdmissao: "2025-01-10", DataSaida: "2024-05-05", MotivoSaida: "EXCLUSAO" };
    const { eventos } = linha.montarLinhaDoTempo(f, { disciplina: true });
    expect(eventos.filter((e) => e.categoria === "DISCIPLINA").map((e) => e.tipo).sort()).toEqual(["ABANDONO_NOTIFICACAO", "DISCIPLINA_ABERTURA", "DISCIPLINA_CONCLUSAO"]);
    expect(eventos.find((e) => e.tipo === "SAIDA").titulo).toBe("Saída do rol: exclusão");
    expect(eventos.find((e) => e.tipo === "READMISSAO").titulo).toBe("Readmissão no rol de membros (depois de exclusão)");
    expect(eventos.find((e) => e.tipo === "DISCIPLINA_CONCLUSAO")).toMatchObject({ titulo: "Processo disciplinar concluído: EXCLUSAO", detalhe: "Exclusão" });
  });
  test("exclusão recusada pela CEI não vira 'readmissão depois de exclusão'", () => {
    const f = FONTES();
    f.membro = { ...FICHA, DataAdmissao: "2025-01-10" };
    f.processos = [{ DataAbertura: "2024-04-01", DataConclusao: "2024-05-05", Status: "JULGADO", Resultado: "EXCLUSAO", CEIRecusouEm: "2024-06-01" }];
    const { eventos } = linha.montarLinhaDoTempo(f, { disciplina: true });
    expect(eventos.find((e) => e.tipo === "ADMISSAO")).toBeTruthy();
    expect(eventos.some((e) => e.tipo === "READMISSAO")).toBe(false);
  });
  test("falecimento e saída por carta", () => {
    const f = FONTES(); f.membro = { ...FICHA, DataSaida: "2026-01-02", MotivoSaida: "FALECIMENTO", Status: "FALECIDO" };
    expect(linha.montarLinhaDoTempo(f).eventos[0]).toMatchObject({ tipo: "FALECIMENTO", titulo: "Falecimento", data: "2026-01-02" });
    f.membro = { ...FICHA, DataSaida: "2026-01-02", MotivoSaida: "CARTA_MUDANCA" };
    expect(linha.montarLinhaDoTempo(f).eventos[0]).toMatchObject({ tipo: "SAIDA", titulo: "Saída por carta de mudança" });
  });
  test("ficha vazia: sem quebrar", () => {
    const r = linha.montarLinhaDoTempo({ membro: { Nome: "Só Nome" } });
    expect(r.eventos).toEqual([]);
    expect(r.vidaEspiritual).toEqual({ conversao: null, batismoAguas: null, batismoEspiritoSanto: null, procedencia: null });
    expect(linha.montarLinhaDoTempo(null).eventos).toEqual([]);
  });
  test("paginar: limites e valores esquisitos", () => {
    const ev = Array.from({ length: 130 }, (_, i) => ({ i }));
    expect(linha.paginar(ev, {})).toMatchObject({ total: 130, pagina: 1, porPagina: 50 });
    expect(linha.paginar(ev, { pagina: "3", porPagina: "50" }).itens.map((e) => e.i)).toEqual(Array.from({ length: 30 }, (_, i) => 100 + i));
    expect(linha.paginar(ev, { porPagina: "9999" }).porPagina).toBe(200);
    expect(linha.paginar(ev, { pagina: "-4", porPagina: "abc" })).toMatchObject({ pagina: 1, porPagina: 50 });
    expect(linha.paginar(ev, { pagina: "99" }).itens).toEqual([]);
  });
});

describe("lerFontes: UMA ida ao banco", () => {
  test("todas as fontes num lote só; disciplina só quando pode", async () => {
    const consultas = [];
    const pool = { request: () => { const r = { input: () => r, query: async (t) => { consultas.push(t); return { recordsets: [] }; } }; return r; } };
    await linha.lerFontes(pool, { Int: 1 }, 10, { disciplina: false });
    expect(consultas).toHaveLength(1);
    expect(consultas[0]).not.toMatch(/ProcessosDisciplinares|ProcedimentosAbandono/);
    expect(consultas[0]).not.toMatch(/\bCpf\b/);   // nunca o CPF
    const daCredencial = consultas[0].split(";").find((s) => /CredenciaisEclesiasticas/.test(s));
    expect(daCredencial).not.toMatch(/\bCodigo\b/);   // nem o código do QR da credencial
    await linha.lerFontes(pool, { Int: 1 }, 10, { disciplina: true });
    expect(consultas).toHaveLength(2);
    expect(consultas[1]).toMatch(/ProcessosDisciplinares[\s\S]*ProcedimentosAbandono/);
  });
});

// ---- as rotas ----
const tokenDe = (extra) => auth.reassinarSessao({ membroId: 5, via: "SENHA", permissoes: ["pessoas"], escopoCongregacoes: [], termosPendentes: [], ...extra });
const contexto = (binding) => ({ bindingData: binding, log: { error() {}, info() {}, warn() {}, verbose() {} } });
const pedido = (token, query = {}) => ({ method: "GET", query, body: {}, headers: { "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000", "x-auth-token": token } });
const PESSOA = { MembroId: 101, Nome: "Ana Teste", Status: "ATIVO", CongregacaoNome: "Vila Nova", ExtensaoNome: null };
function bancoDaPessoa() {
  mockRegras.push([/SELECT m\.MembroId, m\.Nome, m\.Status, c\.Nome AS CongregacaoNome/, (inp) => ({ recordset: Number(inp.id) === 101 ? [PESSOA] : [] })]);
  mockRegras.push([/FROM MembroReferencia WHERE MembroId = @id;/, (inp, texto) => {
    const f = FONTES();
    const rs = [[f.membro], f.consagracoes, f.cartas, f.marcos, f.cargos, f.casamentos, f.apresentacoes, f.batismo, f.oficiantes, f.credenciais, f.licencas];
    if (/ProcessosDisciplinares/.test(texto)) rs.push(f.processos, f.abandonos);
    return { recordsets: rs, recordset: rs[0] };
  }]);
}
beforeEach(() => { mockRegras = []; mockConsultas = []; bancoDaPessoa(); });

describe("LinhaDoTempoMembro (a secretaria)", () => {
  test("sem sessão: 401; sem a permissão pessoas: 403", async () => {
    const c1 = contexto({ membroId: "101" }); await hSecretaria(c1, pedido(undefined)); expect(c1.res.status).toBe(401);
    const c2 = contexto({ membroId: "101" }); await hSecretaria(c2, pedido(tokenDe({ permissoes: ["eventos"] }))); expect(c2.res.status).toBe(403);
  });
  test("no escopo (Vila Nova): a linha do tempo SEM disciplina", async () => {
    const c = contexto({ membroId: "101" });
    await hSecretaria(c, pedido(tokenDe({ escopoCongregacoes: ["Vila Nova"] })));
    expect(c.res.body.sucesso).toBe(true);
    expect(c.res.body.eventos.some((e) => e.categoria === "DISCIPLINA")).toBe(false);
    expect(mockConsultas.some((q) => /ProcessosDisciplinares/.test(q.sql))).toBe(false);   // nem é lido
    expect(c.res.body.total).toBe(c.res.body.eventos.length);
  });
  test("fora do escopo e matrícula que não existe: a MESMA resposta", async () => {
    const fora = contexto({ membroId: "101" }); await hSecretaria(fora, pedido(tokenDe({ escopoCongregacoes: ["Jardim"] })));
    const nao = contexto({ membroId: "999" }); await hSecretaria(nao, pedido(tokenDe({ escopoCongregacoes: "TODAS" })));
    const lixo = contexto({ membroId: "1;DROP" }); await hSecretaria(lixo, pedido(tokenDe({ escopoCongregacoes: "TODAS" })));
    expect(fora.res.body).toEqual({ sucesso: false, mensagem: "Matrícula não encontrada." });
    expect(nao.res.body).toEqual(fora.res.body);
    expect(lixo.res.body).toEqual(fora.res.body);
    expect(mockConsultas.some((q) => /FROM Consagracoes/.test(q.sql))).toBe(false);
  });
  test("com disciplina NO ESCOPO DELA: entram os processos; disciplina de outra congregação não abre", async () => {
    const ok = contexto({ membroId: "101" });
    await hSecretaria(ok, pedido(tokenDe({ permissoes: ["pessoas", "disciplina"], escopoCongregacoes: "TODAS" })));
    expect(ok.res.body.eventos.some((e) => e.tipo === "DISCIPLINA_ABERTURA")).toBe(true);
    // a disciplina vem de uma concessão com OUTRO escopo (delegação) — a pessoa está no escopo de "pessoas", não no de "disciplina"
    mockConsultas = [];
    const t = auth.reassinarSessao({ membroId: 5, via: "SENHA", permissoes: ["pessoas", "disciplina"], escopoCongregacoes: ["Vila Nova"], termosPendentes: [],
      concessoes: [{ tipo: "PROPRIA", permissoes: ["pessoas"], escopoCongregacoes: ["Vila Nova"] }, { tipo: "DELEGACAO", permissoes: ["disciplina"], escopoCongregacoes: ["Jardim"] }] });
    const so = contexto({ membroId: "101" });
    await hSecretaria(so, pedido(t));
    expect(so.res.body.sucesso).toBe(true);
    expect(so.res.body.eventos.some((e) => e.categoria === "DISCIPLINA")).toBe(false);
  });
  test("paginação na resposta", async () => {
    const c = contexto({ membroId: "101" });
    await hSecretaria(c, pedido(tokenDe({ escopoCongregacoes: "TODAS" }), { pagina: "2", porPagina: "5" }));
    expect(c.res.body).toMatchObject({ pagina: 2, porPagina: 5 });
    expect(c.res.body.eventos).toHaveLength(5);
    expect(c.res.body.total).toBeGreaterThan(10);
  });
});

describe("MinhaLinhaDoTempo (a própria pessoa)", () => {
  test("a própria: a linha inteira, sem disciplina (mesmo tendo a permissão)", async () => {
    const t = auth.reassinarSessao({ membroId: 101, via: "PIN", permissoes: ["disciplina"], escopoCongregacoes: "TODAS", termosPendentes: [] });
    const c = contexto({ matricula: "101" });
    await hMinha(c, pedido(t));
    expect(c.res.body.sucesso).toBe(true);
    expect(c.res.body.eventos.length).toBeGreaterThan(10);
    expect(c.res.body.eventos.some((e) => e.categoria === "DISCIPLINA")).toBe(false);
    expect(mockConsultas.some((q) => /ProcessosDisciplinares/.test(q.sql))).toBe(false);
  });
  test("a de outra pessoa: 403; sem sessão: 401", async () => {
    const t = auth.reassinarSessao({ membroId: 102, via: "PIN", termosPendentes: [] });
    const c = contexto({ matricula: "101" }); await hMinha(c, pedido(t)); expect(c.res.status).toBe(403);
    const s = contexto({ matricula: "101" }); await hMinha(s, pedido(undefined)); expect(s.res.status).toBe(401);
  });
});
