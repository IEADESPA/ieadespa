// cenarios-retirada.js — a retirada com código (feliz, por "outra pessoa", código errado, criança travada, o registro mudou, sem acesso) e a segunda via com os dois olhares.
// Mesmo molde do roteiro.js: recebe os auxiliares `H` (montar, confere, limpo...) e registra cenários. Servidor simulado com estado (fixtures.js), texto de ataque em todo campo que vem dele.
"use strict";

module.exports = function registrar(H) {
  const { cenario, confere, montar, limpo, achar, descendentes, chamadas, texto, argsDe, visivel, confereAcessibilidade, idsRepetidos, clicarEResponder, esperar, salaPronta, abrirSalaMeu, entrarNaSala,
    buscar, adicionarMembro, escolherQuemTrouxe, enviarCheckin, checkinDoPedro, cartao, seloDe, botoes, nomeDe, F, ATAQUE, ck, MEU, MIN } = H;

  // ---- passos comuns ----
  // a criança já está na sala (check-in feito pela voluntária 41 com a mãe, 201); devolve { registroId, codigo }
  const semear = async (c, op = { menorId: 101, trouxeMembroId: 201 }) => {
    const a = c.S.semear(op);
    await c.env.ev("chkLerSala(true)"); await c.env.ocioso();
    return a;
  };
  const abrirRetirada = async (env, id) => { env.doc.clicar(env.e(`chkRetirar${id}`)); await env.ocioso(); };
  const enviarRetirada = async (env) => { env.doc.disparar(env.e("chkRtForm"), "submit"); await env.ocioso(); };
  const escolherRetirante = (env, valor) => { env.doc.escolher(env.e("chkRtQuem"), valor); };
  const opcoesDe = (env, id) => env.e(id).options.map(o => o.value);
  const outroErro = (a) => (a === "AAAAAA" ? "BBBBBB" : "AAAAAA");   // um código bem formado e (quase sempre) errado: o teste confere com o do servidor
  const codigoErrado = (codigo) => { let c = "BBBBBB"; if (c === codigo) c = "CCCCCC"; return c; };
  const rotuloQuemTrouxe = (r) => r;
  const msgPainel = (env, id) => texto(env, id);

  cenario("Retirada feliz: abrir o painel, validar antes de enviar, enviar em maiúsculas e sem hífen, sair da lista, foco e privacidade", async () => {
    const c = await salaPronta({ ataque: true }); const { S, env } = c;
    const a = await semear(c);
    const id = a.registroId, card = cartao(env, id);
    // o cartão da criança tem os botões de quem opera, e só eles
    const bts = botoes(card);
    confere(bts.some(t => /Retirar/.test(t)) && bts.some(t => /Segunda via do código/.test(t)) && !bts.some(t => /Aprovar|Negar|Destravar|Confirmar a segunda via/.test(t)), `quem é da equipe e está na sala vê Retirar e Segunda via, não os botões da liderança: ${bts.join(" | ")}`);
    confere(JSON.stringify(argsDe(env.e(`chkRetirar${id}`))) === JSON.stringify([id, { $: "this" }]), "o botão Retirar leva o id numérico e o próprio botão (para devolver o foco)");
    confere(texto(env, nomeDe(id)).startsWith("Pedro Souza") && texto(env, nomeDe(id)).includes("[menor101]"), "o nome da criança (com texto de ataque) é só texto");
    confere(card.textContent.includes("Maria Souza") && /Pode retirar/.test(card.textContent), "o cartão mostra quem pode retirar");
    // abrir o painel
    env.limparRegistro();
    await abrirRetirada(env, id);
    confere(!!env.e("chkRtPainel") && !!env.e("chkRtForm") && texto(env, "chkAcaoNome").startsWith("Pedro Souza"), "o painel de retirada abre com o nome da criança (texto)");
    confere(env.foco() === env.e("chkRtQuem"), "o foco vai para o primeiro campo do painel (quem está retirando)");
    confere(env.doc._rolagens.includes("chkAcaoCx"), "a tela rola até o painel");
    confere(env.e("chkRtForm").getAttribute("data-on-submit") === "chkEnviarRetiradaAcao" && /submit/.test(env.e("chkRtForm").getAttribute("data-prevent")), "o formulário envia pelo Enter (submit) e a tela impede o envio da página");
    confere(env.e("chkRtEnviar").getAttribute("type") === "submit" && env.e("chkRtEnviar").parentNode.parentNode === env.e("chkRtForm"), "o botão de entregar é o do formulário (teclado)");
    const ops = opcoesDe(env, "chkRtQuem");
    confere(ops[0] === "" && ops.includes("RESP:201") && ops.includes("RESP:202") && ops.includes("TROUXE") && ops[ops.length - 1] === "OUTRA", `quem retira: placeholder, os responsáveis, quem trouxe e 'outra pessoa': ${ops.join(",")}`);
    confere(!visivel(env, "chkRtOutraCx"), "os campos de 'outra pessoa' ficam escondidos");
    const cod = env.e("chkRtCodigo");
    confere(cod.getAttribute("maxlength") === "12" && cod.getAttribute("autocomplete") === "off" && cod.getAttribute("autocapitalize") === "characters" && cod.getAttribute("spellcheck") === "false", "o campo do código não vai para o preenchimento automático nem para o corretor");
    confere(!/value=/.test(cod.outerHTML || "") && cod.value === "", "o campo do código começa vazio");
    confereAcessibilidade(env, ["chkAcaoCx"], "Painel de retirada");
    confere(chamadas(env, "POST checkin-infantil/retirar").length === 0, "abrir o painel não pede nada ao servidor");
    // as validações (nada é enviado)
    const tentar = async () => { env.limparRegistro(); await enviarRetirada(env); return msgPainel(env, "chkRtMsg"); };
    let m = await tentar(); confere(/Escolha quem está retirando/.test(m) && env.foco() === env.e("chkRtQuem"), "sem escolher quem retira: mensagem e foco no campo");
    escolherRetirante(env, "RESP:201");
    m = await tentar(); confere(/Digite o código da etiqueta/.test(m) && env.foco() === env.e("chkRtCodigo"), "sem código: mensagem e foco no campo do código");
    for (const [ruim, rotulo] of [["AB2", "curto"], ["ABCDE0", "com zero"], ["ABCDEO", "com a letra O"], ["ABCDE1", "com um"], ["ABCDEI", "com a letra I"], ["ABCDEL", "com a letra L"], ["ABCDEFG", "comprido"], ["ABC#EF", "com símbolo"]]) {
      env.e("chkRtCodigo").value = ruim;
      m = await tentar(); confere(/6 letras e números/.test(m) && env.foco() === env.e("chkRtCodigo"), `código ${rotulo} (${ruim}): a tela recusa antes de pedir`);
    }
    confere(chamadas(env, "POST checkin-infantil/retirar").length === 0, "nenhuma tentativa inválida chegou ao servidor");
    confere(msgPainel(env, "chkRtMsg") !== "" && /psc-aviso/.test(env.e("chkRtMsg").className), "a mensagem de erro aparece em destaque, na região que o leitor de tela anuncia");
    confere(env.e("chkRtMsg").getAttribute("role") === "status" && env.e("chkRtMsg").getAttribute("aria-live") === "polite", "a mensagem é role=status com aria-live=polite");
    // enviar: minúsculas, espaço e hífen
    const certo = a.codigo;
    env.e("chkRtCodigo").value = ` ${certo.slice(0, 3).toLowerCase()}-${certo.slice(3).toLowerCase()} `;
    env.limparRegistro();
    await enviarRetirada(env);
    const p = chamadas(env, "POST checkin-infantil/retirar");
    confere(p.length === 1 && JSON.stringify(p[0].corpo) === JSON.stringify({ registroId: id, codigo: certo, retirante: { ref: "RESP:201" } }), `corpo da retirada: ${JSON.stringify(p[0] && p[0].corpo)}`);
    confere(typeof p[0].corpo.registroId === "number" && !/\?/.test(p[0].url), "o id vai como número e o código vai no corpo, nunca no endereço");
    confere(S.registro(id).situacao === "RETIRADA" && S.eventos.some(e => e.registroId === id && e.tipo === "RETIRADA"), "o servidor registrou a retirada");
    confere(texto(env, "chkSalaMsg") === "Criança entregue a quem a retirou." && env.toasts().includes("Criança entregue a quem a retirou."), "a mensagem do servidor aparece na sala e em aviso");
    confere(env.e("chkAcaoCx").innerHTML === "" && !env.e("chkRtPainel"), "o painel fecha");
    confere(!cartao(env, id) && /Nenhuma criança na sala agora/.test(texto(env, "chkNaSalaLista")), "a criança sai da lista 'Na sala' (a sala foi lida de novo)");
    confere(chamadas(env, "GET checkin-infantil/sala").length === 1, "uma leitura da sala depois do ato (a resposta mais nova vence)");
    confere(env.foco() !== env.doc.body && !!env.foco() && env.foco().isConnected, `depois da retirada o foco NÃO se perde no corpo da página (foco em: ${env.foco() && (env.foco().id || env.foco().localName)})`);
    // privacidade do que foi digitado
    confere(!env.toasts().join("|").toUpperCase().includes(certo) && !env.doc.body.innerHTML.toUpperCase().includes(certo) && !env.saidaConsole.join("|").toUpperCase().includes(certo) && env.gravacoes.length === 0, "o código digitado não ficou na tela, em aviso, no console nem no armazenamento");
    limpo(env, "Retirada feliz", [ATAQUE("vol42")]);
  });

  cenario("Retirada de visitante por uma pessoa da visita (VIS) e por quem trouxe (TROUXE); duplo envio vira um só pedido", async () => {
    const c = await salaPronta({ ataque: true }); const { S, env } = c;
    const v = await semear(c, { visitante: { nome: "Visitante Onze", nascimento: "2021-05-05" }, extras: [{ nome: "Vovó Lia", parentesco: "AVO" }, { nome: "Tio Beto", parentesco: "TIO" }] });
    await abrirRetirada(env, v.registroId);
    const ops = opcoesDe(env, "chkRtQuem");
    confere(ops.some(o => /^VIS:\d+$/.test(o)) && ops.includes("TROUXE") && !ops.some(o => /^RESP:/.test(o)) && ops[ops.length - 1] === "OUTRA", `criança visitante: sem responsáveis cadastrados; só quem trouxe e as pessoas da visita: ${ops.join(",")}`);
    const rotulos = env.e("chkRtQuem").options.map(o => o.textContent).join("|");
    confere(rotulos.includes("Vovó Lia") && rotulos.includes("só esta visita") && rotulos.includes("Quem trouxe a criança"), "os rótulos dizem quem é cada um e que a pessoa da visita vale só esta visita");
    const vis = ops.find(o => /^VIS:\d+$/.test(o));
    escolherRetirante(env, vis);
    env.e("chkRtCodigo").value = v.codigo;
    env.limparRegistro();
    // duplo envio: dois pedidos no mesmo instante viram um só (o segundo recebe o aviso 'Aguarde')
    const dup = env.ev("Promise.all([chkEnviarRetiradaAcao(), chkEnviarRetiradaAcao()])");
    await esperar(dup); await env.ocioso();
    confere(chamadas(env, "POST checkin-infantil/retirar").length === 1, "duplo envio: um pedido só ao servidor");
    confere(/Aguarde/.test(env.toasts().join("|")), "e o aviso 'Aguarde'");
    confere(S.registro(v.registroId).situacao === "RETIRADA" && S.registro(v.registroId).retiradoTipo === "AUTORIZADO", "o servidor entregou a criança à pessoa da visita");
    // quem trouxe (TROUXE)
    const w = await semear(c, { visitante: { nome: "Visitante Doze", nascimento: "2021-06-06" }, trouxeNome: "Tia Zeza" });
    await abrirRetirada(env, w.registroId);
    escolherRetirante(env, "TROUXE"); env.e("chkRtCodigo").value = w.codigo; env.limparRegistro();
    await enviarRetirada(env);
    confere(chamadas(env, "POST checkin-infantil/retirar")[0].corpo.retirante.ref === "TROUXE" && S.registro(w.registroId).situacao === "RETIRADA", "retirada por quem trouxe (TROUXE)");
  });

  cenario("Retirada por 'outra pessoa': validações, código certo vira pedido à liderança (a criança continua na sala) e pendência em destaque", async () => {
    const c = await salaPronta({ ataque: true }); const { S, env } = c;
    const a = await semear(c);
    const id = a.registroId;
    await abrirRetirada(env, id);
    escolherRetirante(env, "OUTRA");
    confere(visivel(env, "chkRtOutraCx") && /só leva a criança se a\s+liderança aprovar|só leva a criança se a liderança aprovar/.test(texto(env, "chkRtOutraCx").replace(/\s+/g, " ")), "'outra pessoa' mostra os campos e o aviso de que só leva se a liderança aprovar");
    confere(env.e("chkRtOutraCx").querySelector === undefined || !!achar(env, x => x.id === "chkRtOutraCx"), "bloco existe");
    const tentar = async () => { env.limparRegistro(); await enviarRetirada(env); return msgPainel(env, "chkRtMsg"); };
    env.e("chkRtCodigo").value = a.codigo;
    let m = await tentar(); confere(/nome de quem está retirando/.test(m) && env.foco() === env.e("chkRtNome"), "sem nome: mensagem e foco");
    env.e("chkRtNome").value = "Tia <Zeza>";
    m = await tentar(); confere(/nome de quem está retirando/.test(m), "nome com < ou > não vale");
    env.e("chkRtNome").value = "Z";
    m = await tentar(); confere(/nome de quem está retirando/.test(m), "nome de uma letra só não vale");
    env.e("chkRtNome").value = "Tia Zeza";
    m = await tentar(); confere(/Escolha quem é a pessoa para a criança/.test(m) && env.foco() === env.e("chkRtPar"), "sem o parentesco");
    env.e("chkRtPar").value = "TIO";
    m = await tentar(); confere(/Escolha o documento que você conferiu/.test(m) && env.foco() === env.e("chkRtDoc"), "sem o documento");
    env.e("chkRtDoc").value = "RG";
    confere(chamadas(env, "POST checkin-infantil/retirar").length === 0, "nenhuma validação ruim chegou ao servidor");
    env.limparRegistro();
    await enviarRetirada(env);
    const p = chamadas(env, "POST checkin-infantil/retirar");
    confere(p.length === 1 && JSON.stringify(p[0].corpo) === JSON.stringify({ registroId: id, codigo: a.codigo, retirante: { outro: { nome: "Tia Zeza", parentesco: "TIO", documento: "RG" } } }), `corpo: ${JSON.stringify(p[0] && p[0].corpo)}`);
    confere(/Quem pediu não está na lista/.test(texto(env, "chkSalaMsg")) && /liderança da congregação/.test(texto(env, "chkSalaMsg")), "a mensagem do servidor explica que o pedido foi à liderança");
    confere(env.e("chkAcaoCx").innerHTML === "", "o painel fecha");
    const card = cartao(env, id);
    confere(!!card && seloDe(card, "Retirada aguardando a liderança") && /Aguardando a liderança/.test(card.textContent) && /Ela continua na sala até a liderança decidir/.test(card.textContent), "o cartão mostra 'aguardando a liderança' e que a criança continua na sala");
    const bts = botoes(card);
    confere(!bts.some(t => /Retirar|Segunda via|Aprovar|Negar|Destravar/.test(t)), `sem botões de retirar enquanto a liderança não decide (e quem opera não decide): ${bts.join(" | ")}`);
    confere(/class="chk-crianca-divergente|chk-crianca-divergente/.test(card.className) && /retirada\(s\) por quem não está na lista/.test(texto(env, "chkSalaPendencias")), "o cartão ganha a borda de alerta e a sala mostra a pendência");
    confere(env.e("chkSalaPendencias").innerHTML.includes('role="alert"'), "a pendência é anunciada (role=alert)");
    confere(!!achar(env, x => x.id === `chkCrianca${id}` && x.parentNode === env.e("chkNaSalaLista")), "a criança segue na lista 'Na sala'");
    confere(S.registro(id).situacao === "RETIRADA_PENDENTE" && S.eventos.some(e => e.tipo === "RETIRADA_DIVERGENTE_PEDIDA"), "o servidor guardou o pedido");
    // quem opera tenta de novo: o servidor recusa (já há pedido); a tela mostra a mensagem
    limpo(env, "Retirada divergente", []);
  });

  cenario("Código errado: o painel fica aberto com o campo limpo, restam tentativas; na quinta a criança trava e o painel fecha", async () => {
    const c = await salaPronta({ ataque: true }); const { S, env } = c;
    const a = await semear(c);
    const id = a.registroId, errado = codigoErrado(a.codigo);
    await abrirRetirada(env, id);
    escolherRetirante(env, "RESP:202");
    for (let n = 1; n <= 4; n++) {
      env.e("chkRtCodigo").value = errado; env.limparRegistro();
      await enviarRetirada(env);
      const restam = 5 - n;
      confere(new RegExp(`Código errado\\. Restam ${restam} tentativa`).test(texto(env, "chkRtMsg")), `erro ${n}: a mensagem do servidor diz quantas tentativas restam (${restam})`);
      confere(env.e("chkRtCodigo").value === "" && !!env.e("chkRtPainel"), `erro ${n}: o campo do código é limpo e o painel continua aberto`);
      confere(env.foco() === env.e("chkRtCodigo"), `erro ${n}: o foco volta ao campo do código`);
      confere(/psc-aviso/.test(env.e("chkRtMsg").className), `erro ${n}: a mensagem fica em destaque`);
      confere(new RegExp(`Tentativas de código que restam[\\s\\S]*${restam}`).test(cartao(env, id).textContent), `erro ${n}: o cartão mostra as tentativas que restam (${restam})`);
      confere(chamadas(env, "GET checkin-infantil/sala").length === 1, `erro ${n}: a sala é lida de novo depois do erro`);
      confere(!env.toasts().join("|").toUpperCase().includes(errado) && !env.saidaConsole.join("|").includes(errado) && env.gravacoes.length === 0, `erro ${n}: o código errado digitado não aparece em aviso, console nem armazenamento`);
    }
    // o campo preservado do painel: o 'quem' escolhido continua
    confere(env.e("chkRtQuem").value === "RESP:202", "a escolha de quem retira continua depois do erro");
    // quinto erro: trava
    env.e("chkRtCodigo").value = errado; env.limparRegistro();
    await enviarRetirada(env);
    confere(S.registro(id).travado === true && S.eventos.some(e => e.tipo === "CRIANCA_TRAVADA"), "o servidor travou a criança");
    confere(env.e("chkAcaoCx").innerHTML === "" && !env.e("chkRtPainel"), "o painel fecha quando a criança trava");
    confere(/A criança foi travada depois de 5 erros/.test(texto(env, "chkSalaMsg")) && /psc-aviso/.test(env.e("chkSalaMsg").className), "a mensagem de travada aparece na sala, em destaque");
    const card = cartao(env, id), bts = botoes(card);
    confere(seloDe(card, "Travada") && /Criança travada/.test(card.textContent) && /Peça à liderança para destravar ou emita a segunda via/.test(card.textContent), "o cartão mostra 'travada' e o que fazer");
    confere(!bts.some(t => /Retirar/.test(t)) && bts.some(t => /Segunda via do código/.test(t)) && !bts.some(t => /Destravar/.test(t)), `travada: sem Retirar, com Segunda via, e quem não é da liderança não vê Destravar: ${bts.join(" | ")}`);
    confere(/criança\(s\) travada\(s\) por erros do código/.test(texto(env, "chkSalaPendencias")), "a sala mostra a pendência das travadas");
    confere(!/Tentativas de código que restam/.test(card.textContent) || /Tentativas de código que restam[\s\S]*0/.test(card.textContent), "nenhuma tentativa restante é anunciada como positiva");
    limpo(env, "Código errado", []);
  });

  cenario("Retirada: o registro mudou (409), já retirada por outro, a pessoa saiu da sala (403), o painel fecha quando a criança muda", async () => {
    // 409: o servidor diz 'mudou' (tentativas esgotadas sem travar)
    const c = await salaPronta(); const { S, env } = c;
    const a = await semear(c);
    S.registro(a.registroId).tentativas = 5;
    await abrirRetirada(env, a.registroId); escolherRetirante(env, "RESP:201"); env.e("chkRtCodigo").value = a.codigo; env.limparRegistro();
    await enviarRetirada(env);
    confere(/O registro mudou enquanto você agia/.test(texto(env, "chkSalaMsg")) && env.e("chkAcaoCx").innerHTML === "", "409: o painel fecha e a mensagem do servidor aparece na sala");
    confere(chamadas(env, "GET checkin-infantil/sala").length === 1, "409: a sala é lida de novo");
    // já retirada por outro enquanto o painel estava aberto
    const d = await salaPronta(); const D = d.S;
    const b = await semear(d, { menorId: 102, trouxeMembroId: 202 });
    await abrirRetirada(d.env, b.registroId); escolherRetirante(d.env, "RESP:202"); d.env.e("chkRtCodigo").value = b.codigo;
    Object.assign(D.registro(b.registroId), { situacao: "RETIRADA", retiradoEm: D.agoraMs, retiradoNome: "Outro" });
    d.env.limparRegistro();
    await enviarRetirada(d.env);
    confere(/já foi retirada/.test(texto(d.env, "chkRtMsg")) && !!d.env.e("chkRtPainel"), "já retirada: a mensagem do servidor aparece no painel, que continua aberto");
    d.env.tique(); await d.env.ocioso();
    confere(d.env.e("chkAcaoCx").innerHTML === "" && /Esta criança já saiu da sala/.test(texto(d.env, "chkSalaMsg")), "na atualização seguinte o painel fecha e a sala diz que a criança já saiu");
    // a liderança aprovou/negou, ou outra pessoa pediu a retirada divergente: o painel de quem ia retirar fecha com o aviso
    const e2 = await salaPronta(); const E = e2.S;
    const f = await semear(e2);
    await abrirRetirada(e2.env, f.registroId);
    E.pedirDivergencia(f.registroId, { nome: "Tia Zeza", parentesco: "TIO", documento: "RG", operadorId: 42 });
    e2.env.tique(); await e2.env.ocioso();
    confere(e2.env.e("chkAcaoCx").innerHTML === "" && /O estado desta criança mudou enquanto você agia/.test(texto(e2.env, "chkSalaMsg")), "outra pessoa pediu a retirada: o painel de retirada fecha e a sala avisa que o estado mudou");
    // a pessoa saiu da sala (tirada pela liderança) com o painel aberto: o servidor recusa (403); a tela não deixa o painel aberto sem poder agir
    const g = await salaPronta(); const G = g.S;
    const h = await semear(g);
    await abrirRetirada(g.env, h.registroId); escolherRetirante(g.env, "RESP:201"); g.env.e("chkRtCodigo").value = h.codigo;
    G.salas[0].voluntarios.forEach(v => { if (v.membroId === MEU) v.saiuEm = G.agoraMs; });
    g.env.limparRegistro();
    await enviarRetirada(g.env);
    confere(/Entre na sala primeiro/.test(g.env.toasts().join("|")), "403: a mensagem do servidor aparece em aviso (o fetchProtegido já avisou)");
    confere(g.env.toasts().filter(t => /Entre na sala primeiro/.test(t)).length <= 1, "e o aviso do 403 não se repete");
    confere(!botoes(cartao(g.env, h.registroId)).some(t => /Retirar/.test(t)), "quem não está mais na sala deixa de ver o botão Retirar");
    confere(g.env.e("chkAcaoCx").innerHTML === "" && /Entre|não está mais na sala|Toque em/.test(texto(g.env, "chkSalaMsg") + texto(g.env, "chkCiAviso")), "e o painel de retirada não fica aberto para quem já não pode agir");
  });

  cenario("Foco na retirada: depois de um código errado a lista é refeita, e o foco volta ao botão NOVO (ao cancelar) ou ao título (quando a criança sai)", async () => {
    const c = await salaPronta(); const { S, env } = c;
    const a = await semear(c);
    const id = a.registroId;
    // código errado: a leitura da sala refaz o cartão (as tentativas mudam) enquanto o painel está aberto
    env.e(`chkRetirar${id}`).focus(); env.doc.clicar(env.e(`chkRetirar${id}`)); await env.ocioso();
    const velho = env.e(`chkRetirar${id}`);
    escolherRetirante(env, "RESP:201"); env.e("chkRtCodigo").value = codigoErrado(a.codigo);
    await enviarRetirada(env);
    confere(env.e(`chkRetirar${id}`) !== velho && !!env.e(`chkRetirar${id}`) && !velho.isConnected, "o cartão foi refeito: o botão Retirar de antes saiu da árvore e há um novo com o mesmo id");
    // cancelar devolve o foco ao botão NOVO
    const cancelar = achar(env, x => x.localName === "button" && x.getAttribute("data-on-click") === "chkFecharAcaoAcao" && x.textContent.includes("cancelar"));
    cancelar.focus(); env.doc.clicar(cancelar); await env.ocioso();
    confere(!env.e("chkRtPainel") && env.foco() === env.e(`chkRetirar${id}`) && env.foco().isConnected, `cancelar: o foco volta ao botão Retirar que está na tela agora (foco em: ${env.foco() && (env.foco().id || env.foco().localName)})`);
    // abrir de novo, acertar: a criança sai e o foco vai para o título da sala
    env.doc.clicar(env.e(`chkRetirar${id}`)); await env.ocioso();
    const antigo = env.e(`chkRetirar${id}`);
    escolherRetirante(env, "RESP:201"); env.e("chkRtCodigo").value = codigoErrado(a.codigo);
    await enviarRetirada(env);
    confere(env.e(`chkRetirar${id}`) !== antigo, "outra leitura refez o cartão de novo");
    env.e("chkRtCodigo").value = a.codigo;
    await enviarRetirada(env);
    confere(S.registro(id).situacao === "RETIRADA" && !env.e(`chkCrianca${id}`), "a retirada certa entrega a criança");
    confere(env.foco() === env.e("chkSalaTitulo"), `com o cartão que tinha o foco fora da tela, o foco vai para o título da sala (foco em: ${env.foco() && (env.foco().id || env.foco().localName)})`);
    // a segunda via pedida: o botão de pedir some do cartão; o foco também não se perde
    const b = await semear(c, { menorId: 102, trouxeMembroId: 201 });
    env.e(`chkSegVia${b.registroId}`).focus(); env.doc.clicar(env.e(`chkSegVia${b.registroId}`)); await env.ocioso();
    env.doc.escolher(env.e("chkSvQuem"), "RESP:201"); env.e("chkSvDoc").value = "RG";
    env.doc.disparar(env.e("chkSvForm"), "submit"); await env.ocioso();
    confere(!env.e(`chkSegVia${b.registroId}`) && env.foco() !== env.doc.body && !!env.foco() && env.foco().isConnected, `depois de pedir a segunda via o foco não se perde (foco em: ${env.foco() && (env.foco().id || env.foco().localName)})`);
  });

  cenario("Sala sem a pessoa dentro: o cartão da criança não tem botões de operar, e quem é da liderança só acompanha", async () => {
    const c = montar({ ataque: true }); const { S, env } = c;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 });
    await abrirSalaMeu(env);
    const card = cartao(env, a.registroId);
    confere(!!card && botoes(card).length === 0, "quem ainda não entrou na sala vê a criança mas nenhum botão");
    confere(/Toque em “Entrar na sala”/.test(texto(env, "chkCiAviso")), "e o aviso manda entrar na sala");
    env.ev("chkAbrirRetiradaAcao(" + a.registroId + ", null)"); await env.ocioso();
    confere(!env.e("chkRtPainel"), "mesmo chamando a ação direto, o painel não abre para quem não está na sala");
    await env.ev("chkAbrirSegundaViaAcao(" + a.registroId + ", null)"); await env.ocioso();
    confere(!env.e("chkSvPainel"), "nem o da segunda via");
    // a liderança acompanha: sem Entrar, sem formulário, sem botões de operar
    const g = montar({ sessao: { membroId: 9, lideranca: true, gestao: true }, ataque: true });
    const b = g.S.semear({ menorId: 101, trouxeMembroId: 201 });
    await g.env.ev("mostrarAbaSecretaria('checkininfantil')"); await g.env.ocioso();
    g.env.doc.clicar(g.env.e("chkAbrirGes501x31")); await g.env.ocioso();
    confere(!g.env.e("chkEntrarBotao") && !g.env.e("chkSairBotao") && /Você acompanha esta sala como liderança/.test(texto(g.env, "chkCiAviso")) && !visivel(g.env, "chkCiForm"), "a liderança que não é da equipe vê só o acompanhamento");
    confere(!botoes(cartao(g.env, b.registroId)).some(t => /Retirar|Segunda via/.test(t)), "e nenhum botão de retirar ou de segunda via");
    await g.env.ev("chkAbrirRetiradaAcao(" + b.registroId + ", null)"); await g.env.ocioso();
    confere(!g.env.e("chkRtPainel"), "chamar a ação direto também não abre o painel para a liderança");
  });

  // ============================================================================================================================================
  // A SEGUNDA VIA (dois olhares)
  // ============================================================================================================================================
  cenario("Segunda via: pedir (validações, só entre os que podem retirar), esperar outro adulto, e o pedido expira em 10 minutos", async () => {
    const c = await salaPronta({ ataque: true }); const { S, env } = c;
    const a = await semear(c);
    const id = a.registroId;
    env.limparRegistro();
    env.doc.clicar(env.e(`chkSegVia${id}`)); await env.ocioso();
    confere(!!env.e("chkSvPainel") && texto(env, "chkAcaoNome").startsWith("Pedro Souza") && env.foco() === env.e("chkSvQuem"), "o painel da segunda via abre, com o nome da criança, e o foco vai ao primeiro campo");
    const ops = opcoesDe(env, "chkSvQuem");
    confere(ops[0] === "" && ops.includes("RESP:201") && !ops.includes("OUTRA"), `só quem já pode retirar: sem 'outra pessoa' (${ops.join(",")})`);
    confere(/outro adulto da sala/.test(texto(env, "chkSvPainel")) && /10 minutos/.test(texto(env, "chkSvPainel")), "o texto explica os dois olhares e os 10 minutos (do catálogo do servidor)");
    confere(env.e("chkSvForm").getAttribute("data-on-submit") === "chkEnviarSegundaViaAcao" && /submit/.test(env.e("chkSvForm").getAttribute("data-prevent")), "o formulário envia pelo Enter");
    confereAcessibilidade(env, ["chkAcaoCx"], "Segunda via");
    const tentar = async () => { env.limparRegistro(); env.doc.disparar(env.e("chkSvForm"), "submit"); await env.ocioso(); return texto(env, "chkSvMsg"); };
    let m = await tentar(); confere(/Escolha quem está pedindo/.test(m) && env.foco() === env.e("chkSvQuem"), "sem escolher quem pede");
    env.doc.escolher(env.e("chkSvQuem"), "RESP:201");
    m = await tentar(); confere(/Escolha o documento que você conferiu/.test(m) && env.foco() === env.e("chkSvDoc"), "sem o documento");
    confere(chamadas(env, "POST checkin-infantil/segunda-via-pedir").length === 0, "as validações não chegam ao servidor");
    env.e("chkSvDoc").value = "RG";
    env.limparRegistro();
    env.doc.disparar(env.e("chkSvForm"), "submit"); await env.ocioso();
    const p = chamadas(env, "POST checkin-infantil/segunda-via-pedir");
    confere(p.length === 1 && JSON.stringify(p[0].corpo) === JSON.stringify({ registroId: id, pessoa: { ref: "RESP:201" }, documento: "RG" }), `corpo: ${JSON.stringify(p[0] && p[0].corpo)}`);
    confere(/Outro adulto da sala precisa confirmar em até 10 minutos/.test(texto(env, "chkSalaMsg")) && env.e("chkAcaoCx").innerHTML === "", "a mensagem do servidor aparece na sala e o painel fecha");
    const card = cartao(env, id), bts = botoes(card);
    confere(seloDe(card, "Segunda via pedida") && /Você pediu a segunda via/.test(card.textContent), "o cartão mostra 'segunda via pedida' e que foi você quem pediu");
    confere(!bts.some(t => /Confirmar a segunda via|Segunda via do código/.test(t)) && bts.some(t => /Retirar/.test(t)), `quem pediu não confirma nem pede de novo; ainda pode retirar com o código: ${bts.join(" | ")}`);
    confere(/segunda\(s\) via\(s\) esperando outro adulto confirmar/.test(texto(env, "chkSalaPendencias")), "a pendência aparece na sala");
    // quem pediu tenta confirmar (chamando a ação direto): o servidor recusa e a tela mostra o motivo
    env.limparRegistro();
    const conf = env.ev(`chkConfirmarSegundaViaAcao(${id}, null)`); await env.ocioso();
    confere(env.modal().aberto, "pedir confirmação antes de confirmar");
    env.doc.clicar(env.e("modalConfirmar")); await esperar(conf); await env.ocioso();
    confere(/Quem pediu a segunda via não a confirma/.test(texto(env, "chkSalaMsg")) && !env.e("chkImprimivel"), "quem pediu não confirma a própria segunda via: o servidor recusa e nenhuma etiqueta abre");
    // o pedido vence em 10 minutos: os botões voltam
    S.agoraMs += 11 * MIN;
    env.tique(); await env.ocioso();
    const bts2 = botoes(cartao(env, id));
    confere(!seloDe(cartao(env, id), "Segunda via pedida") && bts2.some(t => /Segunda via do código/.test(t)) && !/segunda\(s\) via\(s\)/.test(texto(env, "chkSalaPendencias")), "depois de 10 minutos o pedido some e dá para pedir de novo");
    limpo(env, "Segunda via/pedir", [ATAQUE("vol42")]);
  });

  cenario("Segunda via: outro adulto confirma (modal com o efeito real), a etiqueta nova abre com o código novo e o antigo morre", async () => {
    const c = await salaPronta({ ataque: true }); const { S, env } = c;
    const a = await semear(c, { menorId: 101, trouxeMembroId: 201, saude: null });
    const id = a.registroId, antigo = a.codigo;
    // a voluntária 41 pede
    env.doc.clicar(env.e(`chkSegVia${id}`)); await env.ocioso();
    env.doc.escolher(env.e("chkSvQuem"), "RESP:201"); env.e("chkSvDoc").value = "RG";
    env.doc.disparar(env.e("chkSvForm"), "submit"); await env.ocioso();
    // a Bia (42) abre a sala e confirma
    S.definirSessao({ membroId: 42, lideranca: false, gestao: false });
    env.sessao({ matricula: 42, pin: true });
    await abrirSalaMeu(env);
    const card = cartao(env, id), bts = botoes(card);
    confere(bts.some(t => /Confirmar a segunda via/.test(t)) && /Segunda via pedida por Maria Souza/.test(card.textContent) && /confira o documento dessa pessoa e confirme/.test(card.textContent), `quem não pediu vê 'Confirmar a segunda via' e o nome de quem pediu: ${bts.join(" | ")}`);
    confere(!bts.some(t => /Segunda via do código/.test(t)), "e não pode pedir outra");
    env.limparRegistro();
    // cancelar o modal: nada é enviado
    const mc1 = await clicarEResponder(env, env.e(`chkConfSegVia${id}`), false);
    confere(mc1.aberto && /Maria Souza/.test(mc1.texto) && /Pedro Souza/.test(mc1.texto) && /O código antigo deixa de valer agora/.test(mc1.texto), "o modal diz de quem e para qual criança, e que o código antigo deixa de valer agora");
    confere(chamadas(env, "POST checkin-infantil/segunda-via-confirmar").length === 0 && !env.e("chkImprimivel"), "cancelar não envia nada nem abre etiqueta");
    // confirmar
    const mc2 = await clicarEResponder(env, env.e(`chkConfSegVia${id}`), true);
    const p = chamadas(env, "POST checkin-infantil/segunda-via-confirmar");
    confere(p.length === 1 && JSON.stringify(p[0].corpo) === JSON.stringify({ registroId: id }), "POST confirmar leva só o id");
    const novo = S.codigoDe(id);
    confere(novo !== antigo && /^[A-HJKMNP-Z2-9]{6}$/.test(novo), "o servidor gerou um código novo, diferente do antigo");
    confere(!!env.e("chkImprimivel") && env.e("chkCodigo0x0").textContent === novo && env.e("chkReciboCodigo0x0").textContent === novo, "a etiqueta e o recibo mostram o código NOVO");
    confere(/Recibo do responsável/.test(texto(env, "chkRecibo0")) && /Pedro [A-Z]\./.test(texto(env, "chkRecibo0")) && /Guarde este código: sem ele a criança não é entregue/.test(texto(env, "chkRecibo0")), "o recibo da segunda via traz a criança e a orientação do servidor");
    confere(env.g("chkImpressao").lotes[0].tipo === "SEGUNDA_VIA" && env.foco() === env.e("chkImpressaoTitulo"), "o lote é de segunda via e o foco vai ao painel de impressão");
    confere(/Segunda via emitida/.test(texto(env, "chkSalaMsg")) && !texto(env, "chkSalaMsg").includes(novo) && !env.toasts().join("|").includes(novo), "a mensagem não repete o código");
    confere(!seloDe(cartao(env, id), "Segunda via pedida") && botoes(cartao(env, id)).some(t => /Segunda via do código/.test(t)), "a pendência some do cartão");
    confere(!env.doc.body.innerHTML.includes(antigo) || antigo === novo, "o código antigo não aparece em lugar nenhum");
    confere(env.gravacoes.length === 0 && !env.saidaConsole.join("").includes(novo), "o código novo nunca vai ao armazenamento nem ao console");
    // o código antigo não retira mais (o servidor confere); o novo retira
    await abrirRetirada(env, id); escolherRetirante(env, "RESP:201"); env.e("chkRtCodigo").value = antigo;
    await enviarRetirada(env);
    confere(/Código errado/.test(texto(env, "chkRtMsg")) && S.registro(id).situacao === "NA_SALA", "o código antigo é recusado");
    env.e("chkRtCodigo").value = novo;
    await enviarRetirada(env);
    confere(S.registro(id).situacao === "RETIRADA", "o código novo retira");
    limpo(env, "Segunda via/confirmar", []);
  });

  cenario("Segunda via de criança travada destrava; confirmar depois de expirar mostra a recusa; sem pedido a tela só atualiza", async () => {
    const c = await salaPronta(); const { S, env } = c;
    const a = await semear(c, { menorId: 101, trouxeMembroId: 201, travado: true, tentativas: 5 });
    const id = a.registroId;
    confere(seloDe(cartao(env, id), "Travada"), "a criança começa travada");
    env.doc.clicar(env.e(`chkSegVia${id}`)); await env.ocioso();
    env.doc.escolher(env.e("chkSvQuem"), "RESP:201"); env.e("chkSvDoc").value = "CNH";
    env.doc.disparar(env.e("chkSvForm"), "submit"); await env.ocioso();
    S.definirSessao({ membroId: 42, lideranca: false, gestao: false }); env.sessao({ matricula: 42, pin: true });
    await abrirSalaMeu(env);
    // o pedido expira antes de confirmar: a tela ainda mostra o botão (leitura velha), o servidor recusa
    S.agoraMs += 11 * MIN;
    env.limparRegistro();
    await clicarEResponder(env, env.e(`chkConfSegVia${id}`), true);
    confere(/Não há pedido de segunda via aguardando confirmação/.test(texto(env, "chkSalaMsg")) && !env.e("chkImprimivel"), "pedido vencido: a mensagem do servidor aparece e nenhuma etiqueta abre");
    confere(chamadas(env, "GET checkin-infantil/sala").length >= 1 && !botoes(cartao(env, id)).some(t => /Confirmar a segunda via/.test(t)), "a sala é lida de novo e o botão de confirmar some");
    // pedir de novo (agora pela Bia) e a voluntária 41 confirma: a criança destrava
    env.doc.clicar(env.e(`chkSegVia${id}`)); await env.ocioso();
    env.doc.escolher(env.e("chkSvQuem"), "RESP:201"); env.e("chkSvDoc").value = "RG";
    env.doc.disparar(env.e("chkSvForm"), "submit"); await env.ocioso();
    S.definirSessao({ membroId: 41, lideranca: false, gestao: false }); env.sessao({ matricula: 41, pin: true });
    await abrirSalaMeu(env);
    await clicarEResponder(env, env.e(`chkConfSegVia${id}`), true);
    confere(!!env.e("chkImprimivel") && S.registro(id).travado === false, "a segunda via emitida destrava a criança");
    confere(!seloDe(cartao(env, id), "Travada") && botoes(cartao(env, id)).some(t => /Retirar/.test(t)), "o cartão deixa de mostrar 'travada' e o botão Retirar volta");
    // a ação chamada sem pedido pendente só atualiza a sala (nenhuma pergunta)
    env.limparRegistro();
    await env.ev(`chkConfirmarSegundaViaAcao(${id}, null)`); await env.ocioso();
    confere(!env.modal().aberto && chamadas(env, "POST checkin-infantil/segunda-via-confirmar").length === 0 && chamadas(env, "GET checkin-infantil/sala").length === 1, "sem pedido pendente: nenhuma pergunta, nenhum envio, só uma leitura da sala");
  });
};
