// vD.4 — segundo fator da liderança (chave de acesso + código por e-mail): o que precisa valer sem navegador.
//  - o bilhete da senha certa: assinado, 5 minutos, não serve como token de sessão (e vice-versa), não aceita adulteração;
//  - a origem só pode ser nossa (produção, Static Web App, localhost);
//  - o login decide a etapa certa: chave > código > entra com aviso;
//  - a segunda etapa recusa bilhete inválido e conclui o login só com chave/código confirmados;
//  - o fator recente vale 10 minutos e nunca para via NENHUM.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "segredo-de-teste-para-o-segundo-fator-0123456789";

jest.mock("../notificacaoEmail", () => ({ enviarEmailNotificacao: jest.fn(async () => true) }));
jest.mock("../db", () => ({ getPool: jest.fn(async () => poolFalso), sql: { Int: "Int", NVarChar: () => "NVarChar", BigInt: "BigInt", DateTime2: "DateTime2", MAX: "MAX" } }));

// pool falso: guarda as consultas e responde conforme o texto
const consultas = [];
const poolFalso = {
  request() {
    const entradas = {};
    const r = {
      input(nome, _tipo, valor) { entradas[nome] = valor === undefined ? _tipo : valor; return r; },
      async query(texto) {
        consultas.push({ texto, entradas });
        if (/FROM dbo\.ChavesAcesso WHERE MembroId/.test(texto)) return { recordset: poolFalso.chaves.filter((c) => c.MembroId === entradas.m).map((c) => ({ chaveId: c.ChaveId, credencialId: c.CredencialId, chavePublica: c.ChavePublica, contador: 0, transportes: "internal", apelido: c.Apelido, dispositivoInfo: null, criadoEm: new Date(), ultimoUsoEm: null })) };
        if (/SELECT Nome, Email FROM dbo\.MembroReferencia/.test(texto)) return { recordset: [poolFalso.membro] };
        if (/OUTPUT inserted\.Desafio/.test(texto)) { const d = poolFalso.desafios.pop(); return { recordset: d ? [{ Desafio: d }] : [] }; }
        if (/INSERT INTO dbo\.DesafiosWebAuthn/.test(texto)) { poolFalso.desafios.push(entradas.d); return { recordset: [] }; }
        if (/INSERT INTO SessoesAtivas/.test(texto)) return { recordset: [{ SessaoId: 77 }] };
        if (/FROM Lideranca l/.test(texto)) return { recordset: poolFalso.liderancas };
        return { recordset: [], rowsAffected: [1] };
      }
    };
    return r;
  },
  chaves: [], desafios: [], membro: { Nome: "Gabriela", Email: "gabriela@exemplo.org" }, liderancas: []
};

const segundoFator = require("../segundoFator");

const reqCom = (origin, extra = {}) => ({ method: "POST", headers: Object.assign({ origin, "user-agent": "teste" }, extra.headers || {}), body: extra.body || {} });

describe("bilhete da senha certa", () => {
  test("emite, lê de volta e expira em 5 minutos", () => {
    const b = segundoFator.emitirBilhete({ membroId: 12, papelId: 3, escopoTipo: "AREA", escopoId: 1 });
    expect(b.startsWith("F.")).toBe(true);
    const p = segundoFator.lerBilhete(b);
    expect(p).toMatchObject({ membroId: 12, papelId: 3, escopoTipo: "AREA", escopoId: 1, fase: "fator" });
    expect(p.exp - Date.now()).toBeGreaterThan(4 * 60 * 1000);
    expect(p.exp - Date.now()).toBeLessThanOrEqual(segundoFator.VALIDADE_BILHETE_MS);
  });
  test("adulteração, formato errado e bilhete vencido são recusados", () => {
    const b = segundoFator.emitirBilhete({ membroId: 12, papelId: 3, escopoTipo: "AREA", escopoId: 1 });
    const [m, corpo, ass] = b.split(".");
    const corpoAdulterado = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(corpo, "base64url").toString()), membroId: 13 })).toString("base64url");
    expect(segundoFator.lerBilhete(`${m}.${corpoAdulterado}.${ass}`)).toBeNull();
    expect(segundoFator.lerBilhete(`${corpo}.${ass}`)).toBeNull();
    expect(segundoFator.lerBilhete("")).toBeNull();
    const vencidoCorpo = Buffer.from(JSON.stringify({ membroId: 12, fase: "fator", exp: Date.now() - 1 })).toString("base64url");
    expect(segundoFator.lerBilhete(`F.${vencidoCorpo}.x`)).toBeNull();
  });
  test("o bilhete NÃO vale como token de sessão (chave de assinatura distinta)", () => {
    const auth = require("../auth");
    const b = segundoFator.emitirBilhete({ membroId: 12, papelId: 3, escopoTipo: "AREA", escopoId: 1 });
    expect(auth.getSessao(b)).toBeNull();
    expect(auth.getSessao(b.slice(2))).toBeNull();
  });
});

describe("origem da chamada", () => {
  test.each([
    ["https://app.ieadespa.org.br", "app.ieadespa.org.br"],
    ["https://white-grass-048208e0f-21.eastus2.6.azurestaticapps.net", "white-grass-048208e0f-21.eastus2.6.azurestaticapps.net"],
    ["http://localhost:4280", "localhost"]
  ])("%s é nossa (rpID %s)", (origem, rp) => {
    expect(segundoFator.origemDaRequisicao(reqCom(origem))).toEqual({ origem, rpId: rp });
  });
  test.each(["https://exemplo.org", "https://app.ieadespa.org.br.falso.com", "http://app.ieadespa.org.br", "", undefined])("%s não é nossa", (origem) => {
    expect(segundoFator.origemDaRequisicao(reqCom(origem))).toBeNull();
  });
  test("mascara o e-mail para a tela", () => {
    expect(segundoFator.mascararEmail("gabriela@exemplo.org")).toBe("g******@exemplo.org");
    expect(segundoFator.mascararEmail(null)).toBeNull();
  });
});

describe("desafios e opções", () => {
  beforeEach(() => { consultas.length = 0; poolFalso.desafios.length = 0; poolFalso.chaves = []; });
  test("cadastro: gera opções com o rpID da origem e guarda o desafio; sem origem nossa, recusa", async () => {
    const r = await segundoFator.opcoesDeCadastro(poolFalso, reqCom("https://app.ieadespa.org.br"), { membroId: 12, nome: "Gabriela" });
    expect(r.erro).toBeUndefined();
    expect(r.opcoes.rp.id).toBe("app.ieadespa.org.br");
    expect(r.opcoes.user.name).toBe("matricula-12");
    expect(poolFalso.desafios).toEqual([r.opcoes.challenge]);
    expect(await segundoFator.opcoesDeCadastro(poolFalso, reqCom("https://invasor.org"), { membroId: 12 })).toEqual({ erro: expect.stringMatching(/Origem/) });
  });
  test("uso: sem chave cadastrada não há opções; com chave, lista só a credencial dela", async () => {
    expect(await segundoFator.opcoesDeUso(poolFalso, reqCom("https://app.ieadespa.org.br"), 12, "LOGIN")).toEqual({ erro: expect.stringMatching(/Nenhuma chave/) });
    poolFalso.chaves = [{ ChaveId: 1, MembroId: 12, CredencialId: "cred-abc", ChavePublica: Buffer.from("pk").toString("base64url"), Apelido: "celular" }];
    const r = await segundoFator.opcoesDeUso(poolFalso, reqCom("https://app.ieadespa.org.br"), 12, "LOGIN");
    expect(r.opcoes.allowCredentials.map((c) => c.id)).toEqual(["cred-abc"]);
    expect(r.opcoes.rpId).toBe("app.ieadespa.org.br");
  });
  test("conferir uso: credencial desconhecida e desafio ausente são recusados antes de qualquer criptografia", async () => {
    poolFalso.chaves = [{ ChaveId: 1, MembroId: 12, CredencialId: "cred-abc", ChavePublica: Buffer.from("pk").toString("base64url"), Apelido: "celular" }];
    expect(await segundoFator.conferirUso(poolFalso, reqCom("https://app.ieadespa.org.br"), 12, "LOGIN", { id: "outra" })).toEqual({ erro: expect.stringMatching(/desconhecida/) });
    expect(await segundoFator.conferirUso(poolFalso, reqCom("https://app.ieadespa.org.br"), 12, "LOGIN", { id: "cred-abc" })).toEqual({ erro: expect.stringMatching(/venceu/) });
  });
  test("fator recente: vale 10 minutos; via NENHUM nunca vale", () => {
    expect(segundoFator.fatorRecente({ fator: { via: "CHAVE", em: Date.now() - 60000 } })).toBe(true);
    expect(segundoFator.fatorRecente({ fator: { via: "CODIGO", em: Date.now() - 11 * 60000 } })).toBe(false);
    expect(segundoFator.fatorRecente({ fator: { via: "NENHUM", em: Date.now() } })).toBe(false);
    expect(segundoFator.fatorRecente({})).toBe(false);
  });
});

describe("login em duas etapas (LoginSecretaria) e segunda etapa (SegundoFator)", () => {
  const auth = require("../auth");
  const senhaHash = auth.hashSenha("Senha@Forte1");
  const linha = { membroId: 12, papelId: 3, escopoTipo: "AREA", escopoId: 1, senhaHash, departamentoId: null, ativoAte: null, papelNome: "Pastor de Área", papelNivel: "AREA", permissoesStr: "reunioes", nome: "Gabriela" };
  let login, segunda;
  beforeAll(() => {
    jest.doMock("../pinMembro", () => ({ reservarTentativa: jest.fn(async () => ({ bloqueado: false })), limparTentativas: jest.fn(async () => {}), LIMITE_FALHAS_SENHA: 10 }));
    jest.doMock("../escopo", () => ({ resolverEscopoCongregacoes: jest.fn(async () => [1, 2]), resolverNomeExtensao: jest.fn(async () => null) }));
    jest.doMock("../termos", () => ({ termosPendentes: jest.fn(async () => []) }));
    jest.doMock("../delegacoes", () => ({ concessoesDelegadas: jest.fn(async () => ({ delegacoesAtivas: [], concessoes: [] })) }));
    jest.doMock("../compliance", () => ({ permissoesComRecertificacaoExpirada: jest.fn(async () => []) }));
    login = require("../../LoginSecretaria/index.js");
    segunda = require("../../SegundoFator/index.js");
  });
  beforeEach(() => { poolFalso.liderancas = [linha]; poolFalso.chaves = []; poolFalso.desafios.length = 0; poolFalso.membro = { Nome: "Gabriela", Email: "gabriela@exemplo.org" }; });
  const contexto = () => ({ bindingData: {}, log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }) });

  test("senha errada: mensagem genérica, sem bilhete", async () => {
    const ctx = contexto();
    await login(ctx, reqCom("https://app.ieadespa.org.br", { body: { matricula: 12, senha: "errada" } }));
    expect(ctx.res.body).toEqual({ sucesso: false, mensagem: expect.stringMatching(/incorreta/) });
  });
  test("senha certa + chave cadastrada: devolve bilhete e opções da chave, SEM token", async () => {
    poolFalso.chaves = [{ ChaveId: 1, MembroId: 12, CredencialId: "cred-abc", ChavePublica: Buffer.from("pk").toString("base64url"), Apelido: "celular" }];
    const ctx = contexto();
    await login(ctx, reqCom("https://app.ieadespa.org.br", { body: { matricula: 12, senha: "Senha@Forte1" } }));
    expect(ctx.res.body.sucesso).toBe(true);
    expect(ctx.res.body.segundoFator).toBe("chave");
    expect(ctx.res.body.token).toBeUndefined();
    expect(ctx.res.body.opcoes.allowCredentials[0].id).toBe("cred-abc");
    expect(segundoFator.lerBilhete(ctx.res.body.bilhete)).toMatchObject({ membroId: 12, papelId: 3 });
    expect(ctx.res.body.podeCodigo).toBe(true);
  });
  test("senha certa, sem chave, com e-mail: manda o código e devolve bilhete (etapa 'codigo')", async () => {
    const { enviarEmailNotificacao } = require("../notificacaoEmail");
    enviarEmailNotificacao.mockClear();
    const ctx = contexto();
    await login(ctx, reqCom("https://app.ieadespa.org.br", { body: { matricula: 12, senha: "Senha@Forte1" } }));
    expect(ctx.res.body).toMatchObject({ sucesso: true, segundoFator: "codigo", emailMascarado: "g******@exemplo.org" });
    expect(ctx.res.body.token).toBeUndefined();
    expect(enviarEmailNotificacao).toHaveBeenCalledWith(expect.objectContaining({ email: "gabriela@exemplo.org" }));
    expect(enviarEmailNotificacao.mock.calls[0][0].mensagem).toMatch(/\d{6}/);
  });
  test("senha certa, sem chave e sem e-mail: entra com aviso (via NENHUM) — ninguém fica trancado fora", async () => {
    poolFalso.membro = { Nome: "Gabriela", Email: null };
    const ctx = contexto();
    await login(ctx, reqCom("https://app.ieadespa.org.br", { body: { matricula: 12, senha: "Senha@Forte1" } }));
    expect(ctx.res.body.sucesso).toBe(true);
    expect(typeof ctx.res.body.token).toBe("string");
    expect(ctx.res.body.fator).toBe("NENHUM");
    expect(ctx.res.body.avisoFator).toMatch(/chave de acesso/);
    const sessao = auth.getSessao(ctx.res.body.token);
    expect(sessao.fator.via).toBe("NENHUM");
    expect(sessao.via).toBe("SENHA");
    expect(segundoFator.fatorRecente(sessao)).toBe(false);
  });
  test("segunda etapa: bilhete inválido = 401; código certo conclui o login com fator CODIGO na sessão", async () => {
    const ctx1 = contexto(); ctx1.bindingData.acao = "codigo";
    await segunda(ctx1, reqCom("https://app.ieadespa.org.br", { body: { bilhete: "F.lixo.lixo", codigo: "123456" } }));
    expect(ctx1.res.status).toBe(401);
    // bilhete legítimo + código: o helper de código é o do membro (CodigosAcessoMembro); aqui o pool falso aceita o UPDATE/SELECT
    const codigoAcesso = require("../codigoAcesso");
    const confirmar = jest.spyOn(codigoAcesso, "confirmarCodigo").mockResolvedValueOnce({ valido: true });
    const bilhete = segundoFator.emitirBilhete({ membroId: 12, papelId: 3, escopoTipo: "AREA", escopoId: 1 });
    const ctx2 = contexto(); ctx2.bindingData.acao = "codigo";
    await segunda(ctx2, reqCom("https://app.ieadespa.org.br", { body: { bilhete, codigo: "123456" } }));
    expect(ctx2.res.body.sucesso).toBe(true);
    expect(auth.getSessao(ctx2.res.body.token).fator).toMatchObject({ via: "CODIGO" });
    expect(ctx2.res.body.fator).toBe("CODIGO");
    confirmar.mockRestore();
  });
  test("segunda etapa: bilhete de cargo que não existe mais = 401 (a linha é relida do banco)", async () => {
    const bilhete = segundoFator.emitirBilhete({ membroId: 12, papelId: 99, escopoTipo: "AREA", escopoId: 1 });
    const ctx = contexto(); ctx.bindingData.acao = "chave/opcoes";
    await segunda(ctx, reqCom("https://app.ieadespa.org.br", { body: { bilhete } }));
    expect(ctx.res.status).toBe(401);
  });
});

describe("confirmação reforçada (auth.exigirFatorRecente) — os quatro atos", () => {
  const auth = require("../auth");
  const tokenCom = (fator) => auth.reassinarSessao({ membroId: 5, termosPendentes: [], via: "SENHA", permissoes: ["permissoes"], nivel: "GLOBAL", escopoCongregacoes: "TODAS", ...(fator === undefined ? {} : { fator }) });
  const pedir = (token) => { const ctx = {}; const ok = auth.exigirFatorRecente({ headers: { "x-auth-token": token } }, ctx); return { ok, status: ctx.res && ctx.res.status, corpo: ctx.res && ctx.res.body }; };
  test("fator recente (chave ou código, < 10 min): passa", () => {
    expect(pedir(tokenCom({ via: "CHAVE", em: Date.now() - 60000 })).ok).toBe(true);
    expect(pedir(tokenCom({ via: "CODIGO", em: Date.now() - 9 * 60000 })).ok).toBe(true);
  });
  test("fator velho, ausente ou NENHUM: 428 com precisaFator (a tela confirma e repete)", () => {
    for (const f of [{ via: "CHAVE", em: Date.now() - 11 * 60000 }, undefined, { via: "NENHUM", em: Date.now() }]) {
      const r = pedir(tokenCom(f));
      expect(r.ok).toBe(false);
      expect(r.status).toBe(428);
      expect(r.corpo).toMatchObject({ sucesso: false, precisaFator: true });
    }
  });
  test("sem sessão: 401, não 428", () => {
    const r = pedir("");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });
});

describe("o banco aceita o canal FATOR na contagem de tentativas (migração 141)", () => {
  const fs = require("fs"), path = require("path");
  test("a restrição CK_AcessoTentativas_Canal passa a listar FATOR", () => {
    const migracoes = path.join(__dirname, "..", "..", "..", "sql", "migrations");
    const arq = fs.readdirSync(migracoes).find((n) => /canal_fator/.test(n));
    expect(arq).toBeTruthy();
    const sql = fs.readFileSync(path.join(migracoes, arq), "utf8");
    expect(sql).toMatch(/CHECK \(Canal IN \('PIN', 'SENHA', 'CODIGO', 'FATOR'\)\)/);
  });
});
