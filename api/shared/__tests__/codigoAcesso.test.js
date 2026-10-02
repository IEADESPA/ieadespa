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

describe("podeSolicitarCodigo (cooldown de 1 minuto e teto por hora)", () => {
  test("primeira solicitação sempre pode (nenhum código anterior)", async () => {
    const { pool } = criarPoolFalso([[{ Ultimo: null, Total: 0 }]]);
    const r = await codigoAcesso.podeSolicitarCodigo(pool, 1);
    expect(r.podeEnviar).toBe(true);
  });

  test("bloqueia se o último código foi há menos de 1 minuto", async () => {
    const { pool } = criarPoolFalso([[{ Ultimo: new Date().toISOString(), Total: 1 }]]);
    const r = await codigoAcesso.podeSolicitarCodigo(pool, 1);
    expect(r.podeEnviar).toBe(false);
  });

  test("libera de novo depois de passado 1 minuto", async () => {
    const { pool } = criarPoolFalso([[{ Ultimo: new Date(Date.now() - 61000).toISOString(), Total: 1 }]]);
    const r = await codigoAcesso.podeSolicitarCodigo(pool, 1);
    expect(r.podeEnviar).toBe(true);
  });

  test("teto de 5 códigos por hora para a mesma matrícula: do sexto em diante não envia (nem e-mail para a caixa de terceiro, nem 5 chutes novos a cada minuto)", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ Ultimo: new Date(Date.now() - 120000).toISOString(), Total: codigoAcesso.MAX_CODIGOS_POR_HORA }]]);
    const r = await codigoAcesso.podeSolicitarCodigo(pool, 1);
    expect(r.podeEnviar).toBe(false);
    expect(r.mensagem).toMatch(/uma hora/);
    expect(chamadas[0].sql).toMatch(/CriadoEm >= DATEADD\(HOUR, -1, SYSUTCDATETIME\(\)\)/);
    expect(codigoAcesso.MAX_CODIGOS_POR_HORA).toBe(5);
    const { pool: p2 } = criarPoolFalso([[{ Ultimo: new Date(Date.now() - 120000).toISOString(), Total: codigoAcesso.MAX_CODIGOS_POR_HORA - 1 }]]);
    expect((await codigoAcesso.podeSolicitarCodigo(p2, 1)).podeEnviar).toBe(true);
  });
});

describe("confirmarCodigo", () => {
  test("sem nenhum código pendente, recusa com mensagem clara", async () => {
    const { pool } = criarPoolFalso([[]]);
    const r = await codigoAcesso.confirmarCodigo(pool, 1, "123456");
    expect(r.valido).toBe(false);
    expect(r.mensagem).toBe(codigoAcesso.MENSAGEM_FALHA);
  });

  test("código expirado é recusado mesmo se o hash bater", async () => {
    const hash = codigoAcesso.hashCodigo("123456");
    const { pool } = criarPoolFalso([[{ CodigoId: 1, CodigoHash: hash, ExpiraEm: new Date(Date.now() - 1000).toISOString() }]]);
    const r = await codigoAcesso.confirmarCodigo(pool, 1, "123456");
    expect(r.valido).toBe(false);
    expect(r.mensagem).toBe(codigoAcesso.MENSAGEM_FALHA);
  });

  const pendente = (hash) => [{ CodigoId: 9, CodigoHash: hash, ExpiraEm: new Date(Date.now() + 60000).toISOString() }];

  const livreMembro = [{ EstavaBloqueado: false, Falhas: 1, BloqueadaAgora: false }];    // o contador do MEMBRO (canal CODIGO) devolve "livre"

  test("código certo e dentro da validade confirma, marca como usado, zera o contador do membro e invalida qualquer outro código pendente", async () => {
    const hash = codigoAcesso.hashCodigo("123456");
    const { pool, chamadas } = criarPoolFalso([pendente(hash), livreMembro, [{ Tentativas: 1 }], [{ CodigoId: 9 }], [], []]);
    const r = await codigoAcesso.confirmarCodigo(pool, 1, "123456");
    expect(r.valido).toBe(true);
    expect(chamadas[1].inputs).toMatchObject({ m: 1, c: "CODIGO", lim: codigoAcesso.LIMITE_TENTATIVAS_POR_MEMBRO });
    expect(chamadas[3].sql).toMatch(/UPDATE CodigosAcessoMembro SET Usado = 1/);
    expect(chamadas[3].sql).toMatch(/AND Usado = 0/);              // o uso é atômico: dois acertos ao mesmo tempo, só um entra
    expect(chamadas[3].inputs.id).toBe(9);
    expect(chamadas[4].sql).toMatch(/UPDATE AcessoTentativas SET Falhas = 0/);
    expect(chamadas[5].sql).toMatch(/UPDATE CodigosAcessoMembro SET Usado = 1 WHERE MembroId = @membroId AND Usado = 0/);
  });

  test("código incorreto contra o pendente certo é recusado: conta a tentativa (do membro e do código) e NÃO marca como usado", async () => {
    const hash = codigoAcesso.hashCodigo("123456");
    const { pool, chamadas } = criarPoolFalso([pendente(hash), livreMembro, [{ Tentativas: 1 }]]);
    const r = await codigoAcesso.confirmarCodigo(pool, 1, "000000");
    expect(r.valido).toBe(false);
    expect(chamadas).toHaveLength(3);                              // pendente + contador do membro + reserva do código; nunca chega no UPDATE de uso
    expect(chamadas[2].sql).toMatch(/Tentativas = Tentativas \+ 1/);
    expect(chamadas[2].inputs.lim).toBe(codigoAcesso.LIMITE_TENTATIVAS);
  });

  test("a quinta tentativa errada QUEIMA o código: é preciso pedir outro", async () => {
    const hash = codigoAcesso.hashCodigo("123456");
    const { pool, chamadas } = criarPoolFalso([pendente(hash), livreMembro, [{ Tentativas: codigoAcesso.LIMITE_TENTATIVAS }], []]);
    const r = await codigoAcesso.confirmarCodigo(pool, 1, "000000");
    expect(r.valido).toBe(false);
    expect(r.mensagem).toBe(codigoAcesso.MENSAGEM_FALHA);
    expect(chamadas[3].sql).toMatch(/UPDATE CodigosAcessoMembro SET Usado = 1/);
  });

  test("código que já gastou as tentativas não confere nem o código certo (a reserva falha antes da comparação)", async () => {
    const hash = codigoAcesso.hashCodigo("123456");
    const { pool, chamadas } = criarPoolFalso([pendente(hash), livreMembro, []]);          // a reserva não devolve linha: limite atingido ou já usado
    const r = await codigoAcesso.confirmarCodigo(pool, 1, "123456");
    expect(r.valido).toBe(false);
    expect(chamadas).toHaveLength(3);
  });

  test("dois acertos simultâneos com o mesmo código: o segundo perde (o uso não devolveu linha)", async () => {
    const hash = codigoAcesso.hashCodigo("123456");
    const { pool } = criarPoolFalso([pendente(hash), livreMembro, [{ Tentativas: 2 }], []]);
    expect((await codigoAcesso.confirmarCodigo(pool, 1, "123456")).valido).toBe(false);
  });

  test("membro BLOQUEADO no canal do código (10 erros somados, de qualquer código): nem o código certo vale, e a conferência nem chega a acontecer", async () => {
    const hash = codigoAcesso.hashCodigo("123456");
    const { pool, chamadas } = criarPoolFalso([pendente(hash), [{ EstavaBloqueado: true, Falhas: 10, BloqueadaAgora: true }]]);
    const r = await codigoAcesso.confirmarCodigo(pool, 1, "123456");
    expect(r).toEqual({ valido: false, mensagem: codigoAcesso.MENSAGEM_FALHA });
    expect(chamadas).toHaveLength(2);
    expect(codigoAcesso.LIMITE_TENTATIVAS_POR_MEMBRO).toBe(10);
  });

  test("emitir um código novo invalida os anteriores ainda não usados (senão o antigo voltaria a ser o pendente)", async () => {
    const { pool, chamadas } = criarPoolFalso([[], []]);
    await codigoAcesso.registrarCodigo(pool, 1, "654321");
    expect(chamadas[0].sql).toMatch(/UPDATE CodigosAcessoMembro SET Usado = 1 WHERE MembroId = @membroId AND Usado = 0/);
    expect(chamadas[1].sql).toMatch(/INSERT INTO CodigosAcessoMembro/);
    expect(JSON.stringify(chamadas)).not.toContain("654321");        // só o hash
  });
});
