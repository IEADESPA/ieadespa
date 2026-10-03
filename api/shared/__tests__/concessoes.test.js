// v7.6 — ESCOPO POR PERMISSÃO (concessões). Antes o login fundia permissões, nível e escopo do cargo próprio e de cada delegação num conjunto só: uma delegação de
// "financeiro" com escopo da igreja inteira fazia o "pessoas" do cargo próprio (uma congregação) alcançar a igreja inteira. Agora o token carrega uma concessão por
// cargo/delegação, e exigirPermissao("x") devolve a VISÃO só com as concessões que têm "x" e não venceram. Também aqui: o nome da congregação sem homônima
// (GestaoCatalogos) e a derrubada geral das sessões quando muda o que o token carrega.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [1] };
    return { recordset: [], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../notificacaoEmail", () => ({ enviarEmailNotificacao: jest.fn(async () => {}) }));

const auth = require("../auth");
const escopoRotas = require("../escopoRotas");
const { hojeBrasilia } = require("../dataBrasilia");
const hLogin = require("../../LoginSecretaria/index.js");
const hPinGestao = require("../../GestaoPinMembro/index.js");
const hCatalogos = require("../../GestaoCatalogos/index.js");
const hBusca = require("../../BuscaGlobal/index.js");

const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
const rodou = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));
const SID = "cccccccc-0000-0000-0000-000000000001";
const dia = (deslocamento) => new Date(Date.parse(hojeBrasilia() + "T12:00:00Z") + deslocamento * 86400000).toISOString().slice(0, 10);
const concessao = (extra) => ({ origem: "PROPRIA", permissoes: [], nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], escopoExtensaoNome: null, departamentoId: null, ...extra });
const tokenConcessoes = (concessoes, extra = {}) => auth.reassinarSessao({ membroId: 5, nome: "Fulano", tipo: "Dirigente", termosPendentes: [], via: "SENHA", sid: SID, concessoes, ...extra });
const req = (token) => ({ headers: { "x-auth-token": token } });
async function chamar(handler, { metodo = "POST", corpo = {}, token, ligado = {}, query = {} } = {}) {
  const context = { bindingData: ligado, log: Object.assign(() => {}, { error() {}, info() {}, warn() {}, verbose() {} }) };
  await handler(context, { method: metodo, query, body: corpo, headers: { "x-forwarded-for": "177.9.9.9:1, 40.70.146.136:2", ...(token ? { "x-auth-token": token } : {}) } });
  return context.res;
}
// Dirigente da Central (pessoas) + delegação do Tesoureiro Geral (financeiro, igreja inteira).
const DIRIGENTE_COM_DELEGACAO = () => [
  concessao({ permissoes: ["pessoas", "reunioes"] }),
  concessao({ origem: "DELEGACAO", delegacaoId: 9, ate: dia(+5), permissoes: ["financeiro"], nivel: "GLOBAL", escopoCongregacoes: "TODAS" })
];

beforeEach(() => { mockRegras = []; mockConsultas = []; auth._reiniciarRevogacoes(); });

// =====================================================================================================================================================
describe("a visão por permissão", () => {
  test("a delegação de 'financeiro' (igreja inteira) NÃO amplia o escopo de 'pessoas' do cargo próprio", () => {
    const tk = tokenConcessoes(DIRIGENTE_COM_DELEGACAO());
    const pessoas = auth.exigirPermissao(req(tk), {}, "pessoas");
    expect(pessoas).toMatchObject({ membroId: 5, sid: SID, nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], permissoes: ["pessoas", "reunioes"] });
    expect(auth.estaNoEscopo(pessoas, "Vila Nova")).toBe(false);
    expect(escopoRotas.ehGeral(pessoas)).toBe(false);
    const financeiro = auth.exigirPermissao(req(tk), {}, "financeiro");
    expect(financeiro).toMatchObject({ nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["financeiro"] });
    expect(escopoRotas.ehGeral(financeiro)).toBe(true);
  });
  test("exigirGeral: geral só nas permissões da concessão geral", () => {
    const tk = tokenConcessoes(DIRIGENTE_COM_DELEGACAO());
    const ctx = {};
    expect(escopoRotas.exigirGeral(req(tk), ctx, "pessoas")).toBeNull();
    expect(ctx.res.status).toBe(403);
    const v = escopoRotas.exigirGeral(req(tk), {}, "financeiro");
    expect(v).toMatchObject({ escopoCongregacoes: "TODAS", nivel: "GLOBAL", permissoes: ["financeiro"] });
    expect(auth.temPermissao(v, "pessoas")).toBe(true); // a visão continua sabendo das outras concessões (para a próxima conferência)
    expect(auth.visaoDaPermissao(v, "pessoas").escopoCongregacoes).toEqual(["Central"]);
    // sem permissão pedida: a visão devolvida é SÓ a da concessão geral (o cargo local não entra nela)
    const soLogin = escopoRotas.exigirGeral(req(tk), {});
    expect(soLogin.permissoes).toEqual(["financeiro"]);
    expect(auth.concessoesDaVisao(soLogin)).toHaveLength(1);
  });
  test("a sessão inteira (exigirLogin) une tudo — é o que a tela mostra", () => {
    const s = auth.exigirLogin(req(tokenConcessoes(DIRIGENTE_COM_DELEGACAO())), {});
    expect(s.permissoes.sort()).toEqual(["financeiro", "pessoas", "reunioes"]);
    expect(s.escopoCongregacoes).toBe("TODAS");
    expect(s.nivel).toBe("GLOBAL");
  });
  test("concessão vencida (`ate` antes de hoje em Brasília) deixa de valer na hora — a delegação e o mandato próprio", () => {
    const vencida = [concessao({ permissoes: ["pessoas"] }), concessao({ origem: "DELEGACAO", ate: dia(-1), permissoes: ["financeiro"], escopoCongregacoes: "TODAS", nivel: "GLOBAL" })];
    const ctx = {};
    expect(auth.exigirPermissao(req(tokenConcessoes(vencida)), ctx, "financeiro")).toBeNull();
    expect(ctx.res.status).toBe(403);
    expect(auth.exigirLogin(req(tokenConcessoes(vencida)), {}).escopoCongregacoes).toEqual(["Central"]);
    const hoje = [concessao({ origem: "DELEGACAO", ate: dia(0), permissoes: ["financeiro"] })];
    expect(auth.exigirPermissao(req(tokenConcessoes(hoje)), {}, "financeiro")).not.toBeNull(); // o último dia ainda vale
    const mandatoVencido = [concessao({ ate: dia(-1), permissoes: ["pessoas"] })];
    expect(auth.exigirPermissao(req(tokenConcessoes(mandatoVencido)), {}, "pessoas")).toBeNull();
  });
  test("nível e escopo de concessões diferentes não se misturam para virar 'geral'", () => {
    // papel Global com escopo de uma congregação + Líder Geral de Departamento (TODAS, nível DEPARTAMENTO), ambos com "relatorios"
    const tk = tokenConcessoes([
      concessao({ permissoes: ["relatorios"], nivel: "GLOBAL", escopoCongregacoes: ["Central"] }),
      concessao({ origem: "DELEGACAO", permissoes: ["relatorios"], nivel: "DEPARTAMENTO", escopoCongregacoes: "TODAS", departamentoId: 4 })
    ]);
    const v = auth.exigirPermissao(req(tk), {}, "relatorios");
    expect(v.nivel).toBe("GLOBAL");
    expect(v.escopoCongregacoes).toBe("TODAS");
    expect(escopoRotas.ehGeral(v)).toBe(false);
    expect(escopoRotas.exigirGeral(req(tk), {}, "relatorios")).toBeNull();
  });
  test("exigirNivelGlobal devolve só as concessões de nível Global (o escopo local não pega carona)", () => {
    const tk = tokenConcessoes([
      concessao({ permissoes: ["pessoas"], nivel: "GLOBAL", escopoCongregacoes: ["Central"] }),
      concessao({ origem: "DELEGACAO", permissoes: ["pessoas"], nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"] })
    ]);
    expect(auth.exigirNivelGlobal(req(tk), {}).escopoCongregacoes).toEqual(["Central"]);
    expect(auth.exigirNivelGlobal(req(tokenConcessoes([concessao({ permissoes: ["pessoas"] })])), {})).toBeNull();
  });
  test("departamento: só restringe se TODAS as concessões da visão restringem; e então vale qualquer um deles", () => {
    const misto = auth.exigirPermissao(req(tokenConcessoes([
      concessao({ permissoes: ["relatorios"], departamentoId: 3 }), concessao({ origem: "DELEGACAO", permissoes: ["relatorios"], escopoCongregacoes: ["Vila Nova"] })
    ])), {}, "relatorios");
    expect(misto.departamentoId).toBeNull();
    const dois = auth.exigirPermissao(req(tokenConcessoes([
      concessao({ permissoes: ["relatorios"], departamentoId: 3 }), concessao({ origem: "DELEGACAO", permissoes: ["relatorios"], departamentoId: 4 })
    ])), {}, "relatorios");
    expect([3, 4, 5].map((d) => auth.podeDepartamento(dois, d))).toEqual([true, true, false]);
  });
  test("Extensão da Tenda: conferida concessão por concessão (a extensão de uma não estreita a congregação inteira da outra)", () => {
    const v = auth.exigirPermissao(req(tokenConcessoes([
      concessao({ permissoes: ["pessoas"], escopoCongregacoes: ["Central"], escopoExtensaoNome: "Tenda Norte" }),
      concessao({ origem: "DELEGACAO", permissoes: ["pessoas"], escopoCongregacoes: ["Vila Nova"] })
    ])), {}, "pessoas");
    expect(escopoRotas.noEscopoDaPessoa(v, "Central", "Tenda Norte")).toBe(true);
    expect(escopoRotas.noEscopoDaPessoa(v, "Central", null)).toBe(false);
    expect(escopoRotas.noEscopoDaPessoa(v, "Vila Nova", null)).toBe(true);
    expect(escopoRotas.noEscopoDaPessoa(v, "Vila Nova", "Qualquer")).toBe(true);
    expect(escopoRotas.noEscopoDaPessoa(v, "Outra", null)).toBe(false);
    expect(v.escopoExtensaoNome).toBe("Tenda Norte"); // quem só lê o campo de topo erra para o lado fechado
  });
  test("token sem `concessoes` (legado/teste) vale como UMA concessão com os campos de topo — igual a antes", () => {
    const campos = { permissoes: ["pessoas"], nivel: "AREA", escopoCongregacoes: ["A", "B"], escopoExtensaoNome: null, departamentoId: 2 };
    const tk = auth.reassinarSessao({ membroId: 7, termosPendentes: [], via: "SENHA", ...campos });
    const v = auth.exigirPermissao(req(tk), {}, "pessoas");
    expect(v).toEqual({ membroId: 7, termosPendentes: [], via: "SENHA", ...campos });
    const semEscopo = auth.exigirPermissao(req(auth.reassinarSessao({ membroId: 7, termosPendentes: [], permissoes: ["pessoas"] })), {}, "pessoas");
    expect(semEscopo.escopoCongregacoes).toBeUndefined();
    expect(auth.estaNoEscopo(semEscopo, "A")).toBe(false);
  });
});

// =====================================================================================================================================================
describe("rotas de verdade obedecem o escopo DA PERMISSÃO", () => {
  test("GestaoTermos: o Dirigente com delegação Global ainda assina o Termo de Compromisso do Dirigente (vale o nível do cargo PRÓPRIO)", async () => {
    const hTermos = require("../../GestaoTermos/index.js");
    const tk = tokenConcessoes(DIRIGENTE_COM_DELEGACAO(), { termosPendentes: ["COMPROMISSO_DIRIGENTE"] });
    quando(/OUTPUT INSERTED\.TermoAssinadoId/, [{ TermoAssinadoId: 1 }]);
    const r = await chamar(hTermos, { token: tk, ligado: { tipo: "COMPROMISSO_DIRIGENTE" } });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/INSERT INTO TermosAssinados/)[0].inputs.tipo).toBe("COMPROMISSO_DIRIGENTE");
    expect(auth.nivelDoCargoProprio(auth.getSessao(tk))).toBe("CONGREGACAO");
    expect(auth.nivelDoCargoProprio(auth.getSessao(auth.reassinarSessao({ membroId: 1, nivel: "AREA" })))).toBe("AREA"); // token sem concessões: o nível de topo
  });
  test("GestaoPinMembro ('pessoas'): a delegação de 'financeiro' da igreja inteira não deixa gerar PIN para alguém de outra congregação", async () => {
    quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c/, [{ MembroId: 41, Nome: "Joana", Email: null, DataNascimento: null, CongregacaoNome: "Vila Nova" }]);
    const r = await chamar(hPinGestao, { token: tokenConcessoes(DIRIGENTE_COM_DELEGACAO()), corpo: { membroId: 41 } });
    expect(r.status).toBe(403);
    expect(rodou(/MembroPins/)).toHaveLength(0);
  });
  test("BuscaGlobal: a busca de pessoas usa o escopo de 'pessoas'; fornecedor (só o geral) aparece pela delegação geral de 'financeiro'", async () => {
    quando(/FROM MembroReferencia m\s+LEFT JOIN Congregacoes cg/, [{ id: 1, titulo: "Ana", congregacao: "Central", extensao: null }, { id: 2, titulo: "Ana Vila", congregacao: "Vila Nova", extensao: null }]);
    quando(/FROM Fornecedores/, [{ id: 3, titulo: "Ana Materiais", subtitulo: "000" }]);
    const r = await chamar(hBusca, { metodo: "GET", token: tokenConcessoes(DIRIGENTE_COM_DELEGACAO()), query: { q: "Ana" } });
    const pessoas = rodou(/FROM MembroReferencia m\s+LEFT JOIN Congregacoes cg/)[0];
    expect(pessoas.sql).toMatch(/cg\.Nome IN \(@escopo0\)/);
    expect(pessoas.inputs.escopo0).toBe("Central");
    expect(r.body.filter((x) => x.tipo === "Pessoa").map((x) => x.titulo)).toEqual(["Ana"]);
    expect(r.body.some((x) => x.tipo === "Fornecedor")).toBe(true);
  });
});

// =====================================================================================================================================================
describe("LoginSecretaria monta uma concessão por cargo e por delegação", () => {
  const NOMES_DA_AREA = ["Central", "Vila Nova", "Jardim das Flores", "Parque Industrial", "Bairro Alto", "Campo Verde", "Morada do Sol", "Nova Esperança", "Recanto Feliz", "Boa Vista"];
  function banco({ ativoAte = null, delegacoes = [] } = {}) {
    quando(/FROM Lideranca l\s+JOIN Papeis p ON p\.PapelId = l\.PapelId\s+JOIN MembroReferencia m/, [{ membroId: 5, escopoTipo: "AREA", escopoId: 3, senhaHash: auth.hashSenha("Senha#1"), departamentoId: null, ativoAte, papelNome: "Pastor de Área", papelNivel: "AREA", permissoesStr: "pessoas,reunioes", nome: "Pr. João" }]);
    quando(/UPDATE t SET\s+Falhas = CASE/, [{ EstavaBloqueado: false, Falhas: 1, BloqueadaAgora: false }]);
    quando(/SELECT Nome FROM Congregacoes WHERE AreaId = @id/, NOMES_DA_AREA.map((Nome) => ({ Nome })));
    quando(/SELECT Nome FROM Congregacoes WHERE CongregacaoId = @id/, [{ Nome: "Distante" }]);
    quando(/FROM DelegacoesAcesso d/, delegacoes);
    quando(/INSERT INTO SessoesAtivas/, [{ SessaoId: SID }]);
  }
  const delegacao = (extra) => ({ DelegacaoId: 9, LiderancaId: 4, DataFim: new Date(), DataFimTexto: dia(+10), Motivo: null, deleganteNome: "Tesoureiro", EscopoTipo: "GLOBAL", EscopoId: null, DepartamentoId: null, LiderancaAtivoAteTexto: null, papelNome: "Tesoureiro Geral", papelNivel: "GLOBAL", permissoesStr: "financeiro", ...extra });

  test("o token leva as concessões (e não os campos de topo); a resposta à tela traz a união", async () => {
    banco({ ativoAte: dia(+30), delegacoes: [delegacao()] });
    const r = await chamar(hLogin, { corpo: { matricula: 5, senha: "Senha#1" } });
    expect(r.body.sucesso).toBe(true);
    const bruto = JSON.parse(Buffer.from(r.body.token.split(".")[0], "base64url").toString("utf8"));
    expect(bruto.permissoes).toBeUndefined();
    expect(bruto.escopoCongregacoes).toBeUndefined();
    expect(bruto.concessoes).toEqual([
      { origem: "PROPRIA", ate: dia(+30), permissoes: ["pessoas", "reunioes"], nivel: "AREA", escopoCongregacoes: NOMES_DA_AREA, escopoExtensaoNome: null, departamentoId: null },
      { origem: "DELEGACAO", delegacaoId: 9, ate: dia(+10), permissoes: ["financeiro"], nivel: "GLOBAL", escopoCongregacoes: "TODAS", escopoExtensaoNome: null, departamentoId: null }
    ]);
    expect(bruto).toMatchObject({ membroId: 5, via: "SENHA", sid: SID });
    expect(r.body.permissoes.sort()).toEqual(["financeiro", "pessoas", "reunioes"]);
    expect(r.body.escopo).toBe("TODAS");
    expect(r.body.delegacoesAtivas).toHaveLength(1);
    // a tela recebe o "geral" com a regra das rotas: a delegação do Tesoureiro Geral é Global + TODAS numa concessão só
    expect(r.body.geral).toBe(true);
    const tk = auth.reassinarMantendoValidade(r.body.token, { termosPendentes: [] });
    expect(auth.exigirPermissao(req(tk), {}, "pessoas").escopoCongregacoes).toEqual(NOMES_DA_AREA);
    expect(escopoRotas.exigirGeral(req(tk), {}, "financeiro")).not.toBeNull();
    expect(escopoRotas.exigirGeral(req(tk), {}, "pessoas")).toBeNull();
  });
  test("tela: cargo Global de escopo limitado + delegação Departamental de escopo TODAS NÃO é geral (nível e escopo de concessões diferentes)", async () => {
    quando(/FROM Lideranca l\s+JOIN Papeis p ON p\.PapelId = l\.PapelId\s+JOIN MembroReferencia m/, [{ membroId: 5, escopoTipo: "AREA", escopoId: 3, senhaHash: auth.hashSenha("Senha#1"), departamentoId: null, ativoAte: null, papelNome: "Secretário", papelNivel: "GLOBAL", permissoesStr: "pessoas,reunioes", nome: "Pr. João" }]);
    banco({ delegacoes: [delegacao({ papelNome: "Líder Geral de Departamento", papelNivel: "DEPARTAMENTO", permissoesStr: "pessoas" })] });
    const r = await chamar(hLogin, { corpo: { matricula: 5, senha: "Senha#1" } });
    expect(r.body).toMatchObject({ sucesso: true, nivel: "GLOBAL", escopo: "TODAS", geral: false });
  });
  test("a delegação vale até o fim dela OU do mandato do cargo delegado, o que vier primeiro", async () => {
    banco({ delegacoes: [delegacao({ DataFimTexto: dia(+10), LiderancaAtivoAteTexto: dia(+2) })] });
    const r = await chamar(hLogin, { corpo: { matricula: 5, senha: "Senha#1" } });
    const bruto = JSON.parse(Buffer.from(r.body.token.split(".")[0], "base64url").toString("utf8"));
    expect(bruto.concessoes[1].ate).toBe(dia(+2));
  });
  test("recertificação vencida tira a permissão de TODAS as concessões", async () => {
    banco({ delegacoes: [delegacao({ permissoesStr: "financeiro,pessoas" })] });
    quando(/FROM RecertificacoesAcesso r/, [{ Permissao: "pessoas" }]);
    const r = await chamar(hLogin, { corpo: { matricula: 5, senha: "Senha#1" } });
    const bruto = JSON.parse(Buffer.from(r.body.token.split(".")[0], "base64url").toString("utf8"));
    expect(bruto.concessoes.map((c) => c.permissoes)).toEqual([["reunioes"], ["financeiro"]]);
  });
  test("tamanho do token: área de 10 congregações + 3 delegações de área cabe folgado num cabeçalho (< 4 KB)", async () => {
    banco({ delegacoes: [1, 2, 3].map((i) => delegacao({ DelegacaoId: i, EscopoTipo: "AREA", EscopoId: 3, papelNivel: "AREA", permissoesStr: "pessoas,reunioes,financeiro,disciplina" })) });
    const r = await chamar(hLogin, { corpo: { matricula: 5, senha: "Senha#1" } });
    expect(r.body.token.length).toBeLessThan(4096);
    // cargo de área + delegações de área: escopo largo não faz ninguém geral
    expect(r.body.geral).toBe(false);
  });
});

// =====================================================================================================================================================
describe("GestaoCatalogos — congregação sem homônima e derrubada geral das sessões", () => {
  const geral = () => tokenConcessoes([concessao({ permissoes: ["pessoas", "permissoes"], nivel: "GLOBAL", escopoCongregacoes: "TODAS" })]);
  const HOMONIMA = /SELECT TOP 1 CongregacaoId FROM Congregacoes WHERE LTRIM\(RTRIM\(Nome\)\) COLLATE Latin1_General_CI_AI = LTRIM\(RTRIM\(@nome\)\) COLLATE Latin1_General_CI_AI/;
  const REVOGA_TODAS = /UPDATE SessoesAtivas SET Encerrada = 1[\s\S]*WHERE Encerrada = 0/;

  test("criar congregação com nome que já existe (comparado pelo SQL, sem maiúscula/acento/espaço): 409, nada gravado", async () => {
    quando(HOMONIMA, [{ CongregacaoId: 1 }]);
    const r = await chamar(hCatalogos, { token: geral(), corpo: { nome: "  sao pedro " }, ligado: { catalogo: "congregacoes" } });
    expect(r.status).toBe(409);
    expect(r.body.mensagem).toMatch(/Já existe uma congregação com esse nome/);
    expect(rodou(HOMONIMA)[0].inputs).toMatchObject({ nome: "sao pedro", id: null });
    expect(rodou(/INSERT INTO Congregacoes/)).toHaveLength(0);
  });
  test("nome livre: grava sem os espaços das pontas e não derruba ninguém", async () => {
    quando(/INSERT INTO Congregacoes/, [{ CongregacaoId: 50 }]);
    quando(/SELECT \* FROM Congregacoes WHERE CongregacaoId = @id/, [{ CongregacaoId: 50, Nome: "Nova" }]);
    const r = await chamar(hCatalogos, { token: geral(), corpo: { nome: "  Nova  " }, ligado: { catalogo: "congregacoes" } });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/INSERT INTO Congregacoes/)[0].inputs.nome).toBe("Nova");
    expect(rodou(REVOGA_TODAS)).toHaveLength(0);
  });
  test("renomear: confere homônima excluindo a própria e DERRUBA as sessões de todos (menos a de quem renomeou)", async () => {
    let lido = 0;
    quando(/SELECT \* FROM Congregacoes WHERE CongregacaoId = @id/, () => (lido++ === 0 ? [{ CongregacaoId: 1, Nome: "Central", AreaId: 3 }] : [{ CongregacaoId: 1, Nome: "Central Nova", AreaId: 3 }]));
    quando(/UPDATE Congregacoes SET/, []);
    const r = await chamar(hCatalogos, { token: geral(), corpo: { id: 1, nome: "Central Nova" }, ligado: { catalogo: "congregacoes" } });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(HOMONIMA)[0].inputs).toMatchObject({ id: 1 });
    expect(rodou(REVOGA_TODAS)).toHaveLength(1);
    expect(rodou(REVOGA_TODAS)[0].inputs.exceto).toBe(SID);
  });
  test("renomear para o nome de outra: 409, sem UPDATE e sem derrubar", async () => {
    quando(HOMONIMA, [{ CongregacaoId: 2 }]);
    const r = await chamar(hCatalogos, { token: geral(), corpo: { id: 1, nome: "VILA NOVA" }, ligado: { catalogo: "congregacoes" } });
    expect(r.status).toBe(409);
    expect(rodou(/UPDATE Congregacoes SET/)).toHaveLength(0);
    expect(rodou(REVOGA_TODAS)).toHaveLength(0);
  });
  test("mudar só o endereço não derruba; mudar de área derruba; excluir derruba", async () => {
    let lido = 0;
    quando(/SELECT \* FROM Congregacoes WHERE CongregacaoId = @id/, () => (lido++ % 2 === 0 ? [{ CongregacaoId: 1, Nome: "Central", AreaId: 3, Cep: "1" }] : [{ CongregacaoId: 1, Nome: "Central", AreaId: 3, Cep: "2" }]));
    quando(/UPDATE Congregacoes SET/, []);
    await chamar(hCatalogos, { token: geral(), corpo: { id: 1, cep: "2" }, ligado: { catalogo: "congregacoes" } });
    expect(rodou(REVOGA_TODAS)).toHaveLength(0);
    mockRegras = []; lido = 0;
    quando(/SELECT \* FROM Congregacoes WHERE CongregacaoId = @id/, () => (lido++ % 2 === 0 ? [{ CongregacaoId: 1, Nome: "Central", AreaId: 3 }] : [{ CongregacaoId: 1, Nome: "Central", AreaId: 4 }]));
    quando(/UPDATE Congregacoes SET/, []);
    await chamar(hCatalogos, { token: geral(), corpo: { id: 1, areaId: 4 }, ligado: { catalogo: "congregacoes" } });
    expect(rodou(REVOGA_TODAS)).toHaveLength(1);
    mockConsultas = [];
    quando(/SELECT COUNT\(\*\) AS Total FROM MembroReferencia/, [{ Total: 0 }]);
    quando(/DELETE FROM Congregacoes/, []);
    await chamar(hCatalogos, { metodo: "DELETE", token: geral(), ligado: { catalogo: "congregacoes", id: "1" } });
    expect(rodou(REVOGA_TODAS)).toHaveLength(1);
  });
  test("papel: mudar as permissões derruba as sessões de todos (o token carrega as permissões do papel)", async () => {
    let lido = 0;
    quando(/SELECT \* FROM Papeis WHERE PapelId = @id/, () => (lido++ === 0 ? [{ PapelId: 2, Nome: "Dirigente", Nivel: "CONGREGACAO", Permissoes: "pessoas,financeiro" }] : [{ PapelId: 2, Nome: "Dirigente", Nivel: "CONGREGACAO", Permissoes: "pessoas" }]));
    quando(/UPDATE Papeis SET/, []);
    await chamar(hCatalogos, { token: geral(), corpo: { id: 2, permissoes: ["pessoas"] }, ligado: { catalogo: "papeis" } });
    expect(rodou(REVOGA_TODAS)).toHaveLength(1);
  });
  test("extensão: homônima dentro da MESMA congregação-mãe é recusada", async () => {
    quando(/SELECT TOP 1 ExtensaoId FROM ExtensoesTenda/, [{ ExtensaoId: 8 }]);
    const r = await chamar(hCatalogos, { token: geral(), corpo: { nome: "Tenda Norte", congregacaoMaeId: 1 }, ligado: { catalogo: "extensoes" } });
    expect(r.status).toBe(409);
    const consulta = rodou(/SELECT TOP 1 ExtensaoId FROM ExtensoesTenda/)[0];
    expect(consulta.inputs).toMatchObject({ nome: "Tenda Norte", mae: 1 });
    expect(consulta.sql).toMatch(/AND CongregacaoMaeId = COALESCE\(@mae, \(SELECT CongregacaoMaeId FROM ExtensoesTenda WHERE ExtensaoId = @id\)\)/); // só dentro da MESMA mãe
    expect(rodou(/INSERT INTO ExtensoesTenda/)).toHaveLength(0);
  });
});
