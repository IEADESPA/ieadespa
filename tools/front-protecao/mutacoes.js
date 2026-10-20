// mutacoes.js — desfaz, uma a uma, as proteções da tela da v7.8 (escape de cada campo do servidor, relato por textContent, relógio, intervalo, limpeza do relato, canal público sem
// token, texto fora do armazenamento, 428, confirmações, permissões, troca de login...). Cada mutação TEM de ser acusada (pelo menos uma falha no roteiro); uma que escapa
// mostra um buraco no roteiro. Se o código mudar de forma, ajuste a âncora da mutação (uma mutação inaplicável também é acusada).
"use strict";
const { rodar } = require("./roteiro");
const P = "modulos/protecao.js", S = "script.js", D = "modulos/meus-dados.js", H = "index.html", C = "style.css";

const MUTACOES = [
  // ---------------------------------------------------------------- as duas camadas que invalidam o relato atrasado (desfeitas juntas)
  ["relato: o relato atrasado entra na ficha seguinte (as duas invalidações desfeitas)", P, [
    ["  prtSeqDetalhe++; prtSeqRelato++;   // um pedido do relato", "  prtSeqDetalhe++;   // um pedido do relato"],
    ["  prtSeqRelato++;                            // a ficha vai ser refeita: o relato que estava aberto sai\n", ""]
  ]],
  // ---------------------------------------------------------------- v7.8 revisada: vincular, arquivar sem conteúdo, 428 na reclassificação, comprovante como prova
  ["escape: quem registrou (ficha)", P, "inc.registradoPor && typeof inc.registradoPor === \"object\" && inc.registradoPor.nome ? escaparHtmlEbd(inc.registradoPor.nome) : \"\"", "inc.registradoPor && typeof inc.registradoPor === \"object\" && inc.registradoPor.nome ? inc.registradoPor.nome : \"\""],
  ["escape: nome do envolvido no formulário de vincular", P, "<strong>🔗 Vincular ${escaparHtmlEbd(envolvido.nome)} a uma pessoa do cadastro</strong>", "<strong>🔗 Vincular ${envolvido.nome} a uma pessoa do cadastro</strong>"],
  ["escape: nome do candidato ao vínculo", P, "matrícula <strong>${Number(m.membroId)}</strong>: ${escaparHtmlEbd(m.nome)}", "matrícula <strong>${Number(m.membroId)}</strong>: ${m.nome}"],
  ["escape: congregação do candidato ao vínculo", P, "${m.congregacaoNome ? ` (${escaparHtmlEbd(m.congregacaoNome)})` : \"\"}", "${m.congregacaoNome ? ` (${m.congregacaoNome})` : \"\"}"],
  ["vincular: o botão aparece sem a ação liberada pelo servidor", P, "const podeVincular = !!(d.acoes && d.acoes.vincularEnvolvido) && !jaTemMembro;", "const podeVincular = true && !jaTemMembro;"],
  ["vincular: sem o 'tem certeza'", P, "  if (!(await confirmarAcao(`Vincular \"${envolvido.nome}\" à matrícula ${membroId}?", "  if (false && !(await confirmarAcao(`Vincular \"${envolvido.nome}\" à matrícula ${membroId}?"],
  ["vincular: a confirmação não diz que a pessoa sai das escalas", P, "Por ser uma suspeita de violência, a pessoa sai das escalas com crianças agora, por cautela (não é punição), e o Comitê precisa decidir sobre o afastamento.", "A pessoa passa a constar."],
  ["vincular: aceita matrícula que não é número", P, "  if (!membroId) { erro(\"Informe a matrícula da pessoa (um número).\"); return; }", ""],
  ["vincular: a matrícula vai como texto", P, "prtPostar(\"vincular-envolvido\", { incidenteId: id, membroId })", "prtPostar(\"vincular-envolvido\", { incidenteId: id, membroId: textoMatricula })"],
  ["vincular: o botão 'usar esta matrícula' não preenche", P, "  if (campo && prtInteiro(membroId)) campo.value = String(Number(membroId));", ""],
  ["vincular: a recusa do servidor fecha o formulário", P, "    if (data.sucesso === false) return;   // recusa de regra (matrícula que não existe, já vinculada...): mensagem do servidor e formulário aberto", "    if (data.sucesso === false) { prtFecharFormAcao(); return; }"],
  ["arquivar: 'sem conteúdo' é oferecido em qualquer caso", P, "(r.codigo === PRT_RESULTADO_SEM_CONTEUDO ? arquivar : suspeita === (r.codigo === \"ENCAMINHADO_AUTORIDADE\"))", "(r.codigo === PRT_RESULTADO_SEM_CONTEUDO ? true : suspeita === (r.codigo === \"ENCAMINHADO_AUTORIDADE\"))"],
  ["arquivar: 'sem conteúdo' nunca é oferecido", P, "(r.codigo === PRT_RESULTADO_SEM_CONTEUDO ? arquivar : suspeita === (r.codigo === \"ENCAMINHADO_AUTORIDADE\"))", "(r.codigo === PRT_RESULTADO_SEM_CONTEUDO ? false : suspeita === (r.codigo === \"ENCAMINHADO_AUTORIDADE\"))"],
  ["arquivar: o aviso do risco não aparece ao escolher", P, "aviso.style.display = prtTexto(\"prtFeResultado\") === PRT_RESULTADO_SEM_CONTEUDO ? \"\" : \"none\";", "aviso.style.display = \"none\";"],
  ["arquivar: o encerramento comum é conferido também (bloqueia o arquivamento)", P, "  const motivos = arquivar ? [] : await prtMotivosParaEncerrar(id);", "  const motivos = await prtMotivosParaEncerrar(id);"],
  ["arquivar: a confirmação não diz que não comunica ao Conselho Tutelar", P, "Isto encerra o caso SEM comunicar ao Conselho Tutelar e só vale para teste, engano ou texto sem relato de violência. Todos os outros da Diretoria e do Comitê serão avisados. Se há qualquer relato de violência, cancele e comunique ao órgão.", "Isto encerra o caso."],
  ["arquivar: a confirmação é a do encerramento comum", P, "  if (!(await confirmarAcao(aviso, arquivar ? \"Arquivar o pedido\" : \"Encerrar o caso\"))) return;", "  if (!(await confirmarAcao(`Encerrar o caso ${prtDetalhe.incidente.protocolo}?`, \"Encerrar o caso\"))) return;"],
  ["reclassificar: o aviso da confirmação de identidade some", P, " Este ato pede <strong>uma confirmação recente de quem você é</strong> (chave de acesso ou código por e-mail): a tela pede na hora de registrar.</p>\n      ${prtHtmlRoteiro()}", "</p>\n      ${prtHtmlRoteiro()}"],
  ["registro: a resposta fala de escalas desmarcadas", P, "<p><strong>O que fazer agora</strong></p>", "<p class=\"psc-legenda\">As escalas da pessoa envolvida foram desmarcadas.</p><p><strong>O que fazer agora</strong></p>"],
  ["anexos: o comprovante (prova) volta a ter botão Excluir", S, "${tabela === \"IncidentesProtecao\" ? \"<span class='psc-legenda'>prova: não pode ser excluída</span>\" : `<button class=\"btn-link btn-link-perigo\" data-on-click=\"excluirAnexoModal\"", "${false ? \"<span class='psc-legenda'>prova: não pode ser excluída</span>\" : `<button class=\"btn-link btn-link-perigo\" data-on-click=\"excluirAnexoModal\""],

  // ---------------------------------------------------------------- escape: texto do servidor entrando como marcação
  ["escape: nome do telefone (contatos do servidor)", P, "const nome = escaparHtmlEbd(c && c.nome);", "const nome = (c && c.nome);"],
  ["escape: descrição do telefone", P, "const descricao = escaparHtmlEbd(c && c.descricao);", "const descricao = (c && c.descricao);"],
  ["escape: endereço tel: (número cru no href)", P, "href=\"${urlSegura(`tel:${digitos}`)}\"", "href=\"tel:${c.numero}\""],
  ["escape: selo (todo rótulo do servidor)", P, "prt-selo ${classe}\">${escaparHtmlEbd(rotulo)}</span>", "prt-selo ${classe}\">${rotulo}</span>"],
  ["escape: rótulo das opções dos selects", P, "${escaparHtmlEbd(rotulo(x))}</option>", "${rotulo(x)}</option>"],
  ["escape: valor das opções dos selects", P, "<option value=\"${escaparHtmlEbd(valor(x))}\">", "<option value=\"${valor(x)}\">"],
  ["escape: rótulo do nível", P, "<strong>${escaparHtmlEbd(n.rotulo)}</strong><br />", "<strong>${n.rotulo}</strong><br />"],
  ["escape: descrição do nível", P, "${escaparHtmlEbd(n.descricao || \"\")}</span>", "${n.descricao || \"\"}</span>"],
  ["escape: código do nível no atributo value", P, "value=\"${escaparHtmlEbd(n.codigo)}\"", "value=\"${n.codigo}\""],
  ["escape: passo do roteiro", P, "<li><strong>${escaparHtmlEbd(prtPassoSemNumero(p.passo))}</strong> ${escaparHtmlEbd(p.texto)}</li>", "<li><strong>${prtPassoSemNumero(p.passo)}</strong> ${escaparHtmlEbd(p.texto)}</li>"],
  ["escape: texto do passo do roteiro", P, "<li><strong>${escaparHtmlEbd(prtPassoSemNumero(p.passo))}</strong> ${escaparHtmlEbd(p.texto)}</li>", "<li><strong>${escaparHtmlEbd(prtPassoSemNumero(p.passo))}</strong> ${p.texto}</li>"],
  ["escape: NÃO FAÇA do roteiro", P, "<ul class=\"prt-nao-faca-lista\">${cat.naoFaca.map(t => `<li>${escaparHtmlEbd(t)}</li>`)", "<ul class=\"prt-nao-faca-lista\">${cat.naoFaca.map(t => `<li>${t}</li>`)"],
  ["escape: NÃO FAÇA da resposta do registro", P, "${(cat ? cat.naoFaca : []).map(t => `<li>${escaparHtmlEbd(t)}</li>`)", "${(cat ? cat.naoFaca : []).map(t => `<li>${t}</li>`)"],
  ["escape: confirmação do canal de ajuda (mensagem)", P, "<h4>💛 Recebemos o que você contou</h4>\n    <p>${escaparHtmlEbd(mensagem)}</p>", "<h4>💛 Recebemos o que você contou</h4>\n    <p>${mensagem}</p>"],
  ["escape: protocolo do canal de ajuda", P, "<strong>${escaparHtmlEbd(data.protocolo)}</strong>. Anote", "<strong>${data.protocolo}</strong>. Anote"],
  ["escape: falha do canal de ajuda (mensagem do servidor)", P, "el.innerHTML = `<p>${escaparHtmlEbd(mensagem)}</p>", "el.innerHTML = `<p>${mensagem}</p>"],
  ["escape: protocolo em Meus registros", P, "<h5>${escaparHtmlEbd(i.protocolo)} ${prtSelo(\"cal-st-deferido\", i.nivelRotulo)}", "<h5>${i.protocolo} ${prtSelo(\"cal-st-deferido\", i.nivelRotulo)}"],
  ["escape: resposta do registro (mensagem) (âncora 7B)", P, "<p${alerta ? ` class=\"psc-aviso\" role=\"alert\"` : \"\"}>${escaparHtmlEbd(prtMsgErro(data))}</p>", "<p${alerta ? ` class=\"psc-aviso\" role=\"alert\"` : \"\"}>${prtMsgErro(data)}</p>"],
  ["escape: protocolo no cartão da fila", P, "<h5>${escaparHtmlEbd(i.protocolo)} <span class=\"psc-legenda\">${prtData(i.dataOcorrencia)}", "<h5>${i.protocolo} <span class=\"psc-legenda\">${prtData(i.dataOcorrencia)}"],
  ["escape: congregação no cartão da fila", P, "${i.congregacaoNome ? ` · ${escaparHtmlEbd(i.congregacaoNome)}` : \"\"}", "${i.congregacaoNome ? ` · ${i.congregacaoNome}` : \"\"}"],
  ["escape: protocolo na ficha", P, "<h4 id=\"prtDetalheTitulo\" tabindex=\"-1\">${escaparHtmlEbd(inc.protocolo)}</h4>", "<h4 id=\"prtDetalheTitulo\" tabindex=\"-1\">${inc.protocolo}</h4>"],
  ["escape: congregação na ficha", P, "prtCampo(\"Congregação\", inc.congregacaoNome ? escaparHtmlEbd(inc.congregacaoNome) : \"\")", "prtCampo(\"Congregação\", inc.congregacaoNome ? inc.congregacaoNome : \"\")"],
  ["escape: equipe na ficha", P, "prtCampo(\"Equipe\", inc.equipeNome ? escaparHtmlEbd(inc.equipeNome) : \"\")", "prtCampo(\"Equipe\", inc.equipeNome ? inc.equipeNome : \"\")"],
  ["escape: onde na ficha", P, "prtCampo(\"Onde\", inc.onde ? escaparHtmlEbd(inc.onde) : \"\")", "prtCampo(\"Onde\", inc.onde ? inc.onde : \"\")"],
  ["escape: quem contou na ficha", P, "inc.relatadoPorRotulo ? escaparHtmlEbd(inc.relatadoPorRotulo) : \"\"", "inc.relatadoPorRotulo ? inc.relatadoPorRotulo : \"\""],
  ["escape: contato do canal na ficha", P, "inc.contatoCanal ? escaparHtmlEbd(inc.contatoCanal) : \"\"", "inc.contatoCanal ? inc.contatoCanal : \"\""],
  ["escape: descrição dos fatos na ficha", P, "<p class=\"prt-texto\">${escaparHtmlEbd(inc.descricao)}</p>", "<p class=\"prt-texto\">${inc.descricao}</p>"],
  ["escape: nome do envolvido", P, "<li><strong>${escaparHtmlEbd(e.nome)}</strong>", "<li><strong>${e.nome}</strong>"],
  ["escape: órgão da comunicação", P, "<strong>${escaparHtmlEbd(c.orgaoRotulo || c.orgao)}</strong>", "<strong>${c.orgaoRotulo || c.orgao}</strong>"],
  ["escape: forma da comunicação", P, "${escaparHtmlEbd(c.formaRotulo || c.forma)}", "${c.formaRotulo || c.forma}"],
  ["escape: protocolo externo da comunicação", P, "c.protocoloExterno ? escaparHtmlEbd(c.protocoloExterno) : \"\"", "c.protocoloExterno ? c.protocoloExterno : \"\""],
  ["escape: onde o comprovante está guardado", P, "c.referenciaArquivo ? escaparHtmlEbd(c.referenciaArquivo) : \"\"", "c.referenciaArquivo ? c.referenciaArquivo : \"\""],
  ["escape: observação da comunicação", P, "c.observacao ? escaparHtmlEbd(c.observacao) : \"\"", "c.observacao ? c.observacao : \"\""],
  ["escape: quem registrou a comunicação", P, "c.registradoPorNome ? `${escaparHtmlEbd(c.registradoPorNome)} em", "c.registradoPorNome ? `${c.registradoPorNome} em"],
  ["escape: decisão do Comitê (rótulo)", P, "<strong>${escaparHtmlEbd(x.decisaoRotulo || x.decisao)}</strong>", "<strong>${x.decisaoRotulo || x.decisao}</strong>"],
  ["escape: decisão do Comitê (nome do envolvido)", P, "— ${escaparHtmlEbd(nomeDe(x.envolvidoId))}", "— ${nomeDe(x.envolvidoId)}"],
  ["escape: decisão do Comitê (quem decidiu)", P, "${escaparHtmlEbd(x.decididaPorNome)} em", "${x.decididaPorNome} em"],
  ["escape: decisão do Comitê (motivo)", P, "<p class=\"prt-texto\">${escaparHtmlEbd(x.observacao)}</p>", "<p class=\"prt-texto\">${x.observacao}</p>"],
  ["escape: reclassificação (quem)", P, "${escaparHtmlEbd(x.porNome)} em", "${x.porNome} em"],
  ["escape: reclassificação (motivo)", P, "<p class=\"prt-texto\">${escaparHtmlEbd(x.motivo)}</p>", "<p class=\"prt-texto\">${x.motivo}</p>"],
  ["escape: reclassificação (nível)", P, "<strong>${escaparHtmlEbd(prtRotuloNivel(x.de))}</strong>", "<strong>${prtRotuloNivel(x.de)}</strong>"],
  ["escape: quem leu o relato", P, "`${escaparHtmlEbd(l.nome)} (${prtDataHora(l.em)})`", "`${l.nome} (${prtDataHora(l.em)})`"],
  ["escape: providência do encerramento", P, "<p class=\"prt-texto\">${escaparHtmlEbd(e.providencia)}</p>", "<p class=\"prt-texto\">${e.providencia}</p>"],
  ["escape: o que falta para encerrar (ficha)", P, "<ul class=\"prt-lista\">${motivos.map(m => `<li>${escaparHtmlEbd(m)}</li>`)", "<ul class=\"prt-lista\">${motivos.map(m => `<li>${m}</li>`)"],
  ["escape: o que falta para encerrar (formulário)", P, "${motivos.map(m => escaparHtmlEbd(m)).join(\" \")}", "${motivos.map(m => m).join(\" \")}"],
  ["escape: nome no formulário de decidir", P, "de ${escaparHtmlEbd(envolvido.nome)}</strong>", "de ${envolvido.nome}</strong>"],
  ["escape: nome do padrão", P, "${escaparHtmlEbd(p.nome)} ${prtSelo(\"cal-st-proposto\"", "${p.nome} ${prtSelo(\"cal-st-proposto\""],
  ["escape: nome do membro do Comitê", P, "<li><strong>${escaparHtmlEbd(m.nome)}</strong> ${prtSelo(", "<li><strong>${m.nome}</strong> ${prtSelo("],
  ["escape: pendência do Comitê", P, "<li>${escaparHtmlEbd(p)}</li>", "<li>${p}</li>"],
  ["escape: congregação no relatório", P, "<tr><td>${escaparHtmlEbd(l.congregacaoNome)}</td><td>${n(l.quaseAcidentes)}", "<tr><td>${l.congregacaoNome}</td><td>${n(l.quaseAcidentes)}"],
  ["escape: congregação na habilitação do relatório", P, "<tr><td>${escaparHtmlEbd(l.congregacaoNome)}</td><td>${n(l.total)}", "<tr><td>${l.congregacaoNome}</td><td>${n(l.total)}"],
  ["escape: aviso fixo da tela entra como HTML", P, "if (el) { el.textContent = texto; el.className = destaque ?", "if (el) { el.innerHTML = texto; el.className = destaque ?"],

  // ---------------------------------------------------------------- relato: textContent, nunca innerHTML; some em todo caminho
  ["relato: entra por innerHTML", P, "el.textContent = texto;   // textContent, nunca innerHTML", "el.innerHTML = texto;   // textContent, nunca innerHTML"],
  ["relato: não é apagado ao fechar", P, "  if (corpo) corpo.textContent = \"\";\n  if (cx) cx.style.display = \"none\";\n}\nfunction prtFecharRelatoAcao", "  if (cx) cx.style.display = \"none\";\n}\nfunction prtFecharRelatoAcao"],
  ["relato: ao sair da aba a ficha não é fechada", P, "  prtRelogiosLista = []; prtRelogioDetalhe = null;   // antes de fechar a ficha: fechar a ficha reajusta o intervalo pela lista que houver\n  prtFecharDetalheInterno();", "  prtRelogiosLista = []; prtRelogioDetalhe = null;"],
  ["relato: mostrarAbaSecretaria não avisa o módulo ao sair da aba", D, "  if (aba !== \"protecao\" && typeof prtAbaFechada === \"function\") prtAbaFechada();", ""],
  ["relato: o relato que chega depois de fechar/trocar entra (seq do relato)", P, "    if (seq !== prtSeqRelato) return;   // a pessoa trocou de incidente, fechou, saiu da aba ou trocou de login: o relato NÃO entra na tela\n", ""],
  ["relato: sem a confirmação de que a leitura fica registrada", P, "  if (!(await confirmarAcao(\"Esta leitura fica registrada com o seu nome (quem leu e quando). O relato é o que uma criança ou adolescente contou: leia com cuidado, não copie e não repasse a ninguém fora da liderança de proteção. Ler agora?\", \"Ler o relato\"))) return;\n", ""],
  ["relato: o texto da confirmação não diz que fica registrado", P, "Esta leitura fica registrada com o seu nome (quem leu e quando).", "Esta leitura é rápida."],
  ["relato: pedido com id como texto", P, "prtPostar(\"relato\", { incidenteId: id })", "prtPostar(\"relato\", { incidenteId: String(id) })"],
  ["relato: sair da sessão não limpa a tela", S, "  if (typeof prtLimparTela === \"function\") prtLimparTela();\n", ""],

  // ---------------------------------------------------------------- relógio
  ["relógio: ignora o relógio do servidor (usa só o do aparelho)", P, "prtDeslocamento = Number.isFinite(ms) ? ms - Date.now() : 0;", "prtDeslocamento = 0;"],
  ["relógio: o tique não reescreve o texto", P, "    el.textContent = prtTextoRelogio(r);\n", ""],
  ["relógio: o tique não reescreve a cor", P, "    el.className = `cal-selo prt-selo prt-relogio ${prtClasseFaixa(r.faixa)}`;\n", ""],
  ["relógio: o intervalo não é limpo", P, "function prtPararRelogio() { if (prtTimer != null) { clearInterval(prtTimer); prtTimer = null; } }", "function prtPararRelogio() { prtTimer = null; }"],
  ["relógio: o tique não confere se a aba está aberta", P, "  if (!prtTelaViva()) { prtPararRelogio(); return; }", "  if (false) { prtPararRelogio(); return; }"],
  ["relógio: o tique não confere de quem é a tela", P, "return !!(authToken && prtDonoDaTela === prtChaveDoDono() && aba && aba.style.display === \"block\");", "return !!(authToken && aba && aba.style.display === \"block\");"],
  ["relógio: o intervalo roda a cada 60 s", P, "const PRT_INTERVALO_RELOGIO_MS = 30000;", "const PRT_INTERVALO_RELOGIO_MS = 60000;"],
  ["relógio: o intervalo nasce mesmo sem relógio na tela", P, "  if (prtRelogiosLista.length || prtRelogioDetalhe) prtIniciarRelogio(); else prtPararRelogio();", "  prtIniciarRelogio();"],
  ["relógio: o vermelho começa em 3 h (e não em 4)", P, "PRT_LIMITE_CRITICO_HORAS = 4;", "PRT_LIMITE_CRITICO_HORAS = 3;"],
  ["relógio: o amarelo começa em 24 h (e não em 12)", P, "const PRT_LIMITE_ATENCAO_HORAS = 12", "const PRT_LIMITE_ATENCAO_HORAS = 24"],
  ["relógio: vencido com o mesmo texto de quem ainda tem prazo", P, "texto: vencido ? `vencido há ${duracao}` : `faltam ${duracao}`", "texto: vencido ? `faltam ${duracao}` : `faltam ${duracao}`"],
  ["relógio: o vencido não ganha a classe própria", P, "VENCIDO: \"cal-st-indeferido prt-relogio-vencido\"", "VENCIDO: \"cal-st-indeferido\""],
  ["relógio: o normal deixa de ser verde", P, "NORMAL: \"cal-st-homologado\"", "NORMAL: \"cal-st-proposto\""],
  ["relógio: sem ícone (só cor)", P, "function prtTextoRelogio(r) { return `${prtTem(PRT_ICONE_FAIXA, r.faixa) ? PRT_ICONE_FAIXA[r.faixa] : \"⏳\"} ${r.texto}`; }", "function prtTextoRelogio(r) { return r.texto; }"],
  ["relógio: o minuto vira hora cheia", P, "const h = Math.floor(abs / PRT_MS_HORA), m = Math.floor((abs % PRT_MS_HORA) / 60000);", "const h = Math.floor(abs / PRT_MS_HORA), m = 0;"],
  ["relógio: a fila é reordenada pela tela", P, "  prtIncidentes = data.incidentes.filter(i => i && typeof i === \"object\");", "  prtIncidentes = data.incidentes.filter(i => i && typeof i === \"object\").sort((a, b) => Number(a.incidenteId) - Number(b.incidenteId));"],
  ["relógio: quem foi comunicado continua com relógio", P, "prtRelogiosLista = prtIncidentes.filter(i => i.relogio && i.status !== \"ENCERRADO\"", "prtRelogiosLista = prtIncidentes.filter(i => i.status !== \"ENCERRADO\" && i.prazoEm"],
  ["relógio: o relógio da ficha não é registrado", P, "prtRelogioDetalhe = inc.relogio && aberto && Number.isFinite(Date.parse(inc.relogio.prazoEm)) ? { id: \"prtRelogioDet\", prazoMs: Date.parse(inc.relogio.prazoEm) } : null;", "prtRelogioDetalhe = null;"],

  // ---------------------------------------------------------------- fila e ficha: filtro, resposta atrasada, 404 neutro, botões por `acoes`
  ["fila: o filtro não vai ao servidor", P, "const caminho = filtro === \"TODOS\" ? \"incidentes\" : `incidentes?status=${filtro}`;", "const caminho = \"incidentes\";"],
  ["fila: a resposta atrasada de outro filtro entra", P, "  if (seq !== prtSeqLista) return;   // resposta velha: outro filtro foi pedido depois, ou a pessoa saiu da aba ou trocou de login\n", ""],
  ["fila: o selo 'comunicado' some", P, "i.exigeComunicacao && i.comunicado ? prtSelo(\"cal-st-homologado\", \"✅ comunicado ao órgão\") : \"\",", "\"\","],
  ["fila: o selo 'sem comprovante' some", P, "i.exigeComunicacao && i.comunicado && !i.comComprovante ? prtSelo(\"cal-st-indeferido\", \"📎 sem comprovante\") : \"\",", "\"\","],
  ["fila: a origem 'canal de ajuda' some", P, "i.origem === \"CANAL_AJUDA\" ? prtSelo(\"cal-st-proposto\", `🧒 ${i.origemRotulo || \"Canal de ajuda\"}`) : \"\",", "\"\","],
  ["ficha: 404 mostra a mensagem do servidor (e não a neutra)", P, "escaparHtmlEbd(data.httpStatus === 404 ? PRT_MSG_NAO_ABRIU : prtMsgErro(data))", "escaparHtmlEbd(prtMsgErro(data))"],
  ["ficha: a resposta atrasada de outro incidente entra", P, "  if (seq !== prtSeqDetalhe) return false;   // outro incidente foi aberto, a pessoa saiu da ficha, da aba ou trocou de login\n", ""],
  ["ficha: o botão de comunicar aparece sempre", P, "a.comunicar ? botao(\"prtAbrirFormAcao\", [\"comunicacao\"", "true ? botao(\"prtAbrirFormAcao\", [\"comunicacao\""],
  ["ficha: o botão de adendo aparece sempre", P, "a.adendo ? botao(\"prtAbrirFormAcao\", [\"adendo\"", "true ? botao(\"prtAbrirFormAcao\", [\"adendo\""],
  ["ficha: o botão de reclassificar aparece sempre", P, "a.reclassificar ? botao(\"prtAbrirFormAcao\", [\"reclassificar\"", "true ? botao(\"prtAbrirFormAcao\", [\"reclassificar\""],
  ["ficha: o botão de encerrar aparece sempre", P, "a.encerrar ? botao(\"prtAbrirFormAcao\", [\"encerrar\"", "true ? botao(\"prtAbrirFormAcao\", [\"encerrar\""],
  ["ficha: decidir também para quem é só um nome", P, "${podeDecidir && e.ehMembro && d.incidente.nivel === \"ALEGACAO\" ?", "${podeDecidir && d.incidente.nivel === \"ALEGACAO\" ?"],
  ["ficha: o anexo de comprovante aparece sempre", P, "d.incidente.exigeComunicacao ? botao(\"abrirModalAnexos\"", "true ? botao(\"abrirModalAnexos\""],
  ["ficha: sem o aviso do nome do arquivo", P, " Ao anexar o comprovante, não coloque o nome da criança no nome do arquivo.", ""],
  ["ficha: o relato aparece sem ser pedido", P, "    ${relato.registrado\n    ? `<p>Há um relato guardado", "    ${relato.registrado\n    ? `<p>${escaparHtmlEbd(\"[relato]\")} Há um relato guardado"],
  ["anexos: o aviso do nome do arquivo some do modal", S, "    ${tabela === \"IncidentesProtecao\" ? \"<p class='cnl-aviso-senha' role='note'>Não coloque o nome da criança no nome do arquivo.</p>\" : \"\"}\n", ""],

  // ---------------------------------------------------------------- 428 e atos
  ["428: a mensagem de confirmação reforçada some", P, "if (res.status === 428 || corpo.precisaFator) corpo.mensagem = PRT_MSG_FATOR;", "if (false) corpo.mensagem = PRT_MSG_FATOR;"],
  ["comunicação: sem o 'tem certeza'", P, "  if (!(await confirmarAcao(`Registrar que ${rotuloOrgao} foi avisado", "  if (false && !(await confirmarAcao(`Registrar que ${rotuloOrgao} foi avisado"],
  ["comunicação: o texto não diz que para o relógio", P, "Isso para o relógio de 24 horas deste caso, fica registrado com o seu nome e não pode ser apagado. Confira o órgão e a hora.", "Confira o órgão e a hora."],
  ["comunicação: aceita hora no futuro", P, "if (quando.getTime() > prtAgoraServidor() + 5 * 60000) {", "if (false) {"],
  ["comunicação: aceita hora anterior à ciência", P, "if (Number.isFinite(ciencia) && quando.getTime() < ciencia - 60000) {", "if (false) {"],
  ["comunicação: sem órgão", P, "  if (!orgao) { erro(", "  if (false) { erro("],
  ["comunicação: sem forma", P, "  if (!forma) { erro(", "  if (false) { erro("],
  ["comunicação: a data vai como texto do campo (não ISO)", P, "const corpo = { incidenteId: id, orgao, forma, comunicadoEm: quando.toISOString() };", "const corpo = { incidenteId: id, orgao, forma, comunicadoEm: quandoTexto };"],
  ["comunicação: incidenteId como texto", P, "const corpo = { incidenteId: id, orgao, forma, comunicadoEm", "const corpo = { incidenteId: String(id), orgao, forma, comunicadoEm"],
  ["comunicação: a recusa do servidor fecha o formulário", P, "    if (data.sucesso === false) return;       // recusa de regra: mensagem do servidor e formulário aberto, com o que foi escrito", "    if (data.sucesso === false) { prtFecharFormAcao(); return; }"],
  ["comunicação: depois do sucesso a ficha não é refeita (âncora 7B)", P, "async function prtDepoisDoAto(id, data) {\n  const ok = await prtCarregarDetalhe(id);", "async function prtDepoisDoAto(id, data) {\n  const ok = false;"],
  ["adendo: aceita texto com < >", P, "if (texto.length < 10 || texto.length > 2000 || prtTemMarca(texto)) { mostrarToast(", "if (texto.length < 10 || texto.length > 2000) { mostrarToast("],
  ["adendo: incidenteId como texto", P, "prtPostar(\"adendo\", { incidenteId: id, texto })", "prtPostar(\"adendo\", { incidenteId: String(id), texto })"],
  ["adendo: sem o aviso de não fazer novas perguntas", P, "<strong>Não faça novas perguntas</strong> para obter mais: repetir a conversa machuca de novo.", "Registre."],
  ["reclassificar: oferece todos os níveis (inclusive abaixo)", P, "  return atual < 0 ? [] : niveis.filter((n, i) => i > atual);", "  return atual < 0 ? [] : niveis.filter((n, i) => i !== atual);"],
  ["reclassificar: sem o 'tem certeza'", P, "  if (!(await confirmarAcao(aviso, \"Reclassificar\"))) return;", ""],
  ["reclassificar: a suspeita vai sem o relato", P, "    corpo.relatadoPor = quem; corpo.relato = relato;", "    corpo.relatadoPor = quem;"],
  ["reclassificar: a suspeita não pede quem contou", P, "    if (!quem) { erro(\"Informe quem contou ou percebeu o fato.\"); return; }", ""],
  ["reclassificar: a confirmação da suspeita não diz o efeito (âncora 7B)", P, "A lei manda comunicar o Conselho Tutelar imediatamente, e o prazo máximo da Igreja (24 horas) começa agora; a pessoa envolvida, se for membro, sai das escalas com crianças por cautela; a liderança de proteção será avisada. Só se sobe de nível: depois não dá para voltar atrás.", "Só se sobe de nível."],
  ["decidir: a observação é conferida só depois do 428", P, "  if (observacao.length < 10 || observacao.length > 300 || prtTemMarca(observacao)) { erro(\"Registre o motivo da decisão", "  if (false) { erro(\"Registre o motivo da decisão"],
  ["decidir: sem o 'tem certeza'", P, "  if (!(await confirmarAcao(`${prtRotuloDe(prtCatalogos.decisoes, decisao)} (${envolvido.nome})?", "  if (false && !(await confirmarAcao(`${prtRotuloDe(prtCatalogos.decisoes, decisao)} (${envolvido.nome})?"],
  ["decidir: envolvidoId como texto", P, "prtPostar(\"cautelar-decidir\", { incidenteId: id, envolvidoId: eid,", "prtPostar(\"cautelar-decidir\", { incidenteId: id, envolvidoId: String(eid),"],
  ["decidir: a confirmação não diz o efeito de levantar", P, "A pessoa só volta às escalas com crianças se a habilitação dela estiver em dia, e é avisada.", "Ok."],
  ["encerrar: não confere o caso antes (confirma identidade à toa)", P, "  const motivos = arquivar ? [] : await prtMotivosParaEncerrar(id);", "  const motivos = [];"],
  ["encerrar: oferece todos os resultados", P, "  const possiveis = todos.filter(r => (r.codigo === PRT_RESULTADO_SEM_CONTEUDO ? arquivar : suspeita === (r.codigo === \"ENCAMINHADO_AUTORIDADE\")));", "  const possiveis = todos;"],
  ["encerrar: sem o 'tem certeza'", P, "  if (!(await confirmarAcao(aviso, arquivar ? \"Arquivar o pedido\" : \"Encerrar o caso\"))) return;", ""],
  ["encerrar: a recusa do servidor não aparece", P, "    if (data.sucesso === false) { prtMostrarResultado(data, \"prtFeMsg\", true); return; }", "    if (data.sucesso === false) { return; }"],
  ["encerrar: a providência é validada só pelo servidor", P, "  if (providencia.length < 10 || providencia.length > 500 || prtTemMarca(providencia)) { erro(", "  if (false) { erro("],
  ["encerrar: o motivo de não poder encerrar não aparece no formulário", P, "if (motivos.length) { prtAvisoForm(\"prtFeMsg\", `Ainda não dá para encerrar. ${motivos.join(\" \")}`); return; }", "if (motivos.length) { return; }"],
  ["atos: a trava de duplo clique some", P, "if (prtEmCurso.has(chave)) { mostrarToast(\"Aguarde: o pedido anterior ainda está sendo processado.\", \"erro\"); return undefined; }", ""],
  ["atos: o botão não é solto no fim", P, "    if (botao) botao.disabled = false;\n    if (chave) prtEmCurso.delete(chave);", "    if (chave) prtEmCurso.delete(chave);"],

  // ---------------------------------------------------------------- canal público: sem token, texto fora do armazenamento, 100/190 sempre
  ["público: o pedido leva o token", P, "const res = await fetch(`${API_BASE}/protecao-ajuda`, { method: \"POST\", headers: { \"Content-Type\": \"application/json\" },", "const res = await fetch(`${API_BASE}/protecao-ajuda`, { method: \"POST\", headers: { \"Content-Type\": \"application/json\", \"x-auth-token\": authToken },"],
  ["público: o pedido usa o fetch protegido", P, "const res = await fetch(`${API_BASE}/protecao-ajuda`, {", "const res = await fetchProtegido(`${API_BASE}/protecao-ajuda`, {"],
  ["público: o texto é guardado no localStorage", P, "  const corpo = { texto };\n  if (quemSou) corpo.quemSou = quemSou;", "  const corpo = { texto };\n  localStorage.setItem(\"prtRascunho\", texto);\n  if (quemSou) corpo.quemSou = quemSou;"],
  ["público: o texto é guardado no sessionStorage", P, "  const corpo = { texto };\n  if (quemSou) corpo.quemSou = quemSou;", "  const corpo = { texto };\n  sessionStorage.setItem(\"prtRascunho\", texto);\n  if (quemSou) corpo.quemSou = quemSou;"],
  ["público: o campo não é limpo depois de enviar", P, "    prtAjudaEnviada[ctx] = !prtLimparCamposAjuda(ctx, enviado);\n    prtMostrarSucessoAjuda(ctx, data);", "    prtMostrarSucessoAjuda(ctx, data);"],
  ["público: a falha também limpa o campo", P, "    if (data.sucesso !== true) { prtMostrarFalhaAjuda(ctx, data); return; }", "    if (data.sucesso !== true) { prtLimparCamposAjuda(ctx); prtMostrarFalhaAjuda(ctx, data); return; }"],
  ["público: a falha não mostra os telefones", P, "    <p class=\"psc-legenda\">Se precisar, estes telefones atendem de graça:</p>${prtHtmlContatos(data.contatosDeAjuda)}`;\n  prtFocar(el);\n}\nfunction prtMostrarSucessoAjuda", "    `;\n  prtFocar(el);\n}\nfunction prtMostrarSucessoAjuda"],
  ["público: sem os telefones padrão quando o servidor não manda", P, "const itens = Array.isArray(lista) && lista.length ? lista : PRT_CONTATOS_PADRAO;", "const itens = Array.isArray(lista) && lista.length ? lista : [];"],
  ["público: a validação da tela some", P, "  if (problema) { prtEscreverAjuda(ctx, problema); prtFocarId(`prtAjuda${ctx}Texto`); return; }", ""],
  ["público: sair não desmonta o formulário", P, "  const cx = prtEl(\"prtAjudaPubForm\");\n  if (cx) cx.innerHTML = \"\";\n  prtAjudaEnviada.Pub = false;", "  const cx = prtEl(\"prtAjudaPubForm\");\n  prtAjudaEnviada.Pub = false;"],
  ["público: o 'Voltar' com login não leva ao painel", P, "  if (authToken && authMatricula) mostrarTelaPainelInicial(); else voltarParaCheckin();\n}\n\n// ============", "  voltarParaCheckin();\n}\n\n// ============"],
  ["público: a tela de ajuda não some ao trocar de tela", S, "  document.getElementById(\"prtTelaAjuda\").style.display = \"none\";\n", ""],
  ["público: o texto é pedido na tela e fica no HTML (sem desmontar) — autocomplete ligado", P, "<textarea id=\"prtAjuda${ctx}Texto\" rows=\"6\" maxlength=\"4000\" autocomplete=\"off\"", "<textarea id=\"prtAjuda${ctx}Texto\" rows=\"6\" maxlength=\"4000\""],
  ["público: a resposta não é anunciada (sem aria-live)", P, "<div id=\"prtAjuda${ctx}Resultado\" class=\"prt-ajuda-resultado\" role=\"status\" aria-live=\"polite\" tabindex=\"-1\"></div>", "<div id=\"prtAjuda${ctx}Resultado\" class=\"prt-ajuda-resultado\" tabindex=\"-1\"></div>"],
  ["público: o HTML perde o link tel:190", H, "<a class=\"prt-tel prt-tel-urgente\" href=\"tel:190\">🚨 Ligue 190: <strong>Polícia</strong></a><span class=\"prt-tel-desc\">Se existe perigo agora.</span>\n        <p class=\"prt-tel-desc\"><strong>Conselho Tutelar:</strong>", "<span class=\"prt-tel-desc\">Se existe perigo agora.</span>\n        <p class=\"prt-tel-desc\"><strong>Conselho Tutelar:</strong>"],
  ["público: o HTML perde o texto de acolhimento", H, "Você não tem culpa. Pode contar do seu jeito. Uma pessoa preparada vai ler.", "Escreva aqui."],
  ["público: a porta de entrada some da tela de entrada", H, "      <!-- v7.8 — Preciso de ajuda: o canal de ajuda da criança e do adolescente, sem login e sem prova (módulo protecao.js) -->\n      <button type=\"button\" class=\"prt-btn-ajuda\" data-on-click=\"prtAbrirAjudaPublicaAcao\">🧒 Preciso de ajuda<small>Criança, adolescente ou alguém que quer ajudar</small></button>\n", ""],
  ["a11y: o seletor de igreja do pedido de ajuda perde o rótulo", P, "<label for=\"prtAjuda${ctx}Cong\">Qual igreja? (opcional)</label>", ""],

  // ---------------------------------------------------------------- registro de incidente
  ["registro: a confirmação da suspeita some", P, "  if (c.nivel === \"ALEGACAO\" && !(await confirmarAcao(prtTextoConfirmarSuspeita(c), \"Enviar a suspeita\"))) return;", ""],
  ["registro: a confirmação não diz o efeito (prazo) (âncora 7B)", P, "a lei manda comunicar o Conselho Tutelar imediatamente, e o prazo máximo da Igreja (24 horas) começa agora", "o prazo começa agora"],
  ["registro: a confirmação não fala da saída das escalas", P, "; a pessoa envolvida (matrícula ${c.envMatricula}), se for membro, sai das escalas com crianças por cautela (não é punição)", ""],
  ["registro: sem a validação de nível", P, "  if (!c.nivel) return \"Escolha o que aconteceu:", "  if (false) return \"Escolha o que aconteceu:"],
  ["registro: aceita data no futuro", P, "  if (c.data > calHojeBrasilia()) return", "  if (false) return"],
  ["registro: aceita matrícula e nome juntos", P, "  if (c.envMatricula && c.envNome) return", "  if (false) return"],
  ["registro: aceita suspeita sem quem contou", P, "    if (!c.quem) return", "    if (false) return"],
  ["registro: aceita horas inválidas", P, "    if (!c.horasValidas) return", "    if (false) return"],
  ["registro: aceita descrição com < >", P, "c.descricao.length > 1000 || prtTemMarca(c.descricao)) return", "c.descricao.length > 1000) return"],
  ["registro: a congregação vai como texto", P, "const corpo = { nivel: c.nivel, dataOcorrencia: c.data, congregacaoId: c.congregacaoId, descricao: c.descricao };", "const corpo = { nivel: c.nivel, dataOcorrencia: c.data, congregacaoId: String(c.congregacaoId), descricao: c.descricao };"],
  ["registro: a matrícula vai como texto", P, "  if (c.envMatricula) corpo.envolvidoMembroId = c.envMatricula;", "  if (c.envMatricula) corpo.envolvidoMembroId = c.envMatriculaTexto;"],
  ["registro: as horas vão como texto", P, "corpo.conhecidoHaHoras = c.horas;", "corpo.conhecidoHaHoras = String(c.horas);"],
  ["registro: o relato vai também nos outros níveis", P, "  if (c.nivel === \"ALEGACAO\") { corpo.relatadoPor = c.quem; corpo.relato = c.relato; corpo.conhecidoHaHoras = c.horas; }", "  corpo.relatadoPor = c.quem; corpo.relato = c.relato; corpo.conhecidoHaHoras = c.horas;"],
  ["registro: o relato não é apagado depois de enviar", P, "[\"prtRegOnde\", \"prtRegDescricao\", \"prtRegEnvMatricula\", \"prtRegEnvNome\", \"prtRegRelato\"].forEach(id => { const el = prtEl(id); if (el) el.value = \"\"; });\n  const horas", "[\"prtRegOnde\", \"prtRegDescricao\", \"prtRegEnvMatricula\", \"prtRegEnvNome\"].forEach(id => { const el = prtEl(id); if (el) el.value = \"\"; });\n  const horas"],
  ["registro: o relato é apagado mesmo quando o servidor recusa", P, "    if (data.sucesso === false) { prtMostrarRespostaRegistro(null); return; }", "    if (data.sucesso === false) { prtLimparFormRegistro(); prtMostrarRespostaRegistro(null); return; }"],
  ["registro: a resposta de outro login entra na tela", P, "    if (geracao !== prtGeracao) return;   // a pessoa trocou de login (ou saiu) enquanto o pedido ia\n", ""],
  ["registro: a resposta não traz o que fazer agora", P, "    <p><strong>O que fazer agora</strong></p>\n", ""],
  ["registro: o nível escolhido não volta a nenhum", P, "  if (prtCatalogos) prtCatalogos.niveis.forEach((n, i) => { const r = prtEl(`prtRegNivel${i}`); if (r) r.checked = false; });\n", ""],
  ["registro: a equipe é buscada sem a permissão das escalas", P, "if (!congregacaoId || !authPermissoes.includes(\"escalas\")) return;", "if (!congregacaoId) return;"],
  ["registro: a equipe inativa aparece", P, "const equipes = data.equipes.filter(e => e && e.ativa !== false && prtInteiro(e.equipeId));", "const equipes = data.equipes.filter(e => e && prtInteiro(e.equipeId));"],
  ["registro: o relato de suspeita aparece para qualquer nível", P, "if (bloco) bloco.style.display = prtNivelEscolhido() === \"ALEGACAO\" ? \"\" : \"none\";\n}\n// A equipe", "if (bloco) bloco.style.display = \"\";\n}\n// A equipe"],
  ["registro: o roteiro não vem do catálogo", P, "    <ol class=\"prt-roteiro-passos\">${cat.roteiroEscuta.map(p =>", "    <ol class=\"prt-roteiro-passos\">${[].map(p =>"],

  // ---------------------------------------------------------------- permissões e níveis
  ["permissão: padrões, Comitê e relatório para quem não é do nível geral", P, "function prtSecaoPermitida(secao) { return secao === \"incidentes\" ? prtEhGestao() : PRT_SECOES.includes(secao) && prtEhGeral(); }", "function prtSecaoPermitida(secao) { return secao === \"incidentes\" ? prtEhGestao() : PRT_SECOES.includes(secao); }"],
  ["permissão: os padrões pedem ao servidor sem ser do nível geral", P, "  if (!prtEhGeral()) { lista.innerHTML = \"\"; prtEscreverAviso(\"prtPadroesResultado\"", "  if (false) { lista.innerHTML = \"\"; prtEscreverAviso(\"prtPadroesResultado\""],
  ["permissão: o Comitê pede ao servidor sem ser do nível geral", P, "  if (!prtEhGeral()) { lista.innerHTML = \"\"; prtEscreverAviso(\"prtComiteResultado\"", "  if (false) { lista.innerHTML = \"\"; prtEscreverAviso(\"prtComiteResultado\""],
  ["permissão: o relatório pede ao servidor sem ser do nível geral", P, "  if (!prtEhGeral()) { cx.innerHTML = \"\"; prtEscreverAviso(\"prtRelResultado\"", "  if (false) { cx.innerHTML = \"\"; prtEscreverAviso(\"prtRelResultado\""],
  ["permissão: os papéis falsos (todos liberados)", P, "    papeis: { gestao: !!papeis.gestao, geral: !!papeis.geral }\n  };\n  return prtCatalogos;", "    papeis: { gestao: true, geral: true }\n  };\n  return prtCatalogos;"],
  ["permissão: sem o aviso de 'sem acesso'", P, "if (semAcesso) semAcesso.style.display = prtCatalogos && !PRT_SECOES.some(prtSecaoPermitida) ? \"\" : \"none\";", "if (semAcesso) semAcesso.style.display = \"none\";"],
  ["permissão: a aba abre com a chave errada", S, "  protecao: [\"protecao_menores\"],\n", ""],
  ["navegação: a aba não está no módulo de Habilitação (âncora 7B)", S, "abas: [\"habilitacao\", \"menores\", \"protecao\", \"checkininfantil\"] },", "abas: [\"habilitacao\", \"menores\", \"checkininfantil\"] },"],
  ["navegação: a aba não está em NOMES_ABAS (âncora 7B)", S, "const NOMES_ABAS = [\"meupainel\", \"financeiro\", \"reunioes\", \"pessoas\", \"cartas\", \"orgaos\", \"estrutura\", \"catalogos\", \"permissoes\", \"consagracoes\", \"enquetes\", \"arquivos\", \"disciplina\", \"abandono\", \"auditoria\", \"protecaodedados\", \"ouvidoria\", \"documentos\", \"mediacao\", \"relatoriosdepto\", \"escalas\", \"habilitacao\", \"menores\", \"protecao\", \"checkininfantil\",", "const NOMES_ABAS = [\"meupainel\", \"financeiro\", \"reunioes\", \"pessoas\", \"cartas\", \"orgaos\", \"estrutura\", \"catalogos\", \"permissoes\", \"consagracoes\", \"enquetes\", \"arquivos\", \"disciplina\", \"abandono\", \"auditoria\", \"protecaodedados\", \"ouvidoria\", \"documentos\", \"mediacao\", \"relatoriosdepto\", \"escalas\", \"habilitacao\", \"menores\", \"checkininfantil\","],
  ["navegação: a sub-aba não está em SUB_ABAS_MEUPAINEL (âncora 7B)", S, "\"menores\", \"protecao\", \"checkininfantil\", \"minhasconquistas\",", "\"menores\", \"checkininfantil\", \"minhasconquistas\","],
  ["navegação: a sub-aba não carrega a tela", S, "  if (sub === \"protecao\" && typeof carregarMeuPainelProtecaoAcao === \"function\") carregarMeuPainelProtecaoAcao();\n", ""],
  ["navegação: a sub-aba sem título (âncora 7B)", S, "protecao: \"Proteção de crianças\", checkininfantil:", "checkininfantil:"],
  ["navegação: a aba não carrega a tela", D, "  if (aba === \"protecao\" && typeof carregarOpcoesProtecaoAcao === \"function\") carregarOpcoesProtecaoAcao();\n", ""],
  ["navegação: a aba sem título", D, "menores: \"Ministério com Menores\", protecao: \"Proteção de Crianças\",", "menores: \"Ministério com Menores\","],
  ["navegação: sem ajuda contextual da aba", S, "  protecao: \"Proteção de Crianças (ECA arts. 13 e 245; Lei 13.431/2017): a fila de incidentes", "  protecaoX: \"Proteção de Crianças (ECA arts. 13 e 245; Lei 13.431/2017): a fila de incidentes"],
  ["navegação: sem ajuda contextual da sub-aba", S, "  \"meupainel:protecao\": \"Proteção de crianças e adolescentes:", "  \"meupainel:protecaoX\": \"Proteção de crianças e adolescentes:"],
  ["navegação: o botão da aba sai do módulo de Habilitação", H, "<button class=\"btn-aba\" id=\"btnAbaProtecao\" data-on-click=\"mostrarAbaSecretaria\" data-args-click='[\"protecao\"]'><span class=\"icone\">🛡️</span><span class=\"rotulo\">Proteção de Crianças</span></button>", ""],

  // ---------------------------------------------------------------- troca de login
  ["login: o dono da tela deixa de ser conferido", P, "  if (prtDonoDaTela !== prtChaveDoDono()) { prtLimparTela(); prtDonoDaTela = prtChaveDoDono(); }", "  prtDonoDaTela = prtChaveDoDono();"],
  ["login: PIN e senha da mesma matrícula contam como o mesmo dono", P, "function prtChaveDoDono() { return `${authMatricula}|${sessaoDeLiderancaNaTela() ? \"senha\" : \"pin\"}`; }", "function prtChaveDoDono() { return `${authMatricula}`; }"],
  ["login: a limpeza esquece as listas e formulários", P, "  PRT_IDS_LISTAS.forEach(id => { const el = prtEl(id); if (el) el.innerHTML = \"\"; });\n", ""],
  ["login: a limpeza esquece campos e relato digitado", P, "  PRT_IDS_CAMPOS.forEach(id => { const el = prtEl(id); if (el) el.value = \"\"; });\n", ""],
  ["login: a limpeza esquece a mensagem em destaque", P, ".replace(/\\bpsc-aviso\\b/g, \"\")", ""],
  ["login: a limpeza esquece os blocos abertos", P, "  PRT_IDS_BLOCOS.forEach(id => { const el = prtEl(id); if (el) el.style.display = \"none\"; });\n", ""],
  ["login: a limpeza não invalida os pedidos a caminho (meu painel)", P, "  prtSeqMeu++; prtSeqLista++; prtSeqDetalhe++; prtSeqRelato++; prtSeqPadroes++; prtSeqComite++; prtSeqRel++; prtSeqEquipes++;", "  prtSeqPadroes++; prtSeqComite++; prtSeqRel++; prtSeqEquipes++;"],
  ["login: a limpeza não para o relógio", P, "  prtPararRelogio();\n  // pedidos que ainda estão a caminho", "  // pedidos que ainda estão a caminho"],
  ["login: o meu painel descarta resposta velha — não descarta", P, "  if (seq !== prtSeqMeu) return;   // resposta velha: a pessoa trocou de login ou recarregou\n", ""],
  ["login: o catálogo de outra sessão entra", P, "  if (dono !== prtDonoDaTela) return prtCatalogos;   // a pessoa trocou de login enquanto o catálogo vinha: o dela é outro (a tela é refeita no próximo carregamento)\n", ""],

  // ---------------------------------------------------------------- padrões, Comitê, relatório
  ["comitê: clero e leigo trocados", P, "prtSelo(m.clerigo ? \"cal-st-deferido\" : \"cal-st-cancelado\", m.clerigo ? \"clero\" : \"leigo\")", "prtSelo(m.clerigo ? \"cal-st-deferido\" : \"cal-st-cancelado\", m.clerigo ? \"leigo\" : \"clero\")"],
  ["comitê: não mostra as pendências do servidor", P, "    ${problemas.length ? `<ul class=\"prt-lista\">${problemas.map(p => `<li>${escaparHtmlEbd(p)}</li>`).join(\"\")}</ul>` : \"\"}\n", ""],
  ["comitê: não explica quem entra no Comitê", P, "Quem entra no Comitê é cadastrado pelo papel «${escaparHtmlEbd(c.papel || \"Comitê de Proteção\")}» em Administração de Acesso → Permissões → Atribuir acesso a uma pessoa.", ""],
  ["relatório: o ano não vai ao servidor", P, "const data = await prtObter(ano ? `relatorio-anual?ano=${ano}` : \"relatorio-anual\");", "const data = await prtObter(\"relatorio-anual\");"],
  ["relatório: o seletor de anos vai a 2023", P, "for (let a = atual; a >= 2024; a--) anos.push(a);", "for (let a = atual; a >= 2023; a--) anos.push(a);"],
  ["relatório: a resposta atrasada entra", P, "  if (seq !== prtSeqRel) return;\n", ""],
  ["relatório: imprimir sem a classe de impressão", P, "  if (classes) classes.add(\"prt-imprimindo\");\n", ""],
  ["relatório: a classe de impressão não é retirada", P, "  try { window.print(); } finally { if (classes) classes.remove(\"prt-imprimindo\"); }", "  window.print();"],
  ["padrões: a ficha do incidente não abre", P, "  prtCarregarIncidentesAcao();\n  prtAbrirDetalheAcao(incidenteId);", "  prtCarregarIncidentesAcao();"],
  ["saída da aba: padrões, Comitê e relatório ficam na página", P, "  prtSeqPadroes++; prtSeqComite++; prtSeqRel++;\n  [\"prtListaIncidentes\", \"prtPadroesLista\", \"prtComiteLista\", \"prtRelImprimivel\"].forEach(id => { const el = prtEl(id); if (el) el.innerHTML = \"\"; });\n", "  const lista0 = prtEl(\"prtListaIncidentes\"); if (lista0) lista0.innerHTML = \"\";\n"],
  ["padrões: a resposta atrasada entra", P, "  if (seq !== prtSeqPadroes) return;\n", ""],

  // ---------------------------------------------------------------- acessibilidade e HTML
  ["a11y: o campo da descrição perde o rótulo", H, "<label for=\"prtRegDescricao\">O que aconteceu (de 10 a 1000 caracteres)</label>", ""],
  ["a11y: o relato perde o rótulo", H, "<label for=\"prtRegRelato\">O relato, do jeito que foi contado (de 10 a 4000 caracteres)</label>", ""],
  ["a11y: o aviso do registro perde o role=status", H, "<p id=\"prtRegMsg\" class=\"subtitle\" role=\"status\"></p>", "<p id=\"prtRegMsg\" class=\"subtitle\"></p>"],
  ["a11y: a lista de resultados da fila perde o role=status", H, "<p id=\"prtListaResultado\" class=\"subtitle\" role=\"status\"></p>", "<p id=\"prtListaResultado\" class=\"subtitle\"></p>"],
  ["a11y: os níveis perdem o fieldset", H, "<fieldset class=\"prt-nivel-grupo\">\n                <legend>O que aconteceu?</legend>\n                <div id=\"prtRegNiveis\"></div>\n              </fieldset>", "<div id=\"prtRegNiveis\"></div>"],
  ["a11y: a pílula perde o aria-pressed", P, "    if (btn && btn.setAttribute) btn.setAttribute(\"aria-pressed\", nome === secao ? \"true\" : \"false\");\n", ""],
  ["a11y: o relógio perde o role=timer", P, "<span id=\"${domId}\" role=\"timer\" class=", "<span id=\"${domId}\" class="],
  ["a11y: a caixa do relato perde o rótulo", P, " role=\"region\" aria-label=\"Relato guardado (a leitura fica registrada)\"", ""],
  // ---------------------------------------------------------------- v7.8, revisão independente: M1 a M5, L1 a L12 e os extras
  // M1: respostas atrasadas depois de sair da aba ou de trocar de seção (cada defesa é dupla: as duas camadas juntas)
  ["M1: o catálogo atrasado monta a fila depois de sair da aba (as três checagens desfeitas juntas)", P, [
    ["  if (geracao !== prtGeracao || !prtTelaViva()) return;\n", ""],
    ["  if (!prtTelaViva() || prtSecaoAtual !== \"incidentes\") return;\n  const filtro = prtFiltroEscolhido();", "  const filtro = prtFiltroEscolhido();"],
    ["  if (!prtTelaViva() || prtSecaoAtual !== \"incidentes\") return;   // a pessoa saiu da aba ou foi para outra seção enquanto a fila vinha: nada é escrito e o relógio não religa\n", ""]
  ]],
  ["M1: a fila atrasada de outra seção reescreve a lista e religa o relógio (contador e checagens de seção desfeitos juntos)", P, [
    ["    prtSeqLista++; prtSeqPadroes++; prtSeqComite++; prtSeqRel++;\n", "    prtSeqPadroes++; prtSeqComite++; prtSeqRel++;\n"],
    ["  if (!prtTelaViva() || prtSecaoAtual !== \"incidentes\") return;\n  const filtro = prtFiltroEscolhido();", "  if (!prtTelaViva()) return;\n  const filtro = prtFiltroEscolhido();"],
    ["  if (!prtTelaViva() || prtSecaoAtual !== \"incidentes\") return;   // a pessoa saiu da aba ou foi para outra seção enquanto a fila vinha: nada é escrito e o relógio não religa\n", "  if (!prtTelaViva()) return;\n"]
  ]],
  ["M1: os padrões, o Comitê e o relatório atrasados entram na seção que ficou para trás", P, "    prtSeqLista++; prtSeqPadroes++; prtSeqComite++; prtSeqRel++;\n", "    prtSeqLista++;\n"],

  // M2: o botão do canal público fica travado depois do envio; o segundo toque não apaga o número do pedido
  ["M2: depois de enviar o botão do canal público não fica travado", P, "  if (prtAjudaEnviada[ctx]) { const b = prtEl(`prtAjuda${ctx}Botao`); if (b) b.disabled = true; }\n", ""],
  ["M2: o segundo toque com o campo vazio mostra a validação por cima do número do pedido", P, "  if (prtAjudaEnviada[ctx] && !texto) return;\n", ""],
  ["M2: voltar a digitar não destrava o botão", P, "  prtAjudaEnviada[ctx] = false;\n  const botao = prtEl(`prtAjuda${ctx}Botao`);\n  if (botao) botao.disabled = false;", "  prtAjudaEnviada[ctx] = false;"],
  ["M2: o campo do texto não avisa que foi mexido", P, " data-on-input=\"prtEditouAjudaAcao\" data-args-input=\"${argsAttr(ctx)}\"", ""],

  // M3: o registro repetido de uma suspeita
  ["M3: a suspeita repetida sem exigeComunicacao diz que não é preciso fazer nada", P, "  const exige = data.exigeComunicacao === true || nivelEscolhido === \"ALEGACAO\" || data.nivel === \"ALEGACAO\";", "  const exige = data.exigeComunicacao === true;"],
  ["M3: o nível que a pessoa escolheu não vai para a resposta", P, "prtMostrarRespostaRegistro(data, c.nivel);", "prtMostrarRespostaRegistro(data);"],

  // M4: a confirmação do canal público mostra o que o servidor diz
  ["M4: sem aviso à liderança a caixa continua verde e sem 'Ligue agora'", P, "  const semAviso = data.avisada === false;", "  const semAviso = false;"],
  ["M4: a confirmação ignora o texto do servidor (promete aviso sempre)", P, "  const mensagem = typeof data.mensagem === \"string\" && data.mensagem.trim() ? data.mensagem : \"Recebemos o que você contou. Se existe", "  const mensagem = \"Recebemos o que você contou. Pessoas preparadas da liderança da Igreja foram avisadas. Ligue 100 ou 190.\"; const naoUsada = \"Recebemos o que você contou. Se existe"],

  // M5: a ficha de uma suspeita aberta traz o NÃO FAÇA
  ["M5: a ficha da suspeita aberta não traz o NÃO FAÇA", P, "    ${inc.nivel === \"ALEGACAO\" && aberto ? `<div class=\"prt-roteiro\" role=\"note\" id=\"prtFichaNaoFaca\">${prtHtmlNaoFaca()}</div>` : \"\"}\n", ""],
  ["M5: o NÃO FAÇA aparece na ficha de qualquer nível", P, "${inc.nivel === \"ALEGACAO\" && aberto ? `<div class=\"prt-roteiro\"", "${aberto ? `<div class=\"prt-roteiro\""],
  ["M5: o NÃO FAÇA aparece também na ficha já encerrada", P, "${inc.nivel === \"ALEGACAO\" && aberto ? `<div class=\"prt-roteiro\"", "${inc.nivel === \"ALEGACAO\" ? `<div class=\"prt-roteiro\""],

  // L1: depois do vínculo o botão de vincular não volta
  ["L1: com uma pessoa do cadastro já vinculada o botão de vincular continua", P, "const podeVincular = !!(d.acoes && d.acoes.vincularEnvolvido) && !jaTemMembro;", "const podeVincular = !!(d.acoes && d.acoes.vincularEnvolvido);"],

  // L2: o relógio do servidor no formulário da comunicação
  ["L2: o padrão do formulário da comunicação usa o relógio do aparelho", P, "  const d = new Date(prtAgoraServidor());", "  const d = new Date();"],
  ["L2: a conferência de 'no futuro' usa o relógio do aparelho", P, "if (quando.getTime() > prtAgoraServidor() + 5 * 60000) {", "if (quando.getTime() > Date.now() + 5 * 60000) {"],

  // L3: o modal de anexos do incidente
  ["L3: o modal de anexos do incidente sobrevive à saída da sessão", P, "  prtFecharModalDeAnexos();   // o nome de um arquivo anexado pode ter o nome da criança: o modal não sobrevive à saída da sessão nem à troca de login\n", ""],
  ["L3: o módulo fecha o modal de anexos de qualquer tela", P, "contexto.tabela === \"IncidentesProtecao\" && document.getElementById(\"listaAnexosModal\")", "contexto && document.getElementById(\"listaAnexosModal\")"],

  // L4: erro sem mensagem no canal público
  ["L4: o erro sem mensagem do servidor deixa a caixa sem o 'NÃO foi enviada'", P, "  const mensagem = typeof data.mensagem === \"string\" && data.mensagem.trim() ? data.mensagem : PRT_MSG_AJUDA_FALHA;", "  const mensagem = data.mensagem || \"\";"],

  // L5: o texto da criança não se perde sem querer
  ["L5: o texto digitado durante o envio é apagado", P, "    if (enviado && prtTexto(id) !== igual) { sobrou = true; return; }\n", ""],
  ["L5: 'Voltar' apaga o texto não enviado sem perguntar", P, "  if (prtTexto(\"prtAjudaPubTexto\") || prtTexto(\"prtAjudaPubContato\")) {", "  if (false) {"],
  ["L5: cancelar a pergunta de sair não devolve o foco ao campo", P, "Quer sair mesmo?\", \"Sair e apagar\"))) { prtFocarId(\"prtAjudaPubTexto\"); return; }", "Quer sair mesmo?\", \"Sair e apagar\"))) { return; }"],

  // L6: o botão do ato não fica mudo sem o catálogo
  ["L6: sem o catálogo o botão do ato fica mudo", P, "  if (!prtCatalogos) {\n    const id = prtIncidenteAberto(), geracao = prtGeracao;", "  if (!prtCatalogos) return;\n  if (false) {\n    const id = prtIncidenteAberto(), geracao = prtGeracao;"],
  ["L6: o catálogo que não carregou não é avisado", P, "if (!prtCatalogos) { prtEscreverAviso(\"prtDetalheMsg\", \"Não foi possível carregar as opções deste ato agora. Verifique a internet e toque de novo no botão.\", true); prtRolarPara(\"prtDetalheMsg\"); return; }", "if (!prtCatalogos) { return; }"],

  // L7: o roteiro não numera duas vezes
  ["L7: o número escrito à mão fica no passo do roteiro (1. 1. Acolher)", P, "  return String(passo == null ? \"\" : passo).replace(/^\\s*\\d+\\s*[.)\\-–]\\s*/, \"\");", "  return String(passo == null ? \"\" : passo);"],

  // L8: impressão (CSS)
  ["L8: o relato fica na folha num Ctrl+P comum", C, "  #prtRelatoCx, #prtDetalheCx { display: none !important; }\n", ""],
  ["L8: o resto da página só fica invisível na impressão do relatório (folha em branco no fim)", C, "    body.prt-imprimindo *:not(#prtRelImprimivel):not(#prtRelImprimivel *):not(:has(#prtRelImprimivel)) { display: none !important; }\n", ""],
  ["L8: as pastas do relatório guardam a altura mínima na impressão (âncora 7B)", C, "body.prt-imprimindo *:has(#prtRelImprimivel) { display: block !important; position: static !important; width: auto !important; max-width: none !important; min-height: 0 !important; ", "body.prt-imprimindo *:has(#prtRelImprimivel) { display: block !important; position: static !important; width: auto !important; max-width: none !important; "],
  ["L8: a impressão do relatório perde a reserva de visibility:hidden", C, "  body.prt-imprimindo * { visibility: hidden !important; }\n", ""],

  // L9: foco
  ["L9: abrir a ficha não leva o foco ao título", P, "  prtFocarId(\"prtDetalheTitulo\");   // a ficha (ou a ficha refeita depois de um ato) acabou de aparecer: o foco vai para o título dela, não fica num botão que deixou de existir\n", ""],
  ["L9: o título da ficha não aceita foco (sem tabindex)", P, "<h4 id=\"prtDetalheTitulo\" tabindex=\"-1\">", "<h4 id=\"prtDetalheTitulo\">"],
  ["L9: o formulário do ato abre sem levar o foco ao primeiro campo", P, "  prtFocarId(PRT_PRIMEIRO_CAMPO[tipo]);   // o foco vai para o primeiro campo do formulário que acabou de abrir\n", ""],
  ["L9: cancelar o formulário não devolve o foco ao botão que o abriu", P, "  if (gatilho && gatilho.isConnected) prtFocar(gatilho);\n", ""],
  ["L9: o botão que abre o formulário não entrega o elemento (sem gatilho)", P, "botao(\"prtAbrirFormAcao\", [\"comunicacao\", 0, ARG.elemento]", "botao(\"prtAbrirFormAcao\", [\"comunicacao\", 0]"],
  ["L9: o relato abre sem levar o foco à caixa dele", P, "  prtFocar(cx);   // quem usa teclado ou leitor de tela cai no relato que acabou de abrir\n", ""],
  ["L9: fechar o relato não devolve o foco ao botão de ler", P, "  prtFocarId(\"prtLerRelatoBotao\");   // o foco volta ao botão de ler (a caixa que o continha acabou de sumir)\n", ""],
  ["L9: fechar a ficha não devolve o foco ao 'Abrir' do incidente", P, "  prtFocarId(`prtAbrirCartao${id}`);   // o foco volta ao \"Abrir\" do incidente de onde a pessoa veio (o botão da ficha que fechou não existe mais)\n", ""],
  ["L9: a resposta do registro não recebe o foco", P, "  prtFocarId(\"prtRegRespostaTitulo\");\n", ""],
  ["L9: a falha da ficha (404) não recebe o foco", P, "    prtFocarId(\"prtDetalheErro\");\n", ""],
  ["L9: a falha do canal público não recebe o foco", P, "`;\n  prtFocar(el);\n}\nfunction prtMostrarSucessoAjuda", "`;\n}\nfunction prtMostrarSucessoAjuda"],
  ["L9: a confirmação do canal público não recebe o foco", P, "`;\n  prtFocar(el);\n}\nasync function prtEnviarAjudaAcao", "`;\n}\nasync function prtEnviarAjudaAcao"],
  ["L9: a validação do canal público não leva o foco ao campo", P, "prtEscreverAjuda(ctx, problema); prtFocarId(`prtAjuda${ctx}Texto`); return; }", "prtEscreverAjuda(ctx, problema); return; }"],

  // L10: o resultado que encerra sem avisar o Conselho Tutelar nunca é o primeiro
  ["L10: 'sem conteúdo de proteção' volta a ser a primeira opção do encerramento", P, "  return [...possiveis.filter(r => r.codigo !== PRT_RESULTADO_SEM_CONTEUDO), ...possiveis.filter(r => r.codigo === PRT_RESULTADO_SEM_CONTEUDO)];", "  return possiveis;"],

  // L11: o módulo ausente ou velho no cache não quebra a navegação nem a saída da sessão
  ["L11: sair da sessão sem o módulo da proteção quebra (sem a guarda)", S, "  if (typeof prtLimparTela === \"function\") prtLimparTela();\n", "  prtLimparTela();\n"],
  ["L11: trocar de aba sem o módulo da proteção quebra (sem a guarda)", D, "  if (aba !== \"protecao\" && typeof prtAbaFechada === \"function\") prtAbaFechada();", "  if (aba !== \"protecao\") prtAbaFechada();"],
  ["L11: abrir a aba da proteção sem o módulo quebra (sem a guarda)", D, "  if (aba === \"protecao\" && typeof carregarOpcoesProtecaoAcao === \"function\") carregarOpcoesProtecaoAcao();\n", "  if (aba === \"protecao\") carregarOpcoesProtecaoAcao();\n"],
  ["L11: a sub-aba da proteção sem o módulo quebra (sem a guarda)", S, "  if (sub === \"protecao\" && typeof carregarMeuPainelProtecaoAcao === \"function\") carregarMeuPainelProtecaoAcao();\n", "  if (sub === \"protecao\") carregarMeuPainelProtecaoAcao();\n"],

  // L12: o aviso do servidor e a aba dizem o mesmo lugar para cadastrar o Comitê
  ["L12: a aba do Comitê manda cadastrar num lugar que não existe", P, "Administração de Acesso → Permissões → Atribuir acesso a uma pessoa. Se é do clero ou leigo", "Proteção de Crianças → Comitê. Se é do clero ou leigo"],
  ["L12: o texto fixo da seção Comitê (index.html) manda cadastrar num lugar que não existe", H, "em Administração de Acesso → Permissões → Atribuir acesso a uma pessoa.</p>", "em Proteção de Crianças → Comitê.</p>"],

  // extras: (a) campos que não podem ir para o corretor nem para o preenchimento automático do navegador
  ["campos: o relato do registro volta a passar pelo corretor ortográfico", H, "<textarea id=\"prtRegRelato\" rows=\"5\" maxlength=\"4000\" autocomplete=\"off\" spellcheck=\"false\"", "<textarea id=\"prtRegRelato\" rows=\"5\" maxlength=\"4000\" autocomplete=\"off\""],
  ["campos: o texto da criança passa pelo corretor ortográfico", P, "maxlength=\"4000\" autocomplete=\"off\" spellcheck=\"false\" placeholder=", "maxlength=\"4000\" autocomplete=\"off\" placeholder="],
  ["campos: o texto do adendo passa pelo corretor ortográfico", P, "<textarea id=\"prtFaTexto\" rows=\"4\" maxlength=\"2000\" spellcheck=\"false\" autocomplete=\"off\"", "<textarea id=\"prtFaTexto\" rows=\"4\" maxlength=\"2000\""],
  ["campos: o relato da reclassificação passa pelo corretor ortográfico", P, "<textarea id=\"prtFrRelato\" rows=\"4\" maxlength=\"4000\" spellcheck=\"false\" autocomplete=\"off\"", "<textarea id=\"prtFrRelato\" rows=\"4\" maxlength=\"4000\""],
  ["campos: o nome do envolvido vai para o preenchimento automático", H, "<input type=\"text\" id=\"prtRegEnvNome\" maxlength=\"150\" autocomplete=\"off\" />", "<input type=\"text\" id=\"prtRegEnvNome\" maxlength=\"150\" />"],
  ["campos: a descrição do fato vai para o preenchimento automático", H, "<textarea id=\"prtRegDescricao\" rows=\"4\" maxlength=\"1000\" autocomplete=\"off\"", "<textarea id=\"prtRegDescricao\" rows=\"4\" maxlength=\"1000\""],
  ["campos: o 'onde' vai para o preenchimento automático", H, "<input type=\"text\" id=\"prtRegOnde\" maxlength=\"150\" autocomplete=\"off\"", "<input type=\"text\" id=\"prtRegOnde\" maxlength=\"150\""],
  ["campos: a matrícula do envolvido vai para o preenchimento automático", H, "<input type=\"number\" id=\"prtRegEnvMatricula\" min=\"1\" autocomplete=\"off\" />", "<input type=\"number\" id=\"prtRegEnvMatricula\" min=\"1\" />"],

  // extras: (b) o relógio ao voltar para o navegador
  ["relógio: voltar para o navegador não refaz o relógio", P, "document.addEventListener(\"visibilitychange\", prtVisibilidadeMudou);\n", ""],
  ["relógio: refaz o relógio mesmo com a página escondida", P, "  if (document.visibilityState === \"hidden\") return;\n  prtTique();", "  prtTique();"],

  // extras: (c) o limite de 30 s do envio público
  ["público: o envio não tem limite de tempo", P, "  const limite = controle ? setTimeout(() => controle.abort(), PRT_MS_LIMITE_AJUDA) : null;", "  const limite = null;"],
  ["público: o limite do envio é de 5 minutos", P, "const PRT_MS_LIMITE_AJUDA = 30000;", "const PRT_MS_LIMITE_AJUDA = 300000;"],
  ["público: o temporizador do envio não é desarmado", P, "    if (limite != null) clearTimeout(limite);\n", ""],

  // Trava 7-B: "a pessoa envolvida é da liderança?", o selo "só Diretoria e Comitê", o ato que dá certo com um alerta e o texto da lei ("imediatamente")
  ["7B: a pergunta da liderança não é montada no formulário", P, "  prtMontarPerguntaLideranca();\n", ""],
  ["7B: a pergunta da liderança é montada de novo a cada abertura (duplica)", P, "  if (prtEl(\"prtRegLiderancaCx\")) return;\n", ""],
  ["7B: a pergunta começa em 'sim'", P, [
    ["value=\"nao\" checked />", "value=\"nao\" />"],
    ["value=\"sim\" />", "value=\"sim\" checked />"]
  ]],
  ["7B: o registro não manda envolvidoDaLideranca", P, "  corpo.envolvidoDaLideranca = c.envLideranca === true;", "  "],
  ["7B: o 'sim' não chega ao corpo do registro", P, "envLideranca: prtLiderancaEnvolvida(),", "envLideranca: false,"],
  ["7B: envolvidoDaLideranca vai como texto (o servidor responde 422)", P, "  corpo.envolvidoDaLideranca = c.envLideranca === true;", "  corpo.envolvidoDaLideranca = String(c.envLideranca === true);"],
  ["7B: a pergunta não volta para 'não' depois de registrar", P, "  prtVoltarLiderancaParaNao();   // o próximo registro começa em \"não\"\n", ""],
  ["7B: a troca de login deixa o 'sim' da pessoa anterior marcado", P, "  prtVoltarLiderancaParaNao();   // a resposta da pessoa anterior não fica marcada para quem entra depois\n", ""],
  ["7B: a confirmação da suspeita com 'sim' promete o aviso à liderança local", P, "  const quem = c.envLideranca ? ", "  const quem = false ? "],
  ["7B: o selo 'só Diretoria e Comitê' some", P, "    i.somenteNivelGeral === true ? prtSelo(\"cal-st-indeferido\", \"🔒 só Diretoria e Comitê\") : \"\",\n", ""],
  ["7B: o selo 'só Diretoria e Comitê' aparece em todo caso", P, "    i.somenteNivelGeral === true ? prtSelo(", "    true ? prtSelo("],
  ["7B: a ficha não explica por que o caso é só do nível geral", P, "    ${prtHtmlSoNivelGeral(inc)}\n", ""],
  ["7B: a ficha dá o porquê errado (liderança apontada vira 'sem matrícula')", P, "    : inc.envolvidoDaLideranca === true ? \"quem registrou", "    : false ? \"quem registrou"],
  ["7B: o aviso que não saiu do sistema (texto ATENÇÃO) não vira alerta", P, " || String(data.mensagem == null ? \"\" : data.mensagem).includes(\"ATENÇÃO:\");", ";"],
  ["7B: o sucesso com alerta solta o toast de sucesso", P, "mostrarToast(texto, (data && data.sucesso === false) || alerta ? \"erro\" : \"sucesso\");", "mostrarToast(texto, (data && data.sucesso === false) ? \"erro\" : \"sucesso\");"],
  ["7B: o sucesso com alerta não fica em destaque no formulário", P, "  prtEscreverAviso(idMensagem, texto, destaque || alerta || !!(data && data.sucesso === false));", "  prtEscreverAviso(idMensagem, texto, destaque || !!(data && data.sucesso === false));"],
  ["7B: o alerta não fica em destaque na ficha refeita", P, "  if (ok) prtEscreverAviso(\"prtDetalheMsg\", prtMsgErro(data), prtTemAlerta(data));", "  if (ok) prtEscreverAviso(\"prtDetalheMsg\", prtMsgErro(data), false);"],
  ["7B: a resposta do registro mantém o ✅ com o alerta", P, "  const alerta = prtTemAlerta(data);\n  cx.innerHTML", "  const alerta = false;\n  cx.innerHTML"],
  ["7B: a resposta da suspeita volta a dizer 'em até 24 horas'", P, "<p><strong>A lei manda comunicar ao Conselho Tutelar imediatamente.</strong> Prazo máximo da Igreja: ${data.prazoEm ? prtDataHora(data.prazoEm) : \"24 horas depois de a Igreja ficar sabendo\"}.</p>", "<p><strong>Prazo para comunicar o Conselho Tutelar:</strong> ${data.prazoEm ? prtDataHora(data.prazoEm) : \"em até 24 horas depois de a Igreja ficar sabendo\"}</p>"],
  ["7B: o aviso da suspeita (index.html) volta a dizer 'em até 24 horas'", H, "A lei manda comunicar ao Conselho Tutelar imediatamente; o prazo máximo da Igreja é de 24 horas. Ao enviar, esse prazo", "A lei manda comunicar ao Conselho Tutelar em até 24 horas. Ao enviar, o prazo"],
  ["7B: o topo da aba (index.html) volta a dizer 'em até 24 horas'", H, "<strong>comunicada ao Conselho Tutelar imediatamente</strong> (ECA, art. 13; a omissão tem multa, art. 245); o prazo máximo da Igreja é de 24 horas.", "<strong>comunicada ao Conselho Tutelar em até 24 horas</strong> (ECA, art. 13; a omissão tem multa, art. 245)."],

  // extras: (d) a data volta para hoje depois de registrar
  ["registro: a data do fato anterior fica para o próximo registro", P, "  if (dia) dia.value = calHojeBrasilia();   // o próximo registro começa em hoje (a data do fato anterior não fica)\n", ""],
];

const vivo = setInterval(() => {}, 1000);   // um ato esperando para sempre não pode encerrar o processo em silêncio
(async () => {
  const filtro = process.argv[2] || "";
  let acusadas = 0; const escaparam = [], inaplicaveis = [];
  const lista = MUTACOES.filter(m => m[0].includes(filtro));
  const base = await rodar({});
  console.log(`base (sem mutação): ${base.total} verificações, ${base.falhas.length} falhas`);
  if (base.falhas.length) { base.falhas.forEach(f => console.log("  ✗ " + f)); process.exit(2); }
  for (const [nome, arq, de, para] of lista) {
    let T;
    const pares = Array.isArray(de) ? de : [[de, para]];
    try { T = await Promise.race([rodar({ mutar: { [arq]: pares } }), new Promise((_, rej) => setTimeout(() => rej(new Error("TRAVOU (mais de 120 s)")), 120000))]); } catch (e) { inaplicaveis.push(`${nome}: ${e.message}`); console.log(`INAPLICÁVEL  ${nome}: ${e.message.slice(0, 120)}`); continue; }
    if (T.falhas.some(f => /mutação inaplicável/.test(f))) { inaplicaveis.push(nome + ": " + T.falhas.find(f => /mutação inaplicável/.test(f)).slice(0, 160)); console.log("INAPLICÁVEL  " + nome); continue; }
    if (T.falhas.length) { acusadas++; console.log(`acusada (${String(T.falhas.length).padStart(2)})  ${nome}  ←  ${T.falhas[0].slice(0, 110)}`); }
    else { escaparam.push(nome); console.log(`ESCAPOU      ${nome}`); }
  }
  console.log(`\nmutações: ${lista.length} · acusadas: ${acusadas} · escaparam: ${escaparam.length} · inaplicáveis: ${inaplicaveis.length}`);
  escaparam.forEach(n => console.log("  ESCAPOU: " + n));
  inaplicaveis.forEach(n => console.log("  INAPLICÁVEL: " + n));
  clearInterval(vivo);
  process.exit(escaparam.length || inaplicaveis.length ? 1 : 0);
})();
