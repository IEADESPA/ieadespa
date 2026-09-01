const API_BASE = "/api";
const ORGAO_ID_MINISTERIO = 1; // único órgão em vigor hoje (Estatuto 2021)

// ---- mensagens em tela (substituem alert/confirm/prompt do navegador) ----
function mostrarToast(mensagem, tipo) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = "toast" + (tipo === "sucesso" ? " toast-sucesso" : tipo === "erro" ? " toast-erro" : "");
  toast.textContent = mensagem;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-saindo");
    setTimeout(() => toast.remove(), 200);
  }, 4200);
}
// Atalho: manda o toast certo a partir de uma resposta { sucesso, mensagem } da API.
function avisarResultado(data) {
  mostrarToast(data.mensagem, data.sucesso ? "sucesso" : "erro");
}

function fecharModal() {
  document.getElementById("modalOverlay").classList.add("escondido");
  document.getElementById("modalCaixa").innerHTML = "";
}

// Promise<boolean> — true se confirmou.
function confirmarAcao(mensagem, tituloBotao) {
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <p>${mensagem}</p>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar btn-perigo" id="modalConfirmar">${tituloBotao || "Confirmar"}</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    document.getElementById("modalConfirmar").onclick = () => { fecharModal(); resolve(true); };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(false); };
  });
}

// Promise<string|null> — texto digitado, ou null se cancelou.
function pedirTexto(titulo, placeholder, valorInicial) {
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>${titulo}</h3>
      <textarea id="modalTexto" rows="3" placeholder="${placeholder || ""}"></textarea>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar" id="modalConfirmar">Enviar</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    const campo = document.getElementById("modalTexto");
    campo.value = valorInicial || "";
    campo.focus();
    document.getElementById("modalConfirmar").onclick = () => { const v = campo.value.trim(); fecharModal(); resolve(v || null); };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

// ---- estado do Painel único (guardado só no navegador) ----
// authToken só existe pra quem tem acesso administrativo (Lideranca); a matrícula
// fica salva sempre, pra popular a aba "Meu Painel" e sobreviver a um F5.
let authToken = sessionStorage.getItem("authToken") || null;
let authNome = sessionStorage.getItem("authNome") || null;
let authPermissoes = JSON.parse(sessionStorage.getItem("authPermissoes") || "[]");
let authMatricula = sessionStorage.getItem("authMatricula") || null;

function salvarSessao(token, nome, permissoes, matricula) {
  authToken = token;
  authNome = nome;
  authPermissoes = permissoes || [];
  authMatricula = matricula != null ? String(matricula) : authMatricula;
  sessionStorage.setItem("authToken", token);
  sessionStorage.setItem("authNome", nome || "");
  sessionStorage.setItem("authPermissoes", JSON.stringify(authPermissoes));
  if (authMatricula != null) sessionStorage.setItem("authMatricula", authMatricula);
}
function limparSessao() {
  authToken = null;
  authNome = null;
  authPermissoes = [];
  authMatricula = null;
  sessionStorage.removeItem("authToken");
  sessionStorage.removeItem("authNome");
  sessionStorage.removeItem("authPermissoes");
  sessionStorage.removeItem("authMatricula");
}

// fetch com o header de autenticação da Secretaria; se a sessão expirou (401)
// ou falta permissão (403), avisa e (no caso de 401) volta pro login.
async function fetchProtegido(url, opts = {}) {
  const headers = Object.assign({}, opts.headers, {
    "x-auth-token": authToken,
    Authorization: "Bearer " + authToken
  });
  const res = await fetch(url, Object.assign({}, opts, { headers }));
  if (res.status === 401) {
    limparSessao();
    mostrarToast("Sua sessão expirou. Faça login novamente.", "erro");
    mostrarTelaPainelInicial();
    throw new Error("Sessão expirada");
  }
  if (res.status === 403) {
    mostrarToast("Você não tem permissão para essa ação.", "erro");
  }
  return res;
}

// ---- navegação entre telas ----
function esconderTodasAsTelas() {
  document.getElementById("telaCheckin").style.display = "none";
  document.getElementById("telaPainel").style.display = "none";
}

function voltarParaCheckin() {
  esconderTodasAsTelas();
  document.getElementById("telaCheckin").style.display = "flex";
}

// Ponto único de entrada no Painel — vindo do "📋 Acessar meu Painel" da Portaria.
// Se já tiver sessão administrativa aberta (F5 não derruba), pula direto pro
// conteúdo; senão mostra o portão de matrícula + senha.
function mostrarTelaPainelInicial() {
  esconderTodasAsTelas();
  document.getElementById("telaPainel").style.display = "flex";
  document.getElementById("resultadoLogin").textContent = "";
  if (authToken && authMatricula) {
    abrirPainelConteudo(authMatricula);
  } else {
    document.getElementById("cxLoginPainel").style.display = "block";
    document.getElementById("cxPainelConteudo").style.display = "none";
  }
}

// ---- Painel único: um só acesso; o que aparece depende das permissões ----
// Com senha -> login administrativo (Lideranca), abre todas as abas permitidas.
// Sem senha -> só a aba "Meu Painel" (consulta pública por matrícula, como já era).
async function acessarPainel() {
  const matricula = document.getElementById("matriculaPainel").value;
  const senha = document.getElementById("senhaPainel").value;
  const msg = document.getElementById("resultadoLogin");
  if (!matricula) {
    msg.textContent = "Informe sua matrícula.";
    return;
  }

  if (senha) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matricula, senha })
    });
    const data = await res.json();
    if (!data.sucesso) {
      msg.textContent = data.mensagem;
      return;
    }
    salvarSessao(data.token, data.nome, data.permissoes, matricula);
  } else {
    limparSessao();
    authMatricula = String(matricula);
  }

  document.getElementById("senhaPainel").value = "";
  msg.textContent = "";
  await abrirPainelConteudo(matricula);
}

async function abrirPainelConteudo(matricula) {
  document.getElementById("cxLoginPainel").style.display = "none";
  document.getElementById("cxPainelConteudo").style.display = "flex";
  document.getElementById("nomeLogado").textContent = authNome ? `Olá, ${authNome}` : "";
  document.getElementById("cxTrocarSenha").style.display = authToken ? "block" : "none";
  aplicarPermissoesNoMenu();
  await carregarPainelPessoal(matricula);
}

// Self-service: só aparece pra quem logou com senha (tem Lideranca). Não pede
// a senha atual — a sessão já autenticada é a prova de identidade.
async function trocarMinhaSenha() {
  const novaSenha = document.getElementById("novaSenhaPessoal").value;
  const msg = document.getElementById("resultadoTrocaSenha");
  if (!novaSenha) { msg.textContent = "Informe a nova senha."; return; }
  const res = await fetchProtegido(`${API_BASE}/auth/senha`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ novaSenha })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem || "";
  if (data.sucesso) document.getElementById("novaSenhaPessoal").value = "";
}

function sairDoPainel() {
  if (authToken) {
    fetchProtegido(`${API_BASE}/auth/logout`, { method: "POST" }).catch(() => { /* já tratado no fetchProtegido */ });
  }
  limparSessao();
  document.getElementById("matriculaPainel").value = "";
  document.getElementById("senhaPainel").value = "";
  voltarParaCheckin();
}

// "meupainel" é sempre visível pra qualquer matrícula — as demais abas dependem
// de authPermissoes (fica vazio pra quem entrou só com matrícula, sem senha).
const NOMES_ABAS = ["meupainel", "reunioes", "assembleia", "pessoas", "funcoes", "orgaos", "estrutura", "catalogos", "permissoes", "consagracoes", "documentos"];

function aplicarPermissoesNoMenu() {
  NOMES_ABAS.forEach(nome => {
    if (nome === "meupainel" || nome === "documentos") return;
    const btn = document.getElementById(`btnAba${capitalize(nome)}`);
    const pode = authPermissoes.includes(btn.dataset.permissao);
    btn.style.display = pode ? "inline-block" : "none";
  });
  mostrarAbaSecretaria("meupainel");
}

function mostrarAbaSecretaria(aba) {
  NOMES_ABAS.forEach(nome => {
    const chavePermissao = ["congregacoes", "funcoes", "orgaos", "estrutura", "catalogos"].includes(nome) ? "pessoas" : nome;
    const podeVer = nome === "meupainel" || nome === "documentos" || authPermissoes.includes(chavePermissao);
    const divAba = document.getElementById(`aba${capitalize(nome)}`);
    const mostrar = nome === aba && podeVer;
    divAba.style.display = mostrar ? "block" : "none";
    const btn = document.getElementById(`btnAba${capitalize(nome)}`);
    if (btn) btn.classList.toggle("ativo", nome === aba);
  });
  document.getElementById("tituloModulo").textContent = TITULOS_MODULOS[aba] || "Governança";
  if (aba === "reunioes") carregarReunioes();
  if (aba === "assembleia") carregarAssembleia();
  if (aba === "pessoas") { carregarOpcoesFormPessoa(); carregarPessoas(); }
  if (aba === "funcoes") carregarFuncoes();
  if (aba === "orgaos") carregarOrgaos();
  if (aba === "estrutura") montarEstrutura();
  if (aba === "catalogos") montarCatalogos();
  if (aba === "permissoes") { carregarOpcoesEscopoPermissao(); carregarPermissoes(); }
  if (aba === "consagracoes") { carregarTiposConsagracao(); carregarConsagracoes(); }
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function alternarSidebar() {
  document.getElementById("sidebar").classList.toggle("recolhido");
}
const TITULOS_MODULOS = {
  meupainel: "Meu Painel", reunioes: "Reuniões", assembleia: "Assembleia Geral",
  pessoas: "Pessoas", congregacoes: "Congregações", funcoes: "Funções",
  orgaos: "Órgãos", estrutura: "Estrutura", catalogos: "Catálogos",
  permissoes: "Permissões", consagracoes: "Consagrações", documentos: "Documentos"
};

// ---- PORTARIA: registrar presença (pública, sem login) ----
async function enviarPresenca() {
  const matricula = document.getElementById("matricula").value;
  const senha = document.getElementById("senha").value;
  if (!matricula || !senha) return;

  const btn = document.getElementById("btnBaterPonto");
  btn.textContent = "Aguarde...";

  try {
    const res = await fetch(`${API_BASE}/presenca`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matricula, senha })
    });
    const data = await res.json();
    avisarResultado(data);
    if (data.sucesso) {
      document.getElementById("matricula").value = "";
      document.getElementById("senha").value = "";
    }
  } catch (e) {
    mostrarToast("Erro de conexão. A API está rodando? (" + e.message + ")", "erro");
  } finally {
    btn.textContent = "Registrar Presença";
  }
}

// ---- SECRETARIA / ABA REUNIÕES ----
function statusFrequencia(item) {
  if (item.presente) return "Presente";
  if (item.faltaJustificada) return "Falta justificada";
  return "Falta";
}
function badgeStatusPessoa(status) {
  const classes = { ATIVO: "badge-ativo", "LICENÇA": "badge-licenca", INATIVO: "badge-inativo", DESLIGADO: "badge-desligado" };
  return `<span class="badge-status ${classes[status] || ""}">${status}</span>`;
}

function idadeDe(dataNascimento) {
  if (!dataNascimento) return null;
  const n = new Date(dataNascimento);
  const hoje = new Date();
  let idade = hoje.getFullYear() - n.getFullYear();
  const m = hoje.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < n.getDate())) idade--;
  return idade;
}

function badgeCategoria(capacidade) {
  const c = capacidade || {};
  const cores = {
    "Membro Elegível": "badge-ativo",
    "Capacidade Eleitoral Ativa": "badge-ativo",
    "Membro em Comunhão": "badge-ativo",
    "Sem comunhão": "badge-desligado",
    "Congregado": "badge-inativo",
    "Dados incompletos": "badge-licenca"
  };
  return `<span class="badge-status ${cores[c.categoria] || "badge-licenca"}">${c.categoria || "-"}</span>`;
}

async function carregarOrgaos() {
  const container = document.getElementById("resultadoListaOrgaos");
  const res = await fetch(`${API_BASE}/orgaos`);
  const orgaos = await res.json();
  window._orgaosCache = orgaos;
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>ID</th><th>Sigla</th><th>Nome</th><th>Quórum mín.</th><th>Quórum delib.</th><th>Faltas</th><th></th>
  </tr></thead><tbody>`;
  orgaos.forEach(o => {
    html += `<tr>
      <td>${o.orgaoId}</td>
      <td>${o.sigla}</td>
      <td>${o.nome}</td>
      <td>${o.quorumMinimoPct ?? "-"}</td>
      <td>${o.quorumDeliberativoPct ?? "-"}</td>
      <td>${o.faltasParaPerdaAssento ?? "-"}</td>
      <td class="acoes-inline">
        <button class="btn-link" onclick="editarOrgao(${o.orgaoId})">Editar</button>
        <button class="btn-link btn-link-perigo" onclick="excluirOrgao(${o.orgaoId})">Excluir</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

function editarOrgao(orgaoId) {
  const o = (window._orgaosCache || []).find(x => x.orgaoId === orgaoId);
  if (!o) return;
  document.getElementById("orgaoId").value = o.orgaoId;
  document.getElementById("orgaoSigla").value = o.sigla;
  document.getElementById("orgaoNome").value = o.nome;
  document.getElementById("orgaoQuorumMinimo").value = o.quorumMinimoPct ?? "";
  document.getElementById("orgaoQuorumDeliberativo").value = o.quorumDeliberativoPct ?? "";
  document.getElementById("orgaoFaltasPerda").value = o.faltasParaPerdaAssento ?? "";
  document.getElementById("orgaoSigla").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function salvarOrgao() {
  const orgaoId = document.getElementById("orgaoId").value || null;
  const sigla = document.getElementById("orgaoSigla").value.trim();
  const nome = document.getElementById("orgaoNome").value.trim();
  const quorumMinimoPct = document.getElementById("orgaoQuorumMinimo").value;
  const quorumDeliberativoPct = document.getElementById("orgaoQuorumDeliberativo").value;
  const faltasParaPerdaAssento = document.getElementById("orgaoFaltasPerda").value;
  if (!sigla || !nome) { document.getElementById("resultadoOrgao").textContent = "Informe sigla e nome."; return; }
  const res = await fetchProtegido(`${API_BASE}/orgaos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgaoId, sigla, nome, quorumMinimoPct, quorumDeliberativoPct, faltasParaPerdaAssento })
  });
  const data = await res.json();
  document.getElementById("resultadoOrgao").textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("orgaoId").value = "";
    document.getElementById("orgaoSigla").value = "";
    document.getElementById("orgaoNome").value = "";
    document.getElementById("orgaoQuorumMinimo").value = "";
    document.getElementById("orgaoQuorumDeliberativo").value = "";
    document.getElementById("orgaoFaltasPerda").value = "";
    carregarOrgaos();
  }
}

async function excluirOrgao(orgaoId) {
  if (!(await confirmarAcao("Excluir este órgão? A ação não pode ser desfeita.", "Excluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/orgaos/${orgaoId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  carregarOrgaos();
}

// ---- Catálogos & Estrutura (CRUD genérico + linkagem hierárquica + paginação) ----
const CATALOGOS_CFG = {
  congregacoes: { titulo: "Congregações (Nível 1)", idField: "congregacaoId", campos: [["nome", "Nome da Congregação"]], pai: { campo: "areaId", rotulo: "Área", origem: "areas" } },
  areas: { titulo: "Áreas (Nível 2)", idField: "areaId", campos: [["nome", "Nome da Área"]], pai: { campo: "regiaoId", rotulo: "Região", origem: "regioes" } },
  regioes: { titulo: "Regiões (Nível 3)", idField: "regiaoId", campos: [["nome", "Nome da Região"]], pai: { campo: "quadranteId", rotulo: "Quadrante", origem: "quadrantes" } },
  quadrantes: { titulo: "Quadrantes (Nível 4)", idField: "quadranteId", campos: [["nome", "Nome do Quadrante"]], pai: { campo: "distritoId", rotulo: "Distrito", origem: "distritos" } },
  distritos: { titulo: "Distritos (Nível 5)", idField: "distritoId", campos: [["nome", "Nome do Distrito"]] },
  extensoes: { titulo: "Extensões da Tenda (Nível 0)", idField: "extensaoId", campos: [["nome", "Nome da Extensão"]], pai: { campo: "congregacaoMaeId", rotulo: "Congregação-Mãe", origem: "congregacoes" } },
  situacoes: { titulo: "Situações de Membro", idField: "situacaoId", campos: [["sigla", "Sigla"], ["nome", "Nome"]] },
  departamentos: { titulo: "Departamentos", idField: "departamentoId", campos: [["sigla", "Sigla"], ["nome", "Nome"], ["numero", "Número"]] },
  tiposConsagracao: { titulo: "Tipos de Proposta (Consagrações)", idField: "tipoConsagracaoId", campos: [["nome", "Nome do Tipo"]] },
  orgaosLocais: { titulo: "Órgãos Locais (JAI/JEA/CRA/TER/CEQ/Distrito)", idField: "orgaoLocalId", campos: [["sigla", "Sigla (JAI/JEA/CRA/TER/CEQ/DISTRITO)"], ["nome", "Nome"], ["nivel", "Nível (1-5)"], ["referenciaId", "Id da Congregação/Área/Região/Quadrante/Distrito"]] },
  cargosMinisteriais: { titulo: "Cargos Ministeriais (escada — Art. 71)", idField: "cargoId", campos: [["sigla", "Sigla"], ["nome", "Nome"], ["ordem", "Ordem na escada"]] },
  prazos: { titulo: "Prazos (Estatuto/Regimento)", idField: "prazoId", campos: [["sigla", "Sigla"], ["nome", "Nome"], ["dias", "Dias"]] }
};
const ESTRUTURA_ORDEM = ["congregacoes", "areas", "regioes", "quadrantes", "distritos", "extensoes", "orgaosLocais"];
const CATALOGOS_ORDEM = ["situacoes", "departamentos", "cargosMinisteriais", "tiposConsagracao", "prazos"];
const CATALOGOS_PAGINA = 15;
let catalogoCache = {};
let catalogoPagina = {};

function montarEstrutura() {
  document.getElementById("estruturaConteudo").innerHTML = ESTRUTURA_ORDEM.map(k => secaoCatalogo(k)).join("");
  ESTRUTURA_ORDEM.forEach(k => { carregarOpcoesPai(k); carregarCatalogoLista(k); });
}

function montarCatalogos() {
  document.getElementById("catalogosConteudo").innerHTML = CATALOGOS_ORDEM.map(k => secaoCatalogo(k)).join("");
  CATALOGOS_ORDEM.forEach(k => { carregarOpcoesPai(k); carregarCatalogoLista(k); });
}

function secaoCatalogo(key) {
  const c = CATALOGOS_CFG[key];
  const camposHtml = c.campos.map(([id, rotulo]) => `<input type="text" id="cat_${key}_${id}" placeholder="${rotulo}" style="min-width:150px;" />`).join("");
  const paiHtml = c.pai ? `<select id="cat_${key}_${c.pai.campo}" style="min-width:180px;"><option value="">Sem ${c.pai.rotulo}</option></select>` : "";
  return `<div class="cartao-perfil" style="margin-bottom:16px;">
    <h4 style="margin:0 0 10px; color: var(--cor-primaria);">${c.titulo}</h4>
    <div class="barra-lista">
      ${camposHtml}
      ${paiHtml}
      <button class="btn-confirmar" style="width:auto;margin:0;" onclick="salvarCatalogo('${key}')">➕ Adicionar</button>
    </div>
    <div class="barra-lista">
      <input type="text" id="busca_${key}" placeholder="🔍 Buscar" oninput="filtrarCatalogo('${key}')" style="min-width:150px;" />
      <span id="info_${key}" class="subtitle" style="margin:0;"></span>
    </div>
    <div class="rolagem-tabela"><div id="lista_cat_${key}"></div></div>
    <div class="paginacao" id="pag_${key}"></div>
  </div>`;
}

async function carregarOpcoesPai(key) {
  const c = CATALOGOS_CFG[key];
  if (!c.pai) return;
  const res = await fetch(`${API_BASE}/catalogos/${c.pai.origem}`);
  const itens = await res.json();
  const select = document.getElementById(`cat_${key}_${c.pai.campo}`);
  if (!select) return;
  const idField = CATALOGOS_CFG[c.pai.origem].idField;
  select.innerHTML = `<option value="">Sem ${c.pai.rotulo}</option>` + itens.map(x => `<option value="${x[idField]}">${x.nome}</option>`).join("");
}

async function carregarCatalogoLista(key) {
  const c = CATALOGOS_CFG[key];
  const res = await fetch(`${API_BASE}/catalogos/${key}`);
  catalogoCache[key] = await res.json();
  if (c.pai) {
    const pres = await fetch(`${API_BASE}/catalogos/${c.pai.origem}`);
    const pitens = await pres.json();
    const pidField = CATALOGOS_CFG[c.pai.origem].idField;
    catalogoCache[`_pai_${key}`] = {};
    pitens.forEach(x => catalogoCache[`_pai_${key}`][x[pidField]] = x.nome);
  }
  catalogoPagina[key] = 1;
  renderizarCatalogo(key);
}

function filtrarCatalogo(key) { catalogoPagina[key] = 1; renderizarCatalogo(key); }

function renderizarCatalogo(key) {
  const c = CATALOGOS_CFG[key];
  const busca = (document.getElementById(`busca_${key}`).value || "").toLowerCase();
  const todos = catalogoCache[key] || [];
  const filtrados = todos.filter(x => !busca || c.campos.some(([id]) => String(x[id] ?? "").toLowerCase().includes(busca)));
  const total = filtrados.length;
  const totalPaginas = Math.max(1, Math.ceil(total / CATALOGOS_PAGINA));
  if ((catalogoPagina[key] || 1) > totalPaginas) catalogoPagina[key] = totalPaginas;
  const ini = ((catalogoPagina[key] || 1) - 1) * CATALOGOS_PAGINA;
  const pagina = filtrados.slice(ini, ini + CATALOGOS_PAGINA);
  const container = document.getElementById(`lista_cat_${key}`);

  if (total === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum registro.</p>";
  } else {
    let html = "<table class='tabela-frequencia'><thead><tr>";
    c.campos.forEach(([id]) => html += `<th>${id}</th>`);
    if (c.pai) html += `<th>${c.pai.rotulo}</th>`;
    html += "<th></th></tr></thead><tbody>";
    pagina.forEach(x => {
      html += "<tr>";
      c.campos.forEach(([id]) => html += `<td>${x[id] ?? "-"}</td>`);
      if (c.pai) html += `<td>${(catalogoCache[`_pai_${key}`] || {})[x[c.pai.campo]] || "-"}</td>`;
      html += `<td class="acoes-inline">
        <button class="btn-link" onclick="editarCatalogo('${key}', '${x[c.idField]}')">Editar</button>
        <button class="btn-link btn-link-perigo" onclick="excluirCatalogo('${key}', '${x[c.idField]}')">Excluir</button>
      </td></tr>`;
    });
    html += "</tbody></table>";
    container.innerHTML = html;
  }

  document.getElementById(`info_${key}`).textContent = `${total} registro(s)`;
  document.getElementById(`pag_${key}`).innerHTML = totalPaginas > 1 ? `
    <button ${catalogoPagina[key] === 1 ? "disabled" : ""} onclick="mudarPaginaCatalogo('${key}', -1)">←</button>
    <span class="info-pagina">${catalogoPagina[key]} / ${totalPaginas}</span>
    <button ${catalogoPagina[key] === totalPaginas ? "disabled" : ""} onclick="mudarPaginaCatalogo('${key}', 1)">→</button>` : "";
}

function mudarPaginaCatalogo(key, delta) {
  catalogoPagina[key] = (catalogoPagina[key] || 1) + delta;
  renderizarCatalogo(key);
}

function editarCatalogo(key, id) {
  const c = CATALOGOS_CFG[key];
  window._editandoCatalogo = { key, id };
  const x = (catalogoCache[key] || []).find(y => String(y[c.idField]) === String(id));
  if (!x) return;
  c.campos.forEach(([fid]) => document.getElementById(`cat_${key}_${fid}`).value = x[fid] ?? "");
  if (c.pai) document.getElementById(`cat_${key}_${c.pai.campo}`).value = x[c.pai.campo] ?? "";
  document.getElementById(`cat_${key}_${c.campos[0][0]}`).scrollIntoView({ behavior: "smooth", block: "center" });
}

async function salvarCatalogo(key) {
  const c = CATALOGOS_CFG[key];
  const dados = {};
  c.campos.forEach(([fid]) => dados[fid] = document.getElementById(`cat_${key}_${fid}`).value.trim());
  if (c.campos.some(([fid]) => !dados[fid])) { mostrarToast("Preencha todos os campos.", "erro"); return; }
  if (c.pai) dados[c.pai.campo] = document.getElementById(`cat_${key}_${c.pai.campo}`).value || null;
  const editando = window._editandoCatalogo && window._editandoCatalogo.key === key ? window._editandoCatalogo.id : null;
  const body = editando ? { id: editando, ...dados } : dados;
  const res = await fetchProtegido(`${API_BASE}/catalogos/${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    window._editandoCatalogo = null;
    c.campos.forEach(([fid]) => document.getElementById(`cat_${key}_${fid}`).value = "");
    if (c.pai) document.getElementById(`cat_${key}_${c.pai.campo}`).value = "";
    carregarCatalogoLista(key);
  }
}

async function excluirCatalogo(key, id) {
  if (!(await confirmarAcao("Excluir este registro?", "Excluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/catalogos/${key}/${id}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  carregarCatalogoLista(key);
}

async function excluirDadosFicticios() {
  const categorias = Array.from(document.querySelectorAll(".dadoExclusaoChk:checked")).map(c => c.value);
  if (categorias.length === 0) { mostrarToast("Marque pelo menos uma categoria.", "erro"); return; }
  if (!(await confirmarAcao("Excluir os dados selecionados? Esta ação NÃO pode ser desfeita.", "Excluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/dados/excluir`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categorias }) });
  const data = await res.json();
  avisarResultado(data);
  document.getElementById("resultadoExclusaoDados").textContent = data.mensagem || "";
}

let sessaoFrequenciaAberta = null; // { sessaoId, descricao, prefixo } — pra atualizar a tela após encerrar/justificar

async function abrirReuniao() {
  const descricao = document.getElementById("descricaoReuniao").value;
  const senhaAcesso = document.getElementById("senhaNovaReuniao").value;
  if (!descricao || !senhaAcesso) return;

  const res = await fetchProtegido(`${API_BASE}/reunioes/abrir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgaoId: ORGAO_ID_MINISTERIO, descricao, senhaAcesso })
  });
  const data = await res.json();
  document.getElementById("resultadoSecretaria").textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("descricaoReuniao").value = "";
    document.getElementById("senhaNovaReuniao").value = "";
  }
  carregarReunioes();
}

// prefixo diferencia onde reaproveitar essa mesma engine de sessão/presença:
// "" = aba Reuniões (Ministério), "Assembleia" = aba Assembleia Geral.
async function encerrarReuniaoAcao(sessaoId, prefixo) {
  prefixo = prefixo || "";
  if (!(await confirmarAcao("Tem certeza que deseja encerrar esta reunião?", "Encerrar"))) return;

  const res = await fetchProtegido(`${API_BASE}/reunioes/${sessaoId}/encerrar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  if (prefixo === "Assembleia") carregarReunioesAssembleia(); else carregarReunioes();
  if (data.sucesso && sessaoFrequenciaAberta && String(sessaoFrequenciaAberta.sessaoId) === String(sessaoId)) {
    verFrequencia(sessaoId, sessaoFrequenciaAberta.descricao, sessaoFrequenciaAberta.prefixo);
  }
}

async function carregarReunioes() {
  const container = document.getElementById("resultadoListaReunioes");
  const res = await fetchProtegido(`${API_BASE}/reunioes?orgaoId=${ORGAO_ID_MINISTERIO}`);
  const reunioes = await res.json();

  if (reunioes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma reunião ainda.</p>";
    return;
  }

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Descrição</th><th>Data</th><th>Status</th><th>Presentes</th><th>Faltas</th><th>Justificadas</th><th></th>
  </tr></thead><tbody>`;

  reunioes.forEach(r => {
    const descricaoEscapada = r.descricao.replace(/'/g, "\\'");
    html += `<tr>
      <td>${r.descricao}</td>
      <td>${r.dataSessao}</td>
      <td>${r.status}</td>
      <td>${r.totalPresentes}</td>
      <td>${r.totalFaltas}</td>
      <td>${r.totalJustificadas}</td>
      <td>
        <button class="btn-link" onclick="verFrequencia(${r.sessaoId}, '${descricaoEscapada}')">Ver frequência</button>
        ${r.status === "ABERTA" ? `<button class="btn-link" onclick="encerrarReuniaoAcao(${r.sessaoId})">Encerrar</button>` : ""}
      </td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

// ---- ASSEMBLEIA GERAL: mesma engine de sessão/presença, órgão diferente ----
let ORGAO_ID_ASSEMBLEIA = null;
async function getOrgaoIdAssembleia() {
  if (ORGAO_ID_ASSEMBLEIA) return ORGAO_ID_ASSEMBLEIA;
  const res = await fetchProtegido(`${API_BASE}/orgaos`);
  const orgaos = await res.json();
  const orgao = orgaos.find(o => o.sigla === "ASSEMBLEIA_GERAL");
  ORGAO_ID_ASSEMBLEIA = orgao ? orgao.orgaoId : null;
  return ORGAO_ID_ASSEMBLEIA;
}

async function carregarAssembleia() {
  await carregarElegiveisAssembleia();
  await carregarReunioesAssembleia();
}

let elegiveisAssembleia = [];
let elegiveisFiltrados = [];
let paginaAtualElegiveis = 1;

async function carregarElegiveisAssembleia() {
  const res = await fetchProtegido(`${API_BASE}/assembleia/elegiveis`);
  elegiveisAssembleia = await res.json();
  aplicarFiltroElegiveis();
}

function aplicarFiltroElegiveis() {
  const busca = (document.getElementById("assembleiaBusca").value || "").toLowerCase();
  elegiveisFiltrados = elegiveisAssembleia.filter(m =>
    !busca || m.nome.toLowerCase().includes(busca) || String(m.membroId).includes(busca)
  );
  paginaAtualElegiveis = 1;
  renderizarElegiveis();
}

function renderizarElegiveis() {
  const container = document.getElementById("resultadoListaElegiveisAssembleia");
  const total = elegiveisFiltrados.length;
  const totalPaginas = Math.max(1, Math.ceil(total / TAM_PAGINA));
  if (paginaAtualElegiveis > totalPaginas) paginaAtualElegiveis = totalPaginas;
  const inicio = (paginaAtualElegiveis - 1) * TAM_PAGINA;
  const pagina = elegiveisFiltrados.slice(inicio, inicio + TAM_PAGINA);

  if (total === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum elegível encontrado.</p>";
    document.getElementById("assembleiaInfo").textContent = "0 elegíveis";
    document.getElementById("assembleiaPaginacao").innerHTML = "";
    return;
  }

  let html = `<table class="tabela-frequencia"><thead><tr><th>Matrícula</th><th>Nome</th><th>Congregação</th></tr></thead><tbody>`;
  pagina.forEach(m => {
    html += `<tr><td>${m.membroId}</td><td>${m.nome}</td><td>${m.congregacao || "-"}</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;

  document.getElementById("assembleiaInfo").textContent = `${total} elegível(is)`;
  document.getElementById("assembleiaPaginacao").innerHTML = `
    <button ${paginaAtualElegiveis === 1 ? "disabled" : ""} onclick="mudarPaginaElegiveis(-1)">← Anterior</button>
    <span class="info-pagina">Página ${paginaAtualElegiveis} de ${totalPaginas}</span>
    <button ${paginaAtualElegiveis === totalPaginas ? "disabled" : ""} onclick="mudarPaginaElegiveis(1)">Próxima →</button>`;
}

function mudarPaginaElegiveis(delta) {
  paginaAtualElegiveis += delta;
  renderizarElegiveis();
}

async function importarExcelAssembleiaGeral() {
  const input = document.getElementById("arquivoExcelAssembleia");
  const msg = document.getElementById("resultadoImportacaoAssembleia");
  const arquivo = input.files[0];
  if (!arquivo) {
    msg.textContent = "Selecione um arquivo .xlsx antes de importar.";
    return;
  }

  const buffer = await arquivo.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const primeiraAba = workbook.SheetNames[0];
  const linhasBrutas = XLSX.utils.sheet_to_json(workbook.Sheets[primeiraAba], { defval: "" });

  const linhas = linhasBrutas
    .map(linha => {
      const chaves = Object.keys(linha);
      const chaveMatricula = chaves.find(k => /matr[ií]cula/i.test(k));
      const chaveNome = chaves.find(k => /nome/i.test(k));
      return {
        matricula: chaveMatricula ? linha[chaveMatricula] : null,
        nome: chaveNome ? String(linha[chaveNome]).trim() : ""
      };
    })
    .filter(l => l.matricula && l.nome);

  if (linhas.length === 0) {
    msg.textContent = "Não encontrei colunas de Matrícula e Nome na planilha.";
    return;
  }

  const res = await fetchProtegido(`${API_BASE}/assembleia/elegiveis/importar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ linhas })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.sucesso
    ? `Incluídos: ${data.resumo.incluidos} · Atualizados: ${data.resumo.atualizados}`
    : "";
  input.value = "";
  if (data.sucesso) carregarElegiveisAssembleia();
}

async function abrirReuniaoAssembleia() {
  const descricao = document.getElementById("descricaoAssembleia").value;
  const senhaAcesso = document.getElementById("senhaNovaAssembleia").value;
  if (!descricao || !senhaAcesso) return;

  const orgaoId = await getOrgaoIdAssembleia();
  const res = await fetchProtegido(`${API_BASE}/reunioes/abrir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgaoId, descricao, senhaAcesso })
  });
  const data = await res.json();
  document.getElementById("resultadoAssembleiaReuniao").textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("descricaoAssembleia").value = "";
    document.getElementById("senhaNovaAssembleia").value = "";
  }
  carregarReunioesAssembleia();
}

async function carregarReunioesAssembleia() {
  const container = document.getElementById("resultadoListaReunioesAssembleia");
  const orgaoId = await getOrgaoIdAssembleia();
  const res = await fetchProtegido(`${API_BASE}/reunioes?orgaoId=${orgaoId}`);
  const reunioes = await res.json();

  if (reunioes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma convocação ainda.</p>";
    return;
  }

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Descrição</th><th>Data</th><th>Status</th><th>Presentes</th><th>Faltas</th><th>Justificadas</th><th></th>
  </tr></thead><tbody>`;

  reunioes.forEach(r => {
    const descricaoEscapada = r.descricao.replace(/'/g, "\\'");
    html += `<tr>
      <td>${r.descricao}</td>
      <td>${r.dataSessao}</td>
      <td>${r.status}</td>
      <td>${r.totalPresentes}</td>
      <td>${r.totalFaltas}</td>
      <td>${r.totalJustificadas}</td>
      <td>
        <button class="btn-link" onclick="verFrequencia(${r.sessaoId}, '${descricaoEscapada}', 'Assembleia')">Ver presença</button>
        ${r.status === "ABERTA" ? `<button class="btn-link" onclick="encerrarReuniaoAcao(${r.sessaoId}, 'Assembleia')">Encerrar</button>` : ""}
      </td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

// prefixo: "" (Reuniões) ou "Assembleia" — decide em qual bloco da tela desenhar.
async function verFrequencia(sessaoId, descricao, prefixo) {
  prefixo = prefixo || "";
  sessaoFrequenciaAberta = { sessaoId, descricao, prefixo };
  document.getElementById("blocoFrequencia" + prefixo).style.display = "block";
  document.getElementById("tituloFrequencia" + prefixo).textContent = descricao;

  const res = await fetchProtegido(`${API_BASE}/reunioes/${sessaoId}/frequencia`);
  const data = await res.json();
  const container = document.getElementById("resultadoFrequencia" + prefixo);
  const resumo = document.getElementById("resumoQuorum" + prefixo);
  if (!data.sucesso) {
    container.textContent = data.mensagem;
    resumo.textContent = "";
    return;
  }

  if (data.quorum) {
    const q = data.quorum;
    const situacao = q.quorumAtingido === null ? "" : (q.quorumAtingido ? " — QUÓRUM ATINGIDO ✅" : " — quórum não atingido");
    resumo.textContent = `${q.totalPresentes} de ${q.totalAtivos} esperados presentes (${q.percentualPresenca}%)` +
      (q.quorumMinimoPct != null ? `, mínimo exigido ${q.quorumMinimoPct}%${situacao}` : "");
  }

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Nome</th><th>Função</th><th>Status</th><th></th>
  </tr></thead><tbody>`;

  data.frequencia.forEach(item => {
    const podeJustificar = !item.presente && !item.faltaJustificada;
    const botaoCorrigir = item.presente
      ? `<button class="btn-link" onclick="marcarPresencaManual(${sessaoId}, ${item.membroId}, false)">Marcar falta</button>`
      : `<button class="btn-link" onclick="marcarPresencaManual(${sessaoId}, ${item.membroId}, true)">Marcar presente</button>`;
    const pendenteHtml = item.justificativaPendente
      ? `<div class="tag-pendente">Pedido: "${item.justificativaPendente}"</div>
         <button class="btn-link btn-link-sucesso" onclick="aprovarJustificativaPendente(${sessaoId}, ${item.membroId}, '${item.justificativaPendente.replace(/'/g, "\\'")}')">Aprovar</button>
         <button class="btn-link btn-link-perigo" onclick="rejeitarJustificativaAcao(${sessaoId}, ${item.membroId})">Rejeitar</button>`
      : "";
    html += `<tr>
      <td>${item.membroId}</td>
      <td>${item.nome}</td>
      <td>${item.funcao || "-"}</td>
      <td>${statusFrequencia(item)}</td>
      <td>${podeJustificar ? `<button class="btn-link" onclick="justificarFalta(${sessaoId}, ${item.membroId})">Justificar</button>` : ""} ${botaoCorrigir}${pendenteHtml}</td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

async function justificarFalta(sessaoId, membroId) {
  const motivo = await pedirTexto("Motivo da justificativa", "Ex: estava viajando a trabalho");
  if (motivo === null) return;

  const res = await fetchProtegido(`${API_BASE}/reunioes/${sessaoId}/justificar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) verFrequencia(sessaoId, sessaoFrequenciaAberta.descricao, sessaoFrequenciaAberta.prefixo);
}

// Aprova um pedido que o próprio obreiro enviou pelo painel pessoal — reaproveita
// o mesmo endpoint de justificar, só pré-preenchendo com o motivo que ele mandou.
async function aprovarJustificativaPendente(sessaoId, membroId, motivoSugerido) {
  const motivo = await pedirTexto("Aprovar justificativa", "Motivo", motivoSugerido);
  if (motivo === null) return;

  const res = await fetchProtegido(`${API_BASE}/reunioes/${sessaoId}/justificar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) verFrequencia(sessaoId, sessaoFrequenciaAberta.descricao, sessaoFrequenciaAberta.prefixo);
}

async function rejeitarJustificativaAcao(sessaoId, membroId) {
  if (!(await confirmarAcao("Confirma rejeitar este pedido de justificativa? A falta continua sem justificar.", "Rejeitar"))) return;

  const res = await fetchProtegido(`${API_BASE}/reunioes/${sessaoId}/rejeitar-justificativa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) verFrequencia(sessaoId, sessaoFrequenciaAberta.descricao, sessaoFrequenciaAberta.prefixo);
}

async function marcarPresencaManual(sessaoId, membroId, presente) {
  const acao = presente ? "marcar como PRESENTE" : "marcar como FALTA";
  if (!(await confirmarAcao(`Confirma ${acao} este obreiro nesta reunião?`))) return;

  const res = await fetchProtegido(`${API_BASE}/reunioes/${sessaoId}/presenca-manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, presente })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) verFrequencia(sessaoId, sessaoFrequenciaAberta.descricao, sessaoFrequenciaAberta.prefixo);
}

// ---- SECRETARIA / ABA PESSOAS ----
async function carregarOpcoesFormPessoa() {
  const [resCong, resFunc, resDepto, resCargo, resExt] = await Promise.all([
    fetchProtegido(`${API_BASE}/congregacoes`),
    fetchProtegido(`${API_BASE}/funcoes`),
    fetch(`${API_BASE}/catalogos/departamentos`),
    fetch(`${API_BASE}/catalogos/cargosMinisteriais`),
    fetch(`${API_BASE}/catalogos/extensoes`)
  ]);
  const congregacoes = await resCong.json();
  const funcoes = await resFunc.json();
  const departamentos = await resDepto.json();
  const cargos = await resCargo.json();
  const extensoes = await resExt.json();

  const selectCong = document.getElementById("pessoaCongregacao");
  selectCong.innerHTML = congregacoes.filter(c => c.ativa).map(c => `<option value="${c.congregacaoId}">${c.nome}</option>`).join("");

  const selectExt = document.getElementById("pessoaExtensao");
  const nomeCongPorId = Object.fromEntries(congregacoes.map(c => [String(c.congregacaoId), c.nome]));
  selectExt.innerHTML = `<option value="">Não se aplica (fica só na Congregação)</option>` +
    extensoes.filter(e => e.ativa).map(e => `<option value="${e.extensaoId}">${e.nome} (${nomeCongPorId[String(e.congregacaoMaeId)] || "?"})</option>`).join("");

  const selectFunc = document.getElementById("pessoaFuncao");
  selectFunc.innerHTML = funcoes.filter(f => f.ativa).map(f => `<option value="${f.nome}">${f.nome}</option>`).join("");

  const selectDepto = document.getElementById("pessoaDepartamento");
  selectDepto.innerHTML = `<option value="">Não informado</option>` +
    departamentos.filter(d => d.ativo).map(d => `<option value="${d.departamentoId}">${d.nome}</option>`).join("");

  const selectCargo = document.getElementById("pessoaCargoMinisterial");
  selectCargo.innerHTML = `<option value="">Não informado</option>` +
    cargos.filter(c => c.ativo).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map(c => `<option value="${c.sigla}">${c.nome}</option>`).join("");
}

async function salvarPessoa() {
  const membroId = document.getElementById("pessoaMatricula").value;
  const nome = document.getElementById("pessoaNome").value;
  const funcao = document.getElementById("pessoaFuncao").value;
  const congregacaoId = document.getElementById("pessoaCongregacao").value;
  const status = document.getElementById("pessoaStatus").value;
  const dataNascimento = document.getElementById("pessoaDataNascimento").value || null;
  const dataAdmissao = document.getElementById("pessoaDataAdmissao").value || null;
  const situacaoMembro = document.getElementById("pessoaSituacao").value;
  const dizimistaSelect = document.getElementById("pessoaDizimista").value;
  const dizimistaFiel = dizimistaSelect === "" ? null : dizimistaSelect === "true";
  const departamentoId = document.getElementById("pessoaDepartamento").value || null;
  const cargoMinisterial = document.getElementById("pessoaCargoMinisterial").value || null;
  const telefone = document.getElementById("pessoaTelefone").value.trim() || null;
  const email = document.getElementById("pessoaEmail").value.trim() || null;
  const endereco = document.getElementById("pessoaEndereco").value.trim() || null;
  const extensaoId = document.getElementById("pessoaExtensao").value || null;
  const msg = document.getElementById("resultadoPessoa");

  if (!membroId || !nome) {
    msg.textContent = "Informe matrícula e nome.";
    return;
  }

  const res = await fetchProtegido(`${API_BASE}/pessoas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      membroId, nome, funcao, congregacaoId, status, dataNascimento, dataAdmissao, situacaoMembro, dizimistaFiel,
      departamentoId, cargoMinisterial, telefone, email, endereco, extensaoId
    })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("pessoaMatricula").value = "";
    document.getElementById("pessoaNome").value = "";
    document.getElementById("pessoaTelefone").value = "";
    document.getElementById("pessoaEmail").value = "";
    document.getElementById("pessoaEndereco").value = "";
    carregarPessoas();
  }
}

const TAM_PAGINA = 20;
let paginaAtualPessoas = 1;
let pessoasFiltradas = [];

async function carregarPessoas() {
  const res = await fetchProtegido(`${API_BASE}/pessoas`);
  window._pessoasCache = await res.json();
  aplicarFiltroPessoas();
}

function aplicarFiltroPessoas() {
  const busca = (document.getElementById("pessoasBusca").value || "").toLowerCase();
  const catFiltro = document.getElementById("pessoasFiltroCategoria").value;
  const todas = window._pessoasCache || [];
  pessoasFiltradas = todas.filter(p => {
    const nomeOk = !busca || p.nome.toLowerCase().includes(busca) || String(p.membroId).includes(busca);
    const catOk = !catFiltro || (p.capacidade && p.capacidade.categoria === catFiltro);
    return nomeOk && catOk;
  });
  paginaAtualPessoas = 1;
  renderizarPessoas();
}

function renderizarPessoas() {
  const container = document.getElementById("resultadoListaPessoas");
  const total = pessoasFiltradas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / TAM_PAGINA));
  if (paginaAtualPessoas > totalPaginas) paginaAtualPessoas = totalPaginas;
  const inicio = (paginaAtualPessoas - 1) * TAM_PAGINA;
  const pagina = pessoasFiltradas.slice(inicio, inicio + TAM_PAGINA);

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Nome</th><th>Idade</th><th>Categoria</th><th>Função</th><th>Cargo Ministerial</th><th>Congregação</th><th>Status</th><th class="acoes-inline"></th>
  </tr></thead><tbody>`;

  pagina.forEach(p => {
    html += `<tr>
      <td>${p.membroId}</td>
      <td>${p.nome}</td>
      <td>${idadeDe(p.dataNascimento) ?? "-"}</td>
      <td>${badgeCategoria(p.capacidade)}</td>
      <td>${p.funcao || "-"}</td>
      <td>${p.cargoMinisterial || "-"}</td>
      <td>${p.congregacao || "-"}</td>
      <td>${badgeStatusPessoa(p.status)}</td>
      <td class="acoes-inline">
        <button class="btn-link" onclick="editarPessoa(${p.membroId})">Editar</button>
        ${p.status !== "DESLIGADO" ? `<button class="btn-link btn-link-perigo" onclick="desligarPessoa(${p.membroId})">Desligar</button>` : ""}
      </td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;

  document.getElementById("pessoasInfo").textContent = `${total} pessoa(s)`;
  document.getElementById("pessoasPaginacao").innerHTML = `
    <button ${paginaAtualPessoas === 1 ? "disabled" : ""} onclick="mudarPaginaPessoas(-1)">← Anterior</button>
    <span class="info-pagina">Página ${paginaAtualPessoas} de ${totalPaginas}</span>
    <button ${paginaAtualPessoas === totalPaginas ? "disabled" : ""} onclick="mudarPaginaPessoas(1)">Próxima →</button>`;
}

function mudarPaginaPessoas(delta) {
  paginaAtualPessoas += delta;
  renderizarPessoas();
}

function editarPessoa(membroId) {
  const pessoa = (window._pessoasCache || []).find(p => p.membroId === membroId);
  if (!pessoa) return;
  document.getElementById("pessoaMatricula").value = pessoa.membroId;
  document.getElementById("pessoaNome").value = pessoa.nome;
  document.getElementById("pessoaStatus").value = pessoa.status;
  document.getElementById("pessoaFuncao").value = pessoa.funcao || "";
  document.getElementById("pessoaCongregacao").value = pessoa.congregacaoId != null ? String(pessoa.congregacaoId) : "";
  document.getElementById("pessoaDataNascimento").value = pessoa.dataNascimento || "";
  document.getElementById("pessoaDataAdmissao").value = pessoa.dataAdmissao || "";
  document.getElementById("pessoaSituacao").value = pessoa.situacaoMembro || "EM_COMUNHAO";
  document.getElementById("pessoaDizimista").value = pessoa.dizimistaFiel == null ? "" : String(pessoa.dizimistaFiel);
  document.getElementById("pessoaDepartamento").value = pessoa.departamentoId != null ? String(pessoa.departamentoId) : "";
  document.getElementById("pessoaCargoMinisterial").value = pessoa.cargoMinisterial || "";
  document.getElementById("pessoaTelefone").value = pessoa.telefone || "";
  document.getElementById("pessoaEmail").value = pessoa.email || "";
  document.getElementById("pessoaEndereco").value = pessoa.endereco || "";
  document.getElementById("pessoaExtensao").value = pessoa.extensaoId != null ? String(pessoa.extensaoId) : "";
  document.getElementById("pessoaMatricula").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function desligarPessoa(membroId) {
  if (!(await confirmarAcao("Confirma desligar esta pessoa? Ela deixa de ser ATIVA, mas o histórico continua.", "Desligar"))) return;

  const res = await fetchProtegido(`${API_BASE}/pessoas/${membroId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarPessoas();
}

// ---- SECRETARIA / ABA CONGREGAÇÕES ----
let congregacaoEditandoId = null;

async function carregarCongregacoes() {
  const container = document.getElementById("resultadoListaCongregacoes");
  const res = await fetchProtegido(`${API_BASE}/congregacoes`);
  const congregacoes = await res.json();
  window._congregacoesCache = congregacoes;

  let html = `<table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Status</th><th></th></tr></thead><tbody>`;
  congregacoes.forEach(c => {
    html += `<tr>
      <td>${c.nome}</td>
      <td>${c.ativa ? "Ativa" : "Inativa"}</td>
      <td>
        <button class="btn-link" onclick="editarCongregacao(${c.congregacaoId})">Renomear</button>
        ${c.ativa
          ? `<button class="btn-link" onclick="desativarCongregacaoAcao(${c.congregacaoId})">Desativar</button>`
          : `<button class="btn-link" onclick="reativarCongregacaoAcao(${c.congregacaoId})">Reativar</button>`}
        <button class="btn-link btn-link-perigo" onclick="excluirCongregacaoAcao(${c.congregacaoId})">Excluir</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

function editarCongregacao(id) {
  const c = (window._congregacoesCache || []).find(x => x.congregacaoId === id);
  if (!c) return;
  congregacaoEditandoId = id;
  document.getElementById("congregacaoNome").value = c.nome;
}

async function salvarCongregacao() {
  const nome = document.getElementById("congregacaoNome").value;
  const msg = document.getElementById("resultadoCongregacao");
  if (!nome) return;

  const res = await fetchProtegido(`${API_BASE}/congregacoes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ congregacaoId: congregacaoEditandoId || undefined, nome })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("congregacaoNome").value = "";
    congregacaoEditandoId = null;
    carregarCongregacoes();
  }
}

async function desativarCongregacaoAcao(id) {
  if (!(await confirmarAcao("Confirma desativar esta congregação? Ela some das listas de cadastro, mas o histórico continua.", "Desativar"))) return;
  const res = await fetchProtegido(`${API_BASE}/congregacoes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ativa: false })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarCongregacoes();
}

async function reativarCongregacaoAcao(id) {
  const res = await fetchProtegido(`${API_BASE}/congregacoes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ativa: true })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarCongregacoes();
}

async function excluirCongregacaoAcao(id) {
  if (!(await confirmarAcao("Confirma EXCLUIR esta congregação? Isso não pode ser desfeito. Só funciona se nenhuma pessoa estiver cadastrada nela.", "Excluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/congregacoes/${id}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarCongregacoes();
}

// ---- SECRETARIA / ABA FUNÇÕES ----
let funcaoEditandoId = null;

async function carregarFuncoes() {
  const container = document.getElementById("resultadoListaFuncoes");
  const res = await fetchProtegido(`${API_BASE}/funcoes`);
  const funcoes = await res.json();
  window._funcoesCache = funcoes;

  let html = `<table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Status</th><th></th></tr></thead><tbody>`;
  funcoes.forEach(f => {
    html += `<tr>
      <td>${f.nome}</td>
      <td>${f.ativa ? "Ativa" : "Inativa"}</td>
      <td>
        <button class="btn-link" onclick="editarFuncao(${f.funcaoId})">Renomear</button>
        ${f.ativa
          ? `<button class="btn-link" onclick="desativarFuncaoAcao(${f.funcaoId})">Desativar</button>`
          : `<button class="btn-link" onclick="reativarFuncaoAcao(${f.funcaoId})">Reativar</button>`}
        <button class="btn-link btn-link-perigo" onclick="excluirFuncaoAcao(${f.funcaoId})">Excluir</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

function editarFuncao(id) {
  const f = (window._funcoesCache || []).find(x => x.funcaoId === id);
  if (!f) return;
  funcaoEditandoId = id;
  document.getElementById("funcaoNome").value = f.nome;
}

async function salvarFuncao() {
  const nome = document.getElementById("funcaoNome").value;
  const msg = document.getElementById("resultadoFuncao");
  if (!nome) return;

  const res = await fetchProtegido(`${API_BASE}/funcoes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ funcaoId: funcaoEditandoId || undefined, nome })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("funcaoNome").value = "";
    funcaoEditandoId = null;
    carregarFuncoes();
  }
}

async function desativarFuncaoAcao(id) {
  if (!(await confirmarAcao("Confirma desativar esta função? Ela some das listas de cadastro, mas o histórico continua.", "Desativar"))) return;
  const res = await fetchProtegido(`${API_BASE}/funcoes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ativa: false })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarFuncoes();
}

async function reativarFuncaoAcao(id) {
  const res = await fetchProtegido(`${API_BASE}/funcoes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ativa: true })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarFuncoes();
}

async function excluirFuncaoAcao(id) {
  if (!(await confirmarAcao("Confirma EXCLUIR esta função? Isso não pode ser desfeito. Só funciona se nenhuma pessoa estiver cadastrada com ela.", "Excluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/funcoes/${id}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarFuncoes();
}

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
  funcionalidadesCache = await fres.json();
  const papeis = await pres.json();

  document.getElementById("permissaoPapel").innerHTML = papeis.map(p => `<option value="${p.papelId}">${p.nome}</option>`).join("");

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
  DISTRITO: { origem: "distritos", idField: "distritoId" }
};

function montarCheckboxesPapeis() {
  document.getElementById("papelPermissoesCheckboxes").innerHTML = funcionalidadesCache.map(f =>
    `<label class="opcao-checkbox"><input type="checkbox" class="papelPermissaoChk" value="${f.chave}" /> ${f.nome}</label>`
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
  const res = await fetch(`${API_BASE}/catalogos/${nivel.origem}`);
  const itens = (await res.json()).filter(x => x.ativa !== false && x.ativo !== false);
  select.innerHTML = itens.map(x => `<option value="${x[nivel.idField]}">${x.nome}</option>`).join("");
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
  const res = await fetch(`${API_BASE}/catalogos/papeis`);
  const papeis = await res.json();
  let html = `<table class="tabela-frequencia"><thead><tr><th>Papel</th><th>Nível</th><th>Permissões</th><th></th></tr></thead><tbody>`;
  papeis.forEach(p => {
    html += `<tr>
      <td>${p.nome}</td>
      <td>${p.nivel}</td>
      <td>${(p.permissoes || []).join(", ") || "-"}</td>
      <td class="acoes-inline">
        <button class="btn-link" onclick="editarPapel(${p.papelId})">Editar</button>
        <button class="btn-link btn-link-perigo" onclick="excluirCatalogo('papeis', '${p.papelId}')">Excluir</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

function editarPapel(papelId) {
  fetch(`${API_BASE}/catalogos/papeis`).then(r => r.json()).then(papeis => {
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
  const msg = document.getElementById("resultadoPermissao");
  if (!membroId || !papelId) { msg.textContent = "Informe matrícula e papel."; return; }
  const res = await fetchProtegido(`${API_BASE}/lideranca`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, papelId, escopoTipo, escopoId, senha: senha || undefined })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("permissaoMatricula").value = "";
    document.getElementById("permissaoSenha").value = "";
    carregarPermissoes();
  }
}

async function carregarPermissoes() {
  const container = document.getElementById("resultadoListaPermissoes");
  const res = await fetchProtegido(`${API_BASE}/lideranca`);
  const liderancas = await res.json();
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Nome</th><th>Papel</th><th>Nível</th><th>Permissões</th><th></th>
  </tr></thead><tbody>`;
  liderancas.forEach(l => {
    html += `<tr>
      <td>${l.membroId}</td>
      <td>${l.nome}</td>
      <td>${l.papel}</td>
      <td>${l.nivel}</td>
      <td>${(l.permissoes || []).join(", ") || "-"}</td>
      <td class="acoes-inline">
        <button class="btn-link" onclick="editarPermissao(${l.membroId})">Editar</button>
        <button class="btn-link btn-link-perigo" onclick="removerPermissao(${l.membroId})">Remover</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

// Pré-preenche o formulário de cima com uma liderança já existente — permite
// trocar papel/escopo, ou resetar a senha (deixando em branco mantém a atual).
async function editarPermissao(membroId) {
  const res = await fetchProtegido(`${API_BASE}/lideranca`);
  const liderancas = await res.json();
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

async function removerPermissao(membroId) {
  if (!(await confirmarAcao("Confirma remover o acesso à Secretaria desta pessoa?", "Remover"))) return;
  const res = await fetchProtegido(`${API_BASE}/lideranca/${membroId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarPermissoes();
}

// ---- SECRETARIA / ABA CONSAGRAÇÕES ----
// Os tipos de proposta ("Assunto") são um catálogo configurável (Catálogos ->
// Tipos de Proposta), não mais uma lista fixa no HTML — dá pra adicionar/
// renomear/excluir tipo sem mexer em código.
async function carregarTiposConsagracao() {
  const select = document.getElementById("consagracaoAssunto");
  const res = await fetch(`${API_BASE}/catalogos/tiposConsagracao`);
  const tipos = await res.json();
  select.innerHTML = tipos.filter(t => t.ativo !== false).map(t => `<option value="${t.nome}">${t.nome}</option>`).join("")
    + `<option value="__outro">Outro (digitar)</option>`;
  document.getElementById("consagracaoAssuntoOutro").style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("consagracaoAssunto");
  if (select) select.addEventListener("change", () => {
    document.getElementById("consagracaoAssuntoOutro").style.display = select.value === "__outro" ? "block" : "none";
  });
});

const ROTULO_STATUS_CONSAGRACAO = {
  PROTOCOLADO: "Protocolado",
  EM_ANALISE_CONSELHO: "Em análise no Conselho",
  AGUARDANDO_PLENARIO: "Aguardando Plenário",
  CONCLUIDO: "Concluído",
  REPROVADO: "Reprovado"
};

async function salvarConsagracao() {
  const membroId = document.getElementById("consagracaoMatricula").value;
  const selectAssunto = document.getElementById("consagracaoAssunto").value;
  const assunto = selectAssunto === "__outro" ? document.getElementById("consagracaoAssuntoOutro").value : selectAssunto;
  const proponenteMembroId = document.getElementById("consagracaoProponente").value;
  const msg = document.getElementById("resultadoConsagracao");

  if (!membroId || !assunto || !proponenteMembroId) {
    msg.textContent = "Informe matrícula, assunto e proponente.";
    return;
  }

  const res = await fetchProtegido(`${API_BASE}/consagracoes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, assunto, proponenteMembroId })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("consagracaoMatricula").value = "";
    document.getElementById("consagracaoProponente").value = "";
    carregarConsagracoes();
  }
}

async function carregarConsagracoes() {
  const container = document.getElementById("resultadoListaConsagracoes");
  const res = await fetchProtegido(`${API_BASE}/consagracoes`);
  const consagracoes = await res.json();

  if (consagracoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum processo em andamento.</p>";
    return;
  }

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Assunto</th><th>Proponente</th><th>Status</th><th>Protocolo</th><th></th>
  </tr></thead><tbody>`;

  consagracoes.forEach(c => {
    html += `<tr>
      <td>${c.nome}</td>
      <td>${c.assunto}</td>
      <td>${c.proponente || "-"}</td>
      <td>${ROTULO_STATUS_CONSAGRACAO[c.status] || c.status}</td>
      <td>${c.dataProtocolo}</td>
      <td>
        <button class="btn-link" onclick="avancarConsagracaoAcao('${c.consagracaoId}')">Avançar</button>
        <button class="btn-link btn-link-perigo" onclick="reprovarConsagracaoAcao('${c.consagracaoId}')">Reprovar</button>
      </td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

async function avancarConsagracaoAcao(id) {
  if (!(await confirmarAcao("Confirma avançar este processo para a próxima etapa?", "Avançar"))) return;
  const res = await fetchProtegido(`${API_BASE}/consagracoes/${id}/evoluir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao: "AVANCAR" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarConsagracoes();
}

async function reprovarConsagracaoAcao(id) {
  if (!(await confirmarAcao("Confirma reprovar e arquivar este processo? Isso não pode ser desfeito.", "Reprovar"))) return;
  const res = await fetchProtegido(`${API_BASE}/consagracoes/${id}/evoluir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao: "REPROVAR" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarConsagracoes();
}

// ---- ABA MEU PAINEL: minha frequência (mesma consulta pública de sempre, só por matrícula) ----
async function carregarPainelPessoal(matricula) {
  matricula = matricula || authMatricula;
  const container = document.getElementById("resultadoPainelPessoal");
  const cartao = document.getElementById("cartaoPerfilPessoal");
  const stats = document.getElementById("resumoStatsPessoal");
  if (!matricula) return;

  const res = await fetch(`${API_BASE}/membros/${matricula}/frequencia`);
  const data = await res.json();
  if (!data.sucesso) {
    cartao.innerHTML = "";
    stats.innerHTML = "";
    container.textContent = data.mensagem;
    return;
  }

  cartao.innerHTML = `
    <div class="cartao-perfil">
      <p class="nome-perfil">${data.membro.nome}</p>
      <p class="linha-perfil">Matrícula ${data.membro.membroId} · ${data.membro.funcao || "sem função cadastrada"}</p>
      <p class="linha-perfil">${data.membro.congregacao || "sem congregação cadastrada"} · ${badgeStatusPessoa(data.membro.status)}</p>
    </div>`;

  const r = data.resumo;
  stats.innerHTML = `
    <div class="resumo-stats">
      <div class="stat-tile"><div class="stat-valor">${r.totalReunioes}</div><div class="stat-rotulo">Reuniões</div></div>
      <div class="stat-tile"><div class="stat-valor">${r.totalPresencas}</div><div class="stat-rotulo">Presenças</div></div>
      <div class="stat-tile"><div class="stat-valor">${r.totalFaltas}</div><div class="stat-rotulo">Faltas</div></div>
      <div class="stat-tile"><div class="stat-valor">${r.totalJustificadas}</div><div class="stat-rotulo">Justificadas</div></div>
      <div class="stat-tile"><div class="stat-valor">${r.percentualPresenca != null ? r.percentualPresenca + "%" : "-"}</div><div class="stat-rotulo">Presença</div></div>
    </div>`;

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Data</th><th>Reunião</th><th>Status</th><th>Ação</th>
  </tr></thead><tbody>`;

  data.historico.forEach(item => {
    let acaoHtml = "";
    if (!item.presente && !item.faltaJustificada) {
      acaoHtml = item.justificativaPendente
        ? `<span class="tag-pendente">Aguardando aprovação</span>`
        : `<button class="btn-justificar" onclick="solicitarJustificativaAcao(${matricula}, ${item.sessaoId})">✍️ Justificar falta</button>`;
    }
    html += `<tr>
      <td>${item.dataSessao || "-"}</td>
      <td>${item.descricao || "-"}</td>
      <td>${statusFrequencia(item)}</td>
      <td>${acaoHtml}</td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

async function solicitarJustificativaAcao(matricula, sessaoId) {
  const motivo = await pedirTexto("Justificar falta", "Explique por que você não pôde comparecer");
  if (motivo === null) return;

  const res = await fetch(`${API_BASE}/membros/${matricula}/reunioes/${sessaoId}/solicitar-justificativa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarPainelPessoal();
}
