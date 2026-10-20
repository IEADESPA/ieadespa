// cenarios-extra-d.js — o restante da correção da revisão adversarial (F16 a F22) e as mudanças que dependem do servidor: o voluntário não vê o motivo de não contar na proporção, encerrar a sala
// (baixa administrativa, só liderança), nome e documento no cartão da segunda via, motivo opcional do pedido de retirada divergente, o aviso "a liderança não foi avisada", a baixa no histórico e no relatório.
"use strict";

module.exports = function registrar(H) {
  const { cenario, confere, montar, limpo, achar, descendentes, chamadas, texto, visivel, clicarEResponder, esperar, esperaChegar, abrirMeuPainel, abrirSalaMeu, abrirAbaGestao, abrirSalaGestao,
    salaPronta, buscar, adicionarMembro, escolherQuemTrouxe, preencherOutraPessoa, enviarCheckin, checkinDoPedro, cartao, seloDe, botoes, F, ATAQUE, MIN, imprimir } = H;

  const GESTOR = { membroId: 9, lideranca: true, gestao: true };
  const FORA_DO_AR = { status: 500, corpo: { sucesso: false, mensagem: "Erro interno ao processar o check-in infantil." } };
  const toastsComTipo = (env) => [...env.e("toastContainer").children].map(t => ({ texto: t.textContent, erro: /toast-erro/.test(t.className) }));
  const fatorSim = (c) => { c.env.ctx.__fatorConfirmar = async () => { c.S.fatorFresco = true; return true; }; };
  const FECHADA = Date.parse("2026-10-15T20:30:00.000Z");   // 17:30 em Brasília: o check-in fechou
  // as linhas (células de texto) de uma tabela do relatório: 0 = voluntários, 1 = crianças, 2 = tudo o que foi registrado (padrão: a última)
  const linhasDaUltimaTabela = (env, raizId, indice = -1) => {
    const tabelas = descendentes(env.e(raizId)).filter(x => x.localName === "table");
    const t = tabelas[indice < 0 ? tabelas.length + indice : indice];
    return t ? descendentes(t).filter(x => x.localName === "tr").slice(1).map(tr => descendentes(tr).filter(x => x.localName === "td").map(td => td.textContent)) : [];
  };

  // ============================================================================================================================================
  // F16 — o Detalhe do relatório em português
  // ============================================================================================================================================
  cenario("F16: o 'Detalhe' do relatório sai em português (tela e papel); o que não se conhece passa como veio; a função é pura", async () => {
    const c = montar({ sessao: GESTOR }); const { S, env } = c;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 });
    const eventos = [["CHECKIN", "adultos=2;criancas=3"], ["CHECKIN", "adultos=1;criancas=1"], ["SALA_RECUSOU_CHECKIN", "ADULTOS_INSUFICIENTES;adultos=1;criancas=4"], ["SALA_RECUSOU_CHECKIN", "SALA_CHEIA;adultos=2;criancas=10"],
      ["SALA_RECUSOU_CHECKIN", "SEM_FAIXA;adultos=2;criancas=0"], ["CODIGO_ERRADO", "tentativa=2/5"], ["CRIANCA_TRAVADA", "erros=5"], ["CRIANCA_TRAVADA", "erros=1"], ["SEGUNDA_VIA_EMITIDA", "geracao=2"],
      ["RETIRADA", "RESPONSAVEL"], ["RETIRADA", "AUTORIZADO"], ["RETIRADA", "TROUXE"], ["RETIRADA", "OUTRO"], ["BAIXA_ADMINISTRATIVA", "BAIXA_ADM"], ["SALA_ENCERRADA", "baixadas=3"], ["SALA_ENCERRADA", "baixadas=1"], ["BAIXA_ADMINISTRATIVA", "RETIRADA_PENDENTE"], ["SALA_ENCERRADA", "baixadas=0;voluntarios=2"],
      ["VOLUNTARIO_SAIU", "retirado pela liderança"], ["VOLUNTARIO_SAIU", "XPTO_NOVO"], ["CODIGO_ERRADO", "chave=valor"], ["CODIGO_ERRADO", null]];
    eventos.forEach(([tipo, detalhe], i) => S.eventos.push({ eventoId: 9000 + i, registroId: a.registroId, servicoId: 501, equipeId: 31, tipo, ator: 42, em: S.agoraMs, detalhe }));
    await abrirSalaGestao(env);
    env.doc.clicar(env.e("chkRelatorioBotao")); await env.ocioso();
    const detalhes = linhasDaUltimaTabela(env, "chkRelImprimivel").map(l => l[3]);
    const esperado = ["2 adultos presentes; 3 crianças na sala", "1 adulto presente; 1 criança na sala", "adultos insuficientes; 1 adulto presente; 4 crianças na sala", "sala cheia; 2 adultos presentes; 10 crianças na sala",
      "sala sem faixa etária; 2 adultos presentes; 0 crianças na sala", "tentativa 2 de 5", "5 erros seguidos no código", "1 erro seguido no código", "código novo (versão 2)", "responsável cadastrado", "pessoa autorizada", "quem trouxe",
      "outra pessoa", "baixa administrativa", "3 crianças com baixa", "1 criança com baixa", "estava aguardando a liderança", "0 crianças com baixa; 2 voluntários saíram da sala", "retirado pela liderança", "xpto novo", "chave=valor", ""];
    confere(detalhes.length === eventos.length + 1 && JSON.stringify(detalhes.slice(1)) === JSON.stringify(esperado), `o Detalhe de cada ato em português: ${JSON.stringify(detalhes.slice(1)).slice(0, 400)}`);
    confere(/1 adulto presente; 1 criança na sala/.test(detalhes[0]), "o check-in da criança semeada também (singular)");
    confere(!/adultos=|criancas=|tentativa=|geracao=|erros=|baixadas=|RESPONSAVEL|BAIXA_ADM|ADULTOS_INSUFICIENTES/.test(env.e("chkRelImprimivel").textContent), "nenhum texto de máquina sobra no relatório (que é o que vai ao papel)");
    const f = (x) => env.ev(`chkTraduzirDetalhe(${JSON.stringify(x)})`);
    confere(f(null) === "" && f("") === "" && f("   ") === "" && f(undefined) === "" && f("adultos=2") === "2 adultos presentes" && f("tentativa=3/5") === "tentativa 3 de 5" && f(" adultos=1 ; criancas=2 ") === "1 adulto presente; 2 crianças na sala", "a função pura: vazio, espaços e partes soltas");
    confere(f("adultos=2;;criancas=3") === "2 adultos presentes; 3 crianças na sala" && f(`RESPONSAVEL ${ATAQUE("t_detalhe")}`) === `RESPONSAVEL ${ATAQUE("t_detalhe")}`, "parte vazia some; texto que só PARECE código passa como veio (nada é executado: entra por textContent)");
  });

  // ============================================================================================================================================
  // F17 — acessibilidade: a quem se refere cada botão repetido
  // ============================================================================================================================================
  cenario("F17: 'Revogar', 'Remover', 'Adicionar' e 'Tirar da sala' dizem a quem se referem (aria-label com o nome, escapado); aria-expanded leva aria-controls", async () => {
    // Meus filhos
    const r = montar({ sessao: { membroId: 201 }, ataque: true });
    r.S.membros[0].autorizados.push({ autorizadoId: 777, nome: ATAQUE("autz"), parentesco: "TIO", membroId: null, validoAte: null, forma: "RESPONSAVEL", referencia: null, registradoEm: r.S.agoraMs });
    await abrirMeuPainel(r.env);
    for (const sec of ["Hist", "Aut", "Sau"]) {
      const b = r.env.e(`chkFhBtn${sec}101`);
      confere(!!b && b.getAttribute("aria-expanded") === "false" && b.getAttribute("aria-controls") === `chkFh${sec}101` && !!r.env.e(`chkFh${sec}101`), `o botão ${sec} do filho tem aria-controls apontando para uma seção que existe`);
    }
    r.env.doc.clicar(r.env.e("chkFhBtnAut101")); await r.env.ocioso();
    const rev = r.env.e("chkFhAutRev777");
    confere(!!rev && rev.getAttribute("aria-label") === `Revogar a autorização de ${ATAQUE("autz")}`, "Revogar: o aria-label diz a autorização de quem (o nome inteiro, como texto)");
    limpo(r.env, "F17/revogar", []);
    // a equipe da sala: Adicionar (busca), Remover (lista da entrada)
    const c = await salaPronta({ ataque: true }); const { env } = c;
    const nomePedro = `Pedro Souza ${ATAQUE("menor101")}`;
    await buscar(env, "Pedro");
    confere(env.e("chkAdd101").getAttribute("aria-label") === `Adicionar ${nomePedro} a esta entrada`, "Adicionar: o aria-label diz quem");
    await adicionarMembro(env, 101);
    const remover = descendentes(env.e("chkChip0")).find(x => x.localName === "button");
    confere(!!remover && remover.getAttribute("aria-label") === `Remover ${nomePedro} desta entrada` && remover.textContent === "Remover", "Remover: o aria-label diz quem, e o texto visível continua curto");
    limpo(env, "F17/equipe", []);
    // a liderança: Tirar da sala
    const g = montar({ sessao: GESTOR, ataque: true });
    await abrirSalaGestao(g.env);
    const tirar = g.env.e("chkTirar42");
    confere(!!tirar && tirar.getAttribute("aria-label") === `Tirar Bia Voluntária ${ATAQUE("vol42")} da sala`, "Tirar da sala: o aria-label diz quem");
    limpo(g.env, "F17/liderança", []);
  });

  cenario("F17: o alerta das pendências (role=alert) só é recriado quando o texto muda — não é reanunciado a cada leitura da sala", async () => {
    const c = await salaPronta(); const { S, env } = c;
    S.semear({ menorId: 101, trouxeMembroId: 201, travado: true, tentativas: 5 });
    await env.ev("chkLerSala(true)"); await env.ocioso();
    const alerta = env.e("chkSalaPendencias").children[0];
    confere(!!alerta && alerta.getAttribute("role") === "alert" && /1 criança\(s\) travada/.test(alerta.textContent), "uma criança travada: o alerta aparece");
    S.semear({ menorId: 102, trouxeMembroId: 201 });   // muda a lista de crianças, não as pendências
    await env.ev("chkLerSala(true)"); await env.ocioso();
    confere(!!cartao(env, S.registros[S.registros.length - 1].registroId) && env.e("chkSalaPendencias").children[0] === alerta, "a lista mudou, as pendências não: o MESMO elemento de alerta (o leitor de tela não reanuncia)");
    env.tique(); await env.ocioso();
    confere(env.e("chkSalaPendencias").children[0] === alerta, "uma atualização automática sem mudança também não o recria");
    S.semear({ menorId: 104, trouxeMembroId: 203, travado: true, tentativas: 5 });
    await env.ev("chkLerSala(true)"); await env.ocioso();
    const novo = env.e("chkSalaPendencias").children[0];
    confere(novo !== alerta && /2 criança\(s\) travada/.test(novo.textContent) && novo.getAttribute("role") === "alert", "o texto mudou (duas travadas): o alerta é recriado e anunciado");
    S.registros.forEach(r => { r.travado = false; });
    await env.ev("chkLerSala(true)"); await env.ocioso();
    confere(env.e("chkSalaPendencias").innerHTML === "", "sem pendências o alerta some");
    S.semear({ menorId: 105, trouxeMembroId: 204, travado: true, tentativas: 5 });
    await env.ev("chkLerSala(true)"); await env.ocioso();
    confere(/1 criança\(s\) travada/.test(texto(env, "chkSalaPendencias")), "e volta quando a pendência volta (o texto igual ao de antes do vazio também é refeito)");
  });

  // ============================================================================================================================================
  // F19 — a busca devolve no máximo 8
  // ============================================================================================================================================
  cenario("F19: a busca limitada a 8 — com 8 resultados a tela avisa que pode haver mais e manda afinar; com menos, só conta", async () => {
    const c = await salaPronta(); const { S, env } = c;
    const novo = (menorId, nome) => ({ menorId, nome, nascimento: "2022-03-10", idade: 4, congregacao: "Sede", responsaveis: [], autorizados: [], saude: null, consentimento: false });
    for (let i = 0; i < 10; i++) S.membros.push(novo(300 + i, `Zeca Teste ${i}`));
    for (let i = 0; i < 7; i++) S.membros.push(novo(400 + i, `Maia Teste ${i}`));
    await buscar(env, "Zeca");
    const n = () => descendentes(env.e("chkCiResultados")).filter(x => /^chkRes\d+$/.test(x.id)).length;
    confere(n() === 8 && texto(env, "chkCiBuscaMsg") === "Mostrando até 8 crianças: digite mais letras do nome para afinar a busca.", `com 8 resultados: ${texto(env, "chkCiBuscaMsg")}`);
    await buscar(env, "Maia");
    confere(n() === 7 && texto(env, "chkCiBuscaMsg") === "7 criança(s) encontrada(s).", `com 7 resultados só conta: ${texto(env, "chkCiBuscaMsg")}`);
    await buscar(env, "Zeca Teste 1");
    confere(n() === 1 && texto(env, "chkCiBuscaMsg") === "1 criança(s) encontrada(s).", "afinando, a mensagem volta ao normal");
    confere(/psc-aviso/.test(env.e("chkCiBuscaMsg").className) === false, "(sem destaque de erro: é um aviso de ajuda)");
  });

  // ============================================================================================================================================
  // F20 — o catálogo em Fichas assinadas e Meus filhos
  // ============================================================================================================================================
  cenario("F20: Meus filhos → 'Quem pode retirar' sem o catálogo avisa (e não mostra o formulário com o parentesco vazio); a seção reaberta busca o catálogo", async () => {
    const r = montar({ sessao: { membroId: 201 } });
    r.env.api.rotas["GET checkin-infantil/catalogos"] = FORA_DO_AR;
    await abrirMeuPainel(r.env);
    confere(r.env.g("chkCatalogos") === null, "o catálogo não carregou");
    r.env.doc.clicar(r.env.e("chkFhBtnAut101")); await r.env.ocioso();
    confere(texto(r.env, "chkFhAut101") === "Não consegui carregar as opções do check-in. Feche esta parte, abra de novo e tente outra vez." && !r.env.e("chkFhAutPar101") && !r.env.e("chkFhAutEnviar101"), "aviso no lugar da seção, sem o formulário (os parentescos viriam vazios)");
    confere(/psc-aviso/.test(descendentes(r.env.e("chkFhAut101")).map(x => x.className).join(" ")), "o aviso é em destaque");
    delete r.env.api.rotas["GET checkin-infantil/catalogos"];
    r.env.doc.clicar(r.env.e("chkFhBtnAut101")); await r.env.ocioso();   // fecha
    r.env.doc.clicar(r.env.e("chkFhBtnAut101")); await r.env.ocioso();   // abre de novo
    confere(!!r.env.e("chkFhAutPar101") && r.env.e("chkFhAutPar101").options.length > 3 && r.env.g("chkCatalogos") !== null, "reaberta, a seção busca o catálogo e mostra o formulário com os parentescos");
    // o erro do servidor na lista (403) continua mostrando a mensagem DELE, não a do catálogo
    const d = montar({ sessao: { membroId: 201 } });
    d.env.api.rotas["GET checkin-infantil/catalogos"] = FORA_DO_AR;
    d.env.api.rotas["GET checkin-infantil/autorizados"] = { status: 403, corpo: { sucesso: false, mensagem: "Sem acesso a esta criança." } };
    await abrirMeuPainel(d.env);
    d.env.doc.clicar(d.env.e("chkFhBtnAut101")); await d.env.ocioso();
    confere(/Sem acesso a esta criança/.test(texto(d.env, "chkFhAut101")), "com os dois a falhar, vale a mensagem do servidor sobre a lista");
  });

  cenario("F20: Fichas assinadas sem o catálogo avisa e não monta a ficha; tocar em Buscar de novo (com o catálogo de volta) monta", async () => {
    const g = montar({ sessao: GESTOR });
    g.env.api.rotas["GET checkin-infantil/catalogos"] = FORA_DO_AR;
    await abrirAbaGestao(g.env);
    g.env.doc.clicar(g.env.e("btnChkSecaoFichas")); await g.env.ocioso();
    const buscarFicha = () => achar(g.env, x => x.localName === "button" && x.getAttribute("data-on-click") === "chkFichaBuscarAcao");
    g.env.e("chkFiMatricula").value = "101";
    g.env.doc.clicar(buscarFicha()); await g.env.ocioso();
    confere(texto(g.env, "chkFichaMsg") === "Não consegui carregar as opções do check-in. Toque em “Buscar” de novo." && /psc-aviso/.test(g.env.e("chkFichaMsg").className) && g.env.e("chkFichaCx").innerHTML === "", "sem o catálogo: o aviso, e nenhuma ficha com parentesco vazio");
    delete g.env.api.rotas["GET checkin-infantil/catalogos"];
    g.env.doc.clicar(buscarFicha()); await g.env.ocioso();
    confere(texto(g.env, "chkFichaMsg") === "" && !!g.env.e("chkFiAutPar101") && g.env.e("chkFiAutPar101").options.length > 3, "com o catálogo de volta a ficha monta e o parentesco tem opções");
    // com a ficha montada, o catálogo some e a lista de autorizados é refeita: o aviso da ficha, não o do filho
    g.env.api.rotas["GET checkin-infantil/catalogos"] = FORA_DO_AR; g.env.ev("chkCatalogos = null");
    await g.env.ev("chkCarregarAutorizados(\"Fi\", 101)"); await g.env.ocioso();
    confere(texto(g.env, "chkFiAut101") === "Não consegui carregar as opções do check-in. Toque em “Buscar” de novo.", `a lista da ficha refeita sem o catálogo: o aviso da ficha (${texto(g.env, "chkFiAut101")})`);
  });

  // ============================================================================================================================================
  // F21 — o módulo velho no cache não derruba Meus Dados
  // ============================================================================================================================================
  cenario("F21: meu-painel.js só chama o cartão do check-in de Meus Dados com a guarda 'typeof' (o ministerio-menores.js velho no cache não o tem)", async () => {
    const painel = montar().env.lerMutado("modulos/meu-painel.js");
    const chamadas = painel.split("mnrCartaoCheckinMeusDados(").length - 1;
    const guardadas = painel.split("typeof mnrCartaoCheckinMeusDados === \"function\" ? mnrCartaoCheckinMeusDados(").length - 1;
    confere(chamadas === 1 && guardadas === 1, `a única chamada leva a guarda typeof (${chamadas} chamada(s), ${guardadas} guardada(s))`);
    // o mesmo padrão nas ligações do módulo com o resto do app (script.js, meus-dados.js): toda chamada a função do módulo tem a guarda
    const ler = montar().env.lerMutado;
    const semGuarda = [];
    for (const [arquivo, nomes] of [["script.js", ["chkLimparTela", "chkSubAbaMudou", "chkCarregarMeuPainelAcao"]], ["modulos/meus-dados.js", ["chkAbaMudou", "chkCarregarOpcoesAcao"]]]) {
      const t = ler(arquivo);
      for (const n of nomes) for (const linha of t.split("\n")) if (new RegExp(`(^|[^A-Za-z0-9_.])${n}\\(`).test(linha) && !new RegExp(`typeof ${n} === "function"`).test(linha) && !/^\s*(async )?function /.test(linha)) semGuarda.push(`${arquivo}: ${linha.trim().slice(0, 80)}`);
    }
    confere(semGuarda.length === 0, `nenhuma chamada ao módulo do check-in sem guarda: ${semGuarda.join(" | ")}`);
  });

  // ============================================================================================================================================
  // F22 — textos
  // ============================================================================================================================================
  cenario("F22: nenhum número de status HTTP na tela; 'resposta inesperada' virou frase em português; 'errado vezes demais' foi corrigida", async () => {
    const c = await salaPronta(); const { S, env } = c;
    // 200 que não é JSON numa leitura (não é o check-in: ali a frase é a da conexão)
    env.api.rotas["POST checkin-infantil/buscar"] = { status: 200, corpo: "<html>x</html>", naoJson: true };
    env.e("chkCiBusca").value = "Ped"; env.doc.clicar(env.e("chkCiBuscar")); await env.ocioso();
    confere(texto(env, "chkCiBuscaMsg") === "Não consegui entender a resposta do servidor. Tente de novo.", `a frase: ${texto(env, "chkCiBuscaMsg")}`);
    confere(!/\d{3}|inesperada/.test(texto(env, "chkCiBuscaMsg")), "sem número de status, sem 'inesperada'");
    delete env.api.rotas["POST checkin-infantil/buscar"];
    const modulo = env.lerMutado("modulos/checkin-infantil.js");
    confere(!/Resposta inesperada/.test(modulo) && !/\$\{res\.status\}/.test(modulo), "o módulo não monta texto com o status HTTP");
    // criança travada para quem opera
    S.semear({ menorId: 101, trouxeMembroId: 201, travado: true, tentativas: 5 });
    await env.ev("chkLerSala(true)"); await env.ocioso();
    const t = texto(env, "chkCiLista") + env.e("chkNaSalaLista").textContent;
    confere(/O código foi digitado errado muitas vezes\. Peça à liderança para destravar ou emita a segunda via do código\./.test(t) && !/errado vezes demais/.test(t), "criança travada: frase correta para quem opera");
    // a liderança vê o outro texto
    const g = montar({ sessao: GESTOR }); g.S.semear({ menorId: 101, trouxeMembroId: 201, travado: true, tentativas: 5 });
    await abrirSalaGestao(g.env);
    confere(/Confirme quem está retirando e destrave, ou emita a segunda via\./.test(g.env.e("chkNaSalaLista").textContent) && !/errado/.test(g.env.e("chkNaSalaLista").textContent.replace(/Código errado/g, "")), "a liderança vê o texto dela");
  });

  // ============================================================================================================================================
  // O servidor mudou (1): o voluntário não recebe "apto" — a tela não diz o motivo de não contar
  // ============================================================================================================================================
  cenario("Servidor (1): quem não conta na proporção aparece só como 'não conta na proporção agora' — para o operador (sem 'apto') e para a liderança (que recebe 'apto', mas a tela não o usa)", async () => {
    const g = montar({ sessao: GESTOR }); g.S.entrar(g.S.salas[0], 45); g.S.entrar(g.S.salas[0], 44);
    const lido = (S) => S.responder({ metodo: "GET", caminho: "checkin-infantil/sala", consulta: { servicoId: "501", equipeId: "31" }, corpo: null }).corpo;
    confere(lido(g.S).adultosPresentes.some(v => v.apto === false), "(o servidor simulado manda 'apto' à liderança)");
    await abrirSalaGestao(g.env);
    const vol = texto(g.env, "chkSalaVoluntarios");
    confere(vol.includes("Edu Sem Habilitação") && vol.includes("Duda Auxiliar") && (vol.match(/não conta na proporção agora/g) || []).length === 2 && !/apto|auxiliar: não conta|⚠/.test(vol), "a liderança, que recebe 'apto', também vê só 'não conta na proporção agora' nos dois");
    confere(/conta como adulto/.test(vol), "e quem conta continua 'conta como adulto'");
    const o = await salaPronta(); o.S.entrar(o.S.salas[0], 45);
    const s = lido(o.S);
    confere(s.adultosPresentes.length >= 3 && s.adultosPresentes.every(v => !("apto" in v)), "(o servidor simulado NÃO manda 'apto' ao operador)");
    await o.env.ev("chkLerSala(true)"); await o.env.ocioso();
    confere((texto(o.env, "chkSalaVoluntarios").match(/não conta na proporção agora/g) || []).length === 1 && !/apto/.test(texto(o.env, "chkSalaVoluntarios")), "o operador vê o mesmo, sem nenhum motivo");
  });

  // ============================================================================================================================================
  // O servidor mudou (2): encerrar a sala
  // ============================================================================================================================================
  cenario("Servidor (2): encerrar a sala — o botão só aparece para a liderança, na aba dela, com a janela fechada e criança na sala; motivo, confirmação, baixa e o que a tela mostra depois", async () => {
    const c = montar({ sessao: GESTOR }); const { S, env } = c;
    S.semear({ menorId: 101, trouxeMembroId: 201 }); S.semear({ menorId: 102, trouxeMembroId: 201 });
    await abrirSalaGestao(env);
    confere(!env.e("chkEncerrarBotao"), "com a janela aberta não há o botão");
    S.agoraMs = FECHADA; await env.ev("chkLerSala(true)"); await env.ocioso();
    const b = env.e("chkEncerrarBotao");
    confere(!!b && b.textContent.includes("Encerrar a sala (dar baixa nas crianças que ficaram)") && b.getAttribute("data-on-click") === "chkEncerrarSalaAcao", "janela fechada e crianças na sala: o botão aparece");
    confere(/btn-perigo/.test(b.className) && JSON.stringify(JSON.parse(b.getAttribute("data-args-click"))) === JSON.stringify([{ $: "this" }]), "é um botão de perigo e leva só o próprio botão como argumento");
    // a lista refeita (chegou outra criança) não tira o foco do botão
    env.e("chkEncerrarBotao").focus(); S.semear({ menorId: 104, trouxeMembroId: 203 }); env.tique(); await env.ocioso();
    confere(!!env.e("chkEncerrarBotao") && env.foco() === env.e("chkEncerrarBotao"), "a lista refeita não tira o foco do botão de encerrar");
    // cancelar o motivo: nada é enviado e o foco volta ao botão
    env.limparRegistro(); env.e("chkEncerrarBotao").focus(); env.doc.clicar(env.e("chkEncerrarBotao"));
    const t0 = await env.responderTexto(null); await env.ocioso();
    confere(t0.aberto && /Motivo para encerrar a sala \(de 5 a 300 caracteres\)/.test(t0.titulo) && chamadas(env, "POST checkin-infantil/encerrar-sala").length === 0 && env.foco() === env.e("chkEncerrarBotao"), "o motivo é pedido (de 5 a 300 caracteres); cancelar não envia nada e o foco volta ao botão");
    // motivo curto e motivo com < >: volta a pedir
    env.doc.clicar(env.e("chkEncerrarBotao"));
    await env.responderTexto("abc"); await env.ocioso();
    confere(env.toasts().includes("Escreva o motivo com 5 a 300 caracteres, sem < ou >.") && env.modal().aberto && /Motivo para encerrar a sala/.test(env.modal().texto), "motivo curto demais: a tela explica e pergunta de novo");
    await env.responderTexto("culto <b>acabou</b>"); await env.ocioso();
    confere(env.modal().aberto && env.e("modalTexto").value === "culto <b>acabou</b>", "motivo com < ou >: pergunta de novo, com o que foi escrito");
    await env.responderTexto("x".repeat(301)); await env.ocioso();
    confere(env.modal().aberto && /Motivo para encerrar a sala/.test(env.modal().texto), "motivo de mais de 300 caracteres: pergunta o motivo de novo (não passa para a confirmação)");
    await env.responderTexto(null); await env.ocioso();
    confere(chamadas(env, "POST checkin-infantil/encerrar-sala").length === 0, "nenhuma das tentativas inválidas chegou ao servidor");
    // motivo bom, mas a confirmação é cancelada
    env.doc.clicar(env.e("chkEncerrarBotao"));
    await env.responderTexto("  Culto terminou; famílias já saíram.  ");
    const m1 = await env.responderModal(false); await env.ocioso();
    confere(m1.aberto && m1.texto.includes("Dar baixa em 3 criança(s) que ficaram na sala e encerrar a sala? Isto fica registrado com o seu nome."), `a confirmação diz quantas crianças e que fica registrado: ${m1.texto}`);
    confere(chamadas(env, "POST checkin-infantil/encerrar-sala").length === 0 && S.registros.every(r => r.situacao === "NA_SALA"), "cancelar a confirmação não envia nada");
    // confirmar
    env.limparRegistro();
    env.doc.clicar(env.e("chkEncerrarBotao"));
    await env.responderTexto("  Culto terminou; famílias já saíram.  "); await env.responderModal(true); await env.ocioso();
    const p = chamadas(env, "POST checkin-infantil/encerrar-sala");
    confere(p.length === 1 && JSON.stringify(p[0].corpo) === JSON.stringify({ servicoId: 501, equipeId: 31, motivo: "Culto terminou; famílias já saíram." }), `o corpo leva os dois ids como número e o motivo sem os espaços das pontas: ${JSON.stringify(p[0] && p[0].corpo)}`);
    confere(S.registros.every(r => r.situacao === "RETIRADA" && r.retiradoTipo === "BAIXA_ADM" && r.baixaMotivo === "Culto terminou; famílias já saíram.") && S.encerramentos === 1, "o servidor deu a baixa nas duas crianças, com o motivo");
    confere(/Sala encerrada: 3 criança\(s\)/.test(texto(env, "chkSalaMsg")) && /Nenhuma criança na sala agora/.test(texto(env, "chkNaSalaLista")), "a mensagem do servidor aparece e a sala foi lida de novo (vazia)");
    confere(!env.e("chkEncerrarBotao") && env.e("chkEncerrarCx").innerHTML === "", "sem criança na sala o botão some");
    confere(chamadas(env, "GET checkin-infantil/sala").length >= 1, "a tela leu a sala depois");
    // o relatório mostra a baixa e o motivo (a liderança lê)
    env.doc.clicar(env.e("chkRelatorioBotao")); await env.ocioso();
    const linhas = linhasDaUltimaTabela(env, "chkRelImprimivel");
    const rel = env.e("chkRelImprimivel").textContent;
    const criancas = linhasDaUltimaTabela(env, "chkRelImprimivel", 1);
    confere(criancas.length === 3 && criancas.every(l => l[5] === "Baixa administrativa (sem retirada registrada)" && l[7] === "—" && l[9] === "Baixa: Culto terminou; famílias já saíram."), `no relatório cada criança aparece com 'Baixa administrativa (sem retirada registrada)', ninguém em 'Quem retirou' e o motivo da baixa: ${JSON.stringify(criancas[0])}`);
    confere(linhas.some(l => /Sala encerrada pela liderança/.test(l[1]) && l[3] === "3 crianças com baixa; 1 voluntário saiu da sala") && linhas.filter(l => /Baixa administrativa/.test(l[1]) && l[3] === "estava na sala").length === 3 && linhas.some(l => /saiu da sala/.test(l[1]) && l[3] === "sala encerrada pela liderança"), "os atos de baixa (um por criança, 'estava na sala'), a saída do voluntário e a sala encerrada ('3 crianças com baixa; 1 voluntário saiu da sala') aparecem em português");
    confere(/Motivos registrados/.test(rel), "a tabela das crianças tem a coluna dos motivos que a liderança escreveu");
  });

  cenario("Servidor (2): encerrar — só a liderança, só a aba dela, só com a senha de liderança; duplo clique vira um pedido; 428 (confirmação reforçada); recusa do servidor", async () => {
    // quem opera a sala (PIN): nem o espaço do botão existe, e a ação chamada direto não faz nada
    const o = await salaPronta(); o.S.semear({ menorId: 101, trouxeMembroId: 201 }); o.S.agoraMs = FECHADA;
    await o.env.ev("chkLerSala(true)"); await o.env.ocioso();
    confere(!o.env.e("chkEncerrarCx") && !o.env.e("chkEncerrarBotao"), "o operador (PIN) não tem o botão");
    o.env.limparRegistro(); await esperar(o.env.ev("chkEncerrarSalaAcao(null)")); await o.env.ocioso();
    confere(!o.env.modal().aberto && chamadas(o.env, "POST checkin-infantil/encerrar-sala").length === 0, "chamada direto por quem não é da liderança: nem pergunta, nem envia");
    // a liderança que é da equipe e abriu a sala pelo Meu Painel: a ação é da aba da liderança
    const m = montar({ sessao: GESTOR }); m.S.salas[0].escalados.push(9); m.S.entrar(m.S.salas[0], 9); m.S.semear({ menorId: 101, trouxeMembroId: 201 }); m.S.agoraMs = FECHADA;
    await abrirSalaMeu(m.env);
    confere(m.env.g("chkSala").ehGestao === true && m.env.g("chkSala").ctx === "Meu" && !m.env.e("chkEncerrarBotao"), "pelo Meu Painel (não é a aba da liderança) o botão não aparece, mesmo sendo liderança");
    await esperar(m.env.ev("chkEncerrarSalaAcao(null)")); await m.env.ocioso();
    confere(!m.env.modal().aberto, "e a ação direta também não faz nada ali");
    // sem a senha de liderança na sessão (o botão que já estava na tela não vale mais)
    const g = montar({ sessao: GESTOR }); g.S.semear({ menorId: 101, trouxeMembroId: 201 }); g.S.agoraMs = FECHADA;
    await abrirSalaGestao(g.env);
    confere(!!g.env.e("chkEncerrarBotao"), "a liderança vê o botão");
    g.env.ev("authPermissoes = []; authNivel = null");
    await esperar(g.env.ev("chkEncerrarSalaAcao(null)")); await g.env.ocioso();
    confere(!g.env.modal().aberto, "com a sessão já sem os papéis de liderança, a ação chamada direto não pergunta");
    g.env.sessao({ matricula: 9, pin: false, permissoes: ["habilitacao_voluntarios"] });
    // duplo clique: um pedido só
    const d = montar({ sessao: GESTOR }); d.S.semear({ menorId: 101, trouxeMembroId: 201 }); d.S.agoraMs = FECHADA;
    await abrirSalaGestao(d.env);
    const presa = d.env.retem(x => x.chave === "POST checkin-infantil/encerrar-sala");
    const p1 = d.env.ev("chkEncerrarSalaAcao(null)"); await d.env.responderTexto("Culto terminou há horas."); await d.env.responderModal(true); await esperaChegar(presa);
    const p2 = d.env.ev("chkEncerrarSalaAcao(null)"); await d.env.responderTexto("Culto terminou há horas."); await d.env.responderModal(true); await d.env.ocioso();
    presa.liberar(); await esperar(Promise.all([p1, p2])); await d.env.ocioso(); d.env.api.retencoes.length = 0;
    confere(chamadas(d.env, "POST checkin-infantil/encerrar-sala").length === 1 && d.env.toasts().some(t => /Aguarde/.test(t)) && d.S.encerramentos === 1, "duas vezes seguidas: um pedido só e o aviso 'Aguarde'");
    // 428: a confirmação reforçada recusada mostra o texto da tela; aceita, o pedido é repetido
    const f = montar({ sessao: GESTOR }); f.S.semear({ menorId: 101, trouxeMembroId: 201 }); f.S.agoraMs = FECHADA; f.S.fatorEncerrar = true;
    await abrirSalaGestao(f.env);
    f.env.ctx.__fatorConfirmar = async () => false;
    f.env.doc.clicar(f.env.e("chkEncerrarBotao")); await f.env.responderTexto("Culto terminou há horas."); await f.env.responderModal(true); await f.env.ocioso();
    confere(/Este ato precisa de uma confirmação recente de quem você é/.test(texto(f.env, "chkSalaMsg")) && f.S.registros.every(r => r.situacao === "NA_SALA") && !!f.env.e("chkEncerrarBotao"), "428 não confirmado: a frase da tela, ninguém recebe baixa e o botão continua");
    fatorSim(f);
    f.env.doc.clicar(f.env.e("chkEncerrarBotao")); await f.env.responderTexto("Culto terminou há horas."); await f.env.responderModal(true); await f.env.ocioso();
    confere(chamadas(f.env, "POST checkin-infantil/encerrar-sala").length === 3 && f.S.encerramentos === 1 && f.S.registros.every(r => r.situacao === "RETIRADA"), "428 confirmado: o pedido é repetido uma vez (três pedidos no total: o recusado antes, o recusado agora e o repetido) e a baixa acontece uma vez");
    // recusa de regra do servidor (a janela ainda aberta no servidor): a mensagem dele, em destaque, e a criança fica
    const h = montar({ sessao: GESTOR }); h.S.semear({ menorId: 101, trouxeMembroId: 201 }); h.S.agoraMs = FECHADA;
    await abrirSalaGestao(h.env);
    h.S.agoraMs = Date.parse("2026-10-15T12:30:00.000Z");   // o relógio do servidor discorda: a janela está aberta
    h.env.doc.clicar(h.env.e("chkEncerrarBotao")); await h.env.responderTexto("Culto terminou há horas."); await h.env.responderModal(true); await h.env.ocioso();
    confere(/A sala ainda está aberta e há criança nela/.test(texto(h.env, "chkSalaMsg")) && /psc-aviso/.test(h.env.e("chkSalaMsg").className) && h.S.registros.every(r => r.situacao === "NA_SALA"), "a recusa do servidor aparece tal qual, em destaque, e a criança continua na sala");
    confere(!h.env.e("chkEncerrarBotao"), "e, com a janela aberta na leitura nova, o botão some");
  });

  // ============================================================================================================================================
  // O servidor mudou (3): a segunda via — nome e documento no cartão do segundo adulto
  // ============================================================================================================================================
  cenario("Servidor (3): o cartão do segundo adulto mostra quem pediu a segunda via e o documento conferido (escapados); sem os campos, o texto de antes", async () => {
    const c = await salaPronta({ ataque: true }); const { S, env } = c;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 });
    S.vias.push({ viaId: 5001, registroId: a.registroId, pedidaPor: 42, pedidaEm: S.agoraMs, pessoaNome: "Maria Souza", documento: "OUTRO" });
    await env.ev("chkLerSala(true)"); await env.ocioso();
    const t = texto(env, `chkCrianca${a.registroId}`);
    confere(/Segunda via pedida por Maria Souza \(documento conferido por quem pediu: Outro documento com foto\): confira o documento dessa pessoa e confirme\./.test(t),`nome e documento no cartão: ${t.slice(t.indexOf("Segunda via pedida"), t.indexOf("Segunda via pedida") + 130)}`);
    // sem documento, só o nome; sem nada, o texto de antes
    S.vias[0].documento = null; await env.ev("chkLerSala(true)"); await env.ocioso();
    confere(/Segunda via pedida por Maria Souza: confira o documento dessa pessoa e confirme\./.test(texto(env, `chkCrianca${a.registroId}`)) && !/documento conferido por quem pediu/.test(texto(env, `chkCrianca${a.registroId}`)), "sem o documento: só o nome");
    S.vias[0].pessoaNome = null; S.vias[0].documento = "RG"; await env.ev("chkLerSala(true)"); await env.ocioso();
    confere(/Segunda via pedida \(documento conferido por quem pediu: RG\): confira o documento dessa pessoa e confirme\./.test(texto(env, `chkCrianca${a.registroId}`)), "sem o nome: só o documento");
    S.vias[0].documento = null; await env.ev("chkLerSala(true)"); await env.ocioso();
    confere(/Segunda via pedida: confira o documento dessa pessoa e confirme\./.test(texto(env, `chkCrianca${a.registroId}`)), "sem nenhum dos dois: o texto de antes");
    // texto de ataque nos dois campos (o código do documento que a tela não conhece aparece como veio, escapado)
    S.vias[0].pessoaNome = ATAQUE("pessoaVia"); S.vias[0].documento = ATAQUE("docVia"); await env.ev("chkLerSala(true)"); await env.ocioso();
    limpo(env, "Servidor 3", [ATAQUE("pessoaVia"), ATAQUE("docVia")]);
    confere(botoes(cartao(env, a.registroId)).some(x => /Confirmar a segunda via/.test(x)), "o botão de confirmar segue ali");
  });

  // ============================================================================================================================================
  // O servidor mudou (4): motivo opcional do pedido de retirada por quem não está na lista
  // ============================================================================================================================================
  cenario("Servidor (4): 'outra pessoa' ganha o motivo (opcional, de 3 a 300 caracteres, sem < >); vai dentro de 'outro'; o cartão da liderança o mostra (escapado) quando vier", async () => {
    const c = await salaPronta(); const { S, env } = c;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 });
    await env.ev("chkLerSala(true)"); await env.ocioso();
    const abrir = async () => { env.doc.clicar(env.e(`chkRetirar${a.registroId}`)); await env.ocioso(); env.doc.escolher(env.e("chkRtQuem"), "OUTRA"); env.e("chkRtNome").value = "Vizinha Dalva"; env.e("chkRtPar").value = "AMIGO_FAMILIA"; env.e("chkRtDoc").value = "RG"; env.e("chkRtCodigo").value = S.codigoDe(a.registroId); };
    const enviar = async () => { env.limparRegistro(); env.doc.disparar(env.e("chkRtForm"), "submit"); await env.ocioso(); return texto(env, "chkRtMsg"); };
    await abrir();
    const campo = env.e("chkRtMotivo");
    confere(!!campo && campo.localName === "textarea" && campo.getAttribute("maxlength") === "300" && /Motivo \(opcional\)/.test(env.e("chkRtOutraCx").textContent) && descendentes(env.e("chkRtOutraCx")).includes(campo), "o campo do motivo está no bloco de 'outra pessoa', com o limite de 300");
    confere(!visivel(env, "chkRtMotivo") === false, "(e aparece quando 'outra pessoa' é escolhida)");
    const ruim = "O motivo (opcional) aceita de 3 a 300 caracteres, sem < ou >.";
    for (const [valor, rotulo] of [["ab", "curto demais"], ["mandada <pela> mãe", "com < ou >"], ["y".repeat(301), "comprido demais"]]) {
      campo.value = valor;
      const m = await enviar();
      confere(m === ruim && env.foco() === campo && chamadas(env, "POST checkin-infantil/retirar").length === 0, `motivo ${rotulo}: a tela recusa antes de pedir, com o foco no campo`);
    }
    campo.value = "  Mandada pela mãe,   que está no trabalho.  ";
    await enviar();
    const p = chamadas(env, "POST checkin-infantil/retirar");
    confere(p.length === 1 && p[0].corpo.retirante.outro.motivo === "Mandada pela mãe, que está no trabalho." && !("motivo" in p[0].corpo), `o motivo vai DENTRO de retirante.outro, com os espaços arrumados: ${JSON.stringify(p[0] && p[0].corpo.retirante)}`);
    confere(S.registro(a.registroId).situacao === "RETIRADA_PENDENTE" && S.registro(a.registroId).divergenciaPedidoMotivo === "Mandada pela mãe, que está no trabalho.", "o servidor guardou o pedido com o motivo");
    confere(!/Mandada pela mãe/.test(env.e("chkNaSalaLista").textContent), "a tela de quem opera NÃO mostra o motivo (o servidor só o manda à liderança)");
    // sem motivo: o campo não vai
    const d = await salaPronta(); const b = d.S.semear({ menorId: 102, trouxeMembroId: 201 });
    await d.env.ev("chkLerSala(true)"); await d.env.ocioso();
    d.env.doc.clicar(d.env.e(`chkRetirar${b.registroId}`)); await d.env.ocioso();
    d.env.doc.escolher(d.env.e("chkRtQuem"), "OUTRA"); d.env.e("chkRtNome").value = "Vizinha Dalva"; d.env.e("chkRtPar").value = "AMIGO_FAMILIA"; d.env.e("chkRtDoc").value = "RG"; d.env.e("chkRtCodigo").value = d.S.codigoDe(b.registroId);
    d.env.limparRegistro(); d.env.doc.disparar(d.env.e("chkRtForm"), "submit"); await d.env.ocioso();
    const q = chamadas(d.env, "POST checkin-infantil/retirar")[0];
    confere(!!q && JSON.stringify(Object.keys(q.corpo.retirante.outro)) === JSON.stringify(["nome", "parentesco", "documento"]), "sem motivo digitado, nada de motivo no corpo");
    // o motivo não vale para quem está na lista (campo escondido): nem é lido
    // o cartão da liderança
    const g = montar({ sessao: GESTOR, ataque: true });
    const x = g.S.semear({ menorId: 101, trouxeMembroId: 201 }); g.S.pedirDivergencia(x.registroId, { nome: "Tia Zeza", parentesco: "TIO", documento: "CNH", operadorId: 42, motivo: ATAQUE("motivoPedido") });
    const y = g.S.semear({ menorId: 102, trouxeMembroId: 201 }); g.S.pedirDivergencia(y.registroId, { nome: "Tia Zeza", parentesco: "TIO", documento: "CNH", operadorId: 42 });
    await abrirSalaGestao(g.env);
    confere(/Motivo informado por quem registrou o pedido/.test(texto(g.env, `chkCrianca${x.registroId}`)) && texto(g.env, `chkCrianca${x.registroId}`).includes(ATAQUE("motivoPedido")), "o cartão da liderança mostra o motivo (o texto de ataque como texto)");
    confere(!/Motivo informado/.test(texto(g.env, `chkCrianca${y.registroId}`)), "sem motivo, sem a linha");
    limpo(g.env, "Servidor 4", [ATAQUE("motivoPedido")]);
    // o relatório da liderança traz o motivo do pedido e o da decisão (a criança sem nenhum fica com '—')
    g.S.registro(x.registroId).divergenciaMotivo = "Liguei e a mãe confirmou.";
    g.env.doc.clicar(g.env.e("chkRelatorioBotao")); await g.env.ocioso();
    const cri = linhasDaUltimaTabela(g.env, "chkRelImprimivel", 1);
    confere(cri.length === 2 && cri[0][9] === `Pedido: ${ATAQUE("motivoPedido")} · Decisão: Liguei e a mãe confirmou.` && cri[1][9] === "—", `no relatório, a coluna dos motivos: ${JSON.stringify(cri.map(l => l[9])).slice(0, 200)}`);
  });

  // ============================================================================================================================================
  // O servidor mudou: "a liderança não foi avisada" e "o responsável não foi avisado" — alerta, não "tudo certo"
  // ============================================================================================================================================
  cenario("Servidor: 'semAviso' — o pedido de retirada e a segunda via dizem em alerta (toast de erro e texto em destaque) que ninguém foi avisado; sem o campo, o aviso comum de sucesso", async () => {
    const c = await salaPronta(); const { S, env } = c;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 }), b = S.semear({ menorId: 102, trouxeMembroId: 201 });
    await env.ev("chkLerSala(true)"); await env.ocioso();
    const pedir = async (id, codigo) => { env.doc.clicar(env.e(`chkRetirar${id}`)); await env.ocioso(); env.doc.escolher(env.e("chkRtQuem"), "OUTRA"); env.e("chkRtNome").value = "Vizinha Dalva"; env.e("chkRtPar").value = "AMIGO_FAMILIA"; env.e("chkRtDoc").value = "RG"; env.e("chkRtCodigo").value = codigo; env.limparRegistro(); env.doc.disparar(env.e("chkRtForm"), "submit"); await env.ocioso(); };
    await pedir(a.registroId, a.codigo);
    const normal = toastsComTipo(env).find(t => /pedido foi enviado à liderança/.test(t.texto));
    confere(!!normal && normal.erro === false && !/psc-aviso/.test(env.e("chkSalaMsg").className), "sem 'semAviso': o aviso comum de sucesso, sem destaque");
    S.semAviso = true;
    await pedir(b.registroId, b.codigo);
    const alerta = toastsComTipo(env).find(t => /liderança NÃO foi avisada pelo sistema/.test(t.texto));
    confere(!!alerta && alerta.erro === true && /psc-aviso/.test(env.e("chkSalaMsg").className) && /ligue agora|Ligue agora/.test(texto(env, "chkSalaMsg")), `com 'semAviso': o aviso é de erro e o texto fica em destaque, mandando ligar: ${texto(env, "chkSalaMsg").slice(-120)}`);
    // o aviso é FIXO na região da sala: uma atualização automática bem-sucedida não o apaga
    env.tique(); await env.ocioso();
    confere(/liderança NÃO foi avisada pelo sistema/.test(texto(env, "chkSalaMsg")) && /psc-aviso/.test(env.e("chkSalaMsg").className), "depois de uma atualização automática o aviso de 'ninguém foi avisado' continua na região da sala, em destaque");
    // segunda via confirmada com o responsável sem aviso
    const d = await salaPronta(); const s = d.S.semear({ menorId: 101, trouxeMembroId: 201 });
    d.S.vias.push({ viaId: 7001, registroId: s.registroId, pedidaPor: 42, pedidaEm: d.S.agoraMs, pessoaNome: "Maria Souza", documento: "RG" });
    d.S.semAvisoVia = true;
    await d.env.ev("chkLerSala(true)"); await d.env.ocioso();
    d.env.limparRegistro();
    await clicarEResponder(d.env, d.env.e(`chkConfSegVia${s.registroId}`), true);
    const t2 = toastsComTipo(d.env).find(x => /não conseguiu avisar o responsável/.test(x.texto));
    confere(!!t2 && t2.erro === true && /psc-aviso/.test(d.env.e("chkSalaMsg").className) && !!d.env.e("chkImprimivel"), "segunda via com o responsável sem aviso: alerta em destaque, e a etiqueta nova abre mesmo assim");
  });

  // ============================================================================================================================================
  // O servidor mudou: a baixa administrativa no histórico do responsável
  // ============================================================================================================================================
  cenario("Servidor: no histórico do responsável a baixa administrativa NÃO aparece como retirada (selo de atenção, sem 'saiu às')", async () => {
    const r = montar({ sessao: { membroId: 201 }, ataque: true }); const { S, env } = r;
    const a = S.semear({ menorId: 101, trouxeMembroId: 201 });
    Object.assign(S.registro(a.registroId), { situacao: "RETIRADA", retiradoTipo: "BAIXA_ADM", retiradoEm: S.agoraMs + 2 * 3600000, retiradoNome: null });
    const b = S.semear({ menorId: 101, trouxeMembroId: 201 });
    Object.assign(S.registro(b.registroId), { situacao: "RETIRADA", retiradoTipo: "RESPONSAVEL", retiradoEm: S.agoraMs + 3600000, retiradoNome: "Maria Souza" });
    await abrirMeuPainel(env);
    env.doc.clicar(env.e("chkFhBtnHist101")); await env.ocioso();
    const itens = descendentes(env.e("chkFhHist101")).filter(x => x.localName === "li");
    const baixa = itens.find(x => /Encerrada pela liderança/.test(x.textContent)), normal = itens.find(x => !/Encerrada pela liderança/.test(x.textContent));
    confere(!!baixa && /registro encerrado às 11:30/.test(baixa.textContent) && !/saiu às/.test(baixa.textContent) && !/quem retirou/.test(baixa.textContent), "a baixa: 'registro encerrado às', sem 'saiu às' e sem 'quem retirou'");
    confere(!!baixa && descendentes(baixa).some(x => /cal-st-proposto/.test(x.className)) && !!normal && /saiu às 10:30/.test(normal.textContent) && descendentes(normal).some(x => /cal-st-homologado/.test(x.className)), "o selo da baixa é de atenção; o da retirada de verdade continua de 'ok'");
    limpo(env, "Servidor/histórico", []);
    // a linha de baixa NUNCA mostra "saiu às" nem "quem retirou", mesmo que o servidor mande esses campos (defensivo); sem 'encerradaEm', nenhuma hora
    const linha = (extra) => Object.assign({ registroId: 9, menorId: 101, crianca: "Pedro Souza", data: "2026-10-15", sala: "Maternal", congregacao: "Sede", entregueEm: "2026-10-15T12:30:00.000Z", situacao: "RETIRADA",
      rotuloSituacao: "Encerrada pela liderança (a retirada não foi registrada na sala)", quemTrouxe: "Maria Souza", retiradaDivergente: false, baixaAdministrativa: true }, extra);
    env.api.rotas["GET checkin-infantil/historico"] = { status: 200, corpo: { sucesso: true, historico: [linha({ retiradoEm: "2026-10-15T14:00:00.000Z", quemRetirou: "Fulano de Tal", encerradaEm: "2026-10-15T15:00:00.000Z" }), linha({ registroId: 10, retiradoEm: "2026-10-15T14:00:00.000Z", quemRetirou: "Fulano de Tal" })] } };
    env.doc.clicar(env.e("chkFhBtnHist101")); await env.ocioso();   // fecha
    env.doc.clicar(env.e("chkFhBtnHist101")); await env.ocioso();   // abre de novo
    const tx = descendentes(env.e("chkFhHist101")).filter(x => x.localName === "li").map(x => x.textContent).join(" || ");
    confere(/registro encerrado às 12:00/.test(tx) && !/saiu às/.test(tx) && !/quem retirou/.test(tx) && !/Fulano/.test(tx) && (tx.match(/registro encerrado/g) || []).length === 1, `a baixa com 'retiradoEm' e 'quemRetirou' no corpo: só o rótulo e a hora do encerramento (a segunda linha, sem 'encerradaEm', sem hora nenhuma): ${tx.slice(0, 200)}`);
  });

  // ============================================================================================================================================
  // O servidor mudou (extras de S): a sala de um dia que passou, 'jaEncerrada', encerrar só com voluntários
  // ============================================================================================================================================
  cenario("Servidor: a sala de um dia que passou — selo 'Dia anterior' e a data na lista da liderança; 'Encerrar a sala' funciona nela; sai da lista depois; o operador (PIN) nem a recebe", async () => {
    const g = montar({ sessao: GESTOR }); const { S, env } = g;
    S.salas.push(Object.assign({}, S.salas[0], { servicoId: 700, equipeId: 70, equipeNome: "Maternal de ontem", dataHora: "2026-10-14T09:00:00.000Z", voluntarios: [], escalados: [] }));
    S.semear({ sala: 700, menorId: 101, trouxeMembroId: 201 }); S.semear({ sala: 700, menorId: 102, trouxeMembroId: 201 });
    await abrirAbaGestao(env);
    const ontem = texto(env, "chkSalaCartaoGes700x70"), hoje = texto(env, "chkSalaCartaoGes501x31");
    confere(/Dia anterior/.test(ontem) && ontem.includes("Serviço de 14/10/2026 às 09:00") && /dia que já passou/.test(ontem) && /Encerrar a sala/.test(ontem), `o cartão da sala de ontem leva o selo, a data e o que fazer: ${ontem.slice(0, 220)}`);
    confere(!/Dia anterior/.test(hoje) && /Serviço às 09:00/.test(hoje) && !/dia que já passou/.test(hoje), "a sala de hoje não leva o selo nem o aviso, e o serviço sai só com a hora");
    confere(descendentes(env.e("chkSalaCartaoGes700x70")).some(x => /cal-st-proposto/.test(x.className) && /Dia anterior/.test(x.textContent)), "o selo é de atenção");
    env.doc.clicar(env.e("chkAbrirGes700x70")); await env.ocioso();
    confere(/Serviço: 14\/10\/2026 às 09:00/.test(texto(env, "chkSalaCabecalho")) && !!env.e("chkEncerrarBotao"), "aberta, a sala de ontem mostra a data do serviço e o botão de encerrar (a janela dela já fechou)");
    env.limparRegistro();
    env.doc.clicar(env.e("chkEncerrarBotao")); await env.responderTexto("Ninguém registrou a saída no domingo."); await env.responderModal(true); await env.ocioso();
    const p = chamadas(env, "POST checkin-infantil/encerrar-sala");
    confere(p.length === 1 && p[0].corpo.servicoId === 700 && p[0].corpo.equipeId === 70 && S.registros.filter(r => r.servicoId === 700).every(r => r.retiradoTipo === "BAIXA_ADM"), "a baixa vale na sala de um dia que passou (ids da sala de ontem)");
    env.doc.clicar(env.e("chkVoltarBotao")); await env.ocioso();
    env.doc.clicar(env.e("btnChkSecaoSalas")); await env.ocioso();
    confere(!env.e("chkSalaCartaoGes700x70") && !!env.e("chkSalaCartaoGes501x31"), "encerrada, a sala de ontem sai da lista (a de hoje continua)");
    // quem opera (PIN) não recebe a sala de ontem
    const o = montar(); o.S.salas.push(Object.assign({}, o.S.salas[0], { servicoId: 700, equipeId: 70, dataHora: "2026-10-14T09:00:00.000Z", voluntarios: [], escalados: [41] }));
    o.S.semear({ sala: 700, menorId: 101, trouxeMembroId: 201 });
    await abrirMeuPainel(o.env);
    confere(!o.env.e("chkSalaCartaoMeu700x70") && !!o.env.e("chkSalaCartaoMeu501x31"), "o operador só vê a sala de hoje");
    // a lista de salas não marca como 'dia anterior' o que o servidor não marcou (campo ausente ou falso)
    confere(!/Dia anterior/.test(texto(o.env, "chkMeuSalasLista")), "sem o campo, sem o selo");
  });

  cenario("Servidor: encerrar — 'jaEncerrada' (alguém encerrou antes), só voluntários na sala, serviço cancelado com a janela aberta; sem nada a encerrar o botão não existe", async () => {
    const c = montar({ sessao: GESTOR }); const { S, env } = c;
    S.semear({ menorId: 101, trouxeMembroId: 201 }); S.agoraMs = FECHADA;
    await abrirSalaGestao(env);
    confere(!!env.e("chkEncerrarBotao"), "com criança na sala e a janela fechada, o botão aparece");
    // a liderança de outro aparelho já encerrou: o servidor diz 'já estava encerrada'
    S.registros.forEach(r => { r.situacao = "RETIRADA"; r.retiradoTipo = "BAIXA_ADM"; });
    S.salas[0].voluntarios.forEach(v => { if (v.saiuEm == null) v.saiuEm = S.agoraMs; });
    env.limparRegistro();
    env.doc.clicar(env.e("chkEncerrarBotao")); await env.responderTexto("Já encerrei no outro aparelho."); await env.responderModal(true); await env.ocioso();
    const t = toastsComTipo(env).find(x => /já estava encerrada/.test(x.texto));
    confere(!!t && t.erro === false && /A sala já estava encerrada: nenhuma criança ficou sem retirada e ninguém constava como presente\./.test(texto(env, "chkSalaMsg")) && !/psc-aviso/.test(env.e("chkSalaMsg").className), "'jaEncerrada': a mensagem do servidor, como aviso comum (não é erro)");
    confere(!env.e("chkEncerrarBotao"), "e a sala lida de novo já não tem o botão (nada a encerrar)");
    // só voluntários (nenhuma criança): o botão aparece, a pergunta é a dos voluntários e a mensagem é a do servidor
    const d = montar({ sessao: GESTOR }); d.S.agoraMs = FECHADA;
    await abrirSalaGestao(d.env);
    confere(!!d.env.e("chkEncerrarBotao") && /Bia Voluntária/.test(texto(d.env, "chkSalaVoluntarios")), "sem criança mas com voluntário que não saiu: o botão aparece");
    d.env.limparRegistro();
    d.env.doc.clicar(d.env.e("chkEncerrarBotao")); await d.env.responderTexto("Ninguém registrou a saída da equipe."); const q = await d.env.responderModal(true); await d.env.ocioso();
    confere(q.texto.includes("Encerrar a sala? Os voluntários que ainda constam como presentes saem dela. Isto fica registrado com o seu nome.") && !/baixa em 0/.test(q.texto), `a pergunta sem criança não fala em 'baixa em 0 crianças': ${q.texto}`);
    confere(/Sala encerrada: nenhuma criança ficou sem retirada; 1 voluntário\(s\) saíram da sala\./.test(texto(d.env, "chkSalaMsg")) && !d.env.e("chkEncerrarBotao"), "a mensagem do servidor aparece e o botão some");
    // nada a encerrar: ninguém na sala
    const e = montar({ sessao: GESTOR }); e.S.agoraMs = FECHADA; e.S.salas[0].voluntarios.forEach(v => { v.saiuEm = e.S.agoraMs; });
    await abrirSalaGestao(e.env);
    confere(!e.env.e("chkEncerrarBotao"), "sem criança e sem voluntário na sala, sem botão");
    // serviço que deixou de estar publicado (cancelado no meio do culto) com a janela ainda aberta: a liderança encerra
    const f = montar({ sessao: GESTOR }); f.S.semear({ menorId: 101, trouxeMembroId: 201 });
    await abrirSalaGestao(f.env);
    confere(!f.env.e("chkEncerrarBotao"), "serviço publicado, janela aberta: sem botão");
    f.S.salas[0].servicoStatus = "CANCELADA"; await f.env.ev("chkLerSala(true)"); await f.env.ocioso();
    confere(!!f.env.e("chkEncerrarBotao"), "serviço cancelado com a janela aberta: o botão aparece (o servidor aceita)");
  });

  cenario("Servidor (2): encerrar — a pessoa sai da sala e volta com o pedido do motivo, a confirmação ou o pedido ao servidor abertos: nada é enviado nem escrito na sala nova", async () => {
    const c = montar({ sessao: GESTOR }); const { S, env } = c;
    S.semear({ menorId: 101, trouxeMembroId: 201 }); S.agoraMs = FECHADA;
    await abrirSalaGestao(env);
    const sairEVoltar = async () => { env.ev("chkAbaMudou('protecao')"); await env.ocioso(); await abrirSalaGestao(env); };
    const posts = () => chamadas(env, "POST checkin-infantil/encerrar-sala").length;
    // (1) com o pedido do motivo aberto: responder depois não leva à confirmação
    env.limparRegistro();
    env.doc.clicar(env.e("chkEncerrarBotao")); await env.ocioso();
    confere(env.modal().aberto && /Motivo para encerrar a sala/.test(env.modal().texto), "o pedido do motivo está aberto");
    await sairEVoltar();
    await env.responderTexto("Culto terminou há horas."); await env.ocioso();
    confere(!env.modal().aberto && posts() === 0, "responder o motivo da sala velha na sala nova: não aparece a confirmação nem se envia nada");
    // (2) com a confirmação aberta: confirmar depois não envia
    env.doc.clicar(env.e("chkEncerrarBotao")); await env.responderTexto("Culto terminou há horas."); await env.ocioso();
    confere(env.modal().aberto && /Dar baixa em 1 criança/.test(env.modal().texto), "a confirmação está aberta");
    await sairEVoltar();
    await env.responderModal(true); await env.ocioso();
    confere(posts() === 0 && S.registros.every(r => r.situacao === "NA_SALA"), "confirmar a pergunta da sala velha na sala nova: nada é enviado e a criança continua na sala");
    // (3) com o pedido a caminho: a resposta que chega depois não escreve na sala nova
    const presa = env.retem(x => x.chave === "POST checkin-infantil/encerrar-sala");
    env.doc.clicar(env.e("chkEncerrarBotao")); await env.responderTexto("Culto terminou há horas."); await env.responderModal(true); await esperaChegar(presa);
    await sairEVoltar();
    env.limparRegistro();
    presa.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    confere(S.encerramentos === 1 && !/Sala encerrada/.test(texto(env, "chkSalaMsg")) && chamadas(env, "GET checkin-infantil/sala").length === 0, "a resposta do pedido da sala velha não escreve na sala nova nem manda ler a sala");
  });
};
