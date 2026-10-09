// A integração do consentimento do responsável (v7.7) com o resto: a FOTO de menor de 18 anos (consentimentoFoto, MinhaFoto, UploadFotoMembro), a revogação do
// consentimento FOTO que agora EXCLUI o arquivo (GestaoConsentimentoLGPD), o bloco em Meus Dados (MeusDadosLGPD) e o ROPA/RIPD. Os handlers são os de verdade; o banco é
// simulado pelo TEXTO da consulta.
const fs = require("fs");
const path = require("path");

let mockRegras = [];
let mockConsultas = [];
jest.mock("../db", () => {
  const rodar = async (texto, inputs) => {
    mockConsultas.push({ sql: texto, inputs: { ...inputs } });
    for (const [padrao, valor, afetadas] of mockRegras) {
      if (padrao.test(texto)) return { recordset: typeof valor === "function" ? valor(inputs) : valor, recordsets: [], rowsAffected: [afetadas === undefined ? 1 : afetadas] };
    }
    return { recordset: [], recordsets: [], rowsAffected: [/^\s*(UPDATE|DELETE)\b/i.test(texto) ? 1 : 0] };
  };
  const novaRequisicao = () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: (texto) => rodar(texto, inputs) }; return r; };
  class Transaction { async begin() { } async commit() { } async rollback() { } }
  class Request { constructor() { return novaRequisicao(); } }
  const sql = new Proxy({ Transaction, Request }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : (typeof prop === "string" && /^[A-Z]/.test(prop) ? () => undefined : undefined)) });
  return { getPool: async () => ({ request: novaRequisicao }), sql };
});
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../storage", () => ({ urlComSas: (u) => u, salvarFoto: jest.fn(async (id) => `https://armazem/fotos-membros/membro-${id}`), excluirFoto: jest.fn(async () => {}) }));

const auth = require("../auth");
const mc = require("../menoresConsentimento");
const { registrarAuditoria } = require("../auditoria");
const storage = require("../storage");
const { situacaoDoConsentimentoFoto, fotoConsentimentoConcedido } = require("../consentimentoFoto");
const { sql } = require("../db");
const { REGISTROS_TRATAMENTO } = require("../ropa");
const { RIPDS } = require("../ripd");
const hMinhaFoto = require("../../MinhaFoto/index.js");
const hUploadFoto = require("../../UploadFotoMembro/index.js");
const hConsentimento = require("../../GestaoConsentimentoLGPD/index.js");
const hMeusDados = require("../../MeusDadosLGPD/index.js");

const nascidoHa = (anos) => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear() - anos, d.getUTCMonth(), d.getUTCDate() - 2)); };
const tokenDe = (membroId, extra = {}) => auth.reassinarSessao({ membroId, permissoes: [], escopoCongregacoes: [], termosPendentes: [], ...extra });
const SECRETARIA = (permissoes = ["pessoas"], escopo = ["Central"]) => tokenDe(5, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "CONGREGACAO", escopoCongregacoes: escopo, permissoes });
const JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString("base64");
const FOTO_URL = "https://armazem/fotos-membros/membro-30";

async function chamar(handler, { metodo = "GET", ligado = {}, query = {}, corpo = {}, token } = {}) {
  const context = { bindingData: ligado, log: { error() { }, info() { }, warn() { }, verbose() { } } };
  await handler(context, { method: metodo, query, body: corpo, headers: token ? { "x-auth-token": token } : {} });
  return context.res;
}
const quando = (padrao, valor, afetadas) => mockRegras.push([padrao, valor, afetadas]);
const escritas = () => mockConsultas.filter((c) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(c.sql));
const consultou = (padrao) => mockConsultas.some((c) => padrao.test(c.sql));

// Cenário da foto: o membro `id` tem a data de nascimento `nasc`; o consentimento do responsável (IMAGEM) e o genérico da própria pessoa são configuráveis.
function cenarioFoto({ nasc, fotoUrl = null, responsavel = null, proprio = null } = {}) {
  quando(/SELECT MembroId, FotoUrl FROM MembroReferencia WHERE MembroId = @id/, (i) => [{ MembroId: i.id, FotoUrl: fotoUrl }]);
  quando(/SELECT DataNascimento FROM MembroReferencia WHERE MembroId = @id/, [{ DataNascimento: nasc }]);
  if (responsavel) quando(/FROM MinisterioMenoresConsentimentos c JOIN MembroReferencia m/, [{ Concedido: responsavel.concedido ? 1 : 0, DataNascimento: nasc, ResponsavelAtivo: responsavel.ativo === false ? 0 : 1 }]);
  if (proprio) quando(/FROM ConsentimentosLGPD c1/, [{ Tipo: proprio, Concedido: true }]);
}

beforeEach(() => {
  mockRegras = []; mockConsultas = [];
  registrarAuditoria.mockClear(); storage.salvarFoto.mockClear(); storage.excluirFoto.mockClear();
});

describe("consentimentoFoto: menor de 18 anos não consente sozinho", () => {
  const situacao = (id = 30) => situacaoDoConsentimentoFoto({ request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (t) => { mockConsultas.push({ sql: t, inputs: { ...inputs } }); const regra = mockRegras.find(([p]) => p.test(t)); return { recordset: regra ? (typeof regra[1] === "function" ? regra[1](inputs) : regra[1]) : [] }; } }; return r; } }, sql, id);
  test("menor COM o consentimento de IMAGEM vigente do responsável: vale; o consentimento genérico da própria pessoa nem é consultado", async () => {
    cenarioFoto({ nasc: nascidoHa(10), responsavel: { concedido: true }, proprio: "FOTO" });
    expect(await situacao()).toEqual({ menor: true, concedido: true });
    expect(consultou(/FROM ConsentimentosLGPD/)).toBe(false);
  });
  test("menor que só tem o consentimento da PRÓPRIA pessoa (FOTO ou DADOS_CONTATO): NÃO vale", async () => {
    for (const tipo of ["FOTO", "DADOS_CONTATO"]) {
      mockRegras = []; mockConsultas = [];
      cenarioFoto({ nasc: nascidoHa(10), proprio: tipo });
      expect(await situacao()).toEqual({ menor: true, concedido: false });
    }
  });
  test("menor com consentimento REVOGADO, ou dado por responsável que saiu: não vale", async () => {
    cenarioFoto({ nasc: nascidoHa(10), responsavel: { concedido: false } });
    expect((await situacao()).concedido).toBe(false);
    mockRegras = []; mockConsultas = [];
    cenarioFoto({ nasc: nascidoHa(10), responsavel: { concedido: true, ativo: false } });
    expect((await situacao()).concedido).toBe(false);
  });
  test("17 anos ainda é menor; quem completa 18 volta ao consentimento da própria pessoa", async () => {
    cenarioFoto({ nasc: nascidoHa(17), proprio: "FOTO" });
    expect(await situacao()).toEqual({ menor: true, concedido: false });
    mockRegras = []; mockConsultas = [];
    cenarioFoto({ nasc: nascidoHa(18), proprio: "FOTO" });
    expect(await situacao()).toEqual({ menor: false, concedido: true });
  });
  test("adulto e idade DESCONHECIDA seguem exatamente como antes (consentimento FOTO ou DADOS_CONTATO da própria pessoa); o do responsável não é consultado", async () => {
    for (const nasc of [nascidoHa(40), null, undefined]) {
      mockRegras = []; mockConsultas = [];
      cenarioFoto({ nasc, proprio: "DADOS_CONTATO" });
      expect(await situacao()).toEqual({ menor: false, concedido: true });
      expect(consultou(/MinisterioMenoresConsentimentos/)).toBe(false);
    }
    mockRegras = []; mockConsultas = [];
    cenarioFoto({ nasc: nascidoHa(40) });
    expect(await situacao()).toEqual({ menor: false, concedido: false });
  });
  test("matrícula que não existe: sem data de nascimento, cai no caminho do adulto (e não há consentimento)", async () => {
    expect(await situacao(999)).toEqual({ menor: false, concedido: false });
  });
  test("fotoConsentimentoConcedido continua devolvendo só o booleano (os chamadores antigos não mudam)", async () => {
    cenarioFoto({ nasc: nascidoHa(10), responsavel: { concedido: true } });
    const pool = { request: () => { const inputs = {}; const r = { input: (n, _t, v) => { inputs[n] = v; return r; }, query: async (t) => { const regra = mockRegras.find(([p]) => p.test(t)); return { recordset: regra ? (typeof regra[1] === "function" ? regra[1](inputs) : regra[1]) : [] }; } }; return r; } };
    expect(await fotoConsentimentoConcedido(pool, sql, 30)).toBe(true);
  });
});

describe("MinhaFoto (o autoatendimento)", () => {
  const POST = (id, corpo = { fotoBase64: JPEG_BASE64, mimeType: "image/jpeg" }) => chamar(hMinhaFoto, { metodo: "POST", ligado: { matricula: String(id) }, token: tokenDe(id), corpo });
  test("o MENOR sem o consentimento do responsável: não envia, e a mensagem diz que o RESPONSÁVEL precisa autorizar; nada é salvo nem gravado", async () => {
    cenarioFoto({ nasc: nascidoHa(10), proprio: "DADOS_CONTATO" });          // a caixa dele mesmo (a única que a tela dele tinha) não destrava
    const r = await POST(30);
    expect(r.status).toBe(200);
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/o seu responsável precisa autorizar o uso da sua imagem/);
    expect(storage.salvarFoto).not.toHaveBeenCalled();
    expect(escritas()).toHaveLength(0);
  });
  test("o menor COM o consentimento de IMAGEM do responsável envia a foto", async () => {
    cenarioFoto({ nasc: nascidoHa(10), responsavel: { concedido: true } });
    const r = await POST(30);
    expect(r.body.sucesso).toBe(true);
    expect(storage.salvarFoto).toHaveBeenCalledWith("30", expect.any(Buffer), "image/jpeg");        // (a matrícula da rota chega em texto; o blob se chama membro-30)
    expect(escritas().some((c) => /UPDATE MembroReferencia SET FotoUrl = @url/.test(c.sql))).toBe(true);
  });
  test("o ADULTO: a mensagem e a regra de sempre", async () => {
    cenarioFoto({ nasc: nascidoHa(30) });
    const sem = await POST(20);
    expect(sem.body).toEqual({ sucesso: false, mensagem: "Conceda o consentimento de Foto antes de fazer o upload." });
    mockRegras = []; mockConsultas = [];
    cenarioFoto({ nasc: nascidoHa(30), proprio: "FOTO" });
    expect((await POST(20)).body.sucesso).toBe(true);
  });
  test("GET: informa `menorDeIdade` e o consentimento que vale (o do responsável, para o menor)", async () => {
    cenarioFoto({ nasc: nascidoHa(10), fotoUrl: FOTO_URL, responsavel: { concedido: true } });
    const menor = await chamar(hMinhaFoto, { ligado: { matricula: "30" }, token: tokenDe(30) });
    expect(menor.body).toMatchObject({ sucesso: true, consentimentoConcedido: true, menorDeIdade: true, fotoUrl: FOTO_URL });
    mockRegras = []; mockConsultas = [];
    cenarioFoto({ nasc: nascidoHa(40), proprio: "FOTO" });
    expect((await chamar(hMinhaFoto, { ligado: { matricula: "20" }, token: tokenDe(20) })).body).toMatchObject({ consentimentoConcedido: true, menorDeIdade: false });
  });
});

describe("UploadFotoMembro (a Secretaria)", () => {
  const pessoa = (id) => quando(/SELECT m\.MembroId, m\.Nome, m\.Status, c\.Nome AS CongregacaoNome/, [{ MembroId: id, Nome: "Caio", Status: "ATIVO", CongregacaoNome: "Central", ExtensaoNome: null }]);
  const ENVIAR = (id) => chamar(hUploadFoto, { metodo: "POST", ligado: { membroId: String(id) }, token: SECRETARIA(), corpo: { fotoBase64: JPEG_BASE64, mimeType: "image/jpeg" } });
  test("menor sem o consentimento do responsável: a Secretaria é avisada de que o RESPONSÁVEL precisa autorizar, e nada é salvo", async () => {
    pessoa(30);
    cenarioFoto({ nasc: nascidoHa(12), proprio: "FOTO" });
    const r = await ENVIAR(30);
    expect(r.body.sucesso).toBe(false);
    expect(r.body.mensagem).toMatch(/responsável precisa autorizar o uso da imagem/);
    expect(storage.salvarFoto).not.toHaveBeenCalled();
    expect(escritas()).toHaveLength(0);
  });
  test("menor com o consentimento do responsável (digital ou ficha): salva", async () => {
    pessoa(30);
    cenarioFoto({ nasc: nascidoHa(12), responsavel: { concedido: true } });
    expect((await ENVIAR(30)).body.sucesso).toBe(true);
    expect(storage.salvarFoto).toHaveBeenCalledWith(30, expect.any(Buffer), "image/jpeg");
  });
  test("adulto: a regra e a mensagem de sempre", async () => {
    pessoa(20);
    cenarioFoto({ nasc: nascidoHa(35) });
    const r = await ENVIAR(20);
    expect(r.body).toEqual({ sucesso: false, mensagem: "Registre o consentimento de Foto (LGPD) antes de fazer o upload." });
    mockRegras = []; mockConsultas = [];
    pessoa(20);
    cenarioFoto({ nasc: nascidoHa(35), proprio: "FOTO" });
    expect((await ENVIAR(20)).body.sucesso).toBe(true);
  });
});

describe("GestaoConsentimentoLGPD: revogar o consentimento FOTO exclui o arquivo", () => {
  const membro = (fotoUrl, nasc = null) => quando(/SELECT MembroId, FotoUrl, DataNascimento FROM MembroReferencia WHERE MembroId = @mat/, [{ MembroId: 20, FotoUrl: fotoUrl, DataNascimento: nasc }]);
  const POST = (corpo, token = tokenDe(20)) => chamar(hConsentimento, { metodo: "POST", ligado: { matricula: "20" }, token, corpo });
  test("o titular revoga a FOTO: grava a revogação, zera a referência, exclui o blob e audita (sem a URL)", async () => {
    membro("https://armazem/fotos-membros/membro-20");
    const r = await POST({ tipo: "FOTO", concedido: false });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sucesso: true, fotoApagada: true });
    expect(r.body.mensagem).toMatch(/Consentimento revogado\. O arquivo da foto foi apagado/);
    const gravou = escritas().map((c) => c.sql.replace(/\s+/g, " ").trim());
    expect(gravou).toHaveLength(2);
    expect(gravou[0]).toMatch(/^INSERT INTO ConsentimentosLGPD/);
    expect(gravou[1]).toMatch(/^UPDATE MembroReferencia SET FotoUrl = NULL WHERE MembroId = @mat/);
    expect(mockConsultas.find((c) => /UPDATE MembroReferencia SET FotoUrl = NULL/.test(c.sql)).inputs).toEqual({ mat: 20 });
    expect(storage.excluirFoto).toHaveBeenCalledWith(20);
    const acoes = registrarAuditoria.mock.calls.map((c) => c[0]);
    expect(acoes.map((a) => a.acao)).toEqual(["Revogou consentimento LGPD", "Excluiu a foto (consentimento de foto revogado)"]);
    expect(JSON.stringify(acoes)).not.toMatch(/armazem|membro-20/);
  });
  test("sem foto guardada: revoga igual, não finge que apagou (fotoApagada:false), mas o blob órfão é limpo de qualquer forma", async () => {
    membro(null);
    const r = await POST({ tipo: "FOTO", concedido: false });
    expect(r.body).toMatchObject({ sucesso: true, fotoApagada: false, mensagem: "✅ Consentimento revogado." });
    expect(storage.excluirFoto).toHaveBeenCalledWith(20);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
  test("a Secretaria (permissão pessoas, congregação no escopo) também revoga a FOTO e o arquivo é apagado", async () => {
    membro("https://armazem/fotos-membros/membro-20");
    quando(/SELECT c\.Nome AS CongregacaoNome, e\.Nome AS ExtensaoNome FROM MembroReferencia m/, [{ CongregacaoNome: "Central", ExtensaoNome: null }]);
    const r = await POST({ tipo: "FOTO", concedido: false }, SECRETARIA());
    expect(r.body.fotoApagada).toBe(true);
    expect(storage.excluirFoto).toHaveBeenCalledWith(20);
  });
  test("a Secretaria FORA do escopo é recusada (403) e nada é apagado", async () => {
    membro("https://armazem/fotos-membros/membro-20");
    quando(/SELECT c\.Nome AS CongregacaoNome, e\.Nome AS ExtensaoNome FROM MembroReferencia m/, [{ CongregacaoNome: "Vila Nova", ExtensaoNome: null }]);
    const r = await POST({ tipo: "FOTO", concedido: false }, SECRETARIA());
    expect(r.status).toBe(403);
    expect(storage.excluirFoto).not.toHaveBeenCalled();
    expect(escritas()).toHaveLength(0);
  });
  test("conceder a FOTO, ou revogar o DADOS_CONTATO (telefone e e-mail): NÃO mexem na foto", async () => {
    membro("https://armazem/fotos-membros/membro-20");
    expect((await POST({ tipo: "FOTO", concedido: true })).body).toMatchObject({ sucesso: true, fotoApagada: false, mensagem: "✅ Consentimento registrado." });
    const contato = await POST({ tipo: "DADOS_CONTATO", concedido: false });
    expect(contato.body).toMatchObject({ sucesso: true, fotoApagada: false, mensagem: "✅ Consentimento revogado." });
    expect(storage.excluirFoto).not.toHaveBeenCalled();
    expect(mockConsultas.some((c) => /UPDATE MembroReferencia/.test(c.sql))).toBe(false);
  });
  test("menor de 18 anos: NÃO se registra o consentimento de FOTO da pessoa (quem autoriza é o responsável); revogar continua valendo; adulto e idade desconhecida seguem como antes", async () => {
    membro("https://armazem/fotos-membros/membro-20", new Date(Date.now() - 12 * 365 * 86400000));
    const recusa = await POST({ tipo: "FOTO", concedido: true });
    expect(recusa.status).toBe(422);
    expect(recusa.body).toMatchObject({ sucesso: false, mensagem: expect.stringMatching(/menor de 18 anos.*autorização do responsável/) });
    expect(escritas()).toHaveLength(0);
    const revoga = await POST({ tipo: "FOTO", concedido: false });
    expect(revoga.body).toMatchObject({ sucesso: true, fotoApagada: true });
  });
  test("adulto e idade desconhecida registram o consentimento de FOTO como sempre", async () => {
    membro(null, new Date("1990-01-01"));
    expect((await POST({ tipo: "FOTO", concedido: true })).body.sucesso).toBe(true);
    mockRegras.length = 0;
    membro(null, null);
    expect((await POST({ tipo: "FOTO", concedido: true })).body.sucesso).toBe(true);
  });
  test("o tipo por omissão é DADOS_CONTATO: revogar sem dizer o tipo não apaga a foto", async () => {
    membro("https://armazem/fotos-membros/membro-20");
    await POST({ concedido: false });
    expect(storage.excluirFoto).not.toHaveBeenCalled();
  });
});

describe("MeusDadosLGPD: o bloco do consentimento do responsável", () => {
  test("o titular recebe `consentimentosMenores`: o que autorizou como responsável (com o IP dele) e o que foi autorizado sobre ele quando menor (sem o IP do responsável)", async () => {
    quando(/m\.FotoUrl AS fotoUrl/, [{ membroId: 40, nome: "Maria", status: "ATIVO", situacaoMembro: "EM_COMUNHAO", dataNascimento: null, dataAdmissao: null, fotoUrl: null }]);
    quando(/WHERE c\.ResponsavelMembroId = @m/, [{ Finalidade: "IMAGEM", Concedido: 1, TextoVersao: 1, TextoHash: mc.textoDe("IMAGEM").hash, Forma: "CLICK_RESP", RegistradoEm: new Date("2026-10-01T12:00:00Z"), EnderecoIp: "177.8.9.10", CadeiaCabecalhos: "{}", Referencia: null, RegistradoPorMembroId: null, Menor: "Caio" }]);
    quando(/WHERE c\.MenorMembroId = @m/, [{ Finalidade: "SAUDE_CRACHA", Concedido: 0, TextoVersao: 1, TextoHash: mc.textoDe("SAUDE_CRACHA").hash, Forma: "FICHA_FISICA", RegistradoEm: new Date("2016-10-01T12:00:00Z"), Referencia: "Ficha 3", RegistradoPorMembroId: 5, Responsavel: "Maria" }]);
    const r = await chamar(hMeusDados, { ligado: { matricula: "40" }, token: tokenDe(40) });
    expect(r.status).toBe(200);
    const b = r.body.consentimentosMenores;
    expect(b.comoResponsavel).toHaveLength(1);
    expect(b.comoResponsavel[0]).toMatchObject({ menor: "Caio", situacao: "Autorizou", enderecoIp: "177.8.9.10" });
    expect(b.comoMenor).toHaveLength(1);
    expect(b.comoMenor[0]).toMatchObject({ responsavel: "Maria", situacao: "Revogou", registradaPelaSecretaria: true, referencia: "Ficha 3" });
    expect(JSON.stringify(b.comoMenor)).not.toMatch(/enderecoIp|cadeia|177\.8/);
    expect(JSON.stringify(b)).not.toMatch(/RegistradoPorMembroId|"registradoPor"/);
  });
  test("quem não tem nada recebe o bloco vazio (e o resto do pacote continua igual)", async () => {
    quando(/m\.FotoUrl AS fotoUrl/, [{ membroId: 40, nome: "Maria", status: "ATIVO", situacaoMembro: "EM_COMUNHAO", dataNascimento: null, dataAdmissao: null, fotoUrl: null }]);
    const r = await chamar(hMeusDados, { ligado: { matricula: "40" }, token: tokenDe(40) });
    expect(r.body.consentimentosMenores).toMatchObject({ comoResponsavel: [], comoMenor: [] });
    for (const chave of ["membro", "voluntariado", "setoresTecnicos", "vistoriasAntecedentes", "consentimentos"]) expect(r.body).toHaveProperty(chave);
  });
  test("só o próprio titular: matrícula de outro continua 403, sem consultar o consentimento", async () => {
    const r = await chamar(hMeusDados, { ligado: { matricula: "41" }, token: tokenDe(40) });
    expect(r.status).toBe(403);
    expect(consultou(/MinisterioMenoresConsentimentos/)).toBe(false);
  });
});

describe("ROPA e RIPD", () => {
  const migracoes = fs.readdirSync(path.join(__dirname, "..", "..", "..", "sql", "migrations")).filter((f) => f.endsWith(".sql")).map((f) => fs.readFileSync(path.join(__dirname, "..", "..", "..", "sql", "migrations", f), "utf8")).join("\n");
  const existe = (tabela) => new RegExp(`CREATE TABLE (dbo\\.)?${tabela}\\b`, "i").test(migracoes);

  test("a entrada CONSENTIMENTO_MENOR existe, só cita tabelas que EXISTEM e descreve o que mudou (IP, hash, revogação que apaga a foto)", () => {
    const e = REGISTROS_TRATAMENTO.find((r) => r.chave === "CONSENTIMENTO_MENOR");
    expect(e).toBeDefined();
    expect(e.tabelasEnvolvidas).toEqual(["MinisterioMenoresConsentimentos", "VoluntariadoResponsaveis"]);
    for (const t of e.tabelasEnvolvidas) expect(existe(t)).toBe(true);
    for (const campo of ["finalidade", "titulares", "baseLegal", "retencao"]) expect(typeof e[campo]).toBe("string");
    expect(Array.isArray(e.categoriasDados)).toBe(true);
    expect(e.baseLegal).toMatch(/Art\. 14, § 1º/);
    expect(e.baseLegal).toMatch(/Art\. 11, I/);
    expect(e.baseLegal).toMatch(/NÃO condiciona/);
    expect(e.categoriasDados.join(" ")).toMatch(/ENDEREÇO IP/);
    expect(e.retencao).toMatch(/Revogar a imagem apaga o arquivo da foto/);
    expect(e.retencao).toMatch(/anonimizados 5 anos/);
  });
  test("as chaves do ROPA são únicas e a FOTO agora fala do menor e da exclusão do arquivo na revogação", () => {
    const chaves = REGISTROS_TRATAMENTO.map((r) => r.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    const foto = REGISTROS_TRATAMENTO.find((r) => r.chave === "FOTO");
    expect(foto.baseLegal).toMatch(/Menor de 18 anos: só vale o consentimento específico do responsável legal/);
    expect(foto.retencao).toMatch(/exclui o arquivo na hora/);
  });
  test("RIPD: o consentimento parental específico deixou de ser um 'gap conhecido' e o que passou a existir está descrito", () => {
    const menor = RIPDS.find((r) => r.chave === "DADO_DE_MENOR");
    expect(JSON.stringify(menor)).not.toMatch(/gap conhecido|não há hoje um consentimento parental/);
    const medidas = menor.medidasMitigacao.join(" ");
    expect(medidas).toMatch(/consentimento parental ESPECÍFICO e em destaque/);
    expect(medidas).toMatch(/revogar a imagem apaga o arquivo da foto/);
    expect(medidas).toMatch(/idade desconhecida não se presume/);
    expect(menor.riscoResidual).toMatch(/passou a existir/);
    const foto = RIPDS.find((r) => r.chave === "FOTO");
    expect(foto.medidasMitigacao.join(" ")).toMatch(/Menor de 18 anos: o upload só passa com o consentimento de IMAGEM do responsável/);
  });
  test("RIPD: a saúde em evento continua 'ainda sem dado de saúde' — o consentimento já existe, o dado chega com o check-in da v7.10", () => {
    const saude = RIPDS.find((r) => r.chave === "DADO_DE_SAUDE_EM_EVENTO");
    expect(saude.tratamento).toMatch(/ainda sem dado de saúde/);
    expect(saude.tratamento).toMatch(/consentimento já existe/);
    expect(saude.tratamento).toMatch(/v7\.10/);
    expect(saude.riscoIdentificado).toBeNull();
    expect(saude.medidasMitigacao).toEqual([]);
  });
});
