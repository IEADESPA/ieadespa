// roteiro.js — a tela da v7.12 (Comunicação) contra o front de verdade, em DOM simulado, com o SERVIDOR imitado de fixtures.js (as formas do comunicacaoDb.js e as regras de
// verdade do comunicacao.js) e texto de ataque (<img src=x onerror=...>) em TODO texto que vem dele. Cobre: Meu Painel → Comunicações (as 4 categorias, a convocação sem
// caixas, o texto da autorização, salvar só o que mudou com a impressão digital, "Nada mudou", o texto que mudou, os avisos de e-mail e aparelho, os comunicados com o texto
// preenchido e o "Recebi a convocação"), a aba da liderança (sem acesso, a pílula Modelos só do geral, Enviar: modelo aprovado, grupo montado nos critérios exatos do servidor,
// a contagem antes do envio, o 428, o repetido, os grupos guardados; Envios e o relatório com quem não foi alcançado; Modelos; a ficha em papel), a troca de login e a saída da
// aba e da sub-aba, respostas atrasadas, o prazo de 20 s, 401, o console — e a página do link do e-mail (sair.html + sair.js).
"use strict";
const { criarAmbiente, criarAmbienteSair, lerApp } = require("./ambiente");
const F = require("./fixtures");
const { ATAQUE } = F;
const cm = require("../../api/shared/comunicacao");

// JSON com as chaves em ordem: compara a forma, não a ordem em que a tela escreveu
const canonico = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(c => [c, x[c]])) : x));
const CHAVES_CRITERIOS = ["assembleiaGeral", "cargos", "departamentos", "ebdProfessores", "formacaoVencendoDias", "habilitacaoVencendoDias", "lideranca", "territorio"];

async function rodar({ mutar = {}, so = null } = {}) {
  const T = { total: 0, falhas: [], cenarioAtual: "" };
  const confere = (cond, msg) => { T.total++; if (!cond) T.falhas.push(`${T.cenarioAtual}: ${msg}`); };
  const cenarios = [];
  const cenario = (nome, fn) => cenarios.push({ nome, fn });
  const AGORA = Date.parse("2026-10-22T15:00:00Z");
  const novo = (srv, opcoes) => criarAmbiente(Object.assign({ mutar, agora: new Date(AGORA).toISOString(), servidor: srv ? srv.servidor : null }, opcoes || {}));
  const SERVIDORES = [];
  const servidor = (op) => { const s = F.criarServidor(Object.assign({ agoraMs: AGORA }, op || {})); s.cenario = T.cenarioAtual; SERVIDORES.push(s); return s; };
  // nada pode ter executado nem ter virado marcação: zero ataque no DOM, zero chamada de __xss e nenhum HTML malformado; o console fica limpo
  const limpo = (env, qual, textos = []) => {
    confere(env.doc._ataques.length === 0, `${qual}: o texto de ataque virou marcação/atributo de evento (${JSON.stringify(env.doc._ataques.slice(0, 2))})`);
    confere(env.ctx.__xss.chamadas.length === 0, `${qual}: código do ataque EXECUTOU (${env.ctx.__xss.chamadas.slice(0, 4).join(",")})`);
    const corpo = env.doc.body.textContent;
    for (const t of textos) confere(corpo.includes(t), `${qual}: o texto do servidor "${t.slice(0, 60)}" não apareceu na tela como texto`);
    confere(env.doc._erros.length === 0, `${qual}: HTML malformado gerado (${env.doc._erros.slice(0, 2).join("; ")})`);
    confere(env.consoleDaTela.length === 0, `${qual}: o console da tela devia ficar limpo (${JSON.stringify(env.consoleDaTela.slice(0, 2)).slice(0, 300)})`);
    confere(!env.gravacoes.some(x => /comunica|Ana|Central|Congresso/i.test(x.chave + x.valor)), `${qual}: nada de comunicação no armazenamento do navegador`);
  };
  const desc = (env, raiz) => [...(raiz || env.doc.body).descendentes()];
  const escondido = (el) => { for (let p = el; p && p.nodeType === 1; p = p.parentNode) if (p.style && p.style.display === "none" && !["telaPainel", "cxPainelConteudo"].includes(p.id)) return true; return false; };
  const REGIOES = ["abaComunicacao", "subMeupainelComunicacoes", "modalCaixa"];
  const botao = (env, texto, raiz) => {
    const raizes = raiz ? [raiz] : REGIOES.map(id => env.e(id)).filter(Boolean);
    for (const r of raizes) { const b = desc(env, r).find(x => x.localName === "button" && x.textContent.includes(texto) && !escondido(x)); if (b) return b; }
    return null;
  };
  const botoes = (env, texto, raiz) => desc(env, raiz).filter(x => x.localName === "button" && x.textContent.includes(texto));
  const chamadas = (env, chave) => env.api.chamadas.filter(c => c.chave === chave);
  const ultima = (env, chave) => { const l = chamadas(env, chave); return l[l.length - 1] || null; };
  const texto = (env, id) => (env.e(id) ? env.e(id).textContent : "");
  const visivel = (env, id) => !!env.e(id) && env.e(id).style.display !== "none";
  const clicar = async (env, el) => { env.doc.clicar(el); await env.ocioso(); };
  const clicarEResponder = async (env, el, confirmar) => { env.doc.clicar(el); const m = await env.responderModal(confirmar); await env.ocioso(); return m; };
  const digitar = (env, id, v) => { const el = env.e(id); if (el) env.doc.digitar(el, v); return !!el; };
  const escolher = (env, id, v) => { const el = env.e(id); if (el) env.doc.escolher(el, v); return !!el; };
  const marcar = (env, id, v = true) => { const el = env.e(id); if (el) env.doc.marcar(el, v); return !!el; };
  const caixa = (env, id) => (env.e(id) ? env.e(id).checked : null);
  const abrirAba = async (env, token = "lid", matricula = 10, geral = false, permissoes = ["comunicacao"]) => {
    env.sessao({ matricula, token, geral, nivel: geral ? "GLOBAL" : "CONGREGACAO", permissoes });
    env.ev('mostrarAbaSecretaria("comunicacao")');
    await env.ocioso();
  };
  const abrirMeu = async (env, token = "pin", matricula = 31) => {
    env.sessao({ matricula, token, pin: true });
    env.ev('mostrarAbaSecretaria("meupainel")');
    env.ev('mostrarSubAbaMeupainel("comunicacoes")');
    await env.ocioso();
  };
  const secao = async (env, nome) => { await clicar(env, env.e(`btnComSecao${nome}`)); };
  const enviarBtn = (env) => env.e("comBtnEnviar");
  const artigos = (env, id) => desc(env, env.e(id)).filter(x => x.localName === "article");
  const artigoCom = (env, id, t) => artigos(env, id).find(a => a.textContent.includes(t)) || null;
  const prever = async (env) => { await clicar(env, botao(env, "Ver quantas pessoas")); };
  const corpoPrevia = (env) => { const c = ultima(env, "POST comunicacao/previa"); return c ? c.corpo : null; };
  const criteriosPadrao = { territorio: { tipo: "TODAS", ids: [] }, cargos: [], departamentos: [], lideranca: false, ebdProfessores: false, assembleiaGeral: false, formacaoVencendoDias: null, habilitacaoVencendoDias: null };
  const msgs = (env) => ({ tempo: env.g("COM_MSG_TEMPO"), rede: env.g("COM_MSG_REDE"), fator: env.g("COM_MSG_FATOR") });

  // ============================================================================================================================================
  // 0) O CONTRATO: o HTML, o módulo, a navegação e o servidor falam dos mesmos nomes
  // ============================================================================================================================================
  cenario("Contrato: ids, registro, navegação, casca e servidor", async () => {
    const html = lerApp("index.html");
    const modulo = lerApp("modulos/comunicacao.js");
    const idsDoHtml = new Set([...html.matchAll(/\bid="([^"$]+)"/g)].map(m => m[1]));
    const idsDoModulo = new Set([...modulo.matchAll(/\bid="(com[A-Za-z0-9]+)/g)].map(m => m[1]));
    const referidos = [...new Set([...modulo.matchAll(/com(?:El|Escrever|Mostrar|Valor|Marcado)\("([A-Za-z0-9_]+)"/g)].map(m => m[1]))];
    const semDono = referidos.filter(id => !idsDoHtml.has(id) && !idsDoModulo.has(id));
    confere(referidos.length > 30 && semDono.length === 0, `ids que o módulo usa e nenhum HTML nem template cria: ${semDono.join(", ")}`);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i && /^com[A-Z]|Comunica/.test(id));
    confere(repetidos.length === 0, `ids repetidos no index.html: ${[...new Set(repetidos)].join(", ")}`);
    // toda ação do HTML e dos templates do módulo está registrada; toda registrada existe
    const registradas = (/registrarAcoes\(\{([\s\S]*?)\}\);/.exec(modulo) || ["", ""])[1].split(",").map(s => s.trim()).filter(Boolean);
    const pedidas = new Set([...modulo.matchAll(/data-on-(?:click|change|input)="(com[A-Za-z]+)"/g), ...html.matchAll(/data-on-(?:click|change|input)="(com[A-Za-z]+)"/g)].map(m => m[1]));
    const naoRegistradas = [...pedidas].filter(n => !registradas.includes(n));
    confere(pedidas.size >= 15 && naoRegistradas.length === 0, `ações pedidas no HTML e não registradas: ${naoRegistradas.join(", ")}`);
    confere(registradas.every(n => new RegExp(`(async )?function ${n}\\(`).test(modulo)), "toda ação registrada é função do módulo");
    const faltam = F.contratoComOServidor();
    confere(faltam.length === 0, `contrato com o servidor: ${faltam.join(" | ")}`);
    const env = novo(null);
    confere(env.errosDaPagina.length === 0, `index.html com estrutura quebrada: ${env.errosDaPagina.slice(0, 2).join("; ")}`);
    confere(!!env.e("abaComunicacao") && env.e("abaComunicacao").className.includes("aba-secretaria"), "falta a aba abaComunicacao (aba-secretaria)");
    confere(!!env.e("btnSubMeupainelComunicacoes") && !!env.e("subMeupainelComunicacoes"), "falta a sub-aba Comunicações em Meu Painel");
    confere(env.g("NOMES_ABAS").includes("comunicacao") && JSON.stringify(env.g("ABA_PERMISSOES_ALT").comunicacao) === '["comunicacao"]', "NOMES_ABAS/ABA_PERMISSOES_ALT sem comunicacao");
    confere(env.g("MODULOS").canais.abas.includes("comunicacao") && desc(env, env.e("grupoModuloCanais")).some(x => x.id === "btnAbaComunicacao"), "a aba Comunicados devia estar no módulo Canais e Comunicação");
    confere(env.g("SUB_ABAS_MEUPAINEL").includes("comunicacoes") && !!env.g("TITULOS_SUB_MEUPAINEL").comunicacoes, "SUB_ABAS_MEUPAINEL/TITULOS_SUB_MEUPAINEL sem comunicacoes");
    confere(!!env.g("AJUDA_POR_ABA").comunicacao && env.g("TITULOS_MODULOS").comunicacao === "Comunicados", "AJUDA_POR_ABA/TITULOS_MODULOS sem comunicacao");
    const script = lerApp("script.js"), meusDados = lerApp("modulos/meus-dados.js");
    confere(/if \(typeof comLimparTela === "function"\) comLimparTela\(\);/.test(script), "limparSessao sem a chamada protegida de comLimparTela");
    confere(/typeof comSubAbaMudou === "function"\) comSubAbaMudou\(sub\)/.test(script) && /sub === "comunicacoes" && typeof comCarregarMeuPainelAcao === "function"/.test(script), "mostrarSubAbaMeupainel sem o gancho e o carregador");
    confere(/typeof comAbaMudou === "function"\) comAbaMudou\(aba\)/.test(meusDados) && /aba === "comunicacao" && typeof comAbrirAba === "function"/.test(meusDados), "mostrarAbaSecretaria sem o gancho e o carregador");
    const scripts = [...html.matchAll(/<script src="modulos\/([^"]+)"/g)].map(m => m[1]);
    confere(scripts.includes("comunicacao.js") && JSON.stringify(scripts) === JSON.stringify([...scripts].sort()), "o index.html devia carregar modulos/comunicacao.js em ordem alfabética");
    confere(lerApp("service-worker.js").includes('"/modulos/comunicacao.js"'), "o service worker devia ter /modulos/comunicacao.js na casca");
    const nomes = [...modulo.matchAll(/^(?:async function|function|const|let) ([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    confere(nomes.length > 50 && nomes.every(n => /^(com|COM_)/.test(n)), `nomes de nível superior sem o prefixo com: ${nomes.filter(n => !/^(com|COM_)/.test(n)).join(", ")}`);
    const codigo = modulo.split("\n").map(l => l.replace(/(^|\s)\/\/.*$/, "")).join("\n");
    confere(!/localStorage|sessionStorage/.test(codigo), "o módulo usa localStorage/sessionStorage");
    confere(!/console\./.test(codigo), "o módulo escreve no console");
    confere(!/\bon[a-z]+=/.test(codigo.replace(/data-on-[a-z]+=/g, "")), "nenhum atributo de evento escrito no HTML do módulo (CSP)");
    // sem login: o módulo nunca roda (nenhum pedido), e o módulo ausente não quebra a navegação
    const semMod = novo(null, { semModulo: true });
    semMod.sessao({ matricula: 10, token: "lid" });
    let quebrou = null;
    try { semMod.ev('mostrarAbaSecretaria("comunicacao")'); semMod.ev('mostrarAbaSecretaria("meupainel")'); semMod.ev('mostrarSubAbaMeupainel("comunicacoes")'); semMod.ev("limparSessao()"); } catch (e) { quebrou = e; }
    confere(!quebrou, `sem o módulo (cache velho) a navegação e a saída seguem: ${quebrou}`);
    // sair.html: sem código na página, só o sair.js; o sair.js só escreve por textContent
    const sairHtml = lerApp("sair.html"), sairJs = lerApp("sair.js");
    confere(/<script src="sair\.js"><\/script>/.test(sairHtml) && !/<script>/.test(sairHtml) && !/\son[a-z]+=/.test(sairHtml), "sair.html: só o sair.js, nenhum código na página");
    confere(!/innerHTML|insertAdjacentHTML|document\.write/.test(sairJs) && /textContent/.test(sairJs), "sair.js escreve só por textContent");
    confere(/name="robots" content="noindex"/.test(sairHtml), "sair.html fora dos buscadores");
  });

  // ============================================================================================================================================
  // 1) MEU PAINEL → COMUNICAÇÕES
  // ============================================================================================================================================
  cenario("Meu Painel: as 4 categorias, a convocação sem caixas, o texto da autorização", async () => {
    const srv = servidor(); const env = novo(srv);
    await abrirMeu(env);
    for (const a of ["preferencias", "meus-comunicados", "catalogos"]) {
      const c = chamadas(env, `GET comunicacao/${a}`);
      confere(c.length === 1 && c[0].comToken && c[0].comPrazo, `GET ${a}: uma vez, com o token e o prazo de 20 s (${c.length})`);
    }
    const cats = desc(env, env.e("comMeuPrefs")).filter(x => x.localName === "fieldset");
    confere(cats.length === 4, `4 categorias (a de código inválido não entra): ${cats.length}`);
    const conv = cats.find(f => f.textContent.includes("Convocação oficial"));
    confere(!!conv && conv.textContent.includes("obrigação do Estatuto") && !desc(env, conv).some(x => x.localName === "input"), "a convocação diz 'obrigação do Estatuto' e não tem caixa");
    for (const k of cm.CATEGORIAS_COM_CONSENTIMENTO) {
      const f = cats.find(x => x.textContent.includes(cm.CATEGORIAS[k].rotulo));
      const det = f && desc(env, f).find(x => x.localName === "details");
      const sum = det && desc(env, det).find(x => x.localName === "summary");
      confere(!!det && !!sum && sum.textContent === "Ler a autorização" && det.textContent.includes(cm.textoConsentimento(k)) && !det.open, `${k}: o texto exato da autorização dentro de "Ler a autorização" (fechado)`);
      confere(!!f && desc(env, f).filter(x => x.localName === "input" && x.type === "checkbox").length === 2, `${k}: uma caixa por canal (E-mail e Celular; o canal inválido não entra)`);
    }
    const ids = desc(env, env.e("comMeuPrefs")).filter(x => x.localName === "input").map(x => x.id).sort();
    confere(JSON.stringify(ids) === JSON.stringify(["comPref_DEVOCIONAL_EMAIL", "comPref_DEVOCIONAL_PUSH", "comPref_EVENTOS_EMAIL", "comPref_EVENTOS_PUSH", "comPref_FINANCEIRO_EMAIL", "comPref_FINANCEIRO_PUSH"]), `as 6 caixas: ${ids.join(",")}`);
    confere(caixa(env, "comPref_EVENTOS_EMAIL") === true && caixa(env, "comPref_FINANCEIRO_PUSH") === true && caixa(env, "comPref_EVENTOS_PUSH") === false && caixa(env, "comPref_DEVOCIONAL_EMAIL") === false, "as caixas mostram o que está gravado");
    confere(!texto(env, "comMeuPrefs").includes("não tem e-mail") && !texto(env, "comMeuPrefs").includes("ative os avisos"), "com e-mail e aparelho: sem avisos");
    limpo(env, "preferências", [ATAQUE("rotuloCatEVENTOS"), ATAQUE("textoAutEVENTOS"), ATAQUE("descPrefDEVOCIONAL"), ATAQUE("rotuloCanalEMAIL"), ATAQUE("versao")]);
    confere(!env.doc.body.textContent.includes("[rotuloPrefFalsa]") && !env.doc.body.textContent.includes("[rotuloCanalFalso]"), "a categoria e o canal de código inválido não aparecem");
  });

  cenario("Meu Painel: salvar manda só o que mudou, com a impressão digital que o servidor deu; Nada mudou; texto que mudou", async () => {
    const srv = servidor(); const env = novo(srv);
    await abrirMeu(env);
    const salvar = () => clicar(env, botao(env, "Salvar minhas escolhas"));
    await salvar();
    confere(chamadas(env, "POST comunicacao/preferencias").length === 0 && texto(env, "comMeuMsg").includes("Nada mudou"), "sem mudança: nenhum POST e 'Nada mudou'");
    marcar(env, "comPref_EVENTOS_EMAIL", false); marcar(env, "comPref_DEVOCIONAL_PUSH", true);
    await salvar();
    const p = ultima(env, "POST comunicacao/preferencias");
    const esperado = { mudancas: [{ canal: "EMAIL", categoria: "EVENTOS", concedido: false, hash: srv.S.hash.EVENTOS }, { canal: "PUSH", categoria: "DEVOCIONAL", concedido: true, hash: srv.S.hash.DEVOCIONAL }] };
    confere(!!p && JSON.stringify(p.corpo) === JSON.stringify(esperado), `o POST leva só as 2 mudanças, com a impressão digital devolvida igual: ${p && JSON.stringify(p.corpo).slice(0, 300)}`);
    confere(!!p && p.cabecalhos["content-type"] === "application/json" && p.comToken && p.comPrazo, "POST em JSON, com token e prazo");
    confere(srv.S.consent[31]["EMAIL|EVENTOS"] === false && srv.S.consent[31]["PUSH|DEVOCIONAL"] === true, "o servidor gravou");
    confere(caixa(env, "comPref_EVENTOS_EMAIL") === false && caixa(env, "comPref_DEVOCIONAL_PUSH") === true && caixa(env, "comPref_FINANCEIRO_PUSH") === true, "a tela foi redesenhada com o que o servidor devolveu");
    confere(texto(env, "comMeuMsg") === "Escolhas salvas." && env.toasts().includes("Escolhas salvas."), "mensagem e aviso de sucesso");
    await salvar();
    confere(chamadas(env, "POST comunicacao/preferencias").length === 1 && texto(env, "comMeuMsg").includes("Nada mudou"), "depois de salvar, salvar de novo não manda nada");
    // desmarcar e marcar de volta a mesma caixa = nada mudou
    marcar(env, "comPref_FINANCEIRO_PUSH", false); marcar(env, "comPref_FINANCEIRO_PUSH", true);
    await salvar();
    confere(chamadas(env, "POST comunicacao/preferencias").length === 1, "desmarcar e marcar de volta não manda nada");
    // o texto da autorização mudou no servidor: 422 textoMudou -> a tela relê (a caixa volta ao que está gravado) e o motivo continua escrito
    srv.S.hash.EVENTOS = cm.hashDoTexto("EVENTOS") + "-versao-nova" + ATAQUE("hashNovo");
    marcar(env, "comPref_EVENTOS_PUSH", true);
    const leiturasAntes = chamadas(env, "GET comunicacao/preferencias").length;
    await salvar();
    const r = ultima(env, "POST comunicacao/preferencias");
    confere(!!r && r.corpo.mudancas.length === 1 && r.corpo.mudancas[0].concedido === true && srv.S.consent[31]["PUSH|EVENTOS"] === undefined, "o 'sim' com a impressão velha foi recusado");
    confere(chamadas(env, "GET comunicacao/preferencias").length === leiturasAntes + 1, "o 422 textoMudou relê as escolhas");
    confere(caixa(env, "comPref_EVENTOS_PUSH") === false, "depois de reler, a caixa volta ao que está gravado (a pessoa lê o texto novo e marca de novo)");
    confere(texto(env, "comMeuMsg").includes("texto da autorização mudou"), `o motivo continua na tela depois de reler (${texto(env, "comMeuMsg").slice(0, 120)})`);
    confere(env.toasts().some(t => t.includes("texto da autorização mudou")), "e saiu no aviso");
    marcar(env, "comPref_EVENTOS_PUSH", true);
    await salvar();
    confere(ultima(env, "POST comunicacao/preferencias").corpo.mudancas[0].hash === srv.S.hash.EVENTOS && srv.S.consent[31]["PUSH|EVENTOS"] === true, "relido, o 'sim' vai com a impressão nova e grava");
    // 429 (outra mudança gravando): o motivo, sem reler
    srv.S.ocupado = true;
    marcar(env, "comPref_DEVOCIONAL_EMAIL", true);
    const l2 = chamadas(env, "GET comunicacao/preferencias").length;
    await salvar();
    confere(texto(env, "comMeuMsg").includes("Outra mudança está sendo gravada") && chamadas(env, "GET comunicacao/preferencias").length === l2 && caixa(env, "comPref_DEVOCIONAL_EMAIL") === true, "429: o motivo, sem reler e sem perder o que a pessoa marcou");
    srv.S.ocupado = false;
    srv.S.limitePreferencias = true;
    await salvar();
    confere(texto(env, "comMeuMsg").includes("Muitas mudanças seguidas") && caixa(env, "comPref_DEVOCIONAL_EMAIL") === true, "429 (muitas mudanças seguidas): a mensagem do servidor");
    srv.S.limitePreferencias = false;
    limpo(env, "salvar", [ATAQUE("msg422"), ATAQUE("msg429")]);
  });

  cenario("Meu Painel: avisos sem e-mail e sem aparelho; erros e rede caída", async () => {
    const srv = servidor(); const env = novo(srv);
    await abrirMeu(env, "pin2", 32);
    const t = texto(env, "comMeuPrefs");
    confere(t.includes("Seu cadastro não tem e-mail") && t.includes("ative os avisos neste aparelho"), "sem e-mail e sem aparelho: os dois avisos");
    confere(texto(env, "comMeuComunicados").includes("Nenhum comunicado recebido ainda."), "sem comunicados: a frase certa");
    limpo(env, "avisos");
    const env2 = novo(srv);
    env2.api.rotas["GET comunicacao/preferencias"] = { status: 500, corpo: { sucesso: false, mensagem: "Falhou " + ATAQUE("msg500") } };
    await abrirMeu(env2);
    confere(texto(env2, "comMeuMsg").includes("Falhou") && texto(env2, "comMeuPrefs") === "", "500: o motivo no lugar, nada de caixas");
    confere(artigos(env2, "comMeuComunicados").length === 3, "os comunicados aparecem mesmo assim");
    limpo(env2, "500", [ATAQUE("msg500")]);
    const env3 = novo(srv);
    env3.api.redeCaida = true;
    await abrirMeu(env3);
    confere(texto(env3, "comMeuMsg") === msgs(env3).rede && texto(env3, "comMeuComunicados") === msgs(env3).rede, "rede caída: a mensagem de rede nos dois lugares");
    confere(env3.toasts().length >= 1, "e o aviso do fetchProtegido");
  });

  cenario("Meu Painel: comunicados com o texto preenchido e o 'Recebi a convocação'", async () => {
    const srv = servidor(); const env = novo(srv);
    await abrirMeu(env);
    const arts = artigos(env, "comMeuComunicados");
    confere(arts.length === 3, `3 comunicados: ${arts.length}`);
    const ev = artigoCom(env, "comMeuComunicados", "Congresso de jovens");
    confere(!!ev && ev.textContent.includes("Paz do Senhor, Ana! O congresso da Central") && !ev.textContent.includes("{{"), "o texto vem preenchido para a pessoa (primeiro nome e congregação)");
    const bts = botoes(env, "Recebi a convocação", env.e("comMeuComunicados"));
    const nova = arts.find(a => a.textContent.includes("Recebi a convocação"));
    confere(bts.length === 1 && !!nova && nova === artigos(env, "comMeuComunicados")[1], "um só 'Recebi a convocação': a convocação sem ciência (a antiga tem ciência; o evento não pede)");
    confere(texto(env, "comMeuComunicados").includes("Ciência registrada em 23/09/2026"), "a convocação antiga mostra a ciência com a data");
    confere(!ev.textContent.includes("Ciência") && !ev.textContent.includes("Recebi"), "o evento não pede ciência");
    await clicar(env, bts[0]);
    const c = ultima(env, "POST comunicacao/ciencia");
    confere(!!c && JSON.stringify(c.corpo) === JSON.stringify({ envioId: srv.S.E.convocacao.envioId }), `POST ciencia {envioId}: ${c && JSON.stringify(c.corpo)}`);
    confere(botoes(env, "Recebi a convocação", env.e("comMeuComunicados")).length === 0 && (texto(env, "comMeuComunicados").match(/Ciência registrada/g) || []).length === 2, "redesenhado: o botão sumiu, as duas convocações com ciência");
    confere(texto(env, "comMeuMsg").includes("Ciência registrada. Obrigado."), "a mensagem de obrigado");
    limpo(env, "comunicados", [ATAQUE("tituloEventos"), ATAQUE("rotuloCatCONVOCACAO"), ATAQUE("corpoConvocacao")]);
    // duplo clique: o botão fica desabilitado e a segunda chamada (mesma chave) é recusada; só um POST
    const srv2 = servidor(); const env2 = novo(srv2);
    await abrirMeu(env2);
    const r = env2.retem(x => x.chave === "POST comunicacao/ciencia");
    const b = botoes(env2, "Recebi a convocação", env2.e("comMeuComunicados"))[0];
    env2.doc.clicar(b); await env2.ocioso();
    confere(b.disabled === true && env2.doc.clicar(b) === false, "o botão fica desabilitado enquanto o pedido anda");
    env2.ev(`comCienciaAcao(${srv2.S.E.convocacao.envioId}, null)`); await env2.ocioso();
    confere(env2.toasts().some(t => t.includes("Aguarde")), "a segunda chamada é recusada com 'Aguarde'");
    r.liberar(); await env2.ocioso();
    confere(chamadas(env2, "POST comunicacao/ciencia").length === 1, `um só POST de ciência: ${chamadas(env2, "POST comunicacao/ciencia").length}`);
    // ciência num id que a tela não mostrou: nada sai
    env2.ev("comCienciaAcao('abc', null)"); await env2.ocioso();
    confere(chamadas(env2, "POST comunicacao/ciencia").length === 1, "id inválido não sai");
  });

  // ============================================================================================================================================
  // 2) ABA DA LIDERANÇA: acesso
  // ============================================================================================================================================
  cenario("Liderança: sem acesso, pílula Modelos só do geral, falha ao abrir", async () => {
    const srv = servidor();
    // a permissão na tela, mas o servidor diz que não há gestão (concessão de Extensão)
    const env = novo(srv);
    await abrirAba(env, "semgestao", 11);
    confere(visivel(env, "abaComunicacao") && visivel(env, "comSemAcesso") && !visivel(env, "comConteudo"), "sem gestão no servidor: o aviso de sem acesso e o conteúdo escondido");
    confere(chamadas(env, "GET comunicacao/modelos").length === 0 && chamadas(env, "GET comunicacao/opcoes").length === 0, "sem gestão: nada da gestão é pedido");
    confere(!visivel(env, "btnComSecaoModelos"), "sem gestão: a pílula Modelos escondida");
    // sem a permissão: a aba nem aparece; PIN: também não
    const env2 = novo(srv);
    await abrirAba(env2, "lid", 10, false, ["outra"]);
    confere(!visivel(env2, "abaComunicacao") && texto(env2, "comEnvForm") === "" && chamadas(env2, "GET comunicacao/modelos").length === 0, "sem a permissão: a aba não aparece e nada é montado");
    const env3 = novo(srv);
    env3.sessao({ matricula: 31, token: "pin", pin: true });
    env3.ev('mostrarAbaSecretaria("comunicacao")'); await env3.ocioso();
    confere(!visivel(env3, "abaComunicacao") && texto(env3, "comEnvForm") === "", "PIN: a aba não aparece");
    // não geral: a pílula Modelos escondida, e a ação direta não abre a seção
    const env4 = novo(srv);
    await abrirAba(env4);
    confere(visivel(env4, "comConteudo") && !visivel(env4, "comSemAcesso") && !visivel(env4, "btnComSecaoModelos") && visivel(env4, "btnComSecaoEnvios"), "Dirigente: conteúdo, sem a pílula Modelos");
    confere(!visivel(env4, "btnComSecaoFicha"), "Dirigente: sem a pílula Ficha em papel (só o nível geral)");
    env4.ev('comMostrarSecaoAcao("modelos")'); await env4.ocioso();
    confere(chamadas(env4, "GET comunicacao/modelos").length === 1 && visivel(env4, "comSecaoEnviar") && !visivel(env4, "comSecaoModelos"), "não geral: a seção Modelos não abre");
    env4.ev('comMostrarSecaoAcao("ficha")'); await env4.ocioso();
    confere(visivel(env4, "comSecaoEnviar") && !visivel(env4, "comSecaoFicha") && texto(env4, "comFichaForm") === "", "não geral: a seção Ficha em papel não abre");
    // geral: a pílula aparece; ao sair da sessão ela some (a próxima pessoa não herda)
    const env5 = novo(srv);
    await abrirAba(env5, "geral", 13, true);
    confere(visivel(env5, "btnComSecaoModelos") && visivel(env5, "btnComSecaoFicha"), "geral: as pílulas Modelos e Ficha em papel aparecem");
    env5.ev("limparSessao()"); await env5.ocioso();
    confere(!visivel(env5, "btnComSecaoModelos") && !visivel(env5, "btnComSecaoFicha"), "depois de sair, as pílulas do geral não ficam para a próxima pessoa");
    const r = env5.retem(x => x.chave === "GET comunicacao/catalogos");
    await abrirAba(env5, "semgestao", 11);
    confere(!visivel(env5, "btnComSecaoModelos") && !visivel(env5, "btnComSecaoFicha"), "a próxima pessoa (sem gestão), enquanto a aba carrega: sem as pílulas do geral");
    r.liberar(); await env5.ocioso();
    confere(visivel(env5, "comSemAcesso") && !visivel(env5, "btnComSecaoModelos"), "e depois: sem acesso, sem a pílula");
    // a aba não abre (rede caída): o motivo, não "sem acesso"
    const env6 = novo(srv);
    env6.api.redeCaida = true;
    await abrirAba(env6);
    confere(!visivel(env6, "comSemAcesso"), "falha ao abrir não é 'sem acesso'");
    confere(texto(env6, "comGesMsg").includes("Não foi possível"), `falha ao abrir: o motivo em comGesMsg (${texto(env6, "comGesMsg")})`);
    env6.api.redeCaida = false;
    env6.ev('mostrarAbaSecretaria("comunicacao")'); await env6.ocioso();
    confere(visivel(env6, "comConteudo") && texto(env6, "comGesMsg") === "" && !!env6.e("comEnvModelo"), "tentando de novo, a aba abre e o motivo some");
    limpo(env4, "acesso");
  });

  // ============================================================================================================================================
  // 3) ENVIAR
  // ============================================================================================================================================
  cenario("Enviar: só modelos aprovados, o texto do modelo, o grupo nos critérios exatos do servidor", async () => {
    const srv = servidor(); const env = novo(srv);
    await abrirAba(env, "geral", 13, true);
    for (const a of ["catalogos", "modelos", "opcoes", "grupos"]) confere(chamadas(env, `GET comunicacao/${a}`).length === 1, `GET ${a} uma vez`);
    const ops = env.e("comEnvModelo").options;
    confere(JSON.stringify(ops.map(o => o.value).sort()) === JSON.stringify(["", String(srv.S.M.eventos.modeloId), String(srv.S.M.convocacao.modeloId)].sort()) && ops[0].value === "", `só os aprovados (rascunho, arquivado, status estranho e id inválido ficam de fora): ${ops.map(o => o.value).join(",")}`);
    const opEv = ops.find(o => o.value === String(srv.S.M.eventos.modeloId));
    confere(!!opEv && opEv.textContent.includes(ATAQUE("tituloEventos")) && opEv.textContent.includes(ATAQUE("rotuloCatEVENTOS")) && opEv.textContent.includes("(v1)"), "a opção mostra categoria, título e versão como texto");
    confere(enviarBtn(env).disabled, "Enviar começa desabilitado");
    escolher(env, "comEnvModelo", String(srv.S.M.eventos.modeloId)); await env.ocioso();
    const ver = texto(env, "comEnvModeloVer");
    confere(ver.includes(ATAQUE("tituloEventos")) && ver.includes(ATAQUE("corpoEventos")) && ver.includes("{{primeiro_nome}} e {{congregacao}} são trocados") && !ver.includes("Convocação oficial"), "o texto do modelo aparece antes do envio");
    escolher(env, "comEnvModelo", String(srv.S.M.convocacao.modeloId)); await env.ocioso();
    confere(texto(env, "comEnvModeloVer").includes("Convocação oficial: vai a todos do grupo"), "a convocação avisa que vai a todos");
    escolher(env, "comEnvModelo", String(srv.S.M.eventos.modeloId)); await env.ocioso();
    // o grupo padrão
    await prever(env);
    let c = corpoPrevia(env);
    confere(!!c && c.categoria === "EVENTOS" && canonico(c.criterios) === canonico(criteriosPadrao) && JSON.stringify(Object.keys(c.criterios).sort()) === JSON.stringify(CHAVES_CRITERIOS), `o grupo padrão: ${c && JSON.stringify(c)}`);
    confere(!cm.validarCriterios(c.criterios).problema && canonico(cm.validarCriterios(c.criterios).criterios) === canonico(c.criterios), "a regra de verdade aceita e não muda nada");
    const pv = texto(env, "comEnvPrevia");
    confere(pv.includes("42 pessoa(s) no grupo") && pv.includes(ATAQUE("grupoPrevia")) && pv.includes("E-mail: 12 recebem; 25 sem autorização; 5 sem e-mail") && pv.includes("Celular: 7 recebem; 30 sem autorização; 5 sem aparelho"), `a contagem por canal: ${pv.slice(0, 200)}`);
    confere(pv.includes("3 sem data de nascimento no cadastro ficaram de fora (peça à Secretaria para completar)"), "os sem data de nascimento que ficaram de fora");
    confere(!enviarBtn(env).disabled, "depois da contagem, Enviar habilita");
    confere(!!env.e("comGrpAssembleia"), "geral: a caixa da Assembleia Geral aparece");
    // montar o grupo
    escolher(env, "comGrpTipo", "CONGREGACAO"); await env.ocioso();
    confere(enviarBtn(env).disabled && texto(env, "comEnvPrevia") === "", "trocar o território invalida a contagem");
    const terr = desc(env, env.e("comGrpIds")).filter(x => x.localName === "input").map(x => x.id);
    confere(JSON.stringify(terr) === JSON.stringify(["comGrpTerr_1", "comGrpTerr_2"]), `as congregações do território (a de id inválido fica fora): ${terr.join(",")}`);
    confere(!env.e("comGrpCargo_" + ATAQUE("siglaCargo")) && desc(env, env.e("comEnvForm")).filter(x => x.id && x.id.startsWith("comGrpCargo_")).length === 2, "o cargo de sigla inválida fica fora");
    marcar(env, "comGrpTerr_2"); marcar(env, "comGrpTerr_1"); marcar(env, "comGrpCargo_DIAC"); marcar(env, "comGrpDep_5");
    marcar(env, "comGrpLideranca"); marcar(env, "comGrpEbd"); marcar(env, "comGrpAssembleia"); digitar(env, "comGrpFormacao", "30");
    await env.ocioso();
    await prever(env);
    c = corpoPrevia(env);
    const esperado = { territorio: { tipo: "CONGREGACAO", ids: [1, 2] }, cargos: ["DIAC"], departamentos: [5], lideranca: true, ebdProfessores: true, assembleiaGeral: true, formacaoVencendoDias: 30, habilitacaoVencendoDias: null };
    confere(canonico(c.criterios) === canonico(esperado), `os critérios exatos: ${JSON.stringify(c.criterios)}`);
    const v = cm.validarCriterios(c.criterios);
    confere(!v.problema && canonico(v.criterios) === canonico(c.criterios), `a regra de verdade aceita como está (${v.problema || ""})`);
    confere(!enviarBtn(env).disabled, "habilitou de novo");
    // cada mudança invalida
    const invalida = async (acao, qual) => { await prever(env); confere(!enviarBtn(env).disabled, `${qual}: habilitado antes`); acao(); await env.ocioso(); confere(enviarBtn(env).disabled && texto(env, "comEnvPrevia") === "", `${qual}: invalida a contagem`); };
    await invalida(() => marcar(env, "comGrpCargo_PRESB"), "marcar um cargo");
    await invalida(() => marcar(env, "comGrpDep_5", false), "desmarcar um departamento");
    await invalida(() => marcar(env, "comGrpEbd", false), "desmarcar EBD");
    await invalida(() => digitar(env, "comGrpHabilitacao", "0"), "digitar dias de habilitação");
    await invalida(() => escolher(env, "comEnvModelo", String(srv.S.M.convocacao.modeloId)), "trocar o modelo");
    await prever(env);
    c = corpoPrevia(env);
    confere(!texto(env, "comEnvPrevia").includes("sem data de nascimento"), "convocação: sem o aviso dos sem data de nascimento (o servidor manda 0)");
    confere(c.categoria === "CONVOCACAO" && c.criterios.habilitacaoVencendoDias === 0 && JSON.stringify(c.criterios.cargos) === '["DIAC","PRESB"]' && c.criterios.ebdProfessores === false && JSON.stringify(c.criterios.departamentos) === "[]", `a contagem segue o que está na tela: ${JSON.stringify(c)}`);
    // dias inválidos: a tela recusa sem pedir
    const n = chamadas(env, "POST comunicacao/previa").length;
    digitar(env, "comGrpFormacao", "1.5"); await env.ocioso();
    await prever(env);
    confere(chamadas(env, "POST comunicacao/previa").length === n && texto(env, "comEnvMsg").includes("número inteiro de 0 a 365"), "dias não inteiros: recusa na tela");
    digitar(env, "comGrpFormacao", "-3"); await env.ocioso();
    await prever(env);
    confere(texto(env, "comEnvMsg").includes("de 0 a 365") && enviarBtn(env).disabled, "dias negativos: o servidor recusa (422) e Enviar fica desabilitado");
    digitar(env, "comGrpFormacao", ""); await env.ocioso();
    // território sem nenhuma marcada: a regra do servidor recusa
    escolher(env, "comGrpTipo", "AREA"); await env.ocioso();
    confere(!!env.e("comGrpTerr_100") && !env.e("comGrpTerr_1"), "Áreas: as áreas do território");
    await prever(env);
    confere(texto(env, "comEnvMsg").includes("Escolha ao menos uma") && enviarBtn(env).disabled, "nenhuma área marcada: o motivo do servidor e Enviar desabilitado");
    // 429 (muitas contagens seguidas): a mensagem do servidor e Enviar desabilitado
    marcar(env, "comGrpTerr_100"); srv.S.limitePrevia = true;
    await prever(env);
    confere(texto(env, "comEnvMsg").includes("Muitas contagens seguidas") && enviarBtn(env).disabled && env.toasts().some(t => t.includes("Muitas contagens seguidas")), "429 na contagem: a mensagem do servidor");
    srv.S.limitePrevia = false; marcar(env, "comGrpTerr_100", false);
    // grupo vazio (0 pessoas): Enviar continua desabilitado
    marcar(env, "comGrpTerr_100"); srv.S.totalPrevia = 0;
    await prever(env);
    confere(texto(env, "comEnvPrevia").includes("0 pessoa(s)") && enviarBtn(env).disabled, "0 pessoas: Enviar não habilita");
    limpo(env, "enviar", [ATAQUE("grupoPrevia"), ATAQUE("cargoDiac"), ATAQUE("depJovens"), ATAQUE("areaNome"), ATAQUE("msg422")]);
  });

  cenario("Enviar: confirmação com a contagem, 428 e uma nova tentativa, repetido, recusa do fator, contagem velha", async () => {
    const srv = servidor(); const env = novo(srv);
    await abrirAba(env, "geral", 13, true);
    escolher(env, "comEnvModelo", String(srv.S.M.eventos.modeloId));
    marcar(env, "comGrpLideranca"); await env.ocioso();
    await prever(env);
    let m = await clicarEResponder(env, enviarBtn(env), false);
    confere(m.aberto && m.texto.includes("a 42 pessoa(s)") && m.texto.includes(ATAQUE("tituloEventos")) && m.texto.includes("Dá para cancelar o que ainda estiver na fila"), `a confirmação diz quantas pessoas: ${m.texto.slice(0, 160)}`);
    confere(chamadas(env, "POST comunicacao/enviar").length === 0, "cancelar a confirmação não envia");
    env.ctx.__fatorConfirmar = async () => { srv.S.fatorOk = true; return true; };
    m = await clicarEResponder(env, enviarBtn(env), true);
    const envs = chamadas(env, "POST comunicacao/enviar");
    const crit = Object.assign({}, criteriosPadrao, { lideranca: true });
    confere(envs.length === 2 && env.g("window.__fatorPedidos") === 1, `428: pede a confirmação reforçada uma vez e repete a chamada uma vez (${envs.length} POST, ${env.g("window.__fatorPedidos")} pedidos)`);
    confere(envs.every(x => canonico(x.corpo) === canonico({ modeloId: srv.S.M.eventos.modeloId, criterios: crit })), `POST enviar {modeloId, criterios}: ${envs[0] && JSON.stringify(envs[0].corpo)}`);
    confere(texto(env, "comEnvMsg").includes("Enviado. Acompanhe a entrega em Envios."), "a mensagem de enviado");
    const res = texto(env, "comEnvResultado");
    confere(res.includes(ATAQUE("tituloEventos")) && res.includes("42 pessoa(s)") && res.includes(ATAQUE("grupoEnviado")) && res.includes("Leram no sininho"), "o resultado mostra o relatório do envio");
    confere(enviarBtn(env).disabled && texto(env, "comEnvPrevia") === "", "depois de enviar, a contagem não vale mais");
    confere(srv.S.envios.length === 5, "um envio novo no servidor");
    // o mesmo de novo: o servidor diz repetido
    await prever(env);
    await clicarEResponder(env, enviarBtn(env), true);
    confere(texto(env, "comEnvMsg").includes("já tinha sido feito") && srv.S.envios.length === 5, "repetido: a tela diz que é o mesmo envio");
    limpo(env, "envio", [ATAQUE("tituloEventos")]);
    // o fator recusado: uma chamada só e a mensagem própria
    const srv2 = servidor(); const env2 = novo(srv2);
    await abrirAba(env2, "geral", 13, true);
    escolher(env2, "comEnvModelo", String(srv2.S.M.eventos.modeloId)); await env2.ocioso();
    await prever(env2);
    env2.ctx.__fatorConfirmar = async () => false;
    await clicarEResponder(env2, enviarBtn(env2), true);
    confere(chamadas(env2, "POST comunicacao/enviar").length === 1 && texto(env2, "comEnvMsg") === msgs(env2).fator && srv2.S.envios.length === 4, "fator recusado: uma chamada, a mensagem da confirmação, nada enviado");
    // a contagem que chega depois de o grupo mudar não vale para enviar
    const r = env2.retem(x => x.chave === "POST comunicacao/previa");
    env2.doc.clicar(botao(env2, "Ver quantas pessoas")); await env2.ocioso();
    marcar(env2, "comGrpEbd"); await env2.ocioso();
    r.liberar(); await env2.ocioso();
    const antes = chamadas(env2, "POST comunicacao/enviar").length;
    confere(!enviarBtn(env2).disabled, "a contagem velha chegou e habilitou o Enviar (a guarda é no clique)");
    env2.doc.clicar(enviarBtn(env2)); await env2.ocioso();
    const aberto = !env2.e("modalOverlay").classList.contains("escondido");
    confere(!aberto && chamadas(env2, "POST comunicacao/enviar").length === antes && texto(env2, "comEnvMsg").includes("O grupo mudou"), "contagem velha: nada de confirmação nem envio; pede a contagem de novo");
    confere(enviarBtn(env2).disabled, "e o Enviar desabilita");
  });

  cenario("Enviar: grupos guardados (usar, guardar, apagar) sem perder o que está montado", async () => {
    const srv = servidor(); const env = novo(srv);
    await abrirAba(env);
    const ops = env.e("comGrpSalvos").options;
    confere(ops.length === 3 && ops[1].textContent === `Diáconos da Área 1 ${ATAQUE("grupoNome")}`, `os grupos guardados no seletor (nome como texto): ${ops.map(o => o.textContent.slice(0, 20)).join("|")}`);
    confere(!env.e("comGrpAssembleia") && !texto(env, "comEnvForm").includes("Assembleia Geral"), "não geral: sem a caixa da Assembleia Geral (critério só do nível geral)");
    escolher(env, "comEnvModelo", String(srv.S.M.eventos.modeloId)); await env.ocioso();
    escolher(env, "comGrpSalvos", String(srv.S.G.diaconos.audienciaId));
    await clicar(env, botao(env, "Usar"));
    confere(env.e("comGrpTipo").value === "AREA" && caixa(env, "comGrpTerr_100") === true && caixa(env, "comGrpCargo_DIAC") === true && caixa(env, "comGrpCargo_PRESB") === false
      && caixa(env, "comGrpDep_6") === true && caixa(env, "comGrpDep_5") === false && caixa(env, "comGrpLideranca") === true && caixa(env, "comGrpEbd") === false && caixa(env, "comGrpAssembleia") === null
      && env.e("comGrpFormacao").value === "15" && env.e("comGrpHabilitacao").value === "0", "Usar: a tela mostra os critérios do grupo");
    confere(texto(env, "comEnvMsg").includes("Grupo carregado") && enviarBtn(env).disabled, "Usar: pede a contagem antes de enviar");
    await prever(env);
    confere(canonico(corpoPrevia(env).criterios) === canonico(srv.S.G.diaconos.criterios), `a contagem vai com os critérios do grupo: ${JSON.stringify(corpoPrevia(env).criterios)}`);
    // guardar
    digitar(env, "comGrpNome", "ab");
    await clicar(env, botao(env, "Guardar"));
    confere(chamadas(env, "POST comunicacao/grupo").length === 0 && texto(env, "comEnvMsg").includes("3 letras ou mais"), "nome curto: recusa na tela");
    marcar(env, "comGrpEbd"); await env.ocioso();
    digitar(env, "comGrpNome", "Diáconos e EBD");
    await clicar(env, botao(env, "Guardar"));
    const g = ultima(env, "POST comunicacao/grupo");
    const crit = Object.assign({}, srv.S.G.diaconos.criterios, { ebdProfessores: true });
    confere(!!g && g.corpo.nome === "Diáconos e EBD" && canonico(g.corpo.criterios) === canonico(crit) && Object.keys(g.corpo).length === 2, `POST grupo {nome, criterios}: ${g && JSON.stringify(g.corpo)}`);
    confere(chamadas(env, "GET comunicacao/grupos").length === 2 && env.e("comGrpSalvos").options.length === 4 && texto(env, "comEnvMsg").includes("Grupo guardado."), "guardado: relê os grupos e o novo aparece");
    confere(env.e("comEnvModelo").value === String(srv.S.M.eventos.modeloId), "o modelo escolhido continua");
    confere(env.e("comGrpTipo").value === "AREA" && caixa(env, "comGrpTerr_100") === true && caixa(env, "comGrpCargo_DIAC") === true && caixa(env, "comGrpEbd") === true && env.e("comGrpFormacao").value === "15",
      "guardar não apaga o grupo montado na tela (senão a próxima contagem seria do território inteiro)");
    // apagar
    escolher(env, "comGrpSalvos", String(srv.S.G.todos.audienciaId));
    let m = await clicarEResponder(env, botao(env, "Apagar"), false);
    confere(m.aberto && m.texto.includes("Apagar este grupo guardado?") && chamadas(env, "POST comunicacao/excluir-grupo").length === 0, "apagar pede confirmação; cancelar não apaga");
    escolher(env, "comGrpSalvos", String(srv.S.G.todos.audienciaId));
    m = await clicarEResponder(env, botao(env, "Apagar"), true);
    const x = ultima(env, "POST comunicacao/excluir-grupo");
    confere(!!x && JSON.stringify(x.corpo) === JSON.stringify({ audienciaId: srv.S.G.todos.audienciaId }), `POST excluir-grupo {audienciaId}: ${x && JSON.stringify(x.corpo)}`);
    confere(!env.e("comGrpSalvos").options.some(o => o.value === String(srv.S.G.todos.audienciaId)) && texto(env, "comEnvMsg").includes("Grupo apagado."), "apagado: sai do seletor");
    confere(env.e("comEnvModelo").value === String(srv.S.M.eventos.modeloId) && env.e("comGrpTipo").value === "AREA" && caixa(env, "comGrpCargo_DIAC") === true && caixa(env, "comGrpEbd") === true,
      "apagar um grupo guardado não apaga o modelo nem o grupo montado na tela");
    // apagar sem escolher: nada
    escolher(env, "comGrpSalvos", "");
    env.doc.clicar(botao(env, "Apagar")); await env.ocioso();
    confere(env.e("modalOverlay").classList.contains("escondido") && chamadas(env, "POST comunicacao/excluir-grupo").length === 1, "sem grupo escolhido, Apagar não faz nada");
    limpo(env, "grupos", [ATAQUE("grupoNome"), ATAQUE("grupoNomeNovo")]);
  });

  // ============================================================================================================================================
  // 4) ENVIOS E RELATÓRIO
  // ============================================================================================================================================
  cenario("Envios: lista, relatório (contagens, leitura, ciência, quem não foi alcançado com tel:), cancelar", async () => {
    const srv = servidor(); const env = novo(srv);
    await abrirAba(env, "geral", 13, true);
    await secao(env, "Envios");
    confere(visivel(env, "comSecaoEnvios") && !visivel(env, "comSecaoEnviar") && env.e("btnComSecaoEnvios").getAttribute("aria-pressed") === "true" && env.e("btnComSecaoEnviar").getAttribute("aria-pressed") === "false", "a pílula Envios abre a seção e marca aria-pressed");
    confere(chamadas(env, "GET comunicacao/envios").length === 1, "GET envios");
    const arts = artigos(env, "comEnviosLista");
    confere(arts.length === 4, `4 envios (o de id inválido fica fora): ${arts.length}`);
    const fila = artigoCom(env, "comEnviosLista", "na fila (4 a sair)");
    confere(!!fila && botoes(env, "Cancelar o que está na fila", env.e("comEnviosLista")).length === 1 && botoes(env, "Cancelar", fila).length === 1, "só o envio na fila tem 'Cancelar'");
    confere(texto(env, "comEnviosLista").includes("🚫 cancelado") && texto(env, "comEnviosLista").includes("✅ concluído"), "os outros estados");
    // relatório da convocação
    await clicar(env, botao(env, "Ver relatório", fila));
    const g = ultima(env, "GET comunicacao/envio");
    confere(!!g && g.consulta.envioId === String(srv.S.E.convocacao.envioId) && !g.corpoBruto, `GET envio?envioId=${g && g.consulta.envioId}`);
    const rel = texto(env, "comRelatorio");
    confere(rel.includes("Sininho: entregue ao serviço") && rel.includes(`${ATAQUE("situacaoACEITO")} 3`) && rel.includes(`na fila ${ATAQUE("situacaoPENDENTE")} 2`), `contagens por canal com o rótulo da situação: ${rel.slice(0, 300)}`);
    confere(!rel.includes("[situacaoFalsa]") && !rel.includes(" 7"), "situação de código inválido fica fora");
    confere(rel.includes("Leram no sininho: 1") && rel.includes("Deram ciência (\"Recebi a convocação\"): 1"), "lidos e ciência");
    confere(rel.includes("Não alcançados") && rel.includes(ATAQUE("naoAlcNome")) && rel.includes(ATAQUE("naoAlcNomeSemTel")) && rel.includes(ATAQUE("naoAlcCong")), "quem não foi alcançado, com nome e congregação");
    confere(!rel.includes("Mostrando"), "a lista inteira: sem o aviso de lista cortada");
    confere(env.doc._ataques.length === 0 && env.ctx.__xss.chamadas.length === 0, "o relatório não virou marcação");
    const links = desc(env, env.e("comRelatorio")).filter(x => x.localName === "a");
    confere(links.length === 1 && links[0].getAttribute("href") === "tel:91988887777" && links[0].textContent === "(91) 98888-7777" + ATAQUE("telefone"), `o tel: só com os dígitos; o texto do telefone como texto (${links.map(l => l.getAttribute("href")).join(",")})`);
    // a lista vem cortada (500 de N): a tela diz quantos mostra de quantos
    Object.assign(srv.S.E.convocacao, { naoAlcancadosTotal: 812, naoAlcancadosCortado: true });
    await clicar(env, botao(env, "Ver relatório", fila));
    confere(texto(env, "comRelatorio").includes("Mostrando 2 de 812"), "lista cortada: 'Mostrando 2 de 812'");
    Object.assign(srv.S.E.convocacao, { naoAlcancadosTotal: 2, naoAlcancadosCortado: false });
    // relatório de um envio que não é convocação
    await clicar(env, botao(env, "Ver relatório", artigos(env, "comEnviosLista").find(a => a.textContent.includes("Congresso") && a.textContent.includes("concluído"))));
    confere(!texto(env, "comRelatorio").includes("Deram ciência") && !texto(env, "comRelatorio").includes("Não alcançados") && texto(env, "comRelatorio").includes("Leram no sininho"), "fora da convocação: sem ciência e sem a lista");
    // 404: a mesma resposta para "não existe" e "não é seu"
    env.api.rotas["GET comunicacao/envio"] = { status: 404, corpo: { sucesso: false, mensagem: "Não encontrado." } };
    await clicar(env, botao(env, "Ver relatório", fila));
    confere(texto(env, "comRelatorio") === "Não foi possível abrir este envio.", "404: a frase neutra no lugar do relatório");
    delete env.api.rotas["GET comunicacao/envio"];
    // cancelar
    let m = await clicarEResponder(env, botao(env, "Cancelar o que está na fila"), false);
    confere(m.aberto && m.texto.includes("Cancelar o que ainda está na fila") && chamadas(env, "POST comunicacao/cancelar").length === 0, "cancelar pede confirmação; desistir não cancela");
    m = await clicarEResponder(env, botao(env, "Cancelar o que está na fila"), true);
    const c = ultima(env, "POST comunicacao/cancelar");
    confere(!!c && JSON.stringify(c.corpo) === JSON.stringify({ envioId: srv.S.E.convocacao.envioId }), `POST cancelar {envioId}: ${c && JSON.stringify(c.corpo)}`);
    confere(texto(env, "comEnviosMsg").includes("Envio cancelado") && texto(env, "comEnviosMsg").includes(ATAQUE("msgCancelado")), "a mensagem do servidor, como texto");
    confere(chamadas(env, "GET comunicacao/envios").length === 2 && botoes(env, "Cancelar o que está na fila", env.e("comEnviosLista")).length === 0, "relê a lista: o envio cancelado sem o botão");
    // o Dirigente (não geral) não vê o telefone: o servidor não manda, e a tela não inventa link
    const env2 = novo(srv);
    srv.S.envios.push(Object.assign({}, srv.S.E.convocacao, { envioId: 790, enviadoPorId: 10, status: "CONCLUIDO" }));
    await abrirAba(env2);
    await secao(env2, "Envios");
    await clicar(env2, botao(env2, "Ver relatório", artigos(env2, "comEnviosLista")[0]));
    confere(texto(env2, "comRelatorio").includes("Não alcançados") && desc(env2, env2.e("comRelatorio")).filter(x => x.localName === "a").length === 0 && !texto(env2, "comRelatorio").includes("98888"), "sem telefone vindo do servidor: nenhum link tel:");
    limpo(env, "envios", [ATAQUE("enviadoPor"), ATAQUE("grupoDesc"), ATAQUE("msgCancelado")]);
    limpo(env2, "envios do Dirigente");
  });

  // v7.15 (revisão independente): o aviso de crise na fila não mostra "Cancelar" (ele é obrigatório; o servidor também recusa)
  cenario("Envios: o aviso de crise na fila não tem o botão de cancelar", async () => {
    const srv = servidor(); const env = novo(srv);
    const base = srv.S.envios.find(x => x.status === "FILA");
    srv.S.envios.push(Object.assign({}, base, { envioId: 990, categoria: "CRISE", categoriaRotulo: "Aviso de crise", titulo: "Regime de crise: porta-voz único", status: "FILA", naFila: 7 }));
    await abrirAba(env, "geral", 13, true);
    await secao(env, "Envios");
    const crise = artigoCom(env, "comEnviosLista", "Regime de crise: porta-voz único");
    confere(!!crise && botoes(env, "Cancelar", crise).length === 0, "o aviso de crise na fila não tem o botão de cancelar");
    confere(botoes(env, "Cancelar o que está na fila", env.e("comEnviosLista")).length === 1, "o comunicado comum na fila continua com o botão");
  });

  // ============================================================================================================================================
  // 5) MODELOS (nível geral)
  // ============================================================================================================================================
  cenario("Modelos: rascunho novo, editar, corrigir (versão nova com a chave), aprovar com 428, arquivar e apagar", async () => {
    const srv = servidor(); const env = novo(srv);
    await abrirAba(env, "geral", 13, true);
    await secao(env, "Modelos");
    confere(visivel(env, "comSecaoModelos") && chamadas(env, "GET comunicacao/modelos").length === 2, "a seção Modelos relê os modelos");
    const lista = env.e("comModelosLista");
    confere(artigos(env, "comModelosLista").length === 5, `5 modelos (o de id inválido fica fora): ${artigos(env, "comModelosLista").length}`);
    const art = (t) => artigoCom(env, "comModelosLista", t);
    const rasc = art("Devocional da semana"), aprov = art("Congresso de jovens"), arq = art("Campanha antiga"), estranho = art("Modelo estranho");
    confere(!!rasc && botoes(env, "Editar", rasc).length === 1 && botoes(env, "Aprovar", rasc).length === 1 && botoes(env, "Apagar rascunho", rasc).length === 1, "rascunho: Editar, Aprovar, Apagar rascunho");
    confere(!!aprov && botoes(env, "Corrigir (versão nova)", aprov).length === 1 && botoes(env, "Arquivar", aprov).length === 1 && aprov.textContent.includes("aprovado por"), "aprovado: Corrigir (versão nova), Arquivar, quem aprovou");
    confere(!!arq && botoes(env, "", arq).length === 0, "arquivado: nenhum botão");
    confere(!!estranho && estranho.textContent.includes(ATAQUE("statusModelo")) && botoes(env, "", estranho).length === 0, "status desconhecido: mostrado como texto, sem botão");
    const cats = env.e("comModeloCategoria").options.map(o => o.value);
    confere(JSON.stringify(cats) === JSON.stringify(["CONVOCACAO", "EVENTOS", "DEVOCIONAL", "FINANCEIRO"]) && texto(env, "comModeloForm").includes("Novo modelo"), `o formulário novo, com as 4 categorias: ${cats.join(",")}`);
    // novo rascunho
    const salvar = () => clicar(env, botao(env, "Guardar rascunho"));
    escolher(env, "comModeloCategoria", "EVENTOS"); digitar(env, "comModeloTitulo", "ab"); digitar(env, "comModeloCorpo", "Texto qualquer do comunicado.");
    await salvar();
    confere(texto(env, "comModelosMsg").includes("Escreva o título") && env.e("comModeloTitulo").value === "ab", "422: o motivo do servidor, e o formulário fica como estava");
    digitar(env, "comModeloTitulo", "Culto de Missões"); digitar(env, "comModeloCorpo", "Paz do Senhor, {{primeiro_nome}}! Culto de missões na {{congregacao}}.");
    await salvar();
    let p = ultima(env, "POST comunicacao/modelo");
    confere(!!p && JSON.stringify(p.corpo) === JSON.stringify({ categoria: "EVENTOS", titulo: "Culto de Missões", corpo: "Paz do Senhor, {{primeiro_nome}}! Culto de missões na {{congregacao}}." }), `rascunho novo: sem chave (${p && JSON.stringify(p.corpo)})`);
    confere(texto(env, "comModelosMsg").includes("Rascunho guardado") && !!art("Culto de Missões") && env.e("comModeloTitulo").value === "" && texto(env, "comModeloForm").includes("Novo modelo"), "guardado: aparece na lista e o formulário volta a 'Novo'");
    const novoId = srv.S.modelos.find(x => x.titulo === "Culto de Missões").modeloId;
    // editar o rascunho: a chave dele, no lugar
    await clicar(env, botao(env, "Editar", art("Devocional da semana")));
    confere(texto(env, "comModeloForm").includes("Editar o rascunho") && env.e("comModeloTitulo").value === srv.S.M.rascunho.titulo && env.e("comModeloCategoria").value === "DEVOCIONAL", "editar: o formulário com o rascunho (o título vai como valor, não como HTML)");
    digitar(env, "comModeloTitulo", "Devocional da semana"); digitar(env, "comModeloCorpo", "Leitura de hoje: Salmo 91, {{primeiro_nome}}.");
    const total = srv.S.modelos.length;
    await salvar();
    p = ultima(env, "POST comunicacao/modelo");
    confere(p.corpo.chave === "devocional-semanal-112233" && srv.S.modelos.length === total && srv.S.M.rascunho.corpo === "Leitura de hoje: Salmo 91, {{primeiro_nome}}.", `editar manda a chave e o rascunho muda no lugar (${p.corpo.chave})`);
    // corrigir o aprovado: a chave dele, versão nova
    await clicar(env, botao(env, "Corrigir (versão nova)", art("Congresso de jovens")));
    confere(texto(env, "comModeloForm").includes("Corrigir: a correção vira a versão seguinte"), "corrigir: o título do formulário explica a versão nova");
    digitar(env, "comModeloTitulo", "Congresso de jovens 2027"); digitar(env, "comModeloCorpo", "Paz do Senhor, {{primeiro_nome}}! O congresso será no sábado.");
    await salvar();
    p = ultima(env, "POST comunicacao/modelo");
    const v2 = srv.S.modelos.find(x => x.titulo === "Congresso de jovens 2027");
    confere(p.corpo.chave === srv.S.M.eventos.chave && !!v2 && v2.versao === 2 && v2.status === "RASCUNHO" && srv.S.M.eventos.status === "APROVADO", "corrigir manda a chave do aprovado (exata) e nasce a versão 2 em rascunho; a aprovada segue");
    // cancelar a edição: a chave some
    await clicar(env, botao(env, "Editar", art("Devocional da semana")));
    await clicar(env, botao(env, "Cancelar a edição"));
    confere(texto(env, "comModeloForm").includes("Novo modelo"), "cancelar a edição volta ao novo");
    digitar(env, "comModeloTitulo", "Outro aviso"); digitar(env, "comModeloCorpo", "Um aviso qualquer para todos.");
    await salvar();
    confere(!("chave" in ultima(env, "POST comunicacao/modelo").corpo), "depois de cancelar a edição, o próximo é novo (sem chave)");
    // aprovar um rascunho que mudou depois de a lista ser lida: 409, relê a lista e avisa; aprovar de novo vai com a impressão nova
    const outro = srv.S.modelos.find(x => x.titulo === "Outro aviso");
    srv.S.fatorOk = true;
    outro.corpo = "Um aviso qualquer, corrigido por outra pessoa.";
    const leiturasM = chamadas(env, "GET comunicacao/modelos").length;
    await clicarEResponder(env, botao(env, "Aprovar", art("Outro aviso")), true);
    confere(outro.status === "RASCUNHO" && texto(env, "comModelosMsg").includes("O texto deste rascunho mudou") && texto(env, "comModelosMsg").includes("A lista foi atualizada")
      && chamadas(env, "GET comunicacao/modelos").length === leiturasM + 1 && art("Outro aviso").textContent.includes("corrigido por outra pessoa"), "409: não aprova, avisa e relê a lista (o texto novo à vista)");
    await clicarEResponder(env, botao(env, "Aprovar", art("Outro aviso")), true);
    confere(outro.status === "APROVADO", "aprovar de novo, com a impressão do texto relido, aprova");
    srv.S.fatorOk = false;
    // aprovar com 428
    const hashAntes = (env.g("comModelos").find(x => x.modeloId === srv.S.M.rascunho.modeloId) || {}).hash;
    let m = await clicarEResponder(env, botao(env, "Aprovar", art("Devocional da semana")), false);
    confere(m.aberto && m.texto.includes("Aprovar \"Devocional da semana\"?") && m.texto.includes("corrigir cria a versão seguinte") && !chamadas(env, "POST comunicacao/aprovar-modelo").some(x => x.corpo.modeloId === srv.S.M.rascunho.modeloId), "aprovar pede confirmação; desistir não aprova");
    env.ctx.__fatorConfirmar = async () => { srv.S.fatorOk = true; return true; };
    m = await clicarEResponder(env, botao(env, "Aprovar", art("Devocional da semana")), true);
    const ap = chamadas(env, "POST comunicacao/aprovar-modelo").filter(x => x.corpo.modeloId === srv.S.M.rascunho.modeloId);
    const hashVisto = hashAntes;
    confere(typeof hashVisto === "string" && hashVisto.includes("[hashModelo]"), "sanidade: o modelo da lista traz a impressão digital do servidor");
    confere(ap.length === 2 && env.g("window.__fatorPedidos") === 1 && ap.every(x => JSON.stringify(x.corpo) === JSON.stringify({ modeloId: srv.S.M.rascunho.modeloId, hash: hashVisto })), `aprovar: 428, confirmação e uma nova tentativa com {modeloId, hash} (${ap.length}: ${ap[0] && JSON.stringify(ap[0].corpo).slice(0, 80)})`);
    confere(srv.S.M.rascunho.status === "APROVADO" && texto(env, "comModelosMsg").includes("Modelo aprovado") && botoes(env, "Corrigir (versão nova)", art("Devocional da semana")).length === 1, "aprovado: relê e mostra como aprovado");
    // arquivar o aprovado
    m = await clicarEResponder(env, botao(env, "Arquivar", art("Convocação da AGO")), true);
    confere(m.texto.includes("Arquivar este modelo?") && JSON.stringify(ultima(env, "POST comunicacao/arquivar-modelo").corpo) === JSON.stringify({ modeloId: srv.S.M.convocacao.modeloId }) && srv.S.M.convocacao.status === "ARQUIVADO", "arquivar: confirmação e {modeloId}");
    confere(texto(env, "comModelosMsg").includes("Modelo arquivado."), "a mensagem de arquivado");
    // apagar o rascunho novo
    m = await clicarEResponder(env, botao(env, "Apagar rascunho", art("Culto de Missões")), true);
    confere(m.texto.includes("Apagar este rascunho?") && ultima(env, "POST comunicacao/arquivar-modelo").corpo.modeloId === novoId && !art("Culto de Missões") && texto(env, "comModelosMsg").includes("Rascunho apagado."), "apagar rascunho: confirmação, some da lista");
    limpo(env, "modelos", [ATAQUE("corpoArquivado"), ATAQUE("aprovadoPor"), ATAQUE("rotuloCatDEVOCIONAL")]);
    // o rascunho também não aparece em Enviar
    await secao(env, "Enviar");
    confere(!env.e("comEnvModelo").options.some(o => o.value === String(v2.modeloId)), "o rascunho novo não aparece para envio");
    void lista;
  });

  // ============================================================================================================================================
  // 6) FICHA EM PAPEL
  // ============================================================================================================================================
  cenario("Ficha em papel (só o nível geral): validação, referência da ficha, 428 e o corpo do POST", async () => {
    const srv = servidor(); const env = novo(srv);
    await abrirAba(env, "geral", 13, true);
    await secao(env, "Ficha");
    confere(visivel(env, "comSecaoFicha") && !visivel(env, "comSecaoEnviar"), "a seção Ficha abre");
    confere(JSON.stringify(env.e("comFichaCategoria").options.map(o => o.value)) === '["EVENTOS","DEVOCIONAL","FINANCEIRO"]', "só as categorias com consentimento (a convocação não tem ficha)");
    confere(JSON.stringify(env.e("comFichaCanal").options.map(o => o.value)) === '["EMAIL","PUSH"]', "os 2 canais (o inválido fica fora)");
    confere(!!env.e("comFichaReferencia") && env.e("comFichaReferencia").getAttribute("maxlength") === "100", "o campo da referência da ficha (até 100)");
    const lancar = () => clicar(env, botao(env, "Lançar a ficha"));
    await lancar();
    confere(texto(env, "comFichaMsg") === "Informe a matrícula.", "sem matrícula");
    digitar(env, "comFichaMatricula", "50");
    await lancar();
    confere(texto(env, "comFichaMsg") === "Marque se a pessoa autorizou ou não.", "sem o sim/não");
    marcar(env, "comFichaSim");
    await lancar();
    confere(texto(env, "comFichaMsg") === "Informe a data da ficha.", "sem a data");
    digitar(env, "comFichaData", "2026-10-01"); escolher(env, "comFichaCategoria", "DEVOCIONAL"); escolher(env, "comFichaCanal", "PUSH");
    await lancar();
    confere(texto(env, "comFichaMsg").includes("Informe onde a ficha está guardada"), "sem a referência da ficha");
    digitar(env, "comFichaReferencia", "  L1 ");
    await lancar();
    confere(texto(env, "comFichaMsg").includes("Informe onde a ficha está guardada") && chamadas(env, "POST comunicacao/ficha").length === 0, "referência curta (menos de 3): recusa na tela; nada saiu");
    digitar(env, "comFichaReferencia", "Livro 3, folha 12");
    marcar(env, "comFichaNao");
    confere(caixa(env, "comFichaSim") === false, "o rádio: marcar 'Não autorizou' desmarca 'Autorizou'");
    // a confirmação reforçada (428): pede uma vez e repete
    env.ctx.__fatorConfirmar = async () => { srv.S.fatorOk = true; return true; };
    await lancar();
    const ps = chamadas(env, "POST comunicacao/ficha");
    const esperado = { membroId: 50, canal: "PUSH", categoria: "DEVOCIONAL", concedido: false, dataFicha: "2026-10-01", fichaReferencia: "Livro 3, folha 12" };
    confere(ps.length === 2 && env.g("window.__fatorPedidos") === 1 && ps.every(p => JSON.stringify(p.corpo) === JSON.stringify(esperado)), `428 e uma nova tentativa; POST ficha: ${ps[0] && JSON.stringify(ps[0].corpo)}`);
    confere(texto(env, "comFichaMsg").includes("Nada mudou") && texto(env, "comFichaMsg").includes(ATAQUE("msgFicha")), "a mensagem do servidor, como texto");
    marcar(env, "comFichaSim");
    await lancar();
    confere(ultima(env, "POST comunicacao/ficha").corpo.concedido === true && (srv.S.consent[50] || {})["PUSH|DEVOCIONAL"] === true && texto(env, "comFichaMsg").includes("Ficha lançada."), "autorizou: concedido true, gravado");
    // a pessoa marcou em Meu Painel depois da data da ficha: o 422, tal qual
    srv.S.fichaDepois = true;
    await lancar();
    confere(texto(env, "comFichaMsg").includes("depois da data desta ficha") && texto(env, "comFichaMsg").includes(ATAQUE("msg422")), "422 'depois da data desta ficha': tal qual");
    srv.S.fichaDepois = false;
    digitar(env, "comFichaMatricula", "999");
    await lancar();
    confere(texto(env, "comFichaMsg") === "Matrícula não encontrada no seu território.", "404: a frase própria");
    digitar(env, "comFichaMatricula", "abc");
    const n = chamadas(env, "POST comunicacao/ficha").length;
    await lancar();
    confere(chamadas(env, "POST comunicacao/ficha").length === n && texto(env, "comFichaMsg") === "Informe a matrícula.", "matrícula que não é número: recusa na tela");
    // fator recusado: uma chamada só, a mensagem da confirmação
    srv.S.fatorOk = false; env.ctx.__fatorConfirmar = async () => false;
    digitar(env, "comFichaMatricula", "50");
    const n2 = chamadas(env, "POST comunicacao/ficha").length;
    await lancar();
    confere(chamadas(env, "POST comunicacao/ficha").length === n2 + 1 && texto(env, "comFichaMsg") === msgs(env).fator, "fator recusado: uma chamada e a mensagem da confirmação");
    limpo(env, "ficha", [ATAQUE("msgFicha")]);
  });

  // ============================================================================================================================================
  // 7) SAÍDA, TROCA DE LOGIN, RESPOSTAS ATRASADAS, PRAZO DE 20 s, 401
  // ============================================================================================================================================
  const NOMES_SENSIVEIS = ["Ana Comunicada", "98888", "Bento Semcontato", "Paz do Senhor, Ana"];
  const semSensiveis = (env, qual) => { const h = env.doc.body.innerHTML; for (const t of NOMES_SENSIVEIS) confere(!h.includes(t), `${qual}: "${t}" ainda está na página`); };

  cenario("Sair da sessão, trocar de login, sair da aba e da sub-aba: nada fica na página", async () => {
    const srv = servidor(); const env = novo(srv);
    srv.S.sessoes.geral.membroId = 13;
    srv.S.entregas.push({ membroId: 13, envioId: srv.S.E.convocacao.envioId, cienciaEm: null, lido: false });
    srv.S.membros[13].nome = "Ana Comunicada Presidente";
    await abrirMeu(env, "geral", 13);
    confere(texto(env, "comMeuComunicados").includes("Paz do Senhor") || artigos(env, "comMeuComunicados").length === 1, "Meu Painel carregado");
    await abrirAba(env, "geral", 13, true);
    confere(texto(env, "comMeuPrefs") === "" && texto(env, "comMeuComunicados") === "", "ir para a aba da liderança limpa Meu Painel → Comunicações");
    await secao(env, "Envios");
    await clicar(env, botao(env, "Ver relatório", artigoCom(env, "comEnviosLista", "na fila")));
    confere(texto(env, "comRelatorio").includes("Ana Comunicada") && texto(env, "comRelatorio").includes("98888"), "o relatório com nome e telefone está na tela");
    env.ev("limparSessao()"); await env.ocioso();
    for (const id of ["comEnvForm", "comEnvPrevia", "comEnvResultado", "comEnviosLista", "comRelatorio", "comModelosLista", "comModeloForm", "comFichaForm", "comMeuPrefs", "comMeuComunicados"]) confere(env.e(id).innerHTML === "", `sair da sessão: ${id} vazio`);
    semSensiveis(env, "sair da sessão");
    confere(visivel(env, "comSecaoEnviar") && !visivel(env, "comSecaoEnvios") && !visivel(env, "comSemAcesso"), "sair da sessão: volta à seção Enviar, sem o aviso de sem acesso");
    // o próximo login (outra pessoa) começa do zero e pede com o próprio token
    await abrirAba(env, "lid2", 14);
    confere(ultima(env, "GET comunicacao/catalogos").token === "lid2" && texto(env, "comEnviosLista") === "", "a próxima pessoa começa do zero");
    // trocar de login sem passar pela saída (sessão nova por cima): o dono mudou, a tela é limpa antes de qualquer coisa
    const env2 = novo(srv);
    await abrirAba(env2, "geral", 13, true);
    await secao(env2, "Envios");
    await clicar(env2, botao(env2, "Ver relatório", artigoCom(env2, "comEnviosLista", "na fila")));
    const r = env2.retem(x => x.chave === "GET comunicacao/catalogos");
    await abrirAba(env2, "lid", 10);
    confere(texto(env2, "comRelatorio") === "" && texto(env2, "comEnviosLista") === "", "trocou o dono: o relatório da pessoa anterior saiu antes da resposta do servidor");
    r.liberar(); await env2.ocioso();
    semSensiveis(env2, "troca de login");
    // a mesma pessoa, de senha para PIN, também é outro dono
    confere(env2.g("comChaveDoDono()") === "10|senha", "o dono leva a matrícula e o tipo da sessão");
    // sair da aba
    const env3 = novo(srv);
    await abrirAba(env3, "geral", 13, true);
    escolher(env3, "comEnvModelo", String(srv.S.M.eventos.modeloId)); await env3.ocioso(); await prever(env3);
    await secao(env3, "Envios");
    await clicar(env3, botao(env3, "Ver relatório", artigoCom(env3, "comEnviosLista", "na fila")));
    env3.ev('mostrarAbaSecretaria("meupainel")'); await env3.ocioso();
    for (const id of ["comEnvForm", "comEnvPrevia", "comEnviosLista", "comRelatorio"]) confere(env3.e(id).innerHTML === "", `sair da aba: ${id} vazio`);
    semSensiveis(env3, "sair da aba");
    confere(env3.g("comPrevia") === null && env3.g("comGrupos").length === 0, "sair da aba esquece a contagem e os grupos");
    // sair da sub-aba
    const env4 = novo(srv);
    await abrirMeu(env4);
    confere(artigos(env4, "comMeuComunicados").length === 3, "comunicados na tela");
    env4.ev('mostrarSubAbaMeupainel("perfil")'); await env4.ocioso();
    confere(texto(env4, "comMeuPrefs") === "" && texto(env4, "comMeuComunicados") === "" && env4.g("comPrefs") === null, "sair da sub-aba limpa as escolhas e os comunicados");
    semSensiveis(env4, "sair da sub-aba");
    env4.ev('mostrarAbaSecretaria("documentos")'); await env4.ocioso();
    confere(texto(env4, "comMeuPrefs") === "", "ir para outra aba também");
  });

  cenario("Respostas atrasadas não repintam depois de sair; o prazo de 20 s; 401", async () => {
    const srv = servidor();
    // envios atrasados: saiu da aba
    let env = novo(srv);
    await abrirAba(env, "geral", 13, true);
    let r = env.retem(x => x.chave === "GET comunicacao/envios");
    await secao(env, "Envios");
    env.ev('mostrarAbaSecretaria("meupainel")'); await env.ocioso();
    r.liberar(); await env.ocioso();
    confere(texto(env, "comEnviosLista") === "", "a lista de envios que chega depois de sair da aba não é pintada");
    // escolhas atrasadas: saiu da sub-aba
    env = novo(srv);
    r = env.retem(x => x.chave === "GET comunicacao/preferencias");
    await abrirMeu(env);
    env.ev('mostrarSubAbaMeupainel("perfil")'); await env.ocioso();
    r.liberar(); await env.ocioso();
    confere(texto(env, "comMeuPrefs") === "" && texto(env, "comMeuComunicados") === "", "as escolhas que chegam depois de sair da sub-aba não são pintadas");
    // relatório atrasado: trocou de login
    env = novo(srv);
    await abrirAba(env, "geral", 13, true);
    await secao(env, "Envios");
    r = env.retem(x => x.chave === "GET comunicacao/envio");
    env.doc.clicar(botao(env, "Ver relatório", artigoCom(env, "comEnviosLista", "na fila"))); await env.ocioso();
    env.ev("limparSessao()"); await abrirAba(env, "lid", 10);
    r.liberar(); await env.ocioso();
    confere(texto(env, "comRelatorio") === "", "o relatório que chega depois da troca de login não é pintado");
    semSensiveis(env, "relatório atrasado");
    // relatório atrasado: pediu outro depois (o último vence)
    env = novo(srv);
    await abrirAba(env, "geral", 13, true);
    await secao(env, "Envios");
    r = env.retem(x => x.chave === "GET comunicacao/envio");
    env.doc.clicar(botao(env, "Ver relatório", artigoCom(env, "comEnviosLista", "na fila"))); await env.ocioso();
    await clicar(env, botao(env, "Ver relatório", artigoCom(env, "comEnviosLista", "cancelado")));
    r.liberar(); await env.ocioso();
    confere(!texto(env, "comRelatorio").includes("Não alcançados") && texto(env, "comRelatorio").includes("7 pessoa(s)"), "o relatório pedido por último é o que fica");
    // envio atrasado: saiu da aba enquanto enviava
    env = novo(srv);
    await abrirAba(env, "geral", 13, true);
    escolher(env, "comEnvModelo", String(srv.S.M.eventos.modeloId)); await env.ocioso(); await prever(env);
    srv.S.fatorOk = true;
    r = env.retem(x => x.chave === "POST comunicacao/enviar");
    env.doc.clicar(enviarBtn(env)); await env.responderModal(true); await env.ocioso();
    env.ev('mostrarAbaSecretaria("meupainel")'); await env.ocioso();
    r.liberar(); await env.ocioso();
    confere(texto(env, "comEnvResultado") === "" && texto(env, "comEnvMsg") === "", "o resultado do envio que chega depois de sair não é pintado");
    srv.S.fatorOk = false;
    // catálogo atrasado: trocou de login
    env = novo(srv);
    r = env.retem(x => x.chave === "GET comunicacao/catalogos");
    await abrirAba(env, "geral", 13, true);
    env.ev("limparSessao()"); await env.ocioso();
    r.liberar(); await env.ocioso();
    confere(texto(env, "comEnvForm") === "" && chamadas(env, "GET comunicacao/modelos").length === 0, "o catálogo que chega depois da saída não abre a aba");
    confere(env.g("comCat") === null, "e não fica guardado para a próxima pessoa");
    // prazo de 20 s: lista de envios
    env = novo(srv);
    await abrirAba(env, "geral", 13, true);
    r = env.retem(x => x.chave === "GET comunicacao/envios");
    env.doc.clicar(env.e("btnComSecaoEnvios")); await env.ocioso();
    confere(env.dispararTemporizador(20000) >= 1, "a chamada tem o prazo de 20 s");
    await env.ocioso();
    confere(texto(env, "comEnviosLista") === msgs(env).tempo, `prazo esgotado: a mensagem no lugar da lista (${texto(env, "comEnviosLista").slice(0, 80)})`);
    // prazo de 20 s: o envio (pode ter saído: confira em Envios; a contagem não vale mais)
    await secao(env, "Enviar");
    escolher(env, "comEnvModelo", String(srv.S.M.eventos.modeloId)); await env.ocioso(); await prever(env);
    srv.S.fatorOk = true;
    r = env.retem(x => x.chave === "POST comunicacao/enviar");
    env.doc.clicar(enviarBtn(env)); await env.responderModal(true); await env.ocioso();
    env.dispararTemporizador(20000); await env.ocioso();
    confere(texto(env, "comEnvMsg") === msgs(env).tempo && msgs(env).tempo.includes("confira em Envios") && enviarBtn(env).disabled, "envio sem resposta em 20 s: 'confira em Envios' e Enviar desabilitado");
    confere(env.api.chamadas.every(c => c.comPrazo && c.comToken), "toda chamada leva o prazo e o token");
    // 401: a sessão sai e a tela fica limpa
    env = novo(srv);
    await abrirAba(env, "geral", 13, true);
    env.api.rotas["GET comunicacao/envios"] = { status: 401, corpo: { sucesso: false, mensagem: "Sua sessão foi encerrada. Entre novamente." } };
    await secao(env, "Envios");
    confere(env.g("authToken") === null && env.g("window.__telaInicial") === 1 && texto(env, "comEnvForm") === "" && texto(env, "comEnviosLista") === "", "401: sai da sessão e nada fica na tela");
    // 403 do servidor numa ação: o aviso do fetchProtegido, sem repetir
    env = novo(srv);
    await abrirAba(env, "geral", 13, true);
    env.api.rotas["POST comunicacao/previa"] = { status: 403, corpo: { sucesso: false, mensagem: "Fora do seu escopo " + ATAQUE("msg403") } };
    escolher(env, "comEnvModelo", String(srv.S.M.eventos.modeloId)); await env.ocioso();
    await prever(env);
    confere(env.toasts().filter(t => t.includes("Fora do seu escopo")).length === 1 && texto(env, "comEnvMsg").includes("Fora do seu escopo") && enviarBtn(env).disabled, "403: um aviso só, o motivo na tela, Enviar desabilitado");
    limpo(env, "403", [ATAQUE("msg403")]);
  });

  // ============================================================================================================================================
  // 8) A PÁGINA DO LINK DO E-MAIL (sair.html + sair.js)
  // ============================================================================================================================================
  cenario("sair.html: link incompleto, inválido, válido (só lê), botão grava, já saiu, falhas", async () => {
    const TOKEN = "eyJtIjozMX0.assinatura_ok-123";
    const limpoSair = (s, qual) => {
      confere(s.doc._ataques.length === 0 && s.ctx.__xss.chamadas.length === 0 && !desc(s, s.doc.body).some(x => ["img", "svg"].includes(x.localName)), `${qual}: nada virou marcação`);
      confere(s.consoleDaTela.length === 0 && s.errosDaPagina.length === 0, `${qual}: console limpo e HTML íntegro`);
    };
    const msg = (s) => s.e("sairMsg").textContent;
    // sem t, e t comprido demais: nenhum pedido
    let s = criarAmbienteSair({ busca: "" });
    s.rodar(); await s.ocioso();
    confere(msg(s) === "Link incompleto. Abra de novo o link do e-mail." && s.api.chamadas.length === 0 && s.e("sairConteudo").hidden, "sem t: link incompleto, sem pedido");
    s = criarAmbienteSair({ busca: "?t=" + "a".repeat(401) });
    s.rodar(); await s.ocioso();
    confere(msg(s).includes("Link incompleto") && s.api.chamadas.length === 0, "t comprido demais: link incompleto, sem pedido");
    // inválido: a mensagem do servidor (como texto)
    s = criarAmbienteSair({ busca: "?t=" + encodeURIComponent(TOKEN), rotas: { GET: () => ({ status: 404, corpo: { sucesso: false, valido: false, mensagem: "Este link não vale mais. " + ATAQUE("sairInvalido") } }) } });
    s.rodar(); await s.ocioso();
    confere(msg(s) === "Este link não vale mais. " + ATAQUE("sairInvalido") && s.e("sairConteudo").hidden, "inválido: a mensagem do servidor, conteúdo escondido");
    confere(s.api.chamadas.length === 1 && s.api.chamadas[0].metodo === "GET" && s.api.chamadas[0].caminho === "/api/comunicacao-sair" && s.api.chamadas[0].consulta.t === TOKEN, "um GET com o t");
    limpoSair(s, "inválido");
    // inválido sem mensagem
    s = criarAmbienteSair({ busca: "?t=x", rotas: { GET: () => ({ status: 200, corpo: { valido: false } }) } });
    s.rodar(); await s.ocioso();
    confere(msg(s).includes("Este link não vale mais") && s.e("sairConteudo").hidden, "inválido sem mensagem: a frase padrão");
    // válido: rótulo e texto por textContent; abrir NÃO grava
    let posts = [];
    const rotas = {
      GET: () => ({ status: 200, corpo: { sucesso: true, valido: true, categoria: "EVENTOS", rotulo: "Eventos " + ATAQUE("sairRotulo"), texto: cm.TEXTO_SAIDA + ATAQUE("sairTexto"), jaSaiu: false } }),
      POST: (c) => { posts.push(c); return { status: 200, corpo: { sucesso: true, rotulo: "Eventos " + ATAQUE("sairRotuloPost"), jaEstava: false } }; }
    };
    s = criarAmbienteSair({ busca: "?t=" + encodeURIComponent(TOKEN) + "&utm=x", rotas });
    s.rodar(); await s.ocioso();
    confere(!s.e("sairConteudo").hidden && msg(s) === "" && s.e("sairCategoria").textContent === "Eventos " + ATAQUE("sairRotulo") && s.e("sairTexto").textContent === cm.TEXTO_SAIDA + ATAQUE("sairTexto"), "válido: categoria e texto como texto, botão à vista");
    confere(posts.length === 0 && s.api.chamadas.length === 1, "abrir a página só lê (nenhum POST)");
    confere(/^\/api\/comunicacao-sair\?t=/.test(s.api.chamadas[0].url) && s.api.chamadas[0].url.includes(encodeURIComponent(TOKEN)), "o t vai codificado no endereço");
    limpoSair(s, "válido");
    s.clicar(s.e("sairBotao")); await s.ocioso();
    confere(posts.length === 1 && posts[0].corpoBruto === JSON.stringify({ t: TOKEN }) && posts[0].cabecalhos["Content-Type"] === "application/json", `o botão manda POST {t}: ${posts[0] && posts[0].corpoBruto}`);
    confere(s.e("sairConteudo").hidden && msg(s).includes(`não recebe mais "Eventos ${ATAQUE("sairRotuloPost")}" por e-mail`) && msg(s).includes("A convocação oficial continua chegando"), "gravado: a confirmação, o conteúdo some");
    limpoSair(s, "gravado");
    // duplo clique: o botão desabilita e não manda dois
    posts = [];
    let liberar;
    const rotasLentas = Object.assign({}, rotas, { POST: (c) => { posts.push(c); return new Promise(res => { liberar = () => res({ status: 200, corpo: { sucesso: true, rotulo: "Eventos", jaEstava: true } }); }); } });
    s = criarAmbienteSair({ busca: "?t=" + TOKEN, rotas: rotasLentas });
    s.rodar(); await s.ocioso();
    s.clicar(s.e("sairBotao")); await s.ocioso();
    confere(s.e("sairBotao").disabled && s.clicar(s.e("sairBotao")) === false, "o botão desabilita enquanto grava");
    liberar(); await s.ocioso();
    confere(posts.length === 1, "um só POST");
    // já saiu: o aviso, sem botão
    s = criarAmbienteSair({ busca: "?t=" + TOKEN, rotas: { GET: () => ({ status: 200, corpo: { sucesso: true, valido: true, rotulo: "Devocional", texto: cm.TEXTO_SAIDA, jaSaiu: true } }) } });
    s.rodar(); await s.ocioso();
    confere(msg(s) === "Você já não recebe esta categoria por e-mail. Nada a fazer." && s.e("sairConteudo").hidden, "já saiu: o aviso e nenhum botão à vista");
    // POST recusado (429): o motivo e o botão de volta
    s = criarAmbienteSair({ busca: "?t=" + TOKEN, rotas: Object.assign({}, rotas, { POST: () => ({ status: 429, corpo: { sucesso: false, mensagem: "Tente de novo em instantes. " + ATAQUE("sair429") } }) }) });
    s.rodar(); await s.ocioso();
    s.clicar(s.e("sairBotao")); await s.ocioso();
    confere(!s.e("sairBotao").disabled && !s.e("sairConteudo").hidden && msg(s) === "Tente de novo em instantes. " + ATAQUE("sair429"), "429: o motivo e o botão volta");
    limpoSair(s, "429");
    // POST com rede caída: a mensagem e o botão de volta
    s = criarAmbienteSair({ busca: "?t=" + TOKEN, rotas });
    s.rodar(); await s.ocioso();
    s.api.redeCaida = true;
    s.clicar(s.e("sairBotao")); await s.ocioso();
    confere(!s.e("sairBotao").disabled && msg(s).includes("Não foi possível falar com o servidor"), "rede caída no botão: a mensagem e o botão de volta");
    // GET com rede caída e GET que não é JSON (página de erro do Azure)
    s = criarAmbienteSair({ busca: "?t=" + TOKEN, redeCaida: true });
    s.rodar(); await s.ocioso();
    confere(msg(s).includes("Não foi possível falar com o servidor") && s.e("sairConteudo").hidden, "GET com rede caída: a mensagem");
    s = criarAmbienteSair({ busca: "?t=" + TOKEN, rotas: { GET: () => ({ status: 500, naoJson: true }) } });
    s.rodar(); await s.ocioso();
    confere(msg(s).includes("Não foi possível falar com o servidor") && s.e("sairConteudo").hidden, "GET que não é JSON: a mensagem, sem quebrar");
  });

  cenario("O servidor imitado não teve erro nem ação desconhecida em nenhum cenário", async () => {
    for (const s of SERVIDORES) confere(s.S.erros.length === 0, `erro no servidor imitado (cenário "${s.cenario}"): ${s.S.erros.slice(0, 2).join(" | ").slice(0, 300)}`);
    confere(SERVIDORES.length >= 10, `servidores criados: ${SERVIDORES.length}`);
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
