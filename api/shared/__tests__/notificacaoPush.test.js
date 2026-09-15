// Teste do canal push (vB.5) — sem VAPID configurado (ambiente de teste
// nunca tem essas env vars), tem que falhar em modo seguro: devolve 0 sem
// tentar consultar inscrição nenhuma, nunca lançar erro.
const { criarPoolFalso, sqlFalso } = require("./testUtils");
const { enviarPushNotificacao } = require("../notificacaoPush");

describe("enviarPushNotificacao sem VAPID configurado", () => {
  test("devolve 0 e não consulta PushInscricoesMembro", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const enviados = await enviarPushNotificacao(pool, sqlFalso, 1, { titulo: "t", mensagem: "m" });
    expect(enviados).toBe(0);
    expect(chamadas).toHaveLength(0);
  });
});
