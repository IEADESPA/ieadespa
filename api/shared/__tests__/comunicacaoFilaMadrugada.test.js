// Trava 7-C, achado D — a fila de comunicados de madrugada: a v7.15 promete o aviso de crise a toda a liderança em poucas rodadas, mas a rotina só passava das 6h às 22h45.
// Agora ela passa 24 horas: de madrugada com `x-somente-sistema`, que só abre o banco se a marca do Storage disser que há aviso do sistema (a crise) na fila, e só manda esse.
// A prova de que o processarFila de madrugada não toca o comunicado comum está em tools/e2e-localdb/e2e-37.
jest.mock("../db", () => ({ getPool: jest.fn(async () => ({ pool: true })), sql: {} }));
jest.mock("../comunicacaoFilaMarca", () => ({ lerGuardada: jest.fn(), gravar: jest.fn(async () => true) }));
jest.mock("../comunicacaoDb", () => ({ processarFila: jest.fn(async () => ({ push: { aceitos: 0 }, email: { aceitos: 0, cota: 0, adiados: 0 }, pendentes: 0 })) }));
const fs = require("fs");
const path = require("path");
const marca = require("../comunicacaoFilaMarca");
const db = require("../comunicacaoDb");
const handler = require("../../ComunicacaoFila/index.js");

process.env.CRON_SECRET = "segredo-do-teste";
const ctx = () => ({ log: Object.assign(() => { }, { error() { }, info() { }, warn() { } }), bindingData: {} });
const chamar = async (cabecalhos) => { const c = ctx(); await handler(c, { method: "POST", headers: { "x-cron-secret": "segredo-do-teste", ...cabecalhos } }); return c.res; };
const MADRUGADA = { "x-somente-se-pendente": "1", "x-somente-sistema": "1" };
const DIA = { "x-somente-se-pendente": "1" };
beforeEach(() => { marca.lerGuardada.mockReset(); db.processarFila.mockClear(); });

describe("ComunicacaoFila de madrugada (x-somente-sistema)", () => {
  test("há comunicado comum na fila mas nenhum aviso de crise: não abre o banco", async () => {
    marca.lerGuardada.mockResolvedValue({ pendentes: 120, sistema: 0, seq: 9 });
    const r = await chamar(MADRUGADA);
    expect(r.body).toEqual({ sucesso: true, ocioso: true });
    expect(db.processarFila).not.toHaveBeenCalled();
  });
  test("há aviso de crise na fila: abre o banco e manda SÓ o aviso do sistema", async () => {
    marca.lerGuardada.mockResolvedValue({ pendentes: 420, sistema: 300, seq: 10 });
    await chamar(MADRUGADA);
    expect(db.processarFila).toHaveBeenCalledTimes(1);
    expect(db.processarFila.mock.calls[0][1]).toEqual({ somenteSistema: true });
  });
  test("fila vazia: não abre o banco", async () => {
    marca.lerGuardada.mockResolvedValue({ pendentes: 0, sistema: 0, seq: 10 });
    await chamar(MADRUGADA);
    expect(db.processarFila).not.toHaveBeenCalled();
  });
  test("a marca não sabe dizer (sem Storage, ou marca antiga sem a contagem do sistema): na dúvida olha, mas só manda o aviso do sistema", async () => {
    marca.lerGuardada.mockResolvedValue(null);
    await chamar(MADRUGADA);
    marca.lerGuardada.mockResolvedValue({ pendentes: 7, sistema: null, seq: 3 });
    await chamar(MADRUGADA);
    expect(db.processarFila).toHaveBeenCalledTimes(2);
    for (const c of db.processarFila.mock.calls) expect(c[1]).toEqual({ somenteSistema: true });
  });
});

describe("ComunicacaoFila de dia (como antes)", () => {
  test("há comunicado comum na fila: manda tudo", async () => {
    marca.lerGuardada.mockResolvedValue({ pendentes: 120, sistema: 0, seq: 9 });
    await chamar(DIA);
    expect(db.processarFila).toHaveBeenCalledTimes(1);
    expect(db.processarFila.mock.calls[0][1]).toEqual({ somenteSistema: false });
  });
  test("fila vazia: não abre o banco", async () => {
    marca.lerGuardada.mockResolvedValue({ pendentes: 0, seq: 9 });
    expect((await chamar(DIA)).body).toEqual({ sucesso: true, ocioso: true });
    expect(db.processarFila).not.toHaveBeenCalled();
  });
});

describe("o workflow passa 24 horas por dia", () => {
  const yml = fs.readFileSync(path.join(__dirname, "..", "..", "..", ".github", "workflows", "rotinas-comunicacao.yml"), "utf8");
  test("de dia (6h às 22h45 de Brasília) a fila inteira; de madrugada (23h às 5h45) só o aviso do sistema", () => {
    const crons = [...yml.matchAll(/- cron: "([^"]+)"/g)].map((m) => m[1]);
    expect(crons).toEqual(["*/15 0-1,9-23 * * *", "*/15 2-8 * * *"]);
    // as duas faixas juntas cobrem as 24 horas UTC, sem buraco
    const horas = new Set();
    for (const c of crons) for (const parte of c.split(" ")[1].split(",")) { const [a, b] = parte.split("-").map(Number); for (let h = a; h <= (b === undefined ? a : b); h++) horas.add(h); }
    expect(horas.size).toBe(24);
    expect(yml).toMatch(/if \[ "\$AGENDA" = "\*\/15 2-8 \* \* \*" \]; then SO_SISTEMA=\(-H "x-somente-sistema: 1"\); fi/);
    expect(yml).toMatch(/AGENDA: \$\{\{ github\.event\.schedule \}\}/);
    expect(yml).toMatch(/-H "x-somente-se-pendente: 1" "\$\{SO_SISTEMA\[@\]\}"/);
  });
});

describe("a marca guarda quantas pendentes são do aviso do sistema", () => {
  const real = jest.requireActual("../comunicacaoFilaMarca");
  function storageFalso() {
    const st = { blob: null, versao: 0 };
    st.lerJsonPrivadoComVersao = async () => (st.blob ? { dados: JSON.parse(JSON.stringify(st.blob)), etag: `v${st.versao}` } : null);
    st.salvarJsonPrivadoSe = async (_n, objeto) => { st.blob = objeto; st.versao++; };
    st.salvarJsonPrivado = async (_n, objeto) => { st.blob = objeto; st.versao++; };
    return st;
  }
  test("grava { pendentes, seq, sistema }; invalidar não leva a contagem do sistema", async () => {
    const st = storageFalso();
    await real.gravar(12, 40, { storage: st }, 5);
    expect(st.blob).toMatchObject({ pendentes: 12, seq: 40, sistema: 5 });
    await real.gravar(null, 0, { storage: st }, 5);
    expect(st.blob.pendentes).toBeNull();
    expect(st.blob.sistema).toBeUndefined();
  });
});
