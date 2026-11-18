// FASE 10, v10.1b passo 3 (17/11/2026) — a TRANSFERÊNCIA DE CONGREGAÇÃO: as regras puras (shared/transferencias.js) e a trava do cadastro (GestaoPessoas não troca
// mais a congregação de quem já tem uma). O fluxo contra o SQL Server de verdade (gravação, corridas, escopo, linha do tempo) está no roteiro
// tools/e2e-localdb/e2e-89-transferencia.js.
const auth = require("../auth");
const regras = require("../transferencias");

// Uma visão de "pessoas" a partir das concessões (como o login monta: PROPRIA e DELEGACAO, cada uma com nível e escopo).
const visao = (concessoes, membroId = 5) => auth.visaoDaPermissao({ membroId, via: "SENHA", concessoes: concessoes.map((c) => ({ origem: "PROPRIA", permissoes: ["pessoas"], ...c })) }, "pessoas");
const GERAL = visao([{ nivel: "GLOBAL", escopoCongregacoes: "TODAS" }]);
const LOCAL_VILA = visao([{ nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"] }]);
const LOCAL_PAZ = visao([{ nivel: "CONGREGACAO", escopoCongregacoes: ["Bairro da Paz"] }]);
const AREA_2 = visao([{ nivel: "AREA", escopoCongregacoes: ["Vila Nova", "Cidade Jardim", "Monte Sião"] }]);
const EXTENSAO_VILA = visao([{ nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"], escopoExtensaoNome: "Tenda Norte" }]);
const GLOBAL_LIMITADO = visao([{ nivel: "GLOBAL", escopoCongregacoes: ["Vila Nova"] }]);   // papel Global com escopo de uma congregação: NÃO é a Geral

describe("a regra do pedido", () => {
  test("pedido pela Geral: GERAL (entra na hora), mesmo entre áreas", () => {
    expect(regras.regraDaTransferencia({ pedidoComo: "GERAL", areaOrigemId: 1, areaDestinoId: 3 })).toBe("GERAL");
    expect(regras.entraNaHora("GERAL")).toBe(true);
  });
  test("mesma área: MESMA_AREA (entra na hora), pedido pela origem ou pela pessoa", () => {
    expect(regras.regraDaTransferencia({ pedidoComo: "ORIGEM", areaOrigemId: 2, areaDestinoId: 2 })).toBe("MESMA_AREA");
    expect(regras.regraDaTransferencia({ pedidoComo: "PROPRIO", areaOrigemId: "2", areaDestinoId: 2 })).toBe("MESMA_AREA");
    expect(regras.entraNaHora("MESMA_AREA")).toBe(true);
  });
  test("áreas diferentes: ENTRE_AREAS (o destino aceita)", () => {
    expect(regras.regraDaTransferencia({ pedidoComo: "ORIGEM", areaOrigemId: 2, areaDestinoId: 3 })).toBe("ENTRE_AREAS");
    expect(regras.entraNaHora("ENTRE_AREAS")).toBe(false);
  });
  test("congregação sem área: conta como outra área (o caminho seguro: o destino aceita)", () => {
    expect(regras.regraDaTransferencia({ pedidoComo: "ORIGEM", areaOrigemId: null, areaDestinoId: null })).toBe("ENTRE_AREAS");
    expect(regras.regraDaTransferencia({ pedidoComo: "PROPRIO", areaOrigemId: 2, areaDestinoId: null })).toBe("ENTRE_AREAS");
  });
});

describe("quem pede, quem decide, quem cancela", () => {
  test("pedir: a Geral (GERAL) e a secretaria local da ORIGEM; a área e as outras congregações não", () => {
    expect(regras.papelParaPedir(GERAL, "Vila Nova")).toBe("GERAL");
    expect(regras.papelParaPedir(LOCAL_VILA, "Vila Nova")).toBe("ORIGEM");
    expect(regras.papelParaPedir(LOCAL_PAZ, "Vila Nova")).toBeNull();
    expect(regras.papelParaPedir(AREA_2, "Vila Nova")).toBeNull();
    expect(regras.papelParaPedir(null, "Vila Nova")).toBeNull();
  });
  test("o escopo de uma Extensão da Tenda não é a secretaria da congregação inteira", () => {
    expect(regras.papelParaPedir(EXTENSAO_VILA, "Vila Nova")).toBeNull();
    expect(regras.papelParaDecidir(EXTENSAO_VILA, "Vila Nova")).toBeNull();
  });
  test("um papel Global de escopo limitado não é a Geral (pede só como origem da sua congregação, se for de nível congregação — aqui não é)", () => {
    expect(regras.papelParaPedir(GLOBAL_LIMITADO, "Vila Nova")).toBeNull();
    expect(regras.papelParaDecidir(GLOBAL_LIMITADO, "Bairro da Paz")).toBeNull();
  });
  test("decidir: a Geral (a qualquer hora) e a secretaria local do DESTINO; a área não", () => {
    expect(regras.papelParaDecidir(GERAL, "Bairro da Paz")).toBe("GERAL");
    expect(regras.papelParaDecidir(LOCAL_PAZ, "Bairro da Paz")).toBe("DESTINO");
    expect(regras.papelParaDecidir(LOCAL_VILA, "Bairro da Paz")).toBeNull();
    expect(regras.papelParaDecidir(AREA_2, "Vila Nova")).toBeNull();
  });
  test("uma delegação de secretaria local conta (concessão por concessão)", () => {
    const v = visao([{ nivel: "AREA", escopoCongregacoes: ["Vila Nova", "Cidade Jardim"] }, { origem: "DELEGACAO", nivel: "CONGREGACAO", escopoCongregacoes: ["Bairro da Paz"] }]);
    expect(regras.papelParaDecidir(v, "Bairro da Paz")).toBe("DESTINO");
    expect(regras.papelParaPedir(v, "Vila Nova")).toBeNull();
  });
  test("cancelar: quem pediu, a secretaria da origem ou a Geral — e só pedido PENDENTE", () => {
    const t = { situacao: "PENDENTE", pedidoPor: 77, origemNome: "Vila Nova", destinoNome: "Bairro da Paz" };
    expect(regras.podeCancelar(null, 77, t)).toBe(true);                // quem pediu (a própria pessoa, sem visão de secretaria)
    expect(regras.podeCancelar(LOCAL_VILA, 5, t)).toBe(true);           // a origem
    expect(regras.podeCancelar(GERAL, 5, t)).toBe(true);
    expect(regras.podeCancelar(LOCAL_PAZ, 5, t)).toBe(false);           // o destino recusa, não cancela
    expect(regras.podeCancelar(AREA_2, 5, t)).toBe(false);
    expect(regras.podeCancelar(GERAL, 5, { ...t, situacao: "CONCLUIDA" })).toBe(false);
  });
  test("visível: a Geral vê tudo; os outros quando a origem ou o destino está no escopo (a área acompanha)", () => {
    const t = { origemNome: "Vila Nova", destinoNome: "Bairro da Paz" };
    expect(regras.visivelPara(GERAL, t)).toBe(true);
    expect(regras.visivelPara(LOCAL_VILA, t)).toBe(true);
    expect(regras.visivelPara(LOCAL_PAZ, t)).toBe(true);
    expect(regras.visivelPara(AREA_2, t)).toBe(true);
    expect(regras.visivelPara(visao([{ nivel: "CONGREGACAO", escopoCongregacoes: ["Sede"] }]), t)).toBe(false);
    expect(regras.visivelPara(null, t)).toBe(false);
  });
  test("quem só alcança uma Extensão da Tenda não vê quem sai ou chega na congregação inteira", () => {
    const t = { origemNome: "Vila Nova", destinoNome: "Bairro da Paz" };
    expect(regras.visivelPara(EXTENSAO_VILA, t)).toBe(false);
    const misto = visao([{ nivel: "CONGREGACAO", escopoCongregacoes: ["Vila Nova"], escopoExtensaoNome: "Tenda Norte" }, { origem: "DELEGACAO", nivel: "CONGREGACAO", escopoCongregacoes: ["Bairro da Paz"] }]);
    expect(regras.visivelPara(misto, t)).toBe(true);   // a delegação de Bairro da Paz (inteira) vê, pelo destino
  });
});

describe("textos e dias", () => {
  test("motivo: espaços colapsados, até 500 letras, vazio vira null", () => {
    expect(regras.textoLimpo("  mudou   de   bairro  ")).toBe("mudou de bairro");
    expect(regras.textoLimpo("   ")).toBeNull();
    expect(regras.textoLimpo(null)).toBeNull();
    expect(regras.textoLimpo("x".repeat(900))).toHaveLength(500);
  });
  test("dias parado", () => {
    const agora = new Date("2026-11-17T12:00:00Z");
    expect(regras.diasParado("2026-11-10T11:00:00Z", agora)).toBe(7);
    expect(regras.diasParado("2026-11-17T11:00:00Z", agora)).toBe(0);
    expect(regras.diasParado("lixo", agora)).toBe(0);
  });
});

// ---- a trava do cadastro: GestaoPessoas não troca mais a congregação de quem já tem uma ----
let mockRegras = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return typeof valor === "function" ? valor(inputs) : valor;
    return { recordset: [], recordsets: [[]], rowsAffected: [1] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../notificacaoEmail", () => ({ enviarEmailNotificacao: jest.fn(async () => {}) }));
jest.mock("../vacancia", () => ({ encerrarVinculos: jest.fn(async () => {}) }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, urlDocumentoComSas: (u) => u, salvarFoto: jest.fn(), salvarDocumento: jest.fn() }));
const hPessoas = require("../../GestaoPessoas/index.js");

describe("o cadastro não troca a congregação (só a transferência)", () => {
  const tokenGeral = () => auth.reassinarSessao({ membroId: 9002, via: "SENHA", permissoes: ["pessoas"], nivel: "GLOBAL", escopoCongregacoes: "TODAS", termosPendentes: [] });
  const existente = (extra) => ({ recordset: [{ MembroId: 700412, Status: "ATIVO", EmailAnterior: null, CpfAnterior: null, CargoAnterior: null, DizimistaAnterior: null, SexoAnterior: null,
    NascimentoAnterior: null, AdmissaoAnterior: null, EstadoCivilAnterior: null, EmProcessoDeCargo: 0, TemExclusao: 0, CongregacaoNome: "Vila Nova", ExtensaoNome: null, ...extra }] });
  let gravou = false;
  // o resto do salvamento (a leitura da ficha gravada etc.) não está simulado aqui: o que importa é se a gravação da ficha ACONTECEU ou foi barrada antes
  async function salvar(corpo) {
    const context = { bindingData: {}, log: Object.assign(() => {}, { error() {}, info() {}, warn() {}, verbose() {} }) };
    try {
      await hPessoas(context, { method: "POST", query: {}, body: corpo, headers: { "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000", "x-auth-token": tokenGeral() } });
    } catch (_) { /* depois da gravação, o simulador não tem a ficha para reler */ }
    return context.res || {};
  }
  beforeEach(() => {
    mockRegras = [];
    gravou = false;
    mockRegras.push([/SELECT TOP 1 Nome FROM Congregacoes WHERE CongregacaoId = @id/, (i) => ({ recordset: [{ Nome: i.id === 1 ? "Vila Nova" : "Bairro da Paz" }] })]);
    mockRegras.push([/UPDATE MembroReferencia SET Nome = @nome, CongregacaoId = @congregacaoId/, () => { gravou = true; return { recordset: [], rowsAffected: [1] }; }]);
  });
  test("pessoa com congregação na ficha e outra congregação no pedido: 409 com o caminho da transferência (nem a Geral troca por aqui)", async () => {
    mockRegras.push([/SELECT m\.MembroId, m\.Status, m\.Email AS EmailAnterior/, existente({ CongregacaoIdAnterior: 1 })]);
    const r = await salvar({ membroId: 700412, nome: "Ana Teste", congregacaoId: 2 });
    expect(r.status).toBe(409);
    expect(r.body).toEqual(expect.objectContaining({ sucesso: false, transferencia: true, mensagem: regras.MSG.NA_CONGREGACAO }));
    expect(gravou).toBe(false);
  });
  test("a mesma congregação no pedido: segue o salvamento normal (grava a ficha)", async () => {
    mockRegras.push([/SELECT m\.MembroId, m\.Status, m\.Email AS EmailAnterior/, existente({ CongregacaoIdAnterior: 1 })]);
    const r = await salvar({ membroId: 700412, nome: "Ana Teste", congregacaoId: 1 });
    expect(r.status).not.toBe(409);
    expect(gravou).toBe(true);
  });
  test("tirar a congregação (vazio) de quem tem uma também é troca: 409, sem gravar", async () => {
    mockRegras.push([/SELECT m\.MembroId, m\.Status, m\.Email AS EmailAnterior/, existente({ CongregacaoIdAnterior: 1, CongregacaoNome: "Vila Nova" })]);
    const r = await salvar({ membroId: 700412, nome: "Ana Teste", congregacaoId: null });
    expect(r.status).toBe(409);
    expect(gravou).toBe(false);
  });
  test("ficha ainda sem congregação: recebe a primeira pelo cadastro (grava a ficha)", async () => {
    mockRegras.push([/SELECT m\.MembroId, m\.Status, m\.Email AS EmailAnterior/, existente({ CongregacaoIdAnterior: null, CongregacaoNome: null })]);
    const r = await salvar({ membroId: 700412, nome: "Ana Teste", congregacaoId: 2 });
    expect(r.status).not.toBe(409);
    expect(gravou).toBe(true);
  });
});
