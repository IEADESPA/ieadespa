// cenarios-extra-b.js — reforço do roteiro (grupo B das mutações que sobreviveram): cada cenário aqui existe porque desfazer UMA garantia da tela não era percebido pelo roteiro.
// Mesmo molde dos outros cenarios-*.js: recebe os auxiliares `H` e registra cenários. Servidor simulado com estado (fixtures.js); nada aqui toca em app/, api/ nem nos outros arquivos da prova.
// Temas: quem opera de verdade (equipe + presente), proteção de duplo clique, releitura da sala depois de 409/403, abrir a sala com erro, o ajudante que fala com a API (mensagem padrão, tipo do aviso,
// Content-Type, botão desabilitado, rede, sessão, 428), argumentos errados nas ações, filtros das listas, validações do check-in e o escape do que vem do servidor.
"use strict";

module.exports = function registrar(H) {
  const { cenario, confere, montar, limpo, descendentes, botoes, chamadas, texto, visivel, clicarEResponder, esperar, esperaChegar, abrirMeuPainel, abrirSalaMeu, abrirAbaGestao, abrirSalaGestao, entrarNaSala,
    salaPronta, buscar, adicionarMembro, escolherQuemTrouxe, enviarCheckin, checkinDoPedro, cartao, ATAQUE, MEU, MIN } = H;

  const GESTOR = { membroId: 9, lideranca: true, gestao: true };
  const fatorNao = (c) => { c.env.ctx.__fatorConfirmar = async () => false; };
  const pendente = (S, id, quem = {}) => S.pedirDivergencia(id, Object.assign({ nome: "Tia Zeza", parentesco: "TIO", documento: "CNH", operadorId: 42 }, quem));
  // a criança já está na sala (o check-in foi feito por outra pessoa) e a tela já a leu
  const semear = async (c, op = { menorId: 101, trouxeMembroId: 201 }) => { const a = c.S.semear(op); await c.env.ev("chkLerSala(true)"); await c.env.ocioso(); return a; };
  const toastsComClasse = (env) => [...env.e("toastContainer").children].map(t => ({ texto: t.textContent, classe: t.className }));
  // a resposta de uma rota é a do servidor simulado, ajustada por `ajustar` (para mandar o que o servidor de verdade nunca mandaria)
  const comResposta = (c, chave, ajustar) => { const original = c.S.responder; c.env.api.rotas[chave] = (chamada) => { const r = original(chamada); ajustar(r, chamada); return r; }; };
  const alternar = async (env, id, secao) => { const rot = { hist: "Hist", aut: "Aut", sau: "Sau" }[secao]; env.e(`chkFhBtn${rot}${id}`).focus(); env.doc.clicar(env.e(`chkFhBtn${rot}${id}`)); await env.ocioso(); };
  const linksDeTelefone = (el) => descendentes(el).filter(x => x.localName === "a" && /chk-tel/.test(x.className));

  // ============================================================================================================================================
  // QUEM OPERA DE VERDADE: ser da equipe E estar na sala
  // ============================================================================================================================================
  cenario("Extra B: a liderança que está na lista de presentes sem ser da equipe não opera (sem Retirar nem Segunda via; a busca nem pede)", async () => {
    const c = montar({ sessao: GESTOR }); const { S, env } = c;
    S.entrar(S.salas[0], 9);   // o gestor 9 consta como presente, mas não está escalado nem lidera a equipe
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 });
    await abrirSalaGestao(env);
    confere(!!env.g("chkSala") && env.g("chkSala").ehMinha === false && env.g("chkSala").ehGestao === true, "a sala está aberta na visão da liderança, sem ser da equipe");
    confere(env.ev("chkEstouPresente()") === true, "o servidor lista a liderança entre os presentes");
    confere(env.ev("chkPodeOperar()") === false, "presente, mas sem ser da equipe: não opera");
    const bts = botoes(cartao(env, a.registroId));
    confere(!bts.some(t => /Retirar|Segunda via/.test(t)), `o cartão da criança não oferece Retirar nem Segunda via: ${bts.join(" | ")}`);
    env.limparRegistro();
    env.e("chkCiBusca").value = "Pedro";
    await env.ev("chkBuscarAcao()"); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/buscar").length === 0, "a busca chamada direto por quem não é da equipe não pede nada ao servidor");
    env.ev(`chkAbrirRetiradaAcao(${a.registroId}, null)`); env.ev(`chkAbrirSegundaViaAcao(${a.registroId}, null)`);
    confere(!env.e("chkRtPainel") && !env.e("chkSvPainel") && env.g("chkAcao") === null, "os painéis de retirada e de segunda via nem abrem");
  });

  cenario("Extra B: quem deixou a sala não busca criança (nem pelo temporizador da digitação que já estava armado)", async () => {
    const c = await salaPronta(); const { S, env } = c;
    env.doc.digitar(env.e("chkCiBusca"), "Pedro");   // arma o temporizador de 350 ms
    confere([...env.temporizadores.values()].filter(t => t.ms === 350).length === 1, "a digitação armou o temporizador da busca");
    S.salas[0].voluntarios.forEach(v => { if (v.membroId === MEU) v.saiuEm = S.agoraMs; });   // saiu em outro aparelho
    await env.ev("chkLerSala(true)"); await env.ocioso();
    confere(env.ev("chkPodeOperar()") === false && !!env.g("chkCi"), "a leitura mostra que a pessoa não está mais na sala (o formulário em memória continua)");
    env.limparRegistro();
    env.dispararTemporizador(350); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/buscar").length === 0, "o temporizador que dispara depois da saída não pede nada");
    env.e("chkCiBusca").value = "Pedro";
    await env.ev("chkBuscarAcao()"); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/buscar").length === 0, "e a busca chamada direto também não");
  });

  cenario("Extra B: o envio da retirada confere de novo se quem opera ainda está na sala (a sessão passou a ser de outra pessoa sem a tela ser limpa)", async () => {
    const c = await salaPronta(); const { S, env } = c;
    const a = await semear(c);
    env.doc.clicar(env.e(`chkRetirar${a.registroId}`)); await env.ocioso();
    env.doc.escolher(env.e("chkRtQuem"), "RESP:201"); env.e("chkRtCodigo").value = a.codigo;
    confere(!!env.g("chkAcao") && env.ev("chkPodeOperar()") === true, "o painel está aberto e quem opera é a voluntária (41)");
    env.ev("authMatricula = '43'");   // outra matrícula, que não está na sala: a guarda do próprio envio é a última defesa
    confere(env.ev("chkPodeOperar()") === false, "com a outra matrícula, a pessoa não opera esta sala");
    env.limparRegistro();
    await env.ev("chkEnviarRetiradaAcao()"); await env.ocioso();
    confere(chamadas(env, "POST checkin-infantil/retirar").length === 0 && S.registro(a.registroId).situacao === "NA_SALA", "o envio não vai ao servidor e a criança continua na sala");
    env.ev("authMatricula = '41'");
  });

  cenario("Extra B: chamar 'Entrar na sala' sem sala aberta não pede nada nem quebra", async () => {
    const c = montar(); const { env } = c;
    let erro = null;
    try { await env.ev("chkEntrarAcao(null)"); await env.ocioso(); } catch (e) { erro = e; }
    confere(erro === null, `a ação sem sala aberta volta em silêncio (${erro && erro.message})`);
    confere(chamadas(env, "POST checkin-infantil/entrar-na-sala").length === 0, "e nenhum pedido sai");
  });

  cenario("Extra B: o cartão do pedido de retirada não dá Aprovar nem Negar a quem não é da liderança (o pedido é de outra pessoa)", async () => {
    const c = await salaPronta(); const { S, env } = c;   // a Ana (41), pelo PIN
    const a = await semear(c);
    pendente(S, a.registroId);   // quem pediu foi a 42, não a própria Ana: só a guarda da liderança esconde os botões
    await env.ev("chkLerSala(true)"); await env.ocioso();
    const card = cartao(env, a.registroId);
    const bts = botoes(card);
    confere(/Aguardando a liderança/.test(card.textContent), "o cartão diz que aguarda a liderança");
    confere(!bts.some(t => /Aprovar|Negar/.test(t)) && !env.e(`chkAprovar${a.registroId}`) && !env.e(`chkNegar${a.registroId}`), `nem Aprovar nem Negar para quem opera pelo PIN: ${bts.join(" | ")}`);
  });

  cenario("Extra B: telefone curto (menos de 8 algarismos) fica como texto, nunca vira link; o texto vem escapado", async () => {
    const c = montar({ sessao: GESTOR }); const { S, env } = c;
    S.membros[0].responsaveis[0].telefone = `12345 ${ATAQUE("telCurto")}`;   // 5 algarismos e texto de ataque
    S.membros[0].responsaveis[1].telefone = "1234567";                       // 7 algarismos: ainda curto
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 }); pendente(S, a.registroId);
    const v = S.semear({ visitante: { nome: "Visitante Seis", nascimento: "2021-02-02" }, trouxeNome: "Tia Zeza", trouxeContato: `123456 ${ATAQUE("trouxeCurto")}` });
    pendente(S, v.registroId, { nome: "Vizinha Dalva", parentesco: "AMIGO_FAMILIA", documento: "RG" });
    await abrirSalaGestao(env);
    const ca = cartao(env, a.registroId), cv = cartao(env, v.registroId);
    confere(linksDeTelefone(ca).length === 0 && linksDeTelefone(cv).length === 0, `telefone com menos de 8 algarismos não vira link para ligar: ${linksDeTelefone(ca).concat(linksDeTelefone(cv)).map(x => x.getAttribute("href")).join(",")}`);
    confere(ca.textContent.includes("1234567") && ca.textContent.includes("12345 ") && ca.textContent.includes("[telCurto]") && cv.textContent.includes("123456") && cv.textContent.includes("[trouxeCurto]"), "o telefone curto aparece como texto (com o texto de ataque como texto)");
    limpo(env, "Telefone curto");
    // 8 algarismos é o menor que vira link
    S.membros[0].responsaveis[0].telefone = "12345678";
    await env.ev("chkLerSala(true)"); await env.ocioso();
    confere(linksDeTelefone(cartao(env, a.registroId)).map(x => x.getAttribute("href")).includes("tel:12345678"), "com 8 algarismos o telefone vira link tel: só com números");
  });

  // ============================================================================================================================================
  // O CHECK-IN: 409, duplo envio, Content-Type, limites e validações que só o estado interno alcança
  // ============================================================================================================================================
  cenario("Extra B: check-in — 409 (o registro mudou) lê a sala de novo e deixa o formulário intacto; duplo envio vira um pedido só; o corpo vai como JSON", async () => {
    const d = await salaPronta(); const { env } = d;
    await buscar(env, "Pedro"); await adicionarMembro(env, 101); escolherQuemTrouxe(env, "201");
    env.api.rotas["POST checkin-infantil/checkin"] = { status: 409, corpo: { sucesso: false, mudou: true, mensagem: "O registro mudou enquanto você agia: confira a sala antes de continuar." } };
    env.limparRegistro(); await enviarCheckin(env);
    confere(chamadas(env, "GET checkin-infantil/sala").length === 1, "409: a sala é lida de novo (uma leitura)");
    confere(/O registro mudou enquanto você agia/.test(texto(env, "chkCiMsg")) && !!env.e("chkChip0") && !env.e("chkImprimivel"), "e a mensagem do servidor aparece com o formulário intacto e nenhum código");
    delete env.api.rotas["POST checkin-infantil/checkin"];
    // duplo envio no mesmo instante: um pedido só, com o aviso 'Aguarde'
    const e = await salaPronta(); const E = e.env;
    await buscar(E, "Pedro"); await adicionarMembro(E, 101); escolherQuemTrouxe(E, "201");
    E.limparRegistro();
    const dup = E.ev("(function(){ const bt = document.getElementById('chkCiEnviar'); return Promise.all([chkEnviarCheckinAcao(bt), chkEnviarCheckinAcao(bt)]); })()");
    await esperar(dup); await E.ocioso();
    const p = chamadas(E, "POST checkin-infantil/checkin");
    confere(p.length === 1 && /Aguarde/.test(E.toasts().join("|")), `duplo envio do check-in: um pedido só e o aviso 'Aguarde' (${p.length} pedidos)`);
    confere(p.length === 1 && p[0].cabecalhos["content-type"] === "application/json", "o corpo do pedido vai com Content-Type: application/json");
  });

  cenario("Extra B: check-in — limite de crianças e 'quem trouxe' adulterado são recusados antes de qualquer pedido", async () => {
    const c = await salaPronta(); const { env } = c;
    await buscar(env, "Pedro"); await adicionarMembro(env, 101);
    await buscar(env, "Lia"); await adicionarMembro(env, 102);
    escolherQuemTrouxe(env, "201");
    // o limite do catálogo caiu para 1 depois de as duas entrarem na lista: o envio confere de novo
    env.ev("chkCatalogos.maxCriancas = 1");
    env.limparRegistro(); await enviarCheckin(env);
    confere(chamadas(env, "POST checkin-infantil/checkin").length === 0 && /até 1 crianças por vez/.test(texto(env, "chkCiMsg")), "mais crianças que o limite: a mensagem e nada é enviado");
    env.ev("chkCatalogos.maxCriancas = 6");
    // quem trouxe: um valor que não é um dos responsáveis cadastrados das crianças (o campo foi adulterado)
    const sel = env.e("chkCiTrouxe");
    sel.innerHTML = `${sel.innerHTML}<option value="999">Fulano</option><option value="0">Zero</option>`;
    for (const rogue of ["999", "0"]) {
      env.doc.escolher(env.e("chkCiTrouxe"), rogue);
      confere(env.e("chkCiTrouxe").value === rogue, `o campo ficou com o valor adulterado ${rogue}`);
      env.limparRegistro(); await enviarCheckin(env);
      confere(chamadas(env, "POST checkin-infantil/checkin").length === 0 && /Escolha quem trouxe entre os responsáveis cadastrados/.test(texto(env, "chkCiMsg")), `quem trouxe ${rogue}: não é responsável cadastrado, a tela recusa antes de pedir`);
    }
  });

  cenario("Extra B: busca — criança que já está numa sala não entra na lista (chamada direto), e adicionar com a sala trocada não põe a criança na sala nova", async () => {
    const c = await salaPronta(); const { S, env } = c;
    S.semear({ menorId: 101, trouxeMembroId: 201 });   // Pedro já está numa sala
    await env.ev("chkLerSala(true)"); await env.ocioso();
    await buscar(env, "Pedro");
    confere(!!env.e("chkRes101") && env.e("chkAdd101").disabled === true, "o resultado mostra 'Já está na sala' e o botão fica desabilitado");
    env.limparRegistro();
    await env.ev("chkAdicionarMembroAcao(101, null)"); await env.ocioso();
    confere(/já está numa sala e ainda não foi retirada/.test(texto(env, "chkCiBuscaMsg")) && chamadas(env, "GET checkin-infantil/responsaveis").length === 0 && env.g("chkCi").criancas.length === 0, "chamando a ação direto: a mensagem, nada é pedido e a criança não entra na lista");
    // resposta atrasada de uma sala que a pessoa já deixou e reabriu
    const d = await salaPronta(); const { env: E } = d;
    await buscar(E, "Pedro");
    const presa = E.retem(x => x.chave === "GET checkin-infantil/responsaveis");
    E.doc.clicar(E.e("chkAdd101")); await esperaChegar(presa);
    E.doc.clicar(E.e("chkVoltarBotao")); await E.ocioso();
    E.doc.clicar(E.e("chkAbrirMeu501x31")); await E.ocioso();
    confere(!!E.e("chkCiForm") && E.g("chkCi") && E.g("chkCi").criancas.length === 0, "a sala foi reaberta com o formulário vazio");
    presa.liberar(); await E.ocioso(); E.api.retencoes.length = 0;
    confere(E.g("chkCi").criancas.length === 0 && !E.e("chkChip0"), "a resposta atrasada da sala anterior não põe a criança na lista da sala nova");
  });

  cenario("Extra B: visitante com saúde — sem o texto da autorização (ou sem o hash) não entra na lista; com tudo, o 'concordo' é booleano", async () => {
    const preencher = (env) => { env.e("chkCiVisNome").value = "Visitante Um"; env.e("chkCiVisNasc").value = "2021-04-04"; env.doc.digitar(env.e("chkCiVisSaude"), "Asma"); };
    // catálogo sem o texto da autorização de saúde
    const a = montar(); comResposta(a, "GET checkin-infantil/catalogos", (r) => { r.corpo.textoSaude = null; });
    await abrirSalaMeu(a.env); await entrarNaSala(a.env);
    preencher(a.env); a.env.doc.clicar(a.env.e("chkCiVisAdicionar")); await a.env.ocioso();
    confere(/O texto de autorização da saúde não foi carregado/.test(texto(a.env, "chkCiVisMsg")) && !a.env.e("chkChip0"), "sem o texto no catálogo: a mensagem certa e o visitante não entra");
    // catálogo com o texto, mas sem o hash
    const b = montar(); comResposta(b, "GET checkin-infantil/catalogos", (r) => { r.corpo.textoSaude.hash = ""; });
    await abrirSalaMeu(b.env); await entrarNaSala(b.env);
    preencher(b.env); b.env.doc.marcar(b.env.e("chkCiVisConcordo"), true); b.env.doc.clicar(b.env.e("chkCiVisAdicionar")); await b.env.ocioso();
    confere(/O texto de autorização da saúde não foi carregado/.test(texto(b.env, "chkCiVisMsg")) && !b.env.e("chkChip0"), "texto sem hash, mesmo com o 'concordo' marcado: a mensagem certa e o visitante não entra");
    // tudo certo: entra, com o 'concordo' como booleano verdadeiro (e o hash do texto)
    const d = await salaPronta();
    preencher(d.env); d.env.doc.marcar(d.env.e("chkCiVisConcordo"), true); d.env.doc.clicar(d.env.e("chkCiVisAdicionar")); await d.env.ocioso();
    const v = d.env.g("chkCi").criancas[0];
    confere(!!d.env.e("chkChip0") && v && v.saude && v.saude.concordo === true && typeof v.saude.concordo === "boolean" && /^[0-9a-f]{16,}$/i.test(String(v.saude.textoHash)), `o visitante entra com a saúde, 'concordo' booleano verdadeiro e o hash do texto (${JSON.stringify(v && v.saude && { c: v.saude.concordo, h: String(v.saude.textoHash).slice(0, 8) })})`);
  });

  // ============================================================================================================================================
  // ABRIR E SAIR DA SALA
  // ============================================================================================================================================
  cenario("Extra B: abrir a sala com erro do servidor (404, 422, 403, resposta sem sala) tira a pessoa da sala, mostra a mensagem e avisa uma vez só", async () => {
    const a = montar();
    await abrirMeuPainel(a.env);
    const abrir = async (rota, qual, padrao) => {
      a.env.api.rotas["GET checkin-infantil/sala"] = rota; a.env.limparRegistro();
      a.env.doc.clicar(a.env.e("chkAbrirMeu501x31")); await a.env.ocioso();
      confere(a.env.g("chkSala") === null && !a.env.e("chkSalaRaiz") && visivel(a.env, "chkMeuListas") && !visivel(a.env, "chkSalaMeu") && a.env.intervalos.size === 0, `${qual}: a pessoa não fica numa sala vazia (volta à lista, sem relógio)`);
      confere(padrao.test(texto(a.env, "chkMeuMsg")) && /psc-aviso/.test(a.env.e("chkMeuMsg").className), `${qual}: a mensagem fica na lista, em destaque`);
      confere(a.env.toasts().filter(t => padrao.test(t)).length === 1, `${qual}: um aviso só (${a.env.toasts().join(" | ")})`);
    };
    await abrir({ status: 404, corpo: { sucesso: false, mensagem: "Sala não encontrada." } }, "404", /Sala não encontrada/);
    await abrir({ status: 422, corpo: { sucesso: false, mensagem: "Esta equipe não tem a marca de contato com menores." } }, "422", /não tem a marca de contato com menores/);
    await abrir({ status: 403, corpo: { sucesso: false, mensagem: "Você não está escalado nesta sala." } }, "403", /Você não está escalado nesta sala/);
    await abrir({ status: 200, corpo: { sucesso: true } }, "200 sem sala", /Não foi possível concluir a operação agora/);
    // o catálogo que não carrega: o aviso da tela (além do que o servidor já avisou)
    const b = montar();
    b.env.api.rotas["GET checkin-infantil/catalogos"] = { status: 422, corpo: { sucesso: false, mensagem: "Catálogo indisponível." } };
    await abrirMeuPainel(b.env); b.env.limparRegistro();
    b.env.doc.clicar(b.env.e("chkAbrirMeu501x31")); await b.env.ocioso();
    const msgCatalogo = b.env.g("CHK_MSG_SEM_CATALOGO");
    confere(!b.env.e("chkSalaRaiz") && b.env.toasts().filter(t => t === msgCatalogo).length === 1, `sem o catálogo a sala não abre e há um aviso (${b.env.toasts().join(" | ")})`);
  });

  cenario("Extra B: sair da sala e tirar voluntário — duplo clique vira um pedido só ('Aguarde')", async () => {
    const c = await salaPronta(); const { env } = c;
    env.limparRegistro();
    const dup = env.ev("(function(){ const bt = document.getElementById('chkSairBotao'); return Promise.all([chkSairAcao(bt), chkSairAcao(bt)]); })()");
    await esperar(dup); await env.ocioso();
    confere(chamadas(env, "POST checkin-infantil/sair-da-sala").length === 1 && /Aguarde/.test(env.toasts().join("|")), "duplo clique em 'Sair da sala': um pedido só e o aviso 'Aguarde'");
    // a liderança tira o voluntário: a confirmação vem antes, o segundo pedido (com o primeiro ainda a caminho) é barrado
    const g = montar({ sessao: GESTOR }); g.S.entrar(g.S.salas[0], 43);
    await abrirSalaGestao(g.env);
    const presa = g.env.retem(x => x.chave === "POST checkin-infantil/sair-da-sala");
    g.env.limparRegistro();
    const p1 = g.env.ev("chkTirarVoluntarioAcao(43, null)");
    await g.env.responderModal(true); await esperaChegar(presa);
    const p2 = g.env.ev("chkTirarVoluntarioAcao(43, null)");
    await g.env.responderModal(true); await g.env.ocioso();
    presa.liberar(); await esperar(Promise.all([p1, p2])); await g.env.ocioso(); g.env.api.retencoes.length = 0;
    confere(chamadas(g.env, "POST checkin-infantil/sair-da-sala").length === 1 && /Aguarde/.test(g.env.toasts().join("|")), `tirar voluntário duas vezes seguidas: um pedido só e o aviso 'Aguarde' (${chamadas(g.env, "POST checkin-infantil/sair-da-sala").length} pedidos)`);
  });

  cenario("Extra B: voltar da sala com os códigos já impressos não pergunta nada", async () => {
    const c = await salaPronta(); const { env } = c;
    await checkinDoPedro(c, 101);
    confere(!!env.g("chkImpressao") && env.g("chkImpressao").lotes.length === 1 && env.g("chkImpressao").lotes[0].impresso === false, "o painel de códigos abriu e ainda não foi impresso");
    await H.imprimir(env, true);
    confere(env.g("chkImpressao").lotes[0].impresso === true && env.impressoes.length === 1, "a impressão foi pedida e confirmada: os códigos contam como impressos");
    const m = await clicarEResponder(env, env.e("chkVoltarBotao"), false);
    confere(m.aberto === false && env.g("chkSala") === null && !env.e("chkSalaRaiz"), "voltar com os códigos impressos sai direto, sem a pergunta");
  });

  // ============================================================================================================================================
  // SEGUNDA VIA
  // ============================================================================================================================================
  cenario("Extra B: segunda via — a recusa (409 ou 403) lê a sala de novo; duplo pedido vira um só", async () => {
    const c = await salaPronta(); const { env } = c;
    const a = await semear(c);
    env.doc.clicar(env.e(`chkSegVia${a.registroId}`)); await env.ocioso();
    env.doc.escolher(env.e("chkSvQuem"), "RESP:201"); env.e("chkSvDoc").value = "RG";
    for (const [status, mensagem] of [[409, "O registro mudou: confira antes de continuar."], [403, "Você não está mais na sala."]]) {
      env.api.rotas["POST checkin-infantil/segunda-via-pedir"] = { status, corpo: { sucesso: false, mudou: status === 409, mensagem } };
      env.limparRegistro();
      await env.ev("chkEnviarSegundaViaAcao()"); await env.ocioso();
      confere(chamadas(env, "GET checkin-infantil/sala").length === 1, `${status}: a sala é lida de novo (${chamadas(env, "GET checkin-infantil/sala").length} leituras)`);
      confere(texto(env, "chkSvMsg") === mensagem && !!env.e("chkSvPainel"), `${status}: a mensagem do servidor fica no painel, que continua aberto`);
    }
    delete env.api.rotas["POST checkin-infantil/segunda-via-pedir"];
    env.limparRegistro();
    const dup = env.ev("Promise.all([chkEnviarSegundaViaAcao(), chkEnviarSegundaViaAcao()])");
    await esperar(dup); await env.ocioso();
    confere(chamadas(env, "POST checkin-infantil/segunda-via-pedir").length === 1 && /Aguarde/.test(env.toasts().join("|")), "duplo envio do pedido de segunda via: um pedido só e o aviso 'Aguarde'");
  });

  cenario("Extra B: segunda via — confirmar: duplo clique vira um pedido só, e 'sucesso' sem etiqueta não é tratado como sucesso", async () => {
    const d = montar({ sessao: { membroId: 42 } }); const { S, env } = d;   // a Bia confere o pedido da Ana
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 });
    S.vias.push({ viaId: 99, registroId: a.registroId, pedidaPor: 41, pedidaEm: S.agoraMs - MIN, pessoaNome: "Maria Souza", documento: "RG" });
    await abrirSalaMeu(env);
    confere(!!env.e(`chkConfSegVia${a.registroId}`), "a Bia vê 'Confirmar a segunda via'");
    // o servidor diz sucesso mas não manda a etiqueta: a tela avisa em destaque e não abre o painel de códigos
    env.api.rotas["POST checkin-infantil/segunda-via-confirmar"] = { status: 201, corpo: { sucesso: true, mensagem: "Segunda via emitida.", registroId: a.registroId } };
    env.limparRegistro();
    await clicarEResponder(env, env.e(`chkConfSegVia${a.registroId}`), true);
    confere(texto(env, "chkSalaMsg") === "Segunda via emitida." && /psc-aviso/.test(env.e("chkSalaMsg").className) && !env.e("chkImprimivel") && env.g("chkImpressao") === null, "sucesso sem etiqueta: mensagem em destaque e nenhum painel de código");
    env.api.rotas["POST checkin-infantil/segunda-via-confirmar"] = { status: 201, corpo: { sucesso: true, mensagem: "Segunda via emitida.", registroId: a.registroId, etiqueta: "ABC234" } };
    await clicarEResponder(env, env.e(`chkConfSegVia${a.registroId}`), true);
    confere(/psc-aviso/.test(env.e("chkSalaMsg").className) && !env.e("chkImprimivel"), "etiqueta que não é um objeto: o mesmo tratamento");
    delete env.api.rotas["POST checkin-infantil/segunda-via-confirmar"];
    // duplo clique: o segundo pedido chega com o primeiro ainda a caminho
    const presa = env.retem(x => x.chave === "POST checkin-infantil/segunda-via-confirmar");
    env.limparRegistro();
    const p1 = env.ev(`chkConfirmarSegundaViaAcao(${a.registroId}, null)`);
    await env.responderModal(true); await esperaChegar(presa);
    const p2 = env.ev(`chkConfirmarSegundaViaAcao(${a.registroId}, null)`);
    await env.responderModal(true); await env.ocioso();
    presa.liberar(); await esperar(Promise.all([p1, p2])); await env.ocioso(); env.api.retencoes.length = 0;
    confere(chamadas(env, "POST checkin-infantil/segunda-via-confirmar").length === 1 && /Aguarde/.test(env.toasts().join("|")), `confirmar duas vezes seguidas: um pedido só e o aviso 'Aguarde' (${chamadas(env, "POST checkin-infantil/segunda-via-confirmar").length} pedidos)`);
    confere(!!env.e("chkImprimivel"), "e a etiqueta nova do primeiro pedido aparece");
  });

  // ============================================================================================================================================
  // O AJUDANTE QUE FALA COM A API (chkRequisitar e chkProtegerBotao)
  // ============================================================================================================================================
  cenario("Extra B: servidor — mensagem padrão, tipo do aviso (erro × sucesso), Content-Type e a rede que não avisa duas vezes", async () => {
    const c = await salaPronta(); const { env } = c;
    const PADRAO = "Não foi possível concluir a operação agora.";
    env.api.rotas["POST checkin-infantil/sair-da-sala"] = { status: 422, corpo: { sucesso: false } };
    env.limparRegistro(); env.doc.clicar(env.e("chkSairBotao")); await env.ocioso();
    confere(texto(env, "chkSalaMsg") === PADRAO, `recusa sem mensagem: o texto padrão na sala (${JSON.stringify(texto(env, "chkSalaMsg"))})`);
    const erros = toastsComClasse(env).filter(t => t.texto === PADRAO);
    confere(erros.length === 1 && /toast-erro/.test(erros[0].classe) && !/toast-sucesso/.test(erros[0].classe), `o aviso de uma recusa leva a classe de erro: ${JSON.stringify(erros)}`);
    const p = chamadas(env, "POST checkin-infantil/sair-da-sala")[0];
    confere(!!p && p.cabecalhos["content-type"] === "application/json", "todo POST vai com Content-Type: application/json");
    delete env.api.rotas["POST checkin-infantil/sair-da-sala"];
    env.limparRegistro(); env.doc.clicar(env.e("chkSairBotao")); await env.ocioso();
    const ok = toastsComClasse(env).filter(t => t.texto === "Você saiu da sala.");
    confere(ok.length === 1 && /toast-sucesso/.test(ok[0].classe), `o aviso de sucesso leva a classe de sucesso: ${JSON.stringify(ok)}`);
    // rede caída: cada pedido que falha dá UM aviso (o do fetchProtegido); a tela só escreve o texto
    const r = await salaPronta(); const R = r.env;
    R.api.redeCaida = true; R.limparRegistro();
    R.doc.clicar(R.e("chkSairBotao")); await R.ocioso();
    const ts = R.toasts();
    confere(R.api.chamadas.length >= 1 && ts.length === R.api.chamadas.length && ts.every(t => /Não foi possível conectar ao servidor/.test(t)), `rede caída: um aviso por pedido, nunca dois (${R.api.chamadas.length} pedidos, ${ts.length} avisos: ${ts.join(" | ")})`);
    confere(/Não foi possível (falar com o servidor|atualizar) agora/.test(texto(R, "chkSalaMsg")), "e o texto da rede fica na sala");
    const falha = await R.ev("chkObter('catalogos')");
    confere(falha.sucesso === false && falha.falhaDeRede === true && falha.jaAvisado === true && /Não foi possível falar com o servidor agora/.test(falha.mensagem), `o ajudante marca a falha de rede como já avisada: ${JSON.stringify(falha)}`);
  });

  cenario("Extra B: servidor — o botão que grava fica desabilitado enquanto o pedido está a caminho", async () => {
    const a = montar(); await abrirSalaMeu(a.env);
    const presa = a.env.retem(x => x.chave === "POST checkin-infantil/entrar-na-sala");
    a.env.doc.clicar(a.env.e("chkEntrarBotao")); await esperaChegar(presa);
    confere(a.env.e("chkEntrarBotao") && a.env.e("chkEntrarBotao").disabled === true, "'Entrar na sala' fica desabilitado enquanto o pedido espera");
    presa.liberar(); await a.env.ocioso(); a.env.api.retencoes.length = 0;
    confere(!!a.env.e("chkSairBotao") && !a.env.e("chkEntrarBotao"), "o pedido terminou e o botão trocou");
    const b = await salaPronta(); const B = b.env;
    await buscar(B, "Pedro"); await adicionarMembro(B, 101); escolherQuemTrouxe(B, "201");
    const presa2 = B.retem(x => x.chave === "POST checkin-infantil/checkin");
    B.doc.clicar(B.e("chkCiEnviar")); await esperaChegar(presa2);
    confere(B.e("chkCiEnviar").disabled === true, "o botão de registrar a entrada fica desabilitado enquanto o pedido espera");
    presa2.liberar(); await B.ocioso(); B.api.retencoes.length = 0;
    confere(B.e("chkCiEnviar").disabled === false, "e volta a ficar habilitado no fim");
  });

  cenario("Extra B: servidor — a sessão que acabou (erro 'Sessão expirada') não conta como falha de rede e a confirmação reforçada recusada mostra o texto da tela", async () => {
    const c = await salaPronta(); const { env } = c;
    env.api.rotas["GET checkin-infantil/sala"] = () => { throw new Error("Sessão expirada"); };
    const r = await env.ev("chkObter('sala?servicoId=501&equipeId=31')");
    confere(r.sucesso === false && r.sessaoExpirada === true && r.jaAvisado === true && !r.falhaDeRede && r.mensagem === "Sua sessão expirou. Entre novamente.", `o ajudante marca a sessão expirada: ${JSON.stringify(r)}`);
    const antes = texto(env, "chkSalaMsg");
    env.limparRegistro();
    env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/sala").length === 1 && env.g("chkFalhas") === 0 && texto(env, "chkSalaMsg") === antes && !/Não foi possível atualizar/.test(texto(env, "chkSalaMsg")) && !!env.e("chkSalaRaiz"), "a atualização que encontra a sessão expirada não conta como falha nem escreve 'não foi possível atualizar'");
    delete env.api.rotas["GET checkin-infantil/sala"];
    // confirmação reforçada (428) que a pessoa não faz: a mensagem da tela, não a do servidor
    const g = montar({ sessao: GESTOR }); fatorNao(g);
    const a = g.S.semear({ menorId: 101, trouxeMembroId: 201 }); pendente(g.S, a.registroId);
    await abrirSalaGestao(g.env);
    g.env.doc.clicar(g.env.e(`chkAprovar${a.registroId}`)); await g.env.responderModal(true); await g.env.responderTexto("Liguei para a mãe, que confirmou."); await g.env.ocioso();
    const fator = g.env.g("CHK_MSG_FATOR");
    confere(texto(g.env, "chkSalaMsg") === fator && !/Este ato exige/.test(texto(g.env, "chkSalaMsg")), `o 428 mostra a mensagem da tela (${JSON.stringify(texto(g.env, "chkSalaMsg"))})`);
    confere(g.env.toasts().includes(fator), "e o aviso também leva a mensagem da tela");
  });

  // ============================================================================================================================================
  // ARGUMENTOS ERRADOS NAS AÇÕES E FILTROS DAS LISTAS
  // ============================================================================================================================================
  cenario("Extra B: ações chamadas direto com argumento errado — id de autorização que não é número e seção de filho que não é do contrato", async () => {
    const c = montar({ sessao: { membroId: 201 } }); const { S, env } = c;
    S.membros[0].autorizados.push({ autorizadoId: 7001, nome: "Tia Zeza", parentesco: "TIO", validoAte: null, forma: "RESPONSAVEL", registradoEm: S.agoraMs });
    await abrirMeuPainel(env);
    // controle: um id de verdade abre a pergunta
    env.limparRegistro();
    const ok = env.ev(`chkRevogarAutorizadoAcao(7001, "Fh", 101)`);
    const m0 = await env.responderModal(false); await esperar(ok);
    confere(m0.aberto === true && /Revogar esta autorização/.test(m0.texto), "um id de verdade abre a pergunta de confirmação");
    for (const lixo of ['"abc"', "0", "-3", '"12abc"', '"1e3"', '""', "null", "undefined", "NaN", "[]", "{}"]) {
      const p = env.ev(`chkRevogarAutorizadoAcao(${lixo}, "Fh", 101)`);
      const m = await env.responderModal(false); await esperar(p);
      confere(m.aberto === false, `id de autorização ${lixo}: nem a pergunta aparece`);
    }
    confere(chamadas(env, "POST checkin-infantil/autorizado-revogar").length === 0, "nenhum pedido de revogar saiu");
    // seção de filho: só 'hist', 'aut' e 'sau' (texto); um objeto que vira esse texto não vale
    env.limparRegistro();
    await env.ev('chkAlternarFilhoAcao(101, ["hist"])'); await env.ocioso();
    await env.ev('chkAlternarFilhoAcao(101, { toString() { return "aut"; } })'); await env.ocioso();
    await env.ev('chkAlternarFilhoAcao(101, "xyz")'); await env.ocioso();
    const abertos = ["Hist", "Aut", "Sau"].map(s => env.e(`chkFhBtn${s}101`).getAttribute("aria-expanded"));
    confere(abertos.every(x => x === "false") && env.api.chamadas.filter(x => /checkin-infantil\/(historico|autorizados|saude)/.test(x.caminho)).length === 0, `seção que não é do contrato: nada abre e nada é pedido (${abertos.join(",")})`);
  });

  cenario("Extra B: Meu Painel só mostra o que é da pessoa — salas que ela opera, filhos com número de verdade", async () => {
    // o gestor (que não é da equipe) abre o Meu Painel: nenhuma sala; na aba da liderança, só as salas da gestão
    const g = montar({ sessao: GESTOR });
    await abrirMeuPainel(g.env);
    const cartoes = (env, id) => descendentes(env.e(id)).filter(x => /chk-sala-cartao/.test(x.className));
    confere(cartoes(g.env, "chkMeuSalasLista").length === 0 && /Você não está escalado em nenhuma sala/.test(texto(g.env, "chkMeuSalasLista")) && g.env.g("chkSalasMeu").length === 0, "Meu Painel do gestor: nenhuma sala (ele não é da equipe de nenhuma)");
    comResposta(g, "GET checkin-infantil/minhas-salas", (r) => { r.corpo.salas.forEach(s => { s.ehGestao = false; s.ehMinha = true; }); });
    await abrirAbaGestao(g.env);
    confere(cartoes(g.env, "chkGesSalasLista").length === 0 && g.env.g("chkSalasGes").length === 0 && /Não há sala com crianças hoje na sua área/.test(texto(g.env, "chkGesSalasLista")), "aba da liderança: sala que não é da gestão não aparece");
    // filhos: entradas sem id de verdade (zero, letras, negativo, sem id) são ignoradas
    const r = montar({ sessao: { membroId: 201 } });
    comResposta(r, "GET checkin-infantil/meus-filhos", (x) => { x.corpo.filhos.push({ menorId: 0, nome: "Fantasma Zero", idade: 3 }, { menorId: "abc", nome: "Fantasma Letras", idade: 3 }, { menorId: -5, nome: "Fantasma Negativo", idade: 3 }, { nome: "Fantasma Sem Id", idade: 3 }); });
    await abrirMeuPainel(r.env);
    const ids = descendentes(r.env.e("chkFilhosLista")).map(x => x.id).filter(x => /^chkFilho/.test(x) && !/^chkFh/.test(x));
    confere(ids.length === 2 && ids.includes("chkFilho101") && ids.includes("chkFilho102") && !/Fantasma/.test(texto(r.env, "chkFilhosLista")), `só os filhos com número de verdade aparecem (${ids.join(",")})`);
  });

  // ============================================================================================================================================
  // ESCAPE: o que o servidor manda e a tela escapa (o texto de ataque tem de chegar como texto)
  // ============================================================================================================================================
  cenario("Extra B: escape — código do catálogo e referência de quem pode retirar vêm no atributo value e não escapam dele", async () => {
    const c = montar();
    comResposta(c, "GET checkin-infantil/catalogos", (r) => { r.corpo.parentescos[0].codigo = ATAQUE("t_codPar"); r.corpo.documentos[0].codigo = ATAQUE("t_codDoc"); });
    await abrirSalaMeu(c.env); await entrarNaSala(c.env);
    limpo(c.env, "Catálogo com texto de ataque no código");
    confere(c.env.e("chkCiTrouxePar").options.map(o => o.value).includes(ATAQUE("t_codPar")) && c.env.e("chkCiTrouxeDoc").options.map(o => o.value).includes(ATAQUE("t_codDoc")), "o código chega como valor do campo (texto), nunca como marcação");
    // a referência de cada pessoa que pode retirar (valor das opções da retirada e da segunda via)
    const d = await salaPronta();
    comResposta(d, "GET checkin-infantil/sala", (r) => { (r.corpo.criancas || []).forEach(k => (k.quemPodeRetirar || []).forEach(p => { p.ref = ATAQUE("t_ref"); })); });
    const a = await semear(d);
    d.env.doc.clicar(d.env.e(`chkRetirar${a.registroId}`)); await d.env.ocioso();
    limpo(d.env, "Referência com texto de ataque (retirada)");
    confere(d.env.e("chkRtQuem").options.map(o => o.value).includes(ATAQUE("t_ref")), "a referência chega como valor do campo (texto)");
    d.env.doc.clicar(d.env.e("chkSegVia" + a.registroId)); await d.env.ocioso();
    limpo(d.env, "Referência com texto de ataque (segunda via)");
  });

  cenario("Extra B: escape — mensagem da janela fechada na lista de salas, e as mensagens de erro de 'quem pode retirar' e de saúde", async () => {
    const a = montar({ ataque: "total" }); a.S.agoraMs = Date.parse("2026-10-15T09:30:00.000Z");   // 06:30 em Brasília: a janela ainda não abriu
    await abrirMeuPainel(a.env);
    confere(texto(a.env, "chkMeuSalasLista").includes("Check-in fechado") && texto(a.env, "chkMeuSalasLista").includes("[t_mensagem]"), "a mensagem da janela fechada (do servidor, com ataque) aparece como texto no cartão da sala");
    limpo(a.env, "Lista de salas com a janela fechada");
    // o responsável: o servidor recusa 'quem pode retirar' e 'saúde' com texto de ataque na mensagem
    const b = montar({ sessao: { membroId: 201 } });
    await abrirMeuPainel(b.env);
    b.env.api.rotas["GET checkin-infantil/autorizados"] = { status: 403, corpo: { sucesso: false, mensagem: `Sem acesso. ${ATAQUE("t_erroAut")}` } };
    b.env.api.rotas["GET checkin-infantil/saude"] = { status: 403, corpo: { sucesso: false, mensagem: `Sem acesso. ${ATAQUE("t_erroSau")}` } };
    await alternar(b.env, 101, "aut"); await alternar(b.env, 101, "sau");
    confere(texto(b.env, "chkFhAut101").includes("[t_erroAut]") && texto(b.env, "chkFhSau101").includes("[t_erroSau]"), "as mensagens de erro de 'quem pode retirar' e de saúde aparecem como texto");
    limpo(b.env, "Erros de quem pode retirar e de saúde");
  });
};
