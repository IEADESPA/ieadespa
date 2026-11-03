// v9.1 — Entidades vinculadas (Estatuto Art. 64 a 68; Regimento Art. 47-A e 153): a regra pura (CNPJ, tipos, formação do gestor, indicação, períodos da prestação
// de contas, prazo de 15 dias e caducidade, decretação, extinção) e a porta da rota com o handler de verdade e o banco simulado pelo TEXTO da consulta.
// O comportamento contra o SQL Server (CHECK, índices únicos, transações, corridas, avisos) é coberto pelo roteiro ponta a ponta (tools/e2e-localdb, e2e-69 e e2e-70).
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => {
  const rodar = async (texto, inputs) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor, afetadas] of mockRegras) {
      if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, recordsets: [], rowsAffected: [afetadas === undefined ? 1 : afetadas] };
    }
    return { recordset: [], recordsets: [], rowsAffected: [/^\s*(UPDATE|DELETE)\b/i.test(texto) ? 1 : 0] };
  };
  const novaRequisicao = () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: (texto) => rodar(texto, inputs) }; return r; };
  class Transaction { async begin() { } async commit() { } async rollback() { } }
  class Request { constructor() { return novaRequisicao(); } }
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => ({ request: novaRequisicao }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../canaisDb", () => ({ ...jest.requireActual("../canaisDb"), notificarAgora: jest.fn(async () => ({ criadas: 1 })) }));
jest.mock("../notificacoes", () => ({ ...jest.requireActual("../notificacoes"), resolverDestinatariosPorPermissao: jest.fn(async () => []) }));

const ev = require("../entidadesVinculadas");
const auth = require("../auth");
const handler = require("../../GestaoEntidadesVinculadas/index.js");

const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const GERAL = (permissoes = ["entidades_vinculadas"], id = 1) => tokenDe(id, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes });
const LOCAL = (permissoes = ["entidades_vinculadas"], id = 5) => tokenDe(id, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], permissoes });
const PIN = (id = 10) => tokenDe(id, { via: "PIN", permissoes: ["entidades_vinculadas"] });
async function chamar(acao, { metodo = "GET", query = {}, corpo = {}, token } = {}) {
  const context = { bindingData: { acao }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  const qs = {}; for (const [k, v] of Object.entries(query)) qs[k] = v == null ? v : String(v);   // a query string chega SEMPRE em texto
  await handler(context, { method: metodo, query: qs, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const escritas = () => mockConsultas.filter((c) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(c.sql) && !/CaducadaEm = @h/.test(c.sql));
beforeEach(() => { mockRegras = []; mockConsultas = []; });

describe("CNPJ (Art. 64: CNPJ próprio de matriz 0001; o alfanumérico da IN RFB 2.229/2024)", () => {
  test("numérico válido, com ou sem máscara", () => {
    expect(ev.validarCnpj("11.222.333/0001-81", { matriz: true })).toEqual({ valido: true, cnpj: "11222333000181" });
    expect(ev.validarCnpj(" 11222333000181 ").valido).toBe(true);
  });
  test("alfanumérico: o exemplo oficial da Receita confere (letras minúsculas também)", () => {
    expect(ev.validarCnpj("12.ABC.345/01DE-35")).toEqual({ valido: true, cnpj: "12ABC34501DE35" });
    expect(ev.validarCnpj("12abc34501de35").valido).toBe(true);
  });
  test("dígito errado, repetido, tamanho errado, letra nos dígitos e tipo errado são recusados", () => {
    expect(ev.validarCnpj("11222333000180").valido).toBe(false);
    expect(ev.validarCnpj("11111111111111").valido).toBe(false);
    expect(ev.validarCnpj("1122233300018").valido).toBe(false);
    expect(ev.validarCnpj("12ABC34501DEA5").valido).toBe(false);
    expect(ev.validarCnpj(11222333000181).valido).toBe(false);
    expect(ev.validarCnpj(null).valido).toBe(false);
    expect(ev.validarCnpj(["11222333000181"]).valido).toBe(false);
  });
  test("filial (ordem diferente de 0001) não é cadastrada como entidade vinculada", () => {
    expect(ev.validarCnpj("12ABC34501DE35", { matriz: true }).mensagem).toMatch(/matriz/);
    expect(ev.validarCnpj("12ABC34501DE35", { matriz: false }).valido).toBe(true);
  });
  test("formatar", () => expect(ev.formatarCnpj("12ABC34501DE35")).toBe("12.ABC.345/01DE-35"));
});

describe("tipos e a formação do gestor (Reg. Art. 153)", () => {
  test("tipo: natureza obrigatória; formações sem repetição (acento e caixa não contam)", () => {
    expect(ev.validarTipo({ nome: "Creche", natureza: "xx" }).valido).toBe(false);
    const v = ev.validarTipo({ nome: " Hospital  Geral ", natureza: "saude", formacoes: ["Medicina", "medicina", "Gestão Hospitalar", "GESTAO HOSPITALAR"] });
    expect(v.valido).toBe(true);
    expect(v.dados).toEqual({ nome: "Hospital Geral", natureza: "SAUDE", formacoes: ["Medicina", "Gestão Hospitalar"] });
    expect(ev.validarTipo({ nome: "X", natureza: "SAUDE" }).valido).toBe(false);
    expect(ev.validarTipo({ nome: "Escola", natureza: "EDUCACAO", formacoes: "Pedagogia" }).valido).toBe(false);
    expect(ev.validarTipo({ nome: "Escola", natureza: "EDUCACAO", formacoes: Array(21).fill("Pedagogia") }).valido).toBe(false);
  });
  test("formacaoAtende: compara sem acento e sem caixa; tipo sem exigência aceita tudo", () => {
    expect(ev.formacaoAtende("pedagogia ", ["Pedagogia"])).toBe(true);
    expect(ev.formacaoAtende("gestao hospitalar", ["Gestão hospitalar", "Medicina"])).toBe(true);
    expect(ev.formacaoAtende("Administração", ["Gestão hospitalar", "Medicina"])).toBe(false);
    expect(ev.formacaoAtende(null, ["Pedagogia"])).toBe(false);
    expect(ev.formacaoAtende(null, [])).toBe(true);
  });
});

describe("entidade e indicação de dirigente", () => {
  const BASE = { razaoSocial: "Escola Cristã Esperança", cnpj: "11.222.333/0001-81", tipoId: "2", finalidade: "Educação básica para a comunidade do bairro." };
  test("entidade: campos obrigatórios, UF e o tipo", () => {
    expect(ev.validarEntidade(BASE).valido).toBe(true);
    expect(ev.validarEntidade({ ...BASE, tipoId: "0x2" }).valido).toBe(false);
    expect(ev.validarEntidade({ ...BASE, uf: "XX" }).valido).toBe(false);
    expect(ev.validarEntidade({ ...BASE, uf: "pa" }).dados.uf).toBe("PA");
    expect(ev.validarEntidade({ ...BASE, finalidade: "curta" }).valido).toBe(false);
    expect(ev.validarEntidade({ ...BASE, razaoSocial: "x".repeat(151) }).valido).toBe(false);
    expect(ev.validarEntidade({ ...BASE, cnpj: "11222333000262" }).valido).toBe(false);   // filial
  });
  const IND = { funcao: "DIRETOR_PRESIDENTE", membroId: "7", indicacaoAto: "Portaria 3/2026", indicadoEm: "2026-10-01" };
  const hoje = "2026-11-03";
  test("membro OU profissional de fora, nunca os dois nem nenhum", () => {
    expect(ev.validarIndicacao(IND, { hoje }).valido).toBe(true);
    expect(ev.validarIndicacao({ ...IND, nomeExterno: "Fulano de Tal" }, { hoje }).valido).toBe(false);
    expect(ev.validarIndicacao({ ...IND, membroId: null }, { hoje }).valido).toBe(false);
    expect(ev.validarIndicacao({ ...IND, membroId: null, nomeExterno: "Dra. Maria Souza" }, { hoje }).valido).toBe(true);
  });
  test("gestor técnico exige a formação; OUTRA exige o nome da função", () => {
    expect(ev.validarIndicacao({ ...IND, funcao: "GESTOR_TECNICO" }, { hoje }).valido).toBe(false);
    expect(ev.validarIndicacao({ ...IND, funcao: "GESTOR_TECNICO", formacao: "Pedagogia" }, { hoje }).valido).toBe(true);
    expect(ev.validarIndicacao({ ...IND, funcao: "OUTRA" }, { hoje }).valido).toBe(false);
    expect(ev.validarIndicacao({ ...IND, funcao: "OUTRA", funcaoDescricao: "Ouvidor" }, { hoje }).dados.funcaoDescricao).toBe("Ouvidor");
    expect(ev.validarIndicacao({ ...IND, funcao: "REI" }, { hoje }).valido).toBe(false);
  });
  test("data da indicação no futuro e mandato antes da indicação são recusados", () => {
    expect(ev.validarIndicacao({ ...IND, indicadoEm: "2026-11-04" }, { hoje }).valido).toBe(false);
    expect(ev.validarIndicacao({ ...IND, mandatoAte: "2026-09-30" }, { hoje }).valido).toBe(false);
    expect(ev.validarIndicacao({ ...IND, mandatoAte: "2028-12-31" }, { hoje }).dados.mandatoAte).toBe("2028-12-31");
    expect(ev.validarIndicacao({ ...IND, mandatoAte: "2028-02-30" }, { hoje }).valido).toBe(false);
  });
  test("mandato vencido aparece, não some", () => {
    expect(ev.situacaoDirigente({ status: "HOMOLOGADO", mandatoAte: "2026-11-02" }, hoje)).toBe("MANDATO_VENCIDO");
    expect(ev.situacaoDirigente({ status: "HOMOLOGADO", mandatoAte: "2026-11-03" }, hoje)).toBe("HOMOLOGADO");
  });
});

describe("intervenção: 5 dias para o gestor (Art. 65 §3º) e 15 dias para a CLI (Reg. Art. 47-A §2º)", () => {
  const APUR = { status: "APURACAO", notificadoEm: "2026-11-01" };
  const DEC = { fundamentacao: "Balanço do ano sem auditoria e contas bancárias bloqueadas por dívida fiscal.", interventorNome: "Contador José da Silva" };
  test("o prazo fatal é a decretação + 15 dias; no 15º dia ainda vale, no 16º perdeu a eficácia", () => {
    expect(ev.prazoRatificacao("2026-11-03")).toBe("2026-11-18");
    const iv = { status: "DECRETADA", prazoRatificacao: "2026-11-18" };
    expect(ev.estadoEfetivo(iv, "2026-11-18")).toBe("DECRETADA");
    expect(ev.intervencaoVale(iv, "2026-11-18")).toBe(true);
    expect(ev.estadoEfetivo(iv, "2026-11-19")).toBe("CADUCADA");
    expect(ev.intervencaoVale(iv, "2026-11-19")).toBe(false);
    expect(ev.intervencaoVale({ status: "RATIFICADA", prazoRatificacao: "2026-11-18" }, "2027-05-01")).toBe(true);
    expect(ev.intervencaoVale({ status: "ENCERRADA", prazoRatificacao: "2026-11-18" }, "2026-11-10")).toBe(false);
  });
  test("a reunião que ratifica é entre a decretação e o 15º dia (inclusive)", () => {
    const iv = { decretadaEm: "2026-11-03", prazoRatificacao: "2026-11-18" };
    expect(ev.reuniaoNoPrazo("2026-11-03", iv)).toBe(true);
    expect(ev.reuniaoNoPrazo("2026-11-18", iv)).toBe(true);
    expect(ev.reuniaoNoPrazo("2026-11-19", iv)).toBe(false);
    expect(ev.reuniaoNoPrazo("2026-11-02", iv)).toBe(false);
    expect(ev.reuniaoNoPrazo(null, iv)).toBe(false);
  });
  test("sem urgência: só depois dos 5 dias da notificação", () => {
    expect(ev.validarDecretacao(DEC, { iv: APUR, hoje: "2026-11-05" }).mensagem).toMatch(/06\/11\/2026/);
    const v = ev.validarDecretacao(DEC, { iv: APUR, hoje: "2026-11-06" });
    expect(v.valido).toBe(true);
    expect(v.dados).toMatchObject({ decretadaEm: "2026-11-06", prazoRatificacao: "2026-11-21", urgencia: false, afastaDiretoria: false });
    expect(ev.validarDecretacao(DEC, { iv: { status: "APURACAO", notificadoEm: null }, hoje: "2026-11-06" }).valido).toBe(false);
  });
  test("com urgência: sem esperar, mas com a justificativa", () => {
    const iv = { status: "APURACAO", notificadoEm: null };
    expect(ev.validarDecretacao({ ...DEC, urgencia: true }, { iv, hoje: "2026-11-03" }).valido).toBe(false);
    expect(ev.validarDecretacao({ ...DEC, urgencia: true, urgenciaJustificativa: "Saque iminente de toda a conta do hospital." }, { iv, hoje: "2026-11-03" }).valido).toBe(true);
  });
  test("só sobre apuração aberta; fundamentação de verdade; interventor membro OU nome", () => {
    expect(ev.validarDecretacao(DEC, { iv: { ...APUR, status: "DECRETADA" }, hoje: "2026-11-06" }).valido).toBe(false);
    expect(ev.validarDecretacao({ ...DEC, fundamentacao: "curta" }, { iv: APUR, hoje: "2026-11-06" }).valido).toBe(false);
    expect(ev.validarDecretacao({ ...DEC, interventorMembroId: "9" }, { iv: APUR, hoje: "2026-11-06" }).valido).toBe(false);
    expect(ev.validarDecretacao({ ...DEC, interventorNome: null }, { iv: APUR, hoje: "2026-11-06" }).valido).toBe(false);
    expect(ev.validarDecretacao({ ...DEC, interventorNome: null, interventorMembroId: 9 }, { iv: APUR, hoje: "2026-11-06" }).dados.interventorMembroId).toBe(9);
  });
  test("apuração: motivo do Art. 47-A §1º e os fatos", () => {
    expect(ev.validarApuracao({ motivo: "desvio_finalidade", fatos: "Recursos da escola usados em evento da igreja." }).dados.motivo).toBe("DESVIO_FINALIDADE");
    expect(ev.validarApuracao({ motivo: "ANTIPATIA", fatos: "Recursos da escola usados em evento da igreja." }).valido).toBe(false);
    expect(ev.validarApuracao({ motivo: "RISCO_IMAGEM", fatos: "curto" }).valido).toBe(false);
  });
});

describe("prestação de contas: períodos calculados e atraso na leitura (mesmo mecanismo da v5.4)", () => {
  test("anual desde o ano do vínculo, até o que contém hoje", () => {
    const p = ev.periodosDesde("2024-08-15", "ANUAL", 120, "2026-11-03");
    expect(p.map((x) => x.codigo)).toEqual(["2024", "2025", "2026"]);
    expect(p[0]).toMatchObject({ inicio: "2024-01-01", fim: "2024-12-31", prazo: "2025-04-30" });
  });
  test("semestral e trimestral", () => {
    expect(ev.periodosDesde("2026-05-10", "SEMESTRAL", 60, "2026-11-03").map((x) => x.codigo)).toEqual(["2026-S1", "2026-S2"]);
    const t = ev.periodosDesde("2026-02-01", "TRIMESTRAL", 30, "2026-11-03");
    expect(t.map((x) => x.codigo)).toEqual(["2026-T1", "2026-T2", "2026-T3", "2026-T4"]);
    expect(t[0]).toMatchObject({ fim: "2026-03-31", prazo: "2026-04-30" });
    expect(ev.periodosDesde(null, "ANUAL", 120, "2026-11-03")).toEqual([]);
  });
  test("situação: em curso, prazo correndo (até o dia do prazo), atrasada (no dia seguinte), entregue, apreciada; CF pendente no período que fecha o ano", () => {
    let per = ev.periodosDesde("2024-01-10", "ANUAL", 120, "2025-04-30");
    let s = ev.situacaoDosPeriodos(per, [], "2025-04-30");
    expect(s.map((x) => x.situacao)).toEqual(["NO_PRAZO", "EM_CURSO"]);
    s = ev.situacaoDosPeriodos(per, [], "2025-05-01");
    expect(s[0].situacao).toBe("ATRASADA");
    per = ev.periodosDesde("2024-01-10", "ANUAL", 120, "2026-11-03");
    s = ev.situacaoDosPeriodos(per, [{ periodo: "2024", resultado: null, cfResultado: null }, { periodo: "2025", resultado: "APROVADA", cfResultado: "SEM_CONFUSAO" }], "2026-11-03");
    expect(s.map((x) => x.situacao)).toEqual(["ENTREGUE", "APRECIADA", "EM_CURSO"]);
    expect(s.map((x) => x.cfPendente)).toEqual([true, false, false]);
  });
  test("o código do período só vale na periodicidade dele", () => {
    expect(ev.periodoDoCodigo("2026-S3", "SEMESTRAL", 10)).toBeNull();
    expect(ev.periodoDoCodigo("2026-T2", "SEMESTRAL", 10)).toBeNull();
    expect(ev.periodoDoCodigo("2026", "TRIMESTRAL", 10)).toBeNull();
    expect(ev.periodoDoCodigo("2026-t2", "TRIMESTRAL", 10)).toMatchObject({ codigo: "2026-T2", inicio: "2026-04-01", fim: "2026-06-30" });
  });
  test("a entrega: depois do fim do período, com o relatório, o balanço auditado e quem auditou", () => {
    const periodo = { fim: "2025-12-31" };
    const ok = { entregueEm: "2026-03-10", relatorioAtividades: true, balancoAuditado: true, auditoriaOrgao: "Conselho Fiscal da Escola" };
    expect(ev.validarEntrega(ok, { periodo, hoje: "2026-11-03" }).valido).toBe(true);
    expect(ev.validarEntrega({ ...ok, entregueEm: "2025-12-31" }, { periodo, hoje: "2026-11-03" }).valido).toBe(false);
    expect(ev.validarEntrega({ ...ok, balancoAuditado: false }, { periodo, hoje: "2026-11-03" }).valido).toBe(false);
    expect(ev.validarEntrega({ ...ok, relatorioAtividades: "nao" }, { periodo, hoje: "2026-11-03" }).valido).toBe(false);
    expect(ev.validarEntrega({ ...ok, auditoriaOrgao: "" }, { periodo, hoje: "2026-11-03" }).valido).toBe(false);
  });
});

describe("extinção: o destino do patrimônio segue a natureza (Art. 68)", () => {
  const D = { destinatarioNome: "Hospital Beneficente São Lucas" };
  test("saúde vai a outra instituição de saúde ou à Matriz com afetação assistencial (com a confirmação)", () => {
    expect(ev.validarExtincao({ ...D, destinoPatrimonio: "SAUDE_OUTRA_INSTITUICAO" }, { natureza: "SAUDE" }).valido).toBe(true);
    expect(ev.validarExtincao({ ...D, destinoPatrimonio: "SAUDE_MATRIZ_ASSISTENCIAL" }, { natureza: "SAUDE" }).valido).toBe(false);
    expect(ev.validarExtincao({ ...D, destinoPatrimonio: "SAUDE_MATRIZ_ASSISTENCIAL", matrizMantemAssistencia: true }, { natureza: "SAUDE" }).valido).toBe(true);
    expect(ev.validarExtincao({ ...D, destinoPatrimonio: "EDUCACAO_CONGENERE" }, { natureza: "SAUDE" }).valido).toBe(false);
  });
  test("educação só para instituição de ensino congênere; as demais para congênere sem fins", () => {
    expect(ev.validarExtincao({ ...D, destinoPatrimonio: "EDUCACAO_CONGENERE" }, { natureza: "EDUCACAO" }).valido).toBe(true);
    expect(ev.validarExtincao({ ...D, destinoPatrimonio: "CONGENERE_SEM_FINS" }, { natureza: "EDUCACAO" }).valido).toBe(false);
    expect(ev.validarExtincao({ ...D, destinoPatrimonio: "CONGENERE_SEM_FINS" }, { natureza: "ASSISTENCIA_SOCIAL" }).valido).toBe(true);
    expect(ev.validarExtincao({ ...D, destinoPatrimonio: "SAUDE_MATRIZ_ASSISTENCIAL", matrizMantemAssistencia: true }, { natureza: "OUTRA" }).valido).toBe(false);
  });
  test("o CNPJ de quem recebe, se vier, é conferido", () => {
    expect(ev.validarExtincao({ ...D, destinoPatrimonio: "SAUDE_OUTRA_INSTITUICAO", destinatarioCnpj: "11222333000180" }, { natureza: "SAUDE" }).valido).toBe(false);
    expect(ev.validarExtincao({ ...D, destinoPatrimonio: "SAUDE_OUTRA_INSTITUICAO", destinatarioCnpj: "11.222.333/0001-81" }, { natureza: "SAUDE" }).dados.destinatarioCnpj).toBe("11222333000181");
  });
});

describe("textos e identificadores", () => {
  test("idDe estrito", () => {
    expect(ev.idDe("12")).toBe(12);
    expect(ev.idDe(12)).toBe(12);
    for (const ruim of ["0x10", "1e1", "1.5", "-1", "0", true, [5], {}, "", null, "2147483648", 1.5]) expect(ev.idDe(ruim)).toBeNull();
  });
  test("texto: tira caractere de controle, junta espaços e respeita o tamanho; objeto e número são recusados", () => {
    expect(ev.texto("  a\u0000b   c ", { maximo: 10, rotulo: "X" }).texto).toBe("a b c");
    expect(ev.texto("linha 1\r\n\r\n\r\n\r\nlinha 2", { maximo: 50, rotulo: "X", multilinha: true }).texto).toBe("linha 1\n\nlinha 2");
    expect(ev.texto({ a: 1 }, { maximo: 10, rotulo: "X" }).valido).toBe(false);
    expect(ev.texto(5, { maximo: 10, rotulo: "X" }).valido).toBe(false);
    expect(ev.texto("x".repeat(11), { maximo: 10, rotulo: "X" }).valido).toBe(false);
    expect(ev.texto("", { maximo: 10, rotulo: "X", obrigatorio: false })).toEqual({ valido: true, texto: null });
  });
  test("o aviso do prazo conta os dias", () => {
    expect(ev.textoPrazoIntervencao({ entidade: "Hospital X", prazo: "2026-11-18", hoje: "2026-11-03" })).toMatch(/faltam 15 dias/);
    expect(ev.textoPrazoIntervencao({ entidade: "Hospital X", prazo: "2026-11-18", hoje: "2026-11-17" })).toMatch(/amanhã/);
    expect(ev.textoPrazoIntervencao({ entidade: "Hospital X", prazo: "2026-11-18", hoje: "2026-11-18" })).toMatch(/HOJE/);
  });
});

describe("a porta da rota /api/entidades-vinculadas", () => {
  const TODAS = [["GET", "catalogos"], ["GET", "painel"], ["GET", "entidades"], ["GET", "entidade"], ["GET", "tipos"], ["GET", "reunioes"],
    ...["tipo", "tipo-editar", "entidade", "entidade-editar", "vinculo-aprovar", "vinculo-nao-aprovar", "assembleia", "prestacao-config", "dirigente-indicar", "dirigente-homologar",
      "dirigente-recusar", "dirigente-encerrar", "apuracao-abrir", "apuracao-notificar", "apuracao-manifestacao", "apuracao-arquivar", "apuracao-reabrir", "intervencao-decretar",
      "intervencao-ratificar", "intervencao-defesa", "intervencao-encerrar", "prestacao-registrar", "prestacao-apreciar", "prestacao-cf", "extinguir"].map((a) => ["POST", a])];
  test("sem sessão: 401 em todas, nada consultado", async () => {
    for (const [metodo, acao] of TODAS) expect((await chamar(acao, { metodo })).status).toBe(401);
    expect(mockConsultas).toHaveLength(0);
  });
  test("sessão de PIN (de membro), permissão de nível local ou outra permissão: 403 ANTES de qualquer consulta", async () => {
    for (const token of [PIN(), LOCAL(), GERAL(["pessoas", "financeiro"])]) {
      for (const [metodo, acao] of TODAS) expect((await chamar(acao, { metodo, token })).status).toBe(403);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("nível geral: o identificador chega em TEXTO e vale; lixo é 400 sem gravar nada", async () => {
    quando(/FROM EntidadesVinculadas e JOIN EntidadeTipos t ON t.TipoId = e.TipoId WHERE e.EntidadeId = @id/, (i) => (i.id === 3 ? [] : []));
    expect((await chamar("entidade", { query: { entidadeId: 3 }, token: GERAL() })).status).toBe(404);
    for (const ruim of ["0x3", "3.0", "-3", "abc", ""]) expect((await chamar("entidade", { query: { entidadeId: ruim }, token: GERAL() })).status).toBe(400);
    for (const corpo of [{}, { entidadeId: "1e1" }, { entidadeId: true }, { entidadeId: [1] }]) {
      expect((await chamar("vinculo-aprovar", { metodo: "POST", corpo, token: GERAL() })).status).toBe(400);
    }
    expect(escritas()).toHaveLength(0);
  });
  test("ação desconhecida: 404; método errado: 405", async () => {
    expect((await chamar("nada", { token: GERAL() })).status).toBe(404);
    expect((await chamar("nada", { metodo: "POST", token: GERAL() })).status).toBe(404);
    expect((await chamar("painel", { metodo: "DELETE", token: GERAL() })).status).toBe(405);
  });
  test("reuniões: só CLI ou AG", async () => {
    expect((await chamar("reunioes", { query: { orgao: "CEI" }, token: GERAL() })).status).toBe(400);
    expect((await chamar("reunioes", { query: { orgao: "cli" }, token: GERAL() })).status).toBe(200);
  });
  test("decretar sem ser o Pastor Presidente em exercício: 403, nada gravado", async () => {
    quando(/FROM EntidadeIntervencoes i LEFT JOIN MembroReferencia mi/, [{ IntervencaoId: 4, EntidadeId: 2, Status: "APURACAO", NotificadoEm: "2026-10-01", Motivo: "RISCO_IMAGEM", Fatos: "x" }]);
    quando(/SELECT TOP 1 OrgaoId FROM Orgaos WHERE Sigla = 'DIRETORIA_EXECUTIVA'/, [{ OrgaoId: 3 }]);
    quando(/FROM Assentos WHERE OrgaoId = @orgaoId AND CargoOuFuncao = 'PRESIDENTE'/, []);
    const r = await chamar("intervencao-decretar", { metodo: "POST", corpo: { intervencaoId: "4", fundamentacao: "x".repeat(40), interventorNome: "Fulano de Tal" }, token: GERAL() });
    expect(r.status).toBe(403);
    expect(escritas()).toHaveLength(0);
  });
  test("cada pedido marca primeiro a caducidade (Reg. Art. 47-A §2º)", async () => {
    await chamar("painel", { token: GERAL() });
    expect(mockConsultas[0].sql).toMatch(/SET Status = N'CADUCADA'/);
    expect(mockConsultas[0].sql).toMatch(/PrazoRatificacao < @h/);
  });
});
