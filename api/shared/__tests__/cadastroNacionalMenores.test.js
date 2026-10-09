// O adapter do cadastro nacional (v7.7): pronto, sem dependência. Sem provedor não faz nada; com provedor, só três resultados valem; a fonte fora do ar nunca bloqueia ninguém.
jest.mock("../db", () => ({ sql: new Proxy({}, { get: () => () => undefined }) }));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true) }));
const { registrarAuditoria } = require("../auditoria");
const mm = require("../ministerioMenores");
const cn = require("../cadastroNacionalMenores");

const AMB = { CADASTRO_NACIONAL_MENORES_PROVEDOR: "TESTE" };
const poolDe = (gravacoes) => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (t) => { gravacoes.push({ sql: t, inputs }); return { recordset: [{ id: 41 }] }; } }; return r; } });
afterEach(() => { cn.removerProvedor("TESTE"); jest.clearAllMocks(); });

describe("sem provedor (o estado de hoje): nada acontece", () => {
  test("consultar responde 'não configurado' e consultarEGravar não grava nem audita", async () => {
    expect(await cn.consultar({ membroId: 1 }, AMB)).toEqual({ configurado: false });
    const grava = [];
    const r = await cn.consultarEGravar(poolDe(grava), { membroId: 1, por: 5, ambiente: AMB });
    expect(r).toMatchObject({ sucesso: false, configurado: false });
    expect(grava).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("provedor nomeado na variável mas nunca registrado também é 'não configurado'", async () => {
    expect((await cn.consultar({ membroId: 1 }, { CADASTRO_NACIONAL_MENORES_PROVEDOR: "FANTASMA" })).configurado).toBe(false);
  });
  test("a aptidão ignora a ausência de consulta e a consulta indisponível; só 'CONSTA' bloqueia", () => {
    const base = { membro: { dataNascimento: "1990-01-01", dataAdmissao: "2016-01-01", status: "ATIVO", situacao: "ATIVO" }, esteira: { existe: true, status: "APTO", validoAte: "2030-01-01" },
      vistoria: { vistoriaId: 1, resultado: "SEM_RESTRICAO", documentos: [{ tipo: "ANTECEDENTES_FEDERAL", dataEmissao: "2026-09-01" }, { tipo: "ANTECEDENTES_ESTADUAL", dataEmissao: "2026-09-01" }] },
      treinamento: { modo: "MANUAL", atestadoEm: "2026-01-01" }, fichaEm: "2026-09-01", politicaVersaoAceita: 1, politicaVersaoVigente: 1, autoDenunciaAberta: false };
    for (const c of [null, "NADA_CONSTA", "INDISPONIVEL"]) expect(mm.avaliarAptidao({ ...base, cadastroNacional: c }, { hoje: "2026-10-09" }).apto).toBe(true);
    expect(mm.avaliarAptidao({ ...base, cadastroNacional: "CONSTA" }, { hoje: "2026-10-09" }).bloqueios.map((b) => b.codigo)).toEqual(["CADASTRO_NACIONAL"]);
  });
});

describe("com provedor registrado", () => {
  test("só os três resultados valem; lixo, erro e provedor que lança viram INDISPONIVEL (nunca 'consta')", async () => {
    for (const [resposta, esperado] of [[{ resultado: "NADA_CONSTA" }, "NADA_CONSTA"], [{ resultado: "CONSTA", fonte: "CNCM" }, "CONSTA"], [{ resultado: "talvez" }, "INDISPONIVEL"], [null, "INDISPONIVEL"], [undefined, "INDISPONIVEL"], ["CONSTA", "INDISPONIVEL"], [{ resultado: ["CONSTA"] }, "INDISPONIVEL"]]) {
      cn.registrarProvedor("TESTE", async () => resposta);
      expect((await cn.consultar({ membroId: 1 }, AMB)).resultado).toBe(esperado);
    }
    cn.registrarProvedor("TESTE", async () => { throw new Error("fora do ar"); });
    expect(await cn.consultar({ membroId: 1 }, AMB)).toEqual({ configurado: true, resultado: "INDISPONIVEL", fonte: "TESTE" });
  });
  test("o provedor recebe só matrícula, nome e nascimento (nada de outro dado do cadastro)", async () => {
    const visto = [];
    cn.registrarProvedor("TESTE", async (d) => { visto.push(d); return { resultado: "NADA_CONSTA" }; });
    await cn.consultar({ membroId: 7, nome: "Ana", dataNascimento: "1990-01-01", email: "x@e.org", telefone: "1", senha: "s" }, AMB);
    expect(visto[0]).toEqual({ membroId: 7, nome: "Ana", dataNascimento: "1990-01-01" });
  });
  test("grava a linha de acréscimo e audita só o fato da consulta (o resultado fica na tabela restrita)", async () => {
    cn.registrarProvedor("TESTE", async () => ({ resultado: "CONSTA", fonte: "F".repeat(80) }));
    const grava = [];
    const r = await cn.consultarEGravar(poolDe(grava), { membroId: 7, por: 5, ambiente: AMB });
    expect(r).toMatchObject({ sucesso: true, resultado: "CONSTA" });
    expect(r.fonte.length).toBe(40);
    expect(grava[0].inputs).toMatchObject({ m: 7, r: "CONSTA", por: 5 });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "MENORES_CADASTRO_NACIONAL_CONSULTADO", registroId: 41, dadosDepois: { membroId: 7 } });
    expect(JSON.stringify(registrarAuditoria.mock.calls[0][0])).not.toMatch(/CONSTA/);
  });
  test("o nome do provedor e a função são validados", () => {
    for (const ruim of ["", "minusculo", "COM ESPACO", "X", "A".repeat(41), null, 5]) expect(() => cn.registrarProvedor(ruim, async () => ({}))).toThrow();
    expect(() => cn.registrarProvedor("OK_NOME", "não é função")).toThrow();
  });
});
