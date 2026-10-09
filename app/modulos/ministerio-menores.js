// app/modulos/ministerio-menores.js — v7.7: Habilitação para Ministério com Menores (Lei 14.811/2024; Regimento Art. 133 §5º; LGPD art. 14).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- Ministério com Menores (v7.7) ----
// Duas telas sobre duas rotas do servidor (GestaoMinisterioMenores: /api/ministerio-menores/*; GestaoConsentimentoMenor: /api/consentimento-menor/*), todas com o
// prefixo "mnr":
//   1) Meu Painel -> Ministério com menores (qualquer login, inclusive PIN): a minha situação (apto ou não, o que falta, as validades), a política de comunicação, a confirmação
//      da ficha, a comunicação à Diretoria (auto-denúncia, Regimento Art. 133 §5º, V) e, para o responsável legal, a autorização sobre a imagem e a saúde dos menores dele;
//   2) aba "Ministério com Menores" (habilitacao_voluntarios): o painel de conformidade da congregação (ou do campo inteiro, só o nível geral), as ferramentas da Secretaria
//      (aceite da política e autorização em ficha de papel, confirmação da ficha cadastral, faixa etária da equipe) e, só para a Diretoria, as comunicações dos voluntários;
//   3) peças que outras telas usam: a lista de faixas (escalas.js), o aviso da foto de menor (meus-dados.js e pessoas.js) e os dois blocos de Meus Dados (meu-painel.js).
// Toda regra (quem está apto, o que bloqueia, prazos, o que cada texto diz) mora no servidor (shared/ministerioMenores.js e shared/menoresConsentimento.js): aqui só se monta
// o que o servidor devolve e se manda o que a pessoa fez; recusa de regra vem como 422 { mensagem } e é mostrada tal qual, sem limpar o formulário. PRIVACIDADE: o painel da
// Secretaria recebe só `codigo` + `rotulo` por bloqueio e vê "pendência com a Diretoria" no que é reservado; esta tela renderiza o que vier e nunca tenta adivinhar nem
// cruzar dados. Tudo que vem do servidor e entra em innerHTML passa por escaparHtmlEbd; as ações do HTML recebem só id numérico ou constante nossa (data-args por argsAttr).
// Decidir e liberar uma comunicação à Diretoria pedem a confirmação reforçada da vD.4 (428): o fetchProtegido já a trata (como em lavrar o Termo de Vistoria).
const MNR_ROTA = "ministerio-menores";
const MNR_ROTA_CONS = "consentimento-menor";
const MNR_SECOES = ["painel", "ferramentas", "comunicacoes"];
const MNR_FINALIDADES = ["IMAGEM", "SAUDE_CRACHA"];   // as duas autorizações do responsável (a ordem é a da tela)
const MNR_ROTULO_FINALIDADE = { IMAGEM: "Uso da imagem (foto)", SAUDE_CRACHA: "Alergia ou saúde no crachá" };
const MNR_AJUDA_FINALIDADE = {
  IMAGEM: "Autorizar permite a foto do rosto dele(a) no cadastro e no crachá. É opcional: sem a autorização ele(a) participa normalmente, só sem foto.",
  SAUDE_CRACHA: "Autorizar permite imprimir no crachá a alergia ou a condição de saúde que você escolher informar (o check-in infantil com crachá ainda está em preparo). É opcional."
};
// cor do selo de cada situação (painel, autorização do responsável, comunicação à Diretoria); código que não está aqui cai no cinza
const MNR_CLASSE_SELO = {
  APTO: "cal-st-homologado", VENCENDO: "cal-st-proposto", BLOQUEADO: "cal-st-indeferido",
  CONCEDIDO: "cal-st-homologado", REVOGADO: "cal-st-indeferido", NUNCA_DADO: "cal-st-cancelado", SEM_RESPONSAVEL_ATIVO: "cal-st-proposto",
  AGUARDANDO_DECISAO: "cal-st-proposto", MANTIDO: "cal-st-homologado", AFASTADO: "cal-st-indeferido", LIBERADO: "cal-st-homologado"
};
const MNR_ROTULO_STATUS = { APTO: "✅ Apto", VENCENDO: "⏳ Apto, mas algo vence logo", BLOQUEADO: "⛔ Bloqueado" };
const MNR_ROTULO_SITUACAO_AD = {
  AGUARDANDO_DECISAO: "Aguardando a decisão da Diretoria", MANTIDO: "Mantido: pode servir com menores", AFASTADO: "Afastado preventivamente", LIBERADO: "Afastamento levantado"
};
const MNR_ROTULO_VALIDADE = {
  antecedentes: "Certidões de antecedentes criminais", treinamento: "Treinamento de proteção de crianças e adolescentes",
  ficha: "Confirmação da ficha cadastral", esteira: "Habilitação de voluntário"
};
const MNR_ORDEM_VALIDADE = ["antecedentes", "treinamento", "ficha", "esteira"];
// o que dizer quando a validade não é uma data (ainda não houve, está incompleta...); `PENDENCIA_DIRETORIA` é o que o servidor mostra à Secretaria no lugar de uma restrição
const MNR_SITUACAO_VALIDADE = {
  AUSENTE: "ainda não registrado", INCOMPLETO: "incompleto", COM_RESTRICAO: "com pendência (fale com a Diretoria Executiva)", VENCIDO: "vencido",
  DISPENSADO: "dispensado (menor de 18 anos)", PENDENCIA_DIRETORIA: "pendência com a Diretoria Executiva"
};
const MNR_SEM_DATA_VALIDADE = { ficha: "ainda não confirmada", esteira: "ainda não concluída", antecedentes: "ainda não registradas", treinamento: "ainda não registrado" };
// como resolver cada problema que o servidor aponta ao publicar uma escala (a mensagem do servidor diz o QUÊ; isto diz o que fazer)
const MNR_COMO_RESOLVER = {
  SEM_FAIXA: "Vá em Habilitação de Voluntários e escolha a faixa etária da equipe.",
  SEM_CRIANCAS_PREVISTAS: "Informe quantas crianças a sala espera neste serviço e toque em Salvar.",
  ESCALADO_SEM_HABILITACAO: "Retire a pessoa da escala (ou ajude-a a regularizar a habilitação) antes de publicar.",
  UM_ADULTO_SOZINHO: "Escale mais um adulto habilitado nesta equipe.",
  PROPORCAO: "Escale mais adultos habilitados ou revise o número de crianças previstas."
};

let mnrDonoDaTela = null;            // matrícula + tipo de sessão de quem a tela foi montada (não vaza dado ao trocar de login)
let mnrCatalogos = null;             // GET ministerio-menores/catalogos (faixas, rótulos dos bloqueios, tipos de comunicação, papéis de quem está logado)
let mnrSecaoAtual = "painel";
let mnrSituacao = null;              // GET minha-situacao
let mnrPolitica = null;              // GET politica (o texto que a tela mostra: o hash dele é o que vai no aceite)
let mnrMenores = [];                 // GET consentimento-menor/meus-menores
let mnrPainel = null;                // GET painel / painel-geral
let mnrCongregacoes = null;          // GET catalogos/congregacoes (só as ativas)
let mnrEquipesFaixa = [];            // as equipes da congregação escolhida na ferramenta da faixa etária
let mnrMenorConsultado = null;       // { menorId, nome, responsaveis[] } da ficha de consentimento em consulta
let mnrComunicacoes = new Map();     // autoDenunciaId -> a comunicação como a tela a mostra (nome para a confirmação)
let mnrSeqMeu = 0, mnrSeqPainel = 0, mnrSeqCom = 0, mnrSeqFicha = 0, mnrSeqEquipes = 0;
const mnrEmCurso = new Set();        // trava duplo clique nas ações que gravam

// A aba abre para quem tem a habilitação (Secretaria) ou a vistoria (Diretoria e Conselho de Ética: as comunicações dos voluntários ficam aqui); cada seção
// só aparece para quem o SERVIDOR diz que pode (o catálogo traz os papéis da sessão).
function mnrPodeAba() { return authPermissoes.includes("habilitacao_voluntarios") || authPermissoes.includes("vistoria_antecedentes"); }
function mnrEhGestao() { return mnrCatalogos ? mnrCatalogos.papeis.gestao : authPermissoes.includes("habilitacao_voluntarios"); }
function mnrEhDiretoria() { return !!(mnrCatalogos && mnrCatalogos.papeis.diretoria); }
function mnrEhGeral() { return !!(mnrCatalogos && mnrCatalogos.papeis.geral); }

// ---- utilidades ----
function mnrEl(id) { return document.getElementById(id); }
function mnrTexto(id) { const c = mnrEl(id); return c ? String(c.value == null ? "" : c.value).trim() : ""; }
function mnrMarcado(id) { const c = mnrEl(id); return !!(c && c.checked); }
// matrícula/identificador digitado: inteiro maior que zero, ou 0
function mnrInteiro(texto) { const n = Number(texto); return Number.isInteger(n) && n >= 1 ? n : 0; }
function mnrMsgErro(data) { return (data && data.mensagem) || "Não foi possível concluir a operação agora."; }
function mnrTemMarca(texto) { return /[<>]/.test(texto); }
function mnrTem(mapa, chave) { return !!mapa && Object.prototype.hasOwnProperty.call(mapa, chave); }
function mnrClasse(codigo) { return mnrTem(MNR_CLASSE_SELO, codigo) ? MNR_CLASSE_SELO[codigo] : "cal-st-cancelado"; }
// mnr-selo: o rótulo vem do servidor e pode ser longo; no celular ele quebra a linha em vez de estourar o cartão
function mnrSelo(classe, rotulo) { return `<span class="cal-selo mnr-selo ${classe}">${escaparHtmlEbd(rotulo)}</span>`; }
function mnrCampo(rotulo, html) { return html ? `<div><dt>${rotulo}</dt><dd>${html}</dd></div>` : ""; }
function mnrData(valor) { return escaparHtmlEbd(calData(valor)); }
function mnrDataHora(valor) { return escaparHtmlEbd(calDataHora(valor)); }
function mnrOpcoes(lista, valor, rotulo, placeholder) {
  return (placeholder != null ? `<option value="">${escaparHtmlEbd(placeholder)}</option>` : "")
    + lista.map(x => `<option value="${escaparHtmlEbd(valor(x))}">${escaparHtmlEbd(rotulo(x))}</option>`).join("");
}
// preenche um <select> mantendo a escolha atual quando ela ainda existe
function mnrPreencherSelect(id, lista, valor, rotulo, placeholder) {
  const sel = mnrEl(id);
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = mnrOpcoes(lista, valor, rotulo, placeholder);
  if (atual && Array.from(sel.options).some(o => o.value === atual)) sel.value = atual;
}
function mnrRolarPara(id) {
  const el = mnrEl(id);
  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" });
}
function mnrEscreverAviso(id, texto, destaque) {
  const el = mnrEl(id);
  if (el) { el.textContent = texto; el.className = destaque ? "subtitle psc-aviso" : "subtitle"; }
}
async function mnrProtegerBotao(botao, tarefa, chave) {
  if (chave) {
    if (mnrEmCurso.has(chave)) { mostrarToast("Aguarde: o pedido anterior ainda está sendo processado.", "erro"); return undefined; }
    mnrEmCurso.add(chave);
  }
  if (botao) botao.disabled = true;
  try { return await tarefa(); } finally {
    if (botao) botao.disabled = false;
    if (chave) mnrEmCurso.delete(chave);
  }
}

// ---- datas e prazos (verde = em dia; amarelo = vence em até 60 dias; vermelho = vencido) ----
// Dias de hoje (Brasília) até a data AAAA-MM-DD: positivo = ainda falta; negativo = já passou; null = sem data que se entenda.
function mnrDiasAte(iso) {
  const alvo = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso == null ? "" : iso));
  const hoje = /^(\d{4})-(\d{2})-(\d{2})$/.exec(calHojeBrasilia());
  if (!alvo || !hoje) return null;
  return Math.round((Date.UTC(Number(alvo[1]), Number(alvo[2]) - 1, Number(alvo[3])) - Date.UTC(Number(hoje[1]), Number(hoje[2]) - 1, Number(hoje[3]))) / 86400000);
}
function mnrTextoDias(dias) {
  if (dias == null) return "";
  if (dias < 0) return dias === -1 ? "venceu ontem" : `venceu há ${-dias} dias`;
  if (dias === 0) return "vence hoje";
  return dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`;
}
function mnrLimiteAlerta() {
  const dias = mnrCatalogos && Array.isArray(mnrCatalogos.alertasDias) ? mnrCatalogos.alertasDias.map(Number).filter(Number.isFinite) : [];
  return dias.length ? Math.max(...dias) : 60;
}
function mnrClassePrazo(dias) {
  if (dias == null) return "cal-st-cancelado";
  if (dias < 0) return "cal-st-indeferido";
  return dias <= mnrLimiteAlerta() ? "cal-st-proposto" : "cal-st-homologado";
}
// "12/12/2026 — faltam 64 dias", na cor do prazo
function mnrSeloPrazo(iso) {
  const dias = mnrDiasAte(iso);
  return mnrSelo(mnrClassePrazo(dias), `${calData(iso)}${dias == null ? "" : ` — ${mnrTextoDias(dias)}`}`);
}
// A validade de um item: a data (com o prazo na cor certa) ou, quando não há data, o que o servidor disse que falta.
function mnrHtmlValidade(chave, v) {
  const info = v && typeof v === "object" ? v : {};
  const sit = typeof info.situacao === "string" ? info.situacao : "";
  const semData = mnrTem(MNR_SEM_DATA_VALIDADE, chave) ? MNR_SEM_DATA_VALIDADE[chave] : "sem data";
  if (sit && sit !== "VIGENTE" && sit !== "VENCIDO") {
    const texto = mnrTem(MNR_SITUACAO_VALIDADE, sit) ? MNR_SITUACAO_VALIDADE[sit] : sit;
    return mnrSelo(sit === "DISPENSADO" ? "cal-st-cancelado" : "cal-st-indeferido", texto);
  }
  if (info.validoAte) return mnrSeloPrazo(info.validoAte);
  return sit === "VENCIDO" ? mnrSelo("cal-st-indeferido", MNR_SITUACAO_VALIDADE.VENCIDO) : `<span class="psc-legenda">${escaparHtmlEbd(semData)}</span>`;
}
function mnrRenderValidades(validades) {
  const v = validades && typeof validades === "object" ? validades : {};
  return `<dl class="cal-dl">${MNR_ORDEM_VALIDADE.map(chave => mnrCampo(escaparHtmlEbd(MNR_ROTULO_VALIDADE[chave]), mnrHtmlValidade(chave, v[chave]))).join("")}</dl>`;
}
function mnrRotuloBloqueio(codigo) {
  const rotulos = mnrCatalogos ? mnrCatalogos.rotulosBloqueio : null;
  return mnrTem(rotulos, codigo) ? rotulos[codigo] : String(codigo);
}

// ---- chamadas à API (nunca lançam: erro de rede ou resposta que não é JSON viram { sucesso:false, mensagem }) ----
async function mnrRequisitar(rota, caminho, opcoes) {
  try {
    const res = await fetchProtegido(`${API_BASE}/${rota}/${caminho}`, opcoes);
    let corpo = null;
    try { corpo = await res.json(); } catch { /* sem JSON */ }
    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { sucesso: false, mensagem: `Resposta inesperada do servidor (${res.status}).`, httpStatus: res.status };
    if (res.status >= 400) corpo.sucesso = false;
    // 428: a confirmação reforçada (chave de acesso ou código por e-mail) não foi concluída; o fetchProtegido já tentou uma vez
    if (res.status === 428 || corpo.precisaFator) corpo.mensagem = "Este ato precisa de uma confirmação recente de quem você é (chave de acesso ou código por e-mail). Tente de novo e confirme quando a tela pedir.";
    corpo.httpStatus = res.status;
    // 403 e erro de servidor (5xx) o fetchProtegido já avisou com um toast; repetir o toast deixaria dois iguais na tela
    if (res.status === 403 || res.status >= 500) corpo.jaAvisado = true;
    return corpo;
  } catch (e) {
    // falha de rede e sessão expirada já foram avisadas por fetchProtegido (toast): aqui só vai o texto para a tela, sem outro toast
    if (e && e.message === "Sessão expirada") return { sucesso: false, jaAvisado: true, sessaoExpirada: true, mensagem: "Sua sessão expirou. Entre novamente." };
    return { sucesso: false, jaAvisado: true, falhaDeRede: true, mensagem: "Não foi possível falar com o servidor agora. Verifique a internet e tente de novo." };
  }
}
function mnrObter(caminho) { return mnrRequisitar(MNR_ROTA, caminho); }
function mnrPostar(caminho, corpo) {
  return mnrRequisitar(MNR_ROTA, caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
}
function mnrObterCons(caminho) { return mnrRequisitar(MNR_ROTA_CONS, caminho); }
function mnrPostarCons(caminho, corpo) {
  return mnrRequisitar(MNR_ROTA_CONS, caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
}
// Toast + texto fixo na tela (textContent: nada de HTML aqui). Quando o fetchProtegido já avisou (rede, sessão, 403, 5xx), só o texto vai para a tela.
function mnrMostrarResultado(data, idMensagem, destaque) {
  const texto = mnrMsgErro(data);
  if (!(data && data.jaAvisado)) mostrarToast(texto, data && data.sucesso === false ? "erro" : "sucesso");
  mnrEscreverAviso(idMensagem, texto, destaque);
}
// O servidor recusa (422) o aceite de um texto que mudou e marca o caso (`politicaMudou`/`termoMudou`); a frase fica só como reserva, para uma resposta de API mais antiga.
function mnrTextoMudou(data, chave) {
  return !!data && data.sucesso === false && data.httpStatus === 422 && (data[chave] === true || /mudou desde que você abriu/i.test(String(data.mensagem || "")));
}

async function mnrGarantirCatalogos(forcar) {
  if (mnrCatalogos && !forcar) return mnrCatalogos;
  const data = await mnrObter("catalogos");
  if (data.sucesso === false) { mnrCatalogos = null; return null; }
  const lista = (v) => (Array.isArray(v) ? v : []);
  const mapa = (v) => { const m = Object.create(null); if (v && typeof v === "object" && !Array.isArray(v)) Object.keys(v).forEach(k => { m[k] = String(v[k]); }); return m; };
  const papeis = data.papeis && typeof data.papeis === "object" ? data.papeis : {};
  mnrCatalogos = {
    faixas: lista(data.faixas), rotulosBloqueio: mapa(data.rotulosBloqueio), alertasDias: lista(data.alertasDias),
    tiposAutoDenuncia: lista(data.tiposAutoDenuncia), decisoesAutoDenuncia: lista(data.decisoesAutoDenuncia),
    papeis: { gestao: !!papeis.gestao, geral: !!papeis.geral, diretoria: !!papeis.diretoria }
  };
  return mnrCatalogos;
}
// As faixas etárias do catálogo como opções de um <select> (a faixa de cada equipe; escalas.js usa na tela de Habilitação)
function mnrOpcoesFaixa(placeholder, comRemover) {
  const faixas = mnrCatalogos ? mnrCatalogos.faixas : [];
  return mnrOpcoes(faixas, f => f.codigo, f => `${f.rotulo} — até ${Number(f.criancasPorAdultoPadrao)} crianças por adulto`, placeholder)
    + (comRemover ? `<option value="NENHUMA">Nenhuma (remover a faixa da equipe)</option>` : "");
}
function mnrRotuloFaixa(codigo) {
  const f = mnrCatalogos ? mnrCatalogos.faixas.find(x => x.codigo === codigo) : null;
  return f ? String(f.rotulo) : String(codigo);
}
// As congregações ativas (o painel e as ferramentas). Só guarda a lista se ela veio (falha não vira "nenhuma congregação" para sempre).
async function mnrGarantirCongregacoes() {
  if (mnrCongregacoes) return mnrCongregacoes;
  let lista = [];
  try { lista = await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/congregacoes`)); } catch { return []; }
  lista = lista.filter(c => c.ativa !== false);
  if (lista.length) mnrCongregacoes = lista;
  return lista;
}

// ---- troca de login: não deixa o dado da pessoa anterior na tela ----
const MNR_IDS_LISTAS = ["mnrSituacao", "mnrPoliticaCx", "mnrAdAndamento", "mnrMenoresLista", "mnrFichaValidade", "mnrPainelResumo", "mnrPainelPorCong", "mnrPainelLista",
  "mnrFcMenorInfo", "mnrComLista"];
const MNR_IDS_MENSAGENS = ["mnrMeuResultado", "mnrPoliticaMsg", "mnrFichaMsg", "mnrAdMsg", "mnrMenoresMsg", "mnrPainelResultado", "mnrRpMsg", "mnrFpMsg", "mnrFaixaMsg",
  "mnrFcMsg", "mnrComResultado", "mnrComAcaoMsg"];
const MNR_IDS_CAMPOS = ["mnrAdData", "mnrRpMatricula", "mnrRpReferencia", "mnrFpMatricula", "mnrFcMenor", "mnrFcRef"];
const MNR_IDS_MARCAS = ["mnrFichaMarca", "mnrAdCiente", "mnrFpMarca"];
const MNR_IDS_BLOCOS = ["mnrAdFormCx", "mnrFcForm"];
// selects montados pelo código: são esvaziados e voltam a ser preenchidos na próxima abertura da tela
const MNR_IDS_SELECTS = ["mnrAdTipo", "mnrPainelCong", "mnrFaixaCong", "mnrFaixaEquipe", "mnrFaixaValor", "mnrFcResp"];
// selects de opções fixas: voltam à primeira opção
const MNR_IDS_SELECTS_FIXOS = { mnrPainelFiltro: "todos", mnrFcFinalidade: "IMAGEM", mnrFcAcao: "concede" };
function mnrLimparTela() {
  mnrCatalogos = null; mnrSecaoAtual = "painel"; mnrSituacao = null; mnrPolitica = null; mnrMenores = []; mnrPainel = null; mnrEquipesFaixa = []; mnrMenorConsultado = null;
  mnrComunicacoes = new Map();
  // pedidos que ainda estão a caminho trazem dado do login anterior: a resposta velha é descartada
  mnrSeqMeu++; mnrSeqPainel++; mnrSeqCom++; mnrSeqFicha++; mnrSeqEquipes++;
  MNR_IDS_LISTAS.forEach(id => { const el = mnrEl(id); if (el) el.innerHTML = ""; });
  // a classe volta ao normal: uma mensagem em destaque (psc-aviso) esvaziada apareceria como uma caixa amarela vazia
  MNR_IDS_MENSAGENS.forEach(id => { const el = mnrEl(id); if (el) { el.textContent = ""; el.className = String(el.className || "").replace(/\bpsc-aviso\b/g, "").replace(/\bpsc-alerta\b/g, "").replace(/\s+/g, " ").trim(); } });
  MNR_IDS_CAMPOS.forEach(id => { const el = mnrEl(id); if (el) el.value = ""; });
  MNR_IDS_MARCAS.forEach(id => { const el = mnrEl(id); if (el) el.checked = false; });
  MNR_IDS_SELECTS.forEach(id => { const el = mnrEl(id); if (el) el.innerHTML = ""; });
  Object.keys(MNR_IDS_SELECTS_FIXOS).forEach(id => { const el = mnrEl(id); if (el) el.value = MNR_IDS_SELECTS_FIXOS[id]; });
  MNR_IDS_BLOCOS.forEach(id => { const el = mnrEl(id); if (el) el.style.display = "none"; });
  const semAcesso = mnrEl("mnrSemAcesso");
  if (semAcesso) semAcesso.style.display = "none";
  const ajuda = mnrEl("mnrPainelPrivacidade"), abertas = mnrEl("mnrComAbertas");
  if (ajuda) ajuda.style.display = "none";
  if (abertas) abertas.checked = true;
  mnrAplicarPermissoes();   // sem isto a pílula das comunicações da Diretoria ficava visível para quem entrou depois
}
// De quem é a tela: a matrícula E o tipo de sessão (senha de liderança × PIN). O mesmo líder que entra por PIN e depois por senha tem outros papéis (o catálogo traz
// `papeis` por sessão), então a tela é refeita.
function mnrChaveDoDono() { return `${authMatricula}|${sessaoDeLiderancaNaTela() ? "senha" : "pin"}`; }
function mnrVerificarDono() {
  if (mnrDonoDaTela !== mnrChaveDoDono()) { mnrLimparTela(); mnrDonoDaTela = mnrChaveDoDono(); }
}

// ============================================================================
// 1) MEU PAINEL -> MINISTÉRIO COM MENORES (qualquer login)
// ============================================================================
async function carregarMeuPainelMenoresAcao() {
  mnrVerificarDono();
  const aviso = mnrEl("mnrMeuResultado");
  if (!mnrEl("mnrSituacao")) return;
  if (!authToken) {
    mnrLimparTela();
    if (aviso) aviso.textContent = "Entre com a sua matrícula e o seu PIN (ou senha) para ver o ministério com menores.";
    return;
  }
  const seq = ++mnrSeqMeu;
  if (aviso) aviso.textContent = "Carregando…";
  // o catálogo traz `papeis` que dependem da SESSÃO (senha × PIN): é buscado de novo a cada abertura, nunca reaproveitado
  const [, situacao, politica, menores] = await Promise.all([mnrGarantirCatalogos(true), mnrObter("minha-situacao"), mnrObter("politica"), mnrObterCons("meus-menores")]);
  if (seq !== mnrSeqMeu) return;   // resposta velha: a pessoa trocou de login ou recarregou
  if (aviso) aviso.textContent = "";
  mnrAplicarSituacao(situacao);
  mnrAplicarPolitica(politica, situacao);
  mnrAplicarFicha(situacao);
  mnrAplicarComunicacao(situacao);
  mnrAplicarMenores(menores);
}

// -- a) a minha situação --
function mnrAplicarSituacao(resposta) {
  const cx = mnrEl("mnrSituacao");
  if (!cx) return;
  if (resposta.sucesso === false || !resposta.situacao || typeof resposta.situacao !== "object") {
    mnrSituacao = null;
    cx.innerHTML = `<p class="subtitle">${escaparHtmlEbd(mnrMsgErro(resposta))}</p>`;
    return;
  }
  mnrSituacao = resposta.situacao;
  const s = mnrSituacao;
  const bloqueios = Array.isArray(s.bloqueios) ? s.bloqueios : [];
  const equipes = Array.isArray(s.equipes) ? s.equipes : [];
  const proximo = s.proximoVencimento && typeof s.proximoVencimento === "object" ? s.proximoVencimento : null;
  const faltam = bloqueios.length
    ? `<h5>O que falta para você servir com menores</h5>
      <ul class="mnr-bloqueios">${bloqueios.map(b => `<li><strong>${escaparHtmlEbd(mnrRotuloBloqueio(b.codigo))}</strong><br />${escaparHtmlEbd(b.mensagem)}</li>`).join("")}</ul>`
    : `<p class="vol-selo-ok">✅ Está tudo em dia: você pode ser escalado nas equipes com crianças e adolescentes.</p>`;
  const menorDeIdade = s.apto && s.contaComoAdulto === false
    ? `<p class="psc-legenda">Você tem menos de 18 anos: serve só como auxiliar, sempre ao lado de adultos, e não conta como adulto da sala.</p>` : "";
  cx.innerHTML = `<div class="cal-cartao cartao-area-ebd mnr-situacao ${s.apto ? "mnr-situacao-ok" : "mnr-situacao-pendente"}">
    <h5>${s.apto ? mnrSelo(mnrClasse("APTO"), "✅ Apto a servir com menores") : mnrSelo(mnrClasse("BLOQUEADO"), "⛔ Ainda não habilitado")}</h5>
    ${menorDeIdade}
    ${faltam}
    ${proximo ? `<p class="mnr-proximo"><strong>Próximo vencimento:</strong> ${escaparHtmlEbd(proximo.rotulo)} — ${mnrSeloPrazo(proximo.data)}</p>` : ""}
    <h5>As minhas validades</h5>
    <p class="psc-legenda">Verde: em dia. Amarelo: vence em até ${Number(mnrLimiteAlerta())} dias, hora de renovar. Vermelho: vencido. Exemplo: a certidão emitida em 10/03 vale por cerca de 6 meses; renove antes de acabar, porque no dia do vencimento você sai das escalas com crianças.</p>
    ${mnrRenderValidades(s.validades)}
    <h5>Equipes com menores em que eu sirvo</h5>
    ${equipes.length ? `<ul class="vol-lista">${equipes.map(e => `<li>${escaparHtmlEbd(e.nome)}</li>`).join("")}</ul>` : "<p class='subtitle'>Você não está em nenhuma equipe com contato com menores.</p>"}
  </div>`;
}

// -- b) a política de comunicação --
function mnrAplicarPolitica(resposta, situacao) {
  const cx = mnrEl("mnrPoliticaCx");
  if (!cx) return;
  const p = resposta.politica && typeof resposta.politica === "object" ? resposta.politica : null;
  if (resposta.sucesso === false || !p) {
    mnrPolitica = null;
    cx.innerHTML = `<p class="subtitle">${escaparHtmlEbd(mnrMsgErro(resposta))}</p>`;
    return;
  }
  mnrPolitica = p;
  const itens = Array.isArray(p.itens) ? p.itens : [];
  // "aceita" vem junto do texto (GET politica); a marca que a situação traz (politica.aceita) vale como reforço se uma das duas respostas faltar
  const aceita = resposta.aceita === true || !!(situacao && situacao.situacao && situacao.situacao.politica && situacao.situacao.politica.aceita);
  const texto = `<p class="psc-legenda">Versão ${escaparHtmlEbd(p.versao)} do texto · código de conferência do texto: <span class="cal-code">${escaparHtmlEbd(p.hash)}</span></p>
    <ol class="vol-termo-itens">${itens.map(i => `<li>${escaparHtmlEbd(i.texto)}</li>`).join("")}</ol>`;
  cx.innerHTML = aceita
    ? `<p class="vol-selo-ok">✅ Você já aceitou esta política.</p>
      <details class="mnr-detalhes"><summary>Reler o texto da política</summary><h5>${escaparHtmlEbd(p.titulo)}</h5>${texto}</details>`
    : `<h5>${escaparHtmlEbd(p.titulo)}</h5>
      <p class="subtitle">Leia com calma. É o combinado que protege as crianças e quem serve com elas: por exemplo, conversa com menor só em grupo oficial, nunca a sós por mensagem.</p>
      ${texto}
      <label class="opcao-checkbox vol-aceite"><input type="checkbox" id="mnrPoliticaAceite" data-texto-hash="${escaparHtmlEbd(p.hash)}" data-on-change="mnrAtualizarBotaoPoliticaAcao" /> ${escaparHtmlEbd(p.aceite)}</label>
      <p class="psc-legenda">Marcar a caixa vale como a sua assinatura eletrônica: a Igreja guarda a versão do texto, o seu IP, a data e a hora do aceite.</p>
      <div class="psc-acoes"><button type="button" class="btn-confirmar" id="mnrPoliticaBotao" style="width:auto;margin:0;" disabled data-on-click="mnrAceitarPoliticaAcao" data-args-click="${argsAttr(ARG.elemento)}">✍️ Aceitar a política</button></div>`;
}
function mnrAtualizarBotaoPoliticaAcao() {
  const caixa = mnrEl("mnrPoliticaAceite"), botao = mnrEl("mnrPoliticaBotao");
  if (caixa && botao) botao.disabled = !caixa.checked;
}
const MNR_AVISO_POLITICA_MUDOU = "O texto da política foi atualizado desde que você abriu esta tela. Já mostramos o texto novo logo acima: leia de novo com calma e, se concordar, marque a caixa e aceite.";
async function mnrAceitarPoliticaAcao(botao) {
  const caixa = mnrEl("mnrPoliticaAceite");
  if (!caixa || !caixa.checked) { mnrEscreverAviso("mnrPoliticaMsg", "Marque a caixa para aceitar a política.", true); return; }
  // o hash vai junto do texto que a tela mostrou (guardado na própria caixa, vindo de politica → hash): nunca é recalculado aqui
  const textoHash = String(caixa.getAttribute("data-texto-hash") || "");
  const recarregar = async () => {
    mostrarToast(MNR_AVISO_POLITICA_MUDOU, "erro");
    await carregarMeuPainelMenoresAcao();
    mnrEscreverAviso("mnrPoliticaMsg", MNR_AVISO_POLITICA_MUDOU, true);
  };
  if (!textoHash) { await recarregar(); return; }
  await mnrProtegerBotao(botao, async () => {
    const data = await mnrPostar("aceitar-politica", { aceito: true, textoHash });
    // o texto mudou enquanto a pessoa lia: recarrega (texto e hash novos, caixa desmarcada) e pede que leia de novo antes de aceitar
    if (mnrTextoMudou(data, "politicaMudou")) { await recarregar(); return; }
    mnrMostrarResultado(data, "mnrPoliticaMsg", false);
    if (data.sucesso === false) return;
    await carregarMeuPainelMenoresAcao();
    mnrEscreverAviso("mnrPoliticaMsg", mnrMsgErro(data), false);
  }, "politica");
}

// -- c) confirmar a ficha (vale 6 meses) --
function mnrAplicarFicha(resposta) {
  const cx = mnrEl("mnrFichaValidade");
  if (!cx) return;
  if (resposta.sucesso === false || !resposta.situacao) { cx.innerHTML = ""; return; }
  const v = resposta.situacao.validades && typeof resposta.situacao.validades === "object" ? resposta.situacao.validades : {};
  cx.innerHTML = `A sua confirmação atual: ${mnrHtmlValidade("ficha", v.ficha)}`;
}
async function mnrConfirmarFichaAcao(botao) {
  if (!mnrMarcado("mnrFichaMarca")) { mnrEscreverAviso("mnrFichaMsg", "Marque a caixa para confirmar que os seus dados estão atualizados.", true); return; }
  await mnrProtegerBotao(botao, async () => {
    const data = await mnrPostar("confirmar-ficha", { confirmo: true });
    mnrMostrarResultado(data, "mnrFichaMsg", false);
    if (data.sucesso === false) return;
    const texto = mnrMsgErro(data);
    const caixa = mnrEl("mnrFichaMarca");
    if (caixa) caixa.checked = false;
    await carregarMeuPainelMenoresAcao();
    mnrEscreverAviso("mnrFichaMsg", texto, false);
  }, "ficha");
}

// -- d) comunicar à Diretoria (auto-denúncia) --
function mnrSituacaoAutoDenuncia(a) {
  if (a.liberadoEm) return "LIBERADO";
  if (a.emAnalise || !a.decisao) return "AGUARDANDO_DECISAO";
  return a.decisao === "MANTIDO" ? "MANTIDO" : "AFASTADO";
}
// O que a pessoa lê sobre o andamento da comunicação dela (texto puro: quem usa escapa)
function mnrTextoAndamento(sit, a) {
  const quando = a.decididaEm ? ` em ${calData(a.decididaEm)}` : "";
  if (sit === "AGUARDANDO_DECISAO") return `A Diretoria Executiva recebeu a sua comunicação em ${calData(a.declaradaEm)} e ainda vai decidir. Enquanto isso, o seu contato com menores fica suspenso. Isso não é punição e não afeta os seus outros serviços.`;
  if (sit === "MANTIDO") return `A Diretoria decidiu${quando}: ${a.decisaoRotulo || "mantido"}. Você volta a poder servir com menores, desde que a sua habilitação esteja em dia.`;
  if (sit === "AFASTADO") return `A Diretoria decidiu${quando}: ${a.decisaoRotulo || "afastado preventivamente"}. O afastamento vale até a Diretoria levantá-lo; ela entrará em contato com você. Os seus outros serviços não mudam.`;
  return `A Diretoria levantou o afastamento em ${calData(a.liberadoEm)}. Você volta a poder servir com menores, desde que a sua habilitação esteja em dia.`;
}
function mnrAplicarComunicacao(resposta) {
  const andamento = mnrEl("mnrAdAndamento"), formCx = mnrEl("mnrAdFormCx"), resumo = mnrEl("mnrAdResumo"), detalhes = mnrEl("mnrAdDetalhes");
  if (!andamento || !formCx) return;
  const cat = mnrCatalogos;
  if (resposta.sucesso === false || !resposta.situacao || !cat) { andamento.innerHTML = ""; formCx.style.display = "none"; return; }
  mnrPreencherSelect("mnrAdTipo", cat.tiposAutoDenuncia, t => t.codigo, t => t.rotulo, "— escolha —");
  const a = resposta.situacao.autoDenuncia && typeof resposta.situacao.autoDenuncia === "object" ? resposta.situacao.autoDenuncia : null;
  if (!a) {
    andamento.innerHTML = "";
    formCx.style.display = "";
    if (resumo) resumo.textContent = "📣 Comunicar à Diretoria";
    if (detalhes) detalhes.open = true;
    return;
  }
  const sit = mnrSituacaoAutoDenuncia(a);
  andamento.innerHTML = `<div class="cal-cartao cartao-area-ebd">
    <h5>${mnrSelo(mnrClasse(sit), MNR_ROTULO_SITUACAO_AD[sit])}</h5>
    <p style="margin:4px 0;">${escaparHtmlEbd(mnrTextoAndamento(sit, a))}</p>
    <p class="psc-legenda">${escaparHtmlEbd(a.tipoRotulo || a.tipo)} · data em que você soube: ${mnrData(a.dataCiencia)} · comunicada em ${mnrData(a.declaradaEm)}</p>
  </div>`;
  // uma comunicação ainda aberta (sem decisão ou com afastamento em vigor) não admite outra; uma já encerrada deixa comunicar um fato novo
  const encerrada = sit === "MANTIDO" || sit === "LIBERADO";
  formCx.style.display = encerrada ? "" : "none";
  if (resumo) resumo.textContent = "📣 Comunicar um fato novo";
  if (detalhes) detalhes.open = false;
}
async function mnrComunicarAcao(botao) {
  const tipo = mnrTexto("mnrAdTipo"), dataCiencia = mnrTexto("mnrAdData");
  const erro = (texto) => { mostrarToast(texto, "erro"); mnrEscreverAviso("mnrAdMsg", texto, true); };
  if (!tipo) { erro("Escolha o que você está respondendo: inquérito policial, processo criminal ou outro procedimento criminal."); return; }
  if (!dataCiencia) { erro("Informe a data em que você soube (dia, mês e ano)."); return; }
  if (dataCiencia > calHojeBrasilia()) { erro("A data em que você soube não pode estar no futuro."); return; }
  if (dataCiencia < "1990-01-01") { erro("Confira a data em que você soube: ela está muito antiga."); return; }
  if (!mnrMarcado("mnrAdCiente")) { erro("Marque que você está ciente: a comunicação vai à Diretoria e suspende o seu contato com menores até a decisão."); return; }
  const cat = mnrCatalogos ? mnrCatalogos.tiposAutoDenuncia.find(t => t.codigo === tipo) : null;
  const aviso = `Comunicar à Diretoria Executiva que você responde a ${cat ? String(cat.rotulo).toLowerCase() : "um procedimento criminal"} (soube em ${calData(dataCiencia)})? Por cautela, o seu contato com menores fica suspenso até a Diretoria decidir, e você sai das escalas futuras com menores. Não é punição e não afeta os seus outros serviços. Só a Diretoria encerra a comunicação.`;
  if (!(await confirmarAcao(aviso, "Comunicar à Diretoria"))) return;
  await mnrProtegerBotao(botao, async () => {
    const data = await mnrPostar("auto-denuncia", { tipo, dataCiencia, ciente: true });
    mnrMostrarResultado(data, "mnrAdMsg", false);
    if (data.sucesso === false) return;   // recusa de regra: mensagem do servidor e formulário intacto
    const texto = mnrMsgErro(data);
    const desmarcadas = Number(data.escalasDesmarcadas);
    mnrEl("mnrAdData").value = "";
    mnrEl("mnrAdCiente").checked = false;
    await carregarMeuPainelMenoresAcao();
    mnrEscreverAviso("mnrAdMsg", desmarcadas > 0 ? `${texto} (${desmarcadas} escala(s) futura(s) com menores foram desmarcadas.)` : texto, false);
  }, "comunicar");
}

// -- e) menores sob a minha responsabilidade (autorização do responsável, LGPD art. 14) --
function mnrAplicarMenores(resposta) {
  const cx = mnrEl("mnrMenoresLista");
  if (!cx) return;
  if (resposta.sucesso === false || !Array.isArray(resposta.menores)) {
    mnrMenores = [];
    cx.innerHTML = `<p class="subtitle">${escaparHtmlEbd(mnrMsgErro(resposta))}</p>`;
    return;
  }
  mnrMenores = resposta.menores;
  cx.innerHTML = mnrMenores.length
    ? mnrMenores.map(mnrRenderMenor).join("")
    : "<p class='subtitle'>Você não consta como responsável de nenhum menor de 18 anos. Se é pai, mãe ou tutor de um menor, peça à Secretaria da sua congregação para cadastrar você como responsável (com um documento que comprove): depois disso, as autorizações aparecem aqui.</p>";
}
function mnrRenderMenor(m) {
  const id = Number(m.menorId);
  const estados = m.estados && typeof m.estados === "object" ? m.estados : {};
  const idade = Number.isFinite(Number(m.idade)) ? `${Number(m.idade)} anos · ` : "";
  return `<div class="cal-cartao cartao-area-ebd">
    <h5>${escaparHtmlEbd(m.nome)} <span class="psc-legenda">${idade}${escaparHtmlEbd(m.rotuloVinculo || "sob a sua responsabilidade")}</span></h5>
    ${MNR_FINALIDADES.map(f => mnrRenderEstado(id, f, estados[f], m.nome)).join("")}
  </div>`;
}
function mnrRenderEstado(menorId, finalidade, e, nomeMenor) {
  if (!e || typeof e !== "object") return "";
  const situacao = String(e.situacao || "");
  const botoes = [];
  // autorizar (ou autorizar de novo, quando a anterior foi revogada, perdeu o responsável ou é de um texto antigo)
  if (e.podeConceder && (!e.vigente || e.desatualizado)) {
    botoes.push(`<button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="mnrAbrirAutorizacaoAcao" data-args-click="${argsAttr(menorId, finalidade)}">${e.vigente ? "Ler o texto novo e autorizar de novo" : "Ler o texto e autorizar"}</button>`);
  }
  // revogar: enquanto houver autorização guardada (vigente, ou de um responsável que saiu)
  if (situacao === "CONCEDIDO" || (situacao === "SEM_RESPONSAVEL_ATIVO" && e.quemAutorizouSaiu)) {
    botoes.push(`<button type="button" class="btn-link btn-link-perigo" data-on-click="mnrRevogarAcao" data-args-click="${argsAttr(menorId, finalidade, ARG.elemento)}">Revogar a autorização</button>`);
  }
  const detalhe = e.rotuloForma ? `${escaparHtmlEbd(e.rotuloForma)}${e.registradoEm ? ` · ${mnrDataHora(e.registradoEm)}` : ""}` : "";
  return `<div class="mnr-estado">
    <p style="margin:4px 0;"><strong>${escaparHtmlEbd(e.rotuloFinalidade || MNR_ROTULO_FINALIDADE[finalidade])}</strong> ${mnrSelo(mnrClasse(situacao), e.rotulo || situacao)}</p>
    <p style="margin:4px 0;">${escaparHtmlEbd(e.mensagem)}</p>
    ${detalhe ? `<p class="psc-legenda">${detalhe}${e.concedidoPorVoce ? " · dada por você" : ""}</p>` : ""}
    ${e.desatualizado ? `<p class="psc-legenda">O texto da autorização foi atualizado depois da sua: para valer com o texto novo, autorize de novo.</p>` : ""}
    <p class="psc-legenda">${escaparHtmlEbd(MNR_AJUDA_FINALIDADE[finalidade])}</p>
    ${botoes.length ? `<div class="psc-acoes">${botoes.join(" ")}</div>` : ""}
    <div id="mnrAutForm${menorId}_${finalidade}"></div>
  </div>`;
}
function mnrFinalidadeValida(bruta) { return bruta === "IMAGEM" ? "IMAGEM" : bruta === "SAUDE_CRACHA" ? "SAUDE_CRACHA" : ""; }   // só as duas constantes nossas entram em id e argumento
function mnrMenorDaLista(menorId) { return mnrMenores.find(x => Number(x.menorId) === Number(menorId)) || null; }

// Abre o texto (sempre o do servidor, na hora): o hash dele é o que vai junto da autorização.
async function mnrAbrirAutorizacaoAcao(menorId, finalidadeBruta) {
  const id = Number(menorId), finalidade = mnrFinalidadeValida(finalidadeBruta);
  const area = mnrEl(`mnrAutForm${id}_${finalidade}`);
  if (!finalidade || !area) return;
  const seq = mnrSeqMeu;   // só uma recarga da tela ou a troca de login invalida este pedido (dois textos podem ser abertos ao mesmo tempo)
  area.innerHTML = `<p class="subtitle" role="status">Carregando o texto…</p>`;
  const data = await mnrObterCons("textos");
  if (seq !== mnrSeqMeu) return;   // a tela foi recarregada ou a pessoa trocou de login
  const texto = data.sucesso === false || !Array.isArray(data.textos) ? null : data.textos.find(t => t && t.finalidade === finalidade);
  if (!texto) { area.innerHTML = `<p class="subtitle" role="status">${escaparHtmlEbd(data.sucesso === false ? mnrMsgErro(data) : "Não foi possível carregar o texto da autorização agora. Tente de novo.")}</p>`; return; }
  const menor = mnrMenorDaLista(id);
  const itens = Array.isArray(texto.itens) ? texto.itens : [];
  area.innerHTML = `<div class="cal-form-inline">
    <strong>${escaparHtmlEbd(texto.titulo)}</strong>
    <p class="psc-legenda">Menor: ${escaparHtmlEbd(menor ? menor.nome : "")} · versão ${escaparHtmlEbd(texto.versao)} do texto · código de conferência do texto: <span class="cal-code">${escaparHtmlEbd(texto.hash)}</span></p>
    <p class="subtitle" style="margin:4px 0 8px;">Autorizar é opcional: se você não autorizar, o(a) menor participa normalmente. Você pode revogar quando quiser, de graça e sem explicar.</p>
    <ol class="vol-termo-itens">${itens.map(i => `<li>${escaparHtmlEbd(i.texto)}<br /><small class="vol-base">${escaparHtmlEbd(i.base)}</small></li>`).join("")}</ol>
    <label class="opcao-checkbox vol-aceite"><input type="checkbox" id="mnrAutCaixa${id}_${finalidade}" data-texto-hash="${escaparHtmlEbd(texto.hash)}" data-on-change="mnrAtualizarBotaoAutorizarAcao" data-args-change="${argsAttr(id, finalidade)}" /> ${escaparHtmlEbd(texto.aceite)}</label>
    <p class="psc-legenda">Marcar a caixa vale como a sua assinatura eletrônica: a Igreja guarda a versão do texto, o seu IP, a data e a hora.</p>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar" id="mnrAutBotao${id}_${finalidade}" style="width:auto;margin:0;" disabled data-on-click="mnrConcederAcao" data-args-click="${argsAttr(id, finalidade, ARG.elemento)}">✍️ Autorizar</button>
      <button type="button" class="btn-link" data-on-click="mnrFecharAutorizacaoAcao" data-args-click="${argsAttr(id, finalidade)}">cancelar</button>
    </div>
  </div>`;
}
function mnrFecharAutorizacaoAcao(menorId, finalidadeBruta) {
  const area = mnrEl(`mnrAutForm${Number(menorId)}_${mnrFinalidadeValida(finalidadeBruta)}`);
  if (area) area.innerHTML = "";
}
function mnrAtualizarBotaoAutorizarAcao(menorId, finalidadeBruta) {
  const sufixo = `${Number(menorId)}_${mnrFinalidadeValida(finalidadeBruta)}`;
  const caixa = mnrEl(`mnrAutCaixa${sufixo}`), botao = mnrEl(`mnrAutBotao${sufixo}`);
  if (caixa && botao) botao.disabled = !caixa.checked;
}
const MNR_AVISO_TEXTO_MUDOU = "O texto da autorização foi atualizado desde que você abriu esta tela. Já mostramos o texto novo: leia de novo com calma e, se concordar, marque a caixa e autorize.";
async function mnrConcederAcao(menorId, finalidadeBruta, botao) {
  const id = Number(menorId), finalidade = mnrFinalidadeValida(finalidadeBruta);
  if (!finalidade) return;
  const caixa = mnrEl(`mnrAutCaixa${id}_${finalidade}`);
  if (!caixa || !caixa.checked) { mnrEscreverAviso("mnrMenoresMsg", "Marque a caixa para autorizar.", true); return; }
  // o hash vai junto do texto que a tela mostrou (guardado na própria caixa, vindo de textos → hash): nunca é recalculado aqui
  const termoHash = String(caixa.getAttribute("data-texto-hash") || "");
  const reabrir = async () => {
    mostrarToast(MNR_AVISO_TEXTO_MUDOU, "erro");
    await mnrAbrirAutorizacaoAcao(id, finalidade);
    mnrEscreverAviso("mnrMenoresMsg", MNR_AVISO_TEXTO_MUDOU, true);
  };
  if (!termoHash) { await reabrir(); return; }
  await mnrProtegerBotao(botao, async () => {
    const data = await mnrPostarCons("conceder", { menorId: id, finalidade, aceito: true, termoHash });
    // o texto mudou enquanto a pessoa lia: o texto novo (e o hash novo) é aberto de novo, com a caixa desmarcada
    if (mnrTextoMudou(data, "termoMudou")) { await reabrir(); return; }
    mnrMostrarResultado(data, "mnrMenoresMsg", false);
    if (data.sucesso === false) return;
    await mnrRecarregarMenores(mnrMsgErro(data));
  }, `conceder${id}_${finalidade}`);
}
async function mnrRevogarAcao(menorId, finalidadeBruta, botao) {
  const id = Number(menorId), finalidade = mnrFinalidadeValida(finalidadeBruta);
  if (!finalidade) return;
  const menor = mnrMenorDaLista(id);
  const nome = menor ? menor.nome : "o(a) menor";
  const efeito = finalidade === "IMAGEM"
    ? `A foto de ${nome} será APAGADA do sistema e a imagem deixa de ser usada no cadastro, no crachá e nos materiais internos. A participação dele(a) não muda. Você pode autorizar de novo depois (e uma foto nova precisará ser enviada).`
    : `A informação de saúde de ${nome} deixa de ser usada no crachá e é apagada. A participação dele(a) não muda. Você pode autorizar de novo depois.`;
  if (!(await confirmarAcao(`Revogar a autorização "${MNR_ROTULO_FINALIDADE[finalidade].toLowerCase()}" de ${nome}? ${efeito}`, "Revogar"))) return;
  await mnrProtegerBotao(botao, async () => {
    const data = await mnrPostarCons("revogar", { menorId: id, finalidade });
    mnrMostrarResultado(data, "mnrMenoresMsg", false);
    if (data.sucesso === false) return;
    await mnrRecarregarMenores(mnrMsgErro(data));
  }, `revogar${id}_${finalidade}`);
}
// Depois de autorizar ou revogar só a lista dos menores é refeita (o resto da tela não mudou) e a mensagem do ato volta para o lugar dela.
async function mnrRecarregarMenores(mensagem) {
  const seq = mnrSeqMeu;
  const data = await mnrObterCons("meus-menores");
  if (seq !== mnrSeqMeu) return;   // a pessoa trocou de login enquanto a lista voltava
  mnrAplicarMenores(data);
  mnrEscreverAviso("mnrMenoresMsg", mensagem, false);
}

// ============================================================================
// 2) ABA "MINISTÉRIO COM MENORES" (habilitacao_voluntarios)
// ============================================================================
// O painel e as ferramentas são da gestão (habilitacao_voluntarios); as comunicações dos voluntários, só da Diretoria (o servidor também recusa a quem não é)
function mnrSecaoPermitida(secao) { return secao === "comunicacoes" ? mnrEhDiretoria() : (secao === "painel" || secao === "ferramentas") && mnrEhGestao(); }
function mnrAplicarPermissoes() {
  MNR_SECOES.forEach(nome => { const btn = mnrEl(`btnMnrSecao${capitalize(nome)}`); if (btn) btn.style.display = mnrSecaoPermitida(nome) ? "" : "none"; });
  const semAcesso = mnrEl("mnrSemAcesso");
  if (semAcesso) semAcesso.style.display = mnrCatalogos && !MNR_SECOES.some(mnrSecaoPermitida) ? "" : "none";
}
// As faixas etárias do catálogo num <select> já existente, mantendo a escolha atual quando ela ainda existe
function mnrPreencherFaixa(id, placeholder, comRemover) {
  const sel = mnrEl(id);
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = mnrOpcoesFaixa(placeholder, comRemover);
  if (atual && Array.from(sel.options).some(o => o.value === atual)) sel.value = atual;
}
const MNR_AVISO_SEM_CONGREGACOES = "Não foi possível carregar a lista de congregações. Abra esta aba de novo para tentar outra vez.";
async function carregarOpcoesMenoresAcao() {
  mnrVerificarDono();
  if (!mnrPodeAba()) return;
  await mnrGarantirCatalogos(true);   // os papéis (gestão, nível geral, Diretoria) dependem da sessão
  mnrAplicarPermissoes();
  const congregacoes = mnrEhGestao() ? await mnrGarantirCongregacoes() : [];
  // "campo inteiro" só para o nível geral (o servidor também recusa a quem não é)
  const lista = mnrEhGeral() ? [{ congregacaoId: "TODAS", nome: "Campo inteiro (todas as congregações)" }, ...congregacoes] : congregacoes;
  mnrPreencherSelect("mnrPainelCong", lista, c => String(c.congregacaoId), c => c.nome, "— escolha a congregação —");
  mnrPreencherSelect("mnrFaixaCong", congregacoes, c => String(c.congregacaoId), c => c.nome, "— escolha a congregação —");
  mnrPreencherFaixa("mnrFaixaValor", "— escolha a faixa —", true);
  const aviso = mnrEl("mnrPainelResultado");
  if (mnrEhGestao() && !congregacoes.length) mnrEscreverAviso("mnrPainelResultado", MNR_AVISO_SEM_CONGREGACOES, true);
  else if (aviso && aviso.textContent === MNR_AVISO_SEM_CONGREGACOES) mnrEscreverAviso("mnrPainelResultado", "", false);
  const secao = mnrSecaoPermitida(mnrSecaoAtual) ? mnrSecaoAtual : (MNR_SECOES.find(mnrSecaoPermitida) || "");
  mnrMostrarSecaoAcao(secao, secao !== "comunicacoes");
}
// `semCarregar`: só troca a seção, sem buscar dados.
function mnrMostrarSecaoAcao(secao, semCarregar) {
  if (!mnrSecaoPermitida(secao)) secao = MNR_SECOES.find(mnrSecaoPermitida) || "";
  mnrSecaoAtual = secao || "painel";
  MNR_SECOES.forEach(nome => {
    const div = mnrEl(`mnrSecao${capitalize(nome)}`);
    if (div) div.style.display = nome === secao ? "block" : "none";
    const btn = mnrEl(`btnMnrSecao${capitalize(nome)}`);
    if (btn && btn.classList) btn.classList.toggle("ativo", nome === secao);
  });
  if (semCarregar) return;
  if (secao === "comunicacoes") mnrCarregarComunicacoesAcao();
}

// -- a) o painel de conformidade --
async function mnrCarregarPainelAcao() {
  const aviso = mnrEl("mnrPainelResultado");
  const escolha = mnrTexto("mnrPainelCong");
  if (!escolha) { mnrEscreverAviso("mnrPainelResultado", "Escolha a congregação para ver o painel.", true); return; }
  let caminho;
  if (escolha === "TODAS") {
    if (!mnrEhGeral()) { mnrEscreverAviso("mnrPainelResultado", "O painel do campo inteiro é da Secretaria Geral. Escolha uma congregação.", true); return; }
    caminho = "painel-geral";
  } else {
    const congregacaoId = mnrInteiro(escolha);
    if (!congregacaoId) { mnrEscreverAviso("mnrPainelResultado", "Escolha a congregação para ver o painel.", true); return; }
    caminho = `painel?congregacaoId=${congregacaoId}`;
  }
  const seq = ++mnrSeqPainel;
  mnrEscreverAviso("mnrPainelResultado", "Carregando o painel…", false);
  const data = await mnrObter(caminho);
  if (seq !== mnrSeqPainel) return;   // resposta velha: outra congregação foi pedida depois, ou a pessoa trocou de login
  if (data.sucesso === false) {
    mnrPainel = null;
    ["mnrPainelResumo", "mnrPainelPorCong", "mnrPainelLista"].forEach(id => { const el = mnrEl(id); if (el) el.innerHTML = ""; });
    const ajuda = mnrEl("mnrPainelPrivacidade");
    if (ajuda) ajuda.style.display = "none";
    mnrEscreverAviso("mnrPainelResultado", mnrMsgErro(data), true);
    return;
  }
  mnrPainel = {
    resumo: data.resumo && typeof data.resumo === "object" ? data.resumo : {},
    porCongregacao: Array.isArray(data.porCongregacao) ? data.porCongregacao : [],
    voluntarios: Array.isArray(data.voluntarios) ? data.voluntarios : [],
    equipesSemMarca: Array.isArray(data.equipesSemMarca) ? data.equipesSemMarca : [],
    campoInteiro: escolha === "TODAS"
  };
  if (aviso) { aviso.textContent = ""; aviso.className = "subtitle"; }
  const ajuda = mnrEl("mnrPainelPrivacidade");
  if (ajuda) ajuda.style.display = "";
  mnrRenderPainel();
}
function mnrContador(valor, rotulo, classe) {
  return `<div class="mnr-contador${classe}"><span class="mnr-contador-valor">${Number(valor) || 0}</span><span class="mnr-contador-rotulo">${escaparHtmlEbd(rotulo)}</span></div>`;
}
function mnrRenderPainel() {
  const p = mnrPainel;
  if (!p) return;
  const r = p.resumo;
  const resumo = mnrEl("mnrPainelResumo"), porCong = mnrEl("mnrPainelPorCong");
  const motivos = r.porMotivo && typeof r.porMotivo === "object" ? Object.keys(r.porMotivo).map(c => ({ codigo: c, total: Number(r.porMotivo[c]) || 0 })).sort((a, b) => b.total - a.total) : [];
  // equipes que PARECEM de crianças pelo nome mas ainda não têm a marca "contato com menores" (a marca nasce desligada): sem ela ninguém é conferido para servir nelas
  const semMarca = p.equipesSemMarca.length
    ? `<div class="cnl-incompleto" role="status"><strong>Confira estas equipes:</strong> pelo nome parecem equipes de crianças, mas ainda não têm a marca "contato com menores". Sem a marca, ninguém é conferido para servir nelas. Marque em Habilitação de Voluntários, ao lado de cada equipe.
        <ul class="mnr-motivos">${p.equipesSemMarca.map(e => `<li>${escaparHtmlEbd(e.nome)}${e.congregacaoNome ? ` — ${escaparHtmlEbd(e.congregacaoNome)}` : ""}</li>`).join("")}</ul></div>` : "";
  if (resumo) resumo.innerHTML = `${semMarca}<div class="mnr-contadores">
      ${mnrContador(r.total, "Voluntários com menores", "")}
      ${mnrContador(r.aptos, "Aptos", " mnr-contador-ok")}
      ${mnrContador(r.vencendo, "Vencendo (até 60 dias)", " mnr-contador-alerta")}
      ${mnrContador(r.bloqueados, "Bloqueados", " mnr-contador-erro")}
    </div>
    ${motivos.length ? `<h5>Por que estão bloqueados</h5><ul class="mnr-motivos">${motivos.map(m => `<li>${escaparHtmlEbd(mnrRotuloBloqueio(m.codigo))} — <strong>${Number(m.total)}</strong> pessoa(s)</li>`).join("")}</ul>` : ""}`;
  if (porCong) porCong.innerHTML = p.campoInteiro && p.porCongregacao.length
    ? `<h5>Por congregação</h5>${p.porCongregacao.map(c => `<div class="cal-cartao cartao-area-ebd mnr-cong">
        <strong>${escaparHtmlEbd(c.congregacaoNome)}</strong>
        <span class="psc-legenda">${Number(c.total) || 0} voluntário(s) · ${Number(c.aptos) || 0} apto(s) · ${Number(c.vencendo) || 0} vencendo · ${Number(c.bloqueados) || 0} bloqueado(s)</span>
      </div>`).join("")}`
    : "";
  mnrRenderListaPainel();
}
// A lista de voluntários, no filtro de status escolhido (o filtro é só da tela: o servidor já mandou todos)
function mnrRenderListaPainel() {
  const lista = mnrEl("mnrPainelLista");
  if (!lista || !mnrPainel) return;
  const filtro = mnrTexto("mnrPainelFiltro");
  const todos = mnrPainel.voluntarios;
  const vistos = filtro && filtro !== "todos" ? todos.filter(v => v.status === filtro) : todos;
  lista.innerHTML = todos.length
    ? (vistos.length ? vistos.map(mnrRenderVoluntario).join("") : "<p class='subtitle'>Nenhum voluntário com esse filtro.</p>")
    : "<p class='subtitle'>Nenhuma pessoa serve em equipe com contato com menores nesta seleção. (A marca fica em Habilitação de Voluntários, em cada equipe.)</p>";
}
function mnrFiltrarPainelAcao() { mnrRenderListaPainel(); }
function mnrRenderVoluntario(v) {
  const bloqueios = Array.isArray(v.bloqueios) ? v.bloqueios : [];
  const equipes = Array.isArray(v.equipes) ? v.equipes : [];
  const proximo = v.proximoVencimento && typeof v.proximoVencimento === "object" ? v.proximoVencimento : null;
  const status = String(v.status || "");
  const detalhes = bloqueios.length
    ? `<ul class="mnr-bloqueios">${bloqueios.map(b => `<li>${escaparHtmlEbd(b.rotulo || b.codigo)}${b.venceuEm ? ` <span class="psc-legenda">(venceu em ${mnrData(b.venceuEm)})</span>` : ""}${b.elegivelEm ? ` <span class="psc-legenda">(poderá a partir de ${mnrData(b.elegivelEm)})</span>` : ""}</li>`).join("")}</ul>`
    : "";
  return `<div class="cal-cartao cartao-area-ebd mnr-vol">
    <h5>${escaparHtmlEbd(v.nome)} <span class="psc-legenda">matrícula ${Number(v.membroId)}${v.congregacaoNome ? ` · ${escaparHtmlEbd(v.congregacaoNome)}` : ""}</span> ${mnrSelo(mnrClasse(status), mnrTem(MNR_ROTULO_STATUS, status) ? MNR_ROTULO_STATUS[status] : status)}</h5>
    ${equipes.length ? `<p class="psc-legenda">Equipes com menores: ${equipes.map(e => escaparHtmlEbd(e)).join(", ")}</p>` : ""}
    ${detalhes}
    ${proximo ? `<p class="mnr-proximo"><strong>Próximo vencimento:</strong> ${escaparHtmlEbd(proximo.rotulo)} — ${mnrSeloPrazo(proximo.data)}</p>` : ""}
    ${mnrRenderValidades(v.validades)}
  </div>`;
}

// -- b) as ferramentas da Secretaria --
// Aceite da política em ficha assinada (quem não tem como aceitar pela internet). Quem registra não é quem aceita; o servidor também confere.
async function mnrRegistrarPoliticaAcao(botao) {
  const membroId = mnrInteiro(mnrTexto("mnrRpMatricula")), referencia = mnrTexto("mnrRpReferencia");
  const erro = (texto) => { mostrarToast(texto, "erro"); mnrEscreverAviso("mnrRpMsg", texto, true); };
  if (!membroId) { erro("Informe a matrícula de quem assinou a ficha da política."); return; }
  if (referencia.length < 3 || referencia.length > 200 || mnrTemMarca(referencia)) { erro("Diga onde a ficha assinada está arquivada (de 3 a 200 caracteres, sem < ou >), por exemplo: Pasta 3, ficha 12."); return; }
  if (!(await confirmarAcao(`Registrar que a pessoa da matrícula ${membroId} assinou a ficha da política de comunicação com menores (arquivada em "${referencia}")? O registro faz parte da prova e não pode ser apagado: confira a matrícula.`, "Registrar o aceite"))) return;
  await mnrProtegerBotao(botao, async () => {
    const data = await mnrPostar("registrar-politica", { membroId, referencia });
    mnrMostrarResultado(data, "mnrRpMsg", false);
    if (data.sucesso === false) return;
    mnrEl("mnrRpMatricula").value = "";
    mnrEl("mnrRpReferencia").value = "";
  }, "regPolitica");
}
// Confirmar a ficha cadastral de uma pessoa, depois de conferir os dados com ela (vale 6 meses)
async function mnrConfirmarFichaPessoaAcao(botao) {
  const membroId = mnrInteiro(mnrTexto("mnrFpMatricula"));
  const erro = (texto) => { mostrarToast(texto, "erro"); mnrEscreverAviso("mnrFpMsg", texto, true); };
  if (!membroId) { erro("Informe a matrícula da pessoa."); return; }
  if (!mnrMarcado("mnrFpMarca")) { erro("Marque que você conferiu os dados cadastrais com a pessoa (nome, telefone, e-mail e endereço)."); return; }
  if (!(await confirmarAcao(`Confirmar a ficha cadastral da pessoa da matrícula ${membroId}? A confirmação vale por 6 meses e fica registrada com o seu nome.`, "Confirmar a ficha"))) return;
  await mnrProtegerBotao(botao, async () => {
    const data = await mnrPostar("confirmar-ficha-pessoa", { membroId, confirmo: true });
    mnrMostrarResultado(data, "mnrFpMsg", false);
    if (data.sucesso === false) return;
    mnrEl("mnrFpMatricula").value = "";
    mnrEl("mnrFpMarca").checked = false;
  }, "fichaPessoa");
}
// Faixa etária da equipe (quantas crianças cada adulto pode acompanhar)
// A lista de equipes com a faixa que cada uma tem hoje (a escolha atual do <select> se mantém)
function mnrRepintarEquipesFaixa() {
  mnrPreencherSelect("mnrFaixaEquipe", mnrEquipesFaixa, e => String(e.equipeId), e => `${e.nome}${e.ativa === false ? " (inativa)" : ""} — ${e.faixaEtariaMenores ? `faixa: ${mnrRotuloFaixa(e.faixaEtariaMenores)}` : "sem faixa"}`, mnrEquipesFaixa.length ? "— escolha a equipe —" : "— nenhuma equipe —");
}
async function mnrCarregarEquipesFaixaAcao() {
  const congregacaoId = mnrInteiro(mnrTexto("mnrFaixaCong"));
  if (!congregacaoId) { mnrEscreverAviso("mnrFaixaMsg", "Escolha a congregação da equipe.", true); return; }
  const seq = ++mnrSeqEquipes;
  mnrEscreverAviso("mnrFaixaMsg", "Carregando as equipes…", false);
  let data;
  try {
    const res = await fetchProtegido(`${API_BASE}/escalas/equipes?congregacaoId=${congregacaoId}`);
    data = await res.json();
  } catch (e) {
    data = { sucesso: false, mensagem: e && e.message === "Sessão expirada" ? "Sua sessão expirou. Entre novamente." : "Não foi possível falar com o servidor agora. Verifique a internet e tente de novo." };
  }
  if (seq !== mnrSeqEquipes) return;
  if (!data || data.sucesso === false || !Array.isArray(data.equipes)) {
    mnrEquipesFaixa = [];
    mnrPreencherSelect("mnrFaixaEquipe", [], e => String(e.equipeId), e => e.nome, "— nenhuma equipe —");
    mnrEscreverAviso("mnrFaixaMsg", mnrMsgErro(data), true);
    return;
  }
  mnrEquipesFaixa = data.equipes;
  mnrRepintarEquipesFaixa();
  mnrEscreverAviso("mnrFaixaMsg", mnrEquipesFaixa.length ? "" : "Esta congregação ainda não tem equipes.", false);
}
async function mnrSalvarFaixaAcao(botao) {
  const equipeId = mnrInteiro(mnrTexto("mnrFaixaEquipe")), faixa = mnrTexto("mnrFaixaValor");
  const erro = (texto) => { mostrarToast(texto, "erro"); mnrEscreverAviso("mnrFaixaMsg", texto, true); };
  if (!equipeId) { erro("Escolha a equipe."); return; }
  if (!faixa) { erro("Escolha a faixa etária da equipe."); return; }
  await mnrProtegerBotao(botao, async () => {
    const data = await mnrPostar("equipe-faixa", { equipeId, faixa: faixa === "NENHUMA" ? null : faixa });
    mnrMostrarResultado(data, "mnrFaixaMsg", false);
    if (data && data.sucesso !== false) {
      const eq = mnrEquipesFaixa.find(x => Number(x.equipeId) === equipeId);
      if (eq) { eq.faixaEtariaMenores = faixa === "NENHUMA" ? null : faixa; mnrRepintarEquipesFaixa(); }
    }
  }, "faixa");
}
// A autorização do responsável, em ficha de papel: primeiro se consulta o menor (para ver o estado de cada autorização e quem são os responsáveis cadastrados)
async function mnrConsultarMenorAcao() {
  const menorId = mnrInteiro(mnrTexto("mnrFcMenor"));
  const info = mnrEl("mnrFcMenorInfo"), form = mnrEl("mnrFcForm");
  if (!menorId) { mnrEscreverAviso("mnrFcMsg", "Informe a matrícula do menor.", true); return; }
  const seq = ++mnrSeqFicha;
  mnrEscreverAviso("mnrFcMsg", "Consultando…", false);
  const data = await mnrObterCons(`menor?menorId=${menorId}`);
  if (seq !== mnrSeqFicha) return;
  mnrMenorConsultado = null;
  if (form) form.style.display = "none";
  if (data.sucesso === false || !data.menor || typeof data.menor !== "object") {
    if (info) info.innerHTML = "";
    mnrEscreverAviso("mnrFcMsg", mnrMsgErro(data), true);
    return;
  }
  mnrEscreverAviso("mnrFcMsg", "", false);
  const m = data.menor;
  const responsaveis = Array.isArray(data.responsaveis) ? data.responsaveis : [];
  const estados = data.estados && typeof data.estados === "object" ? data.estados : null;
  const cabecalho = `<h5>${escaparHtmlEbd(m.nome)} <span class="psc-legenda">matrícula ${Number(m.membroId)}${Number.isFinite(Number(m.idade)) ? ` · ${Number(m.idade)} anos` : ""}${m.congregacaoNome ? ` · ${escaparHtmlEbd(m.congregacaoNome)}` : ""}</span></h5>`;
  if (!estados) {
    // não é menor de 18 anos (ou falta a data de nascimento): não há autorização de responsável a registrar
    if (info) info.innerHTML = `<div class="cal-cartao cartao-area-ebd">${cabecalho}<p>${escaparHtmlEbd(data.mensagem || "Esta pessoa não tem autorização de responsável a registrar.")}</p></div>`;
    return;
  }
  mnrMenorConsultado = { menorId: Number(m.membroId), nome: String(m.nome), responsaveis };
  const linhasEstado = MNR_FINALIDADES.map(f => {
    const e = estados[f];
    if (!e || typeof e !== "object") return "";
    const ficha = e.referencia ? ` · ficha: ${escaparHtmlEbd(e.referencia)}` : "";
    return `<li><strong>${escaparHtmlEbd(e.rotuloFinalidade || MNR_ROTULO_FINALIDADE[f])}:</strong> ${mnrSelo(mnrClasse(String(e.situacao || "")), e.rotulo || e.situacao)} ${escaparHtmlEbd(e.mensagem)}${e.rotuloForma ? ` <span class="psc-legenda">(${escaparHtmlEbd(e.rotuloForma)}${e.registradoEm ? `, ${mnrDataHora(e.registradoEm)}` : ""}${ficha})</span>` : ""}</li>`;
  }).join("");
  if (info) info.innerHTML = `<div class="cal-cartao cartao-area-ebd">${cabecalho}
    <ul class="vol-lista">${linhasEstado}</ul>
    <p class="psc-legenda">Responsáveis cadastrados: ${responsaveis.length ? responsaveis.map(r => `${escaparHtmlEbd(r.nome)} (${escaparHtmlEbd(r.rotuloVinculo || r.vinculo)}, matrícula ${Number(r.membroId)})`).join("; ") : "nenhum"}</p>
  </div>`;
  if (!responsaveis.length) {
    mnrEscreverAviso("mnrFcMsg", "Este(a) menor está sem responsável cadastrado: cadastre o responsável (com o documento conferido) em Habilitação de Voluntários → Responsável legal de menor de idade antes de registrar a ficha.", true);
    return;
  }
  mnrPreencherSelect("mnrFcResp", responsaveis, r => String(r.membroId), r => `${r.nome} (${r.rotuloVinculo || r.vinculo}, matrícula ${Number(r.membroId)})`, "— quem assinou a ficha —");
  if (form) form.style.display = "";
}
async function mnrRegistrarFichaAcao(botao) {
  const c = mnrMenorConsultado;
  const erro = (texto) => { mostrarToast(texto, "erro"); mnrEscreverAviso("mnrFcMsg", texto, true); };
  if (!c) { erro("Consulte o menor antes de registrar a ficha."); return; }
  const responsavelId = mnrInteiro(mnrTexto("mnrFcResp")), finalidade = mnrFinalidadeValida(mnrTexto("mnrFcFinalidade")), referencia = mnrTexto("mnrFcRef");
  const concedido = mnrTexto("mnrFcAcao") !== "revoga";
  if (!responsavelId) { erro("Escolha quem assinou a ficha."); return; }
  if (!finalidade) { erro("Escolha o que a ficha autoriza ou revoga."); return; }
  if (referencia.length < 3 || referencia.length > 200 || mnrTemMarca(referencia)) { erro("Diga onde está a ficha assinada (de 3 a 200 caracteres, sem < ou >), por exemplo: Pasta 3, ficha 12."); return; }
  const responsavel = c.responsaveis.find(r => Number(r.membroId) === responsavelId);
  const quem = responsavel ? responsavel.nome : `a matrícula ${responsavelId}`;
  const efeito = !concedido && finalidade === "IMAGEM" ? " A foto do menor será apagada." : "";
  const aviso = `Registrar a ficha assinada por ${quem} sobre ${c.nome}: ${concedido ? "AUTORIZA" : "REVOGA"} (${MNR_ROTULO_FINALIDADE[finalidade].toLowerCase()})?${efeito} A ficha fica arquivada com você; o sistema guarda só onde ela está.`;
  if (!(await confirmarAcao(aviso, "Registrar a ficha"))) return;
  await mnrProtegerBotao(botao, async () => {
    const data = await mnrPostarCons("registrar-ficha", { menorId: c.menorId, responsavelId, finalidade, concedido, referencia });
    mnrMostrarResultado(data, "mnrFcMsg", false);
    if (data.sucesso === false) return;
    const texto = mnrMsgErro(data);
    mnrEl("mnrFcRef").value = "";
    await mnrConsultarMenorAcao();   // mostra o estado novo
    mnrEscreverAviso("mnrFcMsg", texto, false);
  }, "regFicha");
}

// -- c) as comunicações dos voluntários (só a Diretoria) --
async function mnrCarregarComunicacoesAcao() {
  const lista = mnrEl("mnrComLista");
  if (!lista) return;
  if (!mnrEhDiretoria()) { lista.innerHTML = ""; mnrEscreverAviso("mnrComResultado", "Esta área é da Diretoria Executiva e do Conselho de Ética.", true); return; }
  const abertas = mnrMarcado("mnrComAbertas");
  const seq = ++mnrSeqCom;
  mnrEscreverAviso("mnrComResultado", "Carregando as comunicações…", false);
  const data = await mnrObter(`auto-denuncias${abertas ? "?abertas=1" : ""}`);
  if (seq !== mnrSeqCom) return;
  if (data.sucesso === false || !Array.isArray(data.autoDenuncias)) {
    mnrComunicacoes = new Map();
    lista.innerHTML = "";
    mnrEscreverAviso("mnrComResultado", mnrMsgErro(data), true);
    return;
  }
  mnrComunicacoes = new Map();
  data.autoDenuncias.forEach(a => { if (a && a.autoDenunciaId != null) mnrComunicacoes.set(Number(a.autoDenunciaId), a); });
  const aguardando = data.autoDenuncias.filter(a => a.situacao === "AGUARDANDO_DECISAO").length;
  mnrEscreverAviso("mnrComResultado", data.autoDenuncias.length ? `${data.autoDenuncias.length} comunicação(ões)${aguardando ? ` — ${aguardando} aguardando a sua decisão` : ""}.` : "", false);
  lista.innerHTML = data.autoDenuncias.length
    ? data.autoDenuncias.map(mnrRenderComunicacao).join("")
    : `<p class='subtitle'>${abertas ? "Nenhuma comunicação aberta." : "Nenhuma comunicação registrada."}</p>`;
}
function mnrRenderComunicacao(a) {
  const id = Number(a.autoDenunciaId);
  const sit = String(a.situacao || "");
  const propria = String(a.membroId) === String(authMatricula);   // ninguém decide a própria comunicação (o servidor também recusa)
  const botoes = propria
    ? `<span class="psc-legenda">Esta é a sua própria comunicação: outra pessoa da Diretoria precisa decidir.</span>`
    : [
      sit === "AGUARDANDO_DECISAO" ? `<button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="mnrAbrirDecisaoAcao" data-args-click="${argsAttr(id, "decidir")}">⚖️ Decidir…</button>` : "",
      sit === "AFASTADO" ? `<button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="mnrAbrirDecisaoAcao" data-args-click="${argsAttr(id, "liberar")}">🔓 Liberar o afastamento…</button>` : ""
    ].filter(Boolean).join(" ");
  const decisao = a.decisao
    ? `${escaparHtmlEbd(a.decisaoRotulo || a.decisao)}${a.decididaEm ? ` em ${mnrDataHora(a.decididaEm)}` : ""}${a.decisaoObservacao ? `<br />${escaparHtmlEbd(a.decisaoObservacao)}` : ""}` : "";
  const liberacao = a.liberadoEm ? `${mnrDataHora(a.liberadoEm)}${a.liberacaoObservacao ? `<br />${escaparHtmlEbd(a.liberacaoObservacao)}` : ""}` : "";
  return `<div class="cal-cartao cartao-area-ebd">
    <h5>${escaparHtmlEbd(a.nome)} <span class="psc-legenda">matrícula ${Number(a.membroId)}${a.congregacaoNome ? ` · ${escaparHtmlEbd(a.congregacaoNome)}` : ""}</span> ${mnrSelo(mnrClasse(sit), mnrTem(MNR_ROTULO_SITUACAO_AD, sit) ? MNR_ROTULO_SITUACAO_AD[sit] : sit)}</h5>
    <dl class="cal-dl">
      ${mnrCampo("Responde a", escaparHtmlEbd(a.tipoRotulo || a.tipo))}
      ${mnrCampo("Data em que soube", a.dataCiencia ? mnrData(a.dataCiencia) : "")}
      ${mnrCampo("Comunicou em", a.declaradaEm ? mnrDataHora(a.declaradaEm) : "")}
      ${mnrCampo("Decisão da Diretoria", decisao)}
      ${mnrCampo("Afastamento levantado em", liberacao)}
    </dl>
    ${botoes ? `<div class="psc-acoes">${botoes}</div>` : ""}
    <div id="mnrComForm${id}"></div>
  </div>`;
}
const MNR_ACOES_COMUNICACAO = {
  decidir: { titulo: "Decidir sobre a comunicação", rota: "auto-denuncia-decidir", rotuloCampo: "Motivo da decisão (de 10 a 300 caracteres, sem citar nomes de terceiros)", confirmar: "⚖️ Registrar a decisão", classe: "" },
  liberar: { titulo: "Levantar o afastamento preventivo", rota: "auto-denuncia-liberar", rotuloCampo: "Motivo da liberação (de 10 a 300 caracteres, sem citar nomes de terceiros)", confirmar: "🔓 Levantar o afastamento", classe: "" }
};
const MNR_ROTULO_DECISAO = { MANTIDO: "Mantido: pode voltar a servir com menores", AFASTADO_PREVENTIVAMENTE: "Afastado preventivamente do ministério com menores" };
function mnrTipoDecisaoValido(bruto) { return bruto === "liberar" ? "liberar" : bruto === "decidir" ? "decidir" : ""; }
function mnrAbrirDecisaoAcao(autoDenunciaId, tipoBruto) {
  const id = Number(autoDenunciaId), tipo = mnrTipoDecisaoValido(tipoBruto);
  const area = mnrEl(`mnrComForm${id}`), a = mnrComunicacoes.get(id);
  if (!tipo || !area || !a) return;
  const regra = MNR_ACOES_COMUNICACAO[tipo];
  const decisoes = mnrCatalogos && mnrCatalogos.decisoesAutoDenuncia.length ? mnrCatalogos.decisoesAutoDenuncia : Object.keys(MNR_ROTULO_DECISAO).map(c => ({ codigo: c, rotulo: MNR_ROTULO_DECISAO[c] }));
  const campoDecisao = tipo === "decidir"
    ? `<label for="mnrComDecisao${id}">O que a Diretoria decide</label>
      <select id="mnrComDecisao${id}">${mnrOpcoes(decisoes, d => d.codigo, d => d.rotulo, "— escolha —")}</select>` : "";
  area.innerHTML = `<div class="cal-form-inline">
    <strong>${escaparHtmlEbd(regra.titulo)} de ${escaparHtmlEbd(a.nome)}</strong>
    <p class="cnl-aviso-senha" role="note">Este ato pede <strong>uma confirmação recente de quem você é</strong> (a chave de acesso do aparelho ou um código enviado ao seu e-mail): a tela pede na hora de registrar. A decisão fica registrada com o seu nome, e a pessoa é avisada.</p>
    ${campoDecisao}
    <label for="mnrComObs${id}">${escaparHtmlEbd(regra.rotuloCampo)}</label>
    <textarea id="mnrComObs${id}" rows="3" maxlength="300" style="width:100%;" data-on-input="mnrContarObsAcao" data-args-input="${argsAttr(id)}"></textarea>
    <p class="psc-legenda"><span id="mnrComContador${id}">0</span>/300 caracteres.</p>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar${escaparHtmlEbd(regra.classe)}" style="width:auto;margin:0;" data-on-click="mnrConfirmarDecisaoAcao" data-args-click="${argsAttr(id, tipo, ARG.elemento)}">${escaparHtmlEbd(regra.confirmar)}</button>
      <button type="button" class="btn-link" data-on-click="mnrFecharDecisaoAcao" data-args-click="${argsAttr(id)}">cancelar</button>
    </div>
  </div>`;
}
function mnrFecharDecisaoAcao(autoDenunciaId) {
  const area = mnrEl(`mnrComForm${Number(autoDenunciaId)}`);
  if (area) area.innerHTML = "";
}
function mnrContarObsAcao(autoDenunciaId) {
  const id = Number(autoDenunciaId);
  const campo = mnrEl(`mnrComObs${id}`), contador = mnrEl(`mnrComContador${id}`);
  if (!campo || !contador) return;
  const n = String(campo.value).trim().length;
  contador.textContent = String(n);
  contador.className = n > 0 && (n < 10 || n > 300) ? "psc-alerta" : "";   // vermelho enquanto falta (ou passa) do tamanho aceito
}
async function mnrConfirmarDecisaoAcao(autoDenunciaId, tipoBruto, botao) {
  const id = Number(autoDenunciaId), tipo = mnrTipoDecisaoValido(tipoBruto);
  const a = mnrComunicacoes.get(id);
  if (!tipo || !a) return;
  const regra = MNR_ACOES_COMUNICACAO[tipo];
  const observacao = mnrTexto(`mnrComObs${id}`);
  const decisao = tipo === "decidir" ? mnrTexto(`mnrComDecisao${id}`) : "";
  const erro = (texto) => { mostrarToast(texto, "erro"); };
  if (tipo === "decidir" && !decisao) { erro("Escolha o que a Diretoria decide."); return; }
  // a observação é conferida ANTES de enviar: o servidor pede a confirmação reforçada (428) antes de olhar o texto, e ninguém deve confirmar a identidade à toa
  if (observacao.length < 10 || observacao.length > 300 || mnrTemMarca(observacao)) { erro("Registre o motivo (de 10 a 300 caracteres, sem < ou >) e não cite nomes de terceiros."); return; }
  const rotuloDecisao = decisao ? (mnrTem(MNR_ROTULO_DECISAO, decisao) ? MNR_ROTULO_DECISAO[decisao] : decisao) : "";
  const aviso = tipo === "decidir"
    ? `Decidir sobre a comunicação de ${a.nome} (matrícula ${Number(a.membroId)}): "${rotuloDecisao}"? A decisão fica registrada com o seu nome, a pessoa é avisada e o contato dela com menores muda agora.`
    : `Levantar o afastamento preventivo de ${a.nome} (matrícula ${Number(a.membroId)})? A pessoa volta a poder servir com menores, desde que a habilitação esteja em dia, e é avisada.`;
  if (!(await confirmarAcao(aviso, tipo === "decidir" ? "Registrar a decisão" : "Levantar o afastamento"))) return;
  await mnrProtegerBotao(botao, async () => {
    const corpo = { autoDenunciaId: id, observacao };
    if (tipo === "decidir") corpo.decisao = decisao;
    const data = await mnrPostar(regra.rota, corpo);   // 428 (confirmação reforçada): o fetchProtegido confirma e repete a chamada, como em lavrar o Termo de Vistoria
    mnrMostrarResultado(data, "mnrComAcaoMsg", false);
    if (data.sucesso === false) return;   // recusa de regra (inclusive a confirmação que não veio): mensagem do servidor e formulário aberto, com o texto escrito
    const texto = mnrMsgErro(data);
    await mnrCarregarComunicacoesAcao();
    mnrEscreverAviso("mnrComAcaoMsg", texto, false);
  }, `decisao${id}`);
}

// ============================================================================
// 3) FOTO DE MENOR (meus-dados.js e pessoas.js)
// ============================================================================
// Idade em anos completos na data de hoje (Brasília), a partir de AAAA-MM-DD; null quando a data não se entende.
function mnrIdadeEm(nascimento) {
  const n = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(nascimento == null ? "" : nascimento));
  const h = /^(\d{4})-(\d{2})-(\d{2})$/.exec(calHojeBrasilia());
  if (!n || !h) return null;
  let idade = Number(h[1]) - Number(n[1]);
  if (Number(h[2]) < Number(n[2]) || (Number(h[2]) === Number(n[2]) && Number(h[3]) < Number(n[3]))) idade--;
  return idade;
}
// A pessoa tem menos de 18 anos pela data de nascimento do cadastro? (sem a data, não se presume menor: a mesma regra do servidor)
function mnrEhMenorDeIdade(pessoa) {
  const idade = pessoa ? mnrIdadeEm(pessoa.dataNascimento) : null;
  return idade != null && idade < 18;
}
// A foto de um menor só vale com a autorização do RESPONSÁVEL (não com o consentimento de foto da própria pessoa). Para a Secretaria (aba Foto, em Pessoas): confere o
// estado da imagem e, sem autorização, explica e esconde o envio. Se o estado não puder ser lido (a Secretaria de Pessoas pode não ver o menor), só explica: o servidor
// responde ao envio com a mesma regra.
async function mnrPrepararFotoDeMenor(membroId, pessoa) {
  const id = Number(membroId);
  const aviso = mnrEl("fotoMembroAvisoMenor"), envio = mnrEl("fotoMembroEnvio"), status = mnrEl("fotoMembroStatusConsentimento");
  if (!aviso || !envio) return;
  aviso.textContent = "";
  aviso.className = "subtitle";
  envio.style.display = "";
  if (!mnrEhMenorDeIdade(pessoa)) return;
  if (status) status.textContent = "";
  const data = await mnrObterCons(`menor?menorId=${id}`);
  if (Number(window._membroFotoAtual) !== id) return;   // a Secretaria já abriu outra pessoa
  const imagem = data.sucesso !== false && data.estados && typeof data.estados === "object" ? data.estados.IMAGEM : null;
  if (imagem && imagem.vigente === true) {
    aviso.textContent = "Esta pessoa tem menos de 18 anos e o responsável autorizou o uso da imagem. O envio da foto está liberado.";
    return;
  }
  aviso.className = "subtitle psc-aviso";
  aviso.textContent = "Esta pessoa tem menos de 18 anos: o responsável precisa autorizar o uso da imagem antes do envio da foto. O responsável autoriza em Meu Painel → Ministério com menores; se ele não puder usar o sistema, registre a ficha assinada em Habilitação de Voluntários → Ministério com Menores → Ferramentas. O consentimento de foto da própria pessoa não vale para menor de idade.";
  if (imagem) envio.style.display = "none";   // autorização que se sabe que não vale: não se oferece o envio
}

// ============================================================================
// 4) MEUS DADOS (LGPD): o que a Igreja guarda sobre a pessoa no ministério com menores (meu-painel.js)
// ============================================================================
const MNR_ROTULO_FORMA_POLITICA = { CLICKWRAP: "Aceite digital (com IP, data e hora)", FICHA_FISICA: "Ficha assinada, registrada pela Secretaria" };
const MNR_ROTULO_CADASTRO = { CONSTA: "consta", NADA_CONSTA: "nada consta", INDISPONIVEL: "consulta indisponível" };
function mnrCartaoMeusDados(m) {
  if (!m || typeof m !== "object") return "";
  const lista = (x) => (Array.isArray(x) ? x : []);
  const politicas = lista(m.politicaDeComunicacao), retiradas = lista(m.retiradasDaEscala), comunicacoes = lista(m.comunicacoesADiretoria), consultas = lista(m.consultasAoCadastroNacional);
  if (!politicas.length && !m.fichaConfirmadaEm && !retiradas.length && !comunicacoes.length && !consultas.length) return "";
  const linha = (rotulo, valor) => valor === null || valor === undefined || valor === "" ? "" : `<p class="linha-perfil"><strong>${escaparHtmlEbd(rotulo)}:</strong> ${valor}</p>`;
  const itens = (titulo, linhas) => linhas.length ? `<p class="linha-perfil"><strong>${escaparHtmlEbd(titulo)}:</strong></p><ul class="vol-lista">${linhas.map(l => `<li>${l}</li>`).join("")}</ul>` : "";
  return `
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Ministério com menores</h4>
      ${itens("Aceites da política de comunicação", politicas.map(p => `versão ${escaparHtmlEbd(p.versao)} · ${escaparHtmlEbd(mnrTem(MNR_ROTULO_FORMA_POLITICA, p.forma) ? MNR_ROTULO_FORMA_POLITICA[p.forma] : p.forma)} · ${mnrDataHora(p.aceitoEm)}${p.enderecoIp ? ` · IP ${escaparHtmlEbd(p.enderecoIp)}` : ""}${p.referencia ? ` · ficha: ${escaparHtmlEbd(p.referencia)}` : ""}`))}
      ${linha("Ficha cadastral confirmada em", m.fichaConfirmadaEm ? mnrDataHora(m.fichaConfirmadaEm) : "")}
      ${itens("Retiradas automáticas da escala", retiradas.map(r => `${mnrDataHora(r.em)} — ${escaparHtmlEbd(r.equipe)} (${Number(r.escalasDesmarcadas) || 0} escala(s) desmarcada(s))`))}
      ${itens("Comunicações que você fez à Diretoria", comunicacoes.map(c => `${escaparHtmlEbd(c.tipoRotulo || c.tipo)} · soube em ${mnrData(c.dataCiencia)} · comunicada em ${mnrDataHora(c.declaradaEm)} · ${escaparHtmlEbd(mnrTem(MNR_ROTULO_SITUACAO_AD, c.situacao) ? MNR_ROTULO_SITUACAO_AD[c.situacao] : c.situacao)}${c.decisaoRotulo ? ` (${escaparHtmlEbd(c.decisaoRotulo)}${c.decididaEm ? ` em ${mnrDataHora(c.decididaEm)}` : ""})` : ""}${c.decisaoObservacao ? ` — ${escaparHtmlEbd(c.decisaoObservacao)}` : ""}${c.liberadoEm ? ` · afastamento levantado em ${mnrDataHora(c.liberadoEm)}${c.liberacaoObservacao ? ` — ${escaparHtmlEbd(c.liberacaoObservacao)}` : ""}` : ""}`))}
      ${itens("Consultas ao cadastro nacional", consultas.map(c => `${escaparHtmlEbd(c.fonte)} · ${escaparHtmlEbd(mnrTem(MNR_ROTULO_CADASTRO, c.resultado) ? MNR_ROTULO_CADASTRO[c.resultado] : c.resultado)} · ${mnrDataHora(c.em)}`))}
      ${m.aviso ? `<p class="subtitle">${escaparHtmlEbd(m.aviso)}</p>` : ""}
    </div>`;
}
function mnrCartaoConsentimentosMeusDados(c) {
  if (!c || typeof c !== "object") return "";
  const lista = (x) => (Array.isArray(x) ? x : []);
  const comoResponsavel = lista(c.comoResponsavel), comoMenor = lista(c.comoMenor);
  if (!comoResponsavel.length && !comoMenor.length) return "";
  const detalhe = (x) => `${escaparHtmlEbd(x.forma)} · ${mnrDataHora(x.registradoEm)} · texto versão ${escaparHtmlEbd(x.textoVersao)}${x.referencia ? ` · ficha: ${escaparHtmlEbd(x.referencia)}` : ""}${x.registradaPelaSecretaria ? " · registrada pela Secretaria" : ""}`;
  const itens = (titulo, linhas) => linhas.length ? `<p class="linha-perfil"><strong>${escaparHtmlEbd(titulo)}:</strong></p><ul class="vol-lista">${linhas.map(l => `<li>${l}</li>`).join("")}</ul>` : "";
  return `
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Autorizações de responsável (menores)</h4>
      ${itens("O que você decidiu como responsável", comoResponsavel.map(x => `${escaparHtmlEbd(x.situacao)} — ${escaparHtmlEbd(x.finalidade)} (${escaparHtmlEbd(x.menor)}) · ${detalhe(x)}${x.enderecoIp ? ` · IP ${escaparHtmlEbd(x.enderecoIp)}` : ""}`))}
      ${itens("O que foi decidido sobre você, quando era menor", comoMenor.map(x => `${escaparHtmlEbd(x.situacao)} — ${escaparHtmlEbd(x.finalidade)} (responsável: ${escaparHtmlEbd(x.responsavel)}) · ${detalhe(x)}`))}
      ${c.aviso ? `<p class="subtitle">${escaparHtmlEbd(c.aviso)}</p>` : ""}
    </div>`;
}

registrarAcoes({
  mnrAbrirAutorizacaoAcao, mnrAbrirDecisaoAcao, mnrAceitarPoliticaAcao, mnrAtualizarBotaoAutorizarAcao, mnrAtualizarBotaoPoliticaAcao, mnrCarregarComunicacoesAcao,
  mnrCarregarEquipesFaixaAcao, mnrCarregarPainelAcao, mnrComunicarAcao, mnrConcederAcao, mnrConfirmarDecisaoAcao, mnrConfirmarFichaAcao,
  mnrConfirmarFichaPessoaAcao, mnrConsultarMenorAcao, mnrContarObsAcao, mnrFecharAutorizacaoAcao, mnrFecharDecisaoAcao, mnrFiltrarPainelAcao, mnrMostrarSecaoAcao,
  mnrRegistrarFichaAcao, mnrRegistrarPoliticaAcao, mnrRevogarAcao, mnrSalvarFaixaAcao
});
