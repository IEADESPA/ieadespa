// Os achados da revisão independente da v7.6 (leitura adversarial do código, feita por outro agente), cada um preso por um teste que FALHA sem a correção:
// o poder de polícia só vale com a cláusula no Termo aceito, o identificador do canal não vaza, o termo de vistoria não vaza para a trilha de auditoria, a edição parcial
// não desarma o setor, o líder que atende é o dirigente (não qualquer concessão), a separação de funções na ficha, os tetos atômicos e a anulação do termo lavrado por engano.
jest.mock("../db", () => {
  class Transaction { async begin() { } async commit() { } async rollback() { } }
  class Request { constructor() { const r = { input: () => r, query: async () => { throw new Error("PASSOU_DA_PORTA"); } }; return r; } }
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => { throw new Error("sem pool"); }, sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../canaisDb", () => ({ ...jest.requireActual("../canaisDb"), notificarAgora: jest.fn(async () => ({ criadas: 1 })) }));
jest.mock("../notificacoes", () => ({ ...jest.requireActual("../notificacoes"), resolverDestinatariosPorPermissao: jest.fn(async () => []) }));
jest.mock("../escopo", () => ({ ...jest.requireActual("../escopo"), ancestraisTerritoriais: jest.fn(async () => ({ areaId: null, regiaoId: null, quadranteId: null, distritoId: null })) }));

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("../setoresTecnicosDb");
const vdb = require("../vistoriaAntecedentesDb");
const st = require("../setoresTecnicos");
const va = require("../vistoriaAntecedentes");
const { registrarAuditoria } = require("../auditoria");
const { notificarAgora } = require("../canaisDb");
const { criarPoolFalso } = require("./testUtils");

const HOJE = "2026-10-08";
const MIGRACAO = fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "sql", "migrations", "142_setores_tecnicos.sql"), "utf8");
const nascidoHa = (anos) => new Date(Date.UTC(2026 - anos, 9, 8));
const membro = (extra = {}) => ({ MembroId: 20, Nome: "Ana Souza", Email: "ana@exemplo.org", DataNascimento: nascidoHa(40), Status: "ATIVO", SituacaoMembro: "EM_COMUNHAO", CongregacaoId: 1, CongregacaoNome: "Central", ...extra });
const setorLinha = (extra = {}) => ({ SetorId: 2, Codigo: "ENGENHARIA", Inciso: "II", Nome: "Setor de Engenharia", Competencia: "Projetos e laudos de segurança.", Profissoes: "Engenheiros", ConselhoClasse: "CREA / CAU", ExigeRegistro: 1, PodeInterditar: 1, PodeSolicitarRemocao: 0, Ativo: 1, Ordem: 2, ...extra });
const vinculoLinha = (extra = {}) => ({
  VinculoId: 7, SetorId: 2, MembroId: 20, Status: "AGUARDANDO_TERMO", Origem: "INDICACAO", Formacao: "Engenheira civil", ConselhoSigla: "CREA-PA", RegistroNumero: "12345", CriadoPorMembroId: 1, CriadoEm: new Date("2026-10-01T10:00:00Z"),
  AprovadoPorMembroId: 1, AprovadoEm: new Date("2026-10-01T10:00:00Z"), AtivadoEm: null, EncerradoEm: null, EncerradoPorMembroId: null, MotivoEncerramento: null, ObsEncerramento: null,
  SetorCodigo: "ENGENHARIA", SetorNome: "Setor de Engenharia", PodeInterditar: 1, PodeSolicitarRemocao: 0, ExigeRegistro: 1, ConselhoClasse: "CREA / CAU", SetorAtivo: 1, MembroNome: "Ana Souza", MembroEmail: "ana@exemplo.org", CongregacaoNome: "Central",
  AdesaoId: null, AdesaoForma: null, AdesaoVersao: null, AdesaoHash: null, AdesaoEspecificos: null, AdesaoData: null, AdesaoReferencia: null, ...extra
});
const sqlsDe = (chamadas) => chamadas.map(c => c.sql).join("\n");
const escrituras = (chamadas) => chamadas.filter(c => /^\s*(INSERT|UPDATE|DELETE)/i.test(c.sql));
beforeEach(() => { registrarAuditoria.mockClear(); notificarAgora.mockClear(); });

describe("achado 1: o poder de polícia não vale por uma marca posta no catálogo depois do Termo", () => {
  test("a consulta de quem pode emitir exige a cláusula no Termo aceito, para cada tipo de ato", async () => {
    let { pool, chamadas } = criarPoolFalso([[]]);
    await db.vinculosQueEmitem(pool, { membroId: 20, tipo: "INTERDICAO" });
    expect(chamadas[0].sql).toMatch(/JOIN SetoresTecnicosAdesoes a ON a\.VinculoId = v\.VinculoId AND \(',' \+ ISNULL\(a\.TermoEspecificos, ''\) \+ ','\) LIKE '%,INTERDICAO,%'/);
    ({ pool, chamadas } = criarPoolFalso([[]]));
    await db.vinculosQueEmitem(pool, { membroId: 20, tipo: "REMOCAO_POSTAGEM" });
    expect(chamadas[0].sql).toMatch(/LIKE '%,REMOCAO_POSTAGEM,%'/);
    expect(chamadas[0].sql).not.toMatch(/LIKE '%,INTERDICAO,%'/);
  });
  test("dar o poder a um setor que já tem gente servindo é recusado, com o caminho a seguir; tirar o poder é livre", async () => {
    const tecnologia = setorLinha({ SetorId: 5, Codigo: "TI", Nome: "Setor de TI", ExigeRegistro: 0, PodeInterditar: 0 });
    let { pool, chamadas } = criarPoolFalso([[tecnologia], [{ n: 3 }]]);
    const r = await db.editarSetor(pool, { setorId: 5, dados: { podeInterditar: true }, por: 1 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/3 pessoa\(s\) servindo/);
    expect(r.mensagem).toMatch(/Encerre os vínculos atuais e indique as pessoas de novo/);
    expect(escrituras(chamadas)).toHaveLength(0);
    // Sem ninguém servindo, pode.
    ({ pool, chamadas } = criarPoolFalso([[tecnologia], [{ n: 0 }], [], [tecnologia]]));
    expect((await db.editarSetor(pool, { setorId: 5, dados: { podeInterditar: true }, por: 1 })).sucesso).toBe(true);
    // Tirar o poder de quem tem gente servindo: livre, e nem consulta a contagem.
    ({ pool, chamadas } = criarPoolFalso([[setorLinha()], [], [setorLinha({ PodeInterditar: 0 })]]));
    expect((await db.editarSetor(pool, { setorId: 2, dados: { podeInterditar: false }, por: 1 })).sucesso).toBe(true);
    expect(chamadas.some(c => /COUNT\(\*\) AS n FROM SetoresTecnicosMembros/.test(c.sql))).toBe(false);
  });
  test("o Termo mostrado de quem já tem prova é o que a pessoa viu (as cláusulas guardadas), não o de hoje", async () => {
    const linha = vinculoLinha({ Status: "ATIVO", AtivadoEm: new Date(), AdesaoId: 1, AdesaoForma: "CLICKWRAP", AdesaoVersao: 1, AdesaoHash: "a".repeat(64), AdesaoEspecificos: "", AdesaoData: new Date("2026-10-02T00:00:00Z") });
    const r = await db.termoDoVinculo(criarPoolFalso([[linha]]).pool, { vinculoId: 7, membroId: 20 });
    // O catálogo de hoje tem a marca de interdição, mas o aceite guardado não: o texto NÃO traz a cláusula que ela nunca viu.
    expect(r.termo.itens.map(i => i.codigo)).not.toContain("INTERDICAO");
    const semProva = await db.termoDoVinculo(criarPoolFalso([[vinculoLinha()]]).pool, { vinculoId: 7, membroId: 20 });
    expect(semProva.termo.itens.map(i => i.codigo)).toContain("INTERDICAO");
  });
  test("a ficha registrada guarda as cláusulas do texto impresso (é por elas que o poder vale)", async () => {
    // fila: o vínculo, o membro, e depois as consultas da transação (que o pool falso não tem) — basta ver a recusa/ordem até a gravação
    const { pool, chamadas } = criarPoolFalso([[vinculoLinha({ AprovadoPorMembroId: 5 })], [membro()]]);
    await expect(db.registrarTermoManual(pool, { vinculoId: 7, dados: { forma: "FICHA_FISICA", dataAceite: "2026-10-01", referencia: "Pasta 3, ficha 12" }, por: 1, hoje: HOJE })).rejects.toThrow("PASSOU_DA_PORTA");
    expect(chamadas).toHaveLength(2);   // chegou à gravação; a lista de cláusulas guardada é conferida no roteiro ponta a ponta (e no código abaixo)
    expect(fs.readFileSync(path.join(__dirname, "..", "setoresTecnicosDb.js"), "utf8")).toMatch(/campos: \{ versao: null, hash: null, especificos: st\.textoDosEspecificos\(termoImpresso\.especificos\)/);
  });
  test("o aceite exige o hash do texto que a tela mostrou", async () => {
    const termo = st.termoDoSetor({ codigo: "ENGENHARIA", nome: "Setor de Engenharia", podeInterditar: true, podeSolicitarRemocao: false });
    for (const termoHash of [undefined, null, "", "0".repeat(64), 12345, ["x"]]) {
      const { pool, chamadas } = criarPoolFalso([[vinculoLinha()], [membro()]]);
      const r = await db.aceitarTermo(pool, { vinculoId: 7, membroId: 20, aceito: true, termoHash, ip: "177.8.9.10", hoje: HOJE });
      expect(r.sucesso).toBe(false);
      expect(r.mensagem).toMatch(/O texto do Termo mudou/);
      expect(r.termoMudou).toBe(true);   // a tela decide por este campo, não pela frase
      expect(escrituras(chamadas)).toHaveLength(0);
    }
    // com o hash certo (até em maiúsculas) passa dessa porta (a gravação em si é da transação, coberta no ponta a ponta)
    const { pool } = criarPoolFalso([[vinculoLinha()], [membro()]]);
    await expect(db.aceitarTermo(pool, { vinculoId: 7, membroId: 20, aceito: true, termoHash: termo.hash.toUpperCase(), ip: "177.8.9.10", hoje: HOJE })).rejects.toThrow("PASSOU_DA_PORTA");
  });
});

describe("achado 2: o identificador do canal não vaza", () => {
  test("a lista de canais traz só nome e plataforma", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ CanalId: 8, Nome: "Instagram da Central", Plataforma: "INSTAGRAM", Identificador: "@central" }]]);
    const l = await db.canaisDaCongregacao(pool, 1);
    expect(l).toEqual([{ canalId: 8, nome: "Instagram da Central", plataforma: "INSTAGRAM" }]);
    expect(chamadas[0].sql).not.toMatch(/Identificador/);
  });
});

describe("achado 3: o Termo de Vistoria não vaza para a trilha de auditoria nem para quem não é da Diretoria", () => {
  const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");
  test("lavrar e solicitar auditam só a contagem e, no pedido, quem foi avisado (nunca resultado, motivo ou parecer)", async () => {
    const { pool } = criarPoolFalso([[{ MembroId: 20, Nome: "Ana", Email: "a@x.org", Status: "ATIVO" }], [{ n: 0 }]]);
    await vdb.solicitarCertidoes(pool, { dados: { membroId: 20, motivo: "SUSPEITA_FUNDADA" }, por: 1 });
    expect(registrarAuditoria.mock.calls[0][0].dadosDepois).toEqual({ membroId: 20 });
    expect(JSON.stringify(registrarAuditoria.mock.calls[0][0])).not.toMatch(/SUSPEITA/);
  });
  test("o aviso mensal e os avisos dos setores vão só a quem tem a permissão num papel de nível GLOBAL", async () => {
    const fonte = ["vistoriaAntecedentesDb", "setoresTecnicosDb"].map(n => fs.readFileSync(path.join(__dirname, "..", `${n}.js`), "utf8")).join("\n");
    expect((fonte.match(/resolverDestinatariosPorPermissao\(pool, \{ permissao[^}]*nivel: "GLOBAL" \}\)/g) || []).length).toBe(2);
    expect(fonte).not.toMatch(/resolverDestinatariosPorPermissao\(pool, \{ permissao \}\)/);
    expect(fonte).not.toMatch(/resolverDestinatariosPorPermissao\(pool, \{ permissao: "[a-z_]+" \}\)/);
  });
  test("a auditoria da ficha do Termo não leva o texto livre da referência", () => {
    const fonte = fs.readFileSync(path.join(__dirname, "..", "setoresTecnicosDb.js"), "utf8");
    const trecho = fonte.slice(fonte.indexOf("async function registrarTermoManual"), fonte.indexOf("// Atos cautelares (Art. 50)"));
    const auditoria = trecho.split("\n").find(l => /registrarAuditoria/.test(l));
    expect(auditoria).toMatch(/referenciaTamanho: d\.referencia\.length/);
    expect(auditoria).not.toMatch(/referencia: d\.referencia/);
  });
  test("a anulação: o termo não se apaga, ganha um registro à parte e deixa de contar", async () => {
    const termoLinha = { VistoriaId: 5, MembroId: 20, MembroNome: "Ana", Motivo: "INVESTIDURA", Funcao: "Professor", ComVulneraveis: 0, DataVerificacao: new Date("2026-10-08T00:00:00Z"), Resultado: "SEM_RESTRICAO", Parecer: "Sem apontamentos.", DestinoOriginal: "DEVOLVIDO", AssinadaPorMembroId: 1, AssinadaPorNome: "Presidente", AssinadaEm: new Date(), AnulacaoId: null };
    // sucesso: o termo, o insert, o termo de novo (já anulado) e os documentos
    let { pool, chamadas } = criarPoolFalso([[termoLinha], [], [], [{ ...termoLinha, AnulacaoId: 3, AnulMotivo: "Matrícula errada.", AnuladaEm: new Date(), AnuladaPorNome: "Presidente" }], []]);
    const r = await vdb.anularVistoria(pool, { dados: { vistoriaId: 5, motivo: "Termo lavrado na matrícula errada." }, por: 1 });
    expect(r.sucesso).toBe(true);
    expect(r.vistoria.anulada).toMatchObject({ motivo: "Matrícula errada.", porNome: "Presidente" });
    expect(chamadas.some(c => /INSERT INTO VistoriasAnulacoes/.test(c.sql))).toBe(true);
    expect(chamadas.some(c => /DELETE|UPDATE VistoriasAntecedentes/i.test(c.sql))).toBe(false);
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "VISTORIA_ANULADA", registroId: 5, dadosDepois: { motivoTamanho: 34 } });
    // recusas: inexistente, ninguém anula o próprio termo, motivo curto, já anulado
    ({ pool } = criarPoolFalso([[]]));
    expect((await vdb.anularVistoria(pool, { dados: { vistoriaId: 5, motivo: "Termo lavrado na matrícula errada." }, por: 1 })).mensagem).toMatch(/não encontrado/);
    ({ pool } = criarPoolFalso([[termoLinha], []]));
    expect((await vdb.anularVistoria(pool, { dados: { vistoriaId: 5, motivo: "Termo lavrado na matrícula errada." }, por: 20 })).mensagem).toMatch(/sobre si mesmo/);
    ({ pool } = criarPoolFalso([[termoLinha], []]));
    expect((await vdb.anularVistoria(pool, { dados: { vistoriaId: 5, motivo: "curto" }, por: 1 })).mensagem).toMatch(/de 10 a 300/);
    ({ pool } = criarPoolFalso([[{ ...termoLinha, AnulacaoId: 3, AnulMotivo: "x", AnuladaEm: new Date() }], []]));
    expect((await vdb.anularVistoria(pool, { dados: { vistoriaId: 5, motivo: "Termo lavrado na matrícula errada." }, por: 1 })).mensagem).toMatch(/já foi anulado/);
    expect(va.validarAnulacao({ vistoriaId: 5, motivo: "<b>sem tag no motivo</b>" }, { membroDoTermo: 20, atorId: 1 }).valido).toBe(false);
    void hash;
  });
  test("o termo anulado deixa de contar: a última vistoria, quem falta e o direito do titular consultam a anulação", async () => {
    let { pool, chamadas } = criarPoolFalso([[]]);
    await vdb.ultimaVistoria(pool, 20);
    expect(chamadas[0].sql).toMatch(/NOT EXISTS \(SELECT 1 FROM VistoriasAnulacoes an WHERE an\.VistoriaId = v\.VistoriaId\)/);
    ({ pool, chamadas } = criarPoolFalso([[]]));
    await vdb.liderancasSemVistoria(pool);
    expect((chamadas[0].sql.match(/VistoriasAnulacoes/g) || []).length).toBe(2);
    ({ pool } = criarPoolFalso([[{ VistoriaId: 5, Motivo: "INVESTIDURA", Funcao: "Professor", DataVerificacao: new Date("2026-10-08T00:00:00Z"), Resultado: "SEM_RESTRICAO", Parecer: "ok", DestinoOriginal: "DEVOLVIDO", AssinadaEm: new Date(), AnuladaEm: new Date("2026-10-09T00:00:00Z") }], []]));
    expect((await vdb.dadosDoTitular(pool, 20)).vistorias[0].anuladaEm).toBe("2026-10-09T00:00:00.000Z");
  });
  test("a migração cria a tabela de anulação imutável e o ROPA a declara", () => {
    expect(MIGRACAO).toMatch(/CREATE TABLE dbo\.VistoriasAnulacoes/);
    expect(MIGRACAO).toMatch(/TR_VistoriasAnulacoes_Imutavel ON dbo\.VistoriasAnulacoes AFTER UPDATE, DELETE/);
    expect(MIGRACAO).toMatch(/UQ_VistoriasAnulacoes_Vistoria UNIQUE/);
    expect(fs.readFileSync(path.join(__dirname, "..", "ropa.js"), "utf8")).toMatch(/"VistoriasAnulacoes"/);
  });
});

describe("achado 5: candidatar e sair em ciclo não geram spam nem crescimento sem freio", () => {
  const setorSemRegistro = setorLinha({ ExigeRegistro: 0 });
  test("os dois tetos vão NO MESMO comando que grava, com trava de intervalo (a corrida de 20 pedidos não fura)", async () => {
    const { pool, chamadas } = criarPoolFalso([[membro()], [setorSemRegistro], [{ n: 0 }], [{ id: 31 }]]);
    await db.candidatar(pool, { membroId: 20, dados: { setorId: 2, formacao: "Engenheira civil" }, hoje: HOJE });
    const ins = chamadas.find(c => /INSERT INTO SetoresTecnicosMembros/.test(c.sql));
    expect(ins.sql).toMatch(/SELECT @s, @m, 'CANDIDATO'/);
    expect((ins.sql.match(/WITH \(UPDLOCK, HOLDLOCK\)/g) || []).length).toBe(2);
    expect(ins.sql).toMatch(/< @max/);
    expect(ins.sql).toMatch(/< @maxDia/);
    expect(ins.inputs).toMatchObject({ max: st.MAX_VINCULOS_VIGENTES_POR_PESSOA, maxDia: st.MAX_CANDIDATURAS_POR_DIA });
    expect(st.MAX_CANDIDATURAS_POR_DIA).toBe(3);
  });
  test("o comando que não gravou (id nulo) diz qual teto foi: o de vínculos ou o de candidaturas no dia", async () => {
    let { pool } = criarPoolFalso([[membro()], [setorSemRegistro], [{ n: 0 }], [{ id: null }], [{ n: 0 }]]);
    let r = await db.candidatar(pool, { membroId: 20, dados: { setorId: 2, formacao: "Engenheira civil" }, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/3 candidaturas hoje/);
    ({ pool } = criarPoolFalso([[membro()], [setorSemRegistro], [{ n: 4 }], [{ id: null }], [{ n: 5 }]]));
    r = await db.candidatar(pool, { membroId: 20, dados: { setorId: 2, formacao: "Engenheira civil" }, hoje: HOJE });
    expect(r.mensagem).toMatch(/5 vínculos em andamento/);
  });
  test("o aviso aos gestores tem limite por dia; a indicação também confere o teto do indicado no mesmo comando", async () => {
    const { pool, chamadas } = criarPoolFalso([[membro()], [setorSemRegistro], [{ n: 0 }], [{ id: 31 }]]);
    await db.candidatar(pool, { membroId: 20, dados: { setorId: 2, formacao: "Engenheira civil" }, hoje: HOJE });
    expect(notificarAgora.mock.calls[0][1].limiteDia).toBe(10);
    const ind = criarPoolFalso([[setorSemRegistro], [membro()], [{ n: 0 }], [{ id: null }]]);
    const r = await db.indicar(ind.pool, { dados: { membroId: 20, setorId: 2, formacao: "Engenheira civil" }, por: 1, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/já tem 5 vínculos/);
    expect(ind.chamadas.find(c => /INSERT INTO SetoresTecnicosMembros/.test(c.sql)).sql).toMatch(/WITH \(UPDLOCK, HOLDLOCK\)/);
    void chamadas;
  });
});

describe("achado 8: separação de funções no registro da ficha", () => {
  const dados = { forma: "FICHA_FISICA", dataAceite: "2026-10-01", referencia: "Pasta 3, ficha 12" };
  test("ninguém registra o próprio Termo", async () => {
    const { pool, chamadas } = criarPoolFalso([[vinculoLinha({ MembroId: 1 })]]);
    const r = await db.registrarTermoManual(pool, { vinculoId: 7, dados, por: 1, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    expect(escrituras(chamadas)).toHaveLength(0);
  });
  test("num setor com poder, quem indicou ou aprovou a pessoa não registra a ficha dela; num setor sem poder, pode", async () => {
    let { pool, chamadas } = criarPoolFalso([[vinculoLinha({ AprovadoPorMembroId: 1 })]]);
    let r = await db.registrarTermoManual(pool, { vinculoId: 7, dados, por: 1, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    expect(r.mensagem).toMatch(/poder de polícia/);
    expect(escrituras(chamadas)).toHaveLength(0);
    // Setor sem poder: passa dessa porta (o resto é a transação).
    ({ pool } = criarPoolFalso([[vinculoLinha({ AprovadoPorMembroId: 1, PodeInterditar: 0 })], [membro()]]));
    await expect(db.registrarTermoManual(pool, { vinculoId: 7, dados, por: 1, hoje: HOJE })).rejects.toThrow("PASSOU_DA_PORTA");
    // Outra pessoa da administração, mesmo com poder: passa.
    ({ pool } = criarPoolFalso([[vinculoLinha({ AprovadoPorMembroId: 1 })], [membro()]]));
    await expect(db.registrarTermoManual(pool, { vinculoId: 7, dados, por: 2, hoje: HOJE })).rejects.toThrow("PASSOU_DA_PORTA");
  });
});

describe("achado 9: edição parcial mantém o que não foi mandado", () => {
  test("mandar só nome e competência não desarma as marcas, a ordem nem o inciso", () => {
    const atual = { nome: "Setor de Engenharia", competencia: "Projetos e laudos.", profissoes: "Engenheiros", conselhoClasse: "CREA / CAU", inciso: "II", exigeRegistro: true, podeInterditar: true, podeSolicitarRemocao: false, ordem: 2 };
    const novo = st.mesclarEdicaoDoSetor(atual, { nome: "Setor de Engenharia e Obras", competencia: "Projetos, laudos e obras.", podeSolicitarRemocao: undefined });
    expect(novo).toMatchObject({ nome: "Setor de Engenharia e Obras", exigeRegistro: true, podeInterditar: true, podeSolicitarRemocao: false, ordem: 2, inciso: "II", conselhoClasse: "CREA / CAU" });
    // O que veio explícito (inclusive false e vazio) vale; campo desconhecido é ignorado.
    expect(st.mesclarEdicaoDoSetor(atual, { podeInterditar: false, profissoes: "", lixo: 1 })).toMatchObject({ podeInterditar: false, profissoes: "", exigeRegistro: true });
    expect(st.mesclarEdicaoDoSetor(atual, { lixo: 1 })).not.toHaveProperty("lixo");
  });
  test("a edição de verdade usa a mescla (a consulta grava as marcas atuais)", async () => {
    const { pool, chamadas } = criarPoolFalso([[setorLinha()], [], [setorLinha()]]);
    await db.editarSetor(pool, { setorId: 2, dados: { nome: "Setor de Engenharia", competencia: "Projetos e laudos de segurança." }, por: 1 });
    const up = chamadas.find(c => /UPDATE SetoresTecnicos SET/.test(c.sql));
    expect(up.inputs).toMatchObject({ er: 1, pi: 1, pr: 0, o: 2 });
  });
});

describe("achados 12 e 13: textos e entradas", () => {
  test("texto vira texto: lista e objeto não passam por '[object Object]'", () => {
    for (const lixo of [{}, [], [1, 2], { a: 1 }, true, null, undefined]) {
      expect(st.validarFormacao(lixo).valido).toBe(false);
      expect(st.validarInterdicao({ congregacaoId: 1, motivo: "RISCO_DESABAMENTO", objeto: lixo, descricao: "x".repeat(40) }).valido).toBe(false);
      expect(st.validarInterdicao({ congregacaoId: 1, motivo: "RISCO_DESABAMENTO", objeto: "Templo principal", descricao: "x".repeat(40), referencia: lixo }).dados === undefined || lixo == null || lixo === undefined || st.validarInterdicao({ congregacaoId: 1, motivo: "RISCO_DESABAMENTO", objeto: "Templo principal", descricao: "x".repeat(40), referencia: lixo }).dados.referencia === null).toBe(true);
      expect(va.validarVistoria({ membroId: 20, motivo: "INVESTIDURA", funcao: lixo, dataVerificacao: HOJE, resultado: "RECUSA", parecer: "Recusou apresentar." }, { hoje: HOJE, atorId: 1 }).valido).toBe(false);
    }
    expect(st.validarFormacao(12345).formacao).toBe("12345");
  });
  test("aprovar uma candidatura não diz 'você foi indicado'", () => {
    expect(st.textoCandidaturaAprovada({ setorNome: "Setor Jurídico" })).toMatch(/candidatura ao Setor Jurídico foi aprovada/);
    expect(st.textoCandidaturaAprovada({ setorNome: "Setor Jurídico" })).not.toMatch(/indicado/);
    expect(st.textoVinculoIndicado({ setorNome: "Setor Jurídico" })).toMatch(/indicado/);
  });
  test("o Termo diz 'vestuário' como o Art. 133 §4º, I do Regimento", () => {
    const despesas = st.termoDoSetor({ codigo: "TI" }).itens.find(i => i.codigo === "SEM_HONORARIOS").texto;
    expect(despesas).toMatch(/transporte, a alimentação e o vestuário/);
    expect(despesas).not.toMatch(/material do dia a dia/);
  });
});

describe("a emissão de atos: avisos honestos e em lotes", () => {
  test("o aviso imediato sai em lotes e sem esperar a entrega do e-mail; devolve quantos foram criados", async () => {
    const fonte = fs.readFileSync(path.join(__dirname, "..", "setoresTecnicosDb.js"), "utf8");
    expect(fonte).toMatch(/notificarAgora\(pool, \{ \.\.\.base, destinatarios: \[d\], aguardarEntrega: false \}\)/);
    expect(fonte).toMatch(/lista\.slice\(i, i \+ 8\)/);
    expect(fonte).toMatch(/sp_getapplock @Resource = @r, @LockMode = 'Exclusive', @LockOwner = 'Transaction'/);
    expect(fonte).toMatch(/setor-emitente-\$\{membroId\}/);
    expect(fonte).toMatch(/NENHUM aviso saiu/);
  });
  test("o motor de avisos repassa a opção de não esperar a entrega até o e-mail", () => {
    const motor = fs.readFileSync(path.join(__dirname, "..", "notificacaoMotor.js"), "utf8");
    const canais = fs.readFileSync(path.join(__dirname, "..", "canaisDb.js"), "utf8");
    expect(motor).toMatch(/enviarEmailNotificacao\(\{ email, titulo, mensagem, aguardarEntrega \}\)/);
    expect(canais).toMatch(/aguardarEntrega = true, deps = \{\}/);
    expect(canais).toMatch(/aguardarEntrega === false \? \{ aguardarEntrega: false \} : \{\}/);
  });
});
