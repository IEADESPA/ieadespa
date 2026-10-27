// Trava 7-C — decisão de 23/10/2026: a aptidão para funções com criança FORA das escalas, em DEPARTAMENTOS e na LIDERANÇA (eventos ficaram fora).
// A regra pura (shared/funcoesMenores.js), quem ocupa e quem não está apto (funcoesMenoresDb), o painel (Diretoria lê o motivo; a Proteção do nível geral vê "pendência
// com a Diretoria"), a marca (nível geral + confirmação reforçada), o aviso pelo motor (um por pessoa e função, mensal, nunca à própria pessoa, sem o motivo) e o aviso da
// nomeação em GestaoLideranca (não impede). Banco simulado pelo TEXTO da consulta; contra o SQL Server de verdade: tools/e2e-localdb/e2e-44 a e2e-46.
let mockRegras = [];
let mockConsultas = [];
let mockAptidoes = new Map();
function mockExecutar(texto, inputs) {
  mockConsultas.push({ sql: texto, inputs: { ...inputs } });
  for (const [padrao, valor, afetadas] of mockRegras) {
    if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, recordsets: [], rowsAffected: [afetadas === undefined ? 1 : afetadas] };
  }
  return { recordset: [], recordsets: [], rowsAffected: [/^\s*(UPDATE|DELETE)\b/i.test(texto) ? 1 : 0] };
}
jest.mock("../db", () => {
  const novaRequisicao = () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => mockExecutar(texto, inputs) }; return r; };
  class Transaction { async begin() { } async commit() { } async rollback() { } }
  class Request { constructor() { return novaRequisicao(); } }
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => ({ request: novaRequisicao }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../trilhas", () => ({ ...jest.requireActual("../trilhas"), avaliarRequisitos: jest.fn(async () => ({ bloqueado: false })), listarRequisitos: jest.fn(async () => []) }));
jest.mock("../canaisDb", () => ({ ...jest.requireActual("../canaisDb"), sincronizarSucessoes: jest.fn(async () => ({})), notificarAgora: jest.fn(async () => ({ criadas: 1 })) }));
jest.mock("../notificacoes", () => ({ ...jest.requireActual("../notificacoes"), resolverDestinatariosPorPermissao: jest.fn(async () => []) }));
jest.mock("../ministerioMenoresDb", () => ({
  ...jest.requireActual("../ministerioMenoresDb"),
  aptidaoEmLote: jest.fn(async (_pool, ids) => new Map(ids.map((id) => [Number(id), mockAptidoes.get(Number(id))]).filter(([, a]) => a))),
  aptidaoDe: jest.fn(async (_pool, id) => mockAptidoes.get(Number(id)) || null)
}));

const auth = require("../auth");
const fm = require("../funcoesMenores");
const fmDb = require("../funcoesMenoresDb");
const notificacoes = require("../notificacoes");
const { registrarAuditoria } = require("../auditoria");
const hMenores = require("../../GestaoMinisterioMenores/index.js");
const hLideranca = require("../../GestaoLideranca/index.js");

const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const escritas = () => mockConsultas.filter((c) => /^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.test(c.sql));
const COM_FATOR = { via: "CHAVE", em: Date.now() };
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], via: "SENHA", fator: COM_FATOR, ...extra });
const GERAL = (permissoes, id = 1, extra = {}) => tokenDe(id, { nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes, ...extra });
const LOCAL = (permissoes, id = 5) => tokenDe(id, { nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], permissoes });
async function chamarMenores(acao, { metodo = "GET", corpo = {}, token } = {}) {
  const context = { bindingData: { acao }, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  await hMenores(context, { method: metodo, query: {}, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const pendente = { apto: false, bloqueios: [{ codigo: "INCIDENTE_EM_APURACAO", mensagem: "x" }, { codigo: "TREINAMENTO_AUSENTE", mensagem: "y" }] };
const naoApto = { apto: false, bloqueios: [{ codigo: "ANTECEDENTES_AUSENTES", mensagem: "z" }] };
const apto = { apto: true, bloqueios: [] };
// Ocupantes: 20 lidera a União de Crianças (departamento 1, marcado) e tem o cargo "Coordenador Infantil" (papel 9, marcado); 21 tem o mesmo cargo; 22 também, e está apto.
const LINHAS_OCUPANTES = [
  { MembroId: 20, Nome: "Ana", CongregacaoNome: "Central", Tipo: "PAPEL", FuncaoId: 9, FuncaoNome: "Coordenador Infantil" },
  { MembroId: 21, Nome: "Bia", CongregacaoNome: "Norte", Tipo: "PAPEL", FuncaoId: 9, FuncaoNome: "Coordenador Infantil" },
  { MembroId: 22, Nome: "Caio", CongregacaoNome: "Central", Tipo: "PAPEL", FuncaoId: 9, FuncaoNome: "Coordenador Infantil" },
  { MembroId: 20, Nome: "Ana", CongregacaoNome: "Central", Tipo: "DEPARTAMENTO", FuncaoId: 1, FuncaoNome: "União de Crianças" }
];
function banco() {
  quando(/'PAPEL' AS Tipo/, (i) => LINHAS_OCUPANTES.filter((l) => i.m == null || Number(l.MembroId) === Number(i.m)));
  quando(/FROM Departamentos ORDER BY Nome/, [{ DepartamentoId: 1, Sigla: "UCADESPA", Nome: "União de Crianças", Ativo: true, ContatoComMenores: true }, { DepartamentoId: 2, Sigla: "TEENS", Nome: "Adolescentes", Ativo: true, ContatoComMenores: false }, { DepartamentoId: 3, Sigla: "UHADESPA", Nome: "União de Homens", Ativo: true, ContatoComMenores: false }]);
  quando(/FROM Papeis ORDER BY Nome/, [{ PapelId: 9, Nome: "Coordenador Infantil", Nivel: "CONGREGACAO", ContatoComMenores: true }, { PapelId: 2, Nome: "Dirigente de Congregação", Nivel: "CONGREGACAO", ContatoComMenores: false }]);
  mockAptidoes = new Map([[20, pendente], [21, naoApto], [22, apto]]);
}
beforeEach(() => { mockRegras = []; mockConsultas = []; mockAptidoes = new Map(); registrarAuditoria.mockClear(); notificacoes.resolverDestinatariosPorPermissao.mockReset(); notificacoes.resolverDestinatariosPorPermissao.mockImplementation(async () => []); });

// ------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("a regra pura (shared/funcoesMenores.js)", () => {
  test("a referência do aviso: a mesma para a mesma pessoa, função e mês; outra em outro mês, outra pessoa ou outra função; sempre um INT positivo", () => {
    const r = fm.referenciaDoAviso("2026-10", 20, "PAPEL", 9);
    expect(r).toBe(fm.referenciaDoAviso("2026-10", 20, "PAPEL", 9));
    for (const outra of [fm.referenciaDoAviso("2026-11", 20, "PAPEL", 9), fm.referenciaDoAviso("2026-10", 21, "PAPEL", 9), fm.referenciaDoAviso("2026-10", 20, "DEPARTAMENTO", 9), fm.referenciaDoAviso("2026-10", 20, "PAPEL", 8)]) expect(outra).not.toBe(r);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThanOrEqual(2147483647);
  });
  test("os textos dizem só \"não está apto para função com menores\": nenhum código nem rótulo de motivo", () => {
    const t = fm.textoDoAviso({ nome: "Ana", funcao: { tipo: "DEPARTAMENTO", nome: "União de Crianças" }, congregacaoNome: "Central" });
    expect(t).toMatch(/Ana, da congregação Central, ocupa Departamento União de Crianças, .* não está apto para função com menores/);
    expect(t).toMatch(/A pessoa continua no cargo: a decisão é da Diretoria/);
    const n = fm.textoDaNomeacao([{ tipo: "PAPEL", nome: "Coordenador Infantil" }]);
    expect(n).toMatch(/não está apto para função com menores/);
    expect(n).toMatch(/o sistema avisa, não impede/);
    const require_ = require("../ministerioMenores");
    for (const texto of [t, n]) {
      for (const [codigo, rotulo] of Object.entries(require_.ROTULO_BLOQUEIO)) { expect(texto).not.toContain(codigo); expect(texto).not.toContain(rotulo); }
      expect(texto).not.toMatch(/incidente|afastamento|cadastro nacional|restrição|comunhão|auto-den/i);
    }
  });
  test("agrupar: uma linha por pessoa, sem repetir a função", () => {
    const g = fm.agruparPorPessoa([{ membroId: 1, nome: "A", tipo: "PAPEL", funcaoId: 9, funcaoNome: "X" }, { membroId: "1", nome: "A", tipo: "PAPEL", funcaoId: "9", funcaoNome: "X" }, { membroId: 1, nome: "A", tipo: "DEPARTAMENTO", funcaoId: 9, funcaoNome: "Y" }]);
    expect(g).toEqual([{ membroId: 1, nome: "A", congregacaoNome: null, funcoes: [{ tipo: "PAPEL", id: 9, nome: "X" }, { tipo: "DEPARTAMENTO", id: 9, nome: "Y" }] }]);
  });
  test("validar a marca: tipo fechado, id inteiro positivo escrito direito, booleano de verdade", () => {
    expect(fm.validarMarca({ tipo: "PAPEL", id: "9", contatoComMenores: true })).toEqual({ tipo: "PAPEL", id: 9, contatoComMenores: true });
    for (const c of [null, [], { tipo: "EVENTO", id: 1, contatoComMenores: true }, { tipo: "PAPEL", id: "0x9", contatoComMenores: true }, { tipo: "PAPEL", id: 1.5, contatoComMenores: true },
      { tipo: "PAPEL", id: -1, contatoComMenores: true }, { tipo: "PAPEL", id: [9], contatoComMenores: true }, { tipo: "PAPEL", id: 9, contatoComMenores: "true" }, { tipo: "toString", id: 9, contatoComMenores: true }, { tipo: "PAPEL", id: "99999999999", contatoComMenores: false }]) {
      expect(fm.validarMarca(c).erro).toBeTruthy();
    }
  });
});

// ------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("o painel e a marca (GestaoMinisterioMenores)", () => {
  test("a porta: gestão local, PIN e quem não é do nível geral recebem 403 antes de qualquer consulta", async () => {
    for (const token of [LOCAL(["habilitacao_voluntarios", "protecao_menores", "pessoas", "permissoes"]), tokenDe(10, { via: "PIN" }), GERAL(["habilitacao_voluntarios"]), GERAL(["financeiro"])]) {
      expect((await chamarMenores("funcoes", { token })).status).toBe(403);
      expect((await chamarMenores("funcao-marca", { metodo: "POST", token, corpo: { tipo: "PAPEL", id: 9, contatoComMenores: true } })).status).toBe(403);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("a Diretoria (vistoria_antecedentes, nível geral) vê quem não está apto, com o motivo; o apto não aparece; as funções de cada pessoa vêm juntas", async () => {
    banco();
    const r = await chamarMenores("funcoes", { token: GERAL(["vistoria_antecedentes"]) });
    expect(r.status).toBe(200);
    expect(r.body.inaptos.map((p) => p.membroId)).toEqual([20, 21]);
    expect(r.body.inaptos[0].funcoes.map((f) => f.rotulo)).toEqual(["Cargo Coordenador Infantil", "Departamento União de Crianças"]);
    expect(r.body.inaptos[0].bloqueios.map((b) => b.codigo)).toEqual(["INCIDENTE_EM_APURACAO", "TREINAMENTO_AUSENTE"]);
    expect(r.body.resumo).toEqual({ ocupantes: 3, inaptos: 2 });
    expect(r.body.podeMarcarDepartamento).toBe(false);
  });
  test("a Proteção de crianças do nível geral vê quem não está apto, mas a pendência reservada como \"pendência com a Diretoria\"", async () => {
    banco();
    const r = await chamarMenores("funcoes", { token: GERAL(["protecao_menores"]) });
    expect(r.body.inaptos[0].bloqueios.map((b) => b.codigo)).toEqual(["PENDENCIA_DIRETORIA", "TREINAMENTO_AUSENTE"]);
    expect(JSON.stringify(r.body)).not.toMatch(/INCIDENTE_EM_APURACAO|apuração/);
  });
  test("na própria linha, nem a Diretoria lê o afastamento por incidente (o mesmo do painel da v7.7)", async () => {
    banco();
    const r = await chamarMenores("funcoes", { token: GERAL(["vistoria_antecedentes"], 20) });
    expect(r.body.inaptos.find((p) => p.membroId === 20).bloqueios.map((b) => b.codigo)).toEqual(["PENDENCIA_DIRETORIA", "TREINAMENTO_AUSENTE"]);
  });
  test("quem só marca (pessoas ou permissoes, nível geral) vê as marcas e o que parece infantil, NUNCA quem não está apto", async () => {
    banco();
    const r = await chamarMenores("funcoes", { token: GERAL(["pessoas"]) });
    expect(r.body.inaptos).toBeNull();
    expect(r.body.resumo).toBeNull();
    expect(r.body.podeMarcarDepartamento).toBe(true);
    expect(r.body.podeMarcarPapel).toBe(false);
    expect(r.body.departamentos.find((d) => d.sigla === "TEENS").pareceInfantil).toBe(true);
    expect(r.body.departamentos.find((d) => d.sigla === "UHADESPA").pareceInfantil).toBe(false);
    expect(r.body.departamentos.find((d) => d.sigla === "UCADESPA")).toMatchObject({ contatoComMenores: true, pareceInfantil: false });
    expect(mockConsultas.some((c) => /'PAPEL' AS Tipo/.test(c.sql))).toBe(false);
  });
  test("catálogos: os papéis novos para a tela", async () => {
    const r = await chamarMenores("catalogos", { token: GERAL(["protecao_menores", "permissoes"]) });
    expect(r.body.papeis).toMatchObject({ funcoes: true, verInaptos: true, marcarDepartamento: false, marcarPapel: true, diretoria: false });
  });
  test("marcar: departamento só com `pessoas` e cargo só com `permissoes` (nível geral); sem a confirmação reforçada, 428 e nada grava", async () => {
    let r = await chamarMenores("funcao-marca", { metodo: "POST", token: GERAL(["pessoas"]), corpo: { tipo: "PAPEL", id: 9, contatoComMenores: true } });
    expect(r.status).toBe(403);
    r = await chamarMenores("funcao-marca", { metodo: "POST", token: GERAL(["permissoes"]), corpo: { tipo: "DEPARTAMENTO", id: 2, contatoComMenores: true } });
    expect(r.status).toBe(403);
    r = await chamarMenores("funcao-marca", { metodo: "POST", token: GERAL(["vistoria_antecedentes", "protecao_menores"]), corpo: { tipo: "DEPARTAMENTO", id: 2, contatoComMenores: true } });
    expect(r.status).toBe(403);
    for (const contatoComMenores of [true, false]) {
      r = await chamarMenores("funcao-marca", { metodo: "POST", token: GERAL(["pessoas"], 1, { fator: null }), corpo: { tipo: "DEPARTAMENTO", id: 2, contatoComMenores } });
      expect(r.status).toBe(428);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("marcar: lixo é 400; o estado antigo vai no WHERE; a trilha guarda antes e depois; repetir não grava", async () => {
    expect((await chamarMenores("funcao-marca", { metodo: "POST", token: GERAL(["pessoas"]), corpo: { tipo: "DEPARTAMENTO", id: "x", contatoComMenores: true } })).status).toBe(400);
    quando(/SELECT Nome, ContatoComMenores FROM Departamentos WHERE DepartamentoId = @id/, [{ Nome: "Adolescentes", ContatoComMenores: false }]);
    let r = await chamarMenores("funcao-marca", { metodo: "POST", token: GERAL(["pessoas"], 7), corpo: { tipo: "DEPARTAMENTO", id: 2, contatoComMenores: true } });
    expect(r.status).toBe(200);
    expect(r.body.mensagem).toMatch(/Ninguém sai do cargo sozinho/);
    const upd = escritas()[0];
    expect(upd.sql).toMatch(/UPDATE Departamentos SET ContatoComMenores = @novo WHERE DepartamentoId = @id AND ContatoComMenores = @antes/);
    expect(upd.inputs).toMatchObject({ id: 2, novo: 1, antes: 0 });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ tabela: "Departamentos", registroId: 2, acao: "CONTATO_COM_MENORES_ALTERADO", usuarioId: 7, dadosAntes: { contatoComMenores: false }, dadosDepois: { contatoComMenores: true } });
    mockRegras = []; mockConsultas = [];
    quando(/SELECT Nome, ContatoComMenores FROM Papeis WHERE PapelId = @id/, [{ Nome: "Coordenador Infantil", ContatoComMenores: true }]);
    r = await chamarMenores("funcao-marca", { metodo: "POST", token: GERAL(["permissoes"]), corpo: { tipo: "PAPEL", id: 9, contatoComMenores: true } });
    expect(r.body).toMatchObject({ sucesso: true, mudou: false });
    expect(escritas()).toHaveLength(0);
  });
  test("marcar: outra pessoa mexeu ao mesmo tempo (0 linhas) — 422 sem trilha; função que não existe — 404", async () => {
    quando(/SELECT Nome, ContatoComMenores FROM Papeis WHERE PapelId = @id/, [{ Nome: "X", ContatoComMenores: false }]);
    quando(/UPDATE Papeis SET ContatoComMenores/, [], 0);
    let r = await chamarMenores("funcao-marca", { metodo: "POST", token: GERAL(["permissoes"]), corpo: { tipo: "PAPEL", id: 9, contatoComMenores: true } });
    expect(r.status).toBe(422);
    expect(registrarAuditoria).not.toHaveBeenCalled();
    mockRegras = [];
    r = await chamarMenores("funcao-marca", { metodo: "POST", token: GERAL(["permissoes"]), corpo: { tipo: "PAPEL", id: 99, contatoComMenores: true } });
    expect(r.status).toBe(404);
  });
});

// ------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("quem ocupa (a consulta) e o aviso pelo motor", () => {
  test("ocupa: liderança vigente do cargo marcado; do departamento marcado e ativo, por escopo DEPARTAMENTO ou restrita a ele", async () => {
    banco();
    await fmDb.ocupantes(await require("../db").getPool(), { hoje: "2026-10-23" });
    const q = mockConsultas.find((c) => /'PAPEL' AS Tipo/.test(c.sql)).sql;
    expect(q).toMatch(/JOIN Papeis p ON p\.PapelId = l\.PapelId AND p\.ContatoComMenores = 1/);
    expect(q).toMatch(/CASE WHEN l\.EscopoTipo = 'DEPARTAMENTO' THEN l\.EscopoId ELSE l\.DepartamentoId END AND d\.ContatoComMenores = 1 AND d\.Ativo = 1/);
    expect((q.match(/\(l\.AtivoAte IS NULL OR l\.AtivoAte >= @hoje\)/g) || []).length).toBe(2);
  });
  test("o detector: um fato por pessoa e função, à Diretoria e à Proteção do nível geral (sem repetir quem tem as duas), nunca à própria pessoa", async () => {
    banco();
    notificacoes.resolverDestinatariosPorPermissao.mockImplementation(async (_pool, { permissao, nivel }) => {
      expect(nivel).toBe("GLOBAL");
      return permissao === "vistoria_antecedentes" ? [{ membroId: 1, nome: "Diretor", email: "d@x" }, { membroId: 20, nome: "Ana", email: "a@x" }] : [{ membroId: 1, nome: "Diretor", email: "d@x" }, { membroId: 3, nome: "Comitê", email: "c@x" }];
    });
    const fatos = await fmDb.detectar(await require("../db").getPool(), { hoje: "2026-10-23" });
    expect(fatos).toHaveLength(3);                    // Ana: cargo + departamento; Bia: cargo. Caio (apto) fica fora
    const daAna = fatos.filter((f) => /^Ana/.test(f.fatoGerador));
    expect(daAna).toHaveLength(2);
    expect(daAna[0].destinatarios.map((d) => d.membroId)).toEqual([1, 3]);            // nunca a própria Ana, mesmo sendo da Diretoria
    expect(fatos.find((f) => /^Bia/.test(f.fatoGerador)).destinatarios.map((d) => d.membroId)).toEqual([1, 20, 3]);
    expect(daAna[0].referenciaId).toBe(fm.referenciaDoAviso("2026-10", 20, "PAPEL", 9));
    for (const f of fatos) expect(f.fatoGerador).not.toMatch(/incidente|treinamento|antecedentes|PENDENCIA|INCIDENTE/i);
    const noutroMes = await fmDb.detectar(await require("../db").getPool(), { hoje: "2026-11-02" });
    expect(noutroMes.map((f) => f.referenciaId)).not.toContain(daAna[0].referenciaId);
  });
  test("sem ninguém para avisar, ou sem inapto: nenhum fato", async () => {
    banco();
    expect(await fmDb.detectar(await require("../db").getPool(), { hoje: "2026-10-23" })).toEqual([]);
    mockAptidoes = new Map([[20, apto], [21, apto], [22, apto]]);
    notificacoes.resolverDestinatariosPorPermissao.mockImplementation(async () => [{ membroId: 1 }]);
    expect(await fmDb.detectar(await require("../db").getPool(), { hoje: "2026-10-23" })).toEqual([]);
  });
  test("a aptidão que não pôde ser calculada conta como NÃO apta (a dúvida aparece para a Diretoria)", async () => {
    banco();
    mockAptidoes = new Map([[22, apto]]);
    const r = await fmDb.inaptos(await require("../db").getPool(), { hoje: "2026-10-23" });
    expect(r.inaptos.map((p) => p.membroId)).toEqual([20, 21]);
  });
});

// ------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("a nomeação (GestaoLideranca): avisa, não impede", () => {
  const tk = () => auth.reassinarSessao({ membroId: 5, termosPendentes: [], via: "SENHA", fator: COM_FATOR, permissoes: ["permissoes"], nivel: "GLOBAL", escopoCongregacoes: "TODAS" });
  async function nomear(corpo, rota) {
    const context = { bindingData: rota ? { membroId: rota } : {}, log: { error() { }, info() { }, warn() { } } };
    await hLideranca(context, { method: "POST", query: {}, body: corpo, headers: { "x-auth-token": tk() } });
    return context.res;
  }
  function bancoLideranca() {
    banco();
    quando(/SELECT MembroId FROM MembroReferencia WHERE MembroId = @id/, (i) => [{ MembroId: i.id }]);
    quando(/CongregacaoId FROM MembroReferencia WHERE MembroId = @id/, () => [{ CongregacaoId: 7 }]);
    quando(/SELECT PapelId, Nivel FROM Papeis WHERE PapelId = @id/, (i) => [{ PapelId: i.id, Nivel: "CONGREGACAO" }]);
    quando(/SELECT 1 AS ok FROM Congregacoes WHERE/, [{ ok: 1 }]);
  }
  test("nomeado sem aptidão para cargo marcado: grava, avisa (texto genérico) e a trilha registra que houve o aviso", async () => {
    bancoLideranca();
    const r = await nomear({ membroId: 21, papelId: 9, senha: "Senha#2026", escopoTipo: "CONGREGACAO", escopoId: 7 });
    expect(r.body.sucesso).toBe(true);
    expect(escritas().some((c) => /INSERT INTO Lideranca/.test(c.sql))).toBe(true);
    expect(r.body.mensagem).toMatch(/^✅ Liderança registrada\. ⚠️ Atenção: Cargo Coordenador Infantil tem contato com crianças e adolescentes, e esta pessoa não está apto para função com menores/);
    expect(r.body.avisoMenores).toBeTruthy();
    expect(registrarAuditoria.mock.calls.map((c) => c[0]).find((a) => a.tabela === "Lideranca").dadosDepois.avisoFuncaoComMenores).toBe(true);
  });
  test("com pendência reservada: o mesmo texto genérico (nada do motivo a quem nomeia)", async () => {
    bancoLideranca();
    const r = await nomear({ membroId: 20, papelId: 9, senha: "Senha#2026", escopoTipo: "CONGREGACAO", escopoId: 7 });
    expect(r.body.avisoMenores).toMatch(/Cargo Coordenador Infantil, Departamento União de Crianças/);
    expect(r.body.mensagem).not.toMatch(/incidente|afastamento|apura|PENDENCIA_DIRETORIA|INCIDENTE/i);
  });
  test("apto, ou função sem marca: sem aviso (a mensagem de sempre)", async () => {
    bancoLideranca();
    let r = await nomear({ membroId: 22, papelId: 9, senha: "Senha#2026", escopoTipo: "CONGREGACAO", escopoId: 7 });
    expect(r.body).toEqual({ sucesso: true, mensagem: "✅ Liderança registrada." });
    r = await nomear({ membroId: 30, papelId: 2, senha: "Senha#2026", escopoTipo: "CONGREGACAO", escopoId: 7 });
    expect(r.body).toEqual({ sucesso: true, mensagem: "✅ Liderança registrada." });
  });
  test("no lote, cada pessoa leva o próprio aviso", async () => {
    bancoLideranca();
    const r = await nomear({ membroIds: [21, 22], papelId: 9, senha: "Senha#2026", escopoTipo: "CONGREGACAO", escopoId: 7 }, "lote");
    expect(r.body.resultados.find((x) => x.membroId === 21).mensagem).toMatch(/não está apto para função com menores/);
    expect(r.body.resultados.find((x) => x.membroId === 22).mensagem).toBe("✅ Liderança registrada.");
  });
  test("uma falha ao conferir a aptidão nunca desfaz a nomeação", async () => {
    bancoLideranca();
    mockRegras.unshift([/'PAPEL' AS Tipo/, () => { throw new Error("banco caiu no meio"); }]);
    const r = await nomear({ membroId: 21, papelId: 9, senha: "Senha#2026", escopoTipo: "CONGREGACAO", escopoId: 7 });
    expect(r.body).toEqual({ sucesso: true, mensagem: "✅ Liderança registrada." });
  });
});
