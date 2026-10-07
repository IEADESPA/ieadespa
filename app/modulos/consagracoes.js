// app/modulos/consagracoes.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- SECRETARIA / ABA CONSAGRAÇÕES ----
// Os tipos de proposta ("Assunto") são um catálogo configurável (Catálogos ->
// Tipos de Proposta), não mais uma lista fixa no HTML — dá pra adicionar/
// renomear/excluir tipo sem mexer em código.
async function carregarTiposConsagracao() {
  const select = document.getElementById("consagracaoAssunto");
  const res = await fetchProtegido(`${API_BASE}/catalogos/tiposConsagracao`);
  const tipos = await jsonDaTela(res, select, "objeto");
  if (tipos === null) return;
  select.innerHTML = tipos.filter(t => t.ativo !== false).map(t => `<option value="${escaparHtmlEbd(t.nome)}">${escaparHtmlEbd(t.nome)}</option>`).join("")
    + `<option value="__outro">Outro (digitar)</option>`;
  document.getElementById("consagracaoAssuntoOutro").style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("consagracaoAssunto");
  if (select) select.addEventListener("change", () => {
    document.getElementById("consagracaoAssuntoOutro").style.display = select.value === "__outro" ? "block" : "none";
  });
});

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
  const membroId = document.getElementById("consagracaoMatricula").value;
  const selectAssunto = document.getElementById("consagracaoAssunto").value;
  const assunto = selectAssunto === "__outro" ? document.getElementById("consagracaoAssuntoOutro").value : selectAssunto;
  const proponenteMembroId = document.getElementById("consagracaoProponente").value;
  const msg = document.getElementById("resultadoConsagracao");

  if (!membroId || !assunto || !proponenteMembroId) {
    msg.textContent = "Informe matrícula, assunto e proponente.";
    return;
  }

  const res = await fetchProtegido(`${API_BASE}/consagracoes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, assunto, proponenteMembroId })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("consagracaoMatricula").value = "";
    document.getElementById("consagracaoProponente").value = "";
    carregarConsagracoes();
  }
}

async function carregarConsagracoes() {
  const container = document.getElementById("resultadoListaConsagracoes");
  const res = await fetchProtegido(`${API_BASE}/consagracoes`);
  const consagracoes = await jsonDaTela(res, container, "objeto");
  if (consagracoes === null) return;

  if (consagracoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum processo em andamento.</p>";
    return;
  }

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Assunto</th><th>Proponente</th><th>Status</th><th>Protocolo</th><th></th>
  </tr></thead><tbody>`;

  consagracoes.forEach(c => {
    html += `<tr>
      <td>${escaparHtmlEbd(c.nome)}</td>
      <td>${escaparHtmlEbd(c.assunto)}</td>
      <td>${escaparHtmlEbd(c.proponente) || "-"}</td>
      <td>${ROTULO_STATUS_CONSAGRACAO[c.status] || escaparHtmlEbd(c.status)}</td>
      <td>${escaparHtmlEbd(c.dataProtocolo)}</td>
      <td>
        ${authGeral ? `<button class="btn-link" data-on-click="avancarConsagracaoAcao" data-args-click="${argsAttr(String(c.consagracaoId ?? ""))}">Avançar</button>
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
  if (!(await confirmarAcao("Confirma avançar este processo para a próxima etapa?", "Avançar"))) return;
  const res = await fetchProtegido(`${API_BASE}/consagracoes/${id}/evoluir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao: "AVANCAR" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarConsagracoes();
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
  acaoCandidatoBatismo, acaoTurmaBatismo, alternarDiscipuladoBatismoAcao, atribuirTurmaBatismoAcao, avancarConsagracaoAcao,
  inscreverCandidatoBatismoAcao, parecerCandidatoBatismoAcao, reprovarCandidatoBatismoAcao, reprovarConsagracaoAcao, salvarConsagracao,
  salvarTurmaBatismoAcao
});
