const API_BASE = "/api";

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
let authNivel = sessionStorage.getItem("authNivel") || null;

function salvarSessao(token, nome, permissoes, matricula, nivel) {
  authToken = token;
  authNome = nome;
  authPermissoes = permissoes || [];
  authMatricula = matricula != null ? String(matricula) : authMatricula;
  authNivel = nivel || null;
  sessionStorage.setItem("authToken", token);
  sessionStorage.setItem("authNome", nome || "");
  sessionStorage.setItem("authPermissoes", JSON.stringify(authPermissoes));
  if (authMatricula != null) sessionStorage.setItem("authMatricula", authMatricula);
  if (authNivel) sessionStorage.setItem("authNivel", authNivel);
}
function limparSessao() {
  authToken = null;
  authNome = null;
  authPermissoes = [];
  authMatricula = null;
  authNivel = null;
  sessionStorage.removeItem("authToken");
  sessionStorage.removeItem("authNome");
  sessionStorage.removeItem("authPermissoes");
  sessionStorage.removeItem("authMatricula");
  sessionStorage.removeItem("authNivel");
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
    salvarSessao(data.token, data.nome, data.permissoes, matricula, data.nivel);
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
const NOMES_ABAS = ["meupainel", "reunioes", "pessoas", "cartas", "orgaos", "estrutura", "catalogos", "permissoes", "consagracoes", "disciplina", "abandono", "auditoria", "protecaodedados", "documentos"];

// Quais chaves de permissão liberam cada aba (qualquer uma delas basta). Abas fora
// deste mapa usam a própria chave — ex: "disciplina" exige só "disciplina". Espelha
// exatamente o que cada Function já checa no backend (ex: AbrirReuniao aceita
// reunioes/assembleia/cli — a aba única de Reuniões reflete isso).
const ABA_PERMISSOES_ALT = {
  reunioes: ["reunioes", "assembleia", "cli"],
  congregacoes: ["pessoas"], orgaos: ["pessoas"], estrutura: ["pessoas"], catalogos: ["pessoas"], cartas: ["pessoas"],
  abandono: ["disciplina"]
};
function permissoesDaAba(nome) {
  return ABA_PERMISSOES_ALT[nome] || [nome];
}

function aplicarPermissoesNoMenu() {
  NOMES_ABAS.forEach(nome => {
    if (nome === "meupainel" || nome === "documentos") return;
    const btn = document.getElementById(`btnAba${capitalize(nome)}`);
    const pode = permissoesDaAba(nome).some(chave => authPermissoes.includes(chave));
    btn.style.display = pode ? "inline-block" : "none";
  });
  mostrarAbaSecretaria("meupainel");
}

// Sub-abas de "Meu Painel" (v1.9) — evita empilhar tudo (perfil, LGPD, cartas) numa
// página só, cada vez mais comprida conforme o autoatendimento ganha mais funções.
const SUB_ABAS_MEUPAINEL = ["perfil", "lgpd", "cartas"];
const TITULOS_SUB_MEUPAINEL = { perfil: "Meu Perfil", lgpd: "Meus Dados (LGPD)", cartas: "Cartas de Trânsito" };
let subAbaMeupainelAtual = "perfil";

function mostrarSubAbaMeupainel(sub) {
  subAbaMeupainelAtual = sub;
  SUB_ABAS_MEUPAINEL.forEach(nome => {
    document.getElementById(`subMeupainel${capitalize(nome)}`).style.display = nome === sub ? "block" : "none";
    document.getElementById(`btnSubMeupainel${capitalize(nome)}`).classList.toggle("ativo", nome === sub);
  });
  document.getElementById("tituloModulo").textContent = `Meu Painel — ${TITULOS_SUB_MEUPAINEL[sub]}`;
  if (sub === "cartas") carregarMinhasCartas();
  if (sub === "lgpd") { carregarConsentimentoLGPD(); carregarMinhasSolicitacoesLGPD(); carregarMinhaFoto(); }
  if (sub === "perfil") {
    carregarMeusDadosForm();
    carregarOpcoesMeuVinculoTipo();
    carregarMeusVinculos();
    carregarMinhasSolicitacoesEdicao();
  }
}

// ---- MINHA FOTO (v1.10 — autoatendimento, dentro de Meus Dados (LGPD)) ----
async function carregarMinhaFoto() {
  const preview = document.getElementById("minhaFotoPreview");
  if (!authMatricula || !preview) return;
  const res = await fetch(`${API_BASE}/minha-foto/${authMatricula}`);
  const data = await res.json();
  if (!data.sucesso) { preview.innerHTML = ""; return; }
  preview.innerHTML = data.fotoUrl
    ? `<img src="${data.fotoUrl}" alt="Minha foto" style="max-width:160px;border-radius:8px;" />`
    : "<span class='subtitle'>Você ainda não tem foto cadastrada.</span>";
}

async function enviarMinhaFotoAcao() {
  const input = document.getElementById("minhaFotoArquivo");
  const msg = document.getElementById("resultadoMinhaFoto");
  if (!authMatricula || !input.files[0]) {
    msg.textContent = "Escolha um arquivo de imagem.";
    return;
  }
  const recorte = await abrirRecorteFoto(input.files[0]);
  if (!recorte) return;
  const res = await fetch(`${API_BASE}/minha-foto/${authMatricula}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fotoBase64: recorte.base64, mimeType: recorte.mimeType })
  });
  const data = await res.json();
  avisarResultado(data); // toast — falha (ex: sem consentimento) não pode passar batido só num texto discreto
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    input.value = "";
    carregarMinhaFoto();
  }
}

// ---- ATUALIZAR MEUS DADOS (v1.11 — campos editáveis direto, sem aprovação) ----
const ROTULO_ESTADO_CIVIL_MEUPAINEL = { SOLTEIRO: "Solteiro(a)", CASADO: "Casado(a)", VIUVO: "Viúvo(a)", DIVORCIADO: "Divorciado(a)", UNIAO_ESTAVEL: "União Estável" };
const ROTULO_FORMA_ADMISSAO_MEUPAINEL = { BATISMO: "Batismo nas águas", CARTA_MUDANCA: "Carta de Mudança", RECONCILIACAO: "Reconciliação", ACLAMACAO: "Aclamação" };

async function carregarMeusDadosForm() {
  if (!authMatricula) return;
  const res = await fetch(`${API_BASE}/meus-dados/${authMatricula}`);
  const data = await res.json();
  if (!data.sucesso) return;
  const d = data.dados;
  document.getElementById("meuTelefone").value = d.telefone || "";
  document.getElementById("meuEmail").value = d.email || "";
  document.getElementById("meuEndereco").value = d.endereco || "";
  document.getElementById("meuEstadoCivil").value = d.estadoCivil || "";

  const partes = [
    `Nascimento: ${d.dataNascimento || "-"}`,
    `Admissão: ${d.dataAdmissao || "-"}`,
    `Batismo: ${d.dataBatismo || "-"}`,
    `Forma de Admissão: ${ROTULO_FORMA_ADMISSAO_MEUPAINEL[d.formaAdmissao] || "-"}`,
    `Origem: ${d.origem || "-"}`,
    `Igreja Anterior: ${d.igrejaAnterior || "-"}`,
    `Rito: ${d.dataRitoRecebimento || "-"}`
  ];
  document.getElementById("dadosAtuaisReferencia").textContent = "Como está hoje — " + partes.join(" · ");
}

async function salvarMeusDadosAcao() {
  if (!authMatricula) return;
  const msg = document.getElementById("resultadoMeusDados");
  const telefone = document.getElementById("meuTelefone").value.trim();
  const email = document.getElementById("meuEmail").value.trim();
  const endereco = document.getElementById("meuEndereco").value.trim();
  const estadoCivil = document.getElementById("meuEstadoCivil").value;

  const res = await fetch(`${API_BASE}/meus-dados/${authMatricula}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telefone, email, endereco, estadoCivil })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem;
}

// ---- MEUS VÍNCULOS FAMILIARES (v1.11 — autoatendimento) ----
async function carregarOpcoesMeuVinculoTipo() {
  const select = document.getElementById("meuVinculoTipo");
  const res = await fetch(`${API_BASE}/catalogos/tiposVinculoFamiliar`);
  const tipos = await res.json();
  select.innerHTML = tipos.filter(t => t.ativo !== false).map(t => `<option value="${t.tipoVinculoId}">${t.rotuloDireto}</option>`).join("");
}

async function carregarMeusVinculos() {
  if (!authMatricula) return;
  const container = document.getElementById("resultadoListaMeusVinculos");
  const res = await fetch(`${API_BASE}/meus-vinculos/${authMatricula}`);
  const vinculos = await res.json();
  if (!Array.isArray(vinculos) || vinculos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum vínculo familiar cadastrado ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Parentesco</th><th>Pessoa</th><th></th></tr></thead><tbody>`;
  vinculos.forEach(v => {
    html += `<tr>
      <td>${v.rotulo}</td>
      <td>${v.outraPessoaNome} (${v.outraPessoaId})${v.outraPessoaEhResponsavel ? ' <span class="badge-status badge-ativo">Responsável Legal</span>' : ""}</td>
      <td class="acoes-inline"><button class="btn-link btn-link-perigo" onclick="removerMeuVinculoAcao(${v.vinculoId})">Remover</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarMeuVinculoAcao() {
  if (!authMatricula) return;
  const tipoVinculoId = document.getElementById("meuVinculoTipo").value;
  const membroParenteId = document.getElementById("meuVinculoMatriculaParente").value;
  const responsavelLegal = document.getElementById("meuVinculoResponsavelLegal").checked;
  if (!tipoVinculoId || !membroParenteId) {
    mostrarToast("Informe o tipo de vínculo e a matrícula da outra pessoa.", "erro");
    return;
  }
  const res = await fetch(`${API_BASE}/meus-vinculos/${authMatricula}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroParenteId, tipoVinculoId, responsavelLegal })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("meuVinculoMatriculaParente").value = "";
    document.getElementById("meuVinculoResponsavelLegal").checked = false;
    carregarMeusVinculos();
  }
}

async function removerMeuVinculoAcao(vinculoId) {
  if (!(await confirmarAcao("Remover este vínculo familiar?", "Remover"))) return;
  const res = await fetch(`${API_BASE}/meus-vinculos/${authMatricula}/${vinculoId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarMeusVinculos();
}

// ---- SOLICITAR EDIÇÃO SUJEITA A APROVAÇÃO (v1.11) ----
const ROTULO_STATUS_SOLICITACAO_EDICAO = { PENDENTE: "Pendente", APROVADO: "Aprovado", REJEITADO: "Rejeitado" };

async function enviarSolicitacaoEdicaoAcao() {
  if (!authMatricula) return;
  const msg = document.getElementById("resultadoSolicitacaoEdicao");
  const campos = {};
  const lerSeInformado = (id, chave) => {
    const valor = document.getElementById(id).value;
    if (valor) campos[chave] = valor.trim ? valor.trim() : valor;
  };
  lerSeInformado("solEdicaoDataNascimento", "dataNascimento");
  lerSeInformado("solEdicaoDataAdmissao", "dataAdmissao");
  lerSeInformado("solEdicaoDataBatismo", "dataBatismo");
  lerSeInformado("solEdicaoFormaAdmissao", "formaAdmissao");
  lerSeInformado("solEdicaoOrigem", "origem");
  lerSeInformado("solEdicaoIgrejaAnterior", "igrejaAnterior");
  lerSeInformado("solEdicaoDataRitoRecebimento", "dataRitoRecebimento");
  lerSeInformado("solEdicaoNomeLidoRito", "nomeLidoRito");
  lerSeInformado("solEdicaoMinistranteRito", "ministranteRito");

  if (Object.keys(campos).length === 0) {
    msg.textContent = "Preencha ao menos um campo pra solicitar correção.";
    return;
  }

  const res = await fetch(`${API_BASE}/solicitacoes-edicao/${authMatricula}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campos })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    ["solEdicaoDataNascimento", "solEdicaoDataAdmissao", "solEdicaoDataBatismo", "solEdicaoFormaAdmissao",
      "solEdicaoOrigem", "solEdicaoIgrejaAnterior", "solEdicaoDataRitoRecebimento", "solEdicaoNomeLidoRito", "solEdicaoMinistranteRito"
    ].forEach(id => { document.getElementById(id).value = ""; });
    carregarMinhasSolicitacoesEdicao();
  }
}

async function carregarMinhasSolicitacoesEdicao() {
  if (!authMatricula) return;
  const container = document.getElementById("resultadoListaSolicitacoesEdicao");
  const res = await fetch(`${API_BASE}/solicitacoes-edicao/${authMatricula}`);
  const solicitacoes = await res.json();
  if (!Array.isArray(solicitacoes) || solicitacoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma solicitação enviada ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Data</th><th>Campo</th><th>Valor Anterior</th><th>Valor Proposto</th><th>Status</th></tr></thead><tbody>`;
  solicitacoes.forEach(s => {
    s.campos.forEach((c, i) => {
      html += `<tr>
        ${i === 0 ? `<td rowspan="${s.campos.length}">${new Date(s.dataSolicitacao).toLocaleDateString("pt-BR")}</td>` : ""}
        <td>${c.nomeCampo}</td>
        <td>${c.valorAnterior || "-"}</td>
        <td>${c.valorProposto}</td>
        <td>${ROTULO_STATUS_SOLICITACAO_EDICAO[c.status] || c.status}</td>
      </tr>`;
    });
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

function mostrarAbaSecretaria(aba) {
  NOMES_ABAS.forEach(nome => {
    const podeVer = nome === "meupainel" || nome === "documentos" || permissoesDaAba(nome).some(chave => authPermissoes.includes(chave));
    const divAba = document.getElementById(`aba${capitalize(nome)}`);
    const mostrar = nome === aba && podeVer;
    divAba.style.display = mostrar ? "block" : "none";
    const btn = document.getElementById(`btnAba${capitalize(nome)}`);
    if (btn) btn.classList.toggle("ativo", nome === aba);
  });
  if (aba === "meupainel") {
    mostrarSubAbaMeupainel(subAbaMeupainelAtual);
    return;
  }
  document.getElementById("tituloModulo").textContent = TITULOS_MODULOS[aba] || "Governança";
  if (aba === "reunioes") { montarSubmenuReunioes(); carregarElegiveisAssembleia(); }
  if (aba === "pessoas") { carregarOpcoesFormPessoa().then(() => mostrarSubAbaPessoas(subAbaPessoasAtual)); carregarPessoas(); }
  if (aba === "cartas") { carregarCartas(); processarSaidasCartas(); }
  if (aba === "orgaos") { carregarOrgaos(); carregarAssentos(); montarOrgaosLocais(); }
  if (aba === "estrutura") montarEstrutura();
  if (aba === "catalogos") montarCatalogos();
  if (aba === "permissoes") { carregarOpcoesEscopoPermissao(); carregarPermissoes(); }
  if (aba === "consagracoes") { carregarTiposConsagracao(); carregarConsagracoes(); }
  if (aba === "disciplina") { carregarOpcoesFormDisciplina(); carregarProcessosDisciplinares(); }
  if (aba === "abandono") { carregarRadarAbandono(); carregarOpcoesTentativaContato(); carregarRadarAbandonoDigital(); carregarProcedimentosAbandono(); }
  if (aba === "auditoria") carregarAuditoria();
  if (aba === "protecaodedados") { carregarSolicitacoesDPO(); montarPoliticasRetencao(); }
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function alternarSidebar() {
  document.getElementById("sidebar").classList.toggle("recolhido");
}
const TITULOS_MODULOS = {
  meupainel: "Meu Painel", reunioes: "Reuniões",
  pessoas: "Pessoas", cartas: "Cartas de Trânsito", congregacoes: "Congregações",
  orgaos: "Órgãos", estrutura: "Estrutura", catalogos: "Catálogos",
  permissoes: "Permissões", consagracoes: "Consagrações", disciplina: "Processo Disciplinar",
  abandono: "Perda de Membresia",
  auditoria: "Auditoria", protecaodedados: "Proteção de Dados", documentos: "Documentos"
};

// ---- PORTARIA: registrar presença (pública, sem login) ----
// Normalmente a senha já identifica a reunião certa sozinha. O único caso em que
// sobra mais de uma candidata é duas reuniões concorrentes usando a mesma senha
// E a pessoa sendo elegível pras duas — aí o backend devolve precisaEscolher e a
// gente pergunta antes de reenviar com o sessaoId escolhido.
async function enviarPresenca(sessaoIdEscolhida) {
  const matricula = document.getElementById("matricula").value;
  const senha = document.getElementById("senha").value;
  if (!matricula || !senha) return;

  const btn = document.getElementById("btnBaterPonto");
  btn.textContent = "Aguarde...";

  try {
    const res = await fetch(`${API_BASE}/presenca`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matricula, senha, sessaoId: sessaoIdEscolhida || undefined })
    });
    const data = await res.json();
    if (data.precisaEscolher) {
      const escolha = await escolherReuniaoParaCheckin(data.sessoes, data.mensagem);
      btn.textContent = "Registrar Presença";
      if (escolha) return enviarPresenca(escolha);
      return;
    }
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

// Promise<string|null> — sessaoId escolhido, ou null se cancelou.
function escolherReuniaoParaCheckin(sessoes, mensagem) {
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Qual reunião?</h3>
      <p>${mensagem || ""}</p>
      <div class="modal-acoes" style="flex-direction:column; align-items:stretch;">
        ${sessoes.map(s => `<button class="btn-confirmar" style="margin-bottom:6px;" data-sessao="${s.sessaoId}">${s.orgaoNome} — ${s.descricao}</button>`).join("")}
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    caixa.querySelectorAll("[data-sessao]").forEach(botao => {
      botao.onclick = () => { const id = botao.dataset.sessao; fecharModal(); resolve(id); };
    });
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

// ---- SECRETARIA / ABA REUNIÕES ----
function statusFrequencia(item) {
  if (item.presente) return "Presente";
  if (item.faltaJustificada) return "Falta justificada";
  return "Falta";
}
function badgeStatusPessoa(status) {
  const classes = { ATIVO: "badge-ativo", "LICENÇA": "badge-licenca", INATIVO: "badge-inativo", DESLIGADO: "badge-desligado", FALECIDO: "badge-desligado" };
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
  let html = `<span class="badge-status ${cores[c.categoria] || "badge-licenca"}">${c.categoria || "-"}</span>`;
  // v1.2 — a categoria NÃO muda com a integração: o batismo já torna a pessoa
  // "Membro em Comunhão" (Art. 7º II). Os 90 dias apenas restringem votar/ser votado,
  // então o período aparece como um aviso à parte, sem substituir a categoria.
  if (c.emPeriodoIntegracao) {
    const restantes = c.diasRestantesIntegracao != null ? c.diasRestantesIntegracao : 0;
    html += ` <span class="badge-status badge-licenca" title="Período de Integração — Art. 6º §2º">⏳ ${restantes}d p/ votar</span>`;
  }
  return html;
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

  const selectAssento = document.getElementById("assentoOrgao");
  if (selectAssento) selectAssento.innerHTML = orgaos.map(o => `<option value="${o.orgaoId}">${o.nome}</option>`).join("");
}

function badgeSituacaoAssento(situacao) {
  const classes = { ATIVA: "badge-ativo", MANDATO_VENCIDO: "badge-licenca", ENCERRADA: "badge-desligado" };
  const rotulos = { ATIVA: "Ativa", MANDATO_VENCIDO: "Mandato vencido", ENCERRADA: "Encerrada" };
  return `<span class="badge-status ${classes[situacao] || ""}">${rotulos[situacao] || situacao}</span>`;
}

async function carregarAssentos() {
  const container = document.getElementById("resultadoListaAssentos");
  const res = await fetchProtegido(`${API_BASE}/assentos`);
  const assentos = await res.json();
  if (!Array.isArray(assentos) || assentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma cadeira cadastrada ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Nome</th><th>Órgão</th><th>Tipo</th><th>Cargo/Função</th><th>Desde</th><th>Até</th><th>Situação</th><th></th>
  </tr></thead><tbody>`;
  assentos.forEach(a => {
    html += `<tr>
      <td>${a.membroId}</td>
      <td>${a.nome}</td>
      <td>${a.orgaoNome}</td>
      <td>${a.tipoAssento === "ORDENACAO" ? "Ordenação" : "Função"}</td>
      <td>${a.cargoOuFuncao || "-"}</td>
      <td>${a.dataInicio}</td>
      <td>${a.dataTerminoPrevisao || "sem prazo"}</td>
      <td>${badgeSituacaoAssento(a.situacaoEfetiva)}</td>
      <td class="acoes-inline"><button class="btn-link btn-link-perigo" onclick="encerrarAssentoAcao(${a.assentoId})">Encerrar</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarAssento() {
  const membroId = document.getElementById("assentoMatricula").value;
  const orgaoId = document.getElementById("assentoOrgao").value;
  const tipoAssento = document.getElementById("assentoTipo").value;
  const cargoOuFuncao = document.getElementById("assentoCargoOuFuncao").value.trim();
  const duracaoMeses = document.getElementById("assentoDuracaoMeses").value || null;
  const msg = document.getElementById("resultadoAssento");
  if (!membroId || !orgaoId) { msg.textContent = "Informe a matrícula e o órgão."; return; }
  const res = await fetchProtegido(`${API_BASE}/assentos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, orgaoId, tipoAssento, cargoOuFuncao: cargoOuFuncao || null, duracaoMeses })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("assentoMatricula").value = "";
    document.getElementById("assentoCargoOuFuncao").value = "";
    document.getElementById("assentoDuracaoMeses").value = "";
    carregarAssentos();
  }
}

async function encerrarAssentoAcao(assentoId) {
  if (!(await confirmarAcao("Encerrar esta cadeira?", "Encerrar"))) return;
  const res = await fetchProtegido(`${API_BASE}/assentos/${assentoId}/encerrar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarAssentos();
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
  statuses: { titulo: "Status do Membro", idField: "statusId", campos: [["sigla", "Sigla"], ["nome", "Nome"]] },
  departamentos: { titulo: "Departamentos", idField: "departamentoId", campos: [["sigla", "Sigla"], ["nome", "Nome"], ["numero", "Número"]] },
  tiposConsagracao: {
    titulo: "Tipos de Proposta (Consagrações)", idField: "tipoConsagracaoId",
    campos: [
      ["nome", "Nome do Tipo"],
      ["cargoMinisterialResultante", "Cargo Ministerial resultante (opcional)", [
        ["MEMBRO", "Membro"], ["AUXILIAR", "Auxiliar"], ["MISSIONARIO", "Missionário(a)"],
        ["DIACONO", "Diácono"], ["PRESBITERO", "Presbítero"], ["EVANGELISTA", "Evangelista"], ["PASTOR", "Pastor"]
      ], true]
    ]
  },
  orgaosLocais: { titulo: "Órgãos Locais (JAI/JEA/CRA/TER/CEQ/Distrito)", idField: "orgaoLocalId", campos: [["sigla", "Sigla (JAI/JEA/CRA/TER/CEQ/DISTRITO)"], ["nome", "Nome"], ["nivel", "Nível (1-5)"], ["referenciaId", "Id da Congregação/Área/Região/Quadrante/Distrito"]] },
  cargosMinisteriais: { titulo: "Cargos Ministeriais (escada — Art. 71)", idField: "cargoId", campos: [["sigla", "Sigla"], ["nome", "Nome"], ["ordem", "Ordem na escada"]] },
  prazos: { titulo: "Prazos (Estatuto/Regimento)", idField: "prazoId", campos: [["sigla", "Sigla"], ["nome", "Nome"], ["dias", "Dias"]] },
  tiposVinculoFamiliar: { titulo: "Tipos de Vínculo Familiar", idField: "tipoVinculoId", campos: [["codigo", "Código"], ["rotuloDireto", "Rótulo direto (ex: Pai/Mãe de)"], ["rotuloInverso", "Rótulo inverso (deixe vazio se simétrico)"]] },
  politicasRetencao: { titulo: "Políticas de Retenção (LGPD)", idField: "politicaId", campos: [["categoria", "Categoria"], ["baseLegal", "Base legal"], ["diasRetencao", "Dias (vazio = indeterminado)"]] },
  canaisOficiais: { titulo: "Canais Oficiais de Comunicação (Art. 12)", idField: "canalId", campos: [["sigla", "Sigla"], ["nome", "Nome"]] }
};
// Ordem = nível (0 a 5) da Governança Escalonada (Regimento Art. 104), de baixo
// pra cima: Extensão da Tenda primeiro, Distrito por último. Órgãos Locais
// (JAI/JEA/CRA/TER/CEQ/Distrito) saiu daqui — é órgão, mora na aba Órgãos.
const ESTRUTURA_ORDEM = ["extensoes", "congregacoes", "areas", "regioes", "quadrantes", "distritos"];
const CATALOGOS_ORDEM = ["statuses", "situacoes", "departamentos", "cargosMinisteriais", "tiposConsagracao", "prazos", "tiposVinculoFamiliar", "canaisOficiais"];
const POLITICAS_RETENCAO_ORDEM = ["politicasRetencao"];
const ORGAOS_LOCAIS_ORDEM = ["orgaosLocais"];

function montarPoliticasRetencao() {
  document.getElementById("politicasRetencaoConteudo").innerHTML = POLITICAS_RETENCAO_ORDEM.map(k => secaoCatalogo(k)).join("");
  POLITICAS_RETENCAO_ORDEM.forEach(k => { carregarOpcoesPai(k); carregarCatalogoLista(k); });
}
function montarOrgaosLocais() {
  document.getElementById("orgaosLocaisConteudo").innerHTML = ORGAOS_LOCAIS_ORDEM.map(k => secaoCatalogo(k)).join("");
  ORGAOS_LOCAIS_ORDEM.forEach(k => { carregarOpcoesPai(k); carregarCatalogoLista(k); });
}
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

// Campo = [id, rotulo] (texto livre) ou [id, rotulo, opcoes] (select, quando o
// valor precisa ser controlado — ex: sigla de outro catálogo, tipo enum fixo).
function secaoCatalogo(key) {
  const c = CATALOGOS_CFG[key];
  const camposHtml = c.campos.map(([id, rotulo, opcoes]) => opcoes
    ? `<select id="cat_${key}_${id}"><option value="">${rotulo}</option>${opcoes.map(([v, r]) => `<option value="${v}">${r}</option>`).join("")}</select>`
    : `<input type="text" id="cat_${key}_${id}" placeholder="${rotulo}" style="min-width:150px;" />`
  ).join("");
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
  if (c.campos.some(([fid, , , opcional]) => !opcional && !dados[fid])) { mostrarToast("Preencha todos os campos obrigatórios.", "erro"); return; }
  c.campos.forEach(([fid, , , opcional]) => { if (opcional && !dados[fid]) dados[fid] = null; });
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

let sessaoFrequenciaAberta = null; // { sessaoId, descricao } — pra atualizar a tela após encerrar/justificar

// Submenu de Reuniões — gerado em runtime a partir do catálogo de Órgãos
// (nunca hardcoded): se um órgão for renomeado ou excluído na aba Órgãos, o
// submenu reflete isso na próxima vez que a aba Reuniões for aberta. O mesmo
// bloco de conteúdo é reaproveitado pra qualquer órgão selecionado — só o
// bloco de Elegíveis (exclusivo da Assembleia Geral) muda de visibilidade.
async function montarSubmenuReunioes() {
  const res = await fetchProtegido(`${API_BASE}/orgaos`);
  const orgaos = await res.json();
  window._orgaosReunioesCache = orgaos;

  const container = document.getElementById("submenuReunioes");
  container.innerHTML = orgaos.map(o => `
    <button class="btn-subaba" id="btnSubReunioes${o.orgaoId}" onclick="selecionarOrgaoReunioes(${o.orgaoId})">
      <span class="icone">🏛️</span><span class="rotulo">${o.nome}</span>
    </button>`).join("");

  if (orgaos.length === 0) return;
  const aindaExiste = orgaos.some(o => o.orgaoId === window._orgaoAtualReunioes);
  selecionarOrgaoReunioes(aindaExiste ? window._orgaoAtualReunioes : orgaos[0].orgaoId);
}

function selecionarOrgaoReunioes(orgaoId) {
  const orgaos = window._orgaosReunioesCache || [];
  const orgao = orgaos.find(o => o.orgaoId === orgaoId);
  if (!orgao) return;

  const ehAssembleia = orgao.sigla === "ASSEMBLEIA_GERAL";
  const ehCLI = orgao.sigla === "CLI";
  const ehDiretoria = orgao.sigla === "DIRETORIA_EXECUTIVA";
  window._orgaoAtualReunioes = orgaoId;
  document.getElementById("reuniaoOrgao").value = orgaoId;
  document.getElementById("reunioesOrgaoNome").textContent = orgao.nome;
  document.getElementById("blocoElegiveisAssembleia").style.display = ehAssembleia ? "block" : "none";
  document.getElementById("blocoComposicaoCLI").style.display = ehCLI ? "block" : "none";
  document.getElementById("blocoDiretoria").style.display = ehDiretoria ? "block" : "none";
  // Assembleia Geral não abre na hora (Art. 20) — troca o formulário instantâneo
  // pelo par Convocar (com antecedência) / Iniciar (no dia previsto).
  document.getElementById("blocoConvocarAssembleia").style.display = ehAssembleia ? "block" : "none";
  document.getElementById("blocoAbrirReuniaoSimples").style.display = ehAssembleia ? "none" : "block";
  orgaos.forEach(o => {
    const btn = document.getElementById(`btnSubReunioes${o.orgaoId}`);
    if (btn) btn.classList.toggle("ativo", o.orgaoId === orgaoId);
  });

  if (ehAssembleia) carregarConvocacoesPendentes();
  if (ehCLI) { carregarComposicaoCLI(); carregarAssentosCLI(); carregarComissoes(); }
  if (ehDiretoria) { carregarAssentosDiretoria(); carregarSucessaoPresidencial(); }
  carregarReunioes();
}

function orgaoIdCLI() {
  const orgao = (window._orgaosReunioesCache || []).find(o => o.sigla === "CLI");
  return orgao ? orgao.orgaoId : null;
}

async function carregarComposicaoCLI() {
  const container = document.getElementById("resultadoComposicaoCLI");
  const res = await fetchProtegido(`${API_BASE}/cli/composicao`);
  const composicao = await res.json();
  if (!Array.isArray(composicao) || composicao.length === 0) {
    container.innerHTML = "<p class='subtitle'>Ninguém compõe a CLI ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Nome</th><th>Congregação</th><th>Como entra</th><th>Situação</th>
  </tr></thead><tbody>`;
  composicao.forEach(m => {
    let comoEntra;
    if (m.viaOrdenacao) comoEntra = `Ordenação (${nomeCargoPorSigla(m.cargoMinisterial)})`;
    else if (m.orgaoOrigemNome && m.orgaoOrigemNome !== "Câmara de Liderança Institucional") comoEntra = `Função (${m.cargoOuFuncao || "-"}, herdado da ${m.orgaoOrigemNome})`;
    else comoEntra = `Função (${m.cargoOuFuncao || "-"})`;
    const situacao = m.processoDisciplinarAtivo ? "Sob disciplina (não conta)" : (!m.emComunhao ? "Sem comunhão (não conta)" : "Ativo");
    html += `<tr>
      <td>${m.membroId}</td>
      <td>${m.nome}</td>
      <td>${m.congregacao || "-"}</td>
      <td>${comoEntra}</td>
      <td>${situacao}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function carregarAssentosCLI() {
  const container = document.getElementById("resultadoListaAssentosCLI");
  const orgaoId = orgaoIdCLI();
  if (!orgaoId) return;
  const res = await fetchProtegido(`${API_BASE}/assentos?orgaoId=${orgaoId}`);
  const assentos = await res.json();
  if (!Array.isArray(assentos) || assentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma cadeira aberta direto na CLI ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Nome</th><th>Cargo/Função</th><th>Desde</th><th>Até</th><th>Situação</th><th></th>
  </tr></thead><tbody>`;
  assentos.forEach(a => {
    html += `<tr>
      <td>${a.membroId}</td>
      <td>${a.nome}</td>
      <td>${a.cargoOuFuncao || "-"}</td>
      <td>${a.dataInicio}</td>
      <td>${a.dataTerminoPrevisao || "sem prazo"}</td>
      <td>${badgeSituacaoAssento(a.situacaoEfetiva)}</td>
      <td class="acoes-inline"><button class="btn-link btn-link-perigo" onclick="encerrarAssentoCLIAcao(${a.assentoId})">Encerrar</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarAssentoCLI() {
  const orgaoId = orgaoIdCLI();
  const membroId = document.getElementById("assentoCLIMatricula").value;
  const cargoOuFuncao = document.getElementById("assentoCLIFuncao").value;
  const duracaoMeses = document.getElementById("assentoCLIDuracaoMeses").value || null;
  const msg = document.getElementById("resultadoAssentoCLI");
  if (!orgaoId || !membroId) { msg.textContent = "Informe a matrícula."; return; }
  const res = await fetchProtegido(`${API_BASE}/assentos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, orgaoId, tipoAssento: "FUNCAO", cargoOuFuncao, duracaoMeses })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("assentoCLIMatricula").value = "";
    document.getElementById("assentoCLIDuracaoMeses").value = "";
    carregarAssentosCLI();
    carregarComposicaoCLI();
  }
}

async function encerrarAssentoCLIAcao(assentoId) {
  if (!(await confirmarAcao("Encerrar esta cadeira?", "Encerrar"))) return;
  const res = await fetchProtegido(`${API_BASE}/assentos/${assentoId}/encerrar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarAssentosCLI(); carregarComposicaoCLI(); }
}

function tabelaComissaoCalculada(lista, comAcaoRemover) {
  if (!Array.isArray(lista) || lista.length === 0) return "<p class='subtitle'>Ninguém compõe essa comissão ainda.</p>";
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Nome</th>${comAcaoRemover ? "<th>Desde</th><th></th>" : "<th>Cargo/Origem</th>"}
  </tr></thead><tbody>`;
  lista.forEach(m => {
    html += `<tr>
      <td>${m.membroId}</td>
      <td>${m.nome}</td>
      ${comAcaoRemover
        ? `<td>${m.dataInicio}</td><td><button class="btn-link btn-link-perigo" onclick="removerMembroCCJ(${m.comissaoMembroId})">Remover</button></td>`
        : `<td>${m.cargoOuFuncao || "-"}${m.origemSigla ? ` (${m.origemSigla})` : ""}</td>`}
    </tr>`;
  });
  html += "</tbody></table>";
  return html;
}

async function carregarComissoes() {
  const res = await fetchProtegido(`${API_BASE}/comissoes`);
  const data = await res.json();
  window._ccjCache = data.CCJ || [];
  document.getElementById("resultadoListaCCJ").innerHTML = tabelaComissaoCalculada(data.CCJ, true);
  document.getElementById("resultadoListaCFO").innerHTML = tabelaComissaoCalculada(data.CFO, false);
  document.getElementById("resultadoListaCEP").innerHTML = tabelaComissaoCalculada(data.CEP, false);
}

async function adicionarMembroCCJ() {
  const membroId = document.getElementById("ccjMatricula").value;
  const msg = document.getElementById("resultadoCCJ");
  if (!membroId) { msg.textContent = "Informe a matrícula."; return; }
  const res = await fetchProtegido(`${API_BASE}/comissoes/ccj`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("ccjMatricula").value = "";
    carregarComissoes();
  }
}

async function removerMembroCCJ(comissaoMembroId) {
  if (!(await confirmarAcao("Remover este membro da CCJ?", "Remover"))) return;
  const res = await fetchProtegido(`${API_BASE}/comissoes/ccj/${comissaoMembroId}/encerrar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarComissoes();
}

// Art. 29 — espelha shared/diretoria.js::CARGOS_DIRETORIA (fonte de verdade
// do cálculo continua no back-end; isso aqui é só rótulo de exibição).
const CARGOS_DIRETORIA = {
  PRESIDENTE: "Presidente",
  VICE_PRESIDENTE_1: "1º Vice-Presidente",
  VICE_PRESIDENTE_2: "2º Vice-Presidente",
  VICE_PRESIDENTE_3: "3º Vice-Presidente",
  VICE_PRESIDENTE_4: "4º Vice-Presidente",
  SECRETARIO_1: "1º Secretário",
  SECRETARIO_2: "2º Secretário",
  SECRETARIO_3: "3º Secretário",
  TESOUREIRO_1: "1º Tesoureiro",
  TESOUREIRO_2: "2º Tesoureiro"
};

function orgaoIdDiretoria() {
  const orgao = (window._orgaosReunioesCache || []).find(o => o.sigla === "DIRETORIA_EXECUTIVA");
  return orgao ? orgao.orgaoId : null;
}

async function carregarAssentosDiretoria() {
  const select = document.getElementById("assentoDiretoriaCargo");
  if (select && !select.dataset.preenchido) {
    select.innerHTML = Object.entries(CARGOS_DIRETORIA).map(([sigla, rotulo]) => `<option value="${sigla}">${rotulo}</option>`).join("");
    select.dataset.preenchido = "1";
  }

  const container = document.getElementById("resultadoListaDiretoria");
  const orgaoId = orgaoIdDiretoria();
  if (!orgaoId) return;
  const res = await fetchProtegido(`${API_BASE}/assentos?orgaoId=${orgaoId}`);
  const assentos = await res.json();

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Cargo</th><th>Matrícula</th><th>Nome</th><th>Desde</th><th>Até</th><th>Situação</th><th></th>
  </tr></thead><tbody>`;
  Object.entries(CARGOS_DIRETORIA).forEach(([sigla, rotulo]) => {
    const a = Array.isArray(assentos) ? assentos.find(x => x.cargoOuFuncao === sigla) : null;
    html += `<tr>
      <td>${rotulo}</td>
      <td>${a ? a.membroId : "-"}</td>
      <td>${a ? a.nome : "<span class='subtitle'>vago</span>"}</td>
      <td>${a ? a.dataInicio : "-"}</td>
      <td>${a ? (a.dataTerminoPrevisao || "sem prazo") : "-"}</td>
      <td>${a ? badgeSituacaoAssento(a.situacaoEfetiva) : "-"}</td>
      <td>${a ? `<button class="btn-link btn-link-perigo" onclick="encerrarAssentoDiretoriaAcao(${a.assentoId})">Encerrar</button>` : ""}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarAssentoDiretoria() {
  const orgaoId = orgaoIdDiretoria();
  const membroId = document.getElementById("assentoDiretoriaMatricula").value;
  const cargoOuFuncao = document.getElementById("assentoDiretoriaCargo").value;
  const duracaoMeses = document.getElementById("assentoDiretoriaDuracaoMeses").value || null;
  const msg = document.getElementById("resultadoAssentoDiretoria");
  if (!orgaoId || !membroId) { msg.textContent = "Informe a matrícula."; return; }
  const res = await fetchProtegido(`${API_BASE}/assentos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, orgaoId, tipoAssento: "FUNCAO", cargoOuFuncao, duracaoMeses })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("assentoDiretoriaMatricula").value = "";
    carregarAssentosDiretoria();
    carregarSucessaoPresidencial();
  }
}

async function encerrarAssentoDiretoriaAcao(assentoId) {
  if (!(await confirmarAcao("Encerrar esta cadeira?", "Encerrar"))) return;
  const res = await fetchProtegido(`${API_BASE}/assentos/${assentoId}/encerrar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarAssentosDiretoria(); carregarSucessaoPresidencial(); }
}

async function carregarSucessaoPresidencial() {
  const container = document.getElementById("resultadoSucessaoPresidencial");
  const res = await fetchProtegido(`${API_BASE}/diretoria/sucessao`);
  const s = await res.json();
  if (!s.sucesso) { container.textContent = s.mensagem || ""; return; }

  if (!s.vago) {
    container.innerHTML = `<p>✅ Presidente em exercício: <strong>${s.presidente.nome}</strong> (matrícula ${s.presidente.membroId}).</p>`;
    return;
  }

  const origem = s.interino ? (s.interino.viaCEI ? "via CEI (Art. 32, nenhum Vice-Presidente ativo)" : "próximo na linha sucessória") : "ninguém disponível (nem Vice-Presidente, nem CEI)";
  let html = `<p>⚠️ Presidência vaga desde <strong>${s.dataVacancia}</strong> (${s.diasDesdeVacancia} dia(s)).</p>`;
  html += `<p>Interino: <strong>${s.interino ? s.interino.nome : "-"}</strong> — ${origem}.</p>`;
  html += `<p>${s.prazoIndicacaoCiadseta.vencido ? "🔴" : "🟡"} Prazo de indicação da CIADSETA (90 dias, Art. 32 §2º): ${s.prazoIndicacaoCiadseta.vencido ? "VENCIDO" : "em curso"}.</p>`;
  if (s.prazoAge) {
    html += `<p>${s.prazoAge.vencido ? "🔴" : "🟡"} Prazo de convocação de AGE pela CLI (+30 dias, Art. 32 §3º): ${s.prazoAge.vencido ? "VENCIDO — CLI deve convocar Assembleia" : "em curso"}.</p>`;
  }
  container.innerHTML = html;
}

async function carregarConvocacoesPendentes() {
  const container = document.getElementById("resultadoConvocacoesPendentes");
  const res = await fetchProtegido(`${API_BASE}/assembleia/convocar`);
  const convocacoes = await res.json();
  window._convocacoesPendentesCache = convocacoes;
  if (!Array.isArray(convocacoes) || convocacoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma convocação pendente.</p>";
    return;
  }
  container.innerHTML = convocacoes.map(c => {
    const podeIniciar = c.diasParaPrevista <= 0;
    const contagem = c.diasParaPrevista > 0 ? `faltam ${c.diasParaPrevista} dia(s)` : (c.diasParaPrevista === 0 ? "é hoje" : "data já passou");
    const materiasRotulo = (c.materias || "").split(",").filter(Boolean)
      .map(cod => (ROTULOS_MATERIAS[cod] || cod)).join("; ");
    return `<div class="cartao-convocacao" style="border:1px solid #e5e5e5;border-radius:8px;padding:10px;margin-bottom:8px;">
      <strong>${TITULOS_TIPO_SESSAO[c.tipoSessao] || c.tipoSessao}</strong> — prevista para ${c.dataPrevista} (${contagem})<br/>
      <span class="subtitle">Matérias: ${materiasRotulo}${c.reformaNucleoFundamental ? " (Núcleo Fundamental)" : ""}</span><br/>
      <span class="subtitle">Pauta: ${c.pauta}</span><br/>
      <button class="btn-confirmar" style="width:auto;margin-top:6px;" ${podeIniciar ? "" : "disabled"} onclick="iniciarSessaoConvocadaAcao(${c.sessaoId})">▶️ Iniciar Sessão</button>
      <button class="btn-link" style="margin-left:10px;" onclick="editarConvocacaoAcao(${c.sessaoId})">✏️ Editar</button>
      <button class="btn-link btn-link-perigo" onclick="excluirConvocacaoAcao(${c.sessaoId})">🗑️ Cancelar</button>
    </div>`;
  }).join("");
}

const TITULOS_TIPO_SESSAO = { AGO: "AGO", AGE_GERAL: "AGE (assuntos gerais)", AGE_ESPECIAL: "AGE Especial" };
const ROTULOS_MATERIAS = {
  ELEICAO_DIRETORIA_CONSELHO_FISCAL: "Eleição da Diretoria/Conselho Fiscal",
  DESTITUICAO: "Destituição",
  REFORMA_ESTATUTARIA: "Reforma do Estatuto",
  APROVACAO_CONTAS: "Aprovação de contas",
  ALIENACAO_IMOVEL: "Alienação de imóvel",
  HOMOLOGACAO_PASTOR_PRESIDENTE: "Homologação do Pastor Presidente",
  RATIFICACAO_CLI: "Ratificação de deliberação da CLI"
};

function atualizarNucleoFundamentalVisivel() {
  const reformaMarcada = document.getElementById("convocacaoMateriaReforma").checked;
  document.getElementById("convocacaoLabelNucleoFundamental").hidden = !reformaMarcada;
  if (!reformaMarcada) document.getElementById("convocacaoNucleoFundamental").checked = false;
}

// Reaproveita o mesmo formulário pra criar e editar — window._convocacaoEditandoId
// diz qual convocação (se alguma) está sendo editada; null = criando uma nova.
window._convocacaoEditandoId = null;

function preencherFormConvocacao(c) {
  document.getElementById("convocacaoEhAnual").checked = c.tipoSessao === "AGO";
  const materias = (c.materias || "").split(",").filter(Boolean);
  document.querySelectorAll(".convocacao-materia").forEach(chk => { chk.checked = materias.includes(chk.value); });
  atualizarNucleoFundamentalVisivel();
  document.getElementById("convocacaoNucleoFundamental").checked = !!c.reformaNucleoFundamental;
  document.getElementById("convocacaoDataPrevista").value = c.dataPrevista;
  document.getElementById("convocacaoPauta").value = c.pauta;
  document.getElementById("convocacaoMeiosDivulgacao").value = c.meiosDivulgacao || "";
  document.getElementById("convocacaoSenhaAcesso").value = "";
}

function editarConvocacaoAcao(sessaoId) {
  const c = (window._convocacoesPendentesCache || []).find(x => x.sessaoId === sessaoId);
  if (!c) return;
  window._convocacaoEditandoId = sessaoId;
  preencherFormConvocacao(c);
  document.getElementById("convocacaoBotaoSalvar").textContent = "✏️ Salvar Edição";
  document.getElementById("convocacaoBotaoCancelarEdicao").style.display = "inline-block";
  document.getElementById("convocacaoTitulo").textContent = "📋 Editar Convocação";
}

function cancelarEdicaoConvocacaoAcao() {
  window._convocacaoEditandoId = null;
  window._convocacaoVinculadaId = null;
  document.getElementById("convocacaoEhAnual").checked = false;
  document.querySelectorAll(".convocacao-materia").forEach(chk => { chk.checked = false; });
  atualizarNucleoFundamentalVisivel();
  document.getElementById("convocacaoDataPrevista").value = "";
  document.getElementById("convocacaoPauta").value = "";
  document.getElementById("convocacaoMeiosDivulgacao").value = "";
  document.getElementById("convocacaoSenhaAcesso").value = "";
  document.getElementById("convocacaoBotaoSalvar").textContent = "📋 Convocar";
  document.getElementById("convocacaoBotaoCancelarEdicao").style.display = "none";
  document.getElementById("convocacaoTitulo").textContent = "📋 Convocar Assembleia Geral";
}

async function excluirConvocacaoAcao(sessaoId) {
  if (!(await confirmarAcao("Tem certeza que deseja cancelar esta convocação?", "Cancelar"))) return;

  const res = await fetchProtegido(`${API_BASE}/assembleia/convocar/${sessaoId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    if (window._convocacaoEditandoId === sessaoId) cancelarEdicaoConvocacaoAcao();
    carregarConvocacoesPendentes();
  }
}

async function convocarAssembleiaAcao() {
  const ehAnual = document.getElementById("convocacaoEhAnual").checked;
  const materias = Array.from(document.querySelectorAll(".convocacao-materia:checked")).map(chk => chk.value);
  const reformaNucleoFundamental = document.getElementById("convocacaoNucleoFundamental").checked;
  const dataPrevista = document.getElementById("convocacaoDataPrevista").value;
  const pauta = document.getElementById("convocacaoPauta").value;
  const meiosDivulgacao = document.getElementById("convocacaoMeiosDivulgacao").value;
  const senhaAcesso = document.getElementById("convocacaoSenhaAcesso").value;
  if (materias.length === 0) { mostrarToast("Marque ao menos uma matéria (Art. 18).", "erro"); return; }
  if (!dataPrevista || !pauta || !senhaAcesso) { mostrarToast("Preencha data prevista, pauta e senha.", "erro"); return; }

  const editandoId = window._convocacaoEditandoId;
  const url = editandoId ? `${API_BASE}/assembleia/convocar/${editandoId}` : `${API_BASE}/assembleia/convocar`;
  const res = await fetchProtegido(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ materias, reformaNucleoFundamental, ehAnual, dataPrevista, pauta, meiosDivulgacao, senhaAcesso, vinculadaSessaoId: window._convocacaoVinculadaId || null })
  });
  const data = await res.json();
  document.getElementById("resultadoConvocacao").textContent = data.mensagem;
  if (data.sucesso) {
    if (editandoId) cancelarEdicaoConvocacaoAcao();
    else {
      window._convocacaoVinculadaId = null;
      document.getElementById("convocacaoDataPrevista").value = "";
      document.getElementById("convocacaoPauta").value = "";
      document.getElementById("convocacaoMeiosDivulgacao").value = "";
      document.getElementById("convocacaoSenhaAcesso").value = "";
    }
    carregarConvocacoesPendentes();
  }
}

// Reconvocação (Art. 21, II, "c") — abre o formulário de convocar já marcado
// com a mesma matéria de reforma/destituição, ligando à sessão que não bateu
// quórum via vinculadaSessaoId (só liberado 1 vez, validado no back-end).
function reconvocarAssembleiaAcao(sessaoId, materiasCsv) {
  cancelarEdicaoConvocacaoAcao();
  window._convocacaoVinculadaId = sessaoId;
  const materias = (materiasCsv || "").split(",").filter(Boolean);
  document.querySelectorAll(".convocacao-materia").forEach(chk => { chk.checked = materias.includes(chk.value); });
  document.getElementById("convocacaoTitulo").textContent = "📋 Reconvocar (Art. 21, II, \"c\")";
  mostrarToast("Preencha a nova data (mín. 15 dias) e envie — isso reconvoca a sessão anterior.", "sucesso");
}

async function iniciarSessaoConvocadaAcao(sessaoId) {
  const senhaAcesso = await pedirTexto("Senha para a Portaria", "Ex: 1234");
  if (senhaAcesso === null) return;

  const res = await fetchProtegido(`${API_BASE}/reunioes/abrir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessaoId, senhaAcesso })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    carregarConvocacoesPendentes();
    carregarReunioes();
  }
}

async function abrirReuniao() {
  const orgaoId = document.getElementById("reuniaoOrgao").value;
  const descricao = document.getElementById("descricaoReuniao").value;
  const senhaAcesso = document.getElementById("senhaNovaReuniao").value;
  if (!orgaoId || !descricao || !senhaAcesso) { mostrarToast("Escolha o órgão e preencha descrição e senha.", "erro"); return; }

  const res = await fetchProtegido(`${API_BASE}/reunioes/abrir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgaoId, descricao, senhaAcesso })
  });
  const data = await res.json();
  document.getElementById("resultadoSecretaria").textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("descricaoReuniao").value = "";
    document.getElementById("senhaNovaReuniao").value = "";
  }
  carregarReunioes();
}

async function encerrarReuniaoAcao(sessaoId) {
  if (!(await confirmarAcao("Tem certeza que deseja encerrar esta reunião?", "Encerrar"))) return;

  const res = await fetchProtegido(`${API_BASE}/reunioes/${sessaoId}/encerrar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  carregarReunioes();
  if (data.sucesso && sessaoFrequenciaAberta && String(sessaoFrequenciaAberta.sessaoId) === String(sessaoId)) {
    verFrequencia(sessaoId, sessaoFrequenciaAberta.descricao);
  }
}

async function carregarReunioes() {
  const container = document.getElementById("resultadoListaReunioes");
  const orgaoId = document.getElementById("reuniaoOrgao").value;
  const res = await fetchProtegido(`${API_BASE}/reunioes${orgaoId ? `?orgaoId=${orgaoId}` : ""}`);
  const reunioes = await res.json();

  if (reunioes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma reunião ainda.</p>";
    return;
  }

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Órgão</th><th>Descrição</th><th>Data</th><th>Status</th><th>Presentes</th><th>Faltas</th><th>Justificadas</th><th></th>
  </tr></thead><tbody>`;

  reunioes.forEach(r => {
    const descricaoEscapada = r.descricao.replace(/'/g, "\\'");
    html += `<tr>
      <td>${r.orgaoNome || "-"}</td>
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

// ---- Elegíveis da Assembleia Geral (fica sempre disponível na aba Reuniões única) ----
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

async function verFrequencia(sessaoId, descricao) {
  sessaoFrequenciaAberta = { sessaoId, descricao };
  document.getElementById("blocoFrequencia").style.display = "block";
  document.getElementById("tituloFrequencia").textContent = descricao;

  const res = await fetchProtegido(`${API_BASE}/reunioes/${sessaoId}/frequencia`);
  const data = await res.json();
  const container = document.getElementById("resultadoFrequencia");
  const resumo = document.getElementById("resumoQuorum");
  if (!data.sucesso) {
    container.textContent = data.mensagem;
    resumo.textContent = "";
    return;
  }

  if (data.quorum) {
    const q = data.quorum;
    const situacao = q.quorumAtingido === null ? "" : (q.quorumAtingido ? " — QUÓRUM ATINGIDO ✅" : " — quórum não atingido");
    resumo.textContent = `${q.totalPresentes} de ${q.totalAtivos} esperados presentes (${q.percentualPresenca}%)` +
      (q.quorumMinimoPct != null ? `, mínimo exigido ${q.quorumMinimoPct}%` : "") +
      (q.mensagemQuorum ? ` — ${q.mensagemQuorum}` : situacao);
  }

  // v2.2 — reforma/destituição que não bateu quórum (nem no 2º estágio) pode
  // ser reconvocada 1 única vez (Art. 21, II, "c") — só some da lista depois
  // que a nova convocação vinculada é criada (validado no back-end).
  const podeReconvocar = data.sessao && data.sessao.status === "ENCERRADA" &&
    data.sessao.quorumTipo === "REFORMA_DESTITUICAO" && !data.sessao.vinculadaSessaoId &&
    data.quorum && data.quorum.quorumAtingido === false;
  const botaoReconvocar = document.getElementById("botaoReconvocarAssembleia");
  if (botaoReconvocar) {
    botaoReconvocar.style.display = podeReconvocar ? "inline-block" : "none";
    if (podeReconvocar) {
      botaoReconvocar.onclick = () => reconvocarAssembleiaAcao(sessaoId, data.sessao.materias);
    }
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
  if (data.sucesso) verFrequencia(sessaoId, sessaoFrequenciaAberta.descricao);
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
  if (data.sucesso) verFrequencia(sessaoId, sessaoFrequenciaAberta.descricao);
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
  if (data.sucesso) verFrequencia(sessaoId, sessaoFrequenciaAberta.descricao);
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
  if (data.sucesso) verFrequencia(sessaoId, sessaoFrequenciaAberta.descricao);
}

// ---- SECRETARIA / ABA PESSOAS ----
// Fallback defensivo: se o catálogo de status ainda não existir no banco (migração
// 016 não rodou), o formulário continua usável com os status semeados.
const STATUS_DEFAULT = [
  { sigla: "ATIVO", nome: "ATIVO", ativa: true },
  { sigla: "LICENÇA", nome: "LICENÇA", ativa: true },
  { sigla: "INATIVO", nome: "INATIVO", ativa: true },
  { sigla: "DESLIGADO", nome: "DESLIGADO", ativa: true }
];

async function carregarOpcoesFormPessoa() {
  const [resCong, resDepto, resCargo, resExt, resStatus, resSituacoes] = await Promise.all([
    fetchProtegido(`${API_BASE}/congregacoes`),
    fetch(`${API_BASE}/catalogos/departamentos`),
    fetch(`${API_BASE}/catalogos/cargosMinisteriais`),
    fetch(`${API_BASE}/catalogos/extensoes`),
    fetch(`${API_BASE}/catalogos/statuses`),
    fetch(`${API_BASE}/catalogos/situacoes`)
  ]);
  const congregacoes = await resCong.json();
  const departamentos = await resDepto.json();
  const cargos = await resCargo.json();
  const extensoes = await resExt.json();
  const statusesRaw = await resStatus.json();
  const statuses = Array.isArray(statusesRaw) ? statusesRaw : STATUS_DEFAULT;
  const situacoesRaw = await resSituacoes.json();
  const situacoes = Array.isArray(situacoesRaw) ? situacoesRaw : [];

  // Cacheados pra resolver nome (não só sigla/id) na aba Dados do Perfil.
  window._departamentosCache = departamentos;
  window._cargosCache = cargos;

  const selectCong = document.getElementById("pessoaCongregacao");
  selectCong.innerHTML = congregacoes.filter(c => c.ativa).map(c => `<option value="${c.congregacaoId}">${c.nome}</option>`).join("");

  const selectFiltroCong = document.getElementById("pessoasFiltroCongregacao");
  if (selectFiltroCong) {
    selectFiltroCong.innerHTML = `<option value="">Todas as congregações</option>` +
      congregacoes.map(c => `<option value="${c.congregacaoId}">${c.nome}</option>`).join("");
  }
  const selectFiltroSituacao = document.getElementById("pessoasFiltroSituacao");
  if (selectFiltroSituacao) {
    selectFiltroSituacao.innerHTML = `<option value="">Todas as situações</option>` +
      situacoes.filter(s => s.ativa !== false).map(s => `<option value="${s.sigla}">${s.nome}</option>`).join("");
  }

  const selectExt = document.getElementById("pessoaExtensao");
  const nomeCongPorId = Object.fromEntries(congregacoes.map(c => [String(c.congregacaoId), c.nome]));
  selectExt.innerHTML = `<option value="">Não se aplica (fica só na Congregação)</option>` +
    extensoes.filter(e => e.ativa).map(e => `<option value="${e.extensaoId}">${e.nome} (${nomeCongPorId[String(e.congregacaoMaeId)] || "?"})</option>`).join("");

  const selectDepto = document.getElementById("pessoaDepartamento");
  selectDepto.innerHTML = `<option value="">Não informado</option>` +
    departamentos.filter(d => d.ativo).map(d => `<option value="${d.departamentoId}">${d.nome}</option>`).join("");

  const selectCargo = document.getElementById("pessoaCargoMinisterial");
  selectCargo.innerHTML = `<option value="">Não informado</option>` +
    cargos.filter(c => c.ativo).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map(c => `<option value="${c.sigla}">${c.nome}</option>`).join("");

  const selectStatus = document.getElementById("pessoaStatus");
  selectStatus.innerHTML = statuses
    .filter(s => s.ativa !== false)
    .map(s => `<option value="${s.sigla}">${s.nome}</option>`).join("");
}

async function salvarPessoa() {
  const membroId = document.getElementById("pessoaMatricula").value;
  const nome = document.getElementById("pessoaNome").value;
  const congregacaoId = document.getElementById("pessoaCongregacao").value;
  const status = document.getElementById("pessoaStatus").value;
  const dataNascimento = document.getElementById("pessoaDataNascimento").value || null;
  const dataAdmissao = document.getElementById("pessoaDataAdmissao").value || null;
  const formaAdmissao = document.getElementById("pessoaFormaAdmissao").value || null;
  const dataBatismo = document.getElementById("pessoaDataBatismo").value || null;
  const origem = document.getElementById("pessoaOrigem").value.trim() || null;
  const igrejaAnterior = document.getElementById("pessoaIgrejaAnterior").value.trim() || null;
  const dataRitoRecebimento = document.getElementById("pessoaDataRitoRecebimento").value || null;
  const nomeLidoRito = document.getElementById("pessoaNomeLidoRito").value.trim() || null;
  const ministranteRito = document.getElementById("pessoaMinistranteRito").value.trim() || null;
  const situacaoMembro = document.getElementById("pessoaSituacao").value;
  const estadoCivil = document.getElementById("pessoaEstadoCivil").value || null;
  const dataAfastamento = document.getElementById("pessoaDataAfastamento").value || null;
  const motivoSaida = document.getElementById("pessoaMotivoSaida").value || null;
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
      membroId, nome, congregacaoId, status, dataNascimento, dataAdmissao, situacaoMembro, dizimistaFiel,
      departamentoId, cargoMinisterial, telefone, email, endereco, extensaoId,
      formaAdmissao, dataBatismo, origem, igrejaAnterior, dataRitoRecebimento, nomeLidoRito, ministranteRito,
      estadoCivil, dataAfastamento, motivoSaida
    })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (!data.sucesso) return;

  await carregarPessoas();

  // Editando dentro do Perfil (aba Editar) — mantém onde está, só atualiza o
  // cabeçalho. Cadastrando pessoa nova — limpa o formulário e oferece o Perfil.
  const emPerfil = document.getElementById("subPessoasPerfil").style.display !== "none";
  if (emPerfil) {
    const pessoa = (window._pessoasCache || []).find(p => p.membroId === Number(membroId));
    if (pessoa) {
      document.getElementById("perfilPessoaNome").textContent = pessoa.nome;
      document.getElementById("perfilPessoaSubtitulo").textContent = `Matrícula ${pessoa.membroId} · ${pessoa.congregacao || "sem congregação"}`;
    }
  } else {
    const idSalvo = Number(membroId);
    const mensagemSucesso = data.mensagem;
    limparFormPessoa(); // limpa inclusive resultadoPessoa/linkPerfilAposCadastro — restaura os dois abaixo
    msg.textContent = mensagemSucesso;
    document.getElementById("linkPerfilAposCadastro").innerHTML =
      `<button class="btn-link" onclick="abrirPerfilPessoa(${idSalvo})">→ Ver perfil desta pessoa</button>`;
  }
}

// ---- NAVEGAÇÃO DA ABA PESSOAS (v1.10 — submenu Cadastrar/Buscar + Perfil) ----

let subAbaPessoasAtual = "cadastrar";

function limparFormPessoa() {
  ["pessoaMatricula", "pessoaNome", "pessoaOrigem", "pessoaIgrejaAnterior", "pessoaNomeLidoRito",
    "pessoaMinistranteRito", "pessoaTelefone", "pessoaEmail", "pessoaEndereco"].forEach(id => {
    document.getElementById(id).value = "";
  });
  ["pessoaDataNascimento", "pessoaDataAdmissao", "pessoaDataBatismo", "pessoaDataRitoRecebimento",
    "pessoaDataAfastamento"].forEach(id => { document.getElementById(id).value = ""; });
  document.getElementById("pessoaCargoMinisterial").value = "";
  document.getElementById("pessoaCongregacao").selectedIndex = 0;
  document.getElementById("pessoaDepartamento").value = "";
  document.getElementById("pessoaExtensao").value = "";
  document.getElementById("pessoaStatus").selectedIndex = 0;
  document.getElementById("pessoaFormaAdmissao").value = "";
  document.getElementById("pessoaSituacao").value = "EM_COMUNHAO";
  document.getElementById("pessoaEstadoCivil").value = "";
  document.getElementById("pessoaDizimista").value = "";
  document.getElementById("pessoaMotivoSaida").value = "";
  document.getElementById("resultadoPessoa").textContent = "";
  document.getElementById("linkPerfilAposCadastro").innerHTML = "";
}

// O <form> de cadastro/edição é um único elemento no DOM — move (não clona) entre
// o slot de "Cadastrar" e o slot de "Editar" (dentro do Perfil) conforme o
// contexto, pra não duplicar ~25 campos com ids repetidos.
function moverFormPessoaPara(slotId) {
  const bloco = document.getElementById("blocoFormPessoa");
  bloco.style.display = "block";
  document.getElementById(slotId).appendChild(bloco);
}

const TITULOS_SUB_PESSOAS = { cadastrar: "Cadastrar Pessoa", buscar: "Buscar Pessoas", aprovacoes: "Fila de Aprovações" };

function mostrarSubAbaPessoas(sub) {
  subAbaPessoasAtual = sub;
  document.getElementById("subPessoasCadastrar").style.display = sub === "cadastrar" ? "block" : "none";
  document.getElementById("subPessoasBuscar").style.display = sub === "buscar" ? "block" : "none";
  document.getElementById("subPessoasAprovacoes").style.display = sub === "aprovacoes" ? "block" : "none";
  document.getElementById("subPessoasPerfil").style.display = "none";
  document.getElementById("btnSubPessoasCadastrar").classList.toggle("ativo", sub === "cadastrar");
  document.getElementById("btnSubPessoasBuscar").classList.toggle("ativo", sub === "buscar");
  document.getElementById("btnSubPessoasAprovacoes").classList.toggle("ativo", sub === "aprovacoes");
  document.getElementById("tituloModulo").textContent = `Pessoas — ${TITULOS_SUB_PESSOAS[sub]}`;
  if (sub === "cadastrar") {
    moverFormPessoaPara("slotFormPessoaCadastrar");
    limparFormPessoa();
  }
  if (sub === "aprovacoes") carregarFilaAprovacoes();
}

function voltarBuscaPessoas() {
  mostrarSubAbaPessoas("buscar");
}

function abrirPerfilPessoa(membroId) {
  const pessoa = (window._pessoasCache || []).find(p => p.membroId === membroId);
  if (!pessoa) return;

  // Mesma pessoa alimenta todas as abas do Perfil — substitui os `_membroXAtual`
  // soltos que cada bloco (Foto/Histórico/Casamentos/Licença/Vínculos) já usava.
  window._membroPerfilAtual = membroId;
  window._membroFotoAtual = membroId;
  window._membroHistoricoAtual = membroId;
  window._membroCasamentosAtual = membroId;
  window._membroLicencasAtual = membroId;
  window._membroFamiliaAtual = membroId;

  document.getElementById("subPessoasCadastrar").style.display = "none";
  document.getElementById("subPessoasBuscar").style.display = "none";
  document.getElementById("subPessoasPerfil").style.display = "block";
  document.getElementById("btnSubPessoasCadastrar").classList.remove("ativo");
  document.getElementById("btnSubPessoasBuscar").classList.add("ativo");
  document.getElementById("perfilPessoaNome").textContent = pessoa.nome;
  document.getElementById("perfilPessoaSubtitulo").textContent = `Matrícula ${pessoa.membroId} · ${pessoa.congregacao || "sem congregação"}`;
  document.getElementById("btnDesligarPerfil").style.display = pessoa.status === "DESLIGADO" ? "none" : "inline-block";
  document.getElementById("tituloModulo").textContent = `Pessoas — Perfil de ${pessoa.nome}`;
  mostrarAbaPerfil("dados");
}

const ABAS_PERFIL = ["dados", "editar", "historico", "foto", "casamentos", "licenca", "vinculos"];

function mostrarAbaPerfil(aba) {
  const membroId = window._membroPerfilAtual;
  ABAS_PERFIL.forEach(a => {
    document.getElementById(`tabPerfil${capitalize(a)}`).style.display = a === aba ? "block" : "none";
    document.getElementById(`btnTabPerfil${capitalize(a)}`).classList.toggle("ativo", a === aba);
  });
  if (aba === "dados") renderizarDadosPerfil(membroId);
  if (aba === "editar") {
    moverFormPessoaPara("slotFormPessoaEditar");
    document.getElementById("linkPerfilAposCadastro").innerHTML = "";
    document.getElementById("resultadoPessoa").textContent = "";
    editarPessoa(membroId);
  }
  if (aba === "historico") carregarHistoricoMembro(membroId);
  if (aba === "foto") carregarAbaFoto(membroId);
  if (aba === "casamentos") carregarCasamentos(membroId);
  if (aba === "licenca") carregarLicencasCandidatura(membroId);
  if (aba === "vinculos") carregarAbaVinculos(membroId);
}

function nomeDepartamentoPorId(id) {
  if (id == null) return null;
  const d = (window._departamentosCache || []).find(x => String(x.departamentoId) === String(id));
  return d ? d.nome : null;
}
function nomeCargoPorSigla(sigla) {
  if (!sigla) return null;
  const c = (window._cargosCache || []).find(x => x.sigla === sigla);
  return c ? c.nome : sigla;
}
const ROTULO_ESTADO_CIVIL = { SOLTEIRO: "Solteiro(a)", CASADO: "Casado(a)", VIUVO: "Viúvo(a)", DIVORCIADO: "Divorciado(a)", UNIAO_ESTAVEL: "União Estável" };

// Leitura formatada de tudo que o sistema tem da pessoa — reaproveita
// linhaLgpd/formatarValorLgpd (criadas pra "Meus Dados" LGPD): rótulo em
// português, datas formatadas, "-" no lugar de null. Nada de JSON, nada de
// coluna de banco aparecendo em tela.
function renderizarDadosPerfil(membroId) {
  const p = (window._pessoasCache || []).find(x => x.membroId === membroId);
  const container = document.getElementById("tabPerfilDados");
  if (!p) { container.innerHTML = "<p class='subtitle'>Pessoa não encontrada.</p>"; return; }

  const saidaHtml = (p.status === "DESLIGADO" || p.status === "FALECIDO" || p.motivoSaida) ? `
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Perda de Membresia</h4>
      ${linhaLgpd("Data do Afastamento", p.dataAfastamento, "data")}
      ${linhaLgpd("Data da Saída", p.dataSaida, "data")}
      ${linhaLgpd("Causa da Saída", p.motivoSaida)}
    </div>` : "";

  container.innerHTML = `
    <div class="cartao-perfil">
      ${p.fotoUrl ? `<img src="${p.fotoUrl}" alt="Foto" style="max-width:120px;border-radius:8px;margin-bottom:8px;" />` : ""}
      ${linhaLgpd("Nome", p.nome)}
      ${linhaLgpd("Congregação", p.congregacao)}
      ${linhaLgpd("Extensão da Tenda", p.extensao)}
      ${linhaLgpd("Status", p.status)}
      ${linhaLgpd("Situação", p.situacaoMembro)}
      ${linhaLgpd("Categoria", p.capacidade && p.capacidade.categoria)}
      ${linhaLgpd("Data de Nascimento", p.dataNascimento, "data")}
      ${linhaLgpd("Data de Admissão", p.dataAdmissao, "data")}
      ${linhaLgpd("Forma de Admissão", labelFormaAdmissao(p.formaAdmissao))}
      ${linhaLgpd("Origem/Procedência", p.origem)}
      ${linhaLgpd("Igreja Anterior", p.igrejaAnterior)}
      ${linhaLgpd("Data do Batismo", p.dataBatismo, "data")}
      ${linhaLgpd("Data do Rito de Recebimento", p.dataRitoRecebimento, "data")}
      ${linhaLgpd("Nome Lido no Rito", p.nomeLidoRito)}
      ${linhaLgpd("Ministrante do Rito", p.ministranteRito)}
      ${linhaLgpd("Estado Civil", ROTULO_ESTADO_CIVIL[p.estadoCivil])}
      ${linhaLgpd("Telefone", p.telefone)}
      ${linhaLgpd("E-mail", p.email)}
      ${linhaLgpd("Endereço", p.endereco)}
    </div>
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Dados Ministeriais</h4>
      ${linhaLgpd("Função", p.funcao)}
      ${linhaLgpd("Cargo Ministerial", nomeCargoPorSigla(p.cargoMinisterial))}
      ${linhaLgpd("Departamento", nomeDepartamentoPorId(p.departamentoId))}
      ${linhaLgpd("Dizimista Fiel", p.dizimistaFiel, "bit")}
    </div>
    ${saidaHtml}`;
}

// Substitui a antiga verFotoMembro() — mesma lógica, só sem controlar
// mostrar/esconder bloco nem rolar tela (isso agora é mostrarAbaPerfil()).
function carregarAbaFoto(membroId) {
  const pessoa = (window._pessoasCache || []).find(p => p.membroId === membroId);
  document.getElementById("resultadoFotoMembro").textContent = "";
  const preview = document.getElementById("fotoMembroPreview");
  preview.innerHTML = pessoa && pessoa.fotoUrl
    ? `<img src="${pessoa.fotoUrl}" alt="Foto" style="max-width:160px;border-radius:8px;" />`
    : "<span class='subtitle'>Sem foto cadastrada.</span>";

  fetch(`${API_BASE}/lgpd/consentimento/${membroId}`).then(r => r.json()).then(data => {
    const fotoConsentimento = (data.consentimentos || []).find(c => c.tipo === "FOTO");
    const statusEl = document.getElementById("fotoMembroStatusConsentimento");
    statusEl.textContent = fotoConsentimento && fotoConsentimento.concedido
      ? `✅ Consentimento de Foto concedido em ${fotoConsentimento.dataRegistro}.`
      : "⚠️ Sem consentimento de Foto concedido — o upload será bloqueado até conceder.";
  });
}

// Substitui a antiga editarPessoa()'s auto-show de vínculos — agora é sua
// própria aba, carregada só quando clicada.
function carregarAbaVinculos(membroId) {
  carregarOpcoesTipoVinculo();
  carregarVinculosFamiliares(membroId);
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
  const congFiltro = document.getElementById("pessoasFiltroCongregacao")?.value || "";
  const situacaoFiltro = document.getElementById("pessoasFiltroSituacao")?.value || "";
  const todas = window._pessoasCache || [];
  pessoasFiltradas = todas.filter(p => {
    const nomeOk = !busca || p.nome.toLowerCase().includes(busca) || String(p.membroId).includes(busca);
    const catOk = !catFiltro || (p.capacidade && p.capacidade.categoria === catFiltro);
    const congOk = !congFiltro || String(p.congregacaoId) === congFiltro;
    const situacaoOk = !situacaoFiltro || p.situacaoMembro === situacaoFiltro;
    return nomeOk && catOk && congOk && situacaoOk;
  });
  paginaAtualPessoas = 1;
  renderizarPessoas();
}

// ---- IMPORTAÇÃO/EXPORTAÇÃO DE PESSOAS (v1.8) ----

function baixarModeloPessoas() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Matrícula", "Nome", "Situação"],
    [15, "Maria da Silva", "EM_COMUNHAO"]
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Modelo");
  XLSX.writeFile(wb, "modelo-importacao-pessoas.xlsx");
}

// Levenshtein normalizado (0 a 1, 1 = idênticos) — sem dependência nova, só pra
// sinalizar possível duplicata por nome parecido (ex: erro de digitação) mesmo
// com matrícula diferente. Não bloqueia nada sozinho, só marca pra revisão.
function similaridadeNomes(a, b) {
  const s1 = (a || "").trim().toLowerCase();
  const s2 = (b || "").trim().toLowerCase();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const m = s1.length, n = s2.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = s1[i - 1] === s2[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const distancia = dp[m][n];
  return 1 - distancia / Math.max(m, n);
}

let importacaoPessoasLinhas = [];

async function prepararImportacaoPessoas() {
  const input = document.getElementById("arquivoExcelPessoas");
  const msg = document.getElementById("resultadoImportacaoPessoas");
  const arquivo = input.files[0];
  if (!arquivo) {
    msg.textContent = "Selecione um arquivo .xlsx antes de importar.";
    return;
  }

  const buffer = await arquivo.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const primeiraAba = workbook.SheetNames[0];
  const linhasBrutas = XLSX.utils.sheet_to_json(workbook.Sheets[primeiraAba], { defval: "" });

  const existentes = window._pessoasCache || [];

  const linhas = linhasBrutas
    .map(linha => {
      const chaves = Object.keys(linha);
      const chaveMatricula = chaves.find(k => /matr[ií]cula/i.test(k));
      const chaveNome = chaves.find(k => /nome/i.test(k));
      const chaveSituacao = chaves.find(k => /situa[cç][aã]o/i.test(k));
      return {
        membroId: chaveMatricula ? Number(linha[chaveMatricula]) : null,
        nome: chaveNome ? String(linha[chaveNome]).trim() : "",
        situacaoMembro: chaveSituacao ? String(linha[chaveSituacao]).trim() : ""
      };
    })
    .filter(l => l.membroId && l.nome)
    .map(l => {
      const duplicataMatricula = existentes.find(p => p.membroId === l.membroId);
      if (duplicataMatricula) {
        return Object.assign({}, l, {
          status: "DUPLICATA_MATRICULA",
          conflito: duplicataMatricula,
          decisao: "MANTER" // "MANTER" (ignora a linha da planilha) ou "ATUALIZAR"
        });
      }
      let melhorSimilaridade = 0;
      let melhorMatch = null;
      for (const p of existentes) {
        const sim = similaridadeNomes(l.nome, p.nome);
        if (sim > melhorSimilaridade) { melhorSimilaridade = sim; melhorMatch = p; }
      }
      if (melhorSimilaridade >= 0.9) {
        return Object.assign({}, l, {
          status: "POSSIVEL_DUPLICATA_NOME",
          conflito: melhorMatch,
          similaridade: melhorSimilaridade,
          decisao: "IGNORAR" // "IGNORAR" ou "IMPORTAR"
        });
      }
      return Object.assign({}, l, { status: "NOVO", decisao: "IMPORTAR" });
    });

  if (linhas.length === 0) {
    msg.textContent = "Não encontrei colunas de Matrícula e Nome na planilha.";
    return;
  }

  importacaoPessoasLinhas = linhas;
  msg.textContent = "";
  abrirModalRevisaoImportacaoPessoas();
}

function abrirModalRevisaoImportacaoPessoas() {
  const caixa = document.getElementById("modalCaixa");
  const linhasHtml = importacaoPessoasLinhas.map((l, i) => {
    if (l.status === "DUPLICATA_MATRICULA") {
      return `<tr>
        <td>${l.membroId}</td><td>${l.nome}</td><td>${l.situacaoMembro || "-"}</td>
        <td>Matrícula já existe: <strong>${l.conflito.nome}</strong></td>
        <td>
          <select onchange="importacaoPessoasLinhas[${i}].decisao = this.value">
            <option value="MANTER" ${l.decisao === "MANTER" ? "selected" : ""}>Manter o que já está (ignorar)</option>
            <option value="ATUALIZAR" ${l.decisao === "ATUALIZAR" ? "selected" : ""}>Atualizar pessoa existente</option>
          </select>
        </td>
      </tr>`;
    }
    if (l.status === "POSSIVEL_DUPLICATA_NOME") {
      return `<tr>
        <td>${l.membroId}</td><td>${l.nome}</td><td>${l.situacaoMembro || "-"}</td>
        <td>Nome ${Math.round(l.similaridade * 100)}% parecido com <strong>${l.conflito.nome}</strong> (matrícula ${l.conflito.membroId})</td>
        <td>
          <select onchange="importacaoPessoasLinhas[${i}].decisao = this.value">
            <option value="IGNORAR" ${l.decisao === "IGNORAR" ? "selected" : ""}>Ignorar esta linha</option>
            <option value="IMPORTAR" ${l.decisao === "IMPORTAR" ? "selected" : ""}>Importar mesmo assim (é pessoa nova)</option>
          </select>
        </td>
      </tr>`;
    }
    return `<tr>
      <td>${l.membroId}</td><td>${l.nome}</td><td>${l.situacaoMembro || "-"}</td>
      <td>Novo</td><td>-</td>
    </tr>`;
  }).join("");

  caixa.innerHTML = `
    <h3>Revisar Importação (${importacaoPessoasLinhas.length} linha(s))</h3>
    <p class="subtitle">Confira as linhas sinalizadas antes de confirmar. Linhas "Novo" já estão marcadas pra importar.</p>
    <div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr>
      <th>Matrícula</th><th>Nome</th><th>Situação</th><th>Conflito</th><th>Decisão</th>
    </tr></thead><tbody>${linhasHtml}</tbody></table></div>
    <div class="modal-acoes">
      <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
      <button class="btn-confirmar" id="modalConfirmar">Confirmar Importação</button>
    </div>`;
  document.getElementById("modalOverlay").classList.remove("escondido");
  document.getElementById("modalConfirmar").onclick = () => confirmarImportacaoPessoas();
  document.getElementById("modalCancelar").onclick = () => { fecharModal(); importacaoPessoasLinhas = []; };
}

async function confirmarImportacaoPessoas() {
  const payload = importacaoPessoasLinhas
    .filter(l => l.decisao === "IMPORTAR" || l.decisao === "ATUALIZAR")
    .map(l => ({
      membroId: l.membroId,
      nome: l.nome,
      situacaoMembro: l.situacaoMembro || null,
      sobrescrever: l.status === "DUPLICATA_MATRICULA" && l.decisao === "ATUALIZAR"
    }));

  fecharModal();
  const msg = document.getElementById("resultadoImportacaoPessoas");
  if (payload.length === 0) {
    msg.textContent = "Nenhuma linha selecionada pra importar.";
    importacaoPessoasLinhas = [];
    return;
  }

  const res = await fetchProtegido(`${API_BASE}/pessoas/importar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ linhas: payload })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.sucesso
    ? `Criados: ${data.resumo.criados} · Atualizados: ${data.resumo.atualizados} · Ignorados: ${data.resumo.ignorados}`
    : "";
  document.getElementById("arquivoExcelPessoas").value = "";
  importacaoPessoasLinhas = [];
  if (data.sucesso) carregarPessoas();
}

const COLUNAS_EXPORT_PESSOAS = [
  { chave: "membroId", rotulo: "Matrícula", padrao: true },
  { chave: "nome", rotulo: "Nome", padrao: true },
  { chave: "idade", rotulo: "Idade", padrao: false, valor: p => idadeDe(p.dataNascimento) ?? "" },
  { chave: "categoria", rotulo: "Categoria", padrao: false, valor: p => (p.capacidade && p.capacidade.categoria) || "" },
  { chave: "formaAdmissao", rotulo: "Forma de Admissão", padrao: false, valor: p => labelFormaAdmissao(p.formaAdmissao) },
  { chave: "funcao", rotulo: "Função", padrao: false },
  { chave: "cargoMinisterial", rotulo: "Cargo Ministerial", padrao: false },
  { chave: "congregacao", rotulo: "Congregação", padrao: true },
  { chave: "status", rotulo: "Status", padrao: true },
  { chave: "situacaoMembro", rotulo: "Situação", padrao: true },
  { chave: "telefone", rotulo: "Telefone", padrao: false },
  { chave: "email", rotulo: "E-mail", padrao: false },
  { chave: "endereco", rotulo: "Endereço", padrao: false },
  { chave: "dataNascimento", rotulo: "Data de Nascimento", padrao: false },
  { chave: "dataAdmissao", rotulo: "Data de Admissão", padrao: false }
];

function abrirModalExportarPessoas() {
  const caixa = document.getElementById("modalCaixa");
  const checkboxesHtml = COLUNAS_EXPORT_PESSOAS.map(c => `
    <label style="display:flex;align-items:center;gap:6px;margin:4px 0;">
      <input type="checkbox" id="exportCol_${c.chave}" ${c.padrao ? "checked" : ""} /> ${c.rotulo}
    </label>`).join("");

  caixa.innerHTML = `
    <h3>Exportar Pessoas (${pessoasFiltradas.length} registro(s) na lista filtrada)</h3>
    <p class="subtitle">Escolha as colunas que devem entrar na planilha.</p>
    <div style="max-height:300px;overflow-y:auto;">${checkboxesHtml}</div>
    <div class="modal-acoes">
      <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
      <button class="btn-confirmar" id="modalConfirmar">📤 Gerar Planilha</button>
    </div>`;
  document.getElementById("modalOverlay").classList.remove("escondido");
  document.getElementById("modalConfirmar").onclick = () => exportarPessoasAcao();
  document.getElementById("modalCancelar").onclick = () => fecharModal();
}

function exportarPessoasAcao() {
  const colunasSelecionadas = COLUNAS_EXPORT_PESSOAS.filter(c => document.getElementById(`exportCol_${c.chave}`).checked);
  if (colunasSelecionadas.length === 0) {
    mostrarToast("Selecione ao menos uma coluna.", "erro");
    return;
  }

  const linhas = pessoasFiltradas.map(p => {
    const linha = {};
    colunasSelecionadas.forEach(c => {
      linha[c.rotulo] = c.valor ? c.valor(p) : (p[c.chave] ?? "");
    });
    return linha;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(linhas);
  XLSX.utils.book_append_sheet(wb, ws, "Pessoas");
  XLSX.writeFile(wb, "rol-de-membros.xlsx");
  fecharModal();
}

function labelFormaAdmissao(codigo) {
  const mapa = {
    BATISMO: "Batismo",
    CARTA_MUDANCA: "Carta de Mudança",
    RECONCILIACAO: "Reconciliação",
    ACLAMACAO: "Aclamação"
  };
  return mapa[codigo] || "-";
}

function renderizarPessoas() {
  const container = document.getElementById("resultadoListaPessoas");
  const total = pessoasFiltradas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / TAM_PAGINA));
  if (paginaAtualPessoas > totalPaginas) paginaAtualPessoas = totalPaginas;
  const inicio = (paginaAtualPessoas - 1) * TAM_PAGINA;
  const pagina = pessoasFiltradas.slice(inicio, inicio + TAM_PAGINA);

  // Tabela enxuta de propósito (v1.10) — o resto (idade, categoria, forma de
  // admissão, função, cargo ministerial...) mora no Perfil, aba Dados. Uma
  // pessoa por tela não pode quebrar o notebook por causa de coluna demais.
  // Miniatura da foto direto na lista (pedido explícito) — assim dá pra ver de
  // várias pessoas de uma vez, sem precisar entrar perfil por perfil.
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th></th><th>Matrícula</th><th>Nome</th><th>Congregação</th><th>Status</th><th>Situação</th><th class="acoes-inline"></th>
  </tr></thead><tbody>`;

  pagina.forEach(p => {
    const miniatura = p.fotoUrl
      ? `<img src="${p.fotoUrl}" alt="Foto de ${p.nome}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;display:block;" />`
      : `<span style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#e5e5e5;color:#888;font-size:0.75rem;">?</span>`;
    html += `<tr>
      <td>${miniatura}</td>
      <td>${p.membroId}</td>
      <td>${p.nome}</td>
      <td>${p.congregacao || "-"}</td>
      <td>${badgeStatusPessoa(p.status)}</td>
      <td>${p.situacaoMembro || "-"}</td>
      <td class="acoes-inline">
        <button class="btn-link" onclick="abrirPerfilPessoa(${p.membroId})">👁️ Ver Perfil</button>
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
  document.getElementById("pessoaCongregacao").value = pessoa.congregacaoId != null ? String(pessoa.congregacaoId) : "";
  document.getElementById("pessoaDataNascimento").value = pessoa.dataNascimento || "";
  document.getElementById("pessoaDataAdmissao").value = pessoa.dataAdmissao || "";
  document.getElementById("pessoaFormaAdmissao").value = pessoa.formaAdmissao || "";
  document.getElementById("pessoaDataBatismo").value = pessoa.dataBatismo || "";
  document.getElementById("pessoaOrigem").value = pessoa.origem || "";
  document.getElementById("pessoaIgrejaAnterior").value = pessoa.igrejaAnterior || "";
  document.getElementById("pessoaDataRitoRecebimento").value = pessoa.dataRitoRecebimento || "";
  document.getElementById("pessoaNomeLidoRito").value = pessoa.nomeLidoRito || "";
  document.getElementById("pessoaMinistranteRito").value = pessoa.ministranteRito || "";
  document.getElementById("pessoaSituacao").value = pessoa.situacaoMembro || "EM_COMUNHAO";
  document.getElementById("pessoaEstadoCivil").value = pessoa.estadoCivil || "";
  document.getElementById("pessoaDataAfastamento").value = pessoa.dataAfastamento || "";
  document.getElementById("pessoaMotivoSaida").value = pessoa.motivoSaida || "";
  document.getElementById("pessoaDizimista").value = pessoa.dizimistaFiel == null ? "" : String(pessoa.dizimistaFiel);
  document.getElementById("pessoaDepartamento").value = pessoa.departamentoId != null ? String(pessoa.departamentoId) : "";
  document.getElementById("pessoaCargoMinisterial").value = pessoa.cargoMinisterial || "";
  document.getElementById("pessoaTelefone").value = pessoa.telefone || "";
  document.getElementById("pessoaEmail").value = pessoa.email || "";
  document.getElementById("pessoaEndereco").value = pessoa.endereco || "";
  document.getElementById("pessoaExtensao").value = pessoa.extensaoId != null ? String(pessoa.extensaoId) : "";
}

async function desligarPessoa(membroId) {
  if (!(await confirmarAcao("Confirma desligar esta pessoa? Ela deixa de ser ATIVA, mas o histórico continua.", "Desligar"))) return;

  const res = await fetchProtegido(`${API_BASE}/pessoas/${membroId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) await carregarPessoas();
  return data.sucesso;
}

async function desligarPessoaPerfilAcao() {
  const membroId = window._membroPerfilAtual;
  if (!membroId) return;
  const ok = await desligarPessoa(membroId);
  if (ok) abrirPerfilPessoa(membroId);
}

// ---- CARTAS DE TRÂNSITO (v1.4 — Reg. Art. 131) ----
const ROTULO_CARTA = { RECOMENDACAO: "Recomendação", MUDANCA: "Mudança", ATESTADO_SUPLETIVO: "Atestado Supletivo" };

let minhasCartasCache = [];
async function carregarMinhasCartas() {
  const caixa = document.getElementById("cxMinhasCartas");
  if (!caixa || !authMatricula) return;
  const res = await fetch(`${API_BASE}/cartas/minhas?matricula=${authMatricula}`);
  const cartas = await res.json();
  minhasCartasCache = Array.isArray(cartas) ? cartas : [];
  if (minhasCartasCache.length === 0) {
    caixa.innerHTML = `<p class="subtitle">Nenhuma carta solicitada ainda.</p>`;
    return;
  }
  caixa.innerHTML = `<table class="tabela-frequencia"><thead><tr><th>Tipo</th><th>Status</th><th>Pedido</th><th>Validade</th><th></th></tr></thead><tbody>` +
    minhasCartasCache.map(c => `<tr>
      <td>${ROTULO_CARTA[c.tipo] || c.tipo}</td>
      <td>${c.status}</td>
      <td>${c.dataPedido || "-"}</td>
      <td>${c.dataValidade || "-"}</td>
      <td class="acoes-inline">
        ${c.tipo === "MUDANCA" && c.status === "SOLICITADA" ? `<button class="btn-link" onclick="confirmarCartaPendente()">Confirmar</button>` : ""}
        ${c.status !== "SOLICITADA" ? `<button class="btn-link" onclick="imprimirMinhaCarta(${c.cartaId})">🖨️ Imprimir</button>` : ""}
      </td>
    </tr>`).join("") + "</tbody></table>";
}

async function solicitarCarta(tipo) {
  if (!authMatricula) { avisarResultado({ mensagem: "Faça login com sua matrícula." }); return; }
  const msg = document.getElementById("resultadoSolicitacaoCarta");
  const matricula = Number(authMatricula);
  const headers = { "Content-Type": "application/json" };

  if (tipo === "MUDANCA") {
    const ok = await confirmarAcao(
      "⚠️ A Carta de Mudança desliga você do rol de membros da IEADESPA. Após 30 dias, seus dados pessoais serão minimizados (mantendo apenas matrícula, nome, data de admissão e batismo — Reg. Art. 132 §2º). Confirma a solicitação?",
      "Confirmar desligamento"
    );
    if (!ok) return;
    await fetch(`${API_BASE}/cartas/minhas`, { method: "POST", headers, body: JSON.stringify({ matricula, tipo }) });
    const res2 = await fetch(`${API_BASE}/cartas/minhas`, { method: "POST", headers, body: JSON.stringify({ matricula, tipo, confirmar: true }) });
    const data2 = await res2.json();
    msg.textContent = data2.mensagem;
    carregarMinhasCartas();
    return;
  }

  const res = await fetch(`${API_BASE}/cartas/minhas`, { method: "POST", headers, body: JSON.stringify({ matricula, tipo }) });
  const data = await res.json();
  msg.textContent = data.mensagem;
  carregarMinhasCartas();
}

async function confirmarCartaPendente() {
  if (!authMatricula) return;
  const ok = await confirmarAcao("Confirmar esta solicitação de Carta de Mudança (declaração de ciência do desligamento)?", "Confirmar");
  if (!ok) return;
  const res = await fetch(`${API_BASE}/cartas/minhas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matricula: Number(authMatricula), tipo: "MUDANCA", confirmar: true })
  });
  const data = await res.json();
  avisarResultado(data);
  carregarMinhasCartas();
}
let cartasCache = [];
async function carregarCartas() {
  const res = await fetchProtegido(`${API_BASE}/cartas`);
  cartasCache = await res.json();
  renderizarCartas();
}

function renderizarCartas() {
  const container = document.getElementById("resultadoListaCartas");
  const cores = { SOLICITADA: "badge-licenca", CONFIRMADA: "badge-licenca", EMITIDA: "badge-ativo", CANCELADA: "badge-desligado", CONCLUIDA: "badge-inativo" };
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>ID</th><th>Membro</th><th>Tipo</th><th>Status</th><th>Destino</th><th>Pedido</th><th>Validade</th><th class="acoes-inline"></th>
  </tr></thead><tbody>`;
  cartasCache.forEach(c => {
    html += `<tr>
      <td>${c.cartaId}</td>
      <td>${c.nome} (${c.membroId})</td>
      <td>${ROTULO_CARTA[c.tipo] || c.tipo}</td>
      <td><span class="badge-status ${cores[c.status] || ""}">${c.status}</span></td>
      <td>${c.destino || "-"}</td>
      <td>${c.dataPedido || "-"}</td>
      <td>${c.dataValidade || "-"}</td>
      <td class="acoes-inline">
        ${["SOLICITADA", "CONFIRMADA"].includes(c.status) ? `<button class="btn-link" onclick="emitirCarta(${c.cartaId})">Emitir</button>` : ""}
        ${["SOLICITADA", "CONFIRMADA", "EMITIDA"].includes(c.status) ? `<button class="btn-link btn-link-perigo" onclick="cancelarCarta(${c.cartaId})">Cancelar</button>` : ""}
        <button class="btn-link" onclick="imprimirCarta(${c.cartaId})">🖨️ Imprimir</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function emitirCarta(cartaId) {
  const res = await fetchProtegido(`${API_BASE}/cartas/emitir`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cartaId }) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarCartas();
}

async function cancelarCarta(cartaId) {
  if (!(await confirmarAcao("Cancelar esta carta?", "Cancelar"))) return;
  const res = await fetchProtegido(`${API_BASE}/cartas/cancelar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cartaId }) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarCartas();
}

async function processarSaidasCartas() {
  const res = await fetchProtegido(`${API_BASE}/cartas/processar`, { method: "POST" });
  const data = await res.json();
  const el = document.getElementById("resultadoCartas");
  if (el && data && data.sucesso) el.textContent = data.mensagem;
  carregarCartas();
}

const LABEL_SITUACAO_CARTA = {
  EM_COMUNHAO: "Comunhão",
  SEM_COMUNHAO: "Paz",
  CONGREGADO: "Observação",
  NOVO_CONVERTIDO: "Observação"
};
const LABEL_ESTADO_CIVIL = {
  SOLTEIRO: "Solteiro(a)", CASADO: "Casado(a)", VIUVO: "Viúvo(a)",
  DIVORCIADO: "Divorciado(a)", UNIAO_ESTAVEL: "União Estável"
};
const LABEL_CARGO_MINISTERIAL = {
  AUXILIAR: "Auxiliar", MISSIONARIO: "Missionário(a)", DIACONO: "Diácono",
  PRESBITERO: "Presbítero", EVANGELISTA: "Evangelista", PASTOR: "Pastor"
};

// Marca "( )" -> "(X)" na opção escolhida, mantendo as demais em branco — mesmo
// espírito de múltipla escolha do modelo em papel usado nas congregações.
function marcarOpcao(rotulo, marcado) {
  return `(${marcado ? "X" : "&nbsp;"}) ${rotulo}`;
}

function imprimirCarta(cartaId) {
  const c = (cartasCache || []).find(x => x.cartaId === cartaId);
  if (c) renderizarImpressaoCarta(c);
}

function imprimirMinhaCarta(cartaId) {
  const c = (minhasCartasCache || []).find(x => x.cartaId === cartaId);
  if (c) renderizarImpressaoCarta(c);
}

function renderizarImpressaoCarta(c) {
  const rotulo = ROTULO_CARTA[c.tipo] || c.tipo;
  const ehCongregado = c.situacaoMembro === "CONGREGADO";
  const situacaoRotulo = LABEL_SITUACAO_CARTA[c.situacaoMembro] || "Comunhão";
  const hoje = new Date();
  const dataEmissaoFmt = c.dataEmissao ? c.dataEmissao.split("-").reverse().join("/") : `____ / ____ / ${hoje.getFullYear()}`;
  const w = window.open("", "_blank", "width=760,height=900");
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${rotulo}</title>
  <style>
    body{font-family:Georgia,serif;color:#111;padding:40px;}
    .carta{max-width:680px;margin:auto;}
    .cab{text-align:center;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:20px;}
    h1{font-size:17px;margin:0 0 4px;} h2{font-size:18px;margin:4px 0 20px;text-align:right;}
    .sub{font-size:12px;color:#555;} p{line-height:1.7;margin:8px 0;}
    .linha{display:flex;gap:24px;flex-wrap:wrap;margin:10px 0;}
    .linha span{white-space:nowrap;}
    .decl{font-style:italic;border:1px solid #999;padding:10px;margin:14px 0;font-size:14px;}
    .obs{border-top:1px solid #ccc;padding-top:8px;margin-top:16px;font-size:13px;}
    .rodape{margin-top:44px;display:flex;justify-content:space-around;font-size:12px;text-align:center;}
    .rodape div{border-top:1px solid #111;padding-top:4px;width:220px;}
    .validade{margin-top:20px;font-size:11px;color:#555;text-align:center;}
  </style></head><body><div class="carta">
    <div class="cab"><h1>IGREJA EVANGÉLICA ASSEMBLEIA DE DEUS</h1><div class="sub">Ministério do SETA em Parauapebas — PA · IEADESPA</div></div>
    <h2>${marcarOpcao("CARTA DE RECOMENDAÇÃO", c.tipo === "RECOMENDACAO")}${"&nbsp;&nbsp;"}${marcarOpcao("CARTA DE MUDANÇA", c.tipo === "MUDANCA")}${"&nbsp;&nbsp;"}${marcarOpcao("ATESTADO SUPLETIVO", c.tipo === "ATESTADO_SUPLETIVO")}</h2>
    <p>Parauapebas, PA, ${dataEmissaoFmt}.</p>
    <p>Saudações no SENHOR JESUS.</p>
    <p>Apresentamos à Igreja em <strong>${c.destino || "______________________"}</strong> o(a) portador(a) desta carta o(a) Sr(a). <strong>${c.nome}</strong> (Cartão de Membro nº ${c.membroId}).</p>
    <div class="linha"><span>${marcarOpcao("Membro", !ehCongregado)}</span><span>${marcarOpcao("Congregado", ehCongregado)}</span></div>
    <p>Nesta Igreja desde ${c.dataAdmissao ? c.dataAdmissao.split("-").reverse().join("/") : "____/____/______"}, por se achar em: <strong>${situacaoRotulo}</strong>.</p>
    <p>Nós o(a) recomendamos que recebais no Senhor, como usam os Santos.</p>
    <div class="linha">
      <span><strong>Função:</strong> ${c.funcao || "—"}</span>
      <span><strong>Cargo:</strong> ${LABEL_CARGO_MINISTERIAL[c.cargoMinisterial] || "—"}</span>
      <span><strong>Estado Civil:</strong> ${LABEL_ESTADO_CIVIL[c.estadoCivil] || "—"}</span>
    </div>
    ${c.declaracaoCiencia ? `<p class="decl">${c.declaracaoCiencia}</p>` : ""}
    ${(c.motivoSaida || c.destino) ? `<p class="obs"><strong>OBS:</strong> ${c.motivoSaida || ""}</p>` : ""}
    <div class="rodape"><div>Pastor Congregacional</div><div>Secretário Local(a)</div></div>
    <p class="validade">${c.dataValidade ? `VALIDADE: até ${c.dataValidade.split("-").reverse().join("/")}` : (c.tipo === "MUDANCA" ? "" : "VALIDADE: 30 dias a partir da data de emissão")}</p>
  </div></body></html>`);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 300);
}

// ---- Vínculos Familiares (seção dentro do cadastro de uma Pessoa) ----
// Núcleo mínimo (v0.2): cadastro do relacionamento em si. O cálculo de grau de
// parentesco por travessia nasce em v2.6/v3.1, quando tiver um consumidor de verdade.
async function carregarOpcoesTipoVinculo() {
  const select = document.getElementById("vinculoTipo");
  const res = await fetch(`${API_BASE}/catalogos/tiposVinculoFamiliar`);
  const tipos = await res.json();
  select.innerHTML = tipos.filter(t => t.ativo !== false).map(t => `<option value="${t.tipoVinculoId}">${t.rotuloDireto}</option>`).join("");
}

async function carregarVinculosFamiliares(membroId) {
  const container = document.getElementById("resultadoListaVinculosFamiliares");
  const res = await fetchProtegido(`${API_BASE}/vinculos-familiares?membroId=${membroId}`);
  const vinculos = await res.json();

  if (vinculos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum vínculo familiar cadastrado.</p>";
    return;
  }

  let html = `<table class="tabela-frequencia"><thead><tr><th>Parentesco</th><th>Pessoa</th><th></th></tr></thead><tbody>`;
  vinculos.forEach(v => {
    html += `<tr>
      <td>${v.rotulo}</td>
      <td>${v.outraPessoaNome} (${v.outraPessoaId})${v.outraPessoaEhResponsavel ? ' <span class="badge-status badge-ativo">Responsável Legal</span>' : ""}</td>
      <td class="acoes-inline"><button class="btn-link btn-link-perigo" onclick="removerVinculoFamiliar(${v.vinculoId})">Remover</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarVinculoFamiliar() {
  const membroId = window._membroFamiliaAtual;
  const tipoVinculoId = document.getElementById("vinculoTipo").value;
  const membroParenteId = document.getElementById("vinculoMatriculaParente").value;
  const responsavelLegal = document.getElementById("vinculoResponsavelLegal").checked;
  if (!membroId || !tipoVinculoId || !membroParenteId) {
    mostrarToast("Informe o tipo de vínculo e a matrícula da outra pessoa.", "erro");
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/vinculos-familiares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, membroParenteId, tipoVinculoId, responsavelLegal })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("vinculoMatriculaParente").value = "";
    document.getElementById("vinculoResponsavelLegal").checked = false;
    carregarVinculosFamiliares(membroId);
  }
}

async function removerVinculoFamiliar(vinculoId) {
  if (!(await confirmarAcao("Remover este vínculo familiar?", "Remover"))) return;
  const res = await fetchProtegido(`${API_BASE}/vinculos-familiares/${vinculoId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarVinculosFamiliares(window._membroFamiliaAtual);
}

// ---- Linha do Tempo do Membro (v1.6): agrega eventos já existentes + Marcos manuais ----
window._membroHistoricoAtual = null;
let marcosCacheAtual = [];

const ROTULO_TIPO_MARCO = { CONVERSAO: "Conversão", MINISTERIO_ANTERIOR: "Ministério/Igreja anterior", BATISMO_ESPIRITO_SANTO: "Batismo no Espírito Santo", OUTRO: "Outro" };

async function carregarHistoricoMembro(membroId) {
  const container = document.getElementById("resultadoHistoricoMembro");
  const [resHistorico, resMarcos] = await Promise.all([
    fetchProtegido(`${API_BASE}/pessoas/${membroId}/historico`),
    fetchProtegido(`${API_BASE}/marcos-membro?membroId=${membroId}`)
  ]);
  const historico = await resHistorico.json();
  const marcos = await resMarcos.json();
  marcosCacheAtual = Array.isArray(marcos) ? marcos : [];
  const eventos = historico.eventos || [];

  if (eventos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum evento registrado ainda.</p>";
    return;
  }

  container.innerHTML = `<ul class="linha-tempo">` + eventos.map(e => {
    const podeCorrigir = e.marcoId != null && authNivel === "GLOBAL";
    return `<li>
      <strong>${e.data || "data não informada"}</strong> — ${e.titulo}
      ${e.descricao ? `<br><span class="subtitle">${e.descricao}</span>` : ""}
      ${podeCorrigir ? ` <button class="btn-link" onclick="corrigirMarcoMembroAcao(${e.marcoId})">Corrigir</button>` : ""}
    </li>`;
  }).join("") + "</ul>";
}

async function registrarMarcoMembroAcao() {
  const membroId = window._membroHistoricoAtual;
  const tipo = document.getElementById("marcoTipo").value;
  const descricao = document.getElementById("marcoDescricao").value.trim();
  const dataMarco = document.getElementById("marcoData").value || null;
  const dataAproximada = document.getElementById("marcoDataAproximada").checked;
  const msg = document.getElementById("resultadoMarcoMembro");
  if (!membroId || !descricao) {
    msg.textContent = "Informe a descrição do marco.";
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/marcos-membro`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, tipo, descricao, dataMarco, dataAproximada })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("marcoDescricao").value = "";
    document.getElementById("marcoData").value = "";
    document.getElementById("marcoDataAproximada").checked = false;
    carregarHistoricoMembro(membroId);
  }
}

// Correção de um Marco já lançado — restrita a nível Global, sempre com
// justificativa (mesmo padrão de pedirAjustePrazo() do módulo de disciplina).
function pedirCorrecaoMarco(marco) {
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Corrigir marco: ${ROTULO_TIPO_MARCO[marco.tipo] || marco.tipo}</h3>
      <div class="input-group">
        <label>Descrição:</label>
        <input type="text" id="modalDescricao" value="${(marco.descricao || "").replace(/"/g, "&quot;")}" />
      </div>
      <div class="input-group">
        <label>Data:</label>
        <input type="date" id="modalData" value="${marco.dataMarco || ""}" />
      </div>
      <div class="input-group">
        <label>Justificativa (obrigatória — fica registrada na auditoria):</label>
        <textarea id="modalJustificativa" rows="3"></textarea>
      </div>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar" id="modalConfirmar">Corrigir</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    document.getElementById("modalConfirmar").onclick = () => {
      const descricao = document.getElementById("modalDescricao").value.trim();
      const dataMarco = document.getElementById("modalData").value || null;
      const justificativa = document.getElementById("modalJustificativa").value.trim();
      fecharModal();
      resolve({ descricao, dataMarco, justificativa });
    };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

async function corrigirMarcoMembroAcao(marcoId) {
  const marco = marcosCacheAtual.find(m => m.marcoId === marcoId);
  if (!marco) return;
  const dados = await pedirCorrecaoMarco(marco);
  if (!dados) return;
  if (!dados.justificativa) {
    mostrarToast("Justificativa é obrigatória para corrigir um marco.", "erro");
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/marcos-membro/${marcoId}/editar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados)
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarHistoricoMembro(window._membroHistoricoAtual);
}

// ---- Foto do Membro (v1.7) — consentimento é trava real, não registro paralelo ----
async function concederConsentimentoFotoAcao() {
  const membroId = window._membroFotoAtual;
  if (!membroId) return;
  const res = await fetch(`${API_BASE}/lgpd/consentimento/${membroId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo: "FOTO", concedido: true, baseLegal: "CONSENTIMENTO" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarAbaFoto(membroId);
}

// Recorte de foto (v1.10.1) — arrasta pra posicionar + zoom, sempre exporta um
// quadrado (JPEG). Sem lib nova: canvas puro, mesmo espírito "sem build step"
// do resto do front-end. Circular só na pré-visualização (guia pro rosto);
// o arquivo salvo é quadrado (mais compatível como avatar em qualquer lugar).
// Promise<{base64, mimeType}|null> — null se cancelou.
function abrirRecorteFoto(arquivo) {
  const TAMANHO_SAIDA = 480;
  const VIEW = 280;
  return new Promise((resolve) => {
    const leitor = new FileReader();
    leitor.onerror = () => {
      mostrarToast("Não consegui ler essa imagem. Tente outra foto.", "erro");
      resolve(null);
    };
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => {
        mostrarToast("Esse arquivo não é uma imagem válida (ou o formato não é suportado). Tente outra foto.", "erro");
        resolve(null);
      };
      img.onload = () => {
        const caixa = document.getElementById("modalCaixa");
        caixa.innerHTML = `
          <h3>Ajustar foto</h3>
          <p class="subtitle">Arraste pra posicionar e use o zoom pra focar no rosto — evite foto de corpo inteiro.</p>
          <div id="recorteArea" style="position:relative; width:${VIEW}px; height:${VIEW}px; margin:0 auto; overflow:hidden; border-radius:50%; border:3px solid var(--cor-secundaria); cursor:grab; touch-action:none;">
            <canvas id="recorteCanvas" width="${VIEW}" height="${VIEW}"></canvas>
          </div>
          <div class="input-group" style="margin-top:14px;">
            <label>Zoom:</label>
            <input type="range" id="recorteZoom" min="1" max="3" step="0.01" value="1" style="width:100%;" />
          </div>
          <div class="modal-acoes">
            <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
            <button class="btn-confirmar" id="modalConfirmar">✅ Usar esta foto</button>
          </div>`;
        document.getElementById("modalOverlay").classList.remove("escondido");

        const canvas = document.getElementById("recorteCanvas");
        const ctx = canvas.getContext("2d");
        const escalaBase = Math.max(VIEW / img.width, VIEW / img.height);
        let zoom = 1;
        let offsetX = 0, offsetY = 0;
        let arrastando = false, inicioX = 0, inicioY = 0;

        function desenhar() {
          const escala = escalaBase * zoom;
          const w = img.width * escala, h = img.height * escala;
          ctx.clearRect(0, 0, VIEW, VIEW);
          ctx.drawImage(img, VIEW / 2 - w / 2 + offsetX, VIEW / 2 - h / 2 + offsetY, w, h);
        }
        desenhar();

        const area = document.getElementById("recorteArea");
        const comecar = (x, y) => { arrastando = true; inicioX = x - offsetX; inicioY = y - offsetY; area.style.cursor = "grabbing"; };
        const mover = (x, y) => { if (arrastando) { offsetX = x - inicioX; offsetY = y - inicioY; desenhar(); } };
        const terminar = () => { arrastando = false; area.style.cursor = "grab"; };

        area.addEventListener("mousedown", e => comecar(e.offsetX, e.offsetY));
        area.addEventListener("mousemove", e => mover(e.offsetX, e.offsetY));
        window.addEventListener("mouseup", terminar);
        area.addEventListener("touchstart", e => {
          const t = e.touches[0], r = area.getBoundingClientRect();
          comecar(t.clientX - r.left, t.clientY - r.top);
        }, { passive: true });
        area.addEventListener("touchmove", e => {
          const t = e.touches[0], r = area.getBoundingClientRect();
          mover(t.clientX - r.left, t.clientY - r.top);
        }, { passive: true });
        area.addEventListener("touchend", terminar);

        document.getElementById("recorteZoom").oninput = e => { zoom = Number(e.target.value); desenhar(); };

        document.getElementById("modalConfirmar").onclick = () => {
          const saida = document.createElement("canvas");
          saida.width = TAMANHO_SAIDA;
          saida.height = TAMANHO_SAIDA;
          const fatorSaida = TAMANHO_SAIDA / VIEW;
          const escala = escalaBase * zoom * fatorSaida;
          const w = img.width * escala, h = img.height * escala;
          saida.getContext("2d").drawImage(
            img,
            TAMANHO_SAIDA / 2 - w / 2 + offsetX * fatorSaida,
            TAMANHO_SAIDA / 2 - h / 2 + offsetY * fatorSaida,
            w, h
          );
          const base64 = saida.toDataURL("image/jpeg", 0.9).split(",")[1];
          fecharModal();
          resolve({ base64, mimeType: "image/jpeg" });
        };
        document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}

async function enviarFotoMembroAcao() {
  const membroId = window._membroFotoAtual;
  const input = document.getElementById("fotoMembroArquivo");
  const msg = document.getElementById("resultadoFotoMembro");
  if (!membroId || !input.files[0]) {
    msg.textContent = "Escolha um arquivo de imagem.";
    return;
  }
  const recorte = await abrirRecorteFoto(input.files[0]);
  if (!recorte) return;
  const res = await fetchProtegido(`${API_BASE}/pessoas/${membroId}/foto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fotoBase64: recorte.base64, mimeType: recorte.mimeType })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    input.value = "";
    await carregarPessoas();
    carregarAbaFoto(membroId);
  }
}

// ---- CASAMENTOS (v1.9 — Reg. Art. 83) ----
const ROTULO_MODALIDADE_CASAMENTO = { CIVIL_E_RELIGIOSO: "Civil e Religioso", SOMENTE_RELIGIOSO: "Somente Religioso" };

async function carregarCasamentos(membroId) {
  const container = document.getElementById("resultadoListaCasamentos");
  const res = await fetchProtegido(`${API_BASE}/casamentos?membroId=${membroId}`);
  const casamentos = await res.json();
  if (!Array.isArray(casamentos) || casamentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum casamento registrado ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Cônjuge</th><th>Modalidade</th><th>Celebrante</th><th>Data</th><th>Cartório</th><th></th>
  </tr></thead><tbody>`;
  casamentos.forEach(c => {
    html += `<tr>
      <td>${c.nomeMembroConjuge || c.nomeConjuge || "-"}</td>
      <td>${ROTULO_MODALIDADE_CASAMENTO[c.modalidade] || c.modalidade}</td>
      <td>${c.celebrante || "-"}</td>
      <td>${c.dataCasamento || "-"}</td>
      <td>${c.registradoCartorio ? "✅ Sim" : "Não"}</td>
      <td><button class="btn-link btn-link-perigo" onclick="excluirCasamentoAcao(${c.casamentoId})">Excluir</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarCasamento() {
  const membroId = window._membroCasamentosAtual;
  const msg = document.getElementById("resultadoCasamento");
  if (!membroId) return;

  const membroConjugeId = document.getElementById("casamentoConjugeMatricula").value || null;
  const nomeConjuge = document.getElementById("casamentoConjugeNome").value.trim() || null;
  const celebrante = document.getElementById("casamentoCelebrante").value.trim() || null;
  const modalidade = document.getElementById("casamentoModalidade").value;
  const dataHabilitacaoCivil = document.getElementById("casamentoDataHabilitacao").value || null;
  const dataCasamento = document.getElementById("casamentoData").value;
  const registradoCartorio = document.getElementById("casamentoRegistradoCartorio").checked;

  if (!dataCasamento) { msg.textContent = "Informe a data do casamento."; return; }
  if (!membroConjugeId && !nomeConjuge) { msg.textContent = "Informe o cônjuge: matrícula ou nome."; return; }

  const res = await fetchProtegido(`${API_BASE}/casamentos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, membroConjugeId, nomeConjuge, celebrante, modalidade, dataHabilitacaoCivil, dataCasamento, registradoCartorio })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.aviso || "";
  if (data.sucesso) {
    document.getElementById("casamentoConjugeMatricula").value = "";
    document.getElementById("casamentoConjugeNome").value = "";
    document.getElementById("casamentoCelebrante").value = "";
    document.getElementById("casamentoDataHabilitacao").value = "";
    document.getElementById("casamentoData").value = "";
    document.getElementById("casamentoRegistradoCartorio").checked = false;
    carregarCasamentos(membroId);
  }
}

async function excluirCasamentoAcao(casamentoId) {
  if (!(await confirmarAcao("Confirma excluir este registro de casamento? (correção de lançamento)", "Excluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/casamentos/${casamentoId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarCasamentos(window._membroCasamentosAtual);
}

// ---- LICENÇA POR CANDIDATURA (v1.9 — Reg. Art. 157 §2º) ----
const ROTULO_STATUS_LICENCA = { EM_LICENCA: "Em licença", RETORNOU: "Retornou", NAO_RETORNOU: "Não retornou" };

async function carregarLicencasCandidatura(membroId) {
  const container = document.getElementById("resultadoListaLicencasCandidatura");
  const res = await fetchProtegido(`${API_BASE}/licencas-candidatura?membroId=${membroId}`);
  const licencas = await res.json();
  if (!Array.isArray(licencas) || licencas.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma licença por candidatura registrada ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Pleito</th><th>Início da Licença</th><th>Status</th><th></th>
  </tr></thead><tbody>`;
  licencas.forEach(l => {
    html += `<tr>
      <td>${l.dataPleito || "-"}</td>
      <td>${l.dataInicioLicenca || "-"}</td>
      <td>${ROTULO_STATUS_LICENCA[l.status] || l.status}</td>
      <td>${l.status === "EM_LICENCA" ? `<button class="btn-link" onclick="registrarRetornoLicencaAcao(${l.licencaId})">Registrar retorno</button>` : "-"}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarLicencaCandidatura() {
  const membroId = window._membroLicencasAtual;
  const msg = document.getElementById("resultadoLicencaCandidatura");
  if (!membroId) return;

  const dataPleito = document.getElementById("licencaDataPleito").value;
  if (!dataPleito) { msg.textContent = "Informe a data do pleito."; return; }

  if (!(await confirmarAcao("Confirma registrar a licença por candidatura? A pessoa perde Assentos/Liderança/Cargo até a Diretoria decidir o retorno.", "Registrar Licença"))) return;

  const res = await fetchProtegido(`${API_BASE}/licencas-candidatura`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, dataPleito })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("licencaDataPleito").value = "";
    carregarLicencasCandidatura(membroId);
    carregarPessoas();
  }
}

// Promise<boolean|null> — true = retornou, false = não retornou, null = cancelou.
function pedirDecisaoRetornoLicenca() {
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Registrar retorno da Licença por Candidatura</h3>
      <p class="subtitle">Decisão da Diretoria após o pleito. Se retornou, o status do membro volta pra ATIVO
        (Cargo/Assentos precisam ser reatribuídos manualmente). Se não retornou, o status do membro não muda
        sozinho — o próximo passo (ex: desligamento) fica por conta de quem está operando.</p>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar btn-perigo" id="modalNaoRetornou">Não retornou</button>
        <button class="btn-confirmar" id="modalRetornou">Retornou</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    document.getElementById("modalRetornou").onclick = () => { fecharModal(); resolve(true); };
    document.getElementById("modalNaoRetornou").onclick = () => { fecharModal(); resolve(false); };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

async function registrarRetornoLicencaAcao(licencaId) {
  const retornou = await pedirDecisaoRetornoLicenca();
  if (retornou === null) return;

  const res = await fetchProtegido(`${API_BASE}/licencas-candidatura/${licencaId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ retornou })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    carregarLicencasCandidatura(window._membroLicencasAtual);
    carregarPessoas();
  }
}

// ---- FILA DE APROVAÇÕES (v1.11 — pedidos de autoedição sujeitos a aprovação) ----
let filaAprovacoesCache = [];

async function carregarFilaAprovacoes() {
  const container = document.getElementById("resultadoFilaAprovacoes");
  const res = await fetchProtegido(`${API_BASE}/fila-aprovacoes`);
  const solicitacoes = await res.json();
  filaAprovacoesCache = Array.isArray(solicitacoes) ? solicitacoes : [];

  if (filaAprovacoesCache.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum pedido pendente no momento.</p>";
    return;
  }

  container.innerHTML = filaAprovacoesCache.map(s => `
    <div class="cartao-perfil" style="margin-bottom:16px;">
      <div class="barra-lista" style="justify-content:space-between;">
        <h4 style="margin:0; color: var(--cor-primaria);">${s.nome} (matrícula ${s.membroId}) — ${new Date(s.dataSolicitacao).toLocaleDateString("pt-BR")}</h4>
        <button class="btn-confirmar" style="width:auto;margin:0;" onclick="aprovarTodaSolicitacaoAcao(${s.solicitacaoId})">✅ Aprovar tudo</button>
      </div>
      <div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr>
        <th>Campo</th><th>Valor Atual</th><th>Valor Proposto</th><th></th>
      </tr></thead><tbody>
        ${s.campos.map(c => `<tr>
          <td>${c.rotulo}</td>
          <td>${c.valorAnterior || "-"}</td>
          <td><strong>${c.valorProposto}</strong></td>
          <td class="acoes-inline">
            <button class="btn-link" onclick="decidirCampoFilaAcao(${s.solicitacaoId}, ${c.campoId}, 'APROVADO')">Aprovar</button>
            <button class="btn-link btn-link-perigo" onclick="decidirCampoFilaAcao(${s.solicitacaoId}, ${c.campoId}, 'REJEITADO')">Rejeitar</button>
          </td>
        </tr>`).join("")}
      </tbody></table></div>
    </div>`).join("");
}

async function decidirCampoFilaAcao(solicitacaoId, campoId, decisao) {
  const res = await fetchProtegido(`${API_BASE}/fila-aprovacoes/${solicitacaoId}/decidir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decisoes: [{ campoId, decisao }] })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarFilaAprovacoes();
}

async function aprovarTodaSolicitacaoAcao(solicitacaoId) {
  if (!(await confirmarAcao("Aprovar todos os campos pendentes desta solicitação?", "Aprovar tudo"))) return;
  const solicitacao = filaAprovacoesCache.find(s => s.solicitacaoId === solicitacaoId);
  if (!solicitacao) return;
  const decisoes = solicitacao.campos.filter(c => c.status === "PENDENTE").map(c => ({ campoId: c.campoId, decisao: "APROVADO" }));
  const res = await fetchProtegido(`${API_BASE}/fila-aprovacoes/${solicitacaoId}/decidir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decisoes })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarFilaAprovacoes();
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

// ---- SECRETARIA / ABA PROCESSO DISCIPLINAR ----
// Núcleo mínimo (v0.2): abrir + julgar + ajustar prazo. Catálogo de infrações/
// penalidades e rito completo (citação, defesa, revelia, recurso) ficam pra FASE 3.
async function carregarOpcoesFormDisciplina() {
  const res = await fetch(`${API_BASE}/orgaos`);
  const orgaos = await res.json();
  document.getElementById("disciplinaOrgao").innerHTML = orgaos.map(o => `<option value="${o.orgaoId}">${o.sigla}</option>`).join("");
}

async function salvarProcessoDisciplinar() {
  const membroId = document.getElementById("disciplinaMatricula").value;
  const orgaoResponsavelId = document.getElementById("disciplinaOrgao").value;
  const motivo = document.getElementById("disciplinaMotivo").value.trim();
  const sigiloso = document.getElementById("disciplinaSigiloso").checked;
  const msg = document.getElementById("resultadoDisciplina");
  if (!membroId || !orgaoResponsavelId || !motivo) {
    msg.textContent = "Informe matrícula, órgão e motivo.";
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/processos-disciplinares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, orgaoResponsavelId, motivo, sigiloso })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("disciplinaMatricula").value = "";
    document.getElementById("disciplinaMotivo").value = "";
    carregarProcessosDisciplinares();
  }
}

const ROTULO_SITUACAO_DISCIPLINA = {
  EM_ANDAMENTO: "Em andamento",
  CUMPRINDO_SANCAO: "Cumprindo sanção",
  PRAZO_INDETERMINADO: "Sanção — prazo indeterminado",
  CUMPRIDO: "Sanção cumprida",
  ARQUIVADO: "Arquivado",
  EXCLUIDO: "Excluído"
};

function badgeSituacaoDisciplina(situacao) {
  const cores = {
    EM_ANDAMENTO: "badge-licenca", CUMPRINDO_SANCAO: "badge-licenca", PRAZO_INDETERMINADO: "badge-licenca",
    CUMPRIDO: "badge-ativo", ARQUIVADO: "badge-ativo", EXCLUIDO: "badge-desligado"
  };
  return `<span class="badge-status ${cores[situacao] || ""}">${ROTULO_SITUACAO_DISCIPLINA[situacao] || situacao}</span>`;
}

async function carregarProcessosDisciplinares() {
  const container = document.getElementById("resultadoListaDisciplina");
  const res = await fetchProtegido(`${API_BASE}/processos-disciplinares`);
  const processos = await res.json();

  if (processos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum processo ativo.</p>";
    return;
  }

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Órgão</th><th>Motivo</th><th>Situação</th><th>Dias restantes</th><th></th>
  </tr></thead><tbody>`;

  processos.forEach(p => {
    const podeJulgar = p.status === "EM_ANDAMENTO";
    const podeAjustarPrazo = p.situacaoEfetiva === "CUMPRINDO_SANCAO" || p.situacaoEfetiva === "PRAZO_INDETERMINADO";
    html += `<tr>
      <td>${p.nome}${p.sigiloso ? " 🔒" : ""}</td>
      <td>${p.orgaoSigla}</td>
      <td>${p.motivo || "-"}</td>
      <td>${badgeSituacaoDisciplina(p.situacaoEfetiva)}</td>
      <td>${p.diasRestantes ?? "-"}</td>
      <td class="acoes-inline">
        ${podeJulgar ? `<button class="btn-link" onclick="julgarProcessoAcao(${p.processoId})">Julgar</button>` : ""}
        ${podeAjustarPrazo ? `<button class="btn-link" onclick="ajustarPrazoProcessoAcao(${p.processoId})">Ajustar Prazo</button>` : ""}
      </td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

// Modal customizado (mesmo padrão de pedirTexto/confirmarAcao) — Promise<{resultado, diasSancao}|null>.
function pedirJulgamento() {
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Julgar processo</h3>
      <div class="input-group">
        <label>Resultado:</label>
        <select id="modalResultado">
          <option value="ARQUIVADO">Arquivado (sem sanção)</option>
          <option value="SANCAO">Sanção (dias de suspensão)</option>
          <option value="EXCLUSAO">Exclusão</option>
        </select>
      </div>
      <div class="input-group" id="modalGrupoDias">
        <label>Dias de sanção (deixe em branco para prazo indeterminado):</label>
        <input type="number" id="modalDiasSancao" min="1" />
      </div>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar" id="modalConfirmar">Julgar</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    const selectResultado = document.getElementById("modalResultado");
    const grupoDias = document.getElementById("modalGrupoDias");
    const atualizarVisibilidade = () => { grupoDias.style.display = selectResultado.value === "SANCAO" ? "block" : "none"; };
    selectResultado.addEventListener("change", atualizarVisibilidade);
    atualizarVisibilidade();
    document.getElementById("modalConfirmar").onclick = () => {
      const resultado = selectResultado.value;
      const diasSancao = document.getElementById("modalDiasSancao").value || null;
      fecharModal();
      resolve({ resultado, diasSancao });
    };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

// Promise<{novoDiasSancao, justificativa}|null> — justificativa é validada no chamador.
function pedirAjustePrazo() {
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Ajustar prazo da sanção</h3>
      <div class="input-group">
        <label>Novo total de dias de sanção (deixe em branco para tornar indeterminado):</label>
        <input type="number" id="modalNovoDias" min="1" />
      </div>
      <div class="input-group">
        <label>Justificativa (obrigatória — fica registrada na auditoria):</label>
        <textarea id="modalJustificativa" rows="3"></textarea>
      </div>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar" id="modalConfirmar">Ajustar</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    document.getElementById("modalConfirmar").onclick = () => {
      const novoDiasSancao = document.getElementById("modalNovoDias").value || null;
      const justificativa = document.getElementById("modalJustificativa").value.trim();
      fecharModal();
      resolve({ novoDiasSancao, justificativa });
    };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

async function julgarProcessoAcao(processoId) {
  const dados = await pedirJulgamento();
  if (!dados) return;
  const res = await fetchProtegido(`${API_BASE}/processos-disciplinares/${processoId}/evoluir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao: "JULGAR", resultado: dados.resultado, diasSancao: dados.diasSancao })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarProcessosDisciplinares();
}

async function ajustarPrazoProcessoAcao(processoId) {
  const dados = await pedirAjustePrazo();
  if (!dados) return;
  if (!dados.justificativa) {
    mostrarToast("Justificativa é obrigatória para ajustar o prazo.", "erro");
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/processos-disciplinares/${processoId}/evoluir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao: "AJUSTAR_PRAZO", novoDiasSancao: dados.novoDiasSancao, prazoIndeterminado: !dados.novoDiasSancao, justificativa: dados.justificativa })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarProcessosDisciplinares();
}

// ---- ABA PERDA DE MEMBRESIA: Abandono Eclesiástico Material (v1.5 — Reg. Art. 11) ----
async function carregarRadarAbandono() {
  const container = document.getElementById("resultadoRadarAbandono");
  const res = await fetchProtegido(`${API_BASE}/radar-abandono`);
  const membros = await res.json();

  if (!Array.isArray(membros) || membros.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum membro Sem Comunhão com Data de Afastamento lançada.</p>";
    return;
  }

  container.innerHTML = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Congregação</th><th>Afastado desde</th><th>Dias</th><th></th>
  </tr></thead><tbody>` +
    membros.map(m => `<tr>
      <td>${m.nome}</td>
      <td>${m.congregacao || "-"}</td>
      <td>${m.dataAfastamento || "-"}</td>
      <td>${m.diasAfastado ?? "-"}</td>
      <td class="acoes-inline">${m.elegivel ? `<button class="btn-link" onclick="abrirProcedimentoAbandonoAcao(${m.membroId}, 'MATERIAL')">Abrir Procedimento</button>` : "aguardando 90 dias"}</td>
    </tr>`).join("") + "</tbody></table>";
}

const ROTULO_TIPO_ABANDONO = { MATERIAL: "Material", DIGITAL: "Digital" };

async function abrirProcedimentoAbandonoAcao(membroId, tipo) {
  tipo = tipo || "MATERIAL";
  const rotulo = ROTULO_TIPO_ABANDONO[tipo] || tipo;
  if (!(await confirmarAcao(`Abrir o procedimento sumário de constatação de Abandono ${rotulo} para este membro? Ele passa a contar o prazo de defesa de 15 dias.`, "Abrir Procedimento"))) return;
  const res = await fetchProtegido(`${API_BASE}/procedimentos-abandono`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, tipo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarRadarAbandono(); carregarRadarAbandonoDigital(); carregarProcedimentosAbandono(); }
}

const ROTULO_STATUS_ABANDONO = { NOTIFICADO: "Notificado (em prazo de defesa)", HOMOLOGADO: "Homologado (perda efetivada)", ARQUIVADO: "Arquivado" };
function badgeStatusAbandono(status) {
  const cores = { NOTIFICADO: "badge-licenca", HOMOLOGADO: "badge-desligado", ARQUIVADO: "badge-ativo" };
  return `<span class="badge-status ${cores[status] || ""}">${ROTULO_STATUS_ABANDONO[status] || status}</span>`;
}

async function carregarProcedimentosAbandono() {
  const container = document.getElementById("resultadoListaAbandono");
  const res = await fetchProtegido(`${API_BASE}/procedimentos-abandono`);
  const procedimentos = await res.json();

  if (!Array.isArray(procedimentos) || procedimentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum procedimento aberto.</p>";
    return;
  }

  container.innerHTML = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Tipo</th><th>Status</th><th>Notificado em</th><th>Recurso</th><th></th>
  </tr></thead><tbody>` +
    procedimentos.map(p => `<tr>
      <td>${p.nome}</td>
      <td>${ROTULO_TIPO_ABANDONO[p.tipo] || p.tipo}</td>
      <td>${badgeStatusAbandono(p.status)}${p.status === "NOTIFICADO" && p.prazoVencido ? " ⏰ prazo vencido" : ""}</td>
      <td>${p.dataNotificacao || "-"}</td>
      <td>${p.recursoInterposto ? `${p.resultadoRecurso || "PENDENTE"} (${p.dataRecurso || "-"})` : "-"}</td>
      <td class="acoes-inline">
        ${p.status === "NOTIFICADO" ? `<button class="btn-link" onclick="homologarProcedimentoAbandonoAcao(${p.procedimentoId})">Homologar</button>` : ""}
        ${p.status === "NOTIFICADO" ? `<button class="btn-link" onclick="arquivarProcedimentoAbandonoAcao(${p.procedimentoId})">Arquivar</button>` : ""}
        ${p.status === "HOMOLOGADO" && !p.recursoInterposto ? `<button class="btn-link" onclick="registrarRecursoAbandonoAcao(${p.procedimentoId})">Registrar Recurso</button>` : ""}
      </td>
    </tr>`).join("") + "</tbody></table>";
}

// ---- Abandono Digital (Art. 12 §2º): canais + tentativas de contato + radar próprio ----
async function carregarOpcoesTentativaContato() {
  const select = document.getElementById("tentativaCanal");
  if (!select) return;
  const res = await fetch(`${API_BASE}/catalogos/canaisOficiais`);
  const canais = await res.json();
  select.innerHTML = (Array.isArray(canais) ? canais : []).filter(c => c.ativo !== false).map(c => `<option value="${c.canalId}">${c.nome}</option>`).join("");
}

async function registrarTentativaContatoAcao() {
  const membroId = document.getElementById("tentativaMatricula").value;
  const canalId = document.getElementById("tentativaCanal").value;
  const dataTentativa = document.getElementById("tentativaData").value || null;
  const observacao = document.getElementById("tentativaObservacao").value.trim() || null;
  const msg = document.getElementById("resultadoTentativaContato");
  if (!membroId || !canalId) {
    msg.textContent = "Informe matrícula e canal.";
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/tentativas-contato`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, canalId, dataTentativa, observacao })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("tentativaObservacao").value = "";
    carregarTentativasContatoLista(membroId);
    carregarRadarAbandonoDigital();
  }
}

async function carregarTentativasContatoLista(membroId) {
  const container = document.getElementById("resultadoTentativasContato");
  if (!container || !membroId) return;
  const res = await fetchProtegido(`${API_BASE}/tentativas-contato?membroId=${membroId}`);
  const data = await res.json();
  const tentativas = data.tentativas || [];
  const e = data.elegibilidade || {};

  const resumo = `<p class="subtitle">${e.canaisDistintos ?? 0}/2 canais distintos` +
    (e.diasDesdePrimeira != null ? `, ${e.diasDesdePrimeira}/90 dias desde a 1ª tentativa` : "") +
    ` — ${e.elegivel ? "✅ elegível para abrir o procedimento" : "ainda não elegível"}.</p>`;

  if (tentativas.length === 0) {
    container.innerHTML = resumo + "<p class='subtitle'>Nenhuma tentativa registrada para esta matrícula.</p>";
    return;
  }

  container.innerHTML = resumo + `<table class="tabela-frequencia"><thead><tr>
    <th>Canal</th><th>Data</th><th>Observação</th>
  </tr></thead><tbody>` +
    tentativas.map(t => `<tr><td>${t.canal}</td><td>${t.dataTentativa}</td><td>${t.observacao || "-"}</td></tr>`).join("") + "</tbody></table>";
}

async function carregarRadarAbandonoDigital() {
  const container = document.getElementById("resultadoRadarAbandonoDigital");
  if (!container) return;
  const res = await fetchProtegido(`${API_BASE}/radar-abandono-digital`);
  const membros = await res.json();

  if (!Array.isArray(membros) || membros.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum membro com tentativa de contato registrada.</p>";
    return;
  }

  container.innerHTML = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Congregação</th><th>Canais distintos</th><th>Dias desde a 1ª tentativa</th><th></th>
  </tr></thead><tbody>` +
    membros.map(m => `<tr>
      <td>${m.nome}</td>
      <td>${m.congregacao || "-"}</td>
      <td>${m.canaisDistintos}/2</td>
      <td>${m.diasDesdePrimeira ?? "-"}</td>
      <td class="acoes-inline">${m.elegivel ? `<button class="btn-link" onclick="abrirProcedimentoAbandonoAcao(${m.membroId}, 'DIGITAL')">Abrir Procedimento</button>` : "requisitos incompletos"}</td>
    </tr>`).join("") + "</tbody></table>";
}

async function homologarProcedimentoAbandonoAcao(procedimentoId) {
  if (!(await confirmarAcao("Homologar a constatação de abandono? A membresia é encerrada de verdade (desligamento, assento/liderança/cargo encerrados).", "Homologar"))) return;
  const res = await fetchProtegido(`${API_BASE}/procedimentos-abandono/${procedimentoId}/evoluir`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "HOMOLOGAR" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarProcedimentosAbandono(); carregarRadarAbandono(); }
}

async function arquivarProcedimentoAbandonoAcao(procedimentoId) {
  if (!(await confirmarAcao("Arquivar este procedimento (o membro voltou a comparecer)?", "Arquivar"))) return;
  const res = await fetchProtegido(`${API_BASE}/procedimentos-abandono/${procedimentoId}/evoluir`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "ARQUIVAR" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarProcedimentosAbandono();
}

async function registrarRecursoAbandonoAcao(procedimentoId) {
  if (!(await confirmarAcao("Registrar o Recurso à Assembleia para este procedimento? (sem efeito suspensivo — a perda de membresia já vale)", "Registrar Recurso"))) return;
  const res = await fetchProtegido(`${API_BASE}/procedimentos-abandono/${procedimentoId}/evoluir`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "RECURSO" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarProcedimentosAbandono();
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

  const orgaosContainer = document.getElementById("cartaoMeusOrgaos");
  orgaosContainer.innerHTML = (data.assentos && data.assentos.length)
    ? `<div class="cartao-perfil"><p class="linha-perfil"><strong>Meus órgãos:</strong> ${data.assentos.map(a => `${a.orgao}${a.cargoOuFuncao ? " — " + a.cargoOuFuncao : ""}`).join(" · ")}</p></div>`
    : "";

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

  carregarConsentimentoLGPD(matricula);
  carregarMinhasSolicitacoesLGPD(matricula);
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

// ==================== LGPD: auto-atendimento (Meu Painel) ====================
function badgeStatusLgpd(status) {
  const classes = { PENDENTE: "badge-licenca", EM_ANALISE: "badge-licenca", ATENDIDA: "badge-ativo", NEGADA: "badge-desligado" };
  const rotulos = { PENDENTE: "Pendente", EM_ANALISE: "Em análise", ATENDIDA: "Atendida", NEGADA: "Negada" };
  return `<span class="badge-status ${classes[status] || ""}">${rotulos[status] || status}</span>`;
}

async function carregarConsentimentoLGPD(matricula) {
  matricula = matricula || authMatricula;
  const chk = document.getElementById("consentimentoDadosContato");
  const msg = document.getElementById("resultadoConsentimentoLGPD");
  if (!matricula || !chk) return;
  const res = await fetch(`${API_BASE}/lgpd/consentimento/${matricula}`);
  const data = await res.json();
  if (!data.sucesso) return;
  const atual = (data.consentimentos || []).find(c => c.tipo === "DADOS_CONTATO");
  chk.checked = !!(atual && atual.concedido);
  msg.textContent = atual ? `Última atualização: ${new Date(atual.dataRegistro).toLocaleString("pt-BR")}` : "Ainda não registrado.";
}

async function salvarConsentimentoLGPD() {
  const matricula = authMatricula;
  const chk = document.getElementById("consentimentoDadosContato");
  if (!matricula) return;
  const res = await fetch(`${API_BASE}/lgpd/consentimento/${matricula}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo: "DADOS_CONTATO", concedido: chk.checked })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarConsentimentoLGPD(matricula);
}

// Formata um valor de "Meus Dados" pra exibição — nunca null/vazio cru, nunca
// chave de código aparecendo em tela. Datas em ISO (YYYY-MM-DD ou timestamp)
// viram pt-BR; o resto some com "-" quando vazio.
function formatarValorLgpd(valor, tipo) {
  if (valor === null || valor === undefined || valor === "") return "-";
  if (tipo === "data") {
    const d = new Date(valor);
    return isNaN(d) ? "-" : d.toLocaleDateString("pt-BR");
  }
  if (tipo === "dataHora") {
    const d = new Date(valor);
    return isNaN(d) ? "-" : d.toLocaleString("pt-BR");
  }
  if (tipo === "bit") return valor ? "Sim" : "Não";
  return String(valor);
}

function linhaLgpd(rotulo, valor, tipo) {
  return `<p class="linha-perfil"><strong>${rotulo}:</strong> ${formatarValorLgpd(valor, tipo)}</p>`;
}

async function alternarMeusDadosLGPD() {
  const caixa = document.getElementById("cxMeusDadosLGPD");
  const abrindo = caixa.style.display === "none";
  caixa.style.display = abrindo ? "block" : "none";
  if (!abrindo) return;

  const res = await fetch(`${API_BASE}/lgpd/meus-dados/${authMatricula}`);
  const data = await res.json();

  if (data.precisaConsentimento) {
    caixa.innerHTML = `<p class="subtitle">🔒 ${data.mensagem}</p>`;
    return;
  }
  if (!data.sucesso) { caixa.innerHTML = `<p class="subtitle">${data.mensagem}</p>`; return; }

  const m = data.membro;
  const ROTULO_MODALIDADE = { CIVIL_E_RELIGIOSO: "Civil e Religioso", SOMENTE_RELIGIOSO: "Somente Religioso" };
  const ROTULO_STATUS_LIC = { EM_LICENCA: "Em licença", RETORNOU: "Retornou", NAO_RETORNOU: "Não retornou" };

  caixa.innerHTML = `
    <div class="cartao-perfil">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Dados Cadastrais</h4>
      ${m.fotoUrl ? `<img src="${m.fotoUrl}" alt="Foto" style="max-width:120px;border-radius:8px;margin-bottom:8px;" />` : ""}
      ${linhaLgpd("Nome", m.nome)}
      ${linhaLgpd("Congregação", m.congregacao)}
      ${linhaLgpd("Extensão da Tenda", m.extensao)}
      ${linhaLgpd("Status", m.status)}
      ${linhaLgpd("Situação", m.situacaoMembro)}
      ${linhaLgpd("Data de Nascimento", m.dataNascimento, "data")}
      ${linhaLgpd("Data de Admissão", m.dataAdmissao, "data")}
      ${linhaLgpd("Forma de Admissão", m.formaAdmissao)}
      ${linhaLgpd("Origem/Procedência", m.origem)}
      ${linhaLgpd("Igreja Anterior", m.igrejaAnterior)}
      ${linhaLgpd("Data do Batismo", m.dataBatismo, "data")}
      ${linhaLgpd("Data do Rito de Recebimento", m.dataRitoRecebimento, "data")}
      ${linhaLgpd("Nome Lido no Rito", m.nomeLidoRito)}
      ${linhaLgpd("Ministrante do Rito", m.ministranteRito)}
      ${linhaLgpd("Telefone", m.telefone)}
      ${linhaLgpd("E-mail", m.email)}
      ${linhaLgpd("Endereço", m.endereco)}
      ${linhaLgpd("Cadastrado em", m.criadoEm, "dataHora")}
    </div>

    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Dados Ministeriais</h4>
      ${linhaLgpd("Função", m.funcao)}
      ${linhaLgpd("Cargo Ministerial", m.cargoMinisterial)}
      ${linhaLgpd("Departamento", m.departamento)}
      ${linhaLgpd("Dizimista Fiel", m.dizimistaFiel, "bit")}
    </div>

    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Acessos e Vínculos</h4>
      ${linhaLgpd("Acessos (liderança)", data.liderancas.map(l => l.papel).join(", "))}
      ${linhaLgpd("Assentos em órgãos", data.assentos.map(a => `${a.orgao}${a.cargoOuFuncao ? " — " + a.cargoOuFuncao : ""}`).join(", "))}
      ${linhaLgpd("Vínculos familiares", data.vinculosFamiliares.map(v => `${v.parente} (${v.vinculo})`).join(", "))}
      ${linhaLgpd("Processos disciplinares", data.processosDisciplinares.length ? `${data.processosDisciplinares.length} registrado(s)` : null)}
    </div>

    ${data.casamentos.length ? `
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Casamentos</h4>
      ${data.casamentos.map(c => `<p class="linha-perfil">${formatarValorLgpd(c.dataCasamento, "data")} · ${c.conjuge || "-"} · ${ROTULO_MODALIDADE[c.modalidade] || c.modalidade}</p>`).join("")}
    </div>` : ""}

    ${data.licencasCandidatura.length ? `
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Licenças por Candidatura</h4>
      ${data.licencasCandidatura.map(l => `<p class="linha-perfil">Pleito em ${formatarValorLgpd(l.dataPleito, "data")} · ${ROTULO_STATUS_LIC[l.status] || l.status}</p>`).join("")}
    </div>` : ""}

    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Consentimentos LGPD</h4>
      ${data.consentimentos.map(c => `<p class="linha-perfil">${c.tipo} — ${c.concedido ? "✅ Concedido" : "❌ Revogado"} em ${formatarValorLgpd(c.dataRegistro, "dataHora")}</p>`).join("") || "<p class='subtitle'>Nenhum registrado.</p>"}
    </div>

    <p class="subtitle" style="margin-top:12px;">Gerado em ${formatarValorLgpd(data.geradoEm, "dataHora")}. Precisa de uma cópia formal? Use "Enviar pedido" abaixo com o tipo "Portabilidade".</p>`;
}

async function criarSolicitacaoLGPD() {
  const matricula = authMatricula;
  const tipo = document.getElementById("solicitacaoLgpdTipo").value;
  const descricao = document.getElementById("solicitacaoLgpdDescricao").value;
  if (!matricula) return;
  const res = await fetch(`${API_BASE}/lgpd/solicitacoes/${matricula}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo, descricao })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("solicitacaoLgpdDescricao").value = "";
    carregarMinhasSolicitacoesLGPD(matricula);
  }
}

async function carregarMinhasSolicitacoesLGPD(matricula) {
  matricula = matricula || authMatricula;
  const container = document.getElementById("resultadoListaSolicitacoesLGPD");
  if (!matricula || !container) return;
  const res = await fetch(`${API_BASE}/lgpd/solicitacoes/${matricula}`);
  const data = await res.json();
  if (!data.sucesso || data.solicitacoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma solicitação enviada ainda.</p>";
    return;
  }
  let html = "<table class='tabela-frequencia'><thead><tr><th>Tipo</th><th>Data</th><th>Status</th><th>Resposta</th></tr></thead><tbody>";
  data.solicitacoes.forEach(s => {
    html += `<tr>
      <td>${s.tipo}</td>
      <td>${new Date(s.dataSolicitacao).toLocaleDateString("pt-BR")}</td>
      <td>${badgeStatusLgpd(s.status)}</td>
      <td>${s.respostaTexto || "-"}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

// ==================== ABA: AUDITORIA ====================
async function carregarAuditoria() {
  const tabela = document.getElementById("auditoriaFiltroTabela").value.trim();
  const usuarioId = document.getElementById("auditoriaFiltroUsuario").value.trim();
  const de = document.getElementById("auditoriaFiltroDe").value;
  const ate = document.getElementById("auditoriaFiltroAte").value;
  const params = new URLSearchParams();
  if (tabela) params.set("tabela", tabela);
  if (usuarioId) params.set("usuarioId", usuarioId);
  if (de) params.set("de", `${de}T00:00:00`);
  if (ate) params.set("ate", `${ate}T23:59:59`);

  const res = await fetchProtegido(`${API_BASE}/auditoria?${params.toString()}`);
  const registros = await res.json();
  const container = document.getElementById("resultadoListaAuditoria");
  if (!Array.isArray(registros) || registros.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum registro encontrado.</p>";
    return;
  }
  let html = "<table class='tabela-frequencia'><thead><tr><th>Quando</th><th>Tabela</th><th>Registro</th><th>Ação</th><th>Quem</th></tr></thead><tbody>";
  registros.forEach(a => {
    html += `<tr>
      <td>${new Date(a.dataHora).toLocaleString("pt-BR")}</td>
      <td>${a.tabela}</td>
      <td>${a.registroId ?? "-"}</td>
      <td>${a.acao}</td>
      <td>${a.usuarioNome ? `${a.usuarioNome} (${a.usuarioId})` : (a.usuarioId ?? "-")}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

// ==================== ABA: PROTEÇÃO DE DADOS (Encarregado de Dados) ====================
async function carregarSolicitacoesDPO() {
  const status = document.getElementById("dpoFiltroStatus").value;
  const params = new URLSearchParams();
  if (status) params.set("status", status);

  const res = await fetchProtegido(`${API_BASE}/lgpd/dpo/solicitacoes?${params.toString()}`);
  const registros = await res.json();
  const container = document.getElementById("resultadoListaSolicitacoesDPO");
  if (!Array.isArray(registros) || registros.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma solicitação encontrada.</p>";
    return;
  }
  let html = "<table class='tabela-frequencia'><thead><tr><th>Matrícula</th><th>Nome</th><th>Tipo</th><th>Descrição</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead><tbody>";
  registros.forEach(s => {
    let acoes = "";
    if (s.status === "PENDENTE" || s.status === "EM_ANALISE") {
      if (s.tipo === "EXCLUSAO") {
        acoes = `<button class="btn-link" onclick="responderSolicitacaoDPO(${s.solicitacaoId}, 'EM_ANALISE')">Em análise</button>
                 <button class="btn-link" onclick="executarExclusaoDPO(${s.solicitacaoId})">Executar exclusão</button>
                 <button class="btn-link btn-link-perigo" onclick="responderSolicitacaoDPO(${s.solicitacaoId}, 'NEGADA')">Negar</button>`;
      } else {
        acoes = `<button class="btn-link" onclick="responderSolicitacaoDPO(${s.solicitacaoId}, 'EM_ANALISE')">Em análise</button>
                 <button class="btn-link" onclick="responderSolicitacaoDPO(${s.solicitacaoId}, 'ATENDIDA')">Atender</button>
                 <button class="btn-link btn-link-perigo" onclick="responderSolicitacaoDPO(${s.solicitacaoId}, 'NEGADA')">Negar</button>`;
      }
    }
    html += `<tr>
      <td>${s.membroId}</td>
      <td>${s.nome}</td>
      <td>${s.tipo}</td>
      <td>${s.descricao || "-"}</td>
      <td>${badgeStatusLgpd(s.status)}</td>
      <td>${new Date(s.dataSolicitacao).toLocaleDateString("pt-BR")}</td>
      <td class="acoes-inline">${acoes}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function responderSolicitacaoDPO(id, status) {
  let respostaTexto = null;
  if (status === "ATENDIDA" || status === "NEGADA") {
    respostaTexto = await pedirTexto(status === "NEGADA" ? "Motivo da negativa" : "Resposta ao titular", "Explique a decisão");
    if (respostaTexto === null) return;
  }
  const res = await fetchProtegido(`${API_BASE}/lgpd/dpo/solicitacoes/${id}/responder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, respostaTexto })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarSolicitacoesDPO();
}

async function executarExclusaoDPO(id) {
  if (!(await confirmarAcao("Executar a exclusão? Isso apaga o telefone, e-mail e endereço do titular permanentemente (dados cadastrais e de processos são mantidos por obrigação legal).", "Executar exclusão"))) return;
  const res = await fetchProtegido(`${API_BASE}/lgpd/dpo/solicitacoes/${id}/excluir`, { method: "POST" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarSolicitacoesDPO();
}
