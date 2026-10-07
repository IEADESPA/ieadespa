// app/modulos/eventos-congressos.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- Eventos e Congressos (v7.4) ----
// Dossiê de governança do evento do Calendário: organizadores, convidados externos (Protocolo de Convidados,
// Regimento Art. 111 e 111-A: parecer do Conselho de Ética + Nada Consta da Presidência) e Caixa Flutuante de
// Eventos (Art. 53-E, §2º e §3º; Art. 152). O evento é do Calendário e o SITE segue dono da inscrição, lista de
// espera, check-in e certificado: esta tela não duplica nada disso. Toda regra (antecedência de 10 dias,
// segregação de funções, soma exata do superávit, escopo e permissão) mora no servidor (shared/eventos.js, rota
// /api/eventos-gestao/*): aqui só se monta o que o servidor devolve e se manda o que a pessoa fez; recusa de regra
// vem como 422 { mensagem } e é mostrada tal qual, sem limpar o formulário. Tudo que vem do servidor e entra em
// innerHTML passa por escaparHtmlEbd; onclick só recebe id numérico ou constante nossa. O MESMO dossiê serve ao
// módulo de gestão (G) e a Meu Painel → Eventos (M). Datas/horas reaproveitam calData/calDataHora (Brasília).
const EVT_SECOES = ["painel", "fila", "caixas"];
const EVT_SITE = "https://www.ieadespa.org.br";
const EVT_STATUS_CONVIDADO = {
  RASCUNHO: ["📝 Rascunho", "cal-st-cancelado"],
  EM_ANALISE: ["⏳ Em análise", "cal-st-proposto"],
  AUTORIZADO: ["✅ Autorizado", "cal-st-homologado"],
  VETADO: ["⛔ Vetado", "cal-st-indeferido"],
  CANCELADO: ["⚪ Cancelado", "cal-st-cancelado"]
};
const EVT_FASE_CAIXA = {
  ABERTO_NO_PRAZO: ["🟢 Aberto, no prazo", "cal-st-homologado"],
  ABERTO_ATRASADO: ["🔴 Aberto, FORA do prazo", "cal-st-indeferido"],
  ENCERRADO: ["🟦 Encerrado — aguarda a conferência", "cal-st-deferido"],
  CONFERIDO: ["✅ Conferido pela Tesouraria Geral", "cal-st-homologado"]
};
const EVT_DECISAO = {
  FAVORAVEL: ["✅ Favorável", "cal-st-homologado"], DESFAVORAVEL: ["⛔ Contrário", "cal-st-indeferido"],
  CONCEDIDO: ["✅ Concedido", "cal-st-homologado"], NEGADO: ["⛔ Negado", "cal-st-indeferido"]
};
// chave do resumo do painel, rótulo e o que pintar quando o valor é maior que zero
const EVT_CONTADORES = [
  ["eventos", "Eventos", ""], ["congressos", "Congressos Unificados", ""], ["convidadosEmAnalise", "Convidados em análise", "alerta"],
  ["caixasAbertos", "Caixas abertos", ""], ["caixasForaDoPrazo", "Caixas fora do prazo", "erro"], ["caixasParaConferir", "Caixas para conferir", "alerta"],
  ["semOrganizador", "Eventos sem organizador", "erro"]
];
const EVT_CTX = { G: { dossie: "evtDossieG", mensagem: "evtDossieMsgG" }, M: { dossie: "evtDossieM", mensagem: "evtDossieMsgM" } };
const EVT_TEXTO_SUPERAVIT = "O que sobrar no caixa (superávit) não pode ficar com a Área ou a Região: precisa ser recolhido à Sede Geral ou convertido em benfeitoria para o Campo, cada destino com o seu comprovante (Regimento Art. 53-E, §2º, II). Se o caixa fechar no negativo, explique o déficit; se fechar zerado, basta confirmar.";

let evtDonoDaTela = null;            // matrícula de quem a tela foi montada (não vaza dado ao trocar de login)
let evtSecaoAtual = "painel";
let evtCatalogos = null;             // GET catalogos (papéis, tipos de convidado, categorias do caixa, destinos...)
let evtPainel = null;
let evtFila = null;
let evtCaixas = [];
let evtDossie = { G: null, M: null };   // resposta de evento?eventoId= (G = gestão, M = Meu Painel)
let evtDestinos = { G: [], M: [] };     // linhas de destino do superávit em edição
let evtMeusEventos = [];
let evtAcaoEmCurso = false;          // trava duplo clique nas ações que gravam
let evtMeuSeq = 0;

function evtPodeGestao() { return authPermissoes.includes("eventos_gestao"); }
function evtPodeEtica() { return authPermissoes.includes("eventos_etica"); }
function evtPodePresidencia() { return authPermissoes.includes("eventos_presidencia"); }
function evtPodeFila() { return evtPodeEtica() || evtPodePresidencia(); }
// A conferência do caixa é da Tesouraria Geral ("financeiro" com escopo global): o servidor confere o escopo.
function evtPodeCaixas() { return evtPodeGestao() || authPermissoes.includes("financeiro"); }
function evtPodeModulo() { return evtPodeGestao() || evtPodeFila(); }
function evtSecaoPermitida(secao) {
  if (secao === "painel") return evtPodeGestao();
  if (secao === "fila") return evtPodeFila();
  if (secao === "caixas") return evtPodeCaixas();
  return false;
}

function evtEl(id) { return document.getElementById(id); }
function evtTexto(id) { const c = evtEl(id); return c ? String(c.value == null ? "" : c.value).trim() : ""; }
function evtMarcado(id) { const c = evtEl(id); return !!(c && c.checked); }
function evtDe(mapa, chave, padrao) { return Object.prototype.hasOwnProperty.call(mapa, chave) ? mapa[chave] : padrao; }
function evtNumero(valor) { const n = Number(valor); return Number.isFinite(n) ? n : 0; }
function evtContexto(bruto) { return bruto === "M" ? "M" : "G"; }
function evtRolarPara(id) {
  const el = evtEl(id);
  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" });
}
// Só o formato do identificador do site (letras minúsculas, números e hífen) vira link para a página do evento.
function evtLinkDoEvento(slug) {
  const s = String(slug == null ? "" : slug);
  return /^[a-z0-9][a-z0-9-]{0,148}$/.test(s) ? `${EVT_SITE}/evento/${s}/` : "";
}
function evtDinheiro(valor) { return formatarMoedaEbd(evtNumero(valor)); }
// Valor digitado: aceita "1234,56", "1.234,56" e "1234.56"; no máximo 2 casas; maior que zero.
function evtAnalisarValor(texto) {
  let t = String(texto == null ? "" : texto).trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (!t) return { ok: false, erro: "Informe um valor maior que zero." };
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");   // 1.234 = mil duzentos e trinta e quatro
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, erro: "Informe um valor maior que zero." };
  if (/\.\d{3,}$/.test(t)) return { ok: false, erro: "O valor aceita no máximo duas casas decimais." };
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, erro: "Informe um valor maior que zero." };
  return { ok: true, valor: Math.round(n * 100) / 100 };
}
const evtCentavos = (valor) => Math.round(evtNumero(valor) * 100);

// ---- chamadas à API (nunca lançam: erro de rede ou resposta que não é JSON viram { sucesso:false, mensagem }) ----
async function evtRequisitar(caminho, opcoes) {
  try {
    const res = await fetchProtegido(`${API_BASE}/eventos-gestao/${caminho}`, opcoes);
    let corpo = null;
    try { corpo = await res.json(); } catch { /* sem JSON */ }
    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { sucesso: false, mensagem: `Resposta inesperada do servidor (${res.status}).`, httpStatus: res.status };
    if (res.status >= 400) corpo.sucesso = false;
    corpo.httpStatus = res.status;
    return corpo;
  } catch {
    return { sucesso: false, mensagem: "Não foi possível falar com o servidor agora." };
  }
}
function evtObter(caminho) { return evtRequisitar(caminho); }
function evtPostar(acao, corpo) {
  return evtRequisitar(acao, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
}
function evtMensagemErro(data) { return (data && data.mensagem) || "Não foi possível concluir a operação agora."; }
// Toast + texto fixo na tela (textContent: nada de HTML aqui).
function mostrarResultadoEvt(data, idMensagem, destaque) {
  const texto = evtMensagemErro(data);
  mostrarToast(texto, data && data.sucesso === false ? "erro" : "sucesso");
  const el = evtEl(idMensagem);
  if (el) { el.textContent = texto; el.className = destaque ? "subtitle psc-aviso" : "subtitle"; }
}

// ---- selos e peças de tela ----
function evtSelo(mapa, chave) {
  const [rotulo, classe] = evtDe(mapa, chave, null) || [escaparHtmlEbd(chave || "—"), "cal-st-cancelado"];
  return `<span class="cal-selo ${classe}">${rotulo}</span>`;
}
function evtSeloCongresso(e) {
  return e && e.congresso ? `<span class="evt-selo-congresso" title="Congresso Unificado: as congregações ficam fechadas e o Campo todo se reúne">🎪 Congresso Unificado</span>` : "";
}
function evtSeloCaixa(cx) {
  if (!cx) return `<span class="cal-selo cal-st-cancelado">sem caixa</span>`;
  const selo = evtSelo(EVT_FASE_CAIXA, cx.fase || cx.status);
  return cx.status === "ABERTO" && cx.prazoEncerramentoEm ? `${selo} <span class="psc-legenda">prazo ${escaparHtmlEbd(calData(cx.prazoEncerramentoEm))}${cx.atrasado && cx.diasAtraso ? ` — ${evtNumero(cx.diasAtraso)} dia(s) de atraso` : ""}</span>` : selo;
}
function evtChipsConvidados(c) {
  const t = c || {};
  const chip = (n, rotulo, classe) => (evtNumero(n) > 0 ? `<span class="cal-selo ${classe}">${evtNumero(n)} ${rotulo}</span>` : "");
  if (!evtNumero(t.total) && !evtNumero(t.cancelados)) return "<span class='psc-legenda'>nenhum convidado</span>";
  return [chip(t.autorizados, "autorizado(s)", "cal-st-homologado"), chip(t.emAnalise, "em análise", "cal-st-proposto"), chip(t.rascunho, "em rascunho", "cal-st-cancelado"),
    chip(t.vetados, "vetado(s)", "cal-st-indeferido"), chip(t.cancelados, "cancelado(s)", "cal-st-cancelado")].filter(Boolean).join(" ");
}
function evtRotuloDoCatalogo(lista, codigo) {
  const item = (lista || []).find(x => x.codigo === codigo);
  return item ? item.rotulo : codigo;
}
function evtOpcoesHtml(lista, valor, rotulo, placeholder) {
  return (placeholder != null ? `<option value="">${escaparHtmlEbd(placeholder)}</option>` : "")
    + lista.map(x => `<option value="${escaparHtmlEbd(valor(x))}">${escaparHtmlEbd(rotulo(x))}</option>`).join("");
}
// "faltam 8 dias para o evento" / "o evento é HOJE" / "o evento já começou"
function evtTextoDias(dias) {
  const n = Number(dias);
  if (!Number.isFinite(n)) return "";
  if (n < 0) return "o evento já começou";
  if (n === 0) return "o evento é HOJE";
  return n === 1 ? "falta 1 dia para o evento" : `faltam ${n} dias para o evento`;
}

// ---- troca de login: não deixa o dado da pessoa anterior na tela ----
function evtLimparTela() {
  evtSecaoAtual = "painel"; evtCatalogos = null; evtPainel = null; evtFila = null; evtCaixas = []; evtDossie = { G: null, M: null }; evtDestinos = { G: [], M: [] };
  evtMeusEventos = []; evtMeuSeq++;
  ["evtContadores", "evtListaEventos", "evtFilaEtica", "evtFilaPresidencia", "evtTabelaCaixas", "evtMeusEventos", "evtDossieM"].forEach(id => {
    const el = evtEl(id);
    if (el) el.innerHTML = "";
  });
  const g = evtEl("evtDossieG");
  if (g) g.innerHTML = "<p class='subtitle'>Abra o dossiê de um evento (<em>Abrir dossiê</em>) no painel, na fila ou nos caixas.</p>";
  ["evtResultadoPainel", "evtResultadoFila", "evtResultadoCaixas", "evtDossieMsgG", "evtDossieMsgM", "evtMeuResultado"].forEach(id => {
    const el = evtEl(id);
    if (el) el.textContent = "";
  });
  const bloco = evtEl("evtMeusBloco");
  if (bloco) bloco.style.display = "none";
}
function evtVerificarDono() {
  if (evtDonoDaTela !== authMatricula) { evtLimparTela(); evtDonoDaTela = authMatricula; }
}

async function evtGarantirCatalogos(forcar) {
  if (evtCatalogos && !forcar) return evtCatalogos;
  const data = await evtObter("catalogos");
  if (data.sucesso === false) { evtCatalogos = null; return null; }
  const lista = (v) => (Array.isArray(v) ? v : []);
  const regras = data.regras && typeof data.regras === "object" ? data.regras : {};
  evtCatalogos = {
    papeis: lista(data.papeis), tiposConvidado: lista(data.tiposConvidado), statusConvidado: lista(data.statusConvidado),
    categoriasEntrada: lista(data.categoriasEntrada), categoriasSaida: lista(data.categoriasSaida), destinosSuperavit: lista(data.destinosSuperavit), statusCaixa: lista(data.statusCaixa),
    regras: { antecedenciaEticaDias: evtNumero(regras.antecedenciaEticaDias) || 10, nivelMaximoNadaConsta: evtNumero(regras.nivelMaximoNadaConsta) || 2, prazoCaixaDias: evtNumero(regras.prazoCaixaDias) || 15 }
  };
  return evtCatalogos;
}
function evtCatalogosOuVazio() {
  return evtCatalogos || { papeis: [], tiposConvidado: [], statusConvidado: [], categoriasEntrada: [], categoriasSaida: [], destinosSuperavit: [], statusCaixa: [], regras: {} };
}

// ---- entrada da aba e pílulas internas (cada uma só para quem tem direito) ----
function evtAplicarPermissoes() {
  EVT_SECOES.forEach(s => {
    const btn = evtEl(`btnEvtSecao${capitalize(s)}`);
    if (btn) btn.style.display = evtSecaoPermitida(s) ? "" : "none";
  });
}
async function carregarOpcoesEventosAcao() {
  evtVerificarDono();
  evtAplicarPermissoes();
  if (!evtPodeModulo() && !evtPodeCaixas()) return;
  await evtGarantirCatalogos();
  const campo = evtEl("evtPainelAno");
  if (campo && !campo.value) campo.value = String(calMesDe(calHojeBrasilia()).ano);
  let secao = evtSecaoAtual;
  if (!evtSecaoPermitida(secao)) secao = EVT_SECOES.find(evtSecaoPermitida) || "";
  if (!secao) return;
  evtMostrarSecaoAcao(secao);
}
// `semCarregar`: só troca a seção, sem buscar dados.
function evtMostrarSecaoAcao(secao, semCarregar) {
  if (!evtSecaoPermitida(secao)) secao = EVT_SECOES.find(evtSecaoPermitida) || "";
  if (!secao) return;
  evtSecaoAtual = secao;
  EVT_SECOES.forEach(nome => {
    const div = evtEl(`evtSecao${capitalize(nome)}`);
    if (div) div.style.display = nome === secao ? "block" : "none";
    const btn = evtEl(`btnEvtSecao${capitalize(nome)}`);
    if (btn && btn.classList) btn.classList.toggle("ativo", nome === secao);
  });
  const blocoEtica = evtEl("evtBlocoFilaEtica"), blocoPresidencia = evtEl("evtBlocoFilaPresidencia");
  if (blocoEtica) blocoEtica.style.display = evtPodeEtica() ? "" : "none";
  if (blocoPresidencia) blocoPresidencia.style.display = evtPodePresidencia() ? "" : "none";
  if (semCarregar) return;
  if (secao === "painel") evtCarregarPainelAcao();
  else if (secao === "fila") evtCarregarFilaAcao();
  else if (secao === "caixas") evtCarregarCaixasAcao();
}

// -- a) Painel (eventos_gestao) --
async function evtCarregarPainelAcao() {
  const campo = evtEl("evtPainelAno");
  if (campo && !campo.value) campo.value = String(calMesDe(calHojeBrasilia()).ano);
  const ano = numeroDoCampo("evtPainelAno");
  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) { mostrarToast("Informe um ano válido (2020 a 2100).", "erro"); return; }
  const aviso = evtEl("evtResultadoPainel"), contadores = evtEl("evtContadores"), lista = evtEl("evtListaEventos");
  if (aviso) aviso.textContent = "Carregando o painel…";
  const data = await evtObter(`painel?ano=${ano}`);
  if (data.sucesso === false) {
    evtPainel = null;
    if (contadores) contadores.innerHTML = "";
    if (lista) lista.innerHTML = "";
    if (aviso) aviso.textContent = evtMensagemErro(data);
    return;
  }
  evtPainel = data;
  const resumo = data.resumo || {};
  const eventos = Array.isArray(data.eventos) ? data.eventos : [];
  if (aviso) aviso.textContent = `${eventos.length} evento(s) em ${evtNumero(data.ano) || ano}: os de Nível 1 a 3 e os de Área/Região/Campo (o ciclo mensal fica de fora).`;
  if (contadores) {
    contadores.innerHTML = EVT_CONTADORES.map(([chave, rotulo, tipo]) => {
      const valor = evtNumero(resumo[chave]);
      return `<div class="cnl-contador${valor > 0 && tipo ? ` cnl-contador-${tipo}` : ""}"><span class="cnl-contador-valor">${valor}</span><span class="cnl-contador-rotulo">${rotulo}</span></div>`;
    }).join("");
  }
  if (lista) lista.innerHTML = eventos.length ? eventos.map(evtRenderCartaoPainel).join("") : "<p class='subtitle'>Nenhum evento nesse ano.</p>";
}
function evtRenderCartaoPainel(e) {
  const id = Number(e.eventoId);
  const atencao = Array.isArray(e.atencao) ? e.atencao : [];
  return `<div class="cal-cartao cartao-area-ebd${e.congresso ? " evt-congresso" : ""}">
    <h5>${escaparHtmlEbd(e.titulo)} ${evtSeloCongresso(e)}</h5>
    <p style="margin:4px 0;">${calSeloNivel(e.nivel, e.rotuloNivel)} ${calSeloStatus(e.status)}
      <span class="psc-legenda">${escaparHtmlEbd(calPeriodo(e.dataInicio, e.dataFim, e.horaInicio))} · ${escaparHtmlEbd(calTextoAbrangencia(e))} · ${escaparHtmlEbd(e.tipoNome || "")}${e.local ? ` · 📍 ${escaparHtmlEbd(e.local)}` : ""}</span></p>
    <p style="margin:4px 0;">👥 <strong>${evtNumero(e.organizadores)}</strong> organizador(es) · 🎤 ${evtChipsConvidados(e.convidados)} · 💰 ${evtSeloCaixa(e.caixa)}</p>
    ${atencao.length ? `<ul class="evt-atencao">${atencao.map(t => `<li>⚠️ ${escaparHtmlEbd(t)}</li>`).join("")}</ul>` : ""}
    <div><button type="button" class="btn-link" data-on-click="evtAbrirDossieAcao" data-args-click="${argsAttr(id, "G")}">🗂️ Abrir dossiê</button></div>
  </div>`;
}

// -- c) Fila de análise (eventos_etica e/ou eventos_presidencia) --
async function evtCarregarFilaAcao() {
  const aviso = evtEl("evtResultadoFila"), etica = evtEl("evtFilaEtica"), presidencia = evtEl("evtFilaPresidencia");
  if (aviso) aviso.textContent = "Carregando a fila…";
  const data = await evtObter("fila");
  if (data.sucesso === false) {
    evtFila = null;
    if (etica) etica.innerHTML = "";
    if (presidencia) presidencia.innerHTML = "";
    if (aviso) aviso.textContent = evtMensagemErro(data);
    return;
  }
  evtFila = data;
  const listaEtica = Array.isArray(data.etica) ? data.etica : [], listaPresidencia = Array.isArray(data.presidencia) ? data.presidencia : [];
  const urgentes = [...listaEtica, ...listaPresidencia].filter(x => x.urgente).length;
  if (aviso) aviso.textContent = `${data.ehEtica ? `${listaEtica.length} para o parecer do Conselho de Ética` : ""}${data.ehEtica && data.ehPresidencia ? "; " : ""}${data.ehPresidencia ? `${listaPresidencia.length} para o Nada Consta da Presidência` : ""}${urgentes ? ` — ${urgentes} URGENTE(S): o evento é daqui a poucos dias` : ""}.`;
  const blocoEtica = evtEl("evtBlocoFilaEtica"), blocoPresidencia = evtEl("evtBlocoFilaPresidencia");
  if (blocoEtica) blocoEtica.style.display = data.ehEtica ? "" : "none";
  if (blocoPresidencia) blocoPresidencia.style.display = data.ehPresidencia ? "" : "none";
  if (etica) etica.innerHTML = listaEtica.length ? listaEtica.map(x => evtRenderCartaoFila(x, "ETICA")).join("") : "<p class='subtitle'>Nenhum convidado esperando o parecer do Conselho de Ética.</p>";
  if (presidencia) presidencia.innerHTML = listaPresidencia.length ? listaPresidencia.map(x => evtRenderCartaoFila(x, "PRESIDENCIA")).join("") : "<p class='subtitle'>Nenhum convidado esperando o Nada Consta da Presidência.</p>";
}

function evtRenderCartaoFila(c, orgao) {
  const etica = orgao === "ETICA";
  const id = Number(c.convidadoId);
  const e = c.evento || {};
  const dias = evtTextoDias(c.diasAteEvento);
  const outra = etica ? c.nadaConsta : c.etica;
  const [favId, contId, motivoId] = etica ? [`evtEtFav_${id}`, `evtEtDes_${id}`, `evtEtMotivo_${id}`] : [`evtNcCon_${id}`, `evtNcNeg_${id}`, `evtNcMotivo_${id}`];
  const nomeRadio = etica ? `evtEtDecisao_${id}` : `evtNcDecisao_${id}`;
  return `<div class="cal-cartao cartao-area-ebd evt-fila${c.urgente ? " evt-fila-urgente" : ""}">
    <div class="evt-fila-topo">${c.urgente ? `<span class="evt-urgente">🔴 URGENTE — ${escaparHtmlEbd(dias)}</span>` : `<span class="evt-prazo">🗓️ ${escaparHtmlEbd(dias)}</span>`}</div>
    <h5>${escaparHtmlEbd(c.nome)} <span class="cal-selo">${escaparHtmlEbd(c.rotuloTipo || c.tipo || "")}</span></h5>
    <dl class="cal-dl">
      ${cnlCampo("Ministério/igreja de origem", c.ministerioOrigem ? escaparHtmlEbd(c.ministerioOrigem) : "")}
      ${cnlCampo("Contato", c.contato ? escaparHtmlEbd(c.contato) : "")}
      ${cnlCampo("A liderança conhece a reputação?", c.reputacaoConhecida ? "Sim" : "<span class='psc-alerta'>Não — por isso a consulta</span>")}
      ${cnlCampo("Observação do organizador", c.observacaoOrganizador ? escaparHtmlEbd(c.observacaoOrganizador) : "")}
      ${cnlCampo("Registrado por", c.criadoPorNome ? `${escaparHtmlEbd(c.criadoPorNome)}${c.submetidoEm ? ` · enviado à análise em ${escaparHtmlEbd(calDataHora(c.submetidoEm))}` : ""}` : "")}
      ${cnlCampo(etica ? "Nada Consta da Presidência" : "Parecer do Conselho de Ética", outra ? `${evtSelo(EVT_DECISAO, outra.parecer || outra.decisao)} ${outra.porNome ? `por ${escaparHtmlEbd(outra.porNome)}` : ""}` : (etica ? (c.exigeNadaConsta ? "ainda não decidido" : "") : (c.exigeEtica ? "ainda não emitido" : "")))}
    </dl>
    <p style="margin:6px 0;"><strong>Evento:</strong> ${escaparHtmlEbd(e.titulo || "")} · ${escaparHtmlEbd(calPeriodo(e.dataInicio, e.dataFim))} · ${calSeloNivel(e.nivel, e.rotuloNivel)}${e.tipoNome ? ` · ${escaparHtmlEbd(e.tipoNome)}` : ""}${e.local ? ` · 📍 ${escaparHtmlEbd(e.local)}` : ""}</p>
    <div class="cal-form-inline">
      <strong>${etica ? "Parecer do Conselho de Ética" : "Nada Consta da Presidência"}</strong>
      <div>
        <label class="cal-check"><input type="radio" name="${nomeRadio}" id="${favId}" /> ${etica ? "Favorável" : "Conceder"}</label>
        <label class="cal-check"><input type="radio" name="${nomeRadio}" id="${contId}" /> ${etica ? "Desfavorável" : "Negar"}</label>
      </div>
      <label for="${motivoId}">Motivo (obrigatório, mínimo de 10 caracteres, se for contrário; até 500)</label>
      <textarea id="${motivoId}" rows="2" maxlength="500" style="width:100%;"></textarea>
      <div class="psc-acoes">
        <button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="${etica ? "evtDecidirEticaAcao" : "evtDecidirNadaConstaAcao"}" data-args-click="${argsAttr(id)}">${etica ? "⚖️ Registrar o parecer" : "🏛️ Registrar a decisão"}</button>
        <button type="button" class="btn-link" data-on-click="evtAbrirDossieAcao" data-args-click="${argsAttr(Number(e.eventoId), "G")}">🗂️ Abrir dossiê do evento</button>
      </div>
    </div>
  </div>`;
}

// Parecer/decisão: o motivo é obrigatório (10+) quando contrário; a mensagem espelha a do servidor.
async function evtDecidirFila(orgao, convidadoId) {
  if (evtAcaoEmCurso) return;
  const etica = orgao === "ETICA";
  const id = Number(convidadoId);
  const [favId, contId, motivoId] = etica ? [`evtEtFav_${id}`, `evtEtDes_${id}`, `evtEtMotivo_${id}`] : [`evtNcCon_${id}`, `evtNcNeg_${id}`, `evtNcMotivo_${id}`];
  const favoravel = evtMarcado(favId), contrario = evtMarcado(contId);
  const motivo = evtTexto(motivoId);
  if (!favoravel && !contrario) { mostrarToast(etica ? "Escolha o parecer: favorável ou desfavorável." : "Escolha a decisão: conceder ou negar o Nada Consta.", "erro"); return; }
  if (motivo.length > 500) { mostrarToast("O motivo aceita até 500 caracteres.", "erro"); return; }
  if (contrario && motivo.length < 10) { mostrarToast(`${etica ? "Parecer" : "Nada Consta"} contrário exige o motivo (mínimo de 10 caracteres): ele fica registrado e o organizador é informado.`, "erro"); return; }
  const lista = evtFila ? (etica ? evtFila.etica : evtFila.presidencia) || [] : [];
  const item = lista.find(x => Number(x.convidadoId) === id);
  const nome = item ? item.nome : `#${id}`;
  if (!confirm(`Registrar ${etica ? (favoravel ? "parecer FAVORÁVEL" : "parecer CONTRÁRIO") : (favoravel ? "o Nada Consta (CONCEDER)" : "a NEGATIVA do Nada Consta")} sobre "${nome}"? A decisão fica registrada e não pode ser desfeita.`)) return;
  const corpo = etica ? { convidadoId: id, parecer: favoravel ? "FAVORAVEL" : "DESFAVORAVEL" } : { convidadoId: id, decisao: favoravel ? "CONCEDIDO" : "NEGADO" };
  if (motivo) corpo.motivo = motivo;
  evtAcaoEmCurso = true;
  try {
    const data = await evtPostar(etica ? "convidados/parecer-etica" : "convidados/nada-consta", corpo);
    mostrarResultadoEvt(data, "evtResultadoFila");
    if (data.sucesso === false) return;   // recusa (inclusive a segregação de funções): mensagem do servidor, formulário intacto
    const texto = evtMensagemErro(data);
    await evtCarregarFilaAcao();          // refaz a fila (e a linha de resumo): devolve a mensagem do servidor na frente
    const aviso = evtEl("evtResultadoFila");
    if (aviso) aviso.textContent = `${texto} ${aviso.textContent}`.trim();
  } finally {
    evtAcaoEmCurso = false;
  }
}
function evtDecidirEticaAcao(convidadoId) { return evtDecidirFila("ETICA", convidadoId); }
function evtDecidirNadaConstaAcao(convidadoId) { return evtDecidirFila("PRESIDENCIA", convidadoId); }

// -- d) Caixas para conferir (Tesouraria Geral ou eventos_gestao) --
async function evtCarregarCaixasAcao() {
  const status = evtTexto("evtFiltroCaixa");
  const aviso = evtEl("evtResultadoCaixas"), tabela = evtEl("evtTabelaCaixas");
  if (aviso) aviso.textContent = "Carregando os caixas…";
  const data = await evtObter(`caixas${status ? `?status=${encodeURIComponent(status)}` : ""}`);
  if (data.sucesso === false) {
    evtCaixas = [];
    if (aviso) aviso.textContent = "";
    if (tabela) tabela.innerHTML = `<p class="subtitle">${escaparHtmlEbd(evtMensagemErro(data))}</p>`;
    return;
  }
  evtCaixas = Array.isArray(data.caixas) ? data.caixas : [];
  const atrasados = evtCaixas.filter(x => x.caixa && x.caixa.atrasado).length;
  if (aviso) aviso.textContent = evtCaixas.length ? `${evtCaixas.length} caixa(s)${atrasados ? ` — ${atrasados} fora do prazo` : ""}.` : "";
  if (!tabela) return;
  tabela.innerHTML = evtCaixas.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Evento</th><th>Situação do caixa</th><th>Entradas</th><th>Saídas</th><th>Saldo</th><th>Encerrou / conferiu</th><th></th></tr></thead><tbody>
      ${evtCaixas.map(x => {
    const e = x.evento || {}, c = x.caixa || {}, t = c.totais || {};
    const saldo = evtNumero(t.saldo);
    return `<tr>
        <td><strong>${escaparHtmlEbd(e.titulo)}</strong> ${evtSeloCongresso(e)}<br /><span class="psc-legenda">${escaparHtmlEbd(calPeriodo(e.dataInicio, e.dataFim))} · ${escaparHtmlEbd(calTextoAbrangencia(e))}</span></td>
        <td>${evtSelo(EVT_FASE_CAIXA, c.fase || c.status)}${c.prazoEncerramentoEm ? `<br /><span class="psc-legenda">prazo ${escaparHtmlEbd(calData(c.prazoEncerramentoEm))}${c.atrasado && c.diasAtraso ? ` — ${evtNumero(c.diasAtraso)} dia(s) de atraso` : ""}</span>` : ""}</td>
        <td>${escaparHtmlEbd(evtDinheiro(t.entradas))}</td><td>${escaparHtmlEbd(evtDinheiro(t.saidas))}</td>
        <td><strong class="${saldo < 0 ? "psc-alerta" : ""}">${escaparHtmlEbd(evtDinheiro(saldo))}</strong></td>
        <td>${c.encerradoPorNome ? `encerrou: ${escaparHtmlEbd(c.encerradoPorNome)}` : "—"}${c.conferidoPorNome ? `<br />conferiu: ${escaparHtmlEbd(c.conferidoPorNome)}` : ""}</td>
        <td><button type="button" class="btn-link" data-on-click="evtAbrirDossieAcao" data-args-click="${argsAttr(Number(e.eventoId), "G")}">🗂️ Abrir dossiê</button></td>
      </tr>`;
  }).join("")}</tbody></table>`
    : "<p class='subtitle'>Nenhum caixa com esse filtro.</p>";
}
// -- b) DOSSIÊ DO EVENTO: o mesmo componente no módulo (G), em Meu Painel (M), na fila e nos caixas --
async function evtAbrirDossieAcao(eventoId, ctxBruto, manterPosicao) {
  const id = Number(eventoId);
  if (!id) return;
  const ctx = evtContexto(ctxBruto);
  const container = evtEl(EVT_CTX[ctx].dossie);
  await evtGarantirCatalogos();
  const anterior = evtDossie[ctx];
  const mudou = !anterior || !anterior.evento || Number(anterior.evento.eventoId) !== id;
  const data = await evtObter(`evento?eventoId=${id}`);
  if (data.sucesso === false || !data.evento) {
    evtDossie[ctx] = null;
    if (container) container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(evtMensagemErro(data))}</p>`;
    if (!manterPosicao) evtRolarPara(EVT_CTX[ctx].dossie);
    return;
  }
  evtDossie[ctx] = data;
  if (mudou) {
    const msg = evtEl(EVT_CTX[ctx].mensagem);
    if (msg) { msg.textContent = ""; msg.className = "subtitle"; }
  }
  evtDestinos[ctx] = [];
  if (container) container.innerHTML = evtRenderDossie(data, ctx);
  evtInicializarDestinos(ctx);
  if (!manterPosicao) evtRolarPara(EVT_CTX[ctx].dossie);
}

// "Abrir dossiê do evento" na ficha do Calendário: com permissão de evento, no módulo; senão, em Meu Painel → Eventos.
async function evtAbrirDossieDoCalendarioAcao(eventoId) {
  const id = Number(eventoId);
  if (!id) return;
  if (evtPodeModulo()) {
    entrarModulo("eventos");
    await evtAbrirDossieAcao(id, "G");
  } else {
    sairDoModulo();
    mostrarSubAbaMeupainel("eventos");
    await evtAbrirDossieAcao(id, "M");
  }
}

function evtRenderDossie(data, ctx) {
  const e = data.evento || {}, a = data.acoes || {}, regras = data.regras || {};
  const cat = evtCatalogosOuVazio();
  const id = Number(e.eventoId);
  const papeis = (Array.isArray(data.meusPapeis) ? data.meusPapeis : []).map(p => evtRotuloDoCatalogo(cat.papeis, p));
  const link = evtLinkDoEvento(e.slugSite);
  const campos = [
    cnlCampo("Quando", escaparHtmlEbd(calPeriodo(e.dataInicio, e.dataFim, e.horaInicio))),
    cnlCampo("Local", e.local ? escaparHtmlEbd(e.local) : ""),
    cnlCampo("Tipo", escaparHtmlEbd(e.tipoNome || "")),
    cnlCampo("Abrangência", escaparHtmlEbd(calTextoAbrangencia(e))),
    cnlCampo("Situação no Calendário", calSeloStatus(e.status)),
    cnlCampo("Seus papéis neste evento", papeis.length ? escaparHtmlEbd(papeis.join(", ")) : "<span class='psc-legenda'>nenhum (você vê pela Secretaria, pelo Conselho de Ética ou pela Presidência)</span>"),
    cnlCampo("Página do evento no site", link
      ? `<a href="${urlSegura(link)}" target="_blank" rel="noopener noreferrer">🌐 abrir no site</a> <span class="psc-legenda">(inscrição, lista de espera, check-in e certificado ficam lá)</span>`
      : "<span class='psc-legenda'>este evento não tem página no site</span>")
  ].join("");
  return `<div class="cal-cartao cartao-area-ebd evt-dossie${e.congresso ? " evt-congresso" : ""}">
    <h4>${escaparHtmlEbd(e.titulo)} ${evtSeloCongresso(e)}</h4>
    <p>${calSeloNivel(e.nivel, e.rotuloNivel)} ${calSeloStatus(e.status)} <span class="psc-legenda">evento nº ${id}</span></p>
    <dl class="cal-dl">${campos}</dl>
    ${evtRenderOrganizadores(data, ctx)}
    ${evtRenderConvidados(data, ctx)}
    ${evtRenderCaixa(data, ctx)}
    <div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="evtAbrirDossieAcao" data-args-click="${argsAttr(id, String(ctx), true)}">🔄 Atualizar o dossiê</button></div>
  </div>`;
}

// Executa uma ação do dossiê: confirma, grava e recarrega. Recusa de regra (422): mensagem do servidor e formulário intacto.
async function evtExecutarAcao(ctxBruto, rota, corpo, confirmacao) {
  const ctx = evtContexto(ctxBruto);
  if (!evtDossie[ctx] || evtAcaoEmCurso) return false;
  if (confirmacao && !confirm(confirmacao)) return false;
  evtAcaoEmCurso = true;
  try {
    const data = await evtPostar(rota, corpo);
    mostrarResultadoEvt(data, EVT_CTX[ctx].mensagem);
    if (data.sucesso === false) return false;
    await evtAposAcao(ctx);
    return true;
  } finally {
    evtAcaoEmCurso = false;
  }
}
async function evtAposAcao(ctx) {
  const d = evtDossie[ctx];
  const id = d && d.evento ? Number(d.evento.eventoId) : 0;
  if (id) await evtAbrirDossieAcao(id, ctx, true);
  if (ctx === "G") {
    if (evtPodeGestao() && evtPainel) evtCarregarPainelAcao();
    if (evtSecaoAtual === "caixas" && evtPodeCaixas()) evtCarregarCaixasAcao();
  } else {
    await evtCarregarMeusEventosAcao();
  }
}
function evtIdDoEvento(ctx) {
  const d = evtDossie[ctx];
  return d && d.evento ? Number(d.evento.eventoId) : 0;
}

// -- organizadores --
function evtRenderOrganizadores(data, ctx) {
  const a = data.acoes || {};
  const cat = evtCatalogosOuVazio();
  const orgs = Array.isArray(data.organizadores) ? data.organizadores : [];
  const linhas = orgs.map(o => {
    const oid = Number(o.organizadorId);
    return `<tr>
      <td><strong>${escaparHtmlEbd(o.nome)}</strong></td><td>${Number(o.membroId)}</td>
      <td>${escaparHtmlEbd(o.rotuloPapel || evtRotuloDoCatalogo(cat.papeis, o.papel))}</td>
      <td>${o.designadoEm ? escaparHtmlEbd(calData(o.designadoEm)) : "—"}</td>
      <td>${a.designarOrganizador ? `<button type="button" class="btn-link btn-link-perigo" data-on-click="evtAbrirEncerrarOrganizadorAcao" data-args-click="${argsAttr(oid, String(ctx))}">Encerrar…</button><div id="evtOrgEncForm${ctx}_${oid}"></div>` : ""}</td>
    </tr>`;
  }).join("");
  return `<h5>👥 Organizadores</h5>
    <p class="psc-legenda" style="margin-top:0;">Quem propôs o evento no Calendário é o responsável implícito. <strong>Responsável</strong>: tudo; <strong>Organizador</strong>: convidados; <strong>Tesoureiro</strong>: caixa.</p>
    ${orgs.length
    ? `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Matrícula</th><th>Papel</th><th>Designado em</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
    : "<p class='subtitle'>Nenhum organizador designado (além de quem propôs o evento).</p>"}
    ${a.designarOrganizador ? `<div class="barra-lista">
      <input type="number" id="evtOrgMembro${ctx}" min="1" placeholder="Matrícula" style="max-width:130px;min-width:100px;" />
      <select id="evtOrgPapel${ctx}">${evtOpcoesHtml(cat.papeis, p => p.codigo, p => p.rotulo)}</select>
      <button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="evtDesignarOrganizadorAcao" data-args-click="${argsAttr(String(ctx))}">➕ Designar</button>
    </div>` : ""}`;
}
async function evtDesignarOrganizadorAcao(ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  const membroId = numeroDoCampo(`evtOrgMembro${ctx}`), papel = evtTexto(`evtOrgPapel${ctx}`);
  if (!Number.isInteger(membroId) || membroId <= 0) { mostrarToast("Informe a matrícula de quem vai organizar.", "erro"); return; }
  if (!papel) { mostrarToast("Escolha o papel (Responsável, Organizador ou Tesoureiro).", "erro"); return; }
  await evtExecutarAcao(ctx, "organizadores/designar", { eventoId: evtIdDoEvento(ctx), membroId, papel });
}
function evtAbrirEncerrarOrganizadorAcao(organizadorId, ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  const oid = Number(organizadorId);
  const area = evtEl(`evtOrgEncForm${ctx}_${oid}`);
  if (!area) return;
  area.innerHTML = `<div class="cal-form-inline">
    <label for="evtOrgEncMotivo${ctx}_${oid}">Motivo do encerramento (5 a 200 caracteres)</label>
    <textarea id="evtOrgEncMotivo${ctx}_${oid}" rows="2" maxlength="200" style="width:100%;"></textarea>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar btn-perigo" style="width:auto;margin:0;" data-on-click="evtEncerrarOrganizadorAcao" data-args-click="${argsAttr(oid, String(ctx))}">Encerrar a designação</button>
      <button type="button" class="btn-link" data-on-click="evtFecharEncerrarOrganizadorAcao" data-args-click="${argsAttr(oid, String(ctx))}">cancelar</button>
    </div>
  </div>`;
}
function evtFecharEncerrarOrganizadorAcao(organizadorId, ctxBruto) {
  const area = evtEl(`evtOrgEncForm${evtContexto(ctxBruto)}_${Number(organizadorId)}`);
  if (area) area.innerHTML = "";
}
async function evtEncerrarOrganizadorAcao(organizadorId, ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  const oid = Number(organizadorId);
  const motivo = evtTexto(`evtOrgEncMotivo${ctx}_${oid}`);
  if (motivo.length < 5 || motivo.length > 200) { mostrarToast("Informe o motivo do encerramento (de 5 a 200 caracteres).", "erro"); return; }
  await evtExecutarAcao(ctx, "organizadores/encerrar", { organizadorId: oid, motivo }, "Encerrar esta designação?");
}

// -- convidados (Protocolo de Convidados, Art. 111 e 111-A) --
function evtRenderRegrasConvidado(regras) {
  const dias = evtNumero(regras.antecedenciaEticaDias) || 10;
  return `<div class="evt-regras"><strong>Como funciona (Regimento Art. 111 e 111-A):</strong>
    <ul>
      <li>Se a liderança <strong>conhece a reputação</strong> do convidado, não há consulta ao Conselho de Ética.</li>
      <li>Se <strong>não conhece</strong>, é preciso consultar o <strong>Conselho de Ética</strong> com <strong>${dias} dias</strong> de antecedência${regras.prazoParecerEtica ? ` — neste evento, o parecer precisa sair até <strong>${escaparHtmlEbd(calData(regras.prazoParecerEtica))}</strong>` : ""}.</li>
      ${regras.exigeNadaConsta ? "<li>Este é um <strong>evento geral</strong>: todo convidado precisa também do <strong>Nada Consta da Presidência</strong>.</li>" : ""}
      <li>Só <strong>depois dos pareceres exigidos</strong> o convite é <strong>oficializado</strong> e, se o convidado autorizou, o nome é <strong>divulgado</strong> no site.</li>
    </ul></div>`;
}

function evtRenderConvidados(data, ctx) {
  const a = data.acoes || {}, regras = data.regras || {};
  const cat = evtCatalogosOuVazio();
  const lista = Array.isArray(data.convidados) ? data.convidados : [];
  const formulario = a.registrarConvidado ? `<details class="evt-form-detalhes" style="margin:10px 0;"><summary><strong>➕ Registrar convidado</strong></summary>
      <div class="cal-form">
        <div class="cal-form-grade">
          <div class="input-group"><label for="evtConvNome${ctx}">Nome (3 a 150 caracteres)</label><input type="text" id="evtConvNome${ctx}" maxlength="150" /></div>
          <div class="input-group"><label for="evtConvTipo${ctx}">Tipo</label><select id="evtConvTipo${ctx}">${evtOpcoesHtml(cat.tiposConvidado, t => t.codigo, t => t.rotulo)}</select></div>
          <div class="input-group"><label for="evtConvMin${ctx}">Ministério ou igreja de origem</label><input type="text" id="evtConvMin${ctx}" maxlength="150" /></div>
          <div class="input-group"><label for="evtConvContato${ctx}">Contato (telefone ou e-mail)</label><input type="text" id="evtConvContato${ctx}" maxlength="150" /></div>
        </div>
        <div class="input-group">
          <label for="evtConvObs${ctx}">Observação (até 500 caracteres)</label>
          <textarea id="evtConvObs${ctx}" rows="2" maxlength="500" style="width:100%;"></textarea>
        </div>
        <fieldset class="evt-pergunta">
          <legend><strong>A liderança conhece a reputação deste convidado?</strong> <span class="evt-obrigatorio">(obrigatório)</span></legend>
          <label class="cal-check"><input type="radio" name="evtConvRep${ctx}" id="evtConvRepSim${ctx}" /> Sim, conhece</label>
          <label class="cal-check"><input type="radio" name="evtConvRep${ctx}" id="evtConvRepNao${ctx}" /> Não conhece</label>
          <p class="psc-legenda" style="margin:4px 0 0;">Se <strong>não</strong> conhece, informe a igreja ou ministério de origem: o Conselho de Ética precisa verificar.</p>
        </fieldset>
        <label class="cal-check" style="margin-top:8px;"><input type="checkbox" id="evtConvDiv${ctx}" /> O convidado autorizou divulgar o nome</label>
        <div class="psc-acoes">
          <button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="evtRegistrarConvidadoAcao" data-args-click="${argsAttr(String(ctx))}">➕ Registrar convidado</button>
        </div>
      </div></details>` : "";
  return `<h5>🎤 Convidados externos</h5>
    ${evtRenderRegrasConvidado(regras)}
    ${lista.length ? lista.map(c => evtRenderConvidado(c, a, ctx)).join("") : "<p class='subtitle'>Nenhum convidado registrado neste evento.</p>"}
    ${formulario}
    ${!a.registrarConvidado ? "<p class='psc-legenda'>Registrar convidados é da organização do evento (ou da Secretaria).</p>" : ""}`;
}

function evtRenderConvidado(c, a, ctx) {
  const id = Number(c.convidadoId);
  const pend = Array.isArray(c.pendencias) ? c.pendencias : [];
  const podeAgir = a.registrarConvidado === true;
  const exige = [c.exigeEtica ? "parecer do Conselho de Ética" : "", c.exigeNadaConsta ? "Nada Consta da Presidência" : ""].filter(Boolean);
  const parecer = (rotulo, p) => (p ? `<li>${rotulo}: ${evtSelo(EVT_DECISAO, p.parecer || p.decisao)} ${p.porNome ? `por ${escaparHtmlEbd(p.porNome)}` : ""}${p.em ? ` em ${escaparHtmlEbd(calDataHora(p.em))}` : ""}${p.motivo ? ` — ${escaparHtmlEbd(p.motivo)}` : ""}</li>` : "");
  const pareceres = [parecer("Conselho de Ética", c.etica), parecer("Presidência (Nada Consta)", c.nadaConsta)].filter(Boolean).join("");
  const botoes = [];
  if (podeAgir && c.status === "RASCUNHO") {
    botoes.push(`<button type="button" class="btn-link" data-on-click="evtAbrirEdicaoConvidadoAcao" data-args-click="${argsAttr(id, String(ctx))}">✏️ Editar</button>`);
    botoes.push(`<button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="evtSubmeterConvidadoAcao" data-args-click="${argsAttr(id, String(ctx))}">📨 Enviar à análise</button>`);
  }
  if (podeAgir && c.podeOficializar) botoes.push(`<button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="evtOficializarConvidadoAcao" data-args-click="${argsAttr(id, String(ctx))}">📣 Oficializar convite</button>`);
  if (podeAgir && (c.status === "RASCUNHO" || c.status === "EM_ANALISE" || c.status === "AUTORIZADO")) {
    botoes.push(`<button type="button" class="btn-link btn-link-perigo" data-on-click="evtAbrirCancelarConvidadoAcao" data-args-click="${argsAttr(id, String(ctx))}">❌ Cancelar…</button>`);
  }
  const [rotuloStatus, classeStatus] = evtDe(EVT_STATUS_CONVIDADO, c.status, null) || [escaparHtmlEbd(c.status || "—"), "cal-st-cancelado"];
  return `<div class="cal-cartao cartao-area-ebd evt-convidado evt-conv-${escaparHtmlEbd(String(c.status || "").toLowerCase().replace(/[^a-z_]/g, ""))}">
    <h5>${escaparHtmlEbd(c.nome)} <span class="cal-selo">${escaparHtmlEbd(c.rotuloTipo || c.tipo || "")}</span>
      <span class="cal-selo ${classeStatus}" title="${escaparHtmlEbd(c.rotuloStatus || "")}">${rotuloStatus}</span>
      ${c.divulgavel ? `<span class="cal-selo cal-st-homologado" title="Autorizado, oficializado e com o nome liberado pelo convidado">🌐 divulgável no site</span>` : ""}</h5>
    <dl class="cal-dl">
      ${cnlCampo("Ministério/igreja de origem", c.ministerioOrigem ? escaparHtmlEbd(c.ministerioOrigem) : "")}
      ${cnlCampo("Contato", Object.prototype.hasOwnProperty.call(c, "contato") && c.contato ? escaparHtmlEbd(c.contato) : "")}
      ${cnlCampo("A liderança conhece a reputação?", c.reputacaoConhecida ? "Sim" : "<span class='psc-alerta'>Não</span>")}
      ${cnlCampo("Exige", exige.length ? escaparHtmlEbd(exige.join(" e ")) : (c.status === "RASCUNHO" ? "<span class='psc-legenda'>definido ao enviar à análise</span>" : "nenhum parecer"))}
      ${cnlCampo("Observação do organizador", c.observacaoOrganizador ? escaparHtmlEbd(c.observacaoOrganizador) : "")}
      ${cnlCampo("Divulgação do nome", c.divulgacaoAutorizada ? "autorizada pelo convidado" : "não autorizada")}
      ${cnlCampo("Registrado por", c.criadoPorNome ? `${escaparHtmlEbd(c.criadoPorNome)}${c.criadoEm ? ` em ${escaparHtmlEbd(calDataHora(c.criadoEm))}` : ""}` : "")}
    </dl>
    ${pend.length ? `<ul class="evt-atencao">${pend.map(t => `<li>⏳ ${escaparHtmlEbd(t)}</li>`).join("")}</ul>` : ""}
    ${pareceres ? `<ul class="cal-lista-simples">${pareceres}</ul>` : ""}
    ${c.status === "AUTORIZADO" && !c.oficializadoEm ? "<p class='psc-aviso'>Autorizado: falta oficializar o convite. Só depois o nome pode ir ao site.</p>" : ""}
    ${c.oficializadoEm && c.status !== "CANCELADO" ? `<p>📣 Convite oficializado em ${escaparHtmlEbd(calDataHora(c.oficializadoEm))}${c.divulgavel ? " — o nome pode aparecer no site." : " — o convidado não autorizou divulgar o nome, então ele não aparece no site."}</p>` : ""}
    ${c.status === "CANCELADO" ? `<p class="psc-legenda">Cancelado${c.canceladoEm ? ` em ${escaparHtmlEbd(calDataHora(c.canceladoEm))}` : ""}${c.motivoCancelamento ? ` — ${escaparHtmlEbd(c.motivoCancelamento)}` : ""}</p>` : ""}
    ${botoes.length ? `<div class="psc-acoes">${botoes.join("")}</div>` : ""}
    <div id="evtConvForm${ctx}_${id}"></div>
  </div>`;
}

function evtCorpoConvidado(sufixo, estrito) {
  const nome = evtTexto(`evtConvNome${sufixo}`);
  if (nome.length < 3 || nome.length > 150) return { problema: "O nome do convidado deve ter de 3 a 150 caracteres." };
  const sim = evtMarcado(`evtConvRepSim${sufixo}`), nao = evtMarcado(`evtConvRepNao${sufixo}`);
  if (!sim && !nao) return { problema: "Informe se a reputação do convidado é CONHECIDA da liderança (sim ou não): é o que decide se há consulta ao Conselho de Ética (Art. 111)." };
  const corpo = { nome, tipo: evtTexto(`evtConvTipo${sufixo}`) || "PRELETOR", reputacaoConhecida: sim, divulgacaoAutorizada: evtMarcado(`evtConvDiv${sufixo}`) };
  const ministerio = evtTexto(`evtConvMin${sufixo}`), contato = evtTexto(`evtConvContato${sufixo}`), obs = evtTexto(`evtConvObs${sufixo}`);
  if (ministerio.length > 150) return { problema: "O ministério ou igreja de origem aceita até 150 caracteres." };
  if (contato.length > 150) return { problema: "O contato aceita até 150 caracteres." };
  if (obs.length > 500) return { problema: "A observação aceita até 500 caracteres." };
  if (ministerio || estrito) corpo.ministerioOrigem = ministerio;
  if (contato || estrito) corpo.contato = contato;
  if (obs || estrito) corpo.observacaoOrganizador = obs;
  return { corpo };
}
async function evtRegistrarConvidadoAcao(ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  const { corpo, problema } = evtCorpoConvidado(ctx, false);
  if (problema) { mostrarToast(problema, "erro"); return; }
  await evtExecutarAcao(ctx, "convidados", { eventoId: evtIdDoEvento(ctx), ...corpo });
}

function evtConvidadoPorId(ctx, convidadoId) {
  const d = evtDossie[ctx];
  return d && Array.isArray(d.convidados) ? d.convidados.find(x => Number(x.convidadoId) === Number(convidadoId)) : null;
}
// Editar: só rascunho. O formulário abre dentro do cartão, preenchido com o que o servidor devolveu.
function evtAbrirEdicaoConvidadoAcao(convidadoId, ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  const id = Number(convidadoId);
  const c = evtConvidadoPorId(ctx, id);
  const area = evtEl(`evtConvForm${ctx}_${id}`);
  if (!c || !area) return;
  const cat = evtCatalogosOuVazio();
  const sufixo = `${ctx}_${id}`;
  area.innerHTML = `<div class="cal-form-inline">
    <p class="psc-legenda">Só se edita convidado em rascunho. Depois de enviado à análise, cancele e registre de novo.</p>
    <label for="evtConvNome${sufixo}">Nome (3 a 150 caracteres)</label>
    <input type="text" id="evtConvNome${sufixo}" maxlength="150" value="${escaparHtmlEbd(c.nome)}" />
    <label for="evtConvTipo${sufixo}">Tipo</label>
    <select id="evtConvTipo${sufixo}">${evtOpcoesHtml(cat.tiposConvidado, t => t.codigo, t => t.rotulo)}</select>
    <label for="evtConvMin${sufixo}">Ministério ou igreja de origem</label>
    <input type="text" id="evtConvMin${sufixo}" maxlength="150" value="${escaparHtmlEbd(c.ministerioOrigem || "")}" />
    <label for="evtConvContato${sufixo}">Contato</label>
    <input type="text" id="evtConvContato${sufixo}" maxlength="150" value="${escaparHtmlEbd(c.contato || "")}" />
    <label for="evtConvObs${sufixo}">Observação (até 500 caracteres)</label>
    <textarea id="evtConvObs${sufixo}" rows="2" maxlength="500" style="width:100%;">${escaparHtmlEbd(c.observacaoOrganizador || "")}</textarea>
    <div><strong>A liderança conhece a reputação deste convidado?</strong>
      <label class="cal-check"><input type="radio" name="evtConvRep${sufixo}" id="evtConvRepSim${sufixo}"${c.reputacaoConhecida ? " checked" : ""} /> Sim</label>
      <label class="cal-check"><input type="radio" name="evtConvRep${sufixo}" id="evtConvRepNao${sufixo}"${c.reputacaoConhecida ? "" : " checked"} /> Não</label></div>
    <label class="cal-check"><input type="checkbox" id="evtConvDiv${sufixo}"${c.divulgacaoAutorizada ? " checked" : ""} /> O convidado autorizou divulgar o nome</label>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="evtSalvarConvidadoAcao" data-args-click="${argsAttr(id, String(ctx))}">💾 Salvar</button>
      <button type="button" class="btn-link" data-on-click="evtFecharFormConvidadoAcao" data-args-click="${argsAttr(id, String(ctx))}">cancelar</button>
    </div>
  </div>`;
  const tipo = evtEl(`evtConvTipo${sufixo}`);
  if (tipo) tipo.value = c.tipo;
}
function evtFecharFormConvidadoAcao(convidadoId, ctxBruto) {
  const area = evtEl(`evtConvForm${evtContexto(ctxBruto)}_${Number(convidadoId)}`);
  if (area) area.innerHTML = "";
}
async function evtSalvarConvidadoAcao(convidadoId, ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  const id = Number(convidadoId);
  const c = evtConvidadoPorId(ctx, id);
  const { corpo, problema } = evtCorpoConvidado(`${ctx}_${id}`, true);
  if (problema) { mostrarToast(problema, "erro"); return; }
  // sem o contato na resposta (quem não o vê), não o reenvia: o servidor mantém o que tem
  if (c && !Object.prototype.hasOwnProperty.call(c, "contato")) delete corpo.contato;
  await evtExecutarAcao(ctx, "convidados/atualizar", { convidadoId: id, ...corpo });
}
async function evtSubmeterConvidadoAcao(convidadoId, ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  const id = Number(convidadoId);
  const c = evtConvidadoPorId(ctx, id);
  await evtExecutarAcao(ctx, "convidados/submeter", { convidadoId: id }, `Enviar "${c ? c.nome : ""}" à análise? Depois de enviado, o convidado não pode mais ser editado.`);
}
async function evtOficializarConvidadoAcao(convidadoId, ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  const id = Number(convidadoId);
  const c = evtConvidadoPorId(ctx, id);
  await evtExecutarAcao(ctx, "convidados/oficializar", { convidadoId: id }, `Oficializar o convite de "${c ? c.nome : ""}"? ${c && c.divulgacaoAutorizada ? "O nome já pode aparecer no site." : "O convidado não autorizou divulgar o nome: ele não aparece no site."}`);
}
function evtAbrirCancelarConvidadoAcao(convidadoId, ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  const id = Number(convidadoId);
  const area = evtEl(`evtConvForm${ctx}_${id}`);
  if (!area) return;
  area.innerHTML = `<div class="cal-form-inline">
    <label for="evtConvCancMotivo${ctx}_${id}">Motivo do cancelamento (5 a 300 caracteres)</label>
    <textarea id="evtConvCancMotivo${ctx}_${id}" rows="2" maxlength="300" style="width:100%;"></textarea>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar btn-perigo" style="width:auto;margin:0;" data-on-click="evtCancelarConvidadoAcao" data-args-click="${argsAttr(id, String(ctx))}">❌ Cancelar o convite</button>
      <button type="button" class="btn-link" data-on-click="evtFecharFormConvidadoAcao" data-args-click="${argsAttr(id, String(ctx))}">voltar</button>
    </div>
  </div>`;
}
async function evtCancelarConvidadoAcao(convidadoId, ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  const id = Number(convidadoId);
  const motivo = evtTexto(`evtConvCancMotivo${ctx}_${id}`);
  if (motivo.length < 5 || motivo.length > 300) { mostrarToast("Informe o motivo do cancelamento (de 5 a 300 caracteres).", "erro"); return; }
  const c = evtConvidadoPorId(ctx, id);
  await evtExecutarAcao(ctx, "convidados/cancelar", { convidadoId: id, motivo }, `Cancelar o convite de "${c ? c.nome : ""}"?`);
}
// -- Caixa Flutuante de Eventos (Regimento Art. 53-E, §2º e §3º) --
function evtRenderCaixa(data, ctx) {
  const c = data.caixa, a = data.acoes || {}, regras = data.regras || {};
  let corpo;
  if (!c) {
    if (regras.caixaDisponivel === false) corpo = `<p class="subtitle">${escaparHtmlEbd(regras.motivoSemCaixa || "Este evento não tem Caixa Flutuante.")}</p>`;
    else if (a.abrirCaixa) {
      corpo = `<div class="cal-form-inline">
        <label class="cal-check cnl-declaracao"><input type="checkbox" id="evtCaixaDecl${ctx}" /> Declaro que nenhuma conta bancária foi aberta para este evento e que o dinheiro não passará por conta paralela em nome da Igreja ou de associação (Art. 53-E, §3º)</label>
        <div class="psc-acoes"><button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="evtAbrirCaixaAcao" data-args-click="${argsAttr(String(ctx))}">🔓 Abrir Caixa Flutuante</button></div>
      </div>`;
    } else corpo = "<p class='subtitle'>O caixa deste evento ainda não foi aberto. Quem abre é o responsável pelo evento ou o tesoureiro designado.</p>";
  } else {
    corpo = evtRenderCaixaAberto(c, a, ctx);
  }
  return `<h5>💰 Caixa Flutuante do evento</h5>
    <p class="psc-legenda" style="margin-top:0;">É o regime do evento de Área, Região ou Geral: a arrecadação é liquidada no custeio do próprio evento e o superávit é recolhido à Sede ou convertido em benfeitoria.
      Conta bancária paralela para o evento é infração gravíssima (Art. 53-E, §3º).</p>
    ${corpo}`;
}

function evtRenderCaixaAberto(c, a, ctx) {
  const cat = evtCatalogosOuVazio();
  const t = c.totais || {};
  const saldo = evtNumero(t.saldo);
  const lancamentos = Array.isArray(c.lancamentos) ? c.lancamentos : [];
  const destinos = Array.isArray(c.destinos) ? c.destinos : [];
  const linhas = lancamentos.map(l => {
    const lid = Number(l.lancamentoId);
    const entrada = l.tipo === "ENTRADA";
    return `<tr class="${l.cancelado ? "evt-cancelado" : ""}">
      <td>${escaparHtmlEbd(calData(l.dataLancamento))}</td>
      <td>${entrada ? "Entrada" : "Saída"}</td>
      <td>${escaparHtmlEbd(l.rotuloCategoria || l.categoria)}</td>
      <td>${escaparHtmlEbd(l.descricao)}</td>
      <td>${l.comprovante ? escaparHtmlEbd(l.comprovante) : "—"}</td>
      <td class="evt-valor">${entrada ? "+" : "−"} ${escaparHtmlEbd(evtDinheiro(l.valor))}</td>
      <td>${l.registradoPorNome ? escaparHtmlEbd(l.registradoPorNome) : "—"}</td>
      <td>${a.lancarNoCaixa && !l.cancelado ? `<button type="button" class="btn-link btn-link-perigo" data-on-click="evtAbrirCancelarLancamentoAcao" data-args-click="${argsAttr(lid, String(ctx))}">Cancelar…</button><div id="evtCancForm${ctx}_${lid}"></div>` : ""}</td>
    </tr>${l.cancelado ? `<tr class="evt-cancelado-nota"><td colspan="8"><span class="psc-alerta">Lançamento cancelado${l.canceladoEm ? ` em ${escaparHtmlEbd(calDataHora(l.canceladoEm))}` : ""}${l.motivoCancelamento ? ` — ${escaparHtmlEbd(l.motivoCancelamento)}` : ""}</span></td></tr>` : ""}`;
  }).join("");
  const atrasoAviso = c.status === "ABERTO" && c.atrasado
    ? `<p class="cnl-aviso-vencida"><strong>Fora do prazo:</strong> o prazo de encerramento (${escaparHtmlEbd(calData(c.prazoEncerramentoEm))}) passou há ${evtNumero(c.diasAtraso)} dia(s). Encerre o caixa e destine o superávit.</p>` : "";
  const devolvido = c.devolvidoMotivo
    ? `<p class="psc-aviso"><strong>Devolvido para correção</strong>${c.devolvidoPorNome ? ` por ${escaparHtmlEbd(c.devolvidoPorNome)}` : ""}${c.devolvidoEm ? ` em ${escaparHtmlEbd(calDataHora(c.devolvidoEm))}` : ""}: ${escaparHtmlEbd(c.devolvidoMotivo)}</p>` : "";
  const encerramento = c.status !== "ABERTO" ? `<div class="evt-encerramento">
      <p><strong>Encerrado</strong>${c.encerradoEm ? ` em ${escaparHtmlEbd(calDataHora(c.encerradoEm))}` : ""}${c.encerradoPorNome ? ` por ${escaparHtmlEbd(c.encerradoPorNome)}` : ""}.</p>
      ${c.justificativaDeficit ? `<p><strong>Justificativa do déficit:</strong> ${escaparHtmlEbd(c.justificativaDeficit)}</p>` : ""}
      ${destinos.length ? `<h6 class="cal-sub-titulo">Destino do superávit</h6><div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Destino</th><th>Valor</th><th>Data</th><th>Comprovante</th><th>Descrição</th></tr></thead><tbody>
        ${destinos.map(d => `<tr><td>${escaparHtmlEbd(d.rotuloTipo || evtRotuloDoCatalogo(cat.destinosSuperavit, d.tipo))}</td><td>${escaparHtmlEbd(evtDinheiro(d.valor))}</td><td>${escaparHtmlEbd(calData(d.dataDestino))}</td><td>${escaparHtmlEbd(d.comprovante || "—")}</td><td>${d.descricao ? escaparHtmlEbd(d.descricao) : "—"}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${c.status === "CONFERIDO" ? `<p>✅ <strong>Conferido</strong>${c.conferidoEm ? ` em ${escaparHtmlEbd(calDataHora(c.conferidoEm))}` : ""}${c.conferidoPorNome ? ` por ${escaparHtmlEbd(c.conferidoPorNome)}` : ""}${c.conferenciaObs ? ` — ${escaparHtmlEbd(c.conferenciaObs)}` : ""}.</p>` : ""}
    </div>` : "";
  return `<p>${evtSeloCaixa(c)} <span class="psc-legenda">aberto${c.abertoPorNome ? ` por ${escaparHtmlEbd(c.abertoPorNome)}` : ""}${c.abertoEm ? ` em ${escaparHtmlEbd(calDataHora(c.abertoEm))}` : ""}${evtNumero(c.ciclo) > 1 ? ` · ciclo ${evtNumero(c.ciclo)}` : ""}${c.declaracaoSemContaEm ? " · declarou que não há conta bancária paralela" : ""}</span></p>
    ${atrasoAviso}${devolvido}
    <div class="cnl-contadores">
      <div class="cnl-contador cnl-contador-ok"><span class="cnl-contador-valor">${escaparHtmlEbd(evtDinheiro(t.entradas))}</span><span class="cnl-contador-rotulo">Entradas</span></div>
      <div class="cnl-contador"><span class="cnl-contador-valor">${escaparHtmlEbd(evtDinheiro(t.saidas))}</span><span class="cnl-contador-rotulo">Saídas</span></div>
      <div class="cnl-contador${saldo < 0 ? " cnl-contador-erro" : saldo > 0 ? " cnl-contador-alerta" : ""}"><span class="cnl-contador-valor">${escaparHtmlEbd(evtDinheiro(saldo))}</span><span class="cnl-contador-rotulo">Saldo</span></div>
    </div>
    ${lancamentos.length ? `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Comprovante</th><th>Valor</th><th>Registrado por</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>` : "<p class='subtitle'>Nenhum lançamento ainda.</p>"}
    ${encerramento}
    ${a.lancarNoCaixa ? evtRenderFormLancamento(ctx) : ""}
    ${a.encerrarCaixa ? evtRenderFormEncerrar(c, ctx) : ""}
    ${c.status === "ENCERRADO" ? evtRenderFormTesouraria(a, ctx) : ""}`;
}

async function evtAbrirCaixaAcao(ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  if (!evtMarcado(`evtCaixaDecl${ctx}`)) {
    mostrarToast("Confirme a declaração: nenhuma conta bancária foi aberta para este evento e o dinheiro não passará por conta paralela em nome da Igreja ou de associação (Art. 53-E, §3º).", "erro");
    return;
  }
  await evtExecutarAcao(ctx, "caixa/abrir", { eventoId: evtIdDoEvento(ctx), declaracaoSemContaParalela: true });
}

// -- lançamentos --
function evtRenderFormLancamento(ctx) {
  const cat = evtCatalogosOuVazio();
  return `<details class="evt-form-detalhes" style="margin:10px 0;"><summary><strong>➕ Lançar entrada ou saída</strong></summary>
    <div class="cal-form">
      <div class="cal-form-grade">
        <div class="input-group"><label for="evtLancTipo${ctx}">Tipo</label>
          <select id="evtLancTipo${ctx}" data-on-change="evtLancTipoMudouAcao" data-args-change="${argsAttr(String(ctx))}"><option value="ENTRADA">Entrada</option><option value="SAIDA">Saída</option></select></div>
        <div class="input-group"><label for="evtLancCategoria${ctx}">Categoria</label>
          <select id="evtLancCategoria${ctx}">${evtOpcoesHtml(cat.categoriasEntrada, c => c.codigo, c => c.rotulo)}</select></div>
        <div class="input-group"><label for="evtLancValor${ctx}">Valor (R$)</label><input type="text" id="evtLancValor${ctx}" inputmode="decimal" placeholder="Ex.: 1.234,56" /></div>
        <div class="input-group"><label for="evtLancData${ctx}">Data</label><input type="date" id="evtLancData${ctx}" value="${escaparHtmlEbd(calHojeBrasilia())}" max="${escaparHtmlEbd(calHojeBrasilia())}" /></div>
      </div>
      <div class="input-group"><label for="evtLancDesc${ctx}">Descrição (3 a 300 caracteres)</label><input type="text" id="evtLancDesc${ctx}" maxlength="300" /></div>
      <div class="input-group"><label for="evtLancComp${ctx}" id="evtLancCompRotulo${ctx}">Comprovante (número da nota ou do recibo, ou link) — opcional na entrada</label>
        <input type="text" id="evtLancComp${ctx}" maxlength="200" /></div>
      <div class="psc-acoes"><button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="evtLancarAcao" data-args-click="${argsAttr(String(ctx))}">💾 Lançar</button></div>
    </div></details>`;
}
function evtLancTipoMudouAcao(ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  const saida = evtTexto(`evtLancTipo${ctx}`) === "SAIDA";
  const cat = evtCatalogosOuVazio();
  const lista = saida ? cat.categoriasSaida : cat.categoriasEntrada;
  const sel = evtEl(`evtLancCategoria${ctx}`);
  if (sel) { sel.innerHTML = evtOpcoesHtml(lista, c => c.codigo, c => c.rotulo); }
  const rotulo = evtEl(`evtLancCompRotulo${ctx}`);
  if (rotulo) rotulo.innerHTML = saida
    ? `Comprovante (número da nota ou do recibo, ou link) <span class="evt-obrigatorio">* obrigatório na saída</span>`
    : "Comprovante (número da nota ou do recibo, ou link) — opcional na entrada";
}
async function evtLancarAcao(ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  const tipo = evtTexto(`evtLancTipo${ctx}`), categoria = evtTexto(`evtLancCategoria${ctx}`);
  const valor = evtAnalisarValor(evtTexto(`evtLancValor${ctx}`));
  const data = evtTexto(`evtLancData${ctx}`), descricao = evtTexto(`evtLancDesc${ctx}`), comprovante = evtTexto(`evtLancComp${ctx}`);
  if (tipo !== "ENTRADA" && tipo !== "SAIDA") { mostrarToast("Informe se é entrada ou saída.", "erro"); return; }
  if (!categoria) { mostrarToast("Escolha a categoria do lançamento.", "erro"); return; }
  if (!valor.ok) { mostrarToast(valor.erro, "erro"); return; }
  if (data && data > calHojeBrasilia()) { mostrarToast("O lançamento não pode estar no futuro.", "erro"); return; }
  if (descricao.length < 3 || descricao.length > 300) { mostrarToast("Descreva o lançamento (3 a 300 caracteres).", "erro"); return; }
  if (comprovante.length > 200) { mostrarToast("O comprovante aceita até 200 caracteres.", "erro"); return; }
  if (tipo === "SAIDA" && comprovante.length < 3) { mostrarToast("Toda saída precisa de comprovante (número da nota ou do recibo, ou link): a arrecadação e o gasto do evento são documentados para a auditoria (Art. 152, I).", "erro"); return; }
  const corpo = { eventoId: evtIdDoEvento(ctx), tipo, categoria, valor: valor.valor, descricao };
  if (data) corpo.dataLancamento = data;
  if (comprovante) corpo.comprovante = comprovante;
  await evtExecutarAcao(ctx, "caixa/lancar", corpo);
}
function evtAbrirCancelarLancamentoAcao(lancamentoId, ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  const id = Number(lancamentoId);
  const area = evtEl(`evtCancForm${ctx}_${id}`);
  if (!area) return;
  area.innerHTML = `<div class="cal-form-inline">
    <p class="psc-legenda">O lançamento continua visível, riscado e fora da conta.</p>
    <label for="evtCancMotivo${ctx}_${id}">Motivo (5 a 300 caracteres)</label>
    <textarea id="evtCancMotivo${ctx}_${id}" rows="2" maxlength="300" style="width:100%;"></textarea>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar btn-perigo" style="width:auto;margin:0;" data-on-click="evtCancelarLancamentoAcao" data-args-click="${argsAttr(id, String(ctx))}">Cancelar o lançamento</button>
      <button type="button" class="btn-link" data-on-click="evtFecharCancelarLancamentoAcao" data-args-click="${argsAttr(id, String(ctx))}">voltar</button>
    </div>
  </div>`;
}
function evtFecharCancelarLancamentoAcao(lancamentoId, ctxBruto) {
  const area = evtEl(`evtCancForm${evtContexto(ctxBruto)}_${Number(lancamentoId)}`);
  if (area) area.innerHTML = "";
}
async function evtCancelarLancamentoAcao(lancamentoId, ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  const id = Number(lancamentoId);
  const motivo = evtTexto(`evtCancMotivo${ctx}_${id}`);
  if (motivo.length < 5 || motivo.length > 300) { mostrarToast("Informe o motivo do cancelamento (de 5 a 300 caracteres).", "erro"); return; }
  await evtExecutarAcao(ctx, "caixa/cancelar-lancamento", { lancamentoId: id, motivo }, "Cancelar este lançamento? Ele fica visível, riscado, e sai da conta.");
}

// -- encerrar o caixa: superávit com destino (soma EXATA), déficit com justificativa, zero só confirma --
function evtRenderFormEncerrar(c, ctx) {
  const saldoC = evtCentavos(c.totais && c.totais.saldo);
  let miolo;
  if (saldoC > 0) {
    miolo = `<p>Sobrou <strong>${escaparHtmlEbd(evtDinheiro(saldoC / 100))}</strong>. Todo o superávit precisa de destino: a soma dos destinos tem de bater com o saldo.</p>
      <div id="evtDestinosLinhas${ctx}"></div>
      <div class="psc-acoes"><button type="button" class="btn-link" data-on-click="evtAdicionarDestinoAcao" data-args-click="${argsAttr(String(ctx))}">➕ Adicionar outro destino</button></div>
      <p id="evtDestIndicador${ctx}" class="evt-indicador" role="status"></p>`;
  } else if (saldoC < 0) {
    miolo = `<p>O caixa fechou no <strong class="psc-alerta">negativo (${escaparHtmlEbd(evtDinheiro(saldoC / 100))})</strong>. Explique o déficit para a Tesouraria Geral.</p>
      <label for="evtDeficit${ctx}">Justificativa do déficit (10 a 500 caracteres)</label>
      <textarea id="evtDeficit${ctx}" rows="3" maxlength="500" style="width:100%;"></textarea>`;
  } else {
    miolo = "<p>O caixa fechou <strong>zerado</strong>: não há superávit para destinar. Basta confirmar o encerramento.</p>";
  }
  return `<div class="cal-form-inline evt-encerrar">
    <h5>🔒 Encerrar o caixa</h5>
    <p class="psc-aviso">${escaparHtmlEbd(EVT_TEXTO_SUPERAVIT)}</p>
    ${miolo}
    <div class="psc-acoes"><button type="button" class="btn-confirmar" id="evtBotaoEncerrar${ctx}" style="width:auto;margin:0;"${saldoC > 0 ? " disabled" : ""} data-on-click="evtEncerrarCaixaAcao" data-args-click="${argsAttr(String(ctx))}">🔒 Encerrar o caixa</button></div>
  </div>`;
}
function evtInicializarDestinos(ctx) {
  const d = evtDossie[ctx];
  const cx = d && d.caixa, a = d && d.acoes;
  if (!cx || !a || !a.encerrarCaixa || cx.status !== "ABERTO") return;
  const saldoC = evtCentavos(cx.totais && cx.totais.saldo);
  if (saldoC <= 0) return;
  evtDestinos[ctx] = [{ tipo: "RECOLHIDO_SEDE", valor: (saldoC / 100).toFixed(2).replace(".", ","), data: calHojeBrasilia(), comprovante: "", descricao: "" }];
  evtRenderDestinos(ctx);
}
function evtRenderDestinos(ctx) {
  const area = evtEl(`evtDestinosLinhas${ctx}`);
  if (!area) return;
  const cat = evtCatalogosOuVazio();
  const hoje = calHojeBrasilia();
  const linhas = evtDestinos[ctx];
  area.innerHTML = linhas.map((d, i) => `<div class="evt-destino">
      <div class="cal-form-grade">
        <div class="input-group"><label for="evtDestTipo${ctx}_${i}">Destino ${i + 1}</label>
          <select id="evtDestTipo${ctx}_${i}" data-on-change="evtDestinosMudouAcao" data-args-change="${argsAttr(String(ctx))}">${evtOpcoesHtml(cat.destinosSuperavit, x => x.codigo, x => x.rotulo)}</select></div>
        <div class="input-group"><label for="evtDestValor${ctx}_${i}">Valor (R$)</label>
          <input type="text" id="evtDestValor${ctx}_${i}" inputmode="decimal" value="${escaparHtmlEbd(d.valor)}" data-on-input="evtDestinosMudouAcao" data-args-input="${argsAttr(String(ctx))}" /></div>
        <div class="input-group"><label for="evtDestData${ctx}_${i}">Data</label>
          <input type="date" id="evtDestData${ctx}_${i}" value="${escaparHtmlEbd(d.data)}" max="${escaparHtmlEbd(hoje)}" /></div>
        <div class="input-group"><label for="evtDestComp${ctx}_${i}">Comprovante <span class="evt-obrigatorio">*</span></label>
          <input type="text" id="evtDestComp${ctx}_${i}" maxlength="200" value="${escaparHtmlEbd(d.comprovante)}" placeholder="depósito, recibo da Sede, nota" /></div>
      </div>
      <label for="evtDestDesc${ctx}_${i}">Descrição <span class="psc-legenda">(obrigatória para benfeitoria)</span></label>
      <input type="text" id="evtDestDesc${ctx}_${i}" maxlength="300" value="${escaparHtmlEbd(d.descricao)}" />
      ${linhas.length > 1 ? `<button type="button" class="btn-link btn-link-perigo" data-on-click="evtRemoverDestinoAcao" data-args-click="${argsAttr(i, String(ctx))}">remover este destino</button>` : ""}
    </div>`).join("");
  linhas.forEach((d, i) => { const sel = evtEl(`evtDestTipo${ctx}_${i}`); if (sel) sel.value = d.tipo; });
  evtDestinosMudouAcao(ctx);
}
function evtLerDestinosDoDom(ctx) {
  evtDestinos[ctx] = evtDestinos[ctx].map((d, i) => {
    const campo = (nome) => { const el = evtEl(`evtDest${nome}${ctx}_${i}`); return el ? String(el.value == null ? "" : el.value) : null; };
    return { tipo: campo("Tipo") || d.tipo, valor: campo("Valor") != null ? campo("Valor") : d.valor, data: campo("Data") != null ? campo("Data") : d.data, comprovante: campo("Comp") != null ? campo("Comp") : d.comprovante, descricao: campo("Desc") != null ? campo("Desc") : d.descricao };
  });
}
// Indicador ao vivo "destinado R$ X de R$ Y": o botão só habilita quando a soma bate com o saldo, centavo por centavo.
function evtDestinosMudouAcao(ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  evtLerDestinosDoDom(ctx);
  const d = evtDossie[ctx];
  if (!d || !d.caixa) return;
  const saldoC = evtCentavos(d.caixa.totais && d.caixa.totais.saldo);
  let somaC = 0, invalido = false;
  evtDestinos[ctx].forEach(x => {
    const r = evtAnalisarValor(x.valor);
    if (r.ok) somaC += evtCentavos(r.valor); else invalido = true;
  });
  const bate = !invalido && evtDestinos[ctx].length > 0 && somaC === saldoC;
  const indicador = evtEl(`evtDestIndicador${ctx}`), botao = evtEl(`evtBotaoEncerrar${ctx}`);
  if (indicador) {
    const diferenca = Math.abs(somaC - saldoC) / 100;
    indicador.textContent = `destinado ${evtDinheiro(somaC / 100)} de ${evtDinheiro(saldoC / 100)}${bate ? " ✅ confere" : invalido ? " — confira os valores" : somaC > saldoC ? ` — passou ${evtDinheiro(diferenca)}` : ` — faltam ${evtDinheiro(diferenca)}`}`;
    indicador.className = `evt-indicador ${bate ? "evt-indicador-ok" : "evt-indicador-erro"}`;
  }
  if (botao) botao.disabled = !bate;
}
function evtAdicionarDestinoAcao(ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  evtLerDestinosDoDom(ctx);
  const d = evtDossie[ctx];
  const saldoC = d && d.caixa ? evtCentavos(d.caixa.totais && d.caixa.totais.saldo) : 0;
  let somaC = 0;
  evtDestinos[ctx].forEach(x => { const r = evtAnalisarValor(x.valor); if (r.ok) somaC += evtCentavos(r.valor); });
  const falta = saldoC - somaC;
  evtDestinos[ctx].push({ tipo: "RECOLHIDO_SEDE", valor: falta > 0 ? (falta / 100).toFixed(2).replace(".", ",") : "", data: calHojeBrasilia(), comprovante: "", descricao: "" });
  evtRenderDestinos(ctx);
}
function evtRemoverDestinoAcao(indice, ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  evtLerDestinosDoDom(ctx);
  if (evtDestinos[ctx].length <= 1) return;
  evtDestinos[ctx].splice(Number(indice), 1);
  evtRenderDestinos(ctx);
}
async function evtEncerrarCaixaAcao(ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  const d = evtDossie[ctx];
  if (!d || !d.caixa) return;
  const saldoC = evtCentavos(d.caixa.totais && d.caixa.totais.saldo);
  const corpo = { eventoId: evtIdDoEvento(ctx), destinos: [] };
  if (saldoC > 0) {
    evtLerDestinosDoDom(ctx);
    const hoje = calHojeBrasilia();
    let somaC = 0;
    for (const [i, x] of evtDestinos[ctx].entries()) {
      const r = evtAnalisarValor(x.valor);
      if (!r.ok) { mostrarToast(`Destino ${i + 1}: ${r.erro}`, "erro"); return; }
      if (!x.data || x.data > hoje) { mostrarToast(`Destino ${i + 1}: data inválida ou no futuro.`, "erro"); return; }
      const comprovante = String(x.comprovante || "").trim(), descricao = String(x.descricao || "").trim();
      if (comprovante.length < 3 || comprovante.length > 200) { mostrarToast(`Destino ${i + 1}: informe o comprovante (depósito, recibo da Sede, nota da benfeitoria).`, "erro"); return; }
      if (x.tipo === "BENFEITORIA" && descricao.length < 5) { mostrarToast(`Destino ${i + 1}: descreva a benfeitoria.`, "erro"); return; }
      if (descricao.length > 300) { mostrarToast(`Destino ${i + 1}: a descrição aceita até 300 caracteres.`, "erro"); return; }
      somaC += evtCentavos(r.valor);
      const linha = { tipo: x.tipo, valor: r.valor, data: x.data, comprovante };
      if (descricao) linha.descricao = descricao;
      corpo.destinos.push(linha);
    }
    if (somaC !== saldoC) { mostrarToast(`Os destinos somam ${evtDinheiro(somaC / 100)} e o superávit é ${evtDinheiro(saldoC / 100)}: o saldo inteiro precisa ter destino, sem sobra nem falta.`, "erro"); return; }
  } else if (saldoC < 0) {
    const justificativa = evtTexto(`evtDeficit${ctx}`);
    if (justificativa.length < 10 || justificativa.length > 500) { mostrarToast("O caixa fechou no negativo: explique o déficit (10 a 500 caracteres) para a Tesouraria Geral.", "erro"); return; }
    corpo.justificativaDeficit = justificativa;
  }
  await evtExecutarAcao(ctx, "caixa/encerrar", corpo, "Encerrar o caixa do evento? Depois de encerrado ele não recebe mais lançamento — só volta se a Tesouraria Geral devolver para correção.");
}

// -- Tesouraria Geral: conferir ou devolver o caixa encerrado --
function evtRenderFormTesouraria(a, ctx) {
  const conferir = a.conferirCaixa ? `<div class="cal-form-inline">
      <h5>✅ Conferir o caixa</h5>
      <label for="evtConfObs${ctx}">Observação (opcional, até 500 caracteres)</label>
      <textarea id="evtConfObs${ctx}" rows="2" maxlength="500" style="width:100%;"></textarea>
      <div class="psc-acoes"><button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="evtConferirCaixaAcao" data-args-click="${argsAttr(String(ctx))}">✅ Conferir</button></div>
    </div>`
    : (a.devolverCaixa ? "<p class='psc-aviso'>Quem encerrou o caixa não faz a conferência dele: outra pessoa da Tesouraria Geral precisa conferir.</p>" : "");
  const devolver = a.devolverCaixa ? `<div class="cal-form-inline">
      <h5>↩️ Devolver para correção</h5>
      <label for="evtDevMotivo${ctx}">O que precisa ser corrigido (10 a 300 caracteres)</label>
      <textarea id="evtDevMotivo${ctx}" rows="2" maxlength="300" style="width:100%;"></textarea>
      <div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="evtDevolverCaixaAcao" data-args-click="${argsAttr(String(ctx))}">↩️ Devolver à organização</button></div>
    </div>` : "";
  return conferir + devolver;
}
async function evtConferirCaixaAcao(ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  const observacao = evtTexto(`evtConfObs${ctx}`);
  if (observacao.length > 500) { mostrarToast("A observação aceita até 500 caracteres.", "erro"); return; }
  const corpo = { eventoId: evtIdDoEvento(ctx) };
  if (observacao) corpo.observacao = observacao;
  await evtExecutarAcao(ctx, "caixa/conferir", corpo, "Conferir o caixa? A prestação de contas do evento fica concluída.");
}
async function evtDevolverCaixaAcao(ctxBruto) {
  const ctx = evtContexto(ctxBruto);
  const motivo = evtTexto(`evtDevMotivo${ctx}`);
  if (motivo.length < 10 || motivo.length > 300) { mostrarToast("Explique o que precisa ser corrigido (10 a 300 caracteres).", "erro"); return; }
  await evtExecutarAcao(ctx, "caixa/devolver", { eventoId: evtIdDoEvento(ctx), motivo }, "Devolver o caixa para correção? Os destinos do superávit são desfeitos e a organização encerra de novo.");
}

// -- Meu Painel → Eventos (qualquer login) --
async function evtCarregarMeusEventosAcao() {
  const lista = evtEl("evtMeusEventos"), aviso = evtEl("evtMeuResultado"), bloco = evtEl("evtMeusBloco");
  const seq = ++evtMeuSeq;
  const data = await evtObter("meus");
  if (seq !== evtMeuSeq) return;   // resposta velha: a pessoa trocou de login ou recarregou
  if (data.sucesso === false) {
    evtMeusEventos = [];
    if (bloco) bloco.style.display = "none";
    if (lista) lista.innerHTML = "";
    if (aviso) aviso.textContent = evtMensagemErro(data);
    return;
  }
  evtMeusEventos = Array.isArray(data.eventos) ? data.eventos : [];
  if (aviso) aviso.textContent = "";
  if (bloco) bloco.style.display = evtMeusEventos.length ? "" : "none";   // quem não organiza nada só vê o cartão fixo
  if (lista) lista.innerHTML = evtMeusEventos.map(evtRenderCartaoMeu).join("");
}
function evtRenderCartaoMeu(e) {
  const id = Number(e.eventoId);
  const rotulos = Array.isArray(e.rotuloPapeis) ? e.rotuloPapeis : [];
  return `<div class="cal-cartao cartao-area-ebd${e.congresso ? " evt-congresso" : ""}">
    <h5>${escaparHtmlEbd(e.titulo)} ${evtSeloCongresso(e)}</h5>
    <p style="margin:4px 0;">${calSeloNivel(e.nivel, e.rotuloNivel)} ${calSeloStatus(e.status)}
      <span class="psc-legenda">${escaparHtmlEbd(calPeriodo(e.dataInicio, e.dataFim, e.horaInicio))} · ${escaparHtmlEbd(calTextoAbrangencia(e))}${e.local ? ` · 📍 ${escaparHtmlEbd(e.local)}` : ""}</span></p>
    <p style="margin:4px 0;">Seu papel: <strong>${escaparHtmlEbd(rotulos.join(", ") || "—")}</strong></p>
    <p style="margin:4px 0;">🎤 ${evtChipsConvidados(e.convidados)} · 💰 ${e.caixa ? evtSeloCaixa(e.caixa) : (e.podeCaixa ? "<span class='psc-legenda'>você pode abrir o Caixa Flutuante</span>" : "<span class='psc-legenda'>sem caixa</span>")}</p>
    <div><button type="button" class="btn-link" data-on-click="evtAbrirDossieAcao" data-args-click="${argsAttr(id, "M")}">🗂️ Abrir dossiê</button></div>
  </div>`;
}
async function carregarMeuPainelEventosAcao() {
  evtVerificarDono();
  const lista = evtEl("evtMeusEventos"), aviso = evtEl("evtMeuResultado"), bloco = evtEl("evtMeusBloco");
  if (!lista) return;
  if (!authToken) {
    lista.innerHTML = "";
    if (bloco) bloco.style.display = "none";
    if (aviso) aviso.textContent = "Entre com a sua senha para ver os eventos que você organiza.";
    return;
  }
  if (aviso) aviso.textContent = "Carregando…";
  await Promise.all([evtGarantirCatalogos(), evtCarregarMeusEventosAcao()]);
}

registrarAcoes({
  evtAbrirCaixaAcao, evtAbrirCancelarConvidadoAcao, evtAbrirCancelarLancamentoAcao, evtAbrirDossieAcao, evtAbrirDossieDoCalendarioAcao,
  evtAbrirEdicaoConvidadoAcao, evtAbrirEncerrarOrganizadorAcao, evtAdicionarDestinoAcao, evtCancelarConvidadoAcao, evtCancelarLancamentoAcao,
  evtCarregarCaixasAcao, evtCarregarFilaAcao, evtCarregarPainelAcao, evtConferirCaixaAcao, evtDecidirEticaAcao, evtDecidirNadaConstaAcao,
  evtDesignarOrganizadorAcao, evtDestinosMudouAcao, evtDevolverCaixaAcao, evtEncerrarCaixaAcao, evtEncerrarOrganizadorAcao,
  evtFecharCancelarLancamentoAcao, evtFecharEncerrarOrganizadorAcao, evtFecharFormConvidadoAcao, evtLancarAcao, evtLancTipoMudouAcao,
  evtMostrarSecaoAcao, evtOficializarConvidadoAcao, evtRegistrarConvidadoAcao, evtRemoverDestinoAcao, evtSalvarConvidadoAcao,
  evtSubmeterConvidadoAcao
});
