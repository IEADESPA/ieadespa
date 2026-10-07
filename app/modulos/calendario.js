// app/modulos/calendario.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- Calendário Oficial e Agenda Unificada (v7.2) ----
// Agenda única do Campo (Regimento Art. 79, 81, 147, 154 e 154-A): eventos oficiais com
// nível de prevalência, grade litúrgica fixa e sessões dos órgãos. Toda regra (precedência
// por nível, Direito Adquirido Temporal, trava de Área, Esgotamento de Pauta, antecedência
// de 48 h, escopo e permissão) mora no servidor (shared/calendario.js, rota
// /api/calendario/*): aqui só se monta a tela e se manda o que a pessoa fez. Tudo que vem do
// servidor e entra em innerHTML passa por escaparHtmlEbd; onclick só recebe id numérico ou
// constante nossa. Data "só dia" (AAAA-MM-DD) é cortada como texto (nunca new Date sem
// cuidado de fuso); instante ISO vira o dia/hora de Brasília. A agenda é aberta a qualquer
// login (Meu Painel → Agenda) e usa as MESMAS funções de desenho da aba de gestão.
const CAL_NIVEIS = { 1: "Estratégico-Institucional", 2: "Geral-Focalizado", 3: "Regional-Intermediário", 4: "Local-Operacional", 5: "Social e Privado" };
const CAL_STATUS = {
  PROPOSTO: ["⏳ Proposto — aguarda consolidação", "cal-st-proposto"],
  DEFERIDO: ["🟦 Deferido — aguarda a homologação do ano", "cal-st-deferido"],
  HOMOLOGADO: ["✅ Homologado (oficial)", "cal-st-homologado"],
  INDEFERIDO: ["🚫 Indeferido", "cal-st-indeferido"],
  ABSORVIDO: ["⛔ Absorvido", "cal-st-absorvido"],
  CANCELADO: ["⚪ Cancelado", "cal-st-cancelado"]
};
const CAL_STATUS_CURTO = { PROPOSTO: "Propostos", DEFERIDO: "Deferidos", HOMOLOGADO: "Homologados", INDEFERIDO: "Indeferidos", ABSORVIDO: "Absorvidos", CANCELADO: "Cancelados" };
const CAL_STATUS_NA_PAUTA = ["PROPOSTO", "DEFERIDO", "HOMOLOGADO"];
const CAL_ROTULO_ANO = {
  PLANEJAMENTO: ["📝 Planejamento", "cal-st-proposto"],
  CONSOLIDADO: ["🟦 Consolidado", "cal-st-deferido"],
  HOMOLOGADO: ["✅ Homologado", "cal-st-homologado"]
};
const CAL_TIPO_LITURGIA = { CULTO: "Culto", EBD: "EBD", DESCANSO: "Descanso", FECHADA: "Congregações fechadas", NOITE_LIVRE: "Noite livre", CEIA: "Santa Ceia" };
const CAL_ABRANGENCIA = { CAMPO: "Campo todo", AREAS: "Uma ou mais Áreas", CONGREGACAO: "Uma congregação" };
const CAL_ESCOPO_LITURGIA = { SEDE: "Só a Sede", CONGREGACOES: "Só as congregações", TODAS: "Sede e congregações" };
const CAL_ESCOPO_SITE = { sede: "Sede", congregacoes: "Congregações", todas: "Sede e congregações" };
const CAL_ROTULO_DIA = {
  segunda: "Segunda-feira", terca: "Terça-feira", quarta: "Quarta-feira", quinta: "Quinta-feira", sexta: "Sexta-feira",
  sabado: "Sábado", domingo_manha: "Domingo de manhã", domingo_noite: "Domingo à noite"
};
const CAL_MOTIVO_CONFLITO = { DATA: "mesma data", TRAVA_AREA: "trava de Área (duas festividades de Nível 4 no mesmo fim de semana)" };
const CAL_ROTULO_PRESENCA = {
  PRESENTE: ["✅ Presente", "cal-st-homologado"],
  AUSENTE_JUSTIFICADA: ["🟡 Ausente justificada", "cal-st-proposto"],
  AUSENTE_INJUSTIFICADA: ["🔴 Ausente injustificada", "cal-st-indeferido"],
  NAO_REGISTRADO: ["⚪ Não registrado", "cal-st-cancelado"]
};
const CAL_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const CAL_DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const CAL_SECOES = ["agenda", "propor", "pauta", "anos", "liturgia", "presenca", "site"];
const CAL_CHAVE_CONGREGACAO = "calCongregacaoAgenda";

let calDonoDaTela = null;            // matrícula de quem a tela foi montada (não vaza dado ao trocar de login)
let calSecaoAtual = "agenda";
let calReferencias = null;           // { escopoGlobal, congregacoes[], areas[] } (cache por login)
let calTipos = [];                   // tipos ativos (seletor de "Propor data")
let calTiposTodos = [];              // tipos com os inativos (tabela da CLI)
let calAnos = [];
let calMes = null;                   // { ano, mes } do mês mostrado na grade
let calDiaSelecionado = null;        // "AAAA-MM-DD" do dia aberto na lista
let calAgendaItens = [];
let calAgendaCarregada = false;
let calAgendaSeq = 0;                // descarta resposta atrasada ao trocar de mês/filtro
let calMeuSeq = 0;
let calPautaCarregada = false;
let calEventoAberto = null;          // resposta de evento?eventoId= do detalhe aberto
let calRegrasCache = [];
let calSugestoesVerif = [];          // datas livres sugeridas pela pré-checagem
let calSugestoesRetorno = [];        // datas livres sugeridas depois de uma proposta indeferida
let calVerificarTimer = null;
let calVerificarSeq = 0;
let calAcaoEmCurso = false;          // trava duplo clique nas ações que gravam
let calPresencaCache = null;

function calPodeSecretaria() { return authPermissoes.includes("calendario_secretaria"); }
function calPodeHomologar() { return authPermissoes.includes("calendario_homologacao"); }
function calPodeProposta() { return authPermissoes.includes("calendario_proposta"); }
function calPodeAlgum() { return calPodeSecretaria() || calPodeHomologar() || calPodeProposta(); }
function calPodeVerAnos() { return calPodeSecretaria() || calPodeHomologar(); }
function calPodeVerSessoes() { return ["reunioes", "assembleia", "cli"].some(p => authPermissoes.includes(p)); }
// Nível 1 é da Secretaria Geral e da CLI; os demais, de quem tem a permissão de proposta.
function calPodeProporNivel(nivel) { return calPodeSecretaria() || calPodeHomologar() || (calPodeProposta() && Number(nivel) > 1); }
function calSecaoPermitida(secao) {
  if (secao === "anos" || secao === "site") return calPodeVerAnos();
  if (secao === "liturgia") return calPodeHomologar();
  if (secao === "presenca") return calPodeSecretaria();
  return secao === "agenda" || secao === "propor" || secao === "pauta";
}

function calEl(id) { return document.getElementById(id); }
function calTexto(id) { const c = calEl(id); return c ? String(c.value == null ? "" : c.value).trim() : ""; }
function calMarcado(id) { const c = calEl(id); return !!(c && c.checked); }
function calDe(mapa, chave, padrao) { return Object.prototype.hasOwnProperty.call(mapa, chave) ? mapa[chave] : padrao; }
function calRolarPara(id) {
  const el = calEl(id);
  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- datas (AAAA-MM-DD é texto: nunca new Date sem cuidado de fuso) ----
function calIso(ano, mes, dia) { return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`; }
function calUltimoDiaDoMes(ano, mes) { return new Date(Date.UTC(ano, mes, 0)).getUTCDate(); }
function calDiaDaSemana(iso) { const [a, m, d] = String(iso).split("-").map(Number); return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); }
function calSomarDias(iso, n) { const [a, m, d] = String(iso).split("-").map(Number); return new Date(Date.UTC(a, m - 1, d + Number(n))).toISOString().slice(0, 10); }
function calMesDe(iso) { return { ano: Number(String(iso).slice(0, 4)), mes: Number(String(iso).slice(5, 7)) }; }
// O dia de hoje em Brasília (e não o do fuso do navegador).
function calHojeBrasilia() {
  try {
    const partes = {};
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date()).forEach(p => { partes[p.type] = p.value; });
    if (partes.year && partes.month && partes.day) return `${partes.year}-${partes.month}-${partes.day}`;
  } catch { /* cai no relógio local */ }
  const d = new Date();
  return calIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
// Instante gravado em UTC: o servidor manda com "Z" (eventos) ou sem zona (anos) — sem zona vale UTC.
function calParaInstante(texto) {
  const t = String(texto);
  return new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(t) ? t : `${t}Z`);
}
function calData(valor) {
  if (!valor) return "—";
  const texto = String(valor);
  if (!texto.includes("T")) return formatarDataEbd(texto);
  const d = calParaInstante(texto);
  if (Number.isNaN(d.getTime())) return formatarDataEbd(texto);
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function calDataHora(valor) {
  if (!valor) return "—";
  const texto = String(valor);
  if (!texto.includes("T")) return formatarDataEbd(texto);
  const d = calParaInstante(texto);
  if (Number.isNaN(d.getTime())) return formatarDataEbd(texto);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(/,\s*/, " ");
}
function calHora(h) { return h ? String(h).slice(0, 5) : ""; }
// "05/10/2026", "05/10/2026 a 07/10/2026", com " · 19:30" ou " · 19:30–22:00".
function calPeriodo(inicio, fim, hora, horaFim) {
  let texto = calData(inicio);
  if (fim && String(fim).slice(0, 10) !== String(inicio).slice(0, 10)) texto += ` a ${calData(fim)}`;
  const h = calHora(hora), hf = calHora(horaFim);
  if (h) texto += ` · ${h}${hf ? `–${hf}` : ""}`;
  return texto;
}
function calRotuloDia(iso) { return `${CAL_DIAS_SEMANA[calDiaDaSemana(iso)]}, ${formatarDataEbd(iso)}`; }

// ---- chamadas à API (nunca lançam: erro de rede ou resposta que não é JSON viram { sucesso:false, mensagem }) ----
async function calRequisitar(caminho, opcoes) {
  try {
    const res = await fetchProtegido(`${API_BASE}/calendario/${caminho}`, opcoes);
    try {
      const corpo = await res.json();
      return corpo && typeof corpo === "object" ? corpo : { sucesso: false, mensagem: `Resposta inesperada do servidor (${res.status}).` };
    } catch { return { sucesso: false, mensagem: `Resposta inesperada do servidor (${res.status}).` }; }
  } catch {
    return { sucesso: false, mensagem: "Não foi possível falar com o servidor agora." };
  }
}
function calObter(caminho) { return calRequisitar(caminho); }
function calPostar(acao, corpo) {
  return calRequisitar(acao, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
}
function calMensagemErro(data) { return (data && data.mensagem) || "Não foi possível concluir a operação agora."; }
// Toast + texto fixo na tela (textContent: nada de HTML aqui).
function mostrarResultadoCal(data, idMensagem, destaque) {
  const texto = calMensagemErro(data);
  mostrarToast(texto, data && data.sucesso === false ? "erro" : "sucesso");
  const el = calEl(idMensagem);
  if (el) { el.textContent = texto; el.className = destaque ? "subtitle psc-aviso" : "subtitle"; }
}

// ---- selos e legenda ----
function calSeloNivel(nivel, rotulo) {
  const n = Number(nivel);
  if (!CAL_NIVEIS[n]) return "";
  return `<span class="cal-selo cal-selo-nivel cal-n${n}" title="${escaparHtmlEbd(`Nível ${n} — ${CAL_NIVEIS[n]}`)}">Nível ${n} · ${escaparHtmlEbd(rotulo || CAL_NIVEIS[n])}</span>`;
}
function calSeloStatus(status) {
  const [rotulo, classe] = calDe(CAL_STATUS, status, null) || [status || "—", "cal-st-cancelado"];
  return `<span class="cal-selo ${escaparHtmlEbd(classe)}">${escaparHtmlEbd(rotulo)}</span>`;
}
function calHtmlLegendaNiveis() {
  return [1, 2, 3, 4, 5].map(n => `<span class="cal-legenda-item cal-n${n}"><span class="cal-bolinha"></span>Nível ${n} · ${CAL_NIVEIS[n]}</span>`).join("")
    + `<span class="cal-legenda-item cal-neutro"><span class="cal-bolinha cal-oca"></span>ainda não homologado</span>`;
}
// Texto puro (quem usa escapa): Campo todo / Áreas: A, B / Congregação X.
function calTextoAbrangencia(e) {
  if (e.abrangencia === "CAMPO") return "Campo todo";
  if (e.abrangencia === "AREAS") {
    const nomes = Array.isArray(e.areaNomes) ? e.areaNomes : [];
    return nomes.length ? `Áreas: ${nomes.join(", ")}` : "Áreas";
  }
  if (e.abrangencia === "CONGREGACAO") return e.congregacaoNome ? `Congregação ${e.congregacaoNome}` : "Uma congregação";
  return e.abrangencia || "—";
}

// Troca de login no mesmo navegador: não deixa o dado da pessoa anterior na tela.
function calLimparTela() {
  if (calVerificarTimer) { clearTimeout(calVerificarTimer); calVerificarTimer = null; }
  calVerificarSeq++; calAgendaSeq++; calMeuSeq++;
  calSecaoAtual = "agenda"; calReferencias = null; calTipos = []; calTiposTodos = []; calAnos = [];
  calMes = null; calDiaSelecionado = null; calAgendaItens = []; calAgendaCarregada = false; calPautaCarregada = false;
  calEventoAberto = null; calRegrasCache = []; calSugestoesVerif = []; calSugestoesRetorno = []; calPresencaCache = null;
  ["calGradeMes", "calListaDia", "calTabelaPauta", "calTabelaAnos", "calTabelaRegras", "calPreviaSite", "calTabelaTipos", "calResumoPresenca",
    "calTabelaPresenca", "calSiteCartao", "calPropVerificacao", "calPropRetorno", "calPropRemarcacaoAviso", "calMeuAgenda", "calMeuLegenda",
    "calPropAreas", "calPropTipo", "calPropAbrangencia", "calPropCongregacao", "calPresencaEvento", "calRetornoAnos"].forEach(id => {
    const el = calEl(id);
    if (el) el.innerHTML = "";
  });
  ["calFiltroCongregacao", "calPautaCongregacao", "calMeuCongregacao"].forEach(id => {
    const el = calEl(id);
    if (el) { el.innerHTML = `<option value="">Todas as congregações</option>`; el.value = ""; if (el.dataset) delete el.dataset.montado; }
  });
  const detalhe = calEl("calDetalheEvento");
  if (detalhe) detalhe.innerHTML = "<p class='subtitle'>Escolha um evento na pauta (<em>Abrir</em>) ou na agenda para ver os detalhes.</p>";
  ["calResultadoAgenda", "calPropResultado", "calResultadoPauta", "calResultadoDetalhe", "calResultadoAnos", "calResultadoLiturgia",
    "calResultadoTipos", "calResultadoPresenca", "calResultadoSite", "calMeuResultado", "calPropTipoInfo"].forEach(id => {
    const el = calEl(id);
    if (el) el.textContent = "";
  });
  calPropLimparCampos();
}
function calVerificarDono() {
  if (calDonoDaTela !== authMatricula) { calLimparTela(); calDonoDaTela = authMatricula; }
}

// ---- congregação lembrada (só um conforto: localStorage pode falhar em aba privada) ----
function calCongregacaoLembrada() {
  try { return localStorage.getItem(CAL_CHAVE_CONGREGACAO) || ""; } catch { return ""; }
}
function calLembrarCongregacao(valor) {
  try {
    if (valor) localStorage.setItem(CAL_CHAVE_CONGREGACAO, String(valor));
    else localStorage.removeItem(CAL_CHAVE_CONGREGACAO);
  } catch { /* sem armazenamento: a escolha só não é lembrada */ }
}

// ---- referências (congregações e Áreas) e seletores ----
async function calGarantirReferencias(forcar) {
  if (calReferencias && !forcar) return calReferencias;
  const data = await calObter("referencias");
  if (data.sucesso === false) { calReferencias = null; return null; }
  calReferencias = {
    escopoGlobal: data.escopoGlobal !== false,
    congregacoes: Array.isArray(data.congregacoes) ? data.congregacoes : [],
    areas: Array.isArray(data.areas) ? data.areas : []
  };
  return calReferencias;
}
function calPreencherSeletorTodas(id) {
  const sel = calEl(id);
  if (!sel) return;
  const lista = calReferencias ? calReferencias.congregacoes : [];
  const atual = sel.value;
  sel.innerHTML = `<option value="">Todas as congregações</option>`
    + lista.map(c => `<option value="${Number(c.id)}">${escaparHtmlEbd(c.nome)}</option>`).join("");
  let alvo = atual;
  if (sel.dataset && !sel.dataset.montado) {
    sel.dataset.montado = "1";
    if (!alvo && id !== "calPautaCongregacao") alvo = calCongregacaoLembrada();
  }
  if (alvo && lista.some(c => String(c.id) === String(alvo))) sel.value = String(alvo);
}
function calPreencherSeletores() {
  ["calFiltroCongregacao", "calPautaCongregacao", "calMeuCongregacao"].forEach(calPreencherSeletorTodas);
  calPreencherSeletorPropCongregacao();
  calPreencherAreasProp();
}

function calAplicarPermissoes() {
  const mostrar = (id, ok) => { const el = calEl(id); if (el) el.style.display = ok ? "" : "none"; };
  CAL_SECOES.forEach(s => mostrar(`btnCalSecao${capitalize(s)}`, calSecaoPermitida(s)));
  mostrar("calRotuloCamadaSessao", calPodeVerSessoes());
  mostrar("calBarraAbrirAno", calPodeSecretaria());
}

async function calCarregarTipos() {
  if (!calPodeAlgum()) { calTipos = []; return; }
  const data = await calObter("tipos");
  if (data.sucesso === false) { calTipos = []; return; }
  calTipos = Array.isArray(data.tipos) ? data.tipos : [];
}

// Entrada da aba: referências, tipos, anos (quando permitido) e a agenda do mês atual.
async function carregarOpcoesCalendarioAcao() {
  calVerificarDono();
  calAplicarPermissoes();
  const legenda = calEl("calLegendaNiveis");
  if (legenda) legenda.innerHTML = calHtmlLegendaNiveis();
  const hoje = calHojeBrasilia();
  if (!calMes) calMes = calMesDe(hoje);
  [["calPautaAno", hoje.slice(0, 4)], ["calPresencaAno", hoje.slice(0, 4)], ["calAnoNovo", hoje.slice(0, 4)]].forEach(([id, valor]) => {
    const campo = calEl(id);
    if (campo && !campo.value) campo.value = valor;
  });
  ["calPropDataInicio", "calPropDataFim"].forEach(id => { const campo = calEl(id); if (campo) campo.min = hoje; });
  await Promise.all([calGarantirReferencias(), calCarregarTipos(), calPodeVerAnos() ? carregarAnosCalAcao() : null]);
  calPreencherSeletores();
  calPropMontarSeletorTipo();
  await carregarAgendaCalAcao();
  if (!calSecaoPermitida(calSecaoAtual)) calSecaoAtual = "agenda";
  calMostrarSecaoAcao(calSecaoAtual);
}

// Pílulas internas: mostra só a seção escolhida (e só as permitidas). `semCarregar`: não busca dados.
function calMostrarSecaoAcao(secao, semCarregar) {
  if (!calSecaoPermitida(secao)) secao = "agenda";
  calSecaoAtual = secao;
  CAL_SECOES.forEach(nome => {
    const div = calEl(`calSecao${capitalize(nome)}`);
    if (div) div.style.display = nome === secao ? "block" : "none";
    const btn = calEl(`btnCalSecao${capitalize(nome)}`);
    if (btn && btn.classList) btn.classList.toggle("ativo", nome === secao);
  });
  if (semCarregar) return;
  if (secao === "agenda") { if (!calAgendaCarregada) carregarAgendaCalAcao(); }
  else if (secao === "pauta") carregarPautaCalAcao();
  else if (secao === "anos") carregarAnosCalAcao();
  else if (secao === "liturgia") { carregarLiturgiaCalAcao(); carregarTiposCalAcao(); }
  else if (secao === "presenca") calCarregarEventosPresencaAcao();
  else if (secao === "site") carregarSiteStatusCalAcao();
}

// -- 1. Agenda: grade mensal, lista do dia e a mesma lista em Meu Painel --
function calCamadasMarcadas() {
  const camadas = [];
  if (calMarcado("calCamadaOficial")) camadas.push("OFICIAL");
  if (calMarcado("calCamadaLiturgia")) camadas.push("LITURGIA");
  if (calPodeVerSessoes() && calMarcado("calCamadaSessao")) camadas.push("SESSAO");
  return camadas;
}

function calAtualizarTituloMes() {
  const titulo = calEl("calMesTitulo");
  if (titulo && calMes) titulo.textContent = `${capitalize(CAL_MESES[calMes.mes - 1])} de ${calMes.ano}`;
}

function calMudarMesAcao(delta) {
  if (!calMes) calMes = calMesDe(calHojeBrasilia());
  let ano = calMes.ano, mes = calMes.mes + Number(delta);
  while (mes < 1) { mes += 12; ano--; }
  while (mes > 12) { mes -= 12; ano++; }
  calMes = { ano, mes };
  calDiaSelecionado = null;
  carregarAgendaCalAcao();
}
function calIrParaHojeAcao() {
  const hoje = calHojeBrasilia();
  calMes = calMesDe(hoje);
  calDiaSelecionado = hoje;
  carregarAgendaCalAcao();
}
function calFiltrosAgendaMudaramAcao() {
  const congregacao = calEl("calFiltroCongregacao");
  if (congregacao) calLembrarCongregacao(congregacao.value);
  carregarAgendaCalAcao();
}
// Só muda o que se vê (checkbox de propostas): não precisa buscar de novo.
function calRedesenharAgendaAcao() { calRenderAgenda(); }

async function carregarAgendaCalAcao() {
  if (!calMes) calMes = calMesDe(calHojeBrasilia());
  calAtualizarTituloMes();
  const aviso = calEl("calResultadoAgenda");
  const camadas = calCamadasMarcadas();
  const seq = ++calAgendaSeq;
  if (!camadas.length) {
    calAgendaItens = [];
    calAgendaCarregada = true;
    if (aviso) aviso.textContent = "Marque ao menos uma camada (Oficial, Liturgia ou Sessões).";
    calRenderAgenda();
    return;
  }
  const { ano, mes } = calMes;
  const de = calIso(ano, mes, 1), ate = calIso(ano, mes, calUltimoDiaDoMes(ano, mes));
  const congregacaoId = numeroDoCampo("calFiltroCongregacao");
  if (aviso) aviso.textContent = "Carregando a agenda…";
  const data = await calObter(`agenda?de=${de}&ate=${ate}&camadas=${camadas.join(",")}${congregacaoId ? `&congregacaoId=${congregacaoId}` : ""}`);
  if (seq !== calAgendaSeq) return;   // resposta velha: a pessoa já mudou de mês ou de filtro
  if (data.sucesso === false) {
    calAgendaItens = [];
    calAgendaCarregada = false;
    if (aviso) aviso.textContent = calMensagemErro(data);
    calRenderAgenda();
    return;
  }
  calAgendaItens = Array.isArray(data.itens) ? data.itens : [];
  calAgendaCarregada = true;
  if (aviso) aviso.textContent = "";
  calRenderAgenda();
}

function calItemVisivel(item) {
  return !(item.camada === "OFICIAL" && item.status !== "HOMOLOGADO" && !calMarcado("calMostrarPropostas"));
}

// Itens do mês por dia. Evento oficial de vários dias entra em cada dia que ocupa.
function calIndiceDoMes() {
  const indice = new Map();
  const { ano, mes } = calMes;
  const primeiro = calIso(ano, mes, 1), ultimo = calIso(ano, mes, calUltimoDiaDoMes(ano, mes));
  const por = (iso, item) => { if (!indice.has(iso)) indice.set(iso, []); indice.get(iso).push(item); };
  calAgendaItens.filter(calItemVisivel).forEach(item => {
    const inicio = String(item.data || "").slice(0, 10);
    if (!inicio) return;
    const fim = String(item.dataFim || item.data).slice(0, 10);
    if (item.camada === "OFICIAL" && fim > inicio) {
      for (let d = inicio > primeiro ? inicio : primeiro, n = 0; d <= fim && d <= ultimo && n < 62; d = calSomarDias(d, 1), n++) por(d, item);
    } else if (inicio >= primeiro && inicio <= ultimo) {
      por(inicio, item);
    }
  });
  return indice;
}

function calRenderAgenda() {
  if (!calMes) return;
  const { ano, mes } = calMes;
  if (calDiaSelecionado && calDiaSelecionado.slice(0, 7) !== calIso(ano, mes, 1).slice(0, 7)) calDiaSelecionado = null;
  const indice = calIndiceDoMes();
  calRenderGradeMes(indice);
  calRenderListaDia(indice);
}

function calRenderGradeMes(indice) {
  const grade = calEl("calGradeMes");
  if (!grade) return;
  const { ano, mes } = calMes;
  const hoje = calHojeBrasilia();
  const cabecalho = CAL_DIAS_SEMANA.map((nome, i) => `<div class="cal-cab" title="${nome}">${escaparHtmlEbd("DSTQQSS"[i])}</div>`).join("");
  let celulas = "";
  for (let i = 0, vazias = calDiaDaSemana(calIso(ano, mes, 1)); i < vazias; i++) celulas += `<div class="cal-dia cal-dia-vazio" aria-hidden="true"></div>`;
  for (let dia = 1, total = calUltimoDiaDoMes(ano, mes); dia <= total; dia++) {
    const iso = calIso(ano, mes, dia);
    const oficiais = (indice.get(iso) || []).filter(i => i.camada === "OFICIAL" && CAL_STATUS_NA_PAUTA.includes(i.status));
    const niveis = [...new Set(oficiais.map(i => Number(i.nivel)).filter(n => CAL_NIVEIS[n]))].sort();
    const bolinhas = niveis.map(n => {
      const oficial = oficiais.some(i => Number(i.nivel) === n && i.status === "HOMOLOGADO");
      return `<span class="cal-bolinha cal-n${n}${oficial ? "" : " cal-oca"}"></span>`;
    }).join("");
    const rotulo = `${dia} de ${CAL_MESES[mes - 1]}${oficiais.length ? `, ${oficiais.length} evento(s) oficial(is)` : ""}`;
    const classes = `cal-dia${iso === hoje ? " cal-hoje" : ""}${iso === calDiaSelecionado ? " cal-selecionado" : ""}`;
    celulas += `<button type="button" class="${classes}" data-on-click="calSelecionarDiaAcao" data-args-click="${argsAttr(dia)}" aria-label="${rotulo}" aria-pressed="${iso === calDiaSelecionado ? "true" : "false"}"><span class="cal-dia-num">${dia}</span><span class="cal-bolinhas">${bolinhas}</span></button>`;
  }
  grade.innerHTML = cabecalho + celulas;
}

function calSelecionarDiaAcao(dia) {
  if (!calMes) return;
  const d = Number(dia);
  if (!Number.isInteger(d) || d < 1 || d > calUltimoDiaDoMes(calMes.ano, calMes.mes)) return;
  calDiaSelecionado = calIso(calMes.ano, calMes.mes, d);
  calRenderAgenda();
  const lista = calEl("calListaDia");
  if (lista && typeof lista.scrollIntoView === "function") lista.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function calRenderListaDia(indice) {
  const el = calEl("calListaDia");
  if (!el) return;
  if (!calDiaSelecionado) {
    el.innerHTML = "<p class='subtitle'>Clique num dia do calendário para ver os eventos e a grade litúrgica daquele dia.</p>";
    return;
  }
  el.innerHTML = `<div class="cal-cartao cartao-area-ebd">
    <h5>📆 ${escaparHtmlEbd(calRotuloDia(calDiaSelecionado))}</h5>
    ${calRenderBlocosDoDia(indice.get(calDiaSelecionado) || [], { clicavel: true })}
  </div>`;
}

// Os blocos de um dia (oficiais, sessões, grade litúrgica): usados pela aba de gestão e por Meu Painel → Agenda.
function calRenderBlocosDoDia(itens, opcoes) {
  const oficiais = itens.filter(i => i.camada === "OFICIAL");
  const sessoes = itens.filter(i => i.camada === "SESSAO");
  const liturgia = itens.filter(i => i.camada === "LITURGIA");
  if (!oficiais.length && !sessoes.length && !liturgia.length) return "<p class='subtitle'>Nada na agenda neste dia (com os filtros atuais).</p>";
  const porHora = (a, b) => String(a.hora || "99:99").localeCompare(String(b.hora || "99:99"));
  const semTitulos = !!(opcoes && opcoes.semTitulos);
  const bloco = (titulo, lista, desenho) => (lista.length
    ? `${semTitulos ? "" : `<p class="cal-sub-titulo">${titulo}</p>`}${lista.slice().sort(porHora).map(i => desenho(i, opcoes)).join("")}`
    : "");
  return bloco("Eventos oficiais", oficiais, calRenderItemOficial)
    + bloco("Sessões dos órgãos", sessoes, calRenderItemSessao)
    + bloco("Agenda litúrgica", liturgia, calRenderItemLiturgia);
}

function calRenderItemOficial(item, opcoes) {
  const nivel = Number(item.nivel);
  const status = item.status || "HOMOLOGADO";
  const clicavel = !!(opcoes && opcoes.clicavel);
  const meta = [`🕒 ${escaparHtmlEbd(calPeriodo(item.data, item.dataFim, item.hora, item.horaFim))}`, `🧭 ${escaparHtmlEbd(calTextoAbrangencia(item))}`];
  if (item.local) meta.push(`📍 ${escaparHtmlEbd(item.local)}`);
  if (item.tipoNome) meta.push(`🏷️ ${escaparHtmlEbd(item.tipoNome)}`);
  const notas = [];
  if (item.descricao) notas.push(escaparHtmlEbd(item.descricao));
  if ((status === "INDEFERIDO" || status === "ABSORVIDO") && item.rotuloMotivo) notas.push(`<strong>Motivo:</strong> ${escaparHtmlEbd(item.rotuloMotivo)}`);
  const selos = [
    calSeloNivel(nivel, item.rotuloNivel),
    status !== "HOMOLOGADO" ? calSeloStatus(status) : "",
    item.origem === "REGRA" ? `<span class="cal-selo" title="Gerado pelo ciclo mensal do Regimento">📆 ciclo mensal</span>` : "",
    clicavel && item.publicoNoSite && status === "HOMOLOGADO" ? `<span class="cal-selo" title="Este evento aparece no site">🌐 no site</span>` : ""
  ].filter(Boolean).join(" ");
  const classeNivel = CAL_NIVEIS[nivel] ? `cal-n${nivel}` : "";
  const classeStatus = `cal-status-${escaparHtmlEbd(String(status).toLowerCase().replace(/[^a-z]/g, ""))}`;
  const detalhes = clicavel && Number(item.eventoId)
    ? `<div><button type="button" class="btn-link" data-on-click="calAbrirEventoAcao" data-args-click="${argsAttr(Number(item.eventoId))}">🔎 Ver detalhes</button></div>` : "";
  return `<div class="cal-item cal-item-oficial ${classeNivel} ${classeStatus}">
    <div class="cal-item-topo"><strong class="cal-titulo-item">${escaparHtmlEbd(item.titulo)}</strong> ${selos}</div>
    <div class="cal-item-meta">${meta.join(" · ")}</div>
    ${notas.map(n => `<div class="cal-item-nota">${n}</div>`).join("")}
    ${detalhes}
  </div>`;
}

function calRenderItemLiturgia(item) {
  const tipo = calDe(CAL_TIPO_LITURGIA, item.tipo, item.tipo || "");
  const por = item.absorvidoPor;
  const notas = [];
  if (item.absorvido) {
    notas.push(`⛔ Não acontece neste dia: absorvido por ${por && por.titulo ? `«${escaparHtmlEbd(por.titulo)}» (Nível ${Number(por.nivel) || 1})` : "evento de Nível 1"}.`);
  }
  if (item.fechada) notas.push("🔒 Congregações fechadas neste dia.");
  if (item.cobertoPor && item.cobertoPor.titulo) notas.push(`A Santa Ceia da grade é o evento oficial «${escaparHtmlEbd(item.cobertoPor.titulo)}».`);
  const local = [item.local, item.departamentoSigla].filter(Boolean).map(escaparHtmlEbd).join(" · ");
  return `<div class="cal-item cal-item-liturgia${item.absorvido ? " cal-absorvido" : ""}${item.cobertoPor ? " cal-coberto" : ""}">
    <div class="cal-linha-lit">
      <span class="cal-hora">${item.hora ? escaparHtmlEbd(calHora(item.hora)) : "—"}</span>
      <strong class="cal-titulo-item">${escaparHtmlEbd(item.titulo)}</strong>
      <span class="cal-selo">${escaparHtmlEbd(tipo)}</span>
      ${local ? `<span class="cal-item-meta">📍 ${local}</span>` : ""}
    </div>
    ${notas.map(n => `<div class="cal-item-nota">${n}</div>`).join("")}
  </div>`;
}

function calRenderItemSessao(item) {
  const meta = [item.orgaoNome, item.tipoSessao, item.status].filter(Boolean).map(escaparHtmlEbd).join(" · ");
  return `<div class="cal-item cal-item-sessao">
    <strong class="cal-titulo-item">🏛️ ${escaparHtmlEbd(item.titulo || item.orgaoNome || "Sessão")}</strong>
    ${meta ? `<div class="cal-item-meta">${meta}</div>` : ""}
  </div>`;
}

// Meu Painel → Agenda: o mesmo desenho, agrupado por data, para os próximos 60 dias.
function calRenderAgendaPorData(itens, de, ate) {
  const mapa = new Map();
  const por = (iso, item) => { if (!mapa.has(iso)) mapa.set(iso, []); mapa.get(iso).push(item); };
  (Array.isArray(itens) ? itens : []).forEach(item => {
    if (item.camada === "OFICIAL" && item.status !== "HOMOLOGADO") return;
    if (item.camada !== "OFICIAL" && item.camada !== "LITURGIA") return;
    const inicio = String(item.data || "").slice(0, 10);
    if (!inicio) return;
    const fim = String(item.dataFim || item.data).slice(0, 10);
    if (item.camada === "OFICIAL" && fim > inicio) {
      for (let d = inicio < de ? de : inicio, n = 0; d <= fim && d <= ate && n < 62; d = calSomarDias(d, 1), n++) por(d, item);
    } else if (inicio >= de && inicio <= ate) {
      por(inicio, item);
    }
  });
  const datas = [...mapa.keys()].sort();
  if (!datas.length) return "<p class='subtitle'>Nada na agenda nos próximos 60 dias.</p>";
  return datas.map(d => `<h5 class="cal-grupo-data">${escaparHtmlEbd(calRotuloDia(d))}</h5>${calRenderBlocosDoDia(mapa.get(d), { clicavel: false, semTitulos: true })}`).join("");
}

function calMeuMudouCongregacaoAcao() {
  const seletor = calEl("calMeuCongregacao");
  if (seletor) calLembrarCongregacao(seletor.value);
  carregarMinhaAgendaCalAcao();
}

async function carregarMinhaAgendaCalAcao() {
  calVerificarDono();
  const container = calEl("calMeuAgenda"), aviso = calEl("calMeuResultado");
  const legenda = calEl("calMeuLegenda");
  if (!container) return;
  if (legenda) legenda.innerHTML = calHtmlLegendaNiveis();
  if (!authToken) {
    container.innerHTML = "";
    if (aviso) aviso.textContent = "Entre com a sua senha para ver a agenda.";
    return;
  }
  const seq = ++calMeuSeq;
  await calGarantirReferencias();
  if (seq !== calMeuSeq) return;
  calPreencherSeletorTodas("calMeuCongregacao");
  const hoje = calHojeBrasilia(), ate = calSomarDias(hoje, 59);
  const congregacaoId = numeroDoCampo("calMeuCongregacao");
  if (aviso) aviso.textContent = "Carregando a agenda…";
  const data = await calObter(`agenda?de=${hoje}&ate=${ate}&camadas=OFICIAL,LITURGIA${congregacaoId ? `&congregacaoId=${congregacaoId}` : ""}`);
  if (seq !== calMeuSeq) return;
  if (data.sucesso === false) {
    container.innerHTML = "";
    if (aviso) aviso.textContent = calMensagemErro(data);
    return;
  }
  if (aviso) aviso.textContent = `De ${calData(hoje)} a ${calData(ate)}.`;
  container.innerHTML = calRenderAgendaPorData(data.itens, hoje, ate);
}
// -- 2. Propor data, com pré-checagem ao vivo (eventos/verificar não grava nada) --
function calTipoSelecionadoProp() {
  const id = numeroDoCampo("calPropTipo");
  return id ? (calTipos.find(t => Number(t.tipoId) === id) || null) : null;
}
function calAbrangenciasDoTipo(tipo) {
  return tipo && Array.isArray(tipo.abrangenciasPermitidas) ? tipo.abrangenciasPermitidas : [];
}
// Texto puro: o que o tipo exige, para quem vai propor.
function calTextoRegrasDoTipo(t) {
  const partes = [`Nível ${Number(t.nivel)} · ${t.rotuloNivel || CAL_NIVEIS[t.nivel] || ""}`];
  const onde = calAbrangenciasDoTipo(t).map(a => calDe(CAL_ABRANGENCIA, a, a));
  if (onde.length) partes.push(`pode ser: ${onde.join(" ou ")}`);
  if (t.antecedenciaMinimaHoras) partes.push(`exige convocação com ${Number(t.antecedenciaMinimaHoras)} h de antecedência (informe a hora de início)`);
  if (t.fechaCongregacoes) partes.push("fecha as congregações no dia");
  if (t.festividade) partes.push("é festividade (no Nível 4, vale a trava de uma por Área e fim de semana)");
  if (t.registraPresencaDirigente) partes.push("registra a presença dos dirigentes");
  partes.push(t.publicoNoSite ? "vai para o site por padrão" : "não vai para o site por padrão");
  if (t.artigoRef) partes.push(t.artigoRef);
  return partes.join(" · ");
}

function calPropMontarSeletorTipo() {
  const sel = calEl("calPropTipo");
  if (!sel) return;
  const atual = sel.value;
  const tipos = calTipos.filter(t => t.ativo !== false && calPodeProporNivel(t.nivel));
  const niveis = [...new Set(tipos.map(t => Number(t.nivel)))].sort();
  sel.innerHTML = `<option value="">— escolha o tipo de evento —</option>`
    + niveis.map(n => `<optgroup label="${escaparHtmlEbd(`Nível ${n} — ${CAL_NIVEIS[n] || ""}`)}">${tipos.filter(t => Number(t.nivel) === n)
      .map(t => `<option value="${Number(t.tipoId)}">${escaparHtmlEbd(t.nome)}</option>`).join("")}</optgroup>`).join("");
  if (atual && tipos.some(t => String(t.tipoId) === String(atual))) sel.value = atual;
  calPreencherSeletorPropCongregacao();
  calPreencherAreasProp();
  calPropAtualizarTipoInfo();
}

function calPreencherSeletorPropCongregacao() {
  const sel = calEl("calPropCongregacao");
  if (!sel) return;
  const atual = sel.value;
  const lista = calReferencias ? calReferencias.congregacoes : [];
  const meus = lista.filter(c => c.noMeuEscopo), outras = lista.filter(c => !c.noMeuEscopo);
  const opcao = c => `<option value="${Number(c.id)}">${escaparHtmlEbd(c.nome)}</option>`;
  const global = !calReferencias || calReferencias.escopoGlobal;
  sel.innerHTML = `<option value="">— escolha a congregação —</option>`
    + (meus.length ? `<optgroup label="${global ? "Congregações" : "No meu escopo"}">${meus.map(opcao).join("")}</optgroup>` : "")
    + (outras.length ? `<optgroup label="Fora do meu escopo">${outras.map(opcao).join("")}</optgroup>` : "");
  if (atual && lista.some(c => String(c.id) === String(atual))) sel.value = atual;
  else if (meus.length === 1 && !global) sel.value = String(meus[0].id);
}

function calPropAreasMarcadas() {
  const areas = calReferencias ? calReferencias.areas : [];
  return areas.map(a => Number(a.id)).filter(id => calMarcado(`calPropArea_${id}`));
}
function calPreencherAreasProp() {
  const caixa = calEl("calPropAreas");
  if (!caixa) return;
  const marcadas = calPropAreasMarcadas();
  const areas = calReferencias ? calReferencias.areas : [];
  caixa.innerHTML = areas.length
    ? areas.map(a => `<label class="cal-check"><input type="checkbox" id="calPropArea_${Number(a.id)}" data-on-change="calPropAgendarVerificacaoAcao" /> ${escaparHtmlEbd(a.nome)}</label>`).join("")
    : "<p class='psc-legenda'>Nenhuma Área cadastrada.</p>";
  marcadas.forEach(id => { const c = calEl(`calPropArea_${id}`); if (c) c.checked = true; });
}

// Mostra o que o tipo exige e refaz as opções de abrangência (mantém a escolhida, se ainda valer).
function calPropAtualizarTipoInfo() {
  const tipo = calTipoSelecionadoProp();
  const info = calEl("calPropTipoInfo");
  if (info) info.textContent = tipo ? calTextoRegrasDoTipo(tipo) : "Escolha o tipo: ele define o nível de prevalência e onde o evento pode acontecer.";
  const sel = calEl("calPropAbrangencia");
  if (sel) {
    const atual = sel.value;
    const permitidas = calAbrangenciasDoTipo(tipo);
    const global = !calReferencias || calReferencias.escopoGlobal;
    sel.innerHTML = permitidas.map(a => `<option value="${escaparHtmlEbd(a)}">${escaparHtmlEbd(calDe(CAL_ABRANGENCIA, a, a))}${a === "CAMPO" && !global ? " (exige escopo global)" : ""}</option>`).join("");
    if (atual && permitidas.includes(atual)) sel.value = atual;
    else if (permitidas.length) sel.value = permitidas[0];
  }
  calPropAtualizarBlocos();
}
function calPropAtualizarBlocos() {
  const abrangencia = calTexto("calPropAbrangencia");
  const congregacao = calEl("calPropBlocoCongregacao"), areas = calEl("calPropBlocoAreas");
  if (congregacao) congregacao.style.display = abrangencia === "CONGREGACAO" ? "block" : "none";
  if (areas) areas.style.display = abrangencia === "AREAS" ? "block" : "none";
}
function calPropTipoMudouAcao() {
  calPropAtualizarTipoInfo();
  const tipo = calTipoSelecionadoProp();
  const publico = calEl("calPropPublico");
  if (publico && tipo) publico.checked = !!tipo.publicoNoSite;
  calPropAgendarVerificacaoAcao();
}
function calPropAbrangenciaMudouAcao() {
  calPropAtualizarBlocos();
  calPropAgendarVerificacaoAcao();
}

// Monta o corpo da proposta. `estrito` (envio): valida tudo. Sem `estrito` (pré-checagem):
// aceita título ainda vazio (usa o nome do tipo) e só pede o que decide a data.
function calPropCorpo(estrito) {
  const tipo = calTipoSelecionadoProp();
  if (!tipo) return { problema: estrito ? "Escolha o tipo de evento." : "Escolha o tipo de evento e a data de início para ver se a data cabe." };
  const titulo = calTexto("calPropTitulo"), descricao = calTexto("calPropDescricao");
  const dataInicio = calTexto("calPropDataInicio"), dataFim = calTexto("calPropDataFim");
  const horaInicio = calTexto("calPropHoraInicio"), horaFim = calTexto("calPropHoraFim");
  const local = calTexto("calPropLocal"), slug = calTexto("calPropSlug").toLowerCase();
  const abrangencia = calTexto("calPropAbrangencia");
  if (estrito) {
    if (titulo.length < 3 || titulo.length > 200) return { problema: "O título deve ter de 3 a 200 caracteres." };
    if (descricao.length > 1000) return { problema: "A descrição passa de 1000 caracteres." };
    if (local.length > 200) return { problema: "O local passa de 200 caracteres." };
    if (slug && !/^[a-z0-9][a-z0-9-]{0,148}$/.test(slug)) return { problema: "O identificador no site deve ter só letras minúsculas, números e hífen." };
  }
  if (!dataInicio) return { problema: "Informe a data de início." };
  if (dataFim && dataFim < dataInicio) return { problema: "A data de término é anterior à de início." };
  if (horaFim && !horaInicio) return { problema: "Informe a hora de início para usar a de término." };
  if (horaFim && horaFim <= horaInicio) return { problema: "A hora de término deve ser depois da de início." };
  if (!abrangencia) return { problema: "Escolha a abrangência do evento." };
  const corpo = { tipoId: Number(tipo.tipoId), titulo: titulo.length >= 3 ? titulo : tipo.nome, dataInicio, abrangencia };
  if (descricao) corpo.descricao = descricao;
  if (dataFim) corpo.dataFim = dataFim;
  if (horaInicio) corpo.horaInicio = horaInicio;
  if (horaFim) corpo.horaFim = horaFim;
  if (abrangencia === "CONGREGACAO") {
    const congregacaoId = numeroDoCampo("calPropCongregacao");
    if (!Number.isInteger(congregacaoId) || congregacaoId <= 0) return { problema: "Escolha a congregação do evento." };
    corpo.congregacaoId = congregacaoId;
  } else if (abrangencia === "AREAS") {
    const areaIds = calPropAreasMarcadas();
    if (!areaIds.length) return { problema: "Marque ao menos uma Área." };
    corpo.areaIds = areaIds;
  }
  if (local) corpo.local = local;
  if (slug) corpo.slugSite = slug;
  corpo.publicoNoSite = calMarcado("calPropPublico");
  if (estrito) {
    const remarcacao = numeroDoCampo("calPropRemarcacaoDe");
    if (remarcacao) corpo.remarcacaoDeEventoId = remarcacao;
  }
  return { corpo };
}

// Pré-checagem: espera ~600 ms sem mexer e pergunta ao servidor o que aconteceria.
function calPropAgendarVerificacaoAcao() {
  if (calVerificarTimer) clearTimeout(calVerificarTimer);
  calVerificarSeq++;
  calVerificarTimer = setTimeout(() => { calVerificarTimer = null; calPropVerificarAgoraAcao(); }, 600);
}

async function calPropVerificarAgoraAcao() {
  const caixa = calEl("calPropVerificacao");
  if (!caixa) return;
  const { corpo, problema } = calPropCorpo(false);
  if (problema) {
    calSugestoesVerif = [];
    caixa.innerHTML = `<div class="cal-verif-cartao"><span class="psc-legenda">${escaparHtmlEbd(problema)}</span></div>`;
    return;
  }
  const seq = ++calVerificarSeq;
  caixa.innerHTML = `<div class="cal-verif-cartao">⏳ Verificando a data…</div>`;
  const data = await calPostar("eventos/verificar", { evento: corpo });
  if (seq !== calVerificarSeq) return;   // a pessoa mexeu de novo: esta resposta já é velha
  calPropDesenharVerificacao(data);
}

// "acao": nome fixo passado pelos dois chamadores (calUsarSugestaoVerifAcao / calUsarSugestaoRetornoAcao), nunca dado
function calHtmlSugestoes(sugestoes, acao) {
  if (!sugestoes.length) return "";
  return `<div class="cal-sugestoes"><span class="psc-legenda">Datas livres próximas (clique para usar):</span>${sugestoes.map((s, i) =>
    `<button type="button" class="btn-link" data-on-click="${acao}" data-args-click="${argsAttr(i)}">${escaparHtmlEbd(calPeriodo(s.dataInicio, s.dataFim))}</button>`).join("")}</div>`;
}

function calPropDesenharVerificacao(data) {
  const caixa = calEl("calPropVerificacao");
  if (!caixa) return;
  calSugestoesVerif = [];
  if (data.sucesso === false) {   // recusa de validação ou de permissão: o motivo vem em `mensagem`
    caixa.innerHTML = `<div class="cal-verif-cartao cal-verif-recusada">⚠️ ${escaparHtmlEbd(calMensagemErro(data))}</div>`;
    return;
  }
  const [icone, rotulo, classe] = data.veredito === "LIVRE" ? ["🟢", "Data livre", "cal-verif-livre"]
    : data.veredito === "ABSORVE" ? ["🟠", "Absorve outros eventos", "cal-verif-absorve"]
      : data.veredito === "RECUSADA" ? ["🔴", "Não cabe", "cal-verif-recusada"] : ["ℹ️", escaparHtmlEbd(data.veredito || "Resultado"), ""];
  const conflitos = Array.isArray(data.conflitos) ? data.conflitos : [];
  calSugestoesVerif = Array.isArray(data.sugestoes) ? data.sugestoes : [];
  const prazo = data.prazoPropostas
    ? `Ano ${Number(data.ano) || ""}: propostas até ${escaparHtmlEbd(calData(data.prazoPropostas))}${data.tardia ? " — o prazo passou, então a decisão sai na hora e, se não couber, é indeferida sem recurso" : data.decisaoImediata ? " — decisão na hora" : " — a decisão sai na consolidação da Secretaria"}.`
    : "";
  caixa.innerHTML = `<div class="cal-verif-cartao ${classe}">
    <strong>${icone} ${rotulo}</strong>
    <div>${escaparHtmlEbd(data.mensagem || "")}</div>
    ${data.rotuloMotivo ? `<div class="psc-legenda">${escaparHtmlEbd(data.rotuloMotivo)}</div>` : ""}
    ${conflitos.length ? `<ul>${conflitos.map(c => `<li><button type="button" class="btn-link" data-on-click="calAbrirEventoAcao" data-args-click="${argsAttr(Number(c.eventoId))}">${escaparHtmlEbd(c.titulo)}</button>
      — ${calSeloNivel(c.nivel)} ${calSeloStatus(c.status)} ${escaparHtmlEbd(calPeriodo(c.dataInicio, c.dataFim))}${c.motivoConflito ? ` · ${escaparHtmlEbd(calDe(CAL_MOTIVO_CONFLITO, c.motivoConflito, c.motivoConflito))}` : ""}</li>`).join("")}</ul>` : ""}
    ${calHtmlSugestoes(calSugestoesVerif, "calUsarSugestaoVerifAcao")}
    ${prazo ? `<div class="psc-legenda">${prazo}</div>` : ""}
  </div>`;
}

function calAplicarSugestao(s) {
  if (!s) return;
  const inicio = calEl("calPropDataInicio"), fim = calEl("calPropDataFim");
  if (inicio) inicio.value = String(s.dataInicio || "").slice(0, 10);
  if (fim) fim.value = s.dataFim && s.dataFim !== s.dataInicio ? String(s.dataFim).slice(0, 10) : "";
  calPropAgendarVerificacaoAcao();
  calRolarPara("calPropDataInicio");
}
function calUsarSugestaoVerifAcao(indice) { calAplicarSugestao(calSugestoesVerif[Number(indice)]); }
function calUsarSugestaoRetornoAcao(indice) { calAplicarSugestao(calSugestoesRetorno[Number(indice)]); }

function calPropLimparCampos() {
  ["calPropTitulo", "calPropDescricao", "calPropDataInicio", "calPropDataFim", "calPropHoraInicio", "calPropHoraFim", "calPropLocal", "calPropSlug", "calPropRemarcacaoDe"].forEach(id => {
    const el = calEl(id);
    if (el) el.value = "";
  });
  const publico = calEl("calPropPublico");
  if (publico) publico.checked = false;
  (calReferencias ? calReferencias.areas : []).forEach(a => { const c = calEl(`calPropArea_${Number(a.id)}`); if (c) c.checked = false; });
  const aviso = calEl("calPropRemarcacaoAviso");
  if (aviso) aviso.innerHTML = "";
}
function calLimparPropostaAcao() {
  if (calVerificarTimer) { clearTimeout(calVerificarTimer); calVerificarTimer = null; }
  calVerificarSeq++;
  calPropLimparCampos();
  const tipo = calEl("calPropTipo");
  if (tipo) tipo.value = "";
  calPropAtualizarTipoInfo();
  calSugestoesVerif = []; calSugestoesRetorno = [];
  const caixa = calEl("calPropVerificacao"), retorno = calEl("calPropRetorno"), resultado = calEl("calPropResultado");
  if (caixa) caixa.innerHTML = "";
  if (retorno) retorno.innerHTML = "";
  if (resultado) { resultado.textContent = ""; resultado.className = "subtitle"; }
}

async function calEnviarPropostaAcao() {
  if (calAcaoEmCurso) return;
  const { corpo, problema } = calPropCorpo(true);
  if (problema) { mostrarToast(problema, "erro"); return; }
  if (calVerificarTimer) { clearTimeout(calVerificarTimer); calVerificarTimer = null; }
  calVerificarSeq++;
  calAcaoEmCurso = true;
  try {
    calPropMostrarRetorno(await calPostar("eventos", corpo));
  } finally {
    calAcaoEmCurso = false;
  }
}

// 201: proposta registrada. 422 com `evento`: a proposta ficou registrada como INDEFERIDA na hora —
// mostra a mensagem e as datas livres, clicáveis para preencher a data. Outra recusa: só a mensagem.
function calPropMostrarRetorno(data) {
  const registrada = data.sucesso === false && !!data.evento;
  mostrarResultadoCal(data, "calPropResultado", registrada);
  const area = calEl("calPropRetorno");
  calSugestoesRetorno = Array.isArray(data.sugestoes) ? data.sugestoes : [];
  const eventoId = Number(data.eventoId || (data.evento && (data.evento.eventoId || data.evento.id))) || 0;
  let html = "";
  if (registrada) html += `<div class="cal-aviso-remarcacao">A proposta ficou <strong>registrada como indeferida</strong>${eventoId ? ` (nº ${eventoId})` : ""}. Escolha uma das datas livres abaixo, ou outra data, e envie de novo.</div>`;
  html += calHtmlSugestoes(calSugestoesRetorno, "calUsarSugestaoRetornoAcao");
  if (eventoId) html += `<div><button type="button" class="btn-link" data-on-click="calAbrirEventoAcao" data-args-click="${argsAttr(eventoId)}">🔎 Abrir esta proposta</button></div>`;
  if (area) area.innerHTML = html;
  if (data.sucesso === false) return;
  // enviada: limpa o formulário (o tipo e a abrangência ficam) e avisa as outras telas que mudou
  calPropLimparCampos();
  const caixa = calEl("calPropVerificacao");
  if (caixa) caixa.innerHTML = "";
  calAgendaCarregada = false;
  calPautaCarregada = false;
}

// Remarcar (do detalhe): abre o formulário pré-preenchido, sem datas, com o vínculo à proposta original.
function calRemarcarAcao() {
  const e = calEventoAberto && calEventoAberto.evento;
  if (!e) return;
  const id = Number(e.eventoId || e.id);
  const tipo = calTipos.find(t => Number(t.tipoId) === Number(e.tipoId) && t.ativo !== false);
  if (!tipo || !calPodeProporNivel(tipo.nivel)) { mostrarToast("O tipo deste evento não está disponível para você propor. Escolha outro tipo no formulário.", "erro"); }
  calMostrarSecaoAcao("propor", true);
  calLimparPropostaAcao();
  const sel = calEl("calPropTipo");
  if (sel && tipo && calPodeProporNivel(tipo.nivel)) sel.value = String(tipo.tipoId);
  calPropAtualizarTipoInfo();
  const preencher = (campo, valor) => { const el = calEl(campo); if (el) el.value = valor == null ? "" : String(valor); };
  preencher("calPropTitulo", e.titulo);
  preencher("calPropDescricao", e.descricao);
  preencher("calPropLocal", e.local);
  preencher("calPropSlug", e.slugSite);
  const publico = calEl("calPropPublico");
  if (publico) publico.checked = !!e.publicoNoSite;
  const abrangencia = calEl("calPropAbrangencia");
  if (abrangencia && calAbrangenciasDoTipo(tipo).includes(e.abrangencia)) abrangencia.value = e.abrangencia;
  calPropAtualizarBlocos();
  if (e.abrangencia === "CONGREGACAO" && e.congregacaoId) preencher("calPropCongregacao", e.congregacaoId);
  if (e.abrangencia === "AREAS") (Array.isArray(e.areaIds) ? e.areaIds : []).forEach(a => { const c = calEl(`calPropArea_${Number(a)}`); if (c) c.checked = true; });
  preencher("calPropRemarcacaoDe", id);
  const aviso = calEl("calPropRemarcacaoAviso");
  if (aviso) {
    aviso.innerHTML = `<div class="cal-aviso-remarcacao">🔁 Remarcação de «${escaparHtmlEbd(e.titulo)}» (nº ${id}): a nova proposta <strong>mantém o carimbo da proposta original</strong> (Direito Adquirido Temporal) e é decidida na hora. Escolha a nova data.
      <button type="button" class="btn-link" data-on-click="calCancelarRemarcacaoAcao">cancelar a remarcação</button></div>`;
  }
  const resultado = calEl("calPropResultado");
  if (resultado) { resultado.textContent = ""; resultado.className = "subtitle"; }
  calPropAgendarVerificacaoAcao();
  calRolarPara("calSecaoPropor");
}
function calCancelarRemarcacaoAcao() {
  const campo = calEl("calPropRemarcacaoDe"), aviso = calEl("calPropRemarcacaoAviso");
  if (campo) campo.value = "";
  if (aviso) aviso.innerHTML = "";
}
// -- 3. Pauta e detalhe do evento --
async function carregarPautaCalAcao() {
  const campo = calEl("calPautaAno");
  if (campo && !campo.value) campo.value = String(calMesDe(calHojeBrasilia()).ano);
  const ano = numeroDoCampo("calPautaAno");
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2200) { mostrarToast("Informe um ano válido (2000 a 2200).", "erro"); return; }
  const params = [`ano=${ano}`];
  const status = calTexto("calPautaStatus");
  if (status) params.push(`status=${encodeURIComponent(status)}`);
  const nivel = numeroDoCampo("calPautaNivel");
  if (nivel) params.push(`nivel=${nivel}`);
  const congregacaoId = numeroDoCampo("calPautaCongregacao");
  if (congregacaoId) params.push(`congregacaoId=${congregacaoId}`);
  if (calMarcado("calPautaMeus")) params.push("meus=1");
  const tabela = calEl("calTabelaPauta"), aviso = calEl("calResultadoPauta");
  if (aviso) aviso.textContent = "Carregando a pauta…";
  const data = await calObter(`eventos?${params.join("&")}`);
  if (data.sucesso === false) {
    calPautaCarregada = false;
    if (aviso) aviso.textContent = "";
    if (tabela) tabela.innerHTML = `<p class="subtitle">${escaparHtmlEbd(calMensagemErro(data))}</p>`;
    return;
  }
  calPautaCarregada = true;
  const eventos = Array.isArray(data.eventos) ? data.eventos : [];
  if (aviso) aviso.textContent = eventos.length ? `${eventos.length} evento(s) em ${ano}.` : "";
  if (tabela) tabela.innerHTML = calRenderPauta(eventos, data.truncado === true);
}

function calRenderPauta(eventos, truncado) {
  if (!eventos.length) return "<p class='subtitle'>Nenhum evento encontrado com esses filtros.</p>";
  const linhas = eventos.map(e => {
    const id = Number(e.eventoId || e.id);
    const proponente = e.origem === "REGRA" ? "Ciclo mensal (Regimento)" : (e.propostoPorNome ? escaparHtmlEbd(e.propostoPorNome) : "—");
    return `<tr>
      <td>${escaparHtmlEbd(calPeriodo(e.dataInicio, e.dataFim, e.horaInicio, e.horaFim))}</td>
      <td><strong>${escaparHtmlEbd(e.titulo)}</strong>${e.tardia ? ` <span class="cal-selo cal-st-proposto" title="Proposta depois de 15 de janeiro: decidida na hora">fora do prazo</span>` : ""}${e.remarcacaoDeEventoId ? ` <span class="cal-selo" title="Remarcação de outro evento">🔁 remarcação</span>` : ""}</td>
      <td>${escaparHtmlEbd(e.tipo && e.tipo.nome ? e.tipo.nome : "—")}</td>
      <td>${calSeloNivel(e.nivel, e.rotuloNivel)}</td>
      <td>${escaparHtmlEbd(calTextoAbrangencia(e))}${e.local ? `<br /><span class="psc-legenda">📍 ${escaparHtmlEbd(e.local)}</span>` : ""}</td>
      <td>${calSeloStatus(e.status)}</td>
      <td>${proponente}</td>
      <td><button type="button" class="btn-link" data-on-click="calAbrirEventoAcao" data-args-click="${argsAttr(id)}">🔎 Abrir</button></td>
    </tr>`;
  }).join("");
  return `<table class="tabela-frequencia"><thead><tr><th>Data</th><th>Título</th><th>Tipo</th><th>Nível</th><th>Abrangência / local</th><th>Situação</th><th>Proponente</th><th></th></tr></thead><tbody>${linhas}</tbody></table>`
    + (truncado ? "<p class='subtitle psc-aviso'>A lista foi cortada — filtre por situação, nível ou congregação para ver os demais.</p>" : "");
}

async function calAbrirEventoAcao(eventoId, manterPosicao) {
  const id = Number(eventoId);
  if (!id) return;
  calMostrarSecaoAcao("pauta", true);
  const container = calEl("calDetalheEvento");
  const mudouDeEvento = !calEventoAberto || Number(calEventoAberto.evento.eventoId || calEventoAberto.evento.id) !== id;
  const data = await calObter(`evento?eventoId=${id}`);
  if (data.sucesso === false || !data.evento) {
    calEventoAberto = null;
    if (container) container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(calMensagemErro(data))}</p>`;
    if (!manterPosicao) calRolarPara("calDetalheEvento");
    return;
  }
  calEventoAberto = data;
  if (mudouDeEvento) {
    const msg = calEl("calResultadoDetalhe");
    if (msg) { msg.textContent = ""; msg.className = "subtitle"; }
  }
  if (container) container.innerHTML = calRenderDetalheEvento(data);
  if (!manterPosicao) calRolarPara("calDetalheEvento");
}

function calCampoDetalhe(rotulo, html) {
  return html ? `<div><dt>${rotulo}</dt><dd>${html}</dd></div>` : "";
}

function calRenderDetalheEvento(data) {
  const e = data.evento, a = data.acoes || {};
  const tipo = e.tipo || {};
  const botaoEvento = (eventoId, rotulo) => `<button type="button" class="btn-link" data-on-click="calAbrirEventoAcao" data-args-click="${argsAttr(Number(eventoId))}">${escaparHtmlEbd(rotulo)}</button>`;
  const campos = [
    calCampoDetalhe("Tipo", escaparHtmlEbd(tipo.nome || "—")),
    calCampoDetalhe("Quando", escaparHtmlEbd(calPeriodo(e.dataInicio, e.dataFim, e.horaInicio, e.horaFim))),
    calCampoDetalhe("Abrangência", escaparHtmlEbd(calTextoAbrangencia(e))),
    calCampoDetalhe("Local", e.local ? escaparHtmlEbd(e.local) : ""),
    calCampoDetalhe("Descrição", e.descricao ? escaparHtmlEbd(e.descricao) : ""),
    calCampoDetalhe("Identificador no site", e.slugSite ? `<span class="cal-code">${escaparHtmlEbd(e.slugSite)}</span>` : ""),
    calCampoDetalhe("Aparece no site", e.publicoNoSite ? "Sim (depois de homologado)" : "Não"),
    calCampoDetalhe("Proponente", e.origem === "REGRA" ? "Ciclo mensal gerado pelo sistema (Art. 154-A)" : escaparHtmlEbd(e.propostoPorNome || "—")),
    calCampoDetalhe("Carimbo da proposta", e.propostaEm ? `${escaparHtmlEbd(calDataHora(e.propostaEm))} <span class="psc-legenda">(horário de Brasília; desempata eventos do mesmo nível)</span>` : ""),
    calCampoDetalhe("Decidido em", e.decididoEm ? escaparHtmlEbd(calDataHora(e.decididoEm)) : ""),
    calCampoDetalhe("Homologado em", e.homologadoEm ? escaparHtmlEbd(calDataHora(e.homologadoEm)) : ""),
    calCampoDetalhe("Cancelado em", e.canceladoEm ? `${escaparHtmlEbd(calDataHora(e.canceladoEm))}${e.motivoCancelamento ? ` — ${escaparHtmlEbd(e.motivoCancelamento)}` : ""}` : ""),
    calCampoDetalhe("Remarcação do evento", e.remarcacaoDeEventoId ? botaoEvento(e.remarcacaoDeEventoId, `nº ${Number(e.remarcacaoDeEventoId)}`) : ""),
    calCampoDetalhe("Pode conviver com", Array.isArray(tipo.compativeis) && tipo.compativeis.length ? tipo.compativeis.map(c => `<span class="cal-code">${escaparHtmlEbd(c)}</span>`).join(" ") : "")
  ].join("");

  const decisao = e.rotuloMotivo || e.detalheDecisao
    ? `<div class="cal-decisao"><strong>Decisão:</strong> ${escaparHtmlEbd(e.rotuloMotivo || "")}${e.detalheDecisao ? `<br />${escaparHtmlEbd(e.detalheDecisao)}` : ""}</div>` : "";
  const p = data.prevalecidoPor;
  const prevaleceu = p
    ? `<p>🏆 <strong>Prevaleceu:</strong> ${botaoEvento(p.eventoId, p.titulo || `evento nº ${Number(p.eventoId)}`)} ${calSeloNivel(p.nivel)} ${calSeloStatus(p.status)} ${escaparHtmlEbd(calPeriodo(p.dataInicio, p.dataFim))}</p>` : "";
  const conflitos = Array.isArray(data.conflitos) ? data.conflitos : [];
  const choques = conflitos.length
    ? `<h5>⚠️ Choques atuais na pauta</h5><ul class="cal-lista-simples">${conflitos.map(c => `<li>${botaoEvento(c.eventoId, c.titulo || `evento nº ${Number(c.eventoId)}`)} — ${calSeloNivel(c.nivel)} ${calSeloStatus(c.status)} ${escaparHtmlEbd(calPeriodo(c.dataInicio))}${c.motivoConflito ? ` · ${escaparHtmlEbd(calDe(CAL_MOTIVO_CONFLITO, c.motivoConflito, c.motivoConflito))}` : ""}</li>`).join("")}</ul>` : "";

  // "acao": nome fixo escrito abaixo (lista fechada do código), "args": a lista de argumentos (vai por argsAttr)
  const botao = (rotulo, acao, args, extra) => `<button type="button" class="btn-confirmar${extra ? ` ${extra}` : ""}" style="width:auto;margin:0;" data-on-click="${acao}"${args.length ? ` data-args-click="${argsAttr(...args)}"` : ""}>${rotulo}</button>`;
  const id = Number(e.eventoId || e.id);
  const botoes = [
    a.editar ? botao("✏️ Editar", "calAbrirFormAcaoDetalhe", ["editar"], "btn-secundario") : "",
    a.deferir ? botao("✅ Deferir", "calDeferirEventoAcao", []) : "",
    a.indeferir ? botao("🚫 Indeferir…", "calAbrirFormAcaoDetalhe", ["indeferir"], "btn-secundario") : "",
    a.cancelar ? botao("❌ Cancelar evento…", "calAbrirFormAcaoDetalhe", ["cancelar"], "btn-secundario") : "",
    a.absorver ? botao("🏛️ Absorver por decisão da CLI…", "calAbrirFormAcaoDetalhe", ["absorver"], "btn-secundario") : "",
    a.remarcar ? botao("🔁 Remarcar", "calRemarcarAcao", []) : "",
    a.registrarPresenca ? botao("🍞 Registrar presença dos dirigentes", "calAbrirPresencaAcao", [id], "btn-secundario") : ""
  ].filter(Boolean).join("");
  // v7.4: evento de Nível 1 a 3 ou de abrangência Área/Campo tem dossiê de governança (organizadores, convidados, Caixa Flutuante).
  const nivelEvento = Number(e.nivel);
  const dossie = (nivelEvento >= 1 && nivelEvento <= 3) || e.abrangencia === "AREAS" || e.abrangencia === "CAMPO"
    ? `<div style="margin-top:6px;"><button type="button" class="btn-link" data-on-click="evtAbrirDossieDoCalendarioAcao" data-args-click="${argsAttr(id)}">🎪 Abrir dossiê do evento</button></div>` : "";

  return `<div class="cal-cartao cartao-area-ebd ${CAL_NIVEIS[Number(e.nivel)] ? `cal-n${Number(e.nivel)}` : ""}">
    <h4>${escaparHtmlEbd(e.titulo)}</h4>
    <p>${calSeloNivel(e.nivel, e.rotuloNivel)} ${calSeloStatus(e.status)}
      ${e.origem === "REGRA" ? `<span class="cal-selo">📆 ciclo mensal</span>` : ""}
      ${e.tardia ? `<span class="cal-selo cal-st-proposto" title="Proposta depois de 15 de janeiro">fora do prazo</span>` : ""}
      <span class="psc-legenda">nº ${id}</span></p>
    ${decisao}${prevaleceu}
    <dl class="cal-dl">${campos}</dl>
    ${choques}
    ${botoes ? `<div class="psc-acoes">${botoes}</div>` : "<p class='psc-legenda'>Nenhuma ação disponível para você neste evento.</p>"}
    ${dossie}
    <div id="calFormAcao"></div>
  </div>`;
}

// Formulários inline no próprio cartão do detalhe.
function calFecharFormAcaoDetalhe() {
  const area = calEl("calFormAcao");
  if (area) area.innerHTML = "";
}
function calAbrirFormAcaoDetalhe(tipoAcao) {
  const area = calEl("calFormAcao");
  const e = calEventoAberto && calEventoAberto.evento;
  if (!area || !e) return;
  const cancelar = `<button type="button" class="btn-link" data-on-click="calFecharFormAcaoDetalhe">cancelar</button>`;
  if (tipoAcao === "editar") {
    area.innerHTML = `<div class="cal-form-inline">
      <p class="psc-legenda">Data e horário não mudam: para mudar, cancele este evento e proponha de novo.</p>
      <label for="calEdTitulo">Título (3 a 200 caracteres)</label>
      <input type="text" id="calEdTitulo" maxlength="200" value="${escaparHtmlEbd(e.titulo)}" />
      <label for="calEdDescricao">Descrição (até 1000 caracteres)</label>
      <textarea id="calEdDescricao" rows="2" maxlength="1000" style="width:100%;">${escaparHtmlEbd(e.descricao || "")}</textarea>
      <label for="calEdLocal">Local (até 200 caracteres)</label>
      <input type="text" id="calEdLocal" maxlength="200" value="${escaparHtmlEbd(e.local || "")}" />
      <label for="calEdSlug">Identificador no site (letras minúsculas, números e hífen)</label>
      <input type="text" id="calEdSlug" maxlength="150" value="${escaparHtmlEbd(e.slugSite || "")}" />
      <label class="cal-check"><input type="checkbox" id="calEdPublico"${e.publicoNoSite ? " checked" : ""} /> Mostrar no site (depois de homologado)</label>
      <div class="psc-acoes"><button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="calSalvarEdicaoEventoAcao">💾 Salvar alterações</button>${cancelar}</div>
    </div>`;
  } else if (tipoAcao === "cancelar" || tipoAcao === "indeferir") {
    const cancela = tipoAcao === "cancelar";
    area.innerHTML = `<div class="cal-form-inline">
      <p class="psc-aviso">${cancela ? "Cancelar tira o evento da pauta: a data volta a ficar livre." : "Indeferir recusa a proposta: o proponente é avisado e pode escolher outra data."}</p>
      <label for="calAcaoMotivo">Motivo (mínimo 10, máximo 500 caracteres)</label>
      <textarea id="calAcaoMotivo" rows="2" maxlength="500" style="width:100%;"></textarea>
      <div class="psc-acoes"><button type="button" class="btn-confirmar ${cancela ? "btn-perigo" : "btn-secundario"}" style="width:auto;margin:0;" data-on-click="${cancela ? "calCancelarEventoAcao" : "calIndeferirEventoAcao"}">${cancela ? "❌ Cancelar o evento" : "🚫 Indeferir a proposta"}</button>${cancelar}</div>
    </div>`;
  } else if (tipoAcao === "absorver") {
    area.innerHTML = `<div class="cal-form-inline">
      <p class="psc-aviso">Decisão excepcional da CLI (calamidade pública ou convocação de Nível 1 fora do fluxo): o evento sai da pauta e o proponente pode remarcar mantendo o carimbo original.</p>
      <label for="calAcaoMotivo">Motivo (mínimo 10, máximo 500 caracteres)</label>
      <textarea id="calAcaoMotivo" rows="2" maxlength="500" style="width:100%;"></textarea>
      <label for="calAcaoResolucao">Resolução da CLI (3 a 150 caracteres)</label>
      <input type="text" id="calAcaoResolucao" maxlength="150" placeholder="Ex.: Resolução CLI nº 12/2027" />
      <div class="psc-acoes"><button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="calAbsorverEventoAcao">🏛️ Absorver o evento</button>${cancelar}</div>
    </div>`;
  }
}

// Depois de qualquer decisão: recarrega o detalhe e as listas que podem ter mudado.
async function calAposAcaoEvento(eventoId) {
  calAgendaCarregada = false;
  await calAbrirEventoAcao(eventoId, true);
  if (calPautaCarregada) carregarPautaCalAcao();
  if (calAnos.length && calPodeVerAnos()) carregarAnosCalAcao();
}

async function calExecutarAcaoEvento(rota, corpoExtra, confirmacao) {
  const e = calEventoAberto && calEventoAberto.evento;
  if (!e || calAcaoEmCurso) return;
  const eventoId = Number(e.eventoId || e.id);
  if (confirmacao && !confirm(confirmacao)) return;
  calAcaoEmCurso = true;
  try {
    const data = await calPostar(rota, { eventoId, ...corpoExtra });
    mostrarResultadoCal(data, "calResultadoDetalhe");
    if (data.sucesso === false) return;
    await calAposAcaoEvento(eventoId);
  } finally {
    calAcaoEmCurso = false;
  }
}

async function calSalvarEdicaoEventoAcao() {
  const titulo = calTexto("calEdTitulo"), descricao = calTexto("calEdDescricao"), local = calTexto("calEdLocal");
  const slug = calTexto("calEdSlug").toLowerCase();
  if (titulo.length < 3 || titulo.length > 200) { mostrarToast("O título deve ter de 3 a 200 caracteres.", "erro"); return; }
  if (descricao.length > 1000) { mostrarToast("A descrição passa de 1000 caracteres.", "erro"); return; }
  if (local.length > 200) { mostrarToast("O local passa de 200 caracteres.", "erro"); return; }
  if (slug && !/^[a-z0-9][a-z0-9-]{0,148}$/.test(slug)) { mostrarToast("O identificador no site deve ter só letras minúsculas, números e hífen.", "erro"); return; }
  await calExecutarAcaoEvento("eventos/atualizar", { titulo, descricao, local, slugSite: slug, publicoNoSite: calMarcado("calEdPublico") });
}

async function calDeferirEventoAcao() {
  const e = calEventoAberto && calEventoAberto.evento;
  if (!e) return;
  await calExecutarAcaoEvento("eventos/deferir", {}, `Deferir "${e.titulo}"? O evento entra na pauta do ano e passa a valer como oficial quando a CLI homologar o calendário.`);
}

function calMotivoDoForm(rotulo) {
  const motivo = calTexto("calAcaoMotivo");
  if (motivo.length < 10 || motivo.length > 500) { mostrarToast(`Informe ${rotulo} (de 10 a 500 caracteres).`, "erro"); return null; }
  return motivo;
}
async function calCancelarEventoAcao() {
  const e = calEventoAberto && calEventoAberto.evento;
  const motivo = calMotivoDoForm("o motivo do cancelamento");
  if (!e || motivo == null) return;
  await calExecutarAcaoEvento("eventos/cancelar", { motivo }, `Cancelar "${e.titulo}"? A data volta a ficar livre e isso não se desfaz.`);
}
async function calIndeferirEventoAcao() {
  const e = calEventoAberto && calEventoAberto.evento;
  const motivo = calMotivoDoForm("o motivo do indeferimento");
  if (!e || motivo == null) return;
  await calExecutarAcaoEvento("eventos/indeferir", { motivo }, `Indeferir "${e.titulo}"? O proponente é avisado e pode escolher outra data.`);
}
async function calAbsorverEventoAcao() {
  const e = calEventoAberto && calEventoAberto.evento;
  const motivo = calMotivoDoForm("o motivo da absorção");
  if (!e || motivo == null) return;
  const resolucao = calTexto("calAcaoResolucao");
  if (resolucao.length < 3 || resolucao.length > 150) { mostrarToast("Informe a resolução da CLI (de 3 a 150 caracteres).", "erro"); return; }
  await calExecutarAcaoEvento("eventos/absorver", { motivo, resolucao }, `Absorver "${e.titulo}" por decisão da CLI? O evento sai da pauta (mesmo homologado) e o proponente é avisado para remarcar.`);
}
// -- 4. Secretaria — anos do calendário (e a homologação, que é da CLI) --
async function carregarAnosCalAcao() {
  if (!calPodeVerAnos()) return;
  const data = await calObter("anos");
  if (data.sucesso === false) {
    calAnos = [];
    const tabela = calEl("calTabelaAnos");
    if (tabela) tabela.innerHTML = `<p class="subtitle">${escaparHtmlEbd(calMensagemErro(data))}</p>`;
    return;
  }
  calAnos = Array.isArray(data.anos) ? data.anos : [];
  calRenderAnos();
}

function calRenderAnos() {
  const el = calEl("calTabelaAnos");
  if (!el) return;
  if (!calAnos.length) { el.innerHTML = "<p class='subtitle'>Nenhum ano aberto ainda. Use <em>Abrir ano</em> (Secretaria) ou proponha uma data: o ano abre sozinho.</p>"; return; }
  el.innerHTML = `<table class="tabela-frequencia"><thead><tr><th>Ano</th><th>Situação</th><th>Prazo das propostas</th><th>Eventos</th><th>Ciclo mensal</th><th>Consolidação / homologação</th><th>Ações</th></tr></thead><tbody>
    ${calAnos.map(calLinhaAno).join("")}
  </tbody></table>`;
}

function calLinhaAno(a) {
  const ano = Number(a.ano);
  const [rotuloSituacao, classeSituacao] = calDe(CAL_ROTULO_ANO, a.status, null) || [a.status || "—", "cal-st-cancelado"];
  const contagem = Object.keys(CAL_STATUS_CURTO).filter(s => Number(a.eventos && a.eventos[s]) > 0)
    .map(s => `<span class="cal-selo ${escaparHtmlEbd(CAL_STATUS[s][1])}">${CAL_STATUS_CURTO[s]}: ${Number(a.eventos[s])}</span>`).join(" ");
  const datas = [
    a.consolidadoEm ? `Consolidado em ${escaparHtmlEbd(calData(a.consolidadoEm))}` : "",
    a.homologadoEm ? `Homologado em ${escaparHtmlEbd(calData(a.homologadoEm))}${a.ataReferencia ? ` — ata: ${escaparHtmlEbd(a.ataReferencia)}` : ""}` : ""
  ].filter(Boolean).join("<br />");
  let acoes = "";
  if (calPodeSecretaria()) {
    acoes += `<button type="button" class="btn-link" title="Cria a Santa Ceia, a CLI, o Conselho Fiscal e a CEI do ano (não duplica)" data-on-click="calGerarCicloAcao" data-args-click="${argsAttr(ano)}">🔁 Gerar ciclo mensal</button>`;
    if (a.status !== "HOMOLOGADO") acoes += `<button type="button" class="btn-link" data-on-click="calConsolidarAnoAcao" data-args-click="${argsAttr(ano)}">🧮 Consolidar</button>`;
  }
  if (calPodeHomologar()) {
    if (a.status === "CONSOLIDADO") acoes += `<button type="button" class="btn-link" data-on-click="calAbrirFormHomologarAcao" data-args-click="${argsAttr(ano)}">🏛️ Homologar o ano…</button>`;
    else if (a.status === "PLANEJAMENTO") acoes += `<span class="psc-legenda">homologação: aguarda a consolidação</span>`;
  }
  return `<tr>
    <td><strong>${ano}</strong></td>
    <td><span class="cal-selo ${escaparHtmlEbd(classeSituacao)}">${escaparHtmlEbd(rotuloSituacao)}</span></td>
    <td>${escaparHtmlEbd(calData(a.prazoPropostas))}<br />${a.prazoVencido ? `<span class="cal-selo cal-st-indeferido" title="Propostas novas são decididas na hora e, se não couberem, indeferidas sem recurso">prazo vencido</span>` : `<span class="cal-selo cal-st-homologado">no prazo</span>`}</td>
    <td>${contagem || "—"}</td>
    <td>${a.cicloGeradoEm ? `✅ gerado em ${escaparHtmlEbd(calData(a.cicloGeradoEm))}` : `<span class="psc-alerta">não gerado</span>`}</td>
    <td>${datas || "—"}</td>
    <td>${acoes || "—"}<div id="calFormHomologar_${ano}"></div></td>
  </tr>`;
}

// Depois de mexer num ano: recarrega a tabela e marca a agenda/pauta como velhas.
async function calConcluirAcaoAno(data) {
  mostrarResultadoCal(data, "calResultadoAnos");
  // Consolidação: `indeferidos` é a contagem e `listaIndeferidos` a lista (aceita também a lista em `indeferidos`, formato antigo).
  const lista = Array.isArray(data.listaIndeferidos) ? data.listaIndeferidos : (Array.isArray(data.indeferidos) ? data.indeferidos : []);
  const total = Number.isFinite(Number(data.indeferidos)) && !Array.isArray(data.indeferidos) ? Number(data.indeferidos) : lista.length;
  const retorno = calEl("calRetornoAnos");
  if (retorno) {
    retorno.innerHTML = data.sucesso !== false && lista.length
      ? `<p class="psc-legenda">Indeferidos por choque nesta consolidação (${total}); os proponentes foram avisados:</p><ul class="cal-lista-simples">${lista.map(i =>
        `<li><button type="button" class="btn-link" data-on-click="calAbrirEventoAcao" data-args-click="${argsAttr(Number(i.eventoId))}">${escaparHtmlEbd(i.titulo)}</button></li>`).join("")}</ul>`
      : "";
  }
  if (data.sucesso === false) return;
  calAgendaCarregada = false;
  await carregarAnosCalAcao();
}

async function calAbrirAnoAcao() {
  if (calAcaoEmCurso) return;
  const ano = numeroDoCampo("calAnoNovo");
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2200) { mostrarToast("Informe um ano válido (2000 a 2200).", "erro"); return; }
  calAcaoEmCurso = true;
  try { await calConcluirAcaoAno(await calPostar("anos/abrir", { ano })); } finally { calAcaoEmCurso = false; }
}

async function calGerarCicloAcao(ano) {
  const a = Number(ano);
  if (!Number.isInteger(a) || calAcaoEmCurso) return;
  if (!confirm(`Gerar o ciclo mensal de ${a}? Cria no calendário a Santa Ceia (último domingo de cada mês; Ceia Geral em maio e outubro), a reunião da CLI, o Conselho Fiscal e a CEI. Pode repetir sem duplicar.`)) return;
  calAcaoEmCurso = true;
  try { await calConcluirAcaoAno(await calPostar("anos/gerar-ciclo", { ano: a })); } finally { calAcaoEmCurso = false; }
}

async function calConsolidarAnoAcao(ano) {
  const a = Number(ano);
  if (!Number.isInteger(a) || calAcaoEmCurso) return;
  if (!confirm(`Consolidar o calendário de ${a}? Aplica a Tabela de Hierarquia a todas as propostas do ano: vale o nível e, no mesmo nível, o carimbo de chegada; quem perde é indeferido e avisado para escolher outra data. Exige o ciclo mensal já gerado. Pode ser repetido até a homologação.`)) return;
  calAcaoEmCurso = true;
  try { await calConcluirAcaoAno(await calPostar("anos/consolidar", { ano: a })); } finally { calAcaoEmCurso = false; }
}

function calAbrirFormHomologarAcao(ano) {
  const a = Number(ano);
  const area = calEl(`calFormHomologar_${a}`);
  if (!area) return;
  area.innerHTML = `<div class="cal-form-inline">
    <p class="psc-aviso">Ao homologar, as datas deferidas viram <strong>Direito Adquirido</strong> (só um evento de Nível 1 ou uma decisão excepcional da CLI as altera) e as marcadas como públicas seguem para o site.</p>
    <label for="calAta_${a}">Ata ou resolução da CLI que aprova o calendário (3 a 150 caracteres)</label>
    <input type="text" id="calAta_${a}" maxlength="150" placeholder="Ex.: Ata da CLI de 12/01/${a}" />
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="calHomologarAnoAcao" data-args-click="${argsAttr(a)}">🏛️ Homologar ${a}</button>
      <button type="button" class="btn-link" data-on-click="calFecharFormHomologarAcao" data-args-click="${argsAttr(a)}">cancelar</button>
    </div>
  </div>`;
}
function calFecharFormHomologarAcao(ano) {
  const area = calEl(`calFormHomologar_${Number(ano)}`);
  if (area) area.innerHTML = "";
}
async function calHomologarAnoAcao(ano) {
  const a = Number(ano);
  if (!Number.isInteger(a) || calAcaoEmCurso) return;
  const ata = calTexto(`calAta_${a}`);
  if (ata.length < 3 || ata.length > 150) { mostrarToast("Informe a ata da CLI que aprova o calendário (de 3 a 150 caracteres).", "erro"); return; }
  if (!confirm(`Homologar o calendário de ${a}? As datas deferidas viram Direito Adquirido e as marcadas como públicas seguem para o site. Exige o ano consolidado e nenhuma proposta sem decisão. Esta decisão não se desfaz.`)) return;
  calAcaoEmCurso = true;
  try { await calConcluirAcaoAno(await calPostar("anos/homologar", { ano: a, ata })); } finally { calAcaoEmCurso = false; }
}
// -- 5. CLI — agenda litúrgica (regras) e tipos de evento --
// "toda semana", "1º domingo", "4º domingo (mês de 5 domingos)", "último domingo", "última quarta-feira".
function calTextoOcorrencia(r) {
  if (!r.ocorrencia) return "toda semana";
  const domingo = String(r.dia || "").startsWith("domingo");
  const nome = domingo ? "domingo" : String(calDe(CAL_ROTULO_DIA, r.dia, r.rotuloDia || "")).toLowerCase();
  if (r.ocorrencia === "4_se_5") return "4º domingo (mês de 5 domingos)";
  if (r.ocorrencia === "ultimo") return domingo ? "último domingo" : `última ${nome}`;
  if (["1", "2", "3"].includes(String(r.ocorrencia))) return `${r.ocorrencia}º ${nome}`;
  return String(r.ocorrencia);
}

async function carregarLiturgiaCalAcao() {
  if (!calPodeHomologar()) return;
  const aviso = calEl("calResultadoLiturgia"), tabela = calEl("calTabelaRegras"), previa = calEl("calPreviaSite");
  const data = await calObter("liturgia?todas=1");
  if (data.sucesso === false) {
    calRegrasCache = [];
    if (tabela) tabela.innerHTML = `<p class="subtitle">${escaparHtmlEbd(calMensagemErro(data))}</p>`;
    if (previa) previa.innerHTML = "";
    return;
  }
  calRegrasCache = Array.isArray(data.regras) ? data.regras : [];
  if (aviso) aviso.textContent = "";
  if (tabela) tabela.innerHTML = calRenderRegras(calRegrasCache);
  if (previa) previa.innerHTML = calRenderPreviaSite(Array.isArray(data.paraSite) ? data.paraSite : []);
}

function calRenderRegras(regras) {
  if (!regras.length) return "<p class='subtitle'>Nenhuma regra cadastrada.</p>";
  return `<table class="tabela-frequencia"><thead><tr><th>Dia</th><th>Onde</th><th>Ocorrência</th><th>Título</th><th>Hora</th><th>Tipo</th><th>Departamento</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
    ${regras.map(r => {
    const id = Number(r.regraId || r.id);
    const ativo = r.ativo !== false;
    return `<tr class="${ativo ? "" : "cal-inativo"}">
        <td>${escaparHtmlEbd(r.rotuloDia || calDe(CAL_ROTULO_DIA, r.dia, r.dia))}</td>
        <td>${escaparHtmlEbd(calDe(CAL_ESCOPO_LITURGIA, r.escopo, r.escopo))}</td>
        <td>${escaparHtmlEbd(calTextoOcorrencia(r))}</td>
        <td><strong>${escaparHtmlEbd(r.titulo)}</strong>${r.artigoRef ? `<br /><span class="psc-legenda">${escaparHtmlEbd(r.artigoRef)}</span>` : ""}${r.resolucaoReferencia ? `<br /><span class="psc-legenda">Autorização: ${escaparHtmlEbd(r.resolucaoReferencia)}</span>` : ""}</td>
        <td>${r.horaInicio ? escaparHtmlEbd(calHora(r.horaInicio)) : "—"}</td>
        <td>${escaparHtmlEbd(calDe(CAL_TIPO_LITURGIA, r.tipo, r.tipo || "—"))}</td>
        <td>${r.departamentoSigla ? escaparHtmlEbd(r.departamentoSigla) : "—"}</td>
        <td>${ativo ? `<span class="cal-selo cal-st-homologado">ativa</span>` : `<span class="cal-selo cal-st-cancelado">desativada</span>`}</td>
        <td><button type="button" class="btn-link" data-on-click="calEditarRegraAcao" data-args-click="${argsAttr(id)}">✏️ Editar</button>
          <button type="button" class="btn-link${ativo ? " btn-link-perigo" : ""}" data-on-click="calAlternarRegraAcao" data-args-click="${argsAttr(id, ativo ? false : true)}">${ativo ? "⛔ Desativar" : "✅ Ativar"}</button></td>
      </tr>`;
  }).join("")}
  </tbody></table>`;
}

// "Como o site mostra": o `paraSite` que o servidor monta (só regras ativas, sem "noite livre").
function calRenderPreviaSite(linhas) {
  if (!linhas.length) return "<p class='subtitle'>Nada vai para o site agora.</p>";
  return `<table class="tabela-frequencia"><thead><tr><th>Dia</th><th>Título</th><th>Onde</th><th>Ocorrência</th><th>Hora</th></tr></thead><tbody>
    ${linhas.map(l => `<tr>
      <td>${escaparHtmlEbd(calDe(CAL_ROTULO_DIA, l.day, l.day))}</td>
      <td>${escaparHtmlEbd(l.title)}</td>
      <td>${escaparHtmlEbd(calDe(CAL_ESCOPO_SITE, l.scope, l.scope))}</td>
      <td>${l.occurrence ? escaparHtmlEbd(calTextoOcorrencia({ dia: l.day, ocorrencia: l.occurrence })) : "toda semana"}</td>
      <td>${l.time ? escaparHtmlEbd(l.time) : "—"}</td>
    </tr>`).join("")}
  </tbody></table>`;
}

function calLimparFormRegraAcao() {
  ["calRegraId", "calRegraHora", "calRegraDepto", "calRegraTituloCampo", "calRegraResolucao"].forEach(id => { const el = calEl(id); if (el) el.value = ""; });
  [["calRegraDia", "segunda"], ["calRegraEscopo", "TODAS"], ["calRegraOcorrencia", ""], ["calRegraTipo", "CULTO"]].forEach(([id, valor]) => { const el = calEl(id); if (el) el.value = valor; });
  const titulo = calEl("calFormRegraTitulo");
  if (titulo) titulo.textContent = "➕ Nova regra";
}

function calEditarRegraAcao(regraId) {
  const id = Number(regraId);
  const r = calRegrasCache.find(x => Number(x.regraId || x.id) === id);
  if (!r) return;
  const preencher = (campo, valor) => { const el = calEl(campo); if (el) el.value = valor == null ? "" : String(valor); };
  preencher("calRegraId", id);
  preencher("calRegraDia", r.dia);
  preencher("calRegraEscopo", r.escopo);
  preencher("calRegraOcorrencia", r.ocorrencia || "");
  preencher("calRegraHora", calHora(r.horaInicio));
  preencher("calRegraTipo", r.tipo || "CULTO");
  preencher("calRegraDepto", r.departamentoSigla);
  preencher("calRegraTituloCampo", r.titulo);
  preencher("calRegraResolucao", "");
  const titulo = calEl("calFormRegraTitulo"), detalhes = calEl("calFormRegraDetalhes");
  if (titulo) titulo.textContent = `✏️ Editar a regra nº ${id}`;
  if (detalhes) detalhes.open = true;
  calRolarPara("calFormRegraDetalhes");
}

async function calSalvarRegraAcao() {
  if (calAcaoEmCurso) return;
  const regraId = numeroDoCampo("calRegraId");
  const dia = calTexto("calRegraDia"), escopo = calTexto("calRegraEscopo"), ocorrencia = calTexto("calRegraOcorrencia");
  const titulo = calTexto("calRegraTituloCampo"), hora = calTexto("calRegraHora"), tipo = calTexto("calRegraTipo");
  const departamento = calTexto("calRegraDepto").toUpperCase(), resolucao = calTexto("calRegraResolucao");
  if (titulo.length < 3 || titulo.length > 200) { mostrarToast("O título deve ter de 3 a 200 caracteres.", "erro"); return; }
  if (ocorrencia && !dia.startsWith("domingo") && ocorrencia !== "ultimo") { mostrarToast("Em dia de semana, a única ocorrência possível é a última do mês.", "erro"); return; }
  if (ocorrencia && dia === "domingo_manha") { mostrarToast("Domingo de manhã é toda semana (EBD em todo o campo): deixe a ocorrência em branco.", "erro"); return; }
  if (departamento.length > 30) { mostrarToast("A sigla do departamento passa de 30 caracteres.", "erro"); return; }
  if (resolucao.length < 3 || resolucao.length > 150) { mostrarToast("Informe a autorização da CLI (resolução, de 3 a 150 caracteres).", "erro"); return; }
  if (!confirm("Salvar esta regra da agenda litúrgica? Mudança permanente na grade depende de autorização expressa da CLI (Art. 79, parágrafo único): a resolução informada fica registrada e o site passa a mostrar a nova grade em alguns minutos.")) return;
  const corpo = { dia, escopo, titulo, tipo, resolucao };
  if (ocorrencia) corpo.ocorrencia = ocorrencia;
  if (hora) corpo.horaInicio = hora;
  if (departamento) corpo.departamentoSigla = departamento;
  if (regraId) corpo.regraId = regraId;
  calAcaoEmCurso = true;
  try {
    const data = await calPostar(regraId ? "liturgia/regra/atualizar" : "liturgia/regra", corpo);
    mostrarResultadoCal(data, "calResultadoLiturgia");
    if (data.sucesso === false) return;
    calLimparFormRegraAcao();
    calAgendaCarregada = false;
    await carregarLiturgiaCalAcao();
  } finally {
    calAcaoEmCurso = false;
  }
}

async function calAlternarRegraAcao(regraId, ativar) {
  const id = Number(regraId);
  const r = calRegrasCache.find(x => Number(x.regraId || x.id) === id);
  if (!r || calAcaoEmCurso) return;
  const resposta = prompt(`${ativar === true ? "Reativar" : "Desativar"} a regra "${r.titulo}"? Informe a autorização da CLI (resolução, de 3 a 150 caracteres):`);
  if (resposta == null) return;
  const resolucao = String(resposta).trim();
  if (resolucao.length < 3 || resolucao.length > 150) { mostrarToast("Informe a autorização da CLI (resolução, de 3 a 150 caracteres).", "erro"); return; }
  calAcaoEmCurso = true;
  try {
    const data = await calPostar("liturgia/regra/atualizar", { regraId: id, ativo: ativar === true, resolucao });
    mostrarResultadoCal(data, "calResultadoLiturgia");
    if (data.sucesso === false) return;
    calAgendaCarregada = false;
    await carregarLiturgiaCalAcao();
  } finally {
    calAcaoEmCurso = false;
  }
}

async function carregarTiposCalAcao() {
  if (!calPodeHomologar()) return;
  const tabela = calEl("calTabelaTipos");
  const data = await calObter("tipos?todos=1");
  if (data.sucesso === false) {
    calTiposTodos = [];
    if (tabela) tabela.innerHTML = `<p class="subtitle">${escaparHtmlEbd(calMensagemErro(data))}</p>`;
    return;
  }
  calTiposTodos = Array.isArray(data.tipos) ? data.tipos : [];
  calTipos = calTiposTodos.filter(t => t.ativo !== false);   // o seletor de "Propor data" só usa os ativos
  calPropMontarSeletorTipo();
  if (tabela) tabela.innerHTML = calRenderTipos(calTiposTodos);
}

function calRenderTipos(tipos) {
  if (!tipos.length) return "<p class='subtitle'>Nenhum tipo cadastrado.</p>";
  return `<table class="tabela-frequencia"><thead><tr><th>Nível</th><th>Código</th><th>Nome</th><th>Onde</th><th>Regras</th><th>Referência</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
    ${tipos.map(t => {
    const id = Number(t.tipoId);
    const ativo = t.ativo !== false;
    const regras = [
      t.fechaCongregacoes ? "fecha congregações" : "", t.festividade ? "festividade" : "", t.publicoNoSite ? "vai ao site" : "",
      t.antecedenciaMinimaHoras ? `antecedência ${Number(t.antecedenciaMinimaHoras)} h` : "", t.registraPresencaDirigente ? "presença dos dirigentes" : ""
    ].filter(Boolean).map(r => `<span class="cal-selo">${r}</span>`).join(" ");
    return `<tr class="${ativo ? "" : "cal-inativo"}">
        <td>${calSeloNivel(t.nivel, t.rotuloNivel)}</td>
        <td><span class="cal-code">${escaparHtmlEbd(t.codigo)}</span></td>
        <td><strong>${escaparHtmlEbd(t.nome)}</strong></td>
        <td>${escaparHtmlEbd(calAbrangenciasDoTipo(t).map(a => calDe(CAL_ABRANGENCIA, a, a)).join(" / "))}</td>
        <td>${regras || "—"}</td>
        <td>${t.artigoRef ? escaparHtmlEbd(t.artigoRef) : "—"}</td>
        <td>${ativo ? `<span class="cal-selo cal-st-homologado">ativo</span>` : `<span class="cal-selo cal-st-cancelado">desativado</span>`}</td>
        <td><button type="button" class="btn-link" data-on-click="calEditarTipoAcao" data-args-click="${argsAttr(id)}">✏️ Editar</button>
          <button type="button" class="btn-link${ativo ? " btn-link-perigo" : ""}" data-on-click="calAlternarTipoAcao" data-args-click="${argsAttr(id, ativo ? false : true)}">${ativo ? "⛔ Desativar" : "✅ Ativar"}</button></td>
      </tr>`;
  }).join("")}
  </tbody></table>`;
}

function calLimparFormTipoAcao() {
  ["calTipoId", "calTipoCodigo", "calTipoNome", "calTipoAntecedencia", "calTipoArtigo"].forEach(id => { const el = calEl(id); if (el) el.value = ""; });
  ["calTipoAbrCampo", "calTipoAbrAreas", "calTipoAbrCongregacao", "calTipoFecha", "calTipoFesta", "calTipoPublico", "calTipoPresenca"].forEach(id => { const el = calEl(id); if (el) el.checked = false; });
  const nivel = calEl("calTipoNivel"), codigo = calEl("calTipoCodigo"), titulo = calEl("calFormTipoTitulo");
  if (nivel) nivel.value = "3";
  if (codigo) codigo.disabled = false;
  if (titulo) titulo.textContent = "➕ Novo tipo";
}

function calEditarTipoAcao(tipoId) {
  const id = Number(tipoId);
  const t = calTiposTodos.find(x => Number(x.tipoId) === id);
  if (!t) return;
  const preencher = (campo, valor) => { const el = calEl(campo); if (el) el.value = valor == null ? "" : String(valor); };
  const marcar = (campo, valor) => { const el = calEl(campo); if (el) el.checked = !!valor; };
  const abrangencias = calAbrangenciasDoTipo(t);
  preencher("calTipoId", id);
  preencher("calTipoCodigo", t.codigo);
  preencher("calTipoNome", t.nome);
  preencher("calTipoNivel", t.nivel);
  preencher("calTipoAntecedencia", t.antecedenciaMinimaHoras);
  preencher("calTipoArtigo", t.artigoRef);
  marcar("calTipoAbrCampo", abrangencias.includes("CAMPO"));
  marcar("calTipoAbrAreas", abrangencias.includes("AREAS"));
  marcar("calTipoAbrCongregacao", abrangencias.includes("CONGREGACAO"));
  marcar("calTipoFecha", t.fechaCongregacoes);
  marcar("calTipoFesta", t.festividade);
  marcar("calTipoPublico", t.publicoNoSite);
  marcar("calTipoPresenca", t.registraPresencaDirigente);
  const codigo = calEl("calTipoCodigo"), titulo = calEl("calFormTipoTitulo"), detalhes = calEl("calFormTipoDetalhes");
  if (codigo) codigo.disabled = true;   // o código não muda depois de criado
  if (titulo) titulo.textContent = `✏️ Editar o tipo ${t.codigo}`;
  if (detalhes) detalhes.open = true;
  calRolarPara("calFormTipoDetalhes");
}

async function calSalvarTipoAcao() {
  if (calAcaoEmCurso) return;
  const tipoId = numeroDoCampo("calTipoId");
  const codigo = calTexto("calTipoCodigo").toUpperCase(), nome = calTexto("calTipoNome"), artigo = calTexto("calTipoArtigo");
  const nivel = numeroDoCampo("calTipoNivel");
  const abrangenciasPermitidas = [["calTipoAbrCampo", "CAMPO"], ["calTipoAbrAreas", "AREAS"], ["calTipoAbrCongregacao", "CONGREGACAO"]]
    .filter(([id]) => calMarcado(id)).map(([, valor]) => valor);
  const antecedenciaTexto = calTexto("calTipoAntecedencia");
  if (!tipoId && !/^[A-Z][A-Z0-9_]{2,49}$/.test(codigo)) { mostrarToast("O código deve ter de 3 a 50 caracteres: letras maiúsculas, números e _ (começa por letra).", "erro"); return; }
  if (nome.length < 3 || nome.length > 150) { mostrarToast("O nome deve ter de 3 a 150 caracteres.", "erro"); return; }
  if (!Number.isInteger(nivel) || nivel < 1 || nivel > 5) { mostrarToast("Escolha o nível (1 a 5).", "erro"); return; }
  if (!abrangenciasPermitidas.length) { mostrarToast("Marque onde o evento pode acontecer (campo todo, Áreas e/ou congregação).", "erro"); return; }
  if (nivel === 1 && (abrangenciasPermitidas.length !== 1 || abrangenciasPermitidas[0] !== "CAMPO")) { mostrarToast("Nível 1 (Estratégico-Institucional) é sempre do campo todo.", "erro"); return; }
  let antecedencia = null;
  if (antecedenciaTexto) {
    antecedencia = Number(antecedenciaTexto);
    if (!Number.isInteger(antecedencia) || antecedencia < 1 || antecedencia > 720) { mostrarToast("A antecedência mínima deve ser de 1 a 720 horas.", "erro"); return; }
  }
  if (artigo.length > 80) { mostrarToast("A referência passa de 80 caracteres.", "erro"); return; }
  if (tipoId && !confirm("Salvar as mudanças neste tipo? Elas valem para as propostas daqui em diante; os eventos já registrados guardam o nível do dia em que foram propostos.")) return;
  const corpo = {
    nome, nivel, abrangenciasPermitidas,
    fechaCongregacoes: calMarcado("calTipoFecha"), festividade: calMarcado("calTipoFesta"),
    publicoNoSite: calMarcado("calTipoPublico"), registraPresencaDirigente: calMarcado("calTipoPresenca")
  };
  if (antecedencia != null) corpo.antecedenciaMinimaHoras = antecedencia;
  if (artigo) corpo.artigoRef = artigo;
  if (tipoId) corpo.tipoId = tipoId; else corpo.codigo = codigo;
  calAcaoEmCurso = true;
  try {
    const data = await calPostar(tipoId ? "tipos/atualizar" : "tipos", corpo);
    mostrarResultadoCal(data, "calResultadoTipos");
    if (data.sucesso === false) return;
    calLimparFormTipoAcao();
    await carregarTiposCalAcao();
  } finally {
    calAcaoEmCurso = false;
  }
}

async function calAlternarTipoAcao(tipoId, ativar) {
  const id = Number(tipoId);
  const t = calTiposTodos.find(x => Number(x.tipoId) === id);
  if (!t || calAcaoEmCurso) return;
  const acao = ativar === true ? "Reativar" : "Desativar";
  if (!confirm(`${acao} o tipo "${t.nome}"? ${ativar === true ? "Ele volta a aparecer em Propor data." : "Ele deixa de aparecer em Propor data; os eventos já registrados continuam como estão."}`)) return;
  const corpo = {
    tipoId: id, nome: t.nome, nivel: Number(t.nivel), abrangenciasPermitidas: calAbrangenciasDoTipo(t),
    fechaCongregacoes: !!t.fechaCongregacoes, festividade: !!t.festividade, publicoNoSite: !!t.publicoNoSite,
    registraPresencaDirigente: !!t.registraPresencaDirigente, ativo: ativar === true
  };
  if (t.antecedenciaMinimaHoras) corpo.antecedenciaMinimaHoras = Number(t.antecedenciaMinimaHoras);
  if (t.artigoRef) corpo.artigoRef = t.artigoRef;
  calAcaoEmCurso = true;
  try {
    const data = await calPostar("tipos/atualizar", corpo);
    mostrarResultadoCal(data, "calResultadoTipos");
    if (data.sucesso === false) return;
    await carregarTiposCalAcao();
  } finally {
    calAcaoEmCurso = false;
  }
}
// -- 6. Ceia Geral — presença dos dirigentes --
async function calCarregarEventosPresencaAcao() {
  if (!calPodeSecretaria()) return;
  const campo = calEl("calPresencaAno");
  if (campo && !campo.value) campo.value = String(calMesDe(calHojeBrasilia()).ano);
  const ano = numeroDoCampo("calPresencaAno");
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2200) { mostrarToast("Informe um ano válido (2000 a 2200).", "erro"); return; }
  const aviso = calEl("calResultadoPresenca"), sel = calEl("calPresencaEvento");
  const data = await calObter(`eventos?ano=${ano}&status=DEFERIDO,HOMOLOGADO`);
  if (data.sucesso === false) { if (aviso) aviso.textContent = calMensagemErro(data); return; }
  const eventos = (Array.isArray(data.eventos) ? data.eventos : []).filter(e => e.tipo && e.tipo.registraPresencaDirigente);
  if (aviso) aviso.textContent = eventos.length ? "" : `Nenhum evento com registro de presença dos dirigentes em ${ano} (a Ceia Geral nasce do ciclo mensal).`;
  const atual = sel ? sel.value : "";
  if (sel) {
    sel.innerHTML = `<option value="">— escolha o evento —</option>`
      + eventos.map(e => `<option value="${Number(e.eventoId || e.id)}">${escaparHtmlEbd(e.titulo)} — ${escaparHtmlEbd(calData(e.dataInicio))}</option>`).join("");
    if (atual && eventos.some(e => String(e.eventoId || e.id) === String(atual))) sel.value = atual;
  }
}

// Vem do detalhe do evento (acoes.registrarPresenca): abre a seção já com o evento escolhido.
async function calAbrirPresencaAcao(eventoId) {
  const id = Number(eventoId);
  if (!id || !calPodeSecretaria()) return;
  calMostrarSecaoAcao("presenca", true);
  const e = calEventoAberto && calEventoAberto.evento && Number(calEventoAberto.evento.eventoId || calEventoAberto.evento.id) === id ? calEventoAberto.evento : null;
  const ano = e && e.dataInicio ? String(e.dataInicio).slice(0, 4) : "";
  const campoAno = calEl("calPresencaAno");
  if (campoAno && ano) campoAno.value = ano;
  await calCarregarEventosPresencaAcao();
  const sel = calEl("calPresencaEvento");
  if (sel) {
    if (!String(sel.innerHTML).includes(`value="${id}"`) && e) {
      sel.innerHTML += `<option value="${id}">${escaparHtmlEbd(e.titulo)} — ${escaparHtmlEbd(calData(e.dataInicio))}</option>`;
    }
    sel.value = String(id);
  }
  await carregarPresencaCalAcao();
  calRolarPara("calSecaoPresenca");
}

async function carregarPresencaCalAcao() {
  const eventoId = numeroDoCampo("calPresencaEvento");
  if (!eventoId) { mostrarToast("Escolha o evento (liste os eventos do ano primeiro).", "erro"); return; }
  const data = await calObter(`presencas-dirigente?eventoId=${eventoId}`);
  if (data.sucesso === false) {
    calPresencaCache = null;
    const tabela = calEl("calTabelaPresenca"), resumo = calEl("calResumoPresenca");
    if (resumo) resumo.innerHTML = "";
    if (tabela) tabela.innerHTML = `<p class="subtitle">${escaparHtmlEbd(calMensagemErro(data))}</p>`;
    return;
  }
  calPresencaCache = data;
  calRenderPresenca(data);
}

function calRenderPresenca(data) {
  const resumo = calEl("calResumoPresenca"), tabela = calEl("calTabelaPresenca");
  const r = data.resumo || {};
  const chip = (rotulo, valor, classe) => `<span class="psc-chip${classe ? ` ${classe}` : ""}">${rotulo}: ${Number(valor) || 0}</span>`;
  if (resumo) {
    resumo.innerHTML = [
      chip("Presentes", r.presentes, "psc-ok"), chip("Ausentes justificadas", r.ausentesJustificadas),
      chip("Ausentes injustificadas", r.ausentesInjustificadas, r.ausentesInjustificadas > 0 ? "psc-erro" : ""),
      chip("Não registradas", r.naoRegistradas, r.naoRegistradas > 0 ? "psc-alerta-selo" : "")
    ].join("");
  }
  const futuro = data.data && String(data.data).slice(0, 10) > calHojeBrasilia();
  const linhas = Array.isArray(data.congregacoes) ? data.congregacoes : [];
  if (!tabela) return;
  tabela.innerHTML = `<p class="subtitle" style="margin:6px 0;"><strong>${escaparHtmlEbd(data.titulo || "")}</strong> — ${escaparHtmlEbd(calData(data.data))}
      ${futuro ? `<span class="psc-aviso" style="display:block;margin-top:6px;">O evento ainda não aconteceu: o servidor só aceita o registro a partir do dia.</span>` : ""}</p>`
    + (linhas.length
      ? `<table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Situação</th><th>Justificativa</th><th>Registro</th><th>Ações</th></tr></thead><tbody>
        ${linhas.map(l => {
    const id = Number(l.congregacaoId);
    const [rotulo, classe] = calDe(CAL_ROTULO_PRESENCA, l.situacao, null) || [l.situacao || "—", "cal-st-cancelado"];
    return `<tr>
          <td><strong>${escaparHtmlEbd(l.congregacaoNome)}</strong></td>
          <td><span class="cal-selo ${escaparHtmlEbd(classe)}">${escaparHtmlEbd(rotulo)}</span></td>
          <td>${l.justificativa ? escaparHtmlEbd(l.justificativa) : "—"}</td>
          <td>${l.registradoEm ? `${escaparHtmlEbd(calDataHora(l.registradoEm))}${l.registradoPorNome ? `<br /><span class="psc-legenda">por ${escaparHtmlEbd(l.registradoPorNome)}</span>` : ""}` : "—"}</td>
          <td><button type="button" class="btn-link btn-link-sucesso" data-on-click="calMarcarPresencaAcao" data-args-click="${argsAttr(id, "PRESENTE")}">✅ Presente</button>
            <button type="button" class="btn-link" data-on-click="calAbrirJustificativaPresencaAcao" data-args-click="${argsAttr(id)}">🟡 Ausente justificada…</button>
            <button type="button" class="btn-link btn-link-perigo" data-on-click="calMarcarPresencaAcao" data-args-click="${argsAttr(id, "AUSENTE_INJUSTIFICADA")}">🔴 Ausente injustificada</button>
            <div id="calFormPresenca_${id}"></div></td>
        </tr>`;
  }).join("")}
      </tbody></table>`
      : "<p class='subtitle'>Nenhuma congregação para registrar.</p>");
}

function calNomeDaCongregacaoPresenca(congregacaoId) {
  const l = calPresencaCache && (calPresencaCache.congregacoes || []).find(x => Number(x.congregacaoId) === congregacaoId);
  return l ? l.congregacaoNome : `#${congregacaoId}`;
}

function calAbrirJustificativaPresencaAcao(congregacaoId) {
  const id = Number(congregacaoId);
  const area = calEl(`calFormPresenca_${id}`);
  if (!area) return;
  area.innerHTML = `<div class="cal-form-inline">
    <label for="calPresJust_${id}">Justificativa comprovada (médica ou de trabalho; mínimo 10, máximo 500 caracteres)</label>
    <textarea id="calPresJust_${id}" rows="2" maxlength="500" style="width:100%;"></textarea>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="calEnviarJustificativaPresencaAcao" data-args-click="${argsAttr(id)}">💾 Registrar ausência justificada</button>
      <button type="button" class="btn-link" data-on-click="calFecharJustificativaPresencaAcao" data-args-click="${argsAttr(id)}">cancelar</button>
    </div>
  </div>`;
}
function calFecharJustificativaPresencaAcao(congregacaoId) {
  const area = calEl(`calFormPresenca_${Number(congregacaoId)}`);
  if (area) area.innerHTML = "";
}
function calEnviarJustificativaPresencaAcao(congregacaoId) {
  const id = Number(congregacaoId);
  const justificativa = calTexto(`calPresJust_${id}`);
  if (justificativa.length < 10 || justificativa.length > 500) { mostrarToast("A justificativa deve ter de 10 a 500 caracteres.", "erro"); return Promise.resolve(); }
  return calRegistrarPresenca(id, "AUSENTE_JUSTIFICADA", justificativa);
}
function calMarcarPresencaAcao(congregacaoId, situacao) {
  const id = Number(congregacaoId);
  if (situacao !== "PRESENTE" && situacao !== "AUSENTE_INJUSTIFICADA") return Promise.resolve();
  if (situacao === "AUSENTE_INJUSTIFICADA" && !confirm(`Registrar ausência INJUSTIFICADA do dirigente de "${calNomeDaCongregacaoPresenca(id)}"? É fato passível de apuração disciplinar ética (Art. 81 §1º, III, "b").`)) return Promise.resolve();
  return calRegistrarPresenca(id, situacao);
}

async function calRegistrarPresenca(congregacaoId, situacao, justificativa) {
  if (!calPresencaCache || calAcaoEmCurso) return;
  const corpo = { eventoId: Number(calPresencaCache.eventoId), congregacaoId, situacao };
  if (justificativa) corpo.justificativa = justificativa;
  calAcaoEmCurso = true;
  try {
    const data = await calPostar("presencas-dirigente", corpo);
    // ausência injustificada devolve o aviso de apuração disciplinar: fica em destaque
    mostrarResultadoCal(data, "calResultadoPresenca", data.sucesso !== false && situacao === "AUSENTE_INJUSTIFICADA");
    if (data.sucesso === false) return;
    await carregarPresencaCalAcao();
  } finally {
    calAcaoEmCurso = false;
  }
}

// -- 7. Site — versão do sistema x versão publicada --
async function carregarSiteStatusCalAcao() {
  if (!calPodeVerAnos()) return;
  const cartao = calEl("calSiteCartao"), aviso = calEl("calResultadoSite");
  if (aviso) aviso.textContent = "Consultando o site…";
  const data = await calObter("site-status");
  if (aviso) aviso.textContent = "";
  if (data.sucesso === false) {
    if (cartao) cartao.innerHTML = `<p class="subtitle">${escaparHtmlEbd(calMensagemErro(data))}</p>`;
    return;
  }
  if (!cartao) return;
  cartao.innerHTML = `<div class="cal-site-cartao${data.sincronizado ? " cal-site-ok" : ""}">
    <p style="margin:0 0 8px;"><strong>${data.sincronizado ? "🟢 Sincronizado: o site já mostra a agenda de hoje" : "🟠 Ainda não sincronizado"}</strong></p>
    ${data.sincronizado ? "" : `<p style="margin:0 0 8px;">O site atualiza sozinho em até ~20 minutos.</p>`}
    <p style="margin:0 0 8px;">Versão do sistema: <span class="cal-code">${escaparHtmlEbd(data.versaoSistema || "—")}</span><br />
      Versão publicada no site: <span class="cal-code">${escaparHtmlEbd(data.versaoSite || "—")}</span></p>
    ${data.erro ? `<p class="psc-alerta" style="margin:0 0 8px;">⚠️ ${escaparHtmlEbd(data.erro)}</p>` : ""}
    ${data.siteUrl ? `<p class="psc-legenda" style="margin:0;">Site consultado: ${escaparHtmlEbd(data.siteUrl)}</p>` : ""}
  </div>`;
}

registrarAcoes({
  calAbrirAnoAcao, calAbrirEventoAcao, calAbrirFormAcaoDetalhe, calAbrirFormHomologarAcao, calAbrirJustificativaPresencaAcao, calAbrirPresencaAcao,
  calAbsorverEventoAcao, calAlternarRegraAcao, calAlternarTipoAcao, calCancelarEventoAcao, calCancelarRemarcacaoAcao, calCarregarEventosPresencaAcao,
  calConsolidarAnoAcao, calDeferirEventoAcao, calEditarRegraAcao, calEditarTipoAcao, calEnviarJustificativaPresencaAcao, calEnviarPropostaAcao,
  calFecharFormAcaoDetalhe, calFecharFormHomologarAcao, calFecharJustificativaPresencaAcao, calFiltrosAgendaMudaramAcao, calGerarCicloAcao,
  calHomologarAnoAcao, calIndeferirEventoAcao, calIrParaHojeAcao, calLimparFormRegraAcao, calLimparFormTipoAcao, calLimparPropostaAcao,
  calMarcarPresencaAcao, calMeuMudouCongregacaoAcao, calMostrarSecaoAcao, calMudarMesAcao, calPropAbrangenciaMudouAcao,
  calPropAgendarVerificacaoAcao, calPropTipoMudouAcao, calRedesenharAgendaAcao, calRemarcarAcao, calSalvarEdicaoEventoAcao, calSalvarRegraAcao,
  calSalvarTipoAcao, calSelecionarDiaAcao, calUsarSugestaoRetornoAcao, calUsarSugestaoVerifAcao, carregarAnosCalAcao, carregarLiturgiaCalAcao,
  carregarMinhaAgendaCalAcao, carregarPautaCalAcao, carregarPresencaCalAcao, carregarSiteStatusCalAcao, carregarTiposCalAcao
});
