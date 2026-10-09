// roteiro.js — a tela da v7.7 (Ministério com Menores) contra o front de verdade, em DOM simulado, com a API simulada nos formatos reais do servidor e texto de ataque
// em TODO campo que vem do servidor. Cobre: Meu Painel (situação, política com hash e `politicaMudou`, ficha, comunicação à Diretoria, autorização do responsável com hash e
// `termoMudou`, revogação), troca de login (PIN → senha) e resposta atrasada, a aba da Secretaria (painel mascarado × Diretoria, ferramentas, comunicações com a confirmação
// reforçada 428), as escalas (crianças previstas, publicar com 422, faixa etária), a foto de menor, Meus Dados e a acessibilidade dos formulários.
"use strict";
const { criarAmbiente } = require("./ambiente");
const F = require("./fixtures");
const { ATAQUE, iso } = F;

async function rodar({ mutar = {}, so = null, verboso = false } = {}) {
  const T = { total: 0, falhas: [], cenarios: [] };
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

  const novo = () => criarAmbiente({ mutar });
  // nada pode ter executado nem ter virado marcação: zero ataque no DOM, zero chamada de __xss, e o texto de ataque aparece como TEXTO
  const limpo = (env, qual, textos = []) => {
    confere(env.doc._ataques.length === 0, `${qual}: o texto de ataque virou marcação/atributo de evento (${JSON.stringify(env.doc._ataques.slice(0, 2))})`);
    confere(env.ctx.__xss.chamadas.length === 0, `${qual}: código do ataque EXECUTOU (${env.ctx.__xss.chamadas.join(",")})`);
    const corpo = env.doc.body.textContent;
    for (const t of textos) confere(corpo.includes(t), `${qual}: o texto do servidor "${t.slice(-14)}" não apareceu na tela como texto`);
    confere(env.doc._erros.length === 0, `${qual}: HTML malformado gerado (${env.doc._erros.slice(0, 2).join("; ")})`);
  };
  const achar = (env, f) => [...env.doc.body.descendentes()].find(f) || null;
  // botão pelo texto, sempre dentro das áreas desta tela (o index.html tem centenas de outros botões com textos parecidos, como "Consultar" e "Abrir o painel")
  const REGIOES = ["subMeupainelMenores", "mnrSecaoPainel", "mnrSecaoFerramentas", "mnrSecaoComunicacoes", "painelDetalheServicoEscala", "painelEquipesFlag"];
  const botao = (env, texto, raiz) => {
    const raizes = raiz ? [raiz] : REGIOES.map(id => env.e(id)).filter(Boolean);
    for (const r of raizes) { const b = [...r.descendentes()].find(x => x.localName === "button" && x.textContent.includes(texto)); if (b) return b; }
    return null;
  };
  const chamadas = (env, chave) => env.api.chamadas.filter(c => c.chave === chave);
  const texto = (env, id) => (env.e(id) ? env.e(id).textContent : "");

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

  // ============================================================================================================================================
  // 1) MEU PAINEL
  // ============================================================================================================================================
  cenario("Meu Painel: situação, política (hash e politicaMudou), ficha, comunicação, menores", async () => {
    const env = ambienteAtual = novo(); const { doc, api, e } = env;
    const S = { hash: ATAQUE("hash"), aceita: false, fichaOk: false, adAberta: null, fichaPostada: 0, textosHash: null };
    // situação: antecedentes vencem em 40 dias (amarelo), treinamento em dia (verde), ficha vencida há 5 dias (vermelho), política não aceita
    const sobre = { vistoria: { vistoriaId: 7, resultado: "SEM_RESTRICAO", dataVerificacao: iso(-10), documentos: [{ tipo: "ANTECEDENTES_FEDERAL", dataEmissao: iso(-140) }, { tipo: "ANTECEDENTES_ESTADUAL", dataEmissao: iso(-140) }] },
      fichaEm: iso(-185), politicaVersaoAceita: null };
    const situacao = () => {
      const s = F.minhaSituacao({ sobre, equipes: [{ equipeId: 3, nome: ATAQUE("equipe") }], autoDenuncia: S.adAberta ? F.autoDenunciaDaSituacao(S.adAberta) : null, politicaAceita: S.aceita });
      s.situacao.bloqueios.forEach((b, i) => { b.mensagem = ATAQUE(`bloqueio${i}`) + " " + b.mensagem; });
      if (s.situacao.proximoVencimento) s.situacao.proximoVencimento.rotulo = ATAQUE("proximo");
      return s;
    };
    const cat = F.catalogos({ gestao: false, geral: false, diretoria: false });
    const pol = () => { const p = F.politica(S.aceita); p.politica.hash = S.hash; p.politica.titulo = ATAQUE("polTitulo"); p.politica.itens[0].texto = ATAQUE("polItem"); p.politica.aceite = ATAQUE("polAceite"); return p; };
    const nomeMenor = ATAQUE("menor1");
    const menoresResp = () => {
      const est = F.estados({ SAUDE_CRACHA: F.linhaConsent("SAUDE_CRACHA", true) }, { visitanteId: 20 });
      est.IMAGEM.mensagem = ATAQUE("estadoMsg"); est.IMAGEM.rotulo = ATAQUE("estadoRotulo");
      const est2 = F.estados({ IMAGEM: F.linhaConsent("IMAGEM", false) }, { visitanteId: 20 });
      return F.menoresDoResponsavel([F.menorDaLista(40, nomeMenor, est), F.menorDaLista(41, ATAQUE("menor2"), est2)]);
    };
    const textosResp = () => { const t = F.textos(); t.textos.forEach(x => { x.titulo = ATAQUE("txTitulo"); x.itens[0].texto = ATAQUE("txItem"); x.itens[0].base = ATAQUE("txBase"); x.aceite = ATAQUE("txAceite"); }); return t; };
    const hashesDoTexto = {}; F.mc.textosVigentes().forEach(t => { hashesDoTexto[t.finalidade] = t.hash; });
    const S2 = { hashTexto: ATAQUE("hashTexto"), termoMudou: false, concedidos: 0, revogados: 0, ficha: 0 };
    api.rotas = {
      "GET ministerio-menores/catalogos": { corpo: cat },
      "GET ministerio-menores/minha-situacao": () => ({ corpo: situacao() }),
      "GET ministerio-menores/politica": () => ({ corpo: pol() }),
      "POST ministerio-menores/aceitar-politica": (c) => {
        if (c.corpo.textoHash !== S.hash) return { status: 422, corpo: { sucesso: false, politicaMudou: true, mensagem: "O texto da política mudou desde que você abriu a tela (ou a tela está desatualizada): recarregue e leia de novo antes de aceitar." } };
        S.aceita = true; return { status: 201, corpo: { sucesso: true, mensagem: "Política aceita. Obrigado por proteger as crianças e os adolescentes." } };
      },
      "POST ministerio-menores/confirmar-ficha": (c) => { S.fichaPostada++; return c.corpo.confirmo === true ? { corpo: { sucesso: true, mensagem: "Ficha confirmada. Ela vale por mais 6 meses." } } : { status: 422, corpo: { sucesso: false, mensagem: "Marque que os seus dados cadastrais estão atualizados." } }; },
      "POST ministerio-menores/auto-denuncia": (c) => {
        S.adAberta = F.autoDenunciaRow({ MembroId: 20, Nome: "Eu", Tipo: c.corpo.tipo, DataCiencia: new Date(`${c.corpo.dataCiencia}T00:00:00Z`) });
        return { status: 201, corpo: { sucesso: true, autoDenunciaId: 11, escalasDesmarcadas: 2, mensagem: "Comunicação recebida pela Diretoria Executiva. Obrigado por avisar." } };
      },
      "GET consentimento-menor/meus-menores": () => ({ corpo: menoresResp() }),
      "GET consentimento-menor/textos": () => { const t = textosResp(); t.textos.forEach(x => { x.hash = S2.hashTexto; }); return { corpo: t }; },
      "POST consentimento-menor/conceder": (c) => {
        if (c.corpo.termoHash !== S2.hashTexto) return { status: 422, corpo: { sucesso: false, termoMudou: true, mensagem: "O texto da autorização mudou desde que você abriu a tela (ou a tela está desatualizada): recarregue, leia de novo e autorize." } };
        S2.concedidos++; return { status: 201, corpo: { sucesso: true, mensagem: "Autorização registrada." } };
      },
      "POST consentimento-menor/revogar": () => { S2.revogados++; return { corpo: { sucesso: true, fotoApagada: true, mensagem: "Autorização revogada. A foto de Pedro foi apagada e a imagem deixa de ser usada." } }; }
    };
    env.sessao({ matricula: 20, pin: true });
    await env.ev("carregarMeuPainelMenoresAcao()");
    await env.ocioso();

    // -- situação
    const sit = texto(env, "mnrSituacao");
    confere(sit.includes("Ainda não habilitado"), "situação: selo 'Ainda não habilitado' ausente");
    confere(sit.includes("[bloqueio0]") && sit.includes("[bloqueio1]"), "situação: as pendências (mensagem do servidor) não aparecem");
    confere(sit.includes("Falta aceitar a política") && sit.includes("venceu"), "situação: mensagem das pendências em português simples ausente");
    const classes = (id, rotulo) => { const el = achar(env, x => x.localName === "span" && x.classList.contains("cal-selo") && x.textContent.includes(rotulo) && env.e(id) && env.e(id).textContent.includes(rotulo)); return el ? el.className : ""; };
    const hojeFmt = (dias) => { const [a, m, d] = iso(dias).split("-"); return `${d}/${m}/${a}`; };
    const selosValidades = [...e("mnrSituacao").descendentes()].filter(x => x.classList.contains("cal-selo"));
    const doDia = (dias) => selosValidades.find(x => x.textContent.includes(hojeFmt(dias)));
    confere(doDia(40) && doDia(40).classList.contains("cal-st-proposto") && /faltam 40 dias/.test(doDia(40).textContent), "validade: certidões a 40 dias deviam ficar AMARELAS ('faltam 40 dias')");
    confere(doDia(630) && doDia(630).classList.contains("cal-st-homologado"), "validade: treinamento a 630 dias devia ficar VERDE");
    confere(doDia(-5) && doDia(-5).classList.contains("cal-st-indeferido") && /venceu há 5 dias/.test(doDia(-5).textContent), "validade: ficha vencida há 5 dias devia ficar VERMELHA ('venceu há 5 dias')");
    confere(sit.includes("[equipe]"), "situação: as equipes com menores em que a pessoa serve não aparecem");
    confere(sit.includes("Próximo vencimento") && sit.includes("[proximo]"), "situação: o próximo vencimento não aparece");
    limpo(env, "Meu Painel/situação", [ATAQUE("equipe"), ATAQUE("bloqueio0")]);

    // -- política: caixa + botão; hash enviado = o hash que a tela mostrou
    const caixa = e("mnrPoliticaAceite"), btnPol = e("mnrPoliticaBotao");
    confere(!!caixa && !!btnPol, "política: caixa/botão não existem");
    confere(btnPol.disabled === true, "política: o botão devia começar desabilitado");
    confere(caixa.getAttribute("data-texto-hash") === S.hash, "política: o hash do texto mostrado não está guardado na caixa (ida e volta pelo atributo falhou)");
    // a ação também confere a caixa (o botão desabilitado não é a única trava)
    env.limparRegistro();
    await env.ev("mnrAceitarPoliticaAcao(null)"); await env.ocioso();
    confere(chamadas(env, "POST ministerio-menores/aceitar-politica").length === 0 && /Marque a caixa/.test(texto(env, "mnrPoliticaMsg")), "política: sem a caixa marcada a ação NÃO pode enviar o aceite");
    // o servidor troca o texto enquanto a pessoa lê: o aceite com o hash velho é recusado e a tela recarrega
    S.hash = "hash-novo-do-servidor";
    env.limparRegistro();
    doc.marcar(caixa, true); confere(btnPol.disabled === false, "política: marcar a caixa devia habilitar o botão");
    doc.clicar(btnPol); await env.ocioso();
    const p1 = chamadas(env, "POST ministerio-menores/aceitar-politica");
    confere(p1.length === 1 && p1[0].corpo.aceito === true && p1[0].corpo.textoHash === ATAQUE("hash"), "política: o POST devia levar o hash que a tela MOSTROU (não o novo) e aceito:true");
    confere(chamadas(env, "GET ministerio-menores/politica").length >= 1, "política: 422 politicaMudou devia RECARREGAR o texto");
    const caixa2 = e("mnrPoliticaAceite");
    confere(caixa2 && caixa2.getAttribute("data-texto-hash") === "hash-novo-do-servidor" && caixa2.checked === false, "política: depois do aviso a caixa devia voltar desmarcada com o hash novo");
    confere(/foi atualizado/.test(texto(env, "mnrPoliticaMsg")), "política: faltou avisar que o texto mudou");
    confere(env.toasts().length === 1, `política: toast duplicado/ausente (${env.toasts().length})`);
    confere(S.aceita === false, "política: aceitou um texto que mudou");
    // agora com o texto novo: aceita
    env.limparRegistro();
    doc.marcar(e("mnrPoliticaAceite"), true); doc.clicar(e("mnrPoliticaBotao")); await env.ocioso();
    const p2 = chamadas(env, "POST ministerio-menores/aceitar-politica");
    confere(p2.length === 1 && p2[0].corpo.textoHash === "hash-novo-do-servidor", "política: o aceite do texto novo devia levar o hash novo");
    confere(S.aceita === true && /Você já aceitou/.test(texto(env, "mnrPoliticaCx")), "política: depois do aceite devia mostrar 'Você já aceitou'");
    confere(env.toasts().length === 1, `política: toast do aceite (${env.toasts().length})`);
    limpo(env, "Meu Painel/política");

    // -- ficha
    env.limparRegistro();
    doc.clicar(e("mnrFichaBotao")); await env.ocioso();
    confere(chamadas(env, "POST ministerio-menores/confirmar-ficha").length === 0, "ficha: sem marcar a caixa NÃO pode enviar");
    confere(/Marque a caixa/.test(texto(env, "mnrFichaMsg")), "ficha: faltou pedir para marcar a caixa");
    doc.marcar(e("mnrFichaMarca"), true); doc.clicar(e("mnrFichaBotao")); await env.ocioso();
    const pf = chamadas(env, "POST ministerio-menores/confirmar-ficha");
    confere(pf.length === 1 && pf[0].corpo.confirmo === true, "ficha: o POST devia levar confirmo:true");
    confere(/vale por mais 6 meses/.test(texto(env, "mnrFichaMsg")), "ficha: a mensagem do servidor devia aparecer");
    confere(e("mnrFichaMarca").checked === false, "ficha: a caixa devia voltar desmarcada");

    // -- comunicar à Diretoria: validação, confirmação, andamento
    env.limparRegistro();
    confere(e("mnrAdFormCx").style.display !== "none", "comunicar: o formulário devia aparecer quando não há comunicação");
    doc.clicar(e("mnrAdBotao")); await env.ocioso();
    confere(chamadas(env, "POST ministerio-menores/auto-denuncia").length === 0 && env.toasts().length === 1, "comunicar: sem preencher não pode enviar e deve avisar uma vez");
    e("mnrAdTipo").value = "INQUERITO_POLICIAL"; e("mnrAdData").value = iso(-12); e("mnrAdCiente").checked = false;
    env.limparRegistro(); doc.clicar(e("mnrAdBotao")); await env.ocioso();
    confere(chamadas(env, "POST ministerio-menores/auto-denuncia").length === 0 && !env.modal().aberto, "comunicar: sem a caixa 'ciente' não pode enviar nem pedir confirmação");
    if (env.modal().aberto) doc.clicar(e("modalCancelar"));
    e("mnrAdCiente").checked = true; e("mnrAdData").value = iso(2);
    env.limparRegistro(); doc.clicar(e("mnrAdBotao")); await env.ocioso();
    confere(chamadas(env, "POST ministerio-menores/auto-denuncia").length === 0 && /futuro/.test(env.toasts().join("|")), "comunicar: data no futuro devia ser recusada na tela");
    e("mnrAdData").value = iso(-12);
    env.limparRegistro();
    let p = env.ev("(function(){ const b = document.getElementById('mnrAdBotao'); return mnrComunicarAcao(b); })()");
    let m = await env.responderModal(false); await esperar(p); await env.ocioso();
    confere(m.aberto && /[Nn]ão é punição/.test(m.texto) && /Diretoria Executiva/.test(m.texto), "comunicar: a confirmação devia explicar que não é punição");
    confere(chamadas(env, "POST ministerio-menores/auto-denuncia").length === 0, "comunicar: CANCELAR a confirmação não pode enviar");
    env.limparRegistro();
    p = env.ev("(function(){ const b = document.getElementById('mnrAdBotao'); return mnrComunicarAcao(b); })()");
    m = await env.responderModal(true); await esperar(p); await env.ocioso();
    const pa = chamadas(env, "POST ministerio-menores/auto-denuncia");
    confere(pa.length === 1 && pa[0].corpo.tipo === "INQUERITO_POLICIAL" && pa[0].corpo.dataCiencia === iso(-12) && pa[0].corpo.ciente === true && Object.keys(pa[0].corpo).length === 3, "comunicar: o POST devia levar só tipo, dataCiencia e ciente");
    confere(/Aguardando a decisão/.test(texto(env, "mnrAdAndamento")) && e("mnrAdFormCx").style.display === "none", "comunicar: depois de enviar devia mostrar o andamento (e não o formulário)");
    confere(/2 escala\(s\) futura\(s\)/.test(texto(env, "mnrAdMsg")), "comunicar: devia avisar das escalas desmarcadas");
    confere(env.toasts().length === 1, `comunicar: toast (${env.toasts().length})`);
    // decisão MANTIDO: mostra o rótulo e oferece comunicar um fato novo
    S.adAberta = F.autoDenunciaRow({ MembroId: 20, Decisao: "MANTIDO", DecididaEm: new Date(F.instante(-1)) });
    await env.ev("carregarMeuPainelMenoresAcao()"); await env.ocioso();
    confere(/Mantido: pode servir com menores/.test(texto(env, "mnrAdAndamento")) && e("mnrAdFormCx").style.display !== "none" && e("mnrAdDetalhes").open === false, "comunicar: decisão MANTIDO devia mostrar o rótulo e deixar comunicar fato novo (recolhido)");
    S.adAberta = F.autoDenunciaRow({ MembroId: 20, Decisao: "AFASTADO_PREVENTIVAMENTE", DecididaEm: new Date(F.instante(-1)) });
    await env.ev("carregarMeuPainelMenoresAcao()"); await env.ocioso();
    confere(/Afastado preventivamente/.test(texto(env, "mnrAdAndamento")) && e("mnrAdFormCx").style.display === "none", "comunicar: afastamento em vigor devia esconder o formulário");

    // -- menores sob minha responsabilidade
    const lista = texto(env, "mnrMenoresLista");
    confere(lista.includes("[menor1]") && lista.includes("[menor2]") && lista.includes("[estadoMsg]"), "menores: nomes e mensagens do servidor não aparecem");
    confere(!!botao(env, "Ler o texto e autorizar") && !!botao(env, "Revogar a autorização"), "menores: faltam os botões de autorizar/revogar");
    limpo(env, "Meu Painel/menores", [nomeMenor]);
    // autorizar: abre o texto (GET textos), caixa de ciência, botão só depois de marcar, hash do texto mostrado
    env.limparRegistro();
    const btnAut = botao(env, "Ler o texto e autorizar", e("mnrMenoresLista"));
    doc.clicar(btnAut); await env.ocioso();
    confere(chamadas(env, "GET consentimento-menor/textos").length === 1, "autorizar: devia buscar o texto no servidor ao abrir");
    const cx = achar(env, x => x.localName === "input" && /^mnrAutCaixa40_IMAGEM$/.test(x.id));
    const bt = e("mnrAutBotao40_IMAGEM");
    confere(!!cx && !!bt && bt.disabled === true && cx.getAttribute("data-texto-hash") === S2.hashTexto, "autorizar: caixa/botão (desabilitado) com o hash do texto mostrado");
    confere(texto(env, "mnrAutForm40_IMAGEM").includes("[txItem]") && texto(env, "mnrAutForm40_IMAGEM").includes("[txBase]") && /opcional/.test(texto(env, "mnrAutForm40_IMAGEM")), "autorizar: o texto (itens, base legal) e o aviso de que é opcional devem aparecer");
    limpo(env, "Meu Painel/texto de autorização", [ATAQUE("txItem")]);
    env.limparRegistro();
    await env.ev("mnrConcederAcao(40, 'IMAGEM', null)"); await env.ocioso();
    confere(chamadas(env, "POST consentimento-menor/conceder").length === 0 && /Marque a caixa/.test(texto(env, "mnrMenoresMsg")), "autorizar: sem a caixa marcada a ação NÃO pode enviar");
    // o texto muda enquanto a pessoa lê
    S2.hashTexto = "texto-novo";
    doc.marcar(cx, true); confere(bt.disabled === false, "autorizar: marcar a caixa devia habilitar o botão");
    env.limparRegistro();
    doc.clicar(bt); await env.ocioso();
    const pc = chamadas(env, "POST consentimento-menor/conceder");
    confere(pc.length === 1 && pc[0].corpo.menorId === 40 && typeof pc[0].corpo.menorId === "number" && pc[0].corpo.finalidade === "IMAGEM" && pc[0].corpo.aceito === true && pc[0].corpo.termoHash === ATAQUE("hashTexto"), "autorizar: POST com menorId NUMÉRICO, finalidade, aceito:true e o hash do texto que a tela mostrou");
    confere(chamadas(env, "GET consentimento-menor/textos").length === 1 && /foi atualizado/.test(texto(env, "mnrMenoresMsg")), "autorizar: termoMudou devia reabrir o texto novo e avisar");
    const cx2 = e("mnrAutCaixa40_IMAGEM");
    confere(cx2 && cx2.getAttribute("data-texto-hash") === "texto-novo" && cx2.checked === false && S2.concedidos === 0, "autorizar: depois do aviso a caixa volta desmarcada, com o hash novo, e nada foi autorizado");
    confere(env.toasts().length === 1, `autorizar: toast duplicado/ausente (${env.toasts().length})`);
    env.limparRegistro();
    doc.marcar(cx2, true); doc.clicar(e("mnrAutBotao40_IMAGEM")); await env.ocioso();
    const pc2 = chamadas(env, "POST consentimento-menor/conceder");
    confere(pc2.length === 1 && pc2[0].corpo.termoHash === "texto-novo" && S2.concedidos === 1, "autorizar: o texto novo devia ser autorizado com o hash novo");
    confere(/Autorização registrada/.test(texto(env, "mnrMenoresMsg")) && chamadas(env, "GET consentimento-menor/meus-menores").length === 1, "autorizar: devia mostrar a mensagem e recarregar a lista");
    // revogar: confirmação diz o efeito (foto apagada); cancelar não envia
    env.limparRegistro();
    const btnRev = botao(env, "Revogar a autorização", e("mnrMenoresLista"));
    doc.clicar(btnRev); m = await env.responderModal(false); await env.ocioso();
    confere(m.aberto && /saúde/.test(m.texto) && /apagada/.test(m.texto), "revogar: a confirmação devia dizer o efeito (a informação de saúde é apagada)");
    confere(chamadas(env, "POST consentimento-menor/revogar").length === 0, "revogar: cancelar não pode enviar");
    // a revogação da IMAGEM (menor 41 está REVOGADO; o 40 teve a imagem concedida agora, mas a lista é a do servidor): usa o botão do SAUDE_CRACHA e depois confere o texto da IMAGEM direto
    doc.clicar(btnRev); m = await env.responderModal(true); await env.ocioso();
    const pr = chamadas(env, "POST consentimento-menor/revogar");
    confere(pr.length === 1 && typeof pr[0].corpo.menorId === "number" && ["IMAGEM", "SAUDE_CRACHA"].includes(pr[0].corpo.finalidade) && Object.keys(pr[0].corpo).length === 2, "revogar: POST com menorId numérico e finalidade");
    confere(S2.revogados === 1 && /foi apagada/.test(texto(env, "mnrMenoresMsg")), "revogar: devia mostrar a mensagem do servidor (foto apagada)");
    env.limparRegistro();
    p = env.ev("mnrRevogarAcao(40, 'IMAGEM', null)"); m = await env.responderModal(false); await esperar(p);
    confere(/APAGADA/.test(m.texto) && /Você pode autorizar de novo/.test(m.texto), "revogar IMAGEM: a confirmação devia avisar que a foto será APAGADA");
    limpo(env, "Meu Painel/revogar", [nomeMenor]);

    // -- trava contra duplo clique (a mesma ação duas vezes seguidas)
    env.limparRegistro();
    const ficha2 = e("mnrFichaBotao"); e("mnrFichaMarca").checked = true;
    const dup = env.ev("(function(){ const b = document.getElementById('mnrFichaBotao'); return Promise.all([mnrConfirmarFichaAcao(b), mnrConfirmarFichaAcao(b)]); })()");
    await esperar(dup); await env.ocioso();
    confere(chamadas(env, "POST ministerio-menores/confirmar-ficha").length === 1, `duplo clique: devia sair UM pedido só (saíram ${chamadas(env, "POST ministerio-menores/confirmar-ficha").length})`);
    confere(/Aguarde/.test(env.toasts().join("|")) && ficha2.disabled === false, "duplo clique: devia avisar 'Aguarde' e soltar o botão no fim");

    confereAcessibilidade(env, ["subMeupainelMenores"], "Meu Painel");
    for (const id of ["mnrMeuResultado", "mnrPoliticaMsg", "mnrFichaMsg", "mnrAdMsg", "mnrMenoresMsg"]) confere(e(id) && e(id).getAttribute("role") === "status", `acessibilidade: ${id} sem role=status`);
  });

  cenario("Meu Painel: rede caída, sessão expirada e recusa de regra mostram a mensagem e soltam o botão", async () => {
    const env = ambienteAtual = novo(); const { doc, api, e } = env;
    api.rotas = {
      "GET ministerio-menores/catalogos": { corpo: F.catalogos({ gestao: false, geral: false, diretoria: false }) },
      "GET ministerio-menores/minha-situacao": { corpo: F.minhaSituacao({ sobre: { politicaVersaoAceita: null } }) },
      "GET ministerio-menores/politica": { corpo: F.politica(false) },
      "GET consentimento-menor/meus-menores": { corpo: F.menoresDoResponsavel([]) },
      "POST ministerio-menores/confirmar-ficha": { status: 422, corpo: { sucesso: false, mensagem: "A habilitação ainda não foi aberta: peça à Secretaria da congregação para iniciá-la." } },
      "POST ministerio-menores/aceitar-politica": { status: 401, corpo: { sucesso: false, mensagem: "Sessão inválida ou expirada." } }
    };
    env.sessao({ matricula: 20, pin: true });
    await env.ev("carregarMeuPainelMenoresAcao()"); await env.ocioso();
    confere(/não consta como responsável de nenhum menor/.test(texto(env, "mnrMenoresLista")), "menores: lista vazia devia explicar como ser cadastrado como responsável");
    // 422: mensagem do servidor, formulário intacto
    doc.marcar(e("mnrFichaMarca"), true); env.limparRegistro();
    doc.clicar(e("mnrFichaBotao")); await env.ocioso();
    confere(/ainda não foi aberta/.test(texto(env, "mnrFichaMsg")) && e("mnrFichaMarca").checked === true && e("mnrFichaBotao").disabled === false, "ficha: a recusa devia mostrar a mensagem, manter a caixa marcada e soltar o botão");
    // 401: o fetchProtegido real avisa (toast) e volta ao login; a tela mostra o texto sem outro toast
    doc.marcar(e("mnrPoliticaAceite"), true); env.limparRegistro();
    doc.clicar(e("mnrPoliticaBotao")); await env.ocioso();
    confere(/sessão expirou/i.test(texto(env, "mnrPoliticaMsg")) && e("mnrPoliticaBotao").disabled === false, "401: a tela devia mostrar 'sessão expirou' e soltar o botão");
    confere(env.toasts().length === 1 && env.g("window.__telaInicial") === 1, `401: um toast só e a volta ao login (toasts=${env.toasts().length})`);
    // rede caída
    env.sessao({ matricula: 20, pin: true }); api.redeCaida = true; env.limparRegistro();
    e("mnrFichaMarca").checked = true; doc.clicar(e("mnrFichaBotao")); await env.ocioso();
    confere(/Não foi possível falar com o servidor/.test(texto(env, "mnrFichaMsg")) && env.toasts().length === 1 && e("mnrFichaBotao").disabled === false, "rede caída: mensagem na tela, um toast e botão solto");
    api.redeCaida = false;
  });

  // ============================================================================================================================================
  // 2) TROCA DE LOGIN: o dado de quem saiu não fica na tela, e a resposta que chega atrasada não entra
  // ============================================================================================================================================
  cenario("Troca de login (PIN → senha): limpeza completa e resposta atrasada descartada", async () => {
    const env = ambienteAtual = novo(); const { doc, api, e } = env;
    const marca = (n) => ATAQUE(n);
    const rotasDe = (quem) => ({
      "GET ministerio-menores/catalogos": { corpo: F.catalogos({ gestao: quem === "B", geral: quem === "B", diretoria: quem === "B" }) },
      "GET ministerio-menores/minha-situacao": () => { const s = F.minhaSituacao({ equipes: [{ equipeId: 3, nome: marca(`equipe${quem}`) }] }); return { corpo: s }; },
      "GET ministerio-menores/politica": { corpo: F.politica(false) },
      "GET consentimento-menor/meus-menores": () => ({ corpo: F.menoresDoResponsavel([F.menorDaLista(quem === "A" ? 40 : 50, marca(`menor${quem}`), F.estados({}, { visitanteId: 20 }))]) }),
      "GET catalogos/congregacoes": { corpo: [{ congregacaoId: 2, nome: "Sede", ativa: true }] }
    });
    // A: membro por PIN
    api.rotas = rotasDe("A");
    env.sessao({ matricula: 20, pin: true });
    await env.ev("carregarMeuPainelMenoresAcao()"); await env.ocioso();
    confere(texto(env, "mnrSituacao").includes("[equipeA]") && texto(env, "mnrMenoresLista").includes("[menorA]"), "A: devia ter carregado os dados de A");
    e("mnrAdData").value = "2020-01-01"; e("mnrFichaMarca").checked = true; e("mnrAdCiente").checked = true;
    env.ev("mnrEl('mnrAdTipo').innerHTML = '<option value=\"X\">X</option>'; mnrEl('mnrAdTipo').value = 'X'");
    await env.ev("mnrAbrirAutorizacaoAcao(40, 'IMAGEM')").catch(() => {}); await env.ocioso();
    e("mnrMenoresMsg").textContent = "mensagem de A"; e("mnrMenoresMsg").className = "subtitle psc-aviso";
    // B: o MESMO navegador, agora com a senha de liderança (outra pessoa, outros papéis): abre a aba da Secretaria
    api.rotas = rotasDe("B");
    env.sessao({ matricula: 5, nivel: "GLOBAL", permissoes: ["habilitacao_voluntarios", "vistoria_antecedentes"], geral: true });
    await env.ev("carregarOpcoesMenoresAcao()"); await env.ocioso();
    const vazio = (id) => e(id).innerHTML === "";
    confere(["mnrSituacao", "mnrMenoresLista", "mnrPoliticaCx", "mnrAdAndamento", "mnrFichaValidade"].every(vazio), "troca de login: as listas do Meu Painel de A ainda estão na tela");
    confere(e("mnrAdData").value === "" && e("mnrFichaMarca").checked === false && e("mnrAdCiente").checked === false && e("mnrAdTipo").options.length === 0, "troca de login: campos e caixas de A ainda marcados/preenchidos");
    confere(e("mnrMenoresMsg").textContent === "" && !/psc-aviso/.test(e("mnrMenoresMsg").className), "troca de login: a mensagem em destaque de A ficou (caixa amarela)");
    confere(!env.doc.body.textContent.includes("[menorA]") && !env.doc.body.textContent.includes("[equipeA]"), "troca de login: sobrou dado de A em algum lugar da página");
    confere(e("mnrAdFormCx").style.display === "none", "troca de login: o formulário de comunicação de A continuou aberto");
    // a mesma pessoa, só trocando PIN por senha, também refaz a tela
    env.sessao({ matricula: 20, pin: true }); api.rotas = rotasDe("A");
    await env.ev("carregarMeuPainelMenoresAcao()"); await env.ocioso();
    env.sessao({ matricula: 20, nivel: "GLOBAL", permissoes: ["habilitacao_voluntarios"] });
    await env.ev("carregarOpcoesMenoresAcao()"); await env.ocioso();
    confere(vazio("mnrSituacao"), "PIN → senha da MESMA matrícula: a tela devia ser refeita (papéis diferentes)");
    // resposta atrasada: o pedido de A ainda está a caminho quando B entra
    const envB = novo();
    envB.api.rotas = rotasDe("A");
    envB.sessao({ matricula: 20, pin: true });
    const presa = envB.retem(c => c.chave === "GET ministerio-menores/minha-situacao");
    const pA = envB.ev("carregarMeuPainelMenoresAcao()");
    for (let i = 0; i < 30 && !presa.chegou; i++) await new Promise(r => setImmediate(r));
    envB.api.rotas = rotasDe("B"); envB.sessao({ matricula: 30, pin: true });
    await envB.ev("carregarMeuPainelMenoresAcao()"); await envB.ocioso();
    confere(envB.doc.body.textContent.includes("[equipeB]"), "atraso: os dados de B não chegaram");
    presa.liberar(); await pA; await envB.ocioso();
    confere(!envB.doc.body.textContent.includes("[equipeA]") && !envB.doc.body.textContent.includes("[menorA]"), "atraso: a resposta velha de A entrou na tela de B");
    // o mesmo atraso, mas B abre OUTRA tela do módulo (a aba da Secretaria): só a limpeza da troca de login invalida o pedido de A
    const envC = ambienteAtual = novo();
    envC.api.rotas = rotasDe("A");
    envC.sessao({ matricula: 20, pin: true });
    const presaC = envC.retem(c => c.chave === "GET ministerio-menores/minha-situacao");
    const pC = envC.ev("carregarMeuPainelMenoresAcao()");
    for (let i = 0; i < 30 && !presaC.chegou; i++) await new Promise(r => setImmediate(r));
    envC.api.rotas = rotasDe("B"); envC.sessao({ matricula: 5, nivel: "GLOBAL", permissoes: ["habilitacao_voluntarios"], geral: true });
    await envC.ev("carregarOpcoesMenoresAcao()"); await envC.ocioso();
    presaC.liberar(); await esperar(pC); await envC.ocioso();
    confere(!envC.doc.body.textContent.includes("[equipeA]") && !envC.doc.body.textContent.includes("[menorA]") && envC.e("mnrSituacao").innerHTML === "", "atraso (outra tela): a resposta velha de A entrou na tela depois que B entrou");
  });

  // ============================================================================================================================================
  // 3) ABA DA SECRETARIA: painel (mascarado × Diretoria), ferramentas
  // ============================================================================================================================================
  cenario("Aba Ministério com Menores: painel mascarado para a gestão e completo para a Diretoria", async () => {
    const env = ambienteAtual = novo(); const { doc, api, e } = env;
    const sede = { id: 2, nome: ATAQUE("sede") }, norte = { id: 3, nome: "Norte" };
    const linhas = [
      F.linha(41, ATAQUE("nome41"), sede, { vistoria: { vistoriaId: 9, resultado: "COM_RESTRICAO", dataVerificacao: iso(-5), documentos: [] } }, [{ equipeId: 3, nome: ATAQUE("equipeA"), liderMembroId: 9 }]),
      F.linha(42, "Beltrano", sede, { autoDenunciaAberta: true }),
      F.linha(43, "Ciclano", sede, { vistoria: { vistoriaId: 10, resultado: "SEM_RESTRICAO", dataVerificacao: iso(-10), documentos: [{ tipo: "ANTECEDENTES_FEDERAL", dataEmissao: iso(-150) }, { tipo: "ANTECEDENTES_ESTADUAL", dataEmissao: iso(-150) }] } }),   // vence em 30: VENCENDO
      F.linha(44, "Dulcineia", norte, {}),                                                                                      // APTO
      F.linha(45, "Eustáquio", norte, { fichaEm: iso(-200) })                                                                   // ficha vencida
    ];
    const semMarca = [{ equipeId: 8, nome: ATAQUE("infantil"), congregacaoId: 2, congregacaoNome: "Sede" }];
    let reservadoAgora = false;
    api.rotas = {
      "GET ministerio-menores/catalogos": () => ({ corpo: F.catalogos(reservadoAgora ? { gestao: true, geral: true, diretoria: true } : { gestao: true, geral: false, diretoria: false }) }),
      "GET catalogos/congregacoes": { corpo: [{ congregacaoId: 2, nome: sede.nome, ativa: true }, { congregacaoId: 3, nome: "Norte", ativa: true }] },
      "GET ministerio-menores/painel": (c) => ({ corpo: F.painel(linhas.filter(l => String(l.congregacaoId) === c.consulta.congregacaoId), { reservado: reservadoAgora, equipesSemMarca: semMarca }) }),
      "GET ministerio-menores/painel-geral": () => {
        const p = F.painel(linhas, { reservado: reservadoAgora, equipesSemMarca: semMarca });
        if (reservadoAgora) {   // rótulos, itens e códigos que chegam do servidor também são texto de ataque
          const v = p.voluntarios.find(x => x.membroId === 45);
          v.bloqueios[0].rotulo = ATAQUE("rotuloBloq"); if (v.proximoVencimento) v.proximoVencimento.rotulo = ATAQUE("rotuloProx");
          const w = p.voluntarios.find(x => x.membroId === 43); w.proximoVencimento.rotulo = ATAQUE("rotuloProx43"); w.validades.treinamento = { situacao: ATAQUE("sitVal"), modo: "MANUAL", validoAte: null };
          p.resumo.porMotivo[ATAQUE("motivoCod")] = 2;
        }
        return { corpo: p };
      }
    };
    // gestão da congregação (não é geral, não é Diretoria)
    env.sessao({ matricula: 7, nivel: "REGIONAL", permissoes: ["habilitacao_voluntarios"] });
    await env.ev("carregarOpcoesMenoresAcao()"); await env.ocioso();
    const opcoes = [...e("mnrPainelCong").options].map(o => o.value);
    confere(!opcoes.includes("TODAS"), "painel: 'campo inteiro' NÃO pode aparecer para quem não é do nível geral");
    confere(e("btnMnrSecaoComunicacoes").style.display === "none", "painel: a pílula das comunicações NÃO pode aparecer para quem não é da Diretoria");
    confere(e("btnMnrSecaoPainel").style.display !== "none" && e("btnMnrSecaoFerramentas").style.display !== "none", "painel: painel e ferramentas devem aparecer para a gestão");
    env.limparRegistro();
    doc.clicar(e("btnMnrSecaoPainel")); doc.clicar(botao(env, "Abrir o painel")); await env.ocioso();
    confere(chamadas(env, "GET ministerio-menores/painel").length === 0 && /Escolha a congregação/.test(texto(env, "mnrPainelResultado")), "painel: sem escolher a congregação não pode buscar");
    doc.escolher(e("mnrPainelCong"), "2"); doc.clicar(botao(env, "Abrir o painel")); await env.ocioso();
    const cp = chamadas(env, "GET ministerio-menores/painel");
    confere(cp.length === 1 && cp[0].consulta.congregacaoId === "2", "painel: devia pedir painel?congregacaoId=2");
    const painelTexto = () => texto(env, "mnrPainelResumo") + " " + texto(env, "mnrPainelPorCong") + " " + texto(env, "mnrPainelLista");
    const corpo = painelTexto();
    confere(corpo.includes(F.mm.ROTULO_BLOQUEIO.PENDENCIA_DIRETORIA), "painel mascarado: devia mostrar 'Pendência a tratar com a Diretoria Executiva'");
    confere(!corpo.includes(F.mm.ROTULO_BLOQUEIO.ANTECEDENTES_COM_RESTRICAO) && !corpo.includes(F.mm.ROTULO_BLOQUEIO.AUTO_DENUNCIA_EM_ANALISE) && !/ANTECEDENTES_COM_RESTRICAO|AUTO_DENUNCIA_EM_ANALISE/.test(corpo), "painel mascarado: a gestão NÃO pode ver o motivo reservado (restrição / comunicação em análise)");
    confere(!/com pendência \(fale com a Diretoria/.test(corpo) && corpo.includes("pendência com a Diretoria Executiva"), "painel mascarado: a validade das certidões devia dizer 'pendência com a Diretoria Executiva'");
    const resumo = texto(env, "mnrPainelResumo");
    confere(/Voluntários com menores/.test(resumo) && /Aptos/.test(resumo) && /Vencendo/.test(resumo) && /Bloqueados/.test(resumo), "painel: cartões do resumo ausentes");
    confere(resumo.includes("Por que estão bloqueados") && resumo.includes(F.mm.ROTULO_BLOQUEIO.PENDENCIA_DIRETORIA), "painel: a contagem por motivo (já mascarada pelo servidor) devia aparecer");
    confere(resumo.includes("Confira estas equipes") && resumo.includes("[infantil]"), "painel: o aviso de equipes sem a marca 'contato com menores' devia aparecer");
    const cards = [...e("mnrPainelLista").children].length;
    confere(cards === 3, `painel: devia listar as 3 pessoas da Sede (${cards})`);
    confere(texto(env, "mnrPainelLista").includes("Bloqueado") && texto(env, "mnrPainelLista").includes("Apto"), "painel: selos de status ausentes");
    confere(/Próximo vencimento/.test(texto(env, "mnrPainelLista")) && /faltam 30 dias/.test(texto(env, "mnrPainelLista")), "painel: o próximo vencimento (30 dias) devia aparecer com data e dias");
    limpo(env, "Painel (gestão)", [ATAQUE("nome41"), ATAQUE("equipeA"), ATAQUE("infantil")]);
    // filtro por status (só na tela)
    env.limparRegistro();
    doc.escolher(e("mnrPainelFiltro"), "BLOQUEADO");
    confere([...e("mnrPainelLista").children].length === 2 && chamadas(env, "GET ministerio-menores/painel").length === 0, "painel: o filtro 'só os bloqueados' devia mostrar 2 pessoas sem nova chamada");
    doc.escolher(e("mnrPainelFiltro"), "VENCENDO");
    confere([...e("mnrPainelLista").children].length === 1 && /Ciclano/.test(texto(env, "mnrPainelLista")), "painel: o filtro 'vencem logo' devia mostrar só quem vence");
    doc.escolher(e("mnrPainelFiltro"), "todos");

    // Diretoria geral: vê os códigos reais e o campo inteiro
    reservadoAgora = true;
    env.sessao({ matricula: 5, nivel: "GLOBAL", permissoes: ["habilitacao_voluntarios", "vistoria_antecedentes"], geral: true });
    await env.ev("carregarOpcoesMenoresAcao()"); await env.ocioso();
    confere([...e("mnrPainelCong").options].map(o => o.value).includes("TODAS"), "painel: o nível geral devia ter a opção 'campo inteiro'");
    confere(e("btnMnrSecaoComunicacoes").style.display !== "none", "painel: a Diretoria devia ver a pílula das comunicações");
    env.limparRegistro();
    doc.escolher(e("mnrPainelCong"), "TODAS"); doc.clicar(botao(env, "Abrir o painel")); await env.ocioso();
    confere(chamadas(env, "GET ministerio-menores/painel-geral").length === 1, "painel: 'campo inteiro' devia chamar painel-geral");
    const corpo2 = painelTexto();
    confere(corpo2.includes(F.mm.ROTULO_BLOQUEIO.ANTECEDENTES_COM_RESTRICAO) && corpo2.includes(F.mm.ROTULO_BLOQUEIO.AUTO_DENUNCIA_EM_ANALISE), "painel (Diretoria): devia mostrar os motivos reservados com todas as letras");
    confere(!!texto(env, "mnrPainelPorCong").includes("Por congregação") && [...e("mnrPainelLista").children].length === 5, "painel (campo inteiro): resumo por congregação e as 5 pessoas");
    limpo(env, "Painel (Diretoria)", [ATAQUE("sede"), ATAQUE("rotuloBloq"), ATAQUE("rotuloProx43"), ATAQUE("sitVal"), ATAQUE("motivoCod")]);

    // sem acesso nenhum (só a vistoria sem ser Diretoria): mensagem em vez de tela vazia
    api.rotas["GET ministerio-menores/catalogos"] = { corpo: F.catalogos({ gestao: false, geral: false, diretoria: false }) };
    env.sessao({ matricula: 6, nivel: "REGIONAL", permissoes: ["vistoria_antecedentes"] });
    await env.ev("carregarOpcoesMenoresAcao()"); await env.ocioso();
    confere(e("mnrSemAcesso").style.display !== "none" && e("btnMnrSecaoPainel").style.display === "none", "sem acesso: devia avisar e esconder as pílulas");
    confereAcessibilidade(env, ["abaMenores"], "Aba Menores");
    for (const id of ["mnrPainelResultado", "mnrRpMsg", "mnrFpMsg", "mnrFaixaMsg", "mnrFcMsg", "mnrComResultado", "mnrComAcaoMsg", "mnrSemAcesso"]) confere(e(id) && e(id).getAttribute("role") === "status", `acessibilidade: ${id} sem role=status`);
  });

  cenario("Aba Ministério com Menores: ferramentas (aceite em ficha, ficha cadastral, faixa, autorização em ficha)", async () => {
    const env = ambienteAtual = novo(); const { doc, api, e } = env;
    const S = { fichaConsulta: "ok" };
    api.rotas = {
      "GET ministerio-menores/catalogos": { corpo: F.catalogos({ gestao: true, geral: false, diretoria: false }) },
      "GET catalogos/congregacoes": { corpo: [{ congregacaoId: 2, nome: "Sede", ativa: true }] },
      "POST ministerio-menores/registrar-politica": (c) => ({ status: 201, corpo: { sucesso: true, mensagem: `Aceite de ${ATAQUE("quemAceitou")} registrado em ficha.` } }),
      "POST ministerio-menores/confirmar-ficha-pessoa": () => ({ corpo: { sucesso: true, mensagem: "Ficha confirmada. Ela vale por mais 6 meses." } }),
      "GET escalas/equipes": () => ({ corpo: { sucesso: true, equipes: [{ equipeId: 3, nome: ATAQUE("eqNome"), liderMembroId: 9, liderNome: "L", ativa: true, natureza: "FIXA" }, { equipeId: 4, nome: "Berçário", liderMembroId: 9, liderNome: "L", ativa: false, natureza: "FIXA" }] } }),
      "POST ministerio-menores/equipe-faixa": (c) => ({ corpo: { sucesso: true, faixa: c.corpo.faixa, mensagem: c.corpo.faixa ? `Faixa etária da equipe: ${F.mm.FAIXAS[c.corpo.faixa].rotulo}.` : "Faixa etária da equipe removida." } }),
      "GET consentimento-menor/menor": (c) => {
        if (c.consulta.menorId === "99") return { status: 404, corpo: { sucesso: false, mensagem: "Menor não encontrado." } };
        if (c.consulta.menorId === "60") return { corpo: F.menorGestao({ nome: ATAQUE("adulto"), idade: 25, aindaMenor: false }) };
        const est = F.estados({ IMAGEM: F.linhaConsent("IMAGEM", true, 20, { forma: "FICHA_FISICA", referencia: ATAQUE("refFicha") }) }, { paraGestao: true });
        const r = F.menorGestao({ nome: ATAQUE("menorNome"), estadosObj: est, responsaveis: [{ membroId: 20, nome: ATAQUE("respNome"), vinculo: "MAE", rotuloVinculo: "Mãe" }] });
        return { corpo: r };
      },
      "POST consentimento-menor/registrar-ficha": (c) => c.corpo.responsavelId === 20 && c.corpo.referencia === "Pasta 9" ? { status: 403, corpo: { sucesso: false, mensagem: "Quem registra a ficha não pode ser o próprio responsável que assinou: peça a outra pessoa da Secretaria." } } : { status: 201, corpo: { sucesso: true, fotoApagada: !c.corpo.concedido, mensagem: "Ficha registrada." } }
    };
    env.sessao({ matricula: 7, nivel: "REGIONAL", permissoes: ["habilitacao_voluntarios"] });
    await env.ev("carregarOpcoesMenoresAcao()"); await env.ocioso();
    doc.clicar(e("btnMnrSecaoFerramentas"));
    confere(e("mnrSecaoFerramentas").style.display === "block" && e("mnrSecaoPainel").style.display === "none", "ferramentas: devia trocar de seção");

    // aceite da política em ficha
    env.limparRegistro();
    doc.clicar(botao(env, "Registrar o aceite")); await env.ocioso();
    confere(chamadas(env, "POST ministerio-menores/registrar-politica").length === 0, "aceite em ficha: sem matrícula não pode enviar");
    e("mnrRpMatricula").value = "41"; e("mnrRpReferencia").value = "ab";
    doc.clicar(botao(env, "Registrar o aceite")); await env.ocioso();
    confere(chamadas(env, "POST ministerio-menores/registrar-politica").length === 0, "aceite em ficha: referência curta demais não pode enviar");
    e("mnrRpReferencia").value = "Pasta 3, ficha 12";
    env.limparRegistro();
    let p = env.ev("mnrRegistrarPoliticaAcao(document.getElementById('mnrRpMatricula'))"); let m = await env.responderModal(false); await esperar(p);
    confere(m.aberto && /matrícula 41/.test(m.texto) && chamadas(env, "POST ministerio-menores/registrar-politica").length === 0, "aceite em ficha: a confirmação devia citar a matrícula e CANCELAR não envia");
    env.limparRegistro();
    p = env.ev("mnrRegistrarPoliticaAcao(document.getElementById('mnrRpMatricula'))"); await env.responderModal(true); await esperar(p); await env.ocioso();
    const rp = chamadas(env, "POST ministerio-menores/registrar-politica");
    confere(rp.length === 1 && rp[0].corpo.membroId === 41 && typeof rp[0].corpo.membroId === "number" && rp[0].corpo.referencia === "Pasta 3, ficha 12", "aceite em ficha: POST com membroId NUMÉRICO e a referência");
    confere(texto(env, "mnrRpMsg").includes("[quemAceitou]") && e("mnrRpMatricula").value === "", "aceite em ficha: devia mostrar a mensagem do servidor e limpar o formulário");

    // confirmar a ficha de uma pessoa
    env.limparRegistro();
    e("mnrFpMatricula").value = "41"; e("mnrFpMarca").checked = false;
    doc.clicar(botao(env, "Confirmar a ficha", e("mnrSecaoFerramentas"))); await env.ocioso();
    confere(chamadas(env, "POST ministerio-menores/confirmar-ficha-pessoa").length === 0, "ficha de pessoa: sem a caixa não pode enviar");
    e("mnrFpMarca").checked = true;
    p = env.ev("mnrConfirmarFichaPessoaAcao(null)"); await env.responderModal(true); await esperar(p); await env.ocioso();
    const fp = chamadas(env, "POST ministerio-menores/confirmar-ficha-pessoa");
    confere(fp.length === 1 && fp[0].corpo.membroId === 41 && fp[0].corpo.confirmo === true, "ficha de pessoa: POST com membroId numérico e confirmo:true");

    // faixa etária da equipe
    env.limparRegistro();
    doc.escolher(e("mnrFaixaCong"), "2"); doc.clicar(botao(env, "Ver as equipes")); await env.ocioso();
    const ce = chamadas(env, "GET escalas/equipes");
    confere(ce.length === 1 && ce[0].consulta.congregacaoId === "2", "faixa: devia buscar escalas/equipes?congregacaoId=2");
    const opEq = [...e("mnrFaixaEquipe").options].map(o => o.textContent);
    confere(opEq.some(t => t.includes("[eqNome]")) && opEq.some(t => t.includes("(inativa)")), "faixa: as equipes (com 'inativa' marcada) devem estar no seletor");
    confere([...e("mnrFaixaValor").options].map(o => o.value).includes("MATERNAL") && [...e("mnrFaixaValor").options].map(o => o.value).includes("NENHUMA"), "faixa: o seletor devia ter as faixas do catálogo e a opção de remover");
    doc.clicar(botao(env, "Salvar a faixa")); await env.ocioso();
    confere(chamadas(env, "POST ministerio-menores/equipe-faixa").length === 0, "faixa: sem escolher não pode enviar");
    doc.escolher(e("mnrFaixaEquipe"), "3"); doc.escolher(e("mnrFaixaValor"), "MATERNAL");
    doc.clicar(botao(env, "Salvar a faixa")); await env.ocioso();
    const ef = chamadas(env, "POST ministerio-menores/equipe-faixa");
    confere(ef.length === 1 && ef[0].corpo.equipeId === 3 && typeof ef[0].corpo.equipeId === "number" && ef[0].corpo.faixa === "MATERNAL", "faixa: POST com equipeId numérico e a faixa");
    doc.escolher(e("mnrFaixaValor"), "NENHUMA"); env.limparRegistro();
    doc.clicar(botao(env, "Salvar a faixa")); await env.ocioso();
    const ef2 = chamadas(env, "POST ministerio-menores/equipe-faixa");
    confere(ef2.length === 1 && ef2[0].corpo.faixa === null && /removida/.test(texto(env, "mnrFaixaMsg")), "faixa: 'Nenhuma' devia mandar faixa:null");

    // autorização do responsável em ficha de papel
    env.limparRegistro();
    e("mnrFcMenor").value = "abc"; doc.clicar(botao(env, "Consultar")); await env.ocioso();
    confere(chamadas(env, "GET consentimento-menor/menor").length === 0 && /Informe a matrícula/.test(texto(env, "mnrFcMsg")), "ficha do responsável: matrícula inválida não consulta");
    e("mnrFcMenor").value = "99"; doc.clicar(botao(env, "Consultar")); await env.ocioso();
    confere(/não encontrado/i.test(texto(env, "mnrFcMsg")) && e("mnrFcForm").style.display === "none", "ficha do responsável: 404 devia mostrar a mensagem e não abrir o formulário");
    e("mnrFcMenor").value = "60"; doc.clicar(botao(env, "Consultar")); await env.ocioso();
    confere(texto(env, "mnrFcMenorInfo").includes("[adulto]") && /18 anos ou mais/.test(texto(env, "mnrFcMenorInfo")) && e("mnrFcForm").style.display === "none", "ficha do responsável: quem já tem 18 anos devia mostrar o aviso do servidor e não abrir o formulário");
    e("mnrFcMenor").value = "40"; env.limparRegistro(); doc.clicar(botao(env, "Consultar")); await env.ocioso();
    const cm = chamadas(env, "GET consentimento-menor/menor");
    confere(cm.length === 1 && cm[0].consulta.menorId === "40", "ficha do responsável: devia consultar menor?menorId=40");
    const info = texto(env, "mnrFcMenorInfo");
    confere(info.includes("[menorNome]") && info.includes("[respNome]") && info.includes("[refFicha]") && /Autorizado/.test(info) && /Não autorizado/.test(info), "ficha do responsável: nome, responsável, estados e referência da ficha devem aparecer");
    confere(e("mnrFcForm").style.display !== "none" && [...e("mnrFcResp").options].length === 2, "ficha do responsável: o formulário devia abrir com os responsáveis cadastrados");
    limpo(env, "Ferramentas", [ATAQUE("menorNome"), ATAQUE("respNome"), ATAQUE("refFicha"), ATAQUE("eqNome")]);
    // registrar: 403 do servidor aparece e o formulário fica
    doc.escolher(e("mnrFcResp"), "20"); doc.escolher(e("mnrFcFinalidade"), "IMAGEM"); doc.escolher(e("mnrFcAcao"), "revoga"); e("mnrFcRef").value = "Pasta 9";
    env.limparRegistro();
    p = env.ev("mnrRegistrarFichaAcao(null)"); m = await env.responderModal(true); await esperar(p); await env.ocioso();
    confere(/foto do menor será apagada/.test(m.texto) && /REVOGA/.test(m.texto), "ficha do responsável: revogar IMAGEM devia avisar que a foto é apagada");
    const rf = chamadas(env, "POST consentimento-menor/registrar-ficha");
    confere(rf.length === 1 && rf[0].corpo.menorId === 40 && rf[0].corpo.responsavelId === 20 && rf[0].corpo.finalidade === "IMAGEM" && rf[0].corpo.concedido === false && rf[0].corpo.referencia === "Pasta 9" && typeof rf[0].corpo.menorId === "number" && typeof rf[0].corpo.responsavelId === "number", "ficha do responsável: POST com ids numéricos, concedido:false e a referência");
    confere(/não pode ser o próprio responsável/.test(texto(env, "mnrFcMsg")) && e("mnrFcRef").value === "Pasta 9" && e("mnrFcForm").style.display !== "none", "ficha do responsável: 403 devia mostrar a mensagem do servidor e manter o formulário preenchido");
    env.limparRegistro(); doc.escolher(e("mnrFcAcao"), "concede"); e("mnrFcRef").value = "Pasta 10";
    p = env.ev("mnrRegistrarFichaAcao(null)"); await env.responderModal(true); await esperar(p); await env.ocioso();
    confere(chamadas(env, "POST consentimento-menor/registrar-ficha").length === 1 && /Ficha registrada/.test(texto(env, "mnrFcMsg")) && e("mnrFcRef").value === "", "ficha do responsável: devia registrar, mostrar a mensagem e limpar a referência");
    confere(chamadas(env, "GET consentimento-menor/menor").length === 1, "ficha do responsável: devia reconsultar o menor para mostrar o estado novo");
    confere(env.toasts().length === 1, `ficha do responsável: toast (${env.toasts().length})`);
  });

  // ============================================================================================================================================
  // 4) COMUNICAÇÕES DOS VOLUNTÁRIOS (Diretoria): decidir e liberar com a confirmação reforçada (428)
  // ============================================================================================================================================
  cenario("Comunicações da Diretoria: decidir/liberar, confirmação reforçada (428) e formulário que não se perde", async () => {
    const env = ambienteAtual = novo(); const { doc, api, e } = env;
    const S = { obsMin: 0 };
    const rows = () => [
      F.autoDenunciaRow({ AutoDenunciaId: 11, MembroId: 41, Nome: ATAQUE("nomeAD"), CongregacaoNome: ATAQUE("congAD") }),
      F.autoDenunciaRow({ AutoDenunciaId: 12, MembroId: 42, Nome: "Beltrano", Decisao: "AFASTADO_PREVENTIVAMENTE", DecididaEm: new Date(F.instante(-5)), DecisaoObservacao: ATAQUE("obsDec") }),
      F.autoDenunciaRow({ AutoDenunciaId: 13, MembroId: 5, Nome: "Eu mesmo (Diretoria)" }),
      F.autoDenunciaRow({ AutoDenunciaId: 14, MembroId: 44, Nome: "Dulcineia", Decisao: "MANTIDO", DecididaEm: new Date(F.instante(-9)), DecisaoObservacao: "tudo certo" })
    ];
    api.rotas = {
      "GET ministerio-menores/catalogos": { corpo: F.catalogos({ gestao: true, geral: true, diretoria: true }) },
      "GET catalogos/congregacoes": { corpo: [{ congregacaoId: 2, nome: "Sede", ativa: true }] },
      "GET ministerio-menores/auto-denuncias": (c) => ({ corpo: F.autoDenuncias(c.consulta.abertas === "1" ? rows().slice(0, 3) : rows()) }),
      "POST ministerio-menores/auto-denuncia-decidir": (c) => {
        if (c.corpo.autoDenunciaId === 12) return { status: 403, corpo: { sucesso: false, mensagem: "Ninguém decide sobre a própria comunicação: peça a outra pessoa da Diretoria." } };
        if (!api.fatorRecente) return { status: 428, corpo: { sucesso: false, precisaFator: true, mensagem: "Confirmação exigida pelo servidor." } };
        return { corpo: { sucesso: true, mensagem: "Decisão registrada: a pessoa fica afastada preventivamente do ministério com menores até a Diretoria levantar o afastamento." } };
      },
      "POST ministerio-menores/auto-denuncia-liberar": () => api.fatorRecente ? { corpo: { sucesso: true, mensagem: "Afastamento levantado: a pessoa volta a poder servir com menores, desde que a habilitação esteja em dia." } } : { status: 428, corpo: { sucesso: false, precisaFator: true, mensagem: "Este ato exige confirmação recente de quem você é." } }
    };
    env.ev("window.__fatorConfirmar = async () => { window.__fatorDecisao = window.__fatorDecisao === undefined ? true : window.__fatorDecisao; if (window.__fatorDecisao) { window.__api_fator(); } return window.__fatorDecisao; };");
    env.ctx.__api_fator = () => { api.fatorRecente = true; };
    env.sessao({ matricula: 5, nivel: "GLOBAL", permissoes: ["habilitacao_voluntarios", "vistoria_antecedentes"], geral: true });
    await env.ev("carregarOpcoesMenoresAcao()"); await env.ocioso();
    env.limparRegistro();
    doc.clicar(e("btnMnrSecaoComunicacoes")); await env.ocioso();
    const lc = chamadas(env, "GET ministerio-menores/auto-denuncias");
    confere(lc.length === 1 && lc[0].consulta.abertas === "1", "comunicações: devia abrir com 'só as abertas' (abertas=1)");
    const lista = texto(env, "mnrComLista");
    confere(lista.includes("[nomeAD]") && lista.includes("[congAD]") && /Inquérito policial/.test(lista) && /Aguardando a decisão/.test(lista) && /Afastado preventivamente/.test(lista), "comunicações: nome, congregação, tipo, data e situação devem aparecer");
    limpo(env, "Comunicações", [ATAQUE("nomeAD"), ATAQUE("obsDec")]);
    confere(botao(env, "Decidir…") && botao(env, "Liberar o afastamento…"), "comunicações: faltam os botões Decidir/Liberar");
    const cartaoProprio = achar(env, x => x.classList.contains("cal-cartao") && x.textContent.includes("Eu mesmo"));
    confere(cartaoProprio && !botao(env, "Decidir", cartaoProprio) && /própria comunicação/.test(cartaoProprio.textContent), "comunicações: a própria comunicação NÃO pode ter botão de decidir");
    // alternar 'só as abertas'
    env.limparRegistro(); doc.marcar(e("mnrComAbertas"), false); await env.ocioso();
    confere(chamadas(env, "GET ministerio-menores/auto-denuncias")[0].consulta.abertas === undefined && /Mantido/.test(texto(env, "mnrComLista")), "comunicações: desmarcar 'só as abertas' devia listar todas");
    doc.marcar(e("mnrComAbertas"), true); await env.ocioso();

    // decidir: formulário
    doc.clicar(botao(env, "Decidir…"));
    confere(!!e("mnrComObs11") && !!e("mnrComDecisao11") && /confirmação recente de quem você é/.test(texto(env, "mnrComForm11")), "decidir: o formulário devia abrir e avisar da confirmação reforçada");
    const decisoes = [...e("mnrComDecisao11").options].map(o => o.value);
    confere(decisoes.includes("MANTIDO") && decisoes.includes("AFASTADO_PREVENTIVAMENTE"), "decidir: as duas decisões do catálogo");
    // sem observação (ou curta): NÃO pode nem pedir a confirmação reforçada
    env.limparRegistro(); env.ctx.__fatorPedidos = 0;
    doc.escolher(e("mnrComDecisao11"), "AFASTADO_PREVENTIVAMENTE"); e("mnrComObs11").value = "curta";
    let m; let p = env.ev("mnrConfirmarDecisaoAcao(11, 'decidir', null)"); await esperar(p); await env.ocioso();
    confere(chamadas(env, "POST ministerio-menores/auto-denuncia-decidir").length === 0 && !env.modal().aberto && env.ctx.__fatorPedidos === 0, "decidir: observação curta devia ser recusada ANTES de qualquer chamada (nada de confirmação de identidade à toa)");
    doc.digitar(e("mnrComObs11"), "Afastamento por cautela até esclarecer o procedimento.");
    confere(e("mnrComContador11").textContent === String("Afastamento por cautela até esclarecer o procedimento.".length), "decidir: o contador de caracteres devia acompanhar");
    // cancelar a confirmação do app: nada é enviado
    env.limparRegistro();
    p = env.ev("mnrConfirmarDecisaoAcao(11, 'decidir', null)"); m = await env.responderModal(false); await esperar(p);
    confere(m.aberto && m.texto.includes("[nomeAD]") && chamadas(env, "POST ministerio-menores/auto-denuncia-decidir").length === 0, "decidir: cancelar a confirmação não pode enviar");
    // 428 e a pessoa DESISTE da confirmação (fecha o pedido de chave/código): a mensagem aparece e o formulário continua aberto com o texto
    env.limparRegistro(); env.ev("window.__fatorDecisao = false"); api.fatorRecente = false;
    p = env.ev("mnrConfirmarDecisaoAcao(11, 'decidir', document.getElementById('mnrComObs11'))"); m = await env.responderModal(true); await esperar(p); await env.ocioso();
    const dec1 = chamadas(env, "POST ministerio-menores/auto-denuncia-decidir");
    confere(dec1.length === 1 && dec1[0].corpo.decisao === "AFASTADO_PREVENTIVAMENTE" && dec1[0].corpo.autoDenunciaId === 11 && typeof dec1[0].corpo.autoDenunciaId === "number" && env.ctx.__fatorPedidos === 1, "428: a primeira chamada vai, o fetchProtegido pede a confirmação, e (sem ela) a chamada NÃO é repetida");
    confere(/confirmação recente de quem você é/.test(texto(env, "mnrComAcaoMsg")) && /Tente de novo e confirme/.test(texto(env, "mnrComAcaoMsg")), "428: a mensagem (em português simples) de que falta a confirmação devia aparecer na tela");
    confere(!!e("mnrComObs11") && e("mnrComObs11").value.startsWith("Afastamento por cautela") && !!e("mnrComDecisao11") && e("mnrComDecisao11").value === "AFASTADO_PREVENTIVAMENTE", "428: o formulário devia continuar ABERTO com o que foi escrito");
    confere(env.toasts().length === 0 || env.toasts().length === 1, "428: no máximo um toast");
    // agora a pessoa confirma (chave/código): a chamada é repetida UMA vez e dá certo
    env.limparRegistro(); env.ev("window.__fatorDecisao = true"); env.ctx.__fatorPedidos = 0;
    const btnDec = botao(env, "Registrar a decisão", e("mnrComForm11"));
    p = env.ev("mnrConfirmarDecisaoAcao(11, 'decidir', null)"); m = await env.responderModal(true); await esperar(p); await env.ocioso();
    const dec2 = chamadas(env, "POST ministerio-menores/auto-denuncia-decidir");
    confere(dec2.length === 2 && dec2[0].semFator === true && dec2[1].semFator === true && env.ctx.__fatorPedidos === 1, `428: devia tentar, pedir UMA confirmação e repetir UMA vez (chamadas=${dec2.length}, pedidos=${env.ctx.__fatorPedidos})`);
    confere(/Decisão registrada/.test(texto(env, "mnrComAcaoMsg")) && chamadas(env, "GET ministerio-menores/auto-denuncias").length === 1, "decidir: depois de confirmar devia mostrar a mensagem e recarregar a lista");
    confere(e("mnrComForm11").innerHTML === "", "decidir: depois do sucesso o formulário devia fechar (lista refeita)");
    confere(env.toasts().length === 1, `decidir: toast duplicado (${env.toasts().length})`);
    // 403 (a própria comunicação): a mensagem do servidor aparece
    env.limparRegistro();
    doc.clicar(botao(env, "Liberar o afastamento…"));
    confere(!!e("mnrComObs12") && !e("mnrComDecisao12"), "liberar: o formulário não tem o campo de decisão");
    doc.digitar(e("mnrComObs12"), "Esclarecido: o procedimento foi arquivado.");
    env.limparRegistro(); api.fatorRecente = false; env.ev("window.__fatorDecisao = true");
    p = env.ev("mnrConfirmarDecisaoAcao(12, 'liberar', null)"); m = await env.responderModal(true); await esperar(p); await env.ocioso();
    const lib = chamadas(env, "POST ministerio-menores/auto-denuncia-liberar");
    confere(lib.length === 2 && lib[0].corpo.observacao.startsWith("Esclarecido") && !("decisao" in lib[0].corpo) && /levantado/.test(texto(env, "mnrComAcaoMsg")), "liberar: 428 → confirmação → repetição, e a mensagem do servidor");
    confere(/Levantar o afastamento/.test(m.texto) && /Beltrano/.test(m.texto), "liberar: a confirmação do app devia citar a pessoa");
    limpo(env, "Comunicações (depois dos atos)", []);
  });

  // ============================================================================================================================================
  // 5) ESCALAS
  // ============================================================================================================================================
  cenario("Escalas: salas com menores, crianças previstas, publicar com 422 e a faixa etária da equipe", async () => {
    const env = ambienteAtual = novo(); const { doc, api, e } = env;
    const sala = (extra) => F.salaDe(Object.assign({ equipeId: 3, equipeNome: ATAQUE("salaMaternal"), faixa: "MATERNAL", criancasPrevistas: 12, adultos: 2 }, extra));
    const S = { salas: [sala(), F.salaDe({ equipeId: 6, equipeNome: ATAQUE("salaJun"), faixa: null, criancasPrevistas: null, adultos: 1, semHabilitacao: [ATAQUE("semHab")] })], status: "RASCUNHO", salvou: 0 };
    api.rotas = {
      "GET ministerio-menores/catalogos": { corpo: F.catalogos({ gestao: false, geral: false, diretoria: false }) },
      "GET escalas/servicos-detalhe": () => ({ corpo: F.servicoDetalhe(S.salas, S.status) }),
      "POST escalas/criancas-previstas": (c) => { S.salvou++; S.salas[0] = sala({ criancasPrevistas: c.corpo.criancas }); return { corpo: { sucesso: true, criancas: c.corpo.criancas, mensagem: `Crianças previstas: ${c.corpo.criancas}.` } }; },
      "POST escalas/publicar": () => { const m = F.menoresDoServico(S.salas); return m.ok ? { corpo: { sucesso: true, mensagem: "✅ Escala publicada." } } : { status: 422, corpo: { sucesso: false, mensagem: `Não dá para publicar: ${m.problemas.map(p => p.mensagem).join(" ")}`, problemas: m.problemas, salas: m.salas } }; },
      "GET escalas/servicos": { corpo: { sucesso: true, servicos: [] } },
      "GET habilitacao-voluntarios/equipes-flag": { corpo: { sucesso: true, equipes: [{ equipeId: 3, nome: ATAQUE("hvMaternal"), contatoComMenores: true }, { equipeId: 5, nome: "Louvor", contatoComMenores: false }] } },
      "GET habilitacao-voluntarios/lista": { corpo: { sucesso: true, habilitacoes: [] } },
      "POST ministerio-menores/equipe-faixa": (c) => ({ corpo: { sucesso: true, faixa: c.corpo.faixa, mensagem: `Faixa etária da equipe: ${c.corpo.faixa}.` } })
    };
    env.sessao({ matricula: 5, nivel: "GLOBAL", permissoes: ["escalas"], geral: true });
    await env.ev("abrirServicoEscalaAcao(5)"); await env.ocioso();
    const det = texto(env, "painelDetalheServicoEscala");
    confere(det.includes("Salas com menores") && det.includes("[salaMaternal]") && det.includes("[salaJun]"), "escalas: o detalhe devia mostrar as salas com menores");
    confere(/de 3 necessários/.test(det) && /Maternal \(3 a 5 anos\)/.test(det), "escalas: adultos × necessários (12 crianças no Maternal pedem 3) e a faixa pelo rótulo");
    confere(/✗/.test(det) && /Falta ajustar/.test(det) && /não definida/.test(det), "escalas: ✗, 'falta ajustar' e faixa não definida devem aparecer");
    confere(det.includes("[semHab]") && /Defina a faixa etária/.test(det) && /Vá em Habilitação de Voluntários/.test(det), "escalas: os problemas em português (e como resolver) devem aparecer por sala");
    const campo = e("escCriancas5_3");
    confere(!!campo && campo.value === "12" && e("escCriancas5_6").value === "", "escalas: o campo de crianças previstas deve vir preenchido (12) ou vazio (sem número)");
    limpo(env, "Escalas/detalhe", [ATAQUE("salaMaternal"), ATAQUE("semHab")]);
    // salvar: validação e POST
    env.limparRegistro();
    campo.value = "abc"; doc.clicar(botao(env, "Salvar", e("painelDetalheServicoEscala")));
    await env.ocioso();
    confere(chamadas(env, "POST escalas/criancas-previstas").length === 0 && env.toasts().length === 1, "crianças: valor inválido não pode enviar");
    env.limparRegistro(); campo.value = "250"; doc.clicar(botao(env, "Salvar", e("painelDetalheServicoEscala"))); await env.ocioso();
    confere(chamadas(env, "POST escalas/criancas-previstas").length === 0, "crianças: 250 (acima de 200) não pode enviar");
    env.limparRegistro(); e("escCriancas5_3").value = "15"; doc.clicar(botao(env, "Salvar", e("painelDetalheServicoEscala"))); await env.ocioso();
    const pc = chamadas(env, "POST escalas/criancas-previstas");
    confere(pc.length === 1 && pc[0].corpo.servicoId === 5 && pc[0].corpo.equipeId === 3 && pc[0].corpo.criancas === 15 && ["servicoId", "equipeId", "criancas"].every(k => typeof pc[0].corpo[k] === "number"), "crianças: POST com servicoId, equipeId e criancas NUMÉRICOS");
    confere(chamadas(env, "GET escalas/servicos-detalhe").length === 1 && /de 3 necessários/.test(texto(env, "painelDetalheServicoEscala")) && e("escCriancas5_3").value === "15", "crianças: devia recarregar o detalhe com o número novo");
    confere(env.toasts().length === 1, `crianças: toast (${env.toasts().length})`);
    // publicar com a sala fora da regra (422 com problemas)
    env.limparRegistro();
    await env.ev("publicarEscalaAcao(5)"); await env.ocioso();
    const alerta = achar(env, x => x.getAttribute("role") === "alert");
    confere(!!alerta && /Não dá para publicar ainda/.test(alerta.textContent) && alerta.textContent.includes("[semHab]") && /Defina a faixa etária/.test(alerta.textContent), "publicar 422: a lista de problemas devia aparecer no detalhe (role=alert)");
    confere([...alerta.descendentes()].filter(x => x.localName === "li").length === F.menoresDoServico(S.salas).problemas.length, "publicar 422: um item para CADA problema");
    confere(env.toasts().length === 1 && env.toasts()[0].length < 120, "publicar 422: um toast curto (a lista inteira fica na tela, não no toast)");
    limpo(env, "Escalas/publicar", [ATAQUE("semHab")]);
    // sala em ordem: publica
    S.salas = [sala({ adultos: 3 })]; env.limparRegistro();
    await env.ev("publicarEscalaAcao(5)"); await env.ocioso();
    confere(/Escala publicada/.test(env.toasts().join("|")) && !achar(env, x => x.getAttribute("role") === "alert"), "publicar: sala em ordem devia publicar sem a lista de problemas");
    // Habilitação: seletor de faixa só ao lado das equipes com a marca
    env.limparRegistro();
    e("hvCongregacao").innerHTML = '<option value="2">Sede</option>'; e("hvCongregacao").value = "2";
    await env.ev("carregarEquipesFlagAcao()"); await env.ocioso();
    confere(!!e("hvFaixa3") && !e("hvFaixa5"), "habilitação: o seletor de faixa só aparece para a equipe COM a marca 'contato com menores'");
    confere([...e("hvFaixa3").options].map(o => o.value).includes("BERCARIO") && [...e("hvFaixa3").options].map(o => o.value).includes("NENHUMA"), "habilitação: o seletor deve ter as faixas do catálogo");
    limpo(env, "Habilitação/faixa", [ATAQUE("hvMaternal")]);
    env.limparRegistro();
    doc.clicar(botao(env, "Salvar a faixa", e("painelEquipesFlag"))); await env.ocioso();
    confere(chamadas(env, "POST ministerio-menores/equipe-faixa").length === 0, "habilitação: sem escolher a faixa não pode enviar");
    confere(env.toasts().length === 1, "habilitação: a recusa de faixa em branco devia avisar uma vez");
    env.limparRegistro();
    doc.escolher(e("hvFaixa3"), "JUNIORES"); doc.clicar(botao(env, "Salvar a faixa", e("painelEquipesFlag"))); await env.ocioso();
    const ef = chamadas(env, "POST ministerio-menores/equipe-faixa");
    confere(ef.length === 1 && ef[0].corpo.equipeId === 3 && typeof ef[0].corpo.equipeId === "number" && ef[0].corpo.faixa === "JUNIORES", "habilitação: POST com equipeId numérico e a faixa");
    confere(env.toasts().length === 1, `habilitação: toast (${env.toasts().length})`);
    confereAcessibilidade(env, ["painelDetalheServicoEscala", "painelEquipesFlag"], "Escalas");
  });

  // ============================================================================================================================================
  // 6) FOTO DE MENOR
  // ============================================================================================================================================
  cenario("Foto: menor sem autorização do responsável não vê o envio (a própria e a da Secretaria)", async () => {
    const env = ambienteAtual = novo(); const { doc, api, e } = env;
    const S = { menor: true, consentimento: false, post: 0 };
    api.rotas = {
      "GET minha-foto/20": () => ({ corpo: { sucesso: true, fotoUrl: null, consentimentoConcedido: S.consentimento, menorDeIdade: S.menor } }),
      "POST minha-foto/20": () => { S.post++; return { corpo: { sucesso: true, mensagem: "✅ Foto atualizada.", fotoUrl: null } }; },
      "GET consentimento-menor/menor": (c) => c.consulta.menorId === "70" ? { status: 404, corpo: { sucesso: false, mensagem: "Menor não encontrado." } }
        : { corpo: F.menorGestao({ nome: "Pedro", estadosObj: F.estados(c.consulta.menorId === "71" ? { IMAGEM: F.linhaConsent("IMAGEM", true) } : {}, { paraGestao: true }) }) }
    };
    api.rotas["GET minha-foto/20"] = api.rotas["GET minha-foto/20"];
    env.sessao({ matricula: 20, pin: true });
    // a própria foto
    await env.ev("carregarMinhaFoto()"); await env.ocioso();
    confere(e("minhaFotoEnvio").style.display === "none", "foto própria: menor SEM autorização do responsável não pode ver o envio");
    confere(/menos de 18 anos/.test(texto(env, "minhaFotoAvisoMenor")) && /Meu Painel → Ministério com menores/.test(texto(env, "minhaFotoAvisoMenor")) && /Exemplo/.test(texto(env, "minhaFotoAvisoMenor")) && /psc-aviso/.test(e("minhaFotoAvisoMenor").className), "foto própria: devia explicar que o responsável precisa autorizar (e onde), com exemplo");
    e("minhaFotoArquivo").files = [{ name: "foto.jpg", size: 1000 }];   // há um arquivo escolhido: só a trava do menor impede o envio
    env.limparRegistro(); await env.ev("enviarMinhaFotoAcao()"); await env.ocioso();
    confere(S.post === 0, "foto própria: o envio não pode sair mesmo chamado direto");
    S.consentimento = true; await env.ev("carregarMinhaFoto()"); await env.ocioso();
    confere(e("minhaFotoEnvio").style.display === "" && /responsável autorizou/.test(texto(env, "minhaFotoAvisoMenor")), "foto própria: com a autorização do responsável o envio volta");
    S.menor = false; S.consentimento = false; await env.ev("carregarMinhaFoto()"); await env.ocioso();
    confere(e("minhaFotoEnvio").style.display === "" && texto(env, "minhaFotoAvisoMenor") === "", "foto própria: adulto vê o envio e nenhum aviso");
    // troca de pessoa: o aviso de um menor não vale para o próximo login
    S.menor = true; await env.ev("carregarMinhaFoto()"); await env.ocioso();
    confere(e("minhaFotoEnvio").style.display === "none", "foto própria: (preparo) menor de novo");
    S.menor = false; env.sessao({ matricula: 21, pin: true }); api.rotas["GET minha-foto/21"] = { corpo: { sucesso: true, fotoUrl: null, consentimentoConcedido: false, menorDeIdade: false } };
    // enquanto a resposta da outra pessoa não chega, o aviso e o bloqueio do menor anterior não podem ficar na tela dela
    const presa21 = env.retem(c => c.chave === "GET minha-foto/21");
    const p21 = env.ev("carregarMinhaFoto()");
    for (let i = 0; i < 30 && !presa21.chegou; i++) await new Promise(r => setImmediate(r));
    confere(e("minhaFotoEnvio").style.display === "" && texto(env, "minhaFotoAvisoMenor") === "", "foto própria: o aviso/bloqueio do menor anterior sobrou para a outra pessoa enquanto a resposta dela não chega");
    presa21.liberar(); await esperar(p21); await env.ocioso();
    confere(e("minhaFotoEnvio").style.display === "" && texto(env, "minhaFotoAvisoMenor") === "", "foto própria: outra pessoa por cima do menor vê o envio e nenhum aviso");

    // a foto na Secretaria (aba Foto de Pessoas)
    const nasc = (anos) => `${Number(F.hoje.slice(0, 4)) - anos}-01-15`;
    env.ctx._pessoasCache = [{ membroId: 71, nome: "A", dataNascimento: nasc(10), fotoUrl: null }, { membroId: 72, nome: "B", dataNascimento: nasc(40), fotoUrl: null }, { membroId: 70, nome: "C", dataNascimento: nasc(12), fotoUrl: null }, { membroId: 73, nome: "D", dataNascimento: nasc(9), fotoUrl: null }, { membroId: 74, nome: "E", dataNascimento: null, fotoUrl: null }];
    env.ev("window._pessoasCache = this._pessoasCache; window._membroFotoAtual = 73;");
    api.rotas["GET lgpd/consentimento/72"] = { corpo: { sucesso: true, consentimentos: [{ tipo: "FOTO", concedido: true, dataRegistro: "2026-01-01" }] } };
    api.rotas["GET lgpd/consentimento/74"] = { corpo: { sucesso: true, consentimentos: [] } };
    env.limparRegistro();
    env.ev("window._membroFotoAtual = 73"); api.rotas["GET consentimento-menor/menor"] = api.rotas["GET consentimento-menor/menor"];
    await env.ev("carregarAbaFoto(73)"); await env.ocioso();
    confere(e("fotoMembroEnvio").style.display === "none" && /menos de 18 anos/.test(texto(env, "fotoMembroAvisoMenor")) && texto(env, "fotoMembroStatusConsentimento") === "", "foto (Secretaria): menor sem autorização do responsável: sem envio e com o aviso (e sem a linha do consentimento genérico)");
    confere(chamadas(env, "GET lgpd/consentimento/73").length === 0, "foto (Secretaria): para menor não se consulta o consentimento genérico de Foto");
    env.ev("window._membroFotoAtual = 71"); await env.ev("carregarAbaFoto(71)"); await env.ocioso();
    confere(e("fotoMembroEnvio").style.display === "" && /responsável autorizou/.test(texto(env, "fotoMembroAvisoMenor")), "foto (Secretaria): menor COM autorização do responsável: envio liberado");
    env.ev("window._membroFotoAtual = 70"); await env.ev("carregarAbaFoto(70)"); await env.ocioso();
    confere(e("fotoMembroEnvio").style.display === "" && /menos de 18 anos/.test(texto(env, "fotoMembroAvisoMenor")), "foto (Secretaria): se o estado não pode ser lido (404) explica e deixa o servidor decidir");
    env.ev("window._membroFotoAtual = 72"); env.limparRegistro(); await env.ev("carregarAbaFoto(72)"); await env.ocioso();
    confere(e("fotoMembroEnvio").style.display === "" && texto(env, "fotoMembroAvisoMenor") === "" && /Consentimento de Foto concedido/.test(texto(env, "fotoMembroStatusConsentimento")) && chamadas(env, "GET consentimento-menor/menor").length === 0, "foto (Secretaria): adulto segue como sempre, sem consultar o consentimento de menor");
    env.ev("window._membroFotoAtual = 74"); env.limparRegistro(); await env.ev("carregarAbaFoto(74)"); await env.ocioso();
    confere(chamadas(env, "GET consentimento-menor/menor").length === 0 && e("fotoMembroEnvio").style.display === "", "foto (Secretaria): sem data de nascimento não se presume menor");
  });

  // ============================================================================================================================================
  // 7) MEUS DADOS (LGPD)
  // ============================================================================================================================================
  cenario("Meus Dados: os dois blocos novos, com rótulos em português e tudo escapado", async () => {
    const env = ambienteAtual = novo(); const { doc, api, e } = env;
    const A = ATAQUE;
    const comunicacoes = [F.mmDb.mapearAutoDenuncia(F.autoDenunciaRow({ AutoDenunciaId: 11, MembroId: 20, Decisao: "AFASTADO_PREVENTIVAMENTE", DecididaEm: new Date(F.instante(-4)), DecisaoObservacao: A("decObs"), LiberadoEm: new Date(F.instante(-1)), LiberacaoObservacao: A("libObs") }))];
    const dados = {
      sucesso: true, geradoEm: new Date().toISOString(),
      membro: { nome: A("nomeM"), congregacao: "Sede", extensao: null, status: "ATIVO", situacaoMembro: "ATIVO", fotoUrl: null, funcao: "x", cargoMinisterial: null, departamento: null, dizimistaFiel: 1, criadoEm: F.instante(-400) },
      liderancas: [], assentos: [], processosDisciplinares: [], vinculosFamiliares: [], consentimentos: [], solicitacoesLgpd: [], casamentos: [], licencasCandidatura: [], voluntariado: null,
      consentimentosMenores: {
        comoResponsavel: [{ menor: A("menorR"), finalidade: A("finR"), situacao: "Autorizou", textoVersao: 1, textoHash: "h", forma: A("formaR"), registradoEm: F.instante(-2), referencia: null, registradaPelaSecretaria: false, enderecoIp: A("ipR"), cadeiaCabecalhos: null }],
        comoMenor: [{ responsavel: A("respM"), finalidade: "Uso da imagem (foto) no cadastro, no crachá e em materiais internos", situacao: "Revogou", textoVersao: 1, textoHash: "h", forma: "Ficha assinada pelo responsável, registrada pela Secretaria", registradoEm: F.instante(-30), referencia: A("refM"), registradaPelaSecretaria: true }],
        aviso: A("avisoC")
      },
      ministerioMenores: {
        politicaDeComunicacao: [{ versao: 1, forma: "CLICKWRAP", aceitoEm: F.instante(-20), enderecoIp: A("ipP"), referencia: null }, { versao: 1, forma: "FICHA_FISICA", aceitoEm: F.instante(-40), enderecoIp: null, referencia: A("refP") }],
        fichaConfirmadaEm: F.instante(-10), retiradasDaEscala: [{ equipe: A("eqRet"), em: F.instante(-6), escalasDesmarcadas: 3 }], comunicacoesADiretoria: comunicacoes,
        consultasAoCadastroNacional: [{ fonte: A("fonte"), resultado: "NADA_CONSTA", em: F.instante(-5) }], aviso: A("avisoM")
      }
    };
    api.rotas = { "GET lgpd/meus-dados/20": { corpo: dados } };
    env.sessao({ matricula: 20, pin: true });
    e("cxMeusDadosLGPD").style.display = "none";
    await env.ev("alternarMeusDadosLGPD()"); await env.ocioso();
    const t = texto(env, "cxMeusDadosLGPD");
    confere(t.includes("Autorizações de responsável (menores)") && t.includes("Autorizou") && t.includes("Revogou") && t.includes("registrada pela Secretaria"), "Meus Dados: bloco das autorizações de responsável (como responsável e como menor)");
    confere(t.includes("Ministério com menores") && t.includes("Aceite digital (com IP, data e hora)") && t.includes("Ficha assinada, registrada pela Secretaria"), "Meus Dados: formas da política em português");
    confere(t.includes("Ficha cadastral confirmada em") && /Retiradas automáticas da escala/.test(t) && /3 escala\(s\) desmarcada\(s\)/.test(t), "Meus Dados: ficha confirmada e retiradas da escala");
    confere(/Comunicações que você fez à Diretoria/.test(t) && /Afastamento levantado/.test(t) && /Inquérito policial/.test(t), "Meus Dados: comunicações à Diretoria (situação em português)");
    confere(/nada consta/.test(t), "Meus Dados: consulta ao cadastro nacional traduzida");
    limpo(env, "Meus Dados", ["decObs", "libObs", "ipR", "formaR", "refM", "refP", "ipP", "eqRet", "fonte", "avisoC", "avisoM"].map(A));
    // sem nenhum dado desses blocos: nada aparece
    dados.consentimentosMenores = { comoResponsavel: [], comoMenor: [], aviso: "x" }; dados.ministerioMenores = { politicaDeComunicacao: [], fichaConfirmadaEm: null, retiradasDaEscala: [], comunicacoesADiretoria: [], consultasAoCadastroNacional: [], aviso: "y" };
    e("cxMeusDadosLGPD").style.display = "none";
    await env.ev("alternarMeusDadosLGPD()"); await env.ocioso();
    confere(!/Autorizações de responsável|Ministério com menores/.test(texto(env, "cxMeusDadosLGPD")), "Meus Dados: sem dados, os blocos não aparecem");
    // resposta de API antiga (sem os blocos): não quebra
    delete dados.consentimentosMenores; delete dados.ministerioMenores;
    e("cxMeusDadosLGPD").style.display = "none";
    await env.ev("alternarMeusDadosLGPD()"); await env.ocioso();
    confere(/Dados Cadastrais/.test(texto(env, "cxMeusDadosLGPD")), "Meus Dados: sem os blocos novos a tela continua inteira");
  });

  // ============================================================================================================================================
  const alvo = so ? cenarios.filter(c => c.nome.includes(so)) : cenarios;
  for (const c of alvo) {
    T.cenarioAtual = c.nome.split(":")[0].slice(0, 30);
    const antes = T.falhas.length;
    try { await c.fn(); } catch (e) { T.falhas.push(`${T.cenarioAtual}: EXCEÇÃO no roteiro: ${e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e}`); }
    T.cenarios.push({ nome: c.nome, falhas: T.falhas.length - antes });
    if (verboso) console.log(`${T.falhas.length === antes ? "ok  " : "FALHA"} ${c.nome}`);
  }
  return T;
}

module.exports = { rodar };
if (require.main === module) {
  rodar({ verboso: true, so: process.argv[2] || null }).then(T => {
    console.log(`\nverificações: ${T.total}  falhas: ${T.falhas.length}`);
    T.falhas.forEach(f => console.log("  ✗ " + f));
    process.exit(T.falhas.length ? 1 : 0);
  });
}
