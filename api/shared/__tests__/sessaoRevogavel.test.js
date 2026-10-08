// v7.6 — SESSÃO REVOGÁVEL: encerrar uma sessão passou a valer de verdade (antes o token valia até expirar sozinho, 12 h). Aqui, sem o ponto de entrada (testado em
// entradaUnica.test.js): as funções de auth.js e cada evento que derruba sessões — troca de senha (as OUTRAS), PIN redefinido pela Secretaria, delegação cancelada,
// cargo alterado/removido (e os delegados dele), "Derrubar acessos desta pessoa agora", "Minhas sessões", saída do rol (vacância).
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
jest.mock("../trilhas", () => ({ avaliarRequisitos: jest.fn(async () => ({ bloqueado: false })) }));
jest.mock("../canaisDb", () => ({ sincronizarSucessoes: jest.fn(async () => ({})) }));
jest.mock("../notificacaoEmail", () => ({ enviarEmailNotificacao: jest.fn(async () => {}) }));

const auth = require("../auth");
const { registrarAuditoria } = require("../auditoria");
const { criarPoolFalso, sqlFalso } = require("./testUtils");
const hTrocarSenha = require("../../TrocarSenha/index.js");
const hPinGestao = require("../../GestaoPinMembro/index.js");
const hDelegacoes = require("../../GestaoDelegacoes/index.js");
const hLideranca = require("../../GestaoLideranca/index.js");
const hSessoes = require("../../GestaoSessoes/index.js");
const hPessoas = require("../../GestaoPessoas/index.js");
const hPin = require("../../MembroPin/index.js");
const hMedidas = require("../../GestaoMedidasCautelares/index.js");

const SID = { atual: "aaaaaaaa-0000-0000-0000-000000000001", outra: "aaaaaaaa-0000-0000-0000-000000000002", delegado: "aaaaaaaa-0000-0000-0000-000000000003", alvo: "aaaaaaaa-0000-0000-0000-000000000004" };
const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
const rodou = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));
const REVOGA_DO_MEMBRO = /UPDATE SessoesAtivas SET Encerrada = 1[\s\S]*OUTPUT INSERTED\.SessaoId[\s\S]*WHERE MembroId = @membroId/;
const REVOGA_TODAS = /UPDATE SessoesAtivas SET Encerrada = 1[\s\S]*OUTPUT INSERTED\.SessaoId[\s\S]*WHERE Encerrada = 0/;
const sessaoDe = (membroId, sid, extra = {}) => auth.reassinarSessao({ membroId, nome: "P" + membroId, termosPendentes: [], via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "CONGREGACAO", permissoes: [], escopoCongregacoes: ["Central"], sid, ...extra });
const geral = (extra = {}) => sessaoDe(5, SID.atual, { nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["permissoes", "pessoas"], ...extra });
async function chamar(handler, { metodo = "POST", corpo = {}, token, ligado = {} } = {}) {
  const context = { bindingData: ligado, log: Object.assign(() => {}, { error() {}, info() {}, warn() {}, verbose() {} }) };
  await handler(context, { method: metodo, query: {}, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
// Responde à revogação por pessoa com as sessões abertas "no banco" de cada matrícula (menos a `exceto`).
const abertasPorMembro = (mapa) => (i) => (mapa[i.membroId] || []).filter((s) => s !== i.exceto).map((s) => ({ SessaoId: s }));

beforeEach(() => { mockRegras = []; mockConsultas = []; auth._reiniciarRevogacoes(); registrarAuditoria.mockClear(); });

// =====================================================================================================================================================
describe("auth.js — o conjunto de sessões encerradas", () => {
  test("revogarSessoesDoMembro: marca no banco só as abertas e recentes da pessoa, e derruba os tokens NA HORA nesta instância", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ SessaoId: SID.outra.toUpperCase() }]]);
    const tokOutra = sessaoDe(9, SID.outra);
    const tokAtual = sessaoDe(9, SID.atual);
    expect(auth.getSessao(tokOutra)).not.toBeNull();
    const n = await auth.revogarSessoesDoMembro(pool, sqlFalso, 9, { exceto: SID.atual });
    expect(n).toBe(1);
    expect(chamadas[0].sql).toMatch(/WHERE MembroId = @membroId AND Encerrada = 0/);
    expect(chamadas[0].sql).toMatch(/CriadoEm >= DATEADD\(hour, -13, SYSUTCDATETIME\(\)\)/);
    expect(chamadas[0].inputs).toMatchObject({ membroId: 9, exceto: SID.atual });
    expect(auth.getSessao(tokOutra)).toBeNull();
    expect(auth.getSessao(tokAtual)).not.toBeNull();
  });
  test("o `exceto` que não tem forma de GUID vira NULL (não quebra a coluna UNIQUEIDENTIFIER)", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]);
    await auth.revogarSessoesDoMembro(pool, sqlFalso, 9, { exceto: "abc-123" });
    expect(chamadas[0].inputs.exceto).toBeNull();
  });
  test("revogarTodasAsSessoes: todas as abertas e recentes, menos a de quem mudou", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ SessaoId: SID.outra }, { SessaoId: SID.delegado }]]);
    expect(await auth.revogarTodasAsSessoes(pool, sqlFalso, { exceto: SID.atual })).toBe(2);
    expect(chamadas[0].sql).toMatch(/WHERE Encerrada = 0\s+AND CriadoEm >= DATEADD\(hour, -13/);
    expect(chamadas[0].inputs.exceto).toBe(SID.atual);
    expect(auth.getSessao(sessaoDe(1, SID.outra))).toBeNull();
    expect(auth.getSessao(sessaoDe(2, SID.delegado))).toBeNull();
    expect(auth.getSessao(sessaoDe(5, SID.atual))).not.toBeNull();
  });
  test("token SEM sid (teste/legado) não é revogável; token encerrado: getSessao null, 401 com a mensagem própria, não é reassinado", async () => {
    auth.marcarRevogadas([SID.outra]);
    expect(auth.getSessao(auth.reassinarSessao({ membroId: 1, permissoes: [] }))).not.toBeNull();
    const tok = sessaoDe(1, SID.outra);
    expect(auth.getSessao(tok)).toBeNull();
    expect(auth.tokenRevogado(tok)).toBe(true);
    const context = {};
    expect(auth.exigirLogin({ headers: { "x-auth-token": tok } }, context)).toBeNull();
    expect(context.res).toEqual({ status: 401, body: { sucesso: false, mensagem: "Sua sessão foi encerrada. Entre novamente." } });
    expect(auth.reassinarMantendoValidade(tok, { termosPendentes: [] })).toBeNull();
    const semToken = {};
    auth.exigirLogin({ headers: {} }, semToken);
    expect(semToken.res.body.mensagem).toBe("Faça login para continuar.");
  });
  test("reassinarMantendoValidade preserva sid, via, pinProvisorio e as concessões", () => {
    const concessoes = [{ origem: "PROPRIA", permissoes: ["pessoas"], nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], escopoExtensaoNome: null, departamentoId: null }];
    const tok = auth.reassinarSessao({ membroId: 3, sid: SID.atual, via: "PIN", pinProvisorio: true, concessoes, termosPendentes: ["X"] });
    const novo = auth.reassinarMantendoValidade(tok, { pinProvisorio: false, termosPendentes: [] });
    const s = auth.getSessao(novo);
    expect(s).toMatchObject({ sid: SID.atual, via: "PIN", pinProvisorio: false, concessoes, permissoes: ["pessoas"], escopoCongregacoes: ["Central"] });
  });
  test("encerrarSessao e encerrarSessaoEspecifica derrubam o token na hora (não só a trilha)", async () => {
    const tok = sessaoDe(1, SID.outra);
    await auth.encerrarSessao(criarPoolFalso([[]]).pool, sqlFalso, tok);
    expect(auth.getSessao(tok)).toBeNull();
    const tok2 = sessaoDe(1, SID.alvo);
    expect(await auth.encerrarSessaoEspecifica(criarPoolFalso([[{ MembroId: 1 }], []]).pool, sqlFalso, 1, SID.alvo)).toBe(true);
    expect(auth.getSessao(tok2)).toBeNull();
  });
  test("uma releitura que começou antes do UPDATE não apaga a marca local (60 s)", async () => {
    auth.marcarRevogadas([SID.outra]);
    await auth.sincronizarRevogacoes({ obterPool: async () => criarPoolFalso([[]]).pool });
    expect(auth.getSessao(sessaoDe(1, SID.outra))).toBeNull();
  });
});

// =====================================================================================================================================================
describe("eventos que derrubam sessões", () => {
  test("TrocarSenha: derruba as OUTRAS sessões da pessoa e mantém a atual", async () => {
    quando(/SELECT SenhaHash FROM Lideranca WHERE MembroId = @id/, [{ SenhaHash: auth.hashSenha("antiga#1") }]);
    quando(/UPDATE t SET\s+Falhas = CASE/, [{ EstavaBloqueado: false, Falhas: 1, BloqueadaAgora: false }]);
    quando(REVOGA_DO_MEMBRO, abertasPorMembro({ 5: [SID.atual, SID.outra] }));
    const atual = sessaoDe(5, SID.atual);
    const outra = sessaoDe(5, SID.outra);
    const r = await chamar(hTrocarSenha, { token: atual, corpo: { senhaAtual: "antiga#1", novaSenha: "nova#2026" } });
    expect(r.body.sucesso).toBe(true);
    expect(r.body.outrasSessoesEncerradas).toBe(1);
    expect(rodou(REVOGA_DO_MEMBRO)[0].inputs).toMatchObject({ membroId: 5, exceto: SID.atual });
    expect(auth.getSessao(outra)).toBeNull();
    expect(auth.getSessao(atual)).not.toBeNull();
  });
  test("TrocarSenha com a senha atual errada não derruba nada", async () => {
    quando(/SELECT SenhaHash FROM Lideranca WHERE MembroId = @id/, [{ SenhaHash: auth.hashSenha("antiga#1") }]);
    quando(/UPDATE t SET\s+Falhas = CASE/, [{ EstavaBloqueado: false, Falhas: 1, BloqueadaAgora: false }]);
    const r = await chamar(hTrocarSenha, { token: sessaoDe(5, SID.atual), corpo: { senhaAtual: "errada", novaSenha: "nova#2026" } });
    expect(r.status).toBe(403);
    expect(rodou(REVOGA_DO_MEMBRO)).toHaveLength(0);
  });

  test("GestaoPinMembro: o PIN provisório gerado pela Secretaria derruba TODAS as sessões da pessoa", async () => {
    quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c/, [{ MembroId: 40, Nome: "Maria", Email: null, DataNascimento: null, CongregacaoNome: "Central" }]);
    quando(/SELECT @@ROWCOUNT AS n/, [{ n: 1 }]);
    quando(REVOGA_DO_MEMBRO, abertasPorMembro({ 40: [SID.outra] }));
    const tokMaria = sessaoDe(40, SID.outra, { via: "PIN" });
    const r = await chamar(hPinGestao, { token: sessaoDe(5, SID.atual, { permissoes: ["pessoas"] }), corpo: { membroId: 40 } });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(REVOGA_DO_MEMBRO)[0].inputs).toMatchObject({ membroId: 40, exceto: null });
    expect(auth.getSessao(tokMaria)).toBeNull();
  });

  test("GestaoDelegacoes CANCELAR: derruba as sessões do DELEGADO", async () => {
    quando(/SELECT DeleganteMembroId, DelegadoMembroId FROM DelegacoesAcesso/, [{ DeleganteMembroId: 5, DelegadoMembroId: 77 }]);
    quando(REVOGA_DO_MEMBRO, abertasPorMembro({ 77: [SID.delegado] }));
    const tokDelegado = sessaoDe(77, SID.delegado);
    const r = await chamar(hDelegacoes, { metodo: "PUT", token: sessaoDe(5, SID.atual), corpo: { acao: "CANCELAR" }, ligado: { id: "12" } });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/UPDATE DelegacoesAcesso SET Status = 'CANCELADA'/)).toHaveLength(1);
    expect(rodou(REVOGA_DO_MEMBRO).map((c) => c.inputs.membroId)).toEqual([77]);
    expect(auth.getSessao(tokDelegado)).toBeNull();
  });
  test("GestaoDelegacoes: quem não é o delegante não cancela nem derruba ninguém", async () => {
    quando(/SELECT DeleganteMembroId, DelegadoMembroId FROM DelegacoesAcesso/, [{ DeleganteMembroId: 6, DelegadoMembroId: 77 }]);
    const r = await chamar(hDelegacoes, { metodo: "PUT", token: sessaoDe(5, SID.atual), corpo: { acao: "CANCELAR" }, ligado: { id: "12" } });
    expect(r.status).toBe(404);
    expect(rodou(/UPDATE SessoesAtivas/)).toHaveLength(0);
  });

  describe("GestaoLideranca", () => {
    const NIVEL = { 1: "GLOBAL", 2: "CONGREGACAO" };
    function banco({ lideranca = [], delegados = [] } = {}) {
      quando(/FROM MembroReferencia WHERE MembroId = @id/, (i) => (Number(i.id) === 20 ? [{ MembroId: 20, Nome: "Joana" }] : []));
      quando(/SELECT PapelId, Nivel FROM Papeis WHERE PapelId = @id/, (i) => (NIVEL[i.id] ? [{ PapelId: i.id, Nivel: NIVEL[i.id] }] : []));
      quando(/SELECT LiderancaId, PapelId, EscopoTipo, EscopoId FROM Lideranca WHERE MembroId = @id/, lideranca);
      quando(/SELECT 1 AS ok FROM Congregacoes WHERE/, [{ ok: 1 }]);
      quando(/SELECT DISTINCT d\.DelegadoMembroId FROM DelegacoesAcesso/, delegados.map((d) => ({ DelegadoMembroId: d })));
      quando(REVOGA_DO_MEMBRO, abertasPorMembro({ 20: [SID.alvo], 77: [SID.delegado] }));
    }
    const conceder = (extra) => ({ membroId: 20, papelId: 2, escopoTipo: "CONGREGACAO", escopoId: 7, senha: "Senha#2026", ...extra });

    test("cargo NOVO: não derruba ninguém", async () => {
      banco();
      const r = await chamar(hLideranca, { token: geral(), corpo: conceder() });
      expect(r.body.sucesso).toBe(true);
      expect(rodou(/UPDATE SessoesAtivas/)).toHaveLength(0);
    });
    test("cargo ALTERADO (papel/escopo): derruba a pessoa e os delegados, e cancela as delegações do cargo", async () => {
      banco({ lideranca: [{ LiderancaId: 9, PapelId: 1, EscopoTipo: "GLOBAL", EscopoId: null }], delegados: [77] });
      const r = await chamar(hLideranca, { token: geral(), corpo: conceder() });
      expect(r.body.sucesso).toBe(true);
      expect(rodou(/UPDATE DelegacoesAcesso SET Status = 'CANCELADA'/)).toHaveLength(1);
      expect(rodou(REVOGA_DO_MEMBRO).map((c) => c.inputs.membroId).sort()).toEqual([20, 77]);
      expect(auth.getSessao(sessaoDe(20, SID.alvo))).toBeNull();
      expect(auth.getSessao(sessaoDe(77, SID.delegado))).toBeNull();
    });
    test("só a senha redefinida (mesmo papel e escopo): derruba, mas não cancela delegação", async () => {
      banco({ lideranca: [{ LiderancaId: 9, PapelId: 2, EscopoTipo: "CONGREGACAO", EscopoId: 7 }], delegados: [77] });
      const r = await chamar(hLideranca, { token: geral(), corpo: conceder() });
      expect(r.body.sucesso).toBe(true);
      expect(rodou(/UPDATE DelegacoesAcesso SET Status = 'CANCELADA'/)).toHaveLength(0);
      expect(rodou(REVOGA_DO_MEMBRO).map((c) => c.inputs.membroId).sort()).toEqual([20, 77]);
    });
    test("cargo REMOVIDO: apaga as delegações do cargo (a chave estrangeira travava), remove e derruba pessoa e delegados", async () => {
      banco({ delegados: [77] });
      quando(/DELETE FROM Lideranca/, []);
      quando(/SELECT d\.DelegacaoId AS delegacaoId/, [{ delegacaoId: 3, delegadoMembroId: 77, status: "ATIVA", dataInicio: "2026-10-01", dataFim: "2026-10-30" }]);
      const r = await chamar(hLideranca, { metodo: "DELETE", token: geral(), ligado: { membroId: "20" } });
      expect(r.body.sucesso).toBe(true);
      const ordem = mockConsultas.map((c) => c.sql);
      const iDelegacoes = ordem.findIndex((s) => /DELETE FROM DelegacoesAcesso/.test(s));
      const iLideranca = ordem.findIndex((s) => /DELETE FROM Lideranca/.test(s));
      expect(iDelegacoes).toBeGreaterThanOrEqual(0);
      expect(iDelegacoes).toBeLessThan(iLideranca);
      expect(rodou(REVOGA_DO_MEMBRO).map((c) => c.inputs.membroId).sort()).toEqual([20, 77]);
    });
    test("'Derrubar acessos desta pessoa agora': só o nível geral; derruba, audita e não mexe no cargo", async () => {
      banco();
      const r = await chamar(hLideranca, { token: geral(), corpo: { acao: "DERRUBAR_ACESSOS" }, ligado: { membroId: "20" } });
      expect(r.body).toMatchObject({ sucesso: true, sessoesEncerradas: 1 });
      expect(auth.getSessao(sessaoDe(20, SID.alvo))).toBeNull();
      expect(rodou(/UPDATE Lideranca|INSERT INTO Lideranca|DELETE FROM Lideranca/)).toHaveLength(0);
      expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ tabela: "SessoesAtivas", registroId: 20, usuarioId: 5 }));
      for (const tk of [sessaoDe(5, SID.outra, { permissoes: ["permissoes"] }), geral({ escopoCongregacoes: ["Central"] })]) {
        mockConsultas = [];
        const negado = await chamar(hLideranca, { token: tk, corpo: { acao: "DERRUBAR_ACESSOS" }, ligado: { membroId: "20" } });
        expect(negado.status).toBe(403);
        expect(rodou(/UPDATE SessoesAtivas/)).toHaveLength(0);
      }
    });
    test("derrubar a si mesmo mantém a sessão atual; matrícula inválida/inexistente não derruba", async () => {
      banco();
      mockRegras.unshift([/FROM MembroReferencia WHERE MembroId = @id/, [{ MembroId: 5, Nome: "Eu" }]]);
      await chamar(hLideranca, { token: geral(), corpo: { acao: "DERRUBAR_ACESSOS" }, ligado: { membroId: "5" } });
      expect(rodou(REVOGA_DO_MEMBRO)[0].inputs).toMatchObject({ membroId: 5, exceto: SID.atual });
      mockConsultas = [];
      expect((await chamar(hLideranca, { token: geral(), corpo: { acao: "DERRUBAR_ACESSOS" }, ligado: { membroId: "abc" } })).status).toBe(400);
      expect(rodou(/UPDATE SessoesAtivas/)).toHaveLength(0);
    });
  });

  test("MembroPin: o PIN novo derruba as OUTRAS sessões da pessoa e mantém a atual (com a marca de provisório tirada)", async () => {
    quando(/SELECT MembroId, DataNascimento FROM MembroReferencia/, [{ MembroId: 40, DataNascimento: null }]);
    quando(/SELECT @@ROWCOUNT AS n/, [{ n: 1 }]);
    quando(REVOGA_DO_MEMBRO, abertasPorMembro({ 40: [SID.atual, SID.outra] }));
    const atual = sessaoDe(40, SID.atual, { via: "CODIGO", nivel: null, escopoCongregacoes: [] });
    const r = await chamar(hPin, { token: atual, corpo: { pin: "7392" } });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(REVOGA_DO_MEMBRO)[0].inputs).toMatchObject({ membroId: 40, exceto: SID.atual });
    expect(auth.getSessao(sessaoDe(40, SID.outra))).toBeNull();
    expect(auth.getSessao(r.body.token)).toMatchObject({ sid: SID.atual, pinProvisorio: false });
  });

  test("Medida cautelar com suspensão do acesso: as sessões da pessoa caem na hora; sem suspensão, não", async () => {
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, [{ MembroId: 20 }]);
    quando(/SELECT COUNT\(\*\) AS total/, [{ total: 2 }]);
    quando(/INSERT INTO MedidasCautelares/, [{ MedidaId: 3 }]);
    quando(REVOGA_DO_MEMBRO, abertasPorMembro({ 20: [SID.alvo] }));
    await chamar(hMedidas, { token: geral(), corpo: { membroId: 20, motivo: "Auditoria", suspenderAcessoSistema: false } });
    expect(rodou(REVOGA_DO_MEMBRO)).toHaveLength(0);
    await chamar(hMedidas, { token: geral(), corpo: { membroId: 20, motivo: "Auditoria", suspenderAcessoSistema: true } });
    expect(rodou(REVOGA_DO_MEMBRO).map((c) => c.inputs.membroId)).toEqual([20]);
    expect(auth.getSessao(sessaoDe(20, SID.alvo))).toBeNull();
  });

  test("Minhas sessões: encerrar a sessão de outro aparelho derruba aquele token na hora", async () => {
    quando(/SELECT MembroId FROM SessoesAtivas WHERE SessaoId = @id/, [{ MembroId: 5 }]);
    const outroAparelho = sessaoDe(5, SID.outra);
    const r = await chamar(hSessoes, { metodo: "PUT", token: sessaoDe(5, SID.atual), corpo: { acao: "ENCERRAR" }, ligado: { id: SID.outra } });
    expect(r.body.sucesso).toBe(true);
    expect(r.body.mensagem).not.toMatch(/12\s*h/);
    expect(auth.getSessao(outroAparelho)).toBeNull();
  });

  test("GestaoPessoas: quem sai do rol ativo (ATIVO -> INATIVO) perde as sessões; editar sem mudar o status não derruba", async () => {
    const existente = (status) => [{ MembroId: 40, Status: status, CongregacaoNome: "Central", ExtensaoNome: null, EmailAnterior: null }];
    quando(/FROM Congregacoes WHERE CongregacaoId = @id|SELECT Nome FROM Congregacoes/, [{ Nome: "Central", CongregacaoId: 1 }]);
    quando(REVOGA_DO_MEMBRO, abertasPorMembro({ 40: [SID.alvo] }));
    const tk = sessaoDe(5, SID.atual, { permissoes: ["pessoas"] });
    mockRegras.unshift([/FROM MembroReferencia m[\s\S]*WHERE m\.MembroId = @id/, existente("ATIVO")]);
    await chamar(hPessoas, { metodo: "POST", token: tk, corpo: { membroId: 40, nome: "Maria", congregacaoId: 1, status: "ATIVO" } });
    expect(rodou(REVOGA_DO_MEMBRO)).toHaveLength(0);
    await chamar(hPessoas, { metodo: "POST", token: tk, corpo: { membroId: 40, nome: "Maria", congregacaoId: 1, status: "INATIVO" } });
    expect(rodou(REVOGA_DO_MEMBRO).map((c) => c.inputs.membroId)).toEqual([40]);
    expect(auth.getSessao(sessaoDe(40, SID.alvo))).toBeNull();
  });
});
