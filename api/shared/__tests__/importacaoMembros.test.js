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
    expect(c.ignoradas).toEqual([{ indice: 5, coluna: "Cor Favorita", motivo: "desconhecida" }, { indice: 6, coluna: "nome", motivo: "repetida (já há a coluna de nome)" }]);
    expect(c.lista.map((x) => x.campo)).toEqual(["matricula", "nome", "igreja", "batismo", "formaAdmissao", null, null]);
  });
  test("a ESCOLHA da tela (23/11): um campo ou 'não usar' para cada coluna substitui o reconhecimento pelo nome; escolha que não bate é recusada", () => {
    const cab = ["MATRÍCULA", "NOME", "IGREJA", "ESCOLARIDADE", "PROFISSÃO"];
    const c = r.mapearColunas(cab, ["matricula", "nome", "igreja", null, "escolaridade"]);
    expect(c.erro).toBeUndefined();
    expect(c.mapa).toEqual(Object.assign(Object.create(null), { matricula: 0, nome: 1, igreja: 2, escolaridade: 4 }));
    expect(c.ignoradas).toEqual([{ indice: 3, coluna: "ESCOLARIDADE", motivo: "não usar" }]);
    expect(r.mapearColunas(cab, ["matricula", "nome"]).erro).toMatch(/não bate com este arquivo/);
    expect(r.mapearColunas(cab, ["matricula", "nome", "igreja", "senha", null]).erro).toMatch(/campo que não existe/);
    expect(r.mapearColunas(cab, ["matricula", "nome", "igreja", "nome", null]).erro).toMatch(/mesmo campo \(nome\)/);
    expect(r.mapearColunas(cab, [null, "nome", "igreja", null, null]).faltando).toEqual(["Matrícula"]);
    // na prévia: a escolha vale para as linhas (a coluna 'não usar' não entra) e o erro dela volta como erro do arquivo
    const p = r.prepararArquivo([cab.join(";"), "70001;Ana;IEADESPA - Vila Nova;Médio completo;Professora"].join("\r\n"),
      { congregacoes: CONGS, hojeISO: HOJE, escolha: ["matricula", "nome", "igreja", null, null] });
    expect(p.linhas[0].dados.escolaridade).toBeNull();
    expect(p.colunas.escolhidas).toBe(true);
    expect(r.prepararArquivo([cab.join(";"), "1;Ana"].join("\r\n"), { congregacoes: CONGS, escolha: ["matricula"] }).erro).toMatch(/não bate/);
    // o catálogo da tela: as 11 de sempre do sistema pago marcadas
    expect(r.CAMPOS.filter((x) => x.padrao).map((x) => x.campo)).toEqual(["matricula", "nome", "igreja", "sexo", "nascimento", "estadoCivil", "email", "celular", "mae", "pai", "cpf"]);
  });
  test("sem a coluna de matrícula ou de nome, o arquivo não serve; vazio, só cabeçalho e o acento estragado também não", () => {
    const semMat = preparar(["1;Ana"], "NOME;IGREJA");
    expect(semMat.erro).toMatch(/coluna de matrícula/);
    // o mapa volta junto com o erro (só os nomes do cabeçalho): a tela mostra e a Geral liga a coluna que falta
    expect(semMat.colunas.lista).toEqual([{ indice: 0, coluna: "NOME", campo: "nome" }, { indice: 1, coluna: "IGREJA", campo: "igreja" }]);
    expect(semMat.totalColunas).toBe(2);
    expect(semMat.linhas).toBeUndefined();
    expect(r.prepararArquivo("", { congregacoes: CONGS }).erro).toMatch(/vazio/);
    expect(preparar([]).erro).toMatch(/só tem o cabeçalho/);
    expect(preparar(["1;Jo�o;IEADESPA - Vila Nova"]).erro).toMatch(/letras que não puderam ser lidas/);
  });
  // revisão de 23/11 (I1): uma aspa sem fechar engolia as linhas seguintes sem aviso (10 pessoas, a 5ª com o nome começando por aspas -> total 3).
  // Regra: ninguém some calado. O arquivo inteiro é recusado, com a linha do problema, para a Geral corrigir na planilha e mandar de novo.
  const pessoas = (n, troca = {}) => Array.from({ length: n }, (_, i) => troca[i + 1] ?? `${70000 + i + 1};Pessoa ${i + 1} de Mentira;IEADESPA - Vila Nova;FEMININO;01/01/1990;CASADA;;;;;`);
  test("I1: a aspa que abre e não fecha recusa o arquivo inteiro, com a linha (ninguém some calado)", () => {
    const p = preparar(pessoas(10, { 5: "70005;\"Maria Aspas de Mentira;IEADESPA - Vila Nova;FEMININO;01/01/1990;CASADA;;;;;" }));
    expect(p.linhas).toBeUndefined();
    expect(p.erro).toBe("A linha 6 do arquivo abre aspas (\") e não fecha: as pessoas das linhas de baixo sumiriam da prévia. Corrija essa linha na planilha e mande o arquivo de novo.");
    expect(r.lerCsv(["A;B", "1;\"Ana", "2;Bia"].join("\r\n")).aspas).toEqual({ linha: 2, fechou: false });
  });
  test("I1: o campo entre aspas que passa para a linha de baixo também recusa, com a linha onde a aspa abriu", () => {
    const p = preparar(pessoas(10, { 3: "70003;\"Rosa Aspas;IEADESPA - Vila Nova;FEMININO;01/01/1990;CASADA;;;;;", 7: "70007;Lia\" de Mentira;IEADESPA - Vila Nova;FEMININO;01/01/1990;CASADA;;;;;" }));
    expect(p.linhas).toBeUndefined();
    expect(p.erro).toBe("A linha 4 do arquivo tem um campo entre aspas que passa para a linha de baixo: as pessoas dessas linhas sumiriam da prévia. Corrija essa linha na planilha e mande o arquivo de novo.");
    expect(r.lerCsv(["A;B", "1;\"Ana", "2;Bia\";x"].join("\n")).aspas).toEqual({ linha: 2, fechou: true });
  });
  test("I1: aspas certas numa linha só continuam valendo; o arquivo de 10 pessoas dá as 10", () => {
    const p = preparar(pessoas(10, { 5: "70005;\"Silva; Maria \"\"Mãe\"\"\";IEADESPA - Vila Nova;FEMININO;01/01/1990;CASADA;;;;;" }));
    expect(p.erro).toBeUndefined();
    expect(p.linhas).toHaveLength(10);
    expect(p.linhas[4].dados.nome).toBe("Silva; Maria \"Mãe\"");
    expect(r.lerCsv("A;B\r\n1;\"x\"").aspas).toBeNull();
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
  test("a matrícula que JÁ É de uma ficha do sistema (as regras da rodada 28): a linha FICA DE FORA, seja a mesma pessoa ou não, e não ocupa a matrícula nem o CPF", () => {
    const banco = { fichasPorMatricula: new Map([[1, { nome: "Rui Barbosa Lima", cpf: null }], [2, { nome: "Outra Pessoa", cpf: null }]]) };
    const ls = classificar(["1;Rui Lima;IEADESPA - Vila Nova", `2;Sara Nova;IEADESPA - Vila Nova;;;;;;;;${CPF1}`, "1;;IEADESPA - Vila Nova",
      `70032;Sara Dois;IEADESPA - Vila Nova;;;;;;;;${CPF1}`], banco);
    expect(ls.map((l) => [l.acao, l.problemas, l.numeroNovo, l.repetidaMembro])).toEqual([
      ["PROBLEMA", ["MATRICULA_JA_EXISTE"], false, null], ["PROBLEMA", ["MATRICULA_JA_EXISTE"], false, null],
      ["PROBLEMA", ["SEM_NOME", "MATRICULA_JA_EXISTE"], false, null], ["NOVA", [], false, null]]);
    // o CPF da linha que ficou de fora não é de ninguém: a linha que entra fica com ele
    expect(ls[3].dados.cpf).toBe(CPF1);
    expect(r.linhaParaLista({ ...ls[0], acao: "PROBLEMA" }).motivos).toEqual([r.PROBLEMAS.MATRICULA_JA_EXISTE]);
    // classificar de novo (a mesma linha) não repete o motivo
    r.classificar([ls[0]], banco);
    expect(ls[0].problemas).toEqual(["MATRICULA_JA_EXISTE"]);
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
  test("o mesmo NOME e NASCIMENTO (a tela r27): de uma ficha do sistema ou de outra linha do arquivo (sem acento, maiúscula nem espaço a mais); a primeira fica", () => {
    const banco = { fichasPorNomeNascimento: new Map([[r.chaveNomeNascimento("Jose  Antonio", "1970-02-03"), 77]]) };
    const ls = classificar(["70070;Lia Gomes;IEADESPA - Vila Nova;;10/01/1980", "70071;LÍA  gomes;IEADESPA - Vila Nova;;10/01/1980",
      "70072;José Antônio;IEADESPA - Vila Nova;;03/02/1970", "70073;Lia Gomes;IEADESPA - Vila Nova;;11/01/1980", "70074;Lia Gomes;IEADESPA - Vila Nova"], banco);
    expect(ls.map((l) => [l.repetidaLinha, l.repetidaMembro])).toEqual([[null, null], [2, null], [null, 77], [null, null], [null, null]]);
    expect(ls[1].avisos).toEqual(["NOME_NASCIMENTO_NO_ARQUIVO"]);
    expect(ls[2].avisos).toEqual(["NOME_NASCIMENTO_EM_OUTRA_FICHA"]);
    // quem já é possível repetida pelo CPF não ganha a segunda marca
    const cpf = classificar([`70080;Rita;IEADESPA - Vila Nova;;10/01/1980;;;;;;${CPF1}`, `70081;Rita;IEADESPA - Vila Nova;;10/01/1980;;;;;;${CPF1}`]);
    expect(cpf[1].avisos).toEqual(["CPF_REPETIDO_NO_ARQUIVO"]);
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
    expect(s).toMatchObject({ total: 5, novas: 4, problemas: 1, numeroNovo: 1, possivelRepetida: 0, semCongregacao: 1, separador: ";", proximaMatricula: 1000001,
      primeiraMatriculaNova: 1000000, vazias: 0, totalColunas: 11, jaExistem: 0, congregacoesReconhecidas: 1 });
    expect(s.existem).toBeUndefined();
    expect(s.avisosGerais.map((a) => a.codigo)).toEqual(["MATRICULA_FORA_DA_SEQUENCIA"]);
    expect(JSON.stringify(s)).not.toMatch(/Ana|Bia|Caio|Davi/);
  });
  test("os quadros da tela: cada linha que entra numa caixa só (a acertar, depois a repetida, depois a que entra como está); as vazias e as que já existem contadas", () => {
    const prep = preparar(["100;Ana Souza;IEADESPA - Vila Nova", "", "100;Ana Maria Souza;IEADESPA - Monte Sião", `101;Bia;IEADESPA - Vila Nova;;;;;;;;${CPF1}`,
      `102;Caio;IEADESPA - Vila Nova;;;;;;;;${CPF1}`, "1;Davi;IEADESPA - Vila Nova", " ; ", "0;Eva;IEADESPA - GERAL"]);
    r.classificar(prep.linhas, { fichasPorMatricula: new Map([[1, { nome: "Davi", cpf: null }]]) });
    const s = r.resumir(prep, { maiorMatriculaSistema: 2 });
    // a linha 4 (100 de novo, a mesma pessoa) é a acertar E repetida: conta só em "a acertar"; a 6 (CPF da 5) é repetida; a 7 (matrícula 1) fica de fora
    expect(s.quadros).toEqual({ comMatricula: 2, acertar: 2, repetidas: 1 });
    expect(s).toMatchObject({ total: 6, vazias: 2, novas: 5, jaExistem: 1, problemas: 1, possivelRepetida: 2, numeroNovo: 2, primeiraMatriculaNova: 103,
      congregacoesReconhecidas: 2 });
  });
  test("a lista para conferir e o CSV: nunca o CPF nem o contato; a célula que começa com = + - @ é protegida (fórmula)", () => {
    const item = r.linhaParaLista({ linha: 7, matriculaArquivo: "0", nome: "=HYPERLINK(\"x\")", acao: "NOVA", matriculaFinal: 70100, problemas: [], avisos: ["MATRICULA_ZERO"] });
    expect(item).toEqual({ linha: 7, matricula: "0", nome: "=HYPERLINK(\"x\")", acao: "NOVA", matriculaFinal: 70100, motivos: [r.AVISOS.MATRICULA_ZERO] });
    const csv = r.csvDaLista([item]);
    expect(csv.startsWith("﻿Linha;")).toBe(true);
    expect(csv).toMatch(/;"'=HYPERLINK\(""x""\)";Entra;70100;/);
  });
});
