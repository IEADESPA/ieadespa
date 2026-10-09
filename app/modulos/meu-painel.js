// app/modulos/meu-painel.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- ABA MEU PAINEL: minha frequência (mesma consulta pública de sempre, só por matrícula) ----
async function carregarPainelPessoal(matricula) {
  matricula = matricula || authMatricula;
  const container = document.getElementById("resultadoPainelPessoal");
  const cartao = document.getElementById("cartaoPerfilPessoal");
  const stats = document.getElementById("resumoStatsPessoal");
  if (!matricula) return;

  const res = await fetchProtegido(`${API_BASE}/membros/${matricula}/frequencia`);
  const data = await res.json();
  if (!data.sucesso) {
    cartao.innerHTML = "";
    stats.innerHTML = "";
    container.textContent = data.mensagem;
    return;
  }

  cartao.innerHTML = `
    <div class="cartao-perfil">
      <p class="nome-perfil">${escaparHtmlEbd(data.membro.nome)}</p>
      <p class="linha-perfil">Matrícula ${data.membro.membroId} · ${escaparHtmlEbd(data.membro.funcao) || "sem função cadastrada"}</p>
      <p class="linha-perfil">${escaparHtmlEbd(data.membro.congregacao) || "sem congregação cadastrada"} · ${badgeStatusPessoa(data.membro.status)}</p>
    </div>`;

  const orgaosContainer = document.getElementById("cartaoMeusOrgaos");
  orgaosContainer.innerHTML = (data.assentos && data.assentos.length)
    ? `<div class="cartao-perfil"><p class="linha-perfil"><strong>Meus órgãos:</strong> ${data.assentos.map(a => `${escaparHtmlEbd(a.orgao)}${a.cargoOuFuncao ? " — " + escaparHtmlEbd(a.cargoOuFuncao) : ""}`).join(" · ")}</p></div>`
    : "";

  const r = data.resumo;
  stats.innerHTML = `
    <div class="resumo-stats">
      <div class="stat-tile"><div class="stat-valor">${escaparHtmlEbd(r.totalReunioes)}</div><div class="stat-rotulo">Reuniões</div></div>
      <div class="stat-tile"><div class="stat-valor">${escaparHtmlEbd(r.totalPresencas)}</div><div class="stat-rotulo">Presenças</div></div>
      <div class="stat-tile"><div class="stat-valor">${escaparHtmlEbd(r.totalFaltas)}</div><div class="stat-rotulo">Faltas</div></div>
      <div class="stat-tile"><div class="stat-valor">${escaparHtmlEbd(r.totalJustificadas)}</div><div class="stat-rotulo">Justificadas</div></div>
      <div class="stat-tile"><div class="stat-valor">${r.percentualPresenca != null ? escaparHtmlEbd(r.percentualPresenca) + "%" : "-"}</div><div class="stat-rotulo">Presença</div></div>
    </div>`;

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Data</th><th>Reunião</th><th>Status</th><th>Ação</th>
  </tr></thead><tbody>`;

  data.historico.forEach(item => {
    let acaoHtml = "";
    if (!item.presente && !item.faltaJustificada) {
      acaoHtml = item.justificativaPendente
        ? `<span class="tag-pendente">Aguardando aprovação</span>`
        : `<button class="btn-justificar" data-on-click="solicitarJustificativaAcao" data-args-click="${argsAttr(String(matricula ?? ""), item.sessaoId)}">✍️ Justificar falta</button>`;
    }
    html += `<tr>
      <td>${escaparHtmlEbd(item.dataSessao) || "-"}</td>
      <td>${escaparHtmlEbd(item.descricao) || "-"}</td>
      <td>${statusFrequencia(item)}</td>
      <td>${acaoHtml}</td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;

  carregarConsentimentoLGPD(matricula);
  carregarMinhasSolicitacoesLGPD(matricula);
}

async function solicitarJustificativaAcao(matricula, sessaoId) {
  const motivo = await pedirTexto("Justificar falta", "Explique por que você não pôde comparecer");
  if (motivo === null) return;

  const res = await fetchProtegido(`${API_BASE}/membros/${matricula}/reunioes/${sessaoId}/solicitar-justificativa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarPainelPessoal();
}

// ==================== LGPD: auto-atendimento (Meu Painel) ====================
function badgeStatusLgpd(status) {
  const classes = { PENDENTE: "badge-licenca", EM_ANALISE: "badge-licenca", ATENDIDA: "badge-ativo", NEGADA: "badge-desligado" };
  const rotulos = { PENDENTE: "Pendente", EM_ANALISE: "Em análise", ATENDIDA: "Atendida", NEGADA: "Negada" };
  return `<span class="badge-status ${classes[status] || ""}">${rotulos[status] || escaparHtmlEbd(status)}</span>`;
}

async function carregarConsentimentoLGPD(matricula) {
  matricula = matricula || authMatricula;
  const chk = document.getElementById("consentimentoDadosContato");
  const msg = document.getElementById("resultadoConsentimentoLGPD");
  if (!matricula || !chk) return;
  const res = await fetchProtegido(`${API_BASE}/lgpd/consentimento/${matricula}`);
  const data = await res.json();
  if (!data.sucesso) return;
  const atual = (data.consentimentos || []).find(c => c.tipo === "DADOS_CONTATO");
  chk.checked = !!(atual && atual.concedido);
  msg.textContent = atual ? `Última atualização: ${new Date(atual.dataRegistro).toLocaleString("pt-BR")}` : "Ainda não registrado.";
}

async function salvarConsentimentoLGPD() {
  const matricula = authMatricula;
  const chk = document.getElementById("consentimentoDadosContato");
  if (!matricula) return;
  const res = await fetchProtegido(`${API_BASE}/lgpd/consentimento/${matricula}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo: "DADOS_CONTATO", concedido: chk.checked })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarConsentimentoLGPD(matricula);
}

// Formata um valor de "Meus Dados" pra exibição — nunca null/vazio cru, nunca
// chave de código aparecendo em tela. Datas em ISO (YYYY-MM-DD ou timestamp)
// viram pt-BR; o resto some com "-" quando vazio.
function formatarValorLgpd(valor, tipo) {
  if (valor === null || valor === undefined || valor === "") return "-";
  if (tipo === "data") {
    const d = new Date(valor);
    return isNaN(d) ? "-" : d.toLocaleDateString("pt-BR");
  }
  if (tipo === "dataHora") {
    const d = new Date(valor);
    return isNaN(d) ? "-" : d.toLocaleString("pt-BR");
  }
  if (tipo === "bit") return valor ? "Sim" : "Não";
  return escaparHtmlEbd(String(valor));        // vai direto para innerHTML: nome, endereço e demais textos digitados não podem virar marcação
}

function linhaLgpd(rotulo, valor, tipo) {
  return `<p class="linha-perfil"><strong>${rotulo}:</strong> ${formatarValorLgpd(valor, tipo)}</p>`;
}

async function alternarMeusDadosLGPD() {
  const caixa = document.getElementById("cxMeusDadosLGPD");
  const abrindo = caixa.style.display === "none";
  caixa.style.display = abrindo ? "block" : "none";
  if (!abrindo) return;

  // v7.5 — a rota exige a sessão e só entrega a matrícula da própria sessão (fetchProtegido manda o token).
  let data;
  try { data = await (await fetchProtegido(`${API_BASE}/lgpd/meus-dados/${authMatricula}`)).json(); }
  catch (_) { caixa.innerHTML = `<p class="subtitle">Não foi possível carregar os seus dados agora. Tente de novo.</p>`; return; }

  // vB.8 — o direito de acesso (Art. 18) não depende mais de consentimento
  // nenhum (base legal era errada); só falha se a matrícula não existir.
  if (!data.sucesso) { caixa.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem || "Não foi possível carregar os seus dados.")}</p>`; return; }

  const m = data.membro;
  const ROTULO_MODALIDADE = { CIVIL_E_RELIGIOSO: "Civil e Religioso", SOMENTE_RELIGIOSO: "Somente Religioso" };
  const ROTULO_STATUS_LIC = { EM_LICENCA: "Em licença", RETORNOU: "Retornou", NAO_RETORNOU: "Não retornou" };

  caixa.innerHTML = `
    <div class="cartao-perfil">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Dados Cadastrais</h4>
      ${m.fotoUrl ? `<img src="${urlSegura(m.fotoUrl)}" alt="Foto" style="max-width:120px;border-radius:8px;margin-bottom:8px;" />` : ""}
      ${linhaLgpd("Nome", m.nome)}
      ${linhaLgpd("Congregação", m.congregacao)}
      ${linhaLgpd("Extensão da Tenda", m.extensao)}
      ${linhaLgpd("Status", m.status)}
      ${linhaLgpd("Situação", m.situacaoMembro)}
      ${linhaLgpd("Data de Nascimento", m.dataNascimento, "data")}
      ${linhaLgpd("Data de Admissão", m.dataAdmissao, "data")}
      ${linhaLgpd("Forma de Admissão", m.formaAdmissao)}
      ${linhaLgpd("Origem/Procedência", m.origem)}
      ${linhaLgpd("Igreja Anterior", m.igrejaAnterior)}
      ${linhaLgpd("Data do Batismo", m.dataBatismo, "data")}
      ${linhaLgpd("Data do Rito de Recebimento", m.dataRitoRecebimento, "data")}
      ${linhaLgpd("Nome Lido no Rito", m.nomeLidoRito)}
      ${linhaLgpd("Ministrante do Rito", m.ministranteRito)}
      ${linhaLgpd("Telefone", m.telefone)}
      ${linhaLgpd("E-mail", m.email)}
      ${linhaLgpd("Endereço", m.endereco)}
      ${linhaLgpd("Cadastrado em", m.criadoEm, "dataHora")}
    </div>

    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Dados Ministeriais</h4>
      ${linhaLgpd("Função", m.funcao)}
      ${linhaLgpd("Cargo Ministerial", m.cargoMinisterial)}
      ${linhaLgpd("Departamento", m.departamento)}
      ${linhaLgpd("Dizimista Fiel", m.dizimistaFiel, "bit")}
    </div>

    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Acessos e Vínculos</h4>
      ${linhaLgpd("Acessos (liderança)", data.liderancas.map(l => l.papel).join(", "))}
      ${linhaLgpd("Assentos em órgãos", data.assentos.map(a => `${a.orgao}${a.cargoOuFuncao ? " — " + a.cargoOuFuncao : ""}`).join(", "))}
      ${linhaLgpd("Vínculos familiares", data.vinculosFamiliares.map(v => `${v.parente} (${v.vinculo})`).join(", "))}
      ${linhaLgpd("Processos disciplinares", data.processosDisciplinares.length ? `${data.processosDisciplinares.length} registrado(s)` : null)}
    </div>

    ${data.casamentos.length ? `
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Casamentos</h4>
      ${data.casamentos.map(c => `<p class="linha-perfil">${formatarValorLgpd(c.dataCasamento, "data")} · ${escaparHtmlEbd(c.conjuge) || "-"} · ${ROTULO_MODALIDADE[c.modalidade] || escaparHtmlEbd(c.modalidade)}</p>`).join("")}
    </div>` : ""}

    ${data.licencasCandidatura.length ? `
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Licenças por Candidatura</h4>
      ${data.licencasCandidatura.map(l => `<p class="linha-perfil">Pleito em ${formatarValorLgpd(l.dataPleito, "data")} · ${ROTULO_STATUS_LIC[l.status] || escaparHtmlEbd(l.status)}</p>`).join("")}
    </div>` : ""}

    ${volCartaoMeusDados(data.voluntariado)}
    ${mnrCartaoConsentimentosMeusDados(data.consentimentosMenores)}
    ${mnrCartaoMeusDados(data.ministerioMenores)}

    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Consentimentos LGPD</h4>
      ${data.consentimentos.map(c => `<p class="linha-perfil">${escaparHtmlEbd(c.tipo)} — ${c.concedido ? "✅ Concedido" : "❌ Revogado"} em ${formatarValorLgpd(c.dataRegistro, "dataHora")}</p>`).join("") || "<p class='subtitle'>Nenhum registrado.</p>"}
    </div>

    <p class="subtitle" style="margin-top:12px;">Gerado em ${formatarValorLgpd(data.geradoEm, "dataHora")}. Precisa de uma cópia formal? Use "Enviar pedido" abaixo com o tipo "Portabilidade".</p>`;
}

// v7.5 — o que o voluntariado guarda da pessoa, em "Meus Dados" (LGPD art. 18, I). Só aparece quando há algo. Tudo escapado: o nome do responsável, a referência
// da ficha e o motivo da indisponibilidade são texto digitado.
function volCartaoMeusDados(v) {
  if (!v) return "";
  const a = v.adesao;
  const lista = (x) => Array.isArray(x) ? x : [];
  const temAlgo = a || lista(v.equipes).length || lista(v.servicos).length || lista(v.indisponibilidades).length || lista(v.remocoesDaEscala).length || lista(v.gruposDeRodizio).length;
  if (!temAlgo) return "";
  const linha = (rotulo, valor) => valor === null || valor === undefined || valor === "" ? "" : `<p class="linha-perfil"><strong>${volEsc(rotulo)}:</strong> ${volEsc(valor)}</p>`;
  const itens = (titulo, linhas) => linhas.length ? `<p class="linha-perfil"><strong>${volEsc(titulo)}:</strong></p><ul class="vol-lista">${linhas.map(l => `<li>${l}</li>`).join("")}</ul>` : "";
  const adesao = a ? `
      ${linha("Adesão ao Termo", `${a.rotuloForma || a.forma} em ${volDataParede(a.dataAceite)}${a.termoVersao ? ` (versão ${a.termoVersao} do texto)` : ""}`)}
      ${linha("Instante do aceite", a.aceitoEm ? volDataInstante(a.aceitoEm) : "")}
      ${linha("IP do aceite", a.enderecoIp)}
      ${linha("Cabeçalhos de conexão guardados", a.cadeiaCabecalhos)}
      ${linha("Referência do documento", a.referencia)}
      ${linha("Responsável que assinou", a.responsavelNome ? `${a.responsavelNome} (${a.responsavelVinculo || "responsável"})` : "")}` : "";
  return `
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Voluntariado</h4>
      ${adesao}
      ${itens("Equipes", lista(v.equipes).map(e => `${volEsc(e.equipe)}${e.congregacao ? ` — ${volEsc(e.congregacao)}` : ""}${e.ativo ? "" : " (inativa)"}`))}
      ${itens("Grupos de rodízio", lista(v.gruposDeRodizio).map(g => `${volEsc(g.rodizio)} — ${volEsc(g.grupo)}${g.saiuEm ? ` (saiu em ${volDataInstante(g.saiuEm)})` : ""}`))}
      ${itens("Serviços escalados", lista(v.servicos).map(s => `${volDataHora(s.dataHora)} — ${volEsc(s.equipe)}${s.descricao ? `: ${volEsc(s.descricao)}` : ""} (${volEsc(s.situacao)})`))}
      ${itens("Indisponibilidades", lista(v.indisponibilidades).map(i => `${volDataParede(i.dataInicio)} a ${volDataParede(i.dataFim)}${i.motivo ? ` — ${volEsc(i.motivo)}` : ""}`))}
      ${itens("Remoções da escala", lista(v.remocoesDaEscala).map(r => `${volDataInstante(r.em)}${r.equipe ? ` — ${volEsc(r.equipe)}` : ""}${r.removidoDaEscala ? "" : " (apenas desligamento)"}${r.reintegradoEm ? `, reintegrado em ${volDataInstante(r.reintegradoEm)}` : ""}`))}
      ${v.aviso ? `<p class="subtitle">${volEsc(v.aviso)}</p>` : ""}
    </div>`;
}

async function criarSolicitacaoLGPD() {
  const matricula = authMatricula;
  const tipo = document.getElementById("solicitacaoLgpdTipo").value;
  const descricao = document.getElementById("solicitacaoLgpdDescricao").value;
  if (!matricula) return;
  const res = await fetchProtegido(`${API_BASE}/lgpd/solicitacoes/${matricula}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo, descricao })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("solicitacaoLgpdDescricao").value = "";
    carregarMinhasSolicitacoesLGPD(matricula);
  }
}

async function carregarMinhasSolicitacoesLGPD(matricula) {
  matricula = matricula || authMatricula;
  const container = document.getElementById("resultadoListaSolicitacoesLGPD");
  if (!matricula || !container) return;
  const res = await fetchProtegido(`${API_BASE}/lgpd/solicitacoes/${matricula}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (!data.sucesso || data.solicitacoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma solicitação enviada ainda.</p>";
    return;
  }
  let html = "<table class='tabela-frequencia'><thead><tr><th>Tipo</th><th>Data</th><th>Status</th><th>Resposta</th></tr></thead><tbody>";
  data.solicitacoes.forEach(s => {
    html += `<tr>
      <td>${escaparHtmlEbd(s.tipo)}</td>
      <td>${new Date(s.dataSolicitacao).toLocaleDateString("pt-BR")}</td>
      <td>${badgeStatusLgpd(s.status)}</td>
      <td>${escaparHtmlEbd(s.respostaTexto) || "-"}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

// ==================== ABA: AUDITORIA ====================
async function carregarAuditoria() {
  const tabela = document.getElementById("auditoriaFiltroTabela").value.trim();
  const usuarioId = document.getElementById("auditoriaFiltroUsuario").value.trim();
  const de = document.getElementById("auditoriaFiltroDe").value;
  const ate = document.getElementById("auditoriaFiltroAte").value;
  const params = new URLSearchParams();
  if (tabela) params.set("tabela", tabela);
  if (usuarioId) params.set("usuarioId", usuarioId);
  if (de) params.set("de", `${de}T00:00:00`);
  if (ate) params.set("ate", `${ate}T23:59:59`);

  const res = await fetchProtegido(`${API_BASE}/auditoria?${params.toString()}`);
  const container = document.getElementById("resultadoListaAuditoria");
  const registros = await jsonDaTela(res, container, "lista");
  if (registros === null) return;
  if (!Array.isArray(registros) || registros.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum registro encontrado.</p>";
    return;
  }
  let html = "<table class='tabela-frequencia'><thead><tr><th>Quando</th><th>Tabela</th><th>Registro</th><th>Ação</th><th>Quem</th></tr></thead><tbody>";
  registros.forEach(a => {
    html += `<tr>
      <td>${new Date(a.dataHora).toLocaleString("pt-BR")}</td>
      <td>${escaparHtmlEbd(a.tabela)}</td>
      <td>${a.registroId ?? "-"}</td>
      <td>${escaparHtmlEbd(a.acao)}</td>
      <td>${a.usuarioNome ? `${escaparHtmlEbd(a.usuarioNome)} (${a.usuarioId})` : (a.usuarioId ?? "-")}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

// ==================== ABA: AUDITORIA — COMPLIANCE E INDICADORES (v4.12) ====================
async function carregarIndicadoresAcao() {
  const container = document.getElementById("resultadoIndicadores");
  const res = await fetchProtegido(`${API_BASE}/indicadores-financeiros`);
  const d = await jsonDaTela(res, container, "objeto");
  if (d === null) return;
  const alvoAtividadesFim = d.indiceAplicacaoAtividadesFim >= 70 && d.indiceAplicacaoAtividadesFim <= 80;
  const alvoReserva = d.mesesReservaCaixa >= 3;
  container.innerHTML = `<table class="tabela-frequencia"><tbody>
    <tr><td>Meses de Reserva de Caixa (meta 3)</td><td>${Number(d.mesesReservaCaixa).toFixed(2)}${alvoReserva ? " ✅" : " ⚠️"}</td></tr>
    <tr><td>Índice de Aplicação em Atividades-Fim (meta 70-80%)</td><td>${Number(d.indiceAplicacaoAtividadesFim).toFixed(2)}%${alvoAtividadesFim ? " ✅" : " ⚠️"}</td></tr>
    <tr><td>Índice de Liquidez</td><td>${Number(d.indiceLiquidez).toFixed(2)}</td></tr>
    <tr><td>Ativo Total / Passivo Total</td><td>R$ ${Number(d.ativoTotal).toFixed(2)} / R$ ${Number(d.passivoTotal).toFixed(2)}</td></tr>
    <tr><td>Patrimônio Líquido</td><td>R$ ${Number(d.patrimonioLiquido).toFixed(2)}</td></tr>
  </tbody></table>`;
}

async function carregarAlertasComplianceAcao() {
  const container = document.getElementById("resultadoAlertasCompliance");
  const res = await fetchProtegido(`${API_BASE}/compliance/alertas`);
  const d = await jsonDaTela(res, container, "objeto");
  if (d === null) return;
  const lista = d.alertas || [];
  if (lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum alerta ativo. ✅</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Severidade</th><th>Tipo</th><th>Descrição</th><th></th></tr></thead><tbody>`;
  lista.forEach(a => html += `<tr><td>${escaparHtmlEbd(a.severidade)}</td><td>${escaparHtmlEbd(a.tipo)}</td><td>${escaparHtmlEbd(a.descricao)}</td><td><button class="btn-link" data-on-click="resolverAlertaComplianceAcao" data-args-click="${argsAttr(a.alertaId)}">Resolver</button></td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function resolverAlertaComplianceAcao(alertaId) {
  const res = await fetchProtegido(`${API_BASE}/compliance/alertas`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alertaId, acao: "RESOLVER" }) });
  const d = await res.json();
  avisarResultado(d);
  carregarAlertasComplianceAcao();
}

async function carregarCongregacoesPrestacaoAcao() {
  const select = document.getElementById("prestacaoCongregacao");
  const res = await fetchProtegido(`${API_BASE}/catalogos/congregacoes`);
  const lista = await jsonDaTela(res, select, "lista");
  if (lista === null) return;
  select.innerHTML = (Array.isArray(lista) ? lista.filter(c => c.ativa !== false).map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("") : "");
}

async function registrarPrestacaoContasAcao() {
  const congregacaoId = document.getElementById("prestacaoCongregacao").value;
  const mesReferencia = document.getElementById("prestacaoMes").value;
  const agua = document.getElementById("prestacaoAgua").files[0];
  const luz = document.getElementById("prestacaoLuz").files[0];
  const resultado = document.getElementById("resultadoPrestacao");
  if (!congregacaoId || !mesReferencia) { resultado.textContent = "Informe congregação e mês."; return; }
  const body = { congregacaoId: Number(congregacaoId), mesReferencia };
  if (agua) { body.comprovanteAguaBase64 = await arquivoParaBase64(agua); body.mimeTypeAgua = agua.type; }
  if (luz) { body.comprovanteLuzBase64 = await arquivoParaBase64(luz); body.mimeTypeLuz = luz.type; }
  const res = await fetchProtegido(`${API_BASE}/prestacoes-contas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  avisarResultado(d);
  resultado.textContent = d.mensagem;
  carregarPrestacoesContasAcao();
}

async function carregarPrestacoesContasAcao() {
  const container = document.getElementById("resultadoPrestacoesContas");
  const res = await fetchProtegido(`${API_BASE}/prestacoes-contas`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma prestação registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Mês</th><th>Água</th><th>Luz</th><th>Status</th><th>Repasse</th></tr></thead><tbody>`;
  lista.forEach(p => html += `<tr><td>${escaparHtmlEbd(p.congregacaoNome)}</td><td>${escaparHtmlEbd(p.mesReferencia)}</td><td>${p.temAgua ? "✅" : "❌"}</td><td>${p.temLuz ? "✅" : "❌"}</td><td>${escaparHtmlEbd(p.status)}</td><td>${p.bloqueioRepasse ? "🔒 bloqueado" : "liberado"}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

// ==================== ABA: AUDITORIA — RECERTIFICAÇÃO DE ACESSOS (v4.12) ====================
async function carregarRecertificacoesAcao() {
  const container = document.getElementById("resultadoRecertificacoes");
  const res = await fetchProtegido(`${API_BASE}/compliance/recertificacoes`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma recertificação pendente.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Pessoa</th><th>Papel</th><th>Permissão</th><th>Prazo</th><th>Status</th><th>Ações</th></tr></thead><tbody>`;
  lista.forEach(r => {
    let acoes = "-";
    if (r.status === "PENDENTE") {
      acoes = `<button class="btn-link" data-on-click="decidirRecertificacaoAcao" data-args-click="${argsAttr(r.recertificacaoId, "CONFIRMAR")}">Recertificar</button>
               <button class="btn-link btn-link-perigo" data-on-click="decidirRecertificacaoAcao" data-args-click="${argsAttr(r.recertificacaoId, "EXPIRAR")}">Expirar</button>`;
    }
    html += `<tr><td>${escaparHtmlEbd(r.nome)}</td><td>${escaparHtmlEbd(r.papelNome)}</td><td>${escaparHtmlEbd(r.permissao)}</td><td>${new Date(r.prazo).toLocaleDateString("pt-BR")}</td><td>${escaparHtmlEbd(r.status)}</td><td class="acoes-inline">${acoes}</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function decidirRecertificacaoAcao(recertificacaoId, acao) {
  if (acao === "EXPIRAR" && !(await confirmarAcao("Marcar este acesso como expirado (não recertificado)?", "Expirar"))) return;
  const res = await fetchProtegido(`${API_BASE}/compliance/recertificacoes`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recertificacaoId, acao }) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarRecertificacoesAcao();
}

// ==================== ABA: AUDITORIA — CADEIA DE HASH E ANCORAGEM EXTERNA (v4.12) ====================
async function verificarCadeiaAuditoriaAcao() {
  const msg = document.getElementById("resultadoCadeiaAuditoria");
  const res = await fetchProtegido(`${API_BASE}/auditoria/cadeia`);
  const d = await res.json();
  msg.textContent = d.integra
    ? `✅ Cadeia íntegra — ${d.total} registro(s) verificado(s).`
    : `⚠️ Cadeia VIOLADA — registro(s) quebrado(s): ${(d.quebrados || []).join(", ")}.`;
}

async function carregarAncoragensAcao() {
  const container = document.getElementById("resultadoAncoragens");
  const res = await fetchProtegido(`${API_BASE}/auditoria/ancoragens`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma ancoragem externa registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Quando</th><th>Método</th><th>Hash ancorado</th></tr></thead><tbody>`;
  lista.forEach(a => html += `<tr><td>${new Date(a.criadoEm).toLocaleString("pt-BR")}</td><td>${escaparHtmlEbd(a.metodo)}</td><td style="font-family:monospace;font-size:0.85em;">${escaparHtmlEbd(a.hashAncorado)}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarAncoragemAcao() {
  const metodo = document.getElementById("ancoragemMetodo").value;
  const hashAncorado = document.getElementById("ancoragemHash").value.trim();
  const arquivo = document.getElementById("ancoragemComprovante").files[0];
  const body = { metodo };
  if (hashAncorado) body.hashAncorado = hashAncorado;
  if (arquivo) { body.comprovanteBase64 = await arquivoParaBase64(arquivo); body.mimeType = arquivo.type; }
  const res = await fetchProtegido(`${API_BASE}/auditoria/ancoragens`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("ancoragemHash").value = "";
    document.getElementById("ancoragemComprovante").value = "";
    carregarAncoragensAcao();
  }
}

// ==================== ABA: AUDITORIA — AUDITORIA EM 3 NÍVEIS (v4.12) ====================
async function carregarAuditoriasNiveisAcao() {
  const container = document.getElementById("resultadoAuditoriasNiveis");
  const res = await fetchProtegido(`${API_BASE}/auditoria/niveis`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma auditoria registrada.</p>";
    return;
  }
  // Este recurso responde com SELECT * (colunas em PascalCase), diferente
  // dos demais endpoints do módulo que aliasam pra camelCase.
  let html = `<table class="tabela-frequencia"><thead><tr><th>Nível</th><th>Título</th><th>Ano</th><th>Status</th><th>Conclusão</th></tr></thead><tbody>`;
  lista.forEach(a => html += `<tr><td>${escaparHtmlEbd(a.Nivel)}</td><td>${escaparHtmlEbd(a.Titulo)}</td><td>${escaparHtmlEbd(a.AnoReferencia)}</td><td>${escaparHtmlEbd(a.Status)}</td><td>${escaparHtmlEbd(a.Conclusao) || "-"}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarAuditoriaNivelAcao() {
  const nivel = document.getElementById("auditoriaNivelNivel").value;
  const titulo = document.getElementById("auditoriaNivelTitulo").value.trim();
  const anoReferencia = document.getElementById("auditoriaNivelAno").value;
  const conclusao = document.getElementById("auditoriaNivelConclusao").value.trim();
  const arquivo = document.getElementById("auditoriaNivelDocumento").files[0];
  if (!titulo || !anoReferencia) { mostrarToast("Informe título e ano de referência.", "erro"); return; }
  const body = { nivel, titulo, anoReferencia: Number(anoReferencia) };
  if (conclusao) body.conclusao = conclusao;
  if (arquivo) { body.documentoBase64 = await arquivoParaBase64(arquivo); body.mimeType = arquivo.type; }
  const res = await fetchProtegido(`${API_BASE}/auditoria/niveis`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("auditoriaNivelTitulo").value = "";
    document.getElementById("auditoriaNivelAno").value = "";
    document.getElementById("auditoriaNivelConclusao").value = "";
    document.getElementById("auditoriaNivelDocumento").value = "";
    carregarAuditoriasNiveisAcao();
  }
}

// ==================== ABA: AUDITORIA — PARECER MENSAL DO CONSELHO FISCAL (v4.12) ====================
async function carregarPareceresConselhoAcao() {
  const container = document.getElementById("resultadoPareceresConselho");
  const res = await fetchProtegido(`${API_BASE}/auditoria/pareceres`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum parecer registrado.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Mês</th><th>Decisão</th><th>Justificativa</th><th>Por</th></tr></thead><tbody>`;
  lista.forEach(p => html += `<tr><td>${escaparHtmlEbd(p.mesReferencia)}</td><td>${p.decisao === "APROVADO" ? "✅ Aprovado" : "❌ Rejeitado"}</td><td>${escaparHtmlEbd(p.justificativa) || "-"}</td><td>${escaparHtmlEbd(p.parecerPorNome)}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarParecerConselhoAcao() {
  const mesReferencia = document.getElementById("parecerMes").value;
  const decisao = document.getElementById("parecerDecisao").value;
  const justificativa = document.getElementById("parecerJustificativa").value.trim();
  const arquivo = document.getElementById("parecerDocumento").files[0];
  if (!mesReferencia) { mostrarToast("Informe o mês de referência.", "erro"); return; }
  const body = { mesReferencia, decisao };
  if (justificativa) body.justificativa = justificativa;
  if (arquivo) { body.documentoBase64 = await arquivoParaBase64(arquivo); body.mimeType = arquivo.type; }
  const res = await fetchProtegido(`${API_BASE}/auditoria/pareceres`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("parecerJustificativa").value = "";
    document.getElementById("parecerDocumento").value = "";
    carregarPareceresConselhoAcao();
  }
}

// ==================== ABA: AUDITORIA — NIF / COAF (v4.12) ====================
async function carregarSinalizacoesNifAcao() {
  const container = document.getElementById("resultadoSinalizacoesNif");
  const res = await fetchProtegido(`${API_BASE}/nif/sinalizacoes`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista)) {
    container.innerHTML = `<p class='subtitle'>${(lista && escaparHtmlEbd(lista.mensagem)) || "Sem acesso a este recurso (restrito à Tesouraria Geral)."}</p>`;
    return;
  }
  if (lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma sinalização registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Tipo</th><th>Descrição</th><th>Fornecedor</th><th>Status</th><th>Quando</th><th>Ações</th></tr></thead><tbody>`;
  lista.forEach(s => {
    let acoes = "-";
    if (s.status === "PENDENTE") {
      acoes = `<button class="btn-link" data-on-click="decidirSinalizacaoNifAcao" data-args-click="${argsAttr(s.sinalizacaoId, "CONFIRMAR")}">Confirmar</button>
               <button class="btn-link btn-link-perigo" data-on-click="decidirSinalizacaoNifAcao" data-args-click="${argsAttr(s.sinalizacaoId, "DESCARTAR")}">Descartar</button>`;
    } else if (s.status === "CONFIRMADA") {
      acoes = `<button class="btn-link" data-on-click="registrarComunicacaoCoafAcao" data-args-click="${argsAttr(s.sinalizacaoId)}">Comunicar ao COAF</button>`;
    }
    html += `<tr><td>${escaparHtmlEbd(s.tipo)}</td><td>${escaparHtmlEbd(s.descricao)}</td><td>${escaparHtmlEbd(s.fornecedorNome) || "-"}</td><td>${escaparHtmlEbd(s.status)}</td><td>${new Date(s.criadoEm).toLocaleString("pt-BR")}</td><td class="acoes-inline">${acoes}</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarSinalizacaoNifAcao() {
  const tipo = document.getElementById("nifTipo").value;
  const descricao = document.getElementById("nifDescricao").value.trim();
  const saidaId = document.getElementById("nifSaidaId").value;
  const fornecedorId = document.getElementById("nifFornecedorId").value;
  if (!descricao) { mostrarToast("Descreva o indício de risco.", "erro"); return; }
  const body = { tipo, descricao };
  if (saidaId) body.saidaId = Number(saidaId);
  if (fornecedorId) body.fornecedorId = Number(fornecedorId);
  const res = await fetchProtegido(`${API_BASE}/nif/sinalizacoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("nifDescricao").value = "";
    document.getElementById("nifSaidaId").value = "";
    document.getElementById("nifFornecedorId").value = "";
    carregarSinalizacoesNifAcao();
  }
}

async function decidirSinalizacaoNifAcao(sinalizacaoId, acao) {
  if (acao === "DESCARTAR" && !(await confirmarAcao("Descartar esta sinalização de risco?", "Descartar"))) return;
  const res = await fetchProtegido(`${API_BASE}/nif/sinalizacoes`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sinalizacaoId, acao }) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarSinalizacoesNifAcao(); carregarComunicacoesCoafAcao(); }
}

async function registrarComunicacaoCoafAcao(sinalizacaoId) {
  const protocolo = await pedirTexto("Comunicação ao COAF", "Protocolo da comunicação (opcional — se não houver, digite um traço \"-\")");
  if (protocolo === null) return;
  const res = await fetchProtegido(`${API_BASE}/nif/comunicacoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sinalizacaoId, protocolo }) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarComunicacoesCoafAcao(); carregarSinalizacoesNifAcao(); }
}

async function carregarComunicacoesCoafAcao() {
  const container = document.getElementById("resultadoComunicacoesCoaf");
  const res = await fetchProtegido(`${API_BASE}/nif/comunicacoes`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista)) {
    container.innerHTML = `<p class='subtitle'>${(lista && escaparHtmlEbd(lista.mensagem)) || "Sem acesso a este recurso (restrito à Tesouraria Geral)."}</p>`;
    return;
  }
  if (lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma comunicação registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Sinalização</th><th>Protocolo</th><th>Prazo 24h</th><th>Observação</th><th>Quando</th></tr></thead><tbody>`;
  lista.forEach(c => html += `<tr><td>#${c.sinalizacaoId}</td><td>${escaparHtmlEbd(c.protocolo) || "-"}</td><td>${c.dentroPrazo24h ? "✅ Dentro do prazo" : "⚠️ Fora do prazo"}</td><td>${escaparHtmlEbd(c.observacao) || "-"}</td><td>${new Date(c.dataComunicacao).toLocaleString("pt-BR")}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

registrarAcoes({
  alternarMeusDadosLGPD, carregarAlertasComplianceAcao, carregarAuditoria, carregarIndicadoresAcao, carregarRecertificacoesAcao,
  criarSolicitacaoLGPD, decidirRecertificacaoAcao, decidirSinalizacaoNifAcao, registrarAncoragemAcao, registrarAuditoriaNivelAcao,
  registrarComunicacaoCoafAcao, registrarParecerConselhoAcao, registrarPrestacaoContasAcao, registrarSinalizacaoNifAcao,
  resolverAlertaComplianceAcao, salvarConsentimentoLGPD, solicitarJustificativaAcao, verificarCadeiaAuditoriaAcao
});
