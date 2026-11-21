// FASE 10, v10.1b passo 4 (17/11/2026) — o PRÉ-CADASTRO, a FILA DE CADASTROS e a CONFERÊNCIA DO CPF ao digitar: as regras puras e as rotas (o banco simulado).
// O comportamento contra o SQL Server de verdade (o aceite automático, as travas, as corridas, o escopo) está no roteiro tools/e2e-localdb/e2e-90-pre-cadastro.js.
process.env.PRE_CADASTRO_SITE_MIN_MS = "0";   // o tempo mínimo da resposta do site (contra a medição do tempo) tem teste próprio abaixo
let mockPdb = {};
jest.mock("../preCadastroDb", () => {
  const real = jest.requireActual("../preCadastroDb");
  return new Proxy(real, { get: (alvo, nome) => (mockPdb[nome] !== undefined ? mockPdb[nome] : alvo[nome]) });
});
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const r = { input: () => r, query: async () => ({ recordset: [], recordsets: [[], []], rowsAffected: [0] }) }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => true), sha256: () => "" }));

const auth = require("../auth");
const regras = require("../preCadastro");
const hSite = require("../../PreCadastroSite/index.js");
const hFila = require("../../PreCadastros/index.js");
const hConf = require("../../ConferenciaCadastro/index.js");

const CPF = "52998224725";          // CPF de teste (dígitos válidos)
const HOJE = "2026-11-17";
const ENVIO = "0123456789abcdef0123456789abcdef";
const valido = (extra = {}) => ({ nome: "Maria Nova Teste", cpf: "529.982.247-25", email: "maria@example.org", telefone: "(00) 98888-7777", dataNascimento: "1990-05-10",
  sexo: "F", estadoCivil: "SOLTEIRO", congregacaoId: 2, consentimento: { aceito: true, versao: regras.CONSENTIMENTO.versao }, origemVisitante: "visitante-1", envioId: ENVIO, ...extra });
const contexto = (binding = {}) => ({ bindingData: binding, log: Object.assign(() => {}, { error() {}, info() {}, warn() {}, verbose() {} }) });
const cabecalhos = (extra = {}) => ({ "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000", ...extra });
async function chamar(h, { metodo = "POST", corpo = {}, query = {}, headers = {}, binding = {} } = {}) {
  const ctx = contexto(binding);
  await h(ctx, { method: metodo, body: corpo, query, headers: cabecalhos(headers) });
  return ctx.res;
}
const tokenDe = (extra) => auth.reassinarSessao({ membroId: 5, via: "SENHA", permissoes: ["pessoas"], escopoCongregacoes: ["Vila Nova"], nivel: "CONGREGACAO", termosPendentes: [], ...extra });
const tokenGeral = () => tokenDe({ membroId: 7, nivel: "GLOBAL", escopoCongregacoes: "TODAS" });
const tokenArea = () => tokenDe({ membroId: 8, nivel: "AREA", escopoCongregacoes: ["Vila Nova", "Monte Sião"] });
const tokenMembro = () => auth.reassinarSessao({ membroId: 9, via: "PIN", permissoes: [], escopoCongregacoes: [], termosPendentes: [] });

afterEach(() => { mockPdb = {}; delete process.env.CHAVE_SITE_SISTEMA; });

describe("as regras puras", () => {
  test("lerEntrada: o essencial válido passa e sai normalizado", () => {
    const r = regras.lerEntrada(valido(), { exigirTudo: true, hojeISO: HOJE });
    expect(r.ok).toBe(true);
    expect(r.dados).toEqual({ nome: "Maria Nova Teste", cpf: CPF, email: "maria@example.org", telefone: "00988887777", dataNascimento: "1990-05-10", sexo: "F", estadoCivil: "SOLTEIRO", congregacaoId: 2 });
  });
  test.each([
    [{ cpf: "123.456.789-00" }, /CPF não existe/], [{ cpf: "111.111.111-11" }, /CPF não existe/], [{ email: "maria@" }, /E-mail/], [{ telefone: "9888" }, /DDD/],
    [{ dataNascimento: "2030-01-01" }, /fora do possível/], [{ dataNascimento: "1990-02-30" }, /inválida/], [{ sexo: "X" }, /Sexo/], [{ estadoCivil: "NOIVO" }, /Estado civil/],
    [{ congregacaoId: "abc" }, /Congregação/], [{ nome: "<script>" }, /caracteres/], [{ nome: "A" }, /nome completo/]
  ])("lerEntrada recusa %j", (troca, msg) => {
    const r = regras.lerEntrada(valido(troca), { hojeISO: HOJE });
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(msg);
  });
  test("o site exige tudo (menos o telefone); o líder pode mandar faltando (vira pendência)", () => {
    expect(regras.lerEntrada(valido({ cpf: "", estadoCivil: null }), { exigirTudo: true, hojeISO: HOJE })).toMatchObject({ ok: false, mensagem: expect.stringMatching(/Preencha: CPF, estado civil/) });
    expect(regras.lerEntrada(valido({ telefone: "" }), { exigirTudo: true, hojeISO: HOJE }).ok).toBe(true);
    const lider = regras.lerEntrada({ nome: "Pedro Visitante", congregacaoId: 2 }, { hojeISO: HOJE });
    expect(lider.ok).toBe(true);
    expect(regras.pendenciasSemBanco(lider.dados, { hojeISO: HOJE })).toEqual(["FALTA_CPF", "FALTA_EMAIL", "FALTA_NASCIMENTO", "FALTA_SEXO", "FALTA_ESTADO_CIVIL"]);
  });
  test("menor de 18 anos não entra sozinho, até a secretaria confirmar o responsável", () => {
    const d = regras.lerEntrada(valido({ dataNascimento: "2012-01-01" }), { hojeISO: HOJE }).dados;
    expect(regras.pendenciasSemBanco(d, { hojeISO: HOJE })).toEqual(["MENOR_DE_IDADE"]);
    expect(regras.pendenciasSemBanco(d, { hojeISO: HOJE, responsavelConfirmado: true })).toEqual([]);
    expect(regras.idadeEm("2008-11-18", HOJE)).toBe(17);
    expect(regras.idadeEm("2008-11-17", HOJE)).toBe(18);
  });
  test("nomes parecidos: iguais (sem acento, sem 'de/da'), ou o mesmo primeiro e último nome", () => {
    expect(regras.nomesParecidos("Ana Beatriz Moreira", "ana beatriz moreira")).toBe(true);
    expect(regras.nomesParecidos("José da Silva", "Jose Silva")).toBe(true);
    expect(regras.nomesParecidos("Ana Moreira", "Ana Beatriz Moreira")).toBe(true);
    expect(regras.nomesParecidos("Ana Moreira", "Ana Souza")).toBe(false);
  });
  test("as pendências guardadas no banco: só os códigos conhecidos", () => {
    expect(regras.lerPendencias("FALTA_CPF, CPF_REPETIDO,XPTO,,")).toEqual(["FALTA_CPF", "CPF_REPETIDO"]);
  });
});

describe("o formulário do site (PreCadastroSite)", () => {
  const comChave = () => { process.env.CHAVE_SITE_SISTEMA = "chave-do-site-teste"; return { "x-site-key": "chave-do-site-teste" }; };
  // gravado: o que a gravação do site devolve (o pré-cadastro novo; o mesmo envio repetido; o limite)
  const preparar = (resultado, gravado = { id: 501, repetido: false, avaliado: false }) => {
    const chamadas = { inserir: 0, processar: 0, opcoesGravar: null, opcoesProcessar: null };
    mockPdb.lerCongregacao = async () => ({ congregacaoId: 2, nome: "Vila Nova", areaId: 1, ativa: true });
    mockPdb.inserirDoSite = async (_pool, _dados, opcoes) => { chamadas.inserir++; chamadas.opcoesGravar = opcoes; return gravado; };
    mockPdb.processar = async (_pool, _id, opcoes) => { chamadas.processar++; chamadas.opcoesProcessar = opcoes; return resultado; };
    return chamadas;
  };
  test("FALHA FECHADA: sem a chave combinada configurada, ou com a chave errada, 401", async () => {
    expect((await chamar(hSite, { corpo: valido() })).status).toBe(401);
    comChave();
    expect((await chamar(hSite, { corpo: valido(), headers: { "x-site-key": "errada" } })).status).toBe(401);
  });
  test("a resposta é a MESMA quer o CPF seja novo (entrou sozinho), quer já tenha ficha (correção) — nunca revela quem já é da Igreja", async () => {
    const h = comChave();
    preparar({ sucesso: true, situacao: "ACEITO", matricula: 700999 });
    const novo = await chamar(hSite, { corpo: valido(), headers: h });
    preparar({ sucesso: true, situacao: "CORRECAO", pendencias: ["CPF_REPETIDO"] });
    const repetido = await chamar(hSite, { corpo: valido(), headers: h });
    preparar({ sucesso: true, situacao: "PENDENTE", pendencias: ["POSSIVEL_REPETICAO"] });
    const parecido = await chamar(hSite, { corpo: valido(), headers: h });
    expect(novo).toEqual(repetido);
    expect(novo).toEqual(parecido);
    expect(novo.status).toBe(200);
    expect(novo.body).toEqual({ sucesso: true, mensagem: regras.MSG.RECEBIDO });
    expect(JSON.stringify(novo.body)).not.toMatch(/700999|matr/i);
  });
  // (a) revisão de 20/11/2026: o tempo da resposta revelava a ficha quando o aceite automático passava do mínimo. Agora o tempo é FIXO, o processamento
  // fica dentro da chamada (nada para depois da resposta) e, se passar do tempo fixo, a resposta sai no próximo múltiplo dele.
  test("o TEMPO também não revela: a correção (rápida), o aceite com a ficha nova (demorado) e o reenvio saem no MESMO tempo fixo", async () => {
    const h = comChave();
    process.env.PRE_CADASTRO_SITE_MIN_MS = "400";
    const medir = async () => { const t = Date.now(); await chamar(hSite, { corpo: valido(), headers: h }); return Date.now() - t; };
    try {
      preparar({ sucesso: true, situacao: "CORRECAO", pendencias: ["CPF_REPETIDO"] });
      const rapido = await medir();
      preparar(null);
      mockPdb.processar = async () => { await new Promise((r) => setTimeout(r, 250)); return { sucesso: true, situacao: "ACEITO", matricula: 1 }; };
      const demorado = await medir();
      preparar(null, { id: 501, repetido: true, avaliado: true });
      const reenvio = await medir();
      for (const ms of [rapido, demorado, reenvio]) { expect(ms).toBeGreaterThanOrEqual(395); expect(ms).toBeLessThan(560); }
      expect(Math.max(rapido, demorado, reenvio) - Math.min(rapido, demorado, reenvio)).toBeLessThan(120);
    } finally { process.env.PRE_CADASTRO_SITE_MIN_MS = "0"; }
  });
  test("o processamento que passa do tempo fixo: a resposta sai no próximo MÚLTIPLO dele (nunca no tempo exato do processamento) e fica o aviso", async () => {
    const h = comChave();
    process.env.PRE_CADASTRO_SITE_MIN_MS = "200";
    const avisos = [];
    try {
      preparar(null);
      mockPdb.processar = async () => { await new Promise((r) => setTimeout(r, 260)); return { sucesso: true, situacao: "ACEITO", matricula: 1 }; };
      const ctx = { bindingData: {}, log: Object.assign(() => {}, { error() {}, info() {}, verbose() {}, warn: (m) => avisos.push(m) }) };
      const t = Date.now();
      await hSite(ctx, { method: "POST", body: valido(), query: {}, headers: cabecalhos(h) });
      const ms = Date.now() - t;
      expect(ctx.res.body).toEqual({ sucesso: true, mensagem: regras.MSG.RECEBIDO });
      expect(ms).toBeGreaterThanOrEqual(395);
      expect(ms).toBeLessThan(520);
      expect(avisos.join(" ")).toMatch(/mais que o tempo fixo de 200 ms: a resposta saiu em 400 ms/);
    } finally { process.env.PRE_CADASTRO_SITE_MIN_MS = "0"; }
  });
  test("o processamento espera a trava do CPF só até o que sobra do tempo fixo (menos a folga), e nada fica para depois da resposta", async () => {
    const h = comChave();
    process.env.PRE_CADASTRO_SITE_MIN_MS = "1000";
    try {
      let terminou = false;
      const ch = preparar(null);
      mockPdb.processar = async (_p, _id, opcoes) => { ch.opcoesProcessar = opcoes; await new Promise((r) => setTimeout(r, 50)); terminou = true; return { sucesso: true, situacao: "ACEITO" }; };
      await chamar(hSite, { corpo: valido(), headers: h });
      expect(terminou).toBe(true);   // a resposta só saiu depois do processamento
      expect(ch.opcoesProcessar.esperaMaxMs).toBeGreaterThan(500);
      expect(ch.opcoesProcessar.esperaMaxMs).toBeLessThanOrEqual(700);
    } finally { process.env.PRE_CADASTRO_SITE_MIN_MS = "0"; }
  });
  test("o processamento que falha não muda a resposta (o pré-cadastro já está gravado e a fila o mostra)", async () => {
    const h = comChave();
    preparar(null);
    mockPdb.processar = async () => { throw new Error("trava do pré-cadastro não obtida a tempo"); };
    const r = await chamar(hSite, { corpo: valido(), headers: h });
    expect(r.body).toEqual({ sucesso: true, mensagem: regras.MSG.RECEBIDO });
  });
  test("campo que falta, consentimento ausente ou de versão antiga, congregação inválida: 400 (só a forma)", async () => {
    const h = comChave();
    const ch = preparar({ sucesso: true, situacao: "ACEITO", matricula: 1 });
    expect((await chamar(hSite, { corpo: valido({ email: "" }), headers: h })).status).toBe(400);
    expect((await chamar(hSite, { corpo: valido({ consentimento: undefined }), headers: h })).body.mensagem).toMatch(/concorda/);
    expect((await chamar(hSite, { corpo: valido({ consentimento: { aceito: true, versao: "2020-01" } }), headers: h })).body.mensagem).toMatch(/recarregue/);
    expect((await chamar(hSite, { corpo: valido({ origemVisitante: "x".repeat(200) }), headers: h })).status).toBe(400);
    mockPdb.lerCongregacao = async () => ({ congregacaoId: 2, nome: "Fechada", ativa: false });
    expect((await chamar(hSite, { corpo: valido(), headers: h })).body.mensagem).toMatch(/congregação da lista/);
    expect(ch.inserir).toBe(0);
  });
  test("(c) sem o identificador do envio, ou fora do formato: 400 'recarregue', sem chegar ao banco", async () => {
    const h = comChave();
    const ch = preparar({ sucesso: true, situacao: "ACEITO", matricula: 1 });
    for (const e of [undefined, null, "", 123, "abc", "0123456789ABCDEF0123456789ABCDEF", `${ENVIO}0`, ["x"], { a: 1 }]) {
      const r = await chamar(hSite, { corpo: valido({ envioId: e }), headers: h });
      expect(r.status).toBe(400);
      expect(r.body.mensagem).toMatch(/recarregue/);
    }
    expect(ch.inserir).toBe(0);
  });
  test("(c) o mesmo envio repetido: a mesma resposta, sem gravar de novo; avaliado, não processa outra vez; sem avaliar (o 1º caiu no meio), avalia agora", async () => {
    const h = comChave();
    const ch1 = preparar({ sucesso: true, situacao: "ACEITO" });
    const primeiro = await chamar(hSite, { corpo: valido(), headers: h });
    expect(ch1.opcoesGravar.envioId).toBe(ENVIO);
    const ch2 = preparar({ sucesso: true, situacao: "ACEITO" }, { id: 501, repetido: true, avaliado: true });
    const repetido = await chamar(hSite, { corpo: valido(), headers: h });
    expect(repetido).toEqual(primeiro);
    expect(ch2.processar).toBe(0);
    const ch3 = preparar({ sucesso: true, situacao: "ACEITO" }, { id: 501, repetido: true, avaliado: false });
    expect(await chamar(hSite, { corpo: valido(), headers: h })).toEqual(primeiro);
    expect(ch3.processar).toBe(1);
  });
  test("(b) limites: 3 por hora do mesmo visitante e 200 por hora no total, contados junto com a gravação → 429, sem processar", async () => {
    const h = comChave();
    const ch = preparar({ sucesso: true, situacao: "ACEITO", matricula: 1 }, { limite: true });
    const r = await chamar(hSite, { corpo: valido(), headers: h });
    expect(r.status).toBe(429);
    expect(r.headers["Retry-After"]).toBe("600");
    expect(ch.processar).toBe(0);
    expect(ch.opcoesGravar).toMatchObject({ porVisitanteHora: 3, totalHora: 200, consentimento: regras.CONSENTIMENTO });
    expect(ch.opcoesGravar.origemHash).toMatch(/^[0-9a-f]{16}$/);
  });
  test("a gravação que falha (banco fora): 500, sem 'recebemos' falso", async () => {
    const h = comChave();
    preparar({ sucesso: true });
    mockPdb.inserirDoSite = async () => { throw new Error("trava do pré-cadastro não obtida a tempo"); };
    const r = await chamar(hSite, { corpo: valido(), headers: h });
    expect(r.status).toBe(500);
    expect(r.body.sucesso).toBe(false);
  });
});

describe("(d) o consentimento: o texto e a versão do mesmo lugar", () => {
  const crypto = require("crypto");
  const fs = require("fs");
  const path = require("path");
  test("o GET serve o texto e a versão (os de shared/preCadastro.js)", async () => {
    process.env.CHAVE_SITE_SISTEMA = "chave-do-site-teste";
    const r = await chamar(hSite, { metodo: "GET", headers: { "x-site-key": "chave-do-site-teste" } });
    expect(r.status).toBe(200);
    expect(r.body.consentimento).toEqual({ versao: regras.CONSENTIMENTO.versao, texto: regras.CONSENTIMENTO.texto });
  });
  test("o texto de cada versão é fixo: mudou o texto, crie uma versão nova (e ponha o resumo novo aqui)", () => {
    const resumo = crypto.createHash("sha256").update(regras.CONSENTIMENTO.texto, "utf8").digest("hex");
    const RESUMOS = { "2026-11": "091d0852ddc28571f100b9ee894be8e046559c359e20321ea7e006eb6191065b" };
    expect(RESUMOS[regras.CONSENTIMENTO.versao]).toBe(resumo);
    expect(Object.isFrozen(regras.CONSENTIMENTO)).toBe(true);
  });
  test("a página do site não tem mais o texto escrito nela: mostra o que o sistema serve", () => {
    const pagina = fs.readFileSync(path.join(__dirname, "../../../site/src/pages/quero-me-cadastrar.astro"), "utf8");
    expect(pagina).not.toContain("Autorizo a Igreja a guardar");
    expect(pagina).toMatch(/mostrarTermo\(form\.querySelector\("\[data-qc-termo\]"\), termo\)/);
    expect(pagina).toMatch(/versao = j\.consentimento\.versao/);
  });
});

describe("a fila (PreCadastros)", () => {
  const linha = (extra = {}) => ({ PreCadastroId: 77, Origem: "SITE", CriadoPor: null, CongregacaoId: 2, CongregacaoNome: "Vila Nova", Nome: "Maria Nova", CpfMascarado: "***.982.247-**",
    Email: "maria@example.org", Telefone: null, DataNascimento: "1990-05-10", Sexo: "F", EstadoCivil: "SOLTEIRO", Situacao: "CORRECAO", Pendencias: "CPF_REPETIDO",
    MembroIdResultado: null, MembroIdRepetido: 700100, RepetidoNome: "Maria Antiga", RepetidoCongregacao: "Bairro da Paz", RepetidoExtensao: null, PreCadastroRepetidoId: null,
    ResponsavelConfirmado: false, RepeticaoConferida: false, CriadoEm: new Date(), Versao: "1234", ...extra });
  test("sem sessão: 401", async () => {
    expect((await chamar(hFila, { metodo: "GET" })).status).toBe(401);
  });
  test("quem não é secretaria, nem professor da EBD, nem liderança da congregação não lança (403)", async () => {
    mockPdb.lerCongregacao = async () => ({ congregacaoId: 2, nome: "Vila Nova", ativa: true });
    mockPdb.origemDeQuemLanca = async () => null;
    const r = await chamar(hFila, { corpo: { nome: "Pedro", congregacaoId: 2, consentimentoDaPessoa: true }, headers: { "x-auth-token": tokenMembro() } });
    expect(r.status).toBe(403);
  });
  test("o professor/líder que lançou NÃO fica sabendo do CPF repetido: vê só 'na fila' e os campos que faltam", async () => {
    mockPdb.lerCongregacao = async () => ({ congregacaoId: 2, nome: "Vila Nova", ativa: true });
    mockPdb.origemDeQuemLanca = async () => "LIDER";
    mockPdb.inserir = async () => 88;
    mockPdb.processar = async () => ({ sucesso: true, situacao: "CORRECAO", pendencias: ["CPF_REPETIDO", "FALTA_EMAIL"] });
    const r = await chamar(hFila, { corpo: { nome: "Pedro Novo", cpf: CPF, congregacaoId: 2, consentimentoDaPessoa: true }, headers: { "x-auth-token": tokenMembro() } });
    expect(r.body).toMatchObject({ sucesso: true, situacao: "NA_FILA", preCadastroId: 88 });
    expect(r.body.pendencias.map((p) => p.codigo)).toEqual(["FALTA_EMAIL"]);
    expect(JSON.stringify(r.body)).not.toMatch(/REPETID|CORRECAO|já tem cadastro/i);
  });
  test("sem a confirmação de que a pessoa concordou, não lança", async () => {
    mockPdb.lerCongregacao = async () => ({ congregacaoId: 2, nome: "Vila Nova", ativa: true });
    mockPdb.origemDeQuemLanca = async () => "LIDER";
    let inseriu = false;
    mockPdb.inserir = async () => { inseriu = true; return 1; };
    const r = await chamar(hFila, { corpo: { nome: "Pedro Novo", congregacaoId: 2 }, headers: { "x-auth-token": tokenMembro() } });
    expect(r.body.sucesso).toBe(false);
    expect(inseriu).toBe(false);
  });
  test("a ficha repetida aparece (matrícula e nome) só para quem a alcança; para os outros, só 'foi à Secretaria Geral'", () => {
    const pdb = jest.requireActual("../preCadastroDb");
    const vLocal = { membroId: 5, permissoes: ["pessoas"], nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"] };
    const vGeral = { membroId: 7, permissoes: ["pessoas"], nivel: "GLOBAL", escopoCongregacoes: "TODAS" };
    const paraLocal = pdb.mapear(linha(), vLocal);
    expect(paraLocal.repetido).toEqual({ foraDoEscopo: true, mensagem: regras.MSG.CPF_FORA_DO_ESCOPO });
    expect(JSON.stringify(paraLocal)).not.toMatch(/700100|Maria Antiga|Bairro da Paz/);
    expect(pdb.mapear(linha(), vGeral).repetido).toEqual({ matricula: 700100, nome: "Maria Antiga", congregacao: "Bairro da Paz" });
    expect(pdb.mapear(linha({ RepetidoCongregacao: "Vila Nova" }), vLocal).repetido).toMatchObject({ matricula: 700100 });
  });
  test("a área acompanha (vê) mas não completa, aceita nem descarta (403); a local e a Geral resolvem", async () => {
    mockPdb.lerPreCadastro = async () => linha({ Situacao: "PENDENTE", Pendencias: "FALTA_EMAIL", MembroIdRepetido: null });
    mockPdb.descartar = async () => ({ sucesso: true, situacao: "DESCARTADO" });
    const area = await chamar(hFila, { corpo: { motivo: "teste" }, binding: { id: "77", acao: "descartar" }, headers: { "x-auth-token": tokenArea() } });
    expect(area.status).toBe(403);
    const vista = await chamar(hFila, { metodo: "GET", binding: { id: "77" }, headers: { "x-auth-token": tokenArea() } });
    expect(vista.body.sucesso).toBe(true);
    expect(vista.body.preCadastro.podeResolver).toBe(false);
    const local = await chamar(hFila, { corpo: { motivo: "teste" }, binding: { id: "77", acao: "descartar" }, headers: { "x-auth-token": tokenDe() } });
    expect(local.body.sucesso).toBe(true);
  });
  test("fora do escopo: a mesma resposta de 'não existe'", async () => {
    mockPdb.lerPreCadastro = async () => linha({ CongregacaoNome: "Jardim Real", Situacao: "PENDENTE" });
    const r = await chamar(hFila, { metodo: "GET", binding: { id: "77" }, headers: { "x-auth-token": tokenDe() } });
    expect(r.body).toEqual({ sucesso: false, mensagem: regras.MSG.NAO_EXISTE });
  });
  test("aceitar com pendência que falta: recusa e mostra o que falta", async () => {
    mockPdb.lerPreCadastro = async () => linha({ Situacao: "PENDENTE", Pendencias: "FALTA_EMAIL", MembroIdRepetido: null });
    mockPdb.processar = async () => ({ sucesso: true, situacao: "PENDENTE", pendencias: ["FALTA_EMAIL"] });
    const r = await chamar(hFila, { corpo: {}, binding: { id: "77", acao: "aceitar" }, headers: { "x-auth-token": tokenDe() } });
    expect(r.body).toMatchObject({ sucesso: false, mensagem: regras.MSG.SEM_PENDENCIA_PARA_ACEITAR });
  });
});

describe("a conferência ao digitar (ConferenciaCadastro)", () => {
  test("sem a permissão de pessoas: 401/403", async () => {
    expect((await chamar(hConf, { binding: { acao: "conferir" }, corpo: { cpf: CPF } })).status).toBe(401);
  });
  test("os casos e o resolver são só da Secretaria Geral", async () => {
    expect((await chamar(hConf, { metodo: "GET", binding: { acao: "casos" }, headers: { "x-auth-token": tokenDe() } })).status).toBe(403);
    mockPdb.listarCasos = async () => [];
    expect((await chamar(hConf, { metodo: "GET", binding: { acao: "casos" }, headers: { "x-auth-token": tokenGeral() } })).body).toEqual({ sucesso: true, casos: [] });
  });
  test("a conferência tem limite por pessoa (não vira buscador de quem é da Igreja): a 41ª no minuto é 429", async () => {
    mockPdb.conferir = async () => ({ cpf: { situacao: "LIVRE" }, parecidos: [], bloqueia: false });
    const token = tokenDe({ membroId: 4242 });
    let ultimo;
    for (let i = 0; i < 41; i++) ultimo = await chamar(hConf, { binding: { acao: "conferir" }, corpo: { cpf: CPF }, headers: { "x-auth-token": token } });
    expect(ultimo.status).toBe(429);
  });
});
