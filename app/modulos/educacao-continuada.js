// modulos/educacao-continuada.js — v8.6: Educação continuada (Regimento Art. 68 §3º e Art. 70 §3º). Toda regra mora no servidor (api/shared/educacaoContinuada.js e
// educacaoContinuadaDb.js); aqui só se monta a tela.
//  - seção "Educação continuada" da aba Academia (AFM), só do nível geral: a reciclagem do ano (a edição e o lançamento das horas e do resultado de cada obreiro) e o
//    exame bienal (e as repescagens), com quem está pendente;
//  - "Minha educação continuada" em Minha Formação (Meu Painel) e a formação no perfil da pessoa (aba Caminhada).
// Toda resposta confere, depois de cada await, se o login ainda é o mesmo (authToken). As ações são registradas no fim do arquivo (registrarAcoes mescla).

let edcPainel = null;
let edcLancando = null;   // { tipo: "reciclagem"|"exame", id }
let edcOcupado = false;
let edcPedidoPerfil = 0;
let edcPedidoPainel = 0;
let edcPedidoLancamento = 0;
const EDC_LOTE = 100;     // o lançamento vai ao servidor em lotes (o ano inteiro de ~1.000 obreiros não cabe num pedido só)
const edcEl = (idEl) => document.getElementById(idEl);
const edcBr = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const EDC_SEM_CONEXAO = "<p class='subtitle'>Sem conexão com o servidor. Tente de novo.</p>";

async function edcBuscar(caminho) {
  const token = authToken;
  let res;
  try { res = await fetchProtegido(`${API_BASE}/${caminho}`); } catch (e) { return authToken === token ? { semConexao: true } : null; }
  const data = await res.json().catch(() => ({ sucesso: false, mensagem: "Resposta inválida do servidor." }));
  return authToken === token ? data : null;
}
// A mensagem sai no topo da seção e, com um lançamento aberto, também logo abaixo do "Salvar resultados" (a tabela é longa).
function edcMensagem(texto) {
  edcEl("edcMsg").textContent = texto;
  const perto = edcEl("edcMsgLancamento");
  if (perto) perto.textContent = texto;
}
// `ocupado`: quem chama já segurou a vez (o lançamento em lotes segura uma vez só, do primeiro ao último lote).
async function edcPost(acao, corpo, { ocupado = false } = {}) {
  if (!ocupado) {
    if (edcOcupado) { edcMensagem("Aguarde: a gravação anterior ainda está em andamento."); return null; }
    edcOcupado = true;
  }
  const token = authToken;
  try {
    let res;
    try { res = await fetchProtegido(`${API_BASE}/educacao-continuada/${acao}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }); } catch (e) {
      if (authToken === token) edcMensagem("Sem conexão com o servidor. Tente de novo.");
      return null;
    }
    const data = await res.json().catch(() => ({ sucesso: false, mensagem: "Resposta inválida do servidor." }));
    if (authToken !== token) return null;
    edcMensagem(data.mensagem || "");
    return data;
  } finally {
    if (!ocupado) edcOcupado = false;
  }
}

// Troca de login ou saída: nada da sessão anterior fica na página (nem o que foi digitado nos formulários).
function edcLimparTela() {
  edcPainel = null;
  edcLancando = null;
  edcPedidoPerfil++;
  edcPedidoPainel++;
  edcPedidoLancamento++;
  for (const idEl of ["edcPendentes", "edcPendentesAno", "edcListaEdicoes", "edcListaExames", "edcLancamento", "edcMsg", "edcMinha", "edcFormacaoPerfil", "edcExameOrigem"]) { const el = edcEl(idEl); if (el) el.innerHTML = ""; }
  for (const idEl of ["edcEdicaoData", "edcEdicaoCarga", "edcEdicaoObs", "edcExameData", "edcExameObs"]) { const el = edcEl(idEl); if (el) el.value = ""; }
  const freq = edcEl("edcEdicaoFreq");
  if (freq) freq.value = "75";
  const tipo = edcEl("edcExameTipo");
  if (tipo) { tipo.value = "BIENAL"; edcMudouTipoExameAcao(); }
}

// ---- o histórico de formação (a minha e a do perfil) ----
// comTrilhas: no perfil as trilhas concluídas entram aqui; na Minha Formação elas já aparecem logo acima (os cartões da trilha).
function edcHtmlHistorico(h, { comTrilhas = true } = {}) {
  if (!h) return "";
  const pend = h.situacao && h.situacao.pendencias && h.situacao.pendencias.length
    ? `<ul>${h.situacao.pendencias.map((p) => `<li>⚠️ ${escaparHtmlEbd(p)}</li>`).join("")}</ul>` : "<p>✔ Educação continuada em dia.</p>";
  const rec = h.reciclagens && h.reciclagens.length ? `<ul>${h.reciclagens.map((r) => `<li>Reciclagem ${Number(r.ano)}: <strong>${escaparHtmlEbd(r.resultadoRotulo)}</strong>${r.horasPresentes != null
    ? ` — ${escaparHtmlEbd(String(r.horasPresentes))} h de ${escaparHtmlEbd(String(r.cargaHoraria))} h` : ""}</li>`).join("")}</ul>` : "<p class='subtitle'>Nenhuma reciclagem registrada.</p>";
  const ex = h.exames && h.exames.length ? `<ul>${h.exames.map((e) => `<li>${escaparHtmlEbd(e.tipoRotulo)} de ${escaparHtmlEbd(edcBr(e.data))}: <strong>${escaparHtmlEbd(e.resultadoRotulo)}</strong></li>`).join("")}</ul>`
    : "<p class='subtitle'>Nenhum exame registrado.</p>";
  const tr = !comTrilhas ? "" : `<h5>Trilhas de formação</h5>${h.trilhas && h.trilhas.length ? `<ul>${h.trilhas.map((t) => `<li>${escaparHtmlEbd(t.trilha)} — concluída em ${escaparHtmlEbd(edcBr(t.concluidaEm))}${t.validoAte ? `, vale até ${escaparHtmlEbd(edcBr(t.validoAte))}` : ""}${t.codigo
    ? ` <a href="verificar.html?c=${escaparHtmlEbd(encodeURIComponent(t.codigo))}" target="_blank" rel="noopener">certificado ${escaparHtmlEbd(t.codigo)}</a>` : ""}</li>`).join("")}</ul>` : "<p class='subtitle'>Nenhuma trilha de formação concluída.</p>"}`;
  return `${pend}<h5>Reciclagem anual (Art. 68 §3º)</h5>${rec}<h5>Exame bienal (Art. 70 §3º)</h5>${ex}${tr}`;
}
// A educação continuada diz respeito ao obreiro e à Câmara: para quem nunca teve reciclagem nem exame e não é obreiro, o bloco não aparece.
const edcTemAlgo = (h) => !!(h.obreiro || (h.reciclagens && h.reciclagens.length) || (h.exames && h.exames.length) || (h.situacao && h.situacao.pendencias && h.situacao.pendencias.length));

async function edcCarregarMinha() {
  const alvo = edcEl("edcMinha");
  if (!alvo) return;
  alvo.innerHTML = "";
  const data = await edcBuscar("educacao-continuada/minha");
  if (data === null || !data.sucesso || !edcTemAlgo(data)) return;
  alvo.innerHTML = `<h4>📝 Minha educação continuada</h4>${edcHtmlHistorico(data, { comTrilhas: false })}`;
}

async function edcCarregarPessoa(membroId) {
  const alvo = edcEl("edcFormacaoPerfil");
  if (!alvo || !membroId) return;
  const pedido = ++edcPedidoPerfil;
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const data = await edcBuscar(`educacao-continuada/pessoa?membroId=${encodeURIComponent(membroId)}`);
  if (data === null || pedido !== edcPedidoPerfil || String(window._membroPerfilAtual) !== String(membroId)) return;
  alvo.innerHTML = data.semConexao ? EDC_SEM_CONEXAO : data.sucesso && (edcTemAlgo(data) || (data.trilhas && data.trilhas.length)) ? `<h4>📝 Formação ministerial</h4>${edcHtmlHistorico(data)}` : "";
}

// ---- a seção da Academia (nível geral) ----
async function edcCarregarPainelAcao() {
  const lista = edcEl("edcListaEdicoes");
  const pedido = ++edcPedidoPainel;
  lista.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const data = await edcBuscar("educacao-continuada/painel");
  if (data === null || pedido !== edcPedidoPainel) return;
  if (data.semConexao) { lista.innerHTML = EDC_SEM_CONEXAO; return; }
  if (!data.sucesso) { lista.innerHTML = `<p class='subtitle'>${escaparHtmlEbd(data.mensagem || "Não foi possível carregar.")}</p>`; return; }
  edcPainel = data;
  const pend = (data.pessoas || []).filter((p) => p.situacao && p.situacao.pendencias && p.situacao.pendencias.length);
  edcEl("edcPendentes").innerHTML = pend.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Congregação</th><th>Pendência</th></tr></thead><tbody>${pend.map((p) => `<tr><td>${escaparHtmlEbd(p.nome)}</td><td>${escaparHtmlEbd(p.congregacao) || "-"}</td><td>${p.situacao.pendencias.map((x) => escaparHtmlEbd(x)).join("<br>")}</td></tr>`).join("")}</tbody></table>`
    : "<p class='subtitle'>Ninguém com pendência de reciclagem ou de exame.</p>";
  // a reciclagem DO ANO: quem ainda não foi aprovado perde a renovação da credencial em 1º de janeiro
  const doAno = data.edicaoDoAno ? (data.pessoas || []).filter((p) => p.semAprovacaoNoAno) : [];
  edcEl("edcPendentesAno").innerHTML = !data.edicaoDoAno ? "" : doAno.length
    ? `<p><strong>Ainda sem aprovação na reciclagem de ${Number(data.edicaoDoAno.ano)} (${doAno.length})</strong> — sem ela, a credencial não é renovada em 1º de janeiro:</p><ul>${
      doAno.map((p) => `<li>${escaparHtmlEbd(p.nome)}${p.congregacao ? ` — ${escaparHtmlEbd(p.congregacao)}` : ""}</li>`).join("")}</ul>`
    : `<p class='subtitle'>Todos os obreiros já foram aprovados na reciclagem de ${Number(data.edicaoDoAno.ano)}.</p>`;
  lista.innerHTML = data.edicoes.length ? `<table class="tabela-frequencia"><thead><tr><th>Ano</th><th>Data</th><th>Carga</th><th>Mínimo para aprovar</th><th>Aprovados / registrados</th><th></th></tr></thead><tbody>${
    data.edicoes.map((e) => `<tr><td>${Number(e.ano)}</td><td>${escaparHtmlEbd(edcBr(e.data))}</td><td>${escaparHtmlEbd(String(e.cargaHoraria))} h</td><td>${escaparHtmlEbd(String(e.horasMinimas))} h (${Number(e.frequenciaMinimaPct)}%)</td>
      <td>${Number(e.aprovados)} / ${Number(e.registrados)}</td><td><button class="btn-link" data-on-click="edcLancarReciclagemAcao" data-args-click="${argsAttr(Number(e.edicaoId))}" aria-label="Lançar os resultados da reciclagem de ${Number(e.ano)}">Lançar resultados</button></td></tr>`).join("")
  }</tbody></table>` : "<p class='subtitle'>Nenhuma reciclagem registrada ainda. Registre a do ano acima.</p>";
  edcEl("edcListaExames").innerHTML = data.exames.length ? `<table class="tabela-frequencia"><thead><tr><th>Exame</th><th>Data</th><th>Aprovados / registrados</th><th></th></tr></thead><tbody>${
    data.exames.map((x) => `<tr><td>${escaparHtmlEbd(x.tipoRotulo)}</td><td>${escaparHtmlEbd(edcBr(x.data))}</td><td>${Number(x.aprovados)} / ${Number(x.registrados)}</td>
      <td><button class="btn-link" data-on-click="edcLancarExameAcao" data-args-click="${argsAttr(Number(x.exameId))}" aria-label="Lançar os resultados do exame de ${escaparHtmlEbd(edcBr(x.data))}">Lançar resultados</button></td></tr>`).join("")
  }</tbody></table>` : "<p class='subtitle'>Nenhum exame registrado ainda.</p>";
  edcEl("edcExameOrigem").innerHTML = `<option value="">(o exame bienal desta repescagem)</option>${data.exames.filter((x) => x.tipo === "BIENAL").map((x) => `<option value="${Number(x.exameId)}">Bienal de ${escaparHtmlEbd(edcBr(x.data))}</option>`).join("")}`;
}

async function edcSalvarEdicaoAcao() {
  const data = await edcPost("edicao", { data: edcEl("edcEdicaoData").value, cargaHoraria: edcEl("edcEdicaoCarga").value.trim(), frequenciaMinimaPct: Number(edcEl("edcEdicaoFreq").value), observacao: edcEl("edcEdicaoObs").value });
  if (data && data.sucesso) edcCarregarPainelAcao();
}

function edcMudouTipoExameAcao() { edcEl("edcGrupoOrigem").hidden = edcEl("edcExameTipo").value !== "REPESCAGEM"; }

async function edcSalvarExameAcao() {
  const tipo = edcEl("edcExameTipo").value;
  const data = await edcPost("exame", { tipo, data: edcEl("edcExameData").value, exameOrigemId: tipo === "REPESCAGEM" ? Number(edcEl("edcExameOrigem").value) || null : null, observacao: edcEl("edcExameObs").value });
  if (data && data.sucesso) edcCarregarPainelAcao();
}

// O lançamento: a tabela das pessoas com o resultado de cada uma. Só as linhas que a AFM mexeu vão ao servidor (o resto já está gravado e não se repete na auditoria).
async function edcLancarReciclagemAcao(edicaoId) { await edcAbrirLancamento("reciclagem", Number(edicaoId)); }
async function edcLancarExameAcao(exameId) { await edcAbrirLancamento("exame", Number(exameId)); }

const edcPessoasDoLancamento = (tipo) => (edcPainel.pessoas || []).filter((p) => tipo === "exame" || p.obreiro);

// `manter`: as linhas que o servidor recusou voltam com o que foi digitado (Map membroId -> item enviado), para corrigir sem redigitar.
async function edcAbrirLancamento(tipo, id, { manter = null } = {}) {
  if (!edcPainel) return;
  const alvo = edcEl("edcLancamento");
  const pedido = ++edcPedidoLancamento;
  edcLancando = { tipo, id };
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const data = await edcBuscar(tipo === "reciclagem" ? `educacao-continuada/edicao?edicaoId=${id}` : `educacao-continuada/exame?exameId=${id}`);
  if (data === null || pedido !== edcPedidoLancamento || !edcPainel) return;
  if (data.semConexao || !data.sucesso) { alvo.innerHTML = data.semConexao ? EDC_SEM_CONEXAO : `<p class='subtitle'>${escaparHtmlEbd(data.mensagem || "Não foi possível carregar.")}</p>`; return; }
  const ja = new Map((data.itens || []).map((r) => [Number(r.membroId), r]));
  const eu = Number(authMatricula);
  const opcoes = (mapa, atual) => `<option value="">—</option>${Object.entries(mapa).map(([k, v]) => `<option value="${escaparHtmlEbd(k)}"${k === atual ? " selected" : ""}>${escaparHtmlEbd(v)}</option>`).join("")}`;
  const edicao = tipo === "reciclagem" ? edcPainel.edicoes.find((e) => e.edicaoId === id) : null;
  const exame = tipo === "exame" ? edcPainel.exames.find((e) => e.exameId === id) : null;
  const titulo = tipo === "reciclagem" ? `Reciclagem ${edicao ? Number(edicao.ano) : ""} — mínimo para aprovar: ${edicao ? escaparHtmlEbd(String(edicao.horasMinimas)) : ""} h` : `${exame ? escaparHtmlEbd(exame.tipoRotulo) : "Exame"} de ${exame ? escaparHtmlEbd(edcBr(exame.data)) : ""}`;
  alvo.innerHTML = `<h4 id="edcLancamentoTitulo" tabindex="-1">${titulo}</h4>
    <p class="subtitle">${tipo === "reciclagem" ? "Horas com vírgula ou ponto (ex.: 15,5). " : ""}O seu próprio resultado é lançado por outra pessoa da Academia.</p>
    <table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Congregação</th>${tipo === "reciclagem" ? "<th>Horas presentes</th>" : "<th>Justificativa (ausência justificada)</th>"}<th>Resultado</th></tr></thead><tbody>${
    edcPessoasDoLancamento(tipo).map((p) => {
      const r = ja.get(p.membroId) || {};
      const digitado = manter && manter.get(p.membroId);
      const travado = p.membroId === eu ? " disabled" : "";
      const gravado = tipo === "reciclagem" ? (r.horasPresentes == null ? "" : String(r.horasPresentes)) : r.justificativa || "";
      const mostrado = digitado ? String((tipo === "reciclagem" ? digitado.horasPresentes : digitado.justificativa) ?? "") : gravado;
      return `<tr><td>${escaparHtmlEbd(p.nome)}</td><td>${escaparHtmlEbd(p.congregacao) || "-"}</td>${tipo === "reciclagem"
        ? `<td><input type="text" inputmode="decimal" maxlength="6" id="edcHoras_${Number(p.membroId)}" value="${escaparHtmlEbd(mostrado)}" data-original="${escaparHtmlEbd(gravado)}" aria-label="Horas presentes de ${escaparHtmlEbd(p.nome)}"${travado} /></td>`
        : `<td><input type="text" maxlength="300" id="edcJust_${Number(p.membroId)}" value="${escaparHtmlEbd(mostrado)}" data-original="${escaparHtmlEbd(gravado)}" aria-label="Justificativa de ${escaparHtmlEbd(p.nome)}"${travado} /></td>`}
        <td><select id="edcRes_${Number(p.membroId)}" data-original="${escaparHtmlEbd(r.resultado || "")}" aria-label="Resultado de ${escaparHtmlEbd(p.nome)}"${travado}>${opcoes(tipo === "reciclagem" ? edcPainel.resultados : edcPainel.resultadosExame, digitado ? digitado.resultado : r.resultado || "")}</select></td></tr>`;
    }).join("")
  }</tbody></table><button class="btn-confirmar" type="button" data-on-click="edcSalvarLancamentoAcao">Salvar resultados</button><p id="edcMsgLancamento" role="status" aria-live="polite"></p>`;
  const tit = edcEl("edcLancamentoTitulo");
  if (!manter && tit && typeof tit.focus === "function") tit.focus();
}

async function edcSalvarLancamentoAcao() {
  if (!edcLancando || !edcPainel) return;
  if (edcOcupado) { edcMensagem("Aguarde: a gravação anterior ainda está em andamento."); return; }
  const { tipo, id } = edcLancando;
  const itens = [];
  for (const p of edcPessoasDoLancamento(tipo)) {
    const sel = edcEl(`edcRes_${p.membroId}`);
    if (!sel || !sel.value || sel.disabled) continue;
    const campo = edcEl(tipo === "reciclagem" ? `edcHoras_${p.membroId}` : `edcJust_${p.membroId}`);
    if (sel.value === sel.getAttribute("data-original") && campo.value === campo.getAttribute("data-original")) continue;
    if (tipo === "reciclagem") itens.push({ membroId: p.membroId, resultado: sel.value, horasPresentes: campo.value.trim() === "" ? null : campo.value.trim() });
    else itens.push({ membroId: p.membroId, resultado: sel.value, justificativa: campo.value });
  }
  if (!itens.length) { edcMensagem("Nada mudou: escolha ou corrija o resultado de pelo menos uma pessoa."); return; }
  // em lotes, um depois do outro, segurando a vez do primeiro ao último
  edcOcupado = true;
  const resultados = [];
  let parou = null;
  try {
    for (let i = 0; i < itens.length; i += EDC_LOTE) {
      const lote = itens.slice(i, i + EDC_LOTE);
      if (itens.length > EDC_LOTE) edcMensagem(`Gravando… ${i} de ${itens.length}.`);
      const data = await edcPost(tipo === "reciclagem" ? "resultados-reciclagem" : "resultados-exame", tipo === "reciclagem" ? { edicaoId: id, itens: lote } : { exameId: id, itens: lote }, { ocupado: true });
      if (data === null) return;   // outro login, ou sem conexão (a mensagem já saiu)
      if (!Array.isArray(data.resultados)) { parou = data.mensagem || "Não foi possível gravar."; break; }
      resultados.push(...data.resultados);
    }
  } finally {
    edcOcupado = false;
  }
  const falhas = resultados.filter((r) => !r.sucesso);
  const gravados = resultados.length - falhas.length;
  const nomes = new Map((edcPainel ? edcPainel.pessoas || [] : []).map((p) => [p.membroId, p.nome]));
  const texto = [parou, resultados.length ? `${gravados} de ${itens.length} gravado(s).` : "",
    falhas.length ? `Não gravados: ${falhas.map((f) => `${nomes.get(f.membroId) || "linha sem matrícula válida"}: ${f.mensagem}`).join("; ")}` : ""].filter(Boolean).join(" ");
  if (!gravados) { edcMensagem(texto); return; }
  // as linhas recusadas (e as que nem foram) voltam com o que foi digitado
  const enviados = new Set(resultados.filter((r) => r.sucesso).map((r) => r.membroId));
  const manter = new Map(itens.filter((i) => !enviados.has(i.membroId)).map((i) => [i.membroId, i]));
  await edcCarregarPainelAcao();
  if (edcLancando && edcLancando.tipo === tipo && edcLancando.id === id) await edcAbrirLancamento(tipo, id, { manter });   // a tabela reabre com o que ficou gravado
  if (edcPainel) edcMensagem(texto);
}

registrarAcoes({ edcSalvarEdicaoAcao, edcMudouTipoExameAcao, edcSalvarExameAcao, edcLancarReciclagemAcao, edcLancarExameAcao, edcSalvarLancamentoAcao });
