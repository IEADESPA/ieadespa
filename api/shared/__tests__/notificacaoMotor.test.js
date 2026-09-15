// Teste do dispatcher único de canais (vB.5) — o ponto que garante que
// avaliarRegras (vB.2) e escalonarSLAsVencidos (vB.3, shared/workflow.js)
// nunca reimplementam a regra de "por onde essa notificação sai" cada um
// do seu jeito.
const { criarPoolFalso } = require("./testUtils");
const { enviarCanaisNotificacao } = require("../notificacaoMotor");

describe("enviarCanaisNotificacao", () => {
  test("regra com CanalEmail e CanalPush tenta os dois canais (ambiente de teste sem ACS/VAPID: falha em modo seguro, não quebra)", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]); // 1 query: podeReceberEmail (sem preferência salva -> ativo por padrão)
    const resultado = await enviarCanaisNotificacao(pool, {
      regra: { CanalEmail: true, CanalPush: true, Obrigatoria: false },
      destinatarioMembroId: 1, notificacaoId: 10, titulo: "t", mensagem: "m", categoria: "FINANCEIRO", email: "a@x.com"
    });
    expect(resultado).toEqual({ emailEnviado: false, pushEnviados: 0 }); // sem ACS/VAPID configurados no teste
    expect(chamadas).toHaveLength(1); // só a checagem de opt-out — push nem chega a consultar inscrição (VAPID ausente)
  });

  test("regra sem nenhum canal ligado não consulta nada", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const resultado = await enviarCanaisNotificacao(pool, {
      regra: { CanalEmail: false, CanalPush: false, Obrigatoria: false },
      destinatarioMembroId: 1, notificacaoId: 10, titulo: "t", mensagem: "m", categoria: "FINANCEIRO", email: "a@x.com"
    });
    expect(resultado).toEqual({ emailEnviado: false, pushEnviados: 0 });
    expect(chamadas).toHaveLength(0);
  });

  test("sem e-mail do destinatário, não tenta canal de e-mail mesmo com CanalEmail ligado", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    await enviarCanaisNotificacao(pool, {
      regra: { CanalEmail: true, CanalPush: false, Obrigatoria: false },
      destinatarioMembroId: 1, notificacaoId: 10, titulo: "t", mensagem: "m", categoria: "FINANCEIRO", email: null
    });
    expect(chamadas).toHaveLength(0);
  });

  test("regraChave sem `regra` pré-carregada busca no catálogo antes de decidir", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]); // busca a regra -> nenhuma encontrada
    const resultado = await enviarCanaisNotificacao(pool, {
      regraChave: "INEXISTENTE", destinatarioMembroId: 1, notificacaoId: 10, titulo: "t", mensagem: "m", categoria: "X", email: "a@x.com"
    });
    expect(resultado).toEqual({ emailEnviado: false, pushEnviados: 0 });
    expect(chamadas[0].inputs.chave).toBe("INEXISTENTE");
  });
});
