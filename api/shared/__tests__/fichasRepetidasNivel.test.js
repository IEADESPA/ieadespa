// A mescla do acesso parte 3 no Membros (26/11/2026; regra do responsável de 25 e 26/11): quando a secretaria age pela pessoa que tem cargo de liderança
// vigente, vale a regra do nível do cargo (a secretaria do nível do cargo ou de cima) e a confirmação recente (428). Juntar duas fichas mexe no acesso dessa
// pessoa: a ficha que sai perde as sessões, os cargos passam para a ficha que fica (a matrícula da entrada muda) e o e-mail escolhido pode trocar (é por ele
// que chega o código de acesso). Desfazer a junção mexe de novo nos dois. A conferência vem DEPOIS do escopo: fora do escopo e inexistente continuam iguais.
let mockRegras = [];
jest.mock("../db", () => {
  const rodar = async (texto, inputs) => {
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [1] };
    return { recordset: [], rowsAffected: [0] };
  };
  const novaRequisicao = () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: (texto) => rodar(texto, inputs) }; return r; };
  const sql = new Proxy({}, { get: (_a, prop) => (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined) });
  return { getPool: async () => ({ request: novaRequisicao }), sql };
});
jest.mock("../juntarFichasDb", () => ({
  juntar: jest.fn(async () => ({ sucesso: true, juncaoId: 1 })),
  desfazer: jest.fn(async () => ({ sucesso: true })),
  DIAS_DESFAZER: 30
}));

const auth = require("../auth");
const db = require("../juntarFichasDb");
const handler = require("../../FichasRepetidas/index.js");

async function chamar(acao, corpo, token) {
  const context = { bindingData: { acao }, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: "POST", query: {}, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const fator = () => ({ via: "CHAVE", em: Date.now() });
const LOCAL = (comFator = true) => tokenDe(5, { via: "SENHA", ...(comFator ? { fator: fator() } : {}), nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], permissoes: ["pessoas"] });
const GERAL = (comFator = true) => tokenDe(1, { via: "SENHA", ...(comFator ? { fator: fator() } : {}), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["pessoas"] });

const FICHAS = { 10: { Nome: "Ana", CongregacaoNome: "Central" }, 11: { Nome: "Ana S.", CongregacaoNome: "Central" }, 20: { Nome: "Beto", CongregacaoNome: "Vila Nova" } };
let CARGOS;
beforeEach(() => {
  mockRegras = [];
  CARGOS = {};
  db.juntar.mockClear();
  db.desfazer.mockClear();
  quando(/SELECT m\.MembroId, m\.Nome, m\.Status, c\.Nome AS CongregacaoNome/, (i) => (FICHAS[i.id] ? [{ MembroId: i.id, Status: "ATIVO", ExtensaoNome: null, ...FICHAS[i.id] }] : []));
  quando(/FROM Lideranca l WHERE l\.MembroId = @id/, (i) => CARGOS[Number(i.id)] || []);
  quando(/FROM JuncoesFichas WHERE JuncaoId = @id/, (i) => (Number(i.id) === 7 ? [{ MatriculaFica: 10, MatriculaSai: 11 }] : []));
});

describe("juntar fichas de quem tem cargo de liderança", () => {
  test("sem cargo nas duas: a secretaria local junta como antes (sem a confirmação recente)", async () => {
    const r = await chamar("juntar", { a: 10, b: 11, escolhas: {}, versao: "x" }, LOCAL(false));
    expect(r.body.sucesso).toBe(true);
    expect(db.juntar).toHaveBeenCalledTimes(1);
  });
  test("uma das fichas tem cargo geral: a secretaria local não junta (403, nada chamado); a Geral junta só com a confirmação recente", async () => {
    CARGOS[11] = [{ EscopoTipo: "GLOBAL", EscopoId: null }];
    const local = await chamar("juntar", { a: 10, b: 11, escolhas: {}, versao: "x" }, LOCAL());
    expect(local.status).toBe(403);
    expect(local.body.mensagem).toMatch(/junta as fichas/);
    expect((await chamar("juntar", { a: 10, b: 11, escolhas: {}, versao: "x" }, GERAL(false))).status).toBe(428);
    expect(db.juntar).not.toHaveBeenCalled();
    expect((await chamar("juntar", { a: 10, b: 11, escolhas: {}, versao: "x" }, GERAL())).body.sucesso).toBe(true);
    expect(db.juntar).toHaveBeenCalledTimes(1);
  });
  test("fora do escopo continua a resposta da camada (não diz se a pessoa tem cargo)", async () => {
    CARGOS[20] = [{ EscopoTipo: "GLOBAL", EscopoId: null }];
    await chamar("juntar", { a: 10, b: 20, escolhas: {}, versao: "x" }, LOCAL());
    expect(db.juntar).toHaveBeenCalledTimes(1);   // quem decide "não encontrada" é a camada, como antes
  });
  test("desfazer a junção de quem tem cargo pede a confirmação recente", async () => {
    CARGOS[10] = [{ EscopoTipo: "GLOBAL", EscopoId: null }];
    expect((await chamar("desfazer", { juncaoId: 7, motivo: "engano" }, GERAL(false))).status).toBe(428);
    expect(db.desfazer).not.toHaveBeenCalled();
    expect((await chamar("desfazer", { juncaoId: 7, motivo: "engano" }, GERAL())).body.sucesso).toBe(true);
  });
});
