// cenarios-lideranca.js — a liderança (sessão de senha com a permissão habilitacao_voluntarios): a sala com a visão da gestão, aprovar e negar a retirada divergente (confirmação reforçada 428, motivo),
// destravar, tirar voluntário, relatório do dia, a fila de Aprovações e as Fichas assinadas. Servidor simulado com estado (fixtures.js) e texto de ataque em todo campo que vem dele.
"use strict";

module.exports = function registrar(H) {
  const { cenario, confere, montar, limpo, achar, descendentes, chamadas, texto, argsDe, visivel, confereAcessibilidade, idsRepetidos, clicarEResponder, esperar, abrirAbaGestao, abrirSalaGestao,
    cartao, seloDe, botoes, F, ATAQUE, ck, MIN } = H;

  const GESTOR = { membroId: 9, lideranca: true, gestao: true };
  // a confirmação reforçada (428): a tela confirma a identidade e o servidor passa a aceitar
  const fatorSim = (c) => { c.env.ctx.__fatorConfirmar = async () => { c.S.fatorFresco = true; return true; }; };
  const fatorNao = (c) => { c.env.ctx.__fatorConfirmar = async () => false; };
  const pendente = (S, id, quem = {}) => S.pedirDivergencia(id, Object.assign({ nome: "Tia Zeza", parentesco: "TIO", documento: "CNH", operadorId: 42 }, quem));
  const idsDosCartoes = (env, raiz) => descendentes(env.e(raiz)).filter(x => /^chkCrianca\d+$/.test(x.id)).map(x => Number(x.id.slice("chkCrianca".length)));
  // Decide pela tela: botão -> confirmação -> motivo (os motivos da lista, um por vez, até o último). Devolve o que a tela perguntou.
  const decidir = async (env, botaoId, { confirmar = true, motivos = ["Liguei para a mãe e ela confirmou."] } = {}) => {
    env.e(botaoId).focus();   // o navegador dá o foco ao botão que a pessoa toca
    env.doc.clicar(env.e(botaoId));
    const conf = await env.responderModal(confirmar); await env.ocioso();
    const pedidos = [];
    if (confirmar) {
      for (const m of motivos) {
        const t = await env.responderTexto(m); pedidos.push(Object.assign({ valorInicial: undefined }, t)); await env.ocioso();
        if (m == null) break;
      }
    }
    await env.ocioso();
    return { conf, pedidos };
  };

  cenario("Liderança: a sala com a visão da gestão — pedido de retirada com dados para ligar, criança travada, ordem dos cartões, voluntários", async () => {
    const c = montar({ sessao: GESTOR, ataque: true }); const { S, env } = c;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 });
    pendente(S, a.registroId, { nome: `Tia Zeza ${ATAQUE("quem")}` });
    const t = S.semear({ menorId: 102, trouxeMembroId: 201, travado: true, tentativas: 5 });
    const v = S.semear({ visitante: { nome: "Visitante Treze", nascimento: "2021-01-01" }, trouxeNome: "Tia Zeza", trouxeContato: "11999990001" });
    const w = S.semear({ visitante: { nome: "Visitante Quinze", nascimento: "2021-02-02" }, trouxeNome: "Tia Zeza", trouxeContato: "11999990000" });
    pendente(S, w.registroId, { nome: "Vizinha Dalva", parentesco: "AMIGO_FAMILIA", documento: "RG", operadorId: 42 });
    S.entrar(S.salas[0], 43);
    await abrirSalaGestao(env);
    confere(!!env.e("chkSalaRaiz") && visivel(env, "chkSalaGes") && !visivel(env, "chkGesListas"), "a sala toma o lugar da lista, na aba da liderança");
    const g = chamadas(env, "GET checkin-infantil/sala");
    confere(g.length === 1 && g[0].consulta.servicoId === "501" && g[0].consulta.equipeId === "31", "GET sala pelos dois ids");
    confere(env.foco() === env.e("chkSalaTitulo"), "o foco vai ao título da sala");
    confere(JSON.stringify(idsDosCartoes(env, "chkNaSalaLista")) === JSON.stringify([a.registroId, w.registroId, t.registroId, v.registroId]), `a ordem: primeiro os pedidos de retirada, depois a travada, depois as demais: ${idsDosCartoes(env, "chkNaSalaLista")}`);
    // o pedido de retirada
    const card = cartao(env, a.registroId), tx = card.textContent;
    confere(/Quem pediu para retirar não está na lista/.test(tx) && tx.includes("Tia Zeza") && tx.includes("[quem]"), "o cartão diz quem pediu (nome do servidor como texto)");
    confere(/Tio ou tia/.test(tx) && /Documento conferido[\s\S]*CNH/.test(tx) && /Pedido às[\s\S]*09:30/.test(tx), "parentesco e documento pelo rótulo do catálogo, e a hora do pedido em Brasília");
    confere(/Ligue para o responsável para confirmar antes de decidir/.test(tx), "orienta ligar antes de decidir");
    const links = descendentes(card).filter(x => x.localName === "a" && /chk-tel/.test(x.className));
    confere(links.length >= 2 && links.map(x => x.getAttribute("href")).includes("tel:11988880001") && links.map(x => x.getAttribute("href")).includes("tel:11988880002"), `os telefones dos responsáveis cadastrados viram links tel: só com números: ${links.map(x => x.getAttribute("href")).join(",")}`);
    confere(tx.includes("Maria Souza") && tx.includes("José Souza") && /Responsáveis cadastrados \(ligue para confirmar\)/.test(tx), "os responsáveis aparecem pelo nome");
    const bts = botoes(card);
    confere(bts.some(x => /Aprovar a retirada/.test(x)) && bts.some(x => /Negar a retirada/.test(x)) && !bts.some(x => /Retirar$|Segunda via|Destravar/.test(x.replace(/^[^\wÀ-ú]+/, ""))), `a liderança vê Aprovar e Negar: ${bts.join(" | ")}`);
    confere(JSON.stringify(argsDe(env.e(`chkAprovar${a.registroId}`))) === JSON.stringify([a.registroId, true, { $: "this" }]) && JSON.stringify(argsDe(env.e(`chkNegar${a.registroId}`))) === JSON.stringify([a.registroId, false, { $: "this" }]), "Aprovar leva true e Negar leva false, com o id numérico");
    // a criança travada
    const tc = cartao(env, t.registroId), tb = botoes(tc);
    confere(tb.some(x => /Destravar a criança/.test(x)) && /Confirme quem está retirando e destrave, ou emita a segunda via/.test(tc.textContent) && seloDe(tc, "Travada"), `a travada tem o botão Destravar (da liderança) e o texto da liderança: ${tb.join(" | ")}`);
    // o visitante: telefone de quem trouxe
    const vl = descendentes(cartao(env, w.registroId)).filter(x => x.localName === "a" && /chk-tel/.test(x.className));
    confere(/Telefone de quem trouxe/.test(cartao(env, w.registroId).textContent) && vl.length === 1 && vl[0].getAttribute("href") === "tel:11999990000", "no pedido de retirada de um visitante, o telefone de quem trouxe vira link para ligar");
    confere(!/Telefone de quem trouxe/.test(cartao(env, v.registroId).textContent) && descendentes(cartao(env, v.registroId)).every(x => x.localName !== "a"), "sem pedido de retirada pendente, o telefone de quem trouxe não fica à mostra no cartão");
    confere(botoes(cartao(env, w.registroId)).some(x => /Aprovar/.test(x)), "o pedido do visitante também tem Aprovar e Negar");
    // pendências e voluntários
    const pend = texto(env, "chkSalaPendencias");
    confere(/2 retirada\(s\) por quem não está na lista, aguardando a liderança/.test(pend) && /1 criança\(s\) travada\(s\)/.test(pend), "as pendências somam os pedidos e a travada");
    const vol = texto(env, "chkSalaVoluntarios");
    confere(vol.includes("Bia Voluntária") && vol.includes("Caio Voluntário") && !!env.e("chkTirar42") && !!env.e("chkTirar43"), "cada voluntário presente tem 'Tirar da sala' para a liderança");
    confere(JSON.stringify(argsDe(env.e("chkTirar42"))) === JSON.stringify([42, { $: "this" }]), "o botão leva a matrícula numérica");
    confere(!env.e("chkEntrarBotao") && !env.e("chkSairBotao") && /Você acompanha esta sala como liderança/.test(texto(env, "chkCiAviso")), "a liderança que não é da equipe não entra nem sai da sala");
    confere(!!env.e("chkRelatorioBotao") && /Relatório do dia/.test(texto(env, "chkSalaGestaoCx")), "o relatório do dia está disponível");
    limpo(env, "Liderança/sala", [ATAQUE("equipe31"), ATAQUE("menor101"), ATAQUE("quem")]);
    confereAcessibilidade(env, ["abaCheckininfantil"], "Liderança/sala");
    confere(idsRepetidos(env, "chkSalaGes").length === 0, "ids únicos na sala da liderança");
    // quem opera pelo PIN (a Bia) vê o pedido e a travada, mas nunca os botões nem os telefones da liderança
    const p = montar({ sessao: { membroId: 42 }, ataque: true });
    const a2 = p.S.semear({ menorId: 101, trouxeMembroId: 201 }); pendente(p.S, a2.registroId);
    const t2 = p.S.semear({ menorId: 102, trouxeMembroId: 201, travado: true, tentativas: 5 });
    await p.env.ev("mostrarSubAbaMeupainel('checkininfantil')"); await p.env.ocioso();
    p.env.doc.clicar(p.env.e("chkAbrirMeu501x31")); await p.env.ocioso();
    const ob = [...botoes(cartao(p.env, a2.registroId)), ...botoes(cartao(p.env, t2.registroId))].join(" | ");
    confere(!/Aprovar|Negar|Destravar/.test(ob), `PIN: nenhum botão de decisão da liderança: ${ob}`);
    confere(/Aguardando a liderança/.test(cartao(p.env, a2.registroId).textContent) && !/Telefone|tel:/.test(cartao(p.env, a2.registroId).textContent) && /Peça à liderança para destravar/.test(cartao(p.env, t2.registroId).textContent), "PIN: vê 'aguardando a liderança' e 'peça à liderança', sem telefones");
    confere(!p.env.e("chkSalaGestaoCx") || p.env.e("chkSalaGestaoCx").innerHTML === "", "PIN: sem o relatório do dia");
  });

  cenario("Liderança: aprovar a retirada — confirmação, motivo (curto volta a ser pedido), confirmação reforçada 428 repetida uma vez, cancelar em cada passo", async () => {
    const c = montar({ sessao: GESTOR, ataque: true }); const { S, env } = c; fatorSim(c);
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 }); pendente(S, a.registroId, { nome: "Tia Zeza", operadorId: 42 });
    await abrirSalaGestao(env);
    env.limparRegistro();
    // 1) cancelar na confirmação
    const r1 = await decidir(env, `chkAprovar${a.registroId}`, { confirmar: false });
    confere(r1.conf.aberto && /Aprovar a retirada de Pedro Souza/.test(r1.conf.texto) && /Tia Zeza/.test(r1.conf.texto) && /confirme com o responsável pelo telefone/.test(r1.conf.texto), "a confirmação diz quem, qual criança e manda confirmar com o responsável pelo telefone");
    confere(/ato fica registrado com o seu nome/.test(r1.conf.texto), "e que o ato fica registrado com o nome de quem aprova");
    confere(chamadas(env, "POST checkin-infantil/decidir-divergencia").length === 0 && !env.modal().aberto, "cancelar na confirmação não envia nada");
    // 2) cancelar no motivo
    const r2 = await decidir(env, `chkAprovar${a.registroId}`, { motivos: [null] });
    confere(r2.pedidos[0].aberto && /Motivo da decisão \(de 8 a 300 caracteres\)/.test(r2.pedidos[0].titulo), "pede o motivo, com o intervalo de tamanho");
    confere(chamadas(env, "POST checkin-infantil/decidir-divergencia").length === 0, "cancelar no motivo não envia nada");
    // 3) motivo curto: volta a pedir, com o que já foi escrito; depois com marca < >; depois certo
    env.limparRegistro();
    env.doc.clicar(env.e(`chkAprovar${a.registroId}`)); await env.responderModal(true); await env.ocioso();
    let t = await env.responderTexto("curto"); await env.ocioso();
    confere(t.aberto && /Escreva o motivo com 8 a 300 caracteres/.test(env.toasts().join("|")), "motivo curto: aviso de erro");
    confere(env.e("modalTexto") && env.e("modalTexto").value === "curto" && !env.modal().aberto === false, "e o motivo volta a ser pedido, com o texto já escrito");
    t = await env.responderTexto("Liguei <b>para a mãe"); await env.ocioso();
    confere(env.modal().aberto && env.e("modalTexto").value === "Liguei <b>para a mãe", "motivo com < ou >: volta a pedir (o texto continua no campo)");
    confere(chamadas(env, "POST checkin-infantil/decidir-divergencia").length === 0, "nada foi enviado com motivo inválido");
    await env.responderTexto("x".repeat(301)); await env.ocioso();
    confere(env.modal().aberto && chamadas(env, "POST checkin-infantil/decidir-divergencia").length === 0, "motivo de mais de 300 caracteres: volta a pedir");
    await env.responderTexto("Liguei para a mãe, que confirmou que a tia busca."); await env.ocioso();
    const p = chamadas(env, "POST checkin-infantil/decidir-divergencia");
    confere(p.length === 2, `o 428 repete o pedido UMA vez depois da confirmação de identidade (${p.length} pedidos)`);
    confere(p.every(x => JSON.stringify(x.corpo) === JSON.stringify({ registroId: a.registroId, aprovar: true, motivo: "Liguei para a mãe, que confirmou que a tia busca." })), "os dois pedidos levam o mesmo corpo, com booleano e motivo sem espaços sobrando");
    confere(env.g("window.__fatorPedidos") === 1, "a confirmação reforçada foi pedida uma vez");
    confere(/Retirada aprovada: a criança pode ser entregue a quem pediu/.test(texto(env, "chkSalaMsg")) && env.toasts().some(x => /Retirada aprovada/.test(x)), "a mensagem do servidor aparece");
    confere(S.registro(a.registroId).situacao === "RETIRADA" && S.eventos.some(e => e.tipo === "RETIRADA_DIVERGENTE_APROVADA"), "o servidor registrou a aprovação");
    confere(!cartao(env, a.registroId), "a criança sai da lista 'Na sala'");
    confere(env.foco() !== env.doc.body, "o foco não se perde no corpo da página");
    limpo(env, "Aprovar", []);
  });

  cenario("Liderança: negar a retirada; confirmação reforçada recusada; quem pediu não decide; o pedido já decidido (409)", async () => {
    const c = montar({ sessao: GESTOR, ataque: true }); const { S, env } = c; fatorSim(c);
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 }); pendente(S, a.registroId);
    await abrirSalaGestao(env);
    env.limparRegistro();
    const r = await decidir(env, `chkNegar${a.registroId}`, { motivos: ["A mãe disse que não mandou ninguém."] });
    confere(/Negar a retirada de Pedro Souza/.test(r.conf.texto) && /continua na sala/.test(r.conf.texto), "a confirmação diz que a criança continua na sala");
    const p = chamadas(env, "POST checkin-infantil/decidir-divergencia");
    confere(p.length === 2 && p[0].corpo.aprovar === false && typeof p[0].corpo.aprovar === "boolean", "o envio de negar leva aprovar:false");
    confere(/Retirada negada: a criança continua na sala/.test(texto(env, "chkSalaMsg")) && S.registro(a.registroId).situacao === "NA_SALA", "a criança continua na sala");
    const bts = botoes(cartao(env, a.registroId));
    confere(!seloDe(cartao(env, a.registroId), "aguardando a liderança") && !bts.some(x => /Aprovar|Negar/.test(x)), "o cartão deixa de pedir decisão");
    // a confirmação reforçada não foi feita: 428 volta, a tela explica e nada muda
    const d = montar({ sessao: GESTOR, ataque: true }); fatorNao(d);
    const b = d.S.semear({ menorId: 101, trouxeMembroId: 201 }); pendente(d.S, b.registroId);
    await abrirSalaGestao(d.env); d.env.limparRegistro();
    await decidir(d.env, `chkAprovar${b.registroId}`, { motivos: ["Liguei para a mãe, que confirmou."] });
    confere(chamadas(d.env, "POST checkin-infantil/decidir-divergencia").length === 1, "sem a confirmação da identidade o pedido não é repetido");
    confere(/confirmação recente de quem você é/.test(texto(d.env, "chkSalaMsg")) && /psc-aviso/.test(d.env.e("chkSalaMsg").className), "a tela explica (em destaque) que falta a confirmação de identidade");
    confere(d.S.registro(b.registroId).situacao === "RETIRADA_PENDENTE", "a criança segue aguardando");
    confere(d.env.g("window.__fatorPedidos") === 1, "a confirmação foi pedida e recusada");
    // quem registrou o pedido não decide
    const e2 = montar({ sessao: GESTOR, ataque: true }); fatorSim(e2);
    const f = e2.S.semear({ menorId: 101, trouxeMembroId: 201 }); pendente(e2.S, f.registroId, { operadorId: 9 });
    await abrirSalaGestao(e2.env);
    const cf = cartao(e2.env, f.registroId);
    confere(!botoes(cf).some(x => /Aprovar|Negar/.test(x)) && /Foi você quem registrou o pedido: outra pessoa da liderança precisa aprovar ou negar/.test(cf.textContent), "quem registrou o pedido não vê Aprovar nem Negar e a tela diz por quê");
    e2.env.limparRegistro();
    const rr = e2.env.ev(`chkDecidirAcao(${f.registroId}, true, null)`); await e2.env.responderModal(true); await e2.env.ocioso();
    await e2.env.responderTexto("Tentando mesmo assim, para ver."); await esperar(rr); await e2.env.ocioso();
    confere(/Quem registrou o pedido não decide sobre ele/.test(texto(e2.env, "chkSalaMsg")) && e2.S.registro(f.registroId).situacao === "RETIRADA_PENDENTE", "chamando a ação direto, o servidor recusa e a tela mostra o motivo");
    // 409: já decidido por outro enquanto o cartão estava na tela
    const g2 = montar({ sessao: GESTOR }); fatorSim(g2);
    const h = g2.S.semear({ menorId: 101, trouxeMembroId: 201 }); pendente(g2.S, h.registroId);
    await abrirSalaGestao(g2.env);
    g2.S.registro(h.registroId).situacao = "NA_SALA"; g2.S.registro(h.registroId).divergente = false;
    g2.env.limparRegistro();
    await decidir(g2.env, `chkAprovar${h.registroId}`, { motivos: ["Liguei para a mãe, que confirmou."] });
    confere(/Não há retirada divergente aguardando decisão/.test(texto(g2.env, "chkSalaMsg")) && chamadas(g2.env, "GET checkin-infantil/sala").length >= 1, "já decidida por outro: a mensagem do servidor aparece e a sala é lida de novo");
    confere(!botoes(cartao(g2.env, h.registroId)).some(x => /Aprovar|Negar/.test(x)), "o cartão deixa de mostrar os botões");
  });

  cenario("Liderança: destravar (confirmação, 'já não estava travada'), e a ação chamada por quem não é da liderança é recusada pelo servidor", async () => {
    const c = montar({ sessao: GESTOR, ataque: true }); const { S, env } = c;
    const t = S.semear({ menorId: 102, trouxeMembroId: 201, travado: true, tentativas: 5 });
    await abrirSalaGestao(env);
    env.limparRegistro();
    const m1 = await clicarEResponder(env, env.e(`chkDestravar${t.registroId}`), false);
    confere(m1.aberto && /Destravar Lia Souza/.test(m1.texto) && /só depois de confirmar quem está retirando a criança/.test(m1.texto) && /quem o perdeu pede a segunda via/.test(m1.texto), "a confirmação diz para conferir quem retira e que o código continua o mesmo");
    confere(chamadas(env, "POST checkin-infantil/destravar").length === 0, "cancelar não envia nada");
    await clicarEResponder(env, env.e(`chkDestravar${t.registroId}`), true);
    const p = chamadas(env, "POST checkin-infantil/destravar");
    confere(p.length === 1 && JSON.stringify(p[0].corpo) === JSON.stringify({ registroId: t.registroId }), "POST destravar leva só o id");
    confere(/Criança destravada/.test(texto(env, "chkSalaMsg")) && S.registro(t.registroId).travado === false && S.registro(t.registroId).tentativas === 0, "a criança destrava e as tentativas voltam");
    confere(!seloDe(cartao(env, t.registroId), "Travada") && !env.e(`chkDestravar${t.registroId}`), "o cartão deixa de mostrar 'travada' e o botão some");
    confere(!/travada\(s\)/.test(texto(env, "chkSalaPendencias")), "a pendência some");
    // outra pessoa destravou antes: a tela ainda mostra o botão (leitura velha)
    const t2 = S.semear({ menorId: 101, trouxeMembroId: 201, travado: true, tentativas: 5 });
    await env.ev("chkLerSala(true)"); await env.ocioso();
    S.registro(t2.registroId).travado = false;
    env.limparRegistro();
    await clicarEResponder(env, env.e(`chkDestravar${t2.registroId}`), true);
    confere(/Esta criança não está travada/.test(texto(env, "chkSalaMsg")) && !seloDe(cartao(env, t2.registroId), "Travada"), "já destravada por outro: a mensagem do servidor aparece e a sala é atualizada");
    // quem é do PIN chama a ação direto: o servidor recusa (403) e a tela mostra o motivo
    const p2 = montar({ sessao: { membroId: 42 } });
    const t3 = p2.S.semear({ menorId: 102, trouxeMembroId: 201, travado: true, tentativas: 5 });
    await p2.env.ev("mostrarSubAbaMeupainel('checkininfantil')"); await p2.env.ocioso();
    p2.env.doc.clicar(p2.env.e("chkAbrirMeu501x31")); await p2.env.ocioso();
    p2.env.limparRegistro();
    const rr = p2.env.ev(`chkDestravarAcao(${t3.registroId}, null)`); await p2.env.responderModal(true); await esperar(rr); await p2.env.ocioso();
    confere(/Você não tem permissão/.test(texto(p2.env, "chkSalaMsg")) && p2.S.registro(t3.registroId).travado === true, "o servidor recusa a liderança de quem não é da liderança (403)");
  });

  cenario("Liderança: tirar voluntário da sala (confirmação, a recusa quando a sala ficaria sem adultos) e o relatório do dia (tabelas, impressão, fechar)", async () => {
    const c = montar({ sessao: GESTOR, ataque: true }); const { S, env } = c;
    S.entrar(S.salas[0], 43); S.entrar(S.salas[0], 41);   // três adultos (a Bia já estava): tirar um deixa dois
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 });
    await abrirSalaGestao(env);
    env.limparRegistro();
    const m1 = await clicarEResponder(env, env.e("chkTirar43"), false);
    confere(m1.aberto && /Tirar Caio Voluntário/.test(m1.texto) && /esqueceu de sair/.test(m1.texto) && /pelo menos 2 adultos/.test(m1.texto), "a confirmação diz o nome e a regra dos 2 adultos");
    confere(chamadas(env, "POST checkin-infantil/sair-da-sala").length === 0, "cancelar não envia nada");
    await clicarEResponder(env, env.e("chkTirar43"), true);
    const p = chamadas(env, "POST checkin-infantil/sair-da-sala");
    confere(p.length === 1 && JSON.stringify(p[0].corpo) === JSON.stringify({ servicoId: 501, equipeId: 31, membroId: 43 }), `POST sair-da-sala com a matrícula de quem sai, em número: ${JSON.stringify(p[0] && p[0].corpo)}`);
    confere(!env.e("chkTirar43") && !!env.e("chkTirar42") && S.eventos.some(e => e.tipo === "VOLUNTARIO_SAIU" && e.detalhe === "retirado pela liderança"), "o voluntário sai da lista e o servidor registra que foi a liderança");
    // sobraria um adulto só com a criança na sala: o servidor recusa
    env.limparRegistro();
    await clicarEResponder(env, env.e("chkTirar42"), true);
    confere(/não pode sair agora/.test(texto(env, "chkSalaMsg")) && !!env.e("chkTirar42"), "a recusa do servidor aparece tal qual e o voluntário continua na lista");
    // o relatório
    S.registro(a.registroId).situacao = "RETIRADA"; S.registro(a.registroId).retiradoNome = "Maria Souza"; S.registro(a.registroId).retiradoTipo = "RESPONSAVEL"; S.registro(a.registroId).retiradoEm = S.agoraMs;
    S.semear({ visitante: { nome: "Visitante Quatorze", nascimento: "2021-01-01" }, trouxeNome: "Tia Zeza" });
    S.salas[0].voluntarios.find(v => v.membroId === 43).saiuEm = S.agoraMs;
    env.limparRegistro();
    env.doc.clicar(env.e("chkRelatorioBotao")); await env.ocioso();
    const r = chamadas(env, "GET checkin-infantil/relatorio");
    confere(r.length === 1 && r[0].consulta.servicoId === "501" && r[0].consulta.equipeId === "31", "GET relatório pelos dois ids");
    const rel = env.e("chkRelatorioCx");
    const tabelas = descendentes(rel).filter(x => x.localName === "table");
    confere(tabelas.length === 3, `três tabelas: voluntários, crianças e tudo o que foi registrado (${tabelas.length})`);
    const ths = descendentes(rel).filter(x => x.localName === "th");
    confere(ths.length >= 15 && ths.every(x => x.getAttribute("scope") === "col"), "os cabeçalhos das tabelas têm scope=col");
    const tx = rel.textContent;
    confere(/Relatório do dia: Maternal/.test(tx) && tx.includes("[equipe31]") && /Horário de Brasília/.test(tx) && /15\/10\/2026 às 09:00/.test(tx), "título com a sala (texto de ataque como texto), a data do serviço e o fuso");
    confere(tx.includes("Pedro Souza") && /Maria Souza \(responsável cadastrado\)/.test(tx) && /Retirada/.test(tx) && tx.includes("Visitante") && tx.includes("ainda na sala"), "as crianças, quem retirou com o tipo e quem ainda está na sala");
    confere(/Entrega da criança na sala/.test(tx) && /Voluntário saiu da sala/.test(tx) && /retirado pela liderança/.test(tx), "os atos aparecem com o rótulo do servidor e o detalhe");
    confere(!!env.e("chkRelImprimirBotao") && !!env.e("chkRelFecharBotao"), "botões Imprimir e Fechar");
    limpo(env, "Relatório", [ATAQUE("equipe31"), ATAQUE("menor101")]);
    // imprimir
    env.doc.clicar(env.e("chkRelImprimirBotao")); await env.ocioso();
    confere(env.impressoes.length === 1 && /chk-imprimindo/.test(env.impressoes[0].classes) && /chk-imp-relatorio/.test(env.impressoes[0].classes) && !/chk-imp-etiquetas/.test(env.impressoes[0].classes), "imprime com as classes do relatório (e não as das etiquetas)");
    confere(!/chk-imprimindo|chk-imp-/.test(env.doc.body.className), "as classes saem do <body> depois da impressão");
    // fechar
    env.doc.clicar(env.e("chkRelFecharBotao")); await env.ocioso();
    confere(env.e("chkRelatorioCx").innerHTML === "" && env.foco() === env.e("chkRelatorioBotao"), "fechar apaga o relatório e o foco volta ao botão de abrir");
    // o relatório que falha (500): a mensagem do servidor na região certa, nada de tabela
    env.api.rotas["GET checkin-infantil/relatorio"] = { status: 500, corpo: { sucesso: false, mensagem: "Erro interno ao processar o check-in infantil." } };
    env.doc.clicar(env.e("chkRelatorioBotao")); await env.ocioso();
    confere(/Erro interno/.test(texto(env, "chkRelMsg")) && env.e("chkRelatorioCx").innerHTML === "", "relatório que falha: mensagem e nenhuma tabela");
    // relatório pedido e a pessoa sai da sala antes de a resposta chegar: nada entra na tela
    delete env.api.rotas["GET checkin-infantil/relatorio"];
    const presa = env.retem(x => x.chave === "GET checkin-infantil/relatorio");
    env.doc.clicar(env.e("chkRelatorioBotao")); await H.esperaChegar(presa);
    await env.ev("chkFecharSalaInterno()"); presa.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    confere(!env.e("chkRelatorioCx") && !env.doc.body.textContent.includes("Relatório do dia: Maternal"), "relatório atrasado depois de sair da sala não entra na tela");
  });

  // ============================================================================================================================================
  // APROVAÇÕES (todas as salas de hoje do escopo)
  // ============================================================================================================================================
  cenario("Aprovações: o que espera a liderança em todas as salas do escopo (a de outra congregação não), decidir pela lista, atualização sozinha e parada ao sair", async () => {
    const c = montar({ sessao: GESTOR, ataque: true }); const { S, env } = c; fatorSim(c);
    S.salas[1].escalados = [43]; S.entrar(S.salas[1], 43);
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 }); pendente(S, a.registroId);
    const t = S.semear({ menorId: 102, trouxeMembroId: 201, travado: true, tentativas: 5 });
    const b = S.semear({ sala: 502, menorId: 104, trouxeMembroId: 203 }); pendente(S, b.registroId, { nome: "Vizinho Zé", parentesco: "AMIGO_FAMILIA", documento: "RG", operadorId: 43 });
    const fora = S.semear({ sala: 503, menorId: 106, trouxeMembroId: 205 }); pendente(S, fora.registroId);
    S.registros.find(r => r.registroId === fora.registroId).servicoId = 503;
    S.salas[2].escalados = [9];
    await abrirAbaGestao(env);
    env.limparRegistro();
    env.doc.clicar(env.e("btnChkSecaoAprovacoes")); await env.ocioso();
    confere(visivel(env, "chkSecaoAprovacoes") && !visivel(env, "chkSecaoSalas") && env.e("btnChkSecaoAprovacoes").getAttribute("aria-pressed") === "true" && env.e("btnChkSecaoSalas").getAttribute("aria-pressed") === "false", "a seção abre e a pílula fica marcada (aria-pressed)");
    const ms = chamadas(env, "GET checkin-infantil/minhas-salas"), ss = chamadas(env, "GET checkin-infantil/sala");
    confere(ms.length === 1 && ss.length === 2 && ss.map(x => x.consulta.servicoId).sort().join() === "501,502", `uma lista de salas e uma leitura de cada sala do escopo com crianças (501 e 502, não a 503): ${ss.map(x => x.consulta.servicoId)}`);
    confere(idsDosCartoes(env, "chkAprovacoesLista").length === 3 && !cartao(env, fora.registroId), "três itens (o pedido, a travada e o pedido da outra sala); nada da outra congregação");
    confere(/3 item\(ns\) esperando a liderança/.test(texto(env, "chkAprMsg")), "a mensagem conta os itens");
    const tx = texto(env, "chkAprovacoesLista");
    confere(tx.includes("Maternal") && tx.includes("Juniores") && tx.includes("[equipe31]") && tx.includes("[equipe32]") && tx.includes("Sede"), "cada item diz a sala e a congregação");
    confere(botoes(cartao(env, a.registroId)).some(x => /Aprovar/.test(x)) && botoes(cartao(env, t.registroId)).some(x => /Destravar/.test(x)) && !botoes(cartao(env, a.registroId)).some(x => /Retirar$/.test(x.replace(/^[^\wÀ-ú]+/, ""))), "os itens têm Aprovar/Negar e Destravar, e nunca Retirar");
    confere(env.intervalos.size === 1 && [...env.intervalos.values()][0].ms === 8000, "um relógio de 8 s enquanto a fila está à vista");
    // a atualização sozinha refaz a fila
    env.limparRegistro(); env.tique(); await env.ocioso();
    confere(chamadas(env, "GET checkin-infantil/minhas-salas").length === 1 && chamadas(env, "GET checkin-infantil/sala").length === 2, "o tique refaz a fila (uma lista de salas, uma leitura por sala)");
    // decidir pela lista: aprovar o pedido da outra sala
    env.limparRegistro();
    await decidir(env, `chkAprovar${b.registroId}`, { motivos: ["Liguei para a avó, que mandou o vizinho."] });
    confere(S.registro(b.registroId).situacao === "RETIRADA" && /Retirada aprovada/.test(texto(env, "chkAprMsg") + env.toasts().join("|")), "aprovado pela fila: o servidor registra e a mensagem aparece");
    confere(!cartao(env, b.registroId) && idsDosCartoes(env, "chkAprovacoesLista").length === 2, "e o item sai da fila");
    confere(env.foco() !== env.doc.body, "o foco não se perde no corpo da página");
    // destravar pela lista
    env.limparRegistro();
    await clicarEResponder(env, env.e(`chkDestravar${t.registroId}`), true);
    confere(S.registro(t.registroId).travado === false && idsDosCartoes(env, "chkAprovacoesLista").length === 1, "destravar pela fila: a criança destrava e o item sai");
    // a sala aberta a partir de Salas de hoje é outra tela: abrir a seção de salas apaga a fila
    env.doc.clicar(env.e("btnChkSecaoSalas")); await env.ocioso();
    confere(env.e("chkAprovacoesLista").innerHTML === "" && env.intervalos.size === 0, "sair da seção apaga a fila e para o relógio");
    // fila vazia
    S.registro(a.registroId).situacao = "RETIRADA";
    env.doc.clicar(env.e("btnChkSecaoAprovacoes")); await env.ocioso();
    confere(/Nada espera a liderança agora/.test(texto(env, "chkAprovacoesLista")) && texto(env, "chkAprMsg") === "", "fila vazia explicada, sem mensagem de erro");
    limpo(env, "Aprovações", []);
    confereAcessibilidade(env, ["abaCheckininfantil"], "Aprovações");
  });

  cenario("Aprovações: falhas (rede, 500, 403), três falhas seguidas param o relógio, e sair da aba o desliga", async () => {
    const c = montar({ sessao: GESTOR }); const { S, env } = c;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 }); pendente(S, a.registroId);
    await abrirAbaGestao(env);
    env.doc.clicar(env.e("btnChkSecaoAprovacoes")); await env.ocioso();
    confere(env.intervalos.size === 1, "o relógio roda");
    env.api.rotas["GET checkin-infantil/minhas-salas"] = { status: 500, corpo: { sucesso: false, mensagem: "Erro interno ao processar o check-in infantil." } };
    for (let i = 0; i < 3; i++) { env.tique(); await env.ocioso(); }
    confere(/A atualização automática parou: toque em “Atualizar”/.test(texto(env, "chkAprMsg")) && env.intervalos.size === 0, "depois de três falhas seguidas o relógio para e a tela manda tocar em Atualizar");
    confere(idsDosCartoes(env, "chkAprovacoesLista").length === 1, "a lista antiga continua à vista (não some por causa da falha)");
    delete env.api.rotas["GET checkin-infantil/minhas-salas"];
    env.doc.clicar(achar(env, x => x.localName === "button" && x.getAttribute("data-on-click") === "chkCarregarAprovacoesAcao" && x.textContent.includes("Atualizar") && x.parentNode.parentNode === env.e("chkSecaoAprovacoes")));
    await env.ocioso();
    confere(env.intervalos.size === 1 && /1 item/.test(texto(env, "chkAprMsg")), "tocar em Atualizar refaz a fila e liga o relógio de novo");
    // 403: a tela mostra a mensagem do servidor (sem toast repetido)
    env.api.rotas["GET checkin-infantil/minhas-salas"] = { status: 403, corpo: { sucesso: false, mensagem: "Você não tem permissão para isso. Fale com quem administra as Permissões." } };
    env.limparRegistro();
    env.doc.clicar(achar(env, x => x.localName === "button" && x.getAttribute("data-on-click") === "chkCarregarAprovacoesAcao" && x.parentNode.parentNode === env.e("chkSecaoAprovacoes"))); await env.ocioso();
    confere(/Você não tem permissão/.test(texto(env, "chkAprMsg")) && env.toasts().filter(x => /Você não tem permissão/.test(x)).length === 1, "403: a mensagem do servidor na tela, e um só aviso");
    delete env.api.rotas["GET checkin-infantil/minhas-salas"];
    // sair da aba: nada fica para trás
    env.doc.clicar(env.e("btnChkSecaoAprovacoes")); await env.ocioso();
    await env.ev("mostrarAbaSecretaria('protecao')"); await env.ocioso();
    confere(env.intervalos.size === 0 && env.e("chkAprovacoesLista").innerHTML === "", "sair da aba para o relógio e apaga a fila");
  });

  // ============================================================================================================================================
  // FICHAS ASSINADAS
  // ============================================================================================================================================
  cenario("Fichas assinadas: procurar a criança (inválida, fora do escopo, achada), registrar quem pode retirar com a referência da ficha, revogar, limite de 8", async () => {
    const c = montar({ sessao: GESTOR, ataque: true }); const { S, env } = c;
    await abrirAbaGestao(env);
    env.doc.clicar(env.e("btnChkSecaoFichas")); await env.ocioso();
    confere(visivel(env, "chkSecaoFichas") && env.foco() === env.e("chkFiMatricula"), "a seção abre com o foco no campo da matrícula");
    env.limparRegistro();
    const procurar = async (valor) => { env.e("chkFiMatricula").value = valor; env.limparRegistro(); env.doc.clicar(env.e("chkFiBuscar")); await env.ocioso(); return texto(env, "chkFichaMsg"); };
    let m = await procurar(""); confere(/Informe a matrícula da criança/.test(m) && env.foco() === env.e("chkFiMatricula") && chamadas(env, "GET checkin-infantil/autorizados").length === 0, "sem matrícula: mensagem, foco, nada pedido");
    m = await procurar("0"); confere(/Informe a matrícula/.test(m) && chamadas(env, "GET checkin-infantil/autorizados").length === 0, "matrícula zero não vale");
    m = await procurar("12abc"); confere(/Informe a matrícula/.test(m) && chamadas(env, "GET checkin-infantil/autorizados").length === 0, "matrícula com letras não vale");
    m = await procurar("999"); confere(/responsável cadastrado|Secretaria/i.test(m) && env.e("chkFichaCx").innerHTML === "", `criança que não existe: a mensagem neutra do servidor e nada na tela (${m})`);
    m = await procurar("106"); confere(env.e("chkFichaCx").innerHTML === "", "criança de outra congregação (fora do escopo): a mesma resposta neutra");
    m = await procurar("101");
    const g = chamadas(env, "GET checkin-infantil/autorizados");
    confere(g.length === 1 && g[0].consulta.menorId === "101", "GET autorizados pela matrícula");
    confere(env.foco() === env.e("chkFiTitulo") && texto(env, "chkFiNome").startsWith("Pedro Souza") && /matrícula 101/.test(texto(env, "chkFiTitulo")) && /4 anos/.test(texto(env, "chkFiTitulo")), "a ficha abre com o nome da criança e o foco no título");
    confere(texto(env, "chkFiAut101").includes("Maria Souza") && texto(env, "chkFiAut101").includes("José Souza") && /Ninguém na lista ainda/.test(texto(env, "chkFiAut101")), "os responsáveis cadastrados aparecem e a lista começa vazia");
    confere(/Ainda não há autorização do responsável para guardar a saúde/.test(texto(env, "chkFiSau101")) && !env.e("chkFiSauTexto101"), "sem autorização de saúde: o aviso e nenhum campo");
    confere(!achar(env, x => x.getAttribute && x.getAttribute("data-on-click") === "mostrarSubAbaMeupainel" && x.getAttribute("data-args-click") === '["menores"]' && x.parentNode.parentNode === env.e("chkFiSau101")), "e a ficha da liderança não oferece o atalho do responsável");
    limpo(env, "Fichas/achada", [ATAQUE("menor101")]);
    confereAcessibilidade(env, ["chkSecaoFichas"], "Fichas");
    // registrar uma pessoa autorizada
    const tentar = async () => { env.limparRegistro(); env.doc.clicar(env.e("chkFiAutEnviar101")); await env.ocioso(); return texto(env, "chkFiAutMsg101"); };
    m = await tentar(); confere(/Informe o nome da pessoa/.test(m) && env.foco() === env.e("chkFiAutNome101"), "sem nome");
    env.e("chkFiAutNome101").value = "Tia <Zeza>"; m = await tentar(); confere(/Informe o nome da pessoa/.test(m), "nome com < ou >");
    env.e("chkFiAutNome101").value = "Tia Zeza"; m = await tentar(); confere(/Escolha quem é a pessoa/.test(m) && env.foco() === env.e("chkFiAutPar101"), "sem parentesco");
    env.e("chkFiAutPar101").value = "TIO"; env.e("chkFiAutVal101").value = "2020-01-01"; m = await tentar(); confere(/validade não pode ser uma data que já passou/.test(m), "validade que já passou");
    env.e("chkFiAutVal101").value = "01/01/2030"; m = await tentar(); confere(/validade com dia, mês e ano/.test(m), "validade fora do formato");
    env.e("chkFiAutVal101").value = "2026-12-31"; env.e("chkFiAutMat101").value = "12x"; m = await tentar(); confere(/matrícula precisa ser um número/.test(m) && env.foco() === env.e("chkFiAutMat101"), "matrícula que não é número");
    env.e("chkFiAutMat101").value = ""; m = await tentar(); confere(/onde a ficha assinada está arquivada/.test(m) && env.foco() === env.e("chkFiAutRef101"), "ficha sem a referência de onde está arquivada");
    env.e("chkFiAutRef101").value = "<Pasta>"; m = await tentar(); confere(/onde a ficha assinada está arquivada/.test(m), "referência com < ou >");
    env.e("chkFiAutRef101").value = "Pasta de fichas, folha 12";
    confere(chamadas(env, "POST checkin-infantil/autorizado-adicionar").length === 0, "nenhuma validação ruim chegou ao servidor");
    env.limparRegistro(); env.doc.clicar(env.e("chkFiAutEnviar101")); await env.ocioso();
    const p = chamadas(env, "POST checkin-infantil/autorizado-adicionar");
    confere(p.length === 1 && JSON.stringify(p[0].corpo) === JSON.stringify({ menorId: 101, nome: "Tia Zeza", parentesco: "TIO", validoAte: "2026-12-31", ficha: true, referencia: "Pasta de fichas, folha 12" }), `corpo: ${JSON.stringify(p[0] && p[0].corpo)}`);
    confere(S.membros[0].autorizados.length === 1 && S.membros[0].autorizados[0].forma === "FICHA_FISICA", "o servidor guardou como ficha assinada");
    const lista = texto(env, "chkFiAut101");
    confere(/Tia Zeza/.test(lista) && /Tio ou tia/.test(lista) && /vale até 31\/12\/2026/.test(lista) && /ficha assinada, registrada pela Secretaria/.test(lista), "a lista mostra a pessoa, o parentesco, a validade e a forma");
    confere(/Pessoa autorizada a retirar a criança/.test(texto(env, "chkFiAutMsg101")) && !/psc-aviso/.test(env.e("chkFiAutMsg101").className) && env.e("chkFiAutNome101").value === "", "a mensagem de sucesso volta ao lugar e o formulário vem limpo");
    // a recusa do servidor (nome repetido): mensagem tal qual, formulário intacto
    env.e("chkFiAutNome101").value = "tia zeza"; env.e("chkFiAutPar101").value = "TIO"; env.e("chkFiAutRef101").value = "Pasta";
    env.limparRegistro(); env.doc.clicar(env.e("chkFiAutEnviar101")); await env.ocioso();
    confere(/já está na lista de autorizados/.test(texto(env, "chkFiAutMsg101")) && env.e("chkFiAutNome101").value === "tia zeza" && S.membros[0].autorizados.length === 1, "nome repetido: o servidor recusa e o formulário continua preenchido");
    // revogar
    env.limparRegistro();
    const idAut = S.membros[0].autorizados[0].autorizadoId;
    const r1 = await clicarEResponder(env, achar(env, x => x.getAttribute && x.getAttribute("data-on-click") === "chkRevogarAutorizadoAcao"), false);
    confere(r1.aberto && /Revogar esta autorização/.test(r1.texto) && /peça a segunda via do código/.test(r1.texto) && chamadas(env, "POST checkin-infantil/autorizado-revogar").length === 0, "a confirmação explica o efeito; cancelar não envia");
    await clicarEResponder(env, achar(env, x => x.getAttribute && x.getAttribute("data-on-click") === "chkRevogarAutorizadoAcao"), true);
    const rv = chamadas(env, "POST checkin-infantil/autorizado-revogar");
    confere(rv.length === 1 && JSON.stringify(rv[0].corpo) === JSON.stringify({ autorizadoId: idAut }) && /Ninguém na lista ainda/.test(texto(env, "chkFiAut101")), "revogar leva só o id e a lista é refeita");
    // limite de 8
    for (let i = 0; i < 8; i++) S.membros[0].autorizados.push({ autorizadoId: 5000 + i, nome: `Pessoa ${i} Teste`, parentesco: "AMIGO_FAMILIA", validoAte: null, forma: "FICHA_FISICA", registradoEm: S.agoraMs });
    env.e("chkFiMatricula").value = "101"; env.doc.clicar(env.e("chkFiBuscar")); await env.ocioso();
    confere(/A lista está cheia \(8 pessoas\)/.test(texto(env, "chkFiAut101")) && !env.e("chkFiAutEnviar101"), "lista cheia: o aviso e nenhum formulário");
    limpo(env, "Fichas/autorizados", []);
  });

  cenario("Fichas assinadas: a saúde da criança (com autorização vigente): validar, guardar com a referência, apagar; sair da aba apaga a ficha", async () => {
    const c = montar({ sessao: GESTOR, ataque: true }); const { S, env } = c;
    await abrirAbaGestao(env);
    env.doc.clicar(env.e("btnChkSecaoFichas")); await env.ocioso();
    env.e("chkFiMatricula").value = "102"; env.doc.clicar(env.e("chkFiBuscar")); await env.ocioso();
    confere(!!env.e("chkFiSauTexto102") && !!env.e("chkFiSauRef102") && !!env.e("chkFiSauGravar102") && !env.e("chkFiSauApagar102"), "com autorização vigente: campo, referência e Guardar; Apagar só quando já há saúde guardada");
    confere(env.e("chkFiSauTexto102").getAttribute("maxlength") === "400" && env.e("chkFiSauTexto102").getAttribute("spellcheck") === "false" && env.e("chkFiSauTexto102").getAttribute("autocomplete") === "off", "o campo de saúde não vai para o corretor nem para o preenchimento automático");
    const tentar = async () => { env.limparRegistro(); env.doc.clicar(env.e("chkFiSauGravar102")); await env.ocioso(); return texto(env, "chkFiSauMsg102"); };
    let m = await tentar(); confere(/Escreva a alergia ou condição de saúde/.test(m) && env.foco() === env.e("chkFiSauTexto102"), "sem texto");
    env.e("chkFiSauTexto102").value = "Alergia a <amendoim>"; m = await tentar(); confere(/sem < ou >/.test(m), "texto com < ou >");
    env.e("chkFiSauTexto102").value = "x".repeat(401); m = await tentar(); confere(/de 2 a 400 caracteres/.test(m), "texto com mais de 400 caracteres");
    env.e("chkFiSauTexto102").value = "Alergia a amendoim"; m = await tentar(); confere(/onde a ficha assinada está arquivada/.test(m) && env.foco() === env.e("chkFiSauRef102"), "sem a referência da ficha");
    env.e("chkFiSauRef102").value = "Pasta 3, folha 2";
    confere(chamadas(env, "POST checkin-infantil/saude-gravar").length === 0, "as validações não chegam ao servidor");
    env.limparRegistro(); env.doc.clicar(env.e("chkFiSauGravar102")); await env.ocioso();
    const p = chamadas(env, "POST checkin-infantil/saude-gravar");
    confere(p.length === 1 && JSON.stringify(p[0].corpo) === JSON.stringify({ menorId: 102, texto: "Alergia a amendoim", ficha: true, referencia: "Pasta 3, folha 2" }), `corpo: ${JSON.stringify(p[0] && p[0].corpo)}`);
    confere(/Informação de saúde guardada/.test(texto(env, "chkFiSauMsg102")) && env.e("chkFiSauTexto102").value === "Alergia a amendoim" && !!env.e("chkFiSauApagar102"), "guardou: a mensagem, o texto no campo e o botão Apagar");
    confere(/Guardada em \d{2}\/\d{2}\/\d{4}/.test(texto(env, "chkFiSau102")), "a data em que foi guardada");
    // o texto vem do servidor só como valor do campo (texto de ataque)
    S.membros[1].saude.texto = `Alergia ${ATAQUE("saude")}`;
    env.e("chkFiMatricula").value = "102"; env.doc.clicar(env.e("chkFiBuscar")); await env.ocioso();
    confere(env.e("chkFiSauTexto102").value.includes("[saude]") && env.doc._ataques.length === 0 && env.ctx.__xss.chamadas.length === 0, "a saúde vinda do servidor entra só como valor do campo, nunca como marcação");
    S.membros[1].saude.texto = "Alergia a amendoim";
    env.e("chkFiMatricula").value = "102"; env.doc.clicar(env.e("chkFiBuscar")); await env.ocioso();
    // apagar
    env.limparRegistro();
    const a1 = await clicarEResponder(env, env.e("chkFiSauApagar102"), false);
    confere(a1.aberto && /Apagar a informação de saúde desta criança/.test(a1.texto) && /não pode ser recuperada/.test(a1.texto) && chamadas(env, "POST checkin-infantil/saude-apagar").length === 0, "a confirmação avisa que não se recupera; cancelar não envia");
    await clicarEResponder(env, env.e("chkFiSauApagar102"), true);
    const ap = chamadas(env, "POST checkin-infantil/saude-apagar");
    confere(ap.length === 1 && JSON.stringify(ap[0].corpo) === JSON.stringify({ menorId: 102 }) && S.membros[1].saude === null && !env.e("chkFiSauApagar102") && env.e("chkFiSauTexto102").value === "", "apagou: leva só o id, o servidor não guarda mais e o campo vem vazio");
    // sair da aba: a ficha, a matrícula e as mensagens saem
    await env.ev("mostrarAbaSecretaria('protecao')"); await env.ocioso();
    confere(env.e("chkFichaCx").innerHTML === "" && env.e("chkFiMatricula").value === "" && texto(env, "chkFichaMsg") === "", "sair da aba apaga a ficha, a matrícula e a mensagem");
    limpo(env, "Fichas/saúde", []);
  });
};
