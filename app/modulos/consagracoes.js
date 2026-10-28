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

  if (consagracoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum processo em andamento.</p>";
    return;
  }

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Assunto</th><th>Destino</th><th>Proponente</th><th>Status</th><th>Protocolo</th><th></th>
  </tr></thead><tbody>`;

  consagracoes.forEach(c => {
    const vetado = !!c.vetoAFMEm;
    const destino = c.cargoAlvo ? escaparHtmlEbd(ROTULO_CARGO_ESCADA[c.cargoAlvo] || c.cargoAlvo) : "-";
    const modalidade = c.modalidade && c.modalidade !== "INDICACAO"
      ? `<br><small>${escaparHtmlEbd(ROTULO_MODALIDADE_ESCADA[c.modalidade] || c.modalidade)}${c.atoReferencia ? `: ${escaparHtmlEbd(c.atoReferencia)}` : ""}</small>` : "";
    const status = vetado
      ? `Vetado pela AFM em ${escaparHtmlEbd(dataBrEscada(c.vetoAFMEm))}<br><small>${escaparHtmlEbd(c.vetoAFMMotivo)}</small>`
      : (ROTULO_STATUS_CONSAGRACAO[c.status] || escaparHtmlEbd(c.status));
    html += `<tr>
      <td>${escaparHtmlEbd(c.nome)}</td>
      <td>${escaparHtmlEbd(c.assunto)}</td>
      <td>${destino}${modalidade}</td>
      <td>${escaparHtmlEbd(c.proponente) || "-"}</td>
      <td>${status}</td>
      <td>${escaparHtmlEbd(c.dataProtocolo)}</td>
      <td>
        ${geralPara("consagracoes") && !vetado ? `<button class="btn-link" data-on-click="avancarConsagracaoAcao" data-args-click="${argsAttr(String(c.consagracaoId ?? ""))}">Avançar</button>
        <button class="btn-link btn-link-perigo" data-on-click="reprovarConsagracaoAcao" data-args-click="${argsAttr(String(c.consagracaoId ?? ""))}">Reprovar</button>` : "-"}
      </td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;
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
  if (!(await confirmarAcao("Confirma avançar este processo para a próxima etapa?", "Avançar"))) return;
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
  salvarTurmaBatismoAcao
});
