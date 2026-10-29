// modulos/discipulado.js — v8.5: Trilha de discipulado (Regimento Art. 70 §4º e §5º, Art. 80, IV, Art. 128). Toda regra mora no servidor (api/shared/discipulado.js e
// discipuladoDb.js); aqui só se monta a tela.
//  - sub-aba "Discipulado" da Pessoas: o funil por congregação do território, quem está parado antes de cada etapa e (nível geral) o catálogo de etapas e tipos de marco;
//  - aba "Caminhada" do perfil da pessoa; "Minha caminhada" em Minha Formação (Meu Painel);
//  - os tipos do formulário de marco (Histórico do perfil) vêm do catálogo.
// As ações que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

let discCatalogo = null;
let discFunilAtual = null;
let discEtapaEditando = null;
const discEl = (idEl) => document.getElementById(idEl);
const discBr = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");

// Troca de login ou saída: nada da pessoa anterior (o funil, os nomes de quem parou, a caminhada) fica na página.
function discLimparTela() {
  discCatalogo = null;
  discFunilAtual = null;
  discEtapaEditando = null;
  for (const idEl of ["discFunil", "discParadosLista", "discEtapasLista", "discTiposLista", "discCaminhadaPerfil", "discMinhaCaminhada", "discResultado"]) { const el = discEl(idEl); if (el) el.innerHTML = ""; }
  for (const idEl of ["discParados", "discCatalogo", "discFormEtapa"]) { const el = discEl(idEl); if (el) el.hidden = true; }
}

async function discCarregarCatalogo() {
  const res = await fetchProtegido(`${API_BASE}/discipulado/catalogo`);
  const data = await res.json().catch(() => null);
  discCatalogo = data && data.sucesso ? data : null;
  return discCatalogo;
}

// ---- a caminhada (o perfil da pessoa e a minha) ----
function discHtmlCaminhada(c) {
  if (!c || !Array.isArray(c.etapas) || !c.etapas.length) return "<p class='subtitle'>A trilha de discipulado ainda não tem etapas.</p>";
  const linhas = c.etapas.map((e) => `<li>${e.feita ? "✔" : "◻"} <strong>${escaparHtmlEbd(e.nome)}</strong>${e.feita
    ? ` — ${e.data ? escaparHtmlEbd(discBr(e.data)) : "data não informada"} <span class="subtitle">(${escaparHtmlEbd(e.fonteRotulo)})</span>`
    : ""}${e.foraDeOrdem ? `<br><span class="subtitle">Feita antes de: ${escaparHtmlEbd((e.preRequisitosPendentes || []).join(", "))} (no batismo de urgência, o Discipulado Pós-Batismal vem depois — Art. 70 §5º)</span>` : ""}</li>`).join("");
  const proximo = c.proximo ? `<p><strong>Próximo passo:</strong> ${escaparHtmlEbd(c.proximo.nome)}</p>` : c.iniciada ? "<p><strong>Trilha concluída.</strong></p>" : "";
  return `${proximo}<ul class="linha-tempo">${linhas}</ul>`;
}

async function discCarregarCaminhadaPerfil(membroId) {
  const alvo = discEl("discCaminhadaPerfil");
  if (!alvo || !membroId) return;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const res = await fetchProtegido(`${API_BASE}/discipulado/pessoa?membroId=${encodeURIComponent(membroId)}`);
  const data = await res.json().catch(() => null);
  if (String(window._membroPerfilAtual) !== String(membroId)) return;   // outra pessoa foi aberta enquanto isso
  alvo.innerHTML = data && data.sucesso ? discHtmlCaminhada(data.caminhada) : `<p class='subtitle'>${escaparHtmlEbd((data && data.mensagem) || "Não foi possível carregar.")}</p>`;
}

async function discCarregarMinhaCaminhada() {
  const alvo = discEl("discMinhaCaminhada");
  if (!alvo) return;
  const res = await fetchProtegido(`${API_BASE}/discipulado/minha`);
  const data = await res.json().catch(() => null);
  alvo.innerHTML = data && data.sucesso
    ? (data.caminhada && data.caminhada.iniciada ? discHtmlCaminhada(data.caminhada) : "<p class='subtitle'>Ainda não há passos registrados na sua caminhada. Fale com a liderança da sua congregação.</p>")
    : "";
}

// ---- os tipos do formulário de marco (Histórico do perfil) ----
async function discPreencherTiposMarco() {
  const select = discEl("marcoTipo");
  if (!select) return;
  const cat = discCatalogo || (await discCarregarCatalogo());
  if (!cat || !Array.isArray(cat.tiposMarco)) return;
  const atual = select.value;
  select.innerHTML = cat.tiposMarco.filter((t) => t.ativo && (!t.soNivelGeral || geralPara("pessoas")))
    .map((t) => `<option value="${escaparHtmlEbd(t.codigo)}">${escaparHtmlEbd(t.nome)}${t.unico ? " (único)" : ""}</option>`).join("");
  if ([...select.options].some((o) => o.value === atual)) select.value = atual;
}

// ---- a sub-aba Discipulado da Pessoas: o funil ----
async function discAbrirSubAba() {
  discEl("discParados").hidden = true;
  await discCarregarFunilAcao();
  const geral = geralPara("pessoas");
  discEl("discCatalogo").hidden = !geral;
  if (geral) discMostrarCatalogo();
}

async function discCarregarFunilAcao() {
  const alvo = discEl("discFunil");
  const dias = discEl("discDiasParado").value || "90";
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const res = await fetchProtegido(`${API_BASE}/discipulado/funil?diasParado=${encodeURIComponent(dias)}`);
  const data = await jsonDaTela(res, alvo, "objeto");
  if (data === null) return;
  discFunilAtual = data;
  if (!data.congregacoes || !data.congregacoes.length) {
    alvo.innerHTML = "<p class='subtitle'>Ninguém do seu território tem passo registrado na trilha ainda. Registre os marcos (conversão, curso...) no Histórico do perfil.</p>";
    return;
  }
  const tabela = (c, comBotao) => `<table class="tabela-frequencia"><thead><tr><th>Etapa</th><th>Fizeram</th><th>Próximo passo</th><th>Parados há mais de ${Number(data.diasParado)} dias</th></tr></thead><tbody>${
    c.etapas.map((e) => `<tr><td>${escaparHtmlEbd(e.nome)}</td><td>${Number(e.fizeram)}</td><td>${Number(e.proximoPasso)}</td><td>${Number(e.parados)}${comBotao && e.parados > 0
      ? ` <button class="btn-link" data-on-click="discVerParadosAcao" data-args-click="${argsAttr(Number(c.congregacaoId), Number(e.etapaId))}">ver quem</button>` : ""}</td></tr>`).join("")
  }</tbody></table>`;
  alvo.innerHTML = data.congregacoes.map((c) => `<h4>${escaparHtmlEbd(c.nome)} <span class="subtitle">— ${Number(c.iniciadas)} na trilha, ${Number(c.concluiram)} concluíram</span></h4>${tabela(c, true)}`).join("")
    + (data.congregacoes.length > 1 ? `<h4>Todas <span class="subtitle">— ${Number(data.total.iniciadas)} na trilha</span></h4>${tabela(data.total, false)}` : "");
}

async function discVerParadosAcao(congregacaoId, etapaId) {
  const painel = discEl("discParados");
  const lista = discEl("discParadosLista");
  const cong = ((discFunilAtual && discFunilAtual.congregacoes) || []).find((c) => Number(c.congregacaoId) === Number(congregacaoId));
  const etapa = ((discFunilAtual && discFunilAtual.etapas) || []).find((e) => Number(e.etapaId) === Number(etapaId));
  discEl("discParadosTitulo").textContent = `Parados antes de "${etapa ? etapa.nome : ""}" — ${cong ? cong.nome : ""}`;
  painel.hidden = false;
  lista.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const dias = discEl("discDiasParado").value || "90";
  const res = await fetchProtegido(`${API_BASE}/discipulado/parados?congregacaoId=${Number(congregacaoId)}&etapaId=${Number(etapaId)}&diasParado=${encodeURIComponent(dias)}`);
  const data = await jsonDaTela(res, lista, "objeto");
  if (data === null) return;
  const itens = Array.isArray(data.itens) ? data.itens : [];
  lista.innerHTML = itens.length ? `<table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Último passo</th><th>Dias sem passo</th></tr></thead><tbody>${
    itens.map((p) => `<tr><td>${escaparHtmlEbd(p.nome)}</td><td>${escaparHtmlEbd(discBr(p.ultimoPasso)) || "data não informada"}</td><td>${p.diasSemPasso == null ? "-" : Number(p.diasSemPasso)}</td></tr>`).join("")
  }</tbody></table>` : "<p class='subtitle'>Ninguém parado.</p>";
}

// ---- o catálogo (nível geral) ----
async function discMostrarCatalogo() {
  const cat = await discCarregarCatalogo();
  const etapas = discEl("discEtapasLista");
  const tipos = discEl("discTiposLista");
  if (!cat) { etapas.innerHTML = "<p class='subtitle'>Não foi possível carregar o catálogo.</p>"; tipos.innerHTML = ""; return; }
  const nomeTipo = (codigo) => (cat.tiposMarco.find((t) => t.codigo === codigo) || {}).nome || codigo;
  const nomeEtapa = (id) => (cat.etapas.find((e) => e.etapaId === id) || {}).nome || id;
  etapas.innerHTML = `<table class="tabela-frequencia"><thead><tr><th>Ordem</th><th>Etapa</th><th>De onde vem</th><th>Pré-requisitos</th><th>Acompanhamento</th><th></th></tr></thead><tbody>${
    cat.etapas.map((e) => `<tr${e.ativa ? "" : " class='linha-inativa'"}><td>${Number(e.ordem)}</td><td>${escaparHtmlEbd(e.nome)}${e.ativa ? "" : " <span class='subtitle'>(desativada)</span>"}</td>
      <td>${escaparHtmlEbd(e.fonteRotulo)}${e.fonte === "MARCO" ? `: ${escaparHtmlEbd(nomeTipo(e.tipoMarco))}` : e.fonte === "TRILHA" ? `: ${escaparHtmlEbd(e.trilhaNome || "")}${e.tipoMarco ? ` (ou o marco ${escaparHtmlEbd(nomeTipo(e.tipoMarco))})` : ""}` : ""}</td>
      <td>${escaparHtmlEbd((e.preRequisitos || []).map(nomeEtapa).join(", ")) || "-"}</td><td>${e.geraAcompanhamento ? "sim" : "não"}</td>
      <td><button class="btn-link" data-on-click="discEditarEtapaAcao" data-args-click="${argsAttr(Number(e.etapaId))}">Editar</button></td></tr>`).join("")
  }</tbody></table>`;
  tipos.innerHTML = `<table class="tabela-frequencia"><thead><tr><th>Código</th><th>Nome</th><th>Único</th><th>Só nível geral</th><th>Ativo</th><th></th></tr></thead><tbody>${
    cat.tiposMarco.map((t) => `<tr><td>${escaparHtmlEbd(t.codigo)}</td><td>${escaparHtmlEbd(t.nome)}</td><td>${t.unico ? "sim" : "não"}</td><td>${t.soNivelGeral ? "sim" : "não"}</td>
      <td>${t.ativo ? "sim" : "não"}</td><td><button class="btn-link" data-on-click="discEditarTipoAcao" data-args-click="${argsAttr(String(t.codigo))}">Editar</button></td></tr>`).join("")
  }</tbody></table>`;
  discPreencherFormEtapa();
}

function discPreencherFormEtapa() {
  const cat = discCatalogo;
  if (!cat) return;
  discEl("discEtapaTipoMarco").innerHTML = `<option value="">(nenhum — só na etapa de trilha)</option>${cat.tiposMarco.filter((t) => t.ativo).map((t) => `<option value="${escaparHtmlEbd(t.codigo)}">${escaparHtmlEbd(t.nome)}</option>`).join("")}`;
  discEl("discEtapaTrilha").innerHTML = `<option value="">(escolha)</option>${cat.trilhas.map((t) => `<option value="${Number(t.trilhaId)}">${escaparHtmlEbd(t.nome)}</option>`).join("")}`;
  discEl("discEtapaFonte").innerHTML = Object.entries(cat.fontes).map(([k, v]) => `<option value="${escaparHtmlEbd(k)}">${escaparHtmlEbd(v)}</option>`).join("");
}

function discMudouFonteAcao() {
  const fonte = discEl("discEtapaFonte").value;
  discEl("discGrupoTipoMarco").hidden = fonte !== "MARCO" && fonte !== "TRILHA";   // na trilha, o marco é opcional (o marco antigo continua valendo)
  discEl("discGrupoTrilha").hidden = fonte !== "TRILHA";
}

function discNovaEtapaAcao() { discAbrirFormEtapa(null); }
function discEditarEtapaAcao(etapaId) { discAbrirFormEtapa((discCatalogo && discCatalogo.etapas.find((e) => e.etapaId === Number(etapaId))) || null); }

function discAbrirFormEtapa(e) {
  if (!discCatalogo) return;
  discEtapaEditando = e ? e.etapaId : null;
  discEl("discFormEtapaTitulo").textContent = e ? `Editar etapa — ${e.nome}` : "Nova etapa";
  discEl("discEtapaChave").value = e ? e.chave : "";
  discEl("discEtapaNome").value = e ? e.nome : "";
  discEl("discEtapaDescricao").value = e ? e.descricao || "" : "";
  discEl("discEtapaOrdem").value = e ? String(e.ordem) : String(discCatalogo.etapas.length + 1);
  discEl("discEtapaFonte").value = e ? e.fonte : "MARCO";
  discEl("discEtapaTipoMarco").value = e && e.tipoMarco ? e.tipoMarco : "";
  discEl("discEtapaTrilha").value = e && e.trilhaId ? String(e.trilhaId) : "";
  discEl("discEtapaGera").checked = e ? e.geraAcompanhamento : true;
  discEl("discEtapaAtiva").checked = e ? e.ativa : true;
  const pre = new Set(e ? e.preRequisitos : []);
  discEl("discEtapaPre").innerHTML = discCatalogo.etapas.filter((x) => !e || x.etapaId !== e.etapaId)
    .map((x) => `<label class="rotulo-inline"><input type="checkbox" id="discPre_${Number(x.etapaId)}"${pre.has(x.etapaId) ? " checked" : ""} /> ${escaparHtmlEbd(x.nome)}</label>`).join(" ");
  discMudouFonteAcao();
  discEl("discFormEtapa").hidden = false;
}

function discFecharFormEtapaAcao() { discEl("discFormEtapa").hidden = true; discEtapaEditando = null; }

let discOcupado = false;
async function discPost(acao, corpo) {
  const msg = discEl("discResultado");
  if (discOcupado) { msg.textContent = "Aguarde: a gravação anterior ainda está em andamento."; return null; }
  discOcupado = true;
  try {
    const res = await fetchProtegido(`${API_BASE}/discipulado/${acao}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const data = await res.json().catch(() => ({ sucesso: false, mensagem: "Resposta inválida do servidor." }));
    msg.textContent = data.mensagem || "";
    return data;
  } finally {
    discOcupado = false;
  }
}

async function discSalvarEtapaAcao() {
  if (!discCatalogo) return;
  const preRequisitos = discCatalogo.etapas.filter((x) => { const el = discEl(`discPre_${x.etapaId}`); return !!(el && el.checked); }).map((x) => x.etapaId);
  const fonte = discEl("discEtapaFonte").value;
  const data = await discPost("etapa", {
    etapaId: discEtapaEditando, chave: discEl("discEtapaChave").value, nome: discEl("discEtapaNome").value, descricao: discEl("discEtapaDescricao").value,
    ordem: Number(discEl("discEtapaOrdem").value), fonte, tipoMarco: fonte === "MARCO" || fonte === "TRILHA" ? discEl("discEtapaTipoMarco").value || null : null,
    trilhaId: fonte === "TRILHA" ? Number(discEl("discEtapaTrilha").value) || null : null, geraAcompanhamento: discEl("discEtapaGera").checked, ativa: discEl("discEtapaAtiva").checked, preRequisitos
  });
  if (data && data.sucesso) { discFecharFormEtapaAcao(); await discMostrarCatalogo(); discCarregarFunilAcao(); }
}

function discEditarTipoAcao(codigo) {
  const t = discCatalogo && discCatalogo.tiposMarco.find((x) => x.codigo === String(codigo));
  discEl("discTipoCodigo").value = t ? t.codigo : "";
  discEl("discTipoCodigo").readOnly = !!t;
  discEl("discTipoNome").value = t ? t.nome : "";
  discEl("discTipoDescricao").value = t ? t.descricao || "" : "";
  discEl("discTipoUnico").checked = !!(t && t.unico);
  discEl("discTipoSoGeral").checked = !!(t && t.soNivelGeral);
  discEl("discTipoAtivo").checked = t ? t.ativo : true;
}
function discNovoTipoAcao() { discEditarTipoAcao(null); }

async function discSalvarTipoAcao() {
  const data = await discPost("tipo-marco", {
    codigo: discEl("discTipoCodigo").value, nome: discEl("discTipoNome").value, descricao: discEl("discTipoDescricao").value,
    unico: discEl("discTipoUnico").checked, soNivelGeral: discEl("discTipoSoGeral").checked, ativo: discEl("discTipoAtivo").checked
  });
  if (data && data.sucesso) { discNovoTipoAcao(); await discMostrarCatalogo(); }
}

registrarAcoes({
  discCarregarFunilAcao, discVerParadosAcao, discMudouFonteAcao, discNovaEtapaAcao, discEditarEtapaAcao, discFecharFormEtapaAcao, discSalvarEtapaAcao,
  discEditarTipoAcao, discNovoTipoAcao, discSalvarTipoAcao
});
