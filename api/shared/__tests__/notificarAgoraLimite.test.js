// Aviso imediato com limite diário (v7.5, fecho dos pontos abertos): a regra que alguém pode repetir de propósito contra uma pessoa (remover e reintegrar em
// ciclo) deixa de gerar aviso depois do limite em 24 horas. Sem `limiteDia`, nada muda para quem já usa a função (canais, escalas...).
const { criarPoolFalso } = require("./testUtils");
const { notificarAgora } = require("../canaisDb");

const regra = { Chave: "ESCALA_ALTERACAO_PARTICIPACAO", Titulo: "Sua participação nas escalas mudou", Categoria: "ESCALAS" };
const depsFalsos = () => {
  const criar = jest.fn(async () => ({ criada: true, notificacaoId: 7 }));
  const enviar = jest.fn(async () => {});
  return { criar, enviar, deps: { criarNotificacao: criar, enviarCanais: enviar } };
};
const base = (extra = {}) => ({ regraChave: regra.Chave, destinatarios: [{ membroId: 20, email: "a@b.org" }], mensagem: "Você saiu da escala", referenciaId: 4, referenciaTabela: "VoluntariosDesligamentos", ...extra });

describe("notificarAgora com limite diário", () => {
  test("abaixo do limite: cria e envia, e a contagem é por regra e pessoa nas últimas 24 horas", async () => {
    const { pool, chamadas } = criarPoolFalso([[regra], [{ n: 3 }]]);
    const { criar, enviar, deps } = depsFalsos();
    const r = await notificarAgora(pool, base({ limiteDia: 4, deps }));
    expect(r).toEqual({ criadas: 1, suprimidas: 0 });
    expect(criar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(chamadas[1].sql).toMatch(/FROM Notificacoes WHERE RegraChave = @chave AND DestinatarioMembroId = @dest AND CriadaEm >= DATEADD\(HOUR, -24, SYSUTCDATETIME\(\)\)/);
    expect(chamadas[1].inputs).toMatchObject({ chave: regra.Chave, dest: 20 });
  });
  test("no limite: o aviso não é criado nem enviado por e-mail, e a função diz quantos deixou de criar", async () => {
    const { pool } = criarPoolFalso([[regra], [{ n: 4 }]]);
    const { criar, enviar, deps } = depsFalsos();
    const r = await notificarAgora(pool, base({ limiteDia: 4, deps }));
    expect(r).toEqual({ criadas: 0, suprimidas: 1 });
    expect(criar).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });
  test("o limite vale pessoa por pessoa: quem está no limite não leva o outro junto", async () => {
    const { pool } = criarPoolFalso([[regra], [{ n: 9 }], [{ n: 0 }]]);
    const { criar, deps } = depsFalsos();
    const r = await notificarAgora(pool, base({ limiteDia: 4, destinatarios: [{ membroId: 20 }, { membroId: 21 }], deps }));
    expect(r).toEqual({ criadas: 1, suprimidas: 1 });
    expect(criar.mock.calls[0][1].destinatarioMembroId).toBe(21);
  });
  test("sem limiteDia, nenhuma consulta de contagem é feita (comportamento de sempre)", async () => {
    const { pool, chamadas } = criarPoolFalso([[regra]]);
    const { deps } = depsFalsos();
    const r = await notificarAgora(pool, base({ deps }));
    expect(r.criadas).toBe(1);
    expect(chamadas).toHaveLength(1);
  });
  test("regra inexistente ou desligada continua não avisando ninguém", async () => {
    const { pool } = criarPoolFalso([[]]);
    expect(await notificarAgora(pool, base({ limiteDia: 4, deps: depsFalsos().deps }))).toEqual({ criadas: 0 });
  });
});
