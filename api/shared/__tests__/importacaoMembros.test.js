// FASE 10, v10.1e, passo 9 de Membros (22/11/2026) — a IMPORTAÇÃO dos membros do sistema pago: as regras puras (shared/importacaoMembros.js).
// Só dados de mentira. O caminho no banco (a prévia, a confirmação, os lotes, as pendências, uma vez só): importacaoMembrosDb.test.js e o roteiro e2e-96.
const r = require("../importacaoMembros");

const CAB = "MATRÍCULA;NOME;IGREJA;SEXO;NASCIMENTO;ESTADO CIVIL;E-MAIL;CELULAR;MÃE;PAI;CPF";
const CONGS = r.mapaDeCongregacoes([{ congregacaoId: 1, nome: "Vila Nova", ativa: true }, { congregacaoId: 2, nome: "Monte Sião", ativa: true },
  { congregacaoId: 3, nome: "Fechada Antiga", ativa: false }, { congregacaoId: 4, nome: "Duplicada", ativa: true }, { congregacaoId: 5, nome: "duplicada", ativa: true }]);
const HOJE = "2026-11-22";
const preparar = (corpo, cab = CAB) => r.prepararArquivo([cab, ...corpo].join("\r\n"), { congregacoes: CONGS, hojeISO: HOJE });
// CPFs de teste com os dígitos válidos (não são de ninguém)
const CPF1 = "52998224725", CPF2 = "11144477735";

describe("o arquivo e as colunas", () => {
  test("lê o CSV do sistema pago: ';', BOM, CRLF, aspas com ';' e aspas dobradas dentro", () => {
    const { separador, linhas } = r.lerCsv("﻿A;B;C\r\n1;\"Silva; Maria \"\"Mãe\"\"\";x\r\n2;Ana;\n");
    expect(separador).toBe(";");
    expect(linhas).toEqual([{ numero: 1, celulas: ["A", "B", "C"] }, { numero: 2, celulas: ["1", "Silva; Maria \"Mãe\"", "x"] }, { numero: 3, celulas: ["2", "Ana", ""] }]);
  });
  test("as colunas pelo nome (sem acento, maiúscula ou pontuação); as EXTRAS desconhecidas são aceitas e mostradas; a repetida é ignorada", () => {
    const c = r.mapearColunas(["Nº Matrícula", "Nome Completo", "Igreja", "Data de Batismo", "Tipo de Arrolamento", "Cor Favorita", "nome"]);
    expect(c.faltando).toEqual([]);
    expect(Object.keys(c.mapa)).toEqual(["matricula", "nome", "igreja", "batismo", "formaAdmissao"]);
    expect(c.ignoradas).toEqual([{ coluna: "Cor Favorita", motivo: "desconhecida" }, { coluna: "nome", motivo: "repetida (já há a coluna de nome)" }]);
  });
  test("sem a coluna de matrícula ou de nome, o arquivo não serve; vazio, só cabeçalho e o acento estragado também não", () => {
    expect(preparar(["1;Ana"], "NOME;IGREJA").erro).toMatch(/coluna de matrícula/);
    expect(r.prepararArquivo("", { congregacoes: CONGS }).erro).toMatch(/vazio/);
    expect(preparar([]).erro).toMatch(/só tem o cabeçalho/);
    expect(preparar(["1;Jo�o;IEADESPA - Vila Nova"]).erro).toMatch(/letras que não puderam ser lidas/);
  });
});

describe("cada linha", () => {
  test("a linha completa do sistema pago vira os dados da ficha", () => {
    const p = preparar([`70001;Maria  da Silva;IEADESPA - Vila Nova;FEMININO;14/03/1990;CASADA;maria@example.org;(91) 98888-7777;Ana da Silva;José da Silva;${CPF1}`]);
    expect(p.linhas[0].problemas).toEqual([]);
    expect(p.linhas[0].avisos).toEqual([]);
    expect(p.linhas[0].dados).toMatchObject({ nome: "Maria da Silva", congregacaoId: 1, sexo: "F", dataNascimento: "1990-03-14", estadoCivil: "CASADO",
      email: "maria@example.org", telefone: "91988887777", nomeMae: "Ana da Silva", nomePai: "José da Silva", cpf: CPF1 });
  });
  test("'IEADESPA - GERAL' e a igreja vazia entram SEM congregação (decisão de 18/11)", () => {
    const p = preparar(["0;Cadastro Geral;IEADESPA - GERAL", "5;Sem Igreja;"]);
    for (const l of p.linhas) { expect(l.dados.congregacaoId).toBeNull(); expect(l.avisos).toContain("SEM_CONGREGACAO"); expect(l.problemas).toEqual([]); }
  });
  test("o que impede de entrar (PROBLEMA): sem nome, congregação que não existe, desativada ou com nome em duas", () => {
    const p = preparar(["1;;IEADESPA - Vila Nova", "2;Ana;IEADESPA - Lugar Nenhum", "3;Bia;IEADESPA - Fechada Antiga", "4;Caio;IEADESPA - Duplicada"]);
    expect(p.linhas.map((l) => l.problemas)).toEqual([["SEM_NOME"], ["CONGREGACAO_NAO_ENCONTRADA"], ["CONGREGACAO_INATIVA"], ["CONGREGACAO_AMBIGUA"]]);
  });
  test("o valor estragado não impede: a pessoa entra SEM ele, com o aviso (CPF inválido, data impossível, sexo, estado civil, e-mail, celular)", () => {
    const p = preparar(["9;Davi;IEADESPA - Monte Sião;X;31/02/1990;NOIVO;davi@;123;;;12345678900"]);
    expect(p.linhas[0].problemas).toEqual([]);
    expect(p.linhas[0].avisos).toEqual(expect.arrayContaining(["SEXO_DESCONHECIDO", "NASCIMENTO_INVALIDO", "ESTADO_CIVIL_DESCONHECIDO", "EMAIL_INVALIDO", "CELULAR_INVALIDO", "CPF_INVALIDO"]));
    expect(p.linhas[0].dados).toMatchObject({ sexo: null, dataNascimento: null, estadoCivil: null, email: null, telefone: null, cpf: null });
  });
  test("'.: NAO INFORMADO :.' é vazio; o CPF que a planilha comeu o zero da frente volta", () => {
    const p = preparar(["9;Davi;IEADESPA - Vila Nova;MASCULINO;;.: NAO INFORMADO :.;;;;;1234567890"]);
    expect(p.linhas[0].avisos).toEqual([]);
    expect(p.linhas[0].dados.estadoCivil).toBeNull();
    expect(p.linhas[0].dados.cpf).toBe("01234567890");
  });
});

describe("classificar (uma vez só, 22/11/2026: toda linha que pode entrar ENTRA)", () => {
  const classificar = (corpo, banco) => r.classificar(preparar(corpo).linhas, banco);
  test("a matrícula ZERADA, vazia ou que não é número: entra com a próxima do sistema (pendência NUMERO)", () => {
    const ls = classificar(["0;Ana Zero;IEADESPA - Vila Nova", ";Bia Vazia;IEADESPA - Vila Nova", "12a;Caio Letra;IEADESPA - Vila Nova", "70010;Davi Certo;IEADESPA - Vila Nova"]);
    expect(ls.map((l) => [l.acao, l.numeroNovo, l.motivoNumero, l.matriculaNumero])).toEqual([
      ["NOVA", true, "ZERO", null], ["NOVA", true, "VAZIA", null], ["NOVA", true, "INVALIDA", null], ["NOVA", false, null, 70010]]);
  });
  test("a matrícula REPETIDA no arquivo: a primeira fica com ela; a outra entra com a próxima (NUMERO) e, se parece a mesma pessoa, também REPETIDA", () => {
    const ls = classificar(["70020;Ana Souza;IEADESPA - Vila Nova", "70020;Ana Maria Souza;IEADESPA - Vila Nova", "70020;Pedro Outro;IEADESPA - Vila Nova"]);
    expect(ls.map((l) => [l.acao, l.matriculaNumero, l.numeroNovo, l.motivoNumero, l.repetidaLinha])).toEqual([
      ["NOVA", 70020, false, null, null], ["NOVA", null, true, "REPETIDA_NO_ARQUIVO", 2], ["NOVA", null, true, "REPETIDA_NO_ARQUIVO", null]]);
    expect(ls[1].avisos).toEqual(["MATRICULA_REPETIDA_NO_ARQUIVO", "MESMA_PESSOA_NO_ARQUIVO"]);
  });
  test("a matrícula que JÁ É de uma ficha do sistema: nada fica de fora — entra com a próxima (NUMERO), e REPETIDA da ficha se parece a mesma pessoa", () => {
    const banco = { fichasPorMatricula: new Map([[70030, { nome: "Rui Barbosa Lima", cpf: null }], [70031, { nome: "Outra Pessoa", cpf: null }]]) };
    const ls = classificar(["70030;Rui Lima;IEADESPA - Vila Nova", "70031;Sara Nova;IEADESPA - Vila Nova"], banco);
    expect(ls.map((l) => [l.acao, l.numeroNovo, l.motivoNumero, l.repetidaMembro])).toEqual([["NOVA", true, "DE_OUTRA_FICHA", 70030], ["NOVA", true, "DE_OUTRA_FICHA", null]]);
    expect(ls.some((l) => l.acao === "EXISTE")).toBe(false);
  });
  test("o CPF que já está numa ficha: entra SEM o CPF, como possível repetida dela; repetido no arquivo, fica com a MENOR matrícula", () => {
    const banco = { fichasPorCpf: new Map([[CPF1, 600]]) };
    const ls = classificar([`70041;Tito Um;IEADESPA - Vila Nova;;;;;;;;${CPF1}`, `70050;Vera Dois;IEADESPA - Vila Nova;;;;;;;;${CPF2}`,
      `70045;Vera Duas;IEADESPA - Vila Nova;;;;;;;;${CPF2}`, `;Vera Tres;IEADESPA - Vila Nova;;;;;;;;${CPF2}`], banco);
    expect(ls[0]).toMatchObject({ repetidaMembro: 600 });
    expect(ls[0].dados.cpf).toBeNull();
    expect(ls[0].avisos).toContain("CPF_EM_OUTRA_FICHA");
    // 70045 é a menor: fica com o CPF; as outras duas entram sem ele, possíveis repetidas da linha dela (a 4)
    expect(ls.slice(1).map((l) => [l.dados.cpf, l.repetidaLinha])).toEqual([[null, 4], [CPF2, null], [null, 4]]);
  });
  test("a linha com PROBLEMA não entra e não ocupa matrícula nem CPF", () => {
    const ls = classificar([`70060;;IEADESPA - Vila Nova;;;;;;;;${CPF1}`, `70060;Lia Certa;IEADESPA - Vila Nova;;;;;;;;${CPF1}`]);
    expect(ls.map((l) => l.acao)).toEqual(["PROBLEMA", "NOVA"]);
    expect(ls[1]).toMatchObject({ matriculaNumero: 70060, numeroNovo: false, repetidaLinha: null });
    expect(ls[1].dados.cpf).toBe(CPF1);
  });
});

describe("o resumo e a lista (sem dado pessoal)", () => {
  test("os números da prévia, a matrícula fora da sequência e a próxima matrícula", () => {
    const prep = preparar(["100;Ana;IEADESPA - Vila Nova", "101;Bia;IEADESPA - Vila Nova", "0;Caio;IEADESPA - GERAL", "999999;Davi;IEADESPA - Vila Nova", "102;;IEADESPA - Vila Nova"]);
    r.classificar(prep.linhas);
    const s = r.resumir(prep, { maiorMatriculaSistema: 50 });
    expect(s).toMatchObject({ total: 5, novas: 4, problemas: 1, numeroNovo: 1, possivelRepetida: 0, semCongregacao: 1, separador: ";", proximaMatricula: 1000001 });
    expect(s.existem).toBeUndefined();
    expect(s.avisosGerais.map((a) => a.codigo)).toEqual(["MATRICULA_FORA_DA_SEQUENCIA"]);
    expect(JSON.stringify(s)).not.toMatch(/Ana|Bia|Caio|Davi/);
  });
  test("a lista para conferir e o CSV: nunca o CPF nem o contato; a célula que começa com = + - @ é protegida (fórmula)", () => {
    const item = r.linhaParaLista({ linha: 7, matriculaArquivo: "0", nome: "=HYPERLINK(\"x\")", acao: "NOVA", matriculaFinal: 70100, problemas: [], avisos: ["MATRICULA_ZERO"] });
    expect(item).toEqual({ linha: 7, matricula: "0", nome: "=HYPERLINK(\"x\")", acao: "NOVA", matriculaFinal: 70100, motivos: [r.AVISOS.MATRICULA_ZERO] });
    const csv = r.csvDaLista([item]);
    expect(csv.startsWith("﻿Linha;")).toBe(true);
    expect(csv).toMatch(/;"'=HYPERLINK\(""x""\)";Entra;70100;/);
  });
});
