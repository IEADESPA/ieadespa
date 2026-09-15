// Testes do motor de notificações (vB.2) — a garantia que mais importa aqui
// é a idempotência: rodar o avaliador todo dia sobre o mesmo fato gerador
// (mesma apólice vencida, por exemplo) nunca pode duplicar notificação nem
// reenviar e-mail do que já foi criado.
const { criarPoolFalso, sqlFalso } = require("./testUtils");
const notificacoes = require("../notificacoes");

describe("criarNotificacao (idempotência por RegraChave + destinatário + referência)", () => {
  test("cria quando não existe notificação prévia da mesma origem", async () => {
    const { pool, chamadas } = criarPoolFalso([[], [{ NotificacaoId: 10 }]]);
    const r = await notificacoes.criarNotificacao(pool, {
      regraChave: "SEGUROS_VENCENDO", destinatarioMembroId: 1, titulo: "t", mensagem: "m",
      categoria: "PATRIMONIO", referenciaTabela: "ApolicesSeguro", referenciaId: 5
    });
    expect(r).toEqual({ criada: true, notificacaoId: 10 });
    expect(chamadas).toHaveLength(2); // 1 checagem + 1 insert — nunca insere sem checar antes
  });

  test("não duplica quando já existe notificação da mesma origem (mesma regra+destinatário+referência)", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ NotificacaoId: 7 }]]);
    const r = await notificacoes.criarNotificacao(pool, {
      regraChave: "SEGUROS_VENCENDO", destinatarioMembroId: 1, titulo: "t", mensagem: "m",
      categoria: "PATRIMONIO", referenciaTabela: "ApolicesSeguro", referenciaId: 5
    });
    expect(r).toEqual({ criada: false, notificacaoId: 7 });
    expect(chamadas).toHaveLength(1); // só a checagem — nenhum insert de verdade acontece
  });
});

describe("podeReceberEmail (opt-out por categoria)", () => {
  test("regra Obrigatoria ignora qualquer preferência (nem consulta o banco)", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const pode = await notificacoes.podeReceberEmail(pool, 1, "FINANCEIRO", true);
    expect(pode).toBe(true);
    expect(chamadas).toHaveLength(0);
  });

  test("sem preferência salva ainda, o padrão é ativo (opt-out, nunca opt-in)", async () => {
    const { pool } = criarPoolFalso([[]]);
    const pode = await notificacoes.podeReceberEmail(pool, 1, "FINANCEIRO", false);
    expect(pode).toBe(true);
  });

  test("preferência salva com EmailAtivo = 0 respeita o opt-out", async () => {
    const { pool } = criarPoolFalso([[{ EmailAtivo: 0 }]]);
    const pode = await notificacoes.podeReceberEmail(pool, 1, "FINANCEIRO", false);
    expect(pode).toBe(false);
  });
});

describe("resolverDestinatariosPorPermissao", () => {
  test("filtra por permissão sempre, e por nível só quando informado", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ membroId: 1, nome: "A", email: "a@x.com" }]]);
    const destinatarios = await notificacoes.resolverDestinatariosPorPermissao(pool, { permissao: "financeiro", nivel: "GLOBAL" });
    expect(destinatarios).toHaveLength(1);
    expect(chamadas[0].inputs.permissao).toBe("%,financeiro,%");
    expect(chamadas[0].inputs.nivel).toBe("GLOBAL");
  });
});
