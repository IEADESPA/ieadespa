// app/modulos/ouvidoria.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- ABA OUVIDORIA (v3.7 — Art. 104) ----
// Abrir denúncia/sugestão é aberto a qualquer pessoa logada (sem checar
// permissão) — só o painel de apuração abaixo é restrito a "ouvidoria".
async function salvarDenunciaOuvidoria() {
  const tipo = document.getElementById("ouvidoriaTipo").value;
  const denunciadoMembroId = document.getElementById("ouvidoriaDenunciado").value || null;
  const relato = document.getElementById("ouvidoriaRelato").value.trim();
  const anonima = document.getElementById("ouvidoriaAnonima").checked;
  const msg = document.getElementById("resultadoOuvidoria");
  if (!relato) { msg.textContent = "Descreva o relato antes de enviar."; return; }

  const res = await fetchProtegido(`${API_BASE}/ouvidoria`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo, denunciadoMembroId, relato, anonima })
  });
  const data = await res.json();
  if (data.sucesso) {
    msg.innerHTML = `✅ Denúncia registrada. <strong>Anote ou copie este protocolo agora — ele é a ÚNICA chave para acompanhar:</strong><br /><span style="font-size:1.2em;font-family:monospace;user-select:all;">${escaparHtmlEbd(data.protocolo)}</span><br /><span class="subtitle">A Igreja não consegue recuperá-lo nem reenviá-lo (numa denúncia anônima ninguém sabe quem a fez), e quem tiver o protocolo vê o andamento: não o compartilhe.</span>`;
    document.getElementById("ouvidoriaDenunciado").value = "";
    document.getElementById("ouvidoriaRelato").value = "";
    document.getElementById("ouvidoriaAnonima").checked = false;
  } else {
    msg.textContent = data.mensagem || "Não foi possível registrar a denúncia.";
  }
}

async function consultarProtocoloOuvidoriaAcao() {
  const protocolo = document.getElementById("consultaProtocolo").value.trim();
  const msg = document.getElementById("resultadoConsultaProtocolo");
  if (!protocolo) { msg.textContent = "Informe o protocolo."; return; }
  const res = await fetch(`${API_BASE}/ouvidoria-protocolo/${encodeURIComponent(protocolo)}`);
  const data = await res.json();
  if (res.status === 429) { msg.textContent = data.mensagem || "Muitas consultas seguidas. Aguarde um minuto."; return; }
  msg.textContent = data.sucesso ? `Status: ${ROTULO_STATUS_OUVIDORIA[data.status] || data.status} (protocolado em ${data.dataProtocolo})` : (data.mensagem || "Protocolo não encontrado.");
}

const ROTULO_TIPO_OUVIDORIA = {
  INFRACAO_ETICA: "Infração Ética", ASSEDIO: "Assédio", DESVIO_FINANCEIRO: "Desvio Financeiro",
  ABUSO_AUTORIDADE: "Abuso de Autoridade", SUGESTAO: "Sugestão de Melhoria"
};
const ROTULO_STATUS_OUVIDORIA = {
  RECEBIDA: "Recebida", EM_APURACAO: "Em apuração", ENCAMINHADA_PROCESSO: "Encaminhada para processo",
  ARQUIVADA: "Arquivada", CONCLUIDA: "Concluída"
};

// O painel só é montado/carregado se a pessoa tiver a permissão "ouvidoria"
// — sem isso, a aba mostra só o formulário público de abrir denúncia.
async function carregarPainelOuvidoria() {
  const container = document.getElementById("painelOuvidoriaConteudo");
  if (!authPermissoes.includes("ouvidoria")) { container.innerHTML = ""; return; }

  const res = await fetchProtegido(`${API_BASE}/ouvidoria`);
  const denuncias = await jsonDaTela(res, container, "lista");
  if (denuncias === null) return;
  if (!Array.isArray(denuncias)) { container.innerHTML = ""; return; }

  let html = `<hr /><h4 style="margin:0 0 10px; color: var(--cor-primaria);">Painel da Ouvidoria (CEI/NIF)</h4>
    <div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr>
      <th>Protocolo</th><th>Tipo</th><th>Denunciante</th><th>Denunciado</th><th>Relato</th><th>Ouvidor</th><th>Status</th><th></th>
    </tr></thead><tbody>`;
  denuncias.forEach(d => {
    const podeAnonimizar = authPermissoes.includes("protecaodedados") && !d.dadosAnonimizados && ["ARQUIVADA", "CONCLUIDA"].includes(d.status);
    html += `<tr>
      <td>${escaparHtmlEbd(d.protocolo)}</td>
      <td>${ROTULO_TIPO_OUVIDORIA[d.tipo] || escaparHtmlEbd(d.tipo)}</td>
      <td>${d.anonima ? "<span class='subtitle'>Anônima</span>" : (escaparHtmlEbd(d.denuncianteNome) || "-")}</td>
      <td>${escaparHtmlEbd(d.denunciadoNome) || "-"}${d.denunciadoEhDiretoria ? " ⚠️" : ""}</td>
      <td style="max-width:260px;">${escaparHtmlEbd(d.relato) || ""}</td>
      <td>${escaparHtmlEbd(d.ouvidorNome) || "-"}</td>
      <td>${ROTULO_STATUS_OUVIDORIA[d.status] || escaparHtmlEbd(d.status)}</td>
      <td class="acoes-inline">
        ${d.status === "RECEBIDA" ? `<button class="btn-link" data-on-click="atribuirOuvidorAcao" data-args-click="${argsAttr(d.denunciaId)}">Atribuir Ouvidor</button>` : ""}
        ${d.denunciadoMembroId && d.status !== "ENCAMINHADA_PROCESSO" ? `<button class="btn-link" data-on-click="encaminharProcessoOuvidoriaAcao" data-args-click="${argsAttr(d.denunciaId)}">Encaminhar p/ Processo</button>` : ""}
        ${d.denunciadoMembroId && d.status !== "ENCAMINHADA_MEDIACAO" ? `<button class="btn-link" data-on-click="encaminharMediacaoOuvidoriaAcao" data-args-click="${argsAttr(d.denunciaId)}">Encaminhar p/ Mediação</button>` : ""}
        ${!["ARQUIVADA", "CONCLUIDA", "ENCAMINHADA_PROCESSO", "ENCAMINHADA_MEDIACAO"].includes(d.status) ? `<button class="btn-link" data-on-click="arquivarOuvidoriaAcao" data-args-click="${argsAttr(d.denunciaId)}">Arquivar</button>
        <button class="btn-link" data-on-click="concluirOuvidoriaAcao" data-args-click="${argsAttr(d.denunciaId)}">Concluir</button>` : ""}
        ${podeAnonimizar ? `<button class="btn-link btn-link-perigo" data-on-click="anonimizarOuvidoriaAcao" data-args-click="${argsAttr(d.denunciaId)}">Anonimizar</button>` : ""}
      </td>
    </tr>`;
  });
  html += "</tbody></table></div>";
  container.innerHTML = html;
}

async function evoluirOuvidoriaAcao(denunciaId, corpo) {
  const res = await fetchProtegido(`${API_BASE}/ouvidoria/${denunciaId}/evoluir`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo)
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarPainelOuvidoria();
  return data;
}

async function atribuirOuvidorAcao(denunciaId) {
  const ouvidorMembroId = await pedirTexto("Atribuir Ouvidor", "Matrícula do Ouvidor responsável");
  if (!ouvidorMembroId) return;
  await evoluirOuvidoriaAcao(denunciaId, { acao: "ATRIBUIR_OUVIDOR", ouvidorMembroId });
}

async function arquivarOuvidoriaAcao(denunciaId) {
  const justificativa = await pedirTexto("Arquivar denúncia", "Justificativa (obrigatória)");
  if (!justificativa) return;
  await evoluirOuvidoriaAcao(denunciaId, { acao: "ARQUIVAR", justificativa });
}

async function concluirOuvidoriaAcao(denunciaId) {
  const justificativa = await pedirTexto("Concluir denúncia", "Justificativa (obrigatória)");
  if (!justificativa) return;
  await evoluirOuvidoriaAcao(denunciaId, { acao: "CONCLUIR", justificativa });
}

async function anonimizarOuvidoriaAcao(denunciaId) {
  if (!(await confirmarAcao("Anonimizar esta denúncia? O relato e a identidade do denunciante são apagados permanentemente (Art. 104 §9º).", "Anonimizar"))) return;
  await evoluirOuvidoriaAcao(denunciaId, { acao: "ANONIMIZAR" });
}

// Reaproveita o mesmo seletor de órgão central/territorial e catálogo de
// infrações já usados na abertura de Processo Disciplinar (v3.2/v3.6).
function pedirEncaminhamentoProcesso(orgaos, locais, infracoes) {
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Encaminhar para Processo Disciplinar</h3>
      <div class="input-group">
        <label>Órgão:</label>
        <select id="modalOrgaoEncaminhar">
          ${orgaos.map(o => `<option value="central:${o.orgaoId}">${escaparHtmlEbd(o.sigla)}</option>`).join("")}
          ${locais.map(o => `<option value="local:${o.orgaoLocalId}">${escaparHtmlEbd(o.sigla)} — ${escaparHtmlEbd(o.nome)}</option>`).join("")}
        </select>
      </div>
      <div class="input-group">
        <label>Infrações (Art. 96-99) — selecione 1 ou mais:</label>
        <div class="rolagem-tabela" style="max-height:180px;">
          ${infracoes.filter(i => i.ativo !== false).map(i => `<label style="display:block;"><input type="checkbox" class="chk-infracao-ouvidoria" value="${i.infracaoId}" style="width:auto;" /> ${escaparHtmlEbd(i.nome)}</label>`).join("")}
        </div>
      </div>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar" id="modalConfirmar">Encaminhar</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    document.getElementById("modalConfirmar").onclick = () => {
      const [tipo, id] = document.getElementById("modalOrgaoEncaminhar").value.split(":");
      const infracoesIds = Array.from(document.querySelectorAll(".chk-infracao-ouvidoria:checked")).map(el => Number(el.value));
      fecharModal();
      resolve({ orgaoResponsavelId: tipo === "central" ? id : null, orgaoLocalId: tipo === "local" ? id : null, infracoesIds });
    };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

async function encaminharProcessoOuvidoriaAcao(denunciaId) {
  const [orgaosRes, locaisRes, infracoesRes] = await Promise.all([
    fetchProtegido(`${API_BASE}/orgaos`), fetchProtegido(`${API_BASE}/catalogos/orgaosLocais`), fetchProtegido(`${API_BASE}/catalogos/tiposInfracao`)
  ]);
  const orgaos = await orgaosRes.json();
  const locais = (await listaDaApi(locaisRes)).filter(o => o.ativo !== false && ["JAI", "JEA", "TER"].includes(o.sigla));
  const infracoes = await infracoesRes.json();

  const dados = await pedirEncaminhamentoProcesso(orgaos, locais, infracoes);
  if (!dados) return;
  if (dados.infracoesIds.length === 0) { mostrarToast("Selecione pelo menos 1 infração.", "erro"); return; }
  await evoluirOuvidoriaAcao(denunciaId, { acao: "ENCAMINHAR_PROCESSO", ...dados });
}

// vB.16 — segunda saída da Ouvidoria: relato que é conflito
// patrimonial/administrativo, não infração ética.
async function encaminharMediacaoOuvidoriaAcao(denunciaId) {
  const prazoDiasEncerramento = await pedirTexto("Encaminhar para Mediação e Arbitragem", "Prazo de encerramento da mediação (dias)");
  if (!prazoDiasEncerramento) return;
  await evoluirOuvidoriaAcao(denunciaId, { acao: "ENCAMINHAR_MEDIACAO", prazoDiasEncerramento: Number(prazoDiasEncerramento) });
}

// ---- MEDIAÇÃO E ARBITRAGEM (vB.16 — Reg. Art. 161-A) ----
const ROTULO_STATUS_MEDIACAO = {
  MEDIACAO_EM_CURSO: "Mediação em curso", MEDIACAO_ACORDO: "Encerrada com acordo",
  MEDIACAO_SEM_ACORDO: "Encerrada sem acordo", ARBITRAGEM_EM_CURSO: "Arbitragem em curso",
  ARBITRAGEM_SENTENCA: "Sentença arbitral registrada"
};

async function instaurarMediacaoAcao() {
  const assunto = document.getElementById("mediacaoAssunto").value.trim();
  const parteAId = document.getElementById("mediacaoParteAId").value || null;
  const parteADescricao = document.getElementById("mediacaoParteADescricao").value.trim() || null;
  const parteBId = document.getElementById("mediacaoParteBId").value || null;
  const parteBDescricao = document.getElementById("mediacaoParteBDescricao").value.trim() || null;
  const valorEnvolvido = document.getElementById("mediacaoValorEnvolvido").value || null;
  const prazoDiasEncerramento = document.getElementById("mediacaoPrazoDias").value || null;
  const msg = document.getElementById("resultadoMediacao");
  if (!assunto || !prazoDiasEncerramento) { msg.textContent = "Informe assunto e prazo de encerramento."; return; }

  const res = await fetchProtegido(`${API_BASE}/mediacoes`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assunto, parteAId, parteADescricao, parteBId, parteBDescricao, valorEnvolvido, prazoDiasEncerramento })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    ["mediacaoAssunto", "mediacaoParteAId", "mediacaoParteADescricao", "mediacaoParteBId", "mediacaoParteBDescricao", "mediacaoValorEnvolvido", "mediacaoPrazoDias"]
      .forEach(id => document.getElementById(id).value = "");
    carregarMediacoes();
  }
}

async function carregarMediacoes() {
  const container = document.getElementById("resultadoListaMediacoes");
  if (!authPermissoes.includes("mediacao")) { container.innerHTML = "<p class='subtitle'>Instaure um caso acima — a lista completa exige a permissão 'mediacao'.</p>"; return; }
  const res = await fetchProtegido(`${API_BASE}/mediacoes`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum caso registrado ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Assunto</th><th>Parte A</th><th>Parte B</th><th>Status</th><th>Prazo</th><th></th>
  </tr></thead><tbody>`;
  lista.forEach(m => {
    html += `<tr>
      <td>${escaparHtmlEbd(m.assunto)}</td>
      <td>${escaparHtmlEbd(m.parteANome) || escaparHtmlEbd(m.parteADescricao) || "-"}</td>
      <td>${escaparHtmlEbd(m.parteBNome) || escaparHtmlEbd(m.parteBDescricao) || "-"}</td>
      <td>${ROTULO_STATUS_MEDIACAO[m.status] || escaparHtmlEbd(m.status)}</td>
      <td>${m.prazoVencido ? `<span style="color:var(--cor-perigo,#c0392b);">⚠️ Vencido (${escaparHtmlEbd(m.diasDesdeInstauracao)}d)</span>` : `${escaparHtmlEbd(m.diasDesdeInstauracao)}d de ${escaparHtmlEbd(m.prazoDiasEncerramento)}`}</td>
      <td><button class="btn-link" data-on-click="abrirDetalheMediacao" data-args-click="${argsAttr(m.mediacaoId)}">Abrir</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function evoluirMediacaoAcao(mediacaoId, corpo) {
  const res = await fetchProtegido(`${API_BASE}/mediacoes/${mediacaoId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo)
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) abrirDetalheMediacao(mediacaoId);
  return data;
}

async function abrirDetalheMediacao(mediacaoId) {
  const container = document.getElementById("painelDetalheMediacao");
  const res = await fetchProtegido(`${API_BASE}/mediacoes/${mediacaoId}`);
  const m = await jsonDaTela(res, container, "objeto");
  if (m === null) return;
  if (m.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(m.mensagem)}</p>`; return; }

  let acoesHtml = "";
  if (m.status === "MEDIACAO_EM_CURSO") {
    acoesHtml += `<div class="barra-lista">
      <input type="number" id="medDetMediadorId" placeholder="Matrícula do mediador" />
      <button class="btn-link" data-on-click="designarMediadorAcao" data-args-click="${argsAttr(mediacaoId)}">Designar Mediador</button>
    </div>
    <div class="barra-lista">
      <input type="date" id="medDetSessaoData" />
      <label><input type="checkbox" id="medDetSessaoA" /> Parte A compareceu</label>
      <label><input type="checkbox" id="medDetSessaoB" /> Parte B compareceu</label>
      <input type="text" id="medDetSessaoObs" placeholder="Observações" style="min-width:200px;" />
      <button class="btn-link" data-on-click="registrarSessaoMediacaoAcao" data-args-click="${argsAttr(mediacaoId)}">Registrar Sessão</button>
    </div>
    <div class="barra-lista">
      <input type="text" id="medDetResumoAcordo" placeholder="Texto do acordo (o que as partes vão aceitar)" style="min-width:220px;" maxlength="1500" />
      <input type="number" id="medDetSaidaVinculada" placeholder="Id da Saída vinculada (opcional)" />
      <button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="registrarAcordoMediacaoAcao" data-args-click="${argsAttr(mediacaoId)}">📝 Propor acordo às partes</button>
      <button class="btn-link btn-link-perigo" data-on-click="mediacaoSemAcordoAcao" data-args-click="${argsAttr(mediacaoId)}">Encerrar sem acordo</button>
    </div>`;
  }
  if (m.status === "MEDIACAO_SEM_ACORDO") {
    acoesHtml += `<div class="barra-lista">
      <input type="number" id="medDetArbitroId" placeholder="Matrícula do árbitro" />
      <button class="btn-link" data-on-click="designarArbitroAcao" data-args-click="${argsAttr(mediacaoId)}">Designar Árbitro (abrir arbitragem)</button>
    </div>`;
  }
  if (m.status === "ARBITRAGEM_EM_CURSO") {
    acoesHtml += `<div class="barra-lista">
      ${m.compromisso && m.compromisso.firmadoEm ? "" : `<button class="btn-link" data-on-click="registrarCompromissoArbitralAcao" data-args-click="${argsAttr(mediacaoId)}">Propor Compromisso Arbitral às partes</button>`}
      <input type="file" id="medDetSentencaArquivo" accept="application/pdf,image/jpeg,image/png" />
      <button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="registrarSentencaArbitralAcao" data-args-click="${argsAttr(mediacaoId)}">📄 Registrar Sentença</button>
    </div>`;
  }
  const bifurcacaoHtml = !m.processoDisciplinarBifurcadoId ? `
    <div class="barra-lista">
      <input type="number" id="medDetBifurcarMembroId" placeholder="Matrícula (quem responde ao processo)" />
      <button class="btn-link btn-link-perigo" data-on-click="bifurcarDisciplinarAcao" data-args-click="${argsAttr(mediacaoId)}">⚠️ Bifurcar p/ Processo Disciplinar</button>
    </div>` : `<p class="subtitle">Já bifurcado — processo disciplinar nº ${m.processoDisciplinarBifurcadoId}.</p>`;

  const sessoesHtml = (m.sessoes || []).length === 0 ? "<p class='subtitle'>Nenhuma sessão registrada.</p>" :
    `<table class="tabela-frequencia"><thead><tr><th>Data</th><th>Parte A</th><th>Parte B</th><th>Obs.</th></tr></thead><tbody>` +
    m.sessoes.map(s => `<tr><td>${escaparHtmlEbd(s.dataSessao)}</td><td>${s.parteACompareceu ? "✅" : "-"}</td><td>${s.parteBCompareceu ? "✅" : "-"}</td><td>${escaparHtmlEbd(s.observacoes) || "-"}</td></tr>`).join("") +
    `</tbody></table>`;

  container.innerHTML = `
    <hr />
    <h4>${escaparHtmlEbd(m.assunto)} — ${ROTULO_STATUS_MEDIACAO[m.status] || escaparHtmlEbd(m.status)}</h4>
    <p class="subtitle">Parte A: ${escaparHtmlEbd(m.parteANome) || escaparHtmlEbd(m.parteADescricao) || "-"} · Parte B: ${escaparHtmlEbd(m.parteBNome) || escaparHtmlEbd(m.parteBDescricao) || "-"}
      ${m.mediadorNome ? ` · Mediador: ${escaparHtmlEbd(m.mediadorNome)}` : ""}${m.arbitroNome ? ` · Árbitro: ${escaparHtmlEbd(m.arbitroNome)}` : ""}</p>
    ${m.sentencaArbitralUrl ? `<p><a class="btn-link" href="${urlSegura(m.sentencaArbitralUrl)}" target="_blank" rel="noopener">📄 Ver sentença arbitral</a></p>` : ""}
    ${acoesHtml}
    ${htmlInstrumentoMediacao("Acordo de mediação", "ACORDO", m.acordo, m, mediacaoId, m.status === "MEDIACAO_EM_CURSO")}
    ${htmlInstrumentoMediacao("Compromisso arbitral", "COMPROMISSO", m.compromisso, m, mediacaoId, m.status === "ARBITRAGEM_EM_CURSO" && !(m.compromisso && m.compromisso.firmadoEm))}
    <h5 style="margin:14px 0 6px;">Sessões de mediação</h5>
    ${sessoesHtml}
    <h5 style="margin:14px 0 6px;">Encaminhamento cruzado (Art. 91)</h5>
    ${bifurcacaoHtml}
    <p id="resultadoDetalheMediacao"></p>`;
}

// ---- Aceite só por ato da parte (03/10/2026, migração 132) ----
// O texto proposto (hash) de cada caso/instrumento, para a decisão presencial e a da parte confirmarem que é o mesmo texto que está na tela.
const hashPropostoMediacao = {};
const ROTULO_DECISAO_MEDIACAO = { ACEITE: "✅ aceitou", RECUSA: "❌ recusou" };
function htmlDecisaoParteMediacao(d) {
  if (!d) return "<em>aguardando a decisão da parte</em>";
  return `${ROTULO_DECISAO_MEDIACAO[d.decisao] || escaparHtmlEbd(d.decisao)} — ${escaparHtmlEbd(d.rotuloCanal || d.canal)}`
    + (d.registradoPorNome ? ` (registrado por ${escaparHtmlEbd(d.registradoPorNome)})` : "")
    + (d.registradoEm ? ` em ${escaparHtmlEbd(new Date(d.registradoEm).toLocaleString("pt-BR"))}` : "")
    + (d.dataAssinaturaPresencial ? `, assinado em ${escaparHtmlEbd(formatarDataEbd(d.dataAssinaturaPresencial))}` : "")
    + (d.anexoUrl ? ` · <a href="${urlSegura(d.anexoUrl)}" target="_blank" rel="noopener">📄 documento assinado</a>` : "");
}
// Bloco do acordo (ou do compromisso) no detalhe da Câmara: o texto proposto, a decisão de cada parte com o canal e o autor, os aceites antigos e o
// formulário do registro presencial (que só envia COM o documento assinado).
function htmlInstrumentoMediacao(titulo, instrumento, s, m, mediacaoId, aberto) {
  if (!s) return "";
  const chave = `${mediacaoId}:${instrumento}`;
  hashPropostoMediacao[chave] = s.hashTexto || null;
  const nomeA = escaparHtmlEbd(m.parteANome || m.parteADescricao || "Parte A"), nomeB = escaparHtmlEbd(m.parteBNome || m.parteBDescricao || "Parte B");
  const legado = (s.legado || []).length ? `<p class="subtitle">⚠️ Aceite(s) antigo(s): ${s.legado.map(l => `Parte ${escaparHtmlEbd(l.parte)} — ${escaparHtmlEbd(l.rotuloCanal)}`).join("; ")}.</p>` : "";
  if (!s.proposto && !legado) return "";
  const situacao = s.firmado ? "✅ firmado pelas duas partes" : s.firmadoAntesDaVerificacao ? "registrado antes da verificação por ato da parte" : (s.recusadoPor || []).length ? "❌ recusado" : "aguardando as partes";
  const formPresencial = aberto && s.proposto && !s.firmado ? `
    <div class="barra-lista" style="flex-wrap:wrap;">
      <strong style="width:100%;">Registrar decisão tomada em papel (o documento assinado é obrigatório):</strong>
      <select id="medPres${instrumento}Parte"><option value="A">${nomeA}</option><option value="B">${nomeB}</option></select>
      <select id="medPres${instrumento}Decisao"><option value="ACEITE">aceitou</option><option value="RECUSA">recusou</option></select>
      <label>Assinado em <input type="date" id="medPres${instrumento}Data" /></label>
      <input type="file" id="medPres${instrumento}Arquivo" accept="application/pdf,image/jpeg,image/png" />
      <button class="btn-link" data-on-click="registrarDecisaoPresencialMediacaoAcao" data-args-click="${argsAttr(mediacaoId, String(instrumento))}">Registrar com o documento</button>
    </div>` : "";
  return `<h5 style="margin:14px 0 6px;">${escaparHtmlEbd(titulo)} — ${situacao}</h5>
    ${s.proposto ? `<p style="white-space:pre-wrap;border-left:3px solid var(--cor-primaria);padding-left:8px;">${escaparHtmlEbd(s.texto)}</p>
    <ul><li>${nomeA}: ${htmlDecisaoParteMediacao(s.partes && s.partes.A)}</li><li>${nomeB}: ${htmlDecisaoParteMediacao(s.partes && s.partes.B)}</li></ul>` : ""}
    ${legado}${formPresencial}`;
}

async function registrarDecisaoPresencialMediacaoAcao(mediacaoId, instrumento) {
  const arquivo = document.getElementById(`medPres${instrumento}Arquivo`).files[0];
  const dataAssinatura = document.getElementById(`medPres${instrumento}Data`).value;
  if (!arquivo) { mostrarToast("Anexe o documento assinado pela parte: sem ele a decisão presencial não é registrada.", "erro"); return; }
  if (!dataAssinatura) { mostrarToast("Informe a data em que a parte assinou.", "erro"); return; }
  const parte = document.getElementById(`medPres${instrumento}Parte`).value;
  const decisao = document.getElementById(`medPres${instrumento}Decisao`).value;
  if (!(await confirmarAcao(`Registrar que a Parte ${parte} ${decisao === "ACEITE" ? "ACEITOU" : "RECUSOU"} este texto, com o documento assinado anexado? O registro fica com o seu nome e não pode ser desfeito.`, "Registrar"))) return;
  const res = await fetchProtegido(`${API_BASE}/mediacoes/${mediacaoId}/decisao-presencial`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instrumento, parte, decisao, hashTexto: hashPropostoMediacao[`${mediacaoId}:${instrumento}`], dataAssinatura,
      documentoBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type, nomeArquivo: arquivo.name })
  });
  const data = await res.json();
  avisarResultado(data);
  abrirDetalheMediacao(mediacaoId);
}

// Meu Painel → Minhas Tarefas: os casos em que EU sou parte, com o texto a decidir (aceitar ou recusar com a minha própria sessão).
async function carregarMinhasMediacoesAcao() {
  const container = document.getElementById("resultadoMinhasMediacoes");
  if (!container) return;
  let data;
  try { data = await (await fetchProtegido(`${API_BASE}/mediacoes/minhas`)).json(); } catch { container.innerHTML = ""; return; }
  const casos = (data && data.casos) || [];
  if (!casos.length) { container.innerHTML = ""; return; }
  container.innerHTML = `<h4 style="margin:16px 0 6px;">🤝 Minhas mediações e arbitragens</h4>` + casos.map(c => {
    const bloco = (titulo, instrumento, s, pode) => {
      if (!s || !s.proposto) return s && s.legado && s.legado.length ? `<p class="subtitle">${escaparHtmlEbd(titulo)}: registrado antes da verificação por ato da parte.</p>` : "";
      hashPropostoMediacao[`${c.mediacaoId}:${instrumento}`] = s.hashTexto;
      const minhas = c.minhasPartes.map(p => s.partes[p]).filter(Boolean);
      const situacao = s.firmado ? "✅ firmado pelas duas partes" : minhas.length ? `você ${minhas.map(d => ROTULO_DECISAO_MEDIACAO[d.decisao]).join(", ")}${s.firmado ? "" : " — aguardando a outra parte"}` : "aguarda a sua decisão";
      return `<p><strong>${escaparHtmlEbd(titulo)}</strong> — ${situacao}</p>
        <p style="white-space:pre-wrap;border-left:3px solid var(--cor-primaria);padding-left:8px;">${escaparHtmlEbd(s.texto)}</p>
        ${pode && !s.firmado ? `<div class="barra-lista">
          <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="decidirMediacaoAcao" data-args-click="${argsAttr(c.mediacaoId, String(instrumento), "ACEITE")}">Li e aceito</button>
          <button class="btn-link btn-link-perigo" data-on-click="decidirMediacaoAcao" data-args-click="${argsAttr(c.mediacaoId, String(instrumento), "RECUSA")}">Recuso</button>
        </div>` : ""}`;
    };
    return `<div style="border:1px solid var(--cor-borda, #ddd);border-radius:8px;padding:10px;margin-bottom:10px;">
      <p><strong>Caso nº ${Number(c.mediacaoId)} — ${escaparHtmlEbd(c.assunto)}</strong> (${escaparHtmlEbd(ROTULO_STATUS_MEDIACAO[c.status] || c.status)})</p>
      <p class="subtitle">${escaparHtmlEbd(c.parteA || "-")} × ${escaparHtmlEbd(c.parteB || "-")}${c.mediadorNome ? ` · Mediador: ${escaparHtmlEbd(c.mediadorNome)}` : ""}${c.arbitroNome ? ` · Árbitro: ${escaparHtmlEbd(c.arbitroNome)}` : ""}</p>
      ${bloco("Acordo de mediação", "ACORDO", c.acordo, c.podeDecidirAcordo)}
      ${bloco("Compromisso arbitral", "COMPROMISSO", c.compromisso, c.podeDecidirCompromisso)}
    </div>`;
  }).join("");
}

async function decidirMediacaoAcao(mediacaoId, instrumento, decisao) {
  const nome = instrumento === "ACORDO" ? "o acordo" : "o compromisso arbitral";
  const msg = decisao === "ACEITE"
    ? `Confirmar que você leu e ACEITA ${nome} exatamente como está escrito? Vale como a sua assinatura eletrônica (fica gravada com a sua matrícula, a data e a hora).`
    : `Confirmar que você RECUSA ${nome}? A recusa fica registrada e o mediador/a Câmara será informado.`;
  if (!(await confirmarAcao(msg, decisao === "ACEITE" ? "Aceito" : "Recuso"))) return;
  const res = await fetchProtegido(`${API_BASE}/mediacoes/${mediacaoId}/decisao`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instrumento, decisao, hashTexto: hashPropostoMediacao[`${mediacaoId}:${instrumento}`] })
  });
  const data = await res.json();
  avisarResultado(data);
  carregarMinhasMediacoesAcao();
}

async function designarMediadorAcao(mediacaoId) {
  const mediadorId = document.getElementById("medDetMediadorId").value;
  if (!mediadorId) return;
  await evoluirMediacaoAcao(mediacaoId, { acao: "DESIGNAR_MEDIADOR", mediadorId });
}

async function registrarSessaoMediacaoAcao(mediacaoId) {
  const dataSessao = document.getElementById("medDetSessaoData").value;
  const parteACompareceu = document.getElementById("medDetSessaoA").checked;
  const parteBCompareceu = document.getElementById("medDetSessaoB").checked;
  const observacoes = document.getElementById("medDetSessaoObs").value.trim() || null;
  if (!dataSessao) { mostrarToast("Informe a data da sessão.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/mediacoes/${mediacaoId}/sessoes`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataSessao, parteACompareceu, parteBCompareceu, observacoes })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) abrirDetalheMediacao(mediacaoId);
}

async function registrarAcordoMediacaoAcao(mediacaoId) {
  const resumoAcordo = document.getElementById("medDetResumoAcordo").value.trim();
  const saidaVinculadaId = document.getElementById("medDetSaidaVinculada").value || null;
  if (!resumoAcordo) { mostrarToast("Informe o texto do acordo.", "erro"); return; }
  // 03/10/2026: propor não é aceitar — cada parte decide com a própria sessão (ou presencial, com o termo assinado anexado).
  await evoluirMediacaoAcao(mediacaoId, { acao: "REGISTRAR_ACORDO", resumoAcordo, saidaVinculadaId });
}

async function mediacaoSemAcordoAcao(mediacaoId) {
  const motivo = await pedirTexto("Encerrar mediação sem acordo", "Motivo");
  if (!motivo) return;
  await evoluirMediacaoAcao(mediacaoId, { acao: "MEDIACAO_SEM_ACORDO", motivo });
}

async function designarArbitroAcao(mediacaoId) {
  const arbitroId = document.getElementById("medDetArbitroId").value;
  if (!arbitroId) return;
  await evoluirMediacaoAcao(mediacaoId, { acao: "DESIGNAR_ARBITRO", arbitroId });
}

async function registrarCompromissoArbitralAcao(mediacaoId) {
  await evoluirMediacaoAcao(mediacaoId, { acao: "REGISTRAR_COMPROMISSO_ARBITRAL" });
}

async function registrarSentencaArbitralAcao(mediacaoId) {
  const arquivo = document.getElementById("medDetSentencaArquivo").files[0];
  if (!arquivo) { mostrarToast("Anexe a sentença arbitral.", "erro"); return; }
  await evoluirMediacaoAcao(mediacaoId, { acao: "REGISTRAR_SENTENCA", sentencaBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type });
}

async function bifurcarDisciplinarAcao(mediacaoId) {
  const membroId = document.getElementById("medDetBifurcarMembroId").value;
  if (!membroId) return;
  if (!(await confirmarAcao("Bifurcar para Processo Disciplinar? A mediação continua seu curso normalmente, em paralelo.", "Bifurcar"))) return;
  await evoluirMediacaoAcao(mediacaoId, { acao: "BIFURCAR_DISCIPLINAR", membroId });
}

registrarAcoes({
  abrirDetalheMediacao, anonimizarOuvidoriaAcao, arquivarOuvidoriaAcao, atribuirOuvidorAcao, bifurcarDisciplinarAcao, concluirOuvidoriaAcao,
  consultarProtocoloOuvidoriaAcao, decidirMediacaoAcao, designarArbitroAcao, designarMediadorAcao, encaminharMediacaoOuvidoriaAcao,
  encaminharProcessoOuvidoriaAcao, instaurarMediacaoAcao, mediacaoSemAcordoAcao, registrarAcordoMediacaoAcao, registrarCompromissoArbitralAcao,
  registrarDecisaoPresencialMediacaoAcao, registrarSentencaArbitralAcao, registrarSessaoMediacaoAcao, salvarDenunciaOuvidoria
});
