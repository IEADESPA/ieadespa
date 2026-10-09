// As rotas do ministério com menores (v7.7) com o handler de verdade e o banco simulado pelo TEXTO da consulta: a porta de cada ação (sem sessão, PIN, permissão no escopo
// errado, nível geral), o 403 ANTES de qualquer consulta, a confirmação reforçada (428), os identificadores como o HTTP os entrega (TEXTO) e a resposta igual para
// "não existe" e "não é seu". O comportamento contra o SQL Server (transações, gatilhos, corridas) é coberto pelos roteiros ponta a ponta (tools/e2e-localdb).
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
jest.mock("../notificacoes", () => ({ ...jest.requireActual("../notificacoes"), resolverDestinatariosPorPermissao: jest.fn(async () => []) }));
jest.mock("../trilhas", () => ({ ...jest.requireActual("../trilhas"), listarRequisitos: jest.fn(async () => []) }));

const auth = require("../auth");
const mm = require("../ministerioMenores");
const handler = require("../../GestaoMinisterioMenores/index.js");

const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const COM_FATOR = { via: "CHAVE", em: Date.now() };
const GERAL = (permissoes, id = 1, fator = COM_FATOR) => tokenDe(id, { via: "SENHA", fator, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes });
const LOCAL = (permissoes, escopo = ["Central"], id = 5) => tokenDe(id, { via: "SENHA", fator: COM_FATOR, nivel: "CONGREGACAO", escopoCongregacoes: escopo, permissoes });
const PIN = (id = 10) => tokenDe(id, { via: "PIN" });
async function chamar(acao, { metodo = "GET", query = {}, corpo = {}, token, headers = {} } = {}) {
  const context = { bindingData: { acao }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  const qs = {}; for (const [k, v] of Object.entries(query)) qs[k] = v == null ? v : String(v);   // a query string chega SEMPRE em texto
  await handler(context, { method: metodo, query: qs, body: corpo, headers: token ? { "x-auth-token": token, ...headers } : headers });
  return context.res;
}
const escritas = () => mockConsultas.filter((c) => /^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.test(c.sql));
const IP = { "x-forwarded-for": "9.9.9.9, 177.8.9.10:443, 10.0.0.1:80" };

beforeEach(() => { mockRegras = []; mockConsultas = []; });

const GETS = ["catalogos", "minha-situacao", "politica", "painel", "painel-geral", "auto-denuncias"];
const POSTS = ["aceitar-politica", "confirmar-ficha", "auto-denuncia", "equipe-faixa", "registrar-politica", "confirmar-ficha-pessoa", "auto-denuncia-decidir", "auto-denuncia-liberar"];
const GESTAO = [["GET", "painel"], ["GET", "painel-geral"], ["POST", "equipe-faixa"], ["POST", "registrar-politica"], ["POST", "confirmar-ficha-pessoa"]];
const DIRETORIA = [["GET", "auto-denuncias"], ["POST", "auto-denuncia-decidir"], ["POST", "auto-denuncia-liberar"]];

describe("a porta de todas as rotas", () => {
  test("sem sessão: 401 em TODAS as ações, e nada é consultado", async () => {
    for (const a of GETS) expect((await chamar(a)).status).toBe(401);
    for (const a of POSTS) expect((await chamar(a, { metodo: "POST" })).status).toBe(401);
    expect(mockConsultas).toHaveLength(0);
  });
  test("token adulterado ou lixo: 401", async () => {
    for (const t of ["lixo", PIN() + "x", "a.b.c"]) expect((await chamar("minha-situacao", { token: t })).status).toBe(401);
  });
  test("as ações da GESTÃO respondem 403 ANTES de qualquer consulta para PIN, permissão no escopo errado ou sem a permissão", async () => {
    const intrusos = [PIN(), PIN(1), GERAL(["pessoas"]), LOCAL(["pessoas"]), GERAL(["vistoria_antecedentes", "setores_tecnicos"])];
    for (const [metodo, acao] of GESTAO) for (const t of intrusos) {
      const r = await chamar(acao, { metodo, token: t, query: { congregacaoId: 1 }, corpo: { equipeId: 1, membroId: 2, faixa: "MATERNAL", referencia: "Pasta 3, ficha 1", confirmo: true } });
      expect(r.status).toBe(403);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("as ações da DIRETORIA são só de quem tem vistoria_antecedentes NO NÍVEL GERAL, em sessão de liderança: dirigente, gestão e PIN recebem 403 antes de qualquer consulta", async () => {
    const intrusos = [PIN(), PIN(1), LOCAL(["vistoria_antecedentes"]), GERAL(["habilitacao_voluntarios"]), LOCAL(["habilitacao_voluntarios"]), GERAL(["setores_ratificacao"])];
    for (const [metodo, acao] of DIRETORIA) for (const t of intrusos) {
      const r = await chamar(acao, { metodo, token: t, corpo: { autoDenunciaId: 1, decisao: "MANTIDO", observacao: "Observação suficiente." } });
      expect(r.status).toBe(403);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("o PIN de quem TEM a permissão nunca vale como liderança (sessão de membro)", async () => {
    // PIN não carrega permissão alguma; mesmo um token de PIN assinado com a lista de permissões da Diretoria não passa.
    const pinComPermissao = tokenDe(1, { via: "PIN", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["vistoria_antecedentes", "habilitacao_voluntarios"] });
    expect((await chamar("auto-denuncias", { token: pinComPermissao })).status).toBe(403);
    expect((await chamar("painel-geral", { token: pinComPermissao })).status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("decidir e liberar pedem a confirmação reforçada recente (428), mesmo para a Diretoria", async () => {
    const semFator = GERAL(["vistoria_antecedentes"], 1, null);      // null (undefined cairia no valor padrão, que TEM o fator)
    for (const acao of ["auto-denuncia-decidir", "auto-denuncia-liberar"]) {
      const r = await chamar(acao, { metodo: "POST", token: semFator, corpo: { autoDenunciaId: 1, decisao: "MANTIDO", observacao: "Observação suficiente." } });
      expect(r.status).toBe(428);
    }
    expect(escritas()).toHaveLength(0);
  });
  test("as rotas da própria pessoa valem para qualquer login, inclusive PIN", async () => {
    for (const acao of ["catalogos", "minha-situacao", "politica"]) expect((await chamar(acao, { token: PIN() })).status).toBe(200);
  });
  test("método estranho ou ação inválida: nunca executa nada", async () => {
    expect((await chamar("minha-situacao", { metodo: "DELETE", token: PIN() })).status).toBe(405);
    expect((await chamar("nao-existe", { token: PIN() })).status).toBe(404);
    expect((await chamar("nao-existe", { metodo: "POST", token: PIN() })).status).toBe(404);
    expect(escritas()).toHaveLength(0);
  });
});

describe("identificadores: estritos, como o HTTP os entrega", () => {
  const ruins = ["0x10", "1e1", "abc", "-1", "0", "1.5", " ", "99999999999999999999", "1; DROP TABLE Membros", "<script>"];
  test("membroId, equipeId, congregacaoId e autoDenunciaId malformados são 400, sem tocar o banco", async () => {
    const gestao = GERAL(["habilitacao_voluntarios", "vistoria_antecedentes"]);
    for (const campo of ["membroId", "equipeId", "congregacaoId", "autoDenunciaId"]) for (const v of ruins) {
      const r = await chamar("registrar-politica", { metodo: "POST", token: gestao, corpo: { [campo]: v, membroId: campo === "membroId" ? v : 2, referencia: "Pasta 3, ficha 1" } });
      expect(r.status).toBe(400);
    }
    for (const v of ruins) expect((await chamar("painel", { token: gestao, query: { congregacaoId: v } })).status).toBe(400);
    for (const v of [true, false, [5], { a: 1 }]) expect((await chamar("equipe-faixa", { metodo: "POST", token: gestao, corpo: { equipeId: v, faixa: "MATERNAL" } })).status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
});

describe("congregação e pessoa: 'não existe' e 'não é seu' respondem igual", () => {
  const gestao = LOCAL(["habilitacao_voluntarios"], ["Central"]);
  test("painel de congregação inexistente e de outra região são iguais", async () => {
    quando(/FROM Congregacoes WHERE CongregacaoId/, (i) => (Number(i.id) === 2 ? [{ Nome: "Vila Nova" }] : []));
    const a = await chamar("painel", { token: gestao, query: { congregacaoId: 99 } });
    const b = await chamar("painel", { token: gestao, query: { congregacaoId: 2 } });
    expect(a.status).toBe(403); expect(b.status).toBe(403);
    expect(a.body.mensagem).toBe(b.body.mensagem);
  });
  test("equipe inexistente e de outra congregação são iguais (404), e nada é gravado", async () => {
    quando(/FROM EscalasEquipes e JOIN Congregacoes c/, (i) => (Number(i.id) === 7 ? [{ CongregacaoNome: "Vila Nova" }] : []));
    const a = await chamar("equipe-faixa", { metodo: "POST", token: gestao, corpo: { equipeId: 99, faixa: "MATERNAL" } });
    const b = await chamar("equipe-faixa", { metodo: "POST", token: gestao, corpo: { equipeId: 7, faixa: "MATERNAL" } });
    expect(a.status).toBe(404); expect(b.status).toBe(404);
    expect(a.body.mensagem).toBe(b.body.mensagem);
    expect(escritas()).toHaveLength(0);
  });
  test("o painel do campo inteiro exige o nível geral: a gestão de uma congregação recebe 403", async () => {
    expect((await chamar("painel-geral", { token: gestao })).status).toBe(403);
  });
});

describe("aceitar a política e a ficha", () => {
  test("o aceite exige o booleano verdadeiro e o hash do texto que a tela mostrou", async () => {
    for (const aceito of ["true", 1, [], {}, false, undefined]) expect((await chamar("aceitar-politica", { metodo: "POST", token: PIN(), corpo: { aceito, textoHash: mm.POLITICA_HASH }, headers: IP })).status).toBe(422);
    const velho = await chamar("aceitar-politica", { metodo: "POST", token: PIN(), corpo: { aceito: true, textoHash: "0".repeat(64) }, headers: IP });
    expect(velho.status).toBe(422);
    expect(velho.body.politicaMudou).toBe(true);
    expect(escritas()).toHaveLength(0);
  });
  test("sem IP público identificável, o aceite digital é recusado; com IP, grava com o IP medido (nunca o do corpo)", async () => {
    const sem = await chamar("aceitar-politica", { metodo: "POST", token: PIN(), corpo: { aceito: true, textoHash: mm.POLITICA_HASH } });
    expect(sem.status).toBe(422);
    expect(sem.body.mensagem).toMatch(/origem da sua conexão/);
    quando(/INSERT INTO MinisterioMenoresPoliticaAceites/, [{ id: 5 }]);
    const ok = await chamar("aceitar-politica", { metodo: "POST", token: PIN(10), corpo: { aceito: true, textoHash: ` ${mm.POLITICA_HASH.toUpperCase()} `, enderecoIp: "1.1.1.1", membroId: 99, versao: 7 }, headers: IP });
    expect(ok.status).toBe(201);
    const ins = escritas().find((c) => /MinisterioMenoresPoliticaAceites/.test(c.sql));
    expect(ins.inputs).toMatchObject({ m: 10, v: mm.POLITICA_VERSAO, h: mm.POLITICA_HASH, ip: "177.8.9.10" });
  });
  test("a ficha: o booleano verdadeiro e a habilitação aberta", async () => {
    expect((await chamar("confirmar-ficha", { metodo: "POST", token: PIN(), corpo: { confirmo: "sim" } })).status).toBe(422);
    const sem = await chamar("confirmar-ficha", { metodo: "POST", token: PIN(), corpo: { confirmo: true } });
    expect(sem.status).toBe(422);
    expect(sem.body.mensagem).toMatch(/ainda não foi aberta/);
    expect(escritas()).toHaveLength(0);
  });
});

describe("a auto-denúncia", () => {
  test("só o tipo, a data e a ciência: o resto é recusado antes de gravar", async () => {
    const base = { tipo: "INQUERITO_POLICIAL", dataCiencia: "2026-09-01", ciente: true };
    for (const extra of [{ tipo: "OUTRO" }, { dataCiencia: "2999-01-01" }, { dataCiencia: "ontem" }, { ciente: "true" }, { ciente: false }, { ciente: undefined }]) {
      expect((await chamar("auto-denuncia", { metodo: "POST", token: PIN(), corpo: { ...base, ...extra } })).status).toBe(422);
    }
    expect(escritas()).toHaveLength(0);
  });
  test("quem já comunicou e ainda não teve decisão não grava de novo", async () => {
    quando(/FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId WHERE m.MembroId/, [{ MembroId: 10, Nome: "Ana", Email: "a@e.org" }]);
    quando(/SELECT TOP 1 AutoDenunciaId FROM MinisterioMenoresAutoDenuncias/, [{ AutoDenunciaId: 3 }]);
    const hoje = new Date().toISOString().slice(0, 10);
    const r = await chamar("auto-denuncia", { metodo: "POST", token: PIN(), corpo: { tipo: "INQUERITO_POLICIAL", dataCiencia: hoje, ciente: true } });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/já comunicou/);
    expect(escritas()).toHaveLength(0);
  });
  test("a decisão e a liberação: observação obrigatória, ninguém decide sobre si, e comunicação inexistente é recusada sem vazar nada", async () => {
    const dir = GERAL(["vistoria_antecedentes"], 1);
    const naoAcha = await chamar("auto-denuncia-decidir", { metodo: "POST", token: dir, corpo: { autoDenunciaId: 99, decisao: "MANTIDO", observacao: "Observação suficiente." } });
    expect(naoAcha.status).toBe(422);
    expect(naoAcha.body.mensagem).toMatch(/não encontrada/);
    quando(/FROM MinisterioMenoresAutoDenuncias a JOIN MembroReferencia m/, [{ AutoDenunciaId: 5, MembroId: 1, Tipo: "INQUERITO_POLICIAL", DataCiencia: new Date("2026-09-01"), Decisao: null, Nome: "Presidente" }]);
    const proprio = await chamar("auto-denuncia-decidir", { metodo: "POST", token: dir, corpo: { autoDenunciaId: 5, decisao: "MANTIDO", observacao: "Observação suficiente." } });
    expect(proprio.status).toBe(403);
    expect(proprio.body.mensagem).toMatch(/Ninguém decide sobre a própria comunicação/);
    mockRegras = [];
    quando(/FROM MinisterioMenoresAutoDenuncias a JOIN MembroReferencia m/, [{ AutoDenunciaId: 5, MembroId: 20, Tipo: "INQUERITO_POLICIAL", DataCiencia: new Date("2026-09-01"), Decisao: null, Nome: "Ana" }]);
    for (const observacao of ["", "curto", "x".repeat(301), "<b>sim sim sim</b>", undefined]) {
      const r = await chamar("auto-denuncia-decidir", { metodo: "POST", token: dir, corpo: { autoDenunciaId: 5, decisao: "MANTIDO", observacao } });
      expect(r.status).toBe(422);
    }
    expect(escritas()).toHaveLength(0);
    const jaDecidida = await chamar("auto-denuncia-decidir", { metodo: "POST", token: dir, corpo: { autoDenunciaId: 5, decisao: "TALVEZ", observacao: "Observação suficiente." } });
    expect(jaDecidida.status).toBe(422);
  });
});

describe("falha do banco", () => {
  test("erro interno vira 500 genérico, sem vazar texto de SQL", async () => {
    quando(/FROM EscalasEquipeMembros em JOIN EscalasEquipes e/, () => { throw new Error("SELECT secreto FROM tabela falhou: ConnectionError"); });
    const r = await chamar("minha-situacao", { token: PIN() });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/SELECT|ConnectionError|tabela/);
  });
});
