// app/modulos/projetos-assembleia.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- Projetos e Parecer de Comissões (v2.8, Parte B — Art. 24-25) ----
async function salvarProjeto() {
  const autorMembroId = document.getElementById("projetoAutorMatricula").value;
  const titulo = document.getElementById("projetoTitulo").value.trim();
  const texto = document.getElementById("projetoTexto").value.trim();
  const comissaoTematica = document.getElementById("projetoComissaoTematica").value;
  const msg = document.getElementById("resultadoProjeto");
  if (!autorMembroId || !titulo || !texto) { msg.textContent = "Informe matrícula do autor, título e texto."; return; }
  const res = await fetchProtegido(`${API_BASE}/projetos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ autorMembroId, titulo, texto, comissaoTematica })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("projetoAutorMatricula").value = "";
    document.getElementById("projetoTitulo").value = "";
    document.getElementById("projetoTexto").value = "";
    carregarProjetos();
  }
}

const ROTULO_STATUS_PROJETO = { EM_PARECER: "Em parecer", APTO_VOTACAO: "Apto para votação", ARQUIVADO: "Arquivado" };

async function carregarProjetos() {
  const container = document.getElementById("resultadoListaProjetos");
  const res = await fetchProtegido(`${API_BASE}/projetos`);
  const projetos = await jsonDaTela(res, container, "lista");
  if (projetos === null) return;
  if (!Array.isArray(projetos) || projetos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum projeto protocolado ainda.</p>";
    return;
  }
  let html = "";
  projetos.forEach(p => {
    const pareceresHtml = (p.pareceres || []).map(par => {
      const rotulo = par.parecer ? `${par.parecer === "FAVORAVEL" ? "✅" : "❌"} ${escaparHtmlEbd(par.parecer)} (${escaparHtmlEbd(par.dataEmissao)})` : "⏳ pendente";
      const botoes = !par.parecer ? `
        <button class="btn-link" data-on-click="emitirParecerAcao" data-args-click="${argsAttr(p.projetoId, String(par.sigla ?? ""), "FAVORAVEL")}">Favorável</button>
        <button class="btn-link btn-link-perigo" data-on-click="emitirParecerAcao" data-args-click="${argsAttr(p.projetoId, String(par.sigla ?? ""), "CONTRARIO")}">Contrário</button>` : "";
      return `<li>${escaparHtmlEbd(par.sigla)}: ${rotulo} ${botoes}</li>`;
    }).join("");
    html += `<div class="cartao-perfil" style="margin-bottom:12px;">
      <h4 style="margin:0 0 6px; color: var(--cor-primaria);">${escaparHtmlEbd(p.protocolo)} — ${escaparHtmlEbd(p.titulo)}</h4>
      <p class="subtitle">Autor: ${escaparHtmlEbd(p.autorNome)} · Protocolado em ${escaparHtmlEbd(p.dataProtocolo)} · Status: ${ROTULO_STATUS_PROJETO[p.status] || escaparHtmlEbd(p.status)}${p.regimeUrgencia ? " (regime de urgência)" : ""}</p>
      <p>${escaparHtmlEbd(p.texto)}</p>
      <ul>${pareceresHtml}</ul>
      ${p.prazoVencido ? `<p class="subtitle" style="color:var(--cor-perigo,#c0392b);">⚠️ Prazo de 15 dias do parecer vencido (${escaparHtmlEbd(p.diasDesdeProtocolo)} dias desde o protocolo).</p>` : ""}
      ${authGeral && p.status === "EM_PARECER" && !p.regimeUrgencia ? `<button class="btn-link" data-on-click="marcarUrgenciaAcao" data-args-click="${argsAttr(p.projetoId)}">Marcar regime de urgência</button>` : ""}
    </div>`;
  });
  container.innerHTML = html;
}

async function emitirParecerAcao(projetoId, sigla, parecer) {
  if (!(await confirmarAcao(`Confirma o parecer ${parecer} da comissão ${sigla}?`, "Confirmar"))) return;
  const res = await fetchProtegido(`${API_BASE}/projetos/${projetoId}/parecer/${sigla}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parecer })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarProjetos();
}

async function marcarUrgenciaAcao(projetoId) {
  if (!(await confirmarAcao("Confirma que o Plenário aprovou regime de urgência (2/3) pra este projeto?", "Confirmar"))) return;
  const res = await fetchProtegido(`${API_BASE}/projetos/${projetoId}/urgencia`, { method: "POST" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarProjetos();
}

// Art. 29 — espelha shared/diretoria.js::CARGOS_DIRETORIA (fonte de verdade
// do cálculo continua no back-end; isso aqui é só rótulo de exibição).
const CARGOS_DIRETORIA = {
  PRESIDENTE: "Presidente",
  VICE_PRESIDENTE_1: "1º Vice-Presidente",
  VICE_PRESIDENTE_2: "2º Vice-Presidente",
  VICE_PRESIDENTE_3: "3º Vice-Presidente",
  VICE_PRESIDENTE_4: "4º Vice-Presidente",
  SECRETARIO_1: "1º Secretário",
  SECRETARIO_2: "2º Secretário",
  SECRETARIO_3: "3º Secretário",
  TESOUREIRO_1: "1º Tesoureiro",
  TESOUREIRO_2: "2º Tesoureiro"
};

function orgaoIdDiretoria() {
  const orgao = (window._orgaosReunioesCache || []).find(o => o.sigla === "DIRETORIA_EXECUTIVA");
  return orgao ? orgao.orgaoId : null;
}

async function carregarAssentosDiretoria() {
  const select = document.getElementById("assentoDiretoriaCargo");
  if (select && !select.dataset.preenchido) {
    select.innerHTML = Object.entries(CARGOS_DIRETORIA).map(([sigla, rotulo]) => `<option value="${sigla}">${rotulo}</option>`).join("");
    select.dataset.preenchido = "1";
  }

  const container = document.getElementById("resultadoListaDiretoria");
  const orgaoId = orgaoIdDiretoria();
  if (!orgaoId) return;
  const res = await fetchProtegido(`${API_BASE}/assentos?orgaoId=${orgaoId}`);
  const assentos = await jsonDaTela(res, container, "lista");
  if (assentos === null) return;

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Cargo</th><th>Matrícula</th><th>Nome</th><th>Desde</th><th>Até</th><th>Situação</th><th></th>
  </tr></thead><tbody>`;
  Object.entries(CARGOS_DIRETORIA).forEach(([sigla, rotulo]) => {
    const a = Array.isArray(assentos) ? assentos.find(x => x.cargoOuFuncao === sigla) : null;
    html += `<tr>
      <td>${rotulo}</td>
      <td>${a ? a.membroId : "-"}</td>
      <td>${a ? escaparHtmlEbd(a.nome) : "<span class='subtitle'>vago</span>"}</td>
      <td>${a ? escaparHtmlEbd(a.dataInicio) : "-"}</td>
      <td>${a ? (escaparHtmlEbd(a.dataTerminoPrevisao) || "sem prazo") : "-"}</td>
      <td>${a ? badgeSituacaoAssento(a.situacaoEfetiva) : "-"}</td>
      <td>${a && authGeral ? `<button class="btn-link btn-link-perigo" data-on-click="encerrarAssentoDiretoriaAcao" data-args-click="${argsAttr(a.assentoId)}">Encerrar</button>` : ""}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarAssentoDiretoria() {
  const orgaoId = orgaoIdDiretoria();
  const membroId = document.getElementById("assentoDiretoriaMatricula").value;
  const cargoOuFuncao = document.getElementById("assentoDiretoriaCargo").value;
  const duracaoMeses = document.getElementById("assentoDiretoriaDuracaoMeses").value || null;
  const msg = document.getElementById("resultadoAssentoDiretoria");
  if (!orgaoId || !membroId) { msg.textContent = "Informe a matrícula."; return; }
  const res = await fetchProtegido(`${API_BASE}/assentos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, orgaoId, tipoAssento: "FUNCAO", cargoOuFuncao, duracaoMeses })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("assentoDiretoriaMatricula").value = "";
    carregarAssentosDiretoria();
    carregarSucessaoPresidencial();
  }
}

async function encerrarAssentoDiretoriaAcao(assentoId) {
  if (!(await confirmarAcao("Encerrar esta cadeira?", "Encerrar"))) return;
  const res = await fetchProtegido(`${API_BASE}/assentos/${assentoId}/encerrar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarAssentosDiretoria(); carregarSucessaoPresidencial(); }
}

async function carregarSucessaoPresidencial() {
  const container = document.getElementById("resultadoSucessaoPresidencial");
  const res = await fetchProtegido(`${API_BASE}/diretoria/sucessao`);
  const s = await jsonDaTela(res, container, "objeto");
  if (s === null) return;
  if (!s.sucesso) { container.textContent = s.mensagem || ""; return; }

  if (!s.vago) {
    container.innerHTML = `<p>✅ Presidente em exercício: <strong>${escaparHtmlEbd(s.presidente.nome)}</strong> (matrícula ${s.presidente.membroId}).</p>`;
    return;
  }

  const origem = s.interino ? (s.interino.viaCEI ? "via CEI (Art. 32, nenhum Vice-Presidente ativo)" : "próximo na linha sucessória") : "ninguém disponível (nem Vice-Presidente, nem CEI)";
  let html = `<p>⚠️ Presidência vaga desde <strong>${escaparHtmlEbd(s.dataVacancia)}</strong> (${escaparHtmlEbd(s.diasDesdeVacancia)} dia(s)).</p>`;
  html += `<p>Interino: <strong>${s.interino ? escaparHtmlEbd(s.interino.nome) : "-"}</strong> — ${origem}.</p>`;
  html += `<p>${s.prazoIndicacaoCiadseta.vencido ? "🔴" : "🟡"} Prazo de indicação da CIADSETA (90 dias, Art. 32 §2º): ${s.prazoIndicacaoCiadseta.vencido ? "VENCIDO" : "em curso"}.</p>`;
  if (s.prazoAge) {
    html += `<p>${s.prazoAge.vencido ? "🔴" : "🟡"} Prazo de convocação de AGE pela CLI (+30 dias, Art. 32 §3º): ${s.prazoAge.vencido ? "VENCIDO — CLI deve convocar Assembleia" : "em curso"}.</p>`;
  }
  container.innerHTML = html;
}

// Art. 43 §1º — espelha shared/diretoria.js::CARGOS_CONSELHO_FISCAL.
const CARGOS_CONSELHO_FISCAL = {
  TITULAR_1: "1º Titular", TITULAR_2: "2º Titular", TITULAR_3: "3º Titular",
  SUPLENTE_1: "1º Suplente", SUPLENTE_2: "2º Suplente", SUPLENTE_3: "3º Suplente"
};

function orgaoIdConselhoFiscal() {
  const orgao = (window._orgaosReunioesCache || []).find(o => o.sigla === "CONSELHO_FISCAL");
  return orgao ? orgao.orgaoId : null;
}

async function carregarAssentosConselhoFiscal() {
  const select = document.getElementById("assentoCFCargo");
  if (select && !select.dataset.preenchido) {
    select.innerHTML = Object.entries(CARGOS_CONSELHO_FISCAL).map(([sigla, rotulo]) => `<option value="${sigla}">${rotulo}</option>`).join("");
    select.dataset.preenchido = "1";
  }

  const container = document.getElementById("resultadoListaConselhoFiscal");
  const orgaoId = orgaoIdConselhoFiscal();
  if (!orgaoId) return;
  const res = await fetchProtegido(`${API_BASE}/assentos?orgaoId=${orgaoId}`);
  const assentos = await jsonDaTela(res, container, "lista");
  if (assentos === null) return;

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Cargo</th><th>Matrícula</th><th>Nome</th><th>Desde</th><th>Até</th><th>Situação</th><th></th>
  </tr></thead><tbody>`;
  Object.entries(CARGOS_CONSELHO_FISCAL).forEach(([sigla, rotulo]) => {
    const a = Array.isArray(assentos) ? assentos.find(x => x.cargoOuFuncao === sigla) : null;
    html += `<tr>
      <td>${rotulo}</td>
      <td>${a ? a.membroId : "-"}</td>
      <td>${a ? escaparHtmlEbd(a.nome) : "<span class='subtitle'>vago</span>"}</td>
      <td>${a ? escaparHtmlEbd(a.dataInicio) : "-"}</td>
      <td>${a ? (escaparHtmlEbd(a.dataTerminoPrevisao) || "sem prazo") : "-"}</td>
      <td>${a ? badgeSituacaoAssento(a.situacaoEfetiva) : "-"}</td>
      <td>${a && authGeral ? `<button class="btn-link btn-link-perigo" data-on-click="encerrarAssentoConselhoFiscalAcao" data-args-click="${argsAttr(a.assentoId)}">Encerrar</button>` : ""}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarAssentoConselhoFiscal() {
  const orgaoId = orgaoIdConselhoFiscal();
  const membroId = document.getElementById("assentoCFMatricula").value;
  const cargoOuFuncao = document.getElementById("assentoCFCargo").value;
  const duracaoMeses = document.getElementById("assentoCFDuracaoMeses").value || null;
  const msg = document.getElementById("resultadoAssentoCF");
  if (!orgaoId || !membroId) { msg.textContent = "Informe a matrícula."; return; }
  const res = await fetchProtegido(`${API_BASE}/assentos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, orgaoId, tipoAssento: "FUNCAO", cargoOuFuncao, duracaoMeses })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("assentoCFMatricula").value = "";
    carregarAssentosConselhoFiscal();
  }
}

async function encerrarAssentoConselhoFiscalAcao(assentoId) {
  if (!(await confirmarAcao("Encerrar esta cadeira?", "Encerrar"))) return;
  const res = await fetchProtegido(`${API_BASE}/assentos/${assentoId}/encerrar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarAssentosConselhoFiscal();
}

// Art. 88 §1º — espelha shared/diretoria.js::CARGOS_CEI.
const CARGOS_CEI = {
  TITULAR_1: "1º Conselheiro Titular", TITULAR_2: "2º Conselheiro Titular", TITULAR_3: "3º Conselheiro Titular",
  TITULAR_4: "4º Conselheiro Titular", TITULAR_5: "5º Conselheiro Titular", TITULAR_6: "6º Conselheiro Titular",
  TITULAR_7: "7º Conselheiro Titular", SUPLENTE_1: "1º Conselheiro Suplente", SUPLENTE_2: "2º Conselheiro Suplente"
};

function orgaoIdCEI() {
  const orgao = (window._orgaosReunioesCache || []).find(o => o.sigla === "CEI");
  return orgao ? orgao.orgaoId : null;
}

async function carregarAssentosCEI() {
  const select = document.getElementById("assentoCEICargo");
  if (select && !select.dataset.preenchido) {
    select.innerHTML = Object.entries(CARGOS_CEI).map(([sigla, rotulo]) => `<option value="${sigla}">${rotulo}</option>`).join("");
    select.dataset.preenchido = "1";
  }

  const container = document.getElementById("resultadoListaCEI");
  const orgaoId = orgaoIdCEI();
  if (!orgaoId) return;
  const res = await fetchProtegido(`${API_BASE}/assentos?orgaoId=${orgaoId}`);
  const assentos = await jsonDaTela(res, container, "lista");
  if (assentos === null) return;

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Cargo</th><th>Matrícula</th><th>Nome</th><th>Desde</th><th>Até</th><th>Situação</th><th></th>
  </tr></thead><tbody>`;
  Object.entries(CARGOS_CEI).forEach(([sigla, rotulo]) => {
    const a = Array.isArray(assentos) ? assentos.find(x => x.cargoOuFuncao === sigla) : null;
    html += `<tr>
      <td>${rotulo}</td>
      <td>${a ? a.membroId : "-"}</td>
      <td>${a ? escaparHtmlEbd(a.nome) : "<span class='subtitle'>vago</span>"}</td>
      <td>${a ? escaparHtmlEbd(a.dataInicio) : "-"}</td>
      <td>${a ? (escaparHtmlEbd(a.dataTerminoPrevisao) || "sem prazo") : "-"}</td>
      <td>${a ? badgeSituacaoAssento(a.situacaoEfetiva) : "-"}</td>
      <td>${a && authGeral ? `<button class="btn-link btn-link-perigo" data-on-click="encerrarAssentoCEIAcao" data-args-click="${argsAttr(a.assentoId)}">Encerrar</button>` : ""}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function checarElegibilidadeCEIAcao() {
  const membroId = document.getElementById("assentoCEIMatricula").value;
  const msg = document.getElementById("resultadoElegibilidadeCEI");
  if (!membroId) { msg.textContent = "Informe a matrícula antes de checar."; return; }
  const res = await fetchProtegido(`${API_BASE}/elegibilidade-cei/${membroId}`);
  const data = await jsonDaTela(res, msg, "objeto");
  if (data === null) return;
  if (!data.sucesso) { msg.textContent = data.mensagem || "Não foi possível checar."; return; }
  const itens = [
    data.cargoElegivel ? "✅ Cargo ministerial (Oficial Superior ou Presbítero 5+ anos)" : `⚠️ ${data.motivoCargo}`,
    data.formacaoVerificavelOk ? "✅ Formação teológica avançada (AFM + CHM)" : `⚠️ ${data.motivoFormacao}`,
    data.reputacaoIlibada ? "✅ Reputação ilibada (sem sanção/exclusão nos últimos 10 anos)" : `⚠️ ${data.motivoReputacao}`
  ];
  msg.innerHTML = itens.map(i => `<div>${escaparHtmlEbd(i)}</div>`).join("");
}

async function salvarAssentoCEI() {
  const orgaoId = orgaoIdCEI();
  const membroId = document.getElementById("assentoCEIMatricula").value;
  const cargoOuFuncao = document.getElementById("assentoCEICargo").value;
  const duracaoMeses = document.getElementById("assentoCEIDuracaoMeses").value || null;
  const msg = document.getElementById("resultadoAssentoCEI");
  if (!orgaoId || !membroId) { msg.textContent = "Informe a matrícula."; return; }
  const res = await fetchProtegido(`${API_BASE}/assentos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, orgaoId, tipoAssento: "FUNCAO", cargoOuFuncao, duracaoMeses })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("assentoCEIMatricula").value = "";
    document.getElementById("resultadoElegibilidadeCEI").innerHTML = "";
    carregarAssentosCEI();
  }
}

async function encerrarAssentoCEIAcao(assentoId) {
  if (!(await confirmarAcao("Encerrar esta cadeira?", "Encerrar"))) return;
  const res = await fetchProtegido(`${API_BASE}/assentos/${assentoId}/encerrar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarAssentosCEI();
}

async function carregarMedidasCautelares() {
  const container = document.getElementById("resultadoListaCautelares");
  const res = await fetchProtegido(`${API_BASE}/medidas-cautelares`);
  const medidas = await jsonDaTela(res, container, "lista");
  if (medidas === null) return;
  if (!Array.isArray(medidas) || medidas.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma medida cautelar aplicada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Nome</th><th>Motivo</th><th>Restrições</th><th>Aplicada em</th><th>Relatório (30 dias)</th><th></th>
  </tr></thead><tbody>`;
  medidas.forEach(m => {
    const restricoes = [
      m.suspenderAcessoSistema ? "Acesso ao sistema" : null,
      m.suspensaoContasBancarias ? "Contas bancárias" : null,
      m.suspensaoChavesFisicas ? "Chaves físicas" : null
    ].filter(Boolean).join(", ") || "-";
    const relatorio = m.dataConclusaoRelatorio
      ? `Concluído em ${escaparHtmlEbd(m.dataConclusaoRelatorio)}`
      : (m.prazoRelatorioVencido ? `🔴 VENCIDO (${escaparHtmlEbd(m.diasDesdeAplicacao)} dias)` : `🟡 em curso (${escaparHtmlEbd(m.diasDesdeAplicacao)}/${escaparHtmlEbd(m.diasPrazoRelatorio)} dias)`);
    html += `<tr>
      <td>${m.membroId}</td>
      <td>${escaparHtmlEbd(m.nome)}</td>
      <td>${escaparHtmlEbd(m.motivo)}</td>
      <td>${restricoes}</td>
      <td>${escaparHtmlEbd(m.dataAplicacao)}</td>
      <td>${relatorio}</td>
      <td>${authGeral && !m.dataConclusaoRelatorio ? `<button class="btn-link" data-on-click="concluirRelatorioCautelarAcao" data-args-click="${argsAttr(m.medidaId)}">Concluir relatório</button>` : ""}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function aplicarMedidaCautelarAcao() {
  const membroId = document.getElementById("cautelarMatricula").value;
  const motivo = document.getElementById("cautelarMotivo").value;
  const suspenderAcessoSistema = document.getElementById("cautelarSuspenderAcesso").checked;
  const suspensaoContasBancarias = document.getElementById("cautelarSuspenderBancaria").checked;
  const suspensaoChavesFisicas = document.getElementById("cautelarSuspenderChaves").checked;
  const msg = document.getElementById("resultadoCautelar");
  if (!membroId || !motivo) { msg.textContent = "Informe matrícula e motivo."; return; }
  if (!(await confirmarAcao("Aplicar Medida Cautelar de Proteção Patrimonial pra essa pessoa?", "Aplicar"))) return;

  const res = await fetchProtegido(`${API_BASE}/medidas-cautelares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, motivo, suspenderAcessoSistema, suspensaoContasBancarias, suspensaoChavesFisicas })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("cautelarMatricula").value = "";
    document.getElementById("cautelarMotivo").value = "";
    document.getElementById("cautelarSuspenderAcesso").checked = false;
    document.getElementById("cautelarSuspenderBancaria").checked = false;
    document.getElementById("cautelarSuspenderChaves").checked = false;
    carregarMedidasCautelares();
  }
}

async function concluirRelatorioCautelarAcao(medidaId) {
  if (!(await confirmarAcao("Concluir o relatório e registrar a representação à CLI?", "Concluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/medidas-cautelares/${medidaId}/concluir-relatorio`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarMedidasCautelares();
}

async function carregarConvocacoesPendentes() {
  const container = document.getElementById("resultadoConvocacoesPendentes");
  const res = await fetchProtegido(`${API_BASE}/assembleia/convocar`);
  const convocacoes = await jsonDaTela(res, container, "lista");
  if (convocacoes === null) return;
  window._convocacoesPendentesCache = convocacoes;
  if (!Array.isArray(convocacoes) || convocacoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma convocação pendente.</p>";
    return;
  }
  container.innerHTML = convocacoes.map(c => {
    const podeIniciar = c.diasParaPrevista <= 0;
    const contagem = c.diasParaPrevista > 0 ? `faltam ${escaparHtmlEbd(c.diasParaPrevista)} dia(s)` : (c.diasParaPrevista === 0 ? "é hoje" : "data já passou");
    const materiasRotulo = (c.materias || "").split(",").filter(Boolean)
      .map(cod => (ROTULOS_MATERIAS[cod] || cod)).join("; ");
    return `<div class="cartao-convocacao" style="border:1px solid #e5e5e5;border-radius:8px;padding:10px;margin-bottom:8px;">
      <strong>${TITULOS_TIPO_SESSAO[c.tipoSessao] || escaparHtmlEbd(c.tipoSessao)}</strong> — prevista para ${escaparHtmlEbd(c.dataPrevista)} (${contagem})<br/>
      <span class="subtitle">Matérias: ${escaparHtmlEbd(materiasRotulo)}${c.reformaNucleoFundamental ? " (Núcleo Fundamental)" : ""}</span><br/>
      <span class="subtitle">Pauta: ${escaparHtmlEbd(c.pauta)}</span><br/>
      <button class="btn-confirmar" style="width:auto;margin-top:6px;" ${podeIniciar ? "" : "disabled"} data-on-click="iniciarSessaoConvocadaAcao" data-args-click="${argsAttr(c.sessaoId)}">▶️ Iniciar Sessão</button>
      ${authGeral ? `<button class="btn-link" style="margin-left:10px;" data-on-click="editarConvocacaoAcao" data-args-click="${argsAttr(c.sessaoId)}">✏️ Editar</button>
      <button class="btn-link btn-link-perigo" data-on-click="excluirConvocacaoAcao" data-args-click="${argsAttr(c.sessaoId)}">🗑️ Cancelar</button>` : ""}
    </div>`;
  }).join("");
}

const TITULOS_TIPO_SESSAO = { AGO: "AGO", AGE_GERAL: "AGE (assuntos gerais)", AGE_ESPECIAL: "AGE Especial" };
const ROTULOS_MATERIAS = {
  ELEICAO_DIRETORIA_CONSELHO_FISCAL: "Eleição da Diretoria/Conselho Fiscal",
  DESTITUICAO: "Destituição",
  REFORMA_ESTATUTARIA: "Reforma do Estatuto",
  APROVACAO_CONTAS: "Aprovação de contas",
  ALIENACAO_IMOVEL: "Alienação de imóvel",
  HOMOLOGACAO_PASTOR_PRESIDENTE: "Homologação do Pastor Presidente",
  RATIFICACAO_CLI: "Ratificação de deliberação da CLI"
};

function atualizarNucleoFundamentalVisivel() {
  const reformaMarcada = document.getElementById("convocacaoMateriaReforma").checked;
  document.getElementById("convocacaoLabelNucleoFundamental").hidden = !reformaMarcada;
  if (!reformaMarcada) document.getElementById("convocacaoNucleoFundamental").checked = false;
}

// Reaproveita o mesmo formulário pra criar e editar — window._convocacaoEditandoId
// diz qual convocação (se alguma) está sendo editada; null = criando uma nova.
window._convocacaoEditandoId = null;

function preencherFormConvocacao(c) {
  document.getElementById("convocacaoEhAnual").checked = c.tipoSessao === "AGO";
  const materias = (c.materias || "").split(",").filter(Boolean);
  document.querySelectorAll(".convocacao-materia").forEach(chk => { chk.checked = materias.includes(chk.value); });
  atualizarNucleoFundamentalVisivel();
  document.getElementById("convocacaoNucleoFundamental").checked = !!c.reformaNucleoFundamental;
  document.getElementById("convocacaoDataPrevista").value = c.dataPrevista;
  document.getElementById("convocacaoPauta").value = c.pauta;
  document.getElementById("convocacaoMeiosDivulgacao").value = c.meiosDivulgacao || "";
  document.getElementById("convocacaoSenhaAcesso").value = "";
}

function editarConvocacaoAcao(sessaoId) {
  const c = (window._convocacoesPendentesCache || []).find(x => x.sessaoId === sessaoId);
  if (!c) return;
  window._convocacaoEditandoId = sessaoId;
  preencherFormConvocacao(c);
  document.getElementById("convocacaoBotaoSalvar").textContent = "✏️ Salvar Edição";
  document.getElementById("convocacaoBotaoCancelarEdicao").style.display = "inline-block";
  document.getElementById("convocacaoTitulo").textContent = "📋 Editar Convocação";
}

function cancelarEdicaoConvocacaoAcao() {
  window._convocacaoEditandoId = null;
  window._convocacaoVinculadaId = null;
  document.getElementById("convocacaoEhAnual").checked = false;
  document.querySelectorAll(".convocacao-materia").forEach(chk => { chk.checked = false; });
  atualizarNucleoFundamentalVisivel();
  document.getElementById("convocacaoDataPrevista").value = "";
  document.getElementById("convocacaoPauta").value = "";
  document.getElementById("convocacaoMeiosDivulgacao").value = "";
  document.getElementById("convocacaoSenhaAcesso").value = "";
  document.getElementById("convocacaoBotaoSalvar").textContent = "📋 Convocar";
  document.getElementById("convocacaoBotaoCancelarEdicao").style.display = "none";
  document.getElementById("convocacaoTitulo").textContent = "📋 Convocar Assembleia Geral";
}

async function excluirConvocacaoAcao(sessaoId) {
  if (!(await confirmarAcao("Tem certeza que deseja cancelar esta convocação?", "Cancelar"))) return;

  const res = await fetchProtegido(`${API_BASE}/assembleia/convocar/${sessaoId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    if (window._convocacaoEditandoId === sessaoId) cancelarEdicaoConvocacaoAcao();
    carregarConvocacoesPendentes();
  }
}

async function convocarAssembleiaAcao() {
  const ehAnual = document.getElementById("convocacaoEhAnual").checked;
  const materias = Array.from(document.querySelectorAll(".convocacao-materia:checked")).map(chk => chk.value);
  const reformaNucleoFundamental = document.getElementById("convocacaoNucleoFundamental").checked;
  const dataPrevista = document.getElementById("convocacaoDataPrevista").value;
  const pauta = document.getElementById("convocacaoPauta").value;
  const meiosDivulgacao = document.getElementById("convocacaoMeiosDivulgacao").value;
  const senhaAcesso = document.getElementById("convocacaoSenhaAcesso").value;
  if (materias.length === 0) { mostrarToast("Marque ao menos uma matéria (Art. 18).", "erro"); return; }
  if (!dataPrevista || !pauta || !senhaAcesso) { mostrarToast("Preencha data prevista, pauta e senha.", "erro"); return; }

  const editandoId = window._convocacaoEditandoId;
  const url = editandoId ? `${API_BASE}/assembleia/convocar/${editandoId}` : `${API_BASE}/assembleia/convocar`;
  const res = await fetchProtegido(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ materias, reformaNucleoFundamental, ehAnual, dataPrevista, pauta, meiosDivulgacao, senhaAcesso, vinculadaSessaoId: window._convocacaoVinculadaId || null })
  });
  const data = await res.json();
  document.getElementById("resultadoConvocacao").textContent = data.mensagem;
  if (data.sucesso) {
    if (editandoId) cancelarEdicaoConvocacaoAcao();
    else {
      window._convocacaoVinculadaId = null;
      document.getElementById("convocacaoDataPrevista").value = "";
      document.getElementById("convocacaoPauta").value = "";
      document.getElementById("convocacaoMeiosDivulgacao").value = "";
      document.getElementById("convocacaoSenhaAcesso").value = "";
    }
    carregarConvocacoesPendentes();
  }
}

// Reconvocação (Art. 21, II, "c") — abre o formulário de convocar já marcado
// com a mesma matéria de reforma/destituição, ligando à sessão que não bateu
// quórum via vinculadaSessaoId (só liberado 1 vez, validado no back-end).
function reconvocarAssembleiaAcao(sessaoId, materiasCsv) {
  cancelarEdicaoConvocacaoAcao();
  window._convocacaoVinculadaId = sessaoId;
  const materias = (materiasCsv || "").split(",").filter(Boolean);
  document.querySelectorAll(".convocacao-materia").forEach(chk => { chk.checked = materias.includes(chk.value); });
  document.getElementById("convocacaoTitulo").textContent = "📋 Reconvocar (Art. 21, II, \"c\")";
  mostrarToast("Preencha a nova data (mín. 15 dias) e envie — isso reconvoca a sessão anterior.", "sucesso");
}

async function iniciarSessaoConvocadaAcao(sessaoId) {
  const senhaAcesso = await pedirTexto("Senha para a Portaria", "Ex: 1234");
  if (senhaAcesso === null) return;

  const res = await fetchProtegido(`${API_BASE}/reunioes/abrir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessaoId, senhaAcesso })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    carregarConvocacoesPendentes();
    carregarReunioes();
  }
}

async function abrirReuniao() {
  const chave = document.getElementById("reuniaoOrgao").value;
  const descricao = document.getElementById("descricaoReuniao").value;
  const senhaAcesso = document.getElementById("senhaNovaReuniao").value;
  if (!chave || !descricao || !senhaAcesso) { mostrarToast("Escolha o órgão e preencha descrição e senha.", "erro"); return; }
  const [tipo, id] = chave.split(":");
  const body = tipo === "local" ? { orgaoLocalId: id, descricao, senhaAcesso } : { orgaoId: id, descricao, senhaAcesso };

  const res = await fetchProtegido(`${API_BASE}/reunioes/abrir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  document.getElementById("resultadoSecretaria").textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("descricaoReuniao").value = "";
    document.getElementById("senhaNovaReuniao").value = "";
  }
  carregarReunioes();
}

// vB.6 — minuta de ata (.docx): presença/quórum/enquetes já calculados,
// pro Secretário partir dela em vez de redigitar tudo no Word.
async function baixarMinutaAta(sessaoId) {
  const res = await fetchProtegido(`${API_BASE}/reunioes/${sessaoId}/minuta`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    mostrarToast((data && data.mensagem) || "Não foi possível gerar a minuta.", "erro");
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `minuta-sessao-${sessaoId}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function encerrarReuniaoAcao(sessaoId) {
  if (!(await confirmarAcao("Tem certeza que deseja encerrar esta reunião?", "Encerrar"))) return;

  const res = await fetchProtegido(`${API_BASE}/reunioes/${sessaoId}/encerrar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  carregarReunioes();
  if (data.sucesso && sessaoFrequenciaAberta && String(sessaoFrequenciaAberta.sessaoId) === String(sessaoId)) {
    verFrequencia(sessaoId, sessaoFrequenciaAberta.descricao);
  }
}

async function carregarReunioes() {
  const container = document.getElementById("resultadoListaReunioes");
  const chave = document.getElementById("reuniaoOrgao").value;
  const [tipo, id] = (chave || "").split(":");
  const query = tipo === "local" ? `?orgaoLocalId=${id}` : (tipo === "central" ? `?orgaoId=${id}` : "");
  const res = await fetchProtegido(`${API_BASE}/reunioes${query}`);
  const reunioes = await jsonDaTela(res, container, "objeto");
  if (reunioes === null) return;

  if (reunioes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma reunião ainda.</p>";
    return;
  }

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Órgão</th><th>Descrição</th><th>Data</th><th>Status</th><th>Presentes</th><th>Faltas</th><th>Justificadas</th><th></th>
  </tr></thead><tbody>`;

  reunioes.forEach(r => {
    html += `<tr>
      <td>${escaparHtmlEbd(r.orgaoNome) || "-"}</td>
      <td>${escaparHtmlEbd(r.descricao)}</td>
      <td>${escaparHtmlEbd(r.dataSessao)}</td>
      <td>${escaparHtmlEbd(r.status)}</td>
      <td>${escaparHtmlEbd(r.totalPresentes)}</td>
      <td>${escaparHtmlEbd(r.totalFaltas)}</td>
      <td>${escaparHtmlEbd(r.totalJustificadas)}</td>
      <td>
        <button class="btn-link" data-on-click="verFrequencia" data-args-click="${argsAttr(r.sessaoId, String(r.descricao ?? ""))}">Ver frequência</button>
        ${r.status === "ABERTA" ? `<button class="btn-link" data-on-click="encerrarReuniaoAcao" data-args-click="${argsAttr(r.sessaoId)}">Encerrar</button>` : ""}
        <button class="btn-link" data-on-click="baixarMinutaAta" data-args-click="${argsAttr(r.sessaoId)}">📝 Minuta (.docx)</button>
        ${r.orgaoSigla === "ASSEMBLEIA_GERAL" ? `<button class="btn-link" data-on-click="abrirCredenciamentoAssembleia" data-args-click="${argsAttr(r.sessaoId)}">🪪 Credenciamento</button>` : ""}
      </td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

// ---- Credenciamento de Assembleia (vB.13 — Reg. Art. 142-143) ----
// Mesa com trilha: RegistrarPresenca (v2.1) continua sendo o auto-atendimento
// por senha; isto é o fluxo operado pela Secretaria/mesa, que registra
// credenciamento OU recusa (com o artigo), o que faltava até aqui.
window._sessaoCredenciamentoAtual = null;

async function abrirCredenciamentoAssembleia(sessaoId) {
  window._sessaoCredenciamentoAtual = sessaoId;
  document.getElementById("painelCredenciamento").style.display = "block";
  document.getElementById("painelCredenciamento").scrollIntoView({ behavior: "smooth" });
  await carregarCredenciamento();
}

async function carregarCredenciamento() {
  const sessaoId = window._sessaoCredenciamentoAtual;
  if (!sessaoId) return;
  const res = await fetchProtegido(`${API_BASE}/credenciamento/${sessaoId}`);
  const data = await res.json();
  if (data.sucesso === false) {
    document.getElementById("resultadoCredenciamento").textContent = data.mensagem;
    return;
  }

  document.getElementById("avisoProcuracaoCredenciamento").textContent = data.avisoProcuracao;

  const impedidosContainer = document.getElementById("listaImpedidosCredenciamento");
  if (data.impedidos.length === 0) {
    impedidosContainer.innerHTML = "<p class='subtitle'>Nenhum impedimento calculado no momento.</p>";
  } else {
    impedidosContainer.innerHTML = `<table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Motivo</th></tr></thead><tbody>` +
      data.impedidos.map(i => `<tr><td>${escaparHtmlEbd(i.nome)}</td><td>${escaparHtmlEbd(i.motivoArtigo)}: ${escaparHtmlEbd(i.motivoDetalhe)}</td></tr>`).join("") +
      `</tbody></table>`;
  }

  const trilhaContainer = document.getElementById("trilhaCredenciamento");
  if (data.credenciamentos.length === 0) {
    trilhaContainer.innerHTML = "<p class='subtitle'>Nenhum credenciamento operado pela mesa ainda.</p>";
  } else {
    trilhaContainer.innerHTML = `<table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Resultado</th><th>Motivo</th><th>Quando</th></tr></thead><tbody>` +
      data.credenciamentos.map(c => `<tr><td>${escaparHtmlEbd(c.nome)}</td><td>${c.resultado === "CREDENCIADO" ? "✅ Credenciado" : "🚫 Recusado"}</td><td>${c.motivoArtigo ? `${escaparHtmlEbd(c.motivoArtigo)}: ${escaparHtmlEbd(c.motivoDetalhe)}` : "-"}</td><td>${escaparHtmlEbd(c.criadoEm)}</td></tr>`).join("") +
      `</tbody></table>`;
  }

  const relatorioContainer = document.getElementById("relatorioCredenciamento");
  relatorioContainer.textContent = data.relatorio
    ? `📋 Relatório congelado em ${data.relatorio.geradoEm}: ${data.relatorio.totalCredenciados} credenciados, ${data.relatorio.totalImpedidos} recusados na mesa.`
    : "Relatório de credenciamento ainda não foi gerado.";
}

async function credenciarMembroAcao() {
  const sessaoId = window._sessaoCredenciamentoAtual;
  const matricula = document.getElementById("credenciamentoMatricula").value;
  const msg = document.getElementById("resultadoCredenciamento");
  if (!sessaoId || !matricula) { msg.textContent = "Informe a matrícula."; return; }

  const res = await fetchProtegido(`${API_BASE}/credenciamento/${sessaoId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId: matricula })
  });
  const data = await res.json();
  avisarResultado(data);
  document.getElementById("credenciamentoMatricula").value = "";
  carregarCredenciamento();
}

async function gerarRelatorioCredenciamentoAcao() {
  const sessaoId = window._sessaoCredenciamentoAtual;
  if (!sessaoId) return;
  if (!(await confirmarAcao("Gerar o relatório de credenciamento? Uma vez gerado, os totais ficam congelados (não recalculam depois).", "Gerar"))) return;
  const res = await fetchProtegido(`${API_BASE}/credenciamento/${sessaoId}/relatorio`, { method: "POST" });
  const data = await res.json();
  avisarResultado(data);
  carregarCredenciamento();
}

// ---- Elegíveis da Assembleia Geral (fica sempre disponível na aba Reuniões única) ----
let elegiveisAssembleia = [];
let elegiveisFiltrados = [];
let paginaAtualElegiveis = 1;

async function carregarElegiveisAssembleia() {
  const res = await fetchProtegido(`${API_BASE}/assembleia/elegiveis`);
  const lista = await jsonDaTela(res, document.getElementById("resultadoListaElegiveisAssembleia"), "lista");
  if (lista === null) { elegiveisAssembleia = []; return; }
  elegiveisAssembleia = lista;
  aplicarFiltroElegiveis();
}

function aplicarFiltroElegiveis() {
  const busca = (document.getElementById("assembleiaBusca").value || "").toLowerCase();
  elegiveisFiltrados = elegiveisAssembleia.filter(m =>
    !busca || m.nome.toLowerCase().includes(busca) || String(m.membroId).includes(busca)
  );
  paginaAtualElegiveis = 1;
  renderizarElegiveis();
}

function renderizarElegiveis() {
  const container = document.getElementById("resultadoListaElegiveisAssembleia");
  const total = elegiveisFiltrados.length;
  const totalPaginas = Math.max(1, Math.ceil(total / TAM_PAGINA));
  if (paginaAtualElegiveis > totalPaginas) paginaAtualElegiveis = totalPaginas;
  const inicio = (paginaAtualElegiveis - 1) * TAM_PAGINA;
  const pagina = elegiveisFiltrados.slice(inicio, inicio + TAM_PAGINA);

  if (total === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum elegível encontrado.</p>";
    document.getElementById("assembleiaInfo").textContent = "0 elegíveis";
    document.getElementById("assembleiaPaginacao").innerHTML = "";
    return;
  }

  let html = `<table class="tabela-frequencia"><thead><tr><th>Matrícula</th><th>Nome</th><th>Congregação</th></tr></thead><tbody>`;
  pagina.forEach(m => {
    html += `<tr><td>${m.membroId}</td><td>${escaparHtmlEbd(m.nome)}</td><td>${escaparHtmlEbd(m.congregacao) || "-"}</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;

  document.getElementById("assembleiaInfo").textContent = `${total} elegível(is)`;
  document.getElementById("assembleiaPaginacao").innerHTML = `
    <button ${paginaAtualElegiveis === 1 ? "disabled" : ""} data-on-click="mudarPaginaElegiveis" data-args-click="${argsAttr(-1)}">← Anterior</button>
    <span class="info-pagina">Página ${escaparHtmlEbd(paginaAtualElegiveis)} de ${totalPaginas}</span>
    <button ${paginaAtualElegiveis === totalPaginas ? "disabled" : ""} data-on-click="mudarPaginaElegiveis" data-args-click="${argsAttr(1)}">Próxima →</button>`;
}

function mudarPaginaElegiveis(delta) {
  paginaAtualElegiveis += delta;
  renderizarElegiveis();
}

async function verFrequencia(sessaoId, descricao) {
  sessaoFrequenciaAberta = { sessaoId, descricao };
  document.getElementById("blocoFrequencia").style.display = "block";
  document.getElementById("tituloFrequencia").textContent = descricao;

  const res = await fetchProtegido(`${API_BASE}/reunioes/${sessaoId}/frequencia`);
  const data = await res.json();
  const container = document.getElementById("resultadoFrequencia");
  const resumo = document.getElementById("resumoQuorum");
  if (!data.sucesso) {
    container.textContent = data.mensagem;
    resumo.textContent = "";
    return;
  }

  if (data.quorum) {
    const q = data.quorum;
    const situacao = q.quorumAtingido === null ? "" : (q.quorumAtingido ? " — QUÓRUM ATINGIDO ✅" : " — quórum não atingido");
    resumo.textContent = `${q.totalPresentes} de ${q.totalAtivos} esperados presentes (${q.percentualPresenca}%)` +
      (q.quorumMinimoPct != null ? `, mínimo exigido ${q.quorumMinimoPct}%` : "") +
      (q.mensagemQuorum ? ` — ${q.mensagemQuorum}` : situacao);
  }

  // v2.2 — reforma/destituição que não bateu quórum (nem no 2º estágio) pode
  // ser reconvocada 1 única vez (Art. 21, II, "c") — só some da lista depois
  // que a nova convocação vinculada é criada (validado no back-end).
  const podeReconvocar = data.sessao && data.sessao.status === "ENCERRADA" &&
    data.sessao.quorumTipo === "REFORMA_DESTITUICAO" && !data.sessao.vinculadaSessaoId &&
    data.quorum && data.quorum.quorumAtingido === false;
  const botaoReconvocar = document.getElementById("botaoReconvocarAssembleia");
  if (botaoReconvocar) {
    botaoReconvocar.style.display = podeReconvocar ? "inline-block" : "none";
    if (podeReconvocar) {
      botaoReconvocar.onclick = () => reconvocarAssembleiaAcao(sessaoId, data.sessao.materias);
    }
  }

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Nome</th><th>Função</th><th>Status</th><th></th>
  </tr></thead><tbody>`;

  data.frequencia.forEach(item => {
    const podeJustificar = !item.presente && !item.faltaJustificada;
    const botaoCorrigir = item.presente
      ? `<button class="btn-link" data-on-click="marcarPresencaManual" data-args-click="${argsAttr(sessaoId, item.membroId, false)}">Marcar falta</button>`
      : `<button class="btn-link" data-on-click="marcarPresencaManual" data-args-click="${argsAttr(sessaoId, item.membroId, true)}">Marcar presente</button>`;
    const pendenteHtml = item.justificativaPendente
      ? `<div class="tag-pendente">Pedido: "${escaparHtmlEbd(item.justificativaPendente)}"</div>
         <button class="btn-link btn-link-sucesso" data-on-click="aprovarJustificativaPendente" data-args-click="${argsAttr(sessaoId, item.membroId, String(item.justificativaPendente ?? ""))}">Aprovar</button>
         <button class="btn-link btn-link-perigo" data-on-click="rejeitarJustificativaAcao" data-args-click="${argsAttr(sessaoId, item.membroId)}">Rejeitar</button>`
      : "";
    html += `<tr>
      <td>${item.membroId}</td>
      <td>${escaparHtmlEbd(item.nome)}</td>
      <td>${escaparHtmlEbd(item.funcao) || "-"}</td>
      <td>${statusFrequencia(item)}</td>
      <td>${podeJustificar ? `<button class="btn-link" data-on-click="justificarFalta" data-args-click="${argsAttr(sessaoId, item.membroId)}">Justificar</button>` : ""} ${botaoCorrigir}${pendenteHtml}</td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

async function justificarFalta(sessaoId, membroId) {
  const motivo = await pedirTexto("Motivo da justificativa", "Ex: estava viajando a trabalho");
  if (motivo === null) return;

  const res = await fetchProtegido(`${API_BASE}/reunioes/${sessaoId}/justificar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) verFrequencia(sessaoId, sessaoFrequenciaAberta.descricao);
}

// Aprova um pedido que o próprio obreiro enviou pelo painel pessoal — reaproveita
// o mesmo endpoint de justificar, só pré-preenchendo com o motivo que ele mandou.
async function aprovarJustificativaPendente(sessaoId, membroId, motivoSugerido) {
  const motivo = await pedirTexto("Aprovar justificativa", "Motivo", motivoSugerido);
  if (motivo === null) return;

  const res = await fetchProtegido(`${API_BASE}/reunioes/${sessaoId}/justificar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) verFrequencia(sessaoId, sessaoFrequenciaAberta.descricao);
}

async function rejeitarJustificativaAcao(sessaoId, membroId) {
  if (!(await confirmarAcao("Confirma rejeitar este pedido de justificativa? A falta continua sem justificar.", "Rejeitar"))) return;

  const res = await fetchProtegido(`${API_BASE}/reunioes/${sessaoId}/rejeitar-justificativa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) verFrequencia(sessaoId, sessaoFrequenciaAberta.descricao);
}

async function marcarPresencaManual(sessaoId, membroId, presente) {
  const acao = presente ? "marcar como PRESENTE" : "marcar como FALTA";
  if (!(await confirmarAcao(`Confirma ${acao} este obreiro nesta reunião?`))) return;

  const res = await fetchProtegido(`${API_BASE}/reunioes/${sessaoId}/presenca-manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, presente })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) verFrequencia(sessaoId, sessaoFrequenciaAberta.descricao);
}

registrarAcoes({
  abrirCredenciamentoAssembleia, abrirReuniao, aplicarFiltroElegiveis, aplicarMedidaCautelarAcao, aprovarJustificativaPendente,
  atualizarNucleoFundamentalVisivel, baixarMinutaAta, cancelarEdicaoConvocacaoAcao, checarElegibilidadeCEIAcao, concluirRelatorioCautelarAcao,
  convocarAssembleiaAcao, credenciarMembroAcao, editarConvocacaoAcao, emitirParecerAcao, encerrarAssentoCEIAcao, encerrarAssentoConselhoFiscalAcao,
  encerrarAssentoDiretoriaAcao, encerrarReuniaoAcao, excluirConvocacaoAcao, gerarRelatorioCredenciamentoAcao, iniciarSessaoConvocadaAcao,
  justificarFalta, marcarPresencaManual, marcarUrgenciaAcao, mudarPaginaElegiveis, rejeitarJustificativaAcao, salvarAssentoCEI,
  salvarAssentoConselhoFiscal, salvarAssentoDiretoria, salvarProjeto, verFrequencia
});
