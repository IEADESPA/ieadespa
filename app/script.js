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
    const data = await res.clone().json().catch(() => null);
    if (data && data.termosPendentes && data.termosPendentes.length > 0) {
      mostrarToast("Assine os termos pendentes para continuar.", "erro");
      mostrarModalTermos(data.termosPendentes);
    } else {
      mostrarToast("Você não tem permissão para essa ação.", "erro");
    }
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
    document.getElementById("senhaPainel").value = "";
    msg.textContent = "";
    if (data.termosPendentes && data.termosPendentes.length > 0) {
      await mostrarModalTermos(data.termosPendentes);
      return;
    }
  } else {
    limparSessao();
    authMatricula = String(matricula);
    document.getElementById("senhaPainel").value = "";
    msg.textContent = "";
  }

  await abrirPainelConteudo(matricula);
}

// ---- Termos de Compromisso/Confidencialidade (v2.7) — bloqueio real, ver
// api/shared/auth.js exigirLogin. Reaproveita o modal genérico (#modalOverlay/
// #modalCaixa) sem botão de cancelar — só sai assinando.
let filaTermosPendentes = [];
let catalogoTermosCache = null;

async function mostrarModalTermos(tipos) {
  filaTermosPendentes = tipos.slice();
  await renderizarProximoTermo();
}

async function renderizarProximoTermo() {
  if (filaTermosPendentes.length === 0) {
    fecharModal();
    await abrirPainelConteudo(authMatricula);
    return;
  }
  if (!catalogoTermosCache) {
    const res = await fetchProtegido(`${API_BASE}/termos`);
    const data = await res.json();
    catalogoTermosCache = data.termos || {};
  }
  const tipo = filaTermosPendentes[0];
  const termo = catalogoTermosCache[tipo];
  const caixa = document.getElementById("modalCaixa");
  caixa.innerHTML = `
    <h3>${termo ? termo.titulo : tipo}</h3>
    <div style="max-height:300px; overflow-y:auto; border:1px solid var(--cor-borda, #ccc); padding:10px; margin-bottom:12px; text-align:justify;">
      ${termo ? termo.texto : ""}
    </div>
    <label style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
      <input type="checkbox" id="checkTermoLido" /> Li e concordo com os termos acima.
    </label>
    <div class="modal-acoes">
      <button class="btn-confirmar" id="modalConfirmar" disabled>✅ Assinar e continuar</button>
    </div>
  `;
  document.getElementById("modalOverlay").classList.remove("escondido");
  const checkbox = document.getElementById("checkTermoLido");
  const botao = document.getElementById("modalConfirmar");
  checkbox.onchange = () => { botao.disabled = !checkbox.checked; };
  botao.onclick = () => assinarTermoAtual(tipo);
}

async function assinarTermoAtual(tipo) {
  const res = await fetchProtegido(`${API_BASE}/termos/${tipo}`, { method: "POST" });
  const data = await res.json();
  if (!data.sucesso) {
    mostrarToast(data.mensagem || "Erro ao assinar o termo.", "erro");
    return;
  }
  authToken = data.token;
  sessionStorage.setItem("authToken", authToken);
  filaTermosPendentes.shift();
  await renderizarProximoTermo();
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
const NOMES_ABAS = ["meupainel", "financeiro", "reunioes", "pessoas", "cartas", "orgaos", "estrutura", "catalogos", "permissoes", "consagracoes", "enquetes", "arquivos", "disciplina", "abandono", "auditoria", "protecaodedados", "ouvidoria", "documentos"];

// Quais chaves de permissão liberam cada aba (qualquer uma delas basta). Abas fora
// deste mapa usam a própria chave — ex: "disciplina" exige só "disciplina". Espelha
// exatamente o que cada Function já checa no backend (ex: AbrirReuniao aceita
// reunioes/assembleia/cli — a aba única de Reuniões reflete isso).
const ABA_PERMISSOES_ALT = {
  reunioes: ["reunioes", "assembleia", "cli"],
  congregacoes: ["pessoas"], orgaos: ["pessoas"], estrutura: ["pessoas"], catalogos: ["pessoas"], cartas: ["pessoas"],
  abandono: ["disciplina"],
  enquetes: ["reunioes", "assembleia"],
  arquivos: ["reunioes", "assembleia", "cli"]
};
function permissoesDaAba(nome) {
  return ABA_PERMISSOES_ALT[nome] || [nome];
}

function aplicarPermissoesNoMenu() {
  NOMES_ABAS.forEach(nome => {
    if (nome === "meupainel" || nome === "documentos" || nome === "ouvidoria") return;
    // "reunioes" (v4.2.3) não tem mais botão próprio — a escolha de órgão
    // agora é a porta de entrada dos módulos Órgãos Centrais/Regionais.
    const btn = document.getElementById(`btnAba${capitalize(nome)}`);
    if (!btn) return;
    const pode = permissoesDaAba(nome).some(chave => authPermissoes.includes(chave));
    btn.style.display = pode ? "inline-block" : "none";
  });
  montarGradeModulos();
  sairDoModulo();
}

// ---- NAVEGAÇÃO POR MÓDULOS (v4.2) ----
// Padrão "portal de serviços" (tipo Desenvolve Cidade): Meu Painel é sempre
// o "Painel Principal"/home. Escolher um módulo troca a barra lateral
// inteira pela navegação daquele módulo (o resto some), com um botão de
// volta. Cada módulo é só um agrupamento das abas que já existiam — a
// permissão de cada aba dentro dele continua sendo checada normalmente
// (aplicarPermissoesNoMenu), então dentro de um módulo a pessoa só vê o
// que já podia ver antes. Preparado pra crescer (ex: EBD) sem reestruturar
// nada — só adiciona uma entrada aqui.
// v4.2.1 — o antigo módulo único "Secretaria/Governança" foi fatiado em
// módulos temáticos menores (pedido explícito: quanto mais fino, mais fácil
// no futuro dar acesso a alguém só naquele pedaço — ex: secretário de
// departamento, pastor de área — sem precisar da permissão ampla "Pessoas"
// nem sobrecarregar a tela de Permissões). Ainda são as MESMAS abas de
// sempre, só reagrupadas; a permissão de cada aba continua igual. Próximo
// fatiamento de verdade (fora do escopo de hoje): a própria aba "Catálogos"
// mistura Departamentos com Congregações/Áreas/Regiões — separar isso é o
// que vai permitir um card "Departamentos" e um card "Territórios" cada um
// só com o que é dele, em vez dos dois dentro de "Estrutura & Territórios".
// v4.2.3 — "escolher o órgão" virou porta de entrada de dois módulos
// próprios (pedido explícito: "separar de uma vez por todas" — órgãos
// gerais/únicos vs. órgãos regionais/territoriais, porque uma pessoa pode
// pertencer a vários pelo caminho até a Sede, cada nível com sua própria
// gente). Os dois abrem o mesmo conteúdo de sempre (#abaReunioes) — só muda
// por onde se chega e qual lista de órgãos aparece (ver
// montarSubmenuOrgaosCentrais/Regionais).
const MODULOS = {
  financeiro: { titulo: "Financeiro", icone: "💰", abaEntrada: "financeiro", abas: ["financeiro"] },
  membresia: { titulo: "Pessoas & Membresia", icone: "👥", abaEntrada: "pessoas", abas: ["pessoas", "cartas", "abandono"] },
  territorio: { titulo: "Estrutura & Territórios", icone: "🗺️", abaEntrada: "estrutura", abas: ["orgaos", "estrutura", "catalogos"] },
  orgaosCentrais: { titulo: "Órgãos Centrais", icone: "🏛️", abaEntrada: "reunioes", abas: ["reunioes"] },
  orgaosRegionais: { titulo: "Órgãos Regionais", icone: "🧭", abaEntrada: "reunioes", abas: ["reunioes"] },
  eclesiastica: { titulo: "Vida Eclesiástica", icone: "📅", abaEntrada: "consagracoes", abas: ["consagracoes", "enquetes", "arquivos"] },
  disciplina: { titulo: "Disciplina & Ética", icone: "⚖️", abaEntrada: "disciplina", abas: ["disciplina", "ouvidoria"] },
  conformidade: { titulo: "Conformidade & Auditoria", icone: "🧾", abaEntrada: "auditoria", abas: ["auditoria", "protecaodedados", "documentos"] },
  acesso: { titulo: "Administração de Acesso", icone: "🔐", abaEntrada: "permissoes", abas: ["permissoes"] }
};
let moduloAtual = null;

function podeAcessarAba(nome) {
  return nome === "documentos" || nome === "ouvidoria" || permissoesDaAba(nome).some(chave => authPermissoes.includes(chave));
}

function podeAcessarModulo(chave) {
  return MODULOS[chave].abas.some(podeAcessarAba);
}

function montarGradeModulos() {
  const grade = document.getElementById("gradeModulos");
  const chaves = Object.keys(MODULOS).filter(podeAcessarModulo);
  if (chaves.length === 0) {
    grade.innerHTML = "<p class='subtitle'>Nenhum módulo disponível pro seu perfil de acesso.</p>";
    return;
  }
  grade.innerHTML = chaves.map(chave => {
    const m = MODULOS[chave];
    return `<div class="card-modulo" onclick="entrarModulo('${chave}')">
      <span class="icone-modulo">${m.icone}</span><span>${m.titulo}</span>
    </div>`;
  }).join("");
}

function entrarModulo(chave) {
  moduloAtual = chave;
  document.querySelectorAll(".grupo-modulo").forEach(g => g.style.display = "none");
  document.getElementById(`grupoModulo${capitalize(chave)}`).style.display = "block";
  document.getElementById("btnVoltarModulo").style.display = "flex";
  const primeiraAbaPermitida = MODULOS[chave].abas.find(podeAcessarAba) || MODULOS[chave].abaEntrada;
  mostrarAbaSecretaria(primeiraAbaPermitida);
}

function sairDoModulo() {
  moduloAtual = null;
  document.querySelectorAll(".grupo-modulo").forEach(g => g.style.display = "none");
  document.getElementById("btnVoltarModulo").style.display = "none";
  mostrarAbaSecretaria("meupainel");
}

// Sub-abas de "Meu Painel" (v1.9) — evita empilhar tudo (perfil, LGPD, cartas) numa
// página só, cada vez mais comprida conforme o autoatendimento ganha mais funções.
// v4.2.2 — "Meu Perfil" fatiado em mais submenus de autoatendimento (pedido
// explícito): Perfil agora é só o resumo/dashboard; Dados Cadastrais, Vínculos
// Familiares e Contribuições ganharam cada um seu próprio espaço, em vez de
// tudo empilhado numa página só cada vez mais comprida.
const SUB_ABAS_MEUPAINEL = ["perfil", "dados", "vinculos", "contribuicoes", "lgpd", "cartas"];
const TITULOS_SUB_MEUPAINEL = {
  perfil: "Meu Perfil", dados: "Meus Dados Cadastrais", vinculos: "Vínculos Familiares",
  contribuicoes: "Minhas Contribuições", lgpd: "Meus Dados (LGPD)", cartas: "Cartas de Trânsito"
};
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
  if (sub === "dados") { carregarMeusDadosForm(); carregarMinhasSolicitacoesEdicao(); }
  if (sub === "vinculos") { carregarOpcoesMeuVinculoTipo(); carregarMeusVinculos(); }
  if (sub === "contribuicoes") { carregarOpcoesCategoriasEntrada(); prepararFormAutolancamento(); carregarMinhasContribuicoes(); }
}

// ---- MINHAS CONTRIBUIÇÕES (v4.1.1) — transparência: se a matrícula estiver
// vinculada a um cadastro de Dizimista, mostra o histórico de lançamentos.
// v4.3: cada linha também mostra se é um autolançamento aguardando
// confirmação do Tesoureiro (sem Termo nº ainda) ou já confirmado/rejeitado.
function badgeStatusContribuicao(c) {
  if (c.status === "CANCELADO") return "<span class='badge-status badge-desligado'>Cancelado</span>";
  if (c.origem === "AUTOLANCAMENTO") {
    if (c.statusConfirmacao === "PENDENTE") return "<span class='badge-status badge-pendente'>Aguardando confirmação</span>";
    if (c.statusConfirmacao === "REJEITADO") return `<span class='badge-status badge-desligado' title="${c.motivoRejeicaoConfirmacao || ''}">Rejeitado</span>`;
  }
  return "<span class='badge-status badge-ativo'>Confirmado</span>";
}

async function carregarMinhasContribuicoes() {
  if (!authMatricula) return;
  const cx = document.getElementById("cxMinhasContribuicoes");
  const aviso = document.getElementById("semContribuicoesAviso");
  const container = document.getElementById("resultadoMinhasContribuicoes");
  const res = await fetch(`${API_BASE}/meus-lancamentos-tesouraria/${authMatricula}`);
  const contribuicoes = await res.json();
  if (!Array.isArray(contribuicoes) || contribuicoes.length === 0) {
    cx.style.display = "none";
    aviso.style.display = "block";
    return;
  }
  cx.style.display = "block";
  aviso.style.display = "none";
  let html = `<table class="tabela-frequencia"><thead><tr><th>Mês</th><th>Termo</th><th>Congregação</th><th>Tipo</th><th>Valor</th><th>Forma</th><th>Status</th></tr></thead><tbody>`;
  contribuicoes.forEach(c => {
    html += `<tr>
      <td>${c.mesReferencia}</td><td>${c.termoNumero || "—"}</td><td>${c.congregacaoNome}</td>
      <td>${rotuloTipoLancamento(c.tipo)}</td><td>R$ ${Number(c.valor).toFixed(2)}</td>
      <td>${c.formaPagamento}</td>
      <td>${badgeStatusContribuicao(c)}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

// ---- AUTOLANÇAMENTO DO DIZIMISTA (v4.3) — não é pagamento pelo sistema,
// é só o registro de algo já feito fora dele; o Tesoureiro Local confirma
// depois de ver o dinheiro/PIX cair, e só aí nasce o Termo nº.
function prepararFormAutolancamento() {
  const mes = document.getElementById("autolancMes");
  if (mes && !mes.value) mes.value = mesAtualFinanceiro();
  const forma = document.getElementById("autolancForma");
  const valorPix = document.getElementById("autolancValorPix");
  if (forma && !forma.dataset.montado) {
    forma.addEventListener("change", () => {
      valorPix.style.display = forma.value === "MISTO" ? "inline-block" : "none";
    });
    forma.dataset.montado = "1";
  }
}

async function registrarAutolancamentoAcao() {
  const tipo = document.getElementById("autolancTipo").value;
  const valor = document.getElementById("autolancValor").value;
  const formaPagamento = document.getElementById("autolancForma").value;
  const valorPix = document.getElementById("autolancValorPix").value;
  const mesReferencia = document.getElementById("autolancMes").value;
  const descricao = document.getElementById("autolancDescricao").value;
  const resultado = document.getElementById("resultadoAutolancamento");
  if (!valor || !mesReferencia) {
    resultado.textContent = "Informe o valor e o mês.";
    return;
  }
  const body = { tipo, valor: Number(valor), formaPagamento, mesReferencia, descricao: descricao || undefined };
  if (formaPagamento === "MISTO") body.valorPix = Number(valorPix);
  const res = await fetch(`${API_BASE}/autolancamento-tesouraria/${authMatricula}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const dados = await res.json();
  resultado.textContent = dados.mensagem;
  if (dados.sucesso) {
    document.getElementById("autolancValor").value = "";
    document.getElementById("autolancValorPix").value = "";
    document.getElementById("autolancDescricao").value = "";
    carregarMinhasContribuicoes();
  }
}

// ---- FINANCEIRO (v4.1) — Tesouraria Local e Repasses ----
const SUB_ABAS_FINANCEIRO = ["visaogeral", "lancamentos", "planocontas", "campanhas", "saidas", "receber", "dizimistas", "fechamento", "relatorio", "parametros", "consolidado"];
const TITULOS_SUB_FINANCEIRO = {
  visaogeral: "Visão Geral", lancamentos: "Lançamentos", planocontas: "Plano de Contas", campanhas: "Campanhas", saidas: "Saídas", receber: "Contas a Receber",
  dizimistas: "Dizimistas do Mês", fechamento: "Fechamento do Mês", relatorio: "Relatório", parametros: "Parâmetros", consolidado: "Consolidado"
};
let subAbaFinanceiroAtual = "visaogeral";
let _congregacoesFinanceiroCache = null;
let _categoriasEntradaCache = null;

// v4.1.6 — sub-módulos do Financeiro (pedido explícito: quem clica em
// Financeiro precisa saber logo de cara o que está procurando, não cair
// direto num formulário de cadastrar dízimo). Hoje só "Entradas" existe de
// verdade (v4.1-v4.1.5); os demais refletem o roadmap da FASE 4 (README)
// e aparecem como "em breve" — crescer aqui é só adicionar uma entrada
// neste array, mesmo espírito do objeto MODULOS do painel principal.
const SUBMODULOS_FINANCEIRO = [
  { chave: "entradas", titulo: "Entradas", icone: "📝", subAba: "lancamentos", pronto: true },
  { chave: "planocontas", titulo: "Plano de Contas", icone: "📚", subAba: "planocontas", pronto: true },
  { chave: "campanhas", titulo: "Campanhas", icone: "🎯", subAba: "campanhas", pronto: true },
  { chave: "saidas", titulo: "Saídas (Contas a Pagar)", icone: "💸", subAba: "saidas", pronto: true },
  { chave: "receber", titulo: "Contas a Receber", icone: "📆", subAba: "receber", pronto: true },
  { chave: "orcamento", titulo: "Orçamento e Planejamento", icone: "📐", pronto: false },
  { chave: "patrimonio", titulo: "Patrimônio", icone: "🏛️", pronto: false },
  { chave: "doacoes", titulo: "Doações Online", icone: "💳", pronto: false },
  { chave: "auditoria", titulo: "Auditoria e Compliance", icone: "🕵️", pronto: false }
];

function montarGradeSubmodulosFinanceiro() {
  const grade = document.getElementById("gradeSubmodulosFinanceiro");
  grade.innerHTML = SUBMODULOS_FINANCEIRO.map(m => {
    if (!m.pronto) {
      return `<div class="card-modulo card-modulo-embreve" title="Ainda não construído — ver plano da FASE 4 no README">
        <span class="icone-modulo">${m.icone}</span><span>${m.titulo}</span><span class="tag-pendente">Em breve</span>
      </div>`;
    }
    return `<div class="card-modulo" onclick="mostrarSubAbaFinanceiro('${m.subAba}')">
      <span class="icone-modulo">${m.icone}</span><span>${m.titulo}</span>
    </div>`;
  }).join("");
}

function mostrarSubAbaFinanceiro(sub) {
  subAbaFinanceiroAtual = sub;
  SUB_ABAS_FINANCEIRO.forEach(nome => {
    document.getElementById(`subFinanceiro${capitalize(nome)}`).style.display = nome === sub ? "block" : "none";
    document.getElementById(`btnSubFinanceiro${capitalize(nome)}`).classList.toggle("ativo", nome === sub);
  });
  document.getElementById("tituloModulo").textContent = `Financeiro — ${TITULOS_SUB_FINANCEIRO[sub]}`;
  if (sub === "visaogeral") { montarGradeSubmodulosFinanceiro(); return; }
  if (sub === "planocontas") { montarCatalogosFinanceiro(); return; }
  if (sub === "campanhas") { carregarOpcoesCongregacoesFinanceiro().then(carregarCampanhas); return; }
  if (sub === "saidas") {
    Promise.all([carregarOpcoesCongregacoesFinanceiro(), carregarOpcoesCategoriasSaida(), carregarOpcoesFornecedoresSaida(), carregarOpcoesCampanhasSaida(), carregarValorReferenciaCotacoes()])
      .then(() => { carregarFornecedores(); carregarSaidas(); carregarFundosFixos(); });
    return;
  }
  if (sub === "receber") {
    Promise.all([carregarOpcoesCongregacoesFinanceiro(), carregarOpcoesCategoriasEntrada(), carregarOpcoesCampanhasSaida()])
      .then(() => carregarContasReceber());
    return;
  }
  Promise.all([carregarOpcoesCongregacoesFinanceiro(), carregarOpcoesCategoriasEntrada()]).then(() => {
    if (sub === "lancamentos") { carregarOpcoesDizimistas(); carregarLancamentosTesouraria(); }
    if (sub === "dizimistas") carregarDizimistasMes();
    if (sub === "fechamento") carregarResumoFechamento();
    if (sub === "parametros") carregarParametrosTesouraria();
    if (sub === "consolidado") carregarConsolidadoTesouraria();
  });
}

// v4.1.5 — categorias de entrada configuráveis (Catálogos → Categorias de
// Entrada), não mais um enum fixo no código — cadastrar uma nova categoria
// (ex: "Entrada de Ação Social") já basta pra ela aparecer aqui.
async function carregarOpcoesCategoriasEntrada() {
  if (!_categoriasEntradaCache) {
    const res = await fetch(`${API_BASE}/catalogos/categoriasEntrada`);
    _categoriasEntradaCache = await res.json();
  }
  ["financeiroLancTipo", "autolancTipo", "receberTipo"].forEach(idSelect => {
    const select = document.getElementById(idSelect);
    if (select && !select.dataset.montado) {
      select.innerHTML = _categoriasEntradaCache.filter(c => c.ativa !== false)
        .map(c => `<option value="${c.codigo}">${c.nome}</option>`).join("");
      select.dataset.montado = "1";
    }
  });
}

function nomeCategoriaEntrada(codigo) {
  const categoria = (_categoriasEntradaCache || []).find(c => c.codigo === codigo);
  return categoria ? categoria.nome : codigo;
}

function mesAtualFinanceiro() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

// Lista de congregações reaproveitada nos 4 seletores da aba (Lançamentos,
// Fechamento, Relatório, Parâmetros) — cacheada na sessão pra não repetir a
// mesma consulta a cada troca de sub-aba.
async function carregarOpcoesCongregacoesFinanceiro() {
  if (!_congregacoesFinanceiroCache) {
    const res = await fetch(`${API_BASE}/catalogos/congregacoes`);
    _congregacoesFinanceiroCache = await res.json();
  }
  const opcoes = _congregacoesFinanceiroCache
    .filter(c => c.ativa !== false)
    .map(c => `<option value="${c.congregacaoId}">${c.nome}</option>`).join("");
  ["financeiroLancCongregacao", "financeiroFechCongregacao", "financeiroRelCongregacao", "financeiroParamCongregacao", "financeiroDizCongregacao", "saidaCongregacao", "fundoFixoCongregacao", "receberCongregacao"].forEach(id => {
    const select = document.getElementById(id);
    if (select && !select.dataset.montado) {
      select.innerHTML = opcoes;
      select.dataset.montado = "1";
    }
  });
  const filtroCongSaida = document.getElementById("saidaFiltroCongregacao");
  if (filtroCongSaida && !filtroCongSaida.dataset.montado) {
    filtroCongSaida.innerHTML = `<option value="">Todas as congregações</option>` + opcoes;
    filtroCongSaida.dataset.montado = "1";
    filtroCongSaida.addEventListener("change", carregarSaidas);
  }
  const filtroCongReceber = document.getElementById("receberFiltroCongregacao");
  if (filtroCongReceber && !filtroCongReceber.dataset.montado) {
    filtroCongReceber.innerHTML = `<option value="">Todas as congregações</option>` + opcoes;
    filtroCongReceber.dataset.montado = "1";
    filtroCongReceber.addEventListener("change", carregarContasReceber);
  }
  ["financeiroLancMes", "financeiroFechMes", "financeiroRelMes", "financeiroConsolidadoMes", "financeiroDizMes"].forEach(id => {
    const input = document.getElementById(id);
    if (input && !input.value) input.value = mesAtualFinanceiro();
  });
}

// ---- CAMPANHAS DE ARRECADAÇÃO E SORTEIOS (v4.4) — meta geral sempre
// calculada na leitura a partir das metas por congregação (personalizadas,
// uma pode ter meta diferente da outra) e dos lançamentos vinculados via
// CampanhaId. Sorteio é só um Tipo de campanha, mesma base. Criar/encerrar/
// cancelar/sortear é restrito a nível Global (auth.js já barra no backend;
// aqui só escondemos os botões pra quem não tem esse nível).
function alternarFormNovaCampanha() {
  const form = document.getElementById("formNovaCampanha");
  const abrindo = form.style.display === "none";
  form.style.display = abrindo ? "block" : "none";
  if (abrindo) montarMetasBuilderCampanha();
}

function montarMetasBuilderCampanha() {
  const container = document.getElementById("metasBuilderCampanha");
  const congregacoes = (_congregacoesFinanceiroCache || []).filter(c => c.ativa !== false);
  container.innerHTML = `<table class="tabela-frequencia"><thead><tr><th></th><th>Congregação</th><th>Meta (R$)</th></tr></thead><tbody>
    ${congregacoes.map(c => `<tr>
      <td><input type="checkbox" class="chk-meta-campanha" value="${c.congregacaoId}" /></td>
      <td>${c.nome}</td>
      <td><input type="number" class="valor-meta-campanha" min="0.01" step="0.01" style="max-width:130px;" placeholder="0,00" /></td>
    </tr>`).join("")}
  </tbody></table>`;
}

async function criarCampanhaAcao() {
  const nome = document.getElementById("campanhaNome").value.trim();
  const descricao = document.getElementById("campanhaDescricao").value.trim();
  const dataInicio = document.getElementById("campanhaDataInicio").value;
  const dataFim = document.getElementById("campanhaDataFim").value;
  const resultado = document.getElementById("resultadoNovaCampanha");
  if (!nome || !dataInicio) { resultado.textContent = "Informe o nome e a data de início."; return; }

  const metas = [];
  document.querySelectorAll(".chk-meta-campanha:checked").forEach(chk => {
    const linha = chk.closest("tr");
    const valorMeta = linha.querySelector(".valor-meta-campanha").value;
    if (valorMeta && Number(valorMeta) > 0) metas.push({ congregacaoId: Number(chk.value), metaValor: Number(valorMeta) });
  });
  if (metas.length === 0) { resultado.textContent = "Marque ao menos uma congregação e informe a meta dela."; return; }

  const body = { nome, dataInicio, dataFim: dataFim || undefined, descricao: descricao || undefined, metas };

  const res = await fetchProtegido(`${API_BASE}/campanhas`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("campanhaNome").value = "";
    document.getElementById("campanhaDescricao").value = "";
    document.getElementById("formNovaCampanha").style.display = "none";
    carregarCampanhas();
  }
}

function barraProgressoCampanha(totalArrecadado, metaTotal) {
  const percentual = metaTotal > 0 ? Math.min(100, (totalArrecadado / metaTotal) * 100) : 0;
  return `<div style="background:#e4e4e4; border-radius:8px; overflow:hidden; height:16px; width:100%; max-width:260px;">
    <div style="background: var(--cor-primaria); height:100%; width:${percentual.toFixed(1)}%;"></div>
  </div>
  <small>R$ ${Number(totalArrecadado).toFixed(2)} de R$ ${Number(metaTotal).toFixed(2)} (${percentual.toFixed(1)}%)</small>`;
}

async function carregarCampanhas() {
  const container = document.getElementById("resultadoCampanhas");
  const res = await fetchProtegido(`${API_BASE}/campanhas`);
  const campanhas = await res.json();
  if (!Array.isArray(campanhas) || campanhas.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma campanha cadastrada ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Progresso</th><th>Status</th><th></th></tr></thead><tbody>`;
  campanhas.forEach(c => {
    const statusClasse = c.status === "ATIVA" ? "badge-ativo" : (c.status === "ENCERRADA" ? "badge-licenca" : "badge-desligado");
    html += `<tr>
      <td>${c.nome}${c.totalSorteios > 0 ? ` <small>🎟️ ${c.totalSorteios} sorteio(s)</small>` : ""}</td>
      <td>${barraProgressoCampanha(c.totalArrecadado, c.metaTotal)}</td>
      <td><span class="badge-status ${statusClasse}">${c.status}</span></td>
      <td class="acoes-inline"><button class="btn-link" onclick="verDetalheCampanhaAcao(${c.campanhaId})">Ver detalhe</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function verDetalheCampanhaAcao(campanhaId) {
  const container = document.getElementById("detalheCampanha");
  const res = await fetchProtegido(`${API_BASE}/campanhas/${campanhaId}`);
  const c = await res.json();
  if (c.sucesso === false) { container.innerHTML = `<p class="subtitle">${c.mensagem}</p>`; return; }

  let html = `<hr /><h3>${c.nome}</h3>`;
  if (c.descricao) html += `<p class="subtitle">${c.descricao}</p>`;
  html += `<p class="subtitle">Período: ${c.dataInicio}${c.dataFim ? ` até ${c.dataFim}` : " (sem data de fim)"} — Status: <span class="badge-status ${c.status === "ATIVA" ? "badge-ativo" : (c.status === "ENCERRADA" ? "badge-licenca" : "badge-desligado")}">${c.status}</span></p>`;

  html += `<table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Meta</th><th>Arrecadado</th></tr></thead><tbody>`;
  c.metas.forEach(m => {
    html += `<tr><td>${m.congregacaoNome}</td><td>R$ ${Number(m.metaValor).toFixed(2)}</td><td>R$ ${Number(m.totalArrecadado).toFixed(2)}</td></tr>`;
  });
  html += "</tbody></table>";

  if (authNivel === "GLOBAL" && c.status === "ATIVA") {
    html += `<button class="btn-link btn-link-perigo" onclick="atualizarStatusCampanhaAcao(${campanhaId}, 'ENCERRADA')">🔒 Encerrar campanha</button>
      <button class="btn-link btn-link-perigo" onclick="atualizarStatusCampanhaAcao(${campanhaId}, 'CANCELADA')">Cancelar campanha</button>`;
  }

  // v4.4.1 — Sorteio é um derivado opcional da campanha (cupom físico,
  // vendido a qualquer pessoa; o sistema só guarda prêmios e resultado).
  html += `<h4 style="margin:16px 0 8px; color: var(--cor-primaria);">🎟️ Sorteios desta campanha</h4>
    <div id="listaSorteiosCampanha_${campanhaId}"><p class="subtitle">Carregando…</p></div>`;
  if (authNivel === "GLOBAL" && c.status === "ATIVA") {
    html += `<button class="btn-link" onclick="alternarFormNovoSorteio(${campanhaId})">➕ Novo sorteio</button>
      <div id="formNovoSorteio_${campanhaId}" style="display:none; margin-top:10px;">
        <div class="barra-lista">
          <input type="text" id="sorteioNome_${campanhaId}" placeholder="Nome do sorteio" style="min-width:220px;" />
          <input type="number" id="sorteioPrecoCupom_${campanhaId}" placeholder="Preço do cupom (R$, informativo)" min="0.01" step="0.01" style="max-width:220px;" />
          <input type="date" id="sorteioData_${campanhaId}" />
        </div>
        <div class="input-group">
          <input type="text" id="sorteioDescricao_${campanhaId}" placeholder="Descrição (opcional)" />
        </div>
        <p class="subtitle">Prêmios (um por linha — é o que diferencia o sorteio de uma campanha comum):</p>
        <textarea id="sorteioPremios_${campanhaId}" rows="3" style="width:100%;" placeholder="1º prêmio: uma TV&#10;2º prêmio: uma cesta básica"></textarea>
        <button class="btn-confirmar" style="width:auto;margin-top:8px;" onclick="criarSorteioAcao(${campanhaId})">Criar sorteio</button>
        <p id="resultadoNovoSorteio_${campanhaId}" class="subtitle"></p>
      </div>`;
  }
  container.innerHTML = html;
  carregarSorteiosCampanha(campanhaId);
}

function alternarFormNovoSorteio(campanhaId) {
  const form = document.getElementById(`formNovoSorteio_${campanhaId}`);
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function criarSorteioAcao(campanhaId) {
  const nome = document.getElementById(`sorteioNome_${campanhaId}`).value.trim();
  const descricao = document.getElementById(`sorteioDescricao_${campanhaId}`).value.trim();
  const precoCupom = document.getElementById(`sorteioPrecoCupom_${campanhaId}`).value;
  const dataSorteio = document.getElementById(`sorteioData_${campanhaId}`).value;
  const premiosTexto = document.getElementById(`sorteioPremios_${campanhaId}`).value;
  const resultado = document.getElementById(`resultadoNovoSorteio_${campanhaId}`);
  const premios = premiosTexto.split("\n").map(l => l.trim()).filter(l => l);
  if (!nome || premios.length === 0) { resultado.textContent = "Informe o nome e ao menos um prêmio (um por linha)."; return; }

  const body = { nome, descricao: descricao || undefined, precoCupom: precoCupom ? Number(precoCupom) : undefined, dataSorteio: dataSorteio || undefined, premios };
  const res = await fetchProtegido(`${API_BASE}/campanhas/${campanhaId}/sorteios`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById(`formNovoSorteio_${campanhaId}`).style.display = "none";
    carregarSorteiosCampanha(campanhaId);
  }
}

async function carregarSorteiosCampanha(campanhaId) {
  const container = document.getElementById(`listaSorteiosCampanha_${campanhaId}`);
  if (!container) return;
  const res = await fetchProtegido(`${API_BASE}/campanhas/${campanhaId}/sorteios`);
  const sorteios = await res.json();
  if (!Array.isArray(sorteios) || sorteios.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum sorteio derivado desta campanha ainda.</p>";
    return;
  }
  let html = "";
  for (const s of sorteios) {
    const statusClasse = s.status === "ATIVO" ? "badge-ativo" : (s.status === "REALIZADO" ? "badge-licenca" : "badge-desligado");
    html += `<div style="border:1px solid #e0e0e0; border-radius:8px; padding:10px; margin-bottom:10px;">
      <strong>${s.nome}</strong> <span class="badge-status ${statusClasse}">${s.status}</span>
      ${s.precoCupom ? ` — cupom R$ ${Number(s.precoCupom).toFixed(2)}` : ""}${s.dataSorteio ? ` — sorteio em ${s.dataSorteio}` : ""}
      <br /><small>${s.premiosComGanhador} de ${s.totalPremios} prêmio(s) já com ganhador registrado</small>
      <div id="detalheSorteio_${s.sorteioId}" style="margin-top:8px;"></div>
      <button class="btn-link" onclick="verDetalheSorteioAcao(${campanhaId}, ${s.sorteioId})">Ver prêmios / registrar ganhador</button>
    </div>`;
  }
  container.innerHTML = html;
}

async function verDetalheSorteioAcao(campanhaId, sorteioId) {
  const container = document.getElementById(`detalheSorteio_${sorteioId}`);
  const res = await fetchProtegido(`${API_BASE}/campanhas/${campanhaId}/sorteios/${sorteioId}`);
  const s = await res.json();
  if (s.sucesso === false) { container.innerHTML = `<p class="subtitle">${s.mensagem}</p>`; return; }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Ordem</th><th>Prêmio</th><th>Ganhador</th></tr></thead><tbody>`;
  s.premios.forEach(p => {
    const podeEditar = authNivel === "GLOBAL" && s.status !== "CANCELADO";
    html += `<tr>
      <td>${p.ordem}</td><td>${p.descricao}</td>
      <td>${podeEditar
        ? `<input type="text" id="ganhadorPremio_${p.premioId}" value="${p.nomeGanhador || ""}" placeholder="Nome de quem ganhou" style="max-width:200px;" />
           <button class="btn-link" onclick="registrarGanhadorAcao(${campanhaId}, ${sorteioId}, ${p.premioId})">Salvar</button>`
        : (p.nomeGanhador || "—")}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  if (authNivel === "GLOBAL" && s.status === "ATIVO") {
    html += `<button class="btn-link" onclick="marcarSorteioRealizadoAcao(${campanhaId}, ${sorteioId})">✅ Marcar sorteio como realizado</button>`;
  }
  container.innerHTML = html;
}

async function registrarGanhadorAcao(campanhaId, sorteioId, premioId) {
  const nomeGanhador = document.getElementById(`ganhadorPremio_${premioId}`).value.trim();
  const res = await fetchProtegido(`${API_BASE}/campanhas/${campanhaId}/sorteios/${sorteioId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ premios: [{ premioId, nomeGanhador }] })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { verDetalheSorteioAcao(campanhaId, sorteioId); carregarSorteiosCampanha(campanhaId); }
}

async function marcarSorteioRealizadoAcao(campanhaId, sorteioId) {
  const res = await fetchProtegido(`${API_BASE}/campanhas/${campanhaId}/sorteios/${sorteioId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "REALIZADO" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { verDetalheSorteioAcao(campanhaId, sorteioId); carregarSorteiosCampanha(campanhaId); }
}

async function atualizarStatusCampanhaAcao(campanhaId, status) {
  const acaoTexto = status === "ENCERRADA" ? "encerrar" : "cancelar";
  const motivo = await pedirTexto(`Confirma ${acaoTexto} esta campanha?`, "Digite qualquer texto para confirmar");
  if (motivo === null) return;
  const res = await fetchProtegido(`${API_BASE}/campanhas/${campanhaId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarCampanhas(); verDetalheCampanhaAcao(campanhaId); }
}

// ---- SAÍDAS: CONTAS A PAGAR (v4.5, primeira parte) — Fornecedores +
// Solicitação de Pagamento → aprovação por alçada de valor → pagamento,
// com segregação de funções e saldo do Centro de Custo nunca negativo.
let _categoriasSaidaCache = null;
let _fornecedoresSaidaCache = null;
let _campanhasSaidaCache = null;

async function carregarOpcoesCategoriasSaida() {
  const res = await fetch(`${API_BASE}/catalogos/categoriasSaida`);
  _categoriasSaidaCache = await res.json();
  const select = document.getElementById("saidaTipo");
  if (select) {
    select.innerHTML = _categoriasSaidaCache.filter(c => c.ativa !== false)
      .map(c => `<option value="${c.codigo}">${c.nome} (${c.centroCusto === "GERAL" ? "Geral" : "Local"}${c.tipoFundo === "RESTRITO" ? " — restrito" : ""})</option>`).join("");
  }
}

async function carregarOpcoesFornecedoresSaida() {
  const res = await fetchProtegido(`${API_BASE}/fornecedores`);
  _fornecedoresSaidaCache = await res.json();
  const select = document.getElementById("saidaFornecedor");
  if (select) {
    select.innerHTML = (Array.isArray(_fornecedoresSaidaCache) ? _fornecedoresSaidaCache : [])
      .filter(f => f.ativo !== false)
      .map(f => `<option value="${f.fornecedorId}">${f.nome}${!f.dadosBancariosConfirmados ? " ⚠️ dados bancários pendentes" : ""}</option>`).join("");
  }
}

async function carregarOpcoesCampanhasSaida() {
  const res = await fetchProtegido(`${API_BASE}/campanhas`);
  const campanhas = await res.json();
  _campanhasSaidaCache = Array.isArray(campanhas) ? campanhas.filter(c => c.status === "ATIVA") : [];
  const opcoes = _campanhasSaidaCache.map(c => `<option value="${c.campanhaId}">${c.nome}</option>`).join("");
  const select = document.getElementById("saidaCampanha");
  if (select) select.innerHTML = opcoes;
  const selectReceber = document.getElementById("receberCampanha");
  if (selectReceber) selectReceber.innerHTML = `<option value="">— Sem campanha —</option>` + opcoes;
}

function alternarCampoCampanhaSaida() {
  const tipo = document.getElementById("saidaTipo").value;
  const categoria = (_categoriasSaidaCache || []).find(c => c.codigo === tipo);
  document.getElementById("saidaCampanha").style.display = categoria && categoria.tipoFundo === "RESTRITO" ? "inline-block" : "none";
}

function alternarFormNovoFornecedor() {
  const form = document.getElementById("formNovoFornecedor");
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function salvarFornecedorAcao() {
  const nome = document.getElementById("fornecedorNome").value.trim();
  const cpfCnpj = document.getElementById("fornecedorCpfCnpj").value.trim();
  const tipo = document.getElementById("fornecedorTipo").value;
  const telefone = document.getElementById("fornecedorTelefone").value.trim();
  const email = document.getElementById("fornecedorEmail").value.trim();
  const banco = document.getElementById("fornecedorBanco").value.trim();
  const agencia = document.getElementById("fornecedorAgencia").value.trim();
  const conta = document.getElementById("fornecedorConta").value.trim();
  const tipoConta = document.getElementById("fornecedorTipoConta").value;
  const chavePix = document.getElementById("fornecedorChavePix").value.trim();
  const resultado = document.getElementById("resultadoFornecedor");
  if (!nome || !cpfCnpj) { resultado.textContent = "Informe o nome e o CPF/CNPJ."; return; }

  const body = { nome, cpfCnpj, tipo, telefone: telefone || undefined, email: email || undefined, banco: banco || undefined, agencia: agencia || undefined, conta: conta || undefined, tipoConta: tipoConta || undefined, chavePix: chavePix || undefined };
  const res = await fetchProtegido(`${API_BASE}/fornecedores`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) {
    ["fornecedorNome", "fornecedorCpfCnpj", "fornecedorTelefone", "fornecedorEmail", "fornecedorBanco", "fornecedorAgencia", "fornecedorConta", "fornecedorChavePix"].forEach(id => document.getElementById(id).value = "");
    document.getElementById("formNovoFornecedor").style.display = "none";
    document.getElementById("saidaFornecedor").dataset.montado = "";
    carregarOpcoesFornecedoresSaida();
    carregarFornecedores();
  }
}

async function carregarFornecedores() {
  const container = document.getElementById("resultadoFornecedores");
  const res = await fetchProtegido(`${API_BASE}/fornecedores`);
  const fornecedores = await res.json();
  if (!Array.isArray(fornecedores) || fornecedores.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum fornecedor cadastrado ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Dados bancários</th><th></th></tr></thead><tbody>`;
  fornecedores.forEach(f => {
    html += `<tr>
      <td>${f.nome}</td><td>${f.cpfCnpj}</td>
      <td>${f.dadosBancariosConfirmados ? "<span class='badge-status badge-ativo'>Confirmados</span>" : "<span class='badge-status badge-pendente'>⚠️ Pendente de confirmação</span>"}</td>
      <td>${!f.dadosBancariosConfirmados ? `<button class="btn-link" onclick="confirmarDadosBancariosFornecedorAcao(${f.fornecedorId})">Confirmar</button>` : ""}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function confirmarDadosBancariosFornecedorAcao(fornecedorId) {
  const res = await fetchProtegido(`${API_BASE}/fornecedores/${fornecedorId}/confirmar-dados-bancarios`, { method: "POST" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarFornecedores(); carregarOpcoesFornecedoresSaida(); }
}

function alternarFormNovaSaida() {
  const form = document.getElementById("formNovaSaida");
  form.style.display = form.style.display === "none" ? "block" : "none";
}

// v4.5 (segunda parte) — valor de referência (Reg. Art. 62) a partir do
// qual uma solicitação exige 3 cotações anexadas. Configurável, nunca
// hardcoded — carregado de /api/parametros-saida.
let _valorReferenciaCotacoes = null;

async function carregarValorReferenciaCotacoes() {
  const res = await fetchProtegido(`${API_BASE}/parametros-saida`);
  const data = await res.json();
  _valorReferenciaCotacoes = Number(data.valorReferenciaCotacoes);
  const texto = document.getElementById("valorReferenciaCotacoesTexto");
  if (texto) texto.textContent = _valorReferenciaCotacoes.toFixed(2);
}

function alternarEdicaoValorReferenciaCotacoes() {
  const input = document.getElementById("novoValorReferenciaCotacoes");
  const btn = document.getElementById("btnEditarValorReferencia");
  if (input.style.display === "none") {
    input.value = _valorReferenciaCotacoes;
    input.style.display = "inline-block";
    btn.textContent = "salvar";
  } else {
    salvarValorReferenciaCotacoesAcao();
  }
}

async function salvarValorReferenciaCotacoesAcao() {
  const input = document.getElementById("novoValorReferenciaCotacoes");
  const valor = input.value;
  if (!valor || Number(valor) <= 0) { mostrarToast("Informe um valor maior que zero.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/parametros-saida`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valorReferenciaCotacoes: Number(valor) })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    input.style.display = "none";
    document.getElementById("btnEditarValorReferencia").textContent = "editar";
    carregarValorReferenciaCotacoes();
  }
}

function alternarCotacoesSaida() {
  const valor = Number(document.getElementById("saidaValor").value || 0);
  const container = document.getElementById("cotacoesSaidaContainer");
  const linhas = document.getElementById("cotacoesSaidaLinhas");
  const exige = _valorReferenciaCotacoes != null && valor >= _valorReferenciaCotacoes;
  container.style.display = exige ? "block" : "none";
  if (exige && !linhas.dataset.montado) {
    linhas.innerHTML = [1, 2, 3].map(n => `
      <div class="barra-lista">
        <input type="text" id="cotacaoFornecedorNome_${n}" placeholder="Fornecedor da cotação ${n}" />
        <input type="number" id="cotacaoValor_${n}" placeholder="Valor (R$)" min="0.01" step="0.01" style="max-width:140px;" />
        <input type="file" id="cotacaoDocumento_${n}" accept="image/jpeg,image/png,application/pdf" />
      </div>`).join("");
    linhas.dataset.montado = "1";
  }
}

async function solicitarSaidaAcao() {
  const congregacaoId = document.getElementById("saidaCongregacao").value;
  const fornecedorId = document.getElementById("saidaFornecedor").value;
  const tipo = document.getElementById("saidaTipo").value;
  const descricao = document.getElementById("saidaDescricao").value.trim();
  const valor = document.getElementById("saidaValor").value;
  const campanhaId = document.getElementById("saidaCampanha").value;
  const arquivo = document.getElementById("saidaDocumentoFiscal").files[0];
  const resultado = document.getElementById("resultadoNovaSaida");
  if (!congregacaoId || !fornecedorId || !tipo || !descricao || !valor || !arquivo) {
    resultado.textContent = "Preencha todos os campos e anexe a nota fiscal/recibo.";
    return;
  }
  const categoria = (_categoriasSaidaCache || []).find(c => c.codigo === tipo);
  if (categoria && categoria.tipoFundo === "RESTRITO" && !campanhaId) {
    resultado.textContent = "Esta categoria é de fundo restrito — escolha a campanha de origem.";
    return;
  }

  let cotacoes;
  if (_valorReferenciaCotacoes != null && Number(valor) >= _valorReferenciaCotacoes) {
    cotacoes = [];
    for (const n of [1, 2, 3]) {
      const nome = document.getElementById(`cotacaoFornecedorNome_${n}`).value.trim();
      const valorCotacao = document.getElementById(`cotacaoValor_${n}`).value;
      const arquivoCotacao = document.getElementById(`cotacaoDocumento_${n}`).files[0];
      if (!nome || !valorCotacao || !arquivoCotacao) {
        resultado.textContent = `Preencha as 3 cotações completas (faltou a cotação ${n}).`;
        return;
      }
      cotacoes.push({ fornecedorNome: nome, valor: Number(valorCotacao), documentoBase64: await arquivoParaBase64(arquivoCotacao), mimeType: arquivoCotacao.type });
    }
  }

  const body = {
    congregacaoId, fornecedorId, tipo, descricao, valor: Number(valor),
    campanhaId: (categoria && categoria.tipoFundo === "RESTRITO") ? campanhaId : undefined,
    documentoFiscalBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type,
    cotacoes
  };
  const res = await fetchProtegido(`${API_BASE}/saidas`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("saidaDescricao").value = "";
    document.getElementById("saidaValor").value = "";
    document.getElementById("saidaDocumentoFiscal").value = "";
    document.getElementById("cotacoesSaidaContainer").style.display = "none";
    document.getElementById("cotacoesSaidaLinhas").innerHTML = "";
    document.getElementById("cotacoesSaidaLinhas").dataset.montado = "";
    document.getElementById("formNovaSaida").style.display = "none";
    carregarSaidas();
  }
}

function badgeStatusSaida(status) {
  const mapa = { PENDENTE: "badge-pendente", APROVADA: "badge-licenca", PAGA: "badge-ativo", REJEITADA: "badge-desligado", CANCELADA: "badge-desligado" };
  return `<span class="badge-status ${mapa[status] || "badge-inativo"}">${status}</span>`;
}

async function carregarSaidas() {
  const congregacaoId = document.getElementById("saidaFiltroCongregacao").value;
  const status = document.getElementById("saidaFiltroStatus").value;
  const container = document.getElementById("resultadoSaidas");
  const params = new URLSearchParams();
  if (congregacaoId) params.set("congregacaoId", congregacaoId);
  if (status) params.set("status", status);
  const res = await fetchProtegido(`${API_BASE}/saidas?${params.toString()}`);
  const saidas = await res.json();
  if (!Array.isArray(saidas) || saidas.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma solicitação de pagamento encontrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Fornecedor</th><th>Categoria</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>`;
  saidas.forEach(s => {
    html += `<tr>
      <td>${s.congregacaoNome}</td><td>${s.fornecedorNome}</td><td>${s.categoriaNome}</td>
      <td>R$ ${Number(s.valor).toFixed(2)}${s.possivelDuplicidade ? " ⚠️" : ""}</td><td>${badgeStatusSaida(s.status)}</td>
      <td class="acoes-inline"><button class="btn-link" onclick="verDetalheSaidaAcao(${s.saidaId})">Ver detalhe</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function verDetalheSaidaAcao(saidaId) {
  const container = document.getElementById("detalheSaida");
  const res = await fetchProtegido(`${API_BASE}/saidas/${saidaId}`);
  const s = await res.json();
  if (s.sucesso === false) { container.innerHTML = `<p class="subtitle">${s.mensagem}</p>`; return; }

  let html = `<hr /><h4>${s.fornecedorNome} — R$ ${Number(s.valor).toFixed(2)} ${badgeStatusSaida(s.status)}</h4>
    <p class="subtitle">${s.descricao}${s.campanhaNome ? ` — campanha: ${s.campanhaNome}` : ""}</p>
    <p class="subtitle">Solicitado por ${s.solicitadoPorNome} em ${new Date(s.solicitadoEm).toLocaleString("pt-BR")}</p>
    <p class="subtitle"><a href="${s.documentoFiscalUrl}" target="_blank" rel="noopener">📎 Nota fiscal / recibo</a>${s.comprovantePagamentoUrl ? ` — <a href="${s.comprovantePagamentoUrl}" target="_blank" rel="noopener">📎 Comprovante de pagamento</a>` : ""}</p>`;

  if (s.possivelDuplicidade) {
    html += `<p class="subtitle">⚠️ <strong>Possível duplicidade</strong> — já existe outra solicitação com o mesmo fornecedor e valor nos últimos 7 dias. Confira antes de aprovar.</p>`;
  }
  if (Array.isArray(s.cotacoes) && s.cotacoes.length > 0) {
    html += `<p class="subtitle">Cotações anexadas (Reg. Art. 62):</p><ul>` +
      s.cotacoes.map(c => `<li>${c.fornecedorNome} — R$ ${Number(c.valor).toFixed(2)} — <a href="${c.documentoUrl}" target="_blank" rel="noopener">📎 ver</a></li>`).join("") +
      `</ul>`;
  }
  if (s.motivoRejeicao) html += `<p class="subtitle">Motivo da rejeição: ${s.motivoRejeicao}</p>`;
  if (s.motivoCancelamento) html += `<p class="subtitle">Motivo do cancelamento: ${s.motivoCancelamento}</p>`;

  if (s.status === "PENDENTE" && s.alcada) {
    html += `<p class="subtitle">Alçada exigida: nível ${s.alcada.nivelMinimoAprovador} ou superior, ${s.alcada.quantidadeAprovadores} aprovador(es) distinto(s) — ${s.aprovacoes.length} já aprovou(aram): ${s.aprovacoes.map(a => a.aprovadoPorNome).join(", ") || "ninguém ainda"}.</p>
      <button class="btn-link" onclick="aprovarSaidaAcao(${saidaId})">✅ Aprovar</button>
      <button class="btn-link btn-link-perigo" onclick="rejeitarSaidaAcao(${saidaId})">Rejeitar</button>`;
  }
  if (s.status === "APROVADA") {
    html += `
      <div class="input-group">
        <label>Comprovante de pagamento:</label>
        <input type="file" id="comprovantePagamentoSaida_${saidaId}" accept="image/jpeg,image/png,application/pdf" />
      </div>
      <button class="btn-confirmar" style="width:auto;" onclick="pagarSaidaAcao(${saidaId})">💰 Registrar pagamento</button>`;
  }
  if (["PENDENTE", "APROVADA"].includes(s.status)) {
    html += ` <button class="btn-link btn-link-perigo" onclick="cancelarSaidaAcao(${saidaId})">Cancelar</button>`;
  }
  container.innerHTML = html;
}

async function aprovarSaidaAcao(saidaId) {
  const res = await fetchProtegido(`${API_BASE}/saidas/${saidaId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "APROVAR" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarSaidas(); verDetalheSaidaAcao(saidaId); }
}

async function rejeitarSaidaAcao(saidaId) {
  const motivo = await pedirTexto("Motivo da rejeição", "Ex: documentação insuficiente");
  if (motivo === null) return;
  if (!motivo.trim()) { mostrarToast("Informe o motivo da rejeição.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/saidas/${saidaId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "REJEITAR", motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarSaidas(); verDetalheSaidaAcao(saidaId); }
}

async function pagarSaidaAcao(saidaId) {
  const arquivo = document.getElementById(`comprovantePagamentoSaida_${saidaId}`).files[0];
  if (!arquivo) { mostrarToast("Anexe o comprovante de pagamento.", "erro"); return; }
  const body = { acao: "PAGAR", comprovanteBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type };
  const res = await fetchProtegido(`${API_BASE}/saidas/${saidaId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarSaidas(); verDetalheSaidaAcao(saidaId); }
}

async function cancelarSaidaAcao(saidaId) {
  const motivo = await pedirTexto("Motivo do cancelamento", "Ex: pagamento não é mais necessário");
  if (motivo === null) return;
  if (!motivo.trim()) { mostrarToast("Informe o motivo do cancelamento.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/saidas/${saidaId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "CANCELAR", motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarSaidas(); verDetalheSaidaAcao(saidaId); }
}

// ---- FUNDO FIXO DE CAIXA (v4.5, segunda parte) — petty cash: teto de
// valor + custodiante responsável, saldo sempre calculado (reposições
// menos despesas), nunca marcado manualmente.
function alternarFormNovoFundoFixo() {
  const form = document.getElementById("formNovoFundoFixo");
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function criarFundoFixoAcao() {
  const congregacaoId = document.getElementById("fundoFixoCongregacao").value;
  const valorTeto = document.getElementById("fundoFixoValorTeto").value;
  const custodiantePor = document.getElementById("fundoFixoCustodianteMatricula").value;
  const resultado = document.getElementById("resultadoNovoFundoFixo");
  if (!congregacaoId || !valorTeto || !custodiantePor) {
    resultado.textContent = "Preencha congregação, teto e matrícula do custodiante.";
    return;
  }
  const res = await fetchProtegido(`${API_BASE}/fundos-fixos`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ congregacaoId, valorTeto: Number(valorTeto), custodiantePor: Number(custodiantePor) })
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("fundoFixoValorTeto").value = "";
    document.getElementById("fundoFixoCustodianteMatricula").value = "";
    document.getElementById("formNovoFundoFixo").style.display = "none";
    carregarFundosFixos();
  }
}

async function carregarFundosFixos() {
  const container = document.getElementById("resultadoFundosFixos");
  const res = await fetchProtegido(`${API_BASE}/fundos-fixos`);
  const fundos = await res.json();
  if (!Array.isArray(fundos) || fundos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum Fundo Fixo de Caixa cadastrado ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Custodiante</th><th>Teto</th><th>Saldo atual</th><th>Status</th><th></th></tr></thead><tbody>`;
  fundos.forEach(f => {
    html += `<tr>
      <td>${f.congregacaoNome}</td><td>${f.custodianteNome}</td>
      <td>R$ ${Number(f.valorTeto).toFixed(2)}</td><td>R$ ${Number(f.saldoAtual).toFixed(2)}</td>
      <td><span class="badge-status ${f.status === "ATIVO" ? "badge-ativo" : "badge-inativo"}">${f.status}</span></td>
      <td class="acoes-inline"><button class="btn-link" onclick="verDetalheFundoFixoAcao(${f.fundoId})">Ver detalhe</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function verDetalheFundoFixoAcao(fundoId) {
  const container = document.getElementById("detalheFundoFixo");
  const res = await fetchProtegido(`${API_BASE}/fundos-fixos/${fundoId}`);
  const f = await res.json();
  if (f.sucesso === false) { container.innerHTML = `<p class="subtitle">${f.mensagem}</p>`; return; }

  const resMov = await fetchProtegido(`${API_BASE}/fundos-fixos/${fundoId}/movimentos`);
  const movimentos = await resMov.json();

  let html = `<hr /><h4>${f.congregacaoNome} — custodiante: ${f.custodianteNome}</h4>
    <p class="subtitle">Teto: R$ ${Number(f.valorTeto).toFixed(2)} — Saldo atual: R$ ${Number(f.saldoAtual).toFixed(2)}</p>`;

  if (f.status === "ATIVO") {
    html += `
      <div class="barra-lista">
        <select id="fundoFixoMovTipo_${fundoId}">
          <option value="DESPESA">Despesa</option>
          <option value="REPOSICAO">Reposição</option>
        </select>
        <input type="number" id="fundoFixoMovValor_${fundoId}" placeholder="Valor (R$)" min="0.01" step="0.01" style="max-width:140px;" />
      </div>
      <div class="input-group">
        <input type="text" id="fundoFixoMovDescricao_${fundoId}" placeholder="Descrição" />
      </div>
      <div class="input-group">
        <label>Recibo / comprovante (obrigatório):</label>
        <input type="file" id="fundoFixoMovDocumento_${fundoId}" accept="image/jpeg,image/png,application/pdf" />
      </div>
      <button class="btn-confirmar" style="width:auto;" onclick="registrarMovimentoFundoFixoAcao(${fundoId})">Registrar Movimento</button>
      <p id="resultadoMovimentoFundoFixo_${fundoId}" class="subtitle"></p>`;
  }

  html += `<h4 style="margin:16px 0 8px; color: var(--cor-primaria);">Histórico</h4>`;
  if (!Array.isArray(movimentos) || movimentos.length === 0) {
    html += "<p class='subtitle'>Nenhum movimento registrado ainda.</p>";
  } else {
    html += `<table class="tabela-frequencia"><thead><tr><th>Tipo</th><th>Valor</th><th>Descrição</th><th>Registrado por</th><th></th></tr></thead><tbody>`;
    movimentos.forEach(m => {
      html += `<tr>
        <td>${m.tipo === "DESPESA" ? "Despesa" : "Reposição"}</td><td>R$ ${Number(m.valor).toFixed(2)}</td>
        <td>${m.descricao}</td><td>${m.registradoPorNome}</td>
        <td><a href="${m.documentoUrl}" target="_blank" rel="noopener">📎</a></td>
      </tr>`;
    });
    html += "</tbody></table>";
  }
  container.innerHTML = html;
}

async function registrarMovimentoFundoFixoAcao(fundoId) {
  const tipo = document.getElementById(`fundoFixoMovTipo_${fundoId}`).value;
  const valor = document.getElementById(`fundoFixoMovValor_${fundoId}`).value;
  const descricao = document.getElementById(`fundoFixoMovDescricao_${fundoId}`).value.trim();
  const arquivo = document.getElementById(`fundoFixoMovDocumento_${fundoId}`).files[0];
  const resultado = document.getElementById(`resultadoMovimentoFundoFixo_${fundoId}`);
  if (!valor || !descricao || !arquivo) {
    resultado.textContent = "Preencha o valor, a descrição, e anexe o recibo/comprovante.";
    return;
  }
  const body = { tipo, valor: Number(valor), descricao, documentoBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type };
  const res = await fetchProtegido(`${API_BASE}/fundos-fixos/${fundoId}/movimentos`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) { verDetalheFundoFixoAcao(fundoId); carregarFundosFixos(); }
}

// ---- CONTAS A RECEBER (v4.6) — valor esperado, ainda não recebido; não
// conta no Centro de Custo até a confirmação virar um LancamentoTesouraria
// de verdade. "Vencido" é calculado na leitura, nunca marcado à mão.
function alternarFormNovaContaReceber() {
  const form = document.getElementById("formNovaContaReceber");
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function carregarOpcoesDizimistasReceber() {
  const congregacaoId = document.getElementById("receberCongregacao").value;
  const select = document.getElementById("receberDizimista");
  if (!congregacaoId) { select.innerHTML = `<option value="">— Nome avulso (abaixo) —</option>`; return; }
  const res = await fetchProtegido(`${API_BASE}/dizimistas?congregacaoId=${congregacaoId}`);
  const dizimistas = await res.json();
  select.innerHTML = `<option value="">— Nome avulso (abaixo) —</option>` +
    (Array.isArray(dizimistas) ? dizimistas.map(d => `<option value="${d.dizimistaId}">${d.nome}</option>`).join("") : "");
}

async function salvarContaReceberAcao() {
  const congregacaoId = document.getElementById("receberCongregacao").value;
  const dizimistaId = document.getElementById("receberDizimista").value;
  const nomeAvulso = document.getElementById("receberNomeAvulso").value.trim();
  const tipo = document.getElementById("receberTipo").value;
  const valor = document.getElementById("receberValor").value;
  const dataVencimento = document.getElementById("receberDataVencimento").value;
  const campanhaId = document.getElementById("receberCampanha").value;
  const descricao = document.getElementById("receberDescricao").value.trim();
  const resultado = document.getElementById("resultadoNovaContaReceber");
  if (!congregacaoId || !tipo || !valor || !dataVencimento) {
    resultado.textContent = "Preencha congregação, categoria, valor e data de vencimento.";
    return;
  }
  const body = {
    congregacaoId, dizimistaId: dizimistaId || undefined, nomeAvulso: dizimistaId ? undefined : (nomeAvulso || undefined),
    tipo, descricao: descricao || undefined, valor: Number(valor), dataVencimento, campanhaId: campanhaId || undefined
  };
  const res = await fetchProtegido(`${API_BASE}/contas-receber`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("receberNomeAvulso").value = "";
    document.getElementById("receberValor").value = "";
    document.getElementById("receberDataVencimento").value = "";
    document.getElementById("receberDescricao").value = "";
    document.getElementById("formNovaContaReceber").style.display = "none";
    carregarContasReceber();
  }
}

function badgeStatusContaReceber(status) {
  const mapa = { PREVISTO: "badge-licenca", VENCIDO: "badge-pendente", RECEBIDO: "badge-ativo", CANCELADO: "badge-desligado" };
  return `<span class="badge-status ${mapa[status] || "badge-inativo"}">${status}</span>`;
}

async function carregarContasReceber() {
  const congregacaoId = document.getElementById("receberFiltroCongregacao").value;
  const status = document.getElementById("receberFiltroStatus").value;
  const container = document.getElementById("resultadoContasReceber");
  const params = new URLSearchParams();
  if (congregacaoId) params.set("congregacaoId", congregacaoId);
  if (status) params.set("status", status);
  const res = await fetchProtegido(`${API_BASE}/contas-receber?${params.toString()}`);
  const contas = await res.json();
  if (!Array.isArray(contas) || contas.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma conta a receber encontrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Nome/Descrição</th><th>Categoria</th><th>Valor</th><th>Vencimento</th><th>Status</th><th></th></tr></thead><tbody>`;
  contas.forEach(c => {
    html += `<tr>
      <td>${c.congregacaoNome}</td><td>${c.dizimistaNome || c.nomeAvulso || c.descricao || "—"}</td><td>${c.categoriaNome || c.tipo}</td>
      <td>R$ ${Number(c.valor).toFixed(2)}</td><td>${c.dataVencimento}</td><td>${badgeStatusContaReceber(c.status)}</td>
      <td class="acoes-inline"><button class="btn-link" onclick="verDetalheContaReceberAcao(${c.contaReceberId})">Ver detalhe</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function verDetalheContaReceberAcao(contaReceberId) {
  const container = document.getElementById("detalheContaReceber");
  const res = await fetchProtegido(`${API_BASE}/contas-receber/${contaReceberId}`);
  const c = await res.json();
  if (c.sucesso === false) { container.innerHTML = `<p class="subtitle">${c.mensagem}</p>`; return; }

  let html = `<hr /><h4>${c.dizimistaNome || c.nomeAvulso || c.descricao || "—"} — R$ ${Number(c.valor).toFixed(2)} ${badgeStatusContaReceber(c.status)}</h4>
    <p class="subtitle">${c.categoriaNome} — vencimento ${c.dataVencimento}${c.campanhaNome ? ` — campanha: ${c.campanhaNome}` : ""}</p>`;
  if (c.diasParaVencimento < 0 && c.status !== "RECEBIDO" && c.status !== "CANCELADO") {
    html += `<p class="subtitle">⚠️ Vencida há ${Math.abs(c.diasParaVencimento)} dia(s).</p>`;
  } else if (c.status === "PREVISTO") {
    html += `<p class="subtitle">Faltam ${c.diasParaVencimento} dia(s) pro vencimento.</p>`;
  }
  if (c.motivoCancelamento) html += `<p class="subtitle">Motivo do cancelamento: ${c.motivoCancelamento}</p>`;

  if (c.status === "PREVISTO" || c.status === "VENCIDO") {
    html += `
      <h4 style="margin:16px 0 8px; color: var(--cor-primaria);">Confirmar recebimento</h4>
      <div class="barra-lista">
        <select id="receberConfirmarForma_${contaReceberId}">
          <option value="DINHEIRO">Dinheiro</option>
          <option value="PIX">PIX</option>
          <option value="MISTO">Misto</option>
        </select>
        <input type="number" id="receberConfirmarValorPix_${contaReceberId}" placeholder="Parte em PIX (se misto)" min="0.01" step="0.01" style="max-width:170px;" />
        <input type="month" id="receberConfirmarMes_${contaReceberId}" value="${mesAtualFinanceiro()}" style="max-width:150px;" />
      </div>
      <div class="input-group">
        <label>Comprovante (opcional):</label>
        <input type="file" id="receberConfirmarComprovante_${contaReceberId}" accept="image/jpeg,image/png,application/pdf" />
      </div>
      <button class="btn-confirmar" style="width:auto;" onclick="confirmarContaReceberAcao(${contaReceberId})">✅ Confirmar Recebimento</button>
      <button class="btn-link btn-link-perigo" onclick="cancelarContaReceberAcao(${contaReceberId})">Cancelar</button>
      <p id="resultadoConfirmarContaReceber_${contaReceberId}" class="subtitle"></p>`;
  }
  if (c.lancamentoId) {
    html += `<p class="subtitle">Virou o lançamento nº ${c.lancamentoId} na Tesouraria.</p>`;
  }
  container.innerHTML = html;
}

async function confirmarContaReceberAcao(contaReceberId) {
  const formaPagamento = document.getElementById(`receberConfirmarForma_${contaReceberId}`).value;
  const valorPix = document.getElementById(`receberConfirmarValorPix_${contaReceberId}`).value;
  const mesReferencia = document.getElementById(`receberConfirmarMes_${contaReceberId}`).value;
  const arquivo = document.getElementById(`receberConfirmarComprovante_${contaReceberId}`).files[0];
  const resultado = document.getElementById(`resultadoConfirmarContaReceber_${contaReceberId}`);
  if (!mesReferencia) { resultado.textContent = "Informe o mês de referência."; return; }
  const body = { acao: "CONFIRMAR", formaPagamento, mesReferencia };
  if (formaPagamento === "MISTO") body.valorPix = Number(valorPix);
  if (arquivo) { body.comprovanteBase64 = await arquivoParaBase64(arquivo); body.mimeType = arquivo.type; }
  const res = await fetchProtegido(`${API_BASE}/contas-receber/${contaReceberId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) { carregarContasReceber(); verDetalheContaReceberAcao(contaReceberId); }
}

async function cancelarContaReceberAcao(contaReceberId) {
  const motivo = await pedirTexto("Motivo do cancelamento", "Ex: acordo desfeito");
  if (motivo === null) return;
  if (!motivo.trim()) { mostrarToast("Informe o motivo do cancelamento.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/contas-receber/${contaReceberId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "CANCELAR", motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarContasReceber(); verDetalheContaReceberAcao(contaReceberId); }
}

async function carregarOpcoesDizimistas() {
  const congregacaoId = document.getElementById("financeiroLancCongregacao").value;
  const select = document.getElementById("financeiroLancDizimista");
  if (!congregacaoId) { select.innerHTML = `<option value="">— Nome avulso (abaixo) —</option>`; return; }
  const res = await fetchProtegido(`${API_BASE}/dizimistas?congregacaoId=${congregacaoId}`);
  const dizimistas = await res.json();
  select.innerHTML = `<option value="">— Nome avulso (abaixo) —</option>` +
    (Array.isArray(dizimistas) ? dizimistas.map(d => `<option value="${d.dizimistaId}">${d.nome}</option>`).join("") : "");
}

async function salvarDizimistaAcao() {
  const congregacaoId = document.getElementById("financeiroLancCongregacao").value;
  const nome = document.getElementById("financeiroNovoDizimistaNome").value.trim();
  const msg = document.getElementById("resultadoDizimista");
  if (!congregacaoId || !nome) { msg.textContent = "Escolha a congregação e informe o nome."; return; }
  const res = await fetchProtegido(`${API_BASE}/dizimistas`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ congregacaoId, nome })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("financeiroNovoDizimistaNome").value = "";
    carregarOpcoesDizimistas();
  }
}

function alternarComprovanteLancamento() {
  const forma = document.getElementById("financeiroLancForma").value;
  document.getElementById("cxComprovanteLancamento").style.display = forma === "PIX" || forma === "MISTO" ? "block" : "none";
  document.getElementById("cxValorPixLancamento").style.display = forma === "MISTO" ? "block" : "none";
}

function arquivoParaBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(",")[1]);
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}

// "Outra entrada" (bazar, campanha, evento) é dinheiro institucional, não
// de uma pessoa — troca dizimista/nome avulso por uma descrição livre.
async function salvarLancamentoTesourariaAcao() {
  const msg = document.getElementById("resultadoLancamentoTesouraria");
  const congregacaoId = document.getElementById("financeiroLancCongregacao").value;
  const mesReferencia = document.getElementById("financeiroLancMes").value;
  const dizimistaId = document.getElementById("financeiroLancDizimista").value;
  const nomeAvulso = document.getElementById("financeiroLancNomeAvulso").value.trim();
  const tipo = document.getElementById("financeiroLancTipo").value;
  const descricao = document.getElementById("financeiroLancDescricao").value.trim();
  const valor = document.getElementById("financeiroLancValor").value;
  const formaPagamento = document.getElementById("financeiroLancForma").value;
  const valorPix = document.getElementById("financeiroLancValorPix").value;
  const arquivoComprovante = document.getElementById("financeiroLancComprovante").files[0];

  if (!congregacaoId || !mesReferencia || !valor) {
    msg.textContent = "Preencha congregação, mês e valor.";
    return;
  }
  if (!dizimistaId && !nomeAvulso && !descricao) {
    msg.textContent = "Informe o dizimista, um nome avulso, ou ao menos uma descrição da origem.";
    return;
  }
  if (formaPagamento === "MISTO" && !valorPix) {
    msg.textContent = "Em pagamento misto, informe o valor pago via PIX.";
    return;
  }

  const body = { congregacaoId, mesReferencia, tipo, valor, formaPagamento };
  if (dizimistaId) body.dizimistaId = dizimistaId; else if (nomeAvulso) body.nomeAvulso = nomeAvulso;
  if (descricao) body.descricao = descricao;
  if (formaPagamento === "MISTO") body.valorPix = valorPix;
  if (arquivoComprovante) {
    body.comprovanteBase64 = await arquivoParaBase64(arquivoComprovante);
    body.mimeType = arquivoComprovante.type;
  }

  const res = await fetchProtegido(`${API_BASE}/tesouraria-lancamentos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("financeiroLancNomeAvulso").value = "";
    document.getElementById("financeiroLancDescricao").value = "";
    document.getElementById("financeiroLancValor").value = "";
    document.getElementById("financeiroLancValorPix").value = "";
    document.getElementById("financeiroLancComprovante").value = "";
    carregarLancamentosTesouraria();
  }
}

// Prefere o nome já resolvido pelo backend (categoriaNome, quando o
// endpoint faz o LEFT JOIN); senão busca no cache de categorias carregado
// nesta sessão do painel financeiro.
function rotuloTipoLancamento(tipoOuLancamento) {
  if (typeof tipoOuLancamento === "object" && tipoOuLancamento.categoriaNome) return tipoOuLancamento.categoriaNome;
  const tipo = typeof tipoOuLancamento === "object" ? tipoOuLancamento.tipo : tipoOuLancamento;
  return nomeCategoriaEntrada(tipo);
}

async function carregarLancamentosTesouraria() {
  const congregacaoId = document.getElementById("financeiroLancCongregacao").value;
  const mesReferencia = document.getElementById("financeiroLancMes").value;
  const container = document.getElementById("resultadoLancamentosTesouraria");
  if (!congregacaoId || !mesReferencia) { container.innerHTML = ""; return; }
  const res = await fetchProtegido(`${API_BASE}/tesouraria-lancamentos?congregacaoId=${congregacaoId}&mesReferencia=${mesReferencia}`);
  const lancamentos = await res.json();
  if (!Array.isArray(lancamentos) || lancamentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum lançamento neste mês ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th></th><th>Termo</th><th>Nome/Descrição</th><th>Categoria</th><th>Valor</th><th>Forma</th><th>Situação</th><th>Contabilização</th><th></th></tr></thead><tbody>`;
  lancamentos.forEach(l => {
    const formaTexto = l.formaPagamento === "MISTO"
      ? `Misto (PIX R$ ${Number(l.valorPix).toFixed(2)} + dinheiro R$ ${(Number(l.valor) - Number(l.valorPix)).toFixed(2)})`
      : l.formaPagamento;
    const comprovanteTag = l.comprovanteUrl
      ? ` <a href="${l.comprovanteUrl}" target="_blank" rel="noopener">📎</a>`
      : (l.conciliacaoId ? ` <span class="badge-status badge-ativo">conciliado em lote</span>`
        : (l.comprovantePendente ? ` <span class="badge-status badge-licenca">⚠️ comprovante pendente</span>` : ""));
    // v4.3 — autolançamento do dizimista aguardando confirmação do
    // Tesoureiro nunca tem Termo nº ainda (só nasce na confirmação).
    let statusTag;
    if (l.status === "CANCELADO") {
      statusTag = `<span class="badge-status badge-desligado">CANCELADO</span><br /><small>${l.motivoCancelamento || ""}</small>`;
    } else if (l.origem === "AUTOLANCAMENTO" && l.statusConfirmacao === "PENDENTE") {
      statusTag = `<span class="badge-status badge-pendente">Autolançamento — aguardando confirmação</span>`;
    } else if (l.origem === "AUTOLANCAMENTO" && l.statusConfirmacao === "REJEITADO") {
      statusTag = `<span class="badge-status badge-desligado">Autolançamento rejeitado</span><br /><small>${l.motivoRejeicaoConfirmacao || ""}</small>`;
    } else if (l.origem === "AUTOLANCAMENTO") {
      statusTag = `<span class="badge-status badge-ativo">Confirmado (comprovante do dizimista)</span>`;
    } else {
      statusTag = `<span class="badge-status badge-ativo">Ativo</span>`;
    }
    // v4.1.2 — "contabilizado" (dentro de um Fechamento) vs "pendente" (mês
    // ainda aberto) era invisível antes; pedido explícito pra deixar claro.
    const contabilizacaoTag = l.contabilizado
      ? `<span class="badge-status badge-ativo">Contabilizado</span>`
      : `<span class="badge-status badge-licenca">Pendente de fechamento</span>`;
    const podeConciliar = !l.fechamentoId && l.status === "ATIVO" && l.comprovantePendente && ["PIX", "MISTO"].includes(l.formaPagamento);
    const valorPixParcela = l.formaPagamento === "MISTO" ? l.valorPix : l.valor;
    const pendenteConfirmacao = l.origem === "AUTOLANCAMENTO" && l.statusConfirmacao === "PENDENTE";
    const confirmadoAutolancamento = l.origem === "AUTOLANCAMENTO" && l.statusConfirmacao === "CONFIRMADO";
    let acoes = "";
    if (pendenteConfirmacao && l.status === "ATIVO") {
      acoes = `<button class="btn-link" onclick="confirmarAutolancamentoAcao(${l.lancamentoId}, 'CONFIRMAR')">✅ Confirmar</button>
        <button class="btn-link btn-link-perigo" onclick="confirmarAutolancamentoAcao(${l.lancamentoId}, 'REJEITAR')">Rejeitar</button>`;
    } else if (!l.fechamentoId && l.status === "ATIVO" && !confirmadoAutolancamento) {
      acoes = `<button class="btn-link btn-link-perigo" onclick="cancelarLancamentoTesourariaAcao(${l.lancamentoId}, ${l.termoNumero})">Cancelar</button>`;
      if (l.comprovantePendente) {
        acoes += ` <button class="btn-link" onclick="anexarComprovanteTesourariaAcao(${l.lancamentoId})">Anexar comprovante</button>`;
      }
    }
    html += `<tr>
      <td>${podeConciliar ? `<input type="checkbox" class="chk-conciliar-pix" value="${l.lancamentoId}" data-valor="${valorPixParcela}" onchange="recalcularTotalConciliacaoPix()" />` : ""}</td>
      <td>${l.termoNumero || "—"}</td>
      <td>${l.dizimistaNome || l.nomeAvulso || l.descricao}</td>
      <td>${rotuloTipoLancamento(l)}</td>
      <td>R$ ${Number(l.valor).toFixed(2)}</td>
      <td>${formaTexto}${comprovanteTag}</td>
      <td>${statusTag}</td>
      <td>${contabilizacaoTag}</td>
      <td class="acoes-inline">${acoes}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

// Soma automática do valor total sugerido no extrato, conforme os PIX
// selecionados pra conciliação em lote — evita ter que somar de cabeça.
function recalcularTotalConciliacaoPix() {
  const marcados = document.querySelectorAll(".chk-conciliar-pix:checked");
  const total = Array.from(marcados).reduce((soma, chk) => soma + Number(chk.dataset.valor), 0);
  const campo = document.getElementById("financeiroConciliacaoValorTotal");
  if (marcados.length > 0) campo.value = total.toFixed(2);
}

async function conciliarPixSelecionadosAcao() {
  const congregacaoId = document.getElementById("financeiroLancCongregacao").value;
  const mesReferencia = document.getElementById("financeiroLancMes").value;
  const msg = document.getElementById("resultadoConciliacaoPix");
  const marcados = Array.from(document.querySelectorAll(".chk-conciliar-pix:checked")).map(chk => Number(chk.value));
  const valorTotal = document.getElementById("financeiroConciliacaoValorTotal").value;
  const arquivo = document.getElementById("financeiroConciliacaoComprovante").files[0];

  if (marcados.length === 0) { msg.textContent = "Marque ao menos um lançamento pendente."; return; }
  if (!valorTotal || !arquivo) { msg.textContent = "Informe o valor total e anexe o extrato/comprovante."; return; }

  const body = {
    congregacaoId, mesReferencia, lancamentoIds: marcados, valorTotal,
    comprovanteBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type
  };
  const res = await fetchProtegido(`${API_BASE}/tesouraria-conciliacao`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("financeiroConciliacaoValorTotal").value = "";
    document.getElementById("financeiroConciliacaoComprovante").value = "";
    carregarLancamentosTesouraria();
  }
}

// ---- DIZIMISTAS DO MÊS (v4.1.2) — quem já contribuiu e quem ainda não ----
async function carregarDizimistasMes() {
  const congregacaoId = document.getElementById("financeiroDizCongregacao").value;
  const mesReferencia = document.getElementById("financeiroDizMes").value;
  const container = document.getElementById("resultadoDizimistasMes");
  if (!congregacaoId || !mesReferencia) { container.innerHTML = ""; return; }

  const res = await fetchProtegido(`${API_BASE}/tesouraria-dizimistas-mes?congregacaoId=${congregacaoId}&mesReferencia=${mesReferencia}`);
  const data = await res.json();
  if (data.sucesso === false) { container.innerHTML = `<p class="subtitle">${data.mensagem}</p>`; return; }

  let html = `<p class="subtitle"><strong>${data.totalContribuiram} de ${data.totalDizimistas}</strong> dizimistas cadastrados já contribuíram este mês.</p>
    <table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Contribuiu?</th><th>Total no mês</th></tr></thead><tbody>`;
  data.dizimistas.forEach(d => {
    html += `<tr>
      <td>${d.nome}</td>
      <td>${d.contribuiu ? "<span class='badge-status badge-ativo'>Sim</span>" : "<span class='badge-status badge-inativo'>Ainda não</span>"}</td>
      <td>R$ ${Number(d.totalContribuido).toFixed(2)}</td>
    </tr>`;
  });
  html += "</tbody></table>";

  if (data.avulsos.length > 0) {
    html += `<h4 style="margin:16px 0 10px; color: var(--cor-primaria);">Contribuições avulsas (sem cadastro de dizimista)</h4>
      <table class="tabela-frequencia"><thead><tr><th>Nome</th><th>Total no mês</th></tr></thead><tbody>`;
    data.avulsos.forEach(a => {
      html += `<tr><td>${a.nome}</td><td>R$ ${Number(a.totalContribuido).toFixed(2)}</td></tr>`;
    });
    html += "</tbody></table>";
  }
  container.innerHTML = html;
}

async function cancelarLancamentoTesourariaAcao(lancamentoId, termoNumero) {
  const motivo = await pedirTexto(`Motivo do cancelamento do Termo nº ${termoNumero}`, "Ex: valor digitado errado, folha arrancada do bloco");
  if (motivo === null) return;
  if (!motivo.trim()) { mostrarToast("Informe o motivo do cancelamento.", "erro"); return; }
  const res = await fetchProtegido(`${API_BASE}/tesouraria-lancamentos/${lancamentoId}`, {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarLancamentosTesouraria();
}

// v4.3 — o Tesoureiro Local confirma (viu o dinheiro/PIX cair) ou rejeita
// um autolançamento do dizimista. O Termo nº só é gerado na confirmação.
async function confirmarAutolancamentoAcao(lancamentoId, acaoConfirmacao) {
  let motivo;
  if (acaoConfirmacao === "REJEITAR") {
    motivo = await pedirTexto("Motivo da rejeição", "Ex: valor não confere com o recebido");
    if (motivo === null) return;
    if (!motivo.trim()) { mostrarToast("Informe o motivo da rejeição.", "erro"); return; }
  }
  const res = await fetchProtegido(`${API_BASE}/tesouraria-autolancamento-confirmar/${lancamentoId}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: acaoConfirmacao, motivo })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarLancamentosTesouraria();
}

// v4.1.4 — só a Tesouraria Geral aprova/rejeita "Outra entrada" (mesmo
// princípio de RegistrarRepasseTesouraria: quem confere nunca é quem lançou).
async function anexarComprovanteTesourariaAcao(lancamentoId) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,application/pdf";
  input.onchange = async () => {
    const arquivo = input.files[0];
    if (!arquivo) return;
    const body = { comprovanteBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type };
    const res = await fetchProtegido(`${API_BASE}/tesouraria-lancamentos/${lancamentoId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const data = await res.json();
    avisarResultado(data);
    if (data.sucesso) carregarLancamentosTesouraria();
  };
  input.click();
}

async function carregarResumoFechamento() {
  const congregacaoId = document.getElementById("financeiroFechCongregacao").value;
  const mesReferencia = document.getElementById("financeiroFechMes").value;
  const container = document.getElementById("resultadoResumoFechamento");
  if (!congregacaoId || !mesReferencia) { container.innerHTML = ""; return; }

  const res = await fetchProtegido(`${API_BASE}/tesouraria-relatorio?congregacaoId=${congregacaoId}&mesReferencia=${mesReferencia}`);
  const data = await res.json();
  if (!data.sucesso) { container.innerHTML = `<p class="subtitle">${data.mensagem || "Erro ao carregar."}</p>`; return; }

  const f = data.fechamento;
  const linhaValor = (rotulo, valor) => `<tr><td>${rotulo}</td><td>R$ ${Number(valor).toFixed(2)}</td></tr>`;

  if (!f) {
    container.innerHTML = `
      <p class="subtitle">Mês ainda aberto — ${data.lancamentos.length} lançamento(s) registrado(s).</p>
      <button class="btn-confirmar" style="width:auto;" onclick="fecharMesTesourariaAcao(${congregacaoId}, '${mesReferencia}')">🔒 Fechar mês</button>
      <p id="resultadoFecharMes" class="subtitle"></p>`;
    return;
  }

  let html = `<table class="tabela-frequencia">
    <tbody>
      ${linhaValor("Total Recebido", f.totalRecebido)}
      ${linhaValor("Aluguel", f.valorAluguel)}
      ${linhaValor("Lote", f.valorLote)}
      ${linhaValor("Total Final", f.totalFinal)}
      ${linhaValor(`Centro de Custo Local (${f.percentualRetencaoLocal}%)`, f.valorRetidoLocal)}
      ${linhaValor(`Centro de Custo Geral (${(100 - f.percentualRetencaoLocal).toFixed(2)}%)`, f.valorRepasseGeral)}
    </tbody>
  </table>
  <!-- v4.1.3 — hoje existe uma única conta bancária pra toda a
       denominação: não há "envio" físico da congregação pra Geral, os 40%
       ficam retidos como saldo virtual (Centro de Custo Local) até a
       Tesouraria Geral conferir o fechamento e liberar. -->
  <p class="subtitle">Situação: <span class="badge-status ${f.status === "REPASSADO" ? "badge-ativo" : "badge-licenca"}">${f.status === "REPASSADO" ? "Saldo liberado pela Tesouraria Geral" : "Aguardando liberação da Tesouraria Geral"}</span>${f.dataRepasse ? ` — liberado em ${new Date(f.dataRepasse).toLocaleDateString("pt-BR")}${f.formaRepasse ? ` via ${f.formaRepasse}` : ""}` : ""}</p>`;

  if (f.status !== "REPASSADO") {
    if (authNivel === "GLOBAL") {
      html += `
        <hr />
        <h4 style="margin:0 0 10px; color: var(--cor-primaria);">✅ Tesouraria Geral: conferir e liberar</h4>
        <div class="input-group">
          <label>Forma do repasse (se já houver movimentação real registrada):</label>
          <select id="financeiroFormaRepasse">
            <option value="PIX">PIX</option>
            <option value="DEPOSITO">Depósito bancário</option>
            <option value="DINHEIRO">Dinheiro (entregue em mãos)</option>
          </select>
        </div>
        <div class="input-group">
          <label>Comprovante (opcional):</label>
          <input type="file" id="financeiroComprovanteRepasse" accept="image/jpeg,image/png,application/pdf" />
        </div>
        <button class="btn-confirmar" style="width:auto;" onclick="registrarRepasseTesourariaAcao(${congregacaoId}, '${mesReferencia}')">✅ Conferir e liberar saldo local</button>
        <p id="resultadoRepasse" class="subtitle"></p>`;
    } else {
      html += `<p class="subtitle">Só a Tesouraria Geral pode conferir e liberar este saldo.</p>`;
    }
  }
  container.innerHTML = html;
}

async function fecharMesTesourariaAcao(congregacaoId, mesReferencia) {
  if (!(await confirmarAcao("Fechar este mês? Não será mais possível lançar entradas nele.", "Fechar mês"))) return;
  const res = await fetchProtegido(`${API_BASE}/tesouraria-fechamento`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ congregacaoId, mesReferencia })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarResumoFechamento();
  else { const el = document.getElementById("resultadoFecharMes"); if (el) el.textContent = data.mensagem; }
}

async function registrarRepasseTesourariaAcao(congregacaoId, mesReferencia) {
  // Precisa buscar o fechamentoId de novo — RelatorioTesouraria não devolve
  // o id (só os dados do fechamento), então lê direto do consolidado.
  const resFechamentos = await fetchProtegido(`${API_BASE}/tesouraria-fechamentos?mesReferencia=${mesReferencia}`);
  const dataFechamentos = await resFechamentos.json();
  const alvo = (dataFechamentos.fechamentos || []).find(f => f.congregacaoId === Number(congregacaoId));
  if (!alvo) { mostrarToast("Fechamento não encontrado.", "erro"); return; }

  const arquivo = document.getElementById("financeiroComprovanteRepasse").files[0];
  const body = { formaRepasse: document.getElementById("financeiroFormaRepasse").value };
  if (arquivo) { body.comprovanteBase64 = await arquivoParaBase64(arquivo); body.mimeType = arquivo.type; }

  const res = await fetchProtegido(`${API_BASE}/tesouraria-repasse/${alvo.fechamentoId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarResumoFechamento();
}

async function gerarRelatorioTesourariaAcao(modo) {
  const congregacaoId = document.getElementById("financeiroRelCongregacao").value;
  const mesReferencia = document.getElementById("financeiroRelMes").value;
  const container = document.getElementById("resultadoRelatorioTesouraria");
  if (!congregacaoId || !mesReferencia) { mostrarToast("Escolha a congregação e o mês.", "erro"); return; }

  const res = await fetchProtegido(`${API_BASE}/tesouraria-relatorio?congregacaoId=${congregacaoId}&mesReferencia=${mesReferencia}&modo=${modo}`);
  const data = await res.json();
  if (!data.sucesso) { container.innerHTML = `<p class="subtitle">${data.mensagem || "Erro ao gerar relatório."}</p>`; return; }

  let html = `<h4>${data.congregacaoNome} — ${data.mesReferencia} (${modo === "mural" ? "versão mural, sem valores" : "versão completa"})</h4>
    <table class="tabela-frequencia"><thead><tr><th>Termo</th><th>Nome</th><th>Tipo</th>${modo === "mural" ? "" : "<th>Valor</th><th>Forma</th>"}</tr></thead><tbody>`;
  data.lancamentos.forEach(l => {
    // Cancelado (folha arrancada do bloco físico) nunca some da numeração —
    // continua aparecendo no relatório, marcado como tal, com o motivo.
    if (l.status === "CANCELADO") {
      html += `<tr style="opacity:.6;"><td>${l.termoNumero}</td><td colspan="${modo === "mural" ? 2 : 4}"><em>CANCELADO — ${l.motivoCancelamento || "sem motivo registrado"}</em></td></tr>`;
      return;
    }
    html += `<tr><td>${l.termoNumero}</td><td>${l.nome}</td><td>${rotuloTipoLancamento(l.tipo)}</td>${modo === "mural" ? "" : `<td>R$ ${Number(l.valor).toFixed(2)}</td><td>${l.formaPagamento}</td>`}</tr>`;
  });
  html += "</tbody></table>";
  if (data.fechamento) {
    const f = data.fechamento;
    html += `<p class="subtitle">Total Recebido: R$ ${Number(f.totalRecebido).toFixed(2)} · Total Final: R$ ${Number(f.totalFinal).toFixed(2)} ·
      Repasse Geral: R$ ${Number(f.valorRepasseGeral).toFixed(2)}</p>`;
  }
  container.innerHTML = html;
}

async function carregarParametrosTesouraria() {
  const congregacaoId = document.getElementById("financeiroParamCongregacao").value;
  if (!congregacaoId) return;
  const res = await fetchProtegido(`${API_BASE}/tesouraria-parametros/${congregacaoId}`);
  const data = await res.json();
  if (data.sucesso === false) return;
  document.getElementById("financeiroParamAluguel").value = data.valorAluguelMensal || "";
  document.getElementById("financeiroParamLote").value = data.valorLoteMensal || "";
  document.getElementById("financeiroParamPercentual").value = data.percentualRetencaoLocal;
}

async function salvarParametrosTesourariaAcao() {
  const congregacaoId = document.getElementById("financeiroParamCongregacao").value;
  const msg = document.getElementById("resultadoParametrosTesouraria");
  if (!congregacaoId) { msg.textContent = "Escolha a congregação."; return; }
  const body = {
    valorAluguelMensal: document.getElementById("financeiroParamAluguel").value || null,
    valorLoteMensal: document.getElementById("financeiroParamLote").value || null,
    percentualRetencaoLocal: document.getElementById("financeiroParamPercentual").value
  };
  const res = await fetchProtegido(`${API_BASE}/tesouraria-parametros/${congregacaoId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem;
}

async function carregarConsolidadoTesouraria() {
  const mesReferencia = document.getElementById("financeiroConsolidadoMes").value;
  const container = document.getElementById("resultadoConsolidadoTesouraria");
  const qs = mesReferencia ? `?mesReferencia=${mesReferencia}` : "";
  const res = await fetchProtegido(`${API_BASE}/tesouraria-fechamentos${qs}`);
  const data = await res.json();
  const fechamentos = data.fechamentos || [];

  if (fechamentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum fechamento no seu escopo para este período.</p>";
    return;
  }
  // v4.1.3 — Centro de Custo: conta única pra toda a denominação, então
  // "liberado" (Status=REPASSADO) é o que a Geral já conferiu e cada
  // congregação já pode gastar; "pendente" ainda está no caixa único
  // esperando conferência.
  let html = `<p class="subtitle"><strong>Total Recebido (escopo):</strong> R$ ${data.consolidado.totalRecebido.toFixed(2)} ·
    <strong>Centro de Custo Local (total):</strong> R$ ${data.consolidado.valorRetidoLocal.toFixed(2)} ·
    <strong>Centro de Custo Geral (total):</strong> R$ ${data.consolidado.valorRepasseGeral.toFixed(2)}</p>`;

  if (data.centroCustoGeral) {
    html += `<div class="cartao-perfil">
      <p class="linha-perfil"><strong>🏛️ Centro de Custo Geral</strong></p>
      <p class="linha-perfil">Liberado (disponível): R$ ${data.centroCustoGeral.liberado.toFixed(2)}</p>
      <p class="linha-perfil">Pendente de conferência: R$ ${data.centroCustoGeral.pendente.toFixed(2)}</p>
    </div>`;
  }
  if (data.porCongregacao && data.porCongregacao.length > 0) {
    html += `<h4 style="margin:16px 0 10px; color: var(--cor-primaria);">📍 Centro de Custo Local (por congregação)</h4>
      <table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Saldo Liberado</th><th>Pendente de Liberação</th></tr></thead><tbody>`;
    data.porCongregacao.forEach(c => {
      html += `<tr><td>${c.congregacaoNome}</td><td>R$ ${c.saldoLiberado.toFixed(2)}</td><td>R$ ${c.saldoPendente.toFixed(2)}</td></tr>`;
    });
    html += "</tbody></table>";
  }

  html += `<h4 style="margin:16px 0 10px; color: var(--cor-primaria);">Fechamentos do período</h4>
    <table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Mês</th><th>Total Final</th><th>Centro de Custo Geral</th><th>Situação</th></tr></thead><tbody>`;
  fechamentos.forEach(f => {
    html += `<tr>
      <td>${f.congregacaoNome}</td><td>${f.mesReferencia}</td>
      <td>R$ ${Number(f.totalFinal).toFixed(2)}</td><td>R$ ${Number(f.valorRepasseGeral).toFixed(2)}</td>
      <td><span class="badge-status ${f.status === "REPASSADO" ? "badge-ativo" : "badge-licenca"}">${f.status === "REPASSADO" ? "Liberado" : "Pendente"}</span></td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
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
    const podeVer = nome === "meupainel" || nome === "documentos" || nome === "ouvidoria" || permissoesDaAba(nome).some(chave => authPermissoes.includes(chave));
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
  if (aba === "financeiro") {
    mostrarSubAbaFinanceiro(subAbaFinanceiroAtual);
    return;
  }
  document.getElementById("tituloModulo").textContent = TITULOS_MODULOS[aba] || "Governança";
  if (aba === "reunioes") {
    if (moduloAtual === "orgaosRegionais") montarSubmenuOrgaosRegionais(); else montarSubmenuOrgaosCentrais();
    carregarElegiveisAssembleia();
  }
  if (aba === "pessoas") { carregarOpcoesFormPessoa().then(() => mostrarSubAbaPessoas(subAbaPessoasAtual)); carregarPessoas(); }
  if (aba === "cartas") { carregarCartas(); processarSaidasCartas(); }
  if (aba === "orgaos") { carregarOrgaos(); carregarAssentos(); montarOrgaosLocais(); }
  if (aba === "estrutura") montarEstrutura();
  if (aba === "catalogos") montarCatalogos();
  if (aba === "permissoes") { carregarOpcoesEscopoPermissao(); carregarPermissoes(); }
  if (aba === "consagracoes") { carregarTiposConsagracao(); carregarConsagracoes(); }
  if (aba === "enquetes") carregarEnquetes();
  if (aba === "arquivos") { carregarOpcoesFormDocumentos(); carregarDocumentos(); }
  if (aba === "disciplina") { carregarOpcoesFormDisciplina(); carregarProcessosDisciplinares(); }
  if (aba === "abandono") { carregarRadarAbandono(); carregarOpcoesTentativaContato(); carregarRadarAbandonoDigital(); carregarProcedimentosAbandono(); }
  if (aba === "auditoria") carregarAuditoria();
  if (aba === "protecaodedados") { carregarSolicitacoesDPO(); montarPoliticasRetencao(); }
  if (aba === "ouvidoria") carregarPainelOuvidoria();
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function alternarSidebar() {
  document.getElementById("sidebar").classList.toggle("recolhido");
}
const TITULOS_MODULOS = {
  meupainel: "Meu Painel", financeiro: "Financeiro", reunioes: "Reuniões",
  pessoas: "Pessoas", cartas: "Cartas de Trânsito", congregacoes: "Congregações",
  orgaos: "Órgãos", estrutura: "Estrutura", catalogos: "Catálogos",
  permissoes: "Permissões", consagracoes: "Consagrações", disciplina: "Processo Disciplinar",
  abandono: "Perda de Membresia",
  auditoria: "Auditoria", protecaodedados: "Proteção de Dados", ouvidoria: "Ouvidoria", documentos: "Documentos"
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
  departamentos: { titulo: "Departamentos", idField: "departamentoId", campos: [["sigla", "Sigla"], ["nome", "Nome"], ["numero", "Número"], ["tipo", "Tipo", [["DEPARTAMENTO", "Departamento"], ["SECRETARIA_ADJUNTA", "Secretaria Adjunta"]]]] },
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
  orgaosLocais: { titulo: "Órgãos Locais (JAI/JEA/JUC/CRA/TER/CRAF/CEQ/CAQ/CDE)", idField: "orgaoLocalId", campos: [["sigla", "Sigla (JAI/JEA/JUC/CRA/TER/CRAF/CEQ/CAQ/CDE)"], ["nome", "Nome"], ["nivel", "Nível (1-5)"], ["referenciaId", "Id da Congregação/Área/Região/Quadrante/Distrito"]] },
  cargosMinisteriais: { titulo: "Cargos Ministeriais (escada — Art. 71)", idField: "cargoId", campos: [["sigla", "Sigla"], ["nome", "Nome"], ["ordem", "Ordem na escada"]] },
  prazos: { titulo: "Prazos (Estatuto/Regimento)", idField: "prazoId", campos: [["sigla", "Sigla"], ["nome", "Nome"], ["dias", "Dias"]] },
  tiposVinculoFamiliar: { titulo: "Tipos de Vínculo Familiar", idField: "tipoVinculoId", campos: [["codigo", "Código"], ["rotuloDireto", "Rótulo direto (ex: Pai/Mãe de)"], ["rotuloInverso", "Rótulo inverso (deixe vazio se simétrico)"]] },
  politicasRetencao: { titulo: "Políticas de Retenção (LGPD)", idField: "politicaId", campos: [["categoria", "Categoria"], ["baseLegal", "Base legal"], ["diasRetencao", "Dias (vazio = indeterminado)"]] },
  canaisOficiais: { titulo: "Canais Oficiais de Comunicação (Art. 12)", idField: "canalId", campos: [["sigla", "Sigla"], ["nome", "Nome"]] },
  tiposInfracao: {
    titulo: "Infrações Disciplinares (Art. 96-99, 144)", idField: "infracaoId",
    campos: [
      ["codigo", "Código (ex: ART96-I)"], ["nome", "Nome"], ["referenciaRegimento", "Referência (ex: Art. 96, I)"],
      ["gravidade", "Gravidade", [["LEVE", "Leve"], ["MEDIA", "Média"], ["GRAVE", "Grave"], ["GRAVISSIMA", "Gravíssima"]]]
    ]
  },
  tiposPenalidade: {
    titulo: "Penalidades (Art. 95 §2º)", idField: "penalidadeId",
    campos: [["codigo", "Código (ex: ADVERTENCIA)"], ["nome", "Nome"], ["referenciaRegimento", "Referência (ex: Art. 95 §2º, I)"]]
  },
  planoContas: {
    titulo: "Plano de Contas", idField: "contaId",
    campos: [["codigo", "Código (ex: 4.1.1)"], ["nome", "Nome da Conta"],
      ["tipo", "Tipo", [["ATIVO", "Ativo"], ["PASSIVO", "Passivo"], ["PATRIMONIO_LIQUIDO", "Patrimônio Líquido"], ["RECEITA", "Receita"], ["DESPESA", "Despesa"]]]],
    pai: { campo: "contaPaiId", rotulo: "Conta Pai", origem: "planoContas" }
  },
  categoriasEntrada: {
    titulo: "Categorias de Entrada", idField: "categoriaId",
    campos: [["codigo", "Código (ex: DIZIMO)"], ["nome", "Nome"],
      ["tipoFundo", "Tipo de Fundo", [["LIVRE", "Livre"], ["RESTRITO", "Restrito"]]]],
    pai: { campo: "contaContabilId", rotulo: "Conta Contábil", origem: "planoContas" }
  },
  categoriasSaida: {
    titulo: "Categorias de Saída", idField: "categoriaId",
    campos: [["codigo", "Código (ex: MANUTENCAO)"], ["nome", "Nome"],
      ["centroCusto", "Centro de Custo", [["LOCAL", "Local (congregação)"], ["GERAL", "Geral (denominação)"]]],
      ["tipoFundo", "Tipo de Fundo", [["LIVRE", "Livre"], ["RESTRITO", "Restrito (exige vincular a uma Campanha)"]]]],
    pai: { campo: "contaContabilId", rotulo: "Conta Contábil", origem: "planoContas" }
  },
  alcadasAprovacao: {
    titulo: "Alçadas de Aprovação (Saídas)", idField: "alcadaId",
    campos: [["valorMinimo", "Valor mínimo da faixa (R$)"],
      ["nivelMinimoAprovador", "Nível mínimo do aprovador", [
        ["CONGREGACAO", "Congregação"], ["AREA", "Área"], ["REGIAO", "Região"],
        ["QUADRANTE", "Quadrante"], ["DISTRITO", "Distrito"], ["GLOBAL", "Geral"]
      ]],
      ["quantidadeAprovadores", "Quantidade de aprovadores distintos exigida"]]
  }
};
// Ordem = nível (0 a 5) da Governança Escalonada (Regimento Art. 104), de baixo
// pra cima: Extensão da Tenda primeiro, Distrito por último. Órgãos Locais
// (JAI/JEA/CRA/TER/CEQ/Distrito) saiu daqui — é órgão, mora na aba Órgãos.
const ESTRUTURA_ORDEM = ["extensoes", "congregacoes", "areas", "regioes", "quadrantes", "distritos"];
const CATALOGOS_ORDEM = ["statuses", "situacoes", "departamentos", "cargosMinisteriais", "tiposConsagracao", "prazos", "tiposVinculoFamiliar", "canaisOficiais"];
const POLITICAS_RETENCAO_ORDEM = ["politicasRetencao"];
const ORGAOS_LOCAIS_ORDEM = ["orgaosLocais"];
// v4.2 — Plano de Contas primeiro, Categorias de Entrada depois (a segunda
// referencia a primeira via "pai") — moram dentro do Financeiro, não na
// aba genérica de Catálogos (princípio já estabelecido: cada módulo
// configura o que é exclusivo dele).
const CATALOGOS_FINANCEIRO_ORDEM = ["planoContas", "categoriasEntrada", "categoriasSaida", "alcadasAprovacao"];

function montarPoliticasRetencao() {
  document.getElementById("politicasRetencaoConteudo").innerHTML = POLITICAS_RETENCAO_ORDEM.map(k => secaoCatalogo(k)).join("");
  POLITICAS_RETENCAO_ORDEM.forEach(k => { carregarOpcoesPai(k); carregarCatalogoLista(k); });
}
function montarOrgaosLocais() {
  document.getElementById("orgaosLocaisConteudo").innerHTML = ORGAOS_LOCAIS_ORDEM.map(k => secaoCatalogo(k)).join("");
  ORGAOS_LOCAIS_ORDEM.forEach(k => { carregarOpcoesPai(k); carregarCatalogoLista(k); });
}
function montarCatalogosFinanceiro() {
  document.getElementById("catalogosFinanceiroConteudo").innerHTML = CATALOGOS_FINANCEIRO_ORDEM.map(k => secaoCatalogo(k)).join("");
  CATALOGOS_FINANCEIRO_ORDEM.forEach(k => { carregarOpcoesPai(k); carregarCatalogoLista(k); });
  // Cache local usado pelo formulário de lançamento — precisa recarregar
  // depois de qualquer alteração em Categorias de Entrada.
  _categoriasEntradaCache = null;
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
// v3.6.2 — o submenu junta os 5 órgãos centrais com as JAI/JEA/TER/CRA/CRAF/
// CEQ/CAQ/CDE/JUC territoriais (OrgaosLocais). Cada item ganha uma chave
// composta (`central:5`/`local:12`, mesmo padrão do form de Processo
// Disciplinar) — nenhum bloco de UI novo: território cai no formulário
// genérico de reunião simples, igual qualquer órgão sem composição especial.
// v4.2.3 — separado em dois módulos (pedido explícito): Órgãos Centrais
// (únicos na denominação) e Órgãos Regionais (territoriais, escopados por
// MeusOrgaosLocais). Ambos escrevem no MESMO window._orgaosReunioesCache —
// não precisa de dois nomes, porque só um dos dois módulos está aberto por
// vez (mostrarAbaSecretaria('reunioes') só é chamado a partir de um deles).
function renderizarListaOrgaosModulo(containerId, lista) {
  document.getElementById(containerId).innerHTML = lista.map(o => `
    <button class="btn-aba" id="btnSubReunioes${o.chave.replace(":", "_")}" onclick="selecionarOrgaoReunioes('${o.chave}')">
      <span class="icone">🏛️</span><span class="rotulo">${o.nome}</span>
    </button>`).join("");
}

async function montarSubmenuOrgaosCentrais() {
  const res = await fetchProtegido(`${API_BASE}/orgaos`);
  const orgaos = (await res.json()).map(o => Object.assign({}, o, { chave: `central:${o.orgaoId}` }));
  window._orgaosReunioesCache = orgaos;
  renderizarListaOrgaosModulo("submenuOrgaosCentrais", orgaos);
  if (orgaos.length === 0) return;
  const aindaExiste = orgaos.some(o => o.chave === window._orgaoAtualReunioes);
  selecionarOrgaoReunioes(aindaExiste ? window._orgaoAtualReunioes : orgaos[0].chave);
}

// meus-orgaos-locais (não catalogos/orgaosLocais): escopado por quem está
// logado, senão um Pastor de Área via a lista de TODAS as JAIs da
// denominação em vez de só as da própria área (v4.2.2).
async function montarSubmenuOrgaosRegionais() {
  const res = await fetchProtegido(`${API_BASE}/meus-orgaos-locais`);
  const locais = (await res.json())
    .map(o => Object.assign({}, o, { chave: `local:${o.orgaoLocalId}`, nome: `${o.sigla} — ${o.nome}` }));
  window._orgaosReunioesCache = locais;
  renderizarListaOrgaosModulo("submenuOrgaosRegionais", locais);
  if (locais.length === 0) return;
  const aindaExiste = locais.some(o => o.chave === window._orgaoAtualReunioes);
  selecionarOrgaoReunioes(aindaExiste ? window._orgaoAtualReunioes : locais[0].chave);
}

function selecionarOrgaoReunioes(chave) {
  const orgaos = window._orgaosReunioesCache || [];
  const orgao = orgaos.find(o => o.chave === chave);
  if (!orgao) return;

  const ehAssembleia = orgao.sigla === "ASSEMBLEIA_GERAL";
  const ehCLI = orgao.sigla === "CLI";
  const ehDiretoria = orgao.sigla === "DIRETORIA_EXECUTIVA";
  const ehConselhoFiscal = orgao.sigla === "CONSELHO_FISCAL";
  const ehCEI = orgao.sigla === "CEI";
  window._orgaoAtualReunioes = chave;
  document.getElementById("reuniaoOrgao").value = chave;
  document.getElementById("reunioesOrgaoNome").textContent = orgao.nome;
  document.getElementById("blocoElegiveisAssembleia").style.display = ehAssembleia ? "block" : "none";
  document.getElementById("blocoComposicaoCLI").style.display = ehCLI ? "block" : "none";
  document.getElementById("blocoDiretoria").style.display = ehDiretoria ? "block" : "none";
  document.getElementById("blocoConselhoFiscal").style.display = ehConselhoFiscal ? "block" : "none";
  document.getElementById("blocoCEI").style.display = ehCEI ? "block" : "none";
  // Assembleia Geral não abre na hora (Art. 20) — troca o formulário instantâneo
  // pelo par Convocar (com antecedência) / Iniciar (no dia previsto).
  document.getElementById("blocoConvocarAssembleia").style.display = ehAssembleia ? "block" : "none";
  document.getElementById("blocoAbrirReuniaoSimples").style.display = ehAssembleia ? "none" : "block";
  orgaos.forEach(o => {
    const btn = document.getElementById(`btnSubReunioes${o.chave.replace(":", "_")}`);
    if (btn) btn.classList.toggle("ativo", o.chave === chave);
  });

  if (ehAssembleia) carregarConvocacoesPendentes();
  if (ehCLI) { carregarComposicaoCLI(); carregarAssentosCLI(); carregarComissoes(); carregarProjetos(); }
  if (ehDiretoria) { carregarAssentosDiretoria(); carregarSucessaoPresidencial(); }
  if (ehConselhoFiscal) { carregarAssentosConselhoFiscal(); carregarMedidasCautelares(); }
  if (ehCEI) carregarAssentosCEI();
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

// ---- Projetos e Parecer de Comissões (v2.8, Parte B — Art. 24-25) ----
async function salvarProjeto() {
  const autorMembroId = document.getElementById("projetoAutorMatricula").value;
  const titulo = document.getElementById("projetoTitulo").value.trim();
  const texto = document.getElementById("projetoTexto").value.trim();
  const comissaoTematica = document.getElementById("projetoComissaoTematica").value;
  const msg = document.getElementById("resultadoProjeto");
  if (!autorMembroId || !titulo || !texto) { msg.textContent = "Informe matrícula do autor, título e texto."; return; }
  const res = await fetchProtegido(`${API_BASE}/projetos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ autorMembroId, titulo, texto, comissaoTematica })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("projetoAutorMatricula").value = "";
    document.getElementById("projetoTitulo").value = "";
    document.getElementById("projetoTexto").value = "";
    carregarProjetos();
  }
}

const ROTULO_STATUS_PROJETO = { EM_PARECER: "Em parecer", APTO_VOTACAO: "Apto para votação", ARQUIVADO: "Arquivado" };

async function carregarProjetos() {
  const container = document.getElementById("resultadoListaProjetos");
  const res = await fetchProtegido(`${API_BASE}/projetos`);
  const projetos = await res.json();
  if (!Array.isArray(projetos) || projetos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum projeto protocolado ainda.</p>";
    return;
  }
  let html = "";
  projetos.forEach(p => {
    const pareceresHtml = (p.pareceres || []).map(par => {
      const rotulo = par.parecer ? `${par.parecer === "FAVORAVEL" ? "✅" : "❌"} ${par.parecer} (${par.dataEmissao})` : "⏳ pendente";
      const botoes = !par.parecer ? `
        <button class="btn-link" onclick="emitirParecerAcao(${p.projetoId}, '${par.sigla}', 'FAVORAVEL')">Favorável</button>
        <button class="btn-link btn-link-perigo" onclick="emitirParecerAcao(${p.projetoId}, '${par.sigla}', 'CONTRARIO')">Contrário</button>` : "";
      return `<li>${par.sigla}: ${rotulo} ${botoes}</li>`;
    }).join("");
    html += `<div class="cartao-perfil" style="margin-bottom:12px;">
      <h4 style="margin:0 0 6px; color: var(--cor-primaria);">${p.protocolo} — ${p.titulo}</h4>
      <p class="subtitle">Autor: ${p.autorNome} · Protocolado em ${p.dataProtocolo} · Status: ${ROTULO_STATUS_PROJETO[p.status] || p.status}${p.regimeUrgencia ? " (regime de urgência)" : ""}</p>
      <p>${p.texto}</p>
      <ul>${pareceresHtml}</ul>
      ${p.prazoVencido ? `<p class="subtitle" style="color:var(--cor-perigo,#c0392b);">⚠️ Prazo de 15 dias do parecer vencido (${p.diasDesdeProtocolo} dias desde o protocolo).</p>` : ""}
      ${p.status === "EM_PARECER" && !p.regimeUrgencia ? `<button class="btn-link" onclick="marcarUrgenciaAcao(${p.projetoId})">Marcar regime de urgência</button>` : ""}
    </div>`;
  });
  container.innerHTML = html;
}

async function emitirParecerAcao(projetoId, sigla, parecer) {
  if (!(await confirmarAcao(`Confirma o parecer ${parecer} da comissão ${sigla}?`, "Confirmar"))) return;
  const res = await fetchProtegido(`${API_BASE}/projetos/${projetoId}/parecer/${sigla}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parecer })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarProjetos();
}

async function marcarUrgenciaAcao(projetoId) {
  if (!(await confirmarAcao("Confirma que o Plenário aprovou regime de urgência (2/3) pra este projeto?", "Confirmar"))) return;
  const res = await fetchProtegido(`${API_BASE}/projetos/${projetoId}/urgencia`, { method: "POST" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarProjetos();
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

// Art. 43 §1º — espelha shared/diretoria.js::CARGOS_CONSELHO_FISCAL.
const CARGOS_CONSELHO_FISCAL = {
  TITULAR_1: "1º Titular", TITULAR_2: "2º Titular", TITULAR_3: "3º Titular",
  SUPLENTE_1: "1º Suplente", SUPLENTE_2: "2º Suplente", SUPLENTE_3: "3º Suplente"
};

function orgaoIdConselhoFiscal() {
  const orgao = (window._orgaosReunioesCache || []).find(o => o.sigla === "CONSELHO_FISCAL");
  return orgao ? orgao.orgaoId : null;
}

async function carregarAssentosConselhoFiscal() {
  const select = document.getElementById("assentoCFCargo");
  if (select && !select.dataset.preenchido) {
    select.innerHTML = Object.entries(CARGOS_CONSELHO_FISCAL).map(([sigla, rotulo]) => `<option value="${sigla}">${rotulo}</option>`).join("");
    select.dataset.preenchido = "1";
  }

  const container = document.getElementById("resultadoListaConselhoFiscal");
  const orgaoId = orgaoIdConselhoFiscal();
  if (!orgaoId) return;
  const res = await fetchProtegido(`${API_BASE}/assentos?orgaoId=${orgaoId}`);
  const assentos = await res.json();

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Cargo</th><th>Matrícula</th><th>Nome</th><th>Desde</th><th>Até</th><th>Situação</th><th></th>
  </tr></thead><tbody>`;
  Object.entries(CARGOS_CONSELHO_FISCAL).forEach(([sigla, rotulo]) => {
    const a = Array.isArray(assentos) ? assentos.find(x => x.cargoOuFuncao === sigla) : null;
    html += `<tr>
      <td>${rotulo}</td>
      <td>${a ? a.membroId : "-"}</td>
      <td>${a ? a.nome : "<span class='subtitle'>vago</span>"}</td>
      <td>${a ? a.dataInicio : "-"}</td>
      <td>${a ? (a.dataTerminoPrevisao || "sem prazo") : "-"}</td>
      <td>${a ? badgeSituacaoAssento(a.situacaoEfetiva) : "-"}</td>
      <td>${a ? `<button class="btn-link btn-link-perigo" onclick="encerrarAssentoConselhoFiscalAcao(${a.assentoId})">Encerrar</button>` : ""}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function salvarAssentoConselhoFiscal() {
  const orgaoId = orgaoIdConselhoFiscal();
  const membroId = document.getElementById("assentoCFMatricula").value;
  const cargoOuFuncao = document.getElementById("assentoCFCargo").value;
  const duracaoMeses = document.getElementById("assentoCFDuracaoMeses").value || null;
  const msg = document.getElementById("resultadoAssentoCF");
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
    document.getElementById("assentoCFMatricula").value = "";
    carregarAssentosConselhoFiscal();
  }
}

async function encerrarAssentoConselhoFiscalAcao(assentoId) {
  if (!(await confirmarAcao("Encerrar esta cadeira?", "Encerrar"))) return;
  const res = await fetchProtegido(`${API_BASE}/assentos/${assentoId}/encerrar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarAssentosConselhoFiscal();
}

// Art. 88 §1º — espelha shared/diretoria.js::CARGOS_CEI.
const CARGOS_CEI = {
  TITULAR_1: "1º Conselheiro Titular", TITULAR_2: "2º Conselheiro Titular", TITULAR_3: "3º Conselheiro Titular",
  TITULAR_4: "4º Conselheiro Titular", TITULAR_5: "5º Conselheiro Titular", TITULAR_6: "6º Conselheiro Titular",
  TITULAR_7: "7º Conselheiro Titular", SUPLENTE_1: "1º Conselheiro Suplente", SUPLENTE_2: "2º Conselheiro Suplente"
};

function orgaoIdCEI() {
  const orgao = (window._orgaosReunioesCache || []).find(o => o.sigla === "CEI");
  return orgao ? orgao.orgaoId : null;
}

async function carregarAssentosCEI() {
  const select = document.getElementById("assentoCEICargo");
  if (select && !select.dataset.preenchido) {
    select.innerHTML = Object.entries(CARGOS_CEI).map(([sigla, rotulo]) => `<option value="${sigla}">${rotulo}</option>`).join("");
    select.dataset.preenchido = "1";
  }

  const container = document.getElementById("resultadoListaCEI");
  const orgaoId = orgaoIdCEI();
  if (!orgaoId) return;
  const res = await fetchProtegido(`${API_BASE}/assentos?orgaoId=${orgaoId}`);
  const assentos = await res.json();

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Cargo</th><th>Matrícula</th><th>Nome</th><th>Desde</th><th>Até</th><th>Situação</th><th></th>
  </tr></thead><tbody>`;
  Object.entries(CARGOS_CEI).forEach(([sigla, rotulo]) => {
    const a = Array.isArray(assentos) ? assentos.find(x => x.cargoOuFuncao === sigla) : null;
    html += `<tr>
      <td>${rotulo}</td>
      <td>${a ? a.membroId : "-"}</td>
      <td>${a ? a.nome : "<span class='subtitle'>vago</span>"}</td>
      <td>${a ? a.dataInicio : "-"}</td>
      <td>${a ? (a.dataTerminoPrevisao || "sem prazo") : "-"}</td>
      <td>${a ? badgeSituacaoAssento(a.situacaoEfetiva) : "-"}</td>
      <td>${a ? `<button class="btn-link btn-link-perigo" onclick="encerrarAssentoCEIAcao(${a.assentoId})">Encerrar</button>` : ""}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function checarElegibilidadeCEIAcao() {
  const membroId = document.getElementById("assentoCEIMatricula").value;
  const msg = document.getElementById("resultadoElegibilidadeCEI");
  if (!membroId) { msg.textContent = "Informe a matrícula antes de checar."; return; }
  const res = await fetchProtegido(`${API_BASE}/elegibilidade-cei/${membroId}`);
  const data = await res.json();
  if (!data.sucesso) { msg.textContent = data.mensagem || "Não foi possível checar."; return; }
  const itens = [
    data.cargoElegivel ? "✅ Cargo ministerial (Oficial Superior ou Presbítero 5+ anos)" : `⚠️ ${data.motivoCargo}`,
    data.formacaoVerificavelOk ? "✅ Formação teológica avançada (AFM + CHM)" : `⚠️ ${data.motivoFormacao}`,
    data.reputacaoIlibada ? "✅ Reputação ilibada (sem sanção/exclusão nos últimos 10 anos)" : `⚠️ ${data.motivoReputacao}`
  ];
  msg.innerHTML = itens.map(i => `<div>${i}</div>`).join("");
}

async function salvarAssentoCEI() {
  const orgaoId = orgaoIdCEI();
  const membroId = document.getElementById("assentoCEIMatricula").value;
  const cargoOuFuncao = document.getElementById("assentoCEICargo").value;
  const duracaoMeses = document.getElementById("assentoCEIDuracaoMeses").value || null;
  const msg = document.getElementById("resultadoAssentoCEI");
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
    document.getElementById("assentoCEIMatricula").value = "";
    document.getElementById("resultadoElegibilidadeCEI").innerHTML = "";
    carregarAssentosCEI();
  }
}

async function encerrarAssentoCEIAcao(assentoId) {
  if (!(await confirmarAcao("Encerrar esta cadeira?", "Encerrar"))) return;
  const res = await fetchProtegido(`${API_BASE}/assentos/${assentoId}/encerrar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarAssentosCEI();
}

async function carregarMedidasCautelares() {
  const container = document.getElementById("resultadoListaCautelares");
  const res = await fetchProtegido(`${API_BASE}/medidas-cautelares`);
  const medidas = await res.json();
  if (!Array.isArray(medidas) || medidas.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma medida cautelar aplicada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Nome</th><th>Motivo</th><th>Restrições</th><th>Aplicada em</th><th>Relatório (30 dias)</th><th></th>
  </tr></thead><tbody>`;
  medidas.forEach(m => {
    const restricoes = [
      m.suspenderAcessoSistema ? "Acesso ao sistema" : null,
      m.suspensaoContasBancarias ? "Contas bancárias" : null,
      m.suspensaoChavesFisicas ? "Chaves físicas" : null
    ].filter(Boolean).join(", ") || "-";
    const relatorio = m.dataConclusaoRelatorio
      ? `Concluído em ${m.dataConclusaoRelatorio}`
      : (m.prazoRelatorioVencido ? `🔴 VENCIDO (${m.diasDesdeAplicacao} dias)` : `🟡 em curso (${m.diasDesdeAplicacao}/${m.diasPrazoRelatorio} dias)`);
    html += `<tr>
      <td>${m.membroId}</td>
      <td>${m.nome}</td>
      <td>${m.motivo}</td>
      <td>${restricoes}</td>
      <td>${m.dataAplicacao}</td>
      <td>${relatorio}</td>
      <td>${!m.dataConclusaoRelatorio ? `<button class="btn-link" onclick="concluirRelatorioCautelarAcao(${m.medidaId})">Concluir relatório</button>` : ""}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function aplicarMedidaCautelarAcao() {
  const membroId = document.getElementById("cautelarMatricula").value;
  const motivo = document.getElementById("cautelarMotivo").value;
  const suspenderAcessoSistema = document.getElementById("cautelarSuspenderAcesso").checked;
  const suspensaoContasBancarias = document.getElementById("cautelarSuspenderBancaria").checked;
  const suspensaoChavesFisicas = document.getElementById("cautelarSuspenderChaves").checked;
  const msg = document.getElementById("resultadoCautelar");
  if (!membroId || !motivo) { msg.textContent = "Informe matrícula e motivo."; return; }
  if (!(await confirmarAcao("Aplicar Medida Cautelar de Proteção Patrimonial pra essa pessoa?", "Aplicar"))) return;

  const res = await fetchProtegido(`${API_BASE}/medidas-cautelares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membroId, motivo, suspenderAcessoSistema, suspensaoContasBancarias, suspensaoChavesFisicas })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("cautelarMatricula").value = "";
    document.getElementById("cautelarMotivo").value = "";
    document.getElementById("cautelarSuspenderAcesso").checked = false;
    document.getElementById("cautelarSuspenderBancaria").checked = false;
    document.getElementById("cautelarSuspenderChaves").checked = false;
    carregarMedidasCautelares();
  }
}

async function concluirRelatorioCautelarAcao(medidaId) {
  if (!(await confirmarAcao("Concluir o relatório e registrar a representação à CLI?", "Concluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/medidas-cautelares/${medidaId}/concluir-relatorio`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarMedidasCautelares();
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
  const chave = document.getElementById("reuniaoOrgao").value;
  const descricao = document.getElementById("descricaoReuniao").value;
  const senhaAcesso = document.getElementById("senhaNovaReuniao").value;
  if (!chave || !descricao || !senhaAcesso) { mostrarToast("Escolha o órgão e preencha descrição e senha.", "erro"); return; }
  const [tipo, id] = chave.split(":");
  const body = tipo === "local" ? { orgaoLocalId: id, descricao, senhaAcesso } : { orgaoId: id, descricao, senhaAcesso };

  const res = await fetchProtegido(`${API_BASE}/reunioes/abrir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
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
  const chave = document.getElementById("reuniaoOrgao").value;
  const [tipo, id] = (chave || "").split(":");
  const query = tipo === "local" ? `?orgaoLocalId=${id}` : (tipo === "central" ? `?orgaoId=${id}` : "");
  const res = await fetchProtegido(`${API_BASE}/reunioes${query}`);
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
  const deptosAtivos = departamentos.filter(d => d.ativo);
  const opcaoDepto = d => `<option value="${d.departamentoId}">${d.nome}</option>`;
  const grupoDepto = (rotulo, itens) => itens.length ? `<optgroup label="${rotulo}">${itens.map(opcaoDepto).join("")}</optgroup>` : "";
  selectDepto.innerHTML = `<option value="">Não informado</option>` +
    grupoDepto("Departamentos", deptosAtivos.filter(d => d.tipo === "DEPARTAMENTO")) +
    grupoDepto("Secretarias Adjuntas", deptosAtivos.filter(d => d.tipo === "SECRETARIA_ADJUNTA")) +
    grupoDepto("Outros", deptosAtivos.filter(d => d.tipo !== "DEPARTAMENTO" && d.tipo !== "SECRETARIA_ADJUNTA"));

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
  document.getElementById("lotePapel").innerHTML = papeis.map(p => `<option value="${p.papelId}">${p.nome}</option>`).join("");

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
  fetch(`${API_BASE}/catalogos/${nivel.origem}`).then(r => r.json()).then(itens => {
    const ativos = itens.filter(x => x.ativa !== false && x.ativo !== false);
    const semEscopoFixo = tipo === "CONGREGACAO" ? `<option value="">Cada matrícula usa a própria congregação</option>` : "";
    select.innerHTML = semEscopoFixo + ativos.map(x => `<option value="${x[nivel.idField]}">${x.nome}</option>`).join("");
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
    html += `<tr><td>${r.membroId}</td><td>${r.sucesso ? "✅" : "❌"} ${r.mensagem}</td></tr>`;
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
        <button class="btn-link" onclick="redefinirSenhaLideranca(${l.membroId})">🔑 Redefinir senha</button>
        <button class="btn-link btn-link-perigo" onclick="removerPermissao(${l.membroId})">Remover</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

// Reseta só a senha, sem mexer em papel/escopo — pra quando a pessoa esqueceu
// e não consegue mais logar sozinha (self-service exige estar logado, então
// não serve nesse caso). Reaproveita o mesmo POST /api/lideranca de sempre,
// só reenviando o papel/escopo que já existiam junto com a senha nova.
async function redefinirSenhaLideranca(membroId) {
  const res = await fetchProtegido(`${API_BASE}/lideranca`);
  const liderancas = await res.json();
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
      <select id="perguntaTipo_${id}" onchange="onChangeTipoPerguntaEnquete(${id})">
        <option value="OPCOES">Tipo: Opções</option>
        <option value="TEXTO_LIVRE">Tipo: Texto livre</option>
      </select>
      <button type="button" class="btn-link btn-link-perigo" onclick="removerBlocoPerguntaEnquete(${id})">Remover</button>
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
    ? `<select id="votoResposta_${enqueteId}_${pergunta.perguntaId}">${(pergunta.opcoes || []).map(o => `<option value="${o.opcaoId}">${o.texto}</option>`).join("")}</select>`
    : `<input type="text" id="votoResposta_${enqueteId}_${pergunta.perguntaId}" placeholder="Sua resposta" style="min-width:200px;" />`;
}

async function carregarEnquetes() {
  const container = document.getElementById("resultadoListaEnquetes");
  const res = await fetchProtegido(`${API_BASE}/enquetes`);
  const enquetes = await res.json();
  if (!Array.isArray(enquetes) || enquetes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma enquete criada ainda.</p>";
    return;
  }
  let html = "";
  enquetes.forEach(e => {
    const participantesHtml = (e.participantes || []).map(p => p.nome).join(", ") || "ninguém ainda";
    const resultadoHtml = e.status === "ENCERRADA" && e.vinculante
      ? `<p><strong>${e.resultadoAprovado ? "✅ Aprovado" : "❌ Não aprovado"}</strong> (${ROTULO_QUORUM_ENQUETE[e.quorumTipo] || e.quorumTipo})</p>`
      : "";
    const perguntasHtml = (e.perguntas || []).map(p => {
      const opcoesHtml = (p.opcoes || []).map(o => `<li>${o.texto}: <strong>${o.votos}</strong> resposta(s)</li>`).join("");
      const detalhePublico = e.visibilidade === "PUBLICA" && Array.isArray(p.respostas)
        ? `<p class="subtitle">Quem respondeu: ${p.respostas.map(r => `${r.nome} → ${r.textoResposta || (p.opcoes.find(o => o.opcaoId === r.opcaoId) || {}).texto || "-"}`).join("; ") || "ninguém ainda"}</p>`
        : "";
      const campoVoto = e.status === "ABERTA" ? `<div>${campoRespostaPergunta(e.enqueteId, p)}</div>` : "";
      return `<li style="margin-bottom:8px;"><strong>${p.titulo}</strong> (${p.totalRespostas} resposta(s))
        ${p.tipo === "OPCOES" ? `<ul>${opcoesHtml}</ul>` : ""}
        ${detalhePublico}
        ${campoVoto}
      </li>`;
    }).join("");
    html += `<div class="cartao-perfil" style="margin-bottom:12px;">
      <h4 style="margin:0 0 6px; color: var(--cor-primaria);">${e.titulo} ${e.vinculante ? "🔒 vinculante" : ""}</h4>
      <p class="subtitle">${e.descricao || ""}</p>
      <p class="subtitle">Visibilidade: ${ROTULO_VISIBILIDADE_ENQUETE[e.visibilidade] || e.visibilidade} · Status: ${e.status} · Participantes: ${e.totalVotos}</p>
      <ul>${perguntasHtml}</ul>
      <p class="subtitle">Participaram: ${participantesHtml}</p>
      ${resultadoHtml}
      ${e.status === "ABERTA" ? `
        <div class="barra-lista">
          <input type="number" id="votoMatricula_${e.enqueteId}" placeholder="Sua matrícula" style="min-width:120px;" />
          <button class="btn-confirmar" style="width:auto;margin:0;" onclick="votarEnqueteAcao(${e.enqueteId})">Enviar respostas</button>
          <button class="btn-link btn-link-perigo" onclick="encerrarEnqueteAcao(${e.enqueteId})">Encerrar</button>
        </div>` : ""}
    </div>`;
  });
  container.innerHTML = html;
}

async function votarEnqueteAcao(enqueteId) {
  const membroId = document.getElementById(`votoMatricula_${enqueteId}`).value;
  if (!membroId) { mostrarToast("Informe a matrícula.", "erro"); return; }
  const camposResposta = document.querySelectorAll(`[id^="votoResposta_${enqueteId}_"]`);
  const respostas = Array.from(camposResposta).map(campo => {
    const perguntaId = Number(campo.id.split("_")[2]);
    const ehSelect = campo.tagName === "SELECT";
    return ehSelect ? { perguntaId, opcaoId: campo.value } : { perguntaId, textoResposta: campo.value.trim() };
  });
  const res = await fetch(`${API_BASE}/enquetes/${enqueteId}/votar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membroId, respostas })
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

// ---- SECRETARIA / ABA ARQUIVOS (v2.9) — catálogo de referências, sem editor ----
async function carregarOpcoesFormDocumentos() {
  const res = await fetch(`${API_BASE}/orgaos`);
  const orgaos = await res.json();
  document.getElementById("documentoOrgao").innerHTML = `<option value="">Sem órgão específico</option>` +
    orgaos.map(o => `<option value="${o.orgaoId}">${o.nome}</option>`).join("");
}

function lerArquivoComoBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(",")[1] || "");
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}

async function salvarDocumentoAcao() {
  const tipo = document.getElementById("documentoTipo").value;
  const orgaoId = document.getElementById("documentoOrgao").value || undefined;
  const referenciaId = document.getElementById("documentoReferenciaId").value || undefined;
  const descricao = document.getElementById("documentoDescricao").value.trim();
  const arquivo = document.getElementById("documentoArquivo").files[0];
  const msg = document.getElementById("resultadoDocumento");
  if (!arquivo) { msg.textContent = "Selecione um arquivo."; return; }

  const arquivoBase64 = await lerArquivoComoBase64(arquivo);
  const res = await fetchProtegido(`${API_BASE}/documentos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo, orgaoId, referenciaId, descricao: descricao || undefined, arquivoBase64, mimeType: arquivo.type })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("documentoReferenciaId").value = "";
    document.getElementById("documentoDescricao").value = "";
    document.getElementById("documentoArquivo").value = "";
    carregarDocumentos();
  }
}

const ROTULO_TIPO_DOCUMENTO = {
  ATA: "Ata", TERMO_POSSE: "Termo de Posse", MEMORANDO: "Memorando", PARECER: "Parecer",
  PARECER_COMPATIBILIDADE: "Parecer de Compatibilidade Ministerial", RELATORIO_TRANSICAO: "Relatório de Transição",
  OFICIO: "Ofício/Representação", REGIMENTO: "Regimento (alteração)", OUTRO: "Outro"
};

async function carregarDocumentos() {
  const container = document.getElementById("resultadoListaDocumentos");
  const tipo = document.getElementById("documentoFiltroTipo").value;
  const res = await fetchProtegido(`${API_BASE}/documentos${tipo ? `?tipo=${tipo}` : ""}`);
  const documentos = await res.json();
  if (!Array.isArray(documentos) || documentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum documento registrado ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Tipo</th><th>Descrição</th><th>Órgão</th><th>Registrado por</th><th>Data</th><th>Prazo</th><th></th>
  </tr></thead><tbody>`;
  documentos.forEach(d => {
    let prazoHtml = "-";
    if (d.tipo === "ATA" && d.diasDesdeSessao != null) {
      if (d.prazoCartorioVencido) prazoHtml = `<span style="color:var(--cor-perigo,#c0392b);">⚠️ Prazo de cartório vencido (${d.diasDesdeSessao}d)</span>`;
      else if (d.prazoLavraturaVencido) prazoHtml = `<span style="color:var(--cor-perigo,#c0392b);">⚠️ Prazo de lavratura vencido (${d.diasDesdeSessao}d)</span>`;
      else prazoHtml = `✅ Em dia (${d.diasDesdeSessao}d)`;
    }
    html += `<tr>
      <td>${ROTULO_TIPO_DOCUMENTO[d.tipo] || d.tipo}</td>
      <td>${d.descricao || "-"}</td>
      <td>${d.orgaoNome || "-"}</td>
      <td>${d.registradoPorNome || "-"}</td>
      <td>${d.criadoEm ? d.criadoEm.slice(0, 10) : "-"}</td>
      <td>${prazoHtml}</td>
      <td class="acoes-inline">
        <a class="btn-link" href="${d.urlAssinada}" target="_blank" rel="noopener">Abrir</a>
        <button class="btn-link btn-link-perigo" onclick="excluirDocumentoAcao(${d.documentoId})">Excluir</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function excluirDocumentoAcao(id) {
  if (!(await confirmarAcao("Excluir este registro? O arquivo permanece no armazenamento, só o catálogo é removido.", "Excluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/documentos/${id}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarDocumentos();
}

// ---- SECRETARIA / ABA PROCESSO DISCIPLINAR ----
// v3.2: abrir (com catálogo de infrações) + rito (relator, citação, afastamento
// cautelar, defesa/revelia, defensor) + julgar + ajustar prazo.
// v3.6 — escada territorial: o select de órgão junta os 5 órgãos centrais
// (Orgaos) com as JAI/JEA/TER territoriais cadastradas em OrgaosLocais. O
// value carrega um prefixo (central:ID / local:ID) que salvarProcessoDisciplinar()
// decompõe em orgaoResponsavelId/orgaoLocalId.
async function carregarOpcoesFormDisciplina() {
  const res = await fetch(`${API_BASE}/orgaos`);
  const orgaos = await res.json();
  const locaisRes = await fetch(`${API_BASE}/catalogos/orgaosLocais`);
  const locais = (await locaisRes.json()).filter(o => o.ativo !== false && ["JAI", "JEA", "TER"].includes(o.sigla));
  document.getElementById("disciplinaOrgao").innerHTML =
    orgaos.map(o => `<option value="central:${o.orgaoId}">${o.sigla}</option>`).join("") +
    locais.map(o => `<option value="local:${o.orgaoLocalId}">${o.sigla} — ${o.nome}</option>`).join("");

  const infRes = await fetch(`${API_BASE}/catalogos/tiposInfracao`);
  const infracoes = await infRes.json();
  window._catalogoInfracoes = Array.isArray(infracoes) ? infracoes : [];
  const lista = document.getElementById("listaInfracoesAbertura");
  lista.innerHTML = window._catalogoInfracoes
    .filter(i => i.ativo !== false)
    .map(i => `<label style="display:block;"><input type="checkbox" class="chk-infracao-abertura" value="${i.infracaoId}" style="width:auto;" /> ${i.nome} <span class="subtitle">(${i.referenciaRegimento || i.codigo} — ${badgeGravidade(i.gravidade)})</span></label>`)
    .join("") || "<p class='subtitle'>Nenhuma infração cadastrada no catálogo.</p>";

  document.getElementById("catalogoTiposInfracaoConteudo").innerHTML = secaoCatalogo("tiposInfracao");
  carregarCatalogoLista("tiposInfracao");

  document.getElementById("catalogoTiposPenalidadeConteudo").innerHTML = secaoCatalogo("tiposPenalidade");
  carregarCatalogoLista("tiposPenalidade");
}

async function salvarProcessoDisciplinar() {
  const membroId = document.getElementById("disciplinaMatricula").value;
  const orgaoValor = document.getElementById("disciplinaOrgao").value;
  const [orgaoTipo, orgaoId] = orgaoValor.split(":");
  const motivo = document.getElementById("disciplinaMotivo").value.trim();
  const sigiloso = document.getElementById("disciplinaSigiloso").checked;
  const infracoesIds = Array.from(document.querySelectorAll(".chk-infracao-abertura:checked")).map(el => Number(el.value));
  const msg = document.getElementById("resultadoDisciplina");
  if (!membroId || !orgaoValor || infracoesIds.length === 0) {
    msg.textContent = "Informe matrícula, órgão e ao menos 1 infração.";
    return;
  }
  const body = { membroId, infracoesIds, motivo: motivo || null, sigiloso };
  if (orgaoTipo === "central") body.orgaoResponsavelId = orgaoId; else body.orgaoLocalId = orgaoId;
  const res = await fetchProtegido(`${API_BASE}/processos-disciplinares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("disciplinaMatricula").value = "";
    document.getElementById("disciplinaMotivo").value = "";
    document.querySelectorAll(".chk-infracao-abertura:checked").forEach(el => { el.checked = false; });
    carregarProcessosDisciplinares();
  }
}

const ROTULO_SITUACAO_DISCIPLINA = {
  EM_ANDAMENTO: "Em andamento",
  AFASTAMENTO_CAUTELAR: "Afastamento cautelar",
  EM_RECURSO: "Em recurso",
  CUMPRINDO_SANCAO: "Cumprindo sanção",
  PRAZO_INDETERMINADO: "Sanção — prazo indeterminado",
  CUMPRIDO: "Sanção cumprida",
  ARQUIVADO: "Arquivado",
  EXCLUIDO: "Excluído"
};

const ROTULO_CANAL_CITACAO = { WHATSAPP: "WhatsApp", CARTA_REGISTRADA: "Carta Registrada" };
const ROTULO_GRAVIDADE = { LEVE: "Leve", MEDIA: "Média", GRAVE: "Grave", GRAVISSIMA: "Gravíssima" };
const ORDEM_GRAVIDADE = ["LEVE", "MEDIA", "GRAVE", "GRAVISSIMA"];
const CORES_GRAVIDADE = { LEVE: "badge-ativo", MEDIA: "badge-licenca", GRAVE: "badge-licenca", GRAVISSIMA: "badge-desligado" };
function badgeGravidade(gravidade) {
  if (!gravidade) return "";
  return `<span class="badge-status ${CORES_GRAVIDADE[gravidade] || ""}">${ROTULO_GRAVIDADE[gravidade] || gravidade}</span>`;
}

function badgeSituacaoDisciplina(situacao) {
  const cores = {
    EM_ANDAMENTO: "badge-licenca", AFASTAMENTO_CAUTELAR: "badge-licenca", EM_RECURSO: "badge-licenca", CUMPRINDO_SANCAO: "badge-licenca", PRAZO_INDETERMINADO: "badge-licenca",
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
    <th>Nome</th><th>Órgão</th><th>Infrações</th><th>Relator</th><th>Citação</th><th>Defesa</th><th>Penalidade</th><th>Situação</th><th>Dias restantes</th><th></th>
  </tr></thead><tbody>`;

  processos.forEach(p => {
    const podeAfastar = p.status === "EM_ANDAMENTO";
    const podeJulgar = p.status === "EM_ANDAMENTO" || p.status === "AFASTAMENTO_CAUTELAR";
    const podeAjustarPrazo = p.situacaoEfetiva === "CUMPRINDO_SANCAO" || p.situacaoEfetiva === "PRAZO_INDETERMINADO";
    const infracoesTexto = p.detalhesRestritos
      ? `<span class="subtitle">🔒 Sigiloso — ${p.quantidadeInfracoes ?? "?"} infração(ões), detalhes restritos ao CEI/relator</span>`
      : (() => {
          const maisGrave = (p.infracoes || []).reduce((atual, i) => {
            if (!i.gravidade) return atual;
            return !atual || ORDEM_GRAVIDADE.indexOf(i.gravidade) > ORDEM_GRAVIDADE.indexOf(atual) ? i.gravidade : atual;
          }, null);
          const texto = (p.infracoes || []).map(i => i.nome).join(", ") || "-";
          return texto === "-" ? "-" : `${texto} ${badgeGravidade(maisGrave)}`;
        })();
    const citacaoTexto = p.dataCitacao ? `${p.dataCitacao} (${ROTULO_CANAL_CITACAO[p.canalCitacao] || p.canalCitacao})` : "-";
    const defesaTexto = p.defesaProtocolada
      ? `Protocolada em ${p.dataDefesa}`
      : (p.prazoDefesa && p.prazoDefesa.emRevelia ? "<span class='badge-status badge-desligado'>Revelia</span>" : (p.dataCitacao ? "Aguardando" : "-"));
    const podeRegistrarProva = p.emCarenciaAdministrativa;
    const podeRecorrer = p.podeRecorrer && !p.prazoRecursoVencido;
    const podeHomologar = p.homologadoPeloCei === false && authPermissoes.includes("cei");
    let penalidadeTexto = p.penalidadeNome || "-";
    if (p.emCarenciaAdministrativa) penalidadeTexto += "<br /><span class='badge-status badge-licenca'>Em Carência Administrativa</span>";
    else if (p.resultadoProvaReintegracao) penalidadeTexto += `<br /><span class="subtitle">Prova de Reintegração: ${p.resultadoProvaReintegracao}</span>`;
    if (p.homologadoPeloCei === false) penalidadeTexto += "<br /><span class='badge-status badge-licenca'>Aguardando homologação do CEI</span>";
    else if (p.homologadoPeloCei === true) penalidadeTexto += "<br /><span class='subtitle'>Homologado pelo CEI</span>";
    html += `<tr>
      <td>${p.nome}${p.sigiloso ? " 🔒" : ""}${p.defensorNome ? `<br /><span class="subtitle">Defensor: ${p.defensorNome}</span>` : ""}
        ${p.envolveMinistro ? `<br /><span class="subtitle">⚠️ Envolve ministro — jurisdição dupla (também CIADSETA-PARÁ, fora do sistema), Art. 103 §1º, II</span>` : ""}</td>
      <td>${p.orgaoSigla}${p.orgaoLocalId ? `<br /><span class="subtitle">${p.orgaoNome}</span>` : ""}</td>
      <td>${infracoesTexto}</td>
      <td>${p.relatorNome || "-"}</td>
      <td>${citacaoTexto}</td>
      <td>${defesaTexto}</td>
      <td>${penalidadeTexto}</td>
      <td>${badgeSituacaoDisciplina(p.situacaoEfetiva)}</td>
      <td>${p.diasRestantes ?? "-"}</td>
      <td class="acoes-inline">
        ${p.status !== "JULGADO" ? `<button class="btn-link" onclick="designarRelatorAcao(${p.processoId})">Relator</button>` : ""}
        ${p.status !== "JULGADO" && !p.dataCitacao ? `<button class="btn-link" onclick="citarAcao(${p.processoId})">Citar</button>` : ""}
        ${podeAfastar ? `<button class="btn-link" onclick="afastarCautelarAcao(${p.processoId})">Afastar</button>` : ""}
        ${p.status !== "JULGADO" && p.dataCitacao && !p.defesaProtocolada ? `<button class="btn-link" onclick="registrarDefesaAcao(${p.processoId})">Registrar Defesa</button>` : ""}
        ${p.status !== "JULGADO" ? `<button class="btn-link" onclick="designarDefensorAcao(${p.processoId})">Defensor</button>` : ""}
        ${podeJulgar ? `<button class="btn-link" onclick="julgarProcessoAcao(${p.processoId})">Julgar</button>` : ""}
        ${podeAjustarPrazo ? `<button class="btn-link" onclick="ajustarPrazoProcessoAcao(${p.processoId})">Ajustar Prazo</button>` : ""}
        ${podeRegistrarProva ? `<button class="btn-link" onclick="registrarProvaReintegracaoAcao(${p.processoId})">Prova de Reintegração</button>` : ""}
        ${podeRecorrer ? `<button class="btn-link" onclick="recorrerAcao(${p.processoId})">Recorrer</button>` : ""}
        ${podeHomologar ? `<button class="btn-link" onclick="homologarExclusaoAcao(${p.processoId})">Homologar</button>` : ""}
      </td>
    </tr>`;
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}

async function evoluirProcessoAcao(processoId, corpo, mensagemErro) {
  const res = await fetchProtegido(`${API_BASE}/processos-disciplinares/${processoId}/evoluir`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo)
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.avisos && data.avisos.length) data.avisos.forEach(a => mostrarToast(a, "erro"));
  if (data.sucesso) carregarProcessosDisciplinares();
  return data;
}

async function designarRelatorAcao(processoId) {
  const relatorMembroId = await pedirTexto("Designar relator", "Matrícula do relator");
  if (!relatorMembroId) return;
  await evoluirProcessoAcao(processoId, { acao: "DESIGNAR_RELATOR", relatorMembroId });
}

function pedirCitacao() {
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Registrar citação (Art. 101)</h3>
      <div class="input-group">
        <label>Canal:</label>
        <select id="modalCanalCitacao">
          <option value="WHATSAPP">WhatsApp</option>
          <option value="CARTA_REGISTRADA">Carta Registrada</option>
        </select>
      </div>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar" id="modalConfirmar">Registrar</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    document.getElementById("modalConfirmar").onclick = () => {
      const canalCitacao = document.getElementById("modalCanalCitacao").value;
      fecharModal();
      resolve({ canalCitacao });
    };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

async function citarAcao(processoId) {
  const dados = await pedirCitacao();
  if (!dados) return;
  await evoluirProcessoAcao(processoId, { acao: "CITAR", canalCitacao: dados.canalCitacao });
}

async function afastarCautelarAcao(processoId) {
  if (!(await confirmarAcao("Afastar cautelarmente esta pessoa das funções (Art. 100)?", "Afastar"))) return;
  await evoluirProcessoAcao(processoId, { acao: "AFASTAR" });
}

async function registrarDefesaAcao(processoId) {
  if (!(await confirmarAcao("Registrar que a defesa foi protocolada?", "Registrar"))) return;
  await evoluirProcessoAcao(processoId, { acao: "REGISTRAR_DEFESA" });
}

async function designarDefensorAcao(processoId) {
  const defensorNome = await pedirTexto("Designar defensor (Art. 102)", "Nome do defensor eclesiástico ou advogado");
  if (!defensorNome) return;
  await evoluirProcessoAcao(processoId, { acao: "DESIGNAR_DEFENSOR", defensorNome });
}

function pedirProvaReintegracao() {
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Prova de Reintegração Ética (Art. 77)</h3>
      <div class="input-group">
        <label>Resultado:</label>
        <select id="modalResultadoProva">
          <option value="APROVADO">Aprovado — credencial reativada</option>
          <option value="REPROVADO">Reprovado — nova tentativa na próxima trimestral</option>
        </select>
      </div>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar" id="modalConfirmar">Registrar</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    document.getElementById("modalConfirmar").onclick = () => {
      const resultadoProva = document.getElementById("modalResultadoProva").value;
      fecharModal();
      resolve({ resultadoProva });
    };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

async function registrarProvaReintegracaoAcao(processoId) {
  const dados = await pedirProvaReintegracao();
  if (!dados) return;
  await evoluirProcessoAcao(processoId, { acao: "REGISTRAR_PROVA_REINTEGRACAO", resultadoProva: dados.resultadoProva });
}

// v3.6 — recurso de JAI/JEA (Art. 108 §3º/123): destino é a instância
// territorial imediatamente superior (cadastrada em OrgaosLocais) ou um
// órgão central (tipicamente CEI).
function pedirRecurso() {
  return new Promise(async resolve => {
    const orgaosRes = await fetch(`${API_BASE}/orgaos`);
    const orgaos = await orgaosRes.json();
    const locaisRes = await fetch(`${API_BASE}/catalogos/orgaosLocais`);
    const locais = (await locaisRes.json()).filter(o => o.ativo !== false && ["JEA", "TER"].includes(o.sigla));
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Recorrer para instância superior</h3>
      <div class="input-group">
        <label>Destino:</label>
        <select id="modalOrgaoDestino">
          ${orgaos.map(o => `<option value="central:${o.orgaoId}">${o.sigla}</option>`).join("")}
          ${locais.map(o => `<option value="local:${o.orgaoLocalId}">${o.sigla} — ${o.nome}</option>`).join("")}
        </select>
      </div>
      <div class="input-group">
        <label>Justificativa (obrigatória):</label>
        <textarea id="modalJustificativaRecurso" rows="3"></textarea>
      </div>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar" id="modalConfirmar">Recorrer</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    document.getElementById("modalConfirmar").onclick = () => {
      const [orgaoDestinoTipo, orgaoDestinoId] = document.getElementById("modalOrgaoDestino").value.split(":");
      const justificativa = document.getElementById("modalJustificativaRecurso").value.trim();
      fecharModal();
      resolve({ orgaoDestinoTipo: orgaoDestinoTipo === "central" ? "CENTRAL" : "LOCAL", orgaoDestinoId, justificativa });
    };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

async function recorrerAcao(processoId) {
  const dados = await pedirRecurso();
  if (!dados) return;
  if (!dados.justificativa) { mostrarToast("Justificativa é obrigatória para recorrer.", "erro"); return; }
  await evoluirProcessoAcao(processoId, { acao: "RECORRER", ...dados });
}

async function homologarExclusaoAcao(processoId) {
  const homologado = await confirmarAcao("Homologar esta Exclusão/Disciplina Rigorosa? Isso encerra Assentos/Liderança/Cargo Ministerial da pessoa (Art. 94, II).", "Homologar");
  if (!homologado) return;
  await evoluirProcessoAcao(processoId, { acao: "HOMOLOGAR_EXCLUSAO", homologado: true });
}

// Modal customizado (mesmo padrão de pedirTexto/confirmarAcao) — Promise<{resultado, diasSancao}|null>.
async function pedirJulgamento() {
  const penRes = await fetch(`${API_BASE}/catalogos/tiposPenalidade`);
  const penalidades = (await penRes.json()).filter(p => p.ativo !== false && p.codigo !== "EXCLUSAO");

  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Julgar processo</h3>
      <div class="input-group">
        <label>Resultado:</label>
        <select id="modalResultado">
          <option value="ARQUIVADO">Arquivado (sem sanção)</option>
          <option value="SANCAO">Sanção</option>
          <option value="EXCLUSAO">Exclusão</option>
        </select>
      </div>
      <div class="input-group" id="modalGrupoPenalidade">
        <label>Penalidade (Art. 95 §2º):</label>
        <select id="modalPenalidade">${penalidades.map(p => `<option value="${p.penalidadeId}">${p.nome}</option>`).join("")}</select>
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
    const grupoPenalidade = document.getElementById("modalGrupoPenalidade");
    const atualizarVisibilidade = () => {
      const ehSancao = selectResultado.value === "SANCAO";
      grupoDias.style.display = ehSancao ? "block" : "none";
      grupoPenalidade.style.display = ehSancao ? "block" : "none";
    };
    selectResultado.addEventListener("change", atualizarVisibilidade);
    atualizarVisibilidade();
    document.getElementById("modalConfirmar").onclick = () => {
      const resultado = selectResultado.value;
      if (resultado === "SANCAO" && penalidades.length === 0) { mostrarToast("Cadastre ao menos 1 penalidade no catálogo antes de julgar.", "erro"); return; }
      const penalidadeId = resultado === "SANCAO" ? document.getElementById("modalPenalidade").value : null;
      const diasSancao = document.getElementById("modalDiasSancao").value || null;
      fecharModal();
      resolve({ resultado, penalidadeId, diasSancao });
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
    body: JSON.stringify({ acao: "JULGAR", resultado: dados.resultado, penalidadeId: dados.penalidadeId, diasSancao: dados.diasSancao })
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

// ---- ABA OUVIDORIA (v3.7 — Art. 104) ----
// Abrir denúncia/sugestão é aberto a qualquer pessoa logada (sem checar
// permissão) — só o painel de apuração abaixo é restrito a "ouvidoria".
async function salvarDenunciaOuvidoria() {
  const tipo = document.getElementById("ouvidoriaTipo").value;
  const denunciadoMembroId = document.getElementById("ouvidoriaDenunciado").value || null;
  const relato = document.getElementById("ouvidoriaRelato").value.trim();
  const anonima = document.getElementById("ouvidoriaAnonima").checked;
  const msg = document.getElementById("resultadoOuvidoria");
  if (!relato) { msg.textContent = "Descreva o relato antes de enviar."; return; }

  const res = await fetchProtegido(`${API_BASE}/ouvidoria`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo, denunciadoMembroId, relato, anonima })
  });
  const data = await res.json();
  if (data.sucesso) {
    msg.innerHTML = `✅ Denúncia registrada. <strong>Guarde este protocolo, é a única forma de acompanhar:</strong><br /><span style="font-size:1.2em;">${data.protocolo}</span>`;
    document.getElementById("ouvidoriaDenunciado").value = "";
    document.getElementById("ouvidoriaRelato").value = "";
    document.getElementById("ouvidoriaAnonima").checked = false;
  } else {
    msg.textContent = data.mensagem || "Não foi possível registrar a denúncia.";
  }
}

async function consultarProtocoloOuvidoriaAcao() {
  const protocolo = document.getElementById("consultaProtocolo").value.trim();
  const msg = document.getElementById("resultadoConsultaProtocolo");
  if (!protocolo) { msg.textContent = "Informe o protocolo."; return; }
  const res = await fetch(`${API_BASE}/ouvidoria-protocolo/${encodeURIComponent(protocolo)}`);
  const data = await res.json();
  msg.textContent = data.sucesso ? `Status: ${ROTULO_STATUS_OUVIDORIA[data.status] || data.status} (protocolado em ${data.dataProtocolo})` : (data.mensagem || "Protocolo não encontrado.");
}

const ROTULO_TIPO_OUVIDORIA = {
  INFRACAO_ETICA: "Infração Ética", ASSEDIO: "Assédio", DESVIO_FINANCEIRO: "Desvio Financeiro",
  ABUSO_AUTORIDADE: "Abuso de Autoridade", SUGESTAO: "Sugestão de Melhoria"
};
const ROTULO_STATUS_OUVIDORIA = {
  RECEBIDA: "Recebida", EM_APURACAO: "Em apuração", ENCAMINHADA_PROCESSO: "Encaminhada para processo",
  ARQUIVADA: "Arquivada", CONCLUIDA: "Concluída"
};

// O painel só é montado/carregado se a pessoa tiver a permissão "ouvidoria"
// — sem isso, a aba mostra só o formulário público de abrir denúncia.
async function carregarPainelOuvidoria() {
  const container = document.getElementById("painelOuvidoriaConteudo");
  if (!authPermissoes.includes("ouvidoria")) { container.innerHTML = ""; return; }

  const res = await fetchProtegido(`${API_BASE}/ouvidoria`);
  const denuncias = await res.json();
  if (!Array.isArray(denuncias)) { container.innerHTML = ""; return; }

  let html = `<hr /><h4 style="margin:0 0 10px; color: var(--cor-primaria);">Painel da Ouvidoria (CEI/NIF)</h4>
    <div class="rolagem-tabela"><table class="tabela-frequencia"><thead><tr>
      <th>Protocolo</th><th>Tipo</th><th>Denunciante</th><th>Denunciado</th><th>Relato</th><th>Ouvidor</th><th>Status</th><th></th>
    </tr></thead><tbody>`;
  denuncias.forEach(d => {
    const podeAnonimizar = authPermissoes.includes("protecaodedados") && !d.dadosAnonimizados && ["ARQUIVADA", "CONCLUIDA"].includes(d.status);
    html += `<tr>
      <td>${d.protocolo}</td>
      <td>${ROTULO_TIPO_OUVIDORIA[d.tipo] || d.tipo}</td>
      <td>${d.anonima ? "<span class='subtitle'>Anônima</span>" : (d.denuncianteNome || "-")}</td>
      <td>${d.denunciadoNome || "-"}${d.denunciadoEhDiretoria ? " ⚠️" : ""}</td>
      <td style="max-width:260px;">${d.relato || ""}</td>
      <td>${d.ouvidorNome || "-"}</td>
      <td>${ROTULO_STATUS_OUVIDORIA[d.status] || d.status}</td>
      <td class="acoes-inline">
        ${d.status === "RECEBIDA" ? `<button class="btn-link" onclick="atribuirOuvidorAcao(${d.denunciaId})">Atribuir Ouvidor</button>` : ""}
        ${d.denunciadoMembroId && d.status !== "ENCAMINHADA_PROCESSO" ? `<button class="btn-link" onclick="encaminharProcessoOuvidoriaAcao(${d.denunciaId})">Encaminhar p/ Processo</button>` : ""}
        ${!["ARQUIVADA", "CONCLUIDA", "ENCAMINHADA_PROCESSO"].includes(d.status) ? `<button class="btn-link" onclick="arquivarOuvidoriaAcao(${d.denunciaId})">Arquivar</button>
        <button class="btn-link" onclick="concluirOuvidoriaAcao(${d.denunciaId})">Concluir</button>` : ""}
        ${podeAnonimizar ? `<button class="btn-link btn-link-perigo" onclick="anonimizarOuvidoriaAcao(${d.denunciaId})">Anonimizar</button>` : ""}
      </td>
    </tr>`;
  });
  html += "</tbody></table></div>";
  container.innerHTML = html;
}

async function evoluirOuvidoriaAcao(denunciaId, corpo) {
  const res = await fetchProtegido(`${API_BASE}/ouvidoria/${denunciaId}/evoluir`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo)
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarPainelOuvidoria();
  return data;
}

async function atribuirOuvidorAcao(denunciaId) {
  const ouvidorMembroId = await pedirTexto("Atribuir Ouvidor", "Matrícula do Ouvidor responsável");
  if (!ouvidorMembroId) return;
  await evoluirOuvidoriaAcao(denunciaId, { acao: "ATRIBUIR_OUVIDOR", ouvidorMembroId });
}

async function arquivarOuvidoriaAcao(denunciaId) {
  const justificativa = await pedirTexto("Arquivar denúncia", "Justificativa (obrigatória)");
  if (!justificativa) return;
  await evoluirOuvidoriaAcao(denunciaId, { acao: "ARQUIVAR", justificativa });
}

async function concluirOuvidoriaAcao(denunciaId) {
  const justificativa = await pedirTexto("Concluir denúncia", "Justificativa (obrigatória)");
  if (!justificativa) return;
  await evoluirOuvidoriaAcao(denunciaId, { acao: "CONCLUIR", justificativa });
}

async function anonimizarOuvidoriaAcao(denunciaId) {
  if (!(await confirmarAcao("Anonimizar esta denúncia? O relato e a identidade do denunciante são apagados permanentemente (Art. 104 §9º).", "Anonimizar"))) return;
  await evoluirOuvidoriaAcao(denunciaId, { acao: "ANONIMIZAR" });
}

// Reaproveita o mesmo seletor de órgão central/territorial e catálogo de
// infrações já usados na abertura de Processo Disciplinar (v3.2/v3.6).
function pedirEncaminhamentoProcesso(orgaos, locais, infracoes) {
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <h3>Encaminhar para Processo Disciplinar</h3>
      <div class="input-group">
        <label>Órgão:</label>
        <select id="modalOrgaoEncaminhar">
          ${orgaos.map(o => `<option value="central:${o.orgaoId}">${o.sigla}</option>`).join("")}
          ${locais.map(o => `<option value="local:${o.orgaoLocalId}">${o.sigla} — ${o.nome}</option>`).join("")}
        </select>
      </div>
      <div class="input-group">
        <label>Infrações (Art. 96-99) — selecione 1 ou mais:</label>
        <div class="rolagem-tabela" style="max-height:180px;">
          ${infracoes.filter(i => i.ativo !== false).map(i => `<label style="display:block;"><input type="checkbox" class="chk-infracao-ouvidoria" value="${i.infracaoId}" style="width:auto;" /> ${i.nome}</label>`).join("")}
        </div>
      </div>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar" id="modalConfirmar">Encaminhar</button>
      </div>`;
    document.getElementById("modalOverlay").classList.remove("escondido");
    document.getElementById("modalConfirmar").onclick = () => {
      const [tipo, id] = document.getElementById("modalOrgaoEncaminhar").value.split(":");
      const infracoesIds = Array.from(document.querySelectorAll(".chk-infracao-ouvidoria:checked")).map(el => Number(el.value));
      fecharModal();
      resolve({ orgaoResponsavelId: tipo === "central" ? id : null, orgaoLocalId: tipo === "local" ? id : null, infracoesIds });
    };
    document.getElementById("modalCancelar").onclick = () => { fecharModal(); resolve(null); };
  });
}

async function encaminharProcessoOuvidoriaAcao(denunciaId) {
  const [orgaosRes, locaisRes, infracoesRes] = await Promise.all([
    fetch(`${API_BASE}/orgaos`), fetch(`${API_BASE}/catalogos/orgaosLocais`), fetch(`${API_BASE}/catalogos/tiposInfracao`)
  ]);
  const orgaos = await orgaosRes.json();
  const locais = (await locaisRes.json()).filter(o => o.ativo !== false && ["JAI", "JEA", "TER"].includes(o.sigla));
  const infracoes = await infracoesRes.json();

  const dados = await pedirEncaminhamentoProcesso(orgaos, locais, infracoes);
  if (!dados) return;
  if (dados.infracoesIds.length === 0) { mostrarToast("Selecione pelo menos 1 infração.", "erro"); return; }
  await evoluirOuvidoriaAcao(denunciaId, { acao: "ENCAMINHAR_PROCESSO", ...dados });
}
