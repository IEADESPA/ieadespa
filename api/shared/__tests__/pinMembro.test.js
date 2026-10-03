// PIN de 4 dígitos do membro (fecho da v7.5): o que torna 10 mil combinações aceitável — PIN fácil recusado, hash que não se desfaz com o banco sozinho,
// e a tentativa RESERVADA no banco antes de conferir. O comportamento contra o SQL Server de verdade está no roteiro ponta a ponta.
const { criarPoolFalso } = require("./testUtils");
const pin = require("../pinMembro");

describe("formato do PIN", () => {
  test("só texto com exatamente 4 dígitos ASCII", () => {
    expect(pin.formatoPinValido("0042")).toBe(true);
    expect(pin.formatoPinValido("7392")).toBe(true);
    for (const v of [1234, 7392, "123", "12345", "12a4", " 123", "123 ", "１２３４", "-123", "1.23", "", null, undefined, ["1234"], { a: 1 }, true]) {
      expect(pin.formatoPinValido(v)).toBe(false);
    }
  });
});

describe("PIN fácil de adivinhar é recusado", () => {
  test.each(["0000", "1111", "9999", "1234", "2345", "6789", "4321", "9876", "3210", "0123", "1212", "2121", "1313", "0909", "1122", "3344", "2580", "1004", "6969", "5555", "7777"])(
    "%s é fraco", (p) => expect(pin.pinFraco(p).fraco).toBe(true));
  test("qualquer ano entre 1930 e 2035 (ano de nascimento ou o atual)", () => {
    for (const ano of ["1930", "1957", "1985", "2008", "2026", "2035"]) expect(pin.pinFraco(ano).fraco).toBe(true);
    for (const ok of ["1929", "2036", "2100"]) expect(pin.pinFraco(ok).fraco).toBe(false);
  });
  test.each(["7392", "4081", "2957", "8140", "6205", "9473"])("%s passa", (p) => expect(pin.pinFraco(p)).toEqual({ fraco: false }));
  test("a data de nascimento da PRÓPRIA pessoa: dia+mês, mês+dia (aceita texto e Date)", () => {
    expect(pin.pinFraco("2703", { nascimento: "1985-03-27" }).fraco).toBe(true);
    expect(pin.pinFraco("0327", { nascimento: "1985-03-27" }).fraco).toBe(true);
    expect(pin.pinFraco("2703", { nascimento: new Date("1985-03-27T00:00:00Z") }).fraco).toBe(true);
    expect(pin.pinFraco("2703", { nascimento: "1990-01-01" }).fraco).toBe(false);          // é de outra pessoa
    expect(pin.pinFraco("2703", { nascimento: null }).fraco).toBe(false);
    expect(pin.pinFraco("2703", { nascimento: "lixo" }).fraco).toBe(false);
  });
  test("o final da matrícula, com zeros à esquerda", () => {
    expect(pin.pinFraco("4567", { matricula: 1234567 }).fraco).toBe(true);
    expect(pin.pinFraco("0042", { matricula: 42 }).fraco).toBe(true);
    expect(pin.pinFraco("4568", { matricula: 1234567 }).fraco).toBe(false);
  });
  test("a mensagem diz o motivo e manda escolher outro", () => {
    const f = pin.pinFraco("1234");
    expect(pin.mensagemPinFraco(f)).toMatch(/fácil de adivinhar \(.*sequência.*\)\. Escolha outro/);
  });
});

describe("PIN provisório que a Secretaria entrega", () => {
  test("é sempre de 4 dígitos e nunca fraco (nem para a própria pessoa)", () => {
    for (let i = 0; i < 300; i++) {
      const p = pin.gerarPinProvisorio({ nascimento: "1985-03-27", matricula: 1234567 });
      expect(p).toMatch(/^\d{4}$/);
      expect(pin.pinFraco(p, { nascimento: "1985-03-27", matricula: 1234567 }).fraco).toBe(false);
    }
  });
  test("varia (não é um valor fixo)", () => {
    const vistos = new Set(Array.from({ length: 60 }, () => pin.gerarPinProvisorio()));
    expect(vistos.size).toBeGreaterThan(30);
  });
});

describe("hash do PIN", () => {
  test("confere o PIN certo e recusa o errado", () => {
    const h = pin.hashPin("7392", 20);
    expect(pin.verificarPin("7392", 20, h)).toBe(true);
    for (const errado of ["7391", "0000", "73920", "", "abcd"]) expect(pin.verificarPin(errado, 20, h)).toBe(false);
  });
  test("o hash é preso à matrícula: o mesmo PIN em outra matrícula não confere", () => {
    const h = pin.hashPin("7392", 20);
    expect(pin.verificarPin("7392", 21, h)).toBe(false);
  });
  test("tem sal: dois hashes do mesmo PIN são diferentes, e o formato é sal:hash de 64 hex", () => {
    const a = pin.hashPin("7392", 20), b = pin.hashPin("7392", 20);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(a).not.toContain("7392");
  });
  test("hash guardado malformado ou ausente nunca confere", () => {
    for (const h of [null, undefined, "", "semdoispontos", "a:b", ":", `${"0".repeat(32)}:`, 123]) expect(pin.verificarPin("7392", 20, h)).toBe(false);
  });
  test("a conferência falsa roda sem erro (serve para igualar o tempo de quem não tem PIN)", () => {
    expect(() => pin.conferenciaFalsa("7392")).not.toThrow();
  });
});

describe("banco: gravar o PIN", () => {
  test("troca o PIN existente (UPDATE) e zera o contador de erros; não guarda o PIN em texto", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ n: 1 }], []]);
    await pin.gravarPin(pool, 20, "7392");
    expect(chamadas[0].sql).toMatch(/UPDATE MembroPins SET PinHash = @h, Provisorio = @prov/);
    expect(chamadas[0].inputs.prov).toBe(false);
    expect(chamadas[0].inputs.por).toBeNull();
    expect(JSON.stringify(chamadas)).not.toContain("7392");
    expect(chamadas[1].sql).toMatch(/UPDATE AcessoTentativas SET Falhas = 0, BloqueadoAte = NULL/);
    expect(chamadas[1].inputs.c).toBe("PIN");
  });
  test("primeiro PIN da pessoa: UPDATE não acha linha e faz INSERT", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ n: 0 }], [], []]);
    await pin.gravarPin(pool, 20, "7392");
    expect(chamadas[1].sql).toMatch(/INSERT INTO MembroPins/);
  });
  test("provisório: marca quem gerou e a validade de 7 dias", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ n: 1 }], []]);
    await pin.gravarPin(pool, 20, "7392", { provisorioPor: 5 });
    expect(chamadas[0].inputs).toMatchObject({ prov: true, por: 5, dias: pin.VALIDADE_PROVISORIO_DIAS });
    expect(pin.VALIDADE_PROVISORIO_DIAS).toBe(7);
  });
  test("duas gravações ao mesmo tempo: o INSERT perde a corrida (chave duplicada) e vale a última — sem erro", async () => {
    const fila = [[{ n: 0 }], "duplicada", [], []]; let i = 0; const chamadas = [];
    const pool = { request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (sqlTexto) => {
      chamadas.push(sqlTexto); const x = fila[i++]; if (x === "duplicada") { const e = new Error("dup"); e.number = 2627; throw e; } return { recordset: x }; } }; return r; } };
    await expect(pin.gravarPin(pool, 20, "7392")).resolves.toBeUndefined();
    expect(chamadas[2]).toMatch(/UPDATE MembroPins/);
  });
  test("erro de banco que não é chave duplicada sobe", async () => {
    const fila = [[{ n: 0 }], "falha"]; let i = 0;
    const pool = { request: () => { const r = { input: () => r, query: async () => { const x = fila[i++]; if (x === "falha") { const e = new Error("queda"); e.number = 1205; throw e; } return { recordset: x }; } }; return r; } };
    await expect(pin.gravarPin(pool, 20, "7392")).rejects.toThrow("queda");
  });
});

describe("banco: reservar a tentativa ANTES de conferir", () => {
  test("a reserva é um UPDATE atômico que já conta a falha e já aplica o bloqueio (15 min, 1 h, 4 h, 24 h)", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ EstavaBloqueado: false, Falhas: 1, BloqueadaAgora: false }]]);
    const r = await pin.reservarTentativa(pool, 20, "PIN");
    expect(r).toEqual({ bloqueado: false, falhas: 1, bloqueadaAgora: false });
    const s = chamadas[0].sql;
    expect(s).toMatch(/UPDATE t SET/);
    expect(s).toMatch(/Falhas = CASE WHEN x\.Bloq = 1 THEN t\.Falhas ELSE x\.Prev \+ 1 END/);
    expect(s).toMatch(/\(x\.Prev \+ 1\) % @lim = 0/);
    expect(s).toMatch(/UltimaFalhaEm < DATEADD\(HOUR, -24, @agora\)/);                // um dia sem erro apaga o histórico
    expect(s).toMatch(/WHEN 1 THEN 15 WHEN 2 THEN 60 WHEN 3 THEN 240 ELSE 1440/);
    expect(s).toMatch(/WITH \(UPDLOCK, HOLDLOCK\)/);                 // criar a linha é à prova de corrida
    expect(chamadas[0].inputs).toMatchObject({ m: 20, c: "PIN", lim: pin.LIMITE_FALHAS_PIN });
    expect(pin.LIMITE_FALHAS_PIN).toBe(5);
    expect(pin.LIMITE_FALHAS_SENHA).toBe(10);
  });
  test("já bloqueada: devolve bloqueado=true (e quem chama NÃO confere o PIN)", async () => {
    const { pool } = criarPoolFalso([[{ EstavaBloqueado: true, Falhas: 5, BloqueadaAgora: true }]]);
    expect(await pin.reservarTentativa(pool, 20, "PIN")).toMatchObject({ bloqueado: true });
  });
  test("a tentativa que fecha o bloco de 5 já nasce bloqueando (os chutes seguintes caem na reserva)", async () => {
    const { pool } = criarPoolFalso([[{ EstavaBloqueado: false, Falhas: 5, BloqueadaAgora: true }]]);
    expect(await pin.reservarTentativa(pool, 20, "PIN")).toEqual({ bloqueado: false, falhas: 5, bloqueadaAgora: true });
  });
  test("sem linha de volta (não deve acontecer): na dúvida, bloqueia", async () => {
    const { pool } = criarPoolFalso([[]]);
    expect((await pin.reservarTentativa(pool, 20, "PIN")).bloqueado).toBe(true);
  });
  test("o limite da senha da liderança é outro e vai para o banco", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ EstavaBloqueado: false, Falhas: 1, BloqueadaAgora: false }]]);
    await pin.reservarTentativa(pool, 5, "SENHA", pin.LIMITE_FALHAS_SENHA);
    expect(chamadas[0].inputs).toMatchObject({ c: "SENHA", lim: 10 });
  });
});
