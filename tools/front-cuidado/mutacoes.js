// mutacoes.js — desfaz, uma a uma, as garantias da tela da v7.11 (Cuidado pastoral): escape de cada campo do servidor, validação de cada formulário, a limpeza ao sair da aba, da
// sub-aba e da sessão (o texto da nota pastoral, o pedido de oração, a fila), cada trava contra a resposta atrasada (geração e sequência), a trava de duplo clique de cada ato, o
// tratamento de 403/404/409/428/429, os telefones de ajuda, o "a liderança foi avisada" que só o servidor pode dizer, o nome e o texto que nunca vão para endereço, o foco e o
// leitor de tela, e as ligações com a navegação (script.js, meus-dados.js e index.html). Cada mutação TEM de ser acusada (pelo menos uma falha no roteiro); uma que escapa mostra
// um buraco no roteiro. Âncora que não casa mais (ou casa mais de uma vez) = "INAPLICÁVEL", também reprovada.
//   node mutacoes.js              roda tudo, UMA mutação por vez, cada uma num processo novo (nunca em paralelo: ver abaixo)
//   node mutacoes.js <filtro>     só as mutações cujo nome contém o filtro
//   node mutacoes.js --conferir   só confere se cada âncora casa exatamente uma vez (sem rodar o roteiro)
//   CPA_DE / CPA_ATE              só as mutações de índice [DE, ATE) (rodar a lista em pedaços curtos)
//   CPA_LISTA=<arquivo>           só as mutações com estes nomes exatos (um por linha), para refazer as que tinham escapado
// Três grupos: (1) gerados do código — um por chamada de escaparHtmlEbd (a chamada some), um por trava de resposta atrasada (`seq !== cpaSeq...` e `geracao !== cpaGeracao` viram
// false), um por chave da trava de duplo clique (a chave some) e um por validação `if (...) problema = ...` / `if (...) return { problema: ... }` (a condição vira falsa); (2) escritos à mão
// (abaixo); (3) as EQUIVALENTES_CONHECIDAS: escapam de propósito (defesa em dupla camada ou texto que nunca vem de fora), com o motivo escrito ao lado, e não reprovam a prova.
//
// SEGURANÇA DA MÁQUINA (incidente de 19/10/2026, tools/front-checkin/mutacoes.js): um mutante que deixava o roteiro girando sem fim engoliu a memória inteira (a memória livre chegou a
// 23 MB, o commit passou de 43 GB) e o notebook do responsável reiniciou com tela azul. Por isso, aqui:
//   - cada mutação roda num processo NOVO (fork), com teto de memória do V8 (--max-old-space-size=2048) e uma segunda cerca de memória fora do monte (rss > 2,4 GB: o filho sai);
//   - o pai mata o filho que passar de 120 s de parede (mesmo preso num laço síncrono, que o tempo-limite de dentro não pega);
//   - UM processo por vez (sem paralelo) e a rodada sem mutação também num processo próprio (o pai não guarda ambiente de tela nenhum);
//   - o processo que morre pelo teto ou pelo tempo conta como ACUSADA (num CI o roteiro não terminaria e reprovaria).
"use strict";
const fs = require("fs");
const { fork } = require("child_process");
const { lerApp } = require("./ambiente");

const P = "modulos/cuidado-pastoral.js", S = "script.js", D = "modulos/meus-dados.js", H = "index.html", C = "style.css";
const TETO_MEMORIA = ["--max-old-space-size=2048"];
const PAREDE_MS = 120000;          // o pai mata o filho depois disto
const TRAVOU_MS = 90000;           // dentro do filho: o roteiro que não termina (espera sem fim) conta como acusada

// ------------------------------------------------------------ (1) gerados do código
function contextoUnico(codigo, ini, fim) {
  let a = ini, b = fim;
  for (let k = 0; k < 60; k++) {
    if (codigo.split(codigo.slice(a, b)).length - 1 === 1) return [a, b];
    a = Math.max(0, a - 10); b = Math.min(codigo.length, b + 10);
  }
  throw new Error(`contexto não único na posição ${ini}`);
}
const linhaDe = (codigo, pos) => codigo.slice(0, pos).split("\n").length;
// uma chamada de escaparHtmlEbd(...) vira só (...)
function gerarEscapes(codigo) {
  const out = [], marca = "escaparHtmlEbd(";
  let pos = 0;
  while ((pos = codigo.indexOf(marca, pos)) >= 0) {
    let nivel = 0, j = pos + marca.length - 1;
    for (; j < codigo.length; j++) { const ch = codigo[j]; if (ch === "(") nivel++; else if (ch === ")") { nivel--; if (nivel === 0) break; } }
    const arg = codigo.slice(pos + marca.length, j);
    const [a, b] = contextoUnico(codigo, pos, j + 1);
    const de = codigo.slice(a, b), para = codigo.slice(a, pos) + "(" + arg + ")" + codigo.slice(j + 1, b);
    out.push([`escape (linha ${linhaDe(codigo, pos)}): ${codigo.slice(pos, j + 1).slice(0, 72)}`, P, de, para]);
    pos = j + 1;
  }
  return out;
}
// cada trava da resposta atrasada (`seq !== cpaSeqX` e `geracao !== cpaGeracao`) vira `false`
function gerarTravasDeResposta(codigo) {
  const out = [];
  for (const re of [/seq !== cpaSeq[A-Za-z]+/g, /geracao !== cpaGeracao/g]) {
    let m;
    while ((m = re.exec(codigo))) {
      const [a, b] = contextoUnico(codigo, m.index, m.index + m[0].length);
      const de = codigo.slice(a, b), para = codigo.slice(a, m.index) + "false" + codigo.slice(m.index + m[0].length, b);
      const linha = codigo.split("\n")[linhaDe(codigo, m.index) - 1].trim();
      out.push([`resposta velha (linha ${linhaDe(codigo, m.index)}): ${m[0]} em "${linha.slice(0, 70)}"`, P, de, para]);
    }
  }
  return out;
}
// a chave da trava de duplo clique de cada ato (o 3º argumento de cpaProteger) some
function gerarChavesDuploClique(codigo) {
  const out = [];
  const re = /\n  \}, (`[a-z-]+(?:\$\{[A-Za-z]+\})?`|"[a-z-]+")\);\n/g;
  let m;
  while ((m = re.exec(codigo))) {
    const ini = m.index + 1, fim = m.index + m[0].length - 1;
    const [a, b] = contextoUnico(codigo, ini, fim);
    const de = codigo.slice(a, b), para = codigo.slice(a, ini) + "  }, undefined);" + codigo.slice(fim, b);
    out.push([`duplo clique (linha ${linhaDe(codigo, ini)}): a chave ${m[1]} some`, P, de, para]);
  }
  return out;
}
// a validação de cada formulário: `if (X) problema = ...`, `else if (X) problema = ...` e `if (X) return { problema: ... }` (a condição vira falsa)
function gerarValidacoes(codigo) {
  const out = [];
  codigo.split("\n").forEach((linha, i) => {
    const m = /^(\s*)(?:else )?if \((.+?)\) (problema = |return \{ problema: )/.exec(linha);
    if (!m || codigo.split(linha).length - 1 !== 1) return;
    out.push([`validação removida (linha ${i + 1}): ${m[2].slice(0, 72)}`, P, linha, linha.replace(`if (${m[2]}) ${m[3]}`, `if (false && (${m[2]})) ${m[3]}`)]);
  });
  return out;
}

// cada campo de texto livre (textarea e input de texto) perde o spellcheck="false" (o corretor do navegador manda o texto para fora) e, à parte, o autocomplete="off" (o navegador
// guarda o que foi digitado — nome, nota, pedido — e oferece de novo a quem usar o aparelho depois)
function gerarCamposPrivados(codigo) {
  const out = [];
  const re = /<(?:textarea|input type="text")[^>]*>/g;
  let m;
  while ((m = re.exec(codigo))) {
    const tag = m[0], id = (/id="([^"]+)"/.exec(tag) || [])[1] || "?";
    for (const attr of [' spellcheck="false"', ' autocomplete="off"']) {
      if (!tag.includes(attr)) continue;
      const [a, b] = contextoUnico(codigo, m.index, m.index + tag.length);
      const de = codigo.slice(a, b), para = codigo.slice(a, m.index) + tag.replace(attr, "") + codigo.slice(m.index + tag.length, b);
      out.push([`campo privado (linha ${linhaDe(codigo, m.index)}): ${id} sem${attr}`, P, de, para]);
    }
  }
  return out;
}

// Mutantes que ESCAPAM e são EQUIVALENTES de propósito (o resumo os mostra, com o motivo, e eles não reprovam a prova): [regra sobre o nome, motivo]. O número de linha muda a cada edição do módulo.
const EQUIVALENTES_CONHECIDAS = [
  [/^sair da aba: o acompanhamento continua à vista e a fila escondida$/, "cpaFecharDetalheInterno(\"Ges\"), chamado logo acima na mesma função, já esconde cpaDetalheGesCx e mostra cpaFilaCx sempre: as duas linhas repetem o que ele fez"],
  [/^viva: a marca não confere o login \(geração\)$/, "todo cpaGeracao++ está em cpaLimparTela, que sempre chama cpaFecharGestao e cpaFecharMeu (cpaGerGes++ e cpaGerMeu++): quando a geração muda, a marca da aba/sub-aba (m.t) também já mudou — defesa em dupla camada"],
  [/^viva: depois do ato, a releitura acontece fora da tela$/, "o único chamador (cpaTratarAto) confere cpaViva(marca) sem await no meio, logo antes; e cpaCarregarDetalhe confere de novo — defesa em dupla camada"],
  [/^sair da aba: as respostas a caminho \(fila, pedidos, boletim, painel, busca\) entram depois$/, "o cpaGerGes++ da mesma função já invalida a marca de cada uma dessas leituras (todas conferem cpaViva(marca) na volta): as sequências são a segunda camada"],
  [/^sair da sub-aba: ('meus pedidos'|o boletim|'meus' relido) a caminho entra depois$/, "o cpaGerMeu++ da mesma função já invalida a marca dessas leituras (todas conferem cpaViva(marca) na volta): a sequência é a segunda camada"],
  [/^sessão: a classe de impressão do login anterior fica$/, "cpaLimparTela chama cpaFecharGestao, que já chama cpaLimparImpressao: a última chamada repete a primeira"],
  [/^talvez: o pedido em mãos sem resposta perde o aviso depois de reler$/, "a releitura dos pedidos (cpaCarregarPedidosAcao) nunca escreve em cpaRpMsg: reescrever o aviso depois dela repete o que já está lá"],
  [/^nota: guardada, o texto fica no campo$/, "a linha seguinte (cpaEsvaziar([\"cpaNotaForm\"])) tira da página o formulário inteiro, com o campo: o valor apagado antes não tem onde aparecer"],
  [/^nota: a nota aberta de outro acompanhamento entra no de agora$/, "toda troca de acompanhamento passa por cpaLimparNota (cpaFecharDetalheInterno e cpaCarregarDetalhe), que sobe cpaSeqNota: a sequência já descarta a resposta — a conferência do item é a segunda camada"],
  [/^nota: abrir não fecha a nota anterior \(as duas se somam\)$/, "cpaAbrirNotaAcao chama cpaLimparNota (que esvazia cpaNotaCorpo) antes de pedir a nota: o corpo já está vazio quando cpaMostrarNota o esvazia de novo"],
  [/^nota: refazer a lista não invalida 'Quem abriu' a caminho$/, "refazer a lista troca o elemento cpaLeit<id>: a conferência alvo !== cx descarta a resposta — defesa em dupla camada (as duas juntas são acusadas pelo cenário 'Prova de mutação: notas')"],
  [/^resposta velha \(linha \d+\): seq !== cpaSeqLeit em /, "a mesma dupla camada de 'Quem abriu': sem a sequência, a conferência alvo !== cx (o elemento da lista refeita é outro) descarta a resposta"],
  [/^seção: sair dos pedidos não descarta a resposta a caminho$/, "a volta também confere cpaSecaoViva(\"pedidos\"), e voltar à seção faz um pedido novo com sequência maior: a resposta velha nunca entra"],
  [/^seção: sair da fila não descarta a fila a caminho$/, "a volta também confere cpaSecaoViva(\"fila\"), e voltar à seção faz um pedido novo com sequência maior: a resposta velha nunca entra"],
  [/^seção: abrir a aba não volta à lista \(a nota aberta fica à espera\)$/, "cpaMostrarSecaoAcao, chamado logo depois, também chama cpaFecharDetalheInterno(\"Ges\"): a primeira chamada é a segunda camada"],
  [/^ato: o 409 não fica em destaque$/, "cpaDepoisDoAto escreve com destaque `!!destaque || data.sucesso === false`, e o 409 sempre vem com sucesso: false: o destaque sai igual com o argumento false"],
  [/^escape \(linha \d+\): escaparHtmlEbd\(calData(Hora)?\(valor\)\)$/, "calData/calDataHora devolvem '—', a data formatada pelo toLocale (só algarismos, barras, espaço e dois-pontos) ou formatarDataEbd, que já escapa cada pedaço: o escape de fora é a segunda camada"],
  [/^resposta velha \(linha \d+\): geracao !== cpaGeracao em "if \(geracao !== cpaGeracao \|\| !cpaDet \|\| id !== cpaDet\.itemId\) return;"$/, "a área do formulário foi lida antes do await: com a troca de login o acompanhamento é redesenhado e ela sai da página, então o formulário iria para um elemento desligado (nada aparece); a conferência da geração é a segunda camada"],
  [/^pedidos: a recusa que chega depois de sair da aba é pintada$/, "os quatro chamadores de cpaFalhaDoPedido conferem cpaViva(marca) logo antes, sem await no meio — defesa em dupla camada"]
];
const equivalenteConhecido = (nome) => EQUIVALENTES_CONHECIDAS.find(([re]) => re.test(nome)) || null;
// o argumento destas chamadas de escape é constante do código, número, só algarismos ou data já escapada: a mutação não muda nada que alguém de fora controle (saem da lista)
const ESCAPES_DE_CONSTANTE = [
  /escaparHtmlEbd\(placeholder\)/,                // o texto do "Escolha..." é sempre uma constante nossa
  /escaparHtmlEbd\(digitos\)/,                    // só algarismos (replace(/\D/g, ""))
  /escaparHtmlEbd\(min\)/, /escaparHtmlEbd\(max\)/, /escaparHtmlEbd\(hoje\)/,   // datas AAAA-MM-DD calculadas aqui (calSomarDias / cpaHojeDe)
  /escaparHtmlEbd\(CPA_MSG_PEDIDO_NAO_FOI\)/,     // constante nossa
  /escaparHtmlEbd\(cpaNumeroOuTraco\(v\)\)/,       // número ou "—"
  /escaparHtmlEbd\(calData\(calHojeBrasilia\(\)\)\)/,  // a data de hoje do relógio do aparelho
  /escaparHtmlEbd\(CPA_MSG_SO_AREA\)/,             // constante nossa ("da Área para cima")
  /escaparHtmlEbd\(cpaPedidoTalvez\(data\) \? CPA_MSG_PEDIDO_TALVEZ/   // uma das duas constantes nossas ("não sabemos se chegou" / "NÃO foi enviado")
];

// ------------------------------------------------------------ (2) à mão
const MANUAIS = [
  // ---- permissões e papéis
  ["papel: a aba carrega sem a permissão cuidado_pastoral", P, "function cpaPodeAba() { return authPermissoes.includes(\"cuidado_pastoral\"); }", "function cpaPodeAba() { return true; }"],
  ["papel: quem não é gestão vira gestão (o catálogo é ignorado)", P, "function cpaEhGestao() { return !!(cpaCatalogos && cpaCatalogos.papeis.gestao); }", "function cpaEhGestao() { return !!cpaCatalogos; }"],
  ["papel: ninguém é nível geral", P, "function cpaEhGeral() { return !!(cpaCatalogos && cpaCatalogos.papeis.geral); }", "function cpaEhGeral() { return false; }"],
  ["papel: todos são nível geral", P, "function cpaEhGeral() { return !!(cpaCatalogos && cpaCatalogos.papeis.geral); }", "function cpaEhGeral() { return !!cpaCatalogos; }"],
  ["papel: o catálogo diz gestão para todos", P, "papeis: { gestao: !!papeis.gestao, geral:", "papeis: { gestao: true, geral:"],
  ["papel: o catálogo diz 'da Área para cima' para todos", P, "acima: !!papeis.acima }", "acima: true }"],
  ["papel: o catálogo nunca diz 'da Área para cima'", P, "acima: !!papeis.acima }", "acima: false }"],
  ["papel: cpaEhAcima vale para toda gestão", P, "function cpaEhAcima() { return !!(cpaCatalogos && cpaCatalogos.papeis.acima); }", "function cpaEhAcima() { return !!(cpaCatalogos && cpaCatalogos.papeis.gestao); }"],
  ["acima: o pedido com risco mostra Desmarcar a quem não é da Área", P, "      ${risco ? (cpaEhAcima() ? `<button", "      ${risco ? (true ? `<button"],
  ["acima: o pedido com risco nunca mostra Desmarcar", P, "      ${risco ? (cpaEhAcima() ? `<button", "      ${risco ? (false ? `<button"],
  ["acima: o pedido com risco não diz a quem pedir o Desmarcar", P, "        : `<p class=\"psc-legenda cpa-so-area\" role=\"note\">${escaparHtmlEbd(CPA_MSG_SO_AREA)}</p>`)\n", "        : \"\")\n"],
  ["acima: o acompanhamento urgente mostra Cancelar a quem não é da Área", P, "    ${d.item.urgente && !cpaEhAcima() ? `<p", "    ${false ? `<p"],
  ["acima: o acompanhamento comum esconde Cancelar de quem não é da Área", P, "    ${d.item.urgente && !cpaEhAcima() ? `<p", "    ${!cpaEhAcima() ? `<p"],
  ["acima: o acompanhamento urgente esconde Cancelar até da Área", P, "    ${d.item.urgente && !cpaEhAcima() ? `<p", "    ${d.item.urgente ? `<p"],
  ["acima: o acompanhamento urgente não diz a quem pedir o Cancelar", P, "    ${d.item.urgente && !cpaEhAcima() ? `<p class=\"psc-legenda cpa-so-area\" role=\"note\">${escaparHtmlEbd(CPA_MSG_SO_AREA)}</p>`", "    ${d.item.urgente && !cpaEhAcima() ? \"\""],
  ["papel: o servidor diz que não é gestão e a tela segue", P, "  if (!catalogo.papeis.gestao) {\n    cpaMostrar(\"cpaSemAcesso\", true);", "  if (false) {\n    cpaMostrar(\"cpaSemAcesso\", true);"],
  ["papel: sem gestão o aviso 'sem acesso' não aparece", P, "  if (!catalogo.papeis.gestao) {\n    cpaMostrar(\"cpaSemAcesso\", true);", "  if (!catalogo.papeis.gestao) {\n    cpaMostrar(\"cpaSemAcesso\", false);"],
  ["papel: o responsável recebe Trocar/Adiar/Cancelar", P, "    ${d.podeGerir ? `<button type=\"button\" class=\"btn-confirmar btn-secundario cpa-btn\" data-on-click=\"cpaAbrirFormAcao\" data-args-click=\"${argsAttr(\"responsavel\"", "    ${true ? `<button type=\"button\" class=\"btn-confirmar btn-secundario cpa-btn\" data-on-click=\"cpaAbrirFormAcao\" data-args-click=\"${argsAttr(\"responsavel\""],
  ["papel: o formulário de gestão abre para quem não gere (sem a trava)", P, "  if ([\"responsavel\", \"adiar\", \"cancelar\"].includes(tipo) && !gerir) return;\n", ""],
  ["papel: o responsável escreve em todo nível de nota", P, "  return (cpaCatalogos ? cpaCatalogos.niveisNota : []).filter(n => pode.includes(n.codigo));", "  return (cpaCatalogos ? cpaCatalogos.niveisNota : []);"],
  ["papel: 'Quem abriu' em toda nota", P, "  const verLeituras = n.minha === true || cpaEhGeral();", "  const verLeituras = true;"],
  ["papel: o adiar não confere podeGerir", P, "async function cpaEnviarAdiarAcao(botao) {\n  if (!cpaDet || !cpaDet.dados.podeGerir) return;", "async function cpaEnviarAdiarAcao(botao) {\n  if (!cpaDet) return;"],
  ["papel: a troca não confere podeGerir", P, "async function cpaEnviarTrocaAcao(responsavelMembroId, botao) {\n  if (!cpaDet || !cpaDet.dados.podeGerir) return;", "async function cpaEnviarTrocaAcao(responsavelMembroId, botao) {\n  if (!cpaDet) return;"],
  ["papel: o cancelar não confere podeGerir", P, "  if (!cpaDet || !cpaDet.dados.podeGerir || !cpaCatalogos) return;", "  if (!cpaDet || !cpaCatalogos) return;"],
  ["papel: o detalhe da liderança abre sem gestão", P, "  if (ctx === \"Ges\" && !cpaEhGestao()) return;\n  cpaFecharDetalheInterno(ctx === \"Ges\" ? \"Meu\" : \"Ges\");", "  cpaFecharDetalheInterno(ctx === \"Ges\" ? \"Meu\" : \"Ges\");"],

  // ---- utilidades
  ["texto: < e > deixam de ser barrados", P, "function cpaTemMarca(texto) { return /[<>]/.test(texto); }", "function cpaTemMarca(texto) { return false; }"],
  ["texto: o mínimo de letras não é conferido", P, "  if (texto.length < min) return", "  if (false) return"],
  ["texto: o máximo de caracteres não é conferido", P, "  if (texto.length > max) return", "  if (false) return"],
  ["texto: o campo obrigatório vazio passa", P, "  if (!texto) return obrigatorio ? `Escreva ${nome}.` : \"\";", "  if (!texto) return \"\";"],
  ["texto: o sim/não sem escolha vira 'não'", P, "  if (nao && nao.checked) return false;\n  return null;", "  if (nao && nao.checked) return false;\n  return false;"],
  ["texto: o sim/não sem escolha vira 'sim'", P, "  if (nao && nao.checked) return false;\n  return null;", "  if (nao && nao.checked) return false;\n  return true;"],

  // ---- a trava de duplo clique e o botão travado
  ["duplo clique: o segundo toque não é barrado", P, "    if (cpaEmCurso.has(chave)) { mostrarToast(\"Aguarde: o pedido anterior ainda está sendo processado.\", \"erro\"); return undefined; }\n", ""],
  ["duplo clique: o segundo toque é barrado sem avisar", P, "    if (cpaEmCurso.has(chave)) { mostrarToast(\"Aguarde: o pedido anterior ainda está sendo processado.\", \"erro\"); return undefined; }", "    if (cpaEmCurso.has(chave)) { return undefined; }"],
  ["duplo clique: a chave não entra na trava", P, "    cpaEmCurso.add(chave);\n", ""],
  ["duplo clique: a chave nunca sai da trava (o ato fica bloqueado)", P, "    if (chave) cpaEmCurso.delete(chave);\n", ""],
  ["duplo clique: o botão não fica travado enquanto grava", P, "  if (botao && typeof botao === \"object\") botao.disabled = true;\n", ""],
  ["duplo clique: o botão não destrava depois de gravar", P, "    if (botao && typeof botao === \"object\") botao.disabled = false;\n", ""],

  // ---- o prazo de 20 s e o 428 (confirmação reforçada)
  ["20 s: o pedido não tem prazo", P, "  const limite = controle ? setTimeout(() => controle.abort(), CPA_TEMPO_LIMITE_MS) : null;", "  const limite = null;"],
  ["20 s: o prazo é de 200 s", P, "const CPA_TEMPO_LIMITE_MS = 20000;", "const CPA_TEMPO_LIMITE_MS = 200000;"],
  ["20 s: o temporizador do prazo não é desarmado", P, "    if (limite != null) clearTimeout(limite);\n", ""],
  ["20 s: o sinal de abortar não vai ao fetch", P, "controle ? { signal: controle.signal } : {})", "{})"],
  ["20 s: o tempo esgotado vira 'rede caída'", P, "    if (e && e.name === \"AbortError\") return { sucesso: false, jaAvisado: true, falhaDeRede: true, tempoEsgotado: true, mensagem: CPA_MSG_TEMPO };\n", ""],
  ["20 s: o tempo esgotado não conta como falha de rede (sem 'NÃO foi enviado')", P, "jaAvisado: true, falhaDeRede: true, tempoEsgotado: true,", "jaAvisado: true, tempoEsgotado: true,"],
  ["428: a tela deixa o fetchProtegido tratar o 428 (sem semFator)", P, "Object.assign({}, opcoes || {}, { semFator: true }, controle", "Object.assign({}, opcoes || {}, controle"],
  ["428: a chamada não é repetida depois da confirmação", P, "      if (ok) r = await cpaTentar(url, opcoes);\n", ""],
  ["428: repete sem pedir a confirmação", P, "      const ok = await confirmarFatorAgora();", "      const ok = true;"],
  ["428: a confirmação nunca é pedida", P, "    if (r.res.status === 428) {", "    if (false) {"],
  ["428: a repetição é feita mesmo com a confirmação recusada", P, "      if (ok) r = await cpaTentar(url, opcoes);", "      r = await cpaTentar(url, opcoes);"],
  ["428: a mensagem do 428 não é a da confirmação", P, "    if (res.status === 428 || corpo.precisaFator) corpo.mensagem = CPA_MSG_FATOR;\n", ""],
  ["4xx: o erro sem 'sucesso' no corpo vira sucesso", P, "    if (res.status >= 400) corpo.sucesso = false;\n", ""],
  ["403/5xx: o toast sai duas vezes (jaAvisado some)", P, "    if (res.status === 403 || res.status >= 500) corpo.jaAvisado = true;\n", ""],
  ["resposta: o corpo que não é objeto passa como resposta", P, "    if (!corpo || typeof corpo !== \"object\" || Array.isArray(corpo)) return", "    if (!corpo) return"],
  ["resposta: o toast sai mesmo quando o fetchProtegido já avisou", P, "  if (!(data && data.jaAvisado)) mostrarToast(texto, falhou ? \"erro\" : \"sucesso\");", "  mostrarToast(texto, falhou ? \"erro\" : \"sucesso\");"],
  ["resposta: a falha sai como toast de sucesso", P, "  if (!(data && data.jaAvisado)) mostrarToast(texto, falhou ? \"erro\" : \"sucesso\");", "  if (!(data && data.jaAvisado)) mostrarToast(texto, \"sucesso\");"],

  // ---- o catálogo
  ["catálogo: a falha ao recarregar apaga o catálogo que valia", P, "  if (data.sucesso === false) { if (!forcar) cpaCatalogos = null; return cpaCatalogos; }", "  if (data.sucesso === false) { cpaCatalogos = null; return cpaCatalogos; }"],
  ["catálogo: sem telefones do servidor, os padrão não entram", P, "contatosDeAjuda: ajuda.length ? ajuda : CPA_CONTATOS_PADRAO,", "contatosDeAjuda: ajuda,"],
  ["catálogo: sem catálogo a aba monta mesmo assim", P, "  if (!catalogo) { cpaEscrever(\"cpaGesMsg\", CPA_MSG_SEM_CATALOGO, true); return; }\n", ""],
  ["catálogo: a falha das congregações não é dita", P, "  if (congs.sucesso === false) cpaEscrever(\"cpaGesMsg\", `Não foi possível carregar as congregações: ${cpaMsgErro(congs)}`, true);\n", ""],
  ["catálogo: Meu Painel sem catálogo não avisa", P, "  cpaEscrever(\"cpaMeuMsg\", catalogo ? \"\" : CPA_MSG_SEM_CATALOGO, !catalogo);", "  cpaEscrever(\"cpaMeuMsg\", \"\", false);"],
  ["catálogo: pedir oração sem catálogo quebra (sem a guarda)", P, "  if (!cpaCatalogos) { cpaEscrever(\"cpaPoMsg\", CPA_MSG_SEM_CATALOGO, true); return; }\n", ""],

  // ---- a limpeza ao sair da aba da liderança
  ["sair da aba: o acompanhamento aberto (e a nota) fica", P, "function cpaFecharGestao() {\n  cpaGerGes++;\n  cpaFecharDetalheInterno(\"Ges\");", "function cpaFecharGestao() {\n  cpaGerGes++;"],
  ["sair da aba: a marca da visita à aba não sobe (o ato a caminho relê e pinta a aba escondida)", P, "function cpaFecharGestao() {\n  cpaGerGes++;", "function cpaFecharGestao() {"],
  ["sair da aba: a classe de impressão fica", P, "  cpaMostrar(\"cpaDetalheGesCx\", false); cpaMostrar(\"cpaFilaCx\", true);\n  cpaLimparImpressao();", "  cpaMostrar(\"cpaDetalheGesCx\", false); cpaMostrar(\"cpaFilaCx\", true);"],
  ["sair da aba: o acompanhamento continua à vista e a fila escondida", P, "  cpaMostrar(\"cpaDetalheGesCx\", false); cpaMostrar(\"cpaFilaCx\", true);\n  cpaLimparImpressao();", "  cpaLimparImpressao();"],
  ["viva: a marca não confere o login (geração)", P, "  if (!m || m.g !== cpaGeracao) return false;", "  if (!m) return false;"],
  ["viva: a marca da liderança não confere a visita à aba", P, " : m.t === cpaGerGes && cpaAbaVisivel();", " : cpaAbaVisivel();"],
  ["viva: a marca da liderança não confere se a aba está à vista", P, " : m.t === cpaGerGes && cpaAbaVisivel();", " : m.t === cpaGerGes;"],
  ["viva: a marca do Meu Painel não confere a visita à sub-aba", P, "m.ctx === \"Meu\" ? m.t === cpaGerMeu && cpaMeuVisivel() :", "m.ctx === \"Meu\" ? cpaMeuVisivel() :"],
  ["viva: a marca do Meu Painel não confere se a sub-aba está à vista", P, "m.ctx === \"Meu\" ? m.t === cpaGerMeu && cpaMeuVisivel() :", "m.ctx === \"Meu\" ? m.t === cpaGerMeu :"],
  ["viva: a marca do Meu Painel vale pela aba da liderança", P, "function cpaMarca(ctxBruto) { const ctx = cpaCtx(ctxBruto); return { ctx, g: cpaGeracao, t: ctx === \"Meu\" ? cpaGerMeu : cpaGerGes }; }", "function cpaMarca(ctxBruto) { const ctx = \"Ges\"; return { ctx, g: cpaGeracao, t: cpaGerGes }; }"],
  ["viva: a seção não confere se a aba está à vista", P, "function cpaSecaoViva(secao) { return cpaAbaVisivel() && cpaSecaoAtual === secao; }", "function cpaSecaoViva(secao) { return cpaSecaoAtual === secao; }"],
  ["viva: a seção vale em qualquer seção", P, "function cpaSecaoViva(secao) { return cpaAbaVisivel() && cpaSecaoAtual === secao; }", "function cpaSecaoViva(secao) { return cpaAbaVisivel(); }"],
  ["viva: a fila pede ao servidor fora da aba", P, "  if (!cpaEhGestao() || !cpaSecaoViva(\"fila\")) return;\n  const f = cpaFiltrosFila();", "  if (!cpaEhGestao()) return;\n  const f = cpaFiltrosFila();"],
  ["viva: os pedidos pedem ao servidor fora da seção", P, "  if (!cpaEhGestao() || !cpaSecaoViva(\"pedidos\")) return;\n  const congregacaoId = cpaInteiro(cpaTexto(\"cpaPedCong\"));", "  if (!cpaEhGestao()) return;\n  const congregacaoId = cpaInteiro(cpaTexto(\"cpaPedCong\"));"],
  ["viva: a fila que chega depois de sair da aba é pintada", P, "  if (seq !== cpaSeqFila || !cpaViva(marca) || !cpaSecaoViva(\"fila\")) return;", "  if (seq !== cpaSeqFila) return;"],
  ["viva: os pedidos que chegam depois de sair da aba são pintados", P, "  if (seq !== cpaSeqPed || !cpaViva(marca) || !cpaSecaoViva(\"pedidos\")) return;", "  if (seq !== cpaSeqPed) return;"],
  ["viva: abrir acompanhamento: a resposta depois de sair da aba relê a fila", P, "    if (!cpaViva(marca)) return;   // a pessoa saiu da aba enquanto gravava", "    // a pessoa saiu da aba enquanto gravava"],
  ["viva: o acompanhamento é lido fora da tela", P, "  if (!cpaViva(marca)) return false;   // fora da tela não se lê acompanhamento", "  // fora da tela não se lê acompanhamento"],
  ["viva: o acompanhamento que chega depois de sair é pintado", P, "  if (seq !== cpaSeqDet || !cpaViva(marca)) return false;   // a pessoa trocou", "  if (seq !== cpaSeqDet) return false;   // a pessoa trocou"],
  ["viva: depois do ato, a releitura acontece fora da tela", P, "  const marca = cpaMarca(ctx);\n  if (!cpaViva(marca)) return;\n  const ok = await cpaCarregarDetalhe(ctx, itemId, false);", "  const marca = cpaMarca(ctx);\n  const ok = await cpaCarregarDetalhe(ctx, itemId, false);"],
  ["viva: depois do ato, a mensagem e a lista voltam fora da tela", P, "  if (!cpaViva(marca)) return;   // a pessoa saiu enquanto o acompanhamento era relido", "  // a pessoa saiu enquanto o acompanhamento era relido"],
  ["viva: depois do pedido moderado, a lista é relida fora da seção", P, "  if (!cpaViva(marca) || !cpaSecaoViva(\"pedidos\")) return;\n  const msg = cpaMsgErro(data);", "  const msg = cpaMsgErro(data);"],
  ["viva: marcar o risco com a confirmação aberta e a aba fechada grava", P, "  if (!cpaViva(marca) || !cpaSecaoViva(\"pedidos\") || !cpaPedido(id)) return;\n", ""],
  ["viva: nomear com a confirmação aberta e o acompanhamento trocado grava", P, "  if (!(await confirmarAcao(`Nomear ${String(p.nome == null ? \"\" : p.nome)} como responsável por este acompanhamento? A pessoa recebe o aviso.`, \"Nomear\"))) return;\n  if (!cpaViva(marca) || !cpaDet || cpaDet.itemId !== itemId) return;", "  if (!(await confirmarAcao(`Nomear ${String(p.nome == null ? \"\" : p.nome)} como responsável por este acompanhamento? A pessoa recebe o aviso.`, \"Nomear\"))) return;"],
  ["viva: cancelar com a confirmação aberta e a sessão trocada grava", P, "\"Cancelar o acompanhamento\"))) return;\n  if (!cpaViva(marca) || !cpaDet || cpaDet.itemId !== itemId) return;", "\"Cancelar o acompanhamento\"))) return;"],
  ["viva: 'meus' relido fora da sub-aba", P, "  if (!cpaViva(marca)) return;   // fora da sub-aba nada se pede", "  // fora da sub-aba nada se pede"],
  ["viva: 'meus pedidos' pedidos fora da sub-aba", P, "  if (!authToken || !cpaViva(marca)) return;\n  const seq = ++cpaSeqMeusPed;", "  if (!authToken) return;\n  const seq = ++cpaSeqMeusPed;"],
  ["viva: o pedido de oração que volta depois de sair da sub-aba é pintado", P, "    if (!cpaViva(marca) || !cpaEl(\"cpaPoMsg\")) return;", "    if (!cpaEl(\"cpaPoMsg\")) return;"],
  ["viva: o pedido de visita que volta depois de sair da sub-aba é pintado", P, "    if (!cpaViva(marca) || !cpaEl(\"cpaPvMsg\")) return;", "    if (!cpaEl(\"cpaPvMsg\")) return;"],
  ["viva: o pedido em mãos que volta depois de sair da seção é pintado", P, "    if (!cpaViva(marca) || !cpaSecaoViva(\"pedidos\") || !cpaEl(\"cpaRpMsg\")) return;", "    if (!cpaEl(\"cpaRpMsg\")) return;"],
  ["viva: o boletim que chega depois de sair é pintado", P, "  if (seq !== cpaSeqBol || !cpaViva(marca)) return;", "  if (seq !== cpaSeqBol) return;"],
  ["viva: o painel que chega depois de sair é pintado", P, "  if (seq !== cpaSeqPainel || !cpaViva(marca)) return;", "  if (seq !== cpaSeqPainel) return;"],
  ["viva: o boletim do Meu Painel é pedido fora da sub-aba", P, "  const marca = cpaMarca(\"Meu\");\n  if (!cpaViva(marca)) return;\n  const seq = ++cpaSeqBolMeu;", "  const marca = cpaMarca(\"Meu\");\n  const seq = ++cpaSeqBolMeu;"],
  ["sair da aba: as respostas a caminho (fila, pedidos, boletim, painel, busca) entram depois", P, "  cpaSeqFila++; cpaSeqPed++; cpaSeqBol++; cpaSeqPainel++; cpaSeqBusca++;\n  cpaFila = [];", "  cpaFila = [];"],
  ["sair da aba: a fila e os pedidos ficam na memória", P, "  cpaFila = []; cpaPedidos = []; cpaPedFormAberto = 0; cpaBuscaRes = {}; cpaEscolhas = {};\n  cpaEsvaziar([\"cpaFilaLista\"", "  cpaEsvaziar([\"cpaFilaLista\""],
  ["sair da aba: as listas ficam na página", P, "  cpaEsvaziar([\"cpaFilaLista\", \"cpaNovoCx\", \"cpaDetalheGes\", \"cpaPedLista\", \"cpaRegPedCx\", \"cpaBolImprimivel\", \"cpaPainelLista\"]);\n", ""],
  ["sair da aba: as mensagens ficam", P, "  [\"cpaFilaMsg\", \"cpaDetalheGesMsg\", \"cpaPedMsg\", \"cpaBolMsg\", \"cpaPainelMsg\"].forEach(id => cpaEscrever(id, \"\", false));\n", ""],
  ["sair da aba: a navegação não fecha a aba da liderança", P, "  if (aba !== \"cuidadopastoral\") cpaFecharGestao();\n", ""],
  ["sair da aba: ir a outra aba não fecha Meu Painel → Cuidado", P, "  if (aba !== \"meupainel\") cpaFecharMeu();\n", ""],
  ["sair da aba: o catálogo que chega depois de sair monta a aba (as duas camadas desfeitas)", P, [
    ["  if (geracao !== cpaGeracao || !cpaAbaVisivel()) return;", "  if (geracao !== cpaGeracao) return;"]
  ]],
  ["sair da aba: a aba é tida por visível mesmo escondida", P, "  return !!(authToken && cpaDono === cpaChaveDoDono() && aba && aba.style.display === \"block\");", "  return !!(authToken && cpaDono === cpaChaveDoDono() && aba);"],

  // ---- a limpeza ao sair da sub-aba Meu Painel → Cuidado
  ["sair da sub-aba: o acompanhamento aberto fica", P, "function cpaFecharMeu() {\n  cpaGerMeu++;\n  cpaFecharDetalheInterno(\"Meu\");", "function cpaFecharMeu() {\n  cpaGerMeu++;"],
  ["sair da sub-aba: a marca da visita à sub-aba não sobe (o pedido a caminho pinta a sub-aba escondida)", P, "function cpaFecharMeu() {\n  cpaGerMeu++;", "function cpaFecharMeu() {"],
  ["sair da sub-aba: 'meus pedidos' a caminho entra depois", P, "  cpaSeqMeu++; cpaSeqMeusLista++; cpaSeqMeusPed++; cpaSeqBolMeu++;", "  cpaSeqMeu++; cpaSeqMeusLista++; cpaSeqBolMeu++;"],
  ["sair da sub-aba: o boletim a caminho entra depois", P, "  cpaSeqMeu++; cpaSeqMeusLista++; cpaSeqMeusPed++; cpaSeqBolMeu++;", "  cpaSeqMeu++; cpaSeqMeusLista++; cpaSeqMeusPed++;"],
  ["sair da sub-aba: 'meus' relido a caminho entra depois", P, "  cpaSeqMeu++; cpaSeqMeusLista++; cpaSeqMeusPed++; cpaSeqBolMeu++;", "  cpaSeqMeu++; cpaSeqMeusPed++; cpaSeqBolMeu++;"],
  ["sair da sub-aba: 'meus' a caminho entra depois (as duas camadas desfeitas)", P, [
    ["  cpaSeqMeu++; cpaSeqMeusLista++; cpaSeqMeusPed++; cpaSeqBolMeu++;", "  cpaSeqMeusLista++; cpaSeqMeusPed++; cpaSeqBolMeu++;"],
    ["  if (seq !== cpaSeqMeu || !cpaMeuVisivel()) return;", "  if (seq !== cpaSeqMeu) return;"]
  ]],
  ["sair da sub-aba: a lista de 'meus' fica na memória", P, "  cpaMeus = [];\n  cpaEsvaziar([\"cpaMeusLista\"", "  cpaEsvaziar([\"cpaMeusLista\""],
  ["sair da sub-aba: o que a pessoa escrevia fica na página", P, "  cpaEsvaziar([\"cpaMeusLista\", \"cpaDetalheMeu\", \"cpaOracaoForm\", \"cpaOracaoResultado\", \"cpaVisitaForm\", \"cpaVisitaResultado\", \"cpaMeusPedidos\", \"cpaBoletimMeu\"]);\n", ""],
  ["sair da sub-aba: 'Meus acompanhamentos' continua à vista", P, "  cpaMostrar(\"cpaMeusCx\", false); cpaMostrar(\"cpaDetalheMeuCx\", false); cpaMostrar(\"cpaMeusListaCx\", true);", "  cpaMostrar(\"cpaDetalheMeuCx\", false); cpaMostrar(\"cpaMeusListaCx\", true);"],
  ["sair da sub-aba: a navegação não avisa o módulo", P, "  if (sub !== \"cuidado\") cpaFecharMeu();\n", ""],
  ["sair da sub-aba: a sub-aba é tida por visível mesmo escondida", P, "  return !!(authToken && cpaDono === cpaChaveDoDono() && sub && sub.style.display === \"block\");", "  return !!(authToken && cpaDono === cpaChaveDoDono() && sub);"],

  // ---- a saída da sessão e a troca de login
  ["sessão: a geração não sobe (o pedido do login anterior entra)", P, "function cpaLimparTela() {\n  cpaGeracao++;", "function cpaLimparTela() {"],
  ["sessão: o catálogo do login anterior fica", P, "  cpaCatalogos = null; cpaCongregacoes = []; cpaSecaoAtual = \"fila\";", "  cpaCongregacoes = []; cpaSecaoAtual = \"fila\";"],
  ["sessão: as congregações do login anterior ficam", P, "  cpaCatalogos = null; cpaCongregacoes = []; cpaSecaoAtual = \"fila\";", "  cpaCatalogos = null; cpaSecaoAtual = \"fila\";"],
  ["sessão: a seção do login anterior fica", P, "cpaCongregacoes = []; cpaSecaoAtual = \"fila\"; cpaSituacaoPedidos", "cpaCongregacoes = []; cpaSituacaoPedidos"],
  ["sessão: a pílula dos pedidos do login anterior fica", P, "cpaSecaoAtual = \"fila\"; cpaSituacaoPedidos = \"AGUARDANDO\"; cpaDet = null;", "cpaSecaoAtual = \"fila\"; cpaDet = null;"],
  ["sessão: a trava de duplo clique do login anterior fica", P, "  cpaEmCurso.clear();\n  CPA_IDS_LISTAS", "  CPA_IDS_LISTAS"],
  ["sessão: os seletores ficam com as congregações do login anterior", P, "  CPA_IDS_SELECTS.forEach(id => { const el = cpaEl(id); if (el) el.innerHTML = \"\"; });\n", ""],
  ["sessão: o filtro da fila do login anterior fica", P, "  if (filtro) filtro.value = \"ABERTOS\";\n", ""],
  ["sessão: as mensagens do login anterior ficam", P, "  CPA_IDS_MENSAGENS.forEach(id => cpaEscrever(id, \"\", false));\n", ""],
  ["sessão: o aviso 'sem acesso' do login anterior fica", P, "  cpaMostrar(\"cpaSemAcesso\", false);\n  cpaAplicarSecao(\"fila\");", "  cpaAplicarSecao(\"fila\");"],
  ["sessão: a confirmação aberta sobrevive à troca de login", P, "  if (sobre && !sobre.classList.contains(\"escondido\") && typeof fecharModal === \"function\") fecharModal();\n", ""],
  ["sessão: a classe de impressão do login anterior fica", P, "  cpaAplicarPilulasPedidos();\n  cpaLimparImpressao();\n}", "  cpaAplicarPilulasPedidos();\n}"],
  ["sessão: as pílulas dos pedidos não voltam ao padrão", P, "  cpaAplicarSecao(\"fila\");\n  cpaAplicarPilulasPedidos();\n  cpaLimparImpressao();", "  cpaAplicarSecao(\"fila\");\n  cpaLimparImpressao();"],
  ["sessão: o rascunho da nota do login anterior fica (sem fechar o acompanhamento)", P, "  cpaFecharGestao();\n  cpaFecharMeu();\n  cpaCatalogos = null;", "  cpaCatalogos = null;"],
  ["navegação: voltar à Portaria deixa a fila e a nota escondidas na página", S, "  if (typeof cpaAbaMudou === \"function\") cpaAbaMudou(\"portaria\");\n", ""],
  ["navegação: voltar à Portaria quebra sem o módulo (sem a guarda)", S, "  if (typeof cpaAbaMudou === \"function\") cpaAbaMudou(\"portaria\");", "  cpaAbaMudou(\"portaria\");"],
  ["sessão: a troca de login não refaz a tela", P, "  if (cpaDono !== cpaChaveDoDono()) { cpaLimparTela(); cpaDono = cpaChaveDoDono(); }", "  if (false) { cpaLimparTela(); cpaDono = cpaChaveDoDono(); }"],
  ["sessão: a mesma matrícula por PIN e por senha é o mesmo dono", P, "function cpaChaveDoDono() { return `${authMatricula}|${sessaoDeLiderancaNaTela() ? \"senha\" : \"pin\"}`; }", "function cpaChaveDoDono() { return `${authMatricula}`; }"],
  ["sessão: limparSessao não chama o módulo", S, "  if (typeof cpaLimparTela === \"function\") cpaLimparTela();\n", ""],
  ["sessão: limparSessao quebra sem o módulo (sem a guarda)", S, "  if (typeof cpaLimparTela === \"function\") cpaLimparTela();", "  cpaLimparTela();"],
  ["navegação: a sub-aba não avisa o módulo (script.js)", S, "  if (typeof cpaSubAbaMudou === \"function\") cpaSubAbaMudou(sub);", "  "],
  ["navegação: a sub-aba quebra sem o módulo (sem a guarda)", S, "  if (typeof cpaSubAbaMudou === \"function\") cpaSubAbaMudou(sub);", "  cpaSubAbaMudou(sub);"],
  ["navegação: a sub-aba Cuidado não carrega", S, "  if (sub === \"cuidado\" && typeof cpaCarregarMeuPainelAcao === \"function\") cpaCarregarMeuPainelAcao();", "  "],
  ["navegação: a sub-aba Cuidado quebra sem o módulo (sem a guarda)", S, "  if (sub === \"cuidado\" && typeof cpaCarregarMeuPainelAcao === \"function\") cpaCarregarMeuPainelAcao();", "  if (sub === \"cuidado\") cpaCarregarMeuPainelAcao();"],
  ["navegação: a aba não avisa o módulo (meus-dados.js)", D, "  if (typeof cpaAbaMudou === \"function\") cpaAbaMudou(aba);", "  "],
  ["navegação: a aba quebra sem o módulo (sem a guarda)", D, "  if (typeof cpaAbaMudou === \"function\") cpaAbaMudou(aba);", "  cpaAbaMudou(aba);"],
  ["navegação: a aba Cuidado pastoral não carrega", D, "  if (aba === \"cuidadopastoral\" && typeof cpaCarregarOpcoesAcao === \"function\") cpaCarregarOpcoesAcao();", "  "],

  // ---- os telefones de ajuda
  ["ajuda: os telefones fixos somem do index.html", H, "<li><a class=\"cpa-tel\" href=\"tel:188\">📞 <strong>188</strong> CVV — Centro de Valorização da Vida</a>", "<li><a class=\"cpa-tel\" href=\"#\">📞 <strong>CVV</strong> CVV — Centro de Valorização da Vida</a>"],
  ["ajuda: o bloco de telefones sai de Meu Painel ao carregar", P, "    ${cpaHtmlContatos(null)}\n  </div>`;\n}", "\n  </div>`;\n}"],
  ["ajuda: Meu Painel não redesenha os telefones do servidor", P, "  if (ajuda) ajuda.innerHTML = cpaHtmlAjudaFixa();\n", ""],
  ["ajuda: o endereço tel: leva o número cru", P, "    const digitos = String(c && c.numero != null ? c.numero : \"\").replace(/\\D/g, \"\").slice(0, 8);", "    const digitos = String(c && c.numero != null ? c.numero : \"\").slice(0, 8);"],
  ["ajuda: o telefone sem número some (sem o ramo do nome)", P, "      : `<li><strong>${nome}</strong><span class=\"cpa-tel-desc\">${descricao}</span></li>`;", "      : \"\";"],
  ["ajuda: a resposta do risco não traz os telefones", P, "    <p class=\"cpa-risco-msg\">${escaparHtmlEbd(cpaMsgErro(data))}</p>\n    ${cpaHtmlContatos(data.ajuda)}", "    <p class=\"cpa-risco-msg\">${escaparHtmlEbd(cpaMsgErro(data))}</p>"],
  ["ajuda: o cartão do pedido com risco não traz os telefones", P, "    ${risco ? `<div class=\"cpa-ajuda cpa-ajuda-risco\">${cpaHtmlContatos(null)}</div>` : \"\"}", "    "],
  ["ajuda: a falha do pedido não traz os telefones", P, "CPA_MSG_PEDIDO_NAO_FOI)}</p>${cpaHtmlContatos(data.ajuda)}</div>`;", "CPA_MSG_PEDIDO_NAO_FOI)}</p></div>`;"],
  ["ajuda: os telefones fixos do Meu Painel não usam os do servidor", P, "  const itens = Array.isArray(lista) && lista.length ? lista : (cpaCatalogos ? cpaCatalogos.contatosDeAjuda : CPA_CONTATOS_PADRAO);", "  const itens = Array.isArray(lista) && lista.length ? lista : CPA_CONTATOS_PADRAO;"],
  ["ajuda: os telefones da resposta do servidor são ignorados", P, "  const itens = Array.isArray(lista) && lista.length ? lista : (cpaCatalogos ? cpaCatalogos.contatosDeAjuda : CPA_CONTATOS_PADRAO);", "  const itens = cpaCatalogos ? cpaCatalogos.contatosDeAjuda : CPA_CONTATOS_PADRAO;"],
  ["ajuda: o 190 some dos telefones padrão", P, "  { nome: \"Polícia\", numero: \"190\", descricao: \"Se existe perigo agora.\" },\n", ""],
  ["ajuda: o 188 vira outro número nos telefones padrão", P, "  { nome: \"CVV — Centro de Valorização da Vida\", numero: \"188\",", "  { nome: \"CVV — Centro de Valorização da Vida\", numero: \"141\","],
  ["ajuda: o 180 some dos telefones padrão", P, "  { nome: \"Central de Atendimento à Mulher\", numero: \"180\", descricao: \"De graça, 24 horas. Para a mulher que sofre violência.\" },\n", ""],
  ["ajuda: o 100 some dos telefones padrão", P, ",\n  { nome: \"Disque 100\", numero: \"100\", descricao: \"De graça, 24 horas. Violência contra criança, adolescente, idoso ou pessoa com deficiência.\" }\n];", "\n];"],
  ["ajuda: o 190 some do index.html", H, "<li><a class=\"cpa-tel\" href=\"tel:190\">📞 <strong>190</strong> Polícia</a>", "<li><a class=\"cpa-tel\" href=\"#\">📞 <strong>Polícia</strong></a>"],
  ["ajuda: o 180 some do index.html", H, "<li><a class=\"cpa-tel\" href=\"tel:180\">", "<li><a class=\"cpa-tel\" href=\"#\">"],
  ["ajuda: a falha comum não diz se o pedido foi ou não", P, "<p>${escaparHtmlEbd(cpaPedidoTalvez(data) ? CPA_MSG_PEDIDO_TALVEZ : CPA_MSG_PEDIDO_NAO_FOI)}</p>", ""],
  ["talvez: a rede caída e o tempo esgotado dizem 'NÃO foi enviado'", P, "function cpaPedidoTalvez(data) { return !!(data && (data.falhaDeRede || Number(data.httpStatus) >= 500)); }", "function cpaPedidoTalvez(data) { return false; }"],
  ["talvez: a recusa do servidor (429, 422) diz 'não sabemos se chegou'", P, "function cpaPedidoTalvez(data) { return !!(data && (data.falhaDeRede || Number(data.httpStatus) >= 500)); }", "function cpaPedidoTalvez(data) { return true; }"],
  ["talvez: o erro do servidor (5xx) diz 'NÃO foi enviado'", P, "(data.falhaDeRede || Number(data.httpStatus) >= 500)", "(data.falhaDeRede)"],
  ["talvez: só o 5xx diz 'não sabemos' (a rede caída diz 'NÃO foi enviado')", P, "(data.falhaDeRede || Number(data.httpStatus) >= 500)", "(Number(data.httpStatus) >= 500)"],
  ["talvez: a mensagem do 'não sabemos' não manda ver Meus pedidos", P, "const CPA_MSG_PEDIDO_TALVEZ = \"Não sabemos se o seu pedido chegou: veja em Meus pedidos antes de enviar de novo.", "const CPA_MSG_PEDIDO_TALVEZ = \"O seu pedido NÃO foi enviado."],
  ["talvez: a oração sem resposta não relê Meus pedidos", P, "cpaMostrarRespostaComum(\"cpaOracaoResultado\", data, false); if (cpaPedidoTalvez(data)) cpaCarregarMeusPedidosAcao(); return; }", "cpaMostrarRespostaComum(\"cpaOracaoResultado\", data, false); return; }"],
  ["talvez: a oração recusada relê Meus pedidos (sem a condição)", P, "cpaMostrarRespostaComum(\"cpaOracaoResultado\", data, false); if (cpaPedidoTalvez(data)) cpaCarregarMeusPedidosAcao(); return; }", "cpaMostrarRespostaComum(\"cpaOracaoResultado\", data, false); cpaCarregarMeusPedidosAcao(); return; }"],
  ["talvez: a visita sem resposta não relê Meus pedidos", P, "cpaMostrarRespostaComum(\"cpaVisitaResultado\", data, false); if (cpaPedidoTalvez(data)) cpaCarregarMeusPedidosAcao(); return; }", "cpaMostrarRespostaComum(\"cpaVisitaResultado\", data, false); return; }"],
  ["talvez: o pedido em mãos sem resposta vira recusa comum", P, "    if (data.sucesso === false && data.falhaDeRede) {", "    if (false) {"],
  ["talvez: o pedido em mãos sem resposta não relê a lista", P, "      cpaEscrever(\"cpaRpMsg\", `${cpaMsgErro(data)} ${CPA_MSG_REGISTRO_TALVEZ}`, true);\n      await cpaCarregarPedidosAcao();", "      cpaEscrever(\"cpaRpMsg\", `${cpaMsgErro(data)} ${CPA_MSG_REGISTRO_TALVEZ}`, true);"],
  ["talvez: o pedido em mãos sem resposta perde o aviso depois de reler", P, "      if (cpaViva(marca) && cpaEl(\"cpaRpMsg\")) cpaEscrever(\"cpaRpMsg\", `${cpaMsgErro(data)} ${CPA_MSG_REGISTRO_TALVEZ}`, true);\n", ""],
  ["talvez: o pedido em mãos sem resposta não diz 'não sabemos'", P, "const CPA_MSG_REGISTRO_TALVEZ = \"Não sabemos se o pedido chegou: veja na lista de pedidos antes de registrar de novo.\";", "const CPA_MSG_REGISTRO_TALVEZ = \"\";"],

  // ---- o sinal de risco: só o servidor diz que a liderança foi avisada
  ["risco: a tela inventa 'a liderança foi avisada'", P, "    <p class=\"cpa-risco-msg\">${escaparHtmlEbd(cpaMsgErro(data))}</p>", "    <p class=\"cpa-risco-msg\">A liderança foi avisada. ${escaparHtmlEbd(cpaMsgErro(data))}</p>"],
  ["risco: a resposta do risco não é alerta", P, "  cx.innerHTML = `<div class=\"cpa-risco-resposta\" role=\"alert\">", "  cx.innerHTML = `<div class=\"cpa-risco-resposta\">"],
  ["risco: a resposta do risco não recebe o foco", P, "    ${cpaHtmlContatos(data.ajuda)}\n  </div>`;\n  cpaFocar(cx);", "    ${cpaHtmlContatos(data.ajuda)}\n  </div>`;"],
  ["risco: o pedido de oração com risco sai como resposta comum", P, "    if (data.risco === true) cpaMostrarRespostaRisco(\"cpaOracaoResultado\", data); else", "    if (false) cpaMostrarRespostaRisco(\"cpaOracaoResultado\", data); else"],
  ["risco: o pedido de visita com risco sai como resposta comum", P, "    if (data.risco === true) cpaMostrarRespostaRisco(\"cpaVisitaResultado\", data); else", "    if (false) cpaMostrarRespostaRisco(\"cpaVisitaResultado\", data); else"],
  ["risco: o pedido em mãos com risco fecha o formulário (a resposta some)", P, "    if (data.risco) {\n      // sinal de risco", "    if (false) {\n      // sinal de risco"],
  ["risco: o pedido em mãos com risco sai com o título de quem pediu", P, "      cpaMostrarRespostaRisco(\"cpaRpResposta\", data, true);", "      cpaMostrarRespostaRisco(\"cpaRpResposta\", data, false);"],
  ["risco: o pedido em mãos com risco deixa o texto no campo", P, "      if (campo && cpaTexto(\"cpaRpTexto\") === texto) campo.value = \"\";\n", ""],
  ["risco: o pedido em mãos com risco não relê a lista", P, "      cpaMostrarRespostaRisco(\"cpaRpResposta\", data, true);\n      const campo = cpaEl(\"cpaRpTexto\");\n      if (campo && cpaTexto(\"cpaRpTexto\") === texto) campo.value = \"\";\n      cpaCarregarPedidosAcao();", "      cpaMostrarRespostaRisco(\"cpaRpResposta\", data, true);\n      const campo = cpaEl(\"cpaRpTexto\");\n      if (campo && cpaTexto(\"cpaRpTexto\") === texto) campo.value = \"\";"],
  ["risco: o aviso que não saiu (avisada: false) não fica em destaque", P, "  const alerta = data.sucesso === false || data.avisada === false;", "  const alerta = data.sucesso === false;"],
  ["risco: o cartão do risco não diz 'Atenda agora'", P, "    ${risco ? `<div class=\"cpa-risco-topo\"><strong>🚨 Atenda agora.</strong>", "    ${risco ? `<div class=\"cpa-risco-topo\"><strong></strong>"],
  ["risco: o cartão do risco não diz quem marcou", P, "${p.riscoOrigem === \"LIDERANCA\" ? \" (marcado pela liderança)\" : \" (a lista do sistema pegou)\"}", ""],
  ["risco: o cartão do risco não manda à Proteção de Crianças", P, "    ${risco && p.riscoCrianca ? \"<p class='cnl-aviso-senha' role='note'>", "    ${false ? \"<p class='cnl-aviso-senha' role='note'>"],
  ["risco: o pedido com risco ganha Publicar e Marcar como lido", P, "  const aguardando = !risco && p.moderacao === \"AGUARDANDO\";", "  const aguardando = p.moderacao === \"AGUARDANDO\";"],
  ["risco: o pedido com risco ganha 'Marcar sinal de risco' de novo", P, "      ${risco ? (cpaEhAcima() ? `<button", "      ${false ? (cpaEhAcima() ? `<button"],
  ["risco: marcar o risco sem confirmação", P, "  if (!(await confirmarAcao(\"Marcar SINAL DE RISCO avisa agora toda a liderança", "  if (false && !(await confirmarAcao(\"Marcar SINAL DE RISCO avisa agora toda a liderança"],
  ["risco: marcar o risco num pedido que já tem risco", P, "  if (!p || p.risco) return;\n  const marca = cpaMarca(\"Ges\"), id = Number(p.pedidoId);   // antes da confirmação", "  if (!p) return;\n  const marca = cpaMarca(\"Ges\"), id = Number(p.pedidoId);   // antes da confirmação"],
  ["risco: o corpo do marcar não diz marcar: true", P, "cpaPostar(\"risco\", { pedidoId: id, marcar: true });", "cpaPostar(\"risco\", { pedidoId: id });"],
  ["risco: desmarcar num pedido sem risco (sem a trava)", P, "  if (!p || !p.risco) return;\n  const motivo = cpaTexto(\"cpaDesMotivo\");", "  if (!p) return;\n  const motivo = cpaTexto(\"cpaDesMotivo\");"],
  ["risco: o formulário de desmarcar abre num pedido sem risco", P, "  if (!p || !p.risco) return;\n  const id = Number(p.pedidoId);\n  cpaFecharFormPedido();\n  const cx = cpaEl(`cpaPedForm${id}`);\n  if (!cx) return;\n  cpaPedFormAberto = id;\n  cpaGatilhoForm = gatilho && typeof gatilho === \"object\" ? gatilho : null;\n  cx.innerHTML = `<div class=\"cal-form cpa-form\" role=\"group\" aria-labelledby=\"cpaDesTitulo\">", "  if (!p) return;\n  const id = Number(p.pedidoId);\n  cpaFecharFormPedido();\n  const cx = cpaEl(`cpaPedForm${id}`);\n  if (!cx) return;\n  cpaPedFormAberto = id;\n  cpaGatilhoForm = gatilho && typeof gatilho === \"object\" ? gatilho : null;\n  cx.innerHTML = `<div class=\"cal-form cpa-form\" role=\"group\" aria-labelledby=\"cpaDesTitulo\">"],
  ["risco: o corpo do desmarcar não leva o motivo", P, "cpaPostar(\"risco\", { pedidoId: id, marcar: false, motivo });", "cpaPostar(\"risco\", { pedidoId: id, marcar: false });"],
  ["risco: a contagem não avisa do risco", P, "${comRisco ? ` — ${comRisco} com SINAL DE RISCO: atenda primeiro` : \"\"}", ""],
  ["risco: a contagem com risco não fica em destaque", P, "\"Nenhum pedido nesta situação.\", comRisco > 0);", "\"Nenhum pedido nesta situação.\", false);"],

  // ---- nome e texto nunca em endereço
  ["endereço: a busca de pessoas vai por GET (o nome no endereço)", P, "    const data = await cpaPostar(\"buscar-pessoas\", { congregacaoId, q });", "    const data = await cpaObter(`buscar-pessoas?congregacaoId=${congregacaoId}&q=${encodeURIComponent(q)}`);"],
  ["endereço: o pedido de oração leva o texto no endereço", P, "    const data = await cpaPostar(\"pedir-oracao\", corpo);", "    const data = await cpaPostar(`pedir-oracao?texto=${encodeURIComponent(texto)}`, corpo);"],
  ["endereço: a nota leva o texto no endereço", P, "    const data = await cpaPostar(\"nota\", corpo);", "    const data = await cpaPostar(`nota?texto=${encodeURIComponent(texto)}`, corpo);"],
  ["endereço: o pedido de visita leva o motivo no endereço", P, "    const data = await cpaPostar(\"pedir-visita\", corpo);", "    const data = await cpaPostar(`pedir-visita?motivo=${encodeURIComponent(motivo)}`, corpo);"],
  ["endereço: o pedido em mãos leva o texto no endereço", P, "    const data = await cpaPostar(\"registrar-pedido\", corpo);", "    const data = await cpaPostar(`registrar-pedido?texto=${encodeURIComponent(texto)}`, corpo);"],
  ["endereço: abrir a nota vai por GET", P, "    const data = await cpaPostar(\"abrir-nota\", { notaId: id });", "    const data = await cpaObter(`abrir-nota?notaId=${id}`);"],

  // ---- a nota pastoral: só por textContent, some ao fechar
  ["nota: o texto entra por innerHTML", P, "    el.textContent = texto;   // textContent, nunca innerHTML", "    el.innerHTML = texto;   // textContent, nunca innerHTML"],
  ["nota: fechar não apaga o texto", P, "  if (corpo) corpo.textContent = \"\";\n  if (cx) cx.style.display = \"none\";", "  if (cx) cx.style.display = \"none\";"],
  ["nota: fechar não esconde a caixa", P, "  if (corpo) corpo.textContent = \"\";\n  if (cx) cx.style.display = \"none\";", "  if (corpo) corpo.textContent = \"\";"],
  ["nota: a abertura atrasada entra depois de fechar (a sequência não sobe)", P, "function cpaLimparNota() {\n  cpaSeqNota++;", "function cpaLimparNota() {"],
  ["nota: abrir não diz que a abertura ficou registrada", P, "  linha(\"p\", \"psc-legenda\", \"Esta abertura ficou registrada (quem abriu e quando). Não copie nem repasse: o que está aqui é sigiloso.\");\n", ""],
  ["nota: a caixa da nota não recebe o foco", P, "  cx.style.display = \"block\";\n  cpaFocar(cx);", "  cx.style.display = \"block\";"],
  ["nota: o 'somente pastor' não é marcado no texto aberto", P, "${nota.nivel === \"PASTORAL\" ? \" — somente pastor\" : \"\"}", ""],
  ["nota: abrir a nota que não está na lista", P, "  if (!cpaNotas.some(n => Number(n.notaId) === id)) return;\n", ""],
  ["nota: o 404 ao abrir não explica", P, "      if (data.httpStatus === 404) cpaEscrever(\"cpaNotasMsg\", \"Esta nota não pode mais ser aberta por você", "      if (false) cpaEscrever(\"cpaNotasMsg\", \"Esta nota não pode mais ser aberta por você"],
  ["nota: a recusa ao abrir não aparece", P, "      cpaMostrarResultado(data, \"cpaNotasMsg\", true);\n      if (data.httpStatus === 404) cpaEscrever(\"cpaNotasMsg\", \"Esta nota", "      if (data.httpStatus === 404) cpaEscrever(\"cpaNotasMsg\", \"Esta nota"],
  ["nota: fechar a nota não devolve o foco", P, "  if (nota) cpaFocarId(\"cpaNotasTitulo\");", "  "],
  ["nota: a lista mostra o texto da nota", P, "· ${Number(n.tamanho) || 0} caracteres", "· ${escaparHtmlEbd(n.texto || \"\")} ${Number(n.tamanho) || 0} caracteres"],
  ["nota: a lista não avisa que 'somente pastor' pede a confirmação reforçada", P, "${n.pedeConfirmacao ? \" Abrir pede a confirmação reforçada (chave de acesso ou código por e-mail).\" : \"\"}", ""],
  ["nota: a nota corrigida não é identificada", P, "${n.retificaNotaId ? ` · corrige ${corrige ? `a nota ${escaparHtmlEbd(cpaDescricaoNota(corrige))}` : \"uma nota anterior\"}` : \"\"}", ""],
  ["nota: 'minha' não é marcada", P, "${n.minha ? cpaSelo(\"cal-st-cancelado\", \"minha\") : \"\"}", ""],
  ["nota: ninguém pode escrever", P, "      ${podeEscrever ? `<button type=\"button\" class=\"btn-confirmar btn-secundario cpa-btn\" data-on-click=\"cpaAbrirFormAcao\"", "      ${false ? `<button type=\"button\" class=\"btn-confirmar btn-secundario cpa-btn\" data-on-click=\"cpaAbrirFormAcao\""],
  ["nota: a nota de membro vai pelo item", P, "  return cpaInteiro(i.membroId) ? { membroId: cpaInteiro(i.membroId) } : { itemId: cpaDet.itemId };", "  return { itemId: cpaDet.itemId };"],
  ["nota: a nota de visitante vai pelo membro (sem alvo)", P, "  return cpaInteiro(i.membroId) ? { membroId: cpaInteiro(i.membroId) } : { itemId: cpaDet.itemId };", "  return { membroId: cpaInteiro(i.membroId) };"],
  ["nota: a correção não vai no corpo", P, "  if (retifica) corpo.retificaNotaId = retifica;\n", ""],
  ["nota: depois de guardar a lista não é relida", P, "    const releu = await cpaRecarregarNotasAcao();", "    const releu = true;"],
  ["nota: a lista que não foi relida não avisa (Atualizar notas)", P, "    cpaEscrever(\"cpaNotasMsg\", releu ? msg : CPA_MSG_NOTA_SEM_LISTA, !releu);", "    cpaEscrever(\"cpaNotasMsg\", msg, false);"],
  ["nota: guardada, o texto fica no campo", P, "    const campo = cpaEl(\"cpaFnTexto\");\n    if (campo) campo.value = \"\";\n    cpaEsvaziar([\"cpaNotaForm\"]);", "    cpaEsvaziar([\"cpaNotaForm\"]);"],
  ["nota: guardada, o formulário fica (o botão manda a mesma nota de novo)", P, "    if (campo) campo.value = \"\";\n    cpaEsvaziar([\"cpaNotaForm\"]);\n", "    if (campo) campo.value = \"\";\n"],
  ["nota: guardada, o formulário só some depois de reler a lista", P, [
    ["    if (campo) campo.value = \"\";\n    cpaEsvaziar([\"cpaNotaForm\"]);\n", "    if (campo) campo.value = \"\";\n"],
    ["    const releu = await cpaRecarregarNotasAcao();\n    if (!vale()) return;", "    const releu = await cpaRecarregarNotasAcao();\n    cpaEsvaziar([\"cpaNotaForm\"]);\n    if (!vale()) return;"]
  ]],
  ["nota: guardada, o foco não vai ao título das notas", P, "    cpaEscrever(\"cpaNotasMsg\", releu ? msg : CPA_MSG_NOTA_SEM_LISTA, !releu);\n    cpaFocarId(\"cpaNotasTitulo\");", "    cpaEscrever(\"cpaNotasMsg\", releu ? msg : CPA_MSG_NOTA_SEM_LISTA, !releu);"],
  ["nota: guardada, sem toast", P, "    cpaGatilhoNota = null;\n    if (!data.jaAvisado) mostrarToast(msg, \"sucesso\");", "    cpaGatilhoNota = null;"],
  ["nota: sem resposta (rede, 20 s) vira 'não guardada' (o segundo envio duplica)", P, "      if (data.falhaDeRede) {\n        cpaEscrever(\"cpaFnMsg\", CPA_MSG_NOTA_TALVEZ, true);", "      if (false) {\n        cpaEscrever(\"cpaFnMsg\", CPA_MSG_NOTA_TALVEZ, true);"],
  ["nota: sem resposta, a lista não é relida", P, "        cpaEscrever(\"cpaFnMsg\", CPA_MSG_NOTA_TALVEZ, true);\n        await cpaRecarregarNotasAcao();\n", "        cpaEscrever(\"cpaFnMsg\", CPA_MSG_NOTA_TALVEZ, true);\n"],
  ["nota: sem resposta, o aviso some depois de reler", P, "        if (vale()) cpaEscrever(\"cpaFnMsg\", CPA_MSG_NOTA_TALVEZ, true);\n", ""],
  ["nota: sem resposta, o rascunho é apagado", P, "        if (vale()) cpaEscrever(\"cpaFnMsg\", CPA_MSG_NOTA_TALVEZ, true);\n        return;", "        if (vale()) cpaEscrever(\"cpaFnMsg\", CPA_MSG_NOTA_TALVEZ, true);\n        cpaEsvaziar([\"cpaNotaForm\"]);\n        return;"],
  ["nota: a resposta da nota entra noutro acompanhamento (sem conferir o item)", P, "  const vale = () => cpaViva(marca) && !!cpaDet && cpaDet.itemId === itemId;", "  const vale = () => cpaViva(marca) && !!cpaDet;"],
  ["nota: a resposta da nota entra fora da tela", P, "  const vale = () => cpaViva(marca) && !!cpaDet && cpaDet.itemId === itemId;", "  const vale = () => !!cpaDet && cpaDet.itemId === itemId;"],
  ["nota: o rascunho se perde quando o acompanhamento é relido", P, "  const rascunho = cpaRascunhoNota();", "  const rascunho = null;"],
  ["nota: o rascunho volta sem o texto", P, "  if (texto) texto.value = r.texto;\n", ""],
  ["nota: o rascunho volta sem o nível", P, "  if (nivel) nivel.value = r.nivel;\n", ""],
  ["nota: o rascunho volta sem o 'corrige'", P, "  if (corrige) corrige.value = r.corrige;\n", ""],
  ["nota: o rascunho volta com o contador zerado", P, "  if (corrige) corrige.value = r.corrige;\n  cpaContarNotaAcao();", "  if (corrige) corrige.value = r.corrige;"],
  ["nota: reabrir o formulário apaga o que já está escrito", P, "    if (cpaEl(\"cpaFnTexto\")) { cpaFocarId(\"cpaFnTexto\"); return; }\n", ""],
  ["nota: abrir outro formulário (contato, concluir) apaga o rascunho da nota", P, "  cpaEsvaziar([\"cpaFormAcao\"]);\n  cpaBuscaRes.troca = [];", "  cpaEsvaziar([\"cpaFormAcao\", \"cpaNotaForm\"]);\n  cpaBuscaRes.troca = [];"],
  ["nota: o formulário da nota vai para a área dos atos", P, "  const area = cpaEl(tipo === \"nota\" ? \"cpaNotaForm\" : \"cpaFormAcao\");", "  const area = cpaEl(\"cpaFormAcao\");"],
  ["nota: o foco não vai para o nível ao abrir o formulário", P, "    cpaRolarPara(\"cpaNotaForm\");\n    cpaFocarId(CPA_PRIMEIRO_CAMPO.nota);", "    cpaRolarPara(\"cpaNotaForm\");"],
  ["nota: fechar o formulário da nota deixa o texto na página", P, "function cpaFecharNotaFormAcao() {\n  cpaEsvaziar([\"cpaNotaForm\"]);", "function cpaFecharNotaFormAcao() {"],
  ["nota: fechar o formulário da nota não devolve o foco", P, "  if (gatilho && gatilho.isConnected) cpaFocar(gatilho); else cpaFocarId(\"cpaNotasTitulo\");\n}", "}"],
  ["nota: a página escondida não fecha a nota", P, "function cpaPaginaEscondida() { if (document.visibilityState === \"hidden\") cpaLimparNota(); }", "function cpaPaginaEscondida() { }"],
  ["nota: a página que volta a aparecer também fecha a nota", P, "function cpaPaginaEscondida() { if (document.visibilityState === \"hidden\") cpaLimparNota(); }", "function cpaPaginaEscondida() { cpaLimparNota(); }"],
  ["nota: não ouve a visibilidade da página", P, "document.addEventListener(\"visibilitychange\", cpaPaginaEscondida);\n", ""],
  ["nota: sair da página (pagehide) não fecha a nota", P, "  window.addEventListener(\"pagehide\", cpaLimparNota);\n", ""],
  ["nota: o 404 ao guardar não explica", P, "      if (data.httpStatus === 404) cpaEscrever(\"cpaFnMsg\", \"Não foi possível guardar a nota neste acompanhamento", "      if (false) cpaEscrever(\"cpaFnMsg\", \"Não foi possível guardar a nota neste acompanhamento"],
  ["nota: o contador não acompanha o texto", P, "function cpaContarNotaAcao() { const c = cpaEl(\"cpaFnContador\"); if (c) c.textContent = String(cpaTexto(\"cpaFnTexto\").length); }", "function cpaContarNotaAcao() { }"],
  ["nota: o 'corrige' não oferece as notas", P, "  const corrigiveis = cpaNotas;", "  const corrigiveis = [];"],
  ["nota: o 404 ao reler as notas não relê o acompanhamento", P, "    if (data.httpStatus === 404) return cpaCarregarDetalhe(ctx, itemId, false);\n", ""],
  ["nota: a falha ao reler as notas não aparece", P, "    cpaMostrarResultado(data, \"cpaNotasMsg\", true);\n    return false;\n  }\n  cpaNotas = data.notas", "    return false;\n  }\n  cpaNotas = data.notas"],
  ["nota: reler as notas não fecha a nota aberta", P, "  const seq = ++cpaSeqNotas;\n  cpaLimparNota();", "  const seq = ++cpaSeqNotas;"],
  ["nota: as notas de outro acompanhamento entram no de agora", P, "  if (seq !== cpaSeqNotas || !cpaViva(marca) || !cpaDet || cpaDet.itemId !== itemId) return false;", "  if (seq !== cpaSeqNotas || !cpaDet) return false;"],
  ["nota: a nota aberta de outro acompanhamento entra no de agora", P, "    if (seq !== cpaSeqNota || !cpaDet || cpaDet.itemId !== itemId) return;", "    if (seq !== cpaSeqNota || !cpaDet) return;"],
  ["nota: abrir não fecha a nota anterior (as duas se somam)", P, "  if (!corpo || !cx) return;\n  corpo.textContent = \"\";", "  if (!corpo || !cx) return;"],
  ["nota: o texto aberto não mostra o autor", P, " · ${nota.autor || \"\"}${nota.minha ? \" (você)\" : \"\"} · ${calDataHora(nota.criadaEm)}`);", " · ${calDataHora(nota.criadaEm)}`);"],
  ["nota: 'Quem abriu' que chega depois da lista refeita escreve na caixa velha", P, "    if (seq !== cpaSeqLeit || !cpaDet || cpaDet.itemId !== itemId || !alvo || alvo !== cx) return;", "    if (!alvo) return;"],
  ["nota: refazer a lista não invalida 'Quem abriu' a caminho", P, "  if (!cx || !cpaDet) return;\n  cpaSeqLeit++;", "  if (!cx || !cpaDet) return;"],
  ["nota: 'Quem abriu' vazio não diz nada", P, ": \"<p class='psc-legenda'>Ninguém abriu esta nota ainda.</p>\";", ": \"\";"],
  ["nota: 'Quem abriu' com 404 não explica", P, "        alvo.textContent = \"Só quem escreveu a nota e o nível geral veem quem abriu.\";\n", ""],
  ["nota: 'Quem abriu' com falha não diz nada", P, "      alvo.textContent = cpaMsgErro(data);\n      return;\n    }\n    const lista = data.leituras", "      return;\n    }\n    const lista = data.leituras"],
  ["nota: ninguém vê 'Quem abriu'", P, "  const verLeituras = n.minha === true || cpaEhGeral();", "  const verLeituras = false;"],
  ["nota: o autor da nota não vê 'Quem abriu' (só o geral)", P, "  const verLeituras = n.minha === true || cpaEhGeral();", "  const verLeituras = cpaEhGeral();"],
  ["nota: o 'somente pastor' não é marcado na lista", P, "    ${pastoral ? `<p class=\"psc-legenda\">Somente pastor.", "    ${false ? `<p class=\"psc-legenda\">Somente pastor."],
  ["nota: a nota sem permissão de escrever ganha 'Escrever nota'", P, "  const podeEscrever = cpaNiveisPermitidos().length > 0 || (cpaDet.dados.podeNotaNiveis || []).length > 0;", "  const podeEscrever = true;"],
  ["nota: o nível escolhido não vai no corpo", P, "  const corpo = Object.assign({}, cpaAlvoNota(), { nivel, texto });", "  const corpo = Object.assign({}, cpaAlvoNota(), { texto });"],
  ["nota: 'Quem abriu' com 404 mantém o botão", P, "        if (b) b.style.display = \"none\";\n", ""],
  ["nota: 'Quem abriu' não mostra o nome", P, "`<li>${escaparHtmlEbd(l.nome)} — ${cpaDataHora(l.lidaEm)}</li>`", "`<li>${cpaDataHora(l.lidaEm)}</li>`"],

  // ---- a fila
  ["fila: o filtro de congregação não vai na consulta", P, "  if (f.congregacaoId) consulta.push(`congregacaoId=${f.congregacaoId}`);\n", ""],
  ["fila: o filtro de tipo não vai na consulta", P, "  if (f.tipo) consulta.push(`tipo=${encodeURIComponent(f.tipo)}`);\n", ""],
  ["fila: a falha deixa a lista antiga na tela", P, "    cpaFila = [];\n    if (lista) lista.innerHTML = \"\";\n    cpaMostrarResultado(data, \"cpaFilaMsg\", true);", "    cpaFila = [];\n    cpaMostrarResultado(data, \"cpaFilaMsg\", true);"],
  ["fila: a falha não é dita", P, "    if (lista) lista.innerHTML = \"\";\n    cpaMostrarResultado(data, \"cpaFilaMsg\", true);", "    if (lista) lista.innerHTML = \"\";"],
  ["fila: a contagem some", P, "  cpaEscrever(\"cpaFilaMsg\", n ? `${n} ${n === 1 ? \"acompanhamento\" : \"acompanhamentos\"}", "  cpaEscrever(\"cpaFilaMsg\", n ? `${n === 1 ? \"\" : \"\"}"],
  ["fila: o singular vira plural", P, "${n === 1 ? \"acompanhamento\" : \"acompanhamentos\"}", "${\"acompanhamentos\"}"],
  ["fila: a lista vazia não diz nada", P, "\"Nenhum acompanhamento nesta situação.\", false);", "\"\", false);"],
  ["selo: o URGENTE some", P, "  if (i.urgente) s.push(cpaSelo(\"cal-st-indeferido cpa-urgente\", \"🚨 URGENTE\"));\n", ""],
  ["selo: o 'só o nível geral vê' some", P, "  if (i.soNivelGeral) s.push(cpaSelo(\"cal-st-indeferido\", \"🔒 só o nível geral vê\"));\n", ""],
  ["selo: o 'só o nível geral vê' em todo item", P, "  if (i.soNivelGeral) s.push(", "  if (true) s.push("],
  ["selo: o encerrado não diz o desfecho", P, "  if (i.status && i.status !== \"ABERTO\") s.push(", "  if (false) s.push("],
  ["selo: o prazo some", P, "  s.push(cpaHtmlPrazo(i));\n", ""],
  ["selo: 'subiu para' em todo item aberto", P, "  if (i.status === \"ABERTO\" && i.nivel && i.nivel !== \"CONGREGACAO\") s.push(", "  if (i.status === \"ABERTO\") s.push("],
  ["selo: 'subiu para' some", P, "  if (i.status === \"ABERTO\" && i.nivel && i.nivel !== \"CONGREGACAO\") s.push(", "  if (false) s.push("],
  ["selo: 'Detectado pelo sistema' em todo item", P, "  if (i.origem === \"DETECCAO\") s.push(", "  if (true) s.push("],
  ["selo: o menor de idade não é marcado", P, "  if (i.menor) s.push(cpaSelo(\"cal-st-proposto\", \"🧒 menor de idade\"));\n", ""],
  ["selo: o prazo sem o ícone (só a cor diz)", P, "  return cpaSelo(cpaClasseFaixa(p.faixa), `${cpaIconeFaixa(p.faixa)} ${p.texto}`);", "  return cpaSelo(cpaClasseFaixa(p.faixa), `${p.texto}`);"],
  ["selo: a cor do prazo ignora a faixa do servidor", P, "  return cpaSelo(cpaClasseFaixa(p.faixa), `${cpaIconeFaixa(p.faixa)} ${p.texto}`);", "  return cpaSelo(\"cal-st-homologado\", `${cpaIconeFaixa(p.faixa)} ${p.texto}`);"],
  ["selo: o vencido fica com a cor de atenção", P, "VENCIDO: \"cal-st-indeferido cpa-vencido\" };", "VENCIDO: \"cal-st-proposto\" };"],
  ["selo: o sem responsável não é marcado", P, ": \"<strong class='cpa-sem-resp'>SEM RESPONSÁVEL</strong>\";", ": \"\";"],
  ["cartão: o urgente sem a borda vermelha", P, "<div class=\"cal-cartao cpa-cartao${i.urgente ? \" cpa-cartao-urgente\" : \"\"}\">", "<div class=\"cal-cartao cpa-cartao\">"],
  ["cartão: a fila não mostra o responsável", P, "    : `<p class=\"cpa-linha\">Responsável: ${cpaHtmlResponsavel(i)}</p>`;", "    : \"\";"],
  ["cartão: o responsável não vê o contato", P, "${i.contato ? `<p class=\"cpa-linha\">Contato: ${cpaHtmlContato(i.contato)}</p>` : \"\"}", ""],
  ["cartão: o responsável não vê o motivo", P, "${i.motivo ? `<p class=\"cpa-linha\">Motivo: ${escaparHtmlEbd(i.motivo)}</p>` : \"\"}", ""],
  ["cartão: o encerrado em 'meus' vira cartão comum (com contato e botão)", P, "  if (ctx === \"Meu\" && (i.encerrado === true || i.status !== \"ABERTO\")) {", "  if (false) {"],
  ["cartão: a detecção não explica o porquê", P, "    ${i.origem === \"DETECCAO\" && i.deteccaoResumo ? `<p class=\"cpa-linha cpa-deteccao\">", "    ${false ? `<p class=\"cpa-linha cpa-deteccao\">"],
  ["cartão: 'Abrir' de 'meus' abre na aba da liderança", P, "data-args-click=\"${argsAttr(ctx, Number(i.itemId), ARG.elemento)}\">📂 Abrir acompanhamento</button></div>", "data-args-click=\"${argsAttr(\"Ges\", Number(i.itemId), ARG.elemento)}\">📂 Abrir acompanhamento</button></div>"],
  ["contato: o telefone não vira link de ligar", P, "    return !parte.includes(\"@\") && digitos.length >= 8 && digitos.length <= 13\n", "    return false\n"],
  ["contato: o link tel: leva o texto cru", P, "      ? `<a class=\"cpa-tel-linha\" href=\"${urlSegura(`tel:${digitos}`)}\">", "      ? `<a class=\"cpa-tel-linha\" href=\"tel:${parte}\">"],
  ["contato: sem contato não diz nada", P, "  if (!texto) return \"<span class='psc-legenda'>sem contato no cadastro</span>\";", "  if (!texto) return \"\";"],

  // ---- seções
  ["seção: trocar de seção não fecha o acompanhamento", P, "  // trocar de seção (ou tocar de novo nela) fecha o acompanhamento aberto (e a nota) e tira da página os textos dos pedidos: nada fica à espera escondido\n  cpaFecharDetalheInterno(\"Ges\");\n", ""],
  ["seção: sair dos pedidos deixa os textos na página", P, "  if (secao !== \"pedidos\") { cpaSeqPed++; cpaPedidos = []; cpaPedFormAberto = 0; cpaEsvaziar([\"cpaPedLista\", \"cpaRegPedCx\"]);", "  if (secao !== \"pedidos\") { cpaSeqPed++; cpaPedidos = []; cpaPedFormAberto = 0;"],
  ["seção: sair dos pedidos não descarta a resposta a caminho", P, "  if (secao !== \"pedidos\") { cpaSeqPed++; cpaPedidos = [];", "  if (secao !== \"pedidos\") { cpaPedidos = [];"],
  ["seção: sair da fila deixa a fila na página", P, "  if (secao !== \"fila\") { cpaSeqFila++; cpaSeqBusca++; cpaFila = []; cpaBuscaRes = {}; cpaEscolhas = {}; cpaEsvaziar([\"cpaFilaLista\", \"cpaNovoCx\"]);", "  if (secao !== \"fila\") { cpaSeqFila++; cpaSeqBusca++; cpaFila = []; cpaBuscaRes = {}; cpaEscolhas = {};"],
  ["seção: sair da fila não descarta a fila a caminho", P, "  if (secao !== \"fila\") { cpaSeqFila++; cpaSeqBusca++;", "  if (secao !== \"fila\") { cpaSeqBusca++;"],
  ["seção: os botões não dizem qual está ativo (aria-pressed)", P, "b.setAttribute(\"aria-pressed\", s === secao ? \"true\" : \"false\"); }", "b.setAttribute(\"aria-pressed\", \"false\"); }"],
  ["seção: o boletim não carrega", P, "  if (secao === \"boletim\") cpaCarregarBoletimAcao();\n", ""],
  ["seção: o painel não carrega", P, "  if (secao === \"painel\") cpaCarregarPainelAcao();\n", ""],
  ["seção: os pedidos não carregam", P, "  if (secao === \"pedidos\") cpaCarregarPedidosAcao();\n", ""],
  ["seção: abrir a aba não volta à lista (a nota aberta fica à espera)", P, "  cpaFecharDetalheInterno(\"Ges\");   // abrir a aba (ou tocar nela de novo) sempre volta à lista", "  // abrir a aba (ou tocar nela de novo) sempre volta à lista"],
  ["pílulas: os pedidos não dizem qual pílula está ativa", P, "b.setAttribute(\"aria-pressed\", s === cpaSituacaoPedidos ? \"true\" : \"false\"); }", "b.setAttribute(\"aria-pressed\", \"false\"); }"],

  // ---- abrir acompanhamento
  ["abrir: tocar de novo apaga o que a pessoa escreveu", P, "  if (cx.innerHTML !== \"\") { cpaFocarId(\"cpaNovoTipo\"); return; }   // já aberto", "  // já aberto"],
  ["abrir: com uma congregação só, ela não vem escolhida", P, "  if (congAtual) { const sel = cpaEl(\"cpaNovoCong\"); if (sel) sel.value = String(congAtual); }\n", ""],
  ["abrir: o foco não vai para o tipo", P, "  cpaRolarPara(\"cpaNovoCx\");\n  cpaFocarId(\"cpaNovoTipo\");", "  cpaRolarPara(\"cpaNovoCx\");"],
  ["abrir: fechar não devolve o foco ao botão", P, "  cpaGatilhoForm = null;\n  if (gatilho && gatilho.isConnected) cpaFocar(gatilho);\n}\nfunction cpaMudouTipoNovoAcao()", "  cpaGatilhoForm = null;\n}\nfunction cpaMudouTipoNovoAcao()"],
  ["abrir: a descrição do tipo não aparece", P, "  if (desc) desc.textContent = t ? `${t.descricao || \"\"}", "  if (desc) desc.textContent = t ? `${\"\"}"],
  ["abrir: 'só do cadastro' não marca 'Sim' sozinho", P, "  if (t && t.soMembro) { const sim = cpaEl(\"cpaNovoCadSim\")", "  if (false) { const sim = cpaEl(\"cpaNovoCadSim\")"],
  ["abrir: 'não é do cadastro' mostra a busca", P, "  cpaMostrar(\"cpaNovoMembroCx\", sim === true);", "  cpaMostrar(\"cpaNovoMembroCx\", sim !== null);"],
  ["abrir: trocar a congregação não apaga as escolhas", P, "  [\"novoPessoa\", \"novoResp\"].forEach(alvo => { cpaBuscaRes[alvo] = []; cpaEscolhas[alvo] = null; });\n", ""],
  ["abrir: o motivo vazio vai no corpo", P, "  if (motivo) corpo.motivo = motivo;\n  if (cpaEscolhas.novoResp)", "  corpo.motivo = motivo;\n  if (cpaEscolhas.novoResp)"],
  ["abrir: o responsável escolhido não vai no corpo", P, "  if (cpaEscolhas.novoResp) corpo.responsavelMembroId = cpaEscolhas.novoResp.membroId;\n", ""],
  ["abrir: o urgente não vai no corpo", P, "  const corpo = { tipo, congregacaoId, urgente: cpaMarcado(\"cpaNovoUrgente\") };", "  const corpo = { tipo, congregacaoId, urgente: false };"],
  ["abrir: o formulário não fecha depois de abrir", P, "    if (data.sucesso === false) { cpaMostrarResultado(data, \"cpaNovoMsg\", true); return; }\n    cpaFecharNovoAcao();", "    if (data.sucesso === false) { cpaMostrarResultado(data, \"cpaNovoMsg\", true); return; }"],
  ["abrir: a recusa do servidor fecha o formulário", P, "    if (data.sucesso === false) { cpaMostrarResultado(data, \"cpaNovoMsg\", true); return; }\n    cpaFecharNovoAcao();", "    if (data.sucesso === false) { cpaFecharNovoAcao(); cpaMostrarResultado(data, \"cpaFilaMsg\", true); return; }\n    cpaFecharNovoAcao();"],
  ["abrir: a mensagem do servidor some depois de reler a fila", P, "    if (cpaViva(marca) && cpaSecaoViva(\"fila\")) cpaEscrever(\"cpaFilaMsg\", msg, !(data.responsavel && data.responsavel.nome));\n", ""],

  // ---- a busca de pessoas
  ["busca: sem congregação busca mesmo assim", P, "  if (!congregacaoId) { res.textContent = \"Escolha a congregação antes de buscar.\"; return; }\n", ""],
  ["busca: 1 letra é aceita", P, "  if (q.length < 2 || q.length > 60 || /[<>%_[\\]]/.test(q))", "  if (q.length > 60 || /[<>%_[\\]]/.test(q))"],
  ["busca: % e _ são aceitos", P, "  if (q.length < 2 || q.length > 60 || /[<>%_[\\]]/.test(q))", "  if (q.length < 2 || q.length > 60)"],
  ["busca: o responsável pode ser menor de idade", P, "(!cfg.soMaior || p.maior === true)", "(true)"],
  ["busca: o menor não é marcado na lista", P, "${p.maior === false ? cpaSelo(\"cal-st-proposto\", \"menor de idade\") : \"\"}", ""],
  ["busca: quem é da liderança não é marcado", P, "${p.lideranca ? cpaSelo(\"cal-st-deferido\", \"liderança\") : \"\"}", ""],
  ["busca: a troca diz 'Escolher' (sem nomear)", P, "  const rotuloBotao = alvo === \"troca\" ? \"Nomear\" : \"Escolher\";", "  const rotuloBotao = \"Escolher\";"],
  ["busca: escolher não apaga a lista", P, "  const res = cpaEl(cfg.res);\n  if (res) res.innerHTML = \"\";\n  cpaBuscaRes[alvo] = [];\n}", "  cpaBuscaRes[alvo] = [];\n}"],
  ["busca: a busca que chega depois de fechar o formulário entra (as duas camadas desfeitas)", P, [
    ["    if (seq !== cpaSeqBusca || !cpaViva(marca) || cpaEl(cfg.res) !== res || !res.isConnected) return;", "    if (false) return;"]
  ]],
  ["busca: a troca de responsável não pede confirmação", P, "  if (!(await confirmarAcao(`Nomear ${String(p.nome == null ? \"\" : p.nome)} como responsável", "  if (false && !(await confirmarAcao(`Nomear ${String(p.nome == null ? \"\" : p.nome)} como responsável"],

  // ---- o detalhe
  ["detalhe: fechar não descarta o acompanhamento a caminho", P, "  if ((cpaDet && cpaDet.ctx === ctx) || cpaDetCarregando === ctx) {", "  if ((cpaDet && cpaDet.ctx === ctx)) {"],
  ["detalhe: fechar não esvazia o conteúdo", P, "  const conteudo = cpaEl(ids.conteudo);\n  if (conteudo) conteudo.innerHTML = \"\";\n  cpaEscrever(ids.msg, \"\", false);\n  cpaMostrar(ids.cx, false);", "  cpaEscrever(ids.msg, \"\", false);\n  cpaMostrar(ids.cx, false);"],
  ["detalhe: fechar não sobe a sequência do detalhe", P, "    cpaSeqDet++; cpaSeqNotas++; cpaSeqLeit++;\n    cpaBuscaRes.troca = [];", "    cpaSeqNotas++; cpaSeqLeit++;\n    cpaBuscaRes.troca = [];"],
  ["detalhe: voltar não devolve o foco ao botão de onde veio", P, "  if (gatilho && gatilho.isConnected) cpaFocar(gatilho);\n  else cpaFocarId(ctx === \"Meu\" ? \"cpaMeusTitulo\" : \"cpaFilaTitulo\");", "  cpaFocarId(ctx === \"Meu\" ? \"cpaMeusTitulo\" : \"cpaFilaTitulo\");"],
  ["detalhe: voltar em 'meus' não refaz a lista", P, "  if (ctx === \"Meu\") cpaRenderMeus();   // a lista volta com o que mudou", "  // a lista volta com o que mudou"],
  ["detalhe: um acompanhamento aberto em cada tela ao mesmo tempo", P, "  cpaFecharDetalheInterno(ctx === \"Ges\" ? \"Meu\" : \"Ges\");   // um só acompanhamento aberto por vez\n", ""],
  ["detalhe: o 404 mostra a mensagem do servidor (não a neutra)", P, "    if (data.httpStatus === 404) cpaEscrever(ids.msg, CPA_MSG_NAO_ABRIU, true); else", "    if (false) cpaEscrever(ids.msg, CPA_MSG_NAO_ABRIU, true); else"],
  ["detalhe: a falha deixa o conteúdo antigo", P, "    cpaDet = null; cpaNotas = [];\n    if (conteudo) conteudo.innerHTML = \"\";", "    cpaDet = null; cpaNotas = [];"],
  ["detalhe: o foco não vai para o título", P, "  if (focar) { cpaRolarPara(ids.cx); cpaFocarId(\"cpaDetTitulo\"); }", "  if (focar) { cpaRolarPara(ids.cx); }"],
  ["detalhe: o encerrado ganha os botões de ação", P, "  if (!d.item || d.item.status !== \"ABERTO\") return \"\";", "  if (!d.item) return \"\";"],
  ["detalhe: o menor de idade não manda falar com os pais", P, "    ${i.menor ? \"<p class='cnl-aviso-senha cpa-aviso-menor' role='note'>", "    ${false ? \"<p class='cnl-aviso-senha cpa-aviso-menor' role='note'>"],
  ["detalhe: o encerrado mostra o contato", P, "      ${cpaCampo(\"Contato\", aberto ? cpaHtmlContato(i.contato) : \"\")}", "      ${cpaCampo(\"Contato\", cpaHtmlContato(i.contato))}"],
  ["detalhe: a detecção não diz o que não mede", P, "    ${i.origem === \"DETECCAO\" ? \"<p class='psc-legenda'>A detecção compara", "    ${false ? \"<p class='psc-legenda'>A detecção compara"],
  ["detalhe: o caminho do abandono não aparece", P, "    ${i.sugestaoAbandono ? \"<p class='cnl-aviso-senha' role='note'>Se a pessoa não voltar", "    ${false ? \"<p class='cnl-aviso-senha' role='note'>Se a pessoa não voltar"],
  ["histórico: quem foi junto não aparece", P, "    if (e.acompanhante) partes.push(`foi junto: ${escaparHtmlEbd(e.acompanhante)}`);\n", ""],
  ["histórico: 'não conseguiu falar' não aparece", P, "    if (e.conseguiu === false) partes.push(\"não conseguiu falar\");\n", ""],
  ["histórico: a observação não aparece", P, "      ${e.observacao ? `<p class=\"cpa-texto\">${escaparHtmlEbd(e.observacao)}</p>` : \"\"}</li>`;", "      </li>`;"],
  ["histórico: o degrau não aparece", P, "    if (e.nivelParaRotulo) partes.push(`subiu para: ${escaparHtmlEbd(e.nivelParaRotulo)}`);\n", ""],

  // ---- os formulários do acompanhamento e os atos
  ["contato: a data mínima ignora o limite de 7 dias", P, "  const min = calSomarDias(hoje, -cpaLimite(\"contatoRetroativoDias\"));", "  const min = calSomarDias(hoje, -30);"],
  ["contato: a regra da visita não aparece ao escolher visita", P, "  const presencial = !!cpaCatalogos && cpaCatalogos.formasPresenciais.includes(cpaTexto(\"cpaFcForma\"));", "  const presencial = false;"],
  ["contato: a regra da visita não reaparece na recusa", P, "if (forma && cpaCatalogos.formasPresenciais.includes(forma)) cpaMostrar(\"cpaFcRegra\", true); return; }", "return; }"],
  ["contato: a data escolhida não vai no corpo", P, "  if (data) corpo.data = data;\n", ""],
  ["contato: quem foi junto não vai no corpo", P, "  if (acompanhante) corpo.acompanhante = acompanhante;\n", ""],
  ["formulário: o foco não vai para o primeiro campo", P, "  cpaRolarPara(\"cpaFormAcao\");\n  cpaFocarId(CPA_PRIMEIRO_CAMPO[tipo]);", "  cpaRolarPara(\"cpaFormAcao\");"],
  ["formulário: fechar não devolve o foco", P, "function cpaFecharFormAcao() {\n  cpaFecharFormInterno();\n  const gatilho = cpaGatilhoForm;\n  cpaGatilhoForm = null;\n  if (gatilho && gatilho.isConnected) cpaFocar(gatilho);", "function cpaFecharFormAcao() {\n  cpaFecharFormInterno();\n  const gatilho = cpaGatilhoForm;\n  cpaGatilhoForm = null;"],
  ["concluir: o afastamento não lembra que o abandono é manual", P, "    ${i.tipo === \"AFASTAMENTO\" ? \"<p class='psc-legenda'>Se a pessoa não foi localizada", "    ${false ? \"<p class='psc-legenda'>Se a pessoa não foi localizada"],
  ["concluir: o caminho do abandono não fica em destaque", P, "r.sucesso !== false && r.sugestaoAbandono === true);", "false);"],
  ["ato: a resposta de outro acompanhamento entra no de agora", P, "  if (!cpaViva(marca) || !cpaDet || cpaDet.itemId !== itemId || cpaDet.ctx !== marca.ctx) return;", "  if (!cpaViva(marca) || !cpaDet) return;"],
  ["ato: a resposta do ato entra fora da tela", P, "  if (!cpaViva(marca) || !cpaDet || cpaDet.itemId !== itemId || cpaDet.ctx !== marca.ctx) return;", "  if (!cpaDet || cpaDet.itemId !== itemId || cpaDet.ctx !== marca.ctx) return;"],
  ["ato: o sucesso não relê o acompanhamento", P, "  if (data.sucesso !== false) { if (!data.jaAvisado) mostrarToast(cpaMsgErro(data), \"sucesso\"); await cpaDepoisDoAto(data, destaqueOk); return; }", "  if (data.sucesso !== false) { if (!data.jaAvisado) mostrarToast(cpaMsgErro(data), \"sucesso\"); return; }"],
  ["ato: o 409 não relê o acompanhamento", P, "  if (data.httpStatus === 409) {", "  if (false) {"],
  ["ato: o 409 não fica em destaque", P, "mostrarToast(cpaMsgErro(data), \"erro\"); await cpaDepoisDoAto(data, true); return; }", "mostrarToast(cpaMsgErro(data), \"erro\"); await cpaDepoisDoAto(data, false); return; }"],
  ["ato: o 404 deixa o acompanhamento aberto", P, "  if (data.httpStatus === 404) {\n    const ctx = cpaDet.ctx;", "  if (false) {\n    const ctx = cpaDet.ctx;"],
  ["ato: o 404 não diz nada na lista", P, "    cpaEscrever(ctx === \"Meu\" ? \"cpaMeuMsg\" : \"cpaFilaMsg\", CPA_MSG_NAO_ABRIU, true);\n    if (ctx === \"Ges\") cpaCarregarFilaAcao(); else cpaRecarregarMeus();\n    return;", "    if (ctx === \"Ges\") cpaCarregarFilaAcao(); else cpaRecarregarMeus();\n    return;"],
  ["ato: a recusa do servidor não aparece no formulário", P, "    return;\n  }\n  cpaMostrarResultado(data, idMsgForm, true);\n}", "    return;\n  }\n}"],
  ["ato: depois do ato a mensagem do servidor não aparece", P, "    cpaEscrever(cpaIdsDoCtx(ctx).msg, cpaMsgErro(data), !!destaque || data.sucesso === false);", "    cpaEscrever(cpaIdsDoCtx(ctx).msg, \"\", false);"],
  ["ato: depois do ato o foco não vai ao título (o botão sumiu)", P, "    cpaFocarId(\"cpaDetTitulo\");   // o botão do ato sumiu", "    // o botão do ato sumiu"],
  ["ato: o voluntário que concluiu volta à lista sem a mensagem", P, "    cpaEscrever(ctx === \"Meu\" ? \"cpaMeuMsg\" : \"cpaFilaMsg\", cpaMsgErro(data), !!destaque);\n", ""],
  ["ato: o concluído do voluntário não volta à lista", P, "  } else if (data.sucesso !== false && !(cpaDet && cpaDet.ctx === ctx)) {", "  } else if (false) {"],
  ["ato: depois do ato a fila/meus não é relida", P, "  if (ctx === \"Ges\") cpaCarregarFilaAcao(); else cpaRecarregarMeus();\n}\n// a resposta de um ato", "}\n// a resposta de um ato"],
  ["adiar: o corpo leva o prazo de hoje", P, "cpaPostar(\"adiar\", { itemId, novoPrazo, motivo })", "cpaPostar(\"adiar\", { itemId, novoPrazo: cpaHojeDe(cpaDet.dados.agora), motivo })"],
  ["adiar: o campo vai além do limite de dias", P, "  const max = calSomarDias(hoje, cpaLimite(\"adiarDias\"));", "  const max = calSomarDias(hoje, 365);"],
  ["cancelar: sem confirmação", P, "  if (!(await confirmarAcao(\"Cancelar este acompanhamento?", "  if (false && !(await confirmarAcao(\"Cancelar este acompanhamento?"],

  // ---- pedidos de oração (moderação)
  ["pedidos: o filtro de congregação não vai na consulta", P, "${congregacaoId ? `&congregacaoId=${congregacaoId}` : \"\"}", ""],
  ["pedidos: a falha deixa a lista antiga", P, "    cpaPedidos = [];\n    if (lista) lista.innerHTML = \"\";\n    cpaMostrarResultado(data, \"cpaPedMsg\", true);", "    cpaPedidos = [];\n    cpaMostrarResultado(data, \"cpaPedMsg\", true);"],
  ["pedidos: o 'só para a liderança' ganha Publicar", P, "      ${aguardando && p.podeBoletim ? `<button", "      ${aguardando ? `<button"],
  ["pedidos: o que está no boletim não tem 'Tirar do boletim'", P, "  const aprovado = !risco && p.moderacao === \"APROVADO\";", "  const aprovado = false;"],
  ["pedidos: o acompanhamento encerrado vira 'Ver acompanhamento'", P, "      ${p.itemId && p.itemAberto !== false ? `<button", "      ${p.itemId ? `<button"],
  ["pedidos: o pedido com acompanhamento aberto ganha outro 'Abrir'", P, "      ${!doSite && (!p.itemId || p.itemAberto === false) ? `<button", "      ${!doSite ? `<button"],
  ["(v7.11.1) mural: o pedido do site oferece 'Abrir acompanhamento'", P, "      ${!doSite && (!p.itemId || p.itemAberto === false) ? `<button", "      ${(!p.itemId || p.itemAberto === false) ? `<button"],
  ["(v7.11.1) mural: o pedido do site leva o selo de 'cita a liderança'", P, "    p.soNivelGeral && !doSite ? cpaSelo(", "    p.soNivelGeral ? cpaSelo("],
  ["(v7.11.1) mural: o pedido do site não é reconhecido", P, "  const doSite = p.origem === \"SITE\";", "  const doSite = false;"],
  ["pedidos: abrir outro acompanhamento para um pedido que já tem um aberto", P, "  if (!p || (p.itemId && p.itemAberto !== false)) return;", "  if (!p) return;"],
  ["pedidos: o alarme falso desmarcado não aparece", P, "${cpaCampo(\"Alarme falso desmarcado\", !risco && p.riscoJaTeve && p.riscoDesmarcadoMotivo ?", "${cpaCampo(\"Alarme falso desmarcado\", false ?"],
  ["pedidos: quem pediu não aparece", P, "      ${cpaCampo(\"Quem pediu\", escaparHtmlEbd(p.solicitante || \"(sem nome)\"))}\n", ""],
  ["pedidos: o 'quer contato' não aparece", P, "    p.querContato ? cpaSelo(\"cal-st-proposto\", \"📞 quer que alguém fale com ele(a)\") : \"\",", "    \"\","],
  ["pedidos: o selo 'Só o nível geral' some", P, "    p.soNivelGeral && !doSite ? cpaSelo(\"cal-st-indeferido\", \"🔒 Só o nível geral (cita a liderança)\") : \"\"", "    \"\""],
  ["pedidos: publicar abre num pedido 'só para a liderança'", P, "  if (!p || p.risco || !p.podeBoletim) return;", "  if (!p || p.risco) return;"],
  ["pedidos: publicar abre num pedido com risco", P, "  if (!p || p.risco || !p.podeBoletim) return;", "  if (!p || !p.podeBoletim) return;"],
  ["pedidos: a sugestão do servidor não vem no campo", P, "spellcheck=\"false\">${escaparHtmlEbd(p.sugestaoBoletim || \"\")}</textarea>", "spellcheck=\"false\"></textarea>"],
  ["pedidos: o foco não vai para a linha do boletim", P, "  </div>`;\n  cpaFocarId(\"cpaPubTexto\");", "  </div>`;"],
  ["pedidos: o foco não vai para o motivo do desmarcar", P, "  </div>`;\n  cpaFocarId(\"cpaDesMotivo\");", "  </div>`;"],
  ["pedidos: publicar manda o texto do pedido no boletim", P, "{ pedidoId: id, decisao: \"APROVAR\", textoBoletim: texto }", "{ pedidoId: id, decisao: \"APROVAR\", textoBoletim: p.texto }"],
  ["pedidos: o 409/404 não relê a lista", P, "  if (data.httpStatus === 409 || data.httpStatus === 404) { await cpaDepoisDoPedido(marca, data); return; }\n", ""],
  ["pedidos: só o 409 relê a lista (o 404 fica no formulário)", P, "  if (data.httpStatus === 409 || data.httpStatus === 404) { await cpaDepoisDoPedido(marca, data); return; }", "  if (data.httpStatus === 409) { await cpaDepoisDoPedido(marca, data); return; }"],
  ["pedidos: a recusa que chega depois de sair da aba é pintada", P, "async function cpaFalhaDoPedido(marca, data, idMsg) {\n  if (!cpaViva(marca)) return;", "async function cpaFalhaDoPedido(marca, data, idMsg) {"],
  ["pedidos: a recusa do publicar não fica no formulário", P, "  cpaMostrarResultado(data, cpaEl(idMsg) ? idMsg : \"cpaPedMsg\", true);", "  cpaMostrarResultado(data, \"cpaPedMsg\", true);"],
  ["pedidos: depois do ato a lista não é relida", P, "  if (!data.jaAvisado) mostrarToast(msg, alerta ? \"erro\" : \"sucesso\");\n  await cpaCarregarPedidosAcao();", "  if (!data.jaAvisado) mostrarToast(msg, alerta ? \"erro\" : \"sucesso\");"],
  ["pedidos: depois do ato a mensagem do servidor some", P, "  if (cpaViva(marca) && cpaSecaoViva(\"pedidos\")) cpaEscrever(\"cpaPedMsg\", msg, alerta);\n", ""],
  ["pedidos: 'Ver acompanhamento' deixa os textos dos pedidos na página", P, "  cpaSeqPed++; cpaPedidos = []; cpaEsvaziar([\"cpaPedLista\"]);   // os textos", "  cpaSeqPed++; cpaPedidos = [];   // os textos"],
  ["pedidos: 'Ver acompanhamento' não abre na fila", P, "  cpaSecaoAtual = \"fila\";\n  cpaAplicarSecao(\"fila\");\n  cpaSeqPed++;", "  cpaSecaoAtual = \"fila\";\n  cpaSeqPed++;"],
  ["pedidos: a pílula escolhida não vale", P, "  cpaSituacaoPedidos = CPA_SITUACOES_PEDIDOS.includes(situacaoBruta) ? situacaoBruta : \"AGUARDANDO\";", "  cpaSituacaoPedidos = \"AGUARDANDO\";"],

  // ---- o pedido recebido em mãos
  ["em mãos: tocar de novo apaga o que foi escrito", P, "  if (cx.innerHTML !== \"\") { cpaFocarId(\"cpaRpCong\"); return; }\n", ""],
  ["em mãos: a congregação não vem escolhida", P, "  if (cong) { const sel = cpaEl(\"cpaRpCong\"); if (sel) sel.value = String(cong); }\n", ""],
  ["em mãos: o foco não vai para a congregação", P, "  if (cong) { const sel = cpaEl(\"cpaRpCong\"); if (sel) sel.value = String(cong); }\n  cpaFocarId(\"cpaRpCong\");", "  if (cong) { const sel = cpaEl(\"cpaRpCong\"); if (sel) sel.value = String(cong); }"],
  ["em mãos: 'não é do cadastro' não mostra nome e contato", P, "  if (fora) fora.style.display = sim === false ? \"\" : \"none\";", "  if (fora) fora.style.display = \"none\";"],
  ["em mãos: do cadastro, a matrícula não vai", P, "  if (!problema && cadastro) corpo.membroId = cpaEscolhas.regMembro.membroId;\n", ""],
  ["em mãos: o nome de quem pediu não vai", P, "    corpo.solicitanteNome = nome;\n", ""],
  ["em mãos: o contato de quem pediu não vai", P, "    if (contato) corpo.solicitanteContato = contato;\n", ""],
  ["em mãos: registrado, o formulário não fecha", P, "    const msg = cpaMsgErro(data);\n    cpaFecharRegistrarPedidoAcao();", "    const msg = cpaMsgErro(data);"],
  ["em mãos: fechar não devolve o foco", P, "  cpaBuscaRes.regMembro = []; cpaEscolhas.regMembro = null;\n  const gatilho = cpaGatilhoForm;\n  cpaGatilhoForm = null;\n  if (gatilho && gatilho.isConnected) cpaFocar(gatilho);", "  cpaBuscaRes.regMembro = []; cpaEscolhas.regMembro = null;\n  const gatilho = cpaGatilhoForm;\n  cpaGatilhoForm = null;"],
  ["em mãos: o 'para quem' padrão some", P, "  const paraQuem = cpaTexto(\"cpaRpParaQuem\") || \"PROPRIO\";", "  const paraQuem = cpaTexto(\"cpaRpParaQuem\");"],

  // ---- boletim e painel
  ["boletim: imprimir sem a classe de impressão", P, "  if (classes) classes.add(\"cpa-imprimindo\");\n", ""],
  ["boletim: a classe sai logo depois do print() (o celular imprime a página inteira)", P, "finally { if (!comEvento && classes) classes.remove(\"cpa-imprimindo\"); }", "finally { if (classes) classes.remove(\"cpa-imprimindo\"); }"],
  ["boletim: o afterprint não tira a classe de impressão", P, "  window.addEventListener(\"afterprint\", cpaDepoisDeImprimir);\n", ""],
  ["boletim: tirar a impressão não tira a classe", P, "function cpaLimparImpressao() { const c = document.body && document.body.classList; if (c) c.remove(\"cpa-imprimindo\"); }", "function cpaLimparImpressao() { }"],
  ["boletim (CSS): a fila, o painel, 'meus' e o acompanhamento saem num Ctrl+P comum", C, ",\n  #cpaFilaLista, #cpaPainelLista, #cpaMeusLista, #cpaDetalheGes, #cpaDetalheMeu { display: none !important; }", " { display: none !important; }"],
  ["boletim (CSS): a nota aberta sai num Ctrl+P comum", C, "#cpaDetalheGesCx, #cpaDetalheMeuCx, #cpaNotaCx, .cpa-notas,", "#cpaDetalheGesCx, #cpaDetalheMeuCx, .cpa-notas,"],
  ["boletim (CSS): imprimir leva a página inteira (não só o boletim)", C, "  body.cpa-imprimindo * { visibility: hidden !important; }\n", ""],
  ["boletim: o filtro de congregação não vai na consulta", P, "  const data = await cpaObter(`boletim${congregacaoId ? `?congregacaoId=${congregacaoId}` : \"\"}`);", "  const data = await cpaObter(`boletim`);"],
  ["boletim: a liderança não vê a congregação de cada linha", P, "    ${cpaHtmlBoletim(data.linhas, true)}`;", "    ${cpaHtmlBoletim(data.linhas, false)}`;"],
  ["boletim: o de Meu Painel mostra o cabeçalho da congregação", P, "  cx.innerHTML = cpaHtmlBoletim(data.linhas, false);", "  cx.innerHTML = cpaHtmlBoletim(data.linhas, true);"],
  ["boletim: a falha deixa o boletim antigo", P, "  if (data.sucesso === false || !Array.isArray(data.linhas)) { if (cx) cx.innerHTML = \"\"; cpaMostrarResultado(data, \"cpaBolMsg\", true); return; }", "  if (data.sucesso === false || !Array.isArray(data.linhas)) { cpaMostrarResultado(data, \"cpaBolMsg\", true); return; }"],
  ["painel: vencidos sem destaque", P, "<td class=\"${Number(c.vencidos) > 0 ? \"cpa-num-alerta\" : \"\"}\">", "<td class=\"\">"],
  ["painel: a tabela sem a caixa que rola", P, "  cx.innerHTML = linhas.length ? `<div class=\"cpa-rolagem\"><table", "  cx.innerHTML = linhas.length ? `<div><table"],
  ["painel: o vazio vira zero", P, "function cpaNumeroOuTraco(v) { return v == null || !Number.isFinite(Number(v)) ? \"—\" : String(Number(v)).replace(\".\", \",\"); }", "function cpaNumeroOuTraco(v) { return String(Number(v || 0)).replace(\".\", \",\"); }"],

  // ---- Meu Painel
  ["Meu Painel: quem não é responsável vê 'Meus acompanhamentos'", P, "  cpaMostrar(\"cpaMeusCx\", cpaMeus.length > 0 || !!(cpaDet && cpaDet.ctx === \"Meu\"));", "  cpaMostrar(\"cpaMeusCx\", true);"],
  ["Meu Painel: a falha de 'meus' não é dita", P, "  } else if (meus.httpStatus !== 404) cpaEscrever(\"cpaMeuMsg\", `Não foi possível carregar os seus acompanhamentos: ${cpaMsgErro(meus)}`, true);", "  }"],
  ["Meu Painel: voltar ao Meu Painel apaga o que a pessoa escrevia", P, "  if (fo && fo.innerHTML === \"\") {", "  if (fo) {"],
  ["Meu Painel: o pedido não começa 'por mim'", P, "id=\"cpaPoParaMim\" value=\"PROPRIO\" checked />", "id=\"cpaPoParaMim\" value=\"PROPRIO\" />"],
  ["Meu Painel: o boletim já vem escolhido", P, "<input type=\"radio\" name=\"cpaPoBol\" id=\"cpaPoBolNao\" value=\"nao\" />", "<input type=\"radio\" name=\"cpaPoBol\" id=\"cpaPoBolNao\" value=\"nao\" checked />"],
  ["oração: 'por outra pessoa' não vai no corpo", P, "  const paraQuem = cpaMarcado(\"cpaPoParaOutra\") ? \"OUTRA_PESSOA\" : \"PROPRIO\";", "  const paraQuem = \"PROPRIO\";"],
  ["oração: 'quero que falem comigo' não vai no corpo", P, "  const corpo = { categoria, texto, paraQuem, podeBoletim, querContato: cpaMarcado(\"cpaPoQuerContato\") };", "  const corpo = { categoria, texto, paraQuem, podeBoletim, querContato: false };"],
  ["oração: a recusa (429) apaga o texto", P, "    if (data.sucesso === false) { cpaMostrarRespostaComum(\"cpaOracaoResultado\", data, false);", "    if (data.sucesso === false) { const c0 = cpaEl(\"cpaPoTexto\"); if (c0) c0.value = \"\"; cpaMostrarRespostaComum(\"cpaOracaoResultado\", data, false);"],
  ["oração: o enviado fica no campo", P, "    if (campo && cpaTexto(\"cpaPoTexto\") === texto) { campo.value = \"\"; cpaContarPedidoAcao(); }", "    "],
  ["oração: o que a pessoa digitou depois de enviar é apagado", P, "    if (campo && cpaTexto(\"cpaPoTexto\") === texto) { campo.value = \"\";", "    if (campo) { campo.value = \"\";"],
  ["oração: as escolhas (boletim, contato) ficam marcadas", P, "    [\"cpaPoBolSim\", \"cpaPoBolNao\", \"cpaPoQuerContato\"].forEach(id => { const el = cpaEl(id); if (el) el.checked = false; });\n", ""],
  ["oração: 'Meus pedidos' não é relido", P, "    [\"cpaPoBolSim\", \"cpaPoBolNao\", \"cpaPoQuerContato\"].forEach(id => { const el = cpaEl(id); if (el) el.checked = false; });\n    cpaCarregarMeusPedidosAcao();", "    [\"cpaPoBolSim\", \"cpaPoBolNao\", \"cpaPoQuerContato\"].forEach(id => { const el = cpaEl(id); if (el) el.checked = false; });"],
  ["oração: o contador não acompanha o texto", P, "function cpaContarPedidoAcao() { const c = cpaEl(\"cpaPoContador\"); if (c) c.textContent = String(cpaTexto(\"cpaPoTexto\").length); }", "function cpaContarPedidoAcao() { }"],
  ["oração: a resposta comum não recebe o foco", P, "${cpaHtmlContatos(data.ajuda)}</div>`;\n  cpaFocar(cx);", "${cpaHtmlContatos(data.ajuda)}</div>`;"],
  ["oração: a resposta de sucesso não diz o que o servidor disse", P, "<div class=\"cpa-ok\" role=\"status\"><p>✅ ${escaparHtmlEbd(cpaMsgErro(data))}</p></div>", "<div class=\"cpa-ok\" role=\"status\"><p>✅ Pedido enviado.</p></div>"],
  ["oração: a falha não é anunciada como alerta", P, "<div class=\"cpa-falha\" role=\"alert\">", "<div class=\"cpa-falha\">"],
  ["visita: o hospital não vai no corpo", P, "  const corpo = { motivo, hospital: cpaMarcado(\"cpaPvHospital\") };", "  const corpo = { motivo, hospital: false };"],
  ["visita: o contato não vai no corpo", P, "  if (contato) corpo.contato = contato;\n", ""],
  ["visita: o motivo enviado fica no campo", P, "    if (campo && cpaTexto(\"cpaPvMotivo\") === motivo) campo.value = \"\";\n", ""],
  ["visita: o hospital fica marcado", P, "    if (h) h.checked = false;\n", ""],
  ["visita: o contato enviado fica no campo", P, "    if (c2 && cpaTexto(\"cpaPvContato\") === contato) c2.value = \"\";\n", ""],
  ["meus pedidos: a falha deixa a lista antiga", P, "  if (data.sucesso === false) { if (cx) cx.innerHTML = \"\"; cpaMostrarResultado(data, \"cpaMeusPedidosMsg\", true); return; }", "  if (data.sucesso === false) { cpaMostrarResultado(data, \"cpaMeusPedidosMsg\", true); return; }"],
  ["meus pedidos: sem pedidos não diz nada", P, "\"Você ainda não fez nenhum pedido.\", false);", "\"\", false);"],
  ["meus pedidos: 'por outra pessoa' não aparece", P, "${p.paraQuem === \"OUTRA_PESSOA\" ? \" (por outra pessoa)\" : \"\"}", ""],
  ["meus pedidos: as visitas não aparecem", P, "    ${visitas.length ? `<h5>🏠 Pedidos de visita</h5>", "    ${false ? `<h5>🏠 Pedidos de visita</h5>"]
];

// ------------------------------------------------------------ monta a lista
function montarLista() {
  const codigo = lerApp(P);
  const geradas = [...gerarEscapes(codigo), ...gerarTravasDeResposta(codigo), ...gerarChavesDuploClique(codigo), ...gerarValidacoes(codigo), ...gerarCamposPrivados(codigo)]
    .filter(m => !(m[0].startsWith("escape (") && ESCAPES_DE_CONSTANTE.some(r => r.test(m[0]))));
  // duas chamadas iguais na mesma linha: a segunda leva " (2ª)" no nome
  const vistos = new Map();
  for (const m of geradas) { const n = (vistos.get(m[0]) || 0) + 1; vistos.set(m[0], n); if (n > 1) m[0] = `${m[0]} (${n}ª)`; }
  return [...MANUAIS, ...geradas];
}

// ------------------------------------------------------------ execução
function conferirAncora(arquivo, de) { return lerApp(arquivo).split(de).length - 1; }
function paresDe(m) { return Array.isArray(m[2]) ? m[2] : [[m[2], m[3]]]; }

async function executarUma(m) {
  const { rodar } = require("./roteiro");
  let T;
  try { T = await Promise.race([rodar({ mutar: { [m[1]]: paresDe(m) } }), new Promise((_, rej) => setTimeout(() => rej(new Error("TRAVOU (mais de 90 s)")), TRAVOU_MS))]); }
  // o roteiro que não termina (a mutação deixa uma espera sem fim) é uma mutação ACUSADA: num CI ele estouraria o tempo e reprovaria; só não pode contar como "falha do roteiro" comum
  catch (e) { return /^TRAVOU/.test(e.message) ? { nome: m[0], estado: "ACUSADA", detalhe: "o roteiro não termina (travou)", n: 1 } : { nome: m[0], estado: "INAPLICAVEL", detalhe: e.message.slice(0, 160) }; }
  if (T.falhas.some(f => /mutação inaplicável/.test(f))) return { nome: m[0], estado: "INAPLICAVEL", detalhe: T.falhas.find(f => /mutação inaplicável/.test(f)).slice(0, 160) };
  if (T.falhas.length) return { nome: m[0], estado: "ACUSADA", detalhe: T.falhas[0].slice(0, 120), n: T.falhas.length };
  return { nome: m[0], estado: "ESCAPOU" };
}

// um processo filho com o teto de memória; o pai o mata ao passar do tempo de parede
function filho(env, aoMensagem) {
  return new Promise((ok) => {
    const f = fork(__filename, [], { execArgv: TETO_MEMORIA, env: Object.assign({}, process.env, env) });
    const paredeDura = setTimeout(() => { try { f.kill(); } catch { /* já saiu */ } }, PAREDE_MS);
    f.on("message", aoMensagem);
    f.on("exit", (codigo) => { clearTimeout(paredeDura); ok(codigo); });
  });
}

if (process.env.CPA_SO_BASE) {
  // processo filho: só a rodada sem mutação, devolvida ao pai
  (async () => { const T = await require("./roteiro").rodar({}); process.send({ total: T.total, falhas: T.falhas }, () => process.exit(0)); })();
} else if (process.env.CPA_MUT_INDICE) {
  // processo filho: roda UMA mutação e devolve o resultado ao pai
  const lista = montarLista();
  const vivo = setInterval(() => {}, 1000);
  setInterval(() => { if (process.memoryUsage().rss > 2.4e9) process.exit(97); }, 500).unref();      // segunda cerca: memória fora do monte do V8 (o pai conta o que faltou como acusada)
  (async () => {
    const i = Number(process.env.CPA_MUT_INDICE);
    const r = await executarUma(lista[i]);
    clearInterval(vivo);
    process.send({ i, r }, () => process.exit(0));
  })();
} else {
  (async () => {
    const args = process.argv.slice(2);
    const conferir = args.includes("--conferir");
    const filtro = args.find(a => !a.startsWith("--")) || "";
    const todas = montarLista();
    const de = Number(process.env.CPA_DE || 0), ate = Number(process.env.CPA_ATE || Infinity);
    const nomesDaLista = process.env.CPA_LISTA ? new Set(fs.readFileSync(process.env.CPA_LISTA, "utf8").split(String.fromCharCode(10)).map(s => s.trim()).filter(Boolean)) : null;
    const indices = todas.map((m, i) => i).filter(i => i >= de && i < ate && todas[i][0].includes(filtro) && (!nomesDaLista || nomesDaLista.has(todas[i][0])));
    const nomes = todas.map(m => m[0]);
    const repetidos = nomes.filter((n, i) => nomes.indexOf(n) !== i);
    if (repetidos.length) { console.log(`nomes de mutação repetidos: ${[...new Set(repetidos)].join(" | ")}`); process.exit(2); }
    if (args.includes("--listar")) { indices.forEach(i => console.log(`${i}\t${todas[i][0]}`)); process.exit(0); }
    if (conferir) {
      let ruins = 0;
      for (const i of indices) for (const [a] of paresDe(todas[i])) { const n = conferirAncora(todas[i][1], a); if (n !== 1) { ruins++; console.log(`âncora com ${n} ocorrência(s): ${todas[i][0]} :: ${JSON.stringify(a.slice(0, 90))}`); } }
      console.log(`${indices.length} mutações (${MANUAIS.length} à mão, ${todas.length - MANUAIS.length} geradas), ${ruins} âncora(s) que não casam exatamente uma vez`);
      process.exit(ruins ? 1 : 0);
    }
    let base = null;
    await filho({ CPA_SO_BASE: "1" }, (m) => { base = m; });
    base = base || { total: 0, falhas: ["a rodada sem mutação não terminou (processo encerrado)"] };
    console.log(`base (sem mutação): ${base.total} verificações, ${base.falhas.length} falhas`);
    if (base.falhas.length) { base.falhas.forEach(f => console.log("  ✗ " + f)); process.exit(2); }
    const resultados = new Map();
    const t0 = Date.now();
    // UMA mutação por vez, cada uma num processo novo (nunca em paralelo: ver o cabeçalho)
    for (const [k, i] of indices.entries()) {
      await filho({ CPA_MUT_INDICE: String(i) }, ({ r }) => { resultados.set(i, r); });
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
