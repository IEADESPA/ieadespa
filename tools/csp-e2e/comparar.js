// Comparador: transcrito a transcrito (mesma ação do plano nas duas rodadas). Normaliza o ruído conhecido (ordem de chamadas paralelas = compara como
// conjunto ordenado; origem/porta trocada por ORIGEM já no instrumento/servidor; relógio e sorteio já fixos no instrumento).
const fs = require("fs");

const ordenar = (l) => (l || []).slice().sort();
// Tolerância declarada: exceção SÍNCRONA dentro do manipulador. Na original (atributo em linha) ela chega como erro da janela ("Uncaught TypeError: x");
// na nova o despachante (eventos.js) a captura e manda ao console ("[eventos] erro na ação "f" x"). Mesmo comportamento: as duas viram "exceção no manipulador: x".
function normalizarErro(e) {
  let m = /^erro: Uncaught (?:[A-Za-z]*Error: )?([^]*)$/.exec(e);
  if (m) return "exceção no manipulador: " + m[1];
  m = /^console\.error: \[eventos\] erro na ação "[^"]*" (?:[A-Za-z]*Error: )?([^]*)$/.exec(e);
  if (m) return "exceção no manipulador: " + m[1];
  return e;
}
function resumo(tr) {
  if (!tr) return null;
  const r = tr.retrato || {};
  return {
    "falha do equipamento": tr.falhaDoEquipamento ? "sim" : "",
    "login": tr.loginFalhou ? "falhou" : "",
    "caminho até o controle": tr.caminhoQuebrado === undefined ? "" : `quebrou no passo ${tr.caminhoQuebrado + 1}`,
    "controle encontrado": tr.achado === undefined ? "" : String(tr.achado),
    "eventos com manipulador no controle": tr.manipuladorNoAlvo ? (tr.manipuladorNoAlvo.eventos || []).join(",") : "",
    "formulário válido": tr.valido === undefined ? "" : String(tr.valido),
    "navegou para outra página": String(tr.navegou || 0),
    "chamadas à API": ordenar(tr.api),
    "diálogos": ordenar(tr.dialogos),
    "confirmações no modal": tr.confirmacoes || [],
    "avisos (toasts)": ordenar(tr.toasts),
    // o hash já é do HTML com a origem trocada por ORIGEM; o tamanho bruto muda com o endereço (local × remoto), por isso fica de fora
    "janelas abertas": ordenar((tr.janelas || []).map(j => `${j.url}|${j.alvo}|html#${j.hash}|print=${j.impresso}|close=${j.docFechado}`)),
    "downloads": ordenar((tr.downloads || []).map(d => `${d.nome}|${d.href}|${d.tipo}|${d.tamanho}b|#${d.hash}`)),
    "objetos blob": ordenar((tr.objetos || []).map(o => `${o.tipo}|${o.tamanho}b|#${o.hash}`)),
    "área de transferência": ordenar(tr.clip),
    "notificações": ordenar(tr.notif),
    "popups": ordenar(tr.popups),
    "erros": ordenar((tr.erros || []).map(normalizarErro)),
    "temporizadores com texto (eval)": String(tr.stringTimers || 0),
    "título": r.titulo || "",
    "endereço": r.url || "",
    "modal": r.modal === undefined ? "" : String(r.modal),
    // vD.6: px de rolagem lateral (janela de celular); comparado como campo próprio para a divergência dizer o que é
    "rolagem lateral (px)": r.rolagemLateral === undefined ? "" : String(r.rolagemLateral),
    "texto visível": r.texto || "",
    "contagens": JSON.stringify(r.contagens || {}),
    "nós do DOM criados/removidos": JSON.stringify(tr.mutacoes || {}),
    "controles com manipulador visíveis": ordenar((tr.controlesDepois || []).map(c => `${c.tag} "${c.rotulo}" #${c.ord} [${c.eventos.join(",")}]${c.desabilitado ? " (desabilitado)" : ""}`))
  };
}
function difLista(a, b, max = 6) {
  const ca = new Map(), cb = new Map();
  for (const x of a) ca.set(x, (ca.get(x) || 0) + 1);
  for (const x of b) cb.set(x, (cb.get(x) || 0) + 1);
  const so1 = [], so2 = [];
  for (const [x, n] of ca) for (let i = 0; i < n - (cb.get(x) || 0); i++) so1.push(x);
  for (const [x, n] of cb) for (let i = 0; i < n - (ca.get(x) || 0); i++) so2.push(x);
  const f = (s) => s.length > 220 ? s.slice(0, 220) + "…" : s;
  return [...so1.slice(0, max).map(x => "    - só na A: " + f(x)), ...(so1.length > max ? [`    - (+${so1.length - max} só na A)`] : []), ...so2.slice(0, max).map(x => "    + só na B: " + f(x)), ...(so2.length > max ? [`    + (+${so2.length - max} só na B)`] : [])];
}
function difTexto(a, b) {
  const la = a.split("\n"), lb = b.split("\n");
  const out = [];
  out.push(...difLista(la, lb, 5));
  return out;
}
// compara dois transcritos da mesma ação; devolve lista de linhas de divergência (vazia = igual)
function compararAcao(ta, tb) {
  const ra = resumo(ta), rb = resumo(tb);
  if (!ra || !rb) return [!ra ? "  ação ausente na rodada A" : "  ação ausente na rodada B"];
  const out = [];
  out.campos = [];
  out.controlesSo = { A: [], B: [] };
  for (const k of Object.keys(ra)) {
    const a = ra[k], b = rb[k];
    if (Array.isArray(a)) {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        out.campos.push(k); out.push(`  ${k}:`); out.push(...difLista(a, b));
        if (k === "controles com manipulador visíveis") { out.controlesSo.A = a.filter(x => !b.includes(x)); out.controlesSo.B = b.filter(x => !a.includes(x)); }
      }
    } else if (a !== b) {
      // contagem de elementos com manipulador: já explicada pela lista de controles; só conta como campo se o resto da contagem mudou
      if (k === "contagens") { const ca = JSON.parse(a), cb = JSON.parse(b); delete ca.comManipulador; delete cb.comManipulador; if (JSON.stringify(ca) !== JSON.stringify(cb)) out.campos.push(k); }
      else out.campos.push(k);
      if (k === "texto visível") { out.push(`  ${k} (${a.length} × ${b.length} caracteres):`); out.push(...difTexto(a, b)); }
      else out.push(`  ${k}: A=${JSON.stringify(a).slice(0, 200)} | B=${JSON.stringify(b).slice(0, 200)}`);
    }
  }
  return out;
}

// compara duas rodadas inteiras sobre o mesmo plano
function compararRodadas(plano, A, B, opcoes = {}) {
  const linhas = [];
  let iguais = 0, diferentes = 0, soEstrutura = 0;
  const divergentes = [], inconclusivas = [];
  // controle que aparece sem (ou com a mais) manipulador numa tela: costuma se repetir em todas as telas onde ele aparece — vai num resumo só
  const controlesSoA = new Map(), controlesSoB = new Map();
  for (const acao of plano) {
    // a ORIGINAL caiu por falha do equipamento (tempo do protocolo, página travada): não há com o que comparar — não é
    // igual nem divergência, é inconclusiva (vai na lista de falhas). Só a NOVA cair continua sendo divergência: pode ser regressão.
    if ((A[acao.id] || {}).falhaDoEquipamento) { inconclusivas.push(acao.id); continue; }
    const d = compararAcao(A[acao.id], B[acao.id]);
    if (d.length === 0) { iguais++; continue; }
    diferentes++;
    divergentes.push(acao.id);
    for (const c of (d.controlesSo || {}).A || []) controlesSoA.set(c, (controlesSoA.get(c) || []).concat(acao.id));
    for (const c of (d.controlesSo || {}).B || []) controlesSoB.set(c, (controlesSoB.get(c) || []).concat(acao.id));
    if (d.campos && d.campos.every(k => k === "controles com manipulador visíveis")) { soEstrutura++; continue; }
    const t = A[acao.id] || B[acao.id];
    linhas.push(`● ${acao.id} — ${t.alvo}${acao.codigo ? "  [original: on" + acao.evento + "=\"" + String(acao.codigo).slice(0, 90) + "\"]" : ""}`);
    if (t.caminho && t.caminho.length) linhas.push(`  caminho: ${t.caminho.join(" → ")}`);
    linhas.push(...d.filter(x => true));
  }
  if (controlesSoA.size || controlesSoB.size) {
    linhas.unshift("");
    for (const [c, ids] of controlesSoB) linhas.unshift(`  + com manipulador só na B: ${c} — visto em ${ids.length} tela(s), ex.: ${ids.slice(0, 3).join(", ")}`);
    for (const [c, ids] of controlesSoA) linhas.unshift(`  - com manipulador só na A (perdeu na B): ${c} — visto em ${ids.length} tela(s), ex.: ${ids.slice(0, 3).join(", ")}`);
    linhas.unshift(`CONTROLES QUE MUDARAM DE MANIPULADOR (${soEstrutura} ação(ões) diferem só por isso e não são repetidas abaixo):`);
  }
  // CSP: a rodada B (nova, com CSP) não pode ter nenhuma violação; a A também não (sem CSP não há como)
  const violacoes = [];
  for (const acao of plano) for (const [rot, T] of [["A", A], ["B", B]]) for (const v of ((T[acao.id] || {}).csp || [])) violacoes.push(`${rot} ${acao.id} ${(T[acao.id] || {}).alvo}: ${v.diretiva} bloqueou ${v.bloqueado || "(inline)"} ${v.amostra ? "«" + v.amostra + "»" : ""} ${v.fonte || ""}:${v.linha || ""}`);
  // violações fora do passo gravado (na entrada ou no caminho até o controle): uma linha por violação distinta
  const jaVistas = new Set();
  for (const acao of plano) for (const [rot, T] of [["A", A], ["B", B]]) for (const v of ((T[acao.id] || {}).cspTotal || [])) {
    if (jaVistas.has(rot + v)) continue;
    jaVistas.add(rot + v);
    violacoes.push(`${rot} (entrada/caminho, 1ª vez em ${acao.id}): ${v}`);
  }
  // a janela de impressão (about:blank aberta pelo app) herda a CSP da página: script ou manipulador em linha no HTML escrito não rodaria
  for (const acao of plano) for (const j of ((B[acao.id] || {}).janelas || [])) if (j.temInline) violacoes.push(`B ${acao.id} ${(B[acao.id] || {}).alvo}: janela "${j.inicio.slice(0, 60)}" tem <script> ou on*= no HTML escrito (herda a CSP e não rodaria)`);
  const instaveis = plano.filter(a => ((A[a.id] || {}).instavel || 0) + ((B[a.id] || {}).instavel || 0) > 0).map(a => a.id);
  const falhas = plano.filter(a => (A[a.id] || {}).falhaDoEquipamento || (B[a.id] || {}).falhaDoEquipamento).map(a => `${a.id}: ${(A[a.id] || {}).falhaDoEquipamento || ""} | ${(B[a.id] || {}).falhaDoEquipamento || ""}`);
  return { iguais, diferentes, soEstrutura, divergentes, linhas, violacoes, instaveis, falhas, inconclusivas };
}

module.exports = { compararAcao, compararRodadas, resumo };

if (require.main === module) {
  // node comparar.js plano.json transcritosA.json transcritosB.json
  const [p, a, b] = process.argv.slice(2);
  const plano = JSON.parse(fs.readFileSync(p, "utf8")).plano;
  const r = compararRodadas(plano, JSON.parse(fs.readFileSync(a, "utf8")).transcritos, JSON.parse(fs.readFileSync(b, "utf8")).transcritos);
  console.log(r.linhas.join("\n"));
  console.log(`\niguais ${r.iguais}, diferentes ${r.diferentes}, violações de CSP ${r.violacoes.length}, instáveis ${r.instaveis.length}, falhas do equipamento ${r.falhas.length}`);
}
