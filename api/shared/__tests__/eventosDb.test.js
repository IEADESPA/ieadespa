// Testes da camada de banco dos eventos (v7.4) com pool falso: as recusas que acontecem ANTES de qualquer gravação,
// a segregação de funções, os mapeamentos e os fatos de aviso. A auditoria grava no banco de verdade: aqui só importa
// que a regra recusou/aceitou. O comportamento contra o banco de verdade é coberto pelo roteiro ponta a ponta.
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
const db = require("../eventosDb");
const { registrarAuditoria } = require("../auditoria");
const { criarPoolFalso } = require("./testUtils");

const evento = (extra = {}) => ({ id: 7, titulo: "Cruzada de Área", status: "HOMOLOGADO", nivel: 3, abrangencia: "AREAS", dataInicio: "2026-10-20", dataFim: "2026-10-21", propostoPorMembroId: 50, ...extra });
const bruto = (extra = {}) => ({ ConvidadoId: 3, EventoId: 7, Nome: "Pr. Fulano", Tipo: "PRELETOR", MinisterioOrigem: "AD Belém", Contato: "(94) 99999-0000", ReputacaoConhecida: 0, ObservacaoOrganizador: null, DivulgacaoAutorizada: 1,
  Status: "RASCUNHO", ExigeEtica: 0, ExigeNadaConsta: 0, SubmetidoEm: null, SubmetidoPorMembroId: null, EticaParecer: null, NadaConsta: null, OficializadoEm: null, CriadoPorMembroId: 60, ...extra });

beforeEach(() => registrarAuditoria.mockClear());

describe("organizadores — recusas", () => {
  test("evento fora da pauta, papel, matrícula, situação do membro e duplicidade", async () => {
    expect((await db.designarOrganizador(criarPoolFalso([]).pool, { evento: evento({ status: "CANCELADO" }), membroId: 1, por: 9 })).mensagem).toMatch(/não está ativo/);
    expect((await db.designarOrganizador(criarPoolFalso([]).pool, { evento: evento(), membroId: 1, papel: "DONO", por: 9 })).mensagem).toMatch(/Papel inválido/);
    expect((await db.designarOrganizador(criarPoolFalso([]).pool, { evento: evento(), membroId: "x", por: 9 })).mensagem).toMatch(/matrícula/);
    expect((await db.designarOrganizador(criarPoolFalso([[]]).pool, { evento: evento(), membroId: 1, por: 9 })).mensagem).toMatch(/Matrícula não encontrada/);
    expect((await db.designarOrganizador(criarPoolFalso([[{ MembroId: 1, Nome: "Fulano", Status: "INATIVO" }]]).pool, { evento: evento(), membroId: 1, por: 9 })).mensagem).toMatch(/situação ATIVO/);
    expect((await db.designarOrganizador(criarPoolFalso([[{ MembroId: 1, Nome: "Fulano", Status: "ATIVO" }], [{ OrganizadorId: 4 }]]).pool, { evento: evento(), membroId: 1, por: 9 })).mensagem).toMatch(/já organiza/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("encerrar: existe, ainda ativa, motivo", async () => {
    expect((await db.encerrarOrganizador(criarPoolFalso([[]]).pool, { organizadorId: 1, motivo: "Motivo suficiente", por: 9 })).mensagem).toMatch(/não encontrada/);
    expect((await db.encerrarOrganizador(criarPoolFalso([[{ OrganizadorId: 1, EncerradoEm: "2026-09-01" }]]).pool, { organizadorId: 1, motivo: "Motivo suficiente", por: 9 })).mensagem).toMatch(/já foi encerrada/);
    expect((await db.encerrarOrganizador(criarPoolFalso([[{ OrganizadorId: 1, EncerradoEm: null }]]).pool, { organizadorId: 1, motivo: "x", por: 9 })).mensagem).toMatch(/motivo do encerramento/);
  });
});

describe("papéis no evento", () => {
  test("o proponente do calendário é RESPONSÁVEL implícito (organiza e opera o caixa)", async () => {
    const p = await db.papeisNoEvento(criarPoolFalso([[]]).pool, evento(), 50);
    expect(p).toMatchObject({ proponente: true, responsavel: true, organizador: true, tesoureiro: true, algum: true });
  });
  test("o organizador não opera o caixa; o tesoureiro não registra convidado; terceiro nada", async () => {
    expect(await db.papeisNoEvento(criarPoolFalso([[{ Papel: "ORGANIZADOR" }]]).pool, evento(), 8)).toMatchObject({ organizador: true, tesoureiro: false, responsavel: false });
    expect(await db.papeisNoEvento(criarPoolFalso([[{ Papel: "TESOUREIRO" }]]).pool, evento(), 8)).toMatchObject({ organizador: false, tesoureiro: true });
    expect(await db.papeisNoEvento(criarPoolFalso([[]]).pool, evento(), 8)).toMatchObject({ algum: false, organizador: false, tesoureiro: false });
    expect((await db.papeisNoEvento(criarPoolFalso([]).pool, evento(), null)).algum).toBe(false);
  });
});

describe("convidados — recusas antes de gravar", () => {
  test("registrar: evento fora da pauta e dado inválido", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect((await db.criarConvidado(pool, { evento: evento({ status: "INDEFERIDO" }), dados: {}, por: 1 })).mensagem).toMatch(/não está ativo/);
    expect((await db.criarConvidado(pool, { evento: evento(), dados: { nome: "Fulano", reputacaoConhecida: "sim" }, por: 1 })).mensagem).toMatch(/reputação/);
    expect(chamadas).toHaveLength(0);
  });
  test("editar só rascunho", async () => {
    expect((await db.atualizarConvidado(criarPoolFalso([]).pool, { convidado: bruto({ Status: "EM_ANALISE" }), dados: { nome: "Novo nome" }, por: 1 })).mensagem).toMatch(/Só se edita convidado em rascunho/);
  });
  test("enviar: já enviado; e a regra dos 10 dias para reputação desconhecida", async () => {
    expect((await db.submeterConvidado(criarPoolFalso([]).pool, { convidado: bruto({ Status: "EM_ANALISE" }), evento: evento(), por: 1, hoje: "2026-10-10" })).mensagem).toMatch(/já foi enviado/);
    const tarde = await db.submeterConvidado(criarPoolFalso([[{ Dias: 10 }]]).pool, { convidado: bruto(), evento: evento({ dataInicio: "2026-10-15" }), por: 1, hoje: "2026-10-10" });
    expect(tarde.sucesso).toBe(false);
    expect(tarde.mensagem).toMatch(/10 dias de antecedência/);
    // o prazo é parâmetro da CLI: com 3 dias o mesmo convite passa da checagem de antecedência
    const { chamadas } = criarPoolFalso([[{ Dias: 3 }]]);
    expect(chamadas).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("oficializar: só o autorizado, uma vez; cancelar: motivo e estados", async () => {
    expect((await db.oficializarConvidado(criarPoolFalso([]).pool, { convidado: bruto({ Status: "EM_ANALISE" }), por: 1 })).mensagem).toMatch(/Art\. 111-A/);
    expect((await db.oficializarConvidado(criarPoolFalso([]).pool, { convidado: bruto({ Status: "AUTORIZADO", OficializadoEm: "2026-10-01" }), por: 1 })).mensagem).toMatch(/já foi oficializado/);
    expect((await db.cancelarConvidado(criarPoolFalso([]).pool, { convidado: bruto({ Status: "CANCELADO" }), motivo: "Motivo suficiente", por: 1 })).mensagem).toMatch(/já está cancelado/);
    expect((await db.cancelarConvidado(criarPoolFalso([]).pool, { convidado: bruto({ Status: "VETADO" }), motivo: "Motivo suficiente", por: 1 })).mensagem).toMatch(/vetado/);
    expect((await db.cancelarConvidado(criarPoolFalso([]).pool, { convidado: bruto(), motivo: "x", por: 1 })).mensagem).toMatch(/motivo do cancelamento/);
  });
});

describe("decisão sobre o convidado — segregação de funções", () => {
  const emAnalise = (extra = {}) => bruto({ Status: "EM_ANALISE", ExigeEtica: 1, ExigeNadaConsta: 0, SubmetidoPorMembroId: 61, ...extra });
  const decide = (conv, pool, extra = {}) => db.decidirConvidado(pool, { convidado: conv, evento: evento(), por: 99, orgao: "ETICA", valor: "FAVORAVEL", motivo: null, ...extra });

  test("só decide o que está em análise e é exigido daquele órgão, uma vez", async () => {
    expect((await decide(bruto({ Status: "RASCUNHO" }), criarPoolFalso([]).pool)).mensagem).toMatch(/não está em análise/);
    expect((await decide(emAnalise({ ExigeEtica: 0 }), criarPoolFalso([]).pool)).mensagem).toMatch(/não exige parecer do Conselho de Ética/);
    expect((await decide(emAnalise(), criarPoolFalso([]).pool, { orgao: "PRESIDENCIA", valor: "CONCEDIDO" })).mensagem).toMatch(/não exige o Nada Consta/);
    expect((await decide(emAnalise({ EticaParecer: "FAVORAVEL" }), criarPoolFalso([]).pool)).mensagem).toMatch(/já foi registrada/);
  });
  test("quem criou, quem enviou ou quem organiza o evento NÃO decide sobre o próprio convidado", async () => {
    expect((await decide(emAnalise({ CriadoPorMembroId: 99 }), criarPoolFalso([]).pool)).mensagem).toMatch(/Quem convidou, enviou ou organiza/);
    expect((await decide(emAnalise({ SubmetidoPorMembroId: 99 }), criarPoolFalso([]).pool)).mensagem).toMatch(/Quem convidou/);
    expect((await decide(emAnalise(), criarPoolFalso([[{ Papel: "ORGANIZADOR" }]]).pool)).mensagem).toMatch(/Quem convidou/);
    const proponente = await db.decidirConvidado(criarPoolFalso([[]]).pool, { convidado: emAnalise(), evento: evento({ propostoPorMembroId: 99 }), por: 99, orgao: "ETICA", valor: "FAVORAVEL" });
    expect(proponente.mensagem).toMatch(/Quem convidou/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("o parecer contrário exige o motivo antes de gravar", async () => {
    const r = await decide(emAnalise(), criarPoolFalso([[]]).pool, { valor: "DESFAVORAVEL", motivo: "curto" });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/exige o motivo/);
  });
});

describe("leitura do convidado", () => {
  const linha = (extra = {}) => ({ ...bruto(extra), CriadoPorNome: "Organizador", EticaPorNome: null, NadaConstaPorNome: null, ...extra });
  test("o contato só aparece quando autorizado", () => {
    expect(db.mapearConvidado(linha(), { verContato: false })).not.toHaveProperty("contato");
    expect(db.mapearConvidado(linha(), { verContato: true }).contato).toBe("(94) 99999-0000");
  });
  test("pendências do que está em análise e o estado 'divulgável'", () => {
    const c = db.mapearConvidado(linha({ Status: "EM_ANALISE", ExigeEtica: 1, ExigeNadaConsta: 1, EticaParecer: "FAVORAVEL", EticaPorNome: "Conselheiro", EticaEm: "2026-10-02T10:00:00.000Z" }), { verContato: false });
    expect(c.pendencias).toEqual(["Aguardando o Nada Consta da Presidência"]);
    expect(c.etica).toMatchObject({ parecer: "FAVORAVEL", porNome: "Conselheiro" });
    expect(c.nadaConsta).toBeNull();
    const ok = db.mapearConvidado(linha({ Status: "AUTORIZADO", OficializadoEm: "2026-10-03T10:00:00.000Z", DivulgacaoAutorizada: 1 }), { verContato: false });
    expect(ok).toMatchObject({ divulgavel: true, podeOficializar: false, pendencias: [] });
    expect(db.mapearConvidado(linha({ Status: "AUTORIZADO", OficializadoEm: "2026-10-03T10:00:00.000Z", DivulgacaoAutorizada: 0 }), { verContato: false }).divulgavel).toBe(false);
    expect(db.mapearConvidado(linha({ Status: "AUTORIZADO" }), { verContato: false }).podeOficializar).toBe(true);
  });
});

describe("caixa — recusas antes de gravar", () => {
  test("abrir: evento errado, sem declaração, já aberto", async () => {
    expect((await db.abrirCaixa(criarPoolFalso([]).pool, { evento: evento({ abrangencia: "CONGREGACAO" }), declarou: true, por: 1 })).mensagem).toMatch(/tesouraria da própria congregação/);
    expect((await db.abrirCaixa(criarPoolFalso([]).pool, { evento: evento(), declarou: false, por: 1 })).mensagem).toMatch(/conta bancária/);
    expect((await db.abrirCaixa(criarPoolFalso([[{ EventoId: 7 }]]).pool, { evento: evento(), declarou: true, por: 1 })).mensagem).toMatch(/já tem caixa/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("lançar: sem caixa, caixa encerrado, saída sem comprovante", async () => {
    const l = { tipo: "SAIDA", categoria: "ESTRUTURA", valor: 10, descricao: "Cadeiras", comprovante: "NF 1", dataLancamento: "2026-10-20" };
    expect((await db.lancarNoCaixa(criarPoolFalso([[]]).pool, { evento: evento(), dados: l, por: 1, hoje: "2026-10-25" })).mensagem).toMatch(/Abra o caixa/);
    expect((await db.lancarNoCaixa(criarPoolFalso([[{ Status: "ENCERRADO" }]]).pool, { evento: evento(), dados: l, por: 1, hoje: "2026-10-25" })).mensagem).toMatch(/encerrado não recebe lançamento/);
    expect((await db.lancarNoCaixa(criarPoolFalso([[{ Status: "ABERTO" }]]).pool, { evento: evento(), dados: { ...l, comprovante: "" }, por: 1, hoje: "2026-10-25" })).mensagem).toMatch(/comprovante/);
  });
  test("cancelar lançamento: existe, caixa aberto, ainda não cancelado, motivo", async () => {
    expect((await db.cancelarLancamento(criarPoolFalso([[]]).pool, { lancamentoId: 1, motivo: "Motivo suficiente", por: 1 })).mensagem).toMatch(/não encontrado/);
    expect((await db.cancelarLancamento(criarPoolFalso([[{ LancamentoId: 1, CaixaStatus: "ENCERRADO" }]]).pool, { lancamentoId: 1, motivo: "Motivo suficiente", por: 1 })).mensagem).toMatch(/não está aberto/);
    expect((await db.cancelarLancamento(criarPoolFalso([[{ LancamentoId: 1, CaixaStatus: "ABERTO", CanceladoEm: "2026-10-01" }]]).pool, { lancamentoId: 1, motivo: "Motivo suficiente", por: 1 })).mensagem).toMatch(/já foi cancelado/);
    expect((await db.cancelarLancamento(criarPoolFalso([[{ LancamentoId: 1, CaixaStatus: "ABERTO", CanceladoEm: null }]]).pool, { lancamentoId: 1, motivo: "x", por: 1 })).mensagem).toMatch(/motivo do cancelamento/);
  });
  test("encerrar: o superávit sem destino NÃO fecha o caixa (nada é gravado)", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ Status: "ABERTO", Ciclo: 1 }], [{ Tipo: "ENTRADA", Valor: 100, CanceladoEm: null }, { Tipo: "SAIDA", Valor: 30.5, CanceladoEm: null }, { Tipo: "SAIDA", Valor: 999, CanceladoEm: "2026-10-02" }]]);
    const r = await db.encerrarCaixa(pool, { evento: evento(), destinos: [], por: 1, hoje: "2026-10-25" });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/Sobrou R\$\s?69,50/);
    expect(r.totais).toEqual({ entradas: 100, saidas: 30.5, saldo: 69.5 });
    expect(chamadas).toHaveLength(2);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("encerrar: sem caixa e caixa já encerrado", async () => {
    expect((await db.encerrarCaixa(criarPoolFalso([[]]).pool, { evento: evento(), destinos: [], por: 1 })).mensagem).toMatch(/não tem caixa/);
    expect((await db.encerrarCaixa(criarPoolFalso([[{ Status: "ENCERRADO" }]]).pool, { evento: evento(), destinos: [], por: 1 })).mensagem).toMatch(/já foi encerrado/);
  });
  test("conferir: precisa estar encerrado e quem encerrou não confere", async () => {
    expect((await db.conferirCaixa(criarPoolFalso([[]]).pool, { evento: evento(), por: 5 })).mensagem).toMatch(/não tem caixa/);
    expect((await db.conferirCaixa(criarPoolFalso([[{ Status: "ABERTO" }]]).pool, { evento: evento(), por: 5 })).mensagem).toMatch(/ainda não foi encerrado/);
    expect((await db.conferirCaixa(criarPoolFalso([[{ Status: "CONFERIDO" }]]).pool, { evento: evento(), por: 5 })).mensagem).toMatch(/já foi conferido/);
    const mesmo = await db.conferirCaixa(criarPoolFalso([[{ Status: "ENCERRADO", EncerradoPorMembroId: 5 }]]).pool, { evento: evento(), por: 5 });
    expect(mesmo.sucesso).toBe(false);
    expect(mesmo.mensagem).toMatch(/Quem encerrou o caixa não faz a conferência/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("devolver: só o encerrado, com explicação", async () => {
    expect((await db.devolverCaixa(criarPoolFalso([[{ Status: "ABERTO" }]]).pool, { evento: evento(), motivo: "Explicação suficiente", por: 5 })).mensagem).toMatch(/já está aberto/);
    expect((await db.devolverCaixa(criarPoolFalso([[{ Status: "CONFERIDO" }]]).pool, { evento: evento(), motivo: "Explicação suficiente", por: 5 })).mensagem).toMatch(/não volta/);
    expect((await db.devolverCaixa(criarPoolFalso([[{ Status: "ENCERRADO" }]]).pool, { evento: evento(), motivo: "curto", por: 5 })).mensagem).toMatch(/Explique o que precisa/);
  });
});

describe("o que o site pode mostrar", () => {
  test("só nome, tipo, rótulo e ministério dos divulgáveis, agrupados por evento", async () => {
    const { pool, chamadas } = criarPoolFalso([[
      { EventoId: 7, Nome: "Pr. Fulano", Tipo: "PRELETOR", MinisterioOrigem: "AD Belém" },
      { EventoId: 7, Nome: "Banda Louvor", Tipo: "BANDA", MinisterioOrigem: null },
      { EventoId: 9, Nome: "Irmã Cantora", Tipo: "CANTOR", MinisterioOrigem: "AD Sede" }
    ]]);
    const mapa = await db.convidadosPublicos(pool, [7, 9, 11]);
    expect(mapa.get(7)).toEqual([{ nome: "Pr. Fulano", tipo: "PRELETOR", rotuloTipo: "Preletor", ministerio: "AD Belém" }, { nome: "Banda Louvor", tipo: "BANDA", rotuloTipo: "Banda ou grupo", ministerio: null }]);
    expect(mapa.get(9)).toHaveLength(1);
    expect(mapa.has(11)).toBe(false);
    expect(chamadas[0].sql).toMatch(/Status = 'AUTORIZADO' AND OficializadoEm IS NOT NULL AND DivulgacaoAutorizada = 1/);
    expect(chamadas[0].sql).not.toMatch(/Contato/);
  });
  test("sem eventos não consulta o banco", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect((await db.convidadosPublicos(pool, [])).size).toBe(0);
    expect(chamadas).toHaveLength(0);
  });
});

describe("fatos para o motor de notificações", () => {
  test("convidado sem decisão com o evento perto: cobra SÓ o órgão que falta, uma vez por órgão", async () => {
    const { pool } = criarPoolFalso([
      [
        { ConvidadoId: 3, Nome: "Pr. A", ExigeEtica: 1, EticaParecer: null, ExigeNadaConsta: 1, NadaConsta: null, Titulo: "Congresso", DataInicio: "2026-10-12" },
        { ConvidadoId: 4, Nome: "Pr. B", ExigeEtica: 1, EticaParecer: "FAVORAVEL", ExigeNadaConsta: 1, NadaConsta: null, Titulo: "Congresso", DataInicio: "2026-10-12" },
        { ConvidadoId: 5, Nome: "Pr. C", ExigeEtica: 1, EticaParecer: null, ExigeNadaConsta: 0, NadaConsta: null, Titulo: "Cruzada", DataInicio: "2026-12-30" }
      ],
      [{ membroId: 21, nome: "Conselheiro", email: "c@x.org" }],   // quem tem eventos_etica
      [{ membroId: 22, nome: "Presidente", email: "p@x.org" }]     // quem tem eventos_presidencia
    ]);
    const f = await db.detectarConvidadosAtrasados(pool, { hoje: "2026-10-10" });
    expect(f.map(x => x.referenciaId)).toEqual([6, 7, 9]);   // 3*2 (Ética), 3*2+1 (Presidência), 4*2+1 (só a Presidência)
    expect(f[0].destinatarios[0].membroId).toBe(21);
    expect(f[1].destinatarios[0].membroId).toBe(22);
    expect(f[0].fatoGerador).toMatch(/Conselho de Ética sobre Pr\. A.*em 2 dia/);
    expect(f.some(x => x.fatoGerador.includes("Pr. C"))).toBe(false);   // evento a 81 dias: ainda não é urgente
  });
  test("caixa fora do prazo: organização e Tesouraria", async () => {
    const { pool } = criarPoolFalso([
      [{ EventoId: 7, Titulo: "Cruzada de Área", Prazo: "2026-10-01" }],
      [{ membroId: 31, nome: "Tesoureiro Geral", email: "t@x.org" }],   // financeiro
      [{ PropostoPorMembroId: 50 }],                                     // proponente do evento
      [],                                                                // organizadores ativos
      [{ MembroId: 50, Nome: "Proponente", Email: "p@x.org" }]           // dados do proponente
    ]);
    const f = await db.detectarCaixasForaDoPrazo(pool, { hoje: "2026-10-10" });
    expect(f).toHaveLength(1);
    expect(f[0].referenciaId).toBe(7);
    expect(f[0].destinatarios.map(x => x.membroId).sort()).toEqual([31, 50]);
    expect(f[0].fatoGerador).toMatch(/Art\. 53-E/);
  });
  test("nenhum caixa atrasado: nada a avisar e nem consulta a Tesouraria", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]);
    expect(await db.detectarCaixasForaDoPrazo(pool, { hoje: "2026-10-10" })).toEqual([]);
    expect(chamadas).toHaveLength(1);
  });
});
