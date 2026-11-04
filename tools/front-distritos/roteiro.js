// roteiro.js — prova da tela da v9.3 (Distritos) sem navegador: o index.html de verdade, o eventos.js, o modulos/expansao.js (a aba) e o modulos/distritos.js (a
// pílula) inteiros, num DOM simulado (tools/front-cuidado/ambiente.js). As respostas do servidor vêm de contrato-real.json — gravado pelo e2e-73 com os handlers e o
// banco REAIS (`E2E_CONTRATO=1 BASE=cenario-distritos bash rodar.sh roteiro e2e-73-distritos.js` em tools/e2e-localdb) — com texto de ataque em todo campo de texto.
// Rodar: node roteiro.js (da pasta tools/front-distritos). MUTAR=1 roda também as mutações (cada uma precisa ser acusada).
"use strict";
const { criarAmbiente, lerApp } = require("../front-cuidado/ambiente");
const REAL = require("./contrato-real.json");
const EXP = require("../front-expansao/contrato-real.json");

const ATAQUE = '<img src=x onerror="__xss(1)">';
let total = 0, falhas = 0;
const ok = (c, d, det) => { total++; if (!c) { falhas++; if (!process.env.CALADO) console.log(`  ✗ ${d}${det !== undefined ? ` — ${JSON.stringify(det).slice(0, 300)}` : ""}`); } else if (process.env.LISTA) console.log(`  ✓ ${d}`); };

// os campos de texto (os códigos — situação, status, gatilho, motivo — vêm de listas fechadas do servidor; os rótulos deles, sim, são envenenados)
const CAMPOS_TEXTO = ["nome", "pastor", "cidade", "fundamentacao", "fontePopulacao", "gatilhoRotulo", "area", "regiao", "quadrante", "motivoRotulo", "resultado", "statusRotulo",
  "enviadoPorNome", "analisadoPorNome", "observacoes", "motivoDevolucao", "desativacaoMotivo", "descricao", "mensagem", "medidas", "distrito"];
function envenenar(v, chave) {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" && CAMPOS_TEXTO.includes(chave) ? `${x} ${ATAQUE}` : envenenar(x)));
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      // os catálogos { CÓDIGO: rótulo }: o rótulo é texto do servidor
      if (["gatilhos", "motivos", "medidas", "statusBalanco"].includes(k) && x && typeof x === "object" && !Array.isArray(x)) {
        o[k] = Object.fromEntries(Object.entries(x).map(([c, r]) => [c, `${r} ${ATAQUE}`]));
      } else o[k] = envenenar(x, k);
    }
    return o;
  }
  if (typeof v === "string" && CAMPOS_TEXTO.includes(chave)) return `${v} ${ATAQUE}`;
  return v;
}
const R = envenenar(REAL);
var MUTADO = null;   // { arquivo, texto }
const FICHA = R.fichaGeral.distrito;
const ID = FICHA.distritoId;

function montar({ permissoes = ["expansao", "distritos"], geral = true, catalogo = "catalogosGeral", ficha = "fichaGeral" } = {}) {
  const amb = criarAmbiente({ semModulo: true });
  amb.ev(MUTADO && MUTADO.arquivo === "expansao" ? MUTADO.texto : lerApp("modulos/expansao.js"), "expansao.js");
  amb.ev(MUTADO && MUTADO.arquivo === "distritos" ? MUTADO.texto : lerApp("modulos/distritos.js"), "distritos.js");
  amb.sessao({ matricula: 1002, token: "tok", nivel: geral ? "GLOBAL" : "DISTRITO", permissoes, geral });
  amb.__respostas = {};
  amb.__ficha = ficha;
  amb.ctx.HTMLElement = amb.ctx.HTMLElement || function () { };
  amb.api.servidor = (c) => {
    if (amb.__respostas[c.chave]) return amb.__respostas[c.chave];
    if (c.chave === "GET expansao/catalogos") return { corpo: EXP.catalogosGeral };
    if (c.chave === "GET expansao/reunioes") return { corpo: EXP.reunioes };
    if (c.chave === "GET expansao/painel") return { corpo: EXP.painelVencido };
    if (c.chave === "GET distritos/catalogos") return { corpo: R[catalogo] };
    if (c.chave === "GET distritos/reunioes") return { corpo: R.reunioes };
    if (c.chave === "GET distritos/painel") return { corpo: R.painelGeral };
    if (c.chave === "GET distritos/lista") return { corpo: R.listaNIF };
    if (c.chave === "GET distritos/ficha") return { corpo: String(c.consulta.distritoId) === "999" ? { sucesso: true, distrito: { ...R[amb.__ficha].distrito, distritoId: 999, nome: "Outro Distrito" } } : R[amb.__ficha] };
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
const botaoForm = (amb, chave) => botoes(amb, "dstFicha", "dstAbrirFormAcao").find((b) => args(b)[0] === chave);
async function abrirAba(amb) { amb.g("mostrarAbaSecretaria")("expansao"); await amb.ocioso(); }
async function abrirDistritos(amb) { await abrirAba(amb); amb.g("expMostrarSecaoAcao")("distritos"); await amb.ocioso(); }
async function abrirFicha(amb, id = ID) { await amb.g("dstAbrirFichaAcao")(id); await amb.ocioso(); }
const visivel = (amb, id) => amb.e(id) && amb.e(id).style.display !== "none";
async function confirmarEnvio(amb, confirmar = true) {
  const pend = amb.g("dstEnviarFormAcao")();
  const modal = await amb.responderModal(confirmar);
  await pend; await amb.ocioso();
  return modal;
}

async function prova() {
  total = 0; falhas = 0;
  console.log("== contrato real ==");
  for (const k of ["catalogosGeral", "catalogosDistrito", "catalogosNIF", "painelGeral", "listaNIF", "listaDistrito", "fichaGeral", "fichaPresidente", "fichaDistritoEnvio", "fichaNIF",
    "fichaSobIntervencao", "fichaDesativada", "reunioes"]) ok(REAL[k] && REAL[k].sucesso, `o e2e-73 gravou a resposta real de ${k}`);
  ok(["gatilhos", "motivos", "medidas", "statusBalanco", "ufs", "papeis"].every((k) => k in REAL.catalogosGeral), "catálogos: as listas que a tela lê");
  ok(REAL.fichaNIF.distrito.balancos.some((b) => b.status === "ENVIADO") && REAL.fichaSobIntervencao.distrito.intervencoes[0].aberta && REAL.fichaDesativada.distrito.acoes.ativar,
    "as fichas: a do NIF (balanço enviado), sob intervenção e desativada");
  ok(/expansao: \["expansao", "distritos"\]/.test(lerApp("script.js")) && /dstCartaoMeusDados\(data\)/.test(lerApp("modulos/meu-painel.js")), "os ganchos: a aba abre com 'distritos' e o cartão de Meus Dados");
  ok(/\/modulos\/distritos\.js/.test(lerApp("service-worker.js")) && /modulos\/distritos\.js/.test(lerApp("index.html")) && /id="btnExpSecaoDistritos"/.test(lerApp("index.html")), "o módulo na casca do aparelho, no index.html e a pílula");

  console.log("== abrir a pílula ==");
  let amb = montar();
  await abrirAba(amb);
  ok(["Painel", "Pedidos", "Extensoes", "Distritos"].every((s) => visivel(amb, `btnExpSecao${s}`)), "com as duas permissões: as quatro pílulas");
  amb.g("expMostrarSecaoAcao")("distritos"); await amb.ocioso();
  ok(amb.e("expSecaoDistritos").style.display === "block" && amb.e("expSecaoPainel").style.display === "none", "a seção dos Distritos");
  ok(gets(amb, "distritos/catalogos").length === 1 && gets(amb, "distritos/reunioes").length === 1 && gets(amb, "distritos/painel").length === 1 && gets(amb, "distritos/lista").length === 1,
    "o nível geral lê os catálogos, as reuniões da CLI, o painel e a lista");
  const lista = amb.e("dstLista").textContent;
  ok(REAL.listaNIF.distritos.every((d) => lista.includes(d.nome)) && /Pastor Distrital E2E/.test(lista), "a lista: todos os Distritos e o Pastor", lista.slice(0, 300));
  ok(botoes(amb, "dstLista", "dstAbrirFichaAcao").every((b) => typeof args(b)[0] === "number"), "cada linha abre a ficha pelo número");
  semAtaque(amb, "a lista");
  const soDist = montar({ permissoes: ["distritos"], geral: false, catalogo: "catalogosDistrito", ficha: "fichaDistritoEnvio" });
  await abrirAba(soDist);
  ok(soDist.e("abaExpansao").style.display === "block", "só com 'distritos': a aba aparece");
  ok(!visivel(soDist, "btnExpSecaoPainel") && !visivel(soDist, "btnExpSecaoPedidos") && !visivel(soDist, "btnExpSecaoExtensoes") && visivel(soDist, "btnExpSecaoDistritos")
    && soDist.e("expSecaoDistritos").style.display === "block", "só a pílula dos Distritos, aberta direto");
  ok(soDist.api.chamadas.filter((c) => c.caminho.startsWith("expansao/")).length === 0, "não pede nada da Expansão");
  ok(gets(soDist, "distritos/reunioes").length === 0, "quem não é do nível geral não pede as reuniões da CLI");
  const soExp = montar({ permissoes: ["expansao"] });
  await abrirAba(soExp);
  ok(!visivel(soExp, "btnExpSecaoDistritos") && visivel(soExp, "btnExpSecaoPainel"), "só com 'expansao': sem a pílula dos Distritos");
  soExp.g("expMostrarSecaoAcao")("distritos"); await soExp.ocioso();
  ok(soExp.e("expSecaoDistritos").style.display !== "block" && gets(soExp, "distritos/catalogos").length === 0, "e pedir a seção dos Distritos não a abre");

  console.log("== a ficha ==");
  await abrirFicha(amb);
  let ficha = amb.e("dstFicha").textContent;
  ok(ficha.includes(FICHA.nome.split(" <")[0]) && /CDE/.test(ficha) && /Superintendente Dist E2E/.test(ficha) && /Vice Quadrante E2E/.test(ficha), "a ficha: o nome e o CDE", ficha.slice(0, 200));
  ok(/Dízimo Institucional/.test(ficha) && /repassado/.test(ficha) && /Belém/.test(ficha) && /Central E2E/.test(ficha), "o mês a mês, o decreto e o território");
  ok(botaoForm(amb, "desativar") && !botaoForm(amb, "intervir") && !botaoForm(amb, "ativar") && !botaoForm(amb, "balanco"), "o nível geral: desativar; intervir não (não é o Presidente)");
  semAtaque(amb, "a ficha");
  const pres = montar({ ficha: "fichaPresidente" });
  await abrirDistritos(pres); await abrirFicha(pres);
  ok(botaoForm(pres, "intervir"), "o Presidente vê a intervenção");

  console.log("== ativar (decreto da CLI) ==");
  const ativ = montar({ ficha: "fichaDesativada" });
  await abrirDistritos(ativ); await abrirFicha(ativ);
  ok(botaoForm(ativ, "ativar") && /desativado em/.test(ativ.e("dstFicha").textContent), "desativado: o botão de ativar e o período no histórico");
  await ativ.g("dstAbrirFormAcao")("ativar"); await ativ.ocioso();
  ok(ativ.e("dstCampo_gatilho").options.filter((o) => o.value).length === 2 && ativ.e("dstCampo_uf").options.length > 20 && ativ.e("dstCampo_sessaoId").options.filter((o) => o.value).length === REAL.reunioes.reunioes.length,
    "o formulário: os gatilhos, as UFs e as reuniões da CLI");
  ok(ativ.e("dstCampo_gatilho").options.every((o) => !/<img/.test(o.innerHTML || "") ) && !/<img/.test(ativ.e("dstCampo_gatilho").innerHTML.replace(/&lt;img/g, "")), "os rótulos do catálogo entram como texto",
    ativ.e("dstCampo_gatilho").innerHTML.slice(0, 200));
  semAtaque(ativ, "o formulário do decreto");
  ativ.e("dstCampo_sessaoId").value = String(REAL.reunioes.reunioes[0].sessaoId);
  ativ.e("dstCampo_gatilho").value = "MILHAO";
  ativ.e("dstCampo_cidade").value = "Belém";
  ativ.e("dstCampo_uf").value = "PA";
  ativ.e("dstCampo_populacao").value = "900.000";
  ativ.e("dstCampo_fundamentacao").value = "Decreto da CLI.";
  ativ.limparRegistro();
  await ativ.g("dstEnviarFormAcao")(); await ativ.ocioso();
  ok(/MAIS de 1\.000\.000|mais de 1\.000\.000/.test(ativ.e("dstMsgForm").textContent) && posts(ativ, "distritos/ativar").length === 0 && ativ.e("modalOverlay").classList.contains("escondido"),
    "gatilho (b) com menos de um milhão: avisa antes de perguntar, nada vai", ativ.e("dstMsgForm").textContent);
  ativ.e("dstCampo_gatilho").value = "METROPOLE";
  ativ.e("dstCampo_populacao").value = "";
  let modal = await confirmarEnvio(ativ, false);
  ok(modal.aberto && /repasse das congregações do território vai para o Distrito/.test(modal.texto) && posts(ativ, "distritos/ativar").length === 0, "a pergunta diz a consequência — cancelado, nada vai", modal);
  modal = await confirmarEnvio(ativ, true);
  let p = posts(ativ, "distritos/ativar");
  ok(p.length === 1 && p[0].corpo.distritoId === ID && p[0].corpo.gatilho === "METROPOLE" && p[0].corpo.sessaoId === String(REAL.reunioes.reunioes[0].sessaoId) && !("populacao" in p[0].corpo) && !("fontePopulacao" in p[0].corpo),
    "confirmado: manda o Distrito e o decreto; a população em branco não vai", p[0] && p[0].corpo);
  ok(gets(ativ, "distritos/ficha").length === 1 && /Salvo/.test(ativ.e("dstMsgFicha").textContent) && ativ.e("dstFormAcao").innerHTML === "", "relê a ficha e mostra a mensagem (como texto)");
  semAtaque(ativ, "a mensagem");

  console.log("== intervenção ==");
  await pres.g("dstAbrirFormAcao")("intervir"); await pres.ocioso();
  ok(pres.e("dstCampo_bloqueioContas") && pres.e("dstCampo_procuracao") && pres.e("dstCampo_judicial"), "as três medidas como marcação");
  pres.e("dstCampo_motivo").value = "DESVINCULACAO";
  pres.e("dstCampo_fundamentacao").value = "Estatuto paralelo registrado.";
  pres.e("dstCampo_interventorMembroId").value = "abc";
  pres.limparRegistro();
  await pres.g("dstEnviarFormAcao")(); await pres.ocioso();
  ok(/matrícula do Interventor é um número/.test(pres.e("dstMsgForm").textContent) && posts(pres, "distritos/intervir").length === 0, "matrícula que não é número: avisa, nada vai");
  pres.e("dstCampo_interventorMembroId").value = " 9505 ";
  pres.e("dstCampo_bloqueioContas").checked = true;
  modal = await confirmarEnvio(pres, true);
  p = posts(pres, "distritos/intervir");
  ok(modal.aberto && /acesso de toda a liderança do Distrito termina/.test(modal.texto) && /não se desfaz/.test(modal.texto), "a pergunta diz o que acontece na hora", modal.texto);
  ok(p.length === 1 && p[0].corpo.distritoId === ID && p[0].corpo.interventorMembroId === "9505" && p[0].corpo.bloqueioContas === true && p[0].corpo.procuracao === false && p[0].corpo.judicial === false,
    "manda o Interventor e as medidas como verdadeiro/falso", p[0] && p[0].corpo);
  const sobIv = montar({ ficha: "fichaSobIntervencao" });
  await abrirDistritos(sobIv); await abrirFicha(sobIv);
  ficha = sobIv.e("dstFicha").textContent;
  ok(botaoForm(sobIv, "encerrar") && !botaoForm(sobIv, "intervir") && /Aberta\./.test(ficha) && /sem o acesso/.test(ficha), "sob intervenção: encerrar e o aviso do acesso do Interventor");
  semAtaque(sobIv, "a intervenção");
  // duplo clique: dois envios ao mesmo tempo, uma pergunta e um pedido só
  await sobIv.g("dstAbrirFormAcao")("encerrar"); await sobIv.ocioso();
  sobIv.e("dstCampo_resultado").value = "Estatuto anulado e contas regularizadas.";
  sobIv.limparRegistro();
  const d1 = sobIv.g("dstEnviarFormAcao")(), d2 = sobIv.g("dstEnviarFormAcao")();
  await sobIv.responderModal(true);
  await d1; await d2; await sobIv.ocioso();
  ok(posts(sobIv, "distritos/encerrar").length === 1, "dois cliques: um pedido só");
  // outro envio enquanto a gravação anterior ainda está no servidor: recusado na tela, um pedido só
  await sobIv.g("dstAbrirFormAcao")("encerrar"); await sobIv.ocioso();
  sobIv.e("dstCampo_resultado").value = "Estatuto anulado e contas regularizadas.";
  sobIv.limparRegistro();
  const retido = sobIv.retem((c) => c.chave === "POST distritos/encerrar");
  const g1 = sobIv.g("dstEnviarFormAcao")();
  await sobIv.responderModal(true); await sobIv.ocioso();
  const g2 = sobIv.g("dstEnviarFormAcao")();
  await sobIv.responderModal(true); await sobIv.ocioso();
  retido.liberar(); await g1; await g2; await sobIv.ocioso();
  ok(posts(sobIv, "distritos/encerrar").length === 1, "o segundo envio durante a gravação: um pedido só");

  console.log("== balanço anual ==");
  await abrirFicha(soDist);
  ok(botaoForm(soDist, "balanco") && !botaoForm(soDist, "desativar"), "a Tesoureira: enviar o balanço; os decretos não");
  await soDist.g("dstAbrirFormAcao")("balanco"); await soDist.ocioso();
  const anos = soDist.e("dstCampo_ano").options.filter((o) => o.value).map((o) => o.value);
  ok(anos.length === REAL.fichaDistritoEnvio.distrito.anosParaBalanco.length && anos.every((a) => REAL.fichaDistritoEnvio.distrito.anosParaBalanco.includes(Number(a))), "só os anos que o servidor oferece", anos);
  soDist.e("dstCampo_ano").value = anos[0];
  soDist.e("dstCampo_receitas").value = "120.000,00";
  soDist.e("dstCampo_despesas").value = "95.500,50";
  soDist.e("dstCampo_saldoFinal").value = "-1,00";
  soDist.limparRegistro();
  modal = await confirmarEnvio(soDist, true);
  p = posts(soDist, "distritos/balanco");
  ok(p.length === 1 && p[0].corpo.ano === anos[0] && p[0].corpo.receitas === "120.000,00" && p[0].corpo.saldoFinal === "-1,00" && p[0].corpo.distritoId === ID, "manda o ano e os valores como escritos (o servidor converte)", p[0] && p[0].corpo);
  // a recusa do servidor fica dentro do formulário
  await soDist.g("dstAbrirFormAcao")("balanco"); await soDist.ocioso();
  soDist.e("dstCampo_ano").value = anos[0];
  for (const c of ["receitas", "despesas", "saldoFinal"]) soDist.e(`dstCampo_${c}`).value = "1";
  soDist.__respostas["POST distritos/balanco"] = { status: 422, corpo: { sucesso: false, mensagem: `O balanço deste ano já está com o NIF ${ATAQUE}` } };
  await confirmarEnvio(soDist, true);
  ok(/já está com o NIF/.test(soDist.e("dstMsgForm").textContent) && soDist.e("dstCampo_receitas").value === "1", "a recusa aparece no formulário, que continua aberto com o digitado");
  semAtaque(soDist, "a recusa");
  const nif = montar({ permissoes: ["distritos"], geral: false, catalogo: "catalogosNIF", ficha: "fichaNIF" });
  await abrirAba(nif); await abrirFicha(nif);
  const analisar = botoes(nif, "dstFicha", "dstAbrirFormAcao").filter((b) => args(b)[0] === "analisar");
  ok(analisar.length === 2 && analisar.every((b) => typeof args(b)[1].balancoId === "number"), "o NIF: aprovar e devolver o balanço enviado", analisar.map(args));
  // a mesma ficha (com o balanço enviado), para quem o servidor diz que não analisa
  const naoNif = montar({ permissoes: ["distritos"], geral: false, catalogo: "catalogosDistrito", ficha: "fichaNIF" });
  naoNif.__respostas["GET distritos/ficha"] = { corpo: { sucesso: true, distrito: { ...R.fichaNIF.distrito, acoes: { ...R.fichaNIF.distrito.acoes, analisarBalanco: false } } } };
  await abrirAba(naoNif); await abrirFicha(naoNif);
  ok(!botoes(naoNif, "dstFicha", "dstAbrirFormAcao").some((b) => args(b)[0] === "analisar") && /Enviado/.test(naoNif.e("dstFicha").textContent), "quem não é do NIF vê o balanço enviado, sem a análise");
  const devolver = analisar.find((b) => args(b)[1].decisao === "DEVOLVER");
  await nif.g("dstAbrirFormAcao")(...args(devolver)); await nif.ocioso();
  nif.limparRegistro();
  await nif.g("dstEnviarFormAcao")(); await nif.ocioso();
  ok(/Preencha: Motivo da devolução/.test(nif.e("dstMsgForm").textContent) && posts(nif, "distritos/analisar").length === 0, "devolver sem o motivo: avisa, nada vai", nif.e("dstMsgForm").textContent);
  nif.e("dstCampo_motivo").value = "Falta o extrato.";
  await confirmarEnvio(nif, true);
  p = posts(nif, "distritos/analisar");
  ok(p.length === 1 && p[0].corpo.balancoId === args(devolver)[1].balancoId && p[0].corpo.decisao === "DEVOLVER" && p[0].corpo.motivo === "Falta o extrato." && !("distritoId" in p[0].corpo),
    "manda o balanço, a decisão e o motivo", p[0] && p[0].corpo);

  console.log("== troca de ficha durante a gravação ==");
  const troca = montar({ ficha: "fichaPresidente" });
  await abrirDistritos(troca); await abrirFicha(troca);
  await troca.g("dstAbrirFormAcao")("desativar"); await troca.ocioso();
  troca.e("dstCampo_sessaoId").value = String(REAL.reunioes.reunioes[0].sessaoId);
  troca.e("dstCampo_motivo").value = "A CLI desativou o Distrito.";
  const ret = troca.retem((c) => c.chave === "POST distritos/desativar");
  const envio = troca.g("dstEnviarFormAcao")();
  await troca.responderModal(true); await troca.ocioso();
  await troca.g("dstAbrirFichaAcao")(999); await troca.ocioso();
  ret.liberar(); await envio; await troca.ocioso();
  ok(/Outro Distrito/.test(troca.e("dstFicha").textContent) && !/Salvo/.test(troca.e("dstMsgFicha").textContent) && troca.toasts().some((t) => /Salvo/.test(t)),
    "a resposta da ficha anterior vira aviso e não pinta a ficha aberta agora");

  console.log("== Meus Dados ==");
  const cartao = amb.g("dstCartaoMeusDados")({ distritos: { balancosEnviados: [{ distrito: `Belém ${ATAQUE}`, ano: 2025, versao: 1, status: `Enviado ${ATAQUE}`, enviadoEm: "2026-01-10" }],
    intervencoesComoInterventor: [{ distrito: `Manaus ${ATAQUE}`, decretadaEm: "2026-02-01", encerradaEm: null }] } });
  ok(/Belém/.test(cartao) && /Manaus/.test(cartao) && !/<img/.test(cartao) && /em curso/.test(cartao), "o cartão de Meus Dados escapa o texto");
  ok(amb.g("dstCartaoMeusDados")({}) === "" && amb.g("dstCartaoMeusDados")(null) === "" && amb.g("dstCartaoMeusDados")({ distritos: { balancosEnviados: [], intervencoesComoInterventor: [] } }) === "",
    "sem nada: o cartão não aparece");

  console.log("== a saída da sessão ==");
  const s1 = montar();
  await abrirDistritos(s1);
  const pendente = s1.g("dstAbrirFichaAcao")(ID);
  s1.g("limparSessao")();
  await pendente; await s1.ocioso();
  ok(s1.e("dstFicha").innerHTML === "" && s1.e("dstLista").innerHTML === "" && s1.e("dstBlocoFicha").style.display === "none", "nada da sessão anterior fica: nem a lista, nem a ficha (a resposta atrasada não pinta)");
  const s2 = montar();
  await abrirDistritos(s2);
  s2.e("dstLista").innerHTML = "";
  const pend2 = s2.g("dstCarregarListaAcao")();
  s2.sessao({ matricula: 2002, token: "outro", nivel: "GLOBAL", permissoes: ["distritos"], geral: true });
  await pend2; await s2.ocioso();
  ok(!/Distrito Belém/.test(s2.e("dstLista").textContent), "a resposta do login anterior não pinta a lista do novo");
  return { total, falhas };
}

const MUTACOES = [
  ["distritos", "tirar o escape do nome na lista", ["<td><strong>${dstH(d.nome)}</strong></td>", "<td><strong>${d.nome}</strong></td>"]],
  ["distritos", "tirar o escape do território", ["<tr><td>${dstH(c.nome)}${c.ativa", "<tr><td>${c.nome}${c.ativa"]],
  ["distritos", "tirar o escape da fundamentação da intervenção", ["<span class=\"subtitle\">${dstH(i.fundamentacao)}</span>", "<span class=\"subtitle\">${i.fundamentacao}</span>"]],
  ["distritos", "tirar o escape das medidas", ["medidas: ${i.medidas.map(dstH).join", "medidas: ${i.medidas.join"]],
  ["distritos", "tirar o escape dos rótulos do catálogo", ["`<option value=\"${dstH(o.codigo)}\">${dstH(o.rotulo)}</option>`", "`<option value=\"${dstH(o.codigo)}\">${o.rotulo}</option>`"]],
  ["distritos", "mostrar a intervenção a quem o servidor nega", ["a.intervir ? dstBotao(\"🛑 Decretar intervenção\", \"intervir\") : \"\"", "dstBotao(\"🛑 Decretar intervenção\", \"intervir\")"]],
  ["distritos", "mostrar a análise a quem não é do NIF", ["${a.analisarBalanco && b.status === \"ENVIADO\" ?", "${b.status === \"ENVIADO\" ?"]],
  ["distritos", "deixar o duplo clique gravar duas vezes", ["  if (dstOcupado) { dstMensagem(alvoMsg, \"Aguarde: a gravação anterior ainda está em andamento.\"); return null; }", ""]],
  ["distritos", "a pergunta aberta duas vezes", ["    if (dstConfirmando) return;\n", ""]],
  ["distritos", "esquecer o Distrito no ato", [": { distritoId: Number(dstFicha.distritoId) };", ": {};"]],
  ["distritos", "mandar as medidas como texto", ["corpo[c.id] = c.tipo === \"check\" ? !!el.checked : String(el.value || \"\").trim();", "corpo[c.id] = String(el.value || \"\").trim();"]],
  ["distritos", "atos sem volta sem confirmar", ["    try { sim = await confirmarAcao(pergunta, \"Confirmar\"); } finally { dstConfirmando = false; }", "    try { sim = true; } finally { dstConfirmando = false; }"]],
  ["distritos", "recusa fora do formulário", ["dstMensagem(\"dstMsgForm\", msg);\n    const el = dstEl(\"dstMsgForm\");", "dstMensagem(\"dstMsgFicha\", msg);\n    const el = dstEl(\"dstMsgForm\");"]],
  ["distritos", "a resposta da ficha anterior na nova", ["  if (ficha !== dstPedidoFicha) {\n    // trocou", "  if (false) {\n    // trocou"]],
  ["distritos", "perguntar antes de conferir o que falta", ["  if (problema) { dstMensagem(\"dstMsgForm\", problema); return; }", ""]],
  ["distritos", "não conferir o gatilho (b)", ["conferir: (c) => (c.gatilho === \"MILHAO\"", "conferir: (c) => (false"]],
  ["distritos", "mandar a população em branco", ["  if (corpo.populacao === \"\") delete corpo.populacao;", ""]],
  ["distritos", "pintar a resposta de outro login", ["  return authToken === token ? data : null;\n}\nasync function dstPost", "  return data;\n}\nasync function dstPost"]],
  ["distritos", "não limpar a ficha na saída", ["for (const idEl of [\"dstLista\", \"dstFicha\",", "for (const idEl of [\"dstLista\","]],
  ["distritos", "quem não é do nível geral pede as reuniões", ["    if (cat.papeis && cat.papeis.geral) {", "    if (true) {"]],
  ["distritos", "tirar o escape de Meus Dados", ["Balanço de ${dstH(b.ano)} do ${dstH(b.distrito)}", "Balanço de ${dstH(b.ano)} do ${b.distrito}"]],
  ["distritos", "a análise sem o balanço", ["{ balancoId: Number(fixos.balancoId), decisao: fixos.decisao }", "{ decisao: fixos.decisao }"]],
  ["expansao", "a pílula dos Distritos sem a permissão", ["if (b) b.style.display = expPermite(s) ? \"\" : \"none\";", "if (b) b.style.display = \"\";"]],
  ["expansao", "quem só tem 'distritos' pede a Expansão", ["  if (!expPermite(\"painel\")) { expMostrarSecaoAcao(\"distritos\"); return; }\n", ""]],
  ["expansao", "abrir a seção sem a permissão", ["expSecaoAtual = EXP_SECOES.includes(secao) && expPermite(secao) ? secao", "expSecaoAtual = EXP_SECOES.includes(secao) ? secao"]],
  ["expansao", "a saída não limpa os Distritos", ["  if (typeof dstLimparTela === \"function\") dstLimparTela();", ""]]
];

(async () => {
  const r = await prova();
  console.log(`\nprova da tela da v9.3 (distritos): ${r.total - r.falhas}/${r.total} verificações ok${r.falhas ? ` — ${r.falhas} FALHA(S)` : ""}`);
  let mutFalhou = 0;
  if (process.env.MUTAR) {
    const fontes = { distritos: lerApp("modulos/distritos.js"), expansao: lerApp("modulos/expansao.js") };
    for (const [arquivo, nome, [de, para]] of MUTACOES) {
      const fonte = fontes[arquivo];
      if (fonte.split(de).length !== 2) throw new Error(`mutação inaplicável: ${nome}`);
      MUTADO = { arquivo, texto: fonte.split(de).join(para) };
      process.env.CALADO = "1";
      let m;
      // a mutação que deixa a tela esperando para sempre (uma confirmação que nunca é respondida) conta como acusada: 60 s de prazo
      let prazo;
      const travou = new Promise((res) => { prazo = setTimeout(() => res({ falhas: 1, travou: true }), 60000); });
      try { m = await Promise.race([prova(), travou]); } catch (e) { m = { falhas: 1 }; } finally { clearTimeout(prazo); }
      delete process.env.CALADO;
      MUTADO = null;
      console.log(`  mutação "${nome}": ${m.falhas ? `acusada (${m.falhas} falha(s))` : "NÃO acusada"}`);
      if (!m.falhas) mutFalhou++;
    }
  }
  process.exitCode = r.falhas || mutFalhou ? 1 : 0;
})().catch((e) => { console.log("ERRO", e); process.exit(1); });
