// Testes do v6.8 (EBD — Caderneta digital) — foco na lógica pura: trimestres
// civis, a linha da caderneta (presentes/ausentes derivados da chamada, não
// digitados), o consolidado Área → Congregação → Turma, as regras do
// fechamento trimestral e a leitura/validação do CSV de cadernetas antigas.
const c = require("../ebdCaderneta");

describe("trimestres civis", () => {
  test("trimestreDaData por mês, aceitando string e Date de coluna DATE", () => {
    expect(c.trimestreDaData("2026-01-01")).toBe("2026-T1");
    expect(c.trimestreDaData("2026-03-31")).toBe("2026-T1");
    expect(c.trimestreDaData("2026-09-27")).toBe("2026-T3");
    expect(c.trimestreDaData(new Date("2026-10-01T00:00:00.000Z"))).toBe("2026-T4");
    expect(c.trimestreDaData("lixo")).toBeNull();
    expect(c.trimestreDaData(null)).toBeNull();
  });

  test("paraIsoData usa o dia UTC de uma coluna DATE (meia-noite UTC)", () => {
    expect(c.paraIsoData(new Date("2026-09-27T00:00:00.000Z"))).toBe("2026-09-27");
    expect(c.paraIsoData("2026-09-27T00:00:00.000Z")).toBe("2026-09-27");
    expect(c.paraIsoData("2026-02-30")).toBeNull();
  });

  test("intervaloDoTrimestre: primeiro e último dia de cada trimestre", () => {
    expect(c.intervaloDoTrimestre("2026-T1")).toEqual({ inicio: "2026-01-01", fim: "2026-03-31" });
    expect(c.intervaloDoTrimestre("2026-T2")).toEqual({ inicio: "2026-04-01", fim: "2026-06-30" });
    expect(c.intervaloDoTrimestre("2026-T3")).toEqual({ inicio: "2026-07-01", fim: "2026-09-30" });
    expect(c.intervaloDoTrimestre("2026-T4")).toEqual({ inicio: "2026-10-01", fim: "2026-12-31" });
    expect(c.intervaloDoTrimestre("2026-T5")).toBeNull();
    expect(c.intervaloDoTrimestre("T3")).toBeNull();
  });

  test("trimestreEncerrado: só depois do último dia + carência", () => {
    expect(c.trimestreEncerrado("2026-T3", "2026-09-30")).toBe(false);
    expect(c.trimestreEncerrado("2026-T3", "2026-10-01")).toBe(true);
    expect(c.trimestreEncerrado("2026-T3", "2026-10-07", 7)).toBe(false);
    expect(c.trimestreEncerrado("2026-T3", "2026-10-08", 7)).toBe(true);
    expect(c.trimestreEncerrado("inválido", "2026-10-08")).toBe(false);
  });

  test("a rotina automática olha os 2 trimestres mais recentes já encerrados (com carência)", () => {
    expect(c.trimestresParaFechamentoAutomatico("2026-09-30")).toEqual(["2026-T1", "2026-T2"]);
    expect(c.trimestresParaFechamentoAutomatico("2026-10-09")).toEqual(["2026-T2", "2026-T3"]);
    // virada de ano: 5/jan ainda está na carência do 2025-T4
    expect(c.trimestresParaFechamentoAutomatico("2026-01-05")).toEqual(["2025-T2", "2025-T3"]);
    expect(c.trimestresParaFechamentoAutomatico("2026-01-08")).toEqual(["2025-T3", "2025-T4"]);
  });
});

describe("validarRegistroCaderneta (Bíblias e Revistas)", () => {
  test("em branco é 'não informado' (null), nunca 0", () => {
    const r = c.validarRegistroCaderneta({ biblias: "", revistas: undefined });
    expect(r.valido).toBe(true);
    expect(r.valores).toEqual({ biblias: null, revistas: null, observacao: null });
  });

  test("aceita 0 e número em texto", () => {
    const r = c.validarRegistroCaderneta({ biblias: 0, revistas: "12", observacao: "  ok  " });
    expect(r.valores).toEqual({ biblias: 0, revistas: 12, observacao: "ok" });
  });

  test("recusa negativo, fracionário e texto", () => {
    expect(c.validarRegistroCaderneta({ biblias: -1 }).valido).toBe(false);
    expect(c.validarRegistroCaderneta({ revistas: 2.5 }).valido).toBe(false);
    expect(c.validarRegistroCaderneta({ biblias: "abc" }).mensagem).toMatch(/Bíblias/);
  });

  test("recusa observação longa demais", () => {
    expect(c.validarRegistroCaderneta({ observacao: "x".repeat(501) }).valido).toBe(false);
  });
});

describe("resolverRevistaVigente", () => {
  const catalogo = [{ nome: "Jovens — 3º Tri", faixaEtaria: "Jovens" }, { nome: "Adultos — 3º Tri", faixaEtaria: "Adultos" }];

  test("o pedido da turma tem prioridade", () => {
    const r = c.resolverRevistaVigente({
      trimestre: "2026-T3", itensPedido: [{ revistaNome: "Adultos — 3º Tri", quantidade: 12 }], catalogoDoTrimestre: catalogo, faixaEtaria: "Adultos"
    });
    expect(r.origem).toBe("PEDIDO");
    expect(r.revistas).toEqual([{ nome: "Adultos — 3º Tri", quantidade: 12 }]);
  });

  test("sem pedido, sugere do catálogo pela faixa etária (sem acento nem maiúscula)", () => {
    const r = c.resolverRevistaVigente({ trimestre: "2026-T3", catalogoDoTrimestre: [{ nome: "Jovéns", faixaEtaria: "JÓVENS" }], faixaEtaria: "jovens" });
    expect(r.origem).toBe("CATALOGO");
    expect(r.revistas[0].nome).toBe("Jovéns");
  });

  test("sem pedido nem catálogo compatível, devolve só o trimestre", () => {
    const r = c.resolverRevistaVigente({ trimestre: "2026-T3", catalogoDoTrimestre: catalogo, faixaEtaria: "Crianças" });
    expect(r).toEqual({ trimestre: "2026-T3", origem: null, revistas: [] });
  });
});

describe("montarLinhaCaderneta — a linha de uma classe num domingo", () => {
  const turma = { turmaId: 1, nome: "Adultos", faixaEtaria: "Adultos", ativa: true };

  test("ausentes = matriculados - presentes (definição da caderneta de papel); sem chamada aparece à parte", () => {
    const l = c.montarLinhaCaderneta({ turma, matriculadosAtuais: 10, resumo: { presentes: 6, ausentes: 3, visitantes: 2 } });
    expect(l.matriculados).toBe(10);
    expect(l.presentes).toBe(6);
    expect(l.ausentes).toBe(4);
    expect(l.ausentesMarcados).toBe(3);
    expect(l.semChamada).toBe(1);
    expect(l.visitantes).toBe(2);
    expect(l.frequentes).toBe(8);
    expect(l.percentualPresenca).toBe(60);
    expect(l.lancada).toBe(true);
    expect(l.alertas.join(" ")).toMatch(/1 aluno\(s\) sem chamada/);
  });

  test("a foto gravada dos matriculados vence o número atual (o passado não muda)", () => {
    const l = c.montarLinhaCaderneta({
      turma, matriculadosAtuais: 10, resumo: { presentes: 6, ausentes: 2, visitantes: 0 },
      caderneta: { origem: "SISTEMA", matriculadosRegistrado: 8, biblias: 5, revistas: 6, observacao: null }
    });
    expect(l.matriculados).toBe(8);
    expect(l.ausentes).toBe(2);
    expect(l.semChamada).toBe(0);
    expect(l.biblias).toBe(5);
    expect(l.salva).toBe(true);
    expect(l.alertas).toEqual([]);
  });

  test("mais presentes que matriculados: ausentes nunca fica negativo e avisa", () => {
    const l = c.montarLinhaCaderneta({ turma, matriculadosAtuais: 5, resumo: { presentes: 7, ausentes: 0, visitantes: 0 } });
    expect(l.ausentes).toBe(0);
    expect(l.alertas.join(" ")).toMatch(/Mais presentes do que matriculados/);
  });

  test("Bíblias/Revistas acima do total de frequentes geram alerta", () => {
    const l = c.montarLinhaCaderneta({
      turma, matriculadosAtuais: 5, resumo: { presentes: 4, ausentes: 1, visitantes: 1 },
      caderneta: { origem: "SISTEMA", matriculadosRegistrado: 5, biblias: 9, revistas: 3 }
    });
    expect(l.alertas.join(" ")).toMatch(/Bíblias \(9\) acima do total de frequentes \(5\)/);
    expect(l.alertas.join(" ")).not.toMatch(/Revistas/);
  });

  test("Bíblias/Revistas em branco avisam 'não informadas' (mas não contam como zero no total)", () => {
    const l = c.montarLinhaCaderneta({ turma, matriculadosAtuais: 5, resumo: { presentes: 5, ausentes: 0, visitantes: 0 } });
    expect(l.biblias).toBeNull();
    expect(l.alertas.join(" ")).toMatch(/ainda não informadas/);
  });

  test("turma que não lançou nada não é 'lançada' e não entra nas somas", () => {
    const vazia = c.montarLinhaCaderneta({ turma, matriculadosAtuais: 9, resumo: {} });
    expect(vazia.lancada).toBe(false);
    expect(vazia.alertas[0]).toMatch(/Nenhuma chamada/);
    const feita = c.montarLinhaCaderneta({ turma: { ...turma, turmaId: 2, nome: "Jovens" }, matriculadosAtuais: 4, resumo: { presentes: 4, ausentes: 0, visitantes: 0 } });
    const t = c.somarLinhas([vazia, feita]);
    expect(t.turmasLancadas).toBe(1);
    expect(t.turmasSemLancamento).toBe(1);
    expect(t.matriculados).toBe(4);
    expect(t.percentualPresenca).toBe(100);
  });

  test("caderneta IMPORTADA usa os totais importados, sem derivar nada da chamada", () => {
    const l = c.montarLinhaCaderneta({
      turma, matriculadosAtuais: 99, resumo: { presentes: 50, ausentes: 0, visitantes: 0 },
      caderneta: {
        origem: "IMPORTADA", matriculadosRegistrado: 20, presentesImportado: 15, ausentesImportado: 5,
        visitantesImportado: 3, ofertaImportada: 41.5, biblias: 10, revistas: 12
      }
    });
    expect(l.origem).toBe("IMPORTADA");
    expect(l.matriculados).toBe(20);
    expect(l.presentes).toBe(15);
    expect(l.ausentes).toBe(5);
    expect(l.visitantes).toBe(3);
    expect(l.ofertaImportada).toBe(41.5);
    expect(l.semChamada).toBe(0);
    expect(l.percentualPresenca).toBe(75);
  });
});

describe("montarCadernetaDoDomingo", () => {
  const turma = { turmaId: 1, nome: "Adultos", ativa: true };
  const linha = c.montarLinhaCaderneta({
    turma, matriculadosAtuais: 10, resumo: { presentes: 8, ausentes: 2, visitantes: 1 },
    caderneta: { origem: "SISTEMA", matriculadosRegistrado: 10, biblias: 7, revistas: 8 }
  });

  test("lição aberta = parcial; fechada = definitiva", () => {
    expect(c.montarCadernetaDoDomingo({ licao: { status: "ABERTA", data: "2026-09-27" }, linhas: [linha] }).parcial).toBe(true);
    expect(c.montarCadernetaDoDomingo({ licao: { status: "FECHADA", data: "2026-09-27" }, linhas: [linha] }).parcial).toBe(false);
  });

  test("a oferta é a da v6.7 (por lição); null quando ainda não foi registrada", () => {
    const sem = c.montarCadernetaDoDomingo({ licao: { status: "FECHADA", data: "2026-09-27" }, linhas: [linha] });
    expect(sem.ofertaRegistrada).toBeNull();
    expect(sem.ofertaTotal).toBe(0);
    const com = c.montarCadernetaDoDomingo({ licao: { status: "FECHADA", data: "2026-09-27" }, linhas: [linha], ofertaLicao: 130.25 });
    expect(com.ofertaRegistrada).toBe(130.25);
    expect(com.ofertaTotal).toBe(130.25);
    expect(com.trimestre).toBe("2026-T3");
  });
});

describe("consolidarRelatorio — Área → Congregação → Turma", () => {
  const reg = (extra) => ({
    areaId: 1, areaNome: "Área Norte", congregacaoId: 10, congregacaoNome: "Sede", turmaId: 100, turmaNome: "Adultos",
    faixaEtaria: null, licaoId: 1, data: "2026-09-20", matriculados: 10, presentes: 6, ausentes: 4, visitantes: 1,
    biblias: 5, revistas: 4, ofertaImportada: 0, ...extra
  });

  const registros = [
    reg({ licaoId: 1, presentes: 6, ausentes: 4, visitantes: 1, biblias: 5, revistas: 4 }),
    reg({ licaoId: 2, presentes: 8, ausentes: 2, visitantes: 0, biblias: 6, revistas: 5 }),
    reg({ turmaId: 101, turmaNome: "Jovens", licaoId: 1, matriculados: 4, presentes: 3, ausentes: 1, visitantes: 0, biblias: null, revistas: null }),
    reg({ turmaId: 101, turmaNome: "Jovens", licaoId: 2, matriculados: 4, presentes: 4, ausentes: 0, visitantes: 2, biblias: 4, revistas: 4 }),
    reg({ areaId: 2, areaNome: "Área Sul", congregacaoId: 20, congregacaoNome: "Vila Nova", turmaId: 200, licaoId: 7, matriculados: 6, presentes: 3, ausentes: 3, visitantes: 0, biblias: 2, revistas: 2 })
  ];

  test("totais por turma: médias por domingo e percentual sobre a soma dos matriculados", () => {
    const { areas } = c.consolidarRelatorio(registros);
    const norte = areas.find(a => a.areaNome === "Área Norte");
    const sede = norte.congregacoes[0];
    const adultos = sede.turmas.find(t => t.turmaNome === "Adultos").totais;
    expect(adultos.domingos).toBe(2);
    expect(adultos.presentes).toBe(14);
    expect(adultos.ausentes).toBe(6);
    expect(adultos.visitantes).toBe(1);
    expect(adultos.biblias).toBe(11);
    expect(adultos.matriculadosMedio).toBe(10);
    expect(adultos.mediaPresentes).toBe(7);
    expect(adultos.percentualPresenca).toBe(70); // 14 / (10 + 10)
  });

  test("Bíblias/Revistas em branco contam como 0 na soma, sem quebrar", () => {
    const { areas } = c.consolidarRelatorio(registros);
    const jovens = areas[0].congregacoes[0].turmas.find(t => t.turmaNome === "Jovens").totais;
    expect(jovens.biblias).toBe(4);
    expect(jovens.revistas).toBe(4);
  });

  test("congregação: domingos distintos (não soma das turmas) e médias somadas", () => {
    const { areas } = c.consolidarRelatorio(registros);
    const sede = areas.find(a => a.areaNome === "Área Norte").congregacoes[0].totais;
    expect(sede.domingos).toBe(2);
    expect(sede.presentes).toBe(21);
    expect(sede.matriculadosMedio).toBe(14); // 10 + 4
    expect(sede.percentualPresenca).toBe(75); // 21 / 28
  });

  test("área e geral somam as congregações; oferta do sistema entra por congregação", () => {
    const r = c.consolidarRelatorio(registros, { ofertasPorCongregacao: { 10: 300.5, 20: 80 } });
    expect(r.areas.map(a => a.areaNome)).toEqual(["Área Norte", "Área Sul"]);
    expect(r.areas[0].totais.oferta).toBe(300.5);
    expect(r.areas[1].totais.oferta).toBe(80);
    expect(r.totais.oferta).toBe(380.5);
    expect(r.totais.presentes).toBe(24);
    expect(r.totais.domingos).toBe(3); // 2 (Sede) + 1 (Vila Nova)
  });

  test("oferta importada por turma soma com a oferta do sistema", () => {
    const r = c.consolidarRelatorio([reg({ ofertaImportada: 25.5 }), reg({ licaoId: 2, ofertaImportada: 10 })], { ofertasPorCongregacao: { 10: 100 } });
    expect(r.totais.oferta).toBe(135.5);
  });

  test("congregação sem área cai em 'Sem Área definida'; sem registros, relatório vazio", () => {
    const r = c.consolidarRelatorio([reg({ areaId: null, areaNome: null })]);
    expect(r.areas[0].areaNome).toBe("Sem Área definida");
    const vazio = c.consolidarRelatorio([]);
    expect(vazio.areas).toEqual([]);
    expect(vazio.totais.presentes).toBe(0);
    expect(c.montarNoCongregacao([])).toBeNull();
  });
});

describe("fechamento trimestral", () => {
  const base = { trimestre: "2026-T2", hojeIso: "2026-09-30", origem: "MANUAL", temRegistros: true };

  test("manual: fecha trimestre encerrado que ainda não foi fechado", () => {
    expect(c.decidirFechamento({ ...base, existente: null }).permitido).toBe(true);
  });

  test("recusa trimestre que não terminou (há o relatório parcial)", () => {
    const r = c.decidirFechamento({ ...base, trimestre: "2026-T3", existente: null });
    expect(r.permitido).toBe(false);
    expect(r.mensagem).toMatch(/ainda não terminou/);
  });

  test("automático respeita a carência de 7 dias; manual não", () => {
    expect(c.decidirFechamento({ ...base, trimestre: "2026-T3", hojeIso: "2026-10-03", existente: null, origem: "MANUAL" }).permitido).toBe(true);
    expect(c.decidirFechamento({ ...base, trimestre: "2026-T3", hojeIso: "2026-10-03", existente: null, origem: "AUTOMATICO" }).permitido).toBe(false);
    expect(c.decidirFechamento({ ...base, trimestre: "2026-T3", hojeIso: "2026-10-08", existente: null, origem: "AUTOMATICO" }).permitido).toBe(true);
  });

  test("já fechado: só com 'refazer'; refazer sem fechamento é recusado", () => {
    const existente = { versao: 2 };
    const jaFechado = c.decidirFechamento({ ...base, existente });
    expect(jaFechado.permitido).toBe(false);
    expect(jaFechado.mensagem).toMatch(/versão 2/);
    expect(c.decidirFechamento({ ...base, existente, refazer: true }).permitido).toBe(true);
    expect(c.decidirFechamento({ ...base, existente: null, refazer: true }).permitido).toBe(false);
  });

  test("a rotina automática nunca refaz", () => {
    const r = c.decidirFechamento({ ...base, existente: { versao: 1 }, refazer: true, origem: "AUTOMATICO", hojeIso: "2026-10-30" });
    expect(r.permitido).toBe(false);
    expect(r.mensagem).toMatch(/nunca refaz/);
  });

  test("sem nenhuma chamada/caderneta no trimestre não há o que fechar", () => {
    const r = c.decidirFechamento({ ...base, existente: null, temRegistros: false });
    expect(r.permitido).toBe(false);
    expect(r.mensagem).toMatch(/Nenhuma chamada ou caderneta/);
  });

  test("trimestre em formato errado é recusado", () => {
    expect(c.decidirFechamento({ ...base, trimestre: "2026-3", existente: null }).permitido).toBe(false);
  });

  test("snapshot: ida e volta em JSON, e lixo vira null", () => {
    const no = c.montarNoCongregacao([{
      areaId: 1, areaNome: "Norte", congregacaoId: 10, congregacaoNome: "Sede", turmaId: 1, turmaNome: "Adultos",
      licaoId: 1, matriculados: 10, presentes: 6, ausentes: 4, visitantes: 0, biblias: 5, revistas: 5, ofertaImportada: 0
    }], { ofertaSistema: 50 });
    const snap = c.montarSnapshotFechamento({ no, trimestre: "2026-T2", licoesAbertas: 1, geradoEm: "2026-10-01T10:00:00.000Z" });
    expect(snap.periodo).toEqual({ inicio: "2026-04-01", fim: "2026-06-30" });
    const lido = c.lerSnapshot(JSON.stringify(snap));
    expect(lido.congregacao.totais.oferta).toBe(50);
    expect(lido.licoesAbertas).toBe(1);
    expect(c.lerSnapshot("{quebrado")).toBeNull();
    expect(c.lerSnapshot("{}")).toBeNull();
  });
});

describe("importação de cadernetas antigas — valores e datas", () => {
  test("converterDataImportacao aceita AAAA-MM-DD e DD/MM/AAAA e recusa data impossível", () => {
    expect(c.converterDataImportacao("2026-09-20")).toBe("2026-09-20");
    expect(c.converterDataImportacao("20/9/2026")).toBe("2026-09-20");
    expect(c.converterDataImportacao("31/02/2026")).toBeNull();
    expect(c.converterDataImportacao("ontem")).toBeNull();
  });

  test("converterValorMonetario entende formato brasileiro e recusa ambiguidade", () => {
    expect(c.converterValorMonetario("1.234,56")).toBe(1234.56);
    expect(c.converterValorMonetario("12,50")).toBe(12.5);
    expect(c.converterValorMonetario("12.50")).toBe(12.5);
    expect(c.converterValorMonetario("R$ 30")).toBe(30);
    expect(c.converterValorMonetario("")).toBeNull();
    expect(Number.isNaN(c.converterValorMonetario("abc"))).toBe(true);
    expect(Number.isNaN(c.converterValorMonetario("1,234.56"))).toBe(true);
  });

  test("cabeçalhos com apelidos, acento e maiúscula viram colunas canônicas", () => {
    expect(c.canonicoDoCabecalho("Igreja")).toBe("congregacao");
    expect(c.canonicoDoCabecalho(" DOMINGO ")).toBe("data");
    expect(c.canonicoDoCabecalho("Bíblias")).toBe("biblias");
    expect(c.canonicoDoCabecalho("Classe")).toBe("turma");
    expect(c.canonicoDoCabecalho("observações")).toBeNull();
  });
});

describe("lerCsv", () => {
  test("detecta ponto-e-vírgula, ignora BOM/CRLF e linhas em branco", () => {
    const r = c.lerCsv("﻿a;b;c\r\n1;2;3\r\n\r\n4;5;6\r\n");
    expect(r.map(x => x.campos)).toEqual([["a", "b", "c"], ["1", "2", "3"], ["4", "5", "6"]]);
    expect(r[2].numero).toBe(4);
  });

  test("aspas protegem o delimitador e '\"\"' vira aspas literais", () => {
    const r = c.lerCsv('nome,obs\n"Silva, João","disse ""oi"""\n');
    expect(r[1].campos).toEqual(["Silva, João", 'disse "oi"']);
  });

  test("detecta vírgula e tabulação", () => {
    expect(c.lerCsv("a,b\n1,2")[1].campos).toEqual(["1", "2"]);
    expect(c.lerCsv("a\tb\n1\t2")[1].campos).toEqual(["1", "2"]);
  });
});

describe("lerCsvImportacao", () => {
  const HOJE = "2026-09-30";
  const cabecalho = "Igreja;Domingo;Classe;Matriculados;Presentes;Ausentes;Visitantes;Bíblias;Revistas;Oferta";

  test("linha válida sai normalizada (ausentes e oferta em formato brasileiro)", () => {
    const r = c.lerCsvImportacao(`${cabecalho}\nSede;20/09/2026;Adultos;20;15;5;3;10;12;1.234,50`, HOJE);
    expect(r.erroGeral).toBeNull();
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].valido).toBe(true);
    expect(r.itens[0].linha).toEqual({
      congregacao: "Sede", turma: "Adultos", data: "2026-09-20", matriculados: 20, presentes: 15, ausentes: 5,
      visitantes: 3, biblias: 10, revistas: 12, oferta: 1234.5
    });
    expect(r.itens[0].numero).toBe(2);
  });

  test("ausentes em branco é calculado; visitantes/Bíblias/Revistas/oferta em branco são opcionais", () => {
    const r = c.lerCsvImportacao("congregacao;data;turma;matriculados;presentes\nSede;2026-09-20;Adultos;20;15", HOJE);
    expect(r.itens[0].valido).toBe(true);
    expect(r.itens[0].linha.ausentes).toBe(5);
    expect(r.itens[0].linha.visitantes).toBe(0);
    expect(r.itens[0].linha.biblias).toBeNull();
    expect(r.itens[0].linha.oferta).toBeNull();
  });

  test("erros de linha: presentes > matriculados, soma que não fecha, data futura, número ilegível", () => {
    const r = c.lerCsvImportacao([
      cabecalho,
      "Sede;2026-09-20;A;10;12;;0;;;",
      "Sede;2026-09-20;B;10;6;3;0;;;",
      "Sede;2026-12-20;C;10;6;4;0;;;",
      "Sede;2026-09-20;D;dez;6;4;0;;;"
    ].join("\n"), HOJE);
    expect(r.itens.map(i => i.valido)).toEqual([false, false, false, false]);
    expect(r.itens[0].erros.join(" ")).toMatch(/Presentes \(12\) maior que matriculados \(10\)/);
    expect(r.itens[1].erros.join(" ")).toMatch(/Presentes \+ ausentes \(9\) diferente de matriculados \(10\)/);
    expect(r.itens[2].erros.join(" ")).toMatch(/futura/);
    expect(r.itens[3].erros.join(" ")).toMatch(/Matriculados: "dez"/);
  });

  test("data que não é domingo vira aviso, não erro", () => {
    const r = c.lerCsvImportacao(`${cabecalho}\nSede;2026-09-21;Adultos;10;5;5;0;;;`, HOJE);
    expect(r.itens[0].valido).toBe(true);
    expect(r.itens[0].avisos.join(" ")).toMatch(/não cai num domingo/);
  });

  test("Bíblias acima dos frequentes é aviso", () => {
    const r = c.lerCsvImportacao(`${cabecalho}\nSede;2026-09-20;Adultos;10;5;5;1;20;;`, HOJE);
    expect(r.itens[0].valido).toBe(true);
    expect(r.itens[0].avisos.join(" ")).toMatch(/Bíblias \(20\) acima/);
  });

  test("erros de arquivo: cabeçalho sem coluna obrigatória, arquivo sem dados", () => {
    expect(c.lerCsvImportacao("Igreja;Domingo\nSede;2026-09-20", HOJE).erroGeral).toMatch(/turma, matriculados, presentes/);
    expect(c.lerCsvImportacao(cabecalho, HOJE).erroGeral).toMatch(/cabeçalho e de ao menos uma linha/);
    expect(c.lerCsvImportacao("", HOJE).erroGeral).toBeTruthy();
  });

  test("limite de linhas por arquivo", () => {
    const linhas = [cabecalho];
    for (let i = 0; i < c.LIMITE_LINHAS_IMPORTACAO + 1; i++) linhas.push("Sede;2026-09-20;Adultos;10;5;5;0;;;");
    expect(c.lerCsvImportacao(linhas.join("\n"), HOJE).erroGeral).toMatch(/passa de/);
  });

  test("linhas em JSON usam as mesmas regras", () => {
    const r = c.validarLinhasImportacaoJson([
      { congregacao: "Sede", data: "2026-09-20", turma: "Adultos", matriculados: 10, presentes: 4 },
      { congregacao: "", data: "2026-09-20", turma: "Adultos", matriculados: 10, presentes: 4 }
    ], HOJE);
    expect(r.itens[0].valido).toBe(true);
    expect(r.itens[0].linha.ausentes).toBe(6);
    expect(r.itens[1].valido).toBe(false);
    expect(c.validarLinhasImportacaoJson([], HOJE).erroGeral).toBeTruthy();
  });
});
