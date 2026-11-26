// FASE 10, Financeiro, incremento 3 (26/11/2026): a regra pura de LANÇAR DÍZIMOS E OFERTAS (shared/finLancamentos.js), tela r24-lancamento.
// Dados de mentira: o bloco 1.403 (70.151 a 70.200) de uma congregação fictícia, o exemplo do próprio desenho (dezembro começa na 70.161).
const r = require("../finLancamentos");

describe("o valor digitado vira centavos, sem número quebrado", () => {
  test.each([
    ["250,00", 25000], ["250", 25000], ["1.454,00", 145400], ["R$ 486,50", 48650], ["  30,5 ", 3050], [320.5, 32050], [194, 19400], ["99.999.999,99", 9999999999]
  ])("%p → %p centavos", (v, c) => expect(r.lerValor(v)).toBe(c));
  test.each([["0"], ["0,00"], ["-5"], [-5], ["12,345"], ["1e3"], ["abc"], [""], [null], [undefined], [NaN], [Infinity], ["100.000.000,00"], [0.001], ["1.45,00"], [{}]])(
    "%p não vale", (v) => expect(r.lerValor(v)).toBeNull());
  test("os centavos voltam como texto do banco e como a tela mostra", () => {
    expect(r.decimalDoBanco(145400)).toBe("1454.00");
    expect(r.centavosDoBanco("1454.00")).toBe(145400);
    expect(r.centavosDoBanco(0.1 + 0.2)).toBe(30);
    expect(r.reais(145400)).toBe("1.454,00");
    expect(r.reais(5)).toBe("0,05");
  });
});

describe("o mês em que a folha soma", () => {
  test("o mês, o seguinte e o anterior", () => {
    expect(r.mesDe("2026-12-02")).toBe("2026-12-01");
    expect(r.mesSeguinte("2026-12-01")).toBe("2027-01-01");
    expect(r.mesAnterior("2027-01-01")).toBe("2026-12-01");
  });
  test("este mês soma no mês do dia; mês posterior, no seguinte", () => {
    expect(r.mesSoma("2026-11-28", "ESTE_MES")).toBe("2026-11-01");
    expect(r.mesSoma("2026-11-28", "MES_POSTERIOR")).toBe("2026-12-01");
    expect(r.mesSoma("2026-12-31", "MES_POSTERIOR")).toBe("2027-01-01");
  });
  test("o nome do mês", () => {
    expect(r.nomeDoMes("2026-11-01")).toBe("novembro");
    expect(r.nomeDoMes("2027-01-01")).toBe("janeiro");
  });
});

describe("o dia do lançamento: o mês de agora ou o anterior, nunca depois de hoje, e o anterior só antes de mandar o relatório", () => {
  const hoje = "2026-12-02";
  test("hoje e um dia do mês anterior valem", () => {
    expect(r.diaDoLancamento("2026-12-02", hoje, false)).toEqual({ ok: true, dia: "2026-12-02", mes: "2026-12-01" });
    expect(r.diaDoLancamento("2026-11-30", hoje, false)).toEqual({ ok: true, dia: "2026-11-30", mes: "2026-11-01" });
    expect(r.diaDoLancamento(undefined, hoje, false)).toEqual({ ok: true, dia: hoje, mes: "2026-12-01" });
  });
  test("depois de hoje, antes do mês anterior, a data que não existe e o mês já mandado não valem", () => {
    expect(r.diaDoLancamento("2026-12-03", hoje, false)).toEqual({ ok: false, mensagem: "Depois de hoje: confira a data." });
    expect(r.diaDoLancamento("2026-10-31", hoje, false)).toEqual({ ok: false, mensagem: "Só se lança no mês de agora ou no anterior (novembro)." });
    expect(r.diaDoLancamento("2026-02-30", hoje, false).ok).toBe(false);
    expect(r.diaDoLancamento("02/12/2026", hoje, false).ok).toBe(false);
    expect(r.diaDoLancamento("2026-11-30", hoje, true)).toEqual({ ok: false, mensagem: "O relatório de novembro já foi mandado: lance em dezembro." });
  });
});

describe("o mês que a tela pede", () => {
  test("vazio é o de agora; um mês que passou vale; depois de agora e o lixo não", () => {
    expect(r.mesDaTela(undefined, "2026-12-02")).toBe("2026-12-01");
    expect(r.mesDaTela("", "2026-12-02")).toBe("2026-12-01");
    expect(r.mesDaTela("2026-11", "2026-12-02")).toBe("2026-11-01");
    expect(r.mesDaTela("2025-01", "2026-12-02")).toBe("2025-01-01");
    for (const v of ["2027-01", "2026-13", "2026-00", "2026-1", "2026-11-01", "1999-12", "' OR 1=1 --", 202611, ["2026-11"], {}]) expect(r.mesDaTela(v, "2026-12-02")).toBeNull();
  });
  test("o último dia do mês", () => {
    expect(r.ultimoDia("2026-11-01")).toBe("2026-11-30");
    expect(r.ultimoDia("2028-02-01")).toBe("2028-02-29");
    expect(r.ultimoDia("2026-12-01")).toBe("2026-12-31");
  });
});

describe("a correção", () => {
  test("o motivo é obrigatório e os campos seguem a regra da linha", () => {
    const base = { tipo: "DIZIMO", forma: "PIX", valor: "205,00", pessoa: { membroId: 700128 }, motivo: "  digitei 250 no lugar de 205 " };
    expect(r.validarCorrecao(base)).toEqual({ ok: true, motivo: "digitei 250 no lugar de 205", campos: { tipo: "DIZIMO", forma: "PIX", valor: 20500, voluntaria: null, membroId: 700128, nome: null } });
    expect(r.validarCorrecao({ ...base, motivo: "   " }).mensagem).toBe("Escreva o motivo da correção.");
    expect(r.validarCorrecao({ ...base, motivo: "x".repeat(301) }).mensagem).toBe("O motivo tem no máximo 300 letras.");
    expect(r.validarCorrecao({ ...base, valor: "-1" }).mensagem).toBe("Informe o valor.");
    expect(r.validarCorrecao({ ...base, pessoa: undefined }).mensagem).toBe("O dízimo precisa de quem deu (do cadastro ou o nome digitado).");
    expect(r.validarCorrecao(null).ok).toBe(false);
  });
  test("o que mudou", () => {
    const antes = { tipo: "DIZIMO", forma: "PIX", valor: 25000, voluntaria: null, membroId: 700128, nome: null };
    expect(r.mudancas(antes, { ...antes })).toEqual([]);
    expect(r.mudancas(antes, { ...antes, valor: 20500, forma: "ESPECIE" })).toEqual(["forma", "valor"]);
    expect(r.mudancas(antes, { ...antes, membroId: null, nome: "Maria O." })).toEqual(["membroId", "nome"]);
  });
});

describe("a linha da planilha", () => {
  const dizimo = { folha: 70165, referente: "ESTE_MES", tipo: "DIZIMO", forma: "PIX", valor: "320,00", voluntaria: "30,00", pessoa: { membroId: 700128 } };
  test("o dízimo com a voluntária junto", () => {
    expect(r.validarLinha(dizimo)).toEqual({ ok: true, linha: { folha: 70165, referente: "ESTE_MES", tipo: "DIZIMO", forma: "PIX", valor: 32000, voluntaria: 3000, membroId: 700128, nome: null } });
  });
  test("a oferta de culto pode ir sem nome; o nome digitado vale", () => {
    expect(r.validarLinha({ folha: 70166, referente: "ESTE_MES", tipo: "OFERTA_CULTO", forma: "ESPECIE", valor: "486,50" }).ok).toBe(true);
    const v = r.validarLinha({ folha: 70170, referente: "ESTE_MES", tipo: "OFERTA_VOLUNTARIA", forma: "ESPECIE", valor: "50", pessoa: { nome: "  Paulo  Dias " } });
    expect(v.linha).toMatchObject({ membroId: null, nome: "Paulo Dias", valor: 5000 });
  });
  test("o que falta ou não confere", () => {
    expect(r.validarLinha({ ...dizimo, pessoa: undefined })).toEqual({ ok: false, mensagem: "Folha 70.165: o dízimo precisa de quem deu (do cadastro ou o nome digitado)." });
    expect(r.validarLinha({ ...dizimo, valor: "0" })).toEqual({ ok: false, mensagem: "Folha 70.165: informe o valor." });
    expect(r.validarLinha({ ...dizimo, tipo: "DOACAO" }).mensagem).toBe("Folha 70.165: escolha o tipo (dízimo, oferta de culto ou oferta voluntária).");
    expect(r.validarLinha({ ...dizimo, forma: "CHEQUE" }).mensagem).toBe("Folha 70.165: escolha a forma (Pix ou espécie).");
    for (const palavra of ["constructor", "__proto__", "toString", "valueOf"]) {   // só o que a tabela de escolhas tem (revisão de fora, L2)
      expect(r.validarLinha({ ...dizimo, tipo: palavra }).mensagem).toBe("Folha 70.165: escolha o tipo (dízimo, oferta de culto ou oferta voluntária).");
      expect(r.validarLinha({ ...dizimo, forma: palavra }).mensagem).toBe("Folha 70.165: escolha a forma (Pix ou espécie).");
    }
    expect(r.validarLinha({ ...dizimo, tipo: "OFERTA_CULTO" }).mensagem).toBe("Folha 70.165: a oferta voluntária junto só vai com o dízimo.");
    expect(r.validarLinha({ ...dizimo, referente: "MES_ANTERIOR" }).mensagem).toBe("Folha 70.165: escolha “Este mês” ou “Mês posterior”.");
    expect(r.validarLinha({ ...dizimo, pessoa: { membroId: 1, nome: "Fulano" } }).mensagem).toBe("Folha 70.165: escolha o membro do cadastro ou digite o nome, não os dois.");
    expect(r.validarLinha({ ...dizimo, folha: "70.165" }).ok).toBe(false);
    expect(r.validarLinha({ ...dizimo, pessoa: { nome: "x".repeat(121) } }).mensagem).toBe("Folha 70.165: o nome tem no máximo 120 letras.");
    // o número do membro cabe no INT do banco: 2^40 chegava ao CAST e virava erro 500 (o lixo do e2e-204 pegou)
    for (const membroId of [2 ** 40, 2147483648, 0, -1, 1.5]) {
      expect(r.validarLinha({ ...dizimo, pessoa: { membroId } }).mensagem).toBe("Folha 70.165: o membro escolhido não confere.");
    }
    expect(r.validarLinha({ ...dizimo, pessoa: { membroId: 2147483647 } }).ok).toBe(true);
    expect(r.validarCorrecao({ ...dizimo, motivo: "x", pessoa: { membroId: 2 ** 40 } }).mensagem).toBe("O membro escolhido não confere.");
  });
  test("a folha marcada “mês posterior” fica sem nome e sem valor", () => {
    expect(r.validarLinha({ folha: 70161, referente: "MES_POSTERIOR" })).toEqual({ ok: true, linha: { folha: 70161, referente: "MES_POSTERIOR", tipo: null, forma: null, valor: null, voluntaria: null, membroId: null, nome: null } });
    expect(r.validarLinha({ folha: 70161, referente: "MES_POSTERIOR", valor: "250,00" }).mensagem)
      .toBe("Folha 70.161: a folha do mês posterior fica sem nome e sem valor; eles entram na planilha do mês seguinte.");
  });
  test("ao preencher a folha que veio marcada do mês anterior, o nome e o valor são obrigatórios", () => {
    const base = { folha: 70161, tipo: "DIZIMO", forma: "ESPECIE", valor: "250,00", pessoa: { membroId: 700087 } };
    expect(r.validarLinha(base, { preencher: true }).ok).toBe(true);
    expect(r.validarLinha({ ...base, tipo: "OFERTA_CULTO", pessoa: undefined }, { preencher: true }).mensagem).toBe("Folha 70.161: informe quem deu (a folha veio marcada do mês anterior).");
    expect(r.validarLinha({ ...base, referente: "MES_POSTERIOR" }, { preencher: true }).ok).toBe(true);
  });
});

// a decisão 4 corrigida (26/11/2026): a cancelada, a arrancada e a inexistente se marcam na própria planilha, com o motivo, pela mesma regra
// do servidor que a aba Folhas usa (o histórico e o desfazer da r30)
describe("a folha marcada na planilha", () => {
  const arrancada = { folha: 70168, excecao: { oQueAconteceu: "arrancada", observacao: "  Rasgou ao preencher " } };
  test("a cancelada, a arrancada e a inexistente, com o motivo", () => {
    expect(r.excecaoNaPlanilha(arrancada)).toEqual({ ok: true, excecao: { folha: 70168, destino: "ARRANCADA", observacao: "Rasgou ao preencher" } });
    expect(r.excecaoNaPlanilha({ folha: 70169, excecao: { oQueAconteceu: "Cancelada", observacao: "Preenchida errado" } }).excecao.destino).toBe("CANCELADA");
    expect(r.excecaoNaPlanilha({ folha: 70170, excecao: { oQueAconteceu: "inexistente", observacao: "Saiu da gráfica sem ela" } }).excecao.destino).toBe("INEXISTENTE");
  });
  test("a extraviada fica na aba Folhas", () => {
    expect(r.excecaoNaPlanilha({ folha: 70168, excecao: { oQueAconteceu: "extraviada", observacao: "Sumiu" } }))
      .toEqual({ ok: false, mensagem: "Folha 70.168: a extraviada se marca na aba Folhas do bloco." });
  });
  test("o que falta ou não confere", () => {
    const sem = "Folha 70.168: escolha o que aconteceu: cancelada, arrancada ou inexistente.";
    expect(r.excecaoNaPlanilha({ folha: 70168, excecao: { oQueAconteceu: "LANCADA", observacao: "x" } }).mensagem).toBe(sem);
    expect(r.excecaoNaPlanilha({ folha: 70168, excecao: "arrancada" }).mensagem).toBe(sem);
    expect(r.excecaoNaPlanilha({ folha: 70168, excecao: [] }).mensagem).toBe(sem);
    for (const palavra of ["constructor", "__proto__", "toString"]) expect(r.excecaoNaPlanilha({ folha: 70168, excecao: { oQueAconteceu: palavra, observacao: "x" } }).mensagem).toBe(sem);
    expect(r.excecaoNaPlanilha({ folha: 70168, excecao: { oQueAconteceu: "arrancada", observacao: "   " } }).mensagem).toBe("Folha 70.168: escreva o motivo (o que aconteceu com a folha).");
    expect(r.excecaoNaPlanilha({ folha: 70168, excecao: { oQueAconteceu: "arrancada", observacao: 5 } }).mensagem).toBe("Folha 70.168: escreva o motivo (o que aconteceu com a folha).");
    expect(r.excecaoNaPlanilha({ folha: 70168, excecao: { oQueAconteceu: "arrancada", observacao: "x".repeat(301) } }).mensagem).toBe("Folha 70.168: o motivo tem no máximo 300 letras.");
    expect(r.excecaoNaPlanilha({ ...arrancada, folha: "70.168" })).toEqual({ ok: false, mensagem: "Confira o número da folha." });
  });
  test("a folha marcada não leva tipo, valor nem quem deu", () => {
    const misturada = "Folha 70.168: a folha marcada fica sem tipo, sem valor e sem quem deu.";
    for (const campo of [{ referente: "ESTE_MES" }, { tipo: "DIZIMO" }, { forma: "PIX" }, { valor: "10,00" }, { voluntaria: "1" }, { pessoa: { membroId: 700128 } }]) {
      expect(r.excecaoNaPlanilha({ ...arrancada, ...campo }).mensagem).toBe(misturada);
    }
  });
});

describe("a planilha do mês (o exemplo do desenho: dezembro começa na 70.161)", () => {
  const faixas = [{ blocoId: 3, bloco: 1403, de: 70151, ate: 70200, saidaId: 9, aberta: true }];
  const L = (folha, dia, referente, extra = {}) => ({ folha, dia, referente, mesSoma: r.mesSoma(dia, referente), valor: referente === "MES_POSTERIOR" && !extra.preenchido ? null : 10000, tipo: "DIZIMO", forma: "PIX", ...extra });
  const usadas = [];
  for (let f = 70151; f <= 70160; f++) usadas.push(L(f, "2026-11-20", "ESTE_MES"));
  usadas.push(L(70161, "2026-11-28", "MES_POSTERIOR"), L(70162, "2026-11-29", "MES_POSTERIOR", { preenchido: true }));
  usadas.push(L(70163, "2026-11-29", "ESTE_MES"), L(70164, "2026-11-30", "ESTE_MES"));
  usadas.push(L(70165, "2026-12-01", "ESTE_MES"), L(70166, "2026-12-01", "ESTE_MES", { tipo: "OFERTA_CULTO" }), L(70167, "2026-12-02", "ESTE_MES"));
  const excecoes = [{ folha: 70168, destino: "ARRANCADA", observacao: "rasgou ao preencher", dia: "2026-12-02" }];
  usadas.push(L(70169, "2026-12-02", "ESTE_MES"), L(70170, "2026-12-02", "ESTE_MES", { tipo: "OFERTA_VOLUNTARIA" }));

  test("dezembro: as duas marcadas em novembro primeiro, as duas que somaram em novembro com a tarja, depois dezembro e a próxima", () => {
    const p = r.montarPlanilha({ faixas, lancamentos: usadas, excecoes, lancadasSemDados: [], mes: "2026-12-01" });
    expect(p.comeca).toBe(70161);
    expect(p.proxima).toEqual({ folha: 70171, blocoId: 3, bloco: 1403, saidaId: 9 });
    expect(p.linhas.map((x) => [x.folha, x.situacao])).toEqual([
      [70161, "preencher"], [70162, "lancada"], [70163, "anterior"], [70164, "anterior"], [70165, "lancada"], [70166, "lancada"], [70167, "lancada"],
      [70168, "excecao"], [70169, "lancada"], [70170, "lancada"]
    ]);
    expect(p.linhas[0]).toMatchObject({ veioDoMesAnterior: true });
    expect(p.linhas[2]).toMatchObject({ mesSoma: "2026-11-01" });
    expect(p.linhas[7]).toMatchObject({ destino: "ARRANCADA", observacao: "rasgou ao preencher" });
    expect(p.linhas[4]).toMatchObject({ folha: 70165, tipo: "DIZIMO", forma: "PIX", valor: 10000, blocoId: 3, saidaId: 9 });
    expect(p.marcadasNoAnterior).toEqual([70161, 70162]);
  });

  test("novembro: a 70.161 e a 70.162 só com a linha do mês posterior", () => {
    const p = r.montarPlanilha({ faixas, lancamentos: usadas, excecoes, lancadasSemDados: [], mes: "2026-11-01" });
    expect(p.comeca).toBe(70151);
    const t = Object.fromEntries(p.linhas.map((x) => [x.folha, x.situacao]));
    expect(t[70160]).toBe("lancada");
    expect(t[70161]).toBe("posterior");
    expect(t[70162]).toBe("posterior");
    expect(t[70164]).toBe("lancada");
    expect(t[70165]).toBeUndefined();
    expect(p.proxima.folha).toBe(70171);
  });

  test("a folha sem destino no meio fica para preencher; a do bloco que voltou também", () => {
    const furo = usadas.filter((x) => x.folha !== 70166);
    const p = r.montarPlanilha({ faixas, lancamentos: furo, excecoes, lancadasSemDados: [], mes: "2026-12-01" });
    expect(p.linhas.find((x) => x.folha === 70166).situacao).toBe("pendente");
    const voltou = [{ blocoId: 2, bloco: 1390, de: 69501, ate: 69520, saidaId: 4, aberta: false }, ...faixas];
    const q = r.montarPlanilha({ faixas: voltou, lancamentos: usadas, excecoes, lancadasSemDados: [69501, 69502], mes: "2026-12-01" });
    expect(q.comeca).toBe(69503);
    expect(q.linhas[0]).toMatchObject({ folha: 69503, situacao: "pendente" });
    expect(q.linhas.filter((x) => x.situacao === "pendente").length).toBe(18);
    expect(q.linhas.some((x) => x.folha >= 70151 && x.folha <= 70160)).toBe(false);
    expect(q.linhas[0]).toMatchObject({ blocoId: 2, saidaId: 4 });
  });

  test("sem nada lançado antes: começa na primeira folha do bloco", () => {
    const p = r.montarPlanilha({ faixas, lancamentos: [], excecoes: [], lancadasSemDados: [], mes: "2026-12-01" });
    expect(p.comeca).toBe(70151);
    expect(p.linhas).toEqual([]);
    expect(p.proxima.folha).toBe(70151);
  });

  test("sem bloco: nada a lançar", () => {
    const p = r.montarPlanilha({ faixas: [], lancamentos: [], excecoes: [], lancadasSemDados: [], mes: "2026-12-01" });
    expect(p).toMatchObject({ comeca: null, proxima: null, linhas: [] });
  });

  test("os totais de dezembro contam a 70.161 e a 70.162 (a 70.161 só depois de preenchida)", () => {
    const preenchida = usadas.map((x) => (x.folha === 70161 ? { ...x, valor: 25000, preenchido: true } : x.folha === 70165 ? { ...x, voluntaria: 3000 } : x));
    const t = r.totaisDoMes(preenchida, "2026-12-01");
    expect(t.dizimos).toBe(25000 + 10000 + 10000 + 10000 + 10000);
    expect(t.ofertaCulto).toBe(10000);
    expect(t.ofertaVoluntaria).toBe(10000 + 3000);
    expect(t.voluntariasJunto).toBe(1);
    expect(t.voluntariasSozinhas).toBe(1);
    expect(t.total).toBe(t.dizimos + t.ofertaCulto + t.ofertaVoluntaria);
    expect(t.pix + t.especie).toBe(t.total);
    expect(t.adiantado).toBe(25000 + 10000);
  });

  test("a tira do bloco 1.403 em 02/12, com a legenda do desenho", () => {
    const p = r.montarPlanilha({ faixas, lancamentos: usadas, excecoes, lancadasSemDados: [], mes: "2026-12-01" });
    const bloco = { blocoId: 3, numero: 1403, primeiraFolha: 70151, ultimaFolha: 70200 };
    const t = r.tiraDoBloco({ bloco, lancamentos: usadas, excecoes, lancadasSemDados: [], proxima: p.proxima, mes: "2026-12-01" });
    expect(t).toMatchObject({ blocoId: 3, numero: 1403, primeiraFolha: 70151, ultimaFolha: 70200 });
    expect(t.posicoes.length).toBe(50);
    expect(t.posicoes.slice(0, 22)).toEqual([...Array(10).fill("antes"), "posterior", "posterior", "antes", "antes", ...Array(6).fill("mes"), "proxima", "livre"]);
    expect(t.legenda).toEqual([
      { estado: "antes", texto: "novembro: 1ª a 10ª, 13ª e 14ª" }, { estado: "posterior", texto: "mês posterior: 11ª e 12ª" },
      { estado: "mes", texto: "dezembro: da 15ª" }, { estado: "proxima", texto: "a próxima: 70.171" }
    ]);
    const novembro = r.tiraDoBloco({ bloco, lancamentos: usadas, excecoes, lancadasSemDados: [], proxima: p.proxima, mes: "2026-11-01" });
    expect(novembro.legenda.map((x) => x.texto)).toEqual(["novembro: 1ª a 10ª, 13ª e 14ª", "mês posterior: 11ª e 12ª", "depois de novembro: 15ª a 20ª", "a próxima: 70.171"]);
    expect(novembro.legenda[0].estado).toBe("mes");
  });

  test("a faixa das posições, como a legenda do bloco", () => {
    expect(r.posicoesEmTexto([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14])).toBe("1ª a 10ª, 13ª e 14ª");
    expect(r.posicoesEmTexto([11, 12])).toBe("11ª e 12ª");
    expect(r.posicoesEmTexto([15])).toBe("15ª");
    expect(r.posicoesEmTexto([])).toBe("");
  });
});
