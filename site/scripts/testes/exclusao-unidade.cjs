// Testes de UNIDADE da exclusão em massa dos pedidos de camiseta NÃO separados (src/lib/exclusaoEmMassa.ts): o que entra, o que NUNCA entra, o que a confirmação promete
// sobre a conta da malharia (lote fechado = números travados), a cópia que se baixa antes de apagar e a ordem da restauração. Só funções puras: sem rede nem Directus.
// Como rodar (de dentro de site/):  node scripts/testes/exclusao-unidade.cjs
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const arquivo = path.join(__dirname, "../../src/lib/exclusaoEmMassa.ts");
const js = ts.transpileModule(fs.readFileSync(arquivo, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = new Module("exclusaoEmMassa.js");
mod._compile(js, "exclusaoEmMassa.js");
const X = mod.exports;

let falhas = 0;
let total = 0;
const eq = (a, b, d) => {
  total++;
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { falhas++; console.log("  FALHA", d, "→", JSON.stringify(a), "esperado", JSON.stringify(b)); } else console.log("  ok   ", d);
};
const verdade = (c, d) => eq(!!c, true, d);

// os pedidos do cenário da Marcha: 3 não separados (um de lote fechado, um de lote aberto, um sem lote), 1 separado, 1 avulso, 1 que levou uma peça, 1 que levou tudo
const item = (tamanho, quantidade, retirada = 0, modelo = "Unico") => ({ tamanho, modelo, quantidade, quantidade_retirada: retirada });
const ped = (id, extra = {}) => ({ id, avulso: false, separado: false, lote: 12, itens: [item("M", 1)], ...extra });
const lotes = [
  { id: 12, numero: 1, status: "fechado", total_vendido: 100 },
  { id: 13, numero: 2, status: "aberto", total_vendido: null },
  { id: 14, numero: 3, status: "fechado", total_vendido: null },     // fechado sem números travados (legado): calcula ao vivo
];
// o que a tela chama de "não separado" (a mesma regra de pedidos.astro: não avulso, sem reserva, ainda falta retirar)
const tudoRetirado = (p) => p.itens.length > 0 && p.itens.every((i) => i.quantidade_retirada >= i.quantidade);
const estaNaoSeparado = (p) => !p.avulso && !p.separado && !tudoRetirado(p);

console.log("== quem pode ser excluído ==");
const cenario = [
  ped(30), ped(10), ped(20, { lote: 13, itens: [item("G", 2)] }), ped(40, { lote: null }),
  ped(11, { separado: true }),                                   // já separado: a pessoa ainda pode vir
  ped(12, { avulso: true, lote: null }),                         // venda de balcão
  ped(13, { itens: [item("M", 2, 1)] }),                         // levou UMA das duas peças: é prova do que recebeu
  ped(14, { itens: [item("P", 1, 1)] }),                         // levou tudo
  ped(15, { itens: [item("P", 1), item("G", 1, 1)] }),           // levou uma peça de um dos itens
  ped(16, { itens: [] }),                                        // sem itens (pedido vazio): nada a perder
];
const el = X.elegiveisParaExcluir(cenario, estaNaoSeparado);
eq(el.map((p) => p.id), [10, 16, 20, 30, 40], "entram só os não separados, não avulsos e sem nenhuma peça levada, do mais antigo ao mais novo");
verdade(!el.some((p) => [11, 12, 13, 14, 15].includes(p.id)), "separado, avulso, quem levou alguma peça e quem levou tudo ficam de fora");
eq(X.levouAlgumaPeca(ped(1, { itens: [item("M", 3, 0), item("G", 1, 1)] })), true, "levouAlgumaPeca: uma peça de qualquer item basta");
eq(X.levouAlgumaPeca(ped(1)), false, "levouAlgumaPeca: nenhuma");
eq(X.levouAlgumaPeca({ itens: undefined }), false, "levouAlgumaPeca: sem lista de itens não quebra");
eq(X.levouAlgumaPeca(ped(1, { itens: [{ quantidade: 1, quantidade_retirada: "1" }] })), true, "levouAlgumaPeca: número escrito como texto vale");
eq(X.elegiveisParaExcluir([], estaNaoSeparado), [], "lista vazia");
eq(X.elegiveisParaExcluir([ped(2, { avulso: true })], () => true), [], "mesmo que a tela diga que sim, avulso nunca entra (defesa em dobro)");
eq(X.elegiveisParaExcluir([ped(2, { separado: true })], () => true), [], "mesmo que a tela diga que sim, separado nunca entra");
eq(X.elegiveisParaExcluir([ped(2, { itens: [item("M", 1, 1)] })], () => true), [], "mesmo que a tela diga que sim, quem levou peça nunca entra");
const ordemOriginal = [ped(3), ped(1), ped(2)];
X.elegiveisParaExcluir(ordemOriginal, estaNaoSeparado);
eq(ordemOriginal.map((p) => p.id), [3, 1, 2], "não reordena a lista da tela (trabalha numa cópia)");

console.log("== os primeiros N ==");
eq(X.limiteDaExclusao("", 300), 300, "vazio = todos");
eq(X.limiteDaExclusao("   ", 300), 300, "só espaços = todos");
eq(X.limiteDaExclusao(undefined, 300), 300, "indefinido = todos");
eq(X.limiteDaExclusao("50", 300), 50, "50 de 300");
eq(X.limiteDaExclusao("500", 300), 300, "mais que o total vira o total");
eq(X.limiteDaExclusao("0", 300), null, "zero não vale");
eq(["-1", "1.5", "1e2", "abc", "0x10", "٣", "5 6", "1234567890"].map((t) => X.limiteDaExclusao(t, 300)), [null, null, null, null, null, null, null, null], "texto que não é número inteiro positivo é recusado");
eq(X.limiteDaExclusao(" 7 ", 300), 7, "espaços ao redor são ignorados");

console.log("== lote travado × lote ao vivo ==");
eq([X.loteTravado(lotes[0]), X.loteTravado(lotes[1]), X.loteTravado(lotes[2]), X.loteTravado(undefined), X.loteTravado(null)], [true, false, false, false, false], "só fechado COM números travados é travado");
const alvo = X.elegiveisParaExcluir(cenario, estaNaoSeparado);
const r = X.resumoDaExclusao(alvo, lotes);
eq([r.pedidos, r.pecas, r.primeiroId, r.ultimoId], [5, 5, 10, 40], "resumo: 5 pedidos, 5 peças (o de G tem 2; o sem itens tem 0), do #10 ao #40");
eq(r.emLoteTravado, { pedidos: 3, pecas: 2, lotes: [1] }, "3 pedidos (10, 16 e 30) estão em lote fechado e travado: a conta da malharia não muda");
eq(r.emLoteAoVivo, { pedidos: 2, pecas: 3, lotes: [2] }, "2 pedidos (o do lote aberto e o sem lote) contam ao vivo");
eq(r.porTamanho, [{ rotulo: "G · Unico", quantidade: 2 }, { rotulo: "M · Unico", quantidade: 3 }], "peças por tamanho e modelo, em ordem");
const soFechados = X.resumoDaExclusao([ped(1), ped(2)], lotes);
eq([soFechados.emLoteTravado.pedidos, soFechados.emLoteAoVivo.pedidos], [2, 0], "só lote fechado: nada ao vivo");
eq(X.resumoDaExclusao([], lotes), { pedidos: 0, pecas: 0, porTamanho: [], emLoteTravado: { pedidos: 0, pecas: 0, lotes: [] }, emLoteAoVivo: { pedidos: 0, pecas: 0, lotes: [] }, primeiroId: null, ultimoId: null }, "resumo vazio");
eq(X.resumoDaExclusao([ped(1, { lote: 999 })], lotes).emLoteAoVivo.pedidos, 1, "lote que a tela não conhece conta como ao vivo (não promete o que não sabe)");
eq(X.resumoDaExclusao([ped(1, { itens: [{ tamanho: null, modelo: null, quantidade: 2, quantidade_retirada: 0 }] })], lotes).porTamanho, [{ rotulo: "sem tamanho", quantidade: 2 }], "item sem tamanho aparece como 'sem tamanho'");
eq(X.resumoDaExclusao([ped(1, { itens: [{ tamanho: "M", modelo: "", quantidade: -3, quantidade_retirada: 0 }] })], lotes).pecas, 0, "quantidade negativa nunca soma peça");

console.log("== o que a confirmação promete ==");
const t1 = X.textoDaConfirmacao(X.resumoDaExclusao(soFechados ? [ped(1), ped(2)] : [], lotes), "Lote 1 · Não separados");
verdade(/^EXCLUIR 2 pedidos que NÃO foram separados e em que ninguém levou nenhuma peça\?/.test(t1), "começa dizendo quantos e quais");
verdade(/Filtros: Lote 1 · Não separados\./.test(t1) && /Do #1 ao #2/.test(t1), "diz os filtros e do #1 ao #2");
verdade(/2 pedidos estão em lote FECHADO \(lote 1\): a conta da malharia desse lote NÃO muda/.test(t1), "diz que a conta da malharia do lote fechado NÃO muda");
verdade(!/ABERTO/.test(t1), "sem pedido ao vivo, não fala de lote aberto");
verdade(/APAGA o pedido e os itens/.test(t1) && /baixa um arquivo com a cópia/.test(t1) && /Desfazer a exclusão/.test(t1), "diz que apaga, que baixa a cópia e que dá para desfazer");
const t2 = X.textoDaConfirmacao(r, "nenhum filtro (todos os pedidos da aba)");
verdade(/⚠ 2 pedidos estão em lote ABERTO ou sem lote \(lote 2\): ali a quantidade a encomendar DIMINUI \(3 peça\(s\)\)/.test(t2), "avisa com destaque o que diminui no lote aberto");
verdade(/1 pedido está|2 pedidos estão/.test(t2), "concordância no plural/singular");
verdade(/G · Unico: 2 · M · Unico: 3/.test(t2), "lista as peças por tamanho");
eq(/1 pedido está em lote FECHADO/.test(X.textoDaConfirmacao(X.resumoDaExclusao([ped(1)], lotes), "x")), true, "singular: '1 pedido está'");
verdade(/ficam de fora/.test(t2), "diz o que fica de fora");
eq(X.textoDaPalavra(300, true), "São 300 pedidos e NENHUM filtro está ligado. Para confirmar, digite EXCLUIR:", "pede a palavra (sem filtro)");
eq(X.textoDaPalavra(1, false), "São 1 pedido. Para confirmar, digite EXCLUIR:", "pede a palavra (com filtro, singular)");
eq([X.palavraConfere("EXCLUIR"), X.palavraConfere(" excluir "), X.palavraConfere("Excluir"), X.palavraConfere("excluir tudo"), X.palavraConfere("SEPARAR"), X.palavraConfere(""), X.palavraConfere(null)], [true, true, true, false, false, false, false], "a palavra: só EXCLUIR (qualquer caixa); cancelar (null) nunca confere");
eq(X.mensagemDoResultado(300, 300, "a.json"), "✅ Excluídos 300 pedidos. Cópia baixada: a.json.", "mensagem de sucesso");
eq(X.mensagemDoResultado(1, 1, "a.json"), "✅ Excluídos 1 pedido. Cópia baixada: a.json.", "mensagem de sucesso no singular");
verdade(/Só 200 de 300 foram excluídos/.test(X.mensagemDoResultado(200, 300, "a.json")) && /a cópia baixada: a\.json/i.test(X.mensagemDoResultado(200, 300, "a.json")), "mensagem de falha no meio diz quantos e onde está a cópia");

console.log("== em lotes de 100 ==");
eq(X.emLotes([...Array(250).keys()]).map((l) => l.length), [100, 100, 50], "250 viram 100, 100 e 50");
eq(X.emLotes([]), [], "lista vazia não gera lote");
eq(X.emLotes([1, 2, 3], 2), [[1, 2], [3]], "tamanho de lote próprio");
eq(X.TAMANHO_DO_LOTE_DE_EXCLUSAO, 100, "o Directus recebe 100 por vez");

console.log("== a cópia que se baixa antes de apagar ==");
const completos = [
  { id: 10, grupo: 5, nome: "Maria", telefone: "(94) 9", telefone_chave: "abc", telefone_cifrado: "xyz", valor_pago: "0.00", separado: false, lote: 12, itens: [{ id: 100, pedido: 10, tamanho: "M", quantidade: 1, quantidade_retirada: 0 }], respostas: [900, 901] },
  { id: 20, grupo: 5, nome: "José", separado: false, lote: 13, itens: [{ id: 200, pedido: 20, tamanho: "G", quantidade: 2, quantidade_retirada: 0 }, { id: 201, pedido: 20, tamanho: "P", quantidade: 1, quantidade_retirada: 0 }], respostas: [] },
];
const respostas = [{ id: 900, pedido: 10, pergunta: 1, valor: "Sim" }, { id: 901, pedido: 10, pergunta: 2, valor: "Não" }];
const copia = X.montarCopia({ id: 5, nome: "Marcha para Jesus" }, completos, respostas, "2026-10-16T12:00:00.000Z");
eq([copia.versao, copia.geradoEm, copia.campanha], [1, "2026-10-16T12:00:00.000Z", { id: 5, nome: "Marcha para Jesus" }], "cabeçalho da cópia: versão, data e campanha");
eq(copia.pedidos.map((p) => p.id), [10, 20], "os pedidos com os mesmos ids");
verdade(copia.pedidos.every((p) => !("itens" in p) && !("respostas" in p)), "o pedido na cópia NÃO leva as listas aninhadas (ao recriar, apontariam para o que ainda não existe)");
eq(copia.pedidos[0].telefone_cifrado, "xyz", "todas as colunas do pedido seguem (telefone cifrado e chave incluídos)");
eq(copia.itens.map((i) => [i.id, i.pedido]), [[100, 10], [200, 20], [201, 20]], "itens achatados, cada um apontando para o seu pedido, com os mesmos ids");
eq(copia.respostas.map((r) => r.id), [900, 901], "respostas com os mesmos ids");
eq(JSON.parse(JSON.stringify(copia)), copia, "a cópia vai e volta por JSON sem perder nada");
const fonte = JSON.stringify(completos);
X.montarCopia({ id: 5, nome: "x" }, completos, respostas, "t");
eq(JSON.stringify(completos), fonte, "montar a cópia não altera os dados lidos");
eq(X.nomeDoArquivoDaCopia("Marcha para Jesus 2026!", new Date(2026, 9, 16, 9, 5, 7)), "pedidos-excluidos-marcha-para-jesus-2026-20261016-090507.json", "nome do arquivo: sem acento, com a data e a hora");
eq(X.nomeDoArquivoDaCopia("Ação & Fé — Camisetas", new Date(2026, 0, 2, 3, 4, 5)), "pedidos-excluidos-acao-fe-camisetas-20260102-030405.json", "acentos e símbolos saem");
eq(X.nomeDoArquivoDaCopia("!!!", new Date(2026, 0, 2, 3, 4, 5)), "pedidos-excluidos-campanha-20260102-030405.json", "nome só de símbolos vira 'campanha'");
verdade(X.nomeDoArquivoDaCopia("a".repeat(200), new Date(2026, 0, 2)).length < 80, "nome muito longo é cortado");

console.log("== a restauração ==");
const etapas = X.etapasDaRestauracao(copia, 2);
eq(etapas.map((e) => e.colecao), ["camiseta_pedidos", "camiseta_itens_pedido", "respostas_pedido_camiseta"], "primeiro os pedidos, depois os itens e as respostas (que apontam para o pedido)");
eq(etapas.map((e) => e.lotes.map((l) => l.length)), [[2], [2, 1], [2]], "cada etapa em lotes do tamanho pedido");
eq(X.etapasDaRestauracao(copia)[0].lotes[0].length, 2, "tamanho padrão do lote de restauração comporta o pouco que há");
let msg = "";
for (const ruim of [null, undefined, {}, { versao: 2, pedidos: [], itens: [], respostas: [] }, { versao: 1, pedidos: "x", itens: [], respostas: [] }, { versao: 1, pedidos: [], itens: null, respostas: [] }, "texto", []]) {
  try { X.etapasDaRestauracao(ruim); msg = "não recusou"; } catch (e) { msg = e.message; }
  verdade(/Arquivo de cópia desconhecido/.test(msg), `recusa cópia de formato estranho: ${JSON.stringify(ruim)}`);
}

console.log(falhas ? `\n${falhas} FALHA(S) de ${total}` : `\n${total}/${total} verificações ok`);
process.exitCode = falhas ? 1 : 0;
