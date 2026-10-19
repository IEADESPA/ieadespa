// mutacoes.js — desfaz, uma a uma, as garantias da tela do check-in infantil (v7.10): escape de cada campo do servidor, validação de cada formulário, limpeza do código de retirada em todo caminho,
// relógio de atualização, confirmações, permissões da liderança, foco e leitor de tela, ligações com a navegação e com o service worker. Cada mutação TEM de ser acusada (pelo menos uma falha no
// roteiro); uma que escapa mostra um buraco no roteiro. Âncora que não casa mais (ou casa mais de uma vez) = "INAPLICÁVEL", também reprovada.
//   node mutacoes.js              roda tudo, em vários processos (CHK_PROCESSOS=6 por padrão)
//   node mutacoes.js <filtro>     só as mutações cujo nome contém o filtro
//   node mutacoes.js --conferir   só confere se cada âncora casa exatamente uma vez (sem rodar o roteiro)
// Três grupos: (1) gerados do código — um por chamada de escaparHtmlEbd (a chamada some) e um por validação `if (...) { erro(...); return; }` (a condição vira falsa); (2) escritos à mão (abaixo);
// (3) os dois dos mutantes EQUIVALENTES de propósito (EQUIVALENTES) não entram na conta: defesa em dupla camada ou texto que nunca vem de fora, com o motivo escrito ao lado.
"use strict";
const path = require("path");
const { fork } = require("child_process");
const { lerApp } = require("./ambiente");

const P = "modulos/checkin-infantil.js", S = "script.js", D = "modulos/meus-dados.js", H = "index.html", C = "style.css", W = "service-worker.js";

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
  ["limpeza: sair da sala deixa o relógio rodando", P, "  const ctx = chkSala ? chkSala.ctx : null;\n  chkPararTimer(); chkPararBusca();", "  const ctx = chkSala ? chkSala.ctx : null;\n  chkPararBusca();"],
  ["limpeza: sair da sala não zera a impressão (o código)", P, "chkCi = null; chkImpressao = null; chkFalhas = 0; chkEmVoo = 0;\n  chkEmCurso.clear();\n  chkLimparImpressaoDaPagina();", "chkCi = null; chkFalhas = 0; chkEmVoo = 0;\n  chkEmCurso.clear();\n  chkLimparImpressaoDaPagina();"],
  ["limpeza: sair da sala deixa a sala no DOM (com os códigos)", P, "  [\"chkSalaMeu\", \"chkSalaGes\"].forEach(id => { const el = chkEl(id); if (el) el.innerHTML = \"\"; });\n  if (ctx) chkMostrarListas(ctx, true);", "  if (ctx) chkMostrarListas(ctx, true);"],
  ["limpeza: sair da sala não mostra a lista de salas de volta", P, "  if (ctx) chkMostrarListas(ctx, true);\n}", "}"],
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
  ["navegação: sair da aba da liderança deixa o relógio da fila rodando", P, "chkSeqApr++; if (!chkSala) chkPararTimer(); }", "chkSeqApr++; }"],
  ["navegação: sair da aba deixa a ficha na tela", P, "  const cx = chkEl(\"chkFichaCx\"); if (cx) cx.innerHTML = \"\";\n  const msg", "  const msg"],
  ["navegação: sair da aba deixa a matrícula da ficha", P, "  const campo = chkEl(\"chkFiMatricula\"); if (campo) campo.value = \"\";\n}", "}"],
  ["navegação: sair da aba não invalida a busca da ficha em andamento", P, "function chkSairDasFichas() {\n  chkSeqFicha++;", "function chkSairDasFichas() {"],

  // ---- o relógio de atualização
  ["relógio: o intervalo é de 30 s", P, "const CHK_INTERVALO_MS = 8000;", "const CHK_INTERVALO_MS = 30000;"],
  ["relógio: o tique não confere de quem é a tela", P, "  if (!authToken || chkDono !== chkChaveDoDono()) { chkPararTimer(); return; }", "  if (!authToken) { chkPararTimer(); return; }"],
  ["relógio: o tique não confere se a página está escondida", P, "  if (chkPaginaOculta()) { chkPararTimer(); return; }\n  if (chkSala) {", "  if (chkSala) {"],
  ["relógio: o tique não fecha a sala que saiu da tela", P, "    if (!chkContextoVisivel(chkSala.ctx)) { chkFecharSalaInterno(); return; }", ""],
  ["relógio: o tique não pára quando não há o que atualizar", P, "  if (chkAprovacoesVisiveis()) { chkCarregarAprovacoes(true); return; }\n  chkPararTimer();\n}", "  if (chkAprovacoesVisiveis()) { chkCarregarAprovacoes(true); return; }\n}"],
  ["relógio: a página escondida não pára o relógio", P, "  if (chkPaginaOculta()) { chkPararTimer(); return; }\n  if (!authToken || !chkTemOQueAtualizar()) return;", "  if (!authToken || !chkTemOQueAtualizar()) return;"],
  ["relógio: voltar ao navegador não lê a sala na hora", P, "  chkTique();\n  chkIniciarTimer();\n}\ndocument.addEventListener", "  chkIniciarTimer();\n}\ndocument.addEventListener"],
  ["relógio: voltar ao navegador não religa o relógio", P, "  chkTique();\n  chkIniciarTimer();\n}\ndocument.addEventListener", "  chkTique();\n}\ndocument.addEventListener"],
  ["relógio: não ouve a visibilidade da página", P, "document.addEventListener(\"visibilitychange\", chkVisibilidadeMudou);\n", ""],
  ["relógio: pode haver dois relógios", P, "function chkIniciarTimer() { if (chkTimer == null && !chkPaginaOculta()) chkTimer", "function chkIniciarTimer() { if (!chkPaginaOculta()) chkTimer"],
  ["relógio: nasce com a página escondida", P, "function chkIniciarTimer() { if (chkTimer == null && !chkPaginaOculta()) chkTimer", "function chkIniciarTimer() { if (chkTimer == null) chkTimer"],
  ["relógio: o intervalo não é limpo", P, "function chkPararTimer() { if (chkTimer != null) { clearInterval(chkTimer); chkTimer = null; } }", "function chkPararTimer() { chkTimer = null; }"],
  ["relógio: a tela só olha o próprio elemento (não os que o contêm)", P, "  for (let p = el; p && p.nodeType === 1; p = p.parentNode) if (p.style && p.style.display === \"none\") return false;\n  return true;\n}", "  return el.style.display !== \"none\";\n}"],
  ["relógio: a fila de aprovações vale em qualquer seção", P, "&& chkSecaoAtual === \"aprovacoes\" && chkVisivel(\"chkSecaoAprovacoes\")", "&& chkVisivel(\"chkSecaoAprovacoes\")"],
  ["relógio: o Meu Painel só confere a aba, não a sub-aba", P, "chkVisivel(\"abaMeupainel\") && chkVisivel(\"subMeupainelCheckininfantil\")", "chkVisivel(\"abaMeupainel\")"],
  ["leitura: os pedidos se empilham", P, "  if (!forcar && chkEmVoo > 0) return;   // o pedido anterior ainda não voltou: nunca se empilham pedidos", "  // (sem trava)"],
  ["leitura: a resposta velha vence a nova", P, "|| leitura !== chkSeqLeitura || !chkSala) return;", "|| !chkSala) return;"],
  ["leitura: 403/404/422 não tiram a pessoa da sala", P, "    if (data.httpStatus === 403 || data.httpStatus === 404 || data.httpStatus === 422) { chkSairDaSala(chkMsgErro(data), !!data.jaAvisado); return; }\n", ""],
  ["leitura: a sessão que acabou conta como falha de rede", P, "    if (data.sessaoExpirada) return;\n    chkFalhas++;\n    const parou = chkFalhas >= CHK_MAX_FALHAS;\n    chkEscrever(\"chkSalaMsg\"", "    chkFalhas++;\n    const parou = chkFalhas >= CHK_MAX_FALHAS;\n    chkEscrever(\"chkSalaMsg\""],
  ["leitura: o relógio nunca pára por falhas", P, "    const parou = chkFalhas >= CHK_MAX_FALHAS;\n    chkEscrever(\"chkSalaMsg\"", "    const parou = false;\n    chkEscrever(\"chkSalaMsg\""],
  ["leitura: o limite de falhas é 99", P, "const CHK_MAX_FALHAS = 3;", "const CHK_MAX_FALHAS = 99;"],
  ["leitura: parar por falhas não pára o intervalo", P, ", true);\n    if (parou) chkPararTimer();\n    return;", ", true);\n    return;"],
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
  ["sala: voltar com código não impresso não pergunta", P, "if (chkImpressao && !chkImpressao.impressa && !(await chkPerguntar(\"Há códigos de retirada", "if (false && !(await chkPerguntar(\"Há códigos de retirada"],
  ["sala: voltar sempre pergunta (mesmo com o código impresso)", P, "if (chkImpressao && !chkImpressao.impressa && !(await chkPerguntar(\"Há códigos de retirada", "if (chkImpressao && !(await chkPerguntar(\"Há códigos de retirada"],
  ["sala: voltar não devolve o foco ao botão de onde veio", P, "  chkFecharSalaInterno();\n  chkFocarId(gatilho);", "  chkFecharSalaInterno();"],
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
  ["check-in: sucesso sem etiquetas é tratado como sucesso", P, "    if (data.sucesso !== true || !Array.isArray(data.etiquetas) || !data.etiquetas.length) {", "    if (data.sucesso === false) {"],
  ["check-in: a recusa limpa o formulário", P, "      chkMostrarResultado(data, msg, true);\n      if (data.termoMudou) {", "      chkMostrarResultado(data, msg, true); chkLimparFormCheckin();\n      if (data.termoMudou) {"],
  ["check-in: 409 não lê a sala de novo", P, "      if (data.httpStatus === 409) chkLerSala(true);\n", ""],
  ["check-in: o texto da saúde que mudou não recarrega o catálogo", P, "chkGarantirCatalogos(true).then(() => { if (geracao !== chkGeracao || seqSala !== chkSeqSala) return;", "Promise.resolve().then(() => { if (geracao !== chkGeracao || seqSala !== chkSeqSala) return;"],
  ["check-in: o visitante com saúde segue na lista depois que o texto mudou", P, "chkEl(\"chkCiVisConcordo\"); if (c) c.checked = false; chkReabrirVisitantesComSaude(); });", "chkEl(\"chkCiVisConcordo\"); if (c) c.checked = false; });"],
  ["check-in: o visitante volta ao formulário por cima do que a pessoa digitava", P, "  const formVazio = !chkTexto(\"chkCiVisNome\") && !chkTexto(\"chkCiVisNasc\") && !chkTexto(\"chkCiVisSaude\");", "  const formVazio = true;"],
  ["check-in: o visitante não volta ao formulário", P, "  if (formVazio) {\n    const preencher", "  if (false) {\n    const preencher"],
  ["check-in: duplo clique em registrar vira dois pedidos", P, "  }, \"checkin\");", "  }, undefined);"],
  ["check-in: remover a criança não atualiza 'quem trouxe'", P, "  chkCi.criancas.splice(indice, 1);\n  chkAtualizarListaCheckin(); chkAtualizarTrouxe(); chkRenderResultados();", "  chkCi.criancas.splice(indice, 1);\n  chkAtualizarListaCheckin(); chkRenderResultados();"],
  ["check-in: a criança removida não volta aos resultados", P, "  chkCi.criancas.splice(indice, 1);\n  chkAtualizarListaCheckin(); chkAtualizarTrouxe(); chkRenderResultados();", "  chkCi.criancas.splice(indice, 1);\n  chkAtualizarListaCheckin(); chkAtualizarTrouxe();"],
  ["check-in: o selo de idade fora da faixa só na tela some", P, "chkNo(\"div\", \"chk-so-tela chk-aviso-faixa\"", "chkNo(\"div\", \"chk-aviso-faixa\""],
  ["check-in: o formulário do visitante não se limpa depois de adicionar", P, "  [\"chkCiVisNome\", \"chkCiVisNasc\", \"chkCiVisSaude\"].forEach(id => { const el = chkEl(id); if (el) el.value = \"\"; });\n", ""],

  // ---- a etiqueta e o recibo (o código só existe aqui)
  ["etiqueta: imprimir não marca como impresso", P, "  chkImpressao.impressa = true;\n}", "}"],
  ["etiqueta: as classes de impressão ficam no <body> depois de imprimir", P, "try { window.print(); } finally { if (classes) classes.remove(\"chk-imprimindo\", \"chk-imp-etiquetas\"); }", "try { window.print(); } finally { }"],
  ["etiqueta: imprimir usa as classes do relatório", P, "classes.add(\"chk-imprimindo\", \"chk-imp-etiquetas\");", "classes.add(\"chk-imprimindo\", \"chk-imp-relatorio\");"],
  ["relatório: imprimir usa as classes das etiquetas", P, "classes.add(\"chk-imprimindo\", \"chk-imp-relatorio\");", "classes.add(\"chk-imprimindo\", \"chk-imp-etiquetas\");"],
  ["relatório: as classes ficam no <body> depois de imprimir", P, "try { window.print(); } finally { if (classes) classes.remove(\"chk-imprimindo\", \"chk-imp-relatorio\"); }", "try { window.print(); } finally { }"],
  ["etiqueta: um segundo lote some com o primeiro (perde o código)", P, "  if (!chkImpressao) chkImpressao = { lotes: [], impressa: false };", "  chkImpressao = { lotes: [], impressa: false };"],
  ["etiqueta: um lote novo conta como já impresso", P, "  chkImpressao.impressa = false;\n  chkRenderImpressao(true);", "  chkRenderImpressao(true);"],
  ["etiqueta: o painel não recebe o foco", P, "  if (comFoco) { chkRolarPara(\"chkImpressaoCx\"); chkFocarId(\"chkImpressaoTitulo\"); }", "  if (comFoco) { }"],
  ["etiqueta: a saúde não sai na etiqueta", P, "  if (et.saude) {", "  if (false) {"],
  ["etiqueta: o texto entra como marcação (createElement + innerHTML)", P, "  if (texto != null) el.textContent = String(texto);", "  if (texto != null) el.innerHTML = String(texto);"],
  ["etiqueta: fechar sem imprimir não pergunta", P, "  if (!chkImpressao.impressa && !(await chkPerguntar(\"Os códigos de retirada ainda NÃO", "  if (false && !(await chkPerguntar(\"Os códigos de retirada ainda NÃO"],
  ["etiqueta: fechar não apaga a variável do código", P, "  chkImpressao = null;\n  chkRenderImpressao(false);", "  chkRenderImpressao(false);"],
  ["etiqueta: fechar não apaga o código da tela", P, "  chkImpressao = null;\n  chkRenderImpressao(false);\n  chkLimparImpressaoDaPagina();", "  chkImpressao = null;\n  chkLimparImpressaoDaPagina();"],
  ["etiqueta: fechar não devolve o foco", P, "  chkLimparImpressaoDaPagina();\n  chkFocarId(\"chkSalaTitulo\");\n}", "  chkLimparImpressaoDaPagina();\n}"],
  ["etiqueta: o código vai para o armazenamento do navegador", P, "  chkImpressao.impressa = false;\n  chkRenderImpressao(true);", "  chkImpressao.impressa = false; try { sessionStorage.setItem(\"chkUltimoLote\", JSON.stringify(itens)); } catch (e) { /* */ }\n  chkRenderImpressao(true);"],
  ["etiqueta: o código vai para o console", P, "  chkImpressao.impressa = false;\n  chkRenderImpressao(true);", "  chkImpressao.impressa = false; console.log(JSON.stringify(itens));\n  chkRenderImpressao(true);"],
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
  ["retirada: o painel abre para quem não está na sala", P, "  if (!c || !area || !chkSala || !chkPodeOperar() || !chkCatalogos) return;\n  chkAcao = { tipo: \"retirada\"", "  if (!c || !area || !chkSala || !chkCatalogos) return;\n  chkAcao = { tipo: \"retirada\""],
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
  ["segunda via: o painel abre para quem não está na sala", P, "  if (!c || !area || !chkSala || !chkPodeOperar() || !chkCatalogos) return;\n  chkAcao = { tipo: \"segundavia\"", "  if (!c || !area || !chkSala || !chkCatalogos) return;\n  chkAcao = { tipo: \"segundavia\""],
  ["segunda via: a pessoa pode ser 'outra' (não só quem já retira)", P, "<select id=\"chkSvQuem\">${chkOpcoesPessoas(c, false)}</select>", "<select id=\"chkSvQuem\">${chkOpcoesPessoas(c, true)}</select>"],

  // ---- a liderança
  ["liderança: decidir sem a confirmação", P, "if (!(await chkPerguntar(pergunta, aprovar ?", "if (false && !(await chkPerguntar(pergunta, aprovar ?"],
  ["liderança: o motivo curto demais é aceito", P, "    if (motivo.length >= CHK_MIN_MOTIVO && motivo.length <= CHK_MAX_MOTIVO && !chkTemMarca(motivo)) break;", "    break;"],
  ["liderança: o motivo mínimo é 1", P, "const CHK_MIN_MOTIVO = 8, CHK_MAX_MOTIVO = 300;", "const CHK_MIN_MOTIVO = 1, CHK_MAX_MOTIVO = 300;"],
  ["liderança: o motivo máximo é 3000", P, "const CHK_MIN_MOTIVO = 8, CHK_MAX_MOTIVO = 300;", "const CHK_MIN_MOTIVO = 8, CHK_MAX_MOTIVO = 3000;"],
  ["liderança: o motivo com < ou > é aceito", P, "motivo.length <= CHK_MAX_MOTIVO && !chkTemMarca(motivo)) break;", "motivo.length <= CHK_MAX_MOTIVO) break;"],
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
  ["liderança: as aprovações não ligam o relógio", P, "  chkRenderAprovacoes();\n  chkIniciarTimer();\n}", "  chkRenderAprovacoes();\n}"],
  ["liderança: as aprovações não contam falhas", P, "function chkFalhaDasAprovacoes(resposta, catalogo, silencioso) {\n  if (resposta && resposta.sessaoExpirada) return;\n  chkFalhas++;", "function chkFalhaDasAprovacoes(resposta, catalogo, silencioso) {\n  if (resposta && resposta.sessaoExpirada) return;"],
  ["liderança: três falhas nas aprovações não param o relógio", P, "  if (parou) chkPararTimer();\n}\n\nregistrarAcoes", "}\n\nregistrarAcoes"],
  ["liderança: a fila de aprovações vale para quem não é da liderança", P, "async function chkCarregarAprovacoes(silencioso) {\n  chkVerificarDono();\n  if (!chkPodeAba() || chkSala) return;", "async function chkCarregarAprovacoes(silencioso) {\n  chkVerificarDono();\n  if (chkSala) return;"],
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
  ["servidor: a resposta que não é objeto é aceita", P, "    if (!corpo || typeof corpo !== \"object\" || Array.isArray(corpo)) return { sucesso: false, mensagem: `Resposta inesperada do servidor (${res.status}).`, httpStatus: res.status };\n", ""],
  ["servidor: o resultado sempre faz toast (aviso duplicado)", P, "  if (!(data && data.jaAvisado)) mostrarToast(texto, data && data.sucesso === false ? \"erro\" : \"sucesso\");", "  mostrarToast(texto, data && data.sucesso === false ? \"erro\" : \"sucesso\");"],
  ["servidor: o resultado nunca faz toast", P, "  if (!(data && data.jaAvisado)) mostrarToast(texto, data && data.sucesso === false ? \"erro\" : \"sucesso\");", ""],
  ["servidor: o resultado de erro vai como sucesso", P, "  if (!(data && data.jaAvisado)) mostrarToast(texto, data && data.sucesso === false ? \"erro\" : \"sucesso\");", "  if (!(data && data.jaAvisado)) mostrarToast(texto, \"sucesso\");"],
  ["servidor: a mensagem de erro some na tela quando já foi avisada", P, "  chkEscrever(idMensagem, texto, destaque || !!(data && data.sucesso === false));", "  if (!(data && data.jaAvisado)) chkEscrever(idMensagem, texto, destaque || !!(data && data.sucesso === false));"],
  ["servidor: o erro na tela não fica em destaque", P, "  chkEscrever(idMensagem, texto, destaque || !!(data && data.sucesso === false));", "  chkEscrever(idMensagem, texto, destaque);"],
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
  ["ligação: a aba não tem ajuda", S, "  checkininfantil: \"Check-in infantil (ECA arts. 70 e 70-A;", "  checkininfantil_X: \"Check-in infantil (ECA arts. 70 e 70-A;"],
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
  ["css: a alergia não destaca na tela", C, ".chk-alergia { font-weight: 800; font-size: 1.05rem; color: #fff; background: var(--cor-erro);", ".chk-alergia { font-weight: 400; font-size: 1.05rem; color: #fff; background: var(--cor-erro);"]
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
  try { T = await Promise.race([rodar({ mutar: { [m[1]]: pares } }), new Promise((_, rej) => setTimeout(() => rej(new Error("TRAVOU (mais de 150 s)")), 150000))]); }
  catch (e) { return { nome: m[0], estado: "INAPLICAVEL", detalhe: e.message.slice(0, 160) }; }
  if (T.falhas.some(f => /mutação inaplicável/.test(f))) return { nome: m[0], estado: "INAPLICAVEL", detalhe: T.falhas.find(f => /mutação inaplicável/.test(f)).slice(0, 160) };
  if (T.falhas.length) return { nome: m[0], estado: "ACUSADA", detalhe: T.falhas[0].slice(0, 120), n: T.falhas.length };
  return { nome: m[0], estado: "ESCAPOU" };
}

if (process.env.CHK_MUT_INDICES) {
  // processo filho: roda as mutações dos índices recebidos e devolve cada resultado ao pai
  const lista = montarLista();
  const vivo = setInterval(() => {}, 1000);
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
    const indices = todas.map((m, i) => i).filter(i => todas[i][0].includes(filtro));
    if (conferir) {
      let ruins = 0;
      for (const i of indices) for (const [de] of paresDe(todas[i])) { const n = conferirAncora(todas[i][1], de); if (n !== 1) { ruins++; console.log(`âncora com ${n} ocorrência(s): ${todas[i][0]} :: ${JSON.stringify(de.slice(0, 90))}`); } }
      console.log(`${indices.length} mutações, ${ruins} âncora(s) que não casam exatamente uma vez`);
      process.exit(ruins ? 1 : 0);
    }
    const { rodar } = require("./roteiro");
    const base = await rodar({});
    console.log(`base (sem mutação): ${base.total} verificações, ${base.falhas.length} falhas`);
    if (base.falhas.length) { base.falhas.forEach(f => console.log("  ✗ " + f)); process.exit(2); }
    const nProc = Math.max(1, Math.min(Number(process.env.CHK_PROCESSOS) || 6, indices.length));
    const grupos = Array.from({ length: nProc }, () => []);
    indices.forEach((i, k) => grupos[k % nProc].push(i));
    const resultados = new Map();
    await Promise.all(grupos.map(g => new Promise((ok) => {
      const filho = fork(__filename, [], { env: Object.assign({}, process.env, { CHK_MUT_INDICES: g.join(",") }) });
      filho.on("message", ({ i, r }) => { resultados.set(i, r); const rot = r.estado === "ACUSADA" ? `acusada (${String(r.n).padStart(2)})` : r.estado === "ESCAPOU" ? "ESCAPOU     " : "INAPLICÁVEL "; console.log(`${rot} ${r.nome}${r.detalhe ? "  <-  " + r.detalhe : ""}`); });
      filho.on("exit", () => ok());
    })));
    const rs = indices.map(i => resultados.get(i)).filter(Boolean);
    const acusadas = rs.filter(r => r.estado === "ACUSADA").length, escaparam = rs.filter(r => r.estado === "ESCAPOU"), inaplicaveis = rs.filter(r => r.estado === "INAPLICAVEL");
    console.log(`\nmutações: ${indices.length} · acusadas: ${acusadas} · escaparam: ${escaparam.length} · inaplicáveis: ${inaplicaveis.length}${rs.length < indices.length ? ` · sem resultado: ${indices.length - rs.length}` : ""}`);
    escaparam.forEach(r => console.log("  ESCAPOU: " + r.nome));
    inaplicaveis.forEach(r => console.log("  INAPLICÁVEL: " + r.nome + " :: " + r.detalhe));
    process.exit(escaparam.length || inaplicaveis.length || rs.length < indices.length ? 1 : 0);
  })();
}
