// Testes do v6.3 (EBD — Lições e atividades) — foco na lógica pura: as 5
// regras de auto-correção (múltipla escolha, V/F, ordenar, completar,
// correspondência), a validação de autoria de questão e a agregação de
// nota de uma atividade com tipos mistos.
const atividades = require("../ebdAtividades");
const { TIPOS_QUESTAO, corrigirQuestao } = atividades;

describe("normalizarTexto (base da correção de COMPLETAR)", () => {
  test("remove acento, colapsa espaço e ignora maiúsculas", () => {
    expect(atividades.normalizarTexto("  Graça   Divina ")).toBe("graca divina");
    expect(atividades.normalizarTexto("JESUS")).toBe("jesus");
  });

  test("trata null/undefined como string vazia, sem lançar erro", () => {
    expect(atividades.normalizarTexto(null)).toBe("");
    expect(atividades.normalizarTexto(undefined)).toBe("");
  });
});

describe("corrigirMultiplaEscolha", () => {
  test("acerta quando o índice escolhido é o do gabarito", () => {
    expect(atividades.corrigirMultiplaEscolha(2, 2)).toBe(true);
  });

  test("erra índice diferente", () => {
    expect(atividades.corrigirMultiplaEscolha(2, 1)).toBe(false);
  });

  test("compara número mesmo se vier como string (query/body)", () => {
    expect(atividades.corrigirMultiplaEscolha(2, "2")).toBe(true);
  });

  test("resposta ausente é sempre errada, nunca lança erro", () => {
    expect(atividades.corrigirMultiplaEscolha(0, undefined)).toBe(false);
    expect(atividades.corrigirMultiplaEscolha(0, null)).toBe(false);
  });
});

describe("corrigirVF", () => {
  test("acerta true/true e false/false", () => {
    expect(atividades.corrigirVF(true, true)).toBe(true);
    expect(atividades.corrigirVF(false, false)).toBe(true);
  });

  test("erra quando são opostos", () => {
    expect(atividades.corrigirVF(true, false)).toBe(false);
    expect(atividades.corrigirVF(false, true)).toBe(false);
  });

  test("resposta não booleana (não respondido) é sempre errada", () => {
    expect(atividades.corrigirVF(true, undefined)).toBe(false);
    expect(atividades.corrigirVF(true, null)).toBe(false);
    expect(atividades.corrigirVF(true, "true")).toBe(false);
  });
});

describe("corrigirOrdenar", () => {
  const gabarito = ["Fé", "Arrependimento", "Batismo"];

  test("acerta quando a ordem é idêntica ao gabarito", () => {
    expect(atividades.corrigirOrdenar(gabarito, ["Fé", "Arrependimento", "Batismo"])).toBe(true);
  });

  test("erra quando dois itens estão trocados de posição", () => {
    expect(atividades.corrigirOrdenar(gabarito, ["Arrependimento", "Fé", "Batismo"])).toBe(false);
  });

  test("erra quando falta ou sobra item (tamanho diferente)", () => {
    expect(atividades.corrigirOrdenar(gabarito, ["Fé", "Arrependimento"])).toBe(false);
    expect(atividades.corrigirOrdenar(gabarito, ["Fé", "Arrependimento", "Batismo", "Extra"])).toBe(false);
  });

  test("ignora espaço nas pontas de cada item, mas ordem continua estrita", () => {
    expect(atividades.corrigirOrdenar(gabarito, [" Fé ", "Arrependimento ", " Batismo"])).toBe(true);
  });

  test("gabarito ou resposta que não são array nunca quebram, só reprovam", () => {
    expect(atividades.corrigirOrdenar(gabarito, null)).toBe(false);
    expect(atividades.corrigirOrdenar(null, ["a"])).toBe(false);
  });
});

describe("corrigirCompletar (texto livre — normalizado contra lista de variantes aceitas)", () => {
  const gabarito = ["graça", "graca"];

  test("acerta a variante exata cadastrada", () => {
    expect(atividades.corrigirCompletar(gabarito, "graça")).toBe(true);
  });

  test("acerta variante sem acento também cadastrada", () => {
    expect(atividades.corrigirCompletar(gabarito, "graca")).toBe(true);
  });

  test("acerta ignorando maiúscula/minúscula e espaço nas pontas", () => {
    expect(atividades.corrigirCompletar(gabarito, "  GRAÇA  ")).toBe(true);
  });

  test("erra uma palavra totalmente diferente", () => {
    expect(atividades.corrigirCompletar(gabarito, "misericórdia")).toBe(false);
  });

  test("resposta vazia ou não respondida é sempre errada", () => {
    expect(atividades.corrigirCompletar(gabarito, "")).toBe(false);
    expect(atividades.corrigirCompletar(gabarito, "   ")).toBe(false);
    expect(atividades.corrigirCompletar(gabarito, undefined)).toBe(false);
  });

  test("gabarito vazio ou malformado nunca aprova nada", () => {
    expect(atividades.corrigirCompletar([], "graça")).toBe(false);
    expect(atividades.corrigirCompletar(null, "graça")).toBe(false);
  });
});

describe("corrigirCorrespondencia (tudo-ou-nada, por id)", () => {
  const gabarito = [
    { id: 1, esquerda: "Moisés", direita: "Êxodo" },
    { id: 2, esquerda: "Davi", direita: "Salmos" },
    { id: 3, esquerda: "Paulo", direita: "Romanos" }
  ];

  test("acerta quando cada par casa esquerdaId com o mesmo direitaId", () => {
    const resposta = [{ esquerdaId: 1, direitaId: 1 }, { esquerdaId: 2, direitaId: 2 }, { esquerdaId: 3, direitaId: 3 }];
    expect(atividades.corrigirCorrespondencia(gabarito, resposta)).toBe(true);
  });

  test("aceita a resposta fora de ordem, desde que o pareamento esteja certo", () => {
    const resposta = [{ esquerdaId: 3, direitaId: 3 }, { esquerdaId: 1, direitaId: 1 }, { esquerdaId: 2, direitaId: 2 }];
    expect(atividades.corrigirCorrespondencia(gabarito, resposta)).toBe(true);
  });

  test("erra quando um único par está cruzado (troca de dois)", () => {
    const resposta = [{ esquerdaId: 1, direitaId: 2 }, { esquerdaId: 2, direitaId: 1 }, { esquerdaId: 3, direitaId: 3 }];
    expect(atividades.corrigirCorrespondencia(gabarito, resposta)).toBe(false);
  });

  test("erra quando falta um par (resposta menor que o gabarito)", () => {
    const resposta = [{ esquerdaId: 1, direitaId: 1 }, { esquerdaId: 2, direitaId: 2 }];
    expect(atividades.corrigirCorrespondencia(gabarito, resposta)).toBe(false);
  });

  test("erra quando um id é duplicado na resposta (tenta usar o mesmo par duas vezes)", () => {
    const resposta = [{ esquerdaId: 1, direitaId: 1 }, { esquerdaId: 1, direitaId: 1 }, { esquerdaId: 3, direitaId: 3 }];
    expect(atividades.corrigirCorrespondencia(gabarito, resposta)).toBe(false);
  });

  test("erra quando a resposta referencia um id que não existe no gabarito", () => {
    const resposta = [{ esquerdaId: 1, direitaId: 1 }, { esquerdaId: 2, direitaId: 2 }, { esquerdaId: 99, direitaId: 99 }];
    expect(atividades.corrigirCorrespondencia(gabarito, resposta)).toBe(false);
  });

  test("gabarito com id duplicado (autoria malformada) nunca aprova", () => {
    const gabaritoRuim = [{ id: 1, esquerda: "a", direita: "b" }, { id: 1, esquerda: "c", direita: "d" }];
    expect(atividades.corrigirCorrespondencia(gabaritoRuim, [{ esquerdaId: 1, direitaId: 1 }])).toBe(false);
  });
});

describe("corrigirQuestao (dispatcher pelos 5 tipos)", () => {
  test("roteia corretamente cada um dos 5 tipos", () => {
    expect(corrigirQuestao(TIPOS_QUESTAO.MULTIPLA_ESCOLHA, 1, 1)).toBe(true);
    expect(corrigirQuestao(TIPOS_QUESTAO.VF, true, true)).toBe(true);
    expect(corrigirQuestao(TIPOS_QUESTAO.ORDENAR, ["a", "b"], ["a", "b"])).toBe(true);
    expect(corrigirQuestao(TIPOS_QUESTAO.COMPLETAR, ["a"], "a")).toBe(true);
    expect(corrigirQuestao(TIPOS_QUESTAO.CORRESPONDENCIA, [{ id: 1, esquerda: "x", direita: "y" }], [{ esquerdaId: 1, direitaId: 1 }])).toBe(true);
  });

  test("tipo desconhecido devolve null (nunca quebra)", () => {
    expect(corrigirQuestao("QUALQUER", {}, {})).toBeNull();
  });
});

describe("validarQuestao (autoria — defesa em profundidade além do CHECK do schema)", () => {
  test("recusa tipo inválido", () => {
    expect(atividades.validarQuestao({ tipo: "QUALQUER", enunciado: "x" }).valido).toBe(false);
  });

  test("recusa enunciado vazio", () => {
    expect(atividades.validarQuestao({ tipo: TIPOS_QUESTAO.VF, enunciado: "  ", gabarito: true }).valido).toBe(false);
  });

  test("múltipla escolha exige 2+ opções e índice de gabarito dentro do intervalo", () => {
    expect(atividades.validarQuestao({ tipo: TIPOS_QUESTAO.MULTIPLA_ESCOLHA, enunciado: "x", opcoes: ["A"], gabarito: 0 }).valido).toBe(false);
    expect(atividades.validarQuestao({ tipo: TIPOS_QUESTAO.MULTIPLA_ESCOLHA, enunciado: "x", opcoes: ["A", "B"], gabarito: 5 }).valido).toBe(false);
    expect(atividades.validarQuestao({ tipo: TIPOS_QUESTAO.MULTIPLA_ESCOLHA, enunciado: "x", opcoes: ["A", "B"], gabarito: 1 }).valido).toBe(true);
  });

  test("V/F exige gabarito estritamente booleano", () => {
    expect(atividades.validarQuestao({ tipo: TIPOS_QUESTAO.VF, enunciado: "x", gabarito: "true" }).valido).toBe(false);
    expect(atividades.validarQuestao({ tipo: TIPOS_QUESTAO.VF, enunciado: "x", gabarito: false }).valido).toBe(true);
  });

  test("ordenar exige gabarito com o mesmo conjunto de itens de opções", () => {
    expect(atividades.validarQuestao({ tipo: TIPOS_QUESTAO.ORDENAR, enunciado: "x", opcoes: ["a", "b"], gabarito: ["a", "c"] }).valido).toBe(false);
    expect(atividades.validarQuestao({ tipo: TIPOS_QUESTAO.ORDENAR, enunciado: "x", opcoes: ["a", "b"], gabarito: ["b", "a"] }).valido).toBe(true);
  });

  test("completar exige ao menos uma variante não vazia", () => {
    expect(atividades.validarQuestao({ tipo: TIPOS_QUESTAO.COMPLETAR, enunciado: "x", gabarito: [] }).valido).toBe(false);
    expect(atividades.validarQuestao({ tipo: TIPOS_QUESTAO.COMPLETAR, enunciado: "x", gabarito: [""] }).valido).toBe(false);
    expect(atividades.validarQuestao({ tipo: TIPOS_QUESTAO.COMPLETAR, enunciado: "x", gabarito: ["graça"] }).valido).toBe(true);
  });

  test("correspondência exige pares completos com ids únicos", () => {
    expect(atividades.validarQuestao({ tipo: TIPOS_QUESTAO.CORRESPONDENCIA, enunciado: "x", opcoes: [{ id: 1, esquerda: "a", direita: "b" }] }).valido).toBe(false);
    expect(atividades.validarQuestao({
      tipo: TIPOS_QUESTAO.CORRESPONDENCIA, enunciado: "x",
      opcoes: [{ id: 1, esquerda: "a", direita: "b" }, { id: 1, esquerda: "c", direita: "d" }]
    }).valido).toBe(false);
    expect(atividades.validarQuestao({
      tipo: TIPOS_QUESTAO.CORRESPONDENCIA, enunciado: "x",
      opcoes: [{ id: 1, esquerda: "a", direita: "b" }, { id: 2, esquerda: "c", direita: "d" }]
    }).valido).toBe(true);
  });
});

describe("calcularNotaAtividade (agregação de uma atividade com tipos mistos)", () => {
  test("atividade sem questões devolve zero, sem dividir por zero", () => {
    expect(atividades.calcularNotaAtividade([])).toEqual({ totalQuestoes: 0, respondidas: 0, corretas: 0, pendentes: 0, percentual: 0 });
  });

  test("mistura de acertos/erros/pendentes/não respondidas nos 5 tipos", () => {
    const resultados = [
      { respondida: true, correta: true },   // múltipla escolha certa
      { respondida: true, correta: false },  // V/F errada
      { respondida: true, correta: true },   // ordenar certa
      { respondida: true, correta: null },   // completar pendente de revisão manual
      { respondida: false, correta: null }   // correspondência não respondida
    ];
    const r = atividades.calcularNotaAtividade(resultados);
    expect(r.totalQuestoes).toBe(5);
    expect(r.respondidas).toBe(4);
    expect(r.corretas).toBe(2);
    expect(r.pendentes).toBe(1);
    expect(r.percentual).toBeCloseTo(40, 1);
  });

  test("100% quando todas as questões respondidas estão corretas", () => {
    const resultados = [{ respondida: true, correta: true }, { respondida: true, correta: true }];
    expect(atividades.calcularNotaAtividade(resultados).percentual).toBe(100);
  });
});
