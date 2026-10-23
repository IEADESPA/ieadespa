// roteiro.js — a tela da v7.14 (Identidade Visual) contra o front de verdade, em DOM simulado, com o SERVIDOR imitado de fixtures.js (as formas do identidadeVisualDb.js, as
// regras de verdade do identidadeVisual.js e as listas de ações e o 428 lidos do handler) e texto de ataque (<img src=x onerror=...>) em TODO texto que vem dele. Cobre:
// Meu Painel → Identidade Visual em cada etapa (sem ciclo, aguardando, sugestões, triagem, votação, arte, encerrado; quem não é apto), Meu Painel → Votações (enquetes.js),
// a aba da Diretoria (sem acesso, falha ao abrir, abrir e cancelar o ciclo, pílulas dos ciclos, triagem com o 428, abrir a votação, desempate, cores, artes, resultado e Temas
// já usados), o "Fecha sozinha em" do formulário de enquete, a troca de login e a saída da aba e da sub-aba, respostas atrasadas, o prazo de 20 s, 401 e 403, duplo clique,
// console e armazenamento.
"use strict";
const { criarAmbiente, lerApp, arquivo } = require("./ambiente");
const F = require("./fixtures");
const { ATAQUE, URL_IMAGEM } = F;
const iv = require("../../api/shared/identidadeVisual");

async function rodar({ mutar = {}, so = null } = {}) {
  const T = { total: 0, falhas: [], cenarioAtual: "" };
  const confere = (cond, msg) => { T.total++; if (!cond) T.falhas.push(`${T.cenarioAtual}: ${msg}`); };
  const cenarios = [];
  const cenario = (nome, fn) => cenarios.push({ nome, fn });
  const AGORA = Date.parse("2026-10-23T15:00:00Z");
  const novo = (srv, opcoes) => criarAmbiente(Object.assign({ mutar, agora: srv ? srv.agora().toISOString() : new Date(AGORA).toISOString(), servidor: srv ? srv.servidor : null }, opcoes || {}));
  const SERVIDORES = [];
  const servidor = (op) => { const s = F.criarServidor(op || {}); s.cenario = T.cenarioAtual; SERVIDORES.push(s); return s; };
  // a imagem de verdade (o endereço do Storage ou o "#" da urlSegura) é a única tag <img> permitida; todo o resto que virou marcação é o ataque
  const imagemPermitida = (x) => x.tag === "img" && x.atributo === "(tag)" && (x.valor === "#" || x.valor.startsWith("https://armazenamento.exemplo/"));
  const ataques = (env) => env.doc._ataques.filter(x => !imagemPermitida(x));
  // nada pode ter executado nem ter virado marcação: zero ataque no DOM, zero chamada de __xss e nenhum HTML malformado; o console fica limpo
  const limpo = (env, qual, textos = []) => {
    confere(ataques(env).length === 0, `${qual}: o texto de ataque virou marcação/atributo de evento (${JSON.stringify(ataques(env).slice(0, 2))})`);
    confere(env.ctx.__xss.chamadas.length === 0, `${qual}: código do ataque EXECUTOU (${env.ctx.__xss.chamadas.slice(0, 4).join(",")})`);
    const corpo = env.doc.body.textContent;
    for (const t of textos) confere(corpo.includes(t), `${qual}: o texto do servidor "${t.slice(0, 60)}" não apareceu na tela como texto`);
    confere(env.doc._erros.length === 0, `${qual}: HTML malformado gerado (${env.doc._erros.slice(0, 2).join("; ")})`);
    confere(env.consoleDaTela.length === 0, `${qual}: o console da tela devia ficar limpo (${JSON.stringify(env.consoleDaTela.slice(0, 2)).slice(0, 300)})`);
    confere(!env.gravacoes.some(x => /identidade|idv|enq|sugest|Raízes|Frutos|Ana|voto/i.test(x.chave + x.valor)), `${qual}: nada da identidade visual no armazenamento do navegador`);
  };
  const desc = (env, raiz) => [...(raiz || env.doc.body).descendentes()];
  const escondido = (el) => { for (let p = el; p && p.nodeType === 1; p = p.parentNode) if (p.style && p.style.display === "none" && !["telaPainel", "cxPainelConteudo"].includes(p.id)) return true; return false; };
  const REGIOES = ["abaIdentidade", "subMeupainelIdentidade", "subMeupainelVotacoes", "modalCaixa"];
  const botao = (env, texto, raiz) => {
    const raizes = raiz ? [raiz] : REGIOES.map(id => env.e(id)).filter(Boolean);
    for (const r of raizes) { const b = desc(env, r).find(x => x.localName === "button" && x.textContent.includes(texto) && !escondido(x)); if (b) return b; }
    return null;
  };
  const botoes = (env, texto, raiz) => desc(env, raiz).filter(x => x.localName === "button" && x.textContent.includes(texto));
  const chamadas = (env, chave) => env.api.chamadas.filter(c => c.chave === chave);
  const ultima = (env, chave) => { const l = chamadas(env, chave); return l[l.length - 1] || null; };
  const posts = (env) => env.api.chamadas.filter(c => c.metodo === "POST");
  const texto = (env, id) => (env.e(id) ? env.e(id).textContent : "");
  const visivel = (env, id) => !!env.e(id) && env.e(id).style.display !== "none";
  const clicar = async (env, el) => { env.doc.clicar(el); await env.ocioso(); };
  const clicarEResponder = async (env, el, confirmar) => { env.doc.clicar(el); const m = await env.responderModal(confirmar); await env.ocioso(); return m; };
  const digitar = (env, id, v) => { const el = env.e(id); if (el) env.doc.digitar(el, v); return !!el; };
  const escolher = (env, id, v) => { const el = env.e(id); if (el) env.doc.escolher(el, v); return !!el; };
  const marcar = (env, id, v = true) => { const el = env.e(id); if (el) env.doc.marcar(el, v); return !!el; };
  const liCom = (env, id, t) => desc(env, env.e(id)).find(x => x.localName === "li" && x.textContent.includes(t) && !(x.parentNode && x.parentNode.className === "idv-linha")) || null;
  const linhaDoTempo = (env, id) => desc(env, env.e(id)).filter(x => x.localName === "li" && x.parentNode && x.parentNode.className === "idv-linha");
  const abrirMeu = async (env, token = "pin", matricula = 31, sub = "identidade") => {
    env.sessao({ matricula, token, pin: true });
    env.ev('mostrarAbaSecretaria("meupainel")');
    env.ev(`mostrarSubAbaMeupainel(${JSON.stringify(sub)})`);
    await env.ocioso();
  };
  const abrirAba = async (env, token = "geral", matricula = 13, extra = {}) => {
    env.sessao(Object.assign({ matricula, token }, extra));
    env.ev('mostrarAbaSecretaria("identidade")');
    await env.ocioso();
  };
  const msgs = (env) => ({ tempo: env.g("IDV_MSG_TEMPO"), rede: env.g("IDV_MSG_REDE"), fator: env.g("IDV_MSG_FATOR") });
  const meuMsg = (env) => texto(env, "idvMeuMsg");
  const cicloMsg = (env) => texto(env, "idvCicloMsg");
  // os textos de pessoas que não podem sobrar na página depois de sair
  const SENSIVEIS = ["[sugAna]","Frutos que permanecem", "Luz do mundo", "Fé que vence", "Caminhando juntos", "Ana Sugestora", "Bento Artista", "Carla Membro", "Dia do culto", "Minha arte"];
  const semSensiveis = (env, qual) => {
    const corpo = env.doc.body.textContent;
    const sobrou = SENSIVEIS.filter(t => corpo.includes(t));
    confere(sobrou.length === 0, `${qual}: sobrou na página: ${sobrou.join(", ")}`);
  };

  // ============================================================================================================================================
  // 0) O CONTRATO: o HTML, o módulo, a navegação e o servidor falam dos mesmos nomes
  // ============================================================================================================================================
  cenario("Contrato: ids, registro, navegação, casca e servidor", async () => {
    const html = lerApp("index.html");
    const modulo = lerApp("modulos/identidade-visual.js");
    const enq = lerApp("modulos/enquetes.js");
    const idsDoHtml = new Set([...html.matchAll(/\bid="([^"$]+)"/g)].map(m => m[1]));
    const idsDoModulo = new Set([...modulo.matchAll(/\bid="(idv[A-Za-z0-9]+)/g)].map(m => m[1]));
    const referidos = [...new Set([...modulo.matchAll(/idv(?:El|Escrever|Mostrar|Valor)\("([A-Za-z0-9_]+)"/g)].map(m => m[1]))];
    const semDono = referidos.filter(id => !idsDoHtml.has(id) && !idsDoModulo.has(id));
    confere(referidos.length > 25 && semDono.length === 0, `ids que o módulo usa e nenhum HTML nem template cria: ${semDono.join(", ")} (${referidos.length})`);
    for (const id of ["enqMeuLista", "enqMeuMsg", "subMeupainelVotacoes", "btnSubMeupainelVotacoes", "subMeupainelIdentidade", "btnSubMeupainelIdentidade", "abaIdentidade", "btnAbaIdentidade",
      "enqueteFechamento", "idvPilulas", "btnIdvSecaoCiclo", "btnIdvSecaoTemas", "idvSecaoCiclo", "idvSecaoTemas", "idvSemAcesso", "idvConteudo"]) confere(idsDoHtml.has(id), `falta o id ${id} no index.html`);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i && /^(idv|enqMeu)|Identidade|Votacoes/.test(id));
    confere(repetidos.length === 0, `ids repetidos no index.html: ${[...new Set(repetidos)].join(", ")}`);
    // toda ação do HTML e dos templates está registrada; toda registrada existe
    const registradas = (/registrarAcoes\(\{([\s\S]*?)\}\);/.exec(modulo) || ["", ""])[1].split(",").map(s => s.trim()).filter(Boolean);
    const pedidas = new Set([...modulo.matchAll(/data-on-(?:click|change|input)="(idv[A-Za-z]+)"/g), ...html.matchAll(/data-on-(?:click|change|input)="(idv[A-Za-z]+)"/g)].map(m => m[1]));
    const naoRegistradas = [...pedidas].filter(n => !registradas.includes(n));
    confere(pedidas.size >= 18 && naoRegistradas.length === 0, `ações pedidas no HTML e não registradas: ${naoRegistradas.join(", ")} (${pedidas.size})`);
    confere(registradas.every(n => new RegExp(`(async )?function ${n}\\(`).test(modulo)), "toda ação registrada é função do módulo");
    const regEnq = (/registrarAcoes\(\{([\s\S]*?)\}\);/.exec(enq) || ["", ""])[1];
    confere(/enqCarregarMeuPainelAcao/.test(regEnq) && /enqVotarMeuPainelAcao/.test(regEnq) && /data-on-click="enqCarregarMeuPainelAcao"/.test(html) && /data-on-click="enqVotarMeuPainelAcao"/.test(enq), "as ações de Meu Painel → Votações registradas e usadas");
    const faltam = F.contratoComOServidor();
    confere(faltam.length === 0, `contrato com o servidor: ${faltam.join(" | ")}`);
    const env = novo(null);
    confere(env.errosDaPagina.length === 0, `index.html com estrutura quebrada: ${env.errosDaPagina.slice(0, 2).join("; ")}`);
    confere(env.e("abaIdentidade").className.includes("aba-secretaria"), "a aba abaIdentidade é aba-secretaria");
    confere(env.g("NOMES_ABAS").includes("identidade") && JSON.stringify(env.g("ABA_PERMISSOES_ALT").identidade) === '["identidade_visual"]' && env.g("ABAS_SO_DO_GERAL").has("identidade"), "NOMES_ABAS/ABA_PERMISSOES_ALT/ABAS_SO_DO_GERAL com identidade");
    confere(env.g("MODULOS").eclesiastica.abas.includes("identidade") && desc(env, env.e("grupoModuloEclesiastica") || env.doc.body).some(x => x.id === "btnAbaIdentidade"), "a aba Identidade Visual está no módulo Vida Eclesiástica");
    confere(env.g("SUB_ABAS_MEUPAINEL").includes("identidade") && env.g("SUB_ABAS_MEUPAINEL").includes("votacoes") && !!env.g("TITULOS_SUB_MEUPAINEL").identidade && !!env.g("TITULOS_SUB_MEUPAINEL").votacoes, "SUB_ABAS_MEUPAINEL/TITULOS com identidade e votacoes");
    confere(!!env.g("AJUDA_POR_ABA").identidade && !!env.g("AJUDA_POR_ABA")["meupainel:identidade"] && !!env.g("AJUDA_POR_ABA")["meupainel:votacoes"] && env.g("TITULOS_MODULOS").identidade === "Identidade Visual", "AJUDA_POR_ABA/TITULOS_MODULOS com identidade");
    const script = lerApp("script.js"), meusDados = lerApp("modulos/meus-dados.js");
    confere(/if \(typeof idvLimparTela === "function"\) idvLimparTela\(\);/.test(script) && /if \(typeof enqLimparMeu === "function"\) enqLimparMeu\(\);/.test(script), "limparSessao com as chamadas protegidas de idvLimparTela e enqLimparMeu");
    confere(/typeof idvSubAbaMudou === "function"\) idvSubAbaMudou\(sub\)/.test(script) && /typeof enqSubAbaMudou === "function"\) enqSubAbaMudou\(sub\)/.test(script), "mostrarSubAbaMeupainel com os ganchos de saída");
    confere(/sub === "identidade" && typeof idvCarregarMeuPainelAcao === "function"/.test(script) && /sub === "votacoes" && typeof enqCarregarMeuPainelAcao === "function"/.test(script), "mostrarSubAbaMeupainel com os carregadores");
    confere(/typeof idvAbaMudou === "function"\) idvAbaMudou\(aba\)/.test(meusDados) && /aba === "identidade" && typeof idvAbrirAba === "function"/.test(meusDados), "mostrarAbaSecretaria com o gancho e o carregador");
    confere(/typeof idvAbaMudou === "function"\) idvAbaMudou\("portaria"\)/.test(script), "voltar para a Portaria também limpa a tela");
    const scripts = [...html.matchAll(/<script src="modulos\/([^"]+)"/g)].map(m => m[1]);
    confere(scripts.includes("identidade-visual.js") && JSON.stringify(scripts) === JSON.stringify([...scripts].sort()), "o index.html devia carregar modulos/identidade-visual.js em ordem alfabética");
    confere(lerApp("service-worker.js").includes('"/modulos/identidade-visual.js"'), "o service worker devia ter /modulos/identidade-visual.js na casca");
    const nomes = [...modulo.matchAll(/^(?:async function|function|const|let) ([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    confere(nomes.length > 60 && nomes.every(n => /^(idv|IDV_)/.test(n)), `nomes de nível superior sem o prefixo idv: ${nomes.filter(n => !/^(idv|IDV_)/.test(n)).join(", ")}`);
    const parteEnq = enq.slice(enq.indexOf("MEU PAINEL → VOTAÇÕES (v7.14)"));
    const nomesEnq = [...parteEnq.matchAll(/^(?:async function|function|const|let) ([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    confere(nomesEnq.length >= 8 && nomesEnq.every(n => /^(enq|ENQ_)/.test(n)), `nomes da parte v7.14 do enquetes.js sem o prefixo enq: ${nomesEnq.filter(n => !/^(enq|ENQ_)/.test(n)).join(", ")}`);
    for (const [nome, codigoBruto] of [["identidade-visual.js", modulo], ["enquetes.js (v7.14)", parteEnq]]) {
      const codigo = codigoBruto.split("\n").map(l => l.replace(/(^|\s)\/\/.*$/, "")).join("\n");
      confere(!/localStorage|sessionStorage/.test(codigo), `${nome} usa localStorage/sessionStorage`);
      confere(!/console\./.test(codigo), `${nome} escreve no console`);
      confere(!/\bon[a-z]+=/.test(codigo.replace(/data-on-[a-z]+=/g, "")), `${nome}: nenhum atributo de evento escrito no HTML (CSP)`);
      confere(!/javascript:/i.test(codigo) && !/\beval\(|new Function\(/.test(codigo), `${nome}: nada de javascript:, eval ou new Function`);
    }
    // o CSS da v7.14: sem largura fixa grande (nada rola de lado a 390 px)
    const css = lerApp("style.css");
    const bloco = css.slice(css.indexOf("/* v7.14"));
    confere(bloco.length > 200 && /\.idv-amostra/.test(bloco) && !/width: (\d{4,}|[4-9]\d\d)px/.test(bloco.replace(/max-width: 640px/g, "")),"o bloco v7.14 do style.css existe e não tem largura fixa grande");
    confere(/min-height: 44px/.test(bloco), "alvos de toque de 44 px no bloco v7.14");
    // sem o módulo (cache velho) a navegação e a saída seguem
    const semMod = novo(null, { semModulo: true });
    semMod.sessao({ matricula: 13, token: "geral" });
    let quebrou = null;
    try { semMod.ev('mostrarAbaSecretaria("identidade")'); semMod.ev('mostrarAbaSecretaria("meupainel")'); semMod.ev('mostrarSubAbaMeupainel("identidade")'); semMod.ev('mostrarSubAbaMeupainel("votacoes")'); semMod.ev("limparSessao()"); } catch (e) { quebrou = e; }
    confere(!quebrou, `sem o módulo (cache velho) a navegação e a saída seguem: ${quebrou}`);
  });

  // ============================================================================================================================================
  // 1) MEU PAINEL → IDENTIDADE VISUAL, etapa por etapa
  // ============================================================================================================================================
  cenario("Meu Painel: sem ciclo aberto (o ano que vem e a identidade vigente, nenhuma etapa)", async () => {
    const srv = servidor({ comCiclo: false, hoje: "2026-10-23" });
    srv.novoTema({ ano: 2026, tema: srv.A("temaVigente", "Firmes na rocha") });
    const env = novo(srv);
    await abrirMeu(env);
    const c = chamadas(env, "GET identidade-visual/meu");
    confere(c.length === 1 && c[0].comToken && c[0].comPrazo && !c[0].corpoBruto, `GET meu uma vez, com o token e o prazo de 20 s (${c.length})`);
    confere(chamadas(env, "GET identidade-visual/catalogos").length === 0, "Meu Painel não pede o catálogo da Diretoria");
    const t = texto(env, "idvMeuConteudo");
    confere(t.includes(`Identidade visual de 2026: Firmes na rocha ${ATAQUE("temaVigente")}`), "a identidade vigente, como texto");
    confere(t.includes("O processo de escolha da identidade visual de 2027 ainda não foi aberto") && t.includes("01/11/2026") && t.includes("15/11/2026"), `o ano que vem e as datas das sugestões: ${t.slice(0, 300)}`);
    confere(linhaDoTempo(env, "idvMeuConteudo").length === 0 && !env.e("idvSugestaoTexto") && !t.includes("Sugestões de temas"), "sem ciclo: nenhuma etapa, nenhuma linha do tempo, nenhum formulário");
    confere(meuMsg(env) === "", "nenhuma mensagem");
    limpo(env, "sem ciclo", [ATAQUE("temaVigente")]);
    // sem identidade vigente também
    const srv2 = servidor({ comCiclo: false, hoje: "2026-10-23" });
    const env2 = novo(srv2);
    await abrirMeu(env2);
    confere(!texto(env2, "idvMeuConteudo").includes("Identidade visual de 2026") && texto(env2, "idvMeuConteudo").includes("ainda não foi aberto"), "sem identidade vigente: só o aviso");
  });

  cenario("Meu Painel: aguardando o início (ciclo aberto antes de 01/11)", async () => {
    const srv = servidor({ hoje: "2026-10-25" });
    const env = novo(srv);
    await abrirMeu(env);
    const t = texto(env, "idvMeuConteudo");
    confere(t.includes("Identidade visual de 2027 — Aguardando o início") && t.includes("As sugestões abrem em 01/11/2026."), `aguardando: o rótulo e a data: ${t.slice(0, 200)}`);
    const li = linhaDoTempo(env, "idvMeuConteudo");
    confere(li.length === 5 && li.every(x => !x.className.includes("idv-atual")), "a linha do tempo com as 5 etapas, nenhuma destacada");
    confere(li[0].textContent.includes("01/11/2026 a 15/11/2026") && li[1].textContent.includes("16/11/2026 a 21/11/2026") && li[2].textContent.includes("22/11/2026 a 30/11/2026") && li[3].textContent.includes("01/12/2026 a 31/12/2026") && li[4].textContent.includes("depois do culto"), "as datas do Art. 159 em cada etapa");
    confere(!env.e("idvSugestaoTexto") && botoes(env, "Retirar", env.e("idvMeuConteudo")).length === 0, "aguardando: nenhum formulário, nenhum Retirar");
    limpo(env, "aguardando");
  });

  cenario("Meu Painel: sugestões — mandar (vazio, 422, 201), limite de 3, retirar, 429, duplo clique", async () => {
    const srv = servidor({ hoje: "2026-11-05" });
    const env = novo(srv);
    await abrirMeu(env);
    const li = linhaDoTempo(env, "idvMeuConteudo");
    confere(li.length === 5 && li[0].className.includes("idv-atual") && li.filter(x => x.className.includes("idv-atual")).length === 1, "a etapa de hoje destacada (sugestões)");
    confere(!!env.e("idvSugestaoTexto") && env.e("idvSugestaoTexto").getAttribute("maxlength") === "80", "o campo da sugestão, até 80 letras");
    const t = texto(env, "idvMeuConteudo");
    confere(t.includes("(até 15/11/2026)") && t.includes("até 3 sugestões") && t.includes("desde 2006"), "as regras escritas: até 3, curto, amplo, original, até o dia 15");
    confere(!!liCom(env, "idvMeuConteudo", ATAQUE("sugAna")) && liCom(env, "idvMeuConteudo", ATAQUE("sugAna")).textContent.includes("Em análise"), "a sugestão com o texto como texto, 'Em análise'");
    confere(!!liCom(env, "idvMeuConteudo", "Caminhando juntos") && liCom(env, "idvMeuConteudo", "Caminhando juntos").textContent.includes("Retirada por você") && botoes(env, "Retirar", liCom(env, "idvMeuConteudo", "Caminhando juntos")).length === 0, "a retirada aparece como retirada, sem botão");
    confere(botoes(env, "Retirar", env.e("idvMeuConteudo")).length === 2, "Retirar só nas 2 enviadas");
    confere(!t.includes("Bento") && !t.includes("Luz do mundo"), "só as sugestões da própria pessoa");
    limpo(env, "sugestões", [ATAQUE("sugAna")]);
    const mandar = () => clicar(env, botao(env, "Mandar sugestão"));
    // vazio (só espaços): recusa na tela
    digitar(env, "idvSugestaoTexto", "   ");
    await mandar();
    confere(chamadas(env, "POST identidade-visual/sugerir").length === 0 && meuMsg(env) === "Escreva o tema antes de mandar.", "vazio: nenhum POST e o aviso");
    // tema já usado: 422 do servidor, a mensagem tal qual, o texto fica no campo
    digitar(env, "idvSugestaoTexto", "Avante igreja");
    await mandar();
    let p = ultima(env, "POST identidade-visual/sugerir");
    confere(!!p && JSON.stringify(p.corpo) === JSON.stringify({ texto: "Avante igreja" }) && p.cabecalhos["content-type"] === "application/json" && p.comToken && p.comPrazo, `POST sugerir {texto}, JSON, token e prazo: ${p && JSON.stringify(p.corpo)}`);
    confere(meuMsg(env).includes("já foi usado pela Igreja em 2020") && meuMsg(env).includes(ATAQUE("msg422")) && env.toasts().some(x => x.includes("já foi usado pela Igreja em 2020")), `422: a mensagem do servidor tal qual: ${meuMsg(env).slice(0, 100)}`);
    confere(env.e("idvSugestaoTexto").value === "Avante igreja" && chamadas(env, "GET identidade-visual/meu").length === 1, "422: o texto fica no campo e não relê");
    // 201: o campo limpa, relê, a mensagem fica; com 3 ativas o formulário some
    digitar(env, "idvSugestaoTexto", "  Colheita abundante  ");
    await mandar();
    p = ultima(env, "POST identidade-visual/sugerir");
    confere(JSON.stringify(p.corpo) === JSON.stringify({ texto: "Colheita abundante" }), `o texto vai sem os espaços das pontas: ${JSON.stringify(p.corpo)}`);
    confere(chamadas(env, "GET identidade-visual/meu").length === 2 && meuMsg(env).includes("Sugestão recebida. Obrigado por participar!"), "201: relê e a mensagem do servidor fica escrita");
    confere(!!liCom(env, "idvMeuConteudo", "Colheita abundante") && !env.e("idvSugestaoTexto") && texto(env, "idvMeuConteudo").includes("Você já mandou 3 sugestões (o máximo)"), "3 ativas: o formulário dá lugar ao aviso do máximo");
    confere(srv.S.sugestoes.filter(s => s.membroId === 31 && s.status !== "RETIRADA").length === 3, "o servidor gravou");
    // retirar: confirmação; cancelar não manda; confirmar manda {sugestaoId}
    const liFrutos = () => liCom(env, "idvMeuConteudo", "Frutos que permanecem");
    let m = await clicarEResponder(env, botoes(env, "Retirar", liFrutos())[0], false);
    confere(m.aberto && m.texto.includes("Retirar esta sugestão?") && chamadas(env, "POST identidade-visual/retirar-sugestao").length === 0, "retirar pede confirmação; cancelar não manda");
    m = await clicarEResponder(env, botoes(env, "Retirar", liFrutos())[0], true);
    p = ultima(env, "POST identidade-visual/retirar-sugestao");
    confere(!!p && JSON.stringify(p.corpo) === JSON.stringify({ sugestaoId: srv.S.S.ana2.sugestaoId }), `POST retirar-sugestao {sugestaoId}: ${p && JSON.stringify(p.corpo)}`);
    confere(liFrutos().textContent.includes("Retirada por você") && !!env.e("idvSugestaoTexto") && meuMsg(env).includes("Sugestão retirada."), "retirada: relê, aparece retirada e o formulário volta");
    // 429: a mensagem, o texto fica
    srv.S.limiteEnvios = true;
    digitar(env, "idvSugestaoTexto", "Mãos que servem");
    await mandar();
    confere(meuMsg(env).includes("Muitos envios seguidos") && env.e("idvSugestaoTexto").value === "Mãos que servem", "429: a mensagem do servidor e o texto continua no campo");
    srv.S.limiteEnvios = false;
    // duplo clique: o botão fica desabilitado; a segunda chamada (mesma chave) é recusada; um POST só
    const antes = chamadas(env, "POST identidade-visual/sugerir").length;
    const r = env.retem(x => x.chave === "POST identidade-visual/sugerir");
    const b = botao(env, "Mandar sugestão");
    env.doc.clicar(b); await env.ocioso();
    confere(b.disabled === true && env.doc.clicar(b) === false, "o botão fica desabilitado enquanto o pedido anda");
    env.ev("idvSugerirAcao(null)"); await env.ocioso();
    confere(env.toasts().some(x => x.includes("Aguarde")), "a segunda chamada é recusada com 'Aguarde'");
    r.liberar(); await env.ocioso();
    confere(chamadas(env, "POST identidade-visual/sugerir").length === antes + 1, `um só POST: ${chamadas(env, "POST identidade-visual/sugerir").length - antes}`);
    // retirar com id inválido: nada sai
    env.ev("idvRetirarSugestaoAcao('abc', null)"); await env.ocioso();
    confere(env.e("modalOverlay").classList.contains("escondido") && chamadas(env, "POST identidade-visual/retirar-sugestao").length === 1, "id inválido: nem confirmação nem pedido");
    // a sugestão de outra pessoa (ou que não existe): o mesmo 404 neutro, escrito
    env.ev(`idvRetirarSugestaoAcao(${srv.S.S.bento.sugestaoId}, null)`); await env.responderModal(true); await env.ocioso();
    confere(chamadas(env, "POST identidade-visual/retirar-sugestao").length === 2 && meuMsg(env).includes("Não encontrado.") && srv.S.S.bento.status === "ENVIADA", "404: 'Não encontrado.' e nada muda");
    limpo(env, "mandar e retirar", [ATAQUE("msg422"), ATAQUE("msg429")]);
  });

  cenario("Meu Painel: quem não é apto não vê formulário nem cédula", async () => {
    const srv = servidor({ hoje: "2026-11-05" });
    const env = novo(srv);
    await abrirMeu(env, "pin2", 32);
    const t = texto(env, "idvMeuConteudo");
    confere(t.includes("Só quem é membro ativo e em comunhão participa da escolha") && !env.e("idvSugestaoTexto") && !botao(env, "Mandar sugestão"), "sugestões: o aviso e nenhum formulário");
    confere(t.includes("Você não mandou sugestão neste ano."), "sem sugestões: a frase certa");
    limpo(env, "não apto");
    // votação aberta: sem cédula
    const srv2 = servidor({ hoje: "2026-11-25" }); srv2.votacaoAberta();
    const env2 = novo(srv2);
    await abrirMeu(env2, "pin2", 32);
    confere(texto(env2, "idvMeuConteudo").includes("A votação está aberta para os membros ativos e em comunhão.") && !desc(env2, env2.e("idvMeuConteudo")).some(x => x.localName === "input" && x.type === "radio") && !botao(env2, "Votar"), "votação: sem cédula e sem botão");
    // arte: sem o envio
    const srv3 = servidor({ hoje: "2026-12-10" }); srv3.votacaoAberta(); srv3.votar(33, srv3.S.S.bento);
    srv3.S.cores.push({ corId: 401, cicloId: 7, ordem: 1, nome: "Azul", hex: "#1A4D8F" });
    const env3 = novo(srv3);
    await abrirMeu(env3, "pin2", 32);
    confere(!env3.e("idvArteArquivo") && !botao(env3, "Mandar a arte") && texto(env3, "idvMeuConteudo").includes("Concurso de arte"), "arte: as cores e as regras, sem o envio");
  });

  cenario("Meu Painel: triagem — 'em análise', sem a decisão antes da votação", async () => {
    const srv = servidor({ hoje: "2026-11-18" });
    srv.triagemFeita();
    const env = novo(srv);
    await abrirMeu(env);
    const t = texto(env, "idvMeuConteudo");
    confere(t.includes("A Diretoria está escolhendo os finalistas (até 21/11/2026). A votação começa em 22/11/2026."), `triagem: o aviso com as datas: ${t.slice(0, 160)}`);
    confere(linhaDoTempo(env, "idvMeuConteudo")[1].className.includes("idv-atual"), "a etapa de hoje destacada (triagem)");
    confere(liCom(env, "idvMeuConteudo", "Frutos que permanecem").textContent.includes("Em análise") && liCom(env, "idvMeuConteudo", ATAQUE("sugAna")).textContent.includes("Em análise") && !t.includes("Finalista") && !t.includes("Não foi à votação"), "antes da votação, toda sugestão aparece 'Em análise' (a decisão não vaza)");
    confere(!env.e("idvSugestaoTexto") && botoes(env, "Retirar", env.e("idvMeuConteudo")).length === 0, "triagem: sem formulário e sem Retirar");
    limpo(env, "triagem", [ATAQUE("sugAna")]);
  });

  cenario("Meu Painel: votação — não abriu, cédula, nada marcado, confirmação, o POST, já votou, recusa, duplo clique, encerrada com a contagem", async () => {
    // a votação não abriu (só 1 finalista)
    const srv0 = servidor({ hoje: "2026-11-25" });
    Object.assign(srv0.S.S.ana2, { status: "FINALISTA" });
    const env0 = novo(srv0);
    await abrirMeu(env0);
    confere(texto(env0, "idvMeuConteudo").includes("A votação ainda não abriu") && !botao(env0, "Votar"), "sem enquete: 'ainda não abriu' e nenhum botão");
    // a cédula
    const srv = servidor({ hoje: "2026-11-25" });
    const e = srv.votacaoAberta();
    const env = novo(srv);
    await abrirMeu(env);
    const radios = desc(env, env.e("idvMeuConteudo")).filter(x => x.localName === "input" && x.type === "radio");
    const ops = e.perguntas[0].opcoes;
    confere(radios.length === 2 && radios.every(x => x.getAttribute("name") === "idvVoto") && radios.map(x => x.id).join() === ops.map(o => `idvVoto_${o.opcaoId}`).join(), `uma opção por finalista (${radios.map(x => x.id).join()})`);
    confere(texto(env, "idvMeuConteudo").includes(`Luz do mundo ${ATAQUE("sugBento")}`) && texto(env, "idvMeuConteudo").includes("Frutos que permanecem para sempre") && texto(env, "idvMeuConteudo").includes("(até 30/11/2026)"), "os finalistas como texto (com a redação ajustada) e o prazo");
    confere(liCom(env, "idvMeuConteudo", "Frutos que permanecem").textContent.includes("Finalista") && liCom(env, "idvMeuConteudo", "Frutos que permanecem").textContent.includes(`Na votação, com a redação ajustada pela Diretoria: "Frutos que permanecem para sempre ${ATAQUE("textoFinal")}"`), "depois que a votação abriu, a pessoa vê a decisão da triagem e a redação ajustada");
    confere(liCom(env, "idvMeuConteudo", ATAQUE("sugAna")).textContent.includes("Não foi à votação"), "a descartada: 'Não foi à votação'");
    limpo(env, "cédula", [ATAQUE("sugBento")]);
    // nada marcado: o aviso, sem confirmação nem pedido
    await clicar(env, botao(env, "Votar"));
    confere(meuMsg(env) === "Escolha um dos temas antes de votar." && env.e("modalOverlay").classList.contains("escondido") && posts(env).length === 0, "nada marcado: o aviso, sem confirmação e sem pedido");
    // marcou: confirmação com o tema (como texto); cancelar não vota
    const luz = ops.find(o => o.texto.startsWith("Luz do mundo"));
    marcar(env, `idvVoto_${luz.opcaoId}`);
    let m = await clicarEResponder(env, botao(env, "Votar"), false);
    confere(m.aberto && m.texto.includes(`Confirmar o voto em "Luz do mundo ${ATAQUE("sugBento")}"?`) && m.texto.includes("não se muda depois") && posts(env).length === 0, `a confirmação diz o tema escolhido; cancelar não vota (${m.texto.slice(0, 80)})`);
    limpo(env, "confirmação do voto");
    m = await clicarEResponder(env, botao(env, "Votar"), true);
    const v = chamadas(env, `POST enquetes/${e.enqueteId}/votar`);
    confere(v.length === 1 && JSON.stringify(v[0].corpo) === JSON.stringify({ respostas: [{ perguntaId: e.perguntas[0].perguntaId, opcaoId: luz.opcaoId }] }) && v[0].comToken && v[0].comPrazo, `POST votar {respostas:[{perguntaId, opcaoId}]} só da marcada: ${v[0] && JSON.stringify(v[0].corpo)}`);
    confere(e.respostas.length === 1 && e.respostas[0].membroId === 31 && e.respostas[0].opcaoId === luz.opcaoId, "o servidor gravou o voto da pessoa da sessão");
    confere(meuMsg(env) === "Voto registrado. Obrigado por participar!" && env.toasts().includes("Voto registrado. Obrigado por participar!"), "a mensagem de voto registrado");
    confere(texto(env, "idvMeuConteudo").includes("✅ Você já votou (23/11/2026") === false && /Você já votou \(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\)/.test(texto(env, "idvMeuConteudo")) && !botao(env, "Votar"), "relido: 'Você já votou (data e hora)' e nenhuma cédula");
    // recusa do servidor (votou em outro aparelho enquanto a cédula estava aberta): a mensagem tal qual, e relê
    const srv2 = servidor({ hoje: "2026-11-25" }); const e2 = srv2.votacaoAberta();
    const env2 = novo(srv2);
    await abrirMeu(env2);
    srv2.votar(31, srv2.S.S.ana2);
    marcar(env2, `idvVoto_${e2.perguntas[0].opcoes[0].opcaoId}`);
    await clicarEResponder(env2, botao(env2, "Votar"), true);
    confere(meuMsg(env2).includes("Esta matrícula já respondeu este formulário.") && meuMsg(env2).includes(ATAQUE("msgEnq")) && e2.respostas.length === 1, `recusa: a mensagem do servidor (${meuMsg(env2).slice(0, 80)})`);
    confere(/Você já votou/.test(texto(env2, "idvMeuConteudo")) && chamadas(env2, "GET identidade-visual/meu").length === 2, "recusa: relê e mostra que já votou");
    limpo(env2, "recusa do voto", [ATAQUE("msgEnq")]);
    // duplo clique: depois de confirmar o botão fica desabilitado; uma segunda chamada (mesma chave) é recusada
    const srv3 = servidor({ hoje: "2026-11-25" }); const e3 = srv3.votacaoAberta();
    const env3 = novo(srv3);
    await abrirMeu(env3);
    marcar(env3, `idvVoto_${e3.perguntas[0].opcoes[1].opcaoId}`);
    const r = env3.retem(x => x.chave === `POST enquetes/${e3.enqueteId}/votar`);
    const b = botao(env3, "Votar");
    env3.doc.clicar(b); await env3.responderModal(true); await env3.ocioso();
    confere(b.disabled === true && env3.doc.clicar(b) === false, "o botão Votar fica desabilitado enquanto o voto anda");
    env3.ev("idvVotarAcao(null)"); await env3.responderModal(true); await env3.ocioso();
    confere(env3.toasts().some(x => x.includes("Aguarde")), "a segunda chamada é recusada com 'Aguarde'");
    r.liberar(); await env3.ocioso();
    confere(chamadas(env3, `POST enquetes/${e3.enqueteId}/votar`).length === 1 && e3.respostas.length === 1, "um só voto");
    // encerrada (ainda na etapa da votação): 'terminou' e a contagem
    const srv4 = servidor({ hoje: "2026-11-29" }); const e4 = srv4.votacaoAberta();
    srv4.votar(33, srv4.S.S.bento); srv4.votar(34, srv4.S.S.bento); srv4.votar(13, srv4.S.S.ana2);
    e4.status = "ENCERRADA";
    const env4 = novo(srv4);
    await abrirMeu(env4);
    const t4 = texto(env4, "idvMeuConteudo");
    confere(t4.includes("A votação terminou.") && t4.includes(`Luz do mundo ${ATAQUE("sugBento")}: 2 voto(s)`) && t4.includes(`Frutos que permanecem para sempre ${ATAQUE("textoFinal")}: 1 voto(s)`) && t4.includes("Total: 3 voto(s)."), `encerrada: a contagem por tema e o total: ${t4.slice(0, 200)}`);
    confere(!botao(env4, "Votar"), "encerrada: sem cédula");
    limpo(env4, "contagem", [ATAQUE("sugBento")]);
  });

  cenario("Meu Painel: arte — cores conferidas, arquivo (falta, tipo, tamanho), o POST em base64, Ver pela urlSegura, Retirar, recusada, máximo", async () => {
    const srv = servidor({ hoje: "2026-12-10" });
    srv.votacaoAberta(); srv.votar(33, srv.S.S.bento); srv.votar(34, srv.S.S.bento); srv.votar(13, srv.S.S.ana2);
    srv.S.cores.push({ corId: 401, cicloId: 7, ordem: 1, nome: srv.A("corNome", "Azul royal"), hex: "#1A4D8F" },
      { corId: 402, cicloId: 7, ordem: 2, nome: srv.A("corRuim", "Cor quebrada"), hex: "red;background-image:url(x)\" onmouseover=\"window.__xss('hex')" },
      { corId: 403, cicloId: 7, ordem: 3, nome: "Branco gelo", hex: "#f0f4f8" });
    const enviada = srv.novaArte({ titulo: srv.A("arteTitulo", "Raízes em azul"), descricao: "x" });
    const recusada = srv.novaArte({ titulo: null, status: "RECUSADA", motivoRecusa: srv.A("motivoRecusa", "Ilegível no tecido") });
    srv.novaArte({ titulo: "Retirada antes", status: "RETIRADA", temImagem: false });
    const env = novo(srv);
    await abrirMeu(env);
    const cx = env.e("idvMeuConteudo");
    const t = texto(env, "idvMeuConteudo");
    confere(t.includes(`Tema de 2027: Luz do mundo ${ATAQUE("sugBento")}`) && t.includes("Total: 3 voto(s)."), "o tema escolhido na votação e a contagem");
    const estilos = desc(env, cx).filter(x => x.hasAttribute("style")).map(x => x.getAttribute("style"));
    confere(estilos.length === 2 && estilos.every(s => /^background:#[0-9A-F]{6}$/.test(s)) && estilos.includes("background:#1A4D8F") && estilos.includes("background:#F0F4F8"), `só cor conferida (#RRGGBB) entra no estilo: ${JSON.stringify(estilos)}`);
    confere(!t.includes("Cor quebrada") && !desc(env, cx).some(x => /mouseover|url\(/.test(x.getAttribute("style") || "")), "a cor inválida do servidor nunca chega a um atributo de estilo (nem aparece)");
    confere(!!env.e("idvArteArquivo") && env.e("idvArteArquivo").getAttribute("accept") === "image/png,image/jpeg", "o envio, só PNG e JPEG");
    const liEnv = liCom(env, "idvMeuConteudo", ATAQUE("arteTitulo"));
    confere(!!liEnv && liEnv.textContent.includes("No concurso") && botoes(env, "Retirar", liEnv).length === 1 && botoes(env, "Ver", liEnv).length === 1, "a arte enviada: no concurso, com Ver e Retirar");
    const liRec = liCom(env, "idvMeuConteudo", ATAQUE("motivoRecusa"));
    confere(!!liRec && liRec.textContent.includes("Sem título") && liRec.textContent.includes("Fora do concurso") && liRec.textContent.includes(`Motivo: Ilegível no tecido ${ATAQUE("motivoRecusa")}`) && botoes(env, "Retirar", liRec).length === 0, "a recusada: 'Fora do concurso' e o motivo, sem Retirar");
    const liRet = liCom(env, "idvMeuConteudo", "Retirada antes");
    confere(!!liRet && botoes(env, "Ver", liRet).length === 0 && botoes(env, "Retirar", liRet).length === 0, "a retirada (sem imagem): sem Ver e sem Retirar");
    limpo(env, "arte", [ATAQUE("corNome"), ATAQUE("arteTitulo"), ATAQUE("motivoRecusa")]);
    const mandar = () => clicar(env, botao(env, "Mandar a arte"));
    // sem arquivo, tipo errado, grande demais, vazio: recusa antes de qualquer pedido (e sem ler o arquivo)
    await mandar();
    confere(meuMsg(env) === "Escolha a imagem da arte." && posts(env).length === 0, "sem arquivo: o aviso, nenhum pedido");
    const gif = arquivo({ nome: "a.gif", tipo: "image/gif" });
    env.e("idvArteArquivo").files = [gif];
    await mandar();
    confere(meuMsg(env).includes("PNG ou JPEG") && posts(env).length === 0 && gif.lidos === 0, "tipo errado: recusa, nenhum pedido, o arquivo nem é lido");
    const grande = arquivo({ tamanho: 5 * 1024 * 1024 + 1 });
    env.e("idvArteArquivo").files = [grande];
    await mandar();
    confere(meuMsg(env).includes("passa de 5 MB") && posts(env).length === 0 && grande.lidos === 0, "mais de 5 MB: recusa antes do pedido");
    const vazio = arquivo({ bytes: Buffer.alloc(0) });
    env.e("idvArteArquivo").files = [vazio];
    await mandar();
    confere(meuMsg(env).includes("vazia") && posts(env).length === 0, "arquivo vazio: recusa");
    // o arquivo certo: POST arte {imagemBase64, tipo, titulo, descricao}
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 250, 251, 252, 0, 7]);
    const png = arquivo({ bytes });
    env.e("idvArteArquivo").files = [png];
    digitar(env, "idvArteTitulo", "  Minha arte  "); digitar(env, "idvArteDescricao", "Azul com branco");
    await mandar();
    let p = ultima(env, "POST identidade-visual/arte");
    confere(!!p && JSON.stringify(p.corpo) === JSON.stringify({ imagemBase64: bytes.toString("base64"), tipo: "image/png", titulo: "Minha arte", descricao: "Azul com branco" }), `POST arte com a imagem em base64, o tipo, o título e a descrição: ${p && JSON.stringify(p.corpo).slice(0, 160)}`);
    confere(iv.base64CabeNoLimite(p.corpo.imagemBase64) && !iv.conferirImagem(Buffer.from(p.corpo.imagemBase64, "base64"), "image/png").problema, "o base64 passa nas regras de verdade do servidor (é o PNG que a pessoa escolheu)");
    confere(meuMsg(env).includes("Arte recebida.") && !!liCom(env, "idvMeuConteudo", "Minha arte") && chamadas(env, "GET identidade-visual/meu").length === 2, "201: relê, a arte nova na lista, a mensagem fica");
    // Ver: GET imagem?arteId= e a imagem pela urlSegura
    const liNova = liCom(env, "idvMeuConteudo", ATAQUE("arteTitulo"));
    await clicar(env, botoes(env, "Ver", liNova)[0]);
    const g = ultima(env, "GET identidade-visual/imagem");
    confere(!!g && g.consulta.arteId === String(enviada.arteId) && !g.corpoBruto, `GET imagem?arteId=${g && g.consulta.arteId}`);
    const img = desc(env, env.e(`idvImg_${enviada.arteId}`)).find(x => x.localName === "img");
    confere(!!img && img.getAttribute("src") === URL_IMAGEM(enviada.arteId) && img.className === "idv-arte-img" && !!img.getAttribute("alt"), `a imagem com o endereço assinado: ${img && img.getAttribute("src")}`);
    // um endereço javascript: (ou data: que não é imagem) do servidor nunca vira src
    for (const ruim of ["javascript:window.__xss('url')", " JaVa\tScRiPt:window.__xss('url2')", "data:text/html,<script>window.__xss('data')</script>"]) {
      srv.S.urlImagem = () => ruim;
      await clicar(env, botoes(env, "Ver", liCom(env, "idvMeuConteudo", ATAQUE("arteTitulo")))[0]);
      const i2 = desc(env, env.e(`idvImg_${enviada.arteId}`)).find(x => x.localName === "img");
      confere(!!i2 && i2.getAttribute("src") === "#", `endereço perigoso vira "#": ${JSON.stringify(ruim)} -> ${i2 && i2.getAttribute("src")}`);
    }
    srv.S.urlImagem = URL_IMAGEM;
    // imagem que não abre: a mensagem no lugar
    srv.S.imagemFalha = { status: 422, corpo: { sucesso: false, mensagem: srv.A("msgImagem", "A imagem desta arte já foi apagada.") } };
    await clicar(env, botoes(env, "Ver", liCom(env, "idvMeuConteudo", ATAQUE("arteTitulo")))[0]);
    confere(texto(env, `idvImg_${enviada.arteId}`).includes("já foi apagada") && !desc(env, env.e(`idvImg_${enviada.arteId}`)).some(x => x.localName === "img"), "imagem que não abre: a mensagem, sem imagem");
    srv.S.imagemFalha = null;
    // Retirar a arte
    let m = await clicarEResponder(env, botoes(env, "Retirar", liCom(env, "idvMeuConteudo", ATAQUE("arteTitulo")))[0], false);
    confere(m.aberto && m.texto.includes("A imagem é apagada") && chamadas(env, "POST identidade-visual/retirar-arte").length === 0, "retirar a arte pede confirmação; cancelar não manda");
    await clicarEResponder(env, botoes(env, "Retirar", liCom(env, "idvMeuConteudo", ATAQUE("arteTitulo")))[0], true);
    p = ultima(env, "POST identidade-visual/retirar-arte");
    confere(!!p && JSON.stringify(p.corpo) === JSON.stringify({ arteId: enviada.arteId }) && liCom(env, "idvMeuConteudo", ATAQUE("arteTitulo")).textContent.includes("Retirada"), `POST retirar-arte {arteId} e relê: ${p && JSON.stringify(p.corpo)}`);
    // 429 no envio
    srv.S.limiteEnvios = true;
    env.e("idvArteArquivo").files = [arquivo({ bytes })];
    await mandar();
    confere(meuMsg(env).includes("Muitos envios seguidos"), "429: a mensagem do servidor");
    srv.S.limiteEnvios = false;
    limpo(env, "envio da arte", [ATAQUE("msgArte")]);
    // o máximo (3 ativas): o aviso no lugar do envio
    srv.novaArte({ titulo: "Segunda" }); srv.novaArte({ titulo: "Terceira" });
    await clicar(env, botao(env, "Atualizar", env.e("subMeupainelIdentidade")));
    confere(!env.e("idvArteArquivo") && texto(env, "idvMeuConteudo").includes("Você já mandou 3 artes (o máximo)."), "3 artes ativas: o aviso do máximo, sem o envio");
    // sem cores: sem o envio
    const srv2 = servidor({ hoje: "2026-12-10" }); srv2.votacaoAberta(); srv2.votar(33, srv2.S.S.bento);
    const env2 = novo(srv2);
    await abrirMeu(env2);
    confere(!env2.e("idvArteArquivo") && texto(env2, "idvMeuConteudo").includes("A Diretoria ainda não registrou as cores do ano."), "sem cores: o aviso, sem o envio");
    // duplo clique no envio
    const srv3 = servidor({ hoje: "2026-12-10" }); srv3.votacaoAberta(); srv3.votar(33, srv3.S.S.bento);
    srv3.S.cores.push({ corId: 401, cicloId: 7, ordem: 1, nome: "Azul", hex: "#1A4D8F" });
    const env3 = novo(srv3);
    await abrirMeu(env3);
    env3.e("idvArteArquivo").files = [arquivo({ bytes })];
    const r = env3.retem(x => x.chave === "POST identidade-visual/arte");
    const b = botao(env3, "Mandar a arte");
    env3.doc.clicar(b); await env3.ocioso();
    confere(b.disabled === true && env3.doc.clicar(b) === false, "o botão fica desabilitado enquanto a arte sobe");
    env3.ev("idvEnviarArteAcao(null)"); await env3.ocioso();
    r.liberar(); await env3.ocioso();
    confere(chamadas(env3, "POST identidade-visual/arte").length === 1 && env3.toasts().some(x => x.includes("Aguarde")), "uma só arte enviada");
  });

  cenario("Meu Painel: encerrado — o resultado e a imagem escolhida; sem resultado ainda", async () => {
    const srv = servidor({ comCiclo: false, comAntigo: true, hoje: "2026-10-23" });
    const env = novo(srv);
    await abrirMeu(env);
    const t = texto(env, "idvMeuConteudo");
    confere(t.includes("Identidade visual de 2026 — Encerrado") && t.includes("Identidade Visual oficial de 2026") && t.includes(`Firmes na rocha ${ATAQUE("temaAntigo")}`), `encerrado: o tema oficial: ${t.slice(0, 200)}`);
    confere(t.includes(`Vinho ${ATAQUE("corAntiga")}`) && t.includes("#7A1F2B") && t.includes("Escolhida em 14/12/2025") && t.includes(ATAQUE("ocasiaoRotulo")) && t.includes("com 120 voto(s) de 300 presentes"), "a cor, a data, a ocasião e os votos");
    const g = ultima(env, "GET identidade-visual/imagem");
    const img = desc(env, env.e("idvArteEscolhida")).find(x => x.localName === "img");
    confere(!!g && g.consulta.arteId === "490" && !!img && img.getAttribute("src") === URL_IMAGEM(490), "a imagem da arte escolhida é pedida na hora e aparece pela urlSegura");
    confere(linhaDoTempo(env, "idvMeuConteudo").every(x => !x.className.includes("idv-atual")) || linhaDoTempo(env, "idvMeuConteudo")[4].className.includes("idv-atual"), "a linha do tempo no fim");
    limpo(env, "encerrado", [ATAQUE("temaAntigo"), ATAQUE("corAntiga"), ATAQUE("ocasiaoRotulo")]);
    // sem o resultado registrado (janeiro, a apuração feita): o aviso
    const srv2 = servidor({ hoje: "2026-12-10" }); srv2.votacaoAberta(); srv2.votar(33, srv2.S.S.bento);
    srv2.S.hoje = "2027-01-05";
    const env2 = novo(srv2);
    await abrirMeu(env2);
    confere(texto(env2, "idvMeuConteudo").includes("O resultado da escolha final ainda não foi registrado pela Diretoria.") && texto(env2, "idvMeuConteudo").includes(`Tema de 2027: Luz do mundo`), "encerrado sem resultado: o tema e o aviso");
    confere(chamadas(env2, "GET identidade-visual/imagem").length === 0, "sem resultado: nenhuma imagem pedida");
  });

  cenario("Meu Painel: erros, rede caída e o prazo de 20 s", async () => {
    const srv = servidor({ hoje: "2026-11-05" });
    const env = novo(srv);
    env.api.rotas["GET identidade-visual/meu"] = { status: 500, corpo: { sucesso: false, mensagem: "Falhou " + ATAQUE("msg500") } };
    await abrirMeu(env);
    confere(meuMsg(env).includes("Falhou") && texto(env, "idvMeuConteudo") === "", "500: o motivo no lugar, nada pintado");
    confere(env.toasts().filter(x => x.includes("Falhou")).length === 1, "500: um aviso só (o do fetchProtegido)");
    limpo(env, "500", [ATAQUE("msg500")]);
    const env2 = novo(srv);
    env2.api.redeCaida = true;
    await abrirMeu(env2);
    confere(meuMsg(env2) === msgs(env2).rede && env2.toasts().length === 1, "rede caída: a mensagem de rede e um aviso");
    const env3 = novo(srv);
    env3.api.rotas["GET identidade-visual/meu"] = { status: 200, naoJson: true };
    await abrirMeu(env3);
    confere(meuMsg(env3).includes("Resposta inesperada do servidor (200)"), "resposta que não é JSON: a mensagem, sem quebrar");
    const env4 = novo(srv);
    const r = env4.retem(x => x.chave === "GET identidade-visual/meu");
    await abrirMeu(env4);
    confere(meuMsg(env4) === "Carregando…", "enquanto carrega: 'Carregando…'");
    confere(env4.dispararTemporizador(20000) >= 1, "a chamada tem o prazo de 20 s");
    await env4.ocioso();
    confere(meuMsg(env4) === msgs(env4).tempo && texto(env4, "idvMeuConteudo") === "", "prazo esgotado: a mensagem de tempo");
    r.liberar(); await env4.ocioso();
    // o prazo também no ato (o pedido pode ter chegado: a tela diz para conferir)
    const env5 = novo(srv);
    await abrirMeu(env5);
    digitar(env5, "idvSugestaoTexto", "Graça que alcança");
    const r5 = env5.retem(x => x.chave === "POST identidade-visual/sugerir");
    env5.doc.clicar(botao(env5, "Mandar sugestão")); await env5.ocioso();
    env5.dispararTemporizador(20000); await env5.ocioso();
    confere(meuMsg(env5) === msgs(env5).tempo && !botao(env5, "Mandar sugestão").disabled, "ato sem resposta em 20 s: a mensagem e o botão volta");
    r5.liberar(); await env5.ocioso();
    confere(env5.api.chamadas.every(c => c.comPrazo && c.comToken), "toda chamada leva o prazo e o token");
  });

  cenario("Códigos desconhecidos do servidor (etapa, situação, apuração, ocasião) também viram só texto", async () => {
    // a resposta do servidor imitado, com os códigos trocados por texto de ataque: a tela usa o rótulo dela quando conhece o código e, quando não conhece, mostra o código ESCAPADO
    const trocar = (srv, chave, f) => async (c) => { const r = await srv.servidor(c); if (r.status === 200) f(r.corpo); return r; };
    const srv = servidor({ hoje: "2026-11-05" });
    let env = novo(srv);
    env.api.rotas["GET identidade-visual/meu"] = trocar(srv, "meu", (d) => { d.minhasSugestoes[0].situacao = ATAQUE("situacaoSug"); });
    await abrirMeu(env);
    limpo(env, "situação da sugestão", [ATAQUE("situacaoSug")]);
    env = novo(srv);
    env.api.rotas["GET identidade-visual/meu"] = trocar(srv, "meu", (d) => { d.ciclo.fase = ATAQUE("faseMeu"); });
    await abrirMeu(env);
    limpo(env, "etapa desconhecida (Meu Painel)", [ATAQUE("faseMeu")]);
    const srvA = servidor({ hoje: "2026-12-10" }); srvA.votacaoAberta(); srvA.votar(33, srvA.S.S.bento);
    srvA.S.cores.push({ corId: 401, cicloId: 7, ordem: 1, nome: "Azul", hex: "#1A4D8F" });
    srvA.novaArte({ titulo: "A" });
    env = novo(srvA);
    env.api.rotas["GET identidade-visual/meu"] = trocar(srvA, "meu", (d) => { d.minhasArtes[0].situacao = ATAQUE("situacaoArte"); });
    await abrirMeu(env);
    limpo(env, "situação da arte (Meu Painel)", [ATAQUE("situacaoArte")]);
    // a Diretoria: a etapa na pílula e no detalhe, a situação da sugestão e da arte, a apuração
    env = novo(srvA);
    env.api.rotas["GET identidade-visual/painel"] = trocar(srvA, "painel", (d) => { d.ciclos[0].fase = ATAQUE("fasePilula"); });
    env.api.rotas["GET identidade-visual/ciclo"] = trocar(srvA, "ciclo", (d) => {
      d.ciclo.fase = ATAQUE("faseDetalhe"); d.ciclo.apuracao = ATAQUE("apuracao");
      d.sugestoes[0].situacao = ATAQUE("situacaoSugGes"); d.artes[0].situacao = ATAQUE("situacaoArteGes");
    });
    await abrirAba(env);
    limpo(env, "códigos desconhecidos (Diretoria)", [ATAQUE("fasePilula"), ATAQUE("faseDetalhe"), ATAQUE("apuracao"), ATAQUE("situacaoSugGes"), ATAQUE("situacaoArteGes")]);
    // o resultado sem o rótulo da ocasião: o código, escapado (Meu Painel e Diretoria)
    const srvR = servidor({ comCiclo: false, comAntigo: true, hoje: "2026-10-23" });
    env = novo(srvR);
    env.api.rotas["GET identidade-visual/meu"] = trocar(srvR, "meu", (d) => { d.resultado.ocasiaoRotulo = null; d.resultado.ocasiao = ATAQUE("ocasiaoMeu"); });
    await abrirMeu(env);
    limpo(env, "ocasião sem rótulo (Meu Painel)", [ATAQUE("ocasiaoMeu")]);
    env = novo(srvR);
    env.api.rotas["GET identidade-visual/ciclo"] = trocar(srvR, "ciclo", (d) => { d.resultado.ocasiaoRotulo = null; d.resultado.ocasiao = ATAQUE("ocasiaoGes"); d.resultado.registradoPor = null; });
    await abrirAba(env);
    limpo(env, "ocasião sem rótulo (Diretoria)", [ATAQUE("ocasiaoGes")]);
    confere(texto(env, "idvCicloDetalhe").includes("Registrado por —"), "sem quem registrou: o traço");
  });

  // ============================================================================================================================================
  // 2) MEU PAINEL → VOTAÇÕES (enquetes.js)
  // ============================================================================================================================================
  cenario("Meu Painel → Votações: lista, já respondida, opções e texto livre, falta resposta, o POST, recusa, lista vazia", async () => {
    const srv = servidor({ hoje: "2026-11-25" });
    const ei = srv.votacaoAberta();
    const env = novo(srv);
    await abrirMeu(env, "pin", 31, "votacoes");
    const c = chamadas(env, "GET enquetes");
    confere(c.length === 1 && c[0].consulta.paraVotar === "1" && c[0].comToken && chamadas(env, "GET identidade-visual/meu").length === 0, "GET enquetes?paraVotar=1 uma vez, com o token");
    const cartoes = desc(env, env.e("enqMeuLista")).filter(x => x.localName === "div" && x.className === "cartao-perfil");
    confere(cartoes.length === 3, `3 votações para a Ana (a da lista de outros, a encerrada e a vencida ficam de fora): ${cartoes.length}`);
    const t = texto(env, "enqMeuLista");
    confere(t.includes("Tema da Identidade Visual de 2027") && t.includes("É a escolha do tema da Identidade Visual de 2027 (também em Meu Painel → Identidade Visual)."), "a votação do tema aparece aqui, marcada");
    confere(t.includes(`Horário da EBD ${ATAQUE("enqRespondida")}`) && t.includes("✅ Você já respondeu (21/10/2026 10:10)"), `a já respondida: com a data e sem o formulário (${t.slice(0, 50)})`);
    confere(!t.includes("Só da comissão") && !t.includes("Encerrada") && !t.includes("Vencida"), "o que não é para ela não aparece");
    const dia = srv.S.E.dia;
    const [p1, p2] = dia.perguntas;
    confere(t.includes(`Dia do culto de jovens ${ATAQUE("enqTitulo")}`) && t.includes(ATAQUE("enqDescricao")) && t.includes(ATAQUE("enqPergunta")) && t.includes(ATAQUE("enqOpcaoSab")) && t.includes("Fecha em 30/11/2026 23:59."), "título, descrição, perguntas, opções e o fechamento como texto");
    confere(!!env.e(`enqMeuOpc_${dia.enqueteId}_${p1.perguntaId}_${p1.opcoes[0].opcaoId}`) && !!env.e(`enqMeuTxt_${dia.enqueteId}_${p2.perguntaId}`), "opções viram rádio; texto livre vira campo");
    confere(botoes(env, "Enviar minha resposta", env.e("enqMeuLista")).length === 2, "o botão só nas que faltam responder");
    limpo(env, "votações", [ATAQUE("enqTitulo"), ATAQUE("enqPergunta"), ATAQUE("enqOpcaoSab"), ATAQUE("enqPerguntaTexto")]);
    const cartaoDia = () => desc(env, env.e("enqMeuLista")).find(x => x.className === "cartao-perfil" && x.textContent.includes("Dia do culto"));
    const enviar = async (confirmar) => { const b = botoes(env, "Enviar minha resposta", cartaoDia())[0]; env.doc.clicar(b); const m = await env.responderModal(confirmar); await env.ocioso(); return m; };
    // nada respondido: o aviso com o título da pergunta, sem confirmação
    env.doc.clicar(botoes(env, "Enviar minha resposta", cartaoDia())[0]); await env.ocioso();
    confere(texto(env, "enqMeuMsg") === `Responda: "${p1.titulo}".` && env.e("modalOverlay").classList.contains("escondido") && posts(env).length === 0, `falta a 1ª: o aviso (${texto(env, "enqMeuMsg").slice(0, 40)})`);
    marcar(env, `enqMeuOpc_${dia.enqueteId}_${p1.perguntaId}_${p1.opcoes[0].opcaoId}`);
    env.doc.clicar(botoes(env, "Enviar minha resposta", cartaoDia())[0]); await env.ocioso();
    confere(texto(env, "enqMeuMsg") === `Responda: "${p2.titulo}".` && posts(env).length === 0, "falta o texto livre: o aviso");
    digitar(env, `enqMeuTxt_${dia.enqueteId}_${p2.perguntaId}`, "  Pastor João  ");
    let m = await enviar(false);
    confere(m.aberto && m.texto.includes("Enviar a sua resposta?") && posts(env).length === 0, "confirmação; cancelar não manda");
    await enviar(true);
    const v = ultima(env, `POST enquetes/${dia.enqueteId}/votar`);
    confere(!!v && JSON.stringify(v.corpo) === JSON.stringify({ respostas: [{ perguntaId: p1.perguntaId, opcaoId: p1.opcoes[0].opcaoId }, { perguntaId: p2.perguntaId, textoResposta: "Pastor João" }] }) && v.comToken, `POST votar {respostas: opção e texto}: ${v && JSON.stringify(v.corpo)}`);
    confere(dia.respostas.length === 2 && dia.respostas.every(r => r.membroId === 31), "o servidor gravou as duas respostas da pessoa da sessão");
    confere(texto(env, "enqMeuMsg") === "Resposta registrada. Obrigado!" && cartaoDia().textContent.includes("Você já respondeu") && chamadas(env, "GET enquetes").length === 2, "relê: a mensagem e 'já respondeu'");
    // a votação do tema, por aqui
    const op = ei.perguntas[0].opcoes[0];
    marcar(env, `enqMeuOpc_${ei.enqueteId}_${ei.perguntas[0].perguntaId}_${op.opcaoId}`);
    const cartaoTema = desc(env, env.e("enqMeuLista")).find(x => x.className === "cartao-perfil" && x.textContent.includes("Tema da Identidade Visual"));
    env.doc.clicar(botoes(env, "Enviar minha resposta", cartaoTema)[0]); await env.responderModal(true); await env.ocioso();
    confere(ei.respostas.length === 1 && ei.respostas[0].opcaoId === op.opcaoId, "o voto do tema também vai por Votações");
    // recusa do servidor: a mensagem dele
    const srv2 = servidor({ hoje: "2026-11-25" });
    const env2 = novo(srv2);
    await abrirMeu(env2, "pin", 31, "votacoes");
    srv2.S.E.dia.status = "ENCERRADA";
    const d2 = srv2.S.E.dia;
    marcar(env2, `enqMeuOpc_${d2.enqueteId}_${d2.perguntas[0].perguntaId}_${d2.perguntas[0].opcoes[1].opcaoId}`);
    digitar(env2, `enqMeuTxt_${d2.enqueteId}_${d2.perguntas[1].perguntaId}`, "x");
    const cd2 = desc(env2, env2.e("enqMeuLista")).find(x => x.className === "cartao-perfil" && x.textContent.includes("Dia do culto"));
    env2.doc.clicar(botoes(env2, "Enviar minha resposta", cd2)[0]); await env2.responderModal(true); await env2.ocioso();
    confere(texto(env2, "enqMeuMsg").includes("Esta enquete já foi encerrada.") && env2.toasts().some(x => x.includes("Esta enquete já foi encerrada.")), "recusa: a mensagem do servidor na tela e no aviso");
    confere(!texto(env2, "enqMeuLista").includes("Dia do culto"), "relê: a encerrada sai da lista");
    limpo(env2, "recusa", [ATAQUE("msgEnq")]);
    // lista vazia
    const env3 = novo(srv2);
    await abrirMeu(env3, "pin2", 32, "votacoes");
    confere(texto(env3, "enqMeuLista") === "Nenhuma votação aberta para você agora.", "nenhuma: a frase certa");
    // rede caída
    const env4 = novo(srv2);
    env4.api.redeCaida = true;
    await abrirMeu(env4, "pin", 31, "votacoes");
    confere(texto(env4, "enqMeuMsg").includes("Não foi possível") && texto(env4, "enqMeuLista") === "", "rede caída: a mensagem, nada pintado");
  });

  cenario("Meu Painel → Votações: duplo clique, sair da sub-aba, troca de login com o voto no meio, o prazo de 20 s", async () => {
    const srv = servidor({ hoje: "2026-11-25" });
    const dia = srv.S.E.dia;
    const [p1, p2] = dia.perguntas;
    const preencher = (env) => { marcar(env, `enqMeuOpc_${dia.enqueteId}_${p1.perguntaId}_${p1.opcoes[1].opcaoId}`); digitar(env, `enqMeuTxt_${dia.enqueteId}_${p2.perguntaId}`, "Ev. Paulo"); };
    const cartao = (env) => desc(env, env.e("enqMeuLista")).find(x => x.className === "cartao-perfil" && x.textContent.includes("Dia do culto"));
    // duplo clique: o botão desabilita depois de confirmar
    let env = novo(srv);
    await abrirMeu(env, "pin", 31, "votacoes");
    preencher(env);
    let r = env.retem(x => x.chave === `POST enquetes/${dia.enqueteId}/votar`);
    const b = botoes(env, "Enviar minha resposta", cartao(env))[0];
    env.doc.clicar(b); await env.responderModal(true); await env.ocioso();
    confere(b.disabled === true && env.doc.clicar(b) === false, "o botão fica desabilitado enquanto a resposta anda");
    r.liberar(); await env.ocioso();
    confere(chamadas(env, `POST enquetes/${dia.enqueteId}/votar`).length === 1, "uma só resposta");
    // sair da sub-aba limpa a lista e a resposta atrasada não é pintada
    const srv2 = servidor({ hoje: "2026-11-25" });
    env = novo(srv2);
    r = env.retem(x => x.chave === "GET enquetes");
    await abrirMeu(env, "pin", 31, "votacoes");
    env.ev('mostrarSubAbaMeupainel("perfil")'); await env.ocioso();
    r.liberar(); await env.ocioso();
    confere(texto(env, "enqMeuLista") === "" && texto(env, "enqMeuMsg") === "", "a lista que chega depois de sair da sub-aba não é pintada");
    env = novo(srv2);
    await abrirMeu(env, "pin", 31, "votacoes");
    confere(texto(env, "enqMeuLista").includes("Dia do culto"), "lista na tela");
    env.ev('mostrarSubAbaMeupainel("identidade")'); await env.ocioso();
    confere(texto(env, "enqMeuLista") === "" && env.g("enqMeuLista").length === 0, "sair da sub-aba limpa a lista (e a memória)");
    // troca de login com a resposta no meio: a próxima pessoa não vê "Resposta registrada" que não é dela
    const srv3 = servidor({ hoje: "2026-11-25" });
    env = novo(srv3);
    await abrirMeu(env, "pin", 31, "votacoes");
    marcar(env, `enqMeuOpc_${srv3.S.E.dia.enqueteId}_${srv3.S.E.dia.perguntas[0].perguntaId}_${srv3.S.E.dia.perguntas[0].opcoes[0].opcaoId}`);
    digitar(env, `enqMeuTxt_${srv3.S.E.dia.enqueteId}_${srv3.S.E.dia.perguntas[1].perguntaId}`, "Pr. Ana");
    r = env.retem(x => x.chave === `POST enquetes/${srv3.S.E.dia.enqueteId}/votar`);
    env.doc.clicar(botoes(env, "Enviar minha resposta", cartao(env))[0]); await env.responderModal(true); await env.ocioso();
    env.ev("limparSessao()"); await env.ocioso();
    confere(texto(env, "enqMeuLista") === "", "sair da sessão limpa Votações");
    await abrirMeu(env, "pin3", 33, "votacoes");
    env.e("toastContainer").innerHTML = "";
    r.liberar(); await env.ocioso();
    confere(!texto(env, "enqMeuMsg").includes("Resposta registrada") && !env.toasts().some(x => x.includes("Resposta registrada")), `a resposta da pessoa anterior não aparece para a próxima (msg: "${texto(env, "enqMeuMsg")}", avisos: ${env.toasts().join(" | ")})`);
    // o prazo de 20 s ao carregar
    const srv4 = servidor({ hoje: "2026-11-25" });
    env = novo(srv4);
    r = env.retem(x => x.chave === "GET enquetes");
    await abrirMeu(env, "pin", 31, "votacoes");
    confere(env.dispararTemporizador(20000) >= 1, "a lista de Votações tem o prazo de 20 s");
    await env.ocioso();
    confere(texto(env, "enqMeuMsg").includes("20 segundos"), `prazo esgotado: a mensagem de tempo (${texto(env, "enqMeuMsg")})`);
    r.liberar(); await env.ocioso();
  });

  // ============================================================================================================================================
  // 3) ABA DA DIRETORIA
  // ============================================================================================================================================
  cenario("Diretoria: sem acesso, sem a permissão, PIN, não geral, falha ao abrir", async () => {
    const srv = servidor({ hoje: "2026-11-18" });
    // a permissão e o nível geral na tela, mas o servidor diz que não há gestão
    const env = novo(srv);
    await abrirAba(env, "semgestao", 10);
    confere(visivel(env, "abaIdentidade") && visivel(env, "idvSemAcesso") && !visivel(env, "idvConteudo"), "sem gestão no servidor: o aviso de sem acesso, conteúdo escondido");
    confere(chamadas(env, "GET identidade-visual/catalogos").length === 1 && chamadas(env, "GET identidade-visual/painel").length === 0 && chamadas(env, "GET identidade-visual/temas").length === 0, "sem gestão: só o catálogo, nada da Diretoria é pedido");
    confere(!visivel(env, "idvPilulas"), "sem gestão: as pílulas Ciclo e Temas não ficam à vista");
    env.ev('idvMostrarSecaoAcao("temas")'); await env.ocioso();
    confere(chamadas(env, "GET identidade-visual/temas").length === 0, "sem gestão: a ação direta não abre Temas");
    limpo(env, "sem acesso");
    // sem a permissão na tela; PIN; não geral: a aba nem aparece e nada é montado
    for (const [qual, sess] of [["sem a permissão", { permissoes: ["outra"] }], ["PIN", { pin: true }], ["não geral", { geral: false, nivel: "CONGREGACAO" }]]) {
      const e2 = novo(srv);
      await abrirAba(e2, "geral", 13, sess);
      confere(!visivel(e2, "abaIdentidade") && texto(e2, "idvPainelTopo") === "" && chamadas(e2, "GET identidade-visual/painel").length === 0, `${qual}: a aba não aparece e nada é montado`);
    }
    // falha ao abrir (rede caída): o motivo, não "sem acesso"; tentando de novo abre
    const env6 = novo(srv);
    env6.api.redeCaida = true;
    await abrirAba(env6);
    confere(!visivel(env6, "idvSemAcesso") && !visivel(env6, "idvConteudo") && texto(env6, "idvGesMsg").includes("Não foi possível abrir a identidade visual agora"), `falha ao abrir não é 'sem acesso' (${texto(env6, "idvGesMsg")})`);
    env6.api.redeCaida = false;
    env6.ev('mostrarAbaSecretaria("identidade")'); await env6.ocioso();
    confere(visivel(env6, "idvConteudo") && texto(env6, "idvGesMsg") === "" && visivel(env6, "idvPilulas") && chamadas(env6, "GET identidade-visual/painel").length === 1, "tentando de novo, a aba abre e o motivo some");
    // quem teve acesso e sai: a próxima pessoa (sem gestão) não herda o painel nem as pílulas
    env6.ev("limparSessao()"); await env6.ocioso();
    await abrirAba(env6, "semgestao", 10);
    confere(visivel(env6, "idvSemAcesso") && texto(env6, "idvPainelTopo") === "" && texto(env6, "idvCicloDetalhe") === "", "a próxima pessoa sem gestão não herda nada");
  });

  cenario("Diretoria: abrir o ciclo, cancelar o aberto por engano, pílulas dos ciclos, o motivo de não abrir", async () => {
    const srv = servidor({ comCiclo: false, comAntigo: true, hoje: "2026-10-23" });
    const env = novo(srv);
    await abrirAba(env);
    confere(chamadas(env, "GET identidade-visual/catalogos").length === 1 && chamadas(env, "GET identidade-visual/painel").length === 1, "abre: catálogo e painel, uma vez cada");
    const g = ultima(env, "GET identidade-visual/ciclo");
    confere(!!g && g.consulta.cicloId === "6", "o primeiro ciclo da lista abre sozinho (GET ciclo?cicloId=6)");
    const topo = texto(env, "idvPainelTopo");
    confere(topo.includes("O ciclo da identidade de 2027 ainda não foi aberto") && topo.includes("01/11/2026") && !!botao(env, "Abrir o ciclo da identidade de 2027"), "o convite para abrir o ciclo de 2027");
    const pilulas = desc(env, env.e("idvPainelTopo")).filter(x => x.localName === "button" && x.className.includes("cal-pilula"));
    confere(pilulas.length === 1 && pilulas[0].textContent === "2026 — Encerrado" && pilulas[0].className.includes("ativo"), `a pílula do ciclo antigo, ativa (${pilulas.map(x => x.textContent).join("|")})`);
    const det = texto(env, "idvCicloDetalhe");
    confere(det.includes("Escolha final registrada") && det.includes(ATAQUE("temaAntigo")) && det.includes(ATAQUE("ataAntiga")) && det.includes(`Registrado por Presidente Marcos ${ATAQUE("nomePresidente")}`) && det.includes(ATAQUE("ocasiaoRotulo")), "o ciclo encerrado: o resultado com a ata e quem registrou");
    confere(!det.includes("Registrar a escolha final") && botoes(env, "Cancelar este ciclo", env.e("idvCicloDetalhe")).length === 0, "encerrado: sem formulário de resultado e sem cancelar");
    limpo(env, "painel", [ATAQUE("temaAntigo"), ATAQUE("ataAntiga")]);
    // abrir: confirmação; cancelar não abre; confirmar manda {anoAlvo}
    let m = await clicarEResponder(env, botao(env, "Abrir o ciclo da identidade de 2027"), false);
    confere(m.aberto && m.texto.includes("Abrir o processo da identidade visual de 2027?") && chamadas(env, "POST identidade-visual/abrir-ciclo").length === 0, "abrir pede confirmação; cancelar não abre");
    await clicarEResponder(env, botao(env, "Abrir o ciclo da identidade de 2027"), true);
    const p = ultima(env, "POST identidade-visual/abrir-ciclo");
    confere(!!p && JSON.stringify(p.corpo) === JSON.stringify({ anoAlvo: 2027 }), `POST abrir-ciclo {anoAlvo}: ${p && JSON.stringify(p.corpo)}`);
    const novoId = srv.S.ciclos.find(c => c.anoAlvo === 2027).cicloId;
    confere(chamadas(env, "GET identidade-visual/painel").length === 2 && ultima(env, "GET identidade-visual/ciclo").consulta.cicloId === String(novoId), "abriu: relê o painel e mostra o ciclo novo");
    confere(cicloMsg(env).includes("Ciclo da Identidade Visual de 2027 aberto.") && !botao(env, "Abrir o ciclo da identidade de 2027"), "a mensagem do servidor e o convite some");
    const pil2 = desc(env, env.e("idvPainelTopo")).filter(x => x.localName === "button" && x.className.includes("cal-pilula"));
    confere(pil2.length === 2 && pil2[0].textContent === "2027 — Aguardando o início" && pil2[0].className.includes("ativo") && !pil2[1].className.includes("ativo"), "o ciclo novo é a pílula ativa");
    // trocar de ciclo pela pílula
    await clicar(env, pil2[1]);
    confere(ultima(env, "GET identidade-visual/ciclo").consulta.cicloId === "6" && texto(env, "idvCicloDetalhe").includes("Escolha final registrada"), "a pílula do outro ciclo abre o detalhe dele");
    await clicar(env, desc(env, env.e("idvPainelTopo")).find(x => x.localName === "button" && x.textContent.startsWith("2027")));
    // cancelar o aberto por engano
    const bc = botoes(env, "Cancelar este ciclo", env.e("idvCicloDetalhe"))[0];
    confere(!!bc, "o ciclo sem sugestões pode ser cancelado");
    m = await clicarEResponder(env, bc, true);
    const pc = ultima(env, "POST identidade-visual/cancelar-ciclo");
    confere(m.aberto && !!pc && JSON.stringify(pc.corpo) === JSON.stringify({ cicloId: novoId }) && !srv.S.ciclos.some(c => c.cicloId === novoId), `POST cancelar-ciclo {cicloId}: ${pc && JSON.stringify(pc.corpo)}`);
    confere(cicloMsg(env).includes("Ciclo de 2027 cancelado.") && !!botao(env, "Abrir o ciclo da identidade de 2027") && ultima(env, "GET identidade-visual/ciclo").consulta.cicloId === "6", "cancelado: relê, o convite volta e o ciclo antigo fica selecionado");
    // não dá mais para abrir (passou do dia 15): o motivo do servidor, sem botão
    const srv2 = servidor({ comCiclo: false, hoje: "2026-11-20" });
    const env2 = novo(srv2);
    await abrirAba(env2);
    confere(texto(env2, "idvPainelTopo").includes("terminaram em 15/11") && texto(env2, "idvPainelTopo").includes(ATAQUE("motivoNaoAbre")) && !botao(env2, "Abrir o ciclo") && texto(env2, "idvPainelTopo").includes("Nenhum ciclo aberto ainda."), "o motivo de não abrir, como texto, sem botão");
    confere(texto(env2, "idvCicloDetalhe") === "" && chamadas(env2, "GET identidade-visual/ciclo").length === 0, "sem ciclo: nenhum detalhe pedido");
    limpo(env2, "motivo", [ATAQUE("motivoNaoAbre")]);
    // ciclo de outra pessoa que sumiu: 404 neutro
    env2.ev("idvCarregarCicloAcao(99)"); await env2.ocioso();
    confere(cicloMsg(env2) === "Ciclo não encontrado.", "404: 'Ciclo não encontrado.'");
  });

  cenario("Diretoria: triagem — a lista sem nomes, finalista com ajuste e o 428, descartar com critério, voltar para a triagem, duplo clique", async () => {
    const srv = servidor({ hoje: "2026-11-18" });
    Object.assign(srv.S.S.bento, { status: "DESCARTADA", criterio: 1, observacao: srv.A("obsTriagem", "Longo demais"), triadoPorId: 14, triadoEm: "2026-11-17T12:00:00.000Z" });
    const env = novo(srv);
    await abrirAba(env);
    const det = texto(env, "idvCicloDetalhe");
    confere(det.includes("Sugestões (5; 0 finalista(s); 1 retirada(s); 4 pessoa(s))"), `o cabeçalho com as contagens: ${det.slice(det.indexOf("Sugestões ("), det.indexOf("Sugestões (") + 60)}`);
    confere(!det.includes("Caminhando juntos") && !det.includes("Ana Sugestora") && !det.includes("Carla Membro"), "a triagem vê só o texto: sem a retirada e sem nomes de quem mandou");
    const liAna = liCom(env, "idvCicloDetalhe", ATAQUE("sugAna"));
    confere(!!liAna && liAna.textContent.includes(`Parece com o tema de 2019: "Raízes da fé ${ATAQUE("parecidoTema")}"`), "a marca do 'parecido' com o tema e o ano");
    const liBento = liCom(env, "idvCicloDetalhe", ATAQUE("sugBento"));
    confere(!!liBento && liBento.textContent.includes(`Descartada — Curto e memorável ${ATAQUE("criterioRotulo")}`) && liBento.textContent.includes(`Observação: Longo demais ${ATAQUE("obsTriagem")}`) && liBento.textContent.includes(`Triada por Secretário Jonas ${ATAQUE("nomeSecretario")}`), "a descartada: critério, observação e quem triou, como texto");
    confere(botoes(env, "Voltar para a triagem", liBento).length === 1 && botoes(env, "Voltar para a triagem", liAna).length === 0, "'Voltar para a triagem' só na que já foi triada");
    const liAnon = liCom(env, "idvCicloDetalhe", "(removida a pedido do titular)");
    confere(!!liAnon && liAnon.textContent.includes("(sem o nome, a pedido do titular)") && botoes(env, "Finalista", liAnon).length === 0, "a anonimizada: sem ações");
    const carla = srv.S.S.carla;
    const sel = env.e(`idvCriterio_${carla.sugestaoId}`);
    confere(JSON.stringify(sel.options.map(o => o.value)) === '["","1","2","3"]' && sel.options[1].textContent.includes(ATAQUE("criterio1")), `os critérios do Art. 159 (o de código inválido fica fora): ${sel.options.map(o => o.value).join(",")}`);
    confere(env.e(`idvAjuste_${srv.S.S.ana1.sugestaoId}`).value === srv.S.S.ana1.texto, "o campo do ajuste começa com o texto (o ataque fica no valor, como texto)");
    confere(texto(env, "idvCicloDetalhe").includes("A votação abre sozinha em 22/11/2026"), "o aviso da triagem com a data da votação");
    limpo(env, "triagem", [ATAQUE("sugAna"), ATAQUE("obsTriagem"), ATAQUE("parecidoTema")]);
    // finalista com ajuste: 428 → confirmação reforçada → repete uma vez
    env.ctx.__fatorConfirmar = async () => { srv.S.fatorOk = true; return true; };
    digitar(env, `idvAjuste_${carla.sugestaoId}`, "  Fé que vence o mundo ");
    await clicar(env, botoes(env, "Finalista", liCom(env, "idvCicloDetalhe", "Fé que vence"))[0]);
    let ps = chamadas(env, "POST identidade-visual/triar");
    confere(ps.length === 2 && env.g("window.__fatorPedidos") === 1, `428: pede a confirmação reforçada uma vez e repete uma vez (${ps.length} POST, ${env.g("window.__fatorPedidos")} pedidos)`);
    confere(ps.every(x => JSON.stringify(x.corpo) === JSON.stringify({ sugestaoId: carla.sugestaoId, decisao: "FINALISTA", textoAjustado: "Fé que vence o mundo" })), `POST triar {sugestaoId, decisao, textoAjustado}: ${ps[0] && JSON.stringify(ps[0].corpo)}`);
    const liCarla = liCom(env, "idvCicloDetalhe", "Fé que vence");
    confere(carla.status === "FINALISTA" && liCarla.textContent.includes("Finalista") && liCarla.textContent.includes('Redação ajustada: "Fé que vence o mundo"') && cicloMsg(env).includes("Aprovada como finalista, com a redação ajustada"), "finalista: relê e mostra o ajuste; a mensagem fica");
    confere(texto(env, "idvCicloDetalhe").includes("1 finalista(s)"), "a contagem de finalistas sobe");
    // o fator recusado: uma chamada, a mensagem da confirmação
    srv.S.fatorOk = false; env.ctx.__fatorConfirmar = async () => false;
    const antes = chamadas(env, "POST identidade-visual/triar").length;
    await clicar(env, botoes(env, "Finalista", liCom(env, "idvCicloDetalhe", "Frutos que permanecem"))[0]);
    confere(chamadas(env, "POST identidade-visual/triar").length === antes + 1 && cicloMsg(env) === msgs(env).fator && srv.S.S.ana2.status === "ENVIADA", "fator recusado: uma chamada, a mensagem da confirmação, nada gravado");
    // descartar sem critério: recusa na tela; com critério e observação: POST sem 428
    await clicar(env, botoes(env, "Descartar", liCom(env, "idvCicloDetalhe", "Frutos que permanecem"))[0]);
    confere(chamadas(env, "POST identidade-visual/triar").length === antes + 1 && cicloMsg(env) === "Escolha o critério do descarte.", "descartar sem critério: o aviso, nenhum pedido");
    const ana2 = srv.S.S.ana2;
    escolher(env, `idvCriterio_${ana2.sugestaoId}`, "2"); digitar(env, `idvObs_${ana2.sugestaoId}`, " Não serve para Missões ");
    await clicar(env, botoes(env, "Descartar", liCom(env, "idvCicloDetalhe", "Frutos que permanecem"))[0]);
    let p = ultima(env, "POST identidade-visual/triar");
    confere(JSON.stringify(p.corpo) === JSON.stringify({ sugestaoId: ana2.sugestaoId, decisao: "DESCARTADA", criterio: 2, observacao: "Não serve para Missões" }) && ana2.status === "DESCARTADA", `POST triar DESCARTADA {criterio, observacao}: ${JSON.stringify(p.corpo)}`);
    // voltar para a triagem
    await clicar(env, botoes(env, "Voltar para a triagem", liCom(env, "idvCicloDetalhe", ATAQUE("sugBento")))[0]);
    p = ultima(env, "POST identidade-visual/triar");
    confere(JSON.stringify(p.corpo) === JSON.stringify({ sugestaoId: srv.S.S.bento.sugestaoId, decisao: "ENVIADA" }) && srv.S.S.bento.status === "ENVIADA", `POST triar ENVIADA: ${JSON.stringify(p.corpo)}`);
    // 422 da regra (o ajuste com < e >): a mensagem tal qual
    srv.S.fatorOk = true;
    await clicar(env, botoes(env, "Finalista", liCom(env, "idvCicloDetalhe", ATAQUE("sugAna")))[0]);
    confere(cicloMsg(env).includes(ATAQUE("msg422")) && /redação ajustada/.test(cicloMsg(env)) && srv.S.S.ana1.status === "ENVIADA", `422: a regra do servidor, como texto (${cicloMsg(env).slice(0, 80)})`);
    // duplo clique
    const r = env.retem(x => x.chave === "POST identidade-visual/triar");
    const b = botoes(env, "Finalista", liCom(env, "idvCicloDetalhe", "Frutos que permanecem"))[0];
    env.doc.clicar(b); await env.ocioso();
    confere(b.disabled === true && env.doc.clicar(b) === false, "o botão fica desabilitado enquanto a triagem grava");
    env.ev(`idvTriarAcao(${ana2.sugestaoId}, "FINALISTA", null)`); await env.ocioso();
    confere(env.toasts().some(x => x.includes("Aguarde")), "a mesma sugestão de novo: 'Aguarde'");
    const n = chamadas(env, "POST identidade-visual/triar").length;
    r.liberar(); await env.ocioso();
    confere(chamadas(env, "POST identidade-visual/triar").length === n, "nada a mais saiu");
    // decisão inventada ou id inválido: nada sai
    env.ev(`idvTriarAcao(${ana2.sugestaoId}, "APROVADA", null)`); env.ev('idvTriarAcao("x", "FINALISTA", null)'); await env.ocioso();
    confere(chamadas(env, "POST identidade-visual/triar").length === n, "decisão inventada ou id inválido: nenhum pedido");
    limpo(env, "atos da triagem", [ATAQUE("msg422")]);
  });

  cenario("Diretoria: votação — o botão de abrir só sem enquete na etapa, 428, 422 de poucos finalistas, aberta (sozinha ou à mão)", async () => {
    const srv = servidor({ hoje: "2026-11-25" });
    Object.assign(srv.S.S.ana2, { status: "FINALISTA" });
    const env = novo(srv);
    await abrirAba(env);
    const bv = botao(env, "Abrir a votação agora");
    confere(!!bv && texto(env, "idvCicloDetalhe").includes("A votação ainda não abriu"), "etapa da votação sem enquete: o aviso e o botão");
    confere(botoes(env, "Finalista", env.e("idvCicloDetalhe")).length > 0, "sem enquete, a triagem atrasada ainda pode ser feita");
    env.ctx.__fatorConfirmar = async () => { srv.S.fatorOk = true; return true; };
    let m = await clicarEResponder(env, bv, true);
    let ps = chamadas(env, "POST identidade-visual/abrir-votacao");
    confere(m.aberto && m.texto.includes("Depois disso a lista não muda mais") && ps.length === 2 && JSON.stringify(ps[1].corpo) === JSON.stringify({ cicloId: 7 }), `428 e repete: POST abrir-votacao {cicloId} (${ps.length})`);
    confere(cicloMsg(env).includes("pelo menos 2 finalistas") && cicloMsg(env).includes(ATAQUE("msg422")) && !!botao(env, "Abrir a votação agora"), "422 (só 1 finalista): a mensagem do servidor, o botão continua");
    Object.assign(srv.S.S.bento, { status: "FINALISTA" });
    await clicarEResponder(env, botao(env, "Abrir a votação agora"), true);
    const det = texto(env, "idvCicloDetalhe");
    confere(!!srv.S.C.enqueteId && cicloMsg(env).includes("Votação aberta com 2 finalistas") && !botao(env, "Abrir a votação agora"), "201: a votação aberta, o botão some");
    confere(det.includes("Aberta em Meu Painel até 30/11/2026. 0 pessoa(s) votaram.") && !det.includes("abriu sozinha") && botoes(env, "Finalista", env.e("idvCicloDetalhe")).length === 0, "aberta à mão: sem 'abriu sozinha' e sem as ações da triagem");
    confere(!det.includes("voto(s)"), "aberta: nenhuma contagem por tema (só quantos votaram)");
    // 409: a triagem depois que a votação abriu (outra aba ainda tinha o botão): a mensagem do servidor e relê o ciclo
    const leituras = chamadas(env, "GET identidade-visual/ciclo").length;
    env.ev(`idvTriarAcao(${srv.S.S.carla.sugestaoId}, "ENVIADA", null)`); await env.ocioso();
    confere(cicloMsg(env).includes("A votação já começou: a lista de finalistas não muda mais.") && cicloMsg(env).includes(ATAQUE("msg409")) && chamadas(env, "GET identidade-visual/ciclo").length === leituras + 1, "409: a mensagem do servidor e o ciclo relido");
    // aberta sozinha no dia 22
    const srv2 = servidor({ hoje: "2026-11-25" }); srv2.votacaoAberta(); srv2.votar(33, srv2.S.S.bento);
    const env2 = novo(srv2);
    await abrirAba(env2);
    confere(texto(env2, "idvCicloDetalhe").includes("1 pessoa(s) votaram (abriu sozinha no dia 22)") && !botao(env2, "Abrir a votação agora"), "aberta sozinha: o aviso, sem o botão");
    // fora da etapa da votação: sem o botão
    const srv3 = servidor({ hoje: "2026-11-18" });
    const env3 = novo(srv3);
    await abrirAba(env3);
    confere(!botao(env3, "Abrir a votação agora"), "na triagem: sem o botão de abrir a votação");
    limpo(env, "votação", [ATAQUE("msg422")]);
  });

  cenario("Diretoria: desempate — só os empatados, motivo, 428, o tema definido", async () => {
    const srv = servidor({ hoje: "2026-11-25" });
    Object.assign(srv.S.S.carla, { status: "FINALISTA" });
    srv.votacaoAberta();
    srv.votar(33, srv.S.S.bento); srv.votar(34, srv.S.S.ana2);
    srv.S.hoje = "2026-12-03";
    const env = novo(srv);
    await abrirAba(env);
    const det = texto(env, "idvCicloDetalhe");
    confere(srv.S.C.apuracao === "EMPATE" && det.includes("Empate: a Diretoria decide") && det.includes("Encerrada."), "apurada com empate: o aviso");
    confere(det.includes(`Luz do mundo ${ATAQUE("sugBento")}: 1 voto(s)`) && det.includes("Fé que vence: 0 voto(s)"), "encerrada: a contagem por tema");
    const sel = env.e("idvDesempateOpcao");
    confere(!!sel && JSON.stringify(sel.options.map(o => o.value).sort()) === JSON.stringify(["", String(srv.S.S.ana2.sugestaoId), String(srv.S.S.bento.sugestaoId)].sort()), `só os empatados no primeiro lugar (o de 0 voto fica fora): ${sel && sel.options.map(o => o.textContent.slice(0, 12)).join("|")}`);
    const definir = () => clicar(env, botao(env, "Definir o tema"));
    await definir();
    confere(cicloMsg(env) === "Escolha o tema." && posts(env).length === 0, "sem tema: o aviso, nenhum pedido");
    escolher(env, "idvDesempateOpcao", String(srv.S.S.bento.sugestaoId)); digitar(env, "idvDesempateMotivo", "ata");
    await definir();
    confere(cicloMsg(env).includes("Escreva por quê") && posts(env).length === 0, "motivo com menos de 5 letras: o aviso, nenhum pedido");
    digitar(env, "idvDesempateMotivo", "Reunião da Diretoria de 02/12, ata 15");
    env.ctx.__fatorConfirmar = async () => { srv.S.fatorOk = true; return true; };
    await definir();
    const ps = chamadas(env, "POST identidade-visual/desempate");
    confere(ps.length === 2 && JSON.stringify(ps[1].corpo) === JSON.stringify({ sugestaoId: srv.S.S.bento.sugestaoId, motivo: "Reunião da Diretoria de 02/12, ata 15" }), `428 e repete: POST desempate {sugestaoId, motivo}: ${ps[1] && JSON.stringify(ps[1].corpo)}`);
    const det2 = texto(env, "idvCicloDetalhe");
    confere(det2.includes(`Tema de 2027: Luz do mundo ${ATAQUE("sugBento")} — definido pela Diretoria (Reunião da Diretoria de 02/12, ata 15 ${ATAQUE("desempateMotivo")})`) && !env.e("idvDesempateOpcao"), "o tema definido, com o motivo; o formulário some");
    confere(cicloMsg(env).includes("Tema definido pela Diretoria"), "a mensagem do servidor");
    limpo(env, "desempate", [ATAQUE("sugBento")]);
  });

  cenario("Diretoria: cores (registrar em maiúsculas, apagar, cor ruim do servidor) e artes (Ver, tirar do concurso com motivo)", async () => {
    const srv = servidor({ hoje: "2026-12-10" });
    srv.votacaoAberta(); srv.votar(33, srv.S.S.bento);
    srv.S.cores.push({ corId: 401, cicloId: 7, ordem: 1, nome: srv.A("corNome", "Azul royal"), hex: "#1A4D8F" }, { corId: 402, cicloId: 7, ordem: 2, nome: srv.A("corRuim", "Cor quebrada"), hex: "javascript:alert(1)" });
    const env = novo(srv);
    await abrirAba(env);
    const det = env.e("idvCicloDetalhe");
    const estilos = desc(env, det).filter(x => x.hasAttribute("style")).map(x => x.getAttribute("style"));
    confere(estilos.length === 1 && estilos[0] === "background:#1A4D8F", `gestão: só a cor conferida entra no estilo (${JSON.stringify(estilos)})`);
    confere(!!env.e("idvCorHex") && env.e("idvCorHex").type === "color" && JSON.stringify(env.e("idvCorOrdem").options.map(o => o.value)) === '["1","2","3"]', "o formulário da cor: posição 1 a 3 e o seletor de cor");
    // registrar: o hex vai em maiúsculas
    escolher(env, "idvCorOrdem", "3"); digitar(env, "idvCorNome", "Branco gelo"); digitar(env, "idvCorHex", "#f0f4f8");
    await clicar(env, botao(env, "Registrar a cor"));
    let p = ultima(env, "POST identidade-visual/cor");
    confere(!!p && JSON.stringify(p.corpo) === JSON.stringify({ cicloId: 7, ordem: 3, nome: "Branco gelo", hex: "#F0F4F8" }), `POST cor {cicloId, ordem, nome, hex em maiúsculas}: ${p && JSON.stringify(p.corpo)}`);
    confere(cicloMsg(env).includes("Cor 3 registrada.") && desc(env, env.e("idvCicloDetalhe")).some(x => x.getAttribute("style") === "background:#F0F4F8"), "relê e a cor nova aparece");
    // cor inválida no campo: recusa na tela
    const n = posts(env).length;
    digitar(env, "idvCorHex", "azul");
    await clicar(env, botao(env, "Registrar a cor"));
    confere(posts(env).length === n && cicloMsg(env) === "Escolha a cor.", "cor que não é #RRGGBB: o aviso, nenhum pedido");
    // nome vazio: o servidor recusa (422) e a mensagem aparece
    digitar(env, "idvCorHex", "#00AA00"); digitar(env, "idvCorNome", "");
    await clicar(env, botao(env, "Registrar a cor"));
    confere(cicloMsg(env).includes("Escreva o nome da cor") && cicloMsg(env).includes(ATAQUE("msg422")), "nome vazio: a regra do servidor");
    // apagar
    let m = await clicarEResponder(env, botoes(env, "Apagar", liCom(env, "idvCicloDetalhe", ATAQUE("corNome")))[0], true);
    p = ultima(env, "POST identidade-visual/excluir-cor");
    confere(m.aberto && m.texto.includes("Apagar esta cor?") && !!p && JSON.stringify(p.corpo) === JSON.stringify({ corId: 401 }) && cicloMsg(env).includes("Cor apagada."), `POST excluir-cor {corId}: ${p && JSON.stringify(p.corpo)}`);
    limpo(env, "cores", [ATAQUE("corRuim").slice(0, 0) || "Cor quebrada", ATAQUE("msgCor")]);
    // artes: autor, congregação, título, descrição, motivo como texto
    const a1 = srv.novaArte({ membroId: 33, titulo: srv.A("arteTitulo", "Raízes em azul"), descricao: srv.A("arteDesc", "Com a cruz ao centro") });
    const a2 = srv.novaArte({ membroId: 31, status: "RECUSADA", motivoRecusa: srv.A("motivoRecusa", "Ilegível") });
    await clicar(env, desc(env, env.e("idvPainelTopo")).find(x => x.localName === "button" && x.textContent.startsWith("2027")));
    const liA1 = liCom(env, "idvCicloDetalhe", ATAQUE("arteTitulo"));
    confere(!!liA1 && liA1.textContent.includes(`Bento Artista ${ATAQUE("nomeBento")}`) && liA1.textContent.includes(`(Central ${ATAQUE("congCentral")})`) && liA1.textContent.includes(ATAQUE("arteDesc")) && liA1.textContent.includes("No concurso"), "a arte com o autor, a congregação e a descrição, como texto");
    const liA2 = liCom(env, "idvCicloDetalhe", ATAQUE("motivoRecusa"));
    confere(!!liA2 && liA2.textContent.includes("Fora do concurso") && liA2.textContent.includes("Sem título") && botoes(env, "Tirar do concurso", liA2).length === 0, "a recusada: o motivo, sem 'Tirar do concurso'");
    confere(texto(env, "idvCicloDetalhe").includes("Artes do concurso (2)"), "o número de artes");
    await clicar(env, botoes(env, "Ver a imagem", liA1)[0]);
    const img = desc(env, env.e(`idvImg_${a1.arteId}`)).find(x => x.localName === "img");
    confere(!!img && img.getAttribute("src") === URL_IMAGEM(a1.arteId) && ultima(env, "GET identidade-visual/imagem").consulta.arteId === String(a1.arteId), "Ver a imagem: GET imagem?arteId e a imagem pela urlSegura");
    srv.S.urlImagem = () => "javascript:window.__xss('urlGestao')";
    await clicar(env, botoes(env, "Ver a imagem", liCom(env, "idvCicloDetalhe", ATAQUE("arteTitulo")))[0]);
    confere(desc(env, env.e(`idvImg_${a1.arteId}`)).find(x => x.localName === "img").getAttribute("src") === "#", "gestão: endereço javascript: vira '#'");
    srv.S.urlImagem = URL_IMAGEM;
    // tirar do concurso: motivo curto recusado na tela; com motivo: confirmação e POST
    digitar(env, `idvMotivo_${a1.arteId}`, "x");
    await clicar(env, botoes(env, "Tirar do concurso", liCom(env, "idvCicloDetalhe", ATAQUE("arteTitulo")))[0]);
    confere(cicloMsg(env).includes("Escreva o motivo") && chamadas(env, "POST identidade-visual/recusar-arte").length === 0 && env.e("modalOverlay").classList.contains("escondido"), "motivo curto: o aviso, sem confirmação e sem pedido");
    digitar(env, `idvMotivo_${a1.arteId}`, " Cores fora do tecido ");
    m = await clicarEResponder(env, botoes(env, "Tirar do concurso", liCom(env, "idvCicloDetalhe", ATAQUE("arteTitulo")))[0], true);
    p = ultima(env, "POST identidade-visual/recusar-arte");
    confere(m.aberto && m.texto.includes("não se desfaz") && !!p && JSON.stringify(p.corpo) === JSON.stringify({ arteId: a1.arteId, motivo: "Cores fora do tecido" }) && a1.status === "RECUSADA", `POST recusar-arte {arteId, motivo}: ${p && JSON.stringify(p.corpo)}`);
    confere(liCom(env, "idvCicloDetalhe", ATAQUE("arteTitulo")).textContent.includes("Motivo: Cores fora do tecido"), "relê: o motivo aparece");
    // depois da primeira arte, a cor não se apaga: a regra do servidor
    srv.novaArte({ membroId: 34, titulo: "Outra" });
    await clicar(env, desc(env, env.e("idvPainelTopo")).find(x => x.localName === "button" && x.textContent.startsWith("2027")));
    await clicarEResponder(env, botoes(env, "Apagar", liCom(env, "idvCicloDetalhe", "Branco gelo"))[0], true);
    confere(cicloMsg(env).includes("As cores não mudam depois que chegou a primeira arte"), "422: a cor não muda depois da primeira arte");
    limpo(env, "artes", [ATAQUE("arteTitulo"), ATAQUE("nomeBento"), ATAQUE("arteDesc"), ATAQUE("motivoRecusa")]);
    void a2;
  });

  cenario("Diretoria: o resultado do culto — campos obrigatórios na tela, 428, 201, a escolha registrada", async () => {
    const srv = servidor({ hoje: "2026-12-20" });
    srv.votacaoAberta(); srv.votar(33, srv.S.S.bento);
    srv.S.cores.push({ corId: 401, cicloId: 7, ordem: 1, nome: srv.A("corNome", "Azul royal"), hex: "#1A4D8F" });
    const a1 = srv.novaArte({ membroId: 33, titulo: srv.A("arteTitulo", "Raízes em azul") });
    srv.novaArte({ membroId: 31, titulo: "Recusada", status: "RECUSADA", motivoRecusa: "x" });
    const env = novo(srv);
    await abrirAba(env);
    confere(texto(env, "idvCicloDetalhe").includes("Registrar a escolha final do culto"), "na arte, com o tema definido: o formulário do resultado");
    confere(JSON.stringify(env.e("idvResArte").options.map(o => o.value)) === JSON.stringify(["", String(a1.arteId)]) && env.e("idvResArte").options[1].textContent.includes(ATAQUE("nomeBento")), "só as artes no concurso, com o autor como texto");
    confere(JSON.stringify(env.e("idvResCor").options.map(o => o.value)) === '["","401"]', "as cores registradas");
    confere(JSON.stringify(env.e("idvResOcasiao").options.map(o => o.value)) === '["CULTO_ADMINISTRATIVO","VIGILIA"]', `as ocasiões do catálogo (a de código inválido fica fora): ${env.e("idvResOcasiao").options.map(o => o.value.slice(0, 20)).join(",")}`);
    limpo(env, "formulário do resultado", [ATAQUE("ocasiaoCULTO_ADMINISTRATIVO")]);
    const registrar = () => clicar(env, botao(env, "Registrar o resultado"));
    await registrar();
    confere(cicloMsg(env) === "Escolha a arte e a cor." && posts(env).length === 0, "sem arte e cor: o aviso");
    escolher(env, "idvResArte", String(a1.arteId)); escolher(env, "idvResCor", "401");
    await registrar();
    confere(cicloMsg(env) === "Informe a data do culto." && posts(env).length === 0, "sem data: o aviso");
    digitar(env, "idvResData", "2026-12-13");
    await registrar();
    confere(cicloMsg(env).includes("quantos votos") && posts(env).length === 0, "sem votos: o aviso");
    digitar(env, "idvResVotos", "150"); digitar(env, "idvResPresentes", "320"); escolher(env, "idvResOcasiao", "VIGILIA"); digitar(env, "idvResAta", " Ata 14/2026 ");
    let m = await clicarEResponder(env, botao(env, "Registrar o resultado"), false);
    confere(m.aberto && m.texto.includes("não se edita") && posts(env).length === 0, "confirmação; cancelar não registra");
    env.ctx.__fatorConfirmar = async () => { srv.S.fatorOk = true; return true; };
    m = await clicarEResponder(env, botao(env, "Registrar o resultado"), true);
    const ps = chamadas(env, "POST identidade-visual/resultado");
    const esperado = { cicloId: 7, arteId: a1.arteId, corId: 401, dataCulto: "2026-12-13", ocasiao: "VIGILIA", votosVencedor: 150, presentes: 320, ata: "Ata 14/2026" };
    confere(ps.length === 2 && JSON.stringify(ps[1].corpo) === JSON.stringify(esperado), `428 e repete: POST resultado: ${ps[1] && JSON.stringify(ps[1].corpo)}`);
    confere(!iv.validarResultado(ps[1].corpo, { anoAlvo: 2027, hoje: "2026-12-20" }).problema, "o corpo passa na regra de verdade do servidor");
    const det = texto(env, "idvCicloDetalhe");
    confere(!!srv.S.C.resultado && det.includes("Escolha final registrada") && det.includes("Ata: Ata 14/2026.") && det.includes("150 voto(s) de 320 presentes") && !det.includes("Registrar a escolha final"), "201: a escolha registrada e o formulário some");
    confere(cicloMsg(env).includes("Resultado registrado"), "a mensagem do servidor");
    // presentes vazio e ata vazia: não vão
    const srv2 = servidor({ hoje: "2026-12-20" });
    srv2.votacaoAberta(); srv2.votar(33, srv2.S.S.bento);
    srv2.S.cores.push({ corId: 401, cicloId: 7, ordem: 1, nome: "Azul", hex: "#1A4D8F" });
    const b1 = srv2.novaArte({ membroId: 33, titulo: "A" });
    srv2.S.fatorOk = true;
    const env2 = novo(srv2);
    await abrirAba(env2);
    escolher(env2, "idvResArte", String(b1.arteId)); escolher(env2, "idvResCor", "401"); digitar(env2, "idvResData", "2026-12-25"); digitar(env2, "idvResVotos", "10");
    await clicarEResponder(env2, botao(env2, "Registrar o resultado"), true);
    const p2 = ultima(env2, "POST identidade-visual/resultado");
    confere(JSON.stringify(p2.corpo) === JSON.stringify({ cicloId: 7, arteId: b1.arteId, corId: 401, dataCulto: "2026-12-25", ocasiao: "CULTO_ADMINISTRATIVO", votosVencedor: 10 }), `sem presentes e ata: não vão no corpo (${JSON.stringify(p2.corpo)})`);
    confere(cicloMsg(env2).includes("não pode ser no futuro"), "data no futuro: a regra do servidor");
    limpo(env, "resultado", [ATAQUE("msgResultado")]);
  });

  cenario("Diretoria: Temas já usados — lista, MANUAL editável, PROCESSO só leitura, cadastrar, corrigir, apagar", async () => {
    const srv = servidor({ comAntigo: true, hoje: "2026-11-18" });
    const env = novo(srv);
    await abrirAba(env);
    await clicar(env, env.e("btnIdvSecaoTemas"));
    confere(visivel(env, "idvSecaoTemas") && !visivel(env, "idvSecaoCiclo") && env.e("btnIdvSecaoTemas").getAttribute("aria-pressed") === "true" && env.e("btnIdvSecaoCiclo").getAttribute("aria-pressed") === "false", "a pílula Temas abre a seção e marca aria-pressed");
    confere(chamadas(env, "GET identidade-visual/temas").length === 1, "GET temas");
    const lis = desc(env, env.e("idvTemasLista")).filter(x => x.localName === "li");
    confere(lis.length === 4, `4 temas: ${lis.length}`);
    const proc = lis.find(x => x.textContent.includes("2026"));
    confere(!!proc && proc.textContent.includes("escolhido pelo processo no sistema; não se edita") && !desc(env, proc).some(x => x.localName === "input" || x.localName === "button"), "o tema do processo: só leitura");
    const t19 = srv.S.T.t2019;
    confere(env.e(`idvTemaAno_${t19.temaUsadoId}`).value === "2019" && env.e(`idvTemaTexto_${t19.temaUsadoId}`).value === t19.tema, "o manual: ano e tema nos campos (o ataque fica no valor, como texto)");
    limpo(env, "temas");
    // cadastrar: vazio recusado na tela; certo vai e relê
    await clicar(env, botao(env, "Cadastrar"));
    confere(texto(env, "idvTemasMsg") === "Informe o ano e o tema." && posts(env).length === 0, "vazio: o aviso");
    digitar(env, "idvTemaAno", "2018"); digitar(env, "idvTemaTexto", " Igreja que ora ");
    await clicar(env, botao(env, "Cadastrar"));
    let p = ultima(env, "POST identidade-visual/tema");
    confere(!!p && JSON.stringify(p.corpo) === JSON.stringify({ ano: 2018, tema: "Igreja que ora" }), `POST tema {ano, tema}: ${p && JSON.stringify(p.corpo)}`);
    confere(texto(env, "idvTemasMsg").includes("Tema de 2018 cadastrado.") && texto(env, "idvTemasLista").includes("2018") === false && desc(env, env.e("idvTemasLista")).filter(x => x.localName === "li").length === 5 && env.e("idvTemaAno").value === "", "cadastrado: relê, 5 na lista, o formulário limpo");
    // o ano repetido: a regra do servidor
    digitar(env, "idvTemaAno", "2020"); digitar(env, "idvTemaTexto", "Outro");
    await clicar(env, botao(env, "Cadastrar"));
    confere(texto(env, "idvTemasMsg").includes("Já há um tema cadastrado para 2020") && env.e("idvTemaTexto").value === "Outro", "ano repetido: 422 e o que foi digitado fica");
    // corrigir
    const t20 = srv.S.T.t2020;
    digitar(env, `idvTemaTexto_${t20.temaUsadoId}`, "Avante, Igreja de Cristo!");
    await clicar(env, botoes(env, "Salvar", desc(env, env.e("idvTemasLista")).find(x => x.localName === "li" && desc(env, x).some(y => y.id === `idvTemaTexto_${t20.temaUsadoId}`)))[0]);
    p = ultima(env, "POST identidade-visual/tema");
    confere(JSON.stringify(p.corpo) === JSON.stringify({ temaUsadoId: t20.temaUsadoId, ano: 2020, tema: "Avante, Igreja de Cristo!" }) && t20.tema === "Avante, Igreja de Cristo!", `POST tema {temaUsadoId, ano, tema}: ${JSON.stringify(p.corpo)}`);
    confere(texto(env, "idvTemasMsg").includes("Tema de 2020 corrigido."), "corrigido: a mensagem");
    // salvar o de 2019 sem mexer (o texto tem < e >): a regra do servidor recusa e a tela mostra
    await clicar(env, botoes(env, "Salvar", desc(env, env.e("idvTemasLista")).find(x => x.localName === "li" && desc(env, x).some(y => y.id === `idvTemaTexto_${t19.temaUsadoId}`)))[0]);
    confere(texto(env, "idvTemasMsg").includes("não pode ter os sinais < e >"), "422: a regra do servidor");
    // apagar
    const liT20 = () => desc(env, env.e("idvTemasLista")).find(x => x.localName === "li" && desc(env, x).some(y => y.id === `idvTemaTexto_${t20.temaUsadoId}`));
    let m = await clicarEResponder(env, botoes(env, "Apagar", liT20())[0], false);
    confere(m.aberto && m.texto.includes("Apagar este tema") && chamadas(env, "POST identidade-visual/excluir-tema").length === 0, "apagar pede confirmação; cancelar não apaga");
    await clicarEResponder(env, botoes(env, "Apagar", liT20())[0], true);
    p = ultima(env, "POST identidade-visual/excluir-tema");
    confere(!!p && JSON.stringify(p.corpo) === JSON.stringify({ temaUsadoId: t20.temaUsadoId }) && !liT20() && texto(env, "idvTemasMsg").includes("Tema de 2020 apagado da lista."), `POST excluir-tema {temaUsadoId}: ${p && JSON.stringify(p.corpo)}`);
    // de volta ao ciclo
    await clicar(env, env.e("btnIdvSecaoCiclo"));
    confere(visivel(env, "idvSecaoCiclo") && !visivel(env, "idvSecaoTemas") && chamadas(env, "GET identidade-visual/painel").length === 2, "a pílula Ciclo volta e relê o painel");
    // lista vazia
    const srv2 = servidor({ hoje: "2026-11-18" }); srv2.S.temas = [];
    const env2 = novo(srv2);
    await abrirAba(env2);
    await clicar(env2, env2.e("btnIdvSecaoTemas"));
    confere(texto(env2, "idvTemasLista").includes("Nenhum tema cadastrado.") && !!env2.e("idvTemaAno"), "nenhum tema: a frase e o formulário");
    limpo(env, "atos dos temas", [ATAQUE("msgTemaNovo")]);
  });

  // ============================================================================================================================================
  // 4) O "FECHA SOZINHA EM" DO FORMULÁRIO DE ENQUETE (aba Enquetes)
  // ============================================================================================================================================
  cenario("Enquete da liderança: 'Fecha sozinha em' vai no corpo, limpa depois, e aparece na lista", async () => {
    const srv = servidor({ hoje: "2026-11-05" });
    const env = novo(srv);
    env.sessao({ matricula: 13, token: "geral" });
    const preencher = () => {
      digitar(env, "enqueteTitulo", "Data do retiro");
      env.ev("adicionarBlocoPerguntaEnquete()");
      const id = env.g("contadorBlocoPerguntaEnquete");
      digitar(env, `perguntaTitulo_${id}`, "Qual mês?"); digitar(env, `perguntaOpcoes_${id}`, "Janeiro\nFevereiro");
    };
    preencher();
    digitar(env, "enqueteFechamento", "2026-11-30T23:59");
    env.ev("salvarEnquete()"); await env.ocioso();
    let p = ultima(env, "POST enquetes");
    confere(!!p && p.corpo.dataFechamentoPrevista === "2026-11-30T23:59" && p.corpo.titulo === "Data do retiro", `POST enquetes com dataFechamentoPrevista: ${p && JSON.stringify(p.corpo).slice(0, 200)}`);
    confere(env.e("enqueteFechamento").value === "", "criada: o campo do fechamento limpa");
    const criada = srv.S.enquetes[srv.S.enquetes.length - 1];
    confere(criada.dataFechamentoPrevista === "2026-12-01T02:59:00", "o servidor guarda em UTC (23:59 de Brasília = 02:59 UTC)");
    confere(texto(env, "resultadoListaEnquetes").includes("Fecha sozinha em 30/11/2026 23:59"), `a lista mostra 'Fecha sozinha em' na hora de Brasília (${(texto(env, "resultadoListaEnquetes").match(/Fecha sozinha em [^·]*/) || [""])[0]})`);
    // sem data: a chave nem vai
    preencher();
    env.ev("salvarEnquete()"); await env.ocioso();
    p = ultima(env, "POST enquetes");
    confere(!!p && !("dataFechamentoPrevista" in p.corpo), "sem data: dataFechamentoPrevista não vai no corpo");
    limpo(env, "enquete da liderança", [ATAQUE("enqTitulo")]);
  });

  // ============================================================================================================================================
  // 5) SAIR, TROCAR DE LOGIN, RESPOSTAS ATRASADAS, PRAZO, 401 E 403
  // ============================================================================================================================================
  cenario("Sair da sessão, trocar de login, sair da aba e da sub-aba: nada fica na página", async () => {
    // Meu Painel cheio (sugestões) e a aba da Diretoria cheia (artes com o autor)
    const srv = servidor({ hoje: "2026-12-10" });
    srv.votacaoAberta(); srv.votar(33, srv.S.S.bento);
    srv.S.cores.push({ corId: 401, cicloId: 7, ordem: 1, nome: "Azul", hex: "#1A4D8F" });
    srv.novaArte({ membroId: 33, titulo: "Minha arte do Bento" });
    srv.S.sessoes.geral.membroId = 31;   // a Ana também é da Diretoria nesta sessão: vê as suas sugestões e a aba
    const env = novo(srv);
    await abrirMeu(env, "geral", 31);
    confere(texto(env, "idvMeuConteudo").includes("Frutos que permanecem"), "Meu Painel carregado");
    await abrirAba(env, "geral", 31);
    confere(texto(env, "idvMeuConteudo") === "" && env.g("idvMeu") === null, "ir para a aba da Diretoria limpa Meu Painel → Identidade Visual");
    confere(texto(env, "idvCicloDetalhe").includes("Bento Artista") && texto(env, "idvCicloDetalhe").includes("Luz do mundo"), "a aba com sugestões e autores na tela");
    env.ev("limparSessao()"); await env.ocioso();
    for (const id of ["idvPainelTopo", "idvCicloDetalhe", "idvTemasForm", "idvTemasLista", "idvMeuConteudo", "enqMeuLista"]) confere(env.e(id).innerHTML === "", `sair da sessão: ${id} vazio`);
    for (const id of ["idvGesMsg", "idvCicloMsg", "idvTemasMsg", "idvMeuMsg", "enqMeuMsg"]) confere(texto(env, id) === "", `sair da sessão: ${id} sem texto`);
    semSensiveis(env, "sair da sessão");
    confere(env.g("idvCat") === null && env.g("idvPainel") === null && env.g("idvDetalhe") === null && env.g("idvCicloSel") === null, "sair da sessão: a memória do módulo esvazia");
    confere(visivel(env, "idvSecaoCiclo") && !visivel(env, "idvSecaoTemas") && !visivel(env, "idvSemAcesso"), "sair da sessão: volta à seção Ciclo, sem o aviso de sem acesso");
    // a próxima pessoa começa do zero e pede com o próprio token
    await abrirAba(env, "geral2", 14);
    confere(ultima(env, "GET identidade-visual/catalogos").token === "geral2", "a próxima pessoa pede o catálogo de novo, com o próprio token");
    // trocar de login sem passar pela saída (sessão nova por cima): o dono mudou, a tela é limpa antes de qualquer resposta
    const env2 = novo(srv);
    await abrirAba(env2, "geral", 13);
    const r = env2.retem(x => x.chave === "GET identidade-visual/painel");
    await abrirAba(env2, "geral2", 14);
    confere(texto(env2, "idvCicloDetalhe") === "" && texto(env2, "idvPainelTopo") === "", "trocou o dono: o que era da pessoa anterior saiu antes da resposta do servidor");
    r.liberar(); await env2.ocioso();
    confere(env2.g("idvChaveDoDono()") === "14|senha", "o dono leva a matrícula e o tipo da sessão");
    // de senha para PIN (mesma matrícula) também é outro dono
    const env2b = novo(srv);
    await abrirMeu(env2b, "pin", 31);
    const donoPin = env2b.g("idvDono");
    confere(donoPin === "31|pin", `o dono do PIN: ${donoPin}`);
    // sair da sessão com Meu Painel → Identidade Visual aberto (sem passar antes pela aba da Diretoria)
    const env2c = novo(srv);
    await abrirMeu(env2c, "pin", 31);
    confere(texto(env2c, "idvMeuConteudo").includes("Frutos que permanecem"), "Meu Painel aberto com as sugestões da Ana");
    env2c.ev("limparSessao()"); await env2c.ocioso();
    confere(env2c.e("idvMeuConteudo").innerHTML === "" && env2c.g("idvMeu") === null, "sair da sessão com Meu Painel aberto: as sugestões saem da página e da memória");
    semSensiveis(env2c, "sair da sessão com Meu Painel aberto");
    // sair da aba
    const env3 = novo(srv);
    await abrirAba(env3, "geral", 13);
    env3.ev('mostrarAbaSecretaria("meupainel")'); await env3.ocioso();
    for (const id of ["idvPainelTopo", "idvCicloDetalhe"]) confere(env3.e(id).innerHTML === "", `sair da aba: ${id} vazio`);
    confere(env3.g("idvDetalhe") === null && env3.g("idvPainel") === null, "sair da aba esquece o painel e o ciclo");
    // sair da sub-aba
    const env4 = novo(srv);
    await abrirMeu(env4);
    confere(texto(env4, "idvMeuConteudo").includes("Frutos que permanecem"), "sugestões na tela");
    env4.ev('mostrarSubAbaMeupainel("perfil")'); await env4.ocioso();
    confere(texto(env4, "idvMeuConteudo") === "" && env4.g("idvMeu") === null, "sair da sub-aba limpa as sugestões, o voto e as artes");
    semSensiveis(env4, "sair da sub-aba");
    env4.ev('mostrarSubAbaMeupainel("identidade")'); await env4.ocioso();
    env4.ev('mostrarAbaSecretaria("documentos")'); await env4.ocioso();
    confere(texto(env4, "idvMeuConteudo") === "", "ir para outra aba também");
    // voltar para a Portaria
    const env5 = novo(srv);
    await abrirAba(env5, "geral", 13);
    env5.ev('idvAbaMudou("portaria")'); await env5.ocioso();
    confere(texto(env5, "idvCicloDetalhe") === "", "voltar para a Portaria limpa a aba");
  });

  cenario("A imagem que chega depois que a pessoa mudou não aparece na tela da próxima", async () => {
    const srv = servidor({ hoje: "2026-12-10" });
    srv.votacaoAberta(); srv.votar(33, srv.S.S.bento);
    srv.S.cores.push({ corId: 401, cicloId: 7, ordem: 1, nome: "Azul", hex: "#1A4D8F" });
    const a1 = srv.novaArte({ membroId: 33, titulo: "Arte atrasada" });
    const env = novo(srv);
    await abrirAba(env, "geral", 13);
    const li = liCom(env, "idvCicloDetalhe", "Arte atrasada");
    confere(!!li && botoes(env, "Ver a imagem", li).length === 1, "a arte com 'Ver a imagem'");
    const r = env.retem(x => x.chave === "GET identidade-visual/imagem");
    env.doc.clicar(botoes(env, "Ver a imagem", li)[0]); await env.ocioso();
    // outra pessoa da Diretoria entra (sessão nova por cima) e abre o mesmo ciclo: o lugar da imagem existe de novo
    await abrirAba(env, "geral2", 14);
    confere(!!env.e(`idvImg_${a1.arteId}`), "a próxima pessoa vê a mesma lista (o lugar da imagem existe de novo)");
    r.liberar(); await env.ocioso();
    confere(!desc(env, env.e(`idvImg_${a1.arteId}`)).some(x => x.localName === "img") && texto(env, `idvImg_${a1.arteId}`) === "", "a resposta atrasada da pessoa anterior é descartada: nenhuma imagem aparece sozinha");
  });

  cenario("Respostas atrasadas não repintam depois de sair; o prazo de 20 s; 401; 403", async () => {
    const srv = servidor({ hoje: "2026-11-18" });
    // Meu Painel atrasado: saiu da sub-aba
    let env = novo(srv);
    let r = env.retem(x => x.chave === "GET identidade-visual/meu");
    await abrirMeu(env);
    env.ev('mostrarSubAbaMeupainel("perfil")'); await env.ocioso();
    r.liberar(); await env.ocioso();
    confere(texto(env, "idvMeuConteudo") === "" && env.g("idvMeu") === null, "o Meu Painel que chega depois de sair da sub-aba não é pintado");
    // Meu Painel atrasado: trocou de login (a próxima pessoa abre a mesma sub-aba)
    env = novo(srv);
    r = env.retem(x => x.chave === "GET identidade-visual/meu" && x.token === "pin");
    await abrirMeu(env);
    env.ev("limparSessao()"); await abrirMeu(env, "pin3", 33);
    r.liberar(); await env.ocioso();
    confere(!texto(env, "idvMeuConteudo").includes("Frutos que permanecem") && texto(env, "idvMeuConteudo").includes("Luz do mundo"), "o Meu Painel da pessoa anterior que chega atrasado não aparece para a próxima");
    // o ato atrasado: retirou e saiu da sub-aba
    const srvS = servidor({ hoje: "2026-11-05" });
    env = novo(srvS);
    await abrirMeu(env);
    r = env.retem(x => x.chave === "POST identidade-visual/retirar-sugestao");
    env.doc.clicar(botoes(env, "Retirar", liCom(env, "idvMeuConteudo", "Frutos que permanecem"))[0]); await env.responderModal(true); await env.ocioso();
    env.ev('mostrarSubAbaMeupainel("perfil")'); await env.ocioso();
    r.liberar(); await env.ocioso();
    confere(texto(env, "idvMeuConteudo") === "" && texto(env, "idvMeuMsg") === "" && env.toasts().length === 0, "o ato que termina depois de sair da sub-aba não pinta nem avisa");
    // painel atrasado: saiu da aba
    env = novo(srv);
    r = env.retem(x => x.chave === "GET identidade-visual/painel");
    await abrirAba(env);
    env.ev('mostrarAbaSecretaria("meupainel")'); await env.ocioso();
    r.liberar(); await env.ocioso();
    confere(texto(env, "idvPainelTopo") === "" && chamadas(env, "GET identidade-visual/ciclo").length === 0, "o painel que chega depois de sair da aba não é pintado nem abre o ciclo");
    // ciclo atrasado: pediu outro depois (o último vence)
    const srv2 = servidor({ comAntigo: true, hoje: "2026-11-18" });
    env = novo(srv2);
    await abrirAba(env);
    r = env.retem(x => x.chave === "GET identidade-visual/ciclo" && x.consulta.cicloId === "6");
    env.ev("idvCarregarCicloAcao(6)"); await env.ocioso();
    env.ev("idvCarregarCicloAcao(7)"); await env.ocioso();
    r.liberar(); await env.ocioso();
    confere(texto(env, "idvCicloDetalhe").includes("Sugestões (") && !texto(env, "idvCicloDetalhe").includes("Escolha final registrada"), "o ciclo pedido por último é o que fica");
    // catálogo atrasado: saiu da sessão
    env = novo(srv);
    r = env.retem(x => x.chave === "GET identidade-visual/catalogos");
    await abrirAba(env);
    env.ev("limparSessao()"); await env.ocioso();
    r.liberar(); await env.ocioso();
    confere(texto(env, "idvPainelTopo") === "" && chamadas(env, "GET identidade-visual/painel").length === 0 && env.g("idvCat") === null, "o catálogo que chega depois da saída não abre a aba nem fica guardado");
    // a imagem atrasada: trocou de tela
    const srv3 = servidor({ comCiclo: false, comAntigo: true, hoje: "2026-10-23" });
    env = novo(srv3);
    r = env.retem(x => x.chave === "GET identidade-visual/imagem");
    await abrirMeu(env);
    env.ev('mostrarSubAbaMeupainel("perfil")'); await env.ocioso();
    r.liberar(); await env.ocioso();
    confere(!desc(env).some(x => x.localName === "img" && x.className === "idv-arte-img"), "a imagem que chega depois de sair não é pintada");
    // prazo de 20 s: o painel
    env = novo(srv);
    r = env.retem(x => x.chave === "GET identidade-visual/painel");
    await abrirAba(env);
    confere(env.dispararTemporizador(20000) >= 1, "o painel tem o prazo de 20 s");
    await env.ocioso();
    confere(cicloMsg(env) === msgs(env).tempo, `prazo esgotado: a mensagem no lugar (${cicloMsg(env).slice(0, 60)})`);
    r.liberar(); await env.ocioso();
    // prazo de 20 s: um ato da Diretoria
    env = novo(srv);
    await abrirAba(env);
    r = env.retem(x => x.chave === "POST identidade-visual/triar");
    escolher(env, `idvCriterio_${srv.S.S.carla.sugestaoId}`, "1");
    const b = botoes(env, "Descartar", liCom(env, "idvCicloDetalhe", "Fé que vence"))[0];
    env.doc.clicar(b); await env.ocioso();
    env.dispararTemporizador(20000); await env.ocioso();
    confere(cicloMsg(env) === msgs(env).tempo, "ato sem resposta em 20 s: a mensagem de tempo");
    r.liberar(); await env.ocioso();
    confere(env.api.chamadas.every(c => c.comPrazo && c.comToken), "toda chamada da aba leva o prazo e o token");
    // 401: a sessão sai e a tela fica limpa
    env = novo(srv);
    await abrirAba(env);
    env.api.rotas["GET identidade-visual/temas"] = { status: 401, corpo: { sucesso: false, mensagem: "Sua sessão foi encerrada. Entre novamente." } };
    await clicar(env, env.e("btnIdvSecaoTemas"));
    confere(env.g("authToken") === null && env.g("window.__telaInicial") === 1 && texto(env, "idvCicloDetalhe") === "" && texto(env, "idvTemasLista") === "", "401: sai da sessão e nada fica na tela");
    // 403 num ato: um aviso só (o do fetchProtegido) e o motivo na tela
    env = novo(srv);
    await abrirAba(env);
    env.api.rotas["POST identidade-visual/triar"] = { status: 403, corpo: { sucesso: false, mensagem: "Isto é da Diretoria " + ATAQUE("msg403") } };
    escolher(env, `idvCriterio_${srv.S.S.carla.sugestaoId}`, "1");
    await clicar(env, botoes(env, "Descartar", liCom(env, "idvCicloDetalhe", "Fé que vence"))[0]);
    confere(env.toasts().filter(x => x.includes("Isto é da Diretoria")).length === 1 && cicloMsg(env).includes("Isto é da Diretoria"), "403: um aviso só e o motivo na tela");
    limpo(env, "403", [ATAQUE("msg403")]);
  });

  cenario("O servidor imitado não teve erro nem ação desconhecida em nenhum cenário", async () => {
    for (const s of SERVIDORES) confere(s.S.erros.length === 0, `erro no servidor imitado (cenário "${s.cenario}"): ${s.S.erros.slice(0, 2).join(" | ").slice(0, 300)}`);
    confere(SERVIDORES.length >= 20, `servidores criados: ${SERVIDORES.length}`);
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
