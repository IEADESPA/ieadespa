// v7.7 — a rota nova POST /api/canais/responsavel-acesso (GestaoCanais) com o handler de verdade e o banco simulado pelo TEXTO da consulta: a porta (401, 403 ANTES de
// qualquer consulta, a mesma de administradores/designar), os identificadores estritos como o HTTP os entrega, a resposta IGUAL para canal que não existe e canal de fora
// do escopo, a recusa de regra (422) e o que é gravado e auditado (só matrículas). O comportamento contra o SQL Server é coberto pelo roteiro ponta a ponta.
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor, afetadas] of mockRegras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [afetadas === undefined ? 1 : afetadas] };
    return { recordset: [], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../ministerioMenoresDb", () => ({ aptidaoEmLote: jest.fn(async () => new Map()) }));
jest.mock("../canaisDb", () => ({ ...jest.requireActual("../canaisDb"), notificarAgora: jest.fn(async () => ({ criadas: 1 })) }));

const auth = require("../auth");
const { registrarAuditoria } = require("../auditoria");
const hCanais = require("../../GestaoCanais/index.js");
const { hojeBrasilia } = require("../dataBrasilia");

const CENTRAL = "Central";
const VILA = "Vila Nova";
const HOJE = hojeBrasilia();
const nascidoHa = (anos, extraDias = 0) => { const [a, m, d] = HOJE.split("-").map(Number); return new Date(Date.UTC(a - anos, m - 1, d - extraDias)); };

async function chamar(handler, { metodo = "GET", corpo = {}, token, ligado = {}, query = {} } = {}) {
  const context = { bindingData: ligado, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const tok = (extra = {}) => auth.reassinarSessao({ membroId: 5, nome: "Fulano", termosPendentes: [], ...extra });
const tokenPin = () => tok({ via: "PIN", nivel: null, permissoes: [], escopoCongregacoes: [] });
const tokenLocal = (permissoes, extra = {}) => tok({ via: "SENHA", nivel: "CONGREGACAO", permissoes, escopoCongregacoes: [CENTRAL], ...extra });
const tokenGeral = (permissoes) => tok({ via: "SENHA", nivel: "GLOBAL", permissoes, escopoCongregacoes: "TODAS" });

const CONTEXTO = /FROM (Congregacoes|Areas|Departamentos)\b|SELECT CongregacaoId, Nome, AreaId, Ativa FROM Congregacoes|SELECT AreaId, Nome FROM Areas|SELECT DepartamentoId, Sigla, Nome FROM Departamentos/;
const consultasDeDados = () => mockConsultas.filter(c => !CONTEXTO.test(c.sql));
const gravacoes = () => mockConsultas.filter(c => /^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.test(c.sql));

const canal = (id, extra = {}) => ({
  CanalId: id, Sigla: `WHATSAPP_GRUPO_${id}`, Nome: `Canal ${id}`, Ativo: 1, Plataforma: "WHATSAPP_GRUPO", Categoria: "GRUPO_OFICIAL", TemaFocado: null,
  Identificador: `Grupo ${id}`, IdentificadorNormalizado: `grupo ${id}`, VinculoInstitucional: "ESTRUTURA", DeclaracaoInstitucionalEm: "2026-09-01T10:00:00.000Z",
  Escopo: "CONGREGACAO", CongregacaoId: id, AreaId: null, DepartamentoId: null, IncluiMenores: 1, ResponsavelAcessoMembroId: null, PublicoNoSite: 0, Descricao: null,
  CustodiaSecretaria: 0, UltimaTrocaCredencialEm: null, VigenteDesde: "2026-09-01", VigenteAte: null, DesativadoMotivo: null, RegistradoEm: "2026-09-01T10:00:00.000Z", ...extra
});
const MEMBROS = {
  70: { MembroId: 70, Status: "ATIVO", DataNascimento: nascidoHa(38) },
  71: { MembroId: 71, Status: "INATIVO", DataNascimento: nascidoHa(38) },
  72: { MembroId: 72, Status: "ATIVO", DataNascimento: nascidoHa(18, -1) }
};

// Canal 1 é da Central (no escopo do gestor local); canal 2 é da Vila Nova (fora); canal 3 é da Central mas NÃO inclui menores; canal 4 já tem o responsável 70.
function montarBase() {
  const canais = { 1: canal(1), 2: canal(2), 3: canal(3, { IncluiMenores: 0 }), 4: canal(4, { CongregacaoId: 1, ResponsavelAcessoMembroId: 70 }) };
  quando(/SELECT CongregacaoId, Nome, AreaId, Ativa FROM Congregacoes/, [{ CongregacaoId: 1, Nome: CENTRAL, AreaId: 10, Ativa: 1 }, { CongregacaoId: 2, Nome: VILA, AreaId: 10, Ativa: 1 }]);
  quando(/SELECT AreaId, Nome FROM Areas/, [{ AreaId: 10, Nome: "Área 1" }]);
  quando(/SELECT TOP 500 \* FROM CanaisOficiaisComunicacao/, (i) => (i.canalId ? (canais[i.canalId] ? [{ ...canais[i.canalId], CongregacaoId: i.canalId === 2 ? 2 : 1 }] : []) : Object.values(canais)));
  quando(/SELECT MembroId, Status, DataNascimento FROM MembroReferencia WHERE MembroId = @id/, (i) => (MEMBROS[i.id] ? [MEMBROS[i.id]] : []));
}
const post = (acao, token, corpo = {}) => chamar(hCanais, { metodo: "POST", ligado: { acao }, token, corpo });
const ROTA = "canais/responsavel-acesso";

beforeEach(() => { mockRegras = []; mockConsultas = []; registrarAuditoria.mockClear(); });

describe("canais/responsavel-acesso: a porta", () => {
  test("sem sessão: 401, e nada é consultado", async () => {
    montarBase();
    expect((await post(ROTA, undefined, { canalId: 1, membroId: 70 })).status).toBe(401);
    expect(mockConsultas).toHaveLength(0);
  });

  test("sem a permissão canais_gestao (PIN, dirigente com outra permissão, geral com outra permissão): 403 ANTES de qualquer consulta de dados, e a MESMA porta de administradores/designar", async () => {
    montarBase();
    const intrusos = [tokenPin(), tokenLocal(["pessoas"]), tokenLocal([]), tokenGeral(["disciplina", "pessoas"])];
    for (const t of intrusos) {
      for (const acao of [ROTA, "administradores/designar"]) {
        const r = await post(acao, t, { canalId: 1, membroId: 70, papel: "ADMINISTRADOR" });
        expect(r.status).toBe(403);
        expect(r.body).toMatchObject({ sucesso: false });
      }
    }
    expect(consultasDeDados()).toHaveLength(0);
    expect(gravacoes()).toHaveLength(0);
  });

  test("quem tem a permissão passa pela porta nas duas rotas (a de designar também chega à busca do canal)", async () => {
    montarBase();
    const t = tokenLocal(["canais_gestao"]);
    expect((await post(ROTA, t, { canalId: 1, membroId: 70 })).status).toBe(200);
    expect((await post("administradores/designar", t, { canalId: 999, membroId: 70 })).status).toBe(404);
  });

  test("método GET não existe para a rota nova (é só POST)", async () => {
    montarBase();
    const r = await chamar(hCanais, { metodo: "GET", ligado: { acao: ROTA }, token: tokenLocal(["canais_gestao"]) });
    expect(r.status).toBe(404);
    expect(gravacoes()).toHaveLength(0);
  });
});

describe("canais/responsavel-acesso: identificadores estritos (como o HTTP os entrega)", () => {
  const ruins = ["0x10", "1e1", true, [5], 0, -1, 1.5, "abc", "", {}, "7.0", 2147483648];

  test.each(ruins.map(v => [JSON.stringify(v), v]))("canalId %s: 400, sem consulta de dados nem gravação", async (_nome, ruim) => {
    montarBase();
    const r = await post(ROTA, tokenLocal(["canais_gestao"]), { canalId: ruim, membroId: 70 });
    expect(r.status).toBe(400);
    expect(r.body.mensagem).toMatch(/canalId/);
    expect(consultasDeDados()).toHaveLength(0);
    expect(gravacoes()).toHaveLength(0);
  });

  test.each(ruins.map(v => [JSON.stringify(v), v]))("membroId %s: 400, sem consulta de dados nem gravação", async (_nome, ruim) => {
    montarBase();
    const r = await post(ROTA, tokenLocal(["canais_gestao"]), { canalId: 1, membroId: ruim });
    expect(r.status).toBe(400);
    expect(r.body.mensagem).toMatch(/matrícula do responsável/);
    expect(consultasDeDados()).toHaveLength(0);
    expect(gravacoes()).toHaveLength(0);
  });

  test("sem a chave membroId (corpo vazio ou só com o canal) é erro: retirar o responsável exige o null EXPLÍCITO", async () => {
    montarBase();
    const t = tokenLocal(["canais_gestao"]);
    expect((await post(ROTA, t, { canalId: 4 })).status).toBe(400);
    expect((await post(ROTA, t, {})).status).toBe(400);
    expect((await post(ROTA, t, { canalId: 4, membroId: undefined })).status).toBe(400);
    expect(gravacoes()).toHaveLength(0);
  });

  test("identificadores em TEXTO de dígitos valem (o corpo pode chegar assim) e viram número na consulta", async () => {
    montarBase();
    const r = await post(ROTA, tokenLocal(["canais_gestao"]), { canalId: "1", membroId: "70" });
    expect(r.status).toBe(200);
    const buscaDoCanal = mockConsultas.find(c => /SELECT TOP 500 \* FROM CanaisOficiaisComunicacao/.test(c.sql));
    expect(buscaDoCanal.inputs.canalId).toBe(1);
    expect(gravacoes()[0].inputs).toMatchObject({ id: 1, resp: 70 });
  });
});

describe("canais/responsavel-acesso: escopo (canal de fora = canal que não existe)", () => {
  test("canal da Vila Nova (fora do escopo do dirigente) e canal que não existe: a MESMA resposta 404, e nada é gravado nem auditado", async () => {
    montarBase();
    const t = tokenLocal(["canais_gestao"]);
    const fora = await post(ROTA, t, { canalId: 2, membroId: 70 });
    const inexistente = await post(ROTA, t, { canalId: 999, membroId: 70 });
    expect(fora.status).toBe(404);
    expect(fora).toEqual(inexistente);
    // retirar (null) também: a resposta de fora do escopo não muda com o corpo
    expect(await post(ROTA, t, { canalId: 2, membroId: null })).toEqual(await post(ROTA, t, { canalId: 999, membroId: null }));
    expect(gravacoes()).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
    expect(mockConsultas.some(c => /MembroReferencia/.test(c.sql))).toBe(false);   // nem olhou o cadastro da pessoa indicada
  });

  test("o nível geral alcança o canal de qualquer congregação", async () => {
    montarBase();
    const r = await post(ROTA, tokenGeral(["canais_gestao"]), { canalId: 2, membroId: 70 });
    expect(r.status).toBe(200);
    expect(gravacoes()).toHaveLength(1);
  });
});

describe("canais/responsavel-acesso: o que a rota faz", () => {
  test("indica o responsável: 200, uma gravação com a matrícula, e a auditoria CANAL_RESPONSAVEL_ACESSO só com ids", async () => {
    montarBase();
    const r = await post(ROTA, tokenLocal(["canais_gestao"]), { canalId: 1, membroId: 70 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sucesso: true, canalId: 1, responsavelAcessoMembroId: 70 });
    expect(gravacoes()).toHaveLength(1);
    expect(gravacoes()[0].sql).toMatch(/UPDATE CanaisOficiaisComunicacao SET ResponsavelAcessoMembroId = @resp WHERE CanalId = @id/);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    const a = registrarAuditoria.mock.calls[0][0];
    expect(a).toEqual({ tabela: "CanaisOficiaisComunicacao", registroId: 1, acao: "CANAL_RESPONSAVEL_ACESSO", usuarioId: 5, dadosAntes: { responsavelAcessoMembroId: null }, dadosDepois: { responsavelAcessoMembroId: 70 } });
  });

  test("retira o responsável com null explícito: grava vazio e audita o antes e o depois", async () => {
    montarBase();
    const r = await post(ROTA, tokenLocal(["canais_gestao"]), { canalId: 4, membroId: null });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sucesso: true, responsavelAcessoMembroId: null });
    expect(gravacoes()[0].inputs.resp).toBeNull();
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ dadosAntes: { responsavelAcessoMembroId: 70 }, dadosDepois: { responsavelAcessoMembroId: null } });
  });

  test("recusas de regra viram 422 { sucesso:false, mensagem }, sem gravar: inativo, menor de 18, sem cadastro, o mesmo responsável, canal que não inclui menores", async () => {
    montarBase();
    const t = tokenLocal(["canais_gestao"]);
    const casos = [[1, 71, /membro ATIVO e adulto/], [1, 72, /membro ATIVO e adulto/], [1, 999, /membro ATIVO e adulto/], [4, 70, /já é o responsável/], [3, 70, /não está marcado como “inclui crianças\/adolescentes”/]];
    for (const [canalId, membroId, msg] of casos) {
      const r = await post(ROTA, t, { canalId, membroId });
      expect(r.status).toBe(422);
      expect(r.body.sucesso).toBe(false);
      expect(r.body.mensagem).toMatch(msg);
    }
    expect(gravacoes()).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe("as rotas existentes com o campo novo", () => {
  test("canais/atualizar com matrícula malformada: 422 do banco, sem gravar", async () => {
    montarBase();
    const r = await post("canais/atualizar", tokenLocal(["canais_gestao"]), { canalId: 1, responsavelAcessoMembroId: "0x10" });
    expect(r.status).toBe(422);
    expect(r.body.mensagem).toMatch(/responsável com acesso/);
    expect(gravacoes()).toHaveLength(0);
  });

  test("canais/atualizar liga a marca de menores num canal SEM administradores (permitido) e grava o responsável conferido", async () => {
    montarBase();
    const r = await post("canais/atualizar", tokenLocal(["canais_gestao"]), { canalId: 3, incluiMenores: true, responsavelAcessoMembroId: 70 });
    expect(r.status).toBe(200);
    expect(gravacoes().find(g => /UPDATE CanaisOficiaisComunicacao SET Nome/.test(g.sql)).inputs).toMatchObject({ menores: true, resp: 70 });
  });

  test("encerrar a única designação de um grupo com menores: 422 com a lista de pendências no corpo, sem encerrar", async () => {
    montarBase();
    quando(/SELECT CanalId FROM CanalAdministradores WHERE AdminId = @id/, [{ CanalId: 1 }]);
    quando(/SELECT AdminId, CanalId, MembroId, Papel, EncerradoEm FROM CanalAdministradores WHERE AdminId = @id/, [{ AdminId: 8, CanalId: 1, MembroId: 9, Papel: "ADMINISTRADOR", EncerradoEm: null }]);
    quando(/SELECT COUNT\(\*\) AS n FROM CanalAdministradores WHERE CanalId = @c AND EncerradoEm IS NULL/, [{ n: 1 }]);
    const r = await post("administradores/encerrar", tokenLocal(["canais_gestao"]), { adminId: 8, motivo: "Saiu da liderança da congregação" });
    expect(r.status).toBe(422);
    expect(r.body.pendencias).toEqual([expect.objectContaining({ codigo: "MENORES_SEM_SEGUNDO_ADULTO", gravidade: "ALTA" })]);
    expect(gravacoes()).toHaveLength(0);
  });
});
