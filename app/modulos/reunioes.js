// app/modulos/reunioes.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- SECRETARIA / ABA REUNIÕES ----
function statusFrequencia(item) {
  if (item.presente) return "Presente";
  if (item.faltaJustificada) return "Falta justificada";
  return "Falta";
}
function badgeStatusPessoa(status) {
  const classes = { ATIVO: "badge-ativo", "LICENÇA": "badge-licenca", INATIVO: "badge-inativo", DESLIGADO: "badge-desligado", FALECIDO: "badge-desligado" };
  return `<span class="badge-status ${classes[status] || ""}">${escaparHtmlEbd(status)}</span>`;
}

function idadeDe(dataNascimento) {
  if (!dataNascimento) return null;
  const n = new Date(dataNascimento);
  const hoje = new Date();
  let idade = hoje.getFullYear() - n.getFullYear();
  const m = hoje.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < n.getDate())) idade--;
  return idade;
}

function badgeCategoria(capacidade) {
  const c = capacidade || {};
  const cores = {
    "Membro Elegível": "badge-ativo",
    "Capacidade Eleitoral Ativa": "badge-ativo",
    "Membro em Comunhão": "badge-ativo",
    "Sem comunhão": "badge-desligado",
    "Congregado": "badge-inativo",
    "Dados incompletos": "badge-licenca"
  };
  let html = `<span class="badge-status ${cores[c.categoria] || "badge-licenca"}">${escaparHtmlEbd(c.categoria) || "-"}</span>`;
  // v1.2 — a categoria NÃO muda com a integração: o batismo já torna a pessoa
  // "Membro em Comunhão" (Art. 7º II). Os 90 dias apenas restringem votar/ser votado,
  // então o período aparece como um aviso à parte, sem substituir a categoria.
  if (c.emPeriodoIntegracao) {
    const restantes = c.diasRestantesIntegracao != null ? c.diasRestantesIntegracao : 0;
    html += ` <span class="badge-status badge-licenca" title="Período de Integração — Art. 6º §2º">⏳ ${escaparHtmlEbd(restantes)}d p/ votar</span>`;
  }
  return html;
}

async function carregarOrgaos() {
  const container = document.getElementById("resultadoListaOrgaos");
  const res = await fetchProtegido(`${API_BASE}/orgaos`);
  const orgaos = await jsonDaTela(res, container, "objeto");
  if (orgaos === null) return;
  window._orgaosCache = orgaos;
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>ID</th><th>Sigla</th><th>Nome</th><th>Quórum mín.</th><th>Quórum delib.</th><th>Faltas</th><th></th>
  </tr></thead><tbody>`;
  orgaos.forEach(o => {
    html += `<tr>
      <td>${o.orgaoId}</td>
      <td>${escaparHtmlEbd(o.sigla)}</td>
      <td>${escaparHtmlEbd(o.nome)}</td>
      <td>${escaparHtmlEbd(o.quorumMinimoPct ?? "-")}</td>
      <td>${escaparHtmlEbd(o.quorumDeliberativoPct ?? "-")}</td>
      <td>${escaparHtmlEbd(o.faltasParaPerdaAssento ?? "-")}</td>
      <td class="acoes-inline">
        ${authGeral ? `<button class="btn-link" data-on-click="editarOrgao" data-args-click="${argsAttr(o.orgaoId)}">Editar</button>
        <button class="btn-link btn-link-perigo" data-on-click="excluirOrgao" data-args-click="${argsAttr(o.orgaoId)}">Excluir</button>` : ""}
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;

  const selectAssento = document.getElementById("assentoOrgao");
  if (selectAssento) selectAssento.innerHTML = orgaos.map(o => `<option value="${o.orgaoId}">${escaparHtmlEbd(o.nome)}</option>`).join("");
}

function badgeSituacaoAssento(situacao) {
  const classes = { ATIVA: "badge-ativo", MANDATO_VENCIDO: "badge-licenca", ENCERRADA: "badge-desligado" };
  const rotulos = { ATIVA: "Ativa", MANDATO_VENCIDO: "Mandato vencido", ENCERRADA: "Encerrada" };
  return `<span class="badge-status ${classes[situacao] || ""}">${rotulos[situacao] || escaparHtmlEbd(situacao)}</span>`;
}

async function carregarAssentos() {
  const container = document.getElementById("resultadoListaAssentos");
  const res = await fetchProtegido(`${API_BASE}/assentos`);
  const assentos = await jsonDaTela(res, container, "lista");
  if (assentos === null) return;
  if (!Array.isArray(assentos) || assentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma cadeira cadastrada ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Nome</th><th>Órgão</th><th>Tipo</th><th>Cargo/Função</th><th>Desde</th><th>Até</th><th>Situação</th><th></th>
  </tr></thead><tbody>`;
  assentos.forEach(a => {
    html += `<tr>
      <td>${a.membroId}</td>
      <td>${escaparHtmlEbd(a.nome)}</td>
      <td>${escaparHtmlEbd(a.orgaoNome)}</td>
      <td>${a.tipoAssento === "ORDENACAO" ? "Ordenação" : "Função"}</td>
      <td>${escaparHtmlEbd(a.cargoOuFuncao) || "-"}</td>
      <td>${escaparHtmlEbd(a.dataInicio)}</td>
      <td>${escaparHtmlEbd(a.dataTerminoPrevisao) || "sem prazo"}</td>
      <td>${badgeSituacaoAssento(a.situacaoEfetiva)}</td>
      <td class="acoes-inline">${authGeral ? `<button class="btn-link btn-link-perigo" data-on-click="encerrarAssentoAcao" data-args-click="${argsAttr(a.assentoId)}">Encerrar</button>` : ""}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarAssento() {
  const membroId = document.getElementById("assentoMatricula").value;
  const orgaoId = document.getElementById("assentoOrgao").value;
  const tipoAssento = document.getElementById("assentoTipo").value;
  const cargoOuFuncao = document.getElementById("assentoCargoOuFuncao").value.trim();
  const duracaoMeses = document.getElementById("assentoDuracaoMeses").value || null;
  const msg = document.getElementById("resultadoAssento");
  if (!membroId || !orgaoId) { msg.textContent = "Informe a matrícula e o órgão."; return; }
  const res = await fetchProtegido(`${API_BASE}/assentos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, orgaoId, tipoAssento, cargoOuFuncao: cargoOuFuncao || null, duracaoMeses })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("assentoMatricula").value = "";
    document.getElementById("assentoCargoOuFuncao").value = "";
    document.getElementById("assentoDuracaoMeses").value = "";
    carregarAssentos();
  }
}

async function encerrarAssentoAcao(assentoId) {
  if (!(await confirmarAcao("Encerrar esta cadeira?", "Encerrar"))) return;
  const res = await fetchProtegido(`${API_BASE}/assentos/${assentoId}/encerrar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarAssentos();
}

function editarOrgao(orgaoId) {
  const o = (window._orgaosCache || []).find(x => x.orgaoId === orgaoId);
  if (!o) return;
  document.getElementById("orgaoId").value = o.orgaoId;
  document.getElementById("orgaoSigla").value = o.sigla;
  document.getElementById("orgaoNome").value = o.nome;
  document.getElementById("orgaoQuorumMinimo").value = o.quorumMinimoPct ?? "";
  document.getElementById("orgaoQuorumDeliberativo").value = o.quorumDeliberativoPct ?? "";
  document.getElementById("orgaoFaltasPerda").value = o.faltasParaPerdaAssento ?? "";
  document.getElementById("orgaoSigla").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function salvarOrgao() {
  const orgaoId = document.getElementById("orgaoId").value || null;
  const sigla = document.getElementById("orgaoSigla").value.trim();
  const nome = document.getElementById("orgaoNome").value.trim();
  const quorumMinimoPct = document.getElementById("orgaoQuorumMinimo").value;
  const quorumDeliberativoPct = document.getElementById("orgaoQuorumDeliberativo").value;
  const faltasParaPerdaAssento = document.getElementById("orgaoFaltasPerda").value;
  if (!sigla || !nome) { document.getElementById("resultadoOrgao").textContent = "Informe sigla e nome."; return; }
  const res = await fetchProtegido(`${API_BASE}/orgaos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgaoId, sigla, nome, quorumMinimoPct, quorumDeliberativoPct, faltasParaPerdaAssento })
  });
  const data = await res.json();
  document.getElementById("resultadoOrgao").textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("orgaoId").value = "";
    document.getElementById("orgaoSigla").value = "";
    document.getElementById("orgaoNome").value = "";
    document.getElementById("orgaoQuorumMinimo").value = "";
    document.getElementById("orgaoQuorumDeliberativo").value = "";
    document.getElementById("orgaoFaltasPerda").value = "";
    carregarOrgaos();
  }
}

async function excluirOrgao(orgaoId) {
  if (!(await confirmarAcao("Excluir este órgão? A ação não pode ser desfeita.", "Excluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/orgaos/${orgaoId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  carregarOrgaos();
}

registrarAcoes({
  editarOrgao, encerrarAssentoAcao, excluirOrgao, salvarAssento, salvarOrgao
});
