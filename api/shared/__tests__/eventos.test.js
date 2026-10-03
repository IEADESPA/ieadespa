// Testes da v7.4 (Eventos e Congressos) — lógica pura de shared/eventos.js:
// Protocolo de Convidados (Regimento Art. 111 e 111-A) e Caixa Flutuante de Eventos (Art. 53-E §2º e §3º).
const e = require("../eventos");

describe("dinheiro em centavos", () => {
  test("aceita vírgula e ponto, sem erro de ponto flutuante", () => {
    expect(e.centavos("10,50")).toBe(1050);
    expect(e.centavos(10.5)).toBe(1050);
    expect(e.centavos("0.1") + e.centavos("0.2")).toBe(30); // 0.1 + 0.2 em float seria 0.30000000000000004
    expect(e.reais(1050)).toBe(10.5);
  });
  test("recusa o que não é número", () => {
    expect(Number.isNaN(e.centavos("abc"))).toBe(true);
    expect(Number.isNaN(e.centavos(undefined))).toBe(true);
  });
  test("formata em reais", () => {
    expect(e.formatarReais(123456)).toMatch(/1\.234,56/);
  });
});

describe("registro de convidado", () => {
  const base = { nome: "Pr. Fulano de Tal", tipo: "preletor", reputacaoConhecida: true };

  test("válido: tipo em maiúsculas, divulgação só quando literalmente verdadeira", () => {
    const r = e.validarConvidado({ ...base, divulgacaoAutorizada: "sim" });
    expect(r.valido).toBe(true);
    expect(r.dados).toMatchObject({ nome: "Pr. Fulano de Tal", tipo: "PRELETOR", reputacaoConhecida: true, divulgacaoAutorizada: false });
    expect(e.validarConvidado({ ...base, divulgacaoAutorizada: true }).dados.divulgacaoAutorizada).toBe(true);
  });

  test("a reputação precisa ser declarada (sim ou não) — é ela que decide a consulta à Ética", () => {
    for (const valor of [undefined, null, "true", 1, "sim"]) {
      const r = e.validarConvidado({ ...base, reputacaoConhecida: valor });
      expect(r.valido).toBe(false);
      expect(r.mensagem).toMatch(/reputação/);
    }
  });

  test("reputação desconhecida exige a igreja ou ministério de origem para o Conselho verificar", () => {
    expect(e.validarConvidado({ ...base, reputacaoConhecida: false }).valido).toBe(false);
    expect(e.validarConvidado({ ...base, reputacaoConhecida: false, ministerioOrigem: "AD Belém" }).valido).toBe(true);
  });

  test("limites de tamanho e tipo inválido", () => {
    expect(e.validarConvidado({ ...base, nome: "ab" }).valido).toBe(false);
    expect(e.validarConvidado({ ...base, tipo: "palhaço" }).valido).toBe(false);
    expect(e.validarConvidado({ ...base, contato: "x".repeat(151) }).valido).toBe(false);
    expect(e.validarConvidado({ ...base, observacaoOrganizador: "x".repeat(501) }).valido).toBe(false);
  });
});

describe("o que o convite exige", () => {
  test("Ética: só quando a reputação é desconhecida; Nada Consta: eventos de Nível 1 e 2", () => {
    expect(e.exigenciasDoConvite({ reputacaoConhecida: true }, { nivel: 4 })).toEqual({ exigeEtica: false, exigeNadaConsta: false });
    expect(e.exigenciasDoConvite({ reputacaoConhecida: false }, { nivel: 4 })).toEqual({ exigeEtica: true, exigeNadaConsta: false });
    expect(e.exigenciasDoConvite({ reputacaoConhecida: true }, { nivel: 1 })).toEqual({ exigeEtica: false, exigeNadaConsta: true });
    expect(e.exigenciasDoConvite({ reputacaoConhecida: true }, { nivel: 2 }).exigeNadaConsta).toBe(true);
    expect(e.exigenciasDoConvite({ reputacaoConhecida: true }, { nivel: 3 }).exigeNadaConsta).toBe(false);
    expect(e.exigenciasDoConvite({ reputacaoConhecida: false }, { nivel: 1 })).toEqual({ exigeEtica: true, exigeNadaConsta: true });
  });
});

describe("enviar o convite à análise — a antecedência de 10 dias (Art. 111)", () => {
  const evento = (extra = {}) => ({ status: "HOMOLOGADO", nivel: 4, dataInicio: "2026-10-20", ...extra });
  const hoje = "2026-10-10";

  test("reputação desconhecida: exatamente 10 dias de antecedência ainda vale; 9 não", () => {
    expect(e.avaliarSubmissao({ reputacaoConhecida: false }, evento({ dataInicio: "2026-10-20" }), { hoje })).toMatchObject({ ok: true, exigeEtica: true, diasAteEvento: 10, prazoParecerEtica: "2026-10-10" });
    const r = e.avaliarSubmissao({ reputacaoConhecida: false }, evento({ dataInicio: "2026-10-19" }), { hoje });
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/10 dias de antecedência/);
    expect(r.mensagem).toMatch(/daqui a 9 dia/);
  });

  test("reputação conhecida não depende da antecedência (só não pode ser depois do evento começar)", () => {
    expect(e.avaliarSubmissao({ reputacaoConhecida: true }, evento({ dataInicio: "2026-10-11" }), { hoje }).ok).toBe(true);
    expect(e.avaliarSubmissao({ reputacaoConhecida: true }, evento({ dataInicio: "2026-10-10" }), { hoje }).ok).toBe(true);
    expect(e.avaliarSubmissao({ reputacaoConhecida: true }, evento({ dataInicio: "2026-10-09" }), { hoje }).ok).toBe(false);
  });

  test("a antecedência é parâmetro (a CLI pode mudar) e evento fora da pauta não recebe convite", () => {
    expect(e.avaliarSubmissao({ reputacaoConhecida: false }, evento({ dataInicio: "2026-10-15" }), { hoje, antecedenciaDias: 5 }).ok).toBe(true);
    for (const status of ["CANCELADO", "INDEFERIDO", "ABSORVIDO"]) {
      expect(e.avaliarSubmissao({ reputacaoConhecida: true }, evento({ status }), { hoje }).ok).toBe(false);
    }
  });
});

describe("o estado do convite depois de cada decisão", () => {
  const conv = (extra = {}) => ({ status: "EM_ANALISE", exigeEtica: false, exigeNadaConsta: false, eticaParecer: null, nadaConsta: null, ...extra });

  test("nada exigido: autorizado de imediato", () => {
    expect(e.statusDoConvite(conv())).toBe("AUTORIZADO");
  });
  test("só é AUTORIZADO quando TODO parecer exigido é favorável", () => {
    expect(e.statusDoConvite(conv({ exigeEtica: true }))).toBe("EM_ANALISE");
    expect(e.statusDoConvite(conv({ exigeEtica: true, eticaParecer: "FAVORAVEL" }))).toBe("AUTORIZADO");
    expect(e.statusDoConvite(conv({ exigeEtica: true, exigeNadaConsta: true, eticaParecer: "FAVORAVEL" }))).toBe("EM_ANALISE");
    expect(e.statusDoConvite(conv({ exigeEtica: true, exigeNadaConsta: true, eticaParecer: "FAVORAVEL", nadaConsta: "CONCEDIDO" }))).toBe("AUTORIZADO");
  });
  test("uma negativa veta na hora, mesmo faltando a outra decisão", () => {
    expect(e.statusDoConvite(conv({ exigeEtica: true, exigeNadaConsta: true, eticaParecer: "DESFAVORAVEL" }))).toBe("VETADO");
    expect(e.statusDoConvite(conv({ exigeNadaConsta: true, nadaConsta: "NEGADO" }))).toBe("VETADO");
  });
  test("o Nada Consta concedido não substitui o parecer de Ética exigido", () => {
    expect(e.statusDoConvite(conv({ exigeEtica: true, exigeNadaConsta: true, nadaConsta: "CONCEDIDO" }))).toBe("EM_ANALISE");
  });
  test("cancelado continua cancelado", () => {
    expect(e.statusDoConvite(conv({ status: "CANCELADO" }))).toBe("CANCELADO");
  });
});

describe("pareceres e divulgação (Art. 111-A, §2º)", () => {
  test("parecer da Ética: contrário exige motivo; favorável não", () => {
    expect(e.validarParecerEtica({ parecer: "favoravel" })).toMatchObject({ valido: true, valor: "FAVORAVEL", motivo: null });
    expect(e.validarParecerEtica({ parecer: "DESFAVORAVEL", motivo: "curto" }).valido).toBe(false);
    expect(e.validarParecerEtica({ parecer: "DESFAVORAVEL", motivo: "Desvio doutrinário documentado" })).toMatchObject({ valido: true, valor: "DESFAVORAVEL" });
    expect(e.validarParecerEtica({ parecer: "TALVEZ" }).valido).toBe(false);
  });
  test("Nada Consta: negado exige motivo", () => {
    expect(e.validarNadaConsta({ decisao: "CONCEDIDO" }).valido).toBe(true);
    expect(e.validarNadaConsta({ decisao: "NEGADO" }).valido).toBe(false);
    expect(e.validarNadaConsta({ decisao: "NEGADO", motivo: "Sem alinhamento doutrinário" }).valido).toBe(true);
    expect(e.validarNadaConsta({ decisao: "parecer" }).valido).toBe(false);
  });
  test("só o AUTORIZADO se oficializa; só o oficializado COM consentimento é divulgado", () => {
    expect(e.podeOficializar({ status: "AUTORIZADO", oficializadoEm: null })).toBe(true);
    expect(e.podeOficializar({ status: "EM_ANALISE", oficializadoEm: null })).toBe(false);
    expect(e.podeOficializar({ status: "VETADO", oficializadoEm: null })).toBe(false);
    expect(e.podeOficializar({ status: "AUTORIZADO", oficializadoEm: "2026-10-01" })).toBe(false);
    expect(e.ehDivulgavel({ status: "AUTORIZADO", oficializadoEm: "2026-10-01", divulgacaoAutorizada: true })).toBe(true);
    expect(e.ehDivulgavel({ status: "AUTORIZADO", oficializadoEm: "2026-10-01", divulgacaoAutorizada: false })).toBe(false);
    expect(e.ehDivulgavel({ status: "AUTORIZADO", oficializadoEm: null, divulgacaoAutorizada: true })).toBe(false);
    expect(e.ehDivulgavel({ status: "CANCELADO", oficializadoEm: "2026-10-01", divulgacaoAutorizada: true })).toBe(false);
  });
});

describe("abertura do Caixa Flutuante (Art. 53-E)", () => {
  const evento = (extra = {}) => ({ status: "HOMOLOGADO", abrangencia: "CAMPO", ...extra });
  test("evento de Área, Região ou Geral, decidido, com a declaração de que não há conta paralela", () => {
    expect(e.avaliarAberturaDeCaixa(evento(), true).ok).toBe(true);
    expect(e.avaliarAberturaDeCaixa(evento({ abrangencia: "AREAS", status: "DEFERIDO" }), true).ok).toBe(true);
  });
  test("evento de congregação usa a tesouraria local", () => {
    const r = e.avaliarAberturaDeCaixa(evento({ abrangencia: "CONGREGACAO" }), true);
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/tesouraria da própria congregação/);
  });
  test("sem a declaração (literalmente true) não abre; evento ainda proposto ou cancelado também não", () => {
    expect(e.avaliarAberturaDeCaixa(evento(), false).mensagem).toMatch(/conta bancária/);
    expect(e.avaliarAberturaDeCaixa(evento(), "true").ok).toBe(false);
    expect(e.avaliarAberturaDeCaixa(evento({ status: "PROPOSTO" }), true).ok).toBe(false);
    expect(e.avaliarAberturaDeCaixa(evento({ status: "CANCELADO" }), true).ok).toBe(false);
  });
});

describe("lançamentos do caixa", () => {
  const ctx = { eventoInicio: "2026-10-20", hoje: "2026-10-25" };
  const entrada = { tipo: "entrada", categoria: "oferta_voluntaria", valor: "150,25", dataLancamento: "2026-10-20", descricao: "Oferta voluntária do culto de abertura" };
  const saida = { tipo: "SAIDA", categoria: "ALIMENTACAO", valor: 80, dataLancamento: "2026-10-19", descricao: "Lanche da equipe", comprovante: "NF 1234" };

  test("entrada e saída válidas saem normalizadas", () => {
    expect(e.validarLancamento(entrada, ctx).dados).toMatchObject({ tipo: "ENTRADA", categoria: "OFERTA_VOLUNTARIA", valor: 150.25, centavos: 15025, comprovante: null });
    expect(e.validarLancamento(saida, ctx).dados).toMatchObject({ tipo: "SAIDA", centavos: 8000, comprovante: "NF 1234" });
  });
  test("a categoria tem de ser do tipo (oferta não é saída)", () => {
    expect(e.validarLancamento({ ...entrada, categoria: "ALIMENTACAO" }, ctx).valido).toBe(false);
    expect(e.validarLancamento({ ...saida, categoria: "OFERTA_VOLUNTARIA" }, ctx).valido).toBe(false);
  });
  test("TODA saída tem comprovante (Art. 152, I)", () => {
    const r = e.validarLancamento({ ...saida, comprovante: "" }, ctx);
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/comprovante/);
    expect(e.validarLancamento({ ...saida, comprovante: "ab" }, ctx).valido).toBe(false);
  });
  test("valor: positivo, no máximo duas casas, dentro do limite", () => {
    for (const valor of [0, -5, "abc", "10,555", 1e10]) expect(e.validarLancamento({ ...entrada, valor }, ctx).valido).toBe(false);
    expect(e.validarLancamento({ ...entrada, valor: "0,01" }, ctx).valido).toBe(true);
  });
  test("data: válida, não futura e não mais de 90 dias antes do evento", () => {
    expect(e.validarLancamento({ ...entrada, dataLancamento: "2026-10-26" }, ctx).mensagem).toMatch(/futuro/);
    expect(e.validarLancamento({ ...entrada, dataLancamento: "2026-02-30" }, ctx).mensagem).toMatch(/inválida/);
    expect(e.validarLancamento({ ...entrada, dataLancamento: "2026-07-01" }, ctx).mensagem).toMatch(/90 dias/);
    expect(e.validarLancamento({ ...entrada, dataLancamento: "2026-07-22" }, ctx).valido).toBe(true);
    expect(e.validarLancamento({ ...entrada, dataLancamento: undefined }, ctx).dados.dataLancamento).toBe("2026-10-25");
  });
  test("descrição obrigatória e tipo inválido", () => {
    expect(e.validarLancamento({ ...entrada, descricao: "ab" }, ctx).valido).toBe(false);
    expect(e.validarLancamento({ ...entrada, tipo: "TROCO" }, ctx).valido).toBe(false);
  });
});

describe("totais do caixa", () => {
  test("soma em centavos e ignora os cancelados", () => {
    const t = e.totaisDoCaixa([
      { tipo: "ENTRADA", valor: 0.1 }, { tipo: "ENTRADA", valor: 0.2 }, { tipo: "SAIDA", valor: 0.05 },
      { tipo: "ENTRADA", valor: 999, cancelado: true }
    ]);
    expect(t).toMatchObject({ entradasCentavos: 30, saidasCentavos: 5, saldoCentavos: 25, saldo: 0.25 });
  });
  test("caixa vazio", () => {
    expect(e.totaisDoCaixa([]).saldoCentavos).toBe(0);
  });
});

describe("encerramento: o superávit TODO tem destino (Art. 53-E, §2º, II)", () => {
  const hoje = "2026-10-30";
  const dest = (extra = {}) => ({ tipo: "RECOLHIDO_SEDE", valor: "100,00", data: "2026-10-29", comprovante: "Depósito 5678", ...extra });

  test("superávit sem destino é recusado, citando o valor e o Regimento", () => {
    const r = e.validarEncerramento({ saldoCentavos: 10000, destinos: [] }, { hoje });
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/R\$\s?100,00/);
    expect(r.mensagem).toMatch(/Art\. 53-E/);
  });
  test("os destinos somam EXATAMENTE o saldo — sem sobra e sem falta", () => {
    expect(e.validarEncerramento({ saldoCentavos: 10000, destinos: [dest()] }, { hoje }).valido).toBe(true);
    expect(e.validarEncerramento({ saldoCentavos: 10000, destinos: [dest({ valor: "99,99" })] }, { hoje }).mensagem).toMatch(/sem sobra nem falta/);
    expect(e.validarEncerramento({ saldoCentavos: 10000, destinos: [dest({ valor: "100,01" })] }, { hoje }).valido).toBe(false);
  });
  test("pode dividir entre recolher à Sede e benfeitoria", () => {
    const r = e.validarEncerramento({ saldoCentavos: 10000, destinos: [dest({ valor: "60,00" }), dest({ tipo: "BENFEITORIA", valor: "40,00", comprovante: "NF 99", descricao: "Troca de lâmpadas do templo" })] }, { hoje });
    expect(r.valido).toBe(true);
    expect(r.destinos.map(d => d.centavos)).toEqual([6000, 4000]);
  });
  test("cada destino: tipo, valor, data, comprovante; benfeitoria é descrita", () => {
    expect(e.validarEncerramento({ saldoCentavos: 10000, destinos: [dest({ tipo: "GUARDADO" })] }, { hoje }).valido).toBe(false);
    expect(e.validarEncerramento({ saldoCentavos: 10000, destinos: [dest({ valor: 0 })] }, { hoje }).valido).toBe(false);
    expect(e.validarEncerramento({ saldoCentavos: 10000, destinos: [dest({ data: "2026-11-30" })] }, { hoje }).valido).toBe(false);
    expect(e.validarEncerramento({ saldoCentavos: 10000, destinos: [dest({ comprovante: "" })] }, { hoje }).mensagem).toMatch(/comprovante/);
    expect(e.validarEncerramento({ saldoCentavos: 10000, destinos: [dest({ tipo: "BENFEITORIA" })] }, { hoje }).mensagem).toMatch(/descreva a benfeitoria/);
  });
  test("saldo zero: não há o que destinar; destino informado é recusado", () => {
    expect(e.validarEncerramento({ saldoCentavos: 0, destinos: [] }, { hoje })).toMatchObject({ valido: true, destinos: [] });
    expect(e.validarEncerramento({ saldoCentavos: 0, destinos: [dest()] }, { hoje }).valido).toBe(false);
  });
  test("déficit: exige a explicação e não aceita destino", () => {
    expect(e.validarEncerramento({ saldoCentavos: -5000, destinos: [] }, { hoje }).mensagem).toMatch(/explique o déficit/);
    expect(e.validarEncerramento({ saldoCentavos: -5000, destinos: [], justificativaDeficit: "Cantina rendeu menos que o previsto" })).toMatchObject({ valido: true, justificativaDeficit: "Cantina rendeu menos que o previsto" });
    expect(e.validarEncerramento({ saldoCentavos: -5000, destinos: [dest()], justificativaDeficit: "Cantina rendeu menos que o previsto" }, { hoje }).valido).toBe(false);
  });
});

describe("prazo do caixa", () => {
  test("15 dias depois do fim do evento", () => {
    expect(e.prazoDeEncerramento("2026-10-20")).toBe("2026-11-04");
    expect(e.prazoDeEncerramento("2026-10-20", 5)).toBe("2026-10-25");
  });
  test("situação: no prazo, atrasado, encerrado, conferido", () => {
    expect(e.situacaoDoCaixa({ status: "ABERTO", prazoEm: "2026-11-04" }, "2026-11-04")).toMatchObject({ fase: "ABERTO_NO_PRAZO", atrasado: false, diasRestantes: 0 });
    expect(e.situacaoDoCaixa({ status: "ABERTO", prazoEm: "2026-11-04" }, "2026-11-10")).toMatchObject({ fase: "ABERTO_ATRASADO", atrasado: true, diasAtraso: 6 });
    expect(e.situacaoDoCaixa({ status: "ENCERRADO", prazoEm: "2026-01-01" }, "2026-11-10")).toMatchObject({ fase: "ENCERRADO", atrasado: false });
    expect(e.situacaoDoCaixa({ status: "CONFERIDO", prazoEm: "2026-01-01" }, "2026-11-10").fase).toBe("CONFERIDO");
  });
});
