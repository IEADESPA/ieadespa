// Regra pura do ministério com menores (v7.7 — Lei 14.811/2024): aptidão calculada na leitura, validade das certidões, sala com dois adultos e proporção, escada de
// avisos, política versionada e auto-denúncia. Nada aqui toca o banco.
const mm = require("../ministerioMenores");

const HOJE = "2026-10-09";
const doc = (tipo, dataEmissao) => ({ tipo, dataEmissao });
const vistoriaOk = (extra = {}) => ({ vistoriaId: 1, resultado: "SEM_RESTRICAO", documentos: [doc("ANTECEDENTES_FEDERAL", "2026-08-01"), doc("ANTECEDENTES_ESTADUAL", "2026-08-10")], ...extra });
// Um voluntário em dia com tudo (adulto, 6+ anos de comunhão).
const emDia = (extra = {}) => ({
  membro: { dataNascimento: "1990-05-10", dataAdmissao: "2020-01-01", status: "ATIVO", situacao: "ATIVO" },
  esteira: { existe: true, status: "APTO", validoAte: "2028-01-01", proximaEtapaTitulo: null },
  vistoria: vistoriaOk(), treinamento: { modo: "MANUAL", atestadoEm: "2026-01-10" }, fichaEm: "2026-07-01",
  politicaVersaoAceita: 1, politicaVersaoVigente: 1, autoDenunciaAberta: false, cadastroNacional: null, ...extra
});
const codigos = (a) => a.bloqueios.map((b) => b.codigo);

describe("datas (sempre em UTC, sem depender do fuso)", () => {
  test("somar dias e meses, com o fim de mês que não existe", () => {
    expect(mm.somarDiasIso("2026-08-01", 180)).toBe("2027-01-28");
    expect(mm.somarDiasIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(mm.somarDiasIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(mm.somarMesesIso("2025-08-31", 6)).toBe("2026-02-28");     // 31/ago + 6 meses = 28/fev, não 03/mar
    expect(mm.somarMesesIso("2026-01-31", 1)).toBe("2026-02-28");
    expect(mm.somarMesesIso("2024-08-31", 6)).toBe("2025-02-28");
    expect(mm.somarMesesIso("2023-08-31", 6)).toBe("2024-02-29");     // ano bissexto
  });
  test("dias entre datas (positivo = ainda falta)", () => {
    expect(mm.diasEntreIso("2026-10-09", "2026-10-19")).toBe(10);
    expect(mm.diasEntreIso("2026-10-09", "2026-10-09")).toBe(0);
    expect(mm.diasEntreIso("2026-10-09", "2026-10-01")).toBe(-8);
    expect(mm.diasEntreIso("2026-01-01", "2027-01-01")).toBe(365);
  });
  test("paraIso aceita data e texto; o resto vira nulo", () => {
    expect(mm.paraIso(new Date("2026-08-01T00:00:00Z"))).toBe("2026-08-01");
    expect(mm.paraIso("2026-08-01T10:20:00Z")).toBe("2026-08-01");
    for (const ruim of [null, undefined, "", "2026-13-01", "2026-02-30", "ontem", new Date("x"), 12345, {}, []]) expect(mm.paraIso(ruim)).toBeNull();
  });
});

describe("antecedentes: a certidão vale 180 dias da EMISSÃO (Termo de Vistoria da v7.6)", () => {
  test("sem vistoria: ausente; resultado diferente de sem restrição: bloqueia; só uma certidão: incompleto", () => {
    expect(mm.avaliarAntecedentes(null, { hoje: HOJE })).toMatchObject({ situacao: "AUSENTE", faltam: ["ANTECEDENTES_FEDERAL", "ANTECEDENTES_ESTADUAL"] });
    expect(mm.avaliarAntecedentes(vistoriaOk({ resultado: "COM_RESTRICAO" }), { hoje: HOJE }).situacao).toBe("COM_RESTRICAO");
    expect(mm.avaliarAntecedentes(vistoriaOk({ resultado: "RECUSA", documentos: [] }), { hoje: HOJE }).situacao).toBe("COM_RESTRICAO");
    const so = mm.avaliarAntecedentes(vistoriaOk({ documentos: [doc("ANTECEDENTES_FEDERAL", "2026-08-01"), doc("DISTRIBUICAO_CIVEL", "2026-08-01")] }), { hoje: HOJE });
    expect(so).toMatchObject({ situacao: "INCOMPLETO", faltam: ["ANTECEDENTES_ESTADUAL"] });
  });
  test("a vistoria vence quando a mais antiga das duas certidões vence; vale até o 180º dia, inclusive", () => {
    const v = vistoriaOk({ documentos: [doc("ANTECEDENTES_FEDERAL", "2026-04-12"), doc("ANTECEDENTES_ESTADUAL", "2026-08-10")] });
    const r = mm.avaliarAntecedentes(v, { hoje: HOJE });
    expect(r).toMatchObject({ situacao: "VIGENTE", emitidaEm: "2026-04-12", validoAte: "2026-10-09" });
    expect(mm.avaliarAntecedentes(v, { hoje: "2026-10-09" }).situacao).toBe("VIGENTE");      // no último dia ainda vale
    expect(mm.avaliarAntecedentes(v, { hoje: "2026-10-10" }).situacao).toBe("VENCIDO");      // no dia seguinte, venceu
  });
  test("de cada tipo vale a certidão emitida mais recentemente; certidão cível e documento torto não contam", () => {
    const v = vistoriaOk({ documentos: [
      doc("ANTECEDENTES_FEDERAL", "2025-01-01"), doc("ANTECEDENTES_FEDERAL", "2026-09-01"), doc("ANTECEDENTES_ESTADUAL", "2026-09-05"),
      doc("DISTRIBUICAO_CIVEL", "2020-01-01"), null, undefined, { tipo: "ANTECEDENTES_ESTADUAL", dataEmissao: "lixo" }, { tipo: "OUTRO" }
    ] });
    expect(mm.avaliarAntecedentes(v, { hoje: HOJE })).toMatchObject({ situacao: "VIGENTE", emitidaEm: "2026-09-01", validoAte: "2027-02-28" });
  });
  test("o prazo é configurável", () => {
    expect(mm.avaliarAntecedentes(vistoriaOk(), { hoje: HOJE, validadeDias: 30 }).situacao).toBe("VENCIDO");
    expect(mm.avaliarAntecedentes(vistoriaOk(), { hoje: HOJE, validadeDias: 365 }).situacao).toBe("VIGENTE");
  });
});

describe("treinamento de proteção: trilha de formação (v6.9) ou atestação com validade", () => {
  test("pela trilha: vigente e vencendo valem; vencida vence; o resto é ausente", () => {
    expect(mm.avaliarTreinamento({ modo: "TRILHA", situacao: "VIGENTE", validoAte: "2027-01-01" }, { hoje: HOJE })).toEqual({ situacao: "VIGENTE", modo: "TRILHA", validoAte: "2027-01-01" });
    expect(mm.avaliarTreinamento({ modo: "TRILHA", situacao: "VENCENDO", validoAte: "2026-11-01" }, { hoje: HOJE }).situacao).toBe("VIGENTE");
    expect(mm.avaliarTreinamento({ modo: "TRILHA", situacao: "VENCIDA", validoAte: "2026-09-01" }, { hoje: HOJE }).situacao).toBe("VENCIDO");
    for (const s of ["NAO_INICIADA", "EM_ANDAMENTO", "REVOGADA", "CANCELADA", undefined]) expect(mm.avaliarTreinamento({ modo: "TRILHA", situacao: s }, { hoje: HOJE }).situacao).toBe("AUSENTE");
  });
  test("à mão: sem atestação é ausente; com atestação vale 2 anos, inclusive no último dia", () => {
    expect(mm.avaliarTreinamento(null, { hoje: HOJE }).situacao).toBe("AUSENTE");
    expect(mm.avaliarTreinamento({ modo: "MANUAL", atestadoEm: null }, { hoje: HOJE }).situacao).toBe("AUSENTE");
    expect(mm.avaliarTreinamento({ modo: "MANUAL", atestadoEm: "2024-10-09" }, { hoje: HOJE })).toMatchObject({ situacao: "VIGENTE", validoAte: "2026-10-09" });
    expect(mm.avaliarTreinamento({ modo: "MANUAL", atestadoEm: "2024-10-08" }, { hoje: HOJE }).situacao).toBe("VENCIDO");
  });
});

describe("aptidão para servir com menores", () => {
  test("em dia com tudo: apto, conta como adulto, e diz o que vence primeiro", () => {
    const a = mm.avaliarAptidao(emDia(), { hoje: HOJE });
    expect(a.apto).toBe(true);
    expect(a.contaComoAdulto).toBe(true);
    expect(a.bloqueios).toEqual([]);
    // antecedentes: federal 01/08 → vale até 28/01/2027; ficha: 01/07 → 28/12/2026; treinamento 10/01/2026 → 10/01/2028; esteira 2028.
    expect(a.proximoVencimento).toMatchObject({ item: "ficha", data: "2026-12-28", dias: 80 });
  });
  test("cada falta gera o seu bloqueio, com mensagem em português simples", () => {
    const caso = (extra) => codigos(mm.avaliarAptidao(emDia(extra), { hoje: HOJE }));
    expect(caso({ vistoria: null })).toEqual(["ANTECEDENTES_AUSENTES"]);
    expect(caso({ vistoria: vistoriaOk({ documentos: [doc("ANTECEDENTES_FEDERAL", "2026-08-01")] }) })).toEqual(["ANTECEDENTES_INCOMPLETOS"]);
    expect(caso({ vistoria: vistoriaOk({ resultado: "COM_RESTRICAO" }) })).toEqual(["ANTECEDENTES_COM_RESTRICAO"]);
    expect(caso({ vistoria: vistoriaOk({ documentos: [doc("ANTECEDENTES_FEDERAL", "2026-01-01"), doc("ANTECEDENTES_ESTADUAL", "2026-01-01")] }) })).toEqual(["ANTECEDENTES_VENCIDOS"]);
    expect(caso({ treinamento: null })).toEqual(["TREINAMENTO_AUSENTE"]);
    expect(caso({ treinamento: { modo: "TRILHA", situacao: "VENCIDA", validoAte: "2026-09-01" } })).toEqual(["TREINAMENTO_VENCIDO"]);
    expect(caso({ fichaEm: null })).toEqual(["FICHA_DESATUALIZADA"]);
    expect(caso({ fichaEm: "2026-03-01" })).toEqual(["FICHA_DESATUALIZADA"]);
    expect(caso({ politicaVersaoAceita: null })).toEqual(["POLITICA_NAO_ACEITA"]);
    expect(caso({ politicaVersaoAceita: 1, politicaVersaoVigente: 2 })).toEqual(["POLITICA_NAO_ACEITA"]);
    expect(caso({ autoDenunciaAberta: true })).toEqual(["AUTO_DENUNCIA_EM_ANALISE"]);
    expect(caso({ cadastroNacional: "CONSTA" })).toEqual(["CADASTRO_NACIONAL"]);
    expect(caso({ cadastroNacional: "NADA_CONSTA" })).toEqual([]);
    expect(caso({ cadastroNacional: "INDISPONIVEL" })).toEqual([]);       // consulta indisponível não presume culpa
    expect(caso({ esteira: { existe: false } })).toEqual(["SEM_HABILITACAO"]);
    expect(caso({ esteira: { existe: true, status: "INAPTO" } })).toEqual(["INAPTO"]);
    expect(caso({ esteira: { existe: true, status: "VENCIDO", validoAte: "2026-01-01" } })).toEqual(["HABILITACAO_VENCIDA"]);
    expect(mm.avaliarAptidao(emDia({ esteira: { existe: true, status: "PENDENTE", proximaEtapaTitulo: "Entrevista registrada" } }), { hoje: HOJE }).bloqueios[0].mensagem).toMatch(/falta “Entrevista registrada”/);
    expect(caso({ membro: { ...emDia().membro, status: "INATIVO" } })).toEqual(["FORA_DE_COMUNHAO"]);
    expect(caso({ membro: { ...emDia().membro, situacao: "SEM_COMUNHAO" } })).toEqual(["FORA_DE_COMUNHAO"]);
  });
  test("a confirmação da ficha vale 180 dias, inclusive no último dia", () => {
    expect(mm.avaliarAptidao(emDia({ fichaEm: "2026-04-12" }), { hoje: HOJE }).apto).toBe(true);       // 12/04 + 180 = 09/10
    expect(codigos(mm.avaliarAptidao(emDia({ fichaEm: "2026-04-11" }), { hoje: HOJE }))).toEqual(["FICHA_DESATUALIZADA"]);
  });
  test("regra dos 6 meses: calculada da última admissão, com o fim de mês, nunca digitada", () => {
    const com = (dataAdmissao, hoje) => mm.avaliarAptidao(emDia({ membro: { ...emDia().membro, dataAdmissao } }), { hoje });
    expect(com("2026-04-09", "2026-10-09").apto).toBe(true);                        // exatamente 6 meses
    expect(codigos(com("2026-04-10", "2026-10-09"))).toEqual(["SEIS_MESES"]);       // faltou um dia
    expect(com("2025-08-31", "2026-02-28").apto).toBe(true);                        // 31/ago + 6 meses = 28/fev
    expect(codigos(com("2025-08-31", "2026-02-27"))).toEqual(["SEIS_MESES"]);
    const b = com("2026-08-01", HOJE).bloqueios[0];
    expect(b.mensagem).toMatch(/a partir de 01\/02\/2027/);
    expect(b.elegivelEm).toBe("2027-02-01");
    expect(codigos(com(null, HOJE))).toEqual(["SEIS_MESES"]);                      // sem data de admissão não se presume
  });
  test("sem data de nascimento não se serve com menores: a idade é a base de tudo", () => {
    const a = mm.avaliarAptidao(emDia({ membro: { ...emDia().membro, dataNascimento: null } }), { hoje: HOJE });
    expect(a.apto).toBe(false);
    expect(codigos(a)).toContain("SEM_DATA_NASCIMENTO");
    expect(a.contaComoAdulto).toBe(false);
  });
  test("menor de 18 anos: sem certidão de antecedentes (ato infracional corre em segredo), serve só como auxiliar e nunca conta como adulto", () => {
    const a = mm.avaliarAptidao(emDia({ membro: { ...emDia().membro, dataNascimento: "2010-03-01" }, vistoria: null }), { hoje: HOJE });
    expect(a.apto).toBe(true);
    expect(a.contaComoAdulto).toBe(false);
    expect(a.menorDeIdade).toBe(true);
    expect(a.validades.antecedentes.situacao).toBe("DISPENSADO");
    // faz 18 anos hoje: passa a exigir a certidão e a contar como adulto
    const adulto = mm.avaliarAptidao(emDia({ membro: { ...emDia().membro, dataNascimento: "2008-10-09" }, vistoria: null }), { hoje: HOJE });
    expect(adulto.contaComoAdulto).toBe(true);
    expect(codigos(adulto)).toEqual(["ANTECEDENTES_AUSENTES"]);
  });
  test("várias faltas juntas aparecem todas, para a pessoa ver o caminho inteiro", () => {
    const a = mm.avaliarAptidao(emDia({ vistoria: null, treinamento: null, politicaVersaoAceita: null, fichaEm: null }), { hoje: HOJE });
    expect(codigos(a)).toEqual(["ANTECEDENTES_AUSENTES", "TREINAMENTO_AUSENTE", "FICHA_DESATUALIZADA", "POLITICA_NAO_ACEITA"]);
  });
  test("os prazos configurados mudam a conta (antecedentes de 30 dias, ficha de 365)", () => {
    expect(codigos(mm.avaliarAptidao(emDia(), { hoje: HOJE, prazos: { antecedentesDias: 30 } }))).toEqual(["ANTECEDENTES_VENCIDOS"]);
    expect(mm.avaliarAptidao(emDia({ fichaEm: "2026-01-01" }), { hoje: HOJE, prazos: { fichaDias: 365 } }).apto).toBe(true);
    // valor torto (zero, negativo, texto) cai no padrão, nunca em "nunca vence"
    expect(codigos(mm.avaliarAptidao(emDia({ fichaEm: "2026-01-01" }), { hoje: HOJE, prazos: { fichaDias: 0 } }))).toEqual(["FICHA_DESATUALIZADA"]);
    expect(codigos(mm.avaliarAptidao(emDia({ fichaEm: "2026-01-01" }), { hoje: HOJE, prazos: { fichaDias: "abc" } }))).toEqual(["FICHA_DESATUALIZADA"]);
  });
});

describe("a escada de avisos: 60, 30 e 15 dias antes", () => {
  test("em que degrau o vencimento está agora", () => {
    expect([61, 60, 59, 31, 30, 29, 16, 15, 14, 1, 0, -1].map(mm.faixaDeAlerta)).toEqual([null, 60, 60, 60, 30, 30, 30, 15, 15, 15, 15, null]);
    for (const ruim of [undefined, null, "30", 30.5, NaN]) expect(mm.faixaDeAlerta(ruim)).toBeNull();
  });
  test("os itens a vencer, do mais próximo ao mais distante; o que já venceu ou já bloqueia não entra", () => {
    const validades = {
      esteira: { validoAte: "2027-06-01" }, antecedentes: { situacao: "VIGENTE", validoAte: "2026-11-05" },
      treinamento: { situacao: "VENCIDO", validoAte: "2026-09-01" }, ficha: { validoAte: "2026-10-20" }
    };
    expect(mm.itensAVencer(validades, HOJE).map((i) => [i.item, i.dias])).toEqual([["ficha", 11], ["antecedentes", 27], ["esteira", 235]]);
    expect(mm.proximoVencimento(validades, HOJE)).toMatchObject({ item: "ficha", dias: 11 });
    expect(mm.proximoVencimento({ esteira: { validoAte: null }, antecedentes: { situacao: "AUSENTE" }, treinamento: { situacao: "AUSENTE" }, ficha: { validoAte: null } }, HOJE)).toBeNull();
  });
  test("a referência do aviso muda a cada ciclo de validade (a renovação reabre a escada) e cabe em INT", () => {
    const a = mm.referenciaDoAviso(7, "2026-12-01"), b = mm.referenciaDoAviso(7, "2027-06-01"), c = mm.referenciaDoAviso(8, "2026-12-01");
    expect(new Set([a, b, c]).size).toBe(3);
    expect(mm.referenciaDoAviso(7, "2026-12-01")).toBe(a);
    expect(a).toBeLessThan(2147483647);
    expect(mm.referenciaDoAviso(21000, "2035-01-01")).toBeLessThan(2147483647);
  });
  test("o status da linha do painel: bloqueado, vencendo (até 60 dias) ou apto", () => {
    expect(mm.statusDaLinha(mm.avaliarAptidao(emDia({ vistoria: null }), { hoje: HOJE }))).toBe("BLOQUEADO");
    expect(mm.statusDaLinha(mm.avaliarAptidao(emDia({ fichaEm: "2026-06-01" }), { hoje: HOJE }))).toBe("VENCENDO");   // ficha confirmada em 01/06 vence em 28/11: 50 dias
    expect(mm.statusDaLinha(mm.avaliarAptidao(emDia({ fichaEm: "2026-09-01" }), { hoje: HOJE }))).toBe("APTO");
  });
});

describe("o que a gestão da congregação vê: pendência com a Diretoria não revela o motivo", () => {
  test("restrição, auto-denúncia, cadastro nacional e fora de comunhão viram uma só 'pendência com a Diretoria'", () => {
    const a = mm.avaliarAptidao(emDia({ vistoria: vistoriaOk({ resultado: "COM_RESTRICAO" }), autoDenunciaAberta: true, cadastroNacional: "CONSTA", treinamento: null }), { hoje: HOJE });
    expect(codigos(a)).toEqual(expect.arrayContaining(["ANTECEDENTES_COM_RESTRICAO", "AUTO_DENUNCIA_EM_ANALISE", "CADASTRO_NACIONAL", "TREINAMENTO_AUSENTE"]));
    const masc = mm.mascararParaGestao(a.bloqueios);
    expect(masc.map((b) => b.codigo)).toEqual(["PENDENCIA_DIRETORIA", "TREINAMENTO_AUSENTE"]);
    expect(JSON.stringify(masc)).not.toMatch(/restrição|denúncia|inquérito|cadastro nacional|comunhão/i);
    expect(mm.mascararParaGestao([{ codigo: "FORA_DE_COMUNHAO", mensagem: "x" }]).map((b) => b.codigo)).toEqual(["PENDENCIA_DIRETORIA"]);
    expect(mm.mascararParaGestao(undefined)).toEqual([]);
  });
});

describe("a sala: dois adultos habilitados e a proporção por faixa etária", () => {
  const sala = (extra) => mm.avaliarSala({ equipeNome: "Maternal", faixa: "MATERNAL", criancasPrevistas: 10, adultos: 2, semHabilitacao: [], ...extra });
  const cods = (r) => r.problemas.map((p) => p.codigo);
  test("um adulto sozinho nunca: mesmo com poucas crianças", () => {
    expect(cods(sala({ adultos: 1, criancasPrevistas: 1 }))).toEqual(["UM_ADULTO_SOZINHO"]);
    expect(cods(sala({ adultos: 0, criancasPrevistas: 0 }))).toEqual(["UM_ADULTO_SOZINHO"]);
    expect(sala({ adultos: 2, criancasPrevistas: 1 }).ok).toBe(true);
  });
  test("a proporção: maternal admite 5 crianças por adulto", () => {
    expect(sala({ adultos: 2, criancasPrevistas: 10 })).toMatchObject({ ok: true, necessarios: 2 });
    expect(sala({ adultos: 2, criancasPrevistas: 11 })).toMatchObject({ ok: false, necessarios: 3 });
    expect(cods(sala({ adultos: 2, criancasPrevistas: 11 }))).toEqual(["PROPORCAO"]);
    expect(sala({ adultos: 3, criancasPrevistas: 11 }).ok).toBe(true);
    expect(sala({ adultos: 3, criancasPrevistas: 15 }).ok).toBe(true);
    expect(sala({ adultos: 3, criancasPrevistas: 16 }).ok).toBe(false);
  });
  test("cada faixa tem a sua proporção; a configuração muda o resultado", () => {
    expect(sala({ faixa: "BERCARIO", criancasPrevistas: 6, adultos: 2 }).ok).toBe(true);
    expect(sala({ faixa: "BERCARIO", criancasPrevistas: 7, adultos: 2 }).necessarios).toBe(3);
    expect(sala({ faixa: "ADOLESCENTES", criancasPrevistas: 24, adultos: 2 }).ok).toBe(true);
    expect(sala({ faixa: "ADOLESCENTES", criancasPrevistas: 25, adultos: 2 }).ok).toBe(false);
    expect(sala({ criancasPrevistas: 20, adultos: 2, criancasPorAdulto: 10 }).ok).toBe(true);      // configurado para 10 por adulto
    expect(mm.criancasPorAdulto("JUNIORES", { JUNIORES: 7 })).toBe(7);
    expect(mm.criancasPorAdulto("JUNIORES", { JUNIORES: 0 })).toBe(10);                              // valor torto cai no padrão
    expect(mm.criancasPorAdulto("INEXISTENTE")).toBeNull();
  });
  test("o mínimo de adultos é configurável (3 adultos)", () => {
    expect(cods(sala({ adultos: 2, criancasPrevistas: 3, adultosMinimos: 3 }))).toEqual(["UM_ADULTO_SOZINHO"]);
    expect(sala({ adultos: 3, criancasPrevistas: 3, adultosMinimos: 3 }).ok).toBe(true);
  });
  test("faltam dados para conferir: sem faixa e sem crianças previstas a publicação não passa", () => {
    expect(cods(sala({ faixa: null }))).toContain("SEM_FAIXA");
    expect(cods(sala({ faixa: "XYZ" }))).toContain("SEM_FAIXA");
    expect(cods(sala({ criancasPrevistas: null }))).toContain("SEM_CRIANCAS_PREVISTAS");
    expect(sala({ criancasPrevistas: null }).ok).toBe(false);
  });
  test("voluntário escalado sem habilitação também impede publicar, nomeando quem é", () => {
    const r = sala({ semHabilitacao: ["Beto Lima"] });
    expect(cods(r)).toContain("ESCALADO_SEM_HABILITACAO");
    expect(r.problemas.find((p) => p.codigo === "ESCALADO_SEM_HABILITACAO").mensagem).toMatch(/Beto Lima/);
  });
  test("as crianças previstas e a faixa só aceitam o que é claramente válido", () => {
    for (const bom of [0, 12, 200, "12", " 7 "]) expect(mm.validarCriancasPrevistas(bom)).toMatchObject({ valido: true });
    expect(mm.validarCriancasPrevistas("12").criancas).toBe(12);
    for (const ruim of [-1, 201, 1.5, "0x10", "1e1", "abc", "", null, undefined, true, [3], {}, NaN, Infinity, "12.5", "-3"]) expect(mm.validarCriancasPrevistas(ruim).valido).toBe(false);
    expect(mm.validarFaixa(null)).toEqual({ valido: true, faixa: null });
    expect(mm.validarFaixa("MATERNAL")).toEqual({ valido: true, faixa: "MATERNAL" });
    for (const ruim of ["maternal", "X", 3, [], {}, true]) expect(mm.validarFaixa(ruim).valido).toBe(false);
  });
});

describe("a política de comunicação com menores (versionada, com hash)", () => {
  test("texto fixo, em itens, com hash estável; a versão antiga precisa reaceitar", () => {
    const p = mm.politicaVigente();
    expect(p.versao).toBe(1);
    expect(p.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(p.hash).toBe(mm.POLITICA_HASH);
    expect(p.itens.length).toBeGreaterThanOrEqual(6);
    expect(p.itens.map((i) => i.codigo)).toEqual(expect.arrayContaining(["SEM_PRIVADO", "GRUPO_OFICIAL", "IMAGEM", "COMUNICAR"]));
    expect(p.itens.find((i) => i.codigo === "SEM_PRIVADO").texto).toMatch(/mensagem privada/);
    expect(mm.avaliarIntegridadePolitica({ versao: 1, hash: mm.POLITICA_HASH })).toEqual({ status: "OK" });
    expect(mm.avaliarIntegridadePolitica({ versao: 1, hash: "0".repeat(64) })).toEqual({ status: "DIVERGENTE" });
    expect(mm.avaliarIntegridadePolitica({ versao: 0, hash: "x" })).toEqual({ status: "VERSAO_ANTERIOR" });
    expect(mm.avaliarIntegridadePolitica(null)).toEqual({ status: "SEM_HASH" });
    expect(mm.avaliarIntegridadePolitica({ versao: 1 })).toEqual({ status: "SEM_HASH" });
  });
  test("a cópia devolvida ao front não altera o texto original", () => {
    const p = mm.politicaVigente();
    p.itens[0].texto = "adulterado";
    expect(mm.politicaVigente().itens[0].texto).not.toBe("adulterado");
  });
  test("o aceite e a confirmação da ficha exigem o booleano verdadeiro, não 'true', 1 ou texto", () => {
    expect(mm.validarAceitePolitica({ aceito: true }).valido).toBe(true);
    for (const ruim of [{}, { aceito: "true" }, { aceito: 1 }, { aceito: [] }, { aceito: false }]) expect(mm.validarAceitePolitica(ruim).valido).toBe(false);
    expect(mm.validarConfirmacaoFicha({ confirmo: true }).valido).toBe(true);
    for (const ruim of [{}, { confirmo: "sim" }, { confirmo: 1 }]) expect(mm.validarConfirmacaoFicha(ruim).valido).toBe(false);
  });
});

describe("auto-denúncia (Regimento Art. 133 §5º, V)", () => {
  const ok = (extra) => mm.validarAutoDenuncia({ tipo: "INQUERITO_POLICIAL", dataCiencia: "2026-09-20", ciente: true, ...extra }, { hoje: HOJE });
  test("só o tipo e a data; a data não é futura nem antiga demais; a ciência é obrigatória", () => {
    expect(ok()).toEqual({ valido: true, dados: { tipo: "INQUERITO_POLICIAL", dataCiencia: "2026-09-20" } });
    expect(ok({ tipo: "processo_criminal" }).dados.tipo).toBe("PROCESSO_CRIMINAL");           // aceita minúsculas
    expect(ok({ dataCiencia: HOJE }).valido).toBe(true);
    for (const ruim of [{ tipo: "OUTRO" }, { tipo: "" }, { tipo: undefined }, { tipo: ["INQUERITO_POLICIAL"] }, { dataCiencia: "2026-10-10" }, { dataCiencia: "1989-12-31" },
      { dataCiencia: "2026-02-30" }, { dataCiencia: "ontem" }, { dataCiencia: 20260920 }, { ciente: "true" }, { ciente: 1 }, { ciente: false }, { ciente: undefined }]) {
      expect(ok(ruim).valido).toBe(false);
    }
  });
  test("a decisão: ninguém decide sobre si, o motivo é obrigatório e sem tags", () => {
    const d = (extra, ator = 1, membro = 2) => mm.validarDecisaoAutoDenuncia({ decisao: "MANTIDO", observacao: "Conversei com a pessoa e ela segue em dia.", ...extra }, { atorId: ator, membroId: membro });
    expect(d().valido).toBe(true);
    expect(d({ decisao: "afastado_preventivamente" }).dados.decisao).toBe("AFASTADO_PREVENTIVAMENTE");
    expect(d({}, 2, 2)).toMatchObject({ valido: false, proibido: true });
    for (const ruim of [{ decisao: "TALVEZ" }, { decisao: undefined }, { observacao: "curto" }, { observacao: "" }, { observacao: "x".repeat(301) }, { observacao: "<b>ok ok ok ok</b>" }, { observacao: undefined }]) expect(d(ruim).valido).toBe(false);
  });
  test("a liberação do afastamento: outra pessoa, com motivo", () => {
    expect(mm.validarLiberacaoAutoDenuncia({ observacao: "O processo foi arquivado." }, { atorId: 1, membroId: 2 }).valido).toBe(true);
    expect(mm.validarLiberacaoAutoDenuncia({ observacao: "O processo foi arquivado." }, { atorId: 2, membroId: 2 })).toMatchObject({ valido: false, proibido: true });
    expect(mm.validarLiberacaoAutoDenuncia({ observacao: "curto" }, { atorId: 1, membroId: 2 }).valido).toBe(false);
  });
});

describe("o painel de conformidade", () => {
  const linha = (id, cong, extra) => ({ membroId: id, nome: `Pessoa ${id}`, congregacaoId: cong, congregacaoNome: cong === 1 ? "Central" : "Vila Nova", equipes: ["Infantil"], aptidao: mm.avaliarAptidao(emDia(extra), { hoje: HOJE }) });
  test("conta aptos, vencendo e bloqueados, e por motivo; agrupa por congregação em ordem alfabética", () => {
    const linhas = [linha(1, 1), linha(2, 1, { fichaEm: "2026-06-01" }), linha(3, 1, { vistoria: null }), linha(4, 2, { vistoria: null, treinamento: null }), linha(5, 2)];
    const r = mm.resumirPainel(linhas);
    expect(r).toMatchObject({ total: 5, aptos: 2, vencendo: 1, bloqueados: 2 });
    expect(r.porMotivo).toEqual({ ANTECEDENTES_AUSENTES: 2, TREINAMENTO_AUSENTE: 1 });
    const g = mm.agruparPorCongregacao(linhas);
    expect(g.map((x) => [x.congregacaoNome, x.total, x.aptos, x.vencendo, x.bloqueados])).toEqual([["Central", 3, 1, 1, 1], ["Vila Nova", 2, 1, 0, 1]]);
  });
  test("painel vazio não quebra", () => {
    expect(mm.resumirPainel([])).toEqual({ total: 0, aptos: 0, vencendo: 0, bloqueados: 0, porMotivo: {} });
    expect(mm.agruparPorCongregacao([])).toEqual([]);
  });
});

describe("os textos dos avisos", () => {
  test("a retirada da escala e a vaga aberta NÃO dizem o motivo (pode ser pendência com a Diretoria)", () => {
    const pessoa = mm.textoRetiradaPessoa({ equipes: ["Berçário", "Maternal"], nEscalas: 3 });
    const vaga = mm.textoVagaAberta({ nome: "Ana Souza", equipe: "Berçário", nEscalas: 3 });
    expect(pessoa).toMatch(/Berçário e Maternal/);
    expect(pessoa).toMatch(/3 escala/);
    expect(pessoa).toMatch(/não abre processo disciplinar/);
    expect(vaga).toMatch(/Ana Souza/);
    for (const t of [pessoa, vaga]) expect(t).not.toMatch(/antecedentes|restrição|denúncia|inquérito|processo criminal|vencid/i);
  });
  test("o aviso de vencimento lista o que vence com a data e fala em português simples; nenhum texto passa de 1000 caracteres", () => {
    const t = mm.textoVencendo({ itens: [{ rotulo: "certidões de antecedentes", data: "2026-11-05" }, { rotulo: "treinamento de proteção", data: "2026-11-20" }], faixa: 30 });
    expect(t).toMatch(/certidões de antecedentes \(05\/11\/2026\) e treinamento de proteção \(20\/11\/2026\)/);
    expect(t).toMatch(/30 dias/);
    const enorme = Array.from({ length: 60 }, (_, i) => `Pessoa Com Nome Muito Comprido ${i}`);
    for (const x of [mm.textoVistoriasARenovar({ total: 60, nomes: enorme }), mm.textoCanalIrregular({ canalNome: "C".repeat(400), problemas: ["a".repeat(400), "b".repeat(400)] }),
      mm.textoVencendo({ itens: Array.from({ length: 4 }, () => ({ rotulo: "r".repeat(300), data: "2026-11-05" })), faixa: 60 })]) expect(x.length).toBeLessThanOrEqual(1000);
    expect(mm.textoVistoriasARenovar({ total: 9, nomes: enorme.slice(0, 9) })).toMatch(/e mais 3/);
  });
  test("o aviso à pessoa da auto-denúncia diz que a suspensão é cautela, não punição; o da decisão diz o resultado sem o motivo", () => {
    expect(mm.textoAutoDenunciaPessoa()).toMatch(/não é punição/);
    expect(mm.textoAutoDenunciaDecidida({ decisao: "MANTIDO" })).toMatch(/liberado/);
    expect(mm.textoAutoDenunciaDecidida({ decisao: "AFASTADO_PREVENTIVAMENTE" })).toMatch(/afastado preventivamente/);
    expect(mm.textoAutoDenuncia({ nome: "Ana", tipo: "PROCESSO_CRIMINAL" })).toMatch(/processo criminal/);
  });
});

describe("a máscara do painel da gestão (achados do ensaio no banco: nada reservado vaza, nem nas contagens nem na situação das certidões)", () => {
  const linhaCom = (id, extra) => ({ membroId: id, nome: `Pessoa ${id}`, congregacaoId: 1, congregacaoNome: "Central", equipes: ["Infantil"], aptidao: mm.avaliarAptidao(emDia(extra), { hoje: HOJE }) });
  const linhas = [
    linhaCom(1, { vistoria: vistoriaOk({ resultado: "COM_RESTRICAO" }) }), linhaCom(2, { autoDenunciaAberta: true }), linhaCom(3, { cadastroNacional: "CONSTA" }),
    linhaCom(4, { membro: { ...emDia().membro, status: "INATIVO" } }), linhaCom(5, { treinamento: null }), linhaCom(6)
  ];
  test("o resumo da gestão conta os motivos reservados como 'pendência com a Diretoria'; o da Diretoria os conta como são", () => {
    const gestao = mm.resumirPainel(linhas);
    expect(gestao.bloqueados).toBe(5);
    expect(gestao.porMotivo).toEqual({ PENDENCIA_DIRETORIA: 4, TREINAMENTO_AUSENTE: 1 });
    expect(JSON.stringify(gestao)).not.toMatch(/RESTRICAO|AUTO_DENUNCIA|CADASTRO_NACIONAL|COMUNHAO/);
    const diretoria = mm.resumirPainel(linhas, { reservado: true });
    expect(diretoria.porMotivo).toEqual({ ANTECEDENTES_COM_RESTRICAO: 1, AUTO_DENUNCIA_EM_ANALISE: 1, CADASTRO_NACIONAL: 1, FORA_DE_COMUNHAO: 1, TREINAMENTO_AUSENTE: 1 });
  });
  test("o agrupamento por congregação segue a mesma máscara", () => {
    expect(JSON.stringify(mm.agruparPorCongregacao(linhas))).not.toMatch(/RESTRICAO|AUTO_DENUNCIA|CADASTRO_NACIONAL|COMUNHAO/);
    expect(mm.agruparPorCongregacao(linhas, { reservado: true })[0].porMotivo.ANTECEDENTES_COM_RESTRICAO).toBe(1);
  });
  test("a situação das certidões 'COM_RESTRICAO' vira 'pendência com a Diretoria' para a gestão, sem alterar o original", () => {
    const v = linhas[0].aptidao.validades;
    expect(v.antecedentes.situacao).toBe("COM_RESTRICAO");
    expect(mm.validadesParaGestao(v).antecedentes).toEqual({ situacao: "PENDENCIA_DIRETORIA", validoAte: null, emitidaEm: null });
    expect(v.antecedentes.situacao).toBe("COM_RESTRICAO");                     // o original não muda
    expect(mm.validadesParaGestao(linhas[5].aptidao.validades).antecedentes.situacao).toBe("VIGENTE");
    expect(mm.validadesParaGestao(undefined)).toEqual({});
  });
  test("o painel leva só código e rótulo (a mensagem fala 'você' e é da própria pessoa); a Diretoria vê todos os códigos", () => {
    const b = mm.bloqueiosParaPainel(linhas[4].aptidao.bloqueios);
    expect(b).toEqual([{ codigo: "TREINAMENTO_AUSENTE", rotulo: "Sem treinamento de proteção" }]);
    expect(mm.bloqueiosParaPainel(linhas[0].aptidao.bloqueios).map((x) => x.codigo)).toEqual(["PENDENCIA_DIRETORIA"]);
    expect(mm.bloqueiosParaPainel(linhas[0].aptidao.bloqueios, { reservado: true }).map((x) => x.codigo)).toEqual(["ANTECEDENTES_COM_RESTRICAO"]);
    const datas = mm.bloqueiosParaPainel(mm.avaliarAptidao(emDia({ membro: { ...emDia().membro, dataAdmissao: "2026-08-01" } }), { hoje: HOJE }).bloqueios);
    expect(datas[0]).toMatchObject({ codigo: "SEIS_MESES", elegivelEm: "2027-02-01" });
  });
});
