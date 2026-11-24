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
const NOMES = ["descartar", "GUARDA_PADRAO", "guardaDe", "notaDaPrevia", "PERGUNTA_DESCARTAR", "fraseForaApagada", "notaForaAte", "importarLote", "podeDeixarDeFora",
  "perguntaDeixarDeFora", "linhasRecusadas", "fraseDoPrazo", "descartarParada", "PERGUNTA_DESCARTAR_PARADA", "fraseDescartadaPeloPrazo", "fazerPrevia", "fraseDoResto",
  "fraseDaPreviaDoResto", "AVISO_ARQUIVO_RESTO"];

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

// A6 (revisão de 24/11/2026): 5 linhas seguidas que o sistema não conseguiu gravar param a importação; a tela ganha "deixar essas linhas de fora e continuar"
describe("a saída quando o sistema não consegue gravar 5 linhas seguidas", () => {
  test("o lote comum vai só com a importação; o 'deixar de fora' vai com true (nunca com a lista de linhas)", async () => {
    const pedir = jest.fn(async () => ({ ok: true, dados: { importadas: 0, restantes: 1, concluida: false } }));
    const T = carregar(pedir);
    await T.importarLote(7);
    await T.importarLote(7, true);
    igual(pedir.mock.calls.map((c) => [c[0], c[1]]), [["/importacao-membros/lote", { metodo: "POST", corpo: { importacaoId: 7 } }],
      ["/importacao-membros/lote", { metodo: "POST", corpo: { importacaoId: 7, deixarDeFora: true } }]]);
  });
  test("o botão só aparece quando o servidor diz que dá (podeDeixarDeFora: true)", () => {
    const T = carregar(jest.fn());
    expect(T.podeDeixarDeFora({ sucesso: false, podeDeixarDeFora: true, recusadas: [2, 3, 4, 5, 6] })).toBe(true);
    for (const corpo of [null, undefined, "x", {}, { podeDeixarDeFora: "true" }, { podeDeixarDeFora: 1 }]) expect(T.podeDeixarDeFora(corpo)).toBe(false);
  });
  // menor 10 da revisão de 24/11/2026: a pessoa confirmava sem ver quais linhas ficariam de fora. A tela lista cada uma (a linha e o nome) e a pergunta
  // diz quantas
  test("a pergunta antes de deixar de fora diz quantas, para onde vão e quando parar", () => {
    const T = carregar(jest.fn());
    expect(T.perguntaDeixarDeFora(5)).toBe("Deixar de fora as 5 linhas da lista? Elas vão para a lista dos que ficaram de fora (o nome e o motivo), "
      + "para a secretaria cadastrar à mão. Se as linhas seguintes também não entrarem, pare e avise o suporte.");
    expect(T.perguntaDeixarDeFora(1)).toMatch(/^Deixar de fora a linha da lista\? /);
    expect(T.perguntaDeixarDeFora(0)).toMatch(/^Deixar de fora as linhas que o sistema não conseguiu gravar\? /);
  });
  test("as linhas que ficariam de fora vêm do servidor (a linha e o nome); o que não serve é ignorado", () => {
    const T = carregar(jest.fn());
    igual(T.linhasRecusadas({ podeDeixarDeFora: true, recusadas: [{ linha: 812, nome: "Ana Exemplo" }, { linha: 813, nome: "" }] }),
      [{ linha: 812, nome: "Ana Exemplo" }, { linha: 813, nome: "" }]);
    igual(T.linhasRecusadas({ recusadas: [{ linha: "x", nome: "A" }, { linha: 9 }, null, 7, { linha: 10, nome: 5 }, { linha: -1, nome: "B" }] }), [{ linha: 9, nome: "" }]);
    for (const corpo of [null, undefined, "x", {}, { recusadas: "1,2" }]) igual(T.linhasRecusadas(corpo), []);
    // no máximo as 5 (o servidor para em 5 seguidas)
    expect(T.linhasRecusadas({ recusadas: Array.from({ length: 9 }, (_, i) => ({ linha: i + 2, nome: "P" })) })).toHaveLength(5);
  });
  test("a tela mostra a lista das linhas antes do botão e a pergunta com o número delas", () => {
    const tela = fs.readFileSync(path.join(__dirname, "..", "..", "..", "front", "src", "membros", "telas", "Importar.svelte"), "utf8");
    const bloco = tela.slice(tela.indexOf("{#if podeDeixar && !importando}"), tela.indexOf("{/if}", tela.indexOf("Deixar essas linhas de fora e continuar")) + 5);
    expect(bloco).toMatch(/\{#each recusadas as r \(r\.linha\)\}/);
    expect(bloco).toMatch(/Linha \{numero\(r\.linha\)\}/);
    expect(bloco).toMatch(/As linhas que ficam de fora/);
    expect(bloco.indexOf("{#each recusadas")).toBeLessThan(bloco.indexOf("Deixar essas linhas de fora e continuar"));
    expect(tela).toMatch(/window\.confirm\(perguntaDeixarDeFora\(recusadas\.length\)\)/);
    expect(tela).toMatch(/recusadas = podeDeixar \? linhasRecusadas\(l\.corpo\) : \[\]/);
  });
});

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
  test("a lista já apagada: a linha da trilha diz que saiu e por quê, com o prazo que valeu no dia (guardado no resumo)", () => {
    const T = carregar(jest.fn());
    expect(T.fraseForaApagada(feita({ ...res(7), foraApagadaEm: "2027-03-11T09:00:00Z", foraDias: 90 }))).toBe("A lista dos que ficaram de fora foi apagada, 90 dias depois do fim (a guarda dos dados)");
    expect(T.fraseForaApagada(feita(res(7)))).toBe("");
  });
  test("G4: o prazo de hoje não entra na frase (a política mudou depois de apagar: vale o do dia)", () => {
    const T = carregar(jest.fn());
    // apagou com 90; hoje a política é de 30: a frase continua dizendo 90
    expect(T.fraseForaApagada(feita({ ...res(7), foraApagadaEm: "2027-03-11T09:00:00Z", foraDias: 90 }), { diasPrevia: 7, diasFora: 30 }))
      .toBe("A lista dos que ficaram de fora foi apagada, 90 dias depois do fim (a guarda dos dados)");
    // a apagada antes desta versão (sem o prazo no resumo): os dias entre o fim (10/12/2026, Brasília) e o dia em que apagou (11/03/2027, Brasília)
    expect(T.fraseForaApagada(feita({ ...res(7), foraApagadaEm: "2027-03-11T09:00:00Z" }), { diasPrevia: 7, diasFora: 30 }))
      .toBe("A lista dos que ficaram de fora foi apagada, 91 dias depois do fim (a guarda dos dados)");
    // sem como saber os dias: a frase sem o número
    expect(T.fraseForaApagada({ ...feita({ ...res(7), foraApagadaEm: "2027-03-11T09:00:00Z" }), concluidaEm: null }))
      .toBe("A lista dos que ficaram de fora foi apagada (a guarda dos dados)");
  });
});

// G3 (decisão dele de 24/11/2026): sem congregação não há importação. A linha sem congregação ("IEADESPA - GERAL" ou vazia) fica de fora na prévia, com o
// motivo; a Geral corrige a planilha ou continua sem ela. As telas não dizem mais que essas pessoas "entram sem congregação" nem que "a Geral escolhe".
describe("as telas da importação sem a ficha sem congregação (G3)", () => {
  const PASTA = path.join(__dirname, "..", "..", "..", "front", "src", "membros", "importar");
  const ler = (arq) => fs.readFileSync(path.join(PASTA, arq), "utf8");
  test("o passo do arquivo diz que a linha sem congregação fica de fora", () => {
    const t = ler("PassoArquivo.svelte");
    expect(t).toMatch(/<small>sem congregação \(“IEADESPA - GERAL” ou vazia\) fica de fora<\/small>/);
    expect(t).not.toMatch(/fica sem congregação/);
  });
  test("a prévia conta as que ficam de fora por falta de congregação", () => {
    const t = ler("PassoNumeros.svelte");
    expect(t).toMatch(/\{ n: r\.semCongregacao, rotulo: "Sem congregação", sub: "ficam de fora" \}/);
    expect(t).not.toMatch(/sub: "“IEADESPA - GERAL”"/);
  });
  test("o resultado não promete que a Geral distribui: o quadro passa a ser o das linhas que ficaram de fora", () => {
    const t = ler("PassoResultado.svelte");
    expect(t).not.toMatch(/para a Geral distribuir|a Geral escolhe/);
    expect(t).toMatch(/\{ n: res \? res\.fora : 0, rotulo: "Ficaram de fora", sub: "na lista para baixar" \}/);
  });
  test("a lista da prévia não fala mais da linha que entra sem congregação", () => {
    expect(fs.readFileSync(ARQ, "utf8")).not.toMatch(/semCongregacao: boolean \| null|e sem congregação/);
  });
});

// G2 (decisão dele de 24/11/2026): o prazo da importação parada é de 7 dias contados do ÚLTIMO LOTE, e a tela parada mostra "faltam N dias". Vencido, com
// gente já importada, as linhas que faltam ficam de fora (fica só o número da linha e o nome, para uma importação só com elas); sem ninguém importado, a
// importação é descartada. Os dois com os dados pessoais apagados.
describe("G2: a tela parada mostra o prazo (faltam N dias)", () => {
  const prazo = (faltam, venceEm = "2026-12-03T14:00:00Z") => ({ dias: 7, venceEm, faltam });
  test("com gente já importada: quantos dias faltam, até quando e o que acontece depois", () => {
    const T = carregar(jest.fn());
    expect(T.fraseDoPrazo(prazo(5), 40)).toBe("Faltam 5 dias para continuar (até 03/12/2026). Depois do prazo, as linhas que faltam ficam de fora e os dados pessoais "
      + "delas se apagam: o sistema guarda só o número da linha e o nome, para uma importação só com elas.");
    expect(T.fraseDoPrazo(prazo(1), 40)).toMatch(/^Falta 1 dia para continuar \(até 03\/12\/2026\)\. Depois do prazo, as linhas que faltam ficam de fora/);
    expect(T.fraseDoPrazo(prazo(0), 40)).toBe("O prazo para continuar acabou em 03/12/2026: continue agora; senão, o sistema deixa de fora as linhas que faltam e apaga "
      + "os dados pessoais delas.");
    // o dia é o de Brasília (02h de 03/12 em UTC ainda é 02/12 em Brasília)
    expect(T.fraseDoPrazo(prazo(2, "2026-12-03T02:00:00Z"), 40)).toMatch(/\(até 02\/12\/2026\)/);
  });
  test("sem ninguém importado: depois do prazo, a importação é descartada", () => {
    const T = carregar(jest.fn());
    expect(T.fraseDoPrazo(prazo(3), 0)).toBe("Faltam 3 dias para continuar (até 03/12/2026). Depois do prazo, a importação é descartada e os dados pessoais da planilha se apagam.");
    expect(T.fraseDoPrazo(prazo(0), 0)).toBe("O prazo para continuar acabou em 03/12/2026: continue agora; senão, o sistema descarta a importação e apaga os dados pessoais da planilha.");
  });
  test("sem prazo, ou com um prazo que não serve: nada", () => {
    const T = carregar(jest.fn());
    for (const p of [null, undefined, {}, prazo(-1), prazo(1.5), prazo("2"), prazo(2, "ontem"), prazo(2, null)]) expect(T.fraseDoPrazo(p, 40)).toBe("");
  });
  test("a tela parada mostra a frase do prazo, com o prazo e quantas entraram que vêm do servidor", () => {
    const tela = fs.readFileSync(path.join(__dirname, "..", "..", "..", "front", "src", "membros", "telas", "Importar.svelte"), "utf8");
    expect(tela).toMatch(/const prazoTexto = \$derived\(fraseDoPrazo\(est\?\.prazo, est\?\.importadas, est\?\.importacao\?\.restoDe != null\)\)/);
    const secao = tela.slice(tela.indexOf("<h2>A importação começou e não terminou</h2>"), tela.indexOf("Continuar a importação</Botao>"));
    expect(secao).toMatch(/\{#if prazoTexto\}<p class="prazo">\{prazoTexto\}<\/p>\{\/if\}/);
  });
});

// G2 (decisão dele de 24/11/2026): a parada sem ninguém importado ganha a saída "descartar a importação"; e, se a rotina a descartou no fim do prazo, a tela
// volta ao arquivo dizendo qual foi e quando (não some calada).
describe("G2: descartar a importação parada sem ninguém importado", () => {
  const TELA = path.join(__dirname, "..", "..", "..", "front", "src", "membros", "telas", "Importar.svelte");
  test("o botão chama a rota própria (a que pede a confirmação recente), só com a importação", async () => {
    const pedir = jest.fn(async () => ({ ok: true, dados: { sucesso: true } }));
    const T = carregar(pedir);
    await T.descartarParada(9);
    igual(pedir.mock.calls.map((c) => [c[0], c[1]]), [["/importacao-membros/descartar-parada", { metodo: "POST", corpo: { importacaoId: 9 } }]]);
  });
  test("a pergunta antes de descartar diz que ninguém entrou, o que sai e como voltar", () => {
    const T = carregar(jest.fn());
    expect(T.PERGUNTA_DESCARTAR_PARADA).toBe("Descartar esta importação? Ninguém entrou ainda: a planilha sai do sistema agora, com o CPF, o celular, a mãe e o pai. "
      + "Para importar, escolha o arquivo de novo.");
  });
  test("a frase da descartada pelo prazo: qual (o arquivo e a confirmação), quando e por quê", () => {
    const T = carregar(jest.fn());
    const d = { importacaoId: 12, nomeArquivo: "membros.csv", confirmadaEm: "2026-12-01T13:00:00Z", descartadaEm: "2026-12-09T06:00:00Z", dias: 7 };
    expect(T.fraseDescartadaPeloPrazo(d)).toBe("A importação do arquivo “membros.csv”, confirmada em 01/12/2026, parou sem ninguém importado e foi descartada em "
      + "09/12/2026, no fim do prazo de 7 dias: os dados da planilha foram apagados. Para importar, escolha o arquivo de novo.");
    expect(T.fraseDescartadaPeloPrazo({ ...d, nomeArquivo: null, dias: 1 })).toBe("A importação confirmada em 01/12/2026 parou sem ninguém importado e foi descartada "
      + "em 09/12/2026, no fim do prazo de 1 dia: os dados da planilha foram apagados. Para importar, escolha o arquivo de novo.");
    for (const x of [null, undefined, {}, { ...d, dias: 0 }, { ...d, descartadaEm: "x" }]) expect(T.fraseDescartadaPeloPrazo(x)).toBe("");
  });
  test("a tela parada mostra o botão só quando ninguém entrou; o passo do arquivo mostra a descartada pelo prazo", () => {
    const tela = fs.readFileSync(TELA, "utf8");
    const secao = tela.slice(tela.indexOf("<h2>A importação começou e não terminou</h2>"), tela.indexOf("</section>", tela.indexOf("<h2>A importação começou e não terminou</h2>")));
    expect(secao).toMatch(/\{#if est\.importadas === 0 && !importando\}[\s\S]*onclick=\{descartarImportacaoParada\}>Descartar a importação<\/Botao>/);
    expect(tela).toMatch(/window\.confirm\(PERGUNTA_DESCARTAR_PARADA\)/);
    expect(tela).toMatch(/await descartarParada\(imp\.importacaoId\)/);
    const passo1 = tela.slice(tela.indexOf("{#if passo === 1}"), tela.indexOf("<PassoArquivo"));
    expect(passo1).toMatch(/\{#if descartadaTexto\}<Aviso tom="info">\{descartadaTexto\}<\/Aviso>\{\/if\}/);
    expect(tela).toMatch(/const descartadaTexto = \$derived\(fraseDescartadaPeloPrazo\(est\?\.descartadaPeloPrazo\)\)/);
  });
});

// G2 (decisão dele de 24/11/2026): com a lista de QUAIS linhas faltaram, a Secretaria Geral faz UMA importação nova só com elas (o resto). A tela: o bloco
// "As linhas que faltaram" no resultado (quantas, as primeiras, o botão; depois, o que o resto fez), o passo do arquivo no modo do resto e a nota da prévia.
// Nada disso tem desenho aprovado: os textos vão no relatório para ele ver.
describe("G2: a importação só das linhas que faltaram (a tela)", () => {
  const PASTA = path.join(__dirname, "..", "..", "..", "front", "src", "membros");
  const ler = (arq) => fs.readFileSync(path.join(PASTA, arq), "utf8");
  test("a prévia do resto vai com resto: true; a comum, sem", async () => {
    const pedir = jest.fn(async () => ({ ok: true, dados: { importacaoId: 8, resumo: {} } }));
    const T = carregar(pedir);
    await T.fazerPrevia({ nomeArquivo: "membros.csv", texto: "x", resto: true });
    await T.fazerPrevia({ nomeArquivo: "membros.csv", texto: "x" });
    igual(pedir.mock.calls.map((c) => [c[0], c[1]]), [["/importacao-membros/previa", { metodo: "POST", corpo: { nomeArquivo: "membros.csv", texto: "x", resto: true } }],
      ["/importacao-membros/previa", { metodo: "POST", corpo: { nomeArquivo: "membros.csv", texto: "x" } }]]);
  });
  test("o bloco do resultado: quantas faltaram e a saída (uma vez); depois, o que o resto fez; aberto ou sem nada, calado", () => {
    const T = carregar(jest.fn());
    const base = { de: 7, faltaram: 1207, linhas: [{ linha: 3912, nome: "Paulo Henrique Dias" }], possivel: true, aberto: false, feito: null };
    expect(T.fraseDoResto(base)).toBe("A importação não terminou no prazo: 1.207 linhas faltaram, e o sistema guardou só o número da linha e o nome de cada uma. "
      + "Você pode fazer uma importação só com elas, uma vez: mande o mesmo arquivo de novo, ou uma planilha só com essas linhas.");
    expect(T.fraseDoResto({ ...base, faltaram: 1 })).toBe("A importação não terminou no prazo: 1 linha faltou, e o sistema guardou só o número da linha e o nome "
      + "dela. Você pode fazer uma importação só com ela, uma vez: mande o mesmo arquivo de novo, ou uma planilha só com essa linha.");
    // feito: as que entraram e as que ficaram de fora nele (na lista dele) e as que não vieram no arquivo dele (marcadas na lista da importação de antes)
    const feito = { ...base, possivel: false, feito: { importacaoId: 8, concluidaEm: "2026-12-22T13:00:00Z", importadas: 1140, fora: 10, naoAchadas: 57 } };
    expect(T.fraseDoResto(feito)).toBe("A importação das linhas que faltaram foi feita em 22/12/2026: 1.140 entraram e 10 ficaram de fora (na lista dela para baixar); "
      + "57 não vieram no arquivo (marcadas na lista do que aconteceu). É uma vez só: quem ainda faltar se cadastra à mão.");
    expect(T.fraseDoResto({ ...feito, feito: { ...feito.feito, importadas: 3, fora: 0, naoAchadas: 1 } })).toBe("A importação das linhas que faltaram foi feita em "
      + "22/12/2026: 3 entraram; 1 não veio no arquivo (marcada na lista do que aconteceu). É uma vez só: quem ainda faltar se cadastra à mão.");
    expect(T.fraseDoResto({ ...feito, feito: { ...feito.feito, importadas: 1, fora: 0, naoAchadas: 0 } })).toBe("A importação das linhas que faltaram foi feita em "
      + "22/12/2026: 1 entrou. É uma vez só: quem ainda faltar se cadastra à mão.");
    for (const x of [null, undefined, { ...base, possivel: false }, { ...base, aberto: true, possivel: false }, { ...base, faltaram: 0 }, { ...base, faltaram: "3" }]) {
      expect(T.fraseDoResto(x)).toBe("");
    }
  });
  test("a nota da prévia do resto: quantas foram achadas e quantas linhas do arquivo ficam fora da lista", () => {
    const T = carregar(jest.fn());
    const r = { de: 7, faltaram: 1207, achadas: 1150, naoAchadas: 57, ambiguas: 0, foraDaLista: 3840, listaNaoAchadas: [] };
    expect(T.fraseDaPreviaDoResto(r)).toBe("Importação só das linhas que faltaram (uma vez): 1.150 das 1.207 linhas foram achadas neste arquivo; as outras 3.840 "
      + "linhas do arquivo não estão na lista e ficam fora.");
    expect(T.fraseDaPreviaDoResto({ ...r, achadas: 1, faltaram: 3, foraDaLista: 1 })).toBe("Importação só das linhas que faltaram (uma vez): 1 das 3 linhas foi "
      + "achada neste arquivo; a outra linha do arquivo não está na lista e fica fora.");
    expect(T.fraseDaPreviaDoResto({ ...r, foraDaLista: 0 })).toBe("Importação só das linhas que faltaram (uma vez): 1.150 das 1.207 linhas foram achadas neste arquivo.");
    for (const x of [null, undefined, {}, { ...r, faltaram: 0 }, { ...r, achadas: "1" }]) expect(T.fraseDaPreviaDoResto(x)).toBe("");
  });
  test("o passo do arquivo no modo do resto diz o que mandar; o prazo do resto parado não promete outra importação", () => {
    const T = carregar(jest.fn());
    expect(T.AVISO_ARQUIVO_RESTO).toBe("Importação só das linhas que faltaram (uma vez): escolha o mesmo arquivo da importação, ou uma planilha só com essas linhas. "
      + "Entram só as linhas da lista, achadas pelo nome; as outras ficam fora.");
    const prazo = { dias: 7, venceEm: "2026-12-03T14:00:00Z", faltam: 5 };
    expect(T.fraseDoPrazo(prazo, 40, true)).toBe("Faltam 5 dias para continuar (até 03/12/2026). Depois do prazo, as linhas que faltam ficam de fora e os dados pessoais "
      + "delas se apagam: fica só o número da linha e o nome, para cadastrar à mão.");
    expect(T.fraseDoPrazo(prazo, 0, true)).toBe("Faltam 5 dias para continuar (até 03/12/2026). Depois do prazo, a importação é descartada e os dados pessoais da planilha se apagam.");
  });
  test("a tela abre na prévia e no andamento do resto antes do resultado; o modo do resto vale no passo do arquivo e na prévia", () => {
    const tela = ler("telas/Importar.svelte");
    const c = tela.slice(tela.indexOf("async function carregar()"), tela.indexOf("if (geral) void carregar();"));
    expect(c.indexOf("if (r.dados.emAndamento) passo = 3;")).toBeGreaterThan(-1);
    expect(c.indexOf("if (r.dados.emAndamento) passo = 3;")).toBeLessThan(c.indexOf('imp.situacao === "PREVIA"'));
    expect(c.indexOf('imp.situacao === "PREVIA"')).toBeLessThan(c.indexOf("else if (r.dados.feita) passo = 4;"));
    expect(c).toMatch(/modoResto = imp\?\.restoDe != null;/);
    const passo1 = tela.slice(tela.indexOf("{#if passo === 1}"), tela.indexOf("<PassoNumeros"));
    expect(passo1).toMatch(/\{#if modoResto\}\s*<Aviso tom="info">\{AVISO_ARQUIVO_RESTO\}/);
    expect(passo1).toMatch(/<PassoArquivo \{celular\} campos=\{est\.campos\} resto=\{modoResto\}/);
    expect(tela).toMatch(/\{#if previaRestoTexto\}<Aviso tom="info">\{previaRestoTexto\}<\/Aviso>\{\/if\}\s*<PassoNumeros/);
    expect(tela).toMatch(/<PassoResultado [^>]*resto=\{est\.resto \?\? null\}[^>]*onresto=\{importarResto\}/);
    const arq = ler("importar/PassoArquivo.svelte");
    expect(arq.match(/\.\.\.\(resto \? \{ resto: true as const \} : \{\}\)/g) || []).toHaveLength(2);
  });
  test("na prévia do resto, os números dizem o que é: o arquivo conta todas as linhas; o primeiro quadro, as achadas das que faltaram (as fotos acharam)", () => {
    const arq = ler("importar/PassoArquivo.svelte");
    expect(arq).toMatch(/const linhasNoArquivo = \$derived\(r \? r\.total \+ r\.vazias \+ \(r\.resto \? r\.resto\.foraDaLista \+ r\.resto\.ambiguas : 0\) : 0\);/);
    expect(arq).toMatch(/\{numero\(linhasNoArquivo\)\} \{plural\(linhasNoArquivo, "linha", "linhas"\)\}/);
    const num = ler("importar/PassoNumeros.svelte");
    expect(num).toMatch(/r\.resto\s*\? \{ n: r\.total, rotulo: "Achadas no arquivo", sub: `das \$\{numero\(r\.resto\.faltaram\)\} que faltaram` \}/);
    expect(num).toMatch(/: \{ n: r\.total, rotulo: "Pessoas no arquivo",/);
  });
  test("o resultado: o bloco fica fora da divisão celular/computador; o botão só quando o resto pode; a nota do 'não se importa de novo' some enquanto pode", () => {
    const t = ler("importar/PassoResultado.svelte");
    const bloco = t.indexOf('<section class="resto"');
    expect(bloco).toBeGreaterThan(-1);
    expect(bloco).toBeLessThan(t.indexOf("{#if celular}"));
    expect(t).toMatch(/\{#if resto\?\.possivel && resto\.linhas\.length\}[\s\S]*onclick=\{onresto\}>Importar só as linhas que faltaram<\/Botao>/);
    expect(t).toMatch(/\{#if !resto\?\.possivel\}<p class="nota">Não se importa de novo: esta tela fica só com o resultado\.<\/p>\{\/if\}/);
    expect(t).toMatch(/baixarLista\(resto\.feito\.importacaoId\)/);
  });
});
