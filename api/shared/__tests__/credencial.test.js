// v8.4 — Credencial digital: a regra pura (shared/credencial.js), o texto da migração 159 e o PDF do cartão. O banco e as rotas são provados no LocalDB
// (tools/e2e-localdb, e2e-59 e e2e-60).
const fs = require("fs");
const path = require("path");
const regra = require("../credencial");

const membro = (extra) => ({ nome: "Ana", congregacao: "Central", status: "ATIVO", situacaoMembro: "EM_COMUNHAO", cargo: null, statusMatricula: null, sobDisciplina: false, ...extra });
const valida = { situacao: "VALIDA", via: 1 };

describe("quem recebe a credencial", () => {
  test("membro ativo em plena comunhão", () => {
    expect(regra.podeReceber(membro()).pode).toBe(true);
    expect(regra.podeReceber(membro({ situacaoMembro: null })).pode).toBe(true);   // cadastro antigo sem a situação: ativo conta como em comunhão (estatuto)
  });
  test("congregado, desligado, sem comunhão e inexistente: não", () => {
    expect(regra.podeReceber(membro({ situacaoMembro: "CONGREGADO" })).mensagem).toMatch(/Congregado/);
    expect(regra.podeReceber(membro({ status: "DESLIGADO" })).pode).toBe(false);
    expect(regra.podeReceber(membro({ situacaoMembro: "SEM_COMUNHAO" })).mensagem).toMatch(/plena comunhão/);
    expect(regra.podeReceber(null).pode).toBe(false);
  });
});

describe("o que o QR mostra (Art. 76 §1º)", () => {
  test("membro ativo: só nome, categoria, congregação, via e a situação", () => {
    const r = regra.situacaoPublica(valida, membro());
    expect(r).toEqual({ situacao: "ATIVA", nome: "Ana", categoria: "Membro", congregacao: "Central", via: 1 });
    expect(r).not.toHaveProperty("funcao");
  });
  test("membro sem comunhão ou desligado: inativa (sem dizer o motivo)", () => {
    expect(regra.situacaoPublica(valida, membro({ situacaoMembro: "SEM_COMUNHAO" })).situacao).toBe("INATIVA");
    const d = regra.situacaoPublica(valida, membro({ status: "DESLIGADO" }));
    expect(d.situacao).toBe("INATIVA");
    expect(JSON.stringify(d)).not.toMatch(/DESLIGADO|motivo|disciplina/i);
  });
  test("obreiro: habilitado, ou inativo pela AFM (Art. 69 §3º) ou afastado (Art. 95 §2º, II, b)", () => {
    expect(regra.situacaoPublica(valida, membro({ cargo: "DIACONO", statusMatricula: "ATIVA" }))).toMatchObject({ situacao: "ATIVA", categoria: "Obreiro(a) — Diácono", funcao: "HABILITADO" });
    expect(regra.situacaoPublica(valida, membro({ cargo: "PASTOR", statusMatricula: "INATIVA" })).funcao).toBe("INATIVO");
    expect(regra.situacaoPublica(valida, membro({ cargo: "PRESBITERO", statusMatricula: "ATIVA", sobDisciplina: true })).funcao).toBe("INATIVO");
    expect(regra.situacaoPublica(valida, membro({ cargo: "AUXILIAR", situacaoMembro: "SEM_COMUNHAO" }))).toMatchObject({ situacao: "INATIVA", funcao: "INATIVO" });
  });
  test("substituída e cancelada: diz isso e o nome, nada mais", () => {
    expect(regra.situacaoPublica({ situacao: "SUBSTITUIDA", via: 1 }, membro({ cargo: "PASTOR" }))).toEqual({ situacao: "SUBSTITUIDA", nome: "Ana" });
    expect(regra.situacaoPublica({ situacao: "CANCELADA", via: 2 }, membro())).toEqual({ situacao: "CANCELADA", nome: "Ana" });
    expect(regra.situacaoPublica(null, membro())).toEqual({ situacao: "NAO_ENCONTRADA" });
  });
});

describe("revisão independente (28/10/2026): a disciplina e a licença", () => {
  test("excluído e fora da comunhão (Disciplina Rigorosa): inativa, sem dizer por quê, e não recebe credencial", () => {
    const exc = regra.situacaoPublica(valida, membro({ excluido: true }));
    expect(exc).toEqual({ situacao: "INATIVA", nome: "Ana", categoria: "Membro", congregacao: "Central", via: 1 });
    expect(regra.situacaoPublica(valida, membro({ foraDaComunhao: true })).situacao).toBe("INATIVA");
    expect(regra.situacaoPublica(valida, membro({ cargo: "PASTOR", statusMatricula: "ATIVA", foraDaComunhao: true }))).toMatchObject({ situacao: "INATIVA", funcao: "INATIVO" });
    expect(regra.podeReceber(membro({ excluido: true })).mensagem).toMatch(/Art\. 95 §2º, IV, a/);
    expect(regra.podeReceber(membro({ foraDaComunhao: true })).pode).toBe(false);
  });
  test("de licença (inclusive a de candidatura): continua membro ativo; o obreiro fica inativo nas funções", () => {
    for (const status of ["LICENÇA", "LICENCA_CANDIDATURA"]) {
      expect(regra.situacaoPublica(valida, membro({ status })).situacao).toBe("ATIVA");
      expect(regra.situacaoPublica(valida, membro({ status, cargo: "DIACONO", statusMatricula: "ATIVA" }))).toMatchObject({ situacao: "ATIVA", funcao: "INATIVO" });
      expect(regra.podeReceber(membro({ status })).pode).toBe(true);
    }
    expect(regra.situacaoPublica(valida, membro({ status: "LICENÇA", situacaoMembro: null })).situacao).toBe("ATIVA");
  });
});

describe("motivo da nova via e do cancelamento", () => {
  test("texto de 5 a 300, sem controle", () => {
    expect(regra.validarMotivo("Perda do cartão")).toEqual({ valido: true, texto: "Perda do cartão" });
    expect(regra.validarMotivo("  Roubo\u0000 do   cartão ")).toEqual({ valido: true, texto: "Roubo do cartão" });
    for (const ruim of ["", "abc", null, undefined, 42, {}, "x".repeat(301)]) expect(regra.validarMotivo(ruim).valido).toBe(false);
  });
});

describe("PDF do cartão", () => {
  test("sai em PDF no tamanho de cartão de crédito, com ou sem foto", async () => {
    const { pdfDaCredencial, LARGURA, ALTURA } = require("../pdfCredencial");
    const c = { nome: "Ana de Souza", matricula: 42, categoria: "Membro", congregacao: "Central", via: 2, codigo: "ABCD-EFGH-JKLM-NPQR", url: "https://app.ieadespa.org.br/credencial.html?c=ABCD-EFGH-JKLM-NPQR", emitidaEmDia: "2026-10-28" };
    const semFoto = await pdfDaCredencial(c, null);
    expect(semFoto.slice(0, 5).toString()).toBe("%PDF-");
    expect(semFoto.toString("latin1")).toMatch(new RegExp(`/MediaBox \\[0 0 ${LARGURA} ${ALTURA}\\]`));
    const fotoRuim = await pdfDaCredencial(c, Buffer.from("isto não é imagem"));   // imagem inválida: o cartão sai com o espaço da foto
    expect(fotoRuim.slice(0, 5).toString()).toBe("%PDF-");
  });
});

describe("migração 159", () => {
  const texto = fs.readFileSync(path.join(__dirname, "../../../sql/migrations/159_credencial_digital.sql"), "utf8");
  test("uma válida por pessoa; código único; via única por pessoa; encerramento coerente", () => {
    expect(texto).toMatch(/CREATE UNIQUE INDEX UX_Credenciais_Valida ON dbo\.CredenciaisEclesiasticas \(MembroId\) WHERE Situacao = N'VALIDA'/);
    expect(texto).toMatch(/CONSTRAINT UX_Credenciais_Codigo UNIQUE \(Codigo\)/);
    expect(texto).toMatch(/CONSTRAINT UX_Credenciais_Via UNIQUE \(MembroId, Via\)/);
    expect(texto).toMatch(/Situacao IN \(N'VALIDA', N'SUBSTITUIDA', N'CANCELADA'\)/);
    expect(texto).toMatch(/\(Situacao = N'VALIDA' AND EncerradaEm IS NULL\) OR \(Situacao <> N'VALIDA' AND EncerradaEm IS NOT NULL\)/);
  });
  test("idempotente", () => {
    for (const b of texto.split(/\nGO\b/).filter((x) => /CREATE (UNIQUE )?INDEX|CREATE TABLE/.test(x))) expect(b).toMatch(/IF (NOT )?EXISTS/);
  });
});
