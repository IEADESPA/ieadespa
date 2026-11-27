// A ferramenta que confere a planilha de verdade no computador, sem banco (tools/ensaio-importacao/conferir-planilha.js). Revisão permanente de 27/11 (I1):
// ela não pegava a aspa aberta na última linha sem a quebra no fim, e imprimia na tela o resto dessa linha (e-mail, celular, CPF) como "congregação sem par".
// O que ela mostra na tela nunca tem nome, CPF, celular ou e-mail. Só dados de mentira.
const { conferir, linhasDaTela } = require("../../../tools/ensaio-importacao/conferir-planilha");

const CAB = "MATRÍCULA;NOME;IGREJA;SEXO;NASCIMENTO;ESTADO CIVIL;E-MAIL;CELULAR;MÃE;PAI;CPF";
const CPF1 = "52998224725";
const CONGS = ["Vila Nova", "Monte Sião"];
const HOJE = "2026-11-27";
const tela = (linhas) => linhasDaTela({ arquivo: "planilha.csv", codificacao: "UTF-8" }, conferir([CAB, ...linhas].join("\r\n"), CONGS, HOJE)).join("\n");

describe("a ferramenta da planilha", () => {
  test("a aspa que abre e não fecha na última linha, sem quebra no fim: a prévia recusaria, com a linha, sem dado da pessoa na tela", () => {
    const r = conferir([CAB, "70001;Ana Um;IEADESPA - Vila Nova", `70002;Bia Dois;"IEADESPA - Vila Nova;FEMININO;01/01/1990;CASADA;bia@example.org;(91) 90000-0002;Mae Dois;Pai Dois;${CPF1}`]
      .join("\r\n"), CONGS, HOJE);
    expect(r.erro).toBe("A linha 3 do arquivo abre aspas (\") e não fecha: o resto dessa linha entraria num campo só. Corrija essa linha na planilha e mande o arquivo de novo.");
    const t = linhasDaTela({ arquivo: "planilha.csv", codificacao: "UTF-8" }, r).join("\n");
    expect(t).toMatch(/A PRÉVIA RECUSARIA O ARQUIVO: A linha 3/);
    expect(t).not.toMatch(new RegExp(`${CPF1}|Bia|Mae Dois|example|90000`));
  });
  test("a congregação sem par sai na tela sem o número comprido (CPF, celular) e sem o e-mail; o resto do nome fica, para a Geral achar", () => {
    const t = tela([`70001;Ana Um;"IEADESPA - Vila 529.982.247-25 ana@example.org"`, "70002;Bia Dois;IEADESPA - Lugar Nenhum", "70003;Caio Tres;IEADESPA - Vila Nova"]);
    expect(t).toMatch(/congregações do arquivo que não estão na lista/);
    expect(t).toMatch(/Vila \[número\] \[e-mail\]/);
    expect(t).toMatch(/Lugar Nenhum/);
    expect(t).not.toMatch(/529|example|Ana Um|Bia Dois|Caio/);
    expect(t).toMatch(/pessoas: 3 · entram: 1 · ficam de fora: 2/);
  });
});
