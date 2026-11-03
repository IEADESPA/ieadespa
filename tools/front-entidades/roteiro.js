// roteiro.js — prova da tela da v9.1 (Entidades vinculadas) sem navegador: o index.html de verdade, o eventos.js e o modulos/entidades-vinculadas.js inteiros, num DOM
// simulado (tools/front-cuidado/ambiente.js). As respostas do servidor vêm de contrato-real.json — gravado pelo e2e-69 com o handler e o banco REAIS
// (`E2E_CONTRATO=1 BASE=cenario-entidades bash rodar.sh roteiro e2e-69-entidades.js` em tools/e2e-localdb) — com texto de ataque em todo campo de texto.
// Rodar: node roteiro.js (da pasta tools/front-entidades). MUTAR=1 roda também as mutações (cada uma precisa ser acusada).
"use strict";
const { criarAmbiente, lerApp } = require("../front-cuidado/ambiente");
const REAL = require("./contrato-real.json");

const ATAQUE = '<img src=x onerror="__xss(1)">';
let total = 0, falhas = 0;
const ok = (c, d, det) => { total++; if (!c) { falhas++; if (!process.env.CALADO) console.log(`  ✗ ${d}${det !== undefined ? ` — ${JSON.stringify(det).slice(0, 300)}` : ""}`); } else if (process.env.LISTA) console.log(`  ✓ ${d}`); };

// os campos de texto (os códigos — status, função, motivo — vêm de listas fechadas do servidor; os rótulos deles, sim, são envenenados)
const CAMPOS_TEXTO = ["nome", "razaoSocial", "nomeFantasia", "finalidade", "tipoNome", "naturezaRotulo", "statusRotulo", "entidade", "fatos", "fundamentacao", "motivoRotulo", "interventor",
  "mensagem", "descricao", "rotulo", "funcaoRotulo", "formacao", "situacaoRotulo", "indicacaoAto", "auditoriaOrgao", "notificacaoForma", "manifestacaoResumo", "pendencias",
  "formacoes", "formacoesExigidas", "periodicidadeRotulo", "destinoRotulo", "destinatarioNome", "bensComodato", "resultadoRotulo", "motivoEncerramentoRotulo", "encerramentoMotivo",
  "cnpjFormatado", "municipio", "registroProfissional", "ratificacaoObs", "apreciacaoObs", "cfResultadoRotulo", "defesaCEIReferencia", "urgenciaJustificativa", "motivo"];
function envenenar(v, chave) {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" && CAMPOS_TEXTO.includes(chave) ? `${x} ${ATAQUE}` : envenenar(x)));
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = envenenar(x, k); return o; }
  if (typeof v === "string" && CAMPOS_TEXTO.includes(chave)) return `${v} ${ATAQUE}`;
  return v;
}
const R = envenenar(REAL);
// o painel do contrato foi gravado cedo (sem intervenção correndo nem atraso): as listas também precisam passar pelo escape
R.painel.intervencoesCorrendo = [{ entidadeId: 1, entidade: `Escola ${ATAQUE}`, intervencaoId: 1, prazo: "2026-11-18", diasRestantes: 3 }];
R.painel.prestacoesAtrasadas = [{ entidadeId: 1, entidade: `Escola ${ATAQUE}`, periodo: `2025 ${ATAQUE}`, prazo: "2026-04-30" }];
R.painel.apuracoes = [{ entidadeId: 3, entidade: `Hospital ${ATAQUE}`, intervencaoId: 2, notificadoEm: "2026-11-01", decretavelDesde: "2026-11-06" }];
var MUTADO = null;
const FICHA_IV = REAL.entidadeIntervencao.entidade;
const IV = FICHA_IV.intervencoes.find((i) => i.status === "DECRETADA");

function montar({ presidente = false, permissoes = ["entidades_vinculadas"], geral = true } = {}) {
  const amb = criarAmbiente({ semModulo: true });
  amb.ev(MUTADO || lerApp("modulos/entidades-vinculadas.js"), "entidades-vinculadas.js");
  amb.sessao({ matricula: 1002, token: "tok", nivel: geral ? "GLOBAL" : "CONGREGACAO", permissoes, geral });
  amb.__respostas = {};
  amb.__anexos = [];
  amb.__confirmar = true;
  amb.ctx.confirm = () => amb.__confirmar;
  amb.ctx.abrirModalAnexos = (t, id, titulo) => { amb.__anexos.push([t, id, titulo]); };
  amb.ctx.HTMLElement = amb.ctx.HTMLElement || function () { };
  amb.api.servidor = (c) => {
    if (amb.__respostas[c.chave]) return amb.__respostas[c.chave];
    if (c.chave === "GET entidades-vinculadas/catalogos") return { corpo: { ...R.catalogos, papeis: { presidente } } };
    if (c.chave === "GET entidades-vinculadas/tipos") return { corpo: R.tipos };
    if (c.chave === "GET entidades-vinculadas/reunioes") return { corpo: c.consulta.orgao === "AG" ? R.reunioesAG : R.reunioesCLI };
    if (c.chave === "GET entidades-vinculadas/painel") return { corpo: R.painel };
    if (c.chave === "GET entidades-vinculadas/entidades") return { corpo: R.entidades };
    if (c.chave === "GET entidades-vinculadas/entidade") return { corpo: String(c.consulta.entidadeId) === String(FICHA_IV.entidadeId) ? R.entidadeIntervencao : R.entidadeFinal };
    if (c.chave === "POST entidades-vinculadas/entidade") return { status: 201, corpo: { sucesso: true, entidadeId: FICHA_IV.entidadeId, mensagem: `Cadastrada ${ATAQUE}` } };
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
const botaoForm = (amb, chave) => botoes(amb, "entFicha", "entAbrirFormAcao").find((b) => args(b)[0] === chave);
async function abrirAba(amb) { amb.g("mostrarAbaSecretaria")("entidades"); await amb.ocioso(); }
async function abrirFicha(amb, id = FICHA_IV.entidadeId) { await amb.g("entAbrirFichaAcao")(id); await amb.ocioso(); }

async function prova() {
  total = 0; falhas = 0;
  console.log("== contrato real ==");
  for (const k of ["catalogos", "tipos", "painel", "entidades", "entidadeIntervencao", "entidadeFinal", "reunioesCLI", "reunioesAG"]) ok(REAL[k] && REAL[k].sucesso, `o e2e-69 gravou a resposta real de ${k}`);
  ok(["funcoes", "motivosEncerramento", "motivosIntervencao", "periodicidades", "resultadosApreciacao", "resultadosCF", "resultadosAG", "destinos", "naturezas", "papeis"].every((k) => k in REAL.catalogos), "catálogos: as listas que a tela lê");
  ok(IV && IV.diasRestantes === 15 && IV.afastaDiretoria && FICHA_IV.dirigentes.some((d) => d.afastadoPelaIntervencao), "a ficha com a intervenção decretada, o prazo e a diretoria afastada");
  ok(REAL.entidadeFinal.entidade.periodos.some((p) => p.prestacao && p.prestacao.resultadoRotulo) && REAL.entidadeFinal.entidade.dirigentes.some((d) => d.motivoEncerramento === "DESTITUICAO_INTERVENCAO"), "a ficha final: prestação apreciada e destituídos");
  ok(REAL.reunioesCLI.reunioes.length > 0 && REAL.reunioesAG.reunioes.length > 0, "há reuniões da CLI e da Assembleia");
  ok(/entLimparTela\(\)/.test(lerApp("script.js")) && /entidades: \["entidades_vinculadas"\]/.test(lerApp("script.js")) && /"entidades"\]\);/.test(lerApp("script.js")), "script.js: a saída, a permissão e o nível geral");
  ok(/carregarOpcoesEntidadesAcao\(\)/.test(lerApp("modulos/meus-dados.js")) && /entCartaoMeusDados\(data\.entidadesVinculadas\)/.test(lerApp("modulos/meu-painel.js")), "os ganchos: abrir a aba e Meus Dados");
  ok(/\/modulos\/entidades-vinculadas\.js/.test(lerApp("service-worker.js")) && /modulos\/entidades-vinculadas\.js/.test(lerApp("index.html")), "o módulo na casca do aparelho e no index.html");

  console.log("== abrir a aba: o painel ==");
  let amb = montar();
  await abrirAba(amb);
  ok(amb.e("abaEntidades").style.display === "block", "a aba aparece com a permissão");
  ok(gets(amb, "entidades-vinculadas/catalogos").length === 1 && gets(amb, "entidades-vinculadas/painel").length === 1, "lê os catálogos e o painel");
  const painel = amb.e("entPainel").textContent;
  ok(/faltam 3 dia/.test(painel) && /18\/11\/2026/.test(painel) && /venceu em 30\/04\/2026/.test(painel) && /06\/11\/2026/.test(painel), "o painel: o prazo, o atraso e quando a decretação fica liberada", painel.slice(0, 300));
  ok(botoes(amb, "entPainel", "entAbrirFichaAcao").every((b) => typeof args(b)[0] === "number"), "cada item abre a ficha pelo número");
  semAtaque(amb, "o painel");
  let sem = montar({ permissoes: ["pessoas"] });
  await abrirAba(sem);
  ok(sem.e("abaEntidades").style.display !== "block", "sem a permissão: a aba não aparece");
  sem = montar({ geral: false });
  await abrirAba(sem);
  ok(sem.e("abaEntidades").style.display !== "block", "permissão de nível local: a aba não aparece (só o geral)");

  console.log("== a lista e a ficha ==");
  amb.g("entMostrarSecaoAcao")("entidades"); await amb.ocioso();
  ok(amb.e("entSecaoEntidades").style.display === "block" && amb.e("entSecaoPainel").style.display === "none", "a seção Entidades");
  ok(REAL.entidades.entidades.every((e) => amb.e("entLista").textContent.includes(e.nomeFantasia || e.razaoSocial)), "a lista com todas");
  semAtaque(amb, "a lista");
  await abrirFicha(amb);
  const ficha = amb.e("entFicha").textContent;
  ok(/Prazo fatal da CLI: 18\/11\/2026/.test(ficha) && /faltam 15 dia/.test(ficha) && /afastado pela intervenção/.test(ficha), "a ficha: o prazo fatal e a diretoria afastada", ficha.slice(0, 200));
  ok(!botaoForm(amb, "decretar") && !botaoForm(amb, "encerrarIntervencao") && botaoForm(amb, "ratificar"), "quem não é o Presidente: sem decretar nem encerrar; com a decisão da CLI");
  ok(botaoForm(amb, "homologar") && args(botaoForm(amb, "homologar"))[1].dirigenteId > 0, "a indicação esperando a CLI tem a homologação");
  semAtaque(amb, "a ficha");
  let pres = montar({ presidente: true });
  await abrirAba(pres); await abrirFicha(pres);
  ok(botaoForm(pres, "encerrarIntervencao"), "o Presidente: o botão de encerrar a intervenção");

  console.log("== a decisão da CLI ==");
  await amb.g("entAbrirFormAcao")("ratificar", { intervencaoId: IV.intervencaoId }); await amb.ocioso();
  const sel = amb.e("entCampo_sessaoId");
  ok(sel && sel.options.filter((o) => o.value).length === REAL.reunioesCLI.reunioes.length, "as reuniões da CLI na escolha");
  sel.value = String(REAL.reunioesCLI.reunioes[0].sessaoId);
  amb.e("entCampo_resultado").value = "RATIFICADA";
  amb.e("entCampo_observacao").value = "  dentro do prazo  ";
  amb.limparRegistro();
  await amb.g("entEnviarFormAcao")(); await amb.ocioso();
  let p = posts(amb, "entidades-vinculadas/intervencao-ratificar");
  ok(p.length === 1 && p[0].corpo.intervencaoId === IV.intervencaoId && p[0].corpo.sessaoId === String(REAL.reunioesCLI.reunioes[0].sessaoId) && p[0].corpo.resultado === "RATIFICADA" && p[0].corpo.observacao === "dentro do prazo",
    "manda a intervenção, a reunião, o resultado e a observação", p[0] && p[0].corpo);
  ok(gets(amb, "entidades-vinculadas/entidade").length === 1 && !amb.e("entFormAcao").innerHTML, "depois de gravar: relê a ficha e fecha o formulário");
  ok(amb.e("entMsgFicha").textContent.includes("Salvo"), "a mensagem do servidor (como texto)");
  semAtaque(amb, "a mensagem");

  console.log("== o duplo clique e a recusa ==");
  await amb.g("entAbrirFormAcao")("arquivar", { intervencaoId: 77 }); await amb.ocioso();
  amb.e("entCampo_motivo").value = "Motivo do arquivamento";
  amb.limparRegistro();
  await Promise.all([amb.g("entEnviarFormAcao")(), amb.g("entEnviarFormAcao")()]); await amb.ocioso();
  ok(posts(amb, "entidades-vinculadas/apuracao-arquivar").length === 1, "dois cliques: um pedido só");
  await amb.g("entAbrirFormAcao")("arquivar", { intervencaoId: 77 }); await amb.ocioso();
  amb.__respostas["POST entidades-vinculadas/apuracao-arquivar"] = { status: 422, corpo: { sucesso: false, mensagem: `Recusado ${ATAQUE}` } };
  amb.e("entCampo_motivo").value = "Outro motivo";
  await amb.g("entEnviarFormAcao")(); await amb.ocioso();
  ok(amb.e("entFormAcao").innerHTML && amb.e("entCampo_motivo").value === "Outro motivo" && /Recusado/.test(amb.e("entMsgFicha").textContent), "recusado: o formulário fica com o que foi digitado e a mensagem aparece");
  semAtaque(amb, "a recusa");

  console.log("== decretar (o Presidente) ==");
  pres.__respostas["GET entidades-vinculadas/entidade"] = { corpo: { sucesso: true, entidade: { ...R.entidadeIntervencao.entidade, intervencoes: [{ ...R.entidadeIntervencao.entidade.intervencoes[0], status: "APURACAO", decretadaEm: null }] } } };
  await abrirFicha(pres);
  ok(botaoForm(pres, "decretar") && botaoForm(pres, "notificar"), "apuração aberta: o Presidente vê decretar");
  amb.__respostas["GET entidades-vinculadas/entidade"] = pres.__respostas["GET entidades-vinculadas/entidade"];
  await abrirFicha(amb);
  ok(!botaoForm(amb, "decretar") && botaoForm(amb, "notificar"), "apuração aberta: quem não é o Presidente notifica, mas não vê decretar");
  delete amb.__respostas["GET entidades-vinculadas/entidade"];
  await pres.g("entAbrirFormAcao")("decretar", { intervencaoId: 9 }); await pres.ocioso();
  pres.e("entCampo_fundamentacao").value = "Fundamentação suficiente para a prova";
  pres.e("entCampo_interventorNome").value = "Interventor Externo";
  pres.e("entCampo_afastaDiretoria").checked = true;
  pres.__confirmar = false;
  pres.limparRegistro();
  await pres.g("entEnviarFormAcao")(); await pres.ocioso();
  ok(posts(pres, "entidades-vinculadas/intervencao-decretar").length === 0, "sem confirmar: nada é enviado");
  pres.__confirmar = true;
  await pres.g("entEnviarFormAcao")(); await pres.ocioso();
  p = posts(pres, "entidades-vinculadas/intervencao-decretar");
  ok(p.length === 1 && p[0].corpo.afastaDiretoria === true && p[0].corpo.urgencia === false && p[0].corpo.intervencaoId === 9 && p[0].corpo.interventorNome === "Interventor Externo", "confirmado: as marcas vão como verdadeiro/falso", p[0] && p[0].corpo);

  console.log("== prestação de contas e extinção ==");
  const amb2 = montar();
  await abrirAba(amb2);
  amb2.__respostas["GET entidades-vinculadas/entidade"] = { corpo: R.entidadeFinal };
  await abrirFicha(amb2, 999);
  const fichaFinal = amb2.e("entFicha").textContent;
  ok(REAL.entidadeFinal.entidade.periodos.filter((x) => x.situacao === "ATRASADA").every((x) => fichaFinal.includes(x.codigo)) && /Atrasada/.test(fichaFinal), "os períodos com o atrasado marcado");
  const reg = botaoForm(amb2, "prestacaoRegistrar");
  ok(reg && typeof args(reg)[1].periodo === "string" && args(reg)[1].entidadeId === REAL.entidadeFinal.entidade.entidadeId, "o botão de entrega leva o período e a entidade");
  await amb2.g("entAbrirFormAcao")(...args(reg)); await amb2.ocioso();
  amb2.e("entCampo_entregueEm").value = "2026-03-10";
  amb2.e("entCampo_relatorioAtividades").checked = true;
  amb2.limparRegistro();
  await amb2.g("entEnviarFormAcao")(); await amb2.ocioso();
  p = posts(amb2, "entidades-vinculadas/prestacao-registrar");
  ok(p.length === 1 && p[0].corpo.periodo === args(reg)[1].periodo && p[0].corpo.relatorioAtividades === true && p[0].corpo.balancoAuditado === false, "a entrega: o período e as marcas como estão", p[0] && p[0].corpo);
  semAtaque(amb2, "a ficha final");
  // extinção: só os destinos da natureza da entidade
  const natureza = REAL.entidadeFinal.entidade.natureza;
  if (REAL.entidadeFinal.entidade.status === "ATIVA") {
    await amb2.g("entAbrirFormAcao")("extinguir", { entidadeId: REAL.entidadeFinal.entidade.entidadeId }); await amb2.ocioso();
    const ops = amb2.e("entCampo_destinoPatrimonio").options.filter((o) => o.value).map((o) => o.value);
    const certos = REAL.catalogos.destinos.filter((d) => d.naturezas.includes(natureza)).map((d) => d.codigo);
    ok(ops.length && ops.join() === certos.join(), "a extinção: só os destinos da natureza (Art. 68)", { ops, certos });
  }
  amb2.g("entAnexosAcao")("EntidadesVinculadas", 5, "Escola");
  ok(amb2.__anexos.length === 1 && amb2.__anexos[0][0] === "EntidadesVinculadas" && amb2.__anexos[0][1] === 5, "documentos: abre os anexos da entidade");

  console.log("== tipos e cadastro ==");
  amb.g("entMostrarSecaoAcao")("tipos"); await amb.ocioso();
  const tipo = REAL.tipos.tipos.find((t) => t.formacoes.length === 2);
  amb.g("entEditarTipoAcao")(tipo.tipoId);
  ok(amb.e("entTipoFormacoes").value.split("\n").length === 2 && amb.e("entTipoNatureza").value === tipo.natureza, "editar o tipo: as formações uma por linha e a natureza");
  amb.e("entTipoFormacoes").value = "Medicina\n\n  Gestão hospitalar \n";
  amb.limparRegistro();
  await amb.g("entSalvarTipoAcao")(); await amb.ocioso();
  p = posts(amb, "entidades-vinculadas/tipo-editar");
  ok(p.length === 1 && p[0].corpo.tipoId === tipo.tipoId && JSON.stringify(p[0].corpo.formacoes) === JSON.stringify(["Medicina", "Gestão hospitalar"]), "salvar: a lista sem linhas vazias", p[0] && p[0].corpo);
  semAtaque(amb, "os tipos");
  amb.g("entMostrarSecaoAcao")("entidades"); await amb.ocioso();
  ok(amb.e("entNovaTipo").options.filter((o) => o.value).length === REAL.tipos.tipos.filter((t) => t.ativo).length, "o cadastro: só os tipos ativos");
  amb.e("entNovaRazao").value = "Nova Entidade";
  amb.e("entNovaCnpj").value = "11.222.333/0001-81";
  amb.e("entNovaTipo").value = String(tipo.tipoId);
  amb.e("entNovaFinalidade").value = "Finalidade da prova";
  amb.limparRegistro();
  await amb.g("entSalvarNovaAcao")(); await amb.ocioso();
  p = posts(amb, "entidades-vinculadas/entidade");
  ok(p.length === 1 && p[0].corpo.cnpj === "11.222.333/0001-81" && p[0].corpo.tipoId === String(tipo.tipoId), "cadastrar manda o que foi digitado (o servidor confere o CNPJ)");
  ok(amb.e("entNovaRazao").value === "" && gets(amb, "entidades-vinculadas/entidade").length === 1, "limpa o formulário e abre a ficha nova");

  console.log("== Meus Dados ==");
  const cartao = amb.g("entCartaoMeusDados")({ funcoes: [{ funcao: `Gestor ${ATAQUE}`, entidade: `Escola ${ATAQUE}`, situacao: "Homologado", indicadoEm: "2026-10-01", remunerado: true }], comoInterventor: [] });
  ok(/Escola/.test(cartao) && !/<img/.test(cartao), "o cartão de Meus Dados escapa o texto");
  ok(amb.g("entCartaoMeusDados")({ funcoes: [], comoInterventor: [] }) === "" && amb.g("entCartaoMeusDados")(null) === "", "sem função: o cartão não aparece");

  console.log("== a saída da sessão ==");
  const amb3 = montar();
  await abrirAba(amb3);
  const pendente = amb3.g("entAbrirFichaAcao")(FICHA_IV.entidadeId);
  amb3.e("entNovaRazao").value = "digitado antes de sair";
  amb3.g("limparSessao")();
  await pendente; await amb3.ocioso();
  ok(amb3.e("entFicha").innerHTML === "" && amb3.e("entPainel").innerHTML === "" && amb3.e("entNovaRazao").value === "", "nada da sessão anterior fica: nem a ficha (a resposta atrasada não pinta), nem o painel, nem o digitado");
  // outro login entra sem passar pela saída (a troca de sessão): a resposta pedida pelo login anterior não pinta
  const amb4 = montar();
  await abrirAba(amb4);
  amb4.e("entPainel").innerHTML = "";
  const pendente4 = amb4.g("entCarregarPainelAcao")();
  amb4.sessao({ matricula: 2002, token: "outro", nivel: "GLOBAL", permissoes: ["entidades_vinculadas"], geral: true });
  await pendente4; await amb4.ocioso();
  ok(!/faltam 3 dia/.test(amb4.e("entPainel").textContent), "a resposta do login anterior não pinta o painel do novo");
  return { total, falhas };
}

const MUTACOES = [
  ["tirar o escape do nome na lista", ["<td><strong>${entH(e.nomeFantasia || e.razaoSocial)}</strong>", "<td><strong>${e.nomeFantasia || e.razaoSocial}</strong>"]],
  ["tirar o escape dos fatos", ["<p class=\"subtitle\">${entH(i.fatos)}</p>", "<p class=\"subtitle\">${i.fatos}</p>"]],
  ["tirar o escape do painel", ["\\`<strong>\\${entH(x.entidade)}</strong> — \\${Number(x.diasRestantes)".replace(/\\/g, ""), "`<strong>${x.entidade}</strong> — ${Number(x.diasRestantes)"]],
  ["mostrar decretar a quem não é o Presidente", ["i.status === \"APURACAO\" && presidente ? entBotao(\"⚖️ Decretar intervenção\"", "i.status === \"APURACAO\" ? entBotao(\"⚖️ Decretar intervenção\""]],
  ["deixar o duplo clique gravar duas vezes", ["  if (entOcupado) { entMensagem(alvoMsg, \"Aguarde: a gravação anterior ainda está em andamento.\"); return null; }", ""]],
  ["esquecer os valores fixos do ato", ["const corpo = { ...entForm.fixos };", "const corpo = {};"]],
  ["mandar a marca como texto", ["corpo[c.id] = c.tipo === \"check\" ? !!el.checked : String(el.value || \"\").trim();", "corpo[c.id] = String(el.value || \"\").trim();"]],
  ["decretar sem confirmar", ["if (entForm.chave === \"decretar\" && !window.confirm(", "if (false && !window.confirm("]],
  ["pintar a resposta de outro login", ["  return authToken === token ? data : null;\n}\nasync function entPost", "  return data;\n}\nasync function entPost"]],
  ["não limpar a ficha na saída", ["for (const idEl of [\"entPainel\", \"entLista\", \"entFicha\",", "for (const idEl of [\"entPainel\", \"entLista\","]],
  ["mostrar todos os destinos na extinção", [".filter((d) => Array.isArray(d.naturezas) && d.naturezas.includes(e.natureza))", ""]],
  ["tirar o escape de Meus Dados", ["${entH(f.funcao)} — ${entH(f.entidade)}", "${f.funcao} — ${f.entidade}"]]
];

(async () => {
  const r = await prova();
  console.log(`\nprova da tela da v9.1 (entidades vinculadas): ${r.total - r.falhas}/${r.total} verificações ok${r.falhas ? ` — ${r.falhas} FALHA(S)` : ""}`);
  let mutFalhou = 0;
  if (process.env.MUTAR) {
    const fonte = lerApp("modulos/entidades-vinculadas.js");
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
