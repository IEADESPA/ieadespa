// A camada de banco do Termo de Vistoria (v7.6) com pool falso: as recusas antes de gravar, o que a auditoria leva (nunca o parecer nem o hash), o aviso à pessoa e o que
// o titular recebe. A transação da lavratura e os gatilhos de imutabilidade são cobertos pelo roteiro ponta a ponta contra o SQL Server.
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../canaisDb", () => ({ ...jest.requireActual("../canaisDb"), notificarAgora: jest.fn(async () => ({ criadas: 1 })) }));
jest.mock("../notificacoes", () => ({ ...jest.requireActual("../notificacoes"), resolverDestinatariosPorPermissao: jest.fn(async () => []) }));

const crypto = require("crypto");
const db = require("../vistoriaAntecedentesDb");
const { registrarAuditoria } = require("../auditoria");
const { notificarAgora } = require("../canaisDb");
const { resolverDestinatariosPorPermissao } = require("../notificacoes");
const { criarPoolFalso } = require("./testUtils");

const HOJE = "2026-10-08";
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");
const termo = (extra = {}) => ({ membroId: 20, motivo: "INVESTIDURA", funcao: "Professor da EBD infantil", comVulneraveis: true, dataVerificacao: HOJE, resultado: "SEM_RESTRICAO", parecer: "Certidões sem apontamentos; apto à função.", destinoOriginal: "DEVOLVIDO",
  documentos: [{ tipo: "ANTECEDENTES_FEDERAL", hash: hash("a"), dataEmissao: HOJE }], ...extra });
const vistoriaLinha = (extra = {}) => ({ VistoriaId: 5, MembroId: 20, MembroNome: "Ana Souza", Motivo: "INVESTIDURA", Funcao: "Professor da EBD infantil", ComVulneraveis: 1, DataVerificacao: new Date("2026-10-08T00:00:00Z"), Resultado: "SEM_RESTRICAO",
  Parecer: "Certidões sem apontamentos; apto à função.", DestinoOriginal: "DEVOLVIDO", AssinadaPorMembroId: 1, AssinadaPorNome: "Presidente", AssinadaEm: new Date("2026-10-08T14:00:00Z"), ...extra });

beforeEach(() => { registrarAuditoria.mockClear(); notificarAgora.mockClear(); resolverDestinatariosPorPermissao.mockReset(); resolverDestinatariosPorPermissao.mockResolvedValue([]); });

describe("solicitar as certidões", () => {
  test("dado ruim é recusado antes de qualquer consulta", async () => {
    for (const dados of [{}, { membroId: 1 }, { membroId: "0x10" }, { membroId: 20, motivo: "QUALQUER" }]) {
      const { pool, chamadas } = criarPoolFalso([]);
      const r = await db.solicitarCertidoes(pool, { dados, por: 1 });
      expect(r.sucesso).toBe(false);
      expect(chamadas).toHaveLength(0);
    }
  });
  test("se a regra de aviso está desligada, o pedido fica registrado e a resposta não diz que a pessoa foi avisada", async () => {
    notificarAgora.mockResolvedValueOnce({ criadas: 0 });
    const { pool } = criarPoolFalso([[{ MembroId: 20, Nome: "Ana", Email: "a@x.org", Status: "ATIVO" }], [{ n: 0 }]]);
    const r = await db.solicitarCertidoes(pool, { dados: { membroId: 20 }, por: 1 });
    expect(r).toMatchObject({ sucesso: true, avisou: false });
    expect(r.mensagem).toMatch(/não pôde ser criado/);
    expect(r.mensagem).not.toMatch(/foi avisado/);
  });
  test("pessoa que não existe; e o limite de dois avisos em 24 horas", async () => {
    let { pool } = criarPoolFalso([[]]);
    expect((await db.solicitarCertidoes(pool, { dados: { membroId: 20 }, por: 1 })).mensagem).toBe("Pessoa não encontrada.");
    ({ pool } = criarPoolFalso([[{ MembroId: 20, Nome: "Ana", Email: "a@x.org", Status: "ATIVO" }], [{ n: 2 }]]));
    const r = await db.solicitarCertidoes(pool, { dados: { membroId: 20 }, por: 1 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/duas vezes nas últimas 24 horas/);
    expect(notificarAgora).not.toHaveBeenCalled();
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("o pedido avisa a pessoa (e-mail dela), cita a função e deixa só o motivo na auditoria", async () => {
    const { pool } = criarPoolFalso([[{ MembroId: 20, Nome: "Ana", Email: "a@x.org", Status: "ATIVO" }], [{ n: 0 }]]);
    const r = await db.solicitarCertidoes(pool, { dados: { membroId: 20, motivo: "INVESTIDURA", funcao: "Professor da EBD" }, por: 1 });
    expect(r.sucesso).toBe(true);
    const aviso = notificarAgora.mock.calls[0][1];
    expect(aviso).toMatchObject({ regraChave: "VISTORIA_SOLICITADA", destinatarios: [{ membroId: 20, email: "a@x.org" }], referenciaTabela: "VistoriasAntecedentes" });
    expect(aviso.mensagem).toMatch(/Professor da EBD/);
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "VISTORIA_SOLICITADA", usuarioId: 1, dadosDepois: { membroId: 20 } });
    expect(registrarAuditoria.mock.calls[0][0].dadosDepois).not.toHaveProperty("motivo");   // a trilha é lida por quem tem "auditoria": o motivo fica fora
    expect(aviso.aguardarEntrega).toBe(false);
    expect(r.avisou).toBe(true);
    expect(aviso.referenciaId).toBeLessThan(2000000000);
    expect(JSON.stringify(registrarAuditoria.mock.calls[0][0])).not.toMatch(/Professor da EBD/);
  });
});

describe("lavrar o Termo", () => {
  test("recusas de regra: nada é consultado; ninguém assina a própria vistoria", async () => {
    for (const dados of [termo({ documentos: [] }), termo({ membroId: 1 }), termo({ parecer: "" }), termo({ destinoOriginal: undefined }), termo({ resultado: "TALVEZ" })]) {
      const { pool, chamadas } = criarPoolFalso([]);
      const r = await db.lavrarVistoria(pool, { dados, por: 1, hoje: HOJE });
      expect(r.sucesso).toBe(false);
      expect(chamadas).toHaveLength(0);
    }
  });
  test("pessoa inexistente: recusa antes de abrir a transação", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]);
    const r = await db.lavrarVistoria(pool, { dados: termo(), por: 1, hoje: HOJE });
    expect(r.mensagem).toBe("Pessoa não encontrada.");
    expect(chamadas).toHaveLength(1);
    expect(chamadas.filter(c => /INSERT/i.test(c.sql))).toHaveLength(0);
  });
});

describe("leitura", () => {
  test("a lista traz o termo com as certidões (só hash), o rótulo do motivo e do resultado", async () => {
    const { pool } = criarPoolFalso([[vistoriaLinha(), vistoriaLinha({ VistoriaId: 4, Resultado: "RECUSA", DestinoOriginal: null })], [{ VistoriaId: 5, Tipo: "ANTECEDENTES_FEDERAL", HashSha256: hash("a"), DataEmissao: new Date("2026-10-08T00:00:00Z") }]]);
    const l = await db.listarVistorias(pool, {});
    expect(l[0]).toMatchObject({ vistoriaId: 5, rotuloMotivo: expect.stringMatching(/Investidura/), baseMotivo: "Art. 133 §5º, II, “a”", rotuloResultado: "Sem restrição", rotuloDestino: "Devolvido ao membro", assinadaPorNome: "Presidente" });
    expect(l[0].documentos).toEqual([{ tipo: "ANTECEDENTES_FEDERAL", rotuloTipo: expect.stringMatching(/federal/), hash: hash("a"), dataEmissao: "2026-10-08" }]);
    expect(l[1]).toMatchObject({ vistoriaId: 4, rotuloDestino: null, documentos: [] });
  });
  test("as certidões são buscadas em UMA consulta para todas as vistorias da página", async () => {
    const { pool, chamadas } = criarPoolFalso([[vistoriaLinha(), vistoriaLinha({ VistoriaId: 4 })], []]);
    await db.listarVistorias(pool, {});
    expect(chamadas).toHaveLength(2);
    expect(chamadas[1].sql).toMatch(/VistoriaId IN \(@v0, @v1\)/);
  });
  test("lista vazia não consulta documentos; vistoria que não existe é null", async () => {
    let { pool, chamadas } = criarPoolFalso([[]]);
    expect(await db.listarVistorias(pool, {})).toEqual([]);
    expect(chamadas).toHaveLength(1);
    ({ pool } = criarPoolFalso([[]]));
    expect(await db.detalharVistoria(pool, 99)).toBeNull();
  });
  test("a lista de pendentes marca quem só tem a recusa", async () => {
    const { pool } = criarPoolFalso([[{ MembroId: 3, Nome: "Dirigente", CongregacaoNome: "Central", Cargos: "Dirigente de Congregação", UltimoResultado: "RECUSA" }, { MembroId: 4, Nome: "Tesoureiro", CongregacaoNome: null, Cargos: "Tesoureiro Local", UltimoResultado: null }]]);
    const l = await db.liderancasSemVistoria(pool);
    expect(l).toEqual([
      { membroId: 3, nome: "Dirigente", congregacaoNome: "Central", cargos: "Dirigente de Congregação", ultimoResultado: "RECUSA", recusou: true },
      { membroId: 4, nome: "Tesoureiro", congregacaoNome: null, cargos: "Tesoureiro Local", ultimoResultado: null, recusou: false }]);
  });
});

describe("aviso mensal à Diretoria", () => {
  test("um fato por mês para quem tem vistoria_antecedentes; sem pendentes ou sem destinatário, nenhum", async () => {
    const lista = [{ MembroId: 3, Nome: "Dirigente", CongregacaoNome: "Central", Cargos: "Dirigente", UltimoResultado: null }];
    resolverDestinatariosPorPermissao.mockResolvedValue([{ membroId: 1, nome: "Presidente", email: "p@x.org" }]);
    let fatos = await db.detectarLiderancasSemVistoria(criarPoolFalso([lista]).pool, { hoje: HOJE });
    expect(resolverDestinatariosPorPermissao).toHaveBeenCalledWith(expect.anything(), { permissao: "vistoria_antecedentes", nivel: "GLOBAL" });
    expect(fatos).toHaveLength(1);
    expect(fatos[0].referenciaId).toBe((2026 - 2000) * 12 + 10);
    expect(fatos[0].fatoGerador).toMatch(/^1 liderança\(s\)/);
    fatos = await db.detectarLiderancasSemVistoria(criarPoolFalso([lista]).pool, { hoje: "2026-11-02" });
    expect(fatos[0].referenciaId).toBe((2026 - 2000) * 12 + 11);
    expect(await db.detectarLiderancasSemVistoria(criarPoolFalso([[]]).pool, { hoje: HOJE })).toEqual([]);
    resolverDestinatariosPorPermissao.mockResolvedValue([]);
    expect(await db.detectarLiderancasSemVistoria(criarPoolFalso([lista]).pool, { hoje: HOJE })).toEqual([]);
  });
});

describe("consulta de nome", () => {
  test("devolve nome e congregação; matrícula que não existe, null", async () => {
    expect(await db.pessoaPorMatricula(criarPoolFalso([[{ MembroId: 20, Nome: "Ana", CongregacaoNome: null }]]).pool, 20)).toEqual({ membroId: 20, nome: "Ana", congregacaoNome: null });
    expect(await db.pessoaPorMatricula(criarPoolFalso([[]]).pool, 99)).toBeNull();
  });
});

describe("a última vistoria (para a v7.7)", () => {
  test("devolve a mais recente, ou null", async () => {
    expect(await db.ultimaVistoria(criarPoolFalso([[{ VistoriaId: 9, DataVerificacao: new Date("2026-09-01T00:00:00Z"), Resultado: "COM_RESTRICAO", Motivo: "INVESTIDURA" }]]).pool, 20)).toEqual({ vistoriaId: 9, dataVerificacao: "2026-09-01", resultado: "COM_RESTRICAO", motivo: "INVESTIDURA" });
    expect(await db.ultimaVistoria(criarPoolFalso([[]]).pool, 20)).toBeNull();
  });
});

describe("direito de acesso do titular", () => {
  test("recebe o parecer e os hashes, sem o nome de quem assinou", async () => {
    const { pool } = criarPoolFalso([[{ VistoriaId: 5, Motivo: "SUSPEITA_FUNDADA", Funcao: "Professor", DataVerificacao: new Date("2026-10-08T00:00:00Z"), Resultado: "COM_RESTRICAO", Parecer: "Apontamento antigo; a Diretoria decide.", DestinoOriginal: "DESCARTADO", AssinadaEm: new Date("2026-10-08T14:00:00Z") }],
      [{ VistoriaId: 5, Tipo: "DISTRIBUICAO_CIVEL", HashSha256: hash("c"), DataEmissao: new Date("2026-10-07T00:00:00Z") }]]);
    const d = await db.dadosDoTitular(pool, 20);
    expect(d.vistorias[0]).toMatchObject({ motivo: expect.stringMatching(/Suspeita fundada/), resultado: expect.stringMatching(/Com restrição/), destinoDoOriginal: "Descartado", parecer: "Apontamento antigo; a Diretoria decide." });
    expect(d.vistorias[0].certidoes).toEqual([{ tipo: expect.stringMatching(/distribuição cível/), hash: hash("c"), dataEmissao: "2026-10-07" }]);
    expect(JSON.stringify(d)).not.toMatch(/AssinadaPor|assinadaPor/);
    expect(d.aviso).toMatch(/nunca o documento/);
  });
});
