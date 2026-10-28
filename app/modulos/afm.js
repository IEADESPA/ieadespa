// modulos/afm.js — v8.1: Academia de Formação Ministerial (AFM) e faltas da CLI.
// Regimento Art. 22, 66 a 69, 72, 149 e 310; Estatuto Art. 15 §1º e 27. Toda regra mora no servidor (api/shared/afm.js e afmDb.js); aqui só se monta a tela.
//  - aba "Academia (AFM)" (permissão afm): Matrículas, Corpo docente (Reitor, docentes) e Sessões Magnas; os atos são do nível geral (o servidor confere);
//  - na CLI (Órgãos Centrais → CLI): o quadro "Faltas e cadeiras" (quem está com faltas seguidas, as exclusões com as providências, comunicar e readmitir);
//  - o catálogo fechado da justificativa de falta (Art. 149 §2º), usado pela Secretaria (Ver frequência) e pelo obreiro (Meu Painel);
//  - no Meu Painel, a situação da própria pessoa na CLI e na AFM.

let afmCatalogo = null;
let afmSecaoAtual = "matriculas";
let afmFiltroMatriculas = "TODOS";
let afmMatriculasCache = [];
let afmFaltasCache = null;
let afmGeralMatriculas = false;   // o "geral" da permissão afm, como o servidor disse (não o authGeral, que vale para qualquer concessão)
let afmEnviando = false;          // duplo clique: o segundo envio espera o primeiro voltar
const AFM_DETALHE_MAX = 250;      // o texto gravado é "rótulo — detalhe" (até 300): o rótulo mais longo cabe com folga

// Troca de login ou saída: nada da pessoa anterior (nomes, faltas, reprovação, a própria situação) fica na página.
function afmLimparTela() {
  afmMatriculasCache = []; afmFaltasCache = null; afmGeralMatriculas = false; afmEnviando = false;
  for (const id of ["afmListaMatriculas", "afmCorpo", "afmListaMagnas", "afmFaltasCLI", "afmForm", "cartaoAfmCli", "resultadoListaCDER", "afmListaVetaveis"]) { const el = afmEl(id); if (el) el.innerHTML = ""; }
  const resumo = afmEl("afmResumoMatriculas");
  if (resumo) resumo.textContent = "";
}

function afmEl(id) { return document.getElementById(id); }
function afmEscrever(id, texto, erro) {
  const el = afmEl(id);
  if (!el) return;
  el.textContent = texto || "";
  el.classList.toggle("aviso-recusa", !!erro);
}
// A data vai para o HTML: sai escapada daqui mesmo.
function afmData(iso) { return iso ? escaparHtmlEbd(String(iso).slice(0, 10).split("-").reverse().join("/")) : "—"; }
function afmHoje() { return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); }
async function afmJson(res) { try { return await res.json(); } catch (_) { return { sucesso: false, mensagem: "Resposta inesperada do servidor." }; } }
async function afmPost(acao, corpo) {
  if (afmEnviando) return { sucesso: false, mensagem: "Aguarde: o envio anterior ainda não voltou." };
  afmEnviando = true;
  try {
    const res = await fetchProtegido(`${API_BASE}/afm/${acao}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    return await afmJson(res);
  } finally { afmEnviando = false; }
}
// O formulário abre no topo da aba: leva a pessoa até ele (no celular, a linha clicada pode estar longe) e põe o foco no primeiro campo.
function afmMostrarForm(id) {
  const cx = afmEl(id || "afmForm");
  if (!cx) return;
  if (typeof cx.scrollIntoView === "function") cx.scrollIntoView({ behavior: "smooth", block: "start" });
  const campo = cx.querySelector ? cx.querySelector("input, select, textarea") : null;
  if (campo && typeof campo.focus === "function") campo.focus();
}

async function afmCarregarCatalogo() {
  if (afmCatalogo) return afmCatalogo;
  const res = await fetchProtegido(`${API_BASE}/afm/catalogos`);
  const data = await afmJson(res);
  if (res.ok && data && data.sucesso) afmCatalogo = data;
  return afmCatalogo;
}

// ==================== catálogo da justificativa (Art. 149 §2º) ====================
// Promise<{codigo, detalhe, comprovanteConferido}|null>. `comprovante`: na Sessão Magna, quem APROVA confirma que viu o documento (Art. 69 §2º, I).
async function afmPedirJustificativa({ titulo, comprovante = false, codigoSugerido = "", detalheSugerido = "" } = {}) {
  const cat = await afmCarregarCatalogo();
  if (!cat) { mostrarToast("Não foi possível carregar o catálogo de motivos. Tente de novo.", "erro"); return null; }
  return new Promise(resolve => {
    const caixa = afmEl("modalCaixa");
    const aceitos = cat.motivosAceitos.map(m => `<option value="${escaparHtmlEbd(m.codigo)}"${m.codigo === codigoSugerido ? " selected" : ""}>${escaparHtmlEbd(m.rotulo)}</option>`).join("");
    const vedados = cat.motivosVedados.map(m => `<option value="" disabled>🚫 ${escaparHtmlEbd(m.rotulo)} — vedado</option>`).join("");
    caixa.innerHTML = `
      <h3>${escaparHtmlEbd(titulo || "Justificar falta")}</h3>
      <p class="subtitle">Só fator <strong>externo</strong> à rotina da igreja justifica falta na CLI (Regimento, Art. 149 §2º). Serviço na igreja, escala, evento de departamento ou
        entidade vinculada <strong>não</strong> justificam: no dia da reunião da Câmara, ela vem antes.</p>
      <div class="input-group">
        <label for="afmJustCodigo">Motivo:</label>
        <select id="afmJustCodigo"><option value="">— escolha —</option>${aceitos}<optgroup label="Não aceitos (Art. 149 §2º, II)">${vedados}</optgroup></select>
      </div>
      <div class="input-group">
        <label for="afmJustDetalhe">Detalhe (até ${AFM_DETALHE_MAX} caracteres; obrigatório em "outro fator externo"). Não escreva diagnóstico de saúde.</label>
        <textarea id="afmJustDetalhe" rows="3" maxlength="${AFM_DETALHE_MAX}"></textarea>
      </div>
      ${comprovante ? `<label class="afm-check"><input type="checkbox" id="afmJustComprovante" /> Vi o documento que comprova (Sessão Magna da AFM: justificativa documentada, Art. 69 §2º, I)</label>` : ""}
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar" id="modalConfirmar">Enviar</button>
      </div>`;
    afmEl("modalOverlay").classList.remove("escondido");
    afmEl("afmJustDetalhe").value = String(detalheSugerido || "").slice(0, AFM_DETALHE_MAX);
    afmEl("afmJustCodigo").focus();
    afmEl("modalConfirmar").onclick = () => {
      const codigo = afmEl("afmJustCodigo").value;
      const detalhe = afmEl("afmJustDetalhe").value.trim();
      if (!codigo) { mostrarToast("Escolha o motivo na lista.", "erro"); return; }
      if (codigo === "OUTRO_EXTERNO" && detalhe.length < 10) { mostrarToast("Descreva o fator externo (pelo menos 10 caracteres).", "erro"); return; }
      const conferido = comprovante ? !!(afmEl("afmJustComprovante") && afmEl("afmJustComprovante").checked) : undefined;
      if (comprovante && !conferido) { mostrarToast("Na Sessão Magna, confirme que viu o documento.", "erro"); return; }
      fecharModal();
      resolve({ codigo, detalhe: detalhe || undefined, comprovanteConferido: conferido });
    };
    afmEl("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

// O rótulo do motivo pelo código (a justificativa antiga, de texto livre, fica como estava).
function afmRotuloMotivo(codigo) {
  const m = afmCatalogo && afmCatalogo.motivosAceitos.find(x => x.codigo === codigo);
  return m ? m.rotulo : codigo;
}
function afmRotuloTipoSessao(tipo) {
  return { ORDINARIA: "Ordinária", EXTRAORDINARIA: "Extraordinária", MAGNA_AFM: "Sessão Magna (AFM)", SEMINARIO_AFM: "Seminário de novembro (AFM)" }[tipo] || "";
}

// ==================== aba Academia (AFM) ====================
function afmAbrirAba() {
  afmCarregarCatalogo();
  afmMostrarSecaoAcao(afmSecaoAtual);
}

function afmMostrarSecaoAcao(secao) {
  afmSecaoAtual = ["matriculas", "corpo", "magnas", "escada"].includes(secao) ? secao : "matriculas";
  for (const s of ["matriculas", "corpo", "magnas", "escada"]) {
    const div = afmEl(`afmSecao${s[0].toUpperCase()}${s.slice(1)}`);
    if (div) div.style.display = s === afmSecaoAtual ? "block" : "none";
    const btn = afmEl(`btnAfmSecao${s[0].toUpperCase()}${s.slice(1)}`);
    if (btn) { btn.classList.toggle("ativo", s === afmSecaoAtual); btn.setAttribute("aria-pressed", s === afmSecaoAtual ? "true" : "false"); }
  }
  afmFecharFormAcao();
  if (afmSecaoAtual === "matriculas") afmCarregarMatriculasAcao();
  if (afmSecaoAtual === "corpo") afmCarregarCorpoAcao();
  if (afmSecaoAtual === "magnas") afmCarregarMagnasAcao();
  if (afmSecaoAtual === "escada") afmCarregarVetaveisAcao();
}

function afmFecharFormAcao() {
  const f = afmEl("afmForm");
  if (f) f.innerHTML = "";
}

// ---- Matrículas ----
function afmBadgeSituacao(m) {
  if (m.status === "INATIVA") return `<span class="badge-status badge-desligado">Inativa${m.desmatricula ? ` (${m.desmatricula.motivo === "FALTAS" ? "faltas" : "reprovação"}, ${afmData(m.desmatricula.data)})` : ""}</span>`;
  return `<span class="badge-status badge-ativo">Ativa</span>`;
}
function afmTextoNivel(m) {
  if (!m.nivel) return "<em>a informar</em>";
  const rot = (afmCatalogo && (afmCatalogo.niveis.find(n => n.codigo === m.nivel) || {}).rotulo) || m.nivel;
  return `${escaparHtmlEbd(rot)} (${m.nivelConcluido ? "concluído" : "cursando"})`;
}

async function afmCarregarMatriculasAcao() {
  const cx = afmEl("afmListaMatriculas");
  if (!cx) return;
  cx.innerHTML = "<p class='subtitle'>Carregando…</p>";
  await afmCarregarCatalogo();
  const res = await fetchProtegido(`${API_BASE}/afm/matriculas`);
  const data = await jsonDaTela(res, cx, "objeto");
  if (data === null) return;
  afmMatriculasCache = Array.isArray(data.itens) ? data.itens : [];
  afmGeralMatriculas = !!data.geral;
  afmRenderMatriculas(afmGeralMatriculas);
}

function afmFiltrarMatriculasAcao(filtro) {
  afmFiltroMatriculas = filtro;
  const barra = afmEl("afmFiltrosMatriculas");
  if (barra) [...barra.children].filter(b => b.nodeType === 1).forEach(b => { const ativo = b.getAttribute("data-filtro") === filtro; b.classList.toggle("ativo", ativo); b.setAttribute("aria-pressed", ativo ? "true" : "false"); });
  afmRenderMatriculas(afmGeralMatriculas);
}

function afmRenderMatriculas(geral) {
  const cx = afmEl("afmListaMatriculas");
  // v8.2: o candidato (ainda não oficial, matriculado para cursar o Básico) também aparece
  const candidato = (m) => !m.oficial && m.origem === "CANDIDATO" && m.status === "ATIVA";
  const todos = afmMatriculasCache.filter(m => m.oficial || m.status === "INATIVA" || candidato(m));
  const filtros = {
    TODOS: () => true, INATIVOS: m => m.status === "INATIVA", ABAIXO: m => m.nivelAtende === false, SEM_NIVEL: m => !m.nivel, RISCO: m => m.faltasSeguidas >= 2,
    NIVELAMENTO: m => !!m.nivelamento, SEM_CHM: m => !m.chm && m.status === "ATIVA", CANDIDATOS: candidato
  };
  const lista = todos.filter(filtros[afmFiltroMatriculas] || filtros.TODOS);
  const resumo = afmEl("afmResumoMatriculas");
  if (resumo) {
    resumo.textContent = `${todos.filter(m => !candidato(m)).length} oficial(is) matriculado(s) · ${todos.filter(m => m.status === "INATIVA").length} inativo(s) · ${todos.filter(m => m.nivelAtende === false).length} abaixo do nível do cargo · ${todos.filter(m => !m.nivel).length} com o nível a informar · ${todos.filter(m => m.nivelamento).length} em nivelamento obrigatório · ${todos.filter(candidato).length} candidato(s)`;
  }
  if (!lista.length) { cx.innerHTML = "<p class='subtitle'>Ninguém nesta lista.</p>"; return; }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Matrícula</th><th>Nome</th><th>Cargo</th><th>Congregação</th><th>Situação</th><th>Nível</th><th>CHM</th><th>Magnas seguidas sem justificativa</th>${geral ? "<th></th>" : ""}</tr></thead><tbody>`;
  for (const m of lista) {
    const nivelAviso = (m.nivelAtende === false ? ` <span class="tag-pendente" title="${escaparHtmlEbd(m.nivelExigido || "")}">abaixo do exigido</span>` : "")
      + (m.nivelamento ? ` <span class="tag-pendente" title="Nomeado direto pelo Pastor Presidente ou vindo de outra convenção: faz o nivelamento depois da posse (Regimento, Art. 66 §5º)">nivelamento obrigatório</span>` : "");
    const chm = m.chm ? `✔ ${afmData(m.chmEm)}` : "—";
    let acoes = "";
    if (geral) {
      acoes += `<button class="btn-link" data-on-click="afmFormNivelAcao" data-args-click="${argsAttr(m.membroId)}">Nível…</button>`;
      if (m.status === "ATIVA" && !m.chm) acoes += ` <button class="btn-link btn-link-sucesso" data-on-click="afmFormCHMAcao" data-args-click="${argsAttr(m.membroId)}">Conceder CHM…</button>`;
      if (m.chm) acoes += ` <button class="btn-link btn-link-perigo" data-on-click="afmRevogarCHMAcao" data-args-click="${argsAttr(m.membroId)}">Revogar CHM</button>`;
      if (m.status === "ATIVA") acoes += ` <button class="btn-link btn-link-perigo" data-on-click="afmFormReprovarAcao" data-args-click="${argsAttr(m.membroId)}">Reprovação…</button>`;
      if (m.status === "INATIVA") acoes += ` <button class="btn-link btn-link-sucesso" data-on-click="afmFormRematricularAcao" data-args-click="${argsAttr(m.membroId)}">Nova matrícula…</button>`;
      if (m.desmatricula && m.desmatricula.motivo === "REPROVACAO") acoes += ` <button class="btn-link" data-on-click="afmFormAnularReprovacaoAcao" data-args-click="${argsAttr(m.membroId)}">Anular reprovação…</button>`;
    }
    html += `<tr>
      <td>${escaparHtmlEbd(m.membroId)}</td>
      <td>${escaparHtmlEbd(m.nome)}</td>
      <td>${candidato(m) ? "Candidato" : escaparHtmlEbd(m.cargoNome || "-")}</td>
      <td>${escaparHtmlEbd(m.congregacao || "-")}</td>
      <td>${afmBadgeSituacao(m)}</td>
      <td>${afmTextoNivel(m)}${nivelAviso}</td>
      <td>${chm}</td>
      <td>${escaparHtmlEbd(m.faltasSeguidas)}${m.faltasSeguidas >= 2 && m.status === "ATIVA" ? " ⚠️" : ""}</td>
      ${geral ? `<td>${acoes}</td>` : ""}
    </tr>`;
  }
  cx.innerHTML = html + "</tbody></table>";
}

function afmNomeDaMatricula(membroId) {
  const m = afmMatriculasCache.find(x => Number(x.membroId) === Number(membroId));
  return m ? m.nome : `matrícula ${membroId}`;
}

function afmFormNivelAcao(membroId) {
  const m = afmMatriculasCache.find(x => Number(x.membroId) === Number(membroId)) || {};
  const opcoes = (afmCatalogo ? afmCatalogo.niveis : []).map(n => `<option value="${escaparHtmlEbd(n.codigo)}"${n.codigo === m.nivel ? " selected" : ""}>${escaparHtmlEbd(n.rotulo)}</option>`).join("");
  afmEl("afmForm").innerHTML = `
    <div class="cartao-perfil">
      <h4>Nível de escolaridade — ${escaparHtmlEbd(afmNomeDaMatricula(membroId))}</h4>
      <p class="subtitle">Exigido para o cargo: ${escaparHtmlEbd(m.nivelExigido || "—")} (Regimento, Art. 72).</p>
      <div class="input-group"><label for="afmNivelSel">Nível</label><select id="afmNivelSel">${opcoes}</select></div>
      <label class="afm-check"><input type="checkbox" id="afmNivelConcluido"${m.nivelConcluido ? " checked" : ""} /> curso concluído</label>
      <div class="barra-lista">
        <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="afmEnviarNivelAcao" data-args-click="${argsAttr(membroId)}">💾 Salvar</button>
        <button class="btn-link" data-on-click="afmFecharFormAcao">cancelar</button>
      </div>
    </div>`;
  afmMostrarForm();
}
async function afmEnviarNivelAcao(membroId) {
  const data = await afmPost("nivel", { membroId, nivel: afmEl("afmNivelSel").value, concluido: !!afmEl("afmNivelConcluido").checked });
  avisarResultado(data);
  if (data.sucesso) { afmFecharFormAcao(); afmCarregarMatriculasAcao(); }
}

function afmCampoData(id, rotulo, valor) {
  return `<div class="input-group"><label for="${id}">${escaparHtmlEbd(rotulo)}</label><input type="date" class="afm-data" id="${id}" value="${escaparHtmlEbd(valor || afmHoje())}" max="${afmHoje()}" /></div>`;
}
function afmCampoTexto(id, rotulo, placeholder, max) {
  return `<div class="input-group"><label for="${id}">${escaparHtmlEbd(rotulo)}</label><textarea id="${id}" rows="2" maxlength="${max || 300}" placeholder="${escaparHtmlEbd(placeholder || "")}"></textarea></div>`;
}
function afmBotoesForm(acao, args, rotulo) {
  return `<div class="barra-lista"><button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="${acao}" data-args-click="${argsAttr(...args)}">${escaparHtmlEbd(rotulo)}</button>
    <button class="btn-link" data-on-click="afmFecharFormAcao">cancelar</button></div>`;
}

function afmFormReprovarAcao(membroId) {
  afmEl("afmForm").innerHTML = `<div class="cartao-perfil">
    <h4>Reprovação técnica — ${escaparHtmlEbd(afmNomeDaMatricula(membroId))}</h4>
    <p class="subtitle">A matrícula fica <strong>inativa</strong>: o obreiro mantém o título, mas perde a licença para oficiar até nova matrícula e aprovação na reciclagem (Regimento, Art. 66 §2º, II e Art. 69 §3º).</p>
    ${afmCampoData("afmRepData", "Data da reprovação")}
    ${afmCampoTexto("afmRepDetalhe", "Avaliação em que reprovou (10 a 500 caracteres)", "Ex.: Prova de liturgia do Seminário de novembro", 500)}
    ${afmBotoesForm("afmEnviarReprovarAcao", [membroId], "Registrar reprovação")}</div>`;
  afmMostrarForm();
}
async function afmEnviarReprovarAcao(membroId) {
  if (!(await confirmarAcao("Confirma a reprovação? A matrícula fica inativa e o obreiro perde a licença para oficiar.", "Registrar"))) return;
  const data = await afmPost("reprovar", { membroId, data: afmEl("afmRepData").value, detalhe: afmEl("afmRepDetalhe").value });
  avisarResultado(data);
  if (data.sucesso) { afmFecharFormAcao(); afmCarregarMatriculasAcao(); }
}

function afmFormAnularReprovacaoAcao(membroId) {
  afmEl("afmForm").innerHTML = `<div class="cartao-perfil">
    <h4>Anular reprovação registrada por engano — ${escaparHtmlEbd(afmNomeDaMatricula(membroId))}</h4>
    ${afmCampoTexto("afmAnuMotivo", "Por que a reprovação está sendo anulada (10 a 300 caracteres)", "Ex.: a prova foi lançada no obreiro errado")}
    ${afmBotoesForm("afmEnviarAnularReprovacaoAcao", [membroId], "Anular")}</div>`;
  afmMostrarForm();
}
async function afmEnviarAnularReprovacaoAcao(membroId) {
  const data = await afmPost("anular-reprovacao", { membroId, motivo: afmEl("afmAnuMotivo").value });
  avisarResultado(data);
  if (data.sucesso) { afmFecharFormAcao(); afmCarregarMatriculasAcao(); }
}

function afmFormRematricularAcao(membroId) {
  afmEl("afmForm").innerHTML = `<div class="cartao-perfil">
    <h4>Nova matrícula — ${escaparHtmlEbd(afmNomeDaMatricula(membroId))}</h4>
    <p class="subtitle">Só com a aprovação no curso de reciclagem (Regimento, Art. 69 §3º). O obreiro volta a ter a licença para oficiar e a contagem de faltas recomeça.</p>
    ${afmCampoData("afmRemData", "Data da aprovação na reciclagem")}
    ${afmCampoTexto("afmRemObs", "Observação (opcional)", "Ex.: turma de reciclagem de outubro")}
    ${afmBotoesForm("afmEnviarRematricularAcao", [membroId], "Registrar nova matrícula")}</div>`;
  afmMostrarForm();
}
async function afmEnviarRematricularAcao(membroId) {
  const data = await afmPost("rematricular", { membroId, reciclagemAprovadaEm: afmEl("afmRemData").value, observacao: afmEl("afmRemObs").value });
  avisarResultado(data);
  if (data.sucesso) { afmFecharFormAcao(); afmCarregarMatriculasAcao(); }
}

// ---- v8.2: CHM, candidato e veto técnico (Regimento Art. 66 §§3º–5º, 67, 72) ----
function afmFormCHMAcao(membroId) {
  afmEl("afmForm").innerHTML = `<div class="cartao-perfil">
    <h4>Conceder o CHM — ${escaparHtmlEbd(afmNomeDaMatricula(membroId))}</h4>
    <p class="subtitle">O Certificado de Habilitação Ministerial é da AFM (Art. 67): sem ele, ninguém é indicado para mudar de cargo nem assume a direção de congregação (§1º).</p>
    ${afmCampoData("afmChmData", "Data da concessão")}
    ${afmBotoesForm("afmEnviarCHMAcao", [membroId], "Conceder CHM")}</div>`;
  afmMostrarForm();
}
async function afmEnviarCHMAcao(membroId) {
  const data = await afmPost("chm", { membroId, conceder: true, data: afmEl("afmChmData").value });
  avisarResultado(data);
  if (data.sucesso) { afmFecharFormAcao(); afmCarregarMatriculasAcao(); }
}
async function afmRevogarCHMAcao(membroId) {
  if (!(await confirmarAcao(`Revogar o CHM de ${afmNomeDaMatricula(membroId)}? Sem ele, os processos de consagração desta pessoa travam na próxima etapa.`, "Revogar"))) return;
  const data = await afmPost("chm", { membroId, conceder: false });
  avisarResultado(data);
  if (data.sucesso) afmCarregarMatriculasAcao();
}

function afmFormCandidatoAcao() {
  const opcoes = (afmCatalogo ? afmCatalogo.niveis : []).map(n => `<option value="${escaparHtmlEbd(n.codigo)}">${escaparHtmlEbd(n.rotulo)}</option>`).join("");
  afmEl("afmForm").innerHTML = `<div class="cartao-perfil">
    <h4>Matricular candidato</h4>
    <p class="subtitle">Para quem ainda não é oficial: o membro indicado a Auxiliar precisa estar matriculado e cursando o Básico (Regimento, Art. 72, I, b). Oficial já é matriculado sozinho.</p>
    ${afmCampoMatricula("afmCandMatricula", "Matrícula do candidato")}
    <div class="input-group"><label for="afmCandNivel">Nível que vai cursar</label><select id="afmCandNivel">${opcoes}</select></div>
    ${afmCampoData("afmCandData", "Data da matrícula")}
    ${afmBotoesForm("afmEnviarCandidatoAcao", [], "Matricular")}</div>`;
  afmMostrarForm();
}
async function afmEnviarCandidatoAcao() {
  const data = await afmPost("matricular-candidato", { membroId: afmEl("afmCandMatricula").value, nivel: afmEl("afmCandNivel").value, data: afmEl("afmCandData").value });
  avisarResultado(data);
  if (data.sucesso) { afmFecharFormAcao(); afmCarregarVetaveisAcao(); }
}

let afmVetaveisCache = [];
async function afmCarregarVetaveisAcao() {
  const cx = afmEl("afmListaVetaveis");
  if (!cx) return;
  cx.innerHTML = "<p class='subtitle'>Carregando…</p>";
  await afmCarregarCatalogo();
  const res = await fetchProtegido(`${API_BASE}/afm/vetaveis`);
  if (res.status === 403) { cx.innerHTML = "<p class='subtitle'>O veto técnico é do nível geral da Academia.</p>"; return; }
  const data = await jsonDaTela(res, cx, "objeto");
  if (data === null) return;
  afmVetaveisCache = Array.isArray(data.itens) ? data.itens : [];
  if (!afmVetaveisCache.length) { cx.innerHTML = "<p class='subtitle'>Nenhuma indicação em andamento.</p>"; return; }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Congregação</th><th>Para</th><th>Etapa</th><th>Protocolo</th><th></th></tr></thead><tbody>`;
  for (const p of afmVetaveisCache) {
    html += `<tr>
      <td>${escaparHtmlEbd(p.nome)}</td>
      <td>${escaparHtmlEbd(p.congregacao || "-")}</td>
      <td>${escaparHtmlEbd(p.cargoAlvoRotulo || p.cargoAlvo)}</td>
      <td>${escaparHtmlEbd((typeof ROTULO_STATUS_CONSAGRACAO !== "undefined" && ROTULO_STATUS_CONSAGRACAO[p.status]) || p.status)}</td>
      <td>${afmData(p.dataProtocolo)}</td>
      <td><button class="btn-link btn-link-perigo" data-on-click="afmFormVetarAcao" data-args-click="${argsAttr(String(p.consagracaoId))}">Vetar…</button></td>
    </tr>`;
  }
  cx.innerHTML = html + "</tbody></table>";
}
function afmFormVetarAcao(consagracaoId) {
  const p = afmVetaveisCache.find(x => String(x.consagracaoId) === String(consagracaoId)) || {};
  afmEl("afmForm").innerHTML = `<div class="cartao-perfil">
    <h4>Veto técnico — ${escaparHtmlEbd(p.nome || "")}${p.cargoAlvoRotulo ? ` (para ${escaparHtmlEbd(p.cargoAlvoRotulo)})` : ""}</h4>
    <p class="subtitle">O veto encerra a indicação (Regimento, Art. 67 §2º). Uma nova indicação só por novo protocolo. Quem indicou vê o motivo na lista de Consagrações.</p>
    ${afmCampoTexto("afmVetoMotivo", "Motivo (10 a 500 caracteres)", "Ex.: reprovou na prova de liturgia do Seminário de novembro", 500)}
    ${afmBotoesForm("afmEnviarVetarAcao", [String(consagracaoId)], "Vetar a indicação")}</div>`;
  afmMostrarForm();
}
async function afmEnviarVetarAcao(consagracaoId) {
  if (!(await confirmarAcao("Confirma o veto? A indicação é encerrada e não volta.", "Vetar"))) return;
  const data = await afmPost("vetar", { consagracaoId, motivo: afmEl("afmVetoMotivo").value });
  avisarResultado(data);
  if (data.sucesso || data.mudou) { afmFecharFormAcao(); afmCarregarVetaveisAcao(); }
}

// ---- Corpo docente ----
const AFM_SITUACAO_REITOR = {
  VAGA: "🔴 Vaga — registre o Reitor nomeado pelo Pastor Presidente",
  AGUARDANDO_HOMOLOGACAO: "🟡 Nomeado, aguardando a homologação técnica da CLI",
  MANDATO_VENCIDO: "🔴 Mandato vencido — registre a recondução ou a nova nomeação",
  EM_EXERCICIO: "🟢 Em exercício"
};

async function afmCarregarCorpoAcao() {
  const cx = afmEl("afmCorpo");
  if (!cx) return;
  cx.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const res = await fetchProtegido(`${API_BASE}/afm/corpo-docente`);
  const data = await jsonDaTela(res, cx, "objeto");
  if (data === null) return;
  const r = data.reitoria || {};
  const reitor = r.reitor;
  const geral = !!data.geral;
  let html = `<div class="cartao-perfil"><h4>🎓 Reitoria (Regimento, Art. 68)</h4>
    <p><strong>${escaparHtmlEbd(AFM_SITUACAO_REITOR[r.situacao] || r.situacao || "")}</strong></p>`;
  if (reitor) {
    html += `<p class="linha-perfil">${escaparHtmlEbd(reitor.nome)} (matrícula ${escaparHtmlEbd(reitor.membroId)})${reitor.titulacao ? ` — ${escaparHtmlEbd(reitor.titulacao)}` : ""}</p>
      <p class="linha-perfil">Desde ${afmData(reitor.dataInicio)} · mandato até ${afmData(reitor.mandatoAte)} (exercício fiscal) · homologação da CLI: ${reitor.homologadoCLIEm ? `${afmData(reitor.homologadoCLIEm)} — ${escaparHtmlEbd(reitor.homologacaoAto || "")}` : "<em>pendente</em>"}</p>`;
  }
  if (geral) {
    html += `<div class="barra-lista">
      <button class="btn-link" data-on-click="afmFormNomearReitorAcao">${reitor ? "Nova nomeação…" : "Registrar nomeação…"}</button>
      ${reitor && !reitor.homologadoCLIEm ? `<button class="btn-link btn-link-sucesso" data-on-click="afmFormHomologarAcao">Registrar homologação da CLI…</button>` : ""}
      ${reitor ? `<button class="btn-link" data-on-click="afmFormReconduzirAcao">Reconduzir…</button>` : ""}
      ${reitor ? `<button class="btn-link btn-link-perigo" data-on-click="afmFormEncerrarAcao" data-args-click="${argsAttr(reitor.corpoDocenteId, "REITOR")}">Exoneração…</button>` : ""}
    </div>`;
  }
  html += `</div><h4>Corpo docente</h4>`;
  const docentes = (data.ativos || []).filter(d => d.papel === "DOCENTE");
  if (geral) html += `<button class="btn-link" data-on-click="afmFormDocenteAcao">➕ Cadastrar docente…</button>`;
  html += docentes.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Matrícula</th><th>Nome</th><th>Titulação</th><th>Desde</th>${geral ? "<th></th>" : ""}</tr></thead><tbody>${docentes.map(d => `<tr>
        <td>${escaparHtmlEbd(d.membroId)}</td><td>${escaparHtmlEbd(d.nome)}</td><td>${escaparHtmlEbd(d.titulacao || "-")}</td><td>${afmData(d.dataInicio)}</td>
        ${geral ? `<td><button class="btn-link btn-link-perigo" data-on-click="afmFormEncerrarAcao" data-args-click="${argsAttr(d.corpoDocenteId, "DOCENTE")}">Encerrar…</button></td>` : ""}</tr>`).join("")}</tbody></table>`
    : "<p class='subtitle'>Nenhum docente cadastrado.</p>";
  const enc = data.encerrados || [];
  if (enc.length) {
    html += `<details><summary>Histórico (${enc.length})</summary><table class="tabela-frequencia"><thead><tr><th>Papel</th><th>Nome</th><th>De</th><th>Até</th><th>Motivo</th></tr></thead><tbody>${enc.map(d => `<tr>
      <td>${d.papel === "REITOR" ? "Reitor" : "Docente"}</td><td>${escaparHtmlEbd(d.nome)}</td><td>${afmData(d.dataInicio)}</td><td>${afmData(d.dataFim)}</td><td>${escaparHtmlEbd(d.motivoFim || "")}</td></tr>`).join("")}</tbody></table></details>`;
  }
  cx.innerHTML = html;
}

function afmCampoMatricula(id, rotulo) {
  return `<div class="input-group"><label for="${id}">${escaparHtmlEbd(rotulo)}</label><input type="number" id="${id}" min="1" placeholder="Matrícula" /></div>`;
}
function afmCampoLinha(id, rotulo, placeholder, max) {
  return `<div class="input-group"><label for="${id}">${escaparHtmlEbd(rotulo)}</label><input type="text" id="${id}" maxlength="${max || 150}" placeholder="${escaparHtmlEbd(placeholder || "")}" /></div>`;
}

function afmFormNomearReitorAcao() {
  afmEl("afmForm").innerHTML = `<div class="cartao-perfil">
    <h4>Nomeação do Reitor (livre nomeação do Pastor Presidente)</h4>
    <p class="subtitle">Quem está na Reitoria sai no mesmo ato. O mandato vai até 31/12 do ano (exercício fiscal). Se a CLI já homologou, informe a data e a ata.</p>
    ${afmCampoMatricula("afmReiMat", "Matrícula do Reitor")}
    ${afmCampoData("afmReiData", "Data da nomeação")}
    ${afmCampoLinha("afmReiTit", "Titulação (opcional)", "Ex.: Mestre em Teologia")}
    <div class="input-group"><label for="afmReiHom">Homologação técnica da CLI (opcional)</label><input type="date" class="afm-data" id="afmReiHom" max="${afmHoje()}" /></div>
    ${afmCampoLinha("afmReiAto", "Ata da homologação (se houver)", "Ex.: Ata da CLI nº 10/2026", 300)}
    ${afmBotoesForm("afmEnviarNomearReitorAcao", [], "Registrar nomeação")}</div>`;
  afmMostrarForm();
}
async function afmEnviarNomearReitorAcao() {
  const corpo = { membroId: Number(afmEl("afmReiMat").value), dataInicio: afmEl("afmReiData").value, titulacao: afmEl("afmReiTit").value.trim() || undefined };
  if (afmEl("afmReiHom").value) { corpo.homologadoCLIEm = afmEl("afmReiHom").value; corpo.homologacaoAto = afmEl("afmReiAto").value; }
  const data = await afmPost("nomear-reitor", corpo);
  avisarResultado(data);
  if (data.sucesso) { afmFecharFormAcao(); afmCarregarCorpoAcao(); }
}
function afmFormHomologarAcao() {
  afmEl("afmForm").innerHTML = `<div class="cartao-perfil"><h4>Homologação técnica da CLI</h4>
    ${afmCampoData("afmHomData", "Data da homologação")}
    ${afmCampoLinha("afmHomAto", "Ata da CLI", "Ex.: Ata da CLI nº 10/2026", 300)}
    ${afmBotoesForm("afmEnviarHomologarAcao", [], "Registrar homologação")}</div>`;
  afmMostrarForm();
}
async function afmEnviarHomologarAcao() {
  const data = await afmPost("homologar-reitor", { data: afmEl("afmHomData").value, ato: afmEl("afmHomAto").value });
  avisarResultado(data);
  if (data.sucesso) { afmFecharFormAcao(); afmCarregarCorpoAcao(); }
}
function afmFormReconduzirAcao() {
  const ano = Number(afmHoje().slice(0, 4)) + 1;
  afmEl("afmForm").innerHTML = `<div class="cartao-perfil"><h4>Recondução do Reitor</h4>
    <p class="subtitle">O mandato passa a ir até 31/12 do ano informado (Regimento, Art. 68 §1º: recondução sem limite).</p>
    <div class="input-group"><label for="afmRecAno">Até o fim do ano</label><input type="number" class="afm-data" id="afmRecAno" value="${ano}" min="2000" max="${ano}" /></div>
    ${afmBotoesForm("afmEnviarReconduzirAcao", [], "Registrar recondução")}</div>`;
  afmMostrarForm();
}
async function afmEnviarReconduzirAcao() {
  const data = await afmPost("reconduzir-reitor", { ano: Number(afmEl("afmRecAno").value) });
  avisarResultado(data);
  if (data.sucesso) { afmFecharFormAcao(); afmCarregarCorpoAcao(); }
}
function afmFormDocenteAcao() {
  afmEl("afmForm").innerHTML = `<div class="cartao-perfil"><h4>Cadastrar docente</h4>
    ${afmCampoMatricula("afmDocMat", "Matrícula")}
    ${afmCampoLinha("afmDocTit", "Titulação", "Ex.: Bacharel em Teologia")}
    ${afmCampoData("afmDocData", "Desde")}
    ${afmBotoesForm("afmEnviarDocenteAcao", [], "Cadastrar")}</div>`;
  afmMostrarForm();
}
async function afmEnviarDocenteAcao() {
  const data = await afmPost("docente", { membroId: Number(afmEl("afmDocMat").value), titulacao: afmEl("afmDocTit").value, dataInicio: afmEl("afmDocData").value });
  avisarResultado(data);
  if (data.sucesso) { afmFecharFormAcao(); afmCarregarCorpoAcao(); }
}
function afmFormEncerrarAcao(corpoDocenteId, papel) {
  afmEl("afmForm").innerHTML = `<div class="cartao-perfil"><h4>${papel === "REITOR" ? "Exoneração do Reitor" : "Encerrar docente"}</h4>
    ${afmCampoData("afmEncData", "Data")}
    ${afmCampoLinha("afmEncMotivo", "Motivo (5 a 200 caracteres)", "Ex.: exonerado pelo Pastor Presidente", 200)}
    ${afmBotoesForm("afmEnviarEncerrarAcao", [corpoDocenteId], "Registrar")}</div>`;
  afmMostrarForm();
}
async function afmEnviarEncerrarAcao(corpoDocenteId) {
  const data = await afmPost("encerrar-corpo", { corpoDocenteId, data: afmEl("afmEncData").value, motivo: afmEl("afmEncMotivo").value });
  avisarResultado(data);
  if (data.sucesso) { afmFecharFormAcao(); afmCarregarCorpoAcao(); }
}

// ---- Sessões Magnas ----
async function afmCarregarMagnasAcao() {
  const cx = afmEl("afmListaMagnas");
  if (!cx) return;
  cx.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const res = await fetchProtegido(`${API_BASE}/afm/sessoes-magnas`);
  const data = await jsonDaTela(res, cx, "objeto");
  if (data === null) return;
  const itens = data.itens || [];
  cx.innerHTML = itens.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Data</th><th>Descrição</th><th>Situação</th><th>Presentes (AFM)</th><th>Faltas sem justificativa</th><th>Justificadas</th></tr></thead><tbody>${itens.map(s => `<tr>
      <td>${afmData(s.data)}</td><td>${escaparHtmlEbd(s.descricao || "-")}</td><td>${escaparHtmlEbd(s.status)}</td><td>${escaparHtmlEbd(s.presentes)}</td><td>${escaparHtmlEbd(s.faltas)}</td><td>${escaparHtmlEbd(s.justificadas)}</td></tr>`).join("")}</tbody></table>`
    : "<p class='subtitle'>Nenhuma Sessão Magna ainda. Ela é aberta em Órgãos Centrais → CLI → Abrir Reunião, com o tipo \"Sessão Magna da AFM\".</p>";
}

// ==================== CLI: Faltas e cadeiras ====================
async function afmCarregarFaltasCLI() {
  const cx = afmEl("afmFaltasCLI");
  if (!cx) return;
  cx.innerHTML = "<p class='subtitle'>Carregando…</p>";
  const res = await fetchProtegido(`${API_BASE}/afm/faltas-cli`);
  const data = await jsonDaTela(res, cx, "objeto");
  if (data === null) return;
  afmFaltasCache = data;
  let html = "";
  const risco = data.emRisco || [];
  html += `<h5 style="margin:10px 0 6px;">Faltas seguidas sem justificativa (com ${escaparHtmlEbd(data.limite)}, sai da CLI)</h5>`;
  html += risco.length
    ? `<table class="tabela-frequencia"><thead><tr><th>Matrícula</th><th>Nome</th><th>Congregação</th><th>Faltas seguidas</th></tr></thead><tbody>${risco.map(m => `<tr>
      <td>${escaparHtmlEbd(m.membroId)}</td><td>${escaparHtmlEbd(m.nome)}</td><td>${escaparHtmlEbd(m.congregacao || "-")}</td><td>${escaparHtmlEbd(m.faltasSeguidas)}${m.faltasSeguidas >= data.limite - 1 ? " ⚠️ a próxima exclui" : ""}</td></tr>`).join("")}</tbody></table>`
    : "<p class='subtitle'>Ninguém da CLI com falta seguida sem justificativa.</p>";
  const vig = (data.exclusoes || []).filter(e => e.vigente);
  html += `<h5 style="margin:16px 0 6px;">Excluídos por faltas (Estatuto, Art. 27 §1º)</h5>`;
  html += vig.length ? vig.map(e => afmCartaoExclusao(e)).join("") : "<p class='subtitle'>Nenhuma exclusão vigente.</p>";
  const inat = data.inativosAFM || [];
  if (inat.length) {
    html += `<h5 style="margin:16px 0 6px;">Fora da CLI por estar inativo na AFM (Estatuto, Art. 15 §1º, I)</h5>
      <p class="subtitle">Entrariam por Ordenação, mas a credencial está suspensa (Regimento, Art. 69 §3º). Voltam sozinhos com a nova matrícula.</p>
      <ul>${inat.map(m => `<li>${escaparHtmlEbd(m.nome)} (${escaparHtmlEbd(m.cargo || "")}, ${escaparHtmlEbd(m.congregacao || "-")}) — inativo desde ${afmData(m.desde)}</li>`).join("")}</ul>`;
  }
  const hist = (data.exclusoes || []).filter(e => !e.vigente);
  if (hist.length) {
    html += `<details><summary>Histórico de exclusões (${hist.length})</summary><ul>${hist.map(e => `<li>${escaparHtmlEbd(e.nome)} — excluído em ${afmData(e.dataExclusao)}; ${e.readmitidaEm
      ? `readmitido em ${afmData(e.readmitidaEm)} (${escaparHtmlEbd(e.readmissaoAto || "")})` : `anulada em ${afmData(e.anuladaEm)}: ${escaparHtmlEbd(e.motivoAnulacao || "")}`}</li>`).join("")}</ul></details>`;
  }
  cx.innerHTML = html;
}

function afmCartaoExclusao(e) {
  const prov = (e.providencias || []).map(p => `<li>${escaparHtmlEbd(p.texto)}${p.prazo ? ` <strong>Prazo: ${afmData(p.prazo)}.</strong>` : ""}</li>`).join("");
  const precisaComunicar = (e.providencias || []).some(p => p.tipo === "COMUNICAR_CLI");
  return `<div class="cartao-perfil">
    <p><strong>${escaparHtmlEbd(e.nome)}</strong> (matrícula ${escaparHtmlEbd(e.membroId)}, ${escaparHtmlEbd(e.congregacao || "-")}) — excluído em ${afmData(e.dataExclusao)}, depois de 3 faltas seguidas sem justificativa.</p>
    <ul>${prov}</ul>
    ${precisaComunicar ? `<p class="linha-perfil">Comunicação à CLI: ${e.comunicadaCLIEm ? afmData(e.comunicadaCLIEm) : "<em>pendente</em>"}</p>` : ""}
    ${authGeral ? `<div class="barra-lista">
      ${precisaComunicar && !e.comunicadaCLIEm ? `<button class="btn-link" data-on-click="afmFormComunicarAcao" data-args-click="${argsAttr(e.exclusaoId)}">Registrar comunicação à CLI…</button>` : ""}
      <button class="btn-link btn-link-sucesso" data-on-click="afmFormReadmitirAcao" data-args-click="${argsAttr(e.exclusaoId)}">Registrar readmissão…</button>
    </div><div id="afmFormExclusao${escaparHtmlEbd(e.exclusaoId)}"></div>` : ""}
    <p class="subtitle">Se uma das 3 faltas for justificada, a exclusão é desfeita sozinha.</p>
  </div>`;
}

function afmFormComunicarAcao(exclusaoId) {
  const cx = afmEl(`afmFormExclusao${exclusaoId}`);
  if (!cx) return;
  cx.innerHTML = `${afmCampoData(`afmComData${exclusaoId}`, "Data em que a CLI foi comunicada")}
    <div class="barra-lista"><button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="afmEnviarComunicarAcao" data-args-click="${argsAttr(exclusaoId)}">Registrar</button></div>`;
  afmMostrarForm(`afmFormExclusao${exclusaoId}`);
}
async function afmEnviarComunicarAcao(exclusaoId) {
  const data = await afmPost("comunicar-exclusao", { exclusaoId, data: afmEl(`afmComData${exclusaoId}`).value });
  avisarResultado(data);
  if (data.sucesso) afmCarregarFaltasCLI();
}
function afmFormReadmitirAcao(exclusaoId) {
  const cx = afmEl(`afmFormExclusao${exclusaoId}`);
  if (!cx) return;
  cx.innerHTML = `<p class="subtitle">Readmissão só por novo processo de admissão (Regimento, Art. 149 §1º). A contagem de faltas recomeça a partir daqui.</p>
    ${afmCampoData(`afmReaData${exclusaoId}`, "Data da readmissão")}
    ${afmCampoLinha(`afmReaAto${exclusaoId}`, "Ato (ata ou deliberação)", "Ex.: Ata da CLI nº 12/2026", 300)}
    <div class="barra-lista"><button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="afmEnviarReadmitirAcao" data-args-click="${argsAttr(exclusaoId)}">Registrar readmissão</button></div>`;
  afmMostrarForm(`afmFormExclusao${exclusaoId}`);
}
async function afmEnviarReadmitirAcao(exclusaoId) {
  const data = await afmPost("readmitir", { exclusaoId, data: afmEl(`afmReaData${exclusaoId}`).value, ato: afmEl(`afmReaAto${exclusaoId}`).value });
  avisarResultado(data);
  if (data.sucesso) { afmCarregarFaltasCLI(); if (typeof carregarComposicaoCLI === "function") carregarComposicaoCLI(); }
}

// Depois de um ato que refaz a apuração (encerrar, justificar, aprovar, rejeitar, corrigir presença): se a CLI está na tela, o quadro e a composição são relidos.
function afmAtualizarSeCLI() {
  const bloco = afmEl("blocoComposicaoCLI");
  if (!bloco || bloco.style.display !== "block") return;
  afmCarregarFaltasCLI();
  if (typeof carregarComposicaoCLI === "function") carregarComposicaoCLI();
}

// A reunião da CLI aberta ou encerrada por engano (ou a segunda no mesmo dia) deixa de contar falta: o servidor refaz a apuração (pode desfazer exclusões).
async function afmNaoContaAcao(sessaoId) {
  const motivo = await pedirTexto("Esta reunião não conta falta", "Por que (10 a 300 caracteres)? Ex.: encerrada por engano com a sala ainda chegando");
  if (motivo === null) return;
  if (!(await confirmarAcao("Confirma? As faltas desta reunião deixam de valer para as 3 faltas da CLI e da Academia, e isso não se desfaz.", "Não conta falta"))) return;
  const data = await afmPost("nao-conta", { sessaoId, motivo });
  avisarResultado(data);
  if (data.sucesso) { if (typeof carregarReunioes === "function") carregarReunioes(); afmAtualizarSeCLI(); }
}

// O seletor de tipo da reunião só aparece para a CLI (as outras reuniões não têm tipo).
function afmAjustarTipoReuniao(ehCLI) {
  const bloco = afmEl("blocoTipoReuniaoCLI");
  if (bloco) bloco.style.display = ehCLI ? "block" : "none";
  const sel = afmEl("reuniaoTipoSessao");
  if (sel) sel.selectedIndex = 0;                  // sempre volta para "Ordinária": uma Extraordinária ou Magna escolhida antes não passa para a próxima reunião
}

// ==================== Meu Painel: a minha situação ====================
async function afmCarregarMinhaSituacao() {
  const cx = afmEl("cartaoAfmCli");
  if (!cx) return;
  cx.innerHTML = "";
  const token = authToken;
  await afmCarregarCatalogo();                     // o nível aparece pelo rótulo ("Básico"), não pelo código
  const res = await fetchProtegido(`${API_BASE}/afm/minha-situacao`);
  const data = await afmJson(res);
  if (token !== authToken) return;                 // a resposta atrasada de outro login não escreve no cartão de quem está agora
  if (!res.ok || !data || !data.sucesso) return;
  const partes = [];
  if (data.cli && data.cli.excluidaEm) {
    partes.push(`<p class="linha-perfil">🏛️ <strong>CLI:</strong> você foi excluído(a) em ${afmData(data.cli.excluidaEm)} por 3 faltas seguidas sem justificativa. Se alguma falta teve motivo externo à igreja, peça a justificativa abaixo; a volta é por novo processo de admissão.</p>`);
  } else if (data.cli && data.cli.naCLI) {
    const n = data.cli.faltasSeguidas || 0;
    partes.push(`<p class="linha-perfil">🏛️ <strong>CLI:</strong> faltas seguidas sem justificativa: ${escaparHtmlEbd(n)} de ${escaparHtmlEbd(data.limite)}${n >= data.limite - 1 ? " — ⚠️ mais uma e você perde a cadeira (Estatuto, Art. 27)" : ""}.</p>`);
  }
  if (data.afm) {
    const a = data.afm;
    const nivel = a.nivel ? `${escaparHtmlEbd((afmCatalogo && (afmCatalogo.niveis.find(x => x.codigo === a.nivel) || {}).rotulo) || a.nivel)} (${a.nivelConcluido ? "concluído" : "cursando"})` : "a informar";
    partes.push(`<p class="linha-perfil">🎓 <strong>AFM:</strong> matrícula ${a.status === "INATIVA" ? "<strong>INATIVA</strong>" : "ativa"} · nível ${nivel}${a.nivelAtende === false ? ` — abaixo do exigido (${escaparHtmlEbd(a.nivelExigido || "")})` : ""} · Sessões Magnas seguidas sem justificativa: ${escaparHtmlEbd(a.faltasSeguidas)} de ${escaparHtmlEbd(data.limite)}.</p>`);
    if (a.licenca && !a.licenca.podeOficiar) partes.push(`<p class="linha-perfil">⚠️ ${escaparHtmlEbd(a.licenca.motivo)}</p>`);
  }
  if (partes.length) cx.innerHTML = `<div class="cartao-perfil">${partes.join("")}</div>`;
}

registrarAcoes({
  afmEnviarCandidatoAcao, afmEnviarCHMAcao, afmEnviarVetarAcao, afmFormCandidatoAcao, afmFormCHMAcao, afmFormVetarAcao, afmRevogarCHMAcao,
  afmEnviarAnularReprovacaoAcao, afmEnviarComunicarAcao, afmEnviarDocenteAcao, afmEnviarEncerrarAcao, afmEnviarHomologarAcao, afmEnviarNivelAcao, afmEnviarNomearReitorAcao,
  afmEnviarReadmitirAcao, afmEnviarReconduzirAcao, afmEnviarRematricularAcao, afmEnviarReprovarAcao, afmFecharFormAcao, afmFiltrarMatriculasAcao, afmFormAnularReprovacaoAcao,
  afmFormComunicarAcao, afmFormDocenteAcao, afmFormEncerrarAcao, afmFormHomologarAcao, afmFormNivelAcao, afmFormNomearReitorAcao, afmFormReadmitirAcao, afmFormReconduzirAcao,
  afmFormRematricularAcao, afmFormReprovarAcao, afmMostrarSecaoAcao, afmNaoContaAcao
});
