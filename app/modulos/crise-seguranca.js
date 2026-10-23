// app/modulos/crise-seguranca.js — v7.15: Gestão de crise e porta-voz único (Regimento Art. 161-B) e segurança da congregação (plano de emergência, simulados, vistoria predial
// com AVCB e seguro, equipe de segurança). Contrato de 23/10/2026.
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo global com eles. Todos os nomes de nível superior começam com "crs"/"CRS_".
//
// Duas coisas sobre uma rota do servidor (GestaoCriseSeguranca: /api/crise/*):
//   1) a FAIXA "Crise ativa — porta-voz único: fulano" no alto de toda tela da liderança, enquanto houver regime de crise (lida no login e de tempos em tempos);
//   2) a aba "Crise e segurança", aberta a toda sessão de liderança, com as pílulas que o servidor libera: CRISE (nível geral: abrir, trocar o porta-voz, encerrar, ver o
//      aviso), MANIFESTAÇÕES (nível geral e o porta-voz), IMPRENSA (todo líder registra o pedido que chegou a ele; o porta-voz e o nível geral respondem) e SEGURANÇA
//      (Dirigente, Pastor de Área e nível geral, cada um no seu território: plano, simulados, vistoria, equipe, AVCB e seguro).
// Toda regra mora no servidor (shared/criseSeguranca.js e shared/criseSegurancaDb.js): aqui só se monta o que ele devolve e se manda o que a pessoa fez. 422 = recusa de regra,
// mostrada tal qual; 404 = a MESMA resposta para "não existe" e "não é seu"; 409 = mudou enquanto isso (a tela relê); 428 = confirmação reforçada da vD.4.
// Tudo o que vem do servidor e entra em innerHTML passa por escaparHtmlEbd; id de elemento e argumento de ação levam só número inteiro ou código validado aqui.
const CRS_ROTA = "crise";
const CRS_SECOES = ["crise", "manifestacoes", "imprensa", "seguranca"];
const CRS_TEMPO_LIMITE_MS = 25000;
// abrir, trocar o porta-voz e encerrar avisam a liderança inteira (o celular sai em paralelo dentro da resposta): a tela espera até 40 s (o servidor fecha a resposta antes de ~38 s)
const CRS_TEMPO_LIMITE_ATO_MS = 40000;
const CRS_FAIXA_INTERVALO_MS = 120000;            // a faixa é relida no máximo a cada 2 minutos, ao trocar de tela
const CRS_MSG_FATOR = "Este ato precisa de uma confirmação recente de quem você é (chave de acesso ou código por e-mail). Tente de novo e confirme quando a tela pedir.";
const CRS_MSG_TEMPO = "Não foi possível falar com o servidor a tempo. Verifique a internet e, antes de repetir, confira se o registro já não aparece na lista.";
const CRS_MSG_REDE = "Não foi possível falar com o servidor agora. Verifique a internet e tente de novo.";
const CRS_CODIGO = /^[A-Z][A-Z_]{1,29}$/;
const CRS_TELEFONE = /^[0-9]{3}$/;

let crsDono = null, crsCat = null, crsGeracao = 0, crsSeq = 0;
let crsSecaoAtual = null;
let crsFaixa = null, crsFaixaLidaEm = 0, crsFaixaSeq = 0;
let crsCrises = [], crsDetalhe = null, crsManifCriseId = 0, crsCorrigeManif = 0;
let crsDemandas = null, crsCorrigeDemanda = 0;
let crsPainel = [], crsCong = null, crsCongId = 0;
const crsEmCurso = new Set();

function crsEl(id) { return document.getElementById(id); }
function crsValor(id) { const c = crsEl(id); return c ? String(c.value == null ? "" : c.value).trim() : ""; }
function crsTextoLivre(id) { const c = crsEl(id); return c ? String(c.value == null ? "" : c.value) : ""; }
function crsMarcado(id) { const c = crsEl(id); return !!(c && c.checked); }
function crsInteiro(v) { const n = Number(v); return Number.isInteger(n) && n >= 1 ? n : 0; }
function crsNumero(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function crsMsgErro(data) { return (data && data.mensagem) || "Não foi possível concluir a operação agora."; }
function crsEscrever(id, texto, destaque) { const el = crsEl(id); if (el) { el.textContent = texto; el.className = destaque ? "subtitle psc-aviso" : "subtitle"; } }
function crsMostrar(id, visivel) { const el = crsEl(id); if (el) el.style.display = visivel ? "block" : "none"; }
function crsData(v) { return escaparHtmlEbd(typeof calDataHora === "function" ? calDataHora(v) : String(v || "")); }
function crsDia(v) { return escaparHtmlEbd(v ? (typeof formatarDataEbd === "function" ? formatarDataEbd(String(v).slice(0, 10)) : String(v).slice(0, 10)) : "—"); }
function crsLista(v) { return Array.isArray(v) ? v : []; }
function crsRotulo(lista, codigo) { const x = crsLista(lista).find(i => i && i.codigo === codigo); return x ? String(x.rotulo) : String(codigo || ""); }
function crsMarca() { return { g: crsGeracao }; }
function crsViva(m) { return !!m && m.g === crsGeracao && crsAbaVisivel(); }
async function crsProteger(botao, tarefa, chave) {
  if (chave) {
    if (crsEmCurso.has(chave)) { mostrarToast("Aguarde: o pedido anterior ainda está sendo processado.", "erro"); return undefined; }
    crsEmCurso.add(chave);
  }
  if (botao && typeof botao === "object") botao.disabled = true;
  try { return await tarefa(); } finally {
    if (botao && typeof botao === "object") botao.disabled = false;
    if (chave) crsEmCurso.delete(chave);
  }
}

// ---- falar com o servidor ----
async function crsTentar(url, opcoes, prazoMs) {
  const controle = typeof AbortController === "function" ? new AbortController() : null;
  const limite = controle ? setTimeout(() => controle.abort(), prazoMs || CRS_TEMPO_LIMITE_MS) : null;
  try {
    const res = await fetchProtegido(url, Object.assign({}, opcoes || {}, { semFator: true }, controle ? { signal: controle.signal } : {}));
    let corpo = null;
    try { corpo = await res.json(); } catch { corpo = null; }
    return { res, corpo };
  } finally { if (limite != null) clearTimeout(limite); }
}
async function crsRequisitar(caminho, opcoes, prazoMs) {
  const url = `${API_BASE}/${CRS_ROTA}/${caminho}`;
  try {
    let r = await crsTentar(url, opcoes, prazoMs);
    if (r.res.status === 428) { const ok = await confirmarFatorAgora(); if (ok) r = await crsTentar(url, opcoes, prazoMs); }
    const { res, corpo } = r;
    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { sucesso: false, mensagem: `Resposta inesperada do servidor (${res.status}).`, httpStatus: res.status };
    if (res.status >= 400) corpo.sucesso = false;
    if (res.status === 428 || corpo.precisaFator) corpo.mensagem = CRS_MSG_FATOR;
    corpo.httpStatus = res.status;
    if (res.status === 403 || res.status >= 500) corpo.jaAvisado = true;
    return corpo;
  } catch (e) {
    if (e && e.message === "Sessão expirada") return { sucesso: false, jaAvisado: true, mensagem: "Sua sessão expirou. Entre novamente." };
    if (e && e.name === "AbortError") return { sucesso: false, jaAvisado: true, falhaDeRede: true, mensagem: CRS_MSG_TEMPO };
    return { sucesso: false, jaAvisado: true, falhaDeRede: true, mensagem: CRS_MSG_REDE };
  }
}
function crsObter(caminho) { return crsRequisitar(caminho); }
function crsPostar(caminho, corpo, prazoMs) { return crsRequisitar(caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }, prazoMs); }
function crsMostrarResultado(data, idMensagem) {
  const texto = crsMsgErro(data);
  const falhou = !!(data && data.sucesso === false);
  if (!(data && data.jaAvisado)) mostrarToast(texto, falhou ? "erro" : "sucesso");
  crsEscrever(idMensagem, texto, falhou);
}

// ---- troca de login e saída da tela: nada da pessoa anterior fica na página ----
const CRS_IDS_CONTEUDO = ["crsCriseConteudo", "crsManifConteudo", "crsImprensaForm", "crsImprensaLista", "crsSegPainel", "crsSegDetalhe"];
const CRS_IDS_MSGS = ["crsMsg", "crsCriseMsg", "crsManifMsg", "crsImprensaMsg", "crsSegMsg"];
function crsChaveDoDono() { return `${authMatricula}|${sessaoDeLiderancaNaTela() ? "senha" : "pin"}`; }
function crsFecharAba() {
  crsGeracao++; crsSeq++;
  crsCrises = []; crsDetalhe = null; crsManifCriseId = 0; crsCorrigeManif = 0; crsDemandas = null; crsCorrigeDemanda = 0; crsPainel = []; crsCong = null; crsCongId = 0;
  CRS_IDS_CONTEUDO.forEach(id => { const el = crsEl(id); if (el) el.innerHTML = ""; });
  CRS_IDS_MSGS.forEach(id => crsEscrever(id, "", false));
}
function crsLimparTela() {
  crsFecharAba();
  crsCat = null; crsSecaoAtual = null; crsEmCurso.clear();
  crsFaixa = null; crsFaixaLidaEm = 0; crsFaixaSeq++;
  crsPintarFaixa();
  crsMostrarPilulas({ crise: false, manifestacoes: false, seguranca: false });
  crsDono = null;
}
function crsVerificarDono() { if (crsDono !== crsChaveDoDono()) { crsLimparTela(); crsDono = crsChaveDoDono(); } }
function crsAbaVisivel() { const a = crsEl("abaCrise"); return !!(authToken && crsDono === crsChaveDoDono() && a && a.style.display === "block"); }
// chamada pela navegação (mostrarAbaSecretaria): sair da aba fecha o que estava aberto; a faixa é relida de tempos em tempos
function crsAbaMudou(aba) {
  if (aba !== "crise") crsFecharAba();
  if (Date.now() - crsFaixaLidaEm > CRS_FAIXA_INTERVALO_MS) crsAtualizarFaixa();
}

// ============================================================================
// A FAIXA (toda tela da liderança)
// ============================================================================
async function crsAtualizarFaixa() {
  if (!authToken || !sessaoDeLiderancaNaTela()) { crsFaixa = null; crsPintarFaixa(); return; }
  if (crsDono !== crsChaveDoDono()) { crsLimparTela(); crsDono = crsChaveDoDono(); }
  const seq = ++crsFaixaSeq;
  crsFaixaLidaEm = Date.now();
  const data = await crsObter("faixa");
  if (seq !== crsFaixaSeq || crsDono !== crsChaveDoDono()) return;
  // sem resposta (rede, prazo): a faixa fica como estava; tenta de novo na próxima troca de tela
  if (data.sucesso === false) { crsFaixaLidaEm = 0; return; }
  crsFaixa = data.ativa === true && data.portaVoz && typeof data.portaVoz === "object" ? data : null;
  crsPintarFaixa();
}
function crsPintarFaixa() {
  const cx = crsEl("crsFaixa");
  if (!cx) return;
  if (!crsFaixa) { cx.innerHTML = ""; cx.style.display = "none"; return; }
  const pv = crsFaixa.portaVoz;
  cx.innerHTML = `<p class="crs-faixa-titulo"><strong>🚨 Crise ativa — porta-voz único: ${escaparHtmlEbd(pv.nome)}</strong></p>
    <p class="crs-faixa-texto">${crsFaixa.souPortaVoz ? "Você é o porta-voz único: só você (e o Presidente) fala em nome da Igreja." : `Não dê nota, entrevista nem opinião ligando o assunto à Igreja (Regimento Art. 161-B, § 2º). Imprensa: encaminhe para ${escaparHtmlEbd(pv.contato)}.`}</p>
    <div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario crs-btn" data-on-click="crsIrParaImprensaAcao">📰 Registrar pedido da imprensa</button></div>`;
  cx.style.display = "block";
}
function crsIrParaImprensaAcao() {
  crsSecaoAtual = "imprensa";
  if (typeof entrarModulo === "function" && typeof MODULOS === "object" && MODULOS.crise) entrarModulo("crise"); else mostrarAbaSecretaria("crise");
}

// ============================================================================
// A ABA
// ============================================================================
async function crsGarantirCatalogos() {
  if (crsCat) return crsCat;
  const geracao = crsGeracao;
  const data = await crsObter("catalogos");
  if (geracao !== crsGeracao || data.sucesso === false) return crsCat;
  const lista = (v) => crsLista(v).filter(x => x && typeof x === "object" && typeof x.codigo === "string" && CRS_CODIGO.test(x.codigo));
  const papeis = data.papeis && typeof data.papeis === "object" ? data.papeis : {};
  crsCat = { papeis: { crise: !!papeis.crise, seguranca: !!papeis.seguranca, geralSeguranca: !!papeis.geralSeguranca }, portaVoz: lista(data.portaVoz), canais: lista(data.canais),
    situacoes: lista(data.situacoes), tiposSimulado: lista(data.tiposSimulado), itensVistoria: lista(data.itensVistoria), resultados: lista(data.resultados), funcoes: lista(data.funcoes),
    contatos: crsLista(data.contatosEmergencia).filter(c => c && CRS_TELEFONE.test(String(c.numero))) };
  return crsCat;
}
function crsPodeManifestar() { return !!(crsCat && (crsCat.papeis.crise || (crsFaixa && crsFaixa.souPortaVoz))); }
function crsMostrarPilulas(vis) {
  crsMostrar("btnCrsSecaoCrise", !!vis.crise);
  crsMostrar("btnCrsSecaoManifestacoes", !!vis.manifestacoes);
  crsMostrar("btnCrsSecaoSeguranca", !!vis.seguranca);
}
async function crsAbrirAba() {
  crsVerificarDono();
  const marca = crsMarca();
  crsEscrever("crsMsg", "Carregando…", false);
  await crsAtualizarFaixa();
  const cat = await crsGarantirCatalogos();
  if (!crsViva(marca)) return;
  if (!cat) { crsEscrever("crsMsg", "Não foi possível abrir agora. Verifique a internet e toque na aba de novo.", true); return; }
  crsEscrever("crsMsg", "", false);
  crsMostrarPilulas({ crise: cat.papeis.crise, manifestacoes: crsPodeManifestar(), seguranca: cat.papeis.seguranca });
  const permitidas = CRS_SECOES.filter(s => crsSecaoPermitida(s));
  if (!crsSecaoAtual || !permitidas.includes(crsSecaoAtual)) crsSecaoAtual = cat.papeis.crise ? "crise" : cat.papeis.seguranca ? "seguranca" : "imprensa";
  await crsMostrarSecaoAcao(crsSecaoAtual);
}
function crsSecaoPermitida(s) {
  if (!crsCat) return false;
  if (s === "crise") return crsCat.papeis.crise;
  if (s === "manifestacoes") return crsPodeManifestar();
  if (s === "seguranca") return crsCat.papeis.seguranca;
  return s === "imprensa";
}
function crsAplicarSecao(secao) {
  crsSecaoAtual = secao;
  CRS_SECOES.forEach(s => {
    const nome = s[0].toUpperCase() + s.slice(1);
    crsMostrar(`crsSecao${nome}`, s === secao);
    const b = crsEl(`btnCrsSecao${nome}`);
    if (b) { b.classList.toggle("ativo", s === secao); b.setAttribute("aria-pressed", s === secao ? "true" : "false"); }
  });
}
async function crsMostrarSecaoAcao(secao) {
  const s = CRS_SECOES.includes(secao) ? secao : "imprensa";
  if (!crsSecaoPermitida(s)) return;
  crsAplicarSecao(s);
  if (s === "crise") await crsCarregarCrises();
  if (s === "manifestacoes") await crsCarregarManifestacoes();
  if (s === "imprensa") await crsCarregarImprensa();
  if (s === "seguranca") await crsCarregarSeguranca();
}

// ---- CRISE (nível geral) ----
async function crsCarregarCrises() {
  const marca = crsMarca();
  const seq = ++crsSeq;
  crsEscrever("crsCriseMsg", "Carregando…", false);
  const data = await crsObter("crises");
  if (seq !== crsSeq || !crsViva(marca) || crsSecaoAtual !== "crise") return;
  if (data.sucesso === false || !Array.isArray(data.crises)) { crsEscrever("crsCriseMsg", crsMsgErro(data), true); return; }
  crsEscrever("crsCriseMsg", "", false);
  crsCrises = data.crises;
  const ativa = crsCrises.find(c => c && c.status === "ATIVA");
  crsDetalhe = null;
  if (ativa && crsInteiro(ativa.criseId)) {
    const det = await crsObter(`crise?criseId=${crsInteiro(ativa.criseId)}`);
    if (seq !== crsSeq || !crsViva(marca)) return;
    if (det.sucesso !== false && det.crise) crsDetalhe = det;
  }
  crsPintarCrises();
}
function crsTextoPortaVoz(pv) {
  if (!pv || typeof pv !== "object") return "";
  return `${escaparHtmlEbd(pv.nome)} — ${escaparHtmlEbd(pv.tipo === "PRESIDENTE" ? "o Pastor Presidente" : "profissional designado")}${pv.ato ? ` (${escaparHtmlEbd(pv.ato)})` : ""}. Contato para a imprensa: ${escaparHtmlEbd(pv.contato)}`;
}
function crsHtmlAviso(a) {
  if (!a || typeof a !== "object") return "";
  const k = a.canais && typeof a.canais === "object" ? a.canais : {};
  const n = (canal, sit) => crsNumero(k[canal] && k[canal][sit]);
  return `<ul class="crs-aviso">
    <li>Sininho: <strong>${crsNumero(a.total)}</strong> líder(es) · leram: ${crsNumero(a.lidos)} · deram ciência ("Li o aviso"): ${crsNumero(a.ciencia)}</li>
    <li>Celular: ${n("PUSH", "ACEITO")} entregue(s) · ${n("PUSH", "PENDENTE") + n("PUSH", "ENVIANDO")} na fila · ${n("PUSH", "SEM_APARELHO")} sem aparelho · ${n("PUSH", "FALHOU")} falharam</li>
    <li>E-mail: ${n("EMAIL", "ACEITO")} enviado(s) · ${n("EMAIL", "PENDENTE") + n("EMAIL", "ENVIANDO")} na fila (sai aos poucos: até ${crsNumero(a.emailsPorHora) || 30} por hora para o aviso de crise) · ${n("EMAIL", "ALCANCADO")} dispensados (já alcançados pelo sininho ou pelo celular) · ${n("EMAIL", "SEM_CONTATO")} sem e-mail · ${n("EMAIL", "CANCELADO")} substituídos por um aviso mais novo</li></ul>`;
}
const CRS_EVENTOS = { ABERTA: "Regime aberto", PORTA_VOZ: "Porta-voz trocado", ENCERRADA: "Regime encerrado" };
function crsPintarCrises() {
  const cx = crsEl("crsCriseConteudo");
  if (!cx) return;
  const d = crsDetalhe;
  let html = "";
  if (d && d.crise) {
    const c = d.crise;
    const ultimo = crsLista(d.historico).filter(h => h && h.aviso).slice(-1)[0];
    html += `<article class="crs-cartao crs-cartao-ativa"><h4>🚨 Regime de crise ativo desde ${crsData(c.abertaEm)}</h4>
      <p><strong>Motivo registrado:</strong> ${escaparHtmlEbd(c.motivo || "")}</p>
      <p><strong>Ordenado por:</strong> ${escaparHtmlEbd(c.ordenadoPor || "")} · <strong>registrado por:</strong> ${escaparHtmlEbd(c.registradoPor || "")} · alcance: todo o Campo</p>
      <p><strong>Porta-voz único:</strong> ${crsTextoPortaVoz(c.portaVoz)}</p>
      ${ultimo ? `<h5>O último aviso (${escaparHtmlEbd(CRS_EVENTOS[ultimo.evento] || "")})</h5>${crsHtmlAviso(ultimo.aviso)}` : ""}
      <div class="psc-acoes">
        <button type="button" class="btn-confirmar btn-secundario crs-btn" data-on-click="crsContinuarAvisoAcao" data-args-click="${argsAttr(ARG.elemento)}">📣 Continuar o aviso agora</button>
        <button type="button" class="btn-confirmar btn-secundario crs-btn" data-on-click="crsCarregarCrisesAcao">🔄 Atualizar</button></div>
      <details class="crs-form"><summary>Trocar o porta-voz</summary>${crsHtmlPortaVoz("crsTroca")}
        <div class="psc-acoes"><button type="button" class="btn-confirmar crs-btn" data-on-click="crsTrocarPortaVozAcao" data-args-click="${argsAttr(crsInteiro(c.criseId), ARG.elemento)}">💾 Designar e avisar a liderança</button></div></details>
      <details class="crs-form"><summary>Encerrar o regime de crise</summary>
        <label for="crsResumoFim">Resumo do encerramento (vai no aviso de fim a toda a liderança)</label><textarea id="crsResumoFim" rows="3" maxlength="500"></textarea>
        <div class="psc-acoes"><button type="button" class="btn-confirmar btn-perigo crs-btn" data-on-click="crsEncerrarAcao" data-args-click="${argsAttr(crsInteiro(c.criseId), ARG.elemento)}">🏁 Encerrar e avisar</button></div></details>
      <h5>Histórico</h5><ul>${crsLista(d.historico).map(h => `<li>${crsData(h.em)} — ${escaparHtmlEbd(CRS_EVENTOS[h.evento] || "")} por ${escaparHtmlEbd(h.por || "")}: porta-voz ${escaparHtmlEbd(h.portaVoz && h.portaVoz.nome)}</li>`).join("")}</ul>
    </article>`;
  } else {
    html += `<article class="crs-cartao"><h4>Abrir o regime de crise</h4>
      <p class="subtitle">Use quando o Presidente decidir: crise institucional, escândalo na mídia, acidente grave ou fato de repercussão pública negativa (Regimento Art. 161-B). Toda a liderança
        recebe na hora, no sininho e no celular, o aviso de que só o porta-voz fala pela Igreja; o e-mail sai aos poucos. <em>Exemplo: um acidente no templo saiu na TV — o Presidente
        decide que só ele fala, e a Secretaria registra aqui.</em></p>
      <p class="subtitle">Pelo Regimento, a política vale sozinha assim que a crise existe: a proibição de falar vale mesmo antes deste registro, que é a formalização. Este aviso vai
        só à <strong>liderança</strong>; a proibição (§ 2º) vale para <strong>todo membro</strong> — para avisar os membros, use a aba <strong>Comunicados</strong>.</p>
      <label for="crsMotivo">Motivo, em poucas palavras (fica só com o nível geral; NÃO vai no aviso)</label><textarea id="crsMotivo" rows="2" maxlength="300"></textarea>
      ${crsHtmlPortaVoz("crsAbre")}
      <div class="psc-acoes"><button type="button" class="btn-confirmar btn-perigo crs-btn" data-on-click="crsAbrirCriseAcao" data-args-click="${argsAttr(ARG.elemento)}">🚨 Abrir o regime e avisar a liderança</button></div></article>`;
  }
  const antigas = crsCrises.filter(c => c && c.status === "ENCERRADA");
  html += antigas.length ? `<h4>Crises encerradas</h4>${antigas.map(c => `<article class="crs-cartao"><p><strong>${crsData(c.abertaEm)} a ${crsData(c.encerradaEm)}</strong> — ${escaparHtmlEbd(c.motivo || "")}</p>
      <p class="subtitle">Porta-voz: ${escaparHtmlEbd(c.portaVoz && c.portaVoz.nome)} · ${crsNumero(c.manifestacoes)} manifestação(ões) · ${crsNumero(c.demandas)} pedido(s) da imprensa · ${escaparHtmlEbd(c.resumoEncerramento || "")}</p></article>`).join("")}` : "";
  cx.innerHTML = html;
}
function crsHtmlPortaVoz(p) {
  return `<fieldset class="crs-fieldset"><legend>Porta-voz único</legend>
    <label class="com-canal"><input type="radio" name="${p}Tipo" id="${p}TipoPresidente" checked> O próprio Pastor Presidente</label>
    <label class="com-canal"><input type="radio" name="${p}Tipo" id="${p}TipoDesignado"> Profissional de comunicação designado por ele</label>
    <label for="${p}Contato">Contato para a imprensa (telefone ou e-mail) — vai no aviso e na faixa</label><input type="text" id="${p}Contato" maxlength="150">
    <p class="subtitle">Se for o profissional designado:</p>
    <label for="${p}Nome">Nome do profissional</label><input type="text" id="${p}Nome" maxlength="150">
    <label for="${p}Ato">Ato da designação (número e data do ato do Presidente)</label><input type="text" id="${p}Ato" maxlength="300" placeholder="Ex.: Ato da Presidência nº 12/2026, de 23/10/2026">
    <label for="${p}Matricula">Matrícula, se for membro (deixe em branco se não for)</label><input type="number" id="${p}Matricula" min="1" inputmode="numeric"></fieldset>`;
}
function crsLerPortaVoz(p) {
  if (crsMarcado(`${p}TipoDesignado`)) {
    const m = crsInteiro(crsValor(`${p}Matricula`));
    return { tipo: "DESIGNADO", nome: crsValor(`${p}Nome`), contato: crsValor(`${p}Contato`), ato: crsValor(`${p}Ato`), ...(m ? { membroId: m } : {}) };
  }
  return { tipo: "PRESIDENTE", contato: crsValor(`${p}Contato`) };
}
async function crsAbrirCriseAcao(botao) {
  const motivo = crsTextoLivre("crsMotivo").trim();
  if (motivo.length < 5) { crsEscrever("crsCriseMsg", "Escreva o motivo, em poucas palavras.", true); return; }
  const portaVoz = crsLerPortaVoz("crsAbre");
  if (!(await confirmarAcao("Abrir o regime de crise? Toda a liderança recebe agora o aviso de que só o porta-voz fala pela Igreja (sininho e celular; o e-mail sai aos poucos).", "Abrir o regime"))) return;
  const marca = crsMarca();
  await crsProteger(botao, async () => {
    const data = await crsPostar("abrir", { motivo, portaVoz }, CRS_TEMPO_LIMITE_ATO_MS);
    if (!crsViva(marca)) return;
    crsMostrarResultado(data, "crsCriseMsg");
    if (data.sucesso !== false || data.httpStatus === 409) { await crsAtualizarFaixa(); await crsCarregarCrises(); if (data.sucesso === false) crsEscrever("crsCriseMsg", crsMsgErro(data), true); }
  }, "crise-ato");
}
async function crsTrocarPortaVozAcao(criseId, botao) {
  const id = crsInteiro(criseId);
  if (!id) return;
  const portaVoz = crsLerPortaVoz("crsTroca");
  if (!(await confirmarAcao("Trocar o porta-voz único? Toda a liderança recebe o aviso do novo porta-voz agora.", "Trocar e avisar"))) return;
  const marca = crsMarca();
  await crsProteger(botao, async () => {
    const data = await crsPostar("porta-voz", { criseId: id, portaVoz }, CRS_TEMPO_LIMITE_ATO_MS);
    if (!crsViva(marca)) return;
    crsMostrarResultado(data, "crsCriseMsg");
    if (data.sucesso !== false || data.httpStatus === 409) { await crsAtualizarFaixa(); await crsCarregarCrises(); if (data.sucesso === false) crsEscrever("crsCriseMsg", crsMsgErro(data), true); }
  }, "crise-ato");
}
async function crsEncerrarAcao(criseId, botao) {
  const id = crsInteiro(criseId);
  if (!id) return;
  const resumo = crsTextoLivre("crsResumoFim").trim();
  if (resumo.length < 5) { crsEscrever("crsCriseMsg", "Escreva o resumo do encerramento.", true); return; }
  if (!(await confirmarAcao("Encerrar o regime de crise? Toda a liderança recebe o aviso de que a vedação deixa de valer.", "Encerrar"))) return;
  const marca = crsMarca();
  await crsProteger(botao, async () => {
    const data = await crsPostar("encerrar", { criseId: id, resumo }, CRS_TEMPO_LIMITE_ATO_MS);
    if (!crsViva(marca)) return;
    crsMostrarResultado(data, "crsCriseMsg");
    if (data.sucesso !== false || data.httpStatus === 409) { await crsAtualizarFaixa(); await crsCarregarCrises(); if (data.sucesso === false) crsEscrever("crsCriseMsg", crsMsgErro(data), true); }
  }, "crise-ato");
}
async function crsContinuarAvisoAcao(botao) {
  const marca = crsMarca();
  await crsProteger(botao, async () => {
    const data = await crsPostar("continuar-aviso", {});
    if (!crsViva(marca)) return;
    crsMostrarResultado(data, "crsCriseMsg");
    if (data.sucesso !== false) await crsCarregarCrises();
  }, "continuar");
}
function crsCarregarCrisesAcao() { return crsCarregarCrises(); }

// ---- MANIFESTAÇÕES (nível geral e porta-voz) ----
async function crsCarregarManifestacoes() {
  const marca = crsMarca();
  const seq = ++crsSeq;
  crsEscrever("crsManifMsg", "Carregando…", false);
  // a crise: a ativa (da faixa); o nível geral pode escolher uma encerrada (o que foi dito no último dia e registrado depois)
  if (crsCat && crsCat.papeis.crise) {
    const l = await crsObter("crises");
    if (seq !== crsSeq || !crsViva(marca)) return;
    crsCrises = l.sucesso === false || !Array.isArray(l.crises) ? [] : l.crises;
  }
  if (!crsManifCriseId) crsManifCriseId = crsInteiro(crsFaixa && crsFaixa.criseId) || crsInteiro((crsCrises[0] || {}).criseId);
  if (!crsManifCriseId) { crsEscrever("crsManifMsg", "Não há crise registrada.", false); const cx = crsEl("crsManifConteudo"); if (cx) cx.innerHTML = ""; return; }
  const det = await crsObter(`crise?criseId=${crsManifCriseId}`);
  if (seq !== crsSeq || !crsViva(marca) || crsSecaoAtual !== "manifestacoes") return;
  if (det.sucesso === false) { crsEscrever("crsManifMsg", det.httpStatus === 404 ? "Esta crise não está disponível para você." : crsMsgErro(det), true); return; }
  crsEscrever("crsManifMsg", "", false);
  crsDetalhe = det;
  crsPintarManifestacoes();
}
function crsPintarManifestacoes() {
  const cx = crsEl("crsManifConteudo");
  if (!cx || !crsDetalhe) return;
  const lista = crsLista(crsDetalhe.manifestacoes);
  const corr = lista.find(m => crsInteiro(m.manifestacaoId) === crsCorrigeManif) || null;
  const escolha = crsCat && crsCat.papeis.crise && crsCrises.length > 1 ? `<label for="crsManifCrise">Crise</label><select id="crsManifCrise" data-on-change="crsTrocarCriseManifAcao">${crsCrises.map(c => {
    const id = crsInteiro(c.criseId);
    return `<option value="${id}" ${id === crsManifCriseId ? "selected" : ""}>${crsData(c.abertaEm)} — ${escaparHtmlEbd(c.status === "ATIVA" ? "ativa" : "encerrada")}</option>`;
  }).join("")}</select>` : "";
  const pv = crsDetalhe.crise && crsDetalhe.crise.portaVoz ? crsDetalhe.crise.portaVoz : {};
  cx.innerHTML = `${escolha}
    <article class="crs-cartao"><h4>${corr ? `Corrigir a manifestação de ${crsData(corr.dataHora)} (a original fica no histórico)` : "Registrar uma manifestação autorizada"}</h4>
      <p class="subtitle">O que o porta-voz disse em nome da Igreja: quando, por qual canal, o resumo e com autorização de quem. Nada se edita depois: corrigir é registrar de novo.</p>
      <label for="crsManifData">Data e hora</label><input type="datetime-local" id="crsManifData">
      <label for="crsManifCanal">Canal</label><select id="crsManifCanal">${crsLista(crsCat && crsCat.canais).map(c => `<option value="${escaparHtmlEbd(c.codigo)}">${escaparHtmlEbd(c.rotulo)}</option>`).join("")}</select>
      <label for="crsManifQuem">Quem falou</label><input type="text" id="crsManifQuem" maxlength="150">
      <label for="crsManifResumo">Resumo do que foi dito</label><textarea id="crsManifResumo" rows="4" maxlength="2000"></textarea>
      <label for="crsManifLink">Link (se foi publicado)</label><input type="url" id="crsManifLink" maxlength="500" placeholder="https://">
      <label for="crsManifDoc">Documento (onde está guardado)</label><input type="text" id="crsManifDoc" maxlength="300">
      <label for="crsManifAut">Quem autorizou</label><input type="text" id="crsManifAut" maxlength="150">
      <div class="psc-acoes"><button type="button" class="btn-confirmar crs-btn" data-on-click="crsRegistrarManifAcao" data-args-click="${argsAttr(ARG.elemento)}">💾 Registrar</button>
      ${corr ? `<button type="button" class="btn-confirmar btn-secundario crs-btn" data-on-click="crsCorrigirManifAcao" data-args-click="${argsAttr(0)}">Cancelar a correção</button>` : ""}</div></article>
    <h4>Manifestações registradas</h4>
    ${lista.length ? lista.map(m => {
      const id = crsInteiro(m.manifestacaoId);
      const link = m.link ? urlSegura(m.link) : "";
      return `<article class="crs-cartao${m.corrigidaPor ? " crs-corrigida" : ""}"><p><strong>${crsData(m.dataHora)} · ${escaparHtmlEbd(m.canalRotulo || m.canal)}</strong> — ${escaparHtmlEbd(m.quemFalou)} (autorizado por ${escaparHtmlEbd(m.autorizadoPor)})</p>
        <div class="crs-texto">${escaparHtmlEbd(m.resumo)}</div>
        ${link ? `<p><a href="${link}" target="_blank" rel="noopener noreferrer">Abrir o link</a></p>` : ""}${m.documento ? `<p class="subtitle">Documento: ${escaparHtmlEbd(m.documento)}</p>` : ""}
        <p class="subtitle">Registrado por ${escaparHtmlEbd(m.registradoPor || "")} em ${crsData(m.registradoEm)}${m.corrige ? " · corrige um registro anterior" : ""}${m.corrigidaPor ? " · ⚠️ CORRIGIDA por um registro mais novo" : ""}</p>
        ${!m.corrigidaPor && id ? `<div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario crs-btn" data-on-click="crsCorrigirManifAcao" data-args-click="${argsAttr(id)}">✏️ Corrigir</button></div>` : ""}</article>`;
    }).join("") : `<p class="subtitle">Nenhuma manifestação registrada nesta crise.</p>`}`;
  const quem = crsEl("crsManifQuem");
  if (quem) quem.value = corr ? String(corr.quemFalou || "") : String(pv.nome || "");
  if (corr) {
    crsEl("crsManifResumo").value = String(corr.resumo || ""); crsEl("crsManifAut").value = String(corr.autorizadoPor || ""); crsEl("crsManifDoc").value = String(corr.documento || "");
    crsEl("crsManifLink").value = String(corr.link || ""); const canal = crsEl("crsManifCanal"); if (canal && CRS_CODIGO.test(String(corr.canal))) canal.value = String(corr.canal);
  }
}
function crsTrocarCriseManifAcao() { crsManifCriseId = crsInteiro(crsValor("crsManifCrise")); crsCorrigeManif = 0; return crsCarregarManifestacoes(); }
function crsCorrigirManifAcao(manifestacaoId) {
  crsCorrigeManif = crsInteiro(manifestacaoId);
  crsPintarManifestacoes();
  const cx = crsEl("crsManifConteudo"); if (cx && typeof cx.scrollIntoView === "function") cx.scrollIntoView({ block: "start" });
}
async function crsRegistrarManifAcao(botao) {
  const dados = { criseId: crsManifCriseId, dataHora: crsValor("crsManifData"), canal: crsValor("crsManifCanal"), quemFalou: crsValor("crsManifQuem"), resumo: crsTextoLivre("crsManifResumo"),
    link: crsValor("crsManifLink"), documento: crsValor("crsManifDoc"), autorizadoPor: crsValor("crsManifAut") };
  if (crsCorrigeManif) dados.corrigeManifestacaoId = crsCorrigeManif;
  if (!dados.dataHora) { crsEscrever("crsManifMsg", "Informe a data e a hora da manifestação.", true); return; }
  const marca = crsMarca();
  await crsProteger(botao, async () => {
    const data = await crsPostar("manifestacao", dados);
    if (!crsViva(marca)) return;
    crsMostrarResultado(data, "crsManifMsg");
    if (data.sucesso !== false || data.httpStatus === 409) { crsCorrigeManif = 0; await crsCarregarManifestacoes(); if (data.sucesso === false) crsEscrever("crsManifMsg", crsMsgErro(data), true); }
  }, "manifestacao");
}

// ---- IMPRENSA (todo líder registra; o porta-voz e o nível geral respondem) ----
async function crsCarregarImprensa() {
  const marca = crsMarca();
  const seq = ++crsSeq;
  crsEscrever("crsImprensaMsg", "Carregando…", false);
  const data = await crsObter("demandas");
  if (seq !== crsSeq || !crsViva(marca) || crsSecaoAtual !== "imprensa") return;
  if (data.sucesso === false || !Array.isArray(data.demandas)) { crsEscrever("crsImprensaMsg", crsMsgErro(data), true); return; }
  crsEscrever("crsImprensaMsg", "", false);
  crsDemandas = data;
  crsPintarImprensa();
}
function crsPintarImprensa() {
  const form = crsEl("crsImprensaForm"), cx = crsEl("crsImprensaLista");
  if (!form || !cx || !crsDemandas) return;
  const lista = crsDemandas.demandas;
  const corr = lista.find(d => crsInteiro(d.demandaId) === crsCorrigeDemanda) || null;
  form.innerHTML = `<article class="crs-cartao"><h4>${corr ? `Corrigir o pedido de ${escaparHtmlEbd(corr.veiculo)} (o original fica no histórico)` : "Registrar um pedido da imprensa que chegou a você"}</h4>
    <p class="subtitle">${crsFaixa ? "Há crise ativa: não comente o assunto. Registre aqui e o porta-voz recebe na hora." : "Registre aqui e a Presidência recebe na hora."} <em>Exemplo: um repórter da rádio ligou pedindo entrevista até as 18h.</em></p>
    <label for="crsDemVeiculo">Veículo (jornal, rádio, TV, site, perfil)</label><input type="text" id="crsDemVeiculo" maxlength="150">
    <label for="crsDemContato">Contato de quem pediu (telefone ou e-mail)</label><input type="text" id="crsDemContato" maxlength="150">
    <label for="crsDemPedido">O que foi pedido</label><textarea id="crsDemPedido" rows="3" maxlength="2000"></textarea>
    <label for="crsDemPrazo">Prazo que a imprensa deu (se houver)</label><input type="datetime-local" id="crsDemPrazo">
    <div class="psc-acoes"><button type="button" class="btn-confirmar crs-btn" data-on-click="crsRegistrarDemandaAcao" data-args-click="${argsAttr(ARG.elemento)}">📰 Registrar e encaminhar</button>
    ${corr ? `<button type="button" class="btn-confirmar btn-secundario crs-btn" data-on-click="crsCorrigirDemandaAcao" data-args-click="${argsAttr(0)}">Cancelar a correção</button>` : ""}</div></article>`;
  if (corr) { crsEl("crsDemVeiculo").value = String(corr.veiculo || ""); crsEl("crsDemContato").value = String(corr.contato || ""); crsEl("crsDemPedido").value = String(corr.pedido || ""); }
  const rotSit = (s) => crsRotulo(crsCat && crsCat.situacoes, s);
  cx.innerHTML = `<h4>${crsDemandas.gestor ? "Pedidos da imprensa" : "Os pedidos que você registrou"}</h4>${lista.length ? lista.map(d => {
    const id = crsInteiro(d.demandaId);
    const respostas = crsLista(d.respostas);
    const resposta = d.podeResponder && id ? `<details class="crs-form"><summary>${d.ultimaRespostaId ? "Corrigir a resposta (a anterior fica no histórico)" : "Responder"}</summary>
        <label class="com-canal"><input type="radio" name="crsResp${id}" id="crsResp${id}Sim" checked> Respondida pelo porta-voz</label>
        <label class="com-canal"><input type="radio" name="crsResp${id}" id="crsResp${id}Nao"> Recusada</label>
        <label for="crsRespTexto${id}">A resposta dada (ou o motivo da recusa)</label><textarea id="crsRespTexto${id}" rows="3" maxlength="2000"></textarea>
        <div class="psc-acoes"><button type="button" class="btn-confirmar crs-btn" data-on-click="crsResponderAcao" data-args-click="${argsAttr(id, crsInteiro(d.ultimaRespostaId), ARG.elemento)}">💾 Registrar a resposta</button></div></details>` : "";
    return `<article class="crs-cartao${d.corrigidaPor ? " crs-corrigida" : ""}"><p><strong>${escaparHtmlEbd(d.veiculo)}</strong> — ${escaparHtmlEbd(rotSit(d.situacao))}</p>
      <div class="crs-texto">${escaparHtmlEbd(d.pedido)}</div>
      <p class="subtitle">Recebido em ${crsData(d.recebidaEm)}${d.prazoEm ? ` · prazo: ${crsData(d.prazoEm)}` : ""}${d.contato ? ` · contato: ${escaparHtmlEbd(d.contato)}` : d.contatoApagado ? " · contato apagado (retenção)" : ""}${d.registradoPor ? ` · registrado por ${escaparHtmlEbd(d.registradoPor)}` : ""}${d.corrigidaPor ? " · ⚠️ CORRIGIDO por um registro mais novo" : ""}</p>
      ${respostas.length ? `<ul>${respostas.map(r => `<li>${crsData(r.em)} — ${escaparHtmlEbd(rotSit(r.situacao))} por ${escaparHtmlEbd(r.por || "")}: ${escaparHtmlEbd(r.resposta)}</li>`).join("")}</ul>` : ""}
      ${resposta}${d.minha && !d.corrigidaPor && id ? `<div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario crs-btn" data-on-click="crsCorrigirDemandaAcao" data-args-click="${argsAttr(id)}">✏️ Corrigir o meu registro</button></div>` : ""}</article>`;
  }).join("") : `<p class="subtitle">Nenhum pedido registrado.</p>`}`;
}
function crsCorrigirDemandaAcao(demandaId) {
  crsCorrigeDemanda = crsInteiro(demandaId);
  crsPintarImprensa();
  const cx = crsEl("crsImprensaForm"); if (cx && typeof cx.scrollIntoView === "function") cx.scrollIntoView({ block: "start" });
}
async function crsRegistrarDemandaAcao(botao) {
  const dados = { veiculo: crsValor("crsDemVeiculo"), contato: crsValor("crsDemContato"), pedido: crsTextoLivre("crsDemPedido"), prazo: crsValor("crsDemPrazo") };
  if (crsCorrigeDemanda) dados.corrigeDemandaId = crsCorrigeDemanda;
  const marca = crsMarca();
  await crsProteger(botao, async () => {
    const data = await crsPostar("demanda", dados);
    if (!crsViva(marca)) return;
    crsMostrarResultado(data, "crsImprensaMsg");
    if (data.sucesso !== false || data.httpStatus === 409) { crsCorrigeDemanda = 0; await crsCarregarImprensa(); if (data.sucesso === false) crsEscrever("crsImprensaMsg", crsMsgErro(data), true); }
  }, "demanda");
}
async function crsResponderAcao(demandaId, ultimaRespostaId, botao) {
  const id = crsInteiro(demandaId);
  if (!id) return;
  const dados = { demandaId: id, situacao: crsMarcado(`crsResp${id}Nao`) ? "RECUSADA" : "RESPONDIDA", resposta: crsTextoLivre(`crsRespTexto${id}`) };
  const anterior = crsInteiro(ultimaRespostaId);
  if (anterior) dados.substituiRespostaId = anterior;
  const marca = crsMarca();
  await crsProteger(botao, async () => {
    const data = await crsPostar("responder", dados);
    if (!crsViva(marca)) return;
    crsMostrarResultado(data, "crsImprensaMsg");
    if (data.sucesso !== false || data.httpStatus === 409) { await crsCarregarImprensa(); if (data.sucesso === false) crsEscrever("crsImprensaMsg", crsMsgErro(data), true); }
  }, `responder-${id}`);
}

// ---- SEGURANÇA (Dirigente, Pastor de Área e nível geral; cada um no seu território) ----
const CRS_AVCB = { VIGENTE: "✅ vigente", A_VENCER: "⏳ vence em menos de 60 dias", VENCIDA: "❌ VENCIDO", NAO_INFORMADA: "❔ não informado" };
const CRS_SEGURO = { VIGENTE: "✅ vigente", VENCIDO: "❌ VENCIDO", SEM_SEGURO: "— sem seguro cadastrado" };
async function crsCarregarSeguranca() {
  const marca = crsMarca();
  const seq = ++crsSeq;
  crsEscrever("crsSegMsg", "Carregando…", false);
  const data = await crsObter("seguranca");
  if (seq !== crsSeq || !crsViva(marca) || crsSecaoAtual !== "seguranca") return;
  if (data.sucesso === false || !Array.isArray(data.congregacoes)) { crsEscrever("crsSegMsg", crsMsgErro(data), true); return; }
  crsEscrever("crsSegMsg", "", false);
  crsPainel = data.congregacoes;
  crsPintarPainel();
  if (crsCongId && crsPainel.some(c => crsInteiro(c.congregacaoId) === crsCongId)) await crsAbrirCongregacao(crsCongId);
  else { crsCongId = 0; crsCong = null; const d = crsEl("crsSegDetalhe"); if (d) d.innerHTML = ""; }
}
function crsPintarPainel() {
  const cx = crsEl("crsSegPainel");
  if (!cx) return;
  cx.innerHTML = crsPainel.length ? `<div class="crs-grade">${crsPainel.map(c => {
    const id = crsInteiro(c.congregacaoId);
    const alertas = crsLista(c.alertas);
    return `<article class="crs-cartao${alertas.length ? " crs-cartao-alerta" : ""}"><h5>${escaparHtmlEbd(c.nome)}</h5>
      ${alertas.length ? `<ul class="crs-alertas">${alertas.map(a => `<li>⚠️ ${escaparHtmlEbd(a.texto)}</li>`).join("")}</ul>` : `<p>✅ Tudo em dia.</p>`}
      <p class="subtitle">Equipe de segurança: ${crsNumero(c.equipe)} pessoa(s)</p>
      ${id ? `<div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario crs-btn" data-on-click="crsAbrirCongregacaoAcao" data-args-click="${argsAttr(id, ARG.elemento)}">Abrir</button></div>` : ""}</article>`;
  }).join("")}</div>` : `<p class="subtitle">Nenhuma congregação no seu território.</p>`;
}
function crsAbrirCongregacaoAcao(congregacaoId, botao) { return crsProteger(botao, () => crsAbrirCongregacao(crsInteiro(congregacaoId)), "congregacao"); }
async function crsAbrirCongregacao(id) {
  if (!id) return;
  const marca = crsMarca();
  const seq = ++crsSeq;
  const data = await crsObter(`congregacao?congregacaoId=${id}`);
  if (seq !== crsSeq || !crsViva(marca) || crsSecaoAtual !== "seguranca") return;
  const cx = crsEl("crsSegDetalhe");
  if (!cx) return;
  if (data.sucesso === false || !data.congregacao) { cx.textContent = data.httpStatus === 404 ? "Esta congregação não está no seu território." : crsMsgErro(data); return; }
  crsCongId = id; crsCong = data;
  crsPintarCongregacao();
  if (typeof cx.scrollIntoView === "function") cx.scrollIntoView({ block: "start" });
}
function crsPintarCongregacao() {
  const cx = crsEl("crsSegDetalhe");
  const d = crsCong;
  if (!cx || !d) return;
  const id = crsCongId;
  const p = d.planoAtual;
  const versao = p ? crsInteiro(p.versao) : 0;
  const itens = crsLista(crsCat && crsCat.itensVistoria);
  const resultados = crsLista(crsCat && crsCat.resultados);
  cx.innerHTML = `<h4>🧯 ${escaparHtmlEbd(d.congregacao.nome)}</h4>
    ${crsLista(d.alertas).length ? `<ul class="crs-alertas">${crsLista(d.alertas).map(a => `<li>⚠️ ${escaparHtmlEbd(a.texto)}</li>`).join("")}</ul>` : ""}
    <section class="crs-secao"><h5>Plano de emergência ${p ? `(versão ${versao}, revisado em ${crsData(p.revisadoEm)}${d.plano && d.plano.venceEm ? `; a próxima revisão vence em ${crsDia(d.plano.venceEm)}` : ""})` : "(ainda não registrado)"}</h5>
      <p class="crs-telefones">${crsLista(d.contatosEmergencia).filter(c => CRS_TELEFONE.test(String(c.numero))).map(c => `<a class="crs-tel" href="tel:${escaparHtmlEbd(c.numero)}">📞 ${escaparHtmlEbd(c.nome)}: <strong>${escaparHtmlEbd(c.numero)}</strong></a>`).join("")}</p>
      <label for="crsPlanoRotas">Rotas de evacuação</label><textarea id="crsPlanoRotas" rows="3" maxlength="2000"></textarea>
      <label for="crsPlanoPontos">Pontos de encontro</label><textarea id="crsPlanoPontos" rows="2" maxlength="1000"></textarea>
      <label for="crsPlanoContatos">Contatos da congregação (além de Bombeiros, SAMU, Polícia e Defesa Civil)</label><textarea id="crsPlanoContatos" rows="2" maxlength="1000"></textarea>
      <label for="crsPlanoResp">Responsáveis</label><textarea id="crsPlanoResp" rows="2" maxlength="1000"></textarea>
      <p class="subtitle">Salvar cria uma versão nova (a revisão anual é salvar de novo, mesmo sem mudar nada).${crsLista(d.versoesDoPlano).length ? ` Versões: ${crsLista(d.versoesDoPlano).map(v => `${crsInteiro(v.versao)} (${crsData(v.revisadoEm)}, ${escaparHtmlEbd(v.registradoPor || "")})`).join(" · ")}.` : ""}</p>
      <div class="psc-acoes"><button type="button" class="btn-confirmar crs-btn" data-on-click="crsSalvarPlanoAcao" data-args-click="${argsAttr(id, versao, ARG.elemento)}">💾 ${p ? "Salvar a revisão" : "Registrar o plano"}</button></div></section>
    <section class="crs-secao"><h5>Simulados</h5>
      <div class="crs-campos"><label for="crsSimData">Data</label><input type="date" id="crsSimData">
      <label for="crsSimTipo">Tipo</label><select id="crsSimTipo">${crsLista(crsCat && crsCat.tiposSimulado).map(t => `<option value="${escaparHtmlEbd(t.codigo)}">${escaparHtmlEbd(t.rotulo)}</option>`).join("")}</select>
      <label for="crsSimPart">Participantes (número)</label><input type="number" id="crsSimPart" min="1" inputmode="numeric">
      <label for="crsSimDur">Duração (minutos)</label><input type="number" id="crsSimDur" min="1" max="1440" inputmode="numeric"></div>
      <label for="crsSimBem">O que correu bem</label><textarea id="crsSimBem" rows="2" maxlength="1000"></textarea>
      <label for="crsSimMelhorar">O que melhorar</label><textarea id="crsSimMelhorar" rows="2" maxlength="1000"></textarea>
      <div class="psc-acoes"><button type="button" class="btn-confirmar crs-btn" data-on-click="crsRegistrarSimuladoAcao" data-args-click="${argsAttr(id, ARG.elemento)}">💾 Registrar o simulado</button></div>
      ${crsLista(d.simulados).map(s => `<article class="crs-cartao${s.anulacao ? " crs-corrigida" : ""}"><p><strong>${crsDia(s.data)} · ${escaparHtmlEbd(s.tipoRotulo || s.tipo)}</strong> — ${crsNumero(s.participantes)} participante(s), ${crsNumero(s.duracaoMinutos)} min</p>
        ${s.correuBem ? `<p class="crs-texto">👍 ${escaparHtmlEbd(s.correuBem)}</p>` : ""}${s.melhorar ? `<p class="crs-texto">🔧 ${escaparHtmlEbd(s.melhorar)}</p>` : ""}
        <p class="subtitle">Registrado por ${escaparHtmlEbd(s.registradoPor || "")}${s.anulacao ? ` · ANULADO por ${escaparHtmlEbd(s.anulacao.anuladoPor || "")}: ${escaparHtmlEbd(s.anulacao.motivo)}` : ""}</p>
        ${!s.anulacao && crsInteiro(s.simuladoId) ? crsHtmlAnular("simulado", crsInteiro(s.simuladoId)) : ""}</article>`).join("")}</section>
    <section class="crs-secao"><h5>Vistoria predial</h5>
      <div class="crs-campos"><label for="crsVisData">Data</label><input type="date" id="crsVisData"></div>
      ${itens.map(i => `<fieldset class="crs-fieldset"><legend>${escaparHtmlEbd(i.rotulo)}</legend><p class="subtitle">${escaparHtmlEbd(i.dica || "")}</p>
        <div class="com-canais">${resultados.map(r => `<label class="com-canal"><input type="radio" name="crsVis_${escaparHtmlEbd(i.codigo)}" id="crsVis_${escaparHtmlEbd(i.codigo)}_${escaparHtmlEbd(r.codigo)}" ${r.codigo === "OK" ? "checked" : ""}> ${escaparHtmlEbd(r.rotulo)}</label>`).join("")}</div>
        <label for="crsVisPend_${escaparHtmlEbd(i.codigo)}">Se pendente: o que falta</label><input type="text" id="crsVisPend_${escaparHtmlEbd(i.codigo)}" maxlength="500"></fieldset>`).join("")}
      <label for="crsVisObs">Observações</label><textarea id="crsVisObs" rows="2" maxlength="1000"></textarea>
      <div class="psc-acoes"><button type="button" class="btn-confirmar crs-btn" data-on-click="crsRegistrarVistoriaAcao" data-args-click="${argsAttr(id, ARG.elemento)}">💾 Registrar a vistoria</button></div>
      ${crsLista(d.vistorias).map(v => `<article class="crs-cartao${v.anulacao ? " crs-corrigida" : ""}"><p><strong>Vistoria de ${crsDia(v.data)}</strong> — por ${escaparHtmlEbd(v.registradoPor || "")}${v.anulacao ? ` · ANULADA: ${escaparHtmlEbd(v.anulacao.motivo)}` : ""}</p>
        <ul>${crsLista(v.itens).map(i => {
          const iid = crsInteiro(i.vistoriaItemId);
          const pendente = i.resultado === "PENDENTE" && !i.resolvidaEm;
          return `<li>${escaparHtmlEbd(i.itemRotulo || i.item)}: ${escaparHtmlEbd(crsRotulo(resultados, i.resultado))}${i.pendencia ? ` — ${escaparHtmlEbd(i.pendencia)}` : ""}${i.resolvidaEm ? ` · ✅ resolvida em ${crsData(i.resolvidaEm)} (${escaparHtmlEbd(i.comoResolvida || "")})` : ""}
            ${pendente && !v.anulacao && iid ? `<div class="psc-acoes"><input type="text" id="crsResolve${iid}" maxlength="500" placeholder="Como foi resolvida"><button type="button" class="btn-confirmar btn-secundario crs-btn" data-on-click="crsResolverPendenciaAcao" data-args-click="${argsAttr(iid, ARG.elemento)}">✔️ Resolvida</button></div>` : ""}</li>`;
        }).join("")}</ul>${v.observacoes ? `<p class="crs-texto">${escaparHtmlEbd(v.observacoes)}</p>` : ""}
        ${!v.anulacao && crsInteiro(v.vistoriaId) ? crsHtmlAnular("vistoria", crsInteiro(v.vistoriaId)) : ""}</article>`).join("")}</section>
    <section class="crs-secao"><h5>AVCB e seguro dos imóveis</h5>
      ${crsLista(d.imoveis).length ? `<ul>${crsLista(d.imoveis).map(i => `<li><strong>${escaparHtmlEbd(i.descricao)}</strong>: AVCB ${escaparHtmlEbd(CRS_AVCB[i.avcb] || i.avcb)}${i.avcbVigenciaFim ? ` (até ${crsDia(i.avcbVigenciaFim)})` : ""} · seguro ${escaparHtmlEbd(CRS_SEGURO[i.seguro] || i.seguro)}${i.seguroFim ? ` (até ${crsDia(i.seguroFim)})` : ""}</li>`).join("")}</ul>
        <p class="subtitle">O AVCB e o seguro são cadastrados pela Tesouraria em Financeiro → Imóveis e Seguros.</p>` : `<p class="subtitle">Nenhum imóvel desta congregação no patrimônio.</p>`}</section>
    <section class="crs-secao"><h5>Equipe de segurança</h5>
      <p class="subtitle">Só adultos da congregação. Quem muda de congregação ou é desligado sai sozinho da equipe.</p>
      <label for="crsEqBusca">Procurar a pessoa (nome ou matrícula)</label><div class="psc-acoes"><input type="text" id="crsEqBusca" maxlength="60">
        <button type="button" class="btn-confirmar btn-secundario crs-btn" data-on-click="crsBuscarMembrosAcao" data-args-click="${argsAttr(id, ARG.elemento)}">🔎 Procurar</button></div>
      <label for="crsEqMembro">Pessoa</label><select id="crsEqMembro"><option value="">— procure acima —</option></select>
      <label for="crsEqFuncao">Função</label><select id="crsEqFuncao">${crsLista(crsCat && crsCat.funcoes).map(f => `<option value="${escaparHtmlEbd(f.codigo)}">${escaparHtmlEbd(f.rotulo)}</option>`).join("")}</select>
      <div class="crs-campos"><label for="crsEqDesde">Desde</label><input type="date" id="crsEqDesde"><label for="crsEqAte">Até (se já se sabe)</label><input type="date" id="crsEqAte"></div>
      <div class="psc-acoes"><button type="button" class="btn-confirmar crs-btn" data-on-click="crsIncluirEquipeAcao" data-args-click="${argsAttr(id, ARG.elemento)}">➕ Incluir na equipe</button></div>
      ${crsLista(d.equipe).length ? `<ul>${crsLista(d.equipe).map(e => {
        const eid = crsInteiro(e.equipeId);
        return `<li>${escaparHtmlEbd(e.nome)} — ${escaparHtmlEbd(e.funcaoRotulo || e.funcao)} · desde ${crsDia(e.desde)}${e.ate ? ` até ${crsDia(e.ate)}` : ""}${e.ativo ? "" : e.saiuDaCongregacao ? " · saiu da congregação" : " · fora da equipe"}
          ${!e.encerradoEm && eid ? `<button type="button" class="btn-confirmar btn-secundario crs-btn" data-on-click="crsSairEquipeAcao" data-args-click="${argsAttr(eid, ARG.elemento)}">Registrar a saída</button>` : ""}</li>`;
      }).join("")}</ul>` : `<p class="subtitle">Nenhuma pessoa na equipe ainda.</p>`}</section>`;
  if (p) { crsEl("crsPlanoRotas").value = String(p.rotasEvacuacao || ""); crsEl("crsPlanoPontos").value = String(p.pontosEncontro || ""); crsEl("crsPlanoContatos").value = String(p.contatosLocais || ""); crsEl("crsPlanoResp").value = String(p.responsaveis || ""); }
}
// `tipo` é sempre um dos dois textos fixos ("simulado" ou "vistoria"), e `id` um inteiro
function crsHtmlAnular(tipo, id) {
  return `<details class="crs-form"><summary>Anular (registro errado)</summary><label for="crsAnular_${tipo}_${id}">Motivo da anulação</label><input type="text" id="crsAnular_${tipo}_${id}" maxlength="300">
    <div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario crs-btn" data-on-click="${tipo === "simulado" ? "crsAnularSimuladoAcao" : "crsAnularVistoriaAcao"}" data-args-click="${argsAttr(id, ARG.elemento)}">Anular</button></div></details>`;
}
async function crsGravarSeguranca(botao, caminho, corpo, chave) {
  const marca = crsMarca();
  await crsProteger(botao, async () => {
    const data = await crsPostar(caminho, corpo);
    if (!crsViva(marca)) return;
    crsMostrarResultado(data, "crsSegMsg");
    if (data.sucesso !== false || data.httpStatus === 409) { await crsCarregarSeguranca(); if (data.sucesso === false) crsEscrever("crsSegMsg", crsMsgErro(data), true); }
  }, chave);
}
function crsSalvarPlanoAcao(congregacaoId, versaoAtual, botao) {
  const id = crsInteiro(congregacaoId);
  if (!id) return undefined;
  return crsGravarSeguranca(botao, "plano", { congregacaoId: id, versaoAtual: Number.isInteger(Number(versaoAtual)) ? Number(versaoAtual) : 0, rotasEvacuacao: crsTextoLivre("crsPlanoRotas"),
    pontosEncontro: crsTextoLivre("crsPlanoPontos"), contatosLocais: crsTextoLivre("crsPlanoContatos"), responsaveis: crsTextoLivre("crsPlanoResp") }, `plano-${id}`);
}
function crsRegistrarSimuladoAcao(congregacaoId, botao) {
  const id = crsInteiro(congregacaoId);
  if (!id) return undefined;
  const inteiro = (campo) => { const t = crsValor(campo); return /^[0-9]+$/.test(t) ? Number(t) : t; };
  return crsGravarSeguranca(botao, "simulado", { congregacaoId: id, data: crsValor("crsSimData"), tipo: crsValor("crsSimTipo"), participantes: inteiro("crsSimPart"), duracaoMinutos: inteiro("crsSimDur"),
    correuBem: crsTextoLivre("crsSimBem"), melhorar: crsTextoLivre("crsSimMelhorar") }, `simulado-${id}`);
}
function crsRegistrarVistoriaAcao(congregacaoId, botao) {
  const id = crsInteiro(congregacaoId);
  if (!id || !crsCat) return undefined;
  const itens = crsCat.itensVistoria.map(i => {
    const r = crsCat.resultados.find(x => crsMarcado(`crsVis_${i.codigo}_${x.codigo}`));
    const resultado = r ? r.codigo : "";
    return { item: i.codigo, resultado, ...(resultado === "PENDENTE" ? { pendencia: crsValor(`crsVisPend_${i.codigo}`) } : {}) };
  });
  return crsGravarSeguranca(botao, "vistoria", { congregacaoId: id, data: crsValor("crsVisData"), itens, observacoes: crsTextoLivre("crsVisObs") }, `vistoria-${id}`);
}
function crsResolverPendenciaAcao(vistoriaItemId, botao) {
  const id = crsInteiro(vistoriaItemId);
  if (!id) return undefined;
  return crsGravarSeguranca(botao, "resolver-pendencia", { vistoriaItemId: id, como: crsValor(`crsResolve${id}`) }, `pendencia-${id}`);
}
async function crsAnularSimuladoAcao(simuladoId, botao) {
  const id = crsInteiro(simuladoId);
  if (!id || !(await confirmarAcao("Anular este simulado? Ele fica no histórico, riscado, e deixa de contar.", "Anular"))) return;
  await crsGravarSeguranca(botao, "anular-simulado", { simuladoId: id, motivo: crsValor(`crsAnular_simulado_${id}`) }, `anular-s-${id}`);
}
async function crsAnularVistoriaAcao(vistoriaId, botao) {
  const id = crsInteiro(vistoriaId);
  if (!id || !(await confirmarAcao("Anular esta vistoria? Ela fica no histórico, riscada, e deixa de contar.", "Anular"))) return;
  await crsGravarSeguranca(botao, "anular-vistoria", { vistoriaId: id, motivo: crsValor(`crsAnular_vistoria_${id}`) }, `anular-v-${id}`);
}
async function crsBuscarMembrosAcao(congregacaoId, botao) {
  const id = crsInteiro(congregacaoId);
  const q = crsValor("crsEqBusca");
  if (!id || q.length < 2) { crsEscrever("crsSegMsg", "Escreva ao menos 2 letras do nome (ou a matrícula).", true); return; }
  const marca = crsMarca();
  await crsProteger(botao, async () => {
    const data = await crsPostar("buscar-membros", { congregacaoId: id, q });
    if (!crsViva(marca)) return;
    const sel = crsEl("crsEqMembro");
    if (data.sucesso === false || !Array.isArray(data.membros)) { crsMostrarResultado(data, "crsSegMsg"); return; }
    if (sel) sel.innerHTML = data.membros.length ? data.membros.map(m => `<option value="${crsInteiro(m.membroId)}">${escaparHtmlEbd(m.nome)} (${crsInteiro(m.membroId)})</option>`).join("")
      : `<option value="">Ninguém encontrado (só adultos ativos da congregação)</option>`;
  }, "busca");
}
function crsIncluirEquipeAcao(congregacaoId, botao) {
  const id = crsInteiro(congregacaoId);
  const membroId = crsInteiro(crsValor("crsEqMembro"));
  if (!id) return undefined;
  if (!membroId) { crsEscrever("crsSegMsg", "Procure e escolha a pessoa.", true); return undefined; }
  return crsGravarSeguranca(botao, "equipe", { congregacaoId: id, membroId, funcao: crsValor("crsEqFuncao"), desde: crsValor("crsEqDesde"), ate: crsValor("crsEqAte") }, `equipe-${id}`);
}
async function crsSairEquipeAcao(equipeId, botao) {
  const id = crsInteiro(equipeId);
  if (!id || !(await confirmarAcao("Registrar a saída desta pessoa da equipe de segurança? O histórico fica.", "Registrar a saída"))) return;
  await crsGravarSeguranca(botao, "sair-equipe", { equipeId: id }, `sair-${id}`);
}

// ---- Meus Dados (LGPD art. 18, I): a equipe de segurança, as crises em que a pessoa foi o porta-voz e quantos registros dela há na crise ----
function crsCartaoMeusDados(c) {
  if (!c || typeof c !== "object") return "";
  const equipe = crsLista(c.equipeSeguranca), pv = crsLista(c.portaVozEmCrises);
  const n = c.registrosNaCrise && typeof c.registrosNaCrise === "object" ? c.registrosNaCrise : {};
  const total = crsNumero(n.pedidosDeImprensa) + crsNumero(n.manifestacoes) + crsNumero(n.respostas);
  if (!equipe.length && !pv.length && !total) return "";
  return `
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Crise e segurança</h4>
      ${equipe.map(e => `<p class="linha-perfil"><strong>Equipe de segurança:</strong> ${escaparHtmlEbd(e.funcao)} — ${escaparHtmlEbd(e.congregacao || "")}, desde ${crsDia(e.desde)}${e.ate ? ` até ${crsDia(e.ate)}` : ""}</p>`).join("")}
      ${pv.length ? `<p class="linha-perfil"><strong>Porta-voz em regime de crise:</strong> ${pv.map(x => crsData(x.abertaEm)).join(", ")}</p>` : ""}
      ${total ? `<p class="linha-perfil"><strong>Registros seus na crise:</strong> ${crsNumero(n.pedidosDeImprensa)} pedido(s) da imprensa, ${crsNumero(n.manifestacoes)} manifestação(ões), ${crsNumero(n.respostas)} resposta(s)</p>` : ""}
    </div>`;
}

registrarAcoes({
  crsAbrirCongregacaoAcao, crsAbrirCriseAcao, crsAnularSimuladoAcao, crsAnularVistoriaAcao, crsBuscarMembrosAcao, crsCarregarCrisesAcao, crsContinuarAvisoAcao, crsCorrigirDemandaAcao,
  crsCorrigirManifAcao, crsEncerrarAcao, crsIncluirEquipeAcao, crsIrParaImprensaAcao, crsMostrarSecaoAcao, crsRegistrarDemandaAcao, crsRegistrarManifAcao, crsRegistrarSimuladoAcao,
  crsRegistrarVistoriaAcao, crsResolverPendenciaAcao, crsResponderAcao, crsSairEquipeAcao, crsSalvarPlanoAcao, crsTrocarCriseManifAcao, crsTrocarPortaVozAcao
});
