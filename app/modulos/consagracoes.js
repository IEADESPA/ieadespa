// app/modulos/consagracoes.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- SECRETARIA / ABA CONSAGRAÇÕES ----
// Os tipos de proposta ("Assunto") são um catálogo configurável (Catálogos ->
// Tipos de Proposta), não mais uma lista fixa no HTML — dá pra adicionar/
// renomear/excluir tipo sem mexer em código.
async function carregarTiposConsagracao() {
  ajustarModalidadeConsagracao();   // antes de tudo: a recusa ou a falha da lista de tipos não deixa as opções da sessão anterior
  limparRequisitosEscada();
  const select = document.getElementById("consagracaoAssunto");
  const res = await fetchProtegido(`${API_BASE}/catalogos/tiposConsagracao`);
  const tipos = await jsonDaTela(res, select, "objeto");
  if (tipos === null) return;
  select.innerHTML = tipos.filter(t => t.ativo !== false).map(t => `<option value="${escaparHtmlEbd(t.nome)}">${escaparHtmlEbd(t.nome)}</option>`).join("")
    + `<option value="__outro">Outro (digitar)</option>`;
  document.getElementById("consagracaoAssuntoOutro").style.display = "none";
  ajustarModalidadeConsagracao();
}

document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("consagracaoAssunto");
  if (select) select.addEventListener("change", () => {
    document.getElementById("consagracaoAssuntoOutro").style.display = select.value === "__outro" ? "block" : "none";
    limparRequisitosEscada();
  });
});

// ---- v8.2 — ESCADA MINISTERIAL (Regimento Art. 66 §§3º–5º, 67, 71 a 74) ----
// A "nomeação direta do Pastor Presidente" e o "ministro de outra convenção" só o nível geral registra (o servidor confere); fora dele as opções nem aparecem.
const ROTULO_CARGO_ESCADA = { MEMBRO: "Membro", AUXILIAR: "Auxiliar", MISSIONARIO: "Missionário(a)", DIACONO: "Diácono", PRESBITERO: "Presbítero", EVANGELISTA: "Evangelista", PASTOR: "Pastor" };
const ROTULO_MODALIDADE_ESCADA = { INDICACAO: "Indicação", NOMEACAO_PRESIDENCIAL: "Nomeação direta do Pastor Presidente", OUTRA_CONVENCAO: "Ministro de outra convenção" };
const SITUACAO_ESCADA = {
  ATENDE: { icone: "✔", texto: "atende" }, FALTA: { icone: "✖", texto: "falta" }, SEM_DADO: { icone: "✖", texto: "falta o dado" },
  AVISO: { icone: "⚠", texto: "aviso" }, DISPENSADO: { icone: "–", texto: "dispensado" }
};
let consagracaoOcupada = false;
let consagracoesCache = [];
const MSG_AGUARDE_CONSAGRACAO = "Aguarde: o pedido anterior ainda não voltou.";
const dataBrEscada = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(String(iso)) ? String(iso).slice(0, 10).split("-").reverse().join("/") : String(iso || ""));

// Troca de login ou saída: a lista de requisitos (que no nível geral diz quem está sob disciplina) e o formulário saem da página.
function consLimparTela() {
  limparRequisitosEscada();
  consagracaoOcupada = false;
  consagracoesCache = [];
  for (const id of ["consagracaoMatricula", "consagracaoProponente", "consagracaoAto"]) { const el = document.getElementById(id); if (el) el.value = ""; }
  const msg = document.getElementById("resultadoConsagracao");
  if (msg) msg.textContent = "";
  const lista = document.getElementById("resultadoListaConsagracoes");
  if (lista) lista.innerHTML = "";
  const modalidade = document.getElementById("consagracaoModalidade");
  if (modalidade) { modalidade.value = "INDICACAO"; ajustarModalidadeConsagracao(); }
  // v8.3 — a fila do CEI (sigilosa), os painéis e as cerimônias também saem da página
  consFilaCEI = [];
  consParecerAtual = null;
  consTaxaAtual = null;
  consCerimoniaAberta = null;
  for (const idEl of ["consListaCEI", "consListaCerimonias", "consCerimoniaDetalhe", "consRequisitosCEI"]) { const el = document.getElementById(idEl); if (el) el.innerHTML = ""; }
  for (const idEl of ["consResultadoCEI", "consResultadoEsteira", "consResultadoCerimonia", "consParecerFundamentacao", "consParecerExcecao"]) {
    const el = document.getElementById(idEl);
    if (el) { if ("value" in el && el.tagName !== "P") el.value = ""; else el.textContent = ""; }
  }
  for (const idEl of ["consFormParecer", "consPainelHomologar", "consPainelTaxa", "consCerimoniaDetalhe", "consBarraHomologar"]) { const el = document.getElementById(idEl); if (el) el.hidden = true; }
  // o formulário do parecer pela metade (nome, sabatina, escrutínio) e o ato da homologação também saem
  const titulo = document.getElementById("consParecerTitulo");
  if (titulo) titulo.textContent = "Parecer";
  for (const idEl of ["consSabVida", "consSabFinanceira", "consSabDoutrina", "consParecerHistorico", "consEscDocumental", "consEscEstavel"]) { const el = document.getElementById(idEl); if (el) el.checked = false; }
  for (const idEl of ["consEscFundamento", "consEscRecasado", "consHomAto", "consRequisitosEsteira"]) { const el = document.getElementById(idEl); if (el) { if (el.tagName === "DIV") el.innerHTML = ""; else el.value = ""; } }
  consPresencas = {};
  consPedidoCerimonia++;   // uma resposta de detalhe que ainda estava a caminho não pinta mais nada
}

function ajustarModalidadeConsagracao() {
  const select = document.getElementById("consagracaoModalidade");
  if (!select) return;
  for (const opcao of [...select.options].filter((o) => o.classList.contains("so-geral-escada"))) {
    if (geralPara("consagracoes")) opcao.removeAttribute("hidden"); else opcao.setAttribute("hidden", "");
    opcao.disabled = !geralPara("consagracoes");
  }
  if (!geralPara("consagracoes") && select.value !== "INDICACAO") select.value = "INDICACAO";
  const grupo = document.getElementById("grupoConsagracaoAto");
  const rotulo = document.getElementById("rotuloConsagracaoAto");
  grupo.style.display = select.value === "INDICACAO" ? "none" : "block";
  rotulo.textContent = select.value === "OUTRA_CONVENCAO" ? "Igreja ou convenção de origem:" : "Referência do ato da Presidência:";
}

function mudouModalidadeConsagracaoAcao() {
  ajustarModalidadeConsagracao();
  limparRequisitosEscada();
}

function limparRequisitosEscada() {
  const caixa = document.getElementById("consagracaoRequisitos");
  if (caixa) caixa.innerHTML = "";
}

// `quem`: o nome da pessoa, quando a lista vem de um processo da esteira (o formulário pode estar com outra matrícula).
function htmlRequisitosEscada(av, alvoRotulo, quem) {
  if (!av || !Array.isArray(av.itens)) return "";
  const destino = escaparHtmlEbd(alvoRotulo || av.alvoRotulo || ROTULO_CARGO_ESCADA[av.alvo] || av.alvo);
  const para = quem ? `${escaparHtmlEbd(quem)} → ${destino}` : `Para ${destino}`;
  const cabeca = av.bloqueado
    ? `${para}: <strong>ainda não pode seguir</strong>.`
    : `${para}: <strong>pode seguir</strong>${av.nivelamento ? " — fica em nivelamento obrigatório na AFM depois da posse (Art. 66 §5º)" : ""}.`;
  const linhas = av.itens.map((i) => {
    const sit = SITUACAO_ESCADA[i.situacao] || { icone: "?", texto: String(i.situacao || "") };
    return `<li class="escada-item escada-${escaparHtmlEbd(String(i.situacao || "").toLowerCase())}"><span aria-hidden="true">${escaparHtmlEbd(sit.icone)}</span>
      <strong>${escaparHtmlEbd(i.rotulo)}</strong> <small>(${escaparHtmlEbd(i.artigo)})</small> — ${escaparHtmlEbd(sit.texto)}${i.detalhe ? `: ${escaparHtmlEbd(i.detalhe)}` : ""}</li>`;
  }).join("");
  return `<div class="escada-requisitos"><p>${cabeca}</p><ul class="escada-lista">${linhas}</ul></div>`;
}

function mostrarRequisitosEscada(av, alvoRotulo, quem) {
  const caixa = document.getElementById("consagracaoRequisitos");
  if (!caixa) return;
  caixa.innerHTML = htmlRequisitosEscada(av, alvoRotulo, quem);
  // no celular a lista pode ficar fora da tela: leva a pessoa até ela
  if (quem) {
    if (typeof caixa.scrollIntoView === "function") caixa.scrollIntoView({ behavior: "smooth", block: "start" });
    if (typeof caixa.focus === "function") caixa.focus();
  }
}

function dadosDoFormularioConsagracao() {
  const selectAssunto = document.getElementById("consagracaoAssunto").value;
  return {
    membroId: document.getElementById("consagracaoMatricula").value,
    assunto: selectAssunto === "__outro" ? document.getElementById("consagracaoAssuntoOutro").value : selectAssunto,
    proponenteMembroId: document.getElementById("consagracaoProponente").value,
    modalidade: document.getElementById("consagracaoModalidade").value || "INDICACAO",
    atoReferencia: document.getElementById("consagracaoAto").value
  };
}

async function conferirRequisitosConsagracaoAcao() {
  const msg = document.getElementById("resultadoConsagracao");
  const f = dadosDoFormularioConsagracao();
  limparRequisitosEscada();
  if (!f.membroId || !f.assunto) {
    msg.textContent = "Informe a matrícula e o assunto para conferir os requisitos.";
    return;
  }
  if (consagracaoOcupada) { msg.textContent = MSG_AGUARDE_CONSAGRACAO; return; }
  consagracaoOcupada = true;
  try {
    const params = new URLSearchParams({ membroId: f.membroId, assunto: f.assunto, modalidade: f.modalidade });
    const res = await fetchProtegido(`${API_BASE}/escada/requisitos?${params.toString()}`);
    const data = await res.json();
    // a matrícula, o assunto ou a modalidade mudaram enquanto a resposta vinha: descarta
    const agora = dadosDoFormularioConsagracao();
    if (agora.membroId !== f.membroId || agora.assunto !== f.assunto || agora.modalidade !== f.modalidade) return;
    if (!data.sucesso) { msg.textContent = data.mensagem || "Não foi possível conferir."; return; }
    if (!data.alvo) { msg.textContent = data.mensagem || "Este tipo de consagração não muda o cargo."; return; }
    msg.textContent = "";
    mostrarRequisitosEscada(data.requisitos, data.alvoRotulo);
  } finally {
    consagracaoOcupada = false;
  }
}

// Trava de Revisão 4-A (v4.15.1): para origem CONGREGACAO a arrecadação
// líquida é calculada no backend a partir do fechamento mensal real da
// Tesouraria Local — o campo digitado só se aplica a DEPARTAMENTO/DISTRITO,
// que ainda não têm fechamento eletrônico próprio.
document.addEventListener("DOMContentLoaded", () => {
  const selectOrigem = document.getElementById("repasseOrigemTipo");
  const campoArrecadado = document.getElementById("repasseArrecadado");
  if (selectOrigem && campoArrecadado) {
    const grupoArrecadado = campoArrecadado.closest(".input-group") || campoArrecadado.parentElement;
    const atualizar = () => {
      const ehCongregacao = selectOrigem.value === "CONGREGACAO";
      if (grupoArrecadado) grupoArrecadado.style.display = ehCongregacao ? "none" : "";
      campoArrecadado.disabled = ehCongregacao;
    };
    selectOrigem.addEventListener("change", atualizar);
    atualizar();
  }
});

const ROTULO_STATUS_CONSAGRACAO = {
  PROTOCOLADO: "Protocolado",
  EM_ANALISE_CONSELHO: "Em análise no Conselho",
  AGUARDANDO_PLENARIO: "Aguardando Plenário",
  CONCLUIDO: "Concluído",
  REPROVADO: "Reprovado"
};
// v8.3 — o processo que leva a cargo tem etapas com dono (Regimento Art. 74 e 75)
const ROTULO_ETAPA_CARGO = {
  PROTOCOLADO: "Protocolado — documentos da indicação",
  EM_ANALISE_CONSELHO: "Em análise no CEI",
  AGUARDANDO_PLENARIO: "Aguardando homologação",
  HOMOLOGADO: "Homologado — aguardando a cerimônia"
};

async function salvarConsagracao() {
  const { membroId, assunto, proponenteMembroId, modalidade, atoReferencia } = dadosDoFormularioConsagracao();
  const msg = document.getElementById("resultadoConsagracao");

  if (!membroId || !assunto || !proponenteMembroId) {
    msg.textContent = "Informe matrícula, assunto e proponente.";
    return;
  }
  if (modalidade !== "INDICACAO" && !String(atoReferencia || "").trim()) {
    msg.textContent = modalidade === "OUTRA_CONVENCAO" ? "Informe a igreja ou convenção de origem." : "Informe a referência do ato da Presidência.";
    return;
  }
  if (consagracaoOcupada) { msg.textContent = MSG_AGUARDE_CONSAGRACAO; return; }
  consagracaoOcupada = true;
  limparRequisitosEscada();
  try {
    const corpo = { membroId, assunto, proponenteMembroId, modalidade };
    if (modalidade !== "INDICACAO") corpo.atoReferencia = atoReferencia;
    const res = await fetchProtegido(`${API_BASE}/consagracoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo)
    });
    const data = await res.json();
    msg.textContent = data.mensagem;
    if (data.requisitos && !data.sucesso) mostrarRequisitosEscada(data.requisitos);
    if (data.sucesso) {
      document.getElementById("consagracaoMatricula").value = "";
      document.getElementById("consagracaoProponente").value = "";
      document.getElementById("consagracaoAto").value = "";
      document.getElementById("consagracaoModalidade").value = "INDICACAO";
      ajustarModalidadeConsagracao();
      carregarConsagracoes();
    }
  } finally {
    consagracaoOcupada = false;
  }
}

async function carregarConsagracoes() {
  const container = document.getElementById("resultadoListaConsagracoes");
  const res = await fetchProtegido(`${API_BASE}/consagracoes`);
  const consagracoes = await jsonDaTela(res, container, "objeto");
  if (consagracoes === null) return;
  consagracoesCache = consagracoes;

  const barra = document.getElementById("consBarraHomologar");
  if (barra) barra.hidden = !(geralPara("consagracoes") && consagracoes.some((c) => c.cargoAlvo && c.status === "AGUARDANDO_PLENARIO"));
  if (consagracoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum processo em andamento.</p>";
    return;
  }

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Assunto</th><th>Destino</th><th>Proponente</th><th>Etapa</th><th>Protocolo</th><th></th>
  </tr></thead><tbody>`;

  consagracoes.forEach((c, i) => {
    const destino = c.cargoAlvo ? escaparHtmlEbd(ROTULO_CARGO_ESCADA[c.cargoAlvo] || c.cargoAlvo) : "-";
    const modalidade = c.modalidade && c.modalidade !== "INDICACAO"
      ? `<br><small>${escaparHtmlEbd(ROTULO_MODALIDADE_ESCADA[c.modalidade] || c.modalidade)}${c.atoReferencia ? `: ${escaparHtmlEbd(c.atoReferencia)}` : ""}</small>` : "";
    html += `<tr>
      <td>${escaparHtmlEbd(c.nome)}</td>
      <td>${escaparHtmlEbd(c.assunto)}</td>
      <td>${destino}${modalidade}</td>
      <td>${escaparHtmlEbd(c.proponente) || "-"}</td>
      <td>${consStatusTexto(c)}</td>
      <td>${escaparHtmlEbd(dataBrEscada(c.dataProtocolo))}</td>
      <td class="acoes-inline">${consAcoes(c, i)}</td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

// ---- v8.3 — CONSAGRAÇÃO E DOCUMENTAÇÃO (Regimento Art. 7º, III; 9º; 10; 67; 73; 74 e 75) ----
// Documentos da indicação → parecer do CEI → homologação (Presidente ou CLI) → taxa → cerimônia (presença) → diploma. O servidor confere tudo (EsteiraConsagracao,
// CerimoniasConsagracao); a tela só mostra o que cada um pode fazer.
const ROTULO_OCASIAO_CERIMONIA = { AGO: "Assembleia Geral Ordinária", MAGNA_CLI: "Sessão Magna da CLI", SOLENE_CLI: "Sessão Solene da CLI" };
const ROTULO_STATUS_CERIMONIA = { PLANEJADA: "Planejada", REALIZADA: "Realizada", CANCELADA: "Cancelada" };
let consFilaCEI = [];
let consParecerAtual = null;
let consTaxaAtual = null;
let consCerimoniaAberta = null;
const moedaCons = (v) => Number(v || 0).toFixed(2).replace(".", ",");
// hoje no fuso de Brasília (UTC-3), para os campos de data
const hojeCons = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const consEl = (idEl) => document.getElementById(idEl);

// Entrada da aba: quem só tem o CEI vê só os pareceres; a Secretaria vê a esteira; as cerimônias são do nível geral.
function consAbrirAba() {
  const temConsagracoes = Array.isArray(authPermissoes) && authPermissoes.includes("consagracoes");
  consEl("consSecaoSecretaria").hidden = !temConsagracoes;
  consEl("consSecaoCEI").hidden = !geralPara("cei");
  consEl("consSecaoCerimonias").hidden = !geralPara("consagracoes");
  if (temConsagracoes) { carregarTiposConsagracao(); carregarConsagracoes(); carregarTurmasBatismo(); carregarCandidatosBatismo(); }
  if (geralPara("cei")) consCarregarFilaCEI();
  if (geralPara("consagracoes")) { consCarregarCerimonias(); consCarregarReunioesCLI(); }
  const aviso = consEl("consAvisoSemSecao");
  if (aviso) aviso.hidden = temConsagracoes || geralPara("cei");
}

function consStatusTexto(c) {
  if (c.vetoAFMEm) return `Vetado pela AFM em ${escaparHtmlEbd(dataBrEscada(c.vetoAFMEm))}<br><small>${escaparHtmlEbd(c.vetoAFMMotivo)}</small>`;
  if (c.status === "REPROVADO" && c.motivoEncerramento === "INAPTO_CEI") return `INAPTO pelo CEI${c.dataConclusao ? ` em ${escaparHtmlEbd(dataBrEscada(c.dataConclusao))}` : ""}<br><small>Processo arquivado (Art. 9º §2º)</small>`;
  if (c.status === "REPROVADO" && c.motivoEncerramento === "AUSENCIA_CERIMONIA") return `Ausente na cerimônia de ${escaparHtmlEbd(dataBrEscada(c.dataConclusao))}<br><small>Perde a consagração neste ano; novo processo no ano que vem (Art. 75, II, b)</small>`;
  if (c.status === "CONCLUIDO") return `${c.cargoAlvo ? "Consagrado(a)" : "Concluído"}${c.dataConclusao ? ` em ${escaparHtmlEbd(dataBrEscada(c.dataConclusao))}` : ""}`;
  if (c.status === "REPROVADO") return `Reprovado${c.dataConclusao ? ` em ${escaparHtmlEbd(dataBrEscada(c.dataConclusao))}` : ""}`;
  if (!c.cargoAlvo) return escaparHtmlEbd(ROTULO_STATUS_CONSAGRACAO[c.status] || c.status);
  const partes = [];
  if (c.status === "PROTOCOLADO") partes.push(`${c.temFoto ? "✔" : "✖"} foto · ${c.documentos ? "✔" : "✖"} ${Number(c.documentos) || 0} documento(s)`);
  if (c.parecerCEI) partes.push(`CEI: ${c.parecerCEI}${c.parecerEm ? ` em ${dataBrEscada(c.parecerEm)}` : ""}`);
  if (c.status === "AGUARDANDO_PLENARIO") partes.push(c.homologacaoPelaCLI ? "homologa: a CLI em plenário" : "homologa: o Pastor Presidente");
  if (c.homologadoEm) partes.push(`homologado em ${dataBrEscada(c.homologadoEm)}`);
  if (["AGUARDANDO_PLENARIO", "HOMOLOGADO"].includes(c.status)) {
    partes.push(c.taxaPagaEm ? `taxa R$ ${moedaCons(c.taxaValor)} em ${dataBrEscada(c.taxaPagaEm)}${c.cerimoniaId && c.taxaEmDia === false ? " (fora do prazo ou abaixo do valor da cerimônia)" : ""}` : "taxa pendente");
  }
  if (c.status === "HOMOLOGADO" && c.cerimoniaData) partes.push(`cerimônia de ${dataBrEscada(c.cerimoniaData)}`);
  return `${escaparHtmlEbd(ROTULO_ETAPA_CARGO[c.status] || c.status)}${partes.length ? `<br><small>${partes.map((x) => escaparHtmlEbd(x)).join(" · ")}</small>` : ""}`;
}

function consAcoes(c, indice) {
  const id = String(c.consagracaoId ?? "");
  const andamento = !["CONCLUIDO", "REPROVADO"].includes(c.status);
  const b = [];
  if (c.cargoAlvo && c.numero && andamento) b.push(`<button class="btn-link" data-on-click="consDocumentosAcao" data-args-click="${argsAttr(Number(c.numero), String(c.nome ?? ""))}">📄 Documentos</button>`);
  if (c.status === "CONCLUIDO" && c.diplomaCertificadoId) b.push(`<button class="btn-link" data-on-click="baixarPdfCertificado" data-args-click="${argsAttr(Number(c.diplomaCertificadoId))}">📄 Diploma</button>`);
  if (geralPara("consagracoes") && andamento && !c.vetoAFMEm) {
    if (!c.cargoAlvo) b.push(`<button class="btn-link" data-on-click="avancarConsagracaoAcao" data-args-click="${argsAttr(id)}">Avançar</button>`);
    else if (c.status === "PROTOCOLADO") b.push(`<button class="btn-link" data-on-click="avancarConsagracaoAcao" data-args-click="${argsAttr(id)}">Enviar ao CEI</button>`);
    if (c.cargoAlvo && c.status === "AGUARDANDO_PLENARIO") {
      b.push(`<label class="rotulo-inline"><input type="checkbox" id="consMarcar_${Number(indice)}" aria-label="Homologar: ${escaparHtmlEbd(c.nome)}" /> homologar</label>`);
    }
    if (c.cargoAlvo && ["AGUARDANDO_PLENARIO", "HOMOLOGADO"].includes(c.status)) b.push(`<button class="btn-link" data-on-click="consTaxaAcao" data-args-click="${argsAttr(id)}">Taxa…</button>`);
    b.push(`<button class="btn-link btn-link-perigo" data-on-click="reprovarConsagracaoAcao" data-args-click="${argsAttr(id)}">Reprovar</button>`);
  }
  return b.length ? b.join(" ") : "-";
}

function consDocumentosAcao(numero, nome) {
  abrirModalAnexos("Consagracoes", Number(numero), `Documentos da indicação — ${nome}`);
}

function consFecharPaineisAcao() {
  for (const idEl of ["consPainelHomologar", "consPainelTaxa"]) { const el = consEl(idEl); if (el) el.hidden = true; }
  consTaxaAtual = null;
}

// ---- homologação (Art. 74, IV; Art. 7º, III) ----
function consMarcadosHomologar() {
  return consagracoesCache.filter((c, i) => { const el = consEl(`consMarcar_${i}`); return !!(el && el.checked); }).map((c) => String(c.consagracaoId));
}

async function consCarregarReunioesCLI() {
  const select = consEl("consHomSessao");
  if (!select) return;
  const token = authToken;
  const res = await fetchProtegido(`${API_BASE}/esteira-consagracao/reunioes-cli`);
  const data = await res.json().catch(() => null);
  if (!data || !data.sucesso || authToken !== token) return;
  const escolhida = select.value;
  select.innerHTML = `<option value="">— nenhuma —</option>` + data.itens.map((s) =>
    `<option value="${escaparHtmlEbd(String(s.sessaoId))}">${escaparHtmlEbd(dataBrEscada(s.data))}${s.descricao ? ` — ${escaparHtmlEbd(s.descricao)}` : ""}</option>`).join("");
  if (escolhida && data.itens.some((s) => String(s.sessaoId) === escolhida)) select.value = escolhida;
}

function consAbrirHomologarAcao() {
  const msg = consEl("consResultadoEsteira");
  const ids = consMarcadosHomologar();
  if (!ids.length) { msg.textContent = "Marque na lista (\"homologar\") os processos que vão ser homologados."; return; }
  consFecharPaineisAcao();
  if (!consEl("consHomData").value) consEl("consHomData").value = hojeCons();
  consEl("consPainelHomologar").hidden = false;
  consCarregarReunioesCLI();   // uma reunião encerrada depois que a aba abriu também aparece
  msg.textContent = `${ids.length} processo(s) marcado(s) para homologar.`;
  if (typeof consEl("consHomAto").focus === "function") consEl("consHomAto").focus();
}

async function consHomologarAcao() {
  const msg = consEl("consResultadoEsteira");
  const ids = consMarcadosHomologar();
  if (!ids.length) { msg.textContent = "Nenhum processo marcado."; return; }
  const ato = consEl("consHomAto").value.trim();
  const sessaoId = consEl("consHomSessao").value;
  if (!ato && !sessaoId) { msg.textContent = "Informe o ato do Pastor Presidente ou escolha a reunião da CLI."; return; }
  if (consagracaoOcupada) { msg.textContent = MSG_AGUARDE_CONSAGRACAO; return; }
  consagracaoOcupada = true;
  try {
    const corpo = { ids };
    if (ato) { corpo.ato = ato; corpo.data = consEl("consHomData").value; }
    if (sessaoId) corpo.sessaoId = Number(sessaoId);
    const res = await fetchProtegido(`${API_BASE}/esteira-consagracao/homologar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const data = await res.json();
    const falhas = (data.resultados || []).filter((x) => !x.sucesso);
    msg.textContent = `${data.mensagem || ""}${falhas.length ? " " + falhas.map((x) => `${x.nome || "Processo"}: ${x.mensagem}`).join(" | ") : ""}`;
    consEl("consRequisitosEsteira").innerHTML = falhas.filter((x) => x.requisitos).map((x) => htmlRequisitosEscada(x.requisitos, null, x.nome || "Processo")).join("");
    if (data.sucesso) { consEl("consPainelHomologar").hidden = true; consEl("consHomAto").value = ""; carregarConsagracoes(); }
  } finally {
    consagracaoOcupada = false;
  }
}

// ---- taxa (Art. 75, I) ----
function consTaxaAcao(id) {
  const c = consagracoesCache.find((x) => String(x.consagracaoId) === String(id));
  if (!c) return;
  consFecharPaineisAcao();
  consTaxaAtual = c;
  consEl("consTaxaTitulo").textContent = `Taxa de consagração — ${c.nome}`;
  consEl("consTaxaData").value = c.taxaPagaEm ? String(c.taxaPagaEm).slice(0, 10) : hojeCons();
  consEl("consTaxaValor").value = String(c.taxaValor || c.cerimoniaValorTaxa || 70);
  consEl("consTaxaForma").value = c.taxaForma || "PIX";
  consEl("consTaxaRemover").hidden = !c.taxaPagaEm;
  consEl("consPainelTaxa").hidden = false;
  if (typeof consEl("consTaxaData").focus === "function") consEl("consTaxaData").focus();
}

async function consEnviarTaxa(corpo) {
  const msg = consEl("consResultadoEsteira");
  if (consagracaoOcupada) { msg.textContent = MSG_AGUARDE_CONSAGRACAO; return; }
  consagracaoOcupada = true;
  try {
    const res = await fetchProtegido(`${API_BASE}/esteira-consagracao/taxa`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const data = await res.json();
    msg.textContent = data.mensagem || "";
    if (data.sucesso) { consFecharPaineisAcao(); carregarConsagracoes(); }
  } finally {
    consagracaoOcupada = false;
  }
}

async function consRegistrarTaxaAcao() {
  if (!consTaxaAtual) return;
  const valor = Number(String(consEl("consTaxaValor").value).replace(",", "."));
  if (!consEl("consTaxaData").value || !(valor > 0)) { consEl("consResultadoEsteira").textContent = "Informe a data e o valor pago."; return; }
  await consEnviarTaxa({ consagracaoId: String(consTaxaAtual.consagracaoId), pagoEm: consEl("consTaxaData").value, valor, forma: consEl("consTaxaForma").value });
}

async function consRemoverTaxaAcao() {
  if (!consTaxaAtual) return;
  const alvo = consTaxaAtual;
  if (!(await confirmarAcao(`Remover o registro da taxa de ${alvo.nome}? (Use quando foi lançado errado.)`, "Remover"))) return;
  await consEnviarTaxa({ consagracaoId: String(alvo.consagracaoId), remover: true });
}

// ---- CEI (Art. 74, III; 9º; 73) ----
async function consCarregarFilaCEI() {
  const token = authToken;
  const container = consEl("consListaCEI");
  const res = await fetchProtegido(`${API_BASE}/esteira-consagracao/cei`);
  if (authToken !== token) return;   // trocou de sessão enquanto a fila (sigilosa) vinha: descarta
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null || authToken !== token) return;
  consFilaCEI = data.itens || [];
  if (!consFilaCEI.length) { container.innerHTML = "<p class='subtitle'>Nenhum processo esperando o parecer do CEI.</p>"; return; }
  container.innerHTML = `<table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Destino</th><th>Protocolo</th><th>O que o parecer pede</th><th></th></tr></thead><tbody>`
    + consFilaCEI.map((p) => {
      const pede = [p.sabatina ? "sabatina do Art. 9º" : null, p.escrutinio ? "escrutínio especial (divorciado)" : null, p.excecaoPastor ? "Pastor não casado: motivo da exceção" : null].filter(Boolean);
      return `<tr>
        <td>${escaparHtmlEbd(p.nome)}${p.congregacao ? `<br><small>${escaparHtmlEbd(p.congregacao)}</small>` : ""}</td>
        <td>${escaparHtmlEbd(p.cargoAlvoRotulo || p.cargoAlvo)}${p.modalidade && p.modalidade !== "INDICACAO" ? `<br><small>${escaparHtmlEbd(ROTULO_MODALIDADE_ESCADA[p.modalidade] || p.modalidade)}</small>` : ""}</td>
        <td>${escaparHtmlEbd(dataBrEscada(p.dataProtocolo))}</td>
        <td>${pede.length ? escaparHtmlEbd(pede.join("; ")) : "-"}</td>
        <td class="acoes-inline">
          <button class="btn-link" data-on-click="consDocumentosAcao" data-args-click="${argsAttr(Number(p.numero), String(p.nome ?? ""))}">📄 Documentos (${Number(p.documentos) || 0})</button>
          <button class="btn-link" data-on-click="consDarParecerAcao" data-args-click="${argsAttr(String(p.consagracaoId ?? ""))}">Dar parecer</button>
        </td>
      </tr>`;
    }).join("") + "</tbody></table>";
}

function consDarParecerAcao(id) {
  const p = consFilaCEI.find((x) => String(x.consagracaoId) === String(id));
  if (!p) return;
  consParecerAtual = p;
  consEl("consParecerTitulo").textContent = `Parecer — ${p.nome} → ${p.cargoAlvoRotulo || p.cargoAlvo}`;
  consEl("consParecerResultado").value = "APTO";
  consEl("consParecerData").value = hojeCons();
  consEl("consParecerFundamentacao").value = "";
  for (const idEl of ["consSabVida", "consSabFinanceira", "consSabDoutrina", "consParecerHistorico", "consEscDocumental", "consEscEstavel"]) consEl(idEl).checked = false;
  consEl("consEscFundamento").value = "";
  consEl("consEscRecasado").value = "";
  consEl("consParecerExcecao").value = "";
  consEl("consParecerSabatina").hidden = !p.sabatina;
  consEl("consParecerHistoricoGrupo").hidden = !!p.escrutinio;   // divorciado no cadastro: o escrutínio já é obrigatório
  consEl("consParecerExcecaoGrupo").hidden = !p.excecaoPastor;
  consMostrarEscrutinioAcao();
  consEl("consRequisitosCEI").innerHTML = "";
  consEl("consFormParecer").hidden = false;
  if (typeof consEl("consParecerFundamentacao").focus === "function") consEl("consParecerFundamentacao").focus();
}

function consMostrarEscrutinioAcao() {
  consEl("consParecerEscrutinio").hidden = !(consParecerAtual && (consParecerAtual.escrutinio || consEl("consParecerHistorico").checked));
}

function consFecharParecerAcao() {
  consParecerAtual = null;
  consEl("consFormParecer").hidden = true;
}

async function consEnviarParecerAcao() {
  const msg = consEl("consResultadoCEI");
  const p = consParecerAtual;
  if (!p) return;
  const resultado = consEl("consParecerResultado").value;
  const corpo = { consagracaoId: String(p.consagracaoId), resultado, sabatinaEm: consEl("consParecerData").value, fundamentacao: consEl("consParecerFundamentacao").value };
  if (!consEl("consParecerSabatina").hidden) {
    corpo.sabatina = { vidaPregressa: consEl("consSabVida").checked, regularidadeFinanceira: consEl("consSabFinanceira").checked, alinhamentoDoutrinario: consEl("consSabDoutrina").checked };
  }
  if (!consEl("consParecerEscrutinio").hidden) {
    const recasado = consEl("consEscRecasado").value;
    corpo.escrutinio = {
      historico: consEl("consParecerHistorico").checked, fundamento: consEl("consEscFundamento").value || undefined, documental: consEl("consEscDocumental").checked,
      recasado: recasado === "sim" ? true : recasado === "nao" ? false : undefined, casamentoEstavel: consEl("consEscEstavel").checked
    };
  }
  if (!consEl("consParecerExcecaoGrupo").hidden && consEl("consParecerExcecao").value.trim()) corpo.excecaoPastorNaoCasado = consEl("consParecerExcecao").value;
  if (resultado === "INAPTO" && !(await confirmarAcao(`Parecer INAPTO para ${p.nome}: o processo é arquivado (Art. 9º §2º). Confirma?`, "INAPTO"))) return;
  if (consagracaoOcupada) { msg.textContent = MSG_AGUARDE_CONSAGRACAO; return; }
  consagracaoOcupada = true;
  try {
    const res = await fetchProtegido(`${API_BASE}/esteira-consagracao/parecer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const data = await res.json();
    msg.textContent = data.mensagem || "";
    consEl("consRequisitosCEI").innerHTML = data.requisitos ? htmlRequisitosEscada(data.requisitos, null, p.nome) : "";
    if (data.sucesso) {
      consFecharParecerAcao();
      consCarregarFilaCEI();
      if (Array.isArray(authPermissoes) && authPermissoes.includes("consagracoes")) carregarConsagracoes();
    }
  } finally {
    consagracaoOcupada = false;
  }
}

// ---- cerimônias (Art. 10 e 75) ----
// Revisão independente da tela (28/10/2026): toda resposta que chega depois de uma troca de sessão é descartada (authToken); o detalhe só pinta a resposta do último
// pedido (consPedidoCerimonia); cada ato leva a cerimônia que estava na tela no clique; a presença marcada sobrevive ao redesenho (consPresencas).
let consPedidoCerimonia = 0;
let consPresencas = {};   // consagracaoId -> marcado? (da cerimônia aberta)

async function consCarregarCerimonias() {
  const token = authToken;
  const container = consEl("consListaCerimonias");
  const res = await fetchProtegido(`${API_BASE}/cerimonias-consagracao`);
  if (authToken !== token) return;
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null || authToken !== token) return;
  const itens = data.itens || [];
  if (!itens.length) { container.innerHTML = "<p class='subtitle'>Nenhuma cerimônia criada ainda.</p>"; return; }
  container.innerHTML = `<table class="tabela-frequencia"><thead><tr><th>Data</th><th>Ocasião</th><th>Local</th><th>Situação</th><th>Candidatos</th><th>Comissão</th><th></th></tr></thead><tbody>`
    + itens.map((c) => `<tr>
      <td>${escaparHtmlEbd(dataBrEscada(c.dataCerimonia))}</td>
      <td>${escaparHtmlEbd(ROTULO_OCASIAO_CERIMONIA[c.ocasiao] || c.ocasiao)}</td>
      <td>${escaparHtmlEbd(c.local)}</td>
      <td>${escaparHtmlEbd(ROTULO_STATUS_CERIMONIA[c.status] || c.status)}</td>
      <td>${escaparHtmlEbd(c.status === "REALIZADA" ? `${c.consagrados} consagrado(s)` : String(c.candidatos))}</td>
      <td>${escaparHtmlEbd(String(c.comissao))}</td>
      <td><button class="btn-link" data-on-click="consAbrirCerimoniaAcao" data-args-click="${argsAttr(Number(c.cerimoniaId))}">Abrir</button></td>
    </tr>`).join("") + "</tbody></table>";
}

async function consCriarCerimoniaAcao() {
  const msg = consEl("consResultadoCerimonia");
  const campoValor = consEl("consCerValor");
  const corpo = { dataCerimonia: consEl("consCerData").value, local: consEl("consCerLocal").value, ocasiao: consEl("consCerOcasiao").value };
  if (!corpo.dataCerimonia || !corpo.local.trim()) { msg.textContent = "Informe a data e o local da cerimônia."; return; }
  // o navegador recusou o número digitado (ex.: "70,5" em alguns): o campo fica vazio — não deixa virar R$ 70,00 calado
  if (campoValor.validity && campoValor.validity.badInput) { msg.textContent = "O valor da taxa não foi entendido: use números, com ponto ou vírgula (ex.: 70,00)."; return; }
  if (campoValor.value) corpo.valorTaxa = Number(String(campoValor.value).replace(",", "."));
  if (consagracaoOcupada) { msg.textContent = MSG_AGUARDE_CONSAGRACAO; return; }
  consagracaoOcupada = true;
  let data;
  try {
    const res = await fetchProtegido(`${API_BASE}/cerimonias-consagracao/criar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    data = await res.json();
    msg.textContent = data.mensagem || "";
    if (data.sucesso) { consEl("consCerLocal").value = ""; campoValor.value = ""; }
  } finally {
    consagracaoOcupada = false;
  }
  if (data && data.sucesso) { consCarregarCerimonias(); await consAbrirCerimoniaAcao(data.cerimoniaId); }
}

// Antes de redesenhar a MESMA cerimônia, guarda a presença que está marcada na tela.
function consGuardarPresencas() {
  const d = consCerimoniaAberta;
  if (!d || !d.candidatos) return;
  d.candidatos.forEach((p, i) => { const el = consEl(`consPresente_${i}`); if (el && !el.disabled) consPresencas[String(p.consagracaoId)] = !!el.checked; });
}

async function consAbrirCerimoniaAcao(cerimoniaId) {
  const token = authToken;
  const pedido = ++consPedidoCerimonia;
  const caixa = consEl("consCerimoniaDetalhe");
  const res = await fetchProtegido(`${API_BASE}/cerimonias-consagracao/detalhe?cerimoniaId=${encodeURIComponent(String(cerimoniaId))}`);
  if (authToken !== token || pedido !== consPedidoCerimonia) return;   // outra sessão, ou outra cerimônia aberta depois
  const data = await jsonDaTela(res, caixa, "objeto");
  if (authToken !== token || pedido !== consPedidoCerimonia) return;
  caixa.hidden = false;
  if (data === null) return;
  const mesma = consCerimoniaAberta && consCerimoniaAberta.cerimonia && data.cerimonia && consCerimoniaAberta.cerimonia.cerimoniaId === data.cerimonia.cerimoniaId;
  if (mesma) consGuardarPresencas(); else consPresencas = {};
  consCerimoniaAberta = data;
  caixa.innerHTML = consHtmlCerimonia(data);
  if (!mesma) {
    if (typeof caixa.scrollIntoView === "function") caixa.scrollIntoView({ behavior: "smooth", block: "start" });
    if (typeof caixa.focus === "function") caixa.focus();
  }
}

function consHtmlCerimonia(d) {
  const ce = d.cerimonia;
  const cab = `<h4>Cerimônia de ${escaparHtmlEbd(dataBrEscada(ce.dataCerimonia))} — ${escaparHtmlEbd(ROTULO_OCASIAO_CERIMONIA[ce.ocasiao] || ce.ocasiao)}</h4>
    <p class="subtitle">${escaparHtmlEbd(ce.local)} · ${escaparHtmlEbd(ROTULO_STATUS_CERIMONIA[ce.status] || ce.status)} · taxa R$ ${escaparHtmlEbd(moedaCons(ce.valorTaxa))}, paga até ${escaparHtmlEbd(dataBrEscada(ce.prazoTaxa))}</p>`;
  const resultadoDetalhe = `<p id="consResultadoDetalhe" role="status" aria-live="polite"></p>`;
  const comissaoNomes = (d.comissao || []).map((p) => escaparHtmlEbd(p.nome)).join(", ") || "ninguém ainda";
  if (ce.status === "CANCELADA") return `${cab}<p>Cancelada${ce.motivoCancelamento ? `: ${escaparHtmlEbd(ce.motivoCancelamento)}` : ""}.</p>${resultadoDetalhe}`;
  if (ce.status === "REALIZADA") {
    const linhas = (d.resultado || []).map((p) => `<tr>
      <td>${escaparHtmlEbd(p.nome)}</td><td>${escaparHtmlEbd(p.cargoAlvoRotulo || p.cargoAlvo || "-")}</td>
      <td>${p.presente ? "✔ presente" : "✖ ausente"}</td>
      <td>${p.status === "CONCLUIDO" ? "Consagrado(a)" : p.motivoEncerramento === "AUSENCIA_CERIMONIA" ? "Perdeu a consagração neste ano" : escaparHtmlEbd(p.status)}</td>
      <td>${p.diplomaCertificadoId ? `<button class="btn-link" data-on-click="baixarPdfCertificado" data-args-click="${argsAttr(Number(p.diplomaCertificadoId))}">📄 Diploma</button>` : "-"}</td>
    </tr>`).join("");
    return `${cab}<p><strong>Comissão de Unção:</strong> ${comissaoNomes}</p>
      <table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Destino</th><th>Presença</th><th>Resultado</th><th></th></tr></thead><tbody>${linhas || "<tr><td colspan='5'>-</td></tr>"}</tbody></table>
      ${resultadoDetalhe}`;
  }
  const v = d.comissaoValida || { valida: false, validos: 0, problemas: [] };
  const situacaoComissao = v.valida ? `✔ completa (${Number(v.validos)} pastores)` : `✖ ${v.problemas && v.problemas.length ? escaparHtmlEbd(v.problemas.join("; ")) : `faltam ${Math.max(0, 4 - Number(v.validos || 0))} para o mínimo de 4`}`;
  const candidatos = (d.candidatos || []).map((p, i) => {
    const emDia = !!(p.taxa && p.taxa.emDia);
    const marcado = emDia && (Object.prototype.hasOwnProperty.call(consPresencas, String(p.consagracaoId)) ? consPresencas[String(p.consagracaoId)] : true);
    return `<tr>
      <td><label class="rotulo-inline"><input type="checkbox" id="consPresente_${i}" aria-label="Presente: ${escaparHtmlEbd(p.nome)}" ${marcado ? "checked" : ""} ${emDia ? "" : "disabled"} /> presente</label></td>
      <td>${escaparHtmlEbd(p.nome)}</td>
      <td>${escaparHtmlEbd(p.cargoAlvoRotulo || p.cargoAlvo)}${p.modalidade === "OUTRA_CONVENCAO" ? "<br><small>diplomação (Art. 10)</small>" : ""}</td>
      <td>${emDia ? `✔ R$ ${escaparHtmlEbd(moedaCons(p.taxaValor))}` : `<span class="cons-pendente">✖ ${escaparHtmlEbd((p.taxa && p.taxa.motivo) || "taxa pendente")}</span>`}</td>
      <td><button class="btn-link btn-link-perigo" data-on-click="consRetirarCandidatoAcao" data-args-click="${argsAttr(String(p.consagracaoId ?? ""), String(p.nome ?? ""))}">Retirar</button></td>
    </tr>`;
  }).join("");
  const r = d.roteiro || { posicoes: [], insignias: [], pendentes: [] };
  const roteiro = (r.posicoes || []).map((pos) => `<li>${pos.pessoas.map((x) => `${escaparHtmlEbd(x.nome)} (${escaparHtmlEbd(x.cargoRotulo)}${x.ato === "DIPLOMACAO" ? ", diplomação" : ""})`).join(" e ")}${pos.casal ? " — casal, lado a lado (Art. 75, III, b)" : ""}</li>`).join("");
  const insignias = (r.insignias || []).map((x) => `${escaparHtmlEbd(x.rotulo)}: ${Number(x.quantidade)}`).join(" · ");
  const disponiveis = (d.disponiveis || []).map((p, i) => `<li><label><input type="checkbox" id="consIncluir_${i}" /> ${escaparHtmlEbd(p.nome)} → ${escaparHtmlEbd(p.cargoAlvoRotulo || "")}${p.taxa && !p.taxa.emDia ? ` <small class="cons-pendente">(${escaparHtmlEbd(p.taxa.motivo)})</small>` : ""}</label></li>`).join("");
  return `${cab}
    <details><summary>Alterar data, local, ocasião ou valor</summary>
      <div class="barra-lista">
        <label for="consEdData" class="rotulo-oculto">Data</label><input type="date" id="consEdData" value="${escaparHtmlEbd(ce.dataCerimonia)}" />
        <label for="consEdLocal" class="rotulo-oculto">Local</label><input type="text" id="consEdLocal" maxlength="200" value="${escaparHtmlEbd(ce.local)}" />
        <label for="consEdOcasiao" class="rotulo-oculto">Ocasião</label><select id="consEdOcasiao">${Object.entries(ROTULO_OCASIAO_CERIMONIA).map(([k, t]) => `<option value="${k}"${k === ce.ocasiao ? " selected" : ""}>${escaparHtmlEbd(t)}</option>`).join("")}</select>
        <label for="consEdValor" class="rotulo-oculto">Valor da taxa</label><input type="number" id="consEdValor" min="0.01" step="0.01" value="${escaparHtmlEbd(String(ce.valorTaxa))}" />
        <button class="btn-confirmar" style="width:auto;margin:0;" type="button" data-on-click="consEditarCerimoniaAcao">Salvar alterações</button>
      </div>
    </details>
    <p><strong>Comissão de Unção</strong> (no mínimo 4 pastores titulares em atividade — Art. 75, IV, c): ${situacaoComissao}<br><small>${comissaoNomes}</small></p>
    <div class="barra-lista">
      <label for="consCerComissao">Matrículas dos pastores (separadas por vírgula):</label>
      <input type="text" id="consCerComissao" value="${escaparHtmlEbd((d.comissao || []).map((p) => p.membroId).join(", "))}" />
      <button class="btn-confirmar" style="width:auto;margin:0;" type="button" data-on-click="consSalvarComissaoAcao">Salvar comissão</button>
    </div>
    <h4>Candidatos</h4>
    ${candidatos ? `<table class="tabela-frequencia"><thead><tr><th>Presença</th><th>Nome</th><th>Destino</th><th>Taxa</th><th></th></tr></thead><tbody>${candidatos}</tbody></table>` : "<p class='subtitle'>Nenhum candidato ainda.</p>"}
    <h4>Roteiro</h4>
    ${roteiro ? `<ol class="cons-roteiro">${roteiro}</ol>` : "<p class='subtitle'>Ninguém com a taxa em dia ainda.</p>"}
    <p><small>Insígnias: ${insignias || "-"}${(r.pendentes || []).length ? ` · Com a taxa pendente (fora da cerimônia): ${(r.pendentes || []).map((x) => escaparHtmlEbd(x.nome)).join(", ")}` : ""}</small></p>
    <div class="barra-lista">
      <button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" type="button" data-on-click="consBaixarDiplomasAcao">📄 Diplomas para imprimir (PDF)</button>
      <button class="btn-confirmar" style="width:auto;margin:0;" type="button" data-on-click="consRegistrarCerimoniaAcao">✅ Registrar a cerimônia (presença)</button>
      <button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" type="button" data-on-click="consCancelarCerimoniaAcao">Cancelar a cerimônia</button>
    </div>
    <h4>Homologados que podem entrar</h4>
    ${disponiveis ? `<ul class="cons-roteiro">${disponiveis}</ul><button class="btn-confirmar btn-secundario" style="width:auto;" type="button" data-on-click="consIncluirCandidatosAcao">Incluir os marcados</button>` : "<p class='subtitle'>Nenhum processo homologado esperando cerimônia.</p>"}
    ${resultadoDetalhe}`;
}

// A cerimônia que está na tela agora (lida no clique, antes de qualquer pergunta: uma resposta atrasada de outra cerimônia não troca o alvo).
const consCerimoniaDaTela = () => (consCerimoniaAberta && consCerimoniaAberta.cerimonia ? consCerimoniaAberta.cerimonia.cerimoniaId : null);
const consMsgDetalhe = (texto) => { const el = consEl("consResultadoDetalhe") || consEl("consResultadoCerimonia"); if (el) el.textContent = texto; };

// Os atos sobre a cerimônia `cerimoniaId`: o servidor responde e a tela relê o detalhe e a lista; a mensagem vem depois do redesenho.
async function consAtoCerimonia(cerimoniaId, acao, corpoExtra) {
  if (!cerimoniaId) return null;
  const token = authToken;
  if (consagracaoOcupada) { consMsgDetalhe(MSG_AGUARDE_CONSAGRACAO); return null; }
  consagracaoOcupada = true;
  let data;
  try {
    const res = await fetchProtegido(`${API_BASE}/cerimonias-consagracao/${acao}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cerimoniaId, ...corpoExtra }) });
    data = await res.json();
  } finally {
    consagracaoOcupada = false;
  }
  if (authToken !== token) return null;
  if (data.sucesso || data.resultados) { await consAbrirCerimoniaAcao(cerimoniaId); consCarregarCerimonias(); }
  consMsgDetalhe(data.mensagem || "");
  return data;
}

async function consSalvarComissaoAcao() {
  const cerimoniaId = consCerimoniaDaTela();
  consGuardarPresencas();
  const ids = String(consEl("consCerComissao").value || "").split(/[^0-9]+/).filter(Boolean).map(Number);
  if (!ids.length) { consMsgDetalhe("Informe as matrículas dos pastores."); return; }
  await consAtoCerimonia(cerimoniaId, "comissao", { membroIds: ids });
}

async function consEditarCerimoniaAcao() {
  const cerimoniaId = consCerimoniaDaTela();
  consGuardarPresencas();
  await consAtoCerimonia(cerimoniaId, "editar", {
    dataCerimonia: consEl("consEdData").value, local: consEl("consEdLocal").value, ocasiao: consEl("consEdOcasiao").value,
    valorTaxa: Number(String(consEl("consEdValor").value).replace(",", "."))
  });
}

async function consIncluirCandidatosAcao() {
  const cerimoniaId = consCerimoniaDaTela();
  consGuardarPresencas();
  const disp = (consCerimoniaAberta && consCerimoniaAberta.disponiveis) || [];
  const ids = disp.filter((p, i) => { const el = consEl(`consIncluir_${i}`); return !!(el && el.checked); }).map((p) => String(p.consagracaoId));
  if (!ids.length) { consMsgDetalhe("Marque os processos que entram na cerimônia."); return; }
  await consAtoCerimonia(cerimoniaId, "incluir", { ids });
  if (geralPara("consagracoes")) carregarConsagracoes();
}

async function consRetirarCandidatoAcao(consagracaoId, nome) {
  const cerimoniaId = consCerimoniaDaTela();
  consGuardarPresencas();
  if (!(await confirmarAcao(`Retirar ${nome || "este candidato"} da cerimônia? Volta para a fila dos homologados.`, "Retirar"))) return;
  await consAtoCerimonia(cerimoniaId, "retirar", { consagracaoId: String(consagracaoId) });
  carregarConsagracoes();
}

async function consCancelarCerimoniaAcao() {
  const cerimoniaId = consCerimoniaDaTela();
  const ce = consCerimoniaAberta && consCerimoniaAberta.cerimonia;
  const motivo = await pedirTexto(`Motivo do cancelamento da cerimônia de ${ce ? dataBrEscada(ce.dataCerimonia) : ""} (obrigatório)`, "");
  if (!motivo) return;
  await consAtoCerimonia(cerimoniaId, "cancelar", { motivo });
  carregarConsagracoes();
}

async function consRegistrarCerimoniaAcao() {
  const d = consCerimoniaAberta;
  if (!d || !d.cerimonia) return;
  const cerimoniaId = d.cerimonia.cerimoniaId;
  const candidatos = d.candidatos || [];
  const presentes = candidatos.filter((p, i) => { const el = consEl(`consPresente_${i}`); return !!(el && el.checked); }).map((p) => String(p.consagracaoId));
  const ausentes = candidatos.filter((p, i) => p.taxa && p.taxa.emDia && !presentes.includes(String(p.consagracaoId))).length;
  const pergunta = `Registrar a cerimônia de ${dataBrEscada(d.cerimonia.dataCerimonia)}? ${presentes.length} presente(s) serão consagrados.`
    + (ausentes ? ` ${ausentes} ausente(s) perdem a consagração neste ano (Art. 75, II, b).` : "") + " Isso não pode ser desfeito.";
  if (!(await confirmarAcao(pergunta, "Registrar"))) return;
  // a lista inteira: quem não está marcado vai como ausente (o servidor recusa se apareceu alguém que esta tela não mostrou)
  const ausenteIds = candidatos.map((p) => String(p.consagracaoId)).filter((x) => !presentes.includes(x));
  const data = await consAtoCerimonia(cerimoniaId, "registrar", { presentes, ausentes: ausenteIds });
  if (data && data.resultados) {
    // o resultado de cada pessoa (quem voltou para a fila sai da cerimônia e não aparece na tabela da realizada)
    const linhas = data.resultados.map((x) => `${x.nome}: ${x.resultado === "CONSAGRADO" ? x.motivo || "consagrado(a)" : x.motivo || x.resultado}`);
    consMsgDetalhe(`${data.mensagem || ""} ${linhas.join(" | ")}`);
    carregarConsagracoes();
  }
}

async function consBaixarDiplomasAcao() {
  const cerimoniaId = consCerimoniaDaTela();
  if (!cerimoniaId) return;
  consGuardarPresencas();
  const token = authToken;
  const res = await fetchProtegido(`${API_BASE}/cerimonias-consagracao/diplomas?cerimoniaId=${encodeURIComponent(String(cerimoniaId))}`);
  if (authToken !== token) return;
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    consMsgDetalhe((data && data.mensagem) || "Não foi possível gerar os diplomas.");
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `diplomas-cerimonia-${cerimoniaId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  await consAbrirCerimoniaAcao(cerimoniaId);
  consMsgDetalhe("Diplomas gerados. Valem depois que a cerimônia for registrada com a pessoa presente.");
}

// ---- ESTEIRA DE BATISMO (vB.11 — Regimento Art. 80) ----
const ROTULO_STATUS_TURMA_BATISMO = { ABERTA: "Aberta", REALIZADA: "Realizada", CANCELADA: "Cancelada" };
const ROTULO_TIPO_LOCAL_BATISMO = { TEMPLO: "Templo", OUTRO_APROVADO: "Outro local aprovado" };

async function salvarTurmaBatismoAcao() {
  const dataBatismo = document.getElementById("turmaBatismoData").value;
  const local = document.getElementById("turmaBatismoLocal").value.trim();
  const tipoLocal = document.getElementById("turmaBatismoTipoLocal").value;
  const oficiantesTexto = document.getElementById("turmaBatismoOficiantes").value.trim();
  const msg = document.getElementById("resultadoTurmaBatismo");
  if (!dataBatismo || !local) { msg.textContent = "Informe data e local."; return; }
  const oficiantesMembroIds = oficiantesTexto ? oficiantesTexto.split(",").map(s => s.trim()).filter(Boolean).map(Number) : [];

  const res = await fetchProtegido(`${API_BASE}/turmas-batismo`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataBatismo, local, tipoLocal, oficiantesMembroIds })
  });
  const data = await res.json();
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("turmaBatismoLocal").value = "";
    document.getElementById("turmaBatismoOficiantes").value = "";
    carregarTurmasBatismo();
  }
}

async function carregarTurmasBatismo() {
  const container = document.getElementById("resultadoListaTurmasBatismo");
  const res = await fetchProtegido(`${API_BASE}/turmas-batismo`);
  const turmas = await jsonDaTela(res, container, "lista");
  if (turmas === null) return;
  if (!Array.isArray(turmas) || turmas.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma turma criada ainda.</p>";
    return;
  }
  container.innerHTML = `<table class="tabela-frequencia"><thead><tr>
    <th>Data</th><th>Local</th><th>Mesa</th><th>Candidatos</th><th>Status</th><th></th>
  </tr></thead><tbody>` + turmas.map(t => `
    <tr>
      <td>${new Date(t.dataBatismo).toLocaleDateString("pt-BR")}</td>
      <td>${escaparHtmlEbd(t.local)} <small>(${ROTULO_TIPO_LOCAL_BATISMO[t.tipoLocal] || escaparHtmlEbd(t.tipoLocal)})</small></td>
      <td>${t.autorizacaoMesa ? "✅" : "⏳"}</td>
      <td>${escaparHtmlEbd(t.totalCandidatos)}</td>
      <td>${ROTULO_STATUS_TURMA_BATISMO[t.status] || escaparHtmlEbd(t.status)}</td>
      <td class="acoes-inline">
        ${authGeral && t.status === "ABERTA" && !t.autorizacaoMesa ? `<button class="btn-link" data-on-click="acaoTurmaBatismo" data-args-click="${argsAttr(t.turmaId, "AUTORIZAR_MESA")}">Autorizar Mesa</button>` : ""}
        ${t.status === "ABERTA" ? `${authGeral ? `<button class="btn-link" data-on-click="acaoTurmaBatismo" data-args-click="${argsAttr(t.turmaId, "REALIZAR")}">Realizar</button>` : ""}
        <button class="btn-link btn-link-perigo" data-on-click="acaoTurmaBatismo" data-args-click="${argsAttr(t.turmaId, "CANCELAR")}">Cancelar</button>` : ""}
      </td>
    </tr>
  `).join("") + "</tbody></table>";
}

async function acaoTurmaBatismo(turmaId, acao) {
  const rotulos = { AUTORIZAR_MESA: "autorizar a Mesa pra", REALIZAR: "REALIZAR o batismo d", CANCELAR: "cancelar" };
  if (!(await confirmarAcao(`Confirma ${rotulos[acao]}esta turma?`, "Confirmar"))) return;
  const res = await fetchProtegido(`${API_BASE}/turmas-batismo/${turmaId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarTurmasBatismo(); carregarCandidatosBatismo(); }
}

async function inscreverCandidatoBatismoAcao() {
  const membroId = document.getElementById("candidatoBatismoMatricula").value;
  const msg = document.getElementById("resultadoCandidatoBatismo");
  if (!membroId) { msg.textContent = "Informe a matrícula."; return; }
  const res = await fetchProtegido(`${API_BASE}/candidatos-batismo`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membroId })
  });
  const data = await res.json();
  msg.textContent = data.mensagem || "";
  if (data.sucesso) { document.getElementById("candidatoBatismoMatricula").value = ""; carregarCandidatosBatismo(); }
}

function badgeAptidaoBatismo(item) {
  return `<span title="${escaparHtmlEbd(item.detalhe)}">${item.ok ? "✅" : "⚠️"}</span>`;
}

async function carregarCandidatosBatismo() {
  const container = document.getElementById("resultadoListaCandidatosBatismo");
  const res = await fetchProtegido(`${API_BASE}/candidatos-batismo`);
  const candidatos = await jsonDaTela(res, container, "lista");
  if (candidatos === null) return;
  if (!Array.isArray(candidatos) || candidatos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum candidato inscrito ainda.</p>";
    return;
  }
  container.innerHTML = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Idade</th><th>Certidão civil</th><th>Parecer</th><th>Discipulado</th><th>Estatuto</th><th>Status</th><th></th>
  </tr></thead><tbody>` + candidatos.map(c => `
    <tr>
      <td>${escaparHtmlEbd(c.nome)}</td>
      <td>${badgeAptidaoBatismo(c.aptidao.itens.idadeMinima)}</td>
      <td>${badgeAptidaoBatismo(c.aptidao.itens.certidaoCivil)}</td>
      <td>${badgeAptidaoBatismo(c.aptidao.itens.parecerVidaPregressa)} <button class="btn-link" data-on-click="parecerCandidatoBatismoAcao" data-args-click="${argsAttr(c.candidatoId)}">Dar parecer</button></td>
      <td>${badgeAptidaoBatismo(c.aptidao.itens.discipulado)} <button class="btn-link" data-on-click="alternarDiscipuladoBatismoAcao" data-args-click="${argsAttr(c.candidatoId, !c.discipuladoConcluidoManual)}">${c.discipuladoConcluidoManual ? "Desmarcar" : "Marcar concluído"}</button></td>
      <td>${c.aceiteTermoAssinadoId ? "✅" : `<button class="btn-link" data-on-click="acaoCandidatoBatismo" data-args-click="${argsAttr(c.candidatoId, "ACEITAR_ESTATUTO")}">Registrar aceite</button>`}</td>
      <td>${escaparHtmlEbd(c.status)}</td>
      <td class="acoes-inline">
        ${c.status === "AGUARDANDO_TURMA" ? `<button class="btn-link" data-on-click="atribuirTurmaBatismoAcao" data-args-click="${argsAttr(c.candidatoId)}">Atribuir turma</button>` : ""}
        ${c.turmaId && c.status === "AGUARDANDO_TURMA" ? `
          <button class="btn-link" data-on-click="acaoCandidatoBatismo" data-args-click="${argsAttr(c.candidatoId, "APROVAR")}">Aprovar</button>
          <button class="btn-link btn-link-perigo" data-on-click="reprovarCandidatoBatismoAcao" data-args-click="${argsAttr(c.candidatoId)}">Reprovar</button>
        ` : ""}
      </td>
    </tr>
  `).join("") + "</tbody></table>";
}

async function acaoCandidatoBatismo(id, acao, corpoExtra) {
  const res = await fetchProtegido(`${API_BASE}/candidatos-batismo/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ acao }, corpoExtra))
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarCandidatosBatismo();
}

async function parecerCandidatoBatismoAcao(id) {
  const favoravel = await confirmarAcao("O parecer de vida pregressa é favorável? (Cancelar = desfavorável)", "Favorável");
  const observacao = await pedirTexto("Observação do parecer (opcional)", "");
  await acaoCandidatoBatismo(id, "PARECER", { parecerVidaPregressa: favoravel ? "FAVORAVEL" : "DESFAVORAVEL", observacao });
}

async function alternarDiscipuladoBatismoAcao(id, concluido) {
  await acaoCandidatoBatismo(id, "DISCIPULADO_CONCLUIDO", { concluido });
}

async function atribuirTurmaBatismoAcao(id) {
  const turmaId = await pedirTexto("Id da turma (veja a tabela de Turmas de Batismo acima)", "Ex: 3");
  if (!turmaId) return;
  await acaoCandidatoBatismo(id, "ATRIBUIR_TURMA", { turmaId: Number(turmaId) });
}

async function reprovarCandidatoBatismoAcao(id) {
  const motivo = await pedirTexto("Motivo da reprovação (obrigatório)", "");
  if (!motivo) return;
  await acaoCandidatoBatismo(id, "REPROVAR", { motivo });
}

async function avancarConsagracaoAcao(id) {
  if (consagracaoOcupada) { avisarResultado({ sucesso: false, mensagem: MSG_AGUARDE_CONSAGRACAO }); return; }
  const doCache = consagracoesCache.find((c) => String(c.consagracaoId) === String(id));
  const pergunta = doCache && doCache.cargoAlvo ? `Enviar o processo de ${doCache.nome} ao CEI para o parecer?` : "Confirma avançar este processo para a próxima etapa?";
  if (!(await confirmarAcao(pergunta, doCache && doCache.cargoAlvo ? "Enviar" : "Avançar"))) return;
  if (consagracaoOcupada) { avisarResultado({ sucesso: false, mensagem: MSG_AGUARDE_CONSAGRACAO }); return; }
  consagracaoOcupada = true;
  try {
    const res = await fetchProtegido(`${API_BASE}/consagracoes/${id}/evoluir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "AVANCAR" })
    });
    const data = await res.json();
    avisarResultado(data);
    // travou na escada: a lista do que falta aparece (com o nome de quem é o processo) e a tela vai até ela
    const processo = consagracoesCache.find((c) => String(c.consagracaoId) === String(id));
    if (data.requisitos) mostrarRequisitosEscada(data.requisitos, null, (processo && processo.nome) || "Processo"); else limparRequisitosEscada();
    // sucesso, ou "mudou de etapa enquanto você olhava": a lista é relida
    if (data.sucesso || !data.requisitos) carregarConsagracoes();
  } finally {
    consagracaoOcupada = false;
  }
}

async function reprovarConsagracaoAcao(id) {
  if (!(await confirmarAcao("Confirma reprovar e arquivar este processo? Isso não pode ser desfeito.", "Reprovar"))) return;
  const res = await fetchProtegido(`${API_BASE}/consagracoes/${id}/evoluir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao: "REPROVAR" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarConsagracoes();
}

registrarAcoes({
  acaoCandidatoBatismo, acaoTurmaBatismo, alternarDiscipuladoBatismoAcao, atribuirTurmaBatismoAcao, avancarConsagracaoAcao, conferirRequisitosConsagracaoAcao, limparRequisitosEscada, mudouModalidadeConsagracaoAcao,
  inscreverCandidatoBatismoAcao, parecerCandidatoBatismoAcao, reprovarCandidatoBatismoAcao, reprovarConsagracaoAcao, salvarConsagracao,
  salvarTurmaBatismoAcao,
  // v8.3
  consDocumentosAcao, consFecharPaineisAcao, consAbrirHomologarAcao, consHomologarAcao, consTaxaAcao, consRegistrarTaxaAcao, consRemoverTaxaAcao,
  consDarParecerAcao, consMostrarEscrutinioAcao, consFecharParecerAcao, consEnviarParecerAcao, consCriarCerimoniaAcao, consAbrirCerimoniaAcao,
  consSalvarComissaoAcao, consEditarCerimoniaAcao, consIncluirCandidatosAcao, consRetirarCandidatoAcao, consCancelarCerimoniaAcao, consRegistrarCerimoniaAcao,
  consBaixarDiplomasAcao
});
