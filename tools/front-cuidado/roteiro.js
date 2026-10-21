// roteiro.js — a tela da v7.11 (Cuidado pastoral) contra o front de verdade, em DOM simulado, com o SERVIDOR imitado de fixtures.js (o handler de verdade, as leituras de verdade
// extraídas do cuidadoPastoralDb.js e as gravações reescritas com as regras de verdade) e texto de ataque (<img src=x onerror=...>) em TODO campo que vem dele. Cobre: a fila da
// liderança (filtros, urgente, prazo pintado pela faixa, degrau, detecção, SEM RESPONSÁVEL), abrir acompanhamento (visitante e membro, busca por POST, menor escondido do
// responsável), o detalhe (contato com a regra da visita a sós, troca de responsável, adiar, concluir com o caminho do abandono, cancelar, 409 e 404), as notas pastorais (lista
// sem texto, abrir com 428 e a confirmação reforçada, "quem abriu", escrever e corrigir, sumir ao sair), o responsável por PIN em Meu Painel, os pedidos do membro (validação,
// sinal de risco sem inventar "a liderança foi avisada", 429, rede caída), a moderação (publicar, recusa do nome, lido, marcar e desmarcar o risco com 428, acompanhar, pedido
// recebido em mãos), o boletim (impressão) e o painel, a saída da aba e a troca de login, respostas atrasadas, duplo clique, o prazo de 20 s e a acessibilidade.
"use strict";
const { criarAmbiente, lerApp } = require("./ambiente");
const F = require("./fixtures");
const { ATAQUE, HORA, DIA } = F;

async function rodar({ mutar = {}, so = null } = {}) {
  const T = { total: 0, falhas: [], cenarioAtual: "" };
  const confere = (cond, msg) => { T.total++; if (!cond) T.falhas.push(`${T.cenarioAtual}: ${msg}`); };
  const cenarios = [];
  const cenario = (nome, fn) => cenarios.push({ nome, fn });
  const AGORA = Date.now();
  const hojeBr = (ms = AGORA) => new Date(ms - 3 * HORA).toISOString().slice(0, 10);
  const somarDias = (iso, n) => { const [a, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
  const novo = (srv, opcoes) => criarAmbiente(Object.assign({ mutar, agora: new Date(AGORA).toISOString(), servidor: srv ? srv.servidor : null }, opcoes || {}));
  // todo servidor criado fica anotado: no fim, nenhum pode ter tido erro interno (500) nem consulta que o banco falso não conhece
  const SERVIDORES = [];
  const servidor = (op) => { const s = F.criarServidor(Object.assign({ agoraMs: AGORA }, op || {})); s.cenario = T.cenarioAtual; SERVIDORES.push(s); return s; };
  // nada pode ter executado nem ter virado marcação: zero ataque no DOM, zero chamada de __xss e nenhum HTML malformado
  const limpo = (env, qual, textos = []) => {
    confere(env.doc._ataques.length === 0, `${qual}: o texto de ataque virou marcação/atributo de evento (${JSON.stringify(env.doc._ataques.slice(0, 2))})`);
    confere(env.ctx.__xss.chamadas.length === 0, `${qual}: código do ataque EXECUTOU (${env.ctx.__xss.chamadas.slice(0, 4).join(",")})`);
    const corpo = env.doc.body.textContent;
    for (const t of textos) confere(corpo.includes(t), `${qual}: o texto do servidor "${t}" não apareceu na tela como texto`);
    confere(env.doc._erros.length === 0, `${qual}: HTML malformado gerado (${env.doc._erros.slice(0, 2).join("; ")})`);
  };
  const desc = (env, raiz) => [...(raiz || env.doc.body).descendentes()];
  const REGIOES = ["abaCuidadopastoral", "subMeupainelCuidado", "modalCaixa"];
  const botao = (env, texto, raiz) => {
    const raizes = raiz ? [raiz] : REGIOES.map(id => env.e(id)).filter(Boolean);
    for (const r of raizes) { const b = desc(env, r).find(x => x.localName === "button" && x.textContent.includes(texto) && !escondido(x)); if (b) return b; }
    return null;
  };
  const botoes = (env, texto, raiz) => desc(env, raiz || env.e("abaCuidadopastoral")).filter(x => x.localName === "button" && x.textContent.includes(texto));
  // (o painel inteiro — telaPainel e cxPainelConteudo — nunca é aberto aqui: o roteiro mexe direto nas abas; só conta o que fica DENTRO dele)
  const FORA_DA_CONTA = ["telaPainel", "cxPainelConteudo"];
  const escondido = (el) => { for (let p = el; p && p.nodeType === 1; p = p.parentNode) if (p.style && p.style.display === "none" && !FORA_DA_CONTA.includes(p.id)) return true; return false; };
  const chamadas = (env, chave) => env.api.chamadas.filter(c => c.chave === chave);
  const ultima = (env, chave) => { const l = chamadas(env, chave); return l[l.length - 1] || null; };
  const texto = (env, id) => (env.e(id) ? env.e(id).textContent : "");
  const clicar = async (env, el) => { env.doc.clicar(el); await env.ocioso(); };
  const clicarEResponder = async (env, el, confirmar) => { env.doc.clicar(el); const m = await env.responderModal(confirmar); await env.ocioso(); return m; };
  const digitar = (env, id, v) => { const el = env.e(id); if (el) env.doc.digitar(el, v); return !!el; };
  const escolher = (env, id, v) => { const el = env.e(id); if (el) env.doc.escolher(el, v); return !!el; };
  const marcar = (env, id, v = true) => { const el = env.e(id); if (el) env.doc.marcar(el, v); return !!el; };
  const g = (env, nome) => env.g(nome);
  // a aba da liderança: sessão de senha com a permissão, navegação de verdade (mostrarAbaSecretaria)
  const abrirAba = async (env, token = "lid", matricula = 10, geral = false) => {
    env.sessao({ matricula, token, geral, nivel: geral ? "GLOBAL" : "CONGREGACAO" });
    env.ev('mostrarAbaSecretaria("cuidadopastoral")');
    await env.ocioso();
  };
  const abrirMeu = async (env, token, matricula, pin = true) => {
    env.sessao({ matricula, token, pin });
    env.ev('mostrarAbaSecretaria("meupainel")');
    env.ev('mostrarSubAbaMeupainel("cuidado")');
    await env.ocioso();
  };
  const cartoes = (env, id = "cpaFilaLista") => desc(env, env.e(id)).filter(x => x.localName === "div" && x.className.includes("cpa-cartao"));
  const cartaoDe = (env, nome, id = "cpaFilaLista") => cartoes(env, id).find(c => c.textContent.includes(nome)) || null;
  const abrirItemPorNome = async (env, nome, id = "cpaFilaLista") => { const c = cartaoDe(env, nome, id); confere(!!c, `não achei o cartão de ${nome}`); if (c) await clicar(env, botao(env, "Abrir acompanhamento", c)); };
  const detalhe = (env, ctx = "Ges") => texto(env, `cpaDetalhe${ctx}`);
  // acessibilidade: todo campo tem rótulo (label for, label em volta ou aria-label); todo botão tem texto
  const controlesSemNome = (env, raiz) => {
    const para = new Set(desc(env).filter(x => x.localName === "label" && x.getAttribute("for")).map(x => x.getAttribute("for")));
    const falhas = [];
    for (const c of desc(env, raiz)) {
      if (c.localName === "button" && !c.textContent.trim() && !c.getAttribute("aria-label")) falhas.push(`botão sem texto (${c.id})`);
      if (!["input", "select", "textarea"].includes(c.localName) || c.type === "hidden") continue;
      let dentro = false;
      for (let p = c.parentNode; p && p.nodeType === 1; p = p.parentNode) if (p.localName === "label") dentro = true;
      if (c.getAttribute("aria-label") || (c.id && para.has(c.id)) || dentro) continue;
      falhas.push(`${c.localName}#${c.id}`);
    }
    return falhas;
  };
  const confereAcessibilidade = (env, ids, qual) => {
    for (const id of ids) { const raiz = env.e(id); confere(!!raiz, `${qual}: área ${id} não existe`); if (raiz) { const f = controlesSemNome(env, raiz); confere(f.length === 0, `${qual}: campo/botão sem nome acessível em ${id}: ${f.slice(0, 4).join(", ")}`); } }
  };
  const semTextos = (env, textos, qual) => { const corpo = env.doc.body.innerHTML; for (const t of textos) confere(!corpo.includes(t), `${qual}: "${t}" ainda está na página`); };
  const msgs = () => ({ tempo: g(ambiente0, "CPA_MSG_TEMPO") });
  let ambiente0 = null;

  // ---- os dados de sempre ----
  // it1 visitante (responsável: a irmã Rute), it2 afastamento detectado e vencido que subiu para a Área (Maria, 50), it3 pedido de visita urgente sem responsável (José, 51), it4 novo convertido
  // menor (Joaquim, 52; responsável: o diácono João), it5 fora do território, it6 sobre o próprio Dirigente (10: ele não vê), it7 encerrado
  function semear(srv) {
    const it1 = srv.novoItem({ tipo: "VISITANTE", pessoaNome: "Carla Visitante", pessoaContato: "(91) 99999-0000", motivo: "Veio com a família no domingo", responsavel: 31, prazoH: 30.5 });
    const it2 = srv.novoItem({ tipo: "AFASTAMENTO", membroId: 50, origem: "DETECCAO", deteccaoResumo: "EBD: antes 9 de 10 (90%); nas últimas 6 semanas 1 de 6 (17%).", motivo: "A frequência caiu em relação ao costume da própria pessoa.", prazoH: -50.5, nivel: "AREA", criadoPor: null });
    const it3 = srv.novoItem({ tipo: "PEDIDO_VISITA", membroId: 51, urgente: true, responsavel: null, prazoH: 10.5, origem: "PEDIDO_MEMBRO", motivo: "Saí do hospital, queria uma oração em casa" });
    const it4 = srv.novoItem({ tipo: "NOVO_CONVERTIDO", membroId: 52, responsavel: 30, prazoH: 100.5, motivo: "Aceitou a Jesus no culto de jovens" });
    const it5 = srv.novoItem({ tipo: "VISITANTE", congregacaoId: 3, pessoaNome: "Pessoa De Fora", pessoaContato: "(91) 3000-0000", responsavel: null });
    const it6 = srv.novoItem({ tipo: "AFASTAMENTO", membroId: 10, responsavel: 12, origem: "DETECCAO", deteccaoResumo: "EBD: antes 8 de 8 (100%); nas últimas 6 semanas 0 de 4 (0%)." });
    const it7 = srv.novoItem({ tipo: "VISITANTE", pessoaNome: "Encerrada Antiga", pessoaContato: "(91) 3111-2222", status: "CONCLUIDO", desfecho: "INTEGRADO", responsavel: 31 });
    srv.novoEvento({ ItemId: it2.ItemId, Tipo: "ESCALONADO", NivelDe: "CONGREGACAO", NivelPara: "AREA", PrazoNovo: new Date(AGORA - 50 * HORA), Em: new Date(AGORA - 2 * DIA) });
    return { it1, it2, it3, it4, it5, it6, it7 };
  }
  function semearNotas(srv, I) {
    const n1 = srv.novaNota({ membroId: 50, nivel: "EQUIPE", texto: "NOTA-EQUIPE-AAA: a família pediu discrição.", autor: 30, h: 30 });
    const n2 = srv.novaNota({ membroId: 50, nivel: "LIDERANCA", texto: "NOTA-LIDER-BBB: conflito com o líder do louvor.", autor: 12, h: 20 });
    const n3 = srv.novaNota({ membroId: 50, nivel: "PASTORAL", texto: "NOTA-PASTOR-CCC: aconselhamento sobre o casamento.", autor: 12, h: 10 });
    const n4 = srv.novaNota({ membroId: 50, nivel: "PASTORAL", texto: "NOTA-MINHA-DDD: oramos juntos.", autor: 10, h: 2 });
    const n5 = srv.novaNota({ itemId: I.it1.ItemId, nivel: "EQUIPE", texto: "NOTA-VIS-EEE: ligar depois das 18h.", autor: 31, h: 4 });
    return { n1, n2, n3, n4, n5 };
  }
  const TEXTOS_NOTAS = ["NOTA-EQUIPE-AAA", "NOTA-LIDER-BBB", "NOTA-PASTOR-CCC", "NOTA-MINHA-DDD", "NOTA-VIS-EEE"];

  // ============================================================================================================================================
  // 0) O CONTRATO: o HTML, o módulo, a navegação e o servidor falam dos mesmos nomes
  // ============================================================================================================================================
  cenario("Contrato: ids, registro, navegação, casca e servidor", async () => {
    const html = lerApp("index.html");
    const modulo = lerApp("modulos/cuidado-pastoral.js");
    const idsDoHtml = new Set([...html.matchAll(/\bid="([^"$]+)"/g)].map(m => m[1]));
    const idsDoModulo = new Set([...modulo.matchAll(/\bid="(cpa[A-Za-z0-9]+)/g)].map(m => m[1]));
    const referidos = [...new Set([...modulo.matchAll(/cpa(?:El|FocarId|Escrever|Mostrar|RolarPara|Texto|Marcado)\("([A-Za-z0-9_]+)"/g)].map(m => m[1]))];
    const semDono = referidos.filter(id => !idsDoHtml.has(id) && ![...idsDoModulo].some(x => id === x || id.startsWith(x)));
    confere(semDono.length === 0, `ids que o módulo usa e nenhum HTML nem template cria: ${semDono.join(", ")}`);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i && /^cpa|Cuidado/.test(id));
    confere(repetidos.length === 0, `ids repetidos no index.html: ${[...new Set(repetidos)].join(", ")}`);
    const faltam = F.contratoComOServidor();
    confere(faltam.length === 0, `contrato com o servidor: ${faltam.join(" | ")}`);
    const env = novo(null);
    ambiente0 = env;
    confere(env.errosDaPagina.length === 0, `index.html com estrutura quebrada: ${env.errosDaPagina.slice(0, 2).join("; ")}`);
    const grupo = env.e("grupoModuloMembresia");
    confere(!!grupo && desc(env, grupo).some(x => x.id === "btnAbaCuidadopastoral"), "btnAbaCuidadopastoral devia estar no módulo Pessoas & Membresia");
    confere(!!env.e("abaCuidadopastoral") && env.e("abaCuidadopastoral").className.includes("aba-secretaria"), "falta a aba abaCuidadopastoral (aba-secretaria)");
    confere(!!env.e("btnSubMeupainelCuidado") && !!env.e("subMeupainelCuidado"), "falta a sub-aba Cuidado em Meu Painel");
    confere(g(env, "NOMES_ABAS").includes("cuidadopastoral"), "NOMES_ABAS sem cuidadopastoral");
    confere(JSON.stringify(g(env, "ABA_PERMISSOES_ALT").cuidadopastoral) === '["cuidado_pastoral"]', "ABA_PERMISSOES_ALT.cuidadopastoral devia ser [\"cuidado_pastoral\"]");
    confere(g(env, "MODULOS").membresia.abas.includes("cuidadopastoral"), "o módulo membresia devia ter a aba cuidadopastoral");
    confere(g(env, "SUB_ABAS_MEUPAINEL").includes("cuidado") && !!g(env, "TITULOS_SUB_MEUPAINEL").cuidado, "SUB_ABAS_MEUPAINEL/TITULOS_SUB_MEUPAINEL sem cuidado");
    confere(!!g(env, "AJUDA_POR_ABA").cuidadopastoral && !!g(env, "AJUDA_POR_ABA")["meupainel:cuidado"], "AJUDA_POR_ABA sem as duas dicas");
    confere(g(env, "TITULOS_MODULOS").cuidadopastoral === "Cuidado Pastoral", "TITULOS_MODULOS.cuidadopastoral");
    const script = lerApp("script.js"), meusDados = lerApp("modulos/meus-dados.js");
    confere(/if \(typeof cpaLimparTela === "function"\) cpaLimparTela\(\);/.test(script), "limparSessao sem a chamada protegida de cpaLimparTela");
    confere(/typeof cpaSubAbaMudou === "function"\) cpaSubAbaMudou\(sub\)/.test(script) && /sub === "cuidado" && typeof cpaCarregarMeuPainelAcao === "function"/.test(script), "mostrarSubAbaMeupainel sem o gancho e o carregador do Cuidado");
    confere(/typeof cpaAbaMudou === "function"\) cpaAbaMudou\(aba\)/.test(meusDados) && /aba === "cuidadopastoral" && typeof cpaCarregarOpcoesAcao === "function"/.test(meusDados), "mostrarAbaSecretaria sem o gancho e o carregador do Cuidado pastoral");
    const scripts = [...html.matchAll(/<script src="modulos\/([^"]+)"/g)].map(m => m[1]);
    confere(scripts.includes("cuidado-pastoral.js") && JSON.stringify(scripts) === JSON.stringify([...scripts].sort()), "o index.html devia carregar modulos/cuidado-pastoral.js em ordem alfabética");
    const sw = lerApp("service-worker.js");
    const versaoSw = Number((/ieadespa-app-shell-v(\d+)/.exec(sw) || [])[1]);
    confere(versaoSw >= 35 && sw.includes('"/modulos/cuidado-pastoral.js"') && /\/\/ v35 \(/.test(sw), `o service worker devia estar na v35 ou depois, com /modulos/cuidado-pastoral.js na casca e a linha do histórico (v${versaoSw})`);
    // nenhum nome de nível superior fora do prefixo
    const nomes = [...modulo.matchAll(/^(?:async function|function|const|let) ([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    confere(nomes.length > 50 && nomes.every(n => /^(cpa|CPA_)/.test(n)), `nomes de nível superior sem o prefixo cpa: ${nomes.filter(n => !/^(cpa|CPA_)/.test(n)).join(", ")}`);
    // o que nunca pode aparecer no módulo: armazenamento do navegador, console, nome/texto em endereço
    const codigo = modulo.split("\n").map(l => l.replace(/(^|\s)\/\/.*$/, "")).join("\n");   // sem os comentários
    confere(!/localStorage|sessionStorage/.test(codigo), "o módulo usa localStorage/sessionStorage");
    confere(!/console\./.test(codigo), "o módulo escreve no console");
    confere(/el\.textContent = texto;/.test(codigo) && !/cpaNotaCorpo"\)\.innerHTML|corpo\.innerHTML/.test(codigo), "o texto da nota entra só por textContent");
    confere(/cpaPostar\("buscar-pessoas"/.test(modulo) && !/cpaObter\(`buscar/.test(modulo), "a busca de pessoas tem de ser por POST (o nome não vai no endereço)");
  });

  // ============================================================================================================================================
  // 1) A FILA
  // ============================================================================================================================================
  cenario("Liderança: a fila desenha o que o servidor manda (urgente, prazo, degrau, detecção, sem responsável) e os filtros", async () => {
    const srv = servidor(); const I = semear(srv);
    const env = novo(srv);
    await abrirAba(env);
    confere(chamadas(env, "GET cuidado-pastoral/catalogos").length === 1 && chamadas(env, "GET cuidado-pastoral/congregacoes").length === 1, "a aba devia pedir o catálogo e as congregações");
    const f = ultima(env, "GET cuidado-pastoral/fila");
    confere(!!f && f.consulta.situacao === "ABERTOS" && !f.consulta.congregacaoId, `a fila devia sair com situacao=ABERTOS (${f && JSON.stringify(f.consulta)})`);
    confere(f && f.comToken && f.comPrazo, "a chamada da fila devia levar o token e o prazo de 20 s");
    const cs = cartoes(env);
    confere(cs.length === 4, `a fila devia ter 4 cartões (o de fora do território, o do próprio Dirigente e o encerrado não aparecem): ${cs.length}`);
    confere(cs[0] && cs[0].textContent.includes("José Internado") && cs[0].textContent.includes("URGENTE"), "o urgente vem primeiro, com o selo URGENTE");
    confere(cs[0] && cs[0].textContent.includes("SEM RESPONSÁVEL") && cs[0].className.includes("cpa-cartao-urgente"), "o urgente sem responsável mostra SEM RESPONSÁVEL e a borda vermelha");
    const c2 = cartaoDe(env, "Maria Afastada");
    confere(!!c2 && c2.textContent.includes("vencido há") && c2.textContent.includes("⛔"), "o vencido mostra 'vencido há' com o ícone");
    const selo2 = c2 && desc(env, c2).find(x => x.localName === "span" && x.textContent.includes("vencido há"));
    confere(!!selo2 && selo2.className.includes("cal-st-indeferido") && selo2.className.includes("cpa-vencido"), "o selo do vencido tem a classe vermelha");
    confere(!!c2 && c2.textContent.includes("subiu para a Área"), "o item que subiu de degrau diz 'subiu para a Área'");
    confere(!!c2 && c2.textContent.includes("Detectado pelo sistema") && c2.textContent.includes("antes 9 de 10"), "o detectado mostra a origem e o porquê em números");
    const c3 = cartaoDe(env, "José Internado");
    const selo3 = c3 && desc(env, c3).find(x => x.localName === "span" && x.textContent.includes("vence em"));
    confere(!!selo3 && selo3.className.includes("cal-st-proposto") && selo3.textContent.includes("10 h"), `o prazo de menos de 24 h fica em atenção ("vence em 10 h"): ${selo3 && selo3.textContent}`);
    const c1 = cartaoDe(env, "Carla Visitante");
    const selo1 = c1 && desc(env, c1).find(x => x.localName === "span" && x.textContent.includes("vence em"));
    confere(!!selo1 && selo1.className.includes("cal-st-homologado") && selo1.textContent.includes("30 h"), `o prazo normal fica verde ("vence em 30 h"): ${selo1 && selo1.textContent}`);
    confere(!!c1 && c1.textContent.includes("Irmã Rute Círculo") && c1.textContent.includes("Visitante") && c1.textContent.includes("Central"), "o cartão mostra o responsável, o tipo e a congregação");
    confere(!!cartaoDe(env, "Joaquim Menor") && cartaoDe(env, "Joaquim Menor").textContent.includes("menor de idade"), "o acompanhado menor de idade tem o selo");
    confere(!env.e("cpaFilaLista").textContent.includes("Pessoa De Fora") && !env.e("cpaFilaLista").textContent.includes("Encerrada Antiga"), "o de fora do território e o encerrado não aparecem nos abertos");
    confere(texto(env, "cpaFilaMsg").includes("4 acompanhamentos"), `a contagem fica na mensagem: ${texto(env, "cpaFilaMsg")}`);
    // os seletores vêm do servidor
    const congs = env.e("cpaFiltroCong").options.map(o => o.textContent);
    confere(congs.length === 2 && congs[0] === "Todas as congregações" && congs[1] === "Central", `o filtro de congregação tem só as do território: ${congs.join("|")}`);
    confere(env.e("cpaFiltroTipo").options.length === 7, "o filtro de tipo tem os 6 tipos + Todos");
    // filtros
    escolher(env, "cpaFiltroSituacao", "VENCIDOS"); await env.ocioso();
    confere(ultima(env, "GET cuidado-pastoral/fila").consulta.situacao === "VENCIDOS" && cartoes(env).length === 1 && !!cartaoDe(env, "Maria Afastada"), "VENCIDOS: só o vencido");
    escolher(env, "cpaFiltroSituacao", "SEM_RESPONSAVEL"); await env.ocioso();
    confere(cartoes(env).length === 1 && !!cartaoDe(env, "José Internado"), "SEM_RESPONSAVEL: só o José");
    escolher(env, "cpaFiltroSituacao", "URGENTES"); await env.ocioso();
    confere(cartoes(env).length === 1 && !!cartaoDe(env, "José Internado"), "URGENTES: só o José");
    escolher(env, "cpaFiltroSituacao", "ENCERRADOS"); await env.ocioso();
    confere(cartoes(env).length === 1 && !!cartaoDe(env, "Encerrada Antiga") && cartaoDe(env, "Encerrada Antiga").textContent.includes("Concluído"), "ENCERRADOS: o encerrado, com o desfecho");
    escolher(env, "cpaFiltroSituacao", "ABERTOS"); escolher(env, "cpaFiltroTipo", "AFASTAMENTO"); await env.ocioso();
    const ft = ultima(env, "GET cuidado-pastoral/fila");
    confere(ft.consulta.tipo === "AFASTAMENTO" && cartoes(env).length === 1, "o filtro de tipo vai na consulta e o servidor filtra");
    escolher(env, "cpaFiltroTipo", ""); escolher(env, "cpaFiltroCong", "1"); await env.ocioso();
    confere(ultima(env, "GET cuidado-pastoral/fila").consulta.congregacaoId === "1" && cartoes(env).length === 4, "o filtro de congregação vai como número na consulta");
    confere(env.api.chamadas.every(c => !/Maria|José|Carla|Joaquim/.test(c.url)), "nenhum nome em endereço");
    confereAcessibilidade(env, ["abaCuidadopastoral"], "fila");
    limpo(env, "fila");
    // a Pastora de Área vê as duas congregações
    const env2 = novo(srv);
    await abrirAba(env2, "area", 12);
    confere(env2.e("cpaFiltroCong").options.length === 3, "a Área vê as congregações da área");
  });

  // ============================================================================================================================================
  // 2) ABRIR UM ACOMPANHAMENTO À MÃO
  // ============================================================================================================================================
  cenario("Liderança: abrir acompanhamento (visitante, membro, responsável, busca por POST, recusas)", async () => {
    const srv = servidor(); const I = semear(srv);
    const env = novo(srv);
    await abrirAba(env);
    const abrirBtn = botao(env, "➕ Abrir acompanhamento");
    await clicar(env, abrirBtn);
    confere(!!env.e("cpaNovoTipo") && env.foco() === env.e("cpaNovoTipo"), "o formulário abre com o foco no tipo");
    const tipos = env.e("cpaNovoTipo").options.map(o => o.value).filter(Boolean);
    confere(JSON.stringify(tipos) === JSON.stringify(F.cp.TIPOS_ABERTURA_MANUAL), `só os tipos de abertura manual (o pedido de oração nasce de um pedido): ${tipos.join(",")}`);
    confere(env.e("cpaNovoCong").value === "1", "com uma congregação só, ela já vem escolhida");
    await clicar(env, env.e("cpaNovoBotao"));
    confere(texto(env, "cpaNovoMsg").includes("Escolha o tipo") && chamadas(env, "POST cuidado-pastoral/abrir").length === 0, "sem tipo: aviso na tela e nada enviado");
    escolher(env, "cpaNovoTipo", "VISITANTE"); await env.ocioso();
    confere(texto(env, "cpaNovoTipoDesc").includes("48 horas"), "a descrição do tipo (vinda do servidor) aparece");
    await clicar(env, env.e("cpaNovoBotao"));
    confere(texto(env, "cpaNovoMsg").includes("cadastro"), "sem dizer se é do cadastro: aviso");
    marcar(env, "cpaNovoCadNao"); await env.ocioso();
    confere(!escondido(env.e("cpaNovoNome")) && escondido(env.e("cpaNovoBusca")), "'não é do cadastro' mostra nome e contato e esconde a busca");
    digitar(env, "cpaNovoNome", "Carlos Visitante");
    await clicar(env, env.e("cpaNovoBotao"));
    confere(texto(env, "cpaNovoMsg").includes("contato") && chamadas(env, "POST cuidado-pastoral/abrir").length === 0, "visitante sem contato: aviso");
    digitar(env, "cpaNovoContato", "(91) 98877-6655");
    digitar(env, "cpaNovoMotivo", "Visitou com <b>a esposa</b>");
    await clicar(env, env.e("cpaNovoBotao"));
    confere(texto(env, "cpaNovoMsg").includes("< e >") && chamadas(env, "POST cuidado-pastoral/abrir").length === 0, "motivo com < > é barrado antes de enviar");
    digitar(env, "cpaNovoMotivo", "Visitou no domingo com a esposa");
    await clicar(env, env.e("cpaNovoBotao"));
    const p1 = ultima(env, "POST cuidado-pastoral/abrir");
    confere(!!p1 && JSON.stringify(p1.corpo) === JSON.stringify({ tipo: "VISITANTE", congregacaoId: 1, urgente: false, pessoaNome: "Carlos Visitante", pessoaContato: "(91) 98877-6655", motivo: "Visitou no domingo com a esposa" }), `o corpo do abrir (visitante): ${p1 && JSON.stringify(p1.corpo)}`);
    confere(texto(env, "cpaFilaMsg").includes("Acompanhamento aberto. Responsável: Pr. Paulo Dirigente."), `a mensagem do servidor: ${texto(env, "cpaFilaMsg")}`);
    confere(env.e("cpaNovoCx").innerHTML === "" && !!cartaoDe(env, "Carlos Visitante"), "o formulário fecha e o novo acompanhamento aparece na fila");
    confere(env.foco() === abrirBtn, "o foco volta ao botão que abriu o formulário");
    // membro: busca por POST (o nome nunca vai no endereço), menor marcado; responsável só maior de idade, liderança marcada
    await clicar(env, abrirBtn);
    escolher(env, "cpaNovoTipo", "AFASTAMENTO"); await env.ocioso();
    confere(env.e("cpaNovoCadSim").checked && !escondido(env.e("cpaNovoBusca")), "'Membro afastado' é só de quem está no cadastro: a busca abre sozinha");
    marcar(env, "cpaNovoCadSim", false); marcar(env, "cpaNovoCadNao", true); await env.ocioso();
    await clicar(env, env.e("cpaNovoBotao"));
    confere(texto(env, "cpaNovoMsg").includes("só para quem está no cadastro"), "afastamento sem cadastro: aviso");
    marcar(env, "cpaNovoCadNao", false); marcar(env, "cpaNovoCadSim", true); await env.ocioso();
    escolher(env, "cpaNovoTipo", "PEDIDO_VISITA"); await env.ocioso();
    digitar(env, "cpaNovoBusca", "J");
    await clicar(env, botao(env, "🔍 Buscar", env.e("cpaNovoMembroCx")));
    confere(texto(env, "cpaNovoBuscaRes").includes("pelo menos 2 letras") && chamadas(env, "POST cuidado-pastoral/buscar-pessoas").length === 0, "busca de 1 letra: aviso e nada enviado");
    digitar(env, "cpaNovoBusca", "Jo");
    await clicar(env, botao(env, "🔍 Buscar", env.e("cpaNovoMembroCx")));
    const b1 = ultima(env, "POST cuidado-pastoral/buscar-pessoas");
    confere(!!b1 && JSON.stringify(b1.corpo) === JSON.stringify({ congregacaoId: 1, q: "Jo" }) && Object.keys(b1.consulta).length === 0 && !b1.url.includes("Jo"), "a busca vai por POST, com a congregação, e o nome não vai no endereço");
    const res = env.e("cpaNovoBuscaRes").textContent;
    confere(res.includes("José Internado") && res.includes("Joana Adolescente") && res.includes("Joaquim Menor") && res.includes("menor de idade"), `a busca do acompanhado mostra os menores, marcados: ${res}`);
    await clicar(env, botao(env, "Escolher", desc(env, env.e("cpaNovoBuscaRes")).find(x => x.localName === "li" && x.textContent.includes("José Internado"))));
    confere(texto(env, "cpaNovoEscolhido").includes("José Internado") && env.e("cpaNovoBuscaRes").innerHTML === "", "a pessoa escolhida aparece e a lista some");
    digitar(env, "cpaNovoRespBusca", "Jo");
    await clicar(env, botao(env, "Buscar responsável"));
    const rr = env.e("cpaNovoRespRes").textContent;
    confere(rr.includes("João Voluntário") && !rr.includes("Joana") && !rr.includes("Joaquim"), `o responsável nunca é menor de idade (a busca esconde): ${rr}`);
    digitar(env, "cpaNovoRespBusca", "Lí");
    await clicar(env, botao(env, "Buscar responsável"));
    confere(env.e("cpaNovoRespRes").textContent.includes("Pra. Lídia Área") && env.e("cpaNovoRespRes").textContent.includes("liderança"), "quem é da liderança que alcança a congregação vem marcado");
    await clicar(env, botao(env, "Escolher", env.e("cpaNovoRespRes")));
    marcar(env, "cpaNovoUrgente");
    await clicar(env, env.e("cpaNovoBotao"));
    const p2 = ultima(env, "POST cuidado-pastoral/abrir");
    confere(!!p2 && JSON.stringify(p2.corpo) === JSON.stringify({ tipo: "PEDIDO_VISITA", congregacaoId: 1, urgente: true, membroId: 51, responsavelMembroId: 12 }), `o corpo do abrir (membro): ${p2 && JSON.stringify(p2.corpo)}`);
    confere(texto(env, "cpaNovoMsg").includes("Já existe um acompanhamento aberto deste tipo") && env.e("cpaNovoCx").innerHTML !== "", "o 409 (já existe aberto) fica no formulário, que continua aberto");
    escolher(env, "cpaNovoTipo", "POS_INTERNACAO"); await env.ocioso();
    await clicar(env, env.e("cpaNovoBotao"));
    confere(texto(env, "cpaFilaMsg").includes("Responsável: Pra. Lídia Área"), `trocando o tipo, abre (com a responsável escolhida): ${texto(env, "cpaFilaMsg")}`);
    // trocar a congregação apaga as escolhas (a busca é por congregação)
    await clicar(env, abrirBtn);
    marcar(env, "cpaNovoCadSim"); await env.ocioso();
    digitar(env, "cpaNovoBusca", "Ana"); await clicar(env, botao(env, "🔍 Buscar", env.e("cpaNovoMembroCx")));
    await clicar(env, botao(env, "Escolher", env.e("cpaNovoBuscaRes")));
    confere(!!g(env, "cpaEscolhas").novoPessoa, "escolheu a Ana");
    escolher(env, "cpaNovoCong", ""); await env.ocioso();
    confere(!g(env, "cpaEscolhas").novoPessoa && texto(env, "cpaNovoEscolhido") === "", "trocar a congregação apaga a pessoa escolhida");
    await clicar(env, botao(env, "Cancelar", env.e("cpaNovoCx")));
    confere(env.e("cpaNovoCx").innerHTML === "", "Cancelar fecha o formulário");
    confereAcessibilidade(env, ["abaCuidadopastoral"], "abrir");
    limpo(env, "abrir");
  });

  // ============================================================================================================================================
  // 3) O ACOMPANHAMENTO ABERTO (liderança)
  // ============================================================================================================================================
  cenario("Liderança: detalhe, contato (visita nunca a sós), troca de responsável, adiar, concluir, cancelar, 409 e 404", async () => {
    const srv = servidor(); const I = semear(srv);
    const env = novo(srv);
    await abrirAba(env);
    await abrirItemPorNome(env, "Maria Afastada");
    const gi = ultima(env, "GET cuidado-pastoral/item");
    confere(!!gi && gi.consulta.itemId === String(I.it2.ItemId), "o detalhe pede o item pelo número");
    confere(!escondido(env.e("cpaDetalheGesCx")) && escondido(env.e("cpaFilaCx")), "o detalhe aparece e a lista some");
    confere(env.foco() === env.e("cpaDetTitulo"), "o foco vai para o título do acompanhamento");
    const d = detalhe(env);
    confere(d.includes("Maria Afastada — Membro afastado") && d.includes("Central") && d.includes("A frequência caiu"), "título, congregação e motivo");
    confere(d.includes("Por que o sistema detectou") && d.includes("antes 9 de 10") && d.includes("não registra presença nos cultos"), "a detecção explica o porquê e o que ela não mede");
    const tel = desc(env, env.e("cpaDetalheGes")).find(x => x.localName === "a" && (x.getAttribute("href") || "").startsWith("tel:"));
    confere(!!tel && tel.getAttribute("href") === "tel:91988887777", `o telefone vira link de ligar (só os algarismos): ${tel && tel.getAttribute("href")}`);
    confere(d.includes("Prazo vencido: subiu de degrau") && d.includes("Área (Pastor de Área)"), "o histórico mostra a subida de degrau");
    for (const b of ["Registrar contato", "Concluir", "Trocar responsável", "Adiar prazo", "Cancelar"]) confere(!!botao(env, b, env.e("cpaDetalheGes")), `a liderança tem o botão ${b}`);
    // registrar contato
    const btnContato = botao(env, "Registrar contato", env.e("cpaDetalheGes"));
    await clicar(env, btnContato);
    confere(env.foco() === env.e("cpaFcForma"), "o formulário do contato abre com o foco na forma");
    confere(texto(env, "cpaFormAcao").includes("não escreva diagnóstico") || texto(env, "cpaFormAcao").includes("Não escreva diagnóstico"), "a observação avisa: diagnóstico vai nas notas pastorais");
    const min = env.e("cpaFcData").getAttribute("min"), max = env.e("cpaFcData").getAttribute("max");
    confere(max === hojeBr() && min === somarDias(hojeBr(), -7), `a data do contato vai de hoje-7 a hoje (pelo relógio do servidor): ${min}..${max}`);
    await clicar(env, env.e("cpaFormBotao"));
    confere(texto(env, "cpaFormMsg").includes("Escolha como foi"), "sem forma: aviso");
    escolher(env, "cpaFcForma", "VISITA_LAR"); await env.ocioso();
    confere(!escondido(env.e("cpaFcRegra")) && texto(env, "cpaFcRegra").includes("Art. 85 §3º"), "visita no lar mostra a regra do Regimento (visita nunca a sós)");
    await clicar(env, env.e("cpaFormBotao"));
    confere(texto(env, "cpaFormMsg").includes("Diga se conseguiu"), "sem dizer se conseguiu falar: aviso");
    marcar(env, "cpaFcSim");
    await clicar(env, env.e("cpaFormBotao"));
    confere(texto(env, "cpaFormMsg").includes("nunca a sós") && chamadas(env, "POST cuidado-pastoral/contato").length === 0, "visita sem quem foi junto: barrada antes de enviar, com o artigo");
    escolher(env, "cpaFcForma", "LIGACAO"); await env.ocioso();
    confere(escondido(env.e("cpaFcRegra")), "ligação esconde a regra da visita");
    escolher(env, "cpaFcForma", "VISITA_HOSPITAL"); await env.ocioso();
    digitar(env, "cpaFcAcompanhante", "Irmã Rute");
    digitar(env, "cpaFcObs", "Visitamos no hospital, está melhor");
    digitar(env, "cpaFcData", somarDias(hojeBr(), -10));
    await clicar(env, env.e("cpaFormBotao"));
    confere(texto(env, "cpaFormMsg").includes("Registre o contato em até 7 dias") && !!env.e("cpaFcForma"), "a recusa do servidor (data velha) fica no formulário, que continua aberto");
    digitar(env, "cpaFcData", "");
    await clicar(env, env.e("cpaFormBotao"));
    const pc = ultima(env, "POST cuidado-pastoral/contato");
    confere(!!pc && JSON.stringify(pc.corpo) === JSON.stringify({ itemId: I.it2.ItemId, forma: "VISITA_HOSPITAL", conseguiu: true, acompanhante: "Irmã Rute", observacao: "Visitamos no hospital, está melhor" }), `o corpo do contato: ${pc && JSON.stringify(pc.corpo)}`);
    confere(texto(env, "cpaDetalheGesMsg") === "Contato registrado." && !env.e("cpaFcForma"), "o detalhe é relido, a mensagem do servidor aparece e o formulário some");
    confere(detalhe(env).includes("foi junto: Irmã Rute") && detalhe(env).includes("conseguiu falar") && detalhe(env).includes("Primeiro contato"), "o histórico mostra o contato e quem foi junto");
    // trocar responsável: busca por POST (menores escondidos), confirmação, atribuir
    await clicar(env, botao(env, "Trocar responsável", env.e("cpaDetalheGes")));
    digitar(env, "cpaFrBusca", "Jo");
    await clicar(env, botao(env, "🔍 Buscar", env.e("cpaFormAcao")));
    confere(!texto(env, "cpaFrRes").includes("Joana") && texto(env, "cpaFrRes").includes("João Voluntário"), "a troca de responsável esconde os menores");
    digitar(env, "cpaFrBusca", "Ru");
    await clicar(env, botao(env, "🔍 Buscar", env.e("cpaFormAcao")));
    const m = await clicarEResponder(env, botao(env, "Nomear", env.e("cpaFrRes")), true);
    confere(m.aberto && m.texto.includes("Irmã Rute Círculo"), "nomear pede confirmação com o nome");
    const pa = ultima(env, "POST cuidado-pastoral/atribuir");
    confere(!!pa && JSON.stringify(pa.corpo) === JSON.stringify({ itemId: I.it2.ItemId, responsavelMembroId: 31 }), `o corpo do atribuir: ${pa && JSON.stringify(pa.corpo)}`);
    confere(texto(env, "cpaDetalheGesMsg") === "Responsável agora: Irmã Rute Círculo." && detalhe(env).includes("Responsável nomeado"), "o detalhe mostra o novo responsável");
    // adiar: a recusa do servidor (mais de 30 dias) e o adiamento
    await clicar(env, botao(env, "Adiar prazo", env.e("cpaDetalheGes")));
    confere(env.e("cpaFaData").getAttribute("max") === somarDias(hojeBr(), 30), "o campo do adiamento vai até 30 dias");
    digitar(env, "cpaFaData", somarDias(hojeBr(), 40)); digitar(env, "cpaFaMotivo", "A família viajou");
    await clicar(env, env.e("cpaFormBotao"));
    confere(texto(env, "cpaFormMsg").includes("30 dias à frente"), `a recusa do servidor: ${texto(env, "cpaFormMsg")}`);
    digitar(env, "cpaFaData", somarDias(hojeBr(), 5));
    await clicar(env, env.e("cpaFormBotao"));
    confere(ultima(env, "POST cuidado-pastoral/adiar").corpo.novoPrazo === somarDias(hojeBr(), 5) && texto(env, "cpaDetalheGesMsg") === "Prazo adiado.", "o adiamento grava");
    confere(detalhe(env).includes("Prazo adiado") && detalhe(env).includes("A família viajou"), "o histórico mostra o adiamento e o motivo");
    // concluir "não localizado": o caminho do abandono (manual)
    await clicar(env, botao(env, "✅ Concluir", env.e("cpaDetalheGes")));
    confere(texto(env, "cpaFormAcao").includes("abandono continua manual"), "concluir um afastamento lembra que o abandono é manual");
    escolher(env, "cpaFkDesfecho", "OUTRO");
    await clicar(env, env.e("cpaFormBotao"));
    confere(texto(env, "cpaFormMsg").includes("Outro") && chamadas(env, "POST cuidado-pastoral/concluir").length === 0, "'Outro' sem observação: aviso");
    escolher(env, "cpaFkDesfecho", "NAO_LOCALIZADO");
    await clicar(env, env.e("cpaFormBotao"));
    confere(texto(env, "cpaDetalheGesMsg").includes("procedimento de abandono") && env.e("cpaDetalheGesMsg").className.includes("psc-aviso"), "o caminho do abandono aparece em destaque");
    confere(detalhe(env).includes("Encerrado") && !botao(env, "Registrar contato", env.e("cpaDetalheGes")), "encerrado: sem botões de ação");
    confere(detalhe(env).includes("procedimento de abandono (Disciplina"), "o detalhe encerrado com 'não localizado' mostra o caminho do abandono");
    // cancelar (com confirmação)
    await clicar(env, botao(env, "Voltar à fila"));
    confere(escondido(env.e("cpaDetalheGesCx")) && !escondido(env.e("cpaFilaCx")) && env.e("cpaDetalheGes").innerHTML === "", "voltar esconde e esvazia o detalhe");
    await abrirItemPorNome(env, "Carla Visitante");
    await clicar(env, botao(env, "✖️ Cancelar", env.e("cpaDetalheGes")));
    escolher(env, "cpaFxDesfecho", "DUPLICADO");
    await clicar(env, env.e("cpaFormBotao"));
    confere(texto(env, "cpaFormMsg").includes("motivo"), "cancelar sem motivo: aviso");
    digitar(env, "cpaFxMotivo", "Aberto duas vezes");
    const mc = await clicarEResponder(env, env.e("cpaFormBotao"), false);
    confere(mc.aberto && chamadas(env, "POST cuidado-pastoral/cancelar").length === 0, "cancelar pede confirmação; recusar não envia");
    await clicarEResponder(env, env.e("cpaFormBotao"), true);
    confere(JSON.stringify(ultima(env, "POST cuidado-pastoral/cancelar").corpo) === JSON.stringify({ itemId: I.it1.ItemId, desfecho: "DUPLICADO", motivo: "Aberto duas vezes" }) && texto(env, "cpaDetalheGesMsg") === "Acompanhamento cancelado.", "cancelado");
    // 409: alguém encerrou enquanto isso → a tela relê e mostra o porquê
    await clicar(env, botao(env, "Voltar à fila"));
    await abrirItemPorNome(env, "Joaquim Menor");
    confere(detalhe(env).includes("Menor de idade") && detalhe(env).includes("pais ou responsáveis"), "o acompanhamento de menor manda falar com os pais");
    I.it4.Status = "CONCLUIDO"; I.it4.Desfecho = "INTEGRADO"; I.it4.EncerradoEm = new Date(AGORA);
    const leiturasAntes = chamadas(env, "GET cuidado-pastoral/item").length;
    await clicar(env, botao(env, "Registrar contato", env.e("cpaDetalheGes")));
    escolher(env, "cpaFcForma", "LIGACAO"); marcar(env, "cpaFcNao");
    await clicar(env, env.e("cpaFormBotao"));
    confere(chamadas(env, "GET cuidado-pastoral/item").length === leiturasAntes + 1 && texto(env, "cpaDetalheGesMsg") === "Este acompanhamento já foi encerrado." && env.e("cpaDetalheGesMsg").className.includes("psc-aviso"), "409: o item é relido e a mensagem aparece");
    confere(!botao(env, "Registrar contato", env.e("cpaDetalheGes")) && detalhe(env).includes("Encerrado"), "409: o detalhe relido já está encerrado");
    // 404: não existe, ou é sobre o próprio Dirigente (a mesma resposta)
    env.ev(`cpaAbrirDetalheAcao("Ges", 99999, null)`); await env.ocioso();
    confere(texto(env, "cpaDetalheGesMsg").includes("Não foi possível abrir") && env.e("cpaDetalheGes").innerHTML === "", "404: só 'não foi possível abrir'");
    env.ev(`cpaAbrirDetalheAcao("Ges", ${I.it6.ItemId}, null)`); await env.ocioso();
    confere(texto(env, "cpaDetalheGesMsg").includes("Não foi possível abrir"), "o item SOBRE o próprio Dirigente: a mesma resposta de 'não existe'");
    confereAcessibilidade(env, ["abaCuidadopastoral"], "detalhe");
    limpo(env, "detalhe");
    confere(srv.S.erros.length === 0, `o servidor imitado registrou erro: ${srv.S.erros.slice(0, 1).join("")}`);
  });

  // ============================================================================================================================================
  // 4) AS NOTAS PASTORAIS (liderança)
  // ============================================================================================================================================
  cenario("Notas: lista sem texto, abrir (428 e a confirmação reforçada), quem abriu, escrever/corrigir, sumir ao sair", async () => {
    const srv = servidor(); const I = semear(srv); const N = semearNotas(srv, I);
    const env = novo(srv);
    await abrirAba(env);
    await abrirItemPorNome(env, "Maria Afastada");
    const lista = () => desc(env, env.e("cpaNotasCx")).filter(x => x.localName === "li" && x.className.includes("cpa-nota"));
    confere(lista().length === 4, `o Dirigente pastor lê as 4 notas sobre a Maria (equipe, liderança, somente pastor de outro e a dele): ${lista().length}`);
    semTextos(env, TEXTOS_NOTAS, "lista de notas");
    const ln3 = lista().find(x => x.textContent.includes("Pra. Lídia Área") && x.textContent.includes("Somente pastor"));
    confere(!!ln3 && ln3.textContent.includes("confirmação reforçada"), "a nota 'somente pastor' de outro avisa que abrir pede a confirmação reforçada");
    const ln4 = lista().find(x => x.textContent.includes("(você)"));
    confere(!!ln4 && !ln4.textContent.includes("confirmação reforçada") && ln4.textContent.includes("minha"), "a nota dele não pede confirmação e vem marcada 'minha'");
    confere(lista().every(x => /\d+ caracteres/.test(x.textContent)), "a lista mostra o tamanho, nunca o texto");
    confere(texto(env, "cpaNotasCx").includes("cada abertura fica registrada"), "a tela explica que cada abertura fica registrada");
    // abrir a nota de equipe
    await clicar(env, botao(env, "Abrir a nota", lista().find(x => x.textContent.includes("Diác. João"))));
    const an = ultima(env, "POST cuidado-pastoral/abrir-nota");
    confere(!!an && JSON.stringify(an.corpo) === JSON.stringify({ notaId: N.n1.NotaId }) && an.semFator, "abrir manda só o número da nota");
    confere(texto(env, "cpaNotaCorpo").includes("NOTA-EQUIPE-AAA") && texto(env, "cpaNotaCorpo").includes("ficou registrada"), "o texto aparece com o aviso de que a abertura ficou registrada");
    confere(!escondido(env.e("cpaNotaCx")) && env.foco() === env.e("cpaNotaCx"), "a caixa da nota aparece e recebe o foco");
    confere(srv.S.leituras.some(l => l.NotaId === N.n1.NotaId && l.MembroId === 10), "o servidor registrou a abertura");
    await clicar(env, env.e("cpaNotaFechar"));
    confere(!texto(env, "cpaNotaCorpo") && escondido(env.e("cpaNotaCx")) && env.foco() === env.e("cpaNotasTitulo"), "fechar apaga o texto e devolve o foco");
    // somente pastor de outro: 428 → a confirmação reforçada (a mesma do fetchProtegido) → recusada: nada aparece
    env.ctx.__fatorConfirmar = async () => false; env.ctx.__fatorPedidos = 0;
    env.limparRegistro();
    await clicar(env, botao(env, "Abrir a nota", ln3));
    confere(chamadas(env, "POST cuidado-pastoral/abrir-nota").length === 1 && env.ctx.__fatorPedidos === 1, "428: a tela pede a confirmação reforçada uma vez");
    confere(texto(env, "cpaNotasMsg").includes("confirmação recente") && !texto(env, "cpaNotaCorpo"), "confirmação recusada: aviso, e o texto não aparece");
    semTextos(env, ["NOTA-PASTOR-CCC"], "428 recusado");
    // confirmada: repete UMA vez, cada tentativa com o seu prazo
    env.ctx.__fatorConfirmar = async () => { srv.S.sessoes.lid.fator = true; return true; };
    env.limparRegistro();
    await clicar(env, botao(env, "Abrir a nota", lista().find(x => x.textContent.includes("Pra. Lídia Área") && x.textContent.includes("Somente pastor"))));
    const tentativas = chamadas(env, "POST cuidado-pastoral/abrir-nota");
    confere(tentativas.length === 2 && tentativas.every(c => c.semFator && c.comPrazo), "confirmada: a chamada é repetida uma vez (cada tentativa com o seu prazo de 20 s)");
    confere(texto(env, "cpaNotaCorpo").includes("NOTA-PASTOR-CCC") && texto(env, "cpaNotaCorpo").includes("somente pastor"), "o texto da nota 'somente pastor' aparece, marcado");
    confere([...env.temporizadores.values()].filter(t => t.ms === 20000).length === 0, "nenhum prazo de 20 s fica pendurado depois da resposta");
    // quem abriu: só nas notas dele (o Dirigente não é nível geral)
    confere(!!botao(env, "Quem abriu", ln4) && !botao(env, "Quem abriu", lista().find(x => x.textContent.includes("Diác. João"))), "'Quem abriu' só aparece na nota de quem escreveu");
    await clicar(env, botao(env, "Quem abriu", lista().find(x => x.textContent.includes("(você)"))));
    confere(ultima(env, "GET cuidado-pastoral/leituras").consulta.notaId === String(N.n4.NotaId) && texto(env, `cpaLeit${N.n4.NotaId}`).includes("Ninguém abriu"), "ninguém abriu a nota dele ainda");
    await clicar(env, botao(env, "Abrir a nota", lista().find(x => x.textContent.includes("(você)"))));
    await clicar(env, botao(env, "Quem abriu", lista().find(x => x.textContent.includes("(você)"))));
    confere(texto(env, `cpaLeit${N.n4.NotaId}`).includes("Pr. Paulo Dirigente"), "depois de abrir, a leitura aparece com o nome");
    // 404 em "quem abriu": o botão some
    env.api.rotas["GET cuidado-pastoral/leituras"] = { status: 404, corpo: { sucesso: false, mensagem: "Não encontrado." } };
    await clicar(env, botao(env, "Quem abriu", lista().find(x => x.textContent.includes("(você)"))));
    confere(env.e(`cpaLeitBtn${N.n4.NotaId}`).style.display === "none" && texto(env, `cpaLeit${N.n4.NotaId}`).includes("Só quem escreveu"), "404: o botão 'Quem abriu' some, com a explicação");
    delete env.api.rotas["GET cuidado-pastoral/leituras"];
    // escrever (sobre o MEMBRO) e corrigir
    await clicar(env, botao(env, "Escrever nota", env.e("cpaNotasCx")));
    confere(env.foco() === env.e("cpaFnNivel"), "o formulário da nota abre com o foco no nível");
    const niveis = env.e("cpaFnNivel").options.map(o => o.value).filter(Boolean);
    confere(JSON.stringify(niveis) === '["EQUIPE","LIDERANCA","PASTORAL"]', `a liderança escreve nos 3 níveis: ${niveis}`);
    confere(texto(env, "cpaNotaForm").includes("Só a liderança com a permissão") && texto(env, "cpaNotaForm").includes("não se edita"), "explica cada nível e que a nota não se edita");
    confere(env.e("cpaFnCorrige").options.length === 5, "o 'corrige' oferece as 4 notas que ele lê + 'não corrige'");
    await clicar(env, env.e("cpaFnBotao"));
    confere(texto(env, "cpaFnMsg").includes("Escolha quem pode ler"), "sem nível: aviso");
    escolher(env, "cpaFnNivel", "LIDERANCA"); digitar(env, "cpaFnTexto", "NOTA-NOVA-FFF: correção da anterior");
    confere(texto(env, "cpaFnContador") === String("NOTA-NOVA-FFF: correção da anterior".length), "o contador acompanha o texto");
    escolher(env, "cpaFnCorrige", String(N.n2.NotaId));
    await clicar(env, env.e("cpaFnBotao"));
    const pn = ultima(env, "POST cuidado-pastoral/nota");
    confere(!!pn && JSON.stringify(pn.corpo) === JSON.stringify({ membroId: 50, nivel: "LIDERANCA", texto: "NOTA-NOVA-FFF: correção da anterior", retificaNotaId: N.n2.NotaId }), `a nota de membro vai com membroId (corpo: ${pn && JSON.stringify(pn.corpo)})`);
    confere(ultima(env, "GET cuidado-pastoral/notas").consulta.membroId === "50", "a lista é relida pelo membro");
    confere(lista().length === 5 && texto(env, "cpaNotasMsg").includes("Nota guardada") && !env.e("cpaFnTexto"), "a lista ganhou a nota, a mensagem do servidor aparece e o formulário some");
    semTextos(env, ["NOTA-NOVA-FFF"], "depois de escrever");
    confere(lista().some(x => x.textContent.includes("corrige a nota de Pra. Lídia")), "a nota nova diz qual ela corrige");
    // nota sobre o visitante: vai pelo item
    await clicar(env, botao(env, "Voltar à fila"));
    semTextos(env, TEXTOS_NOTAS, "voltar à fila");
    await abrirItemPorNome(env, "Carla Visitante");
    confere(lista().length === 1, "o visitante tem a nota dele (pelo item)");
    await clicar(env, botao(env, "Escrever nota", env.e("cpaNotasCx")));
    escolher(env, "cpaFnNivel", "EQUIPE"); digitar(env, "cpaFnTexto", "Ligar no sábado");
    await clicar(env, env.e("cpaFnBotao"));
    confere(JSON.stringify(ultima(env, "POST cuidado-pastoral/nota").corpo) === JSON.stringify({ itemId: I.it1.ItemId, nivel: "EQUIPE", texto: "Ligar no sábado" }) && ultima(env, "GET cuidado-pastoral/notas").consulta.itemId === String(I.it1.ItemId), "a nota do visitante vai e volta pelo item");
    // a nota aberta some ao trocar de seção, ao sair da aba e ao sair da sessão
    const abrirN5 = async () => { await clicar(env, botao(env, "Abrir a nota", lista().find(x => x.textContent.includes("Irmã Rute")))); confere(texto(env, "cpaNotaCorpo").includes("NOTA-VIS-EEE"), "abriu a nota do visitante"); };
    await abrirN5();
    await clicar(env, env.e("btnCpaSecaoPedidos"));
    semTextos(env, ["NOTA-VIS-EEE", "Carla Visitante"], "trocar de seção");
    confere(g(env, "cpaDet") === null, "trocar de seção fecha o acompanhamento");
    await clicar(env, env.e("btnCpaSecaoFila"));
    await abrirItemPorNome(env, "Carla Visitante"); await abrirN5();
    env.ev('mostrarAbaSecretaria("protecao")'); await env.ocioso();
    semTextos(env, ["NOTA-VIS-EEE", "Carla Visitante", "Maria Afastada"], "sair da aba");
    env.ev('mostrarAbaSecretaria("cuidadopastoral")'); await env.ocioso();
    await abrirItemPorNome(env, "Carla Visitante"); await abrirN5();
    env.ev("limparSessao()"); await env.ocioso();
    semTextos(env, ["NOTA-VIS-EEE", "Carla Visitante", "Maria Afastada"], "sair da sessão");
    confere(g(env, "cpaCatalogos") === null && g(env, "cpaDet") === null && g(env, "cpaNotas").length === 0, "sair da sessão zera o estado do módulo");
    // resposta atrasada: a pessoa voltou à lista antes de o texto chegar
    await abrirAba(env);
    await abrirItemPorNome(env, "Carla Visitante");
    const r = env.retem(c => c.chave === "POST cuidado-pastoral/abrir-nota");
    env.doc.clicar(botao(env, "Abrir a nota", lista().find(x => x.textContent.includes("Irmã Rute")))); await env.ocioso();
    await clicar(env, botao(env, "Voltar à fila"));
    r.liberar(); await env.ocioso();
    semTextos(env, ["NOTA-VIS-EEE"], "abertura atrasada depois de voltar");
    limpo(env, "notas");
  });

  // ============================================================================================================================================
  // 5) O RESPONSÁVEL POR PIN (Meu Painel → Cuidado)
  // ============================================================================================================================================
  cenario("Responsável por PIN: meus acompanhamentos, contato, concluir, nota de equipe (e o que ele NÃO vê)", async () => {
    const srv = servidor(); const I = semear(srv); const N = semearNotas(srv, I);
    I.it1.ResponsavelMembroId = 30; I.it2.ResponsavelMembroId = 30;
    srv.novoItem({ tipo: "AFASTAMENTO", membroId: 30, responsavel: 30, motivo: "sobre o próprio diácono" });   // sobre ele mesmo: nunca aparece
    const env = novo(srv);
    await abrirMeu(env, "pin30", 30);
    const pedidos = env.api.chamadas.map(c => c.chave);
    for (const a of ["catalogos", "meus", "meus-pedidos", "boletim-meu"]) confere(pedidos.includes(`GET cuidado-pastoral/${a}`), `Meu Painel pede ${a}`);
    confere(!pedidos.some(c => /\/(fila|painel|congregacoes|pedidos|boletim)$/.test(c)), `o membro por PIN nunca chama as rotas da liderança: ${pedidos.join(",")}`);
    confere(!escondido(env.e("cpaMeusCx")), "quem é responsável vê 'Meus acompanhamentos'");
    const cs = cartoes(env, "cpaMeusLista");
    confere(cs.length === 3, `os 3 itens de que ele é responsável (nunca o que é sobre ele): ${cs.length}`);
    const cMaria = cartaoDe(env, "Maria Afastada", "cpaMeusLista");
    confere(!!cMaria && cMaria.textContent.includes("Contato:") && cMaria.textContent.includes("A frequência caiu") && cMaria.textContent.includes("vencido há"), "o cartão do responsável traz o contato, o motivo e o prazo");
    confere(!texto(env, "cpaMeusLista").includes("sobre o próprio diácono"), "o item sobre ele mesmo não aparece");
    await abrirItemPorNome(env, "Maria Afastada", "cpaMeusLista");
    confere(!escondido(env.e("cpaDetalheMeuCx")) && escondido(env.e("cpaMeusListaCx")), "o detalhe abre no Meu Painel");
    confere(!!botao(env, "Registrar contato", env.e("cpaDetalheMeu")) && !!botao(env, "Concluir", env.e("cpaDetalheMeu")), "o responsável registra contato e conclui");
    for (const b of ["Trocar responsável", "Adiar prazo", "✖️ Cancelar"]) confere(!botao(env, b, env.e("cpaDetalheMeu")), `o responsável NÃO tem ${b}`);
    const lista = () => desc(env, env.e("cpaNotasCx")).filter(x => x.localName === "li" && x.className.includes("cpa-nota"));
    confere(lista().length === 1 && lista()[0].textContent.includes("Equipe"), `o responsável só vê as notas de equipe (as restritas nem aparecem, nem a contagem): ${lista().length}`);
    confere(!texto(env, "cpaNotasCx").includes("Liderança local") && !texto(env, "cpaNotasCx").includes("Somente pastor"), "nenhum sinal das notas restritas");
    await clicar(env, botao(env, "Abrir a nota", lista()[0]));
    confere(texto(env, "cpaNotaCorpo").includes("NOTA-EQUIPE-AAA"), "ele abre a nota de equipe");
    await clicar(env, botao(env, "Escrever nota", env.e("cpaNotasCx")));
    const niveis = env.e("cpaFnNivel").options.map(o => o.value).filter(Boolean);
    confere(JSON.stringify(niveis) === '["EQUIPE"]', `o responsável só escreve 'Equipe': ${niveis}`);
    escolher(env, "cpaFnNivel", "EQUIPE"); digitar(env, "cpaFnTexto", "Liguei e ela atendeu");
    await clicar(env, env.e("cpaFnBotao"));
    const pn = ultima(env, "POST cuidado-pastoral/nota");
    // (o servidor leva a nota escrita pelo item de um MEMBRO para a pessoa: o responsável não recebe a matrícula, e não precisa)
    confere(!!pn && pn.corpo.itemId === I.it2.ItemId && !("membroId" in pn.corpo), "sem a matrícula (o servidor não a manda ao responsável), a nota vai pelo item");
    confere(!texto(env, "cpaFnMsg").includes("Não foi possível guardar a nota"), `a nota de equipe do responsável é guardada: ${texto(env, "cpaFnMsg")}`);
    await clicar(env, botao(env, "Atualizar notas", env.e("cpaNotasCx")));
    confere(ultima(env, "GET cuidado-pastoral/notas").consulta.itemId === String(I.it2.ItemId) && lista().length === 2, `as notas pelo item mostram a nova (agora são ${lista().length})`);
    // contato e conclusão pelo responsável
    await clicar(env, botao(env, "Registrar contato", env.e("cpaDetalheMeu")));
    escolher(env, "cpaFcForma", "MENSAGEM"); marcar(env, "cpaFcNao");
    await clicar(env, env.e("cpaFormBotao"));
    confere(ultima(env, "POST cuidado-pastoral/contato").corpo.conseguiu === false && texto(env, "cpaDetalheMeuMsg") === "Contato registrado.", "o responsável registra o contato");
    await clicar(env, botao(env, "✅ Concluir", env.e("cpaDetalheMeu")));
    escolher(env, "cpaFkDesfecho", "INTEGRADO");
    await clicar(env, env.e("cpaFormBotao"));
    // o voluntário não abre mais o item encerrado (o servidor responde 404): a tela volta à lista com a mensagem do ato
    confere(texto(env, "cpaMeuMsg") === "Acompanhamento concluído." && chamadas(env, "GET cuidado-pastoral/meus").length >= 2, `concluído: a mensagem do servidor fica em Meu Painel e a lista é relida (${texto(env, "cpaMeuMsg")})`);
    confere(escondido(env.e("cpaDetalheMeuCx")) && !escondido(env.e("cpaMeusListaCx")) && env.e("cpaDetalheMeu").innerHTML === "", "concluído: o detalhe fecha e a lista volta");
    const lembranca = cartoes(env, "cpaMeusLista").find(c => c.textContent.includes("Concluído"));
    confere(!!lembranca && lembranca.textContent.includes("Maria") && !lembranca.textContent.includes("Afastada") && !botao(env, "Abrir acompanhamento", lembranca), "o encerrado vira só a lembrança (primeiro nome, desfecho), sem botão de abrir");
    confere(!texto(env, "cpaMeusLista").includes("98888-7777"), "a lembrança não traz o contato");
    // a nota do visitante pelo item: grava
    await abrirItemPorNome(env, "Carla Visitante", "cpaMeusLista");
    await clicar(env, botao(env, "Escrever nota", env.e("cpaNotasCx")));
    escolher(env, "cpaFnNivel", "EQUIPE"); digitar(env, "cpaFnTexto", "Combinamos a visita");
    await clicar(env, env.e("cpaFnBotao"));
    confere(texto(env, "cpaNotasMsg").includes("Nota guardada") && lista().length === 2, "a nota de equipe do visitante grava e a lista é relida pelo item");
    // sair da sub-aba apaga tudo
    env.ev('mostrarSubAbaMeupainel("perfil")'); await env.ocioso();
    semTextos(env, ["Carla Visitante", "Maria Afastada", "NOTA-VIS-EEE", "NOTA-EQUIPE-AAA"], "sair da sub-aba");
    confere(escondido(env.e("cpaMeusCx")) && g(env, "cpaDet") === null, "sair da sub-aba esconde e zera");
    // quem não é responsável de nada não vê a seção
    const env2 = novo(srv);
    await abrirMeu(env2, "pin60", 60);
    confere(escondido(env2.e("cpaMeusCx")), "quem não é responsável não vê 'Meus acompanhamentos'");
    confereAcessibilidade(env2, ["subMeupainelCuidado"], "Meu Painel");
    limpo(env, "responsável");
    // sem permissão a aba não aparece; a PIN a aba da liderança some
    const env3 = novo(srv);
    env3.sessao({ matricula: 30, token: "pin30", pin: true });
    confere(!env3.g('temPermissaoDaAba("cuidadopastoral")'), "PIN não abre a aba da liderança");
    env3.sessao({ matricula: 11, token: "semperm", permissoes: ["pessoas"] });
    confere(!env3.g('temPermissaoDaAba("cuidadopastoral")'), "sem a permissão cuidado_pastoral a aba não abre");
  });

  // ============================================================================================================================================
  // 6) PEDIDOS DO MEMBRO (oração e visita) e o SINAL DE RISCO
  // ============================================================================================================================================
  cenario("Membro: pedir oração e visita, telefones sempre à vista, risco (sem inventar 'a liderança foi avisada'), 429 e rede caída", async () => {
    const srv = servidor(); semear(srv);
    srv.novoPedido({ congregacaoId: 1, solicitante: 31, texto: "outro", moderacao: "APROVADO", textoBoletim: "Alguém da Congregação Central pede oração pela família.", boletimAte: somarDias(hojeBr(), 5) });
    srv.novoPedido({ congregacaoId: 2, solicitante: 11, texto: "outro", moderacao: "APROVADO", textoBoletim: "Alguém da Congregação Vila Nova agradece a Deus.", boletimAte: somarDias(hojeBr(), 5) });
    const env = novo(srv);
    // os telefones estão no HTML antes de qualquer carregamento (funcionam mesmo sem o módulo)
    for (const n of ["188", "190", "180", "100"]) confere(desc(env, env.e("cpaAjudaFixa")).some(x => x.localName === "a" && x.getAttribute("href") === `tel:${n}`), `o telefone ${n} está sempre à vista`);
    await abrirMeu(env, "pin60", 60);
    for (const n of ["188", "190", "180", "100"]) confere(desc(env, env.e("cpaAjudaFixa")).some(x => x.localName === "a" && x.getAttribute("href") === `tel:${n}`), `depois de carregar, o ${n} continua embaixo do pedido`);
    confere(texto(env, "cpaBoletimMeu").includes("Congregação Central pede oração pela família") && !texto(env, "cpaBoletimMeu").includes("Vila Nova"), "o boletim da minha congregação (só ela)");
    confere(texto(env, "cpaMeusPedidosMsg").includes("ainda não fez"), "sem pedidos ainda");
    const enviar = () => clicar(env, env.e("cpaPoBotao"));
    await enviar();
    confere(texto(env, "cpaPoMsg").includes("Escolha o assunto") && chamadas(env, "POST cuidado-pastoral/pedir-oracao").length === 0, "sem assunto: aviso");
    escolher(env, "cpaPoCategoria", "SAUDE"); digitar(env, "cpaPoTexto", "abc");
    await enviar();
    confere(texto(env, "cpaPoMsg").includes("curto demais"), "texto curto: aviso");
    digitar(env, "cpaPoTexto", "Pela saúde da minha mãe, que está internada.");
    confere(texto(env, "cpaPoContador") === String("Pela saúde da minha mãe, que está internada.".length), "o contador acompanha o texto");
    await enviar();
    confere(texto(env, "cpaPoMsg").includes("boletim") && chamadas(env, "POST cuidado-pastoral/pedir-oracao").length === 0, "a escolha boletim × só liderança é obrigatória (nada marcado de início)");
    confere(!env.e("cpaPoBolSim").checked && !env.e("cpaPoBolNao").checked && env.e("cpaPoParaMim").checked, "começa com 'por mim' e sem escolha do boletim");
    marcar(env, "cpaPoBolNao"); marcar(env, "cpaPoQuerContato");
    await enviar();
    const p1 = ultima(env, "POST cuidado-pastoral/pedir-oracao");
    confere(!!p1 && JSON.stringify(p1.corpo) === JSON.stringify({ categoria: "SAUDE", texto: "Pela saúde da minha mãe, que está internada.", paraQuem: "PROPRIO", podeBoletim: false, querContato: true }), `o corpo do pedido: ${p1 && JSON.stringify(p1.corpo)}`);
    confere(texto(env, "cpaOracaoResultado").includes("Pedido recebido. Alguém da liderança vai falar com você."), "a mensagem do servidor");
    confere(env.e("cpaPoTexto").value === "" && !env.e("cpaPoBolNao").checked && !env.e("cpaPoQuerContato").checked, "o que foi enviado sai do formulário");
    confere(texto(env, "cpaMeusPedidos").includes("Saúde") && texto(env, "cpaMeusPedidos").includes("Recebido: a liderança vai ler"), "Meus pedidos mostra o pedido com a situação");
    confere(srv.S.itens.some(i => i.Tipo === "PEDIDO_ORACAO" && i.MembroId === 60), "o pedido de contato virou acompanhamento no servidor");
    // por outra pessoa
    escolher(env, "cpaPoCategoria", "FAMILIA"); digitar(env, "cpaPoTexto", "Pela família do meu vizinho.");
    marcar(env, "cpaPoParaMim", false); marcar(env, "cpaPoParaOutra"); marcar(env, "cpaPoBolSim");
    await enviar();
    confere(ultima(env, "POST cuidado-pastoral/pedir-oracao").corpo.paraQuem === "OUTRA_PESSOA" && ultima(env, "POST cuidado-pastoral/pedir-oracao").corpo.podeBoletim === true, "por outra pessoa, pode ir ao boletim");
    // risco sem o aviso ter saído do app: a tela NÃO pode dizer que a liderança foi avisada
    srv.S.avisoExterno = false;
    escolher(env, "cpaPoCategoria", "ESPIRITUAL"); digitar(env, "cpaPoTexto", "Não aguento mais, quero morrer."); marcar(env, "cpaPoBolNao");
    await enviar();
    const rr = env.e("cpaOracaoResultado");
    confere(texto(env, "cpaOracaoResultado").includes("Não conseguimos avisar a liderança agora") && !texto(env, "cpaOracaoResultado").includes("A liderança foi avisada"), "risco sem aviso externo: a mensagem do servidor, sem 'a liderança foi avisada'");
    confere(desc(env, rr).some(x => x.getAttribute && x.getAttribute("role") === "alert") && texto(env, "cpaOracaoResultado").includes("Você não está sozinho"), "a resposta do risco é um alerta");
    for (const n of ["188", "190", "180", "100"]) confere(desc(env, rr).some(x => x.localName === "a" && x.getAttribute("href") === `tel:${n}`), `a resposta do risco traz o ${n}`);
    confere(env.foco() === rr, "o foco vai para a resposta do risco");
    srv.S.avisoExterno = true;
    escolher(env, "cpaPoCategoria", "FAMILIA"); digitar(env, "cpaPoTexto", "Meu marido me bate e tenho medo dele."); marcar(env, "cpaPoBolNao");
    await enviar();
    confere(texto(env, "cpaOracaoResultado").includes("A liderança foi avisada agora.") && texto(env, "cpaOracaoResultado").includes("ligue 190"), "risco com aviso externo: a mensagem do servidor diz que avisou");
    // 429 (o limite de pedidos): a mensagem e os telefones
    for (let i = 0; i < 10; i++) srv.novoPedido({ congregacaoId: 1, solicitante: 60, texto: `p${i}`, h: 1 });
    escolher(env, "cpaPoCategoria", "SAUDE"); digitar(env, "cpaPoTexto", "Mais um pedido de oração."); marcar(env, "cpaPoBolNao");
    await enviar();
    confere(texto(env, "cpaOracaoResultado").includes("Limite de 10 pedidos") && texto(env, "cpaOracaoResultado").includes("NÃO foi enviado") && desc(env, env.e("cpaOracaoResultado")).some(x => x.getAttribute && x.getAttribute("href") === "tel:188"), "429: a mensagem, 'não foi enviado' e os telefones");
    confere(env.e("cpaPoTexto").value === "Mais um pedido de oração.", "o texto que não foi enviado fica no campo");
    // rede caída
    const leiturasMeusPedidos = chamadas(env, "GET cuidado-pastoral/meus-pedidos").length;
    env.api.redeCaida = true;
    await enviar();
    env.api.redeCaida = false;
    confere(chamadas(env, "GET cuidado-pastoral/meus-pedidos").length === leiturasMeusPedidos + 1, "rede caída depois de mandar: Meus pedidos é relido para a pessoa conferir");
    // (revisão da tela, item 2) a rede caiu DEPOIS de mandar: o pedido pode ter chegado — nunca "NÃO foi enviado"; Meus pedidos é relido e os telefones ficam
    confere(texto(env, "cpaOracaoResultado").includes("Não foi possível falar com o servidor") && texto(env, "cpaOracaoResultado").includes("Não sabemos se o seu pedido chegou") && !texto(env, "cpaOracaoResultado").includes("NÃO foi enviado"), `rede caída: 'não sabemos se chegou', nunca 'não foi enviado' (${texto(env, "cpaOracaoResultado").slice(0, 160)})`);
    confere(desc(env, env.e("cpaOracaoResultado")).some(x => x.getAttribute && x.getAttribute("href") === "tel:188"), "rede caída: os telefones de ajuda ficam à vista na resposta");
    confere(env.e("cpaPoTexto").value === "Mais um pedido de oração.", "rede caída: o texto fica");
    // pedir visita
    await clicar(env, env.e("cpaPvBotao"));
    confere(texto(env, "cpaPvMsg").includes("motivo da visita"), "visita sem motivo: aviso");
    digitar(env, "cpaPvMotivo", "Saí do hospital e queria uma oração em casa"); marcar(env, "cpaPvHospital"); digitar(env, "cpaPvContato", "Depois das 18h");
    await clicar(env, env.e("cpaPvBotao"));
    const pv = ultima(env, "POST cuidado-pastoral/pedir-visita");
    confere(!!pv && JSON.stringify(pv.corpo) === JSON.stringify({ motivo: "Saí do hospital e queria uma oração em casa", hospital: true, contato: "Depois das 18h" }), `o corpo da visita: ${pv && JSON.stringify(pv.corpo)}`);
    confere(texto(env, "cpaVisitaResultado").includes("Pedido de visita recebido") && env.e("cpaPvMotivo").value === "" && !env.e("cpaPvHospital").checked, "visita recebida; o formulário se esvazia");
    confere(texto(env, "cpaMeusPedidos").includes("Pós-internação") && texto(env, "cpaMeusPedidos").includes("Recebido: a liderança vai procurar você"), "Meus pedidos mostra a visita");
    digitar(env, "cpaPvMotivo", "De novo, outra visita"); marcar(env, "cpaPvHospital");
    await clicar(env, env.e("cpaPvBotao"));
    confere(texto(env, "cpaVisitaResultado").includes("Você já tem um pedido de visita em andamento"), "a segunda visita do mesmo tipo: a mensagem do servidor (409)");
    digitar(env, "cpaPvMotivo", "Tenho medo de voltar para casa, ele me bate"); marcar(env, "cpaPvHospital", false);
    await clicar(env, env.e("cpaPvBotao"));
    confere(texto(env, "cpaVisitaResultado").includes("Recebemos o seu pedido") && desc(env, env.e("cpaVisitaResultado")).some(x => x.getAttribute && x.getAttribute("href") === "tel:180"), `visita com sinal de risco: alerta com os telefones (${texto(env, "cpaVisitaResultado").slice(0, 200)})`);
    confere(env.gravacoes.length === 0, `nada foi gravado no armazenamento do navegador: ${JSON.stringify(env.gravacoes.slice(0, 2))}`);
    confere(env.api.chamadas.filter(c => c.metodo === "GET").every(c => !/morrer|bate|hospital|saude|Sa%C3%BAde/i.test(c.url)), "nenhum texto de pedido em endereço");
    confere(env.consoleDaTela.length === 0, `o console ficou limpo: ${JSON.stringify(env.consoleDaTela.slice(0, 2))}`);
    // sair da sub-aba apaga o que a pessoa escrevia
    digitar(env, "cpaPoTexto", "TEXTO-DIGITADO-XYZ");
    env.ev('mostrarSubAbaMeupainel("perfil")'); await env.ocioso();
    semTextos(env, ["TEXTO-DIGITADO-XYZ", "Saí do hospital"], "sair da sub-aba com texto digitado");
    confere(desc(env, env.e("cpaAjudaFixa")).some(x => x.localName === "a" && x.getAttribute("href") === "tel:188"), "os telefones continuam no HTML depois de sair");
    limpo(env, "pedidos do membro");
  });

  // ============================================================================================================================================
  // 7) A MODERAÇÃO DOS PEDIDOS DE ORAÇÃO (liderança)
  // ============================================================================================================================================
  cenario("Liderança: pedidos (publicar, nome recusado, lido, marcar/desmarcar risco com 428, acompanhar, recebido em mãos)", async () => {
    const srv = servidor(); semear(srv);
    const p1 = srv.novoPedido({ solicitante: 60, texto: "PEDIDO-P1: pela cirurgia da minha mãe", categoria: "SAUDE", querContato: true });
    const p2 = srv.novoPedido({ solicitante: 31, texto: "PEDIDO-P2: pelo emprego", categoria: "TRABALHO", podeBoletim: false });
    const p3 = srv.novoPedido({ solicitante: 50, texto: "PEDIDO-P3: ele bate no meu filho", categoria: "FAMILIA", risco: true, riscoCrianca: true });
    srv.novoPedido({ congregacaoId: 3, solicitante: null, solicitanteNome: "De Fora", texto: "fora do território" });
    srv.novoPedido({ solicitante: 10, texto: "PEDIDO-DO-PROPRIO-DIRIGENTE" });
    const env = novo(srv);
    await abrirAba(env);
    await clicar(env, env.e("btnCpaSecaoPedidos"));
    confere(env.e("btnCpaSecaoPedidos").getAttribute("aria-pressed") === "true" && !escondido(env.e("cpaSecaoPedidos")) && escondido(env.e("cpaSecaoFila")), "a seção de pedidos abre");
    confere(ultima(env, "GET cuidado-pastoral/pedidos").consulta.situacao === "AGUARDANDO", "começa pelos que esperam moderação");
    const cards = () => desc(env, env.e("cpaPedLista")).filter(x => x.localName === "div" && x.className.includes("cpa-pedido"));
    const card = (t) => cards().find(c => c.textContent.includes(t)) || null;
    confere(cards().length === 2 && !!card("PEDIDO-P1") && !!card("PEDIDO-P2"), `os 2 esperando (o de risco fica fora; o de fora do território e o do próprio Dirigente não aparecem): ${cards().length}`);
    confere(!texto(env, "cpaPedLista").includes("PEDIDO-DO-PROPRIO-DIRIGENTE"), "o pedido que o próprio Dirigente fez não aparece para ele");
    confere(card("PEDIDO-P1").textContent.includes("pode ir ao boletim sem nome") && card("PEDIDO-P1").textContent.includes("quer que alguém fale") && card("PEDIDO-P1").textContent.includes("Ana Pedinte"), "o cartão mostra a escolha do boletim, o pedido de contato e quem pediu");
    confere(card("PEDIDO-P2").textContent.includes("só para a liderança") && !botao(env, "Publicar no boletim", card("PEDIDO-P2")) && !!botao(env, "Marcar como lido", card("PEDIDO-P2")), "'só para a liderança' não tem Publicar");
    // publicar: a sugestão vem do servidor; o nome de quem pediu é recusado
    const btnPub = botao(env, "Publicar no boletim", card("PEDIDO-P1"));
    await clicar(env, btnPub);
    confere(env.e("cpaPubTexto").value === "Alguém da Congregação Central pede oração pela saúde." && env.foco() === env.e("cpaPubTexto"), `a linha sugerida pelo servidor vem no campo: ${env.e("cpaPubTexto").value}`);
    confere(texto(env, `cpaPedForm${p1.PedidoId}`).includes("nunca leva o texto do pedido"), "o formulário explica que o boletim não leva o texto");
    digitar(env, "cpaPubTexto", "Ana pede oração pela saúde da mãe.");
    await clicar(env, botao(env, "📖 Publicar", env.e(`cpaPedForm${p1.PedidoId}`)));
    confere(texto(env, "cpaPubMsg").includes("não pode ter o nome") && !!env.e("cpaPubTexto"), "o nome de quem pediu é recusado pelo servidor e o formulário fica");
    digitar(env, "cpaPubTexto", "Uma irmã pede oração pela saúde da mãe.");
    await clicar(env, botao(env, "📖 Publicar", env.e(`cpaPedForm${p1.PedidoId}`)));
    const pm = ultima(env, "POST cuidado-pastoral/moderar");
    confere(JSON.stringify(pm.corpo) === JSON.stringify({ pedidoId: p1.PedidoId, decisao: "APROVAR", textoBoletim: "Uma irmã pede oração pela saúde da mãe." }), `o corpo do moderar: ${JSON.stringify(pm.corpo)}`);
    confere(texto(env, "cpaPedMsg").includes("Publicado no boletim até") && texto(env, "cpaPedMsg").includes("sem nome") && !card("PEDIDO-P1"), "publicado: a lista é relida e a mensagem do servidor fica");
    await clicar(env, botao(env, "Marcar como lido", card("PEDIDO-P2")));
    confere(ultima(env, "POST cuidado-pastoral/moderar").corpo.decisao === "NAO_PUBLICAR" && texto(env, "cpaPedMsg").includes("fica só com a liderança"), "marcado como lido");
    // sinal de risco: cartão vermelho, telefones, proteção de crianças
    await clicar(env, env.e("btnCpaPedRisco"));
    confere(ultima(env, "GET cuidado-pastoral/pedidos").consulta.situacao === "RISCO" && env.e("btnCpaPedRisco").getAttribute("aria-pressed") === "true", "a pílula do risco");
    const c3 = card("PEDIDO-P3");
    // (revisão da tela, item 10) o cartão é vermelho, mas SEM região viva: com role=alert o leitor de tela anunciava todos os cartões a cada releitura
    confere(!!c3 && c3.className.includes("cpa-pedido-risco") && !desc(env, c3).some(x => x.getAttribute && x.getAttribute("role") === "alert") && c3.getAttribute("role") !== "alert", "o pedido com risco é um cartão vermelho sem região viva (alert só nas respostas de ato)");
    confere(!!c3 && c3.textContent.includes("Proteção de Crianças") && c3.textContent.includes("Atenda agora"), "fala de criança com violência: manda registrar na Proteção de Crianças");
    for (const n of ["188", "190", "180", "100"]) confere(!!c3 && desc(env, c3).some(x => x.localName === "a" && x.getAttribute("href") === `tel:${n}`), `o cartão do risco traz o ${n}`);
    confere(!!c3 && !botao(env, "Publicar", c3) && !botao(env, "Marcar como lido", c3), "o pedido com risco não vai ao boletim");
    confere(texto(env, "cpaPedMsg").includes("SINAL DE RISCO"), "a contagem avisa do risco");
    // (revisão da tela, item 4) o Dirigente (nível da congregação) não desmarca — o catálogo diz (papeis.acima): no lugar do botão, a explicação (o servidor tem a palavra final)
    confere(!!c3 && !botao(env, "Desmarcar", c3) && c3.textContent.includes("Desmarcar/cancelar é da Área para cima"), "Dirigente: sem o botão Desmarcar, com 'é da Área para cima'");
    confere(srv.S.sessoes.lid && env.g("cpaCatalogos").papeis.acima === false, "o catálogo do Dirigente diz acima=false");
    // a Pastora de Área desmarca: motivo obrigatório e a confirmação reforçada (428)
    const envA = novo(srv);
    envA.ctx.__fatorConfirmar = async () => { srv.S.sessoes.area.fator = true; return true; }; envA.ctx.__fatorPedidos = 0;
    await abrirAba(envA, "area", 12);
    confere(envA.g("cpaCatalogos").papeis.acima === true, "o catálogo da Área diz acima=true");
    await clicar(envA, envA.e("btnCpaSecaoPedidos")); await clicar(envA, envA.e("btnCpaPedRisco"));
    const cardA = (t) => desc(envA, envA.e("cpaPedLista")).filter(x => x.localName === "div" && x.className.includes("cpa-pedido")).find(c => c.textContent.includes(t)) || null;
    await clicar(envA, botao(envA, "Desmarcar", cardA("PEDIDO-P3")));
    await clicar(envA, botao(envA, "Desmarcar o sinal de risco", envA.e(`cpaPedForm${p3.PedidoId}`)));
    confere(texto(envA, "cpaDesMsg").includes("motivo") && chamadas(envA, "POST cuidado-pastoral/risco").length === 0, "desmarcar sem motivo: aviso");
    digitar(envA, "cpaDesMotivo", "Conversei: era sobre um filme");
    await clicar(envA, botao(envA, "Desmarcar o sinal de risco", envA.e(`cpaPedForm${p3.PedidoId}`)));
    const rs = chamadas(envA, "POST cuidado-pastoral/risco");
    confere(rs.length === 2 && envA.ctx.__fatorPedidos === 1 && JSON.stringify(rs[1].corpo) === JSON.stringify({ pedidoId: p3.PedidoId, marcar: false, motivo: "Conversei: era sobre um filme" }), "desmarcar: 428 → confirmação reforçada → a mesma chamada repetida uma vez");
    confere(texto(envA, "cpaPedMsg").includes("Sinal de risco desmarcado") && !cardA("PEDIDO-P3"), `Área: desmarcado, sai da lista do risco (${texto(envA, "cpaPedMsg")})`);
    await clicar(env, env.e("btnCpaPedRisco"));
    confere(!card("PEDIDO-P3"), "na tela do Dirigente, relida, o pedido saiu do risco");
    // marcar risco num pedido que a lista não pegou (confirmação) — com o aviso que não saiu do app
    await clicar(env, env.e("btnCpaPedTodos"));
    srv.S.avisoExterno = false;
    const mr = await clicarEResponder(env, botao(env, "Marcar sinal de risco", card("PEDIDO-P2")), true);
    confere(mr.aberto && mr.texto.includes("avisa agora toda a liderança"), "marcar o risco pede confirmação e explica o efeito");
    confere(JSON.stringify(ultima(env, "POST cuidado-pastoral/risco").corpo) === JSON.stringify({ pedidoId: p2.PedidoId, marcar: true }), "o corpo do marcar");
    confere(texto(env, "cpaPedMsg").includes("MAS o aviso não saiu") && env.e("cpaPedMsg").className.includes("psc-aviso"), `aviso que não saiu em destaque (${texto(env, "cpaPedMsg")})`);
    srv.S.avisoExterno = true;
    // acompanhar um pedido (P3 ainda não tem acompanhamento) e "Ver acompanhamento"
    await clicar(env, botao(env, "Abrir acompanhamento", card("PEDIDO-P3")));
    confere(ultima(env, "POST cuidado-pastoral/acompanhar-pedido").corpo.pedidoId === p3.PedidoId && texto(env, "cpaPedMsg").includes("Acompanhamento aberto."), "acompanhar o pedido");
    const ver = botao(env, "Ver acompanhamento", card("PEDIDO-P3"));
    confere(!!ver, "o pedido com acompanhamento oferece 'Ver acompanhamento'");
    await clicar(env, ver);
    confere(!escondido(env.e("cpaSecaoFila")) && !escondido(env.e("cpaDetalheGesCx")) && detalhe(env).includes("Pedido de oração"), "'Ver acompanhamento' abre o detalhe na fila");
    semTextos(env, ["PEDIDO-P1", "PEDIDO-P2", "PEDIDO-P3"], "depois de ir para a fila");
    // o pedido recebido em mãos
    await clicar(env, env.e("btnCpaSecaoPedidos"));
    const btnReg = botao(env, "Registrar pedido recebido em mãos");
    await clicar(env, btnReg);
    confere(env.foco() === env.e("cpaRpCong") && env.e("cpaRpCong").value === "1", "o formulário abre com a congregação já escolhida e o foco nela");
    await clicar(env, env.e("cpaRpBotao"));
    confere(texto(env, "cpaRpMsg").includes("cadastro"), "sem dizer se é do cadastro: aviso");
    marcar(env, "cpaRpCadNao"); await env.ocioso();
    digitar(env, "cpaRpNome", "Dona Benedita"); digitar(env, "cpaRpContato", "(91) 3222-1111");
    escolher(env, "cpaRpCategoria", "FAMILIA"); digitar(env, "cpaRpTexto", "Pelo neto que está longe de casa.");
    await clicar(env, env.e("cpaRpBotao"));
    confere(texto(env, "cpaRpMsg").includes("boletim") && chamadas(env, "POST cuidado-pastoral/registrar-pedido").length === 0, "sem a escolha do boletim: aviso");
    marcar(env, "cpaRpBolSim");
    await clicar(env, env.e("cpaRpBotao"));
    const rp = ultima(env, "POST cuidado-pastoral/registrar-pedido");
    confere(!!rp && JSON.stringify(rp.corpo) === JSON.stringify({ congregacaoId: 1, categoria: "FAMILIA", paraQuem: "PROPRIO", texto: "Pelo neto que está longe de casa.", podeBoletim: true, querContato: false, solicitanteNome: "Dona Benedita", solicitanteContato: "(91) 3222-1111" }), `o corpo do registrar-pedido: ${rp && JSON.stringify(rp.corpo)}`);
    confere(env.e("cpaRegPedCx").innerHTML === "" && texto(env, "cpaPedMsg").includes("Pedido recebido") && env.foco() === btnReg, "registrado: o formulário fecha, a mensagem fica e o foco volta");
    await clicar(env, btnReg);
    marcar(env, "cpaRpCadSim"); await env.ocioso();
    digitar(env, "cpaRpBusca", "Ana"); await clicar(env, botao(env, "🔍 Buscar", env.e("cpaRegPedCx")));
    await clicar(env, botao(env, "Escolher", env.e("cpaRpBuscaRes")));
    escolher(env, "cpaRpCategoria", "LUTO"); digitar(env, "cpaRpTexto", "Ele ameaçou me matar ontem."); marcar(env, "cpaRpBolNao");
    await clicar(env, env.e("cpaRpBotao"));
    const rp2 = ultima(env, "POST cuidado-pastoral/registrar-pedido");
    confere(rp2.corpo.membroId === 60 && !("solicitanteNome" in rp2.corpo), "do cadastro: vai a matrícula, não o nome");
    confere(texto(env, "cpaRpResposta").includes("Pedido registrado COM SINAL DE RISCO") && texto(env, "cpaRpResposta").includes("atenda agora") && desc(env, env.e("cpaRpResposta")).some(x => x.getAttribute && x.getAttribute("href") === "tel:190"), `pedido em mãos com risco: a resposta do servidor (para a liderança) e os telefones ficam no formulário (${texto(env, "cpaRpResposta").slice(0, 160)})`);
    confereAcessibilidade(env, ["abaCuidadopastoral"], "pedidos");
    limpo(env, "pedidos");
  });

  // ============================================================================================================================================
  // 8) O BOLETIM (impressão) e O PAINEL
  // ============================================================================================================================================
  cenario("Boletim de oração (sem nome, imprimir) e painel por congregação", async () => {
    const srv = servidor(); semear(srv);
    srv.novoPedido({ congregacaoId: 1, solicitante: 31, texto: "TEXTO-SECRETO-1", moderacao: "APROVADO", textoBoletim: "Alguém da Congregação Central pede oração pela família.", boletimAte: somarDias(hojeBr(), 5) });
    srv.novoPedido({ congregacaoId: 2, solicitante: 11, texto: "TEXTO-SECRETO-2", moderacao: "APROVADO", textoBoletim: "Alguém da Congregação Vila Nova agradece a Deus e pede que a igreja agradeça junto.", boletimAte: somarDias(hojeBr(), 9) });
    srv.novoPedido({ congregacaoId: 2, solicitante: 11, texto: "vencido", moderacao: "APROVADO", textoBoletim: "Linha já vencida do boletim.", boletimAte: somarDias(hojeBr(), -1) });
    srv.novoPedido({ congregacaoId: 1, solicitante: 31, texto: "esperando", querContato: true });
    const env = novo(srv);
    await abrirAba(env, "area", 12);
    await clicar(env, env.e("btnCpaSecaoBoletim"));
    const b = texto(env, "cpaBolImprimivel");
    confere(b.includes("Congregação Central") && b.includes("Congregação Vila Nova") && b.includes("pede oração pela família") && b.includes("agradece a Deus"), "o boletim agrupa por congregação");
    confere(!b.includes("Linha já vencida") && !b.includes("TEXTO-SECRETO") && !b.includes("Irmã Rute") && !b.includes("Ev. Marcos"), "o boletim não tem linha vencida, texto nem nome");
    escolher(env, "cpaBolCong", "2"); await env.ocioso();
    confere(ultima(env, "GET cuidado-pastoral/boletim").consulta.congregacaoId === "2" && !texto(env, "cpaBolImprimivel").includes("Congregação Central"), "filtrar por congregação");
    await clicar(env, botao(env, "🖨️ Imprimir"));
    confere(env.impressoes.length === 1 && env.impressoes[0].classeImprimindo && env.impressoes[0].conteudo.includes("agradece a Deus"), "imprimir chama window.print com a classe de impressão");
    env.dispararJanela("afterprint");
    confere(!env.doc.body.classList.contains("cpa-imprimindo"), "a classe de impressão sai depois (afterprint)");
    const css = lerApp("style.css");
    confere(/@media print \{[^}]*#cpaNotaCx[^}]*display: none !important/.test(css) && /body\.cpa-imprimindo #cpaBolImprimivel \{ position: absolute/.test(css), "o CSS de impressão esconde a nota e imprime só o boletim");
    await clicar(env, env.e("btnCpaSecaoPainel"));
    confere(texto(env, "cpaSecaoPainel").includes("EBD e as reuniões") && texto(env, "cpaSecaoPainel").includes("não registra presença nos cultos"), "o painel explica o que a detecção mede");
    const linhas = desc(env, env.e("cpaPainelLista")).filter(x => x.localName === "tr");
    confere(linhas.length === 3, `cabeçalho + 2 congregações da área: ${linhas.length}`);
    const central = linhas.find(x => x.textContent.includes("Central"));
    const tds = central ? desc(env, central).filter(x => x.localName === "td").map(x => x.textContent) : [];
    // Central: abertos it1,it2,it3,it4,it6 = 5; vencidos it2 = 1 (+ it6? prazo 30h → não); sem responsável it3 = 1; urgentes it3 = 1; detectados it2,it6 = 2; horas: — ; pedidos esperando 1; risco 0
    confere(JSON.stringify(tds) === JSON.stringify(["5", "1", "1", "1", "2", "—", "1", "0"]), `os números da Central: ${tds.join("|")}`);
    const tdVenc = central && desc(env, central).filter(x => x.localName === "td")[1];
    confere(!!tdVenc && tdVenc.className.includes("cpa-num-alerta"), "vencidos > 0 em destaque");
    confere(!!desc(env, env.e("cpaPainelLista")).find(x => x.className && x.className.includes("cpa-rolagem")), "a tabela rola dentro da sua caixa (não a página)");
    limpo(env, "boletim e painel");
  });

  // ============================================================================================================================================
  // 9) XSS EM TODO CAMPO QUE VEM DO SERVIDOR
  // ============================================================================================================================================
  cenario("XSS: texto de ataque em todo campo do servidor nunca vira marcação nem executa", async () => {
    const srv = servidor({ ataque: true });
    const A = (c, t) => `${t} ${ATAQUE(c)}`;
    const I = {
      it1: srv.novoItem({ tipo: "VISITANTE", pessoaNome: A("pessoaNome", "Carla"), pessoaContato: A("pessoaContato", "(91) 99999-0000"), motivo: A("motivo", "Veio"), responsavel: 30, prazoH: 30.5 }),
      it2: srv.novoItem({ tipo: "AFASTAMENTO", membroId: 50, origem: "DETECCAO", deteccaoResumo: A("deteccao", "EBD: antes 9 de 10"), motivo: A("motivo2", "Caiu"), prazoH: -50.5, nivel: "AREA", responsavel: 30 })
    };
    srv.novoEvento({ ItemId: I.it2.ItemId, Tipo: "CONTATO", MembroId: 31, Forma: "VISITA_LAR", Conseguiu: true, Acompanhante: A("acompanhante", "Rute"), Observacao: A("observacao", "Foi bem") });
    srv.novoEvento({ ItemId: I.it2.ItemId, Tipo: "ESCALONADO", NivelPara: "AREA", PrazoNovo: new Date(AGORA) });
    srv.novoEvento({ ItemId: I.it2.ItemId, Tipo: "ATRIBUIDO", MembroId: 10, ResponsavelMembroId: 30 });
    const n1 = srv.novaNota({ membroId: 50, nivel: "EQUIPE", texto: A("notaTexto", "Nota"), autor: 31 });
    srv.novaNota({ membroId: 50, nivel: "PASTORAL", texto: A("notaTexto2", "Nota pastoral"), autor: 10, retifica: n1.NotaId });
    srv.novoPedido({ solicitante: null, solicitanteNome: A("solicitanteNome", "Benedita"), solicitanteContato: A("solicitanteContato", "(91) 3222-1111"), texto: A("pedidoTexto", "Pela saúde"), querContato: true });
    srv.novoPedido({ solicitante: 60, texto: A("pedidoRisco", "ele me bate"), risco: true, riscoCrianca: true });
    srv.novoPedido({ solicitante: 60, texto: A("pedidoAprov", "ok"), moderacao: "APROVADO", textoBoletim: A("textoBoletim", "Alguém pede"), boletimAte: somarDias(hojeBr(), 5) });
    srv.novoPedido({ solicitante: 60, texto: A("pedidoDesm", "ok"), riscoJaTeve: true, riscoDesmarcadoMotivo: A("desmarcadoMotivo", "alarme falso") });
    srv.novoPedido({ congregacaoId: 1, solicitante: 30, texto: A("meuPedido", "Meu pedido"), moderacao: "APROVADO", textoBoletim: A("boletimMeu", "Linha"), boletimAte: somarDias(hojeBr(), 3) });
    srv.novoItem({ tipo: "PEDIDO_VISITA", membroId: 30, origem: "PEDIDO_MEMBRO", responsavel: 10 });
    const env = novo(srv);
    env.ctx.__fatorConfirmar = async () => { srv.S.sessoes.lid.fator = true; return true; };
    await abrirAba(env);
    limpo(env, "fila com ataque", ["[pessoaNome]", "[congNome1]", "[deteccao]", "[nome30]", "[tipo-VISITANTE]", "[prazo]"]);
    await clicar(env, botao(env, "➕ Abrir acompanhamento"));
    escolher(env, "cpaNovoTipo", "VISITANTE"); await env.ocioso();
    marcar(env, "cpaNovoCadSim"); await env.ocioso();
    digitar(env, "cpaNovoBusca", "Jo"); await clicar(env, botao(env, "🔍 Buscar", env.e("cpaNovoMembroCx")));
    limpo(env, "abrir + busca com ataque", ["[tipo-desc-VISITANTE]", "[nome30]"]);
    await clicar(env, botao(env, "Cancelar", env.e("cpaNovoCx")));
    await abrirItemPorNome(env, "[nome50]");
    limpo(env, "detalhe com ataque", ["[motivo2]", "[tel50]", "[acompanhante]", "[observacao]", "[forma-VISITA_LAR]", "[degrau-AREA]", "[origem-DETECCAO]", "[nivel-EQUIPE]", "[nome31]"]);
    for (const tipo of ["Registrar contato", "✅ Concluir", "Trocar responsável", "Adiar prazo", "✖️ Cancelar"]) {
      await clicar(env, botao(env, tipo, env.e("cpaDetalheGes")));
      limpo(env, `formulário ${tipo} com ataque`);
    }
    await clicar(env, botao(env, "Escrever nota", env.e("cpaNotasCx")));
    limpo(env, "formulário da nota com ataque", ["[nivel-desc-PASTORAL]"]);
    const lis = desc(env, env.e("cpaNotasCx")).filter(x => x.localName === "li" && x.className.includes("cpa-nota"));
    for (const li of lis) { await clicar(env, botao(env, "Abrir a nota", li)); limpo(env, "nota aberta com ataque"); }
    confere(texto(env, "cpaNotaCorpo").includes("[notaTexto"), "o texto da nota com ataque aparece como texto");
    await clicar(env, botao(env, "Quem abriu", desc(env, env.e("cpaNotasCx")).find(x => x.localName === "li" && x.textContent.includes("(você)"))));
    limpo(env, "quem abriu com ataque", ["[nome10]"]);
    // recusa do servidor com ataque na mensagem
    env.api.rotas["POST cuidado-pastoral/contato"] = { status: 422, corpo: { sucesso: false, mensagem: A("mensagem422", "Recusado") } };
    await clicar(env, botao(env, "Registrar contato", env.e("cpaDetalheGes")));
    escolher(env, "cpaFcForma", "LIGACAO"); marcar(env, "cpaFcSim");
    await clicar(env, env.e("cpaFormBotao"));
    limpo(env, "422 com ataque", ["[mensagem422]"]);
    delete env.api.rotas["POST cuidado-pastoral/contato"];
    await clicar(env, env.e("btnCpaSecaoPedidos"));
    await clicar(env, env.e("btnCpaPedTodos"));
    limpo(env, "pedidos com ataque", ["[pedidoTexto]", "[solicitanteNome]", "[solicitanteContato]", "[textoBoletim]", "[desmarcadoMotivo]", "[categoria-SAUDE]", "[paraquem-PROPRIO]", "[ajudaNome0]", "[pedidoRisco]"]);
    await clicar(env, botao(env, "Publicar no boletim", desc(env, env.e("cpaPedLista")).find(x => x.localName === "div" && x.className.includes("cpa-pedido") && x.textContent.includes("[pedidoTexto]"))));
    confere(env.e("cpaPubTexto").value.includes("[congNome1]"), "a sugestão do boletim (com ataque) entra no campo como texto");
    limpo(env, "publicar com ataque");
    await clicar(env, botao(env, "Registrar pedido recebido em mãos"));
    limpo(env, "registrar pedido com ataque", ["[categoria-LUTO]"]);
    await clicar(env, env.e("btnCpaSecaoBoletim"));
    limpo(env, "boletim com ataque", ["[textoBoletim]"]);
    await clicar(env, env.e("btnCpaSecaoPainel"));
    limpo(env, "painel com ataque", ["[congNome1]"]);
    // os telefones com ataque: o endereço tel: leva só os algarismos
    const tels = desc(env).filter(x => x.localName === "a" && (x.getAttribute("href") || "").startsWith("tel:"));
    confere(tels.length > 0 && tels.every(x => /^tel:\d{3,13}$/.test(x.getAttribute("href"))), `os links de telefone levam só algarismos: ${tels.map(x => x.getAttribute("href")).slice(0, 3).join(",")}`);
    // Meu Painel com ataque (o responsável e o membro)
    const env2 = novo(srv);
    await abrirMeu(env2, "pin30", 30);
    limpo(env2, "Meu Painel com ataque", ["[pessoaNome]", "[pessoaContato]", "[motivo]", "[boletimMeu]", "[meuPedido]", "[ajudaDesc0]", "[categoria-FAMILIA]", "[tipo-PEDIDO_VISITA]"]);
    await abrirItemPorNome(env2, "[pessoaNome]", "cpaMeusLista");
    limpo(env2, "detalhe do responsável com ataque", ["[motivo]"]);
    escolher(env2, "cpaPoCategoria", "SAUDE"); digitar(env2, "cpaPoTexto", "Quero morrer, não aguento mais."); marcar(env2, "cpaPoBolNao");
    await clicar(env2, env2.e("cpaPoBotao"));
    limpo(env2, "resposta do risco com ataque nos telefones", ["[ajudaNome1]"]);
    env2.api.rotas["POST cuidado-pastoral/pedir-visita"] = { status: 429, corpo: { sucesso: false, limite: true, mensagem: A("mensagem429", "Limite"), ajuda: srv.cp.CONTATOS_DE_AJUDA } };
    digitar(env2, "cpaPvMotivo", "Quero uma visita, por favor");
    await clicar(env2, env2.e("cpaPvBotao"));
    limpo(env2, "429 com ataque", ["[mensagem429]"]);
  });

  // ============================================================================================================================================
  // 10) SAÍDA, TROCA DE LOGIN E O MÓDULO AUSENTE
  // ============================================================================================================================================
  cenario("Saída da aba e da sessão, troca de login e módulo ausente no cache", async () => {
    const srv = servidor(); const I = semear(srv); semearNotas(srv, I);
    srv.novoPedido({ solicitante: 60, texto: "PEDIDO-PRIVADO-777" });
    const env = novo(srv);
    await abrirAba(env);
    await clicar(env, env.e("btnCpaSecaoPedidos"));
    confere(texto(env, "cpaPedLista").includes("PEDIDO-PRIVADO-777"), "o pedido está na tela");
    await clicar(env, env.e("btnCpaSecaoFila"));
    semTextos(env, ["PEDIDO-PRIVADO-777"], "o texto do pedido sai ao trocar de seção");
    await abrirItemPorNome(env, "Maria Afastada");
    await clicar(env, botao(env, "Abrir a nota", desc(env, env.e("cpaNotasCx")).find(x => x.localName === "li" && x.textContent.includes("Diác. João"))));
    env.ev('mostrarAbaSecretaria("protecao")'); await env.ocioso();
    semTextos(env, ["NOTA-EQUIPE-AAA", "Maria Afastada", "Carla Visitante", "José Internado"], "sair da aba");
    confere(g(env, "cpaFila").length === 0 && g(env, "cpaDet") === null && env.e("cpaFilaLista").innerHTML === "", "sair da aba zera a fila e o acompanhamento");
    env.ev('mostrarAbaSecretaria("cuidadopastoral")'); await env.ocioso();
    confere(cartoes(env).length === 4 && !escondido(env.e("cpaFilaCx")), "voltar à aba relê a fila (e mostra a lista, não o detalhe antigo)");
    // troca de login sem sair: outra pessoa, outra tela
    env.sessao({ matricula: 12, token: "area" });
    env.ev('mostrarAbaSecretaria("cuidadopastoral")'); await env.ocioso();
    confere(g(env, "cpaDono") === "12|senha" && env.e("cpaFiltroCong").options.length === 3, "trocar de login refaz a tela para a outra pessoa");
    // sair da sessão
    env.ev("limparSessao()"); await env.ocioso();
    confere(env.e("cpaFilaLista").innerHTML === "" && env.e("cpaFiltroCong").innerHTML === "" && g(env, "cpaCatalogos") === null && g(env, "cpaCongregacoes").length === 0, "sair da sessão esvazia listas, seletores e catálogo");
    semTextos(env, ["Maria Afastada", "Carla Visitante"], "sair da sessão");
    confere(env.gravacoes.every(x => !/Maria|Carla|NOTA|PEDIDO|Afastada/.test(x.valor)), "nenhum dado pessoal no armazenamento do navegador");
    confere(env.api.chamadas.every(c => !/Maria|Carla|NOTA|PEDIDO|Afastada|Jos%C3%A9|Jo%C3%A3o/.test(c.url)), "nenhum nome nem texto em endereço");
    confere(env.consoleDaTela.length === 0, `o console ficou limpo: ${JSON.stringify(env.consoleDaTela.slice(0, 2))}`);
    // o módulo velho ou ausente no cache: a navegação e a saída da sessão seguem
    const env2 = novo(srv, { semModulo: true });
    let erro = null;
    try {
      env2.sessao({ matricula: 10, token: "lid" });
      env2.ev('mostrarAbaSecretaria("cuidadopastoral")');
      env2.ev('mostrarAbaSecretaria("meupainel")'); env2.ev('mostrarSubAbaMeupainel("cuidado")'); env2.ev('mostrarSubAbaMeupainel("perfil")');
      env2.ev("limparSessao()");
    } catch (e) { erro = e; }
    confere(!erro && env2.g("authToken") === null, `sem o módulo, a navegação e a saída da sessão não quebram (${erro && erro.message})`);
    confere(desc(env2, env2.e("cpaAjudaFixa")).some(x => x.localName === "a" && x.getAttribute("href") === "tel:188"), "sem o módulo, os telefones de ajuda continuam no HTML");
  });

  // ============================================================================================================================================
  // 11) RESPOSTAS ATRASADAS
  // ============================================================================================================================================
  cenario("Respostas atrasadas não repintam a tela de agora", async () => {
    const srv = servidor(); const I = semear(srv);
    const env = novo(srv);
    await abrirAba(env);
    // filtro trocado antes de a fila velha chegar
    let r = env.retem(c => c.chave === "GET cuidado-pastoral/fila" && c.consulta.situacao === "URGENTES");
    escolher(env, "cpaFiltroSituacao", "URGENTES"); await env.ocioso();
    escolher(env, "cpaFiltroSituacao", "ENCERRADOS"); await env.ocioso();
    r.liberar(); await env.ocioso();
    confere(cartoes(env).length === 1 && !!cartaoDe(env, "Encerrada Antiga"), "a fila velha (urgentes) não sobrescreve a nova (encerrados)");
    escolher(env, "cpaFiltroSituacao", "ABERTOS"); await env.ocioso();
    // o detalhe de um item chega depois de abrir outro
    r = env.retem(c => c.chave === "GET cuidado-pastoral/item" && c.consulta.itemId === String(I.it2.ItemId));
    env.doc.clicar(botao(env, "Abrir acompanhamento", cartaoDe(env, "Maria Afastada"))); await env.ocioso();
    env.ev(`cpaAbrirDetalheAcao("Ges", ${I.it1.ItemId}, null)`); await env.ocioso();
    r.liberar(); await env.ocioso();
    confere(detalhe(env).includes("Carla Visitante") && !detalhe(env).includes("Maria Afastada"), "o detalhe velho não aparece por cima do novo");
    // o detalhe chega depois de voltar à lista
    await clicar(env, botao(env, "Voltar à fila"));
    r = env.retem(c => c.chave === "GET cuidado-pastoral/item");
    env.doc.clicar(botao(env, "Abrir acompanhamento", cartaoDe(env, "José Internado"))); await env.ocioso();
    await clicar(env, botao(env, "Voltar à fila"));
    r.liberar(); await env.ocioso();
    confere(env.e("cpaDetalheGes").innerHTML === "" && escondido(env.e("cpaDetalheGesCx")), "o detalhe que chega depois de voltar não aparece");
    // os pedidos: a pílula trocada antes de a resposta chegar
    await clicar(env, env.e("btnCpaSecaoPedidos"));
    srv.novoPedido({ solicitante: 60, texto: "AGUARDANDO-X" }); srv.novoPedido({ solicitante: 60, texto: "RISCO-Y", risco: true });
    r = env.retem(c => c.chave === "GET cuidado-pastoral/pedidos" && c.consulta.situacao === "AGUARDANDO");
    await clicar(env, env.e("btnCpaPedAguardando"));
    await clicar(env, env.e("btnCpaPedRisco"));
    r.liberar(); await env.ocioso();
    confere(texto(env, "cpaPedLista").includes("RISCO-Y") && !texto(env, "cpaPedLista").includes("AGUARDANDO-X"), "a lista velha de pedidos não sobrescreve a nova");
    // a sessão acabou com o catálogo a caminho
    const env2 = novo(srv);
    r = env2.retem(c => c.chave === "GET cuidado-pastoral/catalogos");
    env2.sessao({ matricula: 10, token: "lid" }); env2.ev('mostrarAbaSecretaria("cuidadopastoral")'); await env2.ocioso();
    env2.ev("limparSessao()"); await env2.ocioso();
    r.liberar(); await env2.ocioso();
    confere(env2.g("cpaCatalogos") === null && env2.e("cpaFilaLista").innerHTML === "" && !env2.api.chamadas.some(c => c.chave === "GET cuidado-pastoral/fila"), "o catálogo que chega depois da saída não monta nada");
    // Meu Painel: a sub-aba trocada com "meus" a caminho
    const env3 = novo(srv);
    I.it1.ResponsavelMembroId = 30;
    r = env3.retem(c => c.chave === "GET cuidado-pastoral/meus");
    await abrirMeu(env3, "pin30", 30);
    env3.ev('mostrarSubAbaMeupainel("perfil")'); await env3.ocioso();
    r.liberar(); await env3.ocioso();
    confere(env3.e("cpaMeusLista").innerHTML === "" && escondido(env3.e("cpaMeusCx")), "'meus' que chega depois de sair da sub-aba não aparece");
    // a busca que chega depois de fechar o formulário
    await abrirAba(env, "lid", 10);
    await clicar(env, botao(env, "➕ Abrir acompanhamento"));
    marcar(env, "cpaNovoCadSim"); await env.ocioso(); digitar(env, "cpaNovoBusca", "Jo");
    r = env.retem(c => c.chave === "POST cuidado-pastoral/buscar-pessoas");
    env.doc.clicar(botao(env, "🔍 Buscar", env.e("cpaNovoMembroCx"))); await env.ocioso();
    await clicar(env, botao(env, "Cancelar", env.e("cpaNovoCx")));
    r.liberar(); await env.ocioso();
    confere(env.e("cpaNovoCx").innerHTML === "" && !texto(env, "abaCuidadopastoral").includes("Joana Adolescente"), "a busca que chega depois de fechar não aparece");
    limpo(env, "atrasadas");
  });

  // ============================================================================================================================================
  // 12) DUPLO CLIQUE, PRAZO DE 20 S E ERROS DO SERVIDOR
  // ============================================================================================================================================
  cenario("Duplo clique, prazo de 20 s, 500, 403 e sessão expirada", async () => {
    const srv = servidor(); const I = semear(srv);
    const env = novo(srv);
    await abrirAba(env);
    await abrirItemPorNome(env, "Carla Visitante");
    await clicar(env, botao(env, "Registrar contato", env.e("cpaDetalheGes")));
    escolher(env, "cpaFcForma", "LIGACAO"); marcar(env, "cpaFcSim");
    let r = env.retem(c => c.chave === "POST cuidado-pastoral/contato");
    const gravar = env.e("cpaFormBotao");
    env.doc.clicar(gravar); await env.ocioso();
    confere(gravar.disabled, "o botão fica travado enquanto grava");
    env.doc.clicar(gravar); env.ev("cpaEnviarContatoAcao(null)"); await env.ocioso();
    r.liberar(); await env.ocioso();
    confere(chamadas(env, "POST cuidado-pastoral/contato").length === 1, `duplo clique grava uma vez só (${chamadas(env, "POST cuidado-pastoral/contato").length})`);
    confere(env.toasts().some(t => t.includes("Aguarde")), "o segundo toque avisa para aguardar");
    // pedido de oração: duplo clique
    const env2 = novo(srv);
    await abrirMeu(env2, "pin60", 60);
    escolher(env2, "cpaPoCategoria", "SAUDE"); digitar(env2, "cpaPoTexto", "Pela saúde do meu pai."); marcar(env2, "cpaPoBolSim");
    r = env2.retem(c => c.chave === "POST cuidado-pastoral/pedir-oracao");
    env2.doc.clicar(env2.e("cpaPoBotao")); env2.ev("cpaEnviarOracaoAcao(null)"); await env2.ocioso();
    r.liberar(); await env2.ocioso();
    confere(chamadas(env2, "POST cuidado-pastoral/pedir-oracao").length === 1, "o pedido de oração vai uma vez só");
    // prazo de 20 s: a fila
    r = env.retem(c => c.chave === "GET cuidado-pastoral/fila");
    await clicar(env, botao(env, "Voltar à fila"));
    env.doc.clicar(botao(env, "🔄 Atualizar", env.e("cpaFilaCx"))); await env.ocioso();
    confere(env.dispararTemporizador(20000) >= 1, "a chamada da fila tem o prazo de 20 s");
    await env.ocioso();
    // (revisão da tela, item 10) o toast do fetchProtegido diz "Não foi possível conectar ao servidor": a tela não pode dizer outra coisa ("o servidor demorou")
    const toastRede = env.toasts().find(t => t.includes("Não foi possível conectar"));
    confere(texto(env, "cpaFilaMsg").startsWith("Não foi possível falar com o servidor a tempo") && texto(env, "cpaFilaMsg").includes("20 segundos") && !!toastRede, `o tempo esgotado na tela concorda com o toast (${texto(env, "cpaFilaMsg").slice(0, 80)} | ${toastRede})`);
    // prazo de 20 s: o pedido de oração (não foi enviado + telefones)
    digitar(env2, "cpaPoTexto", "Outro pedido de oração."); escolher(env2, "cpaPoCategoria", "SAUDE"); marcar(env2, "cpaPoBolSim");
    r = env2.retem(c => c.chave === "POST cuidado-pastoral/pedir-oracao");
    env2.doc.clicar(env2.e("cpaPoBotao")); await env2.ocioso();
    const leiturasMP = chamadas(env2, "GET cuidado-pastoral/meus-pedidos").length;
    env2.dispararTemporizador(20000); await env2.ocioso();
    r.liberar(); await env2.ocioso();
    // (revisão da tela, item 2) tempo esgotado depois de mandar: talvez tenha chegado — "veja em Meus pedidos", que é relido; telefones à vista; o texto fica
    confere(texto(env2, "cpaOracaoResultado").includes("20 segundos") && texto(env2, "cpaOracaoResultado").includes("Não sabemos se o seu pedido chegou") && !texto(env2, "cpaOracaoResultado").includes("NÃO foi enviado")
      && env2.e("cpaPoTexto").value === "Outro pedido de oração.", `tempo esgotado no pedido: 'não sabemos se chegou' e o texto fica (${texto(env2, "cpaOracaoResultado").slice(0, 140)})`);
    confere(chamadas(env2, "GET cuidado-pastoral/meus-pedidos").length === leiturasMP + 1 && ["188", "190", "180", "100"].every(n => desc(env2, env2.e("cpaOracaoResultado")).some(x => x.getAttribute && x.getAttribute("href") === `tel:${n}`)), "tempo esgotado: Meus pedidos relido e os 4 telefones na resposta");
    // o reenvio do mesmo texto: o servidor reconhece (o primeiro chegou) e a tela mostra a mensagem dele
    const pedidosAntes = srv.S.pedidos.length;
    await clicar(env2, env2.e("cpaPoBotao"));
    confere(srv.S.pedidos.length === pedidosAntes && texto(env2, "cpaOracaoResultado").includes("Este pedido já tinha chegado"), `reenvio do mesmo pedido: nada novo é gravado e a mensagem do servidor aparece (${texto(env2, "cpaOracaoResultado").slice(0, 100)})`);
    // 500 (corpo que não é JSON)
    env.api.rotas["GET cuidado-pastoral/fila"] = { status: 500, corpo: null, naoJson: true };
    await clicar(env, botao(env, "🔄 Atualizar", env.e("cpaFilaCx")));
    confere(env.e("cpaFilaMsg").className.includes("psc-aviso") && texto(env, "cpaFilaMsg").length > 5 && env.e("cpaFilaLista").innerHTML === "", `500: a mensagem fica na tela: ${texto(env, "cpaFilaMsg")}`);
    delete env.api.rotas["GET cuidado-pastoral/fila"];
    // 403 do servidor (a permissão foi retirada no meio)
    env.api.rotas["GET cuidado-pastoral/pedidos"] = { status: 403, corpo: { sucesso: false, mensagem: "Isto é da liderança do cuidado pastoral. Fale com quem administra as Permissões." } };
    await clicar(env, env.e("btnCpaSecaoPedidos"));
    confere(texto(env, "cpaPedMsg").includes("Fale com quem administra as Permissões") && env.toasts().filter(t => t.includes("administra as Permissões")).length === 1, "403: a mensagem do servidor na tela e um toast só");
    delete env.api.rotas["GET cuidado-pastoral/pedidos"];
    // sessão expirada (401)
    env.sessao({ matricula: 10, token: "token-que-nao-existe" });
    await clicar(env, env.e("btnCpaSecaoFila"));
    confere(env.g("authToken") === null && env.e("cpaFilaLista").innerHTML === "", "401: a sessão sai e a fila some");
    // a recusa do servidor sem permissão: sessão de liderança sem a permissão chamando a fila
    const env3 = novo(srv);
    env3.sessao({ matricula: 11, token: "semperm", permissoes: ["cuidado_pastoral"] });   // a tela acha que tem; o servidor diz que não
    env3.ev('mostrarAbaSecretaria("cuidadopastoral")'); await env3.ocioso();
    confere(!escondido(env3.e("cpaSemAcesso")) && !env3.api.chamadas.some(c => c.chave === "GET cuidado-pastoral/fila"), "o servidor diz que não é gestão: a tela avisa e não pede a fila");
    limpo(env, "erros");
  });

  // ============================================================================================================================================
  // 12b) O CONTRATO DEPOIS DA REVISÃO INDEPENDENTE DO SERVIDOR (21/10/2026)
  // ============================================================================================================================================
  cenario("Revisão do servidor: só nível geral, item encerrado do pedido, tirar do boletim, 403 da Área, diagnóstico e caractere invisível", async () => {
    const srv = servidor(); const I = semear(srv);
    // pedido cujo acompanhamento já foi encerrado: oferece abrir outro, não "ver"
    const pFechado = srv.novoPedido({ solicitante: 31, texto: "PEDIDO-FECHADO: pela família", categoria: "FAMILIA" });
    srv.novoItem({ tipo: "PEDIDO_ORACAO", membroId: 31, pedidoOracaoId: pFechado.PedidoId, origem: "PEDIDO_ORACAO", status: "CONCLUIDO", desfecho: "INTEGRADO" });
    const pAberto = srv.novoPedido({ solicitante: 60, texto: "PEDIDO-COM-ITEM: pela saúde", querContato: true });
    srv.novoItem({ tipo: "PEDIDO_ORACAO", membroId: 60, pedidoOracaoId: pAberto.PedidoId, origem: "PEDIDO_ORACAO" });
    // no boletim (para tirar) e um caso "só nível geral" (cita a liderança)
    const pBol = srv.novoPedido({ solicitante: 31, texto: "PEDIDO-NO-BOLETIM", moderacao: "APROVADO", textoBoletim: "Alguém da Congregação Central pede oração pela família.", boletimAte: somarDias(hojeBr(), 5) });
    srv.novoPedido({ solicitante: 50, texto: "PEDIDO-SO-GERAL: o pastor me bate", risco: true, soNivelGeral: true });
    // (v7.11.1) um pedido confidencial que veio do mural do SITE: sem congregação, só do nível geral, fora do boletim
    srv.novoPedido({ origem: "SITE", texto: "PEDIDO-DO-SITE confidencial", podeBoletim: false, soNivelGeral: true, solicitanteNome: "Anônima do site", siteItemId: 77 });
    const itGeral = srv.novoItem({ tipo: "PEDIDO_ORACAO", membroId: 50, origem: "PEDIDO_ORACAO", urgente: true, soNivelGeral: true, responsavel: null, nivel: "GERAL", prazoH: 20 });
    const env = novo(srv);
    await abrirAba(env);
    confere(!texto(env, "cpaFilaLista").includes("Maria Afastada") || cartoes(env).filter(c => c.textContent.includes("Maria Afastada")).length === 1, "o item 'só nível geral' não aparece para o Dirigente");
    confere(!texto(env, "cpaFilaLista").includes("só o nível geral"), "nenhum selo de 'só nível geral' na fila do Dirigente");
    await clicar(env, env.e("btnCpaSecaoPedidos")); await clicar(env, env.e("btnCpaPedTodos"));
    const card = (t) => desc(env, env.e("cpaPedLista")).filter(x => x.localName === "div" && x.className.includes("cpa-pedido")).find(c => c.textContent.includes(t)) || null;
    confere(!card("PEDIDO-SO-GERAL"), "o pedido que cita a liderança não aparece para o Dirigente");
    const cf = card("PEDIDO-FECHADO");
    confere(!!cf && !!botao(env, "Abrir acompanhamento", cf) && !botao(env, "Ver acompanhamento", cf), "pedido com o acompanhamento ENCERRADO: oferece abrir outro, sem 'ver'");
    const ca = card("PEDIDO-COM-ITEM");
    confere(!!ca && !!botao(env, "Ver acompanhamento", ca) && !botao(env, "Abrir acompanhamento", ca), "pedido com acompanhamento aberto: só 'ver'");
    await clicar(env, botao(env, "Abrir acompanhamento", cf));
    confere(texto(env, "cpaPedMsg").includes("Acompanhamento aberto.") && !!card("PEDIDO-FECHADO") && !!botao(env, "Ver acompanhamento", card("PEDIDO-FECHADO")), "abrir outro acompanhamento para o pedido encerrado");
    // tirar do boletim (aba No boletim)
    await clicar(env, env.e("btnCpaPedAprovados"));
    const cb = card("PEDIDO-NO-BOLETIM");
    confere(!!cb && !!botao(env, "Tirar do boletim", cb) && !botao(env, "Publicar", cb), "no boletim: 'Tirar do boletim' (e não Publicar)");
    await clicar(env, botao(env, "Tirar do boletim", cb));
    confere(JSON.stringify(ultima(env, "POST cuidado-pastoral/moderar").corpo) === JSON.stringify({ pedidoId: pBol.PedidoId, decisao: "NAO_PUBLICAR" }) && texto(env, "cpaPedMsg").includes("Retirado do boletim"), `tirar do boletim: ${texto(env, "cpaPedMsg")}`);
    // a linha do boletim com diagnóstico é recusada (422, a mensagem do servidor no formulário)
    await clicar(env, env.e("btnCpaPedAguardando"));
    const cp1 = card("PEDIDO-COM-ITEM");
    await clicar(env, botao(env, "Publicar no boletim", cp1));
    digitar(env, "cpaPubTexto", "Alguém pede oração por um câncer na família.");
    await clicar(env, botao(env, "📖 Publicar", env.e(`cpaPedForm${pAberto.PedidoId}`)));
    confere(texto(env, "cpaPubMsg").includes("diagnóstico") && !!env.e("cpaPubTexto"), `diagnóstico na linha do boletim: recusado pelo servidor (${texto(env, "cpaPubMsg")})`);
    // (revisão da tela, item 4) cancelar um acompanhamento URGENTE é da Área para cima: o Dirigente não tem o botão, tem a explicação; o não urgente continua com o botão
    await clicar(env, env.e("btnCpaSecaoFila"));
    await abrirItemPorNome(env, "José Internado");
    confere(!botao(env, "✖️ Cancelar", env.e("cpaDetalheGes")) && detalhe(env).includes("Desmarcar/cancelar é da Área para cima") && I.it3.Status === "ABERTO", "urgente, Dirigente: sem 'Cancelar', com 'é da Área para cima'");
    await clicar(env, botao(env, "Voltar à fila"));
    await abrirItemPorNome(env, "Carla Visitante");
    confere(!!botao(env, "✖️ Cancelar", env.e("cpaDetalheGes")), "não urgente, Dirigente: o botão Cancelar continua");
    // a Pastora de Área tem o Cancelar no urgente
    const envAr = novo(srv);
    await abrirAba(envAr, "area", 12);
    await abrirItemPorNome(envAr, "José Internado");
    confere(!!botao(envAr, "✖️ Cancelar", envAr.e("cpaDetalheGes")), "urgente, Área: o botão Cancelar aparece");
    // o nível geral vê o caso "só nível geral", com o selo
    const envG = novo(srv);
    await abrirAba(envG, "geral", 13, true);
    const cg = cartoes(envG).find(c => c.textContent.includes("Maria Afastada") && c.textContent.includes("Pedido de oração"));
    confere(!!cg && cg.textContent.includes("só o nível geral"), "o nível geral vê o acompanhamento 'só nível geral', com o selo");
    await clicar(envG, envG.e("btnCpaSecaoPedidos")); await clicar(envG, envG.e("btnCpaPedRisco"));
    const cgp = desc(envG, envG.e("cpaPedLista")).find(x => x.localName === "div" && x.className.includes("cpa-pedido") && x.textContent.includes("PEDIDO-SO-GERAL"));
    confere(!!cgp && cgp.textContent.includes("Só o nível geral (cita a liderança)"), "o pedido 'só nível geral' traz o selo para o nível geral");
    confere(itGeral.SoNivelGeral, "(o item 'só nível geral' existe)");
    // o pedido do mural do site, na aba "aguardando" do nível geral: o selo do site, nenhum "Abrir acompanhamento" (não há congregação nem contato) nem "Publicar no boletim"
    await clicar(envG, envG.e("btnCpaPedAguardando"));
    const cs = desc(envG, envG.e("cpaPedLista")).find(x => x.localName === "div" && x.className.includes("cpa-pedido") && x.textContent.includes("PEDIDO-DO-SITE"));
    confere(!!cs && cs.textContent.includes("Veio do mural de oração do site") && cs.textContent.includes("Mural de oração do site"), "(v7.11.1) o pedido do site aparece para o nível geral com o selo do site");
    confere(!!cs && !botao(envG, "📂 Abrir acompanhamento", cs) && !botao(envG, "📖 Publicar no boletim", cs) && !!botao(envG, "✔️ Marcar como lido", cs), "(v7.11.1) o pedido do site não oferece acompanhamento nem boletim; só marcar como lido");
    confere(!cs || !cs.textContent.includes("Só o nível geral (cita a liderança)"), "(v7.11.1) o pedido do site não leva o selo de 'cita a liderança'");
    // Meu Painel: o pedido que teve risco volta com o texto guardado, tal como o servidor manda; caractere invisível é recusado
    const envM = novo(srv);
    await abrirMeu(envM, "pin50", 50);
    confere(texto(envM, "cpaMeusPedidos").includes("fica guardado só com a liderança") && !texto(envM, "cpaMeusPedidos").includes("o pastor me bate"), "o texto do pedido com risco não volta à tela de quem pediu");
    confere(!/risco/i.test(texto(envM, "cpaMeusPedidos")), "Meus pedidos nunca fala em 'risco'");
    escolher(envM, "cpaPoCategoria", "SAUDE"); digitar(envM, "cpaPoTexto", "Pela saúde da​ minha avó."); marcar(envM, "cpaPoBolNao");
    await clicar(envM, envM.e("cpaPoBotao"));
    confere(texto(envM, "cpaOracaoResultado").includes("invisível") && envM.e("cpaPoTexto").value.includes("avó"), `caractere invisível: a recusa do servidor aparece e o texto fica (${texto(envM, "cpaOracaoResultado").slice(0, 120)})`);
    // os nomes das telas que o aviso de risco cita existem exatamente assim
    const html = lerApp("index.html");
    for (const nome of ["Pedidos de oração", "Sinal de risco", "Fila", "Urgentes"]) confere(html.includes(`>${nome}<`) || html.includes(` ${nome}<`) || html.includes(`>${nome} (`), `a tela tem "${nome}" (o aviso de risco manda abrir)`);
    const avisoRisco = F.cp.textoRisco({ congregacaoNome: "Central" });
    confere(avisoRisco.includes("Pedidos de oração → Sinal de risco") && avisoRisco.includes("Fila → Urgentes"), "o aviso do servidor cita os nomes que a tela tem");
    limpo(env, "revisão"); limpo(envG, "revisão (geral)"); limpo(envM, "revisão (membro)");
  });

  // ============================================================================================================================================
  // 12c) A REVISÃO INDEPENDENTE DA TELA (21/10/2026): cada item tem uma verificação que falhava no código de antes
  // ============================================================================================================================================
  cenario("Revisão da tela: respostas atrasadas depois de sair, nota guardada, foco, quem abriu, diálogos, impressão, corretor, vida da nota, rascunho", async () => {
    const depois = (env, chave, n0) => chamadas(env, chave).length - n0;
    // ---- item 1: um ato que estava a caminho não relê nem pinta nada depois que a pessoa saiu ----
    {
      const srv = servidor(); semear(srv);
      srv.novoPedido({ solicitante: 60, texto: "PEDIDO-ATRASADO-1: pela família" });
      const env = novo(srv);
      await abrirAba(env);
      // (a) Marcar como lido → sai para Meu Painel → a resposta chega
      await clicar(env, env.e("btnCpaSecaoPedidos"));
      let r = env.retem(c => c.chave === "POST cuidado-pastoral/moderar");
      const cartao = desc(env, env.e("cpaPedLista")).find(x => x.localName === "div" && x.className.includes("cpa-pedido") && x.textContent.includes("PEDIDO-ATRASADO-1"));
      env.doc.clicar(botao(env, "Marcar como lido", cartao)); await env.ocioso();
      env.ev('mostrarAbaSecretaria("meupainel")'); await env.ocioso();
      let n0 = chamadas(env, "GET cuidado-pastoral/pedidos").length;
      r.liberar(); await env.ocioso();
      confere(env.e("cpaPedLista").innerHTML === "" && depois(env, "GET cuidado-pastoral/pedidos", n0) === 0, "item 1a: 'Marcar como lido' que chega depois de sair não relê nem repõe os textos dos pedidos");
      semTextos(env, ["PEDIDO-ATRASADO-1"], "item 1a");
      // (b) Abrir acompanhamento (visitante) → sai → a resposta chega
      env.ev('mostrarAbaSecretaria("cuidadopastoral")'); await env.ocioso();
      await clicar(env, env.e("btnCpaSecaoFila"));
      await clicar(env, botao(env, "➕ Abrir acompanhamento"));
      escolher(env, "cpaNovoTipo", "VISITANTE"); marcar(env, "cpaNovoCadNao"); await env.ocioso();
      digitar(env, "cpaNovoNome", "Visitante Atrasado"); digitar(env, "cpaNovoContato", "(91) 97777-0001");
      r = env.retem(c => c.chave === "POST cuidado-pastoral/abrir");
      env.doc.clicar(env.e("cpaNovoBotao")); await env.ocioso();
      env.ev('mostrarAbaSecretaria("meupainel")'); await env.ocioso();
      n0 = chamadas(env, "GET cuidado-pastoral/fila").length;
      r.liberar(); await env.ocioso();
      confere(env.e("cpaFilaLista").innerHTML === "" && depois(env, "GET cuidado-pastoral/fila", n0) === 0, "item 1b: 'abrir' que chega depois de sair não relê a fila (nomes e contatos não voltam)");
      semTextos(env, ["Visitante Atrasado", "Carla Visitante", "97777-0001"], "item 1b");
      // (c) Registrar contato: a releitura do acompanhamento está a caminho quando a pessoa sai
      env.ev('mostrarAbaSecretaria("cuidadopastoral")'); await env.ocioso();
      await clicar(env, env.e("btnCpaSecaoFila"));
      await abrirItemPorNome(env, "Carla Visitante");
      await clicar(env, botao(env, "Registrar contato", env.e("cpaDetalheGes")));
      escolher(env, "cpaFcForma", "LIGACAO"); marcar(env, "cpaFcSim");
      r = env.retem(c => c.chave === "GET cuidado-pastoral/item");
      env.doc.clicar(env.e("cpaFormBotao")); await env.ocioso();
      env.ev('mostrarAbaSecretaria("meupainel")'); await env.ocioso();
      n0 = chamadas(env, "GET cuidado-pastoral/fila").length;
      r.liberar(); await env.ocioso();
      confere(env.e("cpaFilaLista").innerHTML === "" && depois(env, "GET cuidado-pastoral/fila", n0) === 0 && texto(env, "cpaFilaMsg") === "", "item 1c: o contato cuja releitura chega depois de sair não relê a fila nem escreve a mensagem");
      semTextos(env, ["Carla Visitante", "99999-0000"], "item 1c");
      // (d) o voluntário conclui pelo Meu Painel e sai da sub-aba com a releitura a caminho
      const envV = novo(srv);
      await abrirMeu(envV, "pin30", 30);
      await abrirItemPorNome(envV, "Joaquim Menor", "cpaMeusLista");
      await clicar(envV, botao(envV, "✅ Concluir", envV.e("cpaDetalheMeu")));
      escolher(envV, "cpaFkDesfecho", "INTEGRADO");
      r = envV.retem(c => c.chave === "GET cuidado-pastoral/item");
      envV.doc.clicar(envV.e("cpaFormBotao")); await envV.ocioso();
      envV.ev('mostrarSubAbaMeupainel("perfil")'); await envV.ocioso();
      n0 = chamadas(envV, "GET cuidado-pastoral/meus").length;
      r.liberar(); await envV.ocioso();
      confere(envV.e("cpaMeusLista").innerHTML === "" && depois(envV, "GET cuidado-pastoral/meus", n0) === 0, "item 1d: a conclusão do voluntário que chega depois de sair não relê 'meus' (o telefone não volta)");
      semTextos(envV, ["Joaquim Menor", "(91) 90052-1234"], "item 1d");
    }
    // ---- itens 3, 5, 6, 7, 11 e 12: no acompanhamento da liderança ----
    {
      const srv = servidor(); const I = semear(srv); const N = semearNotas(srv, I);
      const env = novo(srv);
      await abrirAba(env);
      await abrirItemPorNome(env, "Maria Afastada");
      // item 12: abrir outro formulário não apaga o rascunho da nota; e ele sobrevive à releitura depois do ato
      await clicar(env, botao(env, "Escrever nota", env.e("cpaNotasCx")));
      escolher(env, "cpaFnNivel", "LIDERANCA"); digitar(env, "cpaFnTexto", "RASCUNHO-DA-NOTA-XYZ");
      await clicar(env, botao(env, "Registrar contato", env.e("cpaDetalheGes")));
      confere(!!env.e("cpaFnTexto") && env.e("cpaFnTexto").value === "RASCUNHO-DA-NOTA-XYZ" && !!env.e("cpaFcForma"), "item 12: abrir 'Registrar contato' não apaga o rascunho da nota");
      escolher(env, "cpaFcForma", "LIGACAO"); marcar(env, "cpaFcSim");
      await clicar(env, env.e("cpaFormBotao"));
      confere(texto(env, "cpaDetalheGesMsg") === "Contato registrado." && !!env.e("cpaFnTexto") && env.e("cpaFnTexto").value === "RASCUNHO-DA-NOTA-XYZ" && env.e("cpaFnNivel").value === "LIDERANCA", "item 12: o rascunho (texto e nível) sobrevive à releitura depois do contato");
      // item 5: depois do ato o foco não cai no <body>
      confere(env.foco() === env.e("cpaDetTitulo"), `item 5: depois do contato o foco vai para o título do acompanhamento (${env.foco() && (env.foco().id || env.foco().localName)})`);
      // item 3a: guardada, mas a releitura falha → o formulário e o texto saem mesmo assim (o botão não pode mandar de novo)
      env.api.rotas["GET cuidado-pastoral/notas"] = { status: 500, corpo: { sucesso: false, mensagem: "Erro interno." } };
      const notasAntes = srv.S.notas.length;
      await clicar(env, env.e("cpaFnBotao"));
      delete env.api.rotas["GET cuidado-pastoral/notas"];
      confere(srv.S.notas.length === notasAntes + 1 && !env.e("cpaFnTexto") && env.e("cpaNotaForm").innerHTML === "", "item 3a: nota guardada e releitura que falha: o formulário e o texto saem já");
      confere(texto(env, "cpaNotasMsg").includes("Nota guardada; não foi possível atualizar a lista"), `item 3a: 'guardada; não foi possível atualizar a lista' (${texto(env, "cpaNotasMsg")})`);
      semTextos(env, ["RASCUNHO-DA-NOTA-XYZ"], "item 3a");
      // item 3b: sem resposta (20 s) → "pode ter sido guardada", a lista é relida e o rascunho fica
      await clicar(env, botao(env, "Escrever nota", env.e("cpaNotasCx")));
      escolher(env, "cpaFnNivel", "EQUIPE"); digitar(env, "cpaFnTexto", "NOTA-SEM-RESPOSTA");
      const r = env.retem(c => c.chave === "POST cuidado-pastoral/nota");
      env.doc.clicar(env.e("cpaFnBotao")); await env.ocioso();
      const n0 = chamadas(env, "GET cuidado-pastoral/notas").length;
      env.dispararTemporizador(20000); await env.ocioso();
      r.liberar(); await env.ocioso();
      confere(texto(env, "cpaFnMsg").includes("pode ter sido guardada") && chamadas(env, "GET cuidado-pastoral/notas").length === n0 + 1 && env.e("cpaFnTexto") && env.e("cpaFnTexto").value === "NOTA-SEM-RESPOSTA",
        `item 3b: tempo esgotado na nota: aviso explícito, lista relida e rascunho guardado (${texto(env, "cpaFnMsg").slice(0, 90)})`);
      await clicar(env, botao(env, "Fechar", env.e("cpaNotaForm")));
      confere(env.e("cpaNotaForm").innerHTML === "", "o 'Fechar' da nota fecha só a nota");
      // item 6: a resposta atrasada de "quem abriu" não escreve no pedaço que saiu da tela
      const lista = () => desc(env, env.e("cpaNotasCx")).filter(x => x.localName === "li" && x.className.includes("cpa-nota"));
      const liDe = (notaId) => lista().find(x => desc(env, x).some(y => y.id === `cpaLeit${notaId}`));
      await clicar(env, botao(env, "Abrir a nota", liDe(N.n4.NotaId)));
      const velho = env.e(`cpaLeit${N.n4.NotaId}`);
      const rl = env.retem(c => c.chave === "GET cuidado-pastoral/leituras");
      env.doc.clicar(botao(env, "Quem abriu", liDe(N.n4.NotaId))); await env.ocioso();
      await clicar(env, botao(env, "Atualizar notas", env.e("cpaNotasCx")));
      rl.liberar(); await env.ocioso();
      confere(!!velho && !velho.textContent.includes("Pr. Paulo Dirigente") && env.e(`cpaLeit${N.n4.NotaId}`) !== velho, "item 6: 'quem abriu' atrasado não escreve na caixa velha (a lista foi refeita)");
      await clicar(env, botao(env, "Quem abriu", liDe(N.n4.NotaId)));
      confere(texto(env, `cpaLeit${N.n4.NotaId}`).includes("Pr. Paulo Dirigente"), "item 6: na lista nova, 'quem abriu' funciona");
      // item 11: a nota aberta fecha quando a página fica escondida, no pagehide e ao voltar para a Portaria
      const abrirN1 = async () => { await clicar(env, botao(env, "Abrir a nota", lista().find(x => x.textContent.includes("Diác. João")))); confere(texto(env, "cpaNotaCorpo").includes("NOTA-EQUIPE-AAA"), "abriu a nota de equipe"); };
      await abrirN1();
      env.doc.visibilityState = "hidden"; env.doc.disparar(env.doc.body, "visibilitychange"); env.doc.visibilityState = "visible";
      confere(!texto(env, "cpaNotaCorpo").includes("NOTA-EQUIPE-AAA"), "item 11: a página escondida (celular no bolso) fecha a nota aberta");
      await abrirN1();
      env.dispararJanela("pagehide");
      confere(!texto(env, "cpaNotaCorpo").includes("NOTA-EQUIPE-AAA"), "item 11: o pagehide fecha a nota aberta");
      await abrirN1();
      env.ev("voltarParaCheckin()"); await env.ocioso();
      confere(env.e("cpaFilaLista").innerHTML === "" && env.e("cpaDetalheGes").innerHTML === "", "item 11: voltar para a Portaria tira a fila e o acompanhamento da página");
      semTextos(env, ["NOTA-EQUIPE-AAA", "Maria Afastada"], "item 11 (Portaria)");
      // item 7a: sair da sessão com o diálogo aberto fecha o diálogo e nada é enviado
      await abrirAba(env);
      await abrirItemPorNome(env, "Carla Visitante");
      await clicar(env, botao(env, "✖️ Cancelar", env.e("cpaDetalheGes")));
      escolher(env, "cpaFxDesfecho", "ENGANO"); digitar(env, "cpaFxMotivo", "Aberto por engano");
      env.doc.clicar(env.e("cpaFormBotao")); await env.ocioso();
      confere(!env.e("modalOverlay").classList.contains("escondido"), "o diálogo do cancelar está aberto");
      env.ev("limparSessao()"); await env.ocioso();
      confere(env.e("modalOverlay").classList.contains("escondido") && env.e("modalCaixa").innerHTML === "" && chamadas(env, "POST cuidado-pastoral/cancelar").length === 0, "item 7a: sair da sessão fecha o diálogo aberto e nada é enviado");
      // item 7b: diálogo aberto, a pessoa sai da aba, depois confirma: nada é enviado e nada quebra
      await abrirAba(env);
      await abrirItemPorNome(env, "Carla Visitante");
      await clicar(env, botao(env, "Trocar responsável", env.e("cpaDetalheGes")));
      digitar(env, "cpaFrBusca", "Jo"); await clicar(env, botao(env, "🔍 Buscar", env.e("cpaFormAcao")));
      env.doc.clicar(botao(env, "Nomear", env.e("cpaFrRes"))); await env.ocioso();
      env.ev('mostrarAbaSecretaria("protecao")'); await env.ocioso();
      env.consoleDaTela.length = 0;
      const confirmar = env.e("modalConfirmar");
      if (confirmar && typeof confirmar.onclick === "function") confirmar.onclick();
      await env.ocioso();
      confere(chamadas(env, "POST cuidado-pastoral/atribuir").length === 0 && env.consoleDaTela.filter(x => x.tipo === "error").length === 0, `item 7b: confirmar depois de sair da aba não grava nem quebra (${JSON.stringify(env.consoleDaTela.slice(0, 1))})`);
      limpo(env, "revisão da tela (acompanhamento)");
    }
    // ---- item 2 (registrar-pedido) e item 8 (impressão) ----
    {
      const srv = servidor(); semear(srv);
      srv.novoPedido({ congregacaoId: 1, solicitante: 31, texto: "x", moderacao: "APROVADO", textoBoletim: "Alguém da Congregação Central pede oração pela família.", boletimAte: somarDias(hojeBr(), 5) });
      const env = novo(srv);
      await abrirAba(env);
      await clicar(env, env.e("btnCpaSecaoPedidos"));
      await clicar(env, botao(env, "Registrar pedido recebido em mãos"));
      marcar(env, "cpaRpCadNao"); await env.ocioso();
      digitar(env, "cpaRpNome", "Dona Benedita"); escolher(env, "cpaRpCategoria", "FAMILIA"); digitar(env, "cpaRpTexto", "Pelo neto que está longe."); marcar(env, "cpaRpBolSim");
      const r = env.retem(c => c.chave === "POST cuidado-pastoral/registrar-pedido");
      env.doc.clicar(env.e("cpaRpBotao")); await env.ocioso();
      const n0 = chamadas(env, "GET cuidado-pastoral/pedidos").length;
      env.dispararTemporizador(20000); await env.ocioso();
      r.liberar(); await env.ocioso();
      confere(texto(env, "cpaRpMsg").includes("Não sabemos se o pedido chegou") && chamadas(env, "GET cuidado-pastoral/pedidos").length === n0 + 1 && env.e("cpaRpTexto").value === "Pelo neto que está longe.",
        `item 2: o pedido em mãos sem resposta: 'não sabemos se chegou', a lista é relida e o texto fica (${texto(env, "cpaRpMsg").slice(0, 120)})`);
      // item 8: a classe de impressão fica até o afterprint; listas com nomes nunca saem num Ctrl+P comum
      await clicar(env, env.e("btnCpaSecaoBoletim"));
      await clicar(env, botao(env, "🖨️ Imprimir"));
      confere(env.impressoes.length === 1 && env.impressoes[0].classeImprimindo && env.doc.body.classList.contains("cpa-imprimindo"), "item 8: depois do print() a classe de impressão continua (o celular monta a folha depois)");
      env.dispararJanela("afterprint");
      confere(!env.doc.body.classList.contains("cpa-imprimindo"), "item 8: o afterprint tira a classe de impressão");
      const css = lerApp("style.css");
      const regra = (/@media print \{\s*([^{]*)\{ display: none !important; \}/.exec(css.slice(css.indexOf("Impressão (v7.11)"))) || [])[1] || "";
      for (const id of ["#cpaFilaLista", "#cpaPainelLista", "#cpaMeusLista", "#cpaDetalheGes", "#cpaDetalheMeu", "#cpaNotaCx", "#cpaPedLista"]) confere(regra.includes(id), `item 8: ${id} nunca sai num Ctrl+P comum`);
    }
    // ---- item 9: o corretor do navegador não lê o que se escreve (todo campo de texto livre tem spellcheck="false") ----
    {
      const modulo = lerApp("modulos/cuidado-pastoral.js");
      const campos = [...modulo.matchAll(/<(textarea|input type="text")[^>]*>/g)].map(m => m[0]);
      const sem = campos.filter(c => !c.includes('spellcheck="false"'));
      confere(campos.length >= 18 && sem.length === 0, `item 9: todo campo de texto livre tem spellcheck="false" (${campos.length} campos; sem: ${sem.map(c => (/id="([^"]+)"/.exec(c) || [])[1]).join(", ")})`);
      for (const id of ["cpaDesMotivo", "cpaFcObs", "cpaFkObs", "cpaFaMotivo", "cpaFxMotivo", "cpaNovoMotivo", "cpaPubTexto"]) confere(campos.some(c => c.includes(`id="${id}"`) && c.includes('spellcheck="false"')), `item 9: ${id} com spellcheck="false"`);
    }
  });

  cenario("O servidor imitado não teve erro interno nem consulta desconhecida em nenhum cenário", async () => {
    for (const s of SERVIDORES) {
      confere(s.S.erros.length === 0, `erro interno do servidor (cenário "${s.cenario}"): ${s.S.erros.slice(0, 1).join("").slice(0, 300)}`);
      confere(s.consultasSemImitacao.length === 0, `consulta sem imitação (cenário "${s.cenario}"): ${s.consultasSemImitacao.slice(0, 1).join("")}`);
    }
    confere(SERVIDORES.length >= 10, `servidores criados: ${SERVIDORES.length}`);
  });

  // ============================================================================================================================================
  // 13) CELULAR, ALVOS DE TOQUE E LEITOR DE TELA (o que se prova sem navegador)
  // ============================================================================================================================================
  cenario("CSS do celular e da impressão, alvos de 44 px, mensagens anunciadas", async () => {
    const css = lerApp("style.css");
    const bloco = css.slice(css.indexOf("v7.11 — Cuidado pastoral"));
    confere(bloco.length > 1000, "o CSS da v7.11 existe");
    confere(/\.cpa-btn \{[^}]*min-height: 44px/.test(bloco) && /\.cpa-opcao \{[^}]*min-height: 44px/.test(bloco) && /\.cpa-tel \{[^}]*min-height: 48px/.test(bloco) && /\.cpa-pilulas \.cal-pilula \{ min-height: 44px/.test(bloco), "botões, opções, pílulas e telefones com pelo menos 44 px");
    confere(/@media \(max-width: 640px\) \{[^}]*\.cpa-barra/.test(bloco), "no celular a barra empilha");
    confere(!/width: (\d{4,}|[4-9]\d\d)px/.test(bloco.replace(/max-width: 640px/g, "")), "nenhuma largura fixa grande (nada rola de lado a 390 px)");
    confere(/\.cpa-rolagem \{ overflow-x: auto/.test(bloco), "só a tabela do painel rola, dentro da caixa");
    confere(/overflow-wrap: anywhere/.test(bloco), "texto longo quebra a linha");
    const html = lerApp("index.html");
    const sub = html.slice(html.indexOf('id="subMeupainelCuidado"'), html.indexOf("<!-- SUB-ABA: MINHA FORMAÇÃO"));
    const aba = html.slice(html.indexOf('id="abaCuidadopastoral"'), html.indexOf("<!-- ABA: ASSISTÊNCIA SOCIAL"));
    for (const [nome, h] of [["Meu Painel", sub], ["aba", aba]]) {
      const msgs = [...h.matchAll(/<p id="(cpa[A-Za-z]*Msg)"[^>]*>/g)];
      confere(msgs.length >= 2 && msgs.every(m => /role="status"/.test(m[0]) && /aria-live="polite"/.test(m[0])), `${nome}: toda mensagem é anunciada (role=status e aria-live)`);
    }
    const modulo = lerApp("modulos/cuidado-pastoral.js");
    const msgsMod = [...modulo.matchAll(/<p id="(cpa[A-Za-z]*Msg)"[^>]*>/g)];
    confere(msgsMod.length >= 8 && msgsMod.every(m => /aria-live="polite"/.test(m[0])), "as mensagens dos formulários também são anunciadas");
    confere(/role="alert"/.test(modulo), "o sinal de risco é anunciado como alerta");
  });

  // ---- execução ----
  const vivo = setInterval(() => {}, 1000);
  const naoTratada = (erro) => { T.total++; T.falhas.push(`${T.cenarioAtual}: exceção não tratada na tela (${String(erro && erro.stack || erro).split("\n").slice(0, 3).join(" | ")})`); };
  process.on("unhandledRejection", naoTratada); process.on("uncaughtException", naoTratada);
  for (const c of cenarios) {
    if (so && !c.nome.includes(so)) continue;
    T.cenarioAtual = c.nome;
    try { await c.fn(); } catch (erro) { T.total++; T.falhas.push(`${c.nome}: EXCEÇÃO ${String(erro && erro.stack || erro).split("\n").slice(0, 4).join(" | ")}`); }
  }
  clearInterval(vivo);
  process.off("unhandledRejection", naoTratada); process.off("uncaughtException", naoTratada);
  return T;
}

module.exports = { rodar };

if (require.main === module) {
  rodar({ so: process.argv[2] || null }).then(r => {
    console.log(`${r.total} verificações, ${r.falhas.length} falhas`);
    r.falhas.slice(0, 80).forEach(f => console.log("  ✗ " + f));
    process.exit(r.falhas.length ? 1 : 0);
  });
}
