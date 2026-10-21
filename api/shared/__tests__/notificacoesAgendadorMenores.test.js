// A rotina diária é fail-soft (uma falha não derruba as outras), mas a retirada das escalas com menores e os detectores do ministério com menores NÃO podem falhar em silêncio:
// a resposta vira 500 (o job do GitHub fica vermelho). O que não é do ministério com menores segue 200.
jest.mock("../db", () => ({ getPool: async () => ({}) }));
jest.mock("../cronAuth", () => ({ exigirSegredoRotina: () => true }));
jest.mock("../notificacaoMotor", () => ({ avaliarRegras: jest.fn() }));
jest.mock("../voluntariadoDb", () => ({ anonimizarIpsVencidos: jest.fn(async () => ({ anonimizados: 0, retencaoDias: 1825 })) }));
jest.mock("../setoresTecnicosDb", () => ({ anonimizarIpsVencidos: jest.fn(async () => ({ anonimizados: 0, retencaoDias: 1825 })) }));
jest.mock("../ministerioMenoresDb", () => ({
  retirarInaptosDasEscalas: jest.fn(async () => ({ retirados: 0, alocacoes: 0 })),
  anonimizarIpsVencidos: jest.fn(async () => ({ anonimizados: 0, retencaoDias: 1825 }))
}));
jest.mock("../menoresConsentimentoDb", () => ({
  anonimizarIpsVencidos: jest.fn(async () => ({ anonimizados: 0 })),
  apagarFotosDeMenoresSemConsentimento: jest.fn(async () => ({ apagadas: 2 }))
}));

jest.mock("../cuidadoPastoralDb", () => ({ rotinaDiaria: jest.fn(async () => ({ falhas: [] })) }));

const { avaliarRegras } = require("../notificacaoMotor");
const cuidadoDb = require("../cuidadoPastoralDb");
const mmDb = require("../ministerioMenoresDb");
const mcDb = require("../menoresConsentimentoDb");
const handler = require("../../NotificacoesAgendador/index.js");

async function rodar() {
  const context = { log: Object.assign(() => {}, { error() {}, warn() {}, info() {} }) };
  await handler(context, { method: "POST", headers: {} });
  return context.res;
}
beforeEach(() => {
  avaliarRegras.mockReset(); avaliarRegras.mockResolvedValue({ criadas: 1, emailsEnviados: 0, falhas: [] });
  mmDb.retirarInaptosDasEscalas.mockReset(); mmDb.retirarInaptosDasEscalas.mockResolvedValue({ retirados: 1, alocacoes: 2 });
  mcDb.apagarFotosDeMenoresSemConsentimento.mockClear();
  cuidadoDb.rotinaDiaria.mockReset(); cuidadoDb.rotinaDiaria.mockResolvedValue({ falhas: [], deteccao: { abertos: 0 } });
});

// v7.11 — a rotina do cuidado pastoral (escada do prazo vencido, regra dos 30 dias das notas) roda ANTES dos avisos e não falha em silêncio.
test("cuidado pastoral: a rotina roda antes dos avisos; um passo que falhou, ou um detector CUIDADO_, dá 500 (os avisos do dia rodaram)", async () => {
  const ordem = [];
  cuidadoDb.rotinaDiaria.mockImplementation(async () => { ordem.push("rotina"); return { falhas: [] }; });
  avaliarRegras.mockImplementation(async () => { ordem.push("avisos"); return { criadas: 0, emailsEnviados: 0, falhas: [] }; });
  const ok = await rodar();
  expect(ok.status).toBe(200);
  expect(ordem).toEqual(["rotina", "avisos"]);
  cuidadoDb.rotinaDiaria.mockResolvedValue({ falhas: ["escada"] });
  const passo = await rodar();
  expect(passo.status).toBe(500);
  expect(passo.body.cuidado.falhas).toEqual(["escada"]);
  cuidadoDb.rotinaDiaria.mockRejectedValue(new Error("banco fora"));
  const tudo = await rodar();
  expect(tudo.status).toBe(500);
  expect(tudo.body.cuidado.falhas).toEqual(["rotina"]);
  cuidadoDb.rotinaDiaria.mockResolvedValue({ falhas: [] });
  avaliarRegras.mockResolvedValue({ criadas: 0, emailsEnviados: 0, falhas: ["CUIDADO_DEGRAU"] });
  const detector = await rodar();
  expect(detector.status).toBe(500);
  expect(avaliarRegras).toHaveBeenCalled();
});

test("tudo certo: 200 e a faxina das fotos de menor roda (o número vai no corpo)", async () => {
  const r = await rodar();
  expect(r.status).toBe(200);
  expect(r.body.sucesso).toBe(true);
  expect(r.body.retiradaMenores).toEqual({ retirados: 1, alocacoes: 2 });
  expect(r.body.retencaoConsentimentos.fotosApagadas).toBe(2);
  expect(mcDb.apagarFotosDeMenoresSemConsentimento).toHaveBeenCalledTimes(1);
});

test("a retirada automática falhou (inclusive parcial): 500, mas os avisos do dia rodaram", async () => {
  mmDb.retirarInaptosDasEscalas.mockRejectedValue(Object.assign(new Error("falhou em 1 de 3 pares"), { parcial: { retirados: 2, alocacoes: 3 } }));
  const r = await rodar();
  expect(r.status).toBe(500);
  expect(r.body).toMatchObject({ sucesso: false, retiradaFalhou: true });
  expect(avaliarRegras).toHaveBeenCalledTimes(1);
});

test("detector do ministério com menores falhou: 500; detector de outro assunto falhou: segue 200", async () => {
  avaliarRegras.mockResolvedValue({ criadas: 0, emailsEnviados: 0, falhas: ["MENORES_ESCALA_SEM_ADULTOS"] });
  const menores = await rodar();
  expect(menores.status).toBe(500);
  expect(menores.body.detectoresComFalha).toEqual(["MENORES_ESCALA_SEM_ADULTOS"]);
  avaliarRegras.mockResolvedValue({ criadas: 0, emailsEnviados: 0, falhas: ["APOLICE_A_VENCER"] });
  const outro = await rodar();
  expect(outro.status).toBe(200);
  expect(outro.body.detectoresComFalha).toEqual(["APOLICE_A_VENCER"]);
});
