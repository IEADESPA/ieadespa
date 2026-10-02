// GestaoLideranca decide QUEM tem cargo, permissão e escopo — o ponto mais sensível do controle de acesso. Aqui: só o nível GERAL concede; o escopo precisa ser coerente com o
// nível do papel (nunca mais largo), exigir a unidade e a unidade precisa existir; nada de "escopo omitido vira Global".
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [1] };
    return { recordset: [], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../trilhas", () => ({ avaliarRequisitos: jest.fn(async () => ({ bloqueado: false })) }));
jest.mock("../canaisDb", () => ({ sincronizarSucessoes: jest.fn(async () => ({})) }));

const auth = require("../auth");
const handler = require("../../GestaoLideranca/index.js");

const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
const gravacoes = () => mockConsultas.filter(c => /^\s*(INSERT INTO Lideranca|UPDATE Lideranca|DELETE FROM Lideranca)/.test(c.sql));
const token = (extra = {}) => auth.reassinarSessao({ membroId: 5, termosPendentes: [], via: "SENHA", permissoes: ["permissoes"], nivel: "GLOBAL", escopoCongregacoes: "TODAS", ...extra });
async function chamar({ metodo = "POST", corpo = {}, tk = token(), ligado = {} } = {}) {
  const context = { bindingData: ligado, log: { error() {}, info() {}, warn() {} } };
  await handler(context, { method: metodo, query: {}, body: corpo, headers: tk ? { "x-auth-token": tk } : {} });
  return context.res;
}
// Banco: pessoa 20 existe; papéis 1=Presidente(GLOBAL) 2=Dirigente(CONGREGACAO) 3=Pastor de Área(AREA) 4=Líder Geral de Depto(DEPARTAMENTO); unidades 7 existem (qualquer tabela), 99 não.
const NIVEL = { 1: "GLOBAL", 2: "CONGREGACAO", 3: "AREA", 4: "DEPARTAMENTO" };
function banco({ lideranca = [] } = {}) {
  quando(/FROM MembroReferencia WHERE MembroId = @id/, (i) => (i.id === 20 ? [{ MembroId: 20 }] : []));
  quando(/SELECT PapelId, Nivel FROM Papeis WHERE PapelId = @id/, (i) => (NIVEL[i.id] ? [{ PapelId: i.id, Nivel: NIVEL[i.id] }] : []));
  quando(/SELECT LiderancaId, PapelId, EscopoTipo, EscopoId FROM Lideranca WHERE MembroId = @id/, lideranca);
  quando(/SELECT 1 AS ok FROM (Congregacoes|Areas|Regioes|Quadrantes|Distritos|ExtensoesTenda|Departamentos) WHERE/, (i) => (i.id === 7 ? [{ ok: 1 }] : []));
}
const concede = (extra) => ({ membroId: 20, papelId: 2, senha: "Senha#2026", escopoTipo: "CONGREGACAO", escopoId: 7, ...extra });
beforeEach(() => { mockRegras = []; mockConsultas = []; });

describe("a porta: só o GERAL concede liderança", () => {
  test.each([
    ["sem sessão", null, 401],
    ["sessão de PIN (sem permissão)", token({ via: "PIN", permissoes: [], nivel: null, escopoCongregacoes: [] }), 403],
    ["'permissoes' em papel local (Dirigente)", token({ nivel: "CONGREGACAO", escopoCongregacoes: ["Central"] }), 403],
    ["papel GLOBAL com escopo de uma congregação", token({ escopoCongregacoes: ["Central"] }), 403],
    ["papel local com escopo 'TODAS' (cadastrado por engano)", token({ nivel: "CONGREGACAO" }), 403],
    ["Líder Geral de Departamento (TODAS, nível DEPARTAMENTO)", token({ nivel: "DEPARTAMENTO" }), 403],
    ["geral sem a permissão 'permissoes'", token({ permissoes: ["pessoas"] }), 403]
  ])("%s -> %i, sem tocar no banco", async (_nome, tk, status) => {
    banco();
    for (const metodo of ["GET", "POST", "DELETE"]) {
      const r = await chamar({ metodo, tk, corpo: concede(), ligado: metodo === "DELETE" ? { membroId: "20" } : {} });
      expect(r.status).toBe(status);
    }
    expect(mockConsultas).toHaveLength(0);
  });
  test("o geral com 'permissoes' entra", async () => {
    banco();
    expect((await chamar({ metodo: "GET" })).status).toBe(200);
  });
});

describe("o escopo precisa ser coerente com o papel", () => {
  test("Dirigente (nível CONGREGACAO) com escopo GLOBAL: recusado — é o 'escopo padrão' que dava acesso à igreja inteira", async () => {
    banco();
    const r = await chamar({ corpo: concede({ escopoTipo: "GLOBAL", escopoId: null }) });
    expect(r.body).toMatchObject({ sucesso: false });
    expect(r.body.mensagem).toMatch(/mais largo que o nível do papel/);
    expect(gravacoes()).toHaveLength(0);
  });
  test("escopo omitido não vira Global: recusado", async () => {
    banco();
    const r = await chamar({ corpo: concede({ escopoTipo: undefined, escopoId: undefined }) });
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/Informe o escopo/);
    expect(gravacoes()).toHaveLength(0);
  });
  test.each([["CONGREGACAO", 2], ["AREA", 3]])("escopo territorial %s SEM a unidade: recusado (sem id o acesso ficaria aberto demais)", async (escopoTipo, papelId) => {
    banco();
    for (const escopoId of [undefined, null, 0, "", "0x7", "abc"]) {
      const r = await chamar({ corpo: concede({ papelId, escopoTipo, escopoId }) });
      expect(r.body.sucesso).toBe(false);
      expect(r.body.mensagem).toMatch(/Informe qual/);
    }
    expect(gravacoes()).toHaveLength(0);
  });
  test("unidade que não existe: recusado", async () => {
    banco();
    const r = await chamar({ corpo: concede({ escopoId: 99 }) });
    expect(r.body).toEqual({ sucesso: false, mensagem: "A unidade do escopo não existe." });
    expect(gravacoes()).toHaveLength(0);
  });
  test("tipo de escopo desconhecido: recusado", async () => {
    banco();
    expect((await chamar({ corpo: concede({ escopoTipo: "PLANETA" }) })).body.mensagem).toMatch(/Tipo de escopo inválido/);
    expect(gravacoes()).toHaveLength(0);
  });
  test("escopo Global com uma unidade sobrando no formulário: a unidade é descartada (grava escopoId nulo), nunca guardada", async () => {
    banco();
    const r = await chamar({ corpo: concede({ papelId: 1, escopoTipo: "GLOBAL", escopoId: 7 }) });
    expect(r.body.sucesso).toBe(true);
    expect(gravacoes()[0].inputs).toMatchObject({ escopoTipo: "GLOBAL", escopoId: null });
  });
  test("papel de departamento só com escopo de departamento (e o contrário)", async () => {
    banco();
    expect((await chamar({ corpo: concede({ papelId: 4, escopoTipo: "CONGREGACAO", escopoId: 7 }) })).body.mensagem).toMatch(/departamento/);
    expect((await chamar({ corpo: concede({ papelId: 2, escopoTipo: "DEPARTAMENTO", escopoId: 7 }) })).body.mensagem).toMatch(/departamento/);
    expect((await chamar({ corpo: concede({ papelId: 4, escopoTipo: "DEPARTAMENTO", escopoId: undefined }) })).body.mensagem).toMatch(/Informe qual/);       // sem o departamento ele veria todos
    expect(gravacoes()).toHaveLength(0);
    const ok = await chamar({ corpo: concede({ papelId: 4, escopoTipo: "DEPARTAMENTO", escopoId: 7 }) });
    expect(ok.body.sucesso).toBe(true);
  });
  test("escopo igual ou MAIS ESTREITO que o nível do papel grava: Dirigente na congregação 7; Presidente (Global) com escopo de uma congregação; Pastor de Área na área 7; Dirigente numa Extensão", async () => {
    banco();
    for (const corpo of [concede(), concede({ papelId: 1, escopoTipo: "CONGREGACAO" }), concede({ papelId: 3, escopoTipo: "AREA" }), concede({ papelId: 3, escopoTipo: "CONGREGACAO" }), concede({ papelId: 2, escopoTipo: "EXTENSAO" }), concede({ papelId: 1, escopoTipo: "GLOBAL", escopoId: undefined })]) {
      mockConsultas = [];
      const r = await chamar({ corpo });
      expect(r.body).toMatchObject({ sucesso: true });
      const g = gravacoes();
      expect(g).toHaveLength(1);
      expect(g[0].sql).toMatch(/INSERT INTO Lideranca/);
      expect(g[0].inputs.escopoTipo).toBe(corpo.escopoTipo);
      expect(g[0].inputs.escopoId).toBe(corpo.escopoTipo === "GLOBAL" ? null : 7);
    }
  });
  test("Pastor de Área (nível AREA) com escopo REGIAO ou GLOBAL: recusado", async () => {
    banco();
    for (const escopoTipo of ["REGIAO", "QUADRANTE", "DISTRITO"]) expect((await chamar({ corpo: concede({ papelId: 3, escopoTipo }) })).body.mensagem).toMatch(/mais largo/);
    expect((await chamar({ corpo: concede({ papelId: 3, escopoTipo: "GLOBAL", escopoId: undefined }) })).body.mensagem).toMatch(/mais largo/);
    expect(gravacoes()).toHaveLength(0);
  });
  test("ids no corpo só valem na forma canônica ('0x14', '1e1', número com zero à esquerda não são matrícula nem papel)", async () => {
    banco();
    for (const corpo of [concede({ membroId: "0x14" }), concede({ membroId: "020" }), concede({ papelId: "1e1" }), concede({ papelId: [2] })]) {
      const r = await chamar({ corpo });
      expect(r.body.sucesso).toBe(false);
    }
    expect(gravacoes()).toHaveLength(0);
  });
});

describe("linha antiga incoerente", () => {
  const antiga = [{ LiderancaId: 1, PapelId: 2, EscopoTipo: "GLOBAL", EscopoId: null }];       // Dirigente com escopo Global (o padrão antigo)
  test("só redefinir a senha (papel e escopo iguais) continua possível", async () => {
    banco({ lideranca: antiga });
    const r = await chamar({ corpo: concede({ escopoTipo: "GLOBAL", escopoId: null, senha: "NovaSenha#2026" }) });
    expect(r.body.sucesso).toBe(true);
    expect(gravacoes()[0].sql).toMatch(/UPDATE Lideranca SET PapelId/);
  });
  test("trocar para outro escopo incoerente continua recusado; corrigir para um coerente passa", async () => {
    banco({ lideranca: antiga });
    expect((await chamar({ corpo: concede({ escopoTipo: "REGIAO", escopoId: 7 }) })).body.mensagem).toMatch(/mais largo/);
    expect(gravacoes()).toHaveLength(0);
    const ok = await chamar({ corpo: concede({ escopoTipo: "CONGREGACAO", escopoId: 7 }) });
    expect(ok.body.sucesso).toBe(true);
  });
  test("o GET sinaliza a linha incoerente (e só ela) para a Secretaria corrigir", async () => {
    quando(/FROM Lideranca l\s+JOIN MembroReferencia/, [
      { liderancaId: 1, membroId: 20, nome: "Ana", papelId: 2, papel: "Dirigente de Congregação", nivel: "CONGREGACAO", escopoTipo: "GLOBAL", escopoId: null, permissoesStr: "reunioes,pessoas" },
      { liderancaId: 2, membroId: 21, nome: "Beto", papelId: 2, papel: "Dirigente de Congregação", nivel: "CONGREGACAO", escopoTipo: "CONGREGACAO", escopoId: 7, permissoesStr: "reunioes" },
      { liderancaId: 3, membroId: 22, nome: "Caio", papelId: 3, papel: "Pastor de Área", nivel: "AREA", escopoTipo: "AREA", escopoId: null, permissoesStr: null },
      { liderancaId: 4, membroId: 5, nome: "Pres", papelId: 1, papel: "Presidente", nivel: "GLOBAL", escopoTipo: "GLOBAL", escopoId: null, permissoesStr: "permissoes" }
    ]);
    const r = await chamar({ metodo: "GET" });
    expect(r.body.map(l => [l.nome, l.escopoIncoerente])).toEqual([["Ana", true], ["Beto", false], ["Caio", true], ["Pres", false]]);
  });
  test("o GET também sinaliza quem tem papel Global mas escopo limitado (coerente, porém sem acesso às telas da administração geral)", async () => {
    quando(/FROM Lideranca l\s+JOIN MembroReferencia/, [
      { liderancaId: 1, membroId: 20, nome: "Tesoureiro", papelId: 1, papel: "Tesoureiro", nivel: "GLOBAL", escopoTipo: "CONGREGACAO", escopoId: 7, permissoesStr: "financeiro" },
      { liderancaId: 2, membroId: 5, nome: "Pres", papelId: 1, papel: "Presidente", nivel: "GLOBAL", escopoTipo: "GLOBAL", escopoId: null, permissoesStr: "permissoes" },
      { liderancaId: 3, membroId: 21, nome: "Dirigente", papelId: 2, papel: "Dirigente", nivel: "CONGREGACAO", escopoTipo: "CONGREGACAO", escopoId: 7, permissoesStr: "pessoas" }
    ]);
    const r = await chamar({ metodo: "GET" });
    expect(r.body.map(l => [l.nome, l.escopoIncoerente, l.semAcessoGeral])).toEqual([["Tesoureiro", false, true], ["Pres", false, false], ["Dirigente", false, false]]);
  });
});

describe("lote e remoção", () => {
  test("lote com mais de 200 pessoas: 400, sem consultar o banco", async () => {
    banco();
    const r = await chamar({ ligado: { membroId: "lote" }, corpo: { membroIds: Array.from({ length: 201 }, (_, i) => i + 1), papelId: 2, escopoTipo: "CONGREGACAO", escopoId: 7, senha: "Senha#2026" } });
    expect(r.status).toBe(400);
    expect(mockConsultas).toHaveLength(0);
  });
  test("lote: matrícula malformada vira 'Matrícula inválida.' sem derrubar as outras; as boas são concedidas", async () => {
    banco();
    const r = await chamar({ ligado: { membroId: "lote" }, corpo: { membroIds: ["0x14", 20, "1e1"], papelId: 2, escopoTipo: "CONGREGACAO", escopoId: 7, senha: "Senha#2026" } });
    expect(r.body.resultados.map(x => x.sucesso)).toEqual([false, true, false]);
    expect(r.body.resultados[0].mensagem).toBe("Matrícula inválida.");
    expect(gravacoes()).toHaveLength(1);
  });
  test("lote sem escopo ou com escopo mais largo que o papel: cada pessoa recusada", async () => {
    banco();
    const r = await chamar({ ligado: { membroId: "lote" }, corpo: { membroIds: [20], papelId: 2, escopoTipo: "GLOBAL", senha: "Senha#2026" } });
    expect(r.body.resultados[0]).toMatchObject({ sucesso: false });
    expect(gravacoes()).toHaveLength(0);
  });
  test("DELETE com matrícula malformada: 400", async () => {
    banco();
    for (const membroId of ["0x14", "abc", "1e1", "-3"]) expect((await chamar({ metodo: "DELETE", ligado: { membroId } })).status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });
});
