// Testes de UNIDADE da exclusão em massa dos pedidos de camiseta NÃO separados (src/lib/exclusaoEmMassa.ts e exclusaoEmMassaAcao.ts): o que entra, o que NUNCA entra, o que a
// confirmação promete sobre a conta da malharia (lote fechado = números travados), a cópia que se baixa antes de apagar, a ordem da restauração e o fluxo inteiro (confirmar,
// digitar a palavra, reler, baixar a cópia, apagar em lotes, desfazer) contra um Directus de MENTIRA em memória. Sem rede.
// Como rodar (de dentro de site/):  node scripts/testes/exclusao-unidade.cjs
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

function carregar(nome, dependencias = {}) {
  const arquivo = path.join(__dirname, `../../src/lib/${nome}.ts`);
  const js = ts.transpileModule(fs.readFileSync(arquivo, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = new Module(`${nome}.js`);
  mod.require = (req) => dependencias[req] ?? require(req);
  mod._compile(js, `${nome}.js`);
  return mod.exports;
}
const X = carregar("exclusaoEmMassa");
const A = carregar("exclusaoEmMassaAcao", { "./exclusaoEmMassa": X });

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
const el = X.elegiveisParaExcluir(cenario);
eq(el.map((p) => p.id), [10, 16, 20, 30, 40], "entram só os não separados, não avulsos e sem nenhuma peça levada, do mais antigo ao mais novo");
verdade(!el.some((p) => [11, 12, 13, 14, 15].includes(p.id)), "separado, avulso, quem levou alguma peça e quem levou tudo ficam de fora");
eq(X.levouAlgumaPeca(ped(1, { itens: [item("M", 3, 0), item("G", 1, 1)] })), true, "levouAlgumaPeca: uma peça de qualquer item basta");
eq(X.levouAlgumaPeca(ped(1)), false, "levouAlgumaPeca: nenhuma");
eq(X.levouAlgumaPeca({ itens: undefined }), false, "levouAlgumaPeca: sem lista de itens não quebra");
eq(X.levouAlgumaPeca(ped(1, { itens: [{ quantidade: 1, quantidade_retirada: "1" }] })), true, "levouAlgumaPeca: número escrito como texto vale");
eq(X.elegiveisParaExcluir([]), [], "lista vazia");
eq(X.elegiveisParaExcluir([ped(2, { avulso: true })]), [], "avulso nunca entra");
eq(X.elegiveisParaExcluir([ped(2, { separado: true })]), [], "separado nunca entra");
eq(X.elegiveisParaExcluir([ped(2, { itens: [item("M", 1, 1)] })]), [], "quem levou peça nunca entra");
eq(X.elegiveisParaExcluir([ped(2, { separado: true, avulso: true, itens: [item("M", 1, 1)] })]), [], "nenhuma das três coisas, nem juntas");
const ordemOriginal = [ped(3), ped(1), ped(2)];
X.elegiveisParaExcluir(ordemOriginal);
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
const alvo = X.elegiveisParaExcluir(cenario);
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

console.log("== as escolhas da aba Excluir (lote, tamanho, modelo) ==");
const base = [
  ped(1, { lote: 12, itens: [item("M", 1)] }), ped(2, { lote: 12, itens: [item("G", 2)] }), ped(3, { lote: 13, itens: [item("M", 1, 0, "Baby look")] }),
  ped(4, { lote: null, itens: [item("P", 1), item("G", 1)] }), ped(5, { lote: 12, itens: [] }),
];
eq(X.filtrarAlvo(base, {}).map((p) => p.id), [1, 2, 3, 4, 5], "sem escolha: todos");
eq(X.filtrarAlvo(base, { loteId: "12" }).map((p) => p.id), [1, 2, 5], "lote 12");
eq(X.filtrarAlvo(base, { loteId: "13" }).map((p) => p.id), [3], "lote 13");
eq(X.filtrarAlvo(base, { loteId: "999" }).map((p) => p.id), [], "lote que não existe: ninguém");
eq(X.filtrarAlvo(base, { tamanho: "G" }).map((p) => p.id), [2, 4], "tamanho G: o pedido que tem um item G (inclusive o de dois itens)");
eq(X.filtrarAlvo(base, { modelo: "Baby look" }).map((p) => p.id), [3], "modelo Baby look");
eq(X.filtrarAlvo(base, { loteId: "12", tamanho: "G" }).map((p) => p.id), [2], "lote 12 e tamanho G");
eq(X.filtrarAlvo(base, { loteId: "", tamanho: "", modelo: "" }).length, 5, "escolhas em branco valem 'todos'");
eq(X.filtrarAlvo([ped(9, { itens: undefined })], { tamanho: "M" }), [], "pedido sem lista de itens não quebra o filtro");
eq(X.descreverEscolha("", "", "", null), "todos os pedidos que ninguém veio buscar", "descrição sem escolha");
eq(X.descreverEscolha("Lote 1 (fechado)", "M", "", 50), "Lote 1 (fechado) · tamanho M · os primeiros 50", "descrição com lote, tamanho e primeiros");
eq(X.descreverEscolha("", "", "Baby look", null), "modelo Baby look", "descrição só com o modelo");

async function fluxoCompleto() {
console.log("== o fluxo inteiro contra um Directus de mentira ==");
// um Directus em memória: pedidos com itens e respostas, cascata no DELETE, POST com id (e recusa de id repetido), falhas combinadas
function directusFalso({ pedidos, respostas = [], falharLeitura = false, falharDeleteNoLote = 0, falharPostEm = null }) {
  const guarda = new Map(pedidos.map((p) => [p.id, JSON.parse(JSON.stringify(p))]));
  const resp = respostas.map((r) => ({ ...r }));
  const itens = new Map();
  for (const p of guarda.values()) for (const i of p.itens ?? []) itens.set(i.id, { ...i, pedido: p.id });
  const log = [];
  let deletes = 0;
  const resposta = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => ({ data }) });
  const ids = (url, campo) => decodeURIComponent(url).match(new RegExp("filter\\[" + campo + "\\]\\[_in\\]=([0-9,]+)"))?.[1].split(",").map(Number) ?? [];
  const api = async (url, init = {}) => {
    const metodo = init.method ?? "GET";
    const auth = (init.headers ?? {}).Authorization;
    log.push({ metodo, url: url.replace(/^https?:\/\/[^/]+/, ""), auth });
    if (metodo === "GET" && url.includes("/items/camiseta_pedidos?")) {
      if (falharLeitura) return resposta(500);
      return resposta(200, ids(url, "id").filter((id) => guarda.has(id)).map((id) => ({ ...guarda.get(id), itens: [...itens.values()].filter((i) => i.pedido === id), respostas: resp.filter((r) => r.pedido === id).map((r) => r.id) })));
    }
    if (metodo === "GET" && url.includes("/items/respostas_pedido_camiseta?")) return falharLeitura ? resposta(500) : resposta(200, resp.filter((r) => ids(url, "pedido").includes(r.pedido)));
    if (metodo === "DELETE" && url.endsWith("/items/camiseta_pedidos")) {
      deletes++;
      if (falharDeleteNoLote && deletes === falharDeleteNoLote) return resposta(500);
      for (const id of JSON.parse(init.body)) { guarda.delete(id); for (const [k, i] of itens) if (i.pedido === id) itens.delete(k); for (let n = resp.length - 1; n >= 0; n--) if (resp[n].pedido === id) resp.splice(n, 1); }
      return resposta(204);
    }
    if (metodo === "POST") {
      const colecao = url.split("/items/")[1];
      if (falharPostEm === colecao) return resposta(500);
      const lista = JSON.parse(init.body);
      for (const x of lista) {
        if (colecao === "camiseta_pedidos") { if (guarda.has(x.id)) return resposta(400); guarda.set(x.id, { ...x, itens: undefined }); }
        else if (colecao === "camiseta_itens_pedido") { if (!guarda.has(x.pedido)) return resposta(400); itens.set(x.id, { ...x }); }
        else resp.push({ ...x });
      }
      return resposta(200, lista);
    }
    return resposta(404);
  };
  return { api, log, guarda, itens, resp, deletes: () => deletes };
}
const pedidoDoBanco = (id, extra = {}) => ({ id, grupo: 5, nome: `Pessoa ${id}`, email: `p${id}@x.org`, telefone_chave: `ch${id}`, telefone_cifrado: `ci${id}`, avulso: false, separado: false, lote: 12, valor_pago: "0.00", itens: [{ id: id * 10, tamanho: "M", modelo: "Unico", quantidade: 1, quantidade_retirada: 0 }], ...extra });
const ambiente = (d, { conf = true, palavra = "EXCLUIR", token = null } = {}) => {
  const eventos = [], avisos = [], baixados = [];
  let n = 0;
  return {
    eventos, avisos, baixados,
    amb: {
      api: async (...a) => { eventos.push(a[1]?.method ?? "GET"); return d.api(...a); },
      directusUrl: "https://dx.exemplo", token: token ?? (() => `token-${++n}`),
      confirmar: (texto) => { eventos.push("confirmar"); avisos.push(texto); return conf; },
      perguntar: (texto) => { eventos.push("perguntar"); avisos.push(texto); return palavra; },
      status: (texto) => avisos.push("STATUS: " + texto),
      baixar: (nome, conteudo) => { eventos.push("baixar"); baixados.push({ nome, conteudo }); },
      agora: () => new Date(2026, 9, 16, 9, 5, 7),
    },
  };
};
const alvoDe = (...ids) => ids.map((id) => ({ id, avulso: false, separado: false, lote: 12, itens: [item("M", 1)] }));
const lotesF = [{ id: 12, numero: 1, status: "fechado", total_vendido: 100 }, { id: 13, numero: 2, status: "aberto", total_vendido: null }];
const grupoF = { id: 5, nome: "Marcha para Jesus" };
const executar = (amb, alvo, extra = {}) => A.excluirPedidos(amb, { grupo: grupoF, alvo, lotes: lotesF, filtros: "Lote 1 (fechado)", semFiltro: false, ...extra });

{ // 1) caminho feliz
  const d = directusFalso({ pedidos: [pedidoDoBanco(1), pedidoDoBanco(2), pedidoDoBanco(3)], respostas: [{ id: 900, pedido: 1, pergunta: 1, valor: "Central" }] });
  const { amb, eventos, baixados, avisos } = ambiente(d);
  const r = await executar(amb, alvoDe(1, 2));
  eq(r.apagados, [1, 2], "feliz: apagou os 2 pedidos pedidos");
  eq([...d.guarda.keys()], [3], "feliz: no 'banco' só sobrou o #3 (os itens e a resposta do #1 foram em cascata)");
  eq([d.itens.size, d.resp.length], [1, 0], "feliz: itens e respostas dos apagados foram junto");
  eq(eventos.filter((e) => ["confirmar", "perguntar", "baixar"].includes(e)), ["confirmar", "perguntar", "baixar"], "feliz: a ordem é confirmar, digitar a palavra e SÓ ENTÃO baixar a cópia");
  verdade(eventos.indexOf("baixar") < eventos.indexOf("DELETE"), "feliz: a cópia é baixada ANTES do primeiro DELETE");
  eq(baixados.length, 1, "feliz: UMA cópia");
  eq(baixados[0].nome, "pedidos-excluidos-marcha-para-jesus-20261016-090507.json", "feliz: nome do arquivo com a data e a hora");
  const copia = JSON.parse(baixados[0].conteudo);
  eq([copia.pedidos.map((p) => p.id), copia.itens.map((i) => [i.id, i.pedido]), copia.respostas.map((x) => x.id)], [[1, 2], [[10, 1], [20, 2]], [900]], "feliz: a cópia leva pedidos, itens e respostas com os mesmos números");
  verdade(copia.pedidos.every((p) => p.telefone_cifrado && p.telefone_chave && p.email), "feliz: e todas as colunas (telefone cifrado, chave, e-mail)");
  eq(r.copia.pedidos.length, 2, "feliz: a cópia devolvida para o Desfazer é a do que foi apagado");
  verdade(avisos.some((a) => /^STATUS: ✅ Excluídos 2 pedidos\. Cópia baixada: pedidos-excluidos-marcha-para-jesus/.test(a)), "feliz: mensagem de sucesso");
  verdade(d.log.every((x) => /^Bearer token-\d+$/.test(x.auth)), "feliz: toda chamada leva o token de AGORA (a sessão se renova)", d.log.map((x) => x.auth));
  verdade(new Set(d.log.map((x) => x.auth)).size === d.log.length, "feliz: e cada chamada pediu o token de novo (não guarda um velho)");
  verdade(/EXCLUIR 2 pedidos/.test(avisos[0]) && /Filtros: Lote 1 \(fechado\)\./.test(avisos[0]) && /EXCLUIR:/.test(avisos[1]), "feliz: os dois avisos mostrados à pessoa");
  // 8) desfazer
  const a2 = ambiente(d);
  const v = await A.desfazerExclusao(a2.amb, r.copia);
  eq(v, { ok: true, pedidosVoltaram: 2 }, "desfazer: voltaram 2 pedidos");
  eq([...d.guarda.keys()].sort((a, b) => a - b), [1, 2, 3], "desfazer: os mesmos números de volta");
  eq([d.itens.size, d.resp.length, [...d.itens.keys()].sort((a, b) => a - b)], [3, 1, [10, 20, 30]], "desfazer: itens e resposta de volta, com os mesmos números");
  const ordem = d.log.filter((x) => x.metodo === "POST").map((x) => x.url);
  eq(ordem, ["/items/camiseta_pedidos", "/items/camiseta_itens_pedido", "/items/respostas_pedido_camiseta"], "desfazer: primeiro os pedidos, depois itens e respostas");
  const de2 = ambiente(d, { conf: false });
  eq(await A.desfazerExclusao(de2.amb, r.copia), { ok: false, pedidosVoltaram: 0 }, "desfazer: se a pessoa não confirma, nada é feito");
  eq(de2.eventos.filter((e) => e === "POST").length, 0, "desfazer sem confirmar: nenhuma gravação");
  // 8b) limite de pedidos (16/10/2026): se os pedidos voltando não cabem no limite do lote aberto, nada é restaurado
  const aCheio = ambiente(directusFalso({ pedidos: [pedidoDoBanco(3)] }));
  aCheio.amb.conferirEspaco = async () => "Não dá para desfazer agora: o lote já está no limite de 140 peças.";
  eq(await A.desfazerExclusao(aCheio.amb, r.copia), { ok: false, pedidosVoltaram: 0 }, "desfazer com o limite cheio: não restaura");
  eq(aCheio.eventos.filter((e) => e === "POST" || e === "confirmar").length, 0, "desfazer com o limite cheio: nem pergunta nem grava");
  verdade(aCheio.avisos.some((x) => /limite de 140/.test(x)), "desfazer com o limite cheio: diz o motivo");
  const dCabe = directusFalso({ pedidos: [pedidoDoBanco(3)] });
  const aCabe = ambiente(dCabe);
  aCabe.amb.conferirEspaco = async () => null;
  eq((await A.desfazerExclusao(aCabe.amb, r.copia)).pedidosVoltaram, 2, "desfazer com espaço no limite: restaura normalmente");
  const aSemConferir = ambiente(directusFalso({ pedidos: [pedidoDoBanco(3)] }));
  aSemConferir.amb.conferirEspaco = async () => { throw new Error("rede"); };
  eq(await A.desfazerExclusao(aSemConferir.amb, r.copia), { ok: false, pedidosVoltaram: 0 }, "desfazer sem conseguir conferir o limite: NÃO restaura");
  verdade(aSemConferir.avisos.some((x) => /NADA foi restaurado/.test(x)) && aSemConferir.eventos.filter((e) => e === "POST").length === 0, "...e avisa que nada foi restaurado");
}
{ // 2) cancelar no primeiro aviso, palavra errada ou cancelada no segundo
  const d = directusFalso({ pedidos: [pedidoDoBanco(1)] });
  let e = ambiente(d, { conf: false });
  eq(await executar(e.amb, alvoDe(1)), null, "cancelar o aviso: devolve null");
  eq(e.eventos, ["confirmar"], "cancelar o aviso: só perguntou; nenhuma chamada ao Directus");
  for (const palavra of ["separar", "", "excluir tudo", null]) {
    e = ambiente(d, { palavra });
    eq(await executar(e.amb, alvoDe(1)), null, `palavra ${JSON.stringify(palavra)}: devolve null`);
    verdade(!e.eventos.some((x) => ["GET", "DELETE", "baixar"].includes(x)) && e.avisos.some((a) => /Cancelado: nada foi apagado/.test(a)), `palavra ${JSON.stringify(palavra)}: nada lido, nada baixado, nada apagado`);
  }
  eq([...d.guarda.keys()], [1], "o pedido continua no 'banco'");
  e = ambiente(d);
  eq(await executar(e.amb, []), null, "lista vazia: nem pergunta");
  eq(e.eventos, [], "lista vazia: nenhum evento");
  e = ambiente(d, { palavra: "excluir" });
  verdade((await executar(e.amb, alvoDe(1), { semFiltro: true })) !== null && /NENHUM filtro está ligado/.test(e.avisos[1]), "sem filtro nenhum a pergunta da palavra avisa; e a palavra vale em minúscula");
}
{ // 3) alguém mudou algo no meio
  for (const [rotulo, mexe] of [["separou um", (d) => { d.guarda.get(2).separado = true; }], ["deu retirada em um", (d) => { d.itens.get(10).quantidade_retirada = 1; }], ["apagou um", (d) => { d.guarda.delete(1); }], ["virou avulso", (d) => { d.guarda.get(2).avulso = true; }]]) {
    const d = directusFalso({ pedidos: [pedidoDoBanco(1), pedidoDoBanco(2)] });
    mexe(d);
    const e = ambiente(d);
    eq(await executar(e.amb, alvoDe(1, 2)), null, `alguém ${rotulo}: devolve null`);
    verdade(!e.eventos.includes("baixar") && d.deletes() === 0 && e.avisos.some((a) => /Alguém mudou esses pedidos.*NADA foi apagado/.test(a)), `alguém ${rotulo}: não baixa, não apaga e avisa`);
  }
}
{ // 4) a leitura falha
  const d = directusFalso({ pedidos: [pedidoDoBanco(1)], falharLeitura: true });
  const e = ambiente(d);
  eq(await executar(e.amb, alvoDe(1)), null, "leitura falhou: devolve null");
  verdade(!e.eventos.includes("baixar") && d.deletes() === 0 && e.avisos.some((a) => /Não consegui ler os pedidos agora: NADA foi apagado/.test(a)), "leitura falhou: não baixa, não apaga e avisa");
}
{ // 5) 250 pedidos = lotes de 100; o segundo lote falha
  const grandes = Array.from({ length: 250 }, (_, i) => pedidoDoBanco(i + 1));
  const d = directusFalso({ pedidos: grandes, falharDeleteNoLote: 2 });
  const e = ambiente(d);
  const r = await executar(e.amb, alvoDe(...grandes.map((p) => p.id)));
  eq(r.apagados.length, 100, "250 pedidos, o 2º lote falha: só os 100 primeiros foram apagados");
  eq(d.guarda.size, 150, "no 'banco' sobraram 150");
  eq(e.baixados.length, 1, "e a cópia baixada ANTES é uma só (de todos os 250)");
  eq(JSON.parse(e.baixados[0].conteudo).pedidos.length, 250, "a cópia baixada leva os 250");
  eq(r.copia.pedidos.length, 100, "a cópia para o Desfazer leva só os 100 apagados");
  eq([r.copia.itens.length, r.copia.pedidos[0].id, r.copia.pedidos[99].id], [100, 1, 100], "e os itens dos 100, do #1 ao #100");
  verdade(e.avisos.some((a) => /Só 100 de 250 foram excluídos.*a cópia baixada: pedidos-excluidos/i.test(a)), "a mensagem diz quantos foram e onde está a cópia");
  eq(d.log.filter((x) => x.metodo === "GET" && x.url.includes("camiseta_pedidos?")).length, 3, "a leitura também é em lotes de 100 (3 chamadas)");
  const d2 = directusFalso({ pedidos: Array.from({ length: 250 }, (_, i) => pedidoDoBanco(i + 1)) });
  const ok = await executar(ambiente(d2).amb, alvoDe(...Array.from({ length: 250 }, (_, i) => i + 1)));
  eq([ok.apagados.length, d2.guarda.size, d2.deletes()], [250, 0, 3], "250 sem falha: 3 lotes de DELETE (100, 100, 50) e nada sobra");
}
{ // 6) desfazer com falha no meio
  const d = directusFalso({ pedidos: [pedidoDoBanco(1), pedidoDoBanco(2)], respostas: [{ id: 900, pedido: 1, pergunta: 1, valor: "x" }] });
  const e1 = ambiente(d);
  const r = await executar(e1.amb, alvoDe(1, 2));
  const falha = directusFalso({ pedidos: [], falharPostEm: "camiseta_itens_pedido" });
  const e2 = ambiente(falha);
  const v = await A.desfazerExclusao(e2.amb, r.copia);
  eq(v.ok, false, "desfazer com falha nos itens: devolve ok:false");
  eq(v.pedidosVoltaram, 2, "…mas conta os pedidos que já voltaram");
  verdade(e2.avisos.some((a) => /NÃO tente de novo por aqui.*duplicar.*arquivo de cópia/.test(a)), "…e manda usar o arquivo de cópia em vez de tentar de novo (duplicaria)");
  const falhaPedidos = directusFalso({ pedidos: [], falharPostEm: "camiseta_pedidos" });
  const e3 = ambiente(falhaPedidos);
  eq((await A.desfazerExclusao(e3.amb, r.copia)).pedidosVoltaram, 0, "falha já nos pedidos: nenhum voltou");
  const e4 = ambiente(directusFalso({ pedidos: [] }));
  let erro = ""; try { const x = await A.desfazerExclusao(e4.amb, { versao: 9 }); erro = JSON.stringify(x); } catch (e) { erro = e.message; }
  verdade(/desconhecido|ok":false/.test(erro), "cópia de formato estranho no Desfazer: não restaura");
}
}
fluxoCompleto().then(() => {
  console.log(falhas ? `\n${falhas} FALHA(S) de ${total}` : `\n${total}/${total} verificações ok`);
  process.exitCode = falhas ? 1 : 0;
});
