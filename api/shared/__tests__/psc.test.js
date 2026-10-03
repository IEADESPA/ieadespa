// Testes da v7.1 (PSC — Programa de Saúde Congregacional, Regimento Art. 127-129):
// a Escada Bloqueada (degraus, bloqueio, consolidação nos 5 Sinais), prazo do
// exercício, esteira com segregação de funções, validação das entradas, o
// gatilho da reclassificação compulsória (2 exercícios seguidos reprovados no
// Nível 1) e a apuração assistida. Lógica pura; as funções de banco que tocam
// no pool rodam com pool falso.
const psc = require("../psc");
const apuracao = require("../pscApuracao");
const { criarPoolFalso } = require("./testUtils");

// Monta respostas de um Sinal: cada item é [nivel, situacao]; ids sequenciais.
function respostasDoSinal(sinalId, itens) {
  return itens.map(([nivel, situacao], i) => ({ respostaId: sinalId * 100 + i, sinalId, nivel, codigo: `${sinalId}.${nivel}.${String.fromCharCode(97 + i)}`, situacao }));
}
const todosAtendidos = (sinalId) => respostasDoSinal(sinalId, [1, 2, 3, 4, 5].flatMap(n => [[n, "ATENDIDO"], [n, "ATENDIDO"]]));

describe("Escada Bloqueada — um Sinal Vital", () => {
  test("todos os degraus atendidos: nível 5, concluído", () => {
    const r = psc.calcularSinal(todosAtendidos(1));
    expect(r.nivel).toBe(5);
    expect(r.concluido).toBe(true);
    expect(r.nivelDeParada).toBeNull();
    expect(r.niveis.every(n => n.situacao === "COMPLETO")).toBe(true);
  });

  test("reprovou no degrau 3: vale 2, degraus 4 e 5 ficam BLOQUEADOS e a avaliação está concluída", () => {
    const itens = [[1, "ATENDIDO"], [2, "ATENDIDO"], [3, "ATENDIDO"], [3, "NAO_ATENDIDO"], [4, "PENDENTE"], [5, "PENDENTE"]];
    const r = psc.calcularSinal(respostasDoSinal(1, itens));
    expect(r.nivel).toBe(2);
    expect(r.concluido).toBe(true);
    expect(r.nivelDeParada).toBe(3);
    expect(r.niveis.map(n => n.situacao)).toEqual(["COMPLETO", "COMPLETO", "REPROVADO", "BLOQUEADO", "BLOQUEADO"]);
  });

  test("degrau de cima completo NÃO conta se o de baixo reprovou (a escada é cumulativa)", () => {
    const itens = [[1, "ATENDIDO"], [2, "NAO_ATENDIDO"], [3, "ATENDIDO"], [4, "ATENDIDO"], [5, "ATENDIDO"]];
    const r = psc.calcularSinal(respostasDoSinal(1, itens));
    expect(r.nivel).toBe(1);
    expect(r.niveis[2].situacao).toBe("BLOQUEADO");
  });

  test("alínea ainda sem resposta no degrau: INCOMPLETO, não concluído, nível é o do degrau anterior", () => {
    const itens = [[1, "ATENDIDO"], [2, "ATENDIDO"], [2, "PENDENTE"], [3, "PENDENTE"]];
    const r = psc.calcularSinal(respostasDoSinal(1, itens));
    expect(r.nivel).toBe(1);
    expect(r.concluido).toBe(false);
    expect(r.nivelDeParada).toBe(2);
    expect(r.niveis[1].pendentes).toBe(1);
  });

  test("uma alínea não atendida basta para reprovar o degrau, mesmo com outras pendentes", () => {
    const r = psc.calcularSinal(respostasDoSinal(1, [[1, "NAO_ATENDIDO"], [1, "PENDENTE"]]));
    expect(r.niveis[0].situacao).toBe("REPROVADO");
    expect(r.nivel).toBe(0);
    expect(r.concluido).toBe(true);
  });

  test("degrau sem nenhum critério ativo é transposto", () => {
    const r = psc.calcularSinal(respostasDoSinal(1, [[1, "ATENDIDO"], [3, "ATENDIDO"]]));
    expect(r.niveis[1].situacao).toBe("SEM_CRITERIOS");
    expect(r.nivel).toBe(5); // 2, 4 e 5 não têm critério ativo: transpostos
    expect(r.concluido).toBe(true);
  });

  test("calcularSinalPorContagem dá o mesmo resultado das respostas", () => {
    const itens = [[1, "ATENDIDO"], [1, "ATENDIDO"], [2, "NAO_ATENDIDO"], [2, "ATENDIDO"]];
    const a = psc.calcularSinal(respostasDoSinal(1, itens));
    const b = psc.calcularSinalPorContagem({ 1: { total: 2, atendidos: 2, naoAtendidos: 0 }, 2: { total: 2, atendidos: 1, naoAtendidos: 1 } });
    expect(b).toEqual(a);
  });
});

describe("Escada Bloqueada — a avaliação (5 Sinais)", () => {
  const meta = [1, 2, 3, 4, 5].map(i => ({ sinalId: i, codigo: `S${i}`, nome: `Sinal ${i}`, ordem: i }));
  const sinaisNivel = (niveis) => niveis.flatMap((limite, i) => {
    const sinalId = i + 1;
    return respostasDoSinal(sinalId, [1, 2, 3, 4, 5].map(n => [n, n <= limite ? "ATENDIDO" : (n === limite + 1 ? "NAO_ATENDIDO" : "PENDENTE")]));
  });

  test("o nível da congregação é o do Sinal mais fraco", () => {
    const r = psc.calcularAvaliacao(sinaisNivel([5, 4, 3, 5, 4]), meta);
    expect(r.concluido).toBe(true);
    expect(r.nivelFinal).toBe(3);
    expect(r.classificacao).toBe("EM_DESENVOLVIMENTO");
    expect(r.rotuloClassificacao).toMatch(/Desenvolvimento/);
  });

  test("níveis 4 e 5 = Congregação de Referência; 1 a 3 = Em Desenvolvimento", () => {
    expect(psc.calcularAvaliacao(sinaisNivel([4, 4, 4, 4, 4]), meta).classificacao).toBe("REFERENCIA");
    expect(psc.calcularAvaliacao(sinaisNivel([5, 5, 5, 5, 5]), meta).nivelFinal).toBe(5);
    expect(psc.calcularAvaliacao(sinaisNivel([3, 5, 5, 5, 5]), meta).classificacao).toBe("EM_DESENVOLVIMENTO");
    expect(psc.calcularAvaliacao(sinaisNivel([1, 1, 1, 1, 1]), meta).nivelFinal).toBe(1);
  });

  test("reprovar o Nível 1 em QUALQUER Sinal reprova a congregação (nível 0)", () => {
    const r = psc.calcularAvaliacao(sinaisNivel([5, 5, 0, 5, 5]), meta);
    expect(r.reprovadaNivel1).toBe(true);
    expect(r.nivelFinal).toBe(0);
    expect(r.classificacao).toBe("REPROVADA");
    expect(r.rotuloClassificacao).toMatch(/Nível 1/);
  });

  test("a reprovação já é definitiva mesmo com outro Sinal ainda incompleto", () => {
    const respostas = [
      ...respostasDoSinal(1, [[1, "NAO_ATENDIDO"]]),
      ...respostasDoSinal(2, [[1, "PENDENTE"]])
    ];
    const r = psc.calcularAvaliacao(respostas, meta);
    expect(r.concluido).toBe(false);
    expect(r.reprovadaNivel1).toBe(true);
    expect(r.classificacao).toBe("REPROVADA");
  });

  test("sem concluir todos os Sinais não há nível final nem classificação (só o provisório)", () => {
    const r = psc.calcularAvaliacao([...respostasDoSinal(1, [[1, "ATENDIDO"]]), ...respostasDoSinal(2, [[1, "PENDENTE"]])], meta);
    expect(r.concluido).toBe(false);
    expect(r.nivelFinal).toBeNull();
    expect(r.classificacao).toBeNull();
    expect(r.nivelProvisorio).toBe(0);
  });

  test("avaliação sem nenhuma resposta não vira classificação", () => {
    const r = psc.calcularAvaliacao([], meta);
    expect(r.concluido).toBe(false);
    expect(r.classificacao).toBeNull();
  });

  test("pendenciasDeEnvio lista só as alíneas do degrau onde cada escada parou", () => {
    const respostas = [
      ...respostasDoSinal(1, [[1, "ATENDIDO"], [2, "PENDENTE"], [2, "PENDENTE"], [3, "PENDENTE"]]),
      ...respostasDoSinal(2, [[1, "NAO_ATENDIDO"], [2, "PENDENTE"]]),
      ...respostasDoSinal(3, [[1, "ATENDIDO"]])
    ];
    expect(psc.pendenciasDeEnvio(respostas, meta)).toEqual(["1.2.b", "1.2.c"]);
  });

  test("montarEscada marca como bloqueadas as alíneas dos degraus acima da reprovação", () => {
    const respostas = respostasDoSinal(1, [[1, "ATENDIDO"], [2, "NAO_ATENDIDO"], [3, "PENDENTE"]]);
    const escada = psc.montarEscada(respostas, meta);
    const niveis = escada.sinais[0].niveis;
    expect(niveis[2].criterios[0].bloqueada).toBe(true);
    expect(niveis[1].criterios[0].bloqueada).toBe(false);
    expect(niveis[0].criterios).toHaveLength(1);
  });
});

describe("exercício e prazo", () => {
  test("prazo de envio = 31/12 do ano + N dias", () => {
    expect(psc.prazoEnvio(2026, 90)).toBe("2027-03-31");
    expect(psc.prazoEnvio(2027, 0)).toBe("2027-12-31");
    expect(psc.prazoEnvio(2023, 60)).toBe("2024-02-29"); // bissexto
  });

  test("situaçãoPrazo: em andamento, no prazo, atrasado e cumprido", () => {
    const base = { ano: 2026, prazoDias: 90 };
    expect(psc.situacaoPrazo({ ...base, status: null, hoje: "2026-10-01" }).situacao).toBe("EM_ANDAMENTO");
    expect(psc.situacaoPrazo({ ...base, status: "RASCUNHO", hoje: "2026-12-31" }).situacao).toBe("EM_ANDAMENTO");
    expect(psc.situacaoPrazo({ ...base, status: "RASCUNHO", hoje: "2027-01-01" }).situacao).toBe("NO_PRAZO");
    expect(psc.situacaoPrazo({ ...base, status: "RASCUNHO", hoje: "2027-03-31" }).situacao).toBe("NO_PRAZO");
    expect(psc.situacaoPrazo({ ...base, status: "RASCUNHO", hoje: "2027-04-01" }).situacao).toBe("ATRASADO");
    expect(psc.situacaoPrazo({ ...base, status: null, hoje: "2027-04-01" }).situacao).toBe("ATRASADO");
    expect(psc.situacaoPrazo({ ...base, status: "ENVIADA", hoje: "2027-06-01" }).situacao).toBe("CUMPRIDO");
    expect(psc.situacaoPrazo({ ...base, status: "HOMOLOGADA", hoje: "2027-06-01" }).prazoEnvio).toBe("2027-03-31");
  });

  test("antes do primeiro exercício não há prazo a cumprir (não pinta tudo de atrasado)", () => {
    const base = { ano: 2025, prazoDias: 90, hoje: "2027-06-01", primeiroExercicio: 2026 };
    expect(psc.situacaoPrazo({ ...base, status: null }).situacao).toBe("NAO_SE_APLICA");
    expect(psc.situacaoPrazo({ ...base, status: "RASCUNHO" }).situacao).toBe("ATRASADO"); // se abriram, vale a regra normal
    expect(psc.situacaoPrazo({ ...base, ano: 2026, status: null }).situacao).toBe("ATRASADO");
    expect(psc.situacaoPrazo({ ano: 2025, prazoDias: 90, hoje: "2027-06-01", status: null }).situacao).toBe("ATRASADO"); // sem o parâmetro, comporta-se como antes
  });

  test("validarAno: não antes do primeiro exercício, não no futuro", () => {
    const o = { hoje: "2026-10-01", primeiroExercicio: 2026 };
    expect(psc.validarAno(2026, o)).toEqual({ valido: true, ano: 2026 });
    expect(psc.validarAno("2026", o).valido).toBe(true);
    expect(psc.validarAno(2025, o).mensagem).toMatch(/2026/);
    expect(psc.validarAno(2027, o).mensagem).toMatch(/ainda não começou/);
    expect(psc.validarAno("abc", o).valido).toBe(false);
    expect(psc.validarAno(2026.5, o).valido).toBe(false);
  });
});

describe("esteira e segregação de funções", () => {
  const av = (status, extra = {}) => ({ status, enviadaPorMembroId: 10, validadaPorMembroId: 20, ...extra });

  test("cada ação só vale no estado certo", () => {
    expect(psc.checarTransicao("enviar", av("RASCUNHO"), 1).ok).toBe(true);
    expect(psc.checarTransicao("enviar", av("ENVIADA"), 1).ok).toBe(false);
    expect(psc.checarTransicao("validar", av("RASCUNHO"), 1).ok).toBe(false);
    expect(psc.checarTransicao("homologar", av("ENVIADA"), 1).ok).toBe(false);
    expect(psc.checarTransicao("homologar", av("HOMOLOGADA"), 1).ok).toBe(false);
    expect(psc.checarTransicao("devolver", av("RASCUNHO"), 1).ok).toBe(false);
    expect(psc.checarTransicao("devolver", av("ENVIADA"), 1).ok).toBe(true);
    expect(psc.checarTransicao("devolver", av("VALIDADA"), 1).ok).toBe(true);
    expect(psc.checarTransicao("devolver", av("HOMOLOGADA"), 1).ok).toBe(false);
    expect(psc.checarTransicao("reabrir", av("HOMOLOGADA"), 1).ok).toBe(true);
    expect(psc.checarTransicao("reabrir", av("VALIDADA"), 1).ok).toBe(false);
  });

  test("quem enviou não valida", () => {
    const r = psc.checarTransicao("validar", av("ENVIADA"), 10);
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/segregação/);
    expect(psc.checarTransicao("validar", av("ENVIADA"), 11).ok).toBe(true);
  });

  test("quem enviou ou validou não homologa", () => {
    expect(psc.checarTransicao("homologar", av("VALIDADA"), 10).ok).toBe(false);
    expect(psc.checarTransicao("homologar", av("VALIDADA"), 20).ok).toBe(false);
    expect(psc.checarTransicao("homologar", av("VALIDADA"), 30)).toEqual({ ok: true, para: "HOMOLOGADA" });
  });

  test("ação desconhecida é recusada", () => {
    expect(psc.checarTransicao("apagar", av("RASCUNHO"), 1).ok).toBe(false);
  });

  test("sem identificar quem age, a etapa NEGA (a segregação não pode falhar aberta)", () => {
    for (const quem of [undefined, null, 0, "", "x", -1]) {
      expect(psc.checarTransicao("enviar", av("RASCUNHO"), quem).ok).toBe(false);
      expect(psc.checarTransicao("validar", av("ENVIADA", { enviadaPorMembroId: null }), quem).ok).toBe(false);
      expect(psc.checarTransicao("homologar", av("VALIDADA", { enviadaPorMembroId: null, validadaPorMembroId: null }), quem).ok).toBe(false);
    }
    expect(psc.checarTransicao("validar", av("ENVIADA", { enviadaPorMembroId: null }), 7).ok).toBe(true);
  });

  test("quem respondeu alguma alínea é o preparador, mesmo sem ter clicado em Enviar", () => {
    const respostas = [{ respondidaPorMembroId: null }, { respondidaPorMembroId: 41 }, { respondidaPorMembroId: 42 }];
    expect(psc.respondeuAlgumaAlinea(respostas, 41)).toBe(true);
    expect(psc.respondeuAlgumaAlinea(respostas, "42")).toBe(true);
    expect(psc.respondeuAlgumaAlinea(respostas, 43)).toBe(false);
    expect(psc.respondeuAlgumaAlinea([], 41)).toBe(false);
    expect(psc.respondeuAlgumaAlinea([{}], 41)).toBe(false);
  });

  test("a mensagem de estado errado diz em que estado a avaliação está", () => {
    expect(psc.checarTransicao("homologar", av("ENVIADA"), 1).mensagem).toMatch(/aguardando validação/);
  });
});

describe("entradas", () => {
  test("validarEvidenciaUrl aceita só https, sem espaço, até 500", () => {
    expect(psc.validarEvidenciaUrl("")).toEqual({ valido: true, url: null });
    expect(psc.validarEvidenciaUrl(null).url).toBeNull();
    expect(psc.validarEvidenciaUrl("https://drive.example/foto.jpg")).toEqual({ valido: true, url: "https://drive.example/foto.jpg" });
    expect(psc.validarEvidenciaUrl("  https://a.b/c  ").url).toBe("https://a.b/c");
    expect(psc.validarEvidenciaUrl("http://a.b/c").valido).toBe(false);
    expect(psc.validarEvidenciaUrl("javascript:alert(1)").valido).toBe(false);
    expect(psc.validarEvidenciaUrl("data:text/html,x").valido).toBe(false);
    expect(psc.validarEvidenciaUrl("https://").valido).toBe(false);
    expect(psc.validarEvidenciaUrl("https://a.b/c d").valido).toBe(false);
    expect(psc.validarEvidenciaUrl("https://a.b/" + "x".repeat(500)).valido).toBe(false);
  });

  test("validarRespostasEntrada normaliza e recusa lixo", () => {
    const ok = psc.validarRespostasEntrada([
      { respostaId: 5, situacao: "atendido", observacao: "  ok  ", evidenciaUrl: "https://a.b/c" },
      { respostaId: "6", situacao: "NAO_ATENDIDO" },
      { respostaId: 7, situacao: "PENDENTE", observacao: "   " }
    ]);
    expect(ok.valido).toBe(true);
    expect(ok.itens).toEqual([
      { respostaId: 5, situacao: "ATENDIDO", observacao: "ok", evidenciaUrl: "https://a.b/c" },
      { respostaId: 6, situacao: "NAO_ATENDIDO", observacao: null, evidenciaUrl: null },
      { respostaId: 7, situacao: "PENDENTE", observacao: null, evidenciaUrl: null }
    ]);
    expect(psc.validarRespostasEntrada([]).valido).toBe(false);
    expect(psc.validarRespostasEntrada("x").valido).toBe(false);
    expect(psc.validarRespostasEntrada([{ respostaId: 0, situacao: "ATENDIDO" }]).valido).toBe(false);
    expect(psc.validarRespostasEntrada([{ respostaId: 1, situacao: "TALVEZ" }]).mensagem).toMatch(/Situação inválida/);
    expect(psc.validarRespostasEntrada([{ respostaId: 1, situacao: "ATENDIDO" }, { respostaId: 1, situacao: "ATENDIDO" }]).mensagem).toMatch(/repetida/);
    expect(psc.validarRespostasEntrada([{ respostaId: 1, situacao: "ATENDIDO", observacao: "x".repeat(501) }]).valido).toBe(false);
    expect(psc.validarRespostasEntrada([{ respostaId: 1, situacao: "ATENDIDO", evidenciaUrl: "ftp://x" }]).valido).toBe(false);
    const muitos = Array.from({ length: 201 }, (_, i) => ({ respostaId: i + 1, situacao: "ATENDIDO" }));
    expect(psc.validarRespostasEntrada(muitos).valido).toBe(false);
  });

  test("validarNovoCriterio", () => {
    expect(psc.validarNovoCriterio({ sinalId: 1, nivel: 2, texto: "Um critério novo de verdade" })).toEqual({
      valido: true, dados: { sinalId: 1, nivel: 2, texto: "Um critério novo de verdade", orientacao: null }
    });
    expect(psc.validarNovoCriterio({ sinalId: 0, nivel: 2, texto: "Um critério novo de verdade" }).valido).toBe(false);
    expect(psc.validarNovoCriterio({ sinalId: 1, nivel: 6, texto: "Um critério novo de verdade" }).valido).toBe(false);
    expect(psc.validarNovoCriterio({ sinalId: 1, nivel: 2, texto: "curto" }).valido).toBe(false);
    expect(psc.validarNovoCriterio({ sinalId: 1, nivel: 2, texto: "x".repeat(601) }).valido).toBe(false);
    expect(psc.validarNovoCriterio({ sinalId: 1, nivel: 2, texto: "Um critério novo de verdade", orientacao: "x".repeat(501) }).valido).toBe(false);
  });

  test("proximaLetraLivre pula as letras já usadas", () => {
    expect(psc.proximaLetraLivre([], "1.2")).toBe("a");
    expect(psc.proximaLetraLivre(["1.2.a", "1.2.b"], "1.2")).toBe("c");
    expect(psc.proximaLetraLivre(["1.2.a", "1.2.c"], "1.2")).toBe("b");
    expect(psc.proximaLetraLivre(["1.3.a"], "1.2")).toBe("a");
    expect(psc.proximaLetraLivre("abcdefghijklmnopqrstuvwxyz".split("").map(l => `1.2.${l}`), "1.2")).toBeNull();
  });

  test("validarParametros", () => {
    expect(psc.validarParametros({ primeiroExercicio: 2026, prazoEnvioDias: 90, exerciciosParaReclassificacao: 2 }).valido).toBe(true);
    expect(psc.validarParametros({ primeiroExercicio: 1999, prazoEnvioDias: 90, exerciciosParaReclassificacao: 2 }).valido).toBe(false);
    expect(psc.validarParametros({ primeiroExercicio: 2026, prazoEnvioDias: -1, exerciciosParaReclassificacao: 2 }).valido).toBe(false);
    expect(psc.validarParametros({ primeiroExercicio: 2026, prazoEnvioDias: 366, exerciciosParaReclassificacao: 2 }).valido).toBe(false);
    expect(psc.validarParametros({ primeiroExercicio: 2026, prazoEnvioDias: 90, exerciciosParaReclassificacao: 0 }).valido).toBe(false);
    expect(psc.validarParametros({ primeiroExercicio: 2026, prazoEnvioDias: 90, exerciciosParaReclassificacao: 11 }).valido).toBe(false);
    expect(psc.validarParametros({}).valido).toBe(false);
  });

  test("validarTextoObrigatorio", () => {
    expect(psc.validarTextoObrigatorio("motivo suficiente", "o motivo").valido).toBe(true);
    expect(psc.validarTextoObrigatorio("curto", "o motivo").mensagem).toMatch(/o motivo/);
    expect(psc.validarTextoObrigatorio("x".repeat(501), "o motivo").valido).toBe(false);
  });
});

describe("reclassificação compulsória (Art. 129 §2º)", () => {
  const h = (ano, reprovada, status = "HOMOLOGADA") => ({ ano, status, reprovadaNivel1: reprovada });

  test("2 exercícios seguidos homologados e reprovados no Nível 1 disparam", () => {
    const r = psc.avaliarGatilhoReclassificacao([h(2026, true), h(2027, true)], 2027, 2);
    expect(r).toEqual({ dispara: true, anoInicial: 2026, anoFinal: 2027, exercicios: 2 });
  });

  test("um exercício só não dispara; ano aprovado no meio zera a contagem", () => {
    expect(psc.avaliarGatilhoReclassificacao([h(2026, true)], 2026, 2).dispara).toBe(false);
    expect(psc.avaliarGatilhoReclassificacao([h(2026, true), h(2027, false), h(2028, true)], 2028, 2).dispara).toBe(false);
  });

  test("os exercícios têm de ser consecutivos (um ano sem avaliação quebra a sequência)", () => {
    expect(psc.avaliarGatilhoReclassificacao([h(2026, true), h(2028, true)], 2028, 2).dispara).toBe(false);
  });

  test("só conta avaliação HOMOLOGADA", () => {
    expect(psc.avaliarGatilhoReclassificacao([h(2026, true), h(2027, true, "VALIDADA")], 2026, 2).dispara).toBe(false);
    expect(psc.avaliarGatilhoReclassificacao([h(2026, true, "ENVIADA"), h(2027, true)], 2027, 2).dispara).toBe(false);
  });

  test("homologação fora de ordem: o ano anterior homologado DEPOIS ainda dispara", () => {
    // 2027 foi homologado antes; ao homologar 2026, a janela 2026-2027 fecha.
    const r = psc.avaliarGatilhoReclassificacao([h(2026, true), h(2027, true)], 2026, 2);
    expect(r.dispara).toBe(true);
    expect(r.anoFinal).toBe(2027);
  });

  test("devolve a janela MAIS RECENTE quando há mais de uma", () => {
    const r = psc.avaliarGatilhoReclassificacao([h(2025, true), h(2026, true), h(2027, true)], 2026, 2);
    expect(r.anoInicial).toBe(2026);
    expect(r.anoFinal).toBe(2027);
  });

  test("o número de exercícios é parâmetro (3 seguidos)", () => {
    const hist = [h(2026, true), h(2027, true)];
    expect(psc.avaliarGatilhoReclassificacao(hist, 2027, 3).dispara).toBe(false);
    expect(psc.avaliarGatilhoReclassificacao([...hist, h(2028, true)], 2028, 3)).toEqual({ dispara: true, anoInicial: 2026, anoFinal: 2028, exercicios: 3 });
    expect(psc.avaliarGatilhoReclassificacao([h(2026, true)], 2026, 1).dispara).toBe(true);
  });

  test("sequenciaDeReprovacoes conta as reprovações seguidas até o ano de referência", () => {
    expect(psc.sequenciaDeReprovacoes([], 2026)).toBe(0);
    expect(psc.sequenciaDeReprovacoes([h(2026, true)], 2026)).toBe(1);
    expect(psc.sequenciaDeReprovacoes([h(2026, true), h(2027, true)], 2027)).toBe(2);
    expect(psc.sequenciaDeReprovacoes([h(2026, true)], 2027)).toBe(1); // 2027 ainda não homologado: conta de 2026 para trás
    expect(psc.sequenciaDeReprovacoes([h(2025, true), h(2026, false), h(2027, true)], 2027)).toBe(1);
    expect(psc.sequenciaDeReprovacoes([h(2026, false)], 2026)).toBe(0);
  });

  test("avaliacaoDeRecuperacao: homologada, posterior ao último exercício reprovado, sem reprovação no Nível 1", () => {
    const hist = [h(2026, true), h(2027, true), h(2028, false), h(2029, false, "ENVIADA")];
    expect(psc.avaliacaoDeRecuperacao(hist, 2027).ano).toBe(2028);
    expect(psc.avaliacaoDeRecuperacao(hist, 2028)).toBeNull();
    expect(psc.avaliacaoDeRecuperacao([h(2028, true)], 2027)).toBeNull();
    expect(psc.avaliacaoDeRecuperacao([], 2027)).toBeNull();
  });

  test("validarDecreto exige resolução e encarregado; Congregação-Mãe é opcional (tutela da Sede)", () => {
    const ok = psc.validarDecreto({ resolucao: "Res. CLI 12/2028", encarregadoMembroId: "77", congregacaoId: 5 });
    expect(ok).toEqual({ valido: true, dados: { resolucao: "Res. CLI 12/2028", encarregadoMembroId: 77, congregacaoMaeId: null } });
    expect(psc.validarDecreto({ resolucao: "Res. CLI 12/2028", encarregadoMembroId: 77, congregacaoMaeId: "9", congregacaoId: 5 }).dados.congregacaoMaeId).toBe(9);
    expect(psc.validarDecreto({ resolucao: "", encarregadoMembroId: 77, congregacaoId: 5 }).valido).toBe(false);
    expect(psc.validarDecreto({ resolucao: "Res. 1", congregacaoId: 5 }).mensagem).toMatch(/encarregado/);
    expect(psc.validarDecreto({ resolucao: "Res. 1", encarregadoMembroId: 77, congregacaoMaeId: 5, congregacaoId: 5 }).mensagem).toMatch(/própria unidade/);
    expect(psc.validarDecreto({ resolucao: "Res. 1", encarregadoMembroId: 77, congregacaoMaeId: "x", congregacaoId: 5 }).valido).toBe(false);
  });
});

describe("funções de banco com pool falso", () => {
  test("consultarTutela: Extensão da Tenda está sob tutela; Congregação não", async () => {
    const tutelada = criarPoolFalso([[{ CongregacaoId: 3, Nome: "X", Ativa: true, Categoria: "EXTENSAO_TENDA", PercentualRetencaoLocal: 0 }]]);
    const r = await psc.consultarTutela(tutelada.pool, 3);
    expect(r.sobTutela).toBe(true);
    expect(r.mensagem).toMatch(/Extensão da Tenda/);

    const normal = criarPoolFalso([[{ CongregacaoId: 3, Nome: "X", Ativa: true, Categoria: "CONGREGACAO", PercentualRetencaoLocal: 40 }]]);
    expect((await psc.consultarTutela(normal.pool, 3)).sobTutela).toBe(false);

    const inexistente = criarPoolFalso([[]]);
    expect((await psc.consultarTutela(inexistente.pool, 99)).sobTutela).toBe(false);
  });

  test("lerParametros usa os padrões do Regimento quando a linha não existe", async () => {
    const { pool } = criarPoolFalso([[]]);
    expect(await psc.lerParametros(pool)).toEqual({ primeiroExercicio: 2026, prazoEnvioDias: 90, exerciciosParaReclassificacao: 2 });
  });

  test("lerParametros lê a linha única", async () => {
    const { pool } = criarPoolFalso([[{ PrimeiroExercicio: 2027, PrazoEnvioDias: 45, ExerciciosParaReclassificacao: 3 }]]);
    expect(await psc.lerParametros(pool)).toEqual({ primeiroExercicio: 2027, prazoEnvioDias: 45, exerciciosParaReclassificacao: 3 });
  });

  test("devolver a avaliação sem motivo é recusado antes de qualquer gravação", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const r = await psc.devolverAvaliacao(pool, { avaliacao: { avaliacaoId: 1, status: "ENVIADA" }, motivo: "curto", membroId: 5 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/motivo/);
    expect(chamadas).toHaveLength(0);
  });

  test("enviar uma avaliação que não está em rascunho é recusado sem tocar no banco", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const r = await psc.enviarAvaliacao(pool, { avaliacao: { avaliacaoId: 1, status: "ENVIADA" }, membroId: 5 });
    expect(r.sucesso).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  test("enviar com alínea sem resposta lista as pendências e não muda o estado", async () => {
    const respostas = [
      { RespostaId: 1, CriterioId: 1, SinalId: 1, Nivel: 1, Codigo: "1.1.a", Texto: "t", Orientacao: null, Situacao: "ATENDIDO", Observacao: null, EvidenciaUrl: null, SugestaoSituacao: null, SugestaoSistema: null, SugestaoEm: null },
      { RespostaId: 2, CriterioId: 2, SinalId: 1, Nivel: 2, Codigo: "1.2.a", Texto: "t", Orientacao: null, Situacao: "PENDENTE", Observacao: null, EvidenciaUrl: null, SugestaoSituacao: null, SugestaoSistema: null, SugestaoEm: null }
    ];
    const { pool, chamadas } = criarPoolFalso([respostas, [{ SinalId: 1, Codigo: "FINANCEIRO", Nome: "Financeiro", Ordem: 1 }]]);
    const r = await psc.enviarAvaliacao(pool, { avaliacao: { avaliacaoId: 7, status: "RASCUNHO" }, membroId: 5 });
    expect(r.sucesso).toBe(false);
    expect(r.pendencias).toEqual(["1.2.a"]);
    expect(chamadas).toHaveLength(2); // só leituras
  });

  test("homologar uma avaliação com escada não resolvida é recusado", async () => {
    const respostas = [
      { RespostaId: 2, CriterioId: 2, SinalId: 1, Nivel: 1, Codigo: "1.1.a", Texto: "t", Orientacao: null, Situacao: "PENDENTE", Observacao: null, EvidenciaUrl: null, SugestaoSituacao: null, SugestaoSistema: null, SugestaoEm: null }
    ];
    const { pool } = criarPoolFalso([respostas, [{ SinalId: 1, Codigo: "FINANCEIRO", Nome: "Financeiro", Ordem: 1 }]]);
    const r = await psc.homologarAvaliacao(pool, { avaliacao: { avaliacaoId: 7, status: "VALIDADA", enviadaPorMembroId: 1, validadaPorMembroId: 2 }, resolucao: "Res. CLI 1/2027", membroId: 3 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/escada/);
  });

  test("quem preencheu as respostas não valida nem homologa, ainda que outra pessoa tenha enviado", async () => {
    const resposta = (id, por) => ({ RespostaId: id, CriterioId: id, SinalId: 1, Nivel: 1, Codigo: `1.1.${id}`, Texto: "t", Orientacao: null, Situacao: "ATENDIDO", Observacao: null, EvidenciaUrl: null, SugestaoSituacao: null, SugestaoSistema: null, SugestaoEm: null, RespondidaPorMembroId: por });
    const validar = criarPoolFalso([[resposta(1, 41), resposta(2, 42)]]);
    const v = await psc.validarAvaliacao(validar.pool, { avaliacao: { avaliacaoId: 7, status: "ENVIADA", enviadaPorMembroId: 99 }, membroId: 41 });
    expect(v.sucesso).toBe(false);
    expect(v.mensagem).toMatch(/preencheu as respostas/);
    expect(validar.chamadas).toHaveLength(1); // só a leitura das respostas: nada foi gravado

    const homologar = criarPoolFalso([[resposta(1, 42)]]);
    const h = await psc.homologarAvaliacao(homologar.pool, {
      avaliacao: { avaliacaoId: 7, status: "VALIDADA", enviadaPorMembroId: 99, validadaPorMembroId: 98 }, resolucao: "Res. CLI 1/2027", membroId: 42
    });
    expect(h.sucesso).toBe(false);
    expect(h.mensagem).toMatch(/preencheu as respostas/);
  });

  test("atualizarCriterio só aceita booleano de verdade em `ativo` (\"false\" em texto não reativa)", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ CriterioId: 5, Codigo: "1.1.a", Texto: "Texto com mais de dez caracteres", Orientacao: null, Ativo: false }]]);
    const r = await psc.atualizarCriterio(pool, { criterioId: 5, ativo: "false", membroId: 1 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/verdadeiro ou falso/);
    expect(chamadas).toHaveLength(1); // só a leitura
  });

  test("a lista de avaliações pede o escopo e o limite ao SQL (nada de ler tudo e cortar em memória)", async () => {
    const parametros = [{ PrimeiroExercicio: 2026, PrazoEnvioDias: 90, ExerciciosParaReclassificacao: 2 }];
    const linha = (id) => ({ AvaliacaoId: id, CongregacaoId: id, CongregacaoNome: `Cong ${id}`, Categoria: "CONGREGACAO", Ano: 2026, Status: "RASCUNHO", Ciclo: 0, Versao: 0 });
    const { pool, chamadas } = criarPoolFalso([parametros, [linha(1), linha(2)]]);
    const r = await psc.listarAvaliacoes(pool, { ano: 2026, nomesCongregacoesPermitidas: ["Cong 1", "Cong 2"] });
    expect(r.itens).toHaveLength(2);
    expect(r.truncado).toBe(false);
    const consulta = chamadas[1];
    expect(consulta.sql).toMatch(/SELECT TOP \(501\)/);
    expect(consulta.sql).toMatch(/c\.Nome IN \(@escopo0, @escopo1\)/);
    expect(consulta.inputs.escopo0).toBe("Cong 1");

    const vazio = criarPoolFalso([parametros, []]);
    await psc.listarAvaliacoes(vazio.pool, { nomesCongregacoesPermitidas: [] });
    expect(vazio.chamadas[1].sql).toMatch(/AND 1 = 0/);

    const global = criarPoolFalso([parametros, []]);
    await psc.listarAvaliacoes(global.pool, { nomesCongregacoesPermitidas: null });
    expect(global.chamadas[1].sql).not.toMatch(/escopo/);
  });

  test("a lista avisa quando houve corte (truncado)", async () => {
    const parametros = [{ PrimeiroExercicio: 2026, PrazoEnvioDias: 90, ExerciciosParaReclassificacao: 2 }];
    const muitas = Array.from({ length: 501 }, (_, i) => ({ AvaliacaoId: i, CongregacaoId: i, CongregacaoNome: `C${i}`, Categoria: "CONGREGACAO", Ano: 2026, Status: "RASCUNHO", Ciclo: 0, Versao: 0 }));
    const { pool } = criarPoolFalso([parametros, muitas]);
    const r = await psc.listarAvaliacoes(pool, {});
    expect(r.itens).toHaveLength(500);
    expect(r.truncado).toBe(true);
  });

  test("decretar recusa encarregado que não é membro ativo e em comunhão", async () => {
    const congregacao = { CongregacaoId: 4, Nome: "X", Ativa: true, Categoria: "CONGREGACAO", TutelaCongregacaoMaeId: null, PercentualRetencaoLocal: 40 };
    for (const situacao of [{ Status: "DESLIGADO", SituacaoMembro: "EM_COMUNHAO" }, { Status: "ATIVO", SituacaoMembro: "SEM_COMUNHAO" }, { Status: "FALECIDO", SituacaoMembro: "EM_COMUNHAO" }]) {
      const { pool } = criarPoolFalso([[congregacao], [{ MembroId: 9, Nome: "Fulano", ...situacao }]]);
      const r = await psc.decretarReclassificacao(pool, {
        reclassificacao: { reclassificacaoId: 1, congregacaoId: 4, status: "PROPOSTA" },
        dados: { resolucao: "Res. CLI 1/2027", encarregadoMembroId: 9, congregacaoMaeId: null }, membroId: 1
      });
      expect(r.sucesso).toBe(false);
      expect(r.mensagem).toMatch(/ativo e em comunhão/);
    }
  });

  test("homologar sem a resolução da CLI é recusado", async () => {
    const { pool } = criarPoolFalso([]);
    const r = await psc.homologarAvaliacao(pool, { avaliacao: { avaliacaoId: 7, status: "VALIDADA", enviadaPorMembroId: 1, validadaPorMembroId: 2 }, resolucao: "", membroId: 3 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/resolução/);
  });

  test("homologar por quem validou é recusado (segregação)", async () => {
    const { pool } = criarPoolFalso([]);
    const r = await psc.homologarAvaliacao(pool, { avaliacao: { avaliacaoId: 7, status: "VALIDADA", enviadaPorMembroId: 1, validadaPorMembroId: 2 }, resolucao: "Res. 1/2027", membroId: 2 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/segregação/);
  });

  test("restabelecer sem avaliação de recuperação é recusado, com a regra explicada", async () => {
    const historico = [{ AvaliacaoId: 1, Ano: 2026, Status: "HOMOLOGADA", ReprovadaNivel1: true, NivelFinal: 0, Classificacao: "REPROVADA" },
      { AvaliacaoId: 2, Ano: 2027, Status: "HOMOLOGADA", ReprovadaNivel1: true, NivelFinal: 0, Classificacao: "REPROVADA" }];
    const { pool } = criarPoolFalso([historico]);
    const r = await psc.restabelecerReclassificacao(pool, {
      reclassificacao: { reclassificacaoId: 1, congregacaoId: 4, status: "DECRETADA", anoFinal: 2027, percentualRetencaoAnterior: 40 },
      resolucao: "Res. CLI 3/2029", motivo: "Recuperou os indicadores mínimos", membroId: 9
    });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/posterior a 2027/);
  });

  test("decretar uma reclassificação que não está em PROPOSTA é recusado", async () => {
    const { pool } = criarPoolFalso([]);
    const r = await psc.decretarReclassificacao(pool, { reclassificacao: { status: "ARQUIVADA" }, dados: {}, membroId: 1 });
    expect(r.sucesso).toBe(false);
  });
});

describe("apuração assistida", () => {
  test("mesesExigiveis dá um mês de folga: fechamento e repasse de um mês acontecem no seguinte", () => {
    expect(apuracao.mesesExigiveis(2026, "2026-10-01")).toHaveLength(8); // agosto já é exigível; setembro só depois de 31/10
    expect(apuracao.mesesExigiveis(2026, "2026-10-01")[0]).toBe("2026-01");
    expect(apuracao.mesesExigiveis(2026, "2026-09-30")).toHaveLength(7); // agosto só vira exigível depois de 30/09
    expect(apuracao.mesesExigiveis(2026, "2026-10-31")).toHaveLength(8);
    expect(apuracao.mesesExigiveis(2026, "2026-11-01")).toHaveLength(9);
    expect(apuracao.mesesExigiveis(2026, "2026-01-15")).toHaveLength(0);
    expect(apuracao.mesesExigiveis(2025, "2026-10-01")).toHaveLength(12);
    expect(apuracao.mesesExigiveis(2025, "2026-01-31")).toHaveLength(11); // dezembro de 2025 fecha em janeiro
    expect(apuracao.mesesExigiveis(2025, "2026-02-01")).toHaveLength(12);
  });

  test("domingosPassados conta os domingos que já passaram (hoje não conta, bissexto incluso)", () => {
    expect(apuracao.domingosPassados(2026, "2026-10-01")).toBe(39);
    expect(apuracao.domingosPassados(2026, "2026-01-03")).toBe(0);
    expect(apuracao.domingosPassados(2026, "2026-01-04")).toBe(0); // 4/jan é domingo e é "hoje": o culto pode nem ter começado
    expect(apuracao.domingosPassados(2026, "2026-01-05")).toBe(1);
    expect(apuracao.domingosPassados(2025, "2026-10-01")).toBe(52);
    expect(apuracao.domingosPassados(2024, "2026-10-01")).toBe(52);
  });

  test("limiteExclusivo: hoje, ou 1º de janeiro seguinte se o exercício já acabou", () => {
    expect(apuracao.limiteExclusivo(2026, "2026-10-01")).toBe("2026-10-01");
    expect(apuracao.limiteExclusivo(2025, "2026-10-01")).toBe("2026-01-01");
  });

  test("ultimoDiaDoMes", () => {
    expect(apuracao.ultimoDiaDoMes(2024, 2)).toBe(29);
    expect(apuracao.ultimoDiaDoMes(2026, 2)).toBe(28);
    expect(apuracao.ultimoDiaDoMes(2026, 12)).toBe(31);
  });

  const base = { unidade: "meses", oQueViu: "prestação COMPLETA", naoVe: "Nota." };
  test("interpretarCobertura: confere, não confere e sem dados", () => {
    expect(apuracao.interpretarCobertura({ ...base, esperados: 9, cumpridos: 9, temDado: true }).situacao).toBe("CONFERE");
    const nao = apuracao.interpretarCobertura({ ...base, esperados: 9, cumpridos: 7, temDado: true });
    expect(nao.situacao).toBe("NAO_CONFERE");
    expect(nao.texto).toMatch(/7 de 9/);
    expect(apuracao.interpretarCobertura({ ...base, esperados: 9, cumpridos: 0, temDado: false }).situacao).toBe("SEM_DADOS");
    expect(apuracao.interpretarCobertura({ ...base, esperados: 0, cumpridos: 0, temDado: false }).situacao).toBe("SEM_DADOS");
    expect(apuracao.interpretarCobertura({ ...base, esperados: 9, cumpridos: 9, temDado: true }).texto).toMatch(/Nota\./);
  });

  test("interpretarBatismos: mínimo de 10% do rol (Art. 128 §5º, III, a)", () => {
    expect(apuracao.interpretarBatismos({ batismos: 10, rol: 100 }).situacao).toBe("CONFERE");
    expect(apuracao.interpretarBatismos({ batismos: 9, rol: 100 }).situacao).toBe("NAO_CONFERE");
    expect(apuracao.interpretarBatismos({ batismos: 0, rol: 40 }).situacao).toBe("NAO_CONFERE");
    // 9,95% arredonda para 10,0 no texto, mas NÃO atinge o mínimo: a decisão usa a razão exata
    expect(apuracao.interpretarBatismos({ batismos: 199, rol: 2000 }).situacao).toBe("NAO_CONFERE");
    expect(apuracao.interpretarBatismos({ batismos: 100, rol: 1005 }).situacao).toBe("NAO_CONFERE");
    expect(apuracao.interpretarBatismos({ batismos: 200, rol: 2000 }).situacao).toBe("CONFERE");
    expect(apuracao.interpretarBatismos({ batismos: 3, rol: 0 }).situacao).toBe("SEM_DADOS");
    expect(apuracao.interpretarBatismos({ batismos: 12, rol: 120 }).texto).toMatch(/\(10%;/);
    expect(apuracao.interpretarBatismos({ batismos: 5, rol: 40 }).texto).toMatch(/12,5%/);
  });

  test("toda fonte do catálogo semeado tem apurador (as chaves da migração 113)", () => {
    expect(apuracao.FONTES.sort()).toEqual(["BATISMOS", "EBD_DIARIO", "EBD_LICOES", "PRESTACAO_CONTAS", "REPASSES"]);
  });
});
