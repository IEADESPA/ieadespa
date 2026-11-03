// modulos/entidades-vinculadas.js — v9.1: Entidades vinculadas (Estatuto Art. 64 a 68; Regimento Art. 47-A e 153). Toda regra mora no servidor
// (api/shared/entidadesVinculadas.js e entidadesVinculadasDb.js, rota /api/entidades-vinculadas); aqui só se monta a tela. Tudo é do nível geral com a permissão
// "entidades_vinculadas"; decretar e encerrar a intervenção aparecem só para o Pastor Presidente em exercício (catalogos.papeis.presidente) — o servidor confere de novo.
//  - Painel: as pendências (o prazo de 15 dias correndo, apurações, prestações atrasadas, o que espera a CLI ou a Assembleia, gestor sem a formação exigida);
//  - Entidades: a lista, o cadastro e a ficha (dirigentes, intervenção, prestação de contas, extinção), cada ação num formulário montado pela especificação dela;
//  - Tipos: o catálogo (natureza e formações aceitas para o gestor).
// Todo texto que vem do servidor passa por escaparHtmlEbd; toda resposta confere, depois de cada await, se o login ainda é o mesmo (authToken).

let entCatalogos = null;
let entTipos = [];
let entReunioes = { CLI: [], AG: [] };
let entFicha = null;            // a entidade aberta (a resposta de /entidade)
let entForm = null;             // o formulário de ação aberto: { chave, fixos }
let entTipoEditando = null;
let entOcupado = false;
let entPedidoFicha = 0;
let entPedidoPainel = 0;
let entPedidoLista = 0;
let entSecaoAtual = "painel";
const entEl = (idEl) => document.getElementById(idEl);
const entBr = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const entH = (v) => escaparHtmlEbd(v == null ? "" : String(v));
const ENT_SEM_CONEXAO = "<p class='subtitle'>Sem conexão com o servidor. Tente de novo.</p>";

async function entBuscar(caminho) {
  const token = authToken;
  let res;
  try { res = await fetchProtegido(`${API_BASE}/entidades-vinculadas/${caminho}`); } catch (e) { return authToken === token ? { semConexao: true } : null; }
  const data = await res.json().catch(() => ({ sucesso: false, mensagem: "Resposta inválida do servidor." }));
  return authToken === token ? data : null;
}
async function entPost(acao, corpo, alvoMsg) {
  if (entOcupado) { entMensagem(alvoMsg, "Aguarde: a gravação anterior ainda está em andamento."); return null; }
  entOcupado = true;
  const token = authToken;
  try {
    let res;
    try { res = await fetchProtegido(`${API_BASE}/entidades-vinculadas/${acao}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }); } catch (e) {
      if (authToken === token) entMensagem(alvoMsg, "Sem conexão com o servidor. Tente de novo.");
      return null;
    }
    const data = await res.json().catch(() => ({ sucesso: false, mensagem: "Resposta inválida do servidor." }));
    if (authToken !== token) return null;
    entMensagem(alvoMsg, data.mensagem || (data.sucesso ? "Feito." : "Não foi possível."));
    return data;
  } finally {
    entOcupado = false;
  }
}
function entMensagem(idEl, texto) { const el = entEl(idEl); if (el) el.textContent = texto || ""; }

// Troca de login ou saída: nada da sessão anterior fica na página (nem o que foi digitado nos formulários).
function entLimparTela() {
  entCatalogos = null; entTipos = []; entReunioes = { CLI: [], AG: [] }; entFicha = null; entForm = null; entTipoEditando = null;
  entPedidoFicha++; entPedidoPainel++; entPedidoLista++;
  for (const idEl of ["entPainel", "entLista", "entFicha", "entListaTipos", "entMsgPainel", "entMsgLista", "entMsgFicha", "entMsgTipos", "entMsgNova", "entNovaTipo"]) { const el = entEl(idEl); if (el) el.innerHTML = ""; }
  for (const idEl of ["entNovaRazao", "entNovaFantasia", "entNovaCnpj", "entNovaFinalidade", "entNovaMunicipio", "entNovaUf", "entTipoNome", "entTipoFormacoes"]) { const el = entEl(idEl); if (el) el.value = ""; }
  const ativo = entEl("entTipoAtivo"); if (ativo) ativo.checked = true;
  const fichaBloco = entEl("entBlocoFicha"); if (fichaBloco) fichaBloco.style.display = "none";
}

// ================================================================ abrir a aba ================================================================
async function carregarOpcoesEntidadesAcao() {
  const [cat, tipos, cli, ag] = await Promise.all([entBuscar("catalogos"), entBuscar("tipos?todos=1"), entBuscar("reunioes?orgao=CLI"), entBuscar("reunioes?orgao=AG")]);
  if (cat === null) return;
  if (!cat.sucesso) { entEl("entPainel").innerHTML = cat.semConexao ? ENT_SEM_CONEXAO : `<p class='subtitle'>${entH(cat.mensagem)}</p>`; return; }
  entCatalogos = cat;
  entTipos = tipos && tipos.sucesso && Array.isArray(tipos.tipos) ? tipos.tipos : [];
  entReunioes = { CLI: cli && Array.isArray(cli.reunioes) ? cli.reunioes : [], AG: ag && Array.isArray(ag.reunioes) ? ag.reunioes : [] };
  entPreencherTiposNoCadastro();
  entMostrarSecaoAcao(entSecaoAtual);
}
function entMostrarSecaoAcao(secao) {
  entSecaoAtual = ["painel", "entidades", "tipos"].includes(secao) ? secao : "painel";
  for (const s of ["painel", "entidades", "tipos"]) {
    const div = entEl(`entSecao${capitalize(s)}`); if (div) div.style.display = s === entSecaoAtual ? "block" : "none";
    const b = entEl(`btnEntSecao${capitalize(s)}`); if (b) b.classList.toggle("ativo", s === entSecaoAtual);
  }
  if (entSecaoAtual === "painel") entCarregarPainelAcao();
  if (entSecaoAtual === "entidades") entCarregarListaAcao();
  if (entSecaoAtual === "tipos") entMostrarTipos();
}

// ================================================================ painel ================================================================
function entItemPainel(entidadeId, texto) {
  return `<li>${texto} <button type="button" class="btn-link" data-on-click="entAbrirFichaAcao" data-args-click="${argsAttr(Number(entidadeId))}">Abrir</button></li>`;
}
async function entCarregarPainelAcao() {
  const alvo = entEl("entPainel");
  if (!alvo) return;
  const meu = ++entPedidoPainel;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const p = await entBuscar("painel");
  if (p === null || meu !== entPedidoPainel) return;
  if (!p.sucesso) { alvo.innerHTML = p.semConexao ? ENT_SEM_CONEXAO : `<p class='subtitle'>${entH(p.mensagem)}</p>`; return; }
  // cada lista já sai montada (e escapada) aqui mesmo: o bloco só junta o título, a lista e o texto de "vazio"
  const bloco = (titulo, lis, vazio) => `<h4>${titulo}</h4>${lis ? `<ul>${lis}</ul>` : `<p class="subtitle">${vazio}</p>`}`;
  const arr = (x) => (Array.isArray(x) ? x : []);
  const esperandoCLI = [...arr(p.propostas).map((x) => ({ entidadeId: x.entidadeId, entidade: x.entidade, texto: "cadastro proposto (aprovar ou não o vínculo)" })),
    ...arr(p.indicacoes).map((x) => ({ entidadeId: x.entidadeId, entidade: x.entidade, texto: `${Number(x.quantidade)} indicação(ões) para homologar` }))];
  alvo.innerHTML = [
    bloco("⏳ Intervenção esperando a ratificação da CLI (prazo fatal de 15 dias — Regimento, Art. 47-A §2º)", arr(p.intervencoesCorrendo).map((x) => entItemPainel(x.entidadeId,
      `<strong>${entH(x.entidade)}</strong> — ${Number(x.diasRestantes) <= 0 ? "<strong>vence HOJE</strong>" : `faltam <strong>${entH(x.diasRestantes)}</strong> dia(s)`} (até ${entH(entBr(x.prazo))})`)).join(""),
      "Nenhuma intervenção correndo prazo."),
    bloco("🔎 Apurações abertas", arr(p.apuracoes).map((x) => entItemPainel(x.entidadeId, `${entH(x.entidade)} — ${x.notificadoEm ? `gestor notificado em ${entH(entBr(x.notificadoEm))}; a decretação sem urgência só a partir de ${entH(entBr(x.decretavelDesde))}` : "gestor ainda não notificado"}`)).join(""),
      "Nenhuma apuração aberta."),
    bloco("🚩 Prestação de contas atrasada (Estatuto, Art. 67)", arr(p.prestacoesAtrasadas).map((x) => entItemPainel(x.entidadeId, `${entH(x.entidade)} — período ${entH(x.periodo)}, venceu em ${entH(entBr(x.prazo))}`)).join(""), "Nenhuma atrasada."),
    bloco("📥 Prestações entregues esperando a CLI", arr(p.aguardandoApreciacao).map((x) => entItemPainel(x.entidadeId, `${entH(x.entidade)} — período ${entH(x.periodo)}`)).join(""), "Nenhuma."),
    bloco("🧾 Falta a verificação anual do Conselho Fiscal (Art. 66 §3º)", arr(p.cfPendente).map((x) => entItemPainel(x.entidadeId, `${entH(x.entidade)} — exercício ${entH(String(x.periodo).slice(0, 4))}`)).join(""), "Nenhuma."),
    bloco("🏛️ Esperando a CLI", esperandoCLI.map((x) => entItemPainel(x.entidadeId, `${entH(x.entidade)} — ${entH(x.texto)}`)).join(""), "Nada esperando a CLI."),
    bloco("🗳️ Esperando a Assembleia Geral (Art. 18, VII, \"b\")", arr(p.aguardandoAG).map((x) => entItemPainel(x.entidadeId,
      `${entH(x.entidade)} — ${x.objeto === "EXTINCAO" ? "a extinção" : "a criação do vínculo"}, aprovada pela CLI em ${entH(entBr(x.desde))}`)).join(""), "Nada esperando a Assembleia."),
    bloco("🎓 Gestor técnico sem a formação exigida (Regimento, Art. 153)", arr(p.semGestor).map((x) => entItemPainel(x.entidadeId, `${entH(x.entidade)} — ${entH(x.mensagem)}`)).join(""), "Todas em dia."),
    bloco("📅 Mandatos vencidos", arr(p.mandatosVencidos).map((x) => entItemPainel(x.entidadeId, `${entH(x.entidade)} — ${entH(x.quantidade)} mandato(s)`)).join(""), "Nenhum.")
  ].join("");
}

// ================================================================ lista e cadastro ================================================================
function entPreencherTiposNoCadastro() {
  const sel = entEl("entNovaTipo");
  if (!sel) return;
  sel.innerHTML = `<option value="">— escolha —</option>${entTipos.filter((t) => t.ativo).map((t) => `<option value="${entH(t.tipoId)}">${entH(t.nome)} (${entH(t.naturezaRotulo)})</option>`).join("")}`;
}
async function entCarregarListaAcao() {
  const alvo = entEl("entLista");
  if (!alvo) return;
  const meu = ++entPedidoLista;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const r = await entBuscar("entidades");
  if (r === null || meu !== entPedidoLista) return;
  if (!r.sucesso) { alvo.innerHTML = r.semConexao ? ENT_SEM_CONEXAO : `<p class='subtitle'>${entH(r.mensagem)}</p>`; return; }
  const lista = Array.isArray(r.entidades) ? r.entidades : [];
  if (!lista.length) { alvo.innerHTML = "<p class='subtitle'>Nenhuma entidade cadastrada.</p>"; return; }
  alvo.innerHTML = `<table class="tabela-simples"><thead><tr><th>Entidade</th><th>Tipo</th><th>Situação</th><th>Alertas</th><th></th></tr></thead><tbody>${lista.map((e) => {
    const alertas = [
      e.intervencao ? `⚖️ ${entH(e.intervencao.statusRotulo)}` : "",
      Array.isArray(e.atrasadas) && e.atrasadas.length ? `🚩 ${e.atrasadas.length} prestação(ões) atrasada(s)` : "",
      Number(e.indicadosAguardando) ? `🏛️ ${entH(e.indicadosAguardando)} indicação(ões) para a CLI` : "",
      e.pendenciaGestor ? "🎓 sem gestor habilitado" : "",
      e.aguardandoAG ? "🗳️ esperando a Assembleia" : ""
    ].filter(Boolean).join("<br>");
    return `<tr><td><strong>${entH(e.nomeFantasia || e.razaoSocial)}</strong><br><small>${entH(e.cnpjFormatado)}</small></td><td>${entH(e.tipoNome)}</td><td>${entH(e.statusRotulo)}</td>
      <td>${alertas || "—"}</td><td><button type="button" class="btn-link" data-on-click="entAbrirFichaAcao" data-args-click="${argsAttr(Number(e.entidadeId))}">Abrir</button></td></tr>`;
  }).join("")}</tbody></table>`;
}
async function entSalvarNovaAcao() {
  const corpo = {
    razaoSocial: entEl("entNovaRazao").value, nomeFantasia: entEl("entNovaFantasia").value, cnpj: entEl("entNovaCnpj").value, tipoId: entEl("entNovaTipo").value,
    finalidade: entEl("entNovaFinalidade").value, municipio: entEl("entNovaMunicipio").value, uf: entEl("entNovaUf").value
  };
  const r = await entPost("entidade", corpo, "entMsgNova");
  if (!r || !r.sucesso) return;
  for (const idEl of ["entNovaRazao", "entNovaFantasia", "entNovaCnpj", "entNovaFinalidade", "entNovaMunicipio", "entNovaUf"]) entEl(idEl).value = "";
  entEl("entNovaTipo").value = "";
  const det = entEl("entNovaDetalhes"); if (det) det.open = false;
  await entCarregarListaAcao();
  if (r.entidadeId) await entAbrirFichaAcao(r.entidadeId);
}

// ================================================================ a ficha ================================================================
async function entAbrirFichaAcao(entidadeId) {
  const id = Number(entidadeId);
  if (!Number.isInteger(id) || id <= 0) return;
  if (entSecaoAtual !== "entidades") { entSecaoAtual = "entidades"; for (const s of ["painel", "entidades", "tipos"]) { const div = entEl(`entSecao${capitalize(s)}`); if (div) div.style.display = s === "entidades" ? "block" : "none"; const b = entEl(`btnEntSecao${capitalize(s)}`); if (b) b.classList.toggle("ativo", s === "entidades"); } entCarregarListaAcao(); }
  const meu = ++entPedidoFicha;
  entForm = null;
  const bloco = entEl("entBlocoFicha"); if (bloco) bloco.style.display = "block";
  entEl("entFicha").innerHTML = "<p class='subtitle'>Carregando…</p>";
  const r = await entBuscar(`entidade?entidadeId=${encodeURIComponent(id)}`);
  if (r === null || meu !== entPedidoFicha) return;
  if (!r.sucesso || !r.entidade) { entFicha = null; entEl("entFicha").innerHTML = r.semConexao ? ENT_SEM_CONEXAO : `<p class='subtitle'>${entH(r.mensagem)}</p>`; return; }
  entFicha = r.entidade;
  entRenderFicha();
  if (bloco && typeof bloco.scrollIntoView === "function") bloco.scrollIntoView({ behavior: "smooth", block: "start" });
}
function entFecharFichaAcao() {
  entPedidoFicha++; entFicha = null; entForm = null;
  entEl("entFicha").innerHTML = "";
  entMensagem("entMsgFicha", "");
  const bloco = entEl("entBlocoFicha"); if (bloco) bloco.style.display = "none";
}
const entBotao = (rotulo, chave, fixos = {}) => `<button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:2px;" data-on-click="entAbrirFormAcao" data-args-click="${argsAttr(String(chave), fixos)}">${rotulo}</button>`;
const entBotaoAnexos = (tabela, id, titulo) => `<button type="button" class="btn-link" data-on-click="entAnexosAcao" data-args-click="${argsAttr(String(tabela), Number(id), String(titulo || ""))}">📎 Documentos</button>`;

function entRenderFicha() {
  const e = entFicha;
  if (!e) return;
  const presidente = !!(entCatalogos && entCatalogos.papeis && entCatalogos.papeis.presidente);
  const ativaOuProposta = e.status === "ATIVA" || e.status === "PROPOSTA";
  const emCurso = (e.intervencoes || []).find((i) => ["APURACAO", "DECRETADA", "RATIFICADA"].includes(i.status));
  const fixo = { entidadeId: Number(e.entidadeId) };
  const acoesEntidade = [
    ativaOuProposta ? entBotao("✏️ Editar dados", "editar", fixo) : "",
    e.status === "PROPOSTA" ? entBotao("✅ Aprovação da CLI", "vinculoAprovar", fixo) + entBotao("✖️ Não aprovada", "vinculoNaoAprovar", fixo) : "",
    e.aguardandoAG ? entBotao(e.aguardandoAG === "EXTINCAO" ? "🗳️ Assembleia: a extinção" : "🗳️ Assembleia: o vínculo", "assembleia", fixo) : "",
    ativaOuProposta ? entBotao("📆 Prestação de contas: periodicidade", "prestacaoConfig", fixo) : "",
    e.status === "ATIVA" && !emCurso ? entBotao("🔎 Abrir apuração", "apuracaoAbrir", fixo) : "",
    e.status === "ATIVA" && e.aguardandoAG !== "VINCULO" ? entBotao("⚰️ Extinção", "extinguir", fixo) : "",
    entBotaoAnexos("EntidadesVinculadas", e.entidadeId, e.razaoSocial)
  ].filter(Boolean).join(" ");
  const pend = Array.isArray(e.pendencias) && e.pendencias.length ? `<ul>${e.pendencias.map((p) => `<li>⚠️ ${entH(p)}</li>`).join("")}</ul>` : "";
  const dados = `
    <h4>${entH(e.razaoSocial)}${e.nomeFantasia ? ` <small>(${entH(e.nomeFantasia)})</small>` : ""}</h4>
    <p><strong>${entH(e.statusRotulo)}</strong> · CNPJ ${entH(e.cnpjFormatado)} · ${entH(e.tipoNome)} (${entH(e.naturezaRotulo)})${e.municipio ? ` · ${entH(e.municipio)}${e.uf ? `/${entH(e.uf)}` : ""}` : ""}</p>
    <p class="subtitle">${entH(e.finalidade)}</p>
    ${e.vinculo ? `<p>Vínculo aprovado pela CLI em ${entH(entBr(e.vinculo.em))}${e.vinculoAG ? ` · Assembleia de ${entH(entBr(e.vinculoAG.em))}: ${entH(e.vinculoAG.resultadoRotulo)}` : " · <strong>esperando a ratificação da Assembleia Geral</strong>"}.</p>` : ""}
    ${e.naoAprovada ? `<p>Não aprovada em ${entH(entBr(e.naoAprovada.em))}: ${entH(e.naoAprovada.motivo)}</p>` : ""}
    ${e.extincao ? `<p>Extinção aprovada pela CLI em ${entH(entBr(e.extincao.em))} — patrimônio: ${entH(e.extincao.destinoRotulo)} → ${entH(e.extincao.destinatarioNome)}${e.extincao.destinatarioCnpj ? ` (${entH(e.extincao.destinatarioCnpj)})` : ""}.
      ${e.extincao.bensComodato ? `Bens da Matriz em comodato que voltam: ${entH(e.extincao.bensComodato)}.` : ""} ${e.extincaoAG ? `Assembleia: ${entH(e.extincaoAG.resultadoRotulo)}.` : "<strong>Esperando a Assembleia.</strong>"}</p>` : ""}
    ${pend}<div class="barra-lista">${acoesEntidade}</div>`;

  // dirigentes
  const exig = Array.isArray(e.formacoesExigidas) && e.formacoesExigidas.length ? `Gestor técnico deste tipo: ${entH(e.formacoesExigidas.join(" ou "))} (Regimento, Art. 153).` : "Este tipo não tem exigência legal de formação para o gestor.";
  const dirs = Array.isArray(e.dirigentes) ? e.dirigentes : [];
  const linhasDir = dirs.map((d) => {
    const abertos = d.status === "INDICADO" || d.status === "HOMOLOGADO";
    const botoes = [
      d.status === "INDICADO" ? entBotao("Homologação da CLI", "homologar", { dirigenteId: Number(d.dirigenteId) }) + entBotao("Recusa da CLI", "recusar", { dirigenteId: Number(d.dirigenteId) }) : "",
      abertos ? entBotao("Encerrar", "encerrarDirigente", { dirigenteId: Number(d.dirigenteId) }) : ""
    ].join("");
    const datas = [d.indicadoEm ? `indicado em ${entH(entBr(d.indicadoEm))} (${entH(d.indicacaoAto)})` : "", d.homologadoEm ? `homologado em ${entH(entBr(d.homologadoEm))}` : "",
      d.mandatoAte ? `mandato até ${entH(entBr(d.mandatoAte))}` : "", d.encerradoEm ? `encerrado em ${entH(entBr(d.encerradoEm))} — ${entH(d.motivoEncerramentoRotulo || "")}` : ""].filter(Boolean).join("; ");
    return `<tr><td>${entH(d.funcaoRotulo)}</td><td>${entH(d.nome)}${d.externo ? " <small>(de fora)</small>" : ` <small>(mat. ${entH(d.membroId)})</small>`}${d.remunerado ? " · remunerado" : ""}</td>
      <td>${entH(d.formacao || "—")}${d.registroProfissional ? `<br><small>${entH(d.registroProfissional)}</small>` : ""}</td>
      <td>${entH(d.situacaoRotulo)}${d.afastadoPelaIntervencao ? "<br><strong>afastado pela intervenção</strong>" : ""}<br><small>${datas}</small></td><td>${botoes}</td></tr>`;
  }).join("");
  const dirigentes = `<h4>👥 Direção (Estatuto, Art. 65 §1º: indicação do Pastor Presidente, homologação da CLI)</h4><p class="subtitle">${exig}</p>
    ${dirs.length ? `<table class="tabela-simples"><thead><tr><th>Função</th><th>Quem</th><th>Formação</th><th>Situação</th><th></th></tr></thead><tbody>${linhasDir}</tbody></table>` : "<p class='subtitle'>Ninguém indicado ainda.</p>"}
    ${ativaOuProposta ? `<div class="barra-lista">${entBotao("➕ Registrar indicação", "indicar", fixo)}</div>` : ""}`;

  // intervenções
  const ivs = Array.isArray(e.intervencoes) ? e.intervencoes : [];
  const cartoes = ivs.map((i) => {
    const iid = { intervencaoId: Number(i.intervencaoId) };
    const botoes = [
      i.status === "APURACAO" ? entBotao("✉️ Notificação do gestor", "notificar", iid) + (i.notificadoEm ? entBotao("🗣️ Manifestação do gestor", "manifestacao", iid) : "") + entBotao("🗄️ Arquivar", "arquivar", iid) : "",
      i.status === "APURACAO" && presidente ? entBotao("⚖️ Decretar intervenção", "decretar", iid) : "",
      i.status === "DECRETADA" || i.status === "CADUCADA" ? entBotao("🏛️ Decisão da CLI", "ratificar", iid) : "",
      (i.status === "DECRETADA" || i.status === "RATIFICADA") && presidente ? entBotao("🔓 Encerrar intervenção", "encerrarIntervencao", iid) : "",
      (i.status === "RATIFICADA" || i.status === "ENCERRADA") && i.afastaDiretoria && i.ratificacaoEm && !i.defesaCEIEm ? entBotao("🛡️ Defesa no Conselho de Ética", "defesa", iid) : "",
      (i.status === "CADUCADA" || i.status === "NAO_RATIFICADA") && e.status === "ATIVA" && !emCurso ? entBotao("🔁 Nova apuração com os mesmos fatos", "reabrir", iid) : "",
      entBotaoAnexos("EntidadeIntervencoes", i.intervencaoId, `Intervenção — ${e.razaoSocial}`)
    ].join("");
    const prazo = i.status === "DECRETADA" ? `<p class="aviso-prazo"><strong>Prazo fatal da CLI: ${entH(entBr(i.prazoRatificacao))}</strong> — ${Number(i.diasRestantes) <= 0 ? "vence HOJE" : `faltam ${entH(i.diasRestantes)} dia(s)`}. Sem a ratificação dentro dele, a intervenção perde a eficácia (Regimento, Art. 47-A §2º).</p>` : "";
    return `<div class="cartao-simples" style="margin:8px 0;padding:8px;border:1px solid #ccc;border-radius:6px;">
      <p><strong>${entH(i.statusRotulo)}</strong> · ${entH(i.motivoRotulo)} · aberta em ${entH(entBr(i.abertaEm))}</p>
      <p class="subtitle">${entH(i.fatos)}</p>
      ${i.notificadoEm ? `<p>Gestor notificado em ${entH(entBr(i.notificadoEm))} (${entH(i.notificacaoForma)}); pode se manifestar até ${entH(entBr(i.decretavelDesde))}.${i.manifestacaoEm ? ` Manifestou-se em ${entH(entBr(i.manifestacaoEm))}: ${entH(i.manifestacaoResumo)}` : ""}</p>` : ""}
      ${i.decretadaEm ? `<p>Decretada em ${entH(entBr(i.decretadaEm))}${i.urgencia ? " <strong>com urgência</strong>" : ""}. Interventor: ${entH(i.interventor)}.${i.afastaDiretoria ? " A diretoria fica afastada." : ""}</p><p class="subtitle">${entH(i.fundamentacao)}</p>` : ""}
      ${prazo}
      ${i.ratificacaoEm ? `<p>Decisão da CLI na reunião de ${entH(entBr(i.ratificacaoEm))}.${i.ratificacaoObs ? ` ${entH(i.ratificacaoObs)}` : ""}</p>` : ""}
      ${i.caducadaEm && i.status === "CADUCADA" ? `<p><strong>Perdeu a eficácia em ${entH(entBr(i.caducadaEm))}.</strong> Se a CLI decidiu numa reunião dentro do prazo, registre a decisão: ela prevalece.</p>` : ""}
      ${i.defesaCEIEm ? `<p>Defesa no Conselho de Ética em ${entH(entBr(i.defesaCEIEm))} (${entH(i.defesaCEIReferencia)}).</p>` : ""}
      ${i.encerradaEm ? `<p>${i.status === "ARQUIVADA" ? "Arquivada" : "Encerrada"} em ${entH(entBr(i.encerradaEm))}: ${entH(i.encerramentoMotivo)}</p>` : ""}
      <div class="barra-lista">${botoes}</div></div>`;
  }).join("");
  const intervencao = `<h4>⚖️ Apuração e intervenção (Estatuto, Art. 65 §§2º e 3º; Regimento, Art. 47-A)</h4>
    <p class="subtitle">A intervenção exige apuração aberta, a notificação do gestor com 5 dias para se manifestar (salvo urgência), a decretação pelo Pastor Presidente${presidente ? "" : " (o botão aparece só para ele)"} e a ratificação da CLI em até 15 dias.</p>
    ${cartoes || "<p class='subtitle'>Nenhum processo.</p>"}`;

  // prestação de contas
  const pers = Array.isArray(e.periodos) ? e.periodos : [];
  const linhasPer = pers.map((p) => {
    const pr = p.prestacao;
    const botoes = [
      ["NO_PRAZO", "ATRASADA"].includes(p.situacao) ? entBotao("📤 Registrar entrega", "prestacaoRegistrar", { entidadeId: Number(e.entidadeId), periodo: String(p.codigo) }) : "",
      p.situacao === "ENTREGUE" ? entBotao("Corrigir entrega", "prestacaoRegistrar", { entidadeId: Number(e.entidadeId), periodo: String(p.codigo) }) + entBotao("🏛️ Apreciação da CLI", "apreciar", { prestacaoId: Number(pr.prestacaoId) }) : "",
      p.cfPendente ? entBotao("🧾 Conselho Fiscal", "cf", { prestacaoId: Number(pr.prestacaoId) }) : "",
      pr ? entBotaoAnexos("EntidadePrestacoes", pr.prestacaoId, `Prestação ${p.codigo} — ${e.razaoSocial}`) : ""
    ].join("");
    const detalhe = pr ? `entregue em ${entH(entBr(pr.entregueEm))} (auditoria: ${entH(pr.auditoriaOrgao)})${pr.resultadoRotulo ? `; CLI em ${entH(entBr(pr.apreciadaEm))}: <strong>${entH(pr.resultadoRotulo)}</strong>${pr.apreciacaoObs ? ` — ${entH(pr.apreciacaoObs)}` : ""}` : ""}${pr.cfResultadoRotulo ? `; Conselho Fiscal em ${entH(entBr(pr.cfVerificadaEm))}: ${entH(pr.cfResultadoRotulo)}` : ""}` : "";
    return `<tr><td>${entH(p.codigo)}</td><td>${entH(entBr(p.inicio))} a ${entH(entBr(p.fim))}</td><td>${entH(entBr(p.prazo))}</td>
      <td>${p.situacao === "ATRASADA" ? "<strong>🚩 Atrasada</strong>" : entH(({ EM_CURSO: "Em curso", NO_PRAZO: "Prazo correndo", ENTREGUE: "Entregue (esperando a CLI)", APRECIADA: "Apreciada" })[p.situacao] || p.situacao)}${detalhe ? `<br><small>${detalhe}</small>` : ""}</td><td>${botoes}</td></tr>`;
  }).join("");
  const prestacao = `<h4>📊 Prestação de contas à CLI (Estatuto, Art. 67)</h4>
    <p class="subtitle">${entH(e.periodicidadeRotulo)}; entrega até ${entH(e.prazoEntregaDias)} dias depois do fim de cada período, com o Relatório de Atividades e o Balanço auditado.</p>
    ${pers.length ? `<table class="tabela-simples"><thead><tr><th>Período</th><th>De/até</th><th>Prazo</th><th>Situação</th><th></th></tr></thead><tbody>${linhasPer}</tbody></table>` : "<p class='subtitle'>Sem períodos: o vínculo ainda não foi aprovado.</p>"}`;

  entEl("entFicha").innerHTML = `${dados}<div id="entFormAcao"></div>${dirigentes}${intervencao}${prestacao}`;
  if (entForm) entRenderForm();
}

// ================================================================ formulários de ação ================================================================
const ENT_REUNIAO_CLI = { id: "sessaoId", rotulo: "Reunião da CLI (já realizada e encerrada)", tipo: "reuniaoCLI" };
const ENT_REUNIAO_AG = { id: "sessaoId", rotulo: "Assembleia Geral (já realizada e encerrada)", tipo: "reuniaoAG" };
const entLista = (chave) => (entCatalogos && Array.isArray(entCatalogos[chave]) ? entCatalogos[chave] : []);
function entEspec(chave) {
  const e = entFicha || {};
  switch (chave) {
    case "editar": return { titulo: "Editar os dados da entidade", acao: "entidade-editar", campos: [
      { id: "razaoSocial", rotulo: "Razão social", valor: e.razaoSocial }, { id: "nomeFantasia", rotulo: "Nome fantasia (opcional)", valor: e.nomeFantasia },
      ...(e.status === "PROPOSTA" ? [{ id: "cnpj", rotulo: "CNPJ da matriz (0001)", valor: e.cnpjFormatado }, { id: "tipoId", rotulo: "Tipo", tipo: "select", opcoes: entTipos.filter((t) => t.ativo || t.tipoId === e.tipoId).map((t) => ({ codigo: t.tipoId, rotulo: t.nome })), valor: e.tipoId }] : [{ id: "tipoId", tipo: "fixo", valor: e.tipoId }]),
      { id: "finalidade", rotulo: "Finalidade", tipo: "area", valor: e.finalidade }, { id: "municipio", rotulo: "Município (opcional)", valor: e.municipio }, { id: "uf", rotulo: "UF (opcional)", valor: e.uf }] };
    case "vinculoAprovar": return { titulo: "Aprovação do vínculo pela CLI (Estatuto, Art. 64, parágrafo único)", acao: "vinculo-aprovar", campos: [ENT_REUNIAO_CLI] };
    case "vinculoNaoAprovar": return { titulo: "A CLI não aprovou o vínculo", acao: "vinculo-nao-aprovar", campos: [{ id: "motivo", rotulo: "Motivo", tipo: "area" }] };
    case "assembleia": return { titulo: e.aguardandoAG === "EXTINCAO" ? "A Assembleia Geral sobre a extinção" : "A Assembleia Geral sobre a criação do vínculo", acao: "assembleia", campos: [ENT_REUNIAO_AG,
      { id: "resultado", rotulo: "Resultado", tipo: "select", opcoes: entLista("resultadosAG") }, { id: "observacao", rotulo: "Observação (obrigatória se não ratificou)", tipo: "area" }],
      aviso: e.aguardandoAG === "EXTINCAO" ? "Se a Assembleia não ratificar, a entidade volta a ativa e os mandatos encerrados pela extinção precisam de nova indicação." : "Se a Assembleia não ratificar, o vínculo é desfeito e os mandatos se encerram." };
    case "prestacaoConfig": return { titulo: "Periodicidade da prestação de contas", acao: "prestacao-config", campos: [
      { id: "periodicidade", rotulo: "Periodicidade", tipo: "select", opcoes: entLista("periodicidades"), valor: e.periodicidade },
      { id: "prazoEntregaDias", rotulo: "Prazo de entrega (dias depois do fim do período)", tipo: "numero", valor: e.prazoEntregaDias }], aviso: "A periodicidade fica fixa depois da primeira prestação registrada." };
    case "indicar": return { titulo: "Registrar a indicação do Pastor Presidente (Estatuto, Art. 65 §1º)", acao: "dirigente-indicar", campos: [
      { id: "funcao", rotulo: "Função", tipo: "select", opcoes: entLista("funcoes") }, { id: "funcaoDescricao", rotulo: "Nome da função (só em \"Outra função\")" },
      { id: "membroId", rotulo: "Matrícula do membro (ou deixe vazio e informe o profissional de fora)", tipo: "numero" }, { id: "nomeExterno", rotulo: "Nome do profissional de fora (Regimento, Art. 153)" },
      { id: "formacao", rotulo: `Formação${Array.isArray(e.formacoesExigidas) && e.formacoesExigidas.length ? ` (gestor técnico: ${e.formacoesExigidas.join(" ou ")})` : ""}` },
      { id: "registroProfissional", rotulo: "Registro profissional (opcional)" }, { id: "remunerado", rotulo: "Cargo remunerado", tipo: "check" },
      { id: "declaracaoParentesco", rotulo: "Profissional de fora remunerado: declarou por escrito que não é parente até o 2º grau de membro da Diretoria Executiva (Art. 76 §2º)", tipo: "check" },
      { id: "indicacaoAto", rotulo: "Ato de indicação do Pastor Presidente (número/referência)" }, { id: "indicadoEm", rotulo: "Data da indicação", tipo: "data" },
      { id: "mandatoAte", rotulo: "Fim do mandato (opcional)", tipo: "data" }] };
    case "homologar": return { titulo: "Homologação da CLI", acao: "dirigente-homologar", campos: [ENT_REUNIAO_CLI] };
    case "recusar": return { titulo: "A CLI recusou a indicação", acao: "dirigente-recusar", campos: [ENT_REUNIAO_CLI, { id: "observacao", rotulo: "Observação (opcional)", tipo: "area" }] };
    case "encerrarDirigente": return { titulo: "Encerrar o mandato", acao: "dirigente-encerrar", campos: [{ id: "motivo", rotulo: "Motivo", tipo: "select", opcoes: entLista("motivosEncerramento") },
      { id: "data", rotulo: "Data", tipo: "data" }, { id: "observacao", rotulo: "Observação (obrigatória em \"Outro\")", tipo: "area" }] };
    case "apuracaoAbrir": return { titulo: "Abrir apuração (Regimento, Art. 47-A §1º)", acao: "apuracao-abrir", campos: [{ id: "motivo", rotulo: "Motivo", tipo: "select", opcoes: entLista("motivosIntervencao") },
      { id: "fatos", rotulo: "Os fatos", tipo: "area" }] };
    case "notificar": return { titulo: "Notificação escrita do gestor (Estatuto, Art. 65 §3º)", acao: "apuracao-notificar", campos: [{ id: "notificadoEm", rotulo: "Data da notificação", tipo: "data" },
      { id: "forma", rotulo: "Como foi notificado (carta, e-mail com confirmação...)" }], aviso: "Uma nova notificação recomeça os 5 dias." };
    case "manifestacao": return { titulo: "Manifestação do gestor", acao: "apuracao-manifestacao", campos: [{ id: "manifestacaoEm", rotulo: "Data", tipo: "data" }, { id: "resumo", rotulo: "Resumo", tipo: "area" }] };
    case "arquivar": return { titulo: "Arquivar a apuração", acao: "apuracao-arquivar", campos: [{ id: "motivo", rotulo: "Motivo do arquivamento", tipo: "area" }] };
    case "reabrir": return { titulo: "Nova apuração com os mesmos fatos", acao: "apuracao-reabrir", campos: [], aviso: "A notificação já feita continua valendo. A nova decretação conta outros 15 dias." };
    case "decretar": return { titulo: "Decretar a intervenção (só o Pastor Presidente)", acao: "intervencao-decretar", campos: [
      { id: "fundamentacao", rotulo: "Fundamentação: os motivos técnicos, disciplinares ou de gestão", tipo: "area" },
      { id: "interventorMembroId", rotulo: "Matrícula do interventor (ou o nome, abaixo)", tipo: "numero" }, { id: "interventorNome", rotulo: "Nome do interventor de fora" },
      { id: "afastaDiretoria", rotulo: "Afasta a diretoria", tipo: "check" }, { id: "urgencia", rotulo: "Urgência: risco iminente ao patrimônio ou à continuidade dos serviços (dispensa os 5 dias)", tipo: "check" },
      { id: "urgenciaJustificativa", rotulo: "Justificativa da urgência", tipo: "area" }], aviso: "A data é a de hoje. A CLI tem 15 dias para ratificar; sem isso, a intervenção perde a eficácia." };
    case "ratificar": return { titulo: "Decisão da CLI sobre a intervenção", acao: "intervencao-ratificar", campos: [ENT_REUNIAO_CLI,
      { id: "resultado", rotulo: "A CLI…", tipo: "select", opcoes: [{ codigo: "RATIFICADA", rotulo: "ratificou" }, { codigo: "NAO_RATIFICADA", rotulo: "não ratificou" }] }, { id: "observacao", rotulo: "Observação (opcional)", tipo: "area" }],
      aviso: "Vale só a reunião feita entre a decretação e o fim do prazo de 15 dias. Quem decretou não registra." };
    case "defesa": return { titulo: "Defesa dos destituídos no Conselho de Ética", acao: "intervencao-defesa", campos: [{ id: "defesaEm", rotulo: "Data", tipo: "data" }, { id: "referencia", rotulo: "Protocolo no Conselho de Ética" }] };
    case "encerrarIntervencao": return { titulo: "Encerrar a intervenção (só o Pastor Presidente)", acao: "intervencao-encerrar", campos: [{ id: "motivo", rotulo: "Motivo (a gestão devolvida a quem)", tipo: "area" }] };
    case "prestacaoRegistrar": return { titulo: "Entrega da prestação de contas", acao: "prestacao-registrar", campos: [{ id: "entregueEm", rotulo: "Data da entrega", tipo: "data" },
      { id: "relatorioAtividades", rotulo: "Relatório Anual de Atividades entregue", tipo: "check" }, { id: "balancoAuditado", rotulo: "Balanço Financeiro auditado entregue", tipo: "check" },
      { id: "auditoriaOrgao", rotulo: "Quem auditou (o órgão de fiscalização da própria entidade, Art. 61, II)" }, { id: "observacao", rotulo: "Observação (opcional)", tipo: "area" }] };
    case "apreciar": return { titulo: "Apreciação da CLI", acao: "prestacao-apreciar", campos: [ENT_REUNIAO_CLI, { id: "resultado", rotulo: "Resultado", tipo: "select", opcoes: entLista("resultadosApreciacao") },
      { id: "observacao", rotulo: "Ressalvas ou motivo (obrigatório se não for \"Aprovada\")", tipo: "area" }] };
    case "cf": return { titulo: "Verificação anual do Conselho Fiscal (Estatuto, Art. 66 §3º)", acao: "prestacao-cf", campos: [{ id: "verificadaEm", rotulo: "Data", tipo: "data" },
      { id: "resultado", rotulo: "Resultado", tipo: "select", opcoes: entLista("resultadosCF") }, { id: "observacao", rotulo: "Observação (obrigatória se houve irregularidade)", tipo: "area" }] };
    case "extinguir": return { titulo: "Extinção da entidade (Estatuto, Art. 68)", acao: "extinguir", campos: [ENT_REUNIAO_CLI,
      { id: "destinoPatrimonio", rotulo: "Destino do patrimônio", tipo: "select", opcoes: entLista("destinos").filter((d) => Array.isArray(d.naturezas) && d.naturezas.includes(e.natureza)) },
      { id: "matrizMantemAssistencia", rotulo: "A IEADESPA mantém atividade assistencial do mesmo tipo (só para devolver bens de saúde à Matriz)", tipo: "check" },
      { id: "destinatarioNome", rotulo: "Quem recebe o patrimônio" }, { id: "destinatarioCnpj", rotulo: "CNPJ de quem recebe (opcional)" },
      { id: "bensComodato", rotulo: "Bens da Matriz cedidos em comodato, que voltam à IEADESPA (opcional)", tipo: "area" }],
      aviso: "Os mandatos se encerram. A extinção ainda vai à Assembleia Geral para a ratificação." };
    default: return null;
  }
}
function entAbrirFormAcao(chave, fixos) {
  if (!entFicha || !entEspec(String(chave))) return;
  entForm = { chave: String(chave), fixos: fixos && typeof fixos === "object" && !Array.isArray(fixos) ? fixos : {} };
  entRenderForm();
  const alvo = entEl("entFormAcao");
  if (alvo && typeof alvo.scrollIntoView === "function") alvo.scrollIntoView({ behavior: "smooth", block: "center" });
}
function entOpcoesReuniao(lista) {
  return `<option value="">— escolha —</option>${lista.map((s) => `<option value="${entH(s.sessaoId)}">${entH(entBr(s.data))} — ${entH(s.descricao || "reunião")}</option>`).join("")}`;
}
function entRenderForm() {
  const alvo = entEl("entFormAcao");
  if (!alvo || !entForm) return;
  const esp = entEspec(entForm.chave);
  if (!esp) { alvo.innerHTML = ""; return; }
  const campo = (c) => {
    const idEl = `entCampo_${c.id}`;
    const v = c.valor == null ? "" : String(c.valor);
    if (c.tipo === "fixo") return "";
    if (c.tipo === "check") return `<div class="input-group"><label><input type="checkbox" id="${idEl}" /> ${entH(c.rotulo)}</label></div>`;
    let entrada;
    if (c.tipo === "area") entrada = `<textarea id="${idEl}" rows="3" style="width:100%;">${entH(v)}</textarea>`;
    else if (c.tipo === "select") entrada = `<select id="${idEl}"><option value="">— escolha —</option>${(c.opcoes || []).map((o) => `<option value="${entH(o.codigo)}"${String(o.codigo) === v ? " selected" : ""}>${entH(o.rotulo)}</option>`).join("")}</select>`;
    else if (c.tipo === "reuniaoCLI" || c.tipo === "reuniaoAG") {
      const lista = c.tipo === "reuniaoCLI" ? entReunioes.CLI : entReunioes.AG;
      entrada = lista.length ? `<select id="${idEl}">${entOpcoesReuniao(lista)}</select>` : `<select id="${idEl}"><option value="">Nenhuma reunião encerrada — registre a reunião em ${c.tipo === "reuniaoCLI" ? "Órgãos Centrais → CLI" : "Órgãos Centrais → Assembleia Geral"}</option></select>`;
    } else entrada = `<input type="${c.tipo === "data" ? "date" : (c.tipo === "numero" ? "text" : "text")}" id="${idEl}" value="${entH(v)}"${c.tipo === "numero" ? " inputmode=\"numeric\"" : ""} />`;
    return `<div class="input-group"><label for="${idEl}">${entH(c.rotulo)}</label>${entrada}</div>`;
  };
  alvo.innerHTML = `<div class="vol-form" style="border:1px solid #999;border-radius:6px;padding:10px;margin:10px 0;">
    <h4>${entH(esp.titulo)}</h4>${esp.aviso ? `<p class="subtitle">${entH(esp.aviso)}</p>` : ""}
    ${esp.campos.map(campo).join("")}
    <div class="barra-lista"><button type="button" class="btn-confirmar" style="width:auto;" data-on-click="entEnviarFormAcao">Salvar</button>
    <button type="button" class="btn-confirmar btn-secundario" style="width:auto;" data-on-click="entCancelarFormAcao">Cancelar</button></div></div>`;
  for (const c of esp.campos) if (c.tipo === "check" && c.valor) { const el = entEl(`entCampo_${c.id}`); if (el) el.checked = true; }
}
function entCancelarFormAcao() { entForm = null; const alvo = entEl("entFormAcao"); if (alvo) alvo.innerHTML = ""; }
async function entEnviarFormAcao() {
  if (!entForm || !entFicha) return;
  const esp = entEspec(entForm.chave);
  if (!esp) return;
  if (entForm.chave === "decretar" && !window.confirm("Decretar a intervenção agora? A CLI terá 15 dias para ratificar.")) return;
  const corpo = { ...entForm.fixos };
  for (const c of esp.campos) {
    if (c.tipo === "fixo") { corpo[c.id] = c.valor; continue; }
    const el = entEl(`entCampo_${c.id}`);
    if (!el) continue;
    corpo[c.id] = c.tipo === "check" ? !!el.checked : String(el.value || "").trim();
  }
  const entidadeId = entFicha.entidadeId;
  const r = await entPost(esp.acao, corpo, "entMsgFicha");
  if (!r || !r.sucesso) return;
  const msg = r.mensagem;
  entForm = null;
  await entAbrirFichaAcao(entidadeId);
  entMensagem("entMsgFicha", msg);
  entCarregarListaAcao();
}
function entAnexosAcao(tabela, registroId, titulo) {
  if (typeof abrirModalAnexos === "function") abrirModalAnexos(String(tabela), Number(registroId), String(titulo || "Documentos"));
}

// ================================================================ tipos ================================================================
function entMostrarTipos() {
  const alvo = entEl("entListaTipos");
  if (!alvo) return;
  const sel = entEl("entTipoNatureza");
  if (sel && entCatalogos) sel.innerHTML = `<option value="">— escolha —</option>${entLista("naturezas").map((n) => `<option value="${entH(n.codigo)}">${entH(n.rotulo)}</option>`).join("")}`;
  alvo.innerHTML = entTipos.length ? `<table class="tabela-simples"><thead><tr><th>Tipo</th><th>Natureza</th><th>Formações aceitas para o gestor</th><th>Entidades</th><th></th></tr></thead><tbody>${entTipos.map((t) => `
    <tr><td>${entH(t.nome)}${t.ativo ? "" : " <small>(desativado)</small>"}</td><td>${entH(t.naturezaRotulo)}</td><td>${t.formacoes.length ? entH(t.formacoes.join(", ")) : "<small>sem exigência legal</small>"}</td>
    <td>${entH(t.entidades)}</td><td><button type="button" class="btn-link" data-on-click="entEditarTipoAcao" data-args-click="${argsAttr(Number(t.tipoId))}">Editar</button></td></tr>`).join("")}</tbody></table>`
    : "<p class='subtitle'>Nenhum tipo.</p>";
}
function entEditarTipoAcao(tipoId) {
  const t = entTipos.find((x) => Number(x.tipoId) === Number(tipoId));
  if (!t) return;
  entTipoEditando = t.tipoId;
  entEl("entTipoNome").value = t.nome;
  entEl("entTipoNatureza").value = t.natureza;
  entEl("entTipoFormacoes").value = t.formacoes.join("\n");
  entEl("entTipoAtivo").checked = !!t.ativo;
  entEl("entTipoTitulo").textContent = `Editar o tipo "${t.nome}"`;
  const det = entEl("entTipoDetalhes"); if (det) det.open = true;
}
function entNovoTipoAcao() {
  entTipoEditando = null;
  for (const idEl of ["entTipoNome", "entTipoFormacoes"]) entEl(idEl).value = "";
  entEl("entTipoNatureza").value = "";
  entEl("entTipoAtivo").checked = true;
  entEl("entTipoTitulo").textContent = "Cadastrar um tipo novo";
}
async function entSalvarTipoAcao() {
  const corpo = { nome: entEl("entTipoNome").value, natureza: entEl("entTipoNatureza").value,
    formacoes: String(entEl("entTipoFormacoes").value || "").split("\n").map((x) => x.trim()).filter(Boolean), ativo: !!entEl("entTipoAtivo").checked };
  if (entTipoEditando) corpo.tipoId = entTipoEditando;
  const r = await entPost(entTipoEditando ? "tipo-editar" : "tipo", corpo, "entMsgTipos");
  if (!r || !r.sucesso) return;
  const msg = r.mensagem;
  entNovoTipoAcao();
  const tipos = await entBuscar("tipos?todos=1");
  if (tipos && tipos.sucesso && Array.isArray(tipos.tipos)) { entTipos = tipos.tipos; entPreencherTiposNoCadastro(); entMostrarTipos(); }
  entMensagem("entMsgTipos", msg);
}

// Meus Dados (LGPD): as funções que a pessoa ocupa ou ocupou na direção de entidade vinculada e as intervenções em que foi o interventor.
function entCartaoMeusDados(d) {
  const funcoes = d && Array.isArray(d.funcoes) ? d.funcoes : [];
  const inter = d && Array.isArray(d.comoInterventor) ? d.comoInterventor : [];
  if (!funcoes.length && !inter.length) return "";
  return `
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Entidades vinculadas (direção)</h4>
      ${funcoes.map((f) => `<p class="linha-perfil">${entH(f.funcao)} — ${entH(f.entidade)}: ${entH(f.situacao)}${f.remunerado ? " (remunerado)" : ""}${f.indicadoEm ? `, indicado em ${entH(entBr(f.indicadoEm))}` : ""}${f.encerradoEm ? `, encerrado em ${entH(entBr(f.encerradoEm))}${f.motivoEncerramento ? ` (${entH(f.motivoEncerramento)})` : ""}` : ""}</p>`).join("")}
      ${inter.map((i) => `<p class="linha-perfil">Interventor em ${entH(i.entidade)} — decretada em ${entH(entBr(i.decretadaEm))}: ${entH(i.situacao)}</p>`).join("")}
    </div>`;
}

registrarAcoes({
  entMostrarSecaoAcao, entCarregarPainelAcao, entCarregarListaAcao, entSalvarNovaAcao, entAbrirFichaAcao, entFecharFichaAcao,
  entAbrirFormAcao, entCancelarFormAcao, entEnviarFormAcao, entAnexosAcao, entEditarTipoAcao, entNovoTipoAcao, entSalvarTipoAcao
});
