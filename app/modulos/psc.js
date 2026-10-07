// app/modulos/psc.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- Saúde Congregacional — PSC (v7.1) ----
// Avaliação anual obrigatória das congregações pela "Escada Bloqueada" (5 Sinais
// Vitais x 5 degraus, Regimento Art. 127-129) e a reclassificação compulsória
// para Extensão da Tenda. Toda regra (escada, prazo, segregação de funções,
// escopo, permissão) mora no servidor (shared/psc.js, rota /api/psc/*): aqui só
// se monta a tela e se manda o que a pessoa fez. Tudo que vem do servidor e
// entra em innerHTML passa por escaparHtmlEbd (v6.8); link de evidência só vira
// <a> se for https://; onclick só recebe id numérico ou constante nossa.
const PSC_SELO_PRAZO = {
  EM_ANDAMENTO: ["⏳ em andamento", "psc-neutro"],
  CUMPRIDO: ["🟢 cumprido", "psc-ok"],
  NO_PRAZO: ["🟠 no prazo de envio", "psc-alerta-selo"],
  ATRASADO: ["🔴 atrasado", "psc-erro"],
  NAO_SE_APLICA: ["➖ não se aplica", "psc-neutro"]
};
const PSC_ICONE_STATUS = { RASCUNHO: "✏️", ENVIADA: "📨", VALIDADA: "✅", HOMOLOGADA: "🏛️" };
const PSC_ROTULO_DEGRAU = { COMPLETO: "✅ completo", REPROVADO: "❌ reprovado", INCOMPLETO: "🟡 em aberto", BLOQUEADO: "🔒 bloqueado", SEM_CRITERIOS: "➖ sem critérios" };
const PSC_CLASSE_DEGRAU = { COMPLETO: "psc-degrau-completo", REPROVADO: "psc-degrau-reprovado", INCOMPLETO: "psc-degrau-incompleto" };
const PSC_SELO_SUGESTAO = { CONFERE: ["🟢 confere", "psc-ok"], NAO_CONFERE: ["🔴 não confere", "psc-erro"], SEM_DADOS: ["⚪ sem dados", "psc-neutro"] };
const PSC_ROTULO_RESPOSTA = { ATENDIDO: "✅ Atendido", NAO_ATENDIDO: "❌ Não atendido", PENDENTE: "⏳ Sem resposta" };
const PSC_ROTULO_RECLASSIFICACAO = { PROPOSTA: "⚠️ Proposta — aguarda a decisão da CLI", DECRETADA: "📌 Decretada — Extensão da Tenda", ARQUIVADA: "🗄️ Arquivada", REVERTIDA: "♻️ Autonomia restabelecida" };
const PSC_CLASSE_RECLASSIFICACAO = { PROPOSTA: "psc-erro", DECRETADA: "psc-alerta-selo", ARQUIVADA: "psc-neutro", REVERTIDA: "psc-ok" };

let pscPainelCache = null;           // último painel carregado (também alimenta o seletor de Congregação-Mãe)
let pscDetalhe = null;               // avaliação aberta em #pscDetalheAvaliacao
let pscRespostasBase = new Map();    // respostaId -> {situacao, observacao, evidenciaUrl, codigo} como está no servidor
let pscRespostasAtuais = new Map();  // idem, com o que a pessoa mexeu na tela
let pscCatalogoCache = [];
let pscParametrosCache = null;
let pscReclassCache = [];
let pscAcaoEmCurso = false;          // trava duplo clique nas transições de estado
let pscDonoDaTela = null;            // matrícula de quem a tela foi montada (não vaza dado ao trocar de login)

function pscPodeGestao() { return authPermissoes.includes("psc_gestao"); }
// v7.6 — além da permissão, o nível geral: homologar e decidir reclassificação valem para a igreja inteira (o servidor recusa os demais com a mesma regra).
function pscPodeHomologar() { return authPermissoes.includes("psc_homologacao") && authGeral; }

function pscDe(mapa, chave, padrao) {
  return Object.prototype.hasOwnProperty.call(mapa, chave) ? mapa[chave] : padrao;
}
function pscNum(valor) {
  return valor == null || valor === "" || !Number.isFinite(Number(valor)) ? "—" : String(Number(valor));
}
// Data "só dia" (2026-03-31) corta nos 10 primeiros caracteres, sem passar por
// Date (evita o erro de fuso); instante (2026-09-30T12:00:00.000Z, gravado em
// UTC) vira o dia de Brasília.
function pscData(valor) {
  if (!valor) return "—";
  const texto = String(valor);
  if (!texto.includes("T")) return formatarDataEbd(texto);
  const d = new Date(texto);
  if (Number.isNaN(d.getTime())) return formatarDataEbd(texto);
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function pscMensagemErro(data) {
  return (data && data.mensagem) || "Não foi possível concluir a operação agora.";
}
function pscRolarPara(id) {
  const el = document.getElementById(id);
  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Nunca lança: erro de rede, sessão expirada (fetchProtegido já avisou) ou
// resposta que não é JSON viram { sucesso: false, mensagem }.
async function pscRequisitar(caminho, opcoes) {
  try {
    const res = await fetchProtegido(`${API_BASE}/psc/${caminho}`, opcoes);
    try { return await res.json(); }
    catch { return { sucesso: false, mensagem: `Resposta inesperada do servidor (${res.status}).` }; }
  } catch {
    return { sucesso: false, mensagem: "Não foi possível falar com o servidor agora." };
  }
}
function pscObter(caminho) { return pscRequisitar(caminho); }
function pscPostar(acao, corpo) {
  return pscRequisitar(acao, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
}

// Toast + texto fixo na tela (textContent: nada de HTML aqui). `pendencias`
// (envio recusado) ganha a lista de alíneas; `destaque` pinta o aviso.
function mostrarResultadoPsc(data, idMensagem, destaque) {
  let texto = pscMensagemErro(data);
  if (data && Array.isArray(data.pendencias) && data.pendencias.length) texto += ` Alíneas pendentes: ${data.pendencias.join(", ")}.`;
  mostrarToast(texto, data && data.sucesso === false ? "erro" : "sucesso");
  const el = document.getElementById(idMensagem);
  if (el) { el.textContent = texto; el.className = destaque ? "subtitle psc-aviso" : "subtitle"; }
}

function pscSeloStatus(status, rotulo) {
  const classe = status === "HOMOLOGADA" ? "psc-ok" : (status ? "psc-alerta-selo" : "psc-neutro");
  return `<span class="psc-selo ${classe}">${pscDe(PSC_ICONE_STATUS, status, "•")} ${escaparHtmlEbd(rotulo || "sem avaliação")}</span>`;
}
function pscSeloPrazo(prazo) {
  const situacao = prazo && prazo.situacao;
  const [rotulo, classe] = pscDe(PSC_SELO_PRAZO, situacao, null) || [escaparHtmlEbd(situacao || "—"), "psc-neutro"];
  return `<span class="psc-selo ${classe}">${rotulo}</span>`;
}
// Evidência: só https:// vira link; qualquer outra coisa não é repetida na tela.
function pscLinkEvidencia(url) {
  const u = String(url == null ? "" : url).trim();
  if (!u) return "";
  if (/^https:\/\/[^\s]/i.test(u)) return `<a href="${urlSegura(u)}" target="_blank" rel="noopener noreferrer">🔗 ver evidência</a>`;
  return `<span class="psc-alerta">link de evidência recusado (não é https://)</span>`;
}

// Troca de login no mesmo navegador: não deixa o dado da pessoa anterior na tela.
function pscLimparTela() {
  pscPainelCache = null; pscDetalhe = null; pscCatalogoCache = []; pscParametrosCache = null; pscReclassCache = [];
  pscRespostasBase = new Map(); pscRespostasAtuais = new Map();
  ["pscPainelTabela", "pscPainelResumo", "pscPainelReclassificacoes", "pscHistorico", "pscPainelCatalogo"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });
  const detalhe = document.getElementById("pscDetalheAvaliacao");
  if (detalhe) detalhe.innerHTML = "<p class='subtitle'>Escolha uma congregação no painel acima (<em>Ver/Preencher</em>) para abrir a avaliação do exercício.</p>";
  ["pscPainelPrazo", "pscResultadoPainel", "pscResultadoAvaliacao", "pscResultadoReclassificacao", "pscResultadoCatalogo", "pscParametrosResumo"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });
}

function pscAplicarPermissoes() {
  const homologa = pscPodeHomologar();
  document.querySelectorAll("#abaPsc .psc-so-homologacao").forEach(el => { el.style.display = homologa ? "" : "none"; });
}

// Entrada da aba: ano corrente, parâmetros, catálogo e painel.
async function carregarOpcoesPscAcao() {
  if (pscDonoDaTela !== authMatricula) { pscLimparTela(); pscDonoDaTela = authMatricula; }
  pscAplicarPermissoes();
  const campoAno = document.getElementById("pscAno");
  if (campoAno && !campoAno.value) campoAno.value = String(new Date().getFullYear());
  await Promise.all([carregarParametrosPscAcao(), carregarCatalogoPscAcao(), carregarPainelPscAcao()]);
}

// -- Painel do exercício --
async function carregarPainelPscAcao() {
  const campo = document.getElementById("pscAno");
  if (!campo.value) campo.value = String(new Date().getFullYear());
  const ano = numeroDoCampo("pscAno");
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2200) { mostrarToast("Informe um ano de exercício válido (2000 a 2200).", "erro"); return; }
  const data = await pscObter(`painel?ano=${ano}`);
  if (data.sucesso === false) {
    pscPainelCache = null;
    document.getElementById("pscPainelPrazo").textContent = "";
    document.getElementById("pscPainelResumo").innerHTML = "";
    document.getElementById("pscPainelTabela").innerHTML = `<p class="subtitle">${escaparHtmlEbd(pscMensagemErro(data))}</p>`;
    return;
  }
  pscPainelCache = data;
  pscRenderPainel(data);
}

function pscRenderPainel(data) {
  const r = data.resumo || {};
  const exigidos = Number(data.parametros && data.parametros.exerciciosParaReclassificacao) || 2;
  document.getElementById("pscPainelPrazo").textContent =
    `Exercício ${pscNum(data.ano)} — prazo de envio até ${pscData(data.prazoEnvio)}` +
    (data.escopoGlobal === false ? " · você vê só as congregações do seu escopo." : ".");
  const chip = (rotulo, valor, classe) => `<span class="psc-chip${classe ? ` ${classe}` : ""}">${rotulo}: ${pscNum(valor)}</span>`;
  document.getElementById("pscPainelResumo").innerHTML = [
    chip("Congregações", r.total),
    chip("Sem avaliação", r.semAvaliacao),
    chip("Em preenchimento", r.emPreenchimento),
    chip("Aguardando validação", r.aguardandoValidacao),
    chip("Aguardando homologação", r.aguardandoHomologacao, r.aguardandoHomologacao > 0 ? "psc-alerta-selo" : ""),
    chip("Homologadas", r.homologadas, "psc-ok"),
    chip("Atrasadas", r.atrasadas, r.atrasadas > 0 ? "psc-erro" : ""),
    chip("Em Desenvolvimento", r.emDesenvolvimento),
    chip("Referência", r.referencia, "psc-ok"),
    chip("Reprovadas no Nível 1", r.reprovadas, r.reprovadas > 0 ? "psc-erro" : "")
  ].join("");

  const sinais = data.sinais || [];
  const metaSinal = new Map(sinais.map((s, i) => [s.sinalId, { rotulo: `S${i + 1}`, nome: s.nome || s.codigo || "" }]));
  const legenda = sinais.map((s, i) => `<strong>S${i + 1}</strong> ${escaparHtmlEbd(s.nome || s.codigo)}`).join(" · ");
  const linhas = data.congregacoes || [];
  document.getElementById("pscPainelTabela").innerHTML = linhas.length
    ? `<p class="psc-legenda">${legenda}${legenda ? " · " : ""}N = nível atingido (0 = nem o Nível 1) · ✔ = escada do Sinal resolvida</p>
      <table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Status</th><th>Prazo</th><th>Sinais Vitais</th><th>Resultado</th><th>Ações</th></tr></thead><tbody>
        ${linhas.map(c => pscLinhaPainel(c, metaSinal, exigidos)).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhuma congregação no seu escopo.</p>";
}

function pscLinhaPainel(c, metaSinal, exigidos) {
  const congregacaoId = Number(c.congregacaoId);
  const sinais = (c.sinais || []).map(s => {
    const meta = metaSinal.get(s.sinalId) || { rotulo: String(s.codigo || "S"), nome: s.codigo || "" };
    const classes = `psc-sinal-mini${s.concluido ? " psc-concluido" : ""}${Number(s.nivel) === 0 ? " psc-nivel-zero" : ""}`;
    const dica = `${meta.nome} — ${s.concluido ? "escada resolvida" : "escada em aberto"}`;
    return `<span class="${classes}" title="${escaparHtmlEbd(dica)}">${escaparHtmlEbd(meta.rotulo)} N${pscNum(s.nivel)}${s.concluido ? " ✔" : ""}</span>`;
  }).join("");

  let resultado = "—";
  if (c.nivelFinal != null) {
    resultado = `${c.classificacao === "REPROVADA" ? "" : `Nível ${pscNum(c.nivelFinal)} — `}${escaparHtmlEbd(c.rotuloClassificacao || "")}${c.status === "HOMOLOGADA" ? "" : " <span class='psc-legenda'>(provisório)</span>"}`;
  } else if (c.nivelProvisorio != null) {
    resultado = `provisório: ${pscNum(c.nivelProvisorio)}`;
  }
  const seguidas = Number(c.reprovacoesSeguidas) || 0;
  const alertas = [
    seguidas > 0 ? `<div class="psc-alerta">Reprovações seguidas: ${seguidas} de ${exigidos}</div>` : "",
    c.reclassificacao && c.reclassificacao.status === "PROPOSTA" ? `<span class="psc-selo psc-erro">⚠️ reclassificação proposta</span>` : "",
    c.reclassificacao && c.reclassificacao.status === "DECRETADA" ? `<span class="psc-selo psc-alerta-selo">📌 reclassificação decretada</span>` : ""
  ].join("");

  let acoes = "";
  if (c.avaliacaoId == null) {
    if (pscPodeGestao()) acoes += `<button class="btn-link" data-on-click="abrirAvaliacaoPscAcao" data-args-click="${argsAttr(congregacaoId)}">➕ Abrir avaliação</button>`;
  } else {
    const preencher = c.status === "RASCUNHO" && pscPodeGestao();
    acoes += `<button class="btn-link" data-on-click="carregarDetalhePscAcao" data-args-click="${argsAttr(Number(c.avaliacaoId))}">${preencher ? "✏️ Preencher" : "👁️ Ver"}</button>`;
  }
  acoes += `<button class="btn-link" data-on-click="carregarHistoricoPscAcao" data-args-click="${argsAttr(congregacaoId)}">🕘 Histórico</button>`;

  return `<tr>
    <td><strong>${escaparHtmlEbd(c.congregacaoNome)}</strong>${c.areaNome ? `<br /><span class="psc-legenda">${escaparHtmlEbd(c.areaNome)}</span>` : ""}${c.categoria === "EXTENSAO_TENDA" ? `<br /><span class="psc-selo psc-alerta-selo">Extensão da Tenda — sob tutela</span>` : ""}</td>
    <td>${pscSeloStatus(c.status, c.rotuloStatus)}</td>
    <td>${pscSeloPrazo(c.prazo)}</td>
    <td>${sinais || "—"}</td>
    <td>${resultado}${alertas ? `<div>${alertas}</div>` : ""}</td>
    <td>${acoes}</td>
  </tr>`;
}

async function abrirAvaliacaoPscAcao(congregacaoId) {
  const id = Number(congregacaoId);
  const ano = pscPainelCache ? Number(pscPainelCache.ano) : numeroDoCampo("pscAno");
  if (!id || !ano) { mostrarToast("Carregue o painel do exercício antes de abrir uma avaliação.", "erro"); return; }
  const linha = pscPainelCache && (pscPainelCache.congregacoes || []).find(c => c.congregacaoId === id);
  if (!confirm(`Abrir a avaliação do PSC ${ano} de "${linha ? linha.congregacaoNome : `#${id}`}"? Ela nasce em preenchimento, com as sugestões que o sistema já consegue apurar.`)) return;
  const data = await pscPostar("avaliacoes/abrir", { congregacaoId: id, ano });
  if (data.sucesso !== false && Number.isFinite(Number(data.sugestoesAplicadas))) {
    data.mensagem = `${pscMensagemErro(data)} ${Number(data.sugestoesAplicadas)} alínea(s) já vieram com sugestão do sistema.`;
  }
  mostrarResultadoPsc(data, "pscResultadoPainel");
  if (data.sucesso === false) return;
  carregarPainelPscAcao();
  if (data.avaliacaoId) carregarDetalhePscAcao(Number(data.avaliacaoId));
}

// -- Avaliação (detalhe, escada e respostas) --
function pscRespostaMudou(respostaId) {
  const atual = pscRespostasAtuais.get(respostaId), base = pscRespostasBase.get(respostaId);
  if (!atual || !base) return false;
  return atual.situacao !== base.situacao
    || String(atual.observacao || "").trim() !== String(base.observacao || "").trim()
    || String(atual.evidenciaUrl || "").trim() !== String(base.evidenciaUrl || "").trim();
}
function pscIdsAlterados() {
  return [...pscRespostasAtuais.keys()].filter(pscRespostaMudou);
}
function pscAtualizarInfoAlteracoes() {
  const el = document.getElementById("pscAlteracoesInfo");
  if (!el) return;
  const n = pscIdsAlterados().length;
  el.textContent = n ? `${n} alteração(ões) não salva(s)` : "Sem alterações pendentes";
  el.className = n ? "psc-legenda psc-alerta" : "psc-legenda";
}
function pscConfirmarDescarte() {
  const n = pscIdsAlterados().length;
  return !n || confirm(`Há ${n} alteração(ões) não salva(s) na avaliação aberta. Descartar e continuar?`);
}

async function carregarDetalhePscAcao(avaliacaoId) {
  const id = Number(avaliacaoId);
  if (!id) return;
  const outraAvaliacao = !pscDetalhe || pscDetalhe.avaliacaoId !== id;
  if (outraAvaliacao && !pscConfirmarDescarte()) return;
  const container = document.getElementById("pscDetalheAvaliacao");
  const data = await pscObter(`avaliacao?avaliacaoId=${id}`);
  if (data.sucesso === false || !data.avaliacao) {
    container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(pscMensagemErro(data))}</p>`;
    return;
  }
  if (outraAvaliacao) {
    const msg = document.getElementById("pscResultadoAvaliacao");
    if (msg) { msg.textContent = ""; msg.className = "subtitle"; }
  }
  pscDetalhe = data.avaliacao;
  pscRespostasBase = new Map();
  pscRespostasAtuais = new Map();
  (pscDetalhe.sinais || []).forEach(s => (s.niveis || []).forEach(n => (n.criterios || []).forEach(c => {
    const respostaId = Number(c.respostaId);
    if (!respostaId) return;
    const estado = { situacao: c.situacao || "PENDENTE", observacao: c.observacao || "", evidenciaUrl: c.evidenciaUrl || "", codigo: c.codigo || "" };
    pscRespostasBase.set(respostaId, estado);
    pscRespostasAtuais.set(respostaId, { ...estado });
  })));
  container.innerHTML = pscRenderDetalhe(pscDetalhe);
  pscAtualizarInfoAlteracoes();
  if (outraAvaliacao) pscRolarPara("pscDetalheAvaliacao");
}

async function pscRecarregarDetalheAcao() {
  if (!pscDetalhe) return;
  if (!pscConfirmarDescarte()) return;
  await carregarDetalhePscAcao(pscDetalhe.avaliacaoId);
}

function pscRenderDetalhe(a) {
  const editavel = a.editavel === true && pscPodeGestao();
  const res = a.resultado || {};
  const linhaTempo = [
    `<li>🟦 Aberta em ${pscData(a.abertaEm)}</li>`,
    a.enviadaEm ? `<li>📨 Enviada por ${escaparHtmlEbd(a.enviadaPorNome || "—")} em ${pscData(a.enviadaEm)}</li>` : "",
    a.validadaEm ? `<li>✅ Validada por ${escaparHtmlEbd(a.validadaPorNome || "—")} em ${pscData(a.validadaEm)}${a.parecerValidacao ? ` — parecer: ${escaparHtmlEbd(a.parecerValidacao)}` : ""}</li>` : "",
    a.homologadaEm ? `<li>🏛️ Homologada por ${escaparHtmlEbd(a.homologadaPorNome || "—")} em ${pscData(a.homologadaEm)}${a.resolucaoReferencia ? ` — resolução: ${escaparHtmlEbd(a.resolucaoReferencia)}` : ""}</li>` : "",
    a.devolvidaEm ? `<li>↩️ Última devolução em ${pscData(a.devolvidaEm)}${a.motivoDevolucao ? ` — motivo: ${escaparHtmlEbd(a.motivoDevolucao)}` : ""}</li>` : ""
  ].join("");

  let textoResultado;
  if (res.classificacao) {
    textoResultado = `<strong>${escaparHtmlEbd(res.rotuloClassificacao || res.classificacao)}</strong>${res.classificacao === "REPROVADA" ? "" : ` — nível ${pscNum(res.nivelFinal)}`}`
      + (res.congelado ? " <span class='psc-legenda'>(resultado oficial, congelado na homologação)</span>" : " <span class='psc-legenda'>(provisório — vale só depois da homologação)</span>");
  } else {
    textoResultado = `Nível provisório: <strong>${pscNum(res.nivelProvisorio)}</strong> <span class="psc-legenda">(o menor nível entre os 5 Sinais; a classificação sai quando a escada de todos estiver resolvida)</span>`;
  }
  const pendencias = Array.isArray(a.pendenciasEnvio) ? a.pendenciasEnvio : [];
  const avisoEscada = res.concluido ? "" : `<p class="psc-aviso">Escada ainda não resolvida${pendencias.length ? `: faltam responder as alíneas ${pendencias.map(escaparHtmlEbd).join(", ")}` : ""}. Enquanto houver alínea por responder no degrau em que a escada parou, a avaliação não pode ser enviada.</p>`;
  const avisoReprova = res.reprovadaNivel1 ? `<p class="psc-aviso">Há alínea do Nível 1 não atendida — isso reprova a congregação no Nível 1.</p>` : "";

  const cartaoTopo = `<div class="cartao-area-ebd psc-cartao">
    <h4>🩺 ${a.categoria === "EXTENSAO_TENDA" ? "Extensão da Tenda" : "Congregação"} ${escaparHtmlEbd(a.congregacaoNome)} — exercício ${pscNum(a.ano)}</h4>
    <p>${pscSeloStatus(a.status, a.rotuloStatus)} ${pscSeloPrazo(a.prazo)} <span class="psc-legenda">Prazo de envio: ${pscData(a.prazo && a.prazo.prazoEnvio)}</span>
      ${a.categoria === "EXTENSAO_TENDA" ? `<span class="psc-selo psc-alerta-selo">Extensão da Tenda — sob tutela</span>` : ""}
      ${editavel ? "" : `<span class="psc-legenda">· somente leitura</span>`}</p>
    <ul class="psc-linha-tempo">${linhaTempo}</ul>
  </div>
  <div class="cartao-area-ebd psc-cartao">
    <h5>📈 Resultado</h5>
    <p>${textoResultado}</p>
    ${avisoEscada}${avisoReprova}
  </div>`;

  const barraTopo = editavel
    ? `<div class="psc-acoes"><button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="salvarRespostasPscAcao">💾 Salvar respostas</button><span id="pscAlteracoesInfo" class="psc-legenda"></span></div>`
    : "";
  const escada = (a.sinais || []).map((s, i) => pscRenderSinal(s, i, editavel)).join("");
  return `${cartaoTopo}${barraTopo}${escada}${pscRenderAcoesDetalhe(a)}`;
}

function pscRenderSinal(s, indice, editavel) {
  const nome = s.nome || s.codigo || `Sinal ${indice + 1}`;
  return `<div class="cartao-area-ebd psc-cartao">
    <h5>${indice + 1}. ${escaparHtmlEbd(nome)} <span class="psc-selo ${s.concluido ? "psc-ok" : "psc-alerta-selo"}">Nível atingido: ${pscNum(s.nivel)}${s.concluido ? " · escada resolvida" : " · escada em aberto"}</span></h5>
    ${(s.niveis || []).map(n => pscRenderDegrau(n, editavel)).join("")}
  </div>`;
}

function pscRenderDegrau(n, editavel) {
  const situacao = n.situacao;
  const aberto = situacao !== "BLOQUEADO" && situacao !== "SEM_CRITERIOS";
  const contagem = `${pscNum(n.atendidos)}/${pscNum(n.total)} atendida(s)`
    + (n.naoAtendidos > 0 ? ` · ${pscNum(n.naoAtendidos)} não atendida(s)` : "")
    + (n.pendentes > 0 && situacao !== "BLOQUEADO" ? ` · ${pscNum(n.pendentes)} por responder` : "");
  const corpo = situacao === "SEM_CRITERIOS"
    ? "<p class='psc-legenda'>Nenhum critério ativo neste degrau — ele é transposto sem exigir resposta.</p>"
    : (n.criterios || []).map(c => pscRenderCriterio(c, editavel)).join("");
  return `<details class="psc-degrau ${pscDe(PSC_CLASSE_DEGRAU, situacao, "")}"${aberto ? " open" : ""}>
    <summary>Degrau ${pscNum(n.nivel)} — ${pscDe(PSC_ROTULO_DEGRAU, situacao, escaparHtmlEbd(situacao))} <span class="psc-legenda">(${contagem})</span></summary>
    ${corpo}
  </details>`;
}

function pscRenderCriterio(c, editavel) {
  const id = Number(c.respostaId);
  const bloqueada = c.bloqueada === true;
  const orientacao = c.orientacao ? `<div class="psc-orientacao"><strong>Atenção:</strong> ${escaparHtmlEbd(c.orientacao)}</div>` : "";
  let sugestao = "";
  if (c.sugestaoSituacao) {
    const [rotulo, classe] = pscDe(PSC_SELO_SUGESTAO, c.sugestaoSituacao, null) || [escaparHtmlEbd(c.sugestaoSituacao), "psc-neutro"];
    sugestao = `<div class="psc-sugestao"><span class="psc-selo ${classe}">${rotulo}</span>${c.sugestaoSistema ? ` <small>${escaparHtmlEbd(c.sugestaoSistema)}</small>` : ""} <small>· sugestão do sistema — quem avalia decide</small></div>`;
  }
  let corpo;
  if (bloqueada) {
    corpo = "<p class='psc-legenda'>🔒 degrau bloqueado — não precisa responder</p>";
  } else if (editavel && id) {
    const atual = pscRespostasAtuais.get(id) || { situacao: c.situacao, observacao: c.observacao || "", evidenciaUrl: c.evidenciaUrl || "" };
    corpo = `<div class="psc-campos">
        <label><input type="radio" name="pscSit_${id}" id="pscSitA_${id}"${atual.situacao === "ATENDIDO" ? " checked" : ""} data-on-change="pscMarcarRespostaAcao" data-args-change="${argsAttr(id, "ATENDIDO")}" /> Atendido</label>
        <label><input type="radio" name="pscSit_${id}" id="pscSitN_${id}"${atual.situacao === "NAO_ATENDIDO" ? " checked" : ""} data-on-change="pscMarcarRespostaAcao" data-args-change="${argsAttr(id, "NAO_ATENDIDO")}" /> Não atendido</label>
        <button type="button" class="btn-link" data-on-click="pscMarcarRespostaAcao" data-args-click="${argsAttr(id, "PENDENTE")}">limpar</button>
      </div>
      <div class="psc-campos">
        <input type="text" id="pscObs_${id}" maxlength="500" placeholder="Observação (opcional)" value="${escaparHtmlEbd(atual.observacao)}" data-on-input="pscEditarTextoRespostaAcao" data-args-input="${argsAttr(id)}" />
        <input type="text" id="pscEvi_${id}" maxlength="500" placeholder="Link da evidência (https://...)" value="${escaparHtmlEbd(atual.evidenciaUrl)}" data-on-input="pscEditarTextoRespostaAcao" data-args-input="${argsAttr(id)}" />
      </div>`;
  } else {
    const observacao = c.observacao ? ` — ${escaparHtmlEbd(c.observacao)}` : "";
    const evidencia = pscLinkEvidencia(c.evidenciaUrl);
    corpo = `<p><strong>${pscDe(PSC_ROTULO_RESPOSTA, c.situacao, escaparHtmlEbd(c.situacao))}</strong>${observacao}${evidencia ? ` · ${evidencia}` : ""}</p>`;
  }
  return `<div class="psc-criterio${bloqueada ? " psc-bloqueada" : ""}">
    <strong>${escaparHtmlEbd(c.codigo)}</strong> ${escaparHtmlEbd(c.texto)}
    ${orientacao}${sugestao}${corpo}
  </div>`;
}

function pscMarcarRespostaAcao(respostaId, situacao) {
  const atual = pscRespostasAtuais.get(respostaId);
  if (!atual) return;
  atual.situacao = situacao;
  const sim = document.getElementById(`pscSitA_${respostaId}`), nao = document.getElementById(`pscSitN_${respostaId}`);
  if (sim) sim.checked = situacao === "ATENDIDO";
  if (nao) nao.checked = situacao === "NAO_ATENDIDO";
  pscAtualizarInfoAlteracoes();
}

function pscEditarTextoRespostaAcao(respostaId) {
  const atual = pscRespostasAtuais.get(respostaId);
  if (!atual) return;
  const obs = document.getElementById(`pscObs_${respostaId}`), evi = document.getElementById(`pscEvi_${respostaId}`);
  if (obs) atual.observacao = obs.value;
  if (evi) atual.evidenciaUrl = evi.value;
  pscAtualizarInfoAlteracoes();
}

// Envia SÓ o que mudou, em lotes de até 200 (limite do servidor). A escada é
// recalculada no servidor, então depois de salvar recarrega o detalhe (degraus
// podem destravar). `silencioso`: chamado por outra ação, que segue depois.
async function salvarRespostasPscAcao(silencioso) {
  if (!pscDetalhe) return false;
  const avaliacaoId = pscDetalhe.avaliacaoId;
  const ids = pscIdsAlterados();
  if (!ids.length) {
    if (!silencioso) mostrarToast("Nenhuma alteração para salvar.", "sucesso");
    return true;
  }
  const itens = [];
  for (const respostaId of ids) {
    const r = pscRespostasAtuais.get(respostaId);
    const observacao = String(r.observacao || "").trim();
    const evidenciaUrl = String(r.evidenciaUrl || "").trim();
    if (observacao.length > 500) { mostrarToast(`A observação da alínea ${r.codigo} passa de 500 caracteres.`, "erro"); return false; }
    if (evidenciaUrl && (evidenciaUrl.length > 500 || /\s/.test(evidenciaUrl) || !/^https:\/\/[^/]/i.test(evidenciaUrl))) {
      mostrarToast(`O link da evidência da alínea ${r.codigo} deve começar com https:// e não ter espaços.`, "erro");
      return false;
    }
    itens.push({ respostaId, situacao: r.situacao, observacao, evidenciaUrl });
  }
  for (let i = 0; i < itens.length; i += 200) {
    const lote = itens.slice(i, i + 200);
    const data = await pscPostar("avaliacoes/responder", { avaliacaoId, respostas: lote });
    if (data.sucesso === false) { mostrarResultadoPsc(data, "pscResultadoAvaliacao"); pscAtualizarInfoAlteracoes(); return false; }
    // O que já foi gravado deixa de contar como alteração (se um lote seguinte falhar).
    lote.forEach(it => {
      const base = pscRespostasBase.get(it.respostaId) || {};
      pscRespostasBase.set(it.respostaId, { ...base, situacao: it.situacao, observacao: it.observacao, evidenciaUrl: it.evidenciaUrl });
    });
  }
  mostrarResultadoPsc({ sucesso: true, mensagem: `${itens.length} resposta(s) salva(s). A escada foi recalculada.` }, "pscResultadoAvaliacao");
  await carregarDetalhePscAcao(avaliacaoId);
  carregarPainelPscAcao();
  return true;
}

// Antes de qualquer ação que recarrega ou muda o estado: alteração não salva
// é salva primeiro (com confirmação) ou a ação é interrompida.
async function pscGarantirSalvoAcao() {
  const n = pscIdsAlterados().length;
  if (!n) return true;
  if (!confirm(`Há ${n} alteração(ões) não salva(s). Salvar agora e continuar? (Cancelar interrompe a ação.)`)) return false;
  return salvarRespostasPscAcao(true);
}

async function atualizarSugestoesPscAcao() {
  if (!pscDetalhe || pscAcaoEmCurso) return;
  if (!(await pscGarantirSalvoAcao())) return;
  const avaliacaoId = pscDetalhe.avaliacaoId;
  const data = await pscPostar("avaliacoes/sugestoes", { avaliacaoId });
  mostrarResultadoPsc(data, "pscResultadoAvaliacao");
  if (data.sucesso !== false) await carregarDetalhePscAcao(avaliacaoId);
}

// -- Transições de estado (enviar, validar, devolver, homologar, reabrir) --
async function pscTransicaoAcao(rota, corpoExtra) {
  if (!pscDetalhe || pscAcaoEmCurso) return;
  const avaliacaoId = pscDetalhe.avaliacaoId;
  pscAcaoEmCurso = true;
  try {
    const data = await pscPostar(rota, { avaliacaoId, ...corpoExtra });
    const proposta = !!(data && data.reclassificacaoProposta);
    mostrarResultadoPsc(data, "pscResultadoAvaliacao", proposta);
    if (data.sucesso === false) return;
    await carregarDetalhePscAcao(avaliacaoId);
    carregarPainelPscAcao();
    if (proposta) carregarReclassificacoesPscAcao();
  } finally {
    pscAcaoEmCurso = false;
  }
}

function pscTextoDoCampo(id) {
  const campo = document.getElementById(id);
  return campo ? String(campo.value || "").trim() : "";
}

async function enviarAvaliacaoPscAcao() {
  if (!pscDetalhe) return;
  if (!(await pscGarantirSalvoAcao())) return;
  if (!confirm("Enviar esta avaliação para validação? Depois de enviada ela deixa de ser editável (só volta se for devolvida).")) return;
  await pscTransicaoAcao("avaliacoes/enviar", {});
}

async function validarAvaliacaoPscAcao() {
  if (!pscDetalhe) return;
  const parecer = pscTextoDoCampo("pscParecer");
  if (parecer.length > 1000) { mostrarToast("O parecer passa de 1000 caracteres.", "erro"); return; }
  if (!(await pscGarantirSalvoAcao())) return;
  if (!confirm("Validar esta avaliação? Ela segue para a homologação da CLI. Quem enviou a avaliação não pode validá-la.")) return;
  await pscTransicaoAcao("avaliacoes/validar", parecer ? { parecer } : {});
}

async function devolverAvaliacaoPscAcao() {
  if (!pscDetalhe) return;
  const motivo = pscTextoDoCampo("pscMotivoDevolucao");
  if (motivo.length < 10 || motivo.length > 500) { mostrarToast("Informe o motivo da devolução (de 10 a 500 caracteres).", "erro"); return; }
  if (!(await pscGarantirSalvoAcao())) return;
  if (!confirm("Devolver esta avaliação para correção? Ela volta ao preenchimento e o envio/validação feitos até aqui são desfeitos.")) return;
  await pscTransicaoAcao("avaliacoes/devolver", { motivo });
}

async function homologarAvaliacaoPscAcao() {
  if (!pscDetalhe) return;
  const resolucao = pscTextoDoCampo("pscResolucaoHomologacao");
  if (resolucao.length < 3 || resolucao.length > 150) { mostrarToast("Informe a resolução da CLI que homologa (de 3 a 150 caracteres).", "erro"); return; }
  if (!(await pscGarantirSalvoAcao())) return;
  if (!confirm("Homologar esta avaliação? O resultado fica oficial e congelado. Quem enviou ou validou não pode homologar. Se for o 2º exercício seguido reprovado no Nível 1, nasce uma proposta de reclassificação.")) return;
  await pscTransicaoAcao("avaliacoes/homologar", { resolucao });
}

async function reabrirAvaliacaoPscAcao() {
  if (!pscDetalhe) return;
  const motivo = pscTextoDoCampo("pscMotivoReabertura");
  if (motivo.length < 10 || motivo.length > 500) { mostrarToast("Informe o motivo da reabertura (de 10 a 500 caracteres).", "erro"); return; }
  if (!(await pscGarantirSalvoAcao())) return;
  if (!confirm("Reabrir esta avaliação para correção? O resultado oficial anterior é desfeito.")) return;
  await pscTransicaoAcao("avaliacoes/reabrir", { motivo });
}

// Botões e campos conforme o estado da avaliação e a permissão de quem olha.
function pscRenderAcoesDetalhe(a) {
  const gestao = pscPodeGestao(), homologa = pscPodeHomologar();
  // "acao" é sempre um dos nomes fixos escritos abaixo (lista fechada do código, conferida pelo teste frontCsp), nunca dado
  const botao = (rotulo, acao, secundario) => `<button class="btn-confirmar${secundario ? " btn-secundario" : ""}" style="width:auto;margin:0;" data-on-click="${acao}">${rotulo}</button>`;
  let corpo = "";
  if (a.status === "RASCUNHO") {
    corpo = gestao
      ? `<div class="psc-acoes">${botao("💾 Salvar respostas", "salvarRespostasPscAcao")}${botao("🔄 Atualizar sugestões do sistema", "atualizarSugestoesPscAcao", true)}${botao("📨 Enviar para validação", "enviarAvaliacaoPscAcao")}</div>
        <p class="psc-legenda">As sugestões do sistema vêm de dados que o próprio sistema já tem (repasses, prestação de contas...). Ajudam, mas quem avalia decide.</p>`
      : `<p class="subtitle">Em preenchimento. Quem responde e envia é quem tem a permissão de gestão do PSC no escopo desta congregação.</p>`;
  } else if (a.status === "ENVIADA") {
    corpo = gestao
      ? `<label for="pscParecer" class="psc-legenda">Parecer da validação (opcional, até 1000 caracteres)</label>
        <textarea id="pscParecer" rows="2" maxlength="1000" style="width:100%;" placeholder="Parecer de quem valida"></textarea>
        <div class="psc-acoes">${botao("✅ Validar", "validarAvaliacaoPscAcao")}</div>
        <label for="pscMotivoDevolucao" class="psc-legenda">Se for devolver: motivo (mínimo 10 caracteres)</label>
        <textarea id="pscMotivoDevolucao" rows="2" maxlength="500" style="width:100%;" placeholder="O que precisa ser corrigido"></textarea>
        <div class="psc-acoes">${botao("↩️ Devolver para correção", "devolverAvaliacaoPscAcao", true)}</div>
        <p class="psc-legenda">Quem enviou a avaliação não pode validá-la: a validação é de outra pessoa.</p>`
      : `<p class="subtitle">Aguardando a validação de quem tem a permissão de gestão do PSC no escopo.</p>`;
  } else if (a.status === "VALIDADA") {
    corpo = homologa
      ? `<label for="pscResolucaoHomologacao" class="psc-legenda">Resolução da CLI que homologa (obrigatória, 3 a 150 caracteres)</label>
        <input type="text" id="pscResolucaoHomologacao" maxlength="150" placeholder="Ex.: Resolução CLI nº 12/2027" />
        <div class="psc-acoes">${botao("🏛️ Homologar", "homologarAvaliacaoPscAcao")}</div>
        <label for="pscMotivoDevolucao" class="psc-legenda">Se for devolver: motivo (mínimo 10 caracteres)</label>
        <textarea id="pscMotivoDevolucao" rows="2" maxlength="500" style="width:100%;" placeholder="O que precisa ser corrigido"></textarea>
        <div class="psc-acoes">${botao("↩️ Devolver para correção", "devolverAvaliacaoPscAcao", true)}</div>
        <p class="psc-legenda">Quem enviou ou validou a avaliação não pode homologá-la.</p>`
      : `<p class="subtitle">Validada. Aguardando a homologação da CLI.</p>`;
  } else if (a.status === "HOMOLOGADA") {
    corpo = homologa
      ? `<p class="subtitle">Homologada: o resultado é oficial. Para corrigir, reabra com um motivo (não é possível se o exercício sustenta uma reclassificação em andamento: arquive a proposta antes).</p>
        <label for="pscMotivoReabertura" class="psc-legenda">Motivo da reabertura (mínimo 10 caracteres)</label>
        <textarea id="pscMotivoReabertura" rows="2" maxlength="500" style="width:100%;" placeholder="Por que o resultado precisa ser refeito"></textarea>
        <div class="psc-acoes">${botao("🔓 Reabrir para correção", "reabrirAvaliacaoPscAcao", true)}</div>`
      : `<p class="subtitle">Homologada: o resultado é oficial.</p>`;
  }
  return `<div class="cartao-area-ebd psc-cartao">
    <h5>⚙️ Ações</h5>
    ${corpo}
    <div class="psc-acoes">${botao("🔄 Recarregar avaliação", "pscRecarregarDetalheAcao", true)}</div>
  </div>`;
}

// -- Reclassificações compulsórias (Art. 129) --
async function carregarReclassificacoesPscAcao() {
  const container = document.getElementById("pscPainelReclassificacoes");
  const status = document.getElementById("pscFiltroReclass").value;
  const data = await pscObter(`reclassificacoes${status ? `?status=${encodeURIComponent(status)}` : ""}`);
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(pscMensagemErro(data))}</p>`; return; }
  pscReclassCache = data.reclassificacoes || [];
  container.innerHTML = pscReclassCache.length
    ? pscReclassCache.map(r => pscRenderReclassificacao(r, true)).join("") +
      (data.truncado ? "<p class='subtitle psc-aviso'>A lista foi cortada nas 500 mais recentes — filtre por situação para ver as demais.</p>" : "")
    : "<p class='subtitle'>Nenhuma reclassificação encontrada.</p>";
}

function pscRenderReclassificacao(r, comAcoes) {
  const id = Number(r.reclassificacaoId);
  const homologa = pscPodeHomologar();
  const anos = r.anoInicial === r.anoFinal ? pscNum(r.anoInicial) : `${pscNum(r.anoInicial)} a ${pscNum(r.anoFinal)}`;
  const por = (nome) => (nome ? ` por ${escaparHtmlEbd(nome)}` : "");
  const linhas = [
    `Exercícios: ${anos}, ${pscNum(r.exerciciosConsecutivos)} ${Number(r.exerciciosConsecutivos) === 1 ? "seguido" : "seguidos"} com reprovação no Nível 1`,
    `Proposta em ${pscData(r.propostaEm)}`
  ];
  if (r.status !== "PROPOSTA" && r.decididaEm) {
    linhas.push(`Decisão da CLI em ${pscData(r.decididaEm)}${por(r.decididaPorNome)}${r.resolucaoReferencia ? ` — resolução: ${escaparHtmlEbd(r.resolucaoReferencia)}` : ""}`);
  }
  if (r.status === "DECRETADA" || r.status === "REVERTIDA") {
    const retencao = r.percentualRetencaoAnterior == null ? "—" : `${Number(r.percentualRetencaoAnterior).toLocaleString("pt-BR")}%`;
    linhas.push(`Efeitos do decreto: Congregação-Mãe: ${r.congregacaoMaeNome ? escaparHtmlEbd(r.congregacaoMaeNome) : "Sede"} · encarregado: ${r.encarregadoNome ? `${escaparHtmlEbd(r.encarregadoNome)} (matrícula ${pscNum(r.encarregadoMembroId)})` : "—"} · retenção local anterior: ${retencao} · saldo local a recolher: ${formatarMoedaEbd(r.saldoLocalNoDecreto)} · mandatos encerrados: ${pscNum(r.liderancasEncerradas)}`);
  }
  if (r.status === "ARQUIVADA" && r.motivoArquivamento) linhas.push(`Motivo do arquivamento: ${escaparHtmlEbd(r.motivoArquivamento)}`);
  if (r.status === "REVERTIDA") {
    linhas.push(`Autonomia restabelecida em ${pscData(r.restabelecidaEm)}${por(r.restabelecidaPorNome)}${r.resolucaoRestabelecimento ? ` — resolução: ${escaparHtmlEbd(r.resolucaoRestabelecimento)}` : ""}${r.motivoRestabelecimento ? `; motivo: ${escaparHtmlEbd(r.motivoRestabelecimento)}` : ""}`);
  }

  let acoes = "";
  if (comAcoes && homologa) {
    if (r.status === "PROPOSTA") {
      acoes = `<button class="btn-link" data-on-click="abrirFormReclassPscAcao" data-args-click="${argsAttr(id, "decretar")}">📌 Decretar…</button>
        <button class="btn-link btn-link-perigo" data-on-click="abrirFormReclassPscAcao" data-args-click="${argsAttr(id, "arquivar")}">🗄️ Arquivar…</button>`;
    } else if (r.status === "DECRETADA") {
      acoes = `<button class="btn-link" data-on-click="abrirFormReclassPscAcao" data-args-click="${argsAttr(id, "restabelecer")}">♻️ Restabelecer autonomia…</button>`;
    }
  }
  return `<div class="cartao-area-ebd psc-cartao">
    <h5>${escaparHtmlEbd(r.congregacaoNome)} <span class="psc-selo ${pscDe(PSC_CLASSE_RECLASSIFICACAO, r.status, "psc-neutro")}">${pscDe(PSC_ROTULO_RECLASSIFICACAO, r.status, escaparHtmlEbd(r.status))}</span>
      ${r.categoriaAtual === "EXTENSAO_TENDA" ? `<span class="psc-selo psc-alerta-selo">hoje: Extensão da Tenda</span>` : ""}</h5>
    ${linhas.map(l => `<p style="margin:3px 0;font-size:0.88rem;">${l}</p>`).join("")}
    ${acoes ? `<div class="psc-acoes">${acoes}</div>` : ""}
    ${comAcoes ? `<div id="pscFormReclass_${id}"></div>` : ""}
  </div>`;
}

function pscNomeDaReclassificacao(id) {
  const r = pscReclassCache.find(x => Number(x.reclassificacaoId) === id);
  return r ? r.congregacaoNome : `#${id}`;
}

function fecharFormReclassPscAcao(id) {
  const area = document.getElementById(`pscFormReclass_${id}`);
  if (area) area.innerHTML = "";
}

// Mini-formulário inline no próprio cartão. Congregação-Mãe: as congregações
// do painel carregado que são CONGREGACAO e não a própria.
function abrirFormReclassPscAcao(reclassificacaoId, tipo) {
  const id = Number(reclassificacaoId);
  const area = document.getElementById(`pscFormReclass_${id}`);
  const r = pscReclassCache.find(x => Number(x.reclassificacaoId) === id);
  if (!area || !r) return;
  if (tipo === "decretar") {
    const maes = pscPainelCache ? (pscPainelCache.congregacoes || []).filter(c => c.categoria === "CONGREGACAO" && c.congregacaoId !== r.congregacaoId) : [];
    area.innerHTML = `<div class="psc-form-inline">
      <p class="psc-aviso">A unidade deixa de ser Congregação, o caixa local é recolhido, os mandatos da diretoria local são encerrados e o encarregado assume.</p>
      <label for="pscDecResolucao_${id}">Resolução da CLI (obrigatória, 3 a 150 caracteres)</label>
      <input type="text" id="pscDecResolucao_${id}" maxlength="150" />
      <label for="pscDecEncarregado_${id}">Matrícula do encarregado (não pode ser da diretoria atual)</label>
      <input type="number" id="pscDecEncarregado_${id}" min="1" />
      <label for="pscDecMae_${id}">Congregação-Mãe (opcional)</label>
      <select id="pscDecMae_${id}">
        <option value="">Sede (sem Congregação-Mãe)</option>
        ${maes.map(c => `<option value="${Number(c.congregacaoId)}">${escaparHtmlEbd(c.congregacaoNome)}${c.areaNome ? ` — ${escaparHtmlEbd(c.areaNome)}` : ""}</option>`).join("")}
      </select>
      <div class="psc-acoes">
        <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="decretarReclassificacaoPscAcao" data-args-click="${argsAttr(id)}">📌 Decretar</button>
        <button class="btn-link" data-on-click="fecharFormReclassPscAcao" data-args-click="${argsAttr(id)}">cancelar</button>
      </div>
    </div>`;
  } else if (tipo === "arquivar") {
    area.innerHTML = `<div class="psc-form-inline">
      <p class="psc-legenda">Arquivar mantém a congregação como está; a proposta fica registrada com o motivo.</p>
      <label for="pscArqMotivo_${id}">Motivo do arquivamento (mínimo 10 caracteres)</label>
      <textarea id="pscArqMotivo_${id}" rows="2" maxlength="500" style="width:100%;"></textarea>
      <label for="pscArqResolucao_${id}">Resolução da CLI (opcional, até 150 caracteres)</label>
      <input type="text" id="pscArqResolucao_${id}" maxlength="150" />
      <div class="psc-acoes">
        <button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="arquivarReclassificacaoPscAcao" data-args-click="${argsAttr(id)}">🗄️ Arquivar proposta</button>
        <button class="btn-link" data-on-click="fecharFormReclassPscAcao" data-args-click="${argsAttr(id)}">cancelar</button>
      </div>
    </div>`;
  } else if (tipo === "restabelecer") {
    area.innerHTML = `<div class="psc-form-inline">
      <p class="psc-aviso">Exige uma avaliação homologada de exercício posterior, sem reprovação no Nível 1. A diretoria não volta sozinha: depois, nomeie ou eleja a nova em Permissões.</p>
      <label for="pscResResolucao_${id}">Resolução da CLI que restabelece (obrigatória, 3 a 150 caracteres)</label>
      <input type="text" id="pscResResolucao_${id}" maxlength="150" />
      <label for="pscResMotivo_${id}">Motivo do restabelecimento (mínimo 10 caracteres)</label>
      <textarea id="pscResMotivo_${id}" rows="2" maxlength="500" style="width:100%;"></textarea>
      <div class="psc-acoes">
        <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="restabelecerReclassificacaoPscAcao" data-args-click="${argsAttr(id)}">♻️ Restabelecer autonomia</button>
        <button class="btn-link" data-on-click="fecharFormReclassPscAcao" data-args-click="${argsAttr(id)}">cancelar</button>
      </div>
    </div>`;
  }
}

async function pscConcluirDecisaoReclassificacao(data) {
  mostrarResultadoPsc(data, "pscResultadoReclassificacao");
  if (data.sucesso === false) return;
  await carregarReclassificacoesPscAcao();
  carregarPainelPscAcao();
}

async function decretarReclassificacaoPscAcao(reclassificacaoId) {
  const id = Number(reclassificacaoId);
  const resolucao = pscTextoDoCampo(`pscDecResolucao_${id}`);
  const encarregado = numeroDoCampo(`pscDecEncarregado_${id}`);
  const mae = numeroDoCampo(`pscDecMae_${id}`);
  if (resolucao.length < 3 || resolucao.length > 150) { mostrarToast("Informe a resolução da CLI (de 3 a 150 caracteres).", "erro"); return; }
  if (!Number.isInteger(encarregado) || encarregado <= 0) { mostrarToast("Informe a matrícula do encarregado que assume a unidade.", "erro"); return; }
  if (!confirm(`Decretar a reclassificação de "${pscNomeDaReclassificacao(id)}" para Extensão da Tenda? O caixa local é recolhido, os mandatos da diretoria local são encerrados e o encarregado (matrícula ${encarregado}) assume. Isso só se desfaz restabelecendo a autonomia.`)) return;
  const corpo = { reclassificacaoId: id, resolucao, encarregadoMembroId: encarregado };
  if (mae) corpo.congregacaoMaeId = mae;
  await pscConcluirDecisaoReclassificacao(await pscPostar("reclassificacoes/decretar", corpo));
}

async function arquivarReclassificacaoPscAcao(reclassificacaoId) {
  const id = Number(reclassificacaoId);
  const motivo = pscTextoDoCampo(`pscArqMotivo_${id}`);
  const resolucao = pscTextoDoCampo(`pscArqResolucao_${id}`);
  if (motivo.length < 10 || motivo.length > 500) { mostrarToast("Informe o motivo do arquivamento (de 10 a 500 caracteres).", "erro"); return; }
  if (resolucao.length > 150) { mostrarToast("A resolução passa de 150 caracteres.", "erro"); return; }
  if (!confirm(`Arquivar a proposta de reclassificação de "${pscNomeDaReclassificacao(id)}"? A congregação segue como está.`)) return;
  const corpo = { reclassificacaoId: id, motivo };
  if (resolucao) corpo.resolucao = resolucao;
  await pscConcluirDecisaoReclassificacao(await pscPostar("reclassificacoes/arquivar", corpo));
}

async function restabelecerReclassificacaoPscAcao(reclassificacaoId) {
  const id = Number(reclassificacaoId);
  const resolucao = pscTextoDoCampo(`pscResResolucao_${id}`);
  const motivo = pscTextoDoCampo(`pscResMotivo_${id}`);
  if (resolucao.length < 3 || resolucao.length > 150) { mostrarToast("Informe a resolução da CLI (de 3 a 150 caracteres).", "erro"); return; }
  if (motivo.length < 10 || motivo.length > 500) { mostrarToast("Informe o motivo do restabelecimento (de 10 a 500 caracteres).", "erro"); return; }
  if (!confirm(`Restabelecer a autonomia de "${pscNomeDaReclassificacao(id)}"? A unidade volta a ser Congregação, mas a diretoria não volta sozinha.`)) return;
  await pscConcluirDecisaoReclassificacao(await pscPostar("reclassificacoes/restabelecer", { reclassificacaoId: id, resolucao, motivo }));
}

// -- Histórico da congregação --
async function carregarHistoricoPscAcao(congregacaoId) {
  const container = document.getElementById("pscHistorico");
  const id = typeof congregacaoId === "number" ? congregacaoId : numeroDoCampo("pscHistCongregacaoId");
  if (!Number.isInteger(id) || id <= 0) { mostrarToast("Informe o Id da congregação.", "erro"); return; }
  document.getElementById("pscHistCongregacaoId").value = id;
  const data = await pscObter(`historico?congregacaoId=${id}`);
  if (data.sucesso === false || !data.congregacao) {
    container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(pscMensagemErro(data))}</p>`;
    pscRolarPara("pscHistorico");
    return;
  }
  const c = data.congregacao;
  const avaliacoes = data.avaliacoes || [];
  const reclass = data.reclassificacoes || [];
  const retencao = c.percentualRetencaoLocal == null ? "—" : `${Number(c.percentualRetencaoLocal).toLocaleString("pt-BR")}%`;
  container.innerHTML = `<div class="cartao-area-ebd psc-cartao">
      <h5>${escaparHtmlEbd(c.nome)} ${c.categoria === "EXTENSAO_TENDA" ? `<span class="psc-selo psc-alerta-selo">Extensão da Tenda — sob tutela</span>` : `<span class="psc-selo psc-neutro">Congregação</span>`}</h5>
      <p class="psc-legenda">Retenção local de ofertas hoje: ${retencao}</p>
      ${avaliacoes.length
        ? `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Ano</th><th>Status</th><th>Nível</th><th>Classificação</th><th>Resolução</th><th></th></tr></thead><tbody>
          ${avaliacoes.map(a => `<tr>
            <td>${pscNum(a.ano)}</td><td>${pscSeloStatus(a.status, a.rotuloStatus)}</td><td>${a.nivelFinal != null ? pscNum(a.nivelFinal) : "—"}</td>
            <td>${a.rotuloClassificacao ? escaparHtmlEbd(a.rotuloClassificacao) : "—"}</td><td>${a.resolucaoReferencia ? escaparHtmlEbd(a.resolucaoReferencia) : "—"}</td>
            <td><button class="btn-link" data-on-click="carregarDetalhePscAcao" data-args-click="${argsAttr(Number(a.avaliacaoId))}">📂 Abrir</button></td></tr>`).join("")}
        </tbody></table></div>`
        : "<p class='subtitle'>Nenhuma avaliação do PSC para esta congregação ainda.</p>"}
    </div>
    ${reclass.length ? `<h5>Reclassificações desta congregação</h5>${reclass.map(r => pscRenderReclassificacao(r, false)).join("")}` : ""}`;
  pscRolarPara("pscHistorico");
}

// -- Catálogo e parâmetros --
async function carregarParametrosPscAcao() {
  const data = await pscObter("parametros");
  const resumo = document.getElementById("pscParametrosResumo");
  if (data.sucesso === false || !data.parametros) { if (resumo) resumo.textContent = pscMensagemErro(data); return; }
  pscParametrosCache = data.parametros;
  const p = pscParametrosCache;
  if (resumo) {
    resumo.textContent = `Parâmetros vigentes: o PSC vale a partir do exercício ${pscNum(p.primeiroExercicio)}; o prazo de envio vai até ${pscNum(p.prazoEnvioDias)} dia(s) depois de 31/12; ${pscNum(p.exerciciosParaReclassificacao)} exercício(s) seguido(s) reprovado(s) no Nível 1 abrem a proposta de reclassificação.`;
  }
  [["pscParamPrimeiroExercicio", p.primeiroExercicio], ["pscParamPrazoDias", p.prazoEnvioDias], ["pscParamExercicios", p.exerciciosParaReclassificacao]].forEach(([campo, valor]) => {
    const el = document.getElementById(campo);
    if (el) el.value = valor == null ? "" : String(valor);
  });
}

async function salvarParametrosPscAcao() {
  const primeiroExercicio = numeroDoCampo("pscParamPrimeiroExercicio");
  const prazoEnvioDias = numeroDoCampo("pscParamPrazoDias");
  const exerciciosParaReclassificacao = numeroDoCampo("pscParamExercicios");
  if (!Number.isInteger(primeiroExercicio) || primeiroExercicio < 2000 || primeiroExercicio > 2200) { mostrarToast("O primeiro exercício deve ser um ano entre 2000 e 2200.", "erro"); return; }
  if (!Number.isInteger(prazoEnvioDias) || prazoEnvioDias < 0 || prazoEnvioDias > 365) { mostrarToast("O prazo de envio deve ser de 0 a 365 dias depois de 31/12.", "erro"); return; }
  if (!Number.isInteger(exerciciosParaReclassificacao) || exerciciosParaReclassificacao < 1 || exerciciosParaReclassificacao > 10) { mostrarToast("Os exercícios seguidos para reclassificar devem ser de 1 a 10.", "erro"); return; }
  const data = await pscPostar("parametros", { primeiroExercicio, prazoEnvioDias, exerciciosParaReclassificacao });
  mostrarResultadoPsc(data, "pscResultadoCatalogo");
  if (data.sucesso === false) return;
  await carregarParametrosPscAcao();
  carregarPainelPscAcao();
}

async function carregarCatalogoPscAcao() {
  const container = document.getElementById("pscPainelCatalogo");
  const inativos = document.getElementById("pscMostrarInativos");
  const todos = pscPodeHomologar() && inativos && inativos.checked ? "?todos=1" : "";
  const data = await pscObter(`catalogo${todos}`);
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(pscMensagemErro(data))}</p>`; return; }
  pscCatalogoCache = data.sinais || [];
  const seletor = document.getElementById("pscNovoCriterioSinal");
  if (seletor) {
    const escolhido = seletor.value;
    seletor.innerHTML = pscCatalogoCache.map(s => `<option value="${Number(s.sinalId)}">${escaparHtmlEbd(s.nome)}</option>`).join("");
    if (escolhido) seletor.value = escolhido;
  }
  const homologa = pscPodeHomologar();
  const inativo = (item) => item.ativo === false || item.ativo === 0;
  container.innerHTML = pscCatalogoCache.length ? pscCatalogoCache.map((s, i) => {
    const niveis = (s.niveis || []).map(n => `<div class="psc-degrau">
      <strong>Degrau ${pscNum(n.nivel)}</strong>
      ${(n.criterios || []).length ? n.criterios.map(c => `<div class="psc-criterio${inativo(c) ? " psc-inativo" : ""}">
          <strong>${escaparHtmlEbd(c.codigo)}</strong> ${escaparHtmlEbd(c.texto)}${inativo(c) ? " <em>(inativo)</em>" : ""}
          ${c.artigoRef ? `<span class="psc-legenda">· ${escaparHtmlEbd(c.artigoRef)}</span>` : ""}
          ${c.fonteAutomatica ? `<span class="psc-selo psc-neutro" title="O sistema consegue sugerir esta resposta a partir de dados que já tem">🤖 sugestão automática</span>` : ""}
          ${c.orientacao ? `<div class="psc-orientacao"><strong>Atenção:</strong> ${escaparHtmlEbd(c.orientacao)}</div>` : ""}
          ${homologa ? `<div><button class="btn-link" data-on-click="editarCriterioPscAcao" data-args-click="${argsAttr(Number(c.criterioId))}">✏️ Editar texto</button>
            <button class="btn-link${inativo(c) ? "" : " btn-link-perigo"}" data-on-click="alternarCriterioPscAcao" data-args-click="${argsAttr(Number(c.criterioId), inativo(c) ? true : false)}">${inativo(c) ? "✅ Ativar" : "⛔ Desativar"}</button></div>` : ""}
        </div>`).join("") : "<p class='psc-legenda'>Sem critérios neste degrau.</p>"}
    </div>`).join("");
    return `<div class="cartao-area-ebd psc-cartao${inativo(s) ? " psc-inativo" : ""}">
      <h5>${i + 1}. ${escaparHtmlEbd(s.nome)}${inativo(s) ? " (inativo)" : ""}</h5>
      <p class="psc-legenda">${s.artigoRef ? `${escaparHtmlEbd(s.artigoRef)} · ` : ""}${escaparHtmlEbd(s.descricao || "")}</p>
      ${niveis}
    </div>`;
  }).join("") : "<p class='subtitle'>Catálogo vazio.</p>";
}

function pscCriterioPorId(criterioId) {
  for (const s of pscCatalogoCache) for (const n of (s.niveis || [])) for (const c of (n.criterios || [])) {
    if (Number(c.criterioId) === criterioId) return c;
  }
  return null;
}

async function criarCriterioPscAcao() {
  const sinalId = numeroDoCampo("pscNovoCriterioSinal"), nivel = numeroDoCampo("pscNovoCriterioNivel");
  const texto = pscTextoDoCampo("pscNovoCriterioTexto"), orientacao = pscTextoDoCampo("pscNovoCriterioOrientacao");
  if (!sinalId) { mostrarToast("Escolha o Sinal Vital.", "erro"); return; }
  if (!Number.isInteger(nivel) || nivel < 1 || nivel > 5) { mostrarToast("Escolha o degrau (nível 1 a 5).", "erro"); return; }
  if (texto.length < 10 || texto.length > 600) { mostrarToast("Descreva o critério (de 10 a 600 caracteres).", "erro"); return; }
  if (orientacao.length > 500) { mostrarToast("A orientação passa de 500 caracteres.", "erro"); return; }
  const corpo = { sinalId, nivel, texto };
  if (orientacao) corpo.orientacao = orientacao;
  const data = await pscPostar("catalogo/criterio", corpo);
  mostrarResultadoPsc(data, "pscResultadoCatalogo");
  if (data.sucesso === false) return;
  document.getElementById("pscNovoCriterioTexto").value = "";
  document.getElementById("pscNovoCriterioOrientacao").value = "";
  carregarCatalogoPscAcao();
}

async function editarCriterioPscAcao(criterioId) {
  const id = Number(criterioId);
  const criterio = pscCriterioPorId(id);
  if (!criterio) return;
  const novo = prompt("Novo texto do critério (de 10 a 600 caracteres). Vale só para as avaliações abertas daqui em diante:", criterio.texto);
  if (novo == null) return;
  const texto = novo.trim();
  if (texto === String(criterio.texto || "").trim()) return;
  if (texto.length < 10 || texto.length > 600) { mostrarToast("O texto deve ter de 10 a 600 caracteres.", "erro"); return; }
  const data = await pscPostar("catalogo/criterio/atualizar", { criterioId: id, texto });
  mostrarResultadoPsc(data, "pscResultadoCatalogo");
  if (data.sucesso !== false) carregarCatalogoPscAcao();
}

async function alternarCriterioPscAcao(criterioId, ativo) {
  const id = Number(criterioId);
  if (!ativo && !confirm("Desativar este critério? Ele deixa de aparecer nas avaliações abertas daqui em diante (as já abertas mantêm o que têm).")) return;
  const data = await pscPostar("catalogo/criterio/atualizar", { criterioId: id, ativo: ativo === true });
  mostrarResultadoPsc(data, "pscResultadoCatalogo");
  if (data.sucesso !== false) carregarCatalogoPscAcao();
}

registrarAcoes({
  abrirAvaliacaoPscAcao, abrirFormReclassPscAcao, alternarCriterioPscAcao, arquivarReclassificacaoPscAcao, atualizarSugestoesPscAcao,
  carregarCatalogoPscAcao, carregarDetalhePscAcao, carregarHistoricoPscAcao, carregarPainelPscAcao, carregarReclassificacoesPscAcao,
  criarCriterioPscAcao, decretarReclassificacaoPscAcao, devolverAvaliacaoPscAcao, editarCriterioPscAcao, enviarAvaliacaoPscAcao,
  fecharFormReclassPscAcao, homologarAvaliacaoPscAcao, pscEditarTextoRespostaAcao, pscMarcarRespostaAcao, pscRecarregarDetalheAcao,
  reabrirAvaliacaoPscAcao, restabelecerReclassificacaoPscAcao, salvarParametrosPscAcao, salvarRespostasPscAcao, validarAvaliacaoPscAcao
});
