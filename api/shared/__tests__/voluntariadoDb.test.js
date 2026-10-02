// Testes da camada de banco do voluntariado (v7.5) com pool falso: as recusas que acontecem ANTES de qualquer gravação, o que a tela
// vê (e o que não vê: o IP), a escolha de quem recebe cada aviso e os fatos dos avisos periódicos. A auditoria e o motor de avisos
// são simulados. O comportamento contra o banco de verdade (transações, índices, gatilhos) é coberto pelo roteiro ponta a ponta.
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../canaisDb", () => ({ ...jest.requireActual("../canaisDb"), notificarAgora: jest.fn(async () => ({ criadas: 1 })) }));
jest.mock("../trilhas", () => ({ filtrarMembrosQueAtendem: jest.fn(async () => ({ temRequisitos: false, atendem: new Set(), bloqueados: new Map() })) }));
jest.mock("../psc", () => ({ resolverDestinatariosDaCongregacao: jest.fn(async () => []) }));

const db = require("../voluntariadoDb");
const vol = require("../voluntariado");
const { registrarAuditoria } = require("../auditoria");
const { notificarAgora } = require("../canaisDb");
const trilhas = require("../trilhas");
const psc = require("../psc");
const { criarPoolFalso } = require("./testUtils");

const HOJE = "2026-10-01";
const membro = (extra = {}) => ({ MembroId: 20, Nome: "Ana Souza", Email: "ana@exemplo.org", DataNascimento: new Date("1990-04-10T00:00:00Z"), CongregacaoId: 1, CongregacaoNome: "Central", ...extra });
// Quem nasceu `anos` atrás, `dias` depois do aniversário de HOJE: nascidoHa(18) faz 18 anos hoje; nascidoHa(18, 1) faz 18 amanhã (ainda tem 17).
const nascidoHa = (anos, dias = 0) => { const [a, m, d] = HOJE.split("-").map(Number); return new Date(Date.UTC(a - anos, m - 1, d + dias)); };
const adesaoLinha = (extra = {}) => ({
  AdesaoId: 1, MembroId: 20, Forma: "CLICKWRAP", TermoVersao: vol.TERMO_VERSAO, TermoHash: vol.TERMO_HASH, DataAceite: new Date("2026-09-10T00:00:00Z"),
  AceitoEm: new Date("2026-09-10T14:03:00Z"), EnderecoIp: "177.8.9.10", CanalMensageria: null, Referencia: null, RatificacaoId: null, ConvalidaPeriodoAnterior: 0,
  RegistradoPorMembroId: null, RegistradoEm: new Date("2026-09-10T14:03:00Z"), ...extra
});
const rodizioLinha = (extra = {}) => ({
  RodizioId: 5, CongregacaoId: 1, EquipeId: 4, EquipeNome: "Limpeza", Natureza: "ZELADORIA", Nome: "Limpeza do templo", DiaSemana: 6, Hora: "08:00", IntervaloSemanas: 1,
  DataAncora: new Date("2026-10-03T00:00:00Z"), Ativo: 1, GeradoAte: null, CriadoEm: new Date("2026-09-01T10:00:00Z"), ...extra
});
const equipeLinha = (extra = {}) => ({ equipeId: 4, nome: "Limpeza", congregacaoId: 1, liderMembroId: 40, ativa: true, congregacaoNome: "Central", natureza: "ZELADORIA", ...extra });
const global = { global: true, podeCongregacao: () => true };
const local = { global: false, podeCongregacao: (n) => n === "Central" };

beforeEach(() => {
  registrarAuditoria.mockClear(); notificarAgora.mockClear(); psc.resolverDestinatariosDaCongregacao.mockReset(); psc.resolverDestinatariosDaCongregacao.mockResolvedValue([]);
  trilhas.filtrarMembrosQueAtendem.mockClear();
});

// Pool que lança o erro de chave duplicada do SQL Server na N-ésima consulta (para a corrida de dois cliques).
function poolQueFalhaNaConsulta(recordsets, n, numero = 2627) {
  const fila = [...recordsets]; let i = 0;
  return { request: () => { const r = { input: () => r, query: async () => { i++; if (i === n) { const e = new Error("dup"); e.number = numero; throw e; } return { recordset: fila.shift() || [] }; } }; return r; } };
}

describe("o que a pessoa vê do próprio Termo", () => {
  test("sem adesão: o texto vigente e aderiu=false", async () => {
    const s = await db.situacaoDoTermo(criarPoolFalso([[], [membro()]]).pool, 20, { hoje: HOJE });
    expect(s.aderiu).toBe(false);
    expect(s.adesao).toBeNull();
    expect(s.termo.hash).toBe(vol.TERMO_HASH);
    expect(s).toMatchObject({ podeAderirDigital: true, motivoSemAdesaoDigital: null, menorDeIdade: false });
  });
  test("menor de 18 anos: a tela é avisada de que não adere sozinho (e a data de nascimento não sai)", async () => {
    const s = await db.situacaoDoTermo(criarPoolFalso([[], [membro({ DataNascimento: nascidoHa(18, 1) })]]).pool, 20, { hoje: HOJE });
    expect(s).toMatchObject({ podeAderirDigital: false, menorDeIdade: true });
    expect(s.motivoSemAdesaoDigital).toMatch(/responsável/);
    expect(JSON.stringify(s)).not.toMatch(/DataNascimento|2008-/);
    const fez18Hoje = await db.situacaoDoTermo(criarPoolFalso([[], [membro({ DataNascimento: nascidoHa(18) })]]).pool, 20, { hoje: HOJE });
    expect(fez18Hoje.podeAderirDigital).toBe(true);
  });
  test("cadastro sem data de nascimento: não adere sozinho, mas também não é tratado como menor", async () => {
    const s = await db.situacaoDoTermo(criarPoolFalso([[], [membro({ DataNascimento: null })]]).pool, 20, { hoje: HOJE });
    expect(s).toMatchObject({ podeAderirDigital: false, menorDeIdade: false });
    expect(s.motivoSemAdesaoDigital).toMatch(/data de nascimento/);
  });
  test("com adesão: mostra forma, data e integridade — mas NUNCA o IP (prova da Igreja, não conteúdo da tela)", async () => {
    const s = await db.situacaoDoTermo(criarPoolFalso([[adesaoLinha()], [membro()]]).pool, 20, { hoje: HOJE });
    expect(s.aderiu).toBe(true);
    expect(s.adesao).toMatchObject({ forma: "CLICKWRAP", dataAceite: "2026-09-10", integridade: { status: "OK" } });
    expect(s.adesao).not.toHaveProperty("enderecoIp");
    expect(JSON.stringify(s)).not.toContain("177.8.9.10");
  });
  test("a Secretaria, ao registrar, vê o IP do aceite digital", async () => {
    expect(db.mapearAdesao(adesaoLinha(), { comIp: true }).enderecoIp).toBe("177.8.9.10");
  });
});

describe("aceite digital", () => {
  test("sem marcar a caixa, ou sem IP, não grava nada", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect((await db.aceitarDigital(pool, { membroId: 20, aceito: false, ip: "1.2.3.4" })).sucesso).toBe(false);
    expect((await db.aceitarDigital(pool, { membroId: 20, aceito: true, ip: null })).mensagem).toMatch(/IP/);
    expect(chamadas).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("menor de 18 anos, ou sem data de nascimento, não adere pelo aceite digital — e nada é gravado", async () => {
    for (const nasc of [nascidoHa(18, 1), nascidoHa(10), nascidoHa(0), null]) {
      const { pool, chamadas } = criarPoolFalso([[membro({ DataNascimento: nasc })]]);
      const r = await db.aceitarDigital(pool, { membroId: 20, aceito: true, ip: "177.8.9.10", hoje: HOJE });
      expect(r.sucesso).toBe(false);
      expect(r.mensagem).toMatch(nasc ? /responsável/ : /data de nascimento/);
      expect(chamadas).toHaveLength(1);                                           // só leu o cadastro
    }
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("quem faz 18 anos hoje já pode aderir", async () => {
    const { pool, chamadas } = criarPoolFalso([[membro({ DataNascimento: nascidoHa(18) })], [], [{ id: 8 }], [adesaoLinha()]]);
    expect((await db.aceitarDigital(pool, { membroId: 20, aceito: true, ip: "177.8.9.10", hoje: HOJE })).sucesso).toBe(true);
    expect(chamadas[2].sql).toMatch(/INSERT INTO VoluntariadoAdesoes/);
  });
  test("quem já aderiu é avisado, com a data, e nada é gravado de novo", async () => {
    const { pool, chamadas } = criarPoolFalso([[membro()], [adesaoLinha()]]);
    const r = await db.aceitarDigital(pool, { membroId: 20, aceito: true, ip: "1.2.3.4", hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/já aderiu ao Termo em 10\/09\/2026/);
    expect(chamadas).toHaveLength(2);
  });
  test("grava versão, hash, data de Brasília e IP; a auditoria guarda o hash mas não o IP", async () => {
    const { pool, chamadas } = criarPoolFalso([[membro()], [], [{ id: 7 }], [adesaoLinha()]]);
    const cadeia = vol.cadeiaDeCabecalhos({ "x-forwarded-for": "1.2.3.4, 177.8.9.10:24294, 40.70.146.136:36945" });
    const r = await db.aceitarDigital(pool, { membroId: 20, aceito: true, ip: "177.8.9.10", cadeia, hoje: HOJE });
    expect(r.sucesso).toBe(true);
    expect(chamadas[2].sql).toMatch(/INSERT INTO VoluntariadoAdesoes/);
    expect(chamadas[2].inputs).toMatchObject({ m: 20, v: vol.TERMO_VERSAO, h: vol.TERMO_HASH, d: HOJE, ip: "177.8.9.10", cad: cadeia });
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    const aud = registrarAuditoria.mock.calls[0][0];
    expect(aud).toMatchObject({ tabela: "VoluntariadoAdesoes", registroId: 7, acao: "ADESAO_REGISTRADA", usuarioId: 20 });
    expect(JSON.stringify(aud)).not.toContain("177.8.9.10");
    expect(aud.dadosDepois.termoHash).toBe(vol.TERMO_HASH);
  });
  test("dois cliques ao mesmo tempo: o segundo bate no índice único e vira mensagem, não erro 500", async () => {
    const pool = poolQueFalhaNaConsulta([[membro()], []], 3);
    const r = await db.aceitarDigital(pool, { membroId: 20, aceito: true, ip: "1.2.3.4", hoje: HOJE });
    expect(r).toMatchObject({ sucesso: false });
    expect(r.mensagem).toMatch(/já aderiu/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("erro de banco que não é duplicidade sobe (não é engolido)", async () => {
    await expect(db.aceitarDigital(poolQueFalhaNaConsulta([[membro()], []], 3, 547), { membroId: 20, aceito: true, ip: "1.2.3.4", hoje: HOJE })).rejects.toThrow("dup");
  });
});

describe("registro da ficha / mensagem pela Secretaria", () => {
  const dados = (extra = {}) => ({ forma: "FICHA_FISICA", dataAceite: "2026-09-01", referencia: "Ficha nº 142", ...extra });
  test("dado inválido não consulta o banco", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect((await db.registrarAdesaoManual(pool, { membroId: 20, dados: dados({ forma: "CLICKWRAP" }), por: 5, hoje: HOJE })).sucesso).toBe(false);
    expect(chamadas).toHaveLength(0);
  });
  test("membro inexistente e adesão já registrada (com a forma e a data)", async () => {
    expect((await db.registrarAdesaoManual(criarPoolFalso([[]]).pool, { membroId: 20, dados: dados(), por: 5, hoje: HOJE })).mensagem).toMatch(/não encontrado/);
    const r = await db.registrarAdesaoManual(criarPoolFalso([[membro()], [adesaoLinha()]]).pool, { membroId: 20, dados: dados(), por: 5, hoje: HOJE });
    expect(r.mensagem).toMatch(/Ana Souza já tem a adesão registrada em 10\/09\/2026/);
  });
  test("grava a forma, a data da assinatura e quem registrou — sem versão nem hash (o texto é o do documento arquivado)", async () => {
    const { pool, chamadas } = criarPoolFalso([[membro()], [], [{ id: 3 }], [adesaoLinha({ Forma: "FICHA_FISICA", TermoVersao: null, TermoHash: null, EnderecoIp: null, AceitoEm: null, Referencia: "Ficha nº 142", RegistradoPorMembroId: 5 })]]);
    const r = await db.registrarAdesaoManual(pool, { membroId: 20, dados: dados(), por: 5, hoje: HOJE });
    expect(r.sucesso).toBe(true);
    expect(chamadas[2].inputs).toMatchObject({ m: 20, f: "FICHA_FISICA", d: "2026-09-01", ref: "Ficha nº 142", por: 5, c: null, rn: null, rv: null });
    expect(chamadas[2].sql).not.toMatch(/TermoHash/);
    expect(r.adesao.integridade.status).toBe("DOCUMENTO_EXTERNO");
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "ADESAO_REGISTRADA", usuarioId: 5 });
  });
  test("menor de 18 anos sem o responsável: recusa depois de ler o cadastro e não grava nada", async () => {
    const { pool, chamadas } = criarPoolFalso([[membro({ DataNascimento: nascidoHa(18, 1) })]]);
    const r = await db.registrarAdesaoManual(pool, { membroId: 20, dados: dados(), por: 5, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/menos de 18 anos/);
    expect(chamadas).toHaveLength(1);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("menor de 18 anos com o responsável: grava nome e vínculo; a auditoria diz que houve responsável, sem o nome (log imutável não guarda dado pessoal)", async () => {
    const { pool, chamadas } = criarPoolFalso([[membro({ DataNascimento: nascidoHa(15) })], [], [{ id: 4 }], [adesaoLinha({ Forma: "FICHA_FISICA", TermoVersao: null, TermoHash: null, EnderecoIp: null, AceitoEm: null, Referencia: "Ficha nº 143", ResponsavelNome: "Maria Souza", ResponsavelVinculo: "MAE" })]]);
    const r = await db.registrarAdesaoManual(pool, { membroId: 20, dados: dados({ referencia: "Ficha nº 143", responsavelNome: "Maria Souza", responsavelVinculo: "mae" }), por: 5, hoje: HOJE });
    expect(r.sucesso).toBe(true);
    expect(chamadas[2].inputs).toMatchObject({ rn: "Maria Souza", rv: "MAE" });
    expect(r.adesao).toMatchObject({ responsavelNome: "Maria Souza", responsavelVinculo: "MAE", rotuloVinculo: "Mãe" });
    const aud = registrarAuditoria.mock.calls[0][0];
    expect(aud.dadosDepois.comResponsavel).toBe(true);
    expect(JSON.stringify(aud)).not.toContain("Maria");
  });
  test("maior de idade: nome de responsável que vier no corpo é descartado, não gravado", async () => {
    const { pool, chamadas } = criarPoolFalso([[membro()], [], [{ id: 5 }], [adesaoLinha({ Forma: "FICHA_FISICA" })]]);
    await db.registrarAdesaoManual(pool, { membroId: 20, dados: dados({ responsavelNome: "Maria Souza", responsavelVinculo: "MAE" }), por: 5, hoje: HOJE });
    expect(chamadas[2].inputs).toMatchObject({ rn: null, rv: null });
  });
});

describe("ratificação coletiva — recusas antes de gravar", () => {
  const lista = (extra = {}) => ({ origem: "ASSEMBLEIA_GERAL", sessaoId: 9, descricao: "Assembleia Geral de 14/03/2026", dataLista: "2026-03-14", cabecalhoConfirmado: true, ...extra });
  test("sem a confirmação do cabeçalho, nem consulta o banco", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const r = await db.ratificar(pool, { dados: lista({ cabecalhoConfirmado: false }), por: 5, autorizacao: global, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(chamadas).toHaveLength(0);
  });
  test("assembleia e reunião de obreiros só com escopo geral: é 403 (proibido), sem consultar nada", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const r = await db.ratificar(pool, { dados: lista(), por: 5, autorizacao: local, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    expect(r.mensagem).toMatch(/escopo geral/);
    expect(chamadas).toHaveLength(0);
  });
  const sessaoDoDia = { SessaoId: 9, DataSessao: new Date("2026-03-14T00:00:00Z"), OrgaoSigla: "ASSEMBLEIA_GERAL" };
  test("sessão inexistente e lista sem ninguém", async () => {
    expect((await db.ratificar(criarPoolFalso([[]]).pool, { dados: lista(), por: 5, autorizacao: global, hoje: HOJE })).mensagem).toMatch(/Sessão não encontrada/);
    expect((await db.ratificar(criarPoolFalso([[sessaoDoDia], []]).pool, { dados: lista(), por: 5, autorizacao: global, hoje: HOJE })).mensagem).toMatch(/nenhum signatário/);
  });
  test("a origem 'Assembleia Geral' só vale para sessão desse órgão; reunião de obreiros não tem órgão próprio e passa pela data", async () => {
    const outra = { ...sessaoDoDia, OrgaoSigla: "CLI" };
    const r = await db.ratificar(criarPoolFalso([[outra]]).pool, { dados: lista(), por: 5, autorizacao: global, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/não é de Assembleia Geral/);
    const semOrgao = await db.ratificar(criarPoolFalso([[{ ...sessaoDoDia, OrgaoSigla: null }]]).pool, { dados: lista(), por: 5, autorizacao: global, hoje: HOJE });
    expect(semOrgao.mensagem).toMatch(/não é de Assembleia Geral/);
    const obreiros = await db.ratificar(criarPoolFalso([[outra], []]).pool, { dados: lista({ origem: "REUNIAO_OBREIROS" }), por: 5, autorizacao: global, hoje: HOJE });
    expect(obreiros.mensagem).toMatch(/nenhum signatário/);          // passou da checagem de órgão e da data; só falta gente na lista
  });
  test("a data da lista é a da sessão: não se carimba data passada qualquer numa adesão irreversível", async () => {
    const r = await db.ratificar(criarPoolFalso([[sessaoDoDia]]).pool, { dados: lista({ dataLista: "2020-01-05" }), por: 5, autorizacao: global, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/precisa ser a da sessão: 14\/03\/2026/);
  });
  test("a data da lista de escala é a da própria escala", async () => {
    const servico = { servicoId: 11, congregacaoId: 1, dataHora: new Date("2026-09-20T19:00:00Z"), descricao: "x", status: "PUBLICADA" };
    const dados = lista({ origem: "ESCALA_SERVICO", sessaoId: undefined, servicoId: 11, dataLista: "2020-01-05" });
    const r = await db.ratificar(criarPoolFalso([[servico], [{ Nome: "Central" }]]).pool, { dados, por: 5, autorizacao: local, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/precisa ser a da escala: 20\/09\/2026/);
  });
  test("matrícula avulsa de outra congregação recusa o pedido inteiro (403) e nada é gravado", async () => {
    const dados = lista({ origem: "ESCALA_SERVICO", sessaoId: undefined, servicoId: 11, dataLista: "2026-09-20", membroIds: [31, 32] });
    const servico = { servicoId: 11, congregacaoId: 1, dataHora: new Date("2026-09-20T19:00:00Z"), descricao: "x", status: "PUBLICADA" };
    const { pool, chamadas } = criarPoolFalso([[servico], [{ Nome: "Central" }], [{ MembroId: 20 }], [{ MembroId: 31, CongregacaoNome: "Central" }, { MembroId: 32, CongregacaoNome: "Vila Nova" }]]);
    const r = await db.ratificar(pool, { dados, por: 5, autorizacao: local, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    expect(r.mensagem).toMatch(/1 matrícula\(s\) avulsa\(s\) fora do seu escopo de atuação: 32/);
    expect(chamadas.some(c => /INSERT/.test(c.sql))).toBe(false);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("matrícula avulsa sem congregação só passa com escopo geral", async () => {
    const dados = lista({ membroIds: [31] });
    const r = await db.ratificar(criarPoolFalso([[sessaoDoDia], [{ MembroId: 20 }], [{ MembroId: 31, CongregacaoNome: null }]]).pool,
      { dados, por: 5, autorizacao: { global: true, podeCongregacao: (n) => n === "Central" }, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
  });
  test("quem não tem escopo geral só lista as ratificações que registrou", async () => {
    const a = criarPoolFalso([[]]);
    await db.listarRatificacoes(a.pool, { porMembroId: 5 });
    expect(a.chamadas[0].sql).toMatch(/WHERE RegistradoPorMembroId = @por/);
    expect(a.chamadas[0].inputs.por).toBe(5);
    const b = criarPoolFalso([[]]);
    await db.listarRatificacoes(b.pool);
    expect(b.chamadas[0].sql).not.toMatch(/WHERE/);
  });
  test("escala de serviço: serviço inexistente; congregação fora do escopo é 403", async () => {
    const dados = lista({ origem: "ESCALA_SERVICO", sessaoId: undefined, servicoId: 11 });
    expect((await db.ratificar(criarPoolFalso([[]]).pool, { dados, por: 5, autorizacao: local, hoje: HOJE })).mensagem).toMatch(/Serviço não encontrado/);
    const servico = { servicoId: 11, congregacaoId: 2, dataHora: new Date(), descricao: "x", status: "PUBLICADA" };
    const r = await db.ratificar(criarPoolFalso([[servico], [{ Nome: "Vila Nova" }]]).pool, { dados, por: 5, autorizacao: local, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
  });
  test("matrícula avulsa que não existe é ignorada e devolvida; se só ela existia, não há signatário", async () => {
    const dados = lista({ membroIds: [999] });
    const r = await db.ratificar(criarPoolFalso([[sessaoDoDia], [], []]).pool, { dados, por: 5, autorizacao: global, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/nenhum signatário/);
  });
  test("menor de 18 anos não adere assinando lista: se só há menores, recusa e diz quantos; nada é gravado", async () => {
    const menores = [{ MembroId: 20, DataNascimento: nascidoHa(18, 1) }, { MembroId: 21, DataNascimento: nascidoHa(9) }];
    const { pool, chamadas } = criarPoolFalso([[sessaoDoDia], [{ MembroId: 20 }, { MembroId: 21 }], menores]);
    const r = await db.ratificar(pool, { dados: lista(), por: 5, autorizacao: global, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/Todos os signatários são menores de 18 anos \(2\)/);
    expect(r.mensagem).toMatch(/responsável/);
    expect(chamadas.some(c => /INSERT/.test(c.sql))).toBe(false);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("a consulta de menores usa a data do dia (e só olha quem tem data de nascimento): quem não tem data não é tratado como menor", async () => {
    const { pool, chamadas } = criarPoolFalso([[sessaoDoDia], [{ MembroId: 20 }], []]);
    await db.ratificar(pool, { dados: lista(), por: 5, autorizacao: global, hoje: HOJE }).catch(() => {});     // segue para a transação, que o pool falso não tem
    const q = chamadas.find(c => /DataNascimento > DATEADD/.test(c.sql));
    expect(q).toBeTruthy();
    expect(q.sql).toMatch(/DataNascimento IS NOT NULL/);
    expect(q.inputs.hoje).toBe(HOJE);
  });
  test("'já aderiu' conta só a adesão que VALE: a mais recente, e a dada pelo responsável só enquanto a pessoa tem menos de 18 anos", async () => {
    const { pool, chamadas } = criarPoolFalso([[sessaoDoDia], [{ MembroId: 20 }], []]);
    await db.ratificar(pool, { dados: lista(), por: 5, autorizacao: global, hoje: HOJE }).catch(() => {});     // a 4ª consulta ("já aderiu") fica sem resposta: é registrada e a chamada para ali, antes da transação
    const q = chamadas.find(c => /FROM MembroReferencia m JOIN VoluntariadoAdesoes a ON a\.MembroId = m\.MembroId/.test(c.sql));
    expect(q).toBeTruthy();
    expect(q.sql).toMatch(/a\.AdesaoId = \(SELECT MAX\(x\.AdesaoId\) FROM VoluntariadoAdesoes x WHERE x\.MembroId = m\.MembroId\)/);
    expect(q.sql).toMatch(/NOT \(a\.ResponsavelNome IS NOT NULL AND m\.DataNascimento IS NOT NULL AND m\.DataNascimento <= DATEADD\(YEAR, -18, @hoje\)\)/);
    expect(q.inputs.hoje).toBe(HOJE);
  });
});

describe("natureza da equipe", () => {
  test("natureza inválida não grava; a válida grava, audita e explica o que ela implica", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]);
    expect((await db.definirNaturezaEquipe(pool, { equipe: equipeLinha(), natureza: "FAXINA", por: 5 })).sucesso).toBe(false);
    expect(chamadas).toHaveLength(0);
    const r = await db.definirNaturezaEquipe(pool, { equipe: equipeLinha({ natureza: "OUTRA" }), natureza: "zeladoria", por: 5 });
    expect(r.sucesso).toBe(true);
    expect(r.mensagem).toMatch(/revezamento é obrigatório \(Art\. 135 §1º\)/);
    expect(chamadas[0].inputs).toMatchObject({ id: 4, n: "ZELADORIA" });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "NATUREZA_DEFINIDA", dadosAntes: { natureza: "OUTRA" }, dadosDepois: { natureza: "ZELADORIA" } });
    const louvor = await db.definirNaturezaEquipe(criarPoolFalso([[]]).pool, { equipe: equipeLinha(), natureza: "LITURGIA", por: 5 });
    expect(louvor.mensagem).not.toMatch(/obrigatório/);
  });
});

describe("rodízio — criar", () => {
  const dados = (extra = {}) => ({ nome: "Limpeza do templo", equipeId: 4, diaSemana: 6, hora: "08:00", dataAncora: "2026-10-03", ...extra });
  test("dado inválido não consulta; equipe inexistente, de outra congregação ou inativa", async () => {
    const vazio = criarPoolFalso([]);
    expect((await db.criarRodizio(vazio.pool, { dados: dados({ hora: "8h" }), congregacaoId: 1, por: 5 })).sucesso).toBe(false);
    expect(vazio.chamadas).toHaveLength(0);
    expect((await db.criarRodizio(criarPoolFalso([[]]).pool, { dados: dados(), congregacaoId: 1, por: 5 })).mensagem).toMatch(/Equipe não encontrada/);
    expect((await db.criarRodizio(criarPoolFalso([[equipeLinha({ congregacaoId: 2 })]]).pool, { dados: dados(), congregacaoId: 1, por: 5 })).mensagem).toMatch(/não é desta congregação/);
    expect((await db.criarRodizio(criarPoolFalso([[equipeLinha({ ativa: false })]]).pool, { dados: dados(), congregacaoId: 1, por: 5 })).mensagem).toMatch(/inativa/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("grava com o dia, a hora, o intervalo e a âncora", async () => {
    const { pool, chamadas } = criarPoolFalso([[equipeLinha()], [{ n: 3 }], [{ id: 5 }]]);
    const r = await db.criarRodizio(pool, { dados: dados({ intervaloSemanas: 2 }), congregacaoId: 1, por: 5 });
    expect(r).toMatchObject({ sucesso: true, rodizioId: 5 });
    expect(chamadas[2].inputs).toMatchObject({ c: 1, e: 4, n: "Limpeza do templo", dia: 6, h: "08:00", i: 2, a: "2026-10-03", por: 5 });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ tabela: "EscalasRodizios", registroId: 5, acao: "RODIZIO_CRIADO" });
  });
  test("teto de rodízios ativos por congregação: o 51º é recusado sem gravar", async () => {
    const { pool, chamadas } = criarPoolFalso([[equipeLinha()], [{ n: vol.MAX_RODIZIOS_POR_CONGREGACAO }]]);
    const r = await db.criarRodizio(pool, { dados: dados(), congregacaoId: 1, por: 5 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/até 50 rodízios ativos/);
    expect(chamadas.some(c => /INSERT/.test(c.sql))).toBe(false);
  });
  test("ativar/desativar: repetir o estado não faz nada", async () => {
    const rodizio = db.mapearAdesao && { rodizioId: 5, ativo: true };
    expect((await db.alterarAtivoRodizio(criarPoolFalso([]).pool, { rodizio, ativo: true, por: 5 })).mensagem).toMatch(/já está ativo/);
    expect((await db.alterarAtivoRodizio(criarPoolFalso([]).pool, { rodizio: { rodizioId: 5, ativo: false }, ativo: false, por: 5 })).mensagem).toMatch(/já está desativado/);
    const { pool, chamadas } = criarPoolFalso([[]]);
    expect((await db.alterarAtivoRodizio(pool, { rodizio, ativo: false, por: 5 })).mensagem).toMatch(/nada novo será gerado/);
    expect(chamadas[0].inputs).toMatchObject({ id: 5, a: 0 });
  });
});

describe("grupo — quem pode entrar", () => {
  const rodizio = { rodizioId: 5, equipeId: 4, ativo: true };
  const grupo = { grupoId: 11, nome: "Grupo A", ativo: true };
  test("rodízio ou grupo desativado não recebe ninguém", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect((await db.adicionarMembroAoGrupo(pool, { rodizio: { ...rodizio, ativo: false }, grupo, membroId: 20, por: 5 })).mensagem).toMatch(/rodízio está desativado/);
    expect((await db.adicionarMembroAoGrupo(pool, { rodizio, grupo: { ...grupo, ativo: false }, membroId: 20, por: 5 })).mensagem).toMatch(/grupo está desativado/);
    expect(chamadas).toHaveLength(0);
  });
  test("matrícula inexistente", async () => {
    expect((await db.adicionarMembroAoGrupo(criarPoolFalso([[]]).pool, { rodizio, grupo, membroId: 20, por: 5 })).mensagem).toMatch(/Matrícula 20 não encontrada/);
  });
  test("quem foi removido da escala desta equipe NÃO volta pela porta do grupo", async () => {
    const r = await db.adicionarMembroAoGrupo(criarPoolFalso([[membro()], [{ DesligamentoId: 3, DesligadoEm: new Date("2026-09-20T12:00:00Z") }]]).pool, { rodizio, grupo, membroId: 20, por: 5 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/Ana Souza foi removido\(a\) da escala desta equipe em 20\/09\/2026/);
    expect(r.mensagem).toMatch(/Reintegre/);
  });
  test("a formação que a equipe exige (v6.9) vale para quem entra por um grupo", async () => {
    trilhas.filtrarMembrosQueAtendem.mockResolvedValueOnce({ temRequisitos: true, atendem: new Set(), bloqueados: new Map([[20, "Falta a trilha de Recepção."]]) });
    const r = await db.adicionarMembroAoGrupo(criarPoolFalso([[membro()], []]).pool, { rodizio, grupo, membroId: 20, por: 5 });
    expect(r.mensagem).toBe("Ana Souza: Falta a trilha de Recepção.");
    expect(trilhas.filtrarMembrosQueAtendem.mock.calls[0][1]).toMatchObject({ contexto: "ESCALA_EQUIPE", alvoChave: "4", membroIds: [20] });
  });
  test("a mesma pessoa não fica em dois grupos do mesmo rodízio (grupos distintos se alternam)", async () => {
    const r = await db.adicionarMembroAoGrupo(criarPoolFalso([[membro()], [], [{ Nome: "Grupo B" }]]).pool, { rodizio, grupo, membroId: 20, por: 5 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/já está no grupo “Grupo B”/);
  });
  test("entra no grupo, vira membro ativo da equipe e a ação é auditada", async () => {
    const { pool, chamadas } = criarPoolFalso([[membro()], [], [], [{ n: 3 }], [], []]);
    const r = await db.adicionarMembroAoGrupo(pool, { rodizio, grupo, membroId: 20, por: 5 });
    expect(r).toMatchObject({ sucesso: true });
    expect(chamadas[4].sql).toMatch(/INSERT INTO EscalasRodizioGrupoMembros/);
    expect(chamadas[5].sql).toMatch(/EscalasEquipeMembros/);
    expect(chamadas[5].sql).not.toMatch(/FrequenciaPreferidaDias/);   // não zera a frequência que a pessoa já tinha
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "MEMBRO_ENTROU_NO_GRUPO", registroId: 11 });
  });
  test("índice único estourando na corrida vira mensagem", async () => {
    const pool = poolQueFalhaNaConsulta([[membro()], [], [], [{ n: 3 }]], 5, 2601);
    const r = await db.adicionarMembroAoGrupo(pool, { rodizio, grupo, membroId: 20, por: 5 });
    expect(r.mensagem).toMatch(/já está em um grupo/);
  });
  test("o voluntário também precisa estar no escopo de quem o coloca: 403, sem nome e sem gravar", async () => {
    const { pool, chamadas } = criarPoolFalso([[membro({ CongregacaoNome: "Vila Nova" })]]);
    const r = await db.adicionarMembroAoGrupo(pool, { rodizio, grupo, membroId: 20, por: 5, podeCongregacao: (n) => n === "Central" });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    expect(r.mensagem).not.toContain("Ana");
    expect(chamadas).toHaveLength(1);
  });
  test("grupo cheio: o 151º voluntário é recusado", async () => {
    const r = await db.adicionarMembroAoGrupo(criarPoolFalso([[membro()], [], [], [{ n: vol.MAX_MEMBROS_POR_GRUPO }]]).pool, { rodizio, grupo, membroId: 20, por: 5 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/até 150 voluntários/);
  });
  test("criar grupo com voluntários demais de uma vez é recusado antes de gravar", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const r = await db.criarGrupo(pool, { rodizio, nome: "Grupo X", membroIds: Array.from({ length: 101 }, (_, i) => i + 1), por: 5 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/até 100 voluntários/);
    expect(chamadas).toHaveLength(0);
  });
  test("criar grupo: nome, limite de grupos e nome repetido", async () => {
    expect((await db.criarGrupo(criarPoolFalso([]).pool, { rodizio: { ...rodizio, ativo: false }, nome: "A", por: 5 })).mensagem).toMatch(/desativado/);
    expect((await db.criarGrupo(criarPoolFalso([]).pool, { rodizio, nome: "", por: 5 })).mensagem).toMatch(/nome ao grupo/);
    expect((await db.criarGrupo(criarPoolFalso([[{ n: vol.MAX_GRUPOS, maxOrdem: 12 }]]).pool, { rodizio, nome: "Grupo M", por: 5 })).mensagem).toMatch(/até 12 grupos/);
    const dup = await db.criarGrupo(poolQueFalhaNaConsulta([[{ n: 1, maxOrdem: 1 }]], 2, 2601), { rodizio, nome: "Grupo A", por: 5 });
    expect(dup.mensagem).toMatch(/Já existe um grupo “Grupo A”/);
  });
  test("criar grupo com voluntários: devolve quem não entrou e por quê", async () => {
    const { pool } = criarPoolFalso([[{ n: 1, maxOrdem: 1 }], [{ id: 12 }], [], [] /* membro 20 inexistente */]);
    const r = await db.criarGrupo(pool, { rodizio, nome: "Grupo B", membroIds: [20], por: 5 });
    expect(r.sucesso).toBe(true);
    expect(r.grupoId).toBe(12);
    expect(r.recusados).toEqual([{ membroId: 20, mensagem: expect.stringMatching(/não encontrada/) }]);
    expect(r.mensagem).toMatch(/1 voluntário\(s\) não entraram/);
  });
  test("retirar do grupo quem não está nele", async () => {
    const { pool } = criarPoolFalso([[]]);
    pool.request = () => { const r = { input: () => r, query: async () => ({ recordset: [], rowsAffected: [0] }) }; return r; };
    expect((await db.removerMembroDoGrupo(pool, { rodizio, grupo, membroId: 20, por: 5 })).mensagem).toMatch(/não está neste grupo/);
  });
  test("desativar grupo já desativado", async () => {
    expect((await db.desativarGrupo(criarPoolFalso([]).pool, { rodizio, grupo: { ...grupo, ativo: false }, por: 5 })).mensagem).toMatch(/já está desativado/);
  });
});

describe("geração do rodízio — recusas e prévia", () => {
  const grupoLinha = (id, nome, ordem) => ({ GrupoId: id, RodizioId: 5, Nome: nome, Ordem: ordem });
  const membroGrupo = (grupoId, membroId, nome) => ({ GrupoId: grupoId, MembroId: membroId, Nome: nome });
  test("semanas fora do limite não consulta o banco", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect((await db.previaGeracao(pool, { rodizioId: 5, semanas: 99, hoje: HOJE })).sucesso).toBe(false);
    expect((await db.gerarRodizio(pool, { rodizioId: 5, dados: { semanas: 0 }, por: 5, hoje: HOJE })).sucesso).toBe(false);
    expect(chamadas).toHaveLength(0);
  });
  test("rodízio inexistente, desativado ou com um grupo só", async () => {
    expect((await db.previaGeracao(criarPoolFalso([[]]).pool, { rodizioId: 5, hoje: HOJE })).mensagem).toMatch(/Rodízio não encontrado/);
    expect((await db.gerarRodizio(criarPoolFalso([[rodizioLinha({ Ativo: 0 })], [], []]).pool, { rodizioId: 5, dados: {}, por: 5, hoje: HOJE })).mensagem).toMatch(/desativado/);
    const umGrupo = criarPoolFalso([[rodizioLinha()], [grupoLinha(11, "Grupo A", 1)], [membroGrupo(11, 20, "Ana")]]);
    expect((await db.gerarRodizio(umGrupo.pool, { rodizioId: 5, dados: {}, por: 5, hoje: HOJE })).mensagem).toMatch(/pelo menos dois grupos distintos/);
    const vazio = criarPoolFalso([[rodizioLinha()], [grupoLinha(11, "Grupo A", 1), grupoLinha(12, "Grupo B", 2)], [membroGrupo(11, 20, "Ana")]]);
    expect((await db.previaGeracao(vazio.pool, { rodizioId: 5, hoje: HOJE })).mensagem).toMatch(/“Grupo B” está sem voluntários/);
  });
  test("a prévia mostra as datas da vez sem gravar, e descarta as que já têm serviço", async () => {
    const { pool, chamadas } = criarPoolFalso([
      [rodizioLinha()],
      [grupoLinha(11, "Grupo A", 1), grupoLinha(12, "Grupo B", 2)],
      [membroGrupo(11, 20, "Ana"), membroGrupo(12, 21, "Beto")],
      [{ DataHora: new Date("2026-10-10T08:00:00Z") }]
    ]);
    const r = await db.previaGeracao(pool, { rodizioId: 5, semanas: 4, hoje: HOJE });
    expect(r.sucesso).toBe(true);
    expect(r.ocorrencias.map(o => [o.dataIso, o.grupoNome])).toEqual([["2026-10-03", "Grupo A"], ["2026-10-17", "Grupo A"], ["2026-10-24", "Grupo B"]]);
    expect(r.jaExistem).toEqual(["2026-10-10"]);
    expect(chamadas.some(c => /INSERT|UPDATE/.test(c.sql))).toBe(false);
  });
  test("cancelar futuros sem rascunho a cancelar", async () => {
    const r = await db.cancelarServicosFuturos(criarPoolFalso([[]]).pool, { rodizio: { rodizioId: 5 }, por: 5, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/publicado não se cancela/);
  });
});

describe("remoção da escala — recusas antes de gravar", () => {
  const dados = (extra = {}) => ({ membroId: 20, motivo: "Faltas repetidas sem aviso", tipoMotivo: "PERDA_CONFIANCA", ...extra });
  const vinculo = (extra = {}) => ({ EquipeId: 4, Nome: "Limpeza", LiderMembroId: 40, CongregacaoId: 1, CongregacaoNome: "Central", ...extra });
  test("ninguém se remove; motivo é obrigatório; voluntário inexistente", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect((await db.removerDaEscala(pool, { dados: dados({ membroId: 5 }), por: 5, hoje: HOJE })).mensagem).toMatch(/remove a si mesmo/);
    expect((await db.removerDaEscala(pool, { dados: dados({ motivo: "x" }), por: 5, hoje: HOJE })).mensagem).toMatch(/motivo/);
    expect(chamadas).toHaveLength(0);
    expect((await db.removerDaEscala(criarPoolFalso([[]]).pool, { dados: dados(), por: 5, hoje: HOJE })).mensagem).toMatch(/não está ativo em nenhuma equipe que você alcance/);
  });
  test("as recusas não citam nome nem distinguem 'não existe' de 'não é da equipe' (senão o líder varreria matrículas para descobrir nomes)", async () => {
    const naoExiste = await db.removerDaEscala(criarPoolFalso([[]]).pool, { dados: dados(), equipeId: 9, por: 5, hoje: HOJE });
    const naoEhDaEquipe = await db.removerDaEscala(criarPoolFalso([[membro()], [vinculo()]]).pool, { dados: dados(), equipeId: 9, por: 5, hoje: HOJE });
    const nenhumaEquipe = await db.removerDaEscala(criarPoolFalso([[membro()], []]).pool, { dados: dados(), equipeId: 9, por: 5, hoje: HOJE });
    expect(naoExiste.mensagem).toBe("Esse voluntário não está ativo nessa equipe.");
    expect(naoEhDaEquipe.mensagem).toBe(naoExiste.mensagem);
    expect(nenhumaEquipe.mensagem).toBe(naoExiste.mensagem);
    for (const r of [naoExiste, naoEhDaEquipe, nenhumaEquipe]) expect(r.mensagem).not.toContain("Ana");
  });
  test("a pessoa não está em equipe nenhuma, ou não está na equipe pedida", async () => {
    expect((await db.removerDaEscala(criarPoolFalso([[membro()], []]).pool, { dados: dados(), por: 5, hoje: HOJE })).mensagem).toMatch(/não está ativo em nenhuma equipe que você alcance/);
    expect((await db.removerDaEscala(criarPoolFalso([[membro()], [vinculo()]]).pool, { dados: dados(), equipeId: 9, por: 5, hoje: HOJE })).mensagem).toMatch(/não está ativo nessa equipe/);
  });
  test("o escopo de quem remove filtra as equipes: equipe de outra congregação não é tocada", async () => {
    const r = await db.removerDaEscala(criarPoolFalso([[membro()], [vinculo({ CongregacaoNome: "Vila Nova", CongregacaoId: 2 })]]).pool, { dados: dados(), podeCongregacao: (n) => n === "Central", por: 5, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/que você alcance/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
    expect(notificarAgora).not.toHaveBeenCalled();
  });
});

describe("reintegração", () => {
  const rem = (extra = {}) => ({ DesligamentoId: 3, MembroId: 20, MembroNome: "Ana Souza", EquipeId: 4, EquipeNome: "Limpeza", RemovidoDaEscala: 1, ReintegradoEm: null, CongregacaoId: 1, LiderMembroId: 40, ...extra });
  test("registro inexistente, que não removeu ninguém, já reintegrado, observação longa", async () => {
    expect((await db.reintegrar(criarPoolFalso([[]]).pool, { desligamentoId: 3, por: 5, hoje: HOJE })).mensagem).toMatch(/não encontrado/);
    expect((await db.reintegrar(criarPoolFalso([[rem({ RemovidoDaEscala: 0 })]]).pool, { desligamentoId: 3, por: 5, hoje: HOJE })).mensagem).toMatch(/não removeu ninguém/);
    expect((await db.reintegrar(criarPoolFalso([[rem({ EquipeId: null })]]).pool, { desligamentoId: 3, por: 5, hoje: HOJE })).mensagem).toMatch(/não removeu ninguém/);
    expect((await db.reintegrar(criarPoolFalso([[rem({ ReintegradoEm: new Date("2026-09-25T10:00:00Z") })]]).pool, { desligamentoId: 3, por: 5, hoje: HOJE })).mensagem).toMatch(/já foi reintegrado\(a\) em 25\/09\/2026/);
    expect((await db.reintegrar(criarPoolFalso([[rem()]]).pool, { desligamentoId: 3, observacao: "x".repeat(301), por: 5, hoje: HOJE })).mensagem).toMatch(/300 caracteres/);
  });
  test("ninguém reintegra a si mesmo (nem a gestão, nem o líder removido)", async () => {
    const { pool, chamadas } = criarPoolFalso([[rem({ MembroId: 5 })]]);
    const r = await db.reintegrar(pool, { desligamentoId: 3, por: 5, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    expect(r.mensagem).toMatch(/Ninguém reintegra a si mesmo/);
    expect(chamadas).toHaveLength(1);                 // só leu o registro; nada foi gravado
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe("recusa num serviço de rodízio", () => {
  const alocacao = { alocacaoId: 77, equipeId: 4, membroId: 20 };
  const servico = { dataHora: new Date("2026-10-10T08:00:00Z") };
  test("o líder é avisado da vaga (referência = a alocação), em vez de o convite em cadeia trazer alguém de fora do grupo", async () => {
    const { pool } = criarPoolFalso([[equipeLinha()], [membro({ MembroId: 40, Nome: "Líder Lima", Email: "lider@exemplo.org" })], [membro()]]);
    await db.avisarRecusaEmRodizio(pool, { alocacao, servico });
    expect(notificarAgora).toHaveBeenCalledTimes(1);
    const a = notificarAgora.mock.calls[0][1];
    expect(a).toMatchObject({ regraChave: "ESCALA_VAGA_ABERTA", referenciaId: 77, referenciaTabela: "EscalasAlocacoes", destinatarios: [{ membroId: 40, nome: "Líder Lima", email: "lider@exemplo.org" }] });
    expect(a.mensagem).toMatch(/Ana Souza recusou a escala/);
    expect(a.mensagem).toMatch(/sem penalidade/);
  });
  test("se quem recusou é o próprio líder, ninguém é incomodado", async () => {
    const r = await db.avisarRecusaEmRodizio(criarPoolFalso([[equipeLinha({ liderMembroId: 20 })]]).pool, { alocacao, servico });
    expect(r).toEqual({ criadas: 0 });
    expect(notificarAgora).not.toHaveBeenCalled();
  });
});

describe("líder removido da própria equipe perde os poderes de líder dela", () => {
  const equipe = { equipeId: 4, liderMembroId: 40 };
  test("o líder que não foi removido continua líder; outra pessoa nunca é", async () => {
    expect(await db.liderAtivo(criarPoolFalso([[]]).pool, { equipe, membroId: 40 })).toBe(true);
    expect(await db.liderAtivo(criarPoolFalso([]).pool, { equipe, membroId: 41 })).toBe(false);     // nem consulta o banco
    expect(await db.liderAtivo(criarPoolFalso([]).pool, { equipe: null, membroId: 40 })).toBe(false);
  });
  test("removido e ainda não reintegrado: deixa de ser líder ativo", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ DesligamentoId: 3, DesligadoEm: new Date("2026-09-20T12:00:00Z") }]]);
    expect(await db.liderAtivo(pool, { equipe, membroId: 40 })).toBe(false);
    expect(chamadas[0].sql).toMatch(/RemovidoDaEscala = 1 AND ReintegradoEm IS NULL/);
    expect(chamadas[0].inputs).toMatchObject({ m: 40, e: 4 });
  });
  test("quem não lidera nenhuma equipe ativa é identificado (para recusar com 403 sem revelar nada)", async () => {
    expect(await db.lideraAlgumaEquipe(criarPoolFalso([[]]).pool, { membroId: 20 })).toBe(false);
    expect(await db.lideraAlgumaEquipe(criarPoolFalso([[{ ok: 1 }]]).pool, { membroId: 40 })).toBe(true);
  });
  test("a lista de equipes que eu lidero já exclui as equipes de onde fui removido", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]);
    await db.equipesLideradas(pool, { membroId: 40 });
    expect(chamadas[0].sql).toMatch(/NOT EXISTS \(SELECT 1 FROM VoluntariosDesligamentos d WHERE d\.MembroId = e\.LiderMembroId AND d\.EquipeId = e\.EquipeId AND d\.RemovidoDaEscala = 1 AND d\.ReintegradoEm IS NULL\)/);
  });
});

describe("remoção — consulta de quem foi removido", () => {
  test("removidoDaEquipe devolve o registro aberto mais recente, ou null", async () => {
    expect(await db.removidoDaEquipe(criarPoolFalso([[]]).pool, { membroId: 20, equipeId: 4 })).toBeNull();
    const r = await db.removidoDaEquipe(criarPoolFalso([[{ DesligamentoId: 3, DesligadoEm: new Date("2026-09-20T12:00:00Z") }]]).pool, { membroId: 20, equipeId: 4 });
    expect(r).toEqual({ desligamentoId: 3, desligadoEm: "2026-09-20T12:00:00.000Z" });
  });
  test("a consulta só olha remoção ainda não reintegrada", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]);
    await db.removidoDaEquipe(pool, { membroId: 20, equipeId: 4 });
    expect(chamadas[0].sql).toMatch(/RemovidoDaEscala = 1 AND ReintegradoEm IS NULL/);
  });
});

describe("habitualidade (leitura) e limite configurável", () => {
  const linha = (servicoId, dia, membroId, status = "ACEITO", extra = {}) => ({
    EquipeId: 4, EquipeNome: "Limpeza", Natureza: "ZELADORIA", CongregacaoId: 1, LiderMembroId: 40, ServicoId: servicoId, DataHora: new Date(`2026-10-${dia}T08:00:00Z`),
    MembroId: membroId, Status: status, MembroNome: `Voluntário ${membroId}`, TemRodizio: 0, ...extra
  });
  test("o limite vem da tabela de prazos e o padrão é 3", async () => {
    expect(await db.lerLimiteSequencia(criarPoolFalso([[]]).pool)).toBe(3);
    expect(await db.lerLimiteSequencia(criarPoolFalso([[{ Dias: 2 }]]).pool)).toBe(2);
    expect(await db.lerLimiteSequencia(criarPoolFalso([[{ Dias: 0 }]]).pool)).toBe(3);
  });
  test("a janela é de 90 dias atrás a 30 à frente, e só equipes operacionais entram na consulta", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ Dias: 3 }], []]);
    await db.habitualidade(pool, { congregacaoId: 1, hoje: HOJE });
    expect(chamadas[1].inputs).toMatchObject({ de: "2026-07-03", ate: "2026-10-31", c: 1 });
    expect(chamadas[1].sql).toMatch(/Natureza IN \('ZELADORIA','PORTARIA','COZINHA'\)/);
    expect(chamadas[1].sql).toMatch(/s\.Status <> 'CANCELADA'/);
  });
  test("quem está nas 3 últimas escalas seguidas é apontado, com o nome; os demais não", async () => {
    const linhas = [linha(1, "03", 10), linha(1, "03", 11), linha(2, "10", 10), linha(2, "10", 12), linha(3, "17", 10), linha(3, "17", 13)];
    const r = await db.habitualidade(criarPoolFalso([[{ Dias: 3 }], linhas]).pool, { hoje: HOJE });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ equipeId: 4, equipeNome: "Limpeza", rotuloNatureza: "Zeladoria e limpeza", temRodizio: false, limite: 3 });
    expect(r[0].itens).toEqual([{ membroId: 10, nome: "Voluntário 10", sequencia: 3, desde: "2026-10-03T08:00:00.000Z", ate: "2026-10-17T08:00:00.000Z" }]);
  });
  test("recusar ou ser cancelado quebra a sequência, mas o serviço continua sendo da equipe", async () => {
    const linhas = [linha(1, "03", 10), linha(2, "10", 10), linha(3, "17", 10, "RECUSADO"), linha(3, "17", 13)];
    expect(await db.habitualidade(criarPoolFalso([[{ Dias: 3 }], linhas]).pool, { hoje: HOJE })).toEqual([]);
  });
  test("com limite menor na tabela de prazos, o mesmo histórico já acusa", async () => {
    const linhas = [linha(1, "03", 10), linha(2, "10", 10), linha(3, "17", 13)];
    expect(await db.habitualidade(criarPoolFalso([[{ Dias: 3 }], linhas]).pool, { hoje: HOJE })).toEqual([]);
    const r = await db.habitualidade(criarPoolFalso([[{ Dias: 2 }], [linha(1, "03", 10), linha(2, "10", 10), linha(3, "17", 10)]]).pool, { hoje: HOJE });
    expect(r[0].itens[0]).toMatchObject({ membroId: 10, sequencia: 3 });
  });
  test("equipe com rodízio ativo aparece como tal (para a tela dizer que o problema é o grupo, não a falta de rodízio)", async () => {
    const linhas = [linha(1, "03", 10, "ACEITO", { TemRodizio: 1 }), linha(2, "10", 10, "ACEITO", { TemRodizio: 1 }), linha(3, "17", 10, "ACEITO", { TemRodizio: 1 })];
    expect((await db.habitualidade(criarPoolFalso([[{ Dias: 3 }], linhas]).pool, { hoje: HOJE }))[0].temRodizio).toBe(true);
  });
});

describe("avisos periódicos", () => {
  const linha = (servicoId, dia, membroId) => ({
    EquipeId: 4, EquipeNome: "Limpeza", Natureza: "ZELADORIA", CongregacaoId: 1, LiderMembroId: 40, ServicoId: servicoId, DataHora: new Date(`2026-10-${dia}T08:00:00Z`),
    MembroId: membroId, Status: "ACEITO", MembroNome: `Voluntário ${membroId}`, TemRodizio: 0
  });
  test("habitualidade: um aviso por equipe e por mês, para os administradores de escala da congregação E para o líder", async () => {
    psc.resolverDestinatariosDaCongregacao.mockResolvedValue([{ membroId: 9, nome: "Secretário", email: "sec@exemplo.org" }]);
    const { pool } = criarPoolFalso([[{ Dias: 3 }], [linha(1, "03", 10), linha(2, "10", 10), linha(3, "17", 10)], [membro({ MembroId: 40, Nome: "Líder Lima", Email: "l@exemplo.org" })]]);
    const fatos = await db.detectarHabitualidade(pool, { hoje: HOJE });
    expect(psc.resolverDestinatariosDaCongregacao).toHaveBeenCalledWith(pool, { permissao: "escalas", congregacaoId: 1 });
    expect(fatos).toHaveLength(1);
    expect(fatos[0].referenciaId).toBe(4 * 10000 + (26 * 12 + 10));
    expect(fatos[0].destinatarios.map(d => d.membroId).sort((a, b) => a - b)).toEqual([9, 40]);
    expect(fatos[0].fatoGerador).toMatch(/Equipe Limpeza: Voluntário 10 \(3 seguidas\)/);
  });
  test("habitualidade: o aviso do mês seguinte tem outra chave (volta a avisar enquanto durar)", async () => {
    psc.resolverDestinatariosDaCongregacao.mockResolvedValue([{ membroId: 9, nome: "S", email: null }]);
    const montar = () => criarPoolFalso([[{ Dias: 3 }], [linha(1, "03", 10), linha(2, "10", 10), linha(3, "17", 10)], [membro({ MembroId: 40 })]]).pool;
    const outubro = (await db.detectarHabitualidade(montar(), { hoje: "2026-10-01" }))[0].referenciaId;
    const novembro = (await db.detectarHabitualidade(montar(), { hoje: "2026-11-01" }))[0].referenciaId;
    expect(novembro).toBe(outubro + 1);
  });
  test("habitualidade: sem ninguém para avisar, o fato não é gerado; sem alerta, não há fato", async () => {
    psc.resolverDestinatariosDaCongregacao.mockResolvedValue([]);
    const semLider = criarPoolFalso([[{ Dias: 3 }], [linha(1, "03", 10), linha(2, "10", 10), linha(3, "17", 10)], []]).pool;
    expect(await db.detectarHabitualidade(semLider, { hoje: HOJE })).toEqual([]);
    expect(await db.detectarHabitualidade(criarPoolFalso([[{ Dias: 3 }], []]).pool, { hoje: HOJE })).toEqual([]);
  });
  test("Termo pendente: um aviso por congregação e por mês, só para quem cuida da habilitação lá; congregação sem destinatário é pulada", async () => {
    psc.resolverDestinatariosDaCongregacao.mockImplementation(async (_p, { congregacaoId }) => congregacaoId === 1 ? [{ membroId: 9, nome: "Hab", email: "h@exemplo.org" }] : []);
    const linhas = [
      { CongregacaoId: 1, CongregacaoNome: "Central", MembroId: 3, Nome: "Ana" }, { CongregacaoId: 1, CongregacaoNome: "Central", MembroId: 4, Nome: "Beto" },
      { CongregacaoId: 2, CongregacaoNome: "Vila Nova", MembroId: 5, Nome: "Caio" }
    ];
    const fatos = await db.detectarTermosPendentes(criarPoolFalso([linhas]).pool, { hoje: HOJE });
    expect(psc.resolverDestinatariosDaCongregacao).toHaveBeenCalledWith(expect.anything(), { permissao: "habilitacao_voluntarios", congregacaoId: 1 });
    expect(fatos).toHaveLength(1);
    expect(fatos[0].referenciaId).toBe(1 * 10000 + 322);
    expect(fatos[0].destinatarios).toEqual([{ membroId: 9, nome: "Hab", email: "h@exemplo.org" }]);
    expect(fatos[0].fatoGerador).toMatch(/2 voluntário\(s\) de Central servem em escalas sem o Termo de Adesão registrado \(Lei 9\.608\/98, art\. 2º\): Ana, Beto/);
  });
  test("Termo pendente: lista só 5 nomes e conta o resto", async () => {
    psc.resolverDestinatariosDaCongregacao.mockResolvedValue([{ membroId: 9, nome: "H", email: null }]);
    const linhas = Array.from({ length: 8 }, (_, i) => ({ CongregacaoId: 1, CongregacaoNome: "Central", MembroId: i + 1, Nome: `V${i + 1}` }));
    const [fato] = await db.detectarTermosPendentes(criarPoolFalso([linhas]).pool, { hoje: HOJE });
    expect(fato.fatoGerador).toMatch(/8 voluntário\(s\)/);
    expect(fato.fatoGerador).toMatch(/V1, V2, V3, V4, V5 e mais 3/);
  });
  test("Termo pendente: quem só tem adesão dada pelo responsável e completou 18 anos volta a contar como pendente (mesma regra de vigência)", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]);
    await db.detectarTermosPendentes(pool, { hoje: HOJE });
    expect(chamadas[0].sql).toMatch(/LEFT JOIN VoluntariadoAdesoes a ON a\.MembroId = m\.MembroId/);
    expect(chamadas[0].sql).toMatch(/SELECT MAX\(x\.AdesaoId\) FROM VoluntariadoAdesoes x WHERE x\.MembroId = m\.MembroId/);
    expect(chamadas[0].sql).toMatch(/NOT \(a\.ResponsavelNome IS NOT NULL AND m\.DataNascimento IS NOT NULL AND m\.DataNascimento <= DATEADD\(YEAR, -18, @hoje\)\)/);
    expect(chamadas[0].sql).toMatch(/a\.AdesaoId IS NULL/);
    expect(chamadas[0].inputs.hoje).toBe(HOJE);
  });
  test("Termo pendente: todo mundo aderiu, nada a avisar", async () => {
    expect(await db.detectarTermosPendentes(criarPoolFalso([[]]).pool, { hoje: HOJE })).toEqual([]);
  });
});

describe("equipes que eu lidero (tela do dirigente)", () => {
  test("quem não lidera nada recebe lista vazia, sem consultas à toa", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]);
    expect(await db.equipesLideradas(pool, { membroId: 20 })).toEqual([]);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].sql).toMatch(/LiderMembroId = @m AND e\.Ativa = 1/);
  });
  test("traz os voluntários ativos e as remoções de CADA equipe, separados", async () => {
    const eqs = [{ EquipeId: 4, Nome: "Limpeza", Natureza: "ZELADORIA", CongregacaoNome: "Central" }, { EquipeId: 5, Nome: "Portaria", Natureza: "PORTARIA", CongregacaoNome: "Central" }];
    const membros = [{ EquipeId: 4, MembroId: 1, Nome: "Ana" }, { EquipeId: 5, MembroId: 2, Nome: "Beto" }, { EquipeId: 4, MembroId: 3, Nome: "Caio" }];
    const rem = [{ DesligamentoId: 9, MembroId: 7, MembroNome: "Dora", EquipeId: 5, EquipeNome: "Portaria", TipoMotivo: "PERDA_CONFIANCA", Motivo: "Faltas", AlocacoesCanceladas: 2, DesligadoEm: new Date("2026-09-20T12:00:00Z"), RegistradoPorMembroId: 20, ReintegradoEm: null, ReintegracaoObs: null }];
    const r = await db.equipesLideradas(criarPoolFalso([eqs, membros, rem]).pool, { membroId: 20 });
    expect(r.map(e => [e.nome, e.rotuloNatureza, e.membros.map(m => m.nome)])).toEqual([["Limpeza", "Zeladoria e limpeza", ["Ana", "Caio"]], ["Portaria", "Portaria, recepção e segurança", ["Beto"]]]);
    expect(r[0].remocoes).toEqual([]);
    expect(r[1].remocoes).toMatchObject([{ desligamentoId: 9, membroNome: "Dora", podeReintegrar: true, alocacoesCanceladas: 2 }]);
  });
});

describe("cobertura do Termo (tela da Secretaria)", () => {
  test("conta quem aderiu e quem não, sem-termo primeiro na lista", async () => {
    const linhas = [
      { MembroId: 3, Nome: "Ana", DataNascimento: new Date("1985-03-02T00:00:00Z"), Equipes: "Limpeza, Portaria", AdesaoId: null, Forma: null, DataAceite: null, Referencia: null },
      { MembroId: 4, Nome: "Beto", DataNascimento: null, Equipes: "Limpeza", AdesaoId: 2, Forma: "FICHA_FISICA", DataAceite: new Date("2026-08-01T00:00:00Z"), Referencia: "Ficha 9" }
    ];
    const r = await db.coberturaDoTermo(criarPoolFalso([linhas]).pool, { congregacaoId: 1, hoje: HOJE });
    expect(r).toMatchObject({ total: 2, comTermo: 1, semTermo: 1 });
    expect(r.voluntarios[0]).toMatchObject({ nome: "Ana", aderiu: false, forma: null, equipes: "Limpeza, Portaria", menor: false });
    expect(r.voluntarios[1]).toMatchObject({ nome: "Beto", aderiu: true, rotuloForma: "Cláusula de Voluntariado na Ficha de Membro assinada", dataAceite: "2026-08-01", menor: false });
  });
  test("marca quem tem menos de 18 anos (a Secretaria precisa do responsável), sem expor a data de nascimento", async () => {
    const linhas = [
      { MembroId: 5, Nome: "Caio", DataNascimento: nascidoHa(18, 1), Equipes: "Som", AdesaoId: null, Forma: null, DataAceite: null, Referencia: null },
      { MembroId: 6, Nome: "Dora", DataNascimento: nascidoHa(18), Equipes: "Som", AdesaoId: null, Forma: null, DataAceite: null, Referencia: null }
    ];
    const r = await db.coberturaDoTermo(criarPoolFalso([linhas]).pool, { congregacaoId: 1, hoje: HOJE });
    expect(r.voluntarios.map(x => [x.nome, x.menor])).toEqual([["Caio", true], ["Dora", false]]);
    expect(JSON.stringify(r)).not.toMatch(/DataNascimento|2008-/);
  });
});

describe("retenção do IP do aceite digital (LGPD art. 16)", () => {
  test("usa o prazo configurado (padrão 5 anos), só anonimiza quem não serve mais e audita a contagem — sem dado pessoal", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ Dias: 1000 }], [{ total: 3 }]]);
    const r = await db.anonimizarIpsVencidos(pool, { hoje: HOJE });
    expect(r).toEqual({ anonimizados: 3, retencaoDias: 1000 });
    const up = chamadas[1];
    expect(up.inputs).toMatchObject({ hoje: HOJE, dias: 1000 });
    expect(up.sql).toMatch(/SET EnderecoIp = N'anonimizado', CadeiaCabecalhos = NULL/);
    expect(up.sql).toMatch(/a\.Forma IN \('CLICKWRAP', 'CLICK_RESP'\)/);           // o IP do aceite do responsável também vence
    expect(up.sql).toMatch(/a\.DataAceite < DATEADD\(DAY, -@dias, @hoje\)/);
    expect(up.sql).toMatch(/NOT EXISTS \(SELECT 1 FROM EscalasEquipeMembros em WHERE em\.MembroId = a\.MembroId AND em\.Ativo = 1\)/);
    expect(up.sql).toMatch(/s\.DataHora >= DATEADD\(DAY, -@dias, @hoje\)/);
    expect(up.sql).not.toMatch(/DELETE/i);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    const aud = registrarAuditoria.mock.calls[0][0];
    expect(aud).toMatchObject({ tabela: "VoluntariadoAdesoes", registroId: 0, acao: "IP_ANONIMIZADO", usuarioId: null });
    expect(aud.dadosDepois).toEqual({ quantidade: 3, retencaoDias: 1000, referencia: HOJE });
  });
  test("sem parâmetro cadastrado, vale o padrão de 1825 dias; sem nada a anonimizar, não audita", async () => {
    const { pool } = criarPoolFalso([[], [{ total: 0 }]]);
    expect(await db.anonimizarIpsVencidos(pool, { hoje: HOJE })).toEqual({ anonimizados: 0, retencaoDias: 1825 });
    expect(vol.IP_RETENCAO_DIAS_PADRAO).toBe(1825);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("prazo fora do aceitável (0, negativo, absurdo) cai no padrão: nunca anonimiza todo mundo por um parâmetro errado", async () => {
    for (const Dias of [0, -5, 99999, "abc"]) {
      const { pool, chamadas } = criarPoolFalso([[{ Dias }], [{ total: 0 }]]);
      await db.anonimizarIpsVencidos(pool, { hoje: HOJE });
      expect(chamadas[1].inputs.dias).toBe(1825);
    }
  });
});

describe("afastamento (Art. 133 §7º, II)", () => {
  test("período que já passou não tem escalas a liberar", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect(await db.conflitosDoAfastamento(pool, { membroId: 20, dataInicio: "2026-09-01", dataFim: "2026-09-10", hoje: HOJE })).toEqual([]);
    expect(chamadas).toHaveLength(0);
  });
  test("o recorte nunca começa antes de hoje (escala passada não se libera)", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]);
    await db.conflitosDoAfastamento(pool, { membroId: 20, dataInicio: "2026-09-01", dataFim: "2026-10-31", hoje: HOJE });
    expect(chamadas[0].inputs).toMatchObject({ m: 20, de: HOJE, ate: "2026-10-31" });
    expect(chamadas[0].sql).toMatch(/a\.Status IN \('CONVIDADO','ACEITO','CONFIRMADO'\)/);
    expect(chamadas[0].sql).toMatch(/s\.Status <> 'CANCELADA'/);
  });
  test("período futuro começa na data inicial; sem conflito, liberar não faz nada", async () => {
    const { pool, chamadas } = criarPoolFalso([[], []]);
    await db.conflitosDoAfastamento(pool, { membroId: 20, dataInicio: "2026-11-01", dataFim: "2026-11-30", hoje: HOJE });
    expect(chamadas[0].inputs.de).toBe("2026-11-01");
    expect(await db.liberarPorAfastamento(pool, { membroId: 20, dataInicio: "2026-11-01", dataFim: "2026-11-30", por: 20, hoje: HOJE })).toEqual({ liberadas: 0, vagas: [] });
    expect(registrarAuditoria).not.toHaveBeenCalled();
    expect(notificarAgora).not.toHaveBeenCalled();
  });
});

describe("mensagem de quem foi removido", () => {
  test("cita a data e manda reintegrar antes", () => {
    expect(db.mensagemRemovido({ desligadoEm: "2026-09-20T12:00:00.000Z" }, "Ana")).toBe("Ana foi removido(a) da escala desta equipe em 20/09/2026. Reintegre-o(a) antes de escalar de novo (registro de remoções).");
  });
});
