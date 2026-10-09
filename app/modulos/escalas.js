// app/modulos/escalas.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- ESCALAS DE SERVIÇO (v5.6 — auto-escalador) ----
let _esCongregacaoAtual = null;

async function carregarOpcoesEscalasAcao() {
  const selCong = document.getElementById("esCongregacao");
  if (!selCong.dataset.montado) {
    const congs = await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/congregacoes`));
    selCong.innerHTML = congs.filter(c => c.ativa !== false).map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("");
    selCong.dataset.montado = "1";
  }
}

async function criarEquipeAcao() {
  const nome = document.getElementById("esNovaEquipeNome").value.trim();
  const congregacaoId = document.getElementById("esCongregacao").value;
  const liderMembroId = document.getElementById("esNovaEquipeLider").value;
  const msg = document.getElementById("resultadoEscalasEquipes");
  if (!nome || !congregacaoId || !liderMembroId) { msg.textContent = "Informe nome, congregação e matrícula do líder."; return; }
  const res = await fetchProtegido(`${API_BASE}/escalas/equipes`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, congregacaoId: Number(congregacaoId), liderMembroId: Number(liderMembroId) })
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast("✅ Equipe criada.", "sucesso");
  document.getElementById("esNovaEquipeNome").value = "";
  document.getElementById("esNovaEquipeLider").value = "";
  carregarEquipesAcao();
}

async function carregarEquipesAcao() {
  const congregacaoId = document.getElementById("esCongregacao").value;
  if (!congregacaoId) return;
  _esCongregacaoAtual = congregacaoId;
  const res = await fetchProtegido(`${API_BASE}/escalas/equipes?congregacaoId=${congregacaoId}`);
  const data = await res.json();
  if (data.sucesso === false) { document.getElementById("resultadoEscalasEquipes").textContent = data.mensagem; return; }
  document.getElementById("resultadoEscalasEquipes").textContent = "";

  await volGarantirCatalogos();   // o catálogo traz as naturezas da coluna "Natureza"
  const linhas = data.equipes.map(e => `<tr><td>${escaparHtmlEbd(e.nome)}</td><td>${escaparHtmlEbd(e.liderNome)}</td><td>${e.ativa ? "Ativa" : "Inativa"}</td><td>${volCelulaNatureza(e)}</td></tr>`).join("");
  document.getElementById("painelEquipesEscala").innerHTML = data.equipes.length
    ? `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Equipe</th><th>Líder</th><th>Status</th><th>Natureza</th></tr></thead><tbody>${linhas}</tbody></table></div>`
    : "<p class='subtitle'>Nenhuma equipe cadastrada nesta congregação ainda.</p>";

  const opcoesEquipe = data.equipes.map(e => `<option value="${e.equipeId}">${escaparHtmlEbd(e.nome)}</option>`).join("");
  const selTrocas = document.getElementById("esEquipeTrocas");
  const selPendencias = document.getElementById("esEquipePendencias");
  if (selTrocas) selTrocas.innerHTML = opcoesEquipe;
  if (selPendencias) selPendencias.innerHTML = opcoesEquipe;

  carregarServicosAcao();
  volCarregarEscalasAcao(data.equipes);
}

async function adicionarMembroEquipeAcao() {
  const equipeId = document.getElementById("esMembroEquipeId").value;
  const membroId = document.getElementById("esMembroMatricula").value;
  const frequenciaPreferidaDias = document.getElementById("esMembroFrequencia").value || 30;
  const msg = document.getElementById("resultadoEscalasEquipes");
  if (!equipeId || !membroId) { msg.textContent = "Informe o id da equipe e a matrícula do voluntário."; return; }
  const res = await fetchProtegido(`${API_BASE}/escalas/equipes-membros`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ equipeId: Number(equipeId), membroId: Number(membroId), frequenciaPreferidaDias: Number(frequenciaPreferidaDias) })
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast(data.mensagem, "sucesso");
  document.getElementById("esMembroMatricula").value = "";
}

async function criarServicoAcao() {
  const congregacaoId = document.getElementById("esCongregacao").value;
  const dataHora = document.getElementById("esNovoServicoData").value;
  const descricao = document.getElementById("esNovoServicoDescricao").value.trim();
  const prazoConfirmacaoDias = document.getElementById("esNovoServicoPrazo").value || 3;
  const msg = document.getElementById("resultadoEscalasServicos");
  if (!congregacaoId || !dataHora) { msg.textContent = "Escolha a congregação e informe a data/hora."; return; }
  const res = await fetchProtegido(`${API_BASE}/escalas/servicos`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ congregacaoId: Number(congregacaoId), dataHora, descricao, prazoConfirmacaoDias: Number(prazoConfirmacaoDias) })
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast("✅ Serviço criado.", "sucesso");
  document.getElementById("esNovoServicoDescricao").value = "";
  carregarServicosAcao();
}

async function carregarServicosAcao() {
  if (!_esCongregacaoAtual) return;
  const res = await fetchProtegido(`${API_BASE}/escalas/servicos?congregacaoId=${_esCongregacaoAtual}`);
  const data = await res.json();
  if (data.sucesso === false) return;
  // Guarda quais serviços são de rodízio: o detalhe (servicos-detalhe) não traz essa informação.
  volServicoRodizio = {};
  data.servicos.forEach(s => { if (s.rodizioId) volServicoRodizio[s.servicoId] = s.rodizioId; });
  const linhas = data.servicos.map(s => `<tr>
    <td>${volDataHora(s.dataHora)}</td><td>${escaparHtmlEbd(s.descricao || "")}${s.rodizioId ? ' <span class="vol-etiqueta">Rodízio</span>' : ""}</td><td>${escaparHtmlEbd(s.status)}</td>
    <td><button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="abrirServicoEscalaAcao" data-args-click="${argsAttr(Number(s.servicoId))}">🔍 Abrir</button></td>
  </tr>`).join("");
  document.getElementById("painelServicosEscala").innerHTML = data.servicos.length
    ? `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Data/Hora</th><th>Descrição</th><th>Status</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
    : "<p class='subtitle'>Nenhum serviço cadastrado ainda.</p>";
}

// `problemasPublicacao`: os problemas que a recusa de publicar (422) trouxe; ficam listados no topo do detalhe, com o que fazer em cada um.
async function abrirServicoEscalaAcao(servicoId, problemasPublicacao) {
  const res = await fetchProtegido(`${API_BASE}/escalas/servicos-detalhe?servicoId=${servicoId}`);
  const data = await res.json();
  const container = document.getElementById("painelDetalheServicoEscala");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  // v7.7: as salas com menores precisam do nome das faixas (o catálogo do ministério com menores)
  if (data.menores && Array.isArray(data.menores.salas) && data.menores.salas.length) await mnrGarantirCatalogos();

  const ehRodizio = !!volServicoRodizio[servicoId];
  const linhasAlocacao = data.alocacoes.map(a => `<tr><td>${a.equipeId}</td><td>${a.membroId}</td><td>${escaparHtmlEbd(a.status)}</td></tr>`).join("");
  container.innerHTML = `
    <h4>${escaparHtmlEbd(data.servico.descricao || "Serviço")} — ${volDataHora(data.servico.dataHora)} (${escaparHtmlEbd(data.servico.status)})</h4>
    ${montarProblemasPublicacaoHtml(problemasPublicacao)}
    ${ehRodizio ? '<p class="subtitle">Serviço de rodízio: a escala é do grupo da vez (Regimento Art. 135 §1º), por isso o auto-escalador não é usado aqui.</p>' : ""}
    <div class="barra-lista">
      ${data.servico.status === "RASCUNHO" && !ehRodizio ? `<button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="autoEscalarAcao" data-args-click="${argsAttr(servicoId)}">🤖 Rodar Auto-Escalador</button>` : ""}
      ${data.servico.status === "RASCUNHO" ? `<button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="publicarEscalaAcao" data-args-click="${argsAttr(servicoId)}">📣 Publicar</button>` : ""}
    </div>
    <table class="tabela-frequencia"><thead><tr><th>Equipe (id)</th><th>Membro (matrícula)</th><th>Status</th></tr></thead><tbody>${linhasAlocacao || "<tr><td colspan='3'>Nenhuma alocação ainda.</td></tr>"}</tbody></table>
    ${montarSalasMenoresHtml(data.menores, servicoId, Array.isArray(problemasPublicacao) && problemasPublicacao.length > 0)}`;
}

// ---- v7.7: salas com menores do serviço (Lei 14.811/2024): dois adultos habilitados por sala e proporção de adultos por criança, conferidos ANTES de publicar ----
const escCriancasEmCurso = new Set();   // trava duplo clique em "Salvar" das crianças previstas
function montarSalasMenoresHtml(menores, servicoId, jaListouProblemas) {
  if (!menores || typeof menores !== "object" || !Array.isArray(menores.salas)) return "";
  const problemas = Array.isArray(menores.problemas) ? menores.problemas : [];
  const idServico = Number(servicoId);
  const cabecalho = `<h5 style="margin:16px 0 4px;">🧒 Salas com menores</h5>
    <p class="subtitle" style="margin:0 0 8px;">Uma sala com crianças <strong>nunca fica com um adulto só</strong>, e cada adulto acompanha um número limitado de crianças conforme a faixa etária (Lei 14.811/2024). Informe quantas crianças a sala espera neste serviço: o sistema confere se há adultos habilitados suficientes antes de publicar. <em>Exemplo: 12 crianças no Maternal (até 5 por adulto) pedem 3 adultos habilitados.</em></p>`;
  if (!menores.salas.length) return `${cabecalho}<p class="subtitle">Nenhuma sala com menores neste serviço: só entram as equipes marcadas com "contato com menores" que já têm alguém escalado.</p>`;
  const cartoes = menores.salas.map(s => {
    const idEquipe = Number(s.equipeId);
    const dela = jaListouProblemas ? [] : problemas.filter(p => Number(p.equipeId) === idEquipe);
    const faixa = s.faixa ? escaparHtmlEbd(mnrRotuloFaixa(s.faixa)) : "<span class='psc-alerta'>não definida</span> — escolha em Habilitação de Voluntários, ao lado da equipe";
    return `<div class="cal-cartao cartao-area-ebd mnr-sala ${s.ok ? "mnr-sala-ok" : "mnr-sala-problema"}">
      <h5>${escaparHtmlEbd(s.equipeNome)} ${s.ok ? '<span class="cal-selo mnr-selo cal-st-homologado">✓ Em ordem</span>' : '<span class="cal-selo mnr-selo cal-st-indeferido">✗ Falta ajustar</span>'}</h5>
      <dl class="cal-dl">
        <div><dt>Faixa etária</dt><dd>${faixa}</dd></div>
        <div><dt>Adultos habilitados escalados</dt><dd><strong>${Number(s.adultos) || 0}</strong> de ${Number(s.necessarios) || 0} necessários ${s.ok ? "✓" : "✗"}</dd></div>
      </dl>
      <div class="barra-lista">
        <label for="escCriancas${idServico}_${idEquipe}">Crianças previstas neste serviço</label>
        <input type="number" id="escCriancas${idServico}_${idEquipe}" min="0" max="200" value="${s.criancasPrevistas == null ? "" : Number(s.criancasPrevistas)}" />
        <button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="salvarCriancasPrevistasAcao" data-args-click="${argsAttr(idServico, idEquipe, ARG.elemento)}">💾 Salvar</button>
      </div>
      ${dela.length ? `<ul class="mnr-problemas" role="status">${dela.map(p => `<li>${escaparHtmlEbd(p.mensagem)}${mnrTem(MNR_COMO_RESOLVER, p.codigo) ? `<br /><small>${escaparHtmlEbd(MNR_COMO_RESOLVER[p.codigo])}</small>` : ""}</li>`).join("")}</ul>` : ""}
    </div>`;
  }).join("");
  return `${cabecalho}${cartoes}`;
}
// A lista de problemas que a recusa de publicar (422) trouxe, no topo do detalhe: o que está errado e o que fazer
function montarProblemasPublicacaoHtml(problemas) {
  if (!Array.isArray(problemas) || !problemas.length) return "";
  return `<div class="cnl-aviso-senha" role="alert"><strong>Não dá para publicar ainda. Ajuste o que está abaixo e publique de novo:</strong>
    <ul class="mnr-problemas">${problemas.map(p => `<li>${escaparHtmlEbd(p.mensagem)}${mnrTem(MNR_COMO_RESOLVER, p.codigo) ? `<br /><small>${escaparHtmlEbd(MNR_COMO_RESOLVER[p.codigo])}</small>` : ""}</li>`).join("")}</ul></div>`;
}
async function salvarCriancasPrevistasAcao(servicoId, equipeId, botao) {
  const campo = document.getElementById(`escCriancas${Number(servicoId)}_${Number(equipeId)}`);
  const texto = campo ? String(campo.value).trim() : "";
  if (!/^\d{1,3}$/.test(texto) || Number(texto) > 200) { mostrarToast("Informe quantas crianças a sala espera: um número inteiro de 0 a 200.", "erro"); return; }
  const chave = `${Number(servicoId)}_${Number(equipeId)}`;
  if (escCriancasEmCurso.has(chave)) { mostrarToast("Aguarde: o pedido anterior ainda está sendo processado.", "erro"); return; }
  escCriancasEmCurso.add(chave);
  if (botao) botao.disabled = true;
  try {
    const res = await fetchProtegido(`${API_BASE}/escalas/criancas-previstas`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servicoId: Number(servicoId), equipeId: Number(equipeId), criancas: Number(texto) })
    });
    const data = await res.json();
    if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
    mostrarToast(data.mensagem, "sucesso");
    await abrirServicoEscalaAcao(Number(servicoId));   // os adultos necessários mudam com o número de crianças
  } finally {
    if (botao) botao.disabled = false;
    escCriancasEmCurso.delete(chave);
  }
}

async function autoEscalarAcao(servicoId) {
  const res = await fetchProtegido(`${API_BASE}/escalas/auto-escalar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ servicoId })
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast("✅ Auto-escalador rodou — confira a fila de convite por equipe.", "sucesso");
  abrirServicoEscalaAcao(servicoId);
}

async function publicarEscalaAcao(servicoId) {
  const res = await fetchProtegido(`${API_BASE}/escalas/publicar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ servicoId })
  });
  const data = await res.json();
  if (data.sucesso === false) {
    // v7.7: sala com menores fora da regra (422 com a lista de problemas): a lista aparece no detalhe do serviço, com o que fazer em cada um
    if (Array.isArray(data.problemas) && data.problemas.length) {
      mostrarToast("Não dá para publicar ainda: veja a lista de problemas no detalhe do serviço.", "erro");
      abrirServicoEscalaAcao(servicoId, data.problemas);
    } else mostrarToast(data.mensagem, "erro");
    return;
  }
  mostrarToast(data.mensagem, "sucesso");
  carregarServicosAcao();
  abrirServicoEscalaAcao(servicoId);
}

async function carregarTrocasPendentesAcao() {
  const equipeId = document.getElementById("esEquipeTrocas").value;
  if (!equipeId) return;
  const res = await fetchProtegido(`${API_BASE}/escalas/trocas?equipeId=${equipeId}`);
  const data = await res.json();
  const container = document.getElementById("painelTrocasPendentes");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.trocas.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Alocação origem</th><th>Destino (matrícula)</th><th>Pedida em</th><th></th></tr></thead><tbody>
        ${data.trocas.map(t => `<tr><td>${t.alocacaoOrigemId}</td><td>${t.membroDestinoId}</td><td>${new Date(t.criadaEm).toLocaleDateString("pt-BR")}</td>
          <td><button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="decidirTrocaAcao" data-args-click="${argsAttr(t.trocaId, true)}">✅ Aprovar</button>
              <button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="decidirTrocaAcao" data-args-click="${argsAttr(t.trocaId, false)}">❌ Recusar</button></td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhuma troca pendente.</p>";
}

async function decidirTrocaAcao(trocaId, aprovar) {
  const res = await fetchProtegido(`${API_BASE}/escalas/trocas-aprovar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trocaId, aprovar })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  carregarTrocasPendentesAcao();
}

async function carregarPendenciasConfirmacaoAcao() {
  const equipeId = document.getElementById("esEquipePendencias").value;
  if (!equipeId) return;
  const res = await fetchProtegido(`${API_BASE}/escalas/pendencias-confirmacao?equipeId=${equipeId}`);
  const data = await res.json();
  const container = document.getElementById("painelPendenciasConfirmacao");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.pendencias.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Alocação</th><th>Membro (matrícula)</th><th>Status</th></tr></thead><tbody>
        ${data.pendencias.map(p => `<tr><td>${p.alocacaoId}</td><td>${p.membroId}</td><td>${escaparHtmlEbd(p.status)}</td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>✅ Ninguém pendente — todos já confirmaram.</p>";
}

// ---- "Minhas Escalas" (Meu Painel — hook do Portal do Membro, vB.5) ----
async function carregarMinhasEscalasAcao() {
  const res = await fetchProtegido(`${API_BASE}/escalas/minhas-alocacoes`);
  const data = await res.json();
  const container = document.getElementById("resultadoMinhasEscalas");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  if (data.alocacoes.length === 0) { container.innerHTML = "<p class='subtitle'>Nenhum convite de escala no momento.</p>"; return; }

  container.innerHTML = `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Equipe</th><th>Serviço</th><th>Data/Hora</th><th>Status</th><th></th></tr></thead><tbody>
    ${data.alocacoes.map(a => {
      let acoes = "";
      if (a.status === "CONVIDADO") {
        acoes = `<button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="responderConviteEscalaAcao" data-args-click="${argsAttr(a.alocacaoId, "ACEITO")}">✅ Aceitar</button>
                 <button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="responderConviteEscalaAcao" data-args-click="${argsAttr(a.alocacaoId, "RECUSADO")}">❌ Recusar</button>`;
      } else if (a.status === "ACEITO") {
        acoes = `<button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="confirmarRecebimentoEscalaAcao" data-args-click="${argsAttr(a.alocacaoId)}">📩 Confirmar recebimento</button>
                 <button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="pedirTrocaEscalaAcao" data-args-click="${argsAttr(a.alocacaoId)}">🔄 Pedir troca</button>`;
      }
      const etiquetaRodizio = a.rodizioId ? ` <span class="vol-etiqueta">Rodízio${a.grupoNome ? ` · ${escaparHtmlEbd(a.grupoNome)}` : ""}</span>` : "";
      return `<tr><td>${escaparHtmlEbd(a.equipeNome)}</td><td>${escaparHtmlEbd(a.descricao || "")}${etiquetaRodizio}</td><td>${volDataHora(a.dataHora)}</td><td>${escaparHtmlEbd(a.status)}</td><td>${acoes}</td></tr>`;
    }).join("")}
  </tbody></table></div>`;
}

async function responderConviteEscalaAcao(alocacaoId, resposta) {
  const res = await fetchProtegido(`${API_BASE}/escalas/responder`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alocacaoId, resposta })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  carregarMinhasEscalasAcao();
}

async function confirmarRecebimentoEscalaAcao(alocacaoId) {
  const res = await fetchProtegido(`${API_BASE}/escalas/confirmar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alocacaoId })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  carregarMinhasEscalasAcao();
}

async function pedirTrocaEscalaAcao(alocacaoOrigemId) {
  const membroDestinoId = prompt("Matrícula do voluntário que vai assumir seu posto:");
  if (!membroDestinoId) return;
  const res = await fetchProtegido(`${API_BASE}/escalas/trocas`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alocacaoOrigemId, membroDestinoId: Number(membroDestinoId) })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
}

async function declararIndisponibilidadeAcao() {
  const dataInicio = document.getElementById("meIndisponibilidadeInicio").value;
  const dataFim = document.getElementById("meIndisponibilidadeFim").value;
  const motivo = document.getElementById("meIndisponibilidadeMotivo").value.trim();
  const msg = document.getElementById("resultadoIndisponibilidade");
  if (!dataInicio || !dataFim) { msg.textContent = "Informe início e fim do período."; return; }
  if (dataFim < dataInicio) { msg.textContent = "O fim do período não pode ser antes do início."; return; }
  // Afastamento temporário (Regimento Art. 133 §7º, II): se já há escala marcada no período, a pessoa escolhe se quer liberá-la.
  const conflitos = await volObter(`escalas/indisponibilidade-conflitos?dataInicio=${encodeURIComponent(dataInicio)}&dataFim=${encodeURIComponent(dataFim)}`);
  if (conflitos.sucesso === false) { msg.textContent = volMsgErro(conflitos); return; }
  const marcadas = Array.isArray(conflitos.conflitos) ? conflitos.conflitos : [];
  let liberarEscalas = false;
  if (marcadas.length) {
    const linhasConflito = marcadas.slice(0, 12).map(c => `• ${volDataHora(c.dataHora)} — ${c.equipeNome}`);
    if (marcadas.length > 12) linhasConflito.push(`… e mais ${marcadas.length - 12}.`);
    liberarEscalas = confirm(`Você já está escalado(a) neste período:\n\n${linhasConflito.join("\n")}\n\nLiberar essas escalas? O líder será avisado e não há penalidade.\n\nOK = liberar as escalas. Cancelar = manter as escalas (a indisponibilidade é registrada de qualquer jeito).`);
  }
  const data = await volEnviar("escalas/indisponibilidade", { dataInicio, dataFim, motivo, liberarEscalas });
  if (data.sucesso === false) { msg.textContent = volMsgErro(data); return; }
  msg.textContent = "";
  mostrarToast(data.mensagem || "✅ Indisponibilidade declarada.", "sucesso");
  document.getElementById("meIndisponibilidadeMotivo").value = "";
  carregarMinhasIndisponibilidadesAcao();
  if (data.liberadas) carregarMinhasEscalasAcao();
}

async function carregarMinhasIndisponibilidadesAcao() {
  const res = await fetchProtegido(`${API_BASE}/escalas/indisponibilidade`);
  const data = await res.json();
  const container = document.getElementById("cxMinhasIndisponibilidades");
  if (data.sucesso === false) { container.innerHTML = ""; return; }
  container.innerHTML = data.indisponibilidades.length
    ? `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Início</th><th>Fim</th><th>Motivo</th></tr></thead><tbody>
        ${data.indisponibilidades.map(i => `<tr><td>${volData(i.dataInicio)}</td><td>${volData(i.dataFim)}</td><td>${escaparHtmlEbd(i.motivo || "")}</td></tr>`).join("")}
      </tbody></table></div>`
    : "<p class='subtitle'>Nenhum período de indisponibilidade declarado.</p>";
}

// ---- HABILITAÇÃO DE VOLUNTÁRIOS (v5.7 — Triagem e habilitação) ----
const ROTULO_ETAPA_HV = {
  FICHA_INSCRICAO: "Ficha de inscrição", REFERENCIAS: "Referências internas", ENTREVISTA: "Entrevista registrada",
  ANTECEDENTES: "Antecedentes (manual até v7.7)", TREINAMENTO: "Treinamento (manual até v7.7)", TERMO: "Termo de Adesão (exige a adesão registrada)"
};
const ORDEM_ETAPAS_HV = ["FICHA_INSCRICAO", "REFERENCIAS", "ENTREVISTA", "ANTECEDENTES", "TREINAMENTO", "TERMO"];
const CAMPO_ETAPA_HV = {
  FICHA_INSCRICAO: "etapaFichaInscricaoEm", REFERENCIAS: "etapaReferenciasEm", ENTREVISTA: "etapaEntrevistaEm",
  ANTECEDENTES: "etapaAntecedentesEm", TREINAMENTO: "etapaTreinamentoEm", TERMO: "etapaTermoAssinadoEm"
};
const ROTULO_STATUS_HV = { APTO: "✅ Apto", PENDENTE: "🟡 Pendente", INAPTO: "⛔ Inapto", VENCIDO: "⏰ Vencido" };
let _hvCongregacaoAtual = null;

async function carregarOpcoesHabilitacaoAcao() {
  const selCong = document.getElementById("hvCongregacao");
  if (selCong && !selCong.dataset.montado) {
    const congs = await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/congregacoes`));
    selCong.innerHTML = congs.filter(c => c.ativa !== false).map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("");
    selCong.dataset.montado = "1";
  }
}

function montarEsteiraHtml(hab) {
  return ORDEM_ETAPAS_HV.map(etapa => {
    const concluida = !!hab[CAMPO_ETAPA_HV[etapa]];
    return `<span class="tag" style="margin-right:4px;${concluida ? "" : "opacity:.5;"}">${concluida ? "✅" : "⬜"} ${ROTULO_ETAPA_HV[etapa]}</span>`;
  }).join(" → ");
}

async function carregarEquipesFlagAcao() {
  const congregacaoId = document.getElementById("hvCongregacao").value;
  if (!congregacaoId) return;
  _hvCongregacaoAtual = congregacaoId;
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/equipes-flag?congregacaoId=${congregacaoId}`);
  const data = await res.json();
  const container = document.getElementById("painelEquipesFlag");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  // v7.7: a faixa etária (quantas crianças cada adulto acompanha) só importa para a equipe com contato com menores: o seletor aparece ao lado da marca
  if (data.equipes.some(e => e.contatoComMenores)) await mnrGarantirCatalogos();
  container.innerHTML = data.equipes.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Equipe</th><th>Contato com menores</th><th></th><th>Faixa etária (proporção de adultos)</th></tr></thead><tbody>
        ${data.equipes.map(e => `<tr><td>${escaparHtmlEbd(e.nome)}</td><td>${e.contatoComMenores ? "Sim" : "Não"}</td>
          <td><button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="alternarContatoComMenoresAcao" data-args-click="${argsAttr(e.equipeId, !e.contatoComMenores)}">
            ${e.contatoComMenores ? "Desmarcar" : "Marcar como contato com menores"}</button></td>
          <td>${e.contatoComMenores ? `<select id="hvFaixa${Number(e.equipeId)}" class="mnr-select-faixa" aria-label="Faixa etária da equipe ${escaparHtmlEbd(e.nome)}">${mnrOpcoesFaixa("— escolher a faixa —", true)}</select>
            <button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="salvarFaixaEquipeAcao" data-args-click="${argsAttr(e.equipeId, ARG.elemento)}">💾 Salvar a faixa</button>` : "<span class='psc-legenda'>só para equipe com contato com menores</span>"}</td></tr>`).join("")}
      </tbody></table>
      <p class="psc-legenda">Sem a faixa, a escala de uma sala com crianças não pode ser publicada. Esta lista não mostra a faixa já gravada: escolha para definir ou trocar.</p>`
    : "<p class='subtitle'>Nenhuma equipe cadastrada nesta congregação ainda (cadastre em Escalas de Serviço).</p>";

  await carregarHabilitacoesAcao();
  volCarregarHabilitacaoAcao();
}

async function alternarContatoComMenoresAcao(equipeId, novoValor) {
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/equipes-flag`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ equipeId, contatoComMenores: novoValor })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  carregarEquipesFlagAcao();
}

// v7.7: grava a faixa etária da equipe (ministerio-menores/equipe-faixa); "NENHUMA" remove a faixa
async function salvarFaixaEquipeAcao(equipeId, botao) {
  const id = Number(equipeId);
  const sel = document.getElementById(`hvFaixa${id}`);
  const faixa = sel ? String(sel.value).trim() : "";
  if (!faixa) { mostrarToast("Escolha a faixa etária da equipe.", "erro"); return; }
  await mnrProtegerBotao(botao, async () => {
    const data = await mnrPostar("equipe-faixa", { equipeId: id, faixa: faixa === "NENHUMA" ? null : faixa });
    if (!data.jaAvisado) mostrarToast(mnrMsgErro(data), data.sucesso === false ? "erro" : "sucesso");
  }, `faixaEquipe${id}`);
}

async function carregarHabilitacoesAcao() {
  if (!_hvCongregacaoAtual) return;
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/lista?congregacaoId=${_hvCongregacaoAtual}`);
  const data = await res.json();
  const container = document.getElementById("painelHabilitacoes");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.habilitacoes.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Voluntário</th><th>Status</th><th>Esteira</th><th></th></tr></thead><tbody>
        ${data.habilitacoes.map(h => `<tr><td>${escaparHtmlEbd(h.membroNome)}</td><td>${ROTULO_STATUS_HV[h.statusCalculado] || escaparHtmlEbd(h.statusCalculado)}</td>
          <td>${montarEsteiraHtml(h)}</td>
          <td><button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="abrirDetalheHabilitacaoAcao" data-args-click="${argsAttr(h.habilitacaoId)}">🔍 Abrir</button></td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhuma esteira aberta nesta congregação ainda.</p>";
}

async function iniciarHabilitacaoAcao() {
  const membroId = document.getElementById("hvNovoMembroMatricula").value;
  const congregacaoId = document.getElementById("hvCongregacao").value;
  const msg = document.getElementById("resultadoHabilitacao");
  if (!membroId || !congregacaoId) { msg.textContent = "Escolha a congregação e informe a matrícula do voluntário."; return; }
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/iniciar`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId: Number(membroId), congregacaoId: Number(congregacaoId) })
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast("✅ Esteira aberta (ou já existente reaproveitada).", "sucesso");
  document.getElementById("hvNovoMembroMatricula").value = "";
  carregarHabilitacoesAcao();
}

async function abrirDetalheHabilitacaoAcao(habilitacaoId) {
  // A lista já trouxe o necessário pra montar as ações; refazemos a busca
  // pontual só pra ter o objeto fresco (evita mandar índice desatualizado
  // depois de concluir uma etapa).
  const listaRes = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/lista?congregacaoId=${_hvCongregacaoAtual}`);
  const listaData = await listaRes.json();
  const hab = listaData.sucesso !== false ? listaData.habilitacoes.find(h => h.habilitacaoId === habilitacaoId) : null;
  const container = document.getElementById("painelDetalheHabilitacao");
  if (!hab) { container.innerHTML = "<p class='subtitle'>Esteira não encontrada.</p>"; return; }

  const proxima = hab.proximaEtapa;
  container.innerHTML = `
    <h4>${escaparHtmlEbd(hab.membroNome)} — ${ROTULO_STATUS_HV[hab.statusCalculado] || escaparHtmlEbd(hab.statusCalculado)}</h4>
    <p>${montarEsteiraHtml(hab)}</p>
    ${proxima === "TERMO" ? '<p class="subtitle">Esta etapa só fecha depois que o voluntário aderir ao Termo (aceite digital, ficha, e-mail/WhatsApp ou Lista de Ouro).</p>' : ""}
    <div class="barra-lista">
      ${proxima ? `<button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="concluirEtapaHabilitacaoAcao" data-args-click="${argsAttr(habilitacaoId, String(proxima ?? ""))}">✅ Concluir: ${ROTULO_ETAPA_HV[proxima]}</button>` : "<span class='subtitle'>Esteira completa.</span>"}
      <button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="marcarInaptoAcao" data-args-click="${argsAttr(habilitacaoId)}">⛔ Marcar Inapto</button>
      <button class="btn-confirmar btn-secundario" style="width:auto;margin:0;" data-on-click="reabilitarHabilitacaoAcao" data-args-click="${argsAttr(habilitacaoId)}">↩️ Reabilitar</button>
    </div>
    ${hab.inaptoMotivo ? `<p class="subtitle">Motivo da inaptidão: ${escaparHtmlEbd(hab.inaptoMotivo)}</p>` : ""}
  `;
}

async function concluirEtapaHabilitacaoAcao(habilitacaoId, etapa) {
  let observacao = null, entrevistadorId = null;
  if (etapa === "ENTREVISTA") {
    entrevistadorId = prompt("Matrícula de quem conduziu a entrevista (opcional):") || null;
    observacao = prompt("Observações da entrevista (opcional):") || null;
  } else if (etapa === "REFERENCIAS") {
    observacao = prompt("Observações sobre as referências colhidas (opcional):") || null;
  }
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/concluir-etapa`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ habilitacaoId, etapa, observacao, entrevistadorId: entrevistadorId ? Number(entrevistadorId) : null })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  carregarHabilitacoesAcao();
  abrirDetalheHabilitacaoAcao(habilitacaoId);
}

async function marcarInaptoAcao(habilitacaoId) {
  const motivo = prompt("Motivo da inaptidão:");
  if (!motivo) return;
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/marcar-inapto`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ habilitacaoId, motivo })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  carregarHabilitacoesAcao();
  abrirDetalheHabilitacaoAcao(habilitacaoId);
}

async function reabilitarHabilitacaoAcao(habilitacaoId) {
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/reabilitar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ habilitacaoId })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  carregarHabilitacoesAcao();
  abrirDetalheHabilitacaoAcao(habilitacaoId);
}

async function registrarDesligamentoAcao() {
  const membroId = document.getElementById("hvDesligarMatricula").value;
  const equipeId = document.getElementById("hvDesligarEquipeId").value;
  const tipoMotivo = document.getElementById("hvDesligarTipo").value;
  const motivo = document.getElementById("hvDesligarMotivo").value.trim();
  const removidoDaEscala = document.getElementById("hvDesligarRemoverEscala").checked;
  const msg = document.getElementById("resultadoDesligamento");
  if (!membroId || !motivo) { msg.textContent = "Informe a matrícula e o motivo."; return; }
  // v7.5: "remover da escala" tem efeito imediato e, sem o id da equipe, vale para todas as equipes do seu escopo. Pede confirmação antes.
  if (removidoDaEscala && !confirm(equipeId
    ? "Remover este voluntário da escala da equipe " + equipeId + "?\n\nAs escalas futuras dele nessa equipe são canceladas agora e ele é avisado."
    : "Remover este voluntário da escala de TODAS as equipes que o seu escopo alcança?\n\nAs escalas futuras dele nelas são canceladas agora e ele é avisado.")) return;
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/desligamento`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId: Number(membroId), equipeId: equipeId ? Number(equipeId) : null, tipoMotivo, motivo, removidoDaEscala })
  });
  const data = await res.json();
  msg.textContent = "";
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast(data.mensagem, "sucesso");
  document.getElementById("hvDesligarMatricula").value = "";
  document.getElementById("hvDesligarMotivo").value = "";
}

// ---- "Minha Habilitação" (Meu Painel — autoatendimento, só leitura) ----
async function carregarMinhaHabilitacaoAcao() {
  volCarregarTermoAcao();   // o cartão do Termo não depende de a pessoa ter esteira aberta
  const res = await fetchProtegido(`${API_BASE}/habilitacao-voluntarios/minha-habilitacao`);
  const data = await res.json();
  const container = document.getElementById("resultadoMinhaHabilitacao");
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  if (!data.habilitacao) { container.innerHTML = "<p class='subtitle'>Você ainda não tem uma esteira de habilitação de voluntário aberta.</p>"; return; }
  const hab = data.habilitacao;
  container.innerHTML = `<p><strong>Status:</strong> ${ROTULO_STATUS_HV[hab.statusCalculado] || escaparHtmlEbd(hab.statusCalculado)}</p><p>${montarEsteiraHtml(hab)}</p>`;
}

registrarAcoes({
  abrirDetalheHabilitacaoAcao, abrirServicoEscalaAcao, adicionarMembroEquipeAcao, alternarContatoComMenoresAcao, autoEscalarAcao,
  carregarEquipesAcao, carregarEquipesFlagAcao, carregarPendenciasConfirmacaoAcao, carregarTrocasPendentesAcao, concluirEtapaHabilitacaoAcao,
  confirmarRecebimentoEscalaAcao, criarEquipeAcao, criarServicoAcao, decidirTrocaAcao, declararIndisponibilidadeAcao, iniciarHabilitacaoAcao,
  marcarInaptoAcao, pedirTrocaEscalaAcao, publicarEscalaAcao, reabilitarHabilitacaoAcao, registrarDesligamentoAcao, responderConviteEscalaAcao,
  salvarCriancasPrevistasAcao, salvarFaixaEquipeAcao
});
