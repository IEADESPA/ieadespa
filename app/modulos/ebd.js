// app/modulos/ebd.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- EBD (v6.1 — Hierarquia e cadastros, abre a FASE 6) ----

async function carregarOpcoesEbdAcao() {
  const selCong = document.getElementById("ebdCongregacao");
  if (selCong && !selCong.dataset.montado) {
    const congs = await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/congregacoes`));
    selCong.innerHTML = congs.filter(c => c.ativa !== false).map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("");
    selCong.dataset.montado = "1";
  }
}

async function carregarTurmasEbdAcao() {
  const congregacaoId = document.getElementById("ebdCongregacao").value;
  const container = document.getElementById("painelTurmasEbd");
  if (!congregacaoId) { container.innerHTML = ""; return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-turmas/turmas?congregacaoId=${congregacaoId}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.turmas.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Id</th><th>Nome</th><th>Faixa Etária</th><th>Professores</th><th>Alunos</th></tr></thead><tbody>
        ${data.turmas.map(t => `<tr><td>${t.turmaId}</td><td>${escaparHtmlEbd(t.nome)}</td><td>${escaparHtmlEbd(t.faixaEtaria || "-")}</td><td>${escaparHtmlEbd(t.totalProfessores)}</td><td>${escaparHtmlEbd(t.totalAlunos)}</td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhuma turma cadastrada nesta congregação ainda.</p>";
}

async function criarTurmaEbdAcao() {
  const congregacaoId = document.getElementById("ebdCongregacao").value;
  const nome = document.getElementById("ebdNovaTurmaNome").value.trim();
  const faixaEtaria = document.getElementById("ebdNovaTurmaFaixaEtaria").value.trim();
  const msg = document.getElementById("resultadoTurmaEbd");
  if (!congregacaoId || !nome) { msg.textContent = "Escolha a congregação e informe o nome da turma."; return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-turmas/turmas`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ congregacaoId: Number(congregacaoId), nome, faixaEtaria: faixaEtaria || null })
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast(data.mensagem, "sucesso");
  document.getElementById("ebdNovaTurmaNome").value = "";
  document.getElementById("ebdNovaTurmaFaixaEtaria").value = "";
  carregarTurmasEbdAcao();
}

async function carregarDetalheTurmaEbdAcao() {
  const turmaId = document.getElementById("ebdTurmaIdDetalhe").value;
  const container = document.getElementById("painelDetalheTurmaEbd");
  if (!turmaId) { container.innerHTML = ""; return; }
  const [resProf, resAlu] = await Promise.all([
    fetchProtegido(`${API_BASE}/ebd-turmas/professores?turmaId=${turmaId}`),
    fetchProtegido(`${API_BASE}/ebd-turmas/alunos?turmaId=${turmaId}`)
  ]);
  const dadosProf = await resProf.json();
  const dadosAlu = await resAlu.json();
  if (dadosProf.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(dadosProf.mensagem)}</p>`; return; }
  container.innerHTML = `
    <h5>Professores</h5>
    ${dadosProf.professores.length
      ? `<table class="tabela-frequencia"><thead><tr><th>Matrícula</th><th>Nome</th><th>Principal</th><th></th></tr></thead><tbody>
          ${dadosProf.professores.map(p => `<tr><td>${p.membroId}</td><td>${escaparHtmlEbd(p.membroNome)}</td><td>${p.principal ? "Sim" : "Não"}</td>
            <td><button class="btn-link" data-on-click="encerrarProfessorEbdAcao" data-args-click="${argsAttr(Number(turmaId), p.membroId)}">Remover</button></td></tr>`).join("")}
        </tbody></table>`
      : "<p class='subtitle'>Nenhum professor designado.</p>"}
    <h5>Alunos</h5>
    ${dadosAlu.sucesso === false ? `<p class="subtitle">${escaparHtmlEbd(dadosAlu.mensagem)}</p>` : (dadosAlu.alunos.length
      ? `<table class="tabela-frequencia"><thead><tr><th>Id</th><th>Matrícula EBD</th><th>Nome</th><th>Tipo</th><th>Matrículado em</th></tr></thead><tbody>
          ${dadosAlu.alunos.map(a => `<tr><td>${a.alunoId}</td><td>${escaparHtmlEbd(a.matricula)}</td><td>${escaparHtmlEbd(a.membroNome)}</td>
            <td>${a.naoMembro ? `Não-membro${a.responsavelNome ? ` <span class="subtitle">(resp.: ${escaparHtmlEbd(a.responsavelNome)})</span>` : ""}` : "Membro"}</td>
            <td>${a.matriculadoEm ? new Date(a.matriculadoEm).toLocaleDateString("pt-BR") : "-"}</td></tr>`).join("")}
        </tbody></table>`
      : "<p class='subtitle'>Nenhum aluno matriculado.</p>")}
  `;
}

async function designarProfessorEbdAcao() {
  const turmaId = document.getElementById("ebdProfessorTurmaId").value;
  const membroId = document.getElementById("ebdProfessorMatricula").value;
  const principal = document.getElementById("ebdProfessorPrincipal").checked;
  if (!turmaId || !membroId) { mostrarToast("Informe o id da turma e a matrícula do professor.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-turmas/professores`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ turmaId: Number(turmaId), membroId: Number(membroId), principal })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) carregarDetalheTurmaEbdAcao();
}

async function encerrarProfessorEbdAcao(turmaId, membroId) {
  if (!confirm("Remover este professor da turma?")) return;
  const res = await fetchProtegido(`${API_BASE}/ebd-turmas/professores/encerrar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turmaId, membroId })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  carregarDetalheTurmaEbdAcao();
}

async function matricularAlunoEbdAcao() {
  const turmaId = document.getElementById("ebdAlunoTurmaId").value;
  const membroId = document.getElementById("ebdAlunoMatriculaMembro").value;
  const msg = document.getElementById("resultadoAlunoEbd");
  if (!turmaId || !membroId) { msg.textContent = "Informe o id da turma e a matrícula do membro."; return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-turmas/alunos`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ turmaId: Number(turmaId), membroId: Number(membroId) })
  });
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  mostrarToast(data.mensagem, "sucesso");
  document.getElementById("ebdAlunoMatriculaMembro").value = "";
  carregarDetalheTurmaEbdAcao();
}

async function transferirAlunoEbdAcao() {
  const membroId = document.getElementById("ebdTransferirMatriculaMembro").value;
  const alunoId = document.getElementById("ebdTransferirAlunoId").value;
  const novaTurmaId = document.getElementById("ebdTransferirNovaTurmaId").value;
  if ((!membroId && !alunoId) || !novaTurmaId) { mostrarToast("Informe a matrícula do membro (ou o Id do aluno) e o id da nova turma.", "erro"); return; }
  // v6.8: aluno não-membro só se acha pelo Id do aluno; o membro continua pela matrícula de membro.
  const corpo = alunoId ? { alunoId: Number(alunoId), novaTurmaId: Number(novaTurmaId) } : { membroId: Number(membroId), novaTurmaId: Number(novaTurmaId) };
  const res = await fetchProtegido(`${API_BASE}/ebd-turmas/alunos/transferir`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo)
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) carregarDetalheTurmaEbdAcao();
}

// v6.8 — aluno não-membro, vínculo a membro e encerramento de matrícula.
async function matricularNaoMembroEbdAcao() {
  const turmaId = document.getElementById("ebdNaoMembroTurmaId").value;
  const nome = document.getElementById("ebdNaoMembroNome").value.trim();
  if (!turmaId || !nome) { mostrarToast("Informe o id da turma e o nome do aluno.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-turmas/alunos`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      turmaId: Number(turmaId),
      naoMembro: {
        nome,
        contato: document.getElementById("ebdNaoMembroContato").value.trim() || null,
        dataNascimento: document.getElementById("ebdNaoMembroNascimento").value || null,
        responsavelNome: document.getElementById("ebdNaoMembroResponsavel").value.trim() || null
      }
    })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso === false) return;
  ["ebdNaoMembroNome", "ebdNaoMembroContato", "ebdNaoMembroNascimento", "ebdNaoMembroResponsavel"].forEach(id => { document.getElementById(id).value = ""; });
  document.getElementById("ebdTurmaIdDetalhe").value = turmaId;
  carregarDetalheTurmaEbdAcao();
}

async function vincularAlunoEbdAcao() {
  const alunoId = document.getElementById("ebdVincularAlunoId").value;
  const membroId = document.getElementById("ebdVincularMatriculaMembro").value;
  if (!alunoId || !membroId) { mostrarToast("Informe o Id do aluno e a matrícula do membro.", "erro"); return; }
  if (!confirm("Vincular este aluno ao cadastro do membro? Nome, contato e nascimento soltos da matrícula deixam de existir (passa a valer o cadastro do membro).")) return;
  const res = await fetchProtegido(`${API_BASE}/ebd-turmas/alunos/vincular-membro`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alunoId: Number(alunoId), membroId: Number(membroId) })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) carregarDetalheTurmaEbdAcao();
}

async function encerrarMatriculaEbdAcao() {
  const alunoId = document.getElementById("ebdVincularAlunoId").value;
  if (!alunoId) { mostrarToast("Informe o Id do aluno.", "erro"); return; }
  if (!confirm("Encerrar a matrícula deste aluno? Ele deixa de contar nos matriculados; o histórico de chamada fica.")) return;
  const res = await fetchProtegido(`${API_BASE}/ebd-turmas/alunos/encerrar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alunoId: Number(alunoId) })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) carregarDetalheTurmaEbdAcao();
}

// Trava 6-A — modo professor: as próprias turmas (com o Id que os campos da
// chamada, das atividades e do pedido de revistas pedem).
function renderPainelProfessorEbd() {
  const container = document.getElementById("painelProfessorEbd");
  container.innerHTML = `
    <h3>📖 EBD — Minhas turmas</h3>
    <p class="subtitle">Você é professor(a) destas turmas. Aqui você lança a chamada, responde/corrige as
      atividades dos alunos e faz o pedido de revistas da turma. Abrir/fechar a lição do dia, cadastros,
      certificados e financeiro ficam com quem administra a EBD.</p>
    <table class="tabela-frequencia"><thead><tr><th>Id da turma</th><th>Turma</th><th>Faixa etária</th><th>Congregação</th></tr></thead><tbody>
      ${ebdTurmasProfessor.map(t => `<tr><td>${t.turmaId}</td><td>${escaparHtmlEbd(t.nome)}</td><td>${escaparHtmlEbd(t.faixaEtaria || "-")}</td><td>${escaparHtmlEbd(t.congregacaoNome)}</td></tr>`).join("")}
    </tbody></table>
    <hr />`;
}

// ---- Chamada e presença (v6.2) ----
let ebdChamadaLicaoAtual = null;

async function carregarOpcoesChamadaEbdAcao() {
  const sel = document.getElementById("ebdChamadaCongregacao");
  if (sel && !sel.dataset.montado) {
    const congs = await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/congregacoes`));
    sel.innerHTML = congs.filter(c => c.ativa !== false).map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("");
    sel.dataset.montado = "1";
  }
}

function renderPainelLicaoEbd(licao) {
  const container = document.getElementById("painelLicaoEbd");
  if (!licao) { container.innerHTML = "<p class='subtitle'>Nenhuma lição encontrada para esta data — use \"Abrir lição\".</p>"; ebdChamadaLicaoAtual = null; return; }
  ebdChamadaLicaoAtual = licao;
  document.getElementById("ebdChamadaLicaoId").value = licao.licaoId;
  const campoCaderneta = document.getElementById("cadLicaoId"); // v6.8: a caderneta parte da mesma lição
  if (campoCaderneta) campoCaderneta.value = licao.licaoId;
  container.innerHTML = `<p class="subtitle">Lição #${licao.licaoId} — ${new Date(licao.data).toLocaleDateString("pt-BR", { timeZone: "UTC" })} — status: <strong>${escaparHtmlEbd(licao.status)}</strong></p>`;
}

async function buscarLicaoEbdAcao() {
  const congregacaoId = document.getElementById("ebdChamadaCongregacao").value;
  const data = document.getElementById("ebdChamadaData").value;
  if (!congregacaoId || !data) { mostrarToast("Escolha a congregação e a data.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-chamada/licao?congregacaoId=${congregacaoId}&data=${data}`);
  const resData = await res.json();
  if (resData.sucesso === false) { mostrarToast(resData.mensagem, "erro"); return; }
  renderPainelLicaoEbd(resData.licao);
}

async function abrirLicaoEbdAcao() {
  const congregacaoId = document.getElementById("ebdChamadaCongregacao").value;
  const data = document.getElementById("ebdChamadaData").value;
  if (!congregacaoId || !data) { mostrarToast("Escolha a congregação e a data.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-chamada/licao/abrir`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ congregacaoId: Number(congregacaoId), data })
  });
  const resData = await res.json();
  mostrarToast(resData.mensagem, resData.sucesso === false ? "erro" : "sucesso");
  if (resData.sucesso !== false) buscarLicaoEbdAcao();
}

async function fecharLicaoEbdAcao() {
  const licaoId = document.getElementById("ebdLicaoIdAcao").value;
  if (!licaoId) { mostrarToast("Informe o id da lição.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-chamada/licao/fechar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ licaoId: Number(licaoId) })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
}

async function reabrirLicaoEbdAcao() {
  const licaoId = document.getElementById("ebdLicaoIdAcao").value;
  if (!licaoId) { mostrarToast("Informe o id da lição.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-chamada/licao/reabrir`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ licaoId: Number(licaoId) })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
}

async function carregarRosterChamadaEbdAcao() {
  const licaoId = document.getElementById("ebdChamadaLicaoId").value;
  const turmaId = document.getElementById("ebdChamadaTurmaId").value;
  const container = document.getElementById("painelRosterChamadaEbd");
  if (!licaoId || !turmaId) { container.innerHTML = ""; mostrarToast("Informe o id da lição e o id da turma.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-chamada/roster?turmaId=${turmaId}&licaoId=${licaoId}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.alunos.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Id</th><th>Matrícula</th><th>Nome</th><th>Status</th><th>Lançar</th></tr></thead><tbody>
        ${data.alunos.map(a => `<tr>
          <td>${a.alunoId}</td><td>${escaparHtmlEbd(a.matricula)}</td><td>${escaparHtmlEbd(a.membroNome)}${a.naoMembro ? ' <span class="subtitle">(não-membro)</span>' : ""}</td><td>${escaparHtmlEbd(a.status) || "-"}</td>
          <td>
            <button class="btn-link" data-on-click="lancarPresencaEbdAcao" data-args-click="${argsAttr(a.alunoId, "PRESENTE")}">✅ Presente</button>
            <button class="btn-link" data-on-click="lancarPresencaEbdAcao" data-args-click="${argsAttr(a.alunoId, "AUSENTE")}">❌ Ausente</button>
          </td>
        </tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhum aluno ativo nesta turma.</p>";
  carregarResumoChamadaEbdAcao();
}

async function lancarPresencaEbdAcao(alunoId, status) {
  const licaoId = document.getElementById("ebdChamadaLicaoId").value;
  const turmaId = document.getElementById("ebdChamadaTurmaId").value;
  const res = await fetchProtegido(`${API_BASE}/ebd-chamada/presenca`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licaoId: Number(licaoId), turmaId: Number(turmaId), alunoId, status })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) { carregarRosterChamadaEbdAcao(); carregarResumoChamadaEbdAcao(); }
}

async function registrarVisitanteEbdAcao() {
  const licaoId = document.getElementById("ebdChamadaLicaoId").value;
  const turmaId = document.getElementById("ebdChamadaTurmaId").value;
  const visitanteNome = document.getElementById("ebdVisitanteNome").value.trim();
  const visitanteContato = document.getElementById("ebdVisitanteContato").value.trim();
  if (!licaoId || !turmaId || !visitanteNome) { mostrarToast("Informe lição, turma e o nome do visitante.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-chamada/visitante`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licaoId: Number(licaoId), turmaId: Number(turmaId), visitanteNome, visitanteContato: visitanteContato || null })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) {
    document.getElementById("ebdVisitanteNome").value = "";
    document.getElementById("ebdVisitanteContato").value = "";
    carregarResumoChamadaEbdAcao();
  }
}

async function carregarResumoChamadaEbdAcao() {
  const licaoId = document.getElementById("ebdChamadaLicaoId").value;
  const turmaId = document.getElementById("ebdChamadaTurmaId").value;
  const container = document.getElementById("painelResumoChamadaEbd");
  if (!licaoId || !turmaId) { container.innerHTML = ""; return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-chamada/resumo?licaoId=${licaoId}&turmaId=${turmaId}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  const r = data.resumo;
  container.innerHTML = `
    <p>Presentes: <strong>${escaparHtmlEbd(r.presentes)}</strong> · Ausentes: <strong>${escaparHtmlEbd(r.ausentes)}</strong> · Visitantes: <strong>${escaparHtmlEbd(r.visitantes)}</strong></p>
    <p>Percentual de presença: <strong>${escaparHtmlEbd(r.percentualPresenca)}%</strong> · Percentual de ausência: <strong>${escaparHtmlEbd(r.percentualAusencia)}%</strong></p>
  `;
}

// ---- Sala de aula assistida (v6.10) ----
// Chamada offline-first: o pacote da turma (id + nome dos alunos, lição do dia,
// planos publicados) e a fila de marcações ficam no localStorage DESTE
// aparelho — a sessão do painel fica no sessionStorage e não sobrevive ao
// celular fechar o app, então a tela da chamada offline funciona sem login; o
// envio é que exige sessão. A fila nunca é apagada sozinha: só sai quando o
// servidor confirma (ou quando a pessoa descarta de propósito).
const CHAVE_OFFLINE_EBD = "ebdOffline:v1";
const DIAS_VALIDADE_PACOTE_OFFLINE_EBD = 30;
let sincronizandoOfflineEbd = false;
let temporizadorSyncOfflineEbd = null;

function lerEstadoOfflineEbd() {
  try {
    const estado = JSON.parse(localStorage.getItem(CHAVE_OFFLINE_EBD) || "null");
    if (estado && typeof estado.turmas === "object" && Array.isArray(estado.fila)) return estado;
  } catch (e) { /* armazenamento bloqueado ou corrompido — começa vazio */ }
  return { turmas: {}, fila: [], ultimoEnvio: null };
}

function gravarEstadoOfflineEbd(estado) {
  try {
    localStorage.setItem(CHAVE_OFFLINE_EBD, JSON.stringify(estado));
    return true;
  } catch (e) {
    mostrarToast("Não foi possível guardar neste aparelho (armazenamento cheio ou bloqueado).", "erro");
    return false;
  }
}

function dataLocalHojeEbd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dataIsoEbdValida(valor) {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

function gerarChaveClienteEbd() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

// Pacote velho (sem marcação pendente daquela turma) sai do aparelho: a lista
// de alunos muda, e nome de criança não deve ficar guardado sem uso.
function limparPacotesVencidosEbd(estado) {
  const limite = Date.now() - DIAS_VALIDADE_PACOTE_OFFLINE_EBD * 86400000;
  for (const id of Object.keys(estado.turmas)) {
    const pacote = estado.turmas[id];
    const temPendencia = estado.fila.some(item => String(item.turmaId) === id);
    if (!temPendencia && new Date(pacote.baixadoEm).getTime() < limite) delete estado.turmas[id];
  }
  return estado;
}

function atualizarLinksChamadaOfflineEbd() {
  const estado = lerEstadoOfflineEbd();
  const mostrar = Object.keys(estado.turmas).length > 0 || estado.fila.length > 0;
  document.querySelectorAll(".link-chamada-offline").forEach(link => {
    link.style.display = mostrar ? "" : "none";
    link.textContent = estado.fila.length
      ? `📴 Chamada da EBD sem internet (${estado.fila.length} marcação(ões) aguardando envio)`
      : "📴 Chamada da EBD sem internet";
  });
}

function preencherTurmasSalaEbd() {
  const sel = document.getElementById("salaTurmaSelect");
  if (sel) {
    sel.innerHTML = `<option value="">Escolha a turma...</option>` + ebdTurmasProfessor
      .map(t => `<option value="${t.turmaId}">${escaparHtmlEbd(t.nome)} — ${escaparHtmlEbd(t.congregacaoNome)}</option>`).join("");
  }
  const data = document.getElementById("salaData");
  if (data && !data.value) data.value = dataLocalHojeEbd();
  atualizarPainelOfflineEbd();
}
// O antigo onchange="document.getElementById('salaTurmaId').value = this.value" do seletor de turma (CSP forte: código não fica mais no HTML).
// idDestino é sempre o id fixo escrito no index.html.
function copiarValorParaCampo(idDestino, valor) {
  document.getElementById(idDestino).value = valor;
}

async function baixarTurmaOfflineEbdAcao() {
  const turmaId = Number(document.getElementById("salaTurmaId").value);
  const data = document.getElementById("salaData").value || dataLocalHojeEbd();
  if (!turmaId) { mostrarToast("Escolha a turma.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-chamada/offline/pacote?turmaId=${turmaId}&data=${encodeURIComponent(data)}`);
  const resposta = await res.json();
  if (resposta.sucesso === false) { mostrarToast(resposta.mensagem, "erro"); return; }
  const estado = limparPacotesVencidosEbd(lerEstadoOfflineEbd());
  estado.turmas[turmaId] = Object.assign({}, resposta.pacote, { baixadoEm: new Date().toISOString(), baixadoPor: authMatricula });
  if (!gravarEstadoOfflineEbd(estado)) return;
  mostrarToast(`✅ Turma baixada: ${resposta.pacote.alunos.length} aluno(s). Já dá para fazer a chamada sem internet.`, "sucesso");
  atualizarPainelOfflineEbd();
  atualizarLinksChamadaOfflineEbd();
}

function removerTurmaOfflineEbdAcao(turmaId) {
  const estado = lerEstadoOfflineEbd();
  const pendentes = estado.fila.filter(item => item.turmaId === turmaId).length;
  if (!confirm(pendentes
    ? `Esta turma tem ${pendentes} marcação(ões) ainda NÃO enviada(s). Remover apaga também essas marcações. Continuar?`
    : "Remover esta turma deste aparelho?")) return;
  delete estado.turmas[turmaId];
  estado.fila = estado.fila.filter(item => item.turmaId !== turmaId);
  gravarEstadoOfflineEbd(estado);
  atualizarPainelOfflineEbd();
  atualizarLinksChamadaOfflineEbd();
}

function apagarDadosOfflineEbdAcao() {
  const estado = lerEstadoOfflineEbd();
  if (!confirm(estado.fila.length
    ? `Há ${estado.fila.length} marcação(ões) ainda NÃO enviada(s) — elas serão perdidas. Apagar mesmo todos os dados da EBD deste aparelho?`
    : "Apagar as turmas da EBD baixadas neste aparelho?")) return;
  try { localStorage.removeItem(CHAVE_OFFLINE_EBD); } catch (e) { /* nada guardado */ }
  mostrarToast("Dados da EBD apagados deste aparelho.", "sucesso");
  atualizarLinksChamadaOfflineEbd();
  atualizarPainelOfflineEbd();
  if (document.getElementById("telaChamadaOffline").style.display !== "none") renderChamadaOffline();
}

function resumoFilaOfflineEbdHtml(estado) {
  const partes = [];
  if (estado.fila.length) {
    const grupos = {};
    estado.fila.forEach(item => { const k = `${item.turmaId}|${item.data}`; grupos[k] = (grupos[k] || 0) + 1; });
    partes.push(`<p><strong>${estado.fila.length}</strong> marcação(ões) aguardando envio:</p><ul>`
      + Object.entries(grupos).map(([k, n]) => {
        const [turmaId, data] = k.split("|");
        const pacote = estado.turmas[turmaId];
        return `<li>${escaparHtmlEbd(pacote ? pacote.turma.nome : `Turma ${turmaId}`)} — ${escaparHtmlEbd(formatarDataEbd(data))}: ${n}
          <button class="btn-link btn-link-perigo" data-on-click="descartarGrupoOfflineEbdAcao" data-args-click="${argsAttr(Number(turmaId), String(data ?? ""))}">descartar</button></li>`;
      }).join("") + "</ul>");
  } else {
    partes.push("<p class='subtitle'>Nenhuma marcação aguardando envio.</p>");
  }
  if (estado.ultimoEnvio) {
    partes.push(`<p class="subtitle">Último envio (${escaparHtmlEbd(new Date(estado.ultimoEnvio.em).toLocaleString("pt-BR"))}):</p><ul class="subtitle">`
      + estado.ultimoEnvio.mensagens.map(m => `<li>${escaparHtmlEbd(m)}</li>`).join("") + "</ul>");
  }
  return partes.join("");
}

function descartarGrupoOfflineEbdAcao(turmaId, data) {
  if (!confirm("Descartar estas marcações sem enviar? Elas não chegam ao sistema.")) return;
  const estado = lerEstadoOfflineEbd();
  estado.fila = estado.fila.filter(item => !(item.turmaId === turmaId && item.data === data));
  gravarEstadoOfflineEbd(estado);
  atualizarPainelOfflineEbd();
  atualizarLinksChamadaOfflineEbd();
  if (document.getElementById("telaChamadaOffline").style.display !== "none") renderChamadaOffline();
}

function atualizarPainelOfflineEbd() {
  const container = document.getElementById("painelSalaOfflineStatus");
  if (!container) return;
  const estado = lerEstadoOfflineEbd();
  const turmas = Object.values(estado.turmas);
  container.innerHTML = (turmas.length
    ? `<p class="subtitle">Turmas baixadas neste aparelho:</p><table class="tabela-frequencia"><thead><tr><th>Turma</th><th>Congregação</th><th>Alunos</th><th>Baixada em</th><th></th></tr></thead><tbody>
        ${turmas.map(p => `<tr><td>${escaparHtmlEbd(p.turma.nome)}</td><td>${escaparHtmlEbd(p.turma.congregacaoNome)}</td><td>${p.alunos.length}</td>
          <td>${escaparHtmlEbd(new Date(p.baixadoEm).toLocaleString("pt-BR"))}</td>
          <td><button class="btn-link btn-link-perigo" data-on-click="removerTurmaOfflineEbdAcao" data-args-click="${argsAttr(Number(p.turma.turmaId))}">remover</button></td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhuma turma baixada neste aparelho ainda.</p>")
    + resumoFilaOfflineEbdHtml(estado)
    + (estado.fila.length ? `<button class="btn-confirmar" style="width:auto;margin:4px 0;" data-on-click="sincronizarChamadaOfflineAcao" data-args-click="${argsAttr(true)}">🔄 Enviar agora</button>` : "");
}

// ---- Tela da chamada offline ----
function abrirTelaChamadaOffline() {
  const estado = limparPacotesVencidosEbd(lerEstadoOfflineEbd());
  gravarEstadoOfflineEbd(estado);
  esconderTodasAsTelas();
  document.getElementById("telaChamadaOffline").style.display = "flex";
  const sel = document.getElementById("offlineTurma");
  const anterior = sel.value;
  sel.innerHTML = Object.values(estado.turmas)
    .map(p => `<option value="${Number(p.turma.turmaId)}">${escaparHtmlEbd(p.turma.nome)} — ${escaparHtmlEbd(p.turma.congregacaoNome)}</option>`).join("");
  if (anterior && estado.turmas[anterior]) sel.value = anterior;
  const campoData = document.getElementById("offlineData");
  if (!campoData.value) campoData.value = dataLocalHojeEbd();
  renderChamadaOffline();
}

function fecharTelaChamadaOffline() {
  document.getElementById("telaChamadaOffline").style.display = "none";
  if (authToken && authMatricula) mostrarTelaPainelInicial();
  else voltarParaCheckin();
}

// Status que a tela mostra: o da fila (marcação feita aqui) por cima do que o
// pacote trouxe do servidor (só se a data for a mesma do pacote).
function statusAtualOfflineEbd(estado, pacote, data) {
  const status = {};
  if (pacote && pacote.data === data) Object.assign(status, pacote.presencas || {});
  const pendentes = new Set();
  estado.fila.forEach(item => {
    if (item.tipo === "PRESENCA" && item.turmaId === pacote.turma.turmaId && item.data === data) {
      status[item.alunoId] = item.status;
      pendentes.add(item.alunoId);
    }
  });
  return { status, pendentes };
}

function renderChamadaOffline() {
  const estado = lerEstadoOfflineEbd();
  document.getElementById("offlineEstadoConexao").textContent = navigator.onLine
    ? (authToken ? "🟢 Com internet — as marcações são enviadas na hora." : "🟢 Com internet — entre no Meu Painel para enviar as marcações.")
    : "🔴 Sem internet — as marcações ficam guardadas neste aparelho e vão depois.";
  const turmaId = Number(document.getElementById("offlineTurma").value);
  const pacote = estado.turmas[turmaId];
  const roster = document.getElementById("offlineRoster");
  const resumo = document.getElementById("offlineResumo");
  const plano = document.getElementById("offlinePlano");
  document.getElementById("offlineFila").innerHTML = resumoFilaOfflineEbdHtml(estado);
  if (!pacote) {
    roster.innerHTML = "<p class='subtitle'>Nenhuma turma baixada neste aparelho. Com internet, entre no Meu Painel → EBD → \"Baixar turma para este aparelho\".</p>";
    resumo.innerHTML = "";
    plano.innerHTML = "";
    return;
  }
  const data = document.getElementById("offlineData").value;
  if (!dataIsoEbdValida(data)) { roster.innerHTML = "<p class='subtitle'>Escolha a data da aula.</p>"; resumo.innerHTML = ""; return; }
  const { status, pendentes } = statusAtualOfflineEbd(estado, pacote, data);
  const presentes = pacote.alunos.filter(a => status[a.alunoId] === "PRESENTE").length;
  const ausentes = pacote.alunos.filter(a => status[a.alunoId] === "AUSENTE").length;
  const visitantes = estado.fila.filter(i => i.tipo === "VISITANTE" && i.turmaId === turmaId && i.data === data).length;
  resumo.innerHTML = `<p>✅ ${presentes} · ❌ ${ausentes} · sem marcação ${pacote.alunos.length - presentes - ausentes}${visitantes ? ` · 🙋 ${visitantes} visitante(s) a enviar` : ""}</p>`
    + (pacote.data !== data ? `<p class="subtitle">A turma foi baixada para ${escaparHtmlEbd(formatarDataEbd(pacote.data))} — as marcações já feitas no sistema não aparecem para esta outra data.</p>` : "");
  roster.innerHTML = pacote.alunos.length
    ? `<ul class="lista-chamada-offline">${pacote.alunos.map(a => {
        const st = status[a.alunoId];
        return `<li><span class="nome-aluno-offline">${escaparHtmlEbd(a.nome)}${pendentes.has(a.alunoId) ? ' <span class="selo-pendente-offline">(a enviar)</span>' : ""}</span>
          <button class="btn-presenca-offline${st === "PRESENTE" ? " ativo-presente" : ""}" aria-label="Presente" data-on-click="marcarPresencaOfflineEbd" data-args-click="${argsAttr(turmaId, String(data ?? ""), Number(a.alunoId), "PRESENTE")}">✅</button>
          <button class="btn-presenca-offline${st === "AUSENTE" ? " ativo-ausente" : ""}" aria-label="Ausente" data-on-click="marcarPresencaOfflineEbd" data-args-click="${argsAttr(turmaId, String(data ?? ""), Number(a.alunoId), "AUSENTE")}">❌</button></li>`;
      }).join("")}</ul>`
    : "<p class='subtitle'>Nenhum aluno ativo nesta turma.</p>";
  plano.innerHTML = pacote.data === data
    ? renderPlanosAulaEbd(pacote.planos || [])
    : "<p class='subtitle'>O plano guardado é o da data em que a turma foi baixada.</p>";
}

function marcarPresencaOfflineEbd(turmaId, data, alunoId, status) {
  if (!dataIsoEbdValida(data) || (status !== "PRESENTE" && status !== "AUSENTE")) return;
  const estado = lerEstadoOfflineEbd();
  estado.fila = estado.fila.filter(item => !(item.tipo === "PRESENCA" && item.turmaId === turmaId && item.data === data && item.alunoId === alunoId));
  estado.fila.push({ tipo: "PRESENCA", turmaId, data, alunoId, status, marcadoEm: new Date().toISOString() });
  if (!gravarEstadoOfflineEbd(estado)) return;
  renderChamadaOffline();
  atualizarLinksChamadaOfflineEbd();
  agendarSincronizacaoOfflineEbd();
}

function adicionarVisitanteOfflineAcao() {
  const turmaId = Number(document.getElementById("offlineTurma").value);
  const data = document.getElementById("offlineData").value;
  const nome = document.getElementById("offlineVisitanteNome").value.trim();
  const contato = document.getElementById("offlineVisitanteContato").value.trim();
  if (!turmaId || !dataIsoEbdValida(data)) { mostrarToast("Escolha a turma e a data.", "erro"); return; }
  if (!nome) { mostrarToast("Informe o nome do visitante.", "erro"); return; }
  const estado = lerEstadoOfflineEbd();
  estado.fila.push({ tipo: "VISITANTE", turmaId, data, chaveCliente: gerarChaveClienteEbd(), nome, contato: contato || null, marcadoEm: new Date().toISOString() });
  if (!gravarEstadoOfflineEbd(estado)) return;
  document.getElementById("offlineVisitanteNome").value = "";
  document.getElementById("offlineVisitanteContato").value = "";
  mostrarToast("Visitante guardado.", "sucesso");
  renderChamadaOffline();
  atualizarLinksChamadaOfflineEbd();
  agendarSincronizacaoOfflineEbd();
}

function agendarSincronizacaoOfflineEbd() {
  clearTimeout(temporizadorSyncOfflineEbd);
  if (!navigator.onLine || !authToken) return;
  temporizadorSyncOfflineEbd = setTimeout(() => sincronizarChamadaOfflineAcao(false), 1500);
}

// Envia a fila, um lote por (turma, data). Usa fetch direto (não
// fetchProtegido): uma sessão expirada aqui não pode derrubar a pessoa da
// tela da chamada, e a fila tem de continuar guardada.
async function sincronizarChamadaOfflineAcao(manual) {
  if (sincronizandoOfflineEbd) return;
  const inicial = lerEstadoOfflineEbd();
  if (inicial.fila.length === 0) { if (manual) mostrarToast("Nada aguardando envio.", "sucesso"); return; }
  if (!navigator.onLine) { if (manual) mostrarToast("Sem internet — as marcações continuam guardadas no aparelho.", "erro"); return; }
  if (!authToken) { if (manual) mostrarToast("Entre no Meu Painel (com sua matrícula) para enviar — as marcações continuam guardadas.", "erro"); return; }

  sincronizandoOfflineEbd = true;
  const mensagens = [];
  const enviados = [];
  try {
    const grupos = {};
    inicial.fila.forEach(item => {
      const k = `${item.turmaId}|${item.data}`;
      if (!grupos[k]) grupos[k] = { turmaId: item.turmaId, data: item.data, itens: [] };
      grupos[k].itens.push(item);
    });
    for (const grupo of Object.values(grupos)) {
      const pacote = inicial.turmas[grupo.turmaId];
      const rotulo = `${pacote ? pacote.turma.nome : `Turma ${grupo.turmaId}`} (${formatarDataEbd(grupo.data)})`;
      const corpo = {
        turmaId: grupo.turmaId, data: grupo.data,
        registros: grupo.itens.filter(i => i.tipo === "PRESENCA").map(i => ({ alunoId: i.alunoId, status: i.status, marcadoEm: i.marcadoEm })),
        visitantes: grupo.itens.filter(i => i.tipo === "VISITANTE").map(i => ({ chaveCliente: i.chaveCliente, nome: i.nome, contato: i.contato, marcadoEm: i.marcadoEm }))
      };
      let res;
      try {
        res = await fetch(`${API_BASE}/ebd-chamada/sincronizar`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-auth-token": authToken, Authorization: "Bearer " + authToken },
          body: JSON.stringify(corpo)
        });
      } catch (falhaDeRede) {
        mensagens.push("A conexão caiu durante o envio — tenta de novo quando a internet voltar.");
        break;
      }
      if (res.status === 401) { mensagens.push("Sua sessão expirou — entre de novo no Meu Painel para enviar."); break; }
      const resposta = await res.json().catch(() => ({}));
      if (res.ok && resposta.sucesso) {
        enviados.push(...grupo.itens);
        mensagens.push(`${rotulo}: ${resposta.mensagem}`);
        const nomeDe = id => { const a = pacote && pacote.alunos.find(x => x.alunoId === id); return a ? a.nome : `aluno ${id}`; };
        (resposta.conflitos || []).forEach(c => mensagens.push(`${rotulo}: ${nomeDe(c.alunoId)} — no sistema está ${c.statusServidor} (corrigido depois da sua marcação ${c.statusAparelho}); valeu o sistema.`));
        (resposta.rejeitados || []).forEach(r => mensagens.push(`${rotulo}: ${r.alunoId ? nomeDe(r.alunoId) : "visitante"} — recusado: ${r.motivo}`));
      } else {
        mensagens.push(`${rotulo}: ${resposta.mensagem || `não enviado (erro ${res.status})`} — continua guardado.`);
      }
    }
  } finally {
    // Relê o estado: a pessoa pode ter marcado mais alguém durante o envio.
    // Só sai da fila o item que foi enviado e não mudou desde então.
    const estado = lerEstadoOfflineEbd();
    const chaveDe = i => (i.tipo === "VISITANTE" ? `V|${i.chaveCliente}` : `P|${i.turmaId}|${i.data}|${i.alunoId}|${i.marcadoEm}`);
    const enviadosSet = new Set(enviados.map(chaveDe));
    estado.fila = estado.fila.filter(i => !enviadosSet.has(chaveDe(i)));
    if (mensagens.length) estado.ultimoEnvio = { em: new Date().toISOString(), mensagens };
    gravarEstadoOfflineEbd(estado);
    sincronizandoOfflineEbd = false;
    atualizarLinksChamadaOfflineEbd();
    atualizarPainelOfflineEbd();
    if (document.getElementById("telaChamadaOffline").style.display !== "none") renderChamadaOffline();
  }
  if (enviados.length) mostrarToast(`✅ ${enviados.length} marcação(ões) da EBD enviada(s).`, "sucesso");
  else if (manual && mensagens.length) mostrarToast(mensagens[mensagens.length - 1], "erro");
}

window.addEventListener("online", () => {
  if (document.getElementById("telaChamadaOffline").style.display !== "none") renderChamadaOffline();
  agendarSincronizacaoOfflineEbd();
});
window.addEventListener("offline", () => {
  if (document.getElementById("telaChamadaOffline").style.display !== "none") renderChamadaOffline();
});
document.addEventListener("DOMContentLoaded", () => {
  atualizarLinksChamadaOfflineEbd();
  agendarSincronizacaoOfflineEbd();
});

// ---- Plano de aula (professor) ----
function linkSeguroEbd(url) {
  return typeof url === "string" && /^https:\/\//i.test(url) ? url : null;
}

function renderPlanosAulaEbd(planos) {
  if (!planos || planos.length === 0) return "<p class='subtitle'>Nenhum plano de aula publicado para esta turma nesta data.</p>";
  return planos.map(p => `
    <div class="plano-aula-ebd">
      <h5>📘 ${escaparHtmlEbd(p.titulo)}${p.referencia ? ` <span class="subtitle">— ${escaparHtmlEbd(p.referencia)}</span>` : ""}</h5>
      <p class="subtitle">${p.congregacaoId == null ? "Campo inteiro" : escaparHtmlEbd(p.congregacaoNome || "Congregação")}${p.faixaEtaria ? ` · ${escaparHtmlEbd(p.faixaEtaria)}` : " · todas as classes"}</p>
      ${p.objetivo ? `<p><strong>Objetivo:</strong> ${escaparHtmlEbd(p.objetivo)}</p>` : ""}
      ${p.roteiro ? `<div class="roteiro-plano">${escaparHtmlEbd(p.roteiro)}</div>` : ""}
      ${(p.materiais || []).length ? `<ul>${p.materiais.map(m => {
        const url = linkSeguroEbd(m.url);
        return `<li>${url ? `<a href="${urlSegura(url)}" target="_blank" rel="noopener noreferrer">🔗 ${escaparHtmlEbd(m.titulo)}</a>` : escaparHtmlEbd(m.titulo)}</li>`;
      }).join("")}</ul>` : ""}
    </div>`).join("");
}

async function carregarPlanosTurmaEbdAcao() {
  const turmaId = Number(document.getElementById("salaTurmaId").value);
  const data = document.getElementById("salaData").value || dataLocalHojeEbd();
  const container = document.getElementById("painelPlanosTurmaEbd");
  if (!turmaId) { mostrarToast("Escolha a turma.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-sala/planos/turma?turmaId=${turmaId}&data=${encodeURIComponent(data)}`);
  const resposta = await jsonDaTela(res, container, "objeto");
  if (resposta === null) return;
  if (resposta.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(resposta.mensagem)}</p>`; return; }
  container.innerHTML = renderPlanosAulaEbd(resposta.planos);
}

async function carregarAusentesEbdAcao() {
  const turmaId = Number(document.getElementById("salaTurmaId").value);
  const container = document.getElementById("painelAusentesEbd");
  if (!turmaId) { mostrarToast("Escolha a turma.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-sala/ausentes?turmaId=${turmaId}`);
  const resposta = await jsonDaTela(res, container, "objeto");
  if (resposta === null) return;
  if (resposta.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(resposta.mensagem)}</p>`; return; }
  container.innerHTML = resposta.ausentes.length
    ? `<p class="subtitle">Sem presença há ${escaparHtmlEbd(resposta.minimo)} domingo(s) seguido(s) ou mais:</p>
      <table class="tabela-frequencia"><thead><tr><th>Id</th><th>Aluno</th><th>Domingos seguidos</th><th>Falta desde</th><th>Última presença</th></tr></thead><tbody>
        ${resposta.ausentes.map(a => `<tr><td>${a.alunoId}</td><td>${escaparHtmlEbd(a.nome)}</td><td>${escaparHtmlEbd(a.domingos)}</td>
          <td>${escaparHtmlEbd(formatarDataEbd(a.faltaDesde))}</td><td>${a.ultimaPresenca ? escaparHtmlEbd(formatarDataEbd(a.ultimaPresenca)) : "nenhuma no último semestre"}</td></tr>`).join("")}
      </tbody></table>`
    : `<p class="subtitle">Ninguém com ${escaparHtmlEbd(resposta.minimo)} domingo(s) seguido(s) de ausência. 🙌</p>`;
}

// ---- Plano de aula (Superintendente) ----
async function carregarOpcoesPlanosEbdAcao() {
  const selForm = document.getElementById("planoCongregacao");
  const selFiltro = document.getElementById("planoFiltroCongregacao");
  if (selForm && !selForm.dataset.montado) {
    const congs = (await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/congregacoes`))).filter(c => c.ativa !== false);
    const opcoes = congs.map(c => `<option value="${Number(c.congregacaoId)}">${escaparHtmlEbd(c.nome)}</option>`).join("");
    selForm.innerHTML = `<option value="">Campo inteiro (todas as congregações)</option>` + opcoes;
    selFiltro.innerHTML = `<option value="">Todas do meu escopo</option>` + opcoes;
    selForm.dataset.montado = "1";
  }
  const hoje = dataLocalHojeEbd();
  if (!document.getElementById("planoFiltroInicio").value) document.getElementById("planoFiltroInicio").value = hoje;
  if (!document.getElementById("planoFiltroFim").value) {
    const fim = new Date(); fim.setDate(fim.getDate() + 90);
    document.getElementById("planoFiltroFim").value = `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, "0")}-${String(fim.getDate()).padStart(2, "0")}`;
  }
}

async function carregarPlanosGestaoEbdAcao() {
  const inicio = document.getElementById("planoFiltroInicio").value;
  const fim = document.getElementById("planoFiltroFim").value;
  const congregacaoId = document.getElementById("planoFiltroCongregacao").value;
  const container = document.getElementById("painelPlanosGestaoEbd");
  const qs = new URLSearchParams({ dataInicio: inicio, dataFim: fim });
  if (congregacaoId) qs.set("congregacaoId", congregacaoId);
  const res = await fetchProtegido(`${API_BASE}/ebd-sala/planos?${qs.toString()}`);
  const resposta = await jsonDaTela(res, container, "objeto");
  if (resposta === null) return;
  if (resposta.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(resposta.mensagem)}</p>`; return; }
  container.innerHTML = resposta.planos.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Id</th><th>Data</th><th>Alcance</th><th>Faixa</th><th>Título</th><th>Status</th><th>Material</th><th></th></tr></thead><tbody>
        ${resposta.planos.map(p => `<tr>
          <td>${p.planoId}</td><td>${escaparHtmlEbd(formatarDataEbd(p.data))}</td>
          <td>${p.congregacaoId == null ? "Campo inteiro" : escaparHtmlEbd(p.congregacaoNome)}</td>
          <td>${p.faixaEtaria ? escaparHtmlEbd(p.faixaEtaria) : "todas"}</td><td>${escaparHtmlEbd(p.titulo)}</td>
          <td>${p.status === "PUBLICADO" ? "✅ Publicado" : "📝 Rascunho"}</td>
          <td>${(p.materiais || []).map(m => `${escaparHtmlEbd(m.titulo)} <button class="btn-link btn-link-perigo" data-on-click="removerMaterialPlanoEbdAcao" data-args-click="${argsAttr(Number(m.materialId))}">×</button>`).join("<br>") || "-"}</td>
          <td class="acoes-inline">
            <button class="btn-link" data-on-click="editarPlanoEbdAcao" data-args-click="${argsAttr(Number(p.planoId))}">editar</button>
            ${p.status === "PUBLICADO"
              ? `<button class="btn-link" data-on-click="publicarPlanoEbdAcao" data-args-click="${argsAttr(Number(p.planoId), false)}">despublicar</button>`
              : `<button class="btn-link" data-on-click="publicarPlanoEbdAcao" data-args-click="${argsAttr(Number(p.planoId), true)}">publicar</button>`}
            <button class="btn-link btn-link-perigo" data-on-click="excluirPlanoEbdAcao" data-args-click="${argsAttr(Number(p.planoId))}">excluir</button>
          </td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhum plano neste período.</p>";
}

function limparFormPlanoEbd() {
  ["planoEditandoId", "planoData", "planoFaixa", "planoTitulo", "planoReferencia", "planoObjetivo", "planoRoteiro"].forEach(id => { document.getElementById(id).value = ""; });
  document.getElementById("planoCongregacao").value = "";
  ["planoData", "planoCongregacao", "planoFaixa"].forEach(id => { document.getElementById(id).disabled = false; });
  document.getElementById("tituloFormPlanoEbd").textContent = "➕ Novo plano de aula";
}

async function editarPlanoEbdAcao(planoId) {
  const res = await fetchProtegido(`${API_BASE}/ebd-sala/plano?planoId=${planoId}`);
  const resposta = await res.json();
  if (resposta.sucesso === false) { mostrarToast(resposta.mensagem, "erro"); return; }
  const p = resposta.plano;
  document.getElementById("planoEditandoId").value = p.planoId;
  document.getElementById("planoData").value = p.data;
  document.getElementById("planoCongregacao").value = p.congregacaoId == null ? "" : String(p.congregacaoId);
  document.getElementById("planoFaixa").value = p.faixaEtaria || "";
  document.getElementById("planoTitulo").value = p.titulo;
  document.getElementById("planoReferencia").value = p.referencia || "";
  document.getElementById("planoObjetivo").value = p.objetivo || "";
  document.getElementById("planoRoteiro").value = p.roteiro || "";
  // Data, alcance e faixa não mudam depois de criado (mudar o alcance = novo plano).
  ["planoData", "planoCongregacao", "planoFaixa"].forEach(id => { document.getElementById(id).disabled = true; });
  document.getElementById("tituloFormPlanoEbd").textContent = `✏️ Editando o plano #${p.planoId}`;
  document.getElementById("detPlanoEbd").open = true;
  document.getElementById("materialPlanoId").value = p.planoId;
}

async function salvarPlanoEbdAcao() {
  const planoId = Number(document.getElementById("planoEditandoId").value) || null;
  const campos = {
    titulo: document.getElementById("planoTitulo").value.trim(),
    referencia: document.getElementById("planoReferencia").value.trim() || null,
    objetivo: document.getElementById("planoObjetivo").value.trim() || null,
    roteiro: document.getElementById("planoRoteiro").value.trim() || null
  };
  let corpo, rota;
  if (planoId) {
    rota = "planos/atualizar";
    corpo = Object.assign({ planoId }, campos);
  } else {
    rota = "planos";
    corpo = Object.assign({
      data: document.getElementById("planoData").value,
      congregacaoId: Number(document.getElementById("planoCongregacao").value) || null,
      faixaEtaria: document.getElementById("planoFaixa").value.trim() || null
    }, campos);
    if (!corpo.data) { mostrarToast("Informe a data (domingo) do plano.", "erro"); return; }
  }
  if (!campos.titulo) { mostrarToast("Informe o título.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-sala/${rota}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo)
  });
  const resposta = await res.json();
  mostrarToast(resposta.mensagem, resposta.sucesso === false ? "erro" : "sucesso");
  if (resposta.sucesso === false) return;
  if (resposta.planoId) document.getElementById("materialPlanoId").value = resposta.planoId;
  limparFormPlanoEbd();
  carregarPlanosGestaoEbdAcao();
}

async function publicarPlanoEbdAcao(planoId, publicar) {
  const res = await fetchProtegido(`${API_BASE}/ebd-sala/planos/${publicar ? "publicar" : "despublicar"}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planoId })
  });
  const resposta = await res.json();
  mostrarToast(resposta.mensagem, resposta.sucesso === false ? "erro" : "sucesso");
  if (resposta.sucesso !== false) carregarPlanosGestaoEbdAcao();
}

async function excluirPlanoEbdAcao(planoId) {
  if (!confirm("Excluir este plano de aula? Os professores deixam de vê-lo.")) return;
  const res = await fetchProtegido(`${API_BASE}/ebd-sala/planos/excluir`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planoId })
  });
  const resposta = await res.json();
  mostrarToast(resposta.mensagem, resposta.sucesso === false ? "erro" : "sucesso");
  if (resposta.sucesso !== false) carregarPlanosGestaoEbdAcao();
}

async function adicionarMaterialPlanoEbdAcao() {
  const planoId = Number(document.getElementById("materialPlanoId").value);
  const titulo = document.getElementById("materialTitulo").value.trim();
  const url = document.getElementById("materialUrl").value.trim();
  if (!planoId || !titulo || !url) { mostrarToast("Informe o id do plano, o título e o link.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-sala/planos/material`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planoId, titulo, url })
  });
  const resposta = await res.json();
  mostrarToast(resposta.mensagem, resposta.sucesso === false ? "erro" : "sucesso");
  if (resposta.sucesso === false) return;
  document.getElementById("materialTitulo").value = "";
  document.getElementById("materialUrl").value = "";
  carregarPlanosGestaoEbdAcao();
}

async function removerMaterialPlanoEbdAcao(materialId) {
  if (!confirm("Remover este material do plano?")) return;
  const res = await fetchProtegido(`${API_BASE}/ebd-sala/planos/material/remover`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ materialId })
  });
  const resposta = await res.json();
  mostrarToast(resposta.mensagem, resposta.sucesso === false ? "erro" : "sucesso");
  if (resposta.sucesso !== false) carregarPlanosGestaoEbdAcao();
}

// ---- Lições e atividades (v6.3) ----
const AJUDA_QUESTAO_EBD = {
  MULTIPLA_ESCOLHA: 'Opções: lista de textos, ex: ["Opção A","Opção B"]. Gabarito: índice da opção certa (0 = primeira), ex: 1',
  VF: 'Opções: não usa (deixe em branco). Gabarito: true ou false',
  ORDENAR: 'Opções: itens na ordem exibida, ex: ["Passo A","Passo B"]. Gabarito: os mesmos itens na ordem correta',
  COMPLETAR: 'Opções: não usa (deixe em branco). Gabarito: lista de respostas aceitas, ex: ["graça","graca"]',
  CORRESPONDENCIA: 'Opções: pares com id, ex: [{"id":1,"esquerda":"Moisés","direita":"Êxodo"}]. Gabarito: os mesmos pares (repita as opções)'
};

function atualizarFormularioQuestaoEbd() {
  const tipo = document.getElementById("ebdQuestaoTipo").value;
  document.getElementById("ebdQuestaoAjuda").textContent = AJUDA_QUESTAO_EBD[tipo] || "";
}

async function carregarConteudoLicaoEbdAcao() {
  const licaoId = document.getElementById("ebdConteudoLicaoId").value;
  if (!licaoId) { mostrarToast("Informe o id da lição.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-atividades/licao/conteudo?licaoId=${licaoId}`);
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  document.getElementById("ebdConteudoTitulo").value = data.licao.titulo || "";
  document.getElementById("ebdConteudoReferencia").value = data.licao.referencia || "";
  document.getElementById("ebdConteudoTexto").value = data.licao.conteudo || "";
}

async function salvarConteudoLicaoEbdAcao() {
  const licaoId = document.getElementById("ebdConteudoLicaoId").value;
  if (!licaoId) { mostrarToast("Informe o id da lição.", "erro"); return; }
  const titulo = document.getElementById("ebdConteudoTitulo").value.trim();
  const referencia = document.getElementById("ebdConteudoReferencia").value.trim();
  const conteudo = document.getElementById("ebdConteudoTexto").value.trim();
  const res = await fetchProtegido(`${API_BASE}/ebd-atividades/licao/conteudo`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licaoId: Number(licaoId), titulo: titulo || null, referencia: referencia || null, conteudo: conteudo || null })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
}

function renderPainelAtividadeEbd(atividade) {
  const container = document.getElementById("painelAtividadeEbd");
  if (!atividade) { container.innerHTML = "<p class='subtitle'>Nenhuma atividade criada ainda para esta lição.</p>"; return; }
  container.innerHTML = `
    <p class="subtitle">Atividade #${atividade.atividadeId}${atividade.titulo ? " — " + escaparHtmlEbd(atividade.titulo) : ""} (${atividade.questoes.length} questão(ões))</p>
    ${atividade.questoes.length ? `<table class="tabela-frequencia"><thead><tr><th>Ordem</th><th>Tipo</th><th>Enunciado</th></tr></thead><tbody>
      ${atividade.questoes.map(q => `<tr><td>${escaparHtmlEbd(q.ordem)}</td><td>${escaparHtmlEbd(q.tipo)}</td><td>${escaparHtmlEbd(q.enunciado)}</td></tr>`).join("")}
    </tbody></table>` : ""}
  `;
}

async function criarAtividadeEbdAcao() {
  const licaoId = document.getElementById("ebdAtividadeLicaoId").value;
  if (!licaoId) { mostrarToast("Informe o id da lição.", "erro"); return; }
  const titulo = document.getElementById("ebdAtividadeTitulo").value.trim();
  const res = await fetchProtegido(`${API_BASE}/ebd-atividades/atividade`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licaoId: Number(licaoId), titulo: titulo || null })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) carregarAtividadeEbdAcao();
}

async function carregarAtividadeEbdAcao() {
  const licaoId = document.getElementById("ebdAtividadeLicaoId").value;
  if (!licaoId) { mostrarToast("Informe o id da lição.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-atividades/atividade?licaoId=${licaoId}`);
  const data = await res.json();
  if (data.sucesso === false) { mostrarToast(data.mensagem, "erro"); return; }
  renderPainelAtividadeEbd(data.atividade);
}

async function adicionarQuestaoEbdAcao() {
  const atividadeId = document.getElementById("ebdQuestaoAtividadeId").value;
  const tipo = document.getElementById("ebdQuestaoTipo").value;
  const enunciado = document.getElementById("ebdQuestaoEnunciado").value.trim();
  const ordem = document.getElementById("ebdQuestaoOrdem").value;
  const opcoesTexto = document.getElementById("ebdQuestaoOpcoes").value.trim();
  const gabaritoTexto = document.getElementById("ebdQuestaoGabarito").value.trim();
  if (!atividadeId || !enunciado || !gabaritoTexto) { mostrarToast("Informe atividade, enunciado e gabarito.", "erro"); return; }
  let opcoes = null, gabarito;
  try {
    opcoes = opcoesTexto ? JSON.parse(opcoesTexto) : null;
    gabarito = JSON.parse(gabaritoTexto);
  } catch {
    mostrarToast("Opções/gabarito precisam ser JSON válido — veja o texto de ajuda acima.", "erro");
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/ebd-atividades/questao`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ atividadeId: Number(atividadeId), tipo, enunciado, opcoes, gabarito, ordem: ordem ? Number(ordem) : undefined })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) {
    document.getElementById("ebdQuestaoEnunciado").value = "";
    document.getElementById("ebdQuestaoOpcoes").value = "";
    document.getElementById("ebdQuestaoGabarito").value = "";
    document.getElementById("ebdAtividadeLicaoId").value && carregarAtividadeEbdAcao();
  }
}

function renderRespostaCampoEbd(questao) {
  if (questao.tipo === "VF") {
    const marcado = questao.resposta === true ? "true" : questao.resposta === false ? "false" : "";
    return `<select id="ebdRespostaCampo_${questao.questaoId}"><option value="">-</option><option value="true" ${marcado === "true" ? "selected" : ""}>Verdadeiro</option><option value="false" ${marcado === "false" ? "selected" : ""}>Falso</option></select>`;
  }
  // Trava 6-A: texto puro (COMPLETAR, índice digitado) volta como está —
  // JSON.stringify punha aspas literais no campo e o re-salvamento mandava
  // "\"graça\"", corrigido como errado. Só lista/objeto vira JSON.
  const r = questao.resposta;
  const valorAtual = r === null || r === undefined ? "" : typeof r === "object" ? JSON.stringify(r) : String(r);
  return `<input type="text" id="ebdRespostaCampo_${questao.questaoId}" value='${escaparHtmlEbd(valorAtual)}' placeholder="Resposta (JSON quando aplicável)" style="min-width:220px;" />`;
}

function renderPainelRespostasAlunoEbd(respostas, resumo) {
  const container = document.getElementById("painelRespostasAlunoEbd");
  if (!respostas.length) { container.innerHTML = "<p class='subtitle'>Esta atividade ainda não tem questões.</p>"; return; }
  container.innerHTML = `
    <p class="subtitle">Nota: <strong>${escaparHtmlEbd(resumo.corretas)}/${escaparHtmlEbd(resumo.totalQuestoes)}</strong> (${escaparHtmlEbd(resumo.percentual)}%) —
      respondidas: ${escaparHtmlEbd(resumo.respondidas)} · pendentes de revisão: ${escaparHtmlEbd(resumo.pendentes)}</p>
    <table class="tabela-frequencia"><thead><tr><th>Tipo</th><th>Enunciado</th><th>Resposta</th><th>Correção</th><th></th></tr></thead><tbody>
      ${respostas.map(q => `<tr>
        <td>${escaparHtmlEbd(q.tipo)}</td><td>${escaparHtmlEbd(q.enunciado)}</td>
        <td>${renderRespostaCampoEbd(q)}
          <button class="btn-link" data-on-click="salvarRespostaEbdAcao" data-args-click="${argsAttr(q.questaoId)}">💾</button>
        </td>
        <td>${q.respondida ? (q.correta === true ? "✅ Certa" : q.correta === false ? "❌ Errada" : "⏳ Pendente") : "-"} ${q.corrigidoManualmente ? "(manual)" : ""}</td>
        <td>${q.respondida ? `
          <button class="btn-link" data-on-click="corrigirRespostaManualEbdAcao" data-args-click="${argsAttr(q.respostaId, true)}">✔️ Marcar certa</button>
          <button class="btn-link" data-on-click="corrigirRespostaManualEbdAcao" data-args-click="${argsAttr(q.respostaId, false)}">✖️ Marcar errada</button>` : ""}
        </td>
      </tr>`).join("")}
    </tbody></table>
  `;
}

async function carregarRespostasAlunoEbdAcao() {
  const atividadeId = document.getElementById("ebdRespostaAtividadeId").value;
  const alunoId = document.getElementById("ebdRespostaAlunoId").value;
  const container = document.getElementById("painelRespostasAlunoEbd");
  if (!atividadeId || !alunoId) { container.innerHTML = ""; mostrarToast("Informe a atividade e o aluno.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-atividades/respostas?atividadeId=${atividadeId}&alunoId=${alunoId}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  renderPainelRespostasAlunoEbd(data.respostas, data.resumo);
}

async function salvarRespostaEbdAcao(questaoId) {
  const alunoId = document.getElementById("ebdRespostaAlunoId").value;
  const campo = document.getElementById(`ebdRespostaCampo_${questaoId}`);
  if (!alunoId || !campo) return;
  let resposta = campo.value;
  if (resposta === "true") resposta = true;
  else if (resposta === "false") resposta = false;
  else if (resposta.trim().startsWith("[") || resposta.trim().startsWith("{")) {
    try { resposta = JSON.parse(resposta); } catch { /* mantém como texto */ }
  }
  const res = await fetchProtegido(`${API_BASE}/ebd-atividades/resposta`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questaoId, alunoId: Number(alunoId), resposta })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) carregarRespostasAlunoEbdAcao();
}

async function corrigirRespostaManualEbdAcao(respostaId, correta) {
  const alunoId = document.getElementById("ebdRespostaAlunoId").value;
  const res = await fetchProtegido(`${API_BASE}/ebd-atividades/resposta/corrigir`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ respostaId, correta, alunoId: Number(alunoId) })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) carregarRespostasAlunoEbdAcao();
}

async function carregarResumoAtividadeTurmaEbdAcao() {
  const atividadeId = document.getElementById("ebdResumoAtividadeId").value;
  const turmaId = document.getElementById("ebdResumoTurmaId").value;
  const container = document.getElementById("painelResumoAtividadeEbd");
  if (!atividadeId || !turmaId) { container.innerHTML = ""; mostrarToast("Informe a atividade e a turma.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-atividades/resumo?atividadeId=${atividadeId}&turmaId=${turmaId}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.resumo.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Id</th><th>Matrícula</th><th>Nome</th><th>Corretas</th><th>%</th></tr></thead><tbody>
        ${data.resumo.map(a => `<tr><td>${a.alunoId}</td><td>${escaparHtmlEbd(a.matricula)}</td><td>${escaparHtmlEbd(a.membroNome)}</td><td>${escaparHtmlEbd(a.corretas)}/${escaparHtmlEbd(a.totalQuestoes)}</td><td>${escaparHtmlEbd(a.percentual)}%</td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhum aluno ativo nesta turma.</p>";
}

// ---- Certificados (v6.5 — fecha a FASE 6) ----
// Mesmo par "PDF de verdade (servidor, pdfkit) + página imprimível
// (window.print())" de imprimirCarta/baixarPdfCarta (vB.6) — só que aqui a
// emissão em si já é o evento real (sem rascunho), então a lista já vem
// pronta pra baixar/imprimir assim que emitida.
let certificadosCache = [];

async function emitirCertificadoEbdAcao() {
  const membroId = Number(document.getElementById("certMatricula").value);
  const titulo = document.getElementById("certTitulo").value.trim();
  const descricao = document.getElementById("certDescricao").value.trim();
  const conquistaIdBruto = document.getElementById("certConquistaId").value;
  const conquistaId = conquistaIdBruto ? Number(conquistaIdBruto) : null;
  const resultadoEl = document.getElementById("resultadoCertificadoEbd");
  if (!membroId || !titulo) {
    resultadoEl.textContent = "Informe a matrícula e o título do certificado.";
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/certificados/emitir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, titulo, descricao: descricao || null, conquistaId })
  });
  const data = await res.json();
  avisarResultado(data);
  resultadoEl.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("certTitulo").value = "";
    document.getElementById("certDescricao").value = "";
    document.getElementById("certConquistaId").value = "";
    document.getElementById("certBuscaMatricula").value = membroId;
    carregarCertificadosEbdAcao();
  }
}

async function carregarCertificadosEbdAcao() {
  const membroId = Number(document.getElementById("certBuscaMatricula").value);
  const container = document.getElementById("painelCertificadosEbd");
  if (!membroId) { container.innerHTML = ""; mostrarToast("Informe a matrícula.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/certificados?membroId=${membroId}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  certificadosCache = data.certificados || [];
  renderizarCertificadosEbd();
}

function renderizarCertificadosEbd() {
  const container = document.getElementById("painelCertificadosEbd");
  if (!certificadosCache.length) { container.innerHTML = "<p class='subtitle'>Nenhum certificado emitido para esta matrícula.</p>"; return; }
  const podeRevogar = authPermissoes.includes("ebd_gestao") || authPermissoes.includes("trilhas_gestao");
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>ID</th><th>Título</th><th>Conquista</th><th>Protocolo</th><th>Emitido em</th><th>Situação</th><th>Código de verificação</th><th class="acoes-inline"></th>
  </tr></thead><tbody>`;
  certificadosCache.forEach(c => {
    html += `<tr>
      <td>${c.certificadoId}</td>
      <td>${escaparHtmlEbd(c.titulo)}</td>
      <td>${escaparHtmlEbd(c.conquistaNome || "-")}</td>
      <td>${escaparHtmlEbd(c.protocolo)}</td>
      <td>${c.dataEmissao ? new Date(c.dataEmissao).toLocaleDateString("pt-BR") : "-"}</td>
      <td>${situacaoCertificadoFormacao(c)}</td>
      <td>${c.codigoVerificacao ? `<code>${escaparHtmlEbd(c.codigoVerificacao)}</code>` : "-"}</td>
      <td class="acoes-inline">
        <button class="btn-link" data-on-click="imprimirCertificado" data-args-click="${argsAttr(c.certificadoId)}">🖨️ Imprimir</button>
        <button class="btn-link" data-on-click="baixarPdfCertificado" data-args-click="${argsAttr(c.certificadoId, c.membroId)}">📄 Baixar PDF</button>
        ${c.codigoVerificacao ? `<button class="btn-link" data-on-click="copiarLinkVerificacaoAcao" data-args-click="${argsAttr(String(c.codigoVerificacao ?? ""))}">🔗 Copiar link de verificação</button>` : ""}
        ${podeRevogar && !c.revogadoEm ? `<button class="btn-link btn-link-perigo" data-on-click="revogarCertificadoAcao" data-args-click="${argsAttr(c.certificadoId)}">⛔ Revogar</button>` : ""}
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

// v6.9 — situação do certificado a partir dos campos que a API devolve
// (calculada aqui só pra exibição; quem decide de verdade é o servidor).
function situacaoCertificadoFormacao(c) {
  if (c.revogadoEm) return "⛔ Revogado";
  if (!c.validoAte) return "🟢 Válido (não vence)";
  const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
  const validade = new Date(`${c.validoAte}T12:00:00`);
  const dias = Math.round((validade - hoje) / 86400000);
  if (dias < 0) return `🔴 Vencido em ${formatarDataEbd(c.validoAte)}`;
  if (dias <= 60) return `🟠 Vence em ${dias} dia(s) (${formatarDataEbd(c.validoAte)})`;
  return `🟢 Válido até ${formatarDataEbd(c.validoAte)}`;
}

function copiarLinkVerificacaoAcao(codigo) {
  const url = `${location.origin}/verificar.html?c=${encodeURIComponent(codigo)}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => mostrarToast("Link de verificação copiado.", "sucesso"), () => prompt("Copie o link de verificação:", url));
  } else {
    prompt("Copie o link de verificação:", url);
  }
}

async function revogarCertificadoAcao(certificadoId) {
  const motivo = prompt("Motivo da revogação (não aparece na verificação pública; mínimo 5 caracteres):");
  if (!motivo) return;
  if (!confirm("Revogar este certificado? Ele deixa de valer como formação (a verificação pública passa a dizer REVOGADO).")) return;
  const res = await fetchProtegido(`${API_BASE}/certificados/revogar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ certificadoId, motivo })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) {
    if (document.getElementById("certBuscaMatricula") && document.getElementById("certBuscaMatricula").value) carregarCertificadosEbdAcao();
    if (document.getElementById("trilFormMembroId") && document.getElementById("trilFormMembroId").value) carregarFormacaoPessoaAcao();
  }
}

// Trava 6-B: PDF e QR do certificado exigem sessão (antes bastava o par id +
// matrícula, dois números sequenciais, e o PDF leva o código de verificação).
async function baixarPdfCertificado(certificadoId) {
  const res = await fetchProtegido(`${API_BASE}/certificados/${certificadoId}/pdf`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    mostrarToast((data && data.mensagem) || "Não foi possível gerar o PDF.", "erro");
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `certificado-${certificadoId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function imprimirCertificado(certificadoId) {
  const c = (certificadosCache || []).find(x => x.certificadoId === certificadoId);
  if (c) renderizarImpressaoCertificado(c);
}

async function renderizarImpressaoCertificado(c) {
  const dataEmissaoFmt = c.dataEmissao ? new Date(c.dataEmissao).toLocaleDateString("pt-BR") : "____/____/______";
  // A janela abre já no clique (senão o navegador a bloqueia como pop-up);
  // o conteúdo entra depois que o QR chega.
  const w = window.open("", "_blank", "width=760,height=900");
  if (!w) { mostrarToast("O navegador bloqueou a janela de impressão — permita pop-ups para este site.", "erro"); return; }
  // v6.9 — QR de verificação pública (SVG do servidor, mesma regra do PDF) +
  // código e endereço em texto, pra quem não puder ler o QR. Trava 6-B: o SVG
  // vem pela sessão e entra como data URL (um <img src> não manda o token).
  const urlBase = `${location.origin}/verificar.html`;
  let urlQr = "";
  if (c.codigoVerificacao) {
    try {
      const resQr = await fetchProtegido(`${API_BASE}/certificados/${c.certificadoId}/qr`);
      if (resQr.ok) urlQr = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await resQr.text())}`;
    } catch (e) { /* sem o QR, o código em texto continua no papel */ }
  }
  const blocoVerificacao = c.codigoVerificacao ? `
    <div class="verif">${urlQr ? `<img src="${urlQr}" alt="QR Code de verificação" width="110" height="110" />` : ""}
      <div><strong>Verifique a autenticidade deste certificado</strong><br />Aponte a câmera para o QR Code ou acesse<br />
      <strong>${escaparHtmlEbd(urlBase)}</strong><br />e informe o código: <strong>${escaparHtmlEbd(c.codigoVerificacao)}</strong></div></div>` : "";
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Certificado</title>
  <style>
    body{font-family:Georgia,serif;color:#111;padding:40px;}
    .certificado{max-width:680px;margin:auto;border:2px solid #d9b34f;padding:32px;}
    .cab{text-align:center;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:20px;}
    h1{font-size:17px;margin:0 0 4px;} h2{font-size:22px;margin:8px 0 24px;text-align:center;letter-spacing:2px;}
    .sub{font-size:12px;color:#555;} p{line-height:1.8;margin:8px 0;font-size:14px;}
    .desc{font-style:italic;margin:14px 0;}
    .rodape{margin-top:44px;display:flex;justify-content:space-around;font-size:12px;text-align:center;}
    .rodape div{border-top:1px solid #111;padding-top:4px;width:220px;}
    .protocolo{margin-top:24px;font-size:11px;color:#555;text-align:center;}
    .verif{display:flex;align-items:center;gap:14px;margin-top:28px;font-size:11px;color:#333;border-top:1px dashed #999;padding-top:14px;}
    .revogado{color:#b3261e;font-weight:bold;text-align:center;margin:0 0 14px;}
  </style></head><body><div class="certificado">
    <div class="cab"><h1>IGREJA EVANGÉLICA ASSEMBLEIA DE DEUS</h1><div class="sub">Ministério do SETA em Parauapebas — PA · IEADESPA</div></div>
    <h2>CERTIFICADO</h2>
    ${c.revogadoEm ? `<p class="revogado">CERTIFICADO REVOGADO em ${new Date(c.revogadoEm).toLocaleDateString("pt-BR")} — não tem validade.</p>` : ""}
    <p>Certificamos que <strong>${escaparHtmlEbd(c.nome)}</strong> (Cartão de Membro nº ${c.membroId}) ${escaparHtmlEbd(c.titulo)}${c.conquistaNome ? `, referente à conquista "${escaparHtmlEbd(c.conquistaNome)}"` : ""}.</p>
    ${c.descricao ? `<p class="desc">${escaparHtmlEbd(c.descricao)}</p>` : ""}
    <p>Emitido em ${dataEmissaoFmt}${c.validoAte ? `, válido até ${formatarDataEbd(c.validoAte)}` : ""}.</p>
    <div class="rodape"><div>Pastor Congregacional</div><div>Secretário(a) da EBD</div></div>
    <p class="protocolo">Protocolo ${escaparHtmlEbd(c.protocolo)}</p>
    ${blocoVerificacao}
  </div></body></html>`);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 300);
}

// ---- Trava 6-B — LGPD da EBD: titular sem cadastro de membro ----
async function buscarTitularesEbdDpoAcao() {
  const nome = document.getElementById("dpoEbdBusca").value.trim();
  const container = document.getElementById("resultadoTitularesEbdDpo");
  if (nome.length < 3) { mostrarToast("Digite pelo menos 3 letras do nome.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-turmas/lgpd/buscar?nome=${encodeURIComponent(nome)}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  const alunos = data.alunos.length
    ? `<h5>Alunos não-membros</h5><table class="tabela-frequencia"><thead><tr><th>Id</th><th>Nome</th><th>Turma</th><th>Situação</th><th></th></tr></thead><tbody>
        ${data.alunos.map(a => `<tr><td>${a.alunoId}</td><td>${escaparHtmlEbd(a.nome)}</td><td>${escaparHtmlEbd(a.turmaNome)} — ${escaparHtmlEbd(a.congregacaoNome)}</td>
          <td>${a.ativo ? "Matrícula ativa" : "Encerrada"}</td>
          <td><button class="btn-link btn-link-perigo" data-on-click="anonimizarAlunoEbdDpoAcao" data-args-click="${argsAttr(Number(a.alunoId))}">anonimizar</button></td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhum aluno não-membro com esse nome.</p>";
  const visitantes = data.visitantes.length
    ? `<h5>Visitantes</h5><table class="tabela-frequencia"><thead><tr><th>Registro</th><th>Nome</th><th>Data</th><th>Turma</th><th></th></tr></thead><tbody>
        ${data.visitantes.map(v => `<tr><td>${v.chamadaId}</td><td>${escaparHtmlEbd(v.nome)}${v.temContato ? " <span class=\"subtitle\">(com contato)</span>" : ""}</td>
          <td>${escaparHtmlEbd(formatarDataEbd(v.data))}</td><td>${escaparHtmlEbd(v.turmaNome)} — ${escaparHtmlEbd(v.congregacaoNome)}</td>
          <td><button class="btn-link btn-link-perigo" data-on-click="anonimizarVisitanteEbdDpoAcao" data-args-click="${argsAttr(Number(v.chamadaId))}">anonimizar</button></td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhum visitante com esse nome.</p>";
  container.innerHTML = alunos + visitantes;
}

async function anonimizarAlunoEbdDpoAcao(alunoId) {
  if (!confirm("Anonimizar este aluno não-membro? Nome, contato, nascimento e responsável são apagados para sempre e a matrícula é encerrada. A presença dele continua contando nos números da EBD.")) return;
  const res = await fetchProtegido(`${API_BASE}/ebd-turmas/lgpd/anonimizar-aluno`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alunoId })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) buscarTitularesEbdDpoAcao();
}

async function anonimizarVisitanteEbdDpoAcao(chamadaId) {
  if (!confirm("Anonimizar este visitante? Nome e contato são apagados para sempre; a visita continua contando na chamada.")) return;
  const res = await fetchProtegido(`${API_BASE}/ebd-turmas/lgpd/anonimizar-visitante`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chamadaId })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) buscarTitularesEbdDpoAcao();
}

// ---- Formação e certificação (v6.9) ----
// Trilhas por papel, matrícula/progresso, certificado verificável e os
// REQUISITOS que exigem a formação nos fluxos. Toda regra está no servidor
// (shared/trilhas.js); aqui só se monta a tela. Texto vindo do banco passa
// por escaparHtmlEbd (v6.8).
const ROTULO_SITUACAO_TRILHA = {
  EM_ANDAMENTO: "🟡 Em andamento", VIGENTE: "🟢 Vigente", VENCENDO: "🟠 Vencendo", VENCIDA: "🔴 Vencida",
  REVOGADA: "⛔ Revogada", CANCELADA: "⚪ Cancelada", NAO_INICIADA: "— Não iniciada"
};
let catalogoTrilhasCache = [];

async function postarTrilhas(acao, corpo) {
  const res = await fetchProtegido(`${API_BASE}/trilhas/${acao}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  return res.json();
}

function mostrarResultadoTrilhas(data, idMensagem) {
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  const el = document.getElementById(idMensagem);
  if (el) el.textContent = data.mensagem || "";
}

function carregarOpcoesTrilhasAcao() {
  carregarCatalogoTrilhasAcao();
  carregarRequisitosTrilhasAcao();
}

// -- Catálogo --
async function carregarCatalogoTrilhasAcao() {
  const container = document.getElementById("painelCatalogoTrilhas");
  const todas = document.getElementById("trilhasMostrarInativas").checked ? "?todas=1" : "";
  const res = await fetchProtegido(`${API_BASE}/trilhas/catalogo${todas}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  catalogoTrilhasCache = data.trilhas || [];
  const nomePorId = new Map(catalogoTrilhasCache.map(t => [t.trilhaId, t.nome]));
  container.innerHTML = catalogoTrilhasCache.length ? catalogoTrilhasCache.map(t => {
    const tituloModulo = new Map(t.modulos.map(m => [m.moduloId, m.titulo]));
    const exige = t.preRequisitosTrilha.length ? t.preRequisitosTrilha.map(id => escaparHtmlEbd(nomePorId.get(id) || `#${id}`)).join(", ") : "nenhuma";
    return `<div class="cartao-area-ebd" style="margin-bottom:12px;${t.ativa ? "" : "opacity:.6;"}">
      <h5>🎓 #${t.trilhaId} ${escaparHtmlEbd(t.nome)}${t.ativa ? "" : " (desativada)"}</h5>
      <p class="subtitle">Papel-alvo: ${escaparHtmlEbd(t.papelAlvo || "—")} · Validade do certificado: ${t.validadeMeses ? `${escaparHtmlEbd(t.validadeMeses)} meses` : "não vence"}
        · Aviso: ${escaparHtmlEbd(t.avisoDias)} dias · Exige antes: ${exige}</p>
      ${t.descricao ? `<p class="subtitle">${escaparHtmlEbd(t.descricao)}</p>` : ""}
      ${t.modulos.length ? `<table class="tabela-frequencia"><thead><tr><th>Id</th><th>Ordem</th><th>Módulo</th><th>Carga (h)</th><th>Obrigatório</th><th>Exige módulo(s)</th></tr></thead><tbody>
        ${t.modulos.map(m => `<tr style="${m.ativo ? "" : "opacity:.5;"}"><td>${m.moduloId}</td><td>${escaparHtmlEbd(m.ordem)}</td><td>${escaparHtmlEbd(m.titulo)}${m.ativo ? "" : " (desativado)"}</td>
          <td>${escaparHtmlEbd(m.cargaHoraria)}</td><td>${m.obrigatorio ? "Sim" : "Opcional"}</td>
          <td>${m.preRequisitos.length ? m.preRequisitos.map(id => escaparHtmlEbd(tituloModulo.get(id) || `#${id}`)).join(", ") : "—"}</td></tr>`).join("")}
      </tbody></table>` : "<p class='subtitle'>Sem módulos ainda — cadastre ao menos um obrigatório para poder matricular alguém.</p>"}
    </div>`;
  }).join("") : "<p class='subtitle'>Nenhuma trilha cadastrada ainda.</p>";
}

async function criarTrilhaAcao() {
  const nome = document.getElementById("trilNovaNome").value.trim();
  if (!nome) { mostrarToast("Informe o nome da trilha.", "erro"); return; }
  const data = await postarTrilhas("criar", {
    nome, papelAlvo: document.getElementById("trilNovaPapel").value.trim() || null,
    validadeMeses: numeroDoCampo("trilNovaValidade"), avisoDias: numeroDoCampo("trilNovaAviso"),
    descricao: document.getElementById("trilNovaDescricao").value.trim() || null
  });
  mostrarResultadoTrilhas(data, "resultadoCatalogoTrilhas");
  if (data.sucesso !== false) {
    ["trilNovaNome", "trilNovaPapel", "trilNovaValidade", "trilNovaAviso", "trilNovaDescricao"].forEach(id => { document.getElementById(id).value = ""; });
    carregarCatalogoTrilhasAcao();
  }
}

async function adicionarModuloTrilhaAcao() {
  const trilhaId = numeroDoCampo("trilModTrilhaId");
  const titulo = document.getElementById("trilModTitulo").value.trim();
  if (!trilhaId || !titulo) { mostrarToast("Informe o Id da trilha e o título do módulo.", "erro"); return; }
  const data = await postarTrilhas("modulos", {
    trilhaId, titulo, cargaHoraria: numeroDoCampo("trilModCarga"), ordem: numeroDoCampo("trilModOrdem"),
    obrigatorio: document.getElementById("trilModObrigatorio").checked
  });
  mostrarResultadoTrilhas(data, "resultadoCatalogoTrilhas");
  if (data.sucesso !== false) {
    ["trilModTitulo", "trilModCarga", "trilModOrdem"].forEach(id => { document.getElementById(id).value = ""; });
    carregarCatalogoTrilhasAcao();
  }
}

async function preRequisitoModuloAcao() {
  const moduloId = numeroDoCampo("trilPreModuloId"), preRequisitoModuloId = numeroDoCampo("trilPreModuloExigeId");
  if (!moduloId || !preRequisitoModuloId) { mostrarToast("Informe os dois Ids de módulo.", "erro"); return; }
  const data = await postarTrilhas("modulos/pre-requisito", { moduloId, preRequisitoModuloId });
  mostrarResultadoTrilhas(data, "resultadoCatalogoTrilhas");
  if (data.sucesso !== false) carregarCatalogoTrilhasAcao();
}

async function preRequisitoTrilhaAcao(remover) {
  const trilhaId = numeroDoCampo("trilPreTrilhaId"), preRequisitoTrilhaId = numeroDoCampo("trilPreTrilhaExigeId");
  if (!trilhaId || !preRequisitoTrilhaId) { mostrarToast("Informe os dois Ids de trilha.", "erro"); return; }
  const data = await postarTrilhas(remover ? "pre-requisito/remover" : "pre-requisito", { trilhaId, preRequisitoTrilhaId });
  mostrarResultadoTrilhas(data, "resultadoCatalogoTrilhas");
  if (data.sucesso !== false) carregarCatalogoTrilhasAcao();
}

async function definirTrilhaAtivaAcao(ativa) {
  const trilhaId = numeroDoCampo("trilAtivaTrilhaId");
  if (!trilhaId) { mostrarToast("Informe o Id da trilha.", "erro"); return; }
  const data = await postarTrilhas("atualizar", { trilhaId, ativa });
  mostrarResultadoTrilhas(data, "resultadoCatalogoTrilhas");
  if (data.sucesso !== false) carregarCatalogoTrilhasAcao();
}

async function definirModuloAtivoAcao(ativo) {
  const moduloId = numeroDoCampo("trilAtivoModuloId");
  if (!moduloId) { mostrarToast("Informe o Id do módulo.", "erro"); return; }
  const data = await postarTrilhas("modulos/atualizar", { moduloId, ativo });
  mostrarResultadoTrilhas(data, "resultadoCatalogoTrilhas");
  if (data.sucesso !== false) carregarCatalogoTrilhasAcao();
}

// -- Matrículas e progresso --
async function matricularTrilhaAcao() {
  const trilhaId = numeroDoCampo("trilMatTrilhaId"), membroId = numeroDoCampo("trilMatMembroId");
  if (!trilhaId || !membroId) { mostrarToast("Informe o Id da trilha e a matrícula do membro.", "erro"); return; }
  const data = await postarTrilhas("matricular", { trilhaId, membroId });
  mostrarResultadoTrilhas(data, "resultadoMatriculaTrilha");
  if (data.sucesso !== false) {
    document.getElementById("trilFormMembroId").value = membroId;
    await carregarFormacaoPessoaAcao();
    abrirMatriculaTrilhaAcao(data.matriculaId);
  }
}

async function carregarFormacaoPessoaAcao() {
  const membroId = numeroDoCampo("trilFormMembroId");
  const container = document.getElementById("painelFormacaoPessoa");
  if (!membroId) { container.innerHTML = ""; mostrarToast("Informe a matrícula do membro.", "erro"); return; }
  const [resF, resC] = await Promise.all([
    fetchProtegido(`${API_BASE}/trilhas/formacao?membroId=${membroId}`),
    fetchProtegido(`${API_BASE}/certificados?membroId=${membroId}`)
  ]);
  const data = await resF.json();
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  const certs = await resC.json();
  if (certs.sucesso !== false) certificadosCache = certs.certificados || []; // alimenta imprimirCertificado
  container.innerHTML = renderFormacaoTabela(data.formacao, { gestao: true });
}

// Tabela de formação de uma pessoa (vista pela gestão e, sem ações, pela própria pessoa).
function renderFormacaoTabela(formacao, { gestao }) {
  if (!formacao.length) return "<p class='subtitle'>Nenhuma trilha iniciada por esta pessoa.</p>";
  return `<div style="overflow-x:auto;"><table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Trilha</th><th>Situação</th><th>Progresso</th><th>Válido até</th><th>Certificado</th><th></th></tr></thead><tbody>
    ${formacao.map(f => {
      const cert = f.certificado;
      const validade = f.validoAte ? `${formatarDataEbd(f.validoAte)}${f.situacao === "VENCENDO" ? ` (em ${escaparHtmlEbd(f.diasParaVencer)} dia(s))` : ""}` : (f.status === "CONCLUIDA" ? "não vence" : "—");
      const acoes = gestao ? `
        <button class="btn-link" data-on-click="abrirMatriculaTrilhaAcao" data-args-click="${argsAttr(f.matriculaId)}">📋 Abrir</button>
        ${f.status === "EM_ANDAMENTO" ? `<button class="btn-link btn-link-perigo" data-on-click="cancelarMatriculaTrilhaAcao" data-args-click="${argsAttr(f.matriculaId)}">✖ Cancelar</button>` : ""}
        ${f.status === "CONCLUIDA" && !cert ? `<button class="btn-link" data-on-click="emitirCertificadoMatriculaAcao" data-args-click="${argsAttr(f.matriculaId)}">🎓 Emitir certificado</button>` : ""}
        ${cert && !cert.revogadoEm ? `<button class="btn-link btn-link-perigo" data-on-click="revogarCertificadoAcao" data-args-click="${argsAttr(cert.certificadoId)}">⛔ Revogar certificado</button>` : ""}` : "";
      return `<tr>
        <td>${f.matriculaId}</td><td>${escaparHtmlEbd(f.trilhaNome)}</td><td>${ROTULO_SITUACAO_TRILHA[f.situacao] || escaparHtmlEbd(f.situacao)}</td>
        <td>${escaparHtmlEbd(f.obrigatoriosConcluidos)}/${escaparHtmlEbd(f.obrigatoriosTotal)}</td><td>${validade}</td>
        <td>${cert ? `<code>${escaparHtmlEbd(cert.codigoVerificacao || "")}</code>${cert.revogadoEm ? " (revogado)" : ""}` : "—"}</td>
        <td class="acoes-inline">${acoes}</td></tr>`;
    }).join("")}
  </tbody></table></div>`;
}

async function abrirMatriculaTrilhaAcao(matriculaId) {
  const container = document.getElementById("painelMatriculaTrilha");
  const res = await fetchProtegido(`${API_BASE}/trilhas/matricula?matriculaId=${matriculaId}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  const m = data.matricula, p = m.progresso;
  const emAndamento = m.status === "EM_ANDAMENTO";
  container.innerHTML = `<div class="cartao-area-ebd" style="margin:10px 0;">
    <h5>📋 Matrícula #${m.matriculaId} — ${escaparHtmlEbd(m.trilha.nome)}</h5>
    <p>${ROTULO_SITUACAO_TRILHA[m.situacao] || escaparHtmlEbd(m.status)} · ${escaparHtmlEbd(p.obrigatoriosConcluidos)}/${escaparHtmlEbd(p.obrigatoriosTotal)} módulos obrigatórios (${escaparHtmlEbd(p.percentual)}%) ·
      carga horária ${escaparHtmlEbd(p.cargaHorariaConcluida)}h de ${escaparHtmlEbd(p.cargaHorariaTotal)}h${m.validoAte ? ` · válido até ${formatarDataEbd(m.validoAte)}` : ""}</p>
    ${emAndamento ? `<div class="barra-lista">
      <input type="date" id="trilConclData" style="max-width:160px;" title="Data da conclusão (vazio = hoje)" />
      <input type="text" id="trilConclObs" placeholder="Observação (opcional)" style="min-width:220px;" />
    </div>` : ""}
    <table class="tabela-frequencia"><thead><tr><th>Ordem</th><th>Módulo</th><th>Carga (h)</th><th></th><th>Situação</th><th></th></tr></thead><tbody>
      ${p.modulos.map(mod => `<tr>
        <td>${escaparHtmlEbd(mod.ordem)}</td><td>${escaparHtmlEbd(mod.titulo)}</td><td>${escaparHtmlEbd(mod.cargaHoraria)}</td><td>${mod.obrigatorio ? "" : "opcional"}</td>
        <td>${mod.status === "CONCLUIDO" ? "✅ Concluído" : (mod.status === "BLOQUEADO" ? `🔒 Exige: ${mod.bloqueadoPor.map(escaparHtmlEbd).join(", ")}` : "▶️ Disponível")}</td>
        <td>${emAndamento && mod.status === "DISPONIVEL" ? `<button class="btn-link" data-on-click="concluirModuloTrilhaAcao" data-args-click="${argsAttr(m.matriculaId, mod.moduloId)}">✔ Concluir módulo</button>` : ""}</td>
      </tr>`).join("")}
    </tbody></table>
  </div>`;
}

async function concluirModuloTrilhaAcao(matriculaId, moduloId) {
  const campoData = document.getElementById("trilConclData"), campoObs = document.getElementById("trilConclObs");
  const data = await postarTrilhas("modulos/concluir", {
    matriculaId, moduloId, data: (campoData && campoData.value) || null, observacao: (campoObs && campoObs.value.trim()) || null
  });
  mostrarResultadoTrilhas(data, "resultadoMatriculaTrilha");
  if (data.sucesso === false) return;
  if (data.matriculaConcluida && data.codigoVerificacao) {
    document.getElementById("resultadoMatriculaTrilha").textContent = `${data.mensagem} Código de verificação: ${data.codigoVerificacao}`;
  }
  abrirMatriculaTrilhaAcao(matriculaId);
  if (numeroDoCampo("trilFormMembroId")) carregarFormacaoPessoaAcao();
}

async function cancelarMatriculaTrilhaAcao(matriculaId) {
  const motivo = prompt("Motivo do cancelamento (mínimo 5 caracteres):");
  if (!motivo) return;
  const data = await postarTrilhas("matricula/cancelar", { matriculaId, motivo });
  mostrarResultadoTrilhas(data, "resultadoMatriculaTrilha");
  if (data.sucesso !== false) { document.getElementById("painelMatriculaTrilha").innerHTML = ""; carregarFormacaoPessoaAcao(); }
}

async function emitirCertificadoMatriculaAcao(matriculaId) {
  const data = await postarTrilhas("matricula/emitir-certificado", { matriculaId });
  mostrarResultadoTrilhas(data, "resultadoMatriculaTrilha");
  if (data.sucesso !== false) carregarFormacaoPessoaAcao();
}

// -- Requisitos --
async function carregarRequisitosTrilhasAcao() {
  const container = document.getElementById("painelRequisitosTrilhas");
  const res = await fetchProtegido(`${API_BASE}/trilhas/requisitos`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  const sel = document.getElementById("trilReqContexto");
  if (sel && !sel.dataset.montado) {
    sel.innerHTML = data.contextos.map(c => `<option value="${escaparHtmlEbd(c.contexto)}">${escaparHtmlEbd(c.rotulo)}</option>`).join("");
    sel.dataset.montado = "1";
  }
  container.innerHTML = data.requisitos.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Id</th><th>Onde</th><th>Alvo</th><th>Trilha exigida</th><th>Modo</th><th></th></tr></thead><tbody>
        ${data.requisitos.map(r => `<tr><td>${r.requisitoId}</td><td>${escaparHtmlEbd(r.contextoRotulo)}</td><td>${escaparHtmlEbd(r.alvoChave || "(todos)")}</td>
          <td>#${r.trilhaId} ${escaparHtmlEbd(r.trilhaNome)}${r.trilhaAtiva ? "" : " (desativada)"}</td><td>${r.modo === "BLOQUEIA" ? "⛔ Bloqueia" : "⚠️ Só alerta"}</td>
          <td>${authGeral ? `<button class="btn-link btn-link-perigo" data-on-click="removerRequisitoTrilhaAcao" data-args-click="${argsAttr(r.requisitoId)}">Remover</button>` : ""}</td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhum requisito configurado — nenhum fluxo exige formação hoje.</p>";
}

async function criarRequisitoTrilhaAcao() {
  const contexto = document.getElementById("trilReqContexto").value;
  const trilhaId = numeroDoCampo("trilReqTrilhaId");
  if (!contexto || !trilhaId) { mostrarToast("Escolha onde se aplica e informe o Id da trilha exigida.", "erro"); return; }
  const data = await postarTrilhas("requisitos", {
    contexto, alvo: document.getElementById("trilReqAlvo").value.trim(), trilhaId, modo: document.getElementById("trilReqModo").value
  });
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) carregarRequisitosTrilhasAcao();
}

async function removerRequisitoTrilhaAcao(requisitoId) {
  if (!confirm("Remover este requisito? O fluxo volta a não exigir essa formação.")) return;
  const data = await postarTrilhas("requisitos/remover", { requisitoId });
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) carregarRequisitosTrilhasAcao();
}

async function conferirRequisitoAcao() {
  const contexto = document.getElementById("trilReqContexto").value, membroId = numeroDoCampo("trilConfMembroId");
  const container = document.getElementById("painelConferenciaRequisito");
  if (!contexto || !membroId) { mostrarToast("Escolha o contexto (acima) e informe a matrícula da pessoa.", "erro"); return; }
  const alvo = encodeURIComponent(document.getElementById("trilReqAlvo").value.trim());
  const res = await fetchProtegido(`${API_BASE}/trilhas/requisitos/avaliar?contexto=${contexto}&alvo=${alvo}&membroId=${membroId}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  const a = data.avaliacao;
  if (!a.temRequisitos) { container.innerHTML = "<p class='subtitle'>Nenhum requisito configurado para este contexto/alvo — a pessoa não precisa de formação específica aqui.</p>"; return; }
  container.innerHTML = `<p><strong>${a.bloqueado ? "⛔ NÃO cumpre (bloqueia)" : "✅ Cumpre"}</strong></p>
    <ul>${a.avaliacoes.map(x => `<li>${x.ok ? "✅" : (x.modo === "BLOQUEIA" ? "⛔" : "⚠️")} Trilha "${escaparHtmlEbd(x.trilhaNome)}": ${escaparHtmlEbd(x.detalhe)} <span class="subtitle">(${x.modo === "BLOQUEIA" ? "bloqueia" : "só alerta"})</span></li>`).join("")}</ul>`;
}

// -- Pendências de validade --
async function carregarPendenciasTrilhasAcao() {
  const container = document.getElementById("painelPendenciasTrilhas");
  const cong = numeroDoCampo("trilPendCongregacao");
  const res = await fetchProtegido(`${API_BASE}/trilhas/pendencias${cong ? `?congregacaoId=${cong}` : ""}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.pendencias.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Pessoa</th><th>Congregação</th><th>Trilha</th><th>Válido até</th><th>Situação</th><th></th></tr></thead><tbody>
        ${data.pendencias.map(p => `<tr><td>${escaparHtmlEbd(p.membroNome)} <span class="subtitle">(#${p.membroId})</span></td><td>${escaparHtmlEbd(p.congregacaoNome || "—")}</td>
          <td>${escaparHtmlEbd(p.trilhaNome)}</td><td>${formatarDataEbd(p.validoAte)}</td>
          <td>${p.situacao === "VENCIDA" ? `🔴 Vencida há ${Math.abs(p.diasParaVencer)} dia(s)` : `🟠 Vence em ${escaparHtmlEbd(p.diasParaVencer)} dia(s)`}</td>
          <td>${p.renovacaoEmAndamento ? "🔄 renovação em andamento" : ""}</td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhum certificado vencido ou perto de vencer dentro do seu escopo. ✅</p>";
}

// -- Minha Formação (autoatendimento, Meu Painel) --
async function carregarMinhaFormacaoAcao() {
  const container = document.getElementById("resultadoMinhaFormacao");
  const [resF, resC] = await Promise.all([fetchProtegido(`${API_BASE}/trilhas/minha-formacao`), fetchProtegido(`${API_BASE}/certificados`)]);
  const data = await resF.json();
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  const certs = await resC.json();
  certificadosCache = certs.sucesso === false ? [] : (certs.certificados || []);
  if (!data.formacao.length) { container.innerHTML = "<p class='subtitle'>Você ainda não iniciou nenhuma trilha de formação.</p>"; return; }
  container.innerHTML = data.formacao.map(f => {
    const cert = f.certificado;
    const vencimento = f.situacao === "VENCENDO" ? `<p style="color:var(--cor-erro);">⚠️ Seu certificado vence em ${escaparHtmlEbd(f.diasParaVencer)} dia(s) (${formatarDataEbd(f.validoAte)}) — procure a Secretaria para renovar a formação.</p>`
      : (f.situacao === "VENCIDA" ? `<p style="color:var(--cor-erro);">⛔ Este certificado venceu em ${formatarDataEbd(f.validoAte)}. Algumas funções podem exigir a formação vigente — procure a Secretaria para renovar.</p>` : "");
    return `<div class="cartao-area-ebd" style="margin-bottom:12px;">
      <h5>🎓 ${escaparHtmlEbd(f.trilhaNome)} <span class="subtitle">(matrícula #${f.matriculaId})</span></h5>
      <p>${ROTULO_SITUACAO_TRILHA[f.situacao] || escaparHtmlEbd(f.situacao)} · ${escaparHtmlEbd(f.obrigatoriosConcluidos)}/${escaparHtmlEbd(f.obrigatoriosTotal)} módulos obrigatórios${f.validoAte ? ` · válido até ${formatarDataEbd(f.validoAte)}` : (f.status === "CONCLUIDA" ? " · não vence" : "")}</p>
      ${vencimento}
      ${cert ? `<p>Certificado <code>${escaparHtmlEbd(cert.codigoVerificacao || "")}</code>${cert.revogadoEm ? " — <strong>revogado</strong>" : ""}</p>
        <button class="btn-link" data-on-click="imprimirCertificado" data-args-click="${argsAttr(cert.certificadoId)}">🖨️ Imprimir</button>
        <button class="btn-link" data-on-click="baixarPdfCertificado" data-args-click="${argsAttr(cert.certificadoId, f.membroId)}">📄 Baixar PDF</button>
        ${cert.codigoVerificacao ? `<button class="btn-link" data-on-click="copiarLinkVerificacaoAcao" data-args-click="${argsAttr(String(cert.codigoVerificacao ?? ""))}">🔗 Copiar link de verificação</button>` : ""}` : ""}
    </div>`;
  }).join("");
}

// ---- Revistas e pedidos (v6.6) ----
// Pedido é por TURMA (ver README v6.6 pra decisão completa); "por
// congregação" vira consolidação na leitura, agrupando pedidos de todas as
// turmas daquela congregação. StatusPagamento é só um FLAG (pendente/
// aprovado) — não é lançamento financeiro (isso é a v6.7).
let catalogoRevistasCache = [];
let pedidosTurmaRevistasCache = [];

async function cadastrarRevistaEbdAcao() {
  const nome = document.getElementById("revNome").value.trim();
  const faixaEtaria = document.getElementById("revFaixaEtaria").value.trim();
  const trimestre = document.getElementById("revTrimestre").value.trim();
  const precoUnitario = document.getElementById("revPreco").value;
  const resultadoEl = document.getElementById("resultadoRevistaEbd");
  if (!nome || !trimestre || precoUnitario === "") {
    resultadoEl.textContent = "Informe nome, trimestre e preço unitário.";
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/ebd-revistas/catalogo`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, faixaEtaria: faixaEtaria || null, trimestre, precoUnitario: Number(precoUnitario) })
  });
  const data = await res.json();
  avisarResultado(data);
  resultadoEl.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("revNome").value = "";
    document.getElementById("revFaixaEtaria").value = "";
    document.getElementById("revPreco").value = "";
    carregarCatalogoRevistasEbdAcao();
  }
}

async function carregarCatalogoRevistasEbdAcao() {
  const trimestre = document.getElementById("revFiltroTrimestre").value.trim();
  const container = document.getElementById("painelCatalogoRevistasEbd");
  const res = await fetchProtegido(`${API_BASE}/ebd-revistas/catalogo${trimestre ? `?trimestre=${encodeURIComponent(trimestre)}` : ""}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  catalogoRevistasCache = data.catalogo || [];
  container.innerHTML = catalogoRevistasCache.length
    ? `<table class="tabela-frequencia"><thead><tr><th>ID</th><th>Nome</th><th>Faixa etária</th><th>Trimestre</th><th>Preço</th><th>Ativa</th></tr></thead><tbody>
        ${catalogoRevistasCache.map(r => `<tr><td>${r.revistaId}</td><td>${escaparHtmlEbd(r.nome)}</td><td>${escaparHtmlEbd(r.faixaEtaria || "-")}</td><td>${escaparHtmlEbd(r.trimestre)}</td><td>R$ ${Number(r.precoUnitario).toFixed(2)}</td><td>${r.ativa ? "Sim" : "Não"}</td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhuma revista encontrada.</p>";
}

async function carregarPedidosTurmaEbdAcao() {
  const turmaId = document.getElementById("pedTurmaId").value;
  const container = document.getElementById("painelPedidosTurmaEbd");
  if (!turmaId) { container.innerHTML = ""; mostrarToast("Informe a turma.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-revistas/pedidos?turmaId=${turmaId}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  pedidosTurmaRevistasCache = data.pedidos || [];
  container.innerHTML = pedidosTurmaRevistasCache.length
    ? `<table class="tabela-frequencia"><thead><tr><th>ID</th><th>Trimestre</th><th>Status</th><th>Pagamento</th><th>Itens</th><th>Pedido x matrícula</th><th>Valor total</th></tr></thead><tbody>
        ${pedidosTurmaRevistasCache.map(p => `<tr>
          <td>${p.pedidoId}</td><td>${escaparHtmlEbd(p.trimestre)}</td><td>${escaparHtmlEbd(p.status)}</td><td>${escaparHtmlEbd(p.statusPagamento)}</td>
          <td>${(p.itens || []).map(i => `${escaparHtmlEbd(i.revistaNome)} × ${escaparHtmlEbd(i.quantidade)}`).join(", ") || "-"}</td>
          <td>${textoComparacaoMatriculaEbd(p.comparacaoMatricula)}</td>
          <td>R$ ${Number(p.valorTotal).toFixed(2)}</td>
        </tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhum pedido desta turma ainda.</p>";
}

// v6.10 — pedido x matrícula: compara o total de revistas com a foto de
// alunos + professores ativos guardada quando o pedido foi criado.
function textoComparacaoMatriculaEbd(c) {
  if (!c) return "<span class=\"subtitle\">sem foto da matrícula</span>";
  if (c.diferenca === 0) return `${escaparHtmlEbd(c.totalRevistas)} revista(s) = ${escaparHtmlEbd(c.esperado)} na matrícula`;
  return `${escaparHtmlEbd(c.totalRevistas)} revista(s) para ${escaparHtmlEbd(c.esperado)} na matrícula (${c.diferenca > 0 ? "+" : ""}${escaparHtmlEbd(c.diferenca)})`;
}

async function sugerirPedidoRevistaEbdAcao() {
  const turmaId = Number(document.getElementById("pedNovoTurmaId").value);
  const trimestre = document.getElementById("pedTrimestre").value.trim();
  const container = document.getElementById("painelSugestaoPedidoEbd");
  if (!turmaId || !trimestre) { mostrarToast("Informe a turma e o trimestre.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-revistas/pedidos/sugestao?turmaId=${turmaId}&trimestre=${encodeURIComponent(trimestre)}`);
  const resposta = await jsonDaTela(res, container, "objeto");
  if (resposta === null) return;
  if (resposta.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(resposta.mensagem)}</p>`; return; }
  if (resposta.itens.length) document.getElementById("pedItensJson").value = JSON.stringify(resposta.itens);
  if (resposta.pedidoExistenteId) document.getElementById("pedIdParaEditarItens").value = resposta.pedidoExistenteId;
  container.innerHTML = `
    <p class="subtitle">Matrícula real: <strong>${escaparHtmlEbd(resposta.matriculados)}</strong> aluno(s) ativo(s) e <strong>${escaparHtmlEbd(resposta.professores)}</strong>
      professor(es) ativo(s)${resposta.faixaEtaria ? ` — faixa etária "${escaparHtmlEbd(resposta.faixaEtaria)}"` : ""}.</p>
    ${resposta.detalhes.length ? `<ul>${resposta.detalhes.map(d => `<li>${escaparHtmlEbd(d.nome)}: <strong>${escaparHtmlEbd(d.quantidade)}</strong> (${escaparHtmlEbd(d.base)})</li>`).join("")}</ul>` : ""}
    ${resposta.avisos.map(a => `<p class="subtitle">⚠️ ${escaparHtmlEbd(a)}</p>`).join("")}
    ${resposta.pedidoExistenteId ? `<p class="subtitle">Esta turma já tem o pedido #${resposta.pedidoExistenteId} neste trimestre — use "Substituir itens".</p>` : ""}
    ${resposta.itens.length ? "<p class=\"subtitle\">Itens preenchidos acima — confira e ajuste antes de salvar.</p>" : ""}`;
}

function lerItensPedidoJson() {
  const bruto = document.getElementById("pedItensJson").value.trim();
  if (!bruto) return { erro: "Informe os itens do pedido (JSON)." };
  try {
    const itens = JSON.parse(bruto);
    return { itens };
  } catch (e) {
    return { erro: "Itens em formato JSON inválido — confira o exemplo do placeholder." };
  }
}

async function criarPedidoRevistaEbdAcao() {
  const turmaId = document.getElementById("pedNovoTurmaId").value;
  const trimestre = document.getElementById("pedTrimestre").value.trim();
  const resultadoEl = document.getElementById("resultadoPedidoRevistaEbd");
  if (!turmaId || !trimestre) { resultadoEl.textContent = "Informe a turma e o trimestre."; return; }
  const { itens, erro } = lerItensPedidoJson();
  if (erro) { resultadoEl.textContent = erro; return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-revistas/pedidos`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ turmaId: Number(turmaId), trimestre, itens })
  });
  const data = await res.json();
  avisarResultado(data);
  resultadoEl.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("pedTurmaId").value = turmaId;
    carregarPedidosTurmaEbdAcao();
  }
}

async function atualizarItensPedidoRevistaEbdAcao() {
  const pedidoId = document.getElementById("pedIdParaEditarItens").value;
  const resultadoEl = document.getElementById("resultadoPedidoRevistaEbd");
  if (!pedidoId) { resultadoEl.textContent = "Informe o id do pedido a editar."; return; }
  const { itens, erro } = lerItensPedidoJson();
  if (erro) { resultadoEl.textContent = erro; return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-revistas/pedidos/itens`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pedidoId: Number(pedidoId), itens })
  });
  const data = await res.json();
  avisarResultado(data);
  resultadoEl.textContent = data.mensagem || "";
  if (data.sucesso) carregarPedidosTurmaEbdAcao();
}

async function aprovarPedidoRevistaEbdAcao() {
  const pedidoId = document.getElementById("pedIdAcao").value;
  if (!pedidoId) { mostrarToast("Informe o id do pedido.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-revistas/pedidos/aprovar`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pedidoId: Number(pedidoId) })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarPedidosTurmaEbdAcao();
}

async function registrarPagamentoPedidoRevistaEbdAcao() {
  const pedidoId = document.getElementById("pedIdAcao").value;
  if (!pedidoId) { mostrarToast("Informe o id do pedido.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-revistas/pedidos/pagamento`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pedidoId: Number(pedidoId) })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarPedidosTurmaEbdAcao();
}

async function carregarConsolidadoRevistasEbdAcao() {
  const trimestre = document.getElementById("pedConsolidadoTrimestre").value.trim();
  const container = document.getElementById("painelConsolidadoRevistasEbd");
  const res = await fetchProtegido(`${API_BASE}/ebd-revistas/consolidado${trimestre ? `?trimestre=${encodeURIComponent(trimestre)}` : ""}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.areas.length
    ? data.areas.map(area => `
        <div class="cartao-area-ebd" style="margin-bottom:14px;">
          <h5>🗺️ ${escaparHtmlEbd(area.areaNome)} — R$ ${Number(area.valorTotal).toFixed(2)}</h5>
          ${area.congregacoes.map(cong => `
            <div style="margin-left:14px; margin-bottom:8px;">
              <strong>⛪ ${escaparHtmlEbd(cong.congregacaoNome)} — R$ ${Number(cong.valorTotal).toFixed(2)}</strong>
              <ul style="margin:4px 0 0 20px;">
                ${cong.pedidos.map(p => `<li>Turma ${escaparHtmlEbd(p.turmaNome)} (${escaparHtmlEbd(p.trimestre)}) — ${escaparHtmlEbd(p.status)} / pagamento ${escaparHtmlEbd(p.statusPagamento)} — R$ ${Number(p.valorTotal).toFixed(2)} — ${textoComparacaoMatriculaEbd(p.comparacaoMatricula)}</li>`).join("")}
              </ul>
            </div>
          `).join("")}
        </div>
      `).join("")
    : "<p class='subtitle'>Nenhum pedido encontrado.</p>";
}

// ---- Financeiro (v6.7) ----
// Ofertas ancoradas em EbdLicoes (v6.2) + lançamentos manuais soltos por
// Congregação+Data. O consolidado do mês vira sugestão INICIAL do campo
// "Ofertas" do relatório departamental (FASE 5) — continua editável
// depois (ver README v6.7); este painel nunca escreve na Tesouraria.
async function carregarOpcoesFinanceiroEbdAcao() {
  const sel = document.getElementById("finCongregacao");
  if (sel && !sel.dataset.montado) {
    const congs = await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/congregacoes`));
    sel.innerHTML = congs.filter(c => c.ativa !== false).map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("");
    sel.dataset.montado = "1";
  }
}

async function carregarOfertaLicaoEbdAcao() {
  const licaoId = document.getElementById("finOfertaLicaoId").value;
  const resultadoEl = document.getElementById("resultadoOfertaEbd");
  if (!licaoId) { resultadoEl.textContent = "Informe o id da lição."; return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-financeiro/oferta?licaoId=${licaoId}`);
  const data = await res.json();
  if (data.sucesso === false) { resultadoEl.textContent = data.mensagem; return; }
  if (data.oferta) {
    document.getElementById("finOfertaValor").value = data.oferta.valor;
    resultadoEl.textContent = `Oferta já registrada: R$ ${Number(data.oferta.valor).toFixed(2)} (pode ajustar e salvar de novo).`;
  } else {
    resultadoEl.textContent = "Nenhuma oferta registrada ainda para esta lição.";
  }
}

async function registrarOfertaLicaoEbdAcao() {
  const licaoId = document.getElementById("finOfertaLicaoId").value;
  const valor = document.getElementById("finOfertaValor").value;
  const resultadoEl = document.getElementById("resultadoOfertaEbd");
  if (!licaoId || valor === "") { resultadoEl.textContent = "Informe o id da lição e o valor da oferta."; return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-financeiro/oferta`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licaoId: Number(licaoId), valor: Number(valor) })
  });
  const data = await res.json();
  avisarResultado(data);
  resultadoEl.textContent = data.mensagem || "";
}

async function carregarLancamentosFinanceiroEbdAcao() {
  const congregacaoId = document.getElementById("finCongregacao").value;
  const mes = document.getElementById("finMes").value;
  const ano = document.getElementById("finAno").value;
  const container = document.getElementById("painelLancamentosFinanceiroEbd");
  if (!congregacaoId || !mes || !ano) { container.innerHTML = ""; mostrarToast("Escolha a congregação, o mês e o ano.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-financeiro/lancamentos?congregacaoId=${congregacaoId}&mes=${mes}&ano=${ano}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  const lancamentos = data.lancamentos || [];
  container.innerHTML = lancamentos.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Valor</th><th></th></tr></thead><tbody>
        ${lancamentos.map(l => `<tr>
          <td>${new Date(l.data).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td><td>${l.tipo === "ENTRADA" ? "Entrada" : "Saída"}</td>
          <td>${escaparHtmlEbd(l.descricao)}</td><td>R$ ${Number(l.valor).toFixed(2)}</td>
          <td><button class="btn-confirmar btn-secundario" style="width:auto;margin:0;padding:2px 8px;" data-on-click="excluirLancamentoFinanceiroEbdAcao" data-args-click="${argsAttr(l.lancamentoId)}">🗑️</button></td>
        </tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhum lançamento manual neste mês.</p>";
}

async function criarLancamentoFinanceiroEbdAcao() {
  const congregacaoId = document.getElementById("finCongregacao").value;
  const data = document.getElementById("finNovoData").value;
  const tipo = document.getElementById("finNovoTipo").value;
  const descricao = document.getElementById("finNovoDescricao").value.trim();
  const valor = document.getElementById("finNovoValor").value;
  const resultadoEl = document.getElementById("resultadoLancamentoFinanceiroEbd");
  if (!congregacaoId || !data || !descricao || valor === "") { resultadoEl.textContent = "Escolha a congregação e informe data, descrição e valor."; return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-financeiro/lancamentos`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ congregacaoId: Number(congregacaoId), data, tipo, descricao, valor: Number(valor) })
  });
  const resData = await res.json();
  avisarResultado(resData);
  resultadoEl.textContent = resData.mensagem || "";
  if (resData.sucesso) {
    document.getElementById("finNovoDescricao").value = "";
    document.getElementById("finNovoValor").value = "";
    carregarLancamentosFinanceiroEbdAcao();
  }
}

async function excluirLancamentoFinanceiroEbdAcao(lancamentoId) {
  if (!confirm("Excluir este lançamento manual?")) return;
  const res = await fetchProtegido(`${API_BASE}/ebd-financeiro/lancamentos?id=${lancamentoId}`, { method: "DELETE" });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) carregarLancamentosFinanceiroEbdAcao();
}

async function carregarConsolidadoFinanceiroEbdAcao() {
  const congregacaoId = document.getElementById("finCongregacao").value;
  const mes = document.getElementById("finMes").value;
  const ano = document.getElementById("finAno").value;
  const container = document.getElementById("painelConsolidadoFinanceiroEbd");
  if (!congregacaoId || !mes || !ano) { container.innerHTML = ""; mostrarToast("Escolha a congregação, o mês e o ano.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-financeiro/consolidado?congregacaoId=${congregacaoId}&mes=${mes}&ano=${ano}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = `<p class="subtitle">
      Ofertas do culto: <strong>R$ ${Number(data.totalOfertas).toFixed(2)}</strong> (${data.ofertas.length} domingo(s) lançado(s)) ·
      Entradas manuais: <strong>R$ ${Number(data.totalEntradas).toFixed(2)}</strong> ·
      Saídas manuais: <strong>R$ ${Number(data.totalSaidas).toFixed(2)}</strong>
    </p>
    <p><strong>Consolidado do mês: R$ ${Number(data.consolidado).toFixed(2)}</strong> — é este valor que vira a
      sugestão inicial do campo "Ofertas" quando o rascunho do relatório departamental (FASE 5) deste mês for
      aberto (ainda editável lá, se precisar ajustar).</p>`;
}

async function carregarVisaoAgrupadaEbdAcao() {
  const busca = document.getElementById("ebdBuscaAgrupada") ? document.getElementById("ebdBuscaAgrupada").value.trim() : "";
  const container = document.getElementById("painelVisaoAgrupadaEbd");
  const res = await fetchProtegido(`${API_BASE}/ebd-turmas/visao-agrupada${busca ? `?busca=${encodeURIComponent(busca)}` : ""}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.areas.length
    ? data.areas.map(area => `
        <div class="cartao-area-ebd" style="margin-bottom:14px;">
          <h5>🗺️ ${escaparHtmlEbd(area.areaNome)}</h5>
          ${area.congregacoes.map(cong => `
            <div style="margin-left:14px; margin-bottom:8px;">
              <strong>⛪ ${escaparHtmlEbd(cong.congregacaoNome)}</strong>
              <ul style="margin:4px 0 0 20px;">
                ${cong.turmas.map(t => `<li>${escaparHtmlEbd(t.nome)}${t.faixaEtaria ? ` (${escaparHtmlEbd(t.faixaEtaria)})` : ""} — ${escaparHtmlEbd(t.totalProfessores)} professor(es), ${escaparHtmlEbd(t.totalAlunos)} aluno(s)</li>`).join("")}
              </ul>
            </div>
          `).join("")}
        </div>
      `).join("")
    : "<p class='subtitle'>Nenhuma turma encontrada.</p>";
}

// ---- Caderneta digital (v6.8) ----
function trimestreAtualEbd() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-T${Math.ceil((hoje.getMonth() + 1) / 3)}`;
}

async function carregarOpcoesCadernetaEbdAcao() {
  const sel = document.getElementById("cadRelCongregacao");
  if (sel && !sel.dataset.montado) {
    const congs = await listaDaApi(fetchProtegido(`${API_BASE}/catalogos/congregacoes`));
    sel.innerHTML = `<option value="">Todas as congregações do meu escopo</option>`
      + congs.filter(c => c.ativa !== false).map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("");
    sel.dataset.montado = "1";
  }
  const tri = document.getElementById("cadRelTrimestre");
  if (tri && !tri.value) tri.value = trimestreAtualEbd();
}

function textoRevistaVigenteEbd(rv) {
  if (!rv || !rv.origem) return `<span class="subtitle">sem revista definida${rv ? ` (${escaparHtmlEbd(rv.trimestre)})` : ""}</span>`;
  const nomes = rv.revistas.map(r => `${escaparHtmlEbd(r.nome)}${r.quantidade ? ` ×${escaparHtmlEbd(r.quantidade)}` : ""}`).join(", ");
  return rv.origem === "PEDIDO" ? nomes : `<span class="subtitle">sugestão do catálogo:</span> ${nomes}`;
}

function renderLinhasCadernetaEbd(linhas, licaoId, totais) {
  const corpo = linhas.map(l => {
    const importada = l.origem === "IMPORTADA";
    const professores = l.professores.length
      ? l.professores.map(p => `${escaparHtmlEbd(p.nome)}${p.principal ? " ★" : ""}`).join(", ")
      : "<span class='subtitle'>sem professor</span>";
    const campos = importada
      ? `<td>${escaparHtmlEbd(l.biblias ?? "-")}</td><td>${escaparHtmlEbd(l.revistas ?? "-")}</td><td><span class="subtitle">importada · oferta ${formatarMoedaEbd(l.ofertaImportada)}</span></td>`
      : `<td><input type="number" min="0" id="cadBiblias_${l.turmaId}" value="${escaparHtmlEbd(l.biblias ?? "")}" style="width:70px;" /></td>
         <td><input type="number" min="0" id="cadRevistas_${l.turmaId}" value="${escaparHtmlEbd(l.revistas ?? "")}" style="width:70px;" /></td>
         <td><input type="text" id="cadObs_${l.turmaId}" value="${escaparHtmlEbd(l.observacao || "")}" placeholder="Observação" maxlength="500" style="width:130px;" />
             <button class="btn-link" data-on-click="salvarCadernetaEbdAcao" data-args-click="${argsAttr(licaoId, l.turmaId)}">💾 Salvar</button></td>`;
    return `<tr style="${l.lancada ? "" : "opacity:.6;"}">
      <td><strong>${escaparHtmlEbd(l.turmaNome)}</strong>${l.faixaEtaria ? `<br><span class="subtitle">${escaparHtmlEbd(l.faixaEtaria)}</span>` : ""}</td>
      <td>${professores}</td><td>${textoRevistaVigenteEbd(l.revistaVigente)}</td>
      <td>${escaparHtmlEbd(l.matriculados)}</td><td>${escaparHtmlEbd(l.presentes)}</td><td>${escaparHtmlEbd(l.ausentes)}</td><td>${escaparHtmlEbd(l.visitantes)}</td><td>${escaparHtmlEbd(l.percentualPresenca)}%</td>
      ${campos}
      <td>${l.alertas.length ? l.alertas.map(a => `<div class="subtitle">⚠️ ${escaparHtmlEbd(a)}</div>`).join("") : "✅"}</td>
    </tr>`;
  }).join("");
  const rodape = totais
    ? `<tr style="font-weight:600;"><td colspan="3">Total (${escaparHtmlEbd(totais.turmasLancadas)} classe(s) com lançamento${totais.turmasSemLancamento ? `, ${escaparHtmlEbd(totais.turmasSemLancamento)} sem` : ""})</td>
        <td>${escaparHtmlEbd(totais.matriculados)}</td><td>${escaparHtmlEbd(totais.presentes)}</td><td>${escaparHtmlEbd(totais.ausentes)}</td><td>${escaparHtmlEbd(totais.visitantes)}</td><td>${escaparHtmlEbd(totais.percentualPresenca)}%</td>
        <td>${escaparHtmlEbd(totais.biblias)}</td><td>${escaparHtmlEbd(totais.revistas)}</td><td></td><td></td></tr>`
    : "";
  return `<div style="overflow-x:auto;"><table class="tabela-frequencia"><thead><tr>
      <th>Classe</th><th>Professor(es)</th><th>Revista do trimestre</th><th>Matric.</th><th>Pres.</th><th>Aus.</th><th>Vis.</th><th>Freq.</th>
      <th>Bíblias</th><th>Revistas</th><th>Lançar</th><th>Alertas</th></tr></thead><tbody>${corpo}${rodape}</tbody></table></div>`;
}

function cabecalhoLicaoCadernetaEbd(licao, parcial) {
  return `<p class="subtitle">Lição #${licao.licaoId} — ${formatarDataEbd(licao.data)} — ${escaparHtmlEbd(licao.status)}${parcial ? " · <strong>números provisórios (lição aberta)</strong>" : ""}</p>`;
}

async function carregarCadernetaEbdAcao() {
  const licaoId = Number(document.getElementById("cadLicaoId").value);
  const turmaId = Number(document.getElementById("cadTurmaId").value) || null;
  const container = document.getElementById("painelCadernetaEbd");
  if (!licaoId) { mostrarToast("Informe o Id da lição.", "erro"); return; }
  const url = turmaId
    ? `${API_BASE}/ebd-caderneta/caderneta/turma?licaoId=${licaoId}&turmaId=${turmaId}`
    : `${API_BASE}/ebd-caderneta/caderneta?licaoId=${licaoId}`;
  const res = await fetchProtegido(url);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }

  if (turmaId) {
    container.innerHTML = data.linha
      ? cabecalhoLicaoCadernetaEbd(data.licao, data.licao.status !== "FECHADA") + renderLinhasCadernetaEbd([data.linha], licaoId, null)
      : "<p class='subtitle'>Turma não encontrada nesta congregação.</p>";
    return;
  }
  const cad = data.caderneta;
  const oferta = cad.ofertaRegistrada == null
    ? "oferta do dia ainda não registrada (Financeiro, v6.7)"
    : `oferta do dia ${formatarMoedaEbd(cad.ofertaRegistrada)}`;
  container.innerHTML = cabecalhoLicaoCadernetaEbd(cad.licao, cad.parcial)
    + `<p><strong>${escaparHtmlEbd(cad.trimestre)}</strong> · ${oferta} · <strong>total ${formatarMoedaEbd(cad.ofertaTotal)}</strong></p>`
    + (cad.linhas.length ? renderLinhasCadernetaEbd(cad.linhas, licaoId, cad.totais) : "<p class='subtitle'>Nenhuma turma cadastrada nesta congregação.</p>");
}

async function salvarCadernetaEbdAcao(licaoId, turmaId) {
  const lerNumero = (id) => { const v = document.getElementById(id).value.trim(); return v === "" ? null : Number(v); };
  const res = await fetchProtegido(`${API_BASE}/ebd-caderneta/caderneta/salvar`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      licaoId, turmaId,
      biblias: lerNumero(`cadBiblias_${turmaId}`), revistas: lerNumero(`cadRevistas_${turmaId}`),
      observacao: document.getElementById(`cadObs_${turmaId}`).value.trim() || null
    })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) carregarCadernetaEbdAcao();
}

// -- Relatório do Superintendente / fechamento trimestral --
function linhaTotaisRelatorioEbd(rotulo, t, destaque) {
  return `<tr${destaque ? ' style="font-weight:600;"' : ""}><td>${rotulo}</td><td>${escaparHtmlEbd(t.domingos)}</td><td>${escaparHtmlEbd(t.matriculadosMedio)}</td><td>${escaparHtmlEbd(t.mediaPresentes)}</td>
    <td>${escaparHtmlEbd(t.presentes)}</td><td>${escaparHtmlEbd(t.ausentes)}</td><td>${escaparHtmlEbd(t.visitantes)}</td><td>${escaparHtmlEbd(t.biblias)}</td><td>${escaparHtmlEbd(t.revistas)}</td><td>${escaparHtmlEbd(t.percentualPresenca)}%</td><td>${formatarMoedaEbd(t.oferta)}</td></tr>`;
}

function tabelaRelatorioEbd(linhasHtml) {
  return `<div style="overflow-x:auto;"><table class="tabela-frequencia"><thead><tr>
    <th></th><th>Domingos</th><th>Matric. (média)</th><th>Presentes (média)</th><th>Presentes (total)</th><th>Ausentes</th><th>Visitantes</th>
    <th>Bíblias</th><th>Revistas</th><th>Freq. %</th><th>Oferta</th></tr></thead><tbody>${linhasHtml}</tbody></table></div>`;
}

function renderRelatorioTrimestreEbd(rel) {
  if (!rel.areas.length) return `<p class="subtitle">Nenhuma chamada ou caderneta lançada em ${escaparHtmlEbd(rel.trimestre)} dentro do seu escopo.</p>`;
  const cabecalho = `<p><strong>${escaparHtmlEbd(rel.trimestre)}</strong> — ${formatarDataEbd(rel.periodo.inicio)} a ${formatarDataEbd(rel.periodo.fim)}
    ${rel.parcial ? " · ⏳ trimestre em andamento (parcial)" : " · trimestre encerrado"}</p>`;
  const areas = rel.areas.map(area => `
    <div class="cartao-area-ebd" style="margin-bottom:14px;">
      <h5>🗺️ ${escaparHtmlEbd(area.areaNome)}</h5>
      ${tabelaRelatorioEbd(linhaTotaisRelatorioEbd("Total da área", area.totais, true))}
      ${area.congregacoes.map(cong => {
        const f = cong.fechamento;
        const situacao = cong.fonte === "FECHAMENTO"
          ? `🔒 fechado (${f.origem === "AUTOMATICO" ? "automático" : "manual"}, versão ${escaparHtmlEbd(f.versao)}, ${formatarDataEbd(f.refeitoEm || f.fechadoEm)})${f.licoesAbertas > 0 ? ` ⚠️ ${escaparHtmlEbd(f.licoesAbertas)} lição(ões) estavam abertas` : ""}`
          : "⏳ ao vivo";
        const botao = cong.fonte === "FECHAMENTO"
          ? `<button class="btn-link" data-on-click="fecharTrimestreEbdAcao" data-args-click="${argsAttr(cong.congregacaoId, String(rel.trimestre ?? ""), true)}">🔄 Refazer fechamento</button>`
          : `<button class="btn-link" data-on-click="fecharTrimestreEbdAcao" data-args-click="${argsAttr(cong.congregacaoId, String(rel.trimestre ?? ""), false)}">🔒 Fechar trimestre</button>`;
        return `<details open style="margin:8px 0 8px 14px;">
          <summary><strong>⛪ ${escaparHtmlEbd(cong.congregacaoNome)}</strong> — ${situacao} ${botao}</summary>
          ${tabelaRelatorioEbd(cong.turmas.map(t => linhaTotaisRelatorioEbd(escaparHtmlEbd(t.turmaNome), t.totais, false)).join("") + linhaTotaisRelatorioEbd("Total da congregação", cong.totais, true))}
        </details>`;
      }).join("")}
    </div>`).join("");
  return cabecalho + areas + `<h5>Total geral</h5>${tabelaRelatorioEbd(linhaTotaisRelatorioEbd("Todas as áreas", rel.totais, true))}`;
}

async function carregarRelatorioTrimestreEbdAcao() {
  const trimestre = document.getElementById("cadRelTrimestre").value.trim();
  const congregacaoId = document.getElementById("cadRelCongregacao").value;
  const container = document.getElementById("painelRelatorioTrimestreEbd");
  if (!/^\d{4}-T[1-4]$/.test(trimestre)) { mostrarToast("Informe o trimestre no formato AAAA-T1 a AAAA-T4 (ex: 2026-T3).", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/ebd-caderneta/relatorio?trimestre=${trimestre}${congregacaoId ? `&congregacaoId=${congregacaoId}` : ""}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = renderRelatorioTrimestreEbd(data.relatorio);
}

async function fecharTrimestreEbdAcao(congregacaoId, trimestre, refazer) {
  const pergunta = refazer
    ? `Refazer o fechamento de ${trimestre}? A foto congelada será substituída pelos números de hoje.`
    : `Fechar ${trimestre} desta congregação? Os números ficam congelados (dá pra refazer depois, se precisar).`;
  if (!confirm(pergunta)) return;
  const res = await fetchProtegido(`${API_BASE}/ebd-caderneta/${refazer ? "fechamento/refazer" : "fechamento"}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ congregacaoId, trimestre })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) carregarRelatorioTrimestreEbdAcao();
}

// -- Importação de cadernetas antigas (CSV) --
// O Excel em português costuma salvar CSV em Windows-1252: tenta UTF-8
// estrito e, se o arquivo não for UTF-8 válido, lê como Windows-1252 (senão
// "Bíblias" e nomes de igreja com acento chegariam quebrados).
function lerArquivoImportacaoEbdAcao() {
  const arquivo = document.getElementById("cadImportArquivo").files[0];
  if (!arquivo) return;
  const leitor = new FileReader();
  leitor.onload = () => {
    let texto;
    try { texto = new TextDecoder("utf-8", { fatal: true }).decode(leitor.result); }
    catch { texto = new TextDecoder("windows-1252").decode(leitor.result); }
    document.getElementById("cadImportCsv").value = texto;
  };
  leitor.readAsArrayBuffer(arquivo);
}

async function importarCadernetasEbdAcao(simular) {
  const csv = document.getElementById("cadImportCsv").value;
  const container = document.getElementById("painelImportacaoCadernetaEbd");
  if (!csv.trim()) { mostrarToast("Cole o conteúdo do CSV ou escolha um arquivo.", "erro"); return; }
  if (!simular && !confirm("Gravar de verdade estas cadernetas? Faça a simulação antes se ainda não fez.")) return;
  const res = await fetchProtegido(`${API_BASE}/ebd-caderneta/importar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, simular })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  const resumo = `<p class="subtitle"><strong>${escaparHtmlEbd(data.mensagem)}</strong></p>`;
  if (!data.itens) { container.innerHTML = resumo; return; }
  const linhas = data.itens.map(i => {
    const l = i.linha || {};
    const situacao = i.valido
      ? `✅ ${i.acao === "ATUALIZAR" ? "substitui importada" : "nova"}${i.avisos.map(a => `<div class="subtitle">⚠️ ${escaparHtmlEbd(a)}</div>`).join("")}`
      : i.erros.map(e => `<div style="color:var(--cor-erro);">❌ ${escaparHtmlEbd(e)}</div>`).join("") + i.avisos.map(a => `<div class="subtitle">⚠️ ${escaparHtmlEbd(a)}</div>`).join("");
    return `<tr><td>${escaparHtmlEbd(i.numero ?? "-")}</td><td>${escaparHtmlEbd(l.congregacao || "-")}</td><td>${formatarDataEbd(l.data)}</td><td>${escaparHtmlEbd(l.turma || "-")}</td>
      <td>${escaparHtmlEbd(l.matriculados ?? "-")}/${escaparHtmlEbd(l.presentes ?? "-")}/${escaparHtmlEbd(l.ausentes ?? "-")}/${escaparHtmlEbd(l.visitantes ?? "-")}</td><td>${situacao}</td></tr>`;
  }).join("");
  container.innerHTML = resumo + `<div style="overflow-x:auto;"><table class="tabela-frequencia"><thead><tr>
    <th>Linha</th><th>Igreja</th><th>Domingo</th><th>Classe</th><th>Matric./Pres./Aus./Vis.</th><th>Situação</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
}

// ---- CONQUISTAS E GAMIFICAÇÃO (v6.4) ----
// Motor genérico (shared/conquistas.js) — EBD é só o primeiro consumidor.
// Duas telas: administração do catálogo/regras/tipos de evento (aba própria,
// "conquistas_gestao") e o autoatendimento pessoal/ranking geral, dentro de
// Meu Painel (aberto a qualquer matrícula, mesmo espírito de "Minhas
// Escalas"/"Minha Habilitação").

// -- Autoatendimento (Meu Painel → Minhas Conquistas) --
async function carregarMinhasConquistasAcao() {
  const container = document.getElementById("resultadoMinhasConquistas");
  const res = await fetchProtegido(`${API_BASE}/conquistas/painel`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = `
    <p><strong>Pontuação atual:</strong> ${escaparHtmlEbd(data.score)}</p>
    <div style="display:flex; flex-wrap:wrap; gap:10px;">
      ${data.catalogo.map(c => `
        <div class="cartao-area-ebd" style="min-width:200px; opacity:${c.desbloqueada ? "1" : "0.5"};">
          <div style="font-size:1.6em;">${escaparHtmlEbd(c.icone || "🏆")}</div>
          <strong>${escaparHtmlEbd(c.nome)}</strong>
          <p class="subtitle">${escaparHtmlEbd(c.descricao || "")}</p>
          <p>${c.desbloqueada ? "✅ Desbloqueada" : "🔒 Não desbloqueada"} · +${escaparHtmlEbd(c.pontosBonus)} pts</p>
        </div>
      `).join("")}
    </div>
  `;
  carregarRankingConquistasAcao();
}

async function carregarRankingConquistasAcao() {
  const container = document.getElementById("resultadoRankingConquistas");
  // O servidor decide o recorte: para o membro, a turma (ou congregação) dele — nome abreviado, sem matrícula, os 20 primeiros e a posição dele; quem tem permissão de gestão vê o escopo que alcança.
  const res = await fetchProtegido(`${API_BASE}/conquistas/ranking`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (!data || data.sucesso === false || !Array.isArray(data.ranking)) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd((data && data.mensagem) || "Não foi possível carregar o ranking.")}</p>`; return; }
  const posicaoDe = (r, i) => (r.posicao != null ? Number(r.posicao) : i + 1);
  const rotuloEscopo = data.escopo ? `<p class="subtitle">Ranking da sua ${escaparHtmlEbd(data.escopo === "TURMA" ? "turma" : data.escopo === "CONGREGACAO" ? "congregação" : String(data.escopo).toLowerCase())}.</p>` : "";
  const minha = data.minhaPosicao && typeof data.minhaPosicao === "object" ? data.minhaPosicao : null;       // { posicao, score, totalConquistas }
  const foraDoTop = minha && !data.ranking.some(r => r.voce) ? `<p class="subtitle">Você está em ${Number(minha.posicao)}º lugar${data.totalParticipantes ? ` de ${Number(data.totalParticipantes)}` : ""}, com ${Number(minha.score)} ponto(s).</p>` : "";
  container.innerHTML = rotuloEscopo + (data.ranking.length
    ? `<table class="tabela-frequencia"><thead><tr><th>#</th><th>Nome</th><th>Pontuação</th><th>Conquistas</th></tr></thead><tbody>
        ${data.ranking.map((r, i) => `<tr${r.voce ? ' style="font-weight:600;"' : ""}><td>${posicaoDe(r, i)}</td><td>${escaparHtmlEbd(r.nome)}${r.voce ? " (você)" : ""}</td><td>${Number(r.score)}</td><td>${Number(r.totalConquistas)}</td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Ninguém no ranking ainda.</p>") + foraDoTop;
}

// -- Administração (aba Conquistas — exige "conquistas_gestao") --
async function carregarTiposEventoConquistaAcao() {
  const container = document.getElementById("painelTiposEventoConquista");
  const res = await fetchProtegido(`${API_BASE}/conquistas/tipos-evento`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.tipos.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Tipo</th><th>Descrição</th><th>Módulo</th></tr></thead><tbody>
        ${data.tipos.map(t => `<tr><td>${escaparHtmlEbd(t.tipoEvento)}</td><td>${escaparHtmlEbd(t.descricao || "-")}</td><td>${escaparHtmlEbd(t.moduloOrigem || "-")}</td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhum tipo de evento cadastrado ainda.</p>";
}

async function criarTipoEventoConquistaAcao() {
  const tipoEvento = document.getElementById("conqNovoTipoEventoCodigo").value.trim();
  const descricao = document.getElementById("conqNovoTipoEventoDescricao").value.trim();
  const moduloOrigem = document.getElementById("conqNovoTipoEventoModulo").value.trim();
  if (!tipoEvento) { mostrarToast("Informe o código do tipo de evento.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/conquistas/tipos-evento`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipoEvento, descricao, moduloOrigem })
  });
  const data = await res.json();
  mostrarToast(data.mensagem, data.sucesso === false ? "erro" : "sucesso");
  if (data.sucesso !== false) {
    document.getElementById("conqNovoTipoEventoCodigo").value = "";
    document.getElementById("conqNovoTipoEventoDescricao").value = "";
    document.getElementById("conqNovoTipoEventoModulo").value = "";
    carregarTiposEventoConquistaAcao();
  }
}

async function carregarCatalogoConquistaAdminAcao() {
  const container = document.getElementById("painelCatalogoConquista");
  const res = await fetchProtegido(`${API_BASE}/conquistas/catalogo?incluirInativas=true`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.catalogo.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Id</th><th>Nome</th><th>Oculta</th><th>Pré-requisito</th><th>Bônus</th><th>Regras</th></tr></thead><tbody>
        ${data.catalogo.map(c => `<tr>
          <td>${c.conquistaId}</td><td>${escaparHtmlEbd(c.icone || "")} ${escaparHtmlEbd(c.nome)}</td><td>${c.oculta ? "Sim" : "Não"}</td>
          <td>${c.preRequisitoConquistaId || "-"}</td><td>${escaparHtmlEbd(c.pontosBonus)}</td>
          <td>${c.regras.map(r => `${escaparHtmlEbd(r.tipoRegra)} (${escaparHtmlEbd(r.tipoEvento)})`).join(", ") || "-"}</td>
        </tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Nenhuma conquista cadastrada ainda.</p>";
}

async function criarConquistaAcao() {
  const nome = document.getElementById("conqNovoNome").value.trim();
  const icone = document.getElementById("conqNovoIcone").value.trim();
  const descricao = document.getElementById("conqNovaDescricao").value.trim();
  const oculta = document.getElementById("conqNovaOculta").checked;
  const preRequisitoConquistaId = document.getElementById("conqNovoPreRequisitoId").value || null;
  const pontosBonus = Number(document.getElementById("conqNovosPontosBonus").value || 0);
  if (!nome) { mostrarToast("Informe o nome da conquista.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/conquistas/catalogo`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, icone, descricao, oculta, preRequisitoConquistaId: preRequisitoConquistaId ? Number(preRequisitoConquistaId) : null, pontosBonus })
  });
  const data = await res.json();
  document.getElementById("resultadoNovaConquista").innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`;
  if (data.sucesso !== false) {
    document.getElementById("conqNovoNome").value = "";
    document.getElementById("conqNovoIcone").value = "";
    document.getElementById("conqNovaDescricao").value = "";
    document.getElementById("conqNovaOculta").checked = false;
    document.getElementById("conqNovoPreRequisitoId").value = "";
    document.getElementById("conqNovosPontosBonus").value = "";
    carregarCatalogoConquistaAdminAcao();
  }
}

async function criarRegraConquistaAcao() {
  const conquistaId = Number(document.getElementById("conqRegraConquistaId").value);
  const tipoRegra = document.getElementById("conqRegraTipo").value;
  const tipoEvento = document.getElementById("conqRegraTipoEvento").value.trim();
  const configTexto = document.getElementById("conqRegraConfigJson").value.trim();
  if (!conquistaId || !tipoEvento) { mostrarToast("Informe o id da conquista e o tipo de evento.", "erro"); return; }
  let config = {};
  try { config = configTexto ? JSON.parse(configTexto) : {}; }
  catch (e) { mostrarToast("Config inválida — não é um JSON válido.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/conquistas/regra`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conquistaId, tipoRegra, tipoEvento, config })
  });
  const data = await res.json();
  document.getElementById("resultadoNovaRegraConquista").innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`;
  if (data.sucesso !== false) {
    document.getElementById("conqRegraConquistaId").value = "";
    document.getElementById("conqRegraTipoEvento").value = "";
    document.getElementById("conqRegraConfigJson").value = "";
    carregarCatalogoConquistaAdminAcao();
  }
}

async function carregarRankingConquistaAdminAcao() {
  const escopoTipo = document.getElementById("conqRankingEscopoTipoAdmin").value;
  const escopoId = document.getElementById("conqRankingEscopoIdAdmin").value;
  const container = document.getElementById("painelRankingConquistaAdmin");
  const qs = `escopoTipo=${escopoTipo}${escopoId ? `&escopoId=${escopoId}` : ""}`;
  const res = await fetchProtegido(`${API_BASE}/conquistas/ranking?${qs}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem)}</p>`; return; }
  container.innerHTML = data.ranking.length
    ? `<table class="tabela-frequencia"><thead><tr><th>#</th><th>Nome</th><th>Pontuação</th><th>Conquistas</th></tr></thead><tbody>
        ${data.ranking.map((r, i) => `<tr><td>${i + 1}</td><td>${escaparHtmlEbd(r.nome)}</td><td>${escaparHtmlEbd(r.score)}</td><td>${escaparHtmlEbd(r.totalConquistas)}</td></tr>`).join("")}
      </tbody></table>`
    : "<p class='subtitle'>Ninguém no ranking neste escopo ainda.</p>";
}

registrarAcoes({
  abrirLicaoEbdAcao, abrirMatriculaTrilhaAcao, abrirTelaChamadaOffline, adicionarMaterialPlanoEbdAcao, adicionarModuloTrilhaAcao,
  adicionarQuestaoEbdAcao, adicionarVisitanteOfflineAcao, anonimizarAlunoEbdDpoAcao, anonimizarVisitanteEbdDpoAcao, apagarDadosOfflineEbdAcao,
  aprovarPedidoRevistaEbdAcao, atualizarFormularioQuestaoEbd, atualizarItensPedidoRevistaEbdAcao, baixarPdfCertificado, baixarTurmaOfflineEbdAcao,
  buscarLicaoEbdAcao, buscarTitularesEbdDpoAcao, cadastrarRevistaEbdAcao, cancelarMatriculaTrilhaAcao, carregarAtividadeEbdAcao,
  carregarAusentesEbdAcao, carregarCadernetaEbdAcao, carregarCatalogoRevistasEbdAcao, carregarCatalogoTrilhasAcao, carregarCertificadosEbdAcao,
  carregarConsolidadoFinanceiroEbdAcao, carregarConsolidadoRevistasEbdAcao, carregarConteudoLicaoEbdAcao, carregarDetalheTurmaEbdAcao,
  carregarFormacaoPessoaAcao, carregarLancamentosFinanceiroEbdAcao, carregarOfertaLicaoEbdAcao, carregarPedidosTurmaEbdAcao,
  carregarPendenciasTrilhasAcao, carregarPlanosGestaoEbdAcao, carregarPlanosTurmaEbdAcao, carregarRankingConquistaAdminAcao,
  carregarRelatorioTrimestreEbdAcao, carregarRequisitosTrilhasAcao, carregarRespostasAlunoEbdAcao, carregarResumoAtividadeTurmaEbdAcao,
  carregarRosterChamadaEbdAcao, carregarTurmasEbdAcao, carregarVisaoAgrupadaEbdAcao, concluirModuloTrilhaAcao, conferirRequisitoAcao,
  copiarLinkVerificacaoAcao, copiarValorParaCampo, corrigirRespostaManualEbdAcao, criarAtividadeEbdAcao, criarConquistaAcao,
  criarLancamentoFinanceiroEbdAcao, criarPedidoRevistaEbdAcao, criarRegraConquistaAcao, criarRequisitoTrilhaAcao, criarTipoEventoConquistaAcao,
  criarTrilhaAcao, criarTurmaEbdAcao, definirModuloAtivoAcao, definirTrilhaAtivaAcao, descartarGrupoOfflineEbdAcao, designarProfessorEbdAcao,
  editarPlanoEbdAcao, emitirCertificadoEbdAcao, emitirCertificadoMatriculaAcao, encerrarMatriculaEbdAcao, encerrarProfessorEbdAcao,
  excluirLancamentoFinanceiroEbdAcao, excluirPlanoEbdAcao, fecharLicaoEbdAcao, fecharTelaChamadaOffline, fecharTrimestreEbdAcao,
  importarCadernetasEbdAcao, imprimirCertificado, lancarPresencaEbdAcao, lerArquivoImportacaoEbdAcao, limparFormPlanoEbd, marcarPresencaOfflineEbd,
  matricularAlunoEbdAcao, matricularNaoMembroEbdAcao, matricularTrilhaAcao, preRequisitoModuloAcao, preRequisitoTrilhaAcao, publicarPlanoEbdAcao,
  reabrirLicaoEbdAcao, registrarOfertaLicaoEbdAcao, registrarPagamentoPedidoRevistaEbdAcao, registrarVisitanteEbdAcao, removerMaterialPlanoEbdAcao,
  removerRequisitoTrilhaAcao, removerTurmaOfflineEbdAcao, renderChamadaOffline, revogarCertificadoAcao, salvarCadernetaEbdAcao,
  salvarConteudoLicaoEbdAcao, salvarPlanoEbdAcao, salvarRespostaEbdAcao, sincronizarChamadaOfflineAcao, sugerirPedidoRevistaEbdAcao,
  transferirAlunoEbdAcao, vincularAlunoEbdAcao
});
