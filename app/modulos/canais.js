// app/modulos/canais.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- Canais Oficiais e Comunicação (v7.3) ----
// Relação de Canais Oficiais da IEADESPA (Estatuto Art. 11, V e Art. 12; Regimento Art. 157 §5º,
// 160 e 160-A): quem administra cada canal e o Termo de Dever de Moderação, a Regra das 24 Horas
// (conteúdo irregular), a custódia das senhas na sucessão de liderança e a transmissão dos cultos
// com a Área Cega. Toda regra (o que é canal oficial, o relógio de 24 horas, conformidade,
// sucessão, escopo, permissão) mora no servidor (shared/canais.js, rota /api/canais/*): aqui só
// se monta a tela e se manda o que a pessoa fez; recusa de regra vem como 422 { mensagem } e é
// mostrada tal qual. Tudo que vem do servidor e entra em innerHTML passa por escaparHtmlEbd;
// onclick só recebe id numérico ou constante nossa. NUNCA se pede, mostra nem guarda senha. Quem
// avisou (relatadaPor*) só aparece na visão de gestão, e só se o servidor mandar. Datas/horas
// reaproveitam calData/calDataHora (Brasília) do Calendário.
const CNL_SECOES = ["painel", "canais", "ocorrencias", "senhas", "transmissao"];
const CNL_SITUACAO_CANAL = {
  REGULAR: ["🟢 Regular", "cal-st-homologado"],
  ATENCAO: ["🟠 Atenção", "cal-st-proposto"],
  IRREGULAR: ["🔴 Irregular", "cal-st-indeferido"]
};
const CNL_GRAVIDADE = { ALTA: ["Gravidade alta", "cal-st-indeferido"], MEDIA: ["Gravidade média", "cal-st-proposto"] };
const CNL_SITUACAO_TRANSMISSAO = {
  NAO_INFORMADA: ["⚪ Não informada", "cal-st-cancelado"],
  NAO_SE_APLICA: ["➖ Não transmite", "cal-st-cancelado"],
  PENDENTE: ["🟠 Pendente", "cal-st-proposto"],
  CONFORME: ["🟢 Conforme", "cal-st-homologado"]
};
const CNL_FASE = {
  NO_PRAZO: ["🟢 No prazo", "cnl-fase-prazo"],
  URGENTE: ["🟠 Urgente", "cnl-fase-urgente"],
  VENCIDA: ["🔴 VENCIDA", "cnl-fase-vencida"],
  REMOVIDA_NO_PRAZO: ["✅ Removida no prazo", "cnl-fase-ok"],
  REMOVIDA_FORA_DO_PRAZO: ["🟡 Removida fora do prazo", "cnl-fase-fora"],
  IMPROCEDENTE: ["⚪ Improcedente", "cnl-fase-neutra"]
};
const CNL_RESULTADO_CONFERENCIA = { CONFORME: ["🟢 Conforme", "cal-st-homologado"], IRREGULAR: ["🔴 Irregular", "cal-st-indeferido"] };
// chave do resumo da cobertura, rótulo e o que pintar quando o valor é maior que zero
const CNL_CONTADORES = [
  ["canaisAtivos", "Canais ativos", ""], ["regulares", "Regulares", "ok"], ["atencao", "Em atenção", "alerta"], ["irregulares", "Irregulares", "erro"],
  ["cadastrosIncompletos", "Cadastros incompletos", "alerta"], ["semAdministrador", "Sem administrador", "erro"], ["menoresIrregulares", "Grupos com menores fora da regra", "erro"], ["termosPendentes", "Termos pendentes", "alerta"],
  ["ocorrenciasAbertas", "Ocorrências abertas", ""], ["ocorrenciasVencidas", "Ocorrências VENCIDAS", "erro"],
  ["trocasPendentes", "Trocas de senha pendentes", "alerta"], ["trocasVencidas", "Trocas vencidas", "erro"],
  ["congregacoesSemCanal", "Congregações sem canal", "alerta"], ["transmissaoPendente", "Transmissão pendente", "alerta"]
];
// como o identificador é escrito, por tipo (catalogos.plataformas[].tipoIdent): rótulo, exemplo e ajuda
const CNL_IDENT = {
  telefone: ["Número com DDD", "(94) 99999-0000", "Informe o número institucional com DDD. Número cadastrado como contato pessoal de um membro é recusado."],
  email: ["E-mail institucional", "contato@exemplo.org.br", "Use o e-mail da Igreja, não o e-mail pessoal de um obreiro ou dirigente."],
  handle: ["Perfil (@)", "@adseta.parauapebas", "Só o @ do perfil (letras, números, ponto e sublinhado). Não cole link de convite."],
  url: ["Endereço do canal (https://)", "https://...", "O endereço precisa começar com https://."],
  nome: ["Nome do grupo", "Ex.: Líderes da Área Norte", "Guarde o NOME do grupo — nunca o link de convite: o link deixa qualquer pessoa entrar."],
  livre: ["Identificador", "", "Texto livre de 2 a 200 caracteres."]
};
const CNL_MSG_429 = "Você já enviou muitos avisos nesta hora. Aguarde um pouco ou fale com a Secretaria.";

let cnlDonoDaTela = null;            // matrícula de quem a tela foi montada (não vaza dado ao trocar de login)
let cnlSecaoAtual = "painel";
let cnlCatalogos = null;             // GET catalogos (plataformas, categorias, temas, escopos, vínculos...)
let cnlReferencias = null;           // GET referencias (congregações, Áreas, departamentos; só gestão)
let cnlCanais = [];                  // relação de canais (gestão)
let cnlCanaisCarregados = false;
let cnlCanalAberto = null;           // resposta de canal?canalId=
let cnlOcorrenciasG = [];            // ocorrências da visão de gestão
let cnlOcorrenciaAberta = { G: null, M: null };   // resposta de ocorrencia?ocorrenciaId= (G = gestão, M = Meu Painel)
let cnlTrocas = [];
let cnlTransmissao = [];
let cnlMeus = null;                  // resposta de meus (Meu Painel)
let cnlMeuSeq = 0;
let cnlAcaoEmCurso = false;          // trava duplo clique nas ações que gravam
let cnlTextosCopia = [];             // textos que os botões "copiar" levam (por índice)
let cnlContagens = [];               // contagens regressivas na tela: { id, fimMs }
let cnlContagemSeq = 0;
let cnlContagemTimer = null;

function cnlPodeGestao() { return authPermissoes.includes("canais_gestao"); }
function cnlEl(id) { return document.getElementById(id); }
function cnlTexto(id) { const c = cnlEl(id); return c ? String(c.value == null ? "" : c.value).trim() : ""; }
function cnlMarcado(id) { const c = cnlEl(id); return !!(c && c.checked); }
function cnlDe(mapa, chave, padrao) { return Object.prototype.hasOwnProperty.call(mapa, chave) ? mapa[chave] : padrao; }
function cnlRolarPara(id) {
  const el = cnlEl(id);
  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" });
}
function cnlNumero(valor) { const n = Number(valor); return Number.isFinite(n) ? n : 0; }
// Só vira link o que começa com https:// (evidência, prova e endereço do canal).
function cnlLinkHttps(url, rotulo) {
  const u = String(url == null ? "" : url).trim();
  if (!u) return "";
  if (/^https:\/\/[^\s]/i.test(u)) return `<a href="${urlSegura(u)}" target="_blank" rel="noopener noreferrer">${rotulo}</a>`;
  return `<span class="psc-alerta">link recusado (não é https://)</span>`;
}

// ---- chamadas à API (nunca lançam: erro de rede ou resposta que não é JSON viram { sucesso:false, mensagem }) ----
async function cnlRequisitar(caminho, opcoes) {
  try {
    const res = await fetchProtegido(`${API_BASE}/canais/${caminho}`, opcoes);
    let corpo = null;
    try { corpo = await res.json(); } catch { /* sem JSON */ }
    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
      return { sucesso: false, mensagem: res.status === 429 ? CNL_MSG_429 : `Resposta inesperada do servidor (${res.status}).`, httpStatus: res.status };
    }
    if (res.status >= 400) {
      corpo.sucesso = false;
      if (!corpo.mensagem && res.status === 429) corpo.mensagem = CNL_MSG_429;
    }
    corpo.httpStatus = res.status;
    return corpo;
  } catch {
    return { sucesso: false, mensagem: "Não foi possível falar com o servidor agora." };
  }
}
function cnlObter(caminho) { return cnlRequisitar(caminho); }
function cnlPostar(acao, corpo) {
  return cnlRequisitar(acao, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
}
function cnlMensagemErro(data) { return (data && data.mensagem) || "Não foi possível concluir a operação agora."; }
// Toast + texto fixo na tela (textContent: nada de HTML aqui).
function mostrarResultadoCnl(data, idMensagem, destaque) {
  const texto = cnlMensagemErro(data);
  mostrarToast(texto, data && data.sucesso === false ? "erro" : "sucesso");
  const el = cnlEl(idMensagem);
  if (el) { el.textContent = texto; el.className = destaque ? "subtitle psc-aviso" : "subtitle"; }
}

// ---- selos ----
function cnlSelo(mapa, chave) {
  const [rotulo, classe] = cnlDe(mapa, chave, null) || [escaparHtmlEbd(chave || "—"), "cal-st-cancelado"];
  return `<span class="cal-selo ${classe}">${rotulo}</span>`;
}
function cnlSeloPendencia(p) {
  const [rotulo, classe] = cnlDe(CNL_GRAVIDADE, p.gravidade, null) || [escaparHtmlEbd(p.gravidade || ""), "cal-st-cancelado"];
  return `<span class="cal-selo ${classe}">${rotulo}</span>`;
}

// ---- "copiar" (modelo de Termo de Uso, Aviso de Atenção, frase de redirecionamento) ----
function cnlBotaoCopiar(texto, rotulo) {
  let indice = cnlTextosCopia.indexOf(String(texto));
  if (indice < 0) { cnlTextosCopia.push(String(texto)); indice = cnlTextosCopia.length - 1; }
  return `<button type="button" class="btn-link" data-on-click="cnlCopiarTextoAcao" data-args-click="${argsAttr(indice)}">📋 ${rotulo}</button>`;
}
async function cnlCopiarTextoAcao(indice) {
  const texto = cnlTextosCopia[Number(indice)];
  if (texto == null) return;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(texto);
      mostrarToast("Texto copiado.", "sucesso");
      return;
    }
  } catch { /* cai no plano B */ }
  try {
    const campo = document.createElement("textarea");
    campo.value = texto;
    campo.setAttribute("readonly", "");
    campo.style.position = "fixed";
    campo.style.opacity = "0";
    document.body.appendChild(campo);
    campo.select();
    const copiou = document.execCommand("copy");
    campo.remove();
    mostrarToast(copiou ? "Texto copiado." : "Não foi possível copiar: selecione o texto e copie à mão.", copiou ? "sucesso" : "erro");
  } catch {
    mostrarToast("Não foi possível copiar: selecione o texto e copie à mão.", "erro");
  }
}

// ---- Regra das 24 Horas: contagem regressiva ----
function cnlHorasParaTexto(horas) {
  const minutos = Math.max(0, Math.round(cnlNumero(horas) * 60));
  const h = Math.floor(minutos / 60), m = minutos % 60;
  if (h >= 48) return `${Math.floor(h / 24)} dia(s) e ${h % 24} h`;
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}
// fimMs = o instante em que o prazo de 24 horas acaba (já passado = vencido).
function cnlSituacaoDaContagem(fimMs, agoraMs) {
  const diferenca = fimMs - agoraMs;
  if (diferenca >= 0) {
    return { vencida: false, urgente: diferenca <= 6 * 3600000, texto: `faltam ${cnlHorasParaTexto(diferenca / 3600000)} para o fim do prazo de 24 horas` };
  }
  return { vencida: true, urgente: false, texto: `VENCIDA há ${cnlHorasParaTexto(-diferenca / 3600000)} — a Igreja está corresponsável` };
}
function cnlClasseDaContagem(r) { return `cnl-contagem ${r.vencida ? "cnl-fase-vencida" : r.urgente ? "cnl-fase-urgente" : "cnl-fase-prazo"}`; }
function cnlIconeDaContagem(r) { return r.vencida ? "🔴" : r.urgente ? "🟠" : "🟢"; }
// Instante em que o prazo acaba, a partir do que o servidor mandou (horas restantes/vencidas no momento da resposta).
function cnlFimDoPrazoMs(o, agoraMs) {
  if (o.fase === "VENCIDA") return agoraMs - Math.max(cnlNumero(o.horasVencida), 0.01) * 3600000;
  if (o.horasRestantes != null) return agoraMs + cnlNumero(o.horasRestantes) * 3600000;
  const prazo = o.prazoRemocaoEm ? Date.parse(o.prazoRemocaoEm) : NaN;
  return Number.isNaN(prazo) ? agoraMs : prazo;
}
// Ocorrência aberta: contagem regressiva viva. Encerrada: o selo da fase e, se removida, em quantas horas.
function cnlHtmlFaseOcorrencia(o) {
  if (o.status === "ABERTA") {
    const agora = Date.now();
    const fimMs = cnlFimDoPrazoMs(o, agora);
    const r = cnlSituacaoDaContagem(fimMs, agora);
    const id = `cnlContagem_${++cnlContagemSeq}`;
    cnlContagens.push({ id, fimMs });
    return `<span id="${id}" class="${cnlClasseDaContagem(r)}">${cnlIconeDaContagem(r)} ${escaparHtmlEbd(r.texto)}</span>`;
  }
  const [rotulo, classe] = cnlDe(CNL_FASE, o.fase, null) || [escaparHtmlEbd(o.fase || o.status || "—"), "cnl-fase-neutra"];
  const horas = o.horasAteRemover != null ? ` · removida em ${escaparHtmlEbd(String(o.horasAteRemover).replace(".", ","))} h` : "";
  return `<span class="cnl-contagem ${classe}">${rotulo}${horas}</span>`;
}
function cnlAtualizarContagens() {
  const agora = Date.now();
  cnlContagens = cnlContagens.filter(c => {
    const el = cnlEl(c.id);
    if (!el) return false;
    const r = cnlSituacaoDaContagem(c.fimMs, agora);
    el.textContent = `${cnlIconeDaContagem(r)} ${r.texto}`;
    el.className = cnlClasseDaContagem(r);
    return true;
  });
}
function cnlIniciarContagem() {
  if (!cnlContagemTimer) cnlContagemTimer = setInterval(cnlAtualizarContagens, 30000);
}

// ---- troca de login: não deixa o dado da pessoa anterior na tela ----
function cnlLimparTela() {
  cnlSecaoAtual = "painel"; cnlCatalogos = null; cnlReferencias = null; cnlCanais = []; cnlCanaisCarregados = false; cnlCanalAberto = null;
  cnlOcorrenciasG = []; cnlOcorrenciaAberta = { G: null, M: null }; cnlTrocas = []; cnlTransmissao = []; cnlMeus = null; cnlMeuSeq++;
  cnlTextosCopia = []; cnlContagens = [];
  ["cnlContadores", "cnlCanaisPendencia", "cnlCongSemCanal", "cnlTabelaCanais", "cnlListaOcorrencias", "cnlDetalheOcorrenciaG", "cnlTabelaTrocas",
    "cnlTabelaTransmissao", "cnlMeusCanais", "cnlMinhasOcorrenciasAbertas", "cnlDetalheOcorrenciaM", "cnlMeusAvisos"].forEach(id => {
    const el = cnlEl(id);
    if (el) el.innerHTML = "";
  });
  const detalhe = cnlEl("cnlDetalheCanal");
  if (detalhe) detalhe.innerHTML = "<p class='subtitle'>Escolha um canal na relação (<em>Abrir</em>) ou no painel para ver os detalhes.</p>";
  const detalheOc = cnlEl("cnlDetalheOcorrenciaG");
  if (detalheOc) detalheOc.innerHTML = "<p class='subtitle'>Escolha uma ocorrência (<em>Abrir</em>) para ver a orientação e registrar a remoção.</p>";
  ["cnlResultadoPainel", "cnlResultadoCanais", "cnlResultadoDetalheCanal", "cnlCResultado", "cnlResultadoOcorrencias", "cnlResultadoDetalheOc", "cnlResultadoTrocas",
    "cnlResultadoAbrirTroca", "cnlResultadoTransmissao", "cnlTrResultado", "cnlMeuResultado", "cnlMeuResultadoOc", "cnlMeuResultadoAcao", "cnlAvisoResultado", "cnlMeusAvisosResultado",
    "cnlAvisoCategoriaInfo"].forEach(id => {
    const el = cnlEl(id);
    if (el) el.textContent = "";
  });
  [["cnlAvisoCanal", "— escolha o canal —"], ["cnlAvisoCategoria", "— escolha o tipo —"], ["cnlTrocaCanal", "— escolha o canal —"]].forEach(([id, texto]) => {
    const sel = cnlEl(id);
    if (sel) { sel.innerHTML = `<option value="">${texto}</option>`; sel.value = ""; }
  });
  ["cnlAvisoDescricao", "cnlAvisoLink", "cnlTrocaObs", "cnlFiltroBusca"].forEach(id => { const el = cnlEl(id); if (el) el.value = ""; });
  const contador = cnlEl("cnlAvisoContador");
  if (contador) contador.textContent = "0";
  cnlLimparFormCanalAcao();
}
function cnlVerificarDono() {
  if (cnlDonoDaTela !== authMatricula) { cnlLimparTela(); cnlDonoDaTela = authMatricula; }
}

// ---- catálogos e referências ----
async function cnlGarantirCatalogos(forcar) {
  if (cnlCatalogos && !forcar) return cnlCatalogos;
  const data = await cnlObter("catalogos");
  if (data.sucesso === false) { cnlCatalogos = null; return null; }
  const lista = (v) => (Array.isArray(v) ? v : []);
  cnlCatalogos = {
    plataformas: lista(data.plataformas), categorias: lista(data.categorias), temasFocados: lista(data.temasFocados), escopos: lista(data.escopos),
    vinculos: lista(data.vinculos), papeisAdmin: lista(data.papeisAdmin), categoriasOcorrencia: lista(data.categoriasOcorrencia),
    motivosTroca: lista(data.motivosTroca), areaCegaSituacoes: lista(data.areaCegaSituacoes),
    prazoRemocaoHoras: Number(data.prazoRemocaoHoras) || 24, avisoAtencao: data.avisoAtencao || "", fraseRedirecionamento: data.fraseRedirecionamento || "", modeloTermoDeUso: data.modeloTermoDeUso || ""
  };
  return cnlCatalogos;
}
async function cnlGarantirReferencias(forcar) {
  if (cnlReferencias && !forcar) return cnlReferencias;
  const data = await cnlObter("referencias");
  if (data.sucesso === false) { cnlReferencias = null; return null; }
  const lista = (v) => (Array.isArray(v) ? v : []);
  cnlReferencias = { escopoGlobal: data.escopoGlobal !== false, congregacoes: lista(data.congregacoes), areas: lista(data.areas), departamentos: lista(data.departamentos) };
  return cnlReferencias;
}
function cnlRotuloDoCatalogo(lista, codigo) {
  const item = (lista || []).find(x => x.codigo === codigo);
  return item ? item.rotulo : codigo;
}
function cnlOpcoesHtml(lista, valor, rotulo, placeholder) {
  return (placeholder != null ? `<option value="">${escaparHtmlEbd(placeholder)}</option>` : "")
    + lista.map(x => `<option value="${escaparHtmlEbd(valor(x))}">${escaparHtmlEbd(rotulo(x))}</option>`).join("");
}
function cnlPreencherSelect(id, htmlOpcoes) {
  const sel = cnlEl(id);
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = htmlOpcoes;
  if (atual) sel.value = atual;
}
// Congregações com as do meu escopo primeiro (quem não é global só consegue gerir as do seu escopo).
function cnlOpcoesCongregacao(placeholder) {
  const lista = cnlReferencias ? cnlReferencias.congregacoes : [];
  const meus = lista.filter(c => c.noMeuEscopo !== false), outras = lista.filter(c => c.noMeuEscopo === false);
  const opcao = c => `<option value="${Number(c.id)}">${escaparHtmlEbd(c.nome)}</option>`;
  const global = !cnlReferencias || cnlReferencias.escopoGlobal;
  return `<option value="">${escaparHtmlEbd(placeholder)}</option>`
    + (meus.length ? `<optgroup label="${global ? "Congregações" : "No meu escopo"}">${meus.map(opcao).join("")}</optgroup>` : "")
    + (outras.length ? `<optgroup label="Fora do meu escopo">${outras.map(opcao).join("")}</optgroup>` : "");
}
function cnlPreencherSeletores() {
  const cat = cnlCatalogos || { plataformas: [], categorias: [], temasFocados: [], escopos: [], vinculos: [], motivosTroca: [], areaCegaSituacoes: [] };
  const ref = cnlReferencias || { areas: [], departamentos: [] };
  cnlPreencherSelect("cnlFiltroCategoria", cnlOpcoesHtml(cat.categorias, c => c.codigo, c => c.rotulo, "Todas as categorias"));
  cnlPreencherSelect("cnlCPlataforma", cnlOpcoesHtml(cat.plataformas, p => p.codigo, p => p.rotulo, "— escolha a plataforma —"));
  cnlPreencherSelect("cnlCTema", cnlOpcoesHtml(cat.temasFocados, t => t.codigo, t => `${t.rotulo}${t.artigo ? ` (${t.artigo})` : ""}`, "— escolha o tema —"));
  cnlPreencherSelect("cnlCEscopo", cnlOpcoesHtml(cat.escopos, e => e.codigo, e => e.rotulo));
  cnlPreencherSelect("cnlCVinculo", cnlOpcoesHtml(cat.vinculos, v => v.codigo, v => v.rotulo, "— escolha o vínculo —"));
  cnlPreencherSelect("cnlCCongregacao", cnlOpcoesCongregacao("— escolha a congregação —"));
  cnlPreencherSelect("cnlCArea", cnlOpcoesHtml(ref.areas, a => a.id, a => a.nome, "— escolha a Área —"));
  cnlPreencherSelect("cnlCDepto", cnlOpcoesHtml(ref.departamentos, d => d.id, d => `${d.sigla} — ${d.nome}`, "— escolha o departamento —"));
  cnlPreencherSelect("cnlTrocaMotivo", cnlOpcoesHtml(cat.motivosTroca.filter(m => m.codigo === "SUSPEITA_INVASAO" || m.codigo === "ROTINA"), m => m.codigo, m => m.rotulo));
  cnlPreencherSelect("cnlTrAreaCega", cnlOpcoesHtml(cat.areaCegaSituacoes, s => s.codigo, s => s.rotulo));
  cnlAtualizarCategoriasForm();
  cnlCEscopoMudouAcao();
  cnlCCategoriaMudouAcao();
}

// ---- entrada da aba (gestão), pílulas internas ----
async function carregarOpcoesCanaisAcao() {
  cnlVerificarDono();
  if (!cnlPodeGestao()) return;
  await Promise.all([cnlGarantirCatalogos(), cnlGarantirReferencias()]);
  cnlPreencherSeletores();
  if (!CNL_SECOES.includes(cnlSecaoAtual)) cnlSecaoAtual = "painel";
  cnlMostrarSecaoAcao(cnlSecaoAtual);
}

// `semCarregar`: só troca a seção, sem buscar dados.
function cnlMostrarSecaoAcao(secao, semCarregar) {
  if (!cnlPodeGestao()) return;
  if (!CNL_SECOES.includes(secao)) secao = "painel";
  cnlSecaoAtual = secao;
  CNL_SECOES.forEach(nome => {
    const div = cnlEl(`cnlSecao${capitalize(nome)}`);
    if (div) div.style.display = nome === secao ? "block" : "none";
    const btn = cnlEl(`btnCnlSecao${capitalize(nome)}`);
    if (btn && btn.classList) btn.classList.toggle("ativo", nome === secao);
  });
  if (semCarregar) return;
  if (secao === "painel") cnlCarregarPainelAcao();
  else if (secao === "canais") cnlCarregarCanaisAcao();
  else if (secao === "ocorrencias") cnlCarregarOcorrenciasAcao();
  else if (secao === "senhas") cnlCarregarTrocasAcao();
  else if (secao === "transmissao") cnlCarregarTransmissaoAcao();
}
// -- a) Painel: cobertura dos canais --
async function cnlCarregarPainelAcao() {
  const aviso = cnlEl("cnlResultadoPainel");
  if (aviso) aviso.textContent = "Carregando o painel…";
  const data = await cnlObter("cobertura");
  const contadores = cnlEl("cnlContadores"), pendencias = cnlEl("cnlCanaisPendencia"), semCanal = cnlEl("cnlCongSemCanal");
  if (data.sucesso === false) {
    [contadores, pendencias, semCanal].forEach(el => { if (el) el.innerHTML = ""; });
    if (aviso) aviso.textContent = cnlMensagemErro(data);
    return;
  }
  if (aviso) aviso.textContent = "";
  const resumo = data.resumo || {};
  if (contadores) {
    contadores.innerHTML = CNL_CONTADORES.map(([chave, rotulo, tipo]) => {
      const valor = cnlNumero(resumo[chave]);
      return `<div class="cnl-contador${valor > 0 && tipo ? ` cnl-contador-${tipo}` : ""}"><span class="cnl-contador-valor">${valor}</span><span class="cnl-contador-rotulo">${rotulo}</span></div>`;
    }).join("");
  }
  const comPendencia = Array.isArray(data.canaisComPendencia) ? data.canaisComPendencia : [];
  if (pendencias) {
    pendencias.innerHTML = comPendencia.length
      ? comPendencia.map(c => `<div class="cal-cartao cartao-area-ebd">
          <h5>${escaparHtmlEbd(c.nome)} ${cnlSelo(CNL_SITUACAO_CANAL, c.situacao)} <span class="psc-legenda">${escaparHtmlEbd(c.rotuloPlataforma || "")}${c.rotuloEscopo ? ` · ${escaparHtmlEbd(c.rotuloEscopo)}` : ""}</span></h5>
          <ul class="cal-lista-simples">${(Array.isArray(c.pendencias) ? c.pendencias : []).map(p => `<li>${cnlSeloPendencia(p)} ${escaparHtmlEbd(p.mensagem)}</li>`).join("")}</ul>
          <div><button type="button" class="btn-link" data-on-click="cnlAbrirCanalAcao" data-args-click="${argsAttr(Number(c.canalId))}">🔎 Abrir o canal</button></div>
        </div>`).join("")
      : "<p class='subtitle'>Nenhum canal com pendência. 🎉</p>";
  }
  const congregacoes = (Array.isArray(data.congregacoes) ? data.congregacoes : []).filter(c => c.semCanal);
  if (semCanal) {
    semCanal.innerHTML = congregacoes.length
      ? `<ul class="cal-lista-simples">${congregacoes.map(c => `<li><strong>${escaparHtmlEbd(c.congregacaoNome)}</strong>${c.areaNome ? ` <span class="psc-legenda">(${escaparHtmlEbd(c.areaNome)})</span>` : ""}
          · transmissão: ${cnlSelo(CNL_SITUACAO_TRANSMISSAO, c.situacao)}
          <button type="button" class="btn-link" data-on-click="cnlRegistrarParaCongregacaoAcao" data-args-click="${argsAttr(Number(c.congregacaoId))}">➕ Registrar canal</button></li>`).join("")}</ul>`
      : "<p class='subtitle'>Todas as congregações têm canal próprio.</p>";
  }
}

// -- b) Canais: relação, cadastro e detalhe --
async function cnlCarregarCanaisAcao() {
  const aviso = cnlEl("cnlResultadoCanais"), tabela = cnlEl("cnlTabelaCanais");
  if (aviso) aviso.textContent = "Carregando os canais…";
  const data = await cnlObter(`canais${cnlMarcado("cnlFiltroInativos") ? "?todos=1" : ""}`);
  if (data.sucesso === false) {
    cnlCanais = []; cnlCanaisCarregados = false;
    if (aviso) aviso.textContent = "";
    if (tabela) tabela.innerHTML = `<p class="subtitle">${escaparHtmlEbd(cnlMensagemErro(data))}</p>`;
    return;
  }
  cnlCanais = Array.isArray(data.canais) ? data.canais : [];
  cnlCanaisCarregados = true;
  cnlPreencherSelect("cnlTrocaCanal", cnlOpcoesHtml(cnlCanais.filter(c => c.ativo !== false), c => c.canalId, c => `${c.nome} — ${c.rotuloPlataforma || ""}`, "— escolha o canal —"));
  cnlRedesenharCanaisAcao();
}
async function cnlGarantirCanais() {
  if (!cnlCanaisCarregados) await cnlCarregarCanaisAcao();
}

function cnlCanaisFiltrados() {
  const categoria = cnlTexto("cnlFiltroCategoria"), situacao = cnlTexto("cnlFiltroSituacao"), busca = cnlTexto("cnlFiltroBusca").toLowerCase();
  return cnlCanais.filter(c => {
    if (categoria && c.categoria !== categoria) return false;
    if (situacao === "INCOMPLETO" ? !c.cadastroIncompleto : (situacao && c.situacao !== situacao)) return false;
    if (busca && ![c.nome, c.identificador, c.rotuloPlataforma, c.rotuloEscopo].some(t => String(t || "").toLowerCase().includes(busca))) return false;
    return true;
  });
}
function cnlRedesenharCanaisAcao() {
  const tabela = cnlEl("cnlTabelaCanais"), aviso = cnlEl("cnlResultadoCanais");
  if (!tabela) return;
  const lista = cnlCanaisFiltrados();
  if (aviso) aviso.textContent = cnlCanais.length ? `${lista.length} de ${cnlCanais.length} canal(is).` : "";
  if (!cnlCanais.length) { tabela.innerHTML = "<p class='subtitle'>Nenhum canal registrado ainda. Use <em>Registrar canal</em> abaixo.</p>"; return; }
  if (!lista.length) { tabela.innerHTML = "<p class='subtitle'>Nenhum canal com esses filtros.</p>"; return; }
  tabela.innerHTML = `<table class="tabela-frequencia"><thead><tr><th>Canal</th><th>Categoria</th><th>Escopo</th><th>Situação</th><th>Administradores</th><th>Última conferência</th><th></th></tr></thead><tbody>
    ${lista.map(c => {
    const ativo = c.ativo !== false;
    const pendencias = Array.isArray(c.pendencias) ? c.pendencias : [];
    return `<tr class="${ativo ? "" : "cal-inativo"}">
      <td><strong>${escaparHtmlEbd(c.nome)}</strong>${c.cadastroIncompleto ? ` <span class="cal-selo cal-st-proposto">cadastro incompleto</span>` : ""}${ativo ? "" : ` <span class="cal-selo cal-st-cancelado">desativado</span>`}
        <br /><span class="psc-legenda">${escaparHtmlEbd(c.rotuloPlataforma || "")}${c.identificador ? ` · ${escaparHtmlEbd(c.identificador)}` : ""}</span></td>
      <td>${escaparHtmlEbd(c.rotuloCategoria || "")}${c.rotuloTema ? `<br /><span class="psc-legenda">${escaparHtmlEbd(c.rotuloTema)}</span>` : ""}</td>
      <td>${escaparHtmlEbd(c.rotuloEscopo || "")}</td>
      <td>${ativo ? cnlSelo(CNL_SITUACAO_CANAL, c.situacao) : "—"}${pendencias.length ? `<br /><span class="psc-legenda">${pendencias.length} pendência(s)</span>` : ""}</td>
      <td>${cnlNumero(c.administradoresAtivos)}</td>
      <td>${c.ultimaConferencia ? `${escaparHtmlEbd(calData(c.ultimaConferencia.em))} ${cnlSelo(CNL_RESULTADO_CONFERENCIA, c.ultimaConferencia.resultado)}` : "<span class='psc-alerta'>nunca</span>"}</td>
      <td><button type="button" class="btn-link" data-on-click="cnlAbrirCanalAcao" data-args-click="${argsAttr(Number(c.canalId))}">🔎 Abrir</button></td>
    </tr>`;
  }).join("")}
  </tbody></table>`;
}

// Formulário de cadastro: o que o servidor devolveu em catalogos manda nas opções.
function cnlPlataformaSelecionada() {
  const codigo = cnlTexto("cnlCPlataforma");
  return cnlCatalogos ? (cnlCatalogos.plataformas.find(p => p.codigo === codigo) || null) : null;
}
// Plataforma que não é grupo só admite canal institucional; as demais, todas as categorias (o servidor confere o resto).
function cnlAtualizarCategoriasForm() {
  const sel = cnlEl("cnlCCategoria");
  if (!sel) return;
  const todas = cnlCatalogos ? cnlCatalogos.categorias : [];
  const plataforma = cnlPlataformaSelecionada();
  const permitidas = plataforma && plataforma.grupo === false ? todas.filter(c => c.codigo === "INSTITUCIONAL") : todas;
  const atual = sel.value;
  sel.innerHTML = cnlOpcoesHtml(permitidas, c => c.codigo, c => `${c.rotulo}${c.artigo ? ` (${c.artigo})` : ""}`);
  if (atual && permitidas.some(c => c.codigo === atual)) sel.value = atual;
}
function cnlCPlataformaMudouAcao() {
  const plataforma = cnlPlataformaSelecionada();
  const [rotulo, exemplo, ajuda] = cnlDe(CNL_IDENT, plataforma ? plataforma.tipoIdent : "", null) || ["Identificador do canal", "", "Escolha a plataforma para ver como o identificador é escrito."];
  const rot = cnlEl("cnlCIdentRotulo"), campo = cnlEl("cnlCIdentificador"), aj = cnlEl("cnlCIdentAjuda");
  if (rot) rot.textContent = rotulo;
  if (campo) campo.placeholder = exemplo;
  if (aj) aj.textContent = ajuda + (plataforma && plataforma.grupo && plataforma.tipoIdent !== "nome" ? " Para GRUPO guarde o NOME, nunca o link de convite." : "");
  cnlAtualizarCategoriasForm();
  cnlCCategoriaMudouAcao();
  const custodia = cnlEl("cnlCBlocoCustodia"), caixa = cnlEl("cnlCCustodia");
  const semSenha = !!plataforma && plataforma.credencial === false;   // grupo/telefone fixo não têm senha para custodiar
  if (custodia) custodia.style.display = semSenha ? "none" : "";
  if (caixa && semSenha) caixa.checked = false;
}
function cnlCCategoriaMudouAcao() {
  const tema = cnlEl("cnlCBlocoTema");
  if (tema) tema.style.display = cnlTexto("cnlCCategoria") === "GRUPO_FOCADO" ? "block" : "none";
}
// v7.7 — o responsável com acesso (pai, mãe ou tutor) só existe em canal que inclui crianças/adolescentes: o campo aparece, e vale, só com a marca; sem ela, esvazia.
function cnlCMenoresMudouAcao() {
  const bloco = cnlEl("cnlCBlocoResponsavel"), campo = cnlEl("cnlCResponsavel");
  const marcado = cnlMarcado("cnlCMenores");
  if (bloco) bloco.style.display = marcado ? "block" : "none";
  if (campo && !marcado) campo.value = "";
}
function cnlCEscopoMudouAcao() {
  const escopo = cnlTexto("cnlCEscopo");
  [["cnlCBlocoCongregacao", "CONGREGACAO"], ["cnlCBlocoArea", "AREA"], ["cnlCBlocoDepto", "DEPARTAMENTO"]].forEach(([id, valor]) => {
    const bloco = cnlEl(id);
    if (bloco) bloco.style.display = escopo === valor ? "block" : "none";
  });
}

function cnlLimparFormCanalAcao() {
  ["cnlCCanalId", "cnlCNome", "cnlCIdentificador", "cnlCDescricao", "cnlCPlataforma", "cnlCTema", "cnlCVinculo", "cnlCCongregacao", "cnlCArea", "cnlCDepto", "cnlCResponsavel"].forEach(id => {
    const el = cnlEl(id);
    if (el) el.value = "";
  });
  ["cnlCDeclaracao", "cnlCMenores", "cnlCPublico", "cnlCCustodia"].forEach(id => { const el = cnlEl(id); if (el) el.checked = false; });
  const escopo = cnlEl("cnlCEscopo"), categoria = cnlEl("cnlCCategoria");
  if (escopo) escopo.value = "CAMPO";
  if (categoria) categoria.value = "INSTITUCIONAL";
  cnlCPlataformaMudouAcao();
  cnlCEscopoMudouAcao();
  cnlCMenoresMudouAcao();
  const titulo = cnlEl("cnlFormCanalTitulo"), botao = cnlEl("cnlCBotaoSalvar"), resultado = cnlEl("cnlCResultado");
  if (titulo) titulo.textContent = "➕ Registrar canal";
  if (botao) botao.textContent = "💾 Registrar canal";
  if (resultado) resultado.textContent = "";
}

// Corpo de POST canais / canais/atualizar. A declaração de titularidade institucional é obrigatória (Estatuto Art. 12).
function cnlCorpoCanal() {
  const nome = cnlTexto("cnlCNome"), plataforma = cnlTexto("cnlCPlataforma"), categoria = cnlTexto("cnlCCategoria");
  const identificador = cnlTexto("cnlCIdentificador"), vinculo = cnlTexto("cnlCVinculo"), escopo = cnlTexto("cnlCEscopo"), descricao = cnlTexto("cnlCDescricao");
  if (nome.length < 3 || nome.length > 150) return { problema: "O nome do canal deve ter de 3 a 150 caracteres." };
  if (!plataforma) return { problema: "Escolha a plataforma do canal." };
  if (!categoria) return { problema: "Escolha a categoria do canal." };
  if (categoria === "GRUPO_FOCADO" && !cnlTexto("cnlCTema")) return { problema: "Informe o tema do grupo focado (Art. 160, §6º)." };
  if (!identificador) return { problema: "Informe o identificador do canal (número, @perfil, endereço ou nome)." };
  if (!vinculo) return { problema: "Informe o vínculo institucional da conta (CNPJ, marca ou estrutura da IEADESPA)." };
  if (!cnlMarcado("cnlCDeclaracao")) return { problema: "Confirme que a conta ou o número está em nome da IEADESPA e NÃO é de titularidade pessoal (Estatuto Art. 12)." };
  if (descricao.length > 500) return { problema: "A descrição aceita até 500 caracteres." };
  const corpo = {
    nome, plataforma, categoria, identificador, vinculoInstitucional: vinculo, declaracaoInstitucional: true, escopo,
    incluiMenores: cnlMarcado("cnlCMenores"), publicoNoSite: cnlMarcado("cnlCPublico"), custodiaSecretaria: cnlMarcado("cnlCCustodia")
  };
  if (categoria === "GRUPO_FOCADO") corpo.temaFocado = cnlTexto("cnlCTema");
  // v7.7: o responsável com acesso vai SEMPRE (vazio = null), para que desmarcar "inclui menores" ou apagar o campo também limpe o que estava gravado. O servidor confere que é membro ativo e adulto.
  corpo.responsavelAcessoMembroId = null;
  const responsavel = corpo.incluiMenores ? cnlTexto("cnlCResponsavel") : "";
  if (responsavel) {
    if (!/^\d{1,10}$/.test(responsavel) || Number(responsavel) < 1) return { problema: "A matrícula do responsável com acesso precisa ser um número inteiro positivo (ou ficar em branco)." };
    corpo.responsavelAcessoMembroId = Number(responsavel);
  }
  const alvo = { CONGREGACAO: ["cnlCCongregacao", "congregacaoId", "Escolha a congregação do canal."], AREA: ["cnlCArea", "areaId", "Escolha a Área do canal."], DEPARTAMENTO: ["cnlCDepto", "departamentoId", "Escolha o departamento do canal."] }[escopo];
  if (alvo) {
    const id = numeroDoCampo(alvo[0]);
    if (!Number.isInteger(id) || id <= 0) return { problema: alvo[2] };
    corpo[alvo[1]] = id;
  }
  if (descricao) corpo.descricao = descricao;
  return { corpo };
}

async function cnlSalvarCanalAcao() {
  if (cnlAcaoEmCurso) return;
  const { corpo, problema } = cnlCorpoCanal();
  if (problema) { mostrarToast(problema, "erro"); return; }
  const canalId = numeroDoCampo("cnlCCanalId");
  cnlAcaoEmCurso = true;
  try {
    const data = await cnlPostar(canalId ? "canais/atualizar" : "canais", canalId ? { canalId, ...corpo } : corpo);
    mostrarResultadoCnl(data, "cnlCResultado");   // recusa do servidor (conta pessoal, duplicidade...) aparece tal qual
    if (data.sucesso === false) return;
    const aviso = cnlEl("cnlResultadoCanais");
    if (aviso) aviso.textContent = cnlMensagemErro(data);
    const idCanal = canalId || Number(data.canalId) || 0;
    cnlLimparFormCanalAcao();
    const detalhes = cnlEl("cnlFormCanalDetalhes");
    if (detalhes) detalhes.open = false;
    await cnlCarregarCanaisAcao();
    if (idCanal) await cnlAbrirCanalAcao(idCanal);
  } finally {
    cnlAcaoEmCurso = false;
  }
}

// Edição / "completar cadastro" (canal legado): o formulário vem preenchido com o que o servidor já tem.
function cnlEditarCanalAcao() {
  const c = cnlCanalAberto && cnlCanalAberto.canal;
  if (!c) return;
  const preencher = (id, valor) => { const el = cnlEl(id); if (el) el.value = valor == null ? "" : String(valor); };
  cnlMostrarSecaoAcao("canais", true);
  cnlLimparFormCanalAcao();
  preencher("cnlCCanalId", c.canalId);
  preencher("cnlCNome", c.nome);
  preencher("cnlCPlataforma", c.plataforma);
  cnlCPlataformaMudouAcao();
  preencher("cnlCCategoria", c.categoria);
  preencher("cnlCTema", c.temaFocado);
  cnlCCategoriaMudouAcao();
  preencher("cnlCIdentificador", c.identificador);
  preencher("cnlCVinculo", c.vinculoInstitucional);
  preencher("cnlCEscopo", c.escopo);
  preencher("cnlCCongregacao", c.congregacaoId);
  preencher("cnlCArea", c.areaId);
  preencher("cnlCDepto", c.departamentoId);
  cnlCEscopoMudouAcao();
  preencher("cnlCDescricao", c.descricao);
  [["cnlCMenores", c.incluiMenores], ["cnlCPublico", c.publicoNoSite], ["cnlCCustodia", c.custodiaSecretaria]].forEach(([id, valor]) => { const el = cnlEl(id); if (el) el.checked = !!valor; });
  preencher("cnlCResponsavel", c.responsavelAcessoMembroId);
  cnlCMenoresMudouAcao();
  const declarado = cnlEl("cnlCDeclaracao");
  if (declarado) declarado.checked = false;   // a declaração é um ato de quem salva: sempre marcada de novo
  const titulo = cnlEl("cnlFormCanalTitulo"), botao = cnlEl("cnlCBotaoSalvar"), detalhes = cnlEl("cnlFormCanalDetalhes");
  if (titulo) titulo.textContent = c.cadastroIncompleto ? `✏️ Completar o cadastro de “${c.nome}”` : `✏️ Editar o canal “${c.nome}”`;
  if (botao) botao.textContent = "💾 Salvar alterações";
  if (detalhes) detalhes.open = true;
  cnlRolarPara("cnlFormCanalDetalhes");
}

// "Congregações sem canal próprio" → abre o cadastro já com a congregação escolhida.
function cnlRegistrarParaCongregacaoAcao(congregacaoId) {
  const id = Number(congregacaoId);
  if (!id) return;
  cnlMostrarSecaoAcao("canais");
  cnlLimparFormCanalAcao();
  const escopo = cnlEl("cnlCEscopo"), cong = cnlEl("cnlCCongregacao"), detalhes = cnlEl("cnlFormCanalDetalhes");
  if (escopo) escopo.value = "CONGREGACAO";
  if (cong) cong.value = String(id);
  cnlCEscopoMudouAcao();
  if (detalhes) detalhes.open = true;
  cnlRolarPara("cnlFormCanalDetalhes");
}

async function cnlAbrirCanalAcao(canalId, manterPosicao) {
  const id = Number(canalId);
  if (!id) return;
  cnlMostrarSecaoAcao("canais", true);
  if (!cnlCanaisCarregados) cnlCarregarCanaisAcao();
  const container = cnlEl("cnlDetalheCanal");
  const mudou = !cnlCanalAberto || Number(cnlCanalAberto.canal.canalId) !== id;
  const data = await cnlObter(`canal?canalId=${id}`);
  if (data.sucesso === false || !data.canal) {
    cnlCanalAberto = null;
    if (container) container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(cnlMensagemErro(data))}</p>`;
    if (!manterPosicao) cnlRolarPara("cnlDetalheCanal");
    return;
  }
  cnlCanalAberto = data;
  if (mudou) {
    const msg = cnlEl("cnlResultadoDetalheCanal");
    if (msg) { msg.textContent = ""; msg.className = "subtitle"; }
  }
  if (container) container.innerHTML = cnlRenderDetalheCanal(data);
  if (!manterPosicao) cnlRolarPara("cnlDetalheCanal");
}

function cnlCampo(rotulo, html) { return html ? `<div><dt>${rotulo}</dt><dd>${html}</dd></div>` : ""; }

// v7.7 — o responsável com acesso ao grupo (o nome só chega à gestão). `r` = { membroId, nome, ativo, adulto } | null; `id` = a matrícula gravada no canal.
function cnlHtmlResponsavel(r, id) {
  if (!id) return "<span class='psc-alerta'>Ainda não indicado</span>";
  if (!r) return `matrícula ${cnlNumero(id)}`;
  const aviso = r.ativo === true && r.adulto === true ? "" : " <span class='psc-alerta'>(não é mais membro ativo e adulto: indique outro)</span>";
  return `${escaparHtmlEbd(r.nome || "—")} (matrícula ${cnlNumero(r.membroId)})${aviso}`;
}

function cnlRenderDetalheCanal(data) {
  const c = data.canal || {};
  const id = Number(c.canalId);
  const ativo = c.ativo !== false;
  const lista = (v) => (Array.isArray(v) ? v : []);
  const pendencias = lista(data.pendencias), admins = lista(data.administradores), trocas = lista(data.trocasAbertas);
  const conferencias = lista(data.conferencias), itens = lista(data.itensConferencia), ocorrencias = lista(data.ocorrenciasRecentes);
  const orient = data.orientacoes || {};
  const papeis = cnlCatalogos ? cnlCatalogos.papeisAdmin : [];

  const faltas = [];
  if (!c.plataforma) faltas.push("a plataforma");
  if (!c.identificador) faltas.push("o identificador (número, @perfil, endereço ou nome)");
  if (!c.vinculoInstitucional) faltas.push("o vínculo institucional");
  if (!c.declaradoInstitucionalEm) faltas.push("a declaração de que a conta está em nome da IEADESPA (Estatuto Art. 12)");
  const incompleto = c.cadastroIncompleto ? `<div class="cnl-incompleto"><strong>Cadastro incompleto.</strong> Falta registrar ${faltas.length ? faltas.map(escaparHtmlEbd).join("; ") : "dado do cadastro"}.
      Canal antigo, anterior às regras do Estatuto Art. 12: complete o cadastro para que ele volte a valer como Canal Oficial.
      <button type="button" class="btn-confirmar" style="width:auto;margin:6px 0 0;" data-on-click="cnlEditarCanalAcao">✏️ Completar cadastro</button></div>` : "";

  const campos = [
    cnlCampo("Identificador", c.identificador ? `<span class="cal-code">${escaparHtmlEbd(c.identificador)}</span> ${cnlLinkHttps(c.link, "abrir o canal")}` : ""),
    cnlCampo("Escopo", escaparHtmlEbd(c.rotuloEscopo || "")),
    cnlCampo("Vínculo institucional", c.rotuloVinculo ? escaparHtmlEbd(c.rotuloVinculo) : ""),
    cnlCampo("Declaração de titularidade", c.declaradoInstitucionalEm ? `Em nome da IEADESPA, declarado em ${escaparHtmlEbd(calDataHora(c.declaradoInstitucionalEm))}` : ""),
    cnlCampo("Senha sob custódia da Secretaria", c.exigeCustodia ? (c.custodiaSecretaria ? "Sim" : "<span class='psc-alerta'>Ainda não confirmada</span>") : "Não se aplica (sem senha)"),
    cnlCampo("Última troca de senha", c.ultimaTrocaCredencialEm ? escaparHtmlEbd(calData(c.ultimaTrocaCredencialEm)) : ""),
    cnlCampo("Inclui crianças/adolescentes", c.incluiMenores ? "Sim (Art. 160, §5º)" : "Não"),
    cnlCampo("Responsável com acesso ao grupo", c.incluiMenores ? cnlHtmlResponsavel(data.responsavelAcesso, c.responsavelAcessoMembroId) : ""),
    cnlCampo("Aparece no site", c.publicoNoSite ? "Sim" : "Não"),
    cnlCampo("Serve ao Abandono Digital", c.contaParaAbandono ? "Sim (contato individual institucional)" : "Não"),
    cnlCampo("Vigente desde", c.vigenteDesde ? escaparHtmlEbd(calData(c.vigenteDesde)) : ""),
    cnlCampo("Vigente até", c.vigenteAte ? escaparHtmlEbd(calData(c.vigenteAte)) : ""),
    cnlCampo("Motivo da desativação", c.desativadoMotivo ? escaparHtmlEbd(c.desativadoMotivo) : ""),
    cnlCampo("Descrição", c.descricao ? escaparHtmlEbd(c.descricao) : "")
  ].join("");

  const blocoPendencias = pendencias.length
    ? `<h5>⚠️ Pendências</h5><ul class="cal-lista-simples">${pendencias.map(p => `<li>${cnlSeloPendencia(p)} ${escaparHtmlEbd(p.mensagem)}</li>`).join("")}</ul>`
    : (ativo ? "<p class='subtitle'>Nenhuma pendência: o canal está regular.</p>" : "");

  const linhasAdmin = admins.map(a => {
    const adminId = Number(a.adminId);
    return `<tr>
      <td><strong>${escaparHtmlEbd(a.nome)}</strong></td><td>${Number(a.membroId)}</td>
      <td>${escaparHtmlEbd(cnlRotuloDoCatalogo(papeis, a.papel))}</td>
      <td>${a.termoAceitoEm ? `✅ aceito (versão ${cnlNumero(a.termoVersaoAceita)}) em ${escaparHtmlEbd(calDataHora(a.termoAceitoEm))}` : "<span class='psc-alerta'>⏳ ainda não aceitou</span>"}${a.aptoMenores === false ? "<br /><span class='psc-alerta'>⚠️ não está habilitado para servir com menores</span>" : ""}</td>
      <td>${a.designadoEm ? escaparHtmlEbd(calData(a.designadoEm)) : "—"}</td>
      <td><button type="button" class="btn-link btn-link-perigo" data-on-click="cnlAbrirFormEncerrarAcao" data-args-click="${argsAttr(adminId)}">Encerrar…</button><div id="cnlEncForm_${adminId}"></div></td>
    </tr>`;
  }).join("");
  const blocoAdmins = `<h5>👤 Administradores</h5>
    <p class="psc-legenda" style="margin-top:0;">A designação só vale de fato depois que a pessoa aceita o Termo de Dever de Moderação (em Meu Painel → Canais).</p>
    ${admins.length
    ? `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Matrícula</th><th>Papel</th><th>Termo de Dever de Moderação</th><th>Designado em</th><th></th></tr></thead><tbody>${linhasAdmin}</tbody></table></div>`
    : "<p class='subtitle'>Nenhum administrador designado.</p>"}
    ${ativo ? `<div class="barra-lista">
      <input type="number" id="cnlDesMembro" min="1" placeholder="Matrícula" style="max-width:130px;min-width:100px;" />
      <select id="cnlDesPapel">${cnlOpcoesHtml(papeis, p => p.codigo, p => p.rotulo)}</select>
      <button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="cnlDesignarAdminAcao">➕ Designar</button>
    </div>` : ""}`;

  // v7.7: grupo com crianças/adolescentes — o responsável (pai, mãe ou tutor) com acesso ao grupo. Indicar e retirar usam a rota canais/responsavel-acesso.
  const blocoResponsavel = ativo && c.incluiMenores ? `<h5>👪 Responsável com acesso ao grupo</h5>
    <p class="psc-legenda" style="margin-top:0;">Pai, mãe ou tutor de um dos menores, membro ativo e adulto, que tem acesso ao grupo. Sem ele, o canal fica irregular.</p>
    <div class="barra-lista">
      <input type="number" id="cnlRespMembro" min="1" step="1" placeholder="Matrícula" value="${c.responsavelAcessoMembroId ? cnlNumero(c.responsavelAcessoMembroId) : ""}" style="max-width:130px;min-width:100px;" />
      <button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="cnlSalvarResponsavelAcao">💾 Indicar</button>
      ${c.responsavelAcessoMembroId ? `<button type="button" class="btn-link btn-link-perigo" data-on-click="cnlRetirarResponsavelAcao">Retirar</button>` : ""}
    </div>` : "";

  const orientacoes = [
    orient.modeloTermoDeUso ? `<div class="cnl-modelo"><strong>Modelo de Termo de Uso do grupo oficial</strong> (Art. 160, §1º, III) — cole na descrição do grupo:<p>${escaparHtmlEbd(orient.modeloTermoDeUso)}</p>${cnlBotaoCopiar(orient.modeloTermoDeUso, "Copiar o modelo de Termo de Uso")}</div>` : "",
    orient.avisoAtencao ? `<div class="cnl-modelo"><strong>Aviso de Atenção do grupo focado</strong> (Art. 160, §6º, II) — cole na descrição do grupo:<p>${escaparHtmlEbd(orient.avisoAtencao)}</p>${cnlBotaoCopiar(orient.avisoAtencao, "Copiar o Aviso de Atenção")}</div>` : ""
  ].join("");

  const blocoConferencia = ativo ? `<h5>✅ Conferência de conformidade</h5>
    ${itens.length ? itens.map((it, i) => `<div class="cnl-item-conf"><div><strong>${escaparHtmlEbd(it.texto)}</strong> <span class="psc-legenda">(${escaparHtmlEbd(it.artigo || "")})</span></div>
        <label class="cal-check"><input type="radio" name="cnlConfItem_${i}" id="cnlConfSim_${i}" /> Sim</label>
        <label class="cal-check"><input type="radio" name="cnlConfItem_${i}" id="cnlConfNao_${i}" /> Não</label></div>`).join("") : "<p class='subtitle'>Nenhum item de conferência se aplica a este canal.</p>"}
    <label for="cnlConfObs" class="psc-legenda">Observação (obrigatória se algum item for “Não”; até 300 caracteres)</label>
    <textarea id="cnlConfObs" rows="2" maxlength="300" style="width:100%;"></textarea>
    <div class="psc-acoes"><button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="cnlRegistrarConferenciaAcao">✅ Registrar conferência</button></div>` : "";
  const blocoHistorico = conferencias.length
    ? `<h5>🕘 Últimas conferências</h5><ul class="cal-lista-simples">${conferencias.map(f => {
      const nao = itens.filter(it => f.itens && f.itens[it.codigo] === false).map(it => it.texto);
      return `<li>${escaparHtmlEbd(calDataHora(f.em))} ${cnlSelo(CNL_RESULTADO_CONFERENCIA, f.resultado)} por ${escaparHtmlEbd(f.porNome || "—")}${nao.length ? ` — itens “Não”: ${nao.map(escaparHtmlEbd).join("; ")}` : ""}${f.observacao ? ` — ${escaparHtmlEbd(f.observacao)}` : ""}</li>`;
    }).join("")}</ul>` : "";

  const blocoOcorrencias = ocorrencias.length
    ? `<h5>⏳ Ocorrências recentes</h5>${ocorrencias.map(o => `<div class="cnl-linha-oc">${cnlHtmlFaseOcorrencia(o)} <strong>${escaparHtmlEbd(o.rotuloCategoria || o.categoria)}</strong> · ${escaparHtmlEbd(calData(o.relatadaEm))}
        <button type="button" class="btn-link" data-on-click="cnlAbrirOcorrenciaAcao" data-args-click="${argsAttr(Number(o.ocorrenciaId), "G")}">🔎 Abrir</button></div>`).join("")}` : "";

  const botoes = [
    `<button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="cnlEditarCanalAcao">✏️ Editar</button>`,
    ativo ? `<button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="cnlAbrirFormCanalAcao" data-args-click="${argsAttr("desativar")}">⛔ Desativar…</button>`
      : `<button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="cnlReativarCanalAcao">♻️ Reativar</button>`,
    `<button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="cnlAbrirCanalAcao" data-args-click="${argsAttr(id, true)}">🔄 Atualizar</button>`
  ].join("");

  return `<div class="cal-cartao cartao-area-ebd">
    <h4>${escaparHtmlEbd(c.nome)}</h4>
    <p>${escaparHtmlEbd(c.rotuloPlataforma || "")} · ${escaparHtmlEbd(c.rotuloCategoria || "")}${c.rotuloTema ? ` (${escaparHtmlEbd(c.rotuloTema)})` : ""}
      ${ativo ? cnlSelo(CNL_SITUACAO_CANAL, data.situacao) : `<span class="cal-selo cal-st-cancelado">⛔ desativado</span>`}
      ${c.cadastroIncompleto ? `<span class="cal-selo cal-st-proposto">cadastro incompleto</span>` : ""} <span class="psc-legenda">nº ${id}</span></p>
    ${incompleto}
    <dl class="cal-dl">${campos}</dl>
    ${blocoPendencias}
    ${trocas.length ? `<p class="psc-aviso">Há ${trocas.length} pendência(s) de troca de senha/acesso em aberto — veja em <em>Senhas e acessos</em>.</p>` : ""}
    ${blocoAdmins}
    ${blocoResponsavel}
    ${orientacoes}
    ${blocoConferencia}
    ${blocoHistorico}
    ${blocoOcorrencias}
    <div class="psc-acoes">${botoes}</div>
    <div id="cnlFormAcaoCanal"></div>
  </div>`;
}

// Ações dentro do cartão do canal (todas gravam e depois recarregam o detalhe e a relação).
async function cnlAposAcaoCanal(canalId) {
  await cnlAbrirCanalAcao(canalId, true);
  if (cnlCanaisCarregados) cnlCarregarCanaisAcao();
}
async function cnlExecutarAcaoCanal(rota, corpoExtra, confirmacao) {
  const c = cnlCanalAberto && cnlCanalAberto.canal;
  if (!c || cnlAcaoEmCurso) return false;
  if (confirmacao && !confirm(confirmacao)) return false;
  const canalId = Number(c.canalId);
  cnlAcaoEmCurso = true;
  try {
    const data = await cnlPostar(rota, { canalId, ...corpoExtra });
    mostrarResultadoCnl(data, "cnlResultadoDetalheCanal");
    if (data.sucesso === false) return false;
    await cnlAposAcaoCanal(canalId);
    return true;
  } finally {
    cnlAcaoEmCurso = false;
  }
}

async function cnlDesignarAdminAcao() {
  const membroId = numeroDoCampo("cnlDesMembro"), papel = cnlTexto("cnlDesPapel");
  if (!Number.isInteger(membroId) || membroId <= 0) { mostrarToast("Informe a matrícula de quem vai administrar o canal.", "erro"); return; }
  if (!papel) { mostrarToast("Escolha o papel (Administrador ou Operador da conta).", "erro"); return; }
  await cnlExecutarAcaoCanal("administradores/designar", { membroId, papel });
}
// v7.7 — indica o responsável com acesso ao grupo (pai, mãe ou tutor). O servidor confere: membro ativo e adulto; canal ativo e que inclui menores.
async function cnlSalvarResponsavelAcao() {
  const membroId = numeroDoCampo("cnlRespMembro");
  if (!Number.isInteger(membroId) || membroId <= 0) { mostrarToast("Informe a matrícula do responsável (pai, mãe ou tutor) com acesso ao grupo.", "erro"); return; }
  await cnlExecutarAcaoCanal("canais/responsavel-acesso", { membroId });
}
async function cnlRetirarResponsavelAcao() {
  await cnlExecutarAcaoCanal("canais/responsavel-acesso", { membroId: null }, "Retirar o responsável com acesso? O canal fica irregular até que outro seja indicado.");
}
function cnlAbrirFormEncerrarAcao(adminId) {
  const id = Number(adminId);
  const area = cnlEl(`cnlEncForm_${id}`);
  if (!area) return;
  area.innerHTML = `<div class="cal-form-inline">
    <p class="psc-aviso">Encerrar a designação abre a pendência de <strong>troca de senha e acesso</strong> do canal: quem saiu pode ainda ter o acesso.</p>
    <label for="cnlEncMotivo_${id}">Motivo (5 a 200 caracteres)</label>
    <textarea id="cnlEncMotivo_${id}" rows="2" maxlength="200" style="width:100%;"></textarea>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar btn-perigo" style="width:auto;margin:0;" data-on-click="cnlEncerrarAdminAcao" data-args-click="${argsAttr(id)}">Encerrar a designação</button>
      <button type="button" class="btn-link" data-on-click="cnlFecharFormEncerrarAcao" data-args-click="${argsAttr(id)}">cancelar</button>
    </div>
  </div>`;
}
function cnlFecharFormEncerrarAcao(adminId) {
  const area = cnlEl(`cnlEncForm_${Number(adminId)}`);
  if (area) area.innerHTML = "";
}
async function cnlEncerrarAdminAcao(adminId) {
  const id = Number(adminId);
  const motivo = cnlTexto(`cnlEncMotivo_${id}`);
  if (motivo.length < 5 || motivo.length > 200) { mostrarToast("Informe o motivo do encerramento (de 5 a 200 caracteres).", "erro"); return; }
  await cnlExecutarAcaoCanal("administradores/encerrar", { adminId: id, motivo }, "Encerrar esta designação? Será aberta a pendência de troca de senha e acesso do canal.");
}

async function cnlRegistrarConferenciaAcao() {
  const detalhe = cnlCanalAberto;
  if (!detalhe) return;
  const itens = Array.isArray(detalhe.itensConferencia) ? detalhe.itensConferencia : [];
  const respostas = {};
  let algumNao = false;
  for (let i = 0; i < itens.length; i++) {
    const sim = cnlMarcado(`cnlConfSim_${i}`), nao = cnlMarcado(`cnlConfNao_${i}`);
    if (!sim && !nao) { mostrarToast("Responda todos os itens da conferência (Sim ou Não).", "erro"); return; }
    respostas[itens[i].codigo] = sim;
    if (!sim) algumNao = true;
  }
  const observacao = cnlTexto("cnlConfObs");
  if (observacao.length > 300) { mostrarToast("A observação aceita até 300 caracteres.", "erro"); return; }
  if (algumNao && observacao.length < 5) { mostrarToast("Há item marcado como “Não”: descreva o que precisa ser corrigido (observação obrigatória, mínimo 5 caracteres).", "erro"); return; }
  const corpo = { itens: respostas };
  if (observacao) corpo.observacao = observacao;
  await cnlExecutarAcaoCanal("conferencias", corpo);
}

function cnlAbrirFormCanalAcao(tipoAcao) {
  const area = cnlEl("cnlFormAcaoCanal");
  if (!area || !cnlCanalAberto) return;
  if (tipoAcao === "desativar") {
    area.innerHTML = `<div class="cal-form-inline">
      <p class="psc-aviso">Desativar tira o canal da relação vigente; o histórico (inclusive as tentativas de contato já registradas) é preservado. Resolva antes as ocorrências abertas do canal.</p>
      <label for="cnlDesativarMotivo">Motivo da desativação (5 a 300 caracteres)</label>
      <textarea id="cnlDesativarMotivo" rows="2" maxlength="300" style="width:100%;"></textarea>
      <div class="psc-acoes">
        <button type="button" class="btn-confirmar btn-perigo" style="width:auto;margin:0;" data-on-click="cnlDesativarCanalAcao">⛔ Desativar o canal</button>
        <button type="button" class="btn-link" data-on-click="cnlFecharFormAcaoCanal">cancelar</button>
      </div>
    </div>`;
  }
}
function cnlFecharFormAcaoCanal() {
  const area = cnlEl("cnlFormAcaoCanal");
  if (area) area.innerHTML = "";
}
async function cnlDesativarCanalAcao() {
  const motivo = cnlTexto("cnlDesativarMotivo");
  if (motivo.length < 5 || motivo.length > 300) { mostrarToast("Informe o motivo da desativação (de 5 a 300 caracteres).", "erro"); return; }
  const c = cnlCanalAberto && cnlCanalAberto.canal;
  await cnlExecutarAcaoCanal("canais/desativar", { motivo }, `Desativar o canal "${c ? c.nome : ""}"?`);
}
async function cnlReativarCanalAcao() {
  const c = cnlCanalAberto && cnlCanalAberto.canal;
  await cnlExecutarAcaoCanal("canais/reativar", {}, `Reativar o canal "${c ? c.nome : ""}"?`);
}
// -- c) Ocorrências — Regra das 24 Horas. As mesmas funções servem a duas visões: G = gestão (vê quem
//    avisou, se o servidor mandar) e M = Meu Painel (administrador do canal: nunca vê quem avisou). --
const CNL_CTX = {
  G: { detalhe: "cnlDetalheOcorrenciaG", mensagem: "cnlResultadoDetalheOc" },
  M: { detalhe: "cnlDetalheOcorrenciaM", mensagem: "cnlMeuResultadoAcao" }
};
function cnlContexto(bruto) { return bruto === "M" ? "M" : "G"; }

function cnlRenderCartaoOcorrencia(o, ctxBruto) {
  const ctx = cnlContexto(ctxBruto);
  const id = Number(o.ocorrenciaId);
  const fase = String(o.fase || o.status || "").toLowerCase().replace(/[^a-z_]/g, "");
  const [rotuloGravidade, classeGravidade] = cnlDe(CNL_GRAVIDADE, o.gravidade, null) || ["", "cal-st-cancelado"];
  const quem = ctx === "G" && o.relatadaPorNome ? ` · avisou: ${escaparHtmlEbd(o.relatadaPorNome)}` : "";
  return `<div class="cal-cartao cartao-area-ebd cnl-oc cnl-oc-${escaparHtmlEbd(fase)}">
    <div class="cnl-oc-topo">${cnlHtmlFaseOcorrencia(o)}</div>
    <h5>${escaparHtmlEbd(o.rotuloCategoria || o.categoria)} ${rotuloGravidade ? `<span class="cal-selo ${escaparHtmlEbd(classeGravidade)}">${escaparHtmlEbd(rotuloGravidade)}</span>` : ""}</h5>
    <p class="psc-legenda" style="margin:2px 0;">Canal: <strong>${escaparHtmlEbd(o.canalNome || "")}</strong> · aviso em ${escaparHtmlEbd(calDataHora(o.relatadaEm))} · prazo até ${escaparHtmlEbd(calDataHora(o.prazoRemocaoEm))}${quem}</p>
    <p style="margin:6px 0;">${escaparHtmlEbd(o.descricao)}</p>
    <div><button type="button" class="btn-link" data-on-click="cnlAbrirOcorrenciaAcao" data-args-click="${argsAttr(id, String(ctx))}">🔎 Abrir</button></div>
  </div>`;
}

async function cnlCarregarOcorrenciasAcao() {
  const status = cnlTexto("cnlFiltroOcStatus");
  const aviso = cnlEl("cnlResultadoOcorrencias"), lista = cnlEl("cnlListaOcorrencias");
  if (aviso) aviso.textContent = "Carregando as ocorrências…";
  const data = await cnlObter(`ocorrencias${status ? `?status=${encodeURIComponent(status)}` : ""}`);
  if (data.sucesso === false) {
    cnlOcorrenciasG = [];
    if (aviso) aviso.textContent = "";
    if (lista) lista.innerHTML = `<p class="subtitle">${escaparHtmlEbd(cnlMensagemErro(data))}</p>`;
    return;
  }
  cnlOcorrenciasG = Array.isArray(data.ocorrencias) ? data.ocorrencias : [];
  cnlRedesenharOcorrenciasAcao();
}
function cnlRedesenharOcorrenciasAcao() {
  const aviso = cnlEl("cnlResultadoOcorrencias"), lista = cnlEl("cnlListaOcorrencias");
  if (!lista) return;
  const soVencidas = cnlMarcado("cnlFiltroOcVencidas");
  const visiveis = cnlOcorrenciasG.filter(o => !soVencidas || o.fase === "VENCIDA");
  const vencidas = cnlOcorrenciasG.filter(o => o.fase === "VENCIDA").length;
  if (aviso) aviso.textContent = cnlOcorrenciasG.length ? `${visiveis.length} ocorrência(s)${vencidas ? ` — ${vencidas} com o prazo VENCIDO (a Igreja está corresponsável)` : ""}.` : "";
  lista.innerHTML = visiveis.length ? visiveis.map(o => cnlRenderCartaoOcorrencia(o, "G")).join("") : "<p class='subtitle'>Nenhuma ocorrência encontrada.</p>";
  cnlIniciarContagem();
}

function cnlIdDaOcorrenciaAberta(ctx) {
  const d = cnlOcorrenciaAberta[ctx];
  return d && d.ocorrencia ? Number(d.ocorrencia.ocorrenciaId) : 0;
}

async function cnlAbrirOcorrenciaAcao(ocorrenciaId, ctxBruto, manterPosicao) {
  const id = Number(ocorrenciaId);
  if (!id) return;
  const ctx = cnlContexto(ctxBruto);
  if (ctx === "G") cnlMostrarSecaoAcao("ocorrencias", true);
  const container = cnlEl(CNL_CTX[ctx].detalhe);
  const mudou = cnlIdDaOcorrenciaAberta(ctx) !== id;
  const data = await cnlObter(`ocorrencia?ocorrenciaId=${id}`);
  if (data.sucesso === false || !data.ocorrencia) {
    cnlOcorrenciaAberta[ctx] = null;
    if (container) container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(cnlMensagemErro(data))}</p>`;
    if (!manterPosicao) cnlRolarPara(CNL_CTX[ctx].detalhe);
    return;
  }
  cnlOcorrenciaAberta[ctx] = data;
  if (mudou) {
    const msg = cnlEl(CNL_CTX[ctx].mensagem);
    if (msg) { msg.textContent = ""; msg.className = "subtitle"; }
  }
  if (container) container.innerHTML = cnlRenderDetalheOcorrencia(data, ctx);
  cnlIniciarContagem();
  if (!manterPosicao) cnlRolarPara(CNL_CTX[ctx].detalhe);
}

function cnlRenderDetalheOcorrencia(data, ctx) {
  const o = data.ocorrencia || {}, a = data.acoes || {};
  const gestao = ctx === "G";
  const [rotuloGravidade, classeGravidade] = cnlDe(CNL_GRAVIDADE, o.gravidade, null) || ["", "cal-st-cancelado"];
  const passos = Array.isArray(o.orientacao) ? o.orientacao : [];
  const tema = o.temaRedirecionamento && typeof o.temaRedirecionamento === "object" ? o.temaRedirecionamento : null;
  const campos = [
    cnlCampo("Canal", escaparHtmlEbd(o.canalNome || "")),
    cnlCampo("Tipo de conteúdo", `${escaparHtmlEbd(o.rotuloCategoria || o.categoria)}${o.artigo ? ` <span class="psc-legenda">(${escaparHtmlEbd(o.artigo)})</span>` : ""}`),
    cnlCampo("O que foi postado", escaparHtmlEbd(o.descricao)),
    cnlCampo("Evidência", o.linkEvidencia ? cnlLinkHttps(o.linkEvidencia, "🔗 ver a evidência") : ""),
    cnlCampo("Aviso em", escaparHtmlEbd(calDataHora(o.relatadaEm))),
    cnlCampo("Prazo para remover", escaparHtmlEbd(calDataHora(o.prazoRemocaoEm))),
    cnlCampo("Quem avisou", gestao && o.relatadaPorNome ? `${escaparHtmlEbd(o.relatadaPorNome)} <span class="psc-legenda">(só a gestão vê; o administrador não)</span>` : ""),
    cnlCampo("Removida em", o.removidaEm ? `${escaparHtmlEbd(calDataHora(o.removidaEm))}${o.removidaPorNome ? ` por ${escaparHtmlEbd(o.removidaPorNome)}` : ""}` : ""),
    cnlCampo("Prova da remoção", o.provaRemocao ? escaparHtmlEbd(o.provaRemocao) : ""),
    cnlCampo("Link da prova", o.linkProva ? cnlLinkHttps(o.linkProva, "🔗 ver a prova") : ""),
    cnlCampo("Prazo de 24 horas", o.status === "REMOVIDA" && o.dentroDoPrazo != null ? (o.dentroDoPrazo ? "✅ Removida dentro do prazo" : "<span class='psc-alerta'>Removida FORA do prazo: a Igreja esteve corresponsável nesse intervalo</span>") : ""),
    cnlCampo("Advertência", o.advertidoEm ? `${escaparHtmlEbd(calDataHora(o.advertidoEm))}${o.advertenciaObs ? ` — ${escaparHtmlEbd(o.advertenciaObs)}` : ""}` : ""),
    cnlCampo("Decisão", o.status === "IMPROCEDENTE" ? `Improcedente${o.decididaEm ? ` em ${escaparHtmlEbd(calDataHora(o.decididaEm))}` : ""}${o.motivoImprocedente ? ` — ${escaparHtmlEbd(o.motivoImprocedente)}` : ""}` : "")
  ].join("");

  const orientacao = passos.length
    ? `<h5>🧭 O que fazer, passo a passo</h5><ol class="cnl-passos">${passos.map(p => `<li>${escaparHtmlEbd(p)}</li>`).join("")}</ol>` : "";
  const redirecionamento = tema
    ? `<div class="cnl-modelo"><strong>Grupo focado sugerido: ${escaparHtmlEbd(tema.rotulo || tema.tema || "")}</strong> (Art. 160, §6º, IV).
        ${tema.frase ? `<p>“${escaparHtmlEbd(tema.frase)}”</p>${cnlBotaoCopiar(tema.frase, "Copiar a frase pronta")}` : ""}</div>` : "";
  const sugestaoAdvertencia = o.sugerirAdvertencia && !o.advertidoEm && o.status !== "IMPROCEDENTE"
    ? `<p class="psc-legenda">Este tipo de conteúdo pede que o membro seja advertido e que isso seja registrado (Art. 157, §5º, I).</p>` : "";

  const formRemover = a.remover ? `<div class="cal-form-inline">
      <h5>🗑️ Registrar a remoção</h5>
      <label for="cnlRemProva${ctx}">Prova da remoção: o que foi removido, quando e como o membro foi orientado (10 a 500 caracteres)</label>
      <textarea id="cnlRemProva${ctx}" rows="2" maxlength="500" style="width:100%;"></textarea>
      <label for="cnlRemLink${ctx}">Link da prova (opcional, começa com https://)</label>
      <input type="text" id="cnlRemLink${ctx}" maxlength="500" placeholder="https://..." />
      <label for="cnlRemQuando${ctx}">Removido em (opcional, horário de Brasília — só se removeu antes de registrar; nunca antes do aviso)</label>
      <input type="datetime-local" id="cnlRemQuando${ctx}" />
      <div class="psc-acoes"><button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="cnlRegistrarRemocaoAcao" data-args-click="${argsAttr(String(ctx))}">🗑️ Registrar a remoção</button></div>
    </div>` : "";
  const formAdvertir = a.advertir ? `<div class="cal-form-inline">
      <h5>⚠️ Registrar a advertência ao membro</h5>
      <label for="cnlAdvObs${ctx}">Como o membro foi advertido (5 a 300 caracteres)</label>
      <textarea id="cnlAdvObs${ctx}" rows="2" maxlength="300" style="width:100%;"></textarea>
      <div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="cnlRegistrarAdvertenciaAcao" data-args-click="${argsAttr(String(ctx))}">⚠️ Registrar a advertência</button></div>
    </div>` : "";
  const formImprocedente = a.improcedente ? `<div class="cal-form-inline">
      <h5>🚫 Declarar improcedente</h5>
      <label for="cnlImpMotivo${ctx}">Por que o conteúdo não é irregular (10 a 300 caracteres)</label>
      <textarea id="cnlImpMotivo${ctx}" rows="2" maxlength="300" style="width:100%;"></textarea>
      <div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="cnlDeclararImprocedenteAcao" data-args-click="${argsAttr(String(ctx))}">🚫 Declarar improcedente</button></div>
    </div>` : "";

  return `<div class="cal-cartao cartao-area-ebd cnl-oc cnl-oc-${escaparHtmlEbd(String(o.fase || "").toLowerCase().replace(/[^a-z_]/g, ""))}">
    <div class="cnl-oc-topo">${cnlHtmlFaseOcorrencia(o)}</div>
    <h4>${escaparHtmlEbd(o.rotuloCategoria || o.categoria)} ${rotuloGravidade ? `<span class="cal-selo ${escaparHtmlEbd(classeGravidade)}">${escaparHtmlEbd(rotuloGravidade)}</span>` : ""} <span class="psc-legenda">nº ${Number(o.ocorrenciaId)}</span></h4>
    ${o.fase === "VENCIDA" ? `<p class="cnl-aviso-vencida"><strong>Prazo de 24 horas vencido: a Igreja está corresponsável.</strong> Remova o conteúdo e registre a prova agora.</p>` : ""}
    <dl class="cal-dl">${campos}</dl>
    ${orientacao}${redirecionamento}${sugestaoAdvertencia}
    ${formRemover}${formAdvertir}${formImprocedente}
    ${!a.remover && !a.advertir && !a.improcedente ? "<p class='psc-legenda'>Nenhuma ação disponível para você nesta ocorrência.</p>" : ""}
  </div>`;
}

async function cnlAposAcaoOcorrencia(ctx, ocorrenciaId) {
  await cnlAbrirOcorrenciaAcao(ocorrenciaId, ctx, true);
  if (ctx === "G") cnlCarregarOcorrenciasAcao();
  else await carregarMeuPainelCanaisAcao();   // recarrega os cartões (contagens) e as ocorrências abertas
}
async function cnlExecutarAcaoOcorrencia(ctxBruto, rota, corpoExtra, confirmacao) {
  const ctx = cnlContexto(ctxBruto);
  const id = cnlIdDaOcorrenciaAberta(ctx);
  if (!id || cnlAcaoEmCurso) return;
  if (confirmacao && !confirm(confirmacao)) return;
  cnlAcaoEmCurso = true;
  try {
    const data = await cnlPostar(rota, { ocorrenciaId: id, ...corpoExtra });
    // remoção fora do prazo é dita em destaque: a Igreja esteve corresponsável
    mostrarResultadoCnl(data, CNL_CTX[ctx].mensagem, data.sucesso !== false && data.dentroDoPrazo === false);
    if (data.sucesso === false) return;
    await cnlAposAcaoOcorrencia(ctx, id);
  } finally {
    cnlAcaoEmCurso = false;
  }
}

// O campo "removido em" é digitado no horário de Brasília; vai para o servidor em ISO (UTC).
function cnlIsoDeBrasilia(valorLocal) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(String(valorLocal || ""));
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${m[2]}:00-03:00`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
async function cnlRegistrarRemocaoAcao(ctxBruto) {
  const ctx = cnlContexto(ctxBruto);
  const dados = cnlOcorrenciaAberta[ctx] && cnlOcorrenciaAberta[ctx].ocorrencia;
  if (!dados) return;
  const prova = cnlTexto(`cnlRemProva${ctx}`), link = cnlTexto(`cnlRemLink${ctx}`), quando = cnlTexto(`cnlRemQuando${ctx}`);
  if (prova.length < 10 || prova.length > 500) { mostrarToast("Descreva a remoção em 10 a 500 caracteres (o que foi removido, quando e como o membro foi orientado).", "erro"); return; }
  if (link && (!/^https:\/\/[^\s]/i.test(link) || link.length > 500)) { mostrarToast("O link da prova precisa começar com https:// (até 500 caracteres).", "erro"); return; }
  const corpo = { provaRemocao: prova };
  if (link) corpo.linkProva = link;
  if (quando) {
    const iso = cnlIsoDeBrasilia(quando);
    if (!iso) { mostrarToast("Data e hora da remoção inválidas.", "erro"); return; }
    const t = Date.parse(iso), aviso = Date.parse(dados.relatadaEm);
    if (t > Date.now() + 60000) { mostrarToast("A remoção não pode estar no futuro.", "erro"); return; }
    if (!Number.isNaN(aviso) && t < aviso) { mostrarToast("A remoção não pode ser anterior ao aviso do conteúdo.", "erro"); return; }
    corpo.removidaEm = iso;
  }
  await cnlExecutarAcaoOcorrencia(ctx, "ocorrencias/remover", corpo, "Registrar a remoção deste conteúdo? A ocorrência será encerrada.");
}
async function cnlRegistrarAdvertenciaAcao(ctxBruto) {
  const ctx = cnlContexto(ctxBruto);
  const observacao = cnlTexto(`cnlAdvObs${ctx}`);
  if (observacao.length < 5 || observacao.length > 300) { mostrarToast("Descreva como o membro foi advertido (de 5 a 300 caracteres).", "erro"); return; }
  await cnlExecutarAcaoOcorrencia(ctx, "ocorrencias/advertir", { observacao });
}
async function cnlDeclararImprocedenteAcao(ctxBruto) {
  const ctx = cnlContexto(ctxBruto);
  const motivo = cnlTexto(`cnlImpMotivo${ctx}`);
  if (motivo.length < 10 || motivo.length > 300) { mostrarToast("Explique por que o conteúdo não é irregular (de 10 a 300 caracteres).", "erro"); return; }
  await cnlExecutarAcaoOcorrencia(ctx, "ocorrencias/improcedente", { motivo }, "Declarar esta ocorrência improcedente? Ela será encerrada: o conteúdo não é irregular.");
}

// -- d) Senhas e acessos (custódia da Secretaria Geral, Art. 160, §4º, I) --
async function cnlCarregarTrocasAcao() {
  const aviso = cnlEl("cnlResultadoTrocas"), tabela = cnlEl("cnlTabelaTrocas");
  await cnlGarantirCanais();   // alimenta o seletor de "abrir pendência manualmente"
  if (aviso) aviso.textContent = "Carregando as pendências…";
  const data = await cnlObter(`trocas${cnlMarcado("cnlTrocasResolvidas") ? "?todas=1" : ""}`);
  if (data.sucesso === false) {
    cnlTrocas = [];
    if (aviso) aviso.textContent = "";
    if (tabela) tabela.innerHTML = `<p class="subtitle">${escaparHtmlEbd(cnlMensagemErro(data))}</p>`;
    return;
  }
  cnlTrocas = Array.isArray(data.trocas) ? data.trocas : [];
  const abertas = cnlTrocas.filter(t => !t.resolvidaEm), vencidas = abertas.filter(t => t.vencida).length;
  if (aviso) aviso.textContent = cnlTrocas.length ? `${abertas.length} pendência(s) em aberto${vencidas ? `, ${vencidas} com o prazo vencido` : ""}.` : "";
  if (!tabela) return;
  tabela.innerHTML = cnlTrocas.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Canal</th><th>Motivo</th><th>O que fazer</th><th>Quem saiu</th><th>Aberta em</th><th>Prazo</th><th>Situação</th><th></th></tr></thead><tbody>
      ${cnlTrocas.map(t => {
    const id = Number(t.trocaId);
    const resolvida = !!t.resolvidaEm;
    return `<tr class="${resolvida ? "cal-inativo" : ""}">
        <td><strong>${escaparHtmlEbd(t.canalNome)}</strong></td>
        <td>${escaparHtmlEbd(t.rotuloMotivo || t.motivo)}${t.observacao ? `<br /><span class="psc-legenda">${escaparHtmlEbd(t.observacao)}</span>` : ""}</td>
        <td>${escaparHtmlEbd(t.acao || "")}</td>
        <td>${t.saiuNome ? escaparHtmlEbd(t.saiuNome) : "—"}</td>
        <td>${escaparHtmlEbd(calData(t.geradaEm))}</td>
        <td>${escaparHtmlEbd(calData(t.prazoEm))}</td>
        <td>${resolvida
    ? `<span class="cal-selo cal-st-homologado">✅ resolvida</span><br /><span class="psc-legenda">${escaparHtmlEbd(calData(t.resolvidaEm))}${t.resolvidaPorNome ? ` por ${escaparHtmlEbd(t.resolvidaPorNome)}` : ""}${t.observacaoResolucao ? ` — ${escaparHtmlEbd(t.observacaoResolucao)}` : ""}</span>`
    : (t.vencida ? `<span class="cal-selo cal-st-indeferido">🔴 prazo vencido</span>` : `<span class="cal-selo cal-st-proposto">🟠 pendente</span>`)}</td>
        <td>${resolvida ? "" : `<button type="button" class="btn-link" data-on-click="cnlAbrirResolverTrocaAcao" data-args-click="${argsAttr(id)}">✅ Resolver…</button><div id="cnlFormTroca_${id}"></div>`}</td>
      </tr>`;
  }).join("")}</tbody></table>`
    : "<p class='subtitle'>Nenhuma pendência de troca de senha. 🎉</p>";
}

function cnlAbrirResolverTrocaAcao(trocaId) {
  const id = Number(trocaId);
  const area = cnlEl(`cnlFormTroca_${id}`);
  if (!area) return;
  area.innerHTML = `<div class="cal-form-inline">
    <p class="cnl-aviso-senha" role="note"><strong>Nunca escreva a senha aqui. O sistema não guarda senhas — só registra quem custodia e quando foi trocada.</strong></p>
    <label for="cnlTrocaObsRes_${id}">O que foi feito (5 a 300 caracteres)</label>
    <input type="text" id="cnlTrocaObsRes_${id}" maxlength="300" placeholder="Ex.: senha trocada e sessões antigas encerradas" />
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="cnlResolverTrocaAcao" data-args-click="${argsAttr(id)}">✅ Registrar a troca</button>
      <button type="button" class="btn-link" data-on-click="cnlFecharResolverTrocaAcao" data-args-click="${argsAttr(id)}">cancelar</button>
    </div>
  </div>`;
}
function cnlFecharResolverTrocaAcao(trocaId) {
  const area = cnlEl(`cnlFormTroca_${Number(trocaId)}`);
  if (area) area.innerHTML = "";
}
async function cnlResolverTrocaAcao(trocaId) {
  const id = Number(trocaId);
  if (cnlAcaoEmCurso) return;
  const observacao = cnlTexto(`cnlTrocaObsRes_${id}`);
  if (observacao.length < 5 || observacao.length > 300) { mostrarToast("Registre o que foi feito (de 5 a 300 caracteres) — nunca a senha.", "erro"); return; }
  if (!confirm("Confirmar que a senha e o acesso do canal foram trocados? Uma troca cobre todas as pendências abertas daquele canal.")) return;
  cnlAcaoEmCurso = true;
  try {
    const data = await cnlPostar("credenciais/resolver", { trocaId: id, observacao });
    mostrarResultadoCnl(data, "cnlResultadoTrocas");
    if (data.sucesso === false) return;
    await cnlCarregarTrocasAcao();
  } finally {
    cnlAcaoEmCurso = false;
  }
}

async function cnlAbrirTrocaAcao() {
  if (cnlAcaoEmCurso) return;
  const canalId = numeroDoCampo("cnlTrocaCanal"), motivo = cnlTexto("cnlTrocaMotivo"), observacao = cnlTexto("cnlTrocaObs");
  if (!Number.isInteger(canalId) || canalId <= 0) { mostrarToast("Escolha o canal.", "erro"); return; }
  if (!motivo) { mostrarToast("Escolha o motivo da pendência.", "erro"); return; }
  if (observacao.length > 300) { mostrarToast("A observação aceita até 300 caracteres.", "erro"); return; }
  const corpo = { canalId, motivo };
  if (observacao) corpo.observacao = observacao;
  cnlAcaoEmCurso = true;
  try {
    const data = await cnlPostar("credenciais/registrar", corpo);
    mostrarResultadoCnl(data, "cnlResultadoAbrirTroca");
    if (data.sucesso === false) return;
    const campo = cnlEl("cnlTrocaObs");
    if (campo) campo.value = "";
    await cnlCarregarTrocasAcao();
  } finally {
    cnlAcaoEmCurso = false;
  }
}

// "Conferir sucessões": compara quem lidera cada congregação/Área/departamento e abre as pendências de troca.
async function cnlConferirSucessoesAcao() {
  if (cnlAcaoEmCurso) return;
  cnlAcaoEmCurso = true;
  try {
    const data = await cnlPostar("sincronizar", {});
    mostrarResultadoCnl(data, "cnlResultadoTrocas");
    if (data.sucesso === false) return;
    const r = data.resumo || {};
    const resumo = `${cnlMensagemErro(data)} Verificados: ${cnlNumero(r.verificados)} · iniciados: ${cnlNumero(r.iniciados)} · mudanças de liderança: ${cnlNumero(r.mudancas)} · pendências geradas: ${cnlNumero(r.pendenciasGeradas)}.`;
    await cnlCarregarTrocasAcao();   // atualiza a tabela (e a contagem de pendências)
    const aviso = cnlEl("cnlResultadoTrocas");
    if (aviso) {
      aviso.textContent = `${resumo} ${aviso.textContent}`.trim();
      aviso.className = cnlNumero(r.pendenciasGeradas) > 0 ? "subtitle psc-aviso" : "subtitle";
    }
  } finally {
    cnlAcaoEmCurso = false;
  }
}

// -- e) Transmissão dos cultos e Área Cega (Art. 160, §2º) --
async function cnlCarregarTransmissaoAcao() {
  const aviso = cnlEl("cnlResultadoTransmissao"), tabela = cnlEl("cnlTabelaTransmissao");
  if (aviso) aviso.textContent = "Carregando…";
  const data = await cnlObter("transmissao");
  if (data.sucesso === false) {
    cnlTransmissao = [];
    if (aviso) aviso.textContent = "";
    if (tabela) tabela.innerHTML = `<p class="subtitle">${escaparHtmlEbd(cnlMensagemErro(data))}</p>`;
    return;
  }
  cnlTransmissao = Array.isArray(data.congregacoes) ? data.congregacoes : [];
  cnlPreencherSelect("cnlTrCongregacao", cnlOpcoesHtml(cnlTransmissao, c => c.congregacaoId, c => c.congregacaoNome, "— escolha a congregação —"));
  cnlRedesenharTransmissaoAcao();
}
function cnlRedesenharTransmissaoAcao() {
  const aviso = cnlEl("cnlResultadoTransmissao"), tabela = cnlEl("cnlTabelaTransmissao");
  if (!tabela) return;
  const situacao = cnlTexto("cnlFiltroTrSituacao");
  const lista = cnlTransmissao.filter(c => !situacao || c.situacao === situacao);
  const pendentes = cnlTransmissao.filter(c => c.situacao === "PENDENTE" || c.situacao === "NAO_INFORMADA").length;
  if (aviso) aviso.textContent = cnlTransmissao.length ? `${lista.length} de ${cnlTransmissao.length} congregação(ões); ${pendentes} com pendência ou sem informação.` : "";
  if (!cnlTransmissao.length) { tabela.innerHTML = "<p class='subtitle'>Nenhuma congregação no seu escopo.</p>"; return; }
  if (!lista.length) { tabela.innerHTML = "<p class='subtitle'>Nenhuma congregação com esse filtro.</p>"; return; }
  tabela.innerHTML = `<table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Situação</th><th>Transmite</th><th>Placa de aviso</th><th>Área Cega</th><th>Pendências</th><th>Conferido</th><th></th></tr></thead><tbody>
    ${lista.map(c => {
    const id = Number(c.congregacaoId);
    const pendencias = Array.isArray(c.pendencias) ? c.pendencias : [];
    return `<tr>
      <td><strong>${escaparHtmlEbd(c.congregacaoNome)}</strong>${c.areaNome ? `<br /><span class="psc-legenda">${escaparHtmlEbd(c.areaNome)}</span>` : ""}</td>
      <td>${cnlSelo(CNL_SITUACAO_TRANSMISSAO, c.situacao)}</td>
      <td>${c.transmite == null ? "—" : (c.transmite ? "Sim" : "Não")}</td>
      <td>${c.transmite ? (c.placaAvisoInstaladaEm ? escaparHtmlEbd(calData(c.placaAvisoInstaladaEm)) : "<span class='psc-alerta'>falta a placa</span>") : "—"}</td>
      <td>${c.transmite ? `${escaparHtmlEbd(c.rotuloAreaCega || "—")}${c.areaCegaDescricao ? `<br /><span class="psc-legenda">${escaparHtmlEbd(c.areaCegaDescricao)}</span>` : ""}` : "—"}</td>
      <td>${pendencias.length ? `<ul class="cal-lista-simples">${pendencias.map(p => `<li>${escaparHtmlEbd(p)}</li>`).join("")}</ul>` : "—"}</td>
      <td>${c.conferidoEm ? `${escaparHtmlEbd(calData(c.conferidoEm))}${c.conferidoPorNome ? `<br /><span class="psc-legenda">${escaparHtmlEbd(c.conferidoPorNome)}</span>` : ""}` : "—"}</td>
      <td><button type="button" class="btn-link" data-on-click="cnlEditarTransmissaoAcao" data-args-click="${argsAttr(id)}">✏️ Registrar</button></td>
    </tr>`;
  }).join("")}
  </tbody></table>`;
}
function cnlTrAtualizarBlocosAcao() {
  const bloco = cnlEl("cnlTrBlocoDetalhes");
  if (bloco) bloco.style.display = cnlTexto("cnlTrTransmite") === "sim" ? "block" : "none";
}
// Escolher a congregação já traz o que está registrado.
function cnlTrPreencherDaCongregacaoAcao() {
  const id = numeroDoCampo("cnlTrCongregacao");
  const linha = id ? cnlTransmissao.find(c => Number(c.congregacaoId) === id) : null;
  const preencher = (campo, valor) => { const el = cnlEl(campo); if (el) el.value = valor == null ? "" : String(valor); };
  preencher("cnlTrTransmite", linha && linha.transmite != null ? (linha.transmite ? "sim" : "nao") : "");
  preencher("cnlTrPlaca", linha ? linha.placaAvisoInstaladaEm : "");
  preencher("cnlTrAreaCega", linha && linha.areaCegaSituacao ? linha.areaCegaSituacao : "PENDENTE");
  preencher("cnlTrDescricao", linha ? linha.areaCegaDescricao : "");
  cnlTrAtualizarBlocosAcao();
}
function cnlEditarTransmissaoAcao(congregacaoId) {
  const id = Number(congregacaoId);
  const linha = cnlTransmissao.find(c => Number(c.congregacaoId) === id);
  if (!linha) return;
  const sel = cnlEl("cnlTrCongregacao"), detalhes = cnlEl("cnlFormTransmissaoDetalhes"), titulo = cnlEl("cnlFormTransmissaoTitulo");
  if (sel) sel.value = String(id);
  cnlTrPreencherDaCongregacaoAcao();
  if (titulo) titulo.textContent = `✏️ ${linha.congregacaoNome}`;
  if (detalhes) detalhes.open = true;
  cnlRolarPara("cnlFormTransmissaoDetalhes");
}
async function cnlSalvarTransmissaoAcao() {
  if (cnlAcaoEmCurso) return;
  const congregacaoId = numeroDoCampo("cnlTrCongregacao"), transmite = cnlTexto("cnlTrTransmite");
  if (!Number.isInteger(congregacaoId) || congregacaoId <= 0) { mostrarToast("Escolha a congregação.", "erro"); return; }
  if (transmite !== "sim" && transmite !== "nao") { mostrarToast("Informe se a congregação transmite os cultos.", "erro"); return; }
  const corpo = { congregacaoId, transmite: transmite === "sim" };
  if (transmite === "sim") {
    const placa = cnlTexto("cnlTrPlaca"), situacao = cnlTexto("cnlTrAreaCega"), descricao = cnlTexto("cnlTrDescricao");
    if (descricao.length > 300) { mostrarToast("A descrição da Área Cega aceita até 300 caracteres.", "erro"); return; }
    if (placa) corpo.placaAvisoInstaladaEm = placa;
    if (situacao) corpo.areaCegaSituacao = situacao;
    if (descricao) corpo.areaCegaDescricao = descricao;
  }
  cnlAcaoEmCurso = true;
  try {
    const data = await cnlPostar("transmissao", corpo);
    const pendencias = Array.isArray(data.pendencias) ? data.pendencias : [];
    if (data.sucesso !== false && pendencias.length) data.mensagem = `${cnlMensagemErro(data)} Pendências: ${pendencias.join(" ")}`;
    mostrarResultadoCnl(data, "cnlTrResultado", data.sucesso !== false && pendencias.length > 0);
    if (data.sucesso === false) return;
    await cnlCarregarTransmissaoAcao();
  } finally {
    cnlAcaoEmCurso = false;
  }
}
// -- Meu Painel → Canais (qualquer login): meus canais e o Termo, ocorrências do meu canal, avisar, meus avisos --
async function carregarMeuPainelCanaisAcao() {
  cnlVerificarDono();
  const cartoes = cnlEl("cnlMeusCanais"), aviso = cnlEl("cnlMeuResultado");
  if (!cartoes) return;
  if (!authToken) {
    cartoes.innerHTML = "";
    if (aviso) aviso.textContent = "Entre com a sua senha para ver os seus canais.";
    return;
  }
  const seq = ++cnlMeuSeq;
  if (aviso) { aviso.textContent = "Carregando…"; aviso.className = "subtitle"; }
  const [, meus, diretorio, minhas] = await Promise.all([cnlGarantirCatalogos(), cnlObter("meus"), cnlObter("diretorio"), cnlObter("minhas-ocorrencias")]);
  if (seq !== cnlMeuSeq) return;   // resposta velha: a pessoa trocou de login ou recarregou
  cnlPreencherFormAviso(diretorio);
  cnlRenderMeusAvisos(minhas);
  if (meus.sucesso === false) {
    cnlMeus = null;
    cartoes.innerHTML = "";
    if (aviso) aviso.textContent = cnlMensagemErro(meus);
    const abertas = cnlEl("cnlMinhasOcorrenciasAbertas");
    if (abertas) abertas.innerHTML = "";
    return;
  }
  cnlMeus = meus;
  if (aviso) aviso.textContent = "";
  cartoes.innerHTML = cnlRenderMeusCanais(meus);
  cnlIniciarContagem();
  await cnlCarregarOcorrenciasMeusAcao();
}

function cnlRenderMeusCanais(meus) {
  const lista = Array.isArray(meus.canais) ? meus.canais : [];
  if (!lista.length) return "<p class='subtitle'>Você não administra nenhum canal oficial. Se for designado, o aviso chega por notificação e o Termo para aceitar aparece aqui.</p>";
  const termo = meus.termo && typeof meus.termo === "object" ? meus.termo : {};
  const itensTermo = Array.isArray(termo.itens) ? termo.itens : [];
  const pendentes = lista.filter(i => i.termoAceito !== true);
  const topo = pendentes.length > 1
    ? `<div class="psc-aviso">Você tem ${pendentes.length} designações com o Termo de Dever de Moderação ainda não aceito.
        <button type="button" class="btn-confirmar" style="width:auto;margin:6px 0 0;" data-on-click="cnlAceitarTermoTodosAcao">✅ Li e aceito o Termo em todos os canais</button></div>` : "";
  let primeiroPendente = true;
  return topo + lista.map(i => {
    const c = i.canal || {};
    const adminId = Number(i.adminId);
    const aceito = i.termoAceito === true;
    const orient = i.orientacoes || {};
    let termoHtml;
    if (aceito) {
      termoHtml = `<p>✅ Termo de Dever de Moderação aceito${i.termoAceitoEm ? ` em ${escaparHtmlEbd(calDataHora(i.termoAceitoEm))}` : ""}${i.termoVersaoAceita != null ? ` (versão ${cnlNumero(i.termoVersaoAceita)})` : ""}.
        ${cnlNumero(i.ocorrenciasAbertas) ? `<span class="cal-selo cal-st-proposto">${cnlNumero(i.ocorrenciasAbertas)} ocorrência(s) aberta(s)</span>` : ""}
        ${cnlNumero(i.ocorrenciasVencidas) ? `<span class="cal-selo cal-st-indeferido">${cnlNumero(i.ocorrenciasVencidas)} com o prazo VENCIDO</span>` : ""}</p>`;
    } else {
      const abrir = primeiroPendente ? " open" : "";
      primeiroPendente = false;
      termoHtml = `<div class="psc-aviso">A sua designação só vale de fato depois que você ler e aceitar o <strong>Termo de Dever de Moderação</strong>. Quem administra um canal oficial responde por ele (Regimento Art. 160, §1º, I).</div>
        <details${abrir}><summary><strong>${escaparHtmlEbd(termo.titulo || "Termo de Dever de Moderação")}</strong>${termo.versao != null ? ` <span class="psc-legenda">(versão ${cnlNumero(termo.versao)})</span>` : ""}</summary>
          <ol class="cnl-termo">${itensTermo.map(t => `<li>${escaparHtmlEbd(t)}</li>`).join("")}</ol></details>
        <div class="psc-acoes"><button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="cnlAceitarTermoAcao" data-args-click="${argsAttr(adminId)}">✅ Li e aceito o Termo de Dever de Moderação</button></div>`;
    }
    const modelos = [
      orient.modeloTermoDeUso ? `<div class="cnl-modelo"><strong>Modelo de Termo de Uso do grupo</strong> (Art. 160, §1º, III) — mantenha na descrição do grupo:<p>${escaparHtmlEbd(orient.modeloTermoDeUso)}</p>${cnlBotaoCopiar(orient.modeloTermoDeUso, "Copiar o modelo")}</div>` : "",
      orient.avisoAtencao ? `<div class="cnl-modelo"><strong>Aviso de Atenção do grupo focado</strong> (Art. 160, §6º, II) — mantenha na descrição do grupo:<p>${escaparHtmlEbd(orient.avisoAtencao)}</p>${cnlBotaoCopiar(orient.avisoAtencao, "Copiar o aviso")}</div>` : "",
      orient.fraseRedirecionamento ? `<p class="psc-legenda">Para redirecionar um membro: “${escaparHtmlEbd(orient.fraseRedirecionamento)}” ${cnlBotaoCopiar(orient.fraseRedirecionamento, "Copiar a frase")}</p>` : ""
    ].join("");
    return `<div class="cal-cartao cartao-area-ebd">
      <h5>${escaparHtmlEbd(c.nome)} ${c.ativo === false ? `<span class="cal-selo cal-st-cancelado">⛔ desativado</span>` : ""}</h5>
      <p class="psc-legenda" style="margin:0 0 6px;">${escaparHtmlEbd(c.rotuloPlataforma || "")} · ${escaparHtmlEbd(c.rotuloCategoria || "")}${c.rotuloTema ? ` (${escaparHtmlEbd(c.rotuloTema)})` : ""} · ${escaparHtmlEbd(c.rotuloEscopo || "")}
        · seu papel: <strong>${escaparHtmlEbd(i.rotuloPapel || i.papel)}</strong>${i.designadoEm ? ` · desde ${escaparHtmlEbd(calData(i.designadoEm))}` : ""}</p>
      ${c.descricao ? `<p style="margin:4px 0;">${escaparHtmlEbd(c.descricao)}</p>` : ""}
      ${termoHtml}
      ${aceito ? modelos : ""}
    </div>`;
  }).join("");
}

function cnlNomeDoCanalDaDesignacao(adminId) {
  const i = cnlMeus && (cnlMeus.canais || []).find(x => Number(x.adminId) === adminId);
  return i && i.canal ? i.canal.nome : "";
}
async function cnlAceitarTermo(corpo, confirmacao) {
  if (cnlAcaoEmCurso) return;
  if (!confirm(confirmacao)) return;
  cnlAcaoEmCurso = true;
  try {
    const data = await cnlPostar("termo/aceitar", corpo);
    mostrarResultadoCnl(data, "cnlMeuResultado");
    if (data.sucesso === false) return;
    await carregarMeuPainelCanaisAcao();   // refaz os cartões (e apaga a linha de status): devolve a mensagem do servidor
    const aviso = cnlEl("cnlMeuResultado");
    if (aviso) aviso.textContent = cnlMensagemErro(data);
  } finally {
    cnlAcaoEmCurso = false;
  }
}
async function cnlAceitarTermoAcao(adminId) {
  const id = Number(adminId);
  if (!id) return;
  await cnlAceitarTermo({ adminId: id }, `Confirmar que você leu e aceita o Termo de Dever de Moderação do canal “${cnlNomeDoCanalDaDesignacao(id)}”? Você passa a responder solidariamente pelo conteúdo do canal e a remover o conteúdo irregular em até 24 horas.`);
}
async function cnlAceitarTermoTodosAcao() {
  await cnlAceitarTermo({ todos: true }, "Confirmar que você leu e aceita o Termo de Dever de Moderação em todos os canais que você administra? Você passa a responder solidariamente por eles e a remover o conteúdo irregular em até 24 horas.");
}

// Ocorrências abertas dos canais em que o termo já foi aceito. Mesmo que o servidor devolva mais (gestão), filtra pelos meus
// canais; e nunca mostra quem avisou aqui.
async function cnlCarregarOcorrenciasMeusAcao() {
  const lista = cnlEl("cnlMinhasOcorrenciasAbertas"), aviso = cnlEl("cnlMeuResultadoOc");
  if (!lista) return;
  const meus = cnlMeus && Array.isArray(cnlMeus.canais) ? cnlMeus.canais : [];
  const aceitos = meus.filter(i => i.termoAceito === true);
  if (!aceitos.length) {
    lista.innerHTML = "";
    if (aviso) aviso.textContent = meus.length ? "Aceite o Termo de Dever de Moderação para ver e tratar as ocorrências dos seus canais." : "Você não administra nenhum canal oficial.";
    return;
  }
  const data = await cnlObter("ocorrencias?status=ABERTA");
  if (data.sucesso === false) {
    lista.innerHTML = `<p class="subtitle">${escaparHtmlEbd(cnlMensagemErro(data))}</p>`;
    return;
  }
  const ids = new Set(aceitos.map(i => Number(i.canal && i.canal.canalId)));
  const abertas = (Array.isArray(data.ocorrencias) ? data.ocorrencias : []).filter(o => ids.has(Number(o.canalId)));
  const vencidas = abertas.filter(o => o.fase === "VENCIDA").length;
  if (aviso) aviso.textContent = abertas.length ? `${abertas.length} ocorrência(s) aberta(s)${vencidas ? ` — ${vencidas} com o prazo VENCIDO (a Igreja está corresponsável)` : ""}. Você não vê quem avisou.` : "";
  lista.innerHTML = abertas.length ? abertas.map(o => cnlRenderCartaoOcorrencia(o, "M")).join("") : "<p class='subtitle'>Nenhuma ocorrência aberta nos seus canais.</p>";
  cnlIniciarContagem();
}

// -- Avisar conteúdo irregular --
function cnlOpcoesDiretorio(canais) {
  const grupos = new Map();
  canais.forEach(c => {
    const chave = c.rotuloCategoria || "Outros";
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(c);
  });
  return `<option value="">— escolha o canal —</option>` + [...grupos].map(([chave, lista]) =>
    `<optgroup label="${escaparHtmlEbd(chave)}">${lista.slice().sort((a, b) => String(a.rotuloEscopo || "").localeCompare(String(b.rotuloEscopo || ""), "pt-BR") || String(a.nome).localeCompare(String(b.nome), "pt-BR"))
      .map(c => `<option value="${Number(c.canalId)}">${escaparHtmlEbd(c.nome)} — ${escaparHtmlEbd(c.rotuloPlataforma || "")} (${escaparHtmlEbd(c.rotuloEscopo || "")})</option>`).join("")}</optgroup>`).join("");
}
function cnlPreencherFormAviso(diretorio) {
  const canais = diretorio && diretorio.sucesso !== false && Array.isArray(diretorio.canais) ? diretorio.canais : [];
  cnlPreencherSelect("cnlAvisoCanal", cnlOpcoesDiretorio(canais));
  const cat = cnlCatalogos ? cnlCatalogos.categoriasOcorrencia : [];
  cnlPreencherSelect("cnlAvisoCategoria", cnlOpcoesHtml(cat, c => c.codigo, c => `${c.rotulo}${c.artigo ? ` (${c.artigo})` : ""}`, "— escolha o tipo —"));
  cnlAvisoCategoriaMudouAcao();
}
function cnlAvisoCategoriaMudouAcao() {
  const info = cnlEl("cnlAvisoCategoriaInfo");
  if (!info) return;
  const codigo = cnlTexto("cnlAvisoCategoria");
  const c = cnlCatalogos ? cnlCatalogos.categoriasOcorrencia.find(x => x.codigo === codigo) : null;
  info.textContent = c ? `${c.artigo || ""}${c.gravidade === "ALTA" ? " — gravidade alta: a Secretaria Geral também é avisada na hora." : ""}`.trim() : "";
}
function cnlAvisoContarAcao() {
  const contador = cnlEl("cnlAvisoContador"), campo = cnlEl("cnlAvisoDescricao");
  if (contador && campo) contador.textContent = String(String(campo.value || "").length);
}
async function cnlEnviarAvisoAcao() {
  if (cnlAcaoEmCurso) return;
  const canalId = numeroDoCampo("cnlAvisoCanal"), categoria = cnlTexto("cnlAvisoCategoria"), descricao = cnlTexto("cnlAvisoDescricao"), link = cnlTexto("cnlAvisoLink");
  if (!Number.isInteger(canalId) || canalId <= 0) { mostrarToast("Escolha o canal onde o conteúdo foi postado.", "erro"); return; }
  if (!categoria) { mostrarToast("Escolha o tipo de conteúdo irregular.", "erro"); return; }
  if (descricao.length < 10 || descricao.length > 500) { mostrarToast("Descreva o conteúdo em 10 a 500 caracteres (o que foi postado e onde). Não copie dados pessoais além do necessário.", "erro"); return; }
  if (link && (!/^https:\/\/[^\s]/i.test(link) || link.length > 500)) { mostrarToast("O link da evidência precisa começar com https:// (até 500 caracteres).", "erro"); return; }
  const corpo = { canalId, categoria, descricao };
  if (link) corpo.linkEvidencia = link;
  cnlAcaoEmCurso = true;
  try {
    const data = await cnlPostar("ocorrencias", corpo);
    // 429 = limite de avisos por hora: a mensagem do servidor vai em destaque
    mostrarResultadoCnl(data, "cnlAvisoResultado", data.sucesso === false && data.httpStatus === 429);
    if (data.sucesso === false) return;
    ["cnlAvisoDescricao", "cnlAvisoLink"].forEach(id => { const el = cnlEl(id); if (el) el.value = ""; });
    cnlAvisoContarAcao();
    await cnlCarregarMeusAvisosAcao();
  } finally {
    cnlAcaoEmCurso = false;
  }
}

// -- Meus avisos --
function cnlRenderMeusAvisos(minhas) {
  const lista = cnlEl("cnlMeusAvisos"), aviso = cnlEl("cnlMeusAvisosResultado");
  if (!lista) return;
  if (!minhas || minhas.sucesso === false) {
    lista.innerHTML = "";
    if (aviso) aviso.textContent = cnlMensagemErro(minhas);
    return;
  }
  const ocs = Array.isArray(minhas.ocorrencias) ? minhas.ocorrencias : [];
  if (aviso) aviso.textContent = ocs.length ? `${ocs.length} aviso(s).` : "";
  lista.innerHTML = ocs.length ? ocs.map(o => {
    let situacao;
    if (o.status === "ABERTA") situacao = `Aguardando a remoção — o administrador tem até ${escaparHtmlEbd(calDataHora(o.prazoRemocaoEm))}.`;
    else if (o.status === "REMOVIDA") situacao = `Conteúdo removido${o.removidaEm ? ` em ${escaparHtmlEbd(calDataHora(o.removidaEm))}` : ""}.`;
    else if (o.status === "IMPROCEDENTE") situacao = `Analisado: o conteúdo não é irregular${o.motivoImprocedente ? ` — ${escaparHtmlEbd(o.motivoImprocedente)}` : ""}.`;
    else situacao = escaparHtmlEbd(o.rotuloStatus || o.status || "");
    return `<div class="cal-cartao cartao-area-ebd">
      <h5>${escaparHtmlEbd(o.rotuloCategoria || o.categoria)} <span class="psc-legenda">em ${escaparHtmlEbd(o.canalNome || "")}</span></h5>
      <p style="margin:4px 0;">${escaparHtmlEbd(o.descricao)}</p>
      <p class="psc-legenda" style="margin:2px 0;">Avisado em ${escaparHtmlEbd(calDataHora(o.relatadaEm))} · ${situacao}</p>
    </div>`;
  }).join("") : "<p class='subtitle'>Você ainda não avisou nenhum conteúdo.</p>";
}
async function cnlCarregarMeusAvisosAcao() {
  const data = await cnlObter("minhas-ocorrencias");
  cnlRenderMeusAvisos(data);
}

registrarAcoes({
  cnlAbrirCanalAcao, cnlAbrirFormCanalAcao, cnlAbrirFormEncerrarAcao, cnlAbrirOcorrenciaAcao, cnlAbrirResolverTrocaAcao, cnlAbrirTrocaAcao,
  cnlAceitarTermoAcao, cnlAceitarTermoTodosAcao, cnlAvisoCategoriaMudouAcao, cnlAvisoContarAcao, cnlCarregarCanaisAcao, cnlCarregarMeusAvisosAcao,
  cnlCarregarOcorrenciasAcao, cnlCarregarPainelAcao, cnlCarregarTransmissaoAcao, cnlCarregarTrocasAcao, cnlCCategoriaMudouAcao, cnlCEscopoMudouAcao, cnlCMenoresMudouAcao,
  cnlConferirSucessoesAcao, cnlCopiarTextoAcao, cnlCPlataformaMudouAcao, cnlDeclararImprocedenteAcao, cnlDesativarCanalAcao, cnlDesignarAdminAcao,
  cnlEditarCanalAcao, cnlEditarTransmissaoAcao, cnlEncerrarAdminAcao, cnlEnviarAvisoAcao, cnlFecharFormAcaoCanal, cnlFecharFormEncerrarAcao,
  cnlFecharResolverTrocaAcao, cnlLimparFormCanalAcao, cnlMostrarSecaoAcao, cnlReativarCanalAcao, cnlRedesenharCanaisAcao,
  cnlRedesenharOcorrenciasAcao, cnlRedesenharTransmissaoAcao, cnlRegistrarAdvertenciaAcao, cnlRegistrarConferenciaAcao,
  cnlRegistrarParaCongregacaoAcao, cnlRegistrarRemocaoAcao, cnlResolverTrocaAcao, cnlRetirarResponsavelAcao, cnlSalvarCanalAcao, cnlSalvarResponsavelAcao, cnlSalvarTransmissaoAcao,
  cnlTrAtualizarBlocosAcao, cnlTrPreencherDaCongregacaoAcao
});
