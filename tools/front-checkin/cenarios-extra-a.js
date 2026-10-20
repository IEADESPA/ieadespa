// cenarios-extra-a.js — cenários que fecham os buracos do GRUPO A da prova de mutação (mutações que o roteiro deixava passar): pílulas e título da aba, CSS por texto, foco (abrir a sala, voltar do modal,
// botão desabilitado), a leitura da sala com a sessão acabada, as permissões da aba da liderança, a matrícula "só algarismos", a mensagem da fila de aprovações, o que a decisão confere depois do motivo,
// a trava de duplo clique (decidir, destravar, relatório), a limpeza ao sair da sala e ao sair da sessão, a busca da ficha ao sair da aba e o relógio de atualização (página escondida, dono da tela,
// nada a atualizar). Todos os nomes começam com "Extra A:" (o corredor rápido da prova filtra por isso).
"use strict";

module.exports = function registrar(H) {
  const { cenario, confere, montar, chamadas, texto, visivel, esperar, esperaChegar, abrirMeuPainel, abrirSalaMeu, abrirAbaGestao, abrirSalaGestao, salaPronta } = H;

  const GESTOR = { membroId: 9, lideranca: true, gestao: true };
  const SALA_GES = "chkAbrirGes501x31";
  const pendente = (S, id, quem = {}) => S.pedirDivergencia(id, Object.assign({ nome: "Tia Zeza", parentesco: "TIO", documento: "CNH", operadorId: 42 }, quem));
  const sessaoGestor = (env) => env.sessao({ matricula: 9, pin: false, permissoes: ["habilitacao_voluntarios"], nivel: "GLOBAL" });
  // o navegador leva o foco para o botão do modal que a pessoa toca (e o botão some junto com o modal): o ambiente só faz isso se o teste mandar
  const tocarNoModal = async (env, id) => { const b = env.e(id); if (b) { b.focus(); env.doc.clicar(b); } await env.ocioso(); };
  const classesDeImpressao = (env) => env.doc.body.className.split(/\s+/).filter(x => /^chk-imp/.test(x));
  const sujarCorpo = (env) => env.doc.body.classList.add("chk-imprimindo", "chk-imp-etiquetas", "chk-imp-relatorio");
  const semComentarios = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  // o texto de um bloco CSS (da chave que abre à chave que fecha), a partir da posição `ini`
  const blocoDe = (css, ini) => {
    const a = css.indexOf("{", ini);
    let n = 0;
    for (let i = a; i < css.length; i++) { if (css[i] === "{") n++; else if (css[i] === "}") { n--; if (n === 0) return css.slice(ini, i + 1); } }
    return "";
  };

  // ============================================================================================================================================
  // HTML, TÍTULO DA ABA E CSS (por texto)
  // ============================================================================================================================================
  cenario("Extra A: as pílulas nascem com a marca certa, a aba leva o título, o CSS não apaga a cor dos avisos e o :has() cobre a impressão", async () => {
    // antes de qualquer código do módulo mexer na tela: o HTML já diz qual pílula está marcada (leitor de tela)
    const c = montar(); const { env } = c;
    confere(env.e("btnChkSecaoSalas").getAttribute("aria-pressed") === "true", "index.html: a pílula 'Salas de hoje' nasce com aria-pressed=true");
    confere(env.e("btnChkSecaoAprovacoes").getAttribute("aria-pressed") === "false" && env.e("btnChkSecaoFichas").getAttribute("aria-pressed") === "false", "index.html: as outras duas pílulas nascem com aria-pressed=false");
    // o título do módulo ao abrir a aba da liderança
    const g = montar({ sessao: GESTOR });
    await abrirAbaGestao(g.env);
    confere(texto(g.env, "tituloModulo") === "Check-in Infantil", `abrir a aba da liderança põe o título 'Check-in Infantil' (veio '${texto(g.env, "tituloModulo")}')`);
    // CSS: toda regra que pinta o .subtitle da tela de cinza escuro tem de poupar o aviso (a cor do aviso, marrom, perderia para a regra com #id)
    const css = semComentarios(env.lerMutado("style.css"));
    const regras = [...css.matchAll(/([^{}]*#(?:abaCheckininfantil|subMeupainelCheckininfantil) \.subtitle[^{}]*)\{([^}]*)\}/g)];
    confere(regras.length >= 1, "style.css: existe regra para o .subtitle da tela do check-in");
    for (const [, seletores, corpo] of regras) {
      const comSubtitle = seletores.split(",").map(s => s.trim()).filter(s => /\.subtitle/.test(s));
      confere(comSubtitle.length >= 2 && comSubtitle.every(s => /\.subtitle:not\(\.psc-aviso\)$/.test(s)), `style.css: todo seletor de .subtitle da tela termina em :not(.psc-aviso) (${comSubtitle.join(" | ")})`);
      confere(/color:\s*#4B5563/i.test(corpo), "style.css: e pinta de cinza escuro (contraste)");
    }
    confere(/\.psc-aviso \{[^}]*color: #7A6110/.test(css), "style.css: o aviso tem a própria cor (a que a regra do cinza não pode apagar)");
    // CSS: o ramo com :has() (onde o navegador sabe) é o que tira o resto da página da folha: o @supports certo tem de conter a impressão do check-in
    const suportes = [];
    for (let p = css.indexOf("@supports"); p >= 0; p = css.indexOf("@supports", p + 1)) suportes.push(blocoDe(css, p));
    const doCheckin = suportes.filter(b => b.includes("chk-imp-etiquetas"));
    confere(doCheckin.length === 1, `style.css: um só bloco @supports cuida da impressão do check-in (${doCheckin.length})`);
    const b = doCheckin[0] || "";
    confere(/^@supports selector\(:has\(\*\)\)\s*\{/.test(b), `style.css: e ele só vale onde o navegador sabe :has() (${b.slice(0, 40)})`);
    confere(b.includes("@media print") && b.includes("display: none !important") && b.includes(":has(#chkImprimivel)") && b.includes(":has(#chkRelImprimivel)") && b.includes("chk-imp-relatorio"), "style.css: dentro dele o resto da página sai com display:none, para as etiquetas e para o relatório");
  });

  // ============================================================================================================================================
  // FOCO
  // ============================================================================================================================================
  cenario("Extra A: abrir a sala leva o foco ao título NA HORA (antes de o servidor responder)", async () => {
    const { env } = montar();
    await abrirMeuPainel(env);
    const presa = env.retem(x => x.chave === "GET checkin-infantil/sala");
    const abrir = env.e("chkAbrirMeu501x31"); abrir.focus();
    env.doc.clicar(abrir); await esperaChegar(presa);
    confere(!!env.e("chkSalaTitulo") && /Carregando a sala/.test(texto(env, "chkSalaMsg")), "a sala está carregando (a resposta do servidor ainda não voltou)");
    confere(env.foco() === env.e("chkSalaTitulo"), `com a sala ainda carregando, o foco já está no título (foco em ${env.foco() && (env.foco().id || env.foco().localName)})`);
    presa.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    confere(env.foco() === env.e("chkSalaTitulo") && !!env.e("chkSalaVoluntarios").innerHTML, "e depois de a sala chegar o foco continua no título");
  });

  cenario("Extra A: depois do modal o foco volta ao botão de mesmo id, mesmo que a lista tenha sido refeita com o modal aberto", async () => {
    const c = montar({ sessao: GESTOR }); const { S, env } = c;
    const t = S.semear({ menorId: 102, trouxeMembroId: 201, travado: true, tentativas: 5 });
    await abrirSalaGestao(env);
    const id = `chkDestravar${t.registroId}`;
    const velho = env.e(id); velho.focus();
    env.doc.clicar(velho);   // abre a confirmação (o ato fica esperando a resposta)
    confere(env.modal().aberto && /Destravar Lia Souza/.test(env.modal().texto), "a confirmação de destravar abriu");
    // com o modal aberto, chega uma criança nova: a lista de 'Na sala' é refeita e o botão de antes sai da árvore
    S.semear({ menorId: 101, trouxeMembroId: 201 });
    env.tique(); await env.ocioso();
    const novo = env.e(id);
    confere(!!novo && novo !== velho && !velho.isConnected && !!env.e(`chkCrianca${S.registros[S.registros.length - 1].registroId}`), "a lista foi refeita: o botão Destravar é outro elemento, com o mesmo id");
    // a pessoa toca em Cancelar: o foco do navegador estava no botão do modal, que some junto com ele
    env.limparRegistro();
    await tocarNoModal(env, "modalCancelar");
    confere(!env.modal().aberto && chamadas(env, "POST checkin-infantil/destravar").length === 0, "cancelar fecha o modal e não envia nada");
    confere(env.foco() === novo && novo.isConnected, `o foco volta ao botão NOVO de mesmo id (foco em ${env.foco() && (env.foco().id || env.foco().localName)})`);
    // e sem a lista refeita: o foco volta ao mesmo botão
    const mesmo = env.e(id); mesmo.focus(); env.doc.clicar(mesmo);
    await tocarNoModal(env, "modalCancelar");
    confere(env.foco() === mesmo, "com a lista como estava, o foco volta ao mesmo botão");
  });

  cenario("Extra A: o botão desabilitado durante o pedido recebe o foco de volta quando o pedido termina (e só o título se ele saiu da tela)", async () => {
    // relatório do dia: o botão continua na tela depois do pedido
    const g = montar({ sessao: GESTOR }); const { env } = g;
    await abrirSalaGestao(env);
    const bt = env.e("chkRelatorioBotao"); bt.focus();
    env.doc.clicar(bt); await env.ocioso();
    confere(!!env.e("chkRelatorioCx").innerHTML && !bt.disabled, "o relatório abriu e o botão voltou a ficar habilitado");
    confere(env.foco() === bt, `o foco voltou ao botão que a pessoa tocou (foco em ${env.foco() && (env.foco().id || env.foco().localName)})`);
    // fichas: procurar uma criança que não existe deixa a ficha vazia e o botão na tela
    const f = montar({ sessao: GESTOR }); const fe = f.env;
    await abrirAbaGestao(fe);
    fe.doc.clicar(fe.e("btnChkSecaoFichas")); await fe.ocioso();
    fe.e("chkFiMatricula").value = "999";
    const procurar = fe.e("chkFiBuscar"); procurar.focus();
    fe.doc.clicar(procurar); await fe.ocioso();
    confere(fe.e("chkFichaCx").innerHTML === "" && !procurar.disabled, "a criança não existe: nada na tela e o botão habilitado de novo");
    confere(fe.foco() === procurar, `o foco voltou ao botão Procurar (foco em ${fe.foco() && (fe.foco().id || fe.foco().localName)})`);
  });

  // ============================================================================================================================================
  // A LEITURA DA SALA COM A SESSÃO ACABADA
  // ============================================================================================================================================
  cenario("Extra A: sessão que acabou durante a leitura da sala não conta como falha de rede (guarda isolada: a limpeza da sessão é trocada por uma função vazia)", async () => {
    // (no fluxo de verdade o fetchProtegido limpa a sessão ANTES de lançar "Sessão expirada", e a resposta velha cai na checagem de geração; trocar a limpeza isola a guarda própria da leitura)
    const c = await salaPronta(); const { env } = c;
    await env.ev("limparSessao = function () {}");
    env.api.rotas["GET checkin-infantil/sala"] = { status: 401, corpo: { sucesso: false, mensagem: "Sessão inválida." } };
    env.ev("chkEscrever('chkSalaMsg', '', false)");   // (some o 'Você entrou na sala.' que a entrada deixou)
    env.limparRegistro(); env.tique(); await env.ocioso();
    confere(env.toasts().some(t => /sessão expirou/i.test(t)), "o aviso da sessão expirada saiu (do fetchProtegido)");
    confere(env.g("chkFalhas") === 0 && texto(env, "chkSalaMsg") === "", `a sessão acabada não vira 'não foi possível atualizar agora' nem conta como falha (falhas=${env.g("chkFalhas")}, msg='${texto(env, "chkSalaMsg")}')`);
    env.tique(); await env.ocioso(); env.tique(); await env.ocioso();
    confere(env.g("chkFalhas") === 0 && env.intervalos.size === 1, "e três respostas assim não contam três falhas nem param o relógio por falha");
  });

  // ============================================================================================================================================
  // PERMISSÃO DA ABA DA LIDERANÇA (quem opera, por PIN, chamando direto — sem sala aberta)
  // ============================================================================================================================================
  cenario("Extra A: quem não é da liderança chama a abertura da aba e a fila de aprovações direto, sem sala aberta — nada é pedido, nada muda na tela", async () => {
    const c = montar({ sessao: { membroId: 41 } }); const { env } = c;
    await abrirMeuPainel(env);
    confere(env.g("chkSala") === null, "(sem sala aberta)");
    env.limparRegistro();
    // a aba: nada pedido e as seções ficam como estavam (o marcador mostra se alguém mexeu)
    ["chkSecaoSalas", "chkSecaoAprovacoes", "chkSecaoFichas"].forEach(id => { env.e(id).style.display = "marcador"; });
    await env.ev("chkCarregarOpcoesAcao()"); await env.ocioso();
    confere(["chkSecaoSalas", "chkSecaoAprovacoes", "chkSecaoFichas"].every(id => env.e(id).style.display === "marcador"), "abrir a aba sem a permissão não mexe nas seções da liderança");
    confere(env.api.chamadas.length === 0, `e não pede nada ao servidor (${env.api.chamadas.map(x => x.chave).join(", ")})`);
    // a fila de aprovações: nenhuma chamada e nenhum relógio
    env.e("chkAprovacoesLista").innerHTML = "<p>marcador</p>";
    await env.ev("chkCarregarAprovacoesAcao()"); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/minhas-salas").length === 0 && chamadas(env, "GET checkin-infantil/catalogos").length === 0, `a fila de aprovações chamada direto por quem não é da liderança não pede nada (${env.api.chamadas.map(x => x.chave).join(", ")})`);
    confere(env.e("chkAprovacoesLista").innerHTML === "<p>marcador</p>" && env.intervalos.size === 0, "e não refaz a lista nem liga o relógio");
    // o tique de antes de a pessoa perder a permissão também não pede a fila
    env.ev("chkIniciarTimer()"); env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/minhas-salas").length === 0, "o relógio de uma pessoa sem permissão nunca pede a fila");
  });

  // ============================================================================================================================================
  // A MATRÍCULA DIGITADA: SÓ ALGARISMOS
  // ============================================================================================================================================
  cenario("Extra A: matrícula com 'e', ponto ou sinal não vale (ficha e matrícula de quem pode retirar): só algarismos", async () => {
    const c = montar({ sessao: GESTOR }); const { S, env } = c;
    await abrirAbaGestao(env);
    env.doc.clicar(env.e("btnChkSecaoFichas")); await env.ocioso();
    const procurar = async (valor) => { env.e("chkFiMatricula").value = valor; env.limparRegistro(); env.doc.clicar(env.e("chkFiBuscar")); await env.ocioso(); return texto(env, "chkFichaMsg"); };
    // o campo é type=number: o navegador deixa passar "1e2" (= 100); a tela só aceita algarismos
    for (const ruim of ["1e2", "101.5", "0x65", "+101", "10 1", "12345678901"]) {
      const m = await procurar(ruim);
      confere(/Informe a matrícula da criança \(um número\)/.test(m) && chamadas(env, "GET checkin-infantil/autorizados").length === 0, `matrícula '${ruim}': a tela recusa antes de pedir (msg='${m}', pedidos=${chamadas(env, "GET checkin-infantil/autorizados").length})`);
    }
    const ok = await procurar(" 101 ");
    confere(chamadas(env, "GET checkin-infantil/autorizados").length === 1 && chamadas(env, "GET checkin-infantil/autorizados")[0].consulta.menorId === "101" && !!env.e("chkFiAut101"), `matrícula só com algarismos (e espaços nas pontas) vale (msg='${ok}')`);
    // a matrícula opcional de quem pode retirar (formulário da ficha): "1e2" não é número
    env.e("chkFiAutNome101").value = "Tia Zeza"; env.e("chkFiAutPar101").value = "TIO"; env.e("chkFiAutRef101").value = "Pasta 1, folha 2";
    env.e("chkFiAutMat101").value = "1e2";
    env.limparRegistro(); env.doc.clicar(env.e("chkFiAutEnviar101")); await env.ocioso();
    confere(/A matrícula precisa ser um número/.test(texto(env, "chkFiAutMsg101")) && chamadas(env, "POST checkin-infantil/autorizado-adicionar").length === 0 && S.membros[0].autorizados.length === 0, `matrícula de quem pode retirar '1e2': recusada antes de enviar (msg='${texto(env, "chkFiAutMsg101")}')`);
    env.e("chkFiAutMat101").value = "0012";
    env.limparRegistro(); env.doc.clicar(env.e("chkFiAutEnviar101")); await env.ocioso();
    const p = chamadas(env, "POST checkin-infantil/autorizado-adicionar");
    confere(p.length === 1 && p[0].corpo.membroId === 12, `com algarismos, a matrícula vai como número (${JSON.stringify(p[0] && p[0].corpo)})`);
  });

  // ============================================================================================================================================
  // A FILA DE APROVAÇÕES: A MENSAGEM DA DECISÃO
  // ============================================================================================================================================
  cenario("Extra A: decidir pela fila de aprovações (sem sala aberta) escreve a mensagem do servidor na região da fila, não na da sala", async () => {
    const c = montar({ sessao: GESTOR, fatorFresco: true }); const { S, env } = c;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 }); pendente(S, a.registroId);
    await abrirAbaGestao(env);
    env.doc.clicar(env.e("btnChkSecaoAprovacoes")); await env.ocioso();
    confere(!!env.e(`chkAprovar${a.registroId}`) && env.g("chkSala") === null, "a fila mostra o pedido e não há sala aberta");
    // a fila é refeita logo depois da decisão e apaga a mensagem: por isso se observa cada escrita
    await env.ev("globalThis.__escritas = []; { const original = chkEscrever; chkEscrever = function (id, t, d) { globalThis.__escritas.push([id, String(t)]); return original(id, t, d); }; }");
    env.e(`chkAprovar${a.registroId}`).focus(); env.doc.clicar(env.e(`chkAprovar${a.registroId}`));
    await env.responderModal(true); await env.ocioso();
    await env.responderTexto("Liguei para a mãe, que confirmou."); await env.ocioso();
    const escritas = env.g("globalThis.__escritas").map(x => [x[0], x[1]]);
    confere(S.registro(a.registroId).situacao === "RETIRADA", "o servidor registrou a aprovação");
    confere(escritas.some(([id, t]) => id === "chkAprMsg" && /Retirada aprovada/.test(t)), `a mensagem do servidor foi escrita na região da fila (chkAprMsg): ${JSON.stringify(escritas)}`);
    confere(!escritas.some(([id, t]) => id === "chkSalaMsg" && /Retirada aprovada/.test(t)), "e não na região da sala, que nem está na tela");
    confere(env.toasts().some(t => /Retirada aprovada/.test(t)), "o aviso (toast) também sai");
  });

  // ============================================================================================================================================
  // DECIDIR E DESTRAVAR: O QUE SE CONFERE DEPOIS DAS PERGUNTAS, E O DUPLO CLIQUE
  // ============================================================================================================================================
  cenario("Extra A: decidir — se a pessoa sai da sala ou da sessão com o pedido do motivo aberto, nada é enviado depois", async () => {
    const c = montar({ sessao: GESTOR, fatorFresco: true }); const { S, env } = c;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 }); pendente(S, a.registroId);
    await abrirSalaGestao(env); env.limparRegistro();
    // sai da sala (Voltar às salas) com o pedido do motivo aberto
    env.e(`chkAprovar${a.registroId}`).focus(); env.doc.clicar(env.e(`chkAprovar${a.registroId}`));
    await env.responderModal(true); await env.ocioso();
    confere(env.modal().aberto && !!env.e("modalTexto"), "o pedido do motivo está aberto");
    env.doc.clicar(env.e("chkVoltarBotao")); await env.ocioso();
    confere(env.g("chkSala") === null, "a pessoa saiu da sala");
    await env.responderTexto("Liguei para a mãe, que confirmou."); await env.ocioso();
    confere(chamadas(env, "POST checkin-infantil/decidir-divergencia").length === 0 && S.registro(a.registroId).situacao === "RETIRADA_PENDENTE", `sair da sala com o motivo aberto: a decisão NÃO é enviada (${chamadas(env, "POST checkin-infantil/decidir-divergencia").length} pedido(s))`);
    // sai da sessão com o pedido do motivo aberto
    const d = montar({ sessao: GESTOR, fatorFresco: true });
    const b = d.S.semear({ menorId: 101, trouxeMembroId: 201 }); pendente(d.S, b.registroId);
    await abrirSalaGestao(d.env); d.env.limparRegistro();
    d.env.doc.clicar(d.env.e(`chkNegar${b.registroId}`));
    await d.env.responderModal(true); await d.env.ocioso();
    d.env.ev("limparSessao()"); await d.env.ocioso();
    await d.env.responderTexto("A mãe disse que não mandou ninguém."); await d.env.ocioso();
    confere(chamadas(d.env, "POST checkin-infantil/decidir-divergencia").length === 0 && d.S.registro(b.registroId).situacao === "RETIRADA_PENDENTE", `sair da sessão com o motivo aberto: a decisão NÃO é enviada (${chamadas(d.env, "POST checkin-infantil/decidir-divergencia").length} pedido(s))`);
  });

  cenario("Extra A: duplo clique — decidir, destravar e abrir o relatório não vão duas vezes enquanto o primeiro pedido não voltou", async () => {
    const aviso = (env) => env.toasts().filter(t => /Aguarde: o pedido anterior ainda está sendo processado/.test(t)).length;
    // decidir
    const c = montar({ sessao: GESTOR, fatorFresco: true }); const { S, env } = c;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 }); pendente(S, a.registroId);
    await abrirSalaGestao(env); env.limparRegistro();
    const presa = env.retem(x => x.chave === "POST checkin-infantil/decidir-divergencia");
    const p1 = env.ev(`chkDecidirAcao(${a.registroId}, true, null)`);
    await env.responderModal(true); await env.ocioso(); await env.responderTexto("Liguei para a mãe, que confirmou."); await esperaChegar(presa);
    const p2 = env.ev(`chkDecidirAcao(${a.registroId}, true, null)`);
    await env.responderModal(true); await env.ocioso(); await env.responderTexto("Segundo toque, mesmo motivo."); await env.ocioso();
    confere(chamadas(env, "POST checkin-infantil/decidir-divergencia").length === 1 && aviso(env) === 1, `decidir: o segundo toque com o primeiro pedido a caminho não envia e avisa (pedidos=${chamadas(env, "POST checkin-infantil/decidir-divergencia").length}, avisos=${aviso(env)})`);
    presa.liberar(); await esperar(p1); await esperar(p2); await env.ocioso(); env.api.retencoes.length = 0;
    confere(chamadas(env, "POST checkin-infantil/decidir-divergencia").length === 1 && S.registro(a.registroId).situacao === "RETIRADA", "e a decisão foi uma só");
    // destravar
    const d = montar({ sessao: GESTOR }); const de = d.env;
    const t = d.S.semear({ menorId: 102, trouxeMembroId: 201, travado: true, tentativas: 5 });
    await abrirSalaGestao(de); de.limparRegistro();
    const presa2 = de.retem(x => x.chave === "POST checkin-infantil/destravar");
    const q1 = de.ev(`chkDestravarAcao(${t.registroId}, null)`);
    await de.responderModal(true); await esperaChegar(presa2);
    const q2 = de.ev(`chkDestravarAcao(${t.registroId}, null)`);
    await de.responderModal(true); await de.ocioso();
    confere(chamadas(de, "POST checkin-infantil/destravar").length === 1 && aviso(de) === 1, `destravar: o segundo toque com o primeiro pedido a caminho não envia e avisa (pedidos=${chamadas(de, "POST checkin-infantil/destravar").length}, avisos=${aviso(de)})`);
    presa2.liberar(); await esperar(q1); await esperar(q2); await de.ocioso(); de.api.retencoes.length = 0;
    confere(chamadas(de, "POST checkin-infantil/destravar").length === 1 && d.S.registro(t.registroId).travado === false, "e o destravar foi um só");
    // relatório
    const e3 = montar({ sessao: GESTOR }); const re = e3.env;
    await abrirSalaGestao(re); re.limparRegistro();
    const presa3 = re.retem(x => x.chave === "GET checkin-infantil/relatorio");
    const r1 = re.ev("chkAbrirRelatorioAcao(null)"); await esperaChegar(presa3);
    const r2 = re.ev("chkAbrirRelatorioAcao(null)"); await re.ocioso();
    confere(chamadas(re, "GET checkin-infantil/relatorio").length === 1 && aviso(re) === 1, `relatório: o segundo toque com o primeiro pedido a caminho não pede de novo e avisa (pedidos=${chamadas(re, "GET checkin-infantil/relatorio").length}, avisos=${aviso(re)})`);
    presa3.liberar(); await esperar(r1); await esperar(r2); await re.ocioso(); re.api.retencoes.length = 0;
    confere(chamadas(re, "GET checkin-infantil/relatorio").length === 1, "e o relatório foi pedido uma vez só");
    // solto o que estava em curso, o relatório abre normalmente de novo
    re.doc.clicar(re.e("chkRelatorioBotao")); await re.ocioso();
    confere(chamadas(re, "GET checkin-infantil/relatorio").length === 2 && !!re.e("chkRelatorioCx").innerHTML, "terminado o primeiro pedido, um toque novo funciona");
  });

  // ============================================================================================================================================
  // LIMPEZA: AS CLASSES DE IMPRESSÃO E O QUE ESTÁ A CAMINHO
  // ============================================================================================================================================
  cenario("Extra A: sair da sala, fechar o relatório e sair da sessão tiram do <body> TODAS as classes de impressão", async () => {
    // sair da sala (Voltar às salas)
    const a = await salaPronta(); const ae = a.env;
    sujarCorpo(ae);
    confere(classesDeImpressao(ae).length === 3, "(o corpo está com as três classes)");
    ae.doc.clicar(ae.e("chkVoltarBotao")); await ae.ocioso();
    confere(ae.g("chkSala") === null && classesDeImpressao(ae).length === 0, `sair da sala tira as três classes de impressão do <body> (restam: ${classesDeImpressao(ae).join(",")})`);
    // fechar o relatório
    const g = montar({ sessao: GESTOR }); const ge = g.env;
    await abrirSalaGestao(ge); ge.doc.clicar(ge.e("chkRelatorioBotao")); await ge.ocioso();
    sujarCorpo(ge);
    ge.doc.clicar(ge.e("chkRelFecharBotao")); await ge.ocioso();
    confere(classesDeImpressao(ge).length === 0, `fechar o relatório tira as três classes (restam: ${classesDeImpressao(ge).join(",")})`);
    // sair da sessão com a sala aberta
    const b = await salaPronta(); const be = b.env;
    sujarCorpo(be);
    be.ev("limparSessao()"); await be.ocioso();
    confere(be.g("chkSala") === null && classesDeImpressao(be).length === 0, `sair da sessão tira as três classes de impressão do <body> (restam: ${classesDeImpressao(be).join(",")})`);
  });

  cenario("Extra A: sair da sala invalida o que estava a caminho (a resposta do 'Entrar na sala' que chega depois não avisa nem lê a sala)", async () => {
    const c = montar(); const { env } = c;
    await abrirSalaMeu(env);
    confere(!!env.e("chkEntrarBotao"), "a sala abriu e a pessoa ainda não entrou");
    env.limparRegistro();
    const presa = env.retem(x => x.chave === "POST checkin-infantil/entrar-na-sala");
    env.doc.clicar(env.e("chkEntrarBotao")); await esperaChegar(presa);
    env.doc.clicar(env.e("chkVoltarBotao")); await env.ocioso();
    confere(env.g("chkSala") === null, "a pessoa voltou às salas com o pedido a caminho");
    presa.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    confere(!env.toasts().some(t => /Você entrou na sala/.test(t)), `a resposta que chega depois de sair da sala não mostra aviso nenhum (${env.toasts().join(" | ")})`);
    confere(chamadas(env, "GET checkin-infantil/sala").length === 0 && env.g("chkSala") === null, "e não lê a sala de novo");
  });

  cenario("Extra A: sair da sessão apaga a seção da liderança, a matrícula, as mensagens, o catálogo, a busca da criança e a trava de duplo clique", async () => {
    // ---- a liderança: seção das fichas, matrícula digitada, mensagens, pedido em curso ----
    const c = montar({ sessao: GESTOR }); const { env } = c;
    await abrirAbaGestao(env);
    env.doc.clicar(env.e("btnChkSecaoFichas")); await env.ocioso();
    confere(env.g("chkSecaoAtual") === "fichas" && visivel(env, "chkSecaoFichas") && !visivel(env, "chkSecaoSalas"), "(a liderança está na seção das fichas)");
    confere(env.g("chkCatalogos") !== null, "(o catálogo foi carregado)");
    env.e("chkFiMatricula").value = "101";
    const presa = env.retem(x => x.chave === "GET checkin-infantil/autorizados");
    env.doc.clicar(env.e("chkFiBuscar")); await esperaChegar(presa);
    confere(env.g("chkEmCurso.size") === 1, "(a procura da ficha está em curso: a trava de duplo clique tem uma chave)");
    for (const id of ["chkMeuMsg", "chkGesMsg", "chkAprMsg", "chkFichaMsg"]) env.ev(`chkEscrever("${id}", "texto antigo de ${id}", true)`);
    env.ev("limparSessao()");
    // o que a pessoa de antes deixou: nada
    confere(env.g("chkSecaoAtual") === "salas", `sair da sessão volta a seção atual para 'salas' (era 'fichas', agora '${env.g("chkSecaoAtual")}')`);
    confere(visivel(env, "chkSecaoSalas") && !visivel(env, "chkSecaoFichas") && !visivel(env, "chkSecaoAprovacoes") && env.e("btnChkSecaoSalas").getAttribute("aria-pressed") === "true" && env.e("btnChkSecaoFichas").getAttribute("aria-pressed") === "false" && env.e("btnChkSecaoSalas").classList.contains("ativo") && !env.e("btnChkSecaoFichas").classList.contains("ativo"), "sair da sessão volta a tela à seção das salas (seção à vista e pílula marcada)");
    confere(env.e("chkFiMatricula").value === "", `a matrícula digitada é apagada (ficou '${env.e("chkFiMatricula").value}')`);
    const sobras = ["chkMeuMsg", "chkGesMsg", "chkAprMsg", "chkFichaMsg"].filter(id => texto(env, id) !== "" || env.e(id).className !== "subtitle");
    confere(sobras.length === 0, `as quatro mensagens são apagadas e voltam ao estilo normal (sobraram: ${sobras.join(", ")})`);
    confere(env.g("chkCatalogos") === null, "o catálogo do login anterior é apagado");
    confere(env.g("chkEmCurso.size") === 0, `a trava de duplo clique é solta (chaves: ${env.g("chkEmCurso.size")})`);
    // a pessoa que entra depois: o catálogo é pedido de novo, a aba abre nas salas e a procura da ficha não fica travada pela de antes
    sessaoGestor(env);
    env.limparRegistro();
    await env.ev("chkCarregarAprovacoesAcao()"); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/catalogos").length === 1, `o catálogo é pedido de novo para a pessoa que entra (${chamadas(env, "GET checkin-infantil/catalogos").length} pedido(s))`);
    await abrirAbaGestao(env);
    confere(visivel(env, "chkSecaoSalas") && !visivel(env, "chkSecaoFichas") && !visivel(env, "chkSecaoAprovacoes") && !!env.e(SALA_GES), "a aba da pessoa que entra abre na seção das salas, com as salas dela");
    env.doc.clicar(env.e("btnChkSecaoFichas")); await env.ocioso();
    // (o botão da procura de antes ainda está desabilitado até a resposta velha voltar: a ação é chamada direto, como o botão faria)
    env.e("chkFiMatricula").value = "101"; env.limparRegistro();
    await env.ev("chkFichaBuscarAcao(null)"); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/autorizados").length === 1 && !env.toasts().some(t => /Aguarde: o pedido anterior/.test(t)) && !!env.e("chkFiAut101"), "a procura da ficha da pessoa nova não esbarra na trava da procura de antes");
    presa.liberar(); await env.ocioso(); env.api.retencoes.length = 0;

    // ---- a busca da criança que ainda esperava a pessoa parar de digitar ----
    const d = await salaPronta(); const de = d.env;
    de.doc.digitar(de.e("chkCiBusca"), "Pedro");
    const esperandoBusca = () => [...de.temporizadores.values()].filter(t => t.ms === 350).length;
    confere(esperandoBusca() === 1, "(a busca da criança está esperando o fim da digitação)");
    de.ev("limparSessao()"); await de.ocioso();
    confere(esperandoBusca() === 0, `sair da sessão cancela a busca que esperava (${esperandoBusca()} esperando)`);
    de.dispararTemporizador(350); await de.ocioso();
    confere(chamadas(de, "POST checkin-infantil/buscar").length === 0, "e nenhuma busca sai depois disso");
  });

  // ============================================================================================================================================
  // FICHAS: SAIR DA ABA OU DA SEÇÃO COM A PROCURA EM ANDAMENTO
  // ============================================================================================================================================
  cenario("Extra A: sair da aba ou da seção das fichas com a procura em andamento — a resposta que chega depois não monta a ficha", async () => {
    // sair da aba (outra aba da Secretaria)
    const c = montar({ sessao: GESTOR }); const { env } = c;
    await abrirAbaGestao(env);
    env.doc.clicar(env.e("btnChkSecaoFichas")); await env.ocioso();
    env.e("chkFiMatricula").value = "101";
    const presa = env.retem(x => x.chave === "GET checkin-infantil/autorizados");
    env.doc.clicar(env.e("chkFiBuscar")); await esperaChegar(presa);
    await env.ev("mostrarAbaSecretaria('protecao')"); await env.ocioso();
    presa.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    confere(env.e("chkFichaCx").innerHTML === "" && !env.doc.body.textContent.includes("Pedro Souza"), "sair da aba com a procura a caminho: a ficha que chega depois não aparece");
    // sair da seção (voltar às salas)
    const d = montar({ sessao: GESTOR }); const de = d.env;
    await abrirAbaGestao(de);
    de.doc.clicar(de.e("btnChkSecaoFichas")); await de.ocioso();
    de.e("chkFiMatricula").value = "101";
    const presa2 = de.retem(x => x.chave === "GET checkin-infantil/autorizados");
    de.doc.clicar(de.e("chkFiBuscar")); await esperaChegar(presa2);
    de.doc.clicar(de.e("btnChkSecaoSalas")); await de.ocioso();
    presa2.liberar(); await de.ocioso(); de.api.retencoes.length = 0;
    confere(de.e("chkFichaCx").innerHTML === "" && !de.doc.body.textContent.includes("Pedro Souza"), "trocar de seção com a procura a caminho: a ficha que chega depois não aparece");
    confere(chamadas(de, "GET checkin-infantil/saude").length === 0, "e a saúde da ficha nem é pedida");
  });

  // ============================================================================================================================================
  // O RELÓGIO DE ATUALIZAÇÃO
  // ============================================================================================================================================
  cenario("Extra A: a fila de aprovações só se atualiza na seção das aprovações (o estado da seção decide, não só o que está à vista)", async () => {
    const c = montar({ sessao: GESTOR }); const { env } = c;
    await abrirAbaGestao(env);
    confere(env.g("chkSecaoAtual") === "salas" && env.g("chkSala") === null, "(a liderança está na seção das salas, sem sala aberta)");
    // o HTML diz que a seção das aprovações está à vista (por exemplo, o CSS que a esconde ainda não foi aplicado), mas a pessoa está nas salas
    env.e("chkSecaoAprovacoes").style.display = "block";
    confere(env.ev("chkAprovacoesVisiveis()") === false, "a fila de aprovações não conta como à vista fora da seção das aprovações");
    env.ev("chkIniciarTimer()");
    confere(env.intervalos.size === 1, "(o relógio está ligado)");
    env.limparRegistro(); env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/minhas-salas").length === 0, `o tique não refaz a fila fora da seção das aprovações (${env.api.chamadas.map(x => x.chave).join(", ")})`);
    confere(env.intervalos.size === 0, "e sem nada a atualizar o relógio para");
  });

  cenario("Extra A: o tique sem nada a atualizar desliga o relógio (a aba some sem aviso ao módulo)", async () => {
    const c = montar({ sessao: GESTOR }); const { env } = c;
    await abrirAbaGestao(env);
    env.doc.clicar(env.e("btnChkSecaoAprovacoes")); await env.ocioso();
    confere(env.intervalos.size === 1, "o relógio roda enquanto a fila está à vista");
    // alguém esconde a aba sem avisar o módulo
    env.e("abaCheckininfantil").style.display = "none";
    env.limparRegistro(); env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/minhas-salas").length === 0, "o tique não pede nada com a aba fora da tela");
    confere(env.intervalos.size === 0, "e desliga o relógio, que não tem mais o que atualizar");
  });

  cenario("Extra A: página escondida — o relógio não nasce, o aviso de visibilidade o para mesmo com outro login na tela, e um tique atrasado não pede nada", async () => {
    // o relógio não nasce com a página escondida
    const c = montar(); const { env } = c;
    await abrirMeuPainel(env);
    env.doc.visibilityState = "hidden";
    env.doc.clicar(env.e("chkAbrirMeu501x31")); await env.ocioso();
    confere(!!env.e("chkSalaRaiz") && env.intervalos.size === 0, `abrir a sala com a página escondida não liga o relógio (relógios: ${env.intervalos.size})`);
    env.doc.visibilityState = "visible"; env.limparRegistro(); env.doc.disparar(env.doc, "visibilitychange"); await env.ocioso();
    confere(env.intervalos.size === 1 && chamadas(env, "GET checkin-infantil/sala").length === 1, "voltando a página à vista a sala é lida na hora e o relógio nasce");

    // o aviso de visibilidade para o relógio mesmo quando a tela ainda é de outro login (o módulo só descobre no próximo ato)
    const d = await salaPronta(); const de = d.env;
    confere(de.intervalos.size === 1, "(a sala está aberta com o relógio)");
    de.sessao({ matricula: 42, pin: true });
    de.doc.visibilityState = "hidden"; de.doc.disparar(de.doc, "visibilitychange");
    confere(de.intervalos.size === 0, `página escondida para o relógio mesmo com a tela de outro login (relógios: ${de.intervalos.size})`);

    // um tique que já estava a caminho quando a página escondeu (o aviso ainda não chegou): não pede nada e desliga
    const e3 = await salaPronta(); const ee = e3.env;
    ee.doc.visibilityState = "hidden";
    ee.limparRegistro(); ee.tique(); await ee.ocioso();
    confere(chamadas(ee, "GET checkin-infantil/sala").length === 0, "o tique com a página escondida não pede a sala");
    confere(ee.intervalos.size === 0, "e desliga o relógio");
  });

  cenario("Extra A: o tique confere de quem é a tela — com outro login, não lê a sala com a sessão nova e desliga o relógio", async () => {
    const c = await salaPronta(); const { env } = c;
    confere(env.intervalos.size === 1, "(a sala está aberta com o relógio, no login da Ana)");
    // a Bia entra por cima, sem passar pela limpeza da tela (o módulo ainda não soube)
    env.sessao({ matricula: 42, pin: true });
    env.limparRegistro(); env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/sala").length === 0, `o tique não lê a sala da Ana com a sessão da Bia (${env.api.chamadas.map(x => x.chave).join(", ")})`);
    confere(env.intervalos.size === 0, "e o relógio desliga");
  });
};
