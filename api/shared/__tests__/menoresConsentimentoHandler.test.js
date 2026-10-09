// As rotas do consentimento do responsável (v7.6/v7.7: GestaoConsentimentoMenor) com o handler de verdade e o banco simulado pelo TEXTO da consulta: a porta de cada ação (sem
// sessão, PIN, permissão errada), o 403 ANTES de qualquer consulta, os identificadores como o HTTP os entrega (TEXTO) e a resposta igual para "não existe" e "não é seu", o IP
// do responsável, e o ataque (id "0x10", menor sem idade, adulto no lugar do menor, responsável revogado, hash velho, IP ausente, sessão de PIN). O comportamento contra o
// SQL Server (trava de intervalo, gatilho, CHECKs) é coberto pelo roteiro ponta a ponta.
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
jest.mock("../storage", () => ({ excluirFoto: jest.fn(async () => {}), urlComSas: (u) => u }));

const auth = require("../auth");
const mc = require("../menoresConsentimento");
const { registrarAuditoria } = require("../auditoria");
const storage = require("../storage");
const handler = require("../../GestaoConsentimentoMenor/index.js");

const HASH = (f) => mc.textoDe(f).hash;
const nascidoHa = (anos) => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear() - anos, d.getUTCMonth(), d.getUTCDate() - 2)); };
const CLIENTE = { "x-forwarded-for": "177.87.165.132:24294, 40.70.146.136:36945" };

// O cenário: o menor 30 (10 anos, Central) tem dois responsáveis ativos (40 e 41); o 31 (16 anos, Vila Nova) tem o 40; 32 é adulto; 33 é "menor" SEM data de nascimento;
// 34 (12 anos, Central) teve o responsável 42 revogado (sem nenhum ativo). A Secretaria da Central é a matrícula 5.
const MEMBROS = {
  30: { Nome: "Caio Souza", DataNascimento: nascidoHa(10), FotoUrl: "https://armazem/fotos-membros/membro-30", CongregacaoNome: "Central", ExtensaoNome: null },
  31: { Nome: "Bia Souza", DataNascimento: nascidoHa(16), FotoUrl: null, CongregacaoNome: "Vila Nova", ExtensaoNome: null },
  32: { Nome: "Adulto", DataNascimento: nascidoHa(30), FotoUrl: null, CongregacaoNome: "Central", ExtensaoNome: null },
  33: { Nome: "Sem Data", DataNascimento: null, FotoUrl: null, CongregacaoNome: "Central", ExtensaoNome: null },
  34: { Nome: "Sem Responsável", DataNascimento: nascidoHa(12), FotoUrl: null, CongregacaoNome: "Central", ExtensaoNome: null },
  40: { Nome: "Maria Souza", DataNascimento: nascidoHa(40), FotoUrl: null, CongregacaoNome: "Central", ExtensaoNome: null },
  41: { Nome: "João Souza", DataNascimento: nascidoHa(42), FotoUrl: null, CongregacaoNome: "Central", ExtensaoNome: null },
  50: { Nome: "Estranho", DataNascimento: nascidoHa(35), FotoUrl: null, CongregacaoNome: "Central", ExtensaoNome: null },
  5: { Nome: "Secretária", DataNascimento: nascidoHa(45), FotoUrl: null, CongregacaoNome: "Central", ExtensaoNome: null }
};
let RESPONSAVEIS;       // [{ menor, resp }] ativos
let LINHAS;             // últimas linhas por (menor, finalidade)

function instalarBanco() {
  const idsDaLista = (inputs) => Object.entries(inputs).filter(([k]) => /^m\d+$/.test(k)).map(([, v]) => Number(v));
  mockRegras.push([/SELECT TOP 1 ResponsavelId FROM VoluntariadoResponsaveis WHERE MenorMembroId = @mn/, (i) => (RESPONSAVEIS.some((r) => r.menor === i.mn && r.resp === i.rs) ? [{ ResponsavelId: 1 }] : [])]);
  mockRegras.push([/FROM MembroReferencia m\s+LEFT JOIN Congregacoes c ON c\.CongregacaoId = m\.CongregacaoId\s+LEFT JOIN ExtensoesTenda e/, (i) => (MEMBROS[i.id] ? [{ MembroId: i.id, ...MEMBROS[i.id] }] : [])]);
  mockRegras.push([/FROM MinisterioMenoresConsentimentos c\s+WHERE c\.MenorMembroId IN/, (i) => LINHAS.filter((l) => idsDaLista(i).includes(l.MenorMembroId))]);
  mockRegras.push([/FROM VoluntariadoResponsaveis r JOIN MembroReferencia p ON p\.MembroId = r\.ResponsavelMembroId/, (i) =>
    RESPONSAVEIS.filter((r) => idsDaLista(i).includes(r.menor)).map((r) => ({ MenorMembroId: r.menor, ResponsavelMembroId: r.resp, Vinculo: r.resp === 40 ? "MAE" : "PAI", Nome: MEMBROS[r.resp].Nome }))]);
  mockRegras.push([/JOIN MembroReferencia mn ON mn\.MembroId = r\.MenorMembroId/, (i) => RESPONSAVEIS.filter((r) => r.resp === i.rs).map((r) => ({
    MenorMembroId: r.menor, Vinculo: r.resp === 40 ? "MAE" : "PAI", Nome: MEMBROS[r.menor].Nome, DataNascimento: MEMBROS[r.menor].DataNascimento, AdesaoId: null, Forma: null, DataAceite: null, AdesaoResponsavelNome: null, SuspensaSemResponsavel: 0 }))]);
  mockRegras.push([/INSERT INTO MinisterioMenoresConsentimentos/, [{ id: 77 }]]);
}
const linhaBD = (extra = {}) => ({ ConsentimentoId: 5, MenorMembroId: 30, ResponsavelMembroId: 40, Finalidade: "IMAGEM", Concedido: 1, TextoVersao: 1, TextoHash: HASH("IMAGEM"), Forma: "CLICK_RESP", RegistradoEm: new Date("2026-10-01T12:00:00Z"), Referencia: null, ...extra });

const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const PIN = (id = 40) => tokenDe(id, { via: "PIN" });
const SECRETARIA = (extra = {}) => tokenDe(5, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], permissoes: ["habilitacao_voluntarios"], ...extra });
async function chamar(acao, { metodo = "GET", query = {}, corpo = {}, token, headers = {} } = {}) {
  const context = { bindingData: { acao }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  const qs = {}; for (const [k, v] of Object.entries(query)) qs[k] = v == null ? v : String(v);   // a query string chega SEMPRE em texto
  await handler(context, { method: metodo, query: qs, body: corpo, headers: token ? { "x-auth-token": token, ...headers } : headers });
  return context.res;
}
const escritas = () => mockConsultas.filter((c) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(c.sql));
const insercao = () => mockConsultas.find((c) => /INSERT INTO MinisterioMenoresConsentimentos/.test(c.sql));
const consultouEstados = () => mockConsultas.some((c) => /FROM MinisterioMenoresConsentimentos c\s+WHERE c\.MenorMembroId IN/.test(c.sql));

beforeEach(() => {
  mockRegras = []; mockConsultas = []; registrarAuditoria.mockClear(); storage.excluirFoto.mockClear();
  RESPONSAVEIS = [{ menor: 30, resp: 40 }, { menor: 30, resp: 41 }, { menor: 31, resp: 40 }];
  LINHAS = [];
  instalarBanco();
});

const CONCEDE = () => ({ menorId: 30, finalidade: "IMAGEM", aceito: true, termoHash: HASH("IMAGEM") });
const TODAS = [["GET", "textos"], ["GET", "meus-menores"], ["GET", "menor"], ["POST", "conceder"], ["POST", "revogar"], ["POST", "registrar-ficha"]];

describe("a porta de todas as rotas", () => {
  test("sem sessão: 401 em TODAS as ações, e nada é consultado", async () => {
    for (const [metodo, acao] of TODAS) expect((await chamar(acao, { metodo })).status).toBe(401);
    expect(mockConsultas).toHaveLength(0);
  });
  test("token adulterado ou lixo: 401", async () => {
    for (const t of ["lixo", PIN() + "x", "a.b.c"]) expect((await chamar("textos", { token: t })).status).toBe(401);
  });
  test("termos de compromisso pendentes bloqueiam como em qualquer rota protegida (403 com a lista), sem consultar", async () => {
    const r = await chamar("meus-menores", { token: tokenDe(40, { via: "PIN", termosPendentes: ["CONFIDENCIALIDADE"] }) });
    expect(r.status).toBe(403);
    expect(mockConsultas).toHaveLength(0);
  });
  test("registrar-ficha: 403 ANTES de qualquer consulta para PIN (mesmo com a permissão no token), líder sem a permissão e permissão errada", async () => {
    const intrusos = [
      PIN(5), tokenDe(5, { via: "PIN", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["habilitacao_voluntarios"] }),
      SECRETARIA({ permissoes: ["pessoas"] }), SECRETARIA({ permissoes: [] }), tokenDe(5, { via: "CODIGO", escopoCongregacoes: "TODAS", permissoes: ["habilitacao_voluntarios"] })
    ];
    for (const t of intrusos) {
      const r = await chamar("registrar-ficha", { metodo: "POST", token: t, corpo: { menorId: 30, responsavelId: 40, finalidade: "IMAGEM", concedido: true, referencia: "Ficha 1" } });
      expect(r.status).toBe(403);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("ação e método desconhecidos", async () => {
    expect((await chamar("nao-existe", { token: PIN() })).status).toBe(404);
    expect((await chamar("nao-existe", { metodo: "POST", token: PIN() })).status).toBe(404);
    expect((await chamar("conceder", { token: PIN() })).status).toBe(404);                 // conceder é POST
    expect((await chamar("textos", { metodo: "POST", token: PIN() })).status).toBe(404);
    expect((await chamar("textos", { metodo: "DELETE", token: PIN() })).status).toBe(405);
  });
  test("corpo que não é objeto é tratado como vazio (400, nunca 500)", async () => {
    for (const corpo of ["texto", [1, 2], 5, null]) expect((await chamar("conceder", { metodo: "POST", token: PIN(), corpo })).status).toBe(400);
  });
});

describe("identificadores como o HTTP os entrega (texto) e o ataque de formato", () => {
  const RUINS = ["abc", "0x10", "1e1", "-1", "0", "1.5", "1;DROP TABLE X", "99999999999999999999", " ", ""];
  test("menorId malformado em QUALQUER ação é 400 — nunca erro 500, consulta nem gravação", async () => {
    for (const v of RUINS) {
      expect((await chamar("menor", { token: PIN(), query: { menorId: v } })).status).toBe(400);
      for (const acao of ["conceder", "revogar", "registrar-ficha"]) {
        expect((await chamar(acao, { metodo: "POST", token: acao === "registrar-ficha" ? SECRETARIA() : PIN(), corpo: { ...CONCEDE(), menorId: v, responsavelId: 40, concedido: true, referencia: "Ficha 1" } })).status).toBe(400);
      }
    }
    expect((await chamar("menor", { token: PIN() })).status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
  test("menorId que não é número nem texto de dígitos (true, [30], {}, null) também é 400", async () => {
    for (const v of [true, [30], { a: 1 }, null, undefined]) {
      for (const acao of ["conceder", "revogar"]) expect((await chamar(acao, { metodo: "POST", token: PIN(), corpo: { ...CONCEDE(), menorId: v } })).status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("responsavelId malformado na ficha é 400; finalidade fora da lista é 400 (sem consultar)", async () => {
    for (const v of [...RUINS, true, [40], null, undefined]) {
      expect((await chamar("registrar-ficha", { metodo: "POST", token: SECRETARIA(), corpo: { menorId: 30, responsavelId: v, finalidade: "IMAGEM", concedido: true, referencia: "Ficha 1" } })).status).toBe(400);
    }
    for (const f of [undefined, "", "FOTO", 5, ["IMAGEM"], "IMAGEM,SAUDE_CRACHA"]) {
      for (const acao of ["conceder", "revogar"]) expect((await chamar(acao, { metodo: "POST", token: PIN(), corpo: { ...CONCEDE(), finalidade: f } })).status).toBe(400);
      expect((await chamar("registrar-ficha", { metodo: "POST", token: SECRETARIA(), corpo: { menorId: 30, responsavelId: 40, finalidade: f, concedido: true, referencia: "Ficha 1" } })).status).toBe(400);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("menorId em texto de dígitos ('30') vira o número 30 na consulta", async () => {
    const r = await chamar("menor", { token: PIN(40), query: { menorId: "30" } });
    expect(r.status).toBe(200);
    expect(mockConsultas.find((c) => /SELECT TOP 1 ResponsavelId FROM VoluntariadoResponsaveis/.test(c.sql)).inputs).toEqual({ mn: 30, rs: 40 });
  });
});

describe("leitura", () => {
  test("textos: o texto vigente de cada finalidade, com o hash que a tela devolve ao autorizar (qualquer login, inclusive PIN)", async () => {
    const r = await chamar("textos", { token: PIN() });
    expect(r.status).toBe(200);
    expect(r.body.versao).toBe(1);
    expect(r.body.finalidades.map((f) => f.codigo)).toEqual(["IMAGEM", "SAUDE_CRACHA"]);
    expect(r.body.textos.map((t) => [t.finalidade, t.hash])).toEqual([["IMAGEM", HASH("IMAGEM")], ["SAUDE_CRACHA", HASH("SAUDE_CRACHA")]]);
    expect(r.body.textos[0].itens.map((i) => i.codigo)).toContain("REVOGAR");
    expect(mockConsultas).toHaveLength(0);
  });
  test("meus-menores (sessão de PIN): só os menores de quem o logado é responsável ativo, com os dois estados", async () => {
    LINHAS = [linhaBD()];
    const r = await chamar("meus-menores", { token: PIN(40) });
    expect(r.status).toBe(200);
    expect(r.body.menores.map((m) => m.menorId)).toEqual([30, 31]);
    expect(r.body.menores[0]).toMatchObject({ nome: "Caio Souza", idade: 10 });
    expect(r.body.menores[0].estados.IMAGEM).toMatchObject({ situacao: "CONCEDIDO", concedidoPorVoce: true });
    expect(r.body.menores[1].estados.IMAGEM.situacao).toBe("NUNCA_DADO");
    expect(JSON.stringify(r.body)).not.toMatch(/DataNascimento|FotoUrl|armazem/);
    expect((await chamar("meus-menores", { token: PIN(50) })).body.menores).toEqual([]);
  });
  test("menor: o responsável ativo vê (visão RESPONSAVEL, sem matrícula dos outros, sem data de nascimento); o outro responsável ativo também vê", async () => {
    LINHAS = [linhaBD()];
    for (const quem of [40, 41]) {
      const r = await chamar("menor", { token: PIN(quem), query: { menorId: 30 } });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ sucesso: true, visao: "RESPONSAVEL", menor: { membroId: 30, nome: "Caio Souza", idade: 10, aindaMenor: true } });
      expect(r.body.estados.IMAGEM).toMatchObject({ situacao: "CONCEDIDO", concedidoPorVoce: quem === 40 });
      expect(r.body.responsaveis.map((x) => x.nome)).toEqual(["Maria Souza", "João Souza"]);
      expect(JSON.stringify(r.body)).not.toMatch(/DataNascimento|FotoUrl|armazem|"membroId":4|Central/);
    }
  });
  test("menor: a Secretaria (liderança, permissão, pessoa no escopo) vê com a matrícula de quem concedeu e a congregação (visão GESTAO)", async () => {
    LINHAS = [linhaBD({ Forma: "FICHA_FISICA", Referencia: "Ficha 12" })];
    const r = await chamar("menor", { token: SECRETARIA(), query: { menorId: 30 } });
    expect(r.status).toBe(200);
    expect(r.body.visao).toBe("GESTAO");
    expect(r.body.menor.congregacaoNome).toBe("Central");
    expect(r.body.responsaveis.map((x) => x.membroId)).toEqual([40, 41]);
    expect(r.body.estados.IMAGEM).toMatchObject({ concedidoPorMembroId: 40, referencia: "Ficha 12" });
  });
  test("menor que já tem 18 anos (ou sem data de nascimento): 200 sem estados, com o motivo", async () => {
    for (const id of [32, 33]) {
      const r = await chamar("menor", { token: SECRETARIA(), query: { menorId: id } });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ estados: null, menor: { aindaMenor: false } });
      expect(r.body.mensagem.length).toBeGreaterThan(10);
    }
  });
  test("menor sem nenhum responsável ativo: a Secretaria o vê com SEM_RESPONSAVEL_ATIVO (pode ver; ninguém pode autorizar)", async () => {
    const r = await chamar("menor", { token: SECRETARIA(), query: { menorId: 34 } });
    expect(r.status).toBe(200);
    expect(r.body.estados.IMAGEM).toMatchObject({ situacao: "SEM_RESPONSAVEL_ATIVO", podeConceder: false });
    expect(r.body.responsaveis).toEqual([]);
  });
});

describe("quem não tem relação com o menor recebe a MESMA resposta de 'não existe' (404)", () => {
  test("menor inexistente × menor de que não sou responsável × pessoa fora do escopo da Secretaria × PIN que carrega a permissão: respostas idênticas, sem consultar os estados", async () => {
    LINHAS = [linhaBD()];
    const inexistente = await chamar("menor", { token: PIN(50), query: { menorId: 999 } });
    const alheio = await chamar("menor", { token: PIN(50), query: { menorId: 30 } });
    const ForaDoEscopo = await chamar("menor", { token: SECRETARIA(), query: { menorId: 31 } });               // Vila Nova: fora da Central
    const pinComPermissao = await chamar("menor", { token: tokenDe(5, { via: "PIN", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["habilitacao_voluntarios"] }), query: { menorId: 30 } });
    const outraPermissao = await chamar("menor", { token: SECRETARIA({ permissoes: ["pessoas"] }), query: { menorId: 30 } });
    const outraExtensao = await chamar("menor", { token: SECRETARIA({ escopoExtensaoNome: "Tenda Norte" }), query: { menorId: 30 } });
    for (const r of [inexistente, alheio, ForaDoEscopo, pinComPermissao, outraPermissao, outraExtensao]) {
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ sucesso: false, mensagem: "Menor não encontrado." });
    }
    expect(consultouEstados()).toBe(false);
  });
  test("o responsável REVOGADO deixa de ver (404)", async () => {
    RESPONSAVEIS = RESPONSAVEIS.filter((r) => r.resp !== 41);
    expect((await chamar("menor", { token: PIN(41), query: { menorId: 30 } })).status).toBe(404);
  });
});

describe("conceder", () => {
  test("o responsável concede com a sessão de PIN: 201, linha com o IP REAL do cliente (penúltimo do x-forwarded-for), a versão e o hash vigentes; o corpo não escolhe quem é o responsável", async () => {
    const r = await chamar("conceder", { metodo: "POST", token: PIN(40), headers: { ...CLIENTE, "x-azure-clientip": "9.9.9.9" }, corpo: { ...CONCEDE(), responsavelId: 41, RegistradoPorMembroId: 5, forma: "FICHA_FISICA", ip: "1.1.1.1" } });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ sucesso: true, consentimentoId: 77, estado: { situacao: "CONCEDIDO", vigente: true, concedidoPorVoce: true } });
    expect(insercao().inputs).toMatchObject({ mn: 30, rs: 40, f: "IMAGEM", c: 1, ver: 1, h: HASH("IMAGEM"), forma: "CLICK_RESP", ip: "177.87.165.132", por: null, ref: null });
    expect(JSON.parse(insercao().inputs.cad)).toMatchObject({ "x-forwarded-for": "177.87.165.132:24294, 40.70.146.136:36945", "x-azure-clientip": "9.9.9.9" });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "MENOR_CONSENTIMENTO_CONCEDIDO", usuarioId: 40 });
    expect(JSON.stringify(registrarAuditoria.mock.calls)).not.toMatch(/177\.87|forwarded/);
  });
  test("um x-forwarded-for forjado pelo cliente (valores à esquerda) não vira o IP gravado", async () => {
    await chamar("conceder", { metodo: "POST", token: PIN(40), headers: { "x-forwarded-for": "6.6.6.6, 177.87.165.132:24294, 40.70.146.136:36945" }, corpo: CONCEDE() });
    expect(insercao().inputs.ip).toBe("177.87.165.132");
  });
  test("sem IP público identificável (ausente, privado, lixo, uma entrada privada): 422 e NADA é gravado", async () => {
    for (const h of [{}, { "x-forwarded-for": "10.0.0.5, 40.70.146.136:36945" }, { "x-forwarded-for": "lixo, lixo2" }, { "x-forwarded-for": "192.168.0.7" }, { "x-forwarded-for": "127.0.0.1" }, { "x-azure-clientip": "177.1.2.3" }]) {
      const r = await chamar("conceder", { metodo: "POST", token: PIN(40), headers: h, corpo: CONCEDE() });
      expect(r.status).toBe(422);
      expect(r.body.mensagem).toMatch(/origem da conexão/);
    }
    expect(escritas()).toHaveLength(0);
  });
  test("caixa não marcada de qualquer jeito, e o hash velho ('o texto mudou'): 422, com termoMudou:true no segundo; nada gravado", async () => {
    for (const aceito of [false, "true", 1, "on", undefined, null]) {
      const r = await chamar("conceder", { metodo: "POST", token: PIN(40), headers: CLIENTE, corpo: { ...CONCEDE(), aceito } });
      expect(r.status).toBe(422);
      expect(r.body.mensagem).toMatch(/caixa de aceite/);
    }
    for (const termoHash of ["0".repeat(64), HASH("SAUDE_CRACHA"), undefined, 5]) {
      const r = await chamar("conceder", { metodo: "POST", token: PIN(40), headers: CLIENTE, corpo: { ...CONCEDE(), termoHash } });
      expect(r.status).toBe(422);
      expect(r.body.termoMudou).toBe(true);
    }
    expect(escritas()).toHaveLength(0);
  });
  test("quem não é responsável deste menor (estranho, o próprio menor, responsável de OUTRO menor, menor inexistente): 403 igual, nada gravado", async () => {
    const casos = [[PIN(50), 30], [PIN(30), 30], [PIN(41), 31], [PIN(40), 999], [PIN(40), 34]];
    const respostas = [];
    for (const [t, menorId] of casos) respostas.push(await chamar("conceder", { metodo: "POST", token: t, headers: CLIENTE, corpo: { ...CONCEDE(), menorId } }));
    for (const r of respostas) { expect(r.status).toBe(403); expect(r.body).toEqual({ sucesso: false, proibido: true, mensagem: mc.MENSAGENS.NAO_E_RESPONSAVEL }); }
    expect(escritas()).toHaveLength(0);
  });
  test("o responsável foi REVOGADO: perde o poder de autorizar na hora (403)", async () => {
    RESPONSAVEIS = RESPONSAVEIS.filter((r) => r.resp !== 40);
    expect((await chamar("conceder", { metodo: "POST", token: PIN(40), headers: CLIENTE, corpo: CONCEDE() })).status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
  test("adulto no lugar do menor e 'menor' sem data de nascimento: 422 com o motivo, nada gravado", async () => {
    RESPONSAVEIS.push({ menor: 32, resp: 40 }, { menor: 33, resp: 40 });
    for (const [menorId, motivo] of [[32, /18 anos ou mais/], [33, /data de nascimento/]]) {
      const r = await chamar("conceder", { metodo: "POST", token: PIN(40), headers: CLIENTE, corpo: { ...CONCEDE(), menorId } });
      expect(r.status).toBe(422);
      expect(r.body.mensagem).toMatch(motivo);
    }
    expect(escritas()).toHaveLength(0);
  });
  test("já concedido por este mesmo texto: 422 sem gravar de novo; depois de revogado, grava a linha nova", async () => {
    LINHAS = [linhaBD()];
    const r = await chamar("conceder", { metodo: "POST", token: PIN(41), headers: CLIENTE, corpo: CONCEDE() });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toBe(mc.mensagemJaConcedido());
    expect(escritas()).toHaveLength(0);
    LINHAS = [linhaBD({ Concedido: 0 })];
    expect((await chamar("conceder", { metodo: "POST", token: PIN(41), headers: CLIENTE, corpo: CONCEDE() })).status).toBe(201);
  });
  test("SAUDE_CRACHA tem o seu próprio texto e hash: o hash da IMAGEM não vale por ela", async () => {
    expect((await chamar("conceder", { metodo: "POST", token: PIN(40), headers: CLIENTE, corpo: { ...CONCEDE(), finalidade: "SAUDE_CRACHA" } })).body.termoMudou).toBe(true);
    const ok = await chamar("conceder", { metodo: "POST", token: PIN(40), headers: CLIENTE, corpo: { ...CONCEDE(), finalidade: "SAUDE_CRACHA", termoHash: HASH("SAUDE_CRACHA") } });
    expect(ok.status).toBe(201);
    expect(insercao().inputs).toMatchObject({ f: "SAUDE_CRACHA", h: HASH("SAUDE_CRACHA") });
  });
});

describe("revogar", () => {
  test("qualquer responsável ativo revoga, em sessão de PIN: 200, linha de revogação e a FOTO é apagada (referência zerada + blob excluído)", async () => {
    LINHAS = [linhaBD()];
    const r = await chamar("revogar", { metodo: "POST", token: PIN(41), headers: CLIENTE, corpo: { menorId: 30, finalidade: "IMAGEM" } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sucesso: true, fotoApagada: true, estado: { situacao: "REVOGADO", vigente: false } });
    expect(r.body.mensagem).toMatch(/foto de Caio Souza foi apagada e a imagem deixa de ser usada/);
    expect(insercao().inputs).toMatchObject({ rs: 41, c: 0, ip: "177.87.165.132" });
    expect(mockConsultas.some((c) => /UPDATE MembroReferencia SET FotoUrl = NULL/.test(c.sql) && c.inputs.id === 30)).toBe(true);
    expect(storage.excluirFoto).toHaveBeenCalledWith(30);
  });
  test("revogar não exige caixa, hash nem IP público: sem nada disso a revogação passa (com o marcador de IP)", async () => {
    LINHAS = [linhaBD()];
    const r = await chamar("revogar", { metodo: "POST", token: PIN(40), corpo: { menorId: 30, finalidade: "IMAGEM", aceito: false, termoHash: "lixo" } });
    expect(r.status).toBe(200);
    expect(insercao().inputs.ip).toBe("indisponivel");
    // com um IP privado, vale o que houver
    mockConsultas = [];
    LINHAS = [linhaBD()];
    await chamar("revogar", { metodo: "POST", token: PIN(40), headers: { "x-forwarded-for": "10.0.0.5, 40.70.146.136:36945" }, corpo: { menorId: 30, finalidade: "IMAGEM" } });
    expect(insercao().inputs.ip).toBe("10.0.0.5");
  });
  test("revogar a SAÚDE não mexe na foto", async () => {
    LINHAS = [linhaBD({ Finalidade: "SAUDE_CRACHA", TextoHash: HASH("SAUDE_CRACHA") })];
    const r = await chamar("revogar", { metodo: "POST", token: PIN(40), headers: CLIENTE, corpo: { menorId: 30, finalidade: "SAUDE_CRACHA" } });
    expect(r.status).toBe(200);
    expect(r.body.fotoApagada).toBe(false);
    expect(storage.excluirFoto).not.toHaveBeenCalled();
  });
  test("quem não é responsável ativo (estranho, o próprio menor, responsável revogado): 403 e a foto NÃO é apagada", async () => {
    RESPONSAVEIS = RESPONSAVEIS.filter((r) => r.resp !== 41);
    for (const t of [PIN(50), PIN(30), PIN(41)]) expect((await chamar("revogar", { metodo: "POST", token: t, headers: CLIENTE, corpo: { menorId: 30, finalidade: "IMAGEM" } })).status).toBe(403);
    expect(escritas()).toHaveLength(0);
    expect(storage.excluirFoto).not.toHaveBeenCalled();
  });
  test("o menor já fez 18 anos: o responsável não revoga mais por ele (422), e a foto fica", async () => {
    RESPONSAVEIS.push({ menor: 32, resp: 40 });
    const r = await chamar("revogar", { metodo: "POST", token: PIN(40), headers: CLIENTE, corpo: { menorId: 32, finalidade: "IMAGEM" } });
    expect(r.status).toBe(422);
    expect(storage.excluirFoto).not.toHaveBeenCalled();
  });
  test("a Secretaria NÃO revoga por esta rota (a revogação é do responsável; a ficha é pelo registrar-ficha)", async () => {
    const r = await chamar("revogar", { metodo: "POST", token: SECRETARIA(), headers: CLIENTE, corpo: { menorId: 30, finalidade: "IMAGEM" } });
    expect(r.status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
});

describe("registrar-ficha (a Secretaria registra a ficha assinada pelo responsável)", () => {
  const FICHA = (extra = {}) => ({ menorId: 30, responsavelId: 40, finalidade: "IMAGEM", concedido: true, referencia: "Ficha 12, pasta azul", ...extra });
  test("dentro do escopo: 201, FICHA_FISICA com a referência e quem registrou, SEM IP; audita só ids", async () => {
    const r = await chamar("registrar-ficha", { metodo: "POST", token: SECRETARIA(), corpo: FICHA() });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ sucesso: true, consentimentoId: 77, estado: { situacao: "CONCEDIDO", forma: "FICHA_FISICA" } });
    expect(insercao().inputs).toMatchObject({ mn: 30, rs: 40, f: "IMAGEM", c: 1, forma: "FICHA_FISICA", ip: null, cad: null, ref: "Ficha 12, pasta azul", por: 5 });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "MENOR_CONSENTIMENTO_FICHA", usuarioId: 5 });
    expect(JSON.stringify(registrarAuditoria.mock.calls)).not.toMatch(/pasta azul/);
  });
  test("a ficha que revoga a imagem também apaga a foto", async () => {
    LINHAS = [linhaBD()];
    const r = await chamar("registrar-ficha", { metodo: "POST", token: SECRETARIA(), corpo: FICHA({ concedido: false }) });
    expect(r.status).toBe(201);
    expect(r.body.fotoApagada).toBe(true);
    expect(storage.excluirFoto).toHaveBeenCalledWith(30);
  });
  test("pessoa FORA do escopo (outra congregação, outra Extensão) e menor inexistente: a MESMA resposta (403), nada gravado", async () => {
    const fora = await chamar("registrar-ficha", { metodo: "POST", token: SECRETARIA(), corpo: FICHA({ menorId: 31 }) });                       // Vila Nova
    const outraExtensao = await chamar("registrar-ficha", { metodo: "POST", token: SECRETARIA({ escopoExtensaoNome: "Tenda Norte" }), corpo: FICHA() });
    const inexistente = await chamar("registrar-ficha", { metodo: "POST", token: SECRETARIA(), corpo: FICHA({ menorId: 999 }) });
    for (const r of [fora, outraExtensao, inexistente]) expect(r.status).toBe(403);
    expect(outraExtensao).toEqual(fora);
    expect(inexistente).toEqual(fora);
    expect(escritas()).toHaveLength(0);
  });
  test("o escopo geral registra em qualquer congregação", async () => {
    RESPONSAVEIS.push({ menor: 31, resp: 40 });
    const r = await chamar("registrar-ficha", { metodo: "POST", token: SECRETARIA({ escopoCongregacoes: "TODAS", nivel: "GLOBAL" }), corpo: FICHA({ menorId: 31 }) });
    expect(r.status).toBe(201);
  });
  test("quem registra é o próprio responsável (a Secretaria que também é o responsável) ou o próprio menor: 403; sem gravar", async () => {
    RESPONSAVEIS.push({ menor: 30, resp: 5 });
    const comoResponsavel = await chamar("registrar-ficha", { metodo: "POST", token: SECRETARIA(), corpo: FICHA({ responsavelId: 5 }) });
    expect(comoResponsavel.status).toBe(403);
    expect(comoResponsavel.body.mensagem).toMatch(/próprio responsável/);
    expect(escritas()).toHaveLength(0);
  });
  test("o responsável da ficha não é ativo deste menor: 422 com a orientação; concedido 'true' em texto e referência com marca: 422", async () => {
    const naoAtivo = await chamar("registrar-ficha", { metodo: "POST", token: SECRETARIA(), corpo: FICHA({ responsavelId: 50 }) });
    expect(naoAtivo.status).toBe(422);
    expect(naoAtivo.body.mensagem).toMatch(/Cadastre o responsável/);
    for (const extra of [{ concedido: "true" }, { concedido: 1 }, { referencia: "<img src=x>" }, { referencia: "ab" }, { referencia: ["Ficha 12"] }]) {
      expect((await chamar("registrar-ficha", { metodo: "POST", token: SECRETARIA(), corpo: FICHA(extra) })).status).toBe(422);
    }
    expect(escritas()).toHaveLength(0);
  });
  test("adulto e sem data de nascimento: 422", async () => {
    RESPONSAVEIS.push({ menor: 32, resp: 40 }, { menor: 33, resp: 40 });
    for (const menorId of [32, 33]) expect((await chamar("registrar-ficha", { metodo: "POST", token: SECRETARIA(), corpo: FICHA({ menorId }) })).status).toBe(422);
    expect(escritas()).toHaveLength(0);
  });
});

describe("falha do banco", () => {
  test("erro inesperado vira 500 com mensagem genérica (sem vazar o erro do banco)", async () => {
    mockRegras.unshift([/FROM VoluntariadoResponsaveis r\s*JOIN MembroReferencia mn|JOIN MembroReferencia mn ON mn\.MembroId = r\.MenorMembroId/, () => { throw new Error("Login failed for user 'segredo' on server srv-interno"); }]);
    const r = await chamar("meus-menores", { token: PIN(40) });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/segredo|srv-interno|Login failed/);
  });
});
