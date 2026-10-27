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
jest.mock("../identidadeVisualDb", () => ({ rotinaAntesDosAvisos: jest.fn(async () => ({ falhas: [] })), rotinaDepoisDosAvisos: jest.fn(async () => ({ falhas: [] })) }));
jest.mock("../enquetes", () => ({ encerrarVencidas: jest.fn(async () => ({ encerradas: 0 })) }));

const { avaliarRegras } = require("../notificacaoMotor");
const cuidadoDb = require("../cuidadoPastoralDb");
const identidadeDb = require("../identidadeVisualDb");
const enquetesMod = require("../enquetes");
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
  identidadeDb.rotinaAntesDosAvisos.mockReset(); identidadeDb.rotinaAntesDosAvisos.mockResolvedValue({ falhas: [], votacoesAbertas: 0, apuradas: 0 });
  identidadeDb.rotinaDepoisDosAvisos.mockReset(); identidadeDb.rotinaDepoisDosAvisos.mockResolvedValue({ falhas: [] });
  enquetesMod.encerrarVencidas.mockReset(); enquetesMod.encerrarVencidas.mockResolvedValue({ encerradas: 0 });
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

// v7.14 — a identidade visual (abrir a votação no dia 22, fechar e apurar depois do dia 30) roda ANTES dos avisos e também não falha em silêncio; (revisão) a retenção dela,
// que apaga imagens, vai DEPOIS dos avisos, com orçamento de tempo; e o encerramento das enquetes agendadas é um passo próprio.
test("identidade visual: antes dos avisos o ciclo, depois deles a retenção (com orçamento); as enquetes agendadas num passo próprio; cada falha dá 500", async () => {
  const ordem = [];
  identidadeDb.rotinaAntesDosAvisos.mockImplementation(async () => { ordem.push("identidade"); return { falhas: [] }; });
  enquetesMod.encerrarVencidas.mockImplementation(async () => { ordem.push("enquetes"); return { encerradas: 1 }; });
  avaliarRegras.mockImplementation(async () => { ordem.push("avisos"); return { criadas: 0, emailsEnviados: 0, falhas: [] }; });
  identidadeDb.rotinaDepoisDosAvisos.mockImplementation(async (_p, op) => { ordem.push(`retencao:${op && op.orcamentoMs}`); return { falhas: [] }; });
  const ok = await rodar();
  expect(ok.status).toBe(200);
  expect(ordem).toEqual(["identidade", "enquetes", "avisos", "retencao:15000"]);
  expect(ok.body.enquetesAgendadas).toEqual({ encerradas: 1 });
  identidadeDb.rotinaAntesDosAvisos.mockResolvedValue({ falhas: ["ciclo"] });
  expect((await rodar()).status).toBe(500);
  identidadeDb.rotinaAntesDosAvisos.mockRejectedValue(new Error("banco fora"));
  const caiu = await rodar();
  expect(caiu.status).toBe(500);
  expect(caiu.body.identidade.falhas).toContain("rotina");
  identidadeDb.rotinaAntesDosAvisos.mockResolvedValue({ falhas: [] });
  identidadeDb.rotinaDepoisDosAvisos.mockResolvedValue({ falhas: ["retencao"] });
  expect((await rodar()).status).toBe(500);
  identidadeDb.rotinaDepoisDosAvisos.mockResolvedValue({ falhas: [] });
  enquetesMod.encerrarVencidas.mockRejectedValue(new Error("timeout"));
  const enq = await rodar();
  expect(enq.status).toBe(500);
  expect(enq.body.criadas).toBeDefined();                       // os avisos do dia rodaram mesmo assim
  enquetesMod.encerrarVencidas.mockResolvedValue({ encerradas: 0 });
  avaliarRegras.mockResolvedValue({ criadas: 0, emailsEnviados: 0, falhas: ["IDENTIDADE_VOTACAO"] });
  expect((await rodar()).status).toBe(500);
});
// (revisão) a rotina responde 500 quando um passo protegido falhou: o passo seguinte do workflow (a versão da agenda pública) roda assim mesmo, e o e-mail de falha sai.
test("rotinas-diarias.yml: a versão da agenda pública roda mesmo com a rotina de avisos em falha, e a falha manda o e-mail", () => {
  const yml = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "..", ".github", "workflows", "rotinas-diarias.yml"), "utf8").split(String.fromCharCode(13)).join("");
  const passo = yml.split("- name: ").find((p) => p.startsWith("Guarda a versão da agenda pública"));
  expect(passo).toMatch(/\n\s+if: \$\{\{ !cancelled\(\) \}\}\n/);
  expect(yml).toMatch(/avisar-falha:\n\s+needs: \[notificacoes, fluxos, ebd-fechamento\]\n\s+if: \$\{\{ failure\(\) \}\}/);
});
