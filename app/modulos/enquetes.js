// app/modulos/enquetes.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- SECRETARIA / ABA ENQUETES (v2.8) — formulário com várias perguntas ----
let contadorBlocoPerguntaEnquete = 0;

function adicionarBlocoPerguntaEnquete() {
  const id = ++contadorBlocoPerguntaEnquete;
  const div = document.createElement("div");
  div.className = "cartao-perfil";
  div.style.margin = "8px 0";
  div.id = `blocoPerguntaEnquete_${id}`;
  div.innerHTML = `
    <div class="barra-lista">
      <input type="text" id="perguntaTitulo_${id}" placeholder="Título da pergunta" style="min-width:220px;" />
      <select id="perguntaTipo_${id}" data-on-change="onChangeTipoPerguntaEnquete" data-args-change="${argsAttr(id)}">
        <option value="OPCOES">Tipo: Opções</option>
        <option value="TEXTO_LIVRE">Tipo: Texto livre</option>
      </select>
      <button type="button" class="btn-link btn-link-perigo" data-on-click="removerBlocoPerguntaEnquete" data-args-click="${argsAttr(id)}">Remover</button>
    </div>
    <div class="input-group" id="grupoOpcoesPergunta_${id}">
      <textarea id="perguntaOpcoes_${id}" rows="2" placeholder="Uma opção por linha (mínimo 2)"></textarea>
    </div>
  `;
  document.getElementById("listaPerguntasEnquete").appendChild(div);
}

function removerBlocoPerguntaEnquete(id) {
  const el = document.getElementById(`blocoPerguntaEnquete_${id}`);
  if (el) el.remove();
}

function onChangeTipoPerguntaEnquete(id) {
  const ehOpcoes = document.getElementById(`perguntaTipo_${id}`).value === "OPCOES";
  document.getElementById(`grupoOpcoesPergunta_${id}`).style.display = ehOpcoes ? "block" : "none";
}

// Enquete para TODOS os membros ativos (e a vinculante) é da administração geral (GestaoEnquetes: MSG_SO_GERAL): para os demais a opção nem aparece e o
// público já vem como lista de matrículas do próprio escopo. O servidor confere de novo.
function ajustarFormEnquetePorNivel() {
  const sel = document.getElementById("enquetePublicoTipo");
  if (!sel) return;
  const opTodos = sel.querySelector("option[value=\"TODOS_ATIVOS\"]");
  if (opTodos) { opTodos.disabled = !authGeral; opTodos.hidden = !authGeral; }
  if (!authGeral) {
    if (sel.value === "TODOS_ATIVOS") sel.value = "LISTA_CUSTOM";
    const vinc = document.getElementById("enqueteVinculante");
    if (vinc && vinc.checked) { vinc.checked = false; onChangeVinculanteEnquete(); }
  }
  onChangePublicoEnquete();
}
function onChangePublicoEnquete() {
  const ehCustom = document.getElementById("enquetePublicoTipo").value === "LISTA_CUSTOM";
  document.getElementById("grupoPublicoCustomEnquete").style.display = ehCustom ? "block" : "none";
}

function onChangeVinculanteEnquete() {
  document.getElementById("enqueteQuorumTipo").style.display = document.getElementById("enqueteVinculante").checked ? "inline-block" : "none";
}

function lerBlocosPerguntaEnquete() {
  const blocos = Array.from(document.querySelectorAll("#listaPerguntasEnquete > div"));
  return blocos.map(bloco => {
    const id = bloco.id.replace("blocoPerguntaEnquete_", "");
    const titulo = document.getElementById(`perguntaTitulo_${id}`).value.trim();
    const tipo = document.getElementById(`perguntaTipo_${id}`).value;
    const opcoes = tipo === "OPCOES"
      ? document.getElementById(`perguntaOpcoes_${id}`).value.split("\n").map(o => o.trim()).filter(Boolean)
      : undefined;
    return { titulo, tipo, opcoes };
  });
}

async function salvarEnquete() {
  const titulo = document.getElementById("enqueteTitulo").value.trim();
  const descricao = document.getElementById("enqueteDescricao").value.trim();
  const visibilidade = document.getElementById("enqueteVisibilidade").value;
  const publicoTipo = document.getElementById("enquetePublicoTipo").value;
  const vinculante = document.getElementById("enqueteVinculante").checked;
  const quorumTipo = document.getElementById("enqueteQuorumTipo").value;
  const perguntas = lerBlocosPerguntaEnquete();
  const publicoMembroIds = (document.getElementById("enquetePublicoMatriculas").value.match(/\d+/g) || []).map(Number);
  const msg = document.getElementById("resultadoEnquete");
  if (!titulo) { msg.textContent = "Informe o título."; return; }
  if (perguntas.length === 0) { msg.textContent = "Adicione ao menos 1 pergunta."; return; }

  const res = await fetchProtegido(`${API_BASE}/enquetes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      titulo, descricao: descricao || undefined, visibilidade, publicoTipo, perguntas,
      publicoMembroIds: publicoTipo === "LISTA_CUSTOM" ? publicoMembroIds : undefined,
      vinculante, quorumTipo: vinculante ? quorumTipo : undefined
    })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("enqueteTitulo").value = "";
    document.getElementById("enqueteDescricao").value = "";
    document.getElementById("enquetePublicoMatriculas").value = "";
    document.getElementById("enqueteVinculante").checked = false;
    document.getElementById("listaPerguntasEnquete").innerHTML = "";
    onChangeVinculanteEnquete();
    carregarEnquetes();
  }
}

const ROTULO_VISIBILIDADE_ENQUETE = { PUBLICA: "Pública", SECRETA: "Secreta" };
const ROTULO_QUORUM_ENQUETE = { MAIORIA_SIMPLES: "Maioria simples", DOIS_TERCOS: "Dois terços", NOVENTA_POR_CENTO: "90%" };

function campoRespostaPergunta(enqueteId, pergunta) {
  return pergunta.tipo === "OPCOES"
    ? `<select id="votoResposta_${enqueteId}_${pergunta.perguntaId}">${(pergunta.opcoes || []).map(o => `<option value="${Number(o.opcaoId)}">${escaparHtmlEbd(o.texto)}</option>`).join("")}</select>`
    : `<input type="text" id="votoResposta_${enqueteId}_${pergunta.perguntaId}" placeholder="Sua resposta" style="min-width:200px;" />`;
}

async function carregarEnquetes() {
  const container = document.getElementById("resultadoListaEnquetes");
  const res = await fetchProtegido(`${API_BASE}/enquetes`);
  const enquetes = await jsonDaTela(res, container, "lista");
  if (enquetes === null) return;
  if (!Array.isArray(enquetes) || enquetes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma enquete criada ainda.</p>";
    return;
  }
  let html = "";
  enquetes.forEach(e => {
    const participantesHtml = (e.participantes || []).map(p => escaparHtmlEbd(p.nome)).join(", ") || "ninguém ainda";
    const resultadoHtml = e.status === "ENCERRADA" && e.vinculante
      ? `<p><strong>${e.resultadoAprovado ? "✅ Aprovado" : "❌ Não aprovado"}</strong> (${escaparHtmlEbd(ROTULO_QUORUM_ENQUETE[e.quorumTipo] || e.quorumTipo)})</p>`
      : "";
    const perguntasHtml = (e.perguntas || []).map(p => {
      const opcoesHtml = (p.opcoes || []).map(o => `<li>${escaparHtmlEbd(o.texto)}: <strong>${Number(o.votos)}</strong> resposta(s)</li>`).join("");
      const detalhePublico = e.visibilidade === "PUBLICA" && Array.isArray(p.respostas)
        ? `<p class="subtitle">Quem respondeu: ${p.respostas.map(r => `${escaparHtmlEbd(r.nome)} → ${escaparHtmlEbd(r.textoResposta || (p.opcoes.find(o => o.opcaoId === r.opcaoId) || {}).texto || "-")}`).join("; ") || "ninguém ainda"}</p>`
        : "";
      const campoVoto = e.status === "ABERTA" ? `<div>${campoRespostaPergunta(e.enqueteId, p)}</div>` : "";
      return `<li style="margin-bottom:8px;"><strong>${escaparHtmlEbd(p.titulo)}</strong> (${Number(p.totalRespostas)} resposta(s))
        ${p.tipo === "OPCOES" ? `<ul>${opcoesHtml}</ul>` : ""}
        ${detalhePublico}
        ${campoVoto}
      </li>`;
    }).join("");
    html += `<div class="cartao-perfil" style="margin-bottom:12px;">
      <h4 style="margin:0 0 6px; color: var(--cor-primaria);">${escaparHtmlEbd(e.titulo)} ${e.vinculante ? "🔒 vinculante" : ""}</h4>
      <p class="subtitle">${escaparHtmlEbd(e.descricao || "")}</p>
      <p class="subtitle">Visibilidade: ${escaparHtmlEbd(ROTULO_VISIBILIDADE_ENQUETE[e.visibilidade] || e.visibilidade)} · Status: ${escaparHtmlEbd(e.status)} · Participantes: ${Number(e.totalVotos)}</p>
      <ul>${perguntasHtml}</ul>
      <p class="subtitle">Participaram: ${participantesHtml}</p>
      ${resultadoHtml}
      ${e.status === "ABERTA" ? `
        <div class="barra-lista">
          <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="votarEnqueteAcao" data-args-click="${argsAttr(e.enqueteId)}">Enviar respostas</button>
          <button class="btn-link btn-link-perigo" data-on-click="encerrarEnqueteAcao" data-args-click="${argsAttr(e.enqueteId)}">Encerrar</button>
        </div>` : ""}
    </div>`;
  });
  container.innerHTML = html;
}

async function votarEnqueteAcao(enqueteId) {
  const camposResposta = document.querySelectorAll(`[id^="votoResposta_${enqueteId}_"]`);
  const respostas = Array.from(camposResposta).map(campo => {
    const perguntaId = Number(campo.id.split("_")[2]);
    const ehSelect = campo.tagName === "SELECT";
    return ehSelect ? { perguntaId, opcaoId: campo.value } : { perguntaId, textoResposta: campo.value.trim() };
  });
  // O voto é da pessoa que está logada (a matrícula vem da sessão, não de um campo digitado).
  const res = await fetchProtegido(`${API_BASE}/enquetes/${enqueteId}/votar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ respostas })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarEnquetes();
}

async function encerrarEnqueteAcao(enqueteId) {
  if (!(await confirmarAcao("Encerrar esta enquete? Não dá pra reabrir.", "Encerrar"))) return;
  const res = await fetchProtegido(`${API_BASE}/enquetes/${enqueteId}/encerrar`, { method: "POST" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarEnquetes();
}

registrarAcoes({
  adicionarBlocoPerguntaEnquete, encerrarEnqueteAcao, onChangePublicoEnquete, onChangeTipoPerguntaEnquete, onChangeVinculanteEnquete,
  removerBlocoPerguntaEnquete, salvarEnquete, votarEnqueteAcao
});
