// FASE 10, v10.1e, passo 9 de Membros (22/11/2026) — a ROTA da importação dos membros do sistema pago (api/ImportacaoMembros): quem pode (só a Secretaria
// Geral), a confirmação reforçada (428), o limite de prévias, o 405 e o erro que não vaza. A camada do banco é simulada aqui; o caminho no banco de verdade
// está no roteiro e2e-96 (tools/e2e-localdb).
jest.mock("../db", () => ({ getPool: jest.fn(async () => ({ fake: true })), sql: {} }));
jest.mock("../importacaoMembrosDb", () => ({
  estado: jest.fn(async () => ({ sucesso: true, feita: false, emAndamento: false, importacao: null, restantes: null })),
  listar: jest.fn(async () => ({ sucesso: true, itens: [] })),
  csv: jest.fn(async () => "﻿Linha;Matrícula\r\n"),
  criarPrevia: jest.fn(async () => ({ sucesso: true, importacaoId: 7, resumo: { total: 1 } })),
  descartar: jest.fn(async () => ({ sucesso: true })),
  descartarParada: jest.fn(async () => ({ sucesso: true })),
  confirmar: jest.fn(async () => ({ sucesso: true, importacaoId: 7, restantes: 3 })),
  importarLote: jest.fn(async () => ({ sucesso: true, importacaoId: 7, importadas: 3, restantes: 0, concluida: true }))
}));

const auth = require("../auth");
const db = require("../importacaoMembrosDb");
const handler = require("../../ImportacaoMembros/index.js");

const fator = () => ({ via: "CHAVE", em: Date.now() });
let proximoId = 100;
const tok = {
  geral: (membroId = proximoId++, extra = {}) => auth.reassinarSessao({ membroId, via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS",
    permissoes: ["pessoas"], termosPendentes: [], ...extra }),
  local: () => auth.reassinarSessao({ membroId: 9, via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"], permissoes: ["pessoas"], termosPendentes: [] }),
  semPessoas: () => auth.reassinarSessao({ membroId: 10, via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["reunioes"], termosPendentes: [] })
};
async function chamar({ metodo = "GET", acao = "", token, corpo, query = {} } = {}) {
  const context = { bindingData: { acao }, log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn(), info: jest.fn() }) };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context;
}
beforeEach(() => jest.clearAllMocks());

describe("quem pode", () => {
  test("sem sessão: 401; a liderança local e quem não tem 'pessoas': 403 — e o banco nem é chamado", async () => {
    expect((await chamar()).res.status).toBe(401);
    expect((await chamar({ token: tok.local() })).res.status).toBe(403);
    expect((await chamar({ token: tok.semPessoas() })).res.status).toBe(403);
    expect((await chamar({ metodo: "POST", acao: "lote", token: tok.local(), corpo: { importacaoId: 7 } })).res.status).toBe(403);
    for (const f of Object.values(db)) expect(f).not.toHaveBeenCalled();
  });
  test("a Secretaria Geral vê o estado, sem cache", async () => {
    const c = await chamar({ token: tok.geral() });
    expect(c.res.status).toBe(200);
    expect(c.res.headers["Cache-Control"]).toBe("no-store");
    expect(c.res.body).toEqual({ sucesso: true, feita: false, emAndamento: false, importacao: null, restantes: null });
  });
});

describe("cada ação chega à camada do banco com o que precisa", () => {
  test("a lista: a importação, o filtro e a página", async () => {
    await chamar({ acao: "lista", token: tok.geral(), query: { importacaoId: "7", filtro: "problemas", pagina: "2" } });
    expect(db.listar).toHaveBeenCalledWith({ fake: true }, "7", { filtro: "problemas", pagina: "2" });
  });
  test("o CSV: baixa como arquivo; sem a importação, 400", async () => {
    const c = await chamar({ acao: "lista.csv", token: tok.geral(), query: { importacaoId: "7" } });
    expect(c.res.status).toBe(200);
    expect(c.res.headers["Content-Type"]).toMatch(/text\/csv/);
    expect(c.res.headers["Content-Disposition"]).toMatch(/attachment/);
    db.csv.mockResolvedValueOnce(null);
    expect((await chamar({ acao: "lista.csv", token: tok.geral() })).res.status).toBe(400);
  });
  test("a prévia: sem o texto, 400 sem tocar no banco; com ele, o arquivo e quem fez; o 409 da camada passa adiante", async () => {
    expect((await chamar({ metodo: "POST", acao: "previa", token: tok.geral(), corpo: { nomeArquivo: "x.csv" } })).res.status).toBe(400);
    expect(db.criarPrevia).not.toHaveBeenCalled();
    const c = await chamar({ metodo: "POST", acao: "previa", token: tok.geral(4242), corpo: { nomeArquivo: "membros.csv", texto: "MATRÍCULA;NOME\r\n1;Ana" } });
    expect(c.res.status).toBe(200);
    expect(c.res.body).toEqual({ sucesso: true, importacaoId: 7, resumo: { total: 1 } });
    expect(db.criarPrevia).toHaveBeenCalledWith({ fake: true }, expect.objectContaining({ membroId: 4242 }), { nomeArquivo: "membros.csv", texto: "MATRÍCULA;NOME\r\n1;Ana" });
    db.criarPrevia.mockResolvedValueOnce({ sucesso: false, status: 409, mensagem: "A importação do sistema pago já foi feita (é uma vez só)." });
    const c2 = await chamar({ metodo: "POST", acao: "previa", token: tok.geral(), corpo: { texto: "x" } });
    expect(c2.res.status).toBe(409);
    expect(c2.res.body).toEqual({ sucesso: false, mensagem: "A importação do sistema pago já foi feita (é uma vez só)." });
  });
  // G2 (decisão dele de 24/11/2026): a importação só das linhas que faltaram é pedida com resto: true (só o true de verdade; o resto é a prévia de sempre)
  test("a prévia do resto: só resto === true vai à camada como resto; o lixo vira a prévia de sempre", async () => {
    await chamar({ metodo: "POST", acao: "previa", token: tok.geral(), corpo: { texto: "x", resto: true } });
    expect(db.criarPrevia).toHaveBeenLastCalledWith({ fake: true }, expect.anything(), { nomeArquivo: undefined, texto: "x", resto: true });
    for (const resto of ["true", 1, [true], { sim: true }, false, null]) {
      await chamar({ metodo: "POST", acao: "previa", token: tok.geral(5000 + db.criarPrevia.mock.calls.length), corpo: { texto: "x", resto } });
      expect(db.criarPrevia).toHaveBeenLastCalledWith({ fake: true }, expect.anything(), { nomeArquivo: undefined, texto: "x" });
    }
  });
  test("a prévia com o mapa das colunas escolhido na tela: a lista vai à camada; o que não é lista (ou é enorme) é 400 sem tocar no banco", async () => {
    await chamar({ metodo: "POST", acao: "previa", token: tok.geral(), corpo: { texto: "x", colunas: ["matricula", null] } });
    expect(db.criarPrevia).toHaveBeenCalledWith({ fake: true }, expect.anything(), { nomeArquivo: undefined, texto: "x", colunas: ["matricula", null] });
    db.criarPrevia.mockClear();
    for (const colunas of ["matricula", { 0: "nome" }, 7, new Array(201).fill(null)]) {
      expect((await chamar({ metodo: "POST", acao: "previa", token: tok.geral(), corpo: { texto: "x", colunas } })).res.status).toBe(400);
    }
    expect(db.criarPrevia).not.toHaveBeenCalled();
  });
  test("a prévia: no máximo 10 por minuto por pessoa (429 com Retry-After)", async () => {
    const t = tok.geral(5555);
    for (let i = 0; i < 10; i++) expect((await chamar({ metodo: "POST", acao: "previa", token: t, corpo: { texto: "x" } })).res.status).toBe(200);
    const c = await chamar({ metodo: "POST", acao: "previa", token: t, corpo: { texto: "x" } });
    expect(c.res.status).toBe(429);
    expect(Number(c.res.headers["Retry-After"])).toBeGreaterThan(0);
    expect(db.criarPrevia).toHaveBeenCalledTimes(10);
    expect((await chamar({ metodo: "POST", acao: "previa", token: tok.geral(5556), corpo: { texto: "x" } })).res.status).toBe(200);   // outra pessoa, outra conta
  });
  test("confirmar pede a confirmação recente de quem é (428) e, sem ela, nada muda", async () => {
    const semFator = auth.reassinarSessao({ membroId: 77, via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["pessoas"], termosPendentes: [] });
    const c = await chamar({ metodo: "POST", acao: "confirmar", token: semFator, corpo: { importacaoId: 7 } });
    expect(c.res.status).toBe(428);
    expect(c.res.body.precisaFator).toBe(true);
    expect(db.confirmar).not.toHaveBeenCalled();
    const velho = auth.reassinarSessao({ membroId: 78, via: "SENHA", fator: { via: "CHAVE", em: Date.now() - 11 * 60 * 1000 }, nivel: "GLOBAL", escopoCongregacoes: "TODAS",
      permissoes: ["pessoas"], termosPendentes: [] });
    expect((await chamar({ metodo: "POST", acao: "confirmar", token: velho, corpo: { importacaoId: 7 } })).res.status).toBe(428);
    const c2 = await chamar({ metodo: "POST", acao: "confirmar", token: tok.geral(79), corpo: { importacaoId: 7 } });
    expect(c2.res.status).toBe(200);
    expect(db.confirmar).toHaveBeenCalledWith({ fake: true }, expect.objectContaining({ membroId: 79 }), 7);
  });
  // G2 (decisão dele de 24/11/2026): descartar a importação JÁ CONFIRMADA (a parada sem ninguém importado) é ato sensível como confirmar: pede o fator recente
  test("descartar a importação parada pede a confirmação recente (428) e, sem ela, nada muda", async () => {
    const semFator = auth.reassinarSessao({ membroId: 82, via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["pessoas"], termosPendentes: [] });
    const c = await chamar({ metodo: "POST", acao: "descartar-parada", token: semFator, corpo: { importacaoId: 7 } });
    expect(c.res.status).toBe(428);
    expect(db.descartarParada).not.toHaveBeenCalled();
    expect((await chamar({ metodo: "POST", acao: "descartar-parada", token: tok.local(), corpo: { importacaoId: 7 } })).res.status).toBe(403);
    expect(db.descartarParada).not.toHaveBeenCalled();
    const c2 = await chamar({ metodo: "POST", acao: "descartar-parada", token: tok.geral(83), corpo: { importacaoId: 7 } });
    expect(c2.res.status).toBe(200);
    expect(db.descartarParada).toHaveBeenCalledWith({ fake: true }, expect.objectContaining({ membroId: 83 }), 7);
    expect((await chamar({ metodo: "GET", acao: "descartar-parada", token: tok.geral(83) })).res.status).toBe(405);
  });
  test("descartar e o lote", async () => {
    expect((await chamar({ metodo: "POST", acao: "descartar", token: tok.geral(80), corpo: { importacaoId: 7 } })).res.status).toBe(200);
    expect(db.descartar).toHaveBeenCalledWith({ fake: true }, expect.objectContaining({ membroId: 80 }), 7);
    const c = await chamar({ metodo: "POST", acao: "lote", token: tok.geral(81), corpo: { importacaoId: 7 } });
    expect(c.res.body).toEqual({ sucesso: true, importacaoId: 7, importadas: 3, restantes: 0, concluida: true });
    expect(db.importarLote).toHaveBeenCalledWith({ fake: true }, expect.objectContaining({ membroId: 81 }), 7, { deixarDeFora: false });
    // A6: o "deixar de fora e continuar" só com true de verdade (nunca uma lista de linhas do cliente)
    await chamar({ metodo: "POST", acao: "lote", token: tok.geral(81), corpo: { importacaoId: 7, deixarDeFora: true, linhas: [2, 3] } });
    expect(db.importarLote).toHaveBeenLastCalledWith({ fake: true }, expect.anything(), 7, { deixarDeFora: true });
    for (const lixo of ["true", 1, [true], { a: 1 }]) {
      await chamar({ metodo: "POST", acao: "lote", token: tok.geral(81), corpo: { importacaoId: 7, deixarDeFora: lixo } });
      expect(db.importarLote).toHaveBeenLastCalledWith({ fake: true }, expect.anything(), 7, { deixarDeFora: false });
    }
  });
  test("o corpo que não é objeto vale como vazio (sem quebrar)", async () => {
    await chamar({ metodo: "POST", acao: "lote", token: tok.geral(), corpo: ["x"] });
    expect(db.importarLote).toHaveBeenCalledWith({ fake: true }, expect.anything(), undefined, { deixarDeFora: false });
  });
});

describe("o resto", () => {
  test("ação ou método desconhecido: 405", async () => {
    expect((await chamar({ metodo: "POST", acao: "apagar-tudo", token: tok.geral() })).res.status).toBe(405);
    expect((await chamar({ metodo: "DELETE", token: tok.geral() })).res.status).toBe(405);
    expect((await chamar({ metodo: "GET", acao: "previa", token: tok.geral() })).res.status).toBe(405);
  });
  test("o erro do banco vira 500 'Erro interno.' sem vazar a mensagem", async () => {
    db.estado.mockRejectedValueOnce(new Error("Login failed for user 'segredo'"));
    const c = await chamar({ token: tok.geral() });
    expect(c.res.status).toBe(500);
    expect(c.res.body).toEqual({ sucesso: false, mensagem: "Erro interno." });
  });
});
