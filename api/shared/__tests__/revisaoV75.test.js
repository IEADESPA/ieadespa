// Correções da revisão adversarial do fecho da v7.5 (rodada sobre o acesso por PIN): cada teste prende UMA brecha que a revisão achou, para ela não voltar.
//  - sessão de PIN/código nunca vale como liderança (trocar senha, aprovar etapa, delegar papel);
//  - trocar a senha exige a senha ATUAL e conta nas tentativas do login;
//  - PIN provisório só serve para criar o PIN definitivo (e não renova a validade da sessão);
//  - papéis/funcionalidades exigem a permissão "permissoes"; GestaoPessoas respeita o escopo no POST e no DELETE (e não grava o e-mail na trilha);
//  - enquetes: voto só da matrícula da sessão, opção só da própria pergunta, corpo malformado recusado;
//  - portas anônimas com contenção por origem.
// O banco é simulado por TEXTO da consulta (como em acessoMembro.test.js); o comportamento contra o SQL Server de verdade está no roteiro ponta a ponta.
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
const mockEmails = [];
jest.mock("../notificacaoEmail", () => ({ enviarEmailNotificacao: jest.fn(async (e) => { mockEmails.push(e); }) }));
jest.mock("../vacancia", () => ({ encerrarVinculos: jest.fn(async () => {}) }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, urlDocumentoComSas: (u) => u, salvarFoto: jest.fn(), salvarDocumento: jest.fn() }));
jest.mock("../enquetes", () => ({ membrosElegiveis: jest.fn(async () => new Set([20, 21])) }));

const auth = require("../auth");
const pin = require("../pinMembro");
const { registrarAuditoria } = require("../auditoria");
const hTrocarSenha = require("../../TrocarSenha/index.js");
const hFluxos = require("../../Fluxos/index.js");
const hDelegacoes = require("../../GestaoDelegacoes/index.js");
const hCatalogos = require("../../GestaoCatalogos/index.js");
const hPessoas = require("../../GestaoPessoas/index.js");
const hEnquetes = require("../../GestaoEnquetes/index.js");
const hDocumentos = require("../../GestaoDocumentos/index.js");
const hProjetos = require("../../GestaoProjetos/index.js");
const hFoto = require("../../MinhaFoto/index.js");
const hPin = require("../../MembroPin/index.js");
const hPresenca = require("../../RegistrarPresenca/index.js");
const hConta = require("../../VerificarContaMembro/index.js");

let contadorIp = 1;
const cabecalhos = (token) => ({ "x-forwarded-for": `177.40.${Math.floor(contadorIp / 250)}.${(contadorIp++ % 250) + 1}:5000, 40.70.146.136:6000`, ...(token ? { "x-auth-token": token } : {}) });
async function chamar(handler, { metodo = "POST", corpo = {}, token, ligado = {}, query = {}, headers } = {}) {
  const context = { bindingData: ligado, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query, body: corpo, headers: headers || cabecalhos(token) });
  return context.res;
}
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const rodou = (padrao) => mockConsultas.filter(c => padrao.test(c.sql));
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const lideranca = (extra = {}) => tokenDe(5, { via: "SENHA", nivel: "GLOBAL", permissoes: ["pessoas", "permissoes"], escopoCongregacoes: "TODAS", ...extra });
const livre = { EstavaBloqueado: false, Falhas: 1, BloqueadaAgora: false };

beforeEach(() => { mockRegras = []; mockConsultas = []; mockEmails.length = 0; registrarAuditoria.mockClear(); });

describe("só a sessão aberta com a SENHA administrativa vale como liderança", () => {
  test("ehSessaoDeLideranca: via SENHA vale; PIN e código não valem, mesmo com nível e permissões; token antigo (sem via) vale só se carrega o nível", () => {
    expect(auth.ehSessaoDeLideranca({ via: "SENHA", nivel: "GLOBAL" })).toBe(true);
    expect(auth.ehSessaoDeLideranca({ via: "SENHA", nivel: null })).toBe(true);
    expect(auth.ehSessaoDeLideranca({ via: "PIN", nivel: "GLOBAL", permissoes: ["pessoas"] })).toBe(false);
    expect(auth.ehSessaoDeLideranca({ via: "CODIGO", nivel: "GLOBAL" })).toBe(false);
    expect(auth.ehSessaoDeLideranca({ nivel: "AREA" })).toBe(true);                                  // token emitido antes da marca (12 h no máximo)
    expect(auth.ehSessaoDeLideranca({ nivel: null })).toBe(false);
    expect(auth.ehSessaoDeLideranca({})).toBe(false);
  });
  const ROTAS = [
    ["TrocarSenha", hTrocarSenha, { metodo: "POST", corpo: {} }],
    ["Fluxos (o que está comigo)", hFluxos, { metodo: "GET" }],
    ["GestaoDelegacoes (delegar papel)", hDelegacoes, { metodo: "GET" }]
  ];
  describe.each(ROTAS)("%s", (_nome, handler, args) => {
    test("sem sessão: 401", async () => expect((await chamar(handler, args)).status).toBe(401));
    test.each([["PIN", { via: "PIN" }], ["código por e-mail", { via: "CODIGO" }]])("sessão de %s, mesmo de quem tem cargo e permissão: 403, sem tocar no banco", async (_v, extra) => {
      const r = await chamar(handler, { ...args, token: tokenDe(5, { ...extra, nivel: "GLOBAL", permissoes: ["pessoas", "permissoes"], escopoCongregacoes: "TODAS" }) });
      expect(r.status).toBe(403);
      expect(r.body.mensagem).toMatch(/senha de acesso administrativo/);
      expect(mockConsultas).toHaveLength(0);
    });
    test("sessão sem via e sem nível (membro comum de token antigo): 403", async () => {
      expect((await chamar(handler, { ...args, token: tokenDe(5) })).status).toBe(403);
    });
    test("sessão aberta com a senha administrativa passa pela porta (não é 401 nem 403)", async () => {
      const r = await chamar(handler, { ...args, token: lideranca() });
      expect([401, 403]).not.toContain(r.status);
    });
    test("token antigo (sem via) que carrega o nível do papel ainda passa até expirar", async () => {
      const r = await chamar(handler, { ...args, token: lideranca({ via: undefined }) });
      expect([401, 403]).not.toContain(r.status);
    });
  });
});

describe("TrocarSenha — a senha ATUAL é conferida e conta nas tentativas do login", () => {
  const SENHA = "SenhaAtual#2026";
  const hashAtual = auth.hashSenha(SENHA);
  const base = () => { quando(/FROM Lideranca WHERE MembroId = @id/, [{ SenhaHash: hashAtual }]); quando(/UPDATE t SET\s+Falhas = CASE/, [livre]); };
  const gravou = () => rodou(/UPDATE Lideranca SET SenhaHash/).length;

  test("sem a senha atual (ou com tipo errado): 400 e nada é lido nem gravado", async () => {
    base();
    for (const corpo of [{ novaSenha: "Nova#2026" }, { senhaAtual: "", novaSenha: "Nova#2026" }, { senhaAtual: 123456, novaSenha: "Nova#2026" }, { senhaAtual: ["a"], novaSenha: "Nova#2026" }, null, "texto", []]) {
      expect((await chamar(hTrocarSenha, { token: lideranca(), corpo })).status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("nova senha ausente, vazia ou gigante: 400", async () => {
    base();
    for (const novaSenha of [undefined, "", "   ", "x".repeat(201), 12345678, {}]) {
      expect((await chamar(hTrocarSenha, { token: lideranca(), corpo: { senhaAtual: SENHA, novaSenha } })).status).toBe(400);
    }
    expect(gravou()).toBe(0);
  });
  test("senha atual errada: 403, a tentativa é CONTADA no canal SENHA (limite 10) e nada é gravado", async () => {
    base();
    const r = await chamar(hTrocarSenha, { token: lideranca(), corpo: { senhaAtual: "palpite", novaSenha: "Nova#2026" } });
    expect(r.status).toBe(403);
    expect(gravou()).toBe(0);
    const reserva = rodou(/UPDATE t SET\s+Falhas = CASE/);
    expect(reserva).toHaveLength(1);
    expect(reserva[0].inputs).toMatchObject({ m: 5, c: "SENHA", lim: pin.LIMITE_FALHAS_SENHA });
    expect(rodou(/SET Falhas = 0, BloqueadoAte = NULL/)).toHaveLength(0);                          // não zera o contador de quem errou
  });
  test("conta bloqueada por tentativas: 403 mesmo com a senha certa, e nada é gravado", async () => {
    quando(/FROM Lideranca WHERE MembroId = @id/, [{ SenhaHash: hashAtual }]);
    quando(/UPDATE t SET\s+Falhas = CASE/, [{ EstavaBloqueado: true, Falhas: 10, BloqueadaAgora: true }]);
    const r = await chamar(hTrocarSenha, { token: lideranca(), corpo: { senhaAtual: SENHA, novaSenha: "Nova#2026" } });
    expect(r.status).toBe(403);
    expect(gravou()).toBe(0);
  });
  test("a resposta é a mesma para senha errada e para conta bloqueada (não diz qual dos dois)", async () => {
    base();
    const errada = await chamar(hTrocarSenha, { token: lideranca(), corpo: { senhaAtual: "palpite", novaSenha: "Nova#2026" } });
    mockRegras = [];
    quando(/FROM Lideranca WHERE MembroId = @id/, [{ SenhaHash: hashAtual }]);
    quando(/UPDATE t SET\s+Falhas = CASE/, [{ EstavaBloqueado: true, Falhas: 10, BloqueadaAgora: true }]);
    const bloqueada = await chamar(hTrocarSenha, { token: lideranca(), corpo: { senhaAtual: SENHA, novaSenha: "Nova#2026" } });
    expect(bloqueada.body).toEqual(errada.body);
  });
  test("senha atual certa: grava o hash da nova (nunca a nova em texto), zera o contador e audita sem senha nem hash", async () => {
    base();
    const r = await chamar(hTrocarSenha, { token: lideranca(), corpo: { senhaAtual: SENHA, novaSenha: "Nova#2026" } });
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(true);
    const upd = rodou(/UPDATE Lideranca SET SenhaHash/);
    expect(upd).toHaveLength(1);
    expect(upd[0].inputs.senhaHash).not.toContain("Nova#2026");
    expect(auth.verificarSenha("Nova#2026", upd[0].inputs.senhaHash)).toBe(true);
    expect(rodou(/SET Falhas = 0, BloqueadoAte = NULL/)).toHaveLength(1);
    const aud = registrarAuditoria.mock.calls[0][0];
    expect(aud).toMatchObject({ tabela: "Lideranca", registroId: 5, acao: "Trocou a própria senha", usuarioId: 5 });
    expect(JSON.stringify([aud, mockConsultas.map(c => c.inputs)])).not.toContain(SENHA);
  });
  test("quem não tem acesso à Secretaria (sem linha em Lideranca): avisa, sem gastar tentativa", async () => {
    const r = await chamar(hTrocarSenha, { token: lideranca(), corpo: { senhaAtual: SENHA, novaSenha: "Nova#2026" } });
    expect(r.body.sucesso).toBe(false);
    expect(rodou(/UPDATE t SET\s+Falhas = CASE/)).toHaveLength(0);
    expect(gravou()).toBe(0);
  });
});

describe("a sessão do PIN provisório só serve para criar o PIN definitivo", () => {
  const provisoria = (extra = {}) => tokenDe(20, { via: "PIN", pinProvisorio: true, ...extra });
  test("as portas de sessão recusam com 403 + criarPin; só a de criar o PIN deixa passar", () => {
    const ctx = () => ({});
    const req = { headers: { "x-auth-token": provisoria() } };
    for (const porta of [
      (c) => auth.exigirLogin(req, c),
      (c) => auth.exigirLoginIgnorandoTermos(req, c),
      (c) => auth.exigirTitular(req, c, 20),
      (c) => auth.exigirPermissao(req, c, "pessoas"),
      (c) => auth.exigirAlgumaPermissao(req, c, ["pessoas"]),
      (c) => auth.exigirNivelGlobal(req, c),
      (c) => auth.exigirSessaoDeLideranca(req, c)
    ]) {
      const c = ctx();
      expect(porta(c)).toBeNull();
      expect(c.res).toMatchObject({ status: 403, body: { criarPin: true } });
    }
    const c = ctx();
    expect(auth.exigirLoginIgnorandoTermos(req, c, { permitirProvisorio: true })).toMatchObject({ membroId: 20, pinProvisorio: true });
    expect(c.res).toBeUndefined();
  });
  test("numa rota de autoatendimento de verdade (MinhaFoto): 403 + criarPin, sem consultar o banco", async () => {
    const r = await chamar(hFoto, { metodo: "GET", ligado: { matricula: "20" }, token: provisoria() });
    expect(r.status).toBe(403);
    expect(r.body.criarPin).toBe(true);
    expect(mockConsultas).toHaveLength(0);
  });
  test("a sessão trocada por MembroPin mantém a validade original: trocar o PIN não ganha mais 12 horas", async () => {
    const hora = 3600 * 1000, t0 = Date.now();
    const agora = jest.spyOn(Date, "now");
    try {
      agora.mockReturnValue(t0);
      const original = provisoria();
      quando(/FROM MembroReferencia WHERE MembroId = @id/, [{ MembroId: 20, Nome: "Ana Souza", DataNascimento: null }]);
      quando(/FROM MembroPins/, [{ PinHash: pin.hashPin("4081", 20), Provisorio: true, ProvisorioExpiraEm: new Date(t0 + 86400000) }]);
      quando(/SELECT @@ROWCOUNT AS n/, [{ n: 1 }]);
      agora.mockReturnValue(t0 + 3 * hora);
      const r = await chamar(hPin, { token: original, corpo: { pin: "6205" } });
      expect(r.status).toBe(200);
      agora.mockReturnValue(t0 + 11 * hora);
      expect(auth.getSessao(r.body.token)).toMatchObject({ membroId: 20, pinProvisorio: false });
      agora.mockReturnValue(t0 + 12 * hora + 1000);                                                 // 12 h depois do token ORIGINAL (se tivesse renovado, ainda valeria)
      expect(auth.getSessao(r.body.token)).toBeNull();
    } finally { agora.mockRestore(); }
  });
  test("reassinarMantendoValidade: token inválido ou sem prazo não é renovado", () => {
    expect(auth.reassinarMantendoValidade("lixo", { a: 1 })).toBeNull();
    expect(auth.reassinarMantendoValidade("", { a: 1 })).toBeNull();
  });
});

describe("papéis e funcionalidades definem o que TODOS os cargos podem: exigem a permissão 'permissoes'", () => {
  test.each(["papeis", "funcionalidades"])("%s: quem só tem 'pessoas' (cadastro) leva 403 ao criar/alterar/excluir", async (catalogo) => {
    const token = lideranca({ permissoes: ["pessoas"] });
    for (const metodo of ["POST", "DELETE"]) {
      const r = await chamar(hCatalogos, { metodo, token, ligado: { catalogo, id: metodo === "DELETE" ? "3" : undefined }, corpo: { nome: "Presidente", nivel: "GLOBAL", permissoes: ["pessoas"] } });
      expect(r.status).toBe(403);
    }
    expect(rodou(/DELETE FROM|INSERT INTO|UPDATE (Papeis|Funcionalidades)/)).toHaveLength(0);
  });
  test.each(["papeis", "funcionalidades"])("%s: quem tem 'permissoes' passa pela porta", async (catalogo) => {
    const r = await chamar(hCatalogos, { metodo: "DELETE", token: lideranca({ permissoes: ["permissoes"] }), ligado: { catalogo, id: "3" } });
    expect([401, 403]).not.toContain(r.status);
  });
  test("os demais catálogos continuam com a permissão do cadastro ('pessoas')", async () => {
    quando(/COUNT\(\*\) AS Total FROM MembroReferencia WHERE CongregacaoId/, [{ Total: 0 }]);
    const r = await chamar(hCatalogos, { metodo: "DELETE", token: lideranca({ permissoes: ["pessoas"] }), ligado: { catalogo: "congregacoes", id: "3" } });
    expect([401, 403]).not.toContain(r.status);
  });
});

describe("GestaoPessoas respeita o escopo de quem altera (POST e DELETE)", () => {
  const vilaNova = () => lideranca({ via: "SENHA", nivel: "CONGREGACAO", permissoes: ["pessoas"], escopoCongregacoes: ["Vila Nova"] });
  const ficha = (extra = {}) => ({ MembroId: 7, Status: "ATIVO", EmailAnterior: "ana.souza@exemplo.org", CongregacaoNome: "Vila Nova", ExtensaoNome: null, ...extra });
  const monta = ({ existente, congregacoes = { 1: "Central", 2: "Vila Nova" } } = {}) => {
    quando(/SELECT TOP 1 Nome FROM Congregacoes WHERE CongregacaoId = @id/, (i) => (congregacoes[i.id] ? [{ Nome: congregacoes[i.id] }] : []));
    quando(/m\.Email AS EmailAnterior/, existente ? [existente] : []);
    quando(/m\.FotoUrl AS fotoUrl/, [{ membroId: 7, nome: "Ana", status: "ATIVO", situacaoMembro: "EM_COMUNHAO", dataNascimento: null, dataAdmissao: null, fotoUrl: null }]);
  };
  const gravou = () => rodou(/UPDATE MembroReferencia SET Nome|INSERT INTO MembroReferencia/).length;
  const corpo = (extra = {}) => ({ membroId: 7, nome: "Ana Souza", congregacaoId: 2, status: "ATIVO", ...extra });

  test("alterar membro de OUTRA congregação: 403 e nada é gravado", async () => {
    monta({ existente: ficha({ CongregacaoNome: "Central" }) });
    const r = await chamar(hPessoas, { token: vilaNova(), corpo: corpo() });
    expect(r.status).toBe(403);
    expect(gravou()).toBe(0);
    expect(mockEmails).toHaveLength(0);
  });
  test("cadastrar pessoa NOVA em outra congregação, ou sem congregação nenhuma: 403", async () => {
    monta({ existente: null });
    expect((await chamar(hPessoas, { token: vilaNova(), corpo: corpo({ congregacaoId: 1 }) })).status).toBe(403);
    expect((await chamar(hPessoas, { token: vilaNova(), corpo: corpo({ congregacaoId: undefined }) })).status).toBe(403);   // "sem congregação" não é brecha do escopo
    expect(gravou()).toBe(0);
  });
  test("mover o membro DA sua congregação PARA outra: 403 (o destino também precisa estar no escopo)", async () => {
    monta({ existente: ficha() });
    const r = await chamar(hPessoas, { token: vilaNova(), corpo: corpo({ congregacaoId: 1 }) });
    expect(r.status).toBe(403);
    expect(gravou()).toBe(0);
  });
  test("dentro do escopo: grava; trocar o e-mail audita só a forma mascarada e avisa o endereço ANTIGO", async () => {
    monta({ existente: ficha() });
    const r = await chamar(hPessoas, { token: vilaNova(), corpo: corpo({ email: "novo.endereco@outro.org" }) });
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(true);
    expect(gravou()).toBe(1);
    const aud = registrarAuditoria.mock.calls[0][0];
    expect(aud.dadosDepois).toMatchObject({ emailAlterado: true, emailAnterior: "a***@exemplo.org", emailNovo: "n***@outro.org" });
    expect(JSON.stringify(aud)).not.toMatch(/ana\.souza@exemplo|novo\.endereco/);
    expect(mockEmails).toHaveLength(1);
    expect(mockEmails[0].email).toBe("ana.souza@exemplo.org");
    expect(mockEmails[0].mensagem).not.toMatch(/novo\.endereco/);                                   // o aviso não entrega o endereço novo a quem tem o antigo
  });
  test("sem mudar o e-mail: não avisa ninguém", async () => {
    monta({ existente: ficha() });
    await chamar(hPessoas, { token: vilaNova(), corpo: corpo({ email: "ana.souza@exemplo.org" }) });
    expect(mockEmails).toHaveLength(0);
    expect(registrarAuditoria.mock.calls[0][0].dadosDepois.emailAlterado).toBeUndefined();
  });
  test("escopo geral (TODAS) continua alterando qualquer congregação", async () => {
    monta({ existente: ficha({ CongregacaoNome: "Central" }) });
    const r = await chamar(hPessoas, { token: lideranca({ permissoes: ["pessoas"] }), corpo: corpo({ congregacaoId: 1 }) });
    expect(r.status).toBe(200);
    expect(gravou()).toBe(1);
  });
  test("desligar: matrícula de outra congregação e matrícula que não existe recebem a MESMA recusa 403 (não diz quem tem cadastro)", async () => {
    quando(/SELECT c\.Nome AS CongregacaoNome, e\.Nome AS ExtensaoNome FROM MembroReferencia m/, (i) => (Number(i.id) === 7 ? [{ CongregacaoNome: "Central", ExtensaoNome: null }] : []));
    const fora = await chamar(hPessoas, { metodo: "DELETE", token: vilaNova(), ligado: { membroId: "7" } });
    const inexistente = await chamar(hPessoas, { metodo: "DELETE", token: vilaNova(), ligado: { membroId: "999" } });
    expect(fora.status).toBe(403);
    expect(inexistente.status).toBe(403);
    expect(inexistente.body).toEqual(fora.body);
    expect(rodou(/UPDATE MembroReferencia SET Status = 'DESLIGADO'/)).toHaveLength(0);
  });
  test("desligar dentro do escopo: desliga e audita", async () => {
    quando(/SELECT c\.Nome AS CongregacaoNome, e\.Nome AS ExtensaoNome FROM MembroReferencia m/, [{ CongregacaoNome: "Vila Nova", ExtensaoNome: null }]);
    quando(/UPDATE MembroReferencia SET Status = 'DESLIGADO'/, [], 1);
    const r = await chamar(hPessoas, { metodo: "DELETE", token: vilaNova(), ligado: { membroId: "7" } });
    expect(r.status).toBe(200);
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ tabela: "MembroReferencia", registroId: 7, acao: "Desligou pessoa", usuarioId: 5 });
  });
});

describe("Enquetes — o voto é da matrícula da SESSÃO", () => {
  const enquete = (extra = {}) => ({ enqueteId: 1, titulo: "Reforma", descricao: null, visibilidade: "SECRETA", publicoTipo: "TODOS_ATIVOS", vinculante: false, quorumTipo: null, status: "ABERTA", ...extra });
  const monta = (extra = {}) => {
    quando(/FROM Enquetes WHERE EnqueteId = @id/, [enquete(extra)]);
    quando(/FROM PerguntasEnquete WHERE EnqueteId = @id ORDER BY Ordem/, [{ perguntaId: 10, ordem: 1, titulo: "Aprova?", tipo: "OPCOES" }]);
    quando(/FROM OpcoesEnquete WHERE PerguntaId = @id/, [{ opcaoId: 100, texto: "Sim" }, { opcaoId: 101, texto: "Não" }]);
    quando(/INSERT INTO RespostasEnquete/, [], 1);
  };
  const votar = (corpo, token = tokenDe(20), id = "1") => chamar(hEnquetes, { token, ligado: { id, acao: "votar" }, corpo });
  const gravados = () => rodou(/INSERT INTO RespostasEnquete/);
  const certo = (extra = {}) => ({ respostas: [{ perguntaId: 10, opcaoId: 100 }], ...extra });

  test("sem sessão: 401, e o corpo com matrícula não adianta (nem toca o banco)", async () => {
    monta();
    expect((await votar(certo({ membroId: 20 }), null)).status).toBe(401);
    expect(gravados()).toHaveLength(0);
    expect(mockConsultas).toHaveLength(0);
  });
  test("o voto grava a matrícula da SESSÃO (20); corpo sem matrícula, com a mesma matrícula (número ou texto) funciona", async () => {
    for (const membroId of [undefined, null, 20, "20"]) {
      mockRegras = []; mockConsultas = []; monta();
      const r = await votar(certo({ membroId }));
      expect(r.status).toBe(200);
      expect(r.body.sucesso).toBe(true);
      expect(gravados()).toHaveLength(1);
      expect(gravados()[0].inputs).toMatchObject({ perguntaId: 10, membroId: 20, opcaoId: 100 });
    }
  });
  test("matrícula DIFERENTE da sessão no corpo: 403 explícito (não ignora em silêncio) e nada é gravado", async () => {
    monta();
    const r = await votar(certo({ membroId: 21 }));
    expect(r.status).toBe(403);
    expect(gravados()).toHaveLength(0);
  });
  test("opção que não é da pergunta (de outra pergunta ou inventada): 400, nada gravado", async () => {
    monta();
    for (const opcaoId of [999, 1, "abc"]) {
      const r = await votar({ respostas: [{ perguntaId: 10, opcaoId }] });
      expect(r.status).toBe(400);
    }
    expect(gravados()).toHaveLength(0);
  });
  test.each([
    ["respostas ausentes", {}], ["respostas não é lista", { respostas: "x" }], ["lista vazia", { respostas: [] }],
    ["lista enorme", { respostas: Array.from({ length: 51 }, () => ({ perguntaId: 10, opcaoId: 100 })) }],
    ["item nulo", { respostas: [null] }], ["item é texto", { respostas: ["x"] }], ["item é lista", { respostas: [[]] }],
    ["perguntaId inválido", { respostas: [{ perguntaId: "0x10", opcaoId: 100 }] }], ["perguntaId com zero à esquerda", { respostas: [{ perguntaId: "010", opcaoId: 100 }] }],
    ["opcaoId inválido", { respostas: [{ perguntaId: 10, opcaoId: -1 }] }], ["texto longo demais", { respostas: [{ perguntaId: 10, textoResposta: "x".repeat(501) }] }],
    ["texto que não é texto", { respostas: [{ perguntaId: 10, textoResposta: { a: 1 } }] }]
  ])("corpo malformado (%s): 400 sem gravar", async (_nome, corpo) => {
    monta();
    expect((await votar(corpo)).status).toBe(400);
    expect(gravados()).toHaveLength(0);
  });
  test("enquete com identificador malformado na rota: 400", async () => {
    monta();
    for (const id of ["abc", "0", "1e1", "-3"]) expect((await votar(certo(), tokenDe(20), id)).status).toBe(400);
    expect(gravados()).toHaveLength(0);
  });
  test("a sessão do PIN provisório não vota (precisa criar o PIN antes)", async () => {
    monta();
    const r = await votar(certo(), tokenDe(20, { via: "PIN", pinProvisorio: true }));
    expect(r.status).toBe(403);
    expect(gravados()).toHaveLength(0);
  });
  test("encerrada, ou fora do público da enquete: nada é gravado", async () => {
    monta({ status: "ENCERRADA" });
    expect((await votar(certo())).body.sucesso).toBe(false);
    mockRegras = []; mockConsultas = []; monta();
    expect((await votar(certo(), tokenDe(33))).body.mensagem).toMatch(/não está no público/);        // 33 não está em membrosElegiveis
    expect(gravados()).toHaveLength(0);
  });
  test("já respondeu: não grava de novo", async () => {
    monta();
    quando(/SELECT 1 FROM RespostasEnquete r JOIN PerguntasEnquete p/, [{ "": 1 }]);
    const r = await votar(certo());
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/já respondeu/);
    expect(gravados()).toHaveLength(0);
  });
});

describe("listas que mostram quem votou, documentos e projetos exigem sessão", () => {
  test("GET sem sessão: 401 (antes qualquer um listava os participantes e, nas enquetes públicas, quem votou em quê)", async () => {
    expect((await chamar(hEnquetes, { metodo: "GET" })).status).toBe(401);
    expect((await chamar(hDocumentos, { metodo: "GET" })).status).toBe(401);
    expect((await chamar(hProjetos, { metodo: "GET" })).status).toBe(401);
    expect(mockConsultas).toHaveLength(0);
  });
  test("a sessão de PIN provisório também não lista", async () => {
    const token = tokenDe(20, { via: "PIN", pinProvisorio: true });
    expect((await chamar(hEnquetes, { metodo: "GET", token })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
});

describe("portas anônimas com contenção por origem", () => {
  test("RegistrarPresenca: depois de 120 pedidos no minuto vem 429 com Retry-After; outra origem não é afetada", async () => {
    const ip = "177.99.0.1";
    const h = (x) => ({ "x-forwarded-for": `${x}:1, 40.70.146.136:2` });
    let r;
    for (let i = 0; i < 120; i++) { r = await chamar(hPresenca, { headers: h(ip), corpo: {} }); expect(r.status).toBe(400); }
    r = await chamar(hPresenca, { headers: h(ip), corpo: {} });
    expect(r.status).toBe(429);
    expect(Number(r.headers["Retry-After"])).toBeGreaterThan(0);
    expect((await chamar(hPresenca, { headers: h("177.99.0.2"), corpo: {} })).status).toBe(400);
  });
  test("VerificarContaMembro: depois de 20 consultas no minuto vem 429 (e trocar o 1º valor do x-forwarded-for não escapa)", async () => {
    quando(/COUNT\(\*\) AS Total FROM MembroReferencia/, [{ Total: 0 }]);
    let r;
    for (let i = 0; i < 20; i++) {
      r = await chamar(hConta, { metodo: "GET", query: { email: "a@b.org" }, headers: { "x-forwarded-for": `10.0.0.${i + 1}:1, 177.99.0.9:2, 40.70.146.136:3` } });
      expect(r.status).toBe(200);
    }
    r = await chamar(hConta, { metodo: "GET", query: { email: "a@b.org" }, headers: { "x-forwarded-for": "6.6.6.6:1, 177.99.0.9:2, 40.70.146.136:3" } });
    expect(r.status).toBe(429);
  });
  test("VerificarContaMembro só devolve o booleano", async () => {
    quando(/COUNT\(\*\) AS Total FROM MembroReferencia/, [{ Total: 1 }]);
    const r = await chamar(hConta, { metodo: "GET", query: { email: "Alguem@Exemplo.org" } });
    expect(r.body).toEqual({ ehMembroAtivo: true });
    expect(rodou(/COUNT/)[0].inputs.email).toBe("alguem@exemplo.org");
  });
});
