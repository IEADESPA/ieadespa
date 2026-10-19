// cenarios-ataque-total.js — o servidor devolve TODO texto com um ataque no fim (<img onerror>, <svg onload>, aspas que fecham atributo): as telas inteiras do responsável, da equipe da sala e da
// liderança são percorridas e NADA pode ter virado marcação, executado ou criado atributo de evento. O nome do campo vai dentro do ataque ([t_campo]): vê-lo na tela prova que o campo chegou como texto.
"use strict";

module.exports = function registrar(H) {
  const { cenario, confere, montar, limpo, achar, descendentes, chamadas, texto, argsDe, visivel, clicarEResponder, esperar, abrirMeuPainel, abrirSalaMeu, abrirAbaGestao, abrirSalaGestao, salaPronta,
    buscar, adicionarMembro, escolherQuemTrouxe, enviarCheckin, cartao, F, ATAQUE, MIN, SALA } = H;

  // todos os marcadores [t_campo] esperados dentro de uma região
  const marcas = (env, regiao, lista, qual) => {
    const t = env.e(regiao) ? env.e(regiao).textContent : "";
    const faltam = lista.filter(m => !t.includes(`[${m}]`));
    confere(faltam.length === 0, `${qual}: estes campos do servidor não chegaram à tela como texto: ${faltam.join(", ")}`);
  };
  const alternar = async (env, id, secao) => { const rot = { hist: "Hist", aut: "Aut", sau: "Sau" }[secao]; env.e(`chkFhBtn${rot}${id}`).focus(); env.doc.clicar(env.e(`chkFhBtn${rot}${id}`)); await env.ocioso(); };
  const confereLimpo = (env, qual) => {
    confere(env.doc._ataques.length === 0, `${qual}: o texto de ataque virou marcação ou atributo de evento (${JSON.stringify(env.doc._ataques.slice(0, 2))})`);
    confere(env.ctx.__xss.chamadas.length === 0, `${qual}: código do ataque EXECUTOU (${env.ctx.__xss.chamadas.slice(0, 3).join(",")})`);
    confere(env.doc._erros.length === 0, `${qual}: HTML malformado gerado (${env.doc._erros.slice(0, 2).join("; ")})`);
  };

  cenario("Ataque total (responsável): salas, filhos, histórico, quem pode retirar e saúde — nenhum texto do servidor vira marcação", async () => {
    const c = montar({ sessao: { membroId: 201 }, ataque: "total" }); const { S, env } = c;
    const antiga = S.semear({ menorId: 101, trouxeMembroId: 201, situacao: "RETIRADA" }); S.registro(antiga.registroId).divergente = true;
    S.semear({ menorId: 101, trouxeMembroId: 202 });
    S.membros[1].saude = { texto: "Alergia a amendoim", forma: "RESPONSAVEL", atualizadoEm: S.agoraMs };
    S.membros[0].autorizados.push({ autorizadoId: 7001, nome: "Tia Zeza", parentesco: "TIO", validoAte: "2026-12-31", forma: "FICHA_FISICA", registradoEm: S.agoraMs });
    S.membros[0].autorizados.push({ autorizadoId: 7002, nome: "Vovó Lia", parentesco: "AVO", validoAte: null, forma: "RESPONSAVEL", registradoEm: S.agoraMs });
    await abrirMeuPainel(env);
    confereLimpo(env, "Responsável/abertura");
    marcas(env, "chkFilhosLista", ["t_nome", "t_rotuloVinculo"], "Responsável/lista de filhos");
    for (const [id, secao] of [[101, "hist"], [101, "aut"], [101, "sau"], [102, "hist"], [102, "aut"], [102, "sau"]]) await alternar(env, id, secao);
    confereLimpo(env, "Responsável/seções");
    marcas(env, "chkFhHist101", ["t_sala", "t_congregacao", "t_quemTrouxe", "t_quemRetirou", "t_rotuloSituacao"], "Responsável/histórico");
    marcas(env, "chkFhAut101", ["t_nome", "t_rotuloParentesco"], "Responsável/quem pode retirar");
    confere(env.e("chkFhSauTexto102").value.includes("[t_texto]"), "Responsável/saúde: o texto vem como valor do campo");
    confere(texto(env, "chkFhAut101").includes("Tia Zeza") && /ficha assinada, registrada pela Secretaria/.test(texto(env, "chkFhAut101")), "a forma da pessoa autorizada pelo rótulo nosso");
    // erro vindo do servidor com ataque na mensagem: aparece como texto
    env.api.rotas["GET checkin-infantil/historico"] = { status: 403, corpo: { sucesso: false, mensagem: `Sem acesso. ${ATAQUE("t_erro")}` } };
    await alternar(env, 101, "hist"); await alternar(env, 101, "hist");
    marcas(env, "chkFhHist101", ["t_erro"], "Responsável/erro do histórico");
    delete env.api.rotas["GET checkin-infantil/historico"];
    confereLimpo(env, "Responsável/fim");
    // listas que falham com texto de ataque na mensagem
    env.api.rotas["GET checkin-infantil/minhas-salas"] = { status: 500, corpo: { sucesso: false, mensagem: `Erro. ${ATAQUE("t_erroSalas")}` } };
    env.api.rotas["GET checkin-infantil/meus-filhos"] = { status: 500, corpo: { sucesso: false, mensagem: `Erro. ${ATAQUE("t_erroFilhos")}` } };
    await abrirMeuPainel(env);
    marcas(env, "chkMeuSalasLista", ["t_erroSalas"], "Responsável/erro das salas"); marcas(env, "chkFilhosLista", ["t_erroFilhos"], "Responsável/erro dos filhos");
    confereLimpo(env, "Responsável/erros");
  });

  cenario("Ataque total (equipe da sala): lista de salas, sala, lotação, voluntários, cartões, check-in, etiqueta, recibo, retirada e segunda via", async () => {
    const c = montar({ ataque: "total" }); const { S, env } = c;
    // a sala com um adulto só (o problema da lotação vem do servidor, com ataque) e crianças de todo tipo
    const pedro = S.semear({ menorId: 101, trouxeMembroId: 201, saude: null });
    const vis = S.semear({ visitante: { nome: "Visitante Cinco", nascimento: "2021-04-04" }, trouxeNome: "Tia Zeza", saude: "Alergia a amendoim", extras: [{ nome: "Vovó Lia", parentesco: "AVO" }] });
    const lia = S.semear({ menorId: 102, trouxeMembroId: 201, travado: true, tentativas: 5 });
    const davi = S.semear({ menorId: 104, trouxeMembroId: 203 }); S.pedirDivergencia(davi.registroId, { nome: "Vizinho Zé", parentesco: "AMIGO_FAMILIA", documento: "RG", operadorId: 42 });
    S.vias.push({ viaId: 99, registroId: pedro.registroId, pedidaPor: 42, pedidaEm: S.agoraMs - MIN, pessoaNome: "Maria Souza", documento: "RG" });
    await abrirMeuPainel(env);
    marcas(env, "chkMeuSalasLista", ["t_equipeNome", "t_congregacaoNome"], "Equipe/lista de salas");
    confereLimpo(env, "Equipe/lista de salas");
    env.doc.clicar(env.e("chkAbrirMeu501x31")); await env.ocioso();
    marcas(env, "chkSalaCabecalho", ["t_congregacaoNome", "t_descricao"], "Equipe/cabeçalho");
    marcas(env, "chkSalaLotacao", ["t_mensagem"], "Equipe/lotação (problema do servidor)");
    marcas(env, "chkSalaVoluntarios", ["t_nome"], "Equipe/voluntários");
    marcas(env, "chkNaSalaLista", ["t_nome", "t_rotulo"], "Equipe/cartões");
    confere(texto(env, "chkSalaTitulo").includes("[t_equipeNome]"), "Equipe/título da sala");
    confereLimpo(env, "Equipe/sala");
    // entrar na sala e abrir o formulário
    env.doc.clicar(env.e("chkEntrarBotao")); await env.ocioso();
    marcas(env, "chkSalaMsg", ["t_mensagem"], "Equipe/mensagem do servidor ao entrar");
    marcas(env, "chkNaSalaLista", ["t_nome", "t_rotulo", "t_pessoaNome"], "Equipe/cartões depois de entrar");
    confereLimpo(env, "Equipe/depois de entrar");
    // o formulário: catálogos com ataque nos rótulos, o texto da saúde, a busca e os responsáveis
    marcas(env, "chkCheckinCx", ["t_rotulo"], "Equipe/catálogos nos selects");
    env.doc.digitar(env.e("chkCiVisSaude"), "Asma");
    marcas(env, "chkCiVisTermoCx", ["t_titulo", "t_texto", "t_aceite"], "Equipe/texto da autorização de saúde");
    env.doc.digitar(env.e("chkCiVisSaude"), "");
    await buscar(env, "Souza");
    confere(!!env.e("chkRes101") || !!env.e("chkRes102"), "a busca achou");
    S.registros.forEach(r => { if (r.menorId === 101 || r.menorId === 102 || r.menorId === 104) r.situacao = "RETIRADA"; });
    await env.ev("chkLerSala(true)"); await env.ocioso();
    await buscar(env, "Pedro"); await adicionarMembro(env, 101);
    marcas(env, "chkCiTrouxe", ["t_nome"], "Equipe/quem trouxe (responsáveis do servidor)");
    marcas(env, "chkCiLista", ["t_nome"], "Equipe/lista da entrada");
    escolherQuemTrouxe(env, "201");
    env.limparRegistro(); await enviarCheckin(env);
    marcas(env, "chkImprimivel", ["t_sala", "t_congregacao", "t_orientacao", "t_trouxe"], "Equipe/etiqueta e recibo");
    marcas(env, "chkSalaMsg", ["t_mensagem"], "Equipe/mensagem do check-in");
    confereLimpo(env, "Equipe/check-in");
    // retirada e segunda via: as opções vêm do servidor
    const cart = achar(env, x => /^chkCrianca\d+$/.test(x.id) && x.textContent.includes("Visitante Cinco"));
    const idVis = Number(cart.id.replace("chkCrianca", ""));
    env.doc.clicar(env.e(`chkRetirar${idVis}`)); await env.ocioso();
    marcas(env, "chkRtQuem", ["t_rotulo", "t_nome"], "Equipe/opções de quem retira");
    confereLimpo(env, "Equipe/retirada");
    env.doc.clicar(env.e(`chkSegVia${idVis}`)); await env.ocioso();
    marcas(env, "chkSvQuem", ["t_rotulo", "t_nome"], "Equipe/opções da segunda via");
    // código errado com ataque na mensagem do servidor
    env.doc.clicar(env.e(`chkRetirar${idVis}`)); await env.ocioso();
    env.doc.escolher(env.e("chkRtQuem"), "TROUXE"); env.e("chkRtCodigo").value = "BBBBBB";
    env.doc.disparar(env.e("chkRtForm"), "submit"); await env.ocioso();
    marcas(env, "chkRtMsg", ["t_mensagem"], "Equipe/mensagem de código errado");
    confereLimpo(env, "Equipe/código errado");
    // segunda via confirmada pela outra pessoa (a Bia): a etiqueta nova também vem com ataque
    // a janela fechada: a mensagem do servidor (com ataque) na lista e no cabeçalho
    S.agoraMs = Date.parse("2026-10-15T09:30:00.000Z");
    await env.ev("chkLerSala(true)"); await env.ocioso();
    marcas(env, "chkSalaCabecalho", ["t_mensagem"], "Equipe/janela fechada no cabeçalho");
    S.agoraMs = Date.parse("2026-10-15T12:30:00.000Z");
    S.vias[0].pedidaPor = 41; S.vias[0].pedidaEm = S.agoraMs - MIN;
    S.definirSessao({ membroId: 42 }); env.sessao({ matricula: 42, pin: true });
    await abrirSalaMeu(env);
    const pedro2 = S.registros.find(r => r.registroId === pedro.registroId);
    pedro2.situacao = "NA_SALA";
    await env.ev("chkLerSala(true)"); await env.ocioso();
    await clicarEResponder(env, env.e(`chkConfSegVia${pedro.registroId}`), true);
    marcas(env, "chkImprimivel", ["t_sala", "t_orientacao"], "Equipe/etiqueta da segunda via");
    confereLimpo(env, "Equipe/segunda via");
  });

  cenario("Ataque total (liderança): pedido de retirada com contatos, travada, relatório, aprovações e fichas", async () => {
    const c = montar({ sessao: { membroId: 9, lideranca: true, gestao: true }, ataque: "total" }); const { S, env } = c;
    c.env.ctx.__fatorConfirmar = async () => { S.fatorFresco = true; return true; };
    S.entrar(S.salas[0], 43);
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 }); S.pedirDivergencia(a.registroId, { nome: "Tia Zeza", parentesco: "TIO", documento: "CNH", operadorId: 42 });
    const v = S.semear({ visitante: { nome: "Visitante Seis", nascimento: "2021-02-02" }, trouxeNome: "Tia Zeza", trouxeContato: "11999990000" }); S.pedirDivergencia(v.registroId, { nome: "Vizinha Dalva", parentesco: "AMIGO_FAMILIA", documento: "RG", operadorId: 42 });
    S.semear({ menorId: 102, trouxeMembroId: 201, travado: true, tentativas: 5 });
    S.membros[1].saude = { texto: "Alergia a amendoim", forma: "RESPONSAVEL", atualizadoEm: S.agoraMs };
    S.membros[0].autorizados.push({ autorizadoId: 7001, nome: "Tia Zeza", parentesco: "TIO", validoAte: "2026-12-31", forma: "FICHA_FISICA", registradoEm: S.agoraMs });
    await abrirAbaGestao(env);
    marcas(env, "chkGesSalasLista", ["t_equipeNome", "t_congregacaoNome"], "Liderança/lista de salas");
    confereLimpo(env, "Liderança/lista de salas");
    env.doc.clicar(env.e("chkAbrirGes501x31")); await env.ocioso();
    marcas(env, "chkNaSalaLista", ["t_nome", "t_telefone", "t_telefoneDeQuemTrouxe"], "Liderança/pedido de retirada, contatos e telefone de quem trouxe");
    marcas(env, "chkSalaVoluntarios", ["t_nome"], "Liderança/voluntários");
    const links = descendentes(env.e("chkNaSalaLista")).filter(x => x.localName === "a");
    confere(links.length >= 3 && links.every(x => /^tel:\d{8,13}$/.test(x.getAttribute("href"))), `os links de telefone levam só números: ${links.map(x => x.getAttribute("href")).join(",")}`);
    confereLimpo(env, "Liderança/sala");
    // decidir: a confirmação e o aviso mostram nomes do servidor
    env.limparRegistro();
    env.e(`chkAprovar${a.registroId}`).focus(); env.doc.clicar(env.e(`chkAprovar${a.registroId}`));
    const m = await env.responderModal(true); await env.ocioso();
    confere(m.texto.includes("[t_nome]"), "a confirmação mostra o nome vindo do servidor como texto");
    await env.responderTexto("Liguei para a mãe, que confirmou."); await env.ocioso();
    marcas(env, "chkSalaMsg", ["t_mensagem"], "Liderança/mensagem da decisão");
    confereLimpo(env, "Liderança/decisão");
    // relatório
    env.doc.clicar(env.e("chkRelatorioBotao")); await env.ocioso();
    marcas(env, "chkRelatorioCx", ["t_nome", "t_equipeNome", "t_congregacaoNome", "t_rotulo", "t_ator"], "Liderança/relatório");
    confereLimpo(env, "Liderança/relatório");
    // aprovações
    env.doc.clicar(env.e("btnChkSecaoAprovacoes")); await env.ocioso();
    marcas(env, "chkAprovacoesLista", ["t_equipeNome", "t_congregacaoNome", "t_nome"], "Liderança/aprovações");
    confereLimpo(env, "Liderança/aprovações");
    // fichas
    env.doc.clicar(env.e("btnChkSecaoFichas")); await env.ocioso();
    env.e("chkFiMatricula").value = "102"; env.doc.clicar(env.e("chkFiBuscar")); await env.ocioso();
    marcas(env, "chkFiAut102", ["t_nome"], "Liderança/ficha: responsáveis");
    confere(env.e("chkFiSauTexto102").value.includes("[t_texto]"), "Liderança/ficha: a saúde vem como valor do campo");
    env.e("chkFiMatricula").value = "101"; env.doc.clicar(env.e("chkFiBuscar")); await env.ocioso();
    marcas(env, "chkFiAut101", ["t_nome", "t_rotuloParentesco"], "Liderança/ficha: autorizados");
    marcas(env, "chkFichaCx", ["t_nome"], "Liderança/ficha: nome da criança");
    confereLimpo(env, "Liderança/fichas");
  });
};
