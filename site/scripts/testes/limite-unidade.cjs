// Testes de UNIDADE do limite de pedidos do lote (api/src/lib/limiteLote.js): a regra, a leitura dos números, a fila, e — o que mais importa — o laço da senha contra um Directus de
// MENTIRA em memória, com centenas de pedidos ao mesmo tempo e várias "instâncias": a soma das peças nunca passa do limite e, havendo demanda, o lote enche exatamente.
// Sem rede. Como rodar (de dentro de site/):  node scripts/testes/limite-unidade.cjs
const L = require("../../api/src/lib/limiteLote.js");

let falhas = 0;
let total = 0;
const eq = (a, b, d) => {
  total++;
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { falhas++; console.log("  FALHA", d, "→", JSON.stringify(a), "esperado", JSON.stringify(b)); } else console.log("  ok   ", d);
};
const verdade = (c, d) => eq(!!c, true, d);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// A regra do PAINEL (src/lib/limitePedidos.ts) tem de dar o mesmo resultado que a da API (api/src/lib/limiteLote.js): este teste roda as duas lado a lado.
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
function carregarTs(nome) {
  const arquivo = path.join(__dirname, `../../src/lib/${nome}.ts`);
  const js = ts.transpileModule(fs.readFileSync(arquivo, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = new Module(`${nome}.js`);
  mod.require = (req) => require(req);
  mod._compile(js, `${nome}.js`);
  return mod.exports;
}
const T = carregarTs("limitePedidos");

console.log("== ler os limites da campanha ==");
eq(L.limitesDoGrupo({ limite_total: 140, limites_tamanho: { M: 40, G: "30" } }), { total: 140, porTamanho: { M: 40, G: 30 } }, "total e por tamanho (texto numérico vale)");
eq(L.limitesDoGrupo({}), { total: null, porTamanho: {} }, "sem nada = sem limite");
eq(L.limitesDoGrupo({ limite_total: null, limites_tamanho: null }), { total: null, porTamanho: {} }, "vazios do Directus = sem limite");
eq(L.limitesDoGrupo({ limite_total: "", limites_tamanho: "" }), { total: null, porTamanho: {} }, "texto vazio = sem limite");
eq(L.limitesDoGrupo({ limite_total: 0 }), { total: 0, porTamanho: {} }, "zero é limite zero (nada disponível), não 'sem limite'");
eq(L.limitesDoGrupo({ limite_total: -5, limites_tamanho: { M: -1, G: "abc", P: 2.5, GG: 10 } }), { total: null, porTamanho: { GG: 10 } }, "negativo, texto e quebrado são ignorados");
eq(L.limitesDoGrupo({ limites_tamanho: '{"M":7}' }), { total: null, porTamanho: { M: 7 } }, "JSON que chega como texto é lido");
eq(L.limitesDoGrupo({ limites_tamanho: "{lixo" }), { total: null, porTamanho: {} }, "JSON quebrado = sem limite por tamanho");
eq(L.limitesDoGrupo({ limites_tamanho: [1, 2] }), { total: null, porTamanho: {} }, "lista no lugar do objeto = ignorada");
verdade(!L.temLimite(L.limitesDoGrupo({})) && L.temLimite({ total: 0, porTamanho: {} }) && L.temLimite({ total: null, porTamanho: { M: 1 } }), "temLimite");

console.log("== os itens do pedido ==");
const n1 = L.normalizarItens([{ tamanho: " M ", modelo: "Unico", quantidade: 2 }, { tamanho: "G", quantidade: "1" }, { tamanho: "P", quantidade: 0 }]);
eq([n1.ok, n1.total, n1.porTamanho, n1.itens.length], [true, 3, { M: 2, G: 1 }, 2], "soma, por tamanho, tamanho aparado, linha com 0 descartada, texto numérico");
eq(L.normalizarItens([{ tamanho: "M", quantidade: -3 }, { tamanho: "M", quantidade: 5 }]).ok, false, "quantidade NEGATIVA recusada (abriria vaga para os outros)");
eq(L.normalizarItens([{ tamanho: "M", quantidade: 1.5 }]).ok, false, "quantidade quebrada recusada");
eq(L.normalizarItens([{ tamanho: "M", quantidade: "abc" }]).ok, false, "quantidade texto recusada");
eq(L.normalizarItens([{ tamanho: "M", quantidade: 100 }]).ok, false, "mais de 99 numa linha recusada");
eq(L.normalizarItens([{ tamanho: "M", quantidade: 99 }]).ok, true, "99 numa linha vale");
eq(L.normalizarItens([{ tamanho: "M", quantidade: 0 }]), { ok: false, erro: "Parâmetros ausentes." }, "só linhas com 0 = pedido vazio");
eq(L.normalizarItens("x"), { ok: false, erro: "Parâmetros ausentes." }, "itens que não é lista");
eq(L.normalizarItens([null, 3, { quantidade: 1 }]).total, 1, "lixo no meio da lista é ignorado (conta como 0)");
eq(L.normalizarItens([{ tamanho: "XXL", quantidade: 1 }], { tamanhosDaCampanha: ["P", "M"], exigirTamanhoDaLista: true }).ok, false, "com limite ligado, tamanho inventado é recusado");
eq(L.normalizarItens([{ tamanho: "XXL", quantidade: 1 }], { tamanhosDaCampanha: ["P", "M"], exigirTamanhoDaLista: false }).ok, true, "sem limite ligado o comportamento antigo continua (tamanho livre)");
eq(L.normalizarItens([{ quantidade: 1 }], { tamanhosDaCampanha: ["P"], exigirTamanhoDaLista: true }).ok, false, "com limite ligado, item sem tamanho é recusado quando a campanha tem tamanhos");
eq(L.normalizarItens(Array.from({ length: 30 }, () => ({ tamanho: "M", quantidade: 1 }))).total, 20, "no máximo 20 linhas");

console.log("== avaliar o limite ==");
const lim = { total: 10, porTamanho: { M: 4 } };
const uso = (total, porTamanho = {}) => ({ total, porTamanho });
const ped = (porTamanho) => ({ total: Object.values(porTamanho).reduce((a, b) => a + b, 0), porTamanho });
eq(L.avaliar(lim, uso(0), ped({ M: 4 })).ok, true, "cabe exatamente no tamanho");
eq(L.avaliar(lim, uso(0), ped({ M: 5 })).motivo, "tamanho_quantidade", "passa do tamanho: restam 4");
eq(L.avaliar(lim, uso(4, { M: 4 }), ped({ M: 1 })).motivo, "tamanho_esgotado", "tamanho esgotado");
eq(L.avaliar(lim, uso(4, { M: 4 }), ped({ M: 1 })).mensagem, "O tamanho M esgotou. Escolha outro tamanho.", "mensagem do tamanho esgotado");
eq(L.avaliar(lim, uso(4, { M: 3 }), ped({ M: 2 })).mensagem, "Do tamanho M restam apenas 1 peça. Diminua a quantidade.", "mensagem de quantidade (singular)");
eq(L.avaliar(lim, uso(4, { G: 4 }), ped({ M: 1, G: 1 })).ok, true, "tamanho sem limite próprio só conta no total");
eq(L.avaliar(lim, uso(10), ped({ G: 1 })).motivo, "esgotado", "total esgotado (mesmo num tamanho sem limite)");
eq(L.avaliar(lim, uso(10), ped({ G: 1 })).mensagem, "Os pedidos esgotaram: não há mais peças disponíveis nesta campanha.", "mensagem de esgotado");
eq(L.avaliar(lim, uso(8), ped({ G: 3 })).mensagem, "Restam apenas 2 peças. Diminua a quantidade do pedido.", "mensagem de quantidade total");
eq(L.avaliar(lim, uso(12), ped({ G: 1 })).restam, 0, "passou do limite por fora (edição manual): restam 0, nunca negativo");
eq(L.avaliar({ total: null, porTamanho: {} }, uso(999), ped({ M: 50 })).ok, true, "sem limite nunca recusa");
eq(L.avaliar({ total: 0, porTamanho: {} }, uso(0), ped({ M: 1 })).motivo, "esgotado", "limite zero recusa tudo");
eq(L.avaliar({ total: null, porTamanho: { M: 2 } }, uso(0), { total: 1, porTamanho: { "": 1 } }).ok, true, "item sem tamanho não é barrado por limite de tamanho");

console.log("== o que a página pública vê ==");
eq(L.disponibilidade({ total: 10, porTamanho: { M: 4, G: 2 } }, uso(5, { M: 4, G: 1 }), ["P", "M", "G"]), { esgotado: false, tamanhosEsgotados: ["M"] }, "só o M esgotou");
eq(L.disponibilidade({ total: 10, porTamanho: {} }, uso(10), ["P"]).esgotado, true, "total esgotado");
eq(L.disponibilidade({ total: null, porTamanho: { P: 1, M: 1 } }, uso(2, { P: 1, M: 1 }), ["P", "M"]).esgotado, true, "todos os tamanhos da campanha esgotados = esgotado");
eq(L.disponibilidade({ total: null, porTamanho: { P: 1, M: 1 } }, uso(2, { P: 1, M: 1 }), ["P", "M", "G"]).esgotado, false, "sobra um tamanho sem limite: não está esgotado");
eq(L.disponibilidade({ total: null, porTamanho: { M: 0 } }, uso(0), ["M"]).esgotado, true, "limite 0 no único tamanho");

console.log("== ler a soma que o Directus devolve ==");
eq(L.usoDoAgregado([{ tamanho: "G", sum: { quantidade: "153" } }, { tamanho: "M", sum: { quantidade: "224" } }, { tamanho: null, sum: { quantidade: "2" } }]), { total: 379, porTamanho: { G: 153, M: 224, "": 2 } }, "soma em texto, tamanho nulo");
eq(L.usoDoAgregado([]), { total: 0, porTamanho: {} }, "lote vazio");
eq(L.usoDoAgregado(null), { total: 0, porTamanho: {} }, "resposta sem dados");

console.log("== a regra do painel (TypeScript) é a mesma da API (JavaScript) ==");
{
  const grupos = [{}, { limite_total: 140, limites_tamanho: { M: 40, G: "30" } }, { limite_total: "", limites_tamanho: "" }, { limite_total: 0 }, { limite_total: -5, limites_tamanho: { M: -1, G: "abc", P: 2.5, GG: 10 } }, { limites_tamanho: '{"M":7}' }, { limites_tamanho: "{lixo" }, { limites_tamanho: [1, 2] }, null, undefined];
  for (const g of grupos) eq(T.limitesDoGrupo(g), L.limitesDoGrupo(g), `limitesDoGrupo igual para ${JSON.stringify(g)}`);
  const agregados = [[{ tamanho: "G", sum: { quantidade: "153" } }, { tamanho: null, sum: { quantidade: "2" } }], [], null, [{ tamanho: "M" }, null]];
  for (const a of agregados) eq(T.usoDoAgregado(a), L.usoDoAgregado(a), `usoDoAgregado igual para ${JSON.stringify(a)}`);
  const todosLimites = [{ total: null, porTamanho: {} }, { total: 5, porTamanho: {} }, { total: 5, porTamanho: { M: 2 } }, { total: null, porTamanho: { M: 2, G: 0 } }, { total: 0, porTamanho: {} }];
  const todosUsos = [{ total: 0, porTamanho: {} }, { total: 2, porTamanho: { M: 2 } }, { total: 5, porTamanho: { M: 1, G: 4 } }, { total: 7, porTamanho: { M: 3, G: 4 } }, { total: 4, porTamanho: { G: 4 } }];
  const todosPedidos = [{ M: 1 }, { M: 3 }, { G: 1 }, { M: 1, G: 1 }, { "": 2 }, { P: 6 }];
  let divergentes = 0;
  let combinacoes = 0;
  for (const limites of todosLimites) for (const uso of todosUsos) for (const porTamanho of todosPedidos) {
    const pedido = { total: Object.values(porTamanho).reduce((a, b) => a + b, 0), porTamanho };
    const a = L.avaliar(limites, uso, pedido);
    const b = T.avaliar(limites, uso, pedido);
    combinacoes++;
    if (a.ok !== b.ok || a.motivo !== b.motivo || a.restam !== b.restam || a.tamanho !== b.tamanho) { divergentes++; console.log("  divergiu:", JSON.stringify({ limites, uso, pedido, a, b })); }
  }
  eq(divergentes, 0, `avaliar: as duas regras concordam em ${combinacoes} combinações (limite × uso × pedido): mesmo ok, motivo, restam e tamanho`);
  eq(T.pedidoDosItens([{ tamanho: "M", quantidade: 2 }, { tamanho: "M", quantidade: "1" }, { tamanho: null, quantidade: 1 }, { tamanho: "G" }]), { total: 4, porTamanho: { M: 3, "": 1, G: 0 } }, "pedidoDosItens soma por tamanho (texto numérico vale, sem quantidade = 0)");
  eq(T.resumoDoUso({ total: 140, porTamanho: { M: 40 } }, { total: 87, porTamanho: { M: 30 } }, [3]), "Lote 3 (aberto): 87 de 140 peças pedidas (restam 53) · M: 30 de 40.", "resumoDoUso: a linha que o gestor lê");
  eq(T.resumoDoUso({ total: 10, porTamanho: {} }, { total: 12, porTamanho: {} }, [3]), "Lote 3 (aberto): ⚠ 12 peças pedidas, 2 a mais que o limite de 10.", "resumoDoUso: avisa quando passou do limite por fora");
  eq(T.resumoDoUso({ total: 10, porTamanho: {} }, { total: 0, porTamanho: {} }, []), "Nenhum lote aberto agora (o próximo pedido abre um lote novo, do zero): 0 de 10 peças pedidas (restam 10).", "resumoDoUso: sem lote aberto");
  eq(T.resumoDoUso({ total: null, porTamanho: {} }, { total: 3, porTamanho: {} }, [2]), "", "resumoDoUso: sem limite não mostra nada");
}

console.log("== a fila (um de cada vez, com teto de espera) ==");
async function filas() {
  const ordem = [];
  let simultaneas = 0, maxSimultaneas = 0;
  const tarefa = (id) => async () => { simultaneas++; maxSimultaneas = Math.max(maxSimultaneas, simultaneas); await dormir(3); ordem.push(id); simultaneas--; return id; };
  const resultados = await Promise.all([1, 2, 3, 4, 5].map((i) => L.enfileirar("t1", tarefa(i))));
  eq(ordem, [1, 2, 3, 4, 5], "executa na ordem de chegada");
  eq(maxSimultaneas, 1, "nunca duas ao mesmo tempo");
  eq(resultados.map((r) => r.valor), [1, 2, 3, 4, 5], "devolve o valor de cada tarefa");
  const paralelo = await Promise.all([L.enfileirar("a", tarefa("a")), L.enfileirar("b", tarefa("b"))]);
  eq(paralelo.map((r) => r.valor), ["a", "b"], "chaves diferentes não esperam uma pela outra");

  const cheia = await Promise.all(Array.from({ length: 6 }, (_, i) => L.enfileirar("t2", tarefa(i), { maxNaFila: 3 })));
  eq(cheia.map((r) => !!r.lotado), [false, false, false, true, true, true], "fila cheia recusa na hora quem passa do teto");
  eq(cheia.filter((r) => r.lotado).map((r) => r.motivo), ["fila", "fila", "fila"], "motivo: fila");

  let relogio = 1000;
  let rodouTerceira = false;
  const lenta = async () => { relogio += 15000; return "lenta"; };
  const media = async () => { relogio += 10000; return "media"; };
  const terceira = async () => { rodouTerceira = true; return "terceira"; };
  const [r1, r2, r3] = await Promise.all([
    L.enfileirar("t3", lenta, { esperaMaxMs: 20000, agora: () => relogio }),
    L.enfileirar("t3", media, { esperaMaxMs: 20000, agora: () => relogio }),
    L.enfileirar("t3", terceira, { esperaMaxMs: 20000, agora: () => relogio }),
  ]);
  eq([r1.valor, r2.valor, !!r3.lotado, r3.motivo, rodouTerceira], ["lenta", "media", true, "espera", false], "quem esperou mais que o teto (25 s) é dispensado SEM rodar a tarefa");

  const previstas = await Promise.all(Array.from({ length: 6 }, (_, i) => L.enfileirar("t5", async () => i, { duracaoInicialMs: 5000, esperaMaxMs: 20000 })));
  eq(previstas.map((r) => r.motivo || "entrou"), ["entrou", "entrou", "entrou", "entrou", "entrou", "previsao"], "a espera prevista (pedidos na frente × tempo médio) passa do teto: recusa na hora, antes de esperar à toa");

  let rodou = false;
  const [e1, e2] = await Promise.all([
    L.enfileirar("t4", async () => { throw new Error("falhou"); }).then((r) => r, (e) => ({ erro: e.message })),
    L.enfileirar("t4", async () => { rodou = true; return "seguiu"; }),
  ]);
  eq([e1.erro, e2.valor, rodou], ["falhou", "seguiu", true], "erro de uma tarefa não trava a fila");
}

// ----- o Directus de mentira: o mesmo contrato que a API usa -----
// Cada operação demora um tempo aleatório (para os pedidos se entrelaçarem de verdade). A gravação do pedido é atômica: ou grava pedido + itens + senha, ou nada, e a chave única recusa
// quem chegou depois — como o PostgreSQL faz com a transação do Directus.
function novoDirectus({ atraso = 4, falhaGravacao = false } = {}) {
  const banco = { pedidos: [], chaves: new Set(), controle: [], lotesFechados: new Set(), chamadas: { ultima: 0, soma: 0, gravacao: 0, conflitos: 0 }, proximoId: 1 };
  const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
  async function directus(caminho, init = {}) {
    await dormir(Math.floor(Math.random() * atraso));
    const metodo = init.method || "GET";
    const url = new URL("http://x" + caminho);
    const grupo = Number((/grupo\]\[_eq\]=(\d+)/.exec(caminho) || [])[1]);
    if (url.pathname === "/items/camiseta_controle" && metodo === "GET") {
      banco.chamadas.ultima += 1;
      const linhas = banco.controle.filter((c) => c.grupo === grupo).sort((a, b) => b.n - a.n).slice(0, 1).map((c) => ({ n: c.n }));
      return json(200, { data: linhas });
    }
    if (url.pathname === "/items/camiseta_itens_pedido" && metodo === "GET") {
      banco.chamadas.soma += 1;
      const soma = new Map();
      for (const p of banco.pedidos.filter((x) => x.grupo === grupo && !banco.lotesFechados.has(x.lote))) for (const i of p.itens) soma.set(i.tamanho, (soma.get(i.tamanho) || 0) + i.quantidade);
      return json(200, { data: [...soma].map(([tamanho, q]) => ({ tamanho, sum: { quantidade: String(q) } })) });
    }
    if (url.pathname === "/items/camiseta_pedidos" && metodo === "POST") {
      banco.chamadas.gravacao += 1;
      if (falhaGravacao) return json(500, { errors: [{ message: "boom" }] });
      const corpo = JSON.parse(init.body);
      for (const c of corpo.controle || []) {
        if (banco.chaves.has(c.chave)) { banco.chamadas.conflitos += 1; return json(400, { errors: [{ message: "unique", extensions: { code: "RECORD_NOT_UNIQUE" } }] }); }
      }
      const id = banco.proximoId++;
      for (const c of corpo.controle || []) { banco.chaves.add(c.chave); banco.controle.push({ grupo: c.grupo, n: c.n, pedido: id }); }
      banco.pedidos.push({ id, grupo: corpo.grupo, lote: corpo.lote, itens: corpo.itens });
      return json(200, { data: { id } });
    }
    return json(404, { errors: [{ message: "rota não prevista no teste: " + caminho }] });
  }
  return { directus, banco };
}

const pecasDoLote = (banco, grupo) => {
  const r = { total: 0, porTamanho: {} };
  for (const p of banco.pedidos.filter((x) => x.grupo === grupo && !banco.lotesFechados.has(x.lote))) for (const i of p.itens) { r.total += i.quantidade; r.porTamanho[i.tamanho] = (r.porTamanho[i.tamanho] || 0) + i.quantidade; }
  return r;
};
const pedidoDe = (porTamanho) => {
  const itens = Object.entries(porTamanho).map(([tamanho, quantidade]) => ({ tamanho, modelo: "Unico", quantidade }));
  return { pedido: { total: itens.reduce((a, i) => a + i.quantidade, 0), porTamanho }, corpoPedido: { grupo: 1, lote: 7, nome: "t", itens } };
};
// Nos testes de exatidão a fila é folgada (o que se quer provar é o limite, não a recusa por excesso de gente); a recusa por excesso tem o seu próprio teste.
const FILA_FOLGADA = { maxNaFila: 100000, esperaMaxMs: 600000 };
const criar = (modulo, fake, porTamanho, limites, loteId = 7, opcoesFila = FILA_FOLGADA, grupoId = 1) => {
  const { pedido, corpoPedido } = pedidoDe(porTamanho);
  return modulo.criarPedidoComLimite({ directus: fake.directus, grupoId, limites, pedido, corpoPedido: { ...corpoPedido, grupo: grupoId, lote: loteId }, log: () => {}, opcoesFila }).catch((e) => ({ erro: e.message }));
};

// Cada instância do Azure Functions tem a SUA fila e a SUA memória: o módulo é recarregado para simular uma instância nova, todas no MESMO banco.
function novaInstancia() {
  delete require.cache[require.resolve("../../api/src/lib/limiteLote.js")];
  return require("../../api/src/lib/limiteLote.js");
}

async function rajada(instancias, pedidos, limites, geradorDePedido, { atraso = 6 } = {}) {
  const fake = novoDirectus({ atraso });
  const modulos = Array.from({ length: instancias }, () => novaInstancia());
  const resultados = await Promise.all(Array.from({ length: pedidos }, (_, i) => criar(modulos[i % instancias], fake, geradorDePedido(i), limites)));
  return { fake, resultados };
}

async function umaInstancia() {
  console.log("== uma instância, 200 pedidos de 1 peça ao mesmo tempo, limite 140 ==");
  const { fake, resultados } = await rajada(1, 200, { total: 140, porTamanho: {} }, () => ({ M: 1 }));
  eq(resultados.filter((x) => x.pedidoId).length, 140, "exatamente 140 entram");
  eq(resultados.filter((x) => x.erroHttp && x.erroHttp.status === 409).length, 60, "os outros 60 recebem 409 (esgotado)");
  eq(pecasDoLote(fake.banco, 1).total, 140, "no banco: 140 peças, nem uma a mais");
  eq(fake.banco.chamadas.conflitos, 0, "com a fila, nenhuma disputa de senha");
  eq(fake.banco.controle.map((c) => c.n).sort((a, b) => a - b), Array.from({ length: 140 }, (_, i) => i + 1), "as senhas são 1..140, sem buraco e sem repetição");
  eq(fake.banco.chamadas.gravacao, 140, "só 140 gravações no Directus: o resto foi recusado antes de gravar");
}

async function excessoDeGente() {
  console.log("== gente demais de uma vez: recusa na hora, sem estourar o limite e sem segurar a conexão ==");
  const modulo = novaInstancia();
  const fake = novoDirectus({ atraso: 40 });
  const limites = { total: 140, porTamanho: {} };
  const opcoes = { esperaMaxMs: 500, duracaoInicialMs: 100 };
  const inicio = Date.now();
  const r = await Promise.all(Array.from({ length: 120 }, () => criar(modulo, fake, { M: 1 }, limites, 7, opcoes)));
  const aceitos = r.filter((x) => x.pedidoId).length;
  const ocupados = r.filter((x) => x.erroHttp && x.erroHttp.status === 503 && x.erroHttp.body.motivo === "ocupado").length;
  verdade(ocupados > 0 && aceitos > 0, `parte entra (${aceitos}) e parte recebe "tente de novo" (${ocupados})`);
  eq(aceitos + ocupados, 120, "todo pedido tem resposta: aceito ou 503, nenhum erro estranho");
  eq(pecasDoLote(fake.banco, 1).total, aceitos, "pedidos aceitos = peças gravadas");
  verdade(Date.now() - inicio < 5000, "e as recusas foram imediatas (não ficaram esperando a fila inteira)");
}

async function disputa() {
  console.log("== várias instâncias disputando as mesmas vagas (só a chave única do banco segura) ==");
  const limites = { total: 140, porTamanho: {} };
  for (const instancias of [2, 4, 8]) {
    const { fake, resultados } = await rajada(instancias, 200, limites, () => ({ M: 1 }));
    const aceitos = resultados.filter((x) => x.pedidoId).length;
    const soma = pecasDoLote(fake.banco, 1).total;
    eq(soma <= 140, true, `${instancias} instâncias: o banco NUNCA passa de 140 (tem ${soma})`);
    eq(aceitos, soma, `${instancias} instâncias: pedidos aceitos = peças gravadas (${aceitos}) — nenhum aceito sem gravar, nenhum gravado sem resposta`);
    eq(soma, 140, `${instancias} instâncias: havendo demanda, o lote enche exatamente em 140 (${fake.banco.chamadas.conflitos} recusas do banco na disputa)`);
    eq(new Set(fake.banco.controle.map((c) => c.n)).size, fake.banco.controle.length, `${instancias} instâncias: nenhuma senha repetida`);
    eq(resultados.filter((x) => x.erro || (x.erroHttp && ![409, 503].includes(x.erroHttp.status))).length, 0, `${instancias} instâncias: só aceito, esgotado ou "tente de novo", nenhum erro estranho`);
  }
}

async function tamanhos() {
  console.log("== pedidos de 1 a 6 peças com limite total e limites por tamanho ==");
  const limites = { total: 140, porTamanho: { M: 50, G: 30, P: 20 } };
  const nomes = ["P", "M", "G", "GG"];
  const gerador = (i) => {
    const o = {};
    const linhas = 1 + (i % 3);
    for (let k = 0; k < linhas; k++) { const t = nomes[(i * 7 + k * 3) % 4]; o[t] = (o[t] || 0) + 1 + ((i + k) % 2); }
    return o;
  };
  const { fake, resultados } = await rajada(4, 260, limites, gerador, { atraso: 5 });
  const uso = pecasDoLote(fake.banco, 1);
  eq(uso.total <= 140 && (uso.porTamanho.M || 0) <= 50 && (uso.porTamanho.G || 0) <= 30 && (uso.porTamanho.P || 0) <= 20, true, `todos os limites juntos respeitados: total ${uso.total}/140, M ${uso.porTamanho.M || 0}/50, G ${uso.porTamanho.G || 0}/30, P ${uso.porTamanho.P || 0}/20`);
  eq(resultados.filter((x) => x.pedidoId).length, fake.banco.pedidos.length, "pedidos aceitos = pedidos gravados");
  const recusas = resultados.filter((x) => x.erroHttp && x.erroHttp.status === 409).map((x) => x.erroHttp.body);
  const esgotados = new Set(recusas.filter((b) => b.motivo === "tamanho_esgotado").map((b) => b.tamanho));
  verdade(recusas.length > 0, `houve recusas (${recusas.length}), como esperado com 260 pedidos para 140 peças`);
  verdade([...esgotados].every((t) => (uso.porTamanho[t] || 0) === limites.porTamanho[t]), `todo tamanho recusado como "esgotado" está de fato cheio no banco (${[...esgotados].sort().join(", ") || "nenhum"})`);
  verdade(!recusas.some((b) => b.motivo === "esgotado") || uso.total === 140, 'recusa por "esgotado" só aconteceu com o total de fato em 140');
  eq(resultados.filter((x) => x.erro).length, 0, "nenhuma exceção");
}

async function quantidadeEVagaQueVolta() {
  console.log("== quantidade maior que o que resta, e vaga que volta ==");
  const modulo = novaInstancia();
  const g = novoDirectus();
  const limites = { total: 5, porTamanho: {} };
  const c1 = await criar(modulo, g, { M: 4 }, limites);
  modulo.esquecerMemoria();
  const c2 = await criar(modulo, g, { M: 3 }, limites);
  eq([!!c1.pedidoId, c2.erroHttp.status, c2.erroHttp.body.motivo, c2.erroHttp.body.restam], [true, 409, "quantidade", 1], "pede 3 quando resta 1: 409 com 'restam 1'");
  modulo.esquecerMemoria();
  eq(!!(await criar(modulo, g, { M: 1 }, limites)).pedidoId, true, "pedir 1 ainda cabe");
  modulo.esquecerMemoria();
  const c4 = await criar(modulo, g, { M: 1 }, limites);
  eq([c4.erroHttp.status, c4.erroHttp.body.motivo], [409, "esgotado"], "agora esgotou");
  g.banco.pedidos.splice(0, 1); // o gestor apaga o primeiro pedido (4 peças)
  modulo.esquecerMemoria();
  eq(!!(await criar(modulo, g, { M: 4 }, limites)).pedidoId, true, "pedido apagado libera as 4 vagas");
  eq(g.banco.controle.map((c) => c.n), [1, 2, 3], "o livro de senhas só cresce: a senha de um pedido apagado não é reaproveitada");
  modulo.esquecerMemoria();
  const noutroLoteAberto = await criar(modulo, g, { M: 1 }, limites, 8);
  eq([noutroLoteAberto.erroHttp.status, noutroLoteAberto.erroHttp.body.motivo], [409, "esgotado"], "dois lotes abertos (uma rajada que criou um lote a mais) contam JUNTOS: o limite é da campanha, não de cada lote");
  g.banco.lotesFechados.add(7); // a equipe fecha o lote 7: as peças dele deixam de contar
  modulo.esquecerMemoria();
  const depoisDeFechar = await criar(modulo, g, { M: 5 }, limites, 9);
  eq(!!depoisDeFechar.pedidoId, true, "fechou o lote: o próximo lote aberto começa do zero (5 de 5 cabem)");
  eq(pecasDoLote(g.banco, 1).total, 5, "e só as peças do lote aberto contam (o lote fechado saiu da conta)");
}

async function memoriaDeEsgotado() {
  console.log("== a memória de 'esgotado' (recusa sem ir ao Directus) ==");
  const modulo = novaInstancia();
  const h = novoDirectus();
  const limites = { total: 2, porTamanho: {} };
  await criar(modulo, h, { M: 2 }, limites);
  const antes = { ...h.banco.chamadas };
  const recusas = await Promise.all(Array.from({ length: 30 }, () => criar(modulo, h, { M: 1 }, limites)));
  eq(recusas.every((x) => x.erroHttp && x.erroHttp.status === 409 && x.erroHttp.body.motivo === "esgotado"), true, "30 pedidos depois do esgotamento: todos 409 esgotado");
  eq([h.banco.chamadas.ultima - antes.ultima, h.banco.chamadas.soma - antes.soma, h.banco.chamadas.gravacao - antes.gravacao], [0, 0, 0], "e NENHUM tocou o Directus: foram todos recusados pela memória");
  modulo.esquecerMemoria();
  const livre = await criar(modulo, h, { M: 1 }, { total: 3, porTamanho: {} });
  eq(!!livre.pedidoId, true, "a memória só recusa: aumentado o limite, o pedido seguinte passa assim que ela expira");
}

async function memoriaDoEstado() {
  console.log("== a memória do estado: pula leituras sem afrouxar a garantia ==");
  const limites = { total: 140, porTamanho: {} };

  // 1) uma instância gravando em sequência: só a primeira vez lê; as outras já sabem o último número e as peças
  let modulo = novaInstancia();
  let fake = novoDirectus({ atraso: 2 });
  for (let i = 0; i < 40; i++) await criar(modulo, fake, { M: 1 }, limites);
  eq([fake.banco.chamadas.ultima, fake.banco.chamadas.soma, fake.banco.chamadas.gravacao], [1, 1, 40], "40 pedidos em sequência: UMA leitura do livro e UMA soma (o resto usa a memória), 40 gravações");

  // 2) a idade conta desde a última leitura REAL: gravar não rejuvenesce o estado
  modulo = novaInstancia();
  fake = novoDirectus({ atraso: 1 });
  await criar(modulo, fake, { M: 1 }, limites);
  const primeiro = modulo.estadoRecente(1).em;
  await dormir(40);
  await criar(modulo, fake, { M: 1 }, limites);
  eq(modulo.estadoRecente(1).em, primeiro, "o segundo pedido (que usou a memória) NÃO renovou a hora da leitura: em poucos segundos tudo é lido de novo");

  // 3) estado velho é ignorado: apagaram pedidos por fora e a memória (velha) ainda dizia "cheio"
  modulo = novaInstancia();
  fake = novoDirectus({ atraso: 1 });
  const cheio = { total: 3, porTamanho: {} };
  for (let i = 0; i < 3; i++) await criar(modulo, fake, { M: 1 }, cheio);
  eq((await criar(modulo, fake, { M: 1 }, cheio)).erroHttp.body.motivo, "esgotado", "cheio (3 de 3): recusa pela memória");
  fake.banco.pedidos.splice(0, 2); // o gestor apaga 2 pedidos
  const antes = fake.banco.chamadas.ultima;
  eq((await criar(modulo, fake, { M: 1 }, cheio)).erroHttp.body.motivo, "esgotado", "logo depois de apagar, a memória (ainda nova) segue recusando: erra para o lado seguro");
  eq(fake.banco.chamadas.ultima - antes, 0, "...e essa recusa não foi ao Directus");
  modulo.lembrarEstado(1, 3, { total: 3, porTamanho: {} }, Date.now() - 10000);
  const livre = await criar(modulo, fake, { M: 1 }, cheio);
  eq(!!livre.pedidoId, true, "passados poucos segundos (estado velho), lê de novo, vê as vagas liberadas e aceita");

  // 4) outra instância gravou no meio: o atalho tenta a senha seguinte, o banco recusa, e a leitura nova mostra o que mudou
  const a = novaInstancia();
  const b = novaInstancia();
  fake = novoDirectus({ atraso: 1 });
  const pequeno = { total: 5, porTamanho: {} };
  await criar(a, fake, { M: 1 }, pequeno);                  // A grava e fica com a memória (1 de 5)
  for (let i = 0; i < 3; i++) await criar(b, fake, { M: 1 }, pequeno); // B grava 3 (4 de 5) sem A saber
  const r1 = await criar(a, fake, { M: 1 }, pequeno);       // A usa a memória velha (1 de 5), tenta a senha 2, o banco recusa, A lê de novo (4 de 5) e grava
  const r2 = await criar(a, fake, { M: 1 }, pequeno);       // agora é a 6ª peça de 5
  eq([!!r1.pedidoId, r2.erroHttp && r2.erroHttp.status, pecasDoLote(fake.banco, 1).total, fake.banco.chamadas.conflitos], [true, 409, 5, 1], "A com memória velha: a senha tomada por B faz o banco recusar, A relê e só então grava; a 6ª peça é recusada (5 de 5)");
}

async function falhas_() {
  console.log("== falhas ==");
  const modulo = novaInstancia();
  const q = novoDirectus({ falhaGravacao: true });
  const fq = await criar(modulo, q, { M: 1 }, { total: 10, porTamanho: {} });
  eq([fq.erroHttp.status, fq.erroHttp.body.erro], [502, "Falha ao criar pedido."], "o Directus recusa a gravação: 502, o pedido não é aceito");
  eq(q.banco.pedidos.length, 0, "nada gravado");
  const quebrado = await modulo.criarPedidoComLimite({ directus: async () => new Response("{}", { status: 500 }), loteId: 9, limites: { total: 3, porTamanho: {} }, ...pedidoDe({ M: 1 }), log: () => {} }).catch((e) => ({ erro: e.message }));
  verdade(/livro de senhas/.test(quebrado.erro || ""), "sem conseguir ler o livro de senhas a função LANÇA erro (a API responde 502 e o pedido não entra)");
}

async function ordemDasLeituras() {
  console.log("== o laço da senha: a ordem das leituras e as desistências ==");
  const modulo = novaInstancia();
  const eventos = [];
  await modulo.reservarEGravar({
    limites: { total: 5, porTamanho: {} }, pedido: { total: 1, porTamanho: { M: 1 } },
    lerUltimaSenha: async () => { eventos.push("senha"); return 0; }, lerUso: async () => { eventos.push("soma"); return { total: 0, porTamanho: {} }; },
    gravar: async (n) => { eventos.push("grava" + n); return { ok: true, pedidoId: 1 }; },
  });
  eq(eventos, ["senha", "soma", "grava1"], "primeiro o último número, DEPOIS a soma, depois grava h+1 (é essa ordem que garante a exatidão)");
  let tentativas = 0;
  const rr = await modulo.reservarEGravar({
    limites: { total: 5, porTamanho: {} }, pedido: { total: 1, porTamanho: { M: 1 } }, esperar: async () => {},
    lerUltimaSenha: async () => 3, lerUso: async () => ({ total: 3, porTamanho: {} }),
    gravar: async () => { tentativas++; return tentativas < 3 ? { conflito: true } : { ok: true, pedidoId: 9 }; },
  });
  eq([rr.ok, tentativas], [true, 3], "conflito de senha: lê tudo de novo e tenta de novo até gravar");
  const so = await modulo.reservarEGravar({
    limites: { total: 5, porTamanho: {} }, pedido: { total: 1, porTamanho: { M: 1 } }, esperar: async () => {}, maxTentativas: 4,
    lerUltimaSenha: async () => 0, lerUso: async () => ({ total: 0, porTamanho: {} }), gravar: async () => ({ conflito: true }),
  });
  eq([so.ok, so.ocupado], [false, true], "conflito sem parar: desiste com 'ocupado' (a API responde 503), sem gravar nada");
  const fal = await modulo.reservarEGravar({
    limites: { total: 5, porTamanho: {} }, pedido: { total: 1, porTamanho: { M: 1 } },
    lerUltimaSenha: async () => 0, lerUso: async () => ({ total: 0, porTamanho: {} }), gravar: async () => ({ falhou: true, status: 500 }),
  });
  eq([fal.ok, !!fal.falhou], [false, true], "falha que não é conflito: não insiste");
  // a conferência usa a soma lida DEPOIS da senha: se entre uma leitura e outra entrou um pedido, a soma maior recusa (conservador), nunca o contrário
  const cons = await modulo.reservarEGravar({
    limites: { total: 5, porTamanho: {} }, pedido: { total: 2, porTamanho: { M: 2 } },
    lerUltimaSenha: async () => 3, lerUso: async () => ({ total: 4, porTamanho: {} }), gravar: async () => { throw new Error("não devia gravar"); },
  });
  eq([cons.ok, cons.recusa.motivo, cons.recusa.restam], [false, "quantidade", 1], "soma lida maior que a esperada: recusa em vez de gravar");
}

(async () => {
  await filas();
  await umaInstancia();
  await excessoDeGente();
  await disputa();
  await tamanhos();
  await quantidadeEVagaQueVolta();
  await memoriaDeEsgotado();
  await memoriaDoEstado();
  await falhas_();
  await ordemDasLeituras();
  console.log(`\n${total - falhas}/${total} verificações ok`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.log("ERRO:", e.stack || e.message); process.exit(1); });
