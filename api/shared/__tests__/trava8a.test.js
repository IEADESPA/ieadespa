// Trava 8-A — as regras puras que a trava mudou: a licença para oficiar como regra única (batismo, Comissão de Unção, QR), a CIADSETA e o PDF da via digital.
const afm = require("../afm");
const consagracao = require("../consagracao");
const credencial = require("../credencial");

describe("licença para oficiar: a mesma regra em todo lugar", () => {
  const pastor = { cargo: "PASTOR", statusMatricula: "ATIVA", status: "ATIVO", situacaoMembro: "EM_COMUNHAO" };
  test("Pastor em dia oficia", () => expect(afm.licencaLiturgica(pastor).podeOficiar).toBe(true));
  test.each([
    ["suspenso (sanção ou afastamento cautelar)", { afastado: true }],
    ["exclusão (também a pendente do CEI)", { excluido: true }],
    ["Disciplina Rigorosa", { foraDaComunhao: true }],
    ["sem comunhão no cadastro", { situacaoMembro: "SEM_COMUNHAO" }],
    ["de licença", { status: "LICENÇA" }],
    ["AFM inativa", { statusMatricula: "INATIVA" }]
  ])("%s: não oficia", (_, extra) => expect(afm.licencaLiturgica({ ...pastor, ...extra }).podeOficiar).toBe(false));
  test("o motivo da disciplina nunca aparece (a liderança local lê a recusa)", () => {
    const m = afm.licencaLiturgica({ ...pastor, afastado: true }).motivo;
    expect(m).toMatch(/Secretaria Geral/);
    expect(m).not.toMatch(/san[cç][aã]o|suspens|exclus/i);
  });
  test("quem chama só com cargo e matrícula (antes da trava) continua com a resposta de antes", () => {
    expect(afm.licencaLiturgica({ cargo: "DIACONO", statusMatricula: "ATIVA" }).podeOficiar).toBe(true);
    expect(afm.licencaLiturgica({ cargo: null, statusMatricula: "ATIVA" }).podeOficiar).toBe(false);
  });
  test("a Comissão de Unção recusa o Pastor que não está habilitado", () => {
    const p = (membroId, habilitado) => ({ membroId, nome: `P${membroId}`, cargo: "PASTOR", status: "ATIVO", emComunhao: true, habilitado });
    const v = consagracao.validarComissao([p(1, true), p(2, true), p(3, true), p(4, false)], new Set());
    expect(v.valida).toBe(false);
    expect(v.problemas).toEqual(["P4: não está em atividade"]);
    expect(consagracao.validarComissao([p(1, true), p(2, true), p(3, true), p(5, true)], new Set()).valida).toBe(true);
  });
  test("o QR diz o mesmo: membro ativo, obreiro inativo", () => {
    const pessoa = { nome: "X", status: "ATIVO", situacaoMembro: "EM_COMUNHAO", cargo: "PASTOR", statusMatricula: "ATIVA", sobDisciplina: true, excluido: false, foraDaComunhao: false };
    expect(credencial.situacaoPublica({ situacao: "VALIDA", via: 1 }, pessoa)).toMatchObject({ situacao: "ATIVA", funcao: "INATIVO" });
    expect(credencial.situacaoPublica({ situacao: "VALIDA", via: 1 }, { ...pessoa, sobDisciplina: false })).toMatchObject({ situacao: "ATIVA", funcao: "HABILITADO" });
    expect(credencial.situacaoPublica({ situacao: "VALIDA", via: 1 }, { ...pessoa, sobDisciplina: false, status: "LICENÇA" })).toMatchObject({ situacao: "ATIVA", funcao: "INATIVO" });
  });
});

describe("CIADSETA (Art. 72, V, a)", () => {
  test("Evangelista e Pastor precisam, também quem vem de outra convenção (decisão de 29/10/2026); os outros cargos, não", () => {
    expect(consagracao.precisaConvencao("EVANGELISTA", "NOMEACAO_PRESIDENCIAL")).toBe(true);
    expect(consagracao.precisaConvencao("PASTOR", "INDICACAO")).toBe(true);
    expect(consagracao.precisaConvencao("PASTOR", "OUTRA_CONVENCAO")).toBe(true);
    expect(consagracao.precisaConvencao("PRESBITERO", "INDICACAO")).toBe(false);
    expect(consagracao.precisaConvencao(null, "INDICACAO")).toBe(false);
  });
});

describe("o PDF da credencial", () => {
  const { pdfDaCredencial } = require("../pdfCredencial");
  const c = { nome: "Fulano", matricula: 15, categoria: "Membro", congregacao: "Sede", via: 1, codigo: "ABCD-EFGH-JKLM-NPQR", url: "https://app.ieadespa.org.br/credencial.html?c=X", emitidaEmDia: "2026-10-29" };
  test("a via que a própria pessoa baixa diz VIA DIGITAL; a da Secretaria, não (Art. 76 §2º)", async () => {
    const PDFDocument = require("pdfkit");
    const original = PDFDocument.prototype.text;
    const escritos = [];
    PDFDocument.prototype.text = function (t, ...resto) { escritos.push(String(t)); return original.call(this, t, ...resto); };
    try {
      await pdfDaCredencial(c, null, { viaDigital: true });
      expect(escritos.some((t) => /VIA DIGITAL/.test(t))).toBe(true);
      escritos.length = 0;
      await pdfDaCredencial(c, null);
      expect(escritos.some((t) => /VIA DIGITAL/.test(t))).toBe(false);
      expect(escritos.some((t) => /Sem data de validade/.test(t))).toBe(true);
    } finally {
      PDFDocument.prototype.text = original;
    }
  });
});

describe("Art. 77 — a suspensão terminada não devolve a função (decisão de 29/10/2026)", () => {
  const { CARENCIA_SQL } = require("../disciplina");
  const { anexarInfracoesEPrazo } = require("../disciplinar");
  const { criarPoolFalso } = require("./testUtils");
  const { sqlFalso } = require("./testUtils");
  test("a carência vale para a suspensão com o prazo vencido, sem a prova aprovada (nunca para a advertência nem para a recusa do CEI)", () => {
    expect(CARENCIA_SQL).toMatch(/DataTerminoPrevisao < CAST\(SYSUTCDATETIME\(\) AS DATE\)/);
    expect(CARENCIA_SQL).toMatch(/ResultadoProvaReintegracao, ''\) <> 'APROVADO'/);
    expect(CARENCIA_SQL).toMatch(/NOT IN \('ADVERTENCIA', 'DISCIPLINA_RIGOROSA'\)/);
    expect(CARENCIA_SQL).toMatch(/CEIRecusouEm IS NULL/);
  });
  test("a lista dos processos marca a carência e oferece a prova", async () => {
    const base = { processoId: 1, status: "JULGADO", resultado: "SANCAO", penalidadeCodigo: "SUSPENSAO_TEMPORARIA", orgaoSigla: "TER", dataConclusao: "2026-01-01" };
    const { pool } = criarPoolFalso([[], [], [], [], [], [], [], []]);
    const [vencida, correndo, aprovada, advertencia] = await anexarInfracoesEPrazo(pool, sqlFalso, [
      { ...base, dataTerminoPrevisao: "2026-02-01" },
      { ...base, processoId: 2, dataTerminoPrevisao: "2999-01-01" },
      { ...base, processoId: 3, dataTerminoPrevisao: "2026-02-01", resultadoProvaReintegracao: "APROVADO" },
      { ...base, processoId: 4, dataTerminoPrevisao: "2026-02-01", penalidadeCodigo: "ADVERTENCIA" }
    ]);
    expect(vencida.emCarenciaAdministrativa).toBe(true);
    expect(correndo.emCarenciaAdministrativa).toBe(false);
    expect(aprovada.emCarenciaAdministrativa).toBe(false);
    expect(advertencia.emCarenciaAdministrativa).toBe(false);
  });
});
