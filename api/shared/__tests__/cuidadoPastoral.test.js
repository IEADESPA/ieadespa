// A regra pura do cuidado pastoral (v7.11): prazos, a escada do prazo vencido, as validações, o sinal de risco, a linha sem nome do boletim, a detecção pelo padrão da própria
// pessoa, quem lê cada nível de nota, quem pode ser responsável e o que os avisos dizem (e não dizem). O banco é coberto pelos roteiros ponta a ponta (tools/e2e-localdb, e2e-23 a 26).
const cp = require("../cuidadoPastoral");

const AGORA = new Date("2026-10-21T15:00:00Z");      // 12h de Brasília
const HOJE = "2026-10-21";

describe("prazos", () => {
  test("os padrões do contrato: visitante 48 horas (Regimento Art. 128 §5º), afastado 14 dias, risco 24 horas", () => {
    const p = cp.prazosDoCuidado({});
    expect(cp.prazoInicial("VISITANTE", AGORA, p).toISOString()).toBe("2026-10-23T15:00:00.000Z");
    expect(cp.prazoInicial("AFASTAMENTO", AGORA, p).toISOString()).toBe("2026-11-04T15:00:00.000Z");
    expect(cp.prazoInicial("POS_INTERNACAO", AGORA, p).toISOString()).toBe("2026-10-24T15:00:00.000Z");
    expect(cp.prazoInicial("AFASTAMENTO", AGORA, p, { urgente: true }).toISOString()).toBe("2026-10-22T15:00:00.000Z");
    expect(cp.prazoInicial("NAO_EXISTE", AGORA, p)).toBeNull();
  });
  test("o valor de Catálogos vale, mas nenhum número absurdo passa (o padrão volta)", () => {
    const p = cp.prazosDoCuidado({ CUIDADO_PRAZO_VISITANTE_HORAS: 24, CUIDADO_PRAZO_AFASTAMENTO_DIAS: 9999, CUIDADO_DETECCAO_QUEDA_PCT: 5, CUIDADO_DETECCAO_SEMANAS: "8", CUIDADO_PRAZO_DEGRAU_DIAS: 1.5 });
    expect(p.CUIDADO_PRAZO_VISITANTE_HORAS).toBe(24);
    expect(p.CUIDADO_PRAZO_AFASTAMENTO_DIAS).toBe(14);
    expect(p.CUIDADO_DETECCAO_QUEDA_PCT).toBe(60);
    expect(p.CUIDADO_DETECCAO_SEMANAS).toBe(8);
    expect(p.CUIDADO_PRAZO_DEGRAU_DIAS).toBe(3);
    expect(cp.SIGLAS_PRAZO.every((s) => s.length <= 40)).toBe(true);
  });
  test("a situação do prazo é calculada na leitura (vence mesmo sem rotina)", () => {
    expect(cp.situacaoDoPrazo(new Date(AGORA.getTime() + 3 * 86400000), AGORA)).toEqual({ vencido: false, faixa: "NORMAL", texto: "vence em 3 dias" });
    expect(cp.situacaoDoPrazo(new Date(AGORA.getTime() + 5 * 3600000), AGORA)).toEqual({ vencido: false, faixa: "ATENCAO", texto: "vence em 5 h" });
    expect(cp.situacaoDoPrazo(new Date(AGORA.getTime() - 30 * 60000), AGORA)).toEqual({ vencido: true, faixa: "VENCIDO", texto: "vencido há 30 min" });
    expect(cp.situacaoDoPrazo(AGORA, AGORA).vencido).toBe(true);
    expect(cp.situacaoDoPrazo("lixo", AGORA)).toEqual({ vencido: false, faixa: "NORMAL", texto: "" });
  });
  test("o fim do dia é o de Brasília (UTC−3)", () => {
    expect(cp.fimDoDiaBrasilia("2026-10-25").toISOString()).toBe("2026-10-26T02:59:59.000Z");
    expect(cp.diaBrasilia(new Date("2026-10-22T02:00:00Z"))).toBe("2026-10-21");
    expect(cp.fimDoDiaBrasilia("2026-02-30")).toBeNull();
  });
});

describe("a escada do prazo vencido", () => {
  test("sobe um degrau por vez e pula o degrau sem ninguém", () => {
    expect(cp.proximoDegrau("CONGREGACAO", ["AREA", "REGIAO", "GERAL"])).toBe("AREA");
    expect(cp.proximoDegrau("CONGREGACAO", ["GERAL"])).toBe("GERAL");
    expect(cp.proximoDegrau("AREA", new Set(["REGIAO"]))).toBe("REGIAO");
    expect(cp.proximoDegrau("GERAL", ["GERAL"])).toBeNull();
    expect(cp.proximoDegrau("CONGREGACAO", [])).toBeNull();
    expect(cp.proximoDegrau("QUADRANTE", ["GERAL"])).toBeNull();
  });
  test("(revisão) o urgente continua com 24 horas a cada degrau; o comum ganha os dias de Catálogos", () => {
    expect(cp.prazoDoDegrau({ Urgente: true }, AGORA, cp.prazosDoCuidado({})).toISOString()).toBe("2026-10-22T15:00:00.000Z");
    expect(cp.prazoDoDegrau({ Urgente: false }, AGORA, cp.prazosDoCuidado({ CUIDADO_PRAZO_DEGRAU_DIAS: 5 })).toISOString()).toBe("2026-10-26T15:00:00.000Z");
    expect(cp.textoSemResponsavel({ congregacaoNome: "Central", para: "AREA" })).toMatch(/não tem quem o receba na congregação e veio para a Área/);
  });
  test("vencido sobe; no topo, lembra até 5 vezes; no prazo ou encerrado, nada", () => {
    const vencido = { Status: "ABERTO", PrazoEm: new Date(AGORA.getTime() - 1000), Nivel: "CONGREGACAO", LembretesGerais: 0 };
    expect(cp.decidirEscada(vencido, ["AREA", "GERAL"], AGORA)).toEqual({ acao: "SUBIR", de: "CONGREGACAO", para: "AREA" });
    expect(cp.decidirEscada({ ...vencido, Nivel: "GERAL" }, ["GERAL"], AGORA)).toEqual({ acao: "LEMBRAR", de: "GERAL", para: "GERAL" });
    expect(cp.decidirEscada({ ...vencido, Nivel: "GERAL", LembretesGerais: 5 }, ["GERAL"], AGORA)).toEqual({ acao: "NADA" });
    expect(cp.decidirEscada({ ...vencido, PrazoEm: new Date(AGORA.getTime() + 1000) }, ["AREA"], AGORA)).toEqual({ acao: "NADA" });
    expect(cp.decidirEscada({ ...vencido, Status: "CONCLUIDO" }, ["AREA"], AGORA)).toEqual({ acao: "NADA" });
    expect(cp.decidirEscada(null, ["AREA"], AGORA)).toEqual({ acao: "NADA" });
  });
});

describe("validações", () => {
  test("abrir: quem é do cadastro vai pela matrícula; quem não é, pelo nome E contato; \"afastado\" só do cadastro", () => {
    expect(cp.validarAbertura({ tipo: "VISITANTE", congregacaoId: "3", pessoaNome: "Fulano", pessoaContato: "91 9999" })).toMatchObject({ valido: true, dados: { congregacaoId: 3, membroId: null, urgente: false } });
    expect(cp.validarAbertura({ tipo: "VISITANTE", congregacaoId: 3, pessoaNome: "Fulano" }).valido).toBe(false);
    expect(cp.validarAbertura({ tipo: "AFASTAMENTO", congregacaoId: 3, pessoaNome: "Fulano", pessoaContato: "91 9999" }).valido).toBe(false);
    expect(cp.validarAbertura({ tipo: "AFASTAMENTO", congregacaoId: 3, membroId: "12" }).dados.membroId).toBe(12);
    expect(cp.validarAbertura({ tipo: "AFASTAMENTO", congregacaoId: 3, membroId: 12, pessoaNome: "Outro" }).valido).toBe(false);
    expect(cp.validarAbertura({ tipo: "PEDIDO_ORACAO", congregacaoId: 3, membroId: 12 }).valido).toBe(false);
    expect(cp.validarAbertura({ tipo: "VISITANTE", congregacaoId: "0x3", pessoaNome: "F", pessoaContato: "91" }).valido).toBe(false);
    expect(cp.validarAbertura({ tipo: "VISITANTE", congregacaoId: 3, pessoaNome: "<b>x</b>", pessoaContato: "91 9999" }).valido).toBe(false);
    expect(cp.validarAbertura({ tipo: "VISITANTE", congregacaoId: 3, pessoaNome: "x".repeat(151), pessoaContato: "91 9999" }).valido).toBe(false);
    expect(cp.validarAbertura({ tipo: "VISITANTE", congregacaoId: 3, pessoaNome: ["Fulano"], pessoaContato: "91 9999" }).valido).toBe(false);
    expect(cp.validarAbertura({ tipo: "VISITANTE", congregacaoId: 3, pessoaNome: "Fulano", pessoaContato: "91 9999", urgente: "talvez" }).valido).toBe(false);
    expect(cp.validarAbertura(null).valido).toBe(false);
  });
  test("contato: a visita presencial exige quem foi junto (Regimento Art. 85 §3º)", () => {
    const v = cp.validarContato({ forma: "VISITA_HOSPITAL", conseguiu: true }, { agora: AGORA });
    expect(v.valido).toBe(false);
    expect(v.mensagem).toMatch(/Art\. 85/);
    expect(cp.validarContato({ forma: "VISITA_LAR", conseguiu: "true", acompanhante: "Irmã Neide" }, { agora: AGORA })).toMatchObject({ valido: true, dados: { conseguiu: true, acompanhante: "Irmã Neide" } });
    expect(cp.validarContato({ forma: "LIGACAO", conseguiu: 0 }, { agora: AGORA }).dados.conseguiu).toBe(false);
    expect(cp.validarContato({ forma: "LIGACAO" }, { agora: AGORA }).valido).toBe(false);
    expect(cp.validarContato({ forma: "TELEPATIA", conseguiu: true }, { agora: AGORA }).valido).toBe(false);
  });
  test("contato: até 7 dias atrás, nunca no futuro", () => {
    expect(cp.validarContato({ forma: "LIGACAO", conseguiu: true, data: "2026-10-14" }, { agora: AGORA }).valido).toBe(true);
    expect(cp.validarContato({ forma: "LIGACAO", conseguiu: true, data: "2026-10-13" }, { agora: AGORA }).valido).toBe(false);
    expect(cp.validarContato({ forma: "LIGACAO", conseguiu: true, data: "2026-10-22" }, { agora: AGORA }).valido).toBe(false);
    expect(cp.validarContato({ forma: "LIGACAO", conseguiu: true, data: "2026-10-21T00:00" }, { agora: AGORA }).valido).toBe(false);
    expect(cp.validarContato({ forma: "LIGACAO", conseguiu: true, data: "2026-10-19" }, { agora: AGORA }).dados.em.toISOString()).toBe("2026-10-19T14:59:59.000Z");
    expect(cp.validarContato({ forma: "LIGACAO", conseguiu: true, data: HOJE }, { agora: AGORA }).dados.em).toEqual(AGORA);
  });
  test("concluir, cancelar e adiar", () => {
    expect(cp.validarConclusao({ desfecho: "INTEGRADO" }).valido).toBe(true);
    expect(cp.validarConclusao({ desfecho: "OUTRO" }).valido).toBe(false);
    expect(cp.validarConclusao({ desfecho: "DUPLICADO" }).valido).toBe(false);
    expect(cp.validarCancelamento({ desfecho: "DUPLICADO", motivo: "aberto duas vezes" }).valido).toBe(true);
    expect(cp.validarCancelamento({ desfecho: "INTEGRADO", motivo: "aberto duas vezes" }).valido).toBe(false);
    expect(cp.validarCancelamento({ desfecho: "ENGANO", motivo: "x" }).valido).toBe(false);
    expect(cp.validarAdiamento({ novoPrazo: "2026-11-20", motivo: "a família viajou" }, { agora: AGORA }).dados.novoPrazo.toISOString()).toBe("2026-11-21T02:59:59.000Z");
    expect(cp.validarAdiamento({ novoPrazo: "2026-11-21", motivo: "a família viajou" }, { agora: AGORA }).valido).toBe(false);
    expect(cp.validarAdiamento({ novoPrazo: "2026-10-20", motivo: "a família viajou" }, { agora: AGORA }).valido).toBe(false);
    expect(cp.validarAdiamento({ novoPrazo: "2026-10-25" }, { agora: AGORA }).valido).toBe(false);
  });
  test("nota: nível, um alvo só, texto de 3 a 2000, correção por id", () => {
    expect(cp.validarNota({ nivel: "PASTORAL", membroId: 5, texto: "aconselhamento" })).toMatchObject({ valido: true, dados: { nivel: "PASTORAL", membroId: 5, itemId: null } });
    expect(cp.validarNota({ nivel: "PUBLICA", membroId: 5, texto: "x x x" }).valido).toBe(false);
    expect(cp.validarNota({ nivel: "EQUIPE", texto: "sem alvo" }).valido).toBe(false);
    expect(cp.validarNota({ nivel: "EQUIPE", membroId: 5, texto: "x".repeat(2001) }).valido).toBe(false);
    expect(cp.validarNota({ nivel: "EQUIPE", membroId: 5, texto: "ok ok", retificaNotaId: "1e1" }).valido).toBe(false);
  });
  test("pedido de oração: a escolha do boletim é obrigatória e explícita", () => {
    expect(cp.validarPedidoOracao({ categoria: "SAUDE", texto: "pela cirurgia" }).valido).toBe(false);
    expect(cp.validarPedidoOracao({ categoria: "SAUDE", texto: "pela cirurgia", podeBoletim: false })).toMatchObject({ valido: true, dados: { paraQuem: "PROPRIO", podeBoletim: false, querContato: false } });
    expect(cp.validarPedidoOracao({ categoria: "POLITICA", texto: "pela cirurgia", podeBoletim: true }).valido).toBe(false);
    expect(cp.validarPedidoOracao({ categoria: "SAUDE", texto: "abc", podeBoletim: true }).valido).toBe(false);
    expect(cp.validarPedidoOracao({ categoria: "SAUDE", texto: "pela cirurgia", podeBoletim: true, paraQuem: "VIZINHO" }).valido).toBe(false);
  });
  test("pedido recebido em mãos: matrícula OU nome", () => {
    expect(cp.validarSolicitante({ congregacaoId: 1, membroId: 9 }).valido).toBe(true);
    expect(cp.validarSolicitante({ congregacaoId: 1, solicitanteNome: "Dona Maria" }).valido).toBe(true);
    expect(cp.validarSolicitante({ congregacaoId: 1 }).valido).toBe(false);
    expect(cp.validarSolicitante({ congregacaoId: 1, membroId: 9, solicitanteNome: "Dona Maria" }).valido).toBe(false);
    expect(cp.validarSolicitante({ membroId: 9 }).valido).toBe(false);
  });
  test("pedido de visita", () => {
    expect(cp.validarPedidoVisita({ motivo: "estou acamado", hospital: true })).toMatchObject({ valido: true, dados: { hospital: true, contato: null } });
    expect(cp.validarPedidoVisita({ motivo: "oi" }).valido).toBe(false);
    expect(cp.validarPedidoVisita({ motivo: "estou acamado", hospital: "sim" }).valido).toBe(false);
  });
});

describe("o sinal de risco", () => {
  const SIM = ["Não AGUENTO mais viver!!", "pensando em suicídio", "quero morrer", "vou me matar", "tenho vontade de morrer", "comecei a me cortar", "tirar a minha vida", "vou acabar com a minha vida",
    "tomei todos os remedios", "meu marido me bate", "ele me agrediu ontem", "sofro violência em casa", "fui abusada", "ameaça de morte", "ele vai me matar", "pedi medida protetiva", "Lei Maria da Penha",
    "tenho medo do meu marido", "apanho todo dia", "sofri estupro"];
  const NAO = ["Oro pela cura da minha mãe", "estou me sentindo sozinha", "pela prova do vestibular", "agradeço pelo emprego novo", "o batismo do meu filho", "pela viagem da família", "estou desempregado",
    "minha avó está internada", "luto pelo meu pai"];
  test.each(SIM)("acusa: %s", (t) => { expect(cp.avaliarRisco(t).risco).toBe(true); });
  test.each(NAO)("não acusa: %s", (t) => { expect(cp.avaliarRisco(t).risco).toBe(false); });
  // (revisão independente, 21/10/2026) as frases que a primeira lista deixava passar
  const REVISAO_SIM = ["eu me mato", "não quero viver", "cansei de viver", "queria estar morta", "seria melhor se eu morresse", "melhor eu morrer", "quero sumir", "não quero mais estar aqui",
    "quero acabar com tudo", "vou dar fim na minha vida", "vou me jogar na frente de um carro", "pular do prédio", "vou enforcar-me", "tomei veneno", "vou tomar chumbinho", "tomei uma caixa de remédios",
    "não quero mais acordar", "penso em me ferir", "sem vontade de viver", "pensamentos de morte", "ele abusa da minha filha", "abusa de mim", "meu marido bate em mim", "meu marido bate nos meus filhos",
    "o padrasto bate na menina", "ela apanha do pai", "ele está agredindo a mãe", "vai matar meus filhos", "ameaçou matar a gente", "me deu um soco", "me deu um tapa", "levei uma surra",
    "ele me trancou em casa", "me mantém presa", "tocou nas partes íntimas da criança", "o tio mexe com a sobrinha", "pedofilia", "exploração sexual"];
  test.each(REVISAO_SIM)("acusa (revisão): %s", (t) => { expect(cp.avaliarRisco(t).risco).toBe(true); });
  test("autolesão e violência são separadas; criança só conta junto com violência", () => {
    expect(cp.avaliarRisco("quero morrer")).toEqual({ risco: true, autolesao: true, violencia: false, crianca: false, liderancaCitada: false });
    expect(cp.avaliarRisco("o padrasto abusou da minha filha")).toEqual({ risco: true, autolesao: false, violencia: true, crianca: true, liderancaCitada: false });
    expect(cp.avaliarRisco("pela saúde da minha filha").crianca).toBe(false);
    expect(cp.avaliarRisco("pela saúde", "ele me bate").violencia).toBe(true);
    expect(cp.avaliarRisco(null, 5, {}).risco).toBe(false);
  });
  test("violência que cita a liderança (pela função) marca o caso para o nível geral; autolesão não", () => {
    expect(cp.avaliarRisco("o dirigente abusou de mim").liderancaCitada).toBe(true);
    expect(cp.avaliarRisco("o pastor me bate").liderancaCitada).toBe(true);
    expect(cp.avaliarRisco("o professor da EBD tocou na minha filha").liderancaCitada).toBe(true);
    expect(cp.avaliarRisco("quero morrer, nem o pastor me entende").liderancaCitada).toBe(false);
    expect(cp.avaliarRisco("orem pelo pastor").risco).toBe(false);
  });
  test("citar pelo nome: o primeiro nome E mais uma parte", () => {
    expect(cp.citaPeloNome("o irmão Jorge Souza me agrediu", "Jorge Henrique Souza")).toBe(true);
    expect(cp.citaPeloNome("o Jorge me agrediu", "Jorge Henrique Souza")).toBe(false);
    expect(cp.citaPeloNome("a Souza", "Jorge Henrique Souza")).toBe(false);
    expect(cp.citaPeloNome("Jor​ge Souza", "Jorge Souza")).toBe(true);
    expect(cp.citaPeloNome("qualquer", "Zé")).toBe(false);
  });
  test("ignora acento, maiúscula e pontuação", () => {
    expect(cp.normalizar("Não AGUENTO… mais!! viver")).toBe("nao aguento mais viver");
    expect(cp.avaliarRisco("SUICIDIO").risco).toBe(true);
    expect(cp.avaliarRisco("violência").risco).toBe(true);
  });
});

describe("o boletim sem nome", () => {
  test("a linha nasce do assunto e da congregação, nunca do texto", () => {
    expect(cp.linhaDoBoletim({ categoria: "SAUDE", paraQuem: "PROPRIO", congregacaoNome: "Vila Nova" })).toBe("Alguém da Congregação Vila Nova pede oração pela saúde.");
    expect(cp.linhaDoBoletim({ categoria: "LUTO", paraQuem: "OUTRA_PESSOA", congregacaoNome: "Vila Nova" })).toBe("Alguém da Congregação Vila Nova pede oração por conforto no luto de uma pessoa querida.");
    expect(cp.linhaDoBoletim({ categoria: "GRATIDAO", congregacaoNome: "" })).toBe("Alguém da nossa igreja agradece a Deus e pede que a igreja agradeça junto.");
    expect(cp.linhaDoBoletim({ categoria: "XYZ", congregacaoNome: "Central" })).toMatch(/por uma necessidade/);
  });
  test("a reescrita com o nome de quem pediu é recusada; as palavras da congregação não acusam", () => {
    expect(cp.validarTextoBoletim("Maria pede oração", { nomes: ["Maria da Silva"] }).valido).toBe(false);
    expect(cp.validarTextoBoletim("Uma irmã da Silva pede oração", { nomes: ["Maria da Silva"] }).valido).toBe(false);
    expect(cp.validarTextoBoletim("Alguém da igreja pede oração", { nomes: ["Maria da Silva"] }).valido).toBe(true);
    expect(cp.validarTextoBoletim("Alguém da Congregação Central pede oração", { nomes: ["Maria Central"], congregacaoNome: "Central" }).valido).toBe(true);
    expect(cp.validarTextoBoletim("A Maria da Central pede oração", { nomes: ["Maria Central"], congregacaoNome: "Central" }).valido).toBe(false);
    expect(cp.validarTextoBoletim("curto").valido).toBe(false);
    expect(cp.validarTextoBoletim("x".repeat(201)).valido).toBe(false);
    expect(cp.validarTextoBoletim("Alguém <b>pede</b> oração").valido).toBe(false);
  });
  test("(revisão) nome curto, nome partido por caractere invisível e diagnóstico também são recusados", () => {
    expect(cp.validarTextoBoletim("O Zé pede oração pela saúde", { nomes: ["Zé"] }).valido).toBe(false);
    expect(cp.validarTextoBoletim("Alguém da igreja pede oração", { nomes: ["Zé"] }).valido).toBe(true);
    expect(cp.validarTextoBoletim("A Ma​ria pede oração pela saúde", { nomes: ["Maria Silva"] }).valido).toBe(false);
    expect(cp.validarTextoBoletim("Alguém pede oração pela saúde, ela está com câncer de mama").mensagem).toMatch(/diagnóstico/);
    expect(cp.validarTextoBoletim("Alguém pede oração por um irmão na UTI").valido).toBe(false);
    for (const c of Object.keys(cp.CATEGORIAS_ORACAO)) for (const pq of ["PROPRIO", "OUTRA_PESSOA"]) {
      expect(cp.validarTextoBoletim(cp.linhaDoBoletim({ categoria: c, paraQuem: pq, congregacaoNome: "Vila Nova" }), { nomes: ["Ana Vila"], congregacaoNome: "Vila Nova" }).valido).toBe(true);
    }
  });
  test("(revisão) todo texto livre recusa caractere de controle ou invisível; a quebra de linha vale", () => {
    expect(cp.validarNota({ nivel: "EQUIPE", membroId: 5, texto: "visita\nboa" }).valido).toBe(true);
    expect(cp.validarNota({ nivel: "EQUIPE", membroId: 5, texto: "visita\u0000boa" }).valido).toBe(false);
    expect(cp.validarPedidoOracao({ categoria: "SAUDE", texto: "pela mi​nha mãe", podeBoletim: true }).valido).toBe(false);
    expect(cp.validarAbertura({ tipo: "VISITANTE", congregacaoId: 3, pessoaNome: "Ful‮ano", pessoaContato: "91 9999" }).valido).toBe(false);
  });
});

describe("a detecção pelo padrão da própria pessoa", () => {
  const semanas = (n, presente) => Array.from({ length: n }, (_, i) => ({ data: cp.somarDiasIso(HOJE, -7 * i), presente: presente(i), fonte: "EBD" }));
  test("quem vinha quase sempre e sumiu: sinal, com o porquê em números", () => {
    const a = cp.avaliarFrequencia(semanas(30, (i) => (i < 7 ? i === 3 : i % 10 !== 0)), { hoje: HOJE });
    expect(a.sinal).toBe(true);
    expect(a.resumo).toMatch(/^EBD: antes \d+ de \d+ \(\d+%\); nas últimas 6 semanas 1 de 7 \(14%\)\.$/);
  });
  test("quem sempre veio pouco (1 por mês) não é sinal: não havia costume", () => {
    expect(cp.avaliarFrequencia(semanas(30, (i) => i % 4 === 0), { hoje: HOJE }).sinal).toBe(false);
  });
  test("quem caiu pouco (de 90% para 70%) não é sinal; o limite é a queda de 60%", () => {
    expect(cp.avaliarFrequencia(semanas(30, (i) => (i < 7 ? i % 3 !== 0 : i % 10 !== 0)), { hoje: HOJE }).sinal).toBe(false);
  });
  test("sem oportunidades suficientes, não se compara (nem base, nem recentes)", () => {
    expect(cp.avaliarFrequencia(semanas(8, (i) => i >= 6), { hoje: HOJE }).sinal).toBe(false);
    expect(cp.avaliarFrequencia(semanas(30, () => true).filter((o, i) => i >= 6 || i === 0), { hoje: HOJE }).sinal).toBe(false);
  });
  test("dois registros no mesmo dia contam como um, presente se veio a algum; as fontes aparecem", () => {
    const ops = [...semanas(30, (i) => (i < 7 ? false : true)), { data: cp.somarDiasIso(HOJE, -7), presente: false, fonte: "REUNIAO" }];
    const a = cp.avaliarFrequencia(ops, { hoje: HOJE });
    expect(a.sinal).toBe(true);
    expect(a.recente.oportunidades).toBe(7);
    expect(a.resumo).toMatch(/^EBD e reuniões:/);
  });
  test("os parâmetros de Catálogos mudam a régua", () => {
    const ops = semanas(30, (i) => (i < 7 ? i % 3 === 0 : true));
    expect(cp.avaliarFrequencia(ops, { hoje: HOJE }).sinal).toBe(false);
    expect(cp.avaliarFrequencia(ops, { hoje: HOJE, quedaPct: 40 }).sinal).toBe(true);
  });
  test("datas fora da janela e lixo são ignorados", () => {
    expect(cp.avaliarFrequencia([{ data: "lixo", presente: true }, null, { data: "2099-01-01", presente: true }], { hoje: HOJE }).sinal).toBe(false);
    expect(cp.avaliarFrequencia([], { hoje: "nao" }).sinal).toBe(false);
  });
});

describe("quem lê e quem escreve cada nível de nota", () => {
  const nota = (Nivel, AutorMembroId = 1) => ({ Nivel, AutorMembroId });
  test("equipe: liderança e responsável; liderança: só liderança; somente pastor: liderança que é Pastor", () => {
    const lider = { membroId: 9, gestao: true, pastor: false }, pastor = { membroId: 9, gestao: true, pastor: true }, resp = { membroId: 9, responsavelAberto: true }, nada = { membroId: 9 };
    expect([lider, pastor, resp, nada].map((c) => cp.podeLerNota(nota("EQUIPE"), c))).toEqual([true, true, true, false]);
    expect([lider, pastor, resp, nada].map((c) => cp.podeLerNota(nota("LIDERANCA"), c))).toEqual([true, true, false, false]);
    expect([lider, pastor, resp, nada].map((c) => cp.podeLerNota(nota("PASTORAL"), c))).toEqual([false, true, false, false]);
    expect(cp.podeLerNota(nota("PASTORAL", 9), { membroId: 9 })).toBe(true);
    expect(cp.podeLerNota(nota("OUTRO"), pastor)).toBe(false);
    expect(cp.podeLerNota(null, pastor)).toBe(false);
  });
  test("(revisão) a correção nunca rebaixa o sigilo", () => {
    expect(cp.podeCorrigir("EQUIPE", "PASTORAL")).toBe(false);
    expect(cp.podeCorrigir("LIDERANCA", "PASTORAL")).toBe(false);
    expect(cp.podeCorrigir("PASTORAL", "EQUIPE")).toBe(true);
    expect(cp.podeCorrigir("LIDERANCA", "LIDERANCA")).toBe(true);
    expect(cp.podeCorrigir("X", "EQUIPE")).toBe(false);
  });
  test("o responsável escreve só a de equipe; abrir \"somente pastor\" pede a confirmação reforçada", () => {
    expect(cp.podeEscreverNota("EQUIPE", { responsavelAberto: true })).toBe(true);
    expect(cp.podeEscreverNota("LIDERANCA", { responsavelAberto: true })).toBe(false);
    expect(cp.podeEscreverNota("PASTORAL", { gestao: true })).toBe(true);
    expect(cp.podeEscreverNota("EQUIPE", {})).toBe(false);
    expect(cp.notaPedeFator("PASTORAL")).toBe(true);
    expect(cp.notaPedeFator("LIDERANCA")).toBe(false);
  });
});

describe("quem pode ser responsável", () => {
  const item = { congregacaoId: 1, membroId: 50, acompanhadoMenor: false };
  const p = (over = {}) => ({ membroId: 7, status: "ATIVO", nascimento: "1980-01-01", congregacaoId: 1, ...over });
  test("membro ativo, adulto, da congregação (ou da liderança que a alcança), e nunca a própria pessoa", () => {
    expect(cp.avaliarResponsavel(p(), item, { hoje: HOJE }).ok).toBe(true);
    expect(cp.avaliarResponsavel(p({ status: "DESLIGADO" }), item, { hoje: HOJE }).ok).toBe(false);
    expect(cp.avaliarResponsavel(p({ nascimento: "2012-01-01" }), item, { hoje: HOJE }).ok).toBe(false);
    expect(cp.avaliarResponsavel(p({ nascimento: null }), item, { hoje: HOJE }).ok).toBe(false);
    expect(cp.avaliarResponsavel(p({ congregacaoId: 2 }), item, { hoje: HOJE }).ok).toBe(false);
    expect(cp.avaliarResponsavel(p({ congregacaoId: 2 }), item, { hoje: HOJE, alcancaPorLideranca: true }).ok).toBe(true);
    expect(cp.avaliarResponsavel(p({ membroId: 50 }), item, { hoje: HOJE }).ok).toBe(false);
  });
  test("acompanhar um menor: quem tem pendência reservada (v7.8) não pode", () => {
    expect(cp.avaliarResponsavel(p(), { ...item, acompanhadoMenor: true }, { hoje: HOJE, bloqueioReservado: true }).ok).toBe(false);
    expect(cp.avaliarResponsavel(p(), { ...item, acompanhadoMenor: true }, { hoje: HOJE }).ok).toBe(true);
  });
});

describe("os avisos (o e-mail sai do sistema)", () => {
  test("o do responsável leva só o primeiro nome; nenhum leva tipo sensível nem texto", () => {
    const t = cp.textoAtribuido({ pessoaNome: "Maria da Silva Souza", congregacaoNome: "Central", prazoTexto: "vence em 2 dias" });
    expect(t).toMatch(/acompanhar Maria \(Congregação Central\); o prazo vence em 2 dias/);
    expect(t).not.toMatch(/Silva|Souza|internad|hospital/i);
    expect(cp.textoAtribuido({ pessoaNome: "" })).toMatch(/uma pessoa/);
  });
  test("o resumo só tem números", () => {
    expect(cp.textoResumo({ novos: 1, vencendo: 2, vencidos: 3, abertos: 6 })).toBe("Seus acompanhamentos pastorais: 6 em aberto (1 novo, 2 vencendo em 24 horas, 3 vencidos). Abra Meu Painel → Cuidado.");
  });
  test("o de risco manda atender, traz o 190 e o 188 e, com criança, a Proteção de crianças", () => {
    const t = cp.textoRisco({ congregacaoNome: "Central", crianca: true });
    expect(t).toMatch(/SINAL DE RISCO na Congregação Central/);
    expect(t).toMatch(/190/);
    expect(t).toMatch(/188/);
    expect(t).toMatch(/Proteção de crianças/);
    expect(cp.textoRisco({ congregacaoNome: "Central" })).not.toMatch(/Proteção de crianças/);
  });
  test("\"a liderança foi avisada\" só quando o aviso saiu do app (Trava 7-B)", () => {
    expect(cp.textoAvisoRisco({ externas: 1 })).toMatch(/foi avisada/);
    expect(cp.textoAvisoRisco({ criadas: 3, externas: 0 })).toMatch(/Não conseguimos avisar/);
    expect(cp.textoAvisoRisco(null)).toMatch(/Não conseguimos avisar/);
  });
  test("degrau e moderação", () => {
    expect(cp.textoDegrau({ congregacaoNome: "Central", para: "AREA" })).toMatch(/subiu para a Área \(Pastor de Área\)/);
    expect(cp.textoDegrau({ para: "GERAL" })).toMatch(/subiu para o nível geral/);
    expect(cp.textoModeracao({ quantos: 1, congregacaoNome: "Central" })).toBe("1 pedido de oração espera moderação na Congregação Central. Abra Cuidado pastoral → Pedidos de oração.");
  });
  test("a referência do dia é estável e cabe no INT", () => {
    expect(cp.referenciaDoDia("2020-01-01")).toBe(1);
    expect(cp.referenciaDoDia(HOJE)).toBe(2486);
    expect(cp.referenciaDoDia("lixo")).toBeNull();
    expect(cp.referenciaDoDia("2100-01-01") * 10000 + 9999).toBeLessThan(2147483647);
  });
});

describe("os contatos de ajuda", () => {
  test("188, 190, 180 e 100", () => {
    expect(cp.CONTATOS_DE_AJUDA.map((c) => c.numero)).toEqual(["188", "190", "180", "100"]);
  });
});
