// As rotas do check-in infantil (v7.10) com o handler de verdade e o banco simulado pelo TEXTO da consulta: a porta de cada ação (sem sessão, PIN, sala alheia, liderança fora
// do escopo), o 403 ANTES de qualquer busca de dado de criança, a confirmação reforçada (428), os identificadores como o HTTP os entrega (TEXTO), o Cache-Control: no-store em
// toda resposta e a recusa de regra como 422. O comportamento contra o SQL Server (transações, gatilhos, corridas) é coberto pelos roteiros ponta a ponta (tools/e2e-localdb).
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
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => undefined), sha256: () => "" }));
jest.mock("../segredoSessao", () => ({ resolverSegredo: () => "segredo-de-teste-com-mais-de-16-caracteres" }));
jest.mock("../financeiroSeguro", () => ({ ...jest.requireActual("../financeiroSeguro"), obterTrava: jest.fn(async () => true) }));
jest.mock("../canaisDb", () => ({ ...jest.requireActual("../canaisDb"), notificarAgora: jest.fn(async () => ({ criadas: 1, externas: 1 })), lerPrazoDias: jest.fn(async (_p, _s, padrao) => padrao) }));
jest.mock("../ministerioMenoresDb", () => ({
  aptidaoDe: jest.fn(async () => ({ apto: true, contaComoAdulto: true, bloqueios: [] })),
  aptidaoEmLote: jest.fn(async (_p, ids) => new Map(ids.map((i) => [Number(i), { apto: true, contaComoAdulto: true, bloqueios: [] }]))),
  lerPrazos: jest.fn(async () => ({ adultosMinimos: 2 })), lerPrazosFaixas: jest.fn(async () => ({}))
}));
jest.mock("../menoresConsentimentoDb", () => ({ consentimentoVigente: jest.fn(async () => false) }));
jest.mock("../psc", () => ({ ...jest.requireActual("../psc"), resolverDestinatariosDaCongregacao: jest.fn(async () => []) }));

const auth = require("../auth");
const mc = require("../menoresConsentimento");
const ck = require("../checkinInfantil");
const handler = require("../../GestaoCheckinInfantil/index.js");

const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const COM_FATOR = { via: "CHAVE", em: Date.now() };
const GERAL = (permissoes, id = 1, fator = COM_FATOR) => tokenDe(id, { via: "SENHA", fator, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes });
const LOCAL = (permissoes, escopo = ["Central"], id = 5, fator = COM_FATOR) => tokenDe(id, { via: "SENHA", fator, nivel: "CONGREGACAO", escopoCongregacoes: escopo, permissoes });
const PIN = (id = 10) => tokenDe(id, { via: "PIN" });
async function chamar(acao, { metodo = "GET", query = {}, corpo = {}, token, headers = {} } = {}) {
  const context = { bindingData: { acao }, log: { error(...a) { if (process.env.VER_ERRO) console.error(...a); }, info() { }, warn() { }, verbose() { } } };
  const qs = {}; for (const [k, v] of Object.entries(query)) qs[k] = v == null ? v : String(v);   // a query string chega SEMPRE em texto
  await handler(context, { method: metodo, query: qs, body: corpo, headers: token ? { "x-auth-token": token, ...headers } : headers });
  return context.res;
}
const escritas = () => mockConsultas.filter((c) => /^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.test(c.sql));
const com = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));

beforeEach(() => { mockRegras = []; mockConsultas = []; jest.clearAllMocks(); });

const GETS = ["catalogos", "minhas-salas", "meus-filhos", "historico", "autorizados", "saude", "sala", "buscar", "responsaveis", "relatorio"];
const POSTS = ["autorizado-adicionar", "autorizado-revogar", "saude-gravar", "saude-apagar", "entrar-na-sala", "sair-da-sala", "checkin", "retirar", "segunda-via-pedir", "segunda-via-confirmar", "decidir-divergencia", "destravar", "encerrar-sala"];
const CORPO_SALA = { servicoId: 5, equipeId: 7 };

describe("a porta de todas as rotas", () => {
  test("sem sessão: 401 em TODAS as ações, e nada é consultado", async () => {
    for (const a of GETS) expect((await chamar(a)).status).toBe(401);
    for (const a of POSTS) expect((await chamar(a, { metodo: "POST" })).status).toBe(401);
    expect(mockConsultas).toHaveLength(0);
  });
  test("token adulterado ou lixo: 401", async () => {
    for (const t of ["lixo", PIN() + "x", "a.b.c"]) expect((await chamar("minhas-salas", { token: t })).status).toBe(401);
  });
  test("TODA resposta leva Cache-Control: no-store (o check-in e a segunda via trazem o código)", async () => {
    const respostas = [
      await chamar("catalogos", { token: PIN() }), await chamar("nao-existe", { token: PIN() }), await chamar("minhas-salas", { token: PIN() }),
      await chamar("checkin", { metodo: "POST", token: PIN(), corpo: {} }), await chamar("sala", { token: PIN(), query: { servicoId: "x" } }),
      await chamar("checkin", { metodo: "DELETE", token: PIN() }),
      // até a recusa por falta de sessão (achado na prova no banco real: o 401 saía sem o cabeçalho)
      await chamar("sala", { query: CORPO_SALA }), await chamar("checkin", { metodo: "POST" }), await chamar("sala", { token: "lixo", query: CORPO_SALA })
    ];
    for (const r of respostas) expect(r.headers).toMatchObject({ "Cache-Control": "no-store" });
  });
  test("as ações da liderança respondem 403 ANTES de qualquer consulta para PIN, sem a permissão ou com ela no escopo errado... e a ficha assinada também", async () => {
    const intrusos = [PIN(), PIN(1), GERAL(["pessoas"]), LOCAL(["pessoas"]), GERAL(["vistoria_antecedentes", "protecao_menores"])];
    for (const t of intrusos) {
      for (const acao of ["decidir-divergencia", "destravar"]) {
        const r = await chamar(acao, { metodo: "POST", token: t, corpo: { registroId: 9, aprovar: true, motivo: "Confirmado pelo telefone." } });
        expect(r.status).toBe(403);
      }
      expect((await chamar("encerrar-sala", { metodo: "POST", token: t, corpo: { ...CORPO_SALA, motivo: "Ficou na sala depois do culto." } })).status).toBe(403);
      expect((await chamar("autorizado-adicionar", { metodo: "POST", token: t, corpo: { menorId: 30, nome: "Dona Lúcia", parentesco: "AVO", ficha: true, referencia: "Ficha 3" } })).status).toBe(403);
      expect((await chamar("saude-gravar", { metodo: "POST", token: t, corpo: { menorId: 30, texto: "asma", ficha: true, referencia: "Ficha 3" } })).status).toBe(403);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("o PIN de quem TEM a permissão nunca vale como liderança (sessão de membro)", async () => {
    const pinComPermissao = tokenDe(1, { via: "PIN", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["habilitacao_voluntarios"] });
    expect((await chamar("decidir-divergencia", { metodo: "POST", token: pinComPermissao, corpo: { registroId: 9, aprovar: true, motivo: "Confirmado pelo telefone." } })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("decidir a retirada divergente pede a confirmação reforçada recente (428), mesmo para a liderança do escopo", async () => {
    const semFator = LOCAL(["habilitacao_voluntarios"], ["Central"], 5, null);      // null (undefined cairia no valor padrão, que TEM o fator)
    quando(/FROM CheckinInfantilRegistros r\s+LEFT JOIN MembroReferencia m/, [{ RegistroId: 9, ServicoId: 5, EquipeId: 7, Situacao: "RETIRADA_PENDENTE", RetiradoPorOperadorId: 10, CriancaNome: "Caio Souza" }]);
    quando(/FROM EscalasServicos s\s+JOIN EscalasEquipes e ON e\.EquipeId = @e/, [{ ServicoId: 5, EquipeId: 7, EquipeNome: "Maternal", FaixaEtariaMenores: "MATERNAL", ContatoComMenores: 1, Ativa: 1, CongregacaoId: 1, CongregacaoNome: "Central", DataHora: new Date("2026-10-18T09:00:00Z"), ServicoStatus: "PUBLICADA" }]);
    const r = await chamar("decidir-divergencia", { metodo: "POST", token: semFator, corpo: { registroId: 9, aprovar: true, motivo: "Confirmado pelo telefone." } });
    expect(r.status).toBe(428);
    expect(escritas()).toHaveLength(0);
  });
  test("a liderança de OUTRA congregação não decide nem destrava: a resposta é a mesma de 'não existe' (404)", async () => {
    quando(/FROM CheckinInfantilRegistros r\s+LEFT JOIN MembroReferencia m/, [{ RegistroId: 9, ServicoId: 5, EquipeId: 7, Situacao: "RETIRADA_PENDENTE", RetiradoPorOperadorId: 10, CriancaNome: "Caio Souza" }]);
    quando(/FROM EscalasServicos s\s+JOIN EscalasEquipes e ON e\.EquipeId = @e/, [{ ServicoId: 5, EquipeId: 7, EquipeNome: "Maternal", FaixaEtariaMenores: "MATERNAL", ContatoComMenores: 1, Ativa: 1, CongregacaoId: 1, CongregacaoNome: "Central", DataHora: new Date("2026-10-18T09:00:00Z"), ServicoStatus: "PUBLICADA" }]);
    const alheia = LOCAL(["habilitacao_voluntarios"], ["Vila"]);
    const a = await chamar("destravar", { metodo: "POST", token: alheia, corpo: { registroId: 9 } });
    const b = await chamar("destravar", { metodo: "POST", token: alheia, corpo: { registroId: 999 } });
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(a.body).toEqual(b.body);
    expect(escritas()).toHaveLength(0);
  });
  test("as rotas dos próprios filhos e o catálogo valem para qualquer login, inclusive PIN", async () => {
    for (const acao of ["catalogos", "minhas-salas", "meus-filhos", "historico"]) expect((await chamar(acao, { token: PIN() })).status).toBe(200);
  });
  test("método estranho ou ação inválida: nunca executa nada", async () => {
    expect((await chamar("minhas-salas", { metodo: "DELETE", token: PIN() })).status).toBe(405);
    expect((await chamar("nao-existe", { token: PIN() })).status).toBe(404);
    expect((await chamar("nao-existe", { metodo: "POST", token: PIN() })).status).toBe(404);
    expect(escritas()).toHaveLength(0);
  });
});

describe("identificadores: estritos, como o HTTP os entrega", () => {
  const ruins = ["0x10", "1e1", "abc", "-1", "0", "1.5", " ", "05", " 5", "99999999999999999999", "1; DROP TABLE Membros", "<script>"];
  test("servicoId, equipeId, menorId, registroId, membroId e autorizadoId malformados são 400, sem tocar o banco", async () => {
    for (const campo of ["servicoId", "equipeId", "menorId", "registroId", "membroId", "autorizadoId"]) for (const v of ruins) {
      expect((await chamar("checkin", { metodo: "POST", token: PIN(), corpo: { ...CORPO_SALA, [campo]: v } })).status).toBe(400);
      expect((await chamar("sala", { token: PIN(), query: { ...CORPO_SALA, [campo]: v } })).status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
});

describe("a sala (porta e leitura)", () => {
  const SALA_BANCO = { ServicoId: 5, EquipeId: 7, EquipeNome: "Maternal", FaixaEtariaMenores: "MATERNAL", LiderMembroId: 600, ContatoComMenores: 1, Ativa: 1, CongregacaoId: 1, CongregacaoNome: "Central", DataHora: new Date("2026-10-18T09:00:00Z"), ServicoStatus: "PUBLICADA" };
  const sala = (extra = {}) => quando(/FROM EscalasServicos s\s+JOIN EscalasEquipes e ON e\.EquipeId = @e/, [{ ...SALA_BANCO, ...extra }]);
  const escalado = (sim) => quando(/FROM EscalasAlocacoes WHERE ServicoId = @s AND EquipeId = @e AND MembroId = @m AND Status IN/, sim ? [{ x: 1 }] : []);

  // Achado na prova no banco real (e2e-20): "não existe" e "não é seu" tinham respostas DIFERENTES (404 e 403), e a marca da equipe também aparecia (422): três sondas para quem só tem um login.
  test("sala que não existe, sala sem relação com a pessoa e equipe sem a marca (para quem não é dela): a MESMA resposta (404), nunca dado", async () => {
    const naoExiste = await chamar("sala", { token: PIN(), query: CORPO_SALA });
    expect(naoExiste.status).toBe(404);
    mockRegras = []; sala({ ContatoComMenores: 0 }); escalado(false);
    const semMarcaDeOutro = await chamar("sala", { token: PIN(), query: CORPO_SALA });
    expect(semMarcaDeOutro.status).toBe(404);
    expect(semMarcaDeOutro.body).toEqual(naoExiste.body);
    mockRegras = []; sala(); escalado(false);
    const existeSemRelacao = await chamar("sala", { token: PIN(), query: CORPO_SALA });
    expect(existeSemRelacao.status).toBe(404);
    expect(existeSemRelacao.body).toEqual(naoExiste.body);
    expect(com(/FROM CheckinInfantilRegistros r\s+LEFT JOIN/)).toHaveLength(0);
  });
  test("quem é da sala: equipe sem a marca é dita ao ENTRAR e ao fazer check-in (422), mas ler a sala e sair dela continuam valendo (a criança que está dentro não fica presa)", async () => {
    sala({ ContatoComMenores: 0 }); escalado(true);
    for (const [acao, metodo, dados] of [["entrar-na-sala", "POST", CORPO_SALA], ["checkin", "POST", { ...CORPO_SALA, criancas: [{ visitante: { nome: "Davi Lima", nascimento: "2021-03-02" } }], trouxe: { nome: "Paula Lima", parentesco: "MAE", documento: "RG", contato: "94991112222" } }]]) {
      const r = await chamar(acao, { metodo, token: PIN(10), corpo: dados });
      expect(r.status).toBe(422);
      expect(r.body.mensagem).toBe(ck.MENSAGENS.SALA_SEM_MARCA);
    }
    expect((await chamar("sala", { token: PIN(10), query: CORPO_SALA })).status).toBe(200);
    // o relatório do dia é ATO DE GESTÃO (revisão da v7.10): o voluntário da sala não o lê; a liderança do escopo sim
    expect((await chamar("relatorio", { token: PIN(10), query: CORPO_SALA })).status).toBe(403);
    expect((await chamar("relatorio", { token: LOCAL(["habilitacao_voluntarios"]), query: CORPO_SALA })).status).toBe(200);
    quando(/SELECT TOP 1 PresencaId FROM CheckinInfantilVoluntarios WITH \(UPDLOCK\)/, [{ PresencaId: 1 }]);
    expect((await chamar("sair-da-sala", { metodo: "POST", token: PIN(10), corpo: CORPO_SALA })).status).toBe(200);
  });
  test("quem não está escalado e não é da liderança do escopo recebe 404 na leitura da sala (a mesma de 'não existe'; nada de dado de criança)", async () => {
    sala(); escalado(false);
    for (const t of [PIN(), LOCAL(["habilitacao_voluntarios"], ["Vila"]), LOCAL(["pessoas"])]) {
      const r = await chamar("sala", { token: t, query: CORPO_SALA });
      expect(r.status).toBe(404);
    }
    expect(com(/FROM CheckinInfantilRegistros r\s+LEFT JOIN/)).toHaveLength(0);
  });
  test("registro que existe mas é de uma sala sem relação com a pessoa: a MESMA resposta de registro que não existe (retirar, segunda via)", async () => {
    sala(); escalado(false);
    quando(/FROM CheckinInfantilRegistros r\s+LEFT JOIN MembroReferencia m/, [{ RegistroId: 9, ServicoId: 5, EquipeId: 7, Situacao: "NA_SALA", MenorMembroId: 30, CriancaNome: "Caio Souza" }]);
    const corposReais = [["retirar", { registroId: 9, codigo: "AB3K9Z", retirante: { ref: "RESP:40" } }], ["segunda-via-pedir", { registroId: 9, pessoa: { ref: "RESP:40" }, documento: "RG" }], ["segunda-via-confirmar", { registroId: 9 }]];
    for (const [acao, corpo] of corposReais) {
      const real = await chamar(acao, { metodo: "POST", token: PIN(10), corpo });
      mockRegras = mockRegras.filter(([p]) => !/FROM CheckinInfantilRegistros r/.test(p.source));
      const falso = await chamar(acao, { metodo: "POST", token: PIN(10), corpo: { ...corpo, registroId: 999 } });
      expect(real.status).toBe(404);
      expect(real.body).toEqual(falso.body);
      quando(/FROM CheckinInfantilRegistros r\s+LEFT JOIN MembroReferencia m/, [{ RegistroId: 9, ServicoId: 5, EquipeId: 7, Situacao: "NA_SALA", MenorMembroId: 30, CriancaNome: "Caio Souza" }]);
    }
    expect(escritas()).toHaveLength(0);
  });
  test("o voluntário escalado lê a sala (visão da equipe, sem telefone); a liderança do escopo lê com a visão de gestão", async () => {
    sala();
    quando(/SELECT v\.MembroId, m\.Nome, v\.EntrouEm FROM CheckinInfantilVoluntarios/, [{ MembroId: 10, Nome: "Voluntário 10", EntrouEm: new Date("2026-10-18T11:55:00Z") }, { MembroId: 11, Nome: "Voluntário 11", EntrouEm: new Date("2026-10-18T11:56:00Z") }]);
    quando(/FROM CheckinInfantilRegistros r\s+LEFT JOIN MembroReferencia m ON m\.MembroId = r\.MenorMembroId\s+LEFT JOIN MembroReferencia tm/, [{ RegistroId: 9, ServicoId: 5, EquipeId: 7, MenorMembroId: 30, IdadeAnos: 5, FaixaSala: "MATERNAL", IdadeForaDaFaixa: 0, TrouxeMembroId: 40, TrouxeNomeResolvido: "Maria Souza", TrouxeContato: "94991112222", SaudeTexto: "asma", CodigoGeracao: 1, Tentativas: 1, Travado: 0, Situacao: "NA_SALA", EntregueEm: new Date("2026-10-18T12:05:00Z"), CriancaNome: "Caio Souza", CodigoHash: "nao-deve-sair" }]);
    escalado(true);
    let r = await chamar("sala", { token: PIN(10), query: CORPO_SALA });
    expect(r.status).toBe(200);
    expect(r.body.criancas).toHaveLength(1);
    expect(r.body.criancas[0]).toMatchObject({ registroId: 9, nome: "Caio Souza", tipo: "MEMBRO", saude: "asma", tentativasRestantes: 4 });
    expect(r.body.criancas[0].telefoneDeQuemTrouxe).toBeUndefined();
    expect(r.body.adultosPresentes).toHaveLength(2);
    expect(r.body.lotacao).toMatchObject({ adultos: 2, criancas: 1, capacidade: 10 });
    expect(JSON.stringify(r.body)).not.toMatch(/nao-deve-sair|CodigoHash|Hash/);
    escalado(false);
    mockRegras = mockRegras.filter(([p]) => !/FROM EscalasAlocacoes WHERE ServicoId/.test(p.source)); escalado(false);
    r = await chamar("sala", { token: LOCAL(["habilitacao_voluntarios"]), query: CORPO_SALA });
    expect(r.status).toBe(200);
    expect(r.body.criancas[0].telefoneDeQuemTrouxe).toBe("94991112222");
  });
  test("sair da sala tirando OUTRA pessoa é só da liderança do escopo; sair a si mesmo vale para quem está na sala", async () => {
    sala(); escalado(true);
    let r = await chamar("sair-da-sala", { metodo: "POST", token: PIN(10), corpo: { ...CORPO_SALA, membroId: 11 } });
    expect(r.status).toBe(403);                       // da equipe, mas sem a liderança: 403
    mockRegras = []; sala(); escalado(false);
    r = await chamar("sair-da-sala", { metodo: "POST", token: PIN(10), corpo: { ...CORPO_SALA, membroId: 11 } });
    expect(r.status).toBe(404);                       // sem relação nenhuma com a sala: a mesma resposta de 'não existe'
    expect(escritas()).toHaveLength(0);
  });
});

describe("validação do que chega: 422 sem gravar nada", () => {
  test("check-in, retirada, segunda via, decisão, autorizado e saúde com corpo ruim recebem 422 e nada é consultado", async () => {
    const t = PIN();
    const gestao = LOCAL(["habilitacao_voluntarios"]);
    const casos = [
      ["checkin", t, { ...CORPO_SALA, criancas: [], trouxe: {} }],
      ["checkin", t, { ...CORPO_SALA, criancas: [{ menorId: 30 }], trouxe: { responsavelId: 40 }, autorizadosVisita: [{ nome: "<b>", parentesco: "TIO" }] }],
      ["retirar", t, { registroId: 9, codigo: "0O1IL!", retirante: { ref: "RESP:40" } }],
      ["retirar", t, { registroId: 9, codigo: "AB3K9Z", retirante: { ref: "RESP:40", outro: {} } }],
      ["segunda-via-pedir", t, { registroId: 9, pessoa: { ref: "OUTRO" }, documento: "RG" }],
      ["decidir-divergencia", gestao, { registroId: 9, aprovar: "sim", motivo: "Confirmado pelo telefone." }],
      ["decidir-divergencia", gestao, { registroId: 9, aprovar: true, motivo: "curto" }],
      ["autorizado-adicionar", t, { menorId: 30, nome: "Dona Lúcia", parentesco: "CHEFE" }],
      ["saude-gravar", t, { menorId: 30, texto: "<script>alert(1)</script>" }]
    ];
    for (const [acao, token, corpo] of casos) {
      const r = await chamar(acao, { metodo: "POST", token, corpo });
      expect([acao, r.status]).toEqual([acao, 422]);
      expect(r.body.sucesso).toBe(false);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("a recusa do formato do código não vaza o que seria o código certo e fala em português", async () => {
    const r = await chamar("retirar", { metodo: "POST", token: PIN(), corpo: { registroId: 9, codigo: "abc", retirante: { ref: "RESP:40" } } });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toBe(ck.MENSAGENS.CODIGO_FORMATO);
  });
});

describe("catálogo e as rotas do responsável", () => {
  test("o catálogo traz o texto de saúde vigente com o hash que a tela devolve (balcão), os parentescos e documentos do catálogo e as regras", async () => {
    const r = await chamar("catalogos", { token: PIN() });
    expect(r.status).toBe(200);
    const t = mc.textoDe("SAUDE_CRACHA");
    expect(r.body.textoSaude).toMatchObject({ versao: t.versao, hash: t.hash, titulo: t.titulo });
    expect(r.body.parentescos.map((p) => p.codigo)).toEqual(Object.keys(ck.PARENTESCOS));
    expect(r.body.documentos.map((p) => p.codigo)).toEqual(Object.keys(ck.DOCUMENTOS));
    expect(r.body).toMatchObject({ tentativas: 5, janela: { antesMinutos: 60, depoisHoras: 5 }, segundaViaMinutos: 10, maxAutorizados: 8, papeis: { gestao: false } });
    expect((await chamar("catalogos", { token: LOCAL(["habilitacao_voluntarios"]) })).body.papeis.gestao).toBe(true);
  });
  test("a lista de autorizados e a saúde de uma criança: quem não é o responsável recebe 403, a mesma resposta de criança que não existe", async () => {
    const a = await chamar("autorizados", { token: PIN(99), query: { menorId: 30 } });
    const b = await chamar("autorizados", { token: PIN(99), query: { menorId: 31 } });
    expect(a.status).toBe(403);
    expect(a.body).toEqual(b.body);
    expect((await chamar("saude", { token: PIN(99), query: { menorId: 30 } })).status).toBe(403);
    expect(await chamar("saude", { token: PIN(99) })).toMatchObject({ status: 400 });
  });
  test("a ficha assinada (ficha:true) é da liderança no escopo: com a permissão e a referência, passa pela regra do banco", async () => {
    quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c ON c\.CongregacaoId = m\.CongregacaoId WHERE m\.MembroId = @m/, [{ MembroId: 30, Nome: "Caio Souza", DataNascimento: new Date("2021-03-01T00:00:00Z"), CongregacaoId: 1, CongregacaoNome: "Central" }]);
    quando(/SELECT COUNT\(\*\) AS n FROM CheckinInfantilAutorizados/, [{ n: 0 }]);
    quando(/INSERT INTO CheckinInfantilAutorizados/, [{ AutorizadoId: 12 }]);
    const r = await chamar("autorizado-adicionar", { metodo: "POST", token: LOCAL(["habilitacao_voluntarios"]), corpo: { menorId: 30, nome: "Dona Lúcia", parentesco: "AVO", ficha: true, referencia: "Ficha 7" } });
    expect(r.status).toBe(201);
    expect(com(/INSERT INTO CheckinInfantilAutorizados/)[0].inputs).toMatchObject({ f: "FICHA_FISICA", ref: "Ficha 7", por: 5 });
    mockConsultas = [];
    const fora = await chamar("autorizado-adicionar", { metodo: "POST", token: LOCAL(["habilitacao_voluntarios"], ["Vila"]), corpo: { menorId: 30, nome: "Dona Lúcia", parentesco: "AVO", ficha: true, referencia: "Ficha 7" } });
    expect(fora.status).toBe(403);
    expect(com(/INSERT INTO CheckinInfantilAutorizados/)).toHaveLength(0);
  });
  test("o histórico traz só o que o responsável pode ver", async () => {
    quando(/WHERE r\.MenorMembroId IS NOT NULL AND m\.DataNascimento IS NOT NULL/, [{ RegistroId: 9, MenorMembroId: 30, CriancaNome: "Caio Souza", EquipeNome: "Maternal", CongregacaoNome: "Central", ServicoDataHora: new Date("2026-10-18T09:00:00Z"),
      EntregueEm: new Date("2026-10-18T12:05:00Z"), RetiradoEm: null, Situacao: "NA_SALA", TrouxeNomeResolvido: "Maria Souza", RetiradoNomeResolvido: null, Divergente: 0, CodigoHash: "x", SaudeTexto: "asma" }]);
    const r = await chamar("historico", { token: PIN(40), query: { menorId: 30 } });
    expect(r.status).toBe(200);
    expect(com(/EXISTS \(SELECT 1 FROM VoluntariadoResponsaveis v/)[0].inputs).toMatchObject({ r: 40, m: 30 });
    expect(JSON.stringify(r.body)).not.toMatch(/"x"|asma|CodigoHash/);
    expect(r.body.historico[0]).toMatchObject({ registroId: 9, crianca: "Caio Souza", situacao: "NA_SALA" });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Revisão adversarial da v7.10: as rotas novas e as que mudaram de porta (encerrar-sala, relatório só da gestão, sair da sala depois de tirado da escala)
// ---------------------------------------------------------------------------------------------------------------------------------------------------
describe("encerrar-sala (rota da liderança)", () => {
  const SALA_BANCO = { ServicoId: 5, EquipeId: 7, EquipeNome: "Maternal", FaixaEtariaMenores: "MATERNAL", LiderMembroId: 600, ContatoComMenores: 1, Ativa: 1, CongregacaoId: 1, CongregacaoNome: "Central", DataHora: new Date("2020-01-05T09:00:00Z"), ServicoStatus: "PUBLICADA" };
  const sala = (extra = {}) => quando(/FROM EscalasServicos s\s+JOIN EscalasEquipes e ON e\.EquipeId = @e/, [{ ...SALA_BANCO, ...extra }]);
  const GESTAO = (escopo = ["Central"], fator = COM_FATOR) => LOCAL(["habilitacao_voluntarios"], escopo, 5, fator);
  const corpo = (extra = {}) => ({ ...CORPO_SALA, motivo: "Os voluntários esqueceram de registrar as retiradas.", ...extra });
  const encerrar = (token, c = corpo()) => chamar("encerrar-sala", { metodo: "POST", token, corpo: c });
  const CONTA = /SELECT COUNT\(\*\) AS n FROM CheckinInfantilRegistros WHERE ServicoId = @s AND EquipeId = @e AND Situacao <> 'RETIRADA'/;

  test("a ordem das portas: sem sessão 401; PIN, voluntário e liderança sem a permissão 403 ANTES de qualquer consulta; motivo ruim 422; sem a confirmação reforçada 428; fora do escopo 404 igual a 'não existe'", async () => {
    expect((await chamar("encerrar-sala", { metodo: "POST", corpo: corpo() })).status).toBe(401);
    for (const t of [PIN(10), PIN(1), GERAL(["pessoas"]), LOCAL(["pessoas"])]) expect((await encerrar(t)).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
    for (const motivo of [undefined, null, "", "abcd", "<b>x</b>", "x".repeat(301)]) expect((await encerrar(GESTAO(), corpo({ motivo }))).status).toBe(422);
    expect(mockConsultas).toHaveLength(0);                                                                // a validação vem antes de qualquer consulta
    sala();
    expect((await encerrar(GESTAO(["Central"], null))).status).toBe(428);
    expect(escritas()).toHaveLength(0);
    const alheia = await encerrar(GESTAO(["Vila"]));
    mockRegras = []; mockConsultas = [];
    const naoExiste = await encerrar(GESTAO(["Vila"]));
    expect(alheia.status).toBe(404); expect(naoExiste.status).toBe(404);
    expect(naoExiste.body).toEqual(await encerrar(GESTAO(["Vila"])).then((x) => x.body));
    for (const ruim of [{ servicoId: "0x10" }, { equipeId: "1e1" }, { servicoId: "05" }, { equipeId: -1 }]) expect((await encerrar(GESTAO(), corpo(ruim))).status).toBe(400);
  });

  test("com a confirmação reforçada e a sala fechada: 200 { sucesso, baixadas, mensagem } e a baixa é gravada em nome de quem encerrou", async () => {
    sala();
    quando(CONTA, [{ n: 2 }]);
    quando(/DECLARE @b TABLE/, [{ RegistroId: 1, SituacaoAntes: "NA_SALA" }, { RegistroId: 2, SituacaoAntes: "NA_SALA" }]);
    quando(/DECLARE @v TABLE/, []);
    const r = await encerrar(GESTAO());
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ sucesso: true, baixadas: 2, semAviso: false, mensagem: expect.stringMatching(/2 criança\(s\) receberam a baixa administrativa/) });
    expect(r.headers).toMatchObject({ "Cache-Control": "no-store" });
    expect(com(/DECLARE @b TABLE/)[0].inputs).toMatchObject({ s: 5, e: 7, g: 5, m: "Os voluntários esqueceram de registrar as retiradas." });
  });

  test("com o check-in ainda aberto e criança na sala: 422 com a explicação (a criança sai pela retirada)", async () => {
    sala({ DataHora: new Date(Date.now() - 3 * 3600 * 1000) });                                         // o serviço começou agora (o horário de Brasília é gravado sem fuso: UTC menos 3 horas)
    quando(CONTA, [{ n: 1 }]);
    const r = await encerrar(GESTAO());
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toBe(ck.MENSAGENS.SALA_AINDA_ABERTA);
    expect(com(/DECLARE @b TABLE/)).toHaveLength(0);
  });

  test("a equipe SEM a marca (que perdeu a marca depois) também se encerra: a criança que ficou lá dentro precisa da baixa", async () => {
    sala({ ContatoComMenores: 0 });
    quando(CONTA, [{ n: 1 }]);
    quando(/DECLARE @b TABLE/, [{ RegistroId: 1, SituacaoAntes: "NA_SALA" }]);
    quando(/DECLARE @v TABLE/, []);
    expect((await encerrar(GESTAO())).status).toBe(200);
  });
});

describe("o relatório do dia é ato de gestão e sair da sala não depende da escala", () => {
  const SALA_BANCO = { ServicoId: 5, EquipeId: 7, EquipeNome: "Maternal", FaixaEtariaMenores: "MATERNAL", LiderMembroId: 600, ContatoComMenores: 1, Ativa: 1, CongregacaoId: 1, CongregacaoNome: "Central", DataHora: new Date("2026-10-18T09:00:00Z"), ServicoStatus: "PUBLICADA" };
  const sala = (extra = {}) => quando(/FROM EscalasServicos s\s+JOIN EscalasEquipes e ON e\.EquipeId = @e/, [{ ...SALA_BANCO, ...extra }]);
  const escalado = (sim) => quando(/FROM EscalasAlocacoes WHERE ServicoId = @s AND EquipeId = @e AND MembroId = @m AND Status IN/, sim ? [{ x: 1 }] : []);

  test("o voluntário escalado e presente NÃO lê o relatório (403, sem dado); o líder da equipe tampouco; a liderança do escopo lê; a de fora, 404", async () => {
    sala(); escalado(true);
    const v = await chamar("relatorio", { token: PIN(10), query: CORPO_SALA });
    expect(v.status).toBe(403);
    expect(JSON.stringify(v.body)).not.toMatch(/criancas|eventos|voluntarios/);
    expect(com(/FROM CheckinInfantilEventos ev/)).toHaveLength(0);
    expect((await chamar("relatorio", { token: PIN(600), query: CORPO_SALA })).status).toBe(403);
    expect((await chamar("relatorio", { token: LOCAL(["habilitacao_voluntarios"]), query: CORPO_SALA })).status).toBe(200);
    mockRegras = []; sala(); escalado(false);                                                           // a liderança de FORA do escopo, sem relação nenhuma com a sala
    expect((await chamar("relatorio", { token: LOCAL(["habilitacao_voluntarios"], ["Vila"]), query: CORPO_SALA })).status).toBe(404);
  });

  test("quem entrou na sala e depois saiu da escala ainda SAI (antes: 404 e a presença ficava aberta); quem nunca teve relação com a sala continua recebendo 404", async () => {
    sala(); escalado(false);
    quando(/SELECT TOP 1 PresencaId FROM CheckinInfantilVoluntarios WITH \(UPDLOCK\)/, [{ PresencaId: 1 }]);
    quando(/FROM CheckinInfantilVoluntarios WHERE ServicoId = @s AND EquipeId = @e AND MembroId = @m AND SaiuEm IS NULL/, [{ x: 1 }]);       // a presença aberta dele
    expect((await chamar("sair-da-sala", { metodo: "POST", token: PIN(10), corpo: CORPO_SALA })).status).toBe(200);
    mockRegras = []; mockConsultas = []; sala(); escalado(false);
    quando(/SELECT TOP 1 PresencaId FROM CheckinInfantilVoluntarios WITH \(UPDLOCK\)/, [{ PresencaId: 1 }]);
    const semRelacao = await chamar("sair-da-sala", { metodo: "POST", token: PIN(10), corpo: CORPO_SALA });          // sem presença aberta e sem escala
    expect(semRelacao.status).toBe(404);
    expect(com(/UPDATE CheckinInfantilVoluntarios SET SaiuEm/)).toHaveLength(0);
  });

  test("a leitura da sala entrega 'apto' só para a liderança (o voluntário recebe só contaComoAdulto)", async () => {
    sala(); escalado(true);
    quando(/SELECT v\.MembroId, m\.Nome, v\.EntrouEm FROM CheckinInfantilVoluntarios/, [{ MembroId: 10, Nome: "Ana", EntrouEm: new Date("2026-10-18T11:55:00Z") }, { MembroId: 11, Nome: "Bruno", EntrouEm: new Date("2026-10-18T11:56:00Z") }]);
    const op = await chamar("sala", { token: PIN(10), query: CORPO_SALA });
    expect(op.status).toBe(200);
    expect(op.body.adultosPresentes.every((a) => !("apto" in a) && typeof a.contaComoAdulto === "boolean")).toBe(true);
    const gestor = await chamar("sala", { token: LOCAL(["habilitacao_voluntarios"]), query: CORPO_SALA });
    expect(gestor.status).toBe(200);
    expect(gestor.body.adultosPresentes.every((a) => typeof a.apto === "boolean")).toBe(true);
  });
});

describe("Trava 7-B: a liderança com pendência reservada (afastamento cautelar, comunicação em análise...) não age como gestão do check-in", () => {
  const mmDb = require("../ministerioMenoresDb");
  const DECISAO = { registroId: 9, aprovar: true, motivo: "Confirmei com a mãe pelo telefone." };
  afterEach(() => mmDb.aptidaoDe.mockImplementation(async () => ({ apto: true, contaComoAdulto: true, bloqueios: [] })));
  test("afastada (INCIDENTE_EM_APURACAO): aprovar divergência, destravar e o relatório viram 403 com a mensagem de quem não tem a permissão, sem ler registro de criança", async () => {
    mmDb.aptidaoDe.mockImplementation(async () => ({ apto: false, contaComoAdulto: true, bloqueios: [{ codigo: "INCIDENTE_EM_APURACAO" }] }));
    for (const [acao, corpo] of [["decidir-divergencia", DECISAO], ["destravar", { registroId: 9 }]]) {
      mockConsultas = [];
      const r = await chamar(acao, { metodo: "POST", token: LOCAL(["habilitacao_voluntarios"]), corpo });
      expect(r.status).toBe(403);
      expect(r.body.mensagem).not.toMatch(/apura|incidente|afast/i);
      expect(com(/CheckinInfantilRegistros/)).toHaveLength(0);
    }
    const ficha = await chamar("autorizado-adicionar", { metodo: "POST", token: LOCAL(["habilitacao_voluntarios"]), corpo: { menorId: 30, nome: "Dona Lúcia", parentesco: "AVO", ficha: true, referencia: "Ficha 3" } });
    expect(ficha.status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
  test("as outras pendências reservadas também barram; pendência comum (certidão vencida) não barra a gestão; e a aptidão que não pôde ser lida fecha a porta", async () => {
    for (const codigo of ["AUTO_DENUNCIA_EM_ANALISE", "CADASTRO_NACIONAL", "ANTECEDENTES_COM_RESTRICAO", "FORA_DE_COMUNHAO"]) {
      mmDb.aptidaoDe.mockImplementation(async () => ({ apto: false, bloqueios: [{ codigo }] }));
      expect((await chamar("destravar", { metodo: "POST", token: LOCAL(["habilitacao_voluntarios"]), corpo: { registroId: 9 } })).status).toBe(403);
    }
    mmDb.aptidaoDe.mockImplementation(async () => { throw new Error("banco fora"); });
    expect((await chamar("destravar", { metodo: "POST", token: LOCAL(["habilitacao_voluntarios"]), corpo: { registroId: 9 } })).status).toBe(403);
    mmDb.aptidaoDe.mockImplementation(async () => ({ apto: false, bloqueios: [{ codigo: "CERTIDAO_VENCIDA" }] }));
    const r = await chamar("destravar", { metodo: "POST", token: LOCAL(["habilitacao_voluntarios"]), corpo: { registroId: 9 } });
    expect(r.status).not.toBe(403);                                            // segue para a busca do registro (404 aqui: o banco simulado não tem a criança)
  });
  test("incluir autorizado POR FICHA pede a confirmação reforçada (428) antes de gravar", async () => {
    const r = await chamar("autorizado-adicionar", { metodo: "POST", token: LOCAL(["habilitacao_voluntarios"], ["Central"], 5, null), corpo: { menorId: 30, nome: "Dona Lúcia", parentesco: "AVO", ficha: true, referencia: "Ficha 3" } });
    expect(r.status).toBe(428);
    expect(escritas()).toHaveLength(0);
  });
});
