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
  // G3 (decisão dele de 24/11/2026, que troca a de 18/11): sem congregação não há importação. A linha sem ela fica de fora na prévia, com o motivo; a Geral
  // corrige a planilha e faz a prévia de novo, ou continua sem essas linhas.
  test("'IEADESPA - GERAL' e a igreja vazia ficam DE FORA, com o motivo (G3)", () => {
    const p = preparar(["0;Cadastro Geral;IEADESPA - GERAL", "5;Sem Igreja;", "6;Só Espaços;   "]);
    for (const l of p.linhas) { expect(l.dados.congregacaoId).toBeNull(); expect(l.problemas).toEqual(["SEM_CONGREGACAO"]); expect(l.avisos).not.toContain("SEM_CONGREGACAO"); }
    r.classificar(p.linhas);
    expect(p.linhas.map((l) => l.acao)).toEqual(["PROBLEMA", "PROBLEMA", "PROBLEMA"]);
    expect(r.AVISOS.SEM_CONGREGACAO).toBeUndefined();
    expect(r.PROBLEMAS.SEM_CONGREGACAO).toBe("Sem congregação (no arquivo: GERAL ou vazio): fica de fora. Ponha a congregação na planilha e faça a prévia de novo, ou continue sem esta linha");
    expect(r.linhaParaLista(p.linhas[0]).motivos).toEqual([r.PROBLEMAS.SEM_CONGREGACAO]);
  });
  test("a coluna da congregação é obrigatória, como a matrícula e o nome (G3): o arquivo sem ela volta com o mapa", () => {
    expect(r.mapearColunas(["MATRÍCULA", "NOME", "SEXO"]).faltando).toEqual(["Congregação"]);
    const p = preparar(["1;Ana;FEMININO"], "MATRÍCULA;NOME;SEXO");
    expect(p.erro).toBe("O arquivo não tem a coluna de congregação. A primeira linha precisa ser o cabeçalho (MATRÍCULA;NOME;IGREJA;...).");
    expect(p.colunas.lista.map((x) => x.campo)).toEqual(["matricula", "nome", "sexo"]);
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

describe("G2: a importação só das linhas que faltaram (decisão dele de 24/11/2026)", () => {
  // as linhas que faltaram na importação de antes: só o número da linha e o nome (o que a rotina guardou)
  const FALTARAM = [{ linha: 4, nome: "Paulo Henrique Dias" }, { linha: 5, nome: "Raquel Monteiro" }, { linha: 7, nome: "Samuel Brito" }];
  const nomes = (ls) => ls.map((l) => `${l.linha}:${l.dados.nome}`);
  test("o MESMO arquivo: entram só as linhas da lista (o mesmo número de linha e o mesmo nome, sem acento nem maiúscula); as outras ficam fora", () => {
    const prep = preparar(["70100;Ana Já Entrou;IEADESPA - Vila Nova", "70101;Bia Já Entrou;IEADESPA - Vila Nova", "70102;paulo  henrique DIAS;IEADESPA - Vila Nova",
      "70103;Raquel Monteiro;IEADESPA - Vila Nova", "70104;Caio Já Entrou;IEADESPA - Vila Nova", "70105;Sâmuel Brito;IEADESPA - Vila Nova"]);
    const c = r.casarResto(prep.linhas, FALTARAM);
    expect(nomes(c.achadas)).toEqual(["4:paulo henrique DIAS", "5:Raquel Monteiro", "7:Sâmuel Brito"]);
    expect(c.achadas.map((l) => l.linhaOriginal)).toEqual([4, 5, 7]);
    expect(c).toMatchObject({ naoAchadas: [], ambiguas: 0, foraDaLista: 3 });
  });
  test("a planilha só com as linhas que faltaram (os números mudam): entra pelo nome, quando o nome aparece no arquivo no máximo tantas vezes quanto na lista", () => {
    const prep = preparar(["70103;Raquel Monteiro;IEADESPA - Vila Nova", "70102;Paulo Henrique Dias;IEADESPA - Vila Nova", "70105;Samuel Brito;IEADESPA - Vila Nova"]);
    const c = r.casarResto(prep.linhas, FALTARAM);
    expect(nomes(c.achadas)).toEqual(["2:Raquel Monteiro", "3:Paulo Henrique Dias", "4:Samuel Brito"]);
    expect(c.achadas.map((l) => l.linhaOriginal)).toEqual([5, 4, 7]);
    expect(c).toMatchObject({ naoAchadas: [], ambiguas: 0, foraDaLista: 0 });
  });
  test("ninguém de fora da lista entra: o nome que está no arquivo mais vezes do que na lista não entra (não dá para saber qual é), e fica avisado", () => {
    // a linha 4 da lista não bate pela linha (a planilha ganhou uma linha em cima); no arquivo há dois "Paulo Henrique Dias": nenhum entra
    const prep = preparar(["70100;Paulo Henrique Dias;IEADESPA - Vila Nova", "70101;Paulo Henrique Dias;IEADESPA - Vila Nova", "70102;Outra Pessoa;IEADESPA - Vila Nova",
      "70103;Raquel Monteiro;IEADESPA - Vila Nova"]);
    const c = r.casarResto(prep.linhas, FALTARAM);
    expect(nomes(c.achadas)).toEqual(["5:Raquel Monteiro"]);
    expect(c.naoAchadas).toEqual([{ linha: 4, nome: "Paulo Henrique Dias" }, { linha: 7, nome: "Samuel Brito" }]);
    expect(c).toMatchObject({ ambiguas: 2, foraDaLista: 1 });
    // dois iguais na lista e um no arquivo: entra um (é um dos dois); o outro fica como não achado
    const dois = r.casarResto(preparar(["70100;Lia Souza;IEADESPA - Vila Nova"]).linhas, [{ linha: 8, nome: "Lia Souza" }, { linha: 9, nome: "Lia Souza" }]);
    expect(dois.achadas.map((l) => l.linhaOriginal)).toEqual([8]);
    expect(dois.naoAchadas).toEqual([{ linha: 9, nome: "Lia Souza" }]);
    // a linha que bate pela linha e pelo nome consome a dela antes do nome solto
    const mistura = r.casarResto(preparar(["70100;Lia Souza;IEADESPA - Vila Nova", "70101;Lia Souza;IEADESPA - Vila Nova"]).linhas,
      [{ linha: 3, nome: "Lia Souza" }, { linha: 30, nome: "Lia Souza" }]);
    expect(mistura.achadas.map((l) => [l.linha, l.linhaOriginal])).toEqual([[2, 30], [3, 3]]);
  });
  test("a linha sem nome (ou com o nome inválido) nunca bate; lista vazia: nada entra", () => {
    const prep = preparar(["70100;;IEADESPA - Vila Nova", "70101;Raquel Monteiro;IEADESPA - Vila Nova"]);
    expect(nomes(r.casarResto(prep.linhas, FALTARAM).achadas)).toEqual(["3:Raquel Monteiro"]);
    expect(r.casarResto(prep.linhas, [])).toMatchObject({ achadas: [], naoAchadas: [], ambiguas: 0, foraDaLista: 2 });
  });
  test("na continuação, a matrícula que já é de uma ficha NÃO deixa a linha de fora: entra com a próxima do sistema (NUMERO) e, se parece a mesma pessoa, REPETIDA dela", () => {
    const banco = { fichasPorMatricula: new Map([[70102, { nome: "Paulo Henrique Dias", cpf: null }], [70103, { nome: "Fulano Cadastrado Depois", cpf: null }]]) };
    const ls = r.classificar(preparar(["70102;Paulo Henrique Dias;IEADESPA - Vila Nova", "70103;Raquel Monteiro;IEADESPA - Vila Nova",
      "70105;Samuel Brito;IEADESPA - Vila Nova"]).linhas, { ...banco, continuacao: true });
    expect(ls.map((l) => [l.acao, l.problemas, l.numeroNovo, l.motivoNumero, l.matriculaNumero, l.repetidaMembro])).toEqual([
      ["NOVA", [], true, "DE_OUTRA_FICHA", null, 70102], ["NOVA", [], true, "DE_OUTRA_FICHA", null, null], ["NOVA", [], false, null, 70105, null]]);
    expect(ls[0].avisos).toEqual(["MATRICULA_DE_OUTRA_FICHA", "MESMA_PESSOA_EM_OUTRA_FICHA"]);
    expect(ls[1].avisos).toEqual(["MATRICULA_DE_OUTRA_FICHA"]);
    expect(r.textoDe("MATRICULA_DE_OUTRA_FICHA")).toBe("A matrícula já é de outra ficha do sistema: entra com a próxima do sistema");
    expect(r.textoDe("MESMA_PESSOA_EM_OUTRA_FICHA")).toBe("Parece a mesma pessoa da ficha que tem essa matrícula: marcada como possível ficha repetida");
    // fora da continuação, nada muda: a mesma matrícula deixa a linha de fora
    const normal = r.classificar(preparar(["70102;Paulo Henrique Dias;IEADESPA - Vila Nova"]).linhas, banco);
    expect(normal[0]).toMatchObject({ acao: "PROBLEMA", problemas: ["MATRICULA_JA_EXISTE"] });
  });
  // o resumo fica guardado depois dos 90 dias da lista dos de fora: nele, só os NÚMEROS das linhas não achadas (para marcar cada uma na lista de antes), nunca o nome
  test("o resumo do resto: quantas faltaram, quantas foram achadas, os números das linhas não achadas (sem o nome) e o aviso que não deixa passar", () => {
    const c = { achadas: [{}, {}], naoAchadas: [{ linha: 7, nome: "Samuel Brito" }], ambiguas: 0, foraDaLista: 3 };
    const x = r.resumoDoResto(c, { de: 12, faltaram: 3 });
    expect(x.resto).toEqual({ de: 12, faltaram: 3, achadas: 2, naoAchadas: 1, ambiguas: 0, foraDaLista: 3, linhasNaoAchadas: [7] });
    expect(JSON.stringify(x)).not.toMatch(/Samuel|Brito/);
    expect(x.aviso).toEqual({ codigo: "RESTO_NAO_ACHADAS", texto: "1 das 3 linhas que faltaram não foi achada neste arquivo (procuramos o mesmo nome): fica de fora "
      + "desta importação, que é uma vez só. Confira o arquivo antes de confirmar; depois, essa pessoa só se cadastra à mão." });
    const muitas = r.resumoDoResto({ achadas: [{}], naoAchadas: Array.from({ length: 25 }, (_, i) => ({ linha: i + 2, nome: `Pessoa ${i}` })), ambiguas: 2, foraDaLista: 0 },
      { de: 12, faltaram: 1250 });
    expect(muitas.resto.linhasNaoAchadas).toEqual(Array.from({ length: 25 }, (_, i) => i + 2));
    expect(JSON.stringify(muitas)).not.toMatch(/Pessoa/);
    expect(muitas.aviso.texto).toBe("25 das 1.250 linhas que faltaram não foram achadas neste arquivo (procuramos o mesmo nome; 2 linhas do arquivo têm um nome que "
      + "aparece mais vezes no arquivo do que na lista e não entram): ficam de fora desta importação, que é uma vez só. Confira o arquivo antes de confirmar; depois, "
      + "essas pessoas só se cadastram à mão.");
    expect(r.resumoDoResto({ achadas: [{}], naoAchadas: [], ambiguas: 0, foraDaLista: 0 }, { de: 12, faltaram: 1 }).aviso).toBeNull();
  });
  test("o motivo de quem faltou diz a saída de agora (a importação do resto); depois dela, diz de cada linha se veio nela ou não; no próprio resto, não há outra", () => {
    expect(r.textoDe("NAO_TERMINOU")).toBe("A importação parou e não terminou no prazo da guarda dos dados: esta linha ficou de fora (entra na importação das linhas que "
      + "faltaram, que é uma vez só, ou se cadastra à mão)");
    expect(r.textoDe("NAO_TERMINOU_FOI_NO_RESTO")).toBe("A importação parou e não terminou no prazo da guarda dos dados: esta linha ficou de fora e foi achada no "
      + "arquivo da importação das linhas que faltaram (confira na lista dela se a pessoa entrou; se não, cadastre à mão)");
    expect(r.textoDe("NAO_TERMINOU_FORA_DO_RESTO")).toBe("A importação parou e não terminou no prazo da guarda dos dados: esta linha ficou de fora e não veio no "
      + "arquivo da importação das linhas que faltaram, que já foi feita e é uma vez só (cadastre à mão)");
    expect(r.textoDe("NAO_TERMINOU_NO_RESTO")).toBe("A importação das linhas que faltaram parou e não terminou no prazo da guarda dos dados: esta linha ficou de fora "
      + "(cadastre à mão; não há outra importação)");
    expect(r.PROBLEMAS.NAO_TERMINOU_RESTO_FEITO).toBeUndefined();
  });
});

describe("o resumo e a lista (sem dado pessoal)", () => {
  test("os números da prévia, a matrícula fora da sequência e a próxima matrícula", () => {
    const prep = preparar(["100;Ana;IEADESPA - Vila Nova", "101;Bia;IEADESPA - Vila Nova", "0;Caio;IEADESPA - GERAL", "999999;Davi;IEADESPA - Vila Nova", "102;;IEADESPA - Vila Nova"]);
    r.classificar(prep.linhas);
    const s = r.resumir(prep, { maiorMatriculaSistema: 50 });
    // a linha da "IEADESPA - GERAL" fica de fora (G3): conta em problemas e em semCongregacao (as que ficam de fora por isso)
    expect(s).toMatchObject({ total: 5, novas: 3, problemas: 2, numeroNovo: 0, possivelRepetida: 0, semCongregacao: 1, separador: ";", proximaMatricula: 1000000,
      primeiraMatriculaNova: 1000000, vazias: 0, totalColunas: 11, jaExistem: 0, congregacoesReconhecidas: 1 });
    expect(s.existem).toBeUndefined();
    expect(s.avisosGerais.map((a) => a.codigo)).toEqual(["MATRICULA_FORA_DA_SEQUENCIA", "SEM_CONGREGACAO"]);
    expect(s.avisosGerais[1].texto).toBe("1 linha está sem congregação (no arquivo: GERAL ou vazio) e fica de fora: ponha a congregação na planilha e faça a prévia de novo, ou continue sem ela.");
    expect(r.resumir({ ...prep, linhas: [...prep.linhas, { ...prep.linhas[2], linha: 9 }] }, { maiorMatriculaSistema: 50 }).avisosGerais[1].texto)
      .toBe("2 linhas estão sem congregação (no arquivo: GERAL ou vazio) e ficam de fora: ponha a congregação na planilha e faça a prévia de novo, ou continue sem elas.");
    expect(JSON.stringify(s)).not.toMatch(/Ana|Bia|Caio|Davi/);
  });
  test("os quadros da tela: cada linha que entra numa caixa só (a acertar, depois a repetida, depois a que entra como está); as vazias e as que já existem contadas", () => {
    const prep = preparar(["100;Ana Souza;IEADESPA - Vila Nova", "", "100;Ana Maria Souza;IEADESPA - Monte Sião", `101;Bia;IEADESPA - Vila Nova;;;;;;;;${CPF1}`,
      `102;Caio;IEADESPA - Vila Nova;;;;;;;;${CPF1}`, "1;Davi;IEADESPA - Vila Nova", " ; ", "0;Eva;IEADESPA - GERAL"]);
    r.classificar(prep.linhas, { fichasPorMatricula: new Map([[1, { nome: "Davi", cpf: null }]]) });
    const s = r.resumir(prep, { maiorMatriculaSistema: 2 });
    // a linha 4 (100 de novo, a mesma pessoa) é a acertar E repetida: conta só em "a acertar"; a 6 (CPF da 5) é repetida; a 7 (matrícula 1) fica de fora;
    // a da "IEADESPA - GERAL" também (G3)
    expect(s.quadros).toEqual({ comMatricula: 2, acertar: 1, repetidas: 1 });
    expect(s).toMatchObject({ total: 6, vazias: 2, novas: 4, jaExistem: 1, problemas: 2, possivelRepetida: 2, numeroNovo: 1, primeiraMatriculaNova: 103,
      congregacoesReconhecidas: 2, semCongregacao: 1 });
  });
  test("a lista para conferir e o CSV: nunca o CPF nem o contato; a célula que começa com = + - @ é protegida (fórmula)", () => {
    const item = r.linhaParaLista({ linha: 7, matriculaArquivo: "0", nome: "=HYPERLINK(\"x\")", acao: "NOVA", matriculaFinal: 70100, problemas: [], avisos: ["MATRICULA_ZERO"] });
    expect(item).toEqual({ linha: 7, matricula: "0", nome: "=HYPERLINK(\"x\")", acao: "NOVA", matriculaFinal: 70100, motivos: [r.AVISOS.MATRICULA_ZERO] });
    const csv = r.csvDaLista([item]);
    expect(csv.startsWith("﻿Linha;")).toBe(true);
    expect(csv).toMatch(/;"'=HYPERLINK\(""x""\)";Entra;70100;/);
  });
});
