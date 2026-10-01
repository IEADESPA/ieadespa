// Testes da camada de banco do calendário (v7.2) com pool falso: as recusas que
// acontecem ANTES de qualquer gravação, a versão pública e a sincronização com o site.
// A auditoria grava no banco de verdade: nestes testes só importa que a regra recusou/aceitou.
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
const db = require("../calendarioDb");
const { criarPoolFalso } = require("./testUtils");

const ano = (extra = {}) => ({ Ano: 2027, Status: "PLANEJAMENTO", PrazoPropostas: "2027-01-15", CicloGeradoEm: null, ConsolidadoPorMembroId: null, ConsolidadoEm: null, HomologadoPorMembroId: null, HomologadoEm: null, AtaReferencia: null, ...extra });
const evento = (extra = {}) => ({ id: 1, ano: 2027, status: "DEFERIDO", titulo: "Evento", origem: "PROPOSTA", tipo: { codigo: "X", registraPresencaDirigente: false }, dataInicio: "2027-03-13", dataFim: "2027-03-13", ...extra });

describe("anos do calendário", () => {
  test("validarAnoCalendario: ano corrente, o anterior e até dois à frente", () => {
    expect(db.validarAnoCalendario(2027, "2026-10-01")).toEqual({ valido: true, ano: 2027 });
    expect(db.validarAnoCalendario(2028, "2026-10-01").valido).toBe(true);
    expect(db.validarAnoCalendario(2029, "2026-10-01").valido).toBe(false);
    expect(db.validarAnoCalendario(2024, "2026-10-01").valido).toBe(false);
    expect(db.validarAnoCalendario("x", "2026-10-01").valido).toBe(false);
  });

  test("consolidar um ano que não existe, ou já homologado, é recusado sem gravar", async () => {
    const sem = criarPoolFalso([[]]);
    expect((await db.consolidarAno(sem.pool, { ano: 2027, membroId: 1, ctx: {} })).mensagem).toMatch(/ainda não foi aberto/);
    const hom = criarPoolFalso([[ano({ Status: "HOMOLOGADO" })]]);
    expect((await db.consolidarAno(hom.pool, { ano: 2027, membroId: 1, ctx: {} })).mensagem).toMatch(/Direito Adquirido/);
    expect(hom.chamadas).toHaveLength(1);
  });

  test("consolidar exige o ciclo mensal gerado antes (sem ele não há com o que confrontar as propostas)", async () => {
    const { pool, chamadas } = criarPoolFalso([[ano({ Status: "PLANEJAMENTO", CicloGeradoEm: null })]]);
    const r = await db.consolidarAno(pool, { ano: 2027, membroId: 1, ctx: {} });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/Gere o ciclo mensal de 2027/);
    expect(chamadas).toHaveLength(1);
  });

  test("homologar exige a consolidação, a ata e nenhuma proposta pendente", async () => {
    const plan = criarPoolFalso([[ano({ Status: "PLANEJAMENTO" })]]);
    expect((await db.homologarAno(plan.pool, { ano: 2027, ata: "Ata 1/2027", membroId: 1 })).mensagem).toMatch(/consolidar o calendário antes/);
    const jaHom = criarPoolFalso([[ano({ Status: "HOMOLOGADO" })]]);
    expect((await db.homologarAno(jaHom.pool, { ano: 2027, ata: "Ata 1/2027", membroId: 1 })).mensagem).toMatch(/já foi homologado/);
    const semAta = criarPoolFalso([[ano({ Status: "CONSOLIDADO" })]]);
    expect((await db.homologarAno(semAta.pool, { ano: 2027, ata: "", membroId: 1, hoje: "2027-02-01" })).mensagem).toMatch(/ata da CLI/);
    const pendente = criarPoolFalso([[ano({ Status: "CONSOLIDADO" })], [{ n: 3 }]]);
    const r = await db.homologarAno(pendente.pool, { ano: 2027, ata: "Ata 1/2027", membroId: 1, hoje: "2027-02-01" });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/3 proposta\(s\) sem decisão/);
  });

  test("não se homologa antes de vencer o prazo das propostas (15 de janeiro)", async () => {
    const { pool, chamadas } = criarPoolFalso([[ano({ Status: "CONSOLIDADO" })]]);
    const r = await db.homologarAno(pool, { ano: 2027, ata: "Ata 1/2027", membroId: 1, hoje: "2027-01-15" });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/ainda não venceu/);
    expect(chamadas).toHaveLength(1);
  });
});

describe("decisões sobre um evento", () => {
  test("indeferir só o que ainda não foi homologado, com motivo", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect((await db.indeferirEvento(pool, { evento: evento({ status: "HOMOLOGADO" }), motivo: "Motivo suficientemente longo", membroId: 1 })).mensagem).toMatch(/ainda não foi homologado/);
    expect((await db.indeferirEvento(pool, { evento: evento({ status: "PROPOSTO" }), motivo: "curto", membroId: 1 })).mensagem).toMatch(/motivo do indeferimento/);
    expect(chamadas).toHaveLength(0);
  });

  test("cancelar: não repete o que já saiu da pauta e exige motivo", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    for (const status of ["CANCELADO", "INDEFERIDO", "ABSORVIDO"]) {
      expect((await db.cancelarEvento(pool, { evento: evento({ status }), motivo: "Motivo suficientemente longo", membroId: 1 })).sucesso).toBe(false);
    }
    expect((await db.cancelarEvento(pool, { evento: evento(), motivo: "curto", membroId: 1 })).mensagem).toMatch(/motivo do cancelamento/);
    expect(chamadas).toHaveLength(0);
  });

  test("a decisão excepcional da CLI exige motivo e resolução e só vale para o que está na pauta", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect((await db.absorverPorDecisaoDaCli(pool, { evento: evento({ status: "PROPOSTO" }), motivo: "Calamidade pública no bairro", resolucao: "Res. 1", membroId: 1 })).sucesso).toBe(false);
    expect((await db.absorverPorDecisaoDaCli(pool, { evento: evento(), motivo: "curto", resolucao: "Res. 1", membroId: 1 })).sucesso).toBe(false);
    expect((await db.absorverPorDecisaoDaCli(pool, { evento: evento(), motivo: "Calamidade pública no bairro", resolucao: "", membroId: 1 })).mensagem).toMatch(/resolução da CLI/);
    expect(chamadas).toHaveLength(0);
  });

  test("deferir só o que aguarda decisão", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect((await db.deferirEvento(pool, { evento: evento({ status: "DEFERIDO" }), membroId: 1, ctx: {} })).mensagem).toMatch(/só se defere/);
    expect(chamadas).toHaveLength(0);
  });

  test("atualizar o descritivo recusa título curto, local grande e identificador ruim — nunca a data", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect((await db.atualizarDescritivo(pool, { evento: evento(), titulo: "ab", membroId: 1 })).mensagem).toMatch(/título/);
    expect((await db.atualizarDescritivo(pool, { evento: evento(), local: "x".repeat(201), membroId: 1 })).mensagem).toMatch(/local/);
    expect((await db.atualizarDescritivo(pool, { evento: evento(), slugSite: "Festa Grande", membroId: 1 })).mensagem).toMatch(/identificador/);
    expect((await db.atualizarDescritivo(pool, { evento: evento({ status: "CANCELADO" }), titulo: "Outro título", membroId: 1 })).mensagem).toMatch(/não se edita/);
    expect(chamadas).toHaveLength(0);
  });
});

describe("presença do dirigente na Ceia Geral", () => {
  const ctx = { congregacoes: new Map([[7, { id: 7, ativa: true, slug: "genesis", nome: "Gênesis", nomePublico: "Gênesis" }]]) };
  const ceiaGeral = evento({ tipo: { codigo: "SANTA_CEIA_GERAL", registraPresencaDirigente: true }, status: "HOMOLOGADO", dataInicio: "2027-05-30" });

  test("só em evento que registra presença, que está na pauta e que já aconteceu", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const base = { congregacaoId: 7, situacao: "AUSENTE_INJUSTIFICADA", membroId: 1, ctx, hoje: "2027-06-01" };
    expect((await db.registrarPresencaDirigente(pool, { ...base, evento: evento() })).mensagem).toMatch(/não registra presença/);
    expect((await db.registrarPresencaDirigente(pool, { ...base, evento: { ...ceiaGeral, status: "CANCELADO" } })).mensagem).toMatch(/na pauta/);
    expect((await db.registrarPresencaDirigente(pool, { ...base, evento: ceiaGeral, hoje: "2027-05-29" })).mensagem).toMatch(/ainda não aconteceu/);
    expect((await db.registrarPresencaDirigente(pool, { ...base, evento: ceiaGeral, congregacaoId: 99 })).mensagem).toMatch(/não encontrada/);
    expect((await db.registrarPresencaDirigente(pool, { ...base, evento: ceiaGeral, situacao: "TALVEZ" })).mensagem).toMatch(/inválida/);
    expect(chamadas).toHaveLength(0);
  });

  test("ausência justificada exige a justificativa (médica ou de trabalho comprovada)", async () => {
    const { pool } = criarPoolFalso([]);
    const r = await db.registrarPresencaDirigente(pool, { evento: ceiaGeral, congregacaoId: 7, situacao: "AUSENTE_JUSTIFICADA", justificativa: "doente", membroId: 1, ctx, hoje: "2027-06-01" });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/justificativa/);
  });

  test("a ausência injustificada avisa que é fato passível de apuração disciplinar", async () => {
    const { pool } = criarPoolFalso([[]]);
    const r = await db.registrarPresencaDirigente(pool, { evento: ceiaGeral, congregacaoId: 7, situacao: "AUSENTE_INJUSTIFICADA", membroId: 1, ctx, hoje: "2027-06-01" });
    expect(r.sucesso).toBe(true);
    expect(r.mensagem).toMatch(/apuração disciplinar/);
  });

  test("listar mostra cada congregação (menos a Sede) e o resumo", async () => {
    const ctx2 = { congregacoes: new Map([
      [1, { id: 1, ativa: true, slug: "sede", nome: "Sede", nomePublico: "Sede" }],
      [2, { id: 2, ativa: true, slug: "a", nome: "2 - A", nomePublico: "A" }],
      [3, { id: 3, ativa: true, slug: "b", nome: "3 - B", nomePublico: "B" }]
    ]) };
    const { pool } = criarPoolFalso([[{ CongregacaoId: 2, Situacao: "PRESENTE", Justificativa: null, RegistradoEm: "2027-05-31T10:00:00.000", RegistradoPorNome: "Sec" }]]);
    const r = await db.listarPresencasDirigente(pool, ceiaGeral, ctx2);
    expect(r.congregacoes.map(x => [x.congregacaoNome, x.situacao])).toEqual([["A", "PRESENTE"], ["B", "NAO_REGISTRADO"]]);
    expect(r.resumo).toEqual({ presentes: 1, ausentesJustificadas: 0, ausentesInjustificadas: 0, naoRegistradas: 1 });
  });
});

describe("agenda litúrgica: autorização da CLI", () => {
  test("criar ou alterar regra exige a resolução da CLI", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect((await db.criarRegraLiturgica(pool, { dados: {}, resolucao: "", membroId: 1 })).mensagem).toMatch(/autorização da CLI/);
    expect((await db.atualizarRegraLiturgica(pool, { regraId: 1, resolucao: "x", membroId: 1 })).mensagem).toMatch(/autorização da CLI/);
    expect(chamadas).toHaveLength(0);
  });
});

describe("pacote público para o site", () => {
  const ctxVazio = () => ({ areas: new Map(), congregacoes: new Map() });
  const linhaPublica = (extra = {}) => ({
    EventoId: 5, Ano: 2027, TipoId: 3, TipoCodigo: "ANIVERSARIO_CONGREGACAO", TipoNome: "Aniversário da Congregação", Festividade: true, FechaCongregacoes: false, RegistraPresencaDirigente: false,
    Nivel: 4, Titulo: "Aniversário", Descricao: "Festa", DataInicio: "2027-03-13", DataFim: "2027-03-13", HoraInicio: "19:30", HoraFim: null,
    Abrangencia: "CONGREGACAO", CongregacaoId: 7, CongregacaoNome: "11 - Nova Jerusalém", Local: "Templo", OrgaoId: null, DepartamentoId: null, Origem: "PROPOSTA", RegraChave: null,
    Status: "HOMOLOGADO", Tardia: false, RemarcacaoDeEventoId: null, MotivoIndeferimento: null, DetalheDecisao: "segredo interno", PrevalecidoPorEventoId: null,
    PropostoPorMembroId: 99, PropostoPorNome: "Fulano de Tal", PropostaEm: "2027-01-02T10:00:00.000", DecididoPorMembroId: 98, DecididoEm: null, HomologadoEm: null, CanceladoEm: null, MotivoCancelamento: null,
    SlugSite: "aniversario", PublicoNoSite: true, ...extra
  });

  test("a versão é estável para o mesmo conteúdo e muda com qualquer diferença", () => {
    const e = [{ id: 1, titulo: "A" }], l = [{ day: "terca", title: "Doutrina" }];
    expect(db.calcularVersao(e, l)).toMatch(/^[0-9a-f]{16}$/);
    expect(db.calcularVersao(e, l)).toBe(db.calcularVersao(e, l));
    expect(db.calcularVersao([{ id: 1, titulo: "B" }], l)).not.toBe(db.calcularVersao(e, l));
    expect(db.calcularVersao(e, [{ day: "terca", title: "Doutrina Geral" }])).not.toBe(db.calcularVersao(e, l));
  });

  test("o evento público não vaza quem propôs nem o estado interno", async () => {
    const { pool } = criarPoolFalso([[linhaPublica()], [], [{ De: "X", Para: "Y" }]]);
    const publicos = await db.eventosPublicos(pool, ctxVazio(), { hoje: "2027-02-01" });
    expect(publicos).toHaveLength(1);
    expect(publicos[0]).toMatchObject({ id: 5, titulo: "Aniversário", dataInicio: "2027-03-13", dataFim: null, hora: "19h30", congregacaoNome: "Nova Jerusalém", slugSite: "aniversario" });
    const texto = JSON.stringify(publicos);
    expect(texto).not.toMatch(/Fulano|segredo interno|propostoPor|status|DetalheDecisao/i);
  });

  test("evento não público fica de fora", async () => {
    const { pool } = criarPoolFalso([[linhaPublica({ PublicoNoSite: false })], [], []]);
    expect(await db.eventosPublicos(pool, ctxVazio(), { hoje: "2027-02-01" })).toEqual([]);
  });
});

describe("sincronização com o site", () => {
  // eventosPublicos = 3 consultas (eventos, áreas, compatíveis) quando há linha; vazio = 1; liturgia = 1.
  const pacoteVazio = () => criarPoolFalso([[], []]);
  const ctxVazio = () => ({ areas: new Map(), congregacoes: new Map() });

  test("sincronizado quando o site publicou a mesma versão", async () => {
    const { pool } = pacoteVazio();
    const versao = db.calcularVersao([], []);
    const fetchImpl = async () => ({ ok: true, json: async () => ({ versao }) });
    const r = await db.statusSincronizacaoSite(pool, ctxVazio(), { fetchImpl, siteUrl: "https://site.teste" });
    expect(r).toMatchObject({ versaoSistema: versao, versaoSite: versao, sincronizado: true, erro: null });
  });

  test("defasado quando a versão do site é outra, e avisa se o site não responde", async () => {
    const a = await db.statusSincronizacaoSite(pacoteVazio().pool, ctxVazio(), { fetchImpl: async () => ({ ok: true, json: async () => ({ versao: "antiga" }) }) });
    expect(a.sincronizado).toBe(false);
    expect(a.versaoSite).toBe("antiga");
    const b = await db.statusSincronizacaoSite(pacoteVazio().pool, ctxVazio(), { fetchImpl: async () => { throw new Error("rede"); } });
    expect(b).toMatchObject({ sincronizado: false, versaoSite: null });
    expect(b.erro).toMatch(/consultar o site/);
    const c = await db.statusSincronizacaoSite(pacoteVazio().pool, ctxVazio(), { fetchImpl: async () => ({ ok: false, status: 404 }) });
    expect(c.erro).toMatch(/404/);
  });
});
