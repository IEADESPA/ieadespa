// roteiro.js — prova da tela da v9.2 (Expansão) sem navegador: o index.html de verdade, o eventos.js e o modulos/expansao.js inteiros, num DOM simulado
// (tools/front-cuidado/ambiente.js). As respostas do servidor vêm de contrato-real.json — gravado pelo e2e-71 com o handler e o banco REAIS
// (`E2E_CONTRATO=1 BASE=cenario-expansao bash rodar.sh roteiro e2e-71-expansao.js` em tools/e2e-localdb) — com texto de ataque em todo campo de texto.
// Rodar: node roteiro.js (da pasta tools/front-expansao). MUTAR=1 roda também as mutações (cada uma precisa ser acusada).
"use strict";
const { criarAmbiente, lerApp } = require("../front-cuidado/ambiente");
const REAL = require("./contrato-real.json");

const ATAQUE = '<img src=x onerror="__xss(1)">';
let total = 0, falhas = 0;
const ok = (c, d, det) => { total++; if (!c) { falhas++; if (!process.env.CALADO) console.log(`  ✗ ${d}${det !== undefined ? ` — ${JSON.stringify(det).slice(0, 300)}` : ""}`); } else if (process.env.LISTA) console.log(`  ✓ ${d}`); };

// os campos de texto (os códigos — tipo, status, parecer — vêm de listas fechadas do servidor; os rótulos deles, sim, são envenenados)
const CAMPOS_TEXTO = ["nome", "maeNome", "extensaoNome", "areaNome", "tipoRotulo", "statusRotulo", "rotulo", "justificativa", "endereco", "bairro", "cidade", "solicitanteNome",
  "fundamentacao", "porNome", "motivo", "congregacaoNome", "pendencia", "emancipadaNome", "descricao", "mensagem", "cargo", "origem", "motivoSaida"];
function envenenar(v, chave) {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" && CAMPOS_TEXTO.includes(chave) ? `${x} ${ATAQUE}` : envenenar(x)));
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = envenenar(x, k); return o; }
  if (typeof v === "string" && CAMPOS_TEXTO.includes(chave)) return `${v} ${ATAQUE}`;
  return v;
}
const R = envenenar(REAL);
var MUTADO = null;
const EM_PARECER = REAL.pedidoEmParecerCME.pedido;   // a emancipação esperando a CME (vista por quem é da CME)
const APROVADO = REAL.pedidoFinal.pedido;              // a mesma, depois de aprovada (vista pelo nível geral)
// a ficha que o nível geral vê esperando a CLI, com o parecer emitido (o mesmo pedido, montado a partir do final)
const AGUARDANDO = { ...R.pedidoFinal.pedido, status: "AGUARDANDO_CLI", statusRotulo: `Aguardando a decisão da CLI ${ATAQUE}`, decisao: null, resultado: null, acoes: { parecer: false, decidir: true, desistir: true } };

function montar({ permissoes = ["expansao"], geral = true, catalogo = "catalogosGeral" } = {}) {
  const amb = criarAmbiente({ semModulo: true });
  amb.ev(MUTADO || lerApp("modulos/expansao.js"), "expansao.js");
  amb.sessao({ matricula: 1002, token: "tok", nivel: geral ? "GLOBAL" : "CONGREGACAO", permissoes, geral });
  amb.__respostas = {};
  amb.ctx.HTMLElement = amb.ctx.HTMLElement || function () { };
  amb.api.servidor = (c) => {
    if (amb.__respostas[c.chave]) return amb.__respostas[c.chave];
    if (c.chave === "GET expansao/catalogos") return { corpo: R[catalogo] };
    if (c.chave === "GET expansao/reunioes") return { corpo: R.reunioes };
    if (c.chave === "GET expansao/painel") return { corpo: R.painelVencido };
    if (c.chave === "GET expansao/pedidos") return { corpo: R.pedidosGeral };
    if (c.chave === "GET expansao/pedido") return { corpo: { sucesso: true, pedido: String(c.consulta.pedidoId) === "999" ? { ...AGUARDANDO, pedidoId: 999, nome: "Outro Pedido" } : AGUARDANDO } };
    if (c.chave === "GET expansao/extensoes") return { corpo: c.consulta.todas ? R.extensoesTodas : R.extensoesAtivas };
    if (c.chave === "GET expansao/extensao-historico") return { corpo: R.historico };
    if (c.chave === "POST expansao/pedido") return { status: 201, corpo: { sucesso: true, pedidoId: APROVADO.pedidoId, mensagem: `Pedido registrado ${ATAQUE}` } };
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
const botaoForm = (amb, chave) => botoes(amb, "expFicha", "expAbrirFormAcao").find((b) => args(b)[0] === chave);
// a Extensão da lista sem Encarregado (as que o servidor devolve já têm um)
function expExtensoesSemEncarregado(amb, e) {
  amb.ev(`expExtensoes = expExtensoes.map((x) => (x.extensaoId === ${Number(e.extensaoId)} ? { ...x, encarregado: null } : x));`, "sem-encarregado");
}
async function abrirAba(amb) { amb.g("mostrarAbaSecretaria")("expansao"); await amb.ocioso(); }
async function abrirFicha(amb, id = APROVADO.pedidoId) { await amb.g("expAbrirFichaAcao")(id); await amb.ocioso(); }

async function prova() {
  total = 0; falhas = 0;
  console.log("== contrato real ==");
  for (const k of ["catalogosGeral", "catalogosDirigente", "catalogosCME", "painelVencido", "painelDepois", "pedidosGeral", "pedidoEmParecerCME", "pedidoFinal", "extensoesAtivas", "extensoesTodas", "reunioes", "historico"]) {
    ok(REAL[k] && REAL[k].sucesso, `o e2e-71 gravou a resposta real de ${k}`);
  }
  ok(["tipos", "pareceres", "resultados", "maes", "extensoes", "areas", "ufs", "papeis"].every((k) => k in REAL.catalogosGeral), "catálogos: as listas que a tela lê");
  ok(EM_PARECER.acoes.parecer && !EM_PARECER.acoes.decidir && APROVADO.status === "APROVADO" && APROVADO.resultado && APROVADO.resultado.membrosTransferidos === 3, "as fichas: a da CME (pode o parecer) e a aprovada (com os membros transferidos)");
  ok(REAL.reunioes.reunioes.every((s) => s.data <= REAL.painelVencido.hoje), "as reuniões da lista: nenhuma com data futura");
  ok(/expLimparTela\(\)/.test(lerApp("script.js")) && /expansao: \{ titulo: "Expansão"/.test(lerApp("script.js")) && !/"entidades", "expansao"\]\);/.test(lerApp("script.js")), "script.js: a saída e o card (não é só do geral: o Dirigente usa)");
  ok(/carregarOpcoesExpansaoAcao\(\)/.test(lerApp("modulos/meus-dados.js")) && /expCartaoMeusDados\(data\.extensoesEncarregadas\)/.test(lerApp("modulos/meu-painel.js")), "os ganchos: abrir a aba e Meus Dados");
  ok(/\/modulos\/expansao\.js/.test(lerApp("service-worker.js")) && /modulos\/expansao\.js/.test(lerApp("index.html")), "o módulo na casca do aparelho e no index.html");

  console.log("== abrir a aba: o painel ==");
  let amb = montar();
  await abrirAba(amb);
  ok(amb.e("abaExpansao").style.display === "block", "a aba aparece com a permissão");
  ok(gets(amb, "expansao/catalogos").length === 1 && gets(amb, "expansao/painel").length === 1 && gets(amb, "expansao/reunioes").length === 1, "o nível geral lê os catálogos, as reuniões da CLI e o painel");
  const painel = amb.e("expPainel").textContent;
  ok(/Parecer da CME vencido/.test(painel) && REAL.painelVencido.parecerVencido.every((x) => painel.includes(x.nome)) && /Pastor de Área/.test(painel), "o painel: o parecer vencido e a CME", painel.slice(0, 300));
  ok(botoes(amb, "expPainel", "expAbrirFichaAcao").every((b) => typeof args(b)[0] === "number"), "cada item abre a ficha pelo número");
  semAtaque(amb, "o painel");
  let sem = montar({ permissoes: ["pessoas"] });
  await abrirAba(sem);
  ok(sem.e("abaExpansao").style.display !== "block", "sem a permissão: a aba não aparece");
  const dirigente = montar({ geral: false, catalogo: "catalogosDirigente" });
  await abrirAba(dirigente);
  ok(dirigente.e("abaExpansao").style.display === "block", "o Dirigente (nível local) vê a aba");
  ok(gets(dirigente, "expansao/reunioes").length === 0, "o Dirigente não pede as reuniões da CLI (só o nível geral registra a decisão)");
  ok(!dirigente.e("expNovoTipo").options.some((o) => o.value === "NOVA_CONGREGACAO"), "o Dirigente não tem 'nova congregação' no pedido");

  console.log("== o pedido novo ==");
  amb.g("expMostrarSecaoAcao")("pedidos"); await amb.ocioso();
  ok(amb.e("expSecaoPedidos").style.display === "block" && amb.e("expSecaoPainel").style.display === "none", "a seção Pedidos");
  amb.e("expNovoTipo").value = "ABERTURA_EXTENSAO";
  amb.g("expTipoNovoAcao")();
  ok(amb.e("expNovoBlocoMae").style.display !== "none" && amb.e("expNovoBlocoEncarregado").style.display !== "none" && amb.e("expNovoBlocoExtensao").style.display === "none" && amb.e("expNovoBlocoArea").style.display === "none",
    "abertura: a Mãe e o Encarregado; sem a Extensão nem a Área");
  amb.e("expNovoTipo").value = "EMANCIPACAO";
  amb.g("expTipoNovoAcao")();
  ok(amb.e("expNovoBlocoMae").style.display === "none" && amb.e("expNovoBlocoExtensao").style.display !== "none" && amb.e("expNovoBlocoArea").style.display !== "none", "emancipação: a Extensão e a Área");
  ok(amb.e("expNovoExtensao").options.filter((o) => o.value).length === REAL.catalogosGeral.extensoes.length, "as Extensões oferecidas são as do catálogo (sem as que já têm pedido em andamento)");
  amb.e("expNovoTipo").value = "ABERTURA_EXTENSAO";
  amb.g("expTipoNovoAcao")();
  amb.e("expNovoMae").value = String(REAL.catalogosGeral.maes[0].congregacaoId);
  amb.e("expNovoEncarregado").value = " 9402 ";
  amb.e("expNovoNome").value = "Tenda Nova";
  amb.e("expNovoJustificativa").value = "Doze famílias no bairro.";
  amb.e("expNovoExtensao").value = String(REAL.catalogosGeral.extensoes[0] ? REAL.catalogosGeral.extensoes[0].extensaoId : "");
  amb.limparRegistro();
  await amb.g("expSalvarNovoAcao")(); await amb.ocioso();
  let p = posts(amb, "expansao/pedido");
  ok(p.length === 1 && p[0].corpo.tipo === "ABERTURA_EXTENSAO" && p[0].corpo.encarregadoMembroId === "9402" && p[0].corpo.congregacaoMaeId === String(REAL.catalogosGeral.maes[0].congregacaoId) && !("extensaoId" in p[0].corpo) && !("areaId" in p[0].corpo),
    "abertura: manda a Mãe e o Encarregado, nunca a Extensão escondida", p[0] && p[0].corpo);
  ok(amb.e("expNovoNome").value === "" && gets(amb, "expansao/pedido").length === 1 && gets(amb, "expansao/catalogos").length === 1, "limpa o formulário, relê os catálogos e abre a ficha nova");
  ok(amb.e("expMsgFicha").textContent.includes("Pedido registrado") && amb.e("expMsgNovo").textContent === "", "a mensagem do servidor (como texto) aparece na ficha aberta, não no formulário fechado");
  semAtaque(amb, "o pedido novo");

  console.log("== a ficha e a decisão da CLI ==");
  await abrirFicha(amb);
  const ficha = amb.e("expFicha").textContent;
  ok(ficha.includes(APROVADO.nome) && /Parecer da CME: Favorável/.test(ficha), "a ficha: o nome e o parecer da CME", ficha.slice(0, 200));
  ok(botaoForm(amb, "decidir") && botaoForm(amb, "desistir") && !botaoForm(amb, "parecer"), "o nível geral: a decisão e a desistência; o parecer não (o servidor diz)");
  semAtaque(amb, "a ficha");
  await amb.g("expAbrirFormAcao")("decidir"); await amb.ocioso();
  ok(/Decisão da CLI — Emancipação/.test(amb.e("expFormAcao").textContent), "o título diz de qual pedido é o ato");
  ok(!amb.e("expCampo_urgencia"), "com o parecer emitido, sem a marca da urgência");
  const desde = [AGUARDANDO.solicitadoEm, AGUARDANDO.parecerEm].filter(Boolean).sort().pop();
  const validas = REAL.reunioes.reunioes.filter((s) => s.data >= desde);
  const sel = amb.e("expCampo_sessaoId");
  ok(sel && validas.length && sel.options.filter((o) => o.value).length === validas.length && validas.length < REAL.reunioes.reunioes.length, "só as reuniões a partir do pedido e do parecer", { validas: validas.length, todas: REAL.reunioes.reunioes.length });
  sel.value = String(validas[0].sessaoId);
  amb.e("expCampo_resultado").value = "APROVADO";
  amb.e("expCampo_motivo").value = "  ";
  amb.limparRegistro();
  let pend = amb.g("expEnviarFormAcao")();
  let modal = await amb.responderModal(false);
  await pend; await amb.ocioso();
  ok(modal.aberto && /membros da Extensão passam/.test(modal.texto) && /sessões abertas/.test(modal.texto) && posts(amb, "expansao/decidir").length === 0, "aprovar a emancipação pede confirmação dizendo a consequência — cancelado, nada vai", modal);
  pend = amb.g("expEnviarFormAcao")();
  await amb.responderModal(true);
  await pend; await amb.ocioso();
  p = posts(amb, "expansao/decidir");
  ok(p.length === 1 && p[0].corpo.pedidoId === APROVADO.pedidoId && p[0].corpo.sessaoId === String(validas[0].sessaoId) && p[0].corpo.resultado === "APROVADO" && p[0].corpo.motivo === "", "confirmado: manda o pedido, a reunião e o resultado", p[0] && p[0].corpo);
  ok(gets(amb, "expansao/pedido").length === 1 && gets(amb, "expansao/catalogos").length === 1, "depois de gravar: relê a ficha e os catálogos");
  ok(amb.e("expMsgFicha").textContent.includes("Salvo"), "a mensagem do servidor na ficha");
  semAtaque(amb, "a mensagem");
  // a recusa do servidor fica no formulário, com o que foi digitado
  amb.__respostas["POST expansao/decidir"] = { status: 422, corpo: { sucesso: false, mensagem: `A reunião é anterior ao parecer ${ATAQUE}` } };
  await amb.g("expAbrirFormAcao")("decidir"); await amb.ocioso();
  amb.e("expCampo_sessaoId").value = String(validas[0].sessaoId);
  amb.e("expCampo_resultado").value = "REJEITADO";
  amb.e("expCampo_motivo").value = "Sem obreiro";
  pend = amb.g("expEnviarFormAcao")();
  modal = await amb.responderModal(true);
  await pend; await amb.ocioso();
  ok(/RECUSA/.test(modal.texto) && /anterior ao parecer/.test(amb.e("expMsgForm").textContent) && amb.e("expCampo_motivo").value === "Sem obreiro", "a recusa aparece no formulário, que fica com o digitado");
  semAtaque(amb, "a recusa");
  delete amb.__respostas["POST expansao/decidir"];
  // duplo clique: um pedido só
  amb.limparRegistro();
  const d1 = amb.g("expEnviarFormAcao")();
  const d2 = amb.g("expEnviarFormAcao")();
  await amb.responderModal(true);
  await d1; await d2; await amb.ocioso();
  ok(posts(amb, "expansao/decidir").length === 1, "duplo clique em Salvar: um pedido só");
  // trocar de ficha durante a gravação: a gravação da anterior deu certo, mas a tela fica na nova (a anterior não é reaberta)
  await abrirFicha(amb);
  await amb.g("expAbrirFormAcao")("desistir"); await amb.ocioso();
  amb.e("expCampo_motivo").value = "O ponto cedido saiu";
  amb.limparRegistro();
  pend = amb.g("expEnviarFormAcao")();
  await amb.responderModal(true);
  await amb.g("expAbrirFichaAcao")(999);
  await pend; await amb.ocioso();
  ok(posts(amb, "expansao/desistir").length === 1 && amb.e("expFicha").textContent.includes("Outro Pedido") && !gets(amb, "expansao/pedido").some((c) => c.consulta.pedidoId === String(APROVADO.pedidoId)),
    "trocou de ficha durante a gravação: a tela fica na nova (a anterior não é reaberta)");
  await abrirFicha(amb);

  console.log("== o parecer da CME e a urgência ==");
  const cme = montar({ geral: false, catalogo: "catalogosCME" });
  cme.__respostas["GET expansao/pedido"] = { corpo: R.pedidoEmParecerCME };
  await abrirAba(cme); await abrirFicha(cme, EM_PARECER.pedidoId);
  ok(botaoForm(cme, "parecer") && !botaoForm(cme, "decidir"), "a CME: o botão do parecer, sem a decisão");
  ok(/Parecer da CME até/.test(cme.e("expFicha").textContent), "a ficha mostra o prazo do parecer");
  await cme.g("expAbrirFormAcao")("parecer"); await cme.ocioso();
  cme.e("expCampo_parecer").value = "CONTRARIO";
  cme.e("expCampo_fundamentacao").value = " Sem sustento comprovado. ";
  cme.limparRegistro();
  pend = cme.g("expEnviarFormAcao")();
  modal = await cme.responderModal(true);
  await pend; await cme.ocioso();
  p = posts(cme, "expansao/parecer");
  ok(/CONTRÁRIO/.test(modal.texto) && p.length === 1 && p[0].corpo.pedidoId === EM_PARECER.pedidoId && p[0].corpo.parecer === "CONTRARIO" && p[0].corpo.fundamentacao === "Sem sustento comprovado.", "o parecer: confirma e manda o pedido, o resultado e a fundamentação", p[0] && p[0].corpo);
  semAtaque(cme, "a ficha da CME");
  const geralSemParecer = montar();
  geralSemParecer.__respostas["GET expansao/pedido"] = { corpo: { sucesso: true, pedido: { ...R.pedidoEmParecerCME.pedido, acoes: { parecer: false, decidir: true, desistir: true } } } };
  await abrirAba(geralSemParecer); await abrirFicha(geralSemParecer, EM_PARECER.pedidoId);
  await geralSemParecer.g("expAbrirFormAcao")("decidir"); await geralSemParecer.ocioso();
  ok(!!geralSemParecer.e("expCampo_urgencia"), "sem o parecer: a decisão oferece a marca da urgência (2/3)");
  geralSemParecer.e("expCampo_sessaoId").value = String(REAL.reunioes.reunioes[0].sessaoId);
  geralSemParecer.e("expCampo_resultado").value = "APROVADO";
  geralSemParecer.e("expCampo_urgencia").checked = true;
  geralSemParecer.limparRegistro();
  pend = geralSemParecer.g("expEnviarFormAcao")();
  await geralSemParecer.responderModal(true);
  await pend; await geralSemParecer.ocioso();
  p = posts(geralSemParecer, "expansao/decidir");
  ok(p.length === 1 && p[0].corpo.urgencia === true, "a urgência vai como verdadeiro/falso", p[0] && p[0].corpo);

  console.log("== o que a revisão da tela pediu ==");
  // campo obrigatório vazio: avisa no formulário, sem perguntar nem gravar
  await abrirFicha(amb);
  await amb.g("expAbrirFormAcao")("decidir"); await amb.ocioso();
  amb.limparRegistro();
  pend = amb.g("expEnviarFormAcao")();
  modal = await amb.responderModal(true);
  await pend; await amb.ocioso();
  ok(!modal.aberto && /Preencha: Reunião da CLI; A CLI…/.test(amb.e("expMsgForm").textContent) && posts(amb, "expansao/decidir").length === 0, "sem a reunião e o resultado: avisa o que falta, sem perguntar 'recusa' nem gravar", amb.e("expMsgForm").textContent);
  amb.e("expCampo_sessaoId").value = String(validas[0].sessaoId);
  amb.e("expCampo_resultado").value = "REJEITADO";
  pend = amb.g("expEnviarFormAcao")();
  modal = await amb.responderModal(true);
  await pend; await amb.ocioso();
  ok(!modal.aberto && /motivo/.test(amb.e("expMsgForm").textContent) && posts(amb, "expansao/decidir").length === 0, "a recusa sem motivo: avisa antes de perguntar");
  geralSemParecer.limparRegistro();
  await geralSemParecer.g("expAbrirFormAcao")("decidir"); await geralSemParecer.ocioso();
  geralSemParecer.e("expCampo_sessaoId").value = String(REAL.reunioes.reunioes[0].sessaoId);
  geralSemParecer.e("expCampo_resultado").value = "APROVADO";
  pend = geralSemParecer.g("expEnviarFormAcao")();
  modal = await geralSemParecer.responderModal(true);
  await pend; await geralSemParecer.ocioso();
  ok(!modal.aberto && /marque a urgência/.test(geralSemParecer.e("expMsgForm").textContent) && posts(geralSemParecer, "expansao/decidir").length === 0, "sem o parecer e sem a urgência: avisa antes (o servidor recusaria)");
  // a aba reaberta não apaga o que foi digitado (o formulário do ato e as escolhas do pedido novo)
  amb.e("expCampo_motivo").value = "Texto longo que a pessoa escreveu";
  amb.e("expNovoTipo").value = "EMANCIPACAO";
  amb.g("expTipoNovoAcao")();
  await abrirAba(amb);
  ok(amb.e("expCampo_motivo") && amb.e("expCampo_motivo").value === "Texto longo que a pessoa escreveu" && amb.e("expCampo_resultado").value === "REJEITADO" && amb.e("expNovoTipo").value === "EMANCIPACAO" && amb.e("expNovoBlocoExtensao").style.display !== "none",
    "voltar à aba não apaga o que foi digitado");
  amb.e("expNovoTipo").value = ""; amb.g("expTipoNovoAcao")();
  amb.g("expCancelarFormAcao")();
  // sem Mãe possível: o aviso aparece ao escolher o tipo, antes de preencher tudo
  const semMae = montar({ geral: false, catalogo: "catalogosDirigente" });
  semMae.__respostas["GET expansao/catalogos"] = { corpo: { ...R.catalogosDirigente, maes: [], extensoes: [] } };
  await abrirAba(semMae);
  semMae.e("expNovoTipo").value = "ABERTURA_EXTENSAO"; semMae.g("expTipoNovoAcao")();
  ok(/não tem uma congregação inteira/.test(semMae.e("expMsgTipo").textContent), "sem Mãe no escopo: avisa ao escolher a abertura");
  semMae.e("expNovoTipo").value = "EMANCIPACAO"; semMae.g("expTipoNovoAcao")();
  ok(/Não há Extensão ativa/.test(semMae.e("expMsgTipo").textContent), "sem Extensão disponível: avisa ao escolher a emancipação");
  // as reuniões que não chegaram não mandam cadastrar reunião
  const semReu = montar();
  semReu.__respostas["GET expansao/reunioes"] = { status: 500, corpo: { sucesso: false, mensagem: "falhou" } };
  await abrirAba(semReu); await abrirFicha(semReu);
  await semReu.g("expAbrirFormAcao")("decidir"); await semReu.ocioso();
  ok(/Não foi possível carregar as reuniões/.test(semReu.e("expCampo_sessaoId").textContent), "as reuniões não chegaram: o formulário diz isso");

  console.log("== as Extensões ==");
  amb.g("expMostrarSecaoAcao")("extensoes"); await amb.ocioso();
  const lista = amb.e("expListaExtensoes").textContent;
  ok(REAL.extensoesAtivas.extensoes.every((e) => lista.includes(e.nome)), "a lista das ativas");
  semAtaque(amb, "a lista das Extensões");
  amb.e("expExtensoesTodas").checked = true;
  await amb.g("expCarregarExtensoesAcao")(); await amb.ocioso();
  ok(gets(amb, "expansao/extensoes").some((c) => c.consulta.todas === "1") && /emancipada em/.test(amb.e("expListaExtensoes").textContent), "marcando 'todas': a emancipada com a congregação que nasceu");
  ok(!botoes(amb, "expListaExtensoes", "expTrocarEncarregadoAcao").some((b) => REAL.extensoesTodas.extensoes.find((e) => e.extensaoId === args(b)[0] && !e.podeEditar)), "a emancipada não tem o botão de trocar o Encarregado");
  amb.e("expExtensoesTodas").checked = false;
  await amb.g("expCarregarExtensoesAcao")(); await amb.ocioso();
  const ext = REAL.extensoesAtivas.extensoes.find((e) => e.podeEditar);
  amb.g("expTrocarEncarregadoAcao")(ext.extensaoId);
  amb.e("expEncMembro").value = " 9403 ";
  amb.e("expEncMotivo").value = "Mudou de cidade";
  amb.limparRegistro();
  await amb.g("expSalvarEncarregadoAcao")(ext.extensaoId); await amb.ocioso();
  p = posts(amb, "expansao/encarregado");
  ok(p.length === 1 && p[0].corpo.extensaoId === ext.extensaoId && p[0].corpo.membroId === "9403" && p[0].corpo.motivo === "Mudou de cidade", "trocar o Encarregado: a Extensão, a matrícula e o motivo", p[0] && p[0].corpo);
  ok(amb.e("expFormExtensao").innerHTML === "" && amb.e("expMsgExtensoes").textContent.includes("Salvo") && gets(amb, "expansao/extensoes").length === 1, "fecha o formulário, mostra a mensagem e relê a lista");
  // duplo clique num ato sem pergunta de confirmação (a troca do Encarregado): um pedido só
  amb.g("expTrocarEncarregadoAcao")(ext.extensaoId);
  amb.e("expEncMembro").value = "9404";
  amb.e("expEncMotivo").value = "Outra troca";
  amb.limparRegistro();
  await Promise.all([amb.g("expSalvarEncarregadoAcao")(ext.extensaoId), amb.g("expSalvarEncarregadoAcao")(ext.extensaoId)]); await amb.ocioso();
  ok(posts(amb, "expansao/encarregado").length === 1, "dois cliques num ato sem pergunta: um pedido só");
  await amb.g("expHistoricoAcao")(ext.extensaoId); await amb.ocioso();
  ok(gets(amb, "expansao/extensao-historico").length === 1 && /Emancipação da Extensão/.test(amb.e("expFormExtensao").textContent), "o histórico dos Encarregados, com o motivo da saída");
  const cmeFora = montar({ geral: false, catalogo: "catalogosCME" });
  cmeFora.__respostas["GET expansao/extensoes"] = { corpo: { sucesso: true, extensoes: R.extensoesAtivas.extensoes.map((e) => ({ ...e, podeEditar: false, podeVerHistorico: false, pendencia: null })) } };
  await abrirAba(cmeFora);
  cmeFora.g("expMostrarSecaoAcao")("extensoes"); await cmeFora.ocioso();
  ok(botoes(cmeFora, "expListaExtensoes", "expHistoricoAcao").length === 0 && botoes(cmeFora, "expListaExtensoes", "expTrocarEncarregadoAcao").length === 0, "a CME de fora: sem o histórico e sem a troca (o servidor diz)");
  const hPend = amb.g("expHistoricoAcao")(ext.extensaoId);
  const lPend = amb.g("expCarregarExtensoesAcao")();
  await hPend; await lPend; await amb.ocioso();
  ok(/Encarregados —/.test(amb.e("expFormExtensao").textContent), "o histórico pedido junto com a lista recarregada não fica preso em 'Carregando…'");
  const semEnc = REAL.extensoesAtivas.extensoes.find((e) => e.podeEditar);
  expExtensoesSemEncarregado(amb, semEnc);
  amb.g("expTrocarEncarregadoAcao")(semEnc.extensaoId);
  ok(!amb.e("expEncMotivo") && /Definir o Encarregado/.test(amb.e("expFormExtensao").textContent), "definir o primeiro Encarregado não pede motivo (ninguém está saindo)");
  amb.g("expFecharFormExtensaoAcao")();
  semAtaque(amb, "o histórico");

  console.log("== Meus Dados ==");
  const cartao = amb.g("expCartaoMeusDados")([{ extensao: `Tenda ${ATAQUE}`, congregacaoMae: `Central ${ATAQUE}`, desde: "2026-11-01", ate: null }]);
  ok(/Tenda/.test(cartao) && !/<img/.test(cartao) && /\(atual\)/.test(cartao), "o cartão de Meus Dados escapa o texto");
  ok(amb.g("expCartaoMeusDados")([]) === "" && amb.g("expCartaoMeusDados")(null) === "", "sem Extensão: o cartão não aparece");
  // Trava 9-A — os atos da pessoa nos pedidos de expansão
  const atos = amb.g("expCartaoAtosMeusDados")([{ pedido: `Emancipação: Nova ${ATAQUE}`, em: "2026-11-01", papeis: ["pediu", `deu o parecer ${ATAQUE}`] }]);
  ok(/Pedidos de expansão/.test(atos) && /pediu/.test(atos) && !/<img/.test(atos), "o cartão dos pedidos de expansão escapa o texto (Trava 9-A)");
  ok(amb.g("expCartaoAtosMeusDados")([]) === "" && amb.g("expCartaoAtosMeusDados")(null) === "", "sem ato: o cartão não aparece");
  // e o painel acusa o Pastor de Área da CME sem a permissão da tela
  const amb9 = montar();
  amb9.__respostas["GET expansao/painel"] = { corpo: { ...R.painelVencido, cme: { ...R.painelVencido.cme, pastoresSemAcesso: [{ membroId: 3003, nome: `Pastor ${ATAQUE}` }] } } };
  await abrirAba(amb9);
  ok(/sem a permissão "expansao"/.test(amb9.e("expPainel").textContent), "o painel avisa o Pastor de Área da CME sem acesso (Trava 9-A)");
  semAtaque(amb9, "o aviso da CME sem acesso");

  console.log("== a saída da sessão ==");
  const amb3 = montar();
  await abrirAba(amb3);
  const pendente = amb3.g("expAbrirFichaAcao")(APROVADO.pedidoId);
  amb3.e("expNovoNome").value = "digitado antes de sair";
  amb3.g("limparSessao")();
  await pendente; await amb3.ocioso();
  ok(amb3.e("expFicha").innerHTML === "" && amb3.e("expPainel").innerHTML === "" && amb3.e("expNovoNome").value === "", "nada da sessão anterior fica: nem a ficha (a resposta atrasada não pinta), nem o painel, nem o digitado");
  const amb4 = montar();
  await abrirAba(amb4);
  amb4.e("expPainel").innerHTML = "";
  const pendente4 = amb4.g("expCarregarPainelAcao")();
  amb4.sessao({ matricula: 2002, token: "outro", nivel: "GLOBAL", permissoes: ["expansao"], geral: true });
  await pendente4; await amb4.ocioso();
  ok(!/vencido/.test(amb4.e("expPainel").textContent), "a resposta do login anterior não pinta o painel do novo");
  return { total, falhas };
}

const MUTACOES = [
  ["tirar o escape do nome na lista", ["<td><strong>${expH(p.nome)}</strong><br><small>${expH(p.tipoRotulo)}</small>", "<td><strong>${p.nome}</strong><br><small>${p.tipoRotulo}</small>"]],
  ["tirar o escape da fundamentação", ["<p class=\"subtitle\">${expH(p.parecer.fundamentacao)}</p>", "<p class=\"subtitle\">${p.parecer.fundamentacao}</p>"]],
  ["tirar o escape do painel", ["<li><strong>${expH(p.tipoRotulo)}: ${expH(p.nome)}</strong>", "<li><strong>${p.tipoRotulo}: ${p.nome}</strong>"]],
  ["mostrar o parecer a quem o servidor nega", ["a.parecer ? expBotao(\"🧭 Parecer da CME\", \"parecer\") : \"\"", "expBotao(\"🧭 Parecer da CME\", \"parecer\")"]],
  ["deixar o duplo clique gravar duas vezes", ["  if (expOcupado) { expMensagem(alvoMsg, \"Aguarde: a gravação anterior ainda está em andamento.\"); return null; }", ""]],
  ["esquecer o pedido no ato", ["const corpo = { pedidoId: Number(expFicha.pedidoId) };", "const corpo = {};"]],
  ["mandar a urgência como texto", ["corpo[c.id] = c.tipo === \"check\" ? !!el.checked : String(el.value || \"\").trim();", "corpo[c.id] = String(el.value || \"\").trim();"]],
  ["atos sem volta sem confirmar", ["    try { sim = await confirmarAcao(pergunta, \"Confirmar\"); } finally { expConfirmando = false; }", "    try { sim = true; } finally { expConfirmando = false; }"]],
  ["mostrar todas as reuniões", ["const validas = expReunioes.filter((s) => !desde || s.data >= desde);", "const validas = expReunioes;"]],
  ["recusa fora do formulário", ["expMensagem(\"expMsgForm\", msg);\n    const el = expEl(\"expMsgForm\");", "expMensagem(\"expMsgFicha\", msg);\n    const el = expEl(\"expMsgForm\");"]],
  ["a resposta da ficha anterior na nova", ["  if (ficha !== expPedidoFicha) {\n    // trocou", "  if (false) {\n    // trocou"]],
  ["perguntar antes de conferir o que falta", ["  if (problema) { expMensagem(\"expMsgForm\", problema); return; }", ""]],
  ["voltar à aba apaga o formulário do ato", ["  if (expForm) { expRenderForm(); expRestaurarCampos(digitado); }", "  if (expForm) { expRenderForm(); }"]],
  ["voltar à aba apaga as escolhas do pedido novo", ["if (el && v && Array.from(el.options || []).some((o) => o.value === v)) el.value = v;", "if (false) el.value = v;"]],
  ["histórico e lista no mesmo contador", ["  if (r === null || meu !== expPedidoHistorico) return;", "  if (r === null || meu !== expPedidoExtensoes) return;"]],
  ["pedir motivo ao definir o primeiro Encarregado", ["${e.encarregado ? `<div class=\"input-group\"><label for=\"expEncMotivo\">", "${true ? `<div class=\"input-group\"><label for=\"expEncMotivo\">"]],
  ["mostrar o histórico a quem o servidor nega", ["${e.podeVerHistorico ? `<button", "${true ? `<button"]],
  ["mandar cadastrar reunião quando a lista falhou", ["  if (expReunioesFalhou) return", "  if (false) return"]],
  ["pintar a resposta de outro login", ["  return expDono() === dono ? data : null;\n}\nasync function expPost", "  return data;\n}\nasync function expPost"]],
  ["não limpar a ficha na saída", ["for (const idEl of [\"expPainel\", \"expLista\", \"expFicha\",", "for (const idEl of [\"expPainel\", \"expLista\","]],
  ["mandar a Extensão escondida na abertura", ["  if (tipo === \"EMANCIPACAO\") corpo.extensaoId = expEl(\"expNovoExtensao\").value;", "  corpo.extensaoId = expEl(\"expNovoExtensao\").value;"]],
  ["urgência sempre no formulário", ["...(semParecer ? [{ id: \"urgencia\"", "...(true ? [{ id: \"urgencia\""]],
  ["trocar o Encarregado da emancipada", ["<td>${e.podeEditar ? `<button", "<td>${true ? `<button"]],
  ["tirar o escape de Meus Dados", ["${expH(x.extensao)} (${expH(x.congregacaoMae)})", "${x.extensao} (${x.congregacaoMae})"]],
  ["tirar o escape dos pedidos em Meus Dados", ["${expH(x.pedido)} (${expH(expBr(x.em))})", "${x.pedido} (${expH(expBr(x.em))})"]],
  ["não avisar a CME sem acesso", ["    ...arr(cme.pastoresSemAcesso).map(", "    ...[].map("]],
  ["o Dirigente pede as reuniões da CLI", ["  if (cat.papeis && cat.papeis.geral) {", "  if (true) {"]]
];

(async () => {
  const r = await prova();
  console.log(`\nprova da tela da v9.2 (expansão): ${r.total - r.falhas}/${r.total} verificações ok${r.falhas ? ` — ${r.falhas} FALHA(S)` : ""}`);
  let mutFalhou = 0;
  if (process.env.MUTAR) {
    const fonte = lerApp("modulos/expansao.js");
    for (const [nome, [de, para]] of MUTACOES) {
      if (fonte.split(de).length !== 2) throw new Error(`mutação inaplicável: ${nome}`);
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
