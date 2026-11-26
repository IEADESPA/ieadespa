// FASE 10, Membros, missão B (a saída com a carta, rodadas 29 e 31): as regras puras da saída do rol e da carta nova (shared/saidaMembro.js).
// Nomes e números de mentira.
const crypto = require("crypto");
const s = require("../saidaMembro");

describe("o destino da carta: só a cidade e o estado (r31-pedido)", () => {
  test("em branco, fica Parauapebas - PA", () => {
    expect(s.destinoDaCarta("")).toEqual({ ok: true, destino: "Parauapebas - PA" });
    expect(s.destinoDaCarta("   ")).toEqual({ ok: true, destino: "Parauapebas - PA" });
    expect(s.destinoDaCarta(null)).toEqual({ ok: true, destino: "Parauapebas - PA" });
    expect(s.destinoDaCarta(undefined)).toEqual({ ok: true, destino: "Parauapebas - PA" });
  });
  test("a cidade com o estado sai no formato da lista, com a UF em maiúsculas", () => {
    expect(s.destinoDaCarta("Marabá - PA").destino).toBe("Marabá - PA");
    expect(s.destinoDaCarta("  Marabá-pa ").destino).toBe("Marabá - PA");
    expect(s.destinoDaCarta("Canaã dos Carajás / PA").destino).toBe("Canaã dos Carajás - PA");
    expect(s.destinoDaCarta("São João d'Aliança - GO").destino).toBe("São João d'Aliança - GO");
    expect(s.destinoDaCarta("Pau-d'Arco - PA").destino).toBe("Pau-d'Arco - PA");
    expect(s.destinoDaCarta("Imperatriz   -   MA").destino).toBe("Imperatriz - MA");
  });
  test("sem o estado, com estado que não existe ou com o que não é cidade, recusa com a frase", () => {
    for (const ruim of ["Marabá", "Marabá - XX", "Marabá - P", "- PA", "Igreja <b> - PA", "Rua 7, nº 12 - PA", "a".repeat(70) + " - PA"]) {
      const r = s.destinoDaCarta(ruim);
      expect(r.ok).toBe(false);
      expect(r.mensagem).toMatch(/cidade e o estado/);
    }
  });
  test("não é texto: recusa", () => {
    expect(s.destinoDaCarta(12).ok).toBe(false);
    expect(s.destinoDaCarta({}).ok).toBe(false);
  });
});

describe("a situação na carta (r31-carta: Comunhão, Paz, Observação com o tempo, sem o motivo)", () => {
  test("membro em comunhão: (X) Membro, em Comunhão", () => {
    expect(s.situacaoDaCarta({ situacaoMembro: "EM_COMUNHAO" })).toEqual({ codigo: "COMUNHAO", membro: true, texto: "em Comunhão" });
  });
  test("congregado: (X) Congregado, em Paz, nunca Observação, mesmo com disciplina", () => {
    expect(s.situacaoDaCarta({ situacaoMembro: "CONGREGADO" })).toEqual({ codigo: "PAZ", membro: false, texto: "em Paz" });
    const comDisciplina = s.situacaoDaCarta({ situacaoMembro: "CONGREGADO", disciplina: { julgado: true, inicio: "2026-09-02", ate: "2027-03-02" } });
    expect(comDisciplina.codigo).toBe("PAZ");
  });
  test("em disciplina com prazo: Observação, por quanto tempo e até quando, sem o motivo", () => {
    const r = s.situacaoDaCarta({ situacaoMembro: "SEM_COMUNHAO", disciplina: { julgado: true, inicio: "2026-09-02", ate: "2027-03-02" } });
    expect(r).toEqual({ codigo: "OBSERVACAO", membro: true, texto: "em Observação (em disciplina por 6 meses, até 02/03/2027)" });
  });
  test("a disciplina com prazo vale também para quem a ficha ainda diz em comunhão", () => {
    const r = s.situacaoDaCarta({ situacaoMembro: "EM_COMUNHAO", disciplina: { julgado: true, inicio: "2026-11-10", ate: "2026-12-10" } });
    expect(r.texto).toBe("em Observação (em disciplina por 1 mês, até 10/12/2026)");
  });
  test("o prazo que não é de meses inteiros sai em dias", () => {
    const r = s.situacaoDaCarta({ situacaoMembro: "SEM_COMUNHAO", disciplina: { julgado: true, inicio: "2026-11-01", ate: "2026-12-15" } });
    expect(r.texto).toBe("em Observação (em disciplina por 44 dias, até 15/12/2026)");
  });
  test("o fim do mês conta como mês inteiro (31/01 a 28/02)", () => {
    const r = s.situacaoDaCarta({ situacaoMembro: "SEM_COMUNHAO", disciplina: { julgado: true, inicio: "2027-01-31", ate: "2027-02-28" } });
    expect(r.texto).toBe("em Observação (em disciplina por 1 mês, até 28/02/2027)");
  });
  test("arrolamento (D1): sem caixa marcada, sem situação, com a frase da ficha em atualização", () => {
    expect(s.situacaoDaCarta({ situacaoMembro: "ARROLAMENTO" })).toEqual({ codigo: "ARROLAMENTO", membro: null, texto: null, frase: s.FRASE_ARROLAMENTO });
    expect(s.FRASE_ARROLAMENTO).toBe("O cadastro desta pessoa estava em atualização no sistema da igreja.");
  });
  test("os casos que esperam a resposta dele ficam pendentes, sem texto inventado", () => {
    const pend = (e) => s.situacaoDaCarta(e).pendente;
    expect(pend({ situacaoMembro: "EM_COMUNHAO", disciplina: { julgado: true, inicio: "2026-01-10", ate: null } })).toBe("DISCIPLINA_SEM_PRAZO");
    expect(pend({ situacaoMembro: "EM_COMUNHAO", disciplina: { julgado: false, inicio: "2026-11-20", ate: null } })).toBe("DISCIPLINA_NAO_JULGADA");
    expect(pend({ situacaoMembro: "SEM_COMUNHAO", semComunhaoDesde: "2026-04-02" })).toBe("SEM_COMUNHAO");
    expect(pend({ situacaoMembro: "NOVO_CONVERTIDO" })).toBe("SITUACAO_DESCONHECIDA");
    expect(pend({ situacaoMembro: null })).toBe("SITUACAO_DESCONHECIDA");
    expect(s.situacaoDaCarta({ situacaoMembro: "NOVO_CONVERTIDO" }).texto).toBeUndefined();
  });
});

describe("o tratamento na carta (r31-carta: o irmão, a irmã, o menor)", () => {
  test("membro: o irmão / a irmã; menor de 18: o menor / a menor", () => {
    expect(s.tratamentoDaCarta({ sexo: "M", menor: false, codigo: "COMUNHAO" })).toBe("o irmão");
    expect(s.tratamentoDaCarta({ sexo: "F", menor: false, codigo: "OBSERVACAO" })).toBe("a irmã");
    expect(s.tratamentoDaCarta({ sexo: "M", menor: true, codigo: "PAZ" })).toBe("o menor");
    expect(s.tratamentoDaCarta({ sexo: "F", menor: true, codigo: "COMUNHAO" })).toBe("a menor");
  });
  test("sem o sexo na ficha, não inventa: as duas formas", () => {
    expect(s.tratamentoDaCarta({ sexo: null, menor: false, codigo: "COMUNHAO" })).toBe("o(a) irmão(ã)");
    expect(s.tratamentoDaCarta({ sexo: null, menor: true, codigo: "PAZ" })).toBe("o(a) menor");
  });
  test("o adulto congregado e o adulto em arrolamento esperam a resposta dele", () => {
    expect(s.tratamentoDaCarta({ sexo: "M", menor: false, codigo: "PAZ" })).toBeNull();
    expect(s.tratamentoDaCarta({ sexo: "F", menor: false, codigo: "ARROLAMENTO" })).toBeNull();
  });
});

describe("a carta curta (ajuste dele à r31 e o D9): a última função e o último cargo", () => {
  const c = (nome, grau, inicio, fim = null) => ({ nome, grau, inicio, fim, ativo: fim === null });
  const nomes = (l) => l.map((x) => x.nome);

  test("sem cargo nenhum: nada", () => {
    expect(s.cargosDaCartaCurta([])).toEqual([]);
    expect(s.cargosDaCartaCurta(null)).toEqual([]);
  });
  test("sem cargo ativo: o último que teve (o que terminou por último)", () => {
    const r = s.cargosDaCartaCurta([c("Secretário da Mocidade", 1, "2012-03-01", "2015-12-31"), c("Recepção", 1, "2018-03-01", "2026-09-30"), c("Tesoureiro de área", 2, "2010-01-01", "2014-12-31")]);
    expect(nomes(r)).toEqual(["Recepção"]);
  });
  test("um cargo ativo: ele, mesmo que um antigo seja de grau maior", () => {
    const r = s.cargosDaCartaCurta([c("Tesoureiro geral", 6, "2015-01-01", "2019-12-31"), c("Professor dos Jovens", 1, "2016-02-01")]);
    expect(nomes(r)).toEqual(["Professor dos Jovens"]);
  });
  test("dois ativos: só um, o de maior grau", () => {
    const r = s.cargosDaCartaCurta([c("Tesoureiro de Vila Nova", 1, "2021-01-01"), c("Secretário da Área 2", 2, "2019-05-01")]);
    expect(nomes(r)).toEqual(["Secretário da Área 2"]);
  });
  test("dois ativos do mesmo grau: o mais recente", () => {
    const r = s.cargosDaCartaCurta([c("Professor dos Jovens", 1, "2016-02-01"), c("Tesoureiro de Vila Nova", 1, "2021-01-01")]);
    expect(nomes(r)).toEqual(["Tesoureiro de Vila Nova"]);
  });
  test("mais de 2 ativos, de graus diferentes (o irmão Pedro do D9): só os do maior grau", () => {
    const r = s.cargosDaCartaCurta([c("2º tesoureiro geral", 6, "2023-01-01"), c("Dirigente da EBD da área", 2, "2020-01-01"), c("Secretário local", 1, "2018-01-01")]);
    expect(nomes(r)).toEqual(["2º tesoureiro geral"]);
  });
  test("mais de 2 ativos com vários gerais: todos os gerais, do mais recente ao mais antigo", () => {
    const r = s.cargosDaCartaCurta([c("Vice-presidente", 6, "2020-01-01"), c("Conselho fiscal", 6, "2024-01-01"), c("Dirigente de Vila Nova", 1, "2019-01-01"), c("Diretor de missões", 6, "2022-06-01")]);
    expect(nomes(r)).toEqual(["Conselho fiscal", "Diretor de missões", "Vice-presidente"]);
  });
  test("mais de 2 ativos, todos locais: os 3", () => {
    const r = s.cargosDaCartaCurta([c("Tesoureiro", 1, "2021-01-01"), c("Professor", 1, "2016-02-01"), c("Porteiro", 1, "2019-01-01")]);
    expect(nomes(r)).toEqual(["Tesoureiro", "Porteiro", "Professor"]);
  });
  test("o empate de data se desfaz pelo nome: a carta sai sempre igual", () => {
    const a = s.cargosDaCartaCurta([c("Tesoureiro", 1, "2021-01-01"), c("Secretário", 1, "2021-01-01")]);
    const b = s.cargosDaCartaCurta([c("Secretário", 1, "2021-01-01"), c("Tesoureiro", 1, "2021-01-01")]);
    expect(nomes(a)).toEqual(nomes(b));
  });
  test("a lista de entrada não muda", () => {
    const l = [c("B", 1, "2021-01-01"), c("A", 2, "2020-01-01")];
    const copia = JSON.parse(JSON.stringify(l));
    s.cargosDaCartaCurta(l);
    expect(l).toEqual(copia);
  });

  test("a função: a última consagração, com a data", () => {
    expect(s.funcaoDaCartaCurta([{ nome: "Auxiliar", data: "2014-04-16" }, { nome: "Diácono", data: "2017-12-10" }])).toEqual({ nome: "Diácono", data: "2017-12-10" });
    expect(s.funcaoDaCartaCurta([{ nome: "Diácono", data: "2017-12-10" }, { nome: "Auxiliar", data: "2014-04-16" }]).nome).toBe("Diácono");
  });
  test("sem consagração: nada", () => {
    expect(s.funcaoDaCartaCurta([])).toBeNull();
    expect(s.funcaoDaCartaCurta(undefined)).toBeNull();
  });
});

describe("o código curto do rodapé (r31-qr: 3 letras ou números, um traço e mais 3)", () => {
  test("gera 6 símbolos do alfabeto sem I, O, 0 e 1", () => {
    for (let i = 0; i < 200; i++) {
      const cod = s.gerarCodigoCurto();
      expect(cod).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });
  test("formata K7P-4M2 e aceita como a pessoa digita", () => {
    expect(s.formatarCodigoCurto("K7P4M2")).toBe("K7P-4M2");
    expect(s.normalizarCodigoCurto(" k7p-4m2 ")).toBe("K7P4M2");
    expect(s.codigoCurtoValido("k7p 4m2")).toBe(true);
  });
  test("tamanho errado ou símbolo fora do alfabeto: inválido", () => {
    for (const ruim of ["K7P-4M", "K7P-4M22", "K7P-4MO", "K7P-4M1", "", null, 123456]) expect(s.codigoCurtoValido(ruim)).toBe(false);
  });
});

describe("a impressão digital e o selo do QR", () => {
  const sal = "07".repeat(16);
  const conteudo = { nome: "Carlos Moreira", matricula: 2317, historico: [["Chegada", "2009-03-12"]], destino: "Marabá - PA" };

  test("a mesma carta dá a mesma impressão, qualquer que seja a ordem das chaves", () => {
    const outraOrdem = { destino: "Marabá - PA", historico: [["Chegada", "2009-03-12"]], matricula: 2317, nome: "Carlos Moreira" };
    expect(s.impressaoDigital(conteudo, sal)).toBe(s.impressaoDigital(outraOrdem, sal));
    expect(s.impressaoDigital(conteudo, sal)).toMatch(/^[0-9a-f]{64}$/);
  });
  test("qualquer dado diferente muda a impressão", () => {
    expect(s.impressaoDigital({ ...conteudo, destino: "Belém - PA" }, sal)).not.toBe(s.impressaoDigital(conteudo, sal));
  });
  test("o sal muda a impressão: ela não é o hash dos dados (que se apagam) sozinhos", () => {
    expect(s.impressaoDigital(conteudo, "08".repeat(16))).not.toBe(s.impressaoDigital(conteudo, sal));
    const semSal = crypto.createHash("sha256").update(JSON.stringify(conteudo), "utf8").digest("hex");
    expect(s.impressaoDigital(conteudo, sal)).not.toBe(semSal);
  });
  test("sem sal de 16 bytes em hex minúsculo: erro (nunca grava impressão fraca)", () => {
    expect(() => s.impressaoDigital(conteudo, "07".repeat(4))).toThrow();
    expect(() => s.impressaoDigital(conteudo, "0A".repeat(16))).toThrow();
    expect(() => s.impressaoDigital(conteudo, Buffer.alloc(16, 7))).toThrow();
    expect(() => s.impressaoDigital(conteudo, null)).toThrow();
  });
  test("o sal novo tem 16 bytes (32 hex) e muda a cada carta", () => {
    const a = s.gerarSal(), b = s.gerarSal();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
  test("o selo do QR é o começo da impressão (32) e confere só com a impressão certa", () => {
    const imp = s.impressaoDigital(conteudo, sal);
    const selo = s.seloDoQr(imp);
    expect(selo).toBe(imp.slice(0, 32));
    expect(s.conferirSelo(imp, selo)).toBe(true);
    expect(s.conferirSelo(imp, selo.toUpperCase())).toBe(true);
    const outro = (selo[0] === "a" ? "b" : "a") + selo.slice(1);
    expect(s.conferirSelo(imp, outro)).toBe(false);
    expect(s.conferirSelo(imp, selo.slice(0, 31))).toBe(false);
    expect(s.conferirSelo(imp, "")).toBe(false);
    expect(s.conferirSelo(imp, null)).toBe(false);
    expect(s.conferirSelo(null, selo)).toBe(false);
  });
});

describe("os prazos: a carta vale 30 dias; o apagamento aos 30 dias e com 1 ano", () => {
  test("saída em 25/11/2026: os dados aparecem até 25/12/2026 (inclusive) e a carta vence em 26/12", () => {
    expect(s.ultimoDiaDaCarta("2026-11-25")).toBe("2026-12-25");
    expect(s.cartaVencida("2026-11-25", "2026-12-25")).toBe(false);
    expect(s.cartaVencida("2026-11-25", "2026-12-26")).toBe(true);
    expect(s.cartaVencida("2026-11-25", "2026-11-25")).toBe(false);
  });
  test("a etapa devida do apagamento: 0 até o 30º dia, 1 do 31º dia, 2 depois de 1 ano", () => {
    expect(s.etapaDevida("2026-11-25", "2026-11-25")).toBe(0);
    expect(s.etapaDevida("2026-11-25", "2026-12-25")).toBe(0);
    expect(s.etapaDevida("2026-11-25", "2026-12-26")).toBe(1);
    expect(s.etapaDevida("2026-11-25", "2027-11-25")).toBe(1);
    expect(s.etapaDevida("2026-11-25", "2027-11-26")).toBe(2);
  });
  test("a virada do ano e o 29 de fevereiro", () => {
    expect(s.ultimoDiaDaCarta("2026-12-20")).toBe("2027-01-19");
    expect(s.etapaDevida("2028-02-29", "2029-02-28")).toBe(1);
    expect(s.etapaDevida("2028-02-29", "2029-03-01")).toBe(1);
    expect(s.etapaDevida("2028-02-29", "2029-03-02")).toBe(2);
  });
  test("data inválida: erro (o apagamento nunca roda com data errada)", () => {
    expect(() => s.etapaDevida("25/11/2026", "2026-12-26")).toThrow();
    expect(() => s.cartaVencida("2026-11-25", "")).toThrow();
  });
});
