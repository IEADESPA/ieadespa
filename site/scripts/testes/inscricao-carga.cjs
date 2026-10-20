// PROVA DE CARGA da inscrição em evento (16/10/2026), contra um Directus REAL (de preferência o local). Roda o handler de verdade (api/CriarInscricao) em vários PROCESSOS (cada um
// simula uma instância do Azure Functions, com a sua fila e a sua memória) disparando inscrições ao mesmo tempo, e confere NO BANCO: as vagas (e os usos do cupom, se houver)
// nunca passam do número, toda inscrição aceita está gravada, e quantas receberam "tente de novo".
//
//   DIRECTUS_URL=… DIRECTUS_ADMIN_TOKEN=… node scripts/testes/inscricao-carga.cjs [--instancias=4] [--pessoas=120] [--vagas=40] [--cupomUsos=15] [--grupo=3]
//
// Cria um evento descartável ("TESTE CARGA INSCRICAO") e o apaga no fim, com as inscrições e as senhas. Pré-requisito: o esquema da trava (`site/scripts/directus-vagas-esquema.mjs`).
// Contra um Directus que NÃO é local exige --producao-ok=sim (gera carga de verdade no servidor).
const { fork } = require("node:child_process");

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const i = a.indexOf("="); return i < 0 ? [a.slice(2), "sim"] : [a.slice(2, i), a.slice(i + 1)]; }));
const num = (nome, padrao) => (args[nome] !== undefined ? Number(args[nome]) : padrao);
const URL_DX = (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
const TOKEN = process.env.DIRECTUS_ADMIN_TOKEN || "";
process.env.TELEFONE_CHAVE_SEGREDO = process.env.TELEFONE_CHAVE_SEGREDO || "segredo-de-teste-local-nao-usar-em-producao";

// ---------- filho: uma "instância" disparando a sua parte das inscrições ----------
if (args.filho) {
  const handler = require("../../api/CriarInscricao/index.js");
  const aleatorio = (max) => Math.floor(Math.random() * max);
  const pessoas = num("grupo", 1);
  const um = async () => {
    const mensagens = {};
    const registrar = (...a) => { const m = a.map((x) => (x && x.message) || String(x)).join(" ").replace(/\d+/g, "N").slice(0, 120); mensagens[m] = (mensagens[m] || 0) + 1; };
    const context = { log: Object.assign(() => {}, { warn: registrar, error: registrar, info() {} }), res: null };
    const req = {
      headers: { "x-forwarded-for": `10.${aleatorio(250)}.${aleatorio(250)}.${aleatorio(250)}, 52.0.0.1` },
      body: { eventoId: num("evento", 0), nomes: Array.from({ length: pessoas }, (_, i) => `Pessoa ${aleatorio(1e6)}-${i}`), telefone: `11 9${String(10000000 + aleatorio(89999999))}`, cupom: args.cupom || undefined },
    };
    const inicio = Date.now();
    try { await handler(context, req); } catch (e) { return { status: 0, ms: Date.now() - inicio, mensagens }; }
    const r = context.res || {};
    return { status: r.status || 0, ms: Date.now() - inicio, mensagens };
  };
  Promise.all(Array.from({ length: num("n", 0) }, um)).then((r) => { process.send({ r }); process.exit(0); });
  return;
}

(async () => {
  if (!URL_DX || !TOKEN) { console.error("DIRECTUS_URL e DIRECTUS_ADMIN_TOKEN são obrigatórios."); process.exit(2); }
  const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_DX);
  if (!local && args["producao-ok"] !== "sim") { console.error("Este Directus não é local: a prova gera carga de verdade. Use --producao-ok=sim se é isso mesmo que você quer."); process.exit(2); }
  process.env.DIRECTUS_URL = URL_DX; process.env.DIRECTUS_ADMIN_TOKEN = TOKEN;
  const h = { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" };
  const dx = async (m, p, b) => { const r = await fetch(URL_DX + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, data: j.data, erro: (j.errors || []).map((e) => e.message).join("; ") }; };
  const instancias = num("instancias", 4), inscricoes = num("pessoas", 120), vagas = num("vagas", 40), cupomUsos = num("cupomUsos", 0), grupo = num("grupo", 1);
  const ev = await dx("POST", "/items/eventos", { title: "TESTE CARGA INSCRICAO (apagar)", slug: "teste-carga-inscricao-" + Date.now(), aceita_inscricao: true, inscricoes_encerradas: false, inscricoes_ate: "2030-12-31", vagas_limite: vagas, requer_aprovacao: false, permite_inscricao_grupo: grupo > 1 });
  if (!ev.ok) { console.log("não criou o evento:", ev.status, ev.erro); process.exit(2); }
  const evento = ev.data.id;
  let cupomId = null;
  try {
    const codigo = "CARGA" + Date.now().toString(36).toUpperCase();
    if (cupomUsos > 0) {
      const c = await dx("POST", "/items/cupons_desconto", { evento, codigo, tipo: "fixo", valor: 10, limite_usos: cupomUsos, usos: 0, ativo: true });
      if (!c.ok) { console.log("não criou o cupom:", c.status, c.erro); process.exit(2); }
      cupomId = c.data.id;
      args.cupom = codigo;
    }
    const partes = Array.from({ length: instancias }, (_, i) => Math.floor(inscricoes / instancias) + (i < inscricoes % instancias ? 1 : 0));
    const inicio = Date.now();
    const r = (await Promise.all(partes.map((n) => new Promise((res, rej) => {
      const argsFilho = ["--filho", `--n=${n}`, `--evento=${evento}`, `--grupo=${grupo}`];
      if (args.cupom) argsFilho.push(`--cupom=${args.cupom}`);
      const f = fork(__filename, argsFilho, { env: process.env });
      f.on("message", (m) => res(m.r)); f.on("error", rej);
    })))).flat();
    const total = Date.now() - inicio;
    const lista = (await dx("GET", `/items/inscricoes_eventos?filter[evento][_eq]=${evento}&fields=id,aguardando_vaga,cupom_usado&limit=-1`)).data || [];
    const senhas = (await dx("GET", `/items/evento_controle?filter[evento][_eq]=${evento}&fields=n&limit=-1`)).data || [];
    const confirmadas = lista.filter((x) => !x.aguardando_vaga).length;
    const comCupom = lista.filter((x) => x.cupom_usado).length;
    const ms = r.map((x) => x.ms).sort((a, b) => a - b);
    const pct = (p) => ms[Math.min(ms.length - 1, Math.floor(ms.length * p))];
    const porStatus = {}; for (const x of r) porStatus[x.status] = (porStatus[x.status] || 0) + 1;
    const mensagens = {}; for (const x of r) for (const [m, q] of Object.entries(x.mensagens)) mensagens[m] = (mensagens[m] || 0) + q;
    const aceitas = r.filter((x) => x.status === 200).length;
    console.log(`${inscricoes} inscrições${grupo > 1 ? ` de ${grupo} pessoas` : ""} ao mesmo tempo em ${instancias} instância(s), ${vagas} vagas${cupomUsos ? `, cupom de ${cupomUsos} usos` : ""} | respostas: ${JSON.stringify(porStatus)} | tempo total ${(total / 1000).toFixed(1)} s | p50 ${pct(0.5)} ms, p95 ${pct(0.95)} ms, máx ${pct(1)} ms`);
    if (Object.keys(mensagens).length) console.log("  mensagens do servidor:", JSON.stringify(mensagens));
    console.log(`  no banco: ${lista.length} pessoas inscritas (${aceitas} inscrições aceitas, ${senhas.length} senhas), ${confirmadas} CONFIRMADAS para ${vagas} vagas, ${lista.length - confirmadas} na lista de espera -> ${confirmadas > vagas ? `ESTOUROU AS VAGAS em ${confirmadas - vagas}` : confirmadas === vagas ? "vagas exatas" : "ok"}`);
    if (cupomUsos) console.log(`  cupom: ${comCupom} descontos para ${cupomUsos} usos -> ${comCupom > cupomUsos ? `ESTOUROU O CUPOM em ${comCupom - cupomUsos}` : comCupom === cupomUsos ? "usos exatos" : "ok"}`);
    const falha = confirmadas > vagas || (cupomUsos && comCupom > cupomUsos) || lista.length !== aceitas * grupo || senhas.length !== aceitas;
    if (falha) { console.log("FALHA: as contas do banco não fecham."); process.exitCode = 1; }
  } finally {
    const ids = ((await dx("GET", `/items/inscricoes_eventos?filter[evento][_eq]=${evento}&fields=id&limit=-1`)).data || []).map((x) => x.id);
    if (ids.length) await dx("DELETE", "/items/inscricoes_eventos", ids);
    if (cupomId) await dx("DELETE", `/items/cupons_desconto/${cupomId}`);
    await dx("DELETE", `/items/eventos/${evento}`); // apaga também as senhas do evento (CASCADE)
  }
})().catch((e) => { console.log("ERRO:", e.message); process.exit(1); });
