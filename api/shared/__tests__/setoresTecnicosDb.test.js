// A camada de banco dos Setores Técnicos (v7.6) com pool falso: as recusas que acontecem ANTES de qualquer gravação, o que a tela vê (e o que não vê: o IP), a escolha
// de quem recebe cada aviso e os fatos dos avisos diários. A auditoria e o motor de avisos são simulados. O comportamento contra o banco de verdade (transações, gatilhos,
// tetos, corridas) é coberto pelo roteiro ponta a ponta contra o SQL Server.
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../canaisDb", () => ({ ...jest.requireActual("../canaisDb"), notificarAgora: jest.fn(async () => ({ criadas: 1 })) }));
jest.mock("../notificacoes", () => ({ ...jest.requireActual("../notificacoes"), resolverDestinatariosPorPermissao: jest.fn(async () => []) }));
jest.mock("../escopo", () => ({ ...jest.requireActual("../escopo"), ancestraisTerritoriais: jest.fn(async () => ({ areaId: 4, regiaoId: null, quadranteId: null, distritoId: null })) }));

const db = require("../setoresTecnicosDb");
const st = require("../setoresTecnicos");
const { registrarAuditoria } = require("../auditoria");
const { notificarAgora } = require("../canaisDb");
const { resolverDestinatariosPorPermissao } = require("../notificacoes");
const { criarPoolFalso } = require("./testUtils");

const HOJE = "2026-10-08";
const nascidoHa = (anos) => new Date(Date.UTC(2026 - anos, 9, 8));
const membro = (extra = {}) => ({ MembroId: 20, Nome: "Ana Souza", Email: "ana@exemplo.org", DataNascimento: nascidoHa(40), Status: "ATIVO", SituacaoMembro: "EM_COMUNHAO", CongregacaoId: 1, CongregacaoNome: "Central", ...extra });
const setorLinha = (extra = {}) => ({ SetorId: 2, Codigo: "ENGENHARIA", Inciso: "II", Nome: "Setor de Engenharia", Competencia: "Projetos e laudos.", Profissoes: "Engenheiros", ConselhoClasse: "CREA / CAU", ExigeRegistro: 1, PodeInterditar: 1, PodeSolicitarRemocao: 0, Ativo: 1, Ordem: 2, ...extra });
const vinculoLinha = (extra = {}) => ({
  VinculoId: 7, SetorId: 2, MembroId: 20, Status: "AGUARDANDO_TERMO", Origem: "INDICACAO", Formacao: "Engenheira civil", ConselhoSigla: "CREA-PA", RegistroNumero: "12345", CriadoPorMembroId: 1, CriadoEm: new Date("2026-10-01T10:00:00Z"),
  AprovadoPorMembroId: 1, AprovadoEm: new Date("2026-10-01T10:00:00Z"), AtivadoEm: null, EncerradoEm: null, EncerradoPorMembroId: null, MotivoEncerramento: null, ObsEncerramento: null,
  SetorCodigo: "ENGENHARIA", SetorNome: "Setor de Engenharia", PodeInterditar: 1, PodeSolicitarRemocao: 0, ExigeRegistro: 1, ConselhoClasse: "CREA / CAU", SetorAtivo: 1, MembroNome: "Ana Souza", MembroEmail: "ana@exemplo.org", CongregacaoNome: "Central",
  AdesaoId: null, AdesaoForma: null, AdesaoVersao: null, AdesaoHash: null, AdesaoEspecificos: null, AdesaoData: null, AdesaoReferencia: null, ...extra
});
const atoLinha = (extra = {}) => ({
  IntervencaoId: 9, Tipo: "INTERDICAO", SetorId: 2, VinculoId: 7, EmitidaPorMembroId: 20, CongregacaoId: 1, CanalId: null, Motivo: "RISCO_DESABAMENTO", Objeto: "Templo principal", Referencia: null, Descricao: "Rachaduras na viga principal da cobertura.",
  RegistroProfissional: "CREA-PA 12345", Status: "EMITIDA", EmitidaEm: new Date("2026-10-06T10:00:00Z"), DecididaPorMembroId: null, DecididaEm: null, DecisaoObs: null, FechadaPorMembroId: null, FechadaEm: null, FechamentoObs: null,
  SetorNome: "Setor de Engenharia", SetorCodigo: "ENGENHARIA", EmitenteNome: "Ana Souza", CongregacaoNome: "Central", CanalNome: null, CanalPlataforma: null, CanalIdentificador: null, DecididaPorNome: null, FechadaPorNome: null, ...extra
});
const acessoDa = (extra = {}) => ({ membroId: 1, diretoria: false, gestao: false, lider: () => false, setoresAtivos: new Set(), canaisAdministrados: new Set(), ...extra });
const IP = "177.8.9.10";

beforeEach(() => { registrarAuditoria.mockClear(); notificarAgora.mockClear(); resolverDestinatariosPorPermissao.mockReset(); resolverDestinatariosPorPermissao.mockResolvedValue([]); });

describe("o que a pessoa vê em Meu Painel", () => {
  test("vínculo aguardando o Termo traz o texto do setor para aceitar; o IP e o e-mail nunca aparecem", async () => {
    const { pool } = criarPoolFalso([[membro()], [vinculoLinha()], [{ ...setorLinha(), Profissionais: 0, EmAnalise: 1 }, { ...setorLinha({ SetorId: 3, Codigo: "SAUDE", Nome: "Saúde", PodeInterditar: 0 }), Profissionais: 0, EmAnalise: 0 }], [], [], [], [], []]);
    const p = await db.meuPainel(pool, { membroId: 20, hoje: HOJE });
    expect(p.condicao.pode).toBe(true);
    const v = p.vinculos[0];
    expect(v).toMatchObject({ vinculoId: 7, status: "AGUARDANDO_TERMO", registro: "CREA-PA 12345", termo: null });
    expect(v.termoParaAceitar.itens.map(i => i.codigo)).toContain("INTERDICAO");
    expect(v.termoParaAceitar.hash).toMatch(/^[0-9a-f]{64}$/);
    // O setor onde já tenho vínculo vigente não é oferecido de novo para candidatura.
    expect(p.setoresParaCandidatura.map(s => s.setorId)).toEqual([3]);
    expect(p.poderes).toEqual({ interdicao: [], remocao: [] });
    expect(JSON.stringify(p)).not.toMatch(/177\.|@exemplo|DataNascimento/);
  });
  test("vínculo ATIVO dá os poderes do setor; setor desativado não dá", async () => {
    const ativo = vinculoLinha({ Status: "ATIVO", AtivadoEm: new Date("2026-10-02T10:00:00Z"), AdesaoId: 1, AdesaoForma: "FICHA_FISICA", AdesaoData: new Date("2026-10-02T00:00:00Z"), AdesaoReferencia: "ficha 3" });
    const quemEmite = [{ VinculoId: 7, SetorId: 2, ConselhoSigla: "CREA-PA", RegistroNumero: "12345", SetorNome: "Setor de Engenharia", SetorCodigo: "ENGENHARIA" }];
    let { pool, chamadas } = criarPoolFalso([[membro()], [ativo], [], quemEmite, [], [{ SetorId: 2 }], [], []]);
    let p = await db.meuPainel(pool, { membroId: 20, hoje: HOJE });
    expect(p.vinculos[0].termoParaAceitar).toBeUndefined();
    expect(p.vinculos[0].termo).toMatchObject({ forma: "FICHA_FISICA", dataAceite: "2026-10-02", integridade: { status: "DOCUMENTO_EXTERNO" } });
    expect(p.poderes.interdicao).toEqual([{ vinculoId: 7, setorId: 2, setorNome: "Setor de Engenharia" }]);
    // Os poderes que a tela oferece vêm da MESMA consulta que a emissão usa: Termo aceito com a cláusula, setor ativo e a pessoa em comunhão.
    expect(chamadas.filter(c => /PodeInterditar = 1|PodeSolicitarRemocao = 1/.test(c.sql)).length).toBe(2);
    expect(chamadas.some(c => /LIKE '%,INTERDICAO,%'/.test(c.sql))).toBe(true);
    expect(chamadas.some(c => /LIKE '%,REMOCAO_POSTAGEM,%'/.test(c.sql))).toBe(true);
    ({ pool } = criarPoolFalso([[membro()], [{ ...ativo, SetorAtivo: 0 }], [], [], [], [{ SetorId: 2 }], [], []]));
    p = await db.meuPainel(pool, { membroId: 20, hoje: HOJE });
    expect(p.poderes.interdicao).toEqual([]);
  });
  test("o texto que a administração escreveu ao encerrar NÃO chega à pessoa (só à administração)", async () => {
    const enc = vinculoLinha({ Status: "ENCERRADO", EncerradoEm: new Date("2026-10-02T10:00:00Z"), MotivoEncerramento: "DESLIGAMENTO", ObsEncerramento: "Motivo escrito só para a administração" });
    const { pool } = criarPoolFalso([[membro()], [enc], [], [], [], [], [], []]);
    const p = await db.meuPainel(pool, { membroId: 20, hoje: HOJE });
    expect(p.vinculos[0]).toMatchObject({ status: "ENCERRADO", rotuloMotivoEncerramento: "Desligamento pela administração", obsEncerramento: null });
    expect(JSON.stringify(p)).not.toMatch(/Motivo escrito só/);
    expect(db.mapearVinculo(enc, { comObs: true }).obsEncerramento).toBe("Motivo escrito só para a administração");
    const lista = await db.listarVinculos(criarPoolFalso([[enc]]).pool, {});
    expect(lista[0].obsEncerramento).toBe("Motivo escrito só para a administração");
  });
  test("quem perdeu a comunhão não vê os poderes do setor (a emissão recusaria)", async () => {
    const ativo = vinculoLinha({ Status: "ATIVO", AtivadoEm: new Date() });
    const { pool } = criarPoolFalso([[membro({ SituacaoMembro: "SEM_COMUNHAO" })], [ativo], [], [{ SetorId: 2 }], [], []]);
    const p = await db.meuPainel(pool, { membroId: 20, hoje: HOJE });
    expect(p.condicao.pode).toBe(false);
    expect(p.poderes).toEqual({ interdicao: [], remocao: [] });
  });
  test("a integridade do aceite digital vem do hash guardado e das cláusulas guardadas", async () => {
    const setor = { codigo: "ENGENHARIA", nome: "Setor de Engenharia", podeInterditar: true, podeSolicitarRemocao: false };
    const t = st.termoDoSetor(setor);
    const linha = vinculoLinha({ Status: "ATIVO", AtivadoEm: new Date(), AdesaoId: 1, AdesaoForma: "CLICKWRAP", AdesaoVersao: 1, AdesaoHash: t.hash, AdesaoEspecificos: "INTERDICAO", AdesaoData: new Date("2026-10-02T00:00:00Z") });
    expect(db.mapearVinculo(linha).termo.integridade.status).toBe("OK");
    expect(db.mapearVinculo({ ...linha, AdesaoHash: "0".repeat(64) }).termo.integridade.status).toBe("DIVERGENTE");
    // As marcas do catálogo mudaram depois: o aceite antigo continua íntegro porque guarda a lista que a pessoa viu.
    expect(db.mapearVinculo({ ...linha, PodeInterditar: 0 }).termo.integridade.status).toBe("OK");
  });
  test("o catálogo diz quantos servem, não quem; setor sem profissional não está instalado", async () => {
    const { pool } = criarPoolFalso([[{ ...setorLinha(), Profissionais: 3, EmAnalise: 1 }, { ...setorLinha({ SetorId: 3, Codigo: "SAUDE" }), Profissionais: 0, EmAnalise: 0 }]]);
    const c = await db.listarCatalogo(pool);
    expect(c.map(s => [s.codigo, s.profissionais, s.instalado, s.situacao])).toEqual([["ENGENHARIA", 3, true, "INSTALADO"], ["SAUDE", 0, false, "SEM_PROFISSIONAIS"]]);
    expect(JSON.stringify(c)).not.toMatch(/Nome":"Ana|Email/);
  });
});

describe("candidatura e indicação: o que é recusado antes de gravar", () => {
  const semGravar = (chamadas) => chamadas.filter(c => /^\s*(INSERT|UPDATE|DELETE)/i.test(c.sql));
  test("quem não pode servir (menor, sem nascimento, sem comunhão) é recusado com o motivo certo e nada é gravado", async () => {
    for (const [extra, motivo] of [[{ DataNascimento: nascidoHa(17) }, /18 anos/], [{ DataNascimento: null }, /data de nascimento/], [{ SituacaoMembro: "SEM_COMUNHAO" }, /plena comunhão/], [{ Status: "DESLIGADO" }, /plena comunhão/]]) {
      const { pool, chamadas } = criarPoolFalso([[membro(extra)]]);
      const r = await db.candidatar(pool, { membroId: 20, dados: { setorId: 2, formacao: "Engenheira" }, hoje: HOJE });
      expect(r.sucesso).toBe(false);
      expect(r.mensagem).toMatch(motivo);
      expect(semGravar(chamadas)).toHaveLength(0);
    }
  });
  test("setor inexistente ou desativado: a mesma recusa", async () => {
    for (const linhas of [[], [setorLinha({ Ativo: 0 })]]) {
      const { pool, chamadas } = criarPoolFalso([[membro()], linhas]);
      const r = await db.candidatar(pool, { membroId: 20, dados: { setorId: 2, formacao: "Engenheira" }, hoje: HOJE });
      expect(r).toEqual({ sucesso: false, mensagem: "Setor não encontrado." });
      expect(semGravar(chamadas)).toHaveLength(0);
    }
  });
  test("setor que exige registro: sem registro, recusa citando o conselho", async () => {
    const { pool, chamadas } = criarPoolFalso([[membro()], [setorLinha()]]);
    const r = await db.candidatar(pool, { membroId: 20, dados: { setorId: 2, formacao: "Engenheira" }, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/CREA \/ CAU/);
    expect(semGravar(chamadas)).toHaveLength(0);
  });
  test("o teto de vínculos em andamento", async () => {
    const { pool, chamadas } = criarPoolFalso([[membro()], [setorLinha({ ExigeRegistro: 0 })], [{ n: 5 }]]);
    const r = await db.candidatar(pool, { membroId: 20, dados: { setorId: 2, formacao: "Engenheira" }, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/5 vínculos/);
    expect(semGravar(chamadas)).toHaveLength(0);
  });
  test("a candidatura grava, audita só códigos e avisa quem tem setores_tecnicos", async () => {
    resolverDestinatariosPorPermissao.mockResolvedValue([{ membroId: 1, nome: "Presidente", email: "p@exemplo.org" }]);
    const { pool, chamadas } = criarPoolFalso([[membro()], [setorLinha({ ExigeRegistro: 0 })], [{ n: 0 }], [{ id: 31 }]]);
    const r = await db.candidatar(pool, { membroId: 20, dados: { setorId: 2, formacao: "Engenheira civil, UFPA" }, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: true, vinculoId: 31 });
    expect(resolverDestinatariosPorPermissao).toHaveBeenCalledWith(expect.anything(), { permissao: "setores_tecnicos", nivel: "GLOBAL" });
    expect(notificarAgora.mock.calls[0][1]).toMatchObject({ regraChave: "SETOR_CANDIDATURA", referenciaId: 31, referenciaTabela: "SetoresTecnicosMembros", destinatarios: [{ membroId: 1 }], limiteDia: 10 });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "SETOR_CANDIDATURA", usuarioId: 20 });
    expect(JSON.stringify(registrarAuditoria.mock.calls[0][0])).not.toMatch(/Engenheira civil/);
    expect(chamadas.some(c => /INSERT INTO SetoresTecnicosMembros/.test(c.sql) && c.inputs.f === "Engenheira civil, UFPA")).toBe(true);
  });
  test("o duplicado do índice único vira a mensagem de 'já tem vínculo' (corrida de dois cliques)", async () => {
    const fila = [[membro()], [setorLinha({ ExigeRegistro: 0 })], [{ n: 0 }]]; let i = 0;
    const pool = { request: () => { const r = { input: () => r, query: async () => { i++; if (i === 4) { const e = new Error("dup"); e.number = 2601; throw e; } return { recordset: fila.shift() || [] }; } }; return r; } };
    const r = await db.candidatar(pool, { membroId: 20, dados: { setorId: 2, formacao: "Engenheira" }, hoje: HOJE });
    expect(r).toEqual({ sucesso: false, mensagem: "Você já tem um vínculo em andamento com este setor." });
  });
  test("indicação: ninguém se indica; menor e fora de comunhão são recusados com o nome", async () => {
    let { pool, chamadas } = criarPoolFalso([[setorLinha({ ExigeRegistro: 0 })]]);
    let r = await db.indicar(pool, { dados: { membroId: 9, setorId: 2, formacao: "Engenheiro" }, por: 9, hoje: HOJE });
    expect(r.mensagem).toMatch(/Você não pode se indicar/);
    expect(semGravar(chamadas)).toHaveLength(0);
    ({ pool, chamadas } = criarPoolFalso([[setorLinha({ ExigeRegistro: 0 })], [membro({ DataNascimento: nascidoHa(16) })]]));
    r = await db.indicar(pool, { dados: { membroId: 20, setorId: 2, formacao: "Engenheiro" }, por: 1, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/^Ana Souza: .*18 anos/);
    expect(semGravar(chamadas)).toHaveLength(0);
  });
  test("a indicação grava o vínculo já aprovado por quem indicou e avisa a pessoa", async () => {
    const { pool, chamadas } = criarPoolFalso([[setorLinha({ ExigeRegistro: 0 })], [membro()], [{ n: 0 }], [{ id: 8 }]]);
    const r = await db.indicar(pool, { dados: { membroId: 20, setorId: 2, formacao: "Engenheira" }, por: 1, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: true, vinculoId: 8 });
    const ins = chamadas.find(c => /INSERT INTO SetoresTecnicosMembros/.test(c.sql));
    expect(ins.sql).toMatch(/'AGUARDANDO_TERMO', 'INDICACAO'/);
    expect(ins.inputs).toMatchObject({ m: 20, por: 1 });
    expect(notificarAgora.mock.calls[0][1]).toMatchObject({ regraChave: "SETOR_INDICADO", destinatarios: [{ membroId: 20, email: "ana@exemplo.org" }] });
  });
});

describe("aprovar, recusar, encerrar e sair", () => {
  test("ninguém aprova nem recusa a própria candidatura; candidatura já decidida e setor desativado são recusados", async () => {
    let { pool } = criarPoolFalso([[vinculoLinha({ Status: "CANDIDATO", MembroId: 1 })]]);
    let r = await db.aprovar(pool, { vinculoId: 7, por: 1 });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    ({ pool } = criarPoolFalso([[vinculoLinha({ Status: "CANDIDATO", MembroId: 1 })]]));
    expect(await db.recusarCandidatura(pool, { vinculoId: 7, por: 1 })).toMatchObject({ sucesso: false, proibido: true });
    ({ pool } = criarPoolFalso([[vinculoLinha({ Status: "AGUARDANDO_TERMO" })]]));
    expect((await db.aprovar(pool, { vinculoId: 7, por: 1 })).mensagem).toMatch(/já foi decidida/);
    ({ pool } = criarPoolFalso([[vinculoLinha({ Status: "CANDIDATO", SetorAtivo: 0 })]]));
    expect((await db.aprovar(pool, { vinculoId: 7, por: 1 })).mensagem).toMatch(/desativado/);
    ({ pool } = criarPoolFalso([[]]));
    expect((await db.aprovar(pool, { vinculoId: 7, por: 1 })).mensagem).toMatch(/não encontrado/);
  });
  test("sair: só do próprio vínculo, e vínculo já encerrado não sai de novo", async () => {
    let { pool, chamadas } = criarPoolFalso([[vinculoLinha({ MembroId: 21 })]]);
    expect(await db.sairDoSetor(pool, { vinculoId: 7, membroId: 20 })).toEqual({ sucesso: false, mensagem: "Vínculo não encontrado." });
    ({ pool, chamadas } = criarPoolFalso([[vinculoLinha({ Status: "ENCERRADO", EncerradoEm: new Date(), MotivoEncerramento: "OUTRO" })]]));
    expect((await db.sairDoSetor(pool, { vinculoId: 7, membroId: 20 })).mensagem).toMatch(/já está encerrado/);
    expect(chamadas.filter(c => /^\s*UPDATE/i.test(c.sql))).toHaveLength(0);
  });
  test("encerrar: o motivo do desligamento é obrigatório", async () => {
    const { pool, chamadas } = criarPoolFalso([[vinculoLinha({ Status: "ATIVO" })]]);
    const r = await db.encerrarVinculo(pool, { vinculoId: 7, dados: { tipoMotivo: "DESLIGAMENTO" }, por: 1 });
    expect(r.sucesso).toBe(false);
    expect(chamadas.filter(c => /^\s*UPDATE/i.test(c.sql))).toHaveLength(0);
  });
});

describe("o aceite do Termo", () => {
  const aceite = (extra = {}) => ({ vinculoId: 7, membroId: 20, aceito: true, ip: IP, hoje: HOJE, ...extra });
  test("sem a caixa marcada ou sem IP, recusa sem consultar o banco", async () => {
    for (const extra of [{ aceito: false }, { aceito: "true" }, { aceito: undefined }, { ip: null }, { ip: "" }]) {
      const { pool, chamadas } = criarPoolFalso([]);
      const r = await db.aceitarTermo(pool, aceite(extra));
      expect(r.sucesso).toBe(false);
      expect(chamadas).toHaveLength(0);
    }
  });
  test("o Termo é do dono do vínculo: de outra pessoa é 'não encontrado'; situação errada diz o que fazer", async () => {
    let { pool } = criarPoolFalso([[vinculoLinha({ MembroId: 21 })]]);
    expect(await db.aceitarTermo(pool, aceite())).toEqual({ sucesso: false, mensagem: "Vínculo não encontrado." });
    for (const [status, texto] of [["ATIVO", /já aceitou/], ["CANDIDATO", /ainda não foi aprovada/], ["ENCERRADO", /encerrado/]]) {
      ({ pool } = criarPoolFalso([[vinculoLinha({ Status: status })]]));
      expect((await db.aceitarTermo(pool, aceite())).mensagem).toMatch(texto);
    }
  });
  test("quem deixou de poder servir (virou menor no cadastro, saiu de comunhão) não aceita", async () => {
    const { pool, chamadas } = criarPoolFalso([[vinculoLinha()], [membro({ SituacaoMembro: "SEM_COMUNHAO" })]]);
    const r = await db.aceitarTermo(pool, aceite());
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/plena comunhão/);
    expect(chamadas.filter(c => /INSERT|UPDATE/i.test(c.sql))).toHaveLength(0);
  });
  test("registrar a ficha: só em AGUARDANDO_TERMO, com a forma da lista e a data que não é futura", async () => {
    const dados = { forma: "FICHA_FISICA", dataAceite: "2026-10-01", referencia: "Pasta 3, ficha 12" };
    let { pool, chamadas } = criarPoolFalso([]);
    expect((await db.registrarTermoManual(pool, { vinculoId: 7, dados: { ...dados, forma: "CLICKWRAP" }, por: 1, hoje: HOJE })).sucesso).toBe(false);
    expect(chamadas).toHaveLength(0);
    for (const [status, texto] of [["CANDIDATO", /Aprove a candidatura/], ["ATIVO", /já tem o Termo/], ["ENCERRADO", /encerrado/]]) {
      ({ pool } = criarPoolFalso([[vinculoLinha({ Status: status })]]));
      expect((await db.registrarTermoManual(pool, { vinculoId: 7, dados, por: 1, hoje: HOJE })).mensagem).toMatch(texto);
    }
  });
});

describe("atos cautelares: o que é recusado antes de gravar", () => {
  const corpoInterdicao = { congregacaoId: 1, motivo: "RISCO_DESABAMENTO", objeto: "Templo principal", descricao: "Rachaduras na viga principal da cobertura do templo." };
  test("quem não serve ATIVO em setor com o poder recebe 403 (proibido) e nada é gravado", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]);
    const r = await db.emitirInterdicao(pool, { membroId: 20, dados: corpoInterdicao, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    expect(r.mensagem).toMatch(/Engenharia ou Segurança/);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].sql).toMatch(/s\.PodeInterditar = 1/);
    expect(chamadas[0].sql).toMatch(/v\.Status = 'ATIVO'/);
    expect(chamadas[0].sql).toMatch(/m\.Status = 'ATIVO' AND ISNULL\(m\.SituacaoMembro, ''\) <> 'SEM_COMUNHAO'/);
  });
  test("o pedido de remoção consulta a outra marca do setor", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]);
    await db.emitirPedidoRemocao(pool, { membroId: 20, dados: { congregacaoId: 1, motivo: "ERRO_GROSSEIRO", objeto: "Instagram", referencia: "https://x.org/p/1", descricao: "Texto com erro grosseiro de português." }, hoje: HOJE });
    expect(chamadas[0].sql).toMatch(/s\.PodeSolicitarRemocao = 1/);
  });
  test("dado ruim é recusado ANTES de consultar quem serve", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const r = await db.emitirInterdicao(pool, { membroId: 20, dados: { ...corpoInterdicao, descricao: "curta" }, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(chamadas).toHaveLength(0);
  });
  test("quem serve em mais de um setor com o poder precisa escolher; setor que não serve é recusado", async () => {
    const dois = [{ VinculoId: 1, SetorId: 2, ConselhoSigla: "CREA", RegistroNumero: "1", SetorNome: "Engenharia", SetorCodigo: "ENGENHARIA" }, { VinculoId: 2, SetorId: 11, ConselhoSigla: null, RegistroNumero: null, SetorNome: "Segurança", SetorCodigo: "SEGURANCA" }];
    let { pool, chamadas } = criarPoolFalso([dois]);
    let r = await db.emitirInterdicao(pool, { membroId: 20, dados: corpoInterdicao, hoje: HOJE });
    expect(r.mensagem).toMatch(/mais de um setor/);
    ({ pool, chamadas } = criarPoolFalso([dois]));
    r = await db.emitirInterdicao(pool, { membroId: 20, dados: { ...corpoInterdicao, setorId: 7 }, hoje: HOJE });
    expect(r.mensagem).toMatch(/não serve nesse setor/);
    expect(chamadas).toHaveLength(1);
  });
  test("congregação inexistente e canal de outra congregação são recusados antes da transação", async () => {
    const um = [{ VinculoId: 1, SetorId: 2, ConselhoSigla: "CREA", RegistroNumero: "1", SetorNome: "Engenharia", SetorCodigo: "ENGENHARIA" }];
    let { pool, chamadas } = criarPoolFalso([um, []]);
    expect((await db.emitirInterdicao(pool, { membroId: 20, dados: corpoInterdicao, hoje: HOJE })).mensagem).toBe("Congregação não encontrada.");
    expect(chamadas.filter(c => /INSERT|UPDATE/i.test(c.sql))).toHaveLength(0);
    const com = [{ VinculoId: 3, SetorId: 6, ConselhoSigla: null, RegistroNumero: null, SetorNome: "Comunicação", SetorCodigo: "COMUNICACAO" }];
    ({ pool, chamadas } = criarPoolFalso([com, [{ CongregacaoId: 1, Nome: "Central", Ativa: 1 }], [{ CanalId: 8, Nome: "Instagram", CongregacaoId: 2, Ativo: 1 }]]));
    const r = await db.emitirPedidoRemocao(pool, { membroId: 20, dados: { congregacaoId: 1, canalId: 8, motivo: "ERRO_GROSSEIRO", referencia: "https://x.org/p/1", descricao: "Texto com erro grosseiro de português." }, hoje: HOJE });
    expect(r.mensagem).toMatch(/canal ativo desta congregação/);
  });
  test("decidir: quem emitiu não decide; ato já decidido diz a situação; decisão inválida é recusada", async () => {
    let { pool } = criarPoolFalso([[atoLinha({ EmitidaPorMembroId: 1 })]]);
    let r = await db.decidirAto(pool, { intervencaoId: 9, dados: { decisao: "RATIFICAR" }, por: 1, acesso: acessoDa({ diretoria: true }) });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    ({ pool } = criarPoolFalso([[atoLinha({ Status: "RATIFICADA", DecididaPorMembroId: 5, DecididaEm: new Date() })]]));
    r = await db.decidirAto(pool, { intervencaoId: 9, dados: { decisao: "RATIFICAR" }, por: 1, acesso: acessoDa({ diretoria: true }) });
    expect(r.mensagem).toMatch(/já está ratificada/);
    ({ pool } = criarPoolFalso([[atoLinha()]]));
    expect((await db.decidirAto(pool, { intervencaoId: 9, dados: { decisao: "REVOGAR" }, por: 1, acesso: acessoDa({ diretoria: true }) })).mensagem).toMatch(/motivo da revogação/);
    ({ pool } = criarPoolFalso([[atoLinha()]]));
    expect((await db.decidirAto(pool, { intervencaoId: 9, dados: { decisao: "RATIFICAR" }, por: 1, acesso: acessoDa({ diretoria: false }) })).sucesso).toBe(false);
    ({ pool } = criarPoolFalso([[]]));
    expect((await db.decidirAto(pool, { intervencaoId: 9, dados: { decisao: "RATIFICAR" }, por: 1, acesso: acessoDa({ diretoria: true }) })).mensagem).toBe("Ato não encontrado.");
  });
  test("fechar: levantar é da interdição, atender do pedido; sem poder é proibido com a mensagem do papel", async () => {
    let { pool } = criarPoolFalso([[atoLinha()]]);
    let r = await db.fecharAto(pool, { intervencaoId: 9, acao: "ATENDER", dados: {}, por: 1, acesso: acessoDa({ diretoria: true }) });
    expect(r.mensagem).toMatch(/Uma interdição se levanta/);
    ({ pool } = criarPoolFalso([[atoLinha({ Tipo: "REMOCAO_POSTAGEM", CanalId: 8 })]]));
    r = await db.fecharAto(pool, { intervencaoId: 9, acao: "LEVANTAR", dados: { observacao: "Tentando levantar um pedido." }, por: 1, acesso: acessoDa({ diretoria: true }) });
    expect(r.mensagem).toMatch(/atendido ou cancelado/);
    ({ pool } = criarPoolFalso([[atoLinha({ EmitidaPorMembroId: 50 })]]));
    r = await db.fecharAto(pool, { intervencaoId: 9, acao: "LEVANTAR", dados: { observacao: "Quero levantar sem ter emitido." }, por: 1, acesso: acessoDa({ lider: () => true }) });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    ({ pool } = criarPoolFalso([[atoLinha({ Status: "LEVANTADA", FechadaPorMembroId: 20, FechadaEm: new Date(), FechamentoObs: "ok" })]]));
    expect((await db.fecharAto(pool, { intervencaoId: 9, acao: "LEVANTAR", dados: { observacao: "Já foi levantada antes." }, por: 20, acesso: acessoDa({ membroId: 20, setoresAtivos: new Set([2]) }) })).mensagem).toMatch(/já está levantada/);
  });
});

describe("a leitura dos atos", () => {
  test("o ato traz os botões que o papel de quem lê permite, e a interdição em aberto está 'em vigor'", async () => {
    const { pool } = criarPoolFalso([[atoLinha(), atoLinha({ IntervencaoId: 10, Status: "LEVANTADA" })]]);
    const atos = await db.listarAtos(pool, { acesso: acessoDa({ diretoria: true }) });
    expect(atos[0]).toMatchObject({ intervencaoId: 9, emVigor: true, rotuloStatus: "Emitida (aguarda a Diretoria)", acoes: ["RATIFICAR", "REVOGAR", "LEVANTAR"] });
    expect(atos[1]).toMatchObject({ emVigor: false, acoes: [] });
  });
  test("restringir às congregações do escopo vai na consulta; lista vazia de escopo não consulta nada", async () => {
    let { pool, chamadas } = criarPoolFalso([[]]);
    await db.listarAtos(pool, { congregacaoNomes: ["Central", "Vila Nova"] });
    expect(chamadas[0].sql).toMatch(/c\.Nome IN \(@n0, @n1\)/);
    expect(chamadas[0].inputs).toMatchObject({ n0: "Central", n1: "Vila Nova" });
    ({ pool, chamadas } = criarPoolFalso([]));
    expect(await db.listarAtos(pool, { congregacaoNomes: [] })).toEqual([]);
    expect(chamadas).toHaveLength(0);
  });
  test("o nome do canal e o link aparecem para quem pode ver o ato", async () => {
    const { pool } = criarPoolFalso([[atoLinha({ Tipo: "REMOCAO_POSTAGEM", Motivo: "DIREITO_AUTORAL", CanalId: 8, CanalNome: "Instagram da Central", CanalPlataforma: "INSTAGRAM", CanalIdentificador: "@central", Referencia: "https://x.org/p/1" })]]);
    const [a] = await db.listarAtos(pool, {});
    expect(a.canalDescricao).toBe("INSTAGRAM — Instagram da Central");   // sem o identificador: telefone, e-mail ou link de grupo são de quem administra canais
    expect(JSON.stringify(a)).not.toMatch(/@central/);
    const linha = [atoLinha({ Tipo: "REMOCAO_POSTAGEM", Motivo: "DIREITO_AUTORAL", CanalId: 8, CanalNome: "Instagram da Central", CanalPlataforma: "INSTAGRAM", CanalIdentificador: "@central", Referencia: "https://x.org/p/1" })];
    expect((await db.listarAtos(criarPoolFalso([linha]).pool, { acesso: acessoDa({ diretoria: true }) }))[0].canalDescricao).toBe("INSTAGRAM — Instagram da Central (@central)");
    expect((await db.listarAtos(criarPoolFalso([linha]).pool, { acesso: acessoDa({ gestao: true }) }))[0].canalDescricao).toMatch(/@central/);
    expect((await db.listarAtos(criarPoolFalso([linha]).pool, { acesso: acessoDa({ canaisAdministrados: new Set([8]) }) }))[0].canalDescricao).toMatch(/@central/);
    expect((await db.listarAtos(criarPoolFalso([linha]).pool, { acesso: acessoDa({ canaisAdministrados: new Set([9]), lider: () => true }) }))[0].canalDescricao).not.toMatch(/@central/);
    expect(a.referencia).toBe("https://x.org/p/1");
    expect(a.rotuloMotivo).toBe("Violação de direitos autorais");
  });
});

describe("avisos diários", () => {
  test("interdição sem ratificação depois do prazo: um fato por dia, para a Diretoria", async () => {
    resolverDestinatariosPorPermissao.mockImplementation(async (_p, { permissao }) => (permissao === "setores_ratificacao" ? [{ membroId: 1, nome: "Presidente", email: "p@x.org" }] : []));
    const { pool } = criarPoolFalso([[{ Dias: 1 }], [{ IntervencaoId: 9, CongregacaoNome: "Central", SetorNome: "Setor de Engenharia", Objeto: "Templo principal", EmitidaEm: new Date("2026-10-05T10:00:00Z") }]]);
    const fatos = await db.detectarInterdicoesPendentes(pool, { hoje: HOJE });
    expect(fatos).toHaveLength(1);
    expect(fatos[0].destinatarios).toEqual([{ membroId: 1, nome: "Presidente", email: "p@x.org" }]);
    expect(fatos[0].fatoGerador).toMatch(/Templo principal.*Central.*há 3 dia\(s\) sem ratificação/);
    // A chave leva o dia: no dia seguinte o aviso é outro (a Diretoria é cobrada TODO dia).
    const amanha = await db.detectarInterdicoesPendentes(criarPoolFalso([[{ Dias: 1 }], [{ IntervencaoId: 9, CongregacaoNome: "Central", SetorNome: "S", Objeto: "O", EmitidaEm: new Date("2026-10-05T10:00:00Z") }]]).pool, { hoje: "2026-10-09" });
    expect(amanha[0].referenciaId).toBe(fatos[0].referenciaId + 1);
    expect(fatos[0].referenciaId).toBe(9 * 10000 + 280);
  });
  test("sem ninguém com setores_ratificacao, a cobrança cai para quem tem setores_tecnicos; sem ninguém, não há fato", async () => {
    resolverDestinatariosPorPermissao.mockImplementation(async (_p, { permissao }) => (permissao === "setores_tecnicos" ? [{ membroId: 3, nome: "Gestora", email: "g@x.org" }] : []));
    const linha = [{ IntervencaoId: 9, CongregacaoNome: "Central", SetorNome: "S", Objeto: "O", EmitidaEm: new Date("2026-10-05T10:00:00Z") }];
    let fatos = await db.detectarInterdicoesPendentes(criarPoolFalso([[{ Dias: 1 }], linha]).pool, { hoje: HOJE });
    expect(fatos[0].destinatarios.map(d => d.membroId)).toEqual([3]);
    resolverDestinatariosPorPermissao.mockResolvedValue([]);
    fatos = await db.detectarInterdicoesPendentes(criarPoolFalso([[{ Dias: 1 }], linha]).pool, { hoje: HOJE });
    expect(fatos).toEqual([]);
    fatos = await db.detectarInterdicoesPendentes(criarPoolFalso([[{ Dias: 1 }], []]).pool, { hoje: HOJE });
    expect(fatos).toEqual([]);
  });
  test("o prazo vem do parâmetro (SETOR_INTERDICAO_LEMBRETE_DIAS), com o padrão de 1 dia", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ Dias: 3 }], []]);
    await db.detectarInterdicoesPendentes(pool, { hoje: HOJE });
    expect(chamadas[0].inputs.sigla).toBe("SETOR_INTERDICAO_LEMBRETE_DIAS");
    expect(chamadas[1].inputs.d).toBe(3);
    const sem = criarPoolFalso([[], []]);
    await db.detectarInterdicoesPendentes(sem.pool, { hoje: HOJE });
    expect(sem.chamadas[1].inputs.d).toBe(1);
  });
  test("pedido de remoção não atendido: cobra a Diretoria, o administrador do canal e os líderes da congregação", async () => {
    resolverDestinatariosPorPermissao.mockImplementation(async (_p, { permissao }) => (permissao === "setores_ratificacao" ? [{ membroId: 1, nome: "Presidente", email: null }] : []));
    const { pool } = criarPoolFalso([[{ Dias: 1 }], [{ IntervencaoId: 5, CongregacaoId: 1, CanalId: 8, CongregacaoNome: "Central", SetorNome: "Comunicação", EmitidaEm: new Date("2026-10-06T10:00:00Z") }],
      [{ membroId: 4001, nome: "Admin", email: "a@x.org" }], [{ membroId: 3001, nome: "Dirigente", email: "d@x.org" }, { membroId: 1, nome: "Presidente", email: null }]]);
    const fatos = await db.detectarRemocoesPendentes(pool, { hoje: HOJE });
    expect(fatos).toHaveLength(1);
    expect(fatos[0].destinatarios.map(d => d.membroId).sort((a, b) => a - b)).toEqual([1, 3001, 4001]);
    expect(fatos[0].fatoGerador).toMatch(/remoção imediata/);
  });
});

describe("retenção do IP e dados do titular", () => {
  test("a rotina anonimiza só o aceite digital de vínculo encerrado há mais que o prazo; sem lote, sem auditoria", async () => {
    let { pool, chamadas } = criarPoolFalso([[{ Dias: 1825 }], [{ total: 0 }]]);
    expect(await db.anonimizarIpsVencidos(pool, { hoje: HOJE })).toEqual({ anonimizados: 0, retencaoDias: 1825 });
    expect(registrarAuditoria).not.toHaveBeenCalled();
    expect(chamadas[1].sql).toMatch(/a\.Forma = 'CLICKWRAP'/);
    expect(chamadas[1].sql).toMatch(/v\.Status = 'ENCERRADO' AND v\.EncerradoEm < DATEADD\(DAY, -@dias, @hoje\)/);
    ({ pool } = criarPoolFalso([[{ Dias: 1825 }], [{ total: 2 }]]));
    expect((await db.anonimizarIpsVencidos(pool, { hoje: HOJE })).anonimizados).toBe(2);
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "IP_ANONIMIZADO", usuarioId: null, registroId: 0, dadosDepois: { quantidade: 2, retencaoDias: 1825 } });
  });
  test("o titular recebe o vínculo, o Termo (com o IP, que é dele) e os atos que emitiu — sem as observações escritas por outros", async () => {
    const { pool } = criarPoolFalso([
      [{ Status: "ENCERRADO", Origem: "INDICACAO", Formacao: "Engenheira", ConselhoSigla: "CREA-PA", RegistroNumero: "1", CriadoEm: new Date("2026-01-01T00:00:00Z"), AtivadoEm: new Date("2026-01-02T00:00:00Z"), EncerradoEm: new Date("2026-06-01T00:00:00Z"), MotivoEncerramento: "DESLIGAMENTO", Setor: "Engenharia",
        Forma: "CLICKWRAP", TermoVersao: 1, TermoHash: "a".repeat(64), DataAceite: new Date("2026-01-02T00:00:00Z"), AceitoEm: new Date("2026-01-02T12:00:00Z"), EnderecoIp: IP, CadeiaCabecalhos: "x", CanalMensageria: null, Referencia: null, RegistradoPorMembroId: null }],
      [{ Tipo: "INTERDICAO", Motivo: "RISCO_DESABAMENTO", Status: "LEVANTADA", EmitidaEm: new Date("2026-03-01T00:00:00Z"), Objeto: "Templo", Referencia: "ART 1", Descricao: "Rachaduras na viga.", RegistroProfissional: "CREA-PA 1", Setor: "Engenharia", Congregacao: "Central" }]
    ]);
    const d = await db.dadosDoTitular(pool, 20);
    expect(d.vinculos[0]).toMatchObject({ setor: "Engenharia", situacao: "ENCERRADO", registroProfissional: "CREA-PA 1", motivoEncerramento: "Desligamento pela administração", termo: { enderecoIp: IP, hash: "a".repeat(64), registradoPelaSecretaria: false } });
    expect(d.atosQueEmiti[0]).toMatchObject({ tipo: "Interdição cautelar", motivo: "Risco de desabamento", situacao: "Levantada (risco sanado)", justificativa: "Rachaduras na viga." });
    expect(JSON.stringify(d)).not.toMatch(/ObsEncerramento|observacao/i);
    expect(d.aviso).toMatch(/Encarregado de Dados/);
  });
});
