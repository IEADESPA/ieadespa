// Bateria da EXCLUSÃO EM MASSA dos pedidos de camiseta não separados e da restauração, contra um Directus de verdade (16/10/2026). O painel (pedidos.astro) faz estas chamadas com o token
// do próprio gestor; aqui se prova o que o painel PRESSUPÕE do Directus: o gestor lê os pedidos completos (com itens), apaga em lote, o banco apaga itens e respostas em cascata,
// o lote FECHADO guarda os números travados (a conta da malharia não muda), a restauração com os mesmos números funciona (e a sequência do banco segue certa) e o script
// `scripts/restaurar-pedidos.mjs` devolve tudo a partir do arquivo de cópia. Cria uma campanha "teste-…" (inativa), um usuário de teste com a função "Gestor de Camisetas" e apaga tudo no fim.
//
// Variáveis: SITE_URL (não usada aqui), DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN (ver README desta pasta).
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { ambiente, Verificador } = require("./comum.cjs");

const SCRIPT = path.join(__dirname, "..", "restaurar-pedidos.mjs");

async function main() {
  const { URL, dx } = ambiente();
  const v = new Verificador("exclusão em massa e restauração");
  let G = null, usuario = null, perguntaId = null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "excl-"));
  const papel = ((await dx("GET", "/roles?filter[name][_eq]=Gestor%20de%20Camisetas&fields=id")).data || [])[0];
  v.ok("a função 'Gestor de Camisetas' existe no Directus", !!papel);
  if (!papel) { v.fim(); return; }
  try {
    const g = await dx("POST", "/items/camiseta_grupos", { slug: "teste-exclusao-" + Date.now(), nome: "TESTE EXCLUSAO (apagar)", ativo: false, tamanhos: ["M"], modelos: ["Unico"] });
    if (!g.ok) { console.log("não criou grupo:", g.status, g.erro); process.exit(1); }
    G = g.data.id;
    const pergunta = await dx("POST", "/items/perguntas_camiseta", { grupo: G, label: "TESTE: congregação?", tipo: "texto_curto", ordem: 1 });
    perguntaId = pergunta.data ? pergunta.data.id : null;
    const agora = new Date().toISOString();
    const L1 = (await dx("POST", "/items/camiseta_lotes", { grupo: G, numero: 1, status: "fechado", fechado_em: agora, total_vendido: 4, total_arrecadado: 0, total_pago_malharia: 50, saldo: -50 })).data.id;
    const L2 = (await dx("POST", "/items/camiseta_lotes", { grupo: G, numero: 2, status: "aberto" })).data.id;
    const loteItem = (await dx("POST", "/items/camiseta_lote_itens", { lote: L1, tamanho: "M", modelo: "Unico", estoque_extra: 1, custo_unitario: 10, pedido_congelado: 4 })).data.id;
    const pedido = async (lote, nome, extra = {}) => (await dx("POST", "/items/camiseta_pedidos", { grupo: G, lote, nome, valor_pago: 0, itens: [{ tamanho: "M", modelo: "Unico", quantidade: 1, quantidade_retirada: 0 }], ...extra })).data.id;
    const A = await pedido(L1, "Teste A", { email: "a@exemplo.com", telefone: "(94) 99999-0001", telefone_chave: "teste-chave-a", telefone_cifrado: "teste-cifrado-a" });
    const B = await pedido(L1, "Teste B");
    const C = await pedido(L2, "Teste C");
    const D = await pedido(L1, "Teste D separado", { separado: true, separado_em: agora });
    if (perguntaId) await dx("POST", "/items/respostas_pedido_camiseta", { pedido: A, pergunta: perguntaId, valor: "Central" });
    const alvos = [A, B, C];

    const senha = crypto.randomBytes(18).toString("base64url");
    const email = `teste-exclusao-${Date.now()}@exemplo.com`;
    const u = await dx("POST", "/users", { email, password: senha, first_name: "TESTE", last_name: "exclusao (apagar)", role: papel.id, status: "active" });
    usuario = u.data.id;
    const lg = await (await fetch(URL + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: senha, mode: "json" }) })).json();
    const comoGestor = async (metodo, caminho, corpo) => {
      const r = await fetch(URL + caminho, { method: metodo, headers: { Authorization: "Bearer " + lg.data.access_token, "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
      return { status: r.status, j: await r.json().catch(() => ({})) };
    };
    const conta = async (colecao, campo, ids) => Number(((await dx("GET", `/items/${colecao}?filter[${campo}][_in]=${ids.join(",")}&aggregate[count]=id`)).data || [{ count: { id: 0 } }])[0].count.id);
    const existentes = async (ids) => ((await dx("GET", `/items/camiseta_pedidos?filter[id][_in]=${ids.join(",")}&fields=id&limit=-1`)).data || []).map((x) => x.id).sort((a, b) => a - b);
    const lerLote = async () => (await dx("GET", `/items/camiseta_lotes/${L1}?fields=status,total_vendido,total_arrecadado,total_pago_malharia,saldo`)).data;
    const lerLoteItem = async () => (await dx("GET", `/items/camiseta_lote_itens/${loteItem}?fields=pedido_congelado,estoque_extra,custo_unitario`)).data;
    const lote1Antes = JSON.stringify(await lerLote()), itemAntes = JSON.stringify(await lerLoteItem());

    // 1) a leitura completa (a cópia): todas as colunas, itens aninhados
    const lido = await comoGestor("GET", `/items/camiseta_pedidos?filter[id][_in]=${alvos.join(",")}&fields=*,itens.*&limit=-1`);
    const completos = (lido.j.data || []).sort((a, b) => a.id - b.id);
    v.ok("o gestor lê os pedidos completos (todas as colunas e os itens)", lido.status === 200 && completos.length === 3 && completos.every((p) => Array.isArray(p.itens) && p.itens.length === 1), JSON.stringify({ status: lido.status, n: completos.length }));
    const pA = completos.find((p) => p.id === A);
    v.ok("e enxerga o telefone cifrado e a chave (a cópia leva tudo)", pA.telefone_chave === "teste-chave-a" && pA.telefone_cifrado === "teste-cifrado-a" && pA.email === "a@exemplo.com", JSON.stringify(pA));
    const respostas = (await comoGestor("GET", `/items/respostas_pedido_camiseta?filter[pedido][_in]=${alvos.join(",")}&fields=*&limit=-1`)).j.data || [];
    v.ok("e as respostas do pedido", respostas.length === (perguntaId ? 1 : 0) && (!perguntaId || respostas[0].pedido === A), JSON.stringify(respostas));
    const antes = Object.fromEntries(completos.map((p) => [p.id, p]));
    const semData = (p) => { const { date_created, itens, respostas: r, ...resto } = p; return JSON.stringify({ ...resto, itens: (itens || []).map(({ date_created: d, ...i }) => i) }); };

    // 2) quem não tem sessão não apaga
    const anonimo = await fetch(URL + "/items/camiseta_pedidos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify([A]) });
    v.ok("sem sessão não se apaga pedido (401/403)", anonimo.status === 401 || anonimo.status === 403, anonimo.status);
    v.ok("…e o pedido continua lá", (await existentes([A])).length === 1);

    // 3) o gestor apaga em lote
    const del = await comoGestor("DELETE", "/items/camiseta_pedidos", alvos);
    v.ok("o gestor apaga os 3 pedidos de uma vez (DELETE com a lista de números → 204)", del.status === 204, JSON.stringify(del));
    v.ok("os pedidos sumiram e o separado (que não estava na lista) ficou", (await existentes([...alvos, D])).join() === String(D), JSON.stringify(await existentes([...alvos, D])));
    v.ok("os itens foram junto (cascata do banco)", (await conta("camiseta_itens_pedido", "pedido", alvos)) === 0);
    v.ok("as respostas também (cascata do banco)", (await conta("respostas_pedido_camiseta", "pedido", alvos)) === 0);
    v.ok("A CONTA DA MALHARIA do lote fechado não mudou (números travados)", JSON.stringify(await lerLote()) === lote1Antes, JSON.stringify(await lerLote()));
    v.ok("nem o 'pedido pelo sistema' congelado por tamanho", JSON.stringify(await lerLoteItem()) === itemAntes, JSON.stringify(await lerLoteItem()));
    v.ok("a pergunta continua (só a resposta do pedido apagado se foi)", !perguntaId || (await dx("GET", `/items/perguntas_camiseta/${perguntaId}?fields=id`)).ok);

    // 4) a restauração como o botão "Desfazer a exclusão" faz: pedidos, depois itens e respostas, COM os mesmos números
    const copia = {
      versao: 1, geradoEm: agora, campanha: { id: G, nome: "TESTE EXCLUSAO" },
      pedidos: completos.map(({ itens, respostas: r, ...resto }) => resto),
      itens: completos.flatMap((p) => p.itens.map((i) => ({ ...i, pedido: p.id }))),
      respostas
    };
    let r1 = await comoGestor("POST", "/items/camiseta_pedidos", copia.pedidos);
    v.ok("o gestor recria os pedidos com os MESMOS números (POST com o id)", r1.status === 200 && (r1.j.data || []).map((x) => x.id).sort((a, b) => a - b).join() === alvos.join(), JSON.stringify(r1).slice(0, 300));
    r1 = await comoGestor("POST", "/items/camiseta_itens_pedido", copia.itens);
    v.ok("…e os itens", r1.status === 200 && (r1.j.data || []).length === 3, JSON.stringify(r1).slice(0, 200));
    if (copia.respostas.length) { r1 = await comoGestor("POST", "/items/respostas_pedido_camiseta", copia.respostas); v.ok("…e as respostas", r1.status === 200 && (r1.j.data || []).length === 1, JSON.stringify(r1).slice(0, 200)); }
    const depois = Object.fromEntries(((await comoGestor("GET", `/items/camiseta_pedidos?filter[id][_in]=${alvos.join(",")}&fields=*,itens.*&limit=-1`)).j.data || []).map((p) => [p.id, p]));
    v.ok("cada pedido voltou igual (nome, e-mail, telefone cifrado e chave, lote, valor, estado e itens com os mesmos números); só a data de criação é a da restauração", alvos.every((id) => depois[id] && semData(depois[id]) === semData(antes[id])), JSON.stringify(alvos.map((id) => depois[id] && semData(depois[id]) === semData(antes[id]))));
    v.ok("a resposta voltou ao pedido certo", (await conta("respostas_pedido_camiseta", "pedido", [A])) === (perguntaId ? 1 : 0));
    const novo = await pedido(L2, "Teste novo depois da restauração");
    v.ok("um pedido novo depois disso recebe número MAIOR (a sequência do banco não foi quebrada)", novo > Math.max(...alvos, D), JSON.stringify({ novo, maior: Math.max(...alvos, D) }));
    v.ok("o lote fechado continua com os mesmos números travados", JSON.stringify(await lerLote()) === lote1Antes && JSON.stringify(await lerLoteItem()) === itemAntes);

    // 5) o script de restauração (para quando a página já foi fechada): usa o arquivo de cópia
    const arquivo = path.join(tmp, "copia.json");
    fs.writeFileSync(arquivo, JSON.stringify(copia));
    const roda = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env } });
    let rr = roda(arquivo, "--conferir");
    v.ok("o script recusa restaurar o que já existe (e diz quais)", rr.status === 1 && /JÁ EXISTEM/.test(rr.stderr), rr.stderr.slice(0, 200));
    await dx("DELETE", "/items/camiseta_pedidos", alvos);
    v.ok("de novo apagados (para provar o script)", (await existentes(alvos)).length === 0);
    rr = roda(arquivo, "--conferir");
    v.ok("--conferir só diz o que seria restaurado, sem gravar nada", rr.status === 0 && /Pode restaurar: 3 pedido\(s\), 3 item\(ns\)/.test(rr.stdout) && (await existentes(alvos)).length === 0, rr.stdout + rr.stderr);
    rr = roda(arquivo);
    v.ok("o script restaura tudo, com os mesmos números", rr.status === 0 && /Pronto\./.test(rr.stdout) && (await existentes(alvos)).join() === alvos.join(), rr.stdout + rr.stderr);
    const depois2 = Object.fromEntries(((await dx("GET", `/items/camiseta_pedidos?filter[id][_in]=${alvos.join(",")}&fields=*,itens.*&limit=-1`)).data || []).map((p) => [p.id, p]));
    v.ok("e cada pedido voltou igual de novo", alvos.every((id) => depois2[id] && semData(depois2[id]) === semData(antes[id])));
    v.ok("o texto que o script imprime não contém o token nem o endereço do Directus", !rr.stdout.includes(process.env.DIRECTUS_ADMIN_TOKEN) && !rr.stdout.includes(process.env.DIRECTUS_URL) && !rr.stderr.includes(process.env.DIRECTUS_ADMIN_TOKEN));
    rr = roda(arquivo);
    v.ok("rodar de novo recusa (nada duplica)", rr.status === 1 && /JÁ EXISTEM/.test(rr.stderr));
    v.ok("sem o endereço ou o token, o script avisa e não faz nada", spawnSync(process.execPath, [SCRIPT, arquivo], { encoding: "utf8", env: { PATH: process.env.PATH } }).status === 2);
    const estranho = path.join(tmp, "estranho.json");
    fs.writeFileSync(estranho, JSON.stringify({ versao: 9, pedidos: [] }));
    rr = roda(estranho);
    v.ok("arquivo de formato desconhecido é recusado (status 2)", rr.status === 2 && /desconhecido/.test(rr.stderr), rr.stderr);
    fs.writeFileSync(estranho, JSON.stringify({ ...copia, itens: [{ id: 999999, pedido: 888888, tamanho: "M" }] }));
    rr = roda(estranho);
    v.ok("cópia com item de pedido que não está nela é recusada (status 2)", rr.status === 2 && /não está nela/.test(rr.stderr), rr.stderr);
    rr = roda(path.join(tmp, "nao-existe.json"));
    v.ok("arquivo que não existe: recusa com mensagem (status 2)", rr.status === 2 && /Não consegui ler/.test(rr.stderr));
  } finally {
    if (G) await limparGrupo(dx, G, perguntaId);
    if (usuario) await dx("DELETE", `/users/${usuario}`);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* pasta temporária */ }
    v.fim();
  }
}

async function limparGrupo(dx, G, perguntaId) {
  const peds = ((await dx("GET", `/items/camiseta_pedidos?filter[grupo][_eq]=${G}&fields=id&limit=-1`)).data || []).map((x) => x.id);
  if (peds.length) {
    const resp = ((await dx("GET", `/items/respostas_pedido_camiseta?filter[pedido][_in]=${peds.join(",")}&fields=id&limit=-1`)).data || []).map((x) => x.id);
    if (resp.length) await dx("DELETE", "/items/respostas_pedido_camiseta", resp);
    const itens = ((await dx("GET", `/items/camiseta_itens_pedido?filter[pedido][_in]=${peds.join(",")}&fields=id&limit=-1`)).data || []).map((x) => x.id);
    if (itens.length) await dx("DELETE", "/items/camiseta_itens_pedido", itens);
    await dx("DELETE", "/items/camiseta_pedidos", peds);
  }
  const lotes = ((await dx("GET", `/items/camiseta_lotes?filter[grupo][_eq]=${G}&fields=id`)).data || []).map((x) => x.id);
  if (lotes.length) {
    const li = ((await dx("GET", `/items/camiseta_lote_itens?filter[lote][_in]=${lotes.join(",")}&fields=id&limit=-1`)).data || []).map((x) => x.id);
    if (li.length) await dx("DELETE", "/items/camiseta_lote_itens", li);
    await dx("DELETE", "/items/camiseta_lotes", lotes);
  }
  if (perguntaId) await dx("DELETE", `/items/perguntas_camiseta/${perguntaId}`);
  const del = await dx("DELETE", `/items/camiseta_grupos/${G}`);
  console.log("limpeza: pedidos", peds.length, "lotes", lotes.length, "grupo apagado:", del.ok);
}

main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
