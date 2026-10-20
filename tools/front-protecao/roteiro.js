// roteiro.js — a tela da v7.8 (Incidentes, notificação obrigatória e escuta protegida) contra o front de verdade, em DOM simulado, com a API simulada nos formatos reais do servidor
// (fixtures.js) e texto de ataque (<img src=x onerror=...>) em TODO campo que vem do servidor. Cobre: o painel público "Preciso de ajuda" (nenhuma chamada com token, o texto nunca
// vai para o armazenamento do navegador, 422/429/500/rede caída mostram 100 e 190), o registro de incidente em Meu Painel (validações antes de enviar, confirmação com o efeito real,
// resposta), a fila com o relógio ao vivo (faixas, vencido, relógio do servidor, intervalo que para ao sair), a ficha, a leitura protegida do relato (428, caixa que se apaga),
// comunicação, adendo, reclassificação, decisão do afastamento e encerramento (com a recusa do servidor), padrões, Comitê e relatório anual, a troca de login com resposta atrasada,
// duplo clique, rede caída/401/403/422/404 neutro e a acessibilidade dos formulários.
"use strict";
const fs = require("fs");
const path = require("path");
const { criarAmbiente, lerApp } = require("./ambiente");
const F = require("./fixtures");
const { ATAQUE, pm } = F;

const SRV = "2026-10-09T15:00:00.000Z";                  // o relógio do servidor nos cenários (o do aparelho é o mesmo, salvo quando o cenário diz o contrário)
const srvMs = Date.parse(SRV);
const em = (h, m = 0) => new Date(srvMs + (h * 60 + m) * 60000).toISOString();   // um instante relativo ao relógio do servidor (negativo = no passado)
const HOJE = "2026-10-09";                                 // o dia de hoje em Brasília para o relógio acima
const MIN = 60000;

async function rodar({ mutar = {}, so = null } = {}) {
  const T = { total: 0, falhas: [], cenarioAtual: "" };
  const confere = (cond, msg) => { T.total++; if (!cond) T.falhas.push(`${T.cenarioAtual}: ${msg}`); };
  const cenarios = [];
  const cenario = (nome, fn) => cenarios.push({ nome, fn });
  // um ato que fica esperando para sempre (por exemplo, uma confirmação que a tela devia ter dispensado) NÃO pode travar o roteiro: vira falha e o modal é fechado
  let ambienteAtual = null;
  const esperar = async (p) => {
    let tm; const limite = new Promise(r => { tm = setTimeout(() => r("__tempo"), 3000); });
    const r = await Promise.race([p, limite]); clearTimeout(tm);
    if (r === "__tempo") {
      T.total++; T.falhas.push(`${T.cenarioAtual}: o ato ficou esperando (confirmação aberta que ninguém respondeu)`);
      const env = ambienteAtual; if (env && !env.e("modalOverlay").classList.contains("escondido")) env.doc.clicar(env.e("modalCancelar"));
      await Promise.race([p, new Promise(r2 => setTimeout(r2, 500))]);
    }
    return r;
  };
  const novo = (opcoes) => criarAmbiente(Object.assign({ mutar }, opcoes || {}));
  // nada pode ter executado nem ter virado marcação: zero ataque no DOM, zero chamada de __xss, e o texto de ataque aparece como TEXTO
  const limpo = (env, qual, textos = []) => {
    confere(env.doc._ataques.length === 0, `${qual}: o texto de ataque virou marcação/atributo de evento (${JSON.stringify(env.doc._ataques.slice(0, 2))})`);
    confere(env.ctx.__xss.chamadas.length === 0, `${qual}: código do ataque EXECUTOU (${env.ctx.__xss.chamadas.join(",")})`);
    const corpo = env.doc.body.textContent;
    for (const t of textos) confere(corpo.includes(t), `${qual}: o texto do servidor "${t.slice(-14)}" não apareceu na tela como texto`);
    confere(env.doc._erros.length === 0, `${qual}: HTML malformado gerado (${env.doc._erros.slice(0, 2).join("; ")})`);
  };
  const achar = (env, f) => [...env.doc.body.descendentes()].find(f) || null;
  // botão pelo texto, sempre dentro das áreas desta tela (o index.html tem centenas de outros botões com textos parecidos)
  const REGIOES = ["prtTelaAjuda", "subMeupainelProtecao", "abaProtecao", "modalCaixa", "telaCheckin", "cxLoginPainel"];
  const botao = (env, texto, raiz) => {
    const raizes = raiz ? [raiz] : REGIOES.map(id => env.e(id)).filter(Boolean);
    for (const r of raizes) { const b = [...r.descendentes()].find(x => x.localName === "button" && x.textContent.includes(texto)); if (b) return b; }
    return null;
  };
  const link = (env, href, raiz) => [...raiz.descendentes()].find(x => x.localName === "a" && x.getAttribute("href") === href) || null;
  const chamadas = (env, chave) => env.api.chamadas.filter(c => c.chave === chave);
  const texto = (env, id) => (env.e(id) ? env.e(id).textContent : "");
  const idDe = (el) => JSON.parse(el.getAttribute("data-args-click"))[0];

  // acessibilidade: todo campo tem rótulo (label for, label em volta ou aria-label); todo botão tem texto; as áreas de aviso têm role=status
  const controlesSemNome = (env, raiz) => {
    const para = new Set([...env.doc.body.descendentes()].filter(x => x.localName === "label" && x.getAttribute("for")).map(x => x.getAttribute("for")));
    const falhas = [];
    for (const c of raiz.descendentes()) {
      if (c.localName === "button" && !c.textContent.trim() && !c.getAttribute("aria-label")) falhas.push(`botão sem texto (${c.id})`);
      if (!["input", "select", "textarea"].includes(c.localName) || c.type === "hidden") continue;
      let dentro = false;
      for (let p = c.parentNode; p && p.nodeType === 1; p = p.parentNode) if (p.localName === "label") dentro = true;
      if (c.getAttribute("aria-label") || (c.id && para.has(c.id)) || dentro) continue;
      falhas.push(`${c.localName}#${c.id}`);
    }
    return falhas;
  };
  const confereAcessibilidade = (env, raizes, qual) => {
    for (const id of raizes) { const raiz = env.e(id); confere(!!raiz, `${qual}: área ${id} não existe`); if (raiz) { const f = controlesSemNome(env, raiz); confere(f.length === 0, `${qual}: campo/botão sem nome acessível em ${id}: ${f.slice(0, 4).join(", ")}`); } }
  };
  const escolherNivel = (env, codigo) => {
    for (let i = 0; i < 3; i++) { const r = env.e(`prtRegNivel${i}`); if (r) r.checked = r.value === codigo; }
    const marcado = [0, 1, 2].map(i => env.e(`prtRegNivel${i}`)).find(r => r && r.checked);
    if (marcado) env.doc.disparar(marcado, "change");
  };
  const cssDoApp = () => {
    let css = lerApp("style.css");
    for (const [de, para] of (mutar["style.css"] || [])) { const n = css.split(de).length - 1; if (n !== 1) throw new Error(`mutação inaplicável em style.css (${n} ocorrências): ${de.slice(0, 80)}`); css = css.replace(de, () => para); }
    return css;
  };
  const clicarEResponder = async (env, el, confirmar) => { env.doc.clicar(el); const m = await env.responderModal(confirmar); await env.ocioso(); return m; };

  // ============================================================================================================================================
  // 0) O CONTRATO: o HTML, o módulo e o servidor falam dos mesmos nomes
  // ============================================================================================================================================
  cenario("Contrato: ids do HTML, ações registradas e campos do servidor", async () => {
    const html = lerApp("index.html").replace(/\r\n/g, "\n");
    const modulo = lerApp("modulos/protecao.js").replace(/\r\n/g, "\n");
    const idsDoHtml = new Set([...html.matchAll(/\bid="([^"$]+)"/g)].map(m => m[1]));
    const idsDoModulo = new Set([...modulo.matchAll(/\bid="(prt[A-Za-z0-9]+)(?:\$\{[^}]*\})?[^"]*"/g)].map(m => m[1]));
    const referidos = [...modulo.matchAll(/prtEl\("([A-Za-z0-9_]+)"\)/g)].map(m => m[1]);
    const semDono = [...new Set(referidos)].filter(id => !idsDoHtml.has(id) && ![...idsDoModulo].some(x => id === x));
    confere(semDono.length === 0, `ids que o módulo usa e nenhum HTML nem template cria: ${semDono.join(", ")}`);
    const contadores = [...modulo.matchAll(/prt[A-Za-z]+: \["(prt[A-Za-z]+)", \d+, \d+\]/g)].map(m => m[1]);
    confere(contadores.length === 8 && contadores.every(id => idsDoHtml.has(id) || idsDoModulo.has(id)), `contadores sem elemento: ${contadores.filter(id => !idsDoHtml.has(id) && !idsDoModulo.has(id)).join(", ")}`);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i && /^prt|Protecao/.test(id));
    confere(repetidos.length === 0, `ids repetidos no index.html: ${[...new Set(repetidos)].join(", ")}`);
    const faltam = F.contratoComOServidor();
    confere(faltam.length === 0, `campos que a tela lê e o servidor não tem mais: ${faltam.join(", ")}`);
    // o botão da aba está no módulo de Habilitação e a tela pública fica fora de qualquer outra tela
    const env = novo();
    const grupo = env.e("grupoModuloHabilitacao");
    confere(!!grupo && !!achar(env, x => x.id === "btnAbaProtecao" && x.parentNode === grupo), "btnAbaProtecao devia estar dentro de grupoModuloHabilitacao");
    confere(!!env.e("btnSubMeupainelProtecao") && !!env.e("subMeupainelProtecao"), "falta a sub-aba Proteção de crianças em Meu Painel");
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    confere(scripts.includes("modulos/protecao.js"), "o index.html não carrega modulos/protecao.js");
    const sw = lerApp("service-worker.js");
    // a casca sobe de versão a cada entrega (v34 na v7.10): basta não ser anterior à v33, a da v7.8, e trazer o módulo
    const versaoSw = Number((/ieadespa-app-shell-v(\d+)/.exec(sw) || [])[1]);
    confere(versaoSw >= 33 && sw.includes('"/modulos/protecao.js"'), `o service worker devia estar na v33 ou depois com /modulos/protecao.js na casca (v${versaoSw})`);
    confere(env.errosDaPagina === 0, `index.html com estrutura quebrada (${env.errosDaPagina} erro(s))`);
  });

  // ============================================================================================================================================
  // 1) PÚBLICO: Preciso de ajuda
  // ============================================================================================================================================
  cenario("Público: Preciso de ajuda (sem login, sem token, sem guardar o texto, 100 e 190 sempre à vista)", async () => {
    const env = ambienteAtual = novo(); const { doc, api, e } = env;
    const S = { modo: "ok" };
    const TEXTO = "Meu tio mexe comigo quando ninguém vê. Estou com medo de contar.";
    api.rotas = {
      "GET congregacoes-publico": { corpo: [{ congregacaoId: 2, nome: ATAQUE("congPub"), ativa: true }, { congregacaoId: 3, nome: "Norte" }] },
      "POST protecao-ajuda": () => {
        if (S.modo === "429") return { status: 429, corpo: F.falhaDeAjuda(`Você já enviou mensagens demais por agora. ${ATAQUE("msg429")}`) };
        if (S.modo === "500") return { status: 500, corpo: F.falhaDeAjuda(`Não conseguimos registrar agora. ${ATAQUE("msg500")}`) };
        if (S.modo === "semMensagem") return { status: 500, corpo: { sucesso: false } };          // L4: erro em JSON sem `mensagem` (um proxy, por exemplo)
        if (S.modo === "naoJson") return { status: 502, naoJson: true, corpo: {} };
        if (S.modo === "422") return { status: 422, corpo: F.falhaDeAjuda(`Escreva o que você quer contar, com as suas palavras. ${ATAQUE("msg422")}`) };
        if (S.modo === "naoAvisada") { const nao = F.confirmacaoDeAjuda(ATAQUE("protocolo"), false); nao.contatosDeAjuda = F.catalogosComAtaque().contatosDeAjuda; return { status: 201, corpo: nao }; }   // M4: gravado, mas ninguém foi avisado
        const ok = F.confirmacaoDeAjuda(ATAQUE("protocolo"), true);
        ok.mensagem = `${pm.textoConfirmacaoDeAjuda({ avisada: true })} ${ATAQUE("msgOk")}`;
        ok.contatosDeAjuda = F.catalogosComAtaque().contatosDeAjuda;
        return { status: 201, corpo: ok };
      }
    };
    // a porta de entrada: o botão está na tela de entrada e na do login
    const entrada = botao(env, "Preciso de ajuda", e("telaCheckin"));
    confere(!!entrada && !!botao(env, "Preciso de ajuda", e("cxLoginPainel")), "o botão 'Preciso de ajuda' devia estar na tela de entrada e na do login");
    doc.clicar(entrada); await env.ocioso();
    const tela = e("prtTelaAjuda");
    confere(tela.style.display === "flex" && e("telaCheckin").style.display === "none", "a tela de ajuda devia abrir e esconder a de entrada");
    confere(/Você não tem culpa\. Pode contar do seu jeito\. Uma pessoa preparada vai ler\./.test(tela.textContent), "o texto de acolhimento ('Você não tem culpa...') faltou");
    confere(!!link(env, "tel:100", tela) && !!link(env, "tel:190", tela), "os telefones 100 e 190 (links tel:) têm de estar na tela de ajuda");
    const rotulos = [...tela.descendentes()].filter(x => x.localName === "label").map(x => x.textContent);
    confere(["Conte o que aconteceu, com as suas palavras", "Quem está escrevendo?", "Como falar com você (opcional)", "Qual igreja? (opcional)"].every(r => rotulos.some(x => x.includes(r))), `rótulos do formulário: ${rotulos.join(" | ")}`);
    confere(!/prova|comprov|document/i.test(tela.textContent.replace(/Comprovante/g, "")), "a tela pública não pode pedir prova nem documento");
    confere([...e("prtAjudaPubCong").options].some(o => o.textContent.includes("[congPub]")) && e("prtAjudaPubCong").options.length === 3, "a lista de igrejas devia vir da rota pública (mais a opção 'não sei')");
    limpo(env, "Público/abertura", [ATAQUE("congPub")]);
    confere(api.chamadas.every(c => !c.comToken), "o canal público não pode mandar token em NENHUMA chamada");

    // validações da tela (antes de enviar; sem culpa, sem juridiquês)
    env.limparRegistro();
    doc.clicar(e("prtAjudaPubBotao")); await env.ocioso();
    confere(chamadas(env, "POST protecao-ajuda").length === 0 && /pelo menos 10 letras/.test(texto(env, "prtAjudaPubResultado")), "texto vazio não pode enviar e devia explicar");
    confere(env.foco() === e("prtAjudaPubTexto"), "L9: depois de uma validação o foco vai para o campo do texto");
    e("prtAjudaPubTexto").value = "oi"; doc.clicar(e("prtAjudaPubBotao")); await env.ocioso();
    confere(chamadas(env, "POST protecao-ajuda").length === 0, "texto curto não pode enviar");
    e("prtAjudaPubTexto").value = "Preciso falar <b>com alguém</b> hoje"; doc.clicar(e("prtAjudaPubBotao")); await env.ocioso();
    confere(chamadas(env, "POST protecao-ajuda").length === 0 && /sinais < e >/.test(texto(env, "prtAjudaPubResultado")), "texto com < ou > não pode enviar e devia explicar");
    e("prtAjudaPubTexto").value = "x".repeat(4001); doc.clicar(e("prtAjudaPubBotao")); await env.ocioso();
    confere(chamadas(env, "POST protecao-ajuda").length === 0 && /muito grande/.test(texto(env, "prtAjudaPubResultado")), "texto de mais de 4000 letras não pode enviar");
    e("prtAjudaPubTexto").value = TEXTO; e("prtAjudaPubContato").value = "tel <1>"; doc.clicar(e("prtAjudaPubBotao")); await env.ocioso();
    confere(chamadas(env, "POST protecao-ajuda").length === 0, "contato com < ou > não pode enviar");

    // enviar de verdade: só o texto é obrigatório; o resto é opcional
    e("prtAjudaPubContato").value = "WhatsApp 11 99999-0000"; doc.escolher(e("prtAjudaPubQuem"), "CRIANCA_ADOLESCENTE"); doc.escolher(e("prtAjudaPubCong"), "2");
    env.limparRegistro();
    doc.clicar(e("prtAjudaPubBotao")); await env.ocioso();
    const p = chamadas(env, "POST protecao-ajuda");
    confere(p.length === 1, `devia sair UM pedido (saíram ${p.length})`);
    confere(p[0] && p[0].comToken === false && !("x-auth-token" in p[0].cabecalhos) && !("authorization" in p[0].cabecalhos), "o pedido de ajuda NÃO pode levar token nem cabeçalho de sessão");
    confere(p[0] && JSON.stringify(p[0].corpo) === JSON.stringify({ texto: TEXTO, quemSou: "CRIANCA_ADOLESCENTE", contato: "WhatsApp 11 99999-0000", congregacaoId: 2 }) && typeof p[0].corpo.congregacaoId === "number", `corpo do pedido: ${JSON.stringify(p[0] && p[0].corpo)}`);
    const res = e("prtAjudaPubResultado");
    confere(res.textContent.includes("[msgOk]") && res.textContent.includes("[protocolo]") && /Número do seu pedido/.test(res.textContent) && /Recebemos o que você contou/.test(res.textContent), "a confirmação (mensagem do servidor e protocolo) devia aparecer");
    confere(res.textContent.includes("Pessoas preparadas da liderança da Igreja foram avisadas") && res.className.includes("prt-ajuda-ok"), "M4: com a liderança avisada a confirmação é a de sempre, no verde");
    confere(!!link(env, "tel:100", res) && !!link(env, "tel:190", res) && res.textContent.includes("[contatoNome0]"), "depois de enviar, os telefones do servidor (100 e 190) devem aparecer na resposta");
    confere(e("prtAjudaPubTexto").value === "" && e("prtAjudaPubContato").value === "" && e("prtAjudaPubQuem").value === "" && e("prtAjudaPubCong").value === "", "depois de enviar, o campo e as escolhas devem ser limpos");
    confere(!doc.body.textContent.includes("Meu tio mexe"), "o texto da criança não pode continuar na tela depois de enviado");
    confere(env.gravacoes.length === 0, `o texto NUNCA pode ir para localStorage/sessionStorage (${JSON.stringify(env.gravacoes).slice(0, 80)})`);
    confere(env.toasts().length === 0, "o canal público não deve soltar toast (a resposta fica na própria tela)");
    confere(env.foco() === res && res.getAttribute("tabindex") === "-1", "L9: depois de enviar o foco vai para a caixa da resposta (a criança lê o número do pedido)");
    confere(![...env.temporizadores.values()].some(t => t.ms === 30000), "(c) o limite de 30 s é desarmado quando a resposta chega");
    limpo(env, "Público/enviado", [ATAQUE("protocolo"), ATAQUE("msgOk")]);

    // M2: o segundo toque em "Enviar" depois do envio (campo vazio) NÃO apaga o número do pedido: o botão fica travado até o texto ser mexido de novo
    confere(e("prtAjudaPubBotao").disabled === true, "M2: depois de um envio que deu certo o botão devia ficar travado até a pessoa voltar a mexer no texto");
    env.limparRegistro();
    doc.clicar(e("prtAjudaPubBotao")); await env.ocioso();
    await esperar(env.ev("prtEnviarAjudaAcao('Pub', document.getElementById('prtAjudaPubBotao'))")); await env.ocioso();   // e mesmo por chamada direta, sem passar pelo botão
    confere(chamadas(env, "POST protecao-ajuda").length === 0, "M2: o segundo toque não pode mandar nada");
    confere(res.textContent.includes("[protocolo]") && /Número do seu pedido/.test(res.textContent) && !/pelo menos 10 letras/.test(res.textContent) && res.className.includes("prt-ajuda-ok"), `M2: o número do pedido e a confirmação continuam na tela (a mensagem de 'falta texto' não os apaga): ${res.textContent.slice(0, 60)}`);
    confere(!!link(env, "tel:100", tela) && !!link(env, "tel:190", tela) && !!link(env, "tel:100", res), "M2: o 100 e o 190 (estáticos e os da resposta) seguem à vista");
    confere(env.toasts().length === 0, "M2: o segundo toque não solta aviso nenhum");

    // duplo clique: um pedido só (digitar de verdade, com o evento de entrada, destrava o botão do envio anterior)
    doc.digitar(e("prtAjudaPubTexto"), TEXTO); env.limparRegistro();
    confere(e("prtAjudaPubBotao").disabled === false, "M2: voltar a digitar no texto destrava o botão");
    const dup = env.ev("(function(){ const b = document.getElementById('prtAjudaPubBotao'); return Promise.all([prtEnviarAjudaAcao('Pub', b), prtEnviarAjudaAcao('Pub', b)]); })()");
    await esperar(dup); await env.ocioso();
    confere(chamadas(env, "POST protecao-ajuda").length === 1, `duplo clique: devia sair UM pedido só (saíram ${chamadas(env, "POST protecao-ajuda").length})`);
    confere(/Aguarde/.test(env.toasts().join("|")), "duplo clique: devia avisar 'Aguarde'");
    confere(e("prtAjudaPubBotao").disabled === true && e("prtAjudaPubTexto").value === "", "duplo clique: com o envio feito o botão fica travado (M2) e o campo vazio");

    // falhas: o texto FICA no campo, a mensagem do servidor aparece e 100/190 estão sempre à vista
    for (const [modo, marca] of [["429", "[msg429]"], ["500", "[msg500]"], ["422", "[msg422]"], ["naoJson", "NÃO foi enviada"], ["semMensagem", "NÃO foi enviada"]]) {
      S.modo = modo; doc.digitar(e("prtAjudaPubTexto"), TEXTO); env.limparRegistro();
      doc.clicar(e("prtAjudaPubBotao")); await env.ocioso();
      const r = e("prtAjudaPubResultado");
      confere(r.textContent.includes(marca), `falha ${modo}: a mensagem esperada ("${marca}") não apareceu`);
      confere(!!link(env, "tel:100", r) && !!link(env, "tel:190", r), `falha ${modo}: os telefones 100 e 190 têm de aparecer junto da mensagem`);
      confere(e("prtAjudaPubTexto").value === TEXTO && e("prtAjudaPubBotao").disabled === false, `falha ${modo}: o texto devia ficar no campo e o botão ser solto`);
      confere(env.gravacoes.length === 0 && env.toasts().length === 0, `falha ${modo}: nada pode ir para o armazenamento nem para toast`);
      confere(env.foco() === r, `L9 falha ${modo}: o foco vai para a caixa da mensagem`);
      limpo(env, `Público/falha ${modo}`);
    }
    // L4: o erro em JSON SEM mensagem ainda diz que a mensagem NÃO foi enviada (e traz o 100 e o 190 padrão)
    confere(/Ela NÃO foi enviada/.test(texto(env, "prtAjudaPubResultado")) && /ligue 190/.test(texto(env, "prtAjudaPubResultado")) && /ligue 100/.test(texto(env, "prtAjudaPubResultado")), "L4: o erro sem mensagem devia cair no texto 'Ela NÃO foi enviada' com o 190 e o 100");
    S.modo = "ok"; api.redeCaida = true; doc.digitar(e("prtAjudaPubTexto"), TEXTO); env.limparRegistro();
    doc.clicar(e("prtAjudaPubBotao")); await env.ocioso();
    confere(/NÃO foi enviada/.test(texto(env, "prtAjudaPubResultado")) && !!link(env, "tel:190", e("prtAjudaPubResultado")) && e("prtAjudaPubTexto").value === TEXTO, "rede caída: mensagem clara, telefones e o texto ainda no campo");
    api.redeCaida = false;

    // (c) a rede não responde: depois de 30 s o envio desiste, diz que NÃO foi enviada, mantém o texto e mostra o 100 e o 190
    env.limparRegistro();
    const presaTempo = env.retem(x => x.chave === "POST protecao-ajuda");
    doc.clicar(e("prtAjudaPubBotao"));
    for (let i = 0; i < 30 && !presaTempo.chegou; i++) await new Promise(r => setImmediate(r));
    confere(presaTempo.chegou && /Enviando/.test(texto(env, "prtAjudaPubResultado")) && e("prtAjudaPubBotao").disabled === true, "(c) o pedido devia estar a caminho, com 'Enviando…' e o botão travado");
    confere([...env.temporizadores.values()].some(t => t.ms === 30000), "(c) o envio devia ter um limite de 30 s");
    env.dispararTemporizador(30000); await env.ocioso();
    confere(/NÃO foi enviada/.test(texto(env, "prtAjudaPubResultado")) && !!link(env, "tel:100", e("prtAjudaPubResultado")) && !!link(env, "tel:190", e("prtAjudaPubResultado")), "(c) passados 30 s: mensagem de que NÃO foi enviada, com o 100 e o 190");
    confere(e("prtAjudaPubTexto").value === TEXTO && e("prtAjudaPubBotao").disabled === false && env.toasts().length === 0, "(c) passados 30 s: o texto fica no campo, o botão é solto e não sai toast");
    confere(![...env.temporizadores.values()].some(t => t.ms === 30000), "(c) o temporizador não fica para trás");
    api.retencoes.length = 0;

    // M4: o servidor diz que NINGUÉM da liderança foi avisado: a tela mostra o que ele diz (não promete aviso), sai do verde e manda ligar
    S.modo = "naoAvisada"; env.limparRegistro();
    doc.clicar(e("prtAjudaPubBotao")); await env.ocioso();
    const rn = e("prtAjudaPubResultado");
    confere(rn.textContent.includes(pm.textoConfirmacaoDeAjuda({ avisada: false })) && !/foram avisadas/.test(rn.textContent), `M4: a tela devia mostrar o texto do servidor para 'ninguém foi avisado': ${rn.textContent.slice(0, 120)}`);
    confere(rn.className.includes("prt-ajuda-aviso") && !rn.className.includes("prt-ajuda-ok") && /Ligue agora/.test(rn.textContent), "M4: sem aviso a caixa sai do verde e manda ligar");
    confere(!!link(env, "tel:100", rn) && !!link(env, "tel:190", rn) && rn.textContent.includes("[protocolo]"), "M4: o 100, o 190 e o número do pedido aparecem");
    confere(e("prtAjudaPubTexto").value === "", "M4: o pedido está gravado: o campo é limpo");
    limpo(env, "Público/não avisada", [ATAQUE("protocolo")]);

    // L5: o que foi digitado ENQUANTO o pedido ia NÃO foi enviado: não pode ser apagado
    S.modo = "ok"; doc.digitar(e("prtAjudaPubTexto"), TEXTO); env.limparRegistro();
    const presaL5 = env.retem(x => x.chave === "POST protecao-ajuda");
    doc.clicar(e("prtAjudaPubBotao"));
    for (let i = 0; i < 30 && !presaL5.chegou; i++) await new Promise(r => setImmediate(r));
    confere(presaL5.chegou, "L5: o pedido devia estar a caminho");
    const SEGUNDA = "Depois lembrei de mais uma coisa que aconteceu na semana passada.";
    doc.digitar(e("prtAjudaPubTexto"), SEGUNDA);
    presaL5.liberar(); await env.ocioso(); api.retencoes.length = 0;
    confere(e("prtAjudaPubTexto").value === SEGUNDA, `L5: o texto digitado durante o envio devia ficar no campo (está "${e("prtAjudaPubTexto").value.slice(0, 30)}")`);
    confere(/Recebemos o que você contou/.test(texto(env, "prtAjudaPubResultado")) && e("prtAjudaPubBotao").disabled === false, "L5: a confirmação do primeiro aparece e o botão fica livre para a nova mensagem");
    env.limparRegistro();
    doc.clicar(e("prtAjudaPubBotao")); await env.ocioso();
    confere(chamadas(env, "POST protecao-ajuda").length === 1 && chamadas(env, "POST protecao-ajuda")[0].corpo.texto === SEGUNDA, "L5: a segunda mensagem sai inteira, como foi escrita");
    confere(e("prtAjudaPubTexto").value === "", "L5: a segunda, enviada sem mexer durante o envio, limpa o campo");

    // sair da tela apaga o que não foi enviado e volta para a entrada — DEPOIS de perguntar (L5)
    const voltar = () => achar(env, x => x.localName === "a" && /Voltar/.test(x.textContent) && [...tela.descendentes()].includes(x));
    doc.digitar(e("prtAjudaPubTexto"), "texto que a pessoa desistiu de mandar");
    doc.clicar(voltar()); let m = await env.responderModal(false); await env.ocioso();
    confere(m.aberto && /NÃO foi enviada/.test(m.texto) && /será apagado/.test(m.texto), `L5: com texto não enviado, 'Voltar' pergunta antes de apagar: ${m.texto.slice(0, 100)}`);
    confere(tela.style.display === "flex" && e("prtAjudaPubTexto").value === "texto que a pessoa desistiu de mandar" && env.foco() === e("prtAjudaPubTexto"), "L5: cancelar a pergunta fica na tela, com o texto e o foco no campo");
    doc.clicar(voltar()); m = await env.responderModal(true); await env.ocioso();
    confere(e("prtAjudaPubForm").innerHTML === "" && !doc.body.textContent.includes("desistiu de mandar"), "ao sair (confirmando), o formulário (e o texto não enviado) devia ser desmontado");
    confere(tela.style.display === "none" && e("telaCheckin").style.display === "flex", "ao sair, devia voltar para a tela de entrada");
    doc.clicar(entrada); await env.ocioso();
    confere(e("prtAjudaPubTexto").value === "", "ao reabrir, o campo devia estar vazio");
    confere(e("prtAjudaPubBotao").disabled === false, "ao reabrir, o botão devia estar livre (a trava do envio anterior não vale para o formulário novo)");
    // sem texto escrito, 'Voltar' sai direto, sem pergunta
    doc.clicar(voltar()); m = await env.responderModal(true); await env.ocioso();
    confere(!m.aberto && tela.style.display === "none", "L5: sem texto escrito, 'Voltar' sai direto (sem pergunta)");
    doc.clicar(entrada); await env.ocioso();
    // qualquer troca de tela (esconderTodasAsTelas, a função de verdade) esconde a de ajuda
    env.ev("voltarParaCheckin()");
    confere(tela.style.display === "none" && e("telaCheckin").style.display === "flex", "voltarParaCheckin (de verdade) devia esconder a tela de ajuda");
    doc.clicar(entrada); await env.ocioso();
    // com login aberto o canal continua anônimo: nenhum token, e Voltar leva ao painel
    env.sessao({ matricula: 20, pin: true });
    e("prtAjudaPubTexto").value = TEXTO; env.limparRegistro();
    doc.clicar(e("prtAjudaPubBotao")); await env.ocioso();
    const p2 = chamadas(env, "POST protecao-ajuda");
    confere(p2.length === 1 && p2[0].comToken === false, "com login aberto, o pedido de ajuda continua SEM token");
    doc.clicar(voltar()); await env.ocioso();
    confere(env.g("window.__telaInicial") === 1, "com login aberto, Voltar devia levar ao painel (mostrarTelaPainelInicial)");
    doc.clicar(entrada);
    confereAcessibilidade(env, ["prtTelaAjuda"], "Público");
    confere(e("prtAjudaPubResultado").getAttribute("role") === "status" && e("prtAjudaPubResultado").getAttribute("aria-live") === "polite", "acessibilidade: o resultado precisa de role=status e aria-live");
    confere(["prtAjudaPubTexto", "prtAjudaPubContato"].every(id => e(id).getAttribute("autocomplete") === "off"), "os campos de texto da criança devem pedir autocomplete=off");
    confere(e("prtAjudaPubTexto").getAttribute("spellcheck") === "false", "o texto da criança não passa pelo corretor ortográfico do navegador (spellcheck=false)");
  });

  // ============================================================================================================================================
  // 2) MEU PAINEL: Proteção de crianças (qualquer login, inclusive PIN)
  // ============================================================================================================================================
  cenario("Meu Painel (PIN): registrar incidente, validações, confirmação, resposta, meus registros", async () => {
    const env = ambienteAtual = novo(); const { doc, api, e } = env;
    const cat = F.catalogosComAtaque({ gestao: false, geral: false });
    const S = { meus: [{ protocolo: ATAQUE("meuProt"), nivelRotulo: ATAQUE("meuNivel"), dataOcorrencia: "2026-10-01", situacao: "Em andamento", registradoEm: em(-24) },
      { protocolo: ATAQUE("meuProt2"), nivelRotulo: ATAQUE("meuNivel2"), dataOcorrencia: "2026-09-20", situacao: ATAQUE("meuSituacao"), registradoEm: em(-240) }], modo: "ok" };
    api.rotas = {
      "GET protecao-menores/catalogos": () => ({ corpo: cat }),
      "GET protecao-menores/meus": () => ({ corpo: F.meus(S.meus) }),
      "GET congregacoes-publico": { corpo: [{ congregacaoId: 2, nome: ATAQUE("congReg"), ativa: true }, { congregacaoId: 3, nome: "Norte" }] },
      "POST protecao-menores/registrar": (c) => {
        if (S.modo === "429") return { status: 429, corpo: { sucesso: false, limite: true, mensagem: `Você já registrou muitos incidentes nas últimas 24 horas. ${ATAQUE("msg429")}` } };
        if (S.modo === "422") return { status: 422, corpo: { sucesso: false, mensagem: `A matrícula da pessoa envolvida não foi encontrada. ${ATAQUE("msg422")}` } };
        const exige = c.corpo.nivel === "ALEGACAO";
        // M3: o clique duplo devolve o registro que já existia. "repetido" = resposta SEM exigeComunicacao nem nivel (servidor antigo); "repetidoNovo" = a do servidor corrigido (as duas sem contagem nenhuma)
        if (S.modo === "repetido") return { status: 200, corpo: { sucesso: true, repetido: true, incidenteId: 77, protocolo: ATAQUE("protoRep"), prazoEm: exige ? em(24) : null, mensagem: "Este incidente já tinha sido registrado agora há pouco." } };
        if (S.modo === "repetidoNovo") return { status: 200, corpo: { sucesso: true, repetido: true, incidenteId: 77, protocolo: ATAQUE("protoRep"), nivel: c.corpo.nivel, exigeComunicacao: exige, prazoEm: exige ? em(24) : null, mensagem: "Este incidente já tinha sido registrado agora há pouco." } };
        return { status: 201, corpo: { sucesso: true, incidenteId: 77, protocolo: ATAQUE("protoNovo"), prazoEm: exige ? em(24) : null, exigeComunicacao: exige,
          mensagem: exige ? `Registrado. A liderança foi avisada e o prazo de 24 horas já está contando. ${ATAQUE("msgReg")}` : `Registrado. A liderança foi avisada. ${ATAQUE("msgReg")}` } };
      },
      "POST protecao-ajuda": () => ({ status: 201, corpo: F.confirmacaoDeAjuda("PRO-2026-0777") })
    };
    env.sessao({ matricula: 20, pin: true });
    await env.ev("mostrarSubAbaMeupainel('protecao')"); await env.ocioso();
    const ordem = env.api.chamadas.map(c => c.chave);
    confere(["GET protecao-menores/catalogos", "GET protecao-menores/meus", "GET congregacoes-publico"].every(k => ordem.includes(k)), `chamadas ao abrir: ${ordem.join(", ")}`);
    confere(e("subMeupainelProtecao").style.display === "block" && e("btnSubMeupainelProtecao").classList.contains("ativo"), "a sub-aba devia estar aberta e o botão marcado");
    confere(env.g("window.__painelInicial") === undefined, "abrir a sub-aba não devia carregar o perfil");

    // os níveis (com a descrição de cada um) e a caixa do roteiro
    const niveis = e("prtRegNiveis");
    const radios = [...niveis.descendentes()].filter(x => x.localName === "input" && x.type === "radio");
    confere(radios.length === 3 && radios.every(r => r.getAttribute("name") === "prtRegNivel"), "devia haver 3 níveis em radios do mesmo grupo");
    confere(pm.CODIGOS_NIVEL.every(c => radios.some(r => r.value.startsWith(c))), "os níveis do catálogo devem estar nos radios");
    confere(niveis.textContent.includes("A lei manda comunicar ao Conselho Tutelar imediatamente; o prazo máximo da Igreja é de 24 horas") && niveis.textContent.includes("Algo que podia ter dado errado"), "a descrição de cada nível (catálogo) devia aparecer ao lado do rótulo");
    confere(e("prtRegAlegacaoCx").style.display === "none", "o bloco da suspeita de violência só aparece quando o nível é escolhido");
    confere(texto(env, "prtRegData") === "" && e("prtRegData").value === HOJE, `a data devia começar em hoje (${e("prtRegData").value})`);
    confere([...e("prtRegCong").options].some(o => o.textContent.includes("[congReg]")), "as congregações públicas devem estar no seletor");
    confere(e("prtRegEquipeCx").style.display === "none" && chamadas(env, "GET escalas/equipes").length === 0, "sem a permissão das escalas, a equipe não é perguntada nem buscada");
    limpo(env, "Meu Painel/abertura", [ATAQUE("congReg"), ATAQUE("meuProt"), ATAQUE("meuNivel"), ATAQUE("meuProt2"), ATAQUE("meuNivel2"), ATAQUE("meuSituacao")]);
    const meus = e("prtMeusLista");
    confere(meus.children.length === 2 && /Aconteceu em 01\/10\/2026/.test(meus.textContent) && /Em andamento/.test(meus.textContent), "Meus registros devia mostrar protocolo, nível, data e situação");
    confere(!/relato|descri/i.test(meus.textContent.replace(/Aconteceu/g, "")), "Meus registros não mostra relato nem andamento: só protocolo, nível, data e situação");
    confere(env.e("tituloModulo").textContent === "Meu Painel — Proteção de crianças", `o título da sub-aba: ${env.e("tituloModulo").textContent}`);

    // validações na tela, na ordem do formulário (nada é enviado)
    const enviar = async () => { env.limparRegistro(); doc.clicar(e("prtRegBotao")); await env.ocioso(); };
    const semEnvio = (msg, rx) => { confere(chamadas(env, "POST protecao-menores/registrar").length === 0 && !env.modal().aberto, `${msg}: não pode enviar nem pedir confirmação`); confere(rx.test(texto(env, "prtRegMsg")) && /psc-aviso/.test(e("prtRegMsg").className) && env.toasts().length === 1, `${msg}: devia explicar (${texto(env, "prtRegMsg").slice(0, 60)}) em destaque e com um toast`); };
    await enviar(); semEnvio("sem nível", /Escolha o que aconteceu/);
    escolherNivel(env, "QUEBRA_POLITICA");
    e("prtRegData").value = ""; await enviar(); semEnvio("sem data", /data em que aconteceu/);
    e("prtRegData").value = "2026-10-10"; await enviar(); semEnvio("data no futuro", /no futuro/);
    e("prtRegData").value = HOJE; await enviar(); semEnvio("sem congregação", /Escolha a congregação/);
    doc.escolher(e("prtRegCong"), "2"); await env.ocioso();
    confere(chamadas(env, "GET escalas/equipes").length === 0 && e("prtRegEquipeCx").style.display === "none", "sem a permissão das escalas, escolher a congregação NÃO busca nem mostra equipes");
    await enviar(); semEnvio("sem descrição", /de 10 a 1000/);
    e("prtRegDescricao").value = "<b>fato</b> acontecido hoje"; await enviar(); semEnvio("descrição com < >", /sem < ou >/);
    e("prtRegDescricao").value = "Adulto ficou a sós com uma criança na sala."; e("prtRegEnvMatricula").value = "41"; e("prtRegEnvNome").value = "Fulano"; await enviar(); semEnvio("matrícula e nome juntos", /matrícula OU o nome/);
    e("prtRegEnvNome").value = ""; e("prtRegEnvMatricula").value = "4x1"; await enviar(); semEnvio("matrícula que não é número", /precisa ser um número/);
    e("prtRegEnvMatricula").value = ""; e("prtRegOnde").value = "x".repeat(151); await enviar(); semEnvio("onde grande demais", /Onde aconteceu/);
    e("prtRegOnde").value = "";
    // contador do campo de descrição
    doc.digitar(e("prtRegDescricao"), "curto"); confere(texto(env, "prtRegDescContador") === "5" && /psc-alerta/.test(e("prtRegDescContador").className), "o contador da descrição devia mostrar 5 e ficar em alerta (menos de 10)");
    doc.digitar(e("prtRegDescricao"), "Adulto ficou a sós com uma criança na sala."); confere(!/psc-alerta/.test(e("prtRegDescContador").className), "o contador volta ao normal com o tamanho aceito");

    // quase-acidente / quebra de política: sem confirmação, só os campos de fatos no corpo
    e("prtRegOnde").value = "Sala do Maternal"; e("prtRegEnvMatricula").value = "41";
    await enviar();
    const q = chamadas(env, "POST protecao-menores/registrar");
    confere(q.length === 1 && !env.modal().aberto, "quebra de política: devia enviar sem pedir confirmação");
    confere(q[0] && JSON.stringify(q[0].corpo) === JSON.stringify({ nivel: "QUEBRA_POLITICA", dataOcorrencia: HOJE, congregacaoId: 2, descricao: "Adulto ficou a sós com uma criança na sala.", onde: "Sala do Maternal", envolvidoMembroId: 41, envolvidoDaLideranca: false }) && typeof q[0].corpo.congregacaoId === "number" && typeof q[0].corpo.envolvidoMembroId === "number", `corpo da quebra de política: ${JSON.stringify(q[0] && q[0].corpo)}`);
    const resp = texto(env, "prtRegResposta");
    confere(resp.includes("[protoNovo]") && resp.includes("[msgReg]") && /Obrigado por registrar/.test(resp) && !/Prazo máximo da Igreja/.test(resp.replace(ATAQUE("msgReg"), "")), "a resposta (protocolo, mensagem, o que fazer) devia aparecer; sem o relógio, que é só da suspeita");
    confere(e("prtRegDescricao").value === "" && e("prtRegOnde").value === "" && e("prtRegEnvMatricula").value === "", "depois de enviar, o formulário devia ser limpo");
    confere(chamadas(env, "GET protecao-menores/meus").length === 1 && env.toasts().length === 1, "depois de enviar, 'Meus registros' é refeito e sai um toast só");
    limpo(env, "Meu Painel/quebra registrada", [ATAQUE("protoNovo"), ATAQUE("msgReg")]);
    confere(env.foco() && env.foco().id === "prtRegRespostaTitulo" && env.foco().getAttribute("tabindex") === "-1", "L9: depois de registrar o foco vai para o título da resposta (protocolo e o que fazer agora)");
    confere(["prtRegOnde", "prtRegDescricao", "prtRegEnvMatricula", "prtRegEnvNome", "prtRegRelato"].every(id => e(id).getAttribute("autocomplete") === "off"), "os campos do registro (onde, descrição, matrícula, nome, relato) pedem autocomplete=off: o que é escrito sobre uma criança não vira sugestão do navegador");
    confere(e("prtRegRelato").getAttribute("spellcheck") === "false", "o relato não passa pelo corretor ortográfico do navegador (spellcheck=false)");

    // suspeita ou relato de violência: o roteiro da escuta, os campos próprios, a confirmação com o efeito real
    escolherNivel(env, "ALEGACAO");
    confere(e("prtRegAlegacaoCx").style.display !== "none", "a suspeita devia abrir quem contou, o relato e o roteiro");
    const roteiro = texto(env, "prtRegRoteiro");
    confere(pm.ROTEIRO_ESCUTA.every(p => roteiro.includes(p.passo.split(". ")[1])) && /NÃO FAÇA/.test(roteiro) && pm.NAO_FACA.every(n => roteiro.includes(n.slice(0, 40))), "o roteiro (acolher, registrar como foi dito, encaminhar) e o NÃO FAÇA do catálogo devem aparecer");
    limpo(env, "Meu Painel/roteiro", [ATAQUE("passo0"), ATAQUE("naoFaca1")]);
    const passos = [...e("prtRegRoteiro").descendentes()].filter(x => x.localName === "li" && x.parentNode && /prt-roteiro-passos/.test(x.parentNode.className));
    confere(passos.length === 3 && passos.every(li => !/^s*d+s*[.)-–]/.test(li.textContent)), `L7: o <ol> já numera: o texto de cada passo não pode começar com número (fica "1. 1. Acolher"): ${passos.map(li => li.textContent.slice(0, 12)).join(" | ")}`);
    confere(passos.length === 3 && /^Acolher/.test(passos[0].textContent) && /^Registrar o que foi dito/.test(passos[1].textContent) && /^Encaminhar/.test(passos[2].textContent), "L7: o nome de cada passo continua lá, sem o número escrito à mão");
    doc.escolher(e("prtRegCong"), "2"); e("prtRegData").value = HOJE;
    e("prtRegDescricao").value = "Criança contou algo sobre um adulto."; e("prtRegEnvMatricula").value = "41";
    await enviar(); semEnvio("suspeita sem quem contou", /quem contou ou percebeu/);
    doc.escolher(e("prtRegQuem"), "PROPRIA_CRIANCA"); e("prtRegRelato").value = "curto"; await enviar(); semEnvio("relato curto", /relato do jeito que foi contado/);
    const RELATO = "Ela disse que o tio mexe com ela quando ninguém vê.";
    e("prtRegRelato").value = RELATO; e("prtRegHoras").value = "-1"; await enviar(); semEnvio("horas negativas", /número inteiro de 0 a 720/);
    e("prtRegHoras").value = "1.5"; await enviar(); semEnvio("horas quebradas", /número inteiro de 0 a 720/);
    e("prtRegHoras").value = "721"; await enviar(); semEnvio("horas demais", /número inteiro de 0 a 720/);
    e("prtRegHoras").value = "0"; env.limparRegistro();
    let ato = env.ev("prtEnviarRegistroAcao(document.getElementById('prtRegBotao'))");
    let m = await env.responderModal(false); await esperar(ato); await env.ocioso();
    confere(m.aberto && /a lei manda comunicar o Conselho Tutelar imediatamente, e o prazo máximo da Igreja \(24 horas\) começa agora/.test(m.texto) && /sai das escalas com crianças por cautela/.test(m.texto) && /liderança de proteção será avisada/.test(m.texto) && /matrícula 41/.test(m.texto), `a confirmação devia dizer o efeito real: ${m.texto.slice(0, 120)}`);
    confere(chamadas(env, "POST protecao-menores/registrar").length === 0 && e("prtRegRelato").value === RELATO, "CANCELAR a confirmação não envia e não apaga o relato");
    e("prtRegHoras").value = "5"; env.limparRegistro();
    ato = env.ev("prtEnviarRegistroAcao(document.getElementById('prtRegBotao'))"); m = await env.responderModal(false); await esperar(ato);
    confere(/já está correndo \(a Igreja soube há 5 h\)/.test(m.texto), "com horas > 0 a confirmação devia dizer que o prazo já está correndo");
    e("prtRegHoras").value = "0"; e("prtRegEnvMatricula").value = ""; e("prtRegEnvNome").value = "Fulano de Tal"; env.limparRegistro();
    ato = env.ev("prtEnviarRegistroAcao(document.getElementById('prtRegBotao'))"); m = await env.responderModal(false); await esperar(ato);
    confere(!/sai das escalas/.test(m.texto), "sem a matrícula a confirmação não pode prometer a saída das escalas");
    e("prtRegEnvNome").value = ""; e("prtRegEnvMatricula").value = "41";
    // o servidor recusa (422) e o limite (429): mensagem dele, formulário e relato intactos
    for (const [modo, marca] of [["422", "[msg422]"], ["429", "[msg429]"]]) {
      S.modo = modo; env.limparRegistro();
      ato = env.ev("prtEnviarRegistroAcao(document.getElementById('prtRegBotao'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
      confere(texto(env, "prtRegMsg").includes(marca) && /psc-aviso/.test(e("prtRegMsg").className) && e("prtRegRelato").value === RELATO && e("prtRegBotao").disabled === false, `servidor ${modo}: mensagem em destaque, relato ainda no campo e botão solto`);
      confere(texto(env, "prtRegResposta") === "", `servidor ${modo}: não pode mostrar resposta de sucesso`);
    }
    S.modo = "ok"; env.limparRegistro();
    ato = env.ev("prtEnviarRegistroAcao(document.getElementById('prtRegBotao'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
    const a = chamadas(env, "POST protecao-menores/registrar");
    confere(a.length === 1 && JSON.stringify(a[0].corpo) === JSON.stringify({ nivel: "ALEGACAO", dataOcorrencia: HOJE, congregacaoId: 2, descricao: "Criança contou algo sobre um adulto.", envolvidoMembroId: 41, envolvidoDaLideranca: false, relatadoPor: "PROPRIA_CRIANCA", relato: RELATO, conhecidoHaHoras: 0 }), `corpo da suspeita: ${JSON.stringify(a[0] && a[0].corpo)}`);
    confere(typeof a[0].corpo.conhecidoHaHoras === "number" && typeof a[0].corpo.envolvidoMembroId === "number", "horas e matrícula vão como NÚMERO");
    const r2 = texto(env, "prtRegResposta");
    confere(r2.includes("[protoNovo]") && r2.includes("A lei manda comunicar ao Conselho Tutelar imediatamente.") && r2.includes("Prazo máximo da Igreja") && !/em até 24 horas/.test(r2) && !/escala/i.test(r2) && /O que fazer agora/.test(r2) && pm.NAO_FACA.every(n => r2.includes(n.slice(0, 40))), "a resposta da suspeita devia trazer protocolo, prazo e o que fazer agora (e não revelar escalas desmarcadas)");
    confere(!!link(env, "tel:100", e("prtRegResposta")) && !!link(env, "tel:190", e("prtRegResposta")), "a resposta da suspeita devia trazer 100 e 190");
    confere(e("prtRegRelato").value === "" && e("prtRegEnvMatricula").value === "" && e("prtRegDescricao").value === "", "depois de enviar a suspeita, o RELATO e o resto do formulário devem sair do campo");
    confere(![0, 1, 2].some(i => e(`prtRegNivel${i}`).checked) && e("prtRegAlegacaoCx").style.display === "none", "depois de enviar, o nível volta a nenhum escolhido");
    confere(env.gravacoes.length === 0, "nada do relato pode ir para o armazenamento do navegador");
    limpo(env, "Meu Painel/suspeita registrada", [ATAQUE("protoNovo")]);
    // M3: o clique duplo devolve o registro que já existia: a SUSPEITA segue mostrando o que NÃO fazer, o prazo e o 100/190 (mesmo que a resposta venha sem exigeComunicacao)
    for (const modo of ["repetido", "repetidoNovo"]) {
      S.modo = modo; escolherNivel(env, "ALEGACAO"); doc.escolher(e("prtRegCong"), "2"); e("prtRegData").value = HOJE;
      e("prtRegDescricao").value = "Criança contou algo sobre um adulto."; e("prtRegEnvMatricula").value = "41"; doc.escolher(e("prtRegQuem"), "PROPRIA_CRIANCA"); e("prtRegRelato").value = RELATO; e("prtRegHoras").value = "0"; env.limparRegistro();
      ato = env.ev("prtEnviarRegistroAcao(document.getElementById('prtRegBotao'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
      const rr = texto(env, "prtRegResposta");
      confere(rr.includes("[protoRep]") && /já tinha sido registrado/.test(rr) && !/Não é preciso fazer mais nada/.test(rr), `M3 (${modo}): a suspeita repetida NÃO pode dizer que não é preciso fazer nada: ${rr.slice(0, 100)}`);
      confere(pm.NAO_FACA.every(n => rr.includes(n.slice(0, 40))) && /Prazo máximo da Igreja/.test(rr) && !!link(env, "tel:100", e("prtRegResposta")) && !!link(env, "tel:190", e("prtRegResposta")), `M3 (${modo}): a suspeita repetida mostra o que NÃO fazer, o prazo e o 100 e o 190`);
      confere(chamadas(env, "POST protecao-menores/registrar").length === 1 && !/escala/i.test(rr), `M3 (${modo}): um pedido só, e a resposta não fala de escalas`);
      limpo(env, `Meu Painel/suspeita repetida ${modo}`, [ATAQUE("protoRep")]);
    }
    // uma quebra de política repetida segue SEM o relógio nem o NÃO FAÇA
    S.modo = "repetido"; escolherNivel(env, "QUEBRA_POLITICA"); doc.escolher(e("prtRegCong"), "2"); e("prtRegData").value = HOJE; e("prtRegDescricao").value = "Adulto ficou a sós com uma criança na sala."; env.limparRegistro();
    doc.clicar(e("prtRegBotao")); await env.ocioso();
    confere(/Obrigado por registrar/.test(texto(env, "prtRegResposta")) && !/Prazo máximo da Igreja/.test(texto(env, "prtRegResposta")) && !pm.NAO_FACA.some(n => texto(env, "prtRegResposta").includes(n.slice(0, 40))), "M3: a quebra de política repetida não mostra prazo nem o NÃO FAÇA da suspeita");
    S.modo = "ok";
    // (d) depois de registrar, a data volta para hoje (a data do fato anterior não fica para o próximo registro)
    escolherNivel(env, "QUASE_ACIDENTE"); doc.escolher(e("prtRegCong"), "2"); e("prtRegData").value = "2026-10-05"; e("prtRegDescricao").value = "Criança saiu da sala e foi achada logo."; env.limparRegistro();
    doc.clicar(e("prtRegBotao")); await env.ocioso();
    confere(chamadas(env, "POST protecao-menores/registrar").length === 1 && chamadas(env, "POST protecao-menores/registrar")[0].corpo.dataOcorrencia === "2026-10-05" && e("prtRegData").value === HOJE, `(d) o registro sai com a data escolhida e o campo volta para hoje (${e("prtRegData").value})`);

    // o canal de ajuda logado: o mesmo formulário, e continua SEM token
    e("prtAjudaLogTexto").value = "Quero contar uma coisa que aconteceu comigo."; env.limparRegistro();
    doc.clicar(e("prtAjudaLogBotao")); await env.ocioso();
    const pl = chamadas(env, "POST protecao-ajuda");
    confere(pl.length === 1 && pl[0].comToken === false && /Recebemos/.test(texto(env, "prtAjudaLogResultado")) && e("prtAjudaLogTexto").value === "", "o pedido de ajuda de quem está logado vai SEM token e limpa o campo");
    confere([...e("prtAjudaLogCong").options].some(o => o.textContent.includes("[congReg]")), "o seletor de igreja do pedido logado também vem da lista pública");

    // equipe: só para quem tem a permissão das escalas; falha vira "sem pergunta", sem barulho
    env.sessao({ matricula: 5, nivel: "GLOBAL", permissoes: ["escalas", "protecao_menores"] });
    api.rotas["GET escalas/equipes"] = (c) => (c.consulta.congregacaoId === "3" ? { status: 403, corpo: { sucesso: false, mensagem: "Fora do seu escopo de atuação." } } : { corpo: { sucesso: true, equipes: [{ equipeId: 3, nome: ATAQUE("eqReg"), ativa: true }, { equipeId: 4, nome: "Antiga", ativa: false }] } });
    await env.ev("mostrarSubAbaMeupainel('protecao')"); await env.ocioso();
    confere(e("prtRegCx").style.display !== "none" && texto(env, "prtMeusLista").length >= 0, "o formulário também abre para a liderança");
    env.limparRegistro();
    doc.escolher(e("prtRegCong"), "2"); await env.ocioso();
    const ce = chamadas(env, "GET escalas/equipes");
    confere(ce.length === 1 && ce[0].consulta.congregacaoId === "2" && ce[0].comToken === true, "com a permissão das escalas, a equipe da congregação escolhida é buscada (com token)");
    confere(e("prtRegEquipeCx").style.display !== "none" && [...e("prtRegEquipe").options].length === 2 && [...e("prtRegEquipe").options].some(o => o.textContent.includes("[eqReg]")), "a equipe aparece (só as ativas) e é opcional");
    limpo(env, "Meu Painel/equipes", [ATAQUE("eqReg")]);
    escolherNivel(env, "QUASE_ACIDENTE"); doc.escolher(e("prtRegEquipe"), "3"); e("prtRegDescricao").value = "Criança saiu da sala e foi achada logo."; env.limparRegistro();
    doc.clicar(e("prtRegBotao")); await env.ocioso();
    confere(chamadas(env, "POST protecao-menores/registrar")[0] && chamadas(env, "POST protecao-menores/registrar")[0].corpo.equipeId === 3, "a equipe escolhida vai no corpo como número");
    doc.escolher(e("prtRegCong"), "3"); await env.ocioso();
    confere(e("prtRegEquipeCx").style.display === "none" && env.toasts().length >= 0, "se a lista de equipes é recusada, a pergunta some (a recusa já foi avisada pelo fetchProtegido)");
    doc.escolher(e("prtRegCong"), ""); await env.ocioso();
    confere(e("prtRegEquipeCx").style.display === "none", "sem congregação, sem equipe");

    confereAcessibilidade(env, ["subMeupainelProtecao"], "Meu Painel");
    for (const id of ["prtMeuResultado", "prtRegMsg", "prtMeusMsg", "prtRegResposta", "prtAjudaLogResultado"]) confere(e(id) && e(id).getAttribute("role") === "status", `acessibilidade: ${id} sem role=status`);
    confere(!!achar(env, x => x.localName === "fieldset" && [...x.descendentes()].some(y => y.localName === "legend")), "os níveis devem estar num fieldset com legend");
  });

  cenario("Meu Painel: código de nível e de congregação com texto de ataque (atributo value)", async () => {
    const env = ambienteAtual = novo(); const { api, e } = env;
    const cat = F.catalogosComAtaque({ gestao: false, geral: false });
    cat.niveis[2].codigo = ATAQUE("nivelCodigo"); cat.quemRelatou[0].codigo = ATAQUE("quemCodigo");
    api.rotas = {
      "GET protecao-menores/catalogos": { corpo: cat }, "GET protecao-menores/meus": { corpo: F.meus([]) },
      "GET congregacoes-publico": { corpo: [{ congregacaoId: 2, nome: "Sede", ativa: true }] }
    };
    env.sessao({ matricula: 20, pin: true });
    await env.ev("mostrarSubAbaMeupainel('protecao')"); await env.ocioso();
    limpo(env, "Meu Painel/códigos com ataque", []);
    confere(e("prtRegNivel2") && e("prtRegNivel2").value === ATAQUE("nivelCodigo"), "o código do nível vai para o atributo value como texto, sem virar marcação");
    confere([...e("prtRegQuem").options].some(o => o.value === ATAQUE("quemCodigo")), "o código de 'quem contou' vai para o value da opção, como texto");
  });

  // ============================================================================================================================================
  // 3) ABA DA LIDERANÇA: a fila e o relógio
  // ============================================================================================================================================
  const ambienteLideranca = ({ geral = true, permissoes = ["protecao_menores"], aparelho } = {}) => {
    const env = novo(aparelho ? { agora: aparelho } : {});
    env.sessao({ matricula: 5, nivel: "GLOBAL", permissoes, geral });
    return env;
  };
  const filaPadrao = () => [
    { id: 1, protocolo: ATAQUE("prot1"), origem: "CANAL_AJUDA", congregacaoNome: ATAQUE("cong1"), prazoEm: em(3, 20), dataOcorrencia: HOJE },
    { id: 2, prazoEm: em(8), congregacaoNome: "Norte" },
    { id: 3, prazoEm: em(20) },
    { id: 4, prazoEm: em(-2), registradoEm: em(-26) },
    { id: 5, nComunicacoes: 1, nComComprovante: 0, prazoEm: em(5), registradoEm: em(-5) },
    { id: 6, nComunicacoes: 1, nComComprovante: 1, prazoEm: em(5), registradoEm: em(-6) },
    { id: 7, nivel: "QUEBRA_POLITICA", exigeComunicacao: false, registradoEm: em(-7) },
    { id: 8, status: "ENCERRADO", encerradoEm: em(-30), registradoEm: em(-80) },
    { id: 9, nivel: "ALEGACAO", nSemDecisao: 1, nComunicacoes: 1, nComComprovante: 1, registradoEm: em(-9), prazoEm: em(2) }
  ];
  const rotasDaLideranca = (env, S) => {
    const papeis = () => ({ gestao: true, geral: S.geral !== false });
    env.api.rotas = {
      "GET protecao-menores/catalogos": () => { const c = F.catalogosComAtaque(papeis()); if (S.ajustarCatalogo) S.ajustarCatalogo(c); return { corpo: c }; },
      "GET protecao-menores/incidentes": (c) => {
        S.pedidosLista = (S.pedidosLista || 0) + 1;
        const linhas = S.fila.filter(l => !c.consulta.status || (c.consulta.status === "ENCERRADO") === (l.status === "ENCERRADO"));
        return { corpo: F.filaDe(linhas, S.servidor || SRV) };
      },
      "GET protecao-menores/incidente": (c) => {
        const o = S.det[Number(c.consulta.incidenteId)];
        return o ? { corpo: F.detalhe(Object.assign({ geral: S.geral !== false }, typeof o === "function" ? o() : o), S.servidor || SRV) } : { status: 404, corpo: { sucesso: false, mensagem: "Incidente não encontrado." } };
      }
    };
  };
  const abrirAba = async (env) => { await env.ev("mostrarAbaSecretaria('protecao')"); await env.ocioso(); };
  const cartaoDe = (env, id) => [...env.e("prtListaIncidentes").children].find(c => [...c.descendentes()].some(b => b.localName === "button" && b.getAttribute("data-on-click") === "prtAbrirDetalheAcao" && idDe(b) === id)) || null;

  cenario("Fila: ordem do servidor, cartões, selos, origem e relógio por faixa", async () => {
    const env = ambienteAtual = ambienteLideranca(); const { doc, api, e } = env;
    const S = { fila: filaPadrao(), det: {} };
    rotasDaLideranca(env, S);
    // a navegação de verdade: o botão fica no módulo de Habilitação e a aba só aparece com a permissão protecao_menores
    confere(env.g("temPermissaoDaAba('protecao')") === true, "a aba devia aparecer com a permissão protecao_menores");
    env.sessao({ matricula: 6, nivel: "REGIONAL", permissoes: ["habilitacao_voluntarios"] });
    confere(env.g("temPermissaoDaAba('protecao')") === false && env.g("podeAcessarAba('protecao')") === false, "só com habilitacao_voluntarios a aba da proteção NÃO devia aparecer");
    env.sessao({ matricula: 5, nivel: "GLOBAL", permissoes: ["protecao_menores"], geral: true });
    confere(env.g("podeAcessarModulo('habilitacao')") === true, "o módulo de Habilitação devia abrir para quem só tem protecao_menores");
    await env.ev("entrarModulo('habilitacao')"); await env.ocioso();
    confere(e("abaProtecao").style.display === "block" && e("btnAbaProtecao").classList.contains("ativo") && e("tituloModulo").textContent === "Proteção de Crianças", "entrar no módulo devia abrir a aba da proteção, marcada, com o título certo");
    confere(env.g("chaveAjudaAtual") === "protecao" && /24 horas/.test(env.g("AJUDA_POR_ABA")[env.g("chaveAjudaAtual")]), "a ajuda contextual da aba devia existir");
    confere(/Disque 100|Ligue 190|190/.test(env.g("AJUDA_POR_ABA")["meupainel:protecao"]), "a ajuda da sub-aba de Meu Painel devia existir");
    const ordemChamadas = api.chamadas.map(c => c.chave);
    confere(ordemChamadas.indexOf("GET protecao-menores/catalogos") >= 0 && ordemChamadas.indexOf("GET protecao-menores/incidentes") > ordemChamadas.indexOf("GET protecao-menores/catalogos"), "o catálogo vem antes da fila");
    const pedido = chamadas(env, "GET protecao-menores/incidentes")[0];
    confere(pedido && pedido.consulta.status === "ABERTO", "a fila abre filtrada nos incidentes abertos");

    // a ordem é a que o servidor mandou
    const esperado = F.filaDe(S.fila.filter(l => l.status !== "ENCERRADO"), SRV).incidentes.map(i => i.incidenteId);
    const naTela = [...e("prtListaIncidentes").children].map(c => { const b = [...c.descendentes()].find(x => x.localName === "button" && x.getAttribute("data-on-click") === "prtAbrirDetalheAcao"); return b ? idDe(b) : null; });
    confere(JSON.stringify(naTela) === JSON.stringify(esperado) && esperado[0] === 4, `a fila devia seguir a ordem do servidor (vencido primeiro): tela ${JSON.stringify(naTela)} × servidor ${JSON.stringify(esperado)}`);
    const resumo = texto(env, "prtListaResultado");
    confere(/8 incidente\(s\)/.test(resumo) && /esperando a comunicação ao órgão/.test(resumo), `o resumo da fila: "${resumo}"`);
    // cartões
    const c1 = cartaoDe(env, 1).textContent;
    confere(c1.includes("[prot1]") && c1.includes("[cong1]") && /09\/10\/2026/.test(c1) && /Suspeita ou relato de violência/.test(c1), "o cartão devia mostrar protocolo, congregação, data e o nível");
    confere(/Canal de ajuda/.test(c1), "a origem 'canal de ajuda' devia estar visível");
    confere(!/Canal de ajuda/.test(cartaoDe(env, 2).textContent), "só o canal de ajuda mostra a origem");
    confere(/comunicado ao órgão/.test(cartaoDe(env, 5).textContent) && /sem comprovante/.test(cartaoDe(env, 5).textContent), "comunicado sem comprovante: os dois selos");
    confere(/comunicado ao órgão/.test(cartaoDe(env, 6).textContent) && !/sem comprovante/.test(cartaoDe(env, 6).textContent), "comunicado com comprovante: só o selo 'comunicado'");
    confere(/afastamento aguardando decisão/.test(cartaoDe(env, 9).textContent), "o afastamento sem decisão devia ter selo");
    confere(!/comunicado ao órgão/.test(cartaoDe(env, 1).textContent) && !/comunicado ao órgão/.test(cartaoDe(env, 7).textContent), "sem comunicação não há selo de 'comunicado'");
    // relógio: faixa (cor/ícone/texto) pelo relógio do servidor
    const chip = (id) => e(`prtRelogio${id}`);
    confere(chip(1) && chip(1).textContent === "🚨 faltam 3 h 20 min" && /cal-st-indeferido/.test(chip(1).className) && chip(1).getAttribute("role") === "timer", `faixa CRITICO: ${chip(1) && chip(1).textContent}`);
    confere(chip(2) && chip(2).textContent === "⚠️ faltam 8 h 00 min" && /cal-st-proposto/.test(chip(2).className), `faixa ATENCAO: ${chip(2) && chip(2).textContent}`);
    confere(chip(3) && chip(3).textContent === "⏳ faltam 20 h 00 min" && /cal-st-homologado/.test(chip(3).className), `faixa NORMAL: ${chip(3) && chip(3).textContent}`);
    confere(chip(4) && chip(4).textContent === "⛔ vencido há 2 h 00 min" && /prt-relogio-vencido/.test(chip(4).className) && /cal-st-indeferido/.test(chip(4).className), `faixa VENCIDO: ${chip(4) && chip(4).textContent}`);
    confere([5, 6, 7, 9].every(i => chip(i) === null), "quem já tem comunicação (ou não exige) não tem relógio");
    const esperadoDoServidor = F.resumo(S.fila[0], SRV).relogio.texto;
    confere(chip(1).textContent.includes(esperadoDoServidor), "o texto do relógio na tela é o mesmo que o servidor calcula");
    confere(env.intervalos.size === 1 && [...env.intervalos.values()][0].ms === 30000, `devia haver UM intervalo de 30 s (há ${env.intervalos.size})`);
    limpo(env, "Fila", [ATAQUE("prot1"), ATAQUE("cong1")]);

    // o relógio anda a cada 30 s, passa de faixa na hora certa e fica vencido
    env.avancar(30 * MIN); env.tique();
    confere(chip(1).textContent === "🚨 faltam 2 h 50 min", `+30 min: ${chip(1).textContent}`);
    env.avancar(3 * 60 * MIN + 20 * MIN); env.tique();   // 3 h 50 min depois do início da conversa: faltam 2 h 50 − 3 h 20 = −30 min
    confere(chip(1).textContent === "⛔ vencido há 30 min" && /prt-relogio-vencido/.test(chip(1).className), `vencido: ${chip(1).textContent} (${chip(1).className})`);
    confere(chip(2).textContent === "⚠️ faltam 4 h 10 min" && /cal-st-proposto/.test(chip(2).className), `a faixa amarela segue até 4 h: ${chip(2).textContent}`);
    env.avancar(10 * MIN); env.tique();
    confere(chip(2).textContent === "🚨 faltam 4 h 00 min" && /cal-st-indeferido/.test(chip(2).className), `em 4 h 00 min já é vermelho (limite do servidor): ${chip(2).textContent}`);
    confere(chip(3).textContent === "⏳ faltam 16 h 00 min" && /cal-st-homologado/.test(chip(3).className), `o cartão de 20 h, quatro horas depois: ${chip(3).textContent}`);
    env.avancar(3 * 60 * MIN + 59 * MIN); env.tique();
    confere(chip(3).textContent === "⏳ faltam 12 h 01 min" && /cal-st-homologado/.test(chip(3).className), `com 12 h 01 min ainda é verde: ${chip(3).textContent}`);
    env.avancar(1 * MIN); env.tique();
    confere(chip(3).textContent === "⚠️ faltam 12 h 00 min" && /cal-st-proposto/.test(chip(3).className), `em 12 h 00 min passa a amarelo (limite do servidor): ${chip(3).textContent}`);
    confere(env.intervalos.size === 1, "continua um intervalo só");
    // as faixas do aparelho são as mesmas do servidor em todos os instantes (a conta é a mesma)
    for (const minutos of [0, 59, 60, 239, 240, 241, 719, 720, 721, 1439, 1440]) {
      const prazo = new Date(srvMs + minutos * MIN);
      const servidor = pm.relogio(prazo, new Date(srvMs));
      const tela = env.g(`prtRelogioDe(${prazo.getTime()}, ${srvMs})`);
      confere(tela.faixa === servidor.faixa && tela.texto === servidor.texto, `a conta do relógio com ${minutos} min devia ser a do servidor (${tela.faixa}/${tela.texto} × ${servidor.faixa}/${servidor.texto})`);
    }
    for (const minutos of [-1, -59, -61, -125, -1441]) {
      const prazo = new Date(srvMs + minutos * MIN);
      const servidor = pm.relogio(prazo, new Date(srvMs));
      const tela = env.g(`prtRelogioDe(${prazo.getTime()}, ${srvMs})`);
      confere(tela.faixa === servidor.faixa && tela.texto === servidor.texto, `a conta vencida (${minutos} min) devia ser a do servidor (${tela.texto} × ${servidor.texto})`);
    }
  });

  cenario("Relógio: usa o relógio do SERVIDOR (aparelho adiantado), para ao sair da aba e ao trocar de login", async () => {
    // o aparelho está 2 horas adiantado: o relógio da tela tem de seguir o servidor
    const env = ambienteAtual = ambienteLideranca({ aparelho: "2026-10-09T17:00:00.000Z" }); const { doc, api, e } = env;
    const S = { fila: filaPadrao(), det: {} };
    rotasDaLideranca(env, S);
    await abrirAba(env);
    confere(e("prtRelogio1").textContent === "🚨 faltam 3 h 20 min", `com o aparelho 2 h adiantado a tela devia seguir o relógio do servidor: ${e("prtRelogio1").textContent}`);
    confere(e("prtRelogio4").textContent === "⛔ vencido há 2 h 00 min", `idem para o vencido: ${e("prtRelogio4").textContent}`);
    env.avancar(30 * MIN); env.tique();
    confere(e("prtRelogio1").textContent === "🚨 faltam 2 h 50 min", "o aparelho anda e a tela anda junto, na referência do servidor");
    confere(env.intervalos.size === 1, "um intervalo enquanto a aba está aberta");
    // sair da aba: o intervalo some, a fila e o relato saem da página
    await env.ev("sairDoModulo()"); await env.ocioso();
    confere(env.intervalos.size === 0, `sair da aba devia parar o intervalo (restam ${env.intervalos.size})`);
    confere(e("prtListaIncidentes").innerHTML === "" && e("abaProtecao").style.display === "none", "sair da aba devia esvaziar a fila");
    // voltar: reabre, um intervalo de novo
    await abrirAba(env);
    confere(env.intervalos.size === 1 && e("prtRelogio1") !== null, "voltar à aba recarrega a fila e reinicia o relógio");
    // trocar de aba para outra (documentos) também para
    await env.ev("mostrarAbaSecretaria('documentos')"); await env.ocioso();
    confere(env.intervalos.size === 0, "ir para QUALQUER outra aba para o intervalo");
    await abrirAba(env);
    // o tique se verifica sozinho: aba escondida por outro caminho
    e("abaProtecao").style.display = "none"; env.tique();
    confere(env.intervalos.size === 0, "se a aba não está visível, o próprio tique desliga o intervalo");
    e("abaProtecao").style.display = "block";
    await abrirAba(env);
    // login trocado sem passar pela saída da aba: o tique percebe e desliga
    env.sessao({ matricula: 9, nivel: "GLOBAL", permissoes: ["protecao_menores"], geral: true }); env.tique();
    confere(env.intervalos.size === 0, "se a pessoa mudou, o tique desliga o intervalo");
    // sair da sessão de verdade (limparSessao real) para o intervalo e esvazia a tela
    env.sessao({ matricula: 5, nivel: "GLOBAL", permissoes: ["protecao_menores"], geral: true });
    await abrirAba(env);
    confere(env.intervalos.size === 1, "reaberta, um intervalo");
    env.ev("limparSessao()");
    confere(env.intervalos.size === 0 && e("prtListaIncidentes").innerHTML === "", "sair da sessão (limparSessao) para o intervalo e esvazia a fila");
    // sem nenhum incidente com relógio, nenhum intervalo
    const env2 = ambienteAtual = ambienteLideranca();
    const S2 = { fila: [{ id: 7, nivel: "QUEBRA_POLITICA", exigeComunicacao: false }, { id: 6, nComunicacoes: 1, nComComprovante: 1 }], det: {} };
    rotasDaLideranca(env2, S2);
    await abrirAba(env2);
    confere(env2.intervalos.size === 0, "sem incidente com relógio, não há intervalo nenhum");
    // a lista nova (sem relógio) desliga o intervalo que existia
    const env3 = ambienteAtual = ambienteLideranca();
    const S3 = { fila: filaPadrao(), det: {} };
    rotasDaLideranca(env3, S3);
    await abrirAba(env3);
    confere(env3.intervalos.size === 1, "com relógio, um intervalo");
    S3.fila = [{ id: 7, nivel: "QUEBRA_POLITICA", exigeComunicacao: false }];
    env3.doc.clicar(botao(env3, "Atualizar", env3.e("prtListaCx"))); await env3.ocioso();
    confere(env3.intervalos.size === 0, "uma lista sem relógio desliga o intervalo");
  });

  cenario("Fila: filtro, atualização e resposta atrasada", async () => {
    const env = ambienteAtual = ambienteLideranca(); const { doc, api, e } = env;
    const S = { fila: filaPadrao(), det: {} };
    rotasDaLideranca(env, S);
    await abrirAba(env);
    env.limparRegistro();
    doc.escolher(e("prtFiltroStatus"), "ENCERRADO"); await env.ocioso();
    const c = chamadas(env, "GET protecao-menores/incidentes");
    confere(c.length === 1 && c[0].consulta.status === "ENCERRADO", "o filtro 'encerrados' pede status=ENCERRADO");
    confere(e("prtListaIncidentes").children.length === 1 && /Encerrado em/.test(e("prtListaIncidentes").textContent) && env.intervalos.size === 0, "só o encerrado aparece, com a data, e sem relógio");
    env.limparRegistro();
    doc.escolher(e("prtFiltroStatus"), "TODOS"); await env.ocioso();
    confere(chamadas(env, "GET protecao-menores/incidentes")[0].consulta.status === undefined && e("prtListaIncidentes").children.length === 9, "'todos' não manda status e mostra os 9");
    doc.escolher(e("prtFiltroStatus"), "ABERTO"); await env.ocioso();
    confere(texto(env, "prtListaResultado").length > 0, "a fila de abertos volta");
    // resposta atrasada: o filtro mudou enquanto a primeira resposta ainda vinha
    const presa = env.retem(x => x.chave === "GET protecao-menores/incidentes" && x.consulta.status === "ABERTO");
    const pA = env.ev("(function(){ document.getElementById('prtFiltroStatus').value = 'ABERTO'; return prtCarregarIncidentesAcao(); })()");
    for (let i = 0; i < 30 && !presa.chegou; i++) await new Promise(r => setImmediate(r));
    confere(presa.chegou, "(resposta atrasada) o pedido de login da fila (primeira resposta) devia estar a caminho");
    doc.escolher(e("prtFiltroStatus"), "ENCERRADO"); await env.ocioso();
    presa.liberar(); await esperar(pA); await env.ocioso();
    confere(e("prtListaIncidentes").children.length === 1 && /Encerrado/.test(e("prtListaIncidentes").textContent), "a resposta atrasada de 'abertos' NÃO pode sobrescrever o filtro 'encerrados'");
    // lista vazia e erro do servidor
    S.fila = [];
    doc.escolher(e("prtFiltroStatus"), "ABERTO"); await env.ocioso();
    confere(/Nenhum incidente aberto/.test(texto(env, "prtListaIncidentes")) && env.intervalos.size === 0, "lista vazia: mensagem simples e sem relógio");
    env.api.rotas["GET protecao-menores/incidentes"] = { status: 403, corpo: { sucesso: false, mensagem: "Você não tem permissão para isso. Fale com quem administra as Permissões." } };
    env.limparRegistro();
    doc.clicar(botao(env, "Atualizar", e("prtListaCx"))); await env.ocioso();
    confere(/não tem permissão/.test(texto(env, "prtListaResultado")) && /psc-aviso/.test(e("prtListaResultado").className) && e("prtListaIncidentes").innerHTML === "", "403: o motivo do servidor aparece em destaque e a fila fica vazia");
    confere(env.toasts().length === 1, `403: só o toast do fetchProtegido (${env.toasts().length})`);
    env.api.rotas["GET protecao-menores/incidentes"] = { status: 500, naoJson: true, corpo: {} };
    env.limparRegistro();
    doc.clicar(botao(env, "Atualizar", e("prtListaCx"))); await env.ocioso();
    confere(/problema|inesperada/.test(texto(env, "prtListaResultado")) && e("prtListaIncidentes").innerHTML === "", "500 sem JSON: mensagem simples");
    api.redeCaida = true; env.limparRegistro();
    doc.clicar(botao(env, "Atualizar", e("prtListaCx"))); await env.ocioso();
    confere(/Não foi possível falar com o servidor/.test(texto(env, "prtListaResultado")) && env.toasts().length === 1, "rede caída: mensagem na tela e um toast só");
    api.redeCaida = false;
    // 401: o fetchProtegido volta ao login
    env.api.rotas["GET protecao-menores/incidentes"] = { status: 401, corpo: { sucesso: false, mensagem: "Sessão inválida ou expirada." } };
    env.limparRegistro();
    doc.clicar(botao(env, "Atualizar", e("prtListaCx"))); await env.ocioso();
    confere(env.g("window.__telaInicial") === 1 && env.intervalos.size === 0, "401: volta ao login e para o relógio");
    confere(env.g("authToken") === null && e("prtListaIncidentes").innerHTML === "" && texto(env, "prtListaResultado") === "", "401: a sessão foi limpa e a fila saiu da página (a resposta velha não escreve nada)");
    confere(env.toasts().length === 1 && /sessão expirou/i.test(env.toasts()[0]), `401: o aviso é o toast do fetchProtegido (${env.toasts().join("|")})`);
    for (const id of ["prtListaResultado", "prtDetalheMsg", "prtPadroesResultado", "prtComiteResultado", "prtRelResultado", "prtSemAcesso"]) confere(e(id) && e(id).getAttribute("role") === "status", `acessibilidade: ${id} sem role=status`);
    confere(e("btnPrtSecaoIncidentes").getAttribute("aria-pressed") === "true", "a pílula escolhida devia ter aria-pressed=true");
  });

  cenario("Fila (M1): a fila que chega depois de sair da aba ou de ir para outra seção NÃO volta à página nem religa o relógio", async () => {
    // (1) o catálogo ainda vem quando a pessoa sai da aba: depois que ele chega, nada é montado, nenhuma fila é pedida e nenhum intervalo nasce
    const env = ambienteAtual = ambienteLideranca(); const { doc, api, e } = env;
    const S = { fila: filaPadrao(), det: {} };
    rotasDaLideranca(env, S);
    const presaCat = env.retem(c => c.chave === "GET protecao-menores/catalogos");
    env.ev("mostrarAbaSecretaria('protecao')");
    for (let i = 0; i < 30 && !presaCat.chegou; i++) await new Promise(r => setImmediate(r));
    confere(presaCat.chegou, "M1 (1): o pedido do catálogo devia estar a caminho");
    env.ev("mostrarAbaSecretaria('documentos')"); await env.ocioso();     // saiu da aba antes de o catálogo chegar
    presaCat.liberar(); await env.ocioso();
    confere(e("prtListaIncidentes").innerHTML === "" && !doc.body.textContent.includes("[prot1]") && !doc.body.textContent.includes("[cong1]"), "M1 (1): a fila (protocolo, congregação, datas) NÃO pode aparecer na página depois de a pessoa sair da aba");
    confere(env.intervalos.size === 0, `M1 (1): o relógio NÃO pode ligar fora da aba (há ${env.intervalos.size} intervalo(s))`);
    confere(chamadas(env, "GET protecao-menores/incidentes").length === 0, "M1 (1): a fila nem deve ser pedida ao servidor");
    api.retencoes.length = 0;
    // (1b) o mesmo, saindo da sessão
    const envB = ambienteAtual = ambienteLideranca();
    rotasDaLideranca(envB, { fila: filaPadrao(), det: {} });
    const presaCatB = envB.retem(c => c.chave === "GET protecao-menores/catalogos");
    envB.ev("mostrarAbaSecretaria('protecao')");
    for (let i = 0; i < 30 && !presaCatB.chegou; i++) await new Promise(r => setImmediate(r));
    envB.ev("limparSessao()");
    presaCatB.liberar(); await envB.ocioso();
    confere(envB.e("prtListaIncidentes").innerHTML === "" && envB.intervalos.size === 0 && chamadas(envB, "GET protecao-menores/incidentes").length === 0, "M1 (1b): sair da sessão com o catálogo a caminho: nada é montado e nenhuma fila é pedida");

    // (2) a fila de ABERTOS ainda vem quando a pessoa vai para Padrões: ela não reescreve a lista nem religa o relógio
    const env2 = ambienteAtual = ambienteLideranca();
    const S2 = { fila: filaPadrao(), det: {} };
    rotasDaLideranca(env2, S2);
    env2.api.rotas["GET protecao-menores/padroes"] = () => ({ corpo: F.padroes([1, 2, 3].map(i => ({ incidenteId: 10 + i, nivel: "QUEBRA_POLITICA", equipeId: 3, envolvidoMembroId: 41, data: F.hoje })), { "EQUIPE:3": ATAQUE("equipePad"), "PESSOA:41": ATAQUE("pessoaPad") }) });
    await abrirAba(env2);
    confere(env2.intervalos.size === 1 && env2.e("prtListaIncidentes").children.length === 8, "M1 (2): a fila carregou e o relógio anda");
    S2.fila = [{ id: 31, protocolo: ATAQUE("protTardia"), prazoEm: em(5) }];
    const presaLista = env2.retem(x => x.chave === "GET protecao-menores/incidentes");
    const pedido = env2.ev("prtCarregarIncidentesAcao()");
    for (let i = 0; i < 30 && !presaLista.chegou; i++) await new Promise(r => setImmediate(r));
    confere(presaLista.chegou, "M1 (2): o pedido da fila devia estar a caminho");
    env2.doc.clicar(env2.e("btnPrtSecaoPadroes")); await env2.ocioso();
    confere(env2.intervalos.size === 0, "M1 (2): fora da fila não há relógio");
    presaLista.liberar(); await esperar(pedido); await env2.ocioso();
    confere(!env2.doc.body.textContent.includes("[protTardia]"), "M1 (2): a fila que chegou depois de a pessoa ir para Padrões NÃO pode reescrever a lista");
    confere(env2.intervalos.size === 0, `M1 (2): ... nem religar o relógio (há ${env2.intervalos.size} intervalo(s))`);
    confere(env2.e("prtListaIncidentes").children.length === 8, "M1 (2): a lista segue como estava");
    env2.api.retencoes.length = 0;
    // voltar para os incidentes pede a fila de novo e ela vale
    env2.doc.clicar(env2.e("btnPrtSecaoIncidentes")); await env2.ocioso();
    confere(env2.doc.body.textContent.includes("[protTardia]") && env2.intervalos.size === 1, "M1 (2): voltar para os incidentes carrega a fila atual e religa o relógio");

    // (3) os padrões ainda vêm quando a pessoa volta para a fila: a resposta velha não escreve na seção que ficou para trás
    env2.api.rotas["GET protecao-menores/padroes"] = () => ({ corpo: F.padroes([1, 2, 3].map(i => ({ incidenteId: 10 + i, nivel: "QUEBRA_POLITICA", equipeId: 3, envolvidoMembroId: 41, data: F.hoje })), { "EQUIPE:3": ATAQUE("equipeTardia"), "PESSOA:41": ATAQUE("pessoaTardia") }) });   // outro conteúdo: a resposta tardia se distingue do que já estava lá
    const presaPad = env2.retem(x => x.chave === "GET protecao-menores/padroes");
    env2.doc.clicar(env2.e("btnPrtSecaoPadroes"));
    for (let i = 0; i < 30 && !presaPad.chegou; i++) await new Promise(r => setImmediate(r));
    confere(presaPad.chegou, "M1 (3): o pedido dos padrões devia estar a caminho");
    env2.doc.clicar(env2.e("btnPrtSecaoIncidentes")); await env2.ocioso();
    presaPad.liberar(); await env2.ocioso();
    confere(!env2.doc.body.textContent.includes("[equipeTardia]"), "M1 (3): os padrões que chegaram depois de a pessoa voltar para a fila NÃO podem entrar na página");
    env2.api.retencoes.length = 0;
  });

  // ============================================================================================================================================
  // 4) A FICHA, O RELATO PROTEGIDO
  // ============================================================================================================================================
  const detalheDeAtaque = (extra = {}) => {
    const d = Object.assign({
      id: 1, nivel: "ALEGACAO", origem: "CANAL_AJUDA", prazoEm: em(3, 20), protocolo: ATAQUE("protoDet"), congregacaoNome: ATAQUE("congDet"), descricao: ATAQUE("descDet"), onde: ATAQUE("ondeDet"),
      equipeNome: ATAQUE("equipeDet"), contatoCanal: ATAQUE("contatoDet"), relatadoPor: "PROPRIA_CRIANCA", relatadoPorRotulo: ATAQUE("relatadoPorRotulo"), motivoAtaque: ATAQUE("motivoEnc"), relato: { registrado: true, adendos: 2 },
      envolvidos: [{ envolvidoId: 7, membroId: 41, nome: ATAQUE("envDet"), ultimaDecisao: "MANTIDO_AFASTADO", nDecisoes: 1 }, { envolvidoId: 8, nome: ATAQUE("envNome"), membroId: null }, { envolvidoId: 9, membroId: 42, nome: ATAQUE("envSem"), ultimaDecisao: null, nDecisoes: 0 }],
      comunicacoes: [{ protocoloExterno: ATAQUE("protExt"), referenciaArquivo: ATAQUE("refArq"), observacao: ATAQUE("obsCom"), registradoPorNome: ATAQUE("porCom"), orgaoRotulo: ATAQUE("orgaoRot"), formaRotulo: ATAQUE("formaRot"), foraDoPrazo: true }],
      nAnexos: 2, decisoes: [{ envolvidoId: 7, decisao: "MANTIDO_AFASTADO", decisaoRotulo: ATAQUE("decRot"), observacao: ATAQUE("obsDec"), decididaPorNome: ATAQUE("porDec") }],
      reclassificacoes: [{ de: "QUEBRA_POLITICA", para: "ALEGACAO", motivo: ATAQUE("motivoRec"), porNome: ATAQUE("porRec") }], leituras: [{ nome: ATAQUE("leitor") }]
    }, extra);
    return d;
  };
  const RELATO_ATAQUE = `Ela disse "'><img src=x onerror="window.__xss('relato')"><svg onload=window.__xss('relato')>[relato] e depois ficou quieta.`;
  const ADENDO_ATAQUE = `Depois contou mais: <script>window.__xss('adendo')</script>[adendo]`;

  cenario("Ficha: todos os campos com ataque, botões por `acoes`, 404 neutro", async () => {
    const env = ambienteAtual = ambienteLideranca(); const { doc, api, e } = env;
    const S = { fila: filaPadrao(), det: { 1: () => detalheDeAtaque(), 2: { id: 2, nivel: "ALEGACAO", prazoEm: em(8), geral: false }, 4: { id: 4, nivel: "ALEGACAO", prazoEm: em(-2) } } };
    rotasDaLideranca(env, S);
    await abrirAba(env);
    env.limparRegistro();
    doc.clicar(botao(env, "Abrir", cartaoDe(env, 1))); await env.ocioso();
    const ch = chamadas(env, "GET protecao-menores/incidente");
    confere(ch.length === 1 && ch[0].consulta.incidenteId === "1", "abrir devia pedir incidente?incidenteId=1");
    confere(env.foco() && env.foco().id === "prtDetalheTitulo" && env.foco().getAttribute("tabindex") === "-1" && env.foco().textContent.includes("[protoDet]"), "L9: abrir a ficha leva o foco para o título dela (protocolo)");
    confere(e("prtDetalheCx").style.display === "block" && e("prtListaCx").style.display === "none", "a ficha substitui a fila");
    const ficha = texto(env, "prtDetalheConteudo");
    for (const marca of ["protoDet", "congDet", "descDet", "ondeDet", "equipeDet", "contatoDet", "envDet", "envNome", "envSem", "protExt", "refArq", "obsCom", "porCom", "obsDec", "porDec", "motivoRec", "porRec", "leitor", "relatadoPorRotulo", "orgaoRot", "formaRot", "decRot", "motivoEnc"]) confere(ficha.includes(`[${marca}]`), `a ficha devia mostrar o campo "${marca}" (como texto)`);
    confere(/afastamento cautelar \(mantido pelo Comitê\)/.test(ficha) && /afastamento cautelar \(aguardando a decisão\)/.test(ficha), "o envolvido com afastamento cautelar tem selo e a decisão (mantido) ou o aviso de que aguarda");
    confere(/sem matrícula/.test(ficha), "quem é só um nome aparece como 'sem matrícula'");
    confere(/fora do prazo/.test(ficha), "a comunicação fora do prazo tem selo");
    confere(/2 arquivo\(s\) anexado\(s\)/.test(ficha) && /não coloque o nome da criança no nome do arquivo/i.test(ficha), "a quantidade de anexos e o aviso do nome do arquivo devem aparecer");
    confere(/Há um relato guardado e 2 adendo\(s\)/.test(ficha), "devia dizer que há relato e adendos, sem mostrá-los");
    confere(!ficha.includes("[relato]"), "a ficha NÃO mostra o relato antes de pedir");
    confere(/Quem leu o relato/.test(ficha), "o nível geral vê quem leu o relato");
    confere(/Suspeita ou relato de violência/.test(ficha) && /Canal de ajuda/.test(ficha), "nível e origem na ficha");
    confere(/Mudanças de nível/.test(ficha) && /Decisões sobre o afastamento/.test(ficha), "reclassificações e decisões do Comitê aparecem");
    confere(/Ainda falta para encerrar/.test(ficha) && /Falta o Comitê decidir|comprovante|comunicação/.test(ficha) === false || /Ainda falta para encerrar/.test(ficha), "o que falta para encerrar devia aparecer");
    limpo(env, "Ficha", []);
    // M5: quem trata uma SUSPEITA aberta vê na ficha o que NÃO fazer (do catálogo do servidor)
    const caixaNaoFaca = e("prtFichaNaoFaca");
    confere(!!caixaNaoFaca && /NÃO FAÇA/.test(caixaNaoFaca.textContent) && pm.NAO_FACA.every(n => caixaNaoFaca.textContent.includes(n.slice(0, 40))) && caixaNaoFaca.getAttribute("role") === "note", "M5: a ficha de uma suspeita aberta devia trazer a caixa NÃO FAÇA, com todos os itens do catálogo");
    limpo(env, "Ficha/NÃO FAÇA", [ATAQUE("naoFaca0"), ATAQUE("naoFaca3")]);
    confere(e("prtRelogioDet") === null, "com comunicação registrada a ficha não tem relógio");
    // botões por `acoes`
    const textos = [...e("prtDetalheConteudo").descendentes()].filter(x => x.localName === "button").map(x => x.textContent);
    const tem = (t) => textos.some(x => x.includes(t));
    confere(tem("Registrar a comunicação ao órgão") && tem("Adendo") && tem("Encerrar o caso") && tem("Decidir o afastamento") && tem("Ler o relato") && tem("Anexar comprovante") && tem("Atualizar") && !tem("Reclassificar"), `botões da suspeita aberta (nível geral): ${textos.join(" | ")}`);
    confere([...e("prtDetalheConteudo").descendentes()].filter(x => x.localName === "button" && /Decidir o afastamento/.test(x.textContent)).length === 2, "decidir para cada envolvido que é membro (quem é só um nome não tem botão)");
    // L1: o servidor mantém a linha do nome depois de um vínculo; com QUALQUER pessoa do cadastro já vinculada (aqui há duas), o botão de vincular não é oferecido (um segundo vínculo tiraria outra pessoa das escalas)
    confere([...e("prtDetalheConteudo").descendentes()].filter(x => x.localName === "button" && /Vincular a uma pessoa do cadastro/.test(x.textContent)).length === 0, "L1: com uma pessoa do cadastro já vinculada ao incidente, nenhuma linha oferece o botão de vincular");
    confere(/sem matrícula/.test(texto(env, "prtDetalheConteudo")) && texto(env, "prtDetalheConteudo").includes("[envNome]"), "L1: a linha do nome continua visível (só o botão some)");
    // sem comunicação: a ficha tem o relógio, e ele anda
    doc.clicar(botao(env, "Voltar à lista", e("prtDetalheCx"))); await env.ocioso();
    confere(env.foco() && env.foco().id === "prtAbrirCartao1", `L9: fechar a ficha leva o foco de volta ao "Abrir" do incidente de onde se veio (${env.foco() && env.foco().id})`);
    doc.clicar(botao(env, "Abrir", cartaoDe(env, 4))); await env.ocioso();
    const chipDet = e("prtRelogioDet");
    confere(chipDet && chipDet.textContent === "⛔ vencido há 2 h 00 min" && /prt-relogio-vencido/.test(chipDet.className), `a ficha sem comunicação tem o relógio (${chipDet && chipDet.textContent})`);
    env.avancar(30 * MIN); env.tique();
    confere(chipDet.textContent === "⛔ vencido há 2 h 30 min", "e ele anda");
    confere(env.intervalos.size === 1, "um intervalo enquanto a ficha com relógio está aberta");
    doc.clicar(botao(env, "Voltar à lista", e("prtDetalheCx"))); await env.ocioso();
    doc.clicar(botao(env, "Abrir", cartaoDe(env, 1))); await env.ocioso();
    // o Dirigente (não geral): sem decidir nem encerrar, sem decisões, sem contato do canal, sem quem leu
    env.limparRegistro();
    S.geral = false;
    doc.clicar(botao(env, "Voltar à lista", e("prtDetalheCx"))); await env.ocioso();
    confere(e("prtDetalheCx").style.display === "none" && e("prtListaCx").style.display !== "none" && e("prtDetalheConteudo").innerHTML === "", "Voltar à lista fecha e apaga a ficha");
    doc.clicar(botao(env, "Abrir", cartaoDe(env, 2))); await env.ocioso();
    const t2 = [...e("prtDetalheConteudo").descendentes()].filter(x => x.localName === "button").map(x => x.textContent);
    confere(t2.some(x => x.includes("Registrar a comunicação")) && !t2.some(x => /Encerrar o caso|Decidir o afastamento/.test(x)), `o Dirigente não decide nem encerra: ${t2.join(" | ")}`);
    confere(!/Quem leu o relato/.test(texto(env, "prtDetalheConteudo")) && !/Decisões sobre o afastamento/.test(texto(env, "prtDetalheConteudo")), "o Dirigente não vê leituras nem decisões do Comitê");
    // quase-acidente: nada de comunicação, adendo; reclassificar sim
    S.det[7] = { id: 7, nivel: "QUEBRA_POLITICA", exigeComunicacao: false, relato: { registrado: false, adendos: 0 }, geral: true };
    S.det[8] = { id: 8, nivel: "ALEGACAO", status: "ENCERRADO", encerradoEm: em(-30), relato: { registrado: false, adendos: 0 }, geral: true };
    doc.clicar(botao(env, "Voltar à lista", e("prtDetalheCx"))); await env.ocioso();
    doc.clicar(botao(env, "Abrir", cartaoDe(env, 7))); await env.ocioso();
    const t7 = [...e("prtDetalheConteudo").descendentes()].filter(x => x.localName === "button").map(x => x.textContent);
    confere(t7.some(x => x.includes("Reclassificar")) && !t7.some(x => /comunicação ao órgão|Adendo|Anexar|Ler o relato/.test(x)), `quebra de política: só reclassificar e encerrar (${t7.join(" | ")})`);
    confere(/Não há relato guardado/.test(texto(env, "prtDetalheConteudo")), "sem relato guardado, sem botão de ler");
    confere(e("prtFichaNaoFaca") === null, "M5: a quebra de política não traz a caixa NÃO FAÇA (ela é da suspeita)");
    await env.ev("prtAbrirDetalheAcao(8)"); await env.ocioso();
    confere(/Como o caso terminou/.test(texto(env, "prtDetalheConteudo")) && e("prtFichaNaoFaca") === null, "M5: a suspeita já encerrada não traz a caixa NÃO FAÇA (ela é de quem ainda trata o caso)");
    // 404: a MESMA resposta para "não existe", "fora do alcance" e "você é um envolvido": a tela não distingue
    doc.clicar(botao(env, "Voltar à lista", e("prtDetalheCx"))); await env.ocioso();
    S.det[2] = undefined; delete S.det[2];
    env.limparRegistro();
    doc.clicar(botao(env, "Abrir", cartaoDe(env, 2))); await env.ocioso();
    const neutro = texto(env, "prtDetalheConteudo");
    confere(/Não foi possível abrir este incidente\. Ele pode não existir ou estar fora do seu alcance\./.test(neutro) && !/Incidente não encontrado/.test(neutro) && !/envolvid/i.test(neutro), `404: mensagem neutra (${neutro})`);
    confere(env.toasts().length === 0, "404 não solta toast");
    confere(e("prtDetalheCx").style.display === "block", "o botão de voltar continua à mão");
    confere(env.foco() && env.foco().id === "prtDetalheErro", "L9: quando a ficha não abre, o foco vai para a mensagem (que o leitor de tela lê)");
    // detalhe que o servidor recusa por rede
    doc.clicar(botao(env, "Voltar à lista", e("prtDetalheCx"))); await env.ocioso();
    env.api.redeCaida = true;
    doc.clicar(botao(env, "Abrir", cartaoDe(env, 1))); await env.ocioso();
    confere(/Não foi possível falar com o servidor/.test(texto(env, "prtDetalheConteudo")), "rede caída ao abrir a ficha: mensagem simples");
    env.api.redeCaida = false;
    confereAcessibilidade(env, ["abaProtecao"], "Aba/ficha");
  });

  cenario("Relato protegido: confirmação, 428, textContent, caixa que se apaga em todos os caminhos", async () => {
    const env = ambienteAtual = ambienteLideranca(); const { doc, api, e } = env;
    const S = { fila: filaPadrao(), det: { 1: () => detalheDeAtaque(), 2: { id: 2, nivel: "ALEGACAO", prazoEm: em(8) } }, fatorOk: false, lidos: 0 };
    rotasDaLideranca(env, S);
    api.rotas["POST protecao-menores/relato"] = (c) => {
      if (!S.fatorOk) return { status: 428, corpo: { sucesso: false, precisaFator: true, mensagem: "Confirme de novo quem você é." } };
      S.lidos++;
      return { corpo: { sucesso: true, relato: { texto: RELATO_ATAQUE, registradoEm: em(-3) }, adendos: [{ texto: ADENDO_ATAQUE, registradoEm: em(-1) }] } };
    };
    env.ctx.__fatorConfirmar = async () => { S.fatorOk = true; return true; };
    await abrirAba(env);
    doc.clicar(botao(env, "Abrir", cartaoDe(env, 1))); await env.ocioso();
    const verRelato = () => botao(env, "Ler o relato", e("prtDetalheConteudo"));
    const cx = () => e("prtRelatoCx"), corpo = () => e("prtRelatoCorpo");
    confere(cx().style.display === "none" && corpo().textContent === "", "a caixa do relato começa fechada e vazia");
    confere(cx().getAttribute("role") === "region" && /Relato guardado/.test(cx().getAttribute("aria-label") || ""), "a caixa do relato tem rótulo acessível (região com aria-label)");
    // cancelar a confirmação: nada é pedido ao servidor
    env.limparRegistro();
    let m = await clicarEResponder(env, verRelato(), false);
    confere(m.aberto && /registrada com o seu nome/.test(m.texto) && /quem leu e quando/.test(m.texto), `a confirmação devia dizer que a leitura fica registrada com o seu nome: ${m.texto.slice(0, 90)}`);
    confere(chamadas(env, "POST protecao-menores/relato").length === 0 && cx().style.display === "none", "cancelar não lê o relato");
    // confirmar: o servidor pede a confirmação reforçada (428), o fetchProtegido a obtém e repete UMA vez
    env.limparRegistro();
    m = await clicarEResponder(env, verRelato(), true);
    const pr = chamadas(env, "POST protecao-menores/relato");
    confere(pr.length === 2 && pr.every(x => x.corpo.incidenteId === 1 && typeof x.corpo.incidenteId === "number" && Object.keys(x.corpo).length === 1), `o 428 é repetido UMA vez (saíram ${pr.length} chamadas)`);
    confere(env.g("window.__fatorPedidos") === 1 && S.lidos === 1, "a confirmação reforçada foi pedida uma vez e o relato lido uma vez");
    confere(cx().style.display === "block" && corpo().textContent.includes(RELATO_ATAQUE) && corpo().textContent.includes(ADENDO_ATAQUE), "o relato e o adendo aparecem na caixa, como TEXTO");
    confere(/O que foi contado/.test(corpo().textContent) && /Adendo 1/.test(corpo().textContent), "com títulos simples");
    confere(env.foco() === cx() && cx().getAttribute("tabindex") === "-1", "L9: ao abrir o relato o foco vai para a caixa dele");
    confere(env.doc._ataques.length === 0 && env.ctx.__xss.chamadas.length === 0, `o relato NÃO pode virar marcação nem executar nada (${JSON.stringify(env.doc._ataques.slice(0, 2))})`);
    confere([...corpo().descendentes()].every(x => ["h5", "p"].includes(x.localName)), "a caixa só tem os elementos que a própria tela criou (h5 e p): nenhum nasceu do relato");
    confere(!doc.body.innerHTML.includes("<img src=x"), "o texto do relato não gerou tag nenhuma no HTML da página");
    confere(env.gravacoes.length === 0, "o relato nunca vai para o armazenamento do navegador");
    // fechar apaga
    doc.clicar(botao(env, "Fechar e apagar", cx())); await env.ocioso();
    confere(cx().style.display === "none" && corpo().textContent === "" && !doc.body.textContent.includes("[relato]"), "Fechar apaga o relato da tela");
    confere(env.foco() && env.foco().id === "prtLerRelatoBotao", `L9: ao fechar o relato o foco volta ao botão de ler (${env.foco() && env.foco().id})`);
    // trocar de incidente apaga
    S.fatorOk = true;
    m = await clicarEResponder(env, verRelato(), true);
    confere(corpo().textContent.includes("[relato]"), "o relato voltou a ser lido");
    doc.clicar(botao(env, "Voltar à lista", e("prtDetalheCx"))); await env.ocioso();
    confere(!doc.body.textContent.includes("[relato]") && !doc.body.textContent.includes("[adendo]"), "Voltar à lista apaga o relato da página");
    doc.clicar(botao(env, "Abrir", cartaoDe(env, 1))); await env.ocioso();
    m = await clicarEResponder(env, verRelato(), true);
    doc.clicar(botao(env, "Voltar à lista", e("prtDetalheCx"))); await env.ocioso();
    doc.clicar(botao(env, "Abrir", cartaoDe(env, 2))); await env.ocioso();
    confere(!doc.body.textContent.includes("[relato]"), "abrir OUTRO incidente apaga o relato do anterior");
    // atualizar a ficha apaga
    doc.clicar(botao(env, "Voltar à lista", e("prtDetalheCx"))); await env.ocioso();
    doc.clicar(botao(env, "Abrir", cartaoDe(env, 1))); await env.ocioso();
    await clicarEResponder(env, verRelato(), true);
    doc.clicar(botao(env, "Atualizar", e("prtDetalheConteudo"))); await env.ocioso();
    confere(!doc.body.textContent.includes("[relato]"), "atualizar a ficha apaga o relato");
    // sair da aba apaga
    await clicarEResponder(env, verRelato(), true);
    confere(doc.body.textContent.includes("[relato]"), "(o relato está na tela de novo)");
    await env.ev("sairDoModulo()"); await env.ocioso();
    confere(!doc.body.textContent.includes("[relato]") && e("prtDetalheConteudo").innerHTML === "", "sair da aba apaga o relato e a ficha da página");
    // trocar de login apaga (limparSessao real) e a outra pessoa não herda a tela
    await abrirAba(env);
    doc.clicar(botao(env, "Abrir", cartaoDe(env, 1))); await env.ocioso();
    await clicarEResponder(env, verRelato(), true);
    confere(doc.body.textContent.includes("[relato]"), "(relato na tela antes de sair da sessão)");
    env.ev("limparSessao()");
    confere(!doc.body.textContent.includes("[relato]") && !doc.body.textContent.includes("[protoDet]"), "sair da sessão apaga o relato e a ficha");
    env.sessao({ matricula: 9, nivel: "GLOBAL", permissoes: ["protecao_menores"], geral: true });
    await abrirAba(env);
    confere(!doc.body.textContent.includes("[relato]") && !doc.body.textContent.includes("[protoDet]"), "a pessoa seguinte não vê nada do relato nem da ficha anterior");
    // trocar de login SEM passar pela saída (outro token na mesma página): a tela é refeita no próximo carregamento
    env.sessao({ matricula: 5, nivel: "GLOBAL", permissoes: ["protecao_menores"], geral: true });
    await abrirAba(env);
    doc.clicar(botao(env, "Abrir", cartaoDe(env, 1))); await env.ocioso();
    await clicarEResponder(env, verRelato(), true);
    env.sessao({ matricula: 11, nivel: "GLOBAL", permissoes: ["protecao_menores"], geral: true });
    await abrirAba(env);
    confere(!doc.body.textContent.includes("[relato]"), "outra matrícula no mesmo navegador: o relato foi apagado ao reabrir a aba");

    // resposta atrasada: o relato que chega depois de fechar a ficha, de trocar de incidente ou de sair NÃO entra
    for (const [como, acao] of [["fechou a ficha", async (e2, d2) => { d2.clicar(botao(env, "Voltar à lista", e2("prtDetalheCx"))); }], ["abriu outro incidente", async (e2, d2) => { d2.clicar(botao(env, "Voltar à lista", e2("prtDetalheCx"))); await env.ocioso(); d2.clicar(botao(env, "Abrir", cartaoDe(env, 2))); }], ["saiu da aba", async () => { await env.ev("sairDoModulo()"); }]]) {
      env.sessao({ matricula: 5, nivel: "GLOBAL", permissoes: ["protecao_menores"], geral: true });
      await abrirAba(env);
      doc.clicar(botao(env, "Abrir", cartaoDe(env, 1))); await env.ocioso();
      const presa = env.retem(x => x.chave === "POST protecao-menores/relato");
      doc.clicar(verRelato()); await env.responderModal(true);
      for (let i = 0; i < 30 && !presa.chegou; i++) await new Promise(r => setImmediate(r));
      confere(presa.chegou, `(${como}) o pedido do relato devia estar a caminho`);
      await acao(e, doc); await env.ocioso();
      presa.liberar(); await env.ocioso();
      confere(!doc.body.textContent.includes("[relato]") && !doc.body.textContent.includes("[adendo]"), `relato atrasado: se a pessoa ${como}, ele NÃO pode aparecer na tela`);
      env.api.retencoes.length = 0;
    }

    // a confirmação reforçada não veio: mensagem simples, nenhum relato
    S.fatorOk = false; env.ctx.__fatorConfirmar = async () => false;
    env.sessao({ matricula: 5, nivel: "GLOBAL", permissoes: ["protecao_menores"], geral: true });
    await abrirAba(env);
    doc.clicar(botao(env, "Abrir", cartaoDe(env, 1))); await env.ocioso();
    env.limparRegistro();
    await clicarEResponder(env, verRelato(), true);
    confere(/confirmação recente de quem você é/.test(texto(env, "prtDetalheMsg")) && cx().style.display === "none" && corpo().textContent === "", "sem a confirmação reforçada: mensagem simples e nenhum relato");
    confere(chamadas(env, "POST protecao-menores/relato").length === 1, "sem confirmar, o pedido NÃO é repetido");
    // duplo clique: um pedido só (o segundo toque, com o primeiro ainda a caminho, recebe "Aguarde")
    S.fatorOk = true;
    env.limparRegistro();
    const presa2 = env.retem(x => x.chave === "POST protecao-menores/relato");
    doc.clicar(verRelato()); await env.responderModal(true);
    for (let i = 0; i < 30 && !presa2.chegou; i++) await new Promise(r => setImmediate(r));
    confere(verRelato().disabled === true, "com o pedido a caminho o botão fica desabilitado");
    const segundaLeitura = env.ev("prtLerRelatoAcao(1, null)"); await env.responderModal(true); await esperar(segundaLeitura); await env.ocioso();
    confere(chamadas(env, "POST protecao-menores/relato").length === 1 && /Aguarde/.test(env.toasts().join("|")), "duplo clique: um pedido só e o aviso 'Aguarde'");
    presa2.liberar(); await env.ocioso();
    confere(verRelato().disabled === false, "o botão é solto no fim");
    // o servidor recusa o relato (404 igual a "não existe")
    env.api.rotas["POST protecao-menores/relato"] = { status: 404, corpo: { sucesso: false, mensagem: "Incidente não encontrado." } };
    env.limparRegistro();
    await clicarEResponder(env, verRelato(), true);
    confere(/Incidente não encontrado/.test(texto(env, "prtDetalheMsg")) && cx().style.display === "none", "404 ao ler o relato: mensagem do servidor, caixa fechada");
    confere(env.doc._ataques.length === 0 && env.ctx.__xss.chamadas.length === 0, "nada executou em todo o roteiro do relato");
  });

  // ============================================================================================================================================
  // 5) OS ATOS: comunicação, adendo, reclassificação, decisão do afastamento, encerramento
  // ============================================================================================================================================
  const preparar = async (extra = {}) => {
    const env = ambienteAtual = ambienteLideranca(extra.opcoesAmbiente);
    const S = Object.assign({ fila: filaPadrao(), det: {}, fatorOk: false }, extra.estado || {});
    rotasDaLideranca(env, S);
    env.ctx.__fatorConfirmar = async () => { S.fatorOk = true; return true; };
    await abrirAba(env);
    return { env, S };
  };
  const abrirFicha = async (env, id) => {
    const aberta = env.e("prtDetalheCx").style.display === "block";
    if (aberta) { env.doc.clicar(botao(env, "Voltar à lista", env.e("prtDetalheCx"))); await env.ocioso(); }
    env.doc.clicar(botao(env, "Abrir", cartaoDe(env, id))); await env.ocioso();
  };

  cenario("Atos: comunicação ao órgão (validações, confirmação, 422) e o comprovante anexado", async () => {
    const { env, S } = await preparar({ estado: { ajustarCatalogo: (c) => { c.orgaos.push({ codigo: ATAQUE("orgaoCodigo"), rotulo: "Órgão extra" }); }, det: { 1: () => detalheDeAtaque({ comunicacoes: [], nAnexos: 0, decisoes: [], reclassificacoes: [], leituras: [], envolvidos: [{ envolvidoId: 7, membroId: 41, nome: "Fulano" }] }) } } });
    const { doc, api, e } = env;
    S.comunicados = [];
    api.rotas["POST protecao-menores/comunicacao"] = (c) => {
      S.comunicados.push(c.corpo);
      if (S.recusa) return { status: 422, corpo: { sucesso: false, mensagem: `A hora em que o órgão foi avisado não pode estar no futuro. ${ATAQUE("msg422")}` } };
      S.det[1] = () => detalheDeAtaque({ comunicacoes: [{ protocoloExterno: c.corpo.protocoloExterno || null, referenciaArquivo: c.corpo.referenciaArquivo || null, foraDoPrazo: true, registradoPorNome: "Eu" }], nAnexos: 0, envolvidos: [{ envolvidoId: 7, membroId: 41, nome: "Fulano" }], decisoes: [], reclassificacoes: [], leituras: [] });
      return { status: 201, corpo: { sucesso: true, foraDoPrazo: true, comprovante: !!c.corpo.protocoloExterno, mensagem: `Comunicação registrada, mas FORA do prazo de 24 horas (isso fica no relatório do Comitê). ${ATAQUE("msgCom")}` } };
    };
    api.rotas["GET anexos"] = { corpo: [{ anexoId: 5, nomeArquivo: ATAQUE("anexoNome"), mimeType: "application/pdf", criadoEm: em(-1), urlAssinada: "https://exemplo.org/arquivo.pdf" }] };
    await abrirFicha(env, 1);
    doc.clicar(botao(env, "Registrar a comunicação ao órgão", e("prtDetalheConteudo"))); await env.ocioso();
    const form = e("prtFormAcao");
    confere(env.foco() && env.foco().id === "prtFcOrgao", `L9: ao abrir o formulário o foco vai para o primeiro campo (${env.foco() && env.foco().id})`);
    const gatilhoCom = botao(env, "Registrar a comunicação ao órgão", e("prtDetalheConteudo"));
    doc.clicar(botao(env, "cancelar", form)); await env.ocioso();
    confere(e("prtFormAcao").innerHTML === "" && env.foco() === gatilhoCom, "L9: cancelar fecha o formulário e devolve o foco ao botão que o abriu");
    doc.clicar(gatilhoCom); await env.ocioso();   // reabre para o resto da prova
    confere(/para o relógio de 24 horas/.test(form.textContent) && /não pode ser apagado/.test(form.textContent), "o formulário explica o efeito (para o relógio, não se apaga)");
    confere([...e("prtFcOrgao").options].length === 7 && [...e("prtFcForma").options].length === 6, "órgãos (com o extra) e formas vêm do catálogo");
    confere(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(e("prtFcQuando").value), `a data e hora começam em agora (${e("prtFcQuando").value})`);
    limpo(env, "Comunicação/form", [ATAQUE("orgaos-rotulo")]);
    const enviar = async () => { env.limparRegistro(); doc.clicar(botao(env, "Registrar", form)); await env.ocioso(); };
    const semEnvio = (msg, rx) => { confere(S.comunicados.length === 0 && !env.modal().aberto, `${msg}: não pode enviar nem confirmar`); confere(rx.test(texto(env, "prtFcMsg")), `${msg}: devia explicar (${texto(env, "prtFcMsg").slice(0, 70)})`); };
    await enviar(); semEnvio("sem órgão", /Escolha o órgão/);
    doc.escolher(e("prtFcOrgao"), "CONSELHO_TUTELAR"); await enviar(); semEnvio("sem forma", /Escolha como o órgão/);
    doc.escolher(e("prtFcForma"), "TELEFONE"); e("prtFcQuando").value = ""; await enviar(); semEnvio("sem data", /Informe a data e a hora/);
    e("prtFcQuando").value = "2026-10-10T20:00"; await enviar(); semEnvio("hora no futuro", /não pode estar no futuro/);
    e("prtFcQuando").value = "2026-10-08T08:00"; await enviar(); semEnvio("antes da ciência", /anterior ao momento em que a Igreja ficou sabendo/);
    e("prtFcQuando").value = "2026-10-09T11:30"; e("prtFcProtocolo").value = "p".repeat(61); await enviar(); semEnvio("protocolo grande", /até 60 caracteres/);
    e("prtFcProtocolo").value = "<123>"; await enviar(); semEnvio("protocolo com < >", /sem < ou >/);
    e("prtFcProtocolo").value = "CT-2026/123"; e("prtFcArquivo").value = "a".repeat(201); await enviar(); semEnvio("arquivo grande", /até 200 caracteres/);
    e("prtFcArquivo").value = "Pasta de proteção, folha 4"; e("prtFcObs").value = "o".repeat(301); await enviar(); semEnvio("observação grande", /até 300 caracteres/);
    e("prtFcObs").value = "Falei com a conselheira Maria.";
    doc.digitar(e("prtFcObs"), "Falei com a conselheira Maria."); confere(texto(env, "prtFcObsContador") === "30", "o contador da observação");
    // confirmação com o efeito; cancelar não envia
    env.limparRegistro();
    let ato = env.ev("(function(){ return prtEnviarComunicacaoAcao(document.getElementById('prtFcOrgao')); })()");
    let m = await env.responderModal(false); await esperar(ato); await env.ocioso();
    confere(m.aberto && /Conselho Tutelar/.test(m.texto) && /para o relógio de 24 horas/.test(m.texto) && /registrado com o seu nome|registrada com o seu nome|fica registrado com o seu nome/.test(m.texto) && /não pode ser apagado/.test(m.texto), `a confirmação devia dizer o efeito: ${m.texto.slice(0, 100)}`);
    confere(S.comunicados.length === 0 && e("prtFcProtocolo").value === "CT-2026/123", "cancelar não envia e não limpa o formulário");
    // o servidor recusa (422): mensagem dele, formulário aberto com o texto
    S.recusa = true; env.limparRegistro();
    ato = env.ev("prtEnviarComunicacaoAcao(document.getElementById('prtFcOrgao'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
    confere(S.comunicados.length === 1 && texto(env, "prtFcMsg").includes("[msg422]") && /psc-aviso/.test(e("prtFcMsg").className), "422: a mensagem do servidor aparece em destaque");
    confere(e("prtFormAcao").innerHTML !== "" && e("prtFcProtocolo").value === "CT-2026/123" && e("prtFcObs").value === "Falei com a conselheira Maria.", "422: o formulário fica aberto com o que foi escrito");
    // sucesso: corpo certo, ficha e fila refeitas, mensagem no lugar certo, formulário fechado
    S.recusa = false; S.comunicados.length = 0; env.limparRegistro();
    ato = env.ev("prtEnviarComunicacaoAcao(document.getElementById('prtFcOrgao'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
    const c = S.comunicados[0];
    confere(S.comunicados.length === 1 && c.incidenteId === 1 && c.orgao === "CONSELHO_TUTELAR" && c.forma === "TELEFONE" && c.protocoloExterno === "CT-2026/123" && c.referenciaArquivo === "Pasta de proteção, folha 4" && c.observacao === "Falei com a conselheira Maria.", `corpo: ${JSON.stringify(c)}`);
    confere(typeof c.incidenteId === "number" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(c.comunicadoEm) && !Number.isNaN(Date.parse(c.comunicadoEm)), `comunicadoEm devia ser um ISO de verdade (${c.comunicadoEm})`);
    confere(Date.parse(c.comunicadoEm) === new Date("2026-10-09T11:30").getTime(), "o horário local digitado vira o instante certo");
    confere(texto(env, "prtDetalheMsg").includes("[msgCom]") && e("prtFormAcao").innerHTML === "", "sucesso: a mensagem do servidor fica na ficha e o formulário se fecha");
    confere(chamadas(env, "GET protecao-menores/incidente").length === 1 && chamadas(env, "GET protecao-menores/incidentes").length === 1, "sucesso: a ficha e a fila são refeitas");
    confere(/comunicado ao órgão/.test(texto(env, "prtDetalheConteudo")) && /fora do prazo/.test(texto(env, "prtDetalheConteudo")), "a comunicação aparece na ficha (fora do prazo)");
    confere(env.toasts().length === 1, `um toast só (${env.toasts().length})`);
    limpo(env, "Comunicação/sucesso", [ATAQUE("msgCom")]);
    // o comprovante: usa o modal de anexos de sempre, com o registro do incidente e o aviso do nome do arquivo
    env.limparRegistro();
    doc.clicar(botao(env, "Anexar comprovante", e("prtDetalheConteudo"))); await env.ocioso();
    const g = chamadas(env, "GET anexos")[0];
    confere(g && g.consulta.tabela === "IncidentesProtecao" && g.consulta.registroId === "1", "o anexo é do registro IncidentesProtecao#1");
    confere(/Anexos — comprovante/.test(env.modal().texto) && /Não coloque o nome da criança no nome do arquivo/.test(env.modal().texto), "o modal de anexos avisa para não pôr o nome da criança no arquivo");
    confere(env.modal().texto.includes("[anexoNome]") && /prova: não pode ser excluída/.test(env.modal().texto) && !botao(env, "Excluir", e("modalCaixa")), "o comprovante anexado é prova: o modal não oferece 'Excluir'");
    limpo(env, "Comunicação/anexos", [ATAQUE("anexoNome")]);
    doc.clicar(botao(env, "Fechar", e("modalCaixa"))); await env.ocioso();
    // duplo clique: com o primeiro pedido ainda a caminho o botão fica desabilitado, e um segundo ato (de outro caminho) recebe "Aguarde" e não envia de novo
    S.recusa = true;
    doc.clicar(botao(env, "Registrar a comunicação", e("prtDetalheConteudo"))); await env.ocioso();
    doc.escolher(e("prtFcOrgao"), "POLICIA"); doc.escolher(e("prtFcForma"), "OFICIO"); e("prtFcQuando").value = "2026-10-09T11:30";
    S.comunicados.length = 0; env.limparRegistro();
    const presa = env.retem(x => x.chave === "POST protecao-menores/comunicacao");
    const enviarDeNovo = () => botao(env, "Registrar", e("prtFormAcao"));
    doc.clicar(enviarDeNovo()); await env.responderModal(true);
    for (let i = 0; i < 30 && !presa.chegou; i++) await new Promise(r => setImmediate(r));
    confere(presa.chegou, "(resposta atrasada) o primeiro pedido da fila devia estar a caminho");
    confere(enviarDeNovo().disabled === true, "com o pedido a caminho o botão fica desabilitado");
    const segunda = env.ev("prtEnviarComunicacaoAcao(null)"); await env.responderModal(true); await esperar(segunda); await env.ocioso();
    confere(chamadas(env, "POST protecao-menores/comunicacao").length === 1 && /Aguarde/.test(env.toasts().join("|")), `duplo clique: um pedido só e o aviso Aguarde (saíram ${chamadas(env, "POST protecao-menores/comunicacao").length})`);
    presa.liberar(); await env.ocioso();
    confere(enviarDeNovo().disabled === false, "o botão é solto no fim");
    confereAcessibilidade(env, ["prtFormAcao"], "Comunicação");
    confere(["prtFcMsg"].every(id => e(id).getAttribute("role") === "status"), "acessibilidade: prtFcMsg com role=status");
  });

  cenario("Atos: adendo e reclassificação", async () => {
    const { env, S } = await preparar({ estado: { det: {
      1: () => detalheDeAtaque({ comunicacoes: [], nAnexos: 0, decisoes: [], reclassificacoes: [], leituras: [], envolvidos: [] }),
      7: { id: 7, nivel: "QUEBRA_POLITICA", exigeComunicacao: false, relato: { registrado: false, adendos: 0 } },
      9: { id: 9, nivel: "QUASE_ACIDENTE", exigeComunicacao: false, relato: { registrado: false, adendos: 0 } }
    } } });
    const { doc, api, e } = env;
    S.posts = [];
    api.rotas["POST protecao-menores/adendo"] = (c) => { S.posts.push(["adendo", c.corpo]); return S.recusa ? { status: 422, corpo: { sucesso: false, mensagem: `Já há 5 adendos. ${ATAQUE("msgAdendo")}` } } : { status: 201, corpo: { sucesso: true, mensagem: "Adendo registrado." } }; };
    api.rotas["POST protecao-menores/reclassificar"] = (c) => { if (c.corpo.nivelNovo === "ALEGACAO" && !S.fatorOk) return { status: 428, corpo: { sucesso: false, precisaFator: true, mensagem: "Confirme de novo." } }; S.posts.push(["reclassificar", c.corpo]); return { corpo: { sucesso: true, nivel: c.corpo.nivelNovo, prazoEm: em(24), escalasDesmarcadas: null, avisados: 2, avisoExterno: true, mensagem: c.corpo.nivelNovo === "ALEGACAO" ? "Incidente reclassificado como suspeita de violência: comunique o Conselho Tutelar imediatamente (o prazo máximo da Igreja, de 24 horas, começou a contar agora)." : "Incidente reclassificado." } }; };
    // ---- adendo
    await abrirFicha(env, 1);
    doc.clicar(botao(env, "Adendo", e("prtDetalheConteudo"))); await env.ocioso();
    confere(env.foco() && env.foco().id === "prtFaTexto", "L9: o formulário do adendo abre com o foco no campo do texto");
    confere(e("prtFaTexto").getAttribute("spellcheck") === "false", "o texto do adendo (palavras da criança) não passa pelo corretor ortográfico");
    confere(/Não faça novas perguntas/.test(texto(env, "prtFormAcao")) && /só se a criança contou algo mais por conta própria/i.test(texto(env, "prtFormAcao")), "o adendo avisa: só se a criança contou por conta própria e sem novas perguntas");
    const enviar = async () => { env.limparRegistro(); doc.clicar(botao(env, "Registrar o adendo", e("prtFormAcao"))); await env.ocioso(); };
    await enviar(); confere(S.posts.length === 0 && /de 10 a 2000/.test(texto(env, "prtFaMsg")), "adendo vazio não envia");
    e("prtFaTexto").value = "<script>x</script> adendo"; await enviar(); confere(S.posts.length === 0, "adendo com < > não envia");
    e("prtFaTexto").value = "a".repeat(2001); await enviar(); confere(S.posts.length === 0, "adendo grande demais não envia");
    S.recusa = true; e("prtFaTexto").value = "Depois ela contou que isso acontece há meses.";
    await enviar();
    confere(S.posts.length === 1 && texto(env, "prtFaMsg").includes("[msgAdendo]") && e("prtFaTexto").value === "Depois ela contou que isso acontece há meses.", "adendo recusado (máximo): mensagem do servidor e texto mantido");
    S.recusa = false; S.posts.length = 0; await enviar();
    confere(S.posts.length === 1 && JSON.stringify(S.posts[0][1]) === JSON.stringify({ incidenteId: 1, texto: "Depois ela contou que isso acontece há meses." }) && texto(env, "prtDetalheMsg") === "Adendo registrado." && e("prtFormAcao").innerHTML === "", "adendo: corpo certo, mensagem na ficha, formulário fechado");
    // ---- reclassificar: só se sobe
    S.posts.length = 0;
    await abrirFicha(env, 7);
    doc.clicar(botao(env, "Reclassificar", e("prtDetalheConteudo"))); await env.ocioso();
    confere(env.foco() && env.foco().id === "prtFrNivel", "L9: o formulário de reclassificar abre com o foco no novo nível");
    let opcoes = [...e("prtFrNivel").options].map(o => o.value);
    confere(JSON.stringify(opcoes) === JSON.stringify(["", "ALEGACAO"]), `de quebra de política só se sobe para suspeita de violência (${opcoes})`);
    await abrirFicha(env, 9);
    doc.clicar(botao(env, "Reclassificar", e("prtDetalheConteudo"))); await env.ocioso();
    opcoes = [...e("prtFrNivel").options].map(o => o.value);
    confere(JSON.stringify(opcoes) === JSON.stringify(["", "QUEBRA_POLITICA", "ALEGACAO"]), `de quase-acidente: quebra de política e suspeita (${opcoes})`);
    confere(e("prtFrAlegCx").style.display === "none", "o relato só é pedido para suspeita de violência");
    const reclass = async () => { env.limparRegistro(); doc.clicar(botao(env, "Reclassificar", e("prtFormAcao"))); await env.ocioso(); };
    await reclass(); confere(S.posts.length === 0 && /Escolha o novo nível/.test(texto(env, "prtFrMsg")), "sem novo nível não envia");
    doc.escolher(e("prtFrNivel"), "QUEBRA_POLITICA"); await reclass(); confere(S.posts.length === 0 && /Explique por que/.test(texto(env, "prtFrMsg")), "sem motivo não envia");
    e("prtFrMotivo").value = "Acontece de novo <sempre>"; await reclass(); confere(S.posts.length === 0, "motivo com < > não envia");
    e("prtFrMotivo").value = "Foi a terceira vez e houve contato indevido.";
    // para quebra de política: confirmação simples, sem relato no corpo
    let ato = env.ev("(function(){ return prtEnviarReclassificacaoAcao(document.getElementById('prtFrNivel')); })()"); let m = await env.responderModal(false); await esperar(ato);
    confere(m.aberto && /Quebra de política de proteção/.test(m.texto) && /não dá para voltar atrás/.test(m.texto) && !/24 horas/.test(m.texto), `a confirmação (quebra) devia dizer que não se desfaz: ${m.texto.slice(0, 100)}`);
    confere(S.posts.length === 0, "cancelar não reclassifica");
    // confirmando a quebra de política: o servidor NÃO pede identidade (só a suspeita pede) e o corpo não leva relato
    S.det[9] = () => ({ id: 9, nivel: "QUEBRA_POLITICA", exigeComunicacao: false, relato: { registrado: false, adendos: 0 } });
    env.limparRegistro();
    ato = env.ev("prtEnviarReclassificacaoAcao(document.getElementById('prtFrNivel'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
    confere(S.posts.length === 1 && JSON.stringify(S.posts[0][1]) === JSON.stringify({ incidenteId: 9, nivelNovo: "QUEBRA_POLITICA", motivo: "Foi a terceira vez e houve contato indevido." }) && env.g("window.__fatorPedidos") === undefined, `quebra de política: sem relato e sem confirmação de identidade (${JSON.stringify(S.posts[0] && S.posts[0][1])})`);
    S.posts.length = 0;
    doc.clicar(botao(env, "Reclassificar", e("prtDetalheConteudo"))); await env.ocioso();
    confere(JSON.stringify([...e("prtFrNivel").options].map(o => o.value)) === JSON.stringify(["", "ALEGACAO"]), "depois de subir para quebra de política, só resta a suspeita");
    e("prtFrMotivo").value = "Foi a terceira vez e houve contato indevido.";
    // para suspeita: pede quem contou e o relato; a confirmação diz o efeito
    doc.escolher(e("prtFrNivel"), "ALEGACAO");
    confere(e("prtFrAlegCx").style.display !== "none" && /NÃO FAÇA/.test(texto(env, "prtFrAlegCx")) && /confirmação recente de quem você é/.test(texto(env, "prtFrAlegCx")), "para suspeita: quem contou, o relato, o roteiro e o aviso da confirmação de identidade");
    confere(e("prtFrRelato").getAttribute("spellcheck") === "false", "o relato da reclassificação não passa pelo corretor ortográfico");
    await reclass(); confere(S.posts.length === 0 && /Informe quem contou/.test(texto(env, "prtFrMsg")), "suspeita sem quem contou não envia");
    doc.escolher(e("prtFrQuem"), "VOLUNTARIO"); e("prtFrRelato").value = "curto"; await reclass(); confere(S.posts.length === 0 && /relato/.test(texto(env, "prtFrMsg")), "suspeita com relato curto não envia");
    const RELATO = "A criança contou, sozinha, o que aconteceu no banheiro.";
    e("prtFrRelato").value = RELATO; env.limparRegistro();
    ato = env.ev("prtEnviarReclassificacaoAcao(document.getElementById('prtFrNivel'))"); m = await env.responderModal(false); await esperar(ato);
    confere(/A lei manda comunicar o Conselho Tutelar imediatamente, e o prazo máximo da Igreja \(24 horas\) começa agora/.test(m.texto) && /sai das escalas com crianças/.test(m.texto) && /liderança de proteção será avisada/.test(m.texto), `a confirmação (suspeita) devia dizer o efeito real: ${m.texto.slice(0, 100)}`);
    env.limparRegistro();
    ato = env.ev("prtEnviarReclassificacaoAcao(document.getElementById('prtFrNivel'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
    confere(S.posts.length === 1 && JSON.stringify(S.posts[0][1]) === JSON.stringify({ incidenteId: 9, nivelNovo: "ALEGACAO", motivo: "Foi a terceira vez e houve contato indevido.", relatadoPor: "VOLUNTARIO", relato: RELATO }), `corpo: ${JSON.stringify(S.posts[0] && S.posts[0][1])}`);
    confere(chamadas(env, "POST protecao-menores/reclassificar").length === 2 && env.g("window.__fatorPedidos") === 1, "reclassificar para suspeita: o 428 é repetido UMA vez");
    confere(/o prazo máximo da Igreja, de 24 horas/.test(texto(env, "prtDetalheMsg")) && e("prtFormAcao").innerHTML === "", "reclassificado: mensagem do servidor na ficha e formulário fechado");
    confere(!/psc-aviso/.test(e("prtDetalheMsg").className), "7B: reclassificado com a liderança avisada fora do app (avisoExterno) e sem falha na retirada: a mensagem NÃO sai como alerta");
    confere(!doc.body.textContent.includes("A criança contou, sozinha"), "o relato digitado sai da tela depois de enviado");
    confereAcessibilidade(env, ["prtFormAcao"], "Reclassificar");
  });

  cenario("Atos: decidir o afastamento e encerrar o caso (428, validação antes, recusa do servidor)", async () => {
    const baseComunicada = { comunicacoes: [{ protocoloExterno: "CT-2026/9", registradoPorNome: "Eu" }], nAnexos: 0, decisoes: [], reclassificacoes: [], leituras: [], relato: { registrado: true, adendos: 0 } };
    const { env, S } = await preparar({ estado: { det: {
      1: () => detalheDeAtaque(Object.assign({}, baseComunicada, { envolvidos: [{ envolvidoId: 7, membroId: 41, nome: `Fulano ${ATAQUE("envDec")}` }] })),
      3: () => detalheDeAtaque(Object.assign({}, baseComunicada, { id: 3, envolvidos: [{ envolvidoId: 9, membroId: 42, nome: "Beltrano", ultimaDecisao: "MANTIDO_AFASTADO", nDecisoes: 1 }] })),
      4: () => detalheDeAtaque({ id: 4, origem: "MEMBRO", comunicacoes: [], nAnexos: 0, decisoes: [], reclassificacoes: [], leituras: [], envolvidos: [] }),
      7: () => ({ id: 7, nivel: "QUEBRA_POLITICA", exigeComunicacao: false, relato: { registrado: false, adendos: 0 } })
    } } });
    const { doc, api, e } = env;
    S.posts = [];
    api.rotas["POST protecao-menores/cautelar-decidir"] = (c) => {
      if (!S.fatorOk) return { status: 428, corpo: { sucesso: false, precisaFator: true, mensagem: "Confirme de novo." } };
      S.posts.push(["decidir", c.corpo]);
      return S.recusa ? { status: 422, corpo: { sucesso: false, mensagem: `Ninguém decide sobre o próprio afastamento. ${ATAQUE("msgDec")}` } } : { corpo: { sucesso: true, decisao: c.corpo.decisao, mensagem: c.corpo.decisao === "LIBERADO" ? "Afastamento levantado." : "Afastamento mantido." } };
    };
    api.rotas["POST protecao-menores/encerrar"] = (c) => {
      if (!S.fatorOk) return { status: 428, corpo: { sucesso: false, precisaFator: true, mensagem: "Confirme de novo." } };
      S.posts.push(["encerrar", c.corpo]);
      return S.recusaEncerrar ? { status: 422, corpo: { sucesso: false, mensagem: `Falta o comprovante da comunicação. ${ATAQUE("msgEnc")}`, motivos: ["Falta o comprovante da comunicação."] } } : { corpo: { sucesso: true, mensagem: "Incidente encerrado. O registro fica guardado." } };
    };
    // ---- decidir o afastamento
    await abrirFicha(env, 1);
    doc.clicar(botao(env, "Decidir o afastamento", e("prtDetalheConteudo"))); await env.ocioso();
    confere(env.foco() && env.foco().id === "prtFdDecisao", "L9: o formulário de decidir abre com o foco na decisão");
    confere(/confirmação recente de quem você é/.test(texto(env, "prtFormAcao")) && /não é punição/.test(texto(env, "prtFormAcao")) && /não pode ler o motivo/.test(texto(env, "prtFormAcao")), "o formulário avisa da confirmação reforçada e que não é punição");
    confere([...e("prtFdDecisao").options].map(o => o.value).join() === ",MANTIDO_AFASTADO,LIBERADO", "as decisões vêm do catálogo");
    limpo(env, "Decidir/formulário", [ATAQUE("envDec")]);
    const decidir = async () => { env.limparRegistro(); doc.clicar(botao(env, "Registrar a decisão", e("prtFormAcao"))); await env.ocioso(); };
    await decidir(); confere(S.posts.length === 0 && env.g("window.__fatorPedidos") === undefined && /Escolha a decisão/.test(texto(env, "prtFdMsg")), "sem decisão: nada é enviado e a confirmação de identidade NÃO é pedida");
    doc.escolher(e("prtFdDecisao"), "LIBERADO"); e("prtFdObs").value = "curto"; await decidir();
    confere(S.posts.length === 0 && env.g("window.__fatorPedidos") === undefined && !env.modal().aberto && /de 10 a 300/.test(texto(env, "prtFdMsg")), "motivo curto: validado ANTES (sem 428 à toa, sem 'tem certeza')");
    e("prtFdObs").value = "<b>motivo</b> da decisão"; await decidir(); confere(S.posts.length === 0 && env.g("window.__fatorPedidos") === undefined, "motivo com < > validado antes");
    e("prtFdObs").value = "Não há mais elementos que justifiquem o afastamento.";
    let ato = env.ev("(function(){ return prtEnviarDecisaoAcao(7, document.getElementById('prtFdDecisao')); })()"); let m = await env.responderModal(false); await esperar(ato); await env.ocioso();
    confere(m.aberto && /Afastamento levantado/.test(m.texto) && /Fulano/.test(m.texto) && /só volta às escalas com crianças se a habilitação dela estiver em dia/.test(m.texto) && /registrada com o seu nome/.test(m.texto), `a confirmação (levantar) devia dizer o efeito: ${m.texto.slice(0, 120)}`);
    confere(S.posts.length === 0 && env.g("window.__fatorPedidos") === undefined, "cancelar não envia nem pede identidade");
    doc.escolher(e("prtFdDecisao"), "MANTIDO_AFASTADO"); env.limparRegistro();
    ato = env.ev("prtEnviarDecisaoAcao(7, document.getElementById('prtFdDecisao'))"); m = await env.responderModal(false); await esperar(ato);
    confere(/continua fora das escalas com crianças/.test(m.texto), "a confirmação (manter) diz que a pessoa continua fora das escalas");
    // 428 → confirmar → repete UMA vez; 422 do servidor mostra o motivo e deixa o formulário
    S.recusa = true; env.limparRegistro();
    ato = env.ev("prtEnviarDecisaoAcao(7, document.getElementById('prtFdDecisao'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
    const pd = chamadas(env, "POST protecao-menores/cautelar-decidir");
    confere(pd.length === 2 && env.g("window.__fatorPedidos") === 1, `o 428 é repetido UMA vez (${pd.length} chamadas, ${env.g("window.__fatorPedidos")} pedido de identidade)`);
    confere(texto(env, "prtFdMsg").includes("[msgDec]") && /psc-aviso/.test(e("prtFdMsg").className) && e("prtFdObs").value.length > 10 && e("prtFormAcao").innerHTML !== "", "422: o motivo do servidor aparece em destaque e o formulário fica");
    S.recusa = false; S.posts.length = 0; env.limparRegistro();
    ato = env.ev("prtEnviarDecisaoAcao(7, document.getElementById('prtFdDecisao'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
    confere(S.posts.length === 1 && JSON.stringify(S.posts[0][1]) === JSON.stringify({ incidenteId: 1, envolvidoId: 7, decisao: "MANTIDO_AFASTADO", observacao: "Não há mais elementos que justifiquem o afastamento." }) && typeof S.posts[0][1].envolvidoId === "number", `corpo da decisão: ${JSON.stringify(S.posts[0] && S.posts[0][1])}`);
    confere(texto(env, "prtDetalheMsg") === "Afastamento mantido." && e("prtFormAcao").innerHTML === "", "decisão registrada: mensagem na ficha e formulário fechado");
    // uma ficha com a decisão já tomada mostra a decisão
    await abrirFicha(env, 3);
    confere(/afastamento cautelar \(mantido pelo Comitê\)/.test(texto(env, "prtDetalheConteudo")), "o envolvido com afastamento mantido mostra isso");
    // ---- encerrar
    S.fatorOk = false; env.ctx.__fatorPedidos = undefined; env.ev("window.__fatorPedidos = undefined");
    await abrirFicha(env, 4);   // sem comunicação: não pode encerrar
    doc.clicar(botao(env, "Encerrar o caso", e("prtDetalheConteudo"))); await env.ocioso();
    confere(env.foco() && env.foco().id === "prtFeResultado", "L9: o formulário de encerrar abre com o foco no resultado");
    confere(/Ainda falta:/.test(texto(env, "prtFormAcao")) && /comunicação ao Conselho Tutelar/.test(texto(env, "prtFormAcao")), "o formulário mostra o que falta para encerrar");
    confere([...e("prtFeResultado").options].map(o => o.value).join() === ",ENCAMINHADO_AUTORIDADE", "suspeita só termina como encaminhada às autoridades");
    limpo(env, "Encerrar/formulário", [ATAQUE("motivoEnc")]);
    doc.escolher(e("prtFeResultado"), "ENCAMINHADO_AUTORIDADE"); e("prtFeProvidencia").value = "Encaminhado ao Conselho Tutelar com o protocolo informado.";
    env.limparRegistro();
    doc.clicar(botao(env, "Encerrar o caso", e("prtFormAcao"))); await env.ocioso();
    confere(S.posts.filter(p => p[0] === "encerrar").length === 0 && env.g("window.__fatorPedidos") === undefined && !env.modal().aberto, "caso que não pode encerrar: nada é enviado, nem confirmação de identidade nem 'tem certeza'");
    confere(/Ainda não dá para encerrar/.test(texto(env, "prtFeMsg")) && /comunicação ao Conselho Tutelar/.test(texto(env, "prtFeMsg")), `o motivo aparece no formulário: ${texto(env, "prtFeMsg").slice(0, 80)}`);
    confere(chamadas(env, "GET protecao-menores/incidente").length === 1, "antes de desistir, a ficha foi conferida de novo (podia ter mudado)");
    confere(e("prtFeProvidencia").value.length > 10, "o que foi escrito fica");
    // caso que pode encerrar (id 3: comunicado com protocolo e decisão do afastamento tomada)
    await abrirFicha(env, 3);
    confere(/Não falta nada/.test(texto(env, "prtDetalheConteudo")), "a ficha diz que o caso já pode ser encerrado");
    doc.clicar(botao(env, "Encerrar o caso", e("prtDetalheConteudo"))); await env.ocioso();
    const encerrar = async () => { env.limparRegistro(); doc.clicar(botao(env, "Encerrar o caso", e("prtFormAcao"))); await env.ocioso(); };
    await encerrar(); confere(S.posts.filter(p => p[0] === "encerrar").length === 0 && /como o caso termina/i.test(texto(env, "prtFeMsg")), "sem resultado não envia");
    doc.escolher(e("prtFeResultado"), "ENCAMINHADO_AUTORIDADE"); e("prtFeProvidencia").value = "curto"; await encerrar();
    confere(S.posts.filter(p => p[0] === "encerrar").length === 0 && env.g("window.__fatorPedidos") === undefined && /de 10 a 500/.test(texto(env, "prtFeMsg")), "providência curta: validada ANTES do 428");
    e("prtFeProvidencia").value = "Encaminhado às autoridades; protocolo guardado na pasta."; env.limparRegistro();
    ato = env.ev("(function(){ return prtEnviarEncerramentoAcao(document.getElementById('prtFeResultado')); })()"); m = await env.responderModal(false); await esperar(ato);
    confere(m.aberto && /Encerrar o caso/.test(m.texto) && /não recebe mais comunicação, adendo nem reclassificação/.test(m.texto) && S.posts.filter(p => p[0] === "encerrar").length === 0, `a confirmação de encerrar: ${m.texto.slice(0, 100)}`);
    // o servidor recusa mesmo assim (o caso mudou desde que a ficha abriu): o motivo dele aparece
    S.recusaEncerrar = true; env.limparRegistro();
    ato = env.ev("prtEnviarEncerramentoAcao(document.getElementById('prtFeResultado'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
    confere(texto(env, "prtFeMsg").includes("[msgEnc]") && /psc-aviso/.test(e("prtFeMsg").className) && e("prtFormAcao").innerHTML !== "" && e("prtFeProvidencia").value.length > 10, "422: o motivo da recusa do servidor aparece e o formulário fica com o texto");
    confere(chamadas(env, "POST protecao-menores/encerrar").length === 2 && env.g("window.__fatorPedidos") === 1, "o 428 foi repetido uma vez");
    S.recusaEncerrar = false; S.posts.length = 0; env.limparRegistro();
    S.det[3] = () => detalheDeAtaque(Object.assign({}, baseComunicada, { id: 3, status: "ENCERRADO", encerradoEm: em(0), providencia: ATAQUE("providencia"), envolvidos: [{ envolvidoId: 9, membroId: 42, nome: "Beltrano", ultimaDecisao: "MANTIDO_AFASTADO", nDecisoes: 1 }] }));
    ato = env.ev("prtEnviarEncerramentoAcao(document.getElementById('prtFeResultado'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
    confere(S.posts.length === 1 && JSON.stringify(S.posts[0][1]) === JSON.stringify({ incidenteId: 3, resultado: "ENCAMINHADO_AUTORIDADE", providencia: "Encaminhado às autoridades; protocolo guardado na pasta." }), `corpo do encerramento: ${JSON.stringify(S.posts[0] && S.posts[0][1])}`);
    confere(/Incidente encerrado/.test(texto(env, "prtDetalheMsg")) && /Como o caso terminou/.test(texto(env, "prtDetalheConteudo")) && texto(env, "prtDetalheConteudo").includes("[providencia]"), "encerrado: a ficha mostra como o caso terminou");
    const botoes = [...e("prtDetalheConteudo").descendentes()].filter(x => x.localName === "button").map(x => x.textContent);
    confere(!botoes.some(t => /comunicação ao órgão|Adendo|Encerrar o caso|Reclassificar/.test(t)), `caso encerrado: sem atos (${botoes.join(" | ")})`);
    limpo(env, "Encerrar", [ATAQUE("providencia")]);
    // quebra de política: resultados certos
    await abrirFicha(env, 7);
    doc.clicar(botao(env, "Encerrar o caso", e("prtDetalheConteudo"))); await env.ocioso();
    confere([...e("prtFeResultado").options].map(o => o.value).join() === ",MEDIDA_INTERNA,SEM_CONTINUIDADE", "quase-acidente e quebra de política: medida interna ou sem continuidade");
    confereAcessibilidade(env, ["prtFormAcao"], "Encerrar");
  });


  cenario("Atos: vincular o envolvido registrado só pelo nome e arquivar pedido sem conteúdo de proteção", async () => {
    const base = { comunicacoes: [], nAnexos: 0, decisoes: [], reclassificacoes: [], leituras: [], relato: { registrado: true, adendos: 0 } };
    const { env, S } = await preparar({ estado: { det: {
      20: () => detalheDeAtaque(Object.assign({}, base, { id: 20, origem: "CANAL_AJUDA", envolvidos: [] })),
      21: () => detalheDeAtaque(Object.assign({}, base, { id: 21, origem: "MEMBRO", envolvidos: [], registradoPor: { nome: ATAQUE("registrador") } })),
      22: () => detalheDeAtaque(Object.assign({}, base, { id: 22, origem: "CANAL_AJUDA", envolvidos: [{ envolvidoId: 31, nome: ATAQUE("soNome"), membroId: null }],
        possiveisMembros: [{ envolvidoId: 31, membros: [{ membroId: 41, nome: ATAQUE("candidato"), congregacaoNome: ATAQUE("candCong") }] }] }))
    } } });
    const { doc, api, e } = env;
    S.posts = [];
    api.rotas["POST protecao-menores/encerrar"] = (c) => {
      if (!S.fatorOk) return { status: 428, corpo: { sucesso: false, precisaFator: true, mensagem: "Confirme de novo." } };
      S.posts.push(["encerrar", c.corpo]);
      return S.recusaEncerrar ? { status: 422, corpo: { sucesso: false, mensagem: `Há uma pessoa do cadastro vinculada como envolvida. ${ATAQUE("msgSemConteudo")}` } } : { corpo: { sucesso: true, mensagem: "Incidente encerrado. O registro fica guardado." } };
    };
    api.rotas["POST protecao-menores/vincular-envolvido"] = (c) => {
      if (!S.fatorOk) return { status: 428, corpo: { sucesso: false, precisaFator: true, mensagem: "Confirme de novo." } };
      S.posts.push(["vincular", c.corpo]);
      // o servidor mantém a linha do nome e ACRESCENTA a da pessoa vinculada (e `possiveisMembros` ainda lista a linha do nome)
      if (!S.recusaVinculo) S.det[22] = () => detalheDeAtaque(Object.assign({}, base, { id: 22, origem: "CANAL_AJUDA", envolvidos: [{ envolvidoId: 31, nome: ATAQUE("soNome"), membroId: null }, { envolvidoId: 32, nome: "Pessoa vinculada", membroId: 41, ultimaDecisao: null, nDecisoes: 0 }],
        possiveisMembros: [{ envolvidoId: 31, membros: [{ membroId: 41, nome: ATAQUE("candidato"), congregacaoNome: ATAQUE("candCong") }] }] }));
      return S.recusaVinculo ? { status: 422, corpo: { sucesso: false, mensagem: `A matrícula informada não foi encontrada no cadastro. ${ATAQUE("msgVinculo")}` } } : { corpo: { sucesso: true, escalasDesmarcadas: 1, mensagem: "Pessoa vinculada. Ela saiu das escalas com menores por cautela, e o Comitê precisa decidir sobre o afastamento." } };
    };
    const abrirDireto = async (id) => { await env.ev(`prtAbrirDetalheAcao(${id})`); await env.ocioso(); };
    // ---- uma suspeita registrada por um membro: sem a opção de arquivar; quem registrou aparece para o nível geral
    await abrirDireto(21);
    confere(texto(env, "prtDetalheConteudo").includes("[registrador]") && /Registrado por/.test(texto(env, "prtDetalheConteudo")), "o nível geral vê quem registrou");
    doc.clicar(botao(env, "Encerrar o caso", e("prtDetalheConteudo"))); await env.ocioso();
    confere([...e("prtFeResultado").options].map(o => o.value).join() === ",ENCAMINHADO_AUTORIDADE", "suspeita de um membro: só 'encaminhado às autoridades' (sem arquivar como sem conteúdo)");
    limpo(env, "Vincular/registrador", [ATAQUE("registrador")]);
    // ---- pedido do canal de ajuda, sem pessoa do cadastro: pode ser arquivado como "sem conteúdo de proteção"
    await abrirDireto(20);
    doc.clicar(botao(env, "Encerrar o caso", e("prtDetalheConteudo"))); await env.ocioso();
    confere([...e("prtFeResultado").options].map(o => o.value).join() === ",ENCAMINHADO_AUTORIDADE,SEM_CONTEUDO_DE_PROTECAO", `L10: pedido do canal de ajuda: "Encaminhado às autoridades" abre a lista e "sem conteúdo de proteção" vem por último (${[...e("prtFeResultado").options].map(o => o.value)})`);
    confere(e("prtFeResultado").value === "", "L10: nenhum resultado vem pré-escolhido (o que encerra sem avisar o Conselho Tutelar nunca é o padrão)");
    confere(e("prtFeAvisoSemConteudo").style.display === "none", "o aviso do arquivamento só aparece quando o resultado é escolhido");
    doc.escolher(e("prtFeResultado"), "SEM_CONTEUDO_DE_PROTECAO");
    confere(e("prtFeAvisoSemConteudo").style.display !== "none" && /SEM comunicar ao Conselho Tutelar/.test(texto(env, "prtFeAvisoSemConteudo")) && /NÃO arquive/.test(texto(env, "prtFeAvisoSemConteudo")), "o aviso do arquivamento explica o risco");
    doc.escolher(e("prtFeResultado"), "ENCAMINHADO_AUTORIDADE");
    confere(e("prtFeAvisoSemConteudo").style.display === "none", "trocar o resultado esconde o aviso");
    doc.escolher(e("prtFeResultado"), "SEM_CONTEUDO_DE_PROTECAO"); e("prtFeProvidencia").value = "curto"; env.limparRegistro();
    doc.clicar(botao(env, "Encerrar o caso", e("prtFormAcao"))); await env.ocioso();
    confere(S.posts.length === 0 && env.g("window.__fatorPedidos") === undefined && /de 10 a 500/.test(texto(env, "prtFeMsg")), "providência curta: validada antes");
    e("prtFeProvidencia").value = "Mensagem de teste enviada por engano, sem nenhum relato."; env.limparRegistro();
    let ato = env.ev("(function(){ return prtEnviarEncerramentoAcao(document.getElementById('prtFeResultado')); })()"); let m = await env.responderModal(false); await esperar(ato); await env.ocioso();
    confere(m.aberto && /Arquivar o pedido/.test(m.texto) && /SEM comunicar ao Conselho Tutelar/.test(m.texto) && /Todos os outros da Diretoria e do Comitê serão avisados/.test(m.texto) && /teste, engano ou texto sem relato de violência/.test(m.texto), `a confirmação do arquivamento: ${m.texto.slice(0, 120)}`);
    confere(S.posts.length === 0 && chamadas(env, "GET protecao-menores/incidente").length === 0, "arquivar como 'sem conteúdo' não confere o que falta para o encerramento comum (o servidor decide)");
    // o servidor recusa (por exemplo, apareceu uma pessoa do cadastro): o motivo dele aparece
    S.recusaEncerrar = true; env.limparRegistro();
    ato = env.ev("prtEnviarEncerramentoAcao(document.getElementById('prtFeResultado'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
    confere(texto(env, "prtFeMsg").includes("[msgSemConteudo]") && /psc-aviso/.test(e("prtFeMsg").className) && e("prtFormAcao").innerHTML !== "", "422: o motivo do servidor aparece e o formulário fica");
    S.recusaEncerrar = false; S.posts.length = 0; env.limparRegistro();
    ato = env.ev("prtEnviarEncerramentoAcao(document.getElementById('prtFeResultado'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
    confere(S.posts.length === 1 && JSON.stringify(S.posts[0][1]) === JSON.stringify({ incidenteId: 20, resultado: "SEM_CONTEUDO_DE_PROTECAO", providencia: "Mensagem de teste enviada por engano, sem nenhum relato." }), `corpo do arquivamento: ${JSON.stringify(S.posts[0] && S.posts[0][1])}`);
    confere(env.g("window.__fatorPedidos") === 1 && /Incidente encerrado/.test(texto(env, "prtDetalheMsg")), "o 428 foi repetido uma vez e o encerramento aparece");
    // ---- vincular: a pessoa registrada só pelo nome
    S.posts.length = 0; S.fatorOk = false; env.ev("window.__fatorPedidos = undefined");
    await abrirDireto(22);
    const botoesVincular = () => [...e("prtDetalheConteudo").descendentes()].filter(x => x.localName === "button" && /Vincular a uma pessoa do cadastro/.test(x.textContent));
    confere(botoesVincular().length === 1, "o envolvido registrado só pelo nome tem o botão de vincular");
    doc.clicar(botoesVincular()[0]); await env.ocioso();
    confere(env.foco() && env.foco().id === "prtFvMatricula", "L9: o formulário de vincular abre com o foco na matrícula");
    const form = e("prtFormAcao");
    confere(/confirmação recente de quem você é/.test(form.textContent) && /sai das escalas com crianças na hora/.test(form.textContent) && form.textContent.includes("[soNome]"), "o formulário explica o efeito e cita o nome");
    confere(form.textContent.includes("[candidato]") && form.textContent.includes("[candCong]") && /mesmo nome/.test(form.textContent), "as pessoas do cadastro com o mesmo nome aparecem para conferir");
    limpo(env, "Vincular/formulário", [ATAQUE("soNome"), ATAQUE("candidato"), ATAQUE("candCong")]);
    env.limparRegistro();
    doc.clicar(botao(env, "Vincular", form)); await env.ocioso();
    confere(S.posts.length === 0 && !env.modal().aberto && /Informe a matrícula/.test(texto(env, "prtFvMsg")), "sem matrícula: não envia");
    doc.clicar(botao(env, "usar esta matrícula", form));
    confere(e("prtFvMatricula").value === "41", "'usar esta matrícula' preenche o campo");
    e("prtFvMatricula").value = "4x1"; doc.clicar([...form.descendentes()].find(x => x.localName === "button" && /^🔗 Vincular$/.test(x.textContent.trim()))); await env.ocioso();
    confere(S.posts.length === 0 && /Informe a matrícula/.test(texto(env, "prtFvMsg")), "matrícula que não é número: não envia");
    doc.clicar(botao(env, "usar esta matrícula", form));
    ato = env.ev("(function(){ return prtEnviarVinculoAcao(31, document.getElementById('prtFvMatricula')); })()"); m = await env.responderModal(false); await esperar(ato); await env.ocioso();
    confere(m.aberto && /matrícula 41/.test(m.texto) && /sai das escalas com crianças agora/.test(m.texto) && /Comitê precisa decidir/.test(m.texto) && /não se desfaz/.test(m.texto), `a confirmação do vínculo: ${m.texto.slice(0, 120)}`);
    confere(S.posts.length === 0 && env.g("window.__fatorPedidos") === undefined, "cancelar não envia nem pede identidade");
    S.recusaVinculo = true; env.limparRegistro();
    ato = env.ev("prtEnviarVinculoAcao(31, document.getElementById('prtFvMatricula'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
    confere(texto(env, "prtFvMsg").includes("[msgVinculo]") && /psc-aviso/.test(e("prtFvMsg").className) && e("prtFvMatricula").value === "41", "422: a mensagem do servidor aparece e o formulário fica com a matrícula");
    S.recusaVinculo = false; S.posts.length = 0; env.limparRegistro();
    ato = env.ev("prtEnviarVinculoAcao(31, document.getElementById('prtFvMatricula'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
    confere(S.posts.length === 1 && JSON.stringify(S.posts[0][1]) === JSON.stringify({ incidenteId: 22, membroId: 41 }) && typeof S.posts[0][1].membroId === "number" && typeof S.posts[0][1].incidenteId === "number", `corpo do vínculo: ${JSON.stringify(S.posts[0] && S.posts[0][1])}`);
    confere(/Pessoa vinculada/.test(texto(env, "prtDetalheMsg")) && e("prtFormAcao").innerHTML === "", "vinculado: mensagem do servidor na ficha e formulário fechado");
    confere(texto(env, "prtDetalheConteudo").includes("[soNome]") && /matrícula 41/.test(texto(env, "prtDetalheConteudo")) && botoesVincular().length === 0, "L1: depois do vínculo a linha do nome continua na ficha (o servidor a mantém), mas o botão de vincular NÃO é oferecido de novo (um segundo vínculo tiraria outra pessoa das escalas)");
    confere(env.g("window.__fatorPedidos") === 1, "a confirmação reforçada foi pedida uma vez");
    // se a pessoa vinculada é quem está olhando, a ficha passa a responder 404: só a mensagem neutra
    S.det[22] = undefined; delete S.det[22];
    doc.clicar(botao(env, "Atualizar", e("prtDetalheConteudo"))); await env.ocioso();
    confere(/Não foi possível abrir este incidente/.test(texto(env, "prtDetalheConteudo")), "depois de um 404 a ficha mostra só a mensagem neutra");
    // o Dirigente (não geral) não vincula nem arquiva
    const dirigente = ambienteAtual = ambienteLideranca({ geral: false });
    const SD = { fila: filaPadrao(), det: { 22: () => detalheDeAtaque(Object.assign({}, base, { id: 22, origem: "MEMBRO", envolvidos: [{ envolvidoId: 31, nome: "Só nome", membroId: null }] })) }, geral: false };
    rotasDaLideranca(dirigente, SD);
    await abrirAba(dirigente);
    await dirigente.ev("prtAbrirDetalheAcao(22)"); await dirigente.ocioso();
    const tD = [...dirigente.e("prtDetalheConteudo").descendentes()].filter(x => x.localName === "button").map(x => x.textContent);
    confere(!tD.some(x => /Vincular|Encerrar o caso|Decidir/.test(x)) && tD.some(x => /Registrar a comunicação/.test(x)), `o Dirigente não vincula nem encerra: ${tD.join(" | ")}`);
    confere(!/Registrado por/.test(dirigente.e("prtDetalheConteudo").textContent), "o Dirigente não vê quem registrou");
  });

  cenario("Ficha (L6): se o catálogo não carregou, o botão do ato tenta de novo e, se não der, avisa — não fica mudo", async () => {
    const { env } = await preparar({ estado: { det: { 1: () => detalheDeAtaque({ comunicacoes: [], nAnexos: 0, decisoes: [], reclassificacoes: [], leituras: [], envolvidos: [] }) } } });
    const { doc, api, e } = env;
    await abrirFicha(env, 1);
    const catalogoOk = api.rotas["GET protecao-menores/catalogos"];
    // o catálogo some (a primeira carga falhou, ou foi refeita no meio) e o servidor não responde
    env.ev("prtCatalogos = null");
    api.rotas["GET protecao-menores/catalogos"] = { status: 500, corpo: { sucesso: false, mensagem: "Erro interno." } };
    env.limparRegistro();
    doc.clicar(botao(env, "Adendo", e("prtDetalheConteudo"))); await env.ocioso();
    confere(chamadas(env, "GET protecao-menores/catalogos").length === 1, "L6: sem o catálogo o botão devia tentar carregá-lo de novo");
    confere(e("prtFormAcao").innerHTML === "" && /Não foi possível carregar as opções deste ato/.test(texto(env, "prtDetalheMsg")) && /psc-aviso/.test(e("prtDetalheMsg").className), `L6: se não carregou, uma mensagem visível diz (o botão não fica mudo): "${texto(env, "prtDetalheMsg")}"`);
    // o servidor voltou: o mesmo botão agora abre o formulário e o aviso some
    api.rotas["GET protecao-menores/catalogos"] = catalogoOk;
    env.limparRegistro();
    doc.clicar(botao(env, "Adendo", e("prtDetalheConteudo"))); await env.ocioso();
    confere(chamadas(env, "GET protecao-menores/catalogos").length === 1 && e("prtFaTexto") !== null && e("prtFormAcao").innerHTML !== "", "L6: com o servidor de volta, o botão carrega o catálogo e abre o formulário");
    confere(texto(env, "prtDetalheMsg") === "" && env.foco() && env.foco().id === "prtFaTexto", "L6: o aviso de falha some e o foco vai para o primeiro campo");
    // com o catálogo carregado, o botão não pede nada ao servidor
    doc.clicar(botao(env, "cancelar", e("prtFormAcao"))); env.limparRegistro();
    doc.clicar(botao(env, "Adendo", e("prtDetalheConteudo"))); await env.ocioso();
    confere(chamadas(env, "GET protecao-menores/catalogos").length === 0, "L6: com o catálogo na mão não há pedido novo");
  });

  cenario("Comunicação (L2): o 'agora' do formulário e a conferência de 'no futuro' usam o relógio do SERVIDOR, não o do aparelho", async () => {
    const local = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
    for (const [rotulo, aparelho, ciencia] of [["aparelho 2 h adiantado", "2026-10-09T17:00:00.000Z", em(-4)], ["aparelho 2 h atrasado", "2026-10-09T13:00:00.000Z", em(-1)]]) {
      const { env, S } = await preparar({ opcoesAmbiente: { aparelho }, estado: { det: { 1: () => detalheDeAtaque({ comunicacoes: [], nAnexos: 0, decisoes: [], reclassificacoes: [], leituras: [], envolvidos: [], conhecidoEm: ciencia }) } } });
      const { doc, api, e } = env;
      S.comunicados = [];
      api.rotas["POST protecao-menores/comunicacao"] = (c) => { S.comunicados.push(c.corpo); return { status: 201, corpo: { sucesso: true, foraDoPrazo: false, mensagem: "Comunicação registrada." } }; };
      await abrirFicha(env, 1);
      const abrirForm = async () => { doc.clicar(botao(env, "Registrar a comunicação ao órgão", e("prtDetalheConteudo"))); await env.ocioso(); doc.escolher(e("prtFcOrgao"), "CONSELHO_TUTELAR"); doc.escolher(e("prtFcForma"), "TELEFONE"); };
      const enviar = async () => { env.limparRegistro(); const ato = env.ev("prtEnviarComunicacaoAcao(document.getElementById('prtFcOrgao'))"); await env.responderModal(true); await esperar(ato); await env.ocioso(); };
      await abrirForm();
      confere(new Date(e("prtFcQuando").value).getTime() === srvMs, `L2 (${rotulo}): o padrão do formulário devia ser o "agora" do SERVIDOR, não o do aparelho (${e("prtFcQuando").value})`);
      // o padrão, sem mexer, é aceito (com o aparelho adiantado ele virava "no futuro"; atrasado, "anterior à ciência")
      await enviar();
      confere(S.comunicados.length === 1 && Date.parse(S.comunicados[0].comunicadoEm) === srvMs && !/no futuro|anterior ao momento/.test(texto(env, "prtFcMsg")), `L2 (${rotulo}): o padrão, sem mexer, devia ser aceito (saíram ${S.comunicados.length}; ${texto(env, "prtFcMsg")})`);
      // uma hora uma hora à frente do SERVIDOR é recusada, mesmo que o aparelho (adiantado) ache que já passou
      await abrirForm(); S.comunicados.length = 0;
      e("prtFcQuando").value = local(srvMs + 60 * MIN); await enviar();
      confere(S.comunicados.length === 0 && /não pode estar no futuro/.test(texto(env, "prtFcMsg")) && !env.modal().aberto, `L2 (${rotulo}): uma hora à frente do servidor é futuro, qualquer que seja o relógio do aparelho`);
      // dentro da tolerância de 5 minutos do servidor é aceita
      e("prtFcQuando").value = local(srvMs + 4 * MIN); await enviar();
      confere(S.comunicados.length === 1 && Date.parse(S.comunicados[0].comunicadoEm) === srvMs + 4 * MIN, `L2 (${rotulo}): 4 minutos à frente do servidor está na tolerância`);
    }
  });

  cenario("Anexos (L3): o modal de comprovantes do incidente não sobrevive à saída da sessão nem à troca de login", async () => {
    const montar = async () => {
      const { env } = await preparar({ estado: { det: { 1: () => detalheDeAtaque({ comunicacoes: [], nAnexos: 1, decisoes: [], reclassificacoes: [], leituras: [], envolvidos: [] }) } } });
      env.api.rotas["GET anexos"] = { corpo: [{ anexoId: 5, nomeArquivo: ATAQUE("anexoNome"), mimeType: "application/pdf", criadoEm: em(-1), urlAssinada: "https://exemplo.org/arquivo.pdf" }] };
      await abrirFicha(env, 1);
      env.doc.clicar(botao(env, "Anexar comprovante", env.e("prtDetalheConteudo"))); await env.ocioso();
      confere(env.modal().aberto && env.modal().texto.includes("[anexoNome]"), "(o modal de anexos do incidente está aberto, com o nome do arquivo)");
      return env;
    };
    // sair da sessão
    let env = await montar();
    env.ev("limparSessao()");
    confere(!env.modal().aberto && env.e("modalCaixa").textContent === "" && !env.doc.body.textContent.includes("[anexoNome]"), "L3: sair da sessão fecha e esvazia o modal de anexos (o nome do arquivo pode ter o nome da criança)");
    // troca de login sem passar pela saída
    env = await montar();
    env.sessao({ matricula: 9, nivel: "GLOBAL", permissoes: ["protecao_menores"], geral: true });
    await env.ev("mostrarAbaSecretaria('protecao')"); await env.ocioso();
    confere(!env.modal().aberto && !env.doc.body.textContent.includes("[anexoNome]"), "L3: outra pessoa no mesmo navegador não herda o modal de anexos aberto");
    // o modal de anexos de OUTRA tela não é fechado por este módulo
    env = await montar();
    await env.ev("abrirModalAnexos('Congregacoes', 5, 'outra tela')"); await env.ocioso();
    env.ev("prtLimparTela()");
    confere(env.modal().aberto && /outra tela/.test(env.modal().texto), "L3: o modal de anexos de OUTRA tela não é fechado por este módulo");
  });

  cenario("Módulo ausente ou velho no cache (L11): sair da sessão e navegar entre abas não podem quebrar", async () => {
    const env = ambienteAtual = novo({ semModulo: true }); const { e } = env;
    const tenta = (codigo) => { try { env.ev(codigo); return null; } catch (erro) { return String(erro && erro.message || erro); } };
    confere(env.g("typeof prtLimparTela") === "undefined" && env.g("typeof prtAbaFechada") === "undefined" && env.g("typeof carregarOpcoesProtecaoAcao") === "undefined", "(o módulo da proteção não foi carregado neste cenário)");
    env.sessao({ matricula: 5, nivel: "GLOBAL", permissoes: ["protecao_menores"], geral: true });
    let erro = tenta("mostrarAbaSecretaria('documentos')");
    confere(erro === null && e("abaDocumentos").style.display === "block", `L11: trocar de aba sem o módulo da proteção não pode quebrar (${erro})`);
    erro = tenta("mostrarAbaSecretaria('protecao')");
    confere(erro === null, `L11: abrir a aba da proteção sem o módulo não pode quebrar a navegação (${erro})`);
    erro = tenta("mostrarAbaSecretaria('meupainel')");
    confere(erro === null, `L11: sair da aba da proteção sem o módulo não pode quebrar (${erro})`);
    erro = tenta("mostrarSubAbaMeupainel('protecao')");
    confere(erro === null, `L11: a sub-aba Proteção de Meu Painel sem o módulo não pode quebrar (${erro})`);
    erro = tenta("limparSessao()");
    confere(erro === null, `L11: sair da sessão sem o módulo da proteção tem de terminar (${erro})`);
    confere(env.g("authToken") === null && env.g("authMatricula") === null && env.g("authPermissoes").length === 0 && env.g("authNivel") === null && env.g("authGeral") === false, "L11: a saída da sessão limpou o token e a identidade mesmo sem o módulo");
  });

  cenario("Relógio (b): ao voltar para o navegador o relógio é refeito na hora; fora da aba nada acontece", async () => {
    const env = ambienteAtual = ambienteLideranca(); const { doc, e } = env;
    rotasDaLideranca(env, { fila: filaPadrao(), det: {} });
    await abrirAba(env);
    const antes = e("prtRelogio1").textContent;
    confere(antes === "🚨 faltam 3 h 20 min", `(o relógio de partida: ${antes})`);
    env.avancar(20 * MIN);     // o sistema segurou o intervalo de 30 s enquanto a página esteve escondida: nenhum tique veio
    confere(e("prtRelogio1").textContent === antes, "(sem tique o relógio não muda sozinho)");
    doc.visibilityState = "hidden"; doc.disparar(doc.body, "visibilitychange");
    confere(e("prtRelogio1").textContent === antes, "ao esconder a página nada é refeito");
    doc.visibilityState = "visible"; doc.disparar(doc.body, "visibilitychange");
    confere(e("prtRelogio1").textContent === "🚨 faltam 3 h 00 min" && e("prtRelogio4").textContent === "⛔ vencido há 2 h 20 min", `(b) ao voltar para o navegador o relógio é refeito na hora (${e("prtRelogio1").textContent})`);
    confere(env.intervalos.size === 1, "o intervalo segue um só");
    // fora da aba: o evento não mexe em nada e desliga o intervalo
    await env.ev("sairDoModulo()"); await env.ocioso();
    doc.visibilityState = "visible"; doc.disparar(doc.body, "visibilitychange");
    confere(env.intervalos.size === 0 && e("prtListaIncidentes").innerHTML === "", "fora da aba, voltar para o navegador não religa nem refaz nada");
  });

  // ============================================================================================================================================
  // 6) NÍVEL GERAL: padrões, Comitê, relatório anual
  // ============================================================================================================================================
cenario("Padrões, Comitê e relatório: saem da página ao sair da aba e a resposta atrasada não volta", async () => {
    const env = ambienteAtual = ambienteLideranca(); const { doc, api, e } = env;
    const S = { fila: filaPadrao(), det: {} };
    rotasDaLideranca(env, S);
    api.rotas["GET protecao-menores/padroes"] = () => ({ corpo: F.padroes([1, 2, 3].map(i => ({ incidenteId: 10 + i, nivel: "QUEBRA_POLITICA", equipeId: 3, envolvidoMembroId: 41, data: F.hoje })), { "EQUIPE:3": ATAQUE("equipePad"), "PESSOA:41": ATAQUE("pessoaPad") }) });
    api.rotas["GET protecao-menores/comite"] = () => ({ corpo: F.comite([{ membroId: 1, nome: ATAQUE("comPastor"), cargoMinisterial: "PASTOR" }]) });
    api.rotas["GET protecao-menores/relatorio-anual"] = () => { const r = F.relatorio(2026); r.relatorio.porCongregacao[0].congregacaoNome = ATAQUE("congRel"); return { corpo: r }; };
    const SECOES = [["btnPrtSecaoPadroes", "[equipePad]", "padroes"], ["btnPrtSecaoComite", "[comPastor]", "comite"], ["btnPrtSecaoRelatorio", "[congRel]", "relatorio-anual"]];
    // carregadas e depois a aba é fechada: nenhum nome fica na página
    await abrirAba(env);
    for (const [pilula] of SECOES) { doc.clicar(e(pilula)); await env.ocioso(); }
    confere(SECOES.every(([, marca]) => doc.body.textContent.includes(marca)), "as três seções carregaram");
    await env.ev("sairDoModulo()"); await env.ocioso();
    confere(SECOES.every(([, marca]) => !doc.body.textContent.includes(marca)), "sair da aba apaga da página os padrões, o Comitê e o relatório");
    // com o pedido ainda a caminho quando a aba fecha: a resposta que chega depois não entra
    for (const [pilula, marca, rota] of SECOES) {
      await abrirAba(env);
      const presa = env.retem(x => x.chave === `GET protecao-menores/${rota}`);
      doc.clicar(e(pilula));
      for (let i = 0; i < 30 && !presa.chegou; i++) await new Promise(r => setImmediate(r));
      confere(presa.chegou, `(${rota} atrasado) o pedido devia estar a caminho`);
      await env.ev("sairDoModulo()"); await env.ocioso();
      presa.liberar(); await env.ocioso();
      confere(!doc.body.textContent.includes(marca), `${rota}: a resposta que chega depois de sair da aba NÃO pode entrar na página`);
      env.api.retencoes.length = 0;
    }
  });


  cenario("Padrões, Comitê e relatório anual (nível geral) × Dirigente", async () => {
    const dirigente = ambienteAtual = ambienteLideranca({ geral: false });
    const SD = { fila: filaPadrao(), det: {}, geral: false };
    rotasDaLideranca(dirigente, SD);
    await abrirAba(dirigente);
    confere(dirigente.e("btnPrtSecaoIncidentes").style.display !== "none" && ["Padroes", "Comite", "Relatorio"].every(n => dirigente.e(`btnPrtSecao${n}`).style.display === "none"), "o Dirigente só vê a pílula dos incidentes");
    dirigente.limparRegistro();
    await dirigente.ev("prtMostrarSecaoAcao('padroes')"); await dirigente.ocioso();
    confere(dirigente.e("prtSecaoIncidentes").style.display === "block" && dirigente.e("prtSecaoPadroes").style.display === "none" && chamadas(dirigente, "GET protecao-menores/padroes").length === 0, "o Dirigente não consegue abrir Padrões nem pedir ao servidor");
    for (const acao of ["prtCarregarPadroesAcao", "prtCarregarComiteAcao", "prtCarregarRelatorioAcao"]) { dirigente.limparRegistro(); await dirigente.ev(`${acao}()`); await dirigente.ocioso(); confere(dirigente.api.chamadas.length === 0, `${acao} sem nível geral não pede nada ao servidor`); }
    // sem acesso nenhum (papéis falsos): mensagem em vez de tela vazia
    const sem = ambienteAtual = ambienteLideranca();
    sem.api.rotas = { "GET protecao-menores/catalogos": { corpo: F.catalogos({ gestao: false, geral: false }) } };
    await abrirAba(sem);
    confere(sem.e("prtSemAcesso").style.display !== "none" && sem.e("btnPrtSecaoIncidentes").style.display === "none", "sem papéis: devia avisar e esconder as pílulas");

    // nível geral
    const env = ambienteAtual = ambienteLideranca(); const { doc, api, e } = env;
    const S = { fila: filaPadrao(), det: {} };
    rotasDaLideranca(env, S);
    const membros = [{ membroId: 1, nome: ATAQUE("comPastor"), cargoMinisterial: "PASTOR" }, { membroId: 2, nome: ATAQUE("comLeigo"), cargoMinisterial: null }];
    api.rotas["GET protecao-menores/padroes"] = () => {
      const eventos = [1, 2, 3].map(i => ({ incidenteId: 10 + i, nivel: "QUEBRA_POLITICA", equipeId: 3, envolvidoMembroId: 41, data: F.hoje }));
      const r = F.padroes(eventos, { "EQUIPE:3": ATAQUE("equipePad"), "PESSOA:41": ATAQUE("pessoaPad") });
      return { corpo: r };
    };
    api.rotas["GET protecao-menores/comite"] = () => { const r = F.comite(membros); r.comite.avaliacao.problemas.push(ATAQUE("problemaComite")); return { corpo: r }; };
    api.rotas["GET protecao-menores/relatorio-anual"] = (c) => {
      const r = F.relatorio(Number(c.consulta.ano) || 2026);
      r.relatorio.porCongregacao[0].congregacaoNome = ATAQUE("congRel"); r.relatorio.habilitacaoPorCongregacao[0].congregacaoNome = ATAQUE("congHab");
      return { corpo: r };
    };
    S.det[11] = { id: 11, nivel: "QUEBRA_POLITICA", exigeComunicacao: false, relato: { registrado: false, adendos: 0 } };
    await abrirAba(env);
    confere(["Padroes", "Comite", "Relatorio"].every(n => e(`btnPrtSecao${n}`).style.display !== "none"), "o nível geral vê as quatro pílulas");
    // padrões
    env.limparRegistro();
    doc.clicar(e("btnPrtSecaoPadroes")); await env.ocioso();
    confere(e("prtSecaoPadroes").style.display === "block" && e("prtSecaoIncidentes").style.display === "none" && e("btnPrtSecaoPadroes").getAttribute("aria-pressed") === "true", "a pílula troca de seção");
    const pad = texto(env, "prtPadroesLista");
    confere(chamadas(env, "GET protecao-menores/padroes").length === 1 && /Equipe: /.test(pad) && /Pessoa: /.test(pad) && pad.includes("[equipePad]") && pad.includes("[pessoaPad]") && /3 registros/.test(pad), "os padrões (equipe e pessoa, total) aparecem");
    limpo(env, "Padrões", [ATAQUE("equipePad"), ATAQUE("pessoaPad")]);
    confere(env.intervalos.size === 0, "fora da fila não há relógio");
    // do padrão para a ficha do incidente
    env.limparRegistro();
    doc.clicar(botao(env, "nº 11", e("prtPadroesLista"))); await env.ocioso();
    confere(e("prtSecaoIncidentes").style.display === "block" && e("prtDetalheCx").style.display === "block" && chamadas(env, "GET protecao-menores/incidente")[0].consulta.incidenteId === "11", "do padrão se abre a ficha do incidente");
    // Comitê
    env.limparRegistro();
    doc.clicar(e("btnPrtSecaoComite")); await env.ocioso();
    const com = texto(env, "prtComiteLista");
    confere(com.includes("[comPastor]") && com.includes("[comLeigo]") && /clero/.test(com) && /leigo/.test(com), "o Comitê mostra os nomes e clero/leigo (do servidor)");
    const itemDe = (marca) => achar(env, x => x.localName === "li" && x.textContent.includes(marca));
    confere(itemDe("[comPastor]") && /clero/.test(itemDe("[comPastor]").textContent) && !/leigo/.test(itemDe("[comPastor]").textContent), "o pastor aparece como clero (o servidor decide pelo cargo do cadastro)");
    confere(itemDe("[comLeigo]") && /leigo/.test(itemDe("[comLeigo]").textContent) && !/clero/.test(itemDe("[comLeigo]").textContent), "quem não tem cargo ministerial aparece como leigo");
    confere(/Comitê incompleto/.test(com) && /pelo menos 3 membros \(hoje há 2\)/.test(com), "as pendências em português vêm do servidor");
    confere(/«Comitê de Proteção»/.test(com) && /Permissões/.test(com), "explica que o Comitê é cadastrado pelo papel «Comitê de Proteção» em Permissões");
    // L12: o aviso que o servidor manda (Comitê incompleto) e a aba dizem a MESMA coisa, e verdadeira, sobre onde o Comitê é cadastrado (o cadastro do papel é em Permissões; a aba Comitê só mostra quem é)
    const ondeCadastra = "Administração de Acesso → Permissões → Atribuir acesso a uma pessoa";
    const avisoServidor = pm.textoComiteIncompleto({ problemas: ["O Comitê precisa de pelo menos 3 membros (hoje há 2)."] });
    confere(com.includes(ondeCadastra) && avisoServidor.includes(ondeCadastra) && avisoServidor.includes("«Comitê de Proteção»") && !/Proteção de Crianças → Comitê/.test(avisoServidor), `L12: a aba e o aviso do servidor devem dizer o mesmo lugar (${ondeCadastra}): aviso = "${avisoServidor.slice(-110)}"`);
    confere(lerApp("index.html").includes(`Quem entra no Comitê é cadastrado pelo papel «Comitê de Proteção» em ${ondeCadastra}.`), "L12: o texto fixo da seção Comitê (index.html) diz o mesmo lugar");
    limpo(env, "Comitê", [ATAQUE("comPastor"), ATAQUE("comLeigo"), ATAQUE("problemaComite")]);
    membros.push({ membroId: 3, nome: "Terceira", cargoMinisterial: null });
    doc.clicar(botao(env, "Atualizar", e("prtSecaoComite"))); await env.ocioso();
    confere(/Comitê completo/.test(texto(env, "prtComiteLista")) && !/incompleto/.test(texto(env, "prtComiteLista")), "com 3 membros e um leigo o Comitê está completo");
    // relatório
    env.limparRegistro();
    doc.clicar(e("btnPrtSecaoRelatorio")); await env.ocioso();
    const anos = [...e("prtRelAno").options].map(o => o.value);
    confere(anos[0] === "2026" && anos[anos.length - 1] === "2024" && anos.length === 3, `o seletor de ano vai do atual (2026) a 2024: ${anos}`);
    const rel = texto(env, "prtRelImprimivel");
    confere(chamadas(env, "GET protecao-menores/relatorio-anual").length === 1 && chamadas(env, "GET protecao-menores/relatorio-anual")[0].consulta.ano === "2026", "pede o relatório do ano escolhido");
    confere(/Relatório anual de proteção de crianças e adolescentes — 2026/.test(rel) && /Suspeitas ou relatos de violência/.test(rel) && /Comunicadas no prazo/.test(rel) && /Habilitação de quem serve com crianças/.test(rel), "o relatório mostra totais e tabelas");
    confere(rel.includes("[congRel]") && rel.includes("[congHab]") && /5.5 h/.test(rel) && /—/.test(rel), "a tabela por congregação (com a média de horas ou traço)");
    const linhas = [...e("prtRelImprimivel").descendentes()].filter(x => x.localName === "tr");
    confere(linhas.length === 1 + 2 + 1 + 1, `linhas das tabelas (${linhas.length})`);
    limpo(env, "Relatório", [ATAQUE("congRel"), ATAQUE("congHab")]);
    env.limparRegistro();
    doc.escolher(e("prtRelAno"), "2025"); await env.ocioso();
    confere(chamadas(env, "GET protecao-menores/relatorio-anual")[0].consulta.ano === "2025" && /— 2025/.test(texto(env, "prtRelImprimivel")), "trocar o ano refaz o relatório");
    // resposta atrasada: o ano mudou enquanto a resposta do ano anterior ainda vinha
    const presaRel = env.retem(x => x.chave === "GET protecao-menores/relatorio-anual" && x.consulta.ano === "2026");
    doc.escolher(e("prtRelAno"), "2026");
    for (let i = 0; i < 30 && !presaRel.chegou; i++) await new Promise(r => setImmediate(r));
    confere(presaRel.chegou, "(relatório atrasado) o pedido de 2026 devia estar a caminho");
    doc.escolher(e("prtRelAno"), "2025"); await env.ocioso();
    presaRel.liberar(); await env.ocioso();
    confere(/— 2025/.test(texto(env, "prtRelImprimivel")) && !/— 2026/.test(texto(env, "prtRelImprimivel")), "relatório: a resposta atrasada de outro ano NÃO substitui a do ano escolhido");
    doc.clicar(botao(env, "Imprimir", e("prtSecaoRelatorio")));
    confere(env.impressoes.length === 1 && env.impressoes[0].classeImprimindo === true && !doc.body.classList.contains("prt-imprimindo"), "Imprimir chama window.print com a classe de impressão e a retira depois");
    confere(/@media print[\s\S]*prt-imprimindo[\s\S]*prtRelImprimivel/.test(lerApp("style.css")), "o CSS de impressão existe");
    // L8: o relato (e a ficha com o relato) nunca saem na impressora, nem num Ctrl+P comum; e o resto da página sai com display:none (visibility:hidden sozinho deixava uma folha em branco no fim)
    const css = cssDoApp();
    const blocoPrint = css.slice(css.indexOf("@media print {"), css.indexOf("@supports selector(:has(*))"));
    confere(blocoPrint.includes("#prtRelatoCx, #prtDetalheCx { display: none !important; }"), "L8: a caixa do relato e a ficha do incidente têm de sumir em QUALQUER impressão (display:none !important dentro de @media print)");
    const blocoDisplay = css.slice(css.indexOf("@supports selector(:has(*))"));
    confere(blocoDisplay.includes("@media print") && blocoDisplay.includes("body.prt-imprimindo *:not(#prtRelImprimivel):not(#prtRelImprimivel *):not(:has(#prtRelImprimivel)) { display: none !important; }"), "L8: na impressão do relatório, tudo o que não é o relatório (nem uma pasta dele) sai com display:none (sem folha em branco no fim)");
    // (a regra da própria pasta do relatório: a v7.10 trouxe uma regra irmã para as etiquetas do check-in, e o bloco inteiro passava com a dela)
    const regraPasta = (/body\.prt-imprimindo \*:has\(#prtRelImprimivel\) \{[^}]*\}/.exec(blocoDisplay) || [""])[0];
    confere(!!regraPasta && /min-height: 0 !important/.test(regraPasta) && /overflow: visible !important/.test(regraPasta), "L8: as pastas onde o relatório está perdem altura mínima e rolagem na impressão");
    confere(css.includes("body.prt-imprimindo * { visibility: hidden !important; }"), "L8: a base de visibility:hidden segue como reserva para quem não sabe :has()");
    env.api.rotas["GET protecao-menores/relatorio-anual"] = { status: 500, corpo: { sucesso: false, mensagem: "Erro interno." } };
    doc.clicar(botao(env, "Atualizar", e("prtSecaoRelatorio"))); await env.ocioso();
    confere(/Erro interno/.test(texto(env, "prtRelResultado")) && e("prtRelImprimivel").innerHTML === "", "erro do servidor: mensagem e relatório vazio");
    // sair da aba e voltar: padrões, Comitê e relatório são recarregados (nada fica guardado)
    await env.ev("sairDoModulo()"); await env.ocioso();
    confere(e("abaProtecao").style.display === "none", "saiu da aba");
    confereAcessibilidade(env, ["prtSecaoPadroes", "prtSecaoComite", "prtSecaoRelatorio"], "Seções gerais");
  });

  // ============================================================================================================================================
  // 7) TROCA DE LOGIN: o dado de quem saiu não fica e a resposta atrasada não entra
  // ============================================================================================================================================
  cenario("Troca de login (PIN → liderança) e respostas atrasadas", async () => {
    const env = ambienteAtual = novo(); const { doc, api, e } = env;
    const marca = (n) => ATAQUE(n);
    const rotas = (quem) => ({
      "GET protecao-menores/catalogos": () => ({ corpo: F.catalogos({ gestao: quem === "B", geral: quem === "B" }) }),
      "GET protecao-menores/meus": () => ({ corpo: F.meus([{ protocolo: marca(`meu${quem}`), nivelRotulo: "Quebra de política de proteção", dataOcorrencia: "2026-10-01", situacao: "Em andamento", registradoEm: em(-5) }]) }),
      "GET congregacoes-publico": { corpo: [{ congregacaoId: 2, nome: "Sede", ativa: true }] },
      "GET protecao-menores/incidentes": () => ({ corpo: F.filaDe([{ id: quem === "A" ? 21 : 31, protocolo: marca(`prot${quem}`), prazoEm: em(5) }], SRV) }),
      "GET protecao-menores/incidente": () => ({ corpo: F.detalhe({ id: quem === "A" ? 21 : 31, descricao: marca(`desc${quem}`), prazoEm: em(5) }, SRV) }),
      "POST protecao-ajuda": () => ({ status: 201, corpo: F.confirmacaoDeAjuda("PRO-1") })
    });
    // A: membro por PIN, com coisas escritas e uma resposta de ajuda na tela
    api.rotas = rotas("A");
    env.sessao({ matricula: 20, pin: true });
    await env.ev("mostrarSubAbaMeupainel('protecao')"); await env.ocioso();
    escolherNivel(env, "ALEGACAO");
    e("prtRegDescricao").value = "descrição de A"; e("prtRegRelato").value = "RELATO ESCRITO POR A"; e("prtRegMsg").textContent = "mensagem de A"; e("prtRegMsg").className = "subtitle psc-aviso";
    e("prtAjudaLogTexto").value = "texto de ajuda de A";
    confere(texto(env, "prtMeusLista").includes("[meuA]"), "A: devia ter carregado os registros de A");
    // B: o MESMO navegador, agora com a senha de liderança (outra pessoa, outros papéis): abre a aba
    api.rotas = rotas("B");
    env.sessao({ matricula: 5, nivel: "GLOBAL", permissoes: ["protecao_menores"], geral: true });
    await env.ev("mostrarAbaSecretaria('protecao')"); await env.ocioso();
    const vazio = (id) => e(id).innerHTML === "";
    confere(["prtMeusLista", "prtRegNiveis", "prtAjudaLogForm", "prtRegResposta"].every(vazio), "troca de login: as listas e o formulário de A ainda estão na tela");
    confere(e("prtRegDescricao").value === "" && e("prtRegRelato").value === "" && e("prtRegMsg").textContent === "" && !/psc-aviso/.test(e("prtRegMsg").className), "troca de login: campos, relato e mensagem em destaque de A ficaram");
    confere(!doc.body.textContent.includes("[meuA]") && !doc.body.textContent.includes("RELATO ESCRITO POR A") && !doc.body.textContent.includes("texto de ajuda de A"), "troca de login: sobrou dado de A em algum lugar da página");
    confere(e("prtRegCx").style.display === "none", "troca de login: o formulário de registro de A fechou");
    confere(texto(env, "prtListaIncidentes").includes("[protB]"), "B vê a fila de B");
    // a mesma pessoa, trocando PIN por senha, também refaz a tela
    env.sessao({ matricula: 20, pin: true }); api.rotas = rotas("A");
    await env.ev("mostrarSubAbaMeupainel('protecao')"); await env.ocioso();
    e("prtRegDescricao").value = "descrição do PIN";
    env.sessao({ matricula: 20, nivel: "GLOBAL", permissoes: ["protecao_menores"] }); api.rotas = rotas("B");
    await env.ev("mostrarAbaSecretaria('protecao')"); await env.ocioso();
    confere(e("prtRegDescricao").value === "", "PIN → senha da MESMA matrícula: a tela devia ser refeita (papéis diferentes)");
    // resposta atrasada: o pedido de A ainda está a caminho quando B entra (Meu Painel)
    const envB = ambienteAtual = novo();
    envB.api.rotas = rotas("A");
    envB.sessao({ matricula: 20, pin: true });
    const presa = envB.retem(c => c.chave === "GET protecao-menores/meus");
    const pA = envB.ev("carregarMeuPainelProtecaoAcao()");
    for (let i = 0; i < 30 && !presa.chegou; i++) await new Promise(r => setImmediate(r));
    confere(presa.chegou, "(resposta atrasada) o pedido do Meu Painel de A devia estar a caminho");
    envB.api.rotas = rotas("B"); envB.sessao({ matricula: 30, pin: true });
    await envB.ev("carregarMeuPainelProtecaoAcao()"); await envB.ocioso();
    confere(envB.doc.body.textContent.includes("[meuB]"), "atraso: os dados de B não chegaram");
    presa.liberar(); await esperar(pA); await envB.ocioso();
    confere(!envB.doc.body.textContent.includes("[meuA]"), "atraso: a resposta velha de A entrou na tela de B");
    // o mesmo atraso na aba da liderança: a fila de A chega depois que B entrou
    const envC = ambienteAtual = novo();
    envC.api.rotas = rotas("B");
    envC.sessao({ matricula: 5, nivel: "GLOBAL", permissoes: ["protecao_menores"], geral: true });
    await envC.ev("mostrarAbaSecretaria('protecao')"); await envC.ocioso();
    envC.api.rotas = rotas("A");
    const presaL = envC.retem(c => c.chave === "GET protecao-menores/incidentes");
    const pL = envC.ev("prtCarregarIncidentesAcao()");
    for (let i = 0; i < 30 && !presaL.chegou; i++) await new Promise(r => setImmediate(r));
    confere(presaL.chegou, "(resposta atrasada) o pedido da fila de A devia estar a caminho");
    envC.api.rotas = rotas("B"); envC.sessao({ matricula: 9, nivel: "GLOBAL", permissoes: ["protecao_menores"], geral: true });
    envC.ev("limparSessao()"); envC.sessao({ matricula: 9, nivel: "GLOBAL", permissoes: ["protecao_menores"], geral: true });
    await envC.ev("mostrarAbaSecretaria('protecao')"); await envC.ocioso();
    presaL.liberar(); await esperar(pL); await envC.ocioso();
    confere(!envC.doc.body.textContent.includes("[protA]") && envC.doc.body.textContent.includes("[protB]"), "atraso (fila): a resposta velha NÃO pode entrar depois da troca de login");
    // o catálogo (papéis!) que chega depois de a pessoa trocar de login NÃO vale para a seguinte
    const envF = ambienteAtual = novo();
    envF.api.rotas = rotas("A");
    envF.sessao({ matricula: 20, pin: true });
    const presaCat = envF.retem(c => c.chave === "GET protecao-menores/catalogos");
    const pF = envF.ev("carregarMeuPainelProtecaoAcao()");
    for (let i = 0; i < 30 && !presaCat.chegou; i++) await new Promise(r => setImmediate(r));
    confere(presaCat.chegou, "(catálogo atrasado) o pedido do catálogo de A devia estar a caminho");
    envF.ev("limparSessao()"); envF.api.rotas = rotas("B"); envF.sessao({ matricula: 5, nivel: "GLOBAL", permissoes: ["protecao_menores"], geral: true });
    await envF.ev("mostrarAbaSecretaria('protecao')"); await envF.ocioso();
    presaCat.liberar(); await esperar(pF); await envF.ocioso();
    confere(envF.g("prtCatalogos.papeis.geral") === true && envF.e("btnPrtSecaoRelatorio").style.display !== "none", "catálogo atrasado: os papéis de A (sem nível geral) NÃO podem valer para B");
    // o registro que ainda está a caminho quando a pessoa sai NÃO escreve a resposta na tela da seguinte
    const envE = ambienteAtual = novo();
    envE.api.rotas = Object.assign(rotas("A"), { "POST protecao-menores/registrar": () => ({ status: 201, corpo: { sucesso: true, incidenteId: 1, protocolo: marca("protoTardio"), exigeComunicacao: false, mensagem: marca("msgTardia") } }) });
    envE.sessao({ matricula: 20, pin: true });
    await envE.ev("mostrarSubAbaMeupainel('protecao')"); await envE.ocioso();
    escolherNivel(envE, "QUASE_ACIDENTE"); envE.doc.escolher(envE.e("prtRegCong"), "2"); envE.e("prtRegDescricao").value = "Criança saiu da sala e foi achada logo.";
    const presaE = envE.retem(c => c.chave === "POST protecao-menores/registrar");
    envE.doc.clicar(envE.e("prtRegBotao"));
    for (let i = 0; i < 30 && !presaE.chegou; i++) await new Promise(r => setImmediate(r));
    confere(presaE.chegou, "(resposta atrasada) o registro de A devia estar a caminho");
    envE.ev("limparSessao()"); envE.api.rotas = Object.assign(rotas("B"), envE.api.rotas); envE.sessao({ matricula: 30, pin: true });
    await envE.ev("mostrarSubAbaMeupainel('protecao')"); await envE.ocioso();
    presaE.liberar(); await envE.ocioso();
    confere(!envE.doc.body.textContent.includes("[protoTardio]") && !envE.doc.body.textContent.includes("[msgTardia]") && envE.e("prtRegResposta").innerHTML === "", "registro atrasado: a resposta de A NÃO pode aparecer na tela de B");
    // a ficha que chega depois de a pessoa trocar de incidente / sair
    const envD = ambienteAtual = novo();
    envD.api.rotas = rotas("B");
    envD.sessao({ matricula: 5, nivel: "GLOBAL", permissoes: ["protecao_menores"], geral: true });
    await envD.ev("mostrarAbaSecretaria('protecao')"); await envD.ocioso();
    const presaD = envD.retem(c => c.chave === "GET protecao-menores/incidente");
    envD.doc.clicar(botao(envD, "Abrir", cartaoDe(envD, 31)));
    for (let i = 0; i < 30 && !presaD.chegou; i++) await new Promise(r => setImmediate(r));
    confere(presaD.chegou, "(ficha atrasada) o pedido da ficha devia estar a caminho");
    envD.ev("limparSessao()");
    presaD.liberar(); await envD.ocioso();
    confere(!envD.doc.body.textContent.includes("[descB]"), "atraso (ficha): a ficha que chega depois de sair da sessão NÃO entra na tela");
    confere(envD.intervalos.size === 0, "e nenhum intervalo sobrou");
  });

  // ============================================================================================================================================
  // 7) TRAVA 7-B: "a pessoa envolvida é da liderança?", o selo "só Diretoria e Comitê", o ato que dá certo com um ALERTA e o texto da lei ("imediatamente")
  // ============================================================================================================================================
  const toastDeErro = (env) => [...env.e("toastContainer").children].some(t => /toast-erro/.test(t.className));
  const toastDeSucesso = (env) => [...env.e("toastContainer").children].some(t => /toast-sucesso/.test(t.className));

  cenario("7B: a pergunta da liderança no registro, o aviso que não alcançou ninguém e o texto da lei", async () => {
    const env = ambienteAtual = novo(); const { doc, api, e } = env;
    const S = { externas: 1, criadas: 1 };
    api.rotas = {
      "GET protecao-menores/catalogos": () => ({ corpo: F.catalogosComAtaque({ gestao: false, geral: false }) }),
      "GET protecao-menores/meus": () => ({ corpo: F.meus([]) }),
      "GET congregacoes-publico": { corpo: [{ congregacaoId: 2, nome: "Sede", ativa: true }] },
      "POST protecao-menores/registrar": (c) => {
        const exige = c.corpo.nivel === "ALEGACAO";
        // a mensagem como o servidor a monta (registrarIncidente): o texto do aviso vem de textoDoAviso, extraída de shared/protecaoDb.js
        const mensagem = (exige ? `Registrado (protocolo ${ATAQUE("proto7b")}). Comunique o Conselho Tutelar imediatamente: o prazo máximo da Igreja (24 horas) já está contando.` : `Registrado (protocolo ${ATAQUE("proto7b")}).`)
          + F.textoDoAviso({ criadas: S.criadas, externas: S.externas }, { liderancaEnvolvida: c.corpo.envolvidoDaLideranca === true })
          + (exige ? " Não faça perguntas à criança e não converse sobre o caso com outras pessoas." : "");
        return { status: 201, corpo: { sucesso: true, incidenteId: 90, protocolo: ATAQUE("proto7b"), prazoEm: exige ? em(24) : null, exigeComunicacao: exige, mensagem } };
      }
    };
    env.sessao({ matricula: 20, pin: true });
    await env.ev("mostrarSubAbaMeupainel('protecao')"); await env.ocioso();
    // a pergunta: um grupo com legenda, sim/não do mesmo grupo, "não" marcado de saída, logo antes do bloco da suspeita
    const grupo = e("prtRegLiderancaCx");
    const legenda = grupo ? [...grupo.descendentes()].find(x => x.localName === "legend") : null;
    confere(!!grupo && grupo.localName === "fieldset" && !!legenda && /A pessoa envolvida é da liderança desta congregação\?/.test(legenda.textContent), "7B: a pergunta 'a pessoa envolvida é da liderança desta congregação?' devia estar no formulário, num fieldset com legend");
    const nao = e("prtRegLiderancaNao"), sim = e("prtRegLiderancaSim");
    confere(!!nao && !!sim && nao.checked === true && sim.checked === false && nao.type === "radio" && sim.type === "radio" && nao.getAttribute("name") === sim.getAttribute("name"), "7B: sim/não (rádio do mesmo grupo), com 'não' marcado de saída");
    const filhos = e("prtRegAlegacaoCx").parentNode.children;
    confere(!!grupo && filhos.indexOf(grupo.parentNode) >= 0 && filhos.indexOf(grupo.parentNode) === filhos.indexOf(e("prtRegAlegacaoCx")) - 1, "7B: a pergunta fica logo antes do bloco da suspeita (depois da pessoa envolvida)");
    confere(/só para a Diretoria e o Comitê de Proteção/.test(grupo ? grupo.textContent : "") && /não recebe o aviso/.test(grupo ? grupo.textContent : ""), "7B: a pergunta explica o efeito do 'sim'");
    if (grupo) confereAcessibilidade(env, ["prtRegLiderancaCx"], "7B/pergunta");
    await env.ev("mostrarSubAbaMeupainel('protecao')"); await env.ocioso();
    confere([...doc.body.descendentes()].filter(x => x.id === "prtRegLiderancaCx").length === 1, "7B: abrir a sub-aba de novo não duplica a pergunta");

    const preencher = () => { escolherNivel(env, "QUEBRA_POLITICA"); doc.escolher(e("prtRegCong"), "2"); e("prtRegData").value = HOJE; e("prtRegDescricao").value = "Adulto ficou a sós com uma criança na sala."; };
    const marcarSim = () => { e("prtRegLiderancaSim").checked = true; e("prtRegLiderancaNao").checked = false; };
    const registrar = async () => { env.limparRegistro(); doc.clicar(e("prtRegBotao")); await env.ocioso(); return chamadas(env, "POST protecao-menores/registrar"); };
    // "não" (o padrão): vai false, como booleano; a liderança foi avisada fora do app: a resposta de sempre
    preencher();
    let p = await registrar();
    confere(p.length === 1 && p[0].corpo.envolvidoDaLideranca === false, `7B: com 'não' o registro manda envolvidoDaLideranca: false (${JSON.stringify(p[0] && p[0].corpo)})`);
    confere(/A liderança foi avisada/.test(texto(env, "prtRegResposta")) && /✅ Registrado/.test(texto(env, "prtRegResposta")) && !/psc-aviso/.test(e("prtRegMsg").className) && toastDeSucesso(env) && !toastDeErro(env), "7B: com a liderança avisada fora do app a resposta é a de sempre (sem alerta)");
    // "sim": vai true, e a pergunta volta para "não"
    preencher(); marcarSim();
    p = await registrar();
    confere(p.length === 1 && p[0].corpo.envolvidoDaLideranca === true, `7B: com 'sim' o registro manda envolvidoDaLideranca: true (${JSON.stringify(p[0] && p[0].corpo)})`);
    confere(e("prtRegLiderancaNao").checked === true && e("prtRegLiderancaSim").checked === false, "7B: depois de registrar, a pergunta volta para 'não'");
    // o aviso ficou só no sistema (o e-mail não saiu): ALERTA, não "tudo certo"
    S.externas = 0; S.criadas = 1;
    preencher(); await registrar();
    const pAlerta = [...e("prtRegResposta").descendentes()].find(x => x.localName === "p" && /psc-aviso/.test(x.className));
    confere(/ATENÇÃO: o aviso à liderança ficou só no sistema/.test(texto(env, "prtRegMsg")) && /psc-aviso/.test(e("prtRegMsg").className) && toastDeErro(env) && !toastDeSucesso(env), "7B: o aviso que ficou só no sistema sai em destaque e com o toast de erro (não como sucesso)");
    confere(!!pAlerta && /ligue agora para o Dirigente ou a Diretoria/.test(pAlerta.textContent) && pAlerta.getAttribute("role") === "alert" && !/✅/.test(texto(env, "prtRegResposta")) && /leia o aviso abaixo/.test(texto(env, "prtRegResposta")), "7B: a resposta tira o ✅ e mostra a mensagem do servidor como alerta");
    // ninguém avisado, com a liderança local apontada: o servidor manda procurar a Diretoria ou o Comitê, e a tela mostra como está
    S.criadas = 0;
    preencher(); marcarSim(); await registrar();
    confere(/não foi possível avisar a liderança agora: procure a Diretoria \(Presidente ou Secretário Geral\) ou o Comitê de Proteção pessoalmente/.test(texto(env, "prtRegResposta")) && /psc-aviso/.test(e("prtRegMsg").className) && toastDeErro(env), "7B: ninguém avisado: alerta com quem procurar (a Diretoria, porque a liderança local foi apontada)");
    limpo(env, "7B/registro com alerta", [ATAQUE("proto7b")]);
    // a suspeita: o aviso fixo diz "imediatamente"; com "sim" a confirmação diz que só a Diretoria e o Comitê serão avisados
    S.criadas = 1; S.externas = 1;
    escolherNivel(env, "ALEGACAO"); doc.escolher(e("prtRegCong"), "2"); e("prtRegData").value = HOJE; e("prtRegDescricao").value = "Criança contou algo sobre um adulto.";
    doc.escolher(e("prtRegQuem"), "PROPRIA_CRIANCA"); e("prtRegRelato").value = "Ela disse que o tio mexe com ela quando ninguém vê."; e("prtRegHoras").value = "0";
    const avisoFixo = texto(env, "prtRegAlegacaoCx");
    confere(/A lei manda comunicar ao Conselho Tutelar imediatamente; o prazo máximo da Igreja é de 24 horas/.test(avisoFixo) && !/em até 24 horas/.test(avisoFixo), "7B: o aviso da suspeita (index.html) diz 'imediatamente' e que 24 horas é o prazo máximo da Igreja");
    marcarSim(); env.limparRegistro();
    let ato = env.ev("prtEnviarRegistroAcao(document.getElementById('prtRegBotao'))"); let m = await env.responderModal(false); await esperar(ato);
    confere(m.aberto && /só a Diretoria e o Comitê de Proteção serão avisados \(o Dirigente local, não\)/.test(m.texto) && !/liderança de proteção será avisada na hora/.test(m.texto) && /imediatamente/.test(m.texto), `7B: com 'sim' a confirmação da suspeita diz quem será avisado: ${m.texto.slice(0, 160)}`);
    ato = env.ev("prtEnviarRegistroAcao(document.getElementById('prtRegBotao'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
    p = chamadas(env, "POST protecao-menores/registrar");
    confere(p.length === 1 && p[0].corpo.envolvidoDaLideranca === true && !!p[0].corpo.relato, "7B: a suspeita com 'sim' sai com envolvidoDaLideranca: true");
    const r = texto(env, "prtRegResposta");
    confere(/A lei manda comunicar ao Conselho Tutelar imediatamente\./.test(r) && /Prazo máximo da Igreja/.test(r) && !/em até 24 horas/.test(r), "7B: a resposta da suspeita diz 'imediatamente' e o prazo máximo da Igreja");
    // troca de login: o "sim" da pessoa anterior não fica marcado
    marcarSim();
    env.ev("prtLimparTela()");
    confere(e("prtRegLiderancaNao").checked === true && e("prtRegLiderancaSim").checked === false, "7B: a troca de login (limpeza da tela) devolve a pergunta para 'não'");
    // o topo da aba da liderança também diz "imediatamente"
    const topo = [...e("abaProtecao").children].find(x => x.localName === "p");
    confere(!!topo && /comunicada ao Conselho Tutelar imediatamente/.test(topo.textContent) && /prazo máximo da Igreja é de 24 horas/.test(topo.textContent) && !/em até 24 horas/.test(topo.textContent), "7B: o topo da aba (index.html) diz 'imediatamente' e que 24 horas é o prazo máximo da Igreja");
  });

  cenario("7B: o selo 'só Diretoria e Comitê' na fila e na ficha, e o ato que dá certo com um alerta", async () => {
    const base = { comunicacoes: [{ protocoloExterno: "CT-2026/1", registradoPorNome: "Eu" }], nAnexos: 0, decisoes: [], reclassificacoes: [], leituras: [], relato: { registrado: true, adendos: 0 } };
    const { env, S } = await preparar({ estado: {
      fila: [
        { id: 31, protocolo: "PRO-LID", prazoEm: em(5), envolvidoDaLideranca: true },
        { id: 32, protocolo: "PRO-SEMMAT", prazoEm: em(6), envolvidoSemMatricula: true },
        { id: 33, protocolo: "PRO-CANAL", origem: "CANAL_AJUDA", prazoEm: em(7) },
        { id: 34, protocolo: "PRO-COMUM", nivel: "QUEBRA_POLITICA", exigeComunicacao: false }
      ],
      det: {
        31: () => Object.assign({}, base, { id: 31, protocolo: "PRO-LID", envolvidoDaLideranca: true, envolvidos: [{ envolvidoId: 51, membroId: 61, nome: "Pessoa apontada", ultimaDecisao: null, nDecisoes: 0 }] }),
        32: () => Object.assign({}, base, { id: 32, protocolo: "PRO-SEMMAT", envolvidos: [{ envolvidoId: 52, membroId: null, nome: "Só o nome" }] }),
        33: () => Object.assign({}, base, { id: 33, protocolo: "PRO-CANAL", origem: "CANAL_AJUDA", envolvidos: [] }),
        34: () => Object.assign({}, base, { id: 34, protocolo: "PRO-COMUM", nivel: "QUEBRA_POLITICA", exigeComunicacao: false, comunicacoes: [], relato: { registrado: false, adendos: 0 }, envolvidos: [{ envolvidoId: 54, membroId: 64, nome: "Membro comum" }] })
      }
    } });
    const { doc, api, e } = env;
    const selos = (raiz) => (raiz ? [...raiz.descendentes()].filter(x => /\bprt-selo\b/.test(x.className) && /só Diretoria e Comitê/.test(x.textContent)).length : -1);   // (o <p class="prt-selos"> que os envolve não conta)
    for (const [id, tem] of [[31, true], [32, true], [33, true], [34, false]]) confere(selos(cartaoDe(env, id)) === (tem ? 1 : 0), `7B: o cartão ${id} ${tem ? "devia" : "não devia"} ter o selo 'só Diretoria e Comitê' (${selos(cartaoDe(env, id))})`);
    // a ficha: o selo e o porquê (texto nosso, pela ordem da regra do servidor)
    for (const [id, porque] of [[31, /quem registrou disse que a pessoa envolvida é da liderança da congregação/], [32, /pessoa envolvida registrada sem matrícula/], [33, /o pedido veio do canal de ajuda, sem login/]]) {
      await abrirFicha(env, id);
      confere(selos(e("prtDetalheConteudo")) === 1 && !!e("prtFichaSoGeral") && porque.test(texto(env, "prtFichaSoGeral")) && /O Dirigente da congregação não recebe os avisos e não vê esta ficha/.test(texto(env, "prtFichaSoGeral")), `7B: a ficha ${id} mostra o selo e por que só o nível geral trata o caso (${texto(env, "prtFichaSoGeral").slice(0, 90)})`);
    }
    await abrirFicha(env, 34);
    confere(selos(e("prtDetalheConteudo")) === 0 && !e("prtFichaSoGeral"), "7B: a ficha comum não tem o selo nem a explicação");

    // o ato que dá certo, mas com um alerta do servidor: retirada das escalas que falhou (decidir, vincular, reclassificar) e aviso que não saiu do sistema (reclassificar)
    S.posts = [];
    api.rotas["POST protecao-menores/cautelar-decidir"] = (c) => { S.posts.push(["decidir", c.corpo]); return { corpo: { sucesso: true, decisao: c.corpo.decisao, escalasDesmarcadas: null, retiradaFalhou: true, mensagem: `Afastamento mantido.${F.TEXTO_RETIRADA_FALHOU}` } }; };
    api.rotas["POST protecao-menores/vincular-envolvido"] = (c) => { S.posts.push(["vincular", c.corpo]); return { corpo: { sucesso: true, escalasDesmarcadas: null, retiradaFalhou: true, mensagem: `Pessoa vinculada e afastada por cautela; o Comitê precisa decidir sobre o afastamento.${F.TEXTO_RETIRADA_FALHOU}` } }; };
    api.rotas["POST protecao-menores/reclassificar"] = (c) => { S.posts.push(["reclassificar", c.corpo]); return { corpo: S.reclass }; };
    const alertaNaFicha = (qual, rx) => {
      confere(rx.test(texto(env, "prtDetalheMsg")) && /psc-aviso/.test(e("prtDetalheMsg").className), `7B (${qual}): a mensagem do servidor fica na ficha EM DESTAQUE (${texto(env, "prtDetalheMsg").slice(0, 90)})`);
      confere(toastDeErro(env) && !toastDeSucesso(env), `7B (${qual}): o toast sai como erro, não como sucesso`);
    };
    // decidir (manter o afastamento)
    await abrirFicha(env, 31);
    doc.clicar(botao(env, "Decidir o afastamento", e("prtDetalheConteudo"))); await env.ocioso();
    doc.escolher(e("prtFdDecisao"), "MANTIDO_AFASTADO"); e("prtFdObs").value = "Há elementos que justificam manter o afastamento."; env.limparRegistro();
    let ato = env.ev("prtEnviarDecisaoAcao(51, document.getElementById('prtFdDecisao'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
    confere(S.posts.length === 1 && S.posts[0][0] === "decidir", "7B: a decisão foi enviada");
    alertaNaFicha("decidir", /Afastamento mantido\. ATENÇÃO: o afastamento foi gravado, mas a retirada automática das escalas e turmas com menores NÃO saiu agora/);
    // vincular a pessoa registrada só pelo nome
    await abrirFicha(env, 32);
    doc.clicar(botao(env, "Vincular a uma pessoa do cadastro", e("prtDetalheConteudo"))); await env.ocioso();
    e("prtFvMatricula").value = "77"; env.limparRegistro();
    ato = env.ev("prtEnviarVinculoAcao(52, document.getElementById('prtFvMatricula'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
    confere(S.posts.length === 2 && S.posts[1][0] === "vincular", "7B: o vínculo foi enviado");
    alertaNaFicha("vincular", /Pessoa vinculada e afastada por cautela.*ATENÇÃO: o afastamento foi gravado/);
    // reclassificar para suspeita: com o aviso que ficou só no sistema (avisoExterno: false) e com a retirada que falhou
    const textoReclass = (o) => "Incidente reclassificado como suspeita de violência: comunique o Conselho Tutelar imediatamente (o prazo máximo da Igreja, de 24 horas, começou a contar agora)."
      + (o.retirada ? F.TEXTO_RETIRADA_FALHOU : "") + (o.externas ? "" : F.textoDoAviso({ criadas: o.criadas, externas: 0 }));
    for (const [qual, o, rx] of [["reclassificar, aviso só no sistema", { criadas: 2, externas: 0 }, /ATENÇÃO: o aviso à liderança ficou só no sistema \(o e-mail não saiu\): ligue agora/],
      ["reclassificar, ninguém avisado", { criadas: 0, externas: 0 }, /ATENÇÃO: não foi possível avisar a liderança agora/],
      ["reclassificar, retirada que falhou", { criadas: 2, externas: 1, retirada: true }, /ATENÇÃO: o afastamento foi gravado/]]) {
      S.reclass = Object.assign({ sucesso: true, nivel: "ALEGACAO", prazoEm: em(24), escalasDesmarcadas: null, avisados: o.criadas, avisoExterno: o.externas > 0, mensagem: textoReclass(o) }, o.retirada ? { retiradaFalhou: true } : {});
      await abrirFicha(env, 34);
      doc.clicar(botao(env, "Reclassificar", e("prtDetalheConteudo"))); await env.ocioso();
      doc.escolher(e("prtFrNivel"), "ALEGACAO"); e("prtFrMotivo").value = "A criança contou mais coisas depois.";
      doc.escolher(e("prtFrQuem"), "VOLUNTARIO"); e("prtFrRelato").value = "A criança contou, sozinha, o que aconteceu."; env.limparRegistro();
      ato = env.ev("prtEnviarReclassificacaoAcao(document.getElementById('prtFrNivel'))"); await env.responderModal(true); await esperar(ato); await env.ocioso();
      confere(S.posts[S.posts.length - 1][0] === "reclassificar", `7B (${qual}): a reclassificação foi enviada`);
      alertaNaFicha(qual, rx);
    }
  });

  // ---- execução ----
  const vivo = setInterval(() => {}, 1000);   // um ato esperando para sempre não pode encerrar o processo em silêncio
  const naoTratada = (erro) => { T.total++; T.falhas.push(`${T.cenarioAtual}: exceção não tratada na tela (${String(erro && erro.message || erro).slice(0, 100)})`); };
  process.on("unhandledRejection", naoTratada); process.on("uncaughtException", naoTratada);
  for (const c of cenarios) {
    if (so && !c.nome.includes(so)) continue;
    T.cenarioAtual = c.nome;
    try { await c.fn(); } catch (erro) { T.total++; T.falhas.push(`${c.nome}: EXCEÇÃO ${String(erro && erro.stack || erro).split("\n").slice(0, 3).join(" | ")}`); }
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
