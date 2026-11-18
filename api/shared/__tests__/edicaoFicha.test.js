// FASE 10, v10.1b passo 5 (18/11/2026) — a edição da ficha CAMPO A CAMPO, o que o membro muda sozinho, as sugestões e o histórico de alterações.
// As regras puras (shared/edicaoFicha.js) e as rotas de verdade (EdicaoFicha, AtualizarMeusDados, SolicitarEdicaoPessoa) com o banco simulado pelo TEXTO da
// consulta (como em escopoFichas.test.js). As corridas e o banco de verdade estão no e2e-91 (tools/e2e-localdb).
let mockRegras = [];
let mockConsultas = [];
let mockTransacao = { begin: 0, commit: 0, rollback: 0 };
jest.mock("../db", () => {
  const rodar = async (texto, inputs) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor, afetadas] of mockRegras) {
      if (padrao.test(texto)) {
        const rs = typeof valor === "function" ? valor(inputs) : valor;
        return { recordset: rs, recordsets: Array.isArray(rs) && Array.isArray(rs[0]) ? rs : [rs], rowsAffected: [afetadas === undefined ? 1 : afetadas] };
      }
    }
    return { recordset: [], recordsets: [[]], rowsAffected: [/^\s*(UPDATE|DELETE)\b/i.test(texto) ? 1 : 0] };
  };
  const novaRequisicao = () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: (texto) => rodar(texto, inputs) }; return r; };
  class Transaction { async begin() { mockTransacao.begin++; } async commit() { mockTransacao.commit++; } async rollback() { mockTransacao.rollback++; } }
  class Request { constructor() { return novaRequisicao(); } }
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => ({ request: novaRequisicao }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), registrarAuditoriaNaTransacao: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../notificacaoEmail", () => ({ enviarEmailNotificacao: jest.fn(async () => true) }));

const auth = require("../auth");
const regras = require("../edicaoFicha");
const db = require("../edicaoFichaDb");
const { registrarAuditoriaNaTransacao } = require("../auditoria");
const { enviarEmailNotificacao } = require("../notificacaoEmail");
const hFicha = require("../../EdicaoFicha/index.js");
const hMeusDados = require("../../AtualizarMeusDados/index.js");
const hSugerir = require("../../SolicitarEdicaoPessoa/index.js");

async function chamar(handler, { metodo = "GET", corpo = {}, token, ligado = {}, query = {} } = {}) {
  const context = { bindingData: ligado, log: { error() {}, info() {}, warn() {}, verbose() {} } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const rodou = (padrao) => mockConsultas.filter((c) => padrao.test(c.sql));
const escritas = () => mockConsultas.filter((c) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(c.sql));
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const fator = () => ({ via: "CHAVE", em: Date.now() });
const GERAL = () => tokenDe(1, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["pessoas"] });
const LOCAL = () => tokenDe(5, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], permissoes: ["pessoas"] });
const AREA = () => tokenDe(7, { via: "SENHA", fator: fator(), nivel: "AREA", escopoCongregacoes: ["Central", "Vila Nova"], permissoes: ["pessoas"] });
const PIN = (id) => tokenDe(id, { via: "PIN" });

// as fichas do cenário (colunas como o banco devolve)
let FICHAS;
const fichaBase = (extra = {}) => ({ Status: "ATIVO", Nome: "Ana", DataNascimento: new Date("1990-01-01T00:00:00Z"), Sexo: "F", EstadoCivil: "CASADO", Escolaridade: null, Cpf: null,
  NomeMae: null, NomePai: null, Telefone: "(91) 98888-1111", Email: "ana@exemplo.org", Endereco: null, DepartamentoId: null, DataAdmissao: new Date("2015-04-12T00:00:00Z"),
  FormaAdmissao: "BATISMO", DataBatismo: null, Origem: null, IgrejaAnterior: null, DataRitoRecebimento: null, NomeLidoRito: null, MinistranteRito: null,
  CongregacaoNome: "Central", ExtensaoNome: null, EmProcessoDeCargo: 0, TemExclusao: 0, ...extra });
beforeEach(() => {
  mockRegras = [];
  mockConsultas = [];
  mockTransacao = { begin: 0, commit: 0, rollback: 0 };
  registrarAuditoriaNaTransacao.mockClear();
  enviarEmailNotificacao.mockClear();
  FICHAS = { 5: fichaBase({ Nome: "Dirigente Central" }), 10: fichaBase(), 20: fichaBase({ Nome: "Beto", CongregacaoNome: "Vila Nova" }) };
  // carregarPessoa (o escopo) e a ficha inteira (lerFicha, com ou sem trava)
  quando(/SELECT m\.MembroId, m\.Nome, m\.Status, c\.Nome AS CongregacaoNome/, (i) => (FICHAS[i.id] ? [{ MembroId: i.id, ...FICHAS[i.id] }] : []));
  quando(/SELECT m\.MembroId, m\.Status AS StatusAtual, m\.CongregacaoId, m\.Nome, m\.DataNascimento/, (i) => (FICHAS[i.id] ? [{ MembroId: i.id, StatusAtual: FICHAS[i.id].Status, CongregacaoId: 1, ...FICHAS[i.id] }] : []));
});

describe("regras puras (shared/edicaoFicha.js)", () => {
  const ctx = (extra = {}) => ({ papel: "SECRETARIA", ehProprio: false, valorAtual: null, emProcessoDeCargo: false, temExclusao: false, ...extra });
  test("a secretaria local NÃO muda o nome; a Geral muda", () => {
    expect(regras.podeSecretariaMudar("nome", ctx({ valorAtual: "Ana" })).pode).toBe(false);
    expect(regras.podeSecretariaMudar("nome", ctx({ papel: "GERAL", valorAtual: "Ana" })).pode).toBe(true);
  });
  test("CPF: vazio qualquer secretaria preenche; gravado só a Geral troca", () => {
    expect(regras.podeSecretariaMudar("cpf", ctx()).pode).toBe(true);
    expect(regras.podeSecretariaMudar("cpf", ctx({ valorAtual: "52998224725" })).pode).toBe(false);
    expect(regras.podeSecretariaMudar("cpf", ctx({ papel: "GERAL", valorAtual: "52998224725" })).pode).toBe(true);
  });
  test("ninguém muda nascimento, sexo, estado civil e admissão no próprio cadastro — nem a Geral", () => {
    for (const k of ["dataNascimento", "sexo", "estadoCivil", "dataAdmissao"]) {
      expect(regras.podeSecretariaMudar(k, ctx({ ehProprio: true })).pode).toBe(false);
      expect(regras.podeSecretariaMudar(k, ctx({ papel: "GERAL", ehProprio: true })).pode).toBe(false);
    }
    expect(regras.podeSecretariaMudar("telefone", ctx({ ehProprio: true })).pode).toBe(true);
  });
  test("processo de cargo em andamento: nascimento, admissão e estado civil só a Geral (Trava 8-A)", () => {
    for (const k of ["dataNascimento", "dataAdmissao", "estadoCivil"]) {
      expect(regras.podeSecretariaMudar(k, ctx({ emProcessoDeCargo: true })).pode).toBe(false);
      expect(regras.podeSecretariaMudar(k, ctx({ papel: "GERAL", emProcessoDeCargo: true })).pode).toBe(true);
    }
    expect(regras.podeSecretariaMudar("dataBatismo", ctx({ emProcessoDeCargo: true })).pode).toBe(true);
  });
  test("exclusão julgada: a admissão nova é a readmissão, só a Geral", () => {
    expect(regras.podeSecretariaMudar("dataAdmissao", ctx({ temExclusao: true })).pode).toBe(false);
    expect(regras.podeSecretariaMudar("dataAdmissao", ctx({ papel: "GERAL", temExclusao: true })).pode).toBe(true);
    // a mensagem não conta a quem não tem "disciplina" que houve exclusão
    expect(regras.podeSecretariaMudar("dataAdmissao", ctx({ temExclusao: true })).motivo).not.toMatch(/exclus|disciplin/i);
  });
  test("o que não muda por aqui diz o caminho certo (congregação, cargo, situação)", () => {
    expect(regras.podeSecretariaMudar("congregacaoId", ctx({ papel: "GERAL" }))).toEqual({ pode: false, motivo: "A congregação muda pela transferência." });
    // (18/11/2026, as sobras do passo 7a) o cargo agora muda campo a campo — só a Secretaria Geral, e ninguém no próprio
    expect(regras.podeSecretariaMudar("cargoMinisterial", ctx({ papel: "GERAL" })).pode).toBe(true);
    expect(regras.podeSecretariaMudar("cargoMinisterial", ctx()).motivo).toMatch(/Geral/);
    expect(regras.podeSecretariaMudar("motivoSaida", ctx({ papel: "GERAL" })).motivo).toMatch(/desligamento/);
    expect(regras.podeSecretariaMudar("constructor", ctx({ papel: "GERAL" })).pode).toBe(false);
    for (const k of ["constructor", "__proto__", "toString"]) expect(typeof regras.podeSecretariaMudar(k, ctx({ papel: "GERAL" })).motivo).toBe("string");
  });
  test("o membro: contato muda sozinho; vazio preenche; preenchido sugere; atos da igreja sugere; departamento não", () => {
    expect(regras.modoDoMembro("telefone", "123")).toBe("DIRETO");
    expect(regras.modoDoMembro("escolaridade", null)).toBe("DIRETO");
    expect(regras.modoDoMembro("escolaridade", "MEDIO_COMPLETO")).toBe("SUGERIR");
    expect(regras.modoDoMembro("estadoCivil", "  ")).toBe("DIRETO");
    expect(regras.modoDoMembro("dataAdmissao", null)).toBe("SUGERIR");
    expect(regras.modoDoMembro("nome", "Ana")).toBe("SUGERIR");
    expect(regras.modoDoMembro("departamentoId", null)).toBe("NAO");
    expect(regras.modoDoMembro("__proto__", null)).toBe("NAO");
    // com processo de cargo, até o vazio que conta para a escada vai como sugestão
    expect(regras.modoDoMembro("dataNascimento", null, { emProcessoDeCargo: true })).toBe("SUGERIR");
    expect(regras.modoDoMembro("escolaridade", null, { emProcessoDeCargo: true })).toBe("DIRETO");
  });
  test("quem aplica a sugestão: a Geral e a secretaria local da congregação inteira; a área e a concessão de Extensão acompanham", () => {
    const visao = (t) => auth.visaoDaPermissao(auth.getSessao(t), "pessoas");
    expect(regras.podeAplicarSugestao(visao(GERAL()), "Qualquer")).toBe(true);
    expect(regras.podeAplicarSugestao(visao(LOCAL()), "Central")).toBe(true);
    expect(regras.podeAplicarSugestao(visao(LOCAL()), "Vila Nova")).toBe(false);
    expect(regras.podeAplicarSugestao(visao(AREA()), "Central")).toBe(false);
    const ext = tokenDe(6, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: ["Central"], escopoExtensaoNome: "Tenda", permissoes: ["pessoas"] });
    expect(regras.podeAplicarSugestao(visao(ext), "Central")).toBe(false);
  });
  test("validar: datas (calendário, futuro, antiga), listas, e-mail, telefone, texto, CPF e filiação", () => {
    const hoje = "2026-11-18";
    expect(regras.validar("dataBatismo", "2026-02-30", hoje).ok).toBe(false);
    expect(regras.validar("dataBatismo", "2026-12-01", hoje).ok).toBe(false);
    expect(regras.validar("dataBatismo", "1899-12-31", hoje).ok).toBe(false);
    expect(regras.validar("dataBatismo", "", hoje)).toEqual({ ok: true, valor: null });
    expect(regras.validar("dataNascimento", "", hoje).ok).toBe(false);
    expect(regras.validar("estadoCivil", "NAMORANDO", hoje).ok).toBe(false);
    expect(regras.validar("sexo", "F", hoje)).toEqual({ ok: true, valor: "F" });
    expect(regras.validar("email", "a@b", hoje).ok).toBe(false);
    expect(regras.validar("email", "ana@exemplo.org", hoje).ok).toBe(true);
    expect(regras.validar("telefone", "abc", hoje).ok).toBe(false);
    expect(regras.validar("nome", "<script>", hoje).ok).toBe(false);
    expect(regras.validar("nome", " ", hoje).ok).toBe(false);
    expect(regras.validar("origem", { a: 1 }, hoje).ok).toBe(false);
    expect(regras.validar("cpf", "529.982.247-25", hoje)).toEqual({ ok: true, valor: "52998224725" });
    expect(regras.validar("cpf", "111.111.111-11", hoje).ok).toBe(false);
    expect(regras.validar("nomeMae", "  Maria   da Silva ", hoje)).toEqual({ ok: true, valor: "Maria da Silva" });
    expect(regras.validar("departamentoId", "0x5", hoje).ok).toBe(false);
  });
  test("máscaras: CPF, e-mail e telefone nunca inteiros", () => {
    expect(regras.mascarar("cpf", "52998224725")).toBe("***.982.247-**");
    expect(regras.mascarar("email", "ana@exemplo.org")).toBe("a**@exemplo.org");
    expect(regras.mascarar("telefone", "(91) 98888-1111")).toBe("*******1111");
    expect(regras.mascarar("nome", "Ana")).toBe("Ana");
  });
  test("a tabela 'quem muda o quê' cobre todos os campos", () => {
    const t = regras.tabelaDePapeis();
    expect(t.map((x) => x.chave)).toEqual(Object.keys(regras.CAMPOS));
    expect(t.find((x) => x.chave === "nome")).toMatchObject({ geral: "MUDA", secretaria: "SO_GERAL", membro: "SUGERE" });
    expect(t.find((x) => x.chave === "cpf")).toMatchObject({ secretaria: "SE_VAZIO", membro: "SE_VAZIO" });
    expect(t.find((x) => x.chave === "telefone")).toMatchObject({ secretaria: "MUDA", membro: "MUDA" });
  });
});

describe("o histórico lido da trilha (mudancasDaLinha)", () => {
  test("CPF, e-mail e telefone das linhas ANTIGAS saem mascarados; segredo e foto não saem", () => {
    const m = db.mudancasDaLinha(JSON.stringify({ telefone: "(91) 98888-1111", email: "ana@exemplo.org" }),
      JSON.stringify({ telefone: "(91) 97777-2222", email: "ana2@exemplo.org", cpf: "52998224725", fotoUrl: "https://x/f.jpg", pinHash: "abc", cpfAlterado: true }), false);
    const txt = JSON.stringify(m);
    expect(txt).not.toMatch(/98888|97777|ana@|ana2@|52998224725|f\.jpg|abc/);
    expect(m.find((x) => x.campo === "cpf").depois).toBe("***.982.247-**");
    expect(m.find((x) => x.campo === "cpfAlterado").depois).toBe("true");
  });
  test("o motivo de uma saída disciplinar é sigiloso sem a permissão 'disciplina'", () => {
    const linha = [JSON.stringify({ motivoSaida: null }), JSON.stringify({ motivoSaida: "EXCLUSAO" })];
    expect(db.mudancasDaLinha(...linha, false)[0].depois).toBe("(sigiloso)");
    expect(db.mudancasDaLinha(...linha, true)[0].depois).toBe("EXCLUSAO");
    expect(db.mudancasDaLinha(null, JSON.stringify({ motivoSaida: "FALECIMENTO" }), false)[0].depois).toBe("FALECIMENTO");
  });
  test("linha só com 'depois' (cadastro antigo) não inventa o 'antes'; JSON quebrado não derruba", () => {
    const m = db.mudancasDaLinha(null, JSON.stringify({ nome: "Ana" }), false);
    expect(m).toEqual([{ campo: "nome", rotulo: "Nome", depois: "Ana" }]);
    expect(db.mudancasDaLinha("{quebrado", "[1,2]", false)).toEqual([]);
  });
});

describe("EdicaoFicha — a secretaria, campo a campo", () => {
  const campo = (token, membroId, corpo) => chamar(hFicha, { metodo: "POST", token, ligado: { membroId: String(membroId), acao: "campo" }, corpo });

  test("sem sessão 401; sessão de PIN (membro) recusada; sem a permissão 'pessoas' recusada", async () => {
    expect((await campo(undefined, 10, { campo: "telefone", valor: "91 9999-0000" })).status).toBe(401);
    expect([401, 403]).toContain((await campo(PIN(10), 10, { campo: "telefone", valor: "91 9999-0000" })).status);
    expect(escritas()).toHaveLength(0);
  });
  test("fora do escopo = a mesma resposta de matrícula inexistente, nada gravado", async () => {
    const fora = await campo(LOCAL(), 20, { campo: "telefone", valor: "91 9999-0000" });
    const inexistente = await campo(LOCAL(), 999, { campo: "telefone", valor: "91 9999-0000" });
    expect(fora).toEqual(inexistente);
    expect(fora.body).toEqual({ sucesso: false, mensagem: "Matrícula não encontrada." });
    expect((await chamar(hFicha, { token: LOCAL(), ligado: { membroId: "20", acao: "alteracoes" } })).body).toEqual(fora.body);
    expect(escritas()).toHaveLength(0);
  });
  test("grava UM campo, com a trilha na mesma transação", async () => {
    const r = await campo(LOCAL(), 10, { campo: "escolaridade", valor: "MEDIO_COMPLETO", valorLido: null });
    expect(r.body).toMatchObject({ sucesso: true, valor: "MEDIO_COMPLETO" });
    expect(rodou(/UPDATE MembroReferencia SET Escolaridade = @v WHERE MembroId = @id/)[0].inputs).toMatchObject({ id: 10, v: "MEDIO_COMPLETO" });
    expect(registrarAuditoriaNaTransacao.mock.calls[0][1]).toMatchObject({ tabela: "MembroReferencia", registroId: 10, usuarioId: 5,
      dadosAntes: { escolaridade: null }, dadosDepois: { escolaridade: "MEDIO_COMPLETO" } });
    expect(mockTransacao).toMatchObject({ begin: 1, commit: 1, rollback: 0 });
  });
  test("o CPF: a resposta e a trilha só mascarados; o CPF de outra ficha não grava", async () => {
    const r = await campo(LOCAL(), 10, { campo: "cpf", valor: "529.982.247-25" });
    expect(r.body).toMatchObject({ sucesso: true, valor: "***.982.247-**" });
    const aud = registrarAuditoriaNaTransacao.mock.calls[0][1];
    expect(JSON.stringify(aud)).not.toMatch(/52998224725/);
    expect(aud.dadosDepois.cpf).toBe("***.982.247-**");
    mockConsultas = [];
    quando(/WHERE m\.Cpf = @cpf/, [{ MembroId: 11, Nome: "Bia", CongregacaoNome: "Central", ExtensaoNome: null }]);
    const rep = await campo(LOCAL(), 10, { campo: "cpf", valor: "111.444.777-35" });
    expect(rep.body.sucesso).toBe(false);
    expect(rep.body.matricula).toBe(11);
    expect(rodou(/UPDATE MembroReferencia SET Cpf/)).toHaveLength(0);
  });
  test("campo travado pelo papel: o nome (local), o CPF gravado (local), o próprio nascimento", async () => {
    expect((await campo(LOCAL(), 10, { campo: "nome", valor: "Ana Maria" })).status).toBe(403);
    FICHAS[10].Cpf = "52998224725";
    expect((await campo(LOCAL(), 10, { campo: "cpf", valor: "111.444.777-35" })).status).toBe(403);
    expect((await campo(LOCAL(), 5, { campo: "dataNascimento", valor: "1980-01-01" })).status).toBe(403);
    expect((await campo(LOCAL(), 10, { campo: "congregacaoId", valor: 2 })).status).toBe(422);
    expect((await campo(LOCAL(), 10, { campo: "cargoMinisterial", valor: "PASTOR" })).status).toBe(403);   // (18/11) o cargo muda campo a campo, só a Geral
    expect(rodou(/UPDATE MembroReferencia/)).toHaveLength(0);
    const g = await campo(GERAL(), 10, { campo: "nome", valor: "Ana Maria" });
    expect(g.body.sucesso).toBe(true);
  });
  test("mudou enquanto a tela estava aberta: 409, nada gravado", async () => {
    const r = await campo(LOCAL(), 10, { campo: "telefone", valor: "(91) 97777-2222", valorLido: "(91) 90000-0000" });
    expect(r.status).toBe(409);
    expect(rodou(/UPDATE MembroReferencia/)).toHaveLength(0);
    expect(mockTransacao.rollback).toBe(1);
  });
  test("trocar o e-mail avisa o endereço antigo", async () => {
    const r = await campo(LOCAL(), 10, { campo: "email", valor: "nova@exemplo.org", valorLido: "ana@exemplo.org" });
    expect(r.body.sucesso).toBe(true);
    expect(r.body).not.toHaveProperty("emailAnterior");
    expect(enviarEmailNotificacao.mock.calls[0][0].email).toBe("ana@exemplo.org");
  });
  test("GET campos: cada campo com o valor (CPF mascarado), pode/motivo pelo papel, e a tabela de quem muda o quê", async () => {
    FICHAS[10].Cpf = "52998224725";
    const r = await chamar(hFicha, { token: LOCAL(), ligado: { membroId: "10", acao: "campos" } });
    expect(r.body.sucesso).toBe(true);
    expect(JSON.stringify(r.body)).not.toMatch(/52998224725/);
    const porChave = Object.fromEntries(r.body.campos.map((c) => [c.chave, c]));
    expect(porChave.cpf).toMatchObject({ valor: "***.982.247-**", pode: false });
    expect(porChave.nome.pode).toBe(false);
    expect(porChave.telefone.pode).toBe(true);
    expect(r.body.quemMudaOQue.length).toBe(Object.keys(regras.CAMPOS).length);
  });
  test("GET alteracoes: paginado, sem CPF inteiro", async () => {
    quando(/WITH trilha AS/, () => [[{ total: 1 }], [{ AuditId: 7, DataHora: "2026-11-18T10:00:00", Acao: "Atualizou pessoa", UsuarioId: 5, UsuarioNome: "Dirigente Central",
      DadosAntes: null, DadosDepois: JSON.stringify({ cpf: "52998224725", nome: "Ana" }) }]]);
    const r = await chamar(hFicha, { token: LOCAL(), ligado: { membroId: "10", acao: "alteracoes" }, query: { pagina: "1", porPagina: "500" } });
    expect(r.body).toMatchObject({ sucesso: true, total: 1, porPagina: 100 });
    expect(JSON.stringify(r.body)).not.toMatch(/52998224725/);
    expect(r.body.itens[0].quem).toEqual({ matricula: 5, nome: "Dirigente Central" });
  });
});

describe("AtualizarMeusDados — o que o membro muda sozinho", () => {
  const salvar = (corpo, id = 10) => chamar(hMeusDados, { metodo: "POST", token: PIN(id), ligado: { matricula: String(id) }, corpo });
  test("o contato muda; o vazio é preenchido; só as colunas que mudaram entram no UPDATE (nada volta ao valor antigo)", async () => {
    const r = await salvar({ telefone: "(91) 97777-2222", escolaridade: "SUPERIOR_COMPLETO", estadoCivil: "CASADO" });
    expect(r.body).toMatchObject({ sucesso: true, mudou: ["telefone", "escolaridade"] });
    const upd = rodou(/^\s*UPDATE MembroReferencia SET/)[0];
    expect(upd.sql).toMatch(/Telefone = @v0, Escolaridade = @v1 WHERE/);
    expect(upd.sql).not.toMatch(/EstadoCivil/);
    const aud = registrarAuditoriaNaTransacao.mock.calls[0][1];
    expect(aud).toMatchObject({ registroId: 10, usuarioId: 10 });
    expect(JSON.stringify(aud)).not.toMatch(/97777|98888/);
  });
  test("o que já está preenchido não muda sozinho: recusa a gravação inteira e manda sugerir", async () => {
    const r = await salvar({ telefone: "(91) 97777-2222", estadoCivil: "DIVORCIADO" });
    expect(r.body.sucesso).toBe(false);
    expect(r.body.campo).toBe("estadoCivil");
    expect(r.body.mensagem).toMatch(/Sugerir mudança/);
    expect(rodou(/UPDATE MembroReferencia/)).toHaveLength(0);
    expect(mockTransacao.rollback).toBe(1);
  });
  test("o vazio que conta para a escada, com processo de cargo, vai como sugestão", async () => {
    FICHAS[10].EstadoCivil = null;
    FICHAS[10].EmProcessoDeCargo = 1;
    const r = await salvar({ estadoCivil: "CASADO" });
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/processo de cargo/);
  });
  test("um telefone antigo fora do formato, reenviado igual, não impede de salvar o resto", async () => {
    FICHAS[10].Telefone = "ramal 22";
    const r = await salvar({ telefone: "ramal 22", escolaridade: "MEDIO_COMPLETO" });
    expect(r.body).toMatchObject({ sucesso: true, mudou: ["escolaridade"] });
    expect((await salvar({ telefone: "ramal 23" })).body.sucesso).toBe(false);
  });
  test("o CPF próprio (vazio) entra; a trilha guarda só a máscara; trocar o e-mail avisa o antigo", async () => {
    const r = await salvar({ cpf: "529.982.247-25", email: "nova@exemplo.org" });
    expect(r.body.sucesso).toBe(true);
    expect(JSON.stringify(registrarAuditoriaNaTransacao.mock.calls)).not.toMatch(/52998224725/);
    expect(enviarEmailNotificacao.mock.calls[0][0].email).toBe("ana@exemplo.org");
  });
  test("nome e atos da igreja não mudam por aqui (chave desconhecida é ignorada)", async () => {
    const r = await salvar({ nome: "Outra", dataAdmissao: "2000-01-01", telefone: "(91) 98888-1111" });
    expect(r.body).toMatchObject({ sucesso: true, mudou: [] });
    expect(rodou(/UPDATE MembroReferencia/)).toHaveLength(0);
  });
});

describe("SolicitarEdicaoPessoa — a sugestão do membro", () => {
  const sugerir = (campos, id = 10) => chamar(hSugerir, { metodo: "POST", token: PIN(id), ligado: { matricula: String(id) }, corpo: { campos } });
  test("sugere o que não muda sozinho; UMA sugestão pendente por campo", async () => {
    quando(/INSERT INTO SolicitacoesEdicaoPessoa/, [{ SolicitacaoId: 3 }]);
    const r = await sugerir({ nome: "Ana Maria", estadoCivil: "DIVORCIADO", dataBatismo: "2001-03-04" });
    expect(r.status).toBe(201);
    expect(rodou(/INSERT INTO SolicitacoesEdicaoCampos/).map((c) => c.inputs.n)).toEqual(["nome", "estadoCivil", "dataBatismo"]);
    mockConsultas = [];
    quando(/SELECT DISTINCT c\.NomeCampo/, [{ NomeCampo: "estadoCivil" }]);
    const dup = await sugerir({ estadoCivil: "VIUVO" });
    expect(dup.status).toBe(409);
    expect(dup.body.mensagem).toMatch(/Estado civil/);
    expect(escritas()).toHaveLength(0);
  });
  test("o que ele muda sozinho não vira pedido (contato, vazio); departamento é da secretaria; valor inválido recusado", async () => {
    expect((await sugerir({ telefone: "(91) 90000-0000" })).body.mensagem).toMatch(/Meus Dados/);
    expect((await sugerir({ escolaridade: "MEDIO_COMPLETO" })).body.mensagem).toMatch(/está vazio/);
    expect((await sugerir({ departamentoId: 3 })).body.mensagem).toMatch(/secretaria/);
    expect((await sugerir({ dataBatismo: "2099-01-01" })).body.sucesso).toBe(false);
    expect((await sugerir({ cargoMinisterial: "PASTOR" })).body.mensagem).toMatch(/secretaria/);
    expect(escritas()).toHaveLength(0);
  });
  test("a resposta da secretaria (o motivo da recusa) chega ao membro; quem decidiu não", async () => {
    quando(/WHERE s\.MembroId = @m ORDER BY/, [{ SolicitacaoId: 3, DataSolicitacao: "2026-11-18T10:00:00", Status: "CONCLUIDA", CampoId: 30, NomeCampo: "dataBatismo",
      ValorAnterior: null, ValorProposto: "2001-03-04", StatusCampo: "REJEITADO", MotivoDecisao: "a data no livro é outra", DataDecisao: "2026-11-18T11:00:00" }]);
    const r = await chamar(hSugerir, { token: PIN(10), ligado: { matricula: "10" } });
    expect(r.body[0].campos[0]).toMatchObject({ status: "REJEITADO", motivo: "a data no livro é outra", rotulo: "Batismo nas águas" });
    expect(JSON.stringify(r.body)).not.toMatch(/decididoPor/);
  });
});
