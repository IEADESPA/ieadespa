// cenarios-extra-c.js — a correção da revisão adversarial da tela (F1 a F8 e F12): o texto da autorização de saúde redesenhado quando muda, a resposta do check-in que se perde, o papel
// (lote por lote, a pergunta "saiu na impressora?", as classes do <body> até a resposta), a saída da sala com código não impresso, o catálogo que falta, o modal que sobrevive à sessão,
// a fila de Aprovações que empilha e corta em silêncio, o tempo-limite dos pedidos e o aviso de dado velho.
"use strict";

module.exports = function registrar(H) {
  const { cenario, confere, montar, limpo, achar, descendentes, chamadas, texto, visivel, clicarEResponder, esperar, esperaChegar, abrirMeuPainel, abrirSalaMeu, abrirAbaGestao, abrirSalaGestao,
    salaPronta, buscar, adicionarMembro, escolherQuemTrouxe, preencherOutraPessoa, enviarCheckin, checkinDoPedro, cartao, botoes, F, ATAQUE, MIN, imprimir } = H;

  const GESTOR = { membroId: 9, lideranca: true, gestao: true };
  const FORA_DO_AR = { status: 500, corpo: { sucesso: false, mensagem: "Erro interno ao processar o check-in infantil." } };
  const MSG_ENTRADA_PERDIDA = "Uma entrada foi registrada, mas você saiu da sala antes de ver o código. Entre de novo na sala e peça a segunda via.";
  const MSG_CONEXAO_CAIU = "A conexão caiu. Não sabemos se a entrada foi registrada. Confira na lista “Na sala” (a tela vai atualizar agora) antes de tentar de novo.";
  const MSG_CODIGO_SAIU = "Códigos de retirada que ainda não tinham sido impressos saíram da tela. Se precisar, peça a segunda via.";
  const MSG_SEM_OPCOES = "Não consegui carregar as opções do check-in. Toque em “Atualizar agora” e tente de novo.";
  const toastsComTipo = (env) => [...env.e("toastContainer").children].map(t => ({ texto: t.textContent, erro: /toast-erro/.test(t.className) }));
  const TEXTO_NOVO = { versao: 99, titulo: "TEXTO NOVO DA SAÚDE", itens: [{ texto: "Primeiro item do texto novo." }, { texto: "Segundo item do texto novo." }], aceite: "Concordo com o texto novo.", hash: "hash-do-texto-novo-1" };
  // um visitante com alergia entra na lista (o "concordo" do responsável vale para o texto que está na tela)
  const visitanteComSaude = async (env, nome = "Visitante Dez", nasc = "2022-04-04") => {
    env.e("chkCiVisNome").value = nome; env.e("chkCiVisNasc").value = nasc;
    env.doc.digitar(env.e("chkCiVisSaude"), "Asma"); env.doc.marcar(env.e("chkCiVisConcordo"), true);
    env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
  };
  // a criança já está na sala (check-in feito antes, com o código na mão do teste)
  const comCriancaPronta = async (op = {}) => { const c = await salaPronta(op); await buscar(c.env, "Pedro"); await adicionarMembro(c.env, 101); escolherQuemTrouxe(c.env, "201"); return c; };

  // ============================================================================================================================================
  // F1 — o texto da autorização de saúde do visitante
  // ============================================================================================================================================
  cenario("F1: o texto da autorização de saúde mudou — a tela mostra o texto NOVO, a caixa 'concordo' vem desmarcada e o hash enviado é o do texto mostrado", async () => {
    const c = await salaPronta(); const { S, env } = c;
    const antigo = F.mc.textoDe("SAUDE_CRACHA");
    await visitanteComSaude(env);
    confere(!!env.e("chkChip0") && env.e("chkCiVisTermoCx").textContent.includes(antigo.titulo), "o visitante com alergia entra na lista e o texto na tela é o antigo");
    S.textoSaudeNovo = TEXTO_NOVO;   // o texto mudou no servidor; a tela ainda não sabe
    preencherOutraPessoa(env, { tel: "11999990002" });
    env.limparRegistro(); await enviarCheckin(env);
    confere(chamadas(env, "POST checkin-infantil/checkin").length === 1 && chamadas(env, "GET checkin-infantil/catalogos").length === 1, "o servidor recusa (termoMudou) e a tela pede o catálogo de novo");
    const termo = env.e("chkCiVisTermoCx").textContent;
    confere(termo.includes("TEXTO NOVO DA SAÚDE") && termo.includes("Primeiro item do texto novo.") && termo.includes("Segundo item do texto novo.") && termo.includes("Concordo com o texto novo."), "o texto NA TELA passa a ser o novo: título, itens e a frase do aceite");
    confere(!termo.includes(antigo.titulo) && !termo.includes(antigo.itens[0].texto.slice(0, 40)) && !termo.includes(antigo.aceite.slice(0, 40)), "e nada do texto antigo fica na tela");
    confere(env.e("chkCiVisConcordo").checked === false && visivel(env, "chkCiVisTermoCx") && env.e("chkCiVisSaude").value === "Asma", "a caixa 'concordo' é nova e vem desmarcada; o texto novo está à vista junto da alergia que voltou ao formulário");
    confere(/mudou e já foi atualizado na tela/.test(texto(env, "chkCiVisMsg")) && /Visitante Dez saiu da lista/.test(texto(env, "chkCiVisMsg")), `a mensagem diz que o texto mudou e que já foi atualizado na tela: ${texto(env, "chkCiVisMsg")}`);
    confere(!!env.e("chkCiVisTermoTitulo") && env.e("chkCiVisTermoCx").getAttribute("aria-labelledby") === "chkCiVisTermoTitulo" && descendentes(env.e("chkCiVisTermoCx")).filter(x => x.localName === "input").length === 1, "o texto redesenhado continua sendo um grupo nomeado, com uma só caixa de concordância (nenhum id repetido)");
    // sem concordar de novo, nada entra; concordando, o hash enviado é o do texto que está na tela (o do catálogo novo)
    env.limparRegistro(); env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    confere(/precisa ler o texto e marcar que concorda/.test(texto(env, "chkCiVisMsg")) && !env.e("chkChip0"), "sem marcar a caixa nova, o visitante não volta à lista");
    env.doc.marcar(env.e("chkCiVisConcordo"), true); env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    env.limparRegistro(); await enviarCheckin(env);
    const p = chamadas(env, "POST checkin-infantil/checkin");
    confere(p.length === 1 && p[0].corpo.criancas[0].visitante.saude.textoHash === TEXTO_NOVO.hash && env.g("chkCatalogos").textoSaude.hash === TEXTO_NOVO.hash, `o hash enviado é o do texto mostrado (${p[0] && p[0].corpo.criancas[0].visitante.saude.textoHash})`);
    confere(!!env.e("chkImprimivel") && env.e("chkCiVisConcordo").checked === false, "o servidor aceita e o formulário volta limpo");
    limpo(env, "F1", []);
  });

  cenario("F1: o catálogo novo não carrega depois de 'texto mudou' — a tela diz isso, mantém o texto que tem (sem fingir que é o novo) e o formulário continua vivo", async () => {
    const c = await salaPronta(); const { S, env } = c;
    const antigo = F.mc.textoDe("SAUDE_CRACHA");
    await visitanteComSaude(env);
    S.textoSaudeNovo = TEXTO_NOVO;
    env.api.rotas["GET checkin-infantil/catalogos"] = FORA_DO_AR;
    preencherOutraPessoa(env, { tel: "11999990002" });
    env.limparRegistro(); await enviarCheckin(env);
    confere(/mudou, mas não consegui carregar o texto novo/.test(texto(env, "chkCiVisMsg")) && /Atualizar agora/.test(texto(env, "chkCiVisMsg")), `a mensagem diz que o texto novo não carregou: ${texto(env, "chkCiVisMsg")}`);
    confere(env.e("chkCiVisTermoCx").textContent.includes(antigo.titulo) && !env.e("chkCiVisTermoCx").textContent.includes("TEXTO NOVO") && env.e("chkCiVisConcordo").checked === false, "o texto na tela continua o antigo (a tela não finge) e a caixa vem desmarcada");
    confere(env.g("chkCatalogos") !== null && env.g("chkCatalogos").textoSaude.hash === antigo.hash, "o catálogo que a tela já tinha continua valendo (não é zerado)");
    // o formulário segue vivo: outro visitante entra normalmente (nada de TypeError por catálogo sumido)
    env.e("chkCiVisNome").value = "Visitante Onze"; env.e("chkCiVisNasc").value = "2021-05-05"; env.doc.digitar(env.e("chkCiVisSaude"), ""); env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    confere(!!env.e("chkChip0") && /Visitante Onze/.test(texto(env, "chkChip0")), "o formulário continua usável com o catálogo que a tela tinha");
  });

  // ============================================================================================================================================
  // F6 — o catálogo que some com a sala aberta
  // ============================================================================================================================================
  cenario("F6: o catálogo some com a sala aberta — cada ação avisa com a mesma frase (sem TypeError) e 'Atualizar agora' o busca de novo", async () => {
    const c = await salaPronta(); const { S, env } = c;
    await buscar(env, "Pedro");
    const a = S.semear({ menorId: 102, trouxeMembroId: 201 });
    await env.ev("chkLerSala(true)"); await env.ocioso();
    env.ev("chkCatalogos = null");
    env.limparRegistro();
    await adicionarMembro(env, 101);
    confere(texto(env, "chkCiBuscaMsg") === MSG_SEM_OPCOES && chamadas(env, "GET checkin-infantil/responsaveis").length === 0 && !env.e("chkChip0") && env.toasts().includes(MSG_SEM_OPCOES), "adicionar criança membro sem o catálogo: a frase certa, nada pedido, nada adicionado");
    env.e("chkCiVisNome").value = "Visitante Um"; env.e("chkCiVisNasc").value = "2020-05-20"; env.limparRegistro();
    env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    confere(texto(env, "chkCiVisMsg") === MSG_SEM_OPCOES && !env.e("chkChip0"), "adicionar visitante sem o catálogo: a frase certa");
    env.limparRegistro(); await enviarCheckin(env);
    confere(texto(env, "chkCiMsg") === MSG_SEM_OPCOES && chamadas(env, "POST checkin-infantil/checkin").length === 0, "registrar a entrada sem o catálogo: a frase certa e nada enviado");
    env.limparRegistro();
    env.doc.clicar(env.e(`chkRetirar${a.registroId}`)); await env.ocioso();
    confere(texto(env, "chkSalaMsg") === MSG_SEM_OPCOES && !env.e("chkRtPainel") && env.g("chkAcao") === null, "abrir a retirada sem o catálogo: a frase certa, o painel não abre");
    env.doc.clicar(env.e(`chkSegVia${a.registroId}`)); await env.ocioso();
    confere(texto(env, "chkSalaMsg") === MSG_SEM_OPCOES && !env.e("chkSvPainel") && env.g("chkAcao") === null, "abrir a segunda via sem o catálogo: a frase certa, o painel não abre");
    // "Atualizar agora" (a frase manda tocar nele) busca o catálogo de novo
    env.limparRegistro();
    env.doc.clicar(env.e("chkAtualizarBotao")); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/catalogos").length === 1 && env.g("chkCatalogos") !== null && chamadas(env, "GET checkin-infantil/sala").length === 1, "Atualizar agora pede o catálogo e lê a sala");
    await adicionarMembro(env, 101);
    confere(!!env.e("chkChip0") && /Pedro Souza/.test(texto(env, "chkChip0")), "com o catálogo de volta a criança entra na lista");
    // atualizar com o catálogo presente não o pede de novo
    env.limparRegistro(); env.doc.clicar(env.e("chkAtualizarBotao")); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/catalogos").length === 0, "com o catálogo presente, Atualizar agora só lê a sala");
  });

  // ============================================================================================================================================
  // F2 — a resposta do check-in que se perde depois de o servidor gravar
  // ============================================================================================================================================
  cenario("F2 (a): com a entrada a caminho, 'Voltar às salas' não sai ('Aguarde'); quando a resposta chega, o código aparece", async () => {
    const c = await comCriancaPronta(); const { S, env } = c;
    const presa = env.retem(x => x.chave === "POST checkin-infantil/checkin");
    env.doc.clicar(env.e("chkCiEnviar")); await esperaChegar(presa);
    env.limparRegistro();
    env.doc.clicar(env.e("chkVoltarBotao")); await env.ocioso();
    confere(!!env.e("chkSalaRaiz") && env.g("chkSala") !== null && env.toasts().includes("Aguarde: a entrada está sendo registrada.") && !env.modal().aberto, "Voltar às salas com a entrada a caminho: a tela avisa 'Aguarde' e a sala fica");
    presa.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    const reg = S.registros[S.registros.length - 1];
    confere(!!env.e("chkImprimivel") && env.e("chkCodigo0x0").textContent === S.codigoDe(reg.registroId), "a resposta chega com a sala ainda aberta: o código aparece");
    env.doc.clicar(env.e("chkVoltarBotao")); await env.ocioso();
    confere(env.modal().aberto, "agora o botão volta a funcionar (a trava soltou): ele pergunta pelo código não impresso");
    await env.responderModal(false);
  });

  cenario("F2 (b): a pessoa saiu da sala enquanto o pedido ia e voltava — a entrada foi gravada e a tela diz, sem nome nem código, o que fazer", async () => {
    const c = await comCriancaPronta(); const { S, env } = c;
    const antes = S.registros.length;
    const presa = env.retem(x => x.chave === "POST checkin-infantil/checkin");
    env.doc.clicar(env.e("chkCiEnviar")); await esperaChegar(presa);
    env.ev("chkAbaMudou('protecao')"); await env.ocioso();   // a pessoa foi para outra aba: a sala sai
    confere(env.g("chkSala") === null, "a sala saiu (outra aba)");
    env.limparRegistro();
    presa.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    const reg = S.registros[S.registros.length - 1], cod = S.codigoDe(reg.registroId);
    confere(S.registros.length === antes + 1, "o servidor gravou a criança");
    confere(env.toasts().length === 1 && env.toasts()[0] === MSG_ENTRADA_PERDIDA && toastsComTipo(env)[0].erro, `um aviso de erro, com a frase certa: ${env.toasts().join("|")}`);
    confere(!env.toasts().join("|").includes(cod) && !env.toasts().join("|").includes("Pedro") && !env.doc.body.innerHTML.includes(cod) && env.g("chkImpressao") === null, "sem nome, sem código, em lugar nenhum");
    confere(env.gravacoes.length === 0 && !env.saidaConsole.join("").includes(cod), "e nada em armazenamento nem console");
    // quem saiu da SESSÃO (outro login) não recebe o aviso: ele seria de outra pessoa
    const d = await comCriancaPronta();
    const presa2 = d.env.retem(x => x.chave === "POST checkin-infantil/checkin");
    d.env.doc.clicar(d.env.e("chkCiEnviar")); await esperaChegar(presa2);
    d.env.ev("limparSessao()"); await d.env.ocioso(); d.env.limparRegistro();
    presa2.liberar(); await d.env.ocioso(); d.env.api.retencoes.length = 0;
    confere(!d.env.toasts().some(t => /Uma entrada foi registrada/.test(t)), "a resposta que chega depois de a SESSÃO acabar não mostra o aviso (a tela já não é da mesma pessoa)");
  });

  cenario("F2 (c): a conexão cai depois de o servidor gravar — a tela manda conferir a lista 'Na sala', e já a atualiza", async () => {
    const c = await comCriancaPronta(); const { S, env } = c;
    const antes = S.registros.length;
    env.api.rotas["POST checkin-infantil/checkin"] = (cham) => Object.assign({}, S.responder(cham), { perdeuAResposta: true });
    env.limparRegistro(); await enviarCheckin(env);
    confere(S.registros.length === antes + 1, "o servidor gravou a entrada");
    confere(texto(env, "chkCiMsg") === MSG_CONEXAO_CAIU && /psc-aviso/.test(env.e("chkCiMsg").className), `a mensagem na tela é a nova, em destaque: ${texto(env, "chkCiMsg")}`);
    const reg = S.registros[S.registros.length - 1];
    confere(chamadas(env, "GET checkin-infantil/sala").length === 1 && !!cartao(env, reg.registroId), "a tela lê a sala na hora: a criança já aparece na lista 'Na sala'");
    confere(!!env.e("chkChip0") && env.g("chkImpressao") === null, "o formulário continua preenchido e nenhum código aparece (ele só sai pela segunda via)");
    // 5xx com JSON (o servidor respondeu: nada foi gravado) NÃO usa a frase da conexão
    env.api.rotas["POST checkin-infantil/checkin"] = FORA_DO_AR;
    env.limparRegistro(); await enviarCheckin(env);
    confere(/Erro interno/.test(texto(env, "chkCiMsg")) && !/A conexão caiu/.test(texto(env, "chkCiMsg")), "uma recusa do servidor (JSON) mostra a mensagem dele, não a da conexão");
  });

  cenario("F2/F12: o tempo-limite de 20 s vai em todo pedido; estourar vira falha de rede (o envio manda conferir a lista; a leitura tenta de novo); sem AbortSignal.timeout segue como antes", async () => {
    const c = await comCriancaPronta(); const { S, env } = c;
    const pedidos = [], disparos = [];
    env.ctx.AbortSignal = { timeout: (ms) => { const ac = new AbortController(); pedidos.push(ms); disparos.push(() => ac.abort()); return ac.signal; } };
    env.limparRegistro();
    const presa = env.retem(x => x.chave === "POST checkin-infantil/checkin");
    env.doc.clicar(env.e("chkCiEnviar")); await esperaChegar(presa);
    const post = chamadas(env, "POST checkin-infantil/checkin")[0];
    confere(!!post && post.temSinal === true && pedidos.length >= 1 && pedidos.every(ms => ms === 20000), `o pedido leva o sinal de tempo-limite de 20 s (${pedidos.join(",")})`);
    disparos[disparos.length - 1](); await env.ocioso(); env.api.retencoes.length = 0;
    confere(texto(env, "chkCiMsg") === MSG_CONEXAO_CAIU && env.toasts().some(t => /Não foi possível conectar ao servidor/.test(t)), "o envio que estoura o tempo vira falha de rede: manda conferir a lista");
    // a leitura que estoura libera a vaga: o tique seguinte pede de novo
    env.limparRegistro();
    const lenta = env.retem(x => x.chave === "GET checkin-infantil/sala");
    env.tique(); await esperaChegar(lenta);
    env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/sala").length === 1 && chamadas(env, "GET checkin-infantil/sala")[0].temSinal === true, "com a leitura a caminho, o tique seguinte não empilha; a leitura leva o sinal");
    disparos[disparos.length - 1](); await env.ocioso(); env.api.retencoes.length = 0;
    confere(/Não foi possível atualizar agora/.test(texto(env, "chkSalaMsg")), "a leitura que estoura o tempo avisa e tenta de novo");
    env.limparRegistro(); env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/sala").length === 1, "e a vaga foi liberada: o tique seguinte pede de novo");
    // navegador velho (sem AbortSignal.timeout): o pedido sai sem sinal e funciona
    env.ctx.AbortSignal = undefined;
    env.limparRegistro(); env.tique(); await env.ocioso();
    const g = chamadas(env, "GET checkin-infantil/sala");
    confere(g.length === 1 && g[0].temSinal === false && texto(env, "chkSalaMsg") === "", "sem AbortSignal.timeout o pedido segue sem tempo-limite e a sala atualiza");
  });

  // ============================================================================================================================================
  // F3 — o papel: lote por lote, a pergunta, as classes do <body>
  // ============================================================================================================================================
  cenario("F3: duas famílias seguidas — o papel da segunda NÃO leva o código da primeira (já impressa), que sai da tela e da memória", async () => {
    const c = await salaPronta(); const { env } = c;
    const a = await checkinDoPedro(c, 101);
    confere(/Ainda não impresso/.test(texto(env, "chkLoteEstado0")), "a primeira família chega: lote 'Ainda não impresso'");
    await imprimir(env, true);
    confere(/✅ Impresso/.test(texto(env, "chkLoteEstado0")) && env.impressoes.length === 1 && env.impressoes[0].alvos.join() === "chkLote0" && env.impressoes[0].textoAlvos.includes(a.codigo), "a primeira impressão leva só o lote 0 (a primeira família) e a tela passa a dizer 'Impresso'");
    const b = await checkinDoPedro(c, 102);
    confere(env.g("chkImpressao").lotes.length === 1 && !env.doc.body.innerHTML.includes(a.codigo) && env.e("chkCodigo0x0").textContent === b.codigo, "a segunda família chega: o lote impresso sai do DOM e da memória (o código da primeira não está mais em lugar nenhum)");
    await imprimir(env, true);
    const i2 = env.impressoes[1];
    confere(env.impressoes.length === 2 && i2.alvos.join() === "chkLote0" && i2.textoAlvos.includes(b.codigo) && !i2.textoAlvos.includes(a.codigo) && i2.lotesNaTela.join() === "chkLote0", "a segunda impressão leva só a segunda família, sem o código da primeira");
    confere(env.gravacoes.length === 0 && !env.saidaConsole.join("").includes(a.codigo), "o código da primeira família nunca foi a armazenamento nem a console");
  });

  cenario("F3: a primeira família NÃO foi impressa e a segunda chega — os dois lotes ficam, e o papel leva os dois; nada impresso, nada perdido", async () => {
    const c = await salaPronta(); const { env } = c;
    const a = await checkinDoPedro(c, 101);
    const b = await checkinDoPedro(c, 102);
    confere(env.g("chkImpressao").lotes.length === 2 && env.e("chkCodigo0x0").textContent === a.codigo && env.e("chkCodigo1x0").textContent === b.codigo, "os dois lotes continuam na tela e na memória");
    confere(/Ainda não impresso/.test(texto(env, "chkLoteEstado0")) && /Ainda não impresso/.test(texto(env, "chkLoteEstado1")), "os dois mostram 'Ainda não impresso'");
    await imprimir(env, true);
    const i = env.impressoes[0];
    confere(i.alvos.join() === "chkLote0,chkLote1" && i.textoAlvos.includes(a.codigo) && i.textoAlvos.includes(b.codigo), "a impressão leva os dois lotes (os dois ainda não impressos)");
    confere(env.g("chkImpressao").lotes.every(l => l.impresso) && /✅ Impresso/.test(texto(env, "chkLoteEstado0")) && /✅ Impresso/.test(texto(env, "chkLoteEstado1")), "e os dois passam a 'Impresso'");
    // nada pendente: imprimir de novo reimprime o que está na tela
    await imprimir(env, true);
    const r = env.impressoes[1];
    confere(env.impressoes.length === 2 && r.alvos.join() === "chkLote0,chkLote1" && r.textoAlvos.includes(a.codigo) && r.textoAlvos.includes(b.codigo), "sem nada pendente, 'Imprimir' reimprime todos os lotes que estão na tela");
    // fechar com tudo impresso: sem pergunta
    env.doc.clicar(env.e("chkFecharImpressaoBotao")); await env.ocioso();
    confere(!env.modal().aberto && env.g("chkImpressao") === null && !env.doc.body.innerHTML.includes(a.codigo), "tudo impresso: fechar apaga sem perguntar");
  });

  cenario("F3: impressão cancelada ('Cancelar' na pergunta) — continua NÃO impressa e fechar ainda pergunta; o diálogo que falha também pergunta", async () => {
    const c = await salaPronta(); const { env } = c;
    const a = await checkinDoPedro(c, 101);
    const m = await imprimir(env, false);
    confere(m.aberto && /saíram na impressora/.test(m.texto) && /Se não saíram, toque em Cancelar e imprima de novo/.test(m.texto), "a pergunta diz o que fazer se não saiu");
    confere(env.g("chkImpressao").lotes[0].impresso === false && /Ainda não impresso/.test(texto(env, "chkLoteEstado0")), "respondeu 'Cancelar': o lote continua não impresso (e a tela diz isso)");
    confere(!/chk-imprimindo|chk-imp-/.test(env.doc.body.className) && !/chk-lote-alvo/.test(env.e("chkLote0").className), "as classes saíram do <body> e a marca saiu do lote");
    confere(env.foco() === env.e("chkImprimirBotao"), "o foco volta ao botão Imprimir");
    const f = await clicarEResponder(env, env.e("chkFecharImpressaoBotao"), false);
    confere(f.aberto && /NÃO foram impressos/.test(f.texto) && env.e("chkCodigo0x0").textContent === a.codigo, "fechar ainda pergunta (o código não impresso), e cancelar o mantém");
    // imprimir de novo e confirmar
    await imprimir(env, true);
    confere(env.impressoes.length === 2 && env.g("chkImpressao").lotes[0].impresso === true, "imprimir de novo e responder 'Sim, saíram': agora conta como impresso");
    // o navegador recusa window.print(): a pergunta aparece do mesmo jeito e as classes saem
    const d = await salaPronta(); await checkinDoPedro(d, 101);
    d.env.ctx.print = () => { throw new Error("impressão bloqueada"); };
    const m2 = await imprimir(d.env, false);
    confere(m2.aberto && !/chk-imprimindo|chk-imp-/.test(d.env.doc.body.className) && d.env.g("chkImpressao").lotes[0].impresso === false, "com a impressão recusada pelo navegador: a pergunta aparece, as classes saem, o lote segue não impresso");
  });

  cenario("F3: as classes de impressão ficam no <body> até a resposta da pergunta (no celular o print() volta antes da prévia); duplo toque não imprime duas vezes", async () => {
    const c = await salaPronta(); const { env } = c;
    await checkinDoPedro(c, 101);
    env.e("chkImprimirBotao").focus(); env.doc.clicar(env.e("chkImprimirBotao")); await env.ocioso();
    confere(env.modal().aberto && env.impressoes.length === 1, "a pergunta está aberta e o diálogo de impressão já foi pedido");
    confere(/chk-imprimindo/.test(env.doc.body.className) && /chk-imp-etiquetas/.test(env.doc.body.className), "com a pergunta aberta as classes AINDA estão no <body>");
    confere(/chk-lote-alvo/.test(env.e("chkLote0").className), "e o lote que vai ao papel continua marcado");
    env.limparRegistro();
    env.doc.clicar(env.e("chkImprimirBotao")); await env.ocioso();
    confere(env.impressoes.length === 1 && env.toasts().includes("Aguarde: a impressão anterior ainda está sendo confirmada."), "um segundo toque no Imprimir, com a pergunta aberta: 'Aguarde', e uma só impressão");
    await env.responderModal(true); await env.ocioso();
    confere(!/chk-imprimindo|chk-imp-/.test(env.doc.body.className) && !/chk-lote-alvo/.test(env.e("chkLote0").className), "só depois da resposta as classes e a marca saem");
    confere(env.foco() === env.e("chkImprimirBotao"), "o foco volta ao botão Imprimir");
    env.doc.clicar(env.e("chkImprimirBotao")); await env.ocioso(); await env.responderModal(true);
    confere(env.impressoes.length === 2, "e a trava foi solta: dá para imprimir de novo");
  });

  cenario("F3: a pessoa sai da sala com a pergunta aberta — nenhuma classe fica no <body> e nada é escrito numa tela que já não é dela", async () => {
    const c = await salaPronta(); const { env } = c;
    const a = await checkinDoPedro(c, 101);
    env.doc.clicar(env.e("chkImprimirBotao")); await env.ocioso();
    confere(env.modal().aberto && /chk-imprimindo/.test(env.doc.body.className), "pergunta aberta, classes no <body>");
    env.limparRegistro();
    env.ev("chkAbaMudou('protecao')"); await env.ocioso();   // saiu da sala (outra aba) com a pergunta aberta
    confere(!/chk-imprimindo|chk-imp-/.test(env.doc.body.className) && env.g("chkImpressao") === null && !env.doc.body.innerHTML.includes(a.codigo), "a sala saiu: o <body> não guarda classe nenhuma e o código sumiu");
    confere(env.toasts().includes(MSG_CODIGO_SAIU), "e o aviso de código que saiu sem confirmação de impressão aparece");
    await env.responderModal(true); await env.ocioso();
    confere(!/chk-imprimindo|chk-imp-/.test(env.doc.body.className) && env.g("chkImpressao") === null && env.g("chkSala") === null && env.e("chkImpressaoCx") === null, "responder a pergunta depois não escreve nada nem deixa classe");
  });

  cenario("F3: a família seguinte chega com a pergunta aberta — o lote que está indo ao papel continua marcado; só ele fica 'Impresso'; a próxima impressão leva só o novo", async () => {
    const c = await salaPronta(); const { env } = c;
    const a = await checkinDoPedro(c, 101);
    env.e("chkImprimirBotao").focus(); env.doc.clicar(env.e("chkImprimirBotao")); await env.ocioso();
    const b = await checkinDoPedro(c, 102);
    confere(env.g("chkImpressao").lotes.length === 2 && /chk-imprimindo/.test(env.doc.body.className), "chegou a segunda família: dois lotes, classes ainda no <body>");
    confere(/chk-lote-alvo/.test(env.e("chkLote0").className) && !/chk-lote-alvo/.test(env.e("chkLote1").className), "a tela foi refeita e o lote que está sendo impresso (só ele) continua marcado");
    await env.responderModal(true); await env.ocioso();
    confere(env.g("chkImpressao").lotes[0].impresso === true && env.g("chkImpressao").lotes[1].impresso === false && /✅ Impresso/.test(texto(env, "chkLoteEstado0")) && /Ainda não impresso/.test(texto(env, "chkLoteEstado1")), "só a primeira ficou 'Impresso'; a segunda segue pendente");
    await imprimir(env, true);
    const i = env.impressoes[1];
    confere(i.alvos.join() === "chkLote1" && i.textoAlvos.includes(b.codigo) && !i.textoAlvos.includes(a.codigo), "a próxima impressão leva só a família que ainda não tinha sido impressa");
  });

  cenario("F3: fechar o painel e voltar às salas perguntam enquanto houver QUALQUER lote não impresso (e não perguntam com tudo impresso)", async () => {
    const c = await salaPronta(); const { env } = c;
    await checkinDoPedro(c, 101);
    env.e("chkImprimirBotao").focus(); env.doc.clicar(env.e("chkImprimirBotao")); await env.ocioso();
    await checkinDoPedro(c, 102);
    await env.responderModal(true); await env.ocioso();   // a primeira impressa, a segunda não
    const m1 = await clicarEResponder(env, env.e("chkVoltarBotao"), false);
    confere(m1.aberto && /NÃO foram impressos/.test(m1.texto) && !!env.e("chkSalaRaiz"), "voltar às salas com um lote ainda não impresso pergunta");
    const m2 = await clicarEResponder(env, env.e("chkFecharImpressaoBotao"), false);
    confere(m2.aberto && /NÃO foram impressos/.test(m2.texto) && !!env.e("chkCodigo1x0"), "fechar o painel também pergunta");
    await imprimir(env, true);
    const m3 = await clicarEResponder(env, env.e("chkVoltarBotao"), false);
    confere(!m3.aberto && env.g("chkSala") === null, "com tudo impresso, voltar às salas sai direto");
  });

  cenario("F3: a segunda via mostra a entrada ORIGINAL e '2ª via emitida às' na etiqueta e no recibo (tela e papel); a de 'Ainda não impresso' vale também para ela", async () => {
    const c = await salaPronta({ ataque: true }); const { S, env } = c;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 });   // entrada às 09:30
    await env.ev("chkLerSala(true)"); await env.ocioso();
    env.doc.clicar(env.e(`chkSegVia${a.registroId}`)); await env.ocioso();
    env.doc.escolher(env.e("chkSvQuem"), "RESP:201"); env.e("chkSvDoc").value = "RG";
    env.doc.disparar(env.e("chkSvForm"), "submit"); await env.ocioso();
    S.agoraMs += 9 * MIN;   // 09:39 (o pedido vale 10 minutos)
    S.definirSessao({ membroId: 42, lideranca: false, gestao: false }); env.sessao({ matricula: 42, pin: true });
    await abrirSalaMeu(env);
    await clicarEResponder(env, env.e(`chkConfSegVia${a.registroId}`), true);
    const etq = texto(env, "chkEtq0x0"), rec = texto(env, "chkRecibo0");
    confere(/Entrada às 09:30/.test(etq) && /2ª via emitida às 09:39/.test(etq) && !/Entrada às 09:39/.test(etq), `a etiqueta: entrada original e a hora da segunda via (${etq.slice(-60)})`);
    confere(/Entrada às 09:30/.test(rec) && /2ª via emitida às 09:39/.test(rec) && !/Entrada às 09:39/.test(rec), "o recibo: o mesmo");
    confere(!!env.e("chkEtqVia0x0") && !!env.e("chkReciboVia0") && !/chk-so-tela/.test(env.e("chkEtqVia0x0").className) && !/chk-so-tela/.test(env.e("chkReciboVia0").className), "as duas linhas saem no papel (não são só da tela)");
    confere(/Ainda não impresso/.test(texto(env, "chkLoteEstado0")) && env.g("chkImpressao").lotes[0].tipo === "SEGUNDA_VIA", "a etiqueta da segunda via também é um lote que nasce 'Ainda não impresso'");
    // check-in comum: sem a linha da segunda via
    const d = await salaPronta(); await checkinDoPedro(d, 101);
    confere(!d.env.e("chkEtqVia0x0") && !d.env.e("chkReciboVia0") && !/2ª via/.test(texto(d.env, "chkImprimivel")), "o check-in comum não leva a linha '2ª via'");
    limpo(env, "F3 segunda via", []);
  });

  // ============================================================================================================================================
  // F4 — sair da aba, um 404 passageiro e o fechamento da página não apagam código não impresso sem avisar
  // ============================================================================================================================================
  cenario("F4 (a): código não impresso que sai da tela (outra aba, sub-aba, relógio, erro de acesso) avisa; já impresso, ou já perguntado, não avisa", async () => {
    // outra aba
    const c = await salaPronta(); await checkinDoPedro(c, 101);
    c.env.limparRegistro(); c.env.ev("chkAbaMudou('protecao')"); await c.env.ocioso();
    confere(c.env.toasts().includes(MSG_CODIGO_SAIU) && toastsComTipo(c.env).find(t => t.texto === MSG_CODIGO_SAIU).erro && c.env.g("chkImpressao") === null, "trocar de aba com o código não impresso: aviso de erro dizendo que saiu e que há a segunda via");
    // outra sub-aba do Meu Painel
    const s = await salaPronta(); await checkinDoPedro(s, 101);
    s.env.limparRegistro(); s.env.ev("chkSubAbaMudou('protecao')"); await s.env.ocioso();
    confere(s.env.toasts().includes(MSG_CODIGO_SAIU), "trocar de sub-aba: o mesmo aviso");
    // o relógio fecha a sala porque a tela sumiu
    const t = await salaPronta(); await checkinDoPedro(t, 101);
    t.env.e("subMeupainelCheckininfantil").style.display = "none"; t.env.limparRegistro(); t.env.tique(); await t.env.ocioso();
    confere(t.env.g("chkSala") === null && t.env.toasts().includes(MSG_CODIGO_SAIU), "o relógio que fecha a sala (a tela sumiu) também avisa");
    // erro de acesso: a sala sai com a mensagem do servidor E o aviso do código
    const e = await salaPronta(); await checkinDoPedro(e, 101);
    e.env.api.rotas["GET checkin-infantil/sala"] = { status: 403, corpo: { sucesso: false, mensagem: "Você não está escalado nesta sala." } };
    e.env.limparRegistro(); e.env.tique(); await e.env.ocioso();
    confere(e.env.g("chkSala") === null && e.env.toasts().includes(MSG_CODIGO_SAIU) && e.env.toasts().some(x => /Você não está escalado/.test(x)), "a sala que sai por perda de acesso avisa do código e diz o motivo");
    // já impresso: sem aviso
    const d = await salaPronta(); await checkinDoPedro(d, 101); await imprimir(d.env, true);
    d.env.limparRegistro(); d.env.ev("chkAbaMudou('protecao')"); await d.env.ocioso();
    confere(!d.env.toasts().includes(MSG_CODIGO_SAIU), "com o código já impresso, sair não avisa de nada");
    // já perguntado (Voltar às salas): só a pergunta, sem o aviso por cima
    const f = await salaPronta(); await checkinDoPedro(f, 101);
    f.env.limparRegistro(); await clicarEResponder(f.env, f.env.e("chkVoltarBotao"), true);
    confere(f.env.g("chkSala") === null && !f.env.toasts().includes(MSG_CODIGO_SAIU), "quem confirmou 'Sair e apagar' já foi avisado pela pergunta: nenhum aviso repetido");
    // sem código nenhum: sem aviso
    const g = await salaPronta(); g.env.limparRegistro(); g.env.ev("chkAbaMudou('protecao')"); await g.env.ocioso();
    confere(g.env.toasts().length === 0, "sem código na tela, sair não avisa de nada");
  });

  cenario("F4 (b): um 404/422 passageiro (sem JSON, ou sem mensagem) NÃO tira a pessoa da sala nem apaga os códigos; 403 e recusa do servidor com mensagem tiram", async () => {
    const c = await salaPronta(); const { env } = c;
    const a = await checkinDoPedro(c, 101);
    for (const [rotulo, rota] of [["404 com página do proxy", { status: 404, corpo: "<html>Not Found</html>", naoJson: true }], ["422 com página do proxy", { status: 422, corpo: "<html>x</html>", naoJson: true }],
      ["404 em JSON sem mensagem", { status: 404, corpo: {} }], ["422 em JSON sem mensagem", { status: 422, corpo: { sucesso: false } }]]) {
      env.api.rotas["GET checkin-infantil/sala"] = rota;
      env.limparRegistro(); env.tique(); await env.ocioso();
      confere(!!env.e("chkSalaRaiz") && env.g("chkSala") !== null && env.e("chkCodigo0x0") && env.e("chkCodigo0x0").textContent === a.codigo, `${rotulo}: a sala e o código continuam na tela`);
      confere(/Não foi possível atualizar agora\. A tela tenta de novo em instantes/.test(texto(env, "chkSalaMsg")), `${rotulo}: a tela diz que tenta de novo (falha passageira)`);
      env.ev("chkFalhas = 0");
    }
    // a falha passageira conta para as três falhas seguidas
    env.api.rotas["GET checkin-infantil/sala"] = { status: 404, corpo: "<html>x</html>", naoJson: true };
    env.tique(); await env.ocioso(); env.tique(); await env.ocioso(); env.tique(); await env.ocioso();
    confere(/A atualização automática parou/.test(texto(env, "chkSalaMsg")) && env.intervalos.size === 0 && !!env.e("chkSalaRaiz"), "três falhas passageiras seguidas param o relógio, sem tirar a pessoa da sala");
    // 404 e 422 COM resposta do servidor que traz a mensagem: a sala sai
    for (const [status, msg] of [[404, "Sala não encontrada."], [422, "Esta equipe deixou de ser de contato com menores."]]) {
      const d = await salaPronta(); d.env.api.rotas["GET checkin-infantil/sala"] = { status, corpo: { sucesso: false, mensagem: msg } };
      d.env.tique(); await d.env.ocioso();
      confere(!d.env.e("chkSalaRaiz") && texto(d.env, "chkMeuMsg").includes(msg), `${status} com a mensagem do servidor: a sala sai e a mensagem aparece`);
    }
    // 403 sai mesmo com a página do proxy no lugar do JSON (sem acesso é sem acesso)
    const e = await salaPronta(); e.env.api.rotas["GET checkin-infantil/sala"] = { status: 403, corpo: "<html>Forbidden</html>", naoJson: true };
    e.env.tique(); await e.env.ocioso();
    confere(!e.env.e("chkSalaRaiz") && e.env.g("chkSala") === null, "403 tira a pessoa da sala");
  });

  cenario("F4 (c): com código não impresso na tela, fechar a aba ou recarregar pede a confirmação do navegador (beforeunload); sem código ou já impresso, não", async () => {
    const c = await salaPronta(); const { env } = c;
    const sem = env.dispararJanela("beforeunload");
    confere(sem.ouvintes === 1, `o módulo registra UM ouvinte de beforeunload (${sem.ouvintes})`);
    confere(sem.evento.defaultPrevented === false && sem.evento.returnValue === undefined, "sem código na tela, o navegador fecha sem perguntar");
    await checkinDoPedro(c, 101);
    const com = env.dispararJanela("beforeunload");
    confere(com.evento.defaultPrevented === true && com.evento.returnValue === "", "com o código não impresso: preventDefault e returnValue vazio (o navegador pergunta)");
    await imprimir(env, true);
    const dep = env.dispararJanela("beforeunload");
    confere(dep.evento.defaultPrevented === false && dep.evento.returnValue === undefined, "com o código já impresso, o navegador fecha sem perguntar");
    await checkinDoPedro(c, 102);
    confere(env.dispararJanela("beforeunload").evento.defaultPrevented === true, "um código novo volta a pedir a confirmação");
    env.ev("chkAbaMudou('protecao')"); await env.ocioso();
    confere(env.dispararJanela("beforeunload").evento.defaultPrevented === false, "depois de o código sair da tela, não pede mais");
    // o módulo carrega sem addEventListener na janela (navegador velho ou ambiente sem ele): sem erro
    const sem2 = montar({ semModulo: true }); let erro = null;
    try { sem2.env.ctx.addEventListener = undefined; sem2.env.ev(sem2.env.lerMutado("modulos/checkin-infantil.js")); } catch (e) { erro = e; }
    confere(erro === null, `sem window.addEventListener o módulo carrega sem erro (${erro && erro.message})`);
  });

  // ============================================================================================================================================
  // F7 — o modal com o nome da criança não sobrevive à sessão que acabou
  // ============================================================================================================================================
  cenario("F7: o modal 'Aprovar a retirada de X?' fecha quando a sessão acaba (401) — e o modal de outra tela não é tocado enquanto a sessão vive", async () => {
    const c = montar({ sessao: GESTOR, fatorFresco: true }); const { S, env } = c;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 });
    S.pedirDivergencia(a.registroId, { nome: "Tia Zeza", parentesco: "TIO", documento: "CNH", operadorId: 42 });
    await abrirSalaGestao(env);
    env.e(`chkAprovar${a.registroId}`).focus(); env.doc.clicar(env.e(`chkAprovar${a.registroId}`)); await env.ocioso();
    confere(env.modal().aberto && /Aprovar a retirada de Pedro Souza/.test(env.modal().texto), "o modal com o nome da criança está aberto");
    env.api.rotas["GET checkin-infantil/sala"] = { status: 401, corpo: { sucesso: false, mensagem: "Sessão inválida." } };
    env.tique(); await env.ocioso();
    confere(env.g("authToken") === null && !env.modal().aberto && env.e("modalCaixa").innerHTML === "" && !/Pedro Souza/.test(env.e("modalCaixa").textContent), "a sessão acabou: o modal fechou e o nome da criança não ficou na tela");
    // pedido de texto (motivo) aberto: o mesmo
    const d = montar({ sessao: GESTOR, fatorFresco: true });
    const b = d.S.semear({ menorId: 101, trouxeMembroId: 201 });
    d.S.pedirDivergencia(b.registroId, { nome: "Tia Zeza", parentesco: "TIO", documento: "CNH", operadorId: 42 });
    await abrirSalaGestao(d.env);
    d.env.doc.clicar(d.env.e(`chkAprovar${b.registroId}`)); await d.env.responderModal(true); await d.env.ocioso();
    confere(d.env.modal().aberto, "o pedido do motivo está aberto");
    d.env.ev("limparSessao()"); await d.env.ocioso();
    confere(!d.env.modal().aberto, "sair da sessão fecha o pedido do motivo também");
  });

  // ============================================================================================================================================
  // F8 — a fila de Aprovações não empilha pedidos e não corta salas em silêncio
  // ============================================================================================================================================
  cenario("F8: a fila de Aprovações não empilha rodadas — com uma a caminho, os tiques esperam; o ato da pessoa e a volta à página pedem mesmo assim", async () => {
    const c = montar({ sessao: GESTOR }); const { S, env } = c;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 }); S.pedirDivergencia(a.registroId, { nome: "Tia Zeza", parentesco: "TIO", documento: "CNH", operadorId: 42 });
    await abrirAbaGestao(env);
    env.doc.clicar(env.e("btnChkSecaoAprovacoes")); await env.ocioso();
    confere(env.intervalos.size === 1, "a fila está aberta e o relógio roda");
    env.limparRegistro();
    const presa = env.retem(x => x.chave === "GET checkin-infantil/minhas-salas");
    env.tique(); await esperaChegar(presa);
    env.tique(); env.tique(); env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/minhas-salas").length === 1 && chamadas(env, "GET checkin-infantil/sala").length === 0, "três tiques com a rodada anterior ainda a caminho: nenhum pedido a mais");
    // o ato da pessoa (tocar em Atualizar) pede mesmo assim
    env.doc.clicar(achar(env, x => x.localName === "button" && x.getAttribute("data-on-click") === "chkCarregarAprovacoesAcao" && x.parentNode.parentNode === env.e("chkSecaoAprovacoes"))); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/minhas-salas").length === 2, "tocar em Atualizar pede de novo mesmo com a rodada anterior a caminho (a resposta mais nova vence)");
    presa.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    confere(!!cartao(env, a.registroId), "a resposta velha que chega depois não desfaz a nova");
    // voltou o pedido: o próximo tique pede de novo
    env.limparRegistro(); env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/minhas-salas").length === 1, "terminada a rodada, o tique seguinte pede de novo");
    // a volta à página força a leitura mesmo com a rodada a caminho
    env.limparRegistro();
    const presa2 = env.retem(x => x.chave === "GET checkin-infantil/minhas-salas");
    env.tique(); await esperaChegar(presa2);
    env.doc.visibilityState = "hidden"; env.doc.disparar(env.doc, "visibilitychange");
    env.doc.visibilityState = "visible"; env.doc.disparar(env.doc, "visibilitychange"); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/minhas-salas").length === 2, "voltar à página com uma rodada a caminho: a leitura é forçada");
    presa2.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    // sair da seção zera o contador: depois de voltar, o primeiro tique pede
    const presa3 = env.retem(x => x.chave === "GET checkin-infantil/minhas-salas");
    env.limparRegistro(); env.tique(); await esperaChegar(presa3);
    env.doc.clicar(env.e("btnChkSecaoSalas")); await env.ocioso();
    env.doc.clicar(env.e("btnChkSecaoAprovacoes")); await env.ocioso();
    env.limparRegistro(); env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/minhas-salas").length >= 1, "sair da seção e voltar zera a rodada a caminho: o tique pede");
    presa3.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
  });

  cenario("F8: mais de 15 salas com crianças — a fila lê 15 e AVISA o corte ('Mostrando as 15 primeiras salas de N'); com 15 ou menos, nenhum aviso", async () => {
    const c = montar({ sessao: GESTOR }); const { S, env } = c;
    S.semear({ menorId: 101, trouxeMembroId: 201 });
    for (let i = 0; i < 16; i++) { S.salas.push(Object.assign({}, S.salas[0], { servicoId: 700 + i, equipeId: 70 + i, voluntarios: [], escalados: [] })); S.semear({ sala: 700 + i, visitante: { nome: `Visitante C${i}`, nascimento: "2021-01-01" } }); }
    await abrirAbaGestao(env);
    env.limparRegistro();
    env.doc.clicar(env.e("btnChkSecaoAprovacoes")); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/sala").length === 15, `só 15 salas são lidas (${chamadas(env, "GET checkin-infantil/sala").length})`);
    confere(/Mostrando as 15 primeiras salas de 17\. Abra a sala para ver o resto\./.test(texto(env, "chkAprMsg")) && /psc-aviso/.test(env.e("chkAprMsg").className), `o corte é avisado, em destaque: ${texto(env, "chkAprMsg")}`);
    confere(/nas salas consultadas/.test(texto(env, "chkAprovacoesLista")) && !/Nada espera a liderança agora/.test(texto(env, "chkAprovacoesLista")), "a lista vazia não finge que nada espera em TODAS as salas");
    // 15 salas: sem aviso
    const d = montar({ sessao: GESTOR }); d.S.semear({ menorId: 101, trouxeMembroId: 201 });
    for (let i = 0; i < 14; i++) { d.S.salas.push(Object.assign({}, d.S.salas[0], { servicoId: 700 + i, equipeId: 70 + i, voluntarios: [], escalados: [] })); d.S.semear({ sala: 700 + i, visitante: { nome: `Visitante C${i}`, nascimento: "2021-01-01" } }); }
    await abrirAbaGestao(d.env); d.env.limparRegistro();
    d.env.doc.clicar(d.env.e("btnChkSecaoAprovacoes")); await d.env.ocioso();
    confere(chamadas(d.env, "GET checkin-infantil/sala").length === 15 && !/Mostrando/.test(texto(d.env, "chkAprMsg")) && /Nada espera a liderança agora/.test(texto(d.env, "chkAprovacoesLista")), "com exatamente 15 salas nada é cortado e nada é avisado");
    // com itens e corte: a mensagem junta as duas coisas
    const p = S.registros[0]; S.pedirDivergencia(p.registroId, { nome: "Tia Zeza", parentesco: "TIO", documento: "CNH", operadorId: 42 });
    env.tique(); await env.ocioso();
    confere(/1 item\(ns\) esperando a liderança\. Mostrando as 15 primeiras salas de 17/.test(texto(env, "chkAprMsg")), `itens e corte na mesma mensagem: ${texto(env, "chkAprMsg")}`);
  });

  // ============================================================================================================================================
  // F12 — o carimbo da hora avisa quando os dados ficam velhos; a volta à página força a leitura
  // ============================================================================================================================================
  cenario("F12: mais de 30 s sem leitura bem-sucedida — o carimbo ganha ⚠ e 'dados antigos'; uma leitura boa o limpa", async () => {
    const c = await salaPronta(); const { S, env } = c;
    confere(/^Atualizado às 09:30:00\. A tela se atualiza sozinha/.test(texto(env, "chkSalaAtualizado")) && !/⚠/.test(texto(env, "chkSalaAtualizado")), "recém lida: o carimbo normal");
    env.avancar(25000); env.api.rotas["GET checkin-infantil/sala"] = FORA_DO_AR;
    env.tique(); await env.ocioso();
    confere(!/⚠/.test(texto(env, "chkSalaAtualizado")), "25 s sem leitura: ainda sem aviso");
    env.avancar(10000); env.tique(); await env.ocioso();
    confere(/^⚠ Atualizado às 09:30:00: dados antigos — toque em “Atualizar agora”\./.test(texto(env, "chkSalaAtualizado")), `35 s sem leitura bem-sucedida: ${texto(env, "chkSalaAtualizado")}`);
    delete env.api.rotas["GET checkin-infantil/sala"];
    env.doc.clicar(env.e("chkAtualizarBotao")); await env.ocioso();
    confere(/^Atualizado às 09:30:00\. A tela se atualiza sozinha/.test(texto(env, "chkSalaAtualizado")) && !/⚠/.test(texto(env, "chkSalaAtualizado")), "uma leitura bem-sucedida limpa o aviso");
    // o aviso aparece ANTES de a leitura voltar (pedido pendurado)
    env.avancar(40000);
    const lenta = env.retem(x => x.chave === "GET checkin-infantil/sala");
    env.tique(); await esperaChegar(lenta);
    confere(/⚠/.test(texto(env, "chkSalaAtualizado")) && /dados antigos/.test(texto(env, "chkSalaAtualizado")), "com a leitura a caminho há mais de 30 s, o aviso já aparece");
    lenta.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    confere(!/⚠/.test(texto(env, "chkSalaAtualizado")), "e some quando a leitura volta");
    // a leitura que FALHA depois de passar o tempo também atualiza o carimbo na hora (o tique começou com o dado ainda novo)
    env.doc.clicar(env.e("chkAtualizarBotao")); await env.ocioso();
    env.api.rotas["GET checkin-infantil/sala"] = FORA_DO_AR;
    const lenta2 = env.retem(x => x.chave === "GET checkin-infantil/sala");
    env.tique(); await esperaChegar(lenta2);
    confere(!/⚠/.test(texto(env, "chkSalaAtualizado")), "no começo da leitura o carimbo ainda é o normal");
    env.avancar(40000); lenta2.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    confere(/⚠/.test(texto(env, "chkSalaAtualizado")) && /Não foi possível atualizar agora/.test(texto(env, "chkSalaMsg")), "a leitura que falha depois de 40 s mostra o ⚠ na hora");
  });

  cenario("F12: voltar à página lê a sala na hora (leitura FORÇADA, mesmo com um pedido pendurado) e já avisa que os dados estavam velhos", async () => {
    const c = await salaPronta(); const { env } = c;
    env.limparRegistro();
    const velha = env.retem(x => x.chave === "GET checkin-infantil/sala");
    env.tique(); await esperaChegar(velha);   // o pedido que ficou pendurado quando o celular dormiu
    env.doc.visibilityState = "hidden"; env.doc.disparar(env.doc, "visibilitychange");
    env.avancar(120000);
    env.doc.visibilityState = "visible"; env.doc.disparar(env.doc, "visibilitychange"); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/sala").length === 2, "ao voltar, um novo pedido sai mesmo com o antigo ainda pendurado");
    confere(env.intervalos.size === 1, "e o relógio volta");
    velha.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    confere(/^Atualizado às 09:30:00\./.test(texto(env, "chkSalaAtualizado")) && !/⚠/.test(texto(env, "chkSalaAtualizado")), "a leitura nova limpa o aviso de dado velho");
    // o carimbo mostra o aviso no instante da volta (antes de a leitura responder)
    const d = await salaPronta();
    d.env.doc.visibilityState = "hidden"; d.env.doc.disparar(d.env.doc, "visibilitychange"); d.env.avancar(120000);
    const presa = d.env.retem(x => x.chave === "GET checkin-infantil/sala");
    d.env.doc.visibilityState = "visible"; d.env.doc.disparar(d.env.doc, "visibilitychange"); await esperaChegar(presa);
    confere(/⚠/.test(texto(d.env, "chkSalaAtualizado")), "na hora da volta o carimbo já mostra o ⚠ (a leitura ainda não respondeu)");
    presa.liberar(); await d.env.ocioso(); d.env.api.retencoes.length = 0;
  });

  // ============================================================================================================================================
  // Complementos: o que as correções precisam provar além do caminho feliz
  // ============================================================================================================================================
  cenario("F1: o visitante com alergia sai da lista enquanto o catálogo novo carrega — o texto novo é redesenhado do mesmo jeito e fica escondido com o campo de saúde vazio", async () => {
    const c = await salaPronta(); const { S, env } = c;
    await visitanteComSaude(env);
    S.textoSaudeNovo = TEXTO_NOVO;
    preencherOutraPessoa(env, { tel: "11999990002" });
    const presa = env.retem(x => x.chave === "GET checkin-infantil/catalogos");
    env.doc.clicar(env.e("chkCiEnviar")); await esperaChegar(presa);
    env.doc.clicar(descendentes(env.e("chkChip0")).find(x => x.localName === "button")); await env.ocioso();   // tira o visitante da lista com o catálogo a caminho
    presa.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    confere(env.e("chkCiVisTermoCx").textContent.includes("TEXTO NOVO DA SAÚDE") && !env.e("chkCiVisTermoCx").textContent.includes(F.mc.textoDe("SAUDE_CRACHA").titulo), "o texto novo foi redesenhado mesmo sem visitante com alergia na lista");
    confere(!visivel(env, "chkCiVisTermoCx") && env.e("chkCiVisConcordo").checked === false, "com o campo de saúde vazio o texto novo fica escondido, e a caixa nasce desmarcada");
    env.doc.digitar(env.e("chkCiVisSaude"), "Rinite");
    confere(visivel(env, "chkCiVisTermoCx"), "ao escrever uma alergia o texto novo aparece");
  });

  cenario("F1: o 'concordo' marcado para o OUTRO visitante (texto antigo) também some quando o texto é redesenhado, mesmo sem nenhum visitante com alergia na lista", async () => {
    const c = await salaPronta(); const { S, env } = c;
    await visitanteComSaude(env);   // o visitante A (com alergia) está na lista
    // o responsável do visitante B, ainda no formulário, já marcou 'concordo' sobre o texto ANTIGO
    env.e("chkCiVisNome").value = "Visitante Onze"; env.e("chkCiVisNasc").value = "2021-05-05";
    env.doc.digitar(env.e("chkCiVisSaude"), "Rinite"); env.doc.marcar(env.e("chkCiVisConcordo"), true);
    S.textoSaudeNovo = TEXTO_NOVO;
    preencherOutraPessoa(env, { tel: "11999990002" });
    const presa = env.retem(x => x.chave === "GET checkin-infantil/catalogos");
    env.doc.clicar(env.e("chkCiEnviar")); await esperaChegar(presa);
    env.doc.clicar(descendentes(env.e("chkChip0")).find(x => x.localName === "button")); await env.ocioso();   // o visitante A sai da lista com o catálogo a caminho
    presa.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    confere(env.e("chkCiVisTermoCx").textContent.includes("TEXTO NOVO DA SAÚDE") && env.e("chkCiVisConcordo").checked === false && visivel(env, "chkCiVisTermoCx"), "o texto novo está à vista (há alergia digitada) e a caixa do visitante B foi desmarcada: o 'concordo' dele era do texto antigo");
    env.limparRegistro(); env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    confere(/precisa ler o texto e marcar que concorda/.test(texto(env, "chkCiVisMsg")) && !env.e("chkChip0"), "e o visitante B não entra na lista sem concordar de novo");
  });

  cenario("F6: o catálogo some com crianças na lista da entrada — remover uma e atualizar a lista continua funcionando (limite padrão de 6)", async () => {
    const c = await salaPronta(); const { env } = c;
    await buscar(env, "Pedro"); await adicionarMembro(env, 101);
    env.e("chkCiVisNome").value = "Visitante Um"; env.e("chkCiVisNasc").value = "2020-05-20"; env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    confere(!!env.e("chkChip0") && !!env.e("chkChip1"), "duas crianças na lista");
    env.ev("chkCatalogos = null");
    env.doc.clicar(descendentes(env.e("chkChip1")).find(x => x.localName === "button")); await env.ocioso();
    confere(/1 de 6 criança\(s\) nesta entrada\./.test(texto(env, "chkCiLista")) && !env.e("chkChip1"), "remover com o catálogo ausente: a lista se refaz, com o limite padrão de 6");
  });

  cenario("F3: a pergunta aberta de uma sala não age sobre a sala seguinte (voltar às salas, fechar o painel e imprimir)", async () => {
    // voltar às salas: pergunta aberta, a pessoa sai e abre a sala de novo; responder 'Sair e apagar' NÃO fecha a sala nova
    const c = await salaPronta(); const { env } = c;
    await checkinDoPedro(c, 101);
    env.doc.clicar(env.e("chkVoltarBotao")); await env.ocioso();
    confere(env.modal().aberto && /NÃO foram impressos/.test(env.modal().texto), "pergunta aberta");
    env.ev("chkAbaMudou('protecao')"); await env.ocioso();
    await abrirSalaMeu(env);
    confere(!!env.e("chkSalaRaiz"), "a sala foi aberta de novo");
    await env.responderModal(true); await env.ocioso();
    confere(!!env.e("chkSalaRaiz") && env.g("chkSala") !== null, "responder a pergunta velha não fecha a sala nova");
    // fechar o painel: o código da sala nova não é apagado pela pergunta velha
    const d = await salaPronta(); await checkinDoPedro(d, 101);
    d.env.doc.clicar(d.env.e("chkFecharImpressaoBotao")); await d.env.ocioso();
    d.env.ev("chkAbaMudou('protecao')"); await d.env.ocioso();
    await abrirSalaMeu(d.env);
    const b = await checkinDoPedro(d, 102);
    await d.env.responderModal(true); await d.env.ocioso();
    confere(!!d.env.e("chkCodigo0x0") && d.env.e("chkCodigo0x0").textContent === b.codigo && d.env.g("chkImpressao").lotes.length === 1, "responder 'Fechar e apagar' da sala velha não apaga os códigos da sala nova");
    // imprimir: a resposta da sala velha não refaz nem marca o painel da sala nova
    const e = await salaPronta(); await checkinDoPedro(e, 101);
    e.env.doc.clicar(e.env.e("chkImprimirBotao")); await e.env.ocioso();
    e.env.ev("chkAbaMudou('protecao')"); await e.env.ocioso();
    await abrirSalaMeu(e.env);
    await checkinDoPedro(e, 102);
    const painel = e.env.e("chkImprimivel");
    await e.env.responderModal(true); await e.env.ocioso();
    confere(e.env.e("chkImprimivel") === painel && e.env.g("chkImpressao").lotes.length === 1 && e.env.g("chkImpressao").lotes[0].impresso === false && /Ainda não impresso/.test(texto(e.env, "chkLoteEstado0")), "a resposta da impressão da sala velha não refaz nem marca como impresso o painel da sala nova");
  });

  cenario("F3: o rótulo do lote é só da tela e a marca de 'Impresso' muda a classe", async () => {
    const c = await salaPronta(); const { env } = c;
    await checkinDoPedro(c, 101);
    confere(/chk-so-tela/.test(env.e("chkLoteEstado0").className) && !/chk-lote-impresso/.test(env.e("chkLoteEstado0").className), "o rótulo é só da tela (o papel não o leva) e, antes de imprimir, sem a marca de impresso");
    await imprimir(env, true);
    confere(/chk-so-tela/.test(env.e("chkLoteEstado0").className) && /chk-lote-impresso/.test(env.e("chkLoteEstado0").className), "depois de imprimir o rótulo ganha a marca de impresso");
    confere(env.e("chkLote0").getAttribute("class") === "chk-lote", "e o lote em si não leva a marca de alvo fora da impressão");
  });

  cenario("F8: a rodada velha da fila termina mas não libera a vaga da nova (a vaga é por época: sair da seção e voltar começa outra)", async () => {
    const c = montar({ sessao: GESTOR }); const { S, env } = c;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 }); S.pedirDivergencia(a.registroId, { nome: "Tia Zeza", parentesco: "TIO", documento: "CNH", operadorId: 42 });
    await abrirAbaGestao(env);
    env.doc.clicar(env.e("btnChkSecaoAprovacoes")); await env.ocioso();
    const velha = env.retem(x => x.chave === "GET checkin-infantil/minhas-salas");
    env.tique(); await esperaChegar(velha);
    env.doc.clicar(env.e("btnChkSecaoSalas")); await env.ocioso();   // sair da seção descarta a fila (a lista de salas pede a sua própria leitura)
    const nova = env.retem(x => x.chave === "GET checkin-infantil/minhas-salas");
    env.doc.clicar(env.e("btnChkSecaoAprovacoes")); await esperaChegar(nova);   // a fila volta: rodada nova, a caminho
    env.ev("chkIniciarTimer()");
    velha.liberar(); await env.ocioso();
    env.limparRegistro(); env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/minhas-salas").length === 0, "a rodada velha terminou, mas a nova ainda está a caminho: o tique espera");
    nova.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    env.limparRegistro(); env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/minhas-salas").length === 1 && !!cartao(env, a.registroId), "terminada a nova, o tique pede de novo");
  });

  cenario("F8: sair da aba da liderança, ou da sessão, com a rodada da fila a caminho não deixa a fila presa — quando a pessoa volta, o relógio atualiza", async () => {
    const c = montar({ sessao: GESTOR }); const { S, env } = c;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 }); S.pedirDivergencia(a.registroId, { nome: "Tia Zeza", parentesco: "TIO", documento: "CNH", operadorId: 42 });
    const voltarAFila = async () => { await abrirAbaGestao(env); env.doc.clicar(env.e("btnChkSecaoAprovacoes")); await env.ocioso(); };
    await voltarAFila();
    // 1) sair da aba (outra aba do menu) com uma rodada pendurada, e voltar
    const presa1 = env.retem(x => x.chave === "GET checkin-infantil/minhas-salas");
    env.tique(); await esperaChegar(presa1);
    await env.ev("mostrarAbaSecretaria('protecao')"); await env.ocioso();
    await voltarAFila();
    env.limparRegistro(); env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/minhas-salas").length === 1, "depois de sair da aba e voltar, o relógio pede de novo (a rodada pendurada de antes não segura a fila)");
    // 2) sair da sessão com uma rodada pendurada, e entrar de novo
    const presa2 = env.retem(x => x.chave === "GET checkin-infantil/minhas-salas");
    env.tique(); await esperaChegar(presa2);
    env.ev("limparSessao()"); await env.ocioso();
    confere(env.g("chkEmVooApr") === 0, "sair da sessão zera o contador de rodadas da fila a caminho (como os outros contadores)");
    env.sessao({ matricula: 9, pin: false, permissoes: ["habilitacao_voluntarios"] });
    await voltarAFila();
    env.limparRegistro(); env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/minhas-salas").length === 1, "depois de sair da sessão e entrar de novo, o relógio pede de novo");
    presa1.liberar(); presa2.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
  });
};
