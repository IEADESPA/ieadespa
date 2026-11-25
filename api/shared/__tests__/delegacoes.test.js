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

// A permissão que a recertificação vencida tirou de quem é dono do cargo não chega a quem recebeu o cargo por delegação (o login do titular já a tira dele).
describe("a delegação e a recertificação vencida do titular", () => {
  const linha = (extra = {}) => ({ DelegacaoId: 1, LiderancaId: 1, DataFim: "2099-12-31", DataFimTexto: "2099-12-31", LiderancaAtivoAteTexto: null, Motivo: null, deleganteNome: "Fulano",
    EscopoTipo: "GLOBAL", EscopoId: null, DepartamentoId: null, papelNome: "Tesoureiro Geral", papelNivel: "GLOBAL", permissoesStr: "pessoas, financeiro", ExpiradasDoTitular: "financeiro", ...extra });
  const { concessoesDelegadas } = require("../delegacoes");

  test("a concessão do delegado sai sem a permissão vencida do titular", async () => {
    const { pool, chamadas } = criarPoolFalso([[linha()]]);
    const r = await concessoesDelegadas(pool, sqlFalso, 6, "2026-11-25");
    expect(r.concessoes).toHaveLength(1);
    expect(r.concessoes[0].permissoes).toEqual(["pessoas"]);
    expect(chamadas[0].sql).toMatch(/RecertificacoesAcesso/);
  });

  test("as vencidas do próprio delegado também continuam saindo", async () => {
    const { pool } = criarPoolFalso([[linha({ ExpiradasDoTitular: null })]]);
    const r = await concessoesDelegadas(pool, sqlFalso, 6, "2026-11-25", ["pessoas"]);
    expect(r.concessoes[0].permissoes).toEqual(["financeiro"]);
  });

  test("o resumo das delegações também não soma a permissão vencida do titular", async () => {
    const { pool } = criarPoolFalso([[linha({ ExpiradasDoTitular: "financeiro,pessoas" })]]);
    const r = await permissoesEscopoDelegados(pool, sqlFalso, 6, "2026-11-25");
    expect(r.permissoesExtras).toEqual([]);
  });

  test("a data final da delegação sai como o dia (texto), não como instante", async () => {
    const { pool } = criarPoolFalso([[linha({ DataFim: new Date("2026-11-30T00:00:00Z"), DataFimTexto: "2026-11-30" })]]);
    const r = await concessoesDelegadas(pool, sqlFalso, 6, "2026-11-25");
    expect(r.delegacoesAtivas[0].dataFim).toBe("2026-11-30");
  });
});
