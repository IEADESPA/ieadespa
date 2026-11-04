// modulos/entidades-vinculadas.js — v9.1: Entidades vinculadas (Estatuto Art. 64 a 68; Regimento Art. 47-A e 153). Toda regra mora no servidor
// (api/shared/entidadesVinculadas.js e entidadesVinculadasDb.js, rota /api/entidades-vinculadas); aqui só se monta a tela. Tudo é do nível geral com a permissão
// "entidades_vinculadas"; decretar e encerrar a intervenção aparecem só para o Pastor Presidente em exercício (catalogos.papeis.presidente) — o servidor confere de novo.
//  - Painel: as pendências (o prazo de 15 dias correndo, apurações, prestações atrasadas, o que espera a CLI ou a Assembleia, gestor sem a formação exigida);
//  - Entidades: a lista, o cadastro e a ficha (dirigentes, intervenção, prestação de contas, extinção), cada ação num formulário montado pela especificação dela
//    (entEspec): o título diz a quem o ato se refere, as reuniões oferecidas são só as que valem para aquele ato e todo ato que não se desfaz pede confirmação;
//  - Tipos: o catálogo (natureza e formações aceitas para o gestor).
// Todo texto que vem do servidor passa por escaparHtmlEbd; toda resposta confere, depois de cada await, se o login ainda é o mesmo (authToken).

let entCatalogos = null;
let entTipos = [];
let entReunioes = { CLI: [], AG: [] };
let entFicha = null;            // a entidade aberta (a resposta de /entidade)
let entForm = null;             // o formulário de ação aberto: { chave, fixos }
let entTipoEditando = null;
let entOcupado = false;
let entConfirmando = false;   // a pergunta de confirmação está aberta: o segundo clique em Salvar não abre outra
let entPedidoFicha = 0;
let entPedidoPainel = 0;
let entPedidoLista = 0;
let entPedidoOpcoes = 0;
let entSecaoAtual = "painel";
const entEl = (idEl) => document.getElementById(idEl);
const entBr = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const entH = (v) => escaparHtmlEbd(v == null ? "" : String(v));
const ENT_SEM_CONEXAO = "<p class='subtitle'>Sem conexão com o servidor. Tente de novo.</p>";
const ENT_SECOES = ["painel", "entidades", "tipos"];

// O dono da resposta: a matrícula e o tipo de sessão — não o bilhete, que a confirmação reforçada (428) troca no meio do ato (a resposta do próprio ato era
// descartada e a tela ficava muda depois de gravar; revisão de 04/11/2026). A troca de login ou a saída mudam o dono.
const entDono = () => (authToken ? `${authMatricula}|${typeof sessaoDeLiderancaNaTela === "function" && sessaoDeLiderancaNaTela() ? "senha" : "pin"}` : null);
async function entBuscar(caminho) {
  const dono = entDono();
  let res;
  try { res = await fetchProtegido(`${API_BASE}/entidades-vinculadas/${caminho}`); } catch (e) { return entDono() === dono ? { semConexao: true } : null; }
  const data = await res.json().catch(() => ({ sucesso: false, mensagem: "Resposta inválida do servidor." }));
  return entDono() === dono ? data : null;
}
// Grava. A mensagem (de sucesso ou de recusa) vai para `alvoMsg` só se o login ainda é o mesmo; quem chama confere se a tela ainda é a mesma.
async function entPost(acao, corpo, alvoMsg) {
  if (entOcupado) { entMensagem(alvoMsg, "Aguarde: a gravação anterior ainda está em andamento."); return null; }
  entOcupado = true;
  const dono = entDono();
  try {
    let res;
    try { res = await fetchProtegido(`${API_BASE}/entidades-vinculadas/${acao}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }); } catch (e) {
      if (entDono() === dono) entMensagem(alvoMsg, "Sem conexão com o servidor. Tente de novo.");
      return null;
    }
    const data = await res.json().catch(() => ({ sucesso: false, mensagem: "Resposta inválida do servidor." }));
    if (entDono() !== dono) return null;
    return data;
  } finally {
    entOcupado = false;
  }
}
function entMensagem(idEl, texto) { const el = entEl(idEl); if (el) el.textContent = texto || ""; }

// Troca de login ou saída: nada da sessão anterior fica na página (nem o que foi digitado nos formulários).
function entLimparTela() {
  entCatalogos = null; entTipos = []; entReunioes = { CLI: [], AG: [] }; entFicha = null; entForm = null; entTipoEditando = null;
  entPedidoFicha++; entPedidoPainel++; entPedidoLista++; entPedidoOpcoes++; entConfirmando = false;
  for (const idEl of ["entPainel", "entLista", "entFicha", "entListaTipos", "entMsgPainel", "entMsgLista", "entMsgFicha", "entMsgTipos", "entMsgNova", "entNovaTipo", "entNovaUf", "entNovaAutorizacao"]) { const el = entEl(idEl); if (el) el.innerHTML = ""; }
  for (const idEl of ["entNovaRazao", "entNovaFantasia", "entNovaCnpj", "entNovaFinalidade", "entNovaMunicipio", "entTipoNome", "entTipoFormacoes"]) { const el = entEl(idEl); if (el) el.value = ""; }
  const ativo = entEl("entTipoAtivo"); if (ativo) ativo.checked = true;
  const fichaBloco = entEl("entBlocoFicha"); if (fichaBloco) fichaBloco.style.display = "none";
}

// ================================================================ abrir a aba ================================================================
async function carregarOpcoesEntidadesAcao() {
  const meu = ++entPedidoOpcoes;
  const [cat, tipos, cli, ag] = await Promise.all([entBuscar("catalogos"), entBuscar("tipos?todos=1"), entBuscar("reunioes?orgao=CLI"), entBuscar("reunioes?orgao=AG")]);
  if (cat === null || meu !== entPedidoOpcoes) return;
  if (!cat.sucesso) { entEl("entPainel").innerHTML = cat.semConexao ? ENT_SEM_CONEXAO : `<p class='subtitle'>${entH(cat.mensagem)}</p>`; return; }
  entCatalogos = cat;
  entTipos = tipos && tipos.sucesso && Array.isArray(tipos.tipos) ? tipos.tipos : [];
  entReunioes = { CLI: cli && Array.isArray(cli.reunioes) ? cli.reunioes : [], AG: ag && Array.isArray(ag.reunioes) ? ag.reunioes : [] };
  entPreencherTiposNoCadastro();
  entPreencherUfs();
  entMostrarSecaoAcao(entSecaoAtual);
  if (entFicha) entRenderFicha();   // a ficha aberta antes do catálogo chegar: agora com os botões do Presidente e as listas dos formulários
}
function entMarcarSecao(secao) {
  entSecaoAtual = ENT_SECOES.includes(secao) ? secao : "painel";
  for (const s of ENT_SECOES) {
    const div = entEl(`entSecao${capitalize(s)}`); if (div) div.style.display = s === entSecaoAtual ? "block" : "none";
    const b = entEl(`btnEntSecao${capitalize(s)}`); if (b) b.classList.toggle("ativo", s === entSecaoAtual);
  }
}
function entMostrarSecaoAcao(secao) {
  entMarcarSecao(secao);
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
      `${entH(x.entidade)} — ${x.objeto === "EXTINCAO" ? "a extinção" : (x.objeto === "DESTITUICAO" ? "a destituição da diretoria pela intervenção" : "a criação do vínculo")}, deliberada pela CLI em ${entH(entBr(x.desde))}${x.assembleiaJaHouve ? " — <strong>uma Assembleia já aconteceu depois: registre o que ela decidiu (Art. 19: a primeira reunião seguinte)</strong>" : ""}`)).join(""), "Nada esperando a Assembleia."),
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
function entOpcoesUf(atual) {
  const ufs = entCatalogos && Array.isArray(entCatalogos.ufs) ? entCatalogos.ufs : [];
  return `<option value="">— nenhuma —</option>${ufs.map((u) => `<option value="${entH(u)}"${String(u) === String(atual || "") ? " selected" : ""}>${entH(u)}</option>`).join("")}`;
}
function entPreencherUfs() {
  const sel = entEl("entNovaUf"); if (sel) sel.innerHTML = entOpcoesUf("");
  const aut = entEl("entNovaAutorizacao");
  if (aut) aut.innerHTML = `<option value="">— não se aplica —</option>${entReunioes.AG.map((s) => `<option value="${entH(s.sessaoId)}">${entH(entBr(s.data))} — ${entH(s.descricao || "Assembleia")}</option>`).join("")}`;
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
  alvo.innerHTML = `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Entidade</th><th>Tipo</th><th>Situação</th><th>Alertas</th><th></th></tr></thead><tbody>${lista.map((e) => {
    const alertas = [
      e.intervencao ? `⚖️ ${entH(e.intervencao.statusRotulo)}` : "",
      Array.isArray(e.atrasadas) && e.atrasadas.length ? `🚩 ${e.atrasadas.length} prestação(ões) atrasada(s)` : "",
      Number(e.indicadosAguardando) ? `🏛️ ${entH(e.indicadosAguardando)} indicação(ões) para a CLI` : "",
      e.pendenciaGestor ? "🎓 sem gestor habilitado" : "",
      e.aguardandoAG ? "🗳️ esperando a Assembleia" : ""
    ].filter(Boolean).join("<br>");
    return `<tr><td><strong>${entH(e.nomeFantasia || e.razaoSocial)}</strong><br><small>${entH(e.cnpjFormatado)}</small></td><td>${entH(e.tipoNome)}</td><td>${entH(e.statusRotulo)}</td>
      <td>${alertas || "—"}</td><td><button type="button" class="btn-link" data-on-click="entAbrirFichaAcao" data-args-click="${argsAttr(Number(e.entidadeId))}">Abrir</button></td></tr>`;
  }).join("")}</tbody></table></div>`;
}
async function entSalvarNovaAcao() {
  const corpo = {
    razaoSocial: entEl("entNovaRazao").value, nomeFantasia: entEl("entNovaFantasia").value, cnpj: entEl("entNovaCnpj").value, tipoId: entEl("entNovaTipo").value,
    finalidade: entEl("entNovaFinalidade").value, municipio: entEl("entNovaMunicipio").value, uf: entEl("entNovaUf").value,
    autorizacaoAGSessaoId: entEl("entNovaAutorizacao") ? entEl("entNovaAutorizacao").value : ""
  };
  const r = await entPost("entidade", corpo, "entMsgNova");
  if (!r) return;
  entMensagem("entMsgNova", r.mensagem || (r.sucesso ? "Cadastrada." : "Não foi possível."));
  if (!r.sucesso) return;
  for (const idEl of ["entNovaRazao", "entNovaFantasia", "entNovaCnpj", "entNovaFinalidade", "entNovaMunicipio"]) entEl(idEl).value = "";
  entEl("entNovaTipo").value = "";
  entEl("entNovaUf").value = "";
  if (entEl("entNovaAutorizacao")) entEl("entNovaAutorizacao").value = "";
  const det = entEl("entNovaDetalhes"); if (det) det.open = false;
  await entCarregarListaAcao();
  if (r.entidadeId) await entAbrirFichaAcao(r.entidadeId);
}

// ================================================================ a ficha ================================================================
async function entAbrirFichaAcao(entidadeId) {
  const id = Number(entidadeId);
  if (!Number.isInteger(id) || id <= 0) return;
  if (entSecaoAtual !== "entidades") { entMarcarSecao("entidades"); entCarregarListaAcao(); }
  const meu = ++entPedidoFicha;
  entForm = null;
  entMensagem("entMsgFicha", "");
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
const entTabela = (cabecalho, linhas) => `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr>${cabecalho.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${linhas}</tbody></table></div>`;
const entEmCurso = (e) => (e && Array.isArray(e.intervencoes) ? e.intervencoes.find((i) => ["APURACAO", "DECRETADA", "RATIFICADA"].includes(i.status)) : null) || null;

function entRenderFicha() {
  const e = entFicha;
  if (!e) return;
  const presidente = !!(entCatalogos && entCatalogos.papeis && entCatalogos.papeis.presidente);
  const ativaOuProposta = e.status === "ATIVA" || e.status === "PROPOSTA";
  const emCurso = entEmCurso(e);
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
    const did = { dirigenteId: Number(d.dirigenteId) };
    const botoes = [
      d.status === "INDICADO" && e.status === "ATIVA" ? entBotao("Homologação da CLI", "homologar", did) + entBotao("Recusa da CLI", "recusar", did) : "",
      abertos ? entBotao("Encerrar", "encerrarDirigente", did) : ""
    ].join("");
    const datas = [d.indicadoEm ? `indicado em ${entH(entBr(d.indicadoEm))} (${entH(d.indicacaoAto)})` : "", d.homologadoEm ? `homologado em ${entH(entBr(d.homologadoEm))}` : "",
      d.mandatoAte ? `mandato até ${entH(entBr(d.mandatoAte))}` : "", d.encerradoEm ? `encerrado em ${entH(entBr(d.encerradoEm))} — ${entH(d.motivoEncerramentoRotulo || "")}` : ""].filter(Boolean).join("; ");
    return `<tr><td>${entH(d.funcaoRotulo)}</td><td>${entH(d.nome)}${d.externo ? " <small>(de fora)</small>" : ` <small>(mat. ${entH(d.membroId)})</small>`}${d.remunerado ? " · remunerado" : ""}</td>
      <td>${entH(d.formacao || "—")}${d.registroProfissional ? `<br><small>${entH(d.registroProfissional)}</small>` : ""}</td>
      <td>${entH(d.situacaoRotulo)}${d.afastadoPelaIntervencao ? "<br><strong>afastado pela intervenção</strong>" : ""}<br><small>${datas}</small></td><td>${botoes}</td></tr>`;
  }).join("");
  const dirigentes = `<h4>👥 Direção (Estatuto, Art. 65 §1º: indicação do Pastor Presidente, homologação da CLI)</h4><p class="subtitle">${exig}${e.status === "PROPOSTA" ? " A homologação vem depois da aprovação do vínculo pela CLI." : ""}</p>
    ${dirs.length ? entTabela(["Função", "Quem", "Formação", "Situação", ""], linhasDir) : "<p class='subtitle'>Ninguém indicado ainda.</p>"}
    ${ativaOuProposta ? `<div class="barra-lista">${entBotao("➕ Registrar indicação", "indicar", fixo)}</div>` : ""}`;

  // intervenções
  const ivs = Array.isArray(e.intervencoes) ? e.intervencoes : [];
  const cartoes = ivs.map((i) => {
    const iid = { intervencaoId: Number(i.intervencaoId) };
    // a decisão da CLI: não para quem decretou (o servidor recusa); na caducada, só se não há outro processo em curso (a reunião a tempo corrige a marca)
    const decisao = (i.status === "DECRETADA" || (i.status === "CADUCADA" && !emCurso)) && !i.decretadaPorMim;
    const botoes = [
      i.status === "APURACAO" ? entBotao("✉️ Notificação do gestor", "notificar", iid) + (i.notificadoEm ? entBotao("🗣️ Manifestação do gestor", "manifestacao", iid) : "") + entBotao("🗄️ Arquivar", "arquivar", iid) : "",
      i.status === "APURACAO" && presidente ? entBotao("⚖️ Decretar intervenção", "decretar", iid) : "",
      decisao ? entBotao("🏛️ Decisão da CLI", "ratificar", iid) : "",
      (i.status === "DECRETADA" || i.status === "RATIFICADA") && presidente ? entBotao("🔓 Encerrar intervenção", "encerrarIntervencao", iid) : "",
      (i.status === "RATIFICADA" || i.status === "ENCERRADA") && i.afastaDiretoria && i.ratificacaoEm && !i.defesaCEIEm ? entBotao("🛡️ Defesa no Conselho de Ética", "defesa", iid) : "",
      i.destituicaoAguardandoAG ? entBotao("🗳️ Assembleia: a destituição", "assembleiaDestituicao", iid) : "",
      (i.status === "CADUCADA" || i.status === "NAO_RATIFICADA") && e.status === "ATIVA" && !emCurso ? entBotao("🔁 Nova apuração com os mesmos fatos", "reabrir", iid) : "",
      entBotaoAnexos("EntidadeIntervencoes", i.intervencaoId, `Intervenção — ${e.razaoSocial}`)
    ].join("");
    const prazo = i.status === "DECRETADA" ? `<p class="ent-prazo"><strong>Prazo fatal da CLI: ${entH(entBr(i.prazoRatificacao))}</strong> — ${Number(i.diasRestantes) <= 0 ? "vence HOJE" : `faltam ${entH(i.diasRestantes)} dia(s)`}. Sem a ratificação dentro dele, a intervenção perde a eficácia (Regimento, Art. 47-A §2º).${i.decretadaPorMim ? " Quem decretou não registra a decisão da CLI: peça à Secretaria." : ""}</p>` : "";
    return `<div class="cartao-perfil ent-cartao">
      <p><strong>${entH(i.statusRotulo)}</strong> · ${entH(i.motivoRotulo)} · aberta em ${entH(entBr(i.abertaEm))}</p>
      <p class="subtitle">${entH(i.fatos)}</p>
      ${i.notificadoEm ? `<p>Gestor notificado em ${entH(entBr(i.notificadoEm))} (${entH(i.notificacaoForma)}); pode se manifestar até ${entH(entBr(i.manifestacaoAte))}; sem urgência, a decretação só a partir de ${entH(entBr(i.decretavelDesde))}.${i.manifestacaoEm ? ` Manifestou-se em ${entH(entBr(i.manifestacaoEm))}: ${entH(i.manifestacaoResumo)}` : ""}</p>` : ""}
      ${i.decretadaEm ? `<p>Decretada em ${entH(entBr(i.decretadaEm))}${i.urgencia ? " <strong>com urgência</strong>" : ""}. Interventor: ${entH(i.interventor)}.${i.afastaDiretoria ? " A diretoria fica afastada." : ""}</p><p class="subtitle">${entH(i.fundamentacao)}</p>` : ""}
      ${prazo}
      ${i.ratificacaoEm ? `<p>Decisão da CLI na reunião de ${entH(entBr(i.ratificacaoEm))}.${i.correcaoAta ? ` Registrada depois do prazo (ata: ${entH(i.correcaoAta)}).` : ""}${i.ratificacaoObs ? ` ${entH(i.ratificacaoObs)}` : ""}</p>` : ""}
      ${i.destituidos ? `<p>${entH(i.destituidos)} mandato(s) encerrado(s) por destituição.${i.destituicaoAG ? ` Assembleia de ${entH(entBr(i.destituicaoAG.em))}: ${entH(i.destituicaoAG.resultadoRotulo)}.` : (i.destituicaoAguardandoAG ? " <strong>Esperando a Assembleia Geral.</strong>" : "")}</p>` : ""}
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
    const fp = { entidadeId: Number(e.entidadeId), periodo: String(p.codigo) };
    const botoes = [
      ["NO_PRAZO", "ATRASADA"].includes(p.situacao) ? entBotao("📤 Registrar entrega", "prestacaoRegistrar", fp) : "",
      p.situacao === "ENTREGUE" ? entBotao("Corrigir entrega", "prestacaoRegistrar", fp) + entBotao("🏛️ Apreciação da CLI", "apreciar", { prestacaoId: Number(pr.prestacaoId) }) : "",
      p.cfPendente ? entBotao("🧾 Conselho Fiscal", "cf", { prestacaoId: Number(pr.prestacaoId) }) : "",
      pr ? entBotaoAnexos("EntidadePrestacoes", pr.prestacaoId, `Prestação ${p.codigo} — ${e.razaoSocial}`) : ""
    ].join("");
    const detalhe = pr ? `entregue em ${entH(entBr(pr.entregueEm))} (auditoria: ${entH(pr.auditoriaOrgao)})${pr.resultadoRotulo ? `; CLI em ${entH(entBr(pr.apreciadaEm))}: <strong>${entH(pr.resultadoRotulo)}</strong>${pr.apreciacaoObs ? ` — ${entH(pr.apreciacaoObs)}` : ""}` : ""}${pr.cfResultadoRotulo ? `; Conselho Fiscal em ${entH(entBr(pr.cfVerificadaEm))}: ${entH(pr.cfResultadoRotulo)}` : ""}` : "";
    return `<tr><td>${entH(p.codigo)}</td><td>${entH(entBr(p.inicio))} a ${entH(entBr(p.fim))}</td><td>${entH(entBr(p.prazo))}</td>
      <td>${p.situacao === "ATRASADA" ? "<strong>🚩 Atrasada</strong>" : entH(({ EM_CURSO: "Em curso", NO_PRAZO: "Prazo correndo", ENTREGUE: "Entregue (esperando a CLI)", APRECIADA: "Apreciada" })[p.situacao] || p.situacao)}${detalhe ? `<br><small>${detalhe}</small>` : ""}</td><td>${botoes}</td></tr>`;
  }).join("");
  const prestacao = `<h4>📊 Prestação de contas à CLI (Estatuto, Art. 67)</h4>
    <p class="subtitle">${entH(e.periodicidadeRotulo)}; entrega até ${entH(e.prazoEntregaDias)} dias depois do fim de cada período, com o Relatório de Atividades e o Balanço auditado.</p>
    ${pers.length ? entTabela(["Período", "De/até", "Prazo", "Situação", ""], linhasPer) : "<p class='subtitle'>Sem períodos: o vínculo ainda não foi aprovado.</p>"}`;

  entEl("entFicha").innerHTML = `${dados}<div id="entFormAcao"></div>${dirigentes}${intervencao}${prestacao}`;
  if (entForm) entRenderForm();
}

// ================================================================ formulários de ação ================================================================
const entLista = (chave) => (entCatalogos && Array.isArray(entCatalogos[chave]) ? entCatalogos[chave] : []);
// De quem é o ato: o título do formulário diz o nome do dirigente, a data da intervenção ou o código do período (o formulário fica no alto da ficha).
function entSujeito(fixos) {
  const e = entFicha || {};
  if (fixos.dirigenteId) { const d = (e.dirigentes || []).find((x) => Number(x.dirigenteId) === Number(fixos.dirigenteId)); return d || null; }
  if (fixos.intervencaoId) { const i = (e.intervencoes || []).find((x) => Number(x.intervencaoId) === Number(fixos.intervencaoId)); return i || null; }
  if (fixos.prestacaoId) { const p = (e.periodos || []).find((x) => x.prestacao && Number(x.prestacao.prestacaoId) === Number(fixos.prestacaoId)); return p || null; }
  if (fixos.periodo) { const p = (e.periodos || []).find((x) => x.codigo === fixos.periodo); return p || null; }
  return null;
}
// As especificações. Cada campo: id, rotulo, tipo (texto, area, data, numero, select, check, uf, reuniaoCLI, reuniaoAG, fixo), valor, max, desde/ate (reuniões).
// `confirmar(corpo)`: o texto da confirmação do ato que não se desfaz (null = não pergunta).
function entEspec(chave, fixos = {}) {
  const e = entFicha || {};
  const s = entSujeito(fixos);
  const quem = s && s.nome ? `${s.funcaoRotulo || ""}: ${s.nome}` : "";
  const per = s && s.codigo ? `período ${s.codigo}` : "";
  const ivTxt = s && s.abertaEm ? `processo aberto em ${entBr(s.abertaEm)} (${s.motivoRotulo || ""})` : "";
  const reuCLI = (desde, ate) => ({ id: "sessaoId", rotulo: "Reunião da CLI (já realizada e encerrada)", tipo: "reuniaoCLI", desde, ate });
  const reuAG = (desde) => ({ id: "sessaoId", rotulo: "Assembleia Geral (já realizada e encerrada)", tipo: "reuniaoAG", desde });
  switch (chave) {
    case "editar": return { titulo: "Editar os dados da entidade", acao: "entidade-editar", campos: [
      { id: "razaoSocial", rotulo: "Razão social (3 a 150)", valor: e.razaoSocial, max: 150 }, { id: "nomeFantasia", rotulo: "Nome fantasia (opcional)", valor: e.nomeFantasia, max: 100 },
      ...(e.status === "PROPOSTA" ? [{ id: "cnpj", rotulo: "CNPJ da matriz (0001)", valor: e.cnpjFormatado, max: 18 }, { id: "tipoId", rotulo: "Tipo", tipo: "select", opcoes: entTipos.filter((t) => t.ativo || t.tipoId === e.tipoId).map((t) => ({ codigo: t.tipoId, rotulo: t.nome })), valor: e.tipoId }] : [{ id: "tipoId", tipo: "fixo", valor: e.tipoId }]),
      { id: "finalidade", rotulo: "Finalidade (10 a 500)", tipo: "area", valor: e.finalidade, max: 500 }, { id: "municipio", rotulo: "Município (opcional)", valor: e.municipio, max: 80 }, { id: "uf", rotulo: "UF (opcional)", tipo: "uf", valor: e.uf }] };
    case "vinculoAprovar": return { titulo: "Aprovação do vínculo pela CLI (Estatuto, Art. 64, parágrafo único)", acao: "vinculo-aprovar", campos: [reuCLI()],
      aviso: "A data da reunião vira o início do vínculo e dos períodos da prestação de contas.",
      confirmar: () => "Registrar a aprovação do vínculo nesta reunião? A data dela vira o início do vínculo e dos períodos da prestação de contas, e não se corrige depois." };
    case "vinculoNaoAprovar": return { titulo: "A CLI não aprovou o vínculo", acao: "vinculo-nao-aprovar", campos: [reuCLI(), { id: "motivo", rotulo: "Motivo (10 a 500)", tipo: "area", max: 500 }],
      confirmar: () => "Registrar que a CLI não aprovou? As indicações que esperavam a CLI se encerram e isto não se desfaz (uma nova proposta com o mesmo CNPJ continua possível)." };
    case "assembleia": return { titulo: e.aguardandoAG === "EXTINCAO" ? "A Assembleia Geral sobre a extinção" : "A Assembleia Geral sobre a criação do vínculo", acao: "assembleia",
      campos: [reuAG(e.aguardandoAG === "EXTINCAO" ? (e.extincao && e.extincao.em) : (e.vinculo && e.vinculo.em)),
        { id: "resultado", rotulo: "Resultado", tipo: "select", opcoes: entLista("resultadosAG") }, { id: "observacao", rotulo: "Observação (obrigatória se não ratificou, 10 a 500)", tipo: "area", max: 500 }],
      aviso: e.aguardandoAG === "EXTINCAO" ? "Se a Assembleia não ratificar, a entidade volta a ativa e os mandatos encerrados pela extinção precisam de nova indicação." : "Se a Assembleia não ratificar, o vínculo é desfeito e os mandatos se encerram.",
      confirmar: (c) => (c.resultado === "NAO_RATIFICADA" ? (e.aguardandoAG === "EXTINCAO" ? "Registrar que a Assembleia NÃO ratificou a extinção? A entidade volta a ativa. Isto não se desfaz." : "Registrar que a Assembleia NÃO ratificou? O vínculo é desfeito e todos os mandatos se encerram. Isto não se desfaz.") : "Registrar a ratificação da Assembleia? Isto não se desfaz.") };
    case "prestacaoConfig": return { titulo: "Periodicidade da prestação de contas", acao: "prestacao-config", campos: [
      { id: "periodicidade", rotulo: "Periodicidade", tipo: "select", opcoes: entLista("periodicidades"), valor: e.periodicidade },
      { id: "prazoEntregaDias", rotulo: "Prazo de entrega (1 a 365 dias depois do fim do período)", tipo: "numero", valor: e.prazoEntregaDias, max: 3 }], aviso: "A periodicidade fica fixa depois da primeira prestação registrada." };
    case "indicar": return { titulo: "Registrar a indicação do Pastor Presidente (Estatuto, Art. 65 §1º)", acao: "dirigente-indicar", campos: [
      { id: "funcao", rotulo: "Função", tipo: "select", opcoes: entLista("funcoes") }, { id: "funcaoDescricao", rotulo: "Nome da função (só em \"Outra função\", 3 a 80)", max: 80 },
      { id: "membroId", rotulo: "Matrícula do membro (ou deixe vazio e informe o profissional de fora)", tipo: "numero", max: 10 }, { id: "nomeExterno", rotulo: "Nome do profissional de fora (Regimento, Art. 153; 5 a 120)", max: 120 },
      { id: "formacao", rotulo: `Formação${Array.isArray(e.formacoesExigidas) && e.formacoesExigidas.length ? ` (gestor técnico: ${e.formacoesExigidas.join(" ou ")})` : ""}`, max: 80 },
      { id: "registroProfissional", rotulo: "Registro profissional (opcional)", max: 40 }, { id: "remunerado", rotulo: "Cargo remunerado", tipo: "check" },
      { id: "declaracaoParentesco", rotulo: "Profissional de fora remunerado: declarou por escrito que não é parente até o 2º grau de membro da Diretoria Executiva (Art. 76 §2º)", tipo: "check" },
      { id: "indicacaoAto", rotulo: "Ato de indicação do Pastor Presidente (número/referência)", max: 200 }, { id: "indicadoEm", rotulo: "Data da indicação", tipo: "data" },
      { id: "mandatoAte", rotulo: "Fim do mandato (opcional)", tipo: "data" }] };
    case "homologar": return { titulo: `Homologação da CLI — ${quem}`, acao: "dirigente-homologar", campos: [reuCLI(s && s.indicadoEm)] };
    case "recusar": return { titulo: `Recusa da CLI — ${quem}`, acao: "dirigente-recusar", campos: [reuCLI(s && s.indicadoEm), { id: "observacao", rotulo: "Observação (opcional)", tipo: "area", max: 500 }],
      confirmar: () => `Registrar que a CLI recusou a indicação de ${s ? s.nome : "esta pessoa"}? Isto não se desfaz.` };
    case "encerrarDirigente": return { titulo: `Encerrar o mandato — ${quem}`, acao: "dirigente-encerrar", campos: [{ id: "motivo", rotulo: "Motivo", tipo: "select", opcoes: entLista("motivosEncerramento") },
      { id: "data", rotulo: "Data", tipo: "data" }, { id: "observacao", rotulo: "Observação (obrigatória em \"Outro\")", tipo: "area", max: 500 }],
      confirmar: () => `Encerrar o mandato de ${s ? s.nome : "esta pessoa"}? Isto não se desfaz (uma volta exige nova indicação e homologação).` };
    case "apuracaoAbrir": return { titulo: "Abrir apuração (Regimento, Art. 47-A §1º)", acao: "apuracao-abrir", campos: [{ id: "motivo", rotulo: "Motivo", tipo: "select", opcoes: entLista("motivosIntervencao") },
      { id: "fatos", rotulo: "Os fatos (20 a 2.000)", tipo: "area", max: 2000 }] };
    case "notificar": return { titulo: `Notificação escrita do gestor — ${ivTxt}`, acao: "apuracao-notificar", campos: [{ id: "notificadoEm", rotulo: "Data da notificação", tipo: "data" },
      { id: "forma", rotulo: "Como foi notificado (carta, e-mail com confirmação...; 5 a 200)", max: 200 }], aviso: "Uma nova notificação recomeça os 5 dias." };
    case "manifestacao": return { titulo: `Manifestação do gestor — ${ivTxt}`, acao: "apuracao-manifestacao", campos: [{ id: "manifestacaoEm", rotulo: "Data", tipo: "data" }, { id: "resumo", rotulo: "Resumo (10 a 1.000)", tipo: "area", max: 1000 }] };
    case "arquivar": return { titulo: `Arquivar a apuração — ${ivTxt}`, acao: "apuracao-arquivar", campos: [{ id: "motivo", rotulo: "Motivo do arquivamento (10 a 1.000)", tipo: "area", max: 1000 }],
      confirmar: () => "Arquivar esta apuração? Isto não se desfaz (uma nova apuração começa do zero)." };
    case "reabrir": return { titulo: `Nova apuração com os mesmos fatos — ${ivTxt}`, acao: "apuracao-reabrir", campos: [], aviso: "A notificação já feita continua valendo. A nova decretação conta outros 15 dias." };
    case "decretar": return { titulo: `Decretar a intervenção (só o Pastor Presidente) — ${ivTxt}`, acao: "intervencao-decretar", campos: [
      { id: "fundamentacao", rotulo: "Fundamentação: os motivos técnicos, disciplinares ou de gestão (30 a 2.000)", tipo: "area", max: 2000 },
      { id: "interventorMembroId", rotulo: "Matrícula do interventor (ou o nome, abaixo)", tipo: "numero", max: 10 }, { id: "interventorNome", rotulo: "Nome do interventor de fora (5 a 120)", max: 120 },
      { id: "afastaDiretoria", rotulo: "Afasta a diretoria", tipo: "check" }, { id: "urgencia", rotulo: "Urgência: risco iminente ao patrimônio ou à continuidade dos serviços (dispensa os 5 dias)", tipo: "check" },
      { id: "urgenciaJustificativa", rotulo: "Justificativa da urgência (20 a 1.000)", tipo: "area", max: 1000 }], aviso: "A data é a de hoje. A CLI tem 15 dias para ratificar; sem isso, a intervenção perde a eficácia.",
      confirmar: (c) => `Decretar a intervenção agora?${c.afastaDiretoria ? " A diretoria fica afastada." : ""} A CLI terá 15 dias para ratificar.` };
    case "ratificar": return { titulo: `Decisão da CLI sobre a intervenção — ${ivTxt}`, acao: "intervencao-ratificar",
      campos: [reuCLI(s && s.decretadaEm, s && s.prazoRatificacao),
        { id: "resultado", rotulo: "A CLI…", tipo: "select", opcoes: [{ codigo: "RATIFICADA", rotulo: "ratificou" }, { codigo: "NAO_RATIFICADA", rotulo: "não ratificou" }] },
        ...(s && s.status === "CADUCADA" ? [{ id: "ataReferencia", rotulo: "Referência da ata da reunião (obrigatória: o registro chega depois do prazo; a correção só cabe até 10 dias depois dele)", max: 200 }] : []),
        { id: "observacao", rotulo: "Observação (opcional)", tipo: "area", max: 500 }],
      aviso: `Vale só a reunião feita entre a decretação${s && s.decretadaEm ? ` (${entBr(s.decretadaEm)})` : ""} e o fim do prazo${s && s.prazoRatificacao ? ` (${entBr(s.prazoRatificacao)})` : ""}.`,
      confirmar: (c) => (c.resultado === "RATIFICADA" && s && s.afastaDiretoria ? "Registrar a ratificação? Os mandatos de quem estava na direção na decretação se ENCERRAM por destituição. Isto não se desfaz." : "Registrar a decisão da CLI? Isto não se desfaz.") };
    case "assembleiaDestituicao": return { titulo: `A Assembleia Geral sobre a destituição — ${ivTxt}`, acao: "intervencao-assembleia",
      campos: [reuAG(s && s.ratificacaoEm), { id: "resultado", rotulo: "Resultado", tipo: "select", opcoes: entLista("resultadosAG") }, { id: "observacao", rotulo: "Observação (obrigatória se não ratificou, 10 a 500)", tipo: "area", max: 500 }],
      aviso: "A destituição que a CLI produziu ao ratificar a intervenção vai à primeira Assembleia seguinte (Estatuto, Art. 18, VII, \"c\", e Art. 19). Não ratificada, quem foi destituído pode ser indicado de novo.",
      confirmar: () => "Registrar a decisão da Assembleia sobre a destituição? Isto não se desfaz." };
    case "defesa": return { titulo: `Defesa dos destituídos no Conselho de Ética — ${ivTxt}`, acao: "intervencao-defesa", campos: [{ id: "defesaEm", rotulo: "Data", tipo: "data" }, { id: "referencia", rotulo: "Protocolo no Conselho de Ética (3 a 200)", max: 200 }] };
    case "encerrarIntervencao": return { titulo: `Encerrar a intervenção (só o Pastor Presidente) — ${ivTxt}`, acao: "intervencao-encerrar", campos: [{ id: "motivo", rotulo: "Motivo: a gestão devolvida a quem (10 a 1.000)", tipo: "area", max: 1000 }],
      confirmar: () => "Encerrar a intervenção? A gestão volta e isto não se desfaz." };
    case "prestacaoRegistrar": {
      const pr = s && s.prestacao;
      return { titulo: `${pr ? "Corrigir a entrega" : "Entrega da prestação de contas"} — ${per}`, acao: "prestacao-registrar", campos: [{ id: "entregueEm", rotulo: "Data da entrega", tipo: "data", valor: pr ? pr.entregueEm : "" },
        { id: "relatorioAtividades", rotulo: "Relatório Anual de Atividades entregue", tipo: "check", valor: !!pr }, { id: "balancoAuditado", rotulo: "Balanço Financeiro auditado entregue", tipo: "check", valor: !!pr },
        { id: "auditoriaOrgao", rotulo: "Quem auditou (o órgão de fiscalização da própria entidade, Art. 61, II; 3 a 150)", valor: pr ? pr.auditoriaOrgao : "", max: 150 },
        { id: "observacao", rotulo: "Observação (opcional)", tipo: "area", valor: pr ? pr.observacao : "", max: 1000 }] };
    }
    case "apreciar": return { titulo: `Apreciação da CLI — ${per}`, acao: "prestacao-apreciar", campos: [reuCLI(s && s.prestacao && s.prestacao.entregueEm), { id: "resultado", rotulo: "Resultado", tipo: "select", opcoes: entLista("resultadosApreciacao") },
      { id: "observacao", rotulo: "Ressalvas ou motivo (obrigatório se não for \"Aprovada\")", tipo: "area", max: 1000 }],
      confirmar: () => "Registrar a apreciação da CLI? Depois dela a prestação não muda mais." };
    case "cf": return { titulo: `Verificação anual do Conselho Fiscal (Estatuto, Art. 66 §3º) — ${per}`, acao: "prestacao-cf", campos: [{ id: "verificadaEm", rotulo: "Data", tipo: "data" },
      { id: "resultado", rotulo: "Resultado", tipo: "select", opcoes: entLista("resultadosCF") }, { id: "observacao", rotulo: "Observação (obrigatória se houve irregularidade)", tipo: "area", max: 1000 }] };
    case "extinguir": return { titulo: "Extinção da entidade (Estatuto, Art. 68)", acao: "extinguir", campos: [reuCLI(e.vinculo && e.vinculo.em),
      ...(e.extincaoVetadaEm ? [{ id: "autorizacaoAGSessaoId", rotulo: `A Assembleia que autorizou renovar a extinção (a de ${entBr(e.extincaoVetadaEm)} não a ratificou — Art. 19 §1º)`, tipo: "reuniaoAG", desde: e.extincaoVetadaEm }] : []),
      { id: "destinoPatrimonio", rotulo: "Destino do patrimônio", tipo: "select", opcoes: entLista("destinos").filter((d) => Array.isArray(d.naturezas) && d.naturezas.includes(e.natureza)) },
      ...(e.natureza === "SAUDE" ? [{ id: "matrizMantemAssistencia", rotulo: "A IEADESPA mantém atividade assistencial do mesmo tipo (só para devolver os bens de saúde à Matriz)", tipo: "check" }] : []),
      { id: "destinatarioNome", rotulo: e.natureza === "SAUDE" ? "Quem recebe o patrimônio (no destino \"a Matriz\": a atividade assistencial que recebe)" : "Quem recebe o patrimônio", max: 150 },
      { id: "destinatarioCnpj", rotulo: "CNPJ de quem recebe (opcional)", max: 18 },
      { id: "bensComodato", rotulo: "Bens da Matriz cedidos em comodato, que voltam à IEADESPA (opcional)", tipo: "area", max: 1000 }],
      aviso: "Os mandatos se encerram. A extinção ainda vai à Assembleia Geral para a ratificação.",
      confirmar: () => "Registrar a extinção? Todos os mandatos se encerram e a apuração aberta é arquivada. Isto não se desfaz (só a Assembleia, ao não ratificar, devolve a entidade a ativa)." };
    default: return null;
  }
}
function entAbrirFormAcao(chave, fixos) {
  const f = fixos && typeof fixos === "object" && !Array.isArray(fixos) ? fixos : {};
  if (!entFicha || !entEspec(String(chave), f)) return;
  entForm = { chave: String(chave), fixos: f };
  entRenderForm();
  const alvo = entEl("entFormAcao");
  if (alvo && typeof alvo.scrollIntoView === "function") alvo.scrollIntoView({ behavior: "smooth", block: "start" });
  const esp = entEspec(entForm.chave, entForm.fixos);
  const campo1 = esp.campos.find((c) => c.tipo !== "fixo");
  const primeiro = campo1 ? entEl(`entCampo_${campo1.id}`) : null;
  if (primeiro && typeof primeiro.focus === "function") primeiro.focus();
}
// Só as reuniões que valem para o ato (a partir de `desde`, até `ate`): escolher outra seria recusado pelo servidor.
function entOpcoesReuniao(lista, desde, ate) {
  const validas = lista.filter((s) => (!desde || s.data >= desde) && (!ate || s.data <= ate));
  if (!validas.length) return "<option value=\"\">Nenhuma reunião encerrada dentro das datas que valem para este ato — registre-a em Órgãos Centrais</option>";
  return `<option value="">— escolha —</option>${validas.map((s) => `<option value="${entH(s.sessaoId)}">${entH(entBr(s.data))} — ${entH(s.descricao || "reunião")}</option>`).join("")}`;
}
function entRenderForm() {
  const alvo = entEl("entFormAcao");
  if (!alvo || !entForm) return;
  const esp = entEspec(entForm.chave, entForm.fixos);
  if (!esp) { alvo.innerHTML = ""; return; }
  const campo = (c) => {
    const idEl = `entCampo_${c.id}`;
    const v = c.valor == null ? "" : String(c.valor);
    const max = Number(c.max) > 0 ? ` maxlength="${Number(c.max)}"` : "";
    if (c.tipo === "fixo") return "";
    if (c.tipo === "check") return `<div class="input-group"><label><input type="checkbox" id="${idEl}" /> ${entH(c.rotulo)}</label></div>`;
    let entrada;
    if (c.tipo === "area") entrada = `<textarea id="${idEl}" rows="3" style="width:100%;"${max}>${entH(v)}</textarea>`;
    else if (c.tipo === "select") entrada = `<select id="${idEl}"><option value="">— escolha —</option>${(c.opcoes || []).map((o) => `<option value="${entH(o.codigo)}"${String(o.codigo) === v ? " selected" : ""}>${entH(o.rotulo)}</option>`).join("")}</select>`;
    else if (c.tipo === "uf") entrada = `<select id="${idEl}">${entOpcoesUf(v)}</select>`;
    else if (c.tipo === "reuniaoCLI" || c.tipo === "reuniaoAG") entrada = `<select id="${idEl}">${entOpcoesReuniao(c.tipo === "reuniaoCLI" ? entReunioes.CLI : entReunioes.AG, c.desde, c.ate)}</select>`;
    else entrada = `<input type="${c.tipo === "data" ? "date" : "text"}" id="${idEl}" value="${entH(v)}"${c.tipo === "numero" ? " inputmode=\"numeric\"" : ""}${max} />`;
    return `<div class="input-group"><label for="${idEl}">${entH(c.rotulo)}</label>${entrada}</div>`;
  };
  alvo.innerHTML = `<div class="cartao-perfil ent-form">
    <h4>${entH(esp.titulo)}</h4>${esp.aviso ? `<p class="subtitle">${entH(esp.aviso)}</p>` : ""}
    ${esp.campos.map(campo).join("")}
    <p id="entMsgForm" class="subtitle" role="status" aria-live="polite"></p>
    <div class="barra-lista"><button type="button" class="btn-confirmar" style="width:auto;" data-on-click="entEnviarFormAcao">Salvar</button>
    <button type="button" class="btn-confirmar btn-secundario" style="width:auto;" data-on-click="entCancelarFormAcao">Cancelar</button></div></div>`;
  for (const c of esp.campos) if (c.tipo === "check" && c.valor) { const el = entEl(`entCampo_${c.id}`); if (el) el.checked = true; }
}
function entCancelarFormAcao() { entForm = null; const alvo = entEl("entFormAcao"); if (alvo) alvo.innerHTML = ""; }
async function entEnviarFormAcao() {
  if (!entForm || !entFicha) return;
  const esp = entEspec(entForm.chave, entForm.fixos);
  if (!esp) return;
  const corpo = { ...entForm.fixos };
  for (const c of esp.campos) {
    if (c.tipo === "fixo") { corpo[c.id] = c.valor; continue; }
    const el = entEl(`entCampo_${c.id}`);
    if (!el) continue;
    corpo[c.id] = c.tipo === "check" ? !!el.checked : String(el.value || "").trim();
  }
  // o ato que não se desfaz pede confirmação no aviso do sistema, com a consequência escrita
  const pergunta = typeof esp.confirmar === "function" ? esp.confirmar(corpo) : null;
  const ficha = entPedidoFicha;
  if (pergunta) {
    if (entConfirmando) return;
    entConfirmando = true;
    let sim;
    try { sim = await confirmarAcao(pergunta, "Confirmar"); } finally { entConfirmando = false; }
    if (!sim) return;
  }
  if (ficha !== entPedidoFicha || !entForm) return;   // trocou de ficha (ou saiu) enquanto a pergunta estava aberta
  const entidadeId = entFicha.entidadeId;
  const r = await entPost(esp.acao, corpo, "entMsgForm");
  // trocou de ficha ou de login durante a gravação: nada desta resposta vai para a tela de agora
  if (!r || ficha !== entPedidoFicha) return;
  const msg = r.mensagem || (r.sucesso ? "Feito." : "Não foi possível.");
  if (!r.sucesso) {
    entMensagem("entMsgForm", msg);
    const el = entEl("entMsgForm"); if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  entForm = null;
  await entAbrirFichaAcao(entidadeId);
  if (entFicha && Number(entFicha.entidadeId) === Number(entidadeId)) entMensagem("entMsgFicha", msg);
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
  if (sel && entCatalogos) {
    const atual = sel.value;   // o que a pessoa já escolheu na edição não se perde ao trocar de seção
    sel.innerHTML = `<option value="">— escolha —</option>${entLista("naturezas").map((n) => `<option value="${entH(n.codigo)}">${entH(n.rotulo)}</option>`).join("")}`;
    sel.value = atual;
  }
  const ativo = entEl("entTipoAtivoBloco"); if (ativo) ativo.style.display = entTipoEditando ? "" : "none";
  alvo.innerHTML = entTipos.length ? entTabela(["Tipo", "Natureza", "Formações aceitas para o gestor", "Entidades", ""], entTipos.map((t) => `
    <tr><td>${entH(t.nome)}${t.ativo ? "" : " <small>(desativado)</small>"}</td><td>${entH(t.naturezaRotulo)}</td><td>${t.formacoes.length ? entH(t.formacoes.join(", ")) : "<small>sem exigência legal</small>"}</td>
    <td>${entH(t.entidades)}</td><td><button type="button" class="btn-link" data-on-click="entEditarTipoAcao" data-args-click="${argsAttr(Number(t.tipoId))}">Editar</button></td></tr>`).join(""))
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
  const ativo = entEl("entTipoAtivoBloco"); if (ativo) ativo.style.display = "";
  entEl("entTipoTitulo").textContent = `Editar o tipo "${t.nome}"`;
  const det = entEl("entTipoDetalhes"); if (det) det.open = true;
}
function entNovoTipoAcao() {
  entTipoEditando = null;
  for (const idEl of ["entTipoNome", "entTipoFormacoes"]) entEl(idEl).value = "";
  entEl("entTipoNatureza").value = "";
  entEl("entTipoAtivo").checked = true;
  const ativo = entEl("entTipoAtivoBloco"); if (ativo) ativo.style.display = "none";
  entEl("entTipoTitulo").textContent = "Cadastrar um tipo novo";
}
async function entSalvarTipoAcao() {
  const corpo = { nome: entEl("entTipoNome").value, natureza: entEl("entTipoNatureza").value,
    formacoes: String(entEl("entTipoFormacoes").value || "").split("\n").map((x) => x.trim()).filter(Boolean) };
  if (entTipoEditando) { corpo.tipoId = entTipoEditando; corpo.ativo = !!entEl("entTipoAtivo").checked; }
  const r = await entPost(entTipoEditando ? "tipo-editar" : "tipo", corpo, "entMsgTipos");
  if (!r) return;
  const msg = r.mensagem || (r.sucesso ? "Salvo." : "Não foi possível.");
  if (!r.sucesso) { entMensagem("entMsgTipos", msg); return; }
  entNovoTipoAcao();
  const tipos = await entBuscar("tipos?todos=1");
  if (tipos === null) return;   // saiu ou trocou de login: nada vai para a tela
  if (tipos.sucesso && Array.isArray(tipos.tipos)) { entTipos = tipos.tipos; entPreencherTiposNoCadastro(); entMostrarTipos(); }
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
