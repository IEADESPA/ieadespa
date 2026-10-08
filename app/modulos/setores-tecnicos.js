// app/modulos/setores-tecnicos.js — v7.6: Setores Técnicos (Regimento Art. 48 a 52) e Termo de Vistoria de antecedentes (Art. 133 §5º).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- Setores Técnicos e Vistoria de Antecedentes (v7.6) ----
// Três telas sobre duas rotas do servidor (GestaoSetoresTecnicos: /api/setores-tecnicos/*; GestaoVistoriasAntecedentes: /api/vistorias-antecedentes/*), todas com o
// prefixo "stc":
//   1) aba "Setores Técnicos" (gestão: setores_tecnicos e/ou setores_ratificacao): os 20 setores do Art. 52, os vínculos (candidatura -> aprovação -> Termo de Adesão ->
//      servindo), o texto do Termo para ler/imprimir e os atos cautelares (interdição e pedido de remoção de postagem) com a ratificação da Diretoria;
//   2) aba "Vistoria de Antecedentes" (vistoria_antecedentes: só a Diretoria Executiva e o Conselho de Ética): quem falta, os termos lavrados, lavrar o Termo e
//      solicitar as certidões. A certidão NUNCA sobe ao servidor: o arquivo é escolhido aqui, o navegador calcula o SHA-256 dele (crypto.subtle) e só o hash é enviado;
//   3) Meu Painel -> Setores Técnicos (qualquer login, inclusive PIN): a minha situação, a candidatura, o aceite do Termo, sair do setor, os atos que emiti e, para o
//      líder da congregação, os atos da congregação dele.
// Toda regra (quem pode, prazos, tamanhos, o que cada ato exige) mora no servidor (shared/setoresTecnicos.js e shared/vistoriaAntecedentes.js): aqui só se monta o que o
// servidor devolve e se manda o que a pessoa fez; recusa de regra vem como 422 { mensagem } e é mostrada tal qual, sem limpar o formulário. Os botões de cada ato vêm do
// campo `acoes` do próprio ato (o servidor decide quem pode o quê). Tudo que vem do servidor e entra em innerHTML passa por escaparHtmlEbd; as ações do HTML recebem só
// id numérico ou constante nossa (data-args por argsAttr). O ato de lavrar o Termo pede a confirmação reforçada da vD.4 (428): o fetchProtegido já a trata.
const STC_ROTA = "setores-tecnicos";
const STC_ROTA_VISTORIA = "vistorias-antecedentes";
const STC_SECOES = ["setores", "vinculos", "atos"];
const STC_SECOES_VISTORIA = ["pendentes", "lista", "lavrar", "solicitar"];
const STC_LIMITE_ARQUIVO = 50 * 1024 * 1024;   // uma certidão não passa disso; arquivo maior quase certamente não é uma certidão
// cor do selo de cada situação (vínculo, ato, resultado da vistoria); código que não está aqui cai no cinza
const STC_CLASSE_SELO = {
  CANDIDATO: "cal-st-proposto", AGUARDANDO_TERMO: "cal-st-proposto", ATIVO: "cal-st-homologado", ENCERRADO: "cal-st-cancelado",
  EMITIDA: "cal-st-proposto", RATIFICADA: "cal-st-indeferido", REVOGADA: "cal-st-cancelado", LEVANTADA: "cal-st-homologado", ATENDIDA: "cal-st-homologado", CANCELADA: "cal-st-cancelado",
  SEM_RESTRICAO: "cal-st-homologado", COM_RESTRICAO: "cal-st-proposto", RECUSA: "cal-st-indeferido",
  INSTALADO: "cal-st-homologado", SEM_PROFISSIONAIS: "cal-st-cancelado"
};
// o que cada botão de um ato faz: título e dica do formulário, rota, tamanho mínimo da observação (as mesmas regras do servidor: revogar, levantar e cancelar exigem motivo)
const STC_ACOES_ATO = {
  RATIFICAR: { rotulo: "✅ Ratificar a interdição", titulo: "Ratificar a interdição", dica: "A interdição segue em vigor até o setor levantá-la. A observação é opcional.", rotuloCampo: "Observação (opcional, até 300 caracteres)", confirmar: "✅ Ratificar", classe: "", rota: "decidir", decisao: "RATIFICAR", minimo: 0 },
  REVOGAR: { rotulo: "⛔ Revogar o ato", titulo: "Revogar o ato", dica: "O ato deixa de valer. Explique o motivo: ele fica registrado e quem emitiu é avisado.", rotuloCampo: "Motivo da revogação (de 10 a 300 caracteres)", confirmar: "⛔ Revogar", classe: " btn-perigo", rota: "decidir", decisao: "REVOGAR", minimo: 10 },
  LEVANTAR: { rotulo: "🔓 Levantar a interdição", titulo: "Levantar a interdição", dica: "Use quando o risco foi sanado e o local pode voltar a ser usado. Diga o que foi feito.", rotuloCampo: "O que foi feito para sanar o risco (de 10 a 300 caracteres)", confirmar: "🔓 Levantar a interdição", classe: "", rota: "levantar", decisao: "", minimo: 10 },
  ATENDER: { rotulo: "✔️ Postagem removida (atendido)", titulo: "Dar o pedido por atendido", dica: "Use depois que a postagem saiu do ar. A observação é opcional.", rotuloCampo: "Observação (opcional, até 300 caracteres)", confirmar: "✔️ Dar por atendido", classe: "", rota: "atender", decisao: "", minimo: 0 },
  CANCELAR: { rotulo: "Cancelar o meu pedido", titulo: "Cancelar o pedido de remoção", dica: "Use se você desistiu do pedido (por exemplo, a postagem já foi corrigida). Diga por quê.", rotuloCampo: "Motivo do cancelamento (de 10 a 300 caracteres)", confirmar: "Cancelar o pedido", classe: " btn-secundario", rota: "cancelar", decisao: "", minimo: 10 }
};
// onde cada lista de atos (G = aba de gestão, M = Meu Painel, C = atos da minha congregação) mostra o resultado de uma ação
const STC_MSG_ATOS = { G: "stcAtosAcaoMsg", M: "stcMeuAcaoMsg", C: "stcAtosCongMsg" };

let stcDonoDaTela = null;            // matrícula de quem a tela foi montada (não vaza dado ao trocar de login)
let stcCatalogos = null;             // GET setores-tecnicos/catalogos (motivos, formas do Termo, papéis de quem está logado...)
let stcVisCatalogos = null;          // GET vistorias-antecedentes/catalogos
let stcSecaoAtual = "setores";
let stcVisSecaoAtual = "pendentes";
let stcSetores = [];                 // o catálogo dos setores, com quantos servem (GET setores)
let stcSetorEditando = 0;            // setorId em edição no formulário (0 = setor novo)
let stcVinculos = [];                // última lista de vínculos da aba de gestão
let stcAtos = { G: [], M: [], C: [] };
let stcPainel = null;                // GET meu-painel
let stcTermoAberto = null;           // { vinculo, termo } do texto mostrado na gestão (para imprimir)
let stcCongregacoes = null;          // GET catalogos/congregacoes (só as ativas)
let stcPendentes = [];
let stcDocLinhas = [];               // números das linhas de certidão do formulário de lavratura, na ordem em que aparecem
let stcDocSeq = 0;                   // contador das linhas de certidão (nunca repete, mesmo depois de remover uma)
let stcHashSeq = {};                 // linha -> pedido de cálculo em andamento (resposta velha não vence a nova)
let stcSeqVinculos = 0, stcSeqAtos = 0, stcSeqSetores = 0, stcSeqMeu = 0, stcSeqCong = 0, stcSeqPendentes = 0, stcSeqLista = 0;
const stcEmCurso = new Set();        // trava duplo clique nas ações que gravam

function stcPodeGestao() { return authPermissoes.includes("setores_tecnicos"); }
function stcPodeDiretoria() { return authPermissoes.includes("setores_ratificacao"); }
function stcPodeVistoria() { return authPermissoes.includes("vistoria_antecedentes"); }
function stcSecaoPermitida(secao) {
  if (secao === "setores" || secao === "atos") return stcPodeGestao() || stcPodeDiretoria();
  if (secao === "vinculos") return stcPodeGestao();
  return false;
}

// ---- utilidades ----
function stcEl(id) { return document.getElementById(id); }
function stcTexto(id) { const c = stcEl(id); return c ? String(c.value == null ? "" : c.value).trim() : ""; }
function stcMarcado(id) { const c = stcEl(id); return !!(c && c.checked); }
function stcNumero(valor) { const n = Number(valor); return Number.isFinite(n) ? n : 0; }
// matrícula/identificador digitado: inteiro maior que zero, ou 0
function stcInteiro(texto) { const n = Number(texto); return Number.isInteger(n) && n >= 1 ? n : 0; }
function stcContexto(bruto) { return bruto === "M" ? "M" : bruto === "C" ? "C" : "G"; }
function stcMsgErro(data) { return (data && data.mensagem) || "Não foi possível concluir a operação agora."; }
function stcTemMarca(texto) { return /[<>]/.test(texto); }
function stcClasse(codigo) { return Object.prototype.hasOwnProperty.call(STC_CLASSE_SELO, codigo) ? STC_CLASSE_SELO[codigo] : "cal-st-cancelado"; }
function stcSelo(codigo, rotulo) { return `<span class="cal-selo ${stcClasse(codigo)}">${escaparHtmlEbd(rotulo)}</span>`; }
function stcCampo(rotulo, html) { return html ? `<div><dt>${rotulo}</dt><dd>${html}</dd></div>` : ""; }
function stcOpcoes(lista, valor, rotulo, placeholder) {
  return (placeholder != null ? `<option value="">${escaparHtmlEbd(placeholder)}</option>` : "")
    + lista.map(x => `<option value="${escaparHtmlEbd(valor(x))}">${escaparHtmlEbd(rotulo(x))}</option>`).join("");
}
// preenche um <select> mantendo a escolha atual quando ela ainda existe
function stcPreencherSelect(id, lista, valor, rotulo, placeholder) {
  const sel = stcEl(id);
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = stcOpcoes(lista, valor, rotulo, placeholder);
  if (atual && Array.from(sel.options).some(o => o.value === atual)) sel.value = atual;
}
function stcRolarPara(id) {
  const el = stcEl(id);
  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" });
}
function stcEscreverAviso(id, texto, destaque) {
  const el = stcEl(id);
  if (el) { el.textContent = texto; el.className = destaque ? "subtitle psc-aviso" : "subtitle"; }
}
async function stcProtegerBotao(botao, tarefa, chave) {
  if (chave) {
    if (stcEmCurso.has(chave)) return undefined;
    stcEmCurso.add(chave);
  }
  if (botao) botao.disabled = true;
  try { return await tarefa(); } finally {
    if (botao) botao.disabled = false;
    if (chave) stcEmCurso.delete(chave);
  }
}

// ---- chamadas à API (nunca lançam: erro de rede ou resposta que não é JSON viram { sucesso:false, mensagem }) ----
async function stcRequisitar(rota, caminho, opcoes) {
  try {
    const res = await fetchProtegido(`${API_BASE}/${rota}/${caminho}`, opcoes);
    let corpo = null;
    try { corpo = await res.json(); } catch { /* sem JSON */ }
    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { sucesso: false, mensagem: `Resposta inesperada do servidor (${res.status}).`, httpStatus: res.status };
    if (res.status >= 400) corpo.sucesso = false;
    // 428: a confirmação reforçada (chave de acesso ou código por e-mail) não foi concluída; o fetchProtegido já tentou uma vez
    if (res.status === 428 || corpo.precisaFator) corpo.mensagem = "Este ato precisa de uma confirmação recente de quem você é (chave de acesso ou código por e-mail). Tente de novo e confirme quando a tela pedir.";
    corpo.httpStatus = res.status;
    return corpo;
  } catch (e) {
    // falha de rede e sessão expirada já foram avisadas por fetchProtegido; quem chama só olha "sucesso"
    return { sucesso: false, falhaDeRede: true, mensagem: "Não foi possível falar com o servidor agora." };
  }
}
function stcObter(caminho) { return stcRequisitar(STC_ROTA, caminho); }
function stcPostar(caminho, corpo) {
  return stcRequisitar(STC_ROTA, caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
}
function stcObterVis(caminho) { return stcRequisitar(STC_ROTA_VISTORIA, caminho); }
function stcPostarVis(caminho, corpo) {
  return stcRequisitar(STC_ROTA_VISTORIA, caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
}
function stcAvisarErro(data) { if (!data.falhaDeRede) mostrarToast(stcMsgErro(data), "erro"); }
// Toast + texto fixo na tela (textContent: nada de HTML aqui).
function stcMostrarResultado(data, idMensagem, destaque) {
  const texto = stcMsgErro(data);
  mostrarToast(texto, data && data.sucesso === false ? "erro" : "sucesso");
  stcEscreverAviso(idMensagem, texto, destaque);
}

async function stcGarantirCatalogos(forcar) {
  if (stcCatalogos && !forcar) return stcCatalogos;
  const data = await stcObter("catalogos");
  if (data.sucesso === false) { stcCatalogos = null; return null; }
  const lista = (v) => (Array.isArray(v) ? v : []);
  const regras = data.regras && typeof data.regras === "object" ? data.regras : {};
  const papeis = data.papeis && typeof data.papeis === "object" ? data.papeis : {};
  stcCatalogos = {
    statusVinculo: lista(data.statusVinculo), motivosEncerramento: lista(data.motivosEncerramento), tiposAto: lista(data.tiposAto),
    motivosInterdicao: lista(data.motivosInterdicao), motivosRemocao: lista(data.motivosRemocao), statusAto: lista(data.statusAto),
    formasRegistroManual: lista(data.formasRegistroManual), canaisMensageria: lista(data.canaisMensageria),
    aceite: typeof data.aceite === "string" ? data.aceite : "",
    regras: { maxAtosAbertos: stcNumero(regras.maxAtosAbertos) || 5, maxAtosPorDia: stcNumero(regras.maxAtosPorDia) || 3 },
    papeis: { gestao: !!papeis.gestao, diretoria: !!papeis.diretoria, lider: !!papeis.lider }
  };
  return stcCatalogos;
}
function stcCatalogosOuVazio() {
  return stcCatalogos || { statusVinculo: [], motivosEncerramento: [], tiposAto: [], motivosInterdicao: [], motivosRemocao: [], statusAto: [], formasRegistroManual: [], canaisMensageria: [], aceite: "", regras: { maxAtosAbertos: 5, maxAtosPorDia: 3 }, papeis: { gestao: false, diretoria: false, lider: false } };
}
async function stcGarantirCatalogosVis(forcar) {
  if (stcVisCatalogos && !forcar) return stcVisCatalogos;
  const data = await stcObterVis("catalogos");
  if (data.sucesso === false) { stcVisCatalogos = null; return null; }
  const lista = (v) => (Array.isArray(v) ? v : []);
  stcVisCatalogos = {
    motivos: lista(data.motivos), tiposDocumento: lista(data.tiposDocumento), resultados: lista(data.resultados), destinosOriginal: lista(data.destinosOriginal),
    maxDocumentos: stcNumero(data.maxDocumentos) || 6
  };
  return stcVisCatalogos;
}
function stcVisCatalogosOuVazio() {
  return stcVisCatalogos || { motivos: [], tiposDocumento: [], resultados: [], destinosOriginal: [], maxDocumentos: 6 };
}
// As congregações ativas, para escolher onde o ato vale. Só guarda a lista se ela veio (falha não vira "nenhuma congregação" para sempre).
async function stcGarantirCongregacoes() {
  if (stcCongregacoes) return stcCongregacoes;
  let lista = [];
  try { lista = await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/congregacoes`)); } catch { return []; }
  lista = lista.filter(c => c.ativa !== false);
  if (lista.length) stcCongregacoes = lista;
  return lista;
}

// ---- troca de login: não deixa o dado da pessoa anterior na tela ----
const STC_IDS_LISTAS = ["stcListaSetores", "stcListaVinculos", "stcTermoVista", "stcListaAtos", "stcAvisoVigor", "stcMeuCondicao", "stcMeusVinculos", "stcMeusAtos", "stcAtosCongLista",
  "stcVisListaPendentes", "stcVisListaTermos", "stcLavDocs", "stcLavTermoLavrado"];
const STC_IDS_MENSAGENS = ["stcResultadoSetores", "stcResultadoVinculos", "stcResultadoAtos", "stcAtosAcaoMsg", "stcSetorFormMsg", "stcIndMsg", "stcMeuResultado", "stcMeuAcaoMsg", "stcCandDica",
  "stcIntMsg", "stcRemMsg", "stcAtosCongMsg", "stcAtosCongResultado", "stcVisResultadoPendentes", "stcVisResultadoLista", "stcLavMsg", "stcSolMsg"];
const STC_IDS_CAMPOS = ["stcSetorNome", "stcSetorInciso", "stcSetorOrdem", "stcSetorCompetencia", "stcSetorProfissoes", "stcSetorConselho", "stcIndMatricula", "stcIndFormacao", "stcIndSigla", "stcIndNumero",
  "stcCandFormacao", "stcCandSigla", "stcCandNumero", "stcIntObjeto", "stcIntDescricao", "stcIntReferencia", "stcRemObjeto", "stcRemReferencia", "stcRemDescricao",
  "stcVisFiltroMatricula", "stcLavMatricula", "stcLavFuncao", "stcLavData", "stcLavParecer", "stcSolMatricula", "stcSolFuncao"];
const STC_IDS_MARCAS = ["stcSetorExigeRegistro", "stcSetorPodeInterditar", "stcSetorPodeRemocao", "stcLavVulneraveis"];
const STC_IDS_BLOCOS = ["stcBlocoCandidatura", "stcBlocoInterdicao", "stcBlocoRemocao", "stcBlocoMeusAtos", "stcBlocoCongregacao"];
function stcLimparTela() {
  stcCatalogos = null; stcVisCatalogos = null; stcSecaoAtual = "setores"; stcVisSecaoAtual = "pendentes"; stcSetores = []; stcSetorEditando = 0; stcVinculos = [];
  stcAtos = { G: [], M: [], C: [] }; stcPainel = null; stcTermoAberto = null; stcPendentes = []; stcDocLinhas = []; stcHashSeq = {};
  // pedidos que ainda estão a caminho trazem dado do login anterior: a resposta velha é descartada
  stcSeqVinculos++; stcSeqAtos++; stcSeqSetores++; stcSeqMeu++; stcSeqCong++; stcSeqPendentes++; stcSeqLista++;
  STC_IDS_LISTAS.forEach(id => { const el = stcEl(id); if (el) el.innerHTML = ""; });
  STC_IDS_MENSAGENS.forEach(id => { const el = stcEl(id); if (el) el.textContent = ""; });
  STC_IDS_CAMPOS.forEach(id => { const el = stcEl(id); if (el) el.value = ""; });
  STC_IDS_MARCAS.forEach(id => { const el = stcEl(id); if (el) el.checked = false; });
  STC_IDS_BLOCOS.forEach(id => { const el = stcEl(id); if (el) el.style.display = "none"; });
}
function stcVerificarDono() {
  if (stcDonoDaTela !== authMatricula) { stcLimparTela(); stcDonoDaTela = authMatricula; }
}

// ---- peças de tela que mais de uma seção usa ----
function stcRenderItensTermo(termo) {
  const itens = Array.isArray(termo && termo.itens) ? termo.itens : [];
  return `<ol class="vol-termo-itens">${itens.map(i => `<li>${escaparHtmlEbd(i.texto)}<br /><small class="vol-base">${escaparHtmlEbd(i.base)}</small></li>`).join("")}</ol>`;
}
// O texto exato do Termo (o mesmo que a pessoa vê para aceitar e que a gestão lê ou imprime)
function stcRenderTermo(termo) {
  const t = termo || {};
  return `<h5>${escaparHtmlEbd(t.titulo)}${t.setor && t.setor.nome ? ` — ${escaparHtmlEbd(t.setor.nome)}` : ""}</h5>
    <p class="psc-legenda">Versão ${escaparHtmlEbd(t.versao)} do texto${t.hash ? ` · código de conferência do texto: <span class="cal-code">${escaparHtmlEbd(t.hash)}</span>` : ""}</p>
    ${stcRenderItensTermo(t)}
    <p><strong>${escaparHtmlEbd(t.aceite)}.</strong></p>`;
}
// O que a prova do Termo diz, em palavras: forma, data e onde está o documento
function stcTextoDoTermoDoVinculo(termo) {
  if (!termo) return "";
  const forma = escaparHtmlEbd(termo.rotuloForma || termo.forma);
  const data = termo.dataAceite ? ` em ${escaparHtmlEbd(calData(termo.dataAceite))}` : "";
  const ref = termo.referencia ? `<br /><span class="psc-legenda">Arquivado em: ${escaparHtmlEbd(termo.referencia)}</span>` : "";
  const integ = termo.integridade && termo.integridade.mensagem ? `<br /><span class="psc-legenda">${escaparHtmlEbd(termo.integridade.mensagem)}</span>` : "";
  return `${forma}${data}${ref}${integ}`;
}

// ============================================================================
// 1) ABA "SETORES TÉCNICOS" (gestão)
// ============================================================================
function stcAplicarPermissoes() {
  STC_SECOES.forEach(s => {
    const btn = stcEl(`btnStcSecao${capitalize(s)}`);
    if (btn) btn.style.display = stcSecaoPermitida(s) ? "" : "none";
  });
  const form = stcEl("stcBlocoSetorForm"), indicar = stcEl("stcBlocoIndicar");
  if (form) form.style.display = stcPodeGestao() ? "" : "none";
  if (indicar) indicar.style.display = stcPodeGestao() ? "" : "none";
}
async function carregarOpcoesSetoresAcao() {
  stcVerificarDono();
  stcAplicarPermissoes();
  if (!stcPodeGestao() && !stcPodeDiretoria()) return;
  await stcGarantirCatalogos();
  let secao = stcSecaoAtual;
  if (!stcSecaoPermitida(secao)) secao = STC_SECOES.find(stcSecaoPermitida) || "";
  if (!secao) return;
  stcMostrarSecaoAcao(secao);
}
// `semCarregar`: só troca a seção, sem buscar dados.
function stcMostrarSecaoAcao(secao, semCarregar) {
  if (!stcSecaoPermitida(secao)) secao = STC_SECOES.find(stcSecaoPermitida) || "";
  if (!secao) return;
  stcSecaoAtual = secao;
  STC_SECOES.forEach(nome => {
    const div = stcEl(`stcSecao${capitalize(nome)}`);
    if (div) div.style.display = nome === secao ? "block" : "none";
    const btn = stcEl(`btnStcSecao${capitalize(nome)}`);
    if (btn && btn.classList) btn.classList.toggle("ativo", nome === secao);
  });
  if (semCarregar) return;
  if (secao === "setores") stcCarregarSetoresAcao();
  else if (secao === "vinculos") stcCarregarVinculosAcao();
  else stcCarregarAtosAcao();
}

// -- a) os setores --
async function stcCarregarSetoresAcao() {
  const aviso = stcEl("stcResultadoSetores"), lista = stcEl("stcListaSetores");
  const seq = ++stcSeqSetores;
  if (aviso) aviso.textContent = "Carregando os setores…";
  const data = await stcObter("setores");
  if (seq !== stcSeqSetores) return;   // resposta velha: a pessoa trocou de login ou recarregou
  if (data.sucesso === false) {
    stcSetores = [];
    if (lista) lista.innerHTML = "";
    if (aviso) aviso.textContent = stcMsgErro(data);
    return;
  }
  stcSetores = Array.isArray(data.setores) ? data.setores : [];
  const ativos = stcSetores.filter(s => s.ativo);
  const instalados = ativos.filter(s => s.instalado);
  if (aviso) aviso.textContent = `${ativos.length} setor(es) no catálogo — ${instalados.length} com profissionais servindo e ${ativos.length - instalados.length} sem profissionais.`;
  if (lista) lista.innerHTML = stcSetores.length ? stcSetores.map(stcRenderSetor).join("") : "<p class='subtitle'>Nenhum setor cadastrado ainda.</p>";
  stcPreencherSelectsDeSetor();
}
function stcPreencherSelectsDeSetor() {
  const ativos = stcSetores.filter(s => s.ativo);
  stcPreencherSelect("stcFiltroVincSetor", stcSetores, s => String(s.setorId), s => s.nome, "Todos os setores");
  stcPreencherSelect("stcIndSetor", ativos, s => String(s.setorId), s => s.nome, "— escolha o setor —");
  stcIndSetorMudouAcao();
}
function stcRenderSetor(s) {
  const id = Number(s.setorId);
  const serve = Number(s.profissionais), analise = Number(s.emAnalise);
  const marcas = [
    s.exigeRegistro ? `<span class="cal-selo cal-st-proposto" title="Só aceita quem tem registro no conselho de classe">🪪 Exige registro${s.conselhoClasse ? ` (${escaparHtmlEbd(s.conselhoClasse)})` : ""}</span>` : "",
    s.podeInterditar ? `<span class="cal-selo cal-st-indeferido" title="Pode interditar templo ou estrutura em risco (Regimento Art. 50, I)">⛔ Pode interditar</span>` : "",
    s.podeSolicitarRemocao ? `<span class="cal-selo cal-st-indeferido" title="Pode pedir a remoção de postagem nas redes oficiais (Regimento Art. 50, II)">📵 Pede remoção de postagem</span>` : ""
  ].filter(Boolean).join(" ");
  const situacao = s.instalado ? stcSelo("INSTALADO", "✅ Instalado") : stcSelo("SEM_PROFISSIONAIS", "⚪ Sem profissionais");
  const botoes = stcPodeGestao() ? `<div class="psc-acoes">
      <button type="button" class="btn-link" data-on-click="stcEditarSetorAcao" data-args-click="${argsAttr(id)}">✏️ Editar</button>
      <button type="button" class="btn-link ${s.ativo ? "btn-link-perigo" : "btn-link-sucesso"}" data-on-click="stcAlternarSetorAtivoAcao" data-args-click="${argsAttr(id, s.ativo ? false : true)}">${s.ativo ? "⏸️ Desativar" : "▶️ Reativar"}</button>
    </div>` : "";
  return `<div class="cal-cartao cartao-area-ebd${s.ativo ? "" : " cal-inativo"}">
    <h5>${s.inciso ? `<span class="psc-legenda">Inciso ${escaparHtmlEbd(s.inciso)}</span> ` : ""}${escaparHtmlEbd(s.nome)} ${situacao}${s.ativo ? "" : ' <span class="cal-selo cal-st-cancelado">desativado</span>'}</h5>
    <p style="margin:4px 0;">${escaparHtmlEbd(s.competencia)}</p>
    <p class="psc-legenda">${s.profissoes ? `Profissões: ${escaparHtmlEbd(s.profissoes)} · ` : ""}👥 ${serve} profissional(is) servindo${analise ? ` · ${analise} em análise` : ""}</p>
    ${marcas ? `<p style="margin:4px 0;">${marcas}</p>` : ""}
    ${botoes}
  </div>`;
}
function stcEditarSetorAcao(setorId) {
  const id = Number(setorId);
  const s = stcSetores.find(x => Number(x.setorId) === id);
  if (!s) return;
  stcSetorEditando = id;
  stcEl("stcSetorNome").value = s.nome || "";
  stcEl("stcSetorInciso").value = s.inciso || "";
  stcEl("stcSetorOrdem").value = s.ordem == null ? "" : String(s.ordem);
  stcEl("stcSetorCompetencia").value = s.competencia || "";
  stcEl("stcSetorProfissoes").value = s.profissoes || "";
  stcEl("stcSetorConselho").value = s.conselhoClasse || "";
  stcEl("stcSetorExigeRegistro").checked = !!s.exigeRegistro;
  stcEl("stcSetorPodeInterditar").checked = !!s.podeInterditar;
  stcEl("stcSetorPodeRemocao").checked = !!s.podeSolicitarRemocao;
  stcAtualizarTituloSetorForm();
  stcEl("stcSetorDetalhes").open = true;
  stcEscreverAviso("stcSetorFormMsg", "", false);
  stcRolarPara("stcSetorDetalhes");
}
function stcAtualizarTituloSetorForm() {
  const titulo = stcEl("stcSetorFormTitulo"), botao = stcEl("stcSetorSalvar");
  if (titulo) titulo.textContent = stcSetorEditando ? "✏️ Editando um setor" : "➕ Cadastrar um setor novo";
  if (botao) botao.textContent = stcSetorEditando ? "💾 Salvar as alterações" : "💾 Cadastrar o setor";
}
function stcLimparSetorFormAcao() {
  stcSetorEditando = 0;
  ["stcSetorNome", "stcSetorInciso", "stcSetorOrdem", "stcSetorCompetencia", "stcSetorProfissoes", "stcSetorConselho"].forEach(id => { stcEl(id).value = ""; });
  ["stcSetorExigeRegistro", "stcSetorPodeInterditar", "stcSetorPodeRemocao"].forEach(id => { stcEl(id).checked = false; });
  stcAtualizarTituloSetorForm();
  stcEscreverAviso("stcSetorFormMsg", "", false);
}
async function stcSalvarSetorAcao(botao) {
  const nome = stcTexto("stcSetorNome"), competencia = stcTexto("stcSetorCompetencia"), profissoes = stcTexto("stcSetorProfissoes"), conselhoClasse = stcTexto("stcSetorConselho");
  const inciso = stcTexto("stcSetorInciso").toUpperCase(), ordemTexto = stcTexto("stcSetorOrdem");
  const erro = (texto) => { mostrarToast(texto, "erro"); stcEscreverAviso("stcSetorFormMsg", texto, true); };
  if (nome.length < 3 || nome.length > 100) return erro("Dê um nome ao setor (de 3 a 100 caracteres), por exemplo: Setor de Engenharia, Arquitetura e Obras.");
  if (competencia.length < 10 || competencia.length > 600) return erro("Descreva a competência do setor, isto é, o que ele faz (de 10 a 600 caracteres).");
  if (profissoes.length > 200 || conselhoClasse.length > 60) return erro("As profissões aceitam até 200 caracteres e o conselho de classe, até 60.");
  if (stcTemMarca(nome + competencia + profissoes + conselhoClasse)) return erro("Os textos do setor não podem ter os sinais < ou >.");
  if (inciso && !/^[IVXL]{1,6}$/.test(inciso)) return erro("O inciso do Art. 52 se escreve em algarismos romanos, por exemplo XXI.");
  const ordem = ordemTexto === "" ? 0 : Number(ordemTexto);
  if (!Number.isInteger(ordem) || ordem < 0 || ordem > 999) return erro("A ordem é um número de 0 a 999 (quanto menor, mais acima na lista).");
  const corpo = {
    nome, competencia, profissoes: profissoes || undefined, conselhoClasse: conselhoClasse || undefined, inciso: inciso || undefined, ordem,
    exigeRegistro: stcMarcado("stcSetorExigeRegistro"), podeInterditar: stcMarcado("stcSetorPodeInterditar"), podeSolicitarRemocao: stcMarcado("stcSetorPodeRemocao")
  };
  const editando = stcSetorEditando;
  await stcProtegerBotao(botao, async () => {
    const data = await (editando ? stcPostar("setor-editar", { setorId: editando, ...corpo }) : stcPostar("setor", corpo));
    stcMostrarResultado(data, "stcSetorFormMsg", false);
    if (data.sucesso === false) return;
    stcLimparSetorFormAcao();
    stcEscreverAviso("stcSetorFormMsg", stcMsgErro(data), false);
    await stcCarregarSetoresAcao();
  }, "setor");
}
async function stcAlternarSetorAtivoAcao(setorId, ativo) {
  const id = Number(setorId);
  const s = stcSetores.find(x => Number(x.setorId) === id);
  if (!s) return;
  if (!ativo) {
    const serve = Number(s.profissionais);
    const aviso = `Desativar o setor "${s.nome}"? Ele deixa de receber candidaturas e de emitir atos${serve ? `; as ${serve} pessoa(s) que servem nele continuam registradas` : ""}. Dá para reativar depois.`;
    if (!(await confirmarAcao(aviso, "Desativar"))) return;
  }
  await stcProtegerBotao(null, async () => {
    const data = await stcPostar("setor-ativo", { setorId: id, ativo: !!ativo });
    stcMostrarResultado(data, "stcResultadoSetores", false);
    if (data.sucesso === false) return;
    await stcCarregarSetoresAcao();
    stcEscreverAviso("stcResultadoSetores", stcMsgErro(data), false);
  }, "setor-ativo");
}

// -- b) vínculos --
async function stcCarregarVinculosAcao() {
  const aviso = stcEl("stcResultadoVinculos"), lista = stcEl("stcListaVinculos");
  if (!lista) return;
  if (!stcSetores.length) await stcCarregarSetoresAcao();
  const setorId = stcInteiro(stcTexto("stcFiltroVincSetor")), status = stcTexto("stcFiltroVincStatus");
  const partes = [];
  if (setorId) partes.push(`setorId=${setorId}`);
  if (status) partes.push(`status=${encodeURIComponent(status)}`);
  const seq = ++stcSeqVinculos;
  if (aviso) aviso.textContent = "Carregando os vínculos…";
  const data = await stcObter(`vinculos${partes.length ? `?${partes.join("&")}` : ""}`);
  if (seq !== stcSeqVinculos) return;
  if (data.sucesso === false) {
    stcVinculos = [];
    lista.innerHTML = "";
    if (aviso) aviso.textContent = stcMsgErro(data);
    return;
  }
  stcVinculos = Array.isArray(data.vinculos) ? data.vinculos : [];
  const contar = (cod) => stcVinculos.filter(v => v.status === cod).length;
  if (aviso) aviso.textContent = stcVinculos.length
    ? `${stcVinculos.length} vínculo(s): ${contar("CANDIDATO")} candidatura(s) esperando decisão, ${contar("AGUARDANDO_TERMO")} esperando o Termo, ${contar("ATIVO")} servindo, ${contar("ENCERRADO")} encerrado(s).`
    : "";
  lista.innerHTML = stcVinculos.length ? stcVinculos.map(stcRenderVinculo).join("") : "<p class='subtitle'>Nenhum vínculo com esse filtro.</p>";
}
function stcRenderVinculo(v) {
  const id = Number(v.vinculoId);
  const termoPronto = v.status === "AGUARDANDO_TERMO" || v.status === "ATIVO";
  const botoes = [
    v.status === "CANDIDATO" ? `<button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="stcAprovarAcao" data-args-click="${argsAttr(id, ARG.elemento)}">✅ Aprovar</button>
      <button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="stcAbrirFormVinculoAcao" data-args-click="${argsAttr(id, "recusar")}">Recusar…</button>` : "",
    v.status === "AGUARDANDO_TERMO" ? `<button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="stcAbrirFormVinculoAcao" data-args-click="${argsAttr(id, "termo")}">📝 Registrar o Termo</button>` : "",
    termoPronto ? `<button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="stcVerTermoAcao" data-args-click="${argsAttr(id)}">📄 Ver / imprimir o texto do Termo</button>
      <button type="button" class="btn-link btn-link-perigo" data-on-click="stcAbrirFormVinculoAcao" data-args-click="${argsAttr(id, "encerrar")}">Encerrar…</button>` : ""
  ].filter(Boolean).join(" ");
  const encerrado = v.status === "ENCERRADO"
    ? stcCampo("Encerrado", `${escaparHtmlEbd(v.rotuloMotivoEncerramento || "")}${v.encerradoEm ? ` em ${escaparHtmlEbd(calDataHora(v.encerradoEm))}` : ""}${v.obsEncerramento ? `<br />${escaparHtmlEbd(v.obsEncerramento)}` : ""}`)
    : "";
  return `<div class="cal-cartao cartao-area-ebd${v.status === "ENCERRADO" ? " cal-inativo" : ""}">
    <h5>${escaparHtmlEbd(v.membroNome)} <span class="psc-legenda">matrícula ${Number(v.membroId)}${v.congregacaoNome ? ` · ${escaparHtmlEbd(v.congregacaoNome)}` : ""}</span> ${stcSelo(v.status, v.rotuloStatus || v.status)}</h5>
    <dl class="cal-dl">
      ${stcCampo("Setor", escaparHtmlEbd(v.setorNome))}
      ${stcCampo("Formação", escaparHtmlEbd(v.formacao))}
      ${stcCampo("Registro no conselho", v.registro ? escaparHtmlEbd(v.registro) : (v.exigeRegistro ? "<span class='psc-alerta'>o setor exige, mas não foi informado</span>" : "não informado"))}
      ${stcCampo("Como começou", escaparHtmlEbd(v.rotuloOrigem || ""))}
      ${stcCampo("Pedido em", v.criadoEm ? escaparHtmlEbd(calDataHora(v.criadoEm)) : "")}
      ${stcCampo("Aprovado em", v.aprovadoEm ? escaparHtmlEbd(calDataHora(v.aprovadoEm)) : "")}
      ${stcCampo("O Termo", stcTextoDoTermoDoVinculo(v.termo))}
      ${encerrado}
    </dl>
    ${botoes ? `<div class="psc-acoes">${botoes}</div>` : ""}
    <div id="stcVincForm${id}"></div>
  </div>`;
}
async function stcAprovarAcao(vinculoId, botao) {
  const id = Number(vinculoId);
  const v = stcVinculos.find(x => Number(x.vinculoId) === id);
  if (!v) return;
  if (!(await confirmarAcao(`Aprovar a candidatura de ${v.membroNome} ao ${v.setorNome}? A pessoa é avisada e passa a esperar o aceite do Termo de Adesão. Ninguém aprova a própria candidatura.`, "Aprovar"))) return;
  await stcProtegerBotao(botao, async () => {
    const data = await stcPostar("aprovar", { vinculoId: id });
    stcMostrarResultado(data, "stcResultadoVinculos", false);
    if (data.sucesso === false) return;
    await stcCarregarVinculosAcao();
    stcEscreverAviso("stcResultadoVinculos", stcMsgErro(data), false);
  }, `vinculo${id}`);
}
function stcFecharFormVinculoAcao(vinculoId) {
  const area = stcEl(`stcVincForm${Number(vinculoId)}`);
  if (area) area.innerHTML = "";
}
// O formulário pequeno que abre embaixo do cartão: recusar (observação), registrar o Termo (ficha ou mensagem) ou encerrar (tipo do motivo e observação)
function stcAbrirFormVinculoAcao(vinculoId, tipo) {
  const id = Number(vinculoId);
  const area = stcEl(`stcVincForm${id}`);
  const v = stcVinculos.find(x => Number(x.vinculoId) === id);
  if (!area || !v) return;
  const cat = stcCatalogosOuVazio();
  const nome = escaparHtmlEbd(v.membroNome);
  const fechar = `<button type="button" class="btn-link" data-on-click="stcFecharFormVinculoAcao" data-args-click="${argsAttr(id)}">cancelar</button>`;
  if (tipo === "recusar") {
    area.innerHTML = `<div class="cal-form-inline">
      <strong>Recusar a candidatura de ${nome}</strong>
      <p class="psc-legenda">A candidatura é encerrada e a pessoa não ganha nenhum poder. Se quiser, deixe uma observação (até 300 caracteres, sem os sinais &lt; ou &gt;).</p>
      <label for="stcVfObs${id}">Observação (opcional)</label>
      <textarea id="stcVfObs${id}" rows="2" maxlength="300" style="width:100%;"></textarea>
      <div class="psc-acoes">
        <button type="button" class="btn-confirmar btn-perigo" style="width:auto;margin:0;" data-on-click="stcConfirmarVinculoAcao" data-args-click="${argsAttr(id, "recusar", ARG.elemento)}">Recusar a candidatura</button>
        ${fechar}
      </div>
    </div>`;
  } else if (tipo === "encerrar") {
    area.innerHTML = `<div class="cal-form-inline">
      <strong>Encerrar o vínculo de ${nome} com o ${escaparHtmlEbd(v.setorNome)}</strong>
      <p class="psc-legenda">A pessoa perde os poderes do setor na hora. Os atos que ela já emitiu continuam registrados. Para <strong>desligamento</strong>, escreva o motivo (de 5 a 300 caracteres).</p>
      <label for="stcVfTipo${id}">Tipo do motivo</label>
      <select id="stcVfTipo${id}">${stcOpcoes(cat.motivosEncerramento, m => m.codigo, m => m.rotulo)}</select>
      <label for="stcVfObs${id}">Observação (até 300 caracteres)</label>
      <textarea id="stcVfObs${id}" rows="2" maxlength="300" style="width:100%;"></textarea>
      <div class="psc-acoes">
        <button type="button" class="btn-confirmar btn-perigo" style="width:auto;margin:0;" data-on-click="stcConfirmarVinculoAcao" data-args-click="${argsAttr(id, "encerrar", ARG.elemento)}">Encerrar o vínculo</button>
        ${fechar}
      </div>
    </div>`;
    const sel = stcEl(`stcVfTipo${id}`);
    if (sel && Array.from(sel.options).some(o => o.value === "DESLIGAMENTO")) sel.value = "DESLIGAMENTO";
  } else if (tipo === "termo") {
    area.innerHTML = `<div class="cal-form-inline">
      <strong>Registrar o Termo de Adesão de ${nome}</strong>
      <p class="psc-legenda">Use quando a pessoa assinou a ficha de papel, ou respondeu "li e aceito" por e-mail ou WhatsApp. O documento fica arquivado com você; aqui se registra só <strong>onde ele está</strong>. Quando a própria pessoa aceita em Meu Painel, não precisa registrar nada.</p>
      <label for="stcVfForma${id}">Como a pessoa aceitou?</label>
      <select id="stcVfForma${id}" data-on-change="stcFormaTermoMudouAcao" data-args-change="${argsAttr(id)}">${stcOpcoes(cat.formasRegistroManual, f => f.codigo, f => f.rotulo)}</select>
      <div id="stcVfCanalCx${id}" style="display:none;">
        <label for="stcVfCanal${id}">Por qual canal respondeu?</label>
        <select id="stcVfCanal${id}">${stcOpcoes(cat.canaisMensageria, c => c.codigo, c => c.rotulo)}</select>
      </div>
      <label for="stcVfData${id}">Data em que a pessoa assinou ou respondeu</label>
      <input type="date" id="stcVfData${id}" />
      <label for="stcVfRef${id}">Onde está a ficha ou a conversa arquivada? (de 3 a 200 caracteres)</label>
      <input type="text" id="stcVfRef${id}" maxlength="200" placeholder="Ex.: Pasta de Termos, ficha nº 12" />
      <div class="psc-acoes">
        <button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="stcConfirmarVinculoAcao" data-args-click="${argsAttr(id, "termo", ARG.elemento)}">✅ Registrar o Termo</button>
        ${fechar}
      </div>
    </div>`;
    stcFormaTermoMudouAcao(id);
  }
}
function stcFormaTermoMudouAcao(vinculoId) {
  const id = Number(vinculoId);
  const forma = stcEl(`stcVfForma${id}`), caixa = stcEl(`stcVfCanalCx${id}`);
  if (forma && caixa) caixa.style.display = forma.value === "MENSAGERIA" ? "" : "none";
}
async function stcConfirmarVinculoAcao(vinculoId, tipo, botao) {
  const id = Number(vinculoId);
  const v = stcVinculos.find(x => Number(x.vinculoId) === id);
  if (!v) return;
  const erro = (texto) => mostrarToast(texto, "erro");
  const obs = tipo === "termo" ? "" : stcTexto(`stcVfObs${id}`);   // o formulário do Termo não tem observação
  let rota = "", corpo = { vinculoId: id };
  if (tipo === "recusar") {
    if (obs.length > 300 || stcTemMarca(obs)) { erro("A observação aceita até 300 caracteres, sem os sinais < ou >."); return; }
    rota = "recusar";
    if (obs) corpo.observacao = obs;
  } else if (tipo === "encerrar") {
    const tipoMotivo = stcTexto(`stcVfTipo${id}`);
    if (!tipoMotivo) { erro("Escolha o tipo do motivo."); return; }
    if (obs.length > 300 || stcTemMarca(obs)) { erro("A observação aceita até 300 caracteres, sem os sinais < ou >."); return; }
    if (tipoMotivo === "DESLIGAMENTO" && obs.length < 5) { erro("Registre o motivo do desligamento (de 5 a 300 caracteres)."); return; }
    if (!(await confirmarAcao(`Encerrar o vínculo de ${v.membroNome} com o ${v.setorNome}? A pessoa perde os poderes do setor agora.`, "Encerrar"))) return;
    rota = "encerrar";
    corpo = { vinculoId: id, tipoMotivo };
    if (obs) corpo.observacao = obs;
  } else if (tipo === "termo") {
    const forma = stcTexto(`stcVfForma${id}`), canal = stcTexto(`stcVfCanal${id}`);
    const dataAceite = stcTexto(`stcVfData${id}`), referencia = stcTexto(`stcVfRef${id}`);
    if (!forma) { erro("Escolha como a pessoa aceitou o Termo."); return; }
    if (!dataAceite) { erro("Informe a data em que a pessoa assinou ou respondeu."); return; }
    if (dataAceite > calHojeBrasilia()) { erro("A data da assinatura ou da resposta não pode estar no futuro."); return; }
    if (forma === "MENSAGERIA" && !canal) { erro("Escolha o canal: e-mail ou WhatsApp."); return; }
    if (referencia.length < 3 || referencia.length > 200) { erro("Diga onde está a ficha ou a conversa arquivada (de 3 a 200 caracteres)."); return; }
    rota = "registrar-termo";
    corpo = { vinculoId: id, forma, dataAceite, referencia };
    if (forma === "MENSAGERIA") corpo.canal = canal;
  } else return;
  await stcProtegerBotao(botao, async () => {
    const data = await stcPostar(rota, corpo);
    stcMostrarResultado(data, "stcResultadoVinculos", false);
    if (data.sucesso === false) return;
    await stcCarregarVinculosAcao();
    stcEscreverAviso("stcResultadoVinculos", stcMsgErro(data), false);
    stcCarregarSetoresAcao();   // os números de "servindo" do catálogo mudam
  }, `vinculo${id}`);
}

// -- o texto do Termo (ler e imprimir) --
async function stcVerTermoAcao(vinculoId) {
  const id = Number(vinculoId);
  const cx = stcEl("stcTermoVista");
  if (!cx) return;
  const data = await stcObter(`termo?vinculoId=${id}`);
  if (data.sucesso === false || !data.termo) {
    stcTermoAberto = null;
    cx.innerHTML = `<p class="subtitle">${escaparHtmlEbd(stcMsgErro(data))}</p>`;
    stcRolarPara("stcTermoVista");
    return;
  }
  stcTermoAberto = { vinculo: data.vinculo || {}, termo: data.termo };
  const v = stcTermoAberto.vinculo;
  cx.innerHTML = `<div class="cal-cartao cartao-area-ebd stc-termo-vista">
    <p class="psc-legenda">Termo de ${escaparHtmlEbd(v.membroNome || "")} (matrícula ${Number(v.membroId)}) — ${escaparHtmlEbd(v.setorNome || "")}</p>
    ${stcRenderTermo(data.termo)}
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="stcImprimirTermoAcao">🖨️ Imprimir (para a ficha de papel)</button>
      <button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="stcFecharTermoAcao">Fechar</button>
    </div>
  </div>`;
  stcRolarPara("stcTermoVista");
}
function stcFecharTermoAcao() {
  stcTermoAberto = null;
  const cx = stcEl("stcTermoVista");
  if (cx) cx.innerHTML = "";
}
// A ficha de papel: o mesmo texto do Termo, com a identificação da pessoa e a linha da assinatura (janela própria, no padrão das cartas)
function stcImprimirTermoAcao() {
  const d = stcTermoAberto;
  if (!d || !d.termo) { mostrarToast("Abra o texto do Termo antes de imprimir.", "erro"); return; }
  const t = d.termo, v = d.vinculo || {};
  const itens = (t.itens || []).map(i => `<li>${escaparHtmlEbd(i.texto)} <span class="b">(${escaparHtmlEbd(i.base)})</span></li>`).join("");
  const w = window.open("", "_blank", "width=760,height=900");
  if (!w) { mostrarToast("O navegador bloqueou a janela de impressão. Libere os pop-ups deste site e tente de novo.", "erro"); return; }
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escaparHtmlEbd(t.titulo)}</title>
  <style>
    body{font-family:Georgia,serif;color:#111;padding:40px;}
    .termo{max-width:680px;margin:auto;}
    .cab{text-align:center;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:20px;}
    h1{font-size:16px;margin:0 0 4px;} h2{font-size:17px;margin:14px 0 6px;text-align:center;}
    .sub{font-size:12px;color:#555;} p,li{line-height:1.6;} li{margin-bottom:8px;font-size:14px;} .b{font-size:11px;color:#555;}
    .id{border:1px solid #999;padding:10px;margin:14px 0;font-size:14px;} .id p{margin:4px 0;}
    .aceite{font-weight:bold;margin:16px 0;}
    .rodape{margin-top:50px;display:flex;justify-content:space-around;font-size:12px;text-align:center;}
    .rodape div{border-top:1px solid #111;padding-top:4px;width:260px;}
    .versao{margin-top:20px;font-size:11px;color:#555;text-align:center;}
  </style></head><body><div class="termo">
    <div class="cab"><h1>IGREJA EVANGÉLICA ASSEMBLEIA DE DEUS</h1><div class="sub">Ministério do SETA em Parauapebas — PA · IEADESPA</div></div>
    <h2>${escaparHtmlEbd(t.titulo)}</h2>
    <p style="text-align:center;">${escaparHtmlEbd(v.setorNome || (t.setor && t.setor.nome) || "")}</p>
    <div class="id">
      <p><strong>Nome:</strong> ${escaparHtmlEbd(v.membroNome || "______________________________")} &nbsp; <strong>Matrícula:</strong> ${v.membroId ? Number(v.membroId) : "________"}</p>
      <p><strong>Formação:</strong> ${escaparHtmlEbd(v.formacao || "______________________________")}</p>
      <p><strong>Registro no conselho:</strong> ${escaparHtmlEbd(v.registro || "______________________")}</p>
    </div>
    <ol>${itens}</ol>
    <p class="aceite">${escaparHtmlEbd(t.aceite)}.</p>
    <p>Parauapebas, PA, ____ / ____ / ________.</p>
    <div class="rodape"><div>Assinatura do(a) voluntário(a)</div><div>Secretaria da Igreja</div></div>
    <p class="versao">Termo versão ${escaparHtmlEbd(t.versao)} · código de conferência do texto: ${escaparHtmlEbd(t.hash)}</p>
  </div></body></html>`);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* o navegador pode recusar: a janela fica aberta para imprimir à mão */ } }, 300);
}

// -- indicar alguém (a administração indica; o vínculo espera o Termo) --
function stcIndSetorMudouAcao() {
  const dica = stcEl("stcIndDica");
  if (!dica) return;
  const id = stcInteiro(stcTexto("stcIndSetor"));
  const s = stcSetores.find(x => Number(x.setorId) === id);
  dica.textContent = !s ? "" : s.exigeRegistro
    ? `⚠️ Este setor exige registro no conselho de classe${s.conselhoClasse ? ` (${s.conselhoClasse})` : ""}: preencha a sigla e o número.`
    : "O registro no conselho é opcional neste setor; se preencher, informe a sigla e o número juntos.";
}
async function stcIndicarAcao(botao) {
  const membroId = stcInteiro(stcTexto("stcIndMatricula")), setorId = stcInteiro(stcTexto("stcIndSetor"));
  const formacao = stcTexto("stcIndFormacao"), conselhoSigla = stcTexto("stcIndSigla"), registroNumero = stcTexto("stcIndNumero");
  const erro = (texto) => { mostrarToast(texto, "erro"); stcEscreverAviso("stcIndMsg", texto, true); };
  if (!membroId) return erro("Informe a matrícula de quem será indicado.");
  if (!setorId) return erro("Escolha o setor.");
  if (formacao.length < 3 || formacao.length > 150 || stcTemMarca(formacao)) return erro("Informe a formação (de 3 a 150 caracteres, sem < ou >), por exemplo: Engenheira civil, UFPA.");
  if (!!conselhoSigla !== !!registroNumero) return erro("Informe a sigla do conselho e o número do registro juntos (ou deixe os dois em branco).");
  const s = stcSetores.find(x => Number(x.setorId) === setorId);
  if (s && s.exigeRegistro && !conselhoSigla) return erro(`Este setor exige o registro no conselho de classe${s.conselhoClasse ? ` (${s.conselhoClasse})` : ""}: informe a sigla e o número.`);
  await stcProtegerBotao(botao, async () => {
    const corpo = { membroId, setorId, formacao };
    if (conselhoSigla) { corpo.conselhoSigla = conselhoSigla; corpo.registroNumero = registroNumero; }
    const data = await stcPostar("indicar", corpo);
    stcMostrarResultado(data, "stcIndMsg", false);
    if (data.sucesso === false) return;
    ["stcIndMatricula", "stcIndFormacao", "stcIndSigla", "stcIndNumero"].forEach(id => { stcEl(id).value = ""; });
    stcCarregarVinculosAcao();
    stcCarregarSetoresAcao();
  }, "indicar");
}

// -- c) atos cautelares (a lista da gestão e da Diretoria) --
async function stcCarregarAtosAcao() {
  const aviso = stcEl("stcResultadoAtos"), lista = stcEl("stcListaAtos"), vigor = stcEl("stcAvisoVigor");
  if (!lista) return;
  const todos = stcTexto("stcFiltroAtoSituacao") === "todos", tipo = stcTexto("stcFiltroAtoTipo");
  const partes = [];
  if (!todos) partes.push("abertos=1");
  if (tipo) partes.push(`tipo=${encodeURIComponent(tipo)}`);
  const seq = ++stcSeqAtos;
  if (aviso) aviso.textContent = "Carregando os atos…";
  const data = await stcObter(`atos${partes.length ? `?${partes.join("&")}` : ""}`);
  if (seq !== stcSeqAtos) return;
  if (data.sucesso === false) {
    stcAtos.G = [];
    lista.innerHTML = "";
    if (vigor) vigor.innerHTML = "";
    if (aviso) aviso.textContent = stcMsgErro(data);
    return;
  }
  stcAtos.G = Array.isArray(data.atos) ? data.atos : [];
  const emVigor = stcAtos.G.filter(a => a.emVigor).length;
  const aguardando = stcAtos.G.filter(a => a.status === "EMITIDA").length;
  if (aviso) aviso.textContent = stcAtos.G.length ? `${stcAtos.G.length} ato(s)${aguardando ? ` — ${aguardando} aguardando decisão ou providência` : ""}.` : "";
  if (vigor) vigor.innerHTML = emVigor ? `<div class="cnl-aviso-senha" role="status"><strong>🔴 ${emVigor} interdição(ões) em vigor agora.</strong> Enquanto estiver em vigor, o local não deve ser usado. A interdição só acaba quando o setor a levanta (risco sanado) ou a Diretoria a revoga.</div>` : "";
  lista.innerHTML = stcAtos.G.length ? stcAtos.G.map(a => stcRenderAto(a, "G")).join("") : "<p class='subtitle'>Nenhum ato com esse filtro.</p>";
}

// ---- o cartão de um ato cautelar (usado na aba de gestão, em Meu Painel e nos atos da congregação) ----
function stcRenderAto(a, ctxBruto) {
  const ctx = stcContexto(ctxBruto);
  const id = Number(a.intervencaoId);
  const interdicao = a.tipo === "INTERDICAO";
  const permitidas = (Array.isArray(a.acoes) ? a.acoes : []).filter(cod => Object.prototype.hasOwnProperty.call(STC_ACOES_ATO, cod));
  const botoes = permitidas.map(cod => `<button type="button" class="btn-confirmar${escaparHtmlEbd(STC_ACOES_ATO[cod].classe)}" style="width:auto;margin:0;" data-on-click="stcAtoAbrirFormAcao" data-args-click="${argsAttr(ctx, id, String(cod))}">${escaparHtmlEbd(STC_ACOES_ATO[cod].rotulo)}</button>`).join(" ");
  let faixa = "";
  if (a.emVigor) {
    faixa = `<div class="cnl-aviso-senha stc-vigor" role="status"><strong>🔴 INTERDITADO — em vigor</strong><br />${escaparHtmlEbd(a.objeto || "Local não informado")} (${escaparHtmlEbd(a.congregacaoNome)}). ${a.status === "EMITIDA" ? "Vale desde a emissão; a Diretoria Executiva ainda vai ratificar ou revogar." : "Ratificada pela Diretoria: segue em vigor até o setor levantar a interdição."}</div>`;
  } else if (a.status === "EMITIDA") {
    faixa = `<div class="cal-aviso-remarcacao" role="status">📵 Aguardando a retirada da postagem.</div>`;
  }
  // só o pedido de remoção traz um link (a postagem); qualquer outra coisa é texto — e link que não é http(s) também fica só como texto
  const ehLink = a.tipo === "REMOCAO_POSTAGEM" && /^https?:\/\//i.test(String(a.referencia || ""));
  const referencia = !a.referencia ? "" : ehLink
    ? `<a href="${urlSegura(a.referencia)}" target="_blank" rel="noopener noreferrer">${escaparHtmlEbd(a.referencia)}</a>`
    : escaparHtmlEbd(a.referencia);
  const decisao = a.decididaPorNome
    ? `${escaparHtmlEbd(a.decididaPorNome)}${a.decididaEm ? ` em ${escaparHtmlEbd(calDataHora(a.decididaEm))}` : ""}${a.decisaoObs ? `<br />${escaparHtmlEbd(a.decisaoObs)}` : ""}` : "";
  const fechamento = a.fechadaPorNome
    ? `${escaparHtmlEbd(a.fechadaPorNome)}${a.fechadaEm ? ` em ${escaparHtmlEbd(calDataHora(a.fechadaEm))}` : ""}${a.fechamentoObs ? `<br />${escaparHtmlEbd(a.fechamentoObs)}` : ""}` : "";
  return `<div class="cal-cartao cartao-area-ebd${a.emVigor ? " stc-ato-vigor" : ""}">
    <h5>${interdicao ? "⛔" : "📵"} ${escaparHtmlEbd(a.rotuloTipo || a.tipo)} — ${escaparHtmlEbd(a.congregacaoNome)} ${stcSelo(a.status, a.rotuloStatus || a.status)}</h5>
    ${faixa}
    <dl class="cal-dl">
      ${stcCampo(interdicao ? "O que foi interditado" : "Rede ou perfil", a.objeto ? escaparHtmlEbd(a.objeto) : "")}
      ${stcCampo("Motivo", escaparHtmlEbd(a.rotuloMotivo || a.motivo))}
      ${stcCampo("Justificativa", escaparHtmlEbd(a.descricao))}
      ${stcCampo(interdicao ? "Laudo ou ART" : "Link da postagem", referencia)}
      ${stcCampo("Canal", a.canalDescricao ? escaparHtmlEbd(a.canalDescricao) : "")}
      ${stcCampo("Emitido por", `${escaparHtmlEbd(a.emitenteNome)}${a.registroProfissional ? ` · ${escaparHtmlEbd(a.registroProfissional)}` : ""} — ${escaparHtmlEbd(a.setorNome)}`)}
      ${stcCampo("Quando", a.emitidaEm ? escaparHtmlEbd(calDataHora(a.emitidaEm)) : "")}
      ${stcCampo("Decisão da Diretoria", decisao)}
      ${stcCampo(a.status === "ATENDIDA" ? "Atendido por" : a.status === "CANCELADA" ? "Cancelado por" : "Encerrado por", fechamento)}
    </dl>
    ${botoes ? `<div class="psc-acoes">${botoes}</div>` : ""}
    <div id="stcAtoForm${ctx}_${id}"></div>
  </div>`;
}
// O formulário pequeno de cada botão do ato: a observação (obrigatória, com tamanho mínimo, em revogar, levantar e cancelar)
function stcAtoAbrirFormAcao(ctxBruto, intervencaoId, acao) {
  const ctx = stcContexto(ctxBruto);
  const id = Number(intervencaoId);
  const regra = Object.prototype.hasOwnProperty.call(STC_ACOES_ATO, acao) ? STC_ACOES_ATO[acao] : null;
  const area = stcEl(`stcAtoForm${ctx}_${id}`);
  if (!regra || !area) return;
  area.innerHTML = `<div class="cal-form-inline">
    <strong>${escaparHtmlEbd(regra.titulo)}</strong>
    <p class="psc-legenda">${escaparHtmlEbd(regra.dica)}</p>
    <label for="stcAtoObs${ctx}_${id}">${escaparHtmlEbd(regra.rotuloCampo)}</label>
    <textarea id="stcAtoObs${ctx}_${id}" rows="2" maxlength="300" style="width:100%;"></textarea>
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar${escaparHtmlEbd(regra.classe)}" style="width:auto;margin:0;" data-on-click="stcAtoConfirmarAcao" data-args-click="${argsAttr(ctx, id, String(acao), ARG.elemento)}">${escaparHtmlEbd(regra.confirmar)}</button>
      <button type="button" class="btn-link" data-on-click="stcAtoFecharFormAcao" data-args-click="${argsAttr(ctx, id)}">cancelar</button>
    </div>
  </div>`;
}
function stcAtoFecharFormAcao(ctxBruto, intervencaoId) {
  const area = stcEl(`stcAtoForm${stcContexto(ctxBruto)}_${Number(intervencaoId)}`);
  if (area) area.innerHTML = "";
}
async function stcAtoConfirmarAcao(ctxBruto, intervencaoId, acao, botao) {
  const ctx = stcContexto(ctxBruto);
  const id = Number(intervencaoId);
  const regra = Object.prototype.hasOwnProperty.call(STC_ACOES_ATO, acao) ? STC_ACOES_ATO[acao] : null;
  if (!regra) return;
  const obs = stcTexto(`stcAtoObs${ctx}_${id}`);
  const idMensagem = STC_MSG_ATOS[ctx];
  const erro = (texto) => mostrarToast(texto, "erro");
  if (obs.length > 300) { erro("A observação aceita até 300 caracteres."); return; }
  if (stcTemMarca(obs)) { erro("A observação não pode ter os sinais < ou >."); return; }
  if (obs.length < regra.minimo) { erro(`Preencha o campo "${regra.rotuloCampo}".`); return; }
  const corpo = { intervencaoId: id };
  if (regra.decisao) corpo.decisao = regra.decisao;
  if (obs) corpo.observacao = obs;
  await stcProtegerBotao(botao, async () => {
    const data = await stcPostar(regra.rota, corpo);
    stcMostrarResultado(data, idMensagem, false);
    if (data.sucesso === false) return;   // recusa de regra: mensagem do servidor e formulário intacto
    await stcRecarregarAtos(ctx);
  }, `ato${id}`);
}
function stcRecarregarAtos(ctx) {
  if (ctx === "M") return carregarMeuPainelSetoresAcao();
  if (ctx === "C") return stcCarregarAtosCongregacaoAcao();
  return stcCarregarAtosAcao();
}

// ============================================================================
// 2) ABA "VISTORIA DE ANTECEDENTES" (vistoria_antecedentes)
// ============================================================================
async function carregarOpcoesVistoriaAcao() {
  stcVerificarDono();
  if (!stcPodeVistoria()) return;
  await stcGarantirCatalogosVis();
  stcPreencherFormulariosVis();
  const secao = STC_SECOES_VISTORIA.includes(stcVisSecaoAtual) ? stcVisSecaoAtual : "pendentes";
  stcVisMostrarSecaoAcao(secao);
}
// `semCarregar`: só troca a seção, sem buscar dados.
function stcVisMostrarSecaoAcao(secao, semCarregar) {
  if (!STC_SECOES_VISTORIA.includes(secao)) secao = "pendentes";
  stcVisSecaoAtual = secao;
  STC_SECOES_VISTORIA.forEach(nome => {
    const div = stcEl(`stcVisSecao${capitalize(nome)}`);
    if (div) div.style.display = nome === secao ? "block" : "none";
    const btn = stcEl(`btnStcVisSecao${capitalize(nome)}`);
    if (btn && btn.classList) btn.classList.toggle("ativo", nome === secao);
  });
  if (semCarregar) return;
  if (secao === "pendentes") stcVisCarregarPendentesAcao();
  else if (secao === "lista") stcVisCarregarListaAcao();
}
// Os campos de escolha dos formulários vêm do catálogo do servidor (motivos, tipos de certidão, resultados, destino do original)
function stcPreencherFormulariosVis() {
  const cat = stcVisCatalogosOuVazio();
  stcPreencherSelect("stcLavMotivo", cat.motivos, m => m.codigo, m => `${m.rotulo} (${m.base})`, "— escolha o motivo —");
  stcPreencherSelect("stcLavResultado", cat.resultados, r => r.codigo, r => r.rotulo, "— escolha o resultado —");
  stcPreencherSelect("stcLavDestino", cat.destinosOriginal, d => d.codigo, d => d.rotulo, "— escolha o que foi feito do original —");
  const sol = stcEl("stcSolMotivo");
  const primeiraVez = !!sol && sol.options.length === 0;   // o motivo padrão só vale enquanto a pessoa ainda não escolheu outro
  stcPreencherSelect("stcSolMotivo", cat.motivos, m => m.codigo, m => `${m.rotulo} (${m.base})`);
  if (sol && primeiraVez && Array.from(sol.options).some(o => o.value === "SOLICITACAO_DIRETORIA")) sol.value = "SOLICITACAO_DIRETORIA";
  if (!stcDocLinhas.length) stcLavAdicionarDocAcao();
  stcLavResultadoMudouAcao();
}

// -- a) quem falta --
async function stcVisCarregarPendentesAcao() {
  const aviso = stcEl("stcVisResultadoPendentes"), lista = stcEl("stcVisListaPendentes");
  if (!lista) return;
  const seq = ++stcSeqPendentes;
  if (aviso) aviso.textContent = "Carregando…";
  const data = await stcObterVis("pendentes");
  if (seq !== stcSeqPendentes) return;
  if (data.sucesso === false) {
    stcPendentes = [];
    lista.innerHTML = "";
    if (aviso) aviso.textContent = stcMsgErro(data);
    return;
  }
  stcPendentes = Array.isArray(data.liderancas) ? data.liderancas : [];
  if (aviso) aviso.textContent = stcPendentes.length ? `${stcPendentes.length} liderança(s) em exercício ainda sem Termo de Vistoria.` : "";
  lista.innerHTML = stcPendentes.length
    ? stcPendentes.map(stcRenderPendente).join("")
    : "<p class='vol-selo-ok'>✅ Todas as lideranças em exercício já têm o Termo de Vistoria.</p>";
}
function stcRenderPendente(p) {
  const id = Number(p.membroId);
  return `<div class="cal-cartao cartao-area-ebd">
    <h5>${escaparHtmlEbd(p.nome)} <span class="psc-legenda">matrícula ${id}${p.congregacaoNome ? ` · ${escaparHtmlEbd(p.congregacaoNome)}` : ""}</span> ${p.recusou ? stcSelo("RECUSA", "Recusou apresentar as certidões") : ""}</h5>
    <p style="margin:4px 0;">Exerce: ${escaparHtmlEbd(p.cargos || "—")}</p>
    ${p.recusou ? `<p class="psc-legenda">A última vistoria registrada foi a recusa. A recusa implica impedimento ou afastamento preventivo da função (Art. 133 §5º, I, "a"); a Diretoria decide.</p>` : ""}
    <div class="psc-acoes">
      <button type="button" class="btn-confirmar" style="width:auto;margin:0;" data-on-click="stcVisIrParaLavrarAcao" data-args-click="${argsAttr(id)}">📋 Lavrar o Termo</button>
      <button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="stcVisIrParaSolicitarAcao" data-args-click="${argsAttr(id)}">📨 Solicitar as certidões</button>
    </div>
  </div>`;
}
function stcVisIrParaLavrarAcao(membroId) {
  stcEl("stcLavMatricula").value = String(Number(membroId));
  const motivo = stcEl("stcLavMotivo");
  if (motivo && !motivo.value && Array.from(motivo.options).some(o => o.value === "INVESTIDURA")) motivo.value = "INVESTIDURA";
  stcVisMostrarSecaoAcao("lavrar");
  stcRolarPara("stcVisSecaoLavrar");
}
function stcVisIrParaSolicitarAcao(membroId) {
  stcEl("stcSolMatricula").value = String(Number(membroId));
  stcVisMostrarSecaoAcao("solicitar");
  stcRolarPara("stcVisSecaoSolicitar");
}

// -- b) termos lavrados --
async function stcVisCarregarListaAcao() {
  const aviso = stcEl("stcVisResultadoLista"), lista = stcEl("stcVisListaTermos");
  if (!lista) return;
  const texto = stcTexto("stcVisFiltroMatricula");
  const membroId = stcInteiro(texto);
  if (texto && !membroId) { mostrarToast("Informe a matrícula só com números.", "erro"); return; }
  const seq = ++stcSeqLista;
  if (aviso) aviso.textContent = "Carregando…";
  const data = await stcObterVis(`lista${membroId ? `?membroId=${membroId}` : ""}`);
  if (seq !== stcSeqLista) return;
  if (data.sucesso === false) {
    lista.innerHTML = "";
    if (aviso) aviso.textContent = stcMsgErro(data);
    return;
  }
  const vistorias = Array.isArray(data.vistorias) ? data.vistorias : [];
  if (aviso) aviso.textContent = vistorias.length ? `${vistorias.length} termo(s)${membroId ? "" : " (os mais recentes de todos)"}.` : "";
  lista.innerHTML = vistorias.length ? vistorias.map(stcRenderVistoria).join("") : "<p class='subtitle'>Nenhum Termo de Vistoria lavrado com esse filtro.</p>";
}
function stcRenderVistoria(v) {
  const docs = (Array.isArray(v.documentos) ? v.documentos : []).map(d => `<li>${escaparHtmlEbd(d.rotuloTipo || d.tipo)} — emitida em ${escaparHtmlEbd(calData(d.dataEmissao))}<br /><span class="cal-code">${escaparHtmlEbd(d.hash)}</span></li>`).join("");
  return `<div class="cal-cartao cartao-area-ebd">
    <h5>${escaparHtmlEbd(v.membroNome)} <span class="psc-legenda">matrícula ${Number(v.membroId)} · Termo nº ${Number(v.vistoriaId)}</span> ${stcSelo(v.resultado, v.rotuloResultado || v.resultado)}</h5>
    <dl class="cal-dl">
      ${stcCampo("Data da verificação", escaparHtmlEbd(calData(v.dataVerificacao)))}
      ${stcCampo("Motivo", `${escaparHtmlEbd(v.rotuloMotivo || v.motivo)}${v.baseMotivo ? ` <span class="psc-legenda">(${escaparHtmlEbd(v.baseMotivo)})</span>` : ""}`)}
      ${stcCampo("Cargo ou função em jogo", `${escaparHtmlEbd(v.funcao)}${v.comVulneraveis ? " · <strong>com pessoas vulneráveis</strong>" : ""}`)}
      ${stcCampo("Parecer final", escaparHtmlEbd(v.parecer))}
      ${stcCampo("O original da certidão", v.rotuloDestino ? escaparHtmlEbd(v.rotuloDestino) : "")}
      ${stcCampo("Assinado por", `${escaparHtmlEbd(v.assinadaPorNome)}${v.assinadaEm ? ` em ${escaparHtmlEbd(calDataHora(v.assinadaEm))}` : ""}`)}
    </dl>
    ${docs ? `<p class="vol-sub">Certidões conferidas (só o código de verificação — a Igreja não guarda o documento)</p><ul class="vol-lista">${docs}</ul>` : ""}
  </div>`;
}

// -- c) lavrar o Termo: as certidões são escolhidas aqui e só o hash (SHA-256) sai do aparelho --
function stcRenderLinhaDoc(n) {
  const num = Number(n);
  const cat = stcVisCatalogosOuVazio();
  return `<div class="cal-form-inline stc-doc" id="stcDoc${num}">
    <div class="psc-acoes"><strong>📄 Certidão</strong>
      <button type="button" class="btn-link btn-link-perigo" data-on-click="stcLavRemoverDocAcao" data-args-click="${argsAttr(num)}">remover esta certidão</button></div>
    <div class="cal-form-grade">
      <div class="input-group"><label for="stcDocTipo${num}">Tipo da certidão</label>
        <select id="stcDocTipo${num}">${stcOpcoes(cat.tiposDocumento, t => t.codigo, t => t.rotulo, "— escolha o tipo —")}</select></div>
      <div class="input-group"><label for="stcDocData${num}">Data de emissão da certidão</label>
        <input type="date" id="stcDocData${num}" /></div>
    </div>
    <label for="stcDocArq${num}">Escolher o arquivo da certidão (ele fica no seu aparelho)</label>
    <input type="file" id="stcDocArq${num}" data-on-change="stcEscolherCertidaoAcao" data-args-change="${argsAttr(num, ARG.elemento)}" />
    <label for="stcDocHash${num}">Código de verificação (hash SHA-256, 64 caracteres)</label>
    <input type="text" id="stcDocHash${num}" maxlength="90" autocomplete="off" spellcheck="false" placeholder="aparece sozinho ao escolher o arquivo — ou cole aqui um hash já calculado" data-on-input="stcHashDigitadoAcao" data-args-input="${argsAttr(num)}" />
    <p class="psc-legenda" id="stcDocEstado${num}" role="status"></p>
  </div>`;
}
function stcLavAdicionarDocAcao() {
  const cat = stcVisCatalogosOuVazio();
  if (stcDocLinhas.length >= cat.maxDocumentos) { mostrarToast(`Um Termo aceita até ${cat.maxDocumentos} certidões.`, "erro"); return; }
  const cx = stcEl("stcLavDocs");
  if (!cx) return;
  const n = ++stcDocSeq;
  stcDocLinhas.push(n);
  cx.insertAdjacentHTML("beforeend", stcRenderLinhaDoc(n));
}
function stcLavRemoverDocAcao(n) {
  const num = Number(n);
  stcDocLinhas = stcDocLinhas.filter(x => x !== num);
  delete stcHashSeq[num];
  const linha = stcEl(`stcDoc${num}`);
  if (linha && typeof linha.remove === "function") linha.remove();
}
function stcLavResultadoMudouAcao() {
  const recusa = stcTexto("stcLavResultado") === "RECUSA";
  const docs = stcEl("stcLavBlocoDocs"), destino = stcEl("stcLavBlocoDestino"), aviso = stcEl("stcLavAvisoRecusa");
  if (docs) docs.style.display = recusa ? "none" : "";
  if (destino) destino.style.display = recusa ? "none" : "";
  if (aviso) aviso.style.display = recusa ? "" : "none";
}
// SHA-256 do arquivo, calculado aqui (nada do conteúdo é enviado a lugar nenhum), em letras minúsculas
async function stcCalcularHash(arquivo) {
  if (!window.crypto || !window.crypto.subtle || typeof arquivo.arrayBuffer !== "function") throw new Error("sem-suporte");
  const resumo = await window.crypto.subtle.digest("SHA-256", await arquivo.arrayBuffer());
  return Array.from(new Uint8Array(resumo)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function stcEscolherCertidaoAcao(n, campo) {
  const num = Number(n);
  const arquivo = campo && campo.files && campo.files[0];
  const estado = stcEl(`stcDocEstado${num}`), saida = stcEl(`stcDocHash${num}`);
  if (!arquivo || !saida) return;
  if (arquivo.size > STC_LIMITE_ARQUIVO) {
    if (estado) estado.textContent = "Este arquivo é grande demais para ser uma certidão (mais de 50 MB). Escolha o arquivo certo.";
    campo.value = "";
    return;
  }
  const pedido = (stcHashSeq[num] || 0) + 1;
  stcHashSeq[num] = pedido;
  if (estado) estado.textContent = "Calculando o código de verificação aqui no seu aparelho…";
  try {
    const hash = await stcCalcularHash(arquivo);
    if (stcHashSeq[num] !== pedido) return;   // a pessoa escolheu outro arquivo (ou removeu a linha) enquanto calculava
    saida.value = hash;
    if (estado) estado.textContent = `✅ Código calculado no seu aparelho (64 caracteres). O arquivo "${arquivo.name}" não foi enviado a lugar nenhum.`;
  } catch (e) {
    if (stcHashSeq[num] === pedido && estado) estado.textContent = "Este navegador não conseguiu calcular o código. Use outro navegador atualizado ou cole abaixo um hash SHA-256 já calculado.";
  }
  campo.value = "";   // solta a referência ao arquivo: só o hash interessa
}
function stcHashDigitadoAcao(n) {
  const num = Number(n);
  const campo = stcEl(`stcDocHash${num}`), estado = stcEl(`stcDocEstado${num}`);
  if (!campo || !estado) return;
  const limpo = String(campo.value).replace(/\s+/g, "").toLowerCase();
  if (limpo !== campo.value) campo.value = limpo;
  if (!limpo) { estado.textContent = ""; return; }
  if (/^[0-9a-f]{64}$/.test(limpo)) estado.textContent = "✅ Hash válido (64 caracteres, em minúsculas).";
  else if (/^[0-9a-f]*$/.test(limpo)) estado.textContent = `O hash tem 64 caracteres; faltam ${Math.max(0, 64 - limpo.length)} (ou há ${Math.max(0, limpo.length - 64)} a mais).`;
  else estado.textContent = "O hash só tem os dígitos 0 a 9 e as letras a a f. Confira se copiou o código certo.";
}
async function stcLavrarAcao(botao) {
  const erro = (texto) => { mostrarToast(texto, "erro"); stcEscreverAviso("stcLavMsg", texto, true); };
  const cat = stcVisCatalogosOuVazio();
  const hoje = calHojeBrasilia();
  const membroId = stcInteiro(stcTexto("stcLavMatricula")), motivo = stcTexto("stcLavMotivo"), funcao = stcTexto("stcLavFuncao");
  const dataVerificacao = stcTexto("stcLavData"), resultado = stcTexto("stcLavResultado"), parecer = stcTexto("stcLavParecer"), destinoOriginal = stcTexto("stcLavDestino");
  if (!membroId) { erro("Informe a matrícula de quem foi vistoriado."); return; }
  if (!motivo) { erro("Escolha o motivo da vistoria."); return; }
  if (funcao.length < 3 || funcao.length > 150 || stcTemMarca(funcao)) { erro("Diga o cargo ou a função em jogo (de 3 a 150 caracteres, sem < ou >), por exemplo: Professor da EBD infantil."); return; }
  if (!dataVerificacao) { erro("Informe a data da verificação."); return; }
  if (dataVerificacao > hoje) { erro("A data da verificação não pode estar no futuro."); return; }
  if (!resultado) { erro("Escolha o resultado da vistoria."); return; }
  if (parecer.length < 10 || parecer.length > 1000 || stcTemMarca(parecer)) { erro("Registre o parecer final (de 10 a 1000 caracteres, sem < ou >). Não copie dados da certidão: o parecer diz só a conclusão."); return; }
  const corpo = { membroId, motivo, funcao, comVulneraveis: stcMarcado("stcLavVulneraveis"), dataVerificacao, resultado, parecer };
  if (resultado !== "RECUSA") {
    if (!destinoOriginal) { erro("Diga o que foi feito do documento original: devolvido ao membro ou descartado. A Igreja não guarda cópia."); return; }
    const documentos = [], vistos = new Set();
    for (const n of stcDocLinhas) {
      const tipo = stcTexto(`stcDocTipo${n}`), dataEmissao = stcTexto(`stcDocData${n}`), hash = stcTexto(`stcDocHash${n}`).replace(/\s+/g, "").toLowerCase();
      if (!tipo) { erro("Escolha o tipo de cada certidão."); return; }
      if (!/^[0-9a-f]{64}$/.test(hash)) { erro("Cada certidão precisa do hash SHA-256 completo (64 caracteres): escolha o arquivo para calcular, ou cole o hash."); return; }
      if (vistos.has(hash)) { erro("Há duas certidões com o mesmo hash: o mesmo documento foi informado duas vezes."); return; }
      vistos.add(hash);
      if (!dataEmissao) { erro("Informe a data de emissão de cada certidão."); return; }
      if (dataEmissao > hoje) { erro("A data de emissão de uma certidão não pode estar no futuro."); return; }
      documentos.push({ tipo, hash, dataEmissao });
    }
    if (!documentos.length) { erro("Registre ao menos uma certidão conferida (o tipo, o hash e a data de emissão)."); return; }
    if (documentos.length > cat.maxDocumentos) { erro(`Um Termo aceita até ${cat.maxDocumentos} certidões.`); return; }
    corpo.destinoOriginal = destinoOriginal;
    corpo.documentos = documentos;
  }
  const aviso = `Lavrar e assinar o Termo de Vistoria da matrícula ${membroId}? O Termo fica assinado com o seu nome, não pode ser alterado nem apagado, e guarda só o código (hash) das certidões.${resultado === "RECUSA" ? " A recusa implica impedimento ou afastamento preventivo da função." : ""}`;
  if (!(await confirmarAcao(aviso, "Lavrar e assinar"))) return;
  await stcProtegerBotao(botao, async () => {
    const data = await stcPostarVis("lavrar", corpo);   // 428 (confirmação reforçada): o fetchProtegido confirma e repete a chamada
    stcMostrarResultado(data, "stcLavMsg", false);
    if (data.sucesso === false) return;   // recusa de regra: mensagem do servidor e formulário intacto
    const cx = stcEl("stcLavTermoLavrado");
    if (cx) cx.innerHTML = `<p class="vol-selo-ok">✅ Termo lavrado.</p>${data.vistoria ? stcRenderVistoria(data.vistoria) : ""}`;
    stcLavLimparForm();
    stcVisCarregarPendentesAcao();
  }, "lavrar");
}
function stcLavLimparForm() {
  ["stcLavMatricula", "stcLavFuncao", "stcLavData", "stcLavParecer"].forEach(id => { stcEl(id).value = ""; });
  stcEl("stcLavVulneraveis").checked = false;
  ["stcLavMotivo", "stcLavResultado", "stcLavDestino"].forEach(id => { stcEl(id).value = ""; });
  stcDocLinhas = [];
  stcHashSeq = {};
  stcEl("stcLavDocs").innerHTML = "";
  stcLavAdicionarDocAcao();
  stcLavResultadoMudouAcao();
}

// -- d) solicitar as certidões (só avisa a pessoa; nada é registrado) --
async function stcSolicitarAcao(botao) {
  const membroId = stcInteiro(stcTexto("stcSolMatricula")), motivo = stcTexto("stcSolMotivo"), funcao = stcTexto("stcSolFuncao");
  const erro = (texto) => { mostrarToast(texto, "erro"); stcEscreverAviso("stcSolMsg", texto, true); };
  if (!membroId) return erro("Informe a matrícula de quem deve apresentar as certidões.");
  if (!motivo) return erro("Escolha o motivo do pedido.");
  if (funcao && (funcao.length < 3 || funcao.length > 150 || stcTemMarca(funcao))) return erro("A função aceita de 3 a 150 caracteres, sem < ou >.");
  if (!(await confirmarAcao(`Avisar a matrícula ${membroId} de que a Diretoria solicita as certidões de antecedentes? A pessoa recebe o aviso agora. Nada fica registrado além do aviso.`, "Enviar o aviso"))) return;
  await stcProtegerBotao(botao, async () => {
    const corpo = { membroId, motivo };
    if (funcao) corpo.funcao = funcao;
    const data = await stcPostarVis("solicitar", corpo);
    stcMostrarResultado(data, "stcSolMsg", false);
    if (data.sucesso === false) return;
    stcEl("stcSolMatricula").value = "";
    stcEl("stcSolFuncao").value = "";
  }, "solicitar");
}

// ============================================================================
// 3) MEU PAINEL -> SETORES TÉCNICOS (qualquer login)
// ============================================================================
async function carregarMeuPainelSetoresAcao() {
  stcVerificarDono();
  const aviso = stcEl("stcMeuResultado");
  if (!stcEl("stcMeusVinculos")) return;
  if (!authToken) {
    stcLimparTela();
    if (aviso) aviso.textContent = "Entre com a sua matrícula e o seu PIN (ou senha) para ver os Setores Técnicos.";
    return;
  }
  const seq = ++stcSeqMeu;
  if (aviso) aviso.textContent = "Carregando…";
  const [, painel] = await Promise.all([stcGarantirCatalogos(), stcObter("meu-painel")]);
  if (seq !== stcSeqMeu) return;   // resposta velha: a pessoa trocou de login ou recarregou
  if (painel.sucesso === false) {
    stcPainel = null;
    STC_IDS_BLOCOS.forEach(id => { const el = stcEl(id); if (el) el.style.display = "none"; });
    stcEl("stcMeusVinculos").innerHTML = "";
    stcEl("stcMeuCondicao").innerHTML = "";
    if (aviso) aviso.textContent = stcMsgErro(painel);
    return;
  }
  stcPainel = painel;
  if (aviso) aviso.textContent = "";
  await stcAplicarMeuPainel(painel);
}
async function stcAplicarMeuPainel(painel) {
  const condicao = painel.condicao && typeof painel.condicao === "object" ? painel.condicao : {};
  const vinculos = Array.isArray(painel.vinculos) ? painel.vinculos : [];
  const paraCandidatura = Array.isArray(painel.setoresParaCandidatura) ? painel.setoresParaCandidatura : [];
  const poderes = painel.poderes && typeof painel.poderes === "object" ? painel.poderes : {};
  const podeInterditar = Array.isArray(poderes.interdicao) ? poderes.interdicao : [];
  const podeRemover = Array.isArray(poderes.remocao) ? poderes.remocao : [];
  const atos = Array.isArray(painel.atos) ? painel.atos : [];
  stcAtos.M = atos;
  const quadro = stcEl("stcMeuCondicao");
  quadro.innerHTML = condicao.pode
    ? `<p class="vol-selo-ok">✅ Você pode servir num Setor Técnico.</p>`
    : `<div class="vol-aviso"><span>${escaparHtmlEbd(condicao.mensagem || "No momento você não pode servir num Setor Técnico. Fale com a Secretaria.")}</span></div>`;
  stcEl("stcMeusVinculos").innerHTML = vinculos.length
    ? vinculos.map(stcRenderMeuVinculo).join("")
    : "<p class='subtitle'>Você ainda não tem nenhum vínculo com um setor. Se tem uma profissão, candidate-se abaixo.</p>";
  // candidatura: só quem pode servir
  const blocoCand = stcEl("stcBlocoCandidatura");
  blocoCand.style.display = condicao.pode ? "" : "none";
  stcPreencherSelect("stcCandSetor", paraCandidatura, s => String(s.setorId), s => `${s.inciso ? `${s.inciso} — ` : ""}${s.nome}`, paraCandidatura.length ? "— escolha o setor —" : "— nenhum setor disponível —");
  stcCandSetorMudouAcao();
  // poderes: só quem serve ATIVO num setor que dá o poder
  const blocoInt = stcEl("stcBlocoInterdicao"), blocoRem = stcEl("stcBlocoRemocao");
  blocoInt.style.display = podeInterditar.length ? "" : "none";
  blocoRem.style.display = podeRemover.length ? "" : "none";
  stcPreencherSelect("stcIntSetor", podeInterditar, p => String(p.setorId), p => p.setorNome);
  stcPreencherSelect("stcRemSetor", podeRemover, p => String(p.setorId), p => p.setorNome);
  stcEl("stcIntSetorCx").style.display = podeInterditar.length > 1 ? "" : "none";
  stcEl("stcRemSetorCx").style.display = podeRemover.length > 1 ? "" : "none";
  const motivos = stcCatalogosOuVazio();
  stcPreencherSelect("stcIntMotivo", motivos.motivosInterdicao, m => m.codigo, m => m.rotulo, "— escolha o motivo —");
  stcPreencherSelect("stcRemMotivo", motivos.motivosRemocao, m => m.codigo, m => m.rotulo, "— escolha o motivo —");
  // meus atos
  stcEl("stcBlocoMeusAtos").style.display = atos.length || podeInterditar.length || podeRemover.length ? "" : "none";
  stcEl("stcMeusAtos").innerHTML = atos.length ? atos.map(a => stcRenderAto(a, "M")).join("") : "<p class='subtitle'>Você ainda não emitiu nenhum ato.</p>";
  // atos da minha congregação: só o líder (o servidor confere o escopo)
  const lider = !!motivos.papeis.lider;
  stcEl("stcBlocoCongregacao").style.display = lider ? "" : "none";
  if (podeInterditar.length || podeRemover.length || lider) {
    const congregacoes = await stcGarantirCongregacoes();
    const opcoes = (c) => String(c.congregacaoId);
    if (podeInterditar.length) stcPreencherSelect("stcIntCong", congregacoes, opcoes, c => c.nome, "— escolha a congregação —");
    if (podeRemover.length) {
      stcPreencherSelect("stcRemCong", congregacoes, opcoes, c => c.nome, "— escolha a congregação —");
      stcRemCongregacaoMudouAcao();   // monta a lista de canais da congregação já escolhida (ou só o "não está na lista")
    }
    if (lider) stcPreencherSelect("stcCongAtosSel", congregacoes, opcoes, c => c.nome, "— escolha a congregação —");
  }
}
function stcRenderMeuVinculo(v) {
  const id = Number(v.vinculoId);
  let bloco = "";
  let sair = "";
  if (v.status === "CANDIDATO") {
    bloco = `<p>A administração está analisando a sua candidatura. Quando for aprovada, você recebe um aviso e, aqui mesmo, o Termo de Adesão para ler e aceitar.</p>`;
    sair = "Desistir da candidatura";
  } else if (v.status === "AGUARDANDO_TERMO") {
    const t = v.termoParaAceitar || {};
    bloco = `<p><strong>Falta só o seu aceite.</strong> Leia o Termo com calma. Servir é voluntário e gratuito, e você pode sair quando quiser.</p>
      <div class="vol-cartao">${stcRenderTermo(t)}</div>
      <label class="opcao-checkbox vol-aceite"><input type="checkbox" id="stcAceite${id}" data-on-change="stcAtualizarBotaoAceiteAcao" data-args-change="${argsAttr(id)}" /> ${escaparHtmlEbd(t.aceite || stcCatalogosOuVazio().aceite)}</label>
      <p class="psc-legenda">Marcar a caixa vale como a sua assinatura eletrônica: a Igreja guarda a versão do texto, o seu IP, a data e a hora do aceite.</p>
      <div class="psc-acoes"><button type="button" class="btn-confirmar" id="stcAceitarBotao${id}" style="width:auto;margin:0;" disabled data-on-click="stcAceitarTermoAcao" data-args-click="${argsAttr(id, ARG.elemento)}">✍️ Aceitar o Termo</button></div>`;
    sair = "Não quero servir (sair)";
  } else if (v.status === "ATIVO") {
    bloco = `<p>Você serve neste setor${v.ativadoEm ? ` desde ${escaparHtmlEbd(calData(v.ativadoEm))}` : ""}.${v.termo ? ` Termo: ${stcTextoDoTermoDoVinculo(v.termo)}` : ""}</p>
      ${v.podeInterditar ? `<p class="psc-legenda">⛔ Este setor pode interditar templo ou estrutura em risco (Regimento Art. 50, I): veja o formulário mais abaixo.</p>` : ""}
      ${v.podeSolicitarRemocao ? `<p class="psc-legenda">📵 Este setor pode pedir a remoção de postagem nas redes oficiais (Regimento Art. 50, II): veja o formulário mais abaixo.</p>` : ""}`;
    sair = "Sair do setor";
  } else {
    bloco = `<p class="psc-legenda">Vínculo encerrado${v.encerradoEm ? ` em ${escaparHtmlEbd(calDataHora(v.encerradoEm))}` : ""}${v.rotuloMotivoEncerramento ? ` — ${escaparHtmlEbd(v.rotuloMotivoEncerramento)}` : ""}${v.obsEncerramento ? `: ${escaparHtmlEbd(v.obsEncerramento)}` : ""}.</p>`;
  }
  const botaoSair = sair ? `<div class="psc-acoes"><button type="button" class="btn-link btn-link-perigo" data-on-click="stcSairDoSetorAcao" data-args-click="${argsAttr(id, ARG.elemento)}">${escaparHtmlEbd(sair)}</button></div>` : "";
  return `<div class="cal-cartao cartao-area-ebd${v.status === "ENCERRADO" ? " cal-inativo" : ""}">
    <h5>${escaparHtmlEbd(v.setorNome)} ${stcSelo(v.status, v.rotuloStatus || v.status)}</h5>
    <p class="psc-legenda">${escaparHtmlEbd(v.rotuloOrigem || "")}${v.formacao ? ` · formação: ${escaparHtmlEbd(v.formacao)}` : ""}${v.registro ? ` · registro: ${escaparHtmlEbd(v.registro)}` : ""}</p>
    ${bloco}
    ${botaoSair}
  </div>`;
}
function stcAtualizarBotaoAceiteAcao(vinculoId) {
  const id = Number(vinculoId);
  const caixa = stcEl(`stcAceite${id}`), botao = stcEl(`stcAceitarBotao${id}`);
  if (caixa && botao) botao.disabled = !caixa.checked;
}
async function stcAceitarTermoAcao(vinculoId, botao) {
  const id = Number(vinculoId);
  const caixa = stcEl(`stcAceite${id}`);
  if (!caixa || !caixa.checked) { stcEscreverAviso("stcMeuAcaoMsg", "Marque a caixa para aceitar o Termo.", true); return; }
  await stcProtegerBotao(botao, async () => {
    const data = await stcPostar("aceitar-termo", { vinculoId: id, aceito: true });
    stcMostrarResultado(data, "stcMeuAcaoMsg", false);
    if (data.sucesso === false) return;
    await carregarMeuPainelSetoresAcao();
  }, `aceite${id}`);
}
async function stcSairDoSetorAcao(vinculoId, botao) {
  const id = Number(vinculoId);
  const v = stcPainel && Array.isArray(stcPainel.vinculos) ? stcPainel.vinculos.find(x => Number(x.vinculoId) === id) : null;
  const nome = v ? v.setorNome : "o setor";
  if (!(await confirmarAcao(`Sair do ${nome}? Você pode sair quando quiser, sem nenhuma penalidade (Regimento Art. 133 §7º). Os atos que você já emitiu continuam registrados.`, "Sair do setor"))) return;
  await stcProtegerBotao(botao, async () => {
    const data = await stcPostar("sair", { vinculoId: id });
    stcMostrarResultado(data, "stcMeuAcaoMsg", false);
    if (data.sucesso === false) return;
    await carregarMeuPainelSetoresAcao();
  }, `sair${id}`);
}
function stcCandSetorMudouAcao() {
  const dica = stcEl("stcCandDica");
  if (!dica) return;
  const id = stcInteiro(stcTexto("stcCandSetor"));
  const lista = stcPainel && Array.isArray(stcPainel.setoresParaCandidatura) ? stcPainel.setoresParaCandidatura : [];
  const s = lista.find(x => Number(x.setorId) === id);
  dica.textContent = !s ? "" : `${s.competencia}${s.exigeRegistro ? ` ⚠️ Este setor exige registro no conselho de classe${s.conselhoClasse ? ` (${s.conselhoClasse})` : ""}: preencha a sigla e o número.` : ""}`;
}
async function stcCandidatarAcao(botao) {
  const setorId = stcInteiro(stcTexto("stcCandSetor"));
  const formacao = stcTexto("stcCandFormacao"), conselhoSigla = stcTexto("stcCandSigla"), registroNumero = stcTexto("stcCandNumero");
  const erro = (texto) => { mostrarToast(texto, "erro"); stcEscreverAviso("stcMeuAcaoMsg", texto, true); };
  if (!setorId) return erro("Escolha o setor.");
  if (formacao.length < 3 || formacao.length > 150 || stcTemMarca(formacao)) return erro("Informe a sua formação (de 3 a 150 caracteres, sem < ou >), por exemplo: Engenheira civil, UFPA.");
  if (!!conselhoSigla !== !!registroNumero) return erro("Informe a sigla do conselho e o número do registro juntos (ou deixe os dois em branco).");
  const lista = stcPainel && Array.isArray(stcPainel.setoresParaCandidatura) ? stcPainel.setoresParaCandidatura : [];
  const s = lista.find(x => Number(x.setorId) === setorId);
  if (s && s.exigeRegistro && !conselhoSigla) return erro(`Este setor exige o registro no conselho de classe${s.conselhoClasse ? ` (${s.conselhoClasse})` : ""}: informe a sigla e o número.`);
  await stcProtegerBotao(botao, async () => {
    const corpo = { setorId, formacao };
    if (conselhoSigla) { corpo.conselhoSigla = conselhoSigla; corpo.registroNumero = registroNumero; }
    const data = await stcPostar("candidatar", corpo);
    stcMostrarResultado(data, "stcMeuAcaoMsg", false);
    if (data.sucesso === false) return;
    ["stcCandFormacao", "stcCandSigla", "stcCandNumero"].forEach(id => { stcEl(id).value = ""; });
    await carregarMeuPainelSetoresAcao();
  }, "candidatar");
}

// -- interdição e pedido de remoção (só quem serve ATIVO num setor que dá o poder) --
async function stcEmitirInterdicaoAcao(botao) {
  const erro = (texto) => { mostrarToast(texto, "erro"); stcEscreverAviso("stcIntMsg", texto, true); };
  const congregacaoId = stcInteiro(stcTexto("stcIntCong")), motivo = stcTexto("stcIntMotivo"), objeto = stcTexto("stcIntObjeto");
  const descricao = stcTexto("stcIntDescricao"), referencia = stcTexto("stcIntReferencia"), setorId = stcInteiro(stcTexto("stcIntSetor"));
  if (!congregacaoId) { erro("Escolha a congregação do templo ou da estrutura."); return; }
  if (!motivo) { erro("Escolha o motivo da interdição."); return; }
  if (objeto.length < 3 || objeto.length > 150 || stcTemMarca(objeto)) { erro("Diga o que foi interditado (de 3 a 150 caracteres, sem < ou >), por exemplo: Templo principal — cobertura da nave."); return; }
  if (descricao.length < 30 || descricao.length > 1000 || stcTemMarca(descricao)) { erro("Registre a justificativa técnica (de 30 a 1000 caracteres, sem < ou >): o que foi visto e por que há risco iminente."); return; }
  if (referencia.length > 300 || stcTemMarca(referencia)) { erro("O número do laudo ou da ART aceita até 300 caracteres, sem < ou >."); return; }
  const sel = stcEl("stcIntCong");
  const nomeCong = sel && sel.selectedIndex >= 0 && sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : "a congregação";
  const aviso = `Interditar "${objeto}" (${nomeCong})? A interdição vale a partir de agora, vai para a Diretoria Executiva ratificar ou revogar, e fica registrada com o seu nome e o seu registro profissional. Só interdite diante de risco iminente (desabamento ou falha elétrica grave).`;
  if (!(await confirmarAcao(aviso, "Interditar agora"))) return;
  await stcProtegerBotao(botao, async () => {
    const corpo = { congregacaoId, motivo, objeto, descricao };
    if (referencia) corpo.referencia = referencia;
    if (setorId) corpo.setorId = setorId;
    const data = await stcPostar("interdicao", corpo);
    stcMostrarResultado(data, "stcIntMsg", data.sucesso !== false && !!data.semDiretoria);
    if (data.sucesso === false) return;   // recusa de regra (limites, duplicata...): mensagem do servidor e formulário intacto
    ["stcIntObjeto", "stcIntDescricao", "stcIntReferencia"].forEach(id => { stcEl(id).value = ""; });
    stcEl("stcIntMotivo").value = "";
    const texto = stcMsgErro(data);
    await carregarMeuPainelSetoresAcao();
    stcEscreverAviso("stcIntMsg", texto, !!data.semDiretoria);
  }, "interdicao");
}
async function stcRemCongregacaoMudouAcao() {
  const congregacaoId = stcInteiro(stcTexto("stcRemCong"));
  const sel = stcEl("stcRemCanal");
  if (!sel) return;
  sel.innerHTML = stcOpcoes([], c => c.canalId, c => c.nome, "— o perfil não está na lista (descreva abaixo) —");
  if (!congregacaoId) return;
  const data = await stcObter(`canais?congregacaoId=${congregacaoId}`);
  if (stcInteiro(stcTexto("stcRemCong")) !== congregacaoId) return;   // a pessoa já escolheu outra congregação
  const canais = data.sucesso === false || !Array.isArray(data.canais) ? [] : data.canais;
  stcPreencherSelect("stcRemCanal", canais, c => String(c.canalId), c => `${c.plataforma ? `${c.plataforma} — ` : ""}${c.nome}${c.identificador ? ` (${c.identificador})` : ""}`, "— o perfil não está na lista (descreva abaixo) —");
}
async function stcEmitirRemocaoAcao(botao) {
  const erro = (texto) => { mostrarToast(texto, "erro"); stcEscreverAviso("stcRemMsg", texto, true); };
  const congregacaoId = stcInteiro(stcTexto("stcRemCong")), canalId = stcInteiro(stcTexto("stcRemCanal")), motivo = stcTexto("stcRemMotivo");
  const objeto = stcTexto("stcRemObjeto"), referencia = stcTexto("stcRemReferencia"), descricao = stcTexto("stcRemDescricao"), setorId = stcInteiro(stcTexto("stcRemSetor"));
  if (!congregacaoId) { erro("Escolha a congregação dona da rede social."); return; }
  if (!motivo) { erro("Escolha o motivo do pedido."); return; }
  if (!canalId && (objeto.length < 3 || objeto.length > 150 || stcTemMarca(objeto))) { erro("Diga em que rede e perfil está a postagem (de 3 a 150 caracteres, sem < ou >), por exemplo: Instagram @congregacao."); return; }
  if (objeto && (objeto.length < 3 || objeto.length > 150 || stcTemMarca(objeto))) { erro("A rede e o perfil aceitam de 3 a 150 caracteres, sem < ou >."); return; }
  if (!/^https?:\/\/[^\s<>"'`\\]{4,}$/i.test(referencia) || referencia.length < 8 || referencia.length > 300) { erro("Informe o endereço (link) da postagem, começando por https:// e sem espaços."); return; }
  if (descricao.length < 20 || descricao.length > 1000 || stcTemMarca(descricao)) { erro("Registre a justificativa (de 20 a 1000 caracteres, sem < ou >): qual é o erro, a violação ou a ofensa."); return; }
  const aviso = `Pedir a remoção desta postagem? O pedido é registrado agora com o seu nome, avisado a quem cuida da rede, à liderança da congregação e à Diretoria Executiva (que pode revogá-lo). É um pedido, não uma ordem.`;
  if (!(await confirmarAcao(aviso, "Pedir a remoção"))) return;
  await stcProtegerBotao(botao, async () => {
    const corpo = { congregacaoId, motivo, referencia, descricao };
    if (canalId) corpo.canalId = canalId;
    if (objeto) corpo.objeto = objeto;
    if (setorId) corpo.setorId = setorId;
    const data = await stcPostar("pedido-remocao", corpo);
    stcMostrarResultado(data, "stcRemMsg", data.sucesso !== false && !!data.semDiretoria);
    if (data.sucesso === false) return;
    ["stcRemObjeto", "stcRemReferencia", "stcRemDescricao"].forEach(id => { stcEl(id).value = ""; });
    stcEl("stcRemMotivo").value = "";
    const texto = stcMsgErro(data);
    await carregarMeuPainelSetoresAcao();
    stcEscreverAviso("stcRemMsg", texto, !!data.semDiretoria);
  }, "remocao");
}

// -- atos da minha congregação (o líder; o servidor confere o escopo e responde 403 fora dele) --
async function stcCarregarAtosCongregacaoAcao() {
  const cx = stcEl("stcAtosCongLista");
  if (!cx) return;
  const congregacaoId = stcInteiro(stcTexto("stcCongAtosSel"));
  if (!congregacaoId) { cx.innerHTML = ""; stcEscreverAviso("stcAtosCongResultado", "Escolha a congregação para ver os atos dela.", false); return; }
  const seq = ++stcSeqCong;
  stcEscreverAviso("stcAtosCongResultado", "Carregando…", false);
  const data = await stcObter(`atos-da-congregacao?congregacaoId=${congregacaoId}`);
  if (seq !== stcSeqCong) return;
  if (data.sucesso === false) {
    stcAtos.C = [];
    cx.innerHTML = "";
    stcEscreverAviso("stcAtosCongResultado", stcMsgErro(data), true);
    return;
  }
  stcAtos.C = Array.isArray(data.atos) ? data.atos : [];
  const emVigor = stcAtos.C.filter(a => a.emVigor).length;
  stcEscreverAviso("stcAtosCongResultado", stcAtos.C.length ? `${stcAtos.C.length} ato(s) nesta congregação${emVigor ? ` — ${emVigor} interdição(ões) em vigor` : ""}.` : "", false);
  cx.innerHTML = stcAtos.C.length ? stcAtos.C.map(a => stcRenderAto(a, "C")).join("") : "<p class='subtitle'>Nenhum ato registrado para esta congregação.</p>";
}

registrarAcoes({
  stcAbrirFormVinculoAcao, stcAlternarSetorAtivoAcao, stcAprovarAcao, stcAtoAbrirFormAcao, stcAtoConfirmarAcao, stcAtoFecharFormAcao, stcAtualizarBotaoAceiteAcao,
  stcAceitarTermoAcao, stcCandSetorMudouAcao, stcCandidatarAcao, stcCarregarAtosAcao, stcCarregarAtosCongregacaoAcao, stcCarregarSetoresAcao, stcCarregarVinculosAcao,
  stcConfirmarVinculoAcao, stcEditarSetorAcao, stcEmitirInterdicaoAcao, stcEmitirRemocaoAcao, stcEscolherCertidaoAcao, stcFecharFormVinculoAcao, stcFecharTermoAcao,
  stcFormaTermoMudouAcao, stcHashDigitadoAcao, stcImprimirTermoAcao, stcIndSetorMudouAcao, stcIndicarAcao, stcLavAdicionarDocAcao, stcLavRemoverDocAcao,
  stcLavResultadoMudouAcao, stcLavrarAcao, stcLimparSetorFormAcao, stcMostrarSecaoAcao, stcRemCongregacaoMudouAcao, stcSairDoSetorAcao, stcSalvarSetorAcao,
  stcSolicitarAcao, stcVerTermoAcao, stcVisCarregarListaAcao, stcVisCarregarPendentesAcao, stcVisIrParaLavrarAcao, stcVisIrParaSolicitarAcao, stcVisMostrarSecaoAcao
});
