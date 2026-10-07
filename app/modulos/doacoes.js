// app/modulos/doacoes.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- DOAÇÕES E PROGRAMA DE INTEGRIDADE (v4.22) ----
async function registrarDoacaoAcao() {
  const body = {
    congregacaoId: document.getElementById("doacaoCongregacao").value || null,
    valor: document.getElementById("doacaoValor").value,
    formaPagamento: document.getElementById("doacaoFormaPagamento").value,
    dataRecebimento: document.getElementById("doacaoData").value,
    doadorNome: document.getElementById("doacaoDoadorNome").value || null,
    doadorCpfCnpj: document.getElementById("doacaoDoadorCpfCnpj").value || null
  };
  const res = await fetchProtegido(`${API_BASE}/doacoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) {
    document.getElementById("doacaoValor").value = "";
    document.getElementById("doacaoDoadorNome").value = "";
    document.getElementById("doacaoDoadorCpfCnpj").value = "";
    carregarDoacoesAcao();
    carregarSinalizacoesNifAcao();
  }
}

async function carregarDoacoesAcao() {
  const container = document.getElementById("resultadoDoacoes");
  const res = await fetchProtegido(`${API_BASE}/doacoes`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma doação registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Recibo</th><th>Data</th><th>Valor</th><th>Forma</th><th>Doador</th></tr></thead><tbody>`;
  lista.forEach(d => {
    const doador = d.identificacaoObrigatoria ? `${escaparHtmlEbd(d.doadorNome) || "⚠️ não identificado"} (${escaparHtmlEbd(d.doadorCpfCnpj) || "-"})` : (d.doadorNome || "-");
    html += `<tr><td>${escaparHtmlEbd(d.numeroRecibo)}</td><td>${escaparHtmlEbd(d.dataRecebimento)}</td><td>R$ ${Number(d.valor).toFixed(2)}</td><td>${escaparHtmlEbd(d.formaPagamento)}</td><td>${escaparHtmlEbd(doador)}</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarPoliticaAcao() {
  const body = {
    tipo: document.getElementById("politicaTipo").value,
    titulo: document.getElementById("politicaTitulo").value,
    ataReferencia: document.getElementById("politicaAta").value,
    dataAprovacao: document.getElementById("politicaData").value
  };
  const res = await fetchProtegido(`${API_BASE}/integridade/politicas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) { document.getElementById("politicaTitulo").value = ""; document.getElementById("politicaAta").value = ""; carregarPoliticasAcao(); }
}

async function carregarPoliticasAcao() {
  const container = document.getElementById("resultadoPoliticas");
  const res = await fetchProtegido(`${API_BASE}/integridade/politicas`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma política aprovada ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Id</th><th>Tipo</th><th>Título</th><th>Ata</th><th>Aprovação</th><th>Vigente</th></tr></thead><tbody>`;
  lista.forEach(p => html += `<tr><td>${p.PoliticaId}</td><td>${escaparHtmlEbd(p.Tipo)}</td><td>${escaparHtmlEbd(p.Titulo)}</td><td>${escaparHtmlEbd(p.AtaReferencia)}</td><td>${escaparHtmlEbd(p.DataAprovacao)}</td><td>${p.Vigente ? "✅" : "-"}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarAceiteAcao() {
  const body = { membroId: document.getElementById("aceiteMembroId").value, politicaId: document.getElementById("aceitePoliticaId").value };
  const res = await fetchProtegido(`${API_BASE}/integridade/aceites`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) {
    document.getElementById("aceiteMembroId").value = "";
    document.getElementById("aceitePoliticaId").value = "";
    const res2 = await fetchProtegido(`${API_BASE}/integridade/aceites`);
    const lista = await res2.json();
    const container = document.getElementById("resultadoAceites");
    let html = `<table class="tabela-frequencia"><thead><tr><th>Membro</th><th>Política</th><th>Data</th></tr></thead><tbody>`;
    (Array.isArray(lista) ? lista : []).forEach(a => html += `<tr><td>${escaparHtmlEbd(a.membroNome)}</td><td>${escaparHtmlEbd(a.politicaTitulo)}</td><td>${new Date(a.DataAceite).toLocaleString("pt-BR")}</td></tr>`);
    html += "</tbody></table>";
    container.innerHTML = html;
  }
}

async function carregarDueDiligenceAcao() {
  const container = document.getElementById("resultadoDueDiligence");
  const res = await fetchProtegido(`${API_BASE}/integridade/due-diligence`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum fornecedor cadastrado.</p>";
    return;
  }
  const cores = { APROVADO: "✅", REPROVADO: "⛔", PENDENTE: "⏳" };
  let html = `<table class="tabela-frequencia"><thead><tr><th>Fornecedor</th><th>Status</th><th>Observação</th><th>Ação</th></tr></thead><tbody>`;
  lista.forEach(f => {
    html += `<tr><td>${escaparHtmlEbd(f.fornecedorNome)}</td><td>${cores[f.Status] || "⏳"} ${escaparHtmlEbd(f.Status) || "PENDENTE"}</td><td>${escaparHtmlEbd(f.Observacao) || "-"}</td>
      <td>
        <button class="btn-confirmar" style="width:auto;padding:4px 8px;" data-on-click="registrarDueDiligenceAcao" data-args-click="${argsAttr(f.FornecedorId, "APROVADO")}">Aprovar</button>
        <button class="btn-confirmar" style="width:auto;padding:4px 8px;" data-on-click="registrarDueDiligenceAcao" data-args-click="${argsAttr(f.FornecedorId, "REPROVADO")}">Reprovar</button>
      </td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarDueDiligenceAcao(fornecedorId, status) {
  const observacao = prompt(`Observação da due diligence (${status}):`, "") || null;
  const res = await fetchProtegido(`${API_BASE}/integridade/due-diligence`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fornecedorId, status, observacao }) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) carregarDueDiligenceAcao();
}

async function registrarConflitoInteresseAcao() {
  const body = {
    membroId: document.getElementById("conflitoMembroId").value,
    mandatoReferencia: document.getElementById("conflitoMandato").value,
    temConflito: document.getElementById("conflitoTem").value === "1",
    descricaoConflito: document.getElementById("conflitoDescricao").value || null
  };
  const res = await fetchProtegido(`${API_BASE}/integridade/conflitos-interesse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  alert(d.mensagem);
  if (d.sucesso) {
    document.getElementById("conflitoMembroId").value = "";
    document.getElementById("conflitoMandato").value = "";
    document.getElementById("conflitoDescricao").value = "";
    carregarConflitosInteresseAcao();
  }
}

async function carregarConflitosInteresseAcao() {
  const container = document.getElementById("resultadoConflitosInteresse");
  const res = await fetchProtegido(`${API_BASE}/integridade/conflitos-interesse`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma declaração registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Dirigente</th><th>Mandato</th><th>Conflito?</th><th>Descrição</th></tr></thead><tbody>`;
  lista.forEach(c => html += `<tr><td>${escaparHtmlEbd(c.membroNome)}</td><td>${escaparHtmlEbd(c.MandatoReferencia)}</td><td>${c.TemConflito ? "⚠️ Sim" : "✅ Não"}</td><td>${escaparHtmlEbd(c.DescricaoConflito) || "-"}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

// ==================== ABA: PROTEÇÃO DE DADOS (Encarregado de Dados) ====================
async function carregarSolicitacoesDPO() {
  const status = document.getElementById("dpoFiltroStatus").value;
  const params = new URLSearchParams();
  if (status) params.set("status", status);

  const res = await fetchProtegido(`${API_BASE}/lgpd/dpo/solicitacoes?${params.toString()}`);
  const container = document.getElementById("resultadoListaSolicitacoesDPO");
  const registros = await jsonDaTela(res, container, "lista");
  if (registros === null) return;
  if (!Array.isArray(registros) || registros.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma solicitação encontrada.</p>";
    return;
  }
  let html = "<table class='tabela-frequencia'><thead><tr><th>Matrícula</th><th>Nome</th><th>Tipo</th><th>Descrição</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead><tbody>";
  registros.forEach(s => {
    let acoes = "";
    if (s.status === "PENDENTE" || s.status === "EM_ANALISE") {
      if (s.tipo === "EXCLUSAO") {
        acoes = `<button class="btn-link" data-on-click="responderSolicitacaoDPO" data-args-click="${argsAttr(s.solicitacaoId, "EM_ANALISE")}">Em análise</button>
                 <button class="btn-link" data-on-click="executarExclusaoDPO" data-args-click="${argsAttr(s.solicitacaoId)}">Executar exclusão</button>
                 <button class="btn-link btn-link-perigo" data-on-click="responderSolicitacaoDPO" data-args-click="${argsAttr(s.solicitacaoId, "NEGADA")}">Negar</button>`;
      } else {
        acoes = `<button class="btn-link" data-on-click="responderSolicitacaoDPO" data-args-click="${argsAttr(s.solicitacaoId, "EM_ANALISE")}">Em análise</button>
                 <button class="btn-link" data-on-click="responderSolicitacaoDPO" data-args-click="${argsAttr(s.solicitacaoId, "ATENDIDA")}">Atender</button>
                 <button class="btn-link btn-link-perigo" data-on-click="responderSolicitacaoDPO" data-args-click="${argsAttr(s.solicitacaoId, "NEGADA")}">Negar</button>`;
      }
    }
    html += `<tr>
      <td>${s.membroId}</td>
      <td>${escaparHtmlEbd(s.nome)}</td>
      <td>${escaparHtmlEbd(s.tipo)}</td>
      <td>${escaparHtmlEbd(s.descricao) || "-"}</td>
      <td>${badgeStatusLgpd(s.status)}</td>
      <td>${new Date(s.dataSolicitacao).toLocaleDateString("pt-BR")}</td>
      <td class="acoes-inline">${acoes}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function responderSolicitacaoDPO(id, status) {
  let respostaTexto = null;
  if (status === "ATENDIDA" || status === "NEGADA") {
    respostaTexto = await pedirTexto(status === "NEGADA" ? "Motivo da negativa" : "Resposta ao titular", "Explique a decisão");
    if (respostaTexto === null) return;
  }
  const res = await fetchProtegido(`${API_BASE}/lgpd/dpo/solicitacoes/${id}/responder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, respostaTexto })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarSolicitacoesDPO();
}

async function executarExclusaoDPO(id) {
  if (!(await confirmarAcao("Executar a exclusão? Isso apaga o telefone, e-mail e endereço do titular permanentemente (dados cadastrais e de processos são mantidos por obrigação legal).", "Executar exclusão"))) return;
  const res = await fetchProtegido(`${API_BASE}/lgpd/dpo/solicitacoes/${id}/excluir`, { method: "POST" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarSolicitacoesDPO();
}

registrarAcoes({
  carregarSolicitacoesDPO, executarExclusaoDPO, registrarAceiteAcao, registrarConflitoInteresseAcao, registrarDoacaoAcao, registrarDueDiligenceAcao,
  registrarPoliticaAcao, responderSolicitacaoDPO
});
