// mutacoes.js — desfaz, uma a uma, as garantias da tela do check-in infantil (v7.10): escape de cada campo do servidor, validação de cada formulário, limpeza do código de retirada em todo caminho,
// relógio de atualização, confirmações, permissões da liderança, foco e leitor de tela, ligações com a navegação e com o service worker. Cada mutação TEM de ser acusada (pelo menos uma falha no
// roteiro); uma que escapa mostra um buraco no roteiro. Âncora que não casa mais (ou casa mais de uma vez) = "INAPLICÁVEL", também reprovada.
//   node mutacoes.js              roda tudo, em vários processos (CHK_PROCESSOS=6 por padrão)
//   node mutacoes.js <filtro>     só as mutações cujo nome contém o filtro
//   node mutacoes.js --conferir   só confere se cada âncora casa exatamente uma vez (sem rodar o roteiro)
// Três grupos: (1) gerados do código — um por chamada de escaparHtmlEbd (a chamada some) e um por validação `if (...) { erro(...); return; }` (a condição vira falsa); (2) escritos à mão (abaixo);
// (3) os dois dos mutantes EQUIVALENTES de propósito (EQUIVALENTES) não entram na conta: defesa em dupla camada ou texto que nunca vem de fora, com o motivo escrito ao lado.
"use strict";
const fs = require("fs");
const path = require("path");
const { fork } = require("child_process");
const { lerApp } = require("./ambiente");

const P = "modulos/checkin-infantil.js", S = "script.js", D = "modulos/meus-dados.js", H = "index.html", C = "style.css", W = "service-worker.js", M = "modulos/meu-painel.js";

// ------------------------------------------------------------ (1) gerados do código
function contextoUnico(codigo, ini, fim) {
  let a = ini, b = fim;
  for (let k = 0; k < 60; k++) {
    if (codigo.split(codigo.slice(a, b)).length - 1 === 1) return [a, b];
    a = Math.max(0, a - 10); b = Math.min(codigo.length, b + 10);
  }
  throw new Error(`contexto não único na posição ${ini}`);
}
function gerarEscapes(codigo) {
  const out = [], marca = "escaparHtmlEbd(";
  let pos = 0;
  while ((pos = codigo.indexOf(marca, pos)) >= 0) {
    let nivel = 0, j = pos + marca.length - 1;
    for (; j < codigo.length; j++) { const ch = codigo[j]; if (ch === "(") nivel++; else if (ch === ")") { nivel--; if (nivel === 0) break; } }
    const arg = codigo.slice(pos + marca.length, j);
    const [a, b] = contextoUnico(codigo, pos, j + 1);
    const de = codigo.slice(a, b), para = codigo.slice(a, pos) + "(" + arg + ")" + codigo.slice(j + 1, b);
    const linha = codigo.slice(0, pos).split("\n").length;
    out.push([`escape (linha ${linha}): ${codigo.slice(pos, j + 1).slice(0, 72)}`, P, de, para]);
    pos = j + 1;
  }
  return out;
}
function gerarValidacoes(codigo) {
  const out = [];
  codigo.split("\n").forEach((linha, i) => {
    const m = /^(\s*)if \((.+)\) \{ (erro\(|chkEscrever\(msg,)/.exec(linha);
    if (!m || !/return; \}\s*$/.test(linha)) return;
    if (codigo.split(linha).length - 1 !== 1) return;
    out.push([`validação removida (linha ${i + 1}): ${m[2].slice(0, 72)}`, P, linha, linha.replace(`if (${m[2]}) {`, `if (false && (${m[2]})) {`)]);
  });
  return out;
}

// Equivalentes de propósito: [parte do nome, motivo]
const EQUIVALENTES = [
  ["escape (linha", "(ver a lista gerada: as chamadas de escape que só recebem constante nossa ou número não têm o que atacar — o filtro abaixo as tira pelo texto do argumento)"]
];
// Mutantes que ESCAPAM e são EQUIVALENTES de propósito (o resumo os mostra, com o motivo, e eles não reprovam a prova): [regra sobre o nome, motivo]. O número de linha muda a cada edição do módulo.
const EQUIVALENTES_CONHECIDAS = [
  [/^escape \(linha \d+\): escaparHtmlEbd\(calDataHora\(guardada\.atualizadoEm\)\)$/, "calDataHora devolve só dígitos, barras e dois-pontos (data e hora formatadas): nada de fora entra nesse texto"],
  [/^escape \(linha \d+\): escaparHtmlEbd\(t\)$/, "o texto das pendências ('N retirada(s)...') é montado aqui, só com números e frases fixas: nada de fora entra nele"],
  [/^liderança: a matrícula zero vale$/, "para o texto '0' o resultado já é 0 (Number('0') === 0), igual ao do código original: a condição Number(t) >= 1 é redundante, a função devolve o mesmo valor para toda entrada"]
];
const equivalenteConhecido = (nome) => EQUIVALENTES_CONHECIDAS.find(([re]) => re.test(nome)) || null;
// o argumento dessas chamadas é constante do código ou número: a mutação não muda nada que alguém de fora controle
const ESCAPES_DE_CONSTANTE = [
  /escaparHtmlEbd\(classe\)/, /escaparHtmlEbd\(placeholder\)/, /escaparHtmlEbd\(CHK_/, /escaparHtmlEbd\(chkAnos\(/, /escaparHtmlEbd\(chkHoraServico\(/, /escaparHtmlEbd\(chkHoraInstante\(/,
  /escaparHtmlEbd\(t\)\}<\/li>.*/
];

// ------------------------------------------------------------ (2) à mão
const MANUAIS = [
  // ---- a limpeza: o código e a sala saem em todo caminho
  ["limpeza: sair da sessão não zera a impressão (o código)", P, "chkAcao = null; chkGatilhoForm = null; chkCi = null; chkImpressao = null;\n  chkSalasMeu = [];", "chkAcao = null; chkGatilhoForm = null; chkCi = null;\n  chkSalasMeu = [];"],
  ["limpeza: sair da sessão não apaga as listas da tela", P, "  CHK_IDS_LISTAS.forEach(id => { const el = chkEl(id); if (el) el.innerHTML = \"\"; });\n  CHK_IDS_MENSAGENS", "  CHK_IDS_MENSAGENS"],
  ["limpeza: sair da sessão não apaga as mensagens", P, "  CHK_IDS_MENSAGENS.forEach(id => { const el = chkEl(id); if (el) { el.textContent = \"\"; el.className = \"subtitle\"; } });\n", ""],
  ["limpeza: sair da sessão não apaga a matrícula digitada", P, "  CHK_IDS_CAMPOS.forEach(id => { const el = chkEl(id); if (el) el.value = \"\"; });\n", ""],
  ["limpeza: sair da sessão deixa as salas escondidas", P, "  chkMostrarListas(\"Meu\", true); chkMostrarListas(\"Ges\", true);\n  chkLimparImpressaoDaPagina();\n  chkAplicarSecaoGestao(\"salas\");", "  chkLimparImpressaoDaPagina();\n  chkAplicarSecaoGestao(\"salas\");"],
  ["limpeza: sair da sessão deixa as classes de impressão no <body>", P, "  chkMostrarListas(\"Meu\", true); chkMostrarListas(\"Ges\", true);\n  chkLimparImpressaoDaPagina();", "  chkMostrarListas(\"Meu\", true); chkMostrarListas(\"Ges\", true);"],
  ["limpeza: sair da sessão não volta à seção das salas", P, "  chkLimparImpressaoDaPagina();\n  chkAplicarSecaoGestao(\"salas\");\n}", "  chkLimparImpressaoDaPagina();\n}"],
  ["limpeza: sair da sessão deixa a seção atual da liderança", P, "chkAprovacoes = []; chkSecaoAtual = \"salas\"; chkFalhas = 0; chkEmVoo = 0;", "chkAprovacoes = []; chkFalhas = 0; chkEmVoo = 0;"],
  ["limpeza: sair da sessão deixa o relógio rodando", P, "  chkGeracao++;\n  chkPararTimer(); chkPararBusca();\n  chkCatalogos = null;", "  chkGeracao++;\n  chkPararBusca();\n  chkCatalogos = null;"],
  ["limpeza: sair da sessão não pára a busca da criança", P, "  chkGeracao++;\n  chkPararTimer(); chkPararBusca();\n  chkCatalogos = null;", "  chkGeracao++;\n  chkPararTimer();\n  chkCatalogos = null;"],
  ["limpeza: sair da sessão deixa o catálogo do login anterior", P, "  chkCatalogos = null; chkSala = null; chkSnap = null; chkAssinatura = \"\"; chkAcao = null;", "  chkSala = null; chkSnap = null; chkAssinatura = \"\"; chkAcao = null;"],
  ["limpeza: as duas camadas que descartam a resposta atrasada do login anterior (geração e sequência) desfeitas", P, [
    ["  chkGeracao++;\n  chkPararTimer(); chkPararBusca();\n  chkCatalogos = null;", "  chkPararTimer(); chkPararBusca();\n  chkCatalogos = null;"],
    ["  chkSeqSala++; chkSeqLeitura++; chkSeqMeu++; chkSeqGes++; chkSeqBusca++; chkSeqResp++; chkSeqApr++; chkSeqFicha++; chkSeqRel++;\n  chkEmCurso.clear();\n  CHK_IDS_LISTAS", "  chkEmCurso.clear();\n  CHK_IDS_LISTAS"]
  ]],
  ["limpeza: sair da sessão não solta a trava de duplo clique", P, "chkSeqRel++;\n  chkEmCurso.clear();\n  CHK_IDS_LISTAS", "chkSeqRel++;\n  CHK_IDS_LISTAS"],
  ["limpeza: as classes de impressão não saem do <body>", P, "  if (classes) classes.remove(\"chk-imprimindo\", \"chk-imp-etiquetas\", \"chk-imp-relatorio\");\n}", "  if (classes) classes.remove(\"chk-imprimindo\");\n}"],
  ["limpeza: sair da sala deixa o relógio rodando", P, "  const perdeuCodigo = avisar && chkHaCodigoNaoImpresso();\n  chkPararTimer(); chkPararBusca();", "  const perdeuCodigo = avisar && chkHaCodigoNaoImpresso();\n  chkPararBusca();"],
  ["limpeza: sair da sala não zera a impressão (o código)", P, "chkCi = null; chkImpressao = null; chkFalhas = 0; chkEmVoo = 0; chkUltimaLeituraMs = 0;\n  chkEmCurso.clear();\n  chkLimparImpressaoDaPagina();", "chkCi = null; chkFalhas = 0; chkEmVoo = 0; chkUltimaLeituraMs = 0;\n  chkEmCurso.clear();\n  chkLimparImpressaoDaPagina();"],
  ["limpeza: sair da sala deixa a sala no DOM (com os códigos)", P, "  [\"chkSalaMeu\", \"chkSalaGes\"].forEach(id => { const el = chkEl(id); if (el) el.innerHTML = \"\"; });\n  if (ctx) chkMostrarListas(ctx, true);", "  if (ctx) chkMostrarListas(ctx, true);"],
  ["limpeza: sair da sala não mostra a lista de salas de volta", P, "  if (ctx) chkMostrarListas(ctx, true);\n  if (perdeuCodigo)", "  if (perdeuCodigo)"],
  ["limpeza: sair da sala deixa as classes de impressão", P, "  chkEmCurso.clear();\n  chkLimparImpressaoDaPagina();\n  [\"chkSalaMeu\"", "  chkEmCurso.clear();\n  [\"chkSalaMeu\""],
  ["limpeza: sair da sala não invalida o que está a caminho (leitura, busca, relatório)", P, "  chkSeqSala++; chkSeqLeitura++; chkSeqBusca++; chkSeqResp++; chkSeqRel++;\n  chkSala = null;", "  chkSala = null;"],
  ["troca de login: a tela não percebe que o dono mudou", P, "  if (chkDono !== chkChaveDoDono()) { chkLimparTela(); chkDono = chkChaveDoDono(); }", "  chkDono = chkChaveDoDono();"],
  ["troca de login: o dono é só a matrícula (PIN e senha viram o mesmo dono)", P, "function chkChaveDoDono() { return `${authMatricula}|${sessaoDeLiderancaNaTela() ? \"senha\" : \"pin\"}`; }", "function chkChaveDoDono() { return `${authMatricula}`; }"],
  ["navegação: outra aba não fecha a sala da liderança", P, "  if (aba !== \"checkininfantil\") chkFecharContexto(\"Ges\");\n", ""],
  ["navegação: outra aba não fecha a sala do Meu Painel", P, "  if (aba !== \"meupainel\") chkFecharContexto(\"Meu\");\n", ""],
  ["navegação: outra aba não apaga a ficha", P, "  if (aba !== \"checkininfantil\") chkSairDasFichas();\n}", "}"],
  ["navegação: outra sub-aba do Meu Painel não fecha a sala", P, "  if (sub !== \"checkininfantil\") chkFecharContexto(\"Meu\");", ""],
  ["navegação: fechar o contexto não fecha a sala aberta", P, "  if (chkSala && chkSala.ctx === ctx) chkFecharSalaInterno();\n  chkSeqSala++;\n  const ids", "  chkSeqSala++;\n  const ids"],
  ["navegação: fechar o contexto não apaga as listas", P, "  ids.forEach(id => { const el = chkEl(id); if (el) el.innerHTML = \"\"; });\n  // (quem chama", "  // (quem chama"],
  ["navegação: sair da aba da liderança deixa o relógio da fila rodando", P, "chkEpocaApr++; if (!chkSala) chkPararTimer(); }", "chkEpocaApr++; }"],
  ["navegação: sair da aba deixa a ficha na tela", P, "  const cx = chkEl(\"chkFichaCx\"); if (cx) cx.innerHTML = \"\";\n  const msg", "  const msg"],
  ["navegação: sair da aba deixa a matrícula da ficha", P, "  const campo = chkEl(\"chkFiMatricula\"); if (campo) campo.value = \"\";\n}", "}"],
  ["navegação: sair da aba não invalida a busca da ficha em andamento", P, "function chkSairDasFichas() {\n  chkSeqFicha++;", "function chkSairDasFichas() {"],

  // ---- o relógio de atualização
  ["relógio: o intervalo é de 30 s", P, "const CHK_INTERVALO_MS = 8000;", "const CHK_INTERVALO_MS = 30000;"],
  ["relógio: o tique não confere de quem é a tela", P, "  if (!authToken || chkDono !== chkChaveDoDono()) { chkPararTimer(); return; }", "  if (!authToken) { chkPararTimer(); return; }"],
  ["relógio: o tique não confere se a página está escondida", P, "  if (chkPaginaOculta()) { chkPararTimer(); return; }\n  if (chkSala) {", "  if (chkSala) {"],
  ["relógio: o tique não fecha a sala que saiu da tela", P, "    if (!chkContextoVisivel(chkSala.ctx)) { chkFecharSalaInterno(); return; }", ""],
  ["relógio: o tique não pára quando não há o que atualizar", P, "  if (chkAprovacoesVisiveis()) { chkCarregarAprovacoes(true, forcar === true); return; }\n  chkPararTimer();\n}", "  if (chkAprovacoesVisiveis()) { chkCarregarAprovacoes(true, forcar === true); return; }\n}"],
  ["relógio: a página escondida não pára o relógio", P, "  if (chkPaginaOculta()) { chkPararTimer(); return; }\n  if (!authToken || !chkTemOQueAtualizar()) return;", "  if (!authToken || !chkTemOQueAtualizar()) return;"],
  ["relógio: voltar ao navegador não lê a sala na hora", P, "  chkTique(true);\n  chkIniciarTimer();\n}", "  chkIniciarTimer();\n}"],
  ["relógio: voltar ao navegador não religa o relógio", P, "  chkTique(true);\n  chkIniciarTimer();\n}", "  chkTique(true);\n}"],
  ["relógio: não ouve a visibilidade da página", P, "document.addEventListener(\"visibilitychange\", chkVisibilidadeMudou);\n", ""],
  ["relógio: pode haver dois relógios", P, "function chkIniciarTimer() { if (chkTimer == null && !chkPaginaOculta()) chkTimer", "function chkIniciarTimer() { if (!chkPaginaOculta()) chkTimer"],
  ["relógio: nasce com a página escondida", P, "function chkIniciarTimer() { if (chkTimer == null && !chkPaginaOculta()) chkTimer", "function chkIniciarTimer() { if (chkTimer == null) chkTimer"],
  ["relógio: o intervalo não é limpo", P, "function chkPararTimer() { if (chkTimer != null) { clearInterval(chkTimer); chkTimer = null; } }", "function chkPararTimer() { chkTimer = null; }"],
  ["relógio: a tela só olha o próprio elemento (não os que o contêm)", P, "  for (let p = el; p && p.nodeType === 1; p = p.parentNode) if (p.style && p.style.display === \"none\") return false;\n  return true;\n}", "  return el.style.display !== \"none\";\n}"],
  ["relógio: a fila de aprovações vale em qualquer seção", P, "&& chkSecaoAtual === \"aprovacoes\" && chkVisivel(\"chkSecaoAprovacoes\")", "&& chkVisivel(\"chkSecaoAprovacoes\")"],
  ["relógio: o Meu Painel só confere a aba, não a sub-aba", P, "chkVisivel(\"abaMeupainel\") && chkVisivel(\"subMeupainelCheckininfantil\")", "chkVisivel(\"abaMeupainel\")"],
  ["leitura: os pedidos se empilham", P, "  if (!forcar && chkEmVoo > 0) return;   // o pedido anterior ainda não voltou: nunca se empilham pedidos", "  // (sem trava)"],
  ["leitura: a resposta velha vence a nova", P, "|| leitura !== chkSeqLeitura || !chkSala) return;", "|| !chkSala) return;"],
  ["leitura: 403/404/422 não tiram a pessoa da sala", P, "    if (data.httpStatus === 403 || ((data.httpStatus === 404 || data.httpStatus === 422) && respostaDoServidor)) { chkSairDaSala(chkMsgErro(data), !!data.jaAvisado); return; }\n", ""],
  ["leitura: a sessão que acabou conta como falha de rede", P, "    if (data.sessaoExpirada) return;\n    chkFalhas++;\n    const parou = chkFalhas >= CHK_MAX_FALHAS;\n    chkEscrever(\"chkSalaMsg\"", "    chkFalhas++;\n    const parou = chkFalhas >= CHK_MAX_FALHAS;\n    chkEscrever(\"chkSalaMsg\""],
  ["leitura: o relógio nunca pára por falhas", P, "    const parou = chkFalhas >= CHK_MAX_FALHAS;\n    chkEscrever(\"chkSalaMsg\"", "    const parou = false;\n    chkEscrever(\"chkSalaMsg\""],
  ["leitura: o limite de falhas é 99", P, "const CHK_MAX_FALHAS = 3;", "const CHK_MAX_FALHAS = 99;"],
  ["leitura: parar por falhas não pára o intervalo", P, "    chkAtualizarCarimbo();\n    if (parou) chkPararTimer();\n    return;", "    chkAtualizarCarimbo();\n    return;"],
  ["leitura: a leitura que volta a dar certo não limpa o aviso nem religa o relógio", P, "  if (chkFalhas > 0) { chkFalhas = 0; chkEscrever(\"chkSalaMsg\", \"\", false); chkIniciarTimer(); }", "  chkFalhas = 0;"],
  ["leitura: a leitura que volta não religa o relógio", P, "  if (chkFalhas > 0) { chkFalhas = 0; chkEscrever(\"chkSalaMsg\", \"\", false); chkIniciarTimer(); }", "  if (chkFalhas > 0) { chkFalhas = 0; chkEscrever(\"chkSalaMsg\", \"\", false); }"],
  ["leitura: a lista é refeita a cada tique (pisca e perde o foco)", P, "  if (assinatura !== chkAssinatura) {", "  if (true) {"],
  ["leitura: a assinatura ignora as crianças", P, "[snap.sala, snap.adultosPresentes, snap.lotacao, snap.criancas, snap.pendencias, snap.totais]", "[snap.sala, snap.adultosPresentes, snap.lotacao, snap.pendencias, snap.totais]"],
  ["foco: a lista refeita não devolve o foco ao mesmo botão", P, "  if (novo) { if (novo !== ativo) chkFocar(novo); return; }", "  if (novo) return;"],
  ["foco: o botão que sumiu deixa o foco no corpo da página", P, "  chkFocarId(chkSala ? \"chkSalaTitulo\" : \"btnChkSecaoAprovacoes\");\n}", "}"],
  ["foco: abrir a sala não leva o foco ao título", P, "  chkEscrever(\"chkSalaMsg\", \"Carregando a sala…\", false);\n  chkFocarId(\"chkSalaTitulo\");", "  chkEscrever(\"chkSalaMsg\", \"Carregando a sala…\", false);"],
  ["foco: depois de pedir ao servidor o botão desabilitado perde o foco para sempre", P, "    if (tinhaFoco && chkFocoPerdido()) {", "    if (false) {"],
  ["foco: o botão desabilitado não recebe o foco de volta (só o título)", P, "      chkVoltarFoco(botao);\n      // o botão saiu da tela", "      // o botão saiu da tela"],
  ["foco: o botão que saiu da tela deixa o foco no corpo da página", P, "      if (chkFocoPerdido()) chkFocarId(chkSala ? \"chkSalaTitulo\" : (chkVisivel(\"chkSecaoAprovacoes\") ? \"btnChkSecaoAprovacoes\" : \"\"));\n", ""],
  ["foco: o foco volta ao ELEMENTO de antes (que a lista refeita já tirou da árvore), não ao botão de mesmo id", P, "  const el = id ? chkEl(id) : (origem && typeof origem === \"object\" ? origem : null);", "  const el = origem && typeof origem === \"object\" ? origem : chkEl(origem);"],
  ["foco: a fila de aprovações não tem para onde mandar o foco", P, "(chkVisivel(\"chkSecaoAprovacoes\") ? \"btnChkSecaoAprovacoes\" : \"\")", "\"\""],
  ["foco: depois do modal o foco não volta ao botão", P, "  const sim = await confirmarAcao(mensagem, rotulo);\n  chkVoltarFoco(origem);\n  return sim;", "  const sim = await confirmarAcao(mensagem, rotulo);\n  return sim;"],

  // ---- abrir, sair e entrar na sala
  ["sala: a iniciar o relógio ao abrir", P, "  chkFocarId(\"chkSalaTitulo\");\n  chkIniciarTimer();\n}", "  chkFocarId(\"chkSalaTitulo\");\n}"],
  ["sala: sem o catálogo a sala continua aberta", P, "  if (!catalogo) { chkSairDaSala(CHK_MSG_SEM_CATALOGO, false); return; }\n", ""],
  ["sala: o erro do servidor não tira a pessoa da sala", P, "  if (data.sucesso === false || !data.sala || typeof data.sala !== \"object\") { chkSairDaSala(chkMsgErro(data), !!data.jaAvisado); return; }", ""],
  ["sala: sair da sala por erro não avisa", P, "  if (!jaAvisado) mostrarToast(mensagem, \"erro\");", ""],
  ["sala: sair da sala por erro avisa duas vezes", P, "  if (!jaAvisado) mostrarToast(mensagem, \"erro\");", "  mostrarToast(mensagem, \"erro\");"],
  ["sala: voltar com código não impresso não pergunta", P, "if (chkHaCodigoNaoImpresso() && !(await chkPerguntar(\"Há códigos de retirada", "if (false && !(await chkPerguntar(\"Há códigos de retirada"],
  ["sala: voltar sempre pergunta (mesmo com o código impresso)", P, "if (chkHaCodigoNaoImpresso() && !(await chkPerguntar(\"Há códigos de retirada", "if (!!chkImpressao && !(await chkPerguntar(\"Há códigos de retirada"],
  ["sala: voltar não devolve o foco ao botão de onde veio", P, "  chkFecharSalaInterno(false);   // já perguntou: não avisa de novo\n  chkFocarId(gatilho);", "  chkFecharSalaInterno(false);   // já perguntou: não avisa de novo"],
  ["sala: entrar não confere se ainda é a mesma tela", P, "async function chkEntrarAcao(botao) {\n  if (!chkSala) return;", "async function chkEntrarAcao(botao) {\n  if (false) return;"],
  ["sala: sair da sala sem a proteção de duplo clique", P, "  }, \"sair\");", "  }, undefined);"],
  ["sala: entrar sem a proteção de duplo clique", P, "  }, \"entrar\");", "  }, undefined);"],
  ["sala: o corpo de entrar leva o id como texto", P, "chkPostar(\"entrar-na-sala\", { servicoId: sala.servicoId, equipeId: sala.equipeId })", "chkPostar(\"entrar-na-sala\", { servicoId: String(sala.servicoId), equipeId: sala.equipeId })"],
  ["sala: tirar voluntário sem a confirmação", P, "if (!(await chkPerguntar(`Tirar ${v ? v.nome", "if (false && !(await chkPerguntar(`Tirar ${v ? v.nome"],
  ["sala: tirar voluntário vale também para quem não é da liderança", P, "  if (!chkSala || !chkSala.ehGestao || !chkInteiro(membroId)) return;", "  if (!chkSala || !chkInteiro(membroId)) return;"],
  ["sala: tirar voluntário sem a proteção de duplo clique", P, "  }, `tirar${membroId}`);", "  }, undefined);"],
  ["sala: a janela fechada deixa o formulário à mostra", P, "  else if (!chkJanelaAberta()) aviso =", "  else if (false) aviso ="],
  ["sala: quem não está na sala vê o formulário", P, "  else if (!chkEstouPresente()) aviso =", "  else if (false) aviso ="],
  ["sala: a liderança fora da equipe vê o formulário", P, "  if (!chkSala.ehMinha) aviso =", "  if (false) aviso ="],
  ["sala: operar sem estar na sala", P, "function chkPodeOperar() { return !!chkSala && chkSala.ehMinha && chkEstouPresente(); }", "function chkPodeOperar() { return !!chkSala && chkSala.ehMinha; }"],
  ["sala: operar sem ser da equipe", P, "function chkPodeOperar() { return !!chkSala && chkSala.ehMinha && chkEstouPresente(); }", "function chkPodeOperar() { return !!chkSala && chkEstouPresente(); }"],
  ["sala: estar na sala é qualquer pessoa na lista", P, ".some(v => v && Number(v.membroId) === chkMeuId()); }", ".some(v => v); }"],
  ["sala: a gestão só aparece na visão da liderança — aparece sempre", P, "  if (alvo.ehGestao) chkMontarGestaoDaSala();", "  chkMontarGestaoDaSala();"],
  ["sala: a gestão da sala vale para quem só é da equipe", P, "ehGestao: !!entrada.ehGestao, gatilhoId", "ehGestao: true, gatilhoId"],
  ["sala: a janela fechada some do cartão da lista", P, "    ${j && !j.aberta && j.mensagem ? ", "    ${false ? "],

  // ---- a busca e o check-in
  ["busca: o tempo de espera da digitação é zero", P, "const CHK_MS_BUSCA = 350;", "const CHK_MS_BUSCA = 0;"],
  ["busca: digitar mais não cancela o temporizador anterior", P, "function chkBuscaDigitouAcao() {\n  chkPararBusca();", "function chkBuscaDigitouAcao() {"],
  ["busca: a resposta velha vence a nova", P, "seq !== chkSeqBusca || seqSala !== chkSeqSala || !chkCi) return;", "seqSala !== chkSeqSala || !chkCi) return;"],
  ["busca: buscar sem estar na sala", P, "  if (!chkSala || !chkCi || !chkPodeOperar()) return;\n  chkPararBusca();", "  if (!chkSala || !chkCi) return;\n  chkPararBusca();"],
  ["busca: criança que já está numa sala continua com o botão", P, "${r.jaNaSala ? \"disabled\" : \"\"}", "${\"\"}"],
  ["busca: a criança que já está na lista continua nos resultados", P, "const lista = chkCi.resultados.filter(r => !jaNaLista(Number(r.menorId)));", "const lista = chkCi.resultados;"],
  ["busca: o aviso 'sem responsável' some do resultado", P, "${r.temResponsavel ? \"\" : chkSelo(CHK_CLASSE_SELO.atencao, \"Sem responsável cadastrado\")} ${r.jaNaSala", "${\"\"} ${r.jaNaSala"],
  ["busca: a criança membro entra sem pedir os responsáveis", P, "const data = await chkObter(`responsaveis?${chkConsultaSala(sala, `&menorId=${id}`)}`);", "const data = { sucesso: true, responsaveis: [] };"],
  ["busca: adicionar sem conferir se ainda é a mesma sala", P, "    if (geracao !== chkGeracao || seqSala !== chkSeqSala || !chkCi) return;\n    if (data.sucesso === false || !Array.isArray(data.responsaveis))", "    if (!chkCi) return;\n    if (data.sucesso === false || !Array.isArray(data.responsaveis))"],
  ["quem trouxe: os responsáveis são os de qualquer criança (não os comuns a todas)", P, "  membros.slice(1).forEach(m => { comuns = comuns.filter(r => m.responsaveis.some(x => x.membroId === r.membroId)); });\n", ""],
  ["quem trouxe: a escolha sempre cai em 'outra pessoa'", P, "? atual : (comuns.length ? \"\" : CHK_OUTRA);", "? atual : CHK_OUTRA;"],
  ["quem trouxe: a escolha de quem confere o documento não vale", P, "sel.value = manual && atual && Array.from(sel.options).some(o => o.value === atual) ? atual :", "sel.value = false ? atual :"],
  ["quem trouxe: o rótulo do telefone nunca diz que é obrigatório", P, "rot.textContent = chkHaVisitante() ? \"Telefone com DDD (obrigatório: há criança visitante)\" : \"Telefone com DDD (opcional)\";", "rot.textContent = \"Telefone com DDD (opcional)\";"],
  ["quem trouxe: 'outra pessoa' sempre à vista", P, "if (cx) cx.style.display = chkTexto(\"chkCiTrouxe\") === CHK_OUTRA ? \"\" : \"none\";", "if (cx) cx.style.display = \"\";"],
  ["quem trouxe: escolher um responsável não marca a escolha como de propósito", P, "  if (chkCi) chkCi.trouxeManual = true;\n", ""],
  ["visitante: o texto da saúde fica sempre à vista", P, "  if (cx) cx.style.display = tem ? \"\" : \"none\";", "  if (cx) cx.style.display = \"\";"],
  ["visitante: apagar a alergia não desmarca o 'concordo'", P, "  if (!tem) { const c = chkEl(\"chkCiVisConcordo\"); if (c) c.checked = false; }\n", ""],
  ["visitante: o 'concordo' vai como texto", P, "dadosSaude = { texto: saude, concordo: true, textoHash: t.hash };", "dadosSaude = { texto: saude, concordo: \"sim\", textoHash: t.hash };"],
  ["visitante: o hash do texto não vai", P, "dadosSaude = { texto: saude, concordo: true, textoHash: t.hash };", "dadosSaude = { texto: saude, concordo: true, textoHash: \"\" };"],
  ["visitante: a saúde vai sem o 'concordo'", P, "{ saude: { texto: c.saude.texto, concordo: true, textoHash: c.saude.textoHash } }", "{ saude: { texto: c.saude.texto, textoHash: c.saude.textoHash } }"],
  ["visitante: o telefone vai com máscara", P, "const telefone = chkTexto(\"chkCiTrouxeTel\").replace(/\\D/g, \"\");", "const telefone = chkTexto(\"chkCiTrouxeTel\");"],
  ["visitante: o telefone não vai", P, "    if (telefone) trouxe.contato = telefone;\n", ""],
  ["check-in: as pessoas da visita não vão", P, "  if (extras.length) corpo.autorizadosVisita = extras;\n", ""],
  ["check-in: o id da sala vai como texto", P, "servicoId: chkSala.servicoId, equipeId: chkSala.equipeId, trouxe,", "servicoId: String(chkSala.servicoId), equipeId: chkSala.equipeId, trouxe,"],
  ["check-in: o formulário não é limpo depois de dar certo", P, "    chkMostrarResultado(data, msg, false);\n    chkLimparFormCheckin();", "    chkMostrarResultado(data, msg, false);"],
  ["check-in: o painel das etiquetas não abre", P, "    chkMostrarImpressao(\"CHECKIN\", data.etiquetas, data.recibo);\n", ""],
  ["check-in: sucesso sem etiquetas é tratado como sucesso", P, "    const gravou = data.sucesso === true && Array.isArray(data.etiquetas) && data.etiquetas.length > 0;", "    const gravou = data.sucesso !== false;"],
  ["check-in: a recusa limpa o formulário", P, "      chkMostrarResultado(data, msg, true);\n      if (data.termoMudou) {", "      chkMostrarResultado(data, msg, true); chkLimparFormCheckin();\n      if (data.termoMudou) {"],
  ["check-in: 409 não lê a sala de novo", P, "      if (data.httpStatus === 409) chkLerSala(true);\n", ""],
  ["check-in: o texto da saúde que mudou não recarrega o catálogo", P, "chkGarantirCatalogos(true).then(() => {\n          if (geracao", "Promise.resolve().then(() => {\n          if (geracao"],
  ["check-in: o visitante com saúde segue na lista depois que o texto mudou", P, "          chkReabrirVisitantesComSaude(hashNovo !== hashAntigo);\n", ""],
  ["check-in: o visitante volta ao formulário por cima do que a pessoa digitava", P, "  const formVazio = !chkTexto(\"chkCiVisNome\") && !chkTexto(\"chkCiVisNasc\") && !chkTexto(\"chkCiVisSaude\");", "  const formVazio = true;"],
  ["check-in: o visitante não volta ao formulário", P, "  if (formVazio) {\n    const preencher", "  if (false) {\n    const preencher"],
  ["check-in: duplo clique em registrar vira dois pedidos", P, "  }, \"checkin\");", "  }, undefined);"],
  ["check-in: remover a criança não atualiza 'quem trouxe'", P, "  chkCi.criancas.splice(indice, 1);\n  chkAtualizarListaCheckin(); chkAtualizarTrouxe(); chkRenderResultados();", "  chkCi.criancas.splice(indice, 1);\n  chkAtualizarListaCheckin(); chkRenderResultados();"],
  ["check-in: a criança removida não volta aos resultados", P, "  chkCi.criancas.splice(indice, 1);\n  chkAtualizarListaCheckin(); chkAtualizarTrouxe(); chkRenderResultados();", "  chkCi.criancas.splice(indice, 1);\n  chkAtualizarListaCheckin(); chkAtualizarTrouxe();"],
  ["check-in: o selo de idade fora da faixa só na tela some", P, "chkNo(\"div\", \"chk-so-tela chk-aviso-faixa\"", "chkNo(\"div\", \"chk-aviso-faixa\""],
  ["check-in: o formulário do visitante não se limpa depois de adicionar", P, "  [\"chkCiVisNome\", \"chkCiVisNasc\", \"chkCiVisSaude\"].forEach(id => { const el = chkEl(id); if (el) el.value = \"\"; });\n", ""],

  // ---- a etiqueta e o recibo (o código só existe aqui)
  ["etiqueta: imprimir não marca como impresso", P, "  if (saiu) lotes.forEach(l => { l.impresso = true; });\n", ""],
  ["etiqueta: as classes de impressão ficam no <body> depois de imprimir", P, "    chkEmCurso.delete(\"imprimir\");\n    chkLimparImpressaoDaPagina();\n", "    chkEmCurso.delete(\"imprimir\");\n"],
  ["etiqueta: imprimir usa as classes do relatório", P, "classes.add(\"chk-imprimindo\", \"chk-imp-etiquetas\");", "classes.add(\"chk-imprimindo\", \"chk-imp-relatorio\");"],
  ["relatório: imprimir usa as classes das etiquetas", P, "classes.add(\"chk-imprimindo\", \"chk-imp-relatorio\");", "classes.add(\"chk-imprimindo\", \"chk-imp-etiquetas\");"],
  ["relatório: as classes ficam no <body> depois de imprimir", P, "try { window.print(); } finally { if (classes) classes.remove(\"chk-imprimindo\", \"chk-imp-relatorio\"); }", "try { window.print(); } finally { }"],
  ["etiqueta: um segundo lote some com o primeiro (perde o código)", P, "  if (!chkImpressao) chkImpressao = { lotes: [] };", "  chkImpressao = { lotes: [] };"],
  ["etiqueta: um lote novo conta como já impresso", P, ", impresso: false });\n  chkRenderImpressao(true);", ", impresso: true });\n  chkRenderImpressao(true);"],
  ["etiqueta: o painel não recebe o foco", P, "  if (comFoco) { chkRolarPara(\"chkImpressaoCx\"); chkFocarId(\"chkImpressaoTitulo\"); }", "  if (comFoco) { }"],
  ["etiqueta: a saúde não sai na etiqueta", P, "  if (et.saude) {", "  if (false) {"],
  ["etiqueta: o texto entra como marcação (createElement + innerHTML)", P, "  if (texto != null) el.textContent = String(texto);", "  if (texto != null) el.innerHTML = String(texto);"],
  ["etiqueta: fechar sem imprimir não pergunta", P, "  if (chkHaCodigoNaoImpresso() && !(await chkPerguntar(\"Os códigos de retirada ainda NÃO", "  if (false && !(await chkPerguntar(\"Os códigos de retirada ainda NÃO"],
  ["etiqueta: fechar não apaga a variável do código", P, "  chkImpressao = null; chkLotesAlvo = null;\n  chkRenderImpressao(false);", "  chkLotesAlvo = null;\n  chkRenderImpressao(false);"],
  ["etiqueta: fechar não apaga o código da tela", P, "  chkImpressao = null; chkLotesAlvo = null;\n  chkRenderImpressao(false);\n  chkLimparImpressaoDaPagina();", "  chkImpressao = null; chkLotesAlvo = null;\n  chkLimparImpressaoDaPagina();"],
  ["etiqueta: fechar não devolve o foco", P, "  chkLimparImpressaoDaPagina();\n  chkFocarId(\"chkSalaTitulo\");\n}", "  chkLimparImpressaoDaPagina();\n}"],
  ["etiqueta: o código vai para o armazenamento do navegador", P, ", impresso: false });\n  chkRenderImpressao(true);", ", impresso: false }); try { sessionStorage.setItem(\"chkUltimoLote\", JSON.stringify(itens)); } catch (e) { /* */ }\n  chkRenderImpressao(true);"],
  ["etiqueta: o código vai para o console", P, ", impresso: false });\n  chkRenderImpressao(true);", ", impresso: false }); console.log(JSON.stringify(itens));\n  chkRenderImpressao(true);"],
  ["etiqueta: o código vai no aviso do check-in", P, "    chkMostrarResultado(data, msg, false);\n    chkLimparFormCheckin();", "    chkMostrarResultado(Object.assign({}, data, { mensagem: `${data.mensagem} ${data.etiquetas[0].etiqueta.codigo}` }), msg, false);\n    chkLimparFormCheckin();"],
  ["etiqueta: a leitura da sala traz o código para a lista 'Na sala'", P, "    const saude = chkEl(`chkSaude${id}`); if (saude) saude.textContent = `⚠ Saúde: ${c.saude == null ? \"\" : c.saude}`;", "    const saude = chkEl(`chkSaude${id}`); if (saude) saude.textContent = `⚠ Saúde: ${c.saude == null ? \"\" : c.saude} ${c.codigo || \"\"}`;"],
  ["etiqueta: a segunda via não abre a etiqueta nova", P, "    chkMostrarImpressao(\"SEGUNDA_VIA\", [{ registroId: id, etiqueta: data.etiqueta }], null);", ""],

  // ---- retirada e segunda via
  ["retirada: o código digitado não é normalizado (maiúsculas)", P, "const codigo = digitado.replace(/[\\s-]/g, \"\").toUpperCase();", "const codigo = digitado.replace(/[\\s-]/g, \"\");"],
  ["retirada: o código digitado não perde espaço e hífen", P, "const codigo = digitado.replace(/[\\s-]/g, \"\").toUpperCase();", "const codigo = digitado.toUpperCase();"],
  ["retirada: o código digitado fica no campo", P, "const campo = chkEl(\"chkRtCodigo\"); if (campo) campo.value = \"\";   // o código digitado nunca fica no campo, qualquer que seja a resposta", ""],
  ["retirada: o código vai no endereço", P, "chkPostar(\"retirar\", { registroId, codigo, retirante })", "chkPostar(`retirar?codigo=${codigo}`, { registroId, codigo, retirante })"],
  ["retirada: o código vai para o armazenamento", P, "  const geracao = chkGeracao, seqSala = chkSeqSala, registroId = a.registroId;\n  await chkProtegerBotao(botao, async () => {\n    const data = await chkPostar(\"retirar\"", "  const geracao = chkGeracao, seqSala = chkSeqSala, registroId = a.registroId; try { sessionStorage.setItem(\"chkUltimoCodigo\", codigo); } catch (e) { /* */ }\n  await chkProtegerBotao(botao, async () => {\n    const data = await chkPostar(\"retirar\""],
  ["retirada: o código digitado vai para o console", P, "    const data = await chkPostar(\"retirar\", { registroId, codigo, retirante });", "    console.log(codigo); const data = await chkPostar(\"retirar\", { registroId, codigo, retirante });"],
  ["retirada: o código digitado vai para o aviso", P, "    if (data.codigoErrado === true && data.travada !== true) {   // código errado: o painel fica aberto, com o campo limpo para digitar de novo\n      chkMostrarResultado(data, msg, true);", "    if (data.codigoErrado === true && data.travada !== true) {   // código errado: o painel fica aberto, com o campo limpo para digitar de novo\n      mostrarToast(`Código ${codigo} errado`, \"erro\"); chkMostrarResultado(data, msg, true);"],
  ["retirada: quem retira sai sem ser escolhido pela lista (sempre 'outra pessoa')", P, "  } else retirante = { ref: quem };", "  } else retirante = { outro: { nome: quem, parentesco: \"OUTRO\", documento: \"RG\" } };"],
  ["retirada: 'outra pessoa' vai sem o documento", P, "retirante = { outro: { nome, parentesco, documento } };", "retirante = { outro: { nome, parentesco } };"],
  ["retirada: código errado fecha o painel mesmo travando só na quinta", P, "    if (data.codigoErrado === true && data.travada !== true) {", "    if (false) {"],
  ["retirada: a criança que trava deixa o painel aberto", P, "    if (data.codigoErrado === true && data.travada !== true) {", "    if (data.codigoErrado === true) {"],
  ["retirada: código errado não devolve o foco ao campo", P, "      chkMostrarResultado(data, msg, true);\n      chkFocarId(\"chkRtCodigo\");", "      chkMostrarResultado(data, msg, true);"],
  ["retirada: código errado não lê a sala de novo (tentativas)", P, "      chkFocarId(\"chkRtCodigo\");\n      chkLerSala(true);\n      return;", "      chkFocarId(\"chkRtCodigo\");\n      return;"],
  ["retirada: travada ou 409 deixa o painel aberto", P, "    if (data.travada === true || data.httpStatus === 409) {", "    if (false) {"],
  ["retirada: 403 não lê a sala (a pessoa continua com o painel)", P, "    if (data.httpStatus === 403) chkLerSala(true);   // se o acesso à sala acabou, a leitura tira a pessoa da tela", ""],
  ["retirada: sucesso deixa o painel aberto", P, "      chkFecharPainelAcao(false);\n      chkMostrarResultado(data, \"chkSalaMsg\", false);   // retirada feita", "      chkMostrarResultado(data, \"chkSalaMsg\", false);   // retirada feita"],
  ["retirada: fechar o painel não devolve o foco", P, "  if (!semFoco && gatilho) chkVoltarFoco(gatilho);", ""],
  ["retirada: o painel não confere se a pessoa ainda está na sala", P, "  if (!chkPodeOperar()) {\n    chkFecharPainelAcao(true);", "  if (false) {\n    chkFecharPainelAcao(true);"],
  ["retirada: o painel não fecha quando a criança muda", P, "  const ok = c && c.situacao === \"NA_SALA\" && (a.tipo === \"retirada\" ? !c.travado && !c.divergencia : !c.segundaViaPendente);", "  const ok = !!c;"],
  ["retirada: o painel abre sem foco", P, "  chkRolarPara(\"chkAcaoCx\");\n  chkFocarId(\"chkRtQuem\");", "  chkRolarPara(\"chkAcaoCx\");"],
  ["retirada: 'outra pessoa' fica sempre à vista", P, "function chkMudouRetiranteAcao() {\n  const cx = chkEl(\"chkRtOutraCx\");\n  if (cx) cx.style.display = chkTexto(\"chkRtQuem\") === CHK_OUTRA ? \"\" : \"none\";", "function chkMudouRetiranteAcao() {\n  const cx = chkEl(\"chkRtOutraCx\");\n  if (cx) cx.style.display = \"\";"],
  ["retirada: o painel abre para quem não está na sala", P, "  if (!c || !area || !chkSala || !chkPodeOperar()) return;\n  if (!chkCatalogos) { mostrarToast(CHK_MSG_SEM_OPCOES, \"erro\"); chkEscrever(\"chkSalaMsg\", CHK_MSG_SEM_OPCOES, true); return; }\n  chkAcao = { tipo: \"retirada\"", "  if (!c || !area || !chkSala) return;\n  if (!chkCatalogos) { mostrarToast(CHK_MSG_SEM_OPCOES, \"erro\"); chkEscrever(\"chkSalaMsg\", CHK_MSG_SEM_OPCOES, true); return; }\n  chkAcao = { tipo: \"retirada\""],
  ["retirada: duplo envio vira dois pedidos", P, "  }, `retirar${registroId}`);", "  }, undefined);"],
  ["retirada: o envio não confere se a pessoa ainda pode operar", P, "  if (!a || a.tipo !== \"retirada\" || !chkSala || !chkPodeOperar()) return;", "  if (!a || a.tipo !== \"retirada\" || !chkSala) return;"],
  ["cartão: a criança travada continua com o botão Retirar", P, "opc.operar && naSala && !travada ? botao(\"chkAbrirRetiradaAcao\"", "opc.operar && naSala ? botao(\"chkAbrirRetiradaAcao\""],
  ["cartão: com segunda via pendente pede-se outra", P, "opc.operar && naSala && !via ? botao(\"chkAbrirSegundaViaAcao\"", "opc.operar && naSala ? botao(\"chkAbrirSegundaViaAcao\""],
  ["cartão: quem pediu a segunda via também a confirma", P, "opc.operar && via && Number(via.pedidaPorMembroId) !== meuId ? botao(\"chkConfirmarSegundaViaAcao\"", "opc.operar && via ? botao(\"chkConfirmarSegundaViaAcao\""],
  ["cartão: quem registrou o pedido também o aprova", P, "opc.gestao && div && Number(div.pedidaPorMembroId) !== meuId ? botao(\"chkDecidirAcao\", [id, true, ARG.elemento]", "opc.gestao && div ? botao(\"chkDecidirAcao\", [id, true, ARG.elemento]"],
  ["cartão: quem registrou o pedido também o nega", P, "opc.gestao && div && Number(div.pedidaPorMembroId) !== meuId ? botao(\"chkDecidirAcao\", [id, false, ARG.elemento]", "opc.gestao && div ? botao(\"chkDecidirAcao\", [id, false, ARG.elemento]"],
  ["cartão: quem não é da liderança vê Aprovar", P, "opc.gestao && div && Number(div.pedidaPorMembroId) !== meuId ? botao(\"chkDecidirAcao\", [id, true, ARG.elemento]", "div && Number(div.pedidaPorMembroId) !== meuId ? botao(\"chkDecidirAcao\", [id, true, ARG.elemento]"],
  ["cartão: quem não é da liderança vê Negar", P, "opc.gestao && div && Number(div.pedidaPorMembroId) !== meuId ? botao(\"chkDecidirAcao\", [id, false, ARG.elemento]", "div && Number(div.pedidaPorMembroId) !== meuId ? botao(\"chkDecidirAcao\", [id, false, ARG.elemento]"],
  ["cartão: quem não é da liderança vê Destravar", P, "opc.gestao && travada ? botao(\"chkDestravarAcao\"", "travada ? botao(\"chkDestravarAcao\""],
  ["cartão: Aprovar leva o sinal trocado", P, "botao(\"chkDecidirAcao\", [id, true, ARG.elemento], \"✅ Aprovar a retirada\"", "botao(\"chkDecidirAcao\", [id, false, ARG.elemento], \"✅ Aprovar a retirada\""],
  ["cartão: Negar leva o sinal trocado", P, "botao(\"chkDecidirAcao\", [id, false, ARG.elemento], \"⛔ Negar a retirada\"", "botao(\"chkDecidirAcao\", [id, true, ARG.elemento], \"⛔ Negar a retirada\""],
  ["cartão: quem opera vê os dados de contato da liderança", P, "  const avisoDivergencia = div ? (opc.gestao\n", "  const avisoDivergencia = div ? (true\n"],
  ["cartão: a ordem não põe as pendências primeiro", P, "const peso = (c) => (c.divergencia ? 0 : c.travado ? 1 : c.segundaViaPendente ? 2 : 3);", "const peso = (c) => 3;"],
  ["cartão: as tentativas que restam não aparecem", P, "${Number.isFinite(tentativas) && tentativas < maxTentativas && naSala ?", "${false ?"],
  ["cartão: o telefone vira link para qualquer coisa", P, "<a class=\"chk-tel\" href=\"${urlSegura(`tel:${digitos}`)}\">", "<a class=\"chk-tel\" href=\"tel:${texto}\">"],
  ["cartão: telefone curto vira link", P, "return digitos.length >= 8 ?", "return digitos.length >= 0 ?"],
  ["segunda via: sem a confirmação do outro adulto", P, "if (!(await chkPerguntar(`Você conferiu o documento de", "if (false && !(await chkPerguntar(`Você conferiu o documento de"],
  ["segunda via: pedir não fecha o painel", P, "    chkFecharPainelAcao(false);\n    chkMostrarResultado(data, \"chkSalaMsg\", false);\n    await chkLerSala(true);\n  }, `segundavia", "    chkMostrarResultado(data, \"chkSalaMsg\", false);\n    await chkLerSala(true);\n  }, `segundavia"],
  ["segunda via: a recusa não lê a sala de novo", P, "      if (data.httpStatus === 409 || data.httpStatus === 403) chkLerSala(true);\n", ""],
  ["segunda via: confirmar sem pedido lê a sala mas pergunta", P, "  if (!c || !via) { chkLerSala(true); return; }\n", ""],
  ["segunda via: etiqueta nova sem etiqueta aceita como sucesso", P, "    if (data.sucesso !== true || !data.etiqueta || typeof data.etiqueta !== \"object\") {", "    if (data.sucesso === false) {"],
  ["segunda via: pedir sem a proteção de duplo clique", P, "  }, `segundavia${registroId}`);", "  }, undefined);"],
  ["segunda via: confirmar sem a proteção de duplo clique", P, "  }, `confsegundavia${id}`);", "  }, undefined);"],
  ["segunda via: o pedido vai com a pessoa como texto", P, "chkPostar(\"segunda-via-pedir\", { registroId, pessoa: { ref: quem }, documento })", "chkPostar(\"segunda-via-pedir\", { registroId, pessoa: quem, documento })"],
  ["segunda via: o painel abre para quem não está na sala", P, "  if (!c || !area || !chkSala || !chkPodeOperar()) return;\n  if (!chkCatalogos) { mostrarToast(CHK_MSG_SEM_OPCOES, \"erro\"); chkEscrever(\"chkSalaMsg\", CHK_MSG_SEM_OPCOES, true); return; }\n  chkAcao = { tipo: \"segundavia\"", "  if (!c || !area || !chkSala) return;\n  if (!chkCatalogos) { mostrarToast(CHK_MSG_SEM_OPCOES, \"erro\"); chkEscrever(\"chkSalaMsg\", CHK_MSG_SEM_OPCOES, true); return; }\n  chkAcao = { tipo: \"segundavia\""],
  ["segunda via: a pessoa pode ser 'outra' (não só quem já retira)", P, "<select id=\"chkSvQuem\">${chkOpcoesPessoas(c, false)}</select>", "<select id=\"chkSvQuem\">${chkOpcoesPessoas(c, true)}</select>"],

  // ---- a liderança
  ["liderança: decidir sem a confirmação", P, "if (!(await chkPerguntar(pergunta, aprovar ?", "if (false && !(await chkPerguntar(pergunta, aprovar ?"],
  ["liderança: o motivo curto demais é aceito", P, "    if (motivo.length >= CHK_MIN_MOTIVO && motivo.length <= CHK_MAX_MOTIVO && !chkTemMarca(motivo)) break;", "    break;"],
  ["liderança: o motivo mínimo é 1", P, "const CHK_MIN_MOTIVO = 8, CHK_MAX_MOTIVO = 300;", "const CHK_MIN_MOTIVO = 1, CHK_MAX_MOTIVO = 300;"],
  ["liderança: o motivo máximo é 3000", P, "const CHK_MIN_MOTIVO = 8, CHK_MAX_MOTIVO = 300;", "const CHK_MIN_MOTIVO = 8, CHK_MAX_MOTIVO = 3000;"],
  ["liderança: o motivo com < ou > é aceito", P, "motivo.length >= CHK_MIN_MOTIVO && motivo.length <= CHK_MAX_MOTIVO && !chkTemMarca(motivo)) break;", "motivo.length >= CHK_MIN_MOTIVO && motivo.length <= CHK_MAX_MOTIVO) break;"],
  ["liderança: o motivo digitado não volta ao campo", P, "\"Ex.: liguei para a mãe, que confirmou que a tia busca.\", motivo);", "\"Ex.: liguei para a mãe, que confirmou que a tia busca.\", \"\");"],
  ["liderança: a decisão vai com o sinal como texto", P, "chkPostar(\"decidir-divergencia\", { registroId: id, aprovar, motivo })", "chkPostar(\"decidir-divergencia\", { registroId: id, aprovar: String(aprovar), motivo })"],
  ["liderança: a decisão vai sem o motivo", P, "chkPostar(\"decidir-divergencia\", { registroId: id, aprovar, motivo })", "chkPostar(\"decidir-divergencia\", { registroId: id, aprovar })"],
  ["liderança: decidir não confere se a tela ainda é a mesma", P, "  if (geracao !== chkGeracao || seqSala !== chkSeqSala) return;\n  await chkProtegerBotao(botao, async () => {\n    const data = await chkPostar(\"decidir-divergencia\"", "  await chkProtegerBotao(botao, async () => {\n    const data = await chkPostar(\"decidir-divergencia\""],
  ["liderança: a mensagem da decisão da fila vai para a sala", P, "function chkIdMensagemAtual() { return chkSala ? \"chkSalaMsg\" : \"chkAprMsg\"; }", "function chkIdMensagemAtual() { return \"chkSalaMsg\"; }"],
  ["liderança: depois de decidir pela fila lê a sala", P, "function chkAtualizarDepoisDoAto() { return chkSala ? chkLerSala(true) : chkCarregarAprovacoes(false); }", "function chkAtualizarDepoisDoAto() { return chkLerSala(true); }"],
  ["liderança: decidir sem a proteção de duplo clique", P, "  }, `decidir${id}`);", "  }, undefined);"],
  ["liderança: destravar sem a confirmação", P, "if (!(await chkPerguntar(`Destravar ${c.nome}?", "if (false && !(await chkPerguntar(`Destravar ${c.nome}?"],
  ["liderança: destravar sem a proteção de duplo clique", P, "  }, `destravar${id}`);", "  }, undefined);"],
  ["liderança: destravar vai sem o id numérico", P, "chkPostar(\"destravar\", { registroId: id })", "chkPostar(\"destravar\", { registroId: String(id) })"],
  ["liderança: o relatório vale para quem não é da liderança", P, "  if (!chkSala || !chkSala.ehGestao) return;\n  const geracao = chkGeracao, seqSala = chkSeqSala, seq = ++chkSeqRel", "  if (!chkSala) return;\n  const geracao = chkGeracao, seqSala = chkSeqSala, seq = ++chkSeqRel"],
  ["liderança: os cabeçalhos da tabela não têm scope", P, "th.setAttribute(\"scope\", \"col\");", ""],
  ["liderança: fechar o relatório não apaga as tabelas", P, "  const cx = chkEl(\"chkRelatorioCx\"); if (cx) cx.innerHTML = \"\";\n  chkLimparImpressaoDaPagina();", "  chkLimparImpressaoDaPagina();"],
  ["liderança: fechar o relatório não devolve o foco", P, "  chkFocarId(\"chkRelatorioBotao\");", ""],
  ["liderança: o relatório sem a proteção de duplo clique", P, "  }, \"relatorio\");", "  }, undefined);"],
  ["liderança: as aprovações incluem salas que não são da gestão", P, ".filter(s => s && typeof s === \"object\" && s.ehGestao && chkInteiro(s.servicoId)", ".filter(s => s && typeof s === \"object\" && chkInteiro(s.servicoId)"],
  ["liderança: as aprovações incluem toda criança (não só pedido e travada)", P, "&& (c.divergencia || c.travado)))", "))"],
  ["liderança: as aprovações não ligam o relógio", P, "  chkRenderAprovacoes(cortada);\n  chkIniciarTimer();\n}", "  chkRenderAprovacoes(cortada);\n}"],
  ["liderança: as aprovações não contam falhas", P, "function chkFalhaDasAprovacoes(resposta, catalogo, silencioso) {\n  if (resposta && resposta.sessaoExpirada) return;\n  chkFalhas++;", "function chkFalhaDasAprovacoes(resposta, catalogo, silencioso) {\n  if (resposta && resposta.sessaoExpirada) return;"],
  ["liderança: três falhas nas aprovações não param o relógio", P, "  if (parou) chkPararTimer();\n}\n\n// Código de retirada na tela", "}\n\n// Código de retirada na tela"],
  ["liderança: a fila de aprovações vale para quem não é da liderança", P, "async function chkCarregarAprovacoes(silencioso, forcar) {\n  chkVerificarDono();\n  if (!chkPodeAba() || chkSala) return;", "async function chkCarregarAprovacoes(silencioso, forcar) {\n  chkVerificarDono();\n  if (chkSala) return;"],
  ["liderança: as salas da liderança valem para quem não tem a permissão", P, "async function chkCarregarSalasGesAcao() {\n  chkVerificarDono();\n  if (!chkPodeAba()) return;", "async function chkCarregarSalasGesAcao() {\n  chkVerificarDono();"],
  ["liderança: a aba abre sem a permissão", P, "async function chkCarregarOpcoesAcao() {\n  chkVerificarDono();\n  if (!chkPodeAba()) return;", "async function chkCarregarOpcoesAcao() {\n  chkVerificarDono();"],
  ["liderança: as fichas valem para quem não tem a permissão", P, "async function chkFichaBuscarAcao(botao) {\n  chkVerificarDono();\n  if (!chkPodeAba()) return;", "async function chkFichaBuscarAcao(botao) {\n  chkVerificarDono();"],
  ["liderança: a matrícula da ficha aceita texto", P, "function chkInteiro(texto) { const t = String(texto == null ? \"\" : texto).trim(); return /^\\d{1,10}$/.test(t) && Number(t) >= 1 ? Number(t) : 0; }", "function chkInteiro(texto) { const t = String(texto == null ? \"\" : texto).trim(); return /\\d{1,10}/.test(t) && Number(t) >= 1 ? Number(t) : 0; }"],
  ["liderança: a matrícula zero vale", P, "return /^\\d{1,10}$/.test(t) && Number(t) >= 1 ? Number(t) : 0; }", "return /^\\d{1,10}$/.test(t) ? Number(t) : 0; }"],
  ["liderança: a ficha vai sem a marca de ficha", P, "  if (ficha) { corpo.ficha = true; corpo.referencia = referencia; }\n  const geracao = chkGeracao;\n  await chkProtegerBotao(botao, async () => {\n    const data = await chkPostar(\"saude-gravar\"", "  const geracao = chkGeracao;\n  await chkProtegerBotao(botao, async () => {\n    const data = await chkPostar(\"saude-gravar\""],
  ["liderança: o autorizado da ficha vai sem a referência", P, "  if (ficha) { corpo.ficha = true; corpo.referencia = referencia; }\n  const geracao = chkGeracao;\n  await chkProtegerBotao(botao, async () => {\n    const data = await chkPostar(\"autorizado-adicionar\"", "  if (ficha) { corpo.ficha = true; }\n  const geracao = chkGeracao;\n  await chkProtegerBotao(botao, async () => {\n    const data = await chkPostar(\"autorizado-adicionar\""],
  ["liderança: o responsável também manda a marca de ficha", P, "  const corpo = { menorId: id, nome, parentesco };", "  const corpo = { menorId: id, nome, parentesco, ficha: true, referencia: \"x\" };"],
  ["liderança: a ficha não leva o foco ao título", P, "    chkFocarId(\"chkFiTitulo\");\n  }, \"ficha\");", "  }, \"ficha\");"],

  // ---- Meus filhos e Meu Painel
  ["meus filhos: o recolhido volta a mostrar o conteúdo que chega atrasado (histórico)", P, "if (geracao !== chkGeracao || !cx || !btn || btn.getAttribute(\"aria-expanded\") !== \"true\") return;", "if (geracao !== chkGeracao || !cx || !btn) return;"],
  ["meus filhos: o recolhido volta a mostrar o conteúdo que chega atrasado (autorizados e saúde)", P, [
    ["  if (geracao !== chkGeracao || !chkSecaoFilhoAberta(pfx, \"Aut\", id)) return;", "  if (geracao !== chkGeracao) return;"],
    ["  if (geracao !== chkGeracao || !cx || !chkSecaoFilhoAberta(pfx, \"Sau\", id)) return;", "  if (geracao !== chkGeracao || !cx) return;"]
  ]],
  ["meus filhos: recolher não apaga o conteúdo", P, "    cx.innerHTML = \"\";\n    btn.setAttribute(\"aria-expanded\", \"false\");\n    return;", "    btn.setAttribute(\"aria-expanded\", \"false\");\n    return;"],
  ["meus filhos: o botão não diz que está expandido", P, "  btn.setAttribute(\"aria-expanded\", \"true\");\n  cx.innerHTML = \"<p class='subtitle' role='status'>Carregando…</p>\";", "  cx.innerHTML = \"<p class='subtitle' role='status'>Carregando…</p>\";"],
  ["meus filhos: o botão nasce já expandido", P, "id=\"chkFhBtn${secao}${id}\" aria-expanded=\"false\"", "id=\"chkFhBtn${secao}${id}\" aria-expanded=\"true\""],
  ["meus filhos: a seção de qualquer nome é aceita", P, "function chkSecaoFilhoValida(bruto) { return CHK_SECOES_FILHO.includes(bruto) ? bruto : \"\"; }", "function chkSecaoFilhoValida(bruto) { return bruto; }"],
  ["meus filhos: o responsável manda a referência da ficha", P, "chkPostar(\"autorizado-adicionar\", corpo)", "chkPostar(\"autorizado-adicionar\", Object.assign({ ficha: true, referencia: \"manual\" }, corpo))"],
  ["meus filhos: revogar sem a confirmação", P, "if (!(await chkPerguntar(\"Revogar esta autorização?", "if (false && !(await chkPerguntar(\"Revogar esta autorização?"],
  ["meus filhos: revogar vai com o id como texto", P, "chkPostar(\"autorizado-revogar\", { autorizadoId: Number(autorizadoId) })", "chkPostar(\"autorizado-revogar\", { autorizadoId: String(autorizadoId) })"],
  ["meus filhos: revogar não leva o foco ao título da lista", P, "    chkFocarId(`chk${pfx}AutTitulo${id}`);   // o botão Revogar saiu da tela", "    // (sem foco)   // o botão Revogar saiu da tela"],
  ["meus filhos: autorizar não leva o foco ao título da lista", P, "    chkFocarId(`chk${pfx}AutTitulo${id}`);                // e o botão", "    // (sem foco)                // e o botão"],
  ["meus filhos: guardar a saúde não leva o foco ao campo", P, "    chkFocarId(`chk${pfx}SauTexto${id}`);   // a seção foi refeita e o botão tocado", "    // (sem foco)   // a seção foi refeita e o botão tocado"],
  ["meus filhos: apagar a saúde sem a confirmação", P, "if (!(await chkPerguntar(\"Apagar a informação de saúde desta criança?", "if (false && !(await chkPerguntar(\"Apagar a informação de saúde desta criança?"],
  ["meus filhos: o texto da saúde entra como marcação", P, "campo.value = String(data.saude.texto == null ? \"\" : data.saude.texto);", "campo.value = String(data.saude.texto == null ? \"\" : data.saude.texto); campo.innerHTML = String(data.saude.texto == null ? \"\" : data.saude.texto);"],
  ["meus filhos: o nome do filho entra como marcação", P, "const n = chkEl(`chkFhNome${Number(f.menorId)}`); if (n) n.textContent = String(f.nome == null ? \"\" : f.nome);", "const n = chkEl(`chkFhNome${Number(f.menorId)}`); if (n) n.innerHTML = String(f.nome == null ? \"\" : f.nome);"],
  ["meus filhos: o limite de autorizados é ignorado", P, "${lista.length >= limite ? `<p class=\"psc-aviso\" role=\"status\">A lista está cheia", "${false ? `<p class=\"psc-aviso\" role=\"status\">A lista está cheia"],
  ["meu painel: sem sessão pede o servidor mesmo assim", P, "    chkLimparTela();\n    chkEscrever(\"chkMeuMsg\", \"Entre com a sua matrícula e o seu PIN (ou senha) para ver o check-in infantil.\", true);\n    return;", "    chkLimparTela();\n    chkEscrever(\"chkMeuMsg\", \"Entre com a sua matrícula e o seu PIN (ou senha) para ver o check-in infantil.\", true);"],
  ["meu painel: tocar de novo na aba com a sala aberta recarrega as listas", P, "  if (chkSala && chkSala.ctx === \"Meu\") { chkLerSala(true); return; }\n  const geracao = chkGeracao, seq = ++chkSeqMeu;", "  const geracao = chkGeracao, seq = ++chkSeqMeu;"],
  ["meu painel: a resposta do catálogo do login anterior vale", P, "  if (geracao !== chkGeracao) return chkCatalogos;   // a pessoa trocou de login enquanto o catálogo vinha: o dela é outro", "  // (sem conferir o login)"],
  ["meu painel: aparecem as salas de quem não é da equipe", P, "(ctx === \"Ges\" ? s.ehGestao : s.ehMinha)", "true"],
  ["meu painel: aparecem filhos que não são do responsável (id inválido)", P, "const filhos = resposta.filhos.filter(f => f && typeof f === \"object\" && chkInteiro(f.menorId));", "const filhos = resposta.filhos.filter(f => f && typeof f === \"object\");"],
  ["meu painel: a falha das salas vira 'nenhuma sala'", P, "  if (resposta.sucesso === false || !Array.isArray(resposta.salas)) {\n    if (ctx === \"Ges\") chkSalasGes = []; else chkSalasMeu = [];\n    lista.innerHTML = `<p class=\"subtitle psc-aviso\" role=\"status\">${escaparHtmlEbd(chkMsgErro(resposta))}</p>`;\n    return;\n  }", "  if (!Array.isArray(resposta.salas)) resposta.salas = [];"],

  // ---- como a resposta do servidor é lida
  ["servidor: erro HTTP sem 'sucesso' é tratado como sucesso", P, "    if (res.status >= 400) corpo.sucesso = false;\n", ""],
  ["servidor: o 428 não troca a mensagem", P, "    if (res.status === 428 || corpo.precisaFator) corpo.mensagem = CHK_MSG_FATOR;\n", ""],
  ["servidor: o 403 e o 5xx avisam duas vezes", P, "    if (res.status === 403 || res.status >= 500) corpo.jaAvisado = true;\n", ""],
  ["servidor: a sessão que acabou vira falha de rede", P, "    if (e && e.message === \"Sessão expirada\") return { sucesso: false, jaAvisado: true, sessaoExpirada: true, mensagem: \"Sua sessão expirou. Entre novamente.\" };\n", ""],
  ["servidor: a falha de rede avisa duas vezes", P, "    return { sucesso: false, jaAvisado: true, falhaDeRede: true,", "    return { sucesso: false, falhaDeRede: true,"],
  ["servidor: a resposta que não é objeto é aceita", P, "    if (!corpo || typeof corpo !== \"object\" || Array.isArray(corpo)) return { sucesso: false, mensagem: CHK_MSG_RESPOSTA_ESTRANHA, httpStatus: res.status, semJson: true };\n", ""],
  ["servidor: o resultado sempre faz toast (aviso duplicado)", P, "  if (!(data && data.jaAvisado)) mostrarToast(texto, alerta ? \"erro\" : \"sucesso\");", "  mostrarToast(texto, alerta ? \"erro\" : \"sucesso\");"],
  ["servidor: o resultado nunca faz toast", P, "  if (!(data && data.jaAvisado)) mostrarToast(texto, alerta ? \"erro\" : \"sucesso\");", ""],
  ["servidor: o resultado de erro vai como sucesso", P, "  if (!(data && data.jaAvisado)) mostrarToast(texto, alerta ? \"erro\" : \"sucesso\");", "  if (!(data && data.jaAvisado)) mostrarToast(texto, \"sucesso\");"],
  ["servidor: a mensagem de erro some na tela quando já foi avisada", P, "  chkEscrever(idMensagem, texto, destaque || alerta);", "  if (!(data && data.jaAvisado)) chkEscrever(idMensagem, texto, destaque || alerta);"],
  ["servidor: o erro na tela não fica em destaque", P, "  chkEscrever(idMensagem, texto, destaque || alerta);", "  chkEscrever(idMensagem, texto, destaque);"],
  ["servidor: GET vai como POST (método trocado)", P, "headers: { \"Content-Type\": \"application/json\" }, body: JSON.stringify(corpo)", "headers: { \"Content-Type\": \"application/json\" }, body: JSON.stringify(corpo), method: \"PUT\""],
  ["servidor: o corpo vai sem o tipo de conteúdo", P, "{ method: \"POST\", headers: { \"Content-Type\": \"application/json\" }, body: JSON.stringify(corpo) }", "{ method: \"POST\", headers: {}, body: JSON.stringify(corpo) }"],
  ["servidor: a mensagem padrão do erro some", P, "function chkMsgErro(data) { return (data && data.mensagem) || \"Não foi possível concluir a operação agora.\"; }", "function chkMsgErro(data) { return data.mensagem; }"],
  ["servidor: o botão que grava não fica desabilitado enquanto espera", P, "  if (botao) botao.disabled = true;\n  try { return await tarefa(); } finally {", "  try { return await tarefa(); } finally {"],
  ["servidor: o botão não volta a ser habilitado", P, "    if (botao) botao.disabled = false;\n    if (chave) chkEmCurso.delete(chave);", "    if (chave) chkEmCurso.delete(chave);"],
  ["servidor: a trava de duplo clique não é solta", P, "    if (botao) botao.disabled = false;\n    if (chave) chkEmCurso.delete(chave);", "    if (botao) botao.disabled = false;"],
  ["servidor: o aviso de duplo clique some", P, "    if (chkEmCurso.has(chave)) { mostrarToast(\"Aguarde: o pedido anterior ainda está sendo processado.\", \"erro\"); return undefined; }", "    if (chkEmCurso.has(chave)) { return undefined; }"],
  ["servidor: o id da autorização aceita lixo", P, "  if (!chkInteiro(autorizadoId)) return;\n", ""],

  // ---- as ligações com o resto do app (script.js, meus-dados.js, index.html, service worker)
  ["ligação: sair da sessão não avisa o módulo", S, "  if (typeof chkLimparTela === \"function\") chkLimparTela();\n", ""],
  ["ligação: sair da sessão quebra sem o módulo (sem a guarda)", S, "  if (typeof chkLimparTela === \"function\") chkLimparTela();\n", "  chkLimparTela();\n"],
  ["ligação: trocar de sub-aba não avisa o módulo", S, "  if (typeof chkSubAbaMudou === \"function\") chkSubAbaMudou(sub);", ""],
  ["ligação: trocar de sub-aba quebra sem o módulo (sem a guarda)", S, "  if (typeof chkSubAbaMudou === \"function\") chkSubAbaMudou(sub);", "  chkSubAbaMudou(sub);"],
  ["ligação: abrir a sub-aba não carrega o check-in", S, "  if (sub === \"checkininfantil\" && typeof chkCarregarMeuPainelAcao === \"function\") chkCarregarMeuPainelAcao();\n", ""],
  ["ligação: abrir a sub-aba quebra sem o módulo (sem a guarda)", S, "  if (sub === \"checkininfantil\" && typeof chkCarregarMeuPainelAcao === \"function\") chkCarregarMeuPainelAcao();", "  if (sub === \"checkininfantil\") chkCarregarMeuPainelAcao();"],
  ["ligação: trocar de aba não avisa o módulo", D, "  if (typeof chkAbaMudou === \"function\") chkAbaMudou(aba);", ""],
  ["ligação: trocar de aba quebra sem o módulo (sem a guarda)", D, "  if (typeof chkAbaMudou === \"function\") chkAbaMudou(aba);", "  chkAbaMudou(aba);"],
  ["ligação: abrir a aba não carrega o check-in", D, "  if (aba === \"checkininfantil\" && typeof chkCarregarOpcoesAcao === \"function\") chkCarregarOpcoesAcao();\n", ""],
  ["ligação: abrir a aba quebra sem o módulo (sem a guarda)", D, "  if (aba === \"checkininfantil\" && typeof chkCarregarOpcoesAcao === \"function\") chkCarregarOpcoesAcao();", "  if (aba === \"checkininfantil\") chkCarregarOpcoesAcao();"],
  ["ligação: a aba não está na lista de abas", S, "\"protecao\", \"checkininfantil\", \"assistenciasocial\"", "\"protecao\", \"assistenciasocial\""],
  ["ligação: a aba não pede a permissão da habilitação", S, "  checkininfantil: [\"habilitacao_voluntarios\"],", ""],
  ["ligação: a aba pede outra permissão", S, "  checkininfantil: [\"habilitacao_voluntarios\"],", "  checkininfantil: [\"escalas\"],"],
  ["ligação: a aba fica fora do módulo de Habilitação", S, "abas: [\"habilitacao\", \"menores\", \"protecao\", \"checkininfantil\"]", "abas: [\"habilitacao\", \"menores\", \"protecao\"]"],
  ["ligação: a sub-aba não está na lista de sub-abas", S, "\"menores\", \"protecao\", \"checkininfantil\", \"minhasconquistas\"", "\"menores\", \"protecao\", \"minhasconquistas\""],
  ["ligação: a sub-aba não tem título", S, "protecao: \"Proteção de crianças\", checkininfantil: \"Check-in infantil\", minhasconquistas", "protecao: \"Proteção de crianças\", minhasconquistas"],
  ["ligação: a sub-aba não tem ajuda", S, "  \"meupainel:checkininfantil\": \"Check-in infantil: as salas de hoje em que você serve", "  \"meupainel:checkininfantil_X\": \"Check-in infantil: as salas de hoje em que você serve"],
  ["ligação: a aba não tem ajuda", S, "  checkininfantil: \"Check-in infantil (ECA arts. 70, 70-A e 70-B;", "  checkininfantil_X: \"Check-in infantil (ECA arts. 70, 70-A e 70-B;"],
  ["ligação: o título da aba some", D, "protecao: \"Proteção de Crianças\", checkininfantil: \"Check-in Infantil\",", "protecao: \"Proteção de Crianças\","],
  ["ligação: o módulo não entra no HTML", H, "  <script src=\"modulos/checkin-infantil.js\"></script>\n", ""],
  ["ligação: a casca offline esquece o módulo", W, "\"/modulos/checkin-infantil.js\", ", ""],
  ["ligação: a casca offline não troca de versão", W, "ieadespa-app-shell-v34", "ieadespa-app-shell-v33"],
  ["a11y: a mensagem de Meu Painel perde o aria-live", H, "<p id=\"chkMeuMsg\" class=\"subtitle\" role=\"status\" aria-live=\"polite\"></p>", "<p id=\"chkMeuMsg\" class=\"subtitle\" role=\"status\"></p>"],
  ["a11y: a mensagem da liderança perde o aria-live", H, "<p id=\"chkGesMsg\" class=\"subtitle\" role=\"status\" aria-live=\"polite\"></p>", "<p id=\"chkGesMsg\" class=\"subtitle\" role=\"status\"></p>"],
  ["a11y: a mensagem das aprovações perde o aria-live", H, "<p id=\"chkAprMsg\" class=\"subtitle\" role=\"status\" aria-live=\"polite\"></p>", "<p id=\"chkAprMsg\" class=\"subtitle\" role=\"status\"></p>"],
  ["a11y: a mensagem das fichas perde o aria-live", H, "<p id=\"chkFichaMsg\" class=\"subtitle\" role=\"status\" aria-live=\"polite\"></p>", "<p id=\"chkFichaMsg\" class=\"subtitle\" role=\"status\"></p>"],
  ["a11y: a pílula não diz que está marcada", H, "<button type=\"button\" class=\"cal-pilula ativo\" id=\"btnChkSecaoSalas\" aria-pressed=\"true\"", "<button type=\"button\" class=\"cal-pilula ativo\" id=\"btnChkSecaoSalas\""],
  ["a11y: a matrícula da ficha vai para o preenchimento automático", H, "<input type=\"number\" id=\"chkFiMatricula\" min=\"1\" autocomplete=\"off\" />", "<input type=\"number\" id=\"chkFiMatricula\" min=\"1\" />"],
  ["a11y: a matrícula da ficha perde o rótulo", H, "<label for=\"chkFiMatricula\">Matrícula da criança</label>", ""],
  ["a11y: o botão de Meu Painel vai a outra sub-aba", H, "id=\"btnSubMeupainelCheckininfantil\" data-on-click=\"mostrarSubAbaMeupainel\" data-args-click='[\"checkininfantil\"]'", "id=\"btnSubMeupainelCheckininfantil\" data-on-click=\"mostrarSubAbaMeupainel\" data-args-click='[\"protecao\"]'"],
  ["a11y: o botão da aba vai a outra aba", H, "id=\"btnAbaCheckininfantil\" data-on-click=\"mostrarAbaSecretaria\" data-args-click='[\"checkininfantil\"]'", "id=\"btnAbaCheckininfantil\" data-on-click=\"mostrarAbaSecretaria\" data-args-click='[\"protecao\"]'"],
  ["a11y: a aba aparece fora do módulo de Habilitação (botão sai do grupo)", H, "            <button class=\"btn-aba\" id=\"btnAbaCheckininfantil\"", "          </div>\n          <div id=\"fora\"><button class=\"btn-aba\" id=\"btnAbaCheckininfantil\""],

  // ---- o CSS (conferido por texto no roteiro; o efeito de verdade, no navegador)
  ["css: o código sai numa impressão comum (Ctrl+P)", C, "  body:not(.chk-imp-etiquetas) #chkImpressaoCx { display: none !important; }\n", ""],
  ["css: o aviso de idade fora da faixa sai na impressão", C, "  .chk-so-tela { display: none !important; }\n", ""],
  ["css: a impressão não isola as etiquetas (visibility)", C, "  body.chk-imprimindo * { visibility: hidden !important; }\n", ""],
  ["css: o recibo não começa numa folha à parte", C, "body.chk-imprimindo .chk-recibo { border: 1px solid #000; break-before: page; page-break-before: always; }", "body.chk-imprimindo .chk-recibo { border: 1px solid #000; }"],
  ["css: a etiqueta parte no meio da folha", C, "body.chk-imprimindo .chk-etiqueta { border: 1px solid #000; break-inside: avoid; page-break-inside: avoid; }", "body.chk-imprimindo .chk-etiqueta { border: 1px solid #000; }"],
  ["css: a alergia sai sem o quadro grosso (preto e branco)", C, "body.chk-imprimindo .chk-alergia { background: #fff; color: #000; border: 3px solid #000; }", "body.chk-imprimindo .chk-alergia { background: #fff; color: #000; }"],
  ["css: a aba e a sub-aba nascem à vista", C, "#abaCheckininfantil, #subMeupainelCheckininfantil, #chkSecaoAprovacoes, #chkSecaoFichas { display: none; }\n", ""],
  ["css: o botão fica abaixo de 40 px de altura", C, ".chk-btn { width: auto; margin: 0; min-height: 48px; }", ".chk-btn { width: auto; margin: 0; min-height: 30px; }"],
  ["css: a tabela do relatório estoura a tela (sem rolagem própria)", C, ".chk-rolagem { overflow-x: auto; max-width: 100%; -webkit-overflow-scrolling: touch; }", ".chk-rolagem { max-width: 100%; }"],
  ["css: o código da etiqueta é pequeno", C, ".chk-codigo { font-family: ui-monospace, Consolas, \"Courier New\", monospace; font-size: 2.2rem;", ".chk-codigo { font-family: ui-monospace, Consolas, \"Courier New\", monospace; font-size: 0.9rem;"],
  ["css: as legendas e subtítulos voltam ao cinza do sistema (abaixo de 4,5:1 sobre os cartões)", C, "#subMeupainelCheckininfantil .psc-legenda, #abaCheckininfantil .psc-legenda, #subMeupainelCheckininfantil .subtitle:not(.psc-aviso), #abaCheckininfantil .subtitle:not(.psc-aviso) { color: #4B5563; }\n", ""],
  ["css: a regra do cinza escuro apaga a cor dos avisos (sem :not(.psc-aviso))", C, "#subMeupainelCheckininfantil .subtitle:not(.psc-aviso), #abaCheckininfantil .subtitle:not(.psc-aviso) { color: #4B5563; }", "#subMeupainelCheckininfantil .subtitle, #abaCheckininfantil .subtitle { color: #4B5563; }"],
  ["css: a etiqueta perde a largura de 7 cm", C, ".chk-etiqueta { width: 7cm;", ".chk-etiqueta { width: 20cm;"],
  ["css: no celular os botões não ocupam a linha", C, "  .chk-acoes .chk-btn, .chk-barra .chk-btn { flex: 1 1 100%; }\n", ""],
  ["css: sem o ramo com :has() a página inteira ocupa folha", C, "@supports selector(:has(*)) {\n  @media print {\n    body.chk-imp-etiquetas", "@supports selector(:not(*)) {\n  @media print {\n    body.chk-imp-etiquetas"],
  ["css: a alergia não destaca na tela", C, ".chk-alergia { font-weight: 800; font-size: 1.05rem; color: #fff; background: var(--cor-erro);", ".chk-alergia { font-weight: 400; font-size: 1.05rem; color: #fff; background: var(--cor-erro);"],
  // ============================================================================================================================================
  // ---- a correção da revisão adversarial (F1 a F22 e as mudanças do servidor): cada garantia nova perde a sua peça, uma a uma
  // ============================================================================================================================================
  // F1 — o texto da autorização de saúde
  ["F1: o texto da saúde que mudou não é redesenhado", P, "          chkRedesenharTermo();   // o texto na tela passa a ser o novo (e a caixa \"concordo\" nasce desmarcada)\n", ""],
  ["F1: o texto redesenhado não se esconde com o campo de saúde vazio", P, "  raiz.innerHTML = chkHtmlTermo(chkCatalogos ? chkCatalogos.textoSaude : null);   // a caixa \"concordo\" nova nasce desmarcada\n  chkVisSaudeDigitouAcao();\n", "  raiz.innerHTML = chkHtmlTermo(chkCatalogos ? chkCatalogos.textoSaude : null);   // a caixa \"concordo\" nova nasce desmarcada\n"],
  ["F1: a caixa 'concordo' do texto nasce marcada", P, "<input type=\"checkbox\" id=\"chkCiVisConcordo\" />", "<input type=\"checkbox\" id=\"chkCiVisConcordo\" checked />"],
  ["F1: a mensagem diz que o texto novo carregou mesmo sem carregar", P, "          chkReabrirVisitantesComSaude(hashNovo !== hashAntigo);", "          chkReabrirVisitantesComSaude(true);"],
  ["F1: a mensagem nunca diz que o texto novo carregou", P, "          chkReabrirVisitantesComSaude(hashNovo !== hashAntigo);", "          chkReabrirVisitantesComSaude(false);"],
  ["F1: o hash do texto antigo não é guardado antes de recarregar", P, "        const hashAntigo = chkCatalogos && chkCatalogos.textoSaude ? chkCatalogos.textoSaude.hash : \"\";", "        const hashAntigo = \"\";"],
  ["F1: o texto da saúde sai sem a pergunta ao responsável (sem o título do grupo)", P, "<h6 id=\"chkCiVisTermoTitulo\" class=\"chk-subtitulo\">${escaparHtmlEbd(t.titulo)}</h6>", ""],
  ["F1: o espaço do texto da saúde não existe no formulário", P, "            <div id=\"chkCiVisTermoRaiz\">${chkHtmlTermo(cat.textoSaude)}</div>\n", "            ${chkHtmlTermo(cat.textoSaude)}\n"],

  // F2 — a resposta do check-in que se perde
  ["F2: voltar às salas sai com a entrada a caminho", P, "  if (chkEmCurso.has(\"checkin\")) { mostrarToast(CHK_MSG_AGUARDE_ENTRADA, \"erro\"); return; }\n", ""],
  ["F2: o aviso de entrada a caminho não aparece", P, "{ mostrarToast(CHK_MSG_AGUARDE_ENTRADA, \"erro\"); return; }", "{ return; }"],
  ["F2: a entrada gravada com a sala já trocada não avisa", P, "    if (gravou && geracao === chkGeracao && (seqSala !== chkSeqSala || !chkSala)) { mostrarToast(CHK_MSG_ENTRADA_PERDIDA, \"erro\"); return; }\n", ""],
  ["F2: o aviso da entrada perdida vale também para outro login", P, "    if (gravou && geracao === chkGeracao && (seqSala !== chkSeqSala || !chkSala))", "    if (gravou && (seqSala !== chkSeqSala || !chkSala))"],
  ["F2: o aviso da entrada perdida sai mesmo com a sala certa", P, "    if (gravou && geracao === chkGeracao && (seqSala !== chkSeqSala || !chkSala))", "    if (gravou && geracao === chkGeracao)"],
  ["F2: o aviso da entrada perdida nasce como sucesso", P, "mostrarToast(CHK_MSG_ENTRADA_PERDIDA, \"erro\")", "mostrarToast(CHK_MSG_ENTRADA_PERDIDA, \"sucesso\")"],
  ["F2: a conexão que cai não é tratada à parte", P, "      if (data.falhaDeRede || data.semJson) { chkEscrever(msg, CHK_MSG_CONEXAO_CAIU, true); chkLerSala(true); return; }\n", ""],
  ["F2: só a resposta que não é JSON é tratada à parte (a rede que cai não)", P, "      if (data.falhaDeRede || data.semJson) {", "      if (data.semJson) {"],
  ["F2: só a rede que cai é tratada à parte (a resposta que não é JSON não)", P, "      if (data.falhaDeRede || data.semJson) {", "      if (data.falhaDeRede) {"],
  ["F2: a conexão que cai não lê a sala", P, "chkEscrever(msg, CHK_MSG_CONEXAO_CAIU, true); chkLerSala(true); return; }", "chkEscrever(msg, CHK_MSG_CONEXAO_CAIU, true); return; }"],
  ["F2: a conexão que cai mostra a mensagem antiga da rede", P, "chkEscrever(msg, CHK_MSG_CONEXAO_CAIU, true); chkLerSala(true); return; }", "chkMostrarResultado(data, msg, true); chkLerSala(true); return; }"],
  ["F2: a conexão que cai não destaca a mensagem", P, "chkEscrever(msg, CHK_MSG_CONEXAO_CAIU, true);", "chkEscrever(msg, CHK_MSG_CONEXAO_CAIU, false);"],
  ["servidor: a resposta que não é JSON não é marcada", P, "    if (semJson) corpo.semJson = true;\n", ""],
  ["servidor: a cópia da resposta nunca acusa corpo que não é JSON", P, "if (original) { try { await original.json(); } catch { semJson = true; } }", "if (original) { try { await original.json(); } catch { /* */ } }"],
  ["servidor: a resposta que não é objeto não leva a marca de sem JSON", P, "httpStatus: res.status, semJson: true };", "httpStatus: res.status };"],
  ["servidor: a cópia da resposta recusada não é tirada", P, "    if (res.status >= 400) { try { original = res.clone(); } catch { original = null; } }\n", ""],
  ["servidor: a cópia da resposta só vale de 500 para cima", P, "    if (res.status >= 400) { try { original = res.clone();", "    if (res.status >= 500) { try { original = res.clone();"],

  // F4 — 404 passageiro, aviso de código que saiu, fechar a página
  ["leitura: só 403 tira a pessoa da sala (404/422 nunca)", P, "if (data.httpStatus === 403 || ((data.httpStatus === 404 || data.httpStatus === 422) && respostaDoServidor)) {", "if (data.httpStatus === 403) {"],
  ["leitura: 404/422 sem JSON tiram a pessoa da sala", P, "((data.httpStatus === 404 || data.httpStatus === 422) && respostaDoServidor)", "(data.httpStatus === 404 || data.httpStatus === 422)"],
  ["leitura: 404/422 em JSON sem mensagem tiram a pessoa da sala", P, "const respostaDoServidor = !data.semJson && typeof data.mensagem === \"string\" && data.mensagem !== \"\";", "const respostaDoServidor = !data.semJson;"],
  ["leitura: a mensagem sem JSON vale como resposta do servidor", P, "const respostaDoServidor = !data.semJson && typeof data.mensagem === \"string\" && data.mensagem !== \"\";", "const respostaDoServidor = typeof data.mensagem === \"string\" && data.mensagem !== \"\";"],
  ["leitura: 403 sem JSON não tira a pessoa da sala", P, "if (data.httpStatus === 403 || ((data.httpStatus === 404", "if ((data.httpStatus === 403 && !data.semJson) || ((data.httpStatus === 404"],
  ["F4: sair com código não impresso não avisa", P, "  if (perdeuCodigo) mostrarToast(CHK_MSG_CODIGO_SAIU, \"erro\");\n", ""],
  ["F4: o aviso de código que saiu nasce como sucesso", P, "mostrarToast(CHK_MSG_CODIGO_SAIU, \"erro\")", "mostrarToast(CHK_MSG_CODIGO_SAIU, \"sucesso\")"],
  ["F4: o aviso de código que saiu vale também para quem já perguntou", P, "  const perdeuCodigo = avisar && chkHaCodigoNaoImpresso();", "  const perdeuCodigo = chkHaCodigoNaoImpresso();"],
  ["F4: o aviso de código que saiu vale mesmo com tudo impresso", P, "  const perdeuCodigo = avisar && chkHaCodigoNaoImpresso();", "  const perdeuCodigo = avisar && !!chkImpressao;"],
  ["F4: o aviso de código que saiu vale mesmo sem código", P, "  const perdeuCodigo = avisar && chkHaCodigoNaoImpresso();", "  const perdeuCodigo = avisar;"],
  ["F4: voltar às salas avisa de novo depois de perguntar", P, "  chkFecharSalaInterno(false);   // já perguntou: não avisa de novo", "  chkFecharSalaInterno();   // já perguntou: não avisa de novo"],
  ["F4: 'há código não impresso' só olha se TODOS os lotes estão pendentes", P, "function chkHaCodigoNaoImpresso() { return !!chkImpressao && chkImpressao.lotes.some(l => !l.impresso); }", "function chkHaCodigoNaoImpresso() { return !!chkImpressao && chkImpressao.lotes.every(l => !l.impresso); }"],
  ["F4: o aviso de fechar a página não é registrado", P, "if (typeof window.addEventListener === \"function\") window.addEventListener(\"beforeunload\", chkAntesDeSair);\n", ""],
  ["F4: o aviso de fechar a página quebra sem addEventListener (sem a guarda)", P, "if (typeof window.addEventListener === \"function\") window.addEventListener(", "if (true) window.addEventListener("],
  ["F4: o aviso de fechar a página é registrado duas vezes", P, "window.addEventListener(\"beforeunload\", chkAntesDeSair);\n", "window.addEventListener(\"beforeunload\", chkAntesDeSair); window.addEventListener(\"beforeunload\", chkAntesDeSair);\n"],
  ["F4: fechar a página pergunta mesmo sem código", P, "  if (!chkHaCodigoNaoImpresso()) return undefined;\n  evento.preventDefault();", "  evento.preventDefault();"],
  ["F4: fechar a página não pede a confirmação (sem preventDefault)", P, "  evento.preventDefault();\n  evento.returnValue = \"\";", "  evento.returnValue = \"\";"],
  ["F4: fechar a página não pede a confirmação (sem returnValue)", P, "  evento.preventDefault();\n  evento.returnValue = \"\";", "  evento.preventDefault();"],

  // F3 — o papel, lote por lote
  ["F3: o lote já impresso fica quando chega o seguinte", P, "  chkImpressao.lotes = chkImpressao.lotes.filter(l => !l.impresso);\n", ""],
  ["F3: o lote NÃO impresso some quando chega o seguinte", P, "  chkImpressao.lotes = chkImpressao.lotes.filter(l => !l.impresso);", "  chkImpressao.lotes = chkImpressao.lotes.filter(l => l.impresso);"],
  ["F3: imprimir leva todos os lotes, não só os pendentes", P, "  const lotes = pendentes.length ? pendentes : impressao.lotes.slice();", "  const lotes = impressao.lotes.slice();"],
  ["F3: sem lote pendente imprimir não reimprime", P, "  const lotes = pendentes.length ? pendentes : impressao.lotes.slice();", "  const lotes = pendentes;"],
  ["F3: imprimir não marca os lotes que vão ao papel", P, "  chkLotesAlvo = lotes;\n  chkRenderImpressao(false);   // refaz o painel já com a marca nos lotes que vão ao papel\n", ""],
  ["F3: imprimir não refaz o painel antes do diálogo", P, "  chkRenderImpressao(false);   // refaz o painel já com a marca nos lotes que vão ao papel\n", ""],
  ["F3: o painel refeito perde a marca do lote em impressão", P, "chkLotesAlvo && chkLotesAlvo.includes(lote) ? \"chk-lote chk-lote-alvo\" : \"chk-lote\"", "\"chk-lote\""],
  ["F3: todo lote é marcado como alvo da impressão", P, "chkLotesAlvo && chkLotesAlvo.includes(lote) ?", "chkLotesAlvo ?"],
  ["F3: as classes saem do <body> antes da pergunta (o celular imprimiria a página inteira)", P, "    try { window.print(); } catch { /* o navegador pode recusar a impressão: a pergunta abaixo decide */ }\n", "    try { window.print(); } catch { /* */ }\n    chkLimparImpressaoDaPagina();\n"],
  ["F3: o diálogo de impressão recusado derruba a ação", P, "    try { window.print(); } catch { /* o navegador pode recusar a impressão: a pergunta abaixo decide */ }\n", "    window.print();\n"],
  ["F3: a pergunta 'saiu na impressora?' não é feita", P, "    saiu = await chkPerguntar(CHK_PERGUNTA_IMPRESSAO, \"Sim, saíram\", \"chkImprimirBotao\");", "    saiu = true;"],
  ["F3: imprimir marca como impresso mesmo com 'Cancelar'", P, "  if (saiu) lotes.forEach(l => { l.impresso = true; });", "  lotes.forEach(l => { l.impresso = true; });"],
  ["F3: a marca de alvo não sai depois da pergunta", P, "    if (chkLotesAlvo === lotes) chkLotesAlvo = null;\n", ""],
  ["F3: um segundo toque em Imprimir (pergunta aberta) imprime de novo", P, "  if (chkEmCurso.has(\"imprimir\")) { mostrarToast(\"Aguarde: a impressão anterior ainda está sendo confirmada.\", \"erro\"); return; }\n", ""],
  ["F3: o aviso do segundo toque em Imprimir some", P, "{ mostrarToast(\"Aguarde: a impressão anterior ainda está sendo confirmada.\", \"erro\"); return; }", "{ return; }"],
  ["F3: a trava de Imprimir não é solta depois da resposta", P, "    chkEmCurso.delete(\"imprimir\");\n    chkLimparImpressaoDaPagina();", "    chkLimparImpressaoDaPagina();"],
  ["F3: a trava de Imprimir nunca é armada", P, "  chkEmCurso.add(\"imprimir\");\n", ""],
  ["F3: a resposta de imprimir da sala velha mexe na sala nova", P, "  if (impressao !== chkImpressao || geracao !== chkGeracao || seqSala !== chkSeqSala || !chkSala) return;\n  if (saiu)", "  if (saiu)"],
  ["F3: imprimir não devolve o foco ao botão depois da resposta", P, "  chkFocarId(\"chkImprimirBotao\");\n}\nasync function chkFecharImpressaoAcao", "}\nasync function chkFecharImpressaoAcao"],
  ["F3: o painel não é refeito depois da resposta (o rótulo não muda)", P, "  chkRenderImpressao(false);   // (sem a marca dos lotes-alvo; com \"Impresso\" nos que a pessoa confirmou)\n", ""],
  ["F3: fechar o painel com a pergunta aberta apaga o painel de outra sala", P, "  if (impressao !== chkImpressao || geracao !== chkGeracao || seqSala !== chkSeqSala) return;   // saiu da sala com a pergunta aberta: já está tudo apagado\n", ""],
  ["F3: voltar às salas com a pergunta aberta fecha a sala seguinte", P, "  if (!chkSala || geracao !== chkGeracao || seqSala !== chkSeqSala) return;\n  const gatilho", "  if (!chkSala) return;\n  const gatilho"],
  ["F3: o rótulo do lote sai no papel", P, "chkNo(\"p\", `chk-so-tela chk-lote-estado", "chkNo(\"p\", `chk-lote-estado"],
  ["F3: o rótulo do lote não muda de classe quando impresso", P, "${lote.impresso ? \" chk-lote-impresso\" : \"\"}", ""],
  ["F3: o rótulo do lote diz sempre 'Ainda não impresso'", P, "lote.impresso ? \"✅ Impresso\" : \"⏳ Ainda não impresso\"", "\"⏳ Ainda não impresso\""],
  ["F3: a etiqueta da segunda via não leva a hora da segunda via", P, "  if (et.segundaViaEm) { const v = chkNo(\"div\", \"chk-etq-hora\"", "  if (false) { const v = chkNo(\"div\", \"chk-etq-hora\""],
  ["F3: o recibo da segunda via não leva a hora da segunda via", P, "  if (r.segundaViaEm) { const v = chkNo(\"p\"", "  if (false) { const v = chkNo(\"p\""],
  ["F3: o recibo montado da etiqueta perde a hora da segunda via", P, "instante: et.instante, segundaViaEm: et.segundaViaEm || null, trouxe: null", "instante: et.instante, trouxe: null"],
  ["F3: a hora da segunda via sai só na tela (etiqueta)", P, "chkNo(\"div\", \"chk-etq-hora\", `2ª via emitida", "chkNo(\"div\", \"chk-so-tela chk-etq-hora\", `2ª via emitida"],
  ["F3: a hora da segunda via sai só na tela (recibo)", P, "chkNo(\"p\", \"chk-recibo-linha\", `2ª via emitida", "chkNo(\"p\", \"chk-so-tela chk-recibo-linha\", `2ª via emitida"],
  ["css: o papel leva lotes que não são alvo", C, "  body.chk-imp-etiquetas .chk-lote:not(.chk-lote-alvo) { display: none !important; }\n", ""],
  ["css: o rótulo do lote perde o negrito", C, ".chk-lote-estado { margin: 0 0 6px; font-size: 0.9rem; font-weight: 700; }", ".chk-lote-estado { margin: 0 0 6px; font-size: 0.9rem; font-weight: 400; }"],

  // F6 — o catálogo que some
  ["F6: adicionar criança membro sem o catálogo quebra", P, "  if (!chkCatalogos) { mostrarToast(CHK_MSG_SEM_OPCOES, \"erro\"); chkEscrever(msg, CHK_MSG_SEM_OPCOES, true); return; }\n  const limite", "  const limite"],
  ["F6: adicionar criança membro sem o catálogo avisa só no toast", P, "chkEscrever(msg, CHK_MSG_SEM_OPCOES, true); return; }\n  const limite", "return; }\n  const limite"],
  ["F6: adicionar visitante sem o catálogo quebra", P, "  if (!chkCatalogos) { erro(CHK_MSG_SEM_OPCOES, \"chkCiVisNome\"); return; }\n", ""],
  ["F6: registrar a entrada sem o catálogo quebra", P, "  if (!chkCatalogos) { erro(CHK_MSG_SEM_OPCOES, \"\"); return; }\n", ""],
  ["F6: abrir a retirada sem o catálogo quebra", P, "  if (!chkCatalogos) { mostrarToast(CHK_MSG_SEM_OPCOES, \"erro\"); chkEscrever(\"chkSalaMsg\", CHK_MSG_SEM_OPCOES, true); return; }\n  chkAcao = { tipo: \"retirada\"", "  chkAcao = { tipo: \"retirada\""],
  ["F6: abrir a segunda via sem o catálogo quebra", P, "  if (!chkCatalogos) { mostrarToast(CHK_MSG_SEM_OPCOES, \"erro\"); chkEscrever(\"chkSalaMsg\", CHK_MSG_SEM_OPCOES, true); return; }\n  chkAcao = { tipo: \"segundavia\"", "  chkAcao = { tipo: \"segundavia\""],
  ["F6: Atualizar agora não pede o catálogo que faltou", P, "  if (chkSala && !chkCatalogos) await chkGarantirCatalogos();\n", ""],
  ["F6: Atualizar agora pede o catálogo sempre", P, "  if (chkSala && !chkCatalogos) await chkGarantirCatalogos();", "  if (chkSala) await chkGarantirCatalogos(true);"],
  ["F6: a lista da entrada sem o catálogo usa o limite zero", P, "${Number(chkCatalogos ? chkCatalogos.maxCriancas : CHK_MAX_CRIANCAS_PADRAO)}", "${Number(chkCatalogos ? chkCatalogos.maxCriancas : 0)}"],

  // F7 — o modal que sobrevive à sessão
  ["F7: sair da sessão não fecha o modal aberto", P, "  if (typeof fecharModal === \"function\") fecharModal();\n", ""],

  // F8 — a fila de Aprovações
  ["F8: a fila de aprovações empilha rodadas", P, "  if (silencioso && !forcar && chkEmVooApr > 0) return;\n", ""],
  ["F8: o ato da pessoa espera a rodada anterior da fila", P, "  if (silencioso && !forcar && chkEmVooApr > 0) return;", "  if (chkEmVooApr > 0) return;"],
  ["F8: a volta à página espera a rodada anterior da fila", P, "  if (silencioso && !forcar && chkEmVooApr > 0) return;", "  if (silencioso && chkEmVooApr > 0) return;"],
  ["F8: a rodada da fila nunca conta como a caminho", P, "  chkEmVooApr++;\n  try { await chkRodadaDeAprovacoes", "  try { await chkRodadaDeAprovacoes"],
  ["F8: a rodada da fila nunca libera a vaga", P, "finally { if (epoca === chkEpocaApr && chkEmVooApr > 0) chkEmVooApr--; }", "finally { }"],
  ["F8: a rodada velha da fila libera a vaga da nova (sem a época)", P, "finally { if (epoca === chkEpocaApr && chkEmVooApr > 0) chkEmVooApr--; }", "finally { if (chkEmVooApr > 0) chkEmVooApr--; }"],
  ["F8: sair da sessão não zera a rodada da fila a caminho", P, "chkEmVoo = 0; chkEmVooApr = 0; chkEpocaApr++; chkUltimaLeituraMs = 0;", "chkEmVoo = 0; chkUltimaLeituraMs = 0;"],
  ["F8: sair da aba da liderança não zera a rodada da fila a caminho", P, "chkSeqApr++; chkEmVooApr = 0; chkEpocaApr++; if (!chkSala) chkPararTimer(); }", "chkSeqApr++; if (!chkSala) chkPararTimer(); }"],
  ["F8: trocar de seção não zera a rodada da fila a caminho", P, "    chkSeqGes++; chkSeqApr++; chkEmVooApr = 0; chkEpocaApr++;\n    chkSairDasFichas();", "    chkSeqGes++; chkSeqApr++;\n    chkSairDasFichas();"],
  ["F8: a fila lê mais de 15 salas", P, "  const salas = elegiveis.slice(0, CHK_MAX_SALAS_APROVACOES), cortada = elegiveis.length > salas.length;", "  const salas = elegiveis, cortada = false;"],
  ["F8: o corte da fila não é avisado", P, "  const salas = elegiveis.slice(0, CHK_MAX_SALAS_APROVACOES), cortada = elegiveis.length > salas.length;", "  const salas = elegiveis.slice(0, CHK_MAX_SALAS_APROVACOES), cortada = false;"],
  ["F8: a fila avisa o corte mesmo sem corte", P, "cortada = elegiveis.length > salas.length;", "cortada = elegiveis.length >= salas.length;"],
  ["F8: o aviso do corte não sai em destaque", P, ".filter(Boolean).join(\" \"), cortada);", ".filter(Boolean).join(\" \"), false);"],
  ["F8: a lista vazia da fila cortada finge que nada espera", P, "      : cortada ? \"<p class='subtitle'>Nada espera", "      : false ? \"<p class='subtitle'>Nada espera"],
  ["F8: a lista da fila não sabe que foi cortada", P, "  chkRenderAprovacoes(cortada);\n  chkIniciarTimer();", "  chkRenderAprovacoes();\n  chkIniciarTimer();"],
  ["F8: o aviso do corte some da mensagem", P, "  const aviso = cortada ? `Mostrando as ${CHK_MAX_SALAS_APROVACOES} primeiras salas de ${elegiveis.length}. Abra a sala para ver o resto.` : \"\";", "  const aviso = \"\";"],
  ["F8: a mensagem com corte esconde os itens esperando", P, "chkEscrever(\"chkAprMsg\", [itens.length ? `${itens.length} item(ns) esperando a liderança.` : \"\", aviso]", "chkEscrever(\"chkAprMsg\", [\"\", aviso]"],
  ["F8: o limite da fila é 99", P, "const CHK_MAX_SALAS_APROVACOES = 15;", "const CHK_MAX_SALAS_APROVACOES = 99;"],
  ["F8: o limite da fila é 10", P, "const CHK_MAX_SALAS_APROVACOES = 15;", "const CHK_MAX_SALAS_APROVACOES = 10;"],

  // F12 — tempo-limite e dado velho
  ["F12: o pedido não leva o tempo-limite", P, "    if (typeof AbortSignal !== \"undefined\" && typeof AbortSignal.timeout === \"function\") comPrazo.signal = AbortSignal.timeout(CHK_TEMPO_LIMITE_MS);\n", ""],
  ["F12: o tempo-limite é de 200 s", P, "const CHK_TEMPO_LIMITE_MS = 20000;", "const CHK_TEMPO_LIMITE_MS = 200000;"],
  ["F12: o pedido quebra sem AbortSignal (sem a guarda)", P, "if (typeof AbortSignal !== \"undefined\" && typeof AbortSignal.timeout === \"function\") comPrazo.signal", "if (true) comPrazo.signal"],
  ["F12: o dado velho só vale depois de 5 minutos", P, "const CHK_MS_DADO_VELHO = 30000;", "const CHK_MS_DADO_VELHO = 300000;"],
  ["F12: o dado velho vale com 3 segundos", P, "const CHK_MS_DADO_VELHO = 30000;", "const CHK_MS_DADO_VELHO = 3000;"],
  ["F12: a leitura boa não guarda a hora (o carimbo fica sempre velho)", P, "  chkUltimaLeituraMs = Date.now();\n", ""],
  ["F12: o tique não atualiza o carimbo antes da leitura", P, "    chkAtualizarCarimbo();   // sem leitura bem-sucedida há muito tempo, o carimbo avisa antes mesmo de a próxima resposta chegar\n", ""],
  ["F12: a leitura que falha não atualiza o carimbo", P, "    chkAtualizarCarimbo();\n    if (parou) chkPararTimer();", "    if (parou) chkPararTimer();"],
  ["F12: o carimbo velho não leva o ⚠", P, "? `⚠ Atualizado às ${chkHoraComSegundos(chkSnap.atualizadoEm)}: dados antigos", "? `Atualizado às ${chkHoraComSegundos(chkSnap.atualizadoEm)}: dados antigos"],
  ["F12: o carimbo velho não diz 'dados antigos'", P, ": dados antigos — toque em “Atualizar agora”.`", ".`"],
  ["F12: o carimbo velho nunca aparece", P, "function chkCarimboVelho() { return Date.now() - chkUltimaLeituraMs > CHK_MS_DADO_VELHO; }", "function chkCarimboVelho() { return false; }"],
  ["F12: o carimbo velho aparece sempre", P, "function chkCarimboVelho() { return Date.now() - chkUltimaLeituraMs > CHK_MS_DADO_VELHO; }", "function chkCarimboVelho() { return true; }"],
  ["F12: voltar à página não força a leitura", P, "  chkTique(true);\n  chkIniciarTimer();", "  chkTique();\n  chkIniciarTimer();"],
  ["F12: a volta à página não força a leitura da fila", P, "chkCarregarAprovacoes(true, forcar === true); return; }", "chkCarregarAprovacoes(true); return; }"],
  ["F12: o tique da fila sempre força a leitura", P, "chkCarregarAprovacoes(true, forcar === true); return; }", "chkCarregarAprovacoes(true, true); return; }"],
  ["F12: o tique sempre força a leitura da sala", P, "    chkLerSala(forcar === true);", "    chkLerSala(true);"],
  ["F12: o tique nunca força a leitura da sala (nem na volta)", P, "    chkLerSala(forcar === true);", "    chkLerSala(false);"],

  // F16 — o Detalhe do relatório em português
  ["F16: o Detalhe do relatório sai como veio do servidor", P, "chkTraduzirDetalhe(e.detalhe)])));", "e.detalhe || \"\"])));"],
  ["F16: 'adultos=N' não é traduzido", P, "    if ((m = /^adultos=(\\d+)$/.exec(p)))", "    if (false && (m = /^adultos=(\\d+)$/.exec(p)))"],
  ["F16: 'criancas=N' não é traduzido", P, "    if ((m = /^criancas=(\\d+)$/.exec(p)))", "    if (false && (m = /^criancas=(\\d+)$/.exec(p)))"],
  ["F16: 'tentativa=N/M' não é traduzido", P, "    if ((m = /^tentativa=(\\d+)\\/(\\d+)$/.exec(p)))", "    if (false && (m = /^tentativa=(\\d+)\\/(\\d+)$/.exec(p)))"],
  ["F16: 'erros=N' não é traduzido", P, "    if ((m = /^erros=(\\d+)$/.exec(p)))", "    if (false && (m = /^erros=(\\d+)$/.exec(p)))"],
  ["F16: 'geracao=N' não é traduzido", P, "    if ((m = /^geracao=(\\d+)$/.exec(p)))", "    if (false && (m = /^geracao=(\\d+)$/.exec(p)))"],
  ["F16: 'baixadas=N' não é traduzido", P, "    if ((m = /^baixadas=(\\d+)$/.exec(p)))", "    if (false && (m = /^baixadas=(\\d+)$/.exec(p)))"],
  ["F16: o singular vira plural", P, "function chkPlural(n, singular, plural) { return `${n} ${n === 1 ? singular : plural}`; }", "function chkPlural(n, singular, plural) { return `${n} ${plural}`; }"],
  ["F16: o plural vira singular", P, "function chkPlural(n, singular, plural) { return `${n} ${n === 1 ? singular : plural}`; }", "function chkPlural(n, singular, plural) { return `${n} ${singular}`; }"],
  ["F16: o tipo de quem retirou não é traduzido no Detalhe", P, "    if (CHK_ROTULO_TIPO_RETIRANTE[p]) return CHK_ROTULO_TIPO_RETIRANTE[p];\n", ""],
  ["F16: o código de recusa 'sem faixa' não é traduzido", P, "    if (CHK_ROTULO_PROBLEMA[p]) return CHK_ROTULO_PROBLEMA[p];\n", ""],
  ["F16: o código de máquina desconhecido passa como veio", P, "    return /^[A-Z][A-Z_]+$/.test(p) ? p.toLowerCase().replace(/_/g, \" \") : p;", "    return p;"],
  ["F16: o código de máquina fica minúsculo mas com sublinhado", P, ".toLowerCase().replace(/_/g, \" \") : p;", ".toLowerCase() : p;"],
  ["F16: a baixa administrativa não tem rótulo", P, ", OUTRO: \"outra pessoa\", BAIXA_ADM: \"baixa administrativa\" };", ", OUTRO: \"outra pessoa\" };"],
  ["F16: as partes do Detalhe se juntam sem separador", P, "  }).filter(Boolean).join(\"; \");", "  }).filter(Boolean).join(\" \");"],
  ["F16: parte vazia do Detalhe vira lixo", P, "  }).filter(Boolean).join(\"; \");", "  }).join(\"; \");"],

  // F17 — acessibilidade
  ["F17: Revogar não diz a quem se refere", P, " aria-label=\"Revogar a autorização de ${escaparHtmlEbd(a.nome)}\"", ""],
  ["F17: Remover não diz quem", P, " aria-label=\"Remover ${escaparHtmlEbd(c.nome)} desta entrada\"", ""],
  ["F17: Adicionar não diz quem", P, " aria-label=\"Adicionar ${escaparHtmlEbd(r.nome)} a esta entrada\"", ""],
  ["F17: Tirar da sala não diz quem", P, " aria-label=\"Tirar ${escaparHtmlEbd(v.nome)} da sala\"", ""],
  ["F17: as seções de Meus filhos não têm aria-controls", P, " aria-controls=\"chkFh${secao}${id}\"", ""],
  ["F17: o aria-controls aponta para outra seção", P, "aria-controls=\"chkFh${secao}${id}\"", "aria-controls=\"chkFhHist${id}\""],
  ["F17: o alerta das pendências é sempre recriado", P, "  if ((cx.getAttribute(\"data-chave\") || \"\") === chave) return;\n", ""],
  ["F17: o alerta das pendências nunca guarda o texto", P, "  cx.setAttribute(\"data-chave\", chave);\n", ""],

  // F19 — a busca limitada a 8
  ["F19: 8 resultados não avisam que pode haver mais", P, "n >= CHK_MAX_BUSCA ?", "n > CHK_MAX_BUSCA ?"],
  ["F19: 7 resultados já avisam que pode haver mais", P, "n >= CHK_MAX_BUSCA ?", "n >= CHK_MAX_BUSCA - 1 ?"],
  ["F19: o limite da busca é 9", P, "const CHK_MAX_BUSCA = 8;", "const CHK_MAX_BUSCA = 9;"],
  ["F19: o aviso da busca cortada não manda afinar", P, "digite mais letras do nome para afinar a busca.", "tente de novo."],

  // F20 — o catálogo em Meus filhos e nas fichas
  ["F20: 'Quem pode retirar' não garante o catálogo", P, "  const [catalogo, data] = await Promise.all([chkGarantirCatalogos(), chkObter(`autorizados?menorId=${id}`)]);", "  const catalogo = chkCatalogos, data = await chkObter(`autorizados?menorId=${id}`);"],
  ["F20: 'Quem pode retirar' sem o catálogo mostra o formulário", P, "  if (!catalogo && data.sucesso !== false && cx) {", "  if (false && !catalogo && data.sucesso !== false && cx) {"],
  ["F20: o erro do servidor é trocado pelo aviso do catálogo", P, "  if (!catalogo && data.sucesso !== false && cx) {", "  if (!catalogo && cx) {"],
  ["F20: o aviso da ficha sai com o texto do filho", P, "pfx === \"Fi\" ? CHK_MSG_SEM_OPCOES_FICHA : CHK_MSG_SEM_OPCOES_FILHO", "CHK_MSG_SEM_OPCOES_FILHO"],
  ["F20: o aviso do filho sai com o texto da ficha", P, "pfx === \"Fi\" ? CHK_MSG_SEM_OPCOES_FICHA : CHK_MSG_SEM_OPCOES_FILHO", "CHK_MSG_SEM_OPCOES_FICHA"],
  ["F20: a ficha não garante o catálogo", P, "    const [catalogo, data] = await Promise.all([chkGarantirCatalogos(), chkObter(`autorizados?menorId=${menorId}`)]);", "    const catalogo = chkCatalogos, data = await chkObter(`autorizados?menorId=${menorId}`);"],
  ["F20: a ficha sem o catálogo monta mesmo assim", P, "    if (!catalogo) { chkEscrever(\"chkFichaMsg\", CHK_MSG_SEM_OPCOES_FICHA, true); return; }\n", ""],
  ["F20: o aviso da ficha sem o catálogo não fica em destaque", P, "chkEscrever(\"chkFichaMsg\", CHK_MSG_SEM_OPCOES_FICHA, true)", "chkEscrever(\"chkFichaMsg\", CHK_MSG_SEM_OPCOES_FICHA, false)"],

  // F21 — o módulo velho no cache
  ["F21: Meus Dados chama o cartão do check-in sem a guarda", M, "${typeof mnrCartaoCheckinMeusDados === \"function\" ? mnrCartaoCheckinMeusDados(data.checkinInfantil) : \"\"}", "${mnrCartaoCheckinMeusDados(data.checkinInfantil)}"],

  // F22 — textos
  ["F22: a resposta que não é JSON volta a mostrar o status", P, "const CHK_MSG_RESPOSTA_ESTRANHA = \"Não consegui entender a resposta do servidor. Tente de novo.\";", "const CHK_MSG_RESPOSTA_ESTRANHA = \"Resposta inesperada do servidor (404).\";"],
  ["F22: a criança travada volta ao texto 'vezes demais'", P, "O código foi digitado errado muitas vezes. Peça à liderança", "O código foi errado vezes demais. Peça à liderança"],

  // o servidor mudou (1): "apto" não vai ao operador
  ["Servidor: quem não conta mostra o motivo (apto)", P, "const selo = v.contaComoAdulto ? chkSelo(CHK_CLASSE_SELO.ok, \"conta como adulto\") : chkSelo(CHK_CLASSE_SELO.neutro, \"não conta na proporção agora\");", "const selo = v.contaComoAdulto ? chkSelo(CHK_CLASSE_SELO.ok, \"conta como adulto\") : v.apto ? chkSelo(CHK_CLASSE_SELO.neutro, \"auxiliar: não conta como adulto\") : chkSelo(CHK_CLASSE_SELO.erro, \"⚠ não está apto agora: não conta\");"],
  ["Servidor: o texto de quem não conta muda", P, "\"não conta na proporção agora\"", "\"não conta\""],

  // o servidor mudou (2): encerrar a sala
  ["Encerrar: o botão aparece com a janela aberta", P, "const terminou = (!!j && j.aberta === false) || (", "const terminou = true || ("],
  ["Encerrar: o botão aparece sem nada a encerrar", P, " && terminou && (chkCriancasDaSala().length > 0 || chkVoluntariosPresentes().length > 0);", " && terminou;"],
  ["Encerrar: o botão só vale com criança (voluntário sozinho não)", P, "terminou && (chkCriancasDaSala().length > 0 || chkVoluntariosPresentes().length > 0);", "terminou && chkCriancasDaSala().length > 0;"],
  ["Encerrar: o botão só vale com voluntário (criança sozinha não)", P, "terminou && (chkCriancasDaSala().length > 0 || chkVoluntariosPresentes().length > 0);", "terminou && chkVoluntariosPresentes().length > 0;"],
  ["Encerrar: o serviço cancelado não libera o botão", P, "const terminou = (!!j && j.aberta === false) || (!!sala && typeof sala.servicoStatus === \"string\" && sala.servicoStatus !== \"PUBLICADA\");", "const terminou = (!!j && j.aberta === false);"],
  ["Encerrar: o serviço publicado libera o botão", P, "sala.servicoStatus !== \"PUBLICADA\");", "sala.servicoStatus === \"PUBLICADA\");"],
  ["Encerrar: a janela fechada não libera o botão", P, "const terminou = (!!j && j.aberta === false) || (", "const terminou = false || ("],
  ["Encerrar: o botão aparece fora da aba da liderança", P, "chkSala.ctx === \"Ges\" && sessaoDeLiderancaNaTela()", "sessaoDeLiderancaNaTela()"],
  ["Encerrar: o botão aparece sem a senha de liderança", P, "chkSala.ctx === \"Ges\" && sessaoDeLiderancaNaTela() &&", "chkSala.ctx === \"Ges\" &&"],
  ["Encerrar: o botão não espera a janela do servidor", P, "const j = sala && sala.janela && typeof sala.janela === \"object\" ? sala.janela : null;", "const j = { aberta: false };"],
  ["Encerrar: a ação não confere se o botão cabe", P, "async function chkEncerrarSalaAcao(botao) {\n  if (!chkPodeEncerrar()) return;", "async function chkEncerrarSalaAcao(botao) {\n  if (false) return;"],
  ["Encerrar: o botão não é desenhado a cada leitura", P, "chkRenderNaSala(); chkRenderEncerrar();", "chkRenderNaSala();"],
  ["Encerrar: o botão refeito perde o foco", P, "  chkComFoco(() => {\n    cx.innerHTML = chkPodeEncerrar()", "  ((fn) => fn())(() => {\n    cx.innerHTML = chkPodeEncerrar()"],
  ["Encerrar: a ação não está registrada para o clique", P, "chkDestravarAcao, chkEncerrarSalaAcao, chkEntrarAcao,", "chkDestravarAcao, chkEntrarAcao,"],
  ["Encerrar: o motivo curto demais é aceito", P, "    if (motivo.length >= CHK_MIN_MOTIVO_ENCERRAR && motivo.length <= CHK_MAX_MOTIVO && !chkTemMarca(motivo)) break;", "    break;"],
  ["Encerrar: o motivo com < ou > é aceito", P, "motivo.length >= CHK_MIN_MOTIVO_ENCERRAR && motivo.length <= CHK_MAX_MOTIVO && !chkTemMarca(motivo)) break;", "motivo.length >= CHK_MIN_MOTIVO_ENCERRAR && motivo.length <= CHK_MAX_MOTIVO) break;"],
  ["Encerrar: o motivo comprido demais é aceito", P, "motivo.length >= CHK_MIN_MOTIVO_ENCERRAR && motivo.length <= CHK_MAX_MOTIVO && !chkTemMarca(motivo)) break;", "motivo.length >= CHK_MIN_MOTIVO_ENCERRAR && !chkTemMarca(motivo)) break;"],
  ["Encerrar: o motivo mínimo é 1", P, "const CHK_MIN_MOTIVO_ENCERRAR = 5;", "const CHK_MIN_MOTIVO_ENCERRAR = 1;"],
  ["Encerrar: o motivo digitado não volta ao campo", P, "\"Ex.: o culto terminou e as famílias já levaram as crianças.\", motivo);", "\"Ex.: o culto terminou e as famílias já levaram as crianças.\", \"\");"],
  ["Encerrar: o aviso do motivo ruim some", P, "    mostrarToast(`Escreva o motivo com ${CHK_MIN_MOTIVO_ENCERRAR} a ${CHK_MAX_MOTIVO} caracteres, sem < ou >.`, \"erro\");\n", ""],
  ["Encerrar: cancelar o motivo não devolve o foco", P, "    if (digitado == null) { chkVoltarFoco(botao); return; }\n    motivo = chkEspacos(digitado);\n    if (motivo.length >= CHK_MIN_MOTIVO_ENCERRAR", "    if (digitado == null) { return; }\n    motivo = chkEspacos(digitado);\n    if (motivo.length >= CHK_MIN_MOTIVO_ENCERRAR"],
  ["Encerrar: sem a confirmação", P, "  if (!(await chkPerguntar(pergunta, \"Dar baixa e encerrar\", botao))) return;", "  if (false && !(await chkPerguntar(pergunta, \"Dar baixa e encerrar\", botao))) return;"],
  ["Encerrar: a confirmação não diz quantas crianças", P, "  const n = chkCriancasDaSala().length;\n  const pergunta = n > 0", "  const n = 0;\n  const pergunta = n > 0"],
  ["Encerrar: a pergunta sem criança fala em baixa de 0 crianças", P, "  const pergunta = n > 0 ? ", "  const pergunta = true ? "],
  ["Encerrar: a pergunta com criança esquece a baixa", P, "  const pergunta = n > 0 ? ", "  const pergunta = false ? "],
  ["Encerrar: a tela de agora não é conferida depois do motivo", P, "  chkVoltarFoco(botao);\n  if (!mesmaTela()) return;\n  const n =", "  chkVoltarFoco(botao);\n  const n ="],
  ["Encerrar: a tela de agora não é conferida depois da confirmação", P, "\"Dar baixa e encerrar\", botao))) return;\n  if (!mesmaTela()) return;\n", "\"Dar baixa e encerrar\", botao))) return;\n"],
  ["Encerrar: a resposta não confere a tela de agora", P, "motivo });   // 428: o fetchProtegido confirma a identidade e repete a chamada uma vez\n    if (!mesmaTela()) return;", "motivo });   // 428: o fetchProtegido confirma a identidade e repete a chamada uma vez"],
  ["Encerrar: sem a proteção de duplo clique", P, "  }, \"encerrar\");", "  }, undefined);"],
  ["Encerrar: os ids vão como texto", P, "chkPostar(\"encerrar-sala\", { servicoId: sala.servicoId,", "chkPostar(\"encerrar-sala\", { servicoId: String(sala.servicoId),"],
  ["Encerrar: o motivo não vai no corpo", P, "equipeId: sala.equipeId, motivo });   // 428", "equipeId: sala.equipeId });   // 428"],
  ["Encerrar: depois de encerrar a sala não é lida", P, "    chkMostrarResultado(data, \"chkSalaMsg\", false);   // (a recusa do servidor já sai como alerta: sucesso === false)\n    await chkLerSala(true);", "    chkMostrarResultado(data, \"chkSalaMsg\", false);   // (a recusa do servidor já sai como alerta: sucesso === false)"],

  // o servidor mudou (3): a segunda via
  ["Segunda via: o cartão não mostra o documento conferido", P, "${via.documento ? ` (documento conferido por quem pediu: ${escaparHtmlEbd(chkRotuloDocumento(via.documento))})` : \"\"}", "${\"\"}"],
  ["Segunda via: o documento aparece sem o rótulo do catálogo", P, "${escaparHtmlEbd(chkRotuloDocumento(via.documento))})`", "${escaparHtmlEbd(via.documento)})`"],

  // o servidor mudou (4): motivo do pedido de retirada divergente
  ["Retirada: o motivo não vai no corpo", P, "    if (motivo) retirante.outro.motivo = motivo;", "    if (false) retirante.outro.motivo = motivo;"],
  ["Retirada: o motivo vai fora de 'outro'", P, "    if (motivo) retirante.outro.motivo = motivo;", "    if (motivo) retirante.motivo = motivo;"],
  ["Retirada: o motivo vai mesmo vazio", P, "    if (motivo) retirante.outro.motivo = motivo;", "    retirante.outro.motivo = motivo;"],
  ["Retirada: o motivo não é lido do campo", P, "    motivo = chkEspacos(chkTexto(\"chkRtMotivo\"));", "    motivo = \"\";"],
  ["Retirada: o motivo curto demais é aceito", P, "if ((motivo && motivo.length < CHK_MIN_MOTIVO_PEDIDO) || motivo.length > CHK_MAX_MOTIVO || chkTemMarca(motivo))", "if (motivo.length > CHK_MAX_MOTIVO || chkTemMarca(motivo))"],
  ["Retirada: o motivo comprido demais é aceito", P, "if ((motivo && motivo.length < CHK_MIN_MOTIVO_PEDIDO) || motivo.length > CHK_MAX_MOTIVO || chkTemMarca(motivo))", "if ((motivo && motivo.length < CHK_MIN_MOTIVO_PEDIDO) || chkTemMarca(motivo))"],
  ["Retirada: o motivo com < ou > é aceito", P, "if ((motivo && motivo.length < CHK_MIN_MOTIVO_PEDIDO) || motivo.length > CHK_MAX_MOTIVO || chkTemMarca(motivo))", "if ((motivo && motivo.length < CHK_MIN_MOTIVO_PEDIDO) || motivo.length > CHK_MAX_MOTIVO)"],
  ["Retirada: o motivo mínimo é 1", P, "const CHK_MIN_MOTIVO_PEDIDO = 3;", "const CHK_MIN_MOTIVO_PEDIDO = 1;"],
  ["Retirada: o campo do motivo não existe no formulário", P, "        <textarea id=\"chkRtMotivo\" rows=\"2\" maxlength=\"${CHK_MAX_MOTIVO}\" autocomplete=\"off\" spellcheck=\"false\"></textarea>\n", ""],
  ["Retirada: o campo do motivo não tem rótulo", P, "        <label for=\"chkRtMotivo\">Motivo (opcional): por que essa pessoa não está na lista?</label>\n", ""],
  ["Retirada: o cartão da liderança não mostra o motivo do pedido", P, "${chkCampo(\"Motivo informado por quem registrou o pedido\", div.motivo ? escaparHtmlEbd(div.motivo) : \"\")}", ""],

  // o servidor mudou: "semAviso", a baixa no histórico e no relatório
  ["semAviso: o alerta não considera semAviso", P, "const alerta = !!data && (data.sucesso === false || data.semAviso === true);", "const alerta = !!data && data.sucesso === false;"],
  ["semAviso: o alerta ignora o erro", P, "const alerta = !!data && (data.sucesso === false || data.semAviso === true);", "const alerta = !!data && data.semAviso === true;"],
  ["Baixa: o histórico mostra a baixa com o selo de retirada de verdade", P, "chkSelo(h.baixaAdministrativa ? CHK_CLASSE_SELO.atencao : (CHK_CLASSE_SITUACAO[h.situacao] || CHK_CLASSE_SELO.neutro), h.rotuloSituacao || h.situacao)", "chkSelo((CHK_CLASSE_SITUACAO[h.situacao] || CHK_CLASSE_SELO.neutro), h.rotuloSituacao || h.situacao)"],
  ["Baixa: o histórico não diz quando o registro foi encerrado", P, "(h.encerradaEm ? ` · registro encerrado às ${escaparHtmlEbd(chkHoraInstante(h.encerradaEm))}` : \"\")", "\"\""],
  ["Baixa: o histórico mostra a hora do encerramento mesmo sem ela", P, "(h.encerradaEm ? ` · registro encerrado", "(true ? ` · registro encerrado"],
  ["Baixa: o histórico mostra 'saiu às' na linha de baixa", P, "h.baixaAdministrativa ? (h.encerradaEm ?", "false ? (h.encerradaEm ?"],
  ["Baixa: o histórico mostra quem retirou na linha de baixa", P, "h.quemRetirou && !h.baixaAdministrativa ?", "h.quemRetirou ?"],
  ["Baixa: o relatório chama a baixa de retirada", P, "      c.baixaAdministrativa ? \"Baixa administrativa (sem retirada registrada)\" : (CHK_ROTULO_SITUACAO[c.situacao] || c.situacao),", "      (CHK_ROTULO_SITUACAO[c.situacao] || c.situacao),"],
  ["Baixa: o relatório não mostra o motivo do pedido", P, "c.motivoDoPedido ? `Pedido: ${c.motivoDoPedido}` : \"\"", "\"\""],
  ["Baixa: o relatório não mostra o motivo da decisão", P, "c.motivoDaDecisao ? `Decisão: ${c.motivoDaDecisao}` : \"\"", "\"\""],
  ["Baixa: o relatório não mostra o motivo da baixa", P, "c.baixaMotivo ? `Baixa: ${c.baixaMotivo}` : \"\"", "\"\""],
  ["Baixa: o relatório não tem a coluna dos motivos", P, "\"Retirada divergente\", \"Motivos registrados\"],", "\"Retirada divergente\"],"],

  // a sala de um dia que passou (selo e data na lista da liderança) e o Detalhe do encerramento
  ["Dia anterior: o cartão não leva o selo", P, "${s.diaAnterior === true ? chkSelo(CHK_CLASSE_SELO.atencao, \"Dia anterior\") : \"\"}", "${\"\"}"],
  ["Dia anterior: toda sala leva o selo", P, "${s.diaAnterior === true ? chkSelo(CHK_CLASSE_SELO.atencao, \"Dia anterior\") : \"\"}", "${true ? chkSelo(CHK_CLASSE_SELO.atencao, \"Dia anterior\") : \"\"}"],
  ["Dia anterior: o cartão não leva a data do serviço", P, "chkSelo(CHK_CLASSE_SELO.neutro, s.diaAnterior === true ? `Serviço de", "chkSelo(CHK_CLASSE_SELO.neutro, false ? `Serviço de"],
  ["Dia anterior: toda sala leva a data do serviço", P, "chkSelo(CHK_CLASSE_SELO.neutro, s.diaAnterior === true ? `Serviço de", "chkSelo(CHK_CLASSE_SELO.neutro, true ? `Serviço de"],
  ["Dia anterior: o cartão não explica o que fazer", P, "${s.diaAnterior === true ? `<p class=\"psc-aviso\" role=\"note\">Este serviço", "${false ? `<p class=\"psc-aviso\" role=\"note\">Este serviço"],
  ["Dia anterior: toda sala leva a explicação", P, "${s.diaAnterior === true ? `<p class=\"psc-aviso\" role=\"note\">Este serviço", "${true ? `<p class=\"psc-aviso\" role=\"note\">Este serviço"],
  ["F16: 'voluntarios=N' não é traduzido", P, "    if ((m = /^voluntarios=(\\d+)$/.exec(p)))", "    if (false && (m = /^voluntarios=(\\d+)$/.exec(p)))"],
  ["F16: a situação antes da baixa não é traduzida", P, "    if (CHK_ROTULO_ANTES_DA_BAIXA[p]) return CHK_ROTULO_ANTES_DA_BAIXA[p];\n", ""],
  ["F16: a baixa de quem estava na sala perde o 'estava'", P, "NA_SALA: \"estava na sala\"", "NA_SALA: \"na sala\""],
  ["F16: a baixa de quem esperava a liderança perde o rótulo", P, "RETIRADA_PENDENTE: \"estava aguardando a liderança\" };   // (o Detalhe", "};   // (o Detalhe"],
  // Trava 7-B (20/10/2026)
  ["Trava 7-B: a saúde do visitante vai com quem não é pai, mãe nem tutor", P, "if (lista.some(c => c.tipo === \"VISITANTE\" && c.saude) && !CHK_PARENTESCOS_QUE_AUTORIZAM_SAUDE.includes(parentesco))", "if (false)"],
  ["Trava 7-B: o tio passa a autorizar a saúde", P, "const CHK_PARENTESCOS_QUE_AUTORIZAM_SAUDE = [\"PAI\", \"MAE\", \"TUTOR\"];", "const CHK_PARENTESCOS_QUE_AUTORIZAM_SAUDE = [\"PAI\", \"MAE\", \"TUTOR\", \"TIO\"];"],
  ["Trava 7-B: a mãe deixa de autorizar a saúde", P, "const CHK_PARENTESCOS_QUE_AUTORIZAM_SAUDE = [\"PAI\", \"MAE\", \"TUTOR\"];", "const CHK_PARENTESCOS_QUE_AUTORIZAM_SAUDE = [\"PAI\", \"TUTOR\"];"],
  ["Trava 7-B: a recusa da saúde não foca o parentesco", P, "{ erro(CHK_MSG_SAUDE_SO_RESPONSAVEL, \"chkCiTrouxePar\"); return; }", "{ erro(CHK_MSG_SAUDE_SO_RESPONSAVEL, \"\"); return; }"],
  ["Trava 7-B: a busca volta ao GET (o nome no endereço)", P, "const data = await chkPostar(\"buscar\", { servicoId: Number(sala.servicoId), equipeId: Number(sala.equipeId), q });", "const data = await chkObter(`buscar?${chkConsultaSala(sala, `&q=${encodeURIComponent(q)}`)}`);"]
];

// ------------------------------------------------------------ monta a lista
function montarLista() {
  const codigo = lerApp(P);
  const geradas = [...gerarEscapes(codigo), ...gerarValidacoes(codigo)]
    .filter(m => !(m[0].startsWith("escape (") && ESCAPES_DE_CONSTANTE.some(r => r.test(m[0]))));
  return [...MANUAIS, ...geradas];
}

// ------------------------------------------------------------ execução
function conferirAncora(arquivo, de) {
  const codigo = lerApp(arquivo);
  return codigo.split(de).length - 1;
}
function paresDe(m) { return Array.isArray(m[2]) ? m[2] : [[m[2], m[3]]]; }

async function executarUma(m) {
  const { rodar } = require("./roteiro");
  const pares = paresDe(m);
  let T;
  try { T = await Promise.race([rodar({ mutar: { [m[1]]: pares } }), new Promise((_, rej) => setTimeout(() => rej(new Error("TRAVOU (mais de 90 s)")), 90000))]); }
  // o roteiro que não termina (a mutação deixa uma espera sem fim) é uma mutação ACUSADA: num CI ele estouraria o tempo e reprovaria; só não pode contar como "falha do roteiro" comum
  catch (e) { return /^TRAVOU/.test(e.message) ? { nome: m[0], estado: "ACUSADA", detalhe: "o roteiro não termina (travou)", n: 1 } : { nome: m[0], estado: "INAPLICAVEL", detalhe: e.message.slice(0, 160) }; }
  if (T.falhas.some(f => /mutação inaplicável/.test(f))) return { nome: m[0], estado: "INAPLICAVEL", detalhe: T.falhas.find(f => /mutação inaplicável/.test(f)).slice(0, 160) };
  if (T.falhas.length) return { nome: m[0], estado: "ACUSADA", detalhe: T.falhas[0].slice(0, 120), n: T.falhas.length };
  return { nome: m[0], estado: "ESCAPOU" };
}

if (process.env.CHK_SO_BASE) {
  // processo filho: só a rodada sem mutação, devolvida ao pai
  (async () => { const T = await require("./roteiro").rodar({}); process.send({ total: T.total, falhas: T.falhas }, () => process.exit(0)); })();
} else if (process.env.CHK_MUT_INDICES) {
  // processo filho: roda as mutações dos índices recebidos e devolve cada resultado ao pai
  const lista = montarLista();
  const vivo = setInterval(() => {}, 1000);
  setInterval(() => { if (process.memoryUsage().rss > 2.4e9) process.exit(97); }, 500).unref();      // segunda cerca: memória fora do monte do V8 (o pai conta o que faltou como acusada)
  (async () => {
    for (const i of process.env.CHK_MUT_INDICES.split(",").map(Number)) process.send({ i, r: await executarUma(lista[i]) });
    clearInterval(vivo); process.exit(0);
  })();
} else {
  (async () => {
    const args = process.argv.slice(2);
    const conferir = args.includes("--conferir");
    const filtro = args.find(a => !a.startsWith("--")) || "";
    const todas = montarLista();
    // CHK_DE / CHK_ATE: só as mutações de índice [DE, ATE) — para rodar a lista em pedaços curtos (a máquina do responsável reiniciou duas vezes em 19/10/2026 durante rodadas longas)
    const de = Number(process.env.CHK_DE || 0), ate = Number(process.env.CHK_ATE || Infinity);
    // CHK_LISTA: arquivo com nomes EXATOS de mutações (um por linha) — roda só essas (para refazer só as que tinham escapado)
    const nomesDaLista = process.env.CHK_LISTA ? new Set(fs.readFileSync(process.env.CHK_LISTA, "utf8").split(String.fromCharCode(10)).map(s => s.trim()).filter(Boolean)) : null;
    const indices = todas.map((m, i) => i).filter(i => i >= de && i < ate && todas[i][0].includes(filtro) && (!nomesDaLista || nomesDaLista.has(todas[i][0])));
    if (conferir) {
      let ruins = 0;
      for (const i of indices) for (const [de] of paresDe(todas[i])) { const n = conferirAncora(todas[i][1], de); if (n !== 1) { ruins++; console.log(`âncora com ${n} ocorrência(s): ${todas[i][0]} :: ${JSON.stringify(de.slice(0, 90))}`); } }
      console.log(`${indices.length} mutações, ${ruins} âncora(s) que não casam exatamente uma vez`);
      process.exit(ruins ? 1 : 0);
    }
    // A rodada sem mutação vai num processo próprio (20/10/2026): feita aqui, o pai ficava com ~2 GB presos a prova inteira, somados aos filhos.
    const base = await new Promise((ok) => {
      const filho = fork(__filename, [], { execArgv: ["--max-old-space-size=2048"], env: Object.assign({}, process.env, { CHK_SO_BASE: "1" }) });
      let r = null;
      filho.on("message", (m) => { r = m; });
      filho.on("exit", () => ok(r || { total: 0, falhas: ["a rodada sem mutação não terminou (processo encerrado)"] }));
    });
    console.log(`base (sem mutação): ${base.total} verificações, ${base.falhas.length} falhas`);
    if (base.falhas.length) { base.falhas.forEach(f => console.log("  ✗ " + f)); process.exit(2); }
    const nProc = Math.max(1, Math.min(Number(process.env.CHK_PROCESSOS) || 6, indices.length));
    // Lotes de poucas mutações, cada lote num processo NOVO: cada mutação deixa um ambiente de tela na memória do processo e, numa lista longa, um único processo chegava a 4 GB e
    // estourava ("heap out of memory", 19/10/2026). CHK_LOTE = mutações por processo (padrão 4); nProc processos ao mesmo tempo.
    const tamanhoLote = Math.max(1, Number(process.env.CHK_LOTE) || 1);   // (era 4: cada mutação deixava ~1 GB e o processo chegava a ~3,8 GB; com 1 por processo o pico é de ~1,5 GB)
    const lotes = [];
    for (let k = 0; k < indices.length; k += tamanhoLote) lotes.push(indices.slice(k, k + tamanhoLote));
    const resultados = new Map();
    await Promise.all(Array.from({ length: nProc }, async () => {
      for (let lote = lotes.shift(); lote; lote = lotes.shift()) {
        await new Promise((ok) => {
          // Teto de memória por processo (20/10/2026): uma mutação que deixa o roteiro girando sem fim engolia memória sem limite durante os 90 s do tempo-limite (a memória livre chegou a 23 MB, o
          // commit passou de 43 GB e a máquina do responsável reiniciou com tela azul 0x10E). Com o teto o processo morre sozinho e a mutação conta como acusada ("estourou a memória").
          const filho = fork(__filename, [], { execArgv: ["--max-old-space-size=2048"], env: Object.assign({}, process.env, { CHK_MUT_INDICES: lote.join(",") }) });
          const paredeDura = setTimeout(() => { try { filho.kill(); } catch { } }, 150000 * lote.length);        // nenhum processo passa do tempo de parede, mesmo preso num laço síncrono
          filho.on("message", ({ i, r }) => { resultados.set(i, r); const rot = r.estado === "ACUSADA" ? `acusada (${String(r.n).padStart(2)})` : r.estado === "ESCAPOU" ? "ESCAPOU     " : "INAPLICÁVEL "; console.log(`${rot} ${r.nome}${r.detalhe ? "  <-  " + r.detalhe : ""}`); });
          filho.on("exit", () => {
            clearTimeout(paredeDura);
            // o que o processo não chegou a devolver (morreu pelo teto de memória ou pelo tempo de parede): o roteiro não termina nessa mutação, e isso é acusada (num CI ele reprovaria)
            for (const i of lote) {
              if (resultados.has(i)) continue;
              const r = { nome: todas[i][0], estado: "ACUSADA", detalhe: "o roteiro estourou a memória ou o tempo (processo encerrado)", n: 1 };
              resultados.set(i, r); console.log(`acusada ( 1) ${r.nome}  <-  ${r.detalhe}`);
            }
            ok();
          });
        });
      }
    }));
    const rs = indices.map(i => resultados.get(i)).filter(Boolean);
    const acusadas = rs.filter(r => r.estado === "ACUSADA").length, todasQueEscaparam = rs.filter(r => r.estado === "ESCAPOU"), inaplicaveis = rs.filter(r => r.estado === "INAPLICAVEL");
    const equivalentes = todasQueEscaparam.filter(r => equivalenteConhecido(r.nome)), escaparam = todasQueEscaparam.filter(r => !equivalenteConhecido(r.nome));
    console.log(`\nmutações: ${indices.length} · acusadas: ${acusadas} · escaparam: ${escaparam.length} · equivalentes conhecidas: ${equivalentes.length} · inaplicáveis: ${inaplicaveis.length}${rs.length < indices.length ? ` · sem resultado: ${indices.length - rs.length}` : ""}`);
    equivalentes.forEach(r => console.log(`  EQUIVALENTE: ${r.nome}  (${equivalenteConhecido(r.nome)[1]})`));
    escaparam.forEach(r => console.log("  ESCAPOU: " + r.nome));
    inaplicaveis.forEach(r => console.log("  INAPLICÁVEL: " + r.nome + " :: " + r.detalhe));
    process.exit(escaparam.length || inaplicaveis.length || rs.length < indices.length ? 1 : 0);
  })();
}
