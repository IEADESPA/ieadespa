// Testes da delegação temporária (vB.9) — o que mais importa: nunca deixa
// delegar papel de outra pessoa, nunca aceita prazo pro passado, e a soma
// de permissão/escopo do delegado nunca troca "TODAS" por uma lista mais
// estreita quando qualquer delegação concede TODAS.
const { criarPoolFalso, sqlFalso } = require("./testUtils");
const { criarDelegacao, permissoesEscopoDelegados } = require("../delegacoes");

describe("criarDelegacao", () => {
  test("recusa delegar pra si mesmo, sem nem consultar o banco", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const r = await criarDelegacao(pool, sqlFalso, { liderancaId: 1, deleganteMembroId: 5, delegadoMembroId: 5, dataInicio: "2026-01-01", dataFim: "2026-01-10" });
    expect(r.sucesso).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  test("recusa dataFim no passado", async () => {
    const { pool } = criarPoolFalso([]);
    const r = await criarDelegacao(pool, sqlFalso, { liderancaId: 1, deleganteMembroId: 5, delegadoMembroId: 6, dataInicio: "2000-01-01", dataFim: "2000-01-10" });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/já passou/);
  });

  test("recusa delegar um papel que não é do delegante", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ MembroId: 999 }]]);
    const dataFim = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const r = await criarDelegacao(pool, sqlFalso, { liderancaId: 1, deleganteMembroId: 5, delegadoMembroId: 6, dataInicio: new Date().toISOString().slice(0, 10), dataFim });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/não é seu/);
    expect(chamadas).toHaveLength(1); // nunca chega a inserir
  });

  test("cria quando o papel é mesmo do delegante e o prazo é válido", async () => {
    const dataFim = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const { pool, chamadas } = criarPoolFalso([[{ MembroId: 5 }], [{ DelegacaoId: 42 }]]);
    const r = await criarDelegacao(pool, sqlFalso, { liderancaId: 1, deleganteMembroId: 5, delegadoMembroId: 6, dataInicio: new Date().toISOString().slice(0, 10), dataFim });
    expect(r).toEqual({ sucesso: true, delegacaoId: 42 });
    expect(chamadas).toHaveLength(2);
  });
});

describe("permissoesEscopoDelegados", () => {
  test("sem delegação ativa nenhuma, devolve vazio sem tentar resolver escopo", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]);
    const r = await permissoesEscopoDelegados(pool, sqlFalso, 6, "2026-01-01");
    expect(r).toEqual({ permissoesExtras: [], escopoExtra: [], delegacoesAtivas: [] });
    expect(chamadas).toHaveLength(1); // só a busca de delegações ativas
  });

  test("uma delegação com escopo GLOBAL faz escopoExtra virar 'TODAS'", async () => {
    const { pool } = criarPoolFalso([
      [{ DelegacaoId: 1, LiderancaId: 1, DataFim: "2026-02-01", Motivo: null, deleganteNome: "Fulano", EscopoTipo: "GLOBAL", EscopoId: null, papelNome: "Secretário Geral", papelNivel: "GLOBAL", permissoesStr: "pessoas,financeiro" }]
    ]);
    const r = await permissoesEscopoDelegados(pool, sqlFalso, 6, "2026-01-01");
    expect(r.escopoExtra).toBe("TODAS");
    expect(r.permissoesExtras.sort()).toEqual(["financeiro", "pessoas"]);
    expect(r.delegacoesAtivas).toHaveLength(1);
  });
});
