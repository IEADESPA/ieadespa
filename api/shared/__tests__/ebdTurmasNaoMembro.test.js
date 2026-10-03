// Testes do v6.8 (EBD — aluno não-membro) — foco na lógica pura: o mínimo
// de identificação exigido, menor de idade exigindo responsável (LGPD),
// nome repetido na mesma turma e as condições para vincular o não-membro a
// um membro depois (mesma matrícula, sem duplicar).
const ebd = require("../ebdTurmas");

const HOJE = "2026-09-30";

describe("idadeEmAnos", () => {
  test("conta aniversário que já passou e o que ainda não", () => {
    expect(ebd.idadeEmAnos("2008-09-30", HOJE)).toBe(18); // faz 18 hoje
    expect(ebd.idadeEmAnos("2008-10-01", HOJE)).toBe(17); // faz 18 amanhã
    expect(ebd.idadeEmAnos("2000-01-15", HOJE)).toBe(26);
  });
});

describe("validarAlunoNaoMembro", () => {
  test("adulto só com o nome basta; o resto é opcional", () => {
    const r = ebd.validarAlunoNaoMembro({ nome: "  Maria da Silva " }, HOJE);
    expect(r.valido).toBe(true);
    expect(r.dados).toEqual({ nome: "Maria da Silva", contato: null, dataNascimento: null, responsavelNome: null });
  });

  test("recusa nome vazio ou curto demais", () => {
    expect(ebd.validarAlunoNaoMembro({ nome: "" }, HOJE).valido).toBe(false);
    expect(ebd.validarAlunoNaoMembro({ nome: "Jo" }, HOJE).mensagem).toMatch(/nome completo/);
    expect(ebd.validarAlunoNaoMembro({}, HOJE).valido).toBe(false);
  });

  test("menor de 18 anos exige o nome do responsável", () => {
    const sem = ebd.validarAlunoNaoMembro({ nome: "Pedro Souza", dataNascimento: "2015-03-10" }, HOJE);
    expect(sem.valido).toBe(false);
    expect(sem.mensagem).toMatch(/responsável/);
    const com = ebd.validarAlunoNaoMembro({ nome: "Pedro Souza", dataNascimento: "2015-03-10", responsavelNome: "Ana Souza" }, HOJE);
    expect(com.valido).toBe(true);
    expect(com.dados.responsavelNome).toBe("Ana Souza");
  });

  test("quem faz 18 hoje já é adulto; quem faz amanhã ainda exige responsável", () => {
    expect(ebd.validarAlunoNaoMembro({ nome: "Lucas Lima", dataNascimento: "2008-09-30" }, HOJE).valido).toBe(true);
    expect(ebd.validarAlunoNaoMembro({ nome: "Lucas Lima", dataNascimento: "2008-10-01" }, HOJE).valido).toBe(false);
  });

  test("recusa nascimento inválido, futuro ou improvável", () => {
    expect(ebd.validarAlunoNaoMembro({ nome: "Maria Silva", dataNascimento: "31/02/2000" }, HOJE).mensagem).toMatch(/inválida/);
    expect(ebd.validarAlunoNaoMembro({ nome: "Maria Silva", dataNascimento: "2027-01-01" }, HOJE).mensagem).toMatch(/futura/);
    expect(ebd.validarAlunoNaoMembro({ nome: "Maria Silva", dataNascimento: "1900-01-01" }, HOJE).mensagem).toMatch(/improvável/);
  });

  test("limita o tamanho dos textos (colunas de 150)", () => {
    expect(ebd.validarAlunoNaoMembro({ nome: "x".repeat(151) }, HOJE).valido).toBe(false);
    expect(ebd.validarAlunoNaoMembro({ nome: "Maria Silva", contato: "x".repeat(151) }, HOJE).valido).toBe(false);
  });
});

describe("podeMatricularNaoMembro", () => {
  const turma = [
    { membroNome: "José Antônio", matricula: "EBD-2026-000001", naoMembro: false },
    { membroNome: "Ana Paula", matricula: "EBD-2026-000002", naoMembro: true }
  ];

  test("recusa o mesmo nome na mesma turma, sem distinguir acento, maiúscula e espaços", () => {
    const r = ebd.podeMatricularNaoMembro(turma, "  jose  antonio ");
    expect(r.permitido).toBe(false);
    expect(r.mensagem).toMatch(/EBD-2026-000001/);
  });

  test("permite nome novo e turma vazia", () => {
    expect(ebd.podeMatricularNaoMembro(turma, "Carla Dias").permitido).toBe(true);
    expect(ebd.podeMatricularNaoMembro([], "Carla Dias").permitido).toBe(true);
  });
});

describe("podeVincularAMembro (o não-membro virou membro)", () => {
  const naoMembro = { alunoId: 5, membroId: null, matricula: "EBD-2026-000005" };

  test("permite quando é não-membro e o membro ainda não tem matrícula", () => {
    expect(ebd.podeVincularAMembro(naoMembro, null).permitido).toBe(true);
  });

  test("recusa aluno inexistente ou que já é membro", () => {
    expect(ebd.podeVincularAMembro(null, null).permitido).toBe(false);
    expect(ebd.podeVincularAMembro({ alunoId: 1, membroId: 9 }, null).mensagem).toMatch(/já está vinculado/);
  });

  test("recusa quando o membro já tem outra matrícula (nunca duas matrículas por membro)", () => {
    const r = ebd.podeVincularAMembro(naoMembro, { matricula: "EBD-2025-000123" });
    expect(r.permitido).toBe(false);
    expect(r.mensagem).toMatch(/EBD-2025-000123/);
  });
});
