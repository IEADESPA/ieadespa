// Trava 7-C — a base legal do ROPA e do RIPD conferida contra o texto da LGPD.
// O Art. 11, II, da LGPD (dado sensível sem consentimento) tem só as alíneas a) obrigação legal ou regulatória, b) políticas públicas, c) órgão de pesquisa,
// d) exercício regular de direitos (inclusive em contrato e em processo judicial, administrativo e arbitral), e) proteção da vida ou da incolumidade física,
// f) tutela da saúde (só por profissional ou serviço de saúde ou autoridade sanitária) e g) prevenção à fraude. NÃO existe hipótese "organização religiosa", e o
// legítimo interesse (Art. 7º, IX) não serve de base para dado sensível (convicção religiosa é sensível: Art. 5º, II).
const { REGISTROS_TRATAMENTO } = require("../ropa");
const { RIPDS } = require("../ripd");

const reg = (chave) => {
  const r = REGISTROS_TRATAMENTO.find((x) => x.chave === chave);
  if (!r) throw new Error(`ROPA sem a entrada ${chave}`);
  return r;
};
const ripd = (chave) => RIPDS.find((x) => x.chave === chave);

describe("ROPA — base legal (Trava 7-C)", () => {
  test("nenhuma entrada usa a hipótese inexistente 'organização religiosa' nem a alínea \"a\" para o vínculo de membro", () => {
    for (const r of REGISTROS_TRATAMENTO) {
      expect(r.baseLegal).not.toMatch(/organiza[çc][ãa]o religiosa/i);
      expect(r.baseLegal).not.toMatch(/11, II, \\?"?a\\?"?\s*—\s*(organiza|comunica|obriga[çc][ãa]o estatut)/i);
    }
  });

  test.each(["MEMBRESIA", "EBD", "FORMACAO", "CALENDARIO", "VINCULO_FAMILIAR_MENOR", "COMUNICACAO", "COMUNICACAO_MEMBROS"])(
    "%s: exercício regular de direitos da associação religiosa (Art. 11, II, \"d\")", (chave) => {
      const b = reg(chave).baseLegal;
      expect(b).toMatch(/11, II, \\?"d\\?"/);
      expect(b).toMatch(/exerc[ií]cio regular de direitos/i);
      expect(b).not.toMatch(/11, II, \\?"?a\b/);
    });

  test("membresia cita o Código Civil e a Constituição; criança leva o Art. 14", () => {
    expect(reg("MEMBRESIA").baseLegal).toMatch(/C[óo]digo Civil arts\. 44, IV e § 1º, e 53 a 61/);
    expect(reg("MEMBRESIA").baseLegal).toMatch(/CF art\. 5º, VI/);
    expect(reg("VINCULO_FAMILIAR_MENOR").baseLegal).toMatch(/Art\. 14/);
    expect(reg("EBD").baseLegal).toMatch(/Art\. 14/);
  });

  test("formação não se apoia no legítimo interesse (dado sensível)", () => {
    expect(reg("FORMACAO").baseLegal).not.toMatch(/7º, IX/);
  });

  test("disciplina: exercício regular de direitos em processo administrativo interno (CC art. 57)", () => {
    const b = reg("DISCIPLINA").baseLegal;
    expect(b).toMatch(/11, II, \\?"d\\?"/);
    expect(b).toMatch(/processo administrativo interno/);
    expect(b).toMatch(/C[óo]digo Civil art\. 57/);
    expect(b).not.toMatch(/\\?"c\\?"/);
  });

  test("financeiro: obrigação legal da entidade imune (CTN art. 14, III) e exercício regular de direitos", () => {
    const b = reg("FINANCEIRO").baseLegal;
    expect(b).toMatch(/11, II, \\?"a\\?" — obriga[çc][ãa]o legal/);
    expect(b).toMatch(/CTN art\. 14, III/);
    expect(b).toMatch(/\\?"d\\?" — exerc[ií]cio regular de direitos/);
  });

  test("incidentes de proteção: obrigação legal (ECA 13 e 70-B; Lei 14.344) e proteção da vida — sem o Art. 245 e sem 'tutela da saúde'", () => {
    const b = reg("INCIDENTES_DE_PROTECAO").baseLegal;
    expect(b).toMatch(/11, II, \\?"a\\?"/);
    expect(b).toMatch(/70-B, par[áa]grafo [úu]nico/);
    expect(b).toMatch(/14\.344\/2022, arts\. 23 e 26/);
    expect(b).toMatch(/\\?"e\\?" — prote[çc][ãa]o da vida/);
    expect(b).not.toMatch(/245/);
    expect(b).not.toMatch(/tutela da sa[úu]de/i);
  });

  test("cuidado pastoral: exercício regular de direitos (d), proteção da vida (e) e consentimento (I) — nunca o legítimo interesse; o mural do site está no registro", () => {
    const r = reg("CUIDADO_PASTORAL");
    expect(r.baseLegal).not.toMatch(/7º, IX/);
    expect(r.baseLegal).toMatch(/11, II, \\?"d\\?"/);
    expect(r.baseLegal).toMatch(/\\?"e\\?" — prote[çc][ãa]o da vida/);
    expect(r.baseLegal).toMatch(/Art\. 11, I — consentimento/);
    expect(r.titulares).toMatch(/mural de ora[çc][ãa]o do SITE/);
    expect(r.titulares).toMatch(/Directus → sistema, servidor a servidor/);
    expect(r.categoriasDados.join(" ")).toMatch(/origem SITE/);
  });

  test("ECA 59-A: nenhuma entrada afirma que toda entidade com crianças está obrigada; a exigência é adotada por cautela", () => {
    for (const r of REGISTROS_TRATAMENTO) {
      expect(`${r.finalidade} ${r.baseLegal}`).not.toMatch(/entidades que atuam com crian[çc]as/i);
      if (/59-A/.test(r.baseLegal)) {
        expect(r.baseLegal).toMatch(/recurso p[úu]blico/);
        expect(r.baseLegal).toMatch(/educacionais e similares/);
      }
    }
    expect(reg("MINISTERIO_COM_MENORES").baseLegal).toMatch(/por cautela/);
    expect(reg("VISTORIA_ANTECEDENTES").baseLegal).toMatch(/por cautela/);
  });
});

describe("RIPD (Trava 7-C)", () => {
  test("o comentário velho de 'nota pastoral sem módulo' saiu e o mural do site está no RIPD da nota pastoral", () => {
    const fonte = require("fs").readFileSync(require.resolve("../ripd"), "utf8");
    expect(fonte).not.toMatch(/não têm NENHUM módulo/);
    expect(ripd("NOTA_PASTORAL").tratamento).toMatch(/mural de ora[çc][ãa]o do SITE/);
    expect(ripd("NOTA_PASTORAL").medidasMitigacao.join(" ")).toMatch(/Mural do site/);
  });
  test("a decisão de não ter RIPD próprio da v7.15 está registrada com o porquê", () => {
    const fonte = require("fs").readFileSync(require.resolve("../ripd"), "utf8");
    expect(fonte).toMatch(/v7\.15 \(crise e\s*\n?\/\/ segurança\) NÃO tem entrada própria/);
  });
  test("o risco dos incidentes não atribui a multa do Art. 245 à Igreja", () => {
    expect(ripd("INCIDENTES_DE_PROTECAO").riscoIdentificado).not.toMatch(/tem multa/);
  });
});
