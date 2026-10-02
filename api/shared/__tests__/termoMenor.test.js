// Termo do menor aceito pelo RESPONSÁVEL LEGAL (fecho da v7.5): o texto e o hash, quem pode ser responsável, a vigência por idade e as funções de banco com pool
// simulado (as recusas antes de gravar, o que é gravado e o que NÃO vai para a auditoria). O comportamento contra o SQL Server de verdade está no roteiro ponta a ponta.
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../canaisDb", () => ({ ...jest.requireActual("../canaisDb"), notificarAgora: jest.fn(async () => ({ criadas: 1 })) }));
jest.mock("../trilhas", () => ({ filtrarMembrosQueAtendem: jest.fn(async () => ({ temRequisitos: false, atendem: new Set(), bloqueados: new Map() })) }));
jest.mock("../psc", () => ({ resolverDestinatariosDaCongregacao: jest.fn(async () => []) }));

const crypto = require("crypto");
const vol = require("../voluntariado");
const db = require("../voluntariadoDb");
const { registrarAuditoria } = require("../auditoria");
const { criarPoolFalso } = require("./testUtils");

const HOJE = "2026-10-01";
const nascidoHa = (anos, dias = 0) => { const [a, m, d] = HOJE.split("-").map(Number); return new Date(Date.UTC(a - anos, m - 1, d + dias)); };
const pessoa = (id, nome, nasc, extra = {}) => ({ MembroId: id, Nome: nome, Email: `${nome.toLowerCase()}@exemplo.org`, DataNascimento: nasc, CongregacaoId: 1, CongregacaoNome: "Central", ...extra });
const menor = (extra = {}) => pessoa(30, "Caio", nascidoHa(15), extra);
const mae = (extra = {}) => pessoa(40, "Maria", nascidoHa(40), extra);
const todos = { podeCongregacao: () => true };
const soVilaNova = { podeCongregacao: (n) => n === "Vila Nova" };
const dadosResp = (extra = {}) => ({ vinculo: "mae", documento: "Certidão de nascimento conferida em 01/10/2026", ...extra });

beforeEach(() => registrarAuditoria.mockClear());

describe("a Autorização do Responsável (texto, versão e hash)", () => {
  test("cobre o que o responsável precisa autorizar e cada item cita o dispositivo", () => {
    const t = vol.termoMenorVigente();
    expect(t.itens.map(i => i.codigo)).toEqual(["RESPONSAVEL", "ADESAO", "IDADE", "SUPERVISAO", "LIBERDADE", "DADOS", "MAIORIDADE", "REGISTRO"]);
    for (const i of t.itens) { expect(i.texto.length).toBeGreaterThan(60); expect(i.base.length).toBeGreaterThan(8); }
    const todo = t.itens.map(i => i.texto).join(" ");
    expect(todo).toMatch(/sem pagamento e sem vínculo de emprego/);                               // a natureza voluntária do Termo do adulto vale para o menor
    expect(todo).toMatch(/nunca à noite \(das 22h às 5h\)/);                                       // trabalho noturno, perigoso, insalubre: vedado ao menor
    expect(todo).toMatch(/Abaixo de 16 anos .* sem encargo de trabalho/);
    expect(todo).toMatch(/supervisão de um adulto/);
    expect(todo).toMatch(/revogar esta autorização/);                                              // o responsável pode voltar atrás
    expect(todo).toMatch(/não usa a imagem nem a voz/);
    expect(todo).toMatch(/até o\(a\) menor completar 18 anos/);                                    // vale só até a maioridade
    expect(todo).toMatch(/meu IP, a data e a hora/);                                               // transparência com o responsável
    const bases = t.itens.map(i => i.base).join(" | ");
    for (const lei of [/Código Civil/, /Lei 9\.608/, /ECA/, /LGPD, art\. 14/, /Constituição, art\. 7º, XXXIII/]) expect(bases).toMatch(lei);
    expect(t.aceite).toMatch(/como responsável legal, autorizo/);
  });
  test("o hash é do conteúdo E do Termo de Adesão que ele cita: mudar qualquer um dos dois muda o hash", () => {
    const calc = (extra = {}) => crypto.createHash("sha256").update(JSON.stringify({ v: vol.TERMO_MENOR_VERSAO, t: vol.TERMO_MENOR_TITULO, i: vol.TERMO_MENOR_ITENS, a: vol.TERMO_MENOR_ACEITE, b: vol.TERMO_HASH, ...extra })).digest("hex");
    expect(vol.TERMO_MENOR_HASH).toBe(calc());
    expect(calc({ b: "outro-hash-do-termo-do-adulto" })).not.toBe(vol.TERMO_MENOR_HASH);
    expect(calc({ i: vol.TERMO_MENOR_ITENS.map((x, k) => k === 0 ? { ...x, texto: x.texto + "." } : x) })).not.toBe(vol.TERMO_MENOR_HASH);
    expect(vol.termoMenorVigente().termoBase).toEqual({ versao: vol.TERMO_VERSAO, hash: vol.TERMO_HASH });
  });
  test("o texto cita a versão do Termo de Adesão que o responsável leu (se esse texto mudar de versão, a Autorização precisa acompanhar)", () => {
    expect(vol.TERMO_MENOR_ITENS.find(i => i.codigo === "ADESAO").texto).toContain(`versão ${vol.TERMO_VERSAO}`);
  });
  test("devolve cópia: mexer no resultado não altera o texto de verdade", () => {
    const t = vol.termoMenorVigente(); t.itens[0].texto = "adulterado";
    expect(vol.TERMO_MENOR_ITENS[0].texto).not.toBe("adulterado");
  });
  test("a integridade da adesão do responsável é conferida contra o texto da Autorização, não contra o do adulto", () => {
    expect(vol.avaliarIntegridadeAdesao({ forma: "CLICK_RESP", termoVersao: vol.TERMO_MENOR_VERSAO, termoHash: vol.TERMO_MENOR_HASH }).status).toBe("OK");
    expect(vol.avaliarIntegridadeAdesao({ forma: "CLICK_RESP", termoVersao: vol.TERMO_MENOR_VERSAO, termoHash: vol.TERMO_HASH }).status).toBe("DIVERGENTE");
    expect(vol.avaliarIntegridadeAdesao({ forma: "CLICKWRAP", termoVersao: vol.TERMO_VERSAO, termoHash: vol.TERMO_MENOR_HASH }).status).toBe("DIVERGENTE");
    expect(vol.FORMAS_ADESAO.CLICK_RESP).toMatch(/responsável legal/);
  });
});

describe("quem a Secretaria pode cadastrar como responsável", () => {
  const ok = (extra = {}, idades = {}) => vol.validarDesignacaoResponsavel(dadosResp(extra), { idadeMenor: 15, idadeResponsavel: 40, ...idades });
  test("menor conhecido (<18), responsável adulto conhecido, vínculo da lista e documento descrito", () => {
    const r = ok();
    expect(r.valido).toBe(true);
    expect(r.dados).toEqual({ vinculo: "MAE", documento: "Certidão de nascimento conferida em 01/10/2026" });
    for (const v of ["PAI", "mae", "Tutor", "RESPONSAVEL_LEGAL"]) expect(ok({ vinculo: v }).valido).toBe(true);
    expect(ok({}, { idadeMenor: 17, idadeResponsavel: 18 }).valido).toBe(true);
  });
  test("recusas, cada uma com o motivo", () => {
    expect(ok({}, {}).valido).toBe(true);
    expect(vol.validarDesignacaoResponsavel(dadosResp(), { idadeMenor: 15, idadeResponsavel: 40, mesmaPessoa: true }).mensagem).toMatch(/própria pessoa/);
    expect(ok({}, { idadeMenor: null }).mensagem).toMatch(/data de nascimento/);
    expect(ok({}, { idadeMenor: 18 }).mensagem).toMatch(/18 anos ou mais: ela mesma adere/);
    expect(ok({}, { idadeResponsavel: null }).mensagem).toMatch(/data de nascimento/);
    expect(ok({}, { idadeResponsavel: 17 }).mensagem).toMatch(/18 anos ou mais/);
    for (const v of ["", "AMIGO", "AVO", undefined, null]) expect(ok({ vinculo: v }).mensagem).toMatch(/vínculo/);
    for (const doc of ["", "ab", "x".repeat(201), "<b>RG</b>", "   ", undefined]) expect(ok({ documento: doc }).mensagem).toMatch(/documento/i);
  });
});

describe("o aceite digital do responsável", () => {
  const ok = (extra = {}) => vol.validarAceiteResponsavel({ aceito: true, ip: "177.87.165.132", idadeMenor: 15, idadeResponsavel: 40, ...extra });
  test("vale com a caixa marcada de verdade, IP e as duas idades conhecidas", () => {
    expect(ok().valido).toBe(true);
    expect(ok({ idadeMenor: 17, idadeResponsavel: 18 }).valido).toBe(true);
  });
  test("menor já com 18 anos ou idade desconhecida: não vale (ele mesmo adere / completar o cadastro)", () => {
    expect(ok({ idadeMenor: 18 }).mensagem).toMatch(/ela mesma adere/);
    expect(ok({ idadeMenor: null }).mensagem).toMatch(/data de nascimento/);
  });
  test("responsável sem 18 anos ou sem data de nascimento: não vale", () => {
    for (const idadeResponsavel of [17, 10, null, undefined]) expect(ok({ idadeResponsavel }).valido).toBe(false);
  });
  test("caixa só vale com true de verdade, e o IP é obrigatório", () => {
    for (const aceito of [false, "true", 1, null, undefined, "on"]) expect(ok({ aceito }).valido).toBe(false);
    expect(ok({ ip: null }).mensagem).toMatch(/IP/);
  });
});

describe("a adesão dada pelo responsável vale só enquanto a pessoa é menor", () => {
  test("adesão da própria pessoa vale sempre; a do responsável vence aos 18 anos; idade desconhecida não vence", () => {
    expect(vol.adesaoVigente(null, 30)).toBe(false);
    expect(vol.adesaoVigente({ responsavelNome: null }, 30)).toBe(true);
    expect(vol.adesaoVigente({ responsavelNome: "Maria" }, 15)).toBe(true);
    expect(vol.adesaoVigente({ responsavelNome: "Maria" }, 17)).toBe(true);
    expect(vol.adesaoVigente({ responsavelNome: "Maria" }, 18)).toBe(false);
    expect(vol.adesaoVigente({ responsavelNome: "Maria" }, 40)).toBe(false);
    expect(vol.adesaoVigente({ responsavelNome: "Maria" }, null)).toBe(true);
  });
});

describe("cadastrar o responsável (Secretaria)", () => {
  test("menor inexistente e menor fora do escopo recebem a MESMA recusa (403), sem consultar mais nada", async () => {
    const inexistente = await db.designarResponsavel(criarPoolFalso([[]]).pool, { menorId: 30, responsavelId: 40, dados: dadosResp(), por: 5, autorizacao: todos, hoje: HOJE });
    const { pool, chamadas } = criarPoolFalso([[menor()]]);
    const fora = await db.designarResponsavel(pool, { menorId: 30, responsavelId: 40, dados: dadosResp(), por: 5, autorizacao: soVilaNova, hoje: HOJE });
    expect(inexistente).toMatchObject({ sucesso: false, proibido: true });
    expect(fora).toEqual(inexistente);
    expect(chamadas).toHaveLength(1);
  });
  test("quem cadastra não pode ser o próprio responsável: recusado antes de consultar o responsável (separação de funções)", async () => {
    const { pool, chamadas } = criarPoolFalso([[menor()]]);
    const r = await db.designarResponsavel(pool, { menorId: 30, responsavelId: 40, dados: dadosResp(), por: 40, autorizacao: todos, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: false });
    expect(r.mensagem).toMatch(/Quem cadastra não pode ser o próprio responsável/);
    expect(chamadas).toHaveLength(1);                                                              // só leu o menor
    expect(registrarAuditoria).not.toHaveBeenCalled();
    const texto = await db.designarResponsavel(criarPoolFalso([[menor()]]).pool, { menorId: 30, responsavelId: "40", dados: dadosResp(), por: 40, autorizacao: todos, hoje: HOJE });
    expect(texto.mensagem).toMatch(/Quem cadastra não pode ser/);                                  // "40" e 40 são a mesma matrícula
  });
  test("responsável FORA do escopo de quem cadastra recebe a mesma resposta de 'não existe' (o cadastro não vira sonda de matrículas)", async () => {
    const inexistente = await db.designarResponsavel(criarPoolFalso([[menor({ CongregacaoNome: "Vila Nova" })], []]).pool, { menorId: 30, responsavelId: 40, dados: dadosResp(), por: 5, autorizacao: soVilaNova, hoje: HOJE });
    const { pool, chamadas } = criarPoolFalso([[menor({ CongregacaoNome: "Vila Nova" })], [mae({ CongregacaoNome: "Central" })]]);
    const fora = await db.designarResponsavel(pool, { menorId: 30, responsavelId: 40, dados: dadosResp(), por: 5, autorizacao: soVilaNova, hoje: HOJE });
    expect(fora).toEqual(inexistente);
    expect(fora.mensagem).toMatch(/Responsável não encontrado nas congregações do seu escopo/);
    expect(chamadas).toHaveLength(2);                                                              // não chegou a contar responsáveis nem gravar
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("responsável inexistente; dados inválidos; limite de responsáveis por menor", async () => {
    expect((await db.designarResponsavel(criarPoolFalso([[menor()], []]).pool, { menorId: 30, responsavelId: 40, dados: dadosResp(), por: 5, autorizacao: todos, hoje: HOJE })).mensagem).toMatch(/Responsável não encontrado/);
    expect((await db.designarResponsavel(criarPoolFalso([[menor()], [mae()]]).pool, { menorId: 30, responsavelId: 40, dados: dadosResp({ vinculo: "AMIGO" }), por: 5, autorizacao: todos, hoje: HOJE })).mensagem).toMatch(/vínculo/);
    const cheio = await db.designarResponsavel(criarPoolFalso([[menor()], [mae()], [{ n: vol.MAX_RESPONSAVEIS_POR_MENOR }]]).pool, { menorId: 30, responsavelId: 40, dados: dadosResp(), por: 5, autorizacao: todos, hoje: HOJE });
    expect(cheio.mensagem).toMatch(new RegExp(`${vol.MAX_RESPONSAVEIS_POR_MENOR} responsáveis`));
    expect((await db.designarResponsavel(criarPoolFalso([[menor()], [mae({ DataNascimento: nascidoHa(16) })]]).pool, { menorId: 30, responsavelId: 40, dados: dadosResp(), por: 5, autorizacao: todos, hoje: HOJE })).mensagem).toMatch(/18 anos ou mais/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("grava a designação e audita só os números (nome e documento ficam na tabela, não na trilha imutável)", async () => {
    const { pool, chamadas } = criarPoolFalso([[menor()], [mae()], [{ n: 0 }], [{ id: 12 }]]);
    const r = await db.designarResponsavel(pool, { menorId: 30, responsavelId: 40, dados: dadosResp(), por: 5, autorizacao: todos, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: true, responsavelId: 12 });
    expect(r.mensagem).toMatch(/Maria cadastrado\(a\) como mãe de Caio/);
    expect(chamadas[3].sql).toMatch(/INSERT INTO VoluntariadoResponsaveis/);
    expect(chamadas[3].inputs).toMatchObject({ mn: 30, rs: 40, v: "MAE", por: 5 });
    const aud = registrarAuditoria.mock.calls[0][0];
    expect(aud).toMatchObject({ tabela: "VoluntariadoResponsaveis", registroId: 12, acao: "RESPONSAVEL_CADASTRADO", usuarioId: 5 });
    expect(JSON.stringify(aud)).not.toMatch(/Maria|Caio|Certidão/);
  });
  test("mesma pessoa cadastrada duas vezes: vira mensagem, não erro 500", async () => {
    const fila = [[menor()], [mae()], [{ n: 1 }]]; let i = 0;
    const pool = { request: () => { const r = { input: () => r, query: async () => { i++; if (i === 4) { const e = new Error("dup"); e.number = 2601; throw e; } return { recordset: fila.shift() || [] }; } }; return r; } };
    const r = await db.designarResponsavel(pool, { menorId: 30, responsavelId: 40, dados: dadosResp(), por: 5, autorizacao: todos, hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/já está cadastrado/);
  });
});

describe("revogar e listar (Secretaria)", () => {
  test("revoga uma vez; a segunda chamada (ou a corrida) recebe 'já foi revogado'; fora do escopo é 403", async () => {
    const linha = { ResponsavelId: 12, MenorMembroId: 30, RevogadoEm: null, CongregacaoNome: "Central" };
    const { pool, chamadas } = criarPoolFalso([[linha], [{ n: 1 }]]);
    const r = await db.revogarResponsavel(pool, { responsavelId: 12, por: 5, autorizacao: todos });
    expect(r.sucesso).toBe(true);
    expect(r.mensagem).toMatch(/Remover da escala/);
    expect(chamadas[1].sql).toMatch(/AND RevogadoEm IS NULL; SELECT @@ROWCOUNT/);
    expect(chamadas[1].sql).not.toMatch(/OUTPUT/);                                                   // a tabela tem gatilho: OUTPUT sem INTO não pode
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "RESPONSAVEL_REVOGADO", registroId: 12, usuarioId: 5 });
    expect((await db.revogarResponsavel(criarPoolFalso([[{ ...linha, RevogadoEm: new Date() }]]).pool, { responsavelId: 12, por: 5, autorizacao: todos })).mensagem).toMatch(/já foi revogado/);
    expect((await db.revogarResponsavel(criarPoolFalso([[linha], [{ n: 0 }]]).pool, { responsavelId: 12, por: 5, autorizacao: todos })).mensagem).toMatch(/já foi revogado/);
    expect(await db.revogarResponsavel(criarPoolFalso([[linha]]).pool, { responsavelId: 12, por: 5, autorizacao: soVilaNova })).toMatchObject({ proibido: true });
    expect(await db.revogarResponsavel(criarPoolFalso([[]]).pool, { responsavelId: 99, por: 5, autorizacao: todos })).toMatchObject({ proibido: true });
  });
  test("lista os responsáveis do menor, ativos e revogados, com o documento que a Secretaria conferiu", async () => {
    const { pool } = criarPoolFalso([[menor()], [
      { ResponsavelId: 12, ResponsavelMembroId: 40, ResponsavelNome: "Maria", Vinculo: "MAE", Documento: "Certidão", RegistradoEm: new Date("2026-09-01T10:00:00Z"), RevogadoEm: null },
      { ResponsavelId: 11, ResponsavelMembroId: 41, ResponsavelNome: "João", Vinculo: "PAI", Documento: "RG", RegistradoEm: new Date("2026-08-01T10:00:00Z"), RevogadoEm: new Date("2026-08-20T10:00:00Z") }]]);
    const r = await db.listarResponsaveisDoMenor(pool, { menorId: 30, autorizacao: todos });
    expect(r.sucesso).toBe(true);
    expect(r.responsaveis.map(x => [x.nome, x.rotuloVinculo, x.ativo])).toEqual([["Maria", "Mãe", true], ["João", "Pai", false]]);
    expect(await db.listarResponsaveisDoMenor(criarPoolFalso([[menor()]]).pool, { menorId: 30, autorizacao: soVilaNova })).toMatchObject({ sucesso: false, proibido: true });
  });
});

describe("o responsável vê os menores dele (sem a data de nascimento)", () => {
  test("a idade, a adesão que vale, e quem já completou 18 anos aparece como 'não é mais menor'", async () => {
    const { pool } = criarPoolFalso([[
      { MenorMembroId: 30, Vinculo: "MAE", Nome: "Caio", DataNascimento: nascidoHa(15), AdesaoId: null, Forma: null, DataAceite: null, AdesaoResponsavelNome: null },
      { MenorMembroId: 31, Vinculo: "MAE", Nome: "Dora", DataNascimento: nascidoHa(12), AdesaoId: 7, Forma: "CLICK_RESP", DataAceite: new Date("2026-09-10T00:00:00Z"), AdesaoResponsavelNome: "Maria" },
      { MenorMembroId: 32, Vinculo: "TUTOR", Nome: "Edu", DataNascimento: nascidoHa(18), AdesaoId: 8, Forma: "CLICK_RESP", DataAceite: new Date("2025-01-10T00:00:00Z"), AdesaoResponsavelNome: "Maria" }]]);
    const r = await db.menoresDoResponsavel(pool, 40, { hoje: HOJE });
    expect(r.map(x => [x.nome, x.idade, x.aindaMenor, x.aderiu])).toEqual([["Caio", 15, true, false], ["Dora", 12, true, true], ["Edu", 18, false, false]]);
    expect(r[1]).toMatchObject({ dataAceite: "2026-09-10", rotuloVinculo: "Mãe" });
    expect(JSON.stringify(r)).not.toMatch(/DataNascimento|20(08|14)-/);
  });
});

describe("o responsável aceita pelo menor", () => {
  const desig = [{ ResponsavelId: 12, Vinculo: "MAE" }];
  const aceitar = (pool, extra = {}) => db.aceitarDigitalResponsavel(pool, { responsavelId: 40, menorId: 30, aceito: true, ip: "177.87.165.132", cadeia: "{\"x-forwarded-for\":\"177.87.165.132:1\"}", hoje: HOJE, ...extra });

  test("caixa não marcada ou sem IP: nem consulta o banco", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect((await aceitar(pool, { aceito: false })).sucesso).toBe(false);
    expect((await aceitar(pool, { ip: null })).mensagem).toMatch(/IP/);
    expect(chamadas).toHaveLength(0);
  });
  test("quem não é o responsável ATIVO desse menor recebe 403, igual para menor inexistente: ninguém aceita pelo filho dos outros", async () => {
    const r1 = await aceitar(criarPoolFalso([[]]).pool);
    const r2 = await aceitar(criarPoolFalso([[]]).pool, { menorId: 999 });
    expect(r1).toMatchObject({ sucesso: false, proibido: true });
    expect(r2).toEqual(r1);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("menor que já fez 18 anos, menor sem data de nascimento e responsável menor de idade: recusa e nada é gravado", async () => {
    for (const [m, r, trecho] of [[menor({ DataNascimento: nascidoHa(18) }), mae(), /ela mesma adere/], [menor({ DataNascimento: null }), mae(), /data de nascimento/], [menor(), mae({ DataNascimento: nascidoHa(16) }), /18 anos ou mais/]]) {
      const { pool, chamadas } = criarPoolFalso([desig, [r], [m]]);
      const res = await aceitar(pool);
      expect(res.sucesso).toBe(false);
      expect(res.mensagem).toMatch(trecho);
      expect(chamadas.some(c => /INSERT/.test(c.sql))).toBe(false);
    }
  });
  test("menor que já tem adesão que vale: avisa e não grava de novo", async () => {
    const ja = { AdesaoId: 3, MembroId: 30, Forma: "FICHA_FISICA", DataAceite: new Date("2026-09-01T00:00:00Z"), ResponsavelNome: "Maria", ResponsavelVinculo: "MAE", TermoVersao: null, TermoHash: null, RegistradoEm: new Date() };
    const { pool, chamadas } = criarPoolFalso([desig, [mae()], [menor()], [ja]]);
    const r = await aceitar(pool);
    expect(r.mensagem).toMatch(/Caio já tem a adesão registrada em 01\/09\/2026/);
    expect(chamadas.some(c => /INSERT/.test(c.sql))).toBe(false);
  });
  test("grava a adesão CLICK_RESP com o responsável, o IP DELE, o vínculo cadastrado e o hash da Autorização; a auditoria não leva IP nem nome", async () => {
    const gravada = { AdesaoId: 9, MembroId: 30, Forma: "CLICK_RESP", TermoVersao: vol.TERMO_MENOR_VERSAO, TermoHash: vol.TERMO_MENOR_HASH, DataAceite: new Date("2026-10-01T00:00:00Z"), ResponsavelNome: "Maria", ResponsavelVinculo: "MAE", ResponsavelMembroId: 40, RegistradoEm: new Date() };
    const { pool, chamadas } = criarPoolFalso([desig, [mae()], [menor()], [], [{ id: 9 }], [gravada]]);
    const r = await aceitar(pool);
    expect(r.sucesso).toBe(true);
    const ins = chamadas[4];
    expect(ins.sql).toMatch(/INSERT INTO VoluntariadoAdesoes/);
    expect(ins.sql).toMatch(/'CLICK_RESP'/);
    expect(ins.inputs).toMatchObject({ m: 30, v: vol.TERMO_MENOR_VERSAO, h: vol.TERMO_MENOR_HASH, d: HOJE, ip: "177.87.165.132", rs: 40, rn: "Maria", rv: "MAE" });
    expect(r.adesao).toMatchObject({ forma: "CLICK_RESP", responsavelMembroId: 40, responsavelNome: "Maria", integridade: { status: "OK" } });
    const aud = registrarAuditoria.mock.calls[0][0];
    expect(aud).toMatchObject({ tabela: "VoluntariadoAdesoes", registroId: 9, acao: "ADESAO_REGISTRADA", usuarioId: 40 });
    expect(aud.dadosDepois).toEqual({ forma: "CLICK_RESP", membroId: 30, responsavelMembroId: 40, termoVersao: vol.TERMO_MENOR_VERSAO, termoHash: vol.TERMO_MENOR_HASH });
    expect(JSON.stringify(aud)).not.toMatch(/177\.87|Maria|Caio/);
  });
  test("o menor que acabou de fazer 18 anos com adesão do responsável pode ser autorizado de novo? NÃO — agora ele mesmo adere", async () => {
    const { pool } = criarPoolFalso([desig, [mae()], [menor({ DataNascimento: nascidoHa(18) })]]);
    expect((await aceitar(pool)).mensagem).toMatch(/ela mesma adere/);
  });
  test("dois aceites ao mesmo tempo: o segundo bate no índice único e vira mensagem", async () => {
    const fila = [desig, [mae()], [menor()], []]; let i = 0;
    const pool = { request: () => { const r = { input: () => r, query: async () => { i++; if (i === 5) { const e = new Error("dup"); e.number = 2601; throw e; } return { recordset: fila.shift() || [] }; } }; return r; } };
    const r = await aceitar(pool);
    expect(r).toMatchObject({ sucesso: false });
    expect(r.mensagem).toMatch(/já tem a adesão registrada/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe("a adesão do responsável não vale depois dos 18 anos: a pessoa renova", () => {
  const dadaPeloResponsavel = { AdesaoId: 7, MembroId: 30, Forma: "CLICK_RESP", DataAceite: new Date("2024-03-01T00:00:00Z"), ResponsavelNome: "Maria", ResponsavelVinculo: "MAE", TermoVersao: 1, TermoHash: "h", RegistradoEm: new Date() };
  test("situacaoDoTermo: com 18 anos ela volta a poder aderir, e o painel avisa que é renovação", async () => {
    const s = await db.situacaoDoTermo(criarPoolFalso([[dadaPeloResponsavel], [menor({ DataNascimento: nascidoHa(18) })]]).pool, 30, { hoje: HOJE });
    expect(s).toMatchObject({ aderiu: false, renovar: true, podeAderirDigital: true, menorDeIdade: false });
    expect(s.adesao.forma).toBe("CLICK_RESP");
    const aindaMenor = await db.situacaoDoTermo(criarPoolFalso([[dadaPeloResponsavel], [menor()]]).pool, 30, { hoje: HOJE });
    expect(aindaMenor).toMatchObject({ aderiu: true, renovar: false, podeAderirDigital: false, menorDeIdade: true });
  });
  test("aceitarDigital: quem completou 18 anos com adesão do responsável consegue aderir (insere a SUA adesão)", async () => {
    const nova = { ...dadaPeloResponsavel, AdesaoId: 8, Forma: "CLICKWRAP", ResponsavelNome: null, ResponsavelVinculo: null };
    const { pool, chamadas } = criarPoolFalso([[menor({ DataNascimento: nascidoHa(18) })], [dadaPeloResponsavel], [{ id: 8 }], [nova]]);
    const r = await db.aceitarDigital(pool, { membroId: 30, aceito: true, ip: "177.8.9.10", hoje: HOJE });
    expect(r.sucesso).toBe(true);
    expect(chamadas[2].sql).toMatch(/'CLICKWRAP'/);
  });
  test("registrarAdesaoManual: ficha do adulto também entra depois da adesão do responsável vencida", async () => {
    const { pool, chamadas } = criarPoolFalso([[menor({ DataNascimento: nascidoHa(19) })], [dadaPeloResponsavel], [{ id: 8 }], [{ ...dadaPeloResponsavel, AdesaoId: 8, Forma: "FICHA_FISICA", ResponsavelNome: null }]]);
    const r = await db.registrarAdesaoManual(pool, { membroId: 30, dados: { forma: "FICHA_FISICA", dataAceite: "2026-09-30", referencia: "Ficha nº 5" }, por: 5, hoje: HOJE });
    expect(r.sucesso).toBe(true);
    expect(chamadas[2].sql).toMatch(/INSERT INTO VoluntariadoAdesoes/);
  });
  test("cobertura: marca 'renovar' e a pessoa volta para o começo da lista (sem termo que vale)", async () => {
    const linhas = [
      { MembroId: 1, Nome: "Ana", DataNascimento: new Date("1980-01-01T00:00:00Z"), Equipes: "Som", AdesaoId: 2, Forma: "FICHA_FISICA", DataAceite: new Date("2026-01-01T00:00:00Z"), Referencia: "F1", ResponsavelNome: null, Responsaveis: 0 },
      { MembroId: 30, Nome: "Caio", DataNascimento: nascidoHa(18), Equipes: "Som", AdesaoId: 7, Forma: "CLICK_RESP", DataAceite: new Date("2024-03-01T00:00:00Z"), Referencia: null, ResponsavelNome: "Maria", Responsaveis: 1 },
      { MembroId: 31, Nome: "Dora", DataNascimento: nascidoHa(14), Equipes: "Som", AdesaoId: null, Forma: null, DataAceite: null, Referencia: null, ResponsavelNome: null, Responsaveis: 0 },
      { MembroId: 32, Nome: "Edu", DataNascimento: nascidoHa(14), Equipes: "Som", AdesaoId: 9, Forma: "CLICK_RESP", DataAceite: new Date("2026-02-01T00:00:00Z"), Referencia: null, ResponsavelNome: "Pai", Responsaveis: 1 }];
    const r = await db.coberturaDoTermo(criarPoolFalso([linhas]).pool, { congregacaoId: 1, hoje: HOJE });
    expect(r.voluntarios.map(v => [v.nome, v.aderiu, v.renovar, v.menor, v.responsaveis])).toEqual([
      ["Caio", false, true, false, 1], ["Dora", false, false, true, 0], ["Ana", true, false, false, 0], ["Edu", true, false, true, 1]]);
    expect(r).toMatchObject({ total: 4, comTermo: 2, semTermo: 2 });
  });
});

describe("Meus Dados: o IP do aceite do responsável é do responsável", () => {
  test("o menor não recebe o IP nem os cabeçalhos do aceite que o responsável deu; o responsável recebe os seus", async () => {
    const aceite = { AdesaoId: 9, Forma: "CLICK_RESP", TermoVersao: 1, TermoHash: "h", DataAceite: new Date("2026-10-01T00:00:00Z"), AceitoEm: new Date("2026-10-01T12:00:00Z"), EnderecoIp: "177.87.165.132", CadeiaCabecalhos: "{\"x\":1}",
      CanalMensageria: null, Referencia: null, ResponsavelNome: "Maria", ResponsavelVinculo: "MAE", RegistradoPorMembroId: null, RegistradoEm: new Date() };
    const comoMenor = await db.dadosDoTitular(criarPoolFalso([[aceite], [], [], [], [], [], [{ Vinculo: "MAE", RegistradoEm: new Date("2026-09-01T00:00:00Z"), RevogadoEm: null, Responsavel: "Maria" }], [], []]).pool, 30);
    expect(comoMenor.adesao).toMatchObject({ forma: "CLICK_RESP", enderecoIp: null, cadeiaCabecalhos: null, responsavelNome: "Maria", responsavelVinculo: "Mãe" });
    expect(JSON.stringify(comoMenor)).not.toContain("177.87.165.132");
    expect(comoMenor.responsaveisLegais).toEqual([{ nome: "Maria", vinculo: "Mãe", desde: expect.any(String), revogadoEm: null }]);
    const comoResponsavel = await db.dadosDoTitular(criarPoolFalso([[], [], [], [], [], [], [], [{ Vinculo: "MAE", RegistradoEm: new Date("2026-09-01T00:00:00Z"), RevogadoEm: null, Menor: "Caio" }],
      [{ DataAceite: new Date("2026-10-01T00:00:00Z"), AceitoEm: new Date("2026-10-01T12:00:00Z"), EnderecoIp: "177.87.165.132", CadeiaCabecalhos: "{\"x\":1}", TermoVersao: 1, TermoHash: "h", Menor: "Caio" }]]).pool, 40);
    expect(comoResponsavel.aceitesComoResponsavel).toEqual([expect.objectContaining({ menor: "Caio", dataAceite: "2026-10-01", enderecoIp: "177.87.165.132" })]);
    expect(comoResponsavel.menoresSobMinhaResponsabilidade).toEqual([expect.objectContaining({ menor: "Caio", vinculo: "Mãe" })]);
  });
  test("quem teve as duas adesões (menor e depois adulto) recebe as duas: a mais recente em `adesao`, a outra em `adesoesAnteriores`", async () => {
    const adulta = { AdesaoId: 12, Forma: "CLICKWRAP", TermoVersao: 1, TermoHash: "h", DataAceite: new Date("2026-10-01T00:00:00Z"), AceitoEm: new Date(), EnderecoIp: "177.8.9.10", CadeiaCabecalhos: null, CanalMensageria: null, Referencia: null, ResponsavelNome: null, ResponsavelVinculo: null, RegistradoPorMembroId: null, RegistradoEm: new Date() };
    const menorFase = { ...adulta, AdesaoId: 7, Forma: "CLICK_RESP", EnderecoIp: "177.87.165.132", ResponsavelNome: "Maria", ResponsavelVinculo: "MAE" };
    const r = await db.dadosDoTitular(criarPoolFalso([[adulta, menorFase], [], [], [], [], [], [], [], []]).pool, 30);
    expect(r.adesao).toMatchObject({ forma: "CLICKWRAP", enderecoIp: "177.8.9.10" });
    expect(r.adesoesAnteriores).toHaveLength(1);
    expect(r.adesoesAnteriores[0]).toMatchObject({ forma: "CLICK_RESP", enderecoIp: null });
  });
});
