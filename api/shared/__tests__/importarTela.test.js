// Importar os membros do sistema pago (FASE 10, Membros): as regras da TELA (front/src/membros/importar/importar.ts) para a GUARDA DOS DADOS (respostas
// dele de 23/11/2026, LGPD): o botão "Descartar" chama a rota que apaga a prévia na hora; a nota diz em quantos dias a prévia não confirmada se apaga
// sozinha; no resultado, até quando a lista dos que ficaram de fora fica (e, depois, que ela foi apagada). Os prazos vêm do servidor (o estado), com 7 e 90
// de reserva. O arquivo .ts é carregado direto: o Node tira os tipos (module.stripTypeScriptTypes, Node 22.13 ou mais novo) e roda num contexto isolado,
// com a ida ao servidor (pedir) e a casca (ponte) simuladas.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { stripTypeScriptTypes } = require("node:module");

const ARQ = path.join(__dirname, "..", "..", "..", "front", "src", "membros", "importar", "importar.ts");
const NOMES = ["descartar", "GUARDA_PADRAO", "guardaDe", "notaDaPrevia", "PERGUNTA_DESCARTAR", "fraseForaApagada", "notaForaAte"];

function carregar(pedir) {
  if (typeof stripTypeScriptTypes !== "function") throw new Error("este Node não tira tipos do TypeScript (precisa do 22.13 ou mais novo)");
  const fonte = fs.readFileSync(ARQ, "utf8").replace(/^import .*$/gm, "");
  const js = stripTypeScriptTypes(fonte, { mode: "strip" }).replace(/^export (async function|function|const) /gm, "$1 ");
  expect(js).not.toMatch(/^\s*(import|export)\b/m);
  const numero = (n) => new Intl.NumberFormat("pt-BR").format(n);
  const qs = (o) => "?" + new URLSearchParams(o).toString();
  return vm.runInNewContext(`${js}\n;({ ${NOMES.join(", ")} })`, { pedir, qs, numero, ponte: () => ({}) });
}
const igual = (a, b) => expect(JSON.parse(JSON.stringify(a))).toEqual(b);
const feita = (resumo, concluidaEm = "2026-12-10T18:42:00Z") => ({ importacaoId: 7, situacao: "CONCLUIDA", nomeArquivo: "membros.csv", criadaEm: null, confirmadaEm: null,
  concluidaEm, resumo });

describe("o botão Descartar", () => {
  test("chama a rota que apaga a prévia na hora (POST /importacao-membros/descartar com a importação)", async () => {
    const pedir = jest.fn(async () => ({ ok: true, dados: { sucesso: true } }));
    const T = carregar(pedir);
    await T.descartar(12);
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(pedir.mock.calls[0][0]).toBe("/importacao-membros/descartar");
    igual(pedir.mock.calls[0][1], { metodo: "POST", corpo: { importacaoId: 12 } });
  });
  test("a pergunta antes de apagar diz o que sai (os dados pessoais da planilha) e como voltar", () => {
    const T = carregar(jest.fn());
    expect(T.PERGUNTA_DESCARTAR).toBe("Descartar esta prévia? A planilha sai do sistema agora, com o CPF, o celular, a mãe e o pai. Para importar, escolha o arquivo de novo.");
  });
});

describe("os prazos da guarda", () => {
  test("vêm do servidor; sem eles (ou inválidos), os das respostas dele: 7 e 90 dias", () => {
    const T = carregar(jest.fn());
    igual(T.GUARDA_PADRAO, { diasPrevia: 7, diasFora: 90 });
    igual(T.guardaDe({ diasPrevia: 3, diasFora: 30 }), { diasPrevia: 3, diasFora: 30 });
    igual(T.guardaDe(null), { diasPrevia: 7, diasFora: 90 });
    igual(T.guardaDe({ diasPrevia: 0, diasFora: "x" }), { diasPrevia: 7, diasFora: 90 });
  });
  test("a nota da prévia: em quantos dias ela se apaga sozinha (1 dia no singular)", () => {
    const T = carregar(jest.fn());
    expect(T.notaDaPrevia(T.GUARDA_PADRAO)).toBe("Sem confirmar, esta prévia se apaga sozinha em 7 dias.");
    expect(T.notaDaPrevia({ diasPrevia: 1, diasFora: 90 })).toBe("Sem confirmar, esta prévia se apaga sozinha em 1 dia.");
  });
});

describe("a lista dos que ficaram de fora, no resultado", () => {
  const res = (fora) => ({ resultado: { importadas: 5040, fora, numeroNovo: 0, possivelRepetida: 0, semCongregacao: 0 } });
  test("com gente de fora: até quando a lista fica (90 dias depois do fim, no dia de Brasília)", () => {
    const T = carregar(jest.fn());
    // terminou em 10/12/2026 às 15h42 de Brasília: 90 dias depois = 10/03/2027
    expect(T.notaForaAte(feita(res(7)), T.GUARDA_PADRAO)).toBe("A lista dos que ficaram de fora se apaga sozinha a partir de 10/03/2027 (90 dias depois do fim): baixe antes, se precisar.");
    // 23h30 de Brasília já é o dia seguinte em UTC: conta o dia de Brasília
    expect(T.notaForaAte(feita(res(7), "2026-12-11T02:30:00Z"), { diasPrevia: 7, diasFora: 30 })).toBe("A lista dos que ficaram de fora se apaga sozinha a partir de 09/01/2027 (30 dias depois do fim): baixe antes, se precisar.");
  });
  test("ninguém de fora, ou a lista já apagada: a nota não aparece", () => {
    const T = carregar(jest.fn());
    expect(T.notaForaAte(feita(res(0)), T.GUARDA_PADRAO)).toBe("");
    expect(T.notaForaAte(feita({ ...res(7), foraApagadaEm: "2027-03-11T09:00:00" }), T.GUARDA_PADRAO)).toBe("");
    expect(T.notaForaAte(feita(null), T.GUARDA_PADRAO)).toBe("");
  });
  test("a lista já apagada: a linha da trilha diz que saiu e por quê", () => {
    const T = carregar(jest.fn());
    expect(T.fraseForaApagada(feita({ ...res(7), foraApagadaEm: "2027-03-11T09:00:00" }), T.GUARDA_PADRAO)).toBe("A lista dos que ficaram de fora foi apagada, 90 dias depois do fim (a guarda dos dados)");
    expect(T.fraseForaApagada(feita(res(7)), T.GUARDA_PADRAO)).toBe("");
  });
});
