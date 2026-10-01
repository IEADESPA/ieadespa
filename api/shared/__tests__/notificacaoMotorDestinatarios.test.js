// v6.10 — o motor (vB.2) aceita fato com destinatários próprios: o aluno
// ausente da EBD avisa os professores DAQUELA turma, não quem tem uma
// permissão. Sem `destinatarios` no fato, continua valendo a permissão da
// regra (resolvida uma vez só por regra).
jest.mock("../notificacaoDetectores", () => ({
  DETECTORES: {
    COM_DESTINO: {
      tabela: "EbdAlertasAusencia",
      detectar: async () => [
        { referenciaId: 1, fatoGerador: "Ana sumiu", destinatarios: [{ membroId: 10, email: null }, { membroId: 11, email: null }] },
        { referenciaId: 2, fatoGerador: "Bia sumiu", destinatarios: [] }
      ]
    },
    POR_PERMISSAO: {
      tabela: "ApolicesSeguro",
      detectar: async () => [{ referenciaId: 3, fatoGerador: "Apólice A" }, { referenciaId: 4, fatoGerador: "Apólice B" }]
    }
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

function poolComRegras(regras) {
  return { request: () => ({ input() { return this; }, query: async () => ({ recordset: regras }) }) };
}

test("fato com destinatários próprios ignora a permissão da regra", async () => {
  const pool = poolComRegras([{ Chave: "COM_DESTINO", Titulo: "t", Categoria: "EBD", PermissaoAlvo: null, CanalEmail: false, CanalPush: false }]);
  const r = await avaliarRegras(pool);
  expect(r.criadas).toBe(2); // Ana → 2 professores; Bia → turma sem professor, ninguém
  expect(notificacoes.resolverDestinatariosPorPermissao).not.toHaveBeenCalled();
  expect(notificacoes.criarNotificacao.mock.calls.map(c => c[1].destinatarioMembroId)).toEqual([10, 11]);
});

test("sem destinatários no fato, vale a permissão — resolvida uma vez por regra", async () => {
  notificacoes.criarNotificacao.mockClear();
  const pool = poolComRegras([{ Chave: "POR_PERMISSAO", Titulo: "t", Categoria: "X", PermissaoAlvo: "financeiro", CanalEmail: false, CanalPush: false }]);
  const r = await avaliarRegras(pool);
  expect(r.criadas).toBe(2);
  expect(notificacoes.resolverDestinatariosPorPermissao).toHaveBeenCalledTimes(1);
});
