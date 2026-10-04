// Verificação diferencial em navegador de verdade (Edge headless): ORIGINAL (sem CSP) × NOVA (com a CSP estrita).
//   node rodar.js --original <pasta> --nova <pasta>            compara (reaproveita o plano/1ª rodada da original se já existir)
//   node rodar.js --original <pasta> --estabilidade            rodada dupla da original contra ela mesma (prova que o transcrito é estável)
// Opções: --workers 8 | --perfis anonimo,geral,membro | --redescobrir | --so geral:12,geral:40 (detalhe de ações) | --sem-especiais | --saida <pasta>
// <pasta> pode ser a pasta app/ ou a raiz do repositório (usa a app/ dentro dela).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { criarServidor } = require("./servidor");
const { gerarModelo } = require("./modelo");
const { abrirNavegador, executarAcao, explorar, emParalelo, arquivosDeTeste, contextosDosTrabalhadores, fecharContextos } = require("./cobertor");
const { compararRodadas, compararAcao, resumo } = require("./comparar");

const AQUI = __dirname;
let PORTA = 47811; // --porta muda (para rodar duas verificações ao mesmo tempo)

function args() {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith("--")) continue;
    const k = a[i].slice(2);
    if (a[i + 1] !== undefined && !a[i + 1].startsWith("--")) { o[k] = a[i + 1]; i++; } else o[k] = true;
  }
  return o;
}
function pastaApp(p) {
  const abs = path.resolve(p);
  if (fs.existsSync(path.join(abs, "index.html"))) return abs;
  if (fs.existsSync(path.join(abs, "app", "index.html"))) return path.join(abs, "app");
  throw new Error("não achei index.html em " + abs + " nem em " + abs + "/app");
}
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const agoraTxt = () => new Date().toLocaleTimeString("pt-BR");

async function rodarPlano(nav, pasta, csp, modelo, arqs, plano, workers, rotulo, opcoesExec = {}) {
  const srv = await criarServidor({ raiz: pasta, porta: PORTA, csp, permissoes: modelo.permissoes });
  const t0 = Date.now();
  let feitos = 0;
  const ctxs = await contextosDosTrabalhadores(nav, workers);
  const res = await emParalelo(plano, workers, (a, k, w) => executarAcao(nav, srv, modelo, arqs, a, Object.assign({ rotulo, ctx: ctxs[w] }, opcoesExec)), () => {
    feitos++;
    if (feitos % 200 === 0) console.log(`  [${agoraTxt()}] ${rotulo}: ${feitos}/${plano.length}`);
  });
  await fecharContextos(ctxs);
  await srv.fechar();
  const transcritos = {};
  plano.forEach((a, k) => { transcritos[a.id] = res[k]; });
  console.log(`  ${rotulo}: ${plano.length} ações em ${Math.round((Date.now() - t0) / 1000)} s`);
  return transcritos;
}

function estatisticas(plano, T) {
  const porPerfil = {};
  const rotas = new Set();
  let erros = 0, instaveis = 0, falhas = 0, naoAchados = 0, retentativas = 0;
  const telas = new Set();
  for (const a of plano) {
    const t = T[a.id] || {};
    const p = porPerfil[a.perfil] = porPerfil[a.perfil] || { acoes: 0, porEvento: {}, profundidadeMax: 0 };
    p.acoes++;
    if (a.evento) p.porEvento[a.evento] = (p.porEvento[a.evento] || 0) + 1;
    p.profundidadeMax = Math.max(p.profundidadeMax, a.profundidade || 0);
    for (const c of t.api || []) rotas.add(c.split(" ")[0] + " " + c.split(" ")[1].split("?")[0].replace(/\/\d+(?=\/|$)/g, "/:n"));
    if ((t.erros || []).length) erros++;
    if (t.instavel) instaveis++;
    if (t.falhaDoEquipamento) falhas++;
    retentativas += t.retentativas || 0;
    if (t.achado === false || t.caminhoQuebrado !== undefined) naoAchados++;
    if (t.retrato && t.retrato.titulo) telas.add(a.perfil + "|" + t.retrato.titulo + (t.retrato.modal ? "|modal:" + t.retrato.modal.slice(0, 40) : ""));
  }
  return { porPerfil, rotasDistintas: rotas.size, rotas: [...rotas].sort(), acoesComErro: erros, acoesInstaveis: instaveis, falhasDoEquipamento: falhas, controlesNaoAchados: naoAchados, telasDistintas: telas.size, retentativasDeRede: retentativas };
}

(async () => {
  const o = args();
  if (!o.original) { console.log("uso: node rodar.js --original <pasta> [--nova <pasta>] [--estabilidade] [--workers 8] [--perfis anonimo,geral,membro] [--so id,id] [--redescobrir]"); process.exit(2); }
  const workers = Number(o.workers) || 12;
  if (o.porta) PORTA = Number(o.porta);
  // --nova-sem-csp: só para testar o próprio equipamento com uma cópia "estragada" de propósito (sem a CSP, que derrubaria tudo)
  const cspNova = !o["nova-sem-csp"];
  const perfis = String(o.perfis || "anonimo,geral,membro").split(",");
  const original = pastaApp(o.original);
  const nova = o.nova ? pastaApp(o.nova) : null;
  const saida = path.resolve(o.saida || path.join(AQUI, "resultados"));
  fs.mkdirSync(saida, { recursive: true });
  fs.mkdirSync(path.join(AQUI, "planos"), { recursive: true });

  // modelo de respostas e plano: sempre a partir da ORIGINAL; ficam guardados pelo hash dela
  // (mude VERSAO_PLANO quando o instrumento/cobertor mudar de um jeito que altere o transcrito; ou use --redescobrir)
  const VERSAO_PLANO = "v1";
  const chave = sha(fs.readFileSync(path.join(original, "index.html")) + fs.readFileSync(path.join(original, "script.js")) + VERSAO_PLANO + perfis.join(","));
  const modelo = gerarModelo(path.join(original, "script.js"));
  const arqs = arquivosDeTeste();
  // vários processos do Edge (rende mais que um só com muitas abas); os trabalhadores se dividem entre eles
  const nNav = Math.max(1, Math.min(Number(o.navegadores) || 3, workers));
  const nav = await Promise.all(Array.from({ length: nNav }, (_, i) => abrirNavegador(path.join(AQUI, "perfis-edge", PORTA + "-" + i))));
  const fecharNavs = async () => { for (const n of nav) { try { await n.close(); } catch (_) {} } };
  const relatorio = [];
  const log = (s) => { console.log(s); relatorio.push(s); };
  log(`Verificação diferencial — ${new Date().toLocaleString("pt-BR")}`);
  log(`ORIGINAL: ${original} (sem CSP)`);
  if (nova) log(`NOVA:     ${nova} (com a CSP estrita)`);

  const arqPlano = path.join(AQUI, "planos", `plano-${chave}.json`);
  let plano, T1;
  if (fs.existsSync(arqPlano) && !o.redescobrir) {
    const d = JSON.parse(fs.readFileSync(arqPlano, "utf8"));
    plano = d.plano; T1 = d.transcritos;
    log(`Plano reaproveitado (${plano.length} ações): ${arqPlano}`);
  } else {
    log(`[${agoraTxt()}] Descobrindo o plano na ORIGINAL (perfis: ${perfis.join(", ")}) ...`);
    const srv = await criarServidor({ raiz: original, porta: PORTA, csp: false, permissoes: modelo.permissoes });
    plano = []; T1 = {};
    for (const perfil of perfis) {
      const r = await explorar(nav, srv, modelo, arqs, perfil, { workers, log, profundidade: Number(o.profundidade) || 7, limiteAcoes: Number(o.limite) || 6000 });
      plano.push(...r.plano); Object.assign(T1, r.transcritos);
    }
    await srv.fechar();
    fs.writeFileSync(arqPlano, JSON.stringify({ chave, original, criadoEm: new Date().toISOString(), plano, transcritos: T1 }));
    log(`Plano salvo: ${arqPlano}`);
  }

  // --rebase: roda o MESMO plano de novo na original e troca a 1ª rodada guardada (depois de mudar o instrumento sem mudar o plano)
  if (o.rebase) {
    log(`[${agoraTxt()}] Refazendo a 1ª rodada da original com o plano guardado ...`);
    T1 = await rodarPlano(nav, original, false, modelo, arqs, plano, workers, "original");
    const d = JSON.parse(fs.readFileSync(arqPlano, "utf8"));
    d.transcritos = T1; d.rebaseEm = new Date().toISOString();
    fs.writeFileSync(arqPlano, JSON.stringify(d));
  }

  // modo rápido: só a 1ª ação de cada chave (mesmo manipulador com outros números = repetição de linha) — cerca de 1/3 do plano
  if (o.rapido) {
    const vistas = new Set();
    const total = plano.length;
    plano = plano.filter(a => { if (!a.chave) return true; if (vistas.has(a.perfil + a.chave)) return false; vistas.add(a.perfil + a.chave); return true; });
    log(`Modo rápido: ${plano.length} de ${total} ações (uma por manipulador distinto)`);
  }

  // detalhe de ações escolhidas
  if (o.so) {
    const ids = String(o.so).split(",");
    const sub = plano.filter(a => ids.includes(a.id));
    const A = await rodarPlano(nav, original, false, modelo, arqs, sub, workers, "original", { htmlJanelas: true });
    const B = nova ? await rodarPlano(nav, nova, cspNova, modelo, arqs, sub, workers, "nova", { htmlJanelas: true }) : await rodarPlano(nav, original, false, modelo, arqs, sub, workers, "original-2", { htmlJanelas: true });
    for (const a of sub) {
      console.log(`\n===== ${a.id} ${A[a.id].alvo}  caminho: ${(A[a.id].caminho || []).join(" → ")}`);
      const d = compararAcao(A[a.id], B[a.id]);
      console.log(d.length ? d.join("\n") : "  (iguais)");
      if (o.v) { console.log("--- A:", JSON.stringify(resumo(A[a.id]), null, 1).slice(0, 6000)); console.log("--- B:", JSON.stringify(resumo(B[a.id]), null, 1).slice(0, 6000)); }
    }
    await fecharNavs();
    return;
  }

  const est = estatisticas(plano, T1);
  log(`\nBASELINE (original, 1ª rodada): ${plano.length} ações; telas distintas ${est.telasDistintas}; rotas de API distintas ${est.rotasDistintas}; ações com erro no console ${est.acoesComErro}; instáveis ${est.acoesInstaveis}; falhas do equipamento ${est.falhasDoEquipamento}; controles não achados ${est.controlesNaoAchados}; pedidos repetidos por falha de rede do servidor de teste ${est.retentativasDeRede}`);
  for (const [p, v] of Object.entries(est.porPerfil)) log(`  perfil ${p}: ${v.acoes} ações (${Object.entries(v.porEvento).map(([e, n]) => e + " " + n).join(", ")}), profundidade até ${v.profundidadeMax}`);
  fs.writeFileSync(path.join(saida, "baseline-estatisticas.json"), JSON.stringify(est, null, 1));
  const cob = require("./cobertura").cobertura(plano, original);
  log(`  cobertura dos atributos de evento da original: ${Object.entries(cob.porArquivo).map(([f, v]) => `${f} ${v.acionados}/${v.total}`).join(", ")} (os que faltam: ${path.join(saida, "cobertura-faltam.txt")})`);
  fs.writeFileSync(path.join(saida, "cobertura-faltam.txt"), cob.faltam.join("\n"));

  let codigoSaida = 0;
  if (o.estabilidade) {
    log(`\n[${agoraTxt()}] Rodada dupla: ORIGINAL × ORIGINAL ...`);
    const T2 = await rodarPlano(nav, original, false, modelo, arqs, plano, workers, "original-2");
    const r = compararRodadas(plano, T1, T2);
    fs.writeFileSync(path.join(saida, "estabilidade-transcritos-2.json"), JSON.stringify({ transcritos: T2 }));
    log(`ESTABILIDADE: ${r.iguais} ações iguais, ${r.diferentes} diferentes; violações de CSP ${r.violacoes.length}; falhas do equipamento ${r.falhas.length}`);
    fs.writeFileSync(path.join(saida, "estabilidade-divergencias.txt"), r.linhas.join("\n"));
    if (r.diferentes) { log(r.linhas.slice(0, 60).join("\n")); codigoSaida = 1; }
  }
  if (nova) {
    log(`\n[${agoraTxt()}] Rodando o plano na NOVA com a CSP estrita ...`);
    const TN = await rodarPlano(nav, nova, cspNova, modelo, arqs, plano, workers, "nova");
    fs.writeFileSync(path.join(saida, "nova-transcritos.json"), JSON.stringify({ transcritos: TN }));
    const r = compararRodadas(plano, T1, TN);
    log(`\nRESULTADO ORIGINAL × NOVA: ${r.iguais} ações iguais, ${r.diferentes} com divergência; violações de CSP na nova: ${r.violacoes.length}; falhas do equipamento: ${r.falhas.length}`);
    if (r.violacoes.length) { log("VIOLAÇÕES DE CSP:"); log(r.violacoes.slice(0, 80).join("\n")); }
    if (r.diferentes) { log("DIVERGÊNCIAS (A = original, B = nova):"); log(r.linhas.join("\n")); }
    if (r.falhas.length) log("FALHAS DO EQUIPAMENTO:\n" + r.falhas.slice(0, 30).join("\n"));
    if (r.diferentes || r.violacoes.length) codigoSaida = 1;
  }
  if (!o["sem-especiais"]) {
    const { rodarEspeciais } = require("./especiais");
    log(`\n[${agoraTxt()}] Peças especiais (importar planilha, exportar rol, impressão de carta e certificado, verificar.html) ...`);
    // sem --nova e com --estabilidade: as peças especiais também rodam duas vezes na original e são comparadas
    const r = await rodarEspeciais(nav[0], { original, nova: nova || (o.estabilidade ? original : null), cspNova: !!nova && cspNova, modelo, arqs, porta: PORTA, log });
    if (!r.ok) codigoSaida = 1;
  }
  fs.writeFileSync(path.join(saida, "relatorio.txt"), relatorio.join("\n"));
  log(`\nRelatório: ${path.join(saida, "relatorio.txt")}`);
  await fecharNavs();
  process.exit(codigoSaida);
})().catch((e) => { console.error("ERRO DO EQUIPAMENTO:", e); process.exit(3); });
