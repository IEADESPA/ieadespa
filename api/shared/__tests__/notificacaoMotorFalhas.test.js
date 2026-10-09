// Um detector que falha não pode derrubar os avisos das outras regras do dia — e a falha precisa chegar a quem chama (a rotina diária vira alerta, em vez de dar verde).
jest.mock("../notificacaoDetectores", () => ({
  DETECTORES: {
    QUEBRADO: { tabela: "X", detectar: async () => { throw new Error("falha de banco no detector"); } },
    MENORES_FICHA_A_VENCER: { tabela: "Y", detectar: async () => { throw new Error("falha no detector do ministério com menores"); } },
    SAUDAVEL: { tabela: "ApolicesSeguro", detectar: async () => [{ referenciaId: 3, fatoGerador: "Apólice A" }] }
  }
}));
jest.mock("../notificacoes", () => ({
  resolverDestinatariosPorPermissao: jest.fn(async () => [{ membroId: 20, email: null }]),
  criarNotificacao: jest.fn(async () => ({ criada: true, notificacaoId: 1 })),
  marcarEmailEnviado: jest.fn(),
  podeReceberEmail: jest.fn(async () => true)
}));

const notificacoes = require("../notificacoes");
const { avaliarRegras } = require("../notificacaoMotor");
const regra = (Chave) => ({ Chave, Titulo: "t", Categoria: "X", PermissaoAlvo: "financeiro", CanalEmail: false, CanalPush: false });
const poolComRegras = (regras) => ({ request: () => ({ input() { return this; }, query: async () => ({ recordset: regras }) }) });

test("o detector que falha entra em `falhas` e os outros seguem avisando", async () => {
  const erro = jest.spyOn(console, "error").mockImplementation(() => {});
  const r = await avaliarRegras(poolComRegras([regra("QUEBRADO"), regra("MENORES_FICHA_A_VENCER"), regra("SAUDAVEL")]));
  expect(r.falhas).toEqual(["QUEBRADO", "MENORES_FICHA_A_VENCER"]);
  expect(r.criadas).toBe(1);
  expect(notificacoes.criarNotificacao).toHaveBeenCalledTimes(1);
  erro.mockRestore();
});

test("sem falha, `falhas` vem vazio", async () => {
  notificacoes.criarNotificacao.mockClear();
  const r = await avaliarRegras(poolComRegras([regra("SAUDAVEL")]));
  expect(r.falhas).toEqual([]);
  expect(r.criadas).toBe(1);
});
