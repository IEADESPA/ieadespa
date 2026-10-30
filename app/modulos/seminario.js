// modulos/seminario.js — v8.7: o Seminário como sistema acadêmico (Regimento Art. 66, 68, 70 §2º e 72). Toda regra mora no servidor (api/shared/seminario.js e
// seminarioDb.js); aqui só se monta a tela.
//  - seção "Seminário" da aba Academia (AFM), só do nível geral: as turmas (abrir, inscrever, a nota e a frequência, encerrar, reabrir), os alunos (a ficha: a matrícula
//    no curso, a conclusão com o diploma, os documentos, o aproveitamento), o currículo (os cursos e as disciplinas) e os requisitos de disciplina;
//  - "Meu histórico escolar" e "Turmas em que leciono" em Minha Formação (Meu Painel) — o docente lança a nota e encerra a própria turma; o histórico no perfil.
// A turma aparece em DOIS lugares (a Academia e Minha Formação — o Reitor é das duas): cada lugar tem o seu estado e os seus ids (prefixo semA/semM), e cada botão leva o
// lugar e a turma — a ação confere que é a turma que está na tela. Toda resposta confere, depois de cada await, se o login ainda é o mesmo (authToken). As ações são
// registradas no fim do arquivo (registrarAcoes mescla).

let semPainel = null;
const semTurmas = { academia: null, minha: null };   // por lugar: { turmaId, alunos, editavel }
let semAlunoId = null;
let semDocenteEmExercicio = false;
let semOcupado = false;
let semPedidoPainel = 0;
const semPedidoTurma = { academia: 0, minha: 0 };
let semPedidoAluno = 0;
let semPedidoPerfil = 0;
let semPedidoMinha = 0;
const SEM_LOTE = 100;
const semEl = (idEl) => document.getElementById(idEl);
const semBr = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const semNum = (n) => (n == null ? "—" : String(n).replace(".", ","));
const SEM_SEM_CONEXAO = "<p class='subtitle'>Sem conexão com o servidor. Tente de novo.</p>";
const SEM_ESTADO = { APROVADA: "✔ aprovada", APROVEITADA: "✔ aproveitada", CURSANDO: "⏳ cursando", PENDENTE: "— pendente" };
const semPre = (lugar) => (lugar === "minha" ? "semM" : "semA");
const semLugar = (l) => (l === "minha" ? "minha" : "academia");
const semEu = () => Number(authMatricula);

async function semBuscar(caminho) {
  const token = authToken;
  let res;
  try { res = await fetchProtegido(`${API_BASE}/${caminho}`); } catch (e) { return authToken === token ? { semConexao: true } : null; }
  const data = await res.json().catch(() => ({ sucesso: false, mensagem: "Resposta inválida do servidor." }));
  return authToken === token ? data : null;
}
// A mensagem sai no topo da seção da Academia ou em Minha Formação; a do ato de turma também logo abaixo da tabela daquele lugar.
function semMensagem(texto, lugar = "academia", { turma = false } = {}) {
  const el = semEl(lugar === "minha" ? "semMsgMinha" : "semMsg");
  if (el) el.textContent = texto;
  const perto = turma ? semEl(`${semPre(lugar)}MsgTurma`) : null;
  if (perto) perto.textContent = texto;
}
async function semPost(acao, corpo, { ocupado = false, lugar = "academia", turma = false } = {}) {
  if (!ocupado) {
    if (semOcupado) { semMensagem("Aguarde: a gravação anterior ainda está em andamento.", lugar, { turma }); return null; }
    semOcupado = true;
  }
  const token = authToken;
  try {
    let res;
    try { res = await fetchProtegido(`${API_BASE}/seminario/${acao}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }); } catch (e) {
      if (authToken === token) semMensagem("Sem conexão com o servidor. Tente de novo.", lugar, { turma });
      return null;
    }
    const data = await res.json().catch(() => ({ sucesso: false, mensagem: "Resposta inválida do servidor." }));
    if (authToken !== token) return null;
    semMensagem(data.mensagem || "", lugar, { turma });
    return data;
  } finally {
    if (!ocupado) semOcupado = false;
  }
}
// O motivo pedido no prompt: de 10 a 300 caracteres (o servidor confere o mesmo). Fora disso, devolve null e diz por quê.
function semMotivo(pergunta, lugar = "academia") {
  const m = prompt(`${pergunta} (de 10 a 300 caracteres):`);
  if (m === null) return null;
  const t = m.trim();
  if (t.length < 10 || t.length > 300) { semMensagem(`O motivo tem de 10 a 300 caracteres (o digitado tem ${t.length}).`, lugar); return null; }
  return t;
}

// Troca de login ou saída: nada da sessão anterior fica na página (nem o que foi digitado nos formulários).
function semLimparTela() {
  semPainel = null; semTurmas.academia = null; semTurmas.minha = null; semAlunoId = null; semDocenteEmExercicio = false;
  semPedidoPainel++; semPedidoTurma.academia++; semPedidoTurma.minha++; semPedidoAluno++; semPedidoPerfil++; semPedidoMinha++;
  for (const idEl of ["semMsg", "semProntos", "semListaTurmas", "semTurmaDetalhe", "semFichaAluno", "semListaCursos", "semListaRequisitos", "semMinha", "semMsgMinha", "semMinhaTurma",
    "semHistoricoPerfil", "semTurmaDisciplina", "semTurmaDocente", "semDiscCurso", "semDiscArea", "semDiscPre", "semReqContexto", "semReqDisciplina"]) { const el = semEl(idEl); if (el) el.innerHTML = ""; }
  for (const idEl of ["semTurmaInicio", "semTurmaFim", "semTurmaLocal", "semAlunoMatricula", "semDiscId", "semDiscNome", "semDiscCarga", "semDiscEmenta", "semReqAlvo"]) { const el = semEl(idEl); if (el) el.value = ""; }
  for (const idEl of ["semDiscObrigatoria", "semDiscAtiva"]) { const el = semEl(idEl); if (el) el.checked = true; }
  const curso = semEl("semDiscCurso");
  if (curso) curso.disabled = false;   // a edição de uma disciplina trava o curso: o próximo login começa com ele livre
  const tit = semEl("semDiscTitulo");
  if (tit) tit.textContent = "Nova disciplina";
  semMostrarParteAcao("turmas");
}

// Trocar de parte não relê nada (o que foi digitado na ficha ou na turma fica).
function semMostrarParteAcao(parte) {
  const atual = ["turmas", "alunos", "curriculo", "requisitos"].includes(parte) ? parte : "turmas";
  for (const p of ["turmas", "alunos", "curriculo", "requisitos"]) {
    const nome = `${p[0].toUpperCase()}${p.slice(1)}`;
    const div = semEl(`semParte${nome}`);
    if (div) div.hidden = p !== atual;
    const btn = semEl(`btnSemParte${nome}`);
    if (btn) { btn.classList.toggle("ativo", p === atual); btn.setAttribute("aria-pressed", p === atual ? "true" : "false"); }
  }
}

// ---- o histórico escolar (a minha, o perfil, a ficha) ----
// `acoes`: a ficha da Academia (os atos — nunca sobre a própria pessoa); `proprio`: a minha (emitir os próprios documentos).
function semHtmlHistorico(h, { acoes = false, proprio = false, membroId = null } = {}) {
  if (!h) return "";
  const atos = acoes && Number(membroId) !== semEu();   // ninguém registra o próprio percurso (o servidor recusa: a tela nem oferece)
  const cursos = (h.cursos || []).map((c) => {
    const disc = (c.disciplinas || []).map((d) => `<li>${escaparHtmlEbd(d.nome)}${d.obrigatoria ? "" : " <em>(optativa)</em>"} — ${escaparHtmlEbd(semNum(d.cargaHoraria))} h: ${escaparHtmlEbd(SEM_ESTADO[d.estado] || d.estado)}</li>`).join("");
    const botoes = [];
    if (atos && c.situacao === "CURSANDO" && c.prontoParaConcluir) botoes.push(`<button class="btn-link" data-on-click="semConcluirAcao" data-args-click="${argsAttr(Number(c.cursoMatriculaId))}">🎓 Registrar a conclusão</button>`);
    if (atos && c.situacao === "CURSANDO") botoes.push(`<button class="btn-link" data-on-click="semCancelarCursoAcao" data-args-click="${argsAttr(Number(c.cursoMatriculaId))}">Cancelar a matrícula</button>`);
    if (atos && c.situacao === "CONCLUIDO") botoes.push(`<button class="btn-link" data-on-click="semAnularConclusaoAcao" data-args-click="${argsAttr(Number(c.cursoMatriculaId))}">Anular a conclusão</button>`);
    if ((acoes || proprio) && c.situacao === "CURSANDO") botoes.push(`<button class="btn-link" data-on-click="semEmitirDocumentoAcao" data-args-click="${argsAttr("DECLARACAO", Number(c.cursoMatriculaId), proprio ? null : Number(membroId))}">📄 Declaração de matrícula</button>`);
    if ((acoes || proprio) && c.diploma && c.diploma.certificadoId) botoes.push(`<button class="btn-link" data-on-click="baixarPdfCertificado" data-args-click="${argsAttr(Number(c.diploma.certificadoId))}">📄 Diploma</button>`);
    return `<div class="cartao-perfil"><p><strong>${escaparHtmlEbd(c.curso)}</strong> — ${escaparHtmlEbd(c.situacaoRotulo)} (desde ${escaparHtmlEbd(semBr(c.dataInicio))}${c.dataConclusao
      ? `; concluído em ${escaparHtmlEbd(semBr(c.dataConclusao))}` : ""}${c.canceladaEm ? `; cancelada em ${escaparHtmlEbd(semBr(c.canceladaEm))}` : ""}) · carga cumprida ${escaparHtmlEbd(semNum(c.cargaCumprida))} h de ${escaparHtmlEbd(semNum(c.cargaObrigatoria))} h obrigatórias${
      c.diploma && c.diploma.codigo ? ` · <a href="verificar.html?c=${escaparHtmlEbd(encodeURIComponent(c.diploma.codigo))}" target="_blank" rel="noopener">diploma ${escaparHtmlEbd(c.diploma.codigo)}</a>` : ""}</p>
      ${c.situacao === "CURSANDO" && c.faltam && c.faltam.length ? `<p class="subtitle">Faltam: ${c.faltam.map((x) => escaparHtmlEbd(x)).join(", ")}.</p>` : ""}
      ${disc ? `<ul>${disc}</ul>` : ""}${botoes.length ? `<div class="barra-lista">${botoes.join(" ")}</div>` : ""}</div>`;
  }).join("");
  const turmas = (h.turmas || []).length ? `<table class="tabela-frequencia"><thead><tr><th>Disciplina</th><th>Curso</th><th>Período</th><th>Docente</th><th>Nota</th><th>Freq.</th><th>Resultado</th></tr></thead><tbody>${
    h.turmas.map((t) => `<tr><td>${escaparHtmlEbd(t.disciplina)}</td><td>${escaparHtmlEbd(t.curso)}</td><td>${escaparHtmlEbd(semBr(t.dataInicio))} a ${escaparHtmlEbd(semBr(t.dataFim))}</td><td>${escaparHtmlEbd(t.docente)}</td>
      <td>${escaparHtmlEbd(semNum(t.nota))}</td><td>${t.frequenciaPct == null ? "—" : `${Number(t.frequenciaPct)}%`}</td><td>${t.situacao === "CANCELADO" ? "inscrição cancelada" : t.turmaSituacao === "ABERTA" ? "cursando" : escaparHtmlEbd(t.resultadoRotulo || "—")}</td></tr>`).join("")
  }</tbody></table>` : "";
  const apr = (h.aproveitamentos || []).length ? `<h5>Aproveitamentos</h5><ul>${h.aproveitamentos.map((a) => `<li>${escaparHtmlEbd(a.disciplina)} (${escaparHtmlEbd(a.curso)}) ← ${escaparHtmlEbd(a.disciplinaOrigem)}, ${escaparHtmlEbd(a.instituicao)} (${Number(a.anoOrigem)}, ${escaparHtmlEbd(semNum(a.cargaHorariaOrigem))} h): <strong>${escaparHtmlEbd(a.decisaoRotulo)}</strong>${a.anulado ? " — anulado" : ""} · parecer de ${escaparHtmlEbd(a.parecerista)} em ${escaparHtmlEbd(semBr(a.dataParecer))}${
    a.parecer ? `<br><em>${escaparHtmlEbd(a.parecer)}</em>` : ""}${atos && !a.anulado ? ` <button class="btn-link" data-on-click="semAnularAproveitamentoAcao" data-args-click="${argsAttr(Number(a.aproveitamentoId))}">Anular</button>` : ""}</li>`).join("")}</ul>` : "";
  const docs = (h.documentos || []).length ? `<h5>Documentos emitidos</h5><ul>${h.documentos.slice(0, 20).map((d) => `<li>${escaparHtmlEbd(d.rotulo)} de ${escaparHtmlEbd(semBr(d.emitidoEm))}${d.validoAte ? ` (vale até ${escaparHtmlEbd(semBr(d.validoAte))})` : ""}${d.revogado ? " — revogado" : ""}
    ${(acoes || proprio) ? ` <button class="btn-link" data-on-click="baixarPdfCertificado" data-args-click="${argsAttr(Number(d.certificadoId))}" aria-label="Baixar ${escaparHtmlEbd(d.rotulo)}">📄</button>` : ""}</li>`).join("")}</ul>` : "";
  const emitir = (acoes || proprio) && semTemAlgo(h)
    ? `<div class="barra-lista"><button class="btn-link" data-on-click="semEmitirDocumentoAcao" data-args-click="${argsAttr("HISTORICO", null, proprio ? null : Number(membroId))}">📄 Emitir o histórico escolar</button></div>` : "";
  return `${cursos || "<p class='subtitle'>Sem matrícula em curso da Academia.</p>"}${turmas}${apr}${docs}${emitir}`;
}
function semTemAlgo(h) { return !!(h && ((h.cursos || []).length || (h.turmas || []).length || (h.aproveitamentos || []).length)); }

async function semCarregarMinha() {
  const alvo = semEl("semMinha");
  if (!alvo) return;
  const pedido = ++semPedidoMinha;
  const data = await semBuscar("seminario/minha");
  if (data === null || pedido !== semPedidoMinha) return;
  if (data.semConexao || !data.sucesso) { alvo.innerHTML = ""; return; }
  const partes = [];
  if (semTemAlgo(data)) partes.push(`<h4>🏛️ Meu histórico escolar (AFM)</h4>${semHtmlHistorico(data, { proprio: true })}`);
  const doc = data.docencia || { turmas: [] };
  semDocenteEmExercicio = !!doc.emExercicio;
  if (doc.turmas.length) {
    partes.push(`<h4>🧑‍🏫 Turmas em que leciono</h4>${doc.emExercicio ? "" : "<p class='subtitle'>Você não está mais em exercício no Corpo Docente: as notas agora são lançadas pela Academia.</p>"}
      <table class="tabela-frequencia"><thead><tr><th>Disciplina</th><th>Curso</th><th>Período</th><th>Situação</th><th>Lançadas</th><th></th></tr></thead><tbody>${doc.turmas.map((t) => `<tr><td>${escaparHtmlEbd(t.disciplina)}</td><td>${escaparHtmlEbd(t.curso)}</td>
      <td>${escaparHtmlEbd(semBr(t.dataInicio))} a ${escaparHtmlEbd(semBr(t.dataFim))}</td><td>${t.situacao === "ABERTA" ? "aberta" : `encerrada em ${escaparHtmlEbd(semBr(t.encerradaEm))}`}</td><td>${Number(t.lancados)} / ${Number(t.inscritos)}</td>
      <td><button class="btn-link" data-on-click="semAbrirTurmaMinhaAcao" data-args-click="${argsAttr(Number(t.turmaId))}">Abrir</button></td></tr>`).join("")}</tbody></table>`);
  }
  alvo.innerHTML = partes.join("");
}

async function semCarregarPessoa(membroId) {
  const alvo = semEl("semHistoricoPerfil");
  if (!alvo || !membroId) return;
  const pedido = ++semPedidoPerfil;
  alvo.innerHTML = "";
  const data = await semBuscar(`seminario/pessoa?membroId=${encodeURIComponent(membroId)}`);
  if (data === null || pedido !== semPedidoPerfil || String(window._membroPerfilAtual) !== String(membroId)) return;
  alvo.innerHTML = data.semConexao ? SEM_SEM_CONEXAO : data.sucesso && semTemAlgo(data) ? `<h4>🏛️ Histórico escolar (AFM)</h4>${semHtmlHistorico(data)}` : "";
}

// ---- a seção da Academia (nível geral) ----
// Relê o painel (as listas e os seletores). Não relê a turma aberta nem a ficha: o que está digitado nelas fica.
async function semCarregarPainelAcao() {
  const lista = semEl("semListaTurmas");
  const pedido = ++semPedidoPainel;
  if (!semPainel) lista.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const data = await semBuscar("seminario/painel");
  if (data === null || pedido !== semPedidoPainel) return;
  if (data.semConexao) { lista.innerHTML = SEM_SEM_CONEXAO; return; }
  if (!data.sucesso) { lista.innerHTML = `<p class='subtitle'>${escaparHtmlEbd(data.mensagem || "Não foi possível carregar.")}</p>`; return; }
  semPainel = data;
  const opcao = (v, t) => `<option value="${escaparHtmlEbd(String(v))}">${escaparHtmlEbd(t)}</option>`;
  const todas = data.cursos.flatMap((c) => c.disciplinas.map((d) => ({ ...d, cursoNome: c.nivelRotulo })));
  const manterSel = (idEl, html) => { const el = semEl(idEl); const antes = el.value; el.innerHTML = html; if ([...el.options].some((o) => o.value === antes)) el.value = antes; };
  manterSel("semTurmaDisciplina", `<option value="">(escolha)</option>${todas.filter((d) => d.ativa).map((d) => opcao(d.disciplinaId, `${d.nome} — ${d.cursoNome}`)).join("")}`);
  manterSel("semTurmaDocente", `<option value="">(escolha)</option>${data.docentes.map((d) => opcao(d.membroId, `${d.nome}${d.reitor ? " (Reitor)" : ""}`)).join("")}`);
  manterSel("semDiscCurso", data.cursos.map((c) => opcao(c.cursoId, c.nome)).join(""));
  manterSel("semDiscArea", Object.entries(data.areas).map(([k, v]) => opcao(k, v)).join(""));
  manterSel("semReqContexto", Object.entries(data.contextos).map(([k, v]) => opcao(k, v)).join(""));
  manterSel("semReqDisciplina", `<option value="">(escolha)</option>${todas.filter((d) => d.ativa).map((d) => opcao(d.disciplinaId, `${d.nome} — ${d.cursoNome}`)).join("")}`);
  semPreencherPre();
  semEl("semProntos").innerHTML = data.prontos.length ? `<p><strong>Prontos para concluir (${data.prontos.length})</strong> — todas as obrigatórias cumpridas:</p><ul>${data.prontos.map((p) => `<li>${escaparHtmlEbd(p.nome)} — ${escaparHtmlEbd(p.curso)} (${escaparHtmlEbd(semNum(p.cargaCumprida))} h)
    ${Number(p.membroId) === semEu() ? "" : `<button class="btn-link" data-on-click="semConcluirAcao" data-args-click="${argsAttr(Number(p.cursoMatriculaId))}">🎓 Registrar a conclusão</button>`}</li>`).join("")}</ul>` : "";
  lista.innerHTML = data.turmas.length ? `<table class="tabela-frequencia"><thead><tr><th>Disciplina</th><th>Curso</th><th>Docente</th><th>Período</th><th>Situação</th><th>Lançadas</th><th></th></tr></thead><tbody>${
    data.turmas.map((t) => `<tr><td>${escaparHtmlEbd(t.disciplina)}</td><td>${escaparHtmlEbd(t.curso)}</td><td>${escaparHtmlEbd(t.docente)}</td><td>${escaparHtmlEbd(semBr(t.dataInicio))} a ${escaparHtmlEbd(semBr(t.dataFim))}</td>
      <td>${t.situacao === "ABERTA" ? "aberta" : `encerrada em ${escaparHtmlEbd(semBr(t.encerradaEm))}`}</td><td>${Number(t.lancados)} / ${Number(t.inscritos)}</td>
      <td><button class="btn-link" data-on-click="semAbrirTurmaAcao" data-args-click="${argsAttr(Number(t.turmaId))}" aria-label="Abrir a turma de ${escaparHtmlEbd(t.disciplina)}">Abrir</button></td></tr>`).join("")
  }</tbody></table>` : "<p class='subtitle'>Nenhuma turma ainda. Cadastre as disciplinas em Currículo e abra a primeira turma acima.</p>";
  semEl("semListaCursos").innerHTML = data.cursos.map((c) => `<div class="cartao-perfil"><p><strong>${escaparHtmlEbd(c.nome)}</strong> (${escaparHtmlEbd(c.nivelRotulo)}) — aprova com nota ${escaparHtmlEbd(semNum(c.notaMinima))} e
    ${Number(c.frequenciaMinimaPct)}% de frequência · ${Number(c.cursando)} cursando, ${Number(c.concluidos)} concluído(s)
    <button class="btn-link" data-on-click="semEditarCursoAcao" data-args-click="${argsAttr(Number(c.cursoId))}">Mudar a regra</button></p>
    ${c.lacunasGovernanca.length ? `<p class="subtitle">⚠️ Faltam obrigatórias de ${c.lacunasGovernanca.map((x) => escaparHtmlEbd(x)).join(", ")} (Regimento, Art. 70 §2º).</p>` : ""}
    ${c.disciplinas.length ? `<ul>${c.disciplinas.map((d) => `<li>${escaparHtmlEbd(d.nome)} — ${escaparHtmlEbd(d.areaRotulo)}, ${escaparHtmlEbd(semNum(d.cargaHoraria))} h${d.obrigatoria ? "" : " (optativa)"}${d.ativa ? "" : " — desativada"}${
      d.preRequisitos.length ? ` · exige ${d.preRequisitos.map((id) => escaparHtmlEbd((todas.find((x) => x.disciplinaId === id) || {}).nome || "?")).join(", ")}` : ""}
      <button class="btn-link" data-on-click="semEditarDisciplinaAcao" data-args-click="${argsAttr(Number(d.disciplinaId))}" aria-label="Editar ${escaparHtmlEbd(d.nome)}">Editar</button></li>`).join("")}</ul>` : "<p class='subtitle'>Nenhuma disciplina.</p>"}</div>`).join("");
  semEl("semListaRequisitos").innerHTML = data.requisitos.length ? `<table class="tabela-frequencia"><thead><tr><th>Fluxo</th><th>Alvo</th><th>Disciplina</th><th>Modo</th><th></th></tr></thead><tbody>${
    data.requisitos.map((r) => `<tr><td>${escaparHtmlEbd(data.contextos[r.contexto] || r.contexto)}</td><td>${escaparHtmlEbd(r.alvoChave) || "(todo o fluxo)"}</td><td>${escaparHtmlEbd(r.disciplinaNome)}</td>
      <td>${r.modo === "BLOQUEIA" ? "bloqueia" : "só alerta"}</td><td><button class="btn-link" data-on-click="semRemoverRequisitoAcao" data-args-click="${argsAttr(Number(r.requisitoId))}">Remover</button></td></tr>`).join("")
  }</tbody></table>` : "<p class='subtitle'>Nenhuma disciplina exigida em fluxo nenhum.</p>";
}

function semPreencherPre() {
  if (!semPainel) return;
  const proprio = Number(semEl("semDiscId").value) || null;
  const marcados = new Set([...semEl("semDiscPre").selectedOptions].map((o) => Number(o.value)));
  semEl("semDiscPre").innerHTML = semPainel.cursos.flatMap((c) => c.disciplinas.filter((d) => d.disciplinaId !== proprio).map((d) =>
    `<option value="${Number(d.disciplinaId)}"${marcados.has(d.disciplinaId) ? " selected" : ""}>${escaparHtmlEbd(d.nome)} — ${escaparHtmlEbd(c.nivelRotulo)}</option>`)).join("");
}

// ---- a turma (a Academia ou o docente) ----
async function semAbrirTurmaAcao(turmaId) { await semAbrirTurma(Number(turmaId), "academia"); }
async function semAbrirTurmaMinhaAcao(turmaId) { await semAbrirTurma(Number(turmaId), "minha"); }

// `manter`: as linhas que o servidor recusou voltam com o que foi digitado (Map membroId -> item enviado). `foco`: só quando a pessoa abre (não na releitura).
async function semAbrirTurma(turmaId, lugar, { manter = null, foco = true } = {}) {
  const alvo = semEl(lugar === "minha" ? "semMinhaTurma" : "semTurmaDetalhe");
  if (!alvo) return;
  const p = semPre(lugar);
  const pedido = ++semPedidoTurma[lugar];
  semTurmas[lugar] = { turmaId, alunos: [], editavel: false };
  alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const data = await semBuscar(`seminario/turma?turmaId=${encodeURIComponent(turmaId)}`);
  if (data === null || pedido !== semPedidoTurma[lugar]) return;
  if (data.semConexao || !data.sucesso) { alvo.innerHTML = data.semConexao ? SEM_SEM_CONEXAO : `<p class='subtitle'>${escaparHtmlEbd(data.mensagem || "Não foi possível carregar.")}</p>`; return; }
  const t = data.turma;
  const geral = lugar === "academia";
  const aberta = t.situacao === "ABERTA";
  const editavel = aberta && (geral || semDocenteEmExercicio);   // o docente que saiu do Corpo Docente só vê
  semTurmas[lugar] = { turmaId, alunos: t.alunos, editavel };
  const eu = semEu();
  const inscritos = t.alunos.filter((a) => a.situacao === "INSCRITO");
  const linhas = t.alunos.map((a) => {
    const d = manter && manter.get(a.membroId);
    const pode = editavel && a.situacao === "INSCRITO" && a.membroId !== eu;
    const nota = a.nota == null ? "" : semNum(a.nota);
    const horas = a.horasPresentes == null ? "" : semNum(a.horasPresentes);
    return `<tr><td>${escaparHtmlEbd(a.nome)}</td><td>${escaparHtmlEbd(a.congregacao) || "-"}</td>${a.situacao === "CANCELADO" ? `<td colspan="3">inscrição cancelada: ${escaparHtmlEbd(a.motivoCancelamento || "")}</td><td></td>` : `
      <td><input type="text" inputmode="decimal" maxlength="5" id="${p}Nota_${Number(a.membroId)}" value="${escaparHtmlEbd(d ? String(d.nota ?? "") : nota)}" data-original="${escaparHtmlEbd(nota)}" aria-label="Nota de ${escaparHtmlEbd(a.nome)}"${pode ? "" : " disabled"} /></td>
      <td><input type="text" inputmode="decimal" maxlength="6" id="${p}Horas_${Number(a.membroId)}" value="${escaparHtmlEbd(d ? String(d.horasPresentes ?? "") : horas)}" data-original="${escaparHtmlEbd(horas)}" aria-label="Horas presentes de ${escaparHtmlEbd(a.nome)}"${pode ? "" : " disabled"} /></td>
      <td>${escaparHtmlEbd(a.resultadoRotulo || "—")}</td>
      <td>${geral && aberta ? `<button class="btn-link" data-on-click="semCancelarInscricaoAcao" data-args-click="${argsAttr(lugar, Number(turmaId), Number(a.membroId))}" aria-label="Cancelar a inscrição de ${escaparHtmlEbd(a.nome)}">Cancelar</button>` : ""}</td>`}</tr>`;
  }).join("");
  const botoes = [];
  if (editavel && inscritos.length) botoes.push(`<button class="btn-confirmar" type="button" data-on-click="semSalvarNotasAcao" data-args-click="${argsAttr(lugar, Number(turmaId))}">Salvar as notas</button>`, `<button class="btn-link" type="button" data-on-click="semEncerrarAcao" data-args-click="${argsAttr(lugar, Number(turmaId))}">Encerrar a turma</button>`);
  if (geral && !aberta) botoes.push(`<button class="btn-link" type="button" data-on-click="semReabrirAcao" data-args-click="${argsAttr(lugar, Number(turmaId))}">Reabrir (com o motivo)</button>`);
  if (geral && aberta && !inscritos.length) botoes.push(`<button class="btn-link" type="button" data-on-click="semExcluirTurmaAcao" data-args-click="${argsAttr(lugar, Number(turmaId))}">Excluir a turma</button>`);
  alvo.innerHTML = `<h4 id="${p}TurmaTitulo" tabindex="-1">${escaparHtmlEbd(t.disciplina)} — ${escaparHtmlEbd(t.curso)} (${escaparHtmlEbd(semBr(t.dataInicio))} a ${escaparHtmlEbd(semBr(t.dataFim))})</h4>
    <p class="subtitle">Docente: ${escaparHtmlEbd(t.docente)}${t.local ? ` · ${escaparHtmlEbd(t.local)}` : ""} · ${escaparHtmlEbd(semNum(t.cargaHoraria))} h · aprova com nota ${escaparHtmlEbd(semNum(t.notaMinima))} e ${escaparHtmlEbd(semNum(t.horasMinimas))} h de presença
      (${Number(t.frequenciaMinimaPct)}%) · ${aberta ? "aberta: as notas ainda não valem no histórico" : `encerrada em ${escaparHtmlEbd(semBr(t.encerradaEm))}`}. Nota e horas com vírgula ou ponto (ex.: 7,5). A sua própria nota é lançada por outra pessoa.</p>
    ${geral && aberta ? `<div class="cons-painel"><div class="input-group"><label for="${p}Inscrever">Inscrever (matrículas separadas por vírgula):</label><input type="text" id="${p}Inscrever" maxlength="2000" /></div>
      <button class="btn-confirmar" type="button" data-on-click="semInscreverAcao" data-args-click="${argsAttr(lugar, Number(turmaId))}">Inscrever</button></div>` : ""}
    ${t.alunos.length ? `<table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Congregação</th><th>Nota</th><th>Horas presentes</th><th>Resultado</th><th></th></tr></thead><tbody>${linhas}</tbody></table>` : "<p class='subtitle'>Nenhum aluno inscrito.</p>"}
    ${botoes.length ? `<div class="barra-lista">${botoes.join(" ")}</div>` : ""}<p id="${p}MsgTurma" role="status" aria-live="polite"></p>`;
  const tit = semEl(`${p}TurmaTitulo`);
  if (foco && !manter && tit && typeof tit.focus === "function") tit.focus();
}

// A turma do botão precisa ser a que está na tela daquele lugar (a outra pode ter sido aberta no meio).
function semTurmaDoBotao(lugar, turmaId) {
  const st = semTurmas[semLugar(lugar)];
  if (!st || st.turmaId !== Number(turmaId)) { semMensagem("A turma mudou na tela: abra-a de novo.", semLugar(lugar)); return null; }
  return st;
}
// Depois de um ato: relê a lista do lugar e a turma — se ela ainda for a mesma na tela (com o que a pessoa digitou e o servidor recusou).
async function semRecarregarTurma(lugar, turmaId, manter = null) {
  if (lugar === "academia") await semCarregarPainelAcao(); else await semCarregarMinha();
  const st = semTurmas[lugar];
  if (st && st.turmaId === turmaId) await semAbrirTurma(turmaId, lugar, { manter, foco: false });
}
const semCampos = (lugar, a) => [semEl(`${semPre(lugar)}Nota_${a.membroId}`), semEl(`${semPre(lugar)}Horas_${a.membroId}`)];
const semMexidas = (lugar, st) => st.alunos.filter((a) => {
  const [n, h] = semCampos(lugar, a);
  return n && h && !n.disabled && (n.value !== n.getAttribute("data-original") || h.value !== h.getAttribute("data-original"));
});

async function semSalvarNotasAcao(lugarBruto, turmaId) {
  const lugar = semLugar(lugarBruto);
  const st = semTurmaDoBotao(lugar, turmaId);
  if (!st) return;
  if (semOcupado) { semMensagem("Aguarde: a gravação anterior ainda está em andamento.", lugar, { turma: true }); return; }
  const token = authToken;
  const itens = [];
  for (const a of semMexidas(lugar, st)) {
    const [n, h] = semCampos(lugar, a);
    if (!n.value.trim() && !h.value.trim()) continue;
    itens.push({ membroId: a.membroId, nota: n.value.trim(), horasPresentes: h.value.trim() });
  }
  if (!itens.length) { semMensagem("Nada mudou: lance ou corrija a nota de pelo menos um aluno.", lugar, { turma: true }); return; }
  const nomes = new Map(st.alunos.map((a) => [a.membroId, a.nome]));
  semOcupado = true;
  const resultados = [];
  let parou = null;
  try {
    for (let i = 0; i < itens.length; i += SEM_LOTE) {
      if (itens.length > SEM_LOTE) semMensagem(`Gravando… ${i} de ${itens.length}.`, lugar, { turma: true });
      const data = await semPost("notas", { turmaId: st.turmaId, itens: itens.slice(i, i + SEM_LOTE) }, { ocupado: true, lugar, turma: true });
      if (data === null) return;
      if (!Array.isArray(data.resultados)) { parou = data.mensagem || "Não foi possível gravar."; break; }
      resultados.push(...data.resultados);
    }
  } finally {
    semOcupado = false;
  }
  const falhas = resultados.filter((r) => !r.sucesso);
  const texto = [parou, resultados.length ? `${resultados.length - falhas.length} de ${itens.length} gravada(s).` : "",
    falhas.length ? `Não gravadas: ${falhas.map((f) => `${nomes.get(f.membroId) || "linha inválida"}: ${f.mensagem}`).join("; ")}` : ""].filter(Boolean).join(" ");
  if (resultados.length === falhas.length) { semMensagem(texto, lugar, { turma: true }); return; }
  const gravados = new Set(resultados.filter((r) => r.sucesso).map((r) => r.membroId));
  await semRecarregarTurma(lugar, st.turmaId, new Map(itens.filter((i) => !gravados.has(i.membroId)).map((i) => [i.membroId, i])));
  if (authToken === token) semMensagem(texto, lugar, { turma: true });
}

async function semEncerrarAcao(lugarBruto, turmaId) {
  const lugar = semLugar(lugarBruto);
  const st = semTurmaDoBotao(lugar, turmaId);
  if (!st) return;
  // a correção digitada e não salva não pode ficar de fora do encerramento
  if (semMexidas(lugar, st).length) { semMensagem("Há nota digitada e não salva: salve as notas antes de encerrar.", lugar, { turma: true }); return; }
  if (!confirm("Encerrar a turma? As notas passam a valer no histórico; depois, só a Academia reabre (com o motivo).")) return;
  await semAtoDeTurma(lugar, st.turmaId, "encerrar", {});
}
async function semReabrirAcao(lugarBruto, turmaId) {
  const lugar = semLugar(lugarBruto);
  const st = semTurmaDoBotao(lugar, turmaId);
  if (!st) return;
  const motivo = semMotivo("Por que reabrir a turma?", lugar);
  if (!motivo) return;   // cancelado, ou fora do tamanho (semMotivo já disse por quê)
  await semAtoDeTurma(lugar, st.turmaId, "reabrir", { motivo });
}
async function semCancelarInscricaoAcao(lugarBruto, turmaId, membroId) {
  const lugar = semLugar(lugarBruto);
  const st = semTurmaDoBotao(lugar, turmaId);
  if (!st) return;
  const motivo = semMotivo("Motivo do cancelamento da inscrição", lugar);
  if (!motivo) return;
  await semAtoDeTurma(lugar, st.turmaId, "cancelar-inscricao", { membroId: Number(membroId), motivo });
}
async function semAtoDeTurma(lugar, turmaId, acao, corpo) {
  const token = authToken;
  const data = await semPost(acao, { turmaId, ...corpo }, { lugar, turma: true });
  if (!data || !data.sucesso) return;
  await semRecarregarTurma(lugar, turmaId);
  if (authToken === token) semMensagem(data.mensagem, lugar, { turma: true });
}
async function semExcluirTurmaAcao(lugarBruto, turmaId) {
  const lugar = semLugar(lugarBruto);
  const st = semTurmaDoBotao(lugar, turmaId);
  if (!st || !confirm("Excluir esta turma (sem alunos)?")) return;
  const token = authToken;
  const data = await semPost("excluir-turma", { turmaId: st.turmaId }, { lugar });
  if (!data || !data.sucesso) return;
  if (semTurmas[lugar] && semTurmas[lugar].turmaId === st.turmaId) { semTurmas[lugar] = null; semEl("semTurmaDetalhe").innerHTML = ""; }
  await semCarregarPainelAcao();
  if (authToken === token) semMensagem(data.mensagem, lugar);
}
const SEM_MATRICULA = /^\d{1,10}$/;
async function semInscreverAcao(lugarBruto, turmaId) {
  const lugar = semLugar(lugarBruto);
  const st = semTurmaDoBotao(lugar, turmaId);
  if (!st) return;
  const campo = semEl(`${semPre(lugar)}Inscrever`);
  const partes = campo.value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const invalidas = partes.filter((x) => !SEM_MATRICULA.test(x) || Number(x) <= 0);
  if (invalidas.length) { semMensagem(`Matrícula inválida (só números): ${invalidas.join(", ")}.`, lugar, { turma: true }); return; }
  const membroIds = [...new Set(partes.map((x) => String(Number(x))))];   // "007" é a matrícula 7
  if (!membroIds.length) { semMensagem("Informe as matrículas a inscrever.", lugar, { turma: true }); return; }
  const token = authToken;
  const data = await semPost("inscrever", { turmaId: st.turmaId, membroIds }, { lugar, turma: true });
  if (!data || !Array.isArray(data.resultados)) return;
  const falhas = data.resultados.filter((r) => !r.sucesso);
  const texto = `${data.mensagem}${falhas.length ? ` ${falhas.map((f) => `${f.membroId || "?"}: ${f.mensagem}`).join("; ")}` : ""}`;
  await semRecarregarTurma(lugar, st.turmaId);
  if (authToken !== token) return;
  const novo = semEl(`${semPre(lugar)}Inscrever`);
  if (novo) novo.value = falhas.map((f) => f.membroId).filter(Boolean).join(", ");   // as que não passaram ficam no campo
  semMensagem(texto, lugar, { turma: true });
}

async function semAbrirTurmaNovaAcao() {
  const token = authToken;
  const data = await semPost("turma", { disciplinaId: Number(semEl("semTurmaDisciplina").value) || null, docenteMembroId: Number(semEl("semTurmaDocente").value) || null,
    dataInicio: semEl("semTurmaInicio").value, dataFim: semEl("semTurmaFim").value, local: semEl("semTurmaLocal").value });
  if (!data || !data.sucesso) return;
  for (const idEl of ["semTurmaInicio", "semTurmaFim", "semTurmaLocal"]) semEl(idEl).value = "";
  await semCarregarPainelAcao();
  if (authToken !== token) return;
  await semAbrirTurma(Number(data.turmaId), "academia");
  if (authToken === token) semMensagem(data.mensagem);
}

// ---- a ficha do aluno ----
async function semBuscarAlunoAcao() {
  const m = semEl("semAlunoMatricula").value.trim();
  if (!SEM_MATRICULA.test(m) || Number(m) <= 0) { semMensagem("Informe a matrícula (só números)."); return; }
  await semCarregarAluno(Number(m));
}
// `soHistorico`: depois de um ato, só o bloco do histórico é redesenhado (o formulário de matrícula e o de aproveitamento ficam como estavam).
async function semCarregarAluno(membroId, { soHistorico = false } = {}) {
  const alvo = semEl("semFichaAluno");
  const pedido = ++semPedidoAluno;
  const token = authToken;
  semAlunoId = membroId;
  if (!soHistorico) alvo.innerHTML = "<p class='subtitle'>Carregando…</p>";
  if (!semPainel) { await semCarregarPainelAcao(); if (authToken !== token || pedido !== semPedidoAluno) return; }   // os seletores da ficha vêm do painel
  const data = await semBuscar(`seminario/aluno?membroId=${encodeURIComponent(membroId)}`);
  if (data === null || pedido !== semPedidoAluno) return;
  if (data.semConexao || !data.sucesso) { alvo.innerHTML = data.semConexao ? SEM_SEM_CONEXAO : `<p class='subtitle'>${escaparHtmlEbd(data.mensagem || "Não encontrado.")}</p>`; return; }
  const hist = semEl("semFichaHistorico");
  if (soHistorico && hist) { hist.innerHTML = semHtmlHistorico(data, { acoes: true, membroId: data.membroId }); return; }
  const propria = Number(data.membroId) === semEu();
  const cursos = semPainel ? semPainel.cursos : [];
  const docentes = semPainel ? semPainel.docentes : [];
  const todas = cursos.flatMap((c) => c.disciplinas.filter((d) => d.ativa).map((d) => ({ ...d, cursoNome: c.nivelRotulo })));
  const opc = (v, t) => `<option value="${escaparHtmlEbd(String(v))}">${escaparHtmlEbd(t)}</option>`;
  alvo.innerHTML = `<h4 id="semAlunoTitulo" tabindex="-1">${escaparHtmlEbd(data.nome || "")} (matrícula ${Number(data.membroId)})</h4>
    <p class="subtitle">${data.matriculaAFMAtiva ? "Matrícula ativa na AFM." : "⚠️ Sem matrícula ativa na AFM: matricule como candidato em Escada e veto antes de matricular num curso."}</p>
    <div id="semFichaHistorico">${semHtmlHistorico(data, { acoes: true, membroId: data.membroId })}</div>
    ${propria ? "<p class='subtitle'>É a sua própria ficha: a matrícula, a conclusão e o aproveitamento são registrados por outra pessoa da Academia.</p>" : `<h5>Matricular num curso</h5>
    <div class="cons-painel"><div class="input-group"><label for="semAlunoCurso">Curso:</label><select id="semAlunoCurso">${cursos.map((c) => opc(c.cursoId, c.nome)).join("")}</select></div>
      <div class="input-group"><label for="semAlunoCursoData">Data:</label><input type="date" id="semAlunoCursoData" /></div>
      <button class="btn-confirmar" type="button" data-on-click="semMatricularCursoAcao">Matricular</button></div>
    <h5>Aproveitamento de disciplina cursada em outra instituição</h5>
    <div class="cons-painel">
      <div class="input-group"><label for="semAprDisciplina">Disciplina da Academia:</label><select id="semAprDisciplina"><option value="">(escolha)</option>${todas.map((d) => opc(d.disciplinaId, `${d.nome} — ${d.cursoNome}`)).join("")}</select></div>
      <div class="input-group"><label for="semAprInstituicao">Instituição de origem:</label><input type="text" id="semAprInstituicao" maxlength="150" /></div>
      <div class="input-group"><label for="semAprDisciplinaOrigem">Disciplina cursada lá:</label><input type="text" id="semAprDisciplinaOrigem" maxlength="150" /></div>
      <div class="input-group"><label for="semAprCarga">Carga horária lá (h):</label><input type="text" inputmode="decimal" maxlength="6" id="semAprCarga" /></div>
      <div class="input-group"><label for="semAprAno">Ano:</label><input type="number" id="semAprAno" min="1950" max="2100" /></div>
      <div class="input-group"><label for="semAprNota">Nota de origem (como veio):</label><input type="text" id="semAprNota" maxlength="20" /></div>
      <div class="input-group"><label for="semAprDecisao">Decisão:</label><select id="semAprDecisao"><option value="DEFERIDO">Deferido</option><option value="INDEFERIDO">Indeferido</option></select></div>
      <div class="input-group"><label for="semAprParecerista">Parecer de (Reitor ou docente):</label><select id="semAprParecerista"><option value="">(escolha)</option>${docentes.map((d) => opc(d.membroId, `${d.nome}${d.reitor ? " (Reitor)" : ""}`)).join("")}</select></div>
      <div class="input-group"><label for="semAprData">Data do parecer:</label><input type="date" id="semAprData" /></div>
      <div class="input-group"><label for="semAprParecer">Parecer (por que equivale, ou não):</label><textarea id="semAprParecer" maxlength="600" rows="3"></textarea></div>
      <label class="afm-check"><input type="checkbox" id="semAprDocumento" /> conferi o documento da instituição de origem (histórico ou declaração)</label>
      <button class="btn-confirmar" type="button" data-on-click="semRegistrarAproveitamentoAcao">Registrar o aproveitamento</button>
    </div>`}`;
  const tit = semEl("semAlunoTitulo");
  if (tit && typeof tit.focus === "function") tit.focus();
}
// Depois de um ato na ficha: o histórico dela e o painel (a lista de prontos), e a mensagem — se o login ainda for o mesmo.
async function semDepoisDoAto(data, token, { limparAproveitamento = false } = {}) {
  if (semAlunoId) await semCarregarAluno(semAlunoId, { soHistorico: true });
  if (authToken !== token) return;
  await semCarregarPainelAcao();
  if (authToken !== token) return;
  if (limparAproveitamento) for (const idEl of ["semAprInstituicao", "semAprDisciplinaOrigem", "semAprCarga", "semAprAno", "semAprNota", "semAprParecer", "semAprData"]) { const el = semEl(idEl); if (el) el.value = ""; }
  semMensagem(data.mensagem);
}

async function semMatricularCursoAcao() {
  if (!semAlunoId) return;
  const token = authToken;
  const data = await semPost("matricular-curso", { membroId: semAlunoId, cursoId: Number(semEl("semAlunoCurso").value), data: semEl("semAlunoCursoData").value || undefined });
  if (data && data.sucesso) await semDepoisDoAto(data, token);
}
async function semConcluirAcao(cursoMatriculaId) {
  if (!confirm("Registrar a conclusão do curso? O diploma sai na hora, com o código de verificação.")) return;
  const token = authToken;
  const data = await semPost("concluir-curso", { cursoMatriculaId: Number(cursoMatriculaId) });
  if (data && data.sucesso) await semDepoisDoAto(data, token);
}
async function semCancelarCursoAcao(cursoMatriculaId) {
  const motivo = semMotivo("Motivo do cancelamento da matrícula no curso");
  if (!motivo) return;
  const token = authToken;
  const data = await semPost("cancelar-curso", { cursoMatriculaId: Number(cursoMatriculaId), motivo });
  if (data && data.sucesso) await semDepoisDoAto(data, token);
}
async function semAnularConclusaoAcao(cursoMatriculaId) {
  const motivo = semMotivo("Por que anular a conclusão? (o diploma será revogado)");
  if (!motivo) return;
  const token = authToken;
  const data = await semPost("anular-conclusao", { cursoMatriculaId: Number(cursoMatriculaId), motivo });
  if (data && data.sucesso) await semDepoisDoAto(data, token);
}
async function semRegistrarAproveitamentoAcao() {
  if (!semAlunoId) return;
  const token = authToken;
  const data = await semPost("aproveitamento", { membroId: semAlunoId, disciplinaId: Number(semEl("semAprDisciplina").value) || null, instituicao: semEl("semAprInstituicao").value,
    disciplinaOrigem: semEl("semAprDisciplinaOrigem").value, cargaHorariaOrigem: semEl("semAprCarga").value.trim(), anoOrigem: Number(semEl("semAprAno").value) || null,
    notaOrigem: semEl("semAprNota").value, decisao: semEl("semAprDecisao").value, parecer: semEl("semAprParecer").value, pareceristaMembroId: Number(semEl("semAprParecerista").value) || null,
    dataParecer: semEl("semAprData").value, documentoConferido: semEl("semAprDocumento").checked });
  if (data && data.sucesso) await semDepoisDoAto(data, token, { limparAproveitamento: true });
}
async function semAnularAproveitamentoAcao(aproveitamentoId) {
  const motivo = semMotivo("Por que anular o aproveitamento?");
  if (!motivo) return;
  const token = authToken;
  const data = await semPost("anular-aproveitamento", { aproveitamentoId: Number(aproveitamentoId), motivo });
  if (data && data.sucesso) await semDepoisDoAto(data, token);
}
// Emite (ou devolve o já emitido hoje) e baixa o PDF. `membroId` null: a própria pessoa (Minha Formação).
async function semEmitirDocumentoAcao(tipo, cursoMatriculaId, membroId) {
  const proprio = membroId == null;
  const lugar = proprio ? "minha" : "academia";
  const token = authToken;
  const data = await semPost("documento", { tipo, cursoMatriculaId: cursoMatriculaId == null ? undefined : Number(cursoMatriculaId), membroId: proprio ? undefined : Number(membroId) }, { lugar });
  if (!data || !data.sucesso) return;
  await baixarPdfCertificado(Number(data.certificadoId));
  if (authToken !== token) return;
  if (proprio) await semCarregarMinha(); else if (semAlunoId) await semCarregarAluno(semAlunoId, { soHistorico: true });
  if (authToken === token) semMensagem(data.mensagem, lugar);
}

// ---- o currículo ----
async function semEditarCursoAcao(cursoId) {
  const c = semPainel && semPainel.cursos.find((x) => x.cursoId === Number(cursoId));
  if (!c) return;
  const nota = prompt(`Nota mínima para aprovar no ${c.nome} (0 a 10):`, semNum(c.notaMinima));
  if (nota === null) return;
  const freq = prompt(`Frequência mínima no ${c.nome} (%):`, String(c.frequenciaMinimaPct));
  if (freq === null) return;
  const token = authToken;
  const data = await semPost("curso", { cursoId: c.cursoId, nome: c.nome, notaMinima: nota.trim(), frequenciaMinimaPct: Number(freq) });
  if (!data || !data.sucesso) return;
  await semCarregarPainelAcao();
  if (authToken === token) semMensagem(data.mensagem);
}
function semNovaDisciplinaAcao() {
  for (const idEl of ["semDiscId", "semDiscNome", "semDiscCarga", "semDiscEmenta"]) semEl(idEl).value = "";
  semEl("semDiscObrigatoria").checked = true;
  semEl("semDiscAtiva").checked = true;
  semEl("semDiscCurso").disabled = false;
  for (const o of semEl("semDiscPre").options) o.selected = false;
  semEl("semDiscTitulo").textContent = "Nova disciplina";
  semPreencherPre();
}
function semEditarDisciplinaAcao(disciplinaId) {
  const d = semPainel && semPainel.cursos.flatMap((c) => c.disciplinas).find((x) => x.disciplinaId === Number(disciplinaId));
  if (!d) return;
  semEl("semDiscId").value = String(d.disciplinaId);
  semEl("semDiscCurso").value = String(d.cursoId);
  semEl("semDiscCurso").disabled = true;   // a disciplina não muda de curso
  semEl("semDiscNome").value = d.nome;
  semEl("semDiscArea").value = d.area;
  semEl("semDiscCarga").value = semNum(d.cargaHoraria);
  semEl("semDiscObrigatoria").checked = d.obrigatoria;
  semEl("semDiscAtiva").checked = d.ativa;
  semEl("semDiscEmenta").value = d.ementa || "";
  semPreencherPre();
  for (const o of semEl("semDiscPre").options) o.selected = d.preRequisitos.includes(Number(o.value));
  const tit = semEl("semDiscTitulo");
  tit.textContent = `Editar: ${d.nome}`;
  if (typeof tit.focus === "function") tit.focus();
}
async function semSalvarDisciplinaAcao() {
  const id = Number(semEl("semDiscId").value) || null;
  const token = authToken;
  const data = await semPost("disciplina", { disciplinaId: id, cursoId: Number(semEl("semDiscCurso").value) || null, nome: semEl("semDiscNome").value, area: semEl("semDiscArea").value,
    cargaHoraria: semEl("semDiscCarga").value.trim(), obrigatoria: semEl("semDiscObrigatoria").checked, ativa: semEl("semDiscAtiva").checked, ementa: semEl("semDiscEmenta").value,
    preRequisitos: [...semEl("semDiscPre").selectedOptions].map((o) => Number(o.value)) });
  if (!data || !data.sucesso) return;
  semNovaDisciplinaAcao();
  await semCarregarPainelAcao();
  if (authToken === token) semMensagem(data.mensagem);
}

// ---- os requisitos de disciplina ----
async function semSalvarRequisitoAcao() {
  const token = authToken;
  const data = await semPost("requisito", { contexto: semEl("semReqContexto").value, alvoChave: semEl("semReqAlvo").value, disciplinaId: Number(semEl("semReqDisciplina").value) || null,
    modo: semEl("semReqModo").value });
  if (!data || !data.sucesso) return;
  semEl("semReqAlvo").value = "";
  await semCarregarPainelAcao();
  if (authToken === token) semMensagem(data.mensagem);
}
async function semRemoverRequisitoAcao(requisitoId) {
  if (!confirm("Remover a exigência desta disciplina?")) return;
  const token = authToken;
  const data = await semPost("remover-requisito", { requisitoId: Number(requisitoId) });
  if (!data || !data.sucesso) return;
  await semCarregarPainelAcao();
  if (authToken === token) semMensagem(data.mensagem);
}

registrarAcoes({ semMostrarParteAcao, semAbrirTurmaAcao, semAbrirTurmaMinhaAcao, semSalvarNotasAcao, semEncerrarAcao, semReabrirAcao, semExcluirTurmaAcao, semInscreverAcao,
  semCancelarInscricaoAcao, semAbrirTurmaNovaAcao, semBuscarAlunoAcao, semMatricularCursoAcao, semConcluirAcao, semCancelarCursoAcao, semAnularConclusaoAcao,
  semRegistrarAproveitamentoAcao, semAnularAproveitamentoAcao, semEmitirDocumentoAcao, semEditarCursoAcao, semNovaDisciplinaAcao, semEditarDisciplinaAcao, semSalvarDisciplinaAcao,
  semSalvarRequisitoAcao, semRemoverRequisitoAcao });
