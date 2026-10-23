// mutacoes.js — desfaz, uma a uma, as garantias da tela da v7.14 (Identidade Visual e Meu Painel → Votações): o escape de cada campo que vem do servidor, a urlSegura da imagem,
// a conferência da cor (#RRGGBB) antes do estilo, as validações antes de qualquer pedido (texto vazio, arquivo, tipo, tamanho, critério, motivo, campos do resultado), a
// confirmação do voto e o voto só na opção marcada, a trava de duplo clique, o 428 com a nova tentativa, o prazo de 20 s, as travas de resposta atrasada, a limpeza ao sair
// da aba, da sub-aba e da sessão (e as ligações com o script.js e o meus-dados.js), o dono da tela e as pílulas da Diretoria. Cada mutação TEM de ser acusada (pelo menos
// uma falha no roteiro); uma que escapa mostra um buraco no roteiro. Âncora que não casa exatamente uma vez = "INAPLICÁVEL", também reprovada.
//   node mutacoes.js              roda tudo, UMA mutação por vez, cada uma num processo novo (nunca em paralelo)
//   node mutacoes.js <filtro>     só as mutações cujo nome contém o filtro
//   node mutacoes.js --conferir   só confere se cada âncora casa exatamente uma vez (sem rodar o roteiro)
//   node mutacoes.js --listar     lista as mutações
// Segurança da máquina (incidente de 19/10/2026, ver tools/front-cuidado/mutacoes.js): cada mutação num processo novo, com teto de memória do V8 e uma cerca de memória fora
// do monte; o pai mata o filho que passar de 120 s; um processo por vez. O processo que morre pelo teto ou pelo tempo conta como ACUSADA.
"use strict";
const { fork } = require("child_process");
const { lerApp } = require("./ambiente");

const I = "modulos/identidade-visual.js", E = "modulos/enquetes.js", S = "script.js", D = "modulos/meus-dados.js";
const TETO_MEMORIA = ["--max-old-space-size=2048"];
const PAREDE_MS = 120000;
const TRAVOU_MS = 90000;

// ------------------------------------------------------------ (1) gerados do código: cada escaparHtmlEbd(...) vira só (...)
function contextoUnico(codigo, ini, fim) {
  let a = ini, b = fim;
  for (let k = 0; k < 80; k++) {
    if (codigo.split(codigo.slice(a, b)).length - 1 === 1) return [a, b];
    a = Math.max(0, a - 10); b = Math.min(codigo.length, b + 10);
  }
  throw new Error(`contexto não único na posição ${ini}`);
}
const linhaDe = (codigo, pos) => codigo.slice(0, pos).split("\n").length;
function gerarEscapes(arquivo, desde) {
  const codigo = lerApp(arquivo);
  const out = [], marca = "escaparHtmlEbd(";
  let pos = desde ? codigo.indexOf(desde) : 0;
  while ((pos = codigo.indexOf(marca, pos)) >= 0) {
    let nivel = 0, j = pos + marca.length - 1;
    for (; j < codigo.length; j++) { const ch = codigo[j]; if (ch === "(") nivel++; else if (ch === ")") { nivel--; if (nivel === 0) break; } }
    const arg = codigo.slice(pos + marca.length, j);
    const [a, b] = contextoUnico(codigo, pos, j + 1);
    const de = codigo.slice(a, b), para = codigo.slice(a, pos) + "(" + arg + ")" + codigo.slice(j + 1, b);
    out.push([`escape ${arquivo.replace("modulos/", "")}:${linhaDe(codigo, pos)}: ${codigo.slice(pos, j + 1).slice(0, 70)}`, arquivo, de, para]);
    pos = j + 1;
  }
  return out;
}
// as que escapam de propósito: texto que nunca vem de fora, ou defesa em dupla camada
const EQUIVALENTES_CONHECIDAS = [
  [/escaparHtmlEbd\(IDV_ROTULO_FASE\[f\]\)/, "rótulo constante da própria tela"],
  [/escaparHtmlEbd\(IDV_ROTULO_APURACAO\[c\.apuracao\] \|\| "A votação/, "rótulo constante da própria tela (o código desconhecido cai numa frase fixa)"],
  [/escaparHtmlEbd\(hex\)/, "a cor só chega aqui depois de conferida (#RRGGBB) por idvCor"],
  [/escaparHtmlEbd\(o\.codigo\)/, "o código da ocasião só passa pelo filtro /^[A-Z_]{2,30}$/ do catálogo"],
  [/escaparHtmlEbd\(typeof calData(Hora)? === "function"/, "calData/calDataHora já devolvem a data formatada ou passam por formatarDataEbd, que escapa (dupla camada)"]
];
const equivalenteConhecido = (nome) => EQUIVALENTES_CONHECIDAS.find(([re]) => re.test(nome)) || null;

// ------------------------------------------------------------ (2) escritas à mão
const MANUAIS = [
  // a imagem, a cor e o estilo
  ["imagem: sem urlSegura no src", I, "src=\"${urlSegura(data.url)}\"", "src=\"${data.url}\""],
  ["cor: sem a conferência #RRGGBB", I, "return IDV_HEX.test(h) ? h : null; }", "return h || null; }"],
  ["cor: o hex do formulário vai como foi digitado", I, "const hex = idvCor(idvValor(\"idvCorHex\"));", "const hex = idvValor(\"idvCorHex\");"],
  // validações antes do pedido
  ["sugestão: vazio vai ao servidor", I, "if (!texto) { idvEscrever(\"idvMeuMsg\", \"Escreva o tema antes de mandar.\", true); return; }", ""],
  ["arte: sem arquivo vai ao servidor", I, "if (!arquivo) { idvEscrever(\"idvMeuMsg\", \"Escolha a imagem da arte.\", true); return; }", "if (!arquivo) return;"],
  ["arte: tipo não conferido", I, "if (!IDV_TIPOS_IMAGEM.includes(arquivo.type)) { idvEscrever(\"idvMeuMsg\", \"A arte tem de ser uma imagem PNG ou JPEG.\", true); return; }", ""],
  ["arte: tamanho não conferido", I, "if (!(arquivo.size > 0) || arquivo.size > max) {", "if (false) {"],
  ["arte: a imagem não vai em base64", I, "try { imagemBase64 = await idvBase64(arquivo); }", "try { imagemBase64 = \"\"; }"],
  ["triagem: descarte sem critério vai ao servidor", I, "if (!criterio) { idvEscrever(\"idvCicloMsg\", \"Escolha o critério do descarte.\", true); return; }", ""],
  ["triagem: o ajuste da redação não vai", I, "if (t) corpo.textoAjustado = t;", ""],
  ["desempate: motivo curto vai ao servidor", I, "if (motivo.length < 5) {", "if (false) {"],
  ["desempate: oferece todos os finalistas, não só os empatados", I, "(Number(o.votos) || 0) === maior);", "true);"],
  ["resultado: sem arte e cor vai ao servidor", I, "if (!arteId || !corId) { idvEscrever(\"idvCicloMsg\", \"Escolha a arte e a cor.\", true); return; }", ""],
  ["arte da Diretoria: motivo curto vai ao servidor", I, "if (motivo.length < 3) {", "if (false) {"],
  // o voto
  ["voto: sem confirmação", I, "if (!(await confirmarAcao(`Confirmar o voto em \"${escolhida.texto}\"? O voto não se muda depois.`, \"Votar\"))) return;", ""],
  ["voto: vai sempre para a primeira opção", I, "opcaoId: idvInteiro(escolhida.opcaoId) }] })", "opcaoId: idvInteiro(v.opcoes[0].opcaoId) }] })"],
  ["voto: nada marcado vai ao servidor", I, "if (!escolhida) { idvEscrever(\"idvMeuMsg\", \"Escolha um dos temas antes de votar.\", true); return; }", "if (!escolhida) return;"],
  ["Meu Painel: formulários para quem não é apto", I, "const form = !d.apto ? \"\" : ativas >= max", "const form = ativas >= max"],
  // duplo clique, 428, prazo
  ["duplo clique: a chave em curso não barra", I, "if (idvEmCurso.has(chave)) { mostrarToast(\"Aguarde: o pedido anterior ainda está sendo processado.\", \"erro\"); return undefined; }", ""],
  ["duplo clique: o botão não desabilita", I, "  if (botao && typeof botao === \"object\") botao.disabled = true;\n  try { return await tarefa(); }", "  try { return await tarefa(); }"],
  ["428: sem a confirmação reforçada e a nova tentativa", I, "if (r.res.status === 428) { const ok = await confirmarFatorAgora(); if (ok) r = await idvTentar(url, opcoes); }", ""],
  ["prazo de 20 s: some", I, "const limite = controle ? setTimeout(() => controle.abort(), IDV_TEMPO_LIMITE_MS) : null;", "const limite = null;"],
  ["403: dois avisos (o do fetchProtegido e o da tela)", I, "if (!(data && data.jaAvisado)) mostrarToast(texto, falhou ? \"erro\" : \"sucesso\");", "mostrarToast(texto, falhou ? \"erro\" : \"sucesso\");"],
  // acesso
  ["Diretoria: sem gestão abre o conteúdo", I, "if (!cat.gestao) { idvMostrar(\"idvSemAcesso\", true); idvMostrar(\"idvConteudo\", false); return; }", ""],
  ["Diretoria: as pílulas à vista sem acesso", I, "idvMostrarPilulas(!!(cat && cat.gestao));", "idvMostrarPilulas(true);"],
  // respostas atrasadas, dono, limpeza
  ["atrasada: o Meu Painel que chega depois", I, "if (seq !== idvSeqMeu || !idvViva(marca)) return;", "if (false) return;"],
  ["atrasada: o painel que chega depois", I, "if (seq !== idvSeqGes || !idvViva(marca)) return;\n  if (data.sucesso === false || !Array.isArray(data.ciclos))", "if (false) return;\n  if (data.sucesso === false || !Array.isArray(data.ciclos))"],
  ["atrasada: o ciclo pedido antes vence o último", I, "if (seq !== idvSeqCiclo || !idvViva(marca)) return;", "if (false) return;"],
  ["atrasada: o catálogo de antes da saída fica", I, "if (geracao !== idvGeracao) return idvCat;", ""],
  ["atrasada: a imagem que chega depois", I, "  if (!idvViva(marca)) return;\n  const el = idvEl(destino);", "  const el = idvEl(destino);"],
  ["atrasada: o ato (retirar) que termina depois de sair", I, "    const data = await idvPostar(\"retirar-sugestao\", { sugestaoId: id });\n    if (!idvViva(marca)) return;", "    const data = await idvPostar(\"retirar-sugestao\", { sugestaoId: id });"],
  ["dono: a troca de login não limpa a tela", I, "if (idvDono !== idvChaveDoDono()) { idvLimparTela(); idvDono = idvChaveDoDono(); }", "idvDono = idvChaveDoDono();"],
  ["saída: idvLimparTela não fecha o Meu Painel", I, "  idvFecharMeu(); idvFecharGestao();\n", "  idvFecharGestao();\n"],
  ["saída: a aba não esvazia o detalhe do ciclo", I, "[\"idvPainelTopo\", \"idvCicloDetalhe\", \"idvTemasForm\", \"idvTemasLista\"].forEach", "[\"idvPainelTopo\", \"idvTemasForm\", \"idvTemasLista\"].forEach"],
  ["saída: idvFecharMeu não esquece a pessoa", I, "  idvMeu = null;\n", ""],
  ["saída da sub-aba: não limpa", I, "function idvSubAbaMudou(sub) { if (sub !== \"identidade\") idvFecharMeu(); }", "function idvSubAbaMudou(sub) { }"],
  ["saída da aba: não limpa a Diretoria", I, "  if (aba !== \"identidade\") idvFecharGestao();\n", ""],
  ["encerrado: a imagem escolhida não é pedida", I, "  if (c.fase === \"ENCERRADO\" && d.resultado && idvInteiro(d.resultado.arteId)) idvMostrarImagem(", "  if (false) idvMostrarImagem("],
  // Meu Painel → Votações (enquetes.js)
  ["Votações: sem a trava da troca de login", E, "if (geracao !== enqMeuGeracao || !enqMeuVisivel()) return;", "if (!enqMeuVisivel()) return;"],
  ["Votações: sem o prazo de 20 s", E, "const limite = controle ? setTimeout(() => controle.abort(), ENQ_MEU_TEMPO_MS) : null;", "const limite = null;"],
  ["Votações: a lista que chega depois", E, "if (seq !== enqMeuSeq || !enqMeuVisivel()) return;", "if (false) return;"],
  ["Votações: opção que falta vai ao servidor", E, "if (!o) { if (msg) msg.textContent = `Responda: \"${p.titulo}\".`; return; }", "if (!o) continue;"],
  ["Votações: texto que falta vai ao servidor", E, "if (!texto) { if (msg) msg.textContent = `Responda: \"${p.titulo}\".`; return; }", ""],
  ["Votações: sem confirmação", E, "if (!(await confirmarAcao(\"Enviar a sua resposta? Ela não se muda depois.\", \"Enviar\"))) return;", ""],
  ["Votações: o botão não desabilita", E, "  if (botao && typeof botao === \"object\") botao.disabled = true;\n  const geracao", "  const geracao"],
  ["Votações: sair da sub-aba não limpa", E, "function enqSubAbaMudou(sub) { if (sub !== \"votacoes\") enqLimparMeu(); }", "function enqSubAbaMudou(sub) { }"],
  ["Votações: a limpeza não esvazia a lista", E, "  enqMeuLista = [];\n  const el = document.getElementById(\"enqMeuLista\"); if (el) el.innerHTML = \"\";", "  enqMeuLista = [];"],
  ["enquete: o fechamento não vai", E, "vinculante, quorumTipo: vinculante ? quorumTipo : undefined, dataFechamentoPrevista", "vinculante, quorumTipo: vinculante ? quorumTipo : undefined"],
  ["enquete: o campo do fechamento não limpa", E, "    if (campoFechamento) campoFechamento.value = \"\";\n", ""],
  // as ligações com a navegação
  ["script.js: limparSessao sem idvLimparTela", S, "  if (typeof idvLimparTela === \"function\") idvLimparTela();\n", ""],
  ["script.js: limparSessao sem enqLimparMeu", S, "  if (typeof enqLimparMeu === \"function\") enqLimparMeu();\n", ""],
  ["script.js: a sub-aba não avisa o módulo", S, "  if (typeof idvSubAbaMudou === \"function\") idvSubAbaMudou(sub);", ""],
  ["script.js: a sub-aba não avisa Votações", S, "  if (typeof enqSubAbaMudou === \"function\") enqSubAbaMudou(sub);\n", ""],
  ["meus-dados.js: a aba não avisa o módulo", D, "  if (typeof idvAbaMudou === \"function\") idvAbaMudou(aba);", ""]
];

// ------------------------------------------------------------ monta a lista
function montarLista() {
  const geradas = [...gerarEscapes(I), ...gerarEscapes(E, "MEU PAINEL → VOTAÇÕES (v7.14)")];
  const vistos = new Map();
  for (const m of geradas) { const n = (vistos.get(m[0]) || 0) + 1; vistos.set(m[0], n); if (n > 1) m[0] = `${m[0]} (${n}ª)`; }
  return [...MANUAIS, ...geradas];
}

// ------------------------------------------------------------ execução
async function executarUma(m) {
  const { rodar } = require("./roteiro");
  let T;
  try { T = await Promise.race([rodar({ mutar: { [m[1]]: [[m[2], m[3]]] } }), new Promise((_, rej) => setTimeout(() => rej(new Error("TRAVOU (mais de 90 s)")), TRAVOU_MS))]); }
  catch (e) { return /^TRAVOU/.test(e.message) ? { nome: m[0], estado: "ACUSADA", detalhe: "o roteiro não termina (travou)", n: 1 } : { nome: m[0], estado: "INAPLICAVEL", detalhe: e.message.slice(0, 160) }; }
  if (T.falhas.some(f => /mutação inaplicável/.test(f))) return { nome: m[0], estado: "INAPLICAVEL", detalhe: T.falhas.find(f => /mutação inaplicável/.test(f)).slice(0, 160) };
  if (T.falhas.length) return { nome: m[0], estado: "ACUSADA", detalhe: T.falhas[0].slice(0, 120), n: T.falhas.length };
  return { nome: m[0], estado: "ESCAPOU" };
}
function filho(env, aoMensagem) {
  return new Promise((ok) => {
    const f = fork(__filename, [], { execArgv: TETO_MEMORIA, env: Object.assign({}, process.env, env) });
    const paredeDura = setTimeout(() => { try { f.kill(); } catch { /* já saiu */ } }, PAREDE_MS);
    f.on("message", aoMensagem);
    f.on("exit", (codigo) => { clearTimeout(paredeDura); ok(codigo); });
  });
}

if (process.env.IDV_SO_BASE) {
  (async () => { const T = await require("./roteiro").rodar({}); process.send({ total: T.total, falhas: T.falhas }, () => process.exit(0)); })();
} else if (process.env.IDV_MUT_INDICE) {
  const lista = montarLista();
  const vivo = setInterval(() => {}, 1000);
  setInterval(() => { if (process.memoryUsage().rss > 2.4e9) process.exit(97); }, 500).unref();
  (async () => {
    const i = Number(process.env.IDV_MUT_INDICE);
    const r = await executarUma(lista[i]);
    clearInterval(vivo);
    process.send({ i, r }, () => process.exit(0));
  })();
} else {
  (async () => {
    const args = process.argv.slice(2);
    const filtro = args.find(a => !a.startsWith("--")) || "";
    const todas = montarLista();
    const indices = todas.map((m, i) => i).filter(i => todas[i][0].includes(filtro));
    const nomes = todas.map(m => m[0]);
    const repetidos = nomes.filter((n, i) => nomes.indexOf(n) !== i);
    if (repetidos.length) { console.log(`nomes de mutação repetidos: ${[...new Set(repetidos)].join(" | ")}`); process.exit(2); }
    if (args.includes("--listar")) { indices.forEach(i => console.log(`${i}\t${todas[i][0]}`)); process.exit(0); }
    if (args.includes("--conferir")) {
      let ruins = 0;
      for (const i of indices) { const n = lerApp(todas[i][1]).split(todas[i][2]).length - 1; if (n !== 1) { ruins++; console.log(`âncora com ${n} ocorrência(s): ${todas[i][0]}`); } }
      console.log(`${indices.length} mutações (${MANUAIS.length} à mão, ${todas.length - MANUAIS.length} geradas), ${ruins} âncora(s) que não casam exatamente uma vez`);
      process.exit(ruins ? 1 : 0);
    }
    let base = null;
    await filho({ IDV_SO_BASE: "1" }, (m) => { base = m; });
    base = base || { total: 0, falhas: ["a rodada sem mutação não terminou (processo encerrado)"] };
    console.log(`base (sem mutação): ${base.total} verificações, ${base.falhas.length} falhas`);
    if (base.falhas.length) { base.falhas.forEach(f => console.log("  ✗ " + f)); process.exit(2); }
    const resultados = new Map();
    const t0 = Date.now();
    for (const [k, i] of indices.entries()) {
      await filho({ IDV_MUT_INDICE: String(i) }, ({ r }) => { resultados.set(i, r); });
      if (!resultados.has(i)) resultados.set(i, { nome: todas[i][0], estado: "ACUSADA", detalhe: "o roteiro estourou a memória ou o tempo (processo encerrado)", n: 1 });
      const r = resultados.get(i);
      const rot = r.estado === "ACUSADA" ? `acusada (${String(r.n).padStart(2)})` : r.estado === "ESCAPOU" ? "ESCAPOU     " : "INAPLICÁVEL ";
      console.log(`[${k + 1}/${indices.length} ${Math.round((Date.now() - t0) / 1000)}s] ${rot} ${r.nome}${r.detalhe ? "  <-  " + r.detalhe : ""}`);
    }
    const rs = indices.map(i => resultados.get(i)).filter(Boolean);
    const acusadas = rs.filter(r => r.estado === "ACUSADA").length, todasQueEscaparam = rs.filter(r => r.estado === "ESCAPOU"), inaplicaveis = rs.filter(r => r.estado === "INAPLICAVEL");
    const equivalentes = todasQueEscaparam.filter(r => equivalenteConhecido(r.nome)), escaparam = todasQueEscaparam.filter(r => !equivalenteConhecido(r.nome));
    console.log(`\nmutações: ${indices.length} · acusadas: ${acusadas} · escaparam: ${escaparam.length} · equivalentes conhecidas: ${equivalentes.length} · inaplicáveis: ${inaplicaveis.length}`);
    equivalentes.forEach(r => console.log(`  EQUIVALENTE: ${r.nome}  (${equivalenteConhecido(r.nome)[1]})`));
    escaparam.forEach(r => console.log("  ESCAPOU: " + r.nome));
    inaplicaveis.forEach(r => console.log("  INAPLICÁVEL: " + r.nome + " :: " + r.detalhe));
    process.exit(escaparam.length || inaplicaveis.length ? 1 : 0);
  })();
}
