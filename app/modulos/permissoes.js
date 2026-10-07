// app/modulos/permissoes.js — módulo extraído do script.js (vD.2, 2026-10-07).
// Script clássico, carregado pelo index.html DEPOIS do script.js e do eventos.js: compartilha o escopo
// global com eles (as funções e constantes abaixo continuam acessíveis pelo nome, como antes). As ações
// que o HTML pede deste módulo são registradas aqui mesmo, no fim do arquivo (registrarAcoes mescla).

// ---- SECRETARIA / ABA PERMISSÕES ----
function onChangeEscopoTodas() {
  const todas = document.getElementById("permissaoEscopoTodas").checked;
  document.querySelectorAll(".escopoChk").forEach(chk => { chk.disabled = todas; });
}

// ---- PERMISSÕES ESTRUTURADAS (papéis + atribuições) ----
let funcionalidadesCache = [];

async function carregarOpcoesEscopoPermissao() {
  const [fres, pres] = await Promise.all([
    fetchProtegido(`${API_BASE}/catalogos/funcionalidades`),
    fetchProtegido(`${API_BASE}/catalogos/papeis`)
  ]);
  funcionalidadesCache = await listaDaApi(fres);
  const papeis = await listaDaApi(pres);

  document.getElementById("permissaoPapel").innerHTML = papeis.map(p => `<option value="${p.papelId}">${escaparHtmlEbd(p.nome)}</option>`).join("");
  document.getElementById("lotePapel").innerHTML = papeis.map(p => `<option value="${p.papelId}">${escaparHtmlEbd(p.nome)}</option>`).join("");

  montarCheckboxesPapeis();
  carregarPapeis();
  carregarPermissoes();
}

// Cada nível da Governança Escalonada usado como escopo de acesso -> catálogo
// de onde vem a lista de opções (ex: escopo "Área" -> catálogo "areas").
const ESCOPO_NIVEIS = {
  EXTENSAO: { origem: "extensoes", idField: "extensaoId" },
  CONGREGACAO: { origem: "congregacoes", idField: "congregacaoId" },
  AREA: { origem: "areas", idField: "areaId" },
  REGIAO: { origem: "regioes", idField: "regiaoId" },
  QUADRANTE: { origem: "quadrantes", idField: "quadranteId" },
  DISTRITO: { origem: "distritos", idField: "distritoId" },
  DEPARTAMENTO: { origem: "departamentos", idField: "departamentoId" }
};

function montarCheckboxesPapeis() {
  document.getElementById("papelPermissoesCheckboxes").innerHTML = funcionalidadesCache.map(f =>
    `<label class="opcao-checkbox"><input type="checkbox" class="papelPermissaoChk" value="${escaparHtmlEbd(f.chave)}" /> ${escaparHtmlEbd(f.nome)}</label>`
  ).join("");
}

async function onChangeEscopoTipoPermissao() {
  const tipo = document.getElementById("permissaoEscopoTipo").value;
  const select = document.getElementById("permissaoEscopoId");
  const nivel = ESCOPO_NIVEIS[tipo];
  if (!nivel) {
    select.style.display = "none";
    select.innerHTML = "";
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/catalogos/${nivel.origem}`);
  const itens = (await res.json()).filter(x => x.ativa !== false && x.ativo !== false);
  select.innerHTML = itens.map(x => `<option value="${escaparHtmlEbd(x[nivel.idField])}">${escaparHtmlEbd(x.nome)}</option>`).join("");
  select.style.display = "inline-block";
}

async function salvarPapel() {
  const papelId = document.getElementById("papelId").value || null;
  const nome = document.getElementById("papelNome").value.trim();
  const nivel = document.getElementById("papelNivel").value;
  const permissoes = Array.from(document.querySelectorAll(".papelPermissaoChk:checked")).map(c => c.value);
  if (!nome) { document.getElementById("resultadoPapel").textContent = "Informe o nome do papel."; return; }
  const body = papelId ? { id: papelId, nome, nivel, permissoes } : { nome, nivel, permissoes };
  const res = await fetchProtegido(`${API_BASE}/catalogos/papeis`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("papelId").value = "";
    document.getElementById("papelNome").value = "";
    document.querySelectorAll(".papelPermissaoChk").forEach(c => c.checked = false);
    carregarPapeis();
    carregarOpcoesEscopoPermissao();
  }
}

async function carregarPapeis() {
  const container = document.getElementById("resultadoListaPapeis");
  const res = await fetchProtegido(`${API_BASE}/catalogos/papeis`);
  const papeis = await jsonDaTela(res, container, "objeto");
  if (papeis === null) return;
  let html = `<table class="tabela-frequencia"><thead><tr><th>Papel</th><th>Nível</th><th>Permissões</th><th></th></tr></thead><tbody>`;
  papeis.forEach(p => {
    html += `<tr>
      <td>${escaparHtmlEbd(p.nome)}</td>
      <td>${escaparHtmlEbd(p.nivel)}</td>
      <td>${escaparHtmlEbd((p.permissoes || []).join(", ")) || "-"}</td>
      <td class="acoes-inline">
        <button class="btn-link" data-on-click="editarPapel" data-args-click="${argsAttr(p.papelId)}">Editar</button>
        <button class="btn-link btn-link-perigo" data-on-click="excluirCatalogo" data-args-click="${argsAttr("papeis", String(p.papelId))}">Excluir</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

function editarPapel(papelId) {
  fetchProtegido(`${API_BASE}/catalogos/papeis`).then(r => r.json()).then(papeis => {
    const p = papeis.find(x => String(x.papelId) === String(papelId));
    if (!p) return;
    document.getElementById("papelId").value = p.papelId;
    document.getElementById("papelNome").value = p.nome;
    document.getElementById("papelNivel").value = p.nivel;
    document.querySelectorAll(".papelPermissaoChk").forEach(c => { c.checked = (p.permissoes || []).includes(c.value); });
    document.getElementById("papelNome").scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

async function salvarPermissao() {
  const membroId = document.getElementById("permissaoMatricula").value;
  const papelId = document.getElementById("permissaoPapel").value;
  const escopoTipo = document.getElementById("permissaoEscopoTipo").value;
  const escopoId = escopoTipo === "GLOBAL" ? null : document.getElementById("permissaoEscopoId").value;
  const senha = document.getElementById("permissaoSenha").value;
  const duracaoMeses = document.getElementById("permissaoDuracaoMeses").value || undefined;
  const msg = document.getElementById("resultadoPermissao");
  if (!membroId || !papelId) { msg.textContent = "Informe matrícula e papel."; return; }
  const res = await fetchProtegido(`${API_BASE}/lideranca`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, papelId, escopoTipo, escopoId, senha: senha || undefined, duracaoMeses })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("permissaoMatricula").value = "";
    document.getElementById("permissaoSenha").value = "";
    document.getElementById("permissaoDuracaoMeses").value = "";
    carregarPermissoes();
  }
}

function onChangeEscopoTipoLote() {
  const tipo = document.getElementById("loteEscopoTipo").value;
  const select = document.getElementById("loteEscopoId");
  const nivel = ESCOPO_NIVEIS[tipo];
  if (!nivel) {
    select.style.display = "none";
    select.innerHTML = "";
    return;
  }
  fetchProtegido(`${API_BASE}/catalogos/${nivel.origem}`).then(r => r.json()).then(itens => {
    const ativos = itens.filter(x => x.ativa !== false && x.ativo !== false);
    const semEscopoFixo = tipo === "CONGREGACAO" ? `<option value="">Cada matrícula usa a própria congregação</option>` : "";
    select.innerHTML = semEscopoFixo + ativos.map(x => `<option value="${escaparHtmlEbd(x[nivel.idField])}">${escaparHtmlEbd(x.nome)}</option>`).join("");
    select.style.display = "inline-block";
  });
}

async function salvarPermissaoLote() {
  const membroIds = (document.getElementById("loteMatriculas").value.match(/\d+/g) || []).map(Number);
  const papelId = document.getElementById("lotePapel").value;
  const escopoTipo = document.getElementById("loteEscopoTipo").value;
  const escopoIdBruto = escopoTipo === "GLOBAL" ? "" : document.getElementById("loteEscopoId").value;
  const escopoId = escopoIdBruto || null;
  const senha = document.getElementById("loteSenha").value;
  const duracaoMeses = document.getElementById("loteDuracaoMeses").value || undefined;
  const container = document.getElementById("resultadoPermissaoLote");
  if (membroIds.length === 0 || !papelId) { container.textContent = "Informe ao menos uma matrícula e o papel."; return; }
  if (!senha) { container.textContent = "Informe a senha inicial."; return; }
  const res = await fetchProtegido(`${API_BASE}/lideranca/lote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroIds, papelId, escopoTipo, escopoId, senha, duracaoMeses })
  });
  const data = await res.json();
  if (!data.sucesso) { container.textContent = data.mensagem || "Erro ao processar o lote."; return; }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Matrícula</th><th>Resultado</th></tr></thead><tbody>`;
  data.resultados.forEach(r => {
    html += `<tr><td>${r.membroId}</td><td>${r.sucesso ? "✅" : "❌"} ${escaparHtmlEbd(r.mensagem)}</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
  if (data.resultados.some(r => r.sucesso)) {
    document.getElementById("loteMatriculas").value = "";
    document.getElementById("loteSenha").value = "";
    document.getElementById("loteDuracaoMeses").value = "";
    carregarPermissoes();
  }
}

async function carregarPermissoes() {
  const container = document.getElementById("resultadoListaPermissoes");
  const res = await fetchProtegido(`${API_BASE}/lideranca`);
  const liderancas = await jsonDaTela(res, container, "lista");
  if (liderancas === null) return;
  if (!Array.isArray(liderancas)) { container.innerHTML = `<p class="subtitle">${escaparHtmlEbd(liderancas && liderancas.mensagem || "Não foi possível carregar.")}</p>`; return; }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Nome</th><th>Papel</th><th>Nível</th><th>Onde atua</th><th>Permissões</th><th></th>
  </tr></thead><tbody>`;
  liderancas.forEach(l => {
    // Avisos para a Secretaria corrigir o cadastro: escopo incoerente com o papel (ou território sem a unidade) e papel Global com escopo limitado (não alcança as telas da administração geral).
    const onde = l.escopoTipo === "GLOBAL" ? "Todas as congregações" : `${l.escopoTipo}${l.escopoId ? ` nº ${l.escopoId}` : ""}`;
    const aviso = l.escopoIncoerente
      ? `<br><small style="color:var(--cor-perigo,#c0392b);">⚠️ Escopo não combina com o papel: edite e escolha onde esta pessoa atua.</small>`
      : (l.semAcessoGeral ? `<br><small style="color:var(--cor-aviso,#b9770e);">ℹ️ Papel Global com escopo limitado: não acessa as telas da administração geral.</small>` : "");
    html += `<tr>
      <td>${Number(l.membroId)}</td>
      <td>${escaparHtmlEbd(l.nome)}</td>
      <td>${escaparHtmlEbd(l.papel)}</td>
      <td>${escaparHtmlEbd(l.nivel)}</td>
      <td>${escaparHtmlEbd(onde)}${aviso}</td>
      <td>${escaparHtmlEbd((l.permissoes || []).join(", ") || "-")}</td>
      <td class="acoes-inline">
        <button class="btn-link" data-on-click="editarPermissao" data-args-click="${argsAttr(Number(l.membroId))}">Editar</button>
        <button class="btn-link" data-on-click="redefinirSenhaLideranca" data-args-click="${argsAttr(Number(l.membroId))}">🔑 Redefinir senha</button>
        <button class="btn-link btn-link-perigo" data-on-click="derrubarAcessosPessoa" data-args-click="${argsAttr(Number(l.membroId))}">⛔ Derrubar acessos desta pessoa agora</button>
        <button class="btn-link btn-link-perigo" data-on-click="removerPermissao" data-args-click="${argsAttr(Number(l.membroId))}">Remover</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

// ---- CATÁLOGO DE REGRAS DE NOTIFICAÇÃO (vB.2 — Motor de notificações) ----
// Nível Global só: mesma restrição de GestaoNotificacaoRegras no backend.
async function carregarNotificacaoRegras() {
  const container = document.getElementById("resultadoListaNotificacaoRegras");
  const res = await fetchProtegido(`${API_BASE}/notificacao-regras`);
  const regras = await jsonDaTela(res, container, "lista");
  if (regras === null) return;
  if (!Array.isArray(regras)) { container.innerHTML = ""; return; }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Regra</th><th>Categoria</th><th>Público-alvo</th><th>Ativa</th><th>E-mail</th><th></th>
  </tr></thead><tbody>`;
  regras.forEach(r => {
    const alvo = [r.permissaoAlvo, r.nivelAlvo].filter(Boolean).join(" / ") || "-";
    html += `<tr>
      <td>${escaparHtmlEbd(r.titulo)}<br><small style="color:var(--cor-texto-suave);">${escaparHtmlEbd(r.chave)}</small></td>
      <td>${escaparHtmlEbd(r.categoria)}</td>
      <td>${escaparHtmlEbd(alvo)}</td>
      <td><input type="checkbox" ${r.ativa ? "checked" : ""} data-on-change="atualizarNotificacaoRegra" data-args-change="${argsAttr(String(r.chave ?? ""), { ativa: ARG.marcado })}" /></td>
      <td><input type="checkbox" ${r.canalEmail ? "checked" : ""} data-on-change="atualizarNotificacaoRegra" data-args-change="${argsAttr(String(r.chave ?? ""), { canalEmail: ARG.marcado })}" /></td>
      <td class="acoes-inline">
        <button class="btn-link" data-on-click="editarTituloNotificacaoRegra" data-args-click="${argsAttr(String(r.chave ?? ""), String(r.titulo ?? ""))}">Editar título</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function atualizarNotificacaoRegra(chave, alteracoes) {
  const res = await fetchProtegido(`${API_BASE}/notificacao-regras/${chave}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(alteracoes)
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarNotificacaoRegras();
}

async function editarTituloNotificacaoRegra(chave, tituloAtual) {
  const novoTitulo = await pedirTexto("Título da regra (aparece no sino)", "", tituloAtual);
  if (!novoTitulo || novoTitulo === tituloAtual) return;
  await atualizarNotificacaoRegra(chave, { titulo: novoTitulo });
}

// Reseta só a senha, sem mexer em papel/escopo — pra quando a pessoa esqueceu
// e não consegue mais logar sozinha (self-service exige estar logado, então
// não serve nesse caso). Reaproveita o mesmo POST /api/lideranca de sempre,
// só reenviando o papel/escopo que já existiam junto com a senha nova.
async function redefinirSenhaLideranca(membroId) {
  const res = await fetchProtegido(`${API_BASE}/lideranca`);
  const liderancas = await listaDaApi(res);
  const l = liderancas.find(x => String(x.membroId) === String(membroId));
  if (!l) return;

  const novaSenha = await pedirTexto(`Nova senha para ${l.nome}`, "Ex: 1234");
  if (!novaSenha) return;

  const confirmacao = await fetchProtegido(`${API_BASE}/lideranca`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId: l.membroId, papelId: l.papelId, escopoTipo: l.escopoTipo, escopoId: l.escopoId, senha: novaSenha })
  });
  const data = await confirmacao.json();
  avisarResultado(data.sucesso ? { sucesso: true, mensagem: `✅ Senha de ${l.nome} redefinida.` } : data);
}

// Pré-preenche o formulário de cima com uma liderança já existente — permite
// trocar papel/escopo, ou resetar a senha (deixando em branco mantém a atual).
async function editarPermissao(membroId) {
  const res = await fetchProtegido(`${API_BASE}/lideranca`);
  const liderancas = await listaDaApi(res);
  const l = liderancas.find(x => String(x.membroId) === String(membroId));
  if (!l) return;
  document.getElementById("permissaoMatricula").value = l.membroId;
  document.getElementById("permissaoPapel").value = l.papelId;
  document.getElementById("permissaoEscopoTipo").value = l.escopoTipo || "GLOBAL";
  await onChangeEscopoTipoPermissao();
  if (l.escopoId) document.getElementById("permissaoEscopoId").value = l.escopoId;
  document.getElementById("permissaoSenha").value = "";
  document.getElementById("permissaoMatricula").scrollIntoView({ behavior: "smooth", block: "center" });
}

// v7.6 — encerra AGORA todas as sessões abertas da pessoa (aparelho perdido, senha vazada): ela sai em poucos segundos em qualquer aparelho. O cargo e a
// senha não mudam (ela pode entrar de novo com a senha) — para impedir a entrada, suspenda ou remova o cargo. Só o nível geral; fica na auditoria.
async function derrubarAcessosPessoa(membroId) {
  if (!(await confirmarAcao("Encerrar agora todas as sessões abertas desta pessoa? Ela sai em poucos segundos em todos os aparelhos. O cargo e a senha continuam os mesmos.", "Derrubar acessos"))) return;
  const res = await fetchProtegido(`${API_BASE}/lideranca/${Number(membroId)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "DERRUBAR_ACESSOS" })
  });
  const data = await res.json();
  avisarResultado(data);
}

async function removerPermissao(membroId) {
  if (!(await confirmarAcao("Confirma remover o acesso à Secretaria desta pessoa?", "Remover"))) return;
  const res = await fetchProtegido(`${API_BASE}/lideranca/${membroId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarPermissoes();
}

registrarAcoes({
  atualizarNotificacaoRegra, derrubarAcessosPessoa, editarPapel, editarPermissao, editarTituloNotificacaoRegra, onChangeEscopoTipoLote,
  onChangeEscopoTipoPermissao, redefinirSenhaLideranca, removerPermissao, salvarPapel, salvarPermissao, salvarPermissaoLote
});
