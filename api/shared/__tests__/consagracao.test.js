// v8.3 — Consagração e documentação: a regra pura (shared/consagracao.js) e o texto da migração 158. O banco e os handlers são provados no LocalDB
// (tools/e2e-localdb, e2e-55 a e2e-58).
const fs = require("fs");
const path = require("path");
const regra = require("../consagracao");

const HOJE = "2026-10-28";
const ctx = (extra) => ({ alvo: "DIACONO", estadoCivil: "CASADO", hojeIso: HOJE, dataProtocolo: "2026-09-01", ...extra });
const apto = (extra) => ({ resultado: "APTO", sabatinaEm: "2026-10-20", fundamentacao: "Vida e testemunho examinados; nada impede.", ...extra });

describe("parecer do CEI (Art. 74, III; 9º; 73)", () => {
  test("APTO simples para Diácono casado", () => {
    const v = regra.validarParecer(apto(), ctx());
    expect(v.valido).toBe(true);
    expect(v.parecer).toMatchObject({ resultado: "APTO", sabatinaEm: "2026-10-20", escrutinioConjugal: false, sabatinaVidaPregressa: null });
  });
  test("resultado, data e fundamentação são obrigatórios", () => {
    expect(regra.validarParecer({ ...apto(), resultado: "TALVEZ" }, ctx()).valido).toBe(false);
    expect(regra.validarParecer({ ...apto(), sabatinaEm: "2026-11-01" }, ctx()).mensagem).toMatch(/futuro/);
    expect(regra.validarParecer({ ...apto(), sabatinaEm: "2026-08-31" }, ctx()).mensagem).toMatch(/antes do protocolo/);
    expect(regra.validarParecer({ ...apto(), sabatinaEm: "2026-02-30" }, ctx()).valido).toBe(false);
    expect(regra.validarParecer({ ...apto(), fundamentacao: "ok" }, ctx()).valido).toBe(false);
    expect(regra.validarParecer({ ...apto(), fundamentacao: 42 }, ctx()).valido).toBe(false);
  });
  test("Presbítero, Evangelista e Pastor: o APTO pede a sabatina completa do Art. 9º §1º", () => {
    for (const alvo of ["PRESBITERO", "EVANGELISTA", "PASTOR"]) {
      const c = ctx({ alvo });
      expect(regra.validarParecer(apto(), c).mensagem).toMatch(/Art\. 9º §1º/);
      expect(regra.validarParecer(apto({ sabatina: { vidaPregressa: true, regularidadeFinanceira: true } }), c).valido).toBe(false);
      expect(regra.validarParecer(apto({ sabatina: { vidaPregressa: true, regularidadeFinanceira: true, alinhamentoDoutrinario: "sim" } }), c).valido).toBe(false);
      const ok = regra.validarParecer(apto({ sabatina: { vidaPregressa: true, regularidadeFinanceira: true, alinhamentoDoutrinario: true } }), c);
      expect(ok.valido).toBe(true);
      expect(ok.parecer).toMatchObject({ sabatinaVidaPregressa: true, sabatinaFinanceira: true, sabatinaDoutrina: true });
    }
    // o INAPTO não exige a sabatina completa (o CEI pode concluir pela falta de um item)
    expect(regra.validarParecer({ ...apto(), resultado: "INAPTO", sabatina: { vidaPregressa: false } }, ctx({ alvo: "PRESBITERO" })).valido).toBe(true);
    // Auxiliar a Diácono: a sabatina do Art. 9º não se aplica (fica em branco)
    expect(regra.validarParecer(apto({ sabatina: { vidaPregressa: true } }), ctx()).parecer.sabatinaVidaPregressa).toBeNull();
  });
  test("divorciado(a): o escrutínio especial é obrigatório para o APTO (Art. 73, III)", () => {
    const c = ctx({ estadoCivil: "DIVORCIADO" });
    expect(regra.validarParecer(apto(), c).mensagem).toMatch(/tempo da ignorância/);
    expect(regra.validarParecer(apto({ escrutinio: { fundamento: "TEMPO_IGNORANCIA" } }), c).mensagem).toMatch(/documentalmente/);
    expect(regra.validarParecer(apto({ escrutinio: { fundamento: "TEMPO_IGNORANCIA", documental: true } }), c).mensagem).toMatch(/recasada/);
    expect(regra.validarParecer(apto({ escrutinio: { fundamento: "TEMPO_IGNORANCIA", documental: true, recasado: true } }), c).mensagem).toMatch(/Art\. 73, III, d/);
    const ok = regra.validarParecer(apto({ escrutinio: { fundamento: "EXCECAO_BIBLICA", documental: true, recasado: true, casamentoEstavel: true } }), c);
    expect(ok.valido).toBe(true);
    expect(ok.parecer).toMatchObject({ escrutinioConjugal: true, escrutinioFundamento: "EXCECAO_BIBLICA", escrutinioDocumental: true, recasado: true, casamentoAtualEstavel: true });
    expect(regra.validarParecer(apto({ escrutinio: { fundamento: "QUALQUER", documental: true, recasado: false } }), c).valido).toBe(false);
    // não recasado: o casamento atual não se pergunta
    expect(regra.validarParecer(apto({ escrutinio: { fundamento: "TEMPO_IGNORANCIA", documental: true, recasado: false, casamentoEstavel: true } }), c).parecer.casamentoAtualEstavel).toBeNull();
  });
  test("o CEI marca histórico de ruptura que o cadastro não mostra; o INAPTO de divorciado não exige o escrutínio completo", () => {
    expect(regra.validarParecer(apto({ escrutinio: { historico: true } }), ctx()).valido).toBe(false);
    expect(regra.validarParecer({ ...apto(), resultado: "INAPTO" }, ctx({ estadoCivil: "DIVORCIADO" })).valido).toBe(true);
    expect(regra.validarParecer({ ...apto(), resultado: "INAPTO" }, ctx({ estadoCivil: "DIVORCIADO" })).parecer.escrutinioConjugal).toBe(true);
  });
  test("Pastor não casado: o APTO pede o motivo da exceção (Art. 73, II, b); casado não", () => {
    const sab = { sabatina: { vidaPregressa: true, regularidadeFinanceira: true, alinhamentoDoutrinario: true } };
    expect(regra.validarParecer(apto(sab), ctx({ alvo: "PASTOR", estadoCivil: "SOLTEIRO" })).mensagem).toMatch(/celibato/);
    expect(regra.validarParecer(apto(sab), ctx({ alvo: "PASTOR", estadoCivil: null })).mensagem).toMatch(/celibato/);
    expect(regra.validarParecer(apto({ ...sab, excecaoPastorNaoCasado: "curta" }), ctx({ alvo: "PASTOR", estadoCivil: "VIUVO" })).valido).toBe(false);
    const ok = regra.validarParecer(apto({ ...sab, excecaoPastorNaoCasado: "Dom de celibato reconhecido pela Convenção, idade avançada." }), ctx({ alvo: "PASTOR", estadoCivil: "SOLTEIRO" }));
    expect(ok.valido).toBe(true);
    expect(regra.validarParecer(apto(sab), ctx({ alvo: "PASTOR", estadoCivil: "CASADO" })).valido).toBe(true);
    expect(regra.validarParecer(apto({ ...sab, excecaoPastorNaoCasado: "não se aplica a casado" }), ctx({ alvo: "PASTOR", estadoCivil: "CASADO" })).parecer.excecaoPastorNaoCasado).toBeNull();
    expect(regra.validarParecer(apto(sab), ctx({ alvo: "EVANGELISTA", estadoCivil: "SOLTEIRO" })).valido).toBe(true);   // só o Pastor
  });
});

describe("taxa de consagração (Art. 75, I)", () => {
  const ce = { dataCerimonia: "2026-12-20", valorTaxa: 70 };
  test("o prazo é 45 dias antes da cerimônia", () => {
    expect(regra.prazoDaTaxa("2026-12-20")).toBe("2026-11-05");
    expect(regra.prazoDaTaxa("2027-03-01")).toBe("2027-01-15");
  });
  test("em dia: paga até o prazo e no valor da cerimônia", () => {
    expect(regra.situacaoDaTaxa({ taxaPagaEm: "2026-11-05", taxaValor: 70 }, ce)).toEqual({ emDia: true, motivo: null });
    expect(regra.situacaoDaTaxa({ taxaPagaEm: "2026-11-06", taxaValor: 70 }, ce).motivo).toMatch(/depois do prazo \(até 05\/11\/2026\)/);
    expect(regra.situacaoDaTaxa({ taxaPagaEm: "2026-10-01", taxaValor: 69.99 }, ce).motivo).toMatch(/menor que a taxa da cerimônia \(R\$ 70,00\)/);
    expect(regra.situacaoDaTaxa({ taxaPagaEm: "2026-10-01", taxaValor: 80 }, ce).emDia).toBe(true);
    expect(regra.situacaoDaTaxa({ taxaPagaEm: null }, ce)).toEqual({ emDia: false, motivo: "taxa não paga" });
    expect(regra.situacaoDaTaxa({ taxaPagaEm: "2026-10-01", taxaValor: 1 }, null).emDia).toBe(true);   // sem cerimônia ainda: só "paga"
  });
  test("validação do registro", () => {
    expect(regra.validarTaxa({ pagoEm: "2026-10-20", valor: 70, forma: "PIX" }, HOJE)).toEqual({ valido: true, taxa: { pagoEm: "2026-10-20", valor: 70, forma: "PIX" } });
    expect(regra.validarTaxa({ pagoEm: "2026-10-20", valor: "70.50", forma: "BOLETO" }, HOJE).taxa.valor).toBe(70.5);
    expect(regra.validarTaxa({ pagoEm: "2026-10-20", valor: 70, forma: "DINHEIRO" }, HOJE).mensagem).toMatch(/PIX ou boleto/);
    expect(regra.validarTaxa({ pagoEm: "2026-10-29", valor: 70, forma: "PIX" }, HOJE).valido).toBe(false);
    for (const valor of [0, -5, 70.123, "abc", 10001, null, undefined, {}]) expect(regra.validarTaxa({ pagoEm: "2026-10-20", valor, forma: "PIX" }, HOJE).valido).toBe(false);
  });
});

describe("cerimônia (Art. 75)", () => {
  test("validação: data, local, ocasião e valor (R$ 70,00 se não vier)", () => {
    const ok = regra.validarCerimonia({ dataCerimonia: "2027-01-10", local: "Templo Sede", ocasiao: "AGO" }, HOJE);
    expect(ok).toEqual({ valido: true, cerimonia: { dataCerimonia: "2027-01-10", local: "Templo Sede", ocasiao: "AGO", valorTaxa: 70 } });
    expect(regra.validarCerimonia({ dataCerimonia: "2027-01-10", local: "Templo Sede", ocasiao: "CULTO" }, HOJE).mensagem).toMatch(/Assembleia Geral Ordinária/);
    expect(regra.validarCerimonia({ dataCerimonia: "2027-02-30", local: "Templo Sede", ocasiao: "AGO" }, HOJE).valido).toBe(false);
    expect(regra.validarCerimonia({ dataCerimonia: "2029-01-10", local: "Templo Sede", ocasiao: "AGO" }, HOJE).mensagem).toMatch(/longe demais/);
    expect(regra.validarCerimonia({ dataCerimonia: "2025-01-10", local: "Templo Sede", ocasiao: "AGO" }, HOJE).mensagem).toMatch(/antiga demais/);
    expect(regra.validarCerimonia({ dataCerimonia: "2027-01-10", local: "x", ocasiao: "AGO" }, HOJE).valido).toBe(false);
    expect(regra.validarCerimonia({ dataCerimonia: "2027-01-10", local: "Templo", ocasiao: "SOLENE_CLI", valorTaxa: "75.40" }, HOJE).cerimonia.valorTaxa).toBe(75.4);
    expect(regra.validarCerimonia({ dataCerimonia: "2027-01-10", local: "Templo", ocasiao: "MAGNA_CLI", valorTaxa: 0 }, HOJE).valido).toBe(false);
  });
  test("Comissão de Unção: pastores titulares em atividade, no mínimo 4, nenhum candidato (Art. 75, IV, c)", () => {
    const pastor = (id, extra) => ({ membroId: id, nome: `P${id}`, cargo: "PASTOR", status: "ATIVO", emComunhao: true, ...extra });
    expect(regra.validarComissao([1, 2, 3, 4].map((i) => pastor(i)), new Set())).toMatchObject({ valida: true, validos: 4, problemas: [] });
    expect(regra.validarComissao([1, 2, 3].map((i) => pastor(i)), new Set())).toMatchObject({ valida: false, validos: 3 });
    const r = regra.validarComissao([pastor(1), pastor(2), pastor(3), pastor(4, { cargo: "PRESBITERO" }), pastor(5, { status: "LICENCA" }), pastor(6, { emComunhao: false }), pastor(7)], new Set([7]));
    expect(r.valida).toBe(false);
    expect(r.problemas).toEqual(["P4: não é Pastor", "P5: não está em atividade", "P6: não está em atividade", "P7: é candidato nesta cerimônia"]);
  });
  test("roteiro: por patente, casal lado a lado, diplomação de outra convenção, insígnias e pendências", () => {
    const ce = { dataCerimonia: "2026-12-20", valorTaxa: 70 };
    const pago = { taxaPagaEm: "2026-10-01", taxaValor: 70 };
    const proc = (id, nome, cargoAlvo, extra) => ({ consagracaoId: `c${id}`, membroId: id, nome, cargoAlvo, modalidade: "INDICACAO", ...pago, ...extra });
    const r = regra.montarRoteiro(ce, [
      proc(1, "Bruno", "DIACONO"), proc(2, "Ana", "MISSIONARIO"), proc(3, "Carlos", "AUXILIAR"), proc(4, "Davi", "PASTOR", { modalidade: "OUTRA_CONVENCAO" }),
      proc(5, "Elias", "PRESBITERO", { taxaPagaEm: null }), proc(6, "Fábio", "AUXILIAR", { taxaPagaEm: "2026-11-20" })
    ], [[1, 2], [2, 1], [3, 99]]);
    expect(r.posicoes.map((p) => p.pessoas.map((x) => x.nome))).toEqual([["Carlos"], ["Ana", "Bruno"], ["Davi"]]);
    expect(r.posicoes[1]).toMatchObject({ casal: true, patente: "DIACONO" });
    expect(r.posicoes[2].pessoas[0].ato).toBe("DIPLOMACAO");
    expect(r.posicoes[0].pessoas[0].ato).toBe("UNCAO");
    expect(r.insignias).toEqual([
      { cargo: "AUXILIAR", rotulo: "Auxiliar", quantidade: 1 }, { cargo: "MISSIONARIO", rotulo: "Missionário(a)", quantidade: 1 },
      { cargo: "DIACONO", rotulo: "Diácono", quantidade: 1 }, { cargo: "PASTOR", rotulo: "Pastor", quantidade: 1 }
    ]);
    expect(r.pendentes.map((p) => [p.nome, p.motivo])).toEqual([["Elias", "taxa não paga"], ["Fábio", "taxa paga depois do prazo (até 05/11/2026)"]]);
    expect(r.prazoTaxa).toBe("2026-11-05");
  });
  test("o cônjuge com a taxa pendente não entra no par (o outro segue sozinho)", () => {
    const ce = { dataCerimonia: "2026-12-20", valorTaxa: 70 };
    const r = regra.montarRoteiro(ce, [
      { consagracaoId: "a", membroId: 1, nome: "Bruno", cargoAlvo: "DIACONO", modalidade: "INDICACAO", taxaPagaEm: "2026-10-01", taxaValor: 70 },
      { consagracaoId: "b", membroId: 2, nome: "Ana", cargoAlvo: "MISSIONARIO", modalidade: "INDICACAO", taxaPagaEm: null }
    ], [[1, 2]]);
    expect(r.posicoes).toHaveLength(1);
    expect(r.posicoes[0].casal).toBe(false);
  });
  test("textos do diploma e do CHM", () => {
    expect(regra.textoDiploma({ cargoAlvo: "DIACONO", modalidade: "INDICACAO", dataCerimonia: "2026-12-20", ocasiao: "AGO" })).toEqual({
      titulo: "Diploma de Consagração — Diácono",
      descricao: "foi consagrado(a) ao cargo de Diácono em 20/12/2026, na Assembleia Geral Ordinária, na forma do Regimento Interno, Art. 75."
    });
    expect(regra.textoDiploma({ cargoAlvo: "PASTOR", modalidade: "OUTRA_CONVENCAO", dataCerimonia: "2026-12-20", ocasiao: "SOLENE_CLI" }).titulo).toBe("Diploma de Reconhecimento Ministerial — Pastor");
    expect(regra.textoDiploma({ cargoAlvo: "PASTOR", modalidade: "OUTRA_CONVENCAO", dataCerimonia: "2026-12-20", ocasiao: "SOLENE_CLI" }).descricao).toMatch(/Art\. 10/);
    expect(regra.textoCHM("2026-10-01")).toEqual({ titulo: "Certificado de Habilitação Ministerial (CHM)", descricao: "está habilitado(a) pela Academia de Formação Ministerial desde 01/10/2026, na forma do Regimento Interno, Art. 67." });
  });
  test("quem a CLI homologa: Presbítero, Evangelista e Pastor (Art. 7º, III)", () => {
    expect(["AUXILIAR", "MISSIONARIO", "DIACONO", "PRESBITERO", "EVANGELISTA", "PASTOR"].map(regra.homologacaoPelaCLI)).toEqual([false, false, false, true, true, true]);
  });
});

describe("migração 158", () => {
  const texto = fs.readFileSync(path.join(__dirname, "../../../sql/migrations/158_consagracao_documentacao.sql"), "utf8");
  test("HOMOLOGADO entra no 'um processo em andamento por pessoa' (o índice da v8.2 é refeito só se ainda não tem a etapa)", () => {
    expect(texto).toMatch(/filter_definition NOT LIKE N'%HOMOLOGADO%'/);
    expect(texto).toMatch(/Status IN \(N'PROTOCOLADO', N'EM_ANALISE_CONSELHO', N'AGUARDANDO_PLENARIO', N'HOMOLOGADO'\)/);
  });
  test("um parecer por processo; resultado e fundamento fechados; código do diploma único", () => {
    expect(texto).toMatch(/CONSTRAINT UX_PareceresCEI_Consagracao UNIQUE \(ConsagracaoId\)/);
    expect(texto).toMatch(/Resultado IN \(N'APTO', N'INAPTO'\)/);
    expect(texto).toMatch(/UX_Consagracoes_DiplomaCodigo ON dbo\.Consagracoes \(DiplomaCodigo\) WHERE DiplomaCodigo IS NOT NULL/);
    expect(texto).toMatch(/TaxaForma IN \(N'PIX', N'BOLETO'\)/);
    expect(texto).toMatch(/Natureza IN \(N'CHM', N'DIPLOMA'\)/);
  });
  test("idempotente: cada alteração atrás de um IF", () => {
    const alteracoes = texto.split(/\nGO\b/).filter((b) => /ALTER TABLE|CREATE (UNIQUE )?INDEX|CREATE TABLE|DROP INDEX/.test(b));
    for (const b of alteracoes) expect(b).toMatch(/IF (NOT )?EXISTS|IF COL_LENGTH/);
  });
});
