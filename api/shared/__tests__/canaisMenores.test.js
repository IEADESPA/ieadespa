// v7.7 — Canal que inclui crianças e adolescentes: "segundo adulto administrador e responsável com acesso" (Lei 14.811/2024; Regimento Art. 160, §5º).
// Três camadas, todas sem banco de verdade:
//  1) a regra pura (shared/canais.js): as três pendências de gravidade ALTA, os limites (1 administrador; 2 sendo 1 menor de 18; responsável nulo/menor/inativo) e a
//     validação estrita da matrícula do responsável;
//  2) o banco (shared/canaisDb.js) com pool simulado pelo TEXTO da consulta: o estado só calcula a habilitação em canal com menores, as recusas duras (ligar a marca,
//     encerrar administrador, designar quem não está habilitado), o caminho feliz e a rota de indicar o responsável;
//  3) o detector diário: um fato por canal irregular, destinatários sem repetição, referência dentro do INT do banco.
// A habilitação em si (ministerioMenoresDb.aptidaoEmLote) é simulada: o que ela decide tem testes próprios (ministerioMenores.test.js).
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../ministerioMenoresDb", () => ({ aptidaoEmLote: jest.fn() }));

const c = require("../canais");
const db = require("../canaisDb");
const mm = require("../ministerioMenores");
const mmDb = require("../ministerioMenoresDb");
const { registrarAuditoria } = require("../auditoria");
const { hojeBrasilia } = require("../dataBrasilia");

const HOJE = hojeBrasilia();
// Data de nascimento de quem completa `anos` hoje (extraDias > 0 = fez aniversário há esse tanto; negativo = faz amanhã etc.).
const nascidoHa = (anos, extraDias = 0) => { const [a, m, d] = HOJE.split("-").map(Number); return new Date(Date.UTC(a - anos, m - 1, d - extraDias)); };

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// 1) A regra pura
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
describe("regra pura: grupo com menores", () => {
  const grupo = (extra = {}) => ({ plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_OFICIAL", identificador: "Grupo das crianças", ativo: true, custodiaSecretaria: false, incluiMenores: true, responsavelAcessoMembroId: 70, ...extra });
  const adm = (extra = {}) => ({ papel: "ADMINISTRADOR", ativo: true, termoVersaoAceita: 1, aptoMenores: true, adulto: true, ...extra });
  const resp = (extra = {}) => ({ membroId: 70, nome: "Mãe", ativo: true, adulto: true, ...extra });
  const estado = (extra = {}) => ({ termoVersao: 1, administradores: [adm(), adm()], responsavelAcesso: resp(), trocasAbertas: [], ocorrenciasVencidas: 0, ultimaConferencia: { em: `${HOJE}T10:00:00Z`, resultado: "CONFORME" }, ...extra });
  const conf = (canal, st) => c.conformidadeDoCanal(canal, st, { hoje: HOJE, conferenciaDias: 180 });
  const codigos = (r) => r.pendencias.map(p => p.codigo);
  const menores = (r) => codigos(r).filter(x => c.CODIGOS_PENDENCIA_MENORES.includes(x));

  test("dois administradores adultos habilitados com o Termo e responsável válido: o grupo fica REGULAR", () => {
    expect(conf(grupo(), estado())).toEqual({ situacao: "REGULAR", pendencias: [] });
  });

  test("canal que NÃO inclui menores não ganha nenhuma das três pendências, mesmo com um administrador só e sem responsável", () => {
    const r = conf(grupo({ incluiMenores: false, responsavelAcessoMembroId: null }), estado({ administradores: [adm({ aptoMenores: false })], responsavelAcesso: null }));
    expect(menores(r)).toEqual([]);
    expect(r.situacao).toBe("REGULAR");
  });

  test("um administrador só: MENORES_SEM_SEGUNDO_ADULTO, gravidade ALTA, o canal fica IRREGULAR", () => {
    const r = conf(grupo(), estado({ administradores: [adm()] }));
    expect(menores(r)).toEqual(["MENORES_SEM_SEGUNDO_ADULTO"]);
    expect(r.pendencias.find(p => p.codigo === "MENORES_SEM_SEGUNDO_ADULTO")).toMatchObject({ gravidade: "ALTA" });
    expect(r.pendencias[0].mensagem).toMatch(/dois administradores adultos/);
    expect(r.pendencias[0].mensagem).toMatch(/hoje há só um/);
    expect(r.situacao).toBe("IRREGULAR");
  });

  test("nenhum administrador: a mensagem diz que não há nenhum (e vem junto da pendência de administrador do canal)", () => {
    const r = conf(grupo(), estado({ administradores: [] }));
    expect(codigos(r)).toEqual(expect.arrayContaining(["SEM_ADMINISTRADOR", "MENORES_SEM_SEGUNDO_ADULTO"]));
    expect(r.pendencias.find(p => p.codigo === "MENORES_SEM_SEGUNDO_ADULTO").mensagem).toMatch(/hoje não há nenhum/);
  });

  test("dois administradores, mas um é menor de 18 anos: só conta um adulto (e o menor habilitado auxiliar não vira o segundo adulto)", () => {
    const r = conf(grupo(), estado({ administradores: [adm(), adm({ adulto: false })] }));
    expect(menores(r)).toEqual(["MENORES_SEM_SEGUNDO_ADULTO"]);
  });

  test("dois administradores adultos, mas um ainda não aceitou o Termo vigente (ou aceitou uma versão antiga): não conta como segundo adulto", () => {
    expect(menores(conf(grupo(), estado({ administradores: [adm(), adm({ termoVersaoAceita: null })] })))).toEqual(["MENORES_SEM_SEGUNDO_ADULTO"]);
    expect(menores(conf(grupo(), estado({ termoVersao: 2, administradores: [adm({ termoVersaoAceita: 2 }), adm({ termoVersaoAceita: 1 })] })))).toEqual(["MENORES_SEM_SEGUNDO_ADULTO"]);
  });

  test("designação encerrada (ativo:false) não conta; operador da conta conta como administrador", () => {
    expect(menores(conf(grupo(), estado({ administradores: [adm(), adm({ ativo: false, aptoMenores: false })] })))).toEqual(["MENORES_SEM_SEGUNDO_ADULTO"]);
    expect(menores(conf(grupo(), estado({ administradores: [adm(), adm({ papel: "OPERADOR" })] })))).toEqual([]);
  });

  test("administrador que não está apto: MENORES_ADMIN_SEM_HABILITACAO, e a mensagem NÃO cita o motivo", () => {
    const r = conf(grupo(), estado({ administradores: [adm(), adm({ aptoMenores: false })] }));
    expect(menores(r)).toEqual(["MENORES_ADMIN_SEM_HABILITACAO"]);
    const p = r.pendencias.find(x => x.codigo === "MENORES_ADMIN_SEM_HABILITACAO");
    expect(p.gravidade).toBe("ALTA");
    expect(p.mensagem).toMatch(/não está habilitado para servir com menores/);
    for (const motivo of Object.values(mm.ROTULO_BLOQUEIO)) expect(p.mensagem).not.toContain(motivo);
    expect(p.mensagem).not.toMatch(/antecedente|restri|denúncia|certid|treinamento|cadastro nacional/i);
    expect(r.situacao).toBe("IRREGULAR");
  });

  test("dois não habilitados: a mensagem fala no plural", () => {
    const r = conf(grupo(), estado({ administradores: [adm({ aptoMenores: false }), adm({ aptoMenores: false })] }));
    expect(r.pendencias.find(x => x.codigo === "MENORES_ADMIN_SEM_HABILITACAO").mensagem).toMatch(/2 administradores deste grupo não estão habilitados para servir com menores/);
  });

  test("falha FECHADO: administrador sem a informação de habilitação (ou sem a de idade) conta como não habilitado e não adulto", () => {
    const semInfo = { papel: "ADMINISTRADOR", ativo: true, termoVersaoAceita: 1 };
    expect(menores(conf(grupo(), estado({ administradores: [semInfo, semInfo] })))).toEqual(["MENORES_SEM_SEGUNDO_ADULTO", "MENORES_ADMIN_SEM_HABILITACAO"]);
  });

  test("responsável: sem matrícula indicada, ou a indicada não é membro ativo e adulto (inativo, menor, ausente do estado, outra matrícula)", () => {
    const r1 = conf(grupo({ responsavelAcessoMembroId: null }), estado({ responsavelAcesso: null }));
    expect(menores(r1)).toEqual(["MENORES_SEM_RESPONSAVEL"]);
    expect(r1.pendencias.find(p => p.codigo === "MENORES_SEM_RESPONSAVEL")).toMatchObject({ gravidade: "ALTA", mensagem: expect.stringMatching(/Falta indicar o responsável/) });
    expect(r1.situacao).toBe("IRREGULAR");
    for (const quem of [resp({ ativo: false }), resp({ adulto: false }), resp({ membroId: 71 }), null, undefined]) {
      const r = conf(grupo(), estado({ responsavelAcesso: quem }));
      expect(menores(r)).toEqual(["MENORES_SEM_RESPONSAVEL"]);
      expect(r.pendencias.find(p => p.codigo === "MENORES_SEM_RESPONSAVEL").mensagem).toMatch(/não é mais membro ativo e adulto/);
    }
  });

  test("as três juntas, em ordem estável; canal desativado não cobra nada", () => {
    const tudo = conf(grupo({ responsavelAcessoMembroId: null }), estado({ administradores: [adm({ aptoMenores: false })], responsavelAcesso: null }));
    expect(menores(tudo)).toEqual(["MENORES_SEM_SEGUNDO_ADULTO", "MENORES_ADMIN_SEM_HABILITACAO", "MENORES_SEM_RESPONSAVEL"]);
    expect(conf(grupo({ ativo: false, responsavelAcessoMembroId: null }), estado({ administradores: [], responsavelAcesso: null })).pendencias).toEqual([]);
  });

  test("cada pendência traz um resumo curto, em minúsculas e sem ponto final, que entra no meio do texto do aviso", () => {
    const todas = c.pendenciasDeMenores(grupo({ responsavelAcessoMembroId: null }), estado({ administradores: [adm({ aptoMenores: false })], responsavelAcesso: null }));
    expect(todas).toHaveLength(3);
    for (const p of todas) { expect(p.resumo).toMatch(/^[a-zà-ú]/); expect(p.resumo).not.toMatch(/[.;]$/); }
    const texto = mm.textoCanalIrregular({ canalNome: "Crianças da Central", problemas: todas.map(p => p.resumo) });
    expect(texto).toMatch(/^O canal “Crianças da Central” inclui menores e está fora da regra: há menos de dois administradores adultos/);
    expect(texto).toMatch(/falta indicar o responsável com acesso ao grupo\. Regularize/);
  });

  test("a conferência de quem olha o grupo ganha os dois itens da regra, junto de PROTECAO_MENORES — e só em canal com menores", () => {
    const itens = (canal) => c.itensDeConferencia(canal).map(i => i.codigo);
    expect(itens({ plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_OFICIAL", incluiMenores: true })).toEqual(["TERMO_DE_USO", "PROTECAO_MENORES", "MENORES_DOIS_ADMINISTRADORES", "MENORES_RESPONSAVEL_NO_GRUPO"]);
    expect(itens({ plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_OFICIAL" })).toEqual(["TERMO_DE_USO"]);
    const respostas = { TERMO_DE_USO: true, PROTECAO_MENORES: true, MENORES_DOIS_ADMINISTRADORES: true, MENORES_RESPONSAVEL_NO_GRUPO: false };
    expect(c.avaliarConferencia({ plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_OFICIAL", incluiMenores: true }, respostas)).toMatchObject({ valido: true, resultado: "IRREGULAR", irregulares: ["MENORES_RESPONSAVEL_NO_GRUPO"] });
    expect(c.avaliarConferencia({ plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_OFICIAL", incluiMenores: true }, { TERMO_DE_USO: true, PROTECAO_MENORES: true }).valido).toBe(false);
  });
});

describe("regra pura: validação da matrícula do responsável", () => {
  const BASE = { nome: "Grupo das crianças", plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_OFICIAL", identificador: "Grupo das crianças", vinculoInstitucional: "ESTRUTURA", declaracaoInstitucional: true, escopo: "CAMPO" };

  test("inteiro positivo estrito (número ou texto de dígitos) ou nulo; ausente = nulo", () => {
    expect(c.validarCanal({ ...BASE, incluiMenores: true, responsavelAcessoMembroId: 7 }).dados.responsavelAcessoMembroId).toBe(7);
    expect(c.validarCanal({ ...BASE, incluiMenores: true, responsavelAcessoMembroId: "7" }).dados.responsavelAcessoMembroId).toBe(7);
    expect(c.validarCanal({ ...BASE, incluiMenores: true, responsavelAcessoMembroId: null }).dados.responsavelAcessoMembroId).toBeNull();
    expect(c.validarCanal({ ...BASE, incluiMenores: true }).dados.responsavelAcessoMembroId).toBeNull();
  });

  test.each([["0x10"], ["1e1"], [true], [false], [[5]], [{}], [0], [-3], [1.5], ["abc"], [""], ["7.0"], [2147483648], ["1 2"]])("%p é recusado", (ruim) => {
    const r = c.validarCanal({ ...BASE, incluiMenores: true, responsavelAcessoMembroId: ruim });
    expect(r.valido).toBe(false);
    expect(r.mensagem).toMatch(/responsável com acesso/);
  });

  test("a matrícula malformada é recusada MESMO sem a marca de menores; bem formada, sem a marca, é guardada vazia (só vale em canal com menores)", () => {
    expect(c.validarCanal({ ...BASE, incluiMenores: false, responsavelAcessoMembroId: "0x10" }).valido).toBe(false);
    expect(c.validarCanal({ ...BASE, incluiMenores: false, responsavelAcessoMembroId: 7 }).dados).toMatchObject({ incluiMenores: false, responsavelAcessoMembroId: null });
    expect(c.validarCanal({ ...BASE, responsavelAcessoMembroId: 7 }).dados.responsavelAcessoMembroId).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// 2) O banco
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------

const ctx = () => ({
  congregacoes: new Map([[1, { id: 1, nome: "21 - Gênesis", nomeExibicao: "Gênesis", areaId: 10, ativa: true }]]),
  areas: new Map([[10, { id: 10, nome: "Área 1" }]]),
  departamentos: new Map(),
  congregacoesDaArea: () => [1]
});
const linhaCanal = (extra = {}) => ({
  CanalId: 5, Sigla: "WHATSAPP_GRUPO_5", Nome: "Grupo das crianças", Ativo: 1, Plataforma: "WHATSAPP_GRUPO", Categoria: "GRUPO_OFICIAL", TemaFocado: null,
  Identificador: "Grupo das crianças", IdentificadorNormalizado: "grupo das crianças", VinculoInstitucional: "ESTRUTURA", DeclaracaoInstitucionalEm: "2026-09-01T10:00:00.000Z",
  Escopo: "CAMPO", CongregacaoId: null, AreaId: null, DepartamentoId: null, IncluiMenores: 0, ResponsavelAcessoMembroId: null, PublicoNoSite: 0, Descricao: null,
  CustodiaSecretaria: 0, UltimaTrocaCredencialEm: null, VigenteDesde: "2026-09-01", VigenteAte: null, DesativadoMotivo: null, RegistradoEm: "2026-09-01T10:00:00.000Z", ...extra
});
const linhaAdmin = (adminId, membroId, extra = {}) => ({ AdminId: adminId, CanalId: 5, MembroId: membroId, MembroNome: `Admin ${membroId}`, Papel: "ADMINISTRADOR", TermoVersaoAceita: c.TERMO_VERSAO, TermoAceitoEm: "2026-09-02T10:00:00.000Z", DesignadoEm: "2026-09-01T10:00:00.000Z", ...extra });
const dadosCanal = (extra = {}) => ({
  nome: "Grupo das crianças", plataforma: "WHATSAPP_GRUPO", categoria: "GRUPO_OFICIAL", identificador: "Grupo das crianças",
  vinculoInstitucional: "ESTRUTURA", declaracaoInstitucional: true, escopo: "CAMPO", ...extra
});

// Banco simulado pelo TEXTO da consulta (as regras mais específicas primeiro). Consulta sem regra devolve vazio.
function poolPorTexto(regras) {
  const consultas = [];
  const pool = { request: () => {
    const inputs = {};
    const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
      consultas.push({ sql: texto, inputs: { ...inputs } });
      for (const [padrao, valor] of regras) if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, rowsAffected: [1] };
      return { recordset: [], rowsAffected: [0] };
    } };
    return r;
  } };
  return { pool, consultas };
}
const escritas = (consultas) => consultas.filter(q => /^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.test(q.sql));
const APTO = { apto: true, contaComoAdulto: true, bloqueios: [] };
const BLOQUEADO = (...codigos) => ({ apto: false, contaComoAdulto: true, bloqueios: codigos.map(codigo => ({ codigo, mensagem: `mensagem de ${codigo}` })) });

// Membros do cenário: 9 e 10 = administradores adultos; 11 = candidato a administrador; 70 = mãe (responsável); 71 = inativa; 72 = menor de idade; 73 = sem data de nascimento.
const MEMBROS = {
  9: { MembroId: 9, Nome: "Admin Nove", Status: "ATIVO", DataNascimento: nascidoHa(40) },
  10: { MembroId: 10, Nome: "Admin Dez", Status: "ATIVO", DataNascimento: nascidoHa(35) },
  11: { MembroId: 11, Nome: "Candidato Onze", Status: "ATIVO", DataNascimento: nascidoHa(30), Email: "onze@exemplo.org" },
  70: { MembroId: 70, Nome: "Mãe Setenta", Status: "ATIVO", DataNascimento: nascidoHa(38) },
  71: { MembroId: 71, Nome: "Inativa Setenta e Um", Status: "INATIVO", DataNascimento: nascidoHa(38) },
  72: { MembroId: 72, Nome: "Menor Setenta e Dois", Status: "ATIVO", DataNascimento: nascidoHa(18, -1) },
  73: { MembroId: 73, Nome: "Sem Nascimento", Status: "ATIVO", DataNascimento: null },
  74: { MembroId: 74, Nome: "Exatos Dezoito", Status: "ATIVO", DataNascimento: nascidoHa(18) }
};

// Monta o cenário de um canal 5 (e opcionalmente outros) no pool por texto.
function cenario({ canal = linhaCanal(), outrosCanais = [], admins = [], aptidao = {}, extra = [] } = {}) {
  mmDb.aptidaoEmLote.mockReset();
  mmDb.aptidaoEmLote.mockImplementation(async (_pool, ids) => new Map(ids.map(id => [id, aptidao[id] || BLOQUEADO("SEM_HABILITACAO")])));
  const todos = [canal, ...outrosCanais];
  const regras = [
    ...extra,
    [/SELECT TOP 500 \* FROM CanaisOficiaisComunicacao/, (i) => (i.canalId ? todos.filter(x => x.CanalId === i.canalId) : todos)],
    [/SELECT CanalId, ResponsavelAcessoMembroId FROM CanaisOficiaisComunicacao WHERE Ativo = 1 AND IncluiMenores = 1/, (i) => todos.filter(x => x.Ativo && x.IncluiMenores && (!i.canalId || x.CanalId === i.canalId)).map(x => ({ CanalId: x.CanalId, ResponsavelAcessoMembroId: x.ResponsavelAcessoMembroId }))],
    [/FROM CanalAdministradores a JOIN MembroReferencia m ON m\.MembroId = a\.MembroId WHERE a\.EncerradoEm IS NULL/, (i) => admins.filter(a => !i.canalId || a.CanalId === i.canalId)],
    [/SELECT MembroId, Nome, Status, DataNascimento FROM MembroReferencia WHERE MembroId IN/, (i) => Object.keys(i).filter(k => /^r\d+$/.test(k)).map(k => MEMBROS[i[k]]).filter(Boolean)],
    [/SELECT MembroId, (Nome, )?Status, DataNascimento FROM MembroReferencia WHERE MembroId = @id/, (i) => (MEMBROS[i.id] ? [MEMBROS[i.id]] : [])],
    [/SELECT COUNT\(\*\) AS n FROM CanalAdministradores WHERE CanalId = @c AND EncerradoEm IS NULL/, (i) => [{ n: admins.filter(a => a.CanalId === i.c).length }]],
    [/SELECT Email FROM MembroReferencia WHERE MembroId = @id/, (i) => (MEMBROS[i.id] ? [{ Email: MEMBROS[i.id].Email || null }] : [])]
  ];
  return poolPorTexto(regras);
}

beforeEach(() => { registrarAuditoria.mockClear(); mmDb.aptidaoEmLote.mockReset(); });

describe("estado dos canais: a habilitação só é calculada onde há menores", () => {
  test("canal sem menores: nenhuma leitura de habilitação e nenhum dado novo nos administradores", async () => {
    const { pool } = cenario({ canal: linhaCanal(), admins: [linhaAdmin(1, 9), linhaAdmin(2, 10)] });
    const st = await db.carregarEstadoDosCanais(pool, { hoje: HOJE });
    expect(mmDb.aptidaoEmLote).not.toHaveBeenCalled();
    expect(st.obter(5).administradores).toHaveLength(2);
    expect(st.obter(5).administradores[0]).not.toHaveProperty("aptoMenores");
    expect(st.obter(5)).not.toHaveProperty("responsavelAcesso");
  });

  test("canal com menores: UMA leitura para os administradores de TODOS os canais com menores (e só deles), e o responsável ativo/adulto calculado pelo banco", async () => {
    const { pool, consultas } = cenario({
      canal: linhaCanal({ IncluiMenores: 1, ResponsavelAcessoMembroId: 70 }),
      outrosCanais: [linhaCanal({ CanalId: 6, Nome: "Sem menores" }), linhaCanal({ CanalId: 7, Nome: "Outro com menores", IncluiMenores: 1, ResponsavelAcessoMembroId: 71 })],
      admins: [linhaAdmin(1, 9), linhaAdmin(2, 10), linhaAdmin(3, 11, { CanalId: 6 }), linhaAdmin(4, 9, { CanalId: 7 })],
      aptidao: { 9: APTO, 10: BLOQUEADO("ANTECEDENTES_COM_RESTRICAO") }
    });
    const st = await db.carregarEstadoDosCanais(pool, { hoje: HOJE });
    expect(mmDb.aptidaoEmLote).toHaveBeenCalledTimes(1);
    expect([...mmDb.aptidaoEmLote.mock.calls[0][1]].sort((a, b) => a - b)).toEqual([9, 10]);        // o 11 é de canal SEM menores: não entra
    expect(mmDb.aptidaoEmLote.mock.calls[0][2]).toEqual({ hoje: HOJE });
    const e5 = st.obter(5);
    expect(e5.administradores.map(a => [a.membroId, a.aptoMenores, a.adulto])).toEqual([[9, true, true], [10, false, true]]);
    expect(e5.responsavelAcesso).toEqual({ membroId: 70, nome: "Mãe Setenta", ativo: true, adulto: true });
    expect(st.obter(7).responsavelAcesso).toEqual({ membroId: 71, nome: "Inativa Setenta e Um", ativo: false, adulto: true });
    expect(st.obter(6)).not.toHaveProperty("responsavelAcesso");
    expect(consultas.filter(q => /MembroReferencia WHERE MembroId IN/.test(q.sql))).toHaveLength(1);
  });

  test("responsável menor de 18 anos ou sem data de nascimento não é adulto; 18 anos completos hoje é", async () => {
    for (const [id, adulto] of [[72, false], [73, false], [74, true]]) {
      const { pool } = cenario({ canal: linhaCanal({ IncluiMenores: 1, ResponsavelAcessoMembroId: id }) });
      const st = await db.carregarEstadoDosCanais(pool, { hoje: HOJE });
      expect(st.obter(5).responsavelAcesso).toMatchObject({ membroId: id, ativo: true, adulto });
    }
  });

  test("canal com menores e sem administradores: a leitura de habilitação nem é feita; o responsável vem", async () => {
    const { pool } = cenario({ canal: linhaCanal({ IncluiMenores: 1, ResponsavelAcessoMembroId: 70 }), admins: [] });
    const st = await db.carregarEstadoDosCanais(pool, { hoje: HOJE });
    expect(mmDb.aptidaoEmLote).not.toHaveBeenCalled();
    expect(st.obter(5).responsavelAcesso).toMatchObject({ membroId: 70, ativo: true, adulto: true });
  });

  test("canal INATIVO com menores não paga o custo (a conformidade nem o cobra)", async () => {
    const { pool } = cenario({ canal: linhaCanal({ Ativo: 0, IncluiMenores: 1 }), admins: [linhaAdmin(1, 9)] });
    await db.carregarEstadoDosCanais(pool, { hoje: HOJE });
    expect(mmDb.aptidaoEmLote).not.toHaveBeenCalled();
  });

  test("a lista de canais da gestão traz as pendências novas e o painel soma os grupos com menores fora da regra", async () => {
    const { pool } = cenario({
      canal: linhaCanal({ IncluiMenores: 1, ResponsavelAcessoMembroId: null }),
      admins: [linhaAdmin(1, 9)], aptidao: { 9: APTO },
      extra: [[/FROM Prazos WHERE Sigla/, []], [/FROM CongregacaoTransmissao/, []], [/FROM CanalOcorrencias WHERE Status = 'ABERTA' GROUP BY/, []], [/FROM CanalTrocasCredencial WHERE ResolvidaEm IS NULL GROUP BY/, []]]
    });
    const lista = await db.listarCanais(pool, ctx(), { hoje: HOJE });
    expect(lista[0].situacao).toBe("IRREGULAR");
    expect(lista[0].pendencias.map(p => p.codigo)).toEqual(expect.arrayContaining(["MENORES_SEM_SEGUNDO_ADULTO", "MENORES_SEM_RESPONSAVEL"]));
    const cob = await db.montarCobertura(pool, ctx(), { hoje: HOJE });
    expect(cob.resumo.menoresIrregulares).toBe(1);
  });

  test("o detalhe do canal (só da gestão) traz quem está apto (sim/não, sem o motivo) e o responsável com nome", async () => {
    const { pool } = cenario({
      canal: linhaCanal({ IncluiMenores: 1, ResponsavelAcessoMembroId: 70 }),
      admins: [linhaAdmin(1, 9), linhaAdmin(2, 10)], aptidao: { 9: APTO, 10: BLOQUEADO("CADASTRO_NACIONAL") },
      extra: [[/FROM Prazos WHERE Sigla/, []], [/FROM CanalConferencias c JOIN/, []]]
    });
    const d = await db.detalharCanal(pool, 5, ctx(), { hoje: HOJE });
    expect(d.administradores.map(a => [a.membroId, a.aptoMenores])).toEqual([[9, true], [10, false]]);
    expect(d.responsavelAcesso).toMatchObject({ membroId: 70, nome: "Mãe Setenta", ativo: true, adulto: true });
    expect(d.pendencias.map(p => p.codigo)).toContain("MENORES_ADMIN_SEM_HABILITACAO");
    expect(JSON.stringify(d)).not.toMatch(/CADASTRO_NACIONAL|mensagem de/);
    expect(d.itensConferencia.map(i => i.codigo)).toContain("MENORES_DOIS_ADMINISTRADORES");
  });

  test("o detalhe de canal SEM menores não ganha responsável", async () => {
    const { pool } = cenario({ canal: linhaCanal(), admins: [linhaAdmin(1, 9)], extra: [[/FROM Prazos WHERE Sigla/, []], [/FROM CanalConferencias c JOIN/, []]] });
    expect((await db.detalharCanal(pool, 5, ctx(), { hoje: HOJE })).responsavelAcesso).toBeNull();
  });
});

describe("registro e edição do canal: o responsável com acesso", () => {
  test.each([
    [71, /situação ATIVO/],
    [72, /precisa ser adulto/],
    [73, /precisa ser adulto/],
    [999, /não encontrada/]
  ])("registrar com o responsável %p é recusado (422), sem gravar, e a mensagem não cita nome", async (id, msg) => {
    const { pool, consultas } = cenario();
    const r = await db.criarCanal(pool, ctx(), dadosCanal({ incluiMenores: true, responsavelAcessoMembroId: id }), { membroId: 1 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(msg);
    expect(r.mensagem).not.toMatch(/Setenta|Menor|Inativa|Sem Nascimento/);
    expect(escritas(consultas)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  test("matrícula malformada nem chega ao banco", async () => {
    const { pool, consultas } = cenario();
    for (const ruim of ["0x10", "1e1", true, [5], 0]) {
      const r = await db.criarCanal(pool, ctx(), dadosCanal({ incluiMenores: true, responsavelAcessoMembroId: ruim }), { membroId: 1 });
      expect(r).toMatchObject({ sucesso: false, mensagem: expect.stringMatching(/responsável com acesso/) });
    }
    expect(consultas).toHaveLength(0);
  });

  test("canal NOVO com menores e responsável válido, ainda sem administradores, é aceito: grava a matrícula e avisa que nasce irregular", async () => {
    const { pool, consultas } = cenario({ extra: [[/INSERT INTO CanaisOficiaisComunicacao/, [{ CanalId: 5 }]]] });
    const r = await db.criarCanal(pool, ctx(), dadosCanal({ incluiMenores: true, responsavelAcessoMembroId: 70 }), { membroId: 1 });
    expect(r.sucesso).toBe(true);
    expect(r.mensagem).toMatch(/IRREGULAR até ter ao menos dois administradores adultos habilitados e um responsável/);
    const ins = escritas(consultas).find(q => /INSERT INTO CanaisOficiaisComunicacao/.test(q.sql));
    expect(ins.inputs).toMatchObject({ menores: true, resp: 70 });
    expect(ins.sql).toMatch(/ResponsavelAcessoMembroId/);
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "CANAL_REGISTRADO", dadosDepois: expect.objectContaining({ responsavelAcessoMembroId: 70 }) }));
    expect(mmDb.aptidaoEmLote).not.toHaveBeenCalled();
  });

  test("canal novo SEM a marca de menores: o responsável informado é guardado vazio", async () => {
    const { pool, consultas } = cenario({ extra: [[/INSERT INTO CanaisOficiaisComunicacao/, [{ CanalId: 5 }]]] });
    const r = await db.criarCanal(pool, ctx(), dadosCanal({ incluiMenores: false, responsavelAcessoMembroId: 70 }), { membroId: 1 });
    expect(r.sucesso).toBe(true);
    expect(r.mensagem).not.toMatch(/IRREGULAR/);
    expect(escritas(consultas).find(q => /INSERT INTO CanaisOficiaisComunicacao/.test(q.sql)).inputs).toMatchObject({ menores: false, resp: null });
  });

  test("atualizar: indicar outro responsável confere o novo; manter o mesmo não reconfere (canal cujo responsável ficou inativo segue editável)", async () => {
    const inativo = cenario({ canal: linhaCanal({ IncluiMenores: 1, ResponsavelAcessoMembroId: 71 }), admins: [linhaAdmin(1, 9), linhaAdmin(2, 10)], aptidao: { 9: APTO, 10: APTO } });
    const mudaNome = await db.atualizarCanal(inativo.pool, ctx(), 5, { nome: "Grupo das crianças da Central" }, { membroId: 1 });
    expect(mudaNome.sucesso).toBe(true);
    expect(escritas(inativo.consultas).find(q => /UPDATE CanaisOficiaisComunicacao/.test(q.sql)).inputs.resp).toBe(71);
    expect(inativo.consultas.some(q => /FROM MembroReferencia WHERE MembroId = @id/.test(q.sql))).toBe(false);

    const outro = cenario({ canal: linhaCanal({ IncluiMenores: 1, ResponsavelAcessoMembroId: 70 }), admins: [linhaAdmin(1, 9), linhaAdmin(2, 10)] });
    const ruim = await db.atualizarCanal(outro.pool, ctx(), 5, { responsavelAcessoMembroId: 72 }, { membroId: 1 });
    expect(ruim).toMatchObject({ sucesso: false, mensagem: expect.stringMatching(/precisa ser adulto/) });
    expect(escritas(outro.consultas)).toHaveLength(0);
    const bom = await db.atualizarCanal(outro.pool, ctx(), 5, { responsavelAcessoMembroId: 74 }, { membroId: 1 });
    expect(bom.sucesso).toBe(true);
  });

  test("atualizar: retirar (null) grava vazio; desmarcar a marca de menores também limpa o responsável (e nunca é bloqueado)", async () => {
    const a = cenario({ canal: linhaCanal({ IncluiMenores: 1, ResponsavelAcessoMembroId: 70 }), admins: [linhaAdmin(1, 9)] });
    expect((await db.atualizarCanal(a.pool, ctx(), 5, { responsavelAcessoMembroId: null }, { membroId: 1 })).sucesso).toBe(true);
    expect(escritas(a.consultas).find(q => /UPDATE CanaisOficiaisComunicacao/.test(q.sql)).inputs.resp).toBeNull();
    const b = cenario({ canal: linhaCanal({ IncluiMenores: 1, ResponsavelAcessoMembroId: 70 }), admins: [linhaAdmin(1, 9)] });
    expect((await db.atualizarCanal(b.pool, ctx(), 5, { incluiMenores: false }, { membroId: 1 })).sucesso).toBe(true);
    expect(escritas(b.consultas).find(q => /UPDATE CanaisOficiaisComunicacao/.test(q.sql)).inputs).toMatchObject({ menores: false, resp: null });
    expect(mmDb.aptidaoEmLote).not.toHaveBeenCalled();
  });
});

describe("bloqueio duro 1: ligar 'inclui menores' num canal que já tem administradores", () => {
  test("com um administrador só: 422, com a lista das pendências, e nada é gravado", async () => {
    const { pool, consultas } = cenario({ canal: linhaCanal(), admins: [linhaAdmin(1, 9)], aptidao: { 9: APTO } });
    const r = await db.atualizarCanal(pool, ctx(), 5, { incluiMenores: true, responsavelAcessoMembroId: 70 }, { membroId: 1 });
    expect(r.sucesso).toBe(false);
    expect(r.pendencias.map(p => p.codigo)).toEqual(["MENORES_SEM_SEGUNDO_ADULTO"]);
    expect(r.mensagem).toMatch(/já tem administradores/);
    expect(r.mensagem).toMatch(/dois administradores adultos/);
    expect(escritas(consultas)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  test("dois administradores, um deles sem habilitação, e sem responsável: as duas pendências, sem o motivo", async () => {
    const { pool, consultas } = cenario({ canal: linhaCanal(), admins: [linhaAdmin(1, 9), linhaAdmin(2, 10)], aptidao: { 9: APTO, 10: BLOQUEADO("ANTECEDENTES_COM_RESTRICAO") } });
    const r = await db.atualizarCanal(pool, ctx(), 5, { incluiMenores: true }, { membroId: 1 });
    expect(r.sucesso).toBe(false);
    expect(r.pendencias.map(p => p.codigo)).toEqual(["MENORES_ADMIN_SEM_HABILITACAO", "MENORES_SEM_RESPONSAVEL"]);
    expect(r.mensagem).not.toMatch(/RESTRICAO|restrição|antecedentes/i);
    expect(escritas(consultas)).toHaveLength(0);
  });

  test("regra já cumprida (dois adultos habilitados com o Termo e responsável indicado NA MESMA gravação): liga e grava o responsável", async () => {
    const { pool, consultas } = cenario({ canal: linhaCanal(), admins: [linhaAdmin(1, 9), linhaAdmin(2, 10)], aptidao: { 9: APTO, 10: APTO } });
    const r = await db.atualizarCanal(pool, ctx(), 5, { incluiMenores: true, responsavelAcessoMembroId: 70 }, { membroId: 1 });
    expect(r.sucesso).toBe(true);
    expect(escritas(consultas).find(q => /UPDATE CanaisOficiaisComunicacao/.test(q.sql)).inputs).toMatchObject({ menores: true, resp: 70 });
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "CANAL_ATUALIZADO" }));
  });

  test("um dos dois administradores não aceitou o Termo: continua sendo recusado", async () => {
    const { pool } = cenario({ canal: linhaCanal(), admins: [linhaAdmin(1, 9), linhaAdmin(2, 10, { TermoVersaoAceita: null, TermoAceitoEm: null })], aptidao: { 9: APTO, 10: APTO } });
    const r = await db.atualizarCanal(pool, ctx(), 5, { incluiMenores: true, responsavelAcessoMembroId: 70 }, { membroId: 1 });
    expect(r.pendencias.map(p => p.codigo)).toEqual(["MENORES_SEM_SEGUNDO_ADULTO"]);
  });

  test("canal AINDA SEM administradores pode ligar a marca (não há quem habilitar): fica irregular até cumprir", async () => {
    const { pool, consultas } = cenario({ canal: linhaCanal(), admins: [] });
    const r = await db.atualizarCanal(pool, ctx(), 5, { incluiMenores: true }, { membroId: 1 });
    expect(r.sucesso).toBe(true);
    expect(escritas(consultas).find(q => /UPDATE CanaisOficiaisComunicacao/.test(q.sql)).inputs).toMatchObject({ menores: true });
    expect(mmDb.aptidaoEmLote).not.toHaveBeenCalled();
  });

  test("quem já estava marcado como menores não passa pela trava ao editar outros campos", async () => {
    const { pool } = cenario({ canal: linhaCanal({ IncluiMenores: 1 }), admins: [linhaAdmin(1, 9)], aptidao: { 9: APTO } });
    const r = await db.atualizarCanal(pool, ctx(), 5, { descricao: "Só a descrição" }, { membroId: 1 });
    expect(r.sucesso).toBe(true);
  });
});

describe("bloqueio duro 2: encerrar administrador de grupo com menores", () => {
  const motivo = "Saiu da liderança da congregação";
  const admin = (id = 1, membro = 9) => ({ AdminId: id, CanalId: 5, MembroId: membro, Papel: "ADMINISTRADOR", EncerradoEm: null });

  test("deixaria o grupo ativo com menos de dois administradores: 422 com a pendência, sem encerrar e sem abrir troca de senha", async () => {
    const { pool, consultas } = cenario({ canal: linhaCanal({ IncluiMenores: 1 }), admins: [linhaAdmin(1, 9), linhaAdmin(2, 10)], extra: [[/FROM CanalAdministradores WHERE AdminId = @id/, [admin()]]] });
    const r = await db.encerrarAdministrador(pool, ctx(), { adminId: 1, motivo, por: 1, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.pendencias).toEqual([expect.objectContaining({ codigo: "MENORES_SEM_SEGUNDO_ADULTO", gravidade: "ALTA" })]);
    expect(r.mensagem).toMatch(/precisa manter pelo menos dois administradores/);
    expect(r.mensagem).toMatch(/designe antes o substituto/);
    expect(escritas(consultas)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  test("o único administrador também não pode sair", async () => {
    const { pool, consultas } = cenario({ canal: linhaCanal({ IncluiMenores: 1 }), admins: [linhaAdmin(1, 9)], extra: [[/FROM CanalAdministradores WHERE AdminId = @id/, [admin()]]] });
    expect((await db.encerrarAdministrador(pool, ctx(), { adminId: 1, motivo, por: 1, hoje: HOJE })).sucesso).toBe(false);
    expect(escritas(consultas)).toHaveLength(0);
  });

  test("com três administradores, encerrar um deixa dois: passa, audita e abre a troca de senha", async () => {
    const { pool, consultas } = cenario({
      canal: linhaCanal({ IncluiMenores: 1 }), admins: [linhaAdmin(1, 9), linhaAdmin(2, 10), linhaAdmin(3, 11)],
      extra: [[/FROM CanalAdministradores WHERE AdminId = @id/, [admin()]], [/INSERT INTO CanalTrocasCredencial/, [{ TrocaId: 40 }]], [/FROM Prazos WHERE Sigla/, []]]
    });
    const r = await db.encerrarAdministrador(pool, ctx(), { adminId: 1, motivo, por: 1, hoje: HOJE });
    expect(r.sucesso).toBe(true);
    expect(escritas(consultas).some(q => /UPDATE CanalAdministradores SET EncerradoEm/.test(q.sql))).toBe(true);
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "ADMIN_ENCERRADO" }));
  });

  test("canal sem menores, canal já desativado e canal sendo desativado: sem a trava (e sem consultar a contagem)", async () => {
    for (const [canal, opcoes] of [[linhaCanal(), {}], [linhaCanal({ Ativo: 0, IncluiMenores: 1 }), {}], [linhaCanal({ IncluiMenores: 1 }), { canalDesativando: true }]]) {
      const { pool, consultas } = cenario({ canal, admins: [linhaAdmin(1, 9)], extra: [[/FROM CanalAdministradores WHERE AdminId = @id/, [admin()]], [/INSERT INTO CanalTrocasCredencial/, [{ TrocaId: 41 }]], [/FROM Prazos WHERE Sigla/, []]] });
      const r = await db.encerrarAdministrador(pool, ctx(), { adminId: 1, motivo, por: 1, hoje: HOJE, ...opcoes });
      expect(r.sucesso).toBe(true);
      expect(consultas.some(q => /COUNT\(\*\) AS n FROM CanalAdministradores/.test(q.sql))).toBe(false);
    }
  });
});

describe("bloqueio duro 3: designar administrador em grupo com menores", () => {
  const designar = (pool, membroId = 11) => db.designarAdministrador(pool, ctx(), { canalId: 5, membroId, papel: "ADMINISTRADOR", designadoPor: 1, deps: {} });

  test("quem não está habilitado é recusado, sem designar; a mensagem diz o que falta mas mascara a pendência com a Diretoria", async () => {
    const { pool, consultas } = cenario({ canal: linhaCanal({ IncluiMenores: 1 }), aptidao: { 11: BLOQUEADO("TREINAMENTO_AUSENTE", "ANTECEDENTES_COM_RESTRICAO", "AUTO_DENUNCIA_EM_ANALISE", "CADASTRO_NACIONAL") } });
    const r = await designar(pool);
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/só administra quem está habilitado para servir com menores/);
    expect(r.mensagem).toMatch(/sem treinamento de proteção/);
    expect(r.mensagem).toMatch(/pendência a tratar com a diretoria executiva/);
    expect(r.mensagem).not.toMatch(/restrição|comunicação|cadastro nacional/i);
    expect(r.mensagem).not.toMatch(/Candidato Onze/);
    expect(escritas(consultas)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  test("a leitura da habilitação é só da pessoa que está sendo designada", async () => {
    const { pool } = cenario({ canal: linhaCanal({ IncluiMenores: 1 }), aptidao: { 11: BLOQUEADO("SEM_HABILITACAO") } });
    await designar(pool);
    expect(mmDb.aptidaoEmLote).toHaveBeenCalledTimes(1);
    expect(mmDb.aptidaoEmLote.mock.calls[0][1]).toEqual([11]);
  });

  test("quem está apto é designado (o aviso do Termo sai) e a designação é auditada", async () => {
    const { pool, consultas } = cenario({ canal: linhaCanal({ IncluiMenores: 1 }), aptidao: { 11: APTO }, extra: [[/INSERT INTO CanalAdministradores/, [{ AdminId: 33 }]]] });
    const r = await designar(pool);
    expect(r).toMatchObject({ sucesso: true, adminId: 33 });
    expect(escritas(consultas).some(q => /INSERT INTO CanalAdministradores/.test(q.sql))).toBe(true);
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "ADMIN_DESIGNADO" }));
  });

  test("canal SEM menores: designa sem calcular habilitação nenhuma", async () => {
    const { pool } = cenario({ canal: linhaCanal(), extra: [[/INSERT INTO CanalAdministradores/, [{ AdminId: 34 }]]] });
    expect((await designar(pool)).sucesso).toBe(true);
    expect(mmDb.aptidaoEmLote).not.toHaveBeenCalled();
  });

  test("as recusas antigas continuam antes: menor de 18 anos nem chega à leitura da habilitação", async () => {
    const { pool } = cenario({ canal: linhaCanal({ IncluiMenores: 1 }), aptidao: { 72: APTO } });
    const r = await designar(pool, 72);
    expect(r.mensagem).toMatch(/18 anos/);
    expect(mmDb.aptidaoEmLote).not.toHaveBeenCalled();
  });
});

describe("definirResponsavelAcesso (a rota canais/responsavel-acesso)", () => {
  test("indica um responsável válido: grava, audita SÓ com matrículas", async () => {
    const { pool, consultas } = cenario({ canal: linhaCanal({ IncluiMenores: 1, ResponsavelAcessoMembroId: null }) });
    const r = await db.definirResponsavelAcesso(pool, ctx(), { canalId: 5, membroId: 70, por: 1 });
    expect(r).toMatchObject({ sucesso: true, canalId: 5, responsavelAcessoMembroId: 70 });
    const up = escritas(consultas);
    expect(up).toHaveLength(1);
    expect(up[0].inputs).toMatchObject({ id: 5, resp: 70 });
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    const chamada = registrarAuditoria.mock.calls[0][0];
    expect(chamada).toMatchObject({ tabela: "CanaisOficiaisComunicacao", registroId: 5, acao: "CANAL_RESPONSAVEL_ACESSO", usuarioId: 1, dadosAntes: { responsavelAcessoMembroId: null }, dadosDepois: { responsavelAcessoMembroId: 70 } });
    expect(JSON.stringify(chamada)).not.toMatch(/Mãe|Setenta|Nome/);
  });

  test("retirar (null) grava vazio e avisa que o canal fica irregular; retirar de quem já está sem ninguém é recusado", async () => {
    const com = cenario({ canal: linhaCanal({ IncluiMenores: 1, ResponsavelAcessoMembroId: 70 }) });
    const r = await db.definirResponsavelAcesso(com.pool, ctx(), { canalId: 5, membroId: null, por: 1 });
    expect(r).toMatchObject({ sucesso: true, responsavelAcessoMembroId: null });
    expect(r.mensagem).toMatch(/IRREGULAR/);
    expect(escritas(com.consultas)[0].inputs.resp).toBeNull();
    const sem = cenario({ canal: linhaCanal({ IncluiMenores: 1 }) });
    expect((await db.definirResponsavelAcesso(sem.pool, ctx(), { canalId: 5, membroId: null, por: 1 })).mensagem).toMatch(/já está sem responsável/);
    expect(escritas(sem.consultas)).toHaveLength(0);
  });

  test("recusas: o mesmo responsável, inativo, menor, matrícula inexistente, canal sem a marca, canal desativado, canal inexistente — nenhuma grava", async () => {
    const casos = [
      [linhaCanal({ IncluiMenores: 1, ResponsavelAcessoMembroId: 70 }), 70, /já é o responsável/],
      [linhaCanal({ IncluiMenores: 1 }), 71, /situação ATIVO/],
      [linhaCanal({ IncluiMenores: 1 }), 72, /precisa ser adulto/],
      [linhaCanal({ IncluiMenores: 1 }), 999, /não encontrada/],
      [linhaCanal({ IncluiMenores: 0 }), 70, /não está marcado como “inclui crianças\/adolescentes”/],
      [linhaCanal({ IncluiMenores: 1, Ativo: 0 }), 70, /desativado/]
    ];
    for (const [canal, membroId, msg] of casos) {
      const { pool, consultas } = cenario({ canal });
      const r = await db.definirResponsavelAcesso(pool, ctx(), { canalId: 5, membroId, por: 1 });
      expect(r.sucesso).toBe(false);
      expect(r.mensagem).toMatch(msg);
      expect(r.mensagem).not.toMatch(/Setenta|Menor|Inativa/);
      expect(escritas(consultas)).toHaveLength(0);
    }
    const vazio = cenario({ canal: linhaCanal() });
    expect((await db.definirResponsavelAcesso(vazio.pool, ctx(), { canalId: 99, membroId: 70, por: 1 })).mensagem).toMatch(/Canal não encontrado/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  test("matrícula malformada também é recusada aqui (defesa em profundidade, além da rota)", async () => {
    for (const ruim of ["0x10", "1e1", true, [5], 0]) {
      const { pool, consultas } = cenario({ canal: linhaCanal({ IncluiMenores: 1 }) });
      expect((await db.definirResponsavelAcesso(pool, ctx(), { canalId: 5, membroId: ruim, por: 1 })).sucesso).toBe(false);
      expect(escritas(consultas)).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// 3) O detector diário
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------

describe("detectarCanaisComMenoresIrregulares", () => {
  const GESTORES = [{ membroId: 1, nome: "Secretaria", email: "sec@exemplo.org" }, { membroId: 9, nome: "Admin Nove", email: "nove@exemplo.org" }];
  const detectar = (pool, hoje = "2026-10-09") => db.detectarCanaisComMenoresIrregulares(pool, { hoje });
  function cenarioDetector(canais, admins, aptidao) {
    const emailsPorCanal = (i) => admins.filter(a => a.CanalId === i.canalId).map(a => ({ membroId: a.MembroId, nome: a.MembroNome, email: `${a.MembroId}@exemplo.org` }));
    return cenario({
      canal: canais[0], outrosCanais: canais.slice(1), admins, aptidao,
      extra: [
        [/SELECT CanalId, Nome, ResponsavelAcessoMembroId FROM CanaisOficiaisComunicacao WHERE Ativo = 1 AND IncluiMenores = 1/, canais.filter(x => x.Ativo && x.IncluiMenores).map(x => ({ CanalId: x.CanalId, Nome: x.Nome, ResponsavelAcessoMembroId: x.ResponsavelAcessoMembroId }))],
        [/SELECT DISTINCT m\.MembroId AS membroId, m\.Nome AS nome, m\.Email AS email\s+FROM CanalAdministradores a/, emailsPorCanal],
        [/SELECT DISTINCT m\.MembroId AS membroId, m\.Nome AS nome, m\.Email AS email\s+FROM Lideranca l/, GESTORES]
      ]
    });
  }

  test("sem canal com menores: nada, e nenhuma outra leitura", async () => {
    const { pool, consultas } = cenarioDetector([linhaCanal()], [], {});
    expect(await detectar(pool)).toEqual([]);
    expect(consultas).toHaveLength(1);
    expect(mmDb.aptidaoEmLote).not.toHaveBeenCalled();
  });

  test("um fato por canal irregular; o canal regular e o canal sem menores não geram nada", async () => {
    const canais = [
      linhaCanal({ CanalId: 5, Nome: "Crianças da Central", IncluiMenores: 1, ResponsavelAcessoMembroId: null }),            // irregular: 1 admin e sem responsável
      linhaCanal({ CanalId: 6, Nome: "Adolescentes", IncluiMenores: 1, ResponsavelAcessoMembroId: 70 }),                      // regular
      linhaCanal({ CanalId: 7, Nome: "Líderes" }),                                                                             // sem menores
      linhaCanal({ CanalId: 8, Nome: "Desativado", Ativo: 0, IncluiMenores: 1 })                                               // inativo: não cobra
    ];
    const admins = [linhaAdmin(1, 9, { CanalId: 5 }), linhaAdmin(2, 9, { CanalId: 6 }), linhaAdmin(3, 10, { CanalId: 6 })];
    const { pool } = cenarioDetector(canais, admins, { 9: APTO, 10: APTO });
    const fatos = await detectar(pool);
    expect(fatos).toHaveLength(1);
    expect(fatos[0].fatoGerador).toMatch(/^O canal “Crianças da Central” inclui menores e está fora da regra: há menos de dois administradores adultos com o Termo de Dever de Moderação aceito; falta indicar o responsável com acesso ao grupo\./);
    expect(fatos[0].fatoGerador).toMatch(/Regularize: todo grupo com menores precisa de ao menos dois administradores adultos habilitados e de um responsável com acesso\.$/);
  });

  test("destinatários: administradores ativos do canal + gestão de canais, SEM repetir quem é as duas coisas", async () => {
    const canais = [linhaCanal({ CanalId: 5, IncluiMenores: 1 })];
    const { pool } = cenarioDetector(canais, [linhaAdmin(1, 9, { CanalId: 5 }), linhaAdmin(2, 10, { CanalId: 5 })], { 9: APTO, 10: BLOQUEADO("SEM_HABILITACAO") });
    const [fato] = await detectar(pool);
    expect(fato.destinatarios.map(d => d.membroId).sort((a, b) => a - b)).toEqual([1, 9, 10]);       // o 9 é admin E gestor: uma vez só
    expect(fato.destinatarios.find(d => d.membroId === 10)).toMatchObject({ email: "10@exemplo.org" });
    expect(fato.fatoGerador).toMatch(/um administrador não está habilitado para servir com menores/);
    expect(fato.fatoGerador).not.toMatch(/SEM_HABILITACAO|Sem habilitação aberta/);
  });

  test("canal sem administrador algum ainda avisa a gestão", async () => {
    const { pool } = cenarioDetector([linhaCanal({ CanalId: 5, IncluiMenores: 1 })], [], {});
    const [fato] = await detectar(pool);
    expect(fato.destinatarios.map(d => d.membroId)).toEqual([1, 9]);
  });

  test("a referência é canal*10000 + o número do mês: muda a cada mês (um aviso por mês) e cabe no INT do banco para um canal de número bem alto", async () => {
    const canais = [linhaCanal({ CanalId: 5, IncluiMenores: 1 }), linhaCanal({ CanalId: 200000, Nome: "Número alto", IncluiMenores: 1 })];
    const { pool } = cenarioDetector(canais, [], {});
    const outubro = await detectar(pool, "2026-10-09");
    const novembro = await detectar(pool, "2026-11-02");
    expect(outubro.map(f => f.referenciaId)).toEqual([5 * 10000 + 10, 200000 * 10000 + 10]);
    expect(novembro.map(f => f.referenciaId)).toEqual([5 * 10000 + 11, 200000 * 10000 + 11]);
    for (const f of [...outubro, ...novembro]) { expect(Number.isInteger(f.referenciaId)).toBe(true); expect(f.referenciaId).toBeLessThanOrEqual(2147483647); }
    expect(new Set(outubro.map(f => f.referenciaId)).size).toBe(2);
    const mesmoMes = await detectar(pool, "2026-10-30");
    expect(mesmoMes.map(f => f.referenciaId)).toEqual(outubro.map(f => f.referenciaId));
  });

  test("o texto cabe no aviso (até 1000 caracteres) mesmo com nome de canal comprido", async () => {
    const { pool } = cenarioDetector([linhaCanal({ CanalId: 5, Nome: "N".repeat(150), IncluiMenores: 1 })], [linhaAdmin(1, 9, { CanalId: 5 })], { 9: BLOQUEADO("SEM_HABILITACAO") });
    const [fato] = await detectar(pool);
    expect(fato.fatoGerador.length).toBeLessThanOrEqual(1000);
  });

  test("a regra de aviso e o detector existem: o registro dos detectores aponta para esta função e a migração declara a regra", () => {
    const fs = require("fs");
    const path = require("path");
    const detectores = fs.readFileSync(path.join(__dirname, "..", "notificacaoDetectores.js"), "utf8");
    expect(detectores).toMatch(/MENORES_CANAL_IRREGULAR: \{ tabela: "CanaisOficiaisComunicacao", detectar: \(pool\) => canaisDb\.detectarCanaisComMenoresIrregulares\(pool\) \}/);
    const migracao = fs.readFileSync(path.join(__dirname, "..", "..", "..", "sql", "migrations", "143_ministerio_menores.sql"), "utf8");
    expect(migracao).toContain("N'MENORES_CANAL_IRREGULAR'");
    expect(migracao).toMatch(/ResponsavelAcessoMembroId INT NULL REFERENCES dbo\.MembroReferencia\(MembroId\)/);
    expect(typeof db.detectarCanaisComMenoresIrregulares).toBe("function");
  });
});
