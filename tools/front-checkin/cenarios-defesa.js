// cenarios-defesa.js — o que a tela faz quando alguém chama uma ação que o botão não oferece (quem opera chamando as ações da liderança), corridas entre telas e logins, respostas de erro sem o campo
// "sucesso", segundo lote de etiquetas, tocar de novo na aba com a sala aberta, e as conferências por texto do index.html e do style.css (impressão, tamanho de toque, regiões que o leitor anuncia).
"use strict";

module.exports = function registrar(H) {
  const { cenario, confere, montar, limpo, achar, descendentes, chamadas, texto, argsDe, visivel, clicarEResponder, esperar, esperaChegar, abrirMeuPainel, abrirSalaMeu, abrirAbaGestao, salaPronta, buscar,
    adicionarMembro, escolherQuemTrouxe, enviarCheckin, checkinDoPedro, cartao, seloDe, botoes, F, ATAQUE, MIN, ocorrencias, lerApp } = H;

  cenario("Defesa: quem opera (PIN) chama as ações da liderança direto — nada é pedido ao servidor, nada abre", async () => {
    const c = await salaPronta(); const { S, env } = c;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 });
    S.pedirDivergencia(a.registroId, { nome: "Tia Zeza", parentesco: "TIO", documento: "RG", operadorId: 42 });
    await env.ev("chkLerSala(true)"); await env.ocioso();
    env.limparRegistro();
    // relatório: a sala do PIN não monta a gestão; a ação direta também não faz nada
    await env.ev("chkAbrirRelatorioAcao(null)"); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/relatorio").length === 0 && !env.e("chkRelatorioCx"), "relatório: a ação chamada direto por quem não é da liderança não pede nada");
    // tirar voluntário: nem a pergunta aparece
    const t = env.ev("chkTirarVoluntarioAcao(42, null)"); await env.ocioso();
    confere(!env.modal().aberto && chamadas(env, "POST checkin-infantil/sair-da-sala").length === 0, "tirar voluntário: a ação chamada direto por quem não é da liderança não pergunta nem envia");
    await esperar(t);
    // procurar ficha: sem a permissão da aba, nada é pedido
    env.e("chkFiMatricula").value = "101";
    await env.ev("chkFichaBuscarAcao(null)"); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/autorizados").length === 0, "fichas: a ação chamada direto por quem não tem a permissão da aba não pede nada");
    // carregar as aprovações e as salas da liderança
    await env.ev("chkCarregarAprovacoesAcao()"); await env.ocioso();
    await env.ev("chkCarregarSalasGesAcao()"); await env.ocioso();
    await env.ev("chkCarregarOpcoesAcao()"); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/minhas-salas").length === 0, "aprovações, salas e opções da liderança: quem não tem a permissão da aba não pede nada");
    // decidir e destravar chamados direto: o servidor recusa (403 / 428 e depois 403) e a tela mostra o motivo
    S.recusarTudo = null;
    const d = env.ev(`chkDecidirAcao(${a.registroId}, true, null)`); await env.responderModal(true); await env.ocioso();
    await env.responderTexto("Tentativa de decidir sem ser da liderança."); await esperar(d); await env.ocioso();
    confere(/Você não tem permissão/.test(texto(env, "chkSalaMsg")) && S.registro(a.registroId).situacao === "RETIRADA_PENDENTE", "decidir chamado direto: o servidor recusa e a criança continua aguardando");
    // o formulário de check-in e o de retirada não abrem para quem não é da equipe dentro da sala
    const g = montar({ sessao: { membroId: 9, lideranca: true, gestao: true } });
    g.S.semear({ menorId: 101, trouxeMembroId: 201 });
    await abrirAbaGestao(g.env); g.env.doc.clicar(g.env.e("chkAbrirGes501x31")); await g.env.ocioso();
    g.env.limparRegistro();
    await g.env.ev("chkEntrarAcao(null)"); await g.env.ocioso();
    confere(chamadas(g.env, "POST checkin-infantil/entrar-na-sala").length === 1 && /Você não está escalado|apto|permissão/.test(texto(g.env, "chkSalaMsg") + g.env.toasts().join("|")), "entrar na sala chamado direto pela liderança que não é da equipe: o servidor recusa e a tela mostra o motivo");
  });

  cenario("Corridas: o catálogo do login anterior não vale; tocar de novo na aba com a sala aberta só atualiza; o segundo lote de etiquetas pergunta de novo", async () => {
    // o catálogo do login anterior chega depois da troca
    const c = montar({ sessao: { membroId: 41 } }); const { env } = c;
    const presa = env.retem(x => x.chave === "GET checkin-infantil/catalogos");
    env.ev("mostrarSubAbaMeupainel('checkininfantil')"); await esperaChegar(presa);
    c.S.definirSessao({ membroId: 201 }); env.sessao({ matricula: 201, pin: true });
    env.ev("mostrarSubAbaMeupainel('checkininfantil')"); await env.ocioso();
    const depoisDaTroca = env.g("chkCatalogos");
    presa.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    confere(env.g("chkCatalogos") === depoisDaTroca, "o catálogo que chega atrasado, pedido pelo login anterior, não substitui o da pessoa de agora");
    // tocar de novo na sub-aba com a sala aberta: a sala segue, o código segue, nada de lista nova
    const d = await salaPronta({ ataque: true });
    const a = await checkinDoPedro(d, 101);
    d.env.limparRegistro();
    await d.env.ev("mostrarSubAbaMeupainel('checkininfantil')"); await d.env.ocioso();
    confere(!!d.env.e("chkSalaRaiz") && d.env.doc.body.innerHTML.includes(a.codigo) && chamadas(d.env, "GET checkin-infantil/minhas-salas").length === 0 && chamadas(d.env, "GET checkin-infantil/sala").length === 1, "tocar de novo em Check-in infantil com a sala aberta não a fecha, não apaga o código e só lê a sala");
    // imprimiu o primeiro lote, fez outro check-in: o segundo lote ainda NÃO foi impresso e fechar pergunta
    d.env.doc.clicar(d.env.e("chkImprimirBotao")); await d.env.ocioso();
    confere(d.env.g("chkImpressao").impressa === true, "o primeiro lote foi impresso");
    const b = await checkinDoPedro(d, 102);
    confere(d.env.g("chkImpressao").impressa === false && d.env.g("chkImpressao").lotes.length === 2, "um lote novo volta a contar como NÃO impresso");
    const m = await clicarEResponder(d.env, d.env.e("chkFecharImpressaoBotao"), false);
    confere(m.aberto && /NÃO foram impressos/.test(m.texto) && !!d.env.e("chkCodigo1x0"), "fechar com o segundo lote não impresso pergunta e cancelar mantém os dois lotes");
  });

  cenario("Respostas de erro sem o campo 'sucesso' (o que a plataforma devolve em 403, 429 ou 5xx): sempre tratadas como erro, com a mensagem", async () => {
    const c = await salaPronta({ ataque: true }); const { S, env } = c;
    const semSucesso = (status, mensagem) => ({ status, corpo: { mensagem } });
    // POST que falha sem 'sucesso': o check-in não pode parecer ter dado certo
    await buscar(env, "Pedro"); await adicionarMembro(env, 101); escolherQuemTrouxe(env, "201");
    env.api.rotas["POST checkin-infantil/checkin"] = semSucesso(429, "Muitas tentativas. Aguarde.");
    env.limparRegistro(); await enviarCheckin(env);
    confere(/Muitas tentativas/.test(texto(env, "chkCiMsg")) && /psc-aviso/.test(env.e("chkCiMsg").className) && !env.e("chkImprimivel") && !!env.e("chkChip0"), "429 sem 'sucesso': mensagem em destaque, nenhuma etiqueta, formulário intacto");
    delete env.api.rotas["POST checkin-infantil/checkin"];
    // listas e seções que falham sem 'sucesso'
    env.api.rotas["GET checkin-infantil/historico"] = semSucesso(403, "Sem acesso ao histórico.");
    const r = montar({ sessao: { membroId: 201 } });
    r.env.api.rotas["GET checkin-infantil/historico"] = semSucesso(403, "Sem acesso ao histórico.");
    r.env.api.rotas["GET checkin-infantil/autorizados"] = semSucesso(500, "Falha ao ler.");
    r.env.api.rotas["GET checkin-infantil/saude"] = semSucesso(403, "Sem acesso à saúde.");
    await abrirMeuPainel(r.env);
    for (const [sec, rot, msg] of [["hist", "Hist", /Sem acesso ao histórico/], ["aut", "Aut", /Falha ao ler/], ["sau", "Sau", /Sem acesso à saúde/]]) {
      r.env.e(`chkFhBtn${rot}101`).focus(); r.env.doc.clicar(r.env.e(`chkFhBtn${rot}101`)); await r.env.ocioso();
      confere(msg.test(texto(r.env, `chkFh${rot}101`)) && /psc-aviso/.test(descendentes(r.env.e(`chkFh${rot}101`)).map(x => x.className).join(" ")), `${sec}: a mensagem do servidor, em destaque, sem 'sucesso' na resposta`);
    }
    r.env.api.rotas["GET checkin-infantil/minhas-salas"] = semSucesso(500, "Falha nas salas.");
    r.env.api.rotas["GET checkin-infantil/meus-filhos"] = semSucesso(500, "Falha nos filhos.");
    await r.env.ev("chkCarregarMeuPainelAcao()"); await r.env.ocioso();
    confere(/Falha nas salas/.test(texto(r.env, "chkMeuSalasLista")) && /Falha nos filhos/.test(texto(r.env, "chkFilhosLista")) && !/nenhuma sala|não é responsável cadastrado de nenhuma/.test(texto(r.env, "chkMeuSalasLista") + texto(r.env, "chkFilhosLista")), "salas e filhos que falham sem 'sucesso': a mensagem, nunca 'nenhuma sala'");
    // a sala que falha com 403 sem 'sucesso' tira a pessoa da sala
    env.api.rotas["GET checkin-infantil/sala"] = semSucesso(403, "Você não está escalado nesta sala.");
    env.tique(); await env.ocioso();
    confere(!env.e("chkSalaRaiz") && /Você não está escalado nesta sala/.test(texto(env, "chkMeuMsg")), "403 sem 'sucesso' na leitura da sala: a pessoa sai da sala com a mensagem");
    // autorizar/guardar/revogar com resposta de erro sem 'sucesso'
    r.env.api.rotas = {};
    await r.env.ev("chkCarregarMeuPainelAcao()"); await r.env.ocioso();
    r.env.e("chkFhBtnAut101").focus(); r.env.doc.clicar(r.env.e("chkFhBtnAut101")); await r.env.ocioso();
    r.env.api.rotas["POST checkin-infantil/autorizado-adicionar"] = semSucesso(429, "Muitas tentativas. Aguarde.");
    r.env.e("chkFhAutNome101").value = "Tia Zeza"; r.env.e("chkFhAutPar101").value = "TIO";
    r.env.doc.clicar(r.env.e("chkFhAutEnviar101")); await r.env.ocioso();
    confere(/Muitas tentativas/.test(texto(r.env, "chkFhAutMsg101")) && /psc-aviso/.test(r.env.e("chkFhAutMsg101").className) && r.env.e("chkFhAutNome101").value === "Tia Zeza", "autorizar com 429 sem 'sucesso': mensagem em destaque e formulário intacto");
  });

  cenario("Conferências por texto: regiões que o leitor anuncia, campos sem preenchimento automático, impressão e tamanho de toque no CSS", async () => {
    const ler = montar().env.lerMutado;   // (o arquivo já com as trocas da prova de mutação, quando há)
    const html = ler("index.html"), css = ler("style.css");
    const regiao = (id) => { const m = new RegExp(`<[a-z]+[^>]*id="${id}"[^>]*>`).exec(html); return m ? m[0] : ""; };
    for (const id of ["chkMeuMsg", "chkGesMsg", "chkAprMsg", "chkFichaMsg"]) {
      const t = regiao(id);
      confere(/role="status"/.test(t) && /aria-live="polite"/.test(t), `index.html: ${id} é uma região anunciada (role=status, aria-live=polite)`);
    }
    const mat = regiao("chkFiMatricula");
    confere(/autocomplete="off"/.test(mat) && /type="number"/.test(mat) && /min="1"/.test(mat) && /<label for="chkFiMatricula">/.test(html), "index.html: a matrícula da ficha não vai para o preenchimento automático, é número e tem rótulo");
    for (const [id, arg] of [["btnSubMeupainelCheckininfantil", "mostrarSubAbaMeupainel"], ["btnAbaCheckininfantil", "mostrarAbaSecretaria"]]) {
      const t = regiao(id);
      confere(new RegExp(`data-on-click="${arg}"`).test(t) && /data-args-click='\["checkininfantil"\]'/.test(t), `index.html: ${id} leva à tela do check-in (e a nenhuma outra)`);
    }
    // CSS: o que o navegador de verdade confere de novo (navegador.js)
    const regra = (re, msg) => confere(re.test(css), `style.css: ${msg}`);
    regra(/body:not\(\.chk-imp-etiquetas\) #chkImpressaoCx \{ display: none !important; \}/, "o painel com os códigos não sai num Ctrl+P comum");
    regra(/\.chk-so-tela \{ display: none !important; \}/, "o aviso só da tela não sai no papel");
    regra(/body\.chk-imprimindo \* \{ visibility: hidden !important; \}/, "a impressão esconde tudo, menos o que foi pedido");
    regra(/body\.chk-imprimindo \.chk-recibo \{[^}]*break-before: page/, "o recibo começa numa folha à parte");
    regra(/body\.chk-imprimindo \.chk-etiqueta \{[^}]*break-inside: avoid/, "a etiqueta não parte no meio");
    regra(/body\.chk-imprimindo \.chk-alergia \{[^}]*border: 3px solid #000/, "a alergia sai com quadro grosso (impressora em preto e branco)");
    regra(/#abaCheckininfantil, #subMeupainelCheckininfantil, #chkSecaoAprovacoes, #chkSecaoFichas \{ display: none; \}/, "a aba e a sub-aba nascem escondidas");
    regra(/\.chk-btn \{[^}]*min-height: 48px/, "o botão tem pelo menos 48 px de altura (toque)");
    regra(/\.chk-rolagem \{[^}]*overflow-x: auto/, "a tabela do relatório rola dentro da própria caixa");
    regra(/\.chk-codigo \{[^}]*font-size: 2\.2rem/, "o código da etiqueta é grande");
    regra(/\.chk-alergia \{[^}]*font-weight: 800[^}]*background: var\(--cor-erro\)/, "a alergia se destaca na tela");
    regra(/#subMeupainelCheckininfantil \.psc-legenda[^{]*\{ color: #4B5563; \}/, "as legendas e os subtítulos da tela são escuros o bastante (4,5:1 sobre o fundo dos cartões)");
    regra(/\.chk-etiqueta \{[^}]*width: 7cm/, "a etiqueta tem 7 cm de largura");
    regra(/@media \(max-width: 640px\) \{\s*\.chk-acoes \.chk-btn, \.chk-barra \.chk-btn \{ flex: 1 1 100%; \}/, "no celular os botões ocupam a linha toda");
    regra(/@supports selector\(:has\(\*\)\)/, "onde o navegador sabe :has(), o resto da página sai da folha com display:none");
  });
};
