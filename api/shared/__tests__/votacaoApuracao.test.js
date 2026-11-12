// FASE 10 (migração 173, 12/11/2026, decisão do responsável e do Presidente): a regra pura da apuração das votações vinculantes (shared/estatuto.js).
const estatuto = require("../estatuto");

describe("apurarVotacao — proposta (aprovar ou rejeitar)", () => {
  const p = (aprova, rejeita, branco = 0) => [{ papel: "APROVA", votos: aprova }, { papel: "REJEITA", votos: rejeita }, { papel: "BRANCO", votos: branco }];
  test("o Não vencendo não aprova (o defeito antigo: a mais votada aprovava)", () => {
    expect(estatuto.apurarVotacao({ tipo: "PROPOSTA", quorumTipo: "MAIORIA_SIMPLES", opcoes: p(3, 9, 1) })).toMatchObject({ aprovado: false, aprova: 3, rejeita: 9, branco: 1, validos: 12 });
  });
  test("maioria simples é MAIS da metade dos válidos: empate não aprova", () => {
    expect(estatuto.apurarVotacao({ tipo: "PROPOSTA", quorumTipo: "MAIORIA_SIMPLES", opcoes: p(5, 5) }).aprovado).toBe(false);
    expect(estatuto.apurarVotacao({ tipo: "PROPOSTA", quorumTipo: "MAIORIA_SIMPLES", opcoes: p(6, 5) }).aprovado).toBe(true);
  });
  test("o branco fica fora da conta", () => {
    expect(estatuto.apurarVotacao({ tipo: "PROPOSTA", quorumTipo: "MAIORIA_SIMPLES", opcoes: p(2, 1, 50) }).aprovado).toBe(true);
  });
  test("dois terços e 90% sobre os válidos, arredondando para cima", () => {
    expect(estatuto.apurarVotacao({ tipo: "PROPOSTA", quorumTipo: "DOIS_TERCOS", opcoes: p(8, 4) }).aprovado).toBe(true);
    expect(estatuto.apurarVotacao({ tipo: "PROPOSTA", quorumTipo: "DOIS_TERCOS", opcoes: p(7, 4) }).aprovado).toBe(false);
    expect(estatuto.apurarVotacao({ tipo: "PROPOSTA", quorumTipo: "NOVENTA_POR_CENTO", opcoes: p(9, 1) }).aprovado).toBe(true);
    expect(estatuto.apurarVotacao({ tipo: "PROPOSTA", quorumTipo: "NOVENTA_POR_CENTO", opcoes: p(17, 3) }).aprovado).toBe(false);
  });
  test("só voto em branco (ou nenhum) não aprova; quórum desconhecido não aprova", () => {
    expect(estatuto.apurarVotacao({ tipo: "PROPOSTA", quorumTipo: "MAIORIA_SIMPLES", opcoes: p(0, 0, 7) }).aprovado).toBe(false);
    expect(estatuto.apurarVotacao({ tipo: "PROPOSTA", quorumTipo: "XYZ", opcoes: p(9, 0) }).aprovado).toBe(false);
  });
  test("a mensagem diz o placar com o branco à parte", () => {
    expect(estatuto.apurarVotacao({ tipo: "PROPOSTA", quorumTipo: "MAIORIA_SIMPLES", opcoes: p(7, 2, 1) }).mensagem).toMatch(/^Aprovada: 7 a favor e 2 contra; 1 em branco, que não conta /);
  });
});

describe("apurarVotacao — escolha (nomes ou opções)", () => {
  const e = (...votos) => votos.map((v, i) => ({ opcaoId: i + 1, texto: `Opção ${i + 1}`, votos: v }));
  test("ganha a mais votada, sem precisar de maioria (30%)", () => {
    expect(estatuto.apurarVotacao({ tipo: "ESCOLHA", opcoes: e(3, 2, 2, 2, 1) })).toMatchObject({ aprovado: true, empate: false, opcaoVencedoraId: 1, votosVencedora: 3, totalVotos: 10 });
  });
  test("empate no primeiro lugar: sem escolhida, a mesa decide", () => {
    expect(estatuto.apurarVotacao({ tipo: "ESCOLHA", opcoes: e(4, 4, 1) })).toMatchObject({ aprovado: false, empate: true, opcaoVencedoraId: null, empatadas: ["Opção 1", "Opção 2"] });
  });
  test("nenhum voto: sem escolhida e sem empate", () => {
    expect(estatuto.apurarVotacao({ tipo: "ESCOLHA", opcoes: e(0, 0) })).toMatchObject({ aprovado: false, empate: false, opcaoVencedoraId: null });
  });
});

describe("os papéis e o tipo pelos textos", () => {
  test("Sim / Não / Em branco, sem acento nem maiúscula", () => {
    expect(["SIM", " não ", "Nao", "Em Branco", "abstenção", "Contra", "Aprovo", "Irmão João"].map(estatuto.papelPeloTexto)).toEqual(["APROVA", "REJEITA", "REJEITA", "BRANCO", "BRANCO", "REJEITA", "APROVA", null]);
  });
  test("proposta só com uma que aprova, ao menos uma que rejeita e nada fora disso; senão, escolha", () => {
    expect(estatuto.inferirApuracao(["Sim", "Não", "Em branco"])).toEqual({ tipo: "PROPOSTA", papeis: ["APROVA", "REJEITA", "BRANCO"] });
    expect(estatuto.inferirApuracao(["Irmão João", "Irmão Pedro"]).tipo).toBe("ESCOLHA");
    expect(estatuto.inferirApuracao(["Sim", "Não", "Talvez"]).tipo).toBe("ESCOLHA");
    expect(estatuto.inferirApuracao(["Sim", "Aprovo", "Não"]).tipo).toBe("ESCOLHA");
  });
  test("validarPapeisProposta", () => {
    expect(estatuto.validarPapeisProposta(["APROVA", "REJEITA", "BRANCO"])).toBeNull();
    expect(estatuto.validarPapeisProposta(["APROVA", "APROVA", "REJEITA"])).toMatch(/exatamente uma/);
    expect(estatuto.validarPapeisProposta(["APROVA", "BRANCO"])).toMatch(/rejeita/);
    expect(estatuto.validarPapeisProposta(["APROVA", "OUTRO"])).toMatch(/aprova, rejeita ou é voto em branco/);
  });
});
