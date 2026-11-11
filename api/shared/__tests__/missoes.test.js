// v9.4 — Missões: a regra pura (shared/missoes.js).
const mi = require("../missoes");

describe("abrangência do campo (Regimento Art. 44 §§1º e 2º)", () => {
  test("Parauapebas é Local; outra cidade do Pará é Estadual; a zona rural adjacente no Pará é Local", () => {
    expect(mi.abrangenciaDe({ pais: "Brasil", uf: "PA", cidade: "Parauapebas" })).toBe("LOCAL");
    expect(mi.abrangenciaDe({ pais: "Brasil", uf: "PA", cidade: "  PARAUAPEBAS " })).toBe("LOCAL");
    expect(mi.abrangenciaDe({ pais: "Brasil", uf: "PA", cidade: "Marabá" })).toBe("ESTADUAL");
    expect(mi.abrangenciaDe({ pais: "Brasil", uf: "PA", cidade: "Canaã dos Carajás", zonaRural: true })).toBe("LOCAL");
    expect(mi.abrangenciaDe({ pais: "Brasil", uf: "PA", cidade: "canaa dos carajas", zonaRural: true })).toBe("LOCAL");
  });
  test("a zona rural só vale para Parauapebas e os municípios vizinhos: Belém com a marca continua Estadual (revisão de 05/11/2026)", () => {
    expect(mi.abrangenciaDe({ pais: "Brasil", uf: "PA", cidade: "Belém", zonaRural: true })).toBe("ESTADUAL");
    expect(mi.validarCampo({ nome: "Campo Belém", uf: "PA", cidade: "Belém", zonaRural: true }).valido).toBe(false);
    expect(mi.validarCampo({ nome: "Vila Rural", uf: "PA", cidade: "Curionópolis", zonaRural: true }).dados.abrangencia).toBe("LOCAL");
    expect(mi.validarCampo({ nome: "Vila Rural", uf: "PA", cidade: "Curionópolis" }).dados.abrangencia).toBe("ESTADUAL");
  });
  test("outro Estado é Nacional; outro país é Transcultural (Brazil em inglês ainda é o Brasil)", () => {
    expect(mi.abrangenciaDe({ pais: "Brasil", uf: "MA", cidade: "Imperatriz" })).toBe("NACIONAL");
    expect(mi.abrangenciaDe({ pais: "Moçambique", cidade: "Maputo" })).toBe("TRANSCULTURAL");
    expect(mi.abrangenciaDe({ pais: "brazil", uf: "PA", cidade: "Parauapebas" })).toBe("LOCAL");
  });
  test("validarCampo calcula a abrangência e recusa a zona rural fora do Pará", () => {
    const ok = mi.validarCampo({ nome: "Frente Vila Sansão", uf: "PA", cidade: "Parauapebas", divulgacao: "publica" });
    expect(ok.valido).toBe(true);
    expect(ok.dados).toMatchObject({ pais: "Brasil", abrangencia: "LOCAL", divulgacao: "PUBLICA" });
    expect(mi.validarCampo({ nome: "X campo", uf: "MA", cidade: "Imperatriz", zonaRural: true }).valido).toBe(false);
    expect(mi.validarCampo({ nome: "X campo", pais: "Bolívia", zonaRural: true }).valido).toBe(false);
    expect(mi.validarCampo({ nome: "X campo", uf: "XX", cidade: "Lugar" }).valido).toBe(false);
    const fora = mi.validarCampo({ nome: "Campo Andino", pais: "Bolívia" });
    expect(fora.valido).toBe(true);
    expect(fora.dados).toMatchObject({ abrangencia: "TRANSCULTURAL", uf: null, cidade: null, divulgacao: "RESTRITA" });
  });
  test("mudouOLugar: o lugar muda com o país, a UF, a cidade (sem acento/maiúscula) e a zona rural; o nome e a divulgação não contam", () => {
    const a = { pais: "Brasil", uf: "PA", cidade: "Marabá", zonaRural: false };
    expect(mi.mudouOLugar(a, { ...a, cidade: "maraba" })).toBe(false);
    expect(mi.mudouOLugar(a, { ...a, cidade: "Belém" })).toBe(true);
    expect(mi.mudouOLugar(a, { ...a, uf: "MA" })).toBe(true);
    expect(mi.mudouOLugar(a, { ...a, zonaRural: true })).toBe(true);
  });
});

describe("o envio: dinheiro e etapas", () => {
  test("valorDe aceita número e texto com vírgula ou ponto, até 2 casas e até 100.000", () => {
    expect(mi.valorDe(1500)).toBe(1500);
    expect(mi.valorDe("1500,50")).toBe(1500.5);
    expect(mi.valorDe("1500.5")).toBe(1500.5);
    expect(mi.valorDe(0)).toBe(0);
    expect(mi.valorDe(-1)).toBeNull();
    expect(mi.valorDe(1.234)).toBeNull();
    expect(mi.valorDe("1.500,00")).toBeNull();
    expect(mi.valorDe(100000.01)).toBeNull();
    expect(mi.valorDe("abc")).toBeNull();
  });
  test("sem sustento, a fonte e quem recebe são ignorados; com sustento, são exigidos (e o documento)", () => {
    const sem = mi.validarEnvio({ campoId: 1, membroId: 5, sustento: 0, fonte: "GERAL", fornecedorId: 9, periodicidade: "mensal", justificativa: "Frente de evangelismo no bairro." });
    expect(sem.valido).toBe(true);
    expect(sem.dados).toMatchObject({ sustento: 0, fonte: null, fornecedorId: null, documento: null, periodicidade: "MENSAL" });
    const base = { campoId: 1, membroId: 5, sustento: 800, periodicidade: "TRIMESTRAL", justificativa: "Sustento do casal missionário no campo." };
    expect(mi.validarEnvio(base).valido).toBe(false);
    expect(mi.validarEnvio({ ...base, fonte: "GERAL" }).mensagem).toMatch(/quem recebe/);
    // o caixa local é o da mantenedora do campo (o banco a põe): não se escolhe congregação
    expect(mi.validarEnvio({ ...base, fonte: "CONGREGACAO", fornecedorId: 3, congregacaoFonteId: 7 }).mensagem).toMatch(/documento do envio/);
    expect(mi.validarEnvio({ ...base, fonte: "GERAL", fornecedorId: 3 }).mensagem).toMatch(/documento do envio/);
    expect(mi.validarEnvio({ ...base, fonte: "GERAL", fornecedorId: 3, documentoBase64: "AAAA", documentoMime: "text/html" }).valido).toBe(false);
    const ok = mi.validarEnvio({ ...base, fonte: "GERAL", fornecedorId: 3, documentoBase64: "AAAA", documentoMime: "application/pdf", divulgarNome: "true" });
    expect(ok.valido).toBe(true);
    expect(ok.dados).toMatchObject({ sustento: 800, fonte: "GERAL", fornecedorId: 3, divulgarNome: true, documento: { mime: "application/pdf" } });
  });
  test("a periodicidade é obrigatória (mensal ou trimestral)", () => {
    expect(mi.validarEnvio({ campoId: 1, membroId: 5, justificativa: "Frente de evangelismo no bairro." }).mensagem).toMatch(/periodicidade/);
    expect(mi.validarEnvio({ campoId: 1, membroId: 5, periodicidade: "ANUAL", justificativa: "Frente de evangelismo no bairro." }).valido).toBe(false);
  });
  test("etapas: Local sem sustento direto; Local com sustento a CLI e o Presidente (Trava 9-B: Estatuto Art. 58 §4º); Estadual CME+CLI; longe e convênio externo sempre o Presidente", () => {
    expect(mi.etapasDoEnvio({ abrangencia: "LOCAL", sustento: 0 })).toEqual({ cme: false, cli: false, presidente: false });
    expect(mi.etapasDoEnvio({ abrangencia: "LOCAL", sustento: 300 })).toEqual({ cme: false, cli: true, presidente: true });
    expect(mi.statusInicial(mi.etapasDoEnvio({ abrangencia: "LOCAL", sustento: 300 }))).toBe("AGUARDANDO_CLI");
    expect(mi.etapasDoEnvio({ abrangencia: "LOCAL", sustento: 300, recebedorPJ: true })).toEqual({ cme: true, cli: true, presidente: true });
    expect(mi.etapasDoEnvio({ abrangencia: "ESTADUAL", sustento: 0 })).toEqual({ cme: true, cli: true, presidente: false });
    expect(mi.etapasDoEnvio({ abrangencia: "ESTADUAL", sustento: 1 })).toEqual({ cme: true, cli: true, presidente: true });
    expect(mi.etapasDoEnvio({ abrangencia: "NACIONAL", sustento: 0 })).toEqual({ cme: true, cli: true, presidente: true });
    expect(mi.etapasDoEnvio({ abrangencia: "TRANSCULTURAL", sustento: 0 })).toEqual({ cme: true, cli: true, presidente: true });
  });
  test("o status inicial e o de depois da CLI seguem as etapas", () => {
    expect(mi.statusInicial({ cme: false, cli: false, presidente: false })).toBe("ATIVO");
    expect(mi.statusInicial({ cme: false, cli: false, presidente: true })).toBe("AGUARDANDO_PRESIDENTE");
    expect(mi.statusInicial({ cme: true, cli: true, presidente: true })).toBe("EM_PARECER");
    expect(mi.statusDepoisDaCLI({ presidente: true })).toBe("AGUARDANDO_PRESIDENTE");
    expect(mi.statusDepoisDaCLI({ presidente: false })).toBe("ATIVO");
  });
  test("a decisão da CLI: sem parecer só com urgência; com parecer, sem urgência; a reunião não é anterior ao pedido nem ao parecer", () => {
    const reuniao = { sessaoId: 3, data: "2026-11-20" };
    expect(mi.podeDecidirCLI({ status: "EM_PARECER", solicitadoEm: "2026-11-01" }, { reuniao, urgencia: false }).pode).toBe(false);
    expect(mi.podeDecidirCLI({ status: "EM_PARECER", solicitadoEm: "2026-11-01" }, { reuniao, urgencia: true }).pode).toBe(true);
    expect(mi.podeDecidirCLI({ status: "AGUARDANDO_CLI", solicitadoEm: "2026-11-01", parecerEm: "2026-11-10" }, { reuniao, urgencia: true }).pode).toBe(false);
    expect(mi.podeDecidirCLI({ status: "AGUARDANDO_CLI", solicitadoEm: "2026-11-01", parecerEm: "2026-11-25" }, { reuniao, urgencia: false }).pode).toBe(false);
    expect(mi.podeDecidirCLI({ status: "AGUARDANDO_CLI", solicitadoEm: "2026-11-21" }, { reuniao, urgencia: false }).pode).toBe(false);
    expect(mi.podeDecidirCLI({ status: "AGUARDANDO_CLI", solicitadoEm: "2026-11-01", parecerEm: "2026-11-10" }, { reuniao, urgencia: false }).pode).toBe(true);
    expect(mi.podeDecidirCLI({ status: "AGUARDANDO_PRESIDENTE", solicitadoEm: "2026-11-01" }, { reuniao, urgencia: false }).pode).toBe(false);
  });
  test("o Presidente: a recusa exige o motivo", () => {
    expect(mi.validarPresidente({ resultado: "concorda" })).toEqual({ valido: true, dados: { resultado: "CONCORDA", motivo: null } });
    expect(mi.validarPresidente({ resultado: "RECUSA" }).valido).toBe(false);
    expect(mi.validarPresidente({ resultado: "RECUSA", motivo: "Sem recurso agora." }).valido).toBe(true);
    expect(mi.validarPresidente({ resultado: "TALVEZ" }).valido).toBe(false);
  });
  test("o parecer vence 15 dias depois do pedido", () => {
    expect(mi.parecerVencido({ status: "EM_PARECER", solicitadoEm: "2026-11-01" }, "2026-11-16")).toBe(false);
    expect(mi.parecerVencido({ status: "EM_PARECER", solicitadoEm: "2026-11-01" }, "2026-11-17")).toBe(true);
    expect(mi.parecerVencido({ status: "AGUARDANDO_CLI", solicitadoEm: "2026-11-01" }, "2026-12-30")).toBe(false);
  });
});

describe("os períodos do relatório e a suspensão (Art. 133-C §2º)", () => {
  test("meses: somar, subtrair e contar atravessam o ano", () => {
    expect(mi.somarMeses("2026-11", 3)).toBe("2027-02");
    expect(mi.somarMeses("2026-01", -1)).toBe("2025-12");
    expect(mi.mesesEntre("2026-11", "2027-02")).toBe(3);
  });
  test("mensal: um período por mês, desde o início, vencendo no dia 10 do mês seguinte", () => {
    const p = mi.periodosDoEnvio({ inicioMes: "2026-09", fimMes: null, periodicidade: "MENSAL" }, "2026-11-05");
    expect(p).toEqual([
      { inicio: "2026-09", fim: "2026-09", prazo: "2026-10-10" },
      { inicio: "2026-10", fim: "2026-10", prazo: "2026-11-10" },
      { inicio: "2026-11", fim: "2026-11", prazo: "2026-12-10" }
    ]);
  });
  test("trimestral: o período tem 3 meses e vence no dia 10 depois do terceiro; o envio encerrado no meio corta o último", () => {
    const p = mi.periodosDoEnvio({ inicioMes: "2026-05", fimMes: null, periodicidade: "TRIMESTRAL" }, "2026-11-05");
    expect(p.map((x) => [x.inicio, x.fim, x.prazo])).toEqual([["2026-05", "2026-07", "2026-08-10"], ["2026-08", "2026-10", "2026-11-10"], ["2026-11", "2027-01", "2027-02-10"]]);
    const fim = mi.periodosDoEnvio({ inicioMes: "2026-05", fimMes: "2026-09", periodicidade: "TRIMESTRAL" }, "2026-11-05");
    expect(fim.map((x) => [x.inicio, x.fim, x.prazo])).toEqual([["2026-05", "2026-07", "2026-08-10"], ["2026-08", "2026-09", "2026-10-10"]]);
  });
  test("o envio encerrado antes de começar (último mês = o anterior ao início) não tem período", () => {
    expect(mi.periodosDoEnvio({ inicioMes: "2026-11", fimMes: "2026-10", periodicidade: "MENSAL" }, "2026-11-20")).toEqual([]);
  });
  test("vencido sem relatório suspende; o relatório entregue levanta; o período dentro do prazo não suspende", () => {
    const envio = { inicioMes: "2026-09", fimMes: null, periodicidade: "MENSAL" };
    const s1 = mi.situacaoRelatorios(envio, [], "2026-11-05");
    expect(s1.vencidos.map((p) => p.inicio)).toEqual(["2026-09"]);
    expect(s1.suspenso).toBe(true);
    expect(mi.situacaoRelatorios(envio, ["2026-09"], "2026-11-05").suspenso).toBe(false);
    expect(mi.situacaoRelatorios(envio, new Set(["2026-09"]), "2026-11-11").vencidos.map((p) => p.inicio)).toEqual(["2026-10"]);
    expect(mi.situacaoRelatorios(envio, ["2026-09"], "2026-11-10").suspenso).toBe(false);
  });
  test("o envio encerrado pela vacância: o relatório ainda no prazo no dia da vacância fica dispensado, não vence nem suspende", () => {
    const s = mi.situacaoRelatorios({ inicioMes: "2026-09", fimMes: "2026-10", periodicidade: "MENSAL", encerradoPorVacancia: true, encerradoEm: "2026-10-05" }, [], "2026-12-20");
    expect(s.vencidos).toEqual([]);
    expect(s.suspenso).toBe(false);
    expect(s.periodos.every((p) => p.dispensado)).toBe(true);
  });
  test("Trava 9-B: o relatório que já tinha vencido ANTES da vacância continua vencido (a vacância não libera os meses suspensos)", () => {
    // julho a outubro sem relatório; a vacância em 20/11: os prazos de julho (10/08) a setembro (10/10) e outubro (10/11) já tinham passado; novembro (10/12) não
    const envio = { inicioMes: "2026-07", fimMes: "2026-11", periodicidade: "MENSAL", encerradoPorVacancia: true, encerradoEm: "2026-11-20" };
    const s = mi.situacaoRelatorios(envio, [], "2026-12-20");
    expect(s.vencidos.map((p) => p.inicio)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(s.periodos.filter((p) => p.dispensado).map((p) => p.inicio)).toEqual(["2026-11"]);
    expect(s.suspenso).toBe(true);
    // entregues os quatro, nada fica suspenso
    expect(mi.situacaoRelatorios(envio, ["2026-07", "2026-08", "2026-09", "2026-10"], "2026-12-20").suspenso).toBe(false);
    // o prazo que vence no próprio dia da vacância ainda estava no prazo: dispensado
    const noDia = mi.situacaoRelatorios({ ...envio, encerradoEm: "2026-11-10" }, ["2026-07", "2026-08", "2026-09"], "2026-12-20");
    expect(noDia.periodos.find((p) => p.inicio === "2026-10").dispensado).toBe(true);
    // sem a data da vacância (não deveria acontecer), nada é dispensado: o dinheiro fica do lado seguro
    expect(mi.situacaoRelatorios({ ...envio, encerradoEm: null }, [], "2026-12-20").periodos.some((p) => p.dispensado)).toBe(false);
  });
  test("o fundamento do Presidente pelo caso: Art. 44 §2º (longe ou convênio), Art. 134 §6º, I (sustento)", () => {
    expect(mi.fundamentoPresidente({ abrangencia: "LOCAL", sustento: 300 })).toBe("Regimento, Art. 134 §6º, I");
    expect(mi.fundamentoPresidente({ abrangencia: "NACIONAL", sustento: 0 })).toBe("Regimento, Art. 44 §2º");
    expect(mi.fundamentoPresidente({ abrangencia: "TRANSCULTURAL", sustento: 10 })).toBe("Regimento, Art. 44 §2º e Art. 134 §6º, I");
    expect(mi.textoRelatorioAtrasado({ missionario: "Ana", campo: "X", periodo: { inicio: "2026-09", fim: "2026-09" }, prazo: "2026-10-10", hoje: "2026-10-12", suspende: false })).not.toMatch(/suspenso/);
  });
  test("periodoDoMes encontra o início do período de um mês", () => {
    expect(mi.periodoDoMes("2026-05", "TRIMESTRAL", "2026-09")).toBe("2026-08");
    expect(mi.periodoDoMes("2026-05", "MENSAL", "2026-09")).toBe("2026-09");
  });
  test("validarRelatorio: só um período do envio que já começou; números inteiros; atividades obrigatórias", () => {
    const envio = { inicioMes: "2026-09", fimMes: null, periodicidade: "MENSAL" };
    const ok = mi.validarRelatorio({ periodoInicio: "2026-10", batismos: "3", conversoes: 7, discipulado: 0, atividades: "Cultos nas casas e evangelismo." }, envio, "2026-11-05");
    expect(ok.valido).toBe(true);
    expect(ok.dados).toMatchObject({ periodoInicio: "2026-10", batismos: 3, conversoes: 7, discipulado: 0, pedidos: null, anexo: null });
    expect(mi.validarRelatorio({ periodoInicio: "2026-12", atividades: "Cultos nas casas e evangelismo." }, envio, "2026-11-05").valido).toBe(false);
    expect(mi.validarRelatorio({ periodoInicio: "2026-08", atividades: "Cultos nas casas e evangelismo." }, envio, "2026-11-05").valido).toBe(false);
    expect(mi.validarRelatorio({ periodoInicio: "2026-10", batismos: -1, atividades: "Cultos nas casas e evangelismo." }, envio, "2026-11-05").valido).toBe(false);
    expect(mi.validarRelatorio({ periodoInicio: "2026-10", batismos: 1.5, atividades: "Cultos nas casas e evangelismo." }, envio, "2026-11-05").valido).toBe(false);
    expect(mi.validarRelatorio({ periodoInicio: "2026-10", atividades: "curto" }, envio, "2026-11-05").valido).toBe(false);
    expect(mi.validarRelatorio({ periodoInicio: "2026-10", atividades: "Cultos nas casas e evangelismo.", anexoBase64: "AA", anexoMime: "image/gif" }, envio, "2026-11-05").valido).toBe(false);
    const tri = { inicioMes: "2026-05", fimMes: null, periodicidade: "TRIMESTRAL" };
    expect(mi.validarRelatorio({ periodoInicio: "2026-06", atividades: "Cultos nas casas e evangelismo." }, tri, "2026-11-05").valido).toBe(false);
    expect(mi.validarRelatorio({ periodoInicio: "2026-08", atividades: "Cultos nas casas e evangelismo." }, tri, "2026-11-05").valido).toBe(true);
  });
});

describe("sustento: geração, reajuste e encerramento", () => {
  test("a geração é do mês de hoje ou de antes, nunca de um mês que não começou", () => {
    expect(mi.validarGeracao({}, "2026-11-05")).toEqual({ valido: true, dados: { mesReferencia: "2026-11" } });
    expect(mi.validarGeracao({ mesReferencia: "2026-10" }, "2026-11-05").valido).toBe(true);
    expect(mi.validarGeracao({ mesReferencia: "2026-12" }, "2026-11-05").valido).toBe(false);
    expect(mi.validarGeracao({ mesReferencia: "2026-13" }, "2026-11-05").valido).toBe(false);
  });
  test("o reajuste vale do mês de hoje em diante, depois do último gerado, com o motivo", () => {
    const base = { desdeMes: "2026-12", sustento: 900, fonte: "GERAL", fornecedorId: 3, motivo: "Custo de vida no campo." };
    expect(mi.validarReajuste(base, { inicioMes: "2026-09", ultimoGerado: "2026-11", hoje: "2026-11-05" }).valido).toBe(true);
    expect(mi.validarReajuste({ ...base, desdeMes: "2026-10" }, { inicioMes: "2026-09", ultimoGerado: null, hoje: "2026-11-05" }).valido).toBe(false);
    expect(mi.validarReajuste({ ...base, desdeMes: "2026-11" }, { inicioMes: "2026-09", ultimoGerado: "2026-11", hoje: "2026-11-05" }).valido).toBe(false);
    expect(mi.validarReajuste({ ...base, motivo: "" }, { inicioMes: "2026-09", ultimoGerado: null, hoje: "2026-11-05" }).valido).toBe(false);
    const zero = mi.validarReajuste({ desdeMes: "2026-12", sustento: 0, motivo: "Fim do sustento." }, { inicioMes: "2026-09", ultimoGerado: null, hoje: "2026-11-05" });
    expect(zero.valido).toBe(true);
    expect(zero.dados).toMatchObject({ sustento: 0, fonte: null, fornecedorId: null, sessaoId: null });
    expect(mi.validarReajuste({ ...base, sessaoId: "7" }, { inicioMes: "2026-09", ultimoGerado: null, hoje: "2026-11-05" }).dados.sessaoId).toBe(7);
    expect(mi.validarReajuste({ ...base, sessaoId: "x" }, { inicioMes: "2026-09", ultimoGerado: null, hoje: "2026-11-05" }).valido).toBe(false);
    expect(mi.validarReajuste({ ...base, sessaoId: -2 }, { inicioMes: "2026-09", ultimoGerado: null, hoje: "2026-11-05" }).valido).toBe(false);
  });
  test("Trava 9-B: o aumento do sustento pede a reunião da CLI (Estatuto Art. 58 §4º); a redução e o mesmo valor não", () => {
    const reuniao = { sessaoId: 7, data: "2026-11-03" };
    const ctx = { ativadoEm: "2026-09-02", hoje: "2026-11-05" };
    expect(mi.problemaDaCLIdoAumento({ novo: 900, vigente: 800, reuniao: null, ...ctx })).toMatch(/Art\. 58 §4º/);
    expect(mi.problemaDaCLIdoAumento({ novo: 900, vigente: 800, reuniao, ...ctx })).toBeNull();
    expect(mi.problemaDaCLIdoAumento({ novo: 700, vigente: 800, reuniao: null, ...ctx })).toBeNull();
    expect(mi.problemaDaCLIdoAumento({ novo: 800, vigente: 800, reuniao: null, ...ctx })).toBeNull();
    expect(mi.problemaDaCLIdoAumento({ novo: 300, vigente: 0, reuniao: null, ...ctx })).toMatch(/CLI/);
    expect(mi.problemaDaCLIdoAumento({ novo: 300, vigente: null, reuniao: null, ...ctx })).toMatch(/CLI/);
    expect(mi.problemaDaCLIdoAumento({ novo: 900, vigente: 800, reuniao: { sessaoId: 1, data: "2026-08-30" }, ...ctx })).toMatch(/anterior à ativação/);
    expect(mi.problemaDaCLIdoAumento({ novo: 900, vigente: 800, reuniao: { sessaoId: 1, data: "2026-11-06" }, ...ctx })).toMatch(/já ter acontecido/);
    expect(mi.problemaDaCLIdoAumento({ novo: 900, vigente: 800, reuniao: { sessaoId: 1, data: "2026-09-02" }, ...ctx })).toBeNull();
  });
  test("o encerramento: o último mês não antes do gerado, não depois de hoje; o anterior ao início = sem sustento", () => {
    const ctx = { inicioMes: "2026-09", ultimoGerado: "2026-10", hoje: "2026-11-05" };
    expect(mi.validarEncerramentoEnvio({ motivo: "Retorno do campo.", ultimoMes: "2026-11" }, ctx).valido).toBe(true);
    expect(mi.validarEncerramentoEnvio({ motivo: "Retorno do campo.", ultimoMes: "2026-10" }, ctx).valido).toBe(true);
    expect(mi.validarEncerramentoEnvio({ motivo: "Retorno do campo.", ultimoMes: "2026-09" }, ctx).valido).toBe(false);
    expect(mi.validarEncerramentoEnvio({ motivo: "Retorno do campo.", ultimoMes: "2026-12" }, ctx).valido).toBe(false);
    expect(mi.validarEncerramentoEnvio({ motivo: "Retorno do campo.", ultimoMes: "2026-08" }, { ...ctx, ultimoGerado: null }).valido).toBe(true);
    expect(mi.validarEncerramentoEnvio({ motivo: "Retorno do campo.", ultimoMes: "2026-07" }, { ...ctx, ultimoGerado: null }).valido).toBe(false);
    expect(mi.validarEncerramentoEnvio({ motivo: "x", ultimoMes: "2026-11" }, ctx).valido).toBe(false);
  });
  test("a referência do aviso de um período cabe num INT e não repete entre envios e meses", () => {
    const a = mi.referenciaPeriodo("2026-11", 7), b = mi.referenciaPeriodo("2026-12", 7), c = mi.referenciaPeriodo("2026-11", 8);
    expect(new Set([a, b, c]).size).toBe(3);
    expect(mi.referenciaPeriodo("2099-12", 99999)).toBeLessThanOrEqual(2147483647);
  });
  test("os textos dos avisos dizem o missionário, o campo e o atraso", () => {
    expect(mi.textoRelatorioAtrasado({ missionario: "Ana", campo: "Maputo", periodo: { inicio: "2026-09", fim: "2026-09" }, prazo: "2026-10-10", hoje: "2026-10-12" }))
      .toMatch(/Ana \(Maputo\).*09\/2026.*10\/10\/2026 \(2 dias de atraso\).*suspenso/);
    expect(mi.textoDecidido({ missionario: "Ana", campo: "Maputo", ativo: false, recusadoPor: "PRESIDENTE", motivo: "Sem recurso." })).toMatch(/pelo Pastor Presidente\. Motivo: Sem recurso\./);
  });
});
