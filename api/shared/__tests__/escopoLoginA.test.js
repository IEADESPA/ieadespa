// Auditoria de escopo (02/10/2026), grupo A: rotas que só pedem LOGIN (qualquer membro, inclusive a sessão de PIN sem permissão nenhuma) e fazem a conferência de
// permissão/escopo por conta própria. Cada teste prende UMA brecha que o relatório achou, para ela não voltar:
//  - ranking de conquistas devolvia nome + matrícula de todos os alunos de EBD a qualquer login;
//  - BuscaGlobal cortava no TOP 5 antes do filtro de escopo, achava anexos sigilosos de outras unidades e fornecedor/projeto para papel local;
//  - GestaoCanais: sincronismo e contadores da igreja inteira para gestor local; textos internos da ocorrência para quem só avisou; sondas 404×403;
//  - GestaoTermos renovava 12 h a cada POST; "constructor" dava 500; GestaoTrilhas/PSC/Certificados/VerificarTermoAssinado davam respostas diferentes para "fora do escopo" e "não existe".
// O banco é simulado por TEXTO da consulta (como em revisaoV75.test.js); o comportamento contra o SQL Server de verdade está no roteiro ponta a ponta.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor, afetadas] of mockRegras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [afetadas === undefined ? 0 : afetadas] };
    return { recordset: [], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../protocolo", () => ({ gerarProtocolo: jest.fn(async () => "CERT-2026-0001") }));
jest.mock("../notificacaoEmail", () => ({ enviarEmailNotificacao: jest.fn(async () => {}) }));

const auth = require("../auth");
const conquistasMod = require("../conquistas");
const canaisDb = require("../canaisDb");
const hBusca = require("../../BuscaGlobal/index.js");
const hConquistas = require("../../GestaoConquistas/index.js");
const hCanais = require("../../GestaoCanais/index.js");
const hTermos = require("../../GestaoTermos/index.js");
const hVerificar = require("../../VerificarTermoAssinado/index.js");
const hSessoes = require("../../GestaoSessoes/index.js");
const hTrilhas = require("../../GestaoTrilhas/index.js");
const hCertificados = require("../../GestaoCertificados/index.js");
const hCertPdf = require("../../CertificadoPdf/index.js");
const hCertQr = require("../../CertificadoQr/index.js");
const hPsc = require("../../GestaoPsc/index.js");
const hOrgaos = require("../../MeusOrgaosLocais/index.js");
const hPainel = require("../../PainelInicial/index.js");
const hNotificacoes = require("../../Notificacoes/index.js");

const CENTRAL = "Central";
const VILA = "Vila Nova";

async function chamar(handler, { metodo = "GET", corpo = {}, token, ligado = {}, query = {} } = {}) {
  const context = { bindingData: ligado, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const rodou = (padrao) => mockConsultas.filter(c => padrao.test(c.sql));
const gravacoes = () => mockConsultas.filter(c => /(INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|MERGE\s)/i.test(c.sql));

const tok = (extra = {}) => auth.reassinarSessao({ membroId: 5, nome: "Fulano", termosPendentes: [], ...extra });
const tokenPin = () => tok({ via: "PIN", nivel: null, permissoes: [], escopoCongregacoes: [] });
const tokenLocal = (permissoes, extra = {}) => tok({ via: "SENHA", nivel: "CONGREGACAO", permissoes, escopoCongregacoes: [CENTRAL], ...extra });
const tokenGeral = (permissoes, extra = {}) => tok({ via: "SENHA", nivel: "GLOBAL", permissoes, escopoCongregacoes: "TODAS", ...extra });
const tokenGlobalComLista = (permissoes) => tok({ via: "SENHA", nivel: "GLOBAL", permissoes, escopoCongregacoes: [CENTRAL] });
const tokenLocalComTodas = (permissoes) => tok({ via: "SENHA", nivel: "CONGREGACAO", permissoes, escopoCongregacoes: "TODAS" });

// A pessoa (shared/escopoRotas.carregarPessoa): 5 = o próprio, 40 = Central, 41 = Vila Nova; o resto não existe.
const PESSOAS = {
  5: { MembroId: 5, Nome: "Fulano", Status: "ATIVO", CongregacaoNome: CENTRAL, ExtensaoNome: null },
  40: { MembroId: 40, Nome: "Maria Souza", Status: "ATIVO", CongregacaoNome: CENTRAL, ExtensaoNome: null },
  41: { MembroId: 41, Nome: "Joana Lima", Status: "ATIVO", CongregacaoNome: VILA, ExtensaoNome: null }
};
const pessoaPorId = (inputs) => (PESSOAS[inputs.id] ? [PESSOAS[inputs.id]] : []);
const PADRAO_PESSOA = /FROM MembroReferencia m\s+LEFT JOIN Congregacoes c ON c\.CongregacaoId = m\.CongregacaoId\s+LEFT JOIN ExtensoesTenda e/;
const livre = (obj) => JSON.stringify(obj);

beforeEach(() => { mockRegras = []; mockConsultas = []; quando(PADRAO_PESSOA, pessoaPorId); });

// =====================================================================================================================================================
describe("BuscaGlobal", () => {
  const PADRAO_PESSOAS_BUSCA = /FROM MembroReferencia m\s+LEFT JOIN Congregacoes cg ON cg\.CongregacaoId = m\.CongregacaoId\s+LEFT JOIN ExtensoesTenda ex/;
  const linhasPessoas = [
    { id: 1, titulo: "Ana Central", congregacao: CENTRAL, extensao: null },
    { id: 2, titulo: "Bia Vila", congregacao: VILA, extensao: null },
    { id: 3, titulo: "Cris Sem Congregação", congregacao: null, extensao: null },
    { id: 4, titulo: "Duda Tenda", congregacao: CENTRAL, extensao: "Tenda Norte" }
  ];
  const q = { q: "an" };

  test("sem sessão: 401; busca curta ou malformada: 400 sem consultar o banco", async () => {
    expect((await chamar(hBusca, { query: q })).status).toBe(401);
    for (const ruim of [{}, { q: "a" }, { q: ["ab", "cd"] }, { q: 12 }]) expect((await chamar(hBusca, { token: tokenGeral(["pessoas"]), query: ruim })).status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
  test("sessão de PIN (permissoes: []): lista vazia, sem tocar no banco", async () => {
    const r = await chamar(hBusca, { token: tokenPin(), query: q });
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
    expect(mockConsultas).toHaveLength(0);
  });
  test("pessoas, papel LOCAL: o filtro de congregação vai para o SQL ANTES do TOP 5 e o JS repete a conferência (fora do escopo e sem congregação não aparecem)", async () => {
    quando(PADRAO_PESSOAS_BUSCA, linhasPessoas);
    const r = await chamar(hBusca, { token: tokenLocal(["pessoas"]), query: q });
    const consulta = rodou(PADRAO_PESSOAS_BUSCA)[0];
    expect(consulta.sql).toMatch(/SELECT TOP 5 /);
    expect(consulta.sql).toMatch(/cg\.Nome IN \(@escopo0\)/);
    expect(consulta.inputs.escopo0).toBe(CENTRAL);
    expect(r.body.map(x => x.titulo)).toEqual(["Ana Central", "Duda Tenda"]);
    expect(r.body.every(x => x.tipo === "Pessoa")).toBe(true);
    expect(JSON.stringify(r.body)).not.toMatch(/Bia Vila|Sem Congregação/);
  });
  test("escopo de Extensão da Tenda: o SQL filtra a Extensão e o JS só deixa passar quem é da Extensão", async () => {
    quando(PADRAO_PESSOAS_BUSCA, linhasPessoas);
    const r = await chamar(hBusca, { token: tokenLocal(["pessoas"], { escopoExtensaoNome: "Tenda Norte" }), query: q });
    const consulta = rodou(PADRAO_PESSOAS_BUSCA)[0];
    expect(consulta.sql).toMatch(/ex\.Nome = @extensao/);
    expect(consulta.inputs.extensao).toBe("Tenda Norte");
    expect(r.body.map(x => x.titulo)).toEqual(["Duda Tenda"]);
  });
  test("geral: sem filtro de congregação no SQL; vê quem não tem congregação também", async () => {
    quando(PADRAO_PESSOAS_BUSCA, linhasPessoas);
    const r = await chamar(hBusca, { token: tokenGeral(["pessoas"]), query: q });
    expect(rodou(PADRAO_PESSOAS_BUSCA)[0].sql).not.toMatch(/cg\.Nome IN/);
    expect(r.body).toHaveLength(4);
  });
  test("escopo com lista vazia ou lista gigante: vazio não consulta; gigante busca mais e corta DEPOIS do filtro", async () => {
    quando(PADRAO_PESSOAS_BUSCA, linhasPessoas);
    expect((await chamar(hBusca, { token: tokenLocal(["pessoas"], { escopoCongregacoes: [] }), query: q })).body).toEqual([]);
    expect(mockConsultas).toHaveLength(0);
    const gigante = Array.from({ length: 1600 }, (_, i) => `Cong ${i}`).concat(CENTRAL);
    const r = await chamar(hBusca, { token: tokenLocal(["pessoas"], { escopoCongregacoes: gigante }), query: q });
    expect(rodou(PADRAO_PESSOAS_BUSCA)[0].sql).toMatch(/SELECT TOP 200 /);
    expect(r.body.map(x => x.titulo)).toEqual(["Ana Central", "Duda Tenda"]);
  });
  test("financeiro: fornecedor e projeto (institucionais) e anexos só para o GERAL; o lançamento é filtrado por congregação no SQL", async () => {
    quando(/FROM LancamentosTesouraria l/, [{ id: 1, termoNumero: 7, valor: 10, congregacao: CENTRAL }, { id: 2, termoNumero: 8, valor: 20, congregacao: VILA }]);
    quando(/FROM Fornecedores/, [{ id: 1, titulo: "Fornecedor X", subtitulo: "123" }]);
    quando(/FROM Projetos/, [{ id: 1, titulo: "Projeto Y", protocolo: "P-1" }]);
    quando(/FROM AnexosGenericos/, [{ id: 1, tabela: "Fornecedores", registroId: 1, nomeArquivo: "contrato.pdf" }]);
    const permissoes = ["financeiro", "reunioes", "cli", "disciplina", "ouvidoria"];
    const local = await chamar(hBusca, { token: tokenLocal(permissoes), query: { q: "ab" } });
    expect(local.body.map(x => x.tipo)).toEqual(["Lançamento"]);
    expect(rodou(/FROM LancamentosTesouraria l/)[0].sql).toMatch(/cg\.Nome IN \(@escopo0\)/);
    expect(rodou(/FROM Fornecedores|FROM Projetos|FROM AnexosGenericos/)).toHaveLength(0);
    mockConsultas = [];
    // papel GLOBAL com escopo de lista e papel local com escopo "TODAS" também NÃO são o geral
    for (const t of [tokenGlobalComLista(permissoes), tokenLocalComTodas(permissoes)]) {
      mockConsultas = [];
      await chamar(hBusca, { token: t, query: { q: "ab" } });
      expect(rodou(/FROM Fornecedores|FROM Projetos|FROM AnexosGenericos/)).toHaveLength(0);
    }
    mockConsultas = [];
    const geral = await chamar(hBusca, { token: tokenGeral(permissoes), query: { q: "ab" } });
    expect(geral.body.map(x => x.tipo).sort()).toEqual(["Documento", "Fornecedor", "Lançamento", "Lançamento", "Projeto"]);
  });
  test("anexos: processos de abandono e denúncias da Ouvidoria (sigilosos) nunca entram na busca, nem para o geral", async () => {
    quando(/FROM AnexosGenericos/, []);
    await chamar(hBusca, { token: tokenGeral(["disciplina", "ouvidoria", "financeiro", "reunioes"]), query: { q: "ab" } });
    const anexos = rodou(/FROM AnexosGenericos/)[0];
    const tabelas = Object.entries(anexos.inputs).filter(([k]) => /^t\d+$/.test(k)).map(([, v]) => v).sort();
    expect(tabelas).toEqual(["Fornecedores", "Projetos"]);
    mockConsultas = [];
    await chamar(hBusca, { token: tokenGeral(["disciplina", "ouvidoria"]), query: { q: "ab" } });
    expect(rodou(/FROM AnexosGenericos/)).toHaveLength(0);
  });
});

// =====================================================================================================================================================
describe("GestaoConquistas", () => {
  const PADRAO_TURMA_MEMBROS = /WHERE a\.TurmaId = @turmaId/;
  const PADRAO_ALUNO_PROPRIO = /SELECT TOP 1 TurmaId FROM EbdAlunos WHERE MembroId = @id/;
  const PADRAO_CONG_MEMBROS = /WHERE a\.Ativo = 1 AND/;
  const PADRAO_PROPRIA_CONGREGACAO = /SELECT CongregacaoId FROM MembroReferencia WHERE MembroId = @id/;
  const PADRAO_ESCOPO_CONG = /SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/;
  const PADRAO_ESCOPO_AREA = /SELECT Nome FROM Congregacoes WHERE AreaId = @id/;
  const PADRAO_DESBLOQUEADAS_LOTE = /SELECT d\.MembroId, c\.PontosBonus/;
  const PADRAO_EVENTOS_LOTE = /FROM ConquistasEventos WHERE MembroId IN/;
  const alunos = (n, congregacao = CENTRAL) => Array.from({ length: n }, (_, i) => ({ MembroId: 100 + i, Nome: `Aluno${i} da Silva Santos`, CongregacaoNome: congregacao }));

  // Cada aluno i ganha i pontos (um evento de peso 1 por unidade): quanto maior o i, melhor a posição.
  function montarRanking(qtd, congregacao = CENTRAL) {
    quando(/SELECT \* FROM ScoreConfig/, [{ TipoEvento: "PRESENCA", Peso: 1, EscopoTipo: null, EscopoId: null }]);
    quando(PADRAO_DESBLOQUEADAS_LOTE, []);
    quando(PADRAO_EVENTOS_LOTE, Array.from({ length: qtd }, (_, i) => Array.from({ length: i }, () => ({ MembroId: 100 + i, TipoEvento: "PRESENCA", PayloadJson: "{}" }))).flat());
    return alunos(qtd, congregacao);
  }

  test("sem sessão: 401; sessão de PIN nunca mexe no catálogo (403 antes do banco)", async () => {
    expect((await chamar(hConquistas, { ligado: { acao: "ranking" } })).status).toBe(401);
    for (const [acao, corpo] of [["tipos-evento", { tipoEvento: "X" }], ["catalogo", { nome: "Y" }], ["regra", { conquistaId: 1 }]]) {
      const r = await chamar(hConquistas, { metodo: "POST", ligado: { acao }, token: tokenPin(), corpo });
      expect(r.status).toBe(403);
    }
    expect(mockConsultas).toHaveLength(0);
  });

  describe("ranking do membro comum", () => {
    test("o pedido (escopoTipo/escopoId) é IGNORADO: vale a turma do próprio membro, lida do banco", async () => {
      quando(PADRAO_ALUNO_PROPRIO, [{ TurmaId: 7 }]);
      quando(PADRAO_TURMA_MEMBROS, montarRanking(3));
      const r = await chamar(hConquistas, { ligado: { acao: "ranking" }, token: tokenPin(), query: { escopoTipo: "TURMA", escopoId: "99" } });
      expect(r.status).toBe(200);
      expect(r.body.escopo).toBe("TURMA");
      const consulta = rodou(PADRAO_TURMA_MEMBROS)[0];
      expect(consulta.inputs.turmaId).toBe(7);
      expect(mockConsultas.some(c => c.inputs.turmaId === 99)).toBe(false);
      expect(rodou(PADRAO_ALUNO_PROPRIO)[0].inputs.id).toBe(5);
    });
    test("nome abreviado, sem matrícula, só os 20 primeiros e a posição do próprio", async () => {
      quando(PADRAO_ALUNO_PROPRIO, [{ TurmaId: 7 }]);
      const lista = montarRanking(25);
      lista[2].MembroId = 5;            // o membro da sessão é o 3º pior (aluno de índice 2): posição 23 de 25
      mockRegras = mockRegras.filter(([p]) => !p.test("WHERE a.TurmaId = @turmaId"));
      quando(PADRAO_TURMA_MEMBROS, lista);
      // os eventos do aluno de índice 2 estavam gravados com a matrícula 102: reponha para a 5
      mockRegras = mockRegras.filter(([p]) => !p.test("FROM ConquistasEventos WHERE MembroId IN"));
      quando(PADRAO_EVENTOS_LOTE, Array.from({ length: 25 }, (_, i) => Array.from({ length: i }, () => ({ MembroId: i === 2 ? 5 : 100 + i, TipoEvento: "PRESENCA", PayloadJson: "{}" }))).flat());
      const r = await chamar(hConquistas, { ligado: { acao: "ranking" }, token: tokenPin() });
      expect(r.body.ranking).toHaveLength(20);
      expect(r.body.totalParticipantes).toBe(25);
      expect(r.body.minhaPosicao).toMatchObject({ posicao: 23, score: 2 });
      expect(r.body.ranking[0]).toEqual({ posicao: 1, nome: "Aluno24 S.", score: 24, totalConquistas: 0, voce: false });
      expect(JSON.stringify(r.body)).not.toMatch(/membroId|Silva Santos|"10[0-9]"/);
    });
    test("quem não é aluno vê a ranking da própria congregação (lida do banco); sem congregação, vazio", async () => {
      quando(PADRAO_ALUNO_PROPRIO, []);
      quando(PADRAO_PROPRIA_CONGREGACAO, [{ CongregacaoId: 1 }]);
      quando(PADRAO_ESCOPO_CONG, [{ Nome: CENTRAL }]);
      quando(PADRAO_CONG_MEMBROS, montarRanking(2));
      const r = await chamar(hConquistas, { ligado: { acao: "ranking" }, token: tokenPin(), query: { escopoTipo: "GLOBAL" } });
      expect(r.body.escopo).toBe("CONGREGACAO");
      expect(rodou(PADRAO_CONG_MEMBROS)[0].inputs.nome0).toBe(CENTRAL);
      expect(r.body.ranking).toHaveLength(2);
      mockConsultas = []; mockRegras = mockRegras.filter(([p]) => !p.test("SELECT CongregacaoId FROM MembroReferencia WHERE MembroId = @id"));
      quando(PADRAO_PROPRIA_CONGREGACAO, [{ CongregacaoId: null }]);
      const vazio = await chamar(hConquistas, { ligado: { acao: "ranking" }, token: tokenPin() });
      expect(vazio.body.ranking).toEqual([]);
    });
    test("a pontuação sai em poucas consultas (por lote), não em três por aluno", async () => {
      quando(PADRAO_ALUNO_PROPRIO, [{ TurmaId: 7 }]);
      quando(PADRAO_TURMA_MEMBROS, montarRanking(40));
      await chamar(hConquistas, { ligado: { acao: "ranking" }, token: tokenPin() });
      expect(rodou(PADRAO_DESBLOQUEADAS_LOTE)).toHaveLength(1);
      expect(rodou(PADRAO_EVENTOS_LOTE)).toHaveLength(1);
      expect(rodou(/FROM ScoreConfig/)).toHaveLength(1);
    });
  });

  describe("ranking da gestão (conquistas_gestao) cruzado com o escopo", () => {
    const gestor = () => tokenLocal(["conquistas_gestao"]);
    test("turma de fora do escopo = a mesma lista vazia de uma turma que não existe", async () => {
      quando(PADRAO_TURMA_MEMBROS, (i) => (i.turmaId === 7 ? montarRanking(3, VILA) : []));
      const fora = await chamar(hConquistas, { ligado: { acao: "ranking" }, token: gestor(), query: { escopoTipo: "TURMA", escopoId: "7" } });
      const inexistente = await chamar(hConquistas, { ligado: { acao: "ranking" }, token: gestor(), query: { escopoTipo: "TURMA", escopoId: "8" } });
      expect(fora).toEqual(inexistente);
      expect(fora.body).toEqual({ sucesso: true, ranking: [] });
      expect(rodou(PADRAO_DESBLOQUEADAS_LOTE)).toHaveLength(0);
    });
    test("turma dentro do escopo: lista completa, com nome inteiro e matrícula", async () => {
      quando(PADRAO_TURMA_MEMBROS, montarRanking(3, CENTRAL));
      const r = await chamar(hConquistas, { ligado: { acao: "ranking" }, token: gestor(), query: { escopoTipo: "TURMA", escopoId: "7" } });
      expect(r.body.ranking).toHaveLength(3);
      expect(r.body.ranking[0]).toMatchObject({ membroId: 102, nome: "Aluno2 da Silva Santos" });
    });
    test("GLOBAL (ou sem tipo) vira o escopo de quem pede; Área de várias congregações é cruzada com a lista", async () => {
      quando(PADRAO_CONG_MEMBROS, montarRanking(2));
      await chamar(hConquistas, { ligado: { acao: "ranking" }, token: gestor(), query: {} });
      let c = rodou(PADRAO_CONG_MEMBROS)[0];
      expect(c.sql).toMatch(/cg\.Nome IN \(@nome0\)/);
      expect(c.inputs.nome0).toBe(CENTRAL);
      mockConsultas = [];
      quando(PADRAO_ESCOPO_AREA, [{ Nome: CENTRAL }, { Nome: VILA }]);
      await chamar(hConquistas, { ligado: { acao: "ranking" }, token: gestor(), query: { escopoTipo: "AREA", escopoId: "10" } });
      c = rodou(PADRAO_CONG_MEMBROS)[0];
      expect(c.inputs.nome0).toBe(CENTRAL);
      expect(c.inputs).not.toHaveProperty("nome1");
    });
    test("escopo desconhecido (inclusive DEPARTAMENTO, que o login resolve como 'todas'), id malformado e escopo vazio: lista vazia sem consulta de membros", async () => {
      for (const query of [{ escopoTipo: "DEPARTAMENTO", escopoId: "1" }, { escopoTipo: "XYZ" }, { escopoTipo: "TURMA", escopoId: "0x7" }, { escopoTipo: "AREA", escopoId: "1e1" }, { escopoTipo: "CONGREGACAO" }]) {
        mockConsultas = [];
        const r = await chamar(hConquistas, { ligado: { acao: "ranking" }, token: gestor(), query });
        expect(r.body).toEqual({ sucesso: true, ranking: [] });
        expect(rodou(/FROM EbdAlunos/)).toHaveLength(0);
      }
      const semLista = await chamar(hConquistas, { ligado: { acao: "ranking" }, token: tokenLocal(["conquistas_gestao"], { escopoCongregacoes: [] }), query: {} });
      expect(semLista.body.ranking).toEqual([]);
      expect(rodou(/FROM EbdAlunos/)).toHaveLength(0);
    });
    test("geral: sem filtro de congregação", async () => {
      quando(PADRAO_CONG_MEMBROS, montarRanking(2));
      await chamar(hConquistas, { ligado: { acao: "ranking" }, token: tokenGeral(["conquistas_gestao"]), query: { escopoTipo: "GLOBAL" } });
      expect(rodou(PADRAO_CONG_MEMBROS)[0].sql).not.toMatch(/cg\.Nome IN/);
    });
    test("escopo de Extensão da Tenda: só os membros daquela Extensão", async () => {
      quando(PADRAO_CONG_MEMBROS, montarRanking(2));
      await chamar(hConquistas, { ligado: { acao: "ranking" }, token: tokenLocal(["conquistas_gestao"], { escopoExtensaoNome: "Tenda Norte" }), query: {} });
      const c = rodou(PADRAO_CONG_MEMBROS)[0];
      expect(c.sql).toMatch(/ex\.Nome = @extensao/);
      expect(c.inputs.extensao).toBe("Tenda Norte");
    });
  });

  describe("painel de outra pessoa", () => {
    const aberto = (r) => expect(r.status).toBe(200);
    test("o próprio painel, com ou sem ?membroId=", async () => {
      aberto(await chamar(hConquistas, { ligado: { acao: "painel" }, token: tokenPin() }));
      aberto(await chamar(hConquistas, { ligado: { acao: "painel" }, token: tokenPin(), query: { membroId: "5" } }));
      expect(rodou(/FROM ConquistasEventos WHERE MembroId = @membroId/).every(c => c.inputs.membroId === 5)).toBe(true);
    });
    test("sem conquistas_gestao: 403 e nenhuma consulta do painel", async () => {
      const r = await chamar(hConquistas, { ligado: { acao: "painel" }, token: tokenPin(), query: { membroId: "40" } });
      expect(r.status).toBe(403);
      expect(rodou(/ConquistasEventos|ConquistasDesbloqueadas/)).toHaveLength(0);
    });
    test("permissão de escopo local que NÃO é conquistas_gestao (ex.: pessoas) também não abre o painel de quem está no escopo", async () => {
      const r = await chamar(hConquistas, { ligado: { acao: "painel" }, token: tokenLocal(["pessoas", "reunioes"]), query: { membroId: "40" } });
      expect(r.status).toBe(403);
      expect(rodou(/ConquistasEventos|ConquistasDesbloqueadas/)).toHaveLength(0);
    });
    test("gestão local: pessoa de fora do escopo, inexistente e id malformado dão a MESMA recusa e nenhuma consulta do painel; dentro do escopo, abre", async () => {
      const t = tokenLocal(["conquistas_gestao"]);
      const fora = await chamar(hConquistas, { ligado: { acao: "painel" }, token: t, query: { membroId: "41" } });
      const inexistente = await chamar(hConquistas, { ligado: { acao: "painel" }, token: t, query: { membroId: "999" } });
      const malformado = await chamar(hConquistas, { ligado: { acao: "painel" }, token: t, query: { membroId: "0x28" } });
      expect(fora.status).toBe(403);
      expect(inexistente).toEqual(fora);
      expect(malformado).toEqual(fora);
      expect(rodou(/ConquistasEventos|ConquistasDesbloqueadas/)).toHaveLength(0);
      aberto(await chamar(hConquistas, { ligado: { acao: "painel" }, token: t, query: { membroId: "40" } }));
      expect(rodou(/FROM ConquistasEventos WHERE MembroId = @membroId/)[0].inputs.membroId).toBe(40);
    });
    test("geral abre o painel de qualquer pessoa existente", async () => {
      aberto(await chamar(hConquistas, { ligado: { acao: "painel" }, token: tokenGeral(["conquistas_gestao"]), query: { membroId: "41" } }));
    });
  });

  test("unidades: abreviarNome e o recorte do ranking", () => {
    expect(conquistasMod.abreviarNome("Maria da Silva Santos")).toBe("Maria S.");
    expect(conquistasMod.abreviarNome("  João  ")).toBe("João");
    expect(conquistasMod.abreviarNome("")).toBe("");
    expect(conquistasMod.abreviarNome(null)).toBe("");
    const rec = conquistasMod.recortarRankingParaMembro([{ membroId: 1, nome: "A B", score: 3, totalConquistas: 1 }, { membroId: 2, nome: "C D", score: 1, totalConquistas: 0 }], 2, 1);
    expect(rec.ranking).toEqual([{ posicao: 1, nome: "A B.", score: 3, totalConquistas: 1, voce: false }]);
    expect(rec.minhaPosicao).toEqual({ posicao: 2, score: 1, totalConquistas: 0 });
    expect(conquistasMod.recortarRankingParaMembro([], 2).minhaPosicao).toBeNull();
  });
});

// =====================================================================================================================================================
describe("GestaoCanais", () => {
  const canal = (id, extra = {}) => ({
    CanalId: id, Sigla: `EMAIL_${id}`, Nome: `Canal ${id}`, Ativo: 1, Plataforma: "EMAIL", Categoria: "INSTITUCIONAL", TemaFocado: null,
    Identificador: `canal${id}@ieadespa.org`, IdentificadorNormalizado: `canal${id}@ieadespa.org`, VinculoInstitucional: "ESTRUTURA", DeclaracaoInstitucionalEm: "2026-09-01T10:00:00.000Z",
    Escopo: "CONGREGACAO", CongregacaoId: id, AreaId: null, DepartamentoId: null, IncluiMenores: 0, PublicoNoSite: 0, Descricao: null,
    CustodiaSecretaria: 0, UltimaTrocaCredencialEm: null, VigenteDesde: "2026-09-01", VigenteAte: null, DesativadoMotivo: null, RegistradoEm: "2026-09-01T10:00:00.000Z", ...extra
  });
  // Canal 1 é da Central (no escopo do gestor local); canal 2 é da Vila Nova (fora do escopo).
  function montarBase() {
    quando(/SELECT CongregacaoId, Nome, AreaId, Ativa FROM Congregacoes/, [{ CongregacaoId: 1, Nome: CENTRAL, AreaId: 10, Ativa: 1 }, { CongregacaoId: 2, Nome: VILA, AreaId: 10, Ativa: 1 }]);
    quando(/SELECT AreaId, Nome FROM Areas/, [{ AreaId: 10, Nome: "Área 1" }]);
    quando(/FROM CanaisOficiaisComunicacao/, (i) => (i.canalId ? ([1, 2].includes(i.canalId) ? [canal(i.canalId)] : []) : [canal(1), canal(2)]));
  }
  const ocorrencia = (id, extra = {}) => ({
    OcorrenciaId: id, CanalId: id === 2 ? 2 : 1, CanalNome: `Canal ${id === 2 ? 2 : 1}`, CanalPlataforma: "EMAIL", Categoria: "PROPAGANDA_POLITICA", Descricao: "Santinho no grupo",
    LinkEvidencia: null, RelatadaEm: "2026-10-01T10:00:00.000Z", PrazoRemocaoEm: "2026-10-02T10:00:00.000Z", Status: "ABERTA", RelatadaPorMembroId: 40, RelatadaPorNome: "Quem avisou",
    RemovidaEm: null, RemocaoRegistradaEm: null, RemovidaPorNome: null, ProvaRemocao: null, LinkProva: null, AdvertenciaEm: null, AdvertenciaObs: null, DecididaEm: null, MotivoImprocedente: null, ...extra
  });
  const OCORRENCIAS = {
    1: ocorrencia(1),
    2: ocorrencia(2),
    3: ocorrencia(3, { RelatadaPorMembroId: 5, Status: "REMOVIDA", RemovidaEm: "2026-10-01T12:00:00.000Z", RemovidaPorNome: "Adm Secreto", ProvaRemocao: "prova interna", LinkProva: "https://x.org/p", AdvertenciaEm: "2026-10-01T13:00:00.000Z", AdvertenciaObs: "advertiu o irmão João", MotivoImprocedente: "motivo interno" })
  };
  function montarOcorrencias() {
    montarBase();
    quando(/SELECT \* FROM CanalOcorrencias WHERE OcorrenciaId = @id/, (i) => (OCORRENCIAS[i.id] ? [OCORRENCIAS[i.id]] : []));
    quando(/FROM CanalOcorrencias o\s+JOIN CanaisOficiaisComunicacao c/, (i) => {
      if (i.oc) return OCORRENCIAS[i.oc] ? [OCORRENCIAS[i.oc]] : [];
      if (i.rel) return Object.values(OCORRENCIAS).filter(o => o.RelatadaPorMembroId === i.rel);
      return Object.values(OCORRENCIAS);
    });
  }
  const INTERNOS = ["advertenciaObs", "provaRemocao", "linkProva", "motivoImprocedente", "removidaPorNome"];
  const get = (acao, token, query = {}) => chamar(hCanais, { ligado: { acao }, token, query });
  const post = (acao, token, corpo = {}) => chamar(hCanais, { metodo: "POST", ligado: { acao }, token, corpo });

  test("sem sessão: 401; sessão de PIN não é gestão (403 nas ações de gestão, sem gravar)", async () => {
    montarBase();
    expect((await get("catalogos")).status).toBe(401);
    for (const acao of ["canais", "canal", "trocas", "cobertura", "transmissao"]) expect((await get(acao, tokenPin())).status).toBe(403);
    for (const acao of ["canais", "canais/desativar", "administradores/designar", "sincronizar", "transmissao", "conferencias", "credenciais/registrar"]) expect((await post(acao, tokenPin())).status).toBe(403);
    expect(gravacoes()).toHaveLength(0);
  });

  describe("para-contato: o identificador só vai para quem usa a lista", () => {
    test("membro comum vê o nome, sem o identificador", async () => {
      montarBase();
      const r = await get("para-contato", tokenPin());
      expect(r.status).toBe(200);
      expect(r.body.canais.length).toBeGreaterThan(0);
      for (const c of r.body.canais) expect(c).not.toHaveProperty("identificador");
      expect(r.body.canais[0]).toMatchObject({ canalId: 1, nome: "Canal 1" });
    });
    test("disciplina (Abandono Digital) e canais_gestao recebem o identificador; outra permissão não", async () => {
      montarBase();
      for (const permissoes of [["disciplina"], ["canais_gestao"]]) {
        const r = await get("para-contato", tokenLocal(permissoes));
        expect(r.body.canais[0].identificador).toBe("canal1@ieadespa.org");
      }
      const outra = await get("para-contato", tokenLocal(["pessoas", "reunioes"]));
      expect(outra.body.canais[0]).not.toHaveProperty("identificador");
    });
  });

  describe("ocorrências: quem só avisou não vê os textos internos; relação ausente = ocorrência que não existe", () => {
    test("minhas-ocorrencias: andamento sim, textos internos não", async () => {
      montarOcorrencias();
      const r = await get("minhas-ocorrencias", tokenPin());
      expect(r.body.ocorrencias.map(o => o.ocorrenciaId)).toEqual([3]);
      const o = r.body.ocorrencias[0];
      expect(o).toMatchObject({ status: "REMOVIDA", canalId: 1 });
      for (const campo of INTERNOS) expect(o).not.toHaveProperty(campo);
      expect(JSON.stringify(o)).not.toMatch(/Adm Secreto|prova interna|advertiu|motivo interno/);
    });
    test("ocorrencia?ocorrenciaId=: a autora vê só o andamento; quem não tem relação recebe a MESMA resposta de id que não existe", async () => {
      montarOcorrencias();
      const autora = await get("ocorrencia", tokenPin(), { ocorrenciaId: "3" });
      expect(autora.status).toBe(200);
      for (const campo of INTERNOS) expect(autora.body.ocorrencia).not.toHaveProperty(campo);
      const alheia = await get("ocorrencia", tokenPin(), { ocorrenciaId: "1" });
      const inexistente = await get("ocorrencia", tokenPin(), { ocorrenciaId: "999" });
      expect(alheia.status).toBe(404);
      expect(alheia).toEqual(inexistente);
    });
    test("gestão no escopo vê os textos internos e quem avisou; canal fora do escopo = ocorrência que não existe", async () => {
      montarOcorrencias();
      const t = tokenLocal(["canais_gestao"]);
      const dentro = await get("ocorrencia", t, { ocorrenciaId: "3" });
      expect(dentro.body.ocorrencia).toMatchObject({ advertenciaObs: "advertiu o irmão João", provaRemocao: "prova interna", removidaPorNome: "Adm Secreto", relatadaPorMembroId: 5 });
      const fora = await get("ocorrencia", t, { ocorrenciaId: "2" });
      const inexistente = await get("ocorrencia", t, { ocorrenciaId: "999" });
      expect(fora.status).toBe(404);
      expect(fora).toEqual(inexistente);
    });
    test("remover/advertir/improcedente: sem relação ou canal de fora do escopo = 404 igual ao de id inexistente, e nada é gravado; dentro, grava", async () => {
      montarOcorrencias();
      quando(/UPDATE CanalOcorrencias SET Status = 'REMOVIDA'/, [], 1);
      const t = tokenLocal(["canais_gestao"]);
      const corpo = (id) => ({ ocorrenciaId: id, provaRemocao: "Mensagem removida do grupo e o membro foi orientado", motivo: "Conteúdo normal, sem irregularidade", observacao: "Membro advertido" });
      for (const acao of ["ocorrencias/remover", "ocorrencias/advertir", "ocorrencias/improcedente"]) {
        const fora = await post(acao, t, corpo(2));
        const inexistente = await post(acao, t, corpo(999));
        expect(fora.status).toBe(404);
        expect(fora).toEqual(inexistente);
      }
      const semRelacao = await post("ocorrencias/remover", tokenPin(), corpo(1));
      expect(semRelacao).toEqual(await post("ocorrencias/remover", tokenPin(), corpo(999)));
      expect(semRelacao.status).toBe(404);
      expect(gravacoes()).toHaveLength(0);
      const dentro = await post("ocorrencias/remover", t, corpo(1));
      expect(dentro.status).toBe(200);
      expect(rodou(/UPDATE CanalOcorrencias SET Status = 'REMOVIDA'/)).toHaveLength(1);
    });
  });

  describe("canais fora do escopo = canal que não existe", () => {
    test("GET canal, desativar, designar, conferências, credenciais: a mesma 404, sem gravar", async () => {
      montarBase();
      const t = tokenLocal(["canais_gestao"]);
      const g = await get("canal", t, { canalId: "2" });
      expect(g.status).toBe(404);
      expect(g).toEqual(await get("canal", t, { canalId: "999" }));
      for (const acao of ["canais/desativar", "canais/reativar", "administradores/designar", "conferencias", "credenciais/registrar", "canais/atualizar"]) {
        const fora = await post(acao, t, { canalId: 2, motivo: "Motivo de teste", membroId: 40 });
        expect(fora.status).toBe(404);
        expect(fora).toEqual(await post(acao, t, { canalId: 999, motivo: "Motivo de teste", membroId: 40 }));
      }
      expect(gravacoes()).toHaveLength(0);
    });
    test("administradores/encerrar e credenciais/resolver: designação/pendência de canal de fora = a resposta de id inexistente", async () => {
      montarBase();
      quando(/SELECT CanalId FROM CanalAdministradores WHERE AdminId = @id/, (i) => (i.id === 1 ? [{ CanalId: 2 }] : []));
      quando(/SELECT CanalId FROM CanalTrocasCredencial WHERE TrocaId = @id/, (i) => (i.id === 1 ? [{ CanalId: 2 }] : []));
      const t = tokenLocal(["canais_gestao"]);
      const a = await post("administradores/encerrar", t, { adminId: 1, motivo: "Saiu da liderança" });
      expect(a.status).toBe(404);
      expect(a).toEqual(await post("administradores/encerrar", t, { adminId: 999, motivo: "Saiu da liderança" }));
      const b = await post("credenciais/resolver", t, { trocaId: 1, observacao: "Senha trocada" });
      expect(b.status).toBe(404);
      expect(b).toEqual(await post("credenciais/resolver", t, { trocaId: 999, observacao: "Senha trocada" }));
      expect(gravacoes()).toHaveLength(0);
    });
    test("desativar canal DENTRO do escopo grava", async () => {
      montarBase();
      quando(/SELECT COUNT\(\*\) AS n FROM CanalOcorrencias WHERE CanalId = @id AND Status = 'ABERTA'/, [{ n: 0 }]);
      const r = await post("canais/desativar", tokenLocal(["canais_gestao"]), { canalId: 1, motivo: "Canal encerrado pela congregação" });
      expect(r.status).toBe(200);
      expect(rodou(/UPDATE CanaisOficiaisComunicacao SET Ativo = 0/)).toHaveLength(1);
    });
    test("transmissão: congregação de fora = congregação inexistente (404 igual), sem gravar; dentro grava", async () => {
      montarBase();
      const t = tokenLocal(["canais_gestao"]);
      const fora = await post("transmissao", t, { congregacaoId: 2, transmite: false });
      expect(fora.status).toBe(404);
      expect(fora).toEqual(await post("transmissao", t, { congregacaoId: 999, transmite: false }));
      expect(gravacoes()).toHaveLength(0);
      const dentro = await post("transmissao", t, { congregacaoId: 1, transmite: false });
      expect(dentro.status).toBe(200);
      expect(rodou(/MERGE CongregacaoTransmissao/)).toHaveLength(1);
    });
    test("lista de canais da gestão local traz só os do escopo", async () => {
      montarBase();
      const r = await get("canais", tokenLocal(["canais_gestao"]));
      expect(r.body.canais.map(c => c.canalId)).toEqual([1]);
      expect((await get("canais", tokenGeral(["canais_gestao"]))).body.canais.map(c => c.canalId)).toEqual([1, 2]);
    });
  });

  describe("sincronismo da liderança: só o nível GERAL", () => {
    const PADRAO_SINCRONISMO = /CanalLiderancaSnapshot|FROM Lideranca l JOIN Papeis p/;
    test("POST sincronizar: gestão local, GLOBAL com lista e local com escopo TODAS levam 403 sem tocar na liderança; o geral roda", async () => {
      montarBase();
      for (const t of [tokenLocal(["canais_gestao"]), tokenGlobalComLista(["canais_gestao"]), tokenLocalComTodas(["canais_gestao"])]) {
        mockConsultas = [];
        const r = await post("sincronizar", t);
        expect(r.status).toBe(403);
        expect(rodou(PADRAO_SINCRONISMO)).toHaveLength(0);
        expect(gravacoes()).toHaveLength(0);
      }
      mockConsultas = [];
      const geral = await post("sincronizar", tokenGeral(["canais_gestao"]));
      expect(geral.status).toBe(200);
      expect(rodou(PADRAO_SINCRONISMO).length).toBeGreaterThan(0);
    });
    test("GET trocas e cobertura: o sincronismo (que escreve) só roda para o geral; a leitura continua para a gestão local", async () => {
      montarBase();
      for (const acao of ["trocas", "cobertura"]) {
        mockConsultas = [];
        const local = await get(acao, tokenLocal(["canais_gestao"]));
        expect(local.status).toBe(200);
        expect(rodou(PADRAO_SINCRONISMO)).toHaveLength(0);
        mockConsultas = [];
        const geral = await get(acao, tokenGeral(["canais_gestao"]));
        expect(geral.status).toBe(200);
        expect(rodou(PADRAO_SINCRONISMO).length).toBeGreaterThan(0);
      }
    });
  });

  test("cobertura: os contadores do resumo somam só os canais do escopo (antes eram os totais da igreja inteira)", async () => {
    montarBase();
    quando(/FROM CanalOcorrencias WHERE Status = 'ABERTA' GROUP BY CanalId/, [{ CanalId: 1, abertas: 2, vencidas: 1 }, { CanalId: 2, abertas: 5, vencidas: 5 }]);
    quando(/FROM CanalTrocasCredencial WHERE ResolvidaEm IS NULL GROUP BY CanalId/, [{ CanalId: 1, abertas: 1, vencidas: 0 }, { CanalId: 2, abertas: 3, vencidas: 2 }]);
    const local = await get("cobertura", tokenLocal(["canais_gestao"]));
    expect(local.body.resumo).toMatchObject({ ocorrenciasAbertas: 2, ocorrenciasVencidas: 1, trocasPendentes: 1, trocasVencidas: 0, canaisAtivos: 1 });
    const geral = await get("cobertura", tokenGeral(["canais_gestao"]));
    expect(geral.body.resumo).toMatchObject({ ocorrenciasAbertas: 7, ocorrenciasVencidas: 6, trocasPendentes: 4, trocasVencidas: 2, canaisAtivos: 2 });
    // sessão sem lista de congregações não alcança canal nenhum
    const semLista = await get("cobertura", tok({ via: "SENHA", nivel: "CONGREGACAO", permissoes: ["canais_gestao"] }));
    expect(semLista.body.resumo).toMatchObject({ ocorrenciasAbertas: 0, trocasPendentes: 0, canaisAtivos: 0 });
  });

  test("camada de banco: mapearOcorrencia com verInterno:false e listarParaContato sem identificador por padrão", () => {
    const linha = ocorrencia(3, { Status: "REMOVIDA", RemovidaEm: "2026-10-01T12:00:00.000Z", RemovidaPorNome: "Adm", ProvaRemocao: "p", LinkProva: "https://x", AdvertenciaObs: "a", MotivoImprocedente: "m" });
    const sem = canaisDb.mapearOcorrencia(linha, Date.UTC(2026, 9, 5), { verAutor: false, verInterno: false });
    for (const campo of INTERNOS) expect(sem).not.toHaveProperty(campo);
    expect(sem).toMatchObject({ status: "REMOVIDA", fase: "REMOVIDA_NO_PRAZO" });
    const com = canaisDb.mapearOcorrencia(linha, Date.UTC(2026, 9, 5), { verAutor: false });
    expect(com).toMatchObject({ provaRemocao: "p", advertenciaObs: "a", removidaPorNome: "Adm", linkProva: "https://x", motivoImprocedente: "m" });
  });
});

// =====================================================================================================================================================
describe("GestaoTermos", () => {
  const PADRAO_ASSINADOS = /SELECT TipoTermo, VersaoTermo FROM TermosAssinados/;
  afterEach(() => jest.restoreAllMocks());

  test("sem sessão: 401; o catálogo abre para qualquer login", async () => {
    expect((await chamar(hTermos)).status).toBe(401);
    const r = await chamar(hTermos, { token: tokenPin() });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.termos)).toContain("CONFIDENCIALIDADE");
  });
  test("tipo que existe em qualquer objeto ('constructor', '__proto__', 'toString') ou que não é texto: 400, sem 500 e sem gravar", async () => {
    for (const tipo of ["constructor", "__proto__", "toString", "hasOwnProperty", 1, "", "INEXISTENTE"]) {
      const r = await chamar(hTermos, { metodo: "POST", token: tokenPin(), ligado: { tipo } });
      expect(r.status).toBe(400);
    }
    expect(gravacoes()).toHaveLength(0);
  });
  test("assinar devolve token novo que MANTÉM a validade do original (não renova 12 h) e leva a lista de pendências atualizada", async () => {
    quando(PADRAO_ASSINADOS, [{ TipoTermo: "CONFIDENCIALIDADE", VersaoTermo: "2026-1" }]);
    const t0 = Date.UTC(2026, 9, 2, 8, 0, 0);
    const relogio = jest.spyOn(Date, "now").mockReturnValue(t0);
    const original = tok({ via: "PIN", nivel: null, permissoes: [], escopoCongregacoes: [], termosPendentes: ["CONFIDENCIALIDADE"] });
    const expDe = (token) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")).exp;
    expect(expDe(original)).toBe(t0 + 12 * 3600 * 1000);
    relogio.mockReturnValue(t0 + 6 * 3600 * 1000);
    const r = await chamar(hTermos, { metodo: "POST", token: original, ligado: { tipo: "CONFIDENCIALIDADE" } });
    expect(r.status).toBe(200);
    expect(expDe(r.body.token)).toBe(expDe(original));
    expect(auth.getSessao(r.body.token)).toMatchObject({ membroId: 5, via: "PIN", termosPendentes: [] });
    expect(rodou(/INSERT INTO TermosAssinados/)).toHaveLength(1);
  });
  test("repetir a assinatura (versão já assinada) também não renova a sessão", async () => {
    quando(/SELECT 1 FROM TermosAssinados WHERE MembroId/, [{ x: 1 }]);
    quando(PADRAO_ASSINADOS, [{ TipoTermo: "CONFIDENCIALIDADE", VersaoTermo: "2026-1" }]);
    const t0 = Date.UTC(2026, 9, 2, 8, 0, 0);
    const relogio = jest.spyOn(Date, "now").mockReturnValue(t0);
    const original = tok({ via: "PIN", nivel: null, permissoes: [], escopoCongregacoes: [] });
    const expDe = (token) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")).exp;
    relogio.mockReturnValue(t0 + 11 * 3600 * 1000);
    const r = await chamar(hTermos, { metodo: "POST", token: original, ligado: { tipo: "CONFIDENCIALIDADE" } });
    expect(expDe(r.body.token)).toBe(t0 + 12 * 3600 * 1000);
    expect(gravacoes()).toHaveLength(0);
  });
});

// =====================================================================================================================================================
describe("VerificarTermoAssinado", () => {
  const PADRAO_TERMO = /FROM TermosAssinados t JOIN MembroReferencia m/;
  const termo = (id, membroId) => ({ TermoAssinadoId: id, MembroId: membroId, membroNome: "Alguém", TipoTermo: "CONFIDENCIALIDADE", VersaoTermo: "2026-1", HashConteudo: "x", dataAssinatura: "2026-09-01T10:00:00" });
  beforeEach(() => quando(PADRAO_TERMO, (i) => ({ 10: [termo(10, 5)], 11: [termo(11, 40)] }[i.id] || [])));
  const ver = (token, id) => chamar(hVerificar, { token, ligado: { id } });

  test("sem sessão: 401", async () => expect((await ver(undefined, "10")).status).toBe(401));
  test("o signatário vê a própria assinatura (inclusive por sessão de PIN)", async () => {
    const r = await ver(tokenPin(), "10");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sucesso: true, tipoTermo: "CONFIDENCIALIDADE" });
  });
  test("assinatura alheia, inexistente e id malformado dão a MESMA resposta (404), e id malformado nem consulta o banco", async () => {
    const alheia = await ver(tokenPin(), "11");
    expect(alheia.status).toBe(404);
    expect(await ver(tokenPin(), "999")).toEqual(alheia);
    mockConsultas = [];
    for (const ruim of ["abc", "1e1", "0x0B", "011", "-11", undefined, "11 "]) expect(await ver(tokenPin(), ruim)).toEqual(alheia);
    expect(rodou(PADRAO_TERMO)).toHaveLength(0);
  });
  test("quem audita precisa ser GERAL: papel GLOBAL com lista, papel local com TODAS e geral sem auditoria/protecaodedados recebem o 404; o geral auditor vê", async () => {
    const alheia = await ver(tokenPin(), "11");
    for (const t of [tokenLocal(["auditoria"]), tokenGlobalComLista(["auditoria"]), tokenLocalComTodas(["auditoria"]), tokenGeral(["financeiro", "pessoas"]), tokenGeral([])]) {
      expect(await ver(t, "11")).toEqual(alheia);
    }
    for (const permissao of ["auditoria", "protecaodedados"]) {
      const r = await ver(tokenGeral([permissao]), "11");
      expect(r.status).toBe(200);
      expect(r.body.membroNome).toBe("Alguém");
    }
  });
  test("erro de banco: 500 genérico, sem vazar a mensagem do driver", async () => {
    mockRegras = [[PADRAO_TERMO, () => { throw new Error("segredo do driver"); }]];
    const r = await ver(tokenPin(), "10");
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/segredo do driver/);
  });
});

// =====================================================================================================================================================
describe("GestaoSessoes", () => {
  const GUID_PROPRIO = "11111111-1111-4111-8111-111111111111";
  const GUID_ALHEIO = "22222222-2222-4222-8222-222222222222";
  beforeEach(() => quando(/SELECT MembroId FROM SessoesAtivas WHERE SessaoId = @id/, (i) => (i.id === GUID_PROPRIO ? [{ MembroId: 5 }] : i.id === GUID_ALHEIO ? [{ MembroId: 40 }] : [])));
  const encerrar = (token, id) => chamar(hSessoes, { metodo: "PUT", token, ligado: { id }, corpo: { acao: "ENCERRAR" } });

  test("sem sessão: 401; a lista é só das sessões do próprio membro", async () => {
    expect((await chamar(hSessoes)).status).toBe(401);
    quando(/FROM SessoesAtivas WHERE MembroId = @membroId/, [{ sessaoId: GUID_PROPRIO }]);
    const r = await chamar(hSessoes, { token: tokenPin() });
    expect(r.status).toBe(200);
    expect(rodou(/FROM SessoesAtivas WHERE MembroId = @membroId/)[0].inputs.membroId).toBe(5);
  });
  test("encerrar a própria sessão grava; a de outra pessoa, a inexistente e o id que não é GUID dão a MESMA resposta (404) sem gravar nem consultar o banco por GUID inválido", async () => {
    const ok = await encerrar(tokenPin(), GUID_PROPRIO);
    expect(ok.status).toBe(200);
    expect(rodou(/UPDATE SessoesAtivas SET Encerrada = 1/)).toHaveLength(1);
    mockConsultas = [];
    const alheia = await encerrar(tokenPin(), GUID_ALHEIO);
    expect(alheia.status).toBe(404);
    expect(await encerrar(tokenPin(), "33333333-3333-4333-8333-333333333333")).toEqual(alheia);
    const antes = mockConsultas.length;
    for (const ruim of ["abc", "1", 7, "11111111-1111-4111-8111-11111111111", "11111111-1111-4111-8111-1111111111111", "' OR 1=1 --"]) expect(await encerrar(tokenPin(), ruim)).toEqual(alheia);
    expect(mockConsultas.length).toBe(antes);
    expect(rodou(/UPDATE SessoesAtivas/)).toHaveLength(0);
  });
  test("erro de banco: 500 genérico", async () => {
    mockRegras = [[/FROM SessoesAtivas/, () => { throw new Error("detalhe interno"); }]];
    const r = await chamar(hSessoes, { token: tokenPin() });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/detalhe interno/);
  });
});

// =====================================================================================================================================================
describe("Certificados (PDF, QR, lista, emitir, revogar)", () => {
  const PADRAO_CERT_ID = /FROM CertificadosEmitidos c[\s\S]*WHERE c\.CertificadoId = @id/;
  const cert = (id, membroId) => ({ CertificadoId: id, MembroId: membroId, Nome: "Titular", Titulo: "Curso", Descricao: null, ConquistaId: null, ConquistaNome: null, EmitidoPorMembroId: 1, Protocolo: "CERT-1", DataEmissao: new Date("2026-09-01T12:00:00Z"), CodigoVerificacao: "ABCDEFGHJKLMNPQR", ValidoAte: null, TrilhaMatriculaId: null, RevogadoEm: null, MotivoRevogacao: null, HashIntegridade: null });
  // 1 = do próprio (5); 2 = de Maria (40, Central); 3 = de Joana (41, Vila Nova)
  const CERTS = { 1: cert(1, 5), 2: cert(2, 40), 3: cert(3, 41) };
  beforeEach(() => quando(PADRAO_CERT_ID, (i) => (CERTS[i.id] ? [CERTS[i.id]] : [])));
  const baixar = (handler, token, id) => chamar(handler, { token, ligado: { id } });

  describe.each([["CertificadoPdf", hCertPdf, "application/pdf"], ["CertificadoQr", hCertQr, "image/svg+xml"]])("%s", (_nome, handler, tipo) => {
    const tipoDe = (r) => (r.headers || {})["Content-Type"];
    test("sem sessão: 401", async () => expect((await baixar(handler, undefined, "1")).status).toBe(401));
    test("o titular baixa o próprio (inclusive por PIN)", async () => {
      const r = await baixar(handler, tokenPin(), "1");
      expect(r.status).toBe(200);
      expect(tipoDe(r)).toBe(tipo);
    });
    test("certificado de outra pessoa, inexistente e id malformado: a MESMA 404 (sem IDOR); id malformado nem consulta o banco", async () => {
      const alheio = await baixar(handler, tokenPin(), "2");
      expect(alheio.status).toBe(404);
      expect(await baixar(handler, tokenPin(), "999")).toEqual(alheio);
      mockConsultas = [];
      for (const ruim of ["abc", "1e0", "0x1", "01", "-1", "Infinity", "1e10", undefined]) expect(await baixar(handler, tokenPin(), ruim)).toEqual(alheio);
      expect(mockConsultas).toHaveLength(0);
    });
    test("gestão local (ebd_gestao): titular do escopo sim; da Vila Nova = a 404 de inexistente; geral baixa qualquer um", async () => {
      const t = tokenLocal(["ebd_gestao"]);
      expect((await baixar(handler, t, "2")).status).toBe(200);
      const fora = await baixar(handler, t, "3");
      expect(fora.status).toBe(404);
      expect(fora).toEqual(await baixar(handler, t, "999"));
      expect((await baixar(handler, tokenGeral(["trilhas_gestao"]), "3")).status).toBe(200);
    });
    test("permissão que não é de gestão de certificado não abre o de outra pessoa", async () => {
      expect((await baixar(handler, tokenLocal(["pessoas", "reunioes"]), "2")).status).toBe(404);
    });
    test("erro de banco: 500 genérico", async () => {
      mockRegras = [[PADRAO_CERT_ID, () => { throw new Error("detalhe interno"); }]];
      const r = await baixar(handler, tokenPin(), "1");
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.body)).not.toMatch(/detalhe interno/);
    });
  });

  describe("GestaoCertificados", () => {
    const lista = (token, query) => chamar(hCertificados, { token, query });
    const emitir = (token, corpo) => chamar(hCertificados, { metodo: "POST", token, ligado: { acao: "emitir" }, corpo });
    const revogar = (token, corpo) => chamar(hCertificados, { metodo: "POST", token, ligado: { acao: "revogar" }, corpo });
    beforeEach(() => {
      quando(/FROM CertificadosEmitidos c[\s\S]*WHERE c\.MembroId = @membroId/, []);
      quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, (i) => (PESSOAS[i.id] ? [{ MembroId: i.id }] : []));
      quando(/INSERT INTO CertificadosEmitidos/, [{ CertificadoId: 99 }]);
    });

    test("sem sessão: 401", async () => expect((await lista(undefined)).status).toBe(401));
    test("lista: o próprio abre; de outra pessoa sem permissão, de fora do escopo, inexistente e malformada: recusa, e a de gestão é a mesma nos três últimos casos", async () => {
      expect((await lista(tokenPin())).status).toBe(200);
      expect((await lista(tokenPin(), { membroId: "5" })).status).toBe(200);
      expect((await lista(tokenPin(), { membroId: "40" })).status).toBe(403);
      const t = tokenLocal(["ebd_gestao"]);
      const fora = await lista(t, { membroId: "41" });
      expect(fora.status).toBe(403);
      expect(await lista(t, { membroId: "999" })).toEqual(fora);
      expect(await lista(t, { membroId: "0x29" })).toEqual(fora);
      expect((await lista(t, { membroId: "40" })).status).toBe(200);
      expect((await lista(tokenGeral(["trilhas_gestao"]), { membroId: "41" })).status).toBe(200);
    });
    test("emitir: PIN recusado antes do banco; gestão local fora do escopo, inexistente e malformado = a mesma recusa e nada gravado; dentro do escopo grava", async () => {
      const corpo = (membroId) => ({ membroId, titulo: "Curso de Liderança" });
      const pin = await emitir(tokenPin(), corpo(40));
      expect(pin.status).toBe(403);
      expect(mockConsultas).toHaveLength(0);
      const t = tokenLocal(["ebd_gestao"]);
      const fora = await emitir(t, corpo(41));
      expect(fora.status).toBe(403);
      expect(await emitir(t, corpo(999))).toEqual(fora);
      expect(await emitir(t, corpo("0x28"))).toEqual(fora);
      expect(gravacoes()).toHaveLength(0);
      const dentro = await emitir(t, corpo(40));
      expect(dentro.status).toBe(201);
      const insercao = rodou(/INSERT INTO CertificadosEmitidos/);
      expect(insercao).toHaveLength(1);
      expect(insercao[0].inputs.membroId).toBe(40);
      expect((await emitir(tokenGeral(["ebd_gestao"]), corpo(41))).status).toBe(201);
    });
    test("revogar: certificado de titular fora do escopo, inexistente e id malformado = a MESMA 404 e nada gravado; dentro do escopo revoga", async () => {
      const corpo = (certificadoId) => ({ certificadoId, motivo: "Emitido por engano" });
      expect((await revogar(tokenPin(), corpo(2))).status).toBe(403);
      const t = tokenLocal(["ebd_gestao"]);
      const fora = await revogar(t, corpo(3));
      expect(fora.status).toBe(404);
      expect(await revogar(t, corpo(999))).toEqual(fora);
      expect(await revogar(t, corpo("1e0"))).toEqual(fora);
      expect(gravacoes()).toHaveLength(0);
      const dentro = await revogar(t, corpo(2));
      expect(dentro.status).toBe(200);
      expect(rodou(/UPDATE CertificadosEmitidos SET RevogadoEm/)).toHaveLength(1);
    });
  });
});

// =====================================================================================================================================================
describe("GestaoTrilhas", () => {
  const matricula = (id, membroId, extra = {}) => ({ MatriculaId: id, TrilhaId: 1, MembroId: membroId, Status: "EM_ANDAMENTO", IniciadaEm: "2026-09-01", ConcluidaEm: null, ValidoAte: null, ...extra });
  // 1 = do próprio (5); 2 = de Maria (40, Central); 3 = de Joana (41, Vila Nova)
  const MATRICULAS = { 1: matricula(1, 5), 2: matricula(2, 40), 3: matricula(3, 41) };
  beforeEach(() => {
    quando(/SELECT \* FROM TrilhaMatriculas WHERE MatriculaId = @id/, (i) => (MATRICULAS[i.id] ? [MATRICULAS[i.id]] : []));
    quando(/SELECT \* FROM Trilhas WHERE TrilhaId = @t/, [{ TrilhaId: 1, Nome: "Trilha", ValidadeMeses: 12 }]);
  });
  const get = (acao, token, query = {}) => chamar(hTrilhas, { ligado: { acao }, token, query });
  const post = (acao, token, corpo = {}) => chamar(hTrilhas, { metodo: "POST", ligado: { acao }, token, corpo });

  test("sem sessão: 401; a PRÓPRIA formação abre por PIN", async () => {
    expect((await get("catalogo")).status).toBe(401);
    const r = await get("minha-formacao", tokenPin());
    expect(r.status).toBe(200);
    expect(rodou(/FROM TrilhaMatriculas m\s+JOIN Trilhas t/)[0].inputs).toHaveProperty("m0", 5);
  });
  test("catálogo: ?todas=1 só vale com trilhas_gestao (o resto vê só as ativas)", async () => {
    await get("catalogo", tokenPin(), { todas: "1" });
    expect(rodou(/FROM Trilhas/)[0].sql).toMatch(/WHERE Ativa = 1/);
    mockConsultas = [];
    await get("catalogo", tokenLocal(["pessoas"]), { todas: "1" });
    expect(rodou(/FROM Trilhas/)[0].sql).toMatch(/WHERE Ativa = 1/);
    mockConsultas = [];
    await get("catalogo", tokenLocal(["trilhas_gestao"]), { todas: "1" });
    expect(rodou(/FROM Trilhas/)[0].sql).not.toMatch(/WHERE Ativa = 1/);
  });
  test("matrícula: a própria abre; de outra pessoa sem permissão, de fora do escopo, inexistente: a MESMA 404; malformada: 400 sem consulta", async () => {
    expect((await get("matricula", tokenPin(), { matriculaId: "1" })).status).toBe(200);
    const alheia = await get("matricula", tokenPin(), { matriculaId: "2" });
    expect(alheia.status).toBe(404);
    expect(await get("matricula", tokenPin(), { matriculaId: "999" })).toEqual(alheia);
    expect(await get("matricula", tokenLocal(["pessoas"]), { matriculaId: "2" })).toEqual(alheia);     // escopo local sem trilhas_gestao não abre a matrícula de quem está no escopo
    const t = tokenLocal(["trilhas_gestao"]);
    expect((await get("matricula", t, { matriculaId: "2" })).status).toBe(200);
    expect(await get("matricula", t, { matriculaId: "3" })).toEqual(alheia);
    mockConsultas = [];
    const ruim = await get("matricula", t, { matriculaId: "1e0" });
    expect(ruim.status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
  test("formação e avaliação de requisitos de uma pessoa: PIN 403; fora do escopo = inexistente (404 igual); dentro abre", async () => {
    for (const acao of ["formacao", "requisitos/avaliar"]) {
      expect((await get(acao, tokenPin(), { membroId: "40", contexto: "CONSAGRACAO" })).status).toBe(403);
      const t = tokenLocal(["trilhas_gestao"]);
      const fora = await get(acao, t, { membroId: "41", contexto: "CONSAGRACAO" });
      expect(fora.status).toBe(404);
      expect(await get(acao, t, { membroId: "999", contexto: "CONSAGRACAO" })).toEqual(fora);
      expect(await get(acao, t, { membroId: "0x28", contexto: "CONSAGRACAO" }).then(r => r.status)).toBe(400);
    }
    expect((await get("formacao", tokenLocal(["trilhas_gestao"]), { membroId: "40" })).status).toBe(200);
    expect((await get("formacao", tokenGeral(["trilhas_gestao"]), { membroId: "41" })).status).toBe(200);
  });
  test("pendências: PIN 403; o SQL filtra por congregação do escopo e o JS por Extensão da Tenda", async () => {
    expect((await get("pendencias", tokenPin())).status).toBe(403);
    const linhas = [
      { MatriculaId: 1, MembroId: 40, MembroNome: "Maria", CongregacaoNome: CENTRAL, ExtensaoNome: "Tenda Norte", TrilhaId: 1, TrilhaNome: "T", AvisoDias: 60, ConcluidaEm: "2026-01-01", ValidoAte: "2026-11-01", RenovacaoEmAndamento: 0 },
      { MatriculaId: 2, MembroId: 41, MembroNome: "Joana", CongregacaoNome: VILA, ExtensaoNome: null, TrilhaId: 1, TrilhaNome: "T", AvisoDias: 60, ConcluidaEm: "2026-01-01", ValidoAte: "2026-11-01", RenovacaoEmAndamento: 0 },
      { MatriculaId: 3, MembroId: 42, MembroNome: "Rita", CongregacaoNome: CENTRAL, ExtensaoNome: null, TrilhaId: 1, TrilhaNome: "T", AvisoDias: 60, ConcluidaEm: "2026-01-01", ValidoAte: "2026-11-01", RenovacaoEmAndamento: 0 }
    ];
    quando(/FROM TrilhaMatriculas m\s+JOIN Trilhas t ON t\.TrilhaId = m\.TrilhaId\s+JOIN MembroReferencia mem/, linhas);
    const local = await get("pendencias", tokenLocal(["trilhas_gestao"]));
    const consulta = rodou(/JOIN MembroReferencia mem/)[0];
    expect(consulta.sql).toMatch(/cg\.Nome IN \(@n0\)/);
    expect(consulta.inputs.n0).toBe(CENTRAL);
    expect(local.body.pendencias.map(p => p.membroId)).toEqual([40, 42]);      // a Joana (Vila Nova) é cortada pelo filtro do JS mesmo que o SQL a devolva
    const extensao = await get("pendencias", tokenLocal(["trilhas_gestao"], { escopoExtensaoNome: "Tenda Norte" }));
    expect(extensao.body.pendencias.map(p => p.membroId)).toEqual([40]);
    const geral = await get("pendencias", tokenGeral(["trilhas_gestao"]));
    expect(geral.body.pendencias.map(p => p.membroId)).toEqual([40, 41, 42]);
    expect(rodou(/JOIN MembroReferencia mem/).pop().sql).not.toMatch(/cg\.Nome IN/);
  });
  test("catálogo e requisitos valem para a igreja inteira: gestão local, GLOBAL com lista e local com TODAS levam 403 antes de gravar; o geral cria", async () => {
    quando(/INSERT INTO Trilhas/, [{ TrilhaId: 7 }]);
    quando(/SELECT TrilhaId FROM Trilhas WHERE Nome = @nome/, []);
    for (const acao of ["criar", "atualizar", "modulos", "modulos/atualizar", "modulos/pre-requisito", "pre-requisito", "pre-requisito/remover", "requisitos", "requisitos/remover"]) {
      for (const t of [tokenPin(), tokenLocal(["trilhas_gestao"]), tokenGlobalComLista(["trilhas_gestao"]), tokenLocalComTodas(["trilhas_gestao"])]) {
        const r = await post(acao, t, { nome: "Liderança", trilhaId: 1, moduloId: 1, preRequisitoModuloId: 2, preRequisitoTrilhaId: 2, contexto: "CONSAGRACAO", requisitoId: 1 });
        expect(r.status).toBe(403);
      }
    }
    expect(gravacoes()).toHaveLength(0);
    const geral = await post("criar", tokenGeral(["trilhas_gestao"]), { nome: "Liderança" });
    expect(geral.status).toBe(201);
    expect(rodou(/INSERT INTO Trilhas/)).toHaveLength(1);
  });
  test("matricular: PIN 403; pessoa de fora do escopo, inexistente e malformada = a mesma recusa e nada gravado; dentro matricula", async () => {
    quando(/SELECT \* FROM Trilhas WHERE TrilhaId = @id/, [{ TrilhaId: 1, Nome: "Trilha", Ativa: 1 }]);
    quando(/SELECT COUNT\(\*\) AS Total FROM TrilhaModulos/, [{ Total: 1 }]);
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, (i) => (PESSOAS[i.id] ? [{ MembroId: i.id }] : []));
    quando(/INSERT INTO TrilhaMatriculas/, [{ MatriculaId: 50 }]);
    expect((await post("matricular", tokenPin(), { trilhaId: 1, membroId: 40 })).status).toBe(403);
    const t = tokenLocal(["trilhas_gestao"]);
    const fora = await post("matricular", t, { trilhaId: 1, membroId: 41 });
    expect(fora.status).toBe(404);
    expect(await post("matricular", t, { trilhaId: 1, membroId: 999 })).toEqual(fora);
    expect((await post("matricular", t, { trilhaId: 1, membroId: "0x28" })).status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
    const dentro = await post("matricular", t, { trilhaId: 1, membroId: 40 });
    expect(dentro.status).toBe(201);
    expect(rodou(/INSERT INTO TrilhaMatriculas/)[0].inputs.m).toBe(40);
  });
  test("cancelar/concluir/emitir certificado: matrícula de pessoa de fora do escopo = matrícula inexistente (404 igual), nada gravado; dentro cancela", async () => {
    for (const acao of ["modulos/concluir", "matricula/cancelar", "matricula/emitir-certificado"]) {
      expect((await post(acao, tokenPin(), { matriculaId: 2, moduloId: 1, motivo: "Desistiu do curso" })).status).toBe(403);
      const t = tokenLocal(["trilhas_gestao"]);
      const fora = await post(acao, t, { matriculaId: 3, moduloId: 1, motivo: "Desistiu do curso" });
      expect(fora.status).toBe(404);
      expect(await post(acao, t, { matriculaId: 999, moduloId: 1, motivo: "Desistiu do curso" })).toEqual(fora);
      expect((await post(acao, t, { matriculaId: "1e0", moduloId: 1, motivo: "Desistiu do curso" })).status).toBe(400);
    }
    expect(gravacoes()).toHaveLength(0);
    const dentro = await post("matricula/cancelar", tokenLocal(["trilhas_gestao"]), { matriculaId: 2, motivo: "Desistiu do curso" });
    expect(dentro.status).toBe(200);
    expect(rodou(/UPDATE TrilhaMatriculas SET Status = 'CANCELADA'/)).toHaveLength(1);
  });
});

// =====================================================================================================================================================
describe("GestaoPsc", () => {
  const avaliacao = (id, congregacao, extra = {}) => ({ AvaliacaoId: id, CongregacaoId: congregacao === CENTRAL ? 1 : 2, CongregacaoNome: congregacao, Categoria: "CONGREGACAO", Ano: 2026, Status: "ENVIADA", EnviadaPorMembroId: 77, Versao: 1, ...extra });
  const AVALIACOES = { 1: avaliacao(1, CENTRAL), 2: avaliacao(2, VILA) };
  beforeEach(() => {
    quando(/FROM PscParametros/, [{ PrimeiroExercicio: 2026, PrazoEnvioDias: 90, ExerciciosParaReclassificacao: 2 }]);
    quando(/FROM PscAvaliacoes a\s+JOIN Congregacoes c ON c\.CongregacaoId = a\.CongregacaoId[\s\S]*WHERE a\.AvaliacaoId = @id/, (i) => (AVALIACOES[i.id] ? [AVALIACOES[i.id]] : []));
    quando(/SELECT CongregacaoId, Nome, Ativa, Categoria, TutelaCongregacaoMaeId, PercentualRetencaoLocal FROM Congregacoes WHERE CongregacaoId = @id/,
      (i) => ({ 1: [{ CongregacaoId: 1, Nome: CENTRAL, Ativa: 1, Categoria: "CONGREGACAO" }], 2: [{ CongregacaoId: 2, Nome: VILA, Ativa: 1, Categoria: "CONGREGACAO" }] }[i.id] || []));
    quando(/UPDATE PscAvaliacoes SET Status = @para/, [], 1);
  });
  const get = (acao, token, query = {}) => chamar(hPsc, { ligado: { acao }, token, query });
  const post = (acao, token, corpo = {}) => chamar(hPsc, { metodo: "POST", ligado: { acao }, token, corpo });

  test("sem sessão: 401; a sessão de PIN não lê nem grava nada do PSC", async () => {
    expect((await get("painel")).status).toBe(401);
    for (const acao of ["painel", "avaliacoes", "avaliacao", "historico", "reclassificacoes", "catalogo", "parametros"]) expect((await get(acao, tokenPin())).status).toBe(403);
    for (const acao of ["avaliacoes/abrir", "avaliacoes/responder", "avaliacoes/enviar", "avaliacoes/validar", "avaliacoes/devolver", "avaliacoes/homologar", "parametros", "reclassificacoes/decretar"]) {
      expect((await post(acao, tokenPin(), { avaliacaoId: 1, congregacaoId: 1, reclassificacaoId: 1 })).status).toBe(403);
    }
    expect(gravacoes()).toHaveLength(0);
  });
  test("avaliação e histórico de congregação de fora do escopo = a mesma 404 de id que não existe; dentro abre", async () => {
    const t = tokenLocal(["psc_gestao"]);
    const fora = await get("avaliacao", t, { avaliacaoId: "2" });
    expect(fora.status).toBe(404);
    expect(await get("avaliacao", t, { avaliacaoId: "999" })).toEqual(fora);
    expect((await get("avaliacao", t, { avaliacaoId: "1e0" })).status).toBe(400);
    expect((await get("avaliacao", t, { avaliacaoId: "1" })).status).toBe(200);
    const hist = await get("historico", t, { congregacaoId: "2" });
    expect(hist.status).toBe(404);
    expect(await get("historico", t, { congregacaoId: "999" })).toEqual(hist);
    expect((await get("historico", t, { congregacaoId: "1" })).status).toBe(200);
    expect((await get("historico", tokenGeral(["psc_gestao"]), { congregacaoId: "2" })).status).toBe(200);
  });
  test("listas: o SQL filtra por congregação do escopo; o painel mostra só as congregações do escopo", async () => {
    quando(/FROM Congregacoes c LEFT JOIN Areas a ON a\.AreaId = c\.AreaId/, [{ CongregacaoId: 1, Nome: CENTRAL, Categoria: "CONGREGACAO", AreaId: 10, AreaNome: "Área 1" }, { CongregacaoId: 2, Nome: VILA, Categoria: "CONGREGACAO", AreaId: 10, AreaNome: "Área 1" }]);
    const painel = await get("painel", tokenLocal(["psc_gestao"]), { ano: "2026" });
    expect(painel.body.congregacoes.map(c => c.congregacaoNome)).toEqual([CENTRAL]);
    expect((await get("painel", tokenGeral(["psc_homologacao"]), { ano: "2026" })).body.congregacoes).toHaveLength(2);
    await get("avaliacoes", tokenLocal(["psc_gestao"]), { ano: "2026" });
    const consulta = rodou(/FROM PscAvaliacoes a\s+JOIN Congregacoes c[\s\S]*ORDER BY a\.Ano DESC/)[0];
    expect(consulta.sql).toMatch(/c\.Nome IN \(@escopo0\)/);
    expect(consulta.inputs.escopo0).toBe(CENTRAL);
    expect((await get("avaliacoes", tokenLocal(["psc_gestao"]), { congregacaoId: "0x1" })).status).toBe(400);
  });
  test("abrir avaliação: congregação de fora = congregação inexistente (404 igual), nada gravado", async () => {
    const t = tokenLocal(["psc_gestao"]);
    const fora = await post("avaliacoes/abrir", t, { congregacaoId: 2, ano: 2026 });
    expect(fora.status).toBe(404);
    expect(await post("avaliacoes/abrir", t, { congregacaoId: 999, ano: 2026 })).toEqual(fora);
    expect(gravacoes()).toHaveLength(0);
  });
  test("devolver: a permissão vem ANTES de carregar a avaliação (PIN recebe o mesmo 403 para id existente e inexistente, sem consultar); de fora do escopo = 404 igual; dentro grava", async () => {
    const pin1 = await post("avaliacoes/devolver", tokenPin(), { avaliacaoId: 1, motivo: "Faltam evidências" });
    const pin2 = await post("avaliacoes/devolver", tokenPin(), { avaliacaoId: 999, motivo: "Faltam evidências" });
    expect(pin1.status).toBe(403);
    expect(pin2).toEqual(pin1);
    expect(mockConsultas).toHaveLength(0);
    const t = tokenLocal(["psc_gestao"]);
    const fora = await post("avaliacoes/devolver", t, { avaliacaoId: 2, motivo: "Faltam evidências" });
    expect(fora.status).toBe(404);
    expect(await post("avaliacoes/devolver", t, { avaliacaoId: 999, motivo: "Faltam evidências" })).toEqual(fora);
    expect(gravacoes()).toHaveLength(0);
    const dentro = await post("avaliacoes/devolver", t, { avaliacaoId: 1, motivo: "Faltam evidências nas alíneas" });
    expect(dentro.status).toBe(200);
    expect(rodou(/UPDATE PscAvaliacoes SET Status = @para/)).toHaveLength(1);
  });
  test("decisões da CLI (homologar, parâmetros, catálogo, reclassificação): só o GERAL; a permissão sozinha, o papel GLOBAL com lista e o local com TODAS levam 403 antes do banco", async () => {
    for (const acao of ["avaliacoes/homologar", "avaliacoes/reabrir", "parametros", "catalogo/criterio", "catalogo/criterio/atualizar", "reclassificacoes/decretar", "reclassificacoes/arquivar", "reclassificacoes/restabelecer"]) {
      for (const t of [tokenLocal(["psc_homologacao"]), tokenGlobalComLista(["psc_homologacao"]), tokenLocalComTodas(["psc_homologacao"]), tokenGeral(["psc_gestao"])]) {
        mockConsultas = [];
        const r = await post(acao, t, { avaliacaoId: 1, reclassificacaoId: 1, criterioId: 1, resolucao: "Resolução 1/2026" });
        expect(r.status).toBe(403);
        expect(mockConsultas).toHaveLength(0);
      }
    }
    const geral = await post("avaliacoes/homologar", tokenGeral(["psc_homologacao"]), { avaliacaoId: 1, resolucao: "Resolução 1/2026" });
    expect(geral.status).not.toBe(403);
    expect(rodou(/FROM PscAvaliacoes a\s+JOIN Congregacoes c/).length).toBeGreaterThan(0);
  });
});

// =====================================================================================================================================================
describe("MeusOrgaosLocais", () => {
  beforeEach(() => {
    quando(/FROM OrgaosLocais WHERE Ativo = 1/, [{ orgaoLocalId: 1, sigla: "JAI", nome: "JAI Central", nivel: 1, referenciaId: 1 }, { orgaoLocalId: 2, sigla: "JAI", nome: "JAI Vila", nivel: 1, referenciaId: 2 }]);
    quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, (i) => [{ Nome: i.id === 1 ? CENTRAL : VILA }]);
  });
  test("sem sessão: 401; sessão de PIN, sem permissão ou sem congregações: lista vazia SEM consultar o banco", async () => {
    expect((await chamar(hOrgaos)).status).toBe(401);
    for (const t of [tokenPin(), tokenLocal([]), tokenLocal(["reunioes"], { escopoCongregacoes: [] }), tok({ via: "SENHA", nivel: "CONGREGACAO", permissoes: ["reunioes"] })]) {
      const r = await chamar(hOrgaos, { token: t });
      expect(r.status).toBe(200);
      expect(r.body).toEqual([]);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("escopo local vê só os órgãos do escopo; o geral vê todos", async () => {
    expect((await chamar(hOrgaos, { token: tokenLocal(["reunioes"]) })).body.map(o => o.orgaoLocalId)).toEqual([1]);
    expect((await chamar(hOrgaos, { token: tokenGeral(["reunioes"]) })).body.map(o => o.orgaoLocalId)).toEqual([1, 2]);
  });
});

// =====================================================================================================================================================
describe("PainelInicial", () => {
  test("sem sessão: 401; sessão de PIN: só as notificações próprias, sem varrer os fluxos nem as regras", async () => {
    expect((await chamar(hPainel)).status).toBe(401);
    quando(/FROM Notificacoes WHERE DestinatarioMembroId/, [{ total: 3 }]);
    const r = await chamar(hPainel, { token: tokenPin() });
    expect(r.status).toBe(200);
    expect(r.body.map(b => b.chave)).toEqual(["notificacoes", "tarefas_atrasadas"]);
    expect(r.body[0].valor).toBe(3);
    expect(r.body[1].valor).toBe(0);
    expect(mockConsultas).toHaveLength(1);
    expect(rodou(/FluxoInstancias|NotificacaoRegras/)).toHaveLength(0);
  });
  test("quem tem permissão continua vendo as tarefas e os blocos da própria regra", async () => {
    quando(/FROM Notificacoes WHERE DestinatarioMembroId/, [{ total: 0 }]);
    await chamar(hPainel, { token: tokenLocal(["pessoas"]) });
    expect(rodou(/FROM FluxoInstancias/)).toHaveLength(1);
    expect(rodou(/FROM NotificacaoRegras/)).toHaveLength(1);
  });
});

// =====================================================================================================================================================
describe("Notificacoes", () => {
  beforeEach(() => quando(/SELECT DestinatarioMembroId FROM Notificacoes WHERE NotificacaoId = @id/, (i) => ({ 1: [{ DestinatarioMembroId: 5 }], 2: [{ DestinatarioMembroId: 40 }] }[i.id] || [])));
  const put = (recurso, corpo, token = tokenPin()) => chamar(hNotificacoes, { metodo: "PUT", token, ligado: { recurso }, corpo });

  test("sem sessão: 401; a lista e a contagem são só do próprio membro", async () => {
    expect((await chamar(hNotificacoes)).status).toBe(401);
    quando(/COUNT\(\*\) AS naoLidas/, [{ naoLidas: 0 }]);
    await chamar(hNotificacoes, { token: tokenGeral(["pessoas"]) });
    await chamar(hNotificacoes, { token: tokenPin(), ligado: { recurso: "contagem" } });
    expect(mockConsultas.every(c => c.inputs.membroId === 5)).toBe(true);
  });
  test("ler/arquivar a própria notificação grava; a de outra pessoa, a inexistente e o id fora da forma canônica dão a mesma recusa, sem gravar", async () => {
    expect((await put("1", { acao: "LER" })).status).toBe(200);
    expect(rodou(/UPDATE Notificacoes SET Lida = 1/)).toHaveLength(1);
    mockConsultas = [];
    const alheia = await put("2", { acao: "LER" });
    expect(alheia.status).toBe(404);
    expect(await put("999", { acao: "LER" })).toEqual(alheia);
    for (const ruim of ["001", "1e3", "0x2", "99999999999", "-1"]) expect((await put(ruim, { acao: "LER" })).status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
    expect((await put(1, { acao: "ARQUIVAR" })).status).toBe(200);     // o Azure entrega o segmento numérico como número
  });
  test("preferências: a categoria precisa existir no catálogo de regras de notificação; texto livre, número e vazio são recusados sem gravar", async () => {
    quando(/SELECT TOP 1 1 AS ok FROM NotificacaoRegras WHERE Categoria = @categoria/, (i) => (i.categoria === "FINANCEIRO" ? [{ ok: 1 }] : []));
    for (const categoria of ["QUALQUER_COISA", "", 7, ["FINANCEIRO"], null]) {
      const r = await put("preferencias", { categoria, emailAtivo: false });
      expect(r.status).toBe(400);
    }
    expect(gravacoes()).toHaveLength(0);
    const ok = await put("preferencias", { categoria: "FINANCEIRO", emailAtivo: false });
    expect(ok.status).toBe(200);
    expect(rodou(/MERGE NotificacaoPreferencias/)).toHaveLength(1);
    expect((await put("preferencias", { categoria: "FINANCEIRO", emailAtivo: "nao" })).status).toBe(400);
  });
});
