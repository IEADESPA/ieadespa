// roteiro.js — prova da tela da v8.6 (Educação continuada) sem navegador: o index.html de verdade, o eventos.js e o modulos/educacao-continuada.js inteiros, num DOM
// simulado (tools/front-cuidado/ambiente.js). As respostas do servidor vêm de contrato-real.json — gravado pelo e2e-64 com os handlers e o banco REAIS
// (`E2E_CONTRATO=1 BASE=cenario-escada bash rodar.sh roteiro e2e-64-educacao-continuada.js` em tools/e2e-localdb) — com texto de ataque em todo campo de texto.
// Rodar: node roteiro.js (da pasta tools/front-educacao). MUTAR=1 roda também as mutações (cada uma precisa ser acusada).
"use strict";
const { criarAmbiente, lerApp } = require("../front-cuidado/ambiente");
const REAL = require("./contrato-real.json");

const ATAQUE = '<img src=x onerror="__xss(1)">';
let total = 0, falhas = 0;
const ok = (c, d, det) => { total++; if (!c) { falhas++; if (!process.env.CALADO) console.log(`  ✗ ${d}${det !== undefined ? ` — ${JSON.stringify(det).slice(0, 300)}` : ""}`); } else if (process.env.LISTA) console.log(`  ✓ ${d}`); };

// (os resultados, os tipos e as datas são códigos que o servidor só aceita de uma lista fechada ou no formato AAAA-MM-DD — então não carregam HTML)
const CAMPOS_TEXTO = ["nome", "congregacao", "pendencias", "resultadoRotulo", "tipoRotulo", "trilha", "codigo", "justificativa", "observacao", "mensagem",
  "APROVADO", "REPROVADO", "AUSENTE", "AUSENTE_JUSTIFICADO"];
function envenenar(v, chave) {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" && CAMPOS_TEXTO.includes(chave) ? `${x} ${ATAQUE}` : envenenar(x)));
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = envenenar(x, k); return o; }
  if (typeof v === "string" && CAMPOS_TEXTO.includes(chave)) return `${v} ${ATAQUE}`;
  return v;
}
const R = envenenar(REAL);
// um certificado verificável na trilha (o e2e grava a trilha sem certificado emitido): o código também passa pelo escape
R.pessoa.trilhas = R.pessoa.trilhas.map((t) => ({ ...t, codigo: `ABCD-1234 ${ATAQUE}` }));
var MUTADO = null;

function montar({ geral = true, membro = false } = {}) {
  const amb = criarAmbiente({ semModulo: true });
  amb.ev(MUTADO || lerApp("modulos/educacao-continuada.js"), "educacao-continuada.js");
  amb.sessao({ matricula: 1002, token: "tok", pin: membro, nivel: geral ? "GLOBAL" : "CONGREGACAO", permissoes: ["afm", "pessoas"], geral });
  amb.__respostas = {};
  amb.api.servidor = (c) => {
    if (amb.__respostas[c.chave]) return amb.__respostas[c.chave];
    if (c.chave === "GET educacao-continuada/painel") return { corpo: R.painel };
    if (c.chave === "GET educacao-continuada/edicao") return { corpo: R.edicao };
    if (c.chave === "GET educacao-continuada/exame") return { corpo: R.exame };
    if (c.chave === "GET educacao-continuada/pessoa") return { corpo: R.pessoa };
    if (c.chave === "GET educacao-continuada/minha") return { corpo: R.minha };
    if (c.metodo === "POST" && /resultados-/.test(c.caminho)) return { status: 200, corpo: { sucesso: true, mensagem: `Resultados gravados ${ATAQUE}`, resultados: c.corpo.itens.map((i) => ({ membroId: i.membroId, sucesso: true })) } };
    if (c.metodo === "POST") return { status: 200, corpo: { sucesso: true, mensagem: `Salvo ${ATAQUE}` } };
    return null;
  };
  return amb;
}
const semAtaque = (amb, onde) => ok(amb.ctx.__xss.chamadas.length === 0 && amb.doc._ataques.length === 0, `${onde}: nenhum texto do servidor virou código`, { xss: amb.ctx.__xss.chamadas, ataques: amb.doc._ataques.slice(0, 3) });
const todos = (amb, raizId) => { const raiz = amb.e(raizId); return raiz ? [...raiz.descendentes()] : []; };
const botoes = (amb, raizId, acao) => todos(amb, raizId).filter((b) => b.getAttribute("data-on-click") === acao);
const args = (b) => JSON.parse(b.getAttribute("data-args-click") || "[]");
const posts = (amb, caminho) => amb.api.chamadas.filter((c) => c.metodo === "POST" && c.caminho === caminho);
const gets = (amb, caminho) => amb.api.chamadas.filter((c) => c.metodo === "GET" && c.caminho === caminho);
const obreiros = REAL.painel.pessoas.filter((p) => p.obreiro);

async function prova() {
  total = 0; falhas = 0;
  console.log("== contrato real ==");
  for (const k of ["painel", "edicao", "exame", "pessoa", "minha", "minhaVazia"]) ok(REAL[k] && REAL[k].sucesso, `o e2e-64 gravou a resposta real de ${k}`);
  ok(["edicoes", "exames", "pessoas", "resultados", "resultadosExame"].every((k) => k in REAL.painel), "painel: as listas que a tela lê");
  ok(REAL.painel.edicoes.every((e) => ["edicaoId", "ano", "data", "cargaHoraria", "frequenciaMinimaPct", "horasMinimas", "aprovados", "registrados"].every((k) => k in e)), "edições: os campos que a tela lê");
  ok(REAL.painel.exames.every((e) => ["exameId", "tipo", "tipoRotulo", "data", "aprovados", "registrados"].every((k) => k in e)) && REAL.painel.exames.some((e) => e.tipo === "REPESCAGEM"), "exames: os campos, e uma repescagem");
  ok(REAL.painel.pessoas.every((p) => ["membroId", "nome", "congregacao", "obreiro", "situacao"].every((k) => k in p)) && REAL.painel.pessoas.some((p) => !p.obreiro), "pessoas: os campos, e alguém da Câmara que não é obreiro (só faz o exame)");
  ok(REAL.edicao.itens.every((i) => ["membroId", "horasPresentes", "resultado"].every((k) => k in i)) && REAL.exame.itens.some((i) => i.justificativa), "os lançamentos já gravados (com uma justificativa de verdade)");
  ok(["situacao", "reciclagens", "exames", "trilhas"].every((k) => k in REAL.pessoa) && REAL.pessoa.trilhas.length === 1 && REAL.pessoa.exames.every((e) => e.justificativa === undefined), "o perfil: a trilha concluída e nenhum texto de justificativa");
  ok(REAL.minha.exames.some((e) => e.justificativa) && REAL.minha.obreiro === true && REAL.minhaVazia.reciclagens.length === 0 && REAL.minhaVazia.obreiro === false, "a minha: com a justificativa; e a de quem não é obreiro e não tem nada");
  ok(REAL.painel.edicaoDoAno && REAL.painel.pessoas.some((p) => p.semAprovacaoNoAno), "o painel: a edição do ano e quem ainda não foi aprovado nela");
  // fora do módulo: o Meu Painel e a Academia (revisão)
  ok(/agora\.funcao === "SOB_OBSERVACAO" \? "habilitado\(a\) para oficiar, sob observação/.test(lerApp("modulos/meu-painel.js")), "a credencial no Meu Painel: 'sob observação' continua oficiando");
  ok(/function afmLimparTela\(\) \{[^}]*afmSecaoAtual = "matriculas"/.test(lerApp("modulos/afm.js")), "a saída fecha a seção só do nível geral da Academia");

  console.log("== a Academia (nível geral): o painel ==");
  let amb = montar();
  await amb.g("edcCarregarPainelAcao")();
  await amb.ocioso();
  const pend = amb.e("edcPendentes").textContent;
  const pendentes = REAL.painel.pessoas.filter((p) => p.situacao.pendencias.length);
  ok(pendentes.every((p) => pend.includes(p.nome)) && !REAL.painel.pessoas.filter((p) => !p.situacao.pendencias.length).some((p) => pend.includes(`${p.nome} `)), "quem está pendente, e só ele", pend.slice(0, 200));
  ok(/Art\. 68 §3º/.test(pend) && /Art\. 70 §3º/.test(pend), "com o motivo de cada um");
  const ano = amb.e("edcPendentesAno").textContent;
  const faltamNoAno = REAL.painel.pessoas.filter((p) => p.semAprovacaoNoAno);
  ok(new RegExp(`reciclagem de ${REAL.painel.edicaoDoAno.ano} \\(${faltamNoAno.length}\\)`).test(ano) && faltamNoAno.every((p) => ano.includes(p.nome)), "quem ainda não foi aprovado na reciclagem do ano, com o nome", ano.slice(0, 200));
  const lista = amb.e("edcListaEdicoes").textContent;
  ok(REAL.painel.edicoes.every((e) => lista.includes(String(e.ano)) && lista.includes(`${e.horasMinimas} h (${e.frequenciaMinimaPct}%)`)), "as edições com o mínimo de horas para aprovar", lista.slice(0, 200));
  const origem = amb.e("edcExameOrigem").options.map((o) => o.value).filter(Boolean);
  ok(origem.length === REAL.painel.exames.filter((x) => x.tipo === "BIENAL").length && origem.every((v) => REAL.painel.exames.find((x) => String(x.exameId) === v).tipo === "BIENAL"), "a repescagem só escolhe um exame bienal", origem);
  semAtaque(amb, "painel");

  console.log("== registrar a reciclagem e o exame ==");
  amb.limparRegistro();
  amb.e("edcEdicaoData").value = "2026-08-15"; amb.e("edcEdicaoCarga").value = "20,5"; amb.e("edcEdicaoFreq").value = "80"; amb.e("edcEdicaoObs").value = "Templo Central";
  const salvar = todos(amb, "afmSecaoEducacao").find((b) => b.getAttribute("data-on-click") === "edcSalvarEdicaoAcao");
  amb.doc.clicar(salvar); amb.doc.clicar(salvar);
  await amb.ocioso();
  const pe = posts(amb, "educacao-continuada/edicao");
  ok(pe.length === 1 && pe[0].corpo.data === "2026-08-15" && pe[0].corpo.cargaHoraria === "20,5" && pe[0].corpo.frequenciaMinimaPct === 80 && pe[0].corpo.observacao === "Templo Central", "o duplo clique envia uma vez, com os campos", pe.map((p) => p.corpo));
  ok(gets(amb, "educacao-continuada/painel").length === 1, "e o painel recarrega");
  ok(amb.e("edcGrupoOrigem").hidden, "o exame bienal não pede a origem");
  amb.doc.escolher(amb.e("edcExameTipo"), "REPESCAGEM");
  ok(!amb.e("edcGrupoOrigem").hidden, "a repescagem pede de qual bienal");
  amb.e("edcExameOrigem").value = origem[0]; amb.e("edcExameData").value = "2026-02-20";
  amb.doc.clicar(todos(amb, "afmSecaoEducacao").find((b) => b.getAttribute("data-on-click") === "edcSalvarExameAcao"));
  await amb.ocioso();
  const px = posts(amb, "educacao-continuada/exame")[0];
  ok(px && px.corpo.tipo === "REPESCAGEM" && px.corpo.exameOrigemId === Number(origem[0]) && px.corpo.data === "2026-02-20", "a repescagem vai com o bienal de origem", px && px.corpo);
  amb.doc.escolher(amb.e("edcExameTipo"), "BIENAL");
  amb.doc.clicar(todos(amb, "afmSecaoEducacao").find((b) => b.getAttribute("data-on-click") === "edcSalvarExameAcao"));
  await amb.ocioso();
  ok(posts(amb, "educacao-continuada/exame")[1].corpo.exameOrigemId === null, "o bienal vai sem origem (mesmo com uma escolhida antes)");
  semAtaque(amb, "registrar");

  console.log("== lançar os resultados da reciclagem ==");
  amb = montar();
  await amb.g("edcCarregarPainelAcao")();
  await amb.ocioso();
  const edAno = REAL.painel.edicoes.find((e) => e.registrados > 0);
  const lancar = botoes(amb, "edcListaEdicoes", "edcLancarReciclagemAcao").find((b) => args(b)[0] === edAno.edicaoId);
  amb.doc.clicar(lancar);
  await amb.ocioso();
  ok(gets(amb, "educacao-continuada/edicao")[0].consulta.edicaoId === String(edAno.edicaoId), "pede os resultados daquela edição");
  const linhas = todos(amb, "edcLancamento").filter((x) => x.localName === "select").map((s) => s.id);
  ok(linhas.length === obreiros.length && obreiros.every((p) => linhas.includes(`edcRes_${p.membroId}`)), "só os obreiros na reciclagem (a Câmara que não é obreiro fica de fora)", [linhas.length, obreiros.length]);
  const ja = REAL.edicao.itens[0];
  ok(amb.e(`edcRes_${ja.membroId}`).value === ja.resultado && amb.e(`edcHoras_${ja.membroId}`).value === String(ja.horasPresentes), "o que já está gravado vem preenchido");
  ok(new RegExp(`mínimo para aprovar: ${edAno.horasMinimas} h`).test(amb.e("edcLancamento").textContent), "o título mostra o mínimo de horas");
  amb.limparRegistro();
  amb.doc.clicar(botoes(amb, "edcLancamento", "edcSalvarLancamentoAcao")[0]);
  await amb.ocioso();
  ok(posts(amb, "educacao-continuada/resultados-reciclagem").length === 0 && /Nada mudou/.test(amb.e("edcMsg").textContent), "sem mudança: nada vai ao servidor (a auditoria não repete)");
  const novo = obreiros.find((p) => !REAL.edicao.itens.some((i) => i.membroId === p.membroId));
  amb.doc.escolher(amb.e(`edcRes_${novo.membroId}`), "APROVADO"); amb.e(`edcHoras_${novo.membroId}`).value = "19";
  amb.e(`edcHoras_${ja.membroId}`).value = String(ja.horasPresentes + 1);
  amb.doc.clicar(botoes(amb, "edcLancamento", "edcSalvarLancamentoAcao")[0]);
  await amb.ocioso();
  const pr = posts(amb, "educacao-continuada/resultados-reciclagem");
  ok(pr.length === 1 && pr[0].corpo.edicaoId === edAno.edicaoId && pr[0].corpo.itens.length === 2, "só as duas linhas mexidas vão (a nova e a de horas corrigidas)", pr.map((p) => p.corpo));
  ok(pr[0].corpo.itens.some((i) => i.membroId === novo.membroId && i.resultado === "APROVADO" && i.horasPresentes === "19"), "com o resultado e as horas");
  ok(gets(amb, "educacao-continuada/painel").length === 1 && gets(amb, "educacao-continuada/edicao").length === 1, "e o painel e a tabela recarregam com o que ficou gravado");
  // a recusa de uma linha: o nome de quem e o motivo; ela volta com o que foi digitado, as outras gravam
  const outro = obreiros.find((p) => p.membroId !== novo.membroId && p.membroId !== ja.membroId);
  amb.__respostas["POST educacao-continuada/resultados-reciclagem"] = { corpo: { sucesso: true, mensagem: "1 de 2 gravado(s).", resultados: [{ membroId: novo.membroId, sucesso: false, mensagem: `Abaixo da frequência mínima ${ATAQUE}` }, { membroId: outro.membroId, sucesso: true }] } };
  amb.doc.escolher(amb.e(`edcRes_${novo.membroId}`), "APROVADO"); amb.e(`edcHoras_${novo.membroId}`).value = "7,5";
  amb.doc.escolher(amb.e(`edcRes_${outro.membroId}`), "AUSENTE");
  amb.doc.clicar(botoes(amb, "edcLancamento", "edcSalvarLancamentoAcao")[0]);
  await amb.ocioso();
  ok(amb.e("edcMsg").textContent.includes(novo.nome) && /frequência mínima/.test(amb.e("edcMsg").textContent) && /1 de 2 gravado/.test(amb.e("edcMsg").textContent), "a linha recusada aparece com o nome e o motivo", amb.e("edcMsg").textContent.slice(0, 150));
  ok(amb.e("edcMsgLancamento") && amb.e("edcMsgLancamento").textContent === amb.e("edcMsg").textContent, "e a mesma mensagem logo abaixo do 'Salvar resultados'");
  ok(amb.e(`edcRes_${novo.membroId}`).value === "APROVADO" && amb.e(`edcHoras_${novo.membroId}`).value === "7,5", "a tabela reabre e a linha recusada mantém o que foi digitado (corrigir sem redigitar)");
  // o próprio resultado: a linha vem travada e não vai ao servidor
  const proprio = montar();
  proprio.sessao({ matricula: obreiros[0].membroId, token: "tok", nivel: "GLOBAL", permissoes: ["afm"], geral: true });
  await proprio.g("edcCarregarPainelAcao")(); await proprio.ocioso();
  for (let el = proprio.e("edcLancamento"); el && el.style; el = el.parentNode) if (el.style.display === "none") el.style.display = "";   // a seção aberta, como na tela
  await proprio.g("edcLancarReciclagemAcao")(edAno.edicaoId); await proprio.ocioso();
  ok(proprio.e(`edcRes_${obreiros[0].membroId}`).disabled && proprio.e(`edcHoras_${obreiros[0].membroId}`).disabled && !proprio.e(`edcRes_${obreiros[1].membroId}`).disabled, "a própria linha vem travada (ninguém lança o próprio resultado)");
  ok(proprio.foco() === proprio.e("edcLancamentoTitulo"), "o foco vai para a tabela aberta");
  // dois cliques no mesmo "Lançar resultados": o que foi digitado depois do primeiro não some quando o segundo chega antes
  const dc = montar();
  await dc.g("edcCarregarPainelAcao")(); await dc.ocioso();
  const retDc = dc.retem((c) => c.chave === "GET educacao-continuada/edicao");
  const l1 = dc.g("edcLancarReciclagemAcao")(edAno.edicaoId);
  await dc.ocioso();
  await dc.g("edcLancarReciclagemAcao")(edAno.edicaoId); await dc.ocioso();
  dc.e(`edcHoras_${novo.membroId}`).value = "12";
  retDc.liberar(); await l1; await dc.ocioso();
  ok(dc.e(`edcHoras_${novo.membroId}`).value === "12", "dois cliques em 'Lançar resultados': a resposta atrasada do primeiro não apaga o que foi digitado");
  // o ano inteiro em lotes de 100 (o servidor recusa mais de 500 de uma vez), com a vez segurada do primeiro ao último lote
  const muitos = montar();
  const gente = Array.from({ length: 250 }, (_, i) => ({ membroId: 50000 + i, nome: `Obreiro ${i}`, congregacao: "Central", obreiro: true, situacao: { pendencias: [] } }));
  muitos.__respostas["GET educacao-continuada/painel"] = { corpo: { ...R.painel, pessoas: gente } };
  muitos.__respostas["GET educacao-continuada/edicao"] = { corpo: { sucesso: true, itens: [] } };
  await muitos.g("edcCarregarPainelAcao")(); await muitos.ocioso();
  await muitos.g("edcLancarReciclagemAcao")(edAno.edicaoId); await muitos.ocioso();
  for (const g of gente) { muitos.e(`edcRes_${g.membroId}`).value = "AUSENTE"; }
  const retLote = muitos.retem((c) => c.chave === "POST educacao-continuada/resultados-reciclagem");
  const sl = muitos.g("edcSalvarLancamentoAcao")();
  await muitos.ocioso();
  await muitos.g("edcSalvarLancamentoAcao")(); await muitos.ocioso();
  ok(/Aguarde/.test(muitos.e("edcMsg").textContent), "um segundo 'Salvar' no meio dos lotes espera");
  retLote.liberar(); await sl; await muitos.ocioso();
  const lotes = posts(muitos, "educacao-continuada/resultados-reciclagem").map((c) => c.corpo.itens.length);
  ok(JSON.stringify(lotes) === "[100,100,50]", "250 linhas: três pedidos (100, 100 e 50)", lotes);
  ok(/250 de 250 gravado/.test(muitos.e("edcMsg").textContent), "e a mensagem soma os lotes", muitos.e("edcMsg").textContent);
  semAtaque(amb, "lançamento da reciclagem");

  console.log("== lançar os resultados do exame ==");
  amb = montar();
  await amb.g("edcCarregarPainelAcao")();
  await amb.ocioso();
  const bienal = REAL.painel.exames.find((x) => x.tipo === "BIENAL" && x.registrados > 0);
  amb.doc.clicar(botoes(amb, "edcListaExames", "edcLancarExameAcao").find((b) => args(b)[0] === bienal.exameId));
  await amb.ocioso();
  const selsExame = todos(amb, "edcLancamento").filter((x) => x.localName === "select");
  ok(selsExame.length === REAL.painel.pessoas.length, "o exame: os obreiros e a Câmara", [selsExame.length, REAL.painel.pessoas.length]);
  const comJust = REAL.exame.itens.find((i) => i.justificativa);
  ok(amb.e(`edcJust_${comJust.membroId}`).value === R.exame.itens.find((i) => i.membroId === comJust.membroId).justificativa, "a justificativa gravada vem no campo (como texto)");
  ok(amb.e(`edcRes_${comJust.membroId}`).options.some((o) => o.value === "AUSENTE_JUSTIFICADO"), "com os quatro resultados do exame");
  amb.limparRegistro();
  const semRes = REAL.painel.pessoas.find((p) => !REAL.exame.itens.some((i) => i.membroId === p.membroId));
  amb.doc.escolher(amb.e(`edcRes_${semRes.membroId}`), "AUSENTE_JUSTIFICADO"); amb.e(`edcJust_${semRes.membroId}`).value = "Viagem a serviço da Convenção";
  amb.doc.clicar(botoes(amb, "edcLancamento", "edcSalvarLancamentoAcao")[0]);
  await amb.ocioso();
  const pxr = posts(amb, "educacao-continuada/resultados-exame");
  ok(pxr.length === 1 && pxr[0].corpo.exameId === bienal.exameId && pxr[0].corpo.itens.length === 1 && pxr[0].corpo.itens[0].justificativa === "Viagem a serviço da Convenção", "só a linha mexida, com a justificativa", pxr.map((p) => p.corpo));
  semAtaque(amb, "lançamento do exame");

  console.log("== a minha e a do perfil ==");
  amb = montar({ geral: false, membro: true });
  await amb.g("edcCarregarMinha")();
  const minha = amb.e("edcMinha").textContent;
  ok(/Minha educação continuada/.test(minha) && minha.includes(REAL.minha.situacao.pendencias[0]) && /Ausente com justificativa/.test(minha), "a minha: a pendência e o exame", minha.slice(0, 200));
  ok(!/Trilhas de formação/.test(minha), "na Minha Formação as trilhas não se repetem (os cartões já estão logo acima)");
  amb.__respostas["GET educacao-continuada/minha"] = { corpo: R.minhaVazia };
  await amb.g("edcCarregarMinha")();
  ok(amb.e("edcMinha").innerHTML === "", "quem não é obreiro e nunca teve reciclagem nem exame: o bloco não aparece");
  amb.__respostas["GET educacao-continuada/minha"] = { corpo: { ...R.minhaVazia, obreiro: true } };
  await amb.g("edcCarregarMinha")();
  ok(/em dia/.test(amb.e("edcMinha").textContent) && /Nenhuma reciclagem/.test(amb.e("edcMinha").textContent), "o obreiro sem nada registrado: em dia, sem histórico");
  semAtaque(amb, "a minha");
  amb = montar({ geral: false });
  amb.ctx._membroPerfilAtual = REAL.painel.pessoas[0].membroId;
  await amb.g("edcCarregarPessoa")(REAL.painel.pessoas[0].membroId);
  const perfil = amb.e("edcFormacaoPerfil").textContent;
  ok(/Formação ministerial/.test(perfil) && perfil.includes(REAL.pessoa.trilhas[0].trilha) && /certificado ABCD-1234/.test(perfil) && /Reprovado/.test(perfil), "o perfil: a reciclagem, os exames e a trilha com o certificado", perfil.slice(0, 250));
  const link = todos(amb, "edcFormacaoPerfil").find((x) => x.localName === "a");
  ok(link && /^verificar\.html\?c=ABCD-1234%20%3Cimg/.test(link.getAttribute("href")) && link.getAttribute("rel") === "noopener", "o certificado é um link para a verificação pública (o código codificado no endereço)", link && link.getAttribute("href"));
  semAtaque(amb, "perfil");
  // a resposta da pessoa anterior não sobrescreve a da atual
  const pa = montar({ geral: false });
  const [a, b] = [REAL.painel.pessoas[0].membroId, REAL.painel.pessoas[1].membroId];
  const retA = pa.retem((c) => c.chave === "GET educacao-continuada/pessoa" && c.consulta.membroId === String(a));
  pa.ctx._membroPerfilAtual = a;
  const pA = pa.g("edcCarregarPessoa")(a);
  await pa.ocioso();
  pa.ctx._membroPerfilAtual = b;
  pa.__respostas["GET educacao-continuada/pessoa"] = { corpo: { ...R.minha } };
  await pa.g("edcCarregarPessoa")(b);
  retA.liberar(); await pA; await pa.ocioso();
  ok(/Ausente com justificativa/.test(pa.e("edcFormacaoPerfil").textContent) && !/Reprovado/.test(pa.e("edcFormacaoPerfil").textContent), "a resposta atrasada da pessoa anterior não aparece no perfil da atual");

  console.log("== a saída e as respostas atrasadas ==");
  amb = montar();
  await amb.g("edcCarregarPainelAcao")();
  await amb.ocioso();
  amb.doc.clicar(botoes(amb, "edcListaEdicoes", "edcLancarReciclagemAcao")[0]);
  await amb.ocioso();
  amb.ctx._membroPerfilAtual = 1; await amb.g("edcCarregarPessoa")(1); await amb.g("edcCarregarMinha")();
  amb.e("edcEdicaoObs").value = "Observação de quem saiu"; amb.e("edcExameObs").value = "Outra observação"; amb.e("edcEdicaoCarga").value = "30";
  amb.doc.escolher(amb.e("edcExameTipo"), "REPESCAGEM");
  amb.g("edcLimparTela")();
  ok(["edcPendentes", "edcPendentesAno", "edcListaEdicoes", "edcListaExames", "edcLancamento", "edcMsg", "edcMinha", "edcFormacaoPerfil", "edcExameOrigem"].every((i) => amb.e(i).innerHTML === "") && amb.g("edcPainel") === null, "a saída limpa tudo o que estava na tela");
  ok(amb.e("edcEdicaoObs").value === "" && amb.e("edcExameObs").value === "" && amb.e("edcEdicaoCarga").value === "" && amb.e("edcExameTipo").value === "BIENAL" && amb.e("edcGrupoOrigem").hidden, "e o que foi digitado nos formulários");
  // o painel pedido por A e respondido depois que B entrou
  const atr = montar();
  const ret = atr.retem((c) => c.chave === "GET educacao-continuada/painel");
  const p1 = atr.g("edcCarregarPainelAcao")();
  await atr.ocioso();
  atr.sessao({ matricula: 2002, token: "tok-b", nivel: "CONGREGACAO", permissoes: ["pessoas"], geral: false });
  ret.liberar(); await p1; await atr.ocioso();
  ok(atr.e("edcPendentes").innerHTML === "" && atr.g("edcPainel") === null, "a resposta atrasada do login anterior não aparece para o novo");
  // dois pedidos do painel: vale o último
  const dois = montar();
  const ret1 = dois.retem((c) => c.chave === "GET educacao-continuada/painel");
  const q1 = dois.g("edcCarregarPainelAcao")();
  await dois.ocioso();
  dois.__respostas["GET educacao-continuada/painel"] = { corpo: { ...R.painel, edicoes: [] } };
  await dois.g("edcCarregarPainelAcao")();
  ret1.liberar(); await q1; await dois.ocioso();
  ok(/Nenhuma reciclagem registrada/.test(dois.e("edcListaEdicoes").textContent), "dois pedidos do painel seguidos: a tela fica com o último");
  return { total, falhas };
}

const MUTACOES = [
  ["tirar o escape do nome no painel de pendentes", ["<tr><td>${escaparHtmlEbd(p.nome)}</td><td>${escaparHtmlEbd(p.congregacao) || \"-\"}</td><td>${p.situacao", "<tr><td>${p.nome}</td><td>${escaparHtmlEbd(p.congregacao) || \"-\"}</td><td>${p.situacao"]],
  ["tirar o escape da justificativa no campo", ["id=\"edcJust_${Number(p.membroId)}\" value=\"${escaparHtmlEbd(mostrado)}\"", "id=\"edcJust_${Number(p.membroId)}\" value=\"${mostrado}\""]],
  ["mandar todas as linhas (não só as mexidas)", ["if (sel.value === sel.getAttribute(\"data-original\") && campo.value === campo.getAttribute(\"data-original\")) continue;", ""]],
  ["pôr a Câmara na reciclagem", ["(edcPainel.pessoas || []).filter((p) => tipo === \"exame\" || p.obreiro)", "(edcPainel.pessoas || [])"]],
  ["esquecer o perfil na saída", ["\"edcMinha\", \"edcFormacaoPerfil\", \"edcExameOrigem\"]", "\"edcMinha\", \"edcExameOrigem\"]"]],
  ["esquecer o formulário na saída", ["for (const idEl of [\"edcEdicaoData\", \"edcEdicaoCarga\", \"edcEdicaoObs\",", "for (const idEl of [\"edcEdicaoData\", \"edcEdicaoCarga\","]],
  ["não mostrar quem falta na reciclagem do ano", ["const doAno = data.edicaoDoAno ? (data.pessoas || []).filter((p) => p.semAprovacaoNoAno) : [];", "const doAno = [];"]],
  ["perder o que foi digitado na linha recusada", ["const mostrado = digitado ?", "const mostrado = false ?"]],
  ["mandar tudo num pedido só", ["const EDC_LOTE = 100;", "const EDC_LOTE = 100000;"]],
  ["não travar a própria linha", ["const travado = p.membroId === eu ? \" disabled\" : \"\";", "const travado = \"\";"]],
  ["mostrar o bloco a quem não tem nada", ["if (data === null || !data.sucesso || !edcTemAlgo(data)) return;", "if (data === null || !data.sucesso) return;"]],
  ["não conferir o lançamento mais recente", ["if (data === null || pedido !== edcPedidoLancamento || !edcPainel) return;", "if (data === null || !edcPainel) return;"]],
  ["não conferir o login depois do pedido", ["return authToken === token ? data : null;", "return data;"]],
  ["não conferir o pedido mais recente do painel", ["if (data === null || pedido !== edcPedidoPainel) return;", "if (data === null) return;"]],
  ["não conferir a pessoa do perfil", ["if (data === null || pedido !== edcPedidoPerfil || String(window._membroPerfilAtual) !== String(membroId)) return;", "if (data === null) return;"]],
  ["deixar o duplo clique gravar duas vezes", ["    if (edcOcupado) { edcMensagem(\"Aguarde", "    if (false) { edcMensagem(\"Aguarde"]]
];

(async () => {
  const r = await prova();
  console.log(`\nprova da tela da v8.6 (educação continuada): ${r.total - r.falhas}/${r.total} verificações ok${r.falhas ? ` — ${r.falhas} FALHA(S)` : ""}`);
  let mutFalhou = 0;
  if (process.env.MUTAR) {
    const fonte = lerApp("modulos/educacao-continuada.js");
    for (const [nome, [de, para]] of MUTACOES) {
      if (fonte.split(de).length !== 2) throw new Error(`mutação inaplicável: ${de}`);
      MUTADO = fonte.split(de).join(para);
      process.env.CALADO = "1";
      let m;
      try { m = await prova(); } catch (e) { m = { falhas: 1 }; }
      delete process.env.CALADO;
      MUTADO = null;
      console.log(`  mutação "${nome}": ${m.falhas ? `acusada (${m.falhas} falha(s))` : "NÃO acusada"}`);
      if (!m.falhas) mutFalhou++;
    }
  }
  process.exitCode = r.falhas || mutFalhou ? 1 : 0;
})().catch((e) => { console.log("ERRO", e); process.exit(1); });
