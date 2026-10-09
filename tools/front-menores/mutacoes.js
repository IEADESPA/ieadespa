// mutacoes.js — desfaz, uma a uma, as correções que o roteiro deve proteger; cada mutação TEM de ser acusada (pelo menos uma falha no roteiro).
"use strict";
const { rodar } = require("./roteiro");
const M = "modulos/ministerio-menores.js", E = "modulos/escalas.js", D = "modulos/meus-dados.js", P = "modulos/pessoas.js", L = "modulos/meu-painel.js";

const MUTACOES = [
  // ---- escape (texto do servidor entrando como marcação) ----
  ["escape: pendência da situação (mensagem)", M, "<br />${escaparHtmlEbd(b.mensagem)}</li>", "<br />${b.mensagem}</li>"],
  ["escape: nome do menor (Meu Painel)", M, "<h5>${escaparHtmlEbd(m.nome)} <span class=\"psc-legenda\">${idade}", "<h5>${m.nome} <span class=\"psc-legenda\">${idade}"],
  ["escape: mensagem do estado da autorização", M, "<p style=\"margin:4px 0;\">${escaparHtmlEbd(e.mensagem)}</p>", "<p style=\"margin:4px 0;\">${e.mensagem}</p>"],
  ["escape: itens da política", M, "`<li>${escaparHtmlEbd(i.texto)}</li>`", "`<li>${i.texto}</li>`"],
  ["escape: hash no atributo data-texto-hash (política)", M, "id=\"mnrPoliticaAceite\" data-texto-hash=\"${escaparHtmlEbd(p.hash)}\"", "id=\"mnrPoliticaAceite\" data-texto-hash=\"${p.hash}\""],
  ["escape: hash no atributo data-texto-hash (autorização)", M, "data-texto-hash=\"${escaparHtmlEbd(texto.hash)}\"", "data-texto-hash=\"${texto.hash}\""],
  ["escape: nome do voluntário no painel", M, "<h5>${escaparHtmlEbd(v.nome)} <span", "<h5>${v.nome} <span"],
  ["escape: rótulo do bloqueio no painel", M, "<li>${escaparHtmlEbd(b.rotulo || b.codigo)}${b.venceuEm", "<li>${b.rotulo || b.codigo}${b.venceuEm"],
  ["escape: nome na comunicação da Diretoria", M, "<h5>${escaparHtmlEbd(a.nome)} <span class=\"psc-legenda\">matrícula ${Number(a.membroId)}", "<h5>${a.nome} <span class=\"psc-legenda\">matrícula ${Number(a.membroId)}"],
  ["escape: ficha do responsável (nome do menor)", M, "const cabecalho = `<h5>${escaparHtmlEbd(m.nome)} <span", "const cabecalho = `<h5>${m.nome} <span"],
  ["escape: Meus Dados (equipe da retirada)", M, "${mnrDataHora(r.em)} — ${escaparHtmlEbd(r.equipe)} (", "${mnrDataHora(r.em)} — ${r.equipe} ("],
  ["escape: Meus Dados (menor do responsável)", M, "(${escaparHtmlEbd(x.menor)})", "(${x.menor})"],
  ["escape: aviso das equipes sem a marca", M, "<li>${escaparHtmlEbd(e.nome)}${e.congregacaoNome ? ` — ${escaparHtmlEbd(e.congregacaoNome)}` : \"\"}</li>", "<li>${e.nome}${e.congregacaoNome ? ` — ${e.congregacaoNome}` : \"\"}</li>"],
  ["escape: nome da sala (escalas)", E, "<h5>${escaparHtmlEbd(s.equipeNome)} ${s.ok", "<h5>${s.equipeNome} ${s.ok"],
  ["escape: problema de publicação (alerta)", E, "<ul class=\"mnr-problemas\">${problemas.map(p => `<li>${escaparHtmlEbd(p.mensagem)}", "<ul class=\"mnr-problemas\">${problemas.map(p => `<li>${p.mensagem}"],
  ["escape: nome da equipe no seletor da Habilitação", E, "Faixa etária da equipe ${escaparHtmlEbd(e.nome)}</label>", "Faixa etária da equipe ${e.nome}</label>"],
  // ---- o hash que a tela mostrou é o que vai ----
  ["hash: aceite da política sem o hash mostrado", M, "{ aceito: true, textoHash }", "{ aceito: true, textoHash: \"fixo\" }"],
  ["hash: aceite da política sem o aceito:true", M, "{ aceito: true, textoHash }", "{ textoHash }"],
  ["hash: autorização sem o hash do texto mostrado", M, "{ menorId: id, finalidade, aceito: true, termoHash }", "{ menorId: id, finalidade, aceito: true, termoHash: \"\" }"],
  ["hash: politicaMudou deixa de recarregar", M, "if (mnrTextoMudou(data, \"politicaMudou\")) { await recarregar(); return; }", "if (false) { await recarregar(); return; }"],
  ["hash: termoMudou deixa de reabrir o texto", M, "if (mnrTextoMudou(data, \"termoMudou\")) { await reabrir(); return; }", "if (false) { await reabrir(); return; }"],
  ["hash: o aceite sai sem a caixa marcada", M, "if (!caixa || !caixa.checked) { mnrEscreverAviso(\"mnrPoliticaMsg\"", "if (!caixa) { mnrEscreverAviso(\"mnrPoliticaMsg\""],
  // ---- confirmação reforçada (428) e confirmações ----
  ["428: o formulário fecha quando a confirmação não vem", M, "if (data.sucesso === false) return;   // recusa de regra (inclusive a confirmação que não veio)", "if (data.sucesso === false) { mnrFecharDecisaoAcao(id); return; }   // recusa"],
  ["428: a mensagem de confirmação reforçada some", M, "if (res.status === 428 || corpo.precisaFator) corpo.mensagem =", "if (false) corpo.mensagem ="],
  ["428: observação conferida só depois (a confirmação de identidade é pedida à toa)", M, "if (observacao.length < 10 || observacao.length > 300 || mnrTemMarca(observacao)) { erro(", "if (false) { erro("],
  ["confirmação: decidir sem o 'tem certeza'", M, "if (!(await confirmarAcao(aviso, tipo === \"decidir\" ? \"Registrar a decisão\" : \"Levantar o afastamento\"))) return;", ""],
  ["confirmação: comunicar à Diretoria sem o 'tem certeza'", M, "if (!(await confirmarAcao(aviso, \"Comunicar à Diretoria\"))) return;", ""],
  ["confirmação: revogar sem o 'tem certeza'", M, "if (!(await confirmarAcao(`Revogar a autorização", "if (false && !(await confirmarAcao(`Revogar a autorização"],
  ["confirmação: registrar o aceite em ficha sem o 'tem certeza'", M, "\"Registrar o aceite\"))) return;", "\"Registrar o aceite\") && false)) return;"],
  ["a própria comunicação ganha botão de decidir", M, "const propria = String(a.membroId) === String(authMatricula);", "const propria = false;"],
  // ---- troca de login e resposta atrasada ----
  ["login: o dono da tela deixa de ser conferido", M, "if (mnrDonoDaTela !== mnrChaveDoDono()) { mnrLimparTela(); mnrDonoDaTela = mnrChaveDoDono(); }", "mnrDonoDaTela = mnrChaveDoDono();"],
  ["login: PIN e senha da mesma matrícula contam como o mesmo dono", M, "return `${authMatricula}|${sessaoDeLiderancaNaTela() ? \"senha\" : \"pin\"}`;", "return `${authMatricula}`;"],
  ["login: a limpeza esquece as listas", M, "MNR_IDS_LISTAS.forEach(id => { const el = mnrEl(id); if (el) el.innerHTML = \"\"; });", ""],
  ["login: a limpeza esquece caixas e campos", M, "MNR_IDS_MARCAS.forEach(id => { const el = mnrEl(id); if (el) el.checked = false; });", ""],
  ["login: a limpeza esquece a mensagem em destaque", M, ".replace(/\\bpsc-aviso\\b/g, \"\")", ""],
  ["login: resposta atrasada de outro login entra na tela", M, "if (seq !== mnrSeqMeu) return;   // resposta velha: a pessoa trocou de login ou recarregou", ""],
  ["login: a troca de login não invalida pedidos a caminho", M, "mnrSeqMeu++; mnrSeqPainel++;", "mnrSeqPainel++;"],
  // ---- trava de duplo clique ----
  ["duplo clique: a trava some", M, "if (mnrEmCurso.has(chave)) { mostrarToast(\"Aguarde: o pedido anterior ainda está sendo processado.\", \"erro\"); return undefined; }", ""],
  ["duplo clique: o botão não é solto no fim", M, "if (botao) botao.disabled = false;\n    if (chave) mnrEmCurso.delete(chave);", "if (chave) mnrEmCurso.delete(chave);"],
  // ---- permissões e privacidade ----
  ["permissão: 'campo inteiro' para quem não é do nível geral", M, "const lista = mnrEhGeral() ? [{ congregacaoId: \"TODAS\"", "const lista = true ? [{ congregacaoId: \"TODAS\""],
  ["permissão: comunicações da Diretoria para qualquer um da gestão", M, "function mnrSecaoPermitida(secao) { return secao === \"comunicacoes\" ? mnrEhDiretoria() :", "function mnrSecaoPermitida(secao) { return secao === \"comunicacoes\" ? true :"],
  ["privacidade: o painel mostra o código no lugar do rótulo", M, "<li>${escaparHtmlEbd(b.rotulo || b.codigo)}${b.venceuEm", "<li>${escaparHtmlEbd(b.codigo)}${b.venceuEm"],
  ["privacidade: a Secretaria é tratada como Diretoria (códigos reais)", M, "papeis: { gestao: !!papeis.gestao, geral: !!papeis.geral, diretoria: !!papeis.diretoria }", "papeis: { gestao: true, geral: true, diretoria: true }"],
  // ---- foto de menor ----
  ["foto: o envio continua à vista para o menor sem autorização", D, "if (envio) envio.style.display = minhaFotoBloqueadaParaMenor ? \"none\" : \"\";", "if (envio) envio.style.display = \"\";"],
  ["foto: o envio sai mesmo bloqueado", D, "if (minhaFotoBloqueadaParaMenor) { msg.textContent =", "if (false) { msg.textContent ="],
  ["foto: o aviso de um menor sobra para o próximo login", D, "if (minhaFotoDono !== authMatricula) { aplicarEnvioDaMinhaFoto(null); minhaFotoDono = authMatricula; }", ""],
  ["foto (Secretaria): consulta o consentimento genérico também para menor", P, "if (mnrEhMenorDeIdade(pessoa)) return;", ""],
  ["foto (Secretaria): o envio continua à vista sem autorização do responsável", M, "if (imagem) envio.style.display = \"none\";", ""],
  ["foto (Secretaria): presume menor sem data de nascimento", M, "return idade != null && idade < 18;", "return idade == null || idade < 18;"],
  // ---- escalas ----
  ["escalas: valor inválido de crianças vai ao servidor", E, "if (!/^\\d{1,3}$/.test(texto) || Number(texto) > 200) {", "if (false) {"],
  ["escalas: publicar 422 volta a mostrar só a mensagem", E, "if (Array.isArray(data.problemas) && data.problemas.length) {", "if (false) {"],
  ["escalas: ids como texto no POST das crianças", E, "body: JSON.stringify({ servicoId: Number(servicoId), equipeId: Number(equipeId), criancas: Number(texto) })", "body: JSON.stringify({ servicoId: String(servicoId), equipeId: String(equipeId), criancas: texto })"],
  ["escalas: a faixa sai em branco", E, "if (!faixa) { mostrarToast(\"Escolha a faixa etária da equipe.\", \"erro\"); return; }", ""],
  ["escalas: o seletor de faixa aparece em equipe sem a marca", E, "<td>${e.contatoComMenores ? `<label for=\"hvFaixa", "<td>${true ? `<label for=\"hvFaixa"],
  // ---- tipos dos argumentos ----
  ["tipo: menorId como texto na autorização", M, "{ menorId: id, finalidade, aceito: true, termoHash }", "{ menorId: String(id), finalidade, aceito: true, termoHash }"],
  ["tipo: matrícula como texto no aceite em ficha", M, "const membroId = mnrInteiro(mnrTexto(\"mnrRpMatricula\"))", "const membroId = mnrTexto(\"mnrRpMatricula\")"],
  ["tipo: equipeId como texto na faixa", M, "const equipeId = mnrInteiro(mnrTexto(\"mnrFaixaEquipe\")), faixa", "const equipeId = mnrTexto(\"mnrFaixaEquipe\"), faixa"],
  // ---- Meus Dados ----
  ["Meus Dados: o bloco do ministério com menores não é desenhado", L, "${mnrCartaoMeusDados(data.ministerioMenores)}", ""],
  ["Meus Dados: o bloco das autorizações não é desenhado", L, "${mnrCartaoConsentimentosMeusDados(data.consentimentosMenores)}", ""],
  // ---- cores e prazos ----
  ["prazo: amarelo deixa de valer (tudo verde)", M, "return dias <= mnrLimiteAlerta() ? \"cal-st-proposto\" : \"cal-st-homologado\";", "return \"cal-st-homologado\";"],
  ["prazo: vencido deixa de ser vermelho", M, "if (dias < 0) return \"cal-st-indeferido\";", "if (dias < 0) return \"cal-st-proposto\";"],
  // ---- comunicação à Diretoria ----
  ["comunicação: o formulário continua depois de enviada", M, "formCx.style.display = encerrada ? \"\" : \"none\";", "formCx.style.display = \"\";"],
  ["comunicação: envia sem a caixa 'ciente'", M, "if (!mnrMarcado(\"mnrAdCiente\")) { erro(", "if (false) { erro("],
  ["comunicação: aceita data no futuro", M, "if (dataCiencia > calHojeBrasilia()) {", "if (false) {"],
  // ---- revisão independente da tela (09/10/2026) ----
  ["reservado: a linha própria da pendência reservada some (volta a parecer pendência das certidões)", M, "const reservada = !!(v.antecedentes && v.antecedentes.situacao === \"PENDENCIA_DIRETORIA\");", "const reservada = false;"],
  ["escalas: ✗ também quando os adultos bastam", E, "(Number(s.adultos) || 0) >= (Number(s.necessarios) || 0) ? \"✓\" : \"✗\"", "s.ok ? \"✓\" : \"✗\""],
  ["escalas: salvar uma sala apaga o que foi digitado nas outras", E, "digitados.forEach(([idCampo, valor]) => {", "[].forEach(([idCampo, valor]) => {"],
  ["escalas: a faixa gravada deixa de aparecer escolhida", E, "sel.value = e.faixaEtariaMenores;", "void 0;"],
  ["foto de menor: o botão de consentimento próprio continua visível", M, "if (conceder) conceder.style.display = \"none\";", "void 0;"],
  ["foto de menor: sem ler o estado, o texto afirma que falta a autorização", M, "if (!imagem) {", "if (false) {"],
  ["avisos fixos: o erro tem a mesma cara do sucesso", M, "destaque || !!(data && data.sucesso === false)", "destaque"]
];

const vivo = setInterval(() => {}, 1000);   // um ato esperando para sempre não pode encerrar o processo em silêncio
(async () => {
  const filtro = process.argv[2] || "";
  let acusadas = 0, escaparam = [], inaplicaveis = [];
  const lista = MUTACOES.filter(m => m[0].includes(filtro));
  const base = await rodar({});
  console.log(`base (sem mutação): ${base.total} verificações, ${base.falhas.length} falhas`);
  if (base.falhas.length) { base.falhas.forEach(f => console.log("  ✗ " + f)); process.exit(2); }
  for (const [nome, arq, de, para] of lista) {
    let T;
    try { T = await Promise.race([rodar({ mutar: { [arq]: [[de, para]] } }), new Promise((_, rej) => setTimeout(() => rej(new Error("TRAVOU (mais de 120 s)")), 120000))]); } catch (e) { inaplicaveis.push(`${nome}: ${e.message}`); console.log(`INAPLICÁVEL  ${nome}: ${e.message.slice(0, 120)}`); continue; }
    if (T.falhas.length) { acusadas++; console.log(`acusada (${String(T.falhas.length).padStart(2)})  ${nome}  ←  ${T.falhas[0].slice(0, 110)}`); }
    else { escaparam.push(nome); console.log(`ESCAPOU      ${nome}`); }
  }
  console.log(`\nmutações: ${lista.length} · acusadas: ${acusadas} · escaparam: ${escaparam.length} · inaplicáveis: ${inaplicaveis.length}`);
  escaparam.forEach(n => console.log("  ESCAPOU: " + n));
  inaplicaveis.forEach(n => console.log("  INAPLICÁVEL: " + n));
  clearInterval(vivo);
  process.exit(escaparam.length || inaplicaveis.length ? 1 : 0);
})();
