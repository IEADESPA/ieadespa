// v9.3 — a regra pura do Distrito (shared/distritos.js): o prazo do Dízimo Institucional, os meses de cada período, a situação de um mês, os anos do balanço e
// as validações de cada ato.
const di = require("../distritos");
const repasses = require("../repassesInstitucionais");

describe("prazo do Dízimo Institucional", () => {
  test("vence no dia da tolerância do mês seguinte, igual ao repasse institucional da v4.15", () => {
    expect(di.venceEm("2026-11", 5)).toBe("2026-12-05");
    expect(di.venceEm("2026-12", 5)).toBe("2027-01-05");
    expect(di.venceEm("2026-02", 0)).toBe("2026-02-28");
    expect(di.venceEm("2028-02", 0)).toBe("2028-02-29");
    // a mesma resposta de repassesInstitucionais.estaAtrasado, dia a dia, para várias tolerâncias
    for (const tol of [0, 1, 5, 28]) {
      for (const dia of ["2026-11-30", "2026-12-01", "2026-12-05", "2026-12-06", "2026-12-28", "2026-12-29"]) {
        const [a, m, d] = dia.split("-").map(Number);
        expect(di.mesVencido("2026-11", dia, tol)).toBe(repasses.estaAtrasado("2026-11", new Date(a, m - 1, d), tol));
      }
    }
  });
  test("o percentual sobre a soma, arredondado em centavos", () => {
    expect(di.dizimoInstitucional(1234.56, 10)).toBe(123.46);
    expect(di.dizimoInstitucional(0, 10)).toBe(0);
    expect(di.dizimoInstitucional(1000, 7.5)).toBe(75);
  });
});

describe("meses e períodos", () => {
  test("mesesEntre inclui as pontas, vira o ano e recusa mês malformado", () => {
    expect(di.mesesEntre("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(di.mesesEntre("2027-02", "2026-11")).toEqual([]);
    expect(di.mesesEntre("2026-13", "2027-01")).toEqual([]);
    expect(di.mesAnterior("2027-01")).toBe("2026-12");
    expect(di.proximoMes("2026-12")).toBe("2027-01");
  });
  test("o mês da desativação já volta para a Sede; período aberto vale daí em diante", () => {
    const periodos = [{ financeiroDesdeMes: "2026-03", financeiroAteMes: "2026-07" }, { financeiroDesdeMes: "2026-10", financeiroAteMes: null }];
    expect(di.mesDoDistrito("2026-02", periodos)).toBe(false);
    expect(di.mesDoDistrito("2026-03", periodos)).toBe(true);
    expect(di.mesDoDistrito("2026-06", periodos)).toBe(true);
    expect(di.mesDoDistrito("2026-07", periodos)).toBe(false);
    expect(di.mesDoDistrito("2026-09", periodos)).toBe(false);
    expect(di.mesDoDistrito("2026-10", periodos)).toBe(true);
    expect(di.mesDoDistrito("2030-01", periodos)).toBe(true);
  });
});

describe("situação de um mês", () => {
  const congregacoes = [{ congregacaoId: 1, nome: "A" }, { congregacaoId: 2, nome: "B" }];
  const base = { mes: "2026-10", congregacoes, percentual: 10, diasTolerancia: 5 };
  test("falta fechamento: ABERTO, com quem falta; vencido depois da tolerância", () => {
    const s = di.situacaoDoMes({ ...base, fechamentos: [{ congregacaoId: 1, totalFinal: 1000 }], repasse: null, hoje: "2026-11-05" });
    expect(s).toMatchObject({ situacao: "ABERTO", fechadas: 1, soma: 1000, valor: 100, vencido: false, venceEm: "2026-11-05" });
    expect(s.faltam).toEqual([{ congregacaoId: 2, nome: "B" }]);
    expect(di.situacaoDoMes({ ...base, fechamentos: [], repasse: null, hoje: "2026-11-06" }).vencido).toBe(true);
  });
  test("todas fecharam: APURAVEL; registrado: REGISTRADO com o valor gravado; repassado nunca vence", () => {
    const fech = [{ congregacaoId: 1, totalFinal: 1000.1 }, { congregacaoId: 2, totalFinal: 500.2 }];
    expect(di.situacaoDoMes({ ...base, fechamentos: fech, repasse: null, hoje: "2026-11-01" })).toMatchObject({ situacao: "APURAVEL", soma: 1500.3, valor: 150.03 });
    expect(di.situacaoDoMes({ ...base, fechamentos: fech, repasse: { status: "PENDENTE", valorRepasse: 149 }, hoje: "2026-12-01" }))
      .toMatchObject({ situacao: "REGISTRADO", valor: 149, vencido: true });
    expect(di.situacaoDoMes({ ...base, fechamentos: fech, repasse: { status: "REPASSADO", valorRepasse: 150.03 }, hoje: "2027-12-01" }))
      .toMatchObject({ situacao: "REPASSADO", vencido: false });
  });
  test("território sem congregação nunca é APURAVEL", () => {
    expect(di.situacaoDoMes({ ...base, congregacoes: [], fechamentos: [], repasse: null, hoje: "2026-10-10" }).situacao).toBe("ABERTO");
  });
});

describe("balanço anual ao NIF", () => {
  const periodos = [{ financeiroDesdeMes: "2025-11", financeiroAteMes: null }];
  test("os anos já terminados com algum mês do Distrito; o prazo é 31/03 do ano seguinte", () => {
    expect(di.anosDoDistrito(periodos, "2026-06-01")).toEqual([2025]);
    expect(di.anosDoDistrito(periodos, "2025-12-31")).toEqual([]);
    expect(di.anosDoDistrito([{ financeiroDesdeMes: "2024-05", financeiroAteMes: "2025-01" }], "2027-01-01")).toEqual([2024]);
    expect(di.anosDoDistrito([{ financeiroDesdeMes: "2024-05", financeiroAteMes: "2024-05" }], "2027-01-01")).toEqual([]);
    expect(di.prazoBalanco(2025)).toBe("2026-03-31");
  });
  test("atrasado depois do prazo sem enviado nem aprovado; o devolvido sem reenvio continua atrasado", () => {
    expect(di.balancosAtrasados(periodos, [], "2026-03-31")).toEqual([]);
    expect(di.balancosAtrasados(periodos, [], "2026-04-01")).toEqual([2025]);
    expect(di.balancosAtrasados(periodos, [{ ano: 2025, status: "ENVIADO" }], "2026-04-01")).toEqual([]);
    expect(di.balancosAtrasados(periodos, [{ ano: 2025, status: "DEVOLVIDO" }], "2026-04-01")).toEqual([2025]);
  });
  test("pode enviar o ano terminado, nunca dois vivos", () => {
    expect(di.podeEnviarBalanco({ ano: 2025, periodos, balancos: [], hoje: "2026-01-02" }).pode).toBe(true);
    expect(di.podeEnviarBalanco({ ano: 2026, periodos, balancos: [], hoje: "2026-06-02" }).pode).toBe(false);
    expect(di.podeEnviarBalanco({ ano: 2024, periodos, balancos: [], hoje: "2026-06-02" }).pode).toBe(false);
    expect(di.podeEnviarBalanco({ ano: 2025, periodos, balancos: [{ ano: 2025, status: "ENVIADO" }], hoje: "2026-06-02" }).mensagem).toMatch(/já está com o NIF/);
    expect(di.podeEnviarBalanco({ ano: 2025, periodos, balancos: [{ ano: 2025, status: "APROVADO" }], hoje: "2026-06-02" }).mensagem).toMatch(/já foi aprovado/);
    expect(di.podeEnviarBalanco({ ano: 2025, periodos, balancos: [{ ano: 2025, status: "DEVOLVIDO" }], hoje: "2026-06-02" }).pode).toBe(true);
  });
});

describe("validações", () => {
  const ativacao = { sessaoId: 4, gatilho: "MILHAO", cidade: "Belém", uf: "pa", populacao: "1.303.389", fontePopulacao: "IBGE, Censo 2022", fundamentacao: "Decreto da CLI na reunião de outubro." };
  test("ativação: o gatilho (b) exige mais de um milhão; população com pontos; fonte obrigatória quando há população", () => {
    expect(di.validarAtivacao(ativacao)).toMatchObject({ valido: true, dados: { gatilho: "MILHAO", uf: "PA", populacao: 1303389 } });
    expect(di.validarAtivacao({ ...ativacao, populacao: "1000000" }).valido).toBe(false);
    expect(di.validarAtivacao({ ...ativacao, populacao: "" }).valido).toBe(false);
    expect(di.validarAtivacao({ ...ativacao, fontePopulacao: "" }).valido).toBe(false);
    expect(di.validarAtivacao({ ...ativacao, gatilho: "METROPOLE", populacao: null, fontePopulacao: null })).toMatchObject({ valido: true, dados: { populacao: null } });
    expect(di.validarAtivacao({ ...ativacao, gatilho: "QUALQUER" }).valido).toBe(false);
    expect(di.validarAtivacao({ ...ativacao, sessaoId: "0x4" }).valido).toBe(false);
    expect(di.validarAtivacao({ ...ativacao, uf: "XX" }).valido).toBe(false);
    expect(di.validarAtivacao({ ...ativacao, populacao: "1,5 milhão" }).valido).toBe(false);
    expect(di.validarAtivacao({ ...ativacao, fundamentacao: "curta" }).valido).toBe(false);
  });
  test("desativação: reunião e motivo", () => {
    expect(di.validarDesativacao({ sessaoId: 3, motivo: "O Distrito voltou para a Sede." }).valido).toBe(true);
    expect(di.validarDesativacao({ sessaoId: 3, motivo: "curto" }).valido).toBe(false);
    expect(di.validarDesativacao({ motivo: "O Distrito voltou para a Sede." }).valido).toBe(false);
  });
  test("intervenção: motivo do catálogo, fundamentação longa, Interventor e medidas só verdadeiro/falso", () => {
    const iv = { motivo: "retencao_repasse", fundamentacao: "O Distrito reteve o Dízimo Institucional por três meses.", interventorMembroId: "15", bloqueioContas: true };
    expect(di.validarIntervencao(iv)).toMatchObject({ valido: true, dados: { motivo: "RETENCAO_REPASSE", interventorMembroId: 15, bloqueioContas: true, procuracao: false, judicial: false } });
    expect(di.validarIntervencao({ ...iv, procuracao: "sim" }).valido).toBe(false);
    expect(di.validarIntervencao({ ...iv, motivo: "VINGANCA" }).valido).toBe(false);
    expect(di.validarIntervencao({ ...iv, fundamentacao: "curta demais" }).valido).toBe(false);
    expect(di.validarIntervencao({ ...iv, interventorMembroId: "abc" }).valido).toBe(false);
  });
  test("encerramento: o resultado", () => {
    expect(di.validarEncerramento({ resultado: "Liderança nova nomeada e contas regularizadas." }).valido).toBe(true);
    expect(di.validarEncerramento({ resultado: "ok" }).valido).toBe(false);
  });
  test("balanço: valores em reais (vírgula ou ponto), saldo pode ser negativo, receitas e despesas não", () => {
    expect(di.validarBalanco({ ano: "2025", receitas: "1.234,56", despesas: 1000, saldoFinal: "-200,10" }))
      .toMatchObject({ valido: true, dados: { ano: 2025, receitas: 1234.56, despesas: 1000, saldoFinal: -200.1, observacoes: null } });
    expect(di.validarBalanco({ ano: 2025, receitas: "-1", despesas: 0, saldoFinal: 0 }).valido).toBe(false);
    expect(di.validarBalanco({ ano: 2025, receitas: "1,234", despesas: 0, saldoFinal: 0 }).valido).toBe(false);
    expect(di.validarBalanco({ ano: 2025, receitas: "abc", despesas: 0, saldoFinal: 0 }).valido).toBe(false);
    expect(di.validarBalanco({ ano: 2025, receitas: Infinity, despesas: 0, saldoFinal: 0 }).valido).toBe(false);
    expect(di.validarBalanco({ ano: "25", receitas: 1, despesas: 0, saldoFinal: 0 }).valido).toBe(false);
    expect(di.validarBalanco({ ano: 2025, receitas: "1234567890123", despesas: 0, saldoFinal: 0 }).valido).toBe(false);
  });
  test("análise: aprovar sem motivo; devolver exige o motivo", () => {
    expect(di.validarAnalise({ decisao: "aprovar" })).toMatchObject({ valido: true, dados: { decisao: "APROVAR", motivo: null } });
    expect(di.validarAnalise({ decisao: "DEVOLVER" }).valido).toBe(false);
    expect(di.validarAnalise({ decisao: "DEVOLVER", motivo: "Falta o extrato de dezembro." })).toMatchObject({ valido: true, dados: { motivo: "Falta o extrato de dezembro." } });
    expect(di.validarAnalise({ decisao: "TALVEZ" }).valido).toBe(false);
  });
});

describe("trechos de SQL e textos", () => {
  test("o trecho do Distrito só aceita alias simples (nada de texto de fora no SQL)", () => {
    expect(di.REPASSE_DO_DISTRITO("f", "c")).toMatch(/^EXISTS \(SELECT 1 FROM Areas dta/);
    expect(di.NOME_DO_DISTRITO_DO_REPASSE("f", "c")).toMatch(/^\(SELECT TOP 1 dtd\.Nome/);
    expect(() => di.REPASSE_DO_DISTRITO("f; DROP TABLE x", "c")).toThrow();
    expect(() => di.NOME_DO_DISTRITO_DO_REPASSE("f", "c.Nome")).toThrow();
  });
  test("os textos dos avisos citam o artigo", () => {
    expect(di.textoRepasseVencido({ distrito: "Belém", meses: ["2026-10"] })).toMatch(/10\/2026.*Art\. 126-N, III/);
    expect(di.textoBalancoAtrasado({ distrito: "Belém", anos: [2025] })).toMatch(/2025.*Art\. 126-M/);
    expect(di.textoBalancoAnalisado({ distrito: "Belém", ano: 2025, aprovado: false, motivo: "Falta o extrato." })).toMatch(/devolveu.*Falta o extrato/);
  });
});
