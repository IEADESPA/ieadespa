// modulos/expansao.js — v9.2: Expansão (Estatuto Art. 5º §§3º e 5º; Regimento Art. 23, 24 §2º e 109-A). Toda regra mora no servidor (api/shared/expansao.js e
// expansaoDb.js, rota /api/expansao); aqui só se monta a tela. Entra quem tem a permissão "expansao" (o Dirigente vê só a congregação dele) ou compõe a CME.
//  - Painel: as pendências (parecer da CME vencido ou correndo, pedidos esperando a CLI, Extensões sem Encarregado em comunhão, congregação nova sem Dirigente,
//    a CME sem o Secretário de Missões);
//  - Pedidos: o novo pedido (abertura de Extensão, emancipação, nova congregação — esta só no nível geral), a lista e a ficha, com os atos que o servidor diz
//    que esta pessoa pode fazer (pedido.acoes): o parecer da CME, a decisão da CLI (só o nível geral) e a desistência;
//  - Extensões: as ativas (ou todas), o Encarregado, a troca dele e o histórico.
// Todo texto que vem do servidor passa por escaparHtmlEbd; toda resposta confere, depois de cada await, se o login ainda é o mesmo (authToken).

let expCatalogos = null;
let expReunioes = [];
let expFicha = null;           // o pedido aberto (a resposta de /pedido)
let expForm = null;            // o formulário de ato aberto: { chave, fixos }
let expOcupado = false;
let expConfirmando = false;
let expPedidoFicha = 0;
let expPedidoPainel = 0;
let expPedidoLista = 0;
let expPedidoExtensoes = 0;
let expPedidoOpcoes = 0;
let expSecaoAtual = "painel";
let expExtensoes = [];
let expPedidoHistorico = 0;     // o histórico tem o seu contador: a lista recarregada não o deixa preso em "Carregando…"
let expReunioesFalhou = false;  // a lista das reuniões não chegou: o formulário diz isso, e não "registre a reunião"
const expEl = (idEl) => document.getElementById(idEl);
const expBr = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const expH = (v) => escaparHtmlEbd(v == null ? "" : String(v));
const EXP_SEM_CONEXAO = "<p class='subtitle'>Sem conexão com o servidor. Tente de novo.</p>";
const EXP_SECOES = ["painel", "pedidos", "extensoes"];

async function expBuscar(caminho) {
  const token = authToken;
  if (!token) return null;   // sem login (saiu no meio de uma sequência de leituras): nada vai para a tela
  let res;
  try { res = await fetchProtegido(`${API_BASE}/expansao/${caminho}`); } catch (e) { return authToken === token ? { semConexao: true } : null; }
  const data = await res.json().catch(() => ({ sucesso: false, mensagem: "Resposta inválida do servidor." }));
  return authToken === token ? data : null;
}
async function expPost(acao, corpo, alvoMsg) {
  if (expOcupado) { expMensagem(alvoMsg, "Aguarde: a gravação anterior ainda está em andamento."); return null; }
  expOcupado = true;
  const token = authToken;
  try {
    let res;
    try { res = await fetchProtegido(`${API_BASE}/expansao/${acao}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }); } catch (e) {
      if (authToken === token) expMensagem(alvoMsg, "Sem conexão com o servidor. Tente de novo.");
      return null;
    }
    const data = await res.json().catch(() => ({ sucesso: false, mensagem: "Resposta inválida do servidor." }));
    if (authToken !== token) return null;
    return data;
  } finally {
    expOcupado = false;
  }
}
function expMensagem(idEl, texto) { const el = expEl(idEl); if (el) el.textContent = texto || ""; }
const expLista = (nome) => (expCatalogos && Array.isArray(expCatalogos[nome]) ? expCatalogos[nome] : []);

// Troca de login ou saída: nada da sessão anterior fica na página (nem o que foi digitado).
function expLimparTela() {
  expCatalogos = null; expReunioes = []; expFicha = null; expForm = null; expExtensoes = []; expReunioesFalhou = false;
  expPedidoFicha++; expPedidoPainel++; expPedidoLista++; expPedidoExtensoes++; expPedidoOpcoes++; expPedidoHistorico++; expConfirmando = false;
  expMarcarSecao("painel");   // o próximo login no mesmo aparelho começa no Painel, com o formulário fechado
  const det = expEl("expNovoDetalhes"); if (det) det.open = false;
  for (const idEl of ["expPainel", "expLista", "expFicha", "expListaExtensoes", "expFormExtensao", "expMsgPainel", "expMsgLista", "expMsgFicha", "expMsgNovo", "expMsgExtensoes",
    "expNovoTipo", "expNovoMae", "expNovoExtensao", "expNovoArea", "expNovoUf"]) { const el = expEl(idEl); if (el) el.innerHTML = ""; }
  for (const idEl of ["expNovoNome", "expNovoEncarregado", "expNovoEndereco", "expNovoBairro", "expNovoCidade", "expNovoJustificativa"]) { const el = expEl(idEl); if (el) el.value = ""; }
  const todas = expEl("expExtensoesTodas"); if (todas) todas.checked = false;
  const bloco = expEl("expBlocoFicha"); if (bloco) bloco.style.display = "none";
}

// ================================================================ abrir a aba ================================================================
async function carregarOpcoesExpansaoAcao() {
  const meu = ++expPedidoOpcoes;
  const cat = await expBuscar("catalogos");
  if (cat === null || meu !== expPedidoOpcoes) return;
  if (!cat.sucesso) { expEl("expPainel").innerHTML = cat.semConexao ? EXP_SEM_CONEXAO : `<p class='subtitle'>${expH(cat.mensagem)}</p>`; return; }
  expCatalogos = cat;
  // as reuniões da CLI só servem a quem registra a decisão (o nível geral): os demais nem pedem
  if (cat.papeis && cat.papeis.geral) {
    const reu = await expBuscar("reunioes");
    if (reu === null || meu !== expPedidoOpcoes) return;
    expReunioesFalhou = !(reu && reu.sucesso && Array.isArray(reu.reunioes));
    expReunioes = expReunioesFalhou ? [] : reu.reunioes;
  } else expReunioes = [];
  expPreencherNovo();
  expMostrarSecaoAcao(expSecaoAtual);
  if (expFicha) expRenderFicha();
}
function expMarcarSecao(secao) {
  expSecaoAtual = EXP_SECOES.includes(secao) ? secao : "painel";
  for (const s of EXP_SECOES) {
    const div = expEl(`expSecao${capitalize(s)}`); if (div) div.style.display = s === expSecaoAtual ? "block" : "none";
    const b = expEl(`btnExpSecao${capitalize(s)}`); if (b) { b.classList.toggle("ativo", s === expSecaoAtual); b.setAttribute("aria-pressed", s === expSecaoAtual ? "true" : "false"); }
  }
}
function expMostrarSecaoAcao(secao) {
  expMarcarSecao(secao);
  if (expSecaoAtual === "painel") expCarregarPainelAcao();
  if (expSecaoAtual === "pedidos") expCarregarListaAcao();
  if (expSecaoAtual === "extensoes") expCarregarExtensoesAcao();
}

// ================================================================ painel ================================================================
const expItemPedido = (p, texto) => `<li><strong>${expH(p.tipoRotulo)}: ${expH(p.nome)}</strong>${p.maeNome ? ` <small>(${expH(p.maeNome)})</small>` : ""} — ${texto}
  <button type="button" class="btn-link" aria-label="Abrir o pedido ${expH(p.nome)}" data-on-click="expAbrirFichaAcao" data-args-click="${argsAttr(Number(p.pedidoId))}">Abrir</button></li>`;
async function expCarregarPainelAcao() {
  const alvo = expEl("expPainel");
  if (!alvo) return;
  const meu = ++expPedidoPainel;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const p = await expBuscar("painel");
  if (p === null || meu !== expPedidoPainel) return;
  if (!p.sucesso) { alvo.innerHTML = p.semConexao ? EXP_SEM_CONEXAO : `<p class='subtitle'>${expH(p.mensagem)}</p>`; return; }
  const arr = (x) => (Array.isArray(x) ? x : []);
  const bloco = (titulo, lis, vazio) => `<h4>${titulo}</h4>${lis ? `<ul>${lis}</ul>` : `<p class="subtitle">${vazio}</p>`}`;
  const cme = p.cme || {};
  const avisosCME = [
    cme.semSecretario ? "<li>⚠️ A CME está sem o <strong>Secretário de Missões</strong>: dê em Liderança o papel \"Secretário de Missões\" a quem lidera a SEMIADESPA.</li>" : "",
    ...arr(cme.secretarioSemAcesso).map((m) => `<li>⚠️ ${expH(m.nome)} lidera a SEMIADESPA com o papel antigo e não abre esta tela: troque para o papel "Secretário de Missões" em Liderança.</li>`)
  ].join("");
  alvo.innerHTML = [
    bloco("🚩 Parecer da CME vencido (15 dias — Regimento, Art. 24 §2º)", arr(p.parecerVencido).map((x) => expItemPedido(x, `venceu em ${expH(expBr(x.prazoParecer))}; sem ele, a CLI só decide em urgência (2/3)`)).join(""), "Nenhum vencido."),
    bloco("⏳ Esperando o parecer da CME", arr(p.emParecer).map((x) => expItemPedido(x, `prazo até ${expH(expBr(x.prazoParecer))}`)).join(""), "Nenhum."),
    bloco("🏛️ Esperando a decisão da CLI", arr(p.aguardandoCLI).map((x) => expItemPedido(x, x.parecer ? `parecer da CME: ${expH(x.parecer.rotulo)}` : "pedido em " + expH(expBr(x.solicitadoEm)))).join(""), "Nada esperando a CLI."),
    bloco("⛺ Extensões com pendência (Regimento, Art. 109-A)", arr(p.extensoesComPendencia).map((e) => `<li><strong>${expH(e.nome)}</strong> <small>(${expH(e.maeNome)})</small> — ${expH(e.pendencia)}</li>`).join(""), "Todas em dia."),
    bloco("⛪ Congregação nova sem Dirigente", arr(p.congregacoesSemDirigente).map((c) => `<li><strong>${expH(c.nome)}</strong> — ${expH(c.tipoRotulo)} aprovada em ${expH(expBr(c.desde))}: dê o acesso ao Dirigente em Liderança.</li>`).join(""), "Nenhuma."),
    `<h4>🧭 A CME (Regimento, Art. 23): o Secretário de Missões e os Pastores de Área</h4>${arr(cme.membros).length ? `<ul>${arr(cme.membros).map((m) => `<li>${expH(m.nome)} — ${expH(m.cargo)}${m.origem ? ` (${expH(m.origem)})` : ""}</li>`).join("")}</ul>` : "<p class='subtitle'>Ninguém compõe a CME hoje.</p>"}${avisosCME ? `<ul>${avisosCME}</ul>` : ""}`
  ].join("");
}

// ================================================================ novo pedido e lista ================================================================
function expPreencherNovo() {
  // a aba reaberta refaz as listas: o que a pessoa já tinha escolhido volta (se ainda é uma opção válida)
  const antes = {};
  for (const idEl of ["expNovoTipo", "expNovoMae", "expNovoExtensao", "expNovoArea", "expNovoUf"]) { const el = expEl(idEl); antes[idEl] = el ? el.value : ""; }
  const opcoes = (lista, valor, rotulo, vazio = "— escolha —") => `<option value="">${expH(vazio)}</option>${lista.map((x) => `<option value="${expH(x[valor])}">${expH(rotulo(x))}</option>`).join("")}`;
  const tipo = expEl("expNovoTipo"); if (tipo) tipo.innerHTML = opcoes(expLista("tipos"), "codigo", (t) => t.rotulo);
  const mae = expEl("expNovoMae"); if (mae) mae.innerHTML = opcoes(expLista("maes"), "congregacaoId", (c) => c.nome);
  const ext = expEl("expNovoExtensao"); if (ext) ext.innerHTML = opcoes(expLista("extensoes"), "extensaoId", (e) => `${e.nome} (${e.maeNome})`);
  const area = expEl("expNovoArea"); if (area) area.innerHTML = opcoes(expLista("areas"), "areaId", (a) => a.nome, "— a da Congregação-Mãe (ou nenhuma) —");
  const uf = expEl("expNovoUf"); if (uf) uf.innerHTML = `<option value="">— nenhuma —</option>${expLista("ufs").map((u) => `<option value="${expH(u)}">${expH(u)}</option>`).join("")}`;
  for (const [idEl, v] of Object.entries(antes)) { const el = expEl(idEl); if (el && v && (el.options || []).some((o) => o.value === v)) el.value = v; }
  expTipoNovoAcao();
}
// Cada tipo mostra só os campos dele: a Extensão nasce de uma Mãe com o Encarregado; a emancipação parte de uma Extensão; a nova congregação escolhe a Área.
function expTipoNovoAcao() {
  const tipo = expEl("expNovoTipo") ? expEl("expNovoTipo").value : "";
  const mostrar = (idEl, sim) => { const el = expEl(idEl); if (el) el.style.display = sim ? "" : "none"; };
  mostrar("expNovoBlocoMae", tipo === "ABERTURA_EXTENSAO");
  mostrar("expNovoBlocoEncarregado", tipo === "ABERTURA_EXTENSAO");
  mostrar("expNovoBlocoExtensao", tipo === "EMANCIPACAO");
  mostrar("expNovoBlocoArea", tipo === "EMANCIPACAO" || tipo === "NOVA_CONGREGACAO");
  const rot = expEl("expNovoNomeRotulo"); if (rot) rot.textContent = tipo === "ABERTURA_EXTENSAO" ? "Nome da Extensão (2 a 150)" : "Nome da nova congregação (2 a 150; não pode repetir o de outra)";
  const area = expEl("expNovoArea");
  if (area && area.options && area.options[0]) area.options[0].textContent = tipo === "EMANCIPACAO" ? "— a da Congregação-Mãe —" : "— nenhuma por enquanto —";
  const end = expEl("expNovoEnderecoRotulo");
  if (end) end.textContent = tipo === "EMANCIPACAO" ? "Endereço (opcional; o que ficar em branco vem da Extensão)" : "Endereço (opcional)";
  // o que vai acontecer com o pedido, e o aviso quando não há o que escolher (antes de a pessoa preencher tudo)
  const avisos = {
    ABERTURA_EXTENSAO: expLista("maes").length ? "A abertura de Extensão vai direto à CLI (não passa pela CME)." : "Você não tem uma congregação inteira no seu escopo para ser a Congregação-Mãe (ou ela foi rebaixada pela Saúde Congregacional).",
    EMANCIPACAO: expLista("extensoes").length ? "A emancipação passa pelo parecer da CME (15 dias) e depois pela CLI." : "Não há Extensão ativa da sua congregação disponível (as que já têm pedido de emancipação em andamento não aparecem).",
    NOVA_CONGREGACAO: "A nova congregação passa pelo parecer da CME (15 dias) e depois pela CLI."
  };
  expMensagem("expMsgTipo", avisos[tipo] || "");
}
async function expSalvarNovoAcao() {
  const tipo = expEl("expNovoTipo").value;
  const corpo = {
    tipo, nome: expEl("expNovoNome").value, endereco: expEl("expNovoEndereco").value, bairro: expEl("expNovoBairro").value, cidade: expEl("expNovoCidade").value,
    uf: expEl("expNovoUf").value, justificativa: expEl("expNovoJustificativa").value
  };
  if (tipo === "ABERTURA_EXTENSAO") { corpo.congregacaoMaeId = expEl("expNovoMae").value; corpo.encarregadoMembroId = expEl("expNovoEncarregado").value.trim(); }
  if (tipo === "EMANCIPACAO") corpo.extensaoId = expEl("expNovoExtensao").value;
  if (tipo === "EMANCIPACAO" || tipo === "NOVA_CONGREGACAO") corpo.areaId = expEl("expNovoArea").value;
  const r = await expPost("pedido", corpo, "expMsgNovo");
  if (!r) return;
  if (!r.sucesso) { expMensagem("expMsgNovo", r.mensagem || "Não foi possível."); return; }
  expMensagem("expMsgNovo", "");
  for (const idEl of ["expNovoNome", "expNovoEncarregado", "expNovoEndereco", "expNovoBairro", "expNovoCidade", "expNovoJustificativa"]) expEl(idEl).value = "";
  for (const idEl of ["expNovoTipo", "expNovoMae", "expNovoExtensao", "expNovoArea", "expNovoUf"]) expEl(idEl).value = "";
  expTipoNovoAcao();
  const det = expEl("expNovoDetalhes"); if (det) det.open = false;
  await carregarOpcoesExpansaoAcao();   // a Extensão com pedido em andamento sai da lista dos catálogos
  if (r.pedidoId) await expAbrirFichaAcao(r.pedidoId);
  if (expFicha && Number(expFicha.pedidoId) === Number(r.pedidoId)) expMensagem("expMsgFicha", r.mensagem || "Pedido registrado.");
  else if (authToken) mostrarToast(r.mensagem || "Pedido registrado.", "sucesso");
}
async function expCarregarListaAcao() {
  const alvo = expEl("expLista");
  if (!alvo) return;
  const meu = ++expPedidoLista;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const r = await expBuscar("pedidos");
  if (r === null || meu !== expPedidoLista) return;
  if (!r.sucesso) { alvo.innerHTML = r.semConexao ? EXP_SEM_CONEXAO : `<p class='subtitle'>${expH(r.mensagem)}</p>`; return; }
  const lista = Array.isArray(r.pedidos) ? r.pedidos : [];
  if (!lista.length) { alvo.innerHTML = "<p class='subtitle'>Nenhum pedido.</p>"; return; }
  alvo.innerHTML = `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Pedido</th><th>Mãe</th><th>Situação</th><th>Pedido em</th><th></th></tr></thead><tbody>${lista.map((p) => `
    <tr><td><strong>${expH(p.nome)}</strong><br><small>${expH(p.tipoRotulo)}</small></td><td>${expH(p.maeNome || "—")}</td>
    <td>${expH(p.statusRotulo)}${p.parecerVencido ? "<br><strong>🚩 parecer vencido</strong>" : ""}</td><td>${expH(expBr(p.solicitadoEm))}</td>
    <td><button type="button" class="btn-link" aria-label="Abrir o pedido ${expH(p.nome)}" data-on-click="expAbrirFichaAcao" data-args-click="${argsAttr(Number(p.pedidoId))}">Abrir</button></td></tr>`).join("")}</tbody></table></div>`;
}

// ================================================================ a ficha do pedido ================================================================
async function expAbrirFichaAcao(pedidoId) {
  const id = Number(pedidoId);
  if (!Number.isInteger(id) || id <= 0) return;
  if (expSecaoAtual !== "pedidos") { expMarcarSecao("pedidos"); expCarregarListaAcao(); }
  const meu = ++expPedidoFicha;
  expForm = null;
  expMensagem("expMsgFicha", "");
  const bloco = expEl("expBlocoFicha"); if (bloco) bloco.style.display = "block";
  expEl("expFicha").innerHTML = "<p class='subtitle'>Carregando…</p>";
  const r = await expBuscar(`pedido?pedidoId=${encodeURIComponent(id)}`);
  if (r === null || meu !== expPedidoFicha) return;
  if (!r.sucesso || !r.pedido) { expFicha = null; expEl("expFicha").innerHTML = r.semConexao ? EXP_SEM_CONEXAO : `<p class='subtitle'>${expH(r.mensagem)}</p>`; return; }
  expFicha = r.pedido;
  expRenderFicha();
  if (bloco && typeof bloco.scrollIntoView === "function") bloco.scrollIntoView({ behavior: "smooth", block: "start" });
}
function expFecharFichaAcao() {
  expPedidoFicha++; expFicha = null; expForm = null;
  expEl("expFicha").innerHTML = "";
  expMensagem("expMsgFicha", "");
  const bloco = expEl("expBlocoFicha"); if (bloco) bloco.style.display = "none";
}
const expBotao = (rotulo, chave) => `<button type="button" class="btn-confirmar btn-secundario" style="width:auto;margin:2px;" data-on-click="expAbrirFormAcao" data-args-click="${argsAttr(String(chave))}">${rotulo}</button>`;

function expRenderFicha() {
  const p = expFicha;
  if (!p) return;
  const digitado = expForm ? expCamposDigitados() : null;   // a ficha repintada (a aba reaberta) não apaga o que foi escrito
  const a = p.acoes || {};
  const local = [p.endereco, p.bairro, p.cidade && p.uf ? `${p.cidade}/${p.uf}` : (p.cidade || p.uf)].filter(Boolean).join(" · ");
  const prazo = p.status === "EM_PARECER" && p.prazoParecer
    ? `<p class="ent-prazo"><strong>Parecer da CME até ${expH(expBr(p.prazoParecer))}</strong>${p.parecerVencido ? " — <strong>vencido</strong>: a CLI só decide em regime de urgência (2/3)" : ""} (Regimento, Art. 24 §2º).</p>` : "";
  const resultado = p.resultado
    ? `<p>✅ ${p.resultado.congregacaoId ? `Nasceu a congregação <strong>${expH(p.resultado.congregacaoNome)}</strong>${p.resultado.membrosTransferidos != null ? `; ${expH(p.resultado.membrosTransferidos)} membro(s) da Extensão passaram para ela` : ""}.` : "A Extensão foi aberta com o Encarregado."}</p>` : "";
  const botoes = [a.parecer ? expBotao("🧭 Parecer da CME", "parecer") : "", a.decidir ? expBotao("🏛️ Decisão da CLI", "decidir") : "", a.desistir ? expBotao("↩️ Desistir do pedido", "desistir") : ""].filter(Boolean).join(" ");
  expEl("expFicha").innerHTML = `
    <h4>${expH(p.tipoRotulo)}: ${expH(p.nome)}</h4>
    <p><strong>${expH(p.statusRotulo)}</strong>${p.maeNome ? ` · Congregação-Mãe: ${expH(p.maeNome)}` : ""}${p.extensaoNome ? ` · Extensão: ${expH(p.extensaoNome)}` : ""}${p.areaNome ? ` · Área: ${expH(p.areaNome)}` : ""}</p>
    ${local ? `<p>${expH(local)}</p>` : ""}
    ${p.encarregado ? `<p>Encarregado indicado no pedido: ${expH(p.encarregado.nome)} (mat. ${expH(p.encarregado.membroId)})</p>` : ""}
    <p class="subtitle">${expH(p.justificativa)}</p>
    <p><small>Pedido por ${expH(p.solicitanteNome || p.solicitadoPor)} em ${expH(expBr(p.solicitadoEm))}.</small></p>
    ${prazo}
    ${p.parecer ? `<div class="cartao-perfil ent-cartao"><p><strong>Parecer da CME: ${expH(p.parecer.rotulo)}</strong> — ${expH(p.parecer.porNome || "")} em ${expH(expBr(p.parecer.em))}</p><p class="subtitle">${expH(p.parecer.fundamentacao)}</p></div>` : ""}
    ${p.decisao ? `<div class="cartao-perfil ent-cartao"><p><strong>CLI: ${expH(p.decisao.rotulo)}</strong> na reunião de ${expH(expBr(p.decisao.em))}${p.decisao.urgencia ? " — <strong>em regime de urgência</strong> (sem o parecer)" : ""}.</p>${p.decisao.motivo ? `<p class="subtitle">${expH(p.decisao.motivo)}</p>` : ""}</div>` : ""}
    ${resultado}
    ${p.desistencia ? `<p>Desistência em ${expH(expBr(p.desistencia.em))}: ${expH(p.desistencia.motivo)}</p>` : ""}
    ${botoes ? `<div class="barra-lista">${botoes}</div>` : ""}
    <div id="expFormAcao"></div>`;
  if (expForm) { expRenderForm(); expRestaurarCampos(digitado); }
}
function expCamposDigitados() {
  const esp = expForm ? expEspec(expForm.chave) : null;
  const v = {};
  for (const c of (esp ? esp.campos : [])) { const el = expEl(`expCampo_${c.id}`); if (el) v[c.id] = c.tipo === "check" ? !!el.checked : el.value; }
  return v;
}
function expRestaurarCampos(v) {
  for (const [id, valor] of Object.entries(v || {})) {
    const el = expEl(`expCampo_${id}`);
    if (!el) continue;
    if (typeof valor === "boolean") el.checked = valor;
    else if (el.tagName !== "SELECT" || (el.options || []).some((o) => o.value === valor)) el.value = valor;
  }
}

// As especificações de cada ato. Campos: id, rotulo, tipo (texto, area, select, check, reuniaoCLI), max, desde. `confirmar(corpo)`: a pergunta do ato que não se desfaz.
function expEspec(chave) {
  const p = expFicha || {};
  const quem = `${p.tipoRotulo || ""}: ${p.nome || ""}`;
  switch (chave) {
    case "parecer": return { titulo: `Parecer da CME — ${quem}`, acao: "parecer", campos: [
      { id: "parecer", rotulo: "Parecer", tipo: "select", opcoes: expLista("pareceres"), obrigatorio: true },
      { id: "fundamentacao", rotulo: "Fundamentação: a viabilidade estratégica (10 a 2.000)", tipo: "area", max: 2000, obrigatorio: true }],
      confirmar: (c) => `Emitir o parecer ${c.parecer === "CONTRARIO" ? "CONTRÁRIO" : "FAVORÁVEL"} da CME? Ele não muda depois e o pedido segue para a CLI.` };
    case "decidir": {
      const desde = [p.solicitadoEm, p.parecerEm].filter(Boolean).sort().pop();
      const semParecer = p.status === "EM_PARECER";
      return { titulo: `Decisão da CLI — ${quem}`, acao: "decidir", campos: [
        { id: "sessaoId", rotulo: "Reunião da CLI (já realizada e encerrada)", tipo: "reuniaoCLI", desde, obrigatorio: true },
        { id: "resultado", rotulo: "A CLI…", tipo: "select", opcoes: expLista("resultados"), obrigatorio: true },
        ...(semParecer ? [{ id: "urgencia", rotulo: "Votado em regime de urgência, aprovado por 2/3 do Plenário (dispensa o parecer da CME — Regimento, Art. 24 §2º)", tipo: "check" }] : []),
        { id: "motivo", rotulo: "Motivo (obrigatório na recusa; até 1.000)", tipo: "area", max: 1000 }],
        aviso: semParecer ? "A CME ainda não emitiu o parecer: sem a urgência marcada, a decisão é recusada." : "Vale a reunião feita no dia do pedido ou depois dele e do parecer.",
        // o que a tela já sabe que o servidor recusaria, antes de perguntar e de pedir a confirmação de quem é
        conferir: (c) => (semParecer && !c.urgencia ? "Sem o parecer da CME, marque a urgência (2/3) — ou espere o parecer." : (c.resultado === "REJEITADO" && !c.motivo ? "Na recusa, escreva o motivo." : null)),
        confirmar: (c) => {
          if (c.resultado !== "APROVADO") return "Registrar a RECUSA da CLI? Isto não se desfaz.";
          if (p.tipo === "EMANCIPACAO") return `Registrar a APROVAÇÃO? A congregação "${p.nome}" nasce agora, os membros da Extensão passam para ela, a Extensão fica emancipada, o acesso de quem tinha o escopo dela termina e todas as sessões abertas no sistema caem (cada um entra de novo). Isto não se desfaz.`;
          if (p.tipo === "NOVA_CONGREGACAO") return `Registrar a APROVAÇÃO? A congregação "${p.nome}" nasce agora. Isto não se desfaz.`;
          return `Registrar a APROVAÇÃO? A Extensão "${p.nome}" é aberta agora, com o Encarregado. Isto não se desfaz.`;
        } };
    }
    case "desistir": return { titulo: `Desistir do pedido — ${quem}`, acao: "desistir", campos: [{ id: "motivo", rotulo: "Motivo (5 a 1.000)", tipo: "area", max: 1000, obrigatorio: true }],
      confirmar: () => "Desistir deste pedido? Isto não se desfaz (um novo pedido continua possível)." };
    default: return null;
  }
}
function expAbrirFormAcao(chave) {
  if (!expFicha || !expEspec(String(chave))) return;
  expForm = { chave: String(chave) };
  expRenderForm();
  const alvo = expEl("expFormAcao");
  if (alvo && typeof alvo.scrollIntoView === "function") alvo.scrollIntoView({ behavior: "smooth", block: "start" });
  const esp = expEspec(expForm.chave);
  const primeiro = esp.campos[0] ? expEl(`expCampo_${esp.campos[0].id}`) : null;
  if (primeiro && typeof primeiro.focus === "function") primeiro.focus();
}
function expOpcoesReuniao(desde) {
  if (expReunioesFalhou) return "<option value=\"\">Não foi possível carregar as reuniões da CLI — saia da aba e entre de novo</option>";
  const validas = expReunioes.filter((s) => !desde || s.data >= desde);
  if (!validas.length) return "<option value=\"\">Nenhuma reunião da CLI encerrada nas datas que valem — registre-a em Órgãos Centrais</option>";
  return `<option value="">— escolha —</option>${validas.map((s) => `<option value="${expH(s.sessaoId)}">${expH(expBr(s.data))} — ${expH(s.descricao || "reunião")}</option>`).join("")}`;
}
function expRenderForm() {
  const alvo = expEl("expFormAcao");
  if (!alvo || !expForm) return;
  const esp = expEspec(expForm.chave);
  if (!esp) { alvo.innerHTML = ""; return; }
  const campo = (c) => {
    const idEl = `expCampo_${c.id}`;
    const max = Number(c.max) > 0 ? ` maxlength="${Number(c.max)}"` : "";
    if (c.tipo === "check") return `<div class="input-group"><label><input type="checkbox" id="${idEl}" /> ${expH(c.rotulo)}</label></div>`;
    let entrada;
    if (c.tipo === "area") entrada = `<textarea id="${idEl}" rows="3" style="width:100%;"${max}></textarea>`;
    else if (c.tipo === "select") entrada = `<select id="${idEl}"><option value="">— escolha —</option>${(c.opcoes || []).map((o) => `<option value="${expH(o.codigo)}">${expH(o.rotulo)}</option>`).join("")}</select>`;
    else if (c.tipo === "reuniaoCLI") entrada = `<select id="${idEl}">${expOpcoesReuniao(c.desde)}</select>`;
    else entrada = `<input type="text" id="${idEl}"${max} />`;
    return `<div class="input-group"><label for="${idEl}">${expH(c.rotulo)}</label>${entrada}</div>`;
  };
  alvo.innerHTML = `<div class="cartao-perfil ent-form">
    <h4>${expH(esp.titulo)}</h4>${esp.aviso ? `<p class="subtitle">${expH(esp.aviso)}</p>` : ""}
    ${esp.campos.map(campo).join("")}
    <p id="expMsgForm" class="subtitle" role="status" aria-live="polite"></p>
    <div class="barra-lista"><button type="button" class="btn-confirmar" style="width:auto;" data-on-click="expEnviarFormAcao">Salvar</button>
    <button type="button" class="btn-confirmar btn-secundario" style="width:auto;" data-on-click="expCancelarFormAcao">Cancelar</button></div></div>`;
}
function expCancelarFormAcao() { expForm = null; const alvo = expEl("expFormAcao"); if (alvo) alvo.innerHTML = ""; }
async function expEnviarFormAcao() {
  if (!expForm || !expFicha) return;
  const esp = expEspec(expForm.chave);
  if (!esp) return;
  const corpo = { pedidoId: Number(expFicha.pedidoId) };
  for (const c of esp.campos) {
    const el = expEl(`expCampo_${c.id}`);
    if (!el) continue;
    corpo[c.id] = c.tipo === "check" ? !!el.checked : String(el.value || "").trim();
  }
  const faltando = esp.campos.filter((c) => c.obrigatorio && !corpo[c.id]).map((c) => c.rotulo.replace(/ \(.*$/, ""));
  const problema = faltando.length ? `Preencha: ${faltando.join("; ")}.` : (typeof esp.conferir === "function" ? esp.conferir(corpo) : null);
  if (problema) { expMensagem("expMsgForm", problema); return; }
  const pergunta = typeof esp.confirmar === "function" ? esp.confirmar(corpo) : null;
  const ficha = expPedidoFicha;
  if (pergunta) {
    if (expConfirmando) return;
    expConfirmando = true;
    let sim;
    try { sim = await confirmarAcao(pergunta, "Confirmar"); } finally { expConfirmando = false; }
    if (!sim) return;
  }
  if (ficha !== expPedidoFicha || !expForm) return;   // trocou de ficha (ou saiu) enquanto a pergunta estava aberta
  const pedidoId = expFicha.pedidoId;
  const r = await expPost(esp.acao, corpo, "expMsgForm");
  if (!r) return;
  if (ficha !== expPedidoFicha) {
    // trocou de ficha durante a gravação: nada vai para a ficha de agora; o que foi gravado aparece num aviso e a lista se atualiza
    if (r.sucesso && authToken) { mostrarToast(r.mensagem || "Feito.", "sucesso"); expCarregarListaAcao(); carregarOpcoesExpansaoAcao(); }
    return;
  }
  const msg = r.mensagem || (r.sucesso ? "Feito." : "Não foi possível.");
  if (!r.sucesso) {
    expMensagem("expMsgForm", msg);
    const el = expEl("expMsgForm"); if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  expForm = null;
  await expAbrirFichaAcao(pedidoId);
  if (!authToken) return;   // saiu enquanto relia a ficha
  if (expFicha && Number(expFicha.pedidoId) === Number(pedidoId)) {
    expMensagem("expMsgFicha", msg);
    const m = expEl("expMsgFicha"); if (m && typeof m.focus === "function") m.focus();   // o formulário sumiu: o foco vai para o resultado
  }
  expCarregarListaAcao();
  if (esp.acao === "decidir" || esp.acao === "desistir") carregarOpcoesExpansaoAcao();   // a Extensão aberta ou liberada muda os catálogos
}

// ================================================================ extensões ================================================================
async function expCarregarExtensoesAcao() {
  const alvo = expEl("expListaExtensoes");
  if (!alvo) return;
  const meu = ++expPedidoExtensoes;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const todas = expEl("expExtensoesTodas") && expEl("expExtensoesTodas").checked;
  if (!expOcupado) expMensagem("expMsgExtensoes", "");
  const r = await expBuscar(`extensoes${todas ? "?todas=1" : ""}`);
  if (r === null || meu !== expPedidoExtensoes) return;
  if (!r.sucesso) { alvo.innerHTML = r.semConexao ? EXP_SEM_CONEXAO : `<p class='subtitle'>${expH(r.mensagem)}</p>`; return; }
  expExtensoes = Array.isArray(r.extensoes) ? r.extensoes : [];
  if (!expExtensoes.length) { alvo.innerHTML = "<p class='subtitle'>Nenhuma Extensão.</p>"; return; }
  alvo.innerHTML = `<div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr><th>Extensão</th><th>Mãe</th><th>Encarregado</th><th>Membros</th><th></th></tr></thead><tbody>${expExtensoes.map((e) => `
    <tr><td><strong>${expH(e.nome)}</strong>${e.abertaEm ? `<br><small>aberta em ${expH(expBr(e.abertaEm))}</small>` : ""}${e.emancipadaEm ? `<br><small>emancipada em ${expH(expBr(e.emancipadaEm))} → ${expH(e.emancipadaNome)}</small>` : (e.ativa ? "" : "<br><small>inativa</small>")}${e.pedidoEmAndamento ? "<br><small>🏛️ pedido de emancipação em andamento</small>" : ""}</td>
    <td>${expH(e.maeNome)}</td><td>${e.encarregado ? `${expH(e.encarregado.nome)}<br><small>desde ${expH(expBr(e.encarregado.desde))}</small>` : "—"}${e.pendencia ? `<br><strong>⚠️ ${expH(e.pendencia)}</strong>` : ""}</td>
    <td>${expH(e.membros)}</td>
    <td>${e.podeEditar ? `<button type="button" class="btn-link" aria-label="${e.encarregado ? "Trocar" : "Definir"} o Encarregado de ${expH(e.nome)}" data-on-click="expTrocarEncarregadoAcao" data-args-click="${argsAttr(Number(e.extensaoId))}">${e.encarregado ? "Trocar Encarregado" : "Definir Encarregado"}</button><br>` : ""}${e.podeVerHistorico ? `<button type="button" class="btn-link" aria-label="Histórico dos Encarregados de ${expH(e.nome)}" data-on-click="expHistoricoAcao" data-args-click="${argsAttr(Number(e.extensaoId))}">Histórico</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
}
function expTrocarEncarregadoAcao(extensaoId) {
  const e = expExtensoes.find((x) => Number(x.extensaoId) === Number(extensaoId));
  const alvo = expEl("expFormExtensao");
  if (!e || !alvo) return;
  alvo.innerHTML = `<div class="cartao-perfil ent-form">
    <h4>${e.encarregado ? "Trocar" : "Definir"} o Encarregado — ${expH(e.nome)} <small>(${expH(e.maeNome)})</small></h4>
    <p class="subtitle">De confiança do Dirigente: membro ativo, em comunhão, da própria Congregação-Mãe (Regimento, Art. 109-A, I).</p>
    <div class="input-group"><label for="expEncMembro">Matrícula do novo Encarregado</label><input type="text" id="expEncMembro" inputmode="numeric" maxlength="10" /></div>
    ${e.encarregado ? `<div class="input-group"><label for="expEncMotivo">Motivo da troca (5 a 1.000)</label><textarea id="expEncMotivo" rows="2" style="width:100%;" maxlength="1000"></textarea></div>` : ""}
    <p id="expMsgEnc" class="subtitle" role="status" aria-live="polite"></p>
    <div class="barra-lista"><button type="button" class="btn-confirmar" style="width:auto;" data-on-click="expSalvarEncarregadoAcao" data-args-click="${argsAttr(Number(e.extensaoId))}">Salvar</button>
    <button type="button" class="btn-confirmar btn-secundario" style="width:auto;" data-on-click="expFecharFormExtensaoAcao">Cancelar</button></div></div>`;
  if (typeof alvo.scrollIntoView === "function") alvo.scrollIntoView({ behavior: "smooth", block: "start" });
  const campo = expEl("expEncMembro"); if (campo && typeof campo.focus === "function") campo.focus();
}
function expFecharFormExtensaoAcao() { const alvo = expEl("expFormExtensao"); if (alvo) alvo.innerHTML = ""; }
async function expSalvarEncarregadoAcao(extensaoId) {
  const meu = expPedidoExtensoes;
  const motivo = expEl("expEncMotivo");
  const r = await expPost("encarregado", { extensaoId: Number(extensaoId), membroId: expEl("expEncMembro").value.trim(), motivo: motivo ? motivo.value : "" }, "expMsgEnc");
  if (!r) return;
  if (!r.sucesso) { expMensagem("expMsgEnc", r.mensagem || "Não foi possível."); return; }
  expFecharFormExtensaoAcao();
  if (meu === expPedidoExtensoes) await expCarregarExtensoesAcao();
  if (!authToken) return;
  expMensagem("expMsgExtensoes", r.mensagem || "Salvo.");
  const m = expEl("expMsgExtensoes"); if (m && typeof m.scrollIntoView === "function") m.scrollIntoView({ behavior: "smooth", block: "center" });
}
async function expHistoricoAcao(extensaoId) {
  const e = expExtensoes.find((x) => Number(x.extensaoId) === Number(extensaoId));
  const alvo = expEl("expFormExtensao");
  if (!e || !alvo) return;
  const meu = ++expPedidoHistorico;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  if (typeof alvo.scrollIntoView === "function") alvo.scrollIntoView({ behavior: "smooth", block: "start" });
  const r = await expBuscar(`extensao-historico?extensaoId=${encodeURIComponent(Number(extensaoId))}`);
  if (r === null || meu !== expPedidoHistorico) return;
  if (!r.sucesso) { alvo.innerHTML = r.semConexao ? EXP_SEM_CONEXAO : `<p class='subtitle'>${expH(r.mensagem)}</p>`; return; }
  const hist = Array.isArray(r.encarregados) ? r.encarregados : [];
  alvo.innerHTML = `<div class="cartao-perfil ent-form"><h4>Encarregados — ${expH(e.nome)}</h4>
    ${hist.length ? `<ul>${hist.map((h) => `<li>${expH(h.nome)} (mat. ${expH(h.membroId)}) — desde ${expH(expBr(h.desde))}${h.ate ? ` até ${expH(expBr(h.ate))}: ${expH(h.motivoSaida)}` : " <strong>(atual)</strong>"}</li>`).join("")}</ul>` : "<p class='subtitle'>Ninguém registrado.</p>"}
    <div class="barra-lista"><button type="button" class="btn-confirmar btn-secundario" style="width:auto;" data-on-click="expFecharFormExtensaoAcao">Fechar</button></div></div>`;
}

// Meus Dados (LGPD): as Extensões que a pessoa encarregou ou encarrega.
function expCartaoMeusDados(lista) {
  const itens = Array.isArray(lista) ? lista : [];
  if (!itens.length) return "";
  return `
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Extensões da Tenda (Encarregado)</h4>
      ${itens.map((x) => `<p class="linha-perfil">${expH(x.extensao)} (${expH(x.congregacaoMae)}) — desde ${expH(expBr(x.desde))}${x.ate ? `, até ${expH(expBr(x.ate))}${x.motivoSaida ? ` (${expH(x.motivoSaida)})` : ""}` : " (atual)"}</p>`).join("")}
    </div>`;
}

registrarAcoes({
  expMostrarSecaoAcao, expCarregarPainelAcao, expCarregarListaAcao, expTipoNovoAcao, expSalvarNovoAcao, expAbrirFichaAcao, expFecharFichaAcao, expAbrirFormAcao,
  expCancelarFormAcao, expEnviarFormAcao, expCarregarExtensoesAcao, expTrocarEncarregadoAcao, expFecharFormExtensaoAcao, expSalvarEncarregadoAcao, expHistoricoAcao
});
