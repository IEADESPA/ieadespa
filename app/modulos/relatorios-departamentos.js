// app/modulos/relatorios-departamentos.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- RELATÓRIOS DE DEPARTAMENTOS (v5.2 — formulário dinâmico) ----
const ROTULO_GRUPO_RD = { CONTAGEM: "Contagem", ACOES: "Ações", FINANCEIRO: "Financeiro" };
const NOMES_DOMINGO_RD = ["1º", "2º", "3º", "4º", "5º"];
let _rdSchemaAtual = null;
let _rdRelatorioIdAtual = null;

async function carregarOpcoesRelatorioDepto() {
  const selCong = document.getElementById("rdCongregacao");
  const selDep = document.getElementById("rdDepartamento");
  const inputAno = document.getElementById("rdAno");
  if (!inputAno.value) inputAno.value = new Date().getFullYear();
  document.getElementById("rdMes").value = String(new Date().getMonth() + 1);

  if (!selCong.dataset.montado) {
    const congs = await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/congregacoes`));
    const opcoesCong = congs.filter(c => c.ativa !== false).map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("");
    selCong.innerHTML = opcoesCong;
    selCong.dataset.montado = "1";
    const selCdCong = document.getElementById("cdCongregacao");
    if (selCdCong && !selCdCong.dataset.montado) { selCdCong.innerHTML = opcoesCong; selCdCong.dataset.montado = "1"; }
  }
  const selCdArea = document.getElementById("cdArea");
  if (selCdArea && !selCdArea.dataset.montado) {
    const areas = await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/areas`));
    selCdArea.innerHTML = areas.filter(a => a.ativa !== false).map(a => `<option value="${a.areaId}">${escaparHtmlEbd(a.nome)}</option>`).join("");
    selCdArea.dataset.montado = "1";
  }
  // v5.8 — Região/Quadrante/Distrito, mesmo padrão de montagem de Área acima.
  const CD_CATALOGOS_TERRITORIAIS = [
    { selId: "cdRegiao", rota: "regioes", chave: "regiaoId" },
    { selId: "cdQuadrante", rota: "quadrantes", chave: "quadranteId" },
    { selId: "cdDistrito", rota: "distritos", chave: "distritoId" }
  ];
  for (const { selId, rota, chave } of CD_CATALOGOS_TERRITORIAIS) {
    const sel = document.getElementById(selId);
    if (sel && !sel.dataset.montado) {
      const itens = await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/${rota}`));
      // Regioes usa "ativa", Quadrantes/Distritos usa "ativo" (GestaoCatalogos)
      // — confere os dois pra não incluir inativo por engano nem excluir
      // ativo por checar o campo errado.
      sel.innerHTML = itens.filter(i => i.ativa !== false && i.ativo !== false).map(i => `<option value="${escaparHtmlEbd(i[chave])}">${escaparHtmlEbd(i.nome)}</option>`).join("");
      sel.dataset.montado = "1";
    }
  }
  const selSerieDep = document.getElementById("cdSerieDepartamento");
  if (selSerieDep && !selSerieDep.dataset.montado) {
    const deps = await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/departamentos`));
    selSerieDep.innerHTML = deps.filter(d => d.ativo !== false).map(d => `<option value="${d.departamentoId}">${d.numero ? `${escaparHtmlEbd(String(d.numero).padStart(2, "0"))} — ` : ""}${escaparHtmlEbd(d.nome)}</option>`).join("");
    selSerieDep.dataset.montado = "1";
  }
  const cdAno = document.getElementById("cdAno");
  if (cdAno && !cdAno.value) cdAno.value = new Date().getFullYear();
  const cdMes = document.getElementById("cdMes");
  if (cdMes) cdMes.value = String(new Date().getMonth() + 1);
  if (!selDep.dataset.montado) {
    const deps = await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/departamentos`));
    const opcoesDep = deps.filter(d => d.ativo !== false).map(d => `<option value="${d.departamentoId}">${d.numero ? `${escaparHtmlEbd(String(d.numero).padStart(2, "0"))} — ` : ""}${escaparHtmlEbd(d.nome)}</option>`).join("");
    selDep.innerHTML = opcoesDep;
    selDep.dataset.montado = "1";
    const selTdDep = document.getElementById("tdDepartamento");
    if (selTdDep && !selTdDep.dataset.montado) { selTdDep.innerHTML = opcoesDep; selTdDep.dataset.montado = "1"; }
  }
  const tdAno = document.getElementById("tdAno");
  if (tdAno && !tdAno.value) tdAno.value = new Date().getFullYear();
  const tdMes = document.getElementById("tdMes");
  if (tdMes) tdMes.value = String(new Date().getMonth() + 1);
}

async function abrirRelatorioDeptoAcao() {
  const congregacaoId = document.getElementById("rdCongregacao").value;
  const departamentoId = document.getElementById("rdDepartamento").value;
  const mesReferencia = document.getElementById("rdMes").value;
  const anoReferencia = document.getElementById("rdAno").value;
  const msg = document.getElementById("resultadoRelatorioDepto");
  if (!congregacaoId || !departamentoId || !anoReferencia) { msg.textContent = "Escolha congregação, departamento e ano."; return; }

  const res = await fetchProtegido(`${API_BASE}/relatorios-departamentais`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ congregacaoId, departamentoId, mesReferencia, anoReferencia })
  });
  const data = await res.json();
  if (data.sucesso === false) { msg.textContent = data.mensagem; document.getElementById("painelRelatorioDepto").innerHTML = ""; return; }
  msg.textContent = "";
  renderizarPainelRelatorioDepto(data);
}

// v5.4 — rateio linha a linha, sempre calculado a partir do perfil do
// departamento (nunca digitado, exceto VARIAVEL_MANUAL — aí quem lança o
// relatório decide quanto sobe pro geral, e o resto vai pra local por
// subtração, nunca os dois digitados separado).
function montarRateioRd(data, somenteLeitura) {
  const r = data.rateio || {};
  if (r.precisaValorManual) {
    return `<div class="input-group"><label>Quanto vai pro Geral neste mês (variável, decidido agora)</label>
      <input type="number" step="0.01" min="0" ${somenteLeitura ? "readonly" : ""} id="rdValorManualParaGeral" value="${escaparHtmlEbd(data.valorManualParaGeral) || 0}" /></div>
      <p class="subtitle">Para o Local (resto, calculado): R$ ${Number(r.paraLocal || 0).toFixed(2)}</p>`;
  }
  const paraLocalTexto = r.paraLocal === null ? "não rastreado (lançamento já líquido)" : `R$ ${Number(r.paraLocal || 0).toFixed(2)}`;
  return `<p class="subtitle">Rateio (${escaparHtmlEbd(r.metodo) || "-"}): Para o Geral R$ ${Number(r.paraGeral || 0).toFixed(2)} · Para o Local ${paraLocalTexto}</p>`;
}

function campoInputAttrs(campo, somenteLeitura) {
  const tipo = campo.tipoDado === "MOEDA" ? `type="number" step="0.01" min="0"` : `type="number" step="1" min="0"`;
  return somenteLeitura ? `${tipo} readonly` : tipo;
}

// Quem pode editar os campos na tela agora — sempre reconferido pelo
// backend (isto aqui só evita mostrar um campo "editável" que ia dar 403):
// RASCUNHO é do Líder Local; ENVIADO/APROVADO_AREA só reabre pro Líder
// Geral/GLOBAL corrigir (docs/03 — sem comprovante anexado, é assim que se
// ajusta o que foi lançado errado); depois de APROVADO_GERAL, só GLOBAL
// retificando.
function podeEditarValoresRd(status) {
  if (status === "RASCUNHO") return true;
  if ((status === "ENVIADO" || status === "APROVADO_AREA") && (authNivel === "DEPARTAMENTO" || authNivel === "GLOBAL")) return true;
  if ((status === "APROVADO_GERAL" || status === "RETIFICADO") && authNivel === "GLOBAL") return true;
  return false;
}

function renderizarPainelRelatorioDepto(data) {
  _rdSchemaAtual = data.schema;
  _rdRelatorioIdAtual = data.relatorioDepartamentalId;
  const container = document.getElementById("painelRelatorioDepto");
  const rotuloLocal = data.schema.rotuloPapelLocal || "Líder Local";
  const temMensalidade = data.schema.campos.some(c => c.nomeCampo === "mensalidades");
  const somenteLeitura = !podeEditarValoresRd(data.status);

  const gruposHtml = ["CONTAGEM", "ACOES", "FINANCEIRO"].map(grupo => {
    const campos = data.schema.campos.filter(c => c.grupo === grupo);
    if (campos.length === 0) return "";
    const linhas = campos.map(c => {
      if (c.permiteSemanal) {
        const semanas = data.valoresSemanais[c.nomeCampo] || {};
        const inputsSemana = NOMES_DOMINGO_RD.map((rotulo, i) => {
          const n = i + 1;
          return `<label style="display:inline-block;margin-right:8px;">${rotulo}<br/><input ${campoInputAttrs(c, somenteLeitura)} id="rdSemana_${escaparHtmlEbd(c.nomeCampo)}_${n}" value="${escaparHtmlEbd(semanas[n]) || 0}" style="width:70px;" /></label>`;
        }).join("");
        return `<div class="input-group"><label>${escaparHtmlEbd(c.rotulo)} (total do mês: ${escaparHtmlEbd(data.valores[c.nomeCampo]) || 0})</label><div>${inputsSemana}</div></div>`;
      }
      // v5.5 — Congregados/Membros em Comunhão/Membros sem Comunhão (nos 4
      // deptos de faixa etária/gênero) vêm do cadastro de membros — sempre
      // readonly, nunca reconta à mão (integração automática).
      if (c.automatico) {
        return `<div class="input-group"><label>${escaparHtmlEbd(c.rotulo)} <span class="subtitle">(calculado do cadastro de membros)</span></label>
          <input type="number" readonly id="rdCampo_${escaparHtmlEbd(c.nomeCampo)}" value="${escaparHtmlEbd(data.valores[c.nomeCampo]) || 0}" /></div>`;
      }
      return `<div class="input-group"><label>${escaparHtmlEbd(c.rotulo)}</label><input ${campoInputAttrs(c, somenteLeitura)} id="rdCampo_${escaparHtmlEbd(c.nomeCampo)}" value="${escaparHtmlEbd(data.valores[c.nomeCampo]) || 0}" /></div>`;
    }).join("");
    const totalFinanceiro = grupo === "FINANCEIRO"
      ? `<p class="subtitle"><strong>Valor Total (base do rateio local/geral): R$ ${Number(data.valorTotalFinanceiro || 0).toFixed(2)}</strong></p>${montarRateioRd(data, somenteLeitura)}` : "";
    return `<h4>${ROTULO_GRUPO_RD[grupo]}</h4>${linhas}${totalFinanceiro}`;
  }).join("");

  const roAttr = somenteLeitura ? "readonly" : "";
  const eventosHtml = `<h4>Eventos</h4>
    <div class="input-group"><label>Local</label><input type="number" min="0" ${roAttr} id="rdEventoLocal" value="${escaparHtmlEbd(data.eventos.local)}" /></div>
    <div class="input-group"><label>Área</label><input type="number" min="0" ${roAttr} id="rdEventoArea" value="${escaparHtmlEbd(data.eventos.area)}" /></div>
    <div class="input-group"><label>Geral</label><input type="number" min="0" ${roAttr} id="rdEventoGeral" value="${escaparHtmlEbd(data.eventos.geral)}" /></div>`;

  const integracaoHtml = `<h4>Integração</h4>
    <div class="input-group"><label>Conversão</label><input type="number" min="0" ${roAttr} id="rdIntegConversao" value="${escaparHtmlEbd(data.integracao.conversao)}" /></div>
    <div class="input-group"><label>Reconciliação</label><input type="number" min="0" ${roAttr} id="rdIntegReconciliacao" value="${escaparHtmlEbd(data.integracao.reconciliacao)}" /></div>
    <div class="input-group"><label>De Outra Igreja</label><input type="number" min="0" ${roAttr} id="rdIntegDeOutraIgreja" value="${escaparHtmlEbd(data.integracao.deOutraIgreja)}" /></div>
    <p class="subtitle">Total: ${escaparHtmlEbd(data.integracao.total)}</p>`;

  const contribuintesHtml = temMensalidade ? `<h4>Contribuintes de Mensalidade</h4>
    <div id="rdListaContribuintes">${(data.contribuintes || []).map(c => linhaContribuinteRd(c, somenteLeitura)).join("")}</div>
    ${somenteLeitura ? "" : `<button type="button" class="btn-link" data-on-click="adicionarLinhaContribuinteRd">➕ Adicionar contribuinte</button>`}` : "";

  container.innerHTML = `
    <p><strong>${escaparHtmlEbd(rotuloLocal)}:</strong> preenchendo ${escaparHtmlEbd(data.congregacaoNome)} — ${escaparHtmlEbd(data.departamentoNome)} — ${escaparHtmlEbd(data.mesReferencia)}/${escaparHtmlEbd(data.anoReferencia)}
      (status: <strong>${ROTULO_STATUS_RD[data.status] || escaparHtmlEbd(data.status)}</strong>${data.atrasado ? ` — <span style="color:var(--cor-perigo,#c0392b);">⚠️ atrasado</span>` : ""})</p>
    ${gruposHtml}
    ${eventosHtml}
    ${integracaoHtml}
    ${contribuintesHtml}
    ${montarAcoesFluxoRd(data)}
    <div id="rdTrilha">${montarTrilhaRd(data.trilha)}</div>
  `;
}

// ---- Fluxo de aprovação (v5.3) — 2 camadas (Área → Geral) + retificação
// GLOBAL. Pesquisa no Regimento: Região/Quadrante são representados por
// delegação (Pastor de Área, Art. 104-B), sem ação direta — por isso não
// aparecem aqui; Distrito é só FASE 9. Os botões só aparecem quando o
// `authNivel` da sessão já autoriza a ação (o backend sempre confere de
// novo — isso aqui é só não oferecer um botão que ia dar 403).
const ROTULO_STATUS_RD = {
  RASCUNHO: "Rascunho", ENVIADO: "Enviado", APROVADO_AREA: "Aprovado (Área)",
  APROVADO_GERAL: "Aprovado (Geral) — definitivo", RETIFICADO: "Retificado"
};
const ROTULO_ACAO_RD = {
  ENVIAR: "Enviou", APROVAR_AREA: "Aprovou (Área)", COMENTOU: "Comentou", COMENTAR: "Comentou",
  CORRIGIR: "Corrigiu valores", APROVAR_GERAL: "Aprovou (Geral)", RETIFICAR: "Retificou", REABRIR: "Reabriu"
};

function montarAcoesFluxoRd(data) {
  const status = data.status;
  const botoes = [];

  if (status === "RASCUNHO") {
    botoes.push(`<button class="btn-confirmar" data-on-click="salvarRelatorioDeptoAcao">💾 Salvar Rascunho</button>`);
    if (authNivel === "CONGREGACAO" || authNivel === "GLOBAL") {
      botoes.push(`<button class="btn-confirmar btn-secundario" data-on-click="acaoFluxoRd" data-args-click="${argsAttr("enviar")}">📤 Enviar</button>`);
    }
  }

  if ((status === "ENVIADO" || status === "APROVADO_AREA") && (authNivel === "AREA" || authNivel === "GLOBAL")) {
    if (status === "ENVIADO") botoes.push(`<button class="btn-confirmar" data-on-click="acaoFluxoRd" data-args-click="${argsAttr("aprovar-area")}">✅ Aprovar (Área)</button>`);
    botoes.push(`<button class="btn-confirmar btn-secundario" data-on-click="comentarFluxoRdAcao">💬 Comentar</button>`);
  }

  if ((status === "ENVIADO" || status === "APROVADO_AREA") && (authNivel === "DEPARTAMENTO" || authNivel === "GLOBAL")) {
    botoes.push(`<button class="btn-confirmar" data-on-click="acaoFluxoRd" data-args-click="${argsAttr("corrigir")}">✏️ Salvar Correção</button>`);
    botoes.push(`<button class="btn-confirmar btn-secundario" data-on-click="acaoFluxoRd" data-args-click="${argsAttr("aprovar-geral")}">✅ Aprovar (Geral) — definitivo</button>`);
  }

  if ((status === "APROVADO_GERAL" || status === "RETIFICADO") && authNivel === "GLOBAL") {
    botoes.push(`<button class="btn-confirmar btn-secundario" data-on-click="acaoFluxoRd" data-args-click="${argsAttr("retificar")}">🔓 Retificar (edita os campos acima e clique aqui)</button>`);
    // v5.8 — Reabertura: diferente de Retificar (que corrige o valor sem
    // reabrir o fluxo), Reabrir devolve o relatório pra Enviado, reentrando
    // no funil de aprovação inteiro — só Presidente/Secretário Geral (GLOBAL)
    // e sempre com justificativa (o backend recusa sem ela).
    botoes.push(`<button class="btn-confirmar btn-perigo" data-on-click="reabrirRelatorioDeptoAcao">↩️ Reabrir relatório</button>`);
  }

  return botoes.length ? `<h4>Fluxo de Aprovação</h4><div class="barra-lista">${botoes.join("")}</div>` : "";
}

async function reabrirRelatorioDeptoAcao() {
  const justificativa = prompt("Justificativa da reabertura (obrigatória — fica na trilha auditada do relatório):");
  if (justificativa === null) return;
  if (!justificativa.trim()) { mostrarToast("Informe a justificativa da reabertura.", "erro"); return; }
  await acaoFluxoRd("reabrir", { justificativa: justificativa.trim() });
}

function montarTrilhaRd(trilha) {
  if (!trilha || trilha.length === 0) return "";
  const linhas = trilha.map(t => `<tr>
    <td>${new Date(t.criadoEm).toLocaleString("pt-BR")}</td>
    <td>${escaparHtmlEbd(t.nomeMembro)}</td>
    <td>${ROTULO_ACAO_RD[t.acao] || escaparHtmlEbd(t.acao)} (${escaparHtmlEbd(t.nivelAprovador)})</td>
    <td>${escaparHtmlEbd(t.comentario) || "-"}</td>
  </tr>`).join("");
  return `<h4>Trilha</h4><div class="rolagem-tabela"><table class="tabela-frequencia">
    <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Comentário</th></tr></thead>
    <tbody>${linhas}</tbody></table></div>`;
}

async function comentarFluxoRdAcao() {
  const comentario = prompt("Comentário pra quem preencheu o relatório:");
  if (!comentario || !comentario.trim()) return;
  await acaoFluxoRd("comentar", { comentario: comentario.trim() });
}

async function acaoFluxoRd(acao, extra) {
  if (!_rdRelatorioIdAtual) return;
  const corpo = (acao === "corrigir" || acao === "retificar") ? coletarValoresFormularioRd() : {};
  Object.assign(corpo, extra || {});
  const res = await fetchProtegido(`${API_BASE}/relatorios-departamentais/${_rdRelatorioIdAtual}/${acao}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo)
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast("✅ Ação registrada.", "sucesso");
  renderizarPainelRelatorioDepto(data);
}

function linhaContribuinteRd(c, somenteLeitura) {
  const ro = somenteLeitura ? "readonly" : "";
  return `<div class="barra-lista rd-linha-contribuinte">
    <input type="text" class="rd-contribuinte-nome" ${ro} placeholder="Nome" value="${(c && escaparHtmlEbd(c.nome)) || ""}" style="min-width:200px;" />
    <input type="number" class="rd-contribuinte-valor" step="0.01" min="0" ${ro} placeholder="Valor" value="${(c && escaparHtmlEbd(c.valor)) || 0}" style="max-width:120px;" />
    ${somenteLeitura ? "" : `<button type="button" class="btn-link" data-on-click="removerPai" data-args-click="${argsAttr(ARG.elemento)}">✕</button>`}
  </div>`;
}
// O antigo onclick="this.parentElement.remove()" (CSP forte: código não fica mais no HTML): tira a linha inteira em que o botão está.
function removerPai(elemento) {
  elemento.parentElement.remove();
}

function adicionarLinhaContribuinteRd() {
  document.getElementById("rdListaContribuintes").insertAdjacentHTML("beforeend", linhaContribuinteRd(null));
}

function coletarValoresFormularioRd() {
  const valores = {};
  const valoresSemanais = {};
  for (const c of _rdSchemaAtual.campos) {
    if (c.permiteSemanal) {
      valoresSemanais[c.nomeCampo] = {};
      for (let n = 1; n <= 5; n++) {
        const el = document.getElementById(`rdSemana_${c.nomeCampo}_${n}`);
        if (el) valoresSemanais[c.nomeCampo][n] = Number(el.value) || 0;
      }
    } else {
      const el = document.getElementById(`rdCampo_${c.nomeCampo}`);
      if (el) valores[c.nomeCampo] = Number(el.value) || 0;
    }
  }
  const eventos = {
    local: Number(document.getElementById("rdEventoLocal").value) || 0,
    area: Number(document.getElementById("rdEventoArea").value) || 0,
    geral: Number(document.getElementById("rdEventoGeral").value) || 0
  };
  const integracao = {
    conversao: Number(document.getElementById("rdIntegConversao").value) || 0,
    reconciliacao: Number(document.getElementById("rdIntegReconciliacao").value) || 0,
    deOutraIgreja: Number(document.getElementById("rdIntegDeOutraIgreja").value) || 0
  };
  const contribuintes = [...document.querySelectorAll(".rd-linha-contribuinte")].map(linha => ({
    nome: linha.querySelector(".rd-contribuinte-nome").value.trim(),
    valor: Number(linha.querySelector(".rd-contribuinte-valor").value) || 0
  })).filter(c => c.nome);
  const corpo = { valores, valoresSemanais, eventos, integracao, contribuintes };
  const elValorManual = document.getElementById("rdValorManualParaGeral");
  if (elValorManual) corpo.valorManualParaGeral = Number(elValorManual.value) || 0;
  return corpo;
}

async function salvarRelatorioDeptoAcao() {
  if (!_rdSchemaAtual || !_rdRelatorioIdAtual) return;
  const res = await fetchProtegido(`${API_BASE}/relatorios-departamentais/${_rdRelatorioIdAtual}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(coletarValoresFormularioRd())
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast("✅ Rascunho salvo.", "sucesso");
  renderizarPainelRelatorioDepto(data);
}

// ---- TESOURARIA DO DEPARTAMENTO (v5.4) ----
let _tdDepartamentoAtual = null, _tdMesAtual = null, _tdAnoAtual = null;

const ROTULO_METODO_RATEIO = {
  INTEGRAL_GERAL: "Integral (100% Geral)", INTEGRAL_LOCAL: "Integral (100% Local)",
  MENSALIDADE_FIXA: "Taxa fixa de mensalidade", PERCENTUAL: "Percentual", VARIAVEL_MANUAL: "Variável / manual"
};

async function abrirTesourariaDeptoAcao() {
  const departamentoId = document.getElementById("tdDepartamento").value;
  const mes = document.getElementById("tdMes").value;
  const ano = document.getElementById("tdAno").value;
  const msg = document.getElementById("resultadoTesourariaDepto");
  if (!departamentoId || !ano) { msg.textContent = "Escolha departamento e ano."; return; }

  const res = await fetchProtegido(`${API_BASE}/tesouraria-departamental?departamentoId=${departamentoId}&mes=${mes}&ano=${ano}`);
  const data = await res.json();
  if (data.sucesso === false) { msg.textContent = data.mensagem; document.getElementById("painelTesourariaDepto").innerHTML = ""; return; }
  msg.textContent = "";
  _tdDepartamentoAtual = Number(departamentoId); _tdMesAtual = Number(mes); _tdAnoAtual = Number(ano);
  await renderizarPainelTesourariaDepto(data);
}

async function renderizarPainelTesourariaDepto(data) {
  const container = document.getElementById("painelTesourariaDepto");
  const perfil = data.perfil || null;

  const avisoBloqueio = data.bloqueado
    ? `<p class="subtitle" style="color:var(--cor-perigo,#c0392b);">⚠️ Balancete do mês anterior não foi entregue — liberação de novos recursos bloqueada (Reg. Art. 133-C §2º).</p>` : "";

  const resumoHtml = `
    <p>Status: <strong>${data.fechado ? "Fechado" : "Em aberto (calculado ao vivo)"}</strong></p>
    ${avisoBloqueio}
    <table class="tabela-frequencia">
      <tbody>
        <tr><td>Saldo transportado</td><td>R$ ${Number(data.saldoTransportado != null ? data.saldoTransportado : data.SaldoTransportado || 0).toFixed(2)}</td></tr>
        <tr><td>Movimentação Geral do mês</td><td>R$ ${Number(data.movimentacaoGeralMes != null ? data.movimentacaoGeralMes : data.MovimentacaoGeralMes || 0).toFixed(2)}</td></tr>
        <tr><td>Investido no Local (informativo)</td><td>R$ ${Number(data.investidoLocal != null ? data.investidoLocal : data.InvestidoLocal || 0).toFixed(2)}${data.temParaLocalNaoRastreado ? " (parcial — parte dos relatórios lança já líquido)" : ""}</td></tr>
        <tr><td>Suporte à Secretaria Geral</td><td>R$ ${Number(data.suporteSecretariaGeral != null ? data.suporteSecretariaGeral : data.SuporteSecretariaGeral || 0).toFixed(2)}</td></tr>
        <tr><td>Despesas</td><td>R$ ${Number(data.totalDespesas != null ? data.totalDespesas : data.TotalDespesas || 0).toFixed(2)}</td></tr>
        <tr><td><strong>Saldo do mês</strong></td><td><strong>R$ ${Number(data.saldoMes != null ? data.saldoMes : data.SaldoMes || 0).toFixed(2)}</strong></td></tr>
      </tbody>
    </table>`;

  const perfilHtml = perfil ? `
    <h4>Perfil de Rateio ${perfil.confirmado ? "" : "<span style=\"color:var(--cor-aviso,#b8860b);\">(método a confirmar com a Secretaria Geral)</span>"}</h4>
    <p class="subtitle">Método: <strong>${ROTULO_METODO_RATEIO[perfil.metodo] || escaparHtmlEbd(perfil.metodo)}</strong>${perfil.percentualGeral != null ? ` (${escaparHtmlEbd(perfil.percentualGeral)}% geral)` : ""} —
      modo de entrada: ${perfil.modoEntrada === "LIQUIDO_MANUAL" ? "líquido (já lançado só a parte que sobe)" : "bruto (sistema calcula a divisão)"}
      ${perfil.suporteSecretariaGeralHabilitado ? ` · Suporte à Secretaria Geral: R$ ${Number(perfil.valorSuporteSecretariaGeral || 0).toFixed(2)}` : ""}</p>
    ${authNivel === "GLOBAL" ? `<button class="btn-link" data-on-click="abrirEdicaoPerfilRateioAcao">✏️ Configurar perfil de rateio</button>` : ""}
    <div id="tdEdicaoPerfil"></div>` : "";

  const acoesHtml = (authNivel === "DEPARTAMENTO" || authNivel === "GLOBAL") ? `
    <h4>Lançar Despesa (fundo geral do departamento, Art. 49)</h4>
    <div class="barra-lista">
      <input type="text" id="tdDespesaDescricao" placeholder="Descrição" style="min-width:220px;" />
      <input type="number" id="tdDespesaValor" step="0.01" min="0" placeholder="Valor" style="max-width:120px;" />
      <input type="number" id="tdDespesaAutorizadoPor" placeholder="Matrícula de quem autorizou (só acima do limite)" style="min-width:220px;" />
      <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="lancarDespesaTesourariaDeptoAcao">➕ Lançar</button>
    </div>
    <p id="resultadoDespesaTesourariaDepto"></p>
    <p class="subtitle">Pra gastar o saldo que ficou LOCAL numa congregação específica (não este fundo
      geral), use <strong>Financeiro → Saídas</strong> escolhendo a categoria "Despesa Local — [seu
      departamento]" — mesma aprovação por alçada e trava de saldo de qualquer despesa da igreja.</p>
    ${!data.fechado ? `<button class="btn-confirmar btn-secundario" data-on-click="fecharMesTesourariaDeptoAcao">🔒 Fechar Mês (congela o balancete)</button>` : ""}` : "";

  container.innerHTML = `${resumoHtml}${perfilHtml}<div id="tdListaDespesas"></div>${acoesHtml}`;
  await carregarDespesasTesourariaDeptoAcao();
}

async function carregarDespesasTesourariaDeptoAcao() {
  const container = document.getElementById("tdListaDespesas");
  if (!container || !_tdDepartamentoAtual) return;
  const res = await fetchProtegido(`${API_BASE}/tesouraria-departamental/despesas?departamentoId=${_tdDepartamentoAtual}&mes=${_tdMesAtual}&ano=${_tdAnoAtual}`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) { container.innerHTML = "<p class='subtitle'>Nenhuma despesa lançada neste mês.</p>"; return; }
  container.innerHTML = `<h4>Despesas do mês</h4><table class="tabela-frequencia"><thead><tr>
    <th>Descrição</th><th>Valor</th><th>Lançado por</th><th>Autorizado por</th><th>Quando</th></tr></thead><tbody>
    ${lista.map(d => `<tr><td>${escaparHtmlEbd(d.descricao)}</td><td>R$ ${Number(d.valor).toFixed(2)}</td><td>${escaparHtmlEbd(d.nomeLancador)}</td><td>${escaparHtmlEbd(d.nomeAutorizador) || "-"}</td><td>${new Date(d.criadoEm).toLocaleDateString("pt-BR")}</td></tr>`).join("")}
    </tbody></table>`;
}

async function lancarDespesaTesourariaDeptoAcao() {
  const descricao = document.getElementById("tdDespesaDescricao").value.trim();
  const valor = document.getElementById("tdDespesaValor").value;
  const autorizadoPor = document.getElementById("tdDespesaAutorizadoPor").value || null;
  const msg = document.getElementById("resultadoDespesaTesourariaDepto");
  if (!descricao || !valor) { msg.textContent = "Informe descrição e valor."; return; }

  const res = await fetchProtegido(`${API_BASE}/tesouraria-departamental/despesas`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ departamentoId: _tdDepartamentoAtual, mesReferencia: _tdMesAtual, anoReferencia: _tdAnoAtual, descricao, valor, autorizadoPor })
  });
  const data = await res.json();
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("tdDespesaDescricao").value = "";
    document.getElementById("tdDespesaValor").value = "";
    document.getElementById("tdDespesaAutorizadoPor").value = "";
    await abrirTesourariaDeptoAcao();
  }
}

async function fecharMesTesourariaDeptoAcao() {
  if (!(await confirmarAcao("Fechar o mês congela o balancete — só dá pra reabrir com retificação. Confirmar?", "Fechar mês"))) return;
  const res = await fetchProtegido(`${API_BASE}/tesouraria-departamental/fechar`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ departamentoId: _tdDepartamentoAtual, mesReferencia: _tdMesAtual, anoReferencia: _tdAnoAtual })
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast("✅ Mês fechado.", "sucesso");
  await abrirTesourariaDeptoAcao();
}

async function abrirEdicaoPerfilRateioAcao() {
  const res = await fetchProtegido(`${API_BASE}/tesouraria-departamental/perfil?departamentoId=${_tdDepartamentoAtual}`);
  const perfil = await res.json();
  const container = document.getElementById("tdEdicaoPerfil");
  container.innerHTML = `
    <div class="input-group"><label>Método</label>
      <select id="tdPerfilMetodo">
        ${Object.entries(ROTULO_METODO_RATEIO).map(([v, r]) => `<option value="${v}" ${perfil.metodo === v ? "selected" : ""}>${r}</option>`).join("")}
      </select>
    </div>
    <div class="input-group"><label>Percentual Geral (%, se aplicável)</label><input type="number" step="0.01" min="0" max="100" id="tdPerfilPercentual" value="${escaparHtmlEbd(perfil.percentualGeral) || ""}" /></div>
    <div class="input-group"><label>Modo de entrada</label>
      <select id="tdPerfilModoEntrada">
        <option value="BRUTO_CALCULADO" ${perfil.modoEntrada === "BRUTO_CALCULADO" ? "selected" : ""}>Bruto (sistema calcula)</option>
        <option value="LIQUIDO_MANUAL" ${perfil.modoEntrada === "LIQUIDO_MANUAL" ? "selected" : ""}>Líquido (já lançado só a parte que sobe)</option>
      </select>
    </div>
    <div class="input-group"><label><input type="checkbox" id="tdPerfilSuporte" style="width:auto;" ${perfil.suporteSecretariaGeralHabilitado ? "checked" : ""}/> Suporte à Secretaria Geral habilitado</label></div>
    <div class="input-group"><label>Valor do suporte (R$)</label><input type="number" step="0.01" min="0" id="tdPerfilValorSuporte" value="${escaparHtmlEbd(perfil.valorSuporteSecretariaGeral) || ""}" /></div>
    <button class="btn-confirmar" style="width:auto;" data-on-click="salvarPerfilRateioAcao">💾 Salvar Perfil</button>`;
}

async function salvarPerfilRateioAcao() {
  const corpo = {
    departamentoId: _tdDepartamentoAtual,
    metodo: document.getElementById("tdPerfilMetodo").value,
    percentualGeral: document.getElementById("tdPerfilPercentual").value || null,
    modoEntrada: document.getElementById("tdPerfilModoEntrada").value,
    suporteSecretariaGeralHabilitado: document.getElementById("tdPerfilSuporte").checked,
    valorSuporteSecretariaGeral: document.getElementById("tdPerfilValorSuporte").value || null
  };
  const res = await fetchProtegido(`${API_BASE}/tesouraria-departamental/perfil`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo)
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast("✅ Perfil de rateio atualizado.", "sucesso");
  await abrirTesourariaDeptoAcao();
}

// ---- CONSOLIDADO DE CAMPO (v5.5.1; Região/Quadrante/Distrito + série por
// campo + comparativo por porte na v5.8) ----
const CD_SELECT_POR_NIVEL = {
  congregacao: "cdCongregacao", area: "cdArea", regiao: "cdRegiao", quadrante: "cdQuadrante", distrito: "cdDistrito"
};
function mudarNivelConsolidadoAcao() {
  const nivel = document.getElementById("cdNivel").value;
  for (const [n, selId] of Object.entries(CD_SELECT_POR_NIVEL)) {
    document.getElementById(selId).style.display = nivel === n ? "" : "none";
  }
}

async function abrirConsolidadoDeptoAcao() {
  const nivel = document.getElementById("cdNivel").value;
  const seletorId = CD_SELECT_POR_NIVEL[nivel];
  const id = seletorId ? document.getElementById(seletorId).value : "";
  const mes = document.getElementById("cdMes").value;
  const ano = document.getElementById("cdAno").value;
  const msg = document.getElementById("resultadoConsolidadoDepto");
  if (nivel !== "campo" && !id) { msg.textContent = "Escolha a congregação/área."; return; }
  if (!ano) { msg.textContent = "Informe o ano."; return; }

  const params = new URLSearchParams({ nivel, mes, ano, historico: "12" });
  if (id) params.set("id", id);
  const res = await fetchProtegido(`${API_BASE}/consolidado-departamentos?${params.toString()}`);
  const data = await res.json();
  if (data.sucesso === false) { msg.textContent = data.mensagem; document.getElementById("painelConsolidadoDepto").innerHTML = ""; return; }
  msg.textContent = "";
  renderizarPainelConsolidadoDepto(data);
}

function renderizarPainelConsolidadoDepto(data) {
  const container = document.getElementById("painelConsolidadoDepto");

  const linhasDepto = data.porDepartamento.map(d => `<tr>
    <td>${escaparHtmlEbd(d.nome)}</td>
    <td>${escaparHtmlEbd(d.totalEnviados)}/${escaparHtmlEbd(d.totalCongregacoes)}${d.totalPendentes > 0 ? ` <span style="color:var(--cor-perigo,#c0392b);">(${escaparHtmlEbd(d.totalPendentes)} pendente(s))</span>` : ""}</td>
    <td>${escaparHtmlEbd(d.eventosLocal + d.eventosArea + d.eventosGeral)}</td>
    <td>${escaparHtmlEbd(d.integracaoConversao + d.integracaoReconciliacao + d.integracaoDeOutraIgreja)}</td>
    <td>R$ ${Number(d.valorParaGeral).toFixed(2)}</td>
    <td>R$ ${Number(d.valorParaLocal).toFixed(2)}</td>
  </tr>`).join("");

  const totaisHtml = `<p><strong>Retrato eclesiástico do mês:</strong>
    Eventos: ${escaparHtmlEbd(data.totais.eventosLocal + data.totais.eventosArea + data.totais.eventosGeral)} ·
    Integração (conversões/reconciliações/de outra igreja): ${escaparHtmlEbd(data.totais.integracaoConversao + data.totais.integracaoReconciliacao + data.totais.integracaoDeOutraIgreja)} ·
    Para o Geral: R$ ${Number(data.totais.valorParaGeral).toFixed(2)} · Para o Local: R$ ${Number(data.totais.valorParaLocal).toFixed(2)}</p>`;

  const pendenciasHtml = data.pendencias.length > 0 ? `
    <h4>Pendências (ainda não enviaram)</h4>
    <table class="tabela-frequencia"><thead><tr><th>Departamento</th><th>Congregação</th><th>Status</th></tr></thead><tbody>
      ${data.pendencias.map(p => `<tr><td>${escaparHtmlEbd(p.sigla)}</td><td>${escaparHtmlEbd(p.congregacaoNome)}</td><td>${p.status === "NAO_INICIADO" ? "Não iniciado" : "Rascunho"}</td></tr>`).join("")}
    </tbody></table>` : `<p class="subtitle">✅ Nenhuma pendência — todos os relatórios deste mês já foram enviados.</p>`;

  const historicoHtml = (data.historico && data.historico.length > 0) ? `
    <h4>Histórico (últimos ${data.historico.length} meses com relatório enviado)</h4>
    <table class="tabela-frequencia"><thead><tr><th>Mês/Ano</th><th>Eventos</th><th>Integração</th><th>Para o Geral</th><th>Para o Local</th></tr></thead><tbody>
      ${data.historico.map(h => `<tr><td>${escaparHtmlEbd(h.mesReferencia)}/${escaparHtmlEbd(h.anoReferencia)}</td><td>${escaparHtmlEbd(h.totalEventos)}</td><td>${escaparHtmlEbd(h.totalIntegracao)}</td>
        <td>R$ ${Number(h.totalParaGeral).toFixed(2)}</td><td>R$ ${Number(h.totalParaLocal).toFixed(2)}</td></tr>`).join("")}
    </tbody></table>` : "";

  container.innerHTML = `
    ${totaisHtml}
    <table class="tabela-frequencia"><thead><tr>
      <th>Departamento</th><th>Enviados</th><th>Eventos</th><th>Integração</th><th>Para o Geral</th><th>Para o Local</th>
    </tr></thead><tbody>${linhasDepto}</tbody></table>
    ${pendenciasHtml}
    ${historicoHtml}
  `;
}

// v5.8 (item 2) — série histórica de um único campo do formulário, dentro do
// mesmo nível/período já escolhido acima (reaproveita cdNivel/id/mes/ano).
async function abrirSerieHistoricaCampoAcao() {
  const nivel = document.getElementById("cdNivel").value;
  const seletorId = CD_SELECT_POR_NIVEL[nivel];
  const id = seletorId ? document.getElementById(seletorId).value : "";
  const mes = document.getElementById("cdMes").value;
  const ano = document.getElementById("cdAno").value;
  const departamentoId = document.getElementById("cdSerieDepartamento").value;
  const campo = document.getElementById("cdSerieCampo").value.trim();
  const quantidade = document.getElementById("cdSerieQuantidade").value || "12";
  const msg = document.getElementById("resultadoSerieCampo");
  if (nivel !== "campo" && !id) { msg.textContent = "Escolha a congregação/área/região/quadrante/distrito acima."; return; }
  if (!ano) { msg.textContent = "Informe o ano acima."; return; }
  if (!departamentoId || !campo) { msg.textContent = "Escolha o departamento e informe o nome do campo (ex: ofertas)."; return; }

  const params = new URLSearchParams({ nivel, mes, ano, departamentoId, campo, historicoCampo: quantidade });
  if (id) params.set("id", id);
  const res = await fetchProtegido(`${API_BASE}/consolidado-departamentos?${params.toString()}`);
  const data = await res.json();
  if (data.sucesso === false) { msg.textContent = data.mensagem; document.getElementById("painelSerieCampo").innerHTML = ""; return; }
  msg.textContent = "";
  const serie = data.serieCampo || [];
  const container = document.getElementById("painelSerieCampo");
  if (serie.length === 0) {
    container.innerHTML = `<p class="subtitle">Nenhum relatório enviado com esse campo no período.</p>`;
    return;
  }
  container.innerHTML = `<table class="tabela-frequencia"><thead><tr><th>Mês/Ano</th><th>Total</th><th>Relatórios somados</th></tr></thead><tbody>
    ${serie.map(p => `<tr><td>${escaparHtmlEbd(p.mesReferencia)}/${escaparHtmlEbd(p.anoReferencia)}</td><td>${Number(p.total).toFixed(2)}</td><td>${escaparHtmlEbd(p.totalRelatorios)}</td></tr>`).join("")}
  </tbody></table>`;
}

// v5.8 (item 3) — comparativo entre congregações do mesmo porte, no mesmo
// nível/mês/ano já escolhidos no Consolidado de Campo acima.
async function abrirComparativoPorteAcao() {
  const nivel = document.getElementById("cdNivel").value;
  const seletorId = CD_SELECT_POR_NIVEL[nivel];
  const id = seletorId ? document.getElementById(seletorId).value : "";
  const mes = document.getElementById("cdMes").value;
  const ano = document.getElementById("cdAno").value;
  const msg = document.getElementById("resultadoComparativoPorte");
  if (nivel !== "campo" && !id) { msg.textContent = "Escolha a congregação/área/região/quadrante/distrito acima."; return; }
  if (!ano) { msg.textContent = "Informe o ano acima."; return; }

  const params = new URLSearchParams({ nivel, mes, ano, porte: "1" });
  if (id) params.set("id", id);
  const res = await fetchProtegido(`${API_BASE}/consolidado-departamentos?${params.toString()}`);
  const data = await res.json();
  if (data.sucesso === false) { msg.textContent = data.mensagem; document.getElementById("painelComparativoPorte").innerHTML = ""; return; }
  msg.textContent = "";
  const grupos = data.porPorte || [];
  const container = document.getElementById("painelComparativoPorte");
  const ROTULO_PORTE = { PEQUENA: "Pequena (< 100 membros ativos)", MEDIA: "Média (100–299)", GRANDE: "Grande (300+)" };
  container.innerHTML = grupos.map(g => `
    <h4>${ROTULO_PORTE[g.porte] || escaparHtmlEbd(g.porte)} — ${escaparHtmlEbd(g.totalCongregacoes)} congregação(ões)</h4>
    <p class="subtitle">Médias do grupo: Membros ativos ${escaparHtmlEbd(g.medias.totalMembrosAtivos)} · Eventos ${escaparHtmlEbd(g.medias.totalEventos)} ·
      Integração ${escaparHtmlEbd(g.medias.totalIntegracao)} · Para o Geral R$ ${g.medias.valorParaGeral.toFixed(2)} · Para o Local R$ ${g.medias.valorParaLocal.toFixed(2)}</p>
    <table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Membros ativos</th><th>Eventos</th><th>Integração</th><th>Para o Geral</th><th>Para o Local</th></tr></thead><tbody>
      ${g.congregacoes.map(c => `<tr><td>${escaparHtmlEbd(c.congregacaoNome)}</td><td>${escaparHtmlEbd(c.totalMembrosAtivos)}</td><td>${escaparHtmlEbd(c.totalEventos)}</td><td>${escaparHtmlEbd(c.totalIntegracao)}</td>
        <td>R$ ${Number(c.valorParaGeral).toFixed(2)}</td><td>R$ ${Number(c.valorParaLocal).toFixed(2)}</td></tr>`).join("")}
    </tbody></table>`).join("") || `<p class="subtitle">Sem dados no período pra comparar.</p>`;
}

registrarAcoes({
  abrirComparativoPorteAcao, abrirConsolidadoDeptoAcao, abrirEdicaoPerfilRateioAcao, abrirRelatorioDeptoAcao, abrirSerieHistoricaCampoAcao,
  abrirTesourariaDeptoAcao, acaoFluxoRd, adicionarLinhaContribuinteRd, comentarFluxoRdAcao, fecharMesTesourariaDeptoAcao,
  lancarDespesaTesourariaDeptoAcao, mudarNivelConsolidadoAcao, reabrirRelatorioDeptoAcao, removerPai, salvarPerfilRateioAcao,
  salvarRelatorioDeptoAcao
});
