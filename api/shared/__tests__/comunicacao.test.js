// v7.12 — a regra pura da comunicação (shared/comunicacao.js): textos de consentimento com impressão digital, modelos, grupos, o link de saída e o e-mail.
const cm = require("../comunicacao");

describe("o consentimento", () => {
  test("cada categoria com consentimento tem o seu texto e a sua impressão digital; a convocação não tem (é obrigação)", () => {
    for (const k of cm.CATEGORIAS_COM_CONSENTIMENTO) {
      expect(cm.textoConsentimento(k)).toMatch(new RegExp(cm.CATEGORIAS[k].rotulo));
      expect(cm.hashDoTexto(k)).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(cm.textoConsentimento("CONVOCACAO")).toBeNull();
    expect(new Set(cm.CATEGORIAS_COM_CONSENTIMENTO.map(cm.hashDoTexto)).size).toBe(3);
    expect(cm.CATEGORIAS.CONVOCACAO.obrigatoria).toBe(true);
  });
  test("o texto diz que dá para sair a qualquer hora e cita a LGPD", () => {
    expect(cm.textoConsentimento("EVENTOS")).toMatch(/desmarcar quando quiser/);
    expect(cm.textoConsentimento("EVENTOS")).toMatch(/LGPD/);
    expect(cm.TEXTO_SAIDA).toMatch(/convocação oficial continua/);
  });
  test("WhatsApp e SMS não aparecem como canal (decisão de 22/10/2026), mas estão previstos", () => {
    expect(Object.keys(cm.CANAIS)).toEqual(["EMAIL", "PUSH"]);
    expect(cm.CANAIS_PREVISTOS).toEqual(["WHATSAPP", "SMS"]);
  });
});

describe("o modelo", () => {
  const ok = { categoria: "EVENTOS", titulo: "Congresso de jovens", corpo: "Olá, {{ primeiro_nome }}! O congresso será na {{congregacao}}." };
  test("válido: os campos ficam na forma canônica", () => {
    const r = cm.validarModelo(ok);
    expect(r.dados.corpo).toBe("Olá, {{primeiro_nome}}! O congresso será na {{congregacao}}.");
    expect(r.dados.chave).toBeNull();
  });
  test.each([
    [{ ...ok, categoria: "MARKETING" }, /categoria/],
    [{ ...ok, titulo: "ab" }, /título/],
    [{ ...ok, titulo: "linha\noutra linha" }, /uma linha só/],
    [{ ...ok, corpo: "curto" }, /texto/],
    [{ ...ok, corpo: "x".repeat(2001) }, /2000/],
    [{ ...ok, corpo: "Olá {{nome_completo}}, tudo bem com você?" }, /\{\{nome_completo\}\} não existe/],
    [{ ...ok, corpo: "Olá {{primeiro_nome}, tudo bem com você?" }, /chaves/],
    [{ ...ok, corpo: "texto com zero​width no meio" }, /invisível/],
    [{ ...ok, titulo: 5 }, /título/],
    [{ ...ok, chave: "Maiúscula" }, /Código/]
  ])("recusa %#", (dados, msg) => { expect(cm.validarModelo(dados).problema).toMatch(msg); });
  test("preencher usa o primeiro nome e a congregação; sem nome, um tratamento neutro", () => {
    expect(cm.preencher("Olá, {{primeiro_nome}} da {{congregacao}}", { nome: "Maria  das Dores", congregacao: "Central" })).toBe("Olá, Maria da Central");
    expect(cm.preencher("{{primeiro_nome}}", { nome: "" })).toBe("irmão(ã)");
  });
  test("o sininho corta em 1.000 e avisa onde está o resto", () => {
    expect(cm.textoDoSininho("a".repeat(1000))).toHaveLength(1000);
    const t = cm.textoDoSininho("a".repeat(1500));
    expect(t).toHaveLength(1000);
    expect(t).toMatch(/Meu Painel → Comunicações\)$/);
  });
  test("chaveDoTitulo é legível e única", () => {
    const a = cm.chaveDoTitulo("Convocação da AGO 2027"), b = cm.chaveDoTitulo("Convocação da AGO 2027");
    expect(a).toMatch(/^convocacao-da-ago-2027-[0-9a-f]{6}$/);
    expect(a).not.toBe(b);
    expect(cm.chaveDoTitulo("!!")).toMatch(/^comunicado-/);
  });
});

describe("o grupo", () => {
  test("normaliza: mesmos campos, ordem e sem repetidos (o JSON guardado é comparável)", () => {
    const r = cm.validarCriterios({ territorio: { tipo: "CONGREGACAO", ids: [3, 1, 3] }, cargos: ["PRESBITERO", "DIACONO"], ebdProfessores: true });
    expect(r.criterios).toEqual({ territorio: { tipo: "CONGREGACAO", ids: [1, 3] }, cargos: ["DIACONO", "PRESBITERO"], departamentos: [], lideranca: false, ebdProfessores: true,
      formacaoVencendoDias: null, habilitacaoVencendoDias: null, assembleiaGeral: false });
    expect(cm.validarCriterios({}).criterios.territorio).toEqual({ tipo: "TODAS", ids: [] });
  });
  test.each([
    [null], [[]], [{ dizimistas: true }], [{ territorio: { tipo: "SETOR", ids: [1] } }], [{ territorio: { tipo: "AREA", ids: [] } }],
    [{ territorio: { tipo: "TODAS", ids: [1] } }], [{ territorio: { tipo: "AREA", ids: ["1"] } }], [{ territorio: { tipo: "AREA", ids: [1.5] } }],
    [{ cargos: ["diacono"] }], [{ cargos: "DIACONO" }], [{ departamentos: Array.from({ length: 51 }, (_, i) => i + 1) }], [{ lideranca: "sim" }],
    [{ formacaoVencendoDias: 366 }], [{ habilitacaoVencendoDias: -1 }], [{ formacaoVencendoDias: "30" }]
  ])("recusa %j", (entrada) => { expect(cm.validarCriterios(entrada).problema).toBeTruthy(); });
  test("não existe critério de dízimo (decisão de 22/10/2026)", () => {
    expect(cm.validarCriterios({ dizimistasInativosDias: 90 }).problema).toMatch(/desconhecido/);
  });
  test("descreve em português", () => {
    const c = cm.validarCriterios({ territorio: { tipo: "CONGREGACAO", ids: [1] }, cargos: ["DIACONO"], formacaoVencendoDias: 0, assembleiaGeral: true }).criterios;
    expect(cm.descreverCriterios(c, { territorio: { 1: "Central" }, cargos: { DIACONO: "Diácono" } }))
      .toBe("Congregação Central · Diácono · Formação vencida · Com direito a voto na Assembleia Geral");
    expect(cm.descreverCriterios(cm.validarCriterios({}).criterios)).toBe("Todas as congregações");
  });
});

describe("o link de saída", () => {
  const S = "segredo-de-teste";
  test("assina e lê de volta; outra assinatura, outro segredo ou vencido: nada", () => {
    const t = cm.assinarSaida(S, { membroId: 7, categoria: "EVENTOS", envioId: 3 });
    expect(cm.lerSaida(S, t)).toEqual({ membroId: 7, categoria: "EVENTOS", envioId: 3 });
    expect(cm.lerSaida("outro", t)).toBeNull();
    const [corpo, ass] = t.split(".");
    const outroCorpo = Buffer.from(JSON.stringify({ m: 8, c: "EVENTOS", e: 3, x: Date.now() + 1e9 })).toString("base64url");
    expect(cm.lerSaida(S, `${outroCorpo}.${ass}`)).toBeNull();
    expect(cm.lerSaida(S, `${corpo}.${ass}.x`)).toBeNull();
    expect(cm.lerSaida(S, t, Date.now() + 401 * 86400000)).toBeNull();
    expect(cm.lerSaida(S, 5)).toBeNull();
  });
  test("não existe link de saída da convocação (nem forjado com a assinatura certa)", () => {
    expect(cm.lerSaida(S, cm.assinarSaida(S, { membroId: 7, categoria: "CONVOCACAO", envioId: 3 }))).toBeNull();
  });
  test("a assinatura do link não serve como crachá de sessão (chave derivada)", () => {
    const crypto = require("crypto");
    const t = cm.assinarSaida(S, { membroId: 7, categoria: "EVENTOS", envioId: 3 });
    const [corpo, ass] = t.split(".");
    expect(crypto.createHmac("sha256", S).update(corpo).digest("base64url")).not.toBe(ass);
  });
});

describe("o e-mail", () => {
  test("a convocação diz por que chega a todos e não tem link de saída; as outras têm", () => {
    const c = cm.montarEmail({ titulo: "AGO", corpo: "Fica convocada…", categoria: "CONVOCACAO", linkSair: "https://x/sair" });
    expect(c.texto).toMatch(/obrigação do Estatuto/);
    expect(c.html).not.toMatch(/sair/);
    const e = cm.montarEmail({ titulo: "Congresso", corpo: "Venha!", categoria: "EVENTOS", linkSair: "https://app/sair.html?t=a.b" });
    expect(e.texto).toMatch(/https:\/\/app\/sair\.html\?t=a\.b/);
    expect(e.html).toMatch(/<a href="https:\/\/app\/sair\.html\?t=a\.b">Não quero mais receber por e-mail<\/a>/);
  });
  test("o texto escrito vai escapado no HTML", () => {
    const e = cm.montarEmail({ titulo: "t", corpo: "<script>alert(1)</script>\nlinha 2", categoria: "DEVOCIONAL", linkSair: "https://x\"onmouseover=\"y" });
    expect(e.html).not.toMatch(/<script>/);
    expect(e.html).toMatch(/&lt;script&gt;alert\(1\)&lt;\/script&gt;<br>linha 2/);
    expect(e.html).toMatch(/href="https:\/\/x&quot;onmouseover=&quot;y"/);
  });
});
