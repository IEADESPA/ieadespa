// Protocolo da Ouvidoria (Art. 104). Fecho dos itens em aberto (03/10/2026): a consulta é pública e o protocolo é a credencial — o formato antigo
// (OUV-AAAA-NNNNN-xxxx: sequencial + 4 hexadecimais) era adivinhável. O novo é aleatório (~79 bits), a consulta tem limite por origem e "formato inválido"
// responde igual a "não existe". Os protocolos antigos continuam consultáveis.
let mockDenuncias = {};
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    const d = mockDenuncias[inputs.protocolo];
    return { recordset: d ? [d] : [], rowsAffected: [d ? 1 : 0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));

const { gerarProtocolo, normalizarProtocolo, ALFABETO_PROTOCOLO } = require("../ouvidoria");
const hConsulta = require("../../ConsultarProtocoloOuvidoria/index.js");

let ipN = 1;
const novaOrigem = () => ({ "x-forwarded-for": `177.80.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}:5000, 40.70.146.136:6000` });
async function consultar(protocolo, headers = novaOrigem()) {
  const context = { bindingData: { protocolo }, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await hConsulta(context, { method: "GET", query: {}, headers });
  return context.res;
}

beforeEach(() => { mockDenuncias = {}; mockConsultas = []; });

describe("gerarProtocolo (Ouvidoria)", () => {
  test("formato novo OUV-AAAA-XXXX-XXXX-XXXX-XXXX: 16 símbolos do alfabeto sem ambiguidade (≥ 64 bits), cabe na coluna de 30, sem sequencial", async () => {
    const ano = new Date().getFullYear();
    const p = await gerarProtocolo(null);
    expect(p).toMatch(new RegExp(`^OUV-${ano}(-[${ALFABETO_PROTOCOLO}]{4}){4}$`));
    expect(p.length).toBeLessThanOrEqual(30);
    expect(ALFABETO_PROTOCOLO).not.toMatch(/[01OIL]/);
    expect(16 * Math.log2(ALFABETO_PROTOCOLO.length)).toBeGreaterThanOrEqual(64);
    expect(mockConsultas).toHaveLength(0);                                                   // não depende mais de sequência no banco
  });
  test("aleatório de verdade: 2000 protocolos sem repetição e todos os 31 símbolos aparecem (sem viés grosseiro)", async () => {
    const vistos = new Set();
    const contagem = {};
    for (let i = 0; i < 2000; i++) {
      const p = await gerarProtocolo(null);
      vistos.add(p);
      for (const c of p.slice(9).replace(/-/g, "")) contagem[c] = (contagem[c] || 0) + 1;
    }
    expect(vistos.size).toBe(2000);
    expect(Object.keys(contagem).sort().join("")).toBe(ALFABETO_PROTOCOLO.split("").sort().join(""));
    const media = (2000 * 16) / ALFABETO_PROTOCOLO.length;
    for (const n of Object.values(contagem)) { expect(n).toBeGreaterThan(media * 0.7); expect(n).toBeLessThan(media * 1.3); }
  });
  test("normalizarProtocolo: novo (qualquer caixa, com espaços nas pontas) e antigo (sufixo em minúsculas); o resto é null", () => {
    expect(normalizarProtocolo(" ouv-2026-k8ut-57sz-479y-5zvb ")).toBe("OUV-2026-K8UT-57SZ-479Y-5ZVB");
    expect(normalizarProtocolo("OUV-2026-00003-AB12")).toBe("OUV-2026-00003-ab12");
    expect(normalizarProtocolo("ouv-2026-00003-ab12")).toBe("OUV-2026-00003-ab12");
    for (const ruim of ["OUV-2026-00003-zz12", "OUV-2026-K8UT-57SZ-479Y-5ZV0", "OUV-2026-K8UT-57SZ-479Y", "x", "", null, undefined, {}, ["OUV"], "OUV-2026-00003-ab12' OR 1=1 --", "A".repeat(500)]) {
      expect(normalizarProtocolo(ruim)).toBeNull();
    }
  });
});

describe("ConsultarProtocoloOuvidoria (pública)", () => {
  test("protocolo NOVO consulta; protocolo ANTIGO continua consultando; só status, tipo e data saem", async () => {
    const novo = await gerarProtocolo(null);
    mockDenuncias[novo] = { tipo: "ASSEDIO", status: "RECEBIDA", dataProtocolo: "2026-10-03" };
    mockDenuncias["OUV-2025-00007-c0de"] = { tipo: "SUGESTAO", status: "ENCERRADA", dataProtocolo: "2025-05-01" };
    expect((await consultar(novo.toLowerCase())).body).toEqual({ sucesso: true, tipo: "ASSEDIO", status: "RECEBIDA", dataProtocolo: "2026-10-03" });
    expect((await consultar("OUV-2025-00007-C0DE")).body).toEqual({ sucesso: true, tipo: "SUGESTAO", status: "ENCERRADA", dataProtocolo: "2025-05-01" });
    expect(mockConsultas.map(c => c.inputs.protocolo)).toEqual([novo, "OUV-2025-00007-c0de"]);
  });
  test("'formato inválido' e 'não existe' dão a MESMA resposta e fazem o MESMO caminho (uma consulta ao banco, com valor que nunca existe)", async () => {
    const inexistente = await consultar("OUV-2026-AAAA-BBBB-CCCC-DDDD");
    const invalido = await consultar("isso-nao-e-protocolo");
    const sqlInjecao = await consultar("x' OR '1'='1");
    expect(invalido).toEqual(inexistente);
    expect(sqlInjecao).toEqual(inexistente);
    expect(inexistente.status).toBe(200);
    expect(inexistente.body.sucesso).toBe(false);
    expect(mockConsultas).toHaveLength(3);
    expect(mockConsultas.map(c => c.inputs.protocolo)).toEqual(["OUV-2026-AAAA-BBBB-CCCC-DDDD", "#", "#"]);
    expect(new Set(mockConsultas.map(c => c.sql)).size).toBe(1);
  });
  test("enumeração simulada: uma origem chutando em série é contida depois de 10 tentativas por minuto (429), e nem chega ao banco", async () => {
    const atacante = novaOrigem();
    const respostas = [];
    for (let n = 1; n <= 40; n++) respostas.push(await consultar(`OUV-2026-${String(n).padStart(5, "0")}-0000`, atacante));
    expect(respostas.slice(0, 10).every(r => r.status === 200)).toBe(true);
    expect(respostas.slice(10).every(r => r.status === 429 && r.headers["Retry-After"])).toBe(true);
    expect(mockConsultas).toHaveLength(10);
    // outra origem não é afetada
    expect((await consultar("OUV-2026-AAAA-BBBB-CCCC-DDDD")).status).toBe(200);
  });
  test("enumeração simulada contra o formato NOVO: 10 mil chutes aleatórios não acertam nenhum de 50 protocolos reais", async () => {
    for (let i = 0; i < 50; i++) mockDenuncias[await gerarProtocolo(null)] = { tipo: "OUTRO", status: "RECEBIDA", dataProtocolo: "2026-10-03" };
    let acertos = 0;
    for (let i = 0; i < 10000; i++) { if (mockDenuncias[await gerarProtocolo(null)]) acertos++; }
    expect(acertos).toBe(0);
  });
});
