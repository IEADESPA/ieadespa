// app/modulos/disciplina.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- SECRETARIA / ABA PROCESSO DISCIPLINAR ----
// v3.2: abrir (com catálogo de infrações) + rito (relator, citação, afastamento
// cautelar, defesa/revelia, defensor) + julgar + ajustar prazo.
// v3.6 — escada territorial: o select de órgão junta os 5 órgãos centrais
// (Orgaos) com as JAI/JEA/TER territoriais cadastradas em OrgaosLocais. O
// value carrega um prefixo (central:ID / local:ID) que salvarProcessoDisciplinar()
// decompõe em orgaoResponsavelId/orgaoLocalId.
async function carregarOpcoesFormDisciplina() {
  const res = await fetchProtegido(`${API_BASE}/orgaos`);
  const orgaos = await res.json();
  const locaisRes = await fetchProtegido(`${API_BASE}/catalogos/orgaosLocais`);
  const locais = (await listaDaApi(locaisRes)).filter(o => o.ativo !== false && ["JAI", "JEA", "TER"].includes(o.sigla));
  document.getElementById("disciplinaOrgao").innerHTML =
    // órgão central (CEI/CLI...) só o geral escolhe (AbrirProcessoDisciplinar recusa os demais); o local exige vínculo com o órgão, conferido no servidor
    (authGeral ? orgaos : []).map(o => `<option value="central:${o.orgaoId}">${escaparHtmlEbd(o.sigla)}</option>`).join("") +
    locais.map(o => `<option value="local:${o.orgaoLocalId}">${escaparHtmlEbd(o.sigla)} — ${escaparHtmlEbd(o.nome)}</option>`).join("");

  const infRes = await fetchProtegido(`${API_BASE}/catalogos/tiposInfracao`);
  const infracoes = await infRes.json();
  window._catalogoInfracoes = Array.isArray(infracoes) ? infracoes : [];
  const lista = document.getElementById("listaInfracoesAbertura");
  lista.innerHTML = window._catalogoInfracoes
    .filter(i => i.ativo !== false)
    .map(i => `<label style="display:block;"><input type="checkbox" class="chk-infracao-abertura" value="${i.infracaoId}" style="width:auto;" /> ${escaparHtmlEbd(i.nome)} <span class="subtitle">(${escaparHtmlEbd(i.referenciaRegimento) || escaparHtmlEbd(i.codigo)} — ${badgeGravidade(i.gravidade)})</span></label>`)
    .join("") || "<p class='subtitle'>Nenhuma infração cadastrada no catálogo.</p>";

  document.getElementById("catalogoTiposInfracaoConteudo").innerHTML = secaoCatalogo("tiposInfracao");
  carregarCatalogoLista("tiposInfracao");

  document.getElementById("catalogoTiposPenalidadeConteudo").innerHTML = secaoCatalogo("tiposPenalidade");
  carregarCatalogoLista("tiposPenalidade");
}

async function salvarProcessoDisciplinar() {
  const membroId = document.getElementById("disciplinaMatricula").value;
  const orgaoValor = document.getElementById("disciplinaOrgao").value;
  const [orgaoTipo, orgaoId] = orgaoValor.split(":");
  const motivo = document.getElementById("disciplinaMotivo").value.trim();
  const sigiloso = document.getElementById("disciplinaSigiloso").checked;
  const infracoesIds = Array.from(document.querySelectorAll(".chk-infracao-abertura:checked")).map(el => Number(el.value));
  const msg = document.getElementById("resultadoDisciplina");
  if (!membroId || !orgaoValor || infracoesIds.length === 0) {
    msg.textContent = "Informe matrícula, órgão e ao menos 1 infração.";
    return;
  }
  const body = { membroId, infracoesIds, motivo: motivo || null, sigiloso };
  if (orgaoTipo === "central") body.orgaoResponsavelId = orgaoId; else body.orgaoLocalId = orgaoId;
  const res = await fetchProtegido(`${API_BASE}/processos-disciplinares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("disciplinaMatricula").value = "";
    document.getElementById("disciplinaMotivo").value = "";
    document.querySelectorAll(".chk-infracao-abertura:checked").forEach(el => { el.checked = false; });
    carregarProcessosDisciplinares();
  }
}

const ROTULO_SITUACAO_DISCIPLINA = {
  EM_ANDAMENTO: "Em andamento",
  AFASTAMENTO_CAUTELAR: "Afastamento cautelar",
  EM_RECURSO: "Em recurso",
  CUMPRINDO_SANCAO: "Cumprindo sanção",
  PRAZO_INDETERMINADO: "Sanção — prazo indeterminado",
  CUMPRIDO: "Sanção cumprida",
  ARQUIVADO: "Arquivado",
  EXCLUIDO: "Excluído"
};

const ROTULO_CANAL_CITACAO = { WHATSAPP: "WhatsApp", CARTA_REGISTRADA: "Carta Registrada" };
const ROTULO_GRAVIDADE = { LEVE: "Leve", MEDIA: "Média", GRAVE: "Grave", GRAVISSIMA: "Gravíssima" };
const ORDEM_GRAVIDADE = ["LEVE", "MEDIA", "GRAVE", "GRAVISSIMA"];
const CORES_GRAVIDADE = { LEVE: "badge-ativo", MEDIA: "badge-licenca", GRAVE: "badge-licenca", GRAVISSIMA: "badge-desligado" };
function badgeGravidade(gravidade) {
  if (!gravidade) return "";
  return `<span class="badge-status ${CORES_GRAVIDADE[gravidade] || ""}">${ROTULO_GRAVIDADE[gravidade] || escaparHtmlEbd(gravidade)}</span>`;
}

function badgeSituacaoDisciplina(situacao) {
  const cores = {
    EM_ANDAMENTO: "badge-licenca", AFASTAMENTO_CAUTELAR: "badge-licenca", EM_RECURSO: "badge-licenca", CUMPRINDO_SANCAO: "badge-licenca", PRAZO_INDETERMINADO: "badge-licenca",
    CUMPRIDO: "badge-ativo", ARQUIVADO: "badge-ativo", EXCLUIDO: "badge-desligado"
  };
  return `<span class="badge-status ${cores[situacao] || ""}">${ROTULO_SITUACAO_DISCIPLINA[situacao] || escaparHtmlEbd(situacao)}</span>`;
}

async function carregarProcessosDisciplinares() {
  const container = document.getElementById("resultadoListaDisciplina");
  const res = await fetchProtegido(`${API_BASE}/processos-disciplinares`);
  const processos = await jsonDaTela(res, container, "objeto");
  if (processos === null) return;

  if (processos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum processo ativo.</p>";
    return;
  }

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Órgão</th><th>Infrações</th><th>Relator</th><th>Citação</th><th>Defesa</th><th>Penalidade</th><th>Situação</th><th>Dias restantes</th><th></th>
  </tr></thead><tbody>`;

  processos.forEach(p => {
    const podeAfastar = p.status === "EM_ANDAMENTO";
    const podeJulgar = p.status === "EM_ANDAMENTO" || p.status === "AFASTAMENTO_CAUTELAR";
    const podeAjustarPrazo = p.situacaoEfetiva === "CUMPRINDO_SANCAO" || p.situacaoEfetiva === "PRAZO_INDETERMINADO";
    const infracoesTexto = p.detalhesRestritos
      ? `<span class="subtitle">🔒 Sigiloso — ${escaparHtmlEbd(p.quantidadeInfracoes ?? "?")} infração(ões), detalhes restritos ao CEI/relator</span>`
      : (() => {
          const maisGrave = (p.infracoes || []).reduce((atual, i) => {
            if (!i.gravidade) return atual;
            return !atual || ORDEM_GRAVIDADE.indexOf(i.gravidade) > ORDEM_GRAVIDADE.indexOf(atual) ? i.gravidade : atual;
          }, null);
          const texto = (p.infracoes || []).map(i => i.nome).join(", ") || "-";
          return texto === "-" ? "-" : `${escaparHtmlEbd(texto)} ${badgeGravidade(maisGrave)}`;
        })();
    const citacaoTexto = p.dataCitacao ? `${escaparHtmlEbd(p.dataCitacao)} (${ROTULO_CANAL_CITACAO[p.canalCitacao] || escaparHtmlEbd(p.canalCitacao)})` : "-";
    const defesaTexto = p.defesaProtocolada
      ? `Protocolada em ${escaparHtmlEbd(p.dataDefesa)}`
      : (p.prazoDefesa && p.prazoDefesa.emRevelia ? "<span class='badge-status badge-desligado'>Revelia</span>" : (p.dataCitacao ? "Aguardando" : "-"));
    const podeRegistrarProva = p.emCarenciaAdministrativa;
    const podeRecorrer = p.podeRecorrer && !p.prazoRecursoVencido;
    const podeHomologar = p.homologadoPeloCei === false && authPermissoes.includes("cei");
    let penalidadeTexto = escaparHtmlEbd(p.penalidadeNome) || "-";
    if (p.emCarenciaAdministrativa) penalidadeTexto += "<br /><span class='badge-status badge-licenca'>Em Carência Administrativa</span>";
    else if (p.resultadoProvaReintegracao) penalidadeTexto += `<br /><span class="subtitle">Prova de Reintegração: ${escaparHtmlEbd(p.resultadoProvaReintegracao)}</span>`;
    if (p.homologadoPeloCei === false) penalidadeTexto += "<br /><span class='badge-status badge-licenca'>Aguardando homologação do CEI</span>";
    else if (p.homologadoPeloCei === true) penalidadeTexto += "<br /><span class='subtitle'>Homologado pelo CEI</span>";
    html += `<tr>
      <td>${escaparHtmlEbd(p.nome)}${p.sigiloso ? " 🔒" : ""}${p.defensorNome ? `<br /><span class="subtitle">Defensor: ${escaparHtmlEbd(p.defensorNome)}</span>` : ""}
        ${p.envolveMinistro ? `<br /><span class="subtitle">⚠️ Envolve ministro — jurisdição dupla (também CIADSETA-PARÁ, fora do sistema), Art. 103 §1º, II</span>` : ""}</td>
      <td>${escaparHtmlEbd(p.orgaoSigla)}${p.orgaoLocalId ? `<br /><span class="subtitle">${escaparHtmlEbd(p.orgaoNome)}</span>` : ""}</td>
      <td>${infracoesTexto}</td>
      <td>${escaparHtmlEbd(p.relatorNome) || "-"}</td>
      <td>${citacaoTexto}</td>
      <td>${defesaTexto}</td>
      <td>${penalidadeTexto}</td>
      <td>${badgeSituacaoDisciplina(p.situacaoEfetiva)}</td>
      <td>${escaparHtmlEbd(p.diasRestantes ?? "-")}</td>
      <td class="acoes-inline">
        ${p.status !== "JULGADO" ? `<button class="btn-link" data-on-click="designarRelatorAcao" data-args-click="${argsAttr(p.processoId)}">Relator</button>` : ""}
        ${p.status !== "JULGADO" && !p.dataCitacao ? `<button class="btn-link" data-on-click="citarAcao" data-args-click="${argsAttr(p.processoId)}">Citar</button>` : ""}
        ${podeAfastar ? `<button class="btn-link" data-on-click="afastarCautelarAcao" data-args-click="${argsAttr(p.processoId)}">Afastar</button>` : ""}
        ${p.status !== "JULGADO" && p.dataCitacao && !p.defesaProtocolada ? `<button class="btn-link" data-on-click="registrarDefesaAcao" data-args-click="${argsAttr(p.processoId)}">Registrar Defesa</button>` : ""}
        ${p.status !== "JULGADO" ? `<button class="btn-link" data-on-click="designarDefensorAcao" data-args-click="${argsAttr(p.processoId)}">Defensor</button>` : ""}
        ${podeJulgar ? `<button class="btn-link" data-on-click="julgarProcessoAcao" data-args-click="${argsAttr(p.processoId)}">Julgar</button>` : ""}
        ${podeAjustarPrazo ? `<button class="btn-link" data-on-click="ajustarPrazoProcessoAcao" data-args-click="${argsAttr(p.processoId)}">Ajustar Prazo</button>` : ""}
        ${podeRegistrarProva ? `<button class="btn-link" data-on-click="registrarProvaReintegracaoAcao" data-args-click="${argsAttr(p.processoId)}">Prova de Reintegração</button>` : ""}
        ${podeRecorrer ? `<button class="btn-link" data-on-click="recorrerAcao" data-args-click="${argsAttr(p.processoId)}">Recorrer</button>` : ""}
        ${podeHomologar ? `<button class="btn-link" data-on-click="homologarExclusaoAcao" data-args-click="${argsAttr(p.processoId)}">Homologar</button>` : ""}
      </td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

async function evoluirProcessoAcao(processoId, corpo, mensagemErro) {
  const res = await fetchProtegido(`${API_BASE}/processos-disciplinares/${processoId}/evoluir`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo)
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.avisos && data.avisos.length) data.avisos.forEach(a => mostrarToast(a, "erro"));
  if (data.sucesso) carregarProcessosDisciplinares();
  return data;
}

async function designarRelatorAcao(processoId) {
  const relatorMembroId = await pedirTexto("Designar relator", "Matrícula do relator");
  if (!relatorMembroId) return;
  await evoluirProcessoAcao(processoId, { acao: "DESIGNAR_RELATOR", relatorMembroId });
}

function pedirCitacao() {
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Registrar citação (Art. 101)</h3>
      <div class="input-group">
        <label>Canal:</label>
        <select id="modalCanalCitacao">
          <option value="WHATSAPP">WhatsApp</option>
          <option value="CARTA_REGISTRADA">Carta Registrada</option>
        </select>
      </div>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar" id="modalConfirmar">Registrar</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    document.getElementById("modalConfirmar").onclick = () => {
      const canalCitacao = document.getElementById("modalCanalCitacao").value;
      fecharModal();
      resolve({ canalCitacao });
    };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

async function citarAcao(processoId) {
  const dados = await pedirCitacao();
  if (!dados) return;
  await evoluirProcessoAcao(processoId, { acao: "CITAR", canalCitacao: dados.canalCitacao });
}

async function afastarCautelarAcao(processoId) {
  if (!(await confirmarAcao("Afastar cautelarmente esta pessoa das funções (Art. 100)?", "Afastar"))) return;
  await evoluirProcessoAcao(processoId, { acao: "AFASTAR" });
}

async function registrarDefesaAcao(processoId) {
  if (!(await confirmarAcao("Registrar que a defesa foi protocolada?", "Registrar"))) return;
  await evoluirProcessoAcao(processoId, { acao: "REGISTRAR_DEFESA" });
}

async function designarDefensorAcao(processoId) {
  const defensorNome = await pedirTexto("Designar defensor (Art. 102)", "Nome do defensor eclesiástico ou advogado");
  if (!defensorNome) return;
  await evoluirProcessoAcao(processoId, { acao: "DESIGNAR_DEFENSOR", defensorNome });
}

function pedirProvaReintegracao() {
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Prova de Reintegração Ética (Art. 77)</h3>
      <div class="input-group">
        <label>Resultado:</label>
        <select id="modalResultadoProva">
          <option value="APROVADO">Aprovado — credencial reativada</option>
          <option value="REPROVADO">Reprovado — nova tentativa na próxima trimestral</option>
        </select>
      </div>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar" id="modalConfirmar">Registrar</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    document.getElementById("modalConfirmar").onclick = () => {
      const resultadoProva = document.getElementById("modalResultadoProva").value;
      fecharModal();
      resolve({ resultadoProva });
    };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

async function registrarProvaReintegracaoAcao(processoId) {
  const dados = await pedirProvaReintegracao();
  if (!dados) return;
  await evoluirProcessoAcao(processoId, { acao: "REGISTRAR_PROVA_REINTEGRACAO", resultadoProva: dados.resultadoProva });
}

// v3.6 — recurso de JAI/JEA (Art. 108 §3º/123): destino é a instância
// territorial imediatamente superior (cadastrada em OrgaosLocais) ou um
// órgão central (tipicamente CEI).
function pedirRecurso() {
  return new Promise(async resolve => {
    const orgaosRes = await fetchProtegido(`${API_BASE}/orgaos`);
    const orgaos = await listaDaApi(orgaosRes);
    const locaisRes = await fetchProtegido(`${API_BASE}/catalogos/orgaosLocais`);
    const locais = (await listaDaApi(locaisRes)).filter(o => o.ativo !== false && ["JEA", "TER"].includes(o.sigla));
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Recorrer para instância superior</h3>
      <div class="input-group">
        <label>Destino:</label>
        <select id="modalOrgaoDestino">
          ${orgaos.map(o => `<option value="central:${o.orgaoId}">${escaparHtmlEbd(o.sigla)}</option>`).join("")}
          ${locais.map(o => `<option value="local:${o.orgaoLocalId}">${escaparHtmlEbd(o.sigla)} — ${escaparHtmlEbd(o.nome)}</option>`).join("")}
        </select>
      </div>
      <div class="input-group">
        <label>Justificativa (obrigatória):</label>
        <textarea id="modalJustificativaRecurso" rows="3"></textarea>
      </div>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar" id="modalConfirmar">Recorrer</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    document.getElementById("modalConfirmar").onclick = () => {
      const [orgaoDestinoTipo, orgaoDestinoId] = document.getElementById("modalOrgaoDestino").value.split(":");
      const justificativa = document.getElementById("modalJustificativaRecurso").value.trim();
      fecharModal();
      resolve({ orgaoDestinoTipo: orgaoDestinoTipo === "central" ? "CENTRAL" : "LOCAL", orgaoDestinoId, justificativa });
    };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

async function recorrerAcao(processoId) {
  const dados = await pedirRecurso();
  if (!dados) return;
  if (!dados.justificativa) { mostrarToast("Justificativa é obrigatória para recorrer.", "erro"); return; }
  await evoluirProcessoAcao(processoId, { acao: "RECORRER", ...dados });
}

async function homologarExclusaoAcao(processoId) {
  const homologado = await confirmarAcao("Homologar esta Exclusão/Disciplina Rigorosa? Isso encerra Assentos/Liderança/Cargo Ministerial da pessoa (Art. 94, II).", "Homologar");
  if (!homologado) return;
  await evoluirProcessoAcao(processoId, { acao: "HOMOLOGAR_EXCLUSAO", homologado: true });
}

// Modal customizado (mesmo padrão de pedirTexto/confirmarAcao) — Promise<{resultado, diasSancao}|null>.
async function pedirJulgamento() {
  const penRes = await fetchProtegido(`${API_BASE}/catalogos/tiposPenalidade`);
  const penalidades = (await penRes.json()).filter(p => p.ativo !== false && p.codigo !== "EXCLUSAO");

  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Julgar processo</h3>
      <div class="input-group">
        <label>Resultado:</label>
        <select id="modalResultado">
          <option value="ARQUIVADO">Arquivado (sem sanção)</option>
          <option value="SANCAO">Sanção</option>
          <option value="EXCLUSAO">Exclusão</option>
        </select>
      </div>
      <div class="input-group" id="modalGrupoPenalidade">
        <label>Penalidade (Art. 95 §2º):</label>
        <select id="modalPenalidade">${penalidades.map(p => `<option value="${p.penalidadeId}">${escaparHtmlEbd(p.nome)}</option>`).join("")}</select>
      </div>
      <div class="input-group" id="modalGrupoDias">
        <label>Dias de sanção (deixe em branco para prazo indeterminado):</label>
        <input type="number" id="modalDiasSancao" min="1" />
      </div>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar" id="modalConfirmar">Julgar</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    const selectResultado = document.getElementById("modalResultado");
    const grupoDias = document.getElementById("modalGrupoDias");
    const grupoPenalidade = document.getElementById("modalGrupoPenalidade");
    const atualizarVisibilidade = () => {
      const ehSancao = selectResultado.value === "SANCAO";
      grupoDias.style.display = ehSancao ? "block" : "none";
      grupoPenalidade.style.display = ehSancao ? "block" : "none";
    };
    selectResultado.addEventListener("change", atualizarVisibilidade);
    atualizarVisibilidade();
    document.getElementById("modalConfirmar").onclick = () => {
      const resultado = selectResultado.value;
      if (resultado === "SANCAO" && penalidades.length === 0) { mostrarToast("Cadastre ao menos 1 penalidade no catálogo antes de julgar.", "erro"); return; }
      const penalidadeId = resultado === "SANCAO" ? document.getElementById("modalPenalidade").value : null;
      const diasSancao = document.getElementById("modalDiasSancao").value || null;
      fecharModal();
      resolve({ resultado, penalidadeId, diasSancao });
    };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

// Promise<{novoDiasSancao, justificativa}|null> — justificativa é validada no chamador.
function pedirAjustePrazo() {
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Ajustar prazo da sanção</h3>
      <div class="input-group">
        <label>Novo total de dias de sanção (deixe em branco para tornar indeterminado):</label>
        <input type="number" id="modalNovoDias" min="1" />
      </div>
      <div class="input-group">
        <label>Justificativa (obrigatória — fica registrada na auditoria):</label>
        <textarea id="modalJustificativa" rows="3"></textarea>
      </div>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar" id="modalConfirmar">Ajustar</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    document.getElementById("modalConfirmar").onclick = () => {
      const novoDiasSancao = document.getElementById("modalNovoDias").value || null;
      const justificativa = document.getElementById("modalJustificativa").value.trim();
      fecharModal();
      resolve({ novoDiasSancao, justificativa });
    };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

async function julgarProcessoAcao(processoId) {
  const dados = await pedirJulgamento();
  if (!dados) return;
  const res = await fetchProtegido(`${API_BASE}/processos-disciplinares/${processoId}/evoluir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao: "JULGAR", resultado: dados.resultado, penalidadeId: dados.penalidadeId, diasSancao: dados.diasSancao })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarProcessosDisciplinares();
}

async function ajustarPrazoProcessoAcao(processoId) {
  const dados = await pedirAjustePrazo();
  if (!dados) return;
  if (!dados.justificativa) {
    mostrarToast("Justificativa é obrigatória para ajustar o prazo.", "erro");
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/processos-disciplinares/${processoId}/evoluir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao: "AJUSTAR_PRAZO", novoDiasSancao: dados.novoDiasSancao, prazoIndeterminado: !dados.novoDiasSancao, justificativa: dados.justificativa })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarProcessosDisciplinares();
}

// ---- ABA PERDA DE MEMBRESIA: Abandono Eclesiástico Material (v1.5 — Reg. Art. 11) ----
async function carregarRadarAbandono() {
  const container = document.getElementById("resultadoRadarAbandono");
  const res = await fetchProtegido(`${API_BASE}/radar-abandono`);
  const membros = await jsonDaTela(res, container, "lista");
  if (membros === null) return;

  if (!Array.isArray(membros) || membros.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum membro Sem Comunhão com Data de Afastamento lançada.</p>";
    return;
  }

  container.innerHTML = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Congregação</th><th>Afastado desde</th><th>Dias</th><th></th>
  </tr></thead><tbody>` +
    membros.map(m => `<tr>
      <td>${escaparHtmlEbd(m.nome)}</td>
      <td>${escaparHtmlEbd(m.congregacao) || "-"}</td>
      <td>${escaparHtmlEbd(m.dataAfastamento) || "-"}</td>
      <td>${escaparHtmlEbd(m.diasAfastado ?? "-")}</td>
      <td class="acoes-inline">${m.elegivel ? `<button class="btn-link" data-on-click="abrirProcedimentoAbandonoAcao" data-args-click="${argsAttr(m.membroId, "MATERIAL")}">Abrir Procedimento</button>` : "aguardando 90 dias"}</td>
    </tr>`).join("") + "</tbody></table>";
}

const ROTULO_TIPO_ABANDONO = { MATERIAL: "Material", DIGITAL: "Digital" };

// Fecho 03/10/2026: no Digital, abrir o procedimento É a notificação final (Estatuto Art. 12 §2º) — quem abre escolhe o canal oficial pelo qual está notificando,
// e o prazo de 15 dias conta de hoje. Promise<number|null>: o canal escolhido, ou null se cancelou.
async function escolherCanalNotificacaoFinal() {
  let canais = [];
  try {
    const res = await fetchProtegido(`${API_BASE}/canais/para-contato`);
    const data = await res.json();
    if (data && data.sucesso !== false && Array.isArray(data.canais)) canais = data.canais;
  } catch { /* sem a lista não há como notificar */ }
  if (!canais.length) { mostrarToast("Nenhum canal institucional de contato cadastrado: cadastre um em Canais antes de abrir o procedimento Digital.", "erro"); return null; }
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Notificação final (Abandono Digital)</h3>
      <p class="subtitle">Abrir o procedimento registra hoje a notificação final pelo canal escolhido (Estatuto Art. 12 §2º). Envie a mensagem ao membro por esse canal: o prazo de defesa de 15 dias conta a partir de hoje.</p>
      <select id="modalCanalNotificacao">${canais.map(c => `<option value="${Number(c.canalId)}">${escaparHtmlEbd(c.nome)}${c.identificador ? ` — ${escaparHtmlEbd(c.identificador)}` : ""}</option>`).join("")}</select>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar btn-perigo" id="modalConfirmar">Notificar e abrir</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    document.getElementById("modalConfirmar").onclick = () => { const v = Number(document.getElementById("modalCanalNotificacao").value); fecharModal(); resolve(v || null); };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

async function abrirProcedimentoAbandonoAcao(membroId, tipo) {
  tipo = tipo || "MATERIAL";
  const rotulo = ROTULO_TIPO_ABANDONO[tipo] || tipo;
  let canalNotificacaoId = null;
  if (tipo === "DIGITAL") {
    canalNotificacaoId = await escolherCanalNotificacaoFinal();
    if (!canalNotificacaoId) return;
  } else if (!(await confirmarAcao(`Abrir o procedimento sumário de constatação de Abandono ${rotulo} para este membro? Ele passa a contar o prazo de defesa de 15 dias. A homologação será de outra pessoa do nível geral.`, "Abrir Procedimento"))) return;
  const res = await fetchProtegido(`${API_BASE}/procedimentos-abandono`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, tipo, canalNotificacaoId })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarRadarAbandono(); carregarRadarAbandonoDigital(); carregarProcedimentosAbandono(); }
}

const ROTULO_STATUS_ABANDONO = { NOTIFICADO: "Notificado (em prazo de defesa)", HOMOLOGADO: "Homologado (perda efetivada)", ARQUIVADO: "Arquivado" };
function badgeStatusAbandono(status) {
  const cores = { NOTIFICADO: "badge-licenca", HOMOLOGADO: "badge-desligado", ARQUIVADO: "badge-ativo" };
  return `<span class="badge-status ${cores[status] || ""}">${ROTULO_STATUS_ABANDONO[status] || escaparHtmlEbd(status)}</span>`;
}

async function carregarProcedimentosAbandono() {
  const container = document.getElementById("resultadoListaAbandono");
  const res = await fetchProtegido(`${API_BASE}/procedimentos-abandono`);
  const procedimentos = await jsonDaTela(res, container, "lista");
  if (procedimentos === null) return;

  if (!Array.isArray(procedimentos) || procedimentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum procedimento aberto.</p>";
    return;
  }

  container.innerHTML = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Tipo</th><th>Status</th><th>Notificado em</th><th>Aberto por</th><th>Recurso</th><th></th>
  </tr></thead><tbody>` +
    procedimentos.map(p => `<tr>
      <td>${escaparHtmlEbd(p.nome)}</td>
      <td>${ROTULO_TIPO_ABANDONO[p.tipo] || escaparHtmlEbd(p.tipo)}</td>
      <td>${badgeStatusAbandono(p.status)}${p.status === "NOTIFICADO" ? (p.prazoVencido ? " ⏰ prazo vencido" : (p.prazoVenceEm ? ` (defesa até ${escaparHtmlEbd(p.prazoVenceEm)})` : "")) : ""}</td>
      <td>${escaparHtmlEbd(p.dataNotificacao) || "-"}</td>
      <td>${p.abertoPorNome ? escaparHtmlEbd(p.abertoPorNome) : "-"}</td>
      <td>${p.recursoInterposto ? `${escaparHtmlEbd(p.resultadoRecurso) || "PENDENTE"} (${escaparHtmlEbd(p.dataRecurso) || "-"})` : "-"}</td>
      <td class="acoes-inline">
        ${authGeral && p.status === "NOTIFICADO" && !p.abertoPorMim ? `<button class="btn-link" data-on-click="homologarProcedimentoAbandonoAcao" data-args-click="${argsAttr(p.procedimentoId)}">Homologar</button>` : ""}
        ${authGeral && p.status === "NOTIFICADO" && p.abertoPorMim ? `<span class="subtitle" title="Regra dos dois olhos">homologação: outra pessoa</span>` : ""}
        ${p.status === "NOTIFICADO" ? `<button class="btn-link" data-on-click="arquivarProcedimentoAbandonoAcao" data-args-click="${argsAttr(p.procedimentoId)}">Arquivar</button>` : ""}
        ${authGeral && p.status === "HOMOLOGADO" && !p.recursoInterposto ? `<button class="btn-link" data-on-click="registrarRecursoAbandonoAcao" data-args-click="${argsAttr(p.procedimentoId)}">Registrar Recurso</button>` : ""}
      </td>
    </tr>`).join("") + "</tbody></table>";
}

// ---- Abandono Digital (Art. 12 §2º): canais + tentativas de contato + radar próprio ----
// v7.3: os canais vêm de /api/canais/para-contato (login) — só os que valem como tentativa de contato
// individual institucional (e-mail, telefone/WhatsApp institucional, o próprio sistema); grupo e rede social não entram.
async function carregarOpcoesTentativaContato() {
  const select = document.getElementById("tentativaCanal");
  if (!select) return;
  let canais = [];
  try {
    const res = await fetchProtegido(`${API_BASE}/canais/para-contato`);
    const data = await res.json();
    if (data && data.sucesso !== false && Array.isArray(data.canais)) canais = data.canais;
  } catch { /* sem a lista, o seletor fica vazio e a tentativa não é registrada sem canal */ }
  select.innerHTML = canais.length
    ? canais.map(c => `<option value="${Number(c.canalId)}">${escaparHtmlEbd(c.nome)}${c.identificador ? ` — ${escaparHtmlEbd(c.identificador)}` : ""}${c.cadastroIncompleto ? " (cadastro incompleto)" : ""}</option>`).join("")
    : `<option value="">— nenhum canal institucional de contato cadastrado —</option>`;
}

async function registrarTentativaContatoAcao() {
  const membroId = document.getElementById("tentativaMatricula").value;
  const canalId = document.getElementById("tentativaCanal").value;
  const dataTentativa = document.getElementById("tentativaData").value || null;
  const observacao = document.getElementById("tentativaObservacao").value.trim() || null;
  const msg = document.getElementById("resultadoTentativaContato");
  if (!membroId || !canalId) {
    msg.textContent = "Informe matrícula e canal.";
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/tentativas-contato`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, canalId, dataTentativa, observacao })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("tentativaObservacao").value = "";
    carregarTentativasContatoLista(membroId);
    carregarRadarAbandonoDigital();
  }
}

async function carregarTentativasContatoLista(membroId) {
  const container = document.getElementById("resultadoTentativasContato");
  if (!container || !membroId) return;
  const res = await fetchProtegido(`${API_BASE}/tentativas-contato?membroId=${membroId}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  const tentativas = data.tentativas || [];
  const e = data.elegibilidade || {};

  const resumo = `<p class="subtitle">${escaparHtmlEbd(e.canaisDistintos ?? 0)}/2 canais distintos` +
    (e.diasDesdePrimeira != null ? `, ${escaparHtmlEbd(e.diasDesdePrimeira)}/90 dias desde a 1ª tentativa` : "") +
    ` — ${e.elegivel ? "✅ elegível para abrir o procedimento" : "ainda não elegível"}.</p>`;

  if (tentativas.length === 0) {
    container.innerHTML = resumo + "<p class='subtitle'>Nenhuma tentativa registrada para esta matrícula.</p>";
    return;
  }

  container.innerHTML = resumo + `<table class="tabela-frequencia"><thead><tr>
    <th>Canal</th><th>Data</th><th>Observação</th>
  </tr></thead><tbody>` +
    tentativas.map(t => `<tr><td>${escaparHtmlEbd(t.canal)}</td><td>${escaparHtmlEbd(t.dataTentativa)}</td><td>${escaparHtmlEbd(t.observacao) || "-"}</td></tr>`).join("") + "</tbody></table>";
}

async function carregarRadarAbandonoDigital() {
  const container = document.getElementById("resultadoRadarAbandonoDigital");
  if (!container) return;
  const res = await fetchProtegido(`${API_BASE}/radar-abandono-digital`);
  const membros = await jsonDaTela(res, container, "lista");
  if (membros === null) return;

  if (!Array.isArray(membros) || membros.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum membro com tentativa de contato registrada.</p>";
    return;
  }

  container.innerHTML = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Congregação</th><th>Canais distintos</th><th>Dias desde a 1ª tentativa</th><th></th>
  </tr></thead><tbody>` +
    membros.map(m => `<tr>
      <td>${escaparHtmlEbd(m.nome)}</td>
      <td>${escaparHtmlEbd(m.congregacao) || "-"}</td>
      <td>${escaparHtmlEbd(m.canaisDistintos)}/2</td>
      <td>${escaparHtmlEbd(m.diasDesdePrimeira ?? "-")}</td>
      <td class="acoes-inline">${m.elegivel ? `<button class="btn-link" data-on-click="abrirProcedimentoAbandonoAcao" data-args-click="${argsAttr(m.membroId, "DIGITAL")}">Abrir Procedimento</button>` : "requisitos incompletos"}</td>
    </tr>`).join("") + "</tbody></table>";
}

async function homologarProcedimentoAbandonoAcao(procedimentoId) {
  if (!(await confirmarAcao("Homologar a constatação de abandono? A membresia é encerrada de verdade (desligamento, assento/liderança/cargo encerrados).", "Homologar"))) return;
  const res = await fetchProtegido(`${API_BASE}/procedimentos-abandono/${procedimentoId}/evoluir`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "HOMOLOGAR" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarProcedimentosAbandono(); carregarRadarAbandono(); }
}

async function arquivarProcedimentoAbandonoAcao(procedimentoId) {
  if (!(await confirmarAcao("Arquivar este procedimento (o membro voltou a comparecer)?", "Arquivar"))) return;
  const res = await fetchProtegido(`${API_BASE}/procedimentos-abandono/${procedimentoId}/evoluir`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "ARQUIVAR" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarProcedimentosAbandono();
}

async function registrarRecursoAbandonoAcao(procedimentoId) {
  if (!(await confirmarAcao("Registrar o Recurso à Assembleia para este procedimento? (sem efeito suspensivo — a perda de membresia já vale)", "Registrar Recurso"))) return;
  const res = await fetchProtegido(`${API_BASE}/procedimentos-abandono/${procedimentoId}/evoluir`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "RECURSO" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarProcedimentosAbandono();
}

registrarAcoes({
  abrirProcedimentoAbandonoAcao, afastarCautelarAcao, ajustarPrazoProcessoAcao, arquivarProcedimentoAbandonoAcao, citarAcao, designarDefensorAcao,
  designarRelatorAcao, homologarExclusaoAcao, homologarProcedimentoAbandonoAcao, julgarProcessoAcao, recorrerAcao, registrarDefesaAcao,
  registrarProvaReintegracaoAcao, registrarRecursoAbandonoAcao, registrarTentativaContatoAcao, salvarProcessoDisciplinar
});
