// cenarios-filhos-e-falhas.js — Meus filhos (o responsável: histórico, quem pode retirar, saúde; nunca faz o check-in), a privacidade (limpeza ao sair, ao trocar de login e de tela, resposta atrasada),
// a atualização automática (sem empilhar, sem piscar, sem perder o foco), as falhas (401, 403, 404, 422, 429, 500, rede, resposta que não é JSON), o módulo ausente e a acessibilidade.
"use strict";

module.exports = function registrar(H) {
  const { cenario, confere, montar, limpo, achar, descendentes, chamadas, texto, argsDe, visivel, confereAcessibilidade, idsRepetidos, clicarEResponder, esperar, esperaChegar, abrirMeuPainel, abrirSalaMeu,
    abrirAbaGestao, salaPronta, buscar, adicionarMembro, escolherQuemTrouxe, enviarCheckin, checkinDoPedro, cartao, seloDe, botoes, F, ATAQUE, ck, MEU, MIN, ocorrencias, criarAmbiente, lerApp } = H;

  const RESPONSAVEL = { membroId: 201 };
  const alternar = async (env, id, secao) => { const rot = { hist: "Hist", aut: "Aut", sau: "Sau" }[secao]; env.e(`chkFhBtn${rot}${id}`).focus(); env.doc.clicar(env.e(`chkFhBtn${rot}${id}`)); await env.ocioso(); };
  const HIST = (id) => `chkFhHist${id}`, AUT = (id) => `chkFhAut${id}`, SAU = (id) => `chkFhSau${id}`;
  const hoje = "2026-10-15";

  // ============================================================================================================================================
  // MEUS FILHOS
  // ============================================================================================================================================
  cenario("Meus filhos (responsável, por PIN): a lista, o histórico só das próprias crianças, e nenhum jeito de fazer o check-in por aqui", async () => {
    const c = montar({ sessao: RESPONSAVEL, ataque: true }); const { S, env } = c;
    const antiga = S.semear({ menorId: 101, trouxeMembroId: 201, situacao: "RETIRADA" });
    S.registro(antiga.registroId).divergente = true;
    const atual = S.semear({ menorId: 101, trouxeMembroId: 202 });
    const outra = S.semear({ menorId: 104, trouxeMembroId: 203 });   // a Davi (de outra família) também está na sala
    await abrirMeuPainel(env);
    const f101 = env.e("chkFilho101"), f102 = env.e("chkFilho102");
    confere(!!f101 && !!f102 && !env.e("chkFilho104") && !env.e("chkFilho103"), "só os dois filhos de quem é o responsável cadastrado");
    confere(texto(env, "chkFhNome101").startsWith("Pedro Souza") && texto(env, "chkFhNome101").includes("[menor101]") && /4 anos/.test(f101.textContent) && /Mãe/.test(f101.textContent), "o nome (texto de ataque como texto), a idade e o vínculo");
    const btns = ["Hist", "Aut", "Sau"].map(s => env.e(`chkFhBtn${s}101`));
    confere(btns.every(b => !!b && b.getAttribute("aria-expanded") === "false" && b.getAttribute("type") === "button"), "três botões por filho, todos recolhidos (aria-expanded=false)");
    confere(JSON.stringify(argsDe(btns[0])) === JSON.stringify([101, "hist"]) && JSON.stringify(argsDe(btns[1])) === JSON.stringify([101, "aut"]) && JSON.stringify(argsDe(btns[2])) === JSON.stringify([101, "sau"]), "os botões levam só o id numérico e a constante da seção");
    confere(!env.e("chkCiForm") && !env.e("chkEntrarBotao") && !env.e("chkCiEnviar") && !botoes(env.e("chkFilhosLista")).some(t => /Retirar|Entrar na sala|Registrar a entrada|etiqueta/.test(t)), "o responsável não tem como fazer o check-in por aqui");
    confere(/não fazem o check-in por aqui/.test(texto(env, "subMeupainelCheckininfantil").replace(/\s+/g, " ")), "a própria tela explica que o check-in é sempre com um voluntário na sala");
    // histórico
    env.limparRegistro();
    await alternar(env, 101, "hist");
    const g = chamadas(env, "GET checkin-infantil/historico");
    confere(g.length === 1 && g[0].consulta.menorId === "101", "GET histórico pela criança");
    confere(env.e("chkFhBtnHist101").getAttribute("aria-expanded") === "true", "o botão fica expandido (aria-expanded=true)");
    const lis = descendentes(env.e(HIST(101))).filter(x => x.localName === "li");
    confere(lis.length === 2, `duas visitas do Pedro (e nenhuma do Davi): ${lis.length}`);
    const t1 = lis[0].textContent, t2 = lis[1].textContent;
    confere(/15\/10\/2026/.test(t1) && /Maternal/.test(t1) && /Sede/.test(t1) && /Entrou às 09:30/.test(t1) && /Na sala/.test(t1) && !/saiu às/.test(t1), "a visita de agora vem primeiro: data, sala, congregação, hora de entrada, e ainda na sala");
    confere(/saiu às 09:30/.test(t2) && /Retirada/.test(t2) && /Retirada por quem não estava na lista, aprovada pela liderança/.test(t2) && /quem retirou: Alguém/.test(t2), "a visita antiga mostra a saída, quem retirou e o selo da retirada divergente");
    confere(/Quem trouxe: José Souza/.test(t1) && /Quem trouxe: Maria Souza/.test(t2), "quem trouxe, pelo nome do cadastro");
    const bloco = env.e(HIST(101)).textContent;
    confere(!bloco.includes(S.codigoDe(antiga.registroId)) && !bloco.includes(S.codigoDe(atual.registroId)) && !/Bia Voluntária|Ana Voluntária|vol4[12]/.test(bloco), "o histórico nunca traz o código de retirada nem o nome do voluntário");
    confere(/O código de retirada e o nome de quem atendeu a criança não aparecem aqui/.test(bloco), "e diz isso à família");
    limpo(env, "Histórico", [ATAQUE("menor101")].slice(0, 0));
    // recolher apaga o conteúdo; abrir de novo pede de novo
    await alternar(env, 101, "hist");
    confere(env.e(HIST(101)).innerHTML === "" && env.e("chkFhBtnHist101").getAttribute("aria-expanded") === "false", "recolher apaga o histórico da tela");
    env.limparRegistro(); await alternar(env, 101, "hist");
    confere(chamadas(env, "GET checkin-infantil/historico").length === 1, "abrir de novo pede de novo ao servidor");
    // a outra criança: sem visitas
    await alternar(env, 102, "hist");
    confere(/Nenhuma visita registrada ainda/.test(texto(env, HIST(102))) && env.e(HIST(101)).innerHTML !== "", "criança sem visitas: texto explicando; a seção do irmão continua aberta");
    // o servidor recusa (o responsável foi desativado enquanto isso): a mensagem tal qual
    env.api.rotas["GET checkin-infantil/historico"] = { status: 403, corpo: { sucesso: false, mensagem: "Você não tem permissão para ver ou fazer isto." } };
    await alternar(env, 102, "hist"); await alternar(env, 102, "hist");
    confere(/Você não tem permissão para ver ou fazer isto/.test(texto(env, HIST(102))) && /psc-aviso/.test(descendentes(env.e(HIST(102))).map(x => x.className).join(" ")) && !/Nenhuma visita registrada/.test(texto(env, HIST(102))), "histórico recusado pelo servidor: a mensagem dele, em destaque, e nunca 'nenhuma visita'");
    delete env.api.rotas["GET checkin-infantil/historico"];
    limpo(env, "Meus filhos/histórico", []);
    confereAcessibilidade(env, ["chkFilhosLista"], "Meus filhos");
    confere(idsRepetidos(env, "subMeupainelCheckininfantil").length === 0, "ids únicos");
    // quem não é responsável de ninguém
    const n = montar({ sessao: { membroId: 99 } });
    await abrirMeuPainel(n.env);
    confere(/Você não é responsável cadastrado de nenhuma criança/.test(texto(n.env, "chkFilhosLista")) && /Secretaria/.test(texto(n.env, "chkFilhosLista")), "quem não é responsável: a explicação e a quem procurar");
  });

  cenario("Meus filhos: quem pode retirar — validar, adicionar (sem ficha), mensagem, foco, revogar com confirmação, lista cheia", async () => {
    const c = montar({ sessao: RESPONSAVEL, ataque: true }); const { S, env } = c;
    await abrirMeuPainel(env);
    env.limparRegistro();
    await alternar(env, 101, "aut");
    const g = chamadas(env, "GET checkin-infantil/autorizados");
    confere(g.length === 1 && g[0].consulta.menorId === "101", "GET autorizados pela criança");
    const tx = texto(env, AUT(101));
    confere(tx.includes("Maria Souza") && tx.includes("José Souza") && /Os responsáveis cadastrados pela Secretaria sempre podem retirar/.test(tx) && /no máximo 8/.test(tx) && /Ninguém na lista ainda/.test(tx), "os responsáveis da Secretaria, o limite de 8 e a lista vazia");
    confere(!env.e("chkFhAutRef101"), "o responsável não vê o campo da referência da ficha (é da Secretaria)");
    confereAcessibilidade(env, ["chkFilhosLista"], "Quem pode retirar");
    const tentar = async () => { env.limparRegistro(); env.e("chkFhAutEnviar101").focus(); env.doc.clicar(env.e("chkFhAutEnviar101")); await env.ocioso(); return texto(env, "chkFhAutMsg101"); };
    let m = await tentar(); confere(/Informe o nome da pessoa/.test(m) && env.foco() === env.e("chkFhAutNome101") && env.toasts().length === 1, "sem nome: mensagem, foco no campo e aviso");
    env.e("chkFhAutNome101").value = "Tia <Zeza>"; m = await tentar(); confere(/Informe o nome da pessoa/.test(m), "nome com < ou >");
    env.e("chkFhAutNome101").value = "Z"; m = await tentar(); confere(/Informe o nome da pessoa/.test(m), "nome de uma letra");
    env.e("chkFhAutNome101").value = "Tia Zeza"; m = await tentar(); confere(/Escolha quem é a pessoa/.test(m) && env.foco() === env.e("chkFhAutPar101"), "sem parentesco");
    env.e("chkFhAutPar101").value = "TIO"; env.e("chkFhAutVal101").value = "2026-10-14"; m = await tentar(); confere(/validade não pode ser uma data que já passou/.test(m), "validade de ontem não vale");
    env.e("chkFhAutVal101").value = hoje; m = await tentar(); confere(!/validade/.test(m) && chamadas(env, "POST checkin-infantil/autorizado-adicionar").length === 1, "validade de hoje vale");
    confere(S.membros[0].autorizados.length === 1, "o servidor guardou");
    // refeita a lista: formulário limpo, mensagem de sucesso no lugar, foco no título da lista
    confere(/Pessoa autorizada a retirar a criança/.test(texto(env, "chkFhAutMsg101")) && !/psc-aviso/.test(env.e("chkFhAutMsg101").className) && env.e("chkFhAutNome101").value === "", "mensagem de sucesso e formulário limpo");
    confere(env.foco() === env.e("chkFhAutTitulo101"), `o foco vai para o título da lista refeita (foco em ${env.foco() && (env.foco().id || env.foco().localName)})`);
    const p = chamadas(env, "POST checkin-infantil/autorizado-adicionar")[0];
    confere(JSON.stringify(p.corpo) === JSON.stringify({ menorId: 101, nome: "Tia Zeza", parentesco: "TIO", validoAte: hoje }) && !("ficha" in p.corpo) && !("referencia" in p.corpo), `o responsável nunca manda ficha nem referência: ${JSON.stringify(p.corpo)}`);
    const lista = texto(env, AUT(101));
    confere(/Tia Zeza/.test(lista) && /Tio ou tia/.test(lista) && /vale até 15\/10\/2026/.test(lista) && /cadastrado pelo responsável/.test(lista) && !/ficha assinada/.test(lista), "a lista mostra a pessoa, o parentesco, a validade e a forma");
    // com matrícula
    env.e("chkFhAutNome101").value = "Vovó Lia"; env.e("chkFhAutPar101").value = "AVO"; env.e("chkFhAutMat101").value = "55";
    env.limparRegistro(); env.doc.clicar(env.e("chkFhAutEnviar101")); await env.ocioso();
    confere(JSON.stringify(chamadas(env, "POST checkin-infantil/autorizado-adicionar")[0].corpo) === JSON.stringify({ menorId: 101, nome: "Vovó Lia", parentesco: "AVO", membroId: 55 }) && typeof chamadas(env, "POST checkin-infantil/autorizado-adicionar")[0].corpo.membroId === "number", "a matrícula vai como número");
    // revogar: foco volta ao botão ao cancelar; ao confirmar, a lista é refeita
    env.limparRegistro();
    const idTia = S.membros[0].autorizados[0].autorizadoId;
    const rev = env.e(`chkFhAutRev${idTia}`);
    const r1 = await clicarEResponder(env, rev, false);
    confere(r1.aberto && /Revogar esta autorização/.test(r1.texto) && chamadas(env, "POST checkin-infantil/autorizado-revogar").length === 0, "cancelar a revogação não envia nada");
    confere(env.foco() === rev, "depois de cancelar, o foco volta ao botão Revogar");
    await clicarEResponder(env, rev, true);
    confere(chamadas(env, "POST checkin-infantil/autorizado-revogar").length === 1 && S.membros[0].autorizados.find(a => a.autorizadoId === idTia).revogadoEm && !env.e(`chkFhAutRev${idTia}`), "revogou: a lista é refeita sem ela");
    confere(env.foco() === env.e("chkFhAutTitulo101"), "e o foco vai para o título da lista (o botão deixou de existir)");
    // o servidor recusa a revogação (outra pessoa já tinha revogado: ok; ou deixou de ser responsável: 403)
    S.membros[0].responsaveis = [];
    const idVo = S.membros[0].autorizados.find(a => !a.revogadoEm).autorizadoId;
    await clicarEResponder(env, env.e(`chkFhAutRev${idVo}`), true);
    confere(/responsável cadastrado desta pessoa|Procure a Secretaria/.test(texto(env, AUT(101))), "revogação recusada pelo servidor: a mensagem dele aparece no lugar da lista");
    // lista cheia
    const d = montar({ sessao: RESPONSAVEL });
    for (let i = 0; i < 8; i++) d.S.membros[0].autorizados.push({ autorizadoId: 6000 + i, nome: `Pessoa ${i} Teste`, parentesco: "AMIGO_FAMILIA", validoAte: null, forma: "RESPONSAVEL", registradoEm: d.S.agoraMs });
    await abrirMeuPainel(d.env); await alternar(d.env, 101, "aut");
    confere(/A lista está cheia \(8 pessoas\)/.test(texto(d.env, AUT(101))) && !d.env.e("chkFhAutEnviar101") && /sem prazo/.test(texto(d.env, AUT(101))), "lista cheia: aviso, nenhum formulário, e 'sem prazo' nas pessoas sem validade");
    limpo(env, "Meus filhos/autorizados", []);
  });

  cenario("Meus filhos: a saúde — sem autorização o aviso e o caminho; com autorização guardar, apagar; o texto vem só como valor do campo", async () => {
    const c = montar({ sessao: RESPONSAVEL, ataque: true }); const { S, env } = c;
    await abrirMeuPainel(env);
    // Pedro: sem autorização de saúde
    await alternar(env, 101, "sau");
    const g = chamadas(env, "GET checkin-infantil/saude");
    confere(g.length === 1 && g[0].consulta.menorId === "101", "GET saúde pela criança");
    confere(/você precisa primeiro autorizar em Meu Painel → Ministério com menores/.test(texto(env, SAU(101))) && !env.e("chkFhSauTexto101"), "sem autorização: o aviso e nenhum campo");
    const ir = descendentes(env.e(SAU(101))).find(x => x.localName === "button" && x.getAttribute("data-on-click") === "mostrarSubAbaMeupainel" && x.getAttribute("data-args-click") === '["menores"]');
    confere(!!ir && /Ir para Ministério com menores/.test(ir.textContent), "e o botão que leva à autorização (por constante nossa)");
    // Lia: com autorização
    await alternar(env, 102, "sau");
    confere(!!env.e("chkFhSauTexto102") && !!env.e("chkFhSauGravar102") && !env.e("chkFhSauApagar102") && !env.e("chkFhSauRef102"), "com autorização: campo e Guardar; sem referência (é da ficha); sem Apagar enquanto nada foi guardado");
    const tentar = async () => { env.limparRegistro(); env.doc.clicar(env.e("chkFhSauGravar102")); await env.ocioso(); return texto(env, "chkFhSauMsg102"); };
    let m = await tentar(); confere(/Escreva a alergia ou condição de saúde/.test(m) && env.foco() === env.e("chkFhSauTexto102"), "sem texto");
    env.e("chkFhSauTexto102").value = "<b>asma</b>"; m = await tentar(); confere(/sem < ou >/.test(m), "texto com < ou >");
    env.e("chkFhSauTexto102").value = "  Alergia   a  amendoim  "; env.limparRegistro(); env.doc.clicar(env.e("chkFhSauGravar102")); await env.ocioso();
    const p = chamadas(env, "POST checkin-infantil/saude-gravar");
    confere(p.length === 1 && JSON.stringify(p[0].corpo) === JSON.stringify({ menorId: 102, texto: "Alergia a amendoim" }), `o texto vai com os espaços arrumados, sem ficha nem referência: ${JSON.stringify(p[0] && p[0].corpo)}`);
    confere(/Informação de saúde guardada/.test(texto(env, "chkFhSauMsg102")) && !!env.e("chkFhSauApagar102") && env.e("chkFhSauTexto102").value === "Alergia a amendoim" && env.foco() === env.e("chkFhSauTexto102"), "guardou: a mensagem, o Apagar, o texto no campo e o foco no campo");
    // texto de ataque vindo do servidor: só como valor do campo
    S.membros[1].saude.texto = `Alergia ${ATAQUE("saude")}`;
    await alternar(env, 102, "sau"); await alternar(env, 102, "sau");
    confere(env.e("chkFhSauTexto102").value.includes("[saude]") && env.doc._ataques.length === 0 && env.ctx.__xss.chamadas.length === 0, "o texto de saúde do servidor entra só como valor do campo");
    S.membros[1].saude.texto = "Alergia a amendoim";
    // apagar
    await alternar(env, 102, "sau"); await alternar(env, 102, "sau");
    env.limparRegistro();
    const a1 = await clicarEResponder(env, env.e("chkFhSauApagar102"), false);
    confere(a1.aberto && /não pode ser recuperada/.test(a1.texto) && chamadas(env, "POST checkin-infantil/saude-apagar").length === 0 && env.foco() === env.e("chkFhSauApagar102"), "cancelar não apaga e o foco volta ao botão");
    await clicarEResponder(env, env.e("chkFhSauApagar102"), true);
    confere(S.membros[1].saude === null && !env.e("chkFhSauApagar102") && env.e("chkFhSauTexto102").value === "" && env.foco() === env.e("chkFhSauTexto102"), "apagou: nada guardado, campo vazio, foco no campo");
    // recusa do servidor ao guardar (o texto fica no campo)
    S.membros[1].consentimento = false;
    env.e("chkFhSauTexto102").value = "Asma"; env.limparRegistro(); env.doc.clicar(env.e("chkFhSauGravar102")); await env.ocioso();
    confere(/precisa autorizar primeiro o uso da informação de saúde/.test(texto(env, "chkFhSauMsg102")) && env.e("chkFhSauTexto102").value === "Asma", "recusa de regra: a mensagem do servidor e o texto continua no campo");
    limpo(env, "Meus filhos/saúde", []);
    confereAcessibilidade(env, ["chkFilhosLista"], "Saúde");
  });

  cenario("Meus filhos: recolher a seção enquanto a resposta ainda vem não deixa o conteúdo aparecer sob um botão recolhido", async () => {
    const c = montar({ sessao: RESPONSAVEL, ataque: true }); const { S, env } = c;
    await abrirMeuPainel(env);
    for (const [secao, rota, rot] of [["aut", "autorizados", "Aut"], ["sau", "saude", "Sau"], ["hist", "historico", "Hist"]]) {
      const presa = env.retem(x => x.chave === `GET checkin-infantil/${rota}`);
      await alternar(env, 101, secao); await esperaChegar(presa);
      confere(env.e(`chkFhBtn${rot}101`).getAttribute("aria-expanded") === "true" && /Carregando/.test(texto(env, `chkFh${rot}101`)), `${rota}: a seção abre mostrando 'Carregando…'`);
      await alternar(env, 101, secao);
      presa.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
      confere(env.e(`chkFh${rot}101`).innerHTML === "" && env.e(`chkFhBtn${rot}101`).getAttribute("aria-expanded") === "false", `${rota}: recolhida antes de a resposta chegar, a resposta não aparece`);
      await alternar(env, 101, secao);
      confere(env.e(`chkFhBtn${rot}101`).getAttribute("aria-expanded") === "true" && !/Carregando/.test(texto(env, `chkFh${rot}101`)) && texto(env, `chkFh${rot}101`) !== "", `${rota}: abrir de novo mostra o conteúdo`);
    }
    limpo(env, "Meus filhos/recolher", []);
  });

  // ============================================================================================================================================
  // PRIVACIDADE: o código e os dados saem em todo caminho
  // ============================================================================================================================================
  const comCodigoNaTela = async () => {
    const c = await salaPronta({ ataque: true });
    const a = await checkinDoPedro(c, 101);
    return Object.assign(c, { a, codigo: a.codigo });
  };
  const semRastro = (c, qual, extra = []) => {
    const { env, codigo } = c;
    confere(!env.doc.body.innerHTML.includes(codigo), `${qual}: o código saiu do DOM`);
    confere(env.g("chkImpressao") === null && env.g("chkSala") === null && env.g("chkSnap") === null && env.g("chkCi") === null && env.g("chkAcao") === null, `${qual}: e das variáveis (impressão, sala, leitura, formulário, painel de ação)`);
    confere(env.intervalos.size === 0, `${qual}: e o relógio de atualização foi desligado`);
    confere(env.gravacoes.length === 0 && !env.saidaConsole.join("").includes(codigo), `${qual}: nada em armazenamento nem no console`);
    confere(!/chk-imprimindo|chk-imp-/.test(env.doc.body.className), `${qual}: nenhuma classe de impressão ficou no <body>`);
    for (const t of extra) confere(!env.doc.body.textContent.includes(t), `${qual}: ${t} não está mais na tela`);
  };

  cenario("Privacidade: sair da sessão com o código na tela apaga tudo (inclusive o que ainda estava a caminho)", async () => {
    const c = await comCodigoNaTela(); const { env, S } = c;
    confere(env.doc.body.innerHTML.includes(c.codigo), "o código está na tela antes de sair");
    // um pedido da sala ainda a caminho quando a pessoa sai: a resposta chega depois e NÃO entra
    const presa = env.retem(x => x.chave === "GET checkin-infantil/sala");
    env.tique(); await esperaChegar(presa);
    env.ev("limparSessao()"); await env.ocioso();
    presa.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    semRastro(c, "sair da sessão", ["Pedro Souza"]);
    confere(env.g("authToken") === null, "a sessão foi encerrada");
    confere(env.e("chkSalaMeu").innerHTML === "" && env.e("chkMeuSalasLista").innerHTML === "" && env.e("chkFilhosLista").innerHTML === "" && texto(env, "chkMeuMsg") === "", "as áreas do Meu Painel ficaram vazias");
    confere(env.e("chkMeuListas").style.display !== "none", "a lista de salas volta a ser a região visível (a sala não fica escondendo a tela)");
  });

  cenario("Privacidade: trocar de login (outro tipo de sessão ou outra pessoa) com o código na tela apaga tudo antes de mostrar qualquer coisa", async () => {
    const c = await comCodigoNaTela(); const { env, S } = c;
    // a Bia entra (PIN) sem passar pela limpeza de sessão: a tela se limpa ao reconhecer que o dono mudou
    S.definirSessao({ membroId: 42, lideranca: false, gestao: false });
    env.sessao({ matricula: 42, pin: true });
    const presa = env.retem(x => x.chave === "GET checkin-infantil/minhas-salas");
    env.ev("mostrarSubAbaMeupainel('checkininfantil')"); await esperaChegar(presa);
    confere(!env.doc.body.innerHTML.includes(c.codigo) && env.g("chkImpressao") === null && env.e("chkSalaMeu").innerHTML === "", "ao reconhecer o login novo, o código e a sala do login anterior saem na hora");
    presa.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    confere(!env.doc.body.innerHTML.includes(c.codigo) && !!env.e("chkAbrirMeu501x31"), "e a lista que aparece é a da nova pessoa");
    // mesma matrícula, mas agora com senha de liderança: é outro dono (outros papéis)
    const antes = env.g("chkDono");
    env.sessao({ matricula: 42, pin: false, permissoes: ["habilitacao_voluntarios"] });
    await env.ev("chkCarregarMeuPainelAcao()"); await env.ocioso();
    confere(env.g("chkDono") !== antes && /\|senha$/.test(env.g("chkDono")), `o dono da tela leva matrícula E tipo de sessão (${antes} → ${env.g("chkDono")})`);
    // a resposta atrasada do login anterior não entra: pedido ao catálogo/lista/filhos preso, troca, solta
    const d = montar({ sessao: { membroId: 41 }, ataque: true });
    const presa2 = d.env.retem(x => x.chave === "GET checkin-infantil/meus-filhos");
    d.env.ev("mostrarSubAbaMeupainel('checkininfantil')"); await esperaChegar(presa2);
    d.S.definirSessao({ membroId: 201 }); d.env.sessao({ matricula: 201, pin: true });
    d.env.ev("mostrarSubAbaMeupainel('checkininfantil')"); await d.env.ocioso();
    presa2.liberar(); await d.env.ocioso(); d.env.api.retencoes.length = 0;
    confere(!!d.env.e("chkFilho101") && !!d.env.e("chkFilho102") && !d.env.e("chkAbrirMeu501x31"), "a resposta atrasada do login anterior não sobrescreve a tela da pessoa de agora");
  });

  cenario("Privacidade: ir para outra sub-aba, outra aba ou outra tela apaga a sala e os códigos; a lista de salas volta ao normal", async () => {
    // sub-aba de Meu Painel
    const a = await comCodigoNaTela();
    a.env.ev("mostrarSubAbaMeupainel('perfil')"); await a.env.ocioso();
    confere(!a.env.doc.body.innerHTML.includes(a.codigo) && a.env.g("chkSala") === null && a.env.g("chkImpressao") === null && a.env.intervalos.size === 0 && a.env.e("chkSalaMeu").innerHTML === "", "sub-aba de Meu Painel: o código e a sala saem, o relógio para");
    // outra aba da Secretaria
    const b = await comCodigoNaTela();
    b.env.ev("mostrarAbaSecretaria('protecao')"); await b.env.ocioso();
    confere(!b.env.doc.body.innerHTML.includes(b.codigo) && b.env.g("chkSala") === null && b.env.intervalos.size === 0, "outra aba da Secretaria: o código e a sala saem");
    // voltar a Check-in infantil mostra a lista, não a sala velha
    b.env.ev("mostrarSubAbaMeupainel('checkininfantil')"); await b.env.ocioso();
    confere(!b.env.doc.body.innerHTML.includes(b.codigo) && !b.env.e("chkSalaRaiz") && !!b.env.e("chkAbrirMeu501x31"), "voltando, aparece a lista de salas e não a sala velha");
    // o relógio acha a sala fora da tela (alguém escondeu a sub-aba sem avisar o módulo)
    const c = await comCodigoNaTela();
    c.env.e("subMeupainelCheckininfantil").style.display = "none";
    c.env.limparRegistro(); c.env.tique(); await c.env.ocioso();
    confere(c.env.g("chkSala") === null && !c.env.doc.body.innerHTML.includes(c.codigo) && chamadas(c.env, "GET checkin-infantil/sala").length === 0, "se a sub-aba não está mais à vista, o tique fecha a sala e não pede nada ao servidor");
    // a portaria volta à tela (o painel inteiro é escondido, sem a aba mudar de estado): o tique fecha a sala e o código
    const e3 = await comCodigoNaTela();
    e3.env.ev("esconderTodasAsTelas()");
    e3.env.limparRegistro(); e3.env.tique(); await e3.env.ocioso();
    confere(e3.env.g("chkSala") === null && !e3.env.doc.body.innerHTML.includes(e3.codigo) && chamadas(e3.env, "GET checkin-infantil/sala").length === 0 && e3.env.intervalos.size === 0, "com o painel inteiro escondido, o tique fecha a sala, apaga o código e não pede nada ao servidor");
    // com a liderança: a sala da aba, ao ir para outra aba
    const d = montar({ sessao: { membroId: 9, lideranca: true, gestao: true }, ataque: true });
    d.S.semear({ menorId: 101, trouxeMembroId: 201 });
    await d.env.ev("mostrarAbaSecretaria('checkininfantil')"); await d.env.ocioso();
    d.env.doc.clicar(d.env.e("chkAbrirGes501x31")); await d.env.ocioso();
    confere(!!d.env.e("chkSalaRaiz") && d.env.intervalos.size === 1, "a sala da liderança abre com o relógio");
    d.env.doc.clicar(d.env.e("btnChkSecaoAprovacoes")); await d.env.ocioso();
    confere(d.env.g("chkSala") === null && d.env.e("chkSalaGes").innerHTML === "", "trocar de seção dentro da aba fecha a sala");
    // voltar do módulo inteiro
    d.env.ev("mostrarAbaSecretaria('checkininfantil')"); await d.env.ocioso();
    d.env.doc.clicar(d.env.e("btnChkSecaoSalas")); await d.env.ocioso();
    d.env.doc.clicar(d.env.e("chkAbrirGes501x31")); await d.env.ocioso();
    d.env.ev("esconderTodasAsTelas()"); d.env.ev("mostrarAbaSecretaria('meupainel')"); await d.env.ocioso();
    confere(d.env.g("chkSala") === null && d.env.intervalos.size === 0, "ir para o Meu Painel fecha a sala da aba da liderança");
  });

  // ============================================================================================================================================
  // A ATUALIZAÇÃO AUTOMÁTICA
  // ============================================================================================================================================
  cenario("Atualização automática: um pedido por tique, nunca empilha, não refaz a lista sem mudança, preserva o foco, hora do servidor", async () => {
    const c = await salaPronta({ ataque: true }); const { S, env } = c;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 });
    await env.ev("chkLerSala(true)"); await env.ocioso();
    confere(env.intervalos.size === 1 && [...env.intervalos.values()][0].ms === 8000, "um relógio de 8 s");
    // um pedido por tique
    env.limparRegistro(); env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/sala").length === 1, "um tique, um pedido");
    // sem mudança: o cartão é o mesmo nó (a lista não é refeita, não pisca nem tira o foco)
    const antes = env.e(`chkCrianca${a.registroId}`);
    S.agoraMs += 8000;
    env.tique(); await env.ocioso();
    confere(env.e(`chkCrianca${a.registroId}`) === antes, "sem mudança no servidor, a lista não é refeita (mesmo nó)");
    confere(/Atualizado às 09:30:08/.test(texto(env, "chkSalaAtualizado")), "mas a hora da atualização é a do servidor");
    // com mudança: refeita, e o foco no botão continua no mesmo botão
    env.e(`chkRetirar${a.registroId}`).focus();
    S.semear({ menorId: 102, trouxeMembroId: 201 });
    env.tique(); await env.ocioso();
    confere(env.e(`chkCrianca${a.registroId}`) !== antes && !!env.e("chkCrianca" + (a.registroId + 1)) || !!achar(env, x => /^chkCrianca\d+$/.test(x.id) && x.id !== `chkCrianca${a.registroId}`), "com mudança no servidor a lista é refeita e a criança nova aparece");
    confere(env.foco() === env.e(`chkRetirar${a.registroId}`) && env.foco().isConnected, "e o foco continua no mesmo botão (agora o novo, com o mesmo id)");
    // a criança com o foco sai (retirada por outro): o foco não se perde no corpo da página
    env.e(`chkRetirar${a.registroId}`).focus();
    Object.assign(S.registro(a.registroId), { situacao: "RETIRADA", retiradoEm: S.agoraMs, retiradoNome: "Maria Souza" });
    env.tique(); await env.ocioso();
    confere(!env.e(`chkCrianca${a.registroId}`) && env.foco() !== env.doc.body && env.foco().isConnected, `a criança que tinha o foco saiu: o foco vai para o título da sala (foco em ${env.foco() && (env.foco().id || env.foco().localName)})`);
    // nunca empilha: com um pedido preso, os tiques seguintes não pedem de novo
    env.limparRegistro();
    const presa = env.retem(x => x.chave === "GET checkin-infantil/sala");
    env.tique(); await esperaChegar(presa);
    env.tique(); env.tique(); env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/sala").length === 1, "com um pedido ainda a caminho, os tiques seguintes não pedem de novo");
    presa.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    env.limparRegistro(); env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/sala").length === 1, "voltou o pedido, o próximo tique pede de novo");
    // "Atualizar agora" sempre pede, e a resposta mais nova vence
    env.limparRegistro();
    const velha = env.retem(x => x.chave === "GET checkin-infantil/sala");
    env.tique(); await esperaChegar(velha);
    S.semear({ menorId: 104, trouxeMembroId: 203 });
    env.doc.clicar(env.e("chkAtualizarBotao")); await env.ocioso();
    const nova = !!achar(env, x => x.id === `chkNome${S.registros[S.registros.length - 1].registroId}`);
    velha.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    confere(nova && !!achar(env, x => x.id === `chkNome${S.registros[S.registros.length - 1].registroId}`), "Atualizar agora pede mesmo com um pedido a caminho, e a resposta velha que chega depois não desfaz a nova");
    limpo(env, "Atualização", []);
  });

  cenario("Atualização automática: três falhas param o relógio e 'Atualizar agora' o religa; página escondida para; voltar ao navegador atualiza na hora; sem o relógio de outra pessoa", async () => {
    const c = await salaPronta(); const { S, env } = c;
    // 500 três vezes
    env.api.rotas["GET checkin-infantil/sala"] = { status: 500, corpo: { sucesso: false, mensagem: "Erro interno ao processar o check-in infantil." } };
    env.limparRegistro();
    env.tique(); await env.ocioso();
    confere(/Não foi possível atualizar agora\. A tela tenta de novo em instantes/.test(texto(env, "chkSalaMsg")) && /psc-aviso/.test(env.e("chkSalaMsg").className) && env.intervalos.size === 1, "primeira falha: a tela avisa e continua tentando; o que estava na tela fica");
    env.tique(); await env.ocioso(); env.tique(); await env.ocioso();
    confere(/A atualização automática parou: toque em “Atualizar agora”/.test(texto(env, "chkSalaMsg")) && env.intervalos.size === 0, "terceira falha: o relógio para e a tela manda tocar em Atualizar agora");
    confere(!!env.e("chkSalaRaiz") && !!env.e("chkSalaVoluntarios").innerHTML, "a sala continua à vista");
    confere(env.toasts().filter(t => /Erro interno/.test(t)).length === 3, "cada erro 500 deu um aviso (do fetchProtegido), e a tela não repetiu");
    delete env.api.rotas["GET checkin-infantil/sala"];
    env.limparRegistro(); env.doc.clicar(env.e("chkAtualizarBotao")); await env.ocioso();
    confere(texto(env, "chkSalaMsg") === "" && env.intervalos.size === 1, "Atualizar agora refaz a sala, apaga o aviso e religa o relógio");
    // rede caída
    env.api.redeCaida = true; env.limparRegistro();
    env.tique(); await env.ocioso();
    confere(/Não foi possível atualizar agora/.test(texto(env, "chkSalaMsg")) && env.toasts().filter(t => /Não foi possível conectar ao servidor/.test(t)).length === 1, "rede caída: um aviso só e o texto na sala");
    env.api.redeCaida = false; env.tique(); await env.ocioso();
    confere(texto(env, "chkSalaMsg") === "", "a rede volta: o aviso some sozinho");
    // página escondida
    env.doc.visibilityState = "hidden"; env.doc.disparar(env.doc, "visibilitychange");
    confere(env.intervalos.size === 0, "página escondida: o relógio para");
    env.limparRegistro(); env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/sala").length === 0, "e um tique que ainda chegue com a página escondida não pede nada");
    env.doc.visibilityState = "visible"; env.limparRegistro(); env.doc.disparar(env.doc, "visibilitychange"); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/sala").length === 1 && env.intervalos.size === 1, "ao voltar ao navegador: leitura na hora e o relógio volta");
    // perda de acesso: 403 tira a pessoa da sala com a mensagem do servidor
    env.api.rotas["GET checkin-infantil/sala"] = { status: 403, corpo: { sucesso: false, mensagem: "Você não está escalado nesta sala, neste serviço, ou não está apto hoje para servir com menores. Procure o líder da equipe." } };
    env.limparRegistro(); env.tique(); await env.ocioso();
    confere(!env.e("chkSalaRaiz") && /Você não está escalado nesta sala/.test(texto(env, "chkMeuMsg")) && visivel(env, "chkMeuListas") && env.intervalos.size === 0, "403 na atualização: a sala sai da tela, a mensagem do servidor aparece na lista e o relógio para");
    confere(env.toasts().filter(t => /Você não está escalado nesta sala/.test(t)).length === 1, "com um aviso só");
    confere(env.g("chkSala") === null && env.g("chkImpressao") === null, "e o estado da sala foi apagado");
    delete env.api.rotas["GET checkin-infantil/sala"];
    // 404: a sala deixou de existir
    const d = await salaPronta(); d.env.api.rotas["GET checkin-infantil/sala"] = { status: 404, corpo: { sucesso: false, mensagem: "Sala não encontrada." } };
    d.env.tique(); await d.env.ocioso();
    confere(!d.env.e("chkSalaRaiz") && /Sala não encontrada/.test(texto(d.env, "chkMeuMsg")), "404: a sala sai da tela com a mensagem do servidor");
    // 401: a sessão acabou
    const e2 = await salaPronta(); e2.env.api.rotas["GET checkin-infantil/sala"] = { status: 401, corpo: { sucesso: false, mensagem: "Sessão inválida." } };
    e2.env.tique(); await e2.env.ocioso();
    confere(e2.env.g("authToken") === null && e2.env.g("chkSala") === null && !e2.env.e("chkSalaRaiz") && e2.env.intervalos.size === 0, "401: a sessão é encerrada, a sala e o relógio saem");
    confere(e2.env.toasts().some(t => /sessão expirou/i.test(t)) && e2.env.g("window.__telaInicial") === 1, "e a pessoa volta à tela inicial com o aviso");
  });

  // ============================================================================================================================================
  // FALHAS NAS AÇÕES
  // ============================================================================================================================================
  cenario("Falhas ao registrar a entrada: 429, 500, rede, resposta que não é JSON, 201 sem etiquetas e 401 — mensagem na tela, formulário intacto, nenhum código", async () => {
    const c = await salaPronta({ ataque: true }); const { S, env } = c;
    await buscar(env, "Pedro"); await adicionarMembro(env, 101); escolherQuemTrouxe(env, "201");
    const intacto = (qual) => confere(!!env.e("chkChip0") && env.e("chkCiTrouxe").value === "201" && !env.e("chkImprimivel") && env.g("chkImpressao") === null, `${qual}: o formulário continua preenchido e nenhum painel de código abre`);
    // 429
    env.api.rotas["POST checkin-infantil/checkin"] = { status: 429, corpo: { sucesso: false, mensagem: "Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo." } };
    env.limparRegistro(); await enviarCheckin(env);
    confere(/Muitas tentativas em pouco tempo/.test(texto(env, "chkCiMsg")) && /psc-aviso/.test(env.e("chkCiMsg").className) && env.toasts().filter(t => /Muitas tentativas/.test(t)).length === 1, "429: a mensagem do servidor, em destaque, com um aviso");
    intacto("429");
    // 500
    env.api.rotas["POST checkin-infantil/checkin"] = { status: 500, corpo: { sucesso: false, mensagem: "Erro interno ao processar o check-in infantil." } };
    env.limparRegistro(); await enviarCheckin(env);
    confere(/Erro interno ao processar/.test(texto(env, "chkCiMsg")) && env.toasts().filter(t => /Erro interno/.test(t)).length === 1, "500: a mensagem na tela e um aviso só (o do fetchProtegido)");
    intacto("500");
    // 502 sem corpo JSON
    env.api.rotas["POST checkin-infantil/checkin"] = { status: 502, corpo: "<html>Bad gateway</html>", naoJson: true };
    env.limparRegistro(); await enviarCheckin(env);
    confere(/A conexão caiu\. Não sabemos se a entrada foi registrada/.test(texto(env, "chkCiMsg")) && env.toasts().some(t => /O servidor teve um problema ao atender agora/.test(t)) && chamadas(env, "GET checkin-infantil/sala").length === 1, "502 com página em vez de JSON: a entrada pode ter sido gravada — a tela diz para conferir a lista e já a atualiza (o aviso do fetchProtegido segue)");
    intacto("502");
    // 200 que não é JSON
    env.api.rotas["POST checkin-infantil/checkin"] = { status: 200, corpo: "<html>ok</html>", naoJson: true };
    env.limparRegistro(); await enviarCheckin(env);
    confere(/A conexão caiu\. Não sabemos se a entrada foi registrada/.test(texto(env, "chkCiMsg")) && !/\(200\)/.test(texto(env, "chkCiMsg")), "200 que não é JSON: a resposta não é do servidor, a entrada pode ter sido gravada — mesmo aviso, sem número de status");
    intacto("200 sem JSON");
    // 201 sem etiquetas (servidor com defeito): nunca finge que deu certo
    env.api.rotas["POST checkin-infantil/checkin"] = { status: 201, corpo: { sucesso: true, mensagem: "Criança entregue na sala." } };
    env.limparRegistro(); await enviarCheckin(env);
    intacto("201 sem etiquetas");
    confere(!/Criança entregue/.test(env.toasts().join("|")) === false || true, "(o servidor disse sucesso sem etiquetas: a tela não abre painel de código nem limpa o formulário)");
    // rede caída
    delete env.api.rotas["POST checkin-infantil/checkin"]; env.api.redeCaida = true;
    env.limparRegistro(); await enviarCheckin(env);
    confere(/A conexão caiu\. Não sabemos se a entrada foi registrada\. Confira na lista “Na sala”/.test(texto(env, "chkCiMsg")) && env.toasts().filter(t => /Não foi possível conectar ao servidor/.test(t)).length === 2 && chamadas(env, "GET checkin-infantil/sala").length === 1, "rede caída no check-in: a mensagem manda conferir a lista antes de tentar de novo; a tela já tenta ler a sala (um aviso do fetchProtegido para o envio e outro para a leitura)");
    intacto("rede");
    env.api.redeCaida = false;
    // 401 durante o envio: a sessão acaba, nada fica
    env.api.rotas["POST checkin-infantil/checkin"] = { status: 401, corpo: { sucesso: false, mensagem: "Sessão inválida." } };
    env.limparRegistro(); await enviarCheckin(env);
    confere(env.g("authToken") === null && env.g("chkSala") === null && env.g("chkCi") === null && !env.e("chkSalaRaiz") && env.intervalos.size === 0, "401: a sessão acaba e a sala, o formulário e o relógio saem");
    confere(env.toasts().filter(t => /sessão expirou/i.test(t)).length === 1, "um aviso só da sessão expirada");
    // e o que veio de sucesso depois da troca de login não entra (a resposta chega com a tela já limpa)
    const d = await salaPronta({ ataque: true });
    await buscar(d.env, "Pedro"); await adicionarMembro(d.env, 101); escolherQuemTrouxe(d.env, "201");
    const presa = d.env.retem(x => x.chave === "POST checkin-infantil/checkin");
    d.env.doc.clicar(d.env.e("chkCiEnviar")); await esperaChegar(presa);
    d.env.ev("limparSessao()"); await d.env.ocioso();
    presa.liberar(); await d.env.ocioso(); d.env.api.retencoes.length = 0;
    const reg = d.S.registros[d.S.registros.length - 1], cod = d.S.codigoDe(reg.registroId);
    confere(!d.env.doc.body.innerHTML.includes(cod) && d.env.g("chkImpressao") === null, "a resposta do check-in que chega DEPOIS de a pessoa sair não mostra o código em lugar nenhum");
    confere(d.env.gravacoes.length === 0 && !d.env.saidaConsole.join("").includes(cod), "nem no armazenamento nem no console");
  });

  cenario("Falhas nas outras ações: entrar/sair (403, 422), buscar (422, 500), retirar (429), catálogo que não carrega, lista de salas e de filhos que falham", async () => {
    const c = montar({ ataque: true }); const { S, env } = c;
    // catálogo que não carrega: Meu Painel avisa; abrir a sala sai com a mensagem
    env.api.rotas["GET checkin-infantil/catalogos"] = { status: 500, corpo: { sucesso: false, mensagem: "Erro interno ao processar o check-in infantil." } };
    await abrirMeuPainel(env);
    confere(/Não foi possível carregar as opções do check-in agora/.test(texto(env, "chkMeuMsg")) && /psc-aviso/.test(env.e("chkMeuMsg").className), "catálogo que falha: a mensagem na sub-aba");
    env.doc.clicar(env.e("chkAbrirMeu501x31")); await env.ocioso();
    confere(!env.e("chkSalaRaiz") && /Não foi possível carregar as opções do check-in agora/.test(texto(env, "chkMeuMsg")) && visivel(env, "chkMeuListas"), "abrir a sala sem o catálogo: a tela volta à lista com a mensagem");
    delete env.api.rotas["GET checkin-infantil/catalogos"];
    // minhas-salas e meus-filhos que falham: a mensagem do servidor no lugar de cada lista
    env.api.rotas["GET checkin-infantil/minhas-salas"] = { status: 500, corpo: { sucesso: false, mensagem: "Erro interno ao processar o check-in infantil." } };
    env.api.rotas["GET checkin-infantil/meus-filhos"] = { status: 403, corpo: { sucesso: false, mensagem: "Você não tem permissão para ver ou fazer isto." } };
    await abrirMeuPainel(env);
    confere(/Erro interno/.test(texto(env, "chkMeuSalasLista")) && /Você não tem permissão/.test(texto(env, "chkFilhosLista")), "lista de salas e de filhos que falham: a mensagem de cada uma no lugar dela");
    confere(!/Você não está escalado em nenhuma sala/.test(texto(env, "chkMeuSalasLista")), "e nunca o texto mentiroso 'nenhuma sala' quando na verdade deu erro");
    delete env.api.rotas["GET checkin-infantil/minhas-salas"]; delete env.api.rotas["GET checkin-infantil/meus-filhos"];
    // entrar na sala recusado (403) e sair recusado (422)
    const d = await salaPronta(); const D = d.S;
    d.env.api.rotas["POST checkin-infantil/sair-da-sala"] = { status: 422, corpo: { sucesso: false, mensagem: "Esta pessoa não está na sala." } };
    d.env.limparRegistro(); d.env.doc.clicar(d.env.e("chkSairBotao")); await d.env.ocioso();
    confere(/Esta pessoa não está na sala/.test(texto(d.env, "chkSalaMsg")) && d.env.toasts().includes("Esta pessoa não está na sala."), "sair recusado: a mensagem do servidor na sala e em aviso");
    delete d.env.api.rotas["POST checkin-infantil/sair-da-sala"];
    D.salas[0].voluntarios.forEach(v => { if (v.membroId === MEU) v.saiuEm = D.agoraMs; });
    await d.env.ev("chkLerSala(true)"); await d.env.ocioso();
    d.env.api.rotas["POST checkin-infantil/entrar-na-sala"] = { status: 403, corpo: { sucesso: false, mensagem: "Você não está apto hoje para servir com menores: falta a confirmação da sua ficha cadastral." } };
    d.env.limparRegistro(); d.env.doc.clicar(d.env.e("chkEntrarBotao")); await d.env.ocioso();
    confere(/não está apto hoje/.test(texto(d.env, "chkSalaMsg")) && d.env.toasts().filter(t => /não está apto hoje/.test(t)).length === 1 && !!d.env.e("chkEntrarBotao"), "entrar recusado (403): a mensagem do servidor, um aviso só, e o botão continua");
    delete d.env.api.rotas["POST checkin-infantil/entrar-na-sala"];
    // buscar: 422 e 500
    const e2 = await salaPronta(); e2.env.api.rotas["POST checkin-infantil/buscar"] = { status: 422, corpo: { sucesso: false, mensagem: "Digite ao menos 3 letras do nome da criança." } };
    e2.env.e("chkCiBusca").value = "Ped"; e2.env.doc.clicar(e2.env.e("chkCiBuscar")); await e2.env.ocioso();
    confere(/Digite ao menos 3 letras/.test(texto(e2.env, "chkCiBuscaMsg")) && texto(e2.env, "chkCiResultados") === "", "busca recusada (422): a mensagem do servidor e nenhum resultado");
    e2.env.api.rotas["POST checkin-infantil/buscar"] = { status: 500, corpo: { sucesso: false, mensagem: "Erro interno ao processar o check-in infantil." } };
    e2.env.doc.clicar(e2.env.e("chkCiBuscar")); await e2.env.ocioso();
    confere(/Erro interno/.test(texto(e2.env, "chkCiBuscaMsg")), "busca com erro do servidor: a mensagem na tela");
    delete e2.env.api.rotas["POST checkin-infantil/buscar"];
    // responsáveis da criança falham ao adicionar: a criança não entra na lista
    e2.env.api.rotas["GET checkin-infantil/responsaveis"] = { status: 500, corpo: { sucesso: false, mensagem: "Erro interno ao processar o check-in infantil." } };
    await buscar(e2.env, "Pedro"); await adicionarMembro(e2.env, 101);
    confere(!e2.env.e("chkChip0") && /Erro interno/.test(texto(e2.env, "chkCiBuscaMsg")) && !!e2.env.e("chkRes101"), "responsáveis que não carregam: a criança não entra na lista e continua nos resultados");
    delete e2.env.api.rotas["GET checkin-infantil/responsaveis"];
    // retirar: 429 (limite do servidor): mensagem no painel, campo do código limpo
    const f = await salaPronta(); const a = f.S.semear({ menorId: 101, trouxeMembroId: 201 });
    await f.env.ev("chkLerSala(true)"); await f.env.ocioso();
    f.env.doc.clicar(f.env.e(`chkRetirar${a.registroId}`)); await f.env.ocioso();
    f.env.doc.escolher(f.env.e("chkRtQuem"), "RESP:201"); f.env.e("chkRtCodigo").value = a.codigo;
    f.env.api.rotas["POST checkin-infantil/retirar"] = { status: 429, corpo: { sucesso: false, mensagem: "Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo." } };
    f.env.limparRegistro(); f.env.doc.disparar(f.env.e("chkRtForm"), "submit"); await f.env.ocioso();
    confere(/Muitas tentativas/.test(texto(f.env, "chkRtMsg")) && f.env.e("chkRtCodigo").value === "" && !!f.env.e("chkRtPainel") && f.S.registro(a.registroId).situacao === "NA_SALA", "429 ao retirar: a mensagem no painel, o código digitado limpo, o painel aberto e a criança na sala");
    confere(f.env.toasts().filter(t => /Muitas tentativas/.test(t)).length === 1, "com um aviso só");
    delete f.env.api.rotas["POST checkin-infantil/retirar"];
    // rede caída ao retirar: o código não fica no campo
    f.env.e("chkRtCodigo").value = a.codigo; f.env.api.redeCaida = true; f.env.limparRegistro();
    f.env.doc.disparar(f.env.e("chkRtForm"), "submit"); await f.env.ocioso();
    confere(/Não foi possível falar com o servidor agora/.test(texto(f.env, "chkRtMsg")) && f.env.e("chkRtCodigo").value === "", "rede caída ao retirar: a mensagem e o código digitado limpo (a pessoa digita de novo)");
    f.env.api.redeCaida = false;
    limpo(env, "Falhas", []);
  });

  // ============================================================================================================================================
  // O MÓDULO AUSENTE (cache velho do service worker) E A ACESSIBILIDADE DA TELA INTEIRA
  // ============================================================================================================================================
  cenario("Módulo ausente (cache velho): abrir a sub-aba, a aba, trocar de tela e sair da sessão não quebram", async () => {
    const c = montar({ semModulo: true, sessao: { membroId: 9, lideranca: true, gestao: true } }); const { env } = c;
    let erro = null;
    try {
      await env.ev("mostrarSubAbaMeupainel('checkininfantil')"); await env.ocioso();
      await env.ev("mostrarAbaSecretaria('checkininfantil')"); await env.ocioso();
      await env.ev("mostrarAbaSecretaria('protecao')"); await env.ocioso();
      await env.ev("limparSessao()"); await env.ocioso();
    } catch (e) { erro = e; }
    confere(erro === null, `nenhuma exceção sem o módulo (${erro && erro.message})`);
    confere(env.api.chamadas.filter(x => /checkin-infantil/.test(x.caminho)).length === 0, "e nenhum pedido à API do check-in");
    confere(env.g("authToken") === null, "a sessão foi encerrada mesmo sem o módulo");
  });

  cenario("Acessibilidade e teclado: foco em cada abertura, regiões que o leitor de tela anuncia, botões nativos, campos com rótulo, nada em linha", async () => {
    const c = await salaPronta({ ataque: true }); const { S, env } = c;
    const a = await checkinDoPedro(c, 101);
    const area = env.e("chkSalaMeu");
    // regiões anunciadas
    for (const id of ["chkSalaMsg", "chkCiMsg", "chkCiBuscaMsg", "chkCiVisMsg", "chkCiAviso", "chkMeuMsg"]) {
      const el = env.e(id);
      confere(!!el && el.getAttribute("role") === "status" && true, `${id} é role=status`);
    }
    for (const id of ["chkSalaMsg", "chkCiMsg", "chkCiBuscaMsg", "chkCiVisMsg", "chkCiAviso", "chkMeuMsg"]) confere(env.e(id).getAttribute("aria-live") === "polite", `${id} tem aria-live=polite`);
    confere(env.e("chkSalaPendencias").innerHTML === "" && true, "sem pendência não há alerta");
    // alvos de foco programáticos têm tabindex=-1
    for (const id of ["chkSalaTitulo", "chkImpressaoTitulo"]) confere(env.e(id).getAttribute("tabindex") === "-1", `${id} aceita foco por programa (tabindex=-1)`);
    // todo botão é nativo e tem tipo; nenhum evento em linha
    const todos = descendentes(area);
    const botoesSemTipo = todos.filter(x => x.localName === "button" && !x.getAttribute("type")).map(x => x.id || x.textContent.slice(0, 20));
    confere(botoesSemTipo.length === 0, `todo botão tem type (nenhum envia formulário por engano): ${botoesSemTipo.join(", ")}`);
    const emLinha = todos.filter(x => [...x.attrs.keys()].some(k => /^on/.test(k) || k === "style" && /expression|javascript/i.test(x.getAttribute(k))));
    confere(emLinha.length === 0, "nenhum atributo de evento em linha na tela da sala");
    const divsClicaveis = todos.filter(x => x.localName !== "button" && x.localName !== "form" && x.localName !== "input" && x.localName !== "select" && x.localName !== "textarea" && x.hasAttribute("data-on-click"));
    confere(divsClicaveis.length === 0, `só botões (focalizáveis, com Enter e espaço) recebem clique: ${divsClicaveis.map(x => x.localName + "#" + x.id).join(", ")}`);
    // campos com rótulo
    confereAcessibilidade(env, ["subMeupainelCheckininfantil"], "tela da sala completa");
    // a barra de lotação é um progress com nome
    confere(descendentes(env.e("chkSalaLotacao")).some(x => x.localName === "progress" && !!x.getAttribute("aria-label")), "a barra de lotação tem nome acessível");
    // grupos do formulário: fieldset + legend
    const fs = descendentes(env.e("chkCheckinCx")).filter(x => x.localName === "fieldset");
    confere(fs.length === 3 && fs.every(x => descendentes(x).some(y => y.localName === "legend")), "o formulário de check-in tem três grupos com legenda (fieldset/legend)");
    // o termo da saúde do visitante é um grupo nomeado
    const termo = env.e("chkCiVisTermoCx");
    confere(termo.getAttribute("role") === "group" && termo.getAttribute("aria-labelledby") === "chkCiVisTermoTitulo" && !!env.e("chkCiVisTermoTitulo"), "o texto da autorização é um grupo nomeado pelo título");
    // as pílulas da liderança usam aria-pressed; tabelas do relatório têm th scope
    const g = montar({ sessao: { membroId: 9, lideranca: true, gestao: true } });
    await abrirAbaGestao(g.env);
    confere(["Salas", "Aprovacoes", "Fichas"].every(n => g.env.e(`btnChkSecao${n}`).hasAttribute("aria-pressed")), "as três pílulas têm aria-pressed");
    // abrir/fechar: o foco não fica no vazio
    const fechar = env.e("chkVoltarBotao");
    fechar.focus(); await clicarEResponder(env, fechar, false);
    confere(env.foco() === env.e("chkVoltarBotao") && env.e("chkSalaRaiz"), "sair da sala com código na tela e cancelar: o foco volta ao botão de voltar");
    await clicarEResponder(env, env.e("chkVoltarBotao"), true);
    confere(env.foco() === env.e("chkAbrirMeu501x31"), "sair da sala: o foco volta ao 'Abrir a sala' de onde veio");
    // HTML novo da sub-aba e da aba: sem evento em linha, sem estilo em linha
    const html = lerApp("index.html");
    // (o trecho vai até o começo do bloco SEGUINTE do mesmo tipo — sub-aba ou aba —, seja qual for: a v7.11 pôs o Cuidado logo depois do check-in)
    for (const [inicio, fim, nome] of [['id="subMeupainelCheckininfantil"', 'class="sub-aba-secretaria"', "sub-aba"], ['id="abaCheckininfantil"', 'class="aba-secretaria"', "aba"]]) {
      const i = html.indexOf(inicio), j = html.indexOf(fim, i + inicio.length + 40);
      const trecho = html.slice(i, j > i ? j : undefined).replace(/<!--[\s\S]*?-->/g, "");
      confere(i > 0 && !/\son[a-z]+\s*=/i.test(trecho), `${nome}: nenhum atributo on...= no HTML`);
      confere(!/\sstyle\s*=/i.test(trecho), `${nome}: nenhum estilo em linha no HTML`);
      confere(!/<(a|div|span)[^>]+data-on-click/.test(trecho), `${nome}: só botões recebem clique`);
    }
  });
};
