// roteiro.js — prova da tela da v9.4 (Missões) sem navegador: o index.html de verdade, o eventos.js, o modulos/expansao.js (a aba) e o modulos/missoes.js (a pílula)
// inteiros, num DOM simulado (tools/front-cuidado/ambiente.js). As respostas do servidor vêm de contrato-real.json — gravado pelo e2e-76 com os handlers e o banco
// REAIS (`E2E_CONTRATO=1 BASE=cenario-missoes bash rodar.sh roteiro e2e-76-missoes.js` em tools/e2e-localdb) — com texto de ataque em todo campo de texto.
// Rodar: node roteiro.js (da pasta tools/front-missoes). MUTAR=1 roda também as mutações (cada uma precisa ser acusada).
"use strict";
const { criarAmbiente, lerApp } = require("../front-cuidado/ambiente");
const REAL = require("./contrato-real.json");
const EXP = require("../front-expansao/contrato-real.json");

const ATAQUE = '<img src=x onerror="__xss(1)">';
let total = 0, falhas = 0;
const ok = (c, d, det) => { total++; if (!c) { falhas++; if (!process.env.CALADO) console.log(`  ✗ ${d}${det !== undefined ? ` — ${JSON.stringify(det).slice(0, 300)}` : ""}`); } else if (process.env.LISTA) console.log(`  ✓ ${d}`); };

// os campos de texto (os códigos — status, situação, abrangência, fonte — vêm de listas fechadas do servidor; os rótulos deles, sim, são envenenados)
const CAMPOS_TEXTO = ["nome", "campo", "missionario", "missionarios", "lugar", "abrangenciaRotulo", "statusRotulo", "justificativa", "solicitanteNome", "fundamentacao", "porNome", "motivo",
  "atividades", "pedidos", "registradoPorNome", "rotulo", "divulgacaoRotulo", "fonteRotulo", "descricao", "motivoEncerramento", "mensagem", "recebedor", "congregacaoFonte", "periodicidadeRotulo",
  "envio", "status", "papeis"];
const CODIGOS = new Set(["status", "situacao", "abrangencia", "divulgacao", "fonte", "periodicidade", "saidaStatus", "tipo", "resultado"]);
function envenenar(v, chave, pai) {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" && CAMPOS_TEXTO.includes(chave) ? `${x} ${ATAQUE}` : envenenar(x, undefined, chave)));
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = envenenar(x, k, chave);
    return o;
  }
  // "status" é código no envio e no campo (EM_PARECER, ATIVO...); em Meus Dados ("missoes") é o rótulo
  if (typeof v === "string" && CAMPOS_TEXTO.includes(chave) && !(CODIGOS.has(chave) && pai !== "missoes")) return `${v} ${ATAQUE}`;
  return v;
}
const R = envenenar(REAL);
// o catálogo foi gravado antes de existirem campos: a lista de campos do pedido vem da lista real dos campos
for (const k of ["catalogosSemi", "catalogosPres", "catalogosSec", "catalogosTes", "catalogosCMESemPermissao"]) {
  R[k] = { ...R[k], campos: R.campos.campos.filter((c) => c.status === "ATIVO").map((c) => ({ campoId: c.campoId, nome: c.nome, abrangencia: c.abrangencia, lugar: c.lugar })) };
}
var MUTADO = null;   // { arquivo, texto }
const FICHA = R.fichaAtiva.envio;
const ID = FICHA.envioId;
const MES = REAL.previaSuspensa.mes;

function montar({ permissoes = ["expansao", "missoes"], geral = false, catalogo = "catalogosSemi", ficha = "fichaAtiva", matricula = 9701 } = {}) {
  const amb = criarAmbiente({ semModulo: true });
  amb.ev(MUTADO && MUTADO.arquivo === "expansao" ? MUTADO.texto : lerApp("modulos/expansao.js"), "expansao.js");
  amb.ev(MUTADO && MUTADO.arquivo === "missoes" ? MUTADO.texto : lerApp("modulos/missoes.js"), "missoes.js");
  // o leitor de arquivo do script.js (FileReader) é do navegador: aqui ele devolve um conteúdo fixo e anota o que leu
  amb.ev("var __lidos = []; async function lerArquivoComoBase64(a) { __lidos.push(a && a.name); return 'QUJD'; }", "leitor");
  amb.sessao({ matricula, token: "tok", nivel: geral ? "GLOBAL" : "DEPARTAMENTO", permissoes, geral });
  amb.__respostas = {};
  amb.__ficha = ficha;
  amb.__catalogo = catalogo;
  amb.ctx.HTMLElement = amb.ctx.HTMLElement || function () { };
  amb.api.servidor = (c) => {
    if (amb.__respostas[c.chave]) return amb.__respostas[c.chave];
    if (c.chave === "GET expansao/catalogos") return { corpo: EXP.catalogosGeral };
    if (c.chave === "GET expansao/reunioes") return { corpo: EXP.reunioes };
    if (c.chave === "GET expansao/painel") return { corpo: EXP.painelVencido };
    if (c.chave === "GET missoes/catalogos") return { corpo: R[amb.__catalogo] };
    if (c.chave === "GET missoes/reunioes") return { corpo: R.reunioes };
    if (c.chave === "GET missoes/painel") return { corpo: R.painel };
    if (c.chave === "GET missoes/envios") return { corpo: R.envios };
    if (c.chave === "GET missoes/campos") return { corpo: R.campos };
    if (c.chave === "GET missoes/sustento") return { corpo: R.previaSuspensa };
    if (c.chave === "GET missoes/mural") return { corpo: R.mural };
    if (c.chave === "GET missoes/envio") return { corpo: String(c.consulta.envioId) === "999" ? { sucesso: true, envio: { ...R[amb.__ficha].envio, envioId: 999, missionario: { membroId: 1, nome: "Outra Pessoa" } } } : R[amb.__ficha] };
    if (c.metodo === "POST") return { status: 200, corpo: { sucesso: true, mensagem: `Salvo ${ATAQUE}`, envioId: ID } };
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
const botaoForm = (amb, chave) => botoes(amb, "misFicha", "misAbrirFormAcao").find((b) => args(b)[0] === chave);
const visivel = (amb, id) => amb.e(id) && amb.e(id).style.display !== "none";
const campo = (amb, id) => amb.e(`misCampo_${id}`);
async function abrirAba(amb) { amb.g("mostrarAbaSecretaria")("expansao"); await amb.ocioso(); }
async function abrirMissoes(amb) { await abrirAba(amb); amb.g("expMostrarSecaoAcao")("missoes"); await amb.ocioso(); }
async function sub(amb, s) { amb.g("misMostrarSubAcao")(s); await amb.ocioso(); }
async function abrirFicha(amb, id = ID) { await amb.g("misAbrirFichaAcao")(id); await amb.ocioso(); }
async function enviar(amb, confirmar = true) {
  const pend = amb.g("misEnviarFormAcao")();
  const modal = await amb.responderModal(confirmar);
  await pend; await amb.ocioso();
  return modal;
}

async function prova() {
  total = 0; falhas = 0;
  console.log("== contrato real ==");
  for (const k of ["catalogosSemi", "catalogosPres", "catalogosSec", "catalogosTes", "catalogosCMESemPermissao", "campos", "fichaAtiva", "fichaCME", "fichaAguardandoPresidente", "fichaRecusada",
    "fichaEmParecerCME", "fichaEmParecerGeral", "painel", "envios", "previaSuspensa", "previaGerada", "mural", "reunioes"]) ok(REAL[k] && REAL[k].sucesso, `o e2e-76 gravou a resposta real de ${k}`);
  ok(["abrangencias", "divulgacoes", "periodicidades", "fontes", "pareceres", "resultados", "resultadosPresidente", "ufs", "congregacoes", "fornecedores", "campos", "papeis"].every((k) => k in REAL.catalogosSemi),
    "catálogos: as listas que a tela lê");
  ok(REAL.fichaAguardandoPresidente.envio.acoes.presidente === true && REAL.fichaEmParecerCME.envio.acoes.parecer && REAL.fichaEmParecerGeral.envio.acoes.decidir && REAL.fichaAtiva.envio.acoes.relatorio,
    "as fichas: aguardando o Presidente (vista por ele), em parecer (CME e geral) e ativa (SEMIADESPA)");
  ok(/expansao: \["expansao", "distritos", "missoes"\]/.test(lerApp("script.js")) && /misCartaoMeusDados\(data\)/.test(lerApp("modulos/meu-painel.js")), "os ganchos: a aba abre com 'missoes' e o cartão de Meus Dados");
  ok(/\/modulos\/missoes\.js/.test(lerApp("service-worker.js")) && /modulos\/missoes\.js/.test(lerApp("index.html")) && /id="btnExpSecaoMissoes"/.test(lerApp("index.html")), "o módulo na casca do aparelho, no index.html e a pílula");

  console.log("== abrir a pílula ==");
  let amb = montar();
  await abrirAba(amb);
  ok(visivel(amb, "btnExpSecaoMissoes") && visivel(amb, "btnExpSecaoPainel") && !visivel(amb, "btnExpSecaoDistritos"), "com 'expansao' e 'missoes': a pílula de Missões (e não a dos Distritos)");
  amb.g("expMostrarSecaoAcao")("missoes"); await amb.ocioso();
  ok(amb.e("expSecaoMissoes").style.display === "block" && amb.e("misSubPainel").style.display === "block", "a seção de Missões abre no Painel");
  ok(gets(amb, "missoes/catalogos").length === 1 && gets(amb, "missoes/reunioes").length === 0 && gets(amb, "missoes/painel").length === 1, "a SEMIADESPA lê o catálogo e o painel (as reuniões da CLI, não)");
  const painel = amb.e("misPainel").textContent;
  ok(/Meses pagos sem relatório recebido/.test(painel) && painel.includes(String(REAL.painel.totais.mesesPagosSemRelatorio)) && /Missionária Dora E2E/.test(painel), "o painel: o pago sem relatório e de quem", painel.slice(0, 300));
  ok(botoes(amb, "misPainel", "misAbrirFichaAcao").length >= 1 && botoes(amb, "misPainel", "misAbrirFichaAcao").every((b) => typeof args(b)[0] === "number"), "cada item do painel abre a ficha pelo número");
  semAtaque(amb, "o painel");
  const soMis = montar({ permissoes: ["missoes"], geral: true, catalogo: "catalogosTes", matricula: 9706 });
  await abrirAba(soMis);
  ok(!visivel(soMis, "btnExpSecaoPainel") && visivel(soMis, "btnExpSecaoMissoes") && soMis.e("expSecaoMissoes").style.display === "block", "só com 'missoes' (o Tesoureiro): a pílula de Missões, aberta direto");
  ok(soMis.api.chamadas.filter((c) => c.caminho.startsWith("expansao/")).length === 0, "não pede nada da Expansão");
  ok(visivel(soMis, "btnMisSubSustento") && !visivel(soMis, "btnMisSubPainel") && !visivel(soMis, "btnMisSubEnvios") && !visivel(soMis, "btnMisSubCampos") && !visivel(soMis, "btnMisSubMural")
    && soMis.e("misSubSustento").style.display === "block" && gets(soMis, "missoes/painel").length === 0, "a Tesouraria sem outro papel: só o sustento do mês, aberto direto (o painel nem é pedido)");
  const soFin = montar({ permissoes: ["financeiro"], geral: true, catalogo: "catalogosTes", matricula: 9706 });
  await abrirAba(soFin);
  ok(soFin.g("temPermissaoDaAba")("expansao") && visivel(soFin, "btnExpSecaoMissoes") && soFin.e("expSecaoMissoes").style.display === "block", "a Tesouraria Geral entra só com 'financeiro' do nível geral (sem 'missoes')");
  const finLocal = montar({ permissoes: ["financeiro"], geral: false, catalogo: "catalogosTes", matricula: 3001 });
  ok(!finLocal.g("temPermissaoDaAba")("expansao"), "o tesoureiro local não vê a aba");
  const soCme = montar({ permissoes: ["expansao", "missoes"], catalogo: "catalogosCMESemPermissao", matricula: 3003 });
  soCme.__respostas["GET missoes/painel"] = { corpo: R.painelCME };
  await abrirMissoes(soCme);
  ok(!visivel(soCme, "btnMisSubSustento") && visivel(soCme, "btnMisSubEnvios"), "a CME sem outro papel: sem o sustento do mês");
  ok(/aguardam o parecer/.test(soCme.e("misPainel").textContent) && !/Sustento mensal comprometido/.test(soCme.e("misPainel").textContent), "o painel da CME: os pareceres e os números gerais, sem o dinheiro");
  semAtaque(soCme, "o painel da CME");
  const soExp = montar({ permissoes: ["expansao"] });
  await abrirAba(soExp);
  ok(!visivel(soExp, "btnExpSecaoMissoes"), "só com 'expansao': sem a pílula de Missões");
  soExp.g("expMostrarSecaoAcao")("missoes"); await soExp.ocioso();
  ok(soExp.e("expSecaoMissoes").style.display !== "block" && gets(soExp, "missoes/catalogos").length === 0, "e pedir a seção de Missões não a abre");
  const geral = montar({ permissoes: ["expansao", "missoes"], geral: true, catalogo: "catalogosSec", ficha: "fichaEmParecerGeral", matricula: 1002 });
  await abrirMissoes(geral);
  ok(gets(geral, "missoes/reunioes").length === 1, "o nível geral lê as reuniões da CLI");

  console.log("== envios e a ficha ==");
  await sub(amb, "envios");
  ok(visivel(amb, "btnMisNovoEnvio") && amb.e("misEnvios").textContent.includes("Missionária Dora E2E"), "a lista dos envios e o botão de pedir (a SEMIADESPA)");
  ok(botoes(amb, "misEnvios", "misAbrirFichaAcao").every((b) => typeof args(b)[0] === "number"), "cada linha abre a ficha pelo número");
  semAtaque(amb, "a lista dos envios");
  await abrirFicha(amb);
  let ficha = amb.e("misFicha").textContent;
  ok(/Missionária Dora E2E/.test(ficha) && /Relatórios de campo/.test(ficha) && /sem relatório/.test(ficha) && /Pagamentos gerados/.test(ficha), "a ficha: o missionário, os períodos e o pago sem relatório", ficha.slice(0, 200));
  ok(botaoForm(amb, "relatorio") === undefined || FICHA.periodos.some((p) => !p.entregue), "lançar relatório só com período em aberto");
  ok(botaoForm(amb, "encerrar") && !botaoForm(amb, "reajustar") && !botaoForm(amb, "presidente") && !botaoForm(amb, "parecer") && !botaoForm(amb, "decidir"), "a SEMIADESPA: encerrar; reajustar e os atos dos outros, não");
  const link = todos(amb, "misFicha").find((x) => x.localName === "a" && /termo de compromisso/.test(x.textContent));
  ok(link && /\?sas$/.test(link.getAttribute("href")) && link.getAttribute("rel") === "noopener", "o documento do envio pelo endereço assinado", link && link.getAttribute("href"));
  ok(botoes(amb, "misFicha", "misAbrirFormAcao").some((b) => args(b)[0] === "relatorio-corrigir" && typeof args(b)[1].relatorioId === "number"), "cada relatório tem a correção pelo número");
  semAtaque(amb, "a ficha");
  const cme = montar({ permissoes: ["expansao", "missoes"], catalogo: "catalogosCMESemPermissao", ficha: "fichaCME", matricula: 3003 });
  await abrirMissoes(cme); await sub(cme, "envios");
  ok(!visivel(cme, "btnMisNovoEnvio"), "a CME não vê o botão de pedir");
  await abrirFicha(cme);
  ok(!todos(cme, "misFicha").some((x) => x.localName === "a" && /termo/.test(x.textContent)) && botoes(cme, "misFicha", "misAbrirFormAcao").length === 0, "a CME vê o envio ativo sem o documento e sem botão");

  console.log("== o parecer da CME ==");
  const par = montar({ permissoes: ["expansao", "missoes"], catalogo: "catalogosCMESemPermissao", ficha: "fichaEmParecerCME", matricula: 3003 });
  await abrirMissoes(par); await abrirFicha(par);
  ok(botaoForm(par, "parecer") && !botaoForm(par, "decidir"), "o botão do parecer para a CME");
  par.g("misAbrirFormAcao")("parecer", {}); await par.ocioso();
  await par.g("misEnviarFormAcao")(); await par.ocioso();
  ok(/Preencha/.test(par.e("misMsgForm").textContent) && posts(par, "missoes/parecer").length === 0, "sem o parecer e a fundamentação: diz o que falta e não grava");
  par.doc.escolher(campo(par, "parecer"), "FAVORAVEL");
  par.doc.digitar(campo(par, "fundamentacao"), "Viável: há membros transferidos no campo.");
  let modal = await enviar(par);
  let p = posts(par, "missoes/parecer");
  ok(modal.aberto && /decide a CLI/.test(modal.texto) && p.length === 1 && p[0].corpo.envioId === REAL.fichaEmParecerCME.envio.envioId && p[0].corpo.parecer === "FAVORAVEL",
    "a pergunta e o parecer com o envio", p[0] && p[0].corpo);
  semAtaque(par, "o parecer");

  console.log("== a decisão da CLI (nível geral) ==");
  await abrirFicha(geral, REAL.fichaEmParecerGeral.envio.envioId);
  ok(botaoForm(geral, "decidir") && botaoForm(geral, "desistir"), "o nível geral: decidir e desistir");
  geral.g("misAbrirFormAcao")("decidir", {}); await geral.ocioso();
  ok(campo(geral, "urgencia") && campo(geral, "sessaoId").options.length > 1, "em parecer: a urgência aparece e as reuniões da CLI estão na lista");
  geral.doc.escolher(campo(geral, "sessaoId"), String(REAL.reunioes.reunioes[0].sessaoId));
  geral.doc.escolher(campo(geral, "resultado"), "APROVADO");
  await geral.g("misEnviarFormAcao")(); await geral.ocioso();
  ok(/urgência/.test(geral.e("misMsgForm").textContent) && posts(geral, "missoes/decidir").length === 0, "sem o parecer e sem marcar a urgência: a tela avisa antes de perguntar");
  geral.doc.marcar(campo(geral, "urgencia"), true);
  modal = await enviar(geral);
  p = posts(geral, "missoes/decidir");
  ok(modal.aberto && p.length === 1 && p[0].corpo.urgencia === true && String(p[0].corpo.sessaoId) === String(REAL.reunioes.reunioes[0].sessaoId) && /concordância do Pastor Presidente/.test(modal.texto),
    "a urgência vai como verdadeiro; a pergunta diz que falta o Presidente", p[0] && p[0].corpo);
  semAtaque(geral, "a decisão");

  console.log("== o Pastor Presidente ==");
  const pres = montar({ permissoes: ["expansao", "missoes"], geral: true, catalogo: "catalogosPres", ficha: "fichaAguardandoPresidente", matricula: 1001 });
  await abrirMissoes(pres); await abrirFicha(pres);
  ok(botaoForm(pres, "presidente"), "o botão do Presidente");
  pres.g("misAbrirFormAcao")("presidente", {}); await pres.ocioso();
  ok(/R\$ 500,00/.test(pres.e("misFormAcao").textContent), "o formulário mostra o sustento proposto e quem recebe");
  pres.doc.escolher(campo(pres, "resultado"), "RECUSA");
  await pres.g("misEnviarFormAcao")(); await pres.ocioso();
  ok(/motivo/.test(pres.e("misMsgForm").textContent) && posts(pres, "missoes/presidente").length === 0, "recusar sem motivo: avisado antes de perguntar");
  pres.doc.escolher(campo(pres, "resultado"), "CONCORDA");
  modal = await enviar(pres);
  p = posts(pres, "missoes/presidente");
  ok(modal.aberto && /fica ativo/.test(modal.texto) && p.length === 1 && p[0].corpo.resultado === "CONCORDA" && !("motivo" in p[0].corpo), "concordar: pergunta, e o motivo em branco não vai", p[0] && p[0].corpo);
  ok(/Salvo/.test(pres.e("misMsgFicha").textContent) || pres.toasts().some((t) => /Salvo/.test(t)), "o resultado aparece");
  semAtaque(pres, "o Presidente");

  console.log("== o pedido de envio ==");
  amb = montar();
  await abrirMissoes(amb); await sub(amb, "envios");
  amb.g("misNovoEnvioAcao")(); await amb.ocioso();
  ok(campo(amb, "campoId") && campo(amb, "documento") && campo(amb, "documento").type === "file" && campo(amb, "sustento").value === "0" && campo(amb, "periodicidade").value === "MENSAL",
    "o formulário: o campo, o documento (arquivo), o sustento zero e o mensal de partida");
  ok(campo(amb, "fornecedorId").options.some((o) => /convênio externo/.test(o.textContent)), "quem recebe diz quando é pessoa jurídica (convênio externo)");
  amb.doc.escolher(campo(amb, "campoId"), String(R.catalogosSemi.campos[0].campoId));
  amb.doc.digitar(campo(amb, "membroId"), "abc");
  amb.doc.escolher(campo(amb, "periodicidade"), "MENSAL");
  amb.doc.digitar(campo(amb, "justificativa"), "Evangelismo no bairro com sustento.");
  await amb.g("misEnviarFormAcao")(); await amb.ocioso();
  ok(/matrícula/.test(amb.e("misMsgForm").textContent), "matrícula que não é número: avisado");
  amb.doc.digitar(campo(amb, "membroId"), "9707");
  amb.doc.digitar(campo(amb, "sustento"), "1.500,00");
  await amb.g("misEnviarFormAcao")(); await amb.ocioso();
  ok(/sem ponto de milhar/.test(amb.e("misMsgForm").textContent), "valor com ponto de milhar: avisado");
  amb.doc.digitar(campo(amb, "sustento"), "1500,50");
  await amb.g("misEnviarFormAcao")(); await amb.ocioso();
  ok(/de onde ele sai/.test(amb.e("misMsgForm").textContent), "com sustento, sem a fonte: avisado");
  amb.doc.escolher(campo(amb, "fonte"), "GERAL");
  amb.doc.escolher(campo(amb, "fornecedorId"), String(REAL.catalogosSemi.fornecedores[0].fornecedorId));
  await amb.g("misEnviarFormAcao")(); await amb.ocioso();
  ok(/anexe o documento/.test(amb.e("misMsgForm").textContent) && posts(amb, "missoes/envio").length === 0, "com sustento, sem o documento: avisado e nada vai");
  const pfOutro = R.catalogosSemi.fornecedores.find((f) => f.tipo === "PF" && String(f.membroId) !== "9707");
  amb.doc.escolher(campo(amb, "fornecedorId"), String(pfOutro.fornecedorId));
  await amb.g("misEnviarFormAcao")(); await amb.ocioso();
  ok(/próprio missionário/.test(amb.e("misMsgForm").textContent) && posts(amb, "missoes/envio").length === 0, "a pessoa física de outro membro: avisado antes de mandar");
  ok(/mat\. \d+/.test(campo(amb, "fornecedorId").options.find((o) => o.value === String(pfOutro.fornecedorId)).textContent), "a pessoa física aparece com a matrícula");
  ok(!campo(amb, "congregacaoFonteId"), "não se escolhe a congregação que paga: é a mantenedora do campo");
  amb.doc.escolher(campo(amb, "fornecedorId"), String(R.catalogosSemi.fornecedores.find((f) => f.tipo === "PJ").fornecedorId));
  campo(amb, "documento").files = [{ name: "termo.gif", type: "image/gif", size: 100 }];
  await amb.g("misEnviarFormAcao")(); await amb.ocioso();
  ok(/PDF, JPG ou PNG/.test(amb.e("misMsgForm").textContent) && posts(amb, "missoes/envio").length === 0, "arquivo de outro tipo: recusado na tela");
  campo(amb, "documento").files = [{ name: "termo.pdf", type: "application/pdf", size: 16 * 1024 * 1024 }];
  await amb.g("misEnviarFormAcao")(); await amb.ocioso();
  ok(/15 MB/.test(amb.e("misMsgForm").textContent), "arquivo grande demais: recusado na tela");
  campo(amb, "documento").files = [{ name: "termo.pdf", type: "application/pdf", size: 1000 }];
  amb.doc.marcar(campo(amb, "divulgarNome"), true);
  modal = await enviar(amb);
  p = posts(amb, "missoes/envio");
  ok(modal.aberto && p.length === 1 && p[0].corpo.documentoBase64 === "QUJD" && p[0].corpo.documentoMime === "application/pdf" && p[0].corpo.sustento === "1500.50"
    && p[0].corpo.divulgarNome === true && p[0].corpo.membroId === "9707" && !("documento" in p[0].corpo) && !("congregacaoFonteId" in p[0].corpo),
    "o pedido: o documento lido só agora, o valor com ponto, o verdadeiro/falso, e o que ficou em branco não vai", p[0] && p[0].corpo);
  ok(/Salvo/.test(amb.e("misMsgEnvios").textContent) && gets(amb, "missoes/envio").length >= 1 && amb.e("misFormNovo").innerHTML === "", "gravou: a mensagem, a ficha do envio novo aberta e o formulário fechado");
  semAtaque(amb, "o pedido");

  console.log("== o relatório e a correção ==");
  amb = montar();
  await abrirMissoes(amb); await abrirFicha(amb);
  if (botaoForm(amb, "relatorio")) {
    amb.g("misAbrirFormAcao")("relatorio", {}); await amb.ocioso();
    ok(campo(amb, "periodoInicio").options.length - 1 === FICHA.periodos.filter((x) => !x.entregue).length, "o relatório oferece só os períodos sem relatório");
    amb.doc.escolher(campo(amb, "periodoInicio"), FICHA.periodos.find((x) => !x.entregue).inicio);
    amb.doc.digitar(campo(amb, "batismos"), "2,5");
    amb.doc.digitar(campo(amb, "atividades"), "Cultos e visitas no período.");
    await amb.g("misEnviarFormAcao")(); await amb.ocioso();
    ok(/inteiros/.test(amb.e("misMsgForm").textContent) && posts(amb, "missoes/relatorio").length === 0, "número quebrado: avisado");
    amb.doc.digitar(campo(amb, "batismos"), "2");
    await amb.g("misEnviarFormAcao")(); await amb.ocioso();
    p = posts(amb, "missoes/relatorio");
    ok(p.length === 1 && p[0].corpo.envioId === ID && p[0].corpo.batismos === "2" && !("anexoBase64" in p[0].corpo), "o relatório vai sem pergunta e sem anexo quando não há", p[0] && p[0].corpo);
  } else ok(true, "sem período em aberto no contrato");
  amb = montar();
  await abrirMissoes(amb); await abrirFicha(amb);
  const corrigir = botoes(amb, "misFicha", "misAbrirFormAcao").find((b) => args(b)[0] === "relatorio-corrigir");
  amb.g("misAbrirFormAcao")(...args(corrigir)); await amb.ocioso();
  const rel = FICHA.relatorios.find((x) => x.relatorioId === args(corrigir)[1].relatorioId);
  ok(!campo(amb, "periodoInicio") && campo(amb, "batismos").value === String(rel.batismos) && campo(amb, "atividades").value === rel.atividades, "a correção vem preenchida e sem o período");
  await amb.g("misEnviarFormAcao")(); await amb.ocioso();
  p = posts(amb, "missoes/relatorio-corrigir");
  ok(p.length === 1 && p[0].corpo.relatorioId === rel.relatorioId && !("envioId" in p[0].corpo), "a correção manda o relatório (não o envio)", p[0] && p[0].corpo);

  console.log("== encerrar ==");
  amb = montar();
  await abrirMissoes(amb); await abrirFicha(amb);
  amb.g("misAbrirFormAcao")("encerrar", {}); await amb.ocioso();
  ok(/^\d{4}-\d{2}$/.test(campo(amb, "ultimoMes").value) && campo(amb, "ultimoMes").type === "month", "o último mês vem com o mês de hoje");
  amb.doc.digitar(campo(amb, "motivo"), "Retorno da missionária.");
  modal = await enviar(amb, false);
  ok(modal.aberto && /último mês de sustento/.test(modal.texto) && posts(amb, "missoes/encerrar").length === 0, "cancelar a pergunta não grava");
  modal = await enviar(amb, true);
  ok(posts(amb, "missoes/encerrar").length === 1 && posts(amb, "missoes/encerrar")[0].corpo.envioId === ID, "confirmar grava");
  // o duplo clique e a pergunta duas vezes
  const dup = montar();
  await abrirMissoes(dup); await abrirFicha(dup);
  dup.g("misAbrirFormAcao")("encerrar", {}); await dup.ocioso();
  dup.doc.digitar(campo(dup, "motivo"), "Retorno da missionária.");
  const r1 = dup.g("misEnviarFormAcao")();
  const r2 = dup.g("misEnviarFormAcao")();
  await dup.responderModal(true); await r1; await r2; await dup.ocioso();
  ok(posts(dup, "missoes/encerrar").length === 1, "o segundo clique com a pergunta aberta não abre outra nem grava duas vezes");

  // o duplo clique sem pergunta (a correção do relatório não pergunta): a segunda gravação espera a primeira
  const dup2 = montar();
  await abrirMissoes(dup2); await abrirFicha(dup2);
  const corr2 = botoes(dup2, "misFicha", "misAbrirFormAcao").find((b) => args(b)[0] === "relatorio-corrigir");
  dup2.g("misAbrirFormAcao")(...args(corr2)); await dup2.ocioso();
  const c1 = dup2.g("misEnviarFormAcao")();
  const c2 = dup2.g("misEnviarFormAcao")();
  await c1; await c2; await dup2.ocioso();
  ok(posts(dup2, "missoes/relatorio-corrigir").length === 1, "o duplo clique num ato sem pergunta grava uma vez só");

  console.log("== o nome no mural ==");
  amb = montar();
  await abrirMissoes(amb); await abrirFicha(amb);
  const bDiv = botaoForm(amb, "divulgacao");
  ok(bDiv && (FICHA.divulgarNome ? /Tirar o nome/ : /Autorizar o nome/).test(bDiv.textContent), "o botão diz o que vai fazer (dar ou tirar a autorização)");
  amb.g("misAbrirFormAcao")("divulgacao", {}); await amb.ocioso();
  ok(campo(amb, "divulgarNome").checked === !!FICHA.divulgarNome, "o formulário vem com a autorização de agora");
  amb.doc.marcar(campo(amb, "divulgarNome"), !FICHA.divulgarNome);
  modal = await enviar(amb);
  p = posts(amb, "missoes/divulgacao");
  ok(modal.aberto && p.length === 1 && p[0].corpo.envioId === ID && p[0].corpo.divulgarNome === !FICHA.divulgarNome, "pergunta e manda verdadeiro/falso com o envio", p[0] && p[0].corpo);

  console.log("== campos ==");
  amb = montar();
  await abrirMissoes(amb); await sub(amb, "campos");
  ok(visivel(amb, "btnMisNovoCampo") && amb.e("misCamposLista").textContent.includes("Frente Vila Sansão"), "a lista dos campos e o botão de cadastrar");
  semAtaque(amb, "a lista dos campos");
  const editar = botoes(amb, "misCamposLista", "misAbrirFormCampoAcao").find((b) => args(b)[0] === "campo-editar");
  amb.g("misAbrirFormCampoAcao")(...args(editar)); await amb.ocioso();
  const c0 = REAL.campos.campos.find((x) => x.campoId === args(editar)[1]);
  ok(campo(amb, "nome").value === R.campos.campos.find((x) => x.campoId === c0.campoId).nome && campo(amb, "divulgacao").value === c0.divulgacao, "editar vem preenchido");
  await amb.g("misEnviarFormAcao")(); await amb.ocioso();
  p = posts(amb, "missoes/campo-editar");
  ok(p.length === 1 && p[0].corpo.campoId === c0.campoId && typeof p[0].corpo.zonaRural === "boolean", "editar manda o campo e a zona rural como verdadeiro/falso", p[0] && p[0].corpo);
  ok(Number.isInteger(c0.versao) && p[0].corpo.versao === c0.versao, "Trava 9-B: editar manda a versão do campo que leu (a resposta real traz a versão)", { versao: c0.versao, corpo: p[0] && p[0].corpo });
  ok(gets(amb, "missoes/catalogos").length >= 2, "depois de mexer nos campos, o catálogo é relido (a lista do pedido muda)");

  console.log("== sustento do mês ==");
  amb = montar();
  await abrirMissoes(amb); await sub(amb, "sustento");
  const sus = amb.e("misSustento").textContent;
  ok(/suspenso/.test(sus) && /Relatório de campo vencido/.test(sus) && /impedido/.test(sus) && !botoes(amb, "misSustento", "misGerarSustentoAcao").length, "a prévia: suspenso e impedido com o motivo; a SEMIADESPA não tem o botão de gerar", sus.slice(0, 200));
  ok(/^\d{4}-\d{2}$/.test(amb.e("misSustentoMes").value) && gets(amb, "missoes/sustento")[0].consulta.mes === amb.e("misSustentoMes").value, "o mês de hoje de partida");
  semAtaque(amb, "a prévia");
  const tes = montar({ permissoes: ["missoes"], geral: true, catalogo: "catalogosTes", matricula: 9706 });
  tes.__respostas["GET missoes/sustento"] = { corpo: { ...R.previaSuspensa, podeGerar: true } };
  await abrirAba(tes); await sub(tes, "sustento");
  const aGerar = REAL.previaSuspensa.linhas.filter((l) => l.situacao === "A_GERAR").length;
  ok(botoes(tes, "misSustento", "misGerarSustentoAcao").length === 1 && new RegExp(`\\(${aGerar} pagamento`).test(tes.e("misSustento").textContent), "a Tesouraria: o botão com quantos serão gerados");
  const pend = tes.g("misGerarSustentoAcao")();
  modal = await tes.responderModal(true); await pend; await tes.ocioso();
  p = posts(tes, "missoes/gerar");
  ok(modal.aberto && /Saída já aprovada/.test(modal.texto) && p.length === 1 && p[0].corpo.mesReferencia === MES, "gerar pergunta e manda o mês da prévia", p[0] && p[0].corpo);
  ok(/Salvo/.test(tes.e("misMsgSustento").textContent), "o resultado aparece depois de reler a prévia");

  console.log("== mural ==");
  amb = montar();
  await abrirMissoes(amb); await sub(amb, "mural");
  const mural = amb.e("misMural").textContent;
  ok(/Missionária Eva E2E/.test(mural) && !/Dora/.test(mural) && /acesso restrito/.test(mural), "o mural: os nomes autorizados e a contagem dos restritos");
  ok(REAL.mural.totais.investidoNoAno === null && !/Investido/.test(mural), "com um só missionário pago no ano, o total investido não aparece (seria o valor dele)");
  semAtaque(amb, "o mural");
  const mur2 = montar();
  mur2.__respostas["GET missoes/mural"] = { corpo: { ...R.mural, totais: { ...R.mural.totais, investidoNoAno: 2500 } } };
  await abrirMissoes(mur2); await sub(mur2, "mural");
  ok(/Investido no sustento missionário/.test(mur2.e("misMural").textContent) && /2\.500,00/.test(mur2.e("misMural").textContent), "com dois ou mais, o total aparece");
  let classeNaImpressao = null;
  amb.ctx.print = () => { classeNaImpressao = amb.doc.body.classList.contains("mis-imprimindo"); };
  amb.g("misImprimirMuralAcao")();
  ok(classeNaImpressao === true && amb.doc.body.classList.contains("mis-imprimindo"), "imprimir: só o mural na folha, até o navegador dizer que acabou");
  amb.dispararJanela("afterprint");
  ok(!amb.doc.body.classList.contains("mis-imprimindo"), "depois de imprimir, a página volta");

  console.log("== o reajuste com a reunião da CLI (Trava 9-B) ==");
  // o Presidente que não é do nível geral também lê as reuniões da CLI (o aumento cita a que o aprovou)
  R.catalogosSoPresidente = { ...R.catalogosPres, papeis: { ...R.catalogosPres.papeis, geral: false, presidente: true } };
  const pr = montar({ permissoes: ["expansao", "missoes"], catalogo: "catalogosSoPresidente", matricula: 1001 });
  const valorComCli = { desdeMes: "2026-12", valor: 650, fonteRotulo: "Tesouro Geral", congregacaoFonte: null, recebedor: "Recebedor E2E (PF)", motivo: "Aumento.", registradoEm: "2026-11-11", cliEm: "2026-11-10" };
  pr.__respostas["GET missoes/envio"] = { corpo: { sucesso: true, envio: { ...R.fichaAtiva.envio, valores: [...(R.fichaAtiva.envio.valores || []), valorComCli], acoes: { ...R.fichaAtiva.envio.acoes, reajustar: true } } } };
  await abrirMissoes(pr); await sub(pr, "envios"); await abrirFicha(pr);
  ok(gets(pr, "missoes/reunioes").length === 1, "o Presidente (sem ser o nível geral) lê as reuniões da CLI");
  ok(/aumento aprovado pela CLI em 10\/11\/2026/.test(pr.e("misFicha").textContent), "a ficha mostra a data da CLI que aprovou o aumento");
  ok(botaoForm(pr, "reajustar"), "o botão do reajuste");
  pr.g("misAbrirFormAcao")("reajustar", {}); await pr.ocioso();
  const sel = campo(pr, "sessaoId");
  ok(sel && sel.options.some((o) => o.value === String(REAL.reunioes.reunioes[0].sessaoId)) && /Art\. 58 §4º/.test(pr.e("misFormAcao").textContent), "o formulário tem a reunião da CLI e explica o aumento (Estatuto, Art. 58 §4º)");
  pr.doc.digitar(campo(pr, "sustento"), "0");
  pr.doc.digitar(campo(pr, "motivo"), "Fim do sustento combinado.");
  pr.doc.escolher(sel, String(REAL.reunioes.reunioes[0].sessaoId));
  modal = await enviar(pr);
  p = posts(pr, "missoes/reajustar");
  ok(modal.aberto && p.length === 1 && String(p[0].corpo.sessaoId) === String(REAL.reunioes.reunioes[0].sessaoId) && p[0].corpo.envioId === ID, "o reajuste manda a reunião escolhida", p[0] && p[0].corpo);
  semAtaque(pr, "o reajuste");
  // a CME que só é CME: a lista não traz o sustento nem os relatórios — a tela mostra "—", não "em dia"
  const cm = montar({ permissoes: ["expansao", "missoes"], catalogo: "catalogosCMESemPermissao", matricula: 3003 });
  cm.__respostas["GET missoes/envios"] = { corpo: { ...R.envios, envios: R.envios.envios.map((e) => ({ ...e, sustentoVigente: null, relatoriosVencidos: null, suspenso: null })) } };
  await abrirMissoes(cm); await sub(cm, "envios");
  ok(!/em dia/.test(cm.e("misEnvios").textContent) && /—/.test(cm.e("misEnvios").textContent), "a lista da CME mostra \"—\" nos relatórios (não \"em dia\")");

  console.log("== Meus Dados ==");
  const cartao = amb.g("misCartaoMeusDados")(R.meusDados || {});
  ok(/Envio ao campo/.test(cartao) && !/<img/.test(cartao), "o cartão de Meus Dados escapa o texto", cartao.slice(0, 200));
  ok(/Justificativa:/.test(cartao) && /Decisão da CLI:/.test(cartao) && /Pastor Presidente:/.test(cartao) && /Pagamentos:/.test(cartao),
    "Trava 9-B: o cartão mostra a justificativa, as decisões e os pagamentos que a API entrega (LGPD Art. 18)", cartao.slice(0, 600));
  ok(amb.g("misCartaoMeusDados")({}) === "" && amb.g("misCartaoMeusDados")(null) === "" && amb.g("misCartaoMeusDados")({ missoes: [], missoesAtos: [] }) === "", "sem nada: o cartão não aparece");

  console.log("== a saída da sessão e o bilhete trocado ==");
  const s1 = montar();
  await abrirMissoes(s1);
  const pendente = s1.g("misAbrirFichaAcao")(ID);
  s1.g("limparSessao")();
  await pendente; await s1.ocioso();
  ok(s1.e("misFicha").innerHTML === "" && s1.e("misPainel").innerHTML === "" && s1.e("misBlocoFicha").style.display === "none", "nada da sessão anterior fica (a resposta atrasada não pinta)");
  const s2 = montar();
  await abrirMissoes(s2);
  s2.e("misPainel").innerHTML = "";
  const pend2 = s2.g("misCarregarPainelAcao")();
  s2.sessao({ matricula: 2002, token: "outro", nivel: "GLOBAL", permissoes: ["missoes"], geral: true });
  await pend2; await s2.ocioso();
  ok(!/Dora/.test(s2.e("misPainel").textContent), "a resposta do login anterior não pinta o painel do novo");
  // a confirmação reforçada (428) troca o bilhete no meio do ato: a resposta do ato ainda é de quem pediu (o dono é a matrícula)
  const s3 = montar();
  await abrirMissoes(s3); await abrirFicha(s3);
  s3.g("misAbrirFormAcao")("encerrar", {}); await s3.ocioso();
  s3.doc.digitar(campo(s3, "motivo"), "Retorno da missionária.");
  s3.__respostas["POST missoes/encerrar"] = { status: 200, corpo: { sucesso: false, mensagem: "Recusa do servidor depois da confirmação." } };
  const reten = s3.retem((c) => c.chave === "POST missoes/encerrar");
  const envio3 = s3.g("misEnviarFormAcao")();
  await s3.responderModal(true);
  for (let i = 0; i < 20 && !reten.chegou; i++) await s3.ocioso();
  s3.ev(`authToken = "bilhete-novo";`, "troca");
  reten.liberar(); await envio3; await s3.ocioso();
  ok(/Recusa do servidor depois da confirmação/.test(s3.e("misMsgForm").textContent), "o bilhete trocado no meio do ato: a recusa aparece no formulário");
  return { total, falhas };
}

const MUTACOES = [
  ["missoes", "tirar o escape do nome na lista", ["<strong>${misH(e.missionario && e.missionario.nome)}</strong></button></td>", "<strong>${e.missionario && e.missionario.nome}</strong></button></td>"]],
  ["missoes", "tirar o escape do título da ficha", ["🧭 ${misH(e.missionario && e.missionario.nome)} <small>", "🧭 ${e.missionario && e.missionario.nome} <small>"]],
  ["missoes", "tirar o escape das atividades do relatório", ["<span class=\"subtitle\">${misH(r.atividades)}</span>", "<span class=\"subtitle\">${r.atividades}</span>"]],
  ["missoes", "tirar o escape do motivo da prévia", ["${l.motivo ? `<br><small>${misH(l.motivo)}</small>` : \"\"}", "${l.motivo ? `<br><small>${l.motivo}</small>` : \"\"}"]],
  ["missoes", "tirar o escape do nome do campo no mural", ["<h4>${misH(c.nome)} <small>— ${misH(c.lugar)}</small></h4>", "<h4>${c.nome} <small>— ${misH(c.lugar)}</small></h4>"]],
  ["missoes", "tirar o escape dos nomes no mural", ["c.missionarios.map(misH).join(\", \")", "c.missionarios.join(\", \")"]],
  ["missoes", "tirar o escape do campo na lista dos campos", ["<tr><td><strong>${misH(c.nome)}</strong>", "<tr><td><strong>${c.nome}</strong>"]],
  ["missoes", "tirar o escape dos rótulos do catálogo", ["`<option value=\"${misH(o.codigo)}\">${misH(o.rotulo)}</option>`", "`<option value=\"${misH(o.codigo)}\">${o.rotulo}</option>`"]],
  ["missoes", "tirar o escape do painel", ["const misItemEnvio = (e, texto) => `<li><strong>${misH(e.missionario)}</strong>", "const misItemEnvio = (e, texto) => `<li><strong>${e.missionario}</strong>"]],
  ["missoes", "tirar o escape de Meus Dados", ["Envio ao campo ${misH(e.campo)}", "Envio ao campo ${e.campo}"]],
  ["missoes", "mostrar o botão do Presidente a quem o servidor nega", ["a.presidente ? misBotao(\"✍️ Concordar ou recusar (Pastor Presidente)\", \"presidente\") : \"\"", "misBotao(\"✍️ Concordar ou recusar (Pastor Presidente)\", \"presidente\")"]],
  ["missoes", "mostrar o reajuste a quem o servidor nega", ["a.reajustar ? misBotao(\"💵 Reajustar o sustento\", \"reajustar\") : \"\"", "misBotao(\"💵 Reajustar o sustento\", \"reajustar\")"]],
  ["missoes", "mostrar o parecer a quem o servidor nega", ["a.parecer ? misBotao(\"🧭 Dar o parecer da CME\", \"parecer\") : \"\"", "misBotao(\"🧭 Dar o parecer da CME\", \"parecer\")"]],
  ["missoes", "mostrar o pedido a quem não gere", ["if (novo) novo.style.display = misGere() ? \"\" : \"none\";", "if (novo) novo.style.display = \"\";"]],
  ["missoes", "mostrar o botão de gerar a quem não é a Tesouraria", ["${r.podeGerar && aGerar ?", "${aGerar ?"]],
  ["missoes", "conferir o dono pelo bilhete (a confirmação reforçada o troca)", ["const misDono = () => (authToken ? `${authMatricula}|", "const misDono = () => (authToken ? `${authToken}|"]],
  ["missoes", "deixar o duplo clique gravar duas vezes", ["  if (misOcupado) { misMensagem(alvoMsg, \"Aguarde: a gravação anterior ainda está em andamento.\"); return null; }", ""]],
  ["missoes", "a pergunta aberta duas vezes", ["    if (misConfirmando) return;\n    misConfirmando = true;\n    let sim;\n    try { sim = await confirmarAcao(pergunta, \"Confirmar\");", "    misConfirmando = true;\n    let sim;\n    try { sim = await confirmarAcao(pergunta, \"Confirmar\");"]],
  ["missoes", "perguntar antes de conferir o que falta", ["  if (problema) { misMensagem(\"misMsgForm\", problema); return; }", ""]],
  ["missoes", "esquecer o envio no ato", ["  else if (form.alvo === \"misFormAcao\" && misFicha) corpo.envioId = Number(misFicha.envioId);", ""]],
  ["missoes", "mandar o verdadeiro/falso como texto", ["corpo[c.id] = c.tipo === \"check\" ? !!el.checked : String(el.value || \"\").trim();", "corpo[c.id] = String(el.value || \"\").trim();"]],
  ["missoes", "gerar sem perguntar", ["    sim = await confirmarAcao(`Gerar o sustento", "    sim = true || await confirmarAcao(`Gerar o sustento"]],
  ["missoes", "aceitar qualquer tipo de arquivo", ["  if (![\"application/pdf\", \"image/jpeg\", \"image/png\"].includes(arquivo.type)) return { erro: \"O arquivo é PDF, JPG ou PNG.\" };", ""]],
  ["missoes", "mandar o documento sem conferir com sustento", ["        if (misNumero(c.sustento) > 0 && !c.documento) return", "        if (false) return"]],
  ["missoes", "mandar a vírgula do valor", ["for (const k of [\"sustento\", \"batismos\", \"conversoes\", \"discipulado\"]) if (typeof corpo[k] === \"string\") corpo[k] = corpo[k].replace(\",\", \".\");", ""]],
  ["missoes", "pintar a resposta de outro login", ["  return misDono() === dono ? data : null;\n}\nasync function misPost", "  return data;\n}\nasync function misPost"]],
  ["missoes", "não limpar a ficha na saída", ["for (const idEl of [\"misPainel\", \"misEnvios\", \"misCamposLista\", \"misSustento\", \"misMural\", \"misFicha\",", "for (const idEl of [\"misPainel\", \"misEnvios\", \"misCamposLista\", \"misSustento\", \"misMural\","]],
  ["missoes", "recusa fora do formulário", ["      misMensagem(\"misMsgForm\", msg);\n      const el = misEl(\"misMsgForm\");", "      misMensagem(\"misMsgFicha\", msg);\n      const el = misEl(\"misMsgForm\");"]],
  ["missoes", "imprimir a página inteira", ["  if (classes) classes.add(\"mis-imprimindo\");", ""]],
  ["missoes", "a correção sem o relatório", ["  else if (form.chave === \"relatorio-corrigir\") corpo.relatorioId = Number(fixos.relatorioId);", ""]],
  ["missoes", "quem não é do nível geral pede as reuniões", ["  if (misPapel(\"geral\")) {\n    const reu", "  if (true) {\n    const reu"]],
  ["missoes", "a Tesouraria vê as outras subseções", ["  if (misSoTesouraria()) return s === \"sustento\";", ""]],
  ["missoes", "a CME vê o sustento do mês", ["  if (misSoCME()) return s !== \"sustento\";", ""]],
  ["missoes", "o botão do nome no mural a quem não gere", ["    a.divulgacao ? misBotao(e.divulgarNome", "    true ? misBotao(e.divulgarNome"]],
  ["missoes", "não conferir a pessoa física", ["    if (f && f.tipo === \"PF\" && String(f.membroId) !== String(membroId)) return", "    if (false) return"]],
  ["missoes", "mostrar o total investido de um só missionário", ["      ${t.investidoNoAno == null ? \"\" :", "      ${false ? \"\" :"]],
  ["expansao", "a pílula de Missões sem a permissão", ["const EXP_PERMISSAO_DA_SECAO = { distritos: \"distritos\", missoes: \"missoes\" };", "const EXP_PERMISSAO_DA_SECAO = { distritos: \"distritos\", missoes: \"expansao\" };"]],
  ["expansao", "quem só tem 'missoes' pede a Expansão", ["  if (!expPermite(\"painel\")) { expMostrarSecaoAcao(expPermite(\"distritos\") ? \"distritos\" : \"missoes\"); return; }\n", ""]],
  ["expansao", "a saída não limpa Missões", ["  if (typeof misLimparTela === \"function\") misLimparTela();   // v9.4: a pílula de Missões\n", ""]],
  // Trava 9-B
  ["missoes", "não mandar a versão do campo", ["  if (form.chave === \"campo-editar\") corpo.versao = Number(fixos.versao || 0);\n", ""]],
  ["missoes", "tirar a reunião da CLI do reajuste", ["      { id: \"sessaoId\", rotulo: \"Reunião da CLI que aprovou o aumento (só no aumento)\", tipo: \"reuniaoCLI\" },\n", ""]],
  ["missoes", "o Presidente não lê as reuniões da CLI", ["if (misPapel(\"geral\") || misPapel(\"presidente\")) {", "if (misPapel(\"geral\")) {"]],
  ["missoes", "tirar o escape da justificativa em Meus Dados", ["Justificativa: ${misH(e.justificativa)}", "Justificativa: ${e.justificativa}"]],
  ["missoes", "esconder as decisões em Meus Dados", ["${decisao(\"Parecer da CME\", e.parecerCME)}${decisao(\"Decisão da CLI\", e.decisaoCLI)}${decisao(\"Pastor Presidente\", e.presidente)}", ""]],
  ["missoes", "\"em dia\" na lista da CME", ["e.relatoriosVencidos == null ? \"—\" : ", ""]],
  ["missoes", "esconder a data da CLI no valor", ["${v.cliEm ? ` <small>(aumento aprovado pela CLI em ${misH(misBr(v.cliEm))})</small>` : \"\"}", ""]]
];

(async () => {
  const r = await prova();
  console.log(`\nprova da tela da v9.4 (missões): ${r.total - r.falhas}/${r.total} verificações ok${r.falhas ? ` — ${r.falhas} FALHA(S)` : ""}`);
  if (process.env.MUTAR !== "1") { if (r.falhas) process.exitCode = 1; return; }
  let acusadas = 0;
  const vivas = [];
  // uma mutação que deixa a tela esperando para sempre esvaziaria o laço de eventos e o processo terminaria calado: o intervalo o mantém vivo até o prazo de 60 s;
  // e a exceção solta na tela conta como acusada (a prova não termina limpa)
  const vivo = setInterval(() => {}, 1000);
  let soltas = 0;
  const naoTratada = () => { soltas++; };
  process.on("unhandledRejection", naoTratada); process.on("uncaughtException", naoTratada);
  for (const [arquivo, nome, [de, para]] of MUTACOES) {
    const original = lerApp(`modulos/${arquivo}.js`);
    const n = original.split(de).length - 1;
    if (n !== 1) { vivas.push(`${nome} (trecho achado ${n} vez(es))`); continue; }
    MUTADO = { arquivo, texto: original.replace(de, () => para) };
    process.env.CALADO = "1";
    const soltasAntes = soltas;
    let res;
    try {
      res = await Promise.race([prova(), new Promise((resolve) => { const t = setTimeout(() => resolve({ total: 1, falhas: 1, travou: true }), 60000); t.unref(); })]);
    } catch (e) { res = { total: 1, falhas: 1 }; }
    delete process.env.CALADO;
    MUTADO = null;
    if (res.falhas > 0 || soltas > soltasAntes) acusadas++; else vivas.push(nome);
  }
  clearInterval(vivo);
  process.off("unhandledRejection", naoTratada); process.off("uncaughtException", naoTratada);
  console.log(`mutações: ${acusadas}/${MUTACOES.length} acusadas${vivas.length ? ` — vivas: ${vivas.join("; ")}` : ""}`);
  if (r.falhas || vivas.length) process.exitCode = 1;
})();
