// Testes do login simplificado por código de e-mail (vB.5) — o que mais
// importa aqui: código expirado/usado/errado nunca autentica, e o cooldown
// de 1 minuto realmente barra pedidos em sequência.
const { criarPoolFalso } = require("./testUtils");
const codigoAcesso = require("../codigoAcesso");

describe("hashCodigo / conferirCodigo", () => {
  test("hash é determinístico e conferirCodigo aceita o código certo", () => {
    const codigo = "123456";
    const hash = codigoAcesso.hashCodigo(codigo);
    expect(codigoAcesso.conferirCodigo(codigo, hash)).toBe(true);
  });

  test("conferirCodigo rejeita código errado", () => {
    const hash = codigoAcesso.hashCodigo("123456");
    expect(codigoAcesso.conferirCodigo("000000", hash)).toBe(false);
  });

  test("conferirCodigo rejeita sem hash guardado (nunca autentica por acidente)", () => {
    expect(codigoAcesso.conferirCodigo("123456", null)).toBe(false);
  });
});

describe("gerarCodigo", () => {
  test("sempre 6 dígitos numéricos", () => {
    for (let i = 0; i < 20; i++) {
      const c = codigoAcesso.gerarCodigo();
      expect(c).toMatch(/^\d{6}$/);
    }
  });
});

describe("podeSolicitarCodigo (cooldown de 1 minuto)", () => {
  test("primeira solicitação sempre pode (nenhum código anterior)", async () => {
    const { pool } = criarPoolFalso([[]]);
    const r = await codigoAcesso.podeSolicitarCodigo(pool, 1);
    expect(r.podeEnviar).toBe(true);
  });

  test("bloqueia se o último código foi há menos de 1 minuto", async () => {
    const { pool } = criarPoolFalso([[{ CriadoEm: new Date().toISOString() }]]);
    const r = await codigoAcesso.podeSolicitarCodigo(pool, 1);
    expect(r.podeEnviar).toBe(false);
  });

  test("libera de novo depois de passado 1 minuto", async () => {
    const { pool } = criarPoolFalso([[{ CriadoEm: new Date(Date.now() - 61000).toISOString() }]]);
    const r = await codigoAcesso.podeSolicitarCodigo(pool, 1);
    expect(r.podeEnviar).toBe(true);
  });
});

describe("confirmarCodigo", () => {
  test("sem nenhum código pendente, recusa com mensagem clara", async () => {
    const { pool } = criarPoolFalso([[]]);
    const r = await codigoAcesso.confirmarCodigo(pool, 1, "123456");
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/nenhum código pendente/i);
  });

  test("código expirado é recusado mesmo se o hash bater", async () => {
    const hash = codigoAcesso.hashCodigo("123456");
    const { pool } = criarPoolFalso([[{ CodigoId: 1, CodigoHash: hash, ExpiraEm: new Date(Date.now() - 1000).toISOString() }]]);
    const r = await codigoAcesso.confirmarCodigo(pool, 1, "123456");
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/expirado/i);
  });

  test("código certo e dentro da validade confirma e marca como usado", async () => {
    const hash = codigoAcesso.hashCodigo("123456");
    const { pool, chamadas } = criarPoolFalso([
      [{ CodigoId: 9, CodigoHash: hash, ExpiraEm: new Date(Date.now() + 60000).toISOString() }],
      []
    ]);
    const r = await codigoAcesso.confirmarCodigo(pool, 1, "123456");
    expect(r.valido).toBe(true);
    expect(chamadas[1].sql).toMatch(/UPDATE CodigosAcessoMembro SET Usado = 1/);
    expect(chamadas[1].inputs.id).toBe(9);
  });

  test("código incorreto contra o pendente certo é recusado, sem marcar como usado", async () => {
    const hash = codigoAcesso.hashCodigo("123456");
    const { pool, chamadas } = criarPoolFalso([[{ CodigoId: 9, CodigoHash: hash, ExpiraEm: new Date(Date.now() + 60000).toISOString() }]]);
    const r = await codigoAcesso.confirmarCodigo(pool, 1, "000000");
    expect(r.valido).toBe(false);
    expect(chamadas).toHaveLength(1); // nunca chega no UPDATE
  });
});
