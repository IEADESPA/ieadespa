// FASE 10, v10.1b (migração 174) — a ficha por dentro: o CPF (conferido, mascarado; inteiro só para a Secretaria Geral, com a leitura registrada), a filiação, a
// escolaridade e a matrícula gerada pelo sistema. O banco é simulado por TEXTO da consulta; o comportamento contra o SQL Server de verdade está no roteiro ponta a
// ponta (tools/e2e-localdb/e2e-85-ficha-cpf-matricula.js).
let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => ({
  getPool: async () => ({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (texto) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor] of mockRegras) if (padrao.test(texto)) return typeof valor === "function" ? valor(inputs) : valor;
    return { recordset: [], recordsets: [[]], rowsAffected: [0] };
  } }; return r; } }),
  sql: new Proxy({}, { get: () => () => undefined })
}));
const mockAuditoria = jest.fn(async () => true);
jest.mock("../auditoria", () => ({ registrarAuditoria: (...a) => mockAuditoria(...a), sha256: () => "" }));
jest.mock("../notificacaoEmail", () => ({ enviarEmailNotificacao: jest.fn(async () => {}) }));
jest.mock("../vacancia", () => ({ encerrarVinculos: jest.fn(async () => {}) }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, urlDocumentoComSas: (u) => u, salvarFoto: jest.fn(), salvarDocumento: jest.fn() }));

const ficha = require("../fichaMembro");
const auth = require("../auth");
const hPessoas = require("../../GestaoPessoas/index.js");

const CPF_A = "52998224725";   // válido (exemplo público de CPF de teste)
const CPF_B = "12345678909";   // válido
const quando = (padrao, valor) => mockRegras.push([padrao, valor]);
const rodou = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));
const ctx = (membroId) => ({ bindingData: membroId ? { membroId } : {}, log: Object.assign(() => {}, { error() {}, info() {}, warn() {}, verbose() {} }) });
const cab = (token) => ({ "x-forwarded-for": "177.40.1.2:5000, 40.70.146.136:6000", "x-auth-token": token });
const tokenLocal = () => auth.reassinarSessao({ membroId: 5, via: "SENHA", nivel: "CONGREGACAO", permissoes: ["pessoas"], escopoCongregacoes: ["Vila Nova"], termosPendentes: [] });
const tokenGeral = () => auth.reassinarSessao({ membroId: 7, via: "SENHA", nivel: "GLOBAL", permissoes: ["pessoas"], escopoCongregacoes: "TODAS", termosPendentes: [] });
async function chamar(metodo, token, { body = {}, query = {}, membroId } = {}) {
  const c = ctx(membroId);
  await hPessoas(c, { method: metodo, query, body, headers: cab(token) });
  return c.res;
}
const linhaFicha = (extra = {}) => ({ membroId: 700412, nome: "Ana Teste", congregacao: "Vila Nova", congregacaoId: 2, extensao: null, status: "ATIVO", situacaoMembro: "EM_COMUNHAO",
  dataNascimento: "1990-03-14", fotoUrl: null, cargoMinisterial: null, cpfMascarado: ficha.mascararCpf(CPF_A), ...extra });
const existenteDe = (extra = {}) => ({ recordset: [{ MembroId: 700412, Status: "ATIVO", EmailAnterior: null, CpfAnterior: null, CargoAnterior: null, DizimistaAnterior: null, SexoAnterior: null,
  NascimentoAnterior: "1990-03-14", AdmissaoAnterior: null, EstadoCivilAnterior: null, EmProcessoDeCargo: 0, TemExclusao: 0, CongregacaoNome: "Vila Nova", ExtensaoNome: null, ...extra }] });

beforeEach(() => {
  mockRegras = []; mockConsultas = []; mockAuditoria.mockClear();
  quando(/SELECT CongregacaoId, Nome FROM Congregacoes/, { recordset: [{ CongregacaoId: 1, Nome: "Central" }, { CongregacaoId: 2, Nome: "Vila Nova" }] });
  quando(/SELECT TOP 1 Nome FROM Congregacoes/, { recordset: [{ Nome: "Vila Nova" }] });
  quando(/UPDATE MembroReferencia SET Nome/, { recordset: [], rowsAffected: [1] });
  quando(/AS cpfMascarado[\s\S]*WHERE m\.MembroId = @id/, (i) => ({ recordset: [linhaFicha({ membroId: i.id })] }));
});

describe("fichaMembro: o CPF, a escolaridade e a filiação (regra pura)", () => {
  test("CPF de verdade pelos dígitos verificadores; todos iguais e dígito errado recusados", () => {
    expect(ficha.cpfValido(CPF_A)).toBe(true);
    expect(ficha.cpfValido(CPF_B)).toBe(true);
    expect(ficha.cpfValido("52998224724")).toBe(false);
    expect(ficha.cpfValido("11111111111")).toBe(false);
    expect(ficha.cpfValido("5299822472")).toBe(false);
    expect(ficha.cpfValido(52998224725)).toBe(false);   // número cru: só texto de 11 dígitos
  });
  test("lerCpf: aceita com pontos; vazio é sem CPF; a mensagem de erro nunca repete o número", () => {
    expect(ficha.lerCpf("529.982.247-25")).toEqual({ ok: true, cpf: CPF_A });
    expect(ficha.lerCpf("  ")).toEqual({ ok: true, cpf: null });
    expect(ficha.lerCpf(null)).toEqual({ ok: true, cpf: null });
    const ruim = ficha.lerCpf("529.982.247-24");
    expect(ruim.ok).toBe(false);
    expect(ruim.mensagem).not.toMatch(/\d{3}/);
    expect(ficha.lerCpf({ x: 1 }).ok).toBe(false);
    expect(ficha.lerCpf("123").mensagem).toMatch(/11 números/);
  });
  test("a máscara: ***.982.247-** (no JS e no SQL, a mesma)", () => {
    expect(ficha.mascararCpf(CPF_A)).toBe("***.982.247-**");
    expect(ficha.mascararCpf(null)).toBeNull();
    expect(ficha.sqlCpfMascarado("m.Cpf")).toBe("CASE WHEN m.Cpf IS NULL THEN NULL ELSE N'***.' + SUBSTRING(m.Cpf, 4, 3) + N'.' + SUBSTRING(m.Cpf, 7, 3) + N'-**' END");
  });
  test("escolaridade: só a lista fixa; filiação com espaços arrumados e até 150 letras", () => {
    expect(ficha.ESCOLARIDADES.map((e) => e.codigo)).toEqual(["FUNDAMENTAL_INCOMPLETO", "FUNDAMENTAL_COMPLETO", "MEDIO_INCOMPLETO", "MEDIO_COMPLETO", "SUPERIOR_INCOMPLETO", "SUPERIOR_COMPLETO", "POS_GRADUACAO"]);
    expect(ficha.escolaridadeValida("MEDIO_COMPLETO")).toBe(true);
    expect(ficha.escolaridadeValida("DOUTORADO")).toBe(false);
    expect(ficha.lerNomeFiliacao("  Lúcia   Moreira ", "da mãe")).toEqual({ ok: true, nome: "Lúcia Moreira" });
    expect(ficha.lerNomeFiliacao("", "da mãe")).toEqual({ ok: true, nome: null });
    expect(ficha.lerNomeFiliacao("x".repeat(151), "do pai").ok).toBe(false);
    expect(ficha.lerNomeFiliacao("<b>x</b>", "do pai").ok).toBe(false);
  });
});

describe("GestaoPessoas: o CPF nunca sai inteiro da lista", () => {
  test("a lista lê o CPF mascarado no próprio SQL (o número inteiro não sai do banco)", async () => {
    quando(/ORDER BY m\.Nome/, { recordset: [linhaFicha()] });
    const r = await chamar("GET", tokenGeral());
    expect(r.status).toBe(200);
    const sqlLista = rodou(/ORDER BY m\.Nome/)[0].sql;
    expect(sqlLista).toContain("AS cpfMascarado");
    expect(sqlLista).not.toMatch(/m\.Cpf AS/);
    expect(JSON.stringify(r.body)).not.toContain(CPF_A);
    expect(r.body[0].cpfMascarado).toBe("***.982.247-**");
  });
  test("procurar pelo CPF (com ou sem pontos) acha pelo número exato; número que não é CPF não vira condição", async () => {
    quando(/ORDER BY m\.Nome, m\.MembroId OFFSET/, { recordsets: [[{ total: 0 }], []] });
    await chamar("GET", tokenGeral(), { query: { pagina: "1", busca: "529.982.247-25" } });
    const c1 = rodou(/OFFSET @pular/)[0];
    expect(c1.sql).toContain("m.Cpf = @buscaCpf");
    expect(c1.inputs.buscaCpf).toBe(CPF_A);
    mockConsultas = [];
    await chamar("GET", tokenGeral(), { query: { pagina: "1", busca: "52998224724" } });
    expect(rodou(/OFFSET @pular/)[0].sql).not.toContain("@buscaCpf");
  });
});

describe("GestaoPessoas: ver o CPF inteiro — só a Secretaria Geral, com a leitura registrada", () => {
  test("fora da Geral: recusado, sem ler o CPF e sem registrar", async () => {
    const r = await chamar("GET", tokenLocal(), { query: { ver: "cpf" }, membroId: "700412" });
    expect(r.status).toBe(403);
    expect(rodou(/m\.Cpf/)).toHaveLength(0);
    expect(rodou(/CpfLeituras/)).toHaveLength(0);
  });
  test("a Geral vê o número inteiro, e a leitura vai para CpfLeituras e para a trilha (mascarado)", async () => {
    quando(/SELECT m\.Cpf, c\.Nome AS CongregacaoNome/, { recordset: [{ Cpf: CPF_A, CongregacaoNome: "Vila Nova", ExtensaoNome: null }] });
    const r = await chamar("GET", tokenGeral(), { query: { ver: "cpf" }, membroId: "700412" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ sucesso: true, cpf: "529.982.247-25" });
    expect(r.headers["Cache-Control"]).toBe("no-store");
    const leitura = rodou(/INSERT INTO CpfLeituras/);
    expect(leitura).toHaveLength(1);
    expect(leitura[0].inputs).toEqual(expect.objectContaining({ id: 700412, por: 7 }));
    expect(JSON.stringify(mockAuditoria.mock.calls)).not.toContain(CPF_A);
    expect(mockAuditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "Viu o CPF inteiro", dadosDepois: { cpf: "***.982.247-**" } }));
  });
  test("matrícula que não existe: a mesma recusa de fora do escopo, sem registro", async () => {
    const r = await chamar("GET", tokenGeral(), { query: { ver: "cpf" }, membroId: "999999" });
    expect(r.status).toBe(403);
    expect(rodou(/CpfLeituras/)).toHaveLength(0);
  });
});

describe("GestaoPessoas: gravar o CPF, a filiação e a escolaridade", () => {
  const corpo = (extra = {}) => ({ membroId: 700412, nome: "Ana Teste", congregacaoId: 2, status: "ATIVO", dataNascimento: "1990-03-14", ...extra });
  test("CPF inválido: recusado sem gravar nada, e a mensagem não repete o número", async () => {
    const r = await chamar("POST", tokenLocal(), { body: corpo({ cpf: "529.982.247-24" }) });
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).not.toContain("529");
    expect(rodou(/UPDATE MembroReferencia|INSERT INTO MembroReferencia/)).toHaveLength(0);
  });
  test("sem os campos novos no pedido (a tela antiga): o UPDATE não mexe neles", async () => {
    quando(/SELECT m\.MembroId, m\.Status, m\.Email AS EmailAnterior/, existenteDe({ CpfAnterior: CPF_A }));
    const r = await chamar("POST", tokenLocal(), { body: corpo() });
    expect(r.body.sucesso).toBe(true);
    const upd = rodou(/UPDATE MembroReferencia SET Nome/)[0].sql;
    expect(upd).not.toMatch(/Cpf =|NomeMae =|NomePai =|Escolaridade =/);
  });
  test("a secretaria local informa o CPF quando a ficha não tem; com a filiação e a escolaridade", async () => {
    quando(/SELECT m\.MembroId, m\.Status, m\.Email AS EmailAnterior/, existenteDe());
    const r = await chamar("POST", tokenLocal(), { body: corpo({ cpf: "529.982.247-25", nomeMae: "Lúcia Moreira", nomePai: "José Moreira", escolaridade: "SUPERIOR_COMPLETO" }) });
    expect(r.body.sucesso).toBe(true);
    const upd = rodou(/UPDATE MembroReferencia SET Nome/)[0];
    expect(upd.sql).toMatch(/Cpf = @cpf/);
    expect(upd.inputs).toEqual(expect.objectContaining({ cpf: CPF_A, nomeMae: "Lúcia Moreira", nomePai: "José Moreira", escolaridade: "SUPERIOR_COMPLETO" }));
    const trilha = JSON.stringify(mockAuditoria.mock.calls);
    expect(trilha).not.toContain(CPF_A);
    expect(trilha).toContain("***.982.247-**");
    expect(JSON.stringify(r.body)).not.toContain(CPF_A);
  });
  test("trocar ou apagar um CPF já gravado: só a Secretaria Geral", async () => {
    quando(/SELECT m\.MembroId, m\.Status, m\.Email AS EmailAnterior/, existenteDe({ CpfAnterior: CPF_A }));
    const troca = await chamar("POST", tokenLocal(), { body: corpo({ cpf: CPF_B }) });
    expect(troca.status).toBe(403);
    const apaga = await chamar("POST", tokenLocal(), { body: corpo({ cpf: "" }) });
    expect(apaga.status).toBe(403);
    const igual = await chamar("POST", tokenLocal(), { body: corpo({ cpf: "529.982.247-25" }) });
    expect(igual.body.sucesso).toBe(true);   // mandar o mesmo CPF não é troca
    expect(rodou(/UPDATE MembroReferencia SET Nome/)).toHaveLength(1);
    const geral = await chamar("POST", tokenGeral(), { body: corpo({ cpf: CPF_B }) });
    expect(geral.body.sucesso).toBe(true);
  });
  // v10.1b passo 4 (decisão dele, 17/11/2026): no escopo de quem cadastra, a mensagem leva à ficha (matrícula); fora do escopo, só "já tem cadastro" e o caso vai à Geral
  test("CPF de outra pessoa NO escopo de quem cadastra: recusado, com a ficha para ir até ela", async () => {
    quando(/SELECT m\.MembroId, m\.Status, m\.Email AS EmailAnterior/, existenteDe());
    quando(/WHERE m\.Cpf = @cpf AND \(@ex IS NULL OR m\.MembroId <> @ex\)/, { recordset: [{ MembroId: 700981, Nome: "Ana Antiga", CongregacaoNome: "Vila Nova", ExtensaoNome: null }] });
    const local = await chamar("POST", tokenLocal(), { body: corpo({ cpf: CPF_A }) });
    expect(local.body).toMatchObject({ sucesso: false, cpfRepetido: "NO_ESCOPO", matricula: 700981 });
    expect(local.body.mensagem).toContain("700981");
    const geral = await chamar("POST", tokenGeral(), { body: corpo({ cpf: CPF_A }) });
    expect(geral.body.mensagem).toContain("700981");
    expect(rodou(/UPDATE MembroReferencia SET Nome|INSERT INTO MembroReferencia/)).toHaveLength(0);
    expect(rodou(/INSERT INTO CasosCadastroGeral/)).toHaveLength(0);
  });
  test("CPF de outra pessoa FORA do escopo de quem cadastra: recusado sem nada da outra ficha, e o caso vai à Secretaria Geral", async () => {
    quando(/SELECT m\.MembroId, m\.Status, m\.Email AS EmailAnterior/, existenteDe());
    quando(/WHERE m\.Cpf = @cpf AND \(@ex IS NULL OR m\.MembroId <> @ex\)/, { recordset: [{ MembroId: 700981, Nome: "Ana Antiga", CongregacaoNome: "Bairro da Paz", ExtensaoNome: null }] });
    const local = await chamar("POST", tokenLocal(), { body: corpo({ cpf: CPF_A }) });
    expect(local.body).toMatchObject({ sucesso: false, cpfRepetido: "FORA_DO_ESCOPO" });
    expect(local.body.mensagem).toMatch(/Secretaria Geral/);
    expect(JSON.stringify(local.body)).not.toMatch(/700981|Ana Antiga|Bairro da Paz/);
    expect(rodou(/INSERT INTO CasosCadastroGeral/)).toHaveLength(1);
    expect(rodou(/UPDATE MembroReferencia SET Nome|INSERT INTO MembroReferencia/)).toHaveLength(0);
  });
  test("o índice único recusou na gravação (dois cadastros ao mesmo tempo): a mesma mensagem, sem quebrar", async () => {
    mockRegras = mockRegras.filter(([p]) => !p.test("UPDATE MembroReferencia SET Nome"));
    quando(/SELECT m\.MembroId, m\.Status, m\.Email AS EmailAnterior/, existenteDe());
    quando(/UPDATE MembroReferencia SET Nome/, () => { const e = new Error("Cannot insert duplicate key row in object 'dbo.MembroReferencia' with unique index 'UX_MembroReferencia_Cpf'."); e.number = 2601; throw e; });
    const r = await chamar("POST", tokenLocal(), { body: corpo({ cpf: CPF_A }) });
    expect(r.body).toEqual({ sucesso: false, mensagem: expect.stringMatching(/outra pessoa/) });
  });
  test("escolaridade fora da lista e nome com < >: recusados", async () => {
    expect((await chamar("POST", tokenLocal(), { body: corpo({ escolaridade: "DOUTORADO" }) })).body.sucesso).toBe(false);
    expect((await chamar("POST", tokenLocal(), { body: corpo({ nomeMae: "<script>" }) })).body.sucesso).toBe(false);
  });
});

describe("GestaoPessoas: a matrícula gerada pelo sistema", () => {
  const novo = (extra = {}) => ({ nome: "Pessoa Nova", congregacaoId: 2, status: "ATIVO", dataNascimento: "2000-01-01", gerarMatricula: true, ...extra });
  test("sem matrícula e sem pedir para gerar: recusado como antes (uma tela que mandasse vazio por engano não cria ninguém)", async () => {
    const r = await chamar("POST", tokenLocal(), { body: novo({ gerarMatricula: undefined }) });
    expect(r.status).toBe(400);
    expect(rodou(/FROM MatriculasLivres l|INSERT INTO MembroReferencia/)).toHaveLength(0);
    expect((await chamar("POST", tokenLocal(), { body: novo({ gerarMatricula: "true" }) })).status).toBe(400);   // só o verdadeiro de verdade
  });
  test("sem matrícula: o sistema gera (o número liberado ou a maior + 1), grava e tira o número da lista de livres", async () => {
    quando(/FROM MatriculasLivres l/, { recordset: [{ id: 700981 }] });
    const r = await chamar("POST", tokenLocal(), { body: novo() });
    expect(r.body.sucesso).toBe(true);
    expect(r.body.mensagem).toContain("700981");
    const ins = rodou(/INSERT INTO MembroReferencia/)[0];
    expect(ins.inputs.id).toBe(700981);
    expect(ins.sql).toMatch(/IF EXISTS \(SELECT 1 FROM MembroReferencia WHERE MembroId = @id\) DELETE FROM MatriculasLivres WHERE MembroId = @id/);
    expect(mockAuditoria).toHaveBeenCalledWith(expect.objectContaining({ registroId: 700981, dadosDepois: expect.objectContaining({ matriculaGerada: true }) }));
  });
  test("o número foi tomado no mesmo instante (chave primária): pede o próximo e grava", async () => {
    const numeros = [700981, 700982];
    quando(/FROM MatriculasLivres l/, () => ({ recordset: [{ id: numeros.shift() }] }));
    let tentativas = 0;
    quando(/INSERT INTO MembroReferencia/, (i) => {
      tentativas++;
      if (i.id === 700981) { const e = new Error("Violation of PRIMARY KEY constraint 'PK__MembroRe__1'. Cannot insert duplicate key in object 'dbo.MembroReferencia'."); e.number = 2627; throw e; }
      return { rowsAffected: [1] };
    });
    const r = await chamar("POST", tokenLocal(), { body: novo() });
    expect(r.body.sucesso).toBe(true);
    expect(tentativas).toBe(2);
    expect(r.body.mensagem).toContain("700982");
  });
  test("matrícula digitada continua valendo; texto que não é número é recusado", async () => {
    const r = await chamar("POST", tokenLocal(), { body: novo({ membroId: "700500" }) });
    expect(r.body.sucesso).toBe(true);
    expect(rodou(/FROM MatriculasLivres l/)).toHaveLength(0);
    expect(rodou(/INSERT INTO MembroReferencia/)[0].inputs.id).toBe(700500);
    const ruim = await chamar("POST", tokenLocal(), { body: novo({ membroId: "12a" }) });
    expect(ruim.status).toBe(400);
    const lista = await chamar("POST", tokenLocal(), { body: novo({ membroId: [700500] }) });
    expect(lista.status).toBe(400);
  });
});
