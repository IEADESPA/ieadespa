// roteiro.js — a tela da v7.15 (crise e segurança) contra o front de verdade, em DOM simulado, com o SERVIDOR imitado de fixtures.js (as formas do criseSegurancaDb.js e as regras
// de verdade do criseSeguranca.js) e texto de ataque (<img src=x onerror=...>) em TODO texto que vem dele. Cobre: a faixa da crise (sem sessão, PIN, liderança sem crise, crise
// ativa, o porta-voz, a saída da sessão e a troca de login, a releitura de tempos em tempos), a aba para toda liderança (as pílulas que o servidor libera), a Crise (abrir com a
// confirmação e o 428, o designado, trocar o porta-voz, encerrar, 409 relê), as Manifestações (o porta-voz, a correção, o link só http(s)), a Imprensa (registrar, corrigir,
// responder com a resposta anterior, recusar), a Segurança (painel, congregação, plano em versões, simulado, vistoria com pendência, resolver, anular, equipe, os telefones),
// Meus Dados, respostas atrasadas, o prazo, a rede caída, o console e o armazenamento.
"use strict";
const { criarAmbiente, lerApp } = require("./ambiente");
const F = require("./fixtures");
const { ATAQUE } = F;
const cs = require("../../api/shared/criseSeguranca");

async function rodar({ mutar = {}, so = null } = {}) {
  const T = { total: 0, falhas: [], cenarioAtual: "" };
  const confere = (cond, msg) => { T.total++; if (!cond) T.falhas.push(`${T.cenarioAtual}: ${msg}`); };
  const cenarios = [];
  const cenario = (nome, fn) => cenarios.push({ nome, fn });
  const AGORA = Date.parse("2026-10-23T15:00:00Z");      // 12h em Brasília
  const SERVIDORES = [];
  const servidor = (op) => { const s = F.criarServidor(Object.assign({ agoraMs: AGORA }, op || {})); s.cenario = T.cenarioAtual; SERVIDORES.push(s); return s; };
  const novo = (srv) => { const env = criarAmbiente({ mutar, agora: new Date(AGORA).toISOString(), servidor: srv ? srv.servidor : null }); env.ctx.__fatorConfirmar = async () => { if (srv) srv.S.fatorOk = true; return true; }; return env; };
  const limpo = (env, qual, textos = []) => {
    confere(env.doc._ataques.length === 0, `${qual}: o texto de ataque virou marcação/atributo de evento (${JSON.stringify(env.doc._ataques.slice(0, 2))})`);
    confere(env.ctx.__xss.chamadas.length === 0, `${qual}: código do ataque EXECUTOU (${env.ctx.__xss.chamadas.slice(0, 4).join(",")})`);
    const corpo = env.doc.body.textContent;
    for (const t of textos) confere(corpo.includes(t), `${qual}: o texto do servidor "${t.slice(0, 60)}" não apareceu na tela como texto`);
    confere(env.doc._erros.length === 0, `${qual}: HTML malformado gerado (${env.doc._erros.slice(0, 2).join("; ")})`);
    confere(env.consoleDaTela.length === 0, `${qual}: o console da tela devia ficar limpo (${JSON.stringify(env.consoleDaTela.slice(0, 2)).slice(0, 300)})`);
    confere(!env.gravacoes.some(x => /crise|porta|imprensa|Joana|Central/i.test(x.chave + x.valor)), `${qual}: nada da crise no armazenamento do navegador`);
  };
  const desc = (env, raiz) => [...(raiz || env.doc.body).descendentes()];
  const escondido = (el) => { for (let p = el; p && p.nodeType === 1; p = p.parentNode) if (p.style && p.style.display === "none" && !["telaPainel", "cxPainelConteudo"].includes(p.id)) return true; return false; };
  const botao = (env, texto, raiz) => desc(env, raiz || env.e("abaCrise")).find(x => x.localName === "button" && x.textContent.includes(texto) && !escondido(x)) || null;
  const chamadas = (env, chave) => env.api.chamadas.filter(c => c.chave === chave);
  const ultima = (env, chave) => { const l = chamadas(env, chave); return l[l.length - 1] || null; };
  const texto = (env, id) => (env.e(id) ? env.e(id).textContent : "");
  const visivel = (env, id) => !!env.e(id) && env.e(id).style.display !== "none";
  const clicar = async (env, el) => { env.doc.clicar(el); await env.ocioso(); };
  const clicarEResponder = async (env, el, confirmar) => { env.doc.clicar(el); const m = await env.responderModal(confirmar); await env.ocioso(); return m; };
  const digitar = (env, id, v) => { const el = env.e(id); if (el) env.doc.digitar(el, v); return !!el; };
  const escolher = (env, id, v) => { const el = env.e(id); if (el) env.doc.escolher(el, v); return !!el; };
  const marcar = (env, id, v = true) => { const el = env.e(id); if (el) env.doc.marcar(el, v); return !!el; };
  const SESSOES = { geral: { matricula: 1, nivel: "GLOBAL", permissoes: ["crise_gestao", "seguranca_congregacao"], geral: true }, dir: { matricula: 5, permissoes: ["seguranca_congregacao"] },
    lider: { matricula: 20, permissoes: ["pessoas"] }, pv: { matricula: 30, permissoes: [] , nivel: "CONGREGACAO" }, pin: { matricula: 40, pin: true } };
  const entrar = (env, token) => env.sessao(Object.assign({ token }, SESSOES[token]));
  const abrirAba = async (env, token) => { entrar(env, token); env.ev('mostrarAbaSecretaria("crise")'); await env.ocioso(); };
  const secao = async (env, nome) => { await clicar(env, env.e(`btnCrsSecao${nome}`)); };
  const artigos = (env, id) => desc(env, env.e(id)).filter(x => x.localName === "article");

  // ============================================================================================================================================
  cenario("Contrato: ids, ações registradas, navegação, casca e servidor", async () => {
    const html = lerApp("index.html");
    const modulo = lerApp("modulos/crise-seguranca.js");
    const idsDoHtml = new Set([...html.matchAll(/\bid="([^"$]+)"/g)].map(m => m[1]));
    const idsDoModulo = new Set([...modulo.matchAll(/\bid="(crs[A-Za-z0-9_]+)/g)].map(m => m[1]));
    const referidos = [...new Set([...modulo.matchAll(/crs(?:El|Escrever|Mostrar|Valor|Marcado|TextoLivre)\("([A-Za-z0-9_]+)"/g)].map(m => m[1]))];
    const semDono = referidos.filter(id => !idsDoHtml.has(id) && !idsDoModulo.has(id) && !/^crsVisPend_|^crsResolve|^crsAnular_/.test(id));
    confere(referidos.length > 30 && semDono.length === 0, `ids que o módulo usa e nenhum HTML nem template cria: ${semDono.join(", ")}`);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    confere(ids.filter((id, i) => ids.indexOf(id) !== i && /^crs|Crise/.test(id)).length === 0, "nenhum id repetido no index.html");
    for (const s of ["Crise", "Manifestacoes", "Imprensa", "Seguranca"]) confere(idsDoHtml.has(`crsSecao${s}`) && idsDoHtml.has(`btnCrsSecao${s}`), `a seção e a pílula ${s} existem no HTML`);
    const registradas = (/registrarAcoes\(\{([\s\S]*?)\}\);/.exec(modulo) || ["", ""])[1].split(",").map(s => s.trim()).filter(Boolean);
    const usadas = new Set([...html.matchAll(/data-on-[a-z]+="(crs[A-Za-z]+)"/g), ...modulo.matchAll(/data-on-[a-z]+="(crs[A-Za-z]+)"/g)].map(m => m[1]));
    for (const m of modulo.matchAll(/"(crs[A-Za-z]+Acao)"/g)) usadas.add(m[1]);
    confere([...usadas].every(a => registradas.includes(a)) && registradas.every(a => usadas.has(a)), `toda ação usada está registrada e vice-versa (usadas sem registro: ${[...usadas].filter(a => !registradas.includes(a))}; registradas sem uso: ${registradas.filter(a => !usadas.has(a))})`);
    const sw = lerApp("service-worker.js");
    confere(sw.includes('"/modulos/crise-seguranca.js"') && /ieadespa-app-shell-v39/.test(sw), "o módulo está na casca do service worker (v39)");
    confere(html.indexOf('src="modulos/consagracoes.js"') < html.indexOf('src="modulos/crise-seguranca.js"') && html.indexOf('src="modulos/crise-seguranca.js"') < html.indexOf('src="modulos/cuidado-pastoral.js"'), "o script do módulo carrega na ordem dos nomes");
    const k = F.contratoComOServidor();
    const chamadasDoModulo = new Set([...modulo.matchAll(/crs(?:Obter|Postar)\(\s*[`"]([a-z-]+)/g), ...modulo.matchAll(/crsGravarSeguranca\(botao, "([a-z-]+)"/g)].map(m => m[1]));
    confere(chamadasDoModulo.size >= 18 && [...chamadasDoModulo].every(a => k.leituras.includes(a) || k.escritas.includes(a)), `toda ação que a tela chama existe na rota (${[...chamadasDoModulo].filter(a => !k.leituras.includes(a) && !k.escritas.includes(a))})`);
    confere(k.fator, "a rota pede a confirmação reforçada em abrir, porta-voz e encerrar");
    // campos que a tela lê e o banco escreve
    for (const campo of ["souPortaVoz", "ultimaRespostaId", "podeResponder", "corrigidaPor", "contatoApagado", "saiuDaCongregacao", "versoesDoPlano", "contatosEmergencia", "planoAtual", "comoResolvida", "anulacao", "portaVozEmCrises", "registrosNaCrise"]) {
      confere(k.banco.includes(campo) && modulo.includes(campo), `o campo "${campo}" sai do banco e é lido pela tela`);
    }
    const env = novo(null);
    confere(env.errosDaPagina.length === 0, `o index.html carrega sem erro (${env.errosDaPagina.slice(0, 2)})`);
    entrar(env, "lider");
    confere(env.g('temPermissaoDaAba("crise")') === true, "toda sessão de liderança enxerga a aba");
    entrar(env, "pin");
    confere(env.g('temPermissaoDaAba("crise")') === false, "a sessão de PIN não enxerga a aba");
    confere(env.g('MODULOS.crise.abas.join(",")') === "crise", "o módulo Crise e Segurança tem a aba");
  });

  cenario("Faixa: sem sessão, PIN, sem crise, crise ativa, porta-voz, saída da sessão", async () => {
    const srv = servidor();
    const env = novo(srv);
    env.ev("crsAtualizarFaixa()"); await env.ocioso();
    confere(env.api.chamadas.length === 0 && !visivel(env, "crsFaixa"), "sem sessão: nada é pedido e a faixa fica escondida");
    entrar(env, "pin"); env.ev("crsAtualizarFaixa()"); await env.ocioso();
    confere(env.api.chamadas.length === 0 && !visivel(env, "crsFaixa"), "PIN: nada é pedido (a faixa é da liderança)");
    entrar(env, "lider"); env.ev("crsAtualizarFaixa()"); await env.ocioso();
    confere(chamadas(env, "GET crise/faixa").length === 1 && !visivel(env, "crsFaixa"), "liderança sem crise: lê e fica escondida");
    srv.novaCrise();
    env.ev("crsAtualizarFaixa()"); await env.ocioso();
    confere(visivel(env, "crsFaixa") && texto(env, "crsFaixa").includes("Crise ativa — porta-voz único: Joana Assessora") && texto(env, "crsFaixa").includes("161-B"), "crise ativa: a faixa com o porta-voz e a vedação");
    limpo(env, "faixa", [srv.S.crise.portaVoz.nome, srv.S.crise.portaVoz.contato]);
    confere(!texto(env, "crsFaixa").includes("Acidente"), "a faixa nunca mostra o motivo");
    // relida de tempos em tempos ao trocar de tela (não a cada clique)
    env.limparRegistro();
    env.ev('crsAbaMudou("meupainel")'); await env.ocioso();
    confere(chamadas(env, "GET crise/faixa").length === 0, "trocar de tela logo em seguida não relê");
    env.ctx.__relogioMs += 121000;
    env.ev('crsAbaMudou("meupainel")'); await env.ocioso();
    confere(chamadas(env, "GET crise/faixa").length === 1, "passados 2 minutos, a troca de tela relê");
    // o porta-voz
    entrar(env, "pv"); env.ev("crsAtualizarFaixa()"); await env.ocioso();
    confere(texto(env, "crsFaixa").includes("Você é o porta-voz único"), "o porta-voz se reconhece na faixa");
    // a saída da sessão leva a faixa
    env.ev("limparSessao()"); await env.ocioso();
    confere(!visivel(env, "crsFaixa") && texto(env, "crsFaixa") === "", "sair da sessão apaga a faixa");
    // resposta atrasada de outra pessoa não pinta a faixa da próxima
    entrar(env, "lider");
    const r = env.retem(c => c.chave === "GET crise/faixa");
    env.ev("crsAtualizarFaixa()"); await env.ocioso();
    env.ev("limparSessao()"); entrar(env, "pin"); r.liberar(); await env.ocioso();
    confere(!visivel(env, "crsFaixa"), "a resposta que chega depois da troca de login é descartada");
    // o botão da faixa leva à Imprensa
    const env2 = novo(srv); entrar(env2, "lider"); env2.ev("crsAtualizarFaixa()"); await env2.ocioso();
    await clicar(env2, desc(env2, env2.e("crsFaixa")).find(x => x.localName === "button"));
    confere(visivel(env2, "abaCrise") && visivel(env2, "crsSecaoImprensa") && env2.e("crsDemVeiculo"), "\"Registrar pedido da imprensa\" abre a Imprensa");
    limpo(env2, "faixa → imprensa");
  });

  cenario("Aba: as pílulas que o servidor libera para cada papel", async () => {
    const srv = servidor({ comCrise: true });
    for (const [tok, esperado] of [["lider", ["Imprensa"]], ["dir", ["Imprensa", "Seguranca"]], ["pv", ["Manifestacoes", "Imprensa"]], ["geral", ["Crise", "Manifestacoes", "Imprensa", "Seguranca"]]]) {
      const env = novo(srv);
      await abrirAba(env, tok);
      const vis = ["Crise", "Manifestacoes", "Imprensa", "Seguranca"].filter(s => visivel(env, `btnCrsSecao${s}`));
      confere(JSON.stringify(vis) === JSON.stringify(esperado), `${tok}: pílulas ${vis} (esperado ${esperado})`);
      const aberta = ["Crise", "Manifestacoes", "Imprensa", "Seguranca"].filter(s => visivel(env, `crsSecao${s}`));
      confere(aberta.length === 1 && esperado.includes(aberta[0]), `${tok}: abre uma seção permitida (${aberta})`);
      limpo(env, `aba ${tok}`);
      // a pílula escondida não abre nem chamando a ação direto
      if (!esperado.includes("Crise")) { env.limparRegistro(); env.ev('crsMostrarSecaoAcao("crise")'); await env.ocioso(); confere(!visivel(env, "crsSecaoCrise") && chamadas(env, "GET crise/crises").length === 0, `${tok}: a seção da crise não abre pela ação`); }
    }
    // a troca de login fecha tudo e esconde as pílulas da pessoa anterior
    const env = novo(srv);
    await abrirAba(env, "geral");
    env.ev("limparSessao()"); await env.ocioso();
    confere(!visivel(env, "btnCrsSecaoCrise") && !visivel(env, "btnCrsSecaoSeguranca") && texto(env, "crsCriseConteudo") === "", "sair da sessão esconde as pílulas e limpa o conteúdo");
  });

  cenario("Crise: abrir (confirmação, 428), trocar o porta-voz, encerrar", async () => {
    const srv = servidor();
    const env = novo(srv);
    await abrirAba(env, "geral");
    confere(visivel(env, "crsSecaoCrise") && botao(env, "Abrir o regime"), "sem crise: o formulário de abertura");
    await clicar(env, botao(env, "Abrir o regime"));
    confere(texto(env, "crsCriseMsg").includes("motivo") && chamadas(env, "POST crise/abrir").length === 0, "sem motivo: a tela avisa e não manda");
    digitar(env, "crsMotivo", "Acidente no templo central");
    digitar(env, "crsAbreContato", "(91) 3333-4444");
    let m = await clicarEResponder(env, botao(env, "Abrir o regime"), false);
    confere(m.aberto && m.texto.includes("Toda a liderança") && chamadas(env, "POST crise/abrir").length === 0, "cancelar a confirmação não manda nada");
    m = await clicarEResponder(env, botao(env, "Abrir o regime"), true);
    const posts = chamadas(env, "POST crise/abrir");
    confere(posts.length === 2 && posts[0].corpo.portaVoz.tipo === "PRESIDENTE" && JSON.stringify(posts[1].corpo) === JSON.stringify({ motivo: "Acidente no templo central", portaVoz: { tipo: "PRESIDENTE", contato: "(91) 3333-4444" } }),
      "o 428 pede a confirmação reforçada e repete UMA vez, com o mesmo corpo");
    confere(env.g("window.__fatorPedidos") === 1, "a confirmação foi pedida uma vez");
    confere(visivel(env, "crsFaixa") && artigos(env, "crsCriseConteudo").some(a => a.textContent.includes("Regime de crise ativo")), "depois de abrir: a faixa aparece e o painel mostra o regime ativo");
    limpo(env, "aberta", [srv.S.crise.motivo]);
    // trocar o porta-voz para o profissional designado
    marcar(env, "crsTrocaTipoDesignado");
    digitar(env, "crsTrocaNome", "Joana Assessora"); digitar(env, "crsTrocaContato", "imprensa@igreja.org"); digitar(env, "crsTrocaAto", "Ato nº 13/2026"); digitar(env, "crsTrocaMatricula", "30");
    await clicarEResponder(env, botao(env, "Designar e avisar"), true);
    const pv = ultima(env, "POST crise/porta-voz");
    confere(pv && JSON.stringify(pv.corpo) === JSON.stringify({ criseId: srv.S.crise.criseId, portaVoz: { tipo: "DESIGNADO", nome: "Joana Assessora", contato: "imprensa@igreja.org", ato: "Ato nº 13/2026", membroId: 30 } }),
      `troca: o corpo com o tipo, o nome, o contato, o ato e a matrícula (${pv && JSON.stringify(pv.corpo)})`);
    // encerrar
    await clicar(env, botao(env, "Encerrar e avisar"));
    confere(texto(env, "crsCriseMsg").includes("resumo") && chamadas(env, "POST crise/encerrar").length === 0, "sem resumo: não manda");
    digitar(env, "crsResumoFim", "Assunto superado.");
    const criseId = srv.S.crise.criseId;
    await clicarEResponder(env, botao(env, "Encerrar e avisar"), true);
    confere(JSON.stringify(ultima(env, "POST crise/encerrar").corpo) === JSON.stringify({ criseId, resumo: "Assunto superado." }), "encerrar manda o resumo");
    confere(!visivel(env, "crsFaixa") && botao(env, "Abrir o regime") && artigos(env, "crsCriseConteudo").some(a => a.textContent.includes("Assunto superado")), "depois de encerrar: a faixa some e a crise vai para as encerradas");
    limpo(env, "encerrada");
    // 409: encerrar o que outro já encerrou relê
    srv.novaCrise();
    env.ev('crsMostrarSecaoAcao("crise")'); await env.ocioso();
    srv.S.encerradas.unshift(Object.assign({}, srv.S.crise, { status: "ENCERRADA" })); srv.S.crise = null;
    digitar(env, "crsResumoFim", "De novo encerrando.");
    env.limparRegistro();
    await clicarEResponder(env, botao(env, "Encerrar e avisar"), true);
    confere(chamadas(env, "GET crise/crises").length === 1 && texto(env, "crsCriseMsg").includes("já foi encerrada"), "409: relê o painel e mantém o motivo à vista");
    // continuar o aviso
    srv.novaCrise(); env.ev('crsMostrarSecaoAcao("crise")'); await env.ocioso();
    await clicar(env, botao(env, "Continuar o aviso"));
    confere(chamadas(env, "POST crise/continuar-aviso").length === 1, "continuar o aviso agora");
    confere(texto(env, "crsCriseConteudo").includes("100 por hora") && texto(env, "crsCriseConteudo").includes("Li o aviso"), "o painel explica o e-mail aos poucos e mostra a ciência");
    limpo(env, "continuar");
  });

  // revisão independente: abrir, trocar o porta-voz e encerrar avisam a liderança inteira (o celular sai dentro da resposta): a tela espera 40 s, não 25
  cenario("Tempo: os três atos da crise esperam 40 s", async () => {
    const srv = servidor();
    const env = novo(srv);
    srv.S.fatorOk = true;
    await abrirAba(env, "geral");
    digitar(env, "crsMotivo", "Acidente no templo central"); digitar(env, "crsAbreContato", "(91) 3333-4444");
    const preso = env.retem(c => c.chave === "POST crise/abrir");
    env.doc.clicar(botao(env, "Abrir o regime")); await env.responderModal(true); await env.ocioso();
    confere(preso.chegou && env.dispararTemporizador(25000) === 0, "abrir não é interrompido em 25 s");
    confere(env.dispararTemporizador(40000) === 1, "abrir é interrompido só em 40 s");
    await env.ocioso();
    confere(texto(env, "crsCriseMsg").includes("confira se o registro já não aparece"), "e então a mensagem pede para conferir antes de repetir");
  });

  cenario("Manifestações: o porta-voz registra, corrige; o link só se for http(s)", async () => {
    const srv = servidor({ comCrise: true });
    const env = novo(srv);
    await abrirAba(env, "pv");
    await secao(env, "Manifestacoes");
    confere(env.e("crsManifQuem") && env.e("crsManifQuem").value === srv.S.crise.portaVoz.nome, "o campo \"quem falou\" vem com o porta-voz");
    await clicar(env, botao(env, "Registrar"));
    confere(texto(env, "crsManifMsg").includes("data e a hora") && chamadas(env, "POST crise/manifestacao").length === 0, "sem a data: não manda");
    digitar(env, "crsManifData", "2026-10-23T11:30"); escolher(env, "crsManifCanal", "ENTREVISTA");
    digitar(env, "crsManifResumo", "Entrevista à rádio sobre o acidente."); digitar(env, "crsManifAut", "Pr. Presidente"); digitar(env, "crsManifLink", "https://radio.exemplo.com/entrevista");
    await clicar(env, botao(env, "Registrar"));
    const p = ultima(env, "POST crise/manifestacao");
    confere(p && p.corpo.criseId === srv.S.crise.criseId && p.corpo.canal === "ENTREVISTA" && p.corpo.dataHora === "2026-10-23T11:30" && !("corrigeManifestacaoId" in p.corpo), `o corpo da manifestação (${p && JSON.stringify(p.corpo)})`);
    confere(artigos(env, "crsManifConteudo").length === 2 && desc(env, env.e("crsManifConteudo")).some(x => x.localName === "a" && x.getAttribute("href") === "https://radio.exemplo.com/entrevista" && x.getAttribute("rel") === "noopener noreferrer"), "a lista com o link (abre fora, sem referência)");
    limpo(env, "manifestação", [srv.S.manifestacoes[0].resumo]);
    // a correção
    await clicar(env, botao(env, "Corrigir"));
    confere(env.e("crsManifResumo").value.startsWith("Entrevista à rádio"), "corrigir traz o texto para o formulário");
    digitar(env, "crsManifResumo", "Correção: a entrevista foi à TV."); digitar(env, "crsManifData", "2026-10-23T11:30"); digitar(env, "crsManifQuem", "Joana Assessora");
    await clicar(env, botao(env, "Registrar"));
    confere(ultima(env, "POST crise/manifestacao").corpo.corrigeManifestacaoId === srv.S.manifestacoes[0].manifestacaoId && texto(env, "crsManifConteudo").includes("CORRIGIDA por um registro mais novo"), "a correção aponta a original, que aparece riscada");
    // um link perigoso que viesse do servidor nunca vira href javascript:
    srv.S.manifestacoes.push(Object.assign({}, srv.S.manifestacoes[0], { manifestacaoId: 999, link: "javascript:window.__xss('link')" }));
    env.ev('crsMostrarSecaoAcao("manifestacoes")'); await env.ocioso();
    confere(!desc(env, env.e("crsManifConteudo")).some(x => x.localName === "a" && /javascript:/i.test(x.getAttribute("href") || "")), "link javascript: do servidor não vira link");
    limpo(env, "manifestação corrigida");
    // o líder comum não registra (a pílula nem aparece; a ação direta não abre)
    const env2 = novo(srv); await abrirAba(env2, "lider");
    env2.ev('crsMostrarSecaoAcao("manifestacoes")'); await env2.ocioso();
    confere(!visivel(env2, "crsSecaoManifestacoes"), "o líder sem papel não abre as manifestações");
  });

  cenario("Imprensa: registrar, corrigir o próprio, responder e recusar com a resposta anterior", async () => {
    const srv = servidor({ comCrise: true });
    const env = novo(srv);
    await abrirAba(env, "lider");
    confere(visivel(env, "crsSecaoImprensa") && texto(env, "crsImprensaForm").includes("não comente o assunto"), "com crise: o aviso de não comentar");
    digitar(env, "crsDemVeiculo", "Rádio Clube"); digitar(env, "crsDemContato", "(91) 98888-7777"); digitar(env, "crsDemPedido", "Quer entrevista sobre o acidente."); digitar(env, "crsDemPrazo", "2026-10-23T18:00");
    await clicar(env, botao(env, "Registrar e encaminhar"));
    confere(JSON.stringify(ultima(env, "POST crise/demanda").corpo) === JSON.stringify({ veiculo: "Rádio Clube", contato: "(91) 98888-7777", pedido: "Quer entrevista sobre o acidente.", prazo: "2026-10-23T18:00" }), "o corpo do pedido");
    confere(artigos(env, "crsImprensaLista").length === 1 && !botao(env, "Responder") && !desc(env, env.e("crsImprensaLista")).some(x => x.localName === "summary" && x.textContent.includes("Responder")), "o líder vê o próprio pedido, sem responder");
    limpo(env, "pedido", [srv.S.demandas[0].pedido]);
    await clicar(env, botao(env, "Corrigir o meu registro"));
    digitar(env, "crsDemVeiculo", "Rádio Clube AM");
    await clicar(env, botao(env, "Registrar e encaminhar"));
    confere(ultima(env, "POST crise/demanda").corpo.corrigeDemandaId === srv.S.demandas[0].demandaId && texto(env, "crsImprensaLista").includes("CORRIGIDO"), "a correção aponta o original");
    // 422 do servidor: o motivo à vista
    digitar(env, "crsDemVeiculo", "R"); await clicar(env, botao(env, "Registrar e encaminhar"));
    confere(texto(env, "crsImprensaMsg").includes("veículo"), "422: o motivo do servidor à vista");
    // o porta-voz responde e depois corrige como recusa
    const pv = novo(srv); await abrirAba(pv, "pv"); await secao(pv, "Imprensa");
    const nova = srv.S.demandas[1].demandaId;
    digitar(pv, `crsRespTexto${nova}`, "Nota enviada ao repórter.");
    await clicar(pv, botao(pv, "Registrar a resposta"));
    const r1 = ultima(pv, "POST crise/responder");
    confere(r1 && JSON.stringify(r1.corpo) === JSON.stringify({ demandaId: nova, situacao: "RESPONDIDA", resposta: "Nota enviada ao repórter." }), `responder: sem resposta anterior (${r1 && JSON.stringify(r1.corpo)})`);
    marcar(pv, `crsResp${nova}Nao`); digitar(pv, `crsRespTexto${nova}`, "Corrigindo: recusada.");
    await clicar(pv, botao(pv, "Registrar a resposta"));
    const r2 = ultima(pv, "POST crise/responder");
    confere(r2.corpo.situacao === "RECUSADA" && r2.corpo.substituiRespostaId === srv.S.demandas[1].respostas[0].respostaId, "corrigir a resposta manda a recusa e a resposta que ela substitui");
    limpo(pv, "resposta", [srv.S.demandas[1].respostas[1].resposta]);
    // 409: outro respondeu enquanto isso — relê
    srv.S.demandas[1].respostas.push({ respostaId: 4999, situacao: "RESPONDIDA", resposta: "Outro respondeu", em: new Date(AGORA).toISOString(), por: "X", substitui: null });
    digitar(pv, `crsRespTexto${nova}`, "Mais uma resposta."); pv.limparRegistro();
    await clicar(pv, botao(pv, "Registrar a resposta"));
    confere(chamadas(pv, "GET crise/demandas").length === 1 && texto(pv, "crsImprensaMsg").includes("respondido enquanto isso"), "409: relê a lista e mantém o motivo");
  });

  cenario("Segurança: painel, congregação, plano, simulado, vistoria, pendência, anular, equipe", async () => {
    const srv = servidor();
    const env = novo(srv);
    await abrirAba(env, "dir");
    confere(visivel(env, "crsSecaoSeguranca") && artigos(env, "crsSegPainel").length === 1, "o Dirigente vê só a congregação dele");
    confere(texto(env, "crsSegPainel").includes("Sem plano de emergência") && texto(env, "crsSegPainel").includes("AVCB vencido"), "o painel mostra os alertas");
    limpo(env, "painel");
    await clicar(env, botao(env, "Abrir", env.e("crsSegPainel")));
    confere(env.e("crsPlanoRotas") && texto(env, "crsSegDetalhe").includes("AVCB ❌ VENCIDO"), "a congregação abre com o plano, o AVCB e o seguro");
    const tels = desc(env, env.e("crsSegDetalhe")).filter(x => x.localName === "a" && /^tel:/.test(x.getAttribute("href") || "")).map(x => x.getAttribute("href"));
    confere(JSON.stringify(tels) === JSON.stringify(["tel:193", "tel:192", "tel:190", "tel:199"]), `os telefones de emergência (só 3 dígitos viram link): ${tels}`);
    limpo(env, "congregação");
    // plano: versão 0 → 1
    digitar(env, "crsPlanoRotas", "Porta principal e porta lateral."); digitar(env, "crsPlanoPontos", "Praça em frente."); digitar(env, "crsPlanoResp", "Diác. João");
    await clicar(env, botao(env, "Registrar o plano"));
    const pl = ultima(env, "POST crise/plano");
    confere(pl && pl.corpo.versaoAtual === 0 && pl.corpo.congregacaoId === 1 && pl.corpo.rotasEvacuacao === "Porta principal e porta lateral.", `o plano vai com a versão lida (${pl && JSON.stringify(pl.corpo)})`);
    confere(env.e("crsPlanoRotas").value.startsWith("Porta principal") && botao(env, "Salvar a revisão"), "relido: o plano atual no formulário e o botão de revisão");
    await clicar(env, botao(env, "Salvar a revisão"));
    confere(ultima(env, "POST crise/plano").corpo.versaoAtual === 1, "a revisão vai com a versão 1");
    // 409: outra pessoa salvou
    srv.S.planos[1].push(Object.assign({}, srv.S.planos[1][1], { versao: 3 }));
    env.limparRegistro();
    await clicar(env, botao(env, "Salvar a revisão"));
    confere(texto(env, "crsSegMsg").includes("Outra pessoa salvou") && chamadas(env, "GET crise/seguranca").length === 1, "409: o motivo e a releitura");
    // simulado (números inteiros, não texto)
    digitar(env, "crsSimData", "2026-10-20"); escolher(env, "crsSimTipo", "INCENDIO"); digitar(env, "crsSimPart", "85"); digitar(env, "crsSimDur", "12"); digitar(env, "crsSimBem", "Saída rápida.");
    await clicar(env, botao(env, "Registrar o simulado"));
    const sim = ultima(env, "POST crise/simulado");
    confere(sim && sim.corpo.participantes === 85 && sim.corpo.duracaoMinutos === 12 && sim.corpo.tipo === "INCENDIO", `o simulado vai com números inteiros (${sim && JSON.stringify(sim.corpo)})`);
    digitar(env, "crsSimData", "2026-10-21"); digitar(env, "crsSimPart", "8,5");
    await clicar(env, botao(env, "Registrar o simulado"));
    confere(texto(env, "crsSegMsg").includes("Participantes"), "número com vírgula: o servidor recusa e o motivo aparece");
    // anular o simulado
    const idSim = srv.S.simulados[0].simuladoId;
    digitar(env, `crsAnular_simulado_${idSim}`, "Data errada.");
    await clicarEResponder(env, botao(env, "Anular", env.e("crsSegDetalhe")), true);
    confere(JSON.stringify(ultima(env, "POST crise/anular-simulado").corpo) === JSON.stringify({ simuladoId: idSim, motivo: "Data errada." }) && texto(env, "crsSegDetalhe").includes("ANULADO"), "anular com o motivo");
    // vistoria: o checklist inteiro, a pendência só no item pendente
    digitar(env, "crsVisData", "2026-10-22");
    marcar(env, "crsVis_EXTINTORES_PENDENTE"); digitar(env, "crsVisPend_EXTINTORES", "Dois vencidos.");
    marcar(env, "crsVis_GAS_NAO_SE_APLICA"); digitar(env, "crsVisPend_SAIDAS", "não deve ir");
    await clicar(env, botao(env, "Registrar a vistoria"));
    const vis = ultima(env, "POST crise/vistoria");
    const itens = vis ? vis.corpo.itens : [];
    confere(itens.length === Object.keys(cs.ITENS_VISTORIA).length && itens.find(i => i.item === "EXTINTORES").pendencia === "Dois vencidos." && itens.find(i => i.item === "GAS").resultado === "NAO_SE_APLICA"
      && !("pendencia" in itens.find(i => i.item === "SAIDAS")) && itens.every(i => /^[A-Z_]+$/.test(i.item)), `a vistoria: todos os itens do catálogo verdadeiro, a pendência só no pendente (${JSON.stringify(itens).slice(0, 200)})`);
    confere(texto(env, "crsSegDetalhe").includes("Dois vencidos."), "a pendência aparece");
    const idItem = srv.S.vistorias[0].itens.find(i => i.item === "EXTINTORES").vistoriaItemId;
    digitar(env, `crsResolve${idItem}`, "Recarregados.");
    await clicar(env, botao(env, "Resolvida", env.e("crsSegDetalhe")));
    confere(JSON.stringify(ultima(env, "POST crise/resolver-pendencia").corpo) === JSON.stringify({ vistoriaItemId: idItem, como: "Recarregados." }) && texto(env, "crsSegDetalhe").includes("resolvida em"), "resolver a pendência");
    limpo(env, "vistoria", [srv.S.vistorias[0].itens[0].comoResolvida]);
    // equipe: procurar, escolher, incluir, registrar a saída
    await clicar(env, botao(env, "Procurar"));
    confere(texto(env, "crsSegMsg").includes("2 letras") && chamadas(env, "POST crise/buscar-membros").length === 0, "procurar sem texto: avisa");
    digitar(env, "crsEqBusca", "Ana"); await clicar(env, botao(env, "Procurar"));
    confere(env.e("crsEqMembro").options.length === 2, "a busca preenche a lista de pessoas");
    escolher(env, "crsEqMembro", "501"); escolher(env, "crsEqFuncao", "BRIGADA"); digitar(env, "crsEqDesde", "2026-10-01");
    await clicar(env, botao(env, "Incluir na equipe"));
    confere(JSON.stringify(ultima(env, "POST crise/equipe").corpo) === JSON.stringify({ congregacaoId: 1, membroId: 501, funcao: "BRIGADA", desde: "2026-10-01", ate: "" }) && texto(env, "crsSegDetalhe").includes("Ana Brigadista"), "incluir na equipe");
    await clicarEResponder(env, botao(env, "Registrar a saída"), true);
    confere(chamadas(env, "POST crise/sair-equipe").length === 1 && texto(env, "crsSegDetalhe").includes("fora da equipe"), "registrar a saída");
    limpo(env, "equipe");
    // o geral vê as duas congregações
    const env2 = novo(srv); await abrirAba(env2, "geral"); await secao(env2, "Seguranca");
    confere(artigos(env2, "crsSegPainel").length === 2, "o nível geral vê todas");
  });

  cenario("Respostas atrasadas, prazo, rede caída, 401 e Meus Dados", async () => {
    // a seção trocada antes da resposta chegar não é pintada por cima (sem crise ativa: a lista é a ÚNICA leitura antes de pintar)
    const srv0 = servidor();
    const env0 = novo(srv0);
    entrar(env0, "geral");
    const r = env0.retem(c => c.chave === "GET crise/crises");
    env0.ev('mostrarAbaSecretaria("crise")'); await env0.ocioso();
    await secao(env0, "Imprensa");
    r.liberar(); await env0.ocioso();
    confere(texto(env0, "crsCriseConteudo") === "" && visivel(env0, "crsSecaoImprensa"), "a resposta atrasada da Crise não pinta a tela depois da troca");
    const srv = servidor({ comCrise: true });
    const env = novo(srv);
    entrar(env, "geral");
    env.ev('mostrarAbaSecretaria("crise")'); await env.ocioso();
    await secao(env, "Imprensa");
    // sair da aba fecha o conteúdo
    env.ev('mostrarAbaSecretaria("meupainel")'); await env.ocioso();
    confere(texto(env, "crsImprensaLista") === "" && texto(env, "crsImprensaForm") === "", "sair da aba apaga o que estava aberto (pedidos da imprensa)");
    // prazo: o pedido que não volta é interrompido com a mensagem
    env.ev('mostrarAbaSecretaria("crise")'); await env.ocioso();
    const preso = env.retem(c => c.chave === "POST crise/demanda");
    digitar(env, "crsDemVeiculo", "TV"); digitar(env, "crsDemContato", "(91) 90000-0000"); digitar(env, "crsDemPedido", "Pedido de entrevista.");
    env.doc.clicar(botao(env, "Registrar e encaminhar")); await env.ocioso();
    confere(preso.chegou && env.dispararTemporizador(25000) >= 1, "o pedido tem prazo de 25 s");
    await env.ocioso();
    confere(texto(env, "crsImprensaMsg").includes("confira se o registro já não aparece"), "prazo esgotado: a mensagem pede para conferir antes de repetir");
    // rede caída
    env.api.redeCaida = true;
    await clicar(env, botao(env, "Registrar e encaminhar"));
    confere(texto(env, "crsImprensaMsg").includes("Não foi possível falar com o servidor"), "rede caída: a mensagem");
    env.api.redeCaida = false;
    // Meus Dados: o cartão escapa tudo
    const html = env.g(`crsCartaoMeusDados({ equipeSeguranca: [{ funcao: ${JSON.stringify(ATAQUE("funcaoMeus"))}, congregacao: ${JSON.stringify(ATAQUE("congMeus"))}, desde: "2026-01-01", ate: null }],
      portaVozEmCrises: [{ criseId: 1, abertaEm: "2026-10-01T10:00:00Z" }], registrosNaCrise: { pedidosDeImprensa: 2, manifestacoes: 0, respostas: 1 } })`);
    env.e("crsSegDetalhe").innerHTML = html; await env.ocioso();
    confere(texto(env, "crsSegDetalhe").includes("Equipe de segurança") && texto(env, "crsSegDetalhe").includes("2 pedido(s) da imprensa"), "Meus Dados: a equipe, o porta-voz e os registros");
    confere(env.g("crsCartaoMeusDados({ equipeSeguranca: [], portaVozEmCrises: [], registrosNaCrise: {} })") === "" && env.g("crsCartaoMeusDados(null)") === "", "sem nada, sem cartão");
    limpo(env, "atrasos e Meus Dados");
  });

  cenario("O servidor imitado não teve erro nem ação desconhecida em nenhum cenário", async () => {
    for (const s of SERVIDORES) confere(s.S.erros.length === 0, `erro no servidor imitado (cenário "${s.cenario}"): ${s.S.erros.slice(0, 2).join(" | ").slice(0, 300)}`);
    confere(SERVIDORES.length >= 6, `servidores criados: ${SERVIDORES.length}`);
  });

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
