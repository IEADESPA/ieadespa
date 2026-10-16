// PROVA DE CARGA do limite de pedidos (16/10/2026), contra um Directus REAL. Roda o handler de verdade (api/CriarPedidoCamiseta) em vários PROCESSOS (cada um simula uma instância
// do Azure Functions, com a sua fila e a sua memória) disparando pedidos ao mesmo tempo, e confere NO BANCO: o total e cada tamanho nunca passam do limite, todo pedido aceito está
// gravado (e só ele), as senhas não se repetem, e quantos pedidos receberam "esgotado" ou "tente de novo".
//
//   DIRECTUS_URL=… DIRECTUS_ADMIN_TOKEN=… node scripts/testes/limite-carga.cjs [--instancias=3] [--pedidos=200] [--limite=140] [--porTamanho=M:50,G:30]
//        [--tamanhos=P,M,G,GG] [--perfil=pico|uniforme|rajada] [--picoMs=3000] [--duracaoMs=20000] [--qtdMax=3] [--comLote] [--manter]
//
// Cria uma campanha descartável ("teste-limite-carga-…") e a apaga no fim (a menos que --manter). Sem lote aberto no começo (de propósito: é o pior caso, a rajada que cria o lote).
// Contra um Directus que NÃO é local exige --producao-ok=sim (gera carga de verdade no servidor).
// Perfis: rajada = todos no mesmo instante; pico = 70 % dos pedidos nos primeiros `picoMs` e o resto até `duracaoMs`; uniforme = espalhados por `duracaoMs`.
const { fork } = require("node:child_process");

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const i = a.indexOf("="); return i < 0 ? [a.slice(2), "sim"] : [a.slice(2, i), a.slice(i + 1)]; }));
const num = (nome, padrao) => (args[nome] !== undefined ? Number(args[nome]) : padrao);

// ---------- filho: uma "instância" disparando a sua parte dos pedidos ----------
if (args.filho) {
  const handler = require("../../api/CriarPedidoCamiseta/index.js");
  const tamanhos = String(args.tamanhos).split(",");
  const n = num("n", 0);
  const grupoId = num("grupo", 0);
  const perfil = args.perfil || "pico";
  const picoMs = num("picoMs", 3000);
  const duracaoMs = num("duracaoMs", 20000);
  const qtdMax = num("qtdMax", 3);
  const contagemLog = {};
  const aleatorio = (max) => Math.floor(Math.random() * max);
  const quando = () => (perfil === "rajada" ? 0 : perfil === "uniforme" ? aleatorio(duracaoMs) : Math.random() < 0.7 ? aleatorio(picoMs) : picoMs + aleatorio(Math.max(1, duracaoMs - picoMs)));
  const um = async () => {
    await new Promise((r) => setTimeout(r, quando()));
    const itens = [];
    const linhas = Math.random() < 0.8 ? 1 : 2;
    for (let i = 0; i < linhas; i++) itens.push({ tamanho: tamanhos[aleatorio(tamanhos.length)], modelo: "Unico", quantidade: Math.random() < 0.75 ? 1 : 1 + aleatorio(qtdMax) });
    const conta = (m) => { const f = /fila da campanha \d+ cheia \((\w+)\)/.exec(m); const k = f ? `fila:${f[1]}` : /disputadas/.test(m) ? "senhas" : "outro"; contagemLog[k] = (contagemLog[k] || 0) + 1; };
    const context = { log: Object.assign(() => {}, { warn: conta, error() {}, info() {} }), res: null };
    const req = {
      headers: { "x-forwarded-for": `10.${aleatorio(250)}.${aleatorio(250)}.${aleatorio(250)}, 52.0.0.1` },
      body: { grupoId, nome: `Carga ${aleatorio(1e6)}`, telefone: `11 9${String(10000000 + aleatorio(89999999))}`, itens, respostas: [] },
    };
    const inicio = Date.now();
    try { await handler(context, req); } catch (e) { return { status: 0, ms: Date.now() - inicio, motivo: "EXCECAO " + e.message, itens }; }
    const res = context.res || {};
    return { status: res.status || 0, ms: Date.now() - inicio, motivo: res.body && res.body.motivo, pedidoId: res.body && res.body.pedidoId, itens, em: Date.now() };
  };
  Promise.all(Array.from({ length: n }, um)).then((resultados) => { process.send({ resultados, contagemLog }); process.exit(0); });
  return;
}

// ---------- pai ----------
(async () => {
  const URL_DX = (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
  const TOKEN = process.env.DIRECTUS_ADMIN_TOKEN || "";
  if (!URL_DX || !TOKEN) { console.error("DIRECTUS_URL e DIRECTUS_ADMIN_TOKEN são obrigatórios."); process.exit(2); }
  const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_DX);
  if (!local && args["producao-ok"] !== "sim") { console.error("Este Directus não é local: a prova gera carga de verdade. Use --producao-ok=sim se é isso mesmo que você quer."); process.exit(2); }
  process.env.TELEFONE_CHAVE_SEGREDO = process.env.TELEFONE_CHAVE_SEGREDO || "segredo-de-teste-local-nao-usar-em-producao";

  const instancias = num("instancias", 3);
  const pedidos = num("pedidos", 200);
  const limite = num("limite", 140);
  const tamanhos = String(args.tamanhos || "P,M,G,GG").split(",");
  const porTamanho = {};
  for (const par of String(args.porTamanho || "").split(",").filter(Boolean)) { const [t, v] = par.split(":"); porTamanho[t] = Number(v); }

  const h = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
  const dx = async (metodo, caminho, corpo) => {
    const r = await fetch(URL_DX + caminho, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data: j.data, erro: (j.errors || []).map((e) => e.message).join("; ") };
  };

  const grupo = await dx("POST", "/items/camiseta_grupos", {
    slug: `teste-limite-carga-${Date.now()}`, nome: "TESTE LIMITE CARGA (apagar)", ativo: true, destaque: false, pedir_congregacao: false, limite_uma_por_pessoa: false, retirada_liberada: false,
    tamanhos, modelos: ["Unico"], limite_total: limite, limites_tamanho: Object.keys(porTamanho).length ? porTamanho : null,
  });
  if (!grupo.ok) { console.error("Não consegui criar a campanha de teste:", grupo.status, grupo.erro); process.exit(2); }
  const grupoId = grupo.data.id;
  let falhou = false;
  const confere = (cond, titulo, detalhe) => { if (!cond) falhou = true; console.log(cond ? "  ok   " : "  FALHA", titulo, detalhe === undefined ? "" : detalhe); };
  try {
    if (args.comLote) await dx("POST", "/items/camiseta_lotes", { grupo: grupoId, numero: 1, status: "aberto" });
    console.log(`campanha ${grupoId}: limite ${limite}${Object.keys(porTamanho).length ? ", por tamanho " + JSON.stringify(porTamanho) : ""}; ${pedidos} pedidos em ${instancias} instância(s), perfil ${args.perfil || "pico"}; Directus ${local ? "local" : "REMOTO"}`);

    const inicio = Date.now();
    const partes = Array.from({ length: instancias }, (_, i) => Math.floor(pedidos / instancias) + (i < pedidos % instancias ? 1 : 0));
    const motivosDas503 = {};
    const resultados = (await Promise.all(partes.map((n) => new Promise((resolve, reject) => {
      const filho = fork(__filename, ["--filho", `--n=${n}`, `--grupo=${grupoId}`, `--tamanhos=${tamanhos.join(",")}`, `--perfil=${args.perfil || "pico"}`, `--picoMs=${num("picoMs", 3000)}`, `--duracaoMs=${num("duracaoMs", 20000)}`, `--qtdMax=${num("qtdMax", 3)}`], { env: process.env });
      filho.on("message", (m) => { for (const [k, v] of Object.entries(m.contagemLog || {})) motivosDas503[k] = (motivosDas503[k] || 0) + v; resolve(m.resultados); });
      filho.on("error", reject);
      filho.on("exit", (codigo) => { if (codigo) reject(new Error("filho saiu com " + codigo)); });
    })))).flat();
    const total = Date.now() - inicio;

    // ---- o que o banco guardou ----
    const peds = (await dx("GET", `/items/camiseta_pedidos?filter[grupo][_eq]=${grupoId}&fields=id,lote&limit=-1`)).data || [];
    const soma = (await dx("GET", `/items/camiseta_itens_pedido?filter[pedido][grupo][_eq]=${grupoId}&aggregate[sum]=quantidade&groupBy[]=tamanho`)).data || [];
    const porT = {};
    let pecas = 0;
    for (const l of soma) { porT[l.tamanho || ""] = Number(l.sum.quantidade); pecas += Number(l.sum.quantidade); }
    const senhas = (await dx("GET", `/items/camiseta_controle?filter[grupo][_eq]=${grupoId}&fields=n,chave,pedido&limit=-1`)).data || [];
    const lotes = (await dx("GET", `/items/camiseta_lotes?filter[grupo][_eq]=${grupoId}&fields=id,numero,status&limit=-1`)).data || [];

    const por = (cond) => resultados.filter(cond);
    const aceitos = por((r) => r.status === 200);
    const esgotados = por((r) => r.status === 409);
    const ocupados = por((r) => r.status === 503);
    const outros = por((r) => ![200, 409, 503].includes(r.status));
    const pct = (v, p) => { const o = v.map((r) => r.ms).sort((a, b) => a - b); return o.length ? o[Math.min(o.length - 1, Math.floor(o.length * p))] : 0; };
    const ultimoAceito = aceitos.length ? Math.max(...aceitos.map((r) => r.em)) - inicio : 0;

    console.log(`\n  por que "tente de novo" (503): ${JSON.stringify(motivosDas503)}  [fila = fila cheia; previsao/espera = não daria tempo; senhas = disputa de senha esgotou as tentativas]`);
    console.log(`  duração total ${(total / 1000).toFixed(1)} s | aceitos ${aceitos.length} | esgotado (409) ${esgotados.length} | tente de novo (503) ${ocupados.length} | outros ${outros.length}`);
    console.log(`  latência dos aceitos: p50 ${pct(aceitos, 0.5)} ms, p95 ${pct(aceitos, 0.95)} ms, máx ${pct(aceitos, 1)} ms | das recusas: p50 ${pct(esgotados, 0.5)} ms, máx ${pct(esgotados, 1)} ms`);
    console.log(`  vazão: ${(aceitos.length / Math.max(1, ultimoAceito / 1000)).toFixed(2)} pedidos aceitos/s (até o último aceito, em ${(ultimoAceito / 1000).toFixed(1)} s)`);
    console.log(`  no banco: ${peds.length} pedidos, ${pecas} peças (${JSON.stringify(porT)}), ${senhas.length} senhas, ${lotes.length} lote(s) [${lotes.map((l) => `${l.numero}:${l.status}`).join(" ")}]\n`);

    confere(pecas <= limite, `o total de peças nunca passa de ${limite}`, `(tem ${pecas})`);
    for (const [t, v] of Object.entries(porTamanho)) confere((porT[t] || 0) <= v, `o tamanho ${t} nunca passa de ${v}`, `(tem ${porT[t] || 0})`);
    confere(aceitos.length === peds.length, "pedidos aceitos = pedidos gravados (nenhum aceito sem gravar, nenhum gravado sem resposta)", `(${aceitos.length} × ${peds.length})`);
    confere(new Set(aceitos.map((r) => r.pedidoId)).size === aceitos.length && aceitos.every((r) => peds.some((p) => p.id === r.pedidoId)), "cada pedido aceito aponta para um pedido que existe, sem repetição");
    confere(senhas.length === peds.length && new Set(senhas.map((s) => s.chave)).size === senhas.length, "uma senha por pedido, nenhuma repetida");
    confere(senhas.every((s) => s.pedido !== null) && senhas.map((s) => s.n).sort((a, b) => a - b).every((n, i) => n === i + 1), "as senhas são 1..N, sem buraco");
    confere(outros.length === 0, "nenhuma resposta estranha (só aceito, esgotado ou tente de novo)", outros.slice(0, 3).map((r) => `${r.status} ${r.motivo || ""}`).join("; "));
    const esgotadosPorErro = esgotados.filter((r) => !["esgotado", "tamanho_esgotado", "quantidade", "tamanho_quantidade"].includes(r.motivo));
    confere(esgotadosPorErro.length === 0, "todo 409 diz o motivo");
    const quantidadeDeLotesAbertos = lotes.filter((l) => l.status === "aberto").length;
    console.log(`  (informativo) lotes abertos no fim: ${quantidadeDeLotesAbertos}${quantidadeDeLotesAbertos > 1 ? " — a rajada criou mais de um lote aberto (o limite vale para eles juntos, como projetado)" : ""}; peças que sobraram: ${limite - pecas}; pedidos que receberam "tente de novo" com peça sobrando: ${ocupados.length}`);
    if (!falhou && pedidos * 1.5 >= limite && ocupados.length === 0) confere(pecas === limite || esgotados.length === 0, "havendo demanda, o limite foi preenchido exatamente (ou nenhum pedido foi recusado)", `(${pecas} de ${limite})`);
  } finally {
    if (!args.manter) {
      const r = await dx("DELETE", `/items/camiseta_grupos/${grupoId}`);
      console.log(`\nlimpeza: campanha de teste ${grupoId} apagada (${r.status})`);
    } else console.log(`\n--manter: campanha ${grupoId} ficou no Directus`);
  }
  console.log(falhou ? "\nPROVA REPROVADA" : "\nPROVA APROVADA");
  process.exit(falhou ? 1 : 0);
})().catch((e) => { console.error("ERRO:", e.stack || e.message); process.exit(1); });
