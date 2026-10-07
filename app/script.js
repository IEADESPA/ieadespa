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
// vB.10 — acessibilidade: os cards de módulo (.card-modulo) são <div
// onclick=...>, que por padrão não são operáveis por teclado (sem
// tabindex/role, Tab nunca para neles, Enter/Espaço não fazem nada). Em vez
// de reescrever os 3 lugares que os geram como <button> (quebraria o CSS
// de grade já pronto), cada um ganha tabindex/role="button" e chama isso no
// keydown — mesmo efeito de clicar, acessível pelo teclado.
// CSP forte: o keydown chega pelo despachante (eventos.js), que escuta no document — evento.currentTarget seria o document, não o cartão. Por isso o
// cartão vem como 2º argumento (data-args-keydown com ARG.evento, ARG.elemento); o currentTarget fica só de reserva para quem chamar do jeito antigo.
function ativarComTeclado(evento, elemento) {
  if (evento.key === "Enter" || evento.key === " ") {
    evento.preventDefault();
    (elemento || evento.currentTarget).click();
  }
}

// ---- AJUDA CONTEXTUAL (vB.10 — primeiro uso) ----
// Cobertura parcial de propósito: as abas/sub-abas mais comuns primeiro,
// cresce 1 entrada por vez — sem chave própria, cai no texto genérico
// (nunca aparece vazio).
let chaveAjudaAtual = "meupainel";
const AJUDA_POR_ABA = {
  "meupainel:perfil": "Sua página inicial: o painel do dia (pendências que precisam de você) e os módulos que você tem permissão de acessar.",
  "meupainel:dados": "Seus dados cadastrais. Pedidos de correção passam pela Secretaria — não é edição direta.",
  "meupainel:cartas": "Solicite Carta de Recomendação, Carta de Mudança ou Atestado Supletivo — os dois primeiros saem na hora, o de Mudança tem um segundo passo de confirmação.",
  "meupainel:tarefas": "Fluxos de aprovação que estão parados esperando por você, de qualquer módulo do sistema.",
  "meupainel:minhaformacao": "Suas trilhas de formação, o progresso e a validade de cada certificado — com o QR/código pra quem quiser conferir a autenticidade, sem login.",
  "meupainel:seguranca": "Veja onde sua conta está logada e, se tiver algum papel de Liderança, delegue temporariamente pra outra pessoa sem precisar emprestar sua senha.",
  financeiro: "Tesouraria, patrimônio, orçamento e prestação de contas. Use o menu de módulos pra escolher a área específica (lançamentos, saídas, seguros, etc.).",
  pessoas: "Cadastro de membros — a lista respeita seu escopo (só aparece quem está sob sua responsabilidade territorial).",
  reunioes: "Abrir/encerrar sessão de qualquer órgão (Assembleia, CLI, Diretoria...), registrar presença e ver o histórico de reuniões.",
  cartas: "Gestão administrativa das Cartas de Trânsito solicitadas pelos membros — emitir, cancelar, baixar PDF.",
  orgaos: "Composição e assentos dos órgãos centrais e regionais.",
  estrutura: "Hierarquia territorial (Área, Região, Quadrante, Distrito) e o cadastro de Congregações.",
  catalogos: "Catálogos usados em vários módulos (cargos, prazos, status) — mudar aqui afeta o sistema inteiro.",
  permissoes: "Quem tem acesso à Secretaria, com qual papel e qual escopo territorial.",
  consagracoes: "Esteira de consagração ministerial — do protocolo até a aprovação final.",
  enquetes: "Votações internas — secretas ou públicas, vinculantes ou não.",
  arquivos: "Documentos institucionais (atas, termos, memorandos) e políticas de retenção de dados.",
  disciplina: "Processos disciplinares — conteúdo sigiloso, visível só a quem tem esta permissão.",
  abandono: "Radar e procedimento de abandono eclesiástico/digital.",
  auditoria: "Trilha de auditoria, indicadores de compliance e recertificação periódica de acesso.",
  trilhas: "Trilhas de formação por papel, matrículas, conclusão de módulos, certificados verificáveis e os requisitos de formação exigidos em consagração, nomeação, escala, batismo e EBD.",
  psc: "Avaliação anual obrigatória de cada congregação pelos 5 Sinais Vitais (Escada Bloqueada): preencher, enviar, validar e homologar, mais a reclassificação compulsória para Extensão da Tenda (Regimento Art. 127-129).",
  calendario: "Calendário Oficial do Campo: veja a agenda do mês, proponha datas (o nível do evento decide quem prevalece no choque), acompanhe a pauta e, conforme a sua permissão, consolide, homologue o ano ou ajuste a agenda litúrgica (Regimento Art. 79, 81, 147, 154 e 154-A).",
  "meupainel:agenda": "A agenda oficial dos próximos 60 dias: eventos do Calendário Oficial já homologados e a grade litúrgica fixa. Escolha a sua congregação para ver só o que alcança ela.",
  canais: "Relação de Canais Oficiais da IEADESPA (Estatuto Art. 12): só conta, número ou grupo em nome da Igreja. Registre canais, designe administradores, acompanhe a Regra das 24 Horas, as trocas de senha na sucessão de liderança e a transmissão dos cultos (Área Cega).",
  "meupainel:canais": "Se você administra um canal oficial, aceite aqui o Termo de Dever de Moderação e trate as ocorrências em até 24 horas. Qualquer pessoa pode avisar um conteúdo irregular num canal oficial e acompanhar o aviso.",
  eventos: "Dossiê de governança do evento do Calendário: organizadores, convidados externos (parecer do Conselho de Ética e Nada Consta da Presidência — Art. 111 e 111-A) e Caixa Flutuante (superávit recolhido à Sede ou convertido em benfeitoria — Art. 53-E §2º). Inscrição, check-in e certificado ficam no site.",
  "meupainel:eventos": "Se você organiza um evento (propôs no Calendário ou foi designado), registre aqui os convidados externos e o Caixa Flutuante do evento. Inscrição, lista de espera, check-in e certificado ficam no site — use os links do cartão.",
  protecaodedados: "Solicitações de titular (LGPD), políticas de retenção e o Registro de Operações de Tratamento (ROPA/RIPD)."
};
function alternarAjudaContextual() {
  const painel = document.getElementById("painelAjuda");
  const abrindo = painel.style.display === "none";
  painel.style.display = abrindo ? "block" : "none";
  if (!abrindo) return;
  const texto = AJUDA_POR_ABA[chaveAjudaAtual] || "Ainda não tem uma dica específica pra esta tela — a documentação completa está no README do projeto.";
  document.getElementById("conteudoAjudaContextual").textContent = texto;
}
document.addEventListener("click", (ev) => {
  const caixa = document.querySelector(".caixa-ajuda");
  const painel = document.getElementById("painelAjuda");
  if (!painel || painel.style.display === "none" || !caixa) return;
  if (!caixa.contains(ev.target)) painel.style.display = "none";
});

// Atalho: manda o toast certo a partir de uma resposta { sucesso, mensagem } da API.
function avisarResultado(data) {
  mostrarToast(data.mensagem, data.sucesso ? "sucesso" : "erro");
}

// vB.10 — rede de segurança global: qualquer erro que escapou de todo
// tratamento local (ex: `res.json()` falhando porque o servidor devolveu
// um erro bruto/não-JSON, ou qualquer exceção não prevista dentro de um
// botão data-on-click="funcaoAsync" — antes onclick="funcaoAsync()"; o despachante eventos.js não captura a promessa)
// cai aqui, em vez de travar o botão em
// silêncio sem explicação nenhuma pra quem está usando. Mensagem sempre em
// linguagem de secretaria; o detalhe técnico só vai pro console, nunca pra
// tela.
function avisarErroInesperado(motivo) {
  console.error("[erro não tratado]", motivo);
  mostrarToast("Algo deu errado nesta ação. Tente de novo — se continuar, avise a equipe técnica.", "erro");
}
// Só `unhandledrejection` (promises rejeitadas sem `.catch` local) — é
// exatamente o padrão de `data-on-click="funcaoAsync"` que domina este arquivo
// (nenhum tratamento de erro no HTML em si). `window.onerror` genérico
// fica de fora de propósito: pegaria erro de terceiro (CDN, extensão do
// navegador) e mostraria um toast confuso por algo fora do nosso controle.
window.addEventListener("unhandledrejection", (evento) => {
  if (evento.reason && evento.reason.message === "Sessão expirada") return; // já tratado em fetchProtegido
  if (evento.reason && evento.reason.jaAvisado) { evento.preventDefault(); return; } // falha de rede: fetchProtegido já mostrou o aviso
  // v7.6 — consequência de uma recusa que a pessoa ACABOU de ver (403/409/5xx avisado por fetchProtegido): uma tela antiga que ainda lia a resposta como se
  // tivesse dado certo tropeça no corpo de erro. Não é erro novo nem merece um segundo aviso; a recusa já foi explicada.
  if (evento.reason instanceof TypeError && ultimaRecusa && Date.now() - ultimaRecusa.quando < 5000) {
    evento.preventDefault();
    if (!ultimaRecusa.avisada) { ultimaRecusa.avisada = true; mostrarToast(ultimaRecusa.mensagem, "erro"); }
    return;
  }
  avisarErroInesperado(evento.reason);
});
// Última resposta recusada (4xx/5xx) que passou por fetchProtegido: { quando, mensagem, avisada }.
let ultimaRecusa = null;

function fecharModal() {
  document.getElementById("modalOverlay").classList.add("escondido");
  document.getElementById("modalCaixa").innerHTML = "";
}

// Promise<boolean> — true se confirmou.
function confirmarAcao(mensagem, tituloBotao) {
  return new Promise(resolve => {
    const caixa = document.getElementById("modalCaixa");
    caixa.innerHTML = `
      <p>${escaparHtmlEbd(mensagem)}</p>
      <div class="modal-acoes">
        <button class="btn-confirmar btn-secundario" id="modalCancelar">Cancelar</button>
        <button class="btn-confirmar btn-perigo" id="modalConfirmar">${escaparHtmlEbd(tituloBotao || "Confirmar")}</button>
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
      <h3>${escaparHtmlEbd(titulo)}</h3>
      <textarea id="modalTexto" rows="3" placeholder="${escaparHtmlEbd(placeholder || "")}"></textarea>
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

// ---- PWA: instalação + notificação push (vB.5) ----
let eventoInstalarPwa = null;
window.addEventListener("beforeinstallprompt", (ev) => {
  ev.preventDefault();
  eventoInstalarPwa = ev;
  const cx = document.getElementById("cxInstalarApp");
  if (cx) cx.style.display = "block";
});

async function instalarAppAcao() {
  if (!eventoInstalarPwa) return;
  await eventoInstalarPwa.prompt();
  eventoInstalarPwa = null;
  document.getElementById("cxInstalarApp").style.display = "none";
}

function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("service-worker.js").catch((e) => console.error("Falha ao registrar service worker:", e));
}

// vB.10 — modo de leitura fácil (mesmo mecanismo do site institucional,
// html[data-readable="true"]) — fonte maior, mais espaçamento, foco mais
// grosso, tudo escalando junto porque o CSS já usa `rem`. Preferência só no
// navegador (localStorage), nunca enviada ao servidor.
function aplicarModoLeitura(ativo) {
  document.documentElement.dataset.readable = ativo ? "true" : "false";
  const btn = document.getElementById("btnModoLeitura");
  if (btn) btn.setAttribute("aria-pressed", ativo ? "true" : "false");
}
function alternarModoLeitura() {
  const ativoAgora = document.documentElement.dataset.readable === "true";
  const novo = !ativoAgora;
  aplicarModoLeitura(novo);
  try { localStorage.setItem("modoLeituraFacil", novo ? "1" : "0"); } catch (e) { /* ok não persistir */ }
}
document.addEventListener("DOMContentLoaded", () => {
  let salvo = null;
  try { salvo = localStorage.getItem("modoLeituraFacil"); } catch (e) { /* segue sem preferência salva */ }
  if (salvo === "1") aplicarModoLeitura(true);
});

function base64UrlParaUint8Array(base64Url) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = window.atob(base64);
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)));
}

function arrayBufferParaBase64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Só mostra o botão quando o navegador realmente suporta Push — sem isso
// ficaria um botão morto pra quem clicasse (ex: Safari iOS mais antigo).
async function configurarBotaoPush() {
  const cx = document.getElementById("cxAtivarPush");
  if (!cx || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
  cx.style.display = "block";
  const registration = await navigator.serviceWorker.ready;
  const inscricaoAtual = await registration.pushManager.getSubscription();
  document.getElementById("btnAtivarPush").textContent = inscricaoAtual ? "🔕 Desativar notificação neste dispositivo" : "🔔 Ativar notificação neste dispositivo";
}

async function alternarPushAcao() {
  const registration = await navigator.serviceWorker.ready;
  const inscricaoAtual = await registration.pushManager.getSubscription();
  if (inscricaoAtual) {
    await fetchProtegido(`${API_BASE}/push-inscricoes`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: inscricaoAtual.endpoint })
    });
    await inscricaoAtual.unsubscribe();
    mostrarToast("Notificação desativada neste dispositivo.", "sucesso");
  } else {
    const res = await fetch(`${API_BASE}/push-inscricoes`);
    const { vapidPublicKey } = await res.json();
    if (!vapidPublicKey) { mostrarToast("Notificação push não configurada no servidor.", "erro"); return; }
    const inscricao = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlParaUint8Array(vapidPublicKey) });
    await fetchProtegido(`${API_BASE}/push-inscricoes`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: inscricao.endpoint, keys: { p256dh: arrayBufferParaBase64Url(inscricao.getKey("p256dh")), auth: arrayBufferParaBase64Url(inscricao.getKey("auth")) } })
    });
    mostrarToast("Notificação ativada neste dispositivo.", "sucesso");
  }
  await configurarBotaoPush();
}

document.addEventListener("DOMContentLoaded", registrarServiceWorker);

// ---- LOGIN SIMPLIFICADO POR CÓDIGO DE E-MAIL (vB.5) ----
function alternarLoginPorCodigo() {
  const cx = document.getElementById("cxLoginCodigo");
  cx.style.display = cx.style.display === "none" ? "block" : "none";
}

async function solicitarCodigoAcessoAcao() {
  const matricula = document.getElementById("matriculaPainel").value;
  const msg = document.getElementById("resultadoLogin");
  if (!matricula) { msg.textContent = "Informe sua matrícula primeiro."; return; }
  const res = await fetch(`${API_BASE}/membro/solicitar-codigo`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matricula })
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  document.getElementById("cxCampoCodigoAcesso").style.display = "block";
}

async function confirmarCodigoAcessoAcao() {
  const matricula = document.getElementById("matriculaPainel").value;
  const codigo = document.getElementById("codigoAcessoInput").value.trim();
  const msg = document.getElementById("resultadoLogin");
  if (!codigo) { msg.textContent = "Digite o código recebido."; return; }
  const res = await fetch(`${API_BASE}/membro/confirmar-codigo`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matricula, codigo })
  });
  const data = await res.json();
  if (!data.sucesso) { msg.textContent = data.mensagem; return; }
  salvarSessao(data.token, data.nome, data.permissoes, data.matricula, data.nivel);
  document.getElementById("codigoAcessoInput").value = "";
  msg.textContent = "";
  // Primeiro acesso ou "esqueci o PIN": a pessoa acabou de provar o e-mail, agora escolhe o PIN dela antes de abrir o painel.
  if (data.precisaCriarPin) { mostrarCriarPin(); return; }
  await abrirPainelConteudo(data.matricula);
}

// ---- ANEXOS GENÉRICOS (vB.4) — qualquer tela chama abrirModalAnexos(tabela,
// registroId, titulo) e ganha upload/lista/exclusão, sem reescrever nada.
// Controle de acesso é resolvido no backend (shared/anexos.js) — aqui só
// mostra o que a API devolver.
let anexosModalContexto = null;
function abrirModalAnexos(tabela, registroId, titulo) {
  anexosModalContexto = { tabela, registroId, titulo };
  const caixa = document.getElementById("modalCaixa");
  caixa.innerHTML = `
    <h3>📎 Anexos — ${escaparHtmlEbd(titulo)}</h3>
    <div class="barra-lista">
      <input type="file" id="anexoArquivo" accept="application/pdf,image/jpeg,image/png" />
      <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="enviarAnexoModal">Enviar</button>
    </div>
    <p id="resultadoAnexoModal" class="subtitle"></p>
    <div id="listaAnexosModal"></div>
    <div class="modal-acoes"><button class="btn-confirmar btn-secundario" data-on-click="fecharModal">Fechar</button></div>
  `;
  document.getElementById("modalOverlay").classList.remove("escondido");
  carregarAnexosModal();
}

async function carregarAnexosModal() {
  const { tabela, registroId } = anexosModalContexto;
  const container = document.getElementById("listaAnexosModal");
  if (!container) return; // modal já foi fechado antes da resposta chegar
  const res = await fetchProtegido(`${API_BASE}/anexos?tabela=${tabela}&registroId=${registroId}`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum anexo ainda.</p>";
    return;
  }
  container.innerHTML = lista.map(a => `
    <div class="item-notificacao">
      <a href="${urlSegura(a.urlAssinada)}" target="_blank" rel="noopener">${escaparHtmlEbd(a.nomeArquivo)}</a>
      <div class="rodape-notificacao">
        <span>${new Date(a.criadoEm).toLocaleDateString("pt-BR")}</span>
        <button class="btn-link btn-link-perigo" data-on-click="excluirAnexoModal" data-args-click="${argsAttr(a.anexoId)}">Excluir</button>
      </div>
    </div>
  `).join("");
}

function lerArquivoComoBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result.split(",")[1]);
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}

async function enviarAnexoModal() {
  const { tabela, registroId } = anexosModalContexto;
  const input = document.getElementById("anexoArquivo");
  const arquivo = input.files[0];
  const msg = document.getElementById("resultadoAnexoModal");
  if (!arquivo) { msg.textContent = "Escolha um arquivo primeiro."; return; }
  const documentoBase64 = await lerArquivoComoBase64(arquivo);
  const res = await fetchProtegido(`${API_BASE}/anexos`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tabela, registroId, nomeArquivo: arquivo.name, mimeType: arquivo.type, documentoBase64 })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = "";
  if (data.sucesso) { input.value = ""; carregarAnexosModal(); }
}

async function excluirAnexoModal(anexoId) {
  // confirmarAcao usa o MESMO modalCaixa — chamar com o modal de anexos já
  // aberto substitui o conteúdo dele; por isso reabre o modal de anexos do
  // zero depois (não dá pra só atualizar a lista, ela não existe mais no DOM).
  const { tabela, registroId, titulo } = anexosModalContexto;
  const confirmou = await confirmarAcao("Excluir este anexo?", "Excluir");
  if (!confirmou) return;
  const res = await fetchProtegido(`${API_BASE}/anexos/${anexoId}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  abrirModalAnexos(tabela, registroId, titulo);
}

// ---- estado do Painel único (guardado só no navegador) ----
// authToken só existe pra quem tem acesso administrativo (Lideranca); a matrícula
// fica salva sempre, pra popular a aba "Meu Painel" e sobreviver a um F5.
let authToken = sessionStorage.getItem("authToken") || null;
let authNome = sessionStorage.getItem("authNome") || null;
let authPermissoes = JSON.parse(sessionStorage.getItem("authPermissoes") || "[]");
let authMatricula = sessionStorage.getItem("authMatricula") || null;
let authNivel = sessionStorage.getItem("authNivel") || null;
// "Geral" = papel de nível Global E escopo de todas as congregações (o servidor confere de novo em cada rota; aqui só decide o que aparece na tela).
let authGeral = sessionStorage.getItem("authGeral") === "1";
// Elementos com a classe "so-geral" (index.html) só aparecem para o nível geral: a regra de visibilidade fica no CSS, ligada por esta classe no <body>.
function marcarSessaoGeralNaPagina() { if (typeof document !== "undefined" && document.body) document.body.classList.toggle("sessao-geral", authGeral); }
document.addEventListener("DOMContentLoaded", marcarSessaoGeralNaPagina);
// Trava 6-A: turmas em que a pessoa logada é professor ativo (modo
// professor da aba EBD) — recarregada a cada abrirPainelConteudo.
let ebdTurmasProfessor = [];

function salvarSessao(token, nome, permissoes, matricula, nivel, escopo, geral) {
  authToken = token;
  authNome = nome;
  authPermissoes = permissoes || [];
  authMatricula = matricula != null ? String(matricula) : authMatricula;
  authNivel = nivel || null;
  // v7.6 — o login manda "geral" já calculado com a regra das rotas (nível Global e escopo TODAS numa MESMA concessão); nivel/escopo de topo juntam o cargo
  // próprio com delegações e enganavam a tela. Resposta sem o campo (servidor antigo durante a publicação): a regra antiga.
  authGeral = typeof geral === "boolean" ? geral : (authNivel === "GLOBAL" && escopo === "TODAS");
  sessionStorage.setItem("authGeral", authGeral ? "1" : "0");
  marcarSessaoGeralNaPagina();
  sessionStorage.setItem("authToken", token);
  sessionStorage.setItem("authNome", nome || "");
  sessionStorage.setItem("authPermissoes", JSON.stringify(authPermissoes));
  if (authMatricula != null) sessionStorage.setItem("authMatricula", authMatricula);
  if (authNivel) sessionStorage.setItem("authNivel", authNivel);
}
// A sessão é de quem entrou com a senha de acesso administrativo (tem nível de papel e/ou permissões)? A de PIN ou de código de e-mail é de membro: as telas e as
// rotas da liderança (tarefas de fluxo, delegações, trocar a senha) não valem para ela.
function sessaoDeLiderancaNaTela() {
  return !!(authToken && (authNivel || (authPermissoes && authPermissoes.length)));
}
function limparSessao() {
  authToken = null;
  authNome = null;
  authPermissoes = [];
  ebdTurmasProfessor = [];
  authMatricula = null;
  authNivel = null;
  authGeral = false;
  sessionStorage.removeItem("authGeral");
  marcarSessaoGeralNaPagina();
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
  // vB.10 — mensagem de secretaria pra quem está sem internet/servidor fora
  // do ar, em vez do erro técnico do navegador ("Failed to fetch") ficar
  // silencioso (sem isso, o clique só "não fazia nada").
  let res;
  try {
    res = await fetch(url, Object.assign({}, opts, { headers }));
  } catch (falhaDeRede) {
    mostrarToast("Não foi possível conectar ao servidor. Verifique sua internet e tente de novo.", "erro");
    if (falhaDeRede && typeof falhaDeRede === "object") falhaDeRede.jaAvisado = true;
    throw falhaDeRede;
  }
  if (res.status === 401) {
    // v7.6 — a sessão pode ter sido ENCERRADA (saiu em outro aparelho, senha trocada, cargo alterado...): o servidor diz "Sua sessão foi encerrada. Entre
    // novamente." e a tela trata igual à sessão vencida.
    const dados401 = await res.clone().json().catch(() => null);
    limparSessao();
    mostrarToast((dados401 && typeof dados401.mensagem === "string" && /encerrada/i.test(dados401.mensagem)) ? dados401.mensagem : "Sua sessão expirou. Faça login novamente.", "erro");
    mostrarTelaPainelInicial();
    throw new Error("Sessão expirada");
  }
  if (res.status === 403) {
    const data = await res.clone().json().catch(() => null);
    if (data && data.criarPin) {
      // Sessão aberta com o PIN provisório da Secretaria: só serve para criar o PIN próprio.
      mostrarToast("Crie o seu PIN para continuar.", "erro");
      mostrarCriarPin();
    } else if (data && data.termosPendentes && data.termosPendentes.length > 0) {
      mostrarToast("Assine os termos pendentes para continuar.", "erro");
      mostrarModalTermos(data.termosPendentes);
    } else {
      // o servidor diz o motivo (ex.: "Esta função é da administração geral da igreja.", "Fora do seu escopo de atuação."): mostra a mensagem dele
      mostrarToast((data && typeof data.mensagem === "string" && data.mensagem) || "Você não tem permissão para essa ação.", "erro");
    }
  }
  if (!res.ok) {
    // v7.6 — resposta recusada: o corpo de erro nem sempre é JSON (o Azure devolve página/vazio num 500). json() passa a nunca lançar: vira { sucesso:false,
    // mensagem } — as telas que já olham "sucesso"/Array.isArray seguem certas, e jsonDaTela() escreve o motivo no lugar do painel.
    const corpo = await res.clone().json().catch(() => null);
    const mensagem = (corpo && typeof corpo.mensagem === "string" && corpo.mensagem) || mensagemPadraoDaRecusa(res.status);
    const jsonOriginal = res.json.bind(res);
    try { res.json = async () => { try { return await jsonOriginal(); } catch (_) { return { sucesso: false, mensagem }; } }; } catch (_) { /* objeto sem extensão: fica o json() original */ }
    if (res.status >= 500) mostrarToast(mensagem, "erro");
    ultimaRecusa = { quando: Date.now(), mensagem, avisada: res.status === 403 || res.status >= 500 };
  }
  return res;
}
function mensagemPadraoDaRecusa(status) {
  if (status === 403) return "Você não tem permissão para ver ou fazer isto.";
  if (status === 404) return "Não encontrado.";
  if (status >= 500) return "O servidor teve um problema ao atender agora (erro " + status + "). Tente de novo em instantes; se continuar, avise a equipe técnica.";
  return "Não foi possível concluir (erro " + status + ").";
}
// Carga de tela (GET): devolve o JSON só se veio certo e na forma esperada ("lista" = array; "objeto" = objeto sem sucesso:false). Senão escreve o motivo —
// escapado — NO LUGAR do painel e devolve null: nunca "Nenhum item" mentiroso para quem não tem permissão, nem NaN/tela em branco. 401 nem chega aqui
// (fetchProtegido já voltou para o login).
// Lista para preencher <select>/cache: resposta recusada (403/5xx) ou fora do formato vira lista vazia — o aviso da recusa já saiu em fetchProtegido.
async function listaDaApi(pedido) {
  const res = await pedido;
  const d = await res.json().catch(() => null);
  return res.ok && Array.isArray(d) ? d : [];
}
async function jsonDaTela(res, container, forma) {
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  const formaCerta = forma === "lista" ? Array.isArray(data) : (!!data && typeof data === "object" && data.sucesso !== false);
  if (res.ok && formaCerta) return data;
  let motivo;
  if (data && typeof data.mensagem === "string" && data.mensagem) motivo = data.mensagem;
  else if (!res.ok) motivo = mensagemPadraoDaRecusa(res.status);
  else motivo = "A resposta do servidor veio num formato inesperado. Tente de novo.";
  const aviso = `<p class="subtitle aviso-recusa" role="status">${res.status === 403 ? "🔒 " : "⚠️ "}${escaparHtmlEbd(motivo)}</p>`;
  (Array.isArray(container) ? container : [container]).forEach(c => { if (c) c.innerHTML = aviso; });
  return null;
}

// ---- navegação entre telas ----
function esconderTodasAsTelas() {
  document.getElementById("telaCheckin").style.display = "none";
  document.getElementById("telaPainel").style.display = "none";
  document.getElementById("telaChamadaOffline").style.display = "none";
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
  document.getElementById("cxCriarPin").style.display = "none";
  if (authToken && authMatricula) {
    abrirPainelConteudo(authMatricula);
  } else {
    document.getElementById("cxLoginPainel").style.display = "block";
    document.getElementById("cxPainelConteudo").style.display = "none";
  }
}

// ---- Painel único: um só acesso; o que aparece depende das permissões ----
// Fecho da v7.5: TODA entrada tem sessão (token). O membro comum entra com a matrícula + PIN de 4 números (ou pelo código do e-mail, que também serve de
// "primeiro acesso" e de "esqueci meu PIN"); quem tem acesso administrativo digita a senha no lugar do PIN e abre todas as abas permitidas.
// Antes, sem senha, o painel abria só com a matrícula digitada e sem sessão nenhuma.

// POST JSON sem sessão (login). Nunca lança: falha de rede ou resposta que não é JSON vira { sucesso:false, mensagem }.
async function postJsonSemSessao(url, corpo) {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const data = await res.json().catch(() => null);
    if (data && typeof data === "object") return data;
    return { sucesso: false, mensagem: "Não foi possível ler a resposta do servidor. Tente de novo." };
  } catch (_) {
    return { sucesso: false, mensagem: "Não foi possível conectar ao servidor. Verifique sua internet e tente de novo." };
  }
}

async function acessarPainel() {
  const matricula = document.getElementById("matriculaPainel").value.trim();
  const segredo = document.getElementById("senhaPainel").value;
  const msg = document.getElementById("resultadoLogin");
  if (!matricula) {
    msg.textContent = "Informe sua matrícula.";
    return;
  }
  if (!segredo) {
    msg.textContent = "Informe o seu PIN de 4 números. Primeiro acesso ou esqueceu? Use o link do código por e-mail, logo abaixo.";
    return;
  }

  let data;
  if (/^\d{4}$/.test(segredo)) {
    // PIN do membro. Se não servir, tenta como senha de liderança (há quem tenha senha de 4 números) antes de desistir.
    data = await postJsonSemSessao(`${API_BASE}/membro/entrar`, { matricula, pin: segredo });
    if (!data.sucesso) {
      const lideranca = await postJsonSemSessao(`${API_BASE}/auth/login`, { matricula, senha: segredo });
      if (!lideranca.sucesso) { msg.textContent = data.mensagem; return; }
      data = lideranca;
    }
  } else {
    data = await postJsonSemSessao(`${API_BASE}/auth/login`, { matricula, senha: segredo });
    if (!data.sucesso) { msg.textContent = data.mensagem; return; }
  }

  salvarSessao(data.token, data.nome, data.permissoes, matricula, data.nivel, data.escopo, data.geral);
  document.getElementById("senhaPainel").value = "";
  msg.textContent = "";
  if (data.pinProvisorio) { mostrarCriarPin(); return; }          // entrou com o PIN que a Secretaria gerou: precisa criar o próprio
  if (data.termosPendentes && data.termosPendentes.length > 0) {
    await mostrarModalTermos(data.termosPendentes);
    return;
  }
  await abrirPainelConteudo(matricula);
}

// Tela de criar o PIN: depois do código por e-mail (primeiro acesso / esqueci) ou do PIN provisório da Secretaria.
function mostrarCriarPin() {
  document.getElementById("cxLoginPainel").style.display = "none";
  document.getElementById("cxPainelConteudo").style.display = "none";
  document.getElementById("cxCriarPin").style.display = "block";
  document.getElementById("resultadoCriarPin").textContent = "";
  document.getElementById("novoPinInput").value = "";
  document.getElementById("novoPinRepetir").value = "";
}

async function criarPinAcao() {
  const pin = document.getElementById("novoPinInput").value.trim();
  const repetir = document.getElementById("novoPinRepetir").value.trim();
  const msg = document.getElementById("resultadoCriarPin");
  if (!/^\d{4}$/.test(pin)) { msg.textContent = "O PIN tem 4 números, sem letras nem espaços."; return; }
  if (pin !== repetir) { msg.textContent = "Os dois PINs não são iguais. Digite de novo."; return; }
  let data;
  try {
    const res = await fetchProtegido(`${API_BASE}/membro/pin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
    data = await res.json();
  } catch (_) { msg.textContent = "Não foi possível salvar o PIN agora. Tente de novo."; return; }
  if (!data.sucesso) { msg.textContent = data.mensagem || "Não foi possível salvar o PIN."; return; }
  if (data.token) { authToken = data.token; sessionStorage.setItem("authToken", authToken); }
  document.getElementById("cxCriarPin").style.display = "none";
  mostrarToast(data.mensagem, "sucesso");
  await abrirPainelConteudo(authMatricula);
}

// Meu Painel > Meus Dados Cadastrais > Meu PIN de acesso.
async function alterarMeuPinAcao() {
  const msg = document.getElementById("resultadoAlterarPin");
  const pinAtual = document.getElementById("pinAtualPessoal").value.trim();
  const pin = document.getElementById("pinNovoPessoal").value.trim();
  const repetir = document.getElementById("pinNovoRepetirPessoal").value.trim();
  if (!/^\d{4}$/.test(pin)) { msg.textContent = "O novo PIN tem 4 números, sem letras nem espaços."; return; }
  if (pin !== repetir) { msg.textContent = "Os dois PINs novos não são iguais."; return; }
  const corpo = { pin };
  if (pinAtual) corpo.pinAtual = pinAtual;
  let data;
  try {
    const res = await fetchProtegido(`${API_BASE}/membro/pin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    data = await res.json();
  } catch (_) { msg.textContent = "Não foi possível salvar o PIN agora. Tente de novo."; return; }
  msg.textContent = data.mensagem || (data.sucesso ? "PIN alterado." : "Não foi possível alterar o PIN.");
  if (data.sucesso) {
    if (data.token) { authToken = data.token; sessionStorage.setItem("authToken", authToken); }
    ["pinAtualPessoal", "pinNovoPessoal", "pinNovoRepetirPessoal"].forEach(id => { document.getElementById(id).value = ""; });
  }
}

// Secretaria (permissão "pessoas"), na ficha da pessoa: gera um PIN provisório para quem não tem e-mail ou perdeu o acesso. Aparece uma vez só.
async function gerarPinProvisorioAcao(membroId) {
  const nome = ((window._pessoasCache || []).find(x => x.membroId === membroId) || {}).nome || `matrícula ${membroId}`;
  if (!(await confirmarAcao(`Gerar um PIN provisório para ${nome}? Se a pessoa já tem PIN, ele deixa de valer.`, "Gerar PIN"))) return;
  const cx = document.getElementById("resultadoPinProvisorio");
  let data;
  try {
    const res = await fetchProtegido(`${API_BASE}/gestao/pin-membro`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membroId }) });
    data = await res.json();
  } catch (_) { return; }
  if (!data.sucesso) { cx.textContent = data.mensagem || "Não foi possível gerar o PIN."; return; }
  cx.innerHTML = `<p class="vol-selo-ok">PIN provisório de ${escaparHtmlEbd(data.nome)}: <strong style="font-size:1.4rem;letter-spacing:0.2em;">${escaparHtmlEbd(data.pin)}</strong></p>
    <p class="subtitle">Entregue pessoalmente. Vale por ${Number(data.validadeDias)} dias; a pessoa cria o próprio PIN ao entrar. Esta tela não mostra o PIN de novo.${data.avisadoPorEmail ? " A pessoa também foi avisada por e-mail." : ""}</p>`;
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
    <h3>${termo ? escaparHtmlEbd(termo.titulo) : escaparHtmlEbd(tipo)}</h3>
    <div style="max-height:300px; overflow-y:auto; border:1px solid var(--cor-borda, #ccc); padding:10px; margin-bottom:12px; text-align:justify;">
      ${termo ? escaparHtmlEbd(termo.texto) : ""}
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
  document.getElementById("cxCriarPin").style.display = "none";
  document.getElementById("cxPainelConteudo").style.display = "flex";
  document.getElementById("nomeLogado").textContent = authNome ? `Olá, ${authNome}` : "";
  // Trocar senha é só de quem tem acesso administrativo (senha de liderança); o membro comum troca o PIN (cartão "Meu PIN", sempre visível).
  document.getElementById("cxTrocarSenha").style.display = sessaoDeLiderancaNaTela() ? "block" : "none";
  await carregarTurmasProfessorEbd();
  aplicarPermissoesNoMenu();
  await carregarPainelPessoal(matricula);
  // vB.2 — sino de notificações: só existe pra quem entrou com senha (tem
  // Lideranca/matrícula de destinatário válido); quem entrou só com
  // matrícula pro check-in não tem authToken, então nem tenta.
  document.getElementById("btnSino").style.display = authToken ? "inline-block" : "none";
  if (authToken) await atualizarBadgeNotificacoes();
  // vB.4 — busca global: mesma restrição do sino (sem Lideranca, ninguém
  // tem permissão nenhuma pra nenhuma fonte de busca).
  document.getElementById("campoBuscaGlobal").parentElement.style.display = authToken ? "block" : "none";
  // vB.5 — push é por matrícula autenticada (código por e-mail OU senha de
  // Lideranca, tanto faz — as duas dão authToken); check-in só com
  // matrícula (sem token) nunca vê o botão.
  if (authToken) await configurarBotaoPush();
  // vB.7 — "Meu Perfil" é a sub-aba visível por padrão ao entrar (nunca
  // passa por mostrarSubAbaMeupainel('perfil') no login), por isso carrega
  // direto aqui também, não só na troca de sub-aba.
  if (authToken) await carregarPainelInicial();
  // v6.10 — chamada da EBD feita sem internet: envia assim que há sessão.
  agendarSincronizacaoOfflineEbd();
}

// ---- BUSCA GLOBAL (vB.4) ----
let timeoutBuscaGlobal = null;
function onDigitarBuscaGlobal() {
  clearTimeout(timeoutBuscaGlobal);
  const termo = document.getElementById("campoBuscaGlobal").value.trim();
  const painel = document.getElementById("painelBuscaGlobal");
  if (termo.length < 2) { painel.style.display = "none"; return; }
  timeoutBuscaGlobal = setTimeout(() => executarBuscaGlobal(termo), 300);
}

async function executarBuscaGlobal(termo) {
  const painel = document.getElementById("painelBuscaGlobal");
  painel.style.display = "block";
  painel.innerHTML = "<div class=\"painel-notificacoes-vazio\">Buscando...</div>";
  try {
    const res = await fetchProtegido(`${API_BASE}/busca-global?q=${encodeURIComponent(termo)}`);
    const lista = await res.json();
    if (!Array.isArray(lista) || lista.length === 0) {
      painel.innerHTML = "<div class=\"painel-notificacoes-vazio\">Nada encontrado.</div>";
      return;
    }
    painel.innerHTML = lista.map(r => `
      <div class="item-notificacao" data-on-click="irParaResultadoBusca" data-args-click="${argsAttr(String(r.aba || ""))}">
        <span class="titulo-notificacao">${escaparHtmlEbd(r.titulo)}</span>
        <span>${escaparHtmlEbd(r.tipo)} — ${escaparHtmlEbd(r.subtitulo || "")}</span>
      </div>
    `).join("");
  } catch (e) {
    painel.innerHTML = "<div class=\"painel-notificacoes-vazio\">Não foi possível buscar.</div>";
  }
}

function irParaResultadoBusca(aba) {
  document.getElementById("painelBuscaGlobal").style.display = "none";
  document.getElementById("campoBuscaGlobal").value = "";
  if (aba) mostrarAbaSecretaria(aba);
}

document.addEventListener("click", (ev) => {
  const caixa = document.querySelector(".caixa-busca-global");
  const painel = document.getElementById("painelBuscaGlobal");
  if (!painel || painel.style.display === "none" || !caixa) return;
  if (!caixa.contains(ev.target)) painel.style.display = "none";
});

// ---- SINO DE NOTIFICAÇÕES (vB.2 — Motor de notificações) ----
async function atualizarBadgeNotificacoes() {
  try {
    const res = await fetchProtegido(`${API_BASE}/notificacoes/contagem`);
    const data = await res.json();
    const badge = document.getElementById("badgeSino");
    if (data.naoLidas > 0) {
      badge.textContent = data.naoLidas > 99 ? "99+" : data.naoLidas;
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }
  } catch (e) { /* sessão expirada já é tratada em fetchProtegido */ }
}

async function alternarPainelNotificacoes() {
  const painel = document.getElementById("painelNotificacoes");
  const abrindo = painel.style.display === "none";
  painel.style.display = abrindo ? "block" : "none";
  if (abrindo) await carregarPainelNotificacoes();
}

async function carregarPainelNotificacoes() {
  const container = document.getElementById("listaNotificacoes");
  container.innerHTML = "<div class=\"painel-notificacoes-vazio\">Carregando...</div>";
  try {
    const res = await fetchProtegido(`${API_BASE}/notificacoes?status=abertas`);
    const lista = await res.json();
    if (!Array.isArray(lista) || lista.length === 0) {
      container.innerHTML = "<div class=\"painel-notificacoes-vazio\">Nenhuma notificação por aqui.</div>";
      return;
    }
    container.innerHTML = lista.map(n => `
      <div class="item-notificacao ${n.lida ? "lida" : ""}" data-on-click="abrirNotificacao" data-args-click="${argsAttr(Number(n.notificacaoId))}">
        <span class="titulo-notificacao">${escaparHtmlEbd(n.titulo)}</span>
        <span>${escaparHtmlEbd(n.mensagem)}</span>
        <div class="rodape-notificacao">
          <span>${new Date(n.criadaEm).toLocaleString("pt-BR")}</span>
          <button class="btn-link" data-on-click="arquivarNotificacao" data-args-click="${argsAttr(Number(n.notificacaoId))}" data-stop="click">Arquivar</button>
        </div>
      </div>
    `).join("");
  } catch (e) {
    container.innerHTML = "<div class=\"painel-notificacoes-vazio\">Não foi possível carregar.</div>";
  }
}

// ---- MINHAS TAREFAS (vB.3 — Motor de workflow genérico) ----
// Só existe pra quem logou com senha (tem Lideranca de verdade — sem isso
// ninguém pode ser "responsável" por etapa nenhuma). Quem entrou só com
// matrícula pro check-in nunca teve authToken, então nem tenta chamar a API.
let filtroMinhasTarefasAtual = "comigo";
function filtrarMinhasTarefas(filtro) {
  filtroMinhasTarefasAtual = filtro;
  document.getElementById("btnFiltroTarefasComigo").classList.toggle("ativo", filtro === "comigo");
  document.getElementById("btnFiltroTarefasAtrasadas").classList.toggle("ativo", filtro === "atrasados");
  carregarMinhasTarefas(filtro);
}

async function carregarMinhasTarefas(filtro) {
  const container = document.getElementById("resultadoMinhasTarefas");
  if (!sessaoDeLiderancaNaTela()) {
    container.innerHTML = "<p class=\"subtitle\">Disponível só para quem entra com a senha de acesso administrativo (papel de Liderança).</p>";
    return;
  }
  container.innerHTML = "<p class=\"subtitle\">Carregando...</p>";
  const res = await fetchProtegido(`${API_BASE}/fluxos?filtro=${filtro}`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = `<p class="subtitle">Nenhum fluxo ${filtro === "atrasados" ? "atrasado" : "com você"} no momento.</p>`;
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Fluxo</th><th>Etapa</th><th>Prazo</th><th></th>
  </tr></thead><tbody>`;
  lista.forEach(f => {
    const prazo = new Date(f.prazoEtapaEm).toLocaleDateString("pt-BR");
    html += `<tr>
      <td>${escaparHtmlEbd(f.tipoFluxoNome)}${f.escalonadoNivel ? ` <small style="color:var(--cor-texto-suave);">(escalonado)</small>` : ""}</td>
      <td>${escaparHtmlEbd(f.etapaNome)}</td>
      <td>${f.atrasado ? `<span class="badge-status badge-desligado">${prazo}</span>` : prazo}</td>
      <td class="acoes-inline">
        <button class="btn-link" data-on-click="acaoMinhaTarefa" data-args-click="${argsAttr(f.instanciaId, "APROVAR")}">Aprovar</button>
        <button class="btn-link" data-on-click="acaoMinhaTarefa" data-args-click="${argsAttr(f.instanciaId, "DEVOLVER")}">Devolver</button>
        <button class="btn-link btn-link-perigo" data-on-click="acaoMinhaTarefa" data-args-click="${argsAttr(f.instanciaId, "REJEITAR")}">Rejeitar</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

// ---- SEGURANÇA: MINHAS SESSÕES + DELEGAÇÃO (vB.9) ----
async function carregarMinhasSessoes() {
  const container = document.getElementById("resultadoMinhasSessoes");
  if (!authToken) { container.innerHTML = "<p class='subtitle'>Disponível só pra quem entrou com sessão autenticada (senha ou código por e-mail).</p>"; return; }
  const res = await fetchProtegido(`${API_BASE}/minhas-sessoes`);
  const sessoes = await jsonDaTela(res, container, "lista");
  if (sessoes === null) return;
  if (!Array.isArray(sessoes) || sessoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma sessão registrada ainda.</p>";
    return;
  }
  container.innerHTML = `<table class="tabela-frequencia"><thead><tr>
    <th>Dispositivo</th><th>Entrou em</th><th>Status</th><th></th>
  </tr></thead><tbody>` + sessoes.map(s => `
    <tr>
      <td style="max-width:320px; overflow-wrap:anywhere;">${escaparHtmlEbd(s.dispositivoInfo) || "—"}</td>
      <td>${new Date(s.criadoEm).toLocaleString("pt-BR")}</td>
      <td>${s.encerrada ? "<span class='badge-status badge-desligado'>Encerrada</span>" : "<span class='badge-status badge-ativo'>Ativa</span>"}</td>
      <td class="acoes-inline">${!s.encerrada ? `<button class="btn-link btn-link-perigo" data-on-click="encerrarSessaoAcao" data-args-click="${argsAttr(String(s.sessaoId))}">Encerrar</button>` : ""}</td>
    </tr>
  `).join("") + "</tbody></table>";
}

async function encerrarSessaoAcao(sessaoId) {
  if (!(await confirmarAcao("Encerrar esta sessão? Se estiver aberta em outro aparelho, ele sai em poucos segundos.", "Encerrar"))) return;
  const res = await fetchProtegido(`${API_BASE}/minhas-sessoes/${sessaoId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "ENCERRAR" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarMinhasSessoes();
}

async function carregarDelegacoes() {
  if (!sessaoDeLiderancaNaTela()) return; // sem entrar como liderança, não tem o que delegar/receber
  const res = await fetchProtegido(`${API_BASE}/delegacoes`);
  const data = await jsonDaTela(res, ["resultadoDelegacoesConcedidas", "resultadoDelegacoesRecebidas"].map(id => document.getElementById(id)), "objeto");
  if (data === null) return;

  document.getElementById("delegacaoPapel").innerHTML = data.meusPapeis.map(p =>
    `<option value="${p.liderancaId}">${escaparHtmlEbd(p.papelNome)} (${escaparHtmlEbd(p.papelNivel)})</option>`
  ).join("") || "<option value=''>Nenhum papel seu disponível</option>";

  document.getElementById("resultadoDelegacoesConcedidas").innerHTML = data.concedidas.length === 0
    ? "<p class='subtitle'>Nenhuma.</p>"
    : `<table class="tabela-frequencia"><thead><tr><th>Papel</th><th>Pra quem</th><th>Até</th><th>Status</th><th></th></tr></thead><tbody>` +
      data.concedidas.map(d => `
        <tr>
          <td>${escaparHtmlEbd(d.papelNome)}</td><td>${escaparHtmlEbd(d.delegadoNome)}</td><td>${new Date(d.dataFim).toLocaleDateString("pt-BR")}</td>
          <td>${escaparHtmlEbd(d.status)}</td>
          <td class="acoes-inline">${d.status === "ATIVA" ? `<button class="btn-link btn-link-perigo" data-on-click="cancelarDelegacaoAcao" data-args-click="${argsAttr(d.delegacaoId)}">Cancelar</button>` : ""}</td>
        </tr>
      `).join("") + "</tbody></table>";

  document.getElementById("resultadoDelegacoesRecebidas").innerHTML = data.recebidas.length === 0
    ? "<p class='subtitle'>Nenhuma.</p>"
    : `<table class="tabela-frequencia"><thead><tr><th>Papel</th><th>De quem</th><th>Até</th><th>Motivo</th></tr></thead><tbody>` +
      data.recebidas.map(d => `<tr><td>${escaparHtmlEbd(d.papelNome)}</td><td>${escaparHtmlEbd(d.deleganteNome)}</td><td>${new Date(d.dataFim).toLocaleDateString("pt-BR")}</td><td>${escaparHtmlEbd(d.motivo) || "-"}</td></tr>`).join("") +
      "</tbody></table>";
}

async function criarDelegacaoAcao() {
  const liderancaId = document.getElementById("delegacaoPapel").value;
  const delegadoMembroId = document.getElementById("delegacaoMatricula").value;
  const dataInicio = document.getElementById("delegacaoDataInicio").value;
  const dataFim = document.getElementById("delegacaoDataFim").value;
  const motivo = document.getElementById("delegacaoMotivo").value.trim();
  const msg = document.getElementById("resultadoDelegacao");
  if (!liderancaId || !delegadoMembroId || !dataInicio || !dataFim) { msg.textContent = "Preencha papel, matrícula e as duas datas."; return; }

  const res = await fetchProtegido(`${API_BASE}/delegacoes`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ liderancaId, delegadoMembroId, dataInicio, dataFim, motivo: motivo || undefined })
  });
  const data = await res.json();
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("delegacaoMatricula").value = "";
    document.getElementById("delegacaoMotivo").value = "";
    carregarDelegacoes();
  }
}

async function cancelarDelegacaoAcao(delegacaoId) {
  if (!(await confirmarAcao("Cancelar esta delegação?", "Cancelar"))) return;
  const res = await fetchProtegido(`${API_BASE}/delegacoes/${delegacaoId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "CANCELAR" })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarDelegacoes();
}

async function acaoMinhaTarefa(instanciaId, acao) {
  const rotulo = { APROVAR: "aprovar", REJEITAR: "rejeitar", DEVOLVER: "devolver" }[acao];
  const confirmou = await confirmarAcao(`Confirma ${rotulo} este fluxo?`, capitalize(rotulo));
  if (!confirmou) return;
  let observacao = null;
  if (acao !== "APROVAR") {
    observacao = await pedirTexto(`Motivo de ${rotulo}`, "Opcional, mas ajuda quem for reabrir isso depois.");
  }
  const res = await fetchProtegido(`${API_BASE}/fluxos/${instanciaId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao, observacao })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarMinhasTarefas(filtroMinhasTarefasAtual);
}

async function abrirNotificacao(id) {
  await fetchProtegido(`${API_BASE}/notificacoes/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "LER" })
  });
  await carregarPainelNotificacoes();
  await atualizarBadgeNotificacoes();
}

async function arquivarNotificacao(id) {
  await fetchProtegido(`${API_BASE}/notificacoes/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "ARQUIVAR" })
  });
  await carregarPainelNotificacoes();
  await atualizarBadgeNotificacoes();
}

async function marcarTodasNotificacoesLidas() {
  const res = await fetchProtegido(`${API_BASE}/notificacoes/marcar-todas-lidas`, { method: "PUT" });
  const data = await res.json();
  avisarResultado(data);
  await carregarPainelNotificacoes();
  await atualizarBadgeNotificacoes();
}

// Fecha o painel ao clicar fora dele (mesmo padrão de qualquer dropdown).
document.addEventListener("click", (ev) => {
  const caixa = document.getElementById("caixaSino") || document.querySelector(".caixa-sino");
  const painel = document.getElementById("painelNotificacoes");
  if (!painel || painel.style.display === "none" || !caixa) return;
  if (!caixa.contains(ev.target)) painel.style.display = "none";
});

// Self-service: só aparece pra quem logou com a senha da liderança (não vale a entrada por PIN
// ou código). Pede a senha ATUAL: o token sozinho não basta para trocar a senha — um token
// roubado ou deixado aberto numa tela não vira posse permanente da conta.
async function trocarMinhaSenha() {
  const senhaAtual = document.getElementById("senhaAtualPessoal").value;
  const novaSenha = document.getElementById("novaSenhaPessoal").value;
  const msg = document.getElementById("resultadoTrocaSenha");
  if (!senhaAtual) { msg.textContent = "Informe a senha atual."; return; }
  if (!novaSenha) { msg.textContent = "Informe a nova senha."; return; }
  const res = await fetchProtegido(`${API_BASE}/auth/senha`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ senhaAtual, novaSenha })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem || "";
  if (data.sucesso) { document.getElementById("novaSenhaPessoal").value = ""; document.getElementById("senhaAtualPessoal").value = ""; }
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
const NOMES_ABAS = ["meupainel", "financeiro", "reunioes", "pessoas", "cartas", "orgaos", "estrutura", "catalogos", "permissoes", "consagracoes", "enquetes", "arquivos", "disciplina", "abandono", "auditoria", "protecaodedados", "ouvidoria", "documentos", "mediacao", "relatoriosdepto", "escalas", "habilitacao", "assistenciasocial", "ebd", "conquistas", "trilhas", "psc", "calendario", "canais", "eventos"];

// Quais chaves de permissão liberam cada aba (qualquer uma delas basta). Abas fora
// deste mapa usam a própria chave — ex: "disciplina" exige só "disciplina". Espelha
// exatamente o que cada Function já checa no backend (ex: AbrirReuniao aceita
// reunioes/assembleia/cli — a aba única de Reuniões reflete isso).
const ABA_PERMISSOES_ALT = {
  reunioes: ["reunioes", "assembleia", "cli"],
  congregacoes: ["pessoas"], orgaos: ["pessoas"], estrutura: ["pessoas"], catalogos: ["pessoas"], cartas: ["pessoas"],
  abandono: ["disciplina"],
  enquetes: ["reunioes", "assembleia"],
  arquivos: ["reunioes", "assembleia", "cli"],
  relatoriosdepto: ["relatorios_departamentais"],
  // v5.6 — quem administra escalas (Presidente/Secretário Geral) OU um
  // líder de equipe (a permissão "escalas" larga cobre os dois; o backend
  // ainda restringe ação por ação a "líder daquela equipe específica" pra
  // aprovar troca/ver pendência, exatamente como o resto do sistema faz
  // com "nível mais alto cobre o de baixo").
  escalas: ["escalas"],
  // v5.7 — esteira de habilitação, marcação "contato com menores" e
  // desligamento de voluntário: permissão própria (não reaproveita
  // "escalas" porque triagem/habilitação é decisão de outra alçada —
  // quem administra a grade nem sempre é quem toca o processo de
  // referência/entrevista/desligamento).
  habilitacao: ["habilitacao_voluntarios"],
  // v5.9 — permissão própria, nunca concedida por padrão (dado mais
  // sensível do sistema: situação socioeconômica de família assistida).
  assistenciasocial: ["assistencia_social"],
  // v6.1 — abre a FASE 6 (EBD): permissão própria "ebd_gestao", nunca
  // concedida por padrão — diferente do Departamento cadastral "EBD" que
  // já existe pros Relatórios Departamentais (v5.2/v5.5/v5.8).
  ebd: ["ebd_gestao"],
  // v6.4 — motor de conquistas genérico (não é EBD-only, ver
  // shared/conquistas.js): administrar catálogo/regras exige
  // "conquistas_gestao", nunca concedida por padrão. A aba em si só
  // aparece pra quem tem essa permissão (é o painel ADMIN); o painel
  // pessoal/ranking de conquistas fica dentro de "Meu Painel", visível a
  // qualquer matrícula (mesmo espírito de "admin gerencia, todo mundo vê
  // o seu" da Habilitação de Voluntários/v5.7).
  conquistas: ["conquistas_gestao"],
  // v6.9 — trilhas de formação e certificado verificável: permissão própria
  // "trilhas_gestao", nunca concedida por padrão. A formação pessoal fica em
  // Meu Painel → Minha Formação, aberta a qualquer matrícula. Mexer no
  // catálogo e nos requisitos ainda exige escopo global (o backend confere).
  trilhas: ["trilhas_gestao"],
  // v7.1 — PSC (Saúde Congregacional): duas permissões próprias, nunca
  // concedidas por padrão. "psc_gestao" abre/preenche/envia/valida dentro do
  // escopo; "psc_homologacao" (CLI, escopo global) homologa, decide a
  // reclassificação e mexe no catálogo/parâmetros. Qualquer uma libera a aba;
  // o backend confere cada ação.
  psc: ["psc_gestao", "psc_homologacao"],
  // v7.2 — Calendário Oficial: três permissões próprias, nunca concedidas por
  // padrão. "calendario_proposta" propõe datas no escopo; "calendario_secretaria"
  // (Secretaria Geral) gera o ciclo, consolida, defere/indefere e registra a
  // presença na Ceia Geral; "calendario_homologacao" (CLI, escopo global)
  // homologa o ano, absorve e mexe na agenda litúrgica e nos tipos. Qualquer
  // uma libera a aba de GESTÃO; a agenda em si é aberta a qualquer login (Meu
  // Painel → Agenda). O backend confere cada ação.
  calendario: ["calendario_proposta", "calendario_secretaria", "calendario_homologacao"],
  // v7.3 — Canais e Comunicação: permissão própria "canais_gestao", nunca concedida
  // por padrão (Secretaria Geral/Comunicação). Respeita o escopo no servidor. O Termo
  // de Dever de Moderação e o aviso de conteúdo irregular ficam em Meu Painel → Canais,
  // abertos a qualquer login.
  canais: ["canais_gestao"],
  // v7.4 — Eventos e Congressos: três permissões próprias, nunca concedidas por padrão.
  // "eventos_gestao" (Secretaria Geral: painel, organizadores, convidados), "eventos_etica"
  // (Conselho de Ética: parecer sobre convidado de reputação desconhecida) e
  // "eventos_presidencia" (Presidência: Nada Consta dos eventos gerais); os dois últimos exigem
  // escopo global. Qualquer uma libera a aba; a conferência do caixa é da Tesouraria Geral
  // ("financeiro" global), que por isso também entra na lista — nesse caso só a pílula "Caixas
  // para conferir" aparece. Quem só organiza um evento age em Meu Painel → Eventos. O backend
  // confere cada ação.
  eventos: ["eventos_gestao", "eventos_etica", "eventos_presidencia", "financeiro"],
  // v5.4 (correção) — quem só tem "tesouraria_departamental" (líder local/
  // geral de departamento) também acessa Financeiro → Saídas, pra gastar o
  // saldo do próprio departamento (Centro de Custo DEPTO_<SIGLA>) pelo
  // mesmo motor auditado de sempre — o backend restringe à categoria certa.
  financeiro: ["financeiro", "tesouraria_departamental"]
};
function permissoesDaAba(nome) {
  return ABA_PERMISSOES_ALT[nome] || [nome];
}
// Trava 6-A: único ponto que decide se a aba aparece. A aba EBD também abre
// pro professor ativo de alguma turma sem "ebd_gestao" (modo professor) — o
// backend já o deixava lançar chamada/resposta/pedido da própria turma desde
// a v6.2, mas ele nunca via a tela (ebdTurmasProfessor: junto do estado de sessão).
// Abas cujo servidor agora só atende o nível GERAL (catálogos e permissões: quem cadastra congregações, cargos e papéis): para os demais nem aparecem.
const ABAS_SO_DO_GERAL = new Set(["catalogos", "permissoes", "auditoria", "protecaodedados"]);
function temPermissaoDaAba(nome) {
  if (ABAS_SO_DO_GERAL.has(nome) && !authGeral) return false;
  if (permissoesDaAba(nome).some(chave => authPermissoes.includes(chave))) return true;
  return nome === "ebd" && ebdTurmasProfessor.length > 0;
}
async function carregarTurmasProfessorEbd() {
  ebdTurmasProfessor = [];
  if (!authToken || authPermissoes.includes("ebd_gestao")) return;
  try {
    const data = await (await fetchProtegido(`${API_BASE}/ebd-turmas/minhas-turmas`)).json();
    if (data.sucesso !== false) ebdTurmasProfessor = data.turmas || [];
  } catch { /* sem a lista, só não mostra o modo professor — não trava o login */ }
}

function aplicarPermissoesNoMenu() {
  NOMES_ABAS.forEach(nome => {
    if (nome === "meupainel" || nome === "documentos" || nome === "ouvidoria") return;
    // "reunioes" (v4.2.3) não tem mais botão próprio — a escolha de órgão
    // agora é a porta de entrada dos módulos Órgãos Centrais/Regionais.
    const btn = document.getElementById(`btnAba${capitalize(nome)}`);
    if (!btn) return;
    const pode = temPermissaoDaAba(nome);
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
  disciplina: { titulo: "Disciplina & Ética", icone: "⚖️", abaEntrada: "disciplina", abas: ["disciplina", "ouvidoria", "mediacao"] },
  departamentos: { titulo: "Departamentos e Relatórios", icone: "🗂️", abaEntrada: "relatoriosdepto", abas: ["relatoriosdepto"] },
  escalas: { titulo: "Escalas de Serviço", icone: "🗓️", abaEntrada: "escalas", abas: ["escalas"] },
  habilitacao: { titulo: "Habilitação de Voluntários", icone: "🛡️", abaEntrada: "habilitacao", abas: ["habilitacao"] },
  assistenciasocial: { titulo: "Assistência Social", icone: "🤝", abaEntrada: "assistenciasocial", abas: ["assistenciasocial"] },
  ebd: { titulo: "EBD (Escola Bíblica Dominical)", icone: "📖", abaEntrada: "ebd", abas: ["ebd"] },
  conquistas: { titulo: "Conquistas e Gamificação", icone: "🏆", abaEntrada: "conquistas", abas: ["conquistas"] },
  trilhas: { titulo: "Formação e Certificação", icone: "🎓", abaEntrada: "trilhas", abas: ["trilhas"] },
  psc: { titulo: "Saúde Congregacional (PSC)", icone: "🩺", abaEntrada: "psc", abas: ["psc"] },
  calendario: { titulo: "Calendário Oficial", icone: "📅", abaEntrada: "calendario", abas: ["calendario"] },
  canais: { titulo: "Canais e Comunicação", icone: "📣", abaEntrada: "canais", abas: ["canais"] },
  eventos: { titulo: "Eventos e Congressos", icone: "🎪", abaEntrada: "eventos", abas: ["eventos"] },
  conformidade: { titulo: "Conformidade & Auditoria", icone: "🧾", abaEntrada: "auditoria", abas: ["auditoria", "protecaodedados", "documentos"] },
  acesso: { titulo: "Administração de Acesso", icone: "🔐", abaEntrada: "permissoes", abas: ["permissoes"] }
};
let moduloAtual = null;

function podeAcessarAba(nome) {
  return nome === "documentos" || nome === "ouvidoria" || temPermissaoDaAba(nome);
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
    return `<div class="card-modulo" data-on-click="entrarModulo" data-args-click="${argsAttr(String(chave ?? ""))}" tabindex="0" role="button" data-on-keydown="ativarComTeclado" data-args-keydown="${argsAttr(ARG.evento, ARG.elemento)}">
      <span class="icone-modulo">${escaparHtmlEbd(m.icone)}</span><span>${escaparHtmlEbd(m.titulo)}</span>
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
const SUB_ABAS_MEUPAINEL = ["perfil", "dados", "vinculos", "contribuicoes", "lgpd", "cartas", "minhasescalas", "minhahabilitacao", "minhasconquistas", "minhaformacao", "agenda", "canais", "eventos", "tarefas", "seguranca"];
const TITULOS_SUB_MEUPAINEL = {
  perfil: "Meu Perfil", dados: "Meus Dados Cadastrais", vinculos: "Vínculos Familiares",
  contribuicoes: "Minhas Contribuições", lgpd: "Meus Dados (LGPD)", cartas: "Cartas de Trânsito",
  minhasescalas: "Minhas Escalas", minhahabilitacao: "Minha Habilitação", minhasconquistas: "Minhas Conquistas", minhaformacao: "Minha Formação", agenda: "Agenda", canais: "Canais", eventos: "Eventos",
  tarefas: "Minhas Tarefas", seguranca: "Segurança (sessões e delegação)"
};
let subAbaMeupainelAtual = "perfil";

function mostrarSubAbaMeupainel(sub) {
  subAbaMeupainelAtual = sub;
  chaveAjudaAtual = `meupainel:${sub}`;
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
  if (sub === "minhasescalas") { carregarMinhasEscalasAcao(); carregarMinhasIndisponibilidadesAcao(); volCarregarMinhasEscalasAcao(); }
  if (sub === "minhahabilitacao") carregarMinhaHabilitacaoAcao();
  if (sub === "minhasconquistas") carregarMinhasConquistasAcao();
  if (sub === "minhaformacao") carregarMinhaFormacaoAcao();
  if (sub === "agenda") carregarMinhaAgendaCalAcao();
  if (sub === "canais") carregarMeuPainelCanaisAcao();
  if (sub === "eventos") carregarMeuPainelEventosAcao();
  if (sub === "tarefas") { filtrarMinhasTarefas(filtroMinhasTarefasAtual); carregarMinhasMediacoesAcao(); }
  if (sub === "perfil") carregarPainelInicial();
  if (sub === "seguranca") { carregarMinhasSessoes(); carregarDelegacoes(); }
}

// ---- PAINEL INICIAL POR PERFIL (vB.7) ----
// "Blocos reaproveitáveis, alimentados pelos cálculos que já existem" —
// backend só reúne (shared/painelBlocos.js), aqui só exibe.
// vB.10 — mostra 1 vez por navegador (localStorage pode falhar em aba
// anônima/privada — nesse caso só não mostra o banner, não quebra a tela).
function mostrarPrimeiroAcessoSeNecessario() {
  try {
    if (localStorage.getItem("primeiroAcessoVisto")) return;
    document.getElementById("cxPrimeiroAcesso").style.display = "flex";
  } catch (e) { /* localStorage indisponível — segue sem o banner */ }
}
function fecharPrimeiroAcesso() {
  document.getElementById("cxPrimeiroAcesso").style.display = "none";
  try { localStorage.setItem("primeiroAcessoVisto", "1"); } catch (e) { /* ok não persistir */ }
}

async function carregarPainelInicial() {
  const cx = document.getElementById("cxPainelInicial");
  if (!authToken) { cx.style.display = "none"; return; }
  mostrarPrimeiroAcessoSeNecessario();
  const res = await fetchProtegido(`${API_BASE}/painel-inicial`);
  const blocos = await res.json();
  const comValor = Array.isArray(blocos) ? blocos.filter((b) => b.valor > 0) : [];
  if (comValor.length === 0) { cx.style.display = "none"; return; }
  cx.style.display = "block";
  document.getElementById("gradePainelInicial").innerHTML = comValor.map((b) => `
    <div class="card-modulo" ${b.aba ? `data-on-click="irParaBlocoPainel" data-args-click="${argsAttr(String(b.aba ?? ""))}" tabindex="0" role="button" data-on-keydown="ativarComTeclado" data-args-keydown="${argsAttr(ARG.evento, ARG.elemento)}"` : ""}>
      <span class="icone-modulo">${escaparHtmlEbd(b.valor)}</span><span>${escaparHtmlEbd(b.titulo)}</span>
    </div>
  `).join("");
}

function irParaBlocoPainel(destino) {
  const [alvo, sub] = destino.split(":");
  if (alvo === "meupainel") { mostrarSubAbaMeupainel(sub); return; }
  const chaveModulo = Object.keys(MODULOS).find((k) => MODULOS[k].abas.includes(alvo));
  if (chaveModulo) entrarModulo(chaveModulo);
  mostrarAbaSecretaria(alvo);
  if (alvo === "financeiro" && sub) mostrarSubAbaFinanceiro(sub);
}

// ---- MINHAS CONTRIBUIÇÕES (v4.1.1) — transparência: se a matrícula estiver
// vinculada a um cadastro de Dizimista, mostra o histórico de lançamentos.
// v4.3: cada linha também mostra se é um autolançamento aguardando
// confirmação do Tesoureiro (sem Termo nº ainda) ou já confirmado/rejeitado.
function badgeStatusContribuicao(c) {
  if (c.status === "CANCELADO") return "<span class='badge-status badge-desligado'>Cancelado</span>";
  if (c.origem === "AUTOLANCAMENTO") {
    if (c.statusConfirmacao === "PENDENTE") return "<span class='badge-status badge-pendente'>Aguardando confirmação</span>";
    if (c.statusConfirmacao === "REJEITADO") return `<span class='badge-status badge-desligado' title="${escaparHtmlEbd(c.motivoRejeicaoConfirmacao) || ''}">Rejeitado</span>`;
  }
  return "<span class='badge-status badge-ativo'>Confirmado</span>";
}

async function carregarMinhasContribuicoes() {
  if (!authMatricula) return;
  const cx = document.getElementById("cxMinhasContribuicoes");
  const aviso = document.getElementById("semContribuicoesAviso");
  const container = document.getElementById("resultadoMinhasContribuicoes");
  const res = await fetchProtegido(`${API_BASE}/meus-lancamentos-tesouraria/${authMatricula}`);
  const contribuicoes = await jsonDaTela(res, container, "lista");
  if (contribuicoes === null) return;
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
      <td>${escaparHtmlEbd(c.mesReferencia)}</td><td>${escaparHtmlEbd(c.termoNumero) || "—"}</td><td>${escaparHtmlEbd(c.congregacaoNome)}</td>
      <td>${escaparHtmlEbd(rotuloTipoLancamento(c.tipo))}</td><td>R$ ${Number(c.valor).toFixed(2)}</td>
      <td>${escaparHtmlEbd(c.formaPagamento)}</td>
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
  const res = await fetchProtegido(`${API_BASE}/autolancamento-tesouraria/${authMatricula}`, {
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

// ---- MINHA FOTO (v1.10 — autoatendimento, dentro de Meus Dados (LGPD)) ----
async function carregarMinhaFoto() {
  const preview = document.getElementById("minhaFotoPreview");
  if (!authMatricula || !preview) return;
  const res = await fetchProtegido(`${API_BASE}/minha-foto/${authMatricula}`);
  const data = await res.json();
  if (!data.sucesso) { preview.innerHTML = ""; return; }
  preview.innerHTML = data.fotoUrl
    ? `<img src="${urlSegura(data.fotoUrl)}" alt="Minha foto" style="max-width:160px;border-radius:8px;" />`
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
  const res = await fetchProtegido(`${API_BASE}/minha-foto/${authMatricula}`, {
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
  const res = await fetchProtegido(`${API_BASE}/meus-dados/${authMatricula}`);
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

  const res = await fetchProtegido(`${API_BASE}/meus-dados/${authMatricula}`, {
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
  const res = await fetchProtegido(`${API_BASE}/catalogos/tiposVinculoFamiliar`);
  const tipos = await jsonDaTela(res, select, "objeto");
  if (tipos === null) return;
  select.innerHTML = tipos.filter(t => t.ativo !== false).map(t => `<option value="${t.tipoVinculoId}">${escaparHtmlEbd(t.rotuloDireto)}</option>`).join("");
}

async function carregarMeusVinculos() {
  if (!authMatricula) return;
  const container = document.getElementById("resultadoListaMeusVinculos");
  const res = await fetchProtegido(`${API_BASE}/meus-vinculos/${authMatricula}`);
  const vinculos = await jsonDaTela(res, container, "lista");
  if (vinculos === null) return;
  if (!Array.isArray(vinculos) || vinculos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum vínculo familiar cadastrado ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Parentesco</th><th>Pessoa</th><th></th></tr></thead><tbody>`;
  vinculos.forEach(v => {
    html += `<tr>
      <td>${escaparHtmlEbd(v.rotulo)}</td>
      <td>${escaparHtmlEbd(v.outraPessoaNome)} (${v.outraPessoaId})${v.outraPessoaEhResponsavel ? ' <span class="badge-status badge-ativo">Responsável Legal</span>' : ""}</td>
      <td class="acoes-inline"><button class="btn-link btn-link-perigo" data-on-click="removerMeuVinculoAcao" data-args-click="${argsAttr(v.vinculoId)}">Remover</button></td>
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
  const res = await fetchProtegido(`${API_BASE}/meus-vinculos/${authMatricula}`, {
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
  const res = await fetchProtegido(`${API_BASE}/meus-vinculos/${authMatricula}/${vinculoId}`, { method: "DELETE" });
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

  const res = await fetchProtegido(`${API_BASE}/solicitacoes-edicao/${authMatricula}`, {
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
  const res = await fetchProtegido(`${API_BASE}/solicitacoes-edicao/${authMatricula}`);
  const solicitacoes = await jsonDaTela(res, container, "lista");
  if (solicitacoes === null) return;
  if (!Array.isArray(solicitacoes) || solicitacoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma solicitação enviada ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Data</th><th>Campo</th><th>Valor Anterior</th><th>Valor Proposto</th><th>Status</th></tr></thead><tbody>`;
  solicitacoes.forEach(s => {
    s.campos.forEach((c, i) => {
      html += `<tr>
        ${i === 0 ? `<td rowspan="${s.campos.length}">${new Date(s.dataSolicitacao).toLocaleDateString("pt-BR")}</td>` : ""}
        <td>${escaparHtmlEbd(c.nomeCampo)}</td>
        <td>${escaparHtmlEbd(c.valorAnterior) || "-"}</td>
        <td>${escaparHtmlEbd(c.valorProposto)}</td>
        <td>${ROTULO_STATUS_SOLICITACAO_EDICAO[c.status] || escaparHtmlEbd(c.status)}</td>
      </tr>`;
    });
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

function mostrarAbaSecretaria(aba) {
  chaveAjudaAtual = aba;
  NOMES_ABAS.forEach(nome => {
    const podeVer = nome === "meupainel" || nome === "documentos" || nome === "ouvidoria" || temPermissaoDaAba(nome);
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
  if (aba === "permissoes") { carregarOpcoesEscopoPermissao(); carregarPermissoes(); carregarNotificacaoRegras(); }
  if (aba === "consagracoes") { carregarTiposConsagracao(); carregarConsagracoes(); carregarTurmasBatismo(); carregarCandidatosBatismo(); }
  if (aba === "enquetes") { ajustarFormEnquetePorNivel(); carregarEnquetes(); }
  if (aba === "arquivos") { carregarOpcoesFormDocumentos(); carregarDocumentos(); carregarPoliticasRetencao(); carregarTextoMestre(); }
  if (aba === "disciplina") { carregarOpcoesFormDisciplina(); carregarProcessosDisciplinares(); }
  if (aba === "abandono") { carregarRadarAbandono(); carregarOpcoesTentativaContato(); carregarRadarAbandonoDigital(); carregarProcedimentosAbandono(); }
  if (aba === "auditoria") {
    carregarAuditoria(); carregarIndicadoresAcao(); carregarAlertasComplianceAcao(); carregarCongregacoesPrestacaoAcao(); carregarPrestacoesContasAcao();
    carregarRecertificacoesAcao(); verificarCadeiaAuditoriaAcao(); carregarAncoragensAcao(); carregarAuditoriasNiveisAcao();
    carregarPareceresConselhoAcao(); carregarSinalizacoesNifAcao(); carregarComunicacoesCoafAcao();
    carregarOpcoesCongregacoesFinanceiro();
    carregarDoacoesAcao(); carregarPoliticasAcao(); carregarDueDiligenceAcao(); carregarConflitosInteresseAcao();
  }
  if (aba === "protecaodedados") { carregarSolicitacoesDPO(); carregarPoliticasRetencao("resultadoListaPoliticasRetencaoDpo"); carregarRopa(); carregarRipd(); }
  if (aba === "ouvidoria") carregarPainelOuvidoria();
  if (aba === "mediacao") carregarMediacoes();
  if (aba === "relatoriosdepto") carregarOpcoesRelatorioDepto();
  if (aba === "escalas") carregarOpcoesEscalasAcao();
  if (aba === "habilitacao") carregarOpcoesHabilitacaoAcao();
  if (aba === "assistenciasocial") { carregarOpcoesAssistenciaSocialAcao(); carregarProfissionaisAssistenciaAcao(); }
  if (aba === "ebd") {
    const modoProfessor = !authPermissoes.includes("ebd_gestao");
    document.getElementById("abaEbd").classList.toggle("ebd-modo-professor", modoProfessor);
    carregarOpcoesChamadaEbdAcao();
    preencherTurmasSalaEbd();
    if (modoProfessor) renderPainelProfessorEbd();
    else { carregarOpcoesEbdAcao(); carregarVisaoAgrupadaEbdAcao(); carregarOpcoesFinanceiroEbdAcao(); carregarOpcoesCadernetaEbdAcao(); carregarOpcoesPlanosEbdAcao(); }
  }
  if (aba === "conquistas") { carregarTiposEventoConquistaAcao(); carregarCatalogoConquistaAdminAcao(); }
  if (aba === "trilhas") carregarOpcoesTrilhasAcao();
  if (aba === "psc") carregarOpcoesPscAcao();
  if (aba === "calendario") carregarOpcoesCalendarioAcao();
  if (aba === "canais") carregarOpcoesCanaisAcao();
  if (aba === "eventos") carregarOpcoesEventosAcao();
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function alternarSidebar() {
  document.getElementById("sidebar").classList.toggle("recolhido");
}

// vD.6 (07/10/2026) — gaveta do menu no celular (≤ 640 px): o ☰ do cabeçalho abre/fecha; escolher uma aba
// ou tocar no fundo escurecido fecha. Só mexe em classes; a largura e a posição vêm do CSS (@media).
function alternarMenuCelular(forcar) {
  const sidebar = document.getElementById("sidebar");
  const fundo = document.getElementById("fundoMenuCelular");
  const botao = document.getElementById("btnMenuCelular");
  if (!sidebar) return;
  const abrir = typeof forcar === "boolean" ? forcar : !sidebar.classList.contains("aberto-celular");
  sidebar.classList.toggle("aberto-celular", abrir);
  if (fundo) fundo.classList.toggle("visivel", abrir);
  if (botao) botao.setAttribute("aria-expanded", abrir ? "true" : "false");
}
document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  sidebar.addEventListener("click", (e) => {
    if (window.innerWidth <= 640 && e.target.closest(".btn-aba, .btn-subaba, .link-secretaria")) alternarMenuCelular(false);
  });
});
const TITULOS_MODULOS = {
  meupainel: "Meu Painel", financeiro: "Financeiro", reunioes: "Reuniões",
  pessoas: "Pessoas", cartas: "Cartas de Trânsito", congregacoes: "Congregações",
  orgaos: "Órgãos", estrutura: "Estrutura", catalogos: "Catálogos",
  permissoes: "Permissões", consagracoes: "Consagrações", disciplina: "Processo Disciplinar",
  abandono: "Perda de Membresia",
  auditoria: "Auditoria", protecaodedados: "Proteção de Dados", ouvidoria: "Ouvidoria", documentos: "Documentos",
  mediacao: "Mediação e Arbitragem", relatoriosdepto: "Relatórios de Departamentos",
  escalas: "Escalas de Serviço", habilitacao: "Habilitação de Voluntários",
  assistenciasocial: "Assistência Social", ebd: "EBD (Escola Bíblica Dominical)",
  conquistas: "Conquistas e Gamificação", trilhas: "Formação e Certificação",
  psc: "Saúde Congregacional (PSC)", calendario: "Calendário Oficial", canais: "Canais e Comunicação", eventos: "Eventos e Congressos"
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
      <p>${escaparHtmlEbd(mensagem)}</p>
      <div class="modal-acoes" style="flex-direction:column; align-items:stretch;">
        ${sessoes.map(s => `<button class="btn-confirmar" style="margin-bottom:6px;" data-sessao="${s.sessaoId}">${escaparHtmlEbd(s.orgaoNome)} — ${escaparHtmlEbd(s.descricao)}</button>`).join("")}
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
  return `<span class="badge-status ${classes[status] || ""}">${escaparHtmlEbd(status)}</span>`;
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
  let html = `<span class="badge-status ${cores[c.categoria] || "badge-licenca"}">${escaparHtmlEbd(c.categoria) || "-"}</span>`;
  // v1.2 — a categoria NÃO muda com a integração: o batismo já torna a pessoa
  // "Membro em Comunhão" (Art. 7º II). Os 90 dias apenas restringem votar/ser votado,
  // então o período aparece como um aviso à parte, sem substituir a categoria.
  if (c.emPeriodoIntegracao) {
    const restantes = c.diasRestantesIntegracao != null ? c.diasRestantesIntegracao : 0;
    html += ` <span class="badge-status badge-licenca" title="Período de Integração — Art. 6º §2º">⏳ ${escaparHtmlEbd(restantes)}d p/ votar</span>`;
  }
  return html;
}

async function carregarOrgaos() {
  const container = document.getElementById("resultadoListaOrgaos");
  const res = await fetchProtegido(`${API_BASE}/orgaos`);
  const orgaos = await jsonDaTela(res, container, "objeto");
  if (orgaos === null) return;
  window._orgaosCache = orgaos;
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>ID</th><th>Sigla</th><th>Nome</th><th>Quórum mín.</th><th>Quórum delib.</th><th>Faltas</th><th></th>
  </tr></thead><tbody>`;
  orgaos.forEach(o => {
    html += `<tr>
      <td>${o.orgaoId}</td>
      <td>${escaparHtmlEbd(o.sigla)}</td>
      <td>${escaparHtmlEbd(o.nome)}</td>
      <td>${escaparHtmlEbd(o.quorumMinimoPct ?? "-")}</td>
      <td>${escaparHtmlEbd(o.quorumDeliberativoPct ?? "-")}</td>
      <td>${escaparHtmlEbd(o.faltasParaPerdaAssento ?? "-")}</td>
      <td class="acoes-inline">
        ${authGeral ? `<button class="btn-link" data-on-click="editarOrgao" data-args-click="${argsAttr(o.orgaoId)}">Editar</button>
        <button class="btn-link btn-link-perigo" data-on-click="excluirOrgao" data-args-click="${argsAttr(o.orgaoId)}">Excluir</button>` : ""}
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;

  const selectAssento = document.getElementById("assentoOrgao");
  if (selectAssento) selectAssento.innerHTML = orgaos.map(o => `<option value="${o.orgaoId}">${escaparHtmlEbd(o.nome)}</option>`).join("");
}

function badgeSituacaoAssento(situacao) {
  const classes = { ATIVA: "badge-ativo", MANDATO_VENCIDO: "badge-licenca", ENCERRADA: "badge-desligado" };
  const rotulos = { ATIVA: "Ativa", MANDATO_VENCIDO: "Mandato vencido", ENCERRADA: "Encerrada" };
  return `<span class="badge-status ${classes[situacao] || ""}">${rotulos[situacao] || escaparHtmlEbd(situacao)}</span>`;
}

async function carregarAssentos() {
  const container = document.getElementById("resultadoListaAssentos");
  const res = await fetchProtegido(`${API_BASE}/assentos`);
  const assentos = await jsonDaTela(res, container, "lista");
  if (assentos === null) return;
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
      <td>${escaparHtmlEbd(a.nome)}</td>
      <td>${escaparHtmlEbd(a.orgaoNome)}</td>
      <td>${a.tipoAssento === "ORDENACAO" ? "Ordenação" : "Função"}</td>
      <td>${escaparHtmlEbd(a.cargoOuFuncao) || "-"}</td>
      <td>${escaparHtmlEbd(a.dataInicio)}</td>
      <td>${escaparHtmlEbd(a.dataTerminoPrevisao) || "sem prazo"}</td>
      <td>${badgeSituacaoAssento(a.situacaoEfetiva)}</td>
      <td class="acoes-inline">${authGeral ? `<button class="btn-link btn-link-perigo" data-on-click="encerrarAssentoAcao" data-args-click="${argsAttr(a.assentoId)}">Encerrar</button>` : ""}</td>
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
  // politicasRetencao removido daqui (vB.8, achado real): esta tela genérica
  // só exige a permissão "pessoas" (padrão de GestaoCatalogos), aberta demais
  // pra editar base legal/retenção — a edição de verdade é
  // GestaoPoliticasRetencao (vB.6), restrita a nível Global.
  // canaisOficiais saiu daqui (v7.3): /api/catalogos/canaisOficiais responde 404; a relação de
  // Canais Oficiais (Estatuto Art. 12) é mantida no módulo "Canais e Comunicação".
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
      ["centroCusto", "Centro de Custo", [["LOCAL", "Local (congregação)"], ["GERAL", "Geral (denominação)"], ["PDQ", "Fundo de Execução Estratégica (PDQ)"]]],
      ["tipoFundo", "Tipo de Fundo", [["LIVRE", "Livre"], ["RESTRITO", "Restrito (exige vincular a uma Campanha)"]]],
      ["classificacaoFuncional", "Classificação Funcional (ITG 2002)", [["ATIVIDADES_FIM", "Atividades-Fim"], ["ADMINISTRATIVA", "Administrativa"]]]],
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
  },
  rateioGeralDestinos: {
    titulo: "Destinos do Rateio Geral (malote dos 60%)", idField: "destinoId",
    campos: [["codigo", "Código (ex: CONVENCAO)"], ["nome", "Nome"], ["percentual", "Percentual sobre o total do malote (%)"]]
  }
};
// Ordem = nível (0 a 5) da Governança Escalonada (Regimento Art. 104), de baixo
// pra cima: Extensão da Tenda primeiro, Distrito por último. Órgãos Locais
// (JAI/JEA/CRA/TER/CEQ/Distrito) saiu daqui — é órgão, mora na aba Órgãos.
// "congregacoes" saiu do editor genérico (vC.2): tem campos demais
// (endereço/bairro/cidade/mapa) pra caber numa linha de inputs — ganhou tela
// própria, ver montarCongregacoesDetalhe() logo abaixo. O objeto
// CATALOGOS_CFG.congregacoes continua existindo só pra "extensoes" (Nível 0)
// resolver o nome da Congregação-Mãe no dropdown.
const ESTRUTURA_ORDEM = ["extensoes", "areas", "regioes", "quadrantes", "distritos"];
const CATALOGOS_ORDEM = ["statuses", "situacoes", "departamentos", "cargosMinisteriais", "tiposConsagracao", "prazos", "tiposVinculoFamiliar"];
const ORGAOS_LOCAIS_ORDEM = ["orgaosLocais"];
// v4.2 — Plano de Contas primeiro, Categorias de Entrada depois (a segunda
// referencia a primeira via "pai") — moram dentro do Financeiro, não na
// aba genérica de Catálogos (princípio já estabelecido: cada módulo
// configura o que é exclusivo dele).
const CATALOGOS_FINANCEIRO_ORDEM = ["planoContas", "categoriasEntrada", "categoriasSaida", "alcadasAprovacao", "rateioGeralDestinos"];

// vB.8 — ROPA/RIPD: só busca (não edita nada) — mesma permissão
// "protecaodedados" que o backend já exige (GestaoRopa).
async function carregarRopa() {
  const container = document.getElementById("resultadoRopa");
  const res = await fetchProtegido(`${API_BASE}/lgpd/ropa`);
  if (!res.ok) { container.innerHTML = "<p class='subtitle'>Sem permissão pra ver o ROPA.</p>"; return; }
  const registros = await res.json();
  container.innerHTML = registros.map(r => `
    <div style="border:1px solid var(--cor-borda); border-radius:8px; padding:12px; margin-bottom:10px;">
      <strong>${escaparHtmlEbd(r.finalidade)}</strong>
      <p class="subtitle" style="margin:4px 0;">Titulares: ${escaparHtmlEbd(r.titulares)} — Base legal: ${escaparHtmlEbd(r.baseLegal)}</p>
      <p class="subtitle" style="margin:4px 0;">Retenção: ${escaparHtmlEbd(r.retencao)}</p>
      <p class="subtitle" style="margin:4px 0;">Tabelas: ${Object.entries(r.contagens).map(([t, n]) => `${escaparHtmlEbd(t)} (${escaparHtmlEbd(n)})`).join(", ")}</p>
    </div>
  `).join("");
}

async function carregarRipd() {
  const container = document.getElementById("resultadoRipd");
  const res = await fetchProtegido(`${API_BASE}/lgpd/ropa/ripd`);
  if (!res.ok) { container.innerHTML = "<p class='subtitle'>Sem permissão pra ver o RIPD.</p>"; return; }
  const ripds = await res.json();
  container.innerHTML = ripds.map(r => `
    <div style="border:1px solid var(--cor-borda); border-radius:8px; padding:12px; margin-bottom:10px;">
      <strong>${escaparHtmlEbd(r.tratamento)}</strong>
      ${r.riscoIdentificado ? `
        <p class="subtitle" style="margin:4px 0;">Risco: ${escaparHtmlEbd(r.riscoIdentificado)}</p>
        <p class="subtitle" style="margin:4px 0;">Mitigação: ${escaparHtmlEbd(r.medidasMitigacao.join("; "))}</p>
      ` : ""}
      <p class="subtitle" style="margin:4px 0;">Risco residual: ${escaparHtmlEbd(r.riscoResidual)}</p>
    </div>
  `).join("");
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
  carregarCongregacoesDetalhe();
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
    ? `<select id="cat_${key}_${id}"><option value="">${escaparHtmlEbd(rotulo)}</option>${opcoes.map(([v, r]) => `<option value="${escaparHtmlEbd(v)}">${escaparHtmlEbd(r)}</option>`).join("")}</select>`
    : `<input type="text" id="cat_${key}_${id}" placeholder="${escaparHtmlEbd(rotulo)}" style="min-width:150px;" />`
  ).join("");
  const paiHtml = c.pai ? `<select id="cat_${key}_${escaparHtmlEbd(c.pai.campo)}" style="min-width:180px;"><option value="">Sem ${escaparHtmlEbd(c.pai.rotulo)}</option></select>` : "";
  return `<div class="cartao-perfil" style="margin-bottom:16px;">
    <h4 style="margin:0 0 10px; color: var(--cor-primaria);">${escaparHtmlEbd(c.titulo)}</h4>
    <div class="barra-lista so-geral"><!-- escrever no catálogo é só do geral (GestaoCatalogos); os demais só consultam -->
      ${camposHtml}
      ${paiHtml}
      <button class="btn-confirmar" style="width:auto;margin:0;" data-on-click="salvarCatalogo" data-args-click="${argsAttr(String(key ?? ""))}">➕ Adicionar</button>
    </div>
    <div class="barra-lista">
      <input type="text" id="busca_${key}" placeholder="🔍 Buscar" data-on-input="filtrarCatalogo" data-args-input="${argsAttr(String(key ?? ""))}" style="min-width:150px;" />
      <span id="info_${key}" class="subtitle" style="margin:0;"></span>
    </div>
    <div class="rolagem-tabela"><div id="lista_cat_${key}"></div></div>
    <div class="paginacao" id="pag_${key}"></div>
  </div>`;
}

async function carregarOpcoesPai(key) {
  const c = CATALOGOS_CFG[key];
  if (!c.pai) return;
  const res = await fetchProtegido(`${API_BASE}/catalogos/${c.pai.origem}`);
  const itens = await listaDaApi(res);
  const select = document.getElementById(`cat_${key}_${c.pai.campo}`);
  if (!select) return;
  const idField = CATALOGOS_CFG[c.pai.origem].idField;
  select.innerHTML = `<option value="">Sem ${escaparHtmlEbd(c.pai.rotulo)}</option>` + itens.map(x => `<option value="${escaparHtmlEbd(x[idField])}">${escaparHtmlEbd(x.nome)}</option>`).join("");
}

async function carregarCatalogoLista(key) {
  const c = CATALOGOS_CFG[key];
  const res = await fetchProtegido(`${API_BASE}/catalogos/${key}`);
  catalogoCache[key] = await res.json();
  if (c.pai) {
    const pres = await fetchProtegido(`${API_BASE}/catalogos/${c.pai.origem}`);
    const pitens = await listaDaApi(pres);
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
    if (c.pai) html += `<th>${escaparHtmlEbd(c.pai.rotulo)}</th>`;
    html += "<th></th></tr></thead><tbody>";
    pagina.forEach(x => {
      html += "<tr>";
      c.campos.forEach(([id]) => html += `<td>${escaparHtmlEbd(x[id] ?? "-")}</td>`);
      if (c.pai) html += `<td>${escaparHtmlEbd((catalogoCache[`_pai_${key}`] || {})[x[c.pai.campo]]) || "-"}</td>`;
      html += `<td class="acoes-inline">
        ${authGeral ? `<button class="btn-link" data-on-click="editarCatalogo" data-args-click="${argsAttr(String(key ?? ""), String(x[c.idField] ?? ""))}">Editar</button>
        <button class="btn-link btn-link-perigo" data-on-click="excluirCatalogo" data-args-click="${argsAttr(String(key ?? ""), String(x[c.idField] ?? ""))}">Excluir</button>` : ""}
      </td></tr>`;
    });
    html += "</tbody></table>";
    container.innerHTML = html;
  }

  document.getElementById(`info_${key}`).textContent = `${total} registro(s)`;
  document.getElementById(`pag_${key}`).innerHTML = totalPaginas > 1 ? `
    <button ${catalogoPagina[key] === 1 ? "disabled" : ""} data-on-click="mudarPaginaCatalogo" data-args-click="${argsAttr(String(key ?? ""), -1)}">←</button>
    <span class="info-pagina">${escaparHtmlEbd(catalogoPagina[key])} / ${totalPaginas}</span>
    <button ${catalogoPagina[key] === totalPaginas ? "disabled" : ""} data-on-click="mudarPaginaCatalogo" data-args-click="${argsAttr(String(key ?? ""), 1)}">→</button>` : "";
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
    <button class="btn-aba" id="btnSubReunioes${escaparHtmlEbd(o.chave.replace(":", "_"))}" data-on-click="selecionarOrgaoReunioes" data-args-click="${argsAttr(String(o.chave ?? ""))}">
      <span class="icone">🏛️</span><span class="rotulo">${escaparHtmlEbd(o.nome)}</span>
    </button>`).join("");
}

async function montarSubmenuOrgaosCentrais() {
  const res = await fetchProtegido(`${API_BASE}/orgaos`);
  const brutos = await jsonDaTela(res, document.getElementById("submenuOrgaosCentrais"), "lista");
  if (brutos === null) return;
  const orgaos = brutos.map(o => Object.assign({}, o, { chave: `central:${o.orgaoId}` }));
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
  const brutos = await jsonDaTela(res, document.getElementById("submenuOrgaosRegionais"), "lista");
  if (brutos === null) return;
  const locais = brutos
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
  if (ehConselhoFiscal) { carregarAssentosConselhoFiscal(); if (authGeral) carregarMedidasCautelares(); } // medidas cautelares: rota inteira só do geral
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
  const composicao = await jsonDaTela(res, container, "lista");
  if (composicao === null) return;
  if (!Array.isArray(composicao) || composicao.length === 0) {
    container.innerHTML = "<p class='subtitle'>Ninguém compõe a CLI ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Nome</th><th>Congregação</th><th>Como entra</th><th>Situação</th>
  </tr></thead><tbody>`;
  composicao.forEach(m => {
    let comoEntra;
    if (m.viaOrdenacao) comoEntra = `Ordenação (${escaparHtmlEbd(nomeCargoPorSigla(m.cargoMinisterial))})`;
    else if (m.orgaoOrigemNome && m.orgaoOrigemNome !== "Câmara de Liderança Institucional") comoEntra = `Função (${escaparHtmlEbd(m.cargoOuFuncao) || "-"}, herdado da ${escaparHtmlEbd(m.orgaoOrigemNome)})`;
    else comoEntra = `Função (${escaparHtmlEbd(m.cargoOuFuncao) || "-"})`;
    const situacao = m.processoDisciplinarAtivo ? "Sob disciplina (não conta)" : (!m.emComunhao ? "Sem comunhão (não conta)" : "Ativo");
    html += `<tr>
      <td>${m.membroId}</td>
      <td>${escaparHtmlEbd(m.nome)}</td>
      <td>${escaparHtmlEbd(m.congregacao) || "-"}</td>
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
  const assentos = await jsonDaTela(res, container, "lista");
  if (assentos === null) return;
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
      <td>${escaparHtmlEbd(a.nome)}</td>
      <td>${escaparHtmlEbd(a.cargoOuFuncao) || "-"}</td>
      <td>${escaparHtmlEbd(a.dataInicio)}</td>
      <td>${escaparHtmlEbd(a.dataTerminoPrevisao) || "sem prazo"}</td>
      <td>${badgeSituacaoAssento(a.situacaoEfetiva)}</td>
      <td class="acoes-inline">${authGeral ? `<button class="btn-link btn-link-perigo" data-on-click="encerrarAssentoCLIAcao" data-args-click="${argsAttr(a.assentoId)}">Encerrar</button>` : ""}</td>
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

// siglaCadastroManual: 'ccj'/'pmo' pras comissões de cadastro manual
// (mostra "Remover"), false/undefined pras calculadas (CFO/CEP, só leitura).
function tabelaComissaoCalculada(lista, siglaCadastroManual) {
  if (!Array.isArray(lista) || lista.length === 0) return "<p class='subtitle'>Ninguém compõe essa comissão ainda.</p>";
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Matrícula</th><th>Nome</th>${siglaCadastroManual ? "<th>Desde</th><th></th>" : "<th>Cargo/Origem</th>"}
  </tr></thead><tbody>`;
  lista.forEach(m => {
    html += `<tr>
      <td>${m.membroId}</td>
      <td>${escaparHtmlEbd(m.nome)}</td>
      ${siglaCadastroManual
        ? `<td>${escaparHtmlEbd(m.dataInicio)}</td><td>${authGeral ? `<button class="btn-link btn-link-perigo" data-on-click="removerMembroComissaoAcao" data-args-click="${argsAttr(String(siglaCadastroManual), m.comissaoMembroId)}">Remover</button>` : ""}</td>`
        : `<td>${escaparHtmlEbd(m.cargoOuFuncao) || "-"}${m.origemSigla ? ` (${escaparHtmlEbd(m.origemSigla)})` : ""}</td>`}
    </tr>`;
  });
  html += "</tbody></table>";
  return html;
}

async function removerMembroComissaoAcao(sigla, comissaoMembroId) {
  if (!(await confirmarAcao(`Remover este membro da ${sigla.toUpperCase()}?`, "Remover"))) return;
  const res = await fetchProtegido(`${API_BASE}/comissoes/${sigla}/${comissaoMembroId}/encerrar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarComissoes();
}

async function carregarComissoes() {
  const res = await fetchProtegido(`${API_BASE}/comissoes`);
  const data = await jsonDaTela(res, ["resultadoListaCCJ", "resultadoListaCFO", "resultadoListaCEP", "resultadoListaPMO"].map(id => document.getElementById(id)), "objeto");
  if (data === null) return;
  window._ccjCache = data.CCJ || [];
  if (document.getElementById("resultadoListaCCJ")) document.getElementById("resultadoListaCCJ").innerHTML = tabelaComissaoCalculada(data.CCJ, "ccj");
  if (document.getElementById("resultadoListaCFO")) document.getElementById("resultadoListaCFO").innerHTML = tabelaComissaoCalculada(data.CFO, false);
  if (document.getElementById("resultadoListaCEP")) document.getElementById("resultadoListaCEP").innerHTML = tabelaComissaoCalculada(data.CEP, false);
  // v4.8 (segunda parte) — PMO reaproveita a mesma tabela de exibição da CCJ.
  if (document.getElementById("resultadoListaPMO")) document.getElementById("resultadoListaPMO").innerHTML = tabelaComissaoCalculada(data.PMO, "pmo");
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

// v4.8 (segunda parte) — Comissão de Acompanhamento de Projetos / PMO
// Eclesiástico (Art. 30), mesmo padrão de cadastro manual da CCJ.
async function adicionarMembroPMO() {
  const membroId = document.getElementById("pmoMatricula").value;
  const msg = document.getElementById("resultadoPMO");
  if (!membroId) { msg.textContent = "Informe a matrícula."; return; }
  const res = await fetchProtegido(`${API_BASE}/comissoes/pmo`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membroId })
  });
  const data = await res.json();
  avisarResultado(data);
  msg.textContent = data.mensagem || "";
  if (data.sucesso) {
    document.getElementById("pmoMatricula").value = "";
    carregarComissoes();
  }
}

// ---- SECRETARIA / ABA ESTRUTURA / CONGREGAÇÕES (vC.2) ----
// Tela própria (não usa o editor genérico de catálogos — campos demais pra
// caber numa linha de inputs): endereço/bairro/cidade/estado/horários/mapa,
// os mesmos campos que hoje só existem na coleção "congregacoes" do
// Directus (site institucional). Dirigente atual é só exibido (calculado no
// backend a partir de quem já tem o papel "Dirigente de Congregação" em
// Permissões) — não tem input pra ele porque não é editável aqui.
let congregacaoDetalheEditandoId = null;

async function carregarCongregacoesDetalhe() {
  const [resCong, resAreas] = await Promise.all([
    fetchProtegido(`${API_BASE}/catalogos/congregacoes`),
    fetchProtegido(`${API_BASE}/catalogos/areas`)
  ]);
  const congregacoes = await jsonDaTela(resCong, document.getElementById("listaCongDetalhe"), "lista");
  if (congregacoes === null) return;
  const areas = await listaDaApi(resAreas);
  window._congregacoesDetalheCache = congregacoes;
  window._areasCache = areas;

  const selectArea = document.getElementById("congDetAreaId");
  if (selectArea) selectArea.innerHTML = `<option value="">Sem Área</option>` + areas.map(a => `<option value="${a.areaId}">${escaparHtmlEbd(a.nome)}</option>`).join("");

  const container = document.getElementById("listaCongDetalhe");
  if (!container) return;
  if (congregacoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma congregação cadastrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Nome</th><th>Cidade/UF</th><th>Dirigente atual</th><th>Status</th><th></th>
  </tr></thead><tbody>`;
  congregacoes.forEach(c => {
    html += `<tr>
      <td>${escaparHtmlEbd(c.nome)}</td>
      <td>${c.cidade ? `${escaparHtmlEbd(c.cidade)}${c.estado ? "/" + escaparHtmlEbd(c.estado) : ""}${c.cep ? " · " + escaparHtmlEbd(c.cep) : ""}` : "—"}</td>
      <td>${escaparHtmlEbd(c.dirigenteAtual) || "—"}</td>
      <td>${c.ativa ? "Ativa" : "Inativa"}</td>
      <td class="acoes-inline">
        <button class="btn-link" data-on-click="editarCongregacaoDetalhe" data-args-click="${argsAttr(c.congregacaoId)}">Editar</button>
        ${c.ativa
          ? `<button class="btn-link" data-on-click="desativarCongregacaoDetalheAcao" data-args-click="${argsAttr(c.congregacaoId)}">Desativar</button>`
          : `<button class="btn-link" data-on-click="reativarCongregacaoDetalheAcao" data-args-click="${argsAttr(c.congregacaoId)}">Reativar</button>`}
        <button class="btn-link btn-link-perigo" data-on-click="excluirCongregacaoDetalheAcao" data-args-click="${argsAttr(c.congregacaoId)}">Excluir</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

function editarCongregacaoDetalhe(id) {
  const c = (window._congregacoesDetalheCache || []).find(x => x.congregacaoId === id);
  if (!c) return;
  congregacaoDetalheEditandoId = id;
  document.getElementById("congDetNome").value = c.nome || "";
  document.getElementById("congDetAreaId").value = c.areaId || "";
  document.getElementById("congDetFundacaoAno").value = c.fundacaoAno ?? "";
  document.getElementById("congDetEndereco").value = c.endereco || "";
  document.getElementById("congDetBairro").value = c.bairro || "";
  document.getElementById("congDetCidade").value = c.cidade || "";
  document.getElementById("congDetEstado").value = c.estado || "";
  document.getElementById("congDetCep").value = c.cep || "";
  document.getElementById("congDetNotaEndereco").value = c.notaEndereco || "";
  document.getElementById("congDetHorarios").value = c.horarios || "";
  document.getElementById("congDetMapsUrl").value = c.mapsUrl || "";
  document.getElementById("congDetLat").value = c.lat ?? "";
  document.getElementById("congDetLng").value = c.lng ?? "";
  document.getElementById("congDetGoogleMapsPlaceQuery").value = c.googleMapsPlaceQuery || "";
  document.getElementById("congDetNome").scrollIntoView({ behavior: "smooth", block: "center" });
}

function limparFormCongregacaoDetalhe() {
  congregacaoDetalheEditandoId = null;
  ["congDetNome", "congDetAreaId", "congDetFundacaoAno", "congDetEndereco", "congDetBairro", "congDetCidade",
   "congDetEstado", "congDetCep", "congDetNotaEndereco", "congDetHorarios", "congDetMapsUrl",
   "congDetLat", "congDetLng", "congDetGoogleMapsPlaceQuery"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
}

async function salvarCongregacaoDetalhe() {
  const nome = document.getElementById("congDetNome").value.trim();
  const msg = document.getElementById("resultadoCongDetalhe");
  if (!nome) { msg.textContent = "Informe o nome da congregação."; return; }

  const corpo = {
    nome,
    areaId: document.getElementById("congDetAreaId").value || null,
    fundacaoAno: document.getElementById("congDetFundacaoAno").value || null,
    endereco: document.getElementById("congDetEndereco").value.trim() || null,
    bairro: document.getElementById("congDetBairro").value.trim() || null,
    cidade: document.getElementById("congDetCidade").value.trim() || null,
    estado: document.getElementById("congDetEstado").value.trim().toUpperCase() || null,
    cep: document.getElementById("congDetCep").value.trim() || null,
    notaEndereco: document.getElementById("congDetNotaEndereco").value.trim() || null,
    horarios: document.getElementById("congDetHorarios").value.trim() || null,
    mapsUrl: document.getElementById("congDetMapsUrl").value.trim() || null,
    lat: document.getElementById("congDetLat").value || null,
    lng: document.getElementById("congDetLng").value || null,
    googleMapsPlaceQuery: document.getElementById("congDetGoogleMapsPlaceQuery").value.trim() || null
  };
  if (congregacaoDetalheEditandoId) corpo.id = congregacaoDetalheEditandoId;

  const res = await fetchProtegido(`${API_BASE}/catalogos/congregacoes`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo)
  });
  const data = await res.json();
  msg.textContent = data.mensagem;
  if (data.sucesso) {
    limparFormCongregacaoDetalhe();
    carregarCongregacoesDetalhe();
  }
}

async function desativarCongregacaoDetalheAcao(id) {
  if (!(await confirmarAcao("Confirma desativar esta congregação? Ela some das listas de cadastro, mas o histórico continua.", "Desativar"))) return;
  const res = await fetchProtegido(`${API_BASE}/catalogos/congregacoes`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ativa: false })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarCongregacoesDetalhe();
}

async function reativarCongregacaoDetalheAcao(id) {
  const res = await fetchProtegido(`${API_BASE}/catalogos/congregacoes`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ativa: true })
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarCongregacoesDetalhe();
}

async function excluirCongregacaoDetalheAcao(id) {
  if (!(await confirmarAcao("Confirma EXCLUIR esta congregação? Isso não pode ser desfeito. Só funciona se nenhuma pessoa estiver cadastrada nela.", "Excluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/catalogos/congregacoes/${id}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarCongregacoesDetalhe();
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

// ---- SECRETARIA / ABA ARQUIVOS (v2.9) — catálogo de referências, sem editor ----
async function carregarOpcoesFormDocumentos() {
  // Publicar para todo mundo é ato da administração geral (o servidor confere; aqui só não oferece a opção a quem não pode).
  document.getElementById("documentoVisibilidadePublico").disabled = !authGeral;
  const res = await fetchProtegido(`${API_BASE}/orgaos`);
  const orgaos = await listaDaApi(res);
  document.getElementById("documentoOrgao").innerHTML = `<option value="">Sem órgão específico</option>` +
    orgaos.map(o => `<option value="${o.orgaoId}">${escaparHtmlEbd(o.nome)}</option>`).join("");

  // vB.6 — categorias de retenção só carregam pra quem tem nível Global
  // (mesma restrição de GestaoPoliticasRetencao) — quem não tem, o select
  // fica só com "(nenhuma)" e o documento entra sem categoria mesmo.
  if (authGeral) {
    const resPol = await fetchProtegido(`${API_BASE}/politicas-retencao`);
    if (resPol.ok) {
      const politicas = await resPol.json();
      document.getElementById("documentoCategoria").innerHTML = `<option value="">(nenhuma)</option>` +
        politicas.filter(p => p.ativo).map(p => `<option value="${escaparHtmlEbd(p.categoria)}">${escaparHtmlEbd(p.categoria)}</option>`).join("");
    }
  }
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
  const categoria = document.getElementById("documentoCategoria").value || undefined;
  const visibilidade = document.getElementById("documentoVisibilidade").value;
  const arquivo = document.getElementById("documentoArquivo").files[0];
  const msg = document.getElementById("resultadoDocumento");
  if (!arquivo) { msg.textContent = "Selecione um arquivo."; return; }

  const arquivoBase64 = await lerArquivoComoBase64(arquivo);
  const res = await fetchProtegido(`${API_BASE}/documentos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo, orgaoId, referenciaId, descricao: descricao || undefined, categoria, visibilidade, arquivoBase64, mimeType: arquivo.type })
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

// vB.6 — status calculado na leitura (shared/retencao.js), nunca marcação manual.
function badgeStatusRetencao(status) {
  if (!status) return "-";
  if (status.status === "INDETERMINADO") return "<span class='badge-status'>Indeterminado</span>";
  if (status.status === "VENCIDO") return `<span class="badge-status badge-desligado">Vencido (${escaparHtmlEbd(status.vencimentoEm)})</span>`;
  return `<span class="badge-status badge-ativo">Vigente até ${escaparHtmlEbd(status.vencimentoEm)}</span>`;
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
  const documentos = await jsonDaTela(res, container, "lista");
  if (documentos === null) return;
  if (!Array.isArray(documentos) || documentos.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum documento registrado ainda.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Tipo</th><th>Descrição</th><th>Órgão</th><th>Registrado por</th><th>Data</th><th>Quem vê</th><th>Prazo</th><th>Retenção</th><th></th>
  </tr></thead><tbody>`;
  documentos.forEach(d => {
    let prazoHtml = "-";
    if (d.tipo === "ATA" && d.diasDesdeSessao != null) {
      if (d.prazoCartorioVencido) prazoHtml = `<span style="color:var(--cor-perigo,#c0392b);">⚠️ Prazo de cartório vencido (${escaparHtmlEbd(d.diasDesdeSessao)}d)</span>`;
      else if (d.prazoLavraturaVencido) prazoHtml = `<span style="color:var(--cor-perigo,#c0392b);">⚠️ Prazo de lavratura vencido (${escaparHtmlEbd(d.diasDesdeSessao)}d)</span>`;
      else prazoHtml = `✅ Em dia (${escaparHtmlEbd(d.diasDesdeSessao)}d)`;
    }
    // Quem pode mudar a visibilidade/apagar: a administração geral, ou quem registrou o documento (o servidor confere de novo). Publicar para todos só o geral.
    const podeMexer = authGeral || (d.registradoPor != null && String(d.registradoPor) === String(authMatricula));
    const opcoesVisibilidade = Object.keys(ROTULO_VISIBILIDADE_DOCUMENTO)
      .filter(v => v !== "PUBLICO" || authGeral || d.visibilidade === "PUBLICO")
      .map(v => `<option value="${escaparHtmlEbd(v)}"${v === d.visibilidade ? " selected" : ""}>${ROTULO_VISIBILIDADE_DOCUMENTO[v]}</option>`).join("");
    const quemVe = podeMexer
      ? `<select data-on-change="alterarVisibilidadeDocumentoAcao" data-args-change="${argsAttr(Number(d.documentoId), ARG.valor)}">${opcoesVisibilidade}</select>`
      : (ROTULO_VISIBILIDADE_DOCUMENTO[d.visibilidade] || "-");
    html += `<tr>
      <td>${escaparHtmlEbd(ROTULO_TIPO_DOCUMENTO[d.tipo] || d.tipo)}</td>
      <td>${escaparHtmlEbd(d.descricao || "-")}</td>
      <td>${escaparHtmlEbd(d.orgaoNome || "-")}</td>
      <td>${escaparHtmlEbd(d.registradoPorNome || "-")}</td>
      <td>${d.criadoEm ? escaparHtmlEbd(d.criadoEm.slice(0, 10)) : "-"}</td>
      <td>${quemVe}</td>
      <td>${prazoHtml}</td>
      <td>${badgeStatusRetencao(d.statusRetencao)}</td>
      <td class="acoes-inline">
        <a class="btn-link" href="${urlSegura(d.urlAssinada)}" target="_blank" rel="noopener">Abrir</a>
        ${podeMexer ? `<button class="btn-link btn-link-perigo" data-on-click="excluirDocumentoAcao" data-args-click="${argsAttr(Number(d.documentoId))}">Excluir</button>` : ""}
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

const ROTULO_VISIBILIDADE_DOCUMENTO = { MEMBROS: "👥 Membros", LIDERANCA: "🔒 Liderança", PUBLICO: "🌐 Todos (público)" };

async function alterarVisibilidadeDocumentoAcao(id, visibilidade) {
  const res = await fetchProtegido(`${API_BASE}/documentos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visibilidade })
  });
  const data = await res.json();
  avisarResultado(data);
  carregarDocumentos();
}

async function excluirDocumentoAcao(id) {
  if (!(await confirmarAcao("Excluir este registro? O arquivo permanece no armazenamento, só o catálogo é removido.", "Excluir"))) return;
  const res = await fetchProtegido(`${API_BASE}/documentos/${id}`, { method: "DELETE" });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarDocumentos();
}

// ---- TEXTO MESTRE CONSOLIDADO (vB.15 — Reg. Art. 162 §§2º-4º e 162-B) ----
async function carregarTextoMestre() {
  const res = await fetchProtegido(`${API_BASE}/texto-mestre`);
  const data = await jsonDaTela(res, document.getElementById("painelTextoMestreVigente"), "objeto");
  if (data === null) return;

  const vigenteEl = document.getElementById("painelTextoMestreVigente");
  vigenteEl.innerHTML = data.vigente
    ? `Versão vigente: nº ${escaparHtmlEbd(data.vigente.numeroVersao)} (desde ${escaparHtmlEbd(data.vigente.dataVigencia)}) — <a href="${urlSegura(data.vigente.urlAssinada)}" target="_blank" rel="noopener">abrir PDF</a>`
    : "⚠️ Nenhuma versão consolidada registrada ainda.";

  const pendEl = document.getElementById("painelTextoMestrePendencias");
  const vencidas = (data.pendenciasAtualizacao || []).filter(p => p.prazoVencido);
  pendEl.innerHTML = vencidas.length === 0 ? "" :
    `<p class="subtitle" style="color:var(--cor-perigo,#c0392b);">⚠️ ${vencidas.length} alteração(ões) do Regimento registrada(s) há mais de 48h sem consolidação no Texto Mestre (Art. 162 §2º): ${vencidas.map(v => escaparHtmlEbd(v.descricao) || `documento #${v.documentoId}`).join(", ")}.</p>`;

  const revEl = document.getElementById("painelTextoMestreRevisaoQuadrienal");
  const rev = data.revisaoQuadrienal;
  if (!rev || !rev.definida) {
    revEl.textContent = "Revisão sistêmica quadrienal (Art. 162-B): data-base ainda não definida.";
  } else if (rev.vencida) {
    revEl.innerHTML = `<span style="color:var(--cor-perigo,#c0392b);">⚠️ Revisão sistêmica quadrienal (Art. 162-B) vencida desde ${escaparHtmlEbd(rev.proximaRevisao)}.</span>`;
  } else if (rev.dentroAntecedencia) {
    revEl.innerHTML = `⚠️ Revisão sistêmica quadrienal (Art. 162-B) prevista para ${escaparHtmlEbd(rev.proximaRevisao)} (${escaparHtmlEbd(rev.diasRestantes)} dia(s)).`;
  } else {
    revEl.textContent = `Próxima revisão sistêmica quadrienal (Art. 162-B): ${rev.proximaRevisao}.`;
  }

  const histEl = document.getElementById("resultadoHistoricoTextoMestre");
  if (!Array.isArray(data.historico) || data.historico.length === 0) {
    histEl.innerHTML = "<p class='subtitle'>Nenhuma versão registrada ainda.</p>";
  } else {
    histEl.innerHTML = `<table class="tabela-frequencia"><thead><tr><th>Versão</th><th>Vigência</th><th>Artigos tocados</th></tr></thead><tbody>` +
      data.historico.map(v => `<tr><td>nº ${escaparHtmlEbd(v.numeroVersao)}</td><td>${escaparHtmlEbd(v.dataVigencia)}</td><td>${v.artigosTocados != null ? `${escaparHtmlEbd(v.artigosTocados)} de ${escaparHtmlEbd(v.totalArtigos)}` : "-"}</td></tr>`).join("") +
      `</tbody></table>`;
  }
}

async function registrarVersaoTextoMestreAcao() {
  const dataVigencia = document.getElementById("textoMestreDataVigencia").value;
  const totalArtigos = document.getElementById("textoMestreTotalArtigos").value || null;
  const artigosTocados = document.getElementById("textoMestreArtigosTocados").value || null;
  const arquivo = document.getElementById("textoMestreArquivo").files[0];
  const resultado = document.getElementById("resultadoTextoMestre");
  if (!dataVigencia || !arquivo) { resultado.textContent = "Informe a data de vigência e o arquivo PDF consolidado."; return; }

  const body = {
    dataVigencia, totalArtigos: totalArtigos ? Number(totalArtigos) : undefined, artigosTocados: artigosTocados ? Number(artigosTocados) : undefined,
    arquivoBase64: await arquivoParaBase64(arquivo), mimeType: arquivo.type
  };
  const res = await fetchProtegido(`${API_BASE}/texto-mestre`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  resultado.textContent = data.mensagem;
  if (data.sucesso) {
    document.getElementById("textoMestreDataVigencia").value = "";
    document.getElementById("textoMestreTotalArtigos").value = "";
    document.getElementById("textoMestreArtigosTocados").value = "";
    document.getElementById("textoMestreArquivo").value = "";
    carregarTextoMestre();
  }
}

// ---- POLÍTICAS DE RETENÇÃO (vB.6 — Arquivo Institucional, nível Global) ----
// vB.8 — achado real: existia uma SEGUNDA tela editando PoliticasRetencao
// (o catálogo genérico de GestaoCatalogos, aba Proteção de Dados), aberta
// a qualquer um com a permissão "pessoas" — sem relação com esta tela
// (vB.6, restrita a nível Global) e sem essa restrição. Corrigido: a
// entrada 'politicasRetencao' saiu de GestaoCatalogos (única fonte de
// edição agora é esta, nível Global) e a aba Proteção de Dados passou a
// chamar esta mesma função, só com o container diferente.
let idContainerPoliticasRetencaoAtual = "resultadoListaPoliticasRetencao";
async function carregarPoliticasRetencao(idContainer) {
  idContainerPoliticasRetencaoAtual = idContainer || idContainerPoliticasRetencaoAtual;
  const container = document.getElementById(idContainerPoliticasRetencaoAtual);
  if (!authGeral) { container.innerHTML = "<p class='subtitle'>Só a administração geral da igreja administra as políticas de retenção.</p>"; return; }
  const res = await fetchProtegido(`${API_BASE}/politicas-retencao`);
  const politicas = await jsonDaTela(res, container, "objeto");
  if (politicas === null) return;
  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Categoria</th><th>Base Legal</th><th>Dias de retenção</th><th>Ativa</th><th></th>
  </tr></thead><tbody>`;
  politicas.forEach(p => {
    html += `<tr>
      <td>${escaparHtmlEbd(p.categoria)}</td>
      <td style="max-width:360px;">${escaparHtmlEbd(p.baseLegal)}</td>
      <td>${p.diasRetencao != null ? escaparHtmlEbd(p.diasRetencao) : "Indeterminado"}</td>
      <td><input type="checkbox" ${p.ativo ? "checked" : ""} data-on-change="atualizarPoliticaRetencao" data-args-change="${argsAttr(p.politicaId, { ativo: ARG.marcado })}" /></td>
      <td class="acoes-inline">
        <button class="btn-link" data-on-click="editarDiasRetencaoAcao" data-args-click="${argsAttr(p.politicaId, (p.diasRetencao != null) ? Number(p.diasRetencao) : null)}">Editar dias</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function atualizarPoliticaRetencao(politicaId, alteracoes) {
  const res = await fetchProtegido(`${API_BASE}/politicas-retencao/${politicaId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(alteracoes)
  });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarPoliticasRetencao(idContainerPoliticasRetencaoAtual);
}

async function editarDiasRetencaoAcao(politicaId, diasAtual) {
  const novo = await pedirTexto("Dias de retenção (vazio = indeterminado)", "Ex: 1825 (5 anos)", diasAtual != null ? String(diasAtual) : "");
  if (novo === null) return;
  const diasRetencao = novo.trim() === "" ? null : Number(novo);
  if (novo.trim() !== "" && (!Number.isFinite(diasRetencao) || diasRetencao <= 0)) {
    mostrarToast("Informe um número de dias válido, ou deixe vazio pra indeterminado.", "erro");
    return;
  }
  await atualizarPoliticaRetencao(politicaId, { diasRetencao });
}

// ---- ABA MEU PAINEL: minha frequência (mesma consulta pública de sempre, só por matrícula) ----
async function carregarPainelPessoal(matricula) {
  matricula = matricula || authMatricula;
  const container = document.getElementById("resultadoPainelPessoal");
  const cartao = document.getElementById("cartaoPerfilPessoal");
  const stats = document.getElementById("resumoStatsPessoal");
  if (!matricula) return;

  const res = await fetchProtegido(`${API_BASE}/membros/${matricula}/frequencia`);
  const data = await res.json();
  if (!data.sucesso) {
    cartao.innerHTML = "";
    stats.innerHTML = "";
    container.textContent = data.mensagem;
    return;
  }

  cartao.innerHTML = `
    <div class="cartao-perfil">
      <p class="nome-perfil">${escaparHtmlEbd(data.membro.nome)}</p>
      <p class="linha-perfil">Matrícula ${data.membro.membroId} · ${escaparHtmlEbd(data.membro.funcao) || "sem função cadastrada"}</p>
      <p class="linha-perfil">${escaparHtmlEbd(data.membro.congregacao) || "sem congregação cadastrada"} · ${badgeStatusPessoa(data.membro.status)}</p>
    </div>`;

  const orgaosContainer = document.getElementById("cartaoMeusOrgaos");
  orgaosContainer.innerHTML = (data.assentos && data.assentos.length)
    ? `<div class="cartao-perfil"><p class="linha-perfil"><strong>Meus órgãos:</strong> ${data.assentos.map(a => `${escaparHtmlEbd(a.orgao)}${a.cargoOuFuncao ? " — " + escaparHtmlEbd(a.cargoOuFuncao) : ""}`).join(" · ")}</p></div>`
    : "";

  const r = data.resumo;
  stats.innerHTML = `
    <div class="resumo-stats">
      <div class="stat-tile"><div class="stat-valor">${escaparHtmlEbd(r.totalReunioes)}</div><div class="stat-rotulo">Reuniões</div></div>
      <div class="stat-tile"><div class="stat-valor">${escaparHtmlEbd(r.totalPresencas)}</div><div class="stat-rotulo">Presenças</div></div>
      <div class="stat-tile"><div class="stat-valor">${escaparHtmlEbd(r.totalFaltas)}</div><div class="stat-rotulo">Faltas</div></div>
      <div class="stat-tile"><div class="stat-valor">${escaparHtmlEbd(r.totalJustificadas)}</div><div class="stat-rotulo">Justificadas</div></div>
      <div class="stat-tile"><div class="stat-valor">${r.percentualPresenca != null ? escaparHtmlEbd(r.percentualPresenca) + "%" : "-"}</div><div class="stat-rotulo">Presença</div></div>
    </div>`;

  let html = `<table class="tabela-frequencia"><thead><tr>
    <th>Data</th><th>Reunião</th><th>Status</th><th>Ação</th>
  </tr></thead><tbody>`;

  data.historico.forEach(item => {
    let acaoHtml = "";
    if (!item.presente && !item.faltaJustificada) {
      acaoHtml = item.justificativaPendente
        ? `<span class="tag-pendente">Aguardando aprovação</span>`
        : `<button class="btn-justificar" data-on-click="solicitarJustificativaAcao" data-args-click="${argsAttr(String(matricula ?? ""), item.sessaoId)}">✍️ Justificar falta</button>`;
    }
    html += `<tr>
      <td>${escaparHtmlEbd(item.dataSessao) || "-"}</td>
      <td>${escaparHtmlEbd(item.descricao) || "-"}</td>
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

  const res = await fetchProtegido(`${API_BASE}/membros/${matricula}/reunioes/${sessaoId}/solicitar-justificativa`, {
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
  return `<span class="badge-status ${classes[status] || ""}">${rotulos[status] || escaparHtmlEbd(status)}</span>`;
}

async function carregarConsentimentoLGPD(matricula) {
  matricula = matricula || authMatricula;
  const chk = document.getElementById("consentimentoDadosContato");
  const msg = document.getElementById("resultadoConsentimentoLGPD");
  if (!matricula || !chk) return;
  const res = await fetchProtegido(`${API_BASE}/lgpd/consentimento/${matricula}`);
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
  const res = await fetchProtegido(`${API_BASE}/lgpd/consentimento/${matricula}`, {
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
  return escaparHtmlEbd(String(valor));        // vai direto para innerHTML: nome, endereço e demais textos digitados não podem virar marcação
}

function linhaLgpd(rotulo, valor, tipo) {
  return `<p class="linha-perfil"><strong>${rotulo}:</strong> ${formatarValorLgpd(valor, tipo)}</p>`;
}

async function alternarMeusDadosLGPD() {
  const caixa = document.getElementById("cxMeusDadosLGPD");
  const abrindo = caixa.style.display === "none";
  caixa.style.display = abrindo ? "block" : "none";
  if (!abrindo) return;

  // v7.5 — a rota exige a sessão e só entrega a matrícula da própria sessão (fetchProtegido manda o token).
  let data;
  try { data = await (await fetchProtegido(`${API_BASE}/lgpd/meus-dados/${authMatricula}`)).json(); }
  catch (_) { caixa.innerHTML = `<p class="subtitle">Não foi possível carregar os seus dados agora. Tente de novo.</p>`; return; }

  // vB.8 — o direito de acesso (Art. 18) não depende mais de consentimento
  // nenhum (base legal era errada); só falha se a matrícula não existir.
  if (!data.sucesso) { caixa.innerHTML = `<p class="subtitle">${escaparHtmlEbd(data.mensagem || "Não foi possível carregar os seus dados.")}</p>`; return; }

  const m = data.membro;
  const ROTULO_MODALIDADE = { CIVIL_E_RELIGIOSO: "Civil e Religioso", SOMENTE_RELIGIOSO: "Somente Religioso" };
  const ROTULO_STATUS_LIC = { EM_LICENCA: "Em licença", RETORNOU: "Retornou", NAO_RETORNOU: "Não retornou" };

  caixa.innerHTML = `
    <div class="cartao-perfil">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Dados Cadastrais</h4>
      ${m.fotoUrl ? `<img src="${urlSegura(m.fotoUrl)}" alt="Foto" style="max-width:120px;border-radius:8px;margin-bottom:8px;" />` : ""}
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
      ${data.casamentos.map(c => `<p class="linha-perfil">${formatarValorLgpd(c.dataCasamento, "data")} · ${escaparHtmlEbd(c.conjuge) || "-"} · ${ROTULO_MODALIDADE[c.modalidade] || escaparHtmlEbd(c.modalidade)}</p>`).join("")}
    </div>` : ""}

    ${data.licencasCandidatura.length ? `
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Licenças por Candidatura</h4>
      ${data.licencasCandidatura.map(l => `<p class="linha-perfil">Pleito em ${formatarValorLgpd(l.dataPleito, "data")} · ${ROTULO_STATUS_LIC[l.status] || escaparHtmlEbd(l.status)}</p>`).join("")}
    </div>` : ""}

    ${volCartaoMeusDados(data.voluntariado)}

    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Consentimentos LGPD</h4>
      ${data.consentimentos.map(c => `<p class="linha-perfil">${escaparHtmlEbd(c.tipo)} — ${c.concedido ? "✅ Concedido" : "❌ Revogado"} em ${formatarValorLgpd(c.dataRegistro, "dataHora")}</p>`).join("") || "<p class='subtitle'>Nenhum registrado.</p>"}
    </div>

    <p class="subtitle" style="margin-top:12px;">Gerado em ${formatarValorLgpd(data.geradoEm, "dataHora")}. Precisa de uma cópia formal? Use "Enviar pedido" abaixo com o tipo "Portabilidade".</p>`;
}

// v7.5 — o que o voluntariado guarda da pessoa, em "Meus Dados" (LGPD art. 18, I). Só aparece quando há algo. Tudo escapado: o nome do responsável, a referência
// da ficha e o motivo da indisponibilidade são texto digitado.
function volCartaoMeusDados(v) {
  if (!v) return "";
  const a = v.adesao;
  const lista = (x) => Array.isArray(x) ? x : [];
  const temAlgo = a || lista(v.equipes).length || lista(v.servicos).length || lista(v.indisponibilidades).length || lista(v.remocoesDaEscala).length || lista(v.gruposDeRodizio).length;
  if (!temAlgo) return "";
  const linha = (rotulo, valor) => valor === null || valor === undefined || valor === "" ? "" : `<p class="linha-perfil"><strong>${volEsc(rotulo)}:</strong> ${volEsc(valor)}</p>`;
  const itens = (titulo, linhas) => linhas.length ? `<p class="linha-perfil"><strong>${volEsc(titulo)}:</strong></p><ul class="vol-lista">${linhas.map(l => `<li>${l}</li>`).join("")}</ul>` : "";
  const adesao = a ? `
      ${linha("Adesão ao Termo", `${a.rotuloForma || a.forma} em ${volDataParede(a.dataAceite)}${a.termoVersao ? ` (versão ${a.termoVersao} do texto)` : ""}`)}
      ${linha("Instante do aceite", a.aceitoEm ? volDataInstante(a.aceitoEm) : "")}
      ${linha("IP do aceite", a.enderecoIp)}
      ${linha("Cabeçalhos de conexão guardados", a.cadeiaCabecalhos)}
      ${linha("Referência do documento", a.referencia)}
      ${linha("Responsável que assinou", a.responsavelNome ? `${a.responsavelNome} (${a.responsavelVinculo || "responsável"})` : "")}` : "";
  return `
    <div class="cartao-perfil" style="margin-top:12px;">
      <h4 style="margin:0 0 8px; color: var(--cor-primaria);">Voluntariado</h4>
      ${adesao}
      ${itens("Equipes", lista(v.equipes).map(e => `${volEsc(e.equipe)}${e.congregacao ? ` — ${volEsc(e.congregacao)}` : ""}${e.ativo ? "" : " (inativa)"}`))}
      ${itens("Grupos de rodízio", lista(v.gruposDeRodizio).map(g => `${volEsc(g.rodizio)} — ${volEsc(g.grupo)}${g.saiuEm ? ` (saiu em ${volDataInstante(g.saiuEm)})` : ""}`))}
      ${itens("Serviços escalados", lista(v.servicos).map(s => `${volDataHora(s.dataHora)} — ${volEsc(s.equipe)}${s.descricao ? `: ${volEsc(s.descricao)}` : ""} (${volEsc(s.situacao)})`))}
      ${itens("Indisponibilidades", lista(v.indisponibilidades).map(i => `${volDataParede(i.dataInicio)} a ${volDataParede(i.dataFim)}${i.motivo ? ` — ${volEsc(i.motivo)}` : ""}`))}
      ${itens("Remoções da escala", lista(v.remocoesDaEscala).map(r => `${volDataInstante(r.em)}${r.equipe ? ` — ${volEsc(r.equipe)}` : ""}${r.removidoDaEscala ? "" : " (apenas desligamento)"}${r.reintegradoEm ? `, reintegrado em ${volDataInstante(r.reintegradoEm)}` : ""}`))}
      ${v.aviso ? `<p class="subtitle">${volEsc(v.aviso)}</p>` : ""}
    </div>`;
}

async function criarSolicitacaoLGPD() {
  const matricula = authMatricula;
  const tipo = document.getElementById("solicitacaoLgpdTipo").value;
  const descricao = document.getElementById("solicitacaoLgpdDescricao").value;
  if (!matricula) return;
  const res = await fetchProtegido(`${API_BASE}/lgpd/solicitacoes/${matricula}`, {
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
  const res = await fetchProtegido(`${API_BASE}/lgpd/solicitacoes/${matricula}`);
  const data = await jsonDaTela(res, container, "objeto");
  if (data === null) return;
  if (!data.sucesso || data.solicitacoes.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma solicitação enviada ainda.</p>";
    return;
  }
  let html = "<table class='tabela-frequencia'><thead><tr><th>Tipo</th><th>Data</th><th>Status</th><th>Resposta</th></tr></thead><tbody>";
  data.solicitacoes.forEach(s => {
    html += `<tr>
      <td>${escaparHtmlEbd(s.tipo)}</td>
      <td>${new Date(s.dataSolicitacao).toLocaleDateString("pt-BR")}</td>
      <td>${badgeStatusLgpd(s.status)}</td>
      <td>${escaparHtmlEbd(s.respostaTexto) || "-"}</td>
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
  const container = document.getElementById("resultadoListaAuditoria");
  const registros = await jsonDaTela(res, container, "lista");
  if (registros === null) return;
  if (!Array.isArray(registros) || registros.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum registro encontrado.</p>";
    return;
  }
  let html = "<table class='tabela-frequencia'><thead><tr><th>Quando</th><th>Tabela</th><th>Registro</th><th>Ação</th><th>Quem</th></tr></thead><tbody>";
  registros.forEach(a => {
    html += `<tr>
      <td>${new Date(a.dataHora).toLocaleString("pt-BR")}</td>
      <td>${escaparHtmlEbd(a.tabela)}</td>
      <td>${a.registroId ?? "-"}</td>
      <td>${escaparHtmlEbd(a.acao)}</td>
      <td>${a.usuarioNome ? `${escaparHtmlEbd(a.usuarioNome)} (${a.usuarioId})` : (a.usuarioId ?? "-")}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

// ==================== ABA: AUDITORIA — COMPLIANCE E INDICADORES (v4.12) ====================
async function carregarIndicadoresAcao() {
  const container = document.getElementById("resultadoIndicadores");
  const res = await fetchProtegido(`${API_BASE}/indicadores-financeiros`);
  const d = await jsonDaTela(res, container, "objeto");
  if (d === null) return;
  const alvoAtividadesFim = d.indiceAplicacaoAtividadesFim >= 70 && d.indiceAplicacaoAtividadesFim <= 80;
  const alvoReserva = d.mesesReservaCaixa >= 3;
  container.innerHTML = `<table class="tabela-frequencia"><tbody>
    <tr><td>Meses de Reserva de Caixa (meta 3)</td><td>${Number(d.mesesReservaCaixa).toFixed(2)}${alvoReserva ? " ✅" : " ⚠️"}</td></tr>
    <tr><td>Índice de Aplicação em Atividades-Fim (meta 70-80%)</td><td>${Number(d.indiceAplicacaoAtividadesFim).toFixed(2)}%${alvoAtividadesFim ? " ✅" : " ⚠️"}</td></tr>
    <tr><td>Índice de Liquidez</td><td>${Number(d.indiceLiquidez).toFixed(2)}</td></tr>
    <tr><td>Ativo Total / Passivo Total</td><td>R$ ${Number(d.ativoTotal).toFixed(2)} / R$ ${Number(d.passivoTotal).toFixed(2)}</td></tr>
    <tr><td>Patrimônio Líquido</td><td>R$ ${Number(d.patrimonioLiquido).toFixed(2)}</td></tr>
  </tbody></table>`;
}

async function carregarAlertasComplianceAcao() {
  const container = document.getElementById("resultadoAlertasCompliance");
  const res = await fetchProtegido(`${API_BASE}/compliance/alertas`);
  const d = await jsonDaTela(res, container, "objeto");
  if (d === null) return;
  const lista = d.alertas || [];
  if (lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum alerta ativo. ✅</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Severidade</th><th>Tipo</th><th>Descrição</th><th></th></tr></thead><tbody>`;
  lista.forEach(a => html += `<tr><td>${escaparHtmlEbd(a.severidade)}</td><td>${escaparHtmlEbd(a.tipo)}</td><td>${escaparHtmlEbd(a.descricao)}</td><td><button class="btn-link" data-on-click="resolverAlertaComplianceAcao" data-args-click="${argsAttr(a.alertaId)}">Resolver</button></td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function resolverAlertaComplianceAcao(alertaId) {
  const res = await fetchProtegido(`${API_BASE}/compliance/alertas`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alertaId, acao: "RESOLVER" }) });
  const d = await res.json();
  avisarResultado(d);
  carregarAlertasComplianceAcao();
}

async function carregarCongregacoesPrestacaoAcao() {
  const select = document.getElementById("prestacaoCongregacao");
  const res = await fetchProtegido(`${API_BASE}/catalogos/congregacoes`);
  const lista = await jsonDaTela(res, select, "lista");
  if (lista === null) return;
  select.innerHTML = (Array.isArray(lista) ? lista.filter(c => c.ativa !== false).map(c => `<option value="${c.congregacaoId}">${escaparHtmlEbd(c.nome)}</option>`).join("") : "");
}

async function registrarPrestacaoContasAcao() {
  const congregacaoId = document.getElementById("prestacaoCongregacao").value;
  const mesReferencia = document.getElementById("prestacaoMes").value;
  const agua = document.getElementById("prestacaoAgua").files[0];
  const luz = document.getElementById("prestacaoLuz").files[0];
  const resultado = document.getElementById("resultadoPrestacao");
  if (!congregacaoId || !mesReferencia) { resultado.textContent = "Informe congregação e mês."; return; }
  const body = { congregacaoId: Number(congregacaoId), mesReferencia };
  if (agua) { body.comprovanteAguaBase64 = await arquivoParaBase64(agua); body.mimeTypeAgua = agua.type; }
  if (luz) { body.comprovanteLuzBase64 = await arquivoParaBase64(luz); body.mimeTypeLuz = luz.type; }
  const res = await fetchProtegido(`${API_BASE}/prestacoes-contas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  avisarResultado(d);
  resultado.textContent = d.mensagem;
  carregarPrestacoesContasAcao();
}

async function carregarPrestacoesContasAcao() {
  const container = document.getElementById("resultadoPrestacoesContas");
  const res = await fetchProtegido(`${API_BASE}/prestacoes-contas`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma prestação registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Congregação</th><th>Mês</th><th>Água</th><th>Luz</th><th>Status</th><th>Repasse</th></tr></thead><tbody>`;
  lista.forEach(p => html += `<tr><td>${escaparHtmlEbd(p.congregacaoNome)}</td><td>${escaparHtmlEbd(p.mesReferencia)}</td><td>${p.temAgua ? "✅" : "❌"}</td><td>${p.temLuz ? "✅" : "❌"}</td><td>${escaparHtmlEbd(p.status)}</td><td>${p.bloqueioRepasse ? "🔒 bloqueado" : "liberado"}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

// ==================== ABA: AUDITORIA — RECERTIFICAÇÃO DE ACESSOS (v4.12) ====================
async function carregarRecertificacoesAcao() {
  const container = document.getElementById("resultadoRecertificacoes");
  const res = await fetchProtegido(`${API_BASE}/compliance/recertificacoes`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma recertificação pendente.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Pessoa</th><th>Papel</th><th>Permissão</th><th>Prazo</th><th>Status</th><th>Ações</th></tr></thead><tbody>`;
  lista.forEach(r => {
    let acoes = "-";
    if (r.status === "PENDENTE") {
      acoes = `<button class="btn-link" data-on-click="decidirRecertificacaoAcao" data-args-click="${argsAttr(r.recertificacaoId, "CONFIRMAR")}">Recertificar</button>
               <button class="btn-link btn-link-perigo" data-on-click="decidirRecertificacaoAcao" data-args-click="${argsAttr(r.recertificacaoId, "EXPIRAR")}">Expirar</button>`;
    }
    html += `<tr><td>${escaparHtmlEbd(r.nome)}</td><td>${escaparHtmlEbd(r.papelNome)}</td><td>${escaparHtmlEbd(r.permissao)}</td><td>${new Date(r.prazo).toLocaleDateString("pt-BR")}</td><td>${escaparHtmlEbd(r.status)}</td><td class="acoes-inline">${acoes}</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function decidirRecertificacaoAcao(recertificacaoId, acao) {
  if (acao === "EXPIRAR" && !(await confirmarAcao("Marcar este acesso como expirado (não recertificado)?", "Expirar"))) return;
  const res = await fetchProtegido(`${API_BASE}/compliance/recertificacoes`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recertificacaoId, acao }) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) carregarRecertificacoesAcao();
}

// ==================== ABA: AUDITORIA — CADEIA DE HASH E ANCORAGEM EXTERNA (v4.12) ====================
async function verificarCadeiaAuditoriaAcao() {
  const msg = document.getElementById("resultadoCadeiaAuditoria");
  const res = await fetchProtegido(`${API_BASE}/auditoria/cadeia`);
  const d = await res.json();
  msg.textContent = d.integra
    ? `✅ Cadeia íntegra — ${d.total} registro(s) verificado(s).`
    : `⚠️ Cadeia VIOLADA — registro(s) quebrado(s): ${(d.quebrados || []).join(", ")}.`;
}

async function carregarAncoragensAcao() {
  const container = document.getElementById("resultadoAncoragens");
  const res = await fetchProtegido(`${API_BASE}/auditoria/ancoragens`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma ancoragem externa registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Quando</th><th>Método</th><th>Hash ancorado</th></tr></thead><tbody>`;
  lista.forEach(a => html += `<tr><td>${new Date(a.criadoEm).toLocaleString("pt-BR")}</td><td>${escaparHtmlEbd(a.metodo)}</td><td style="font-family:monospace;font-size:0.85em;">${escaparHtmlEbd(a.hashAncorado)}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarAncoragemAcao() {
  const metodo = document.getElementById("ancoragemMetodo").value;
  const hashAncorado = document.getElementById("ancoragemHash").value.trim();
  const arquivo = document.getElementById("ancoragemComprovante").files[0];
  const body = { metodo };
  if (hashAncorado) body.hashAncorado = hashAncorado;
  if (arquivo) { body.comprovanteBase64 = await arquivoParaBase64(arquivo); body.mimeType = arquivo.type; }
  const res = await fetchProtegido(`${API_BASE}/auditoria/ancoragens`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("ancoragemHash").value = "";
    document.getElementById("ancoragemComprovante").value = "";
    carregarAncoragensAcao();
  }
}

// ==================== ABA: AUDITORIA — AUDITORIA EM 3 NÍVEIS (v4.12) ====================
async function carregarAuditoriasNiveisAcao() {
  const container = document.getElementById("resultadoAuditoriasNiveis");
  const res = await fetchProtegido(`${API_BASE}/auditoria/niveis`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma auditoria registrada.</p>";
    return;
  }
  // Este recurso responde com SELECT * (colunas em PascalCase), diferente
  // dos demais endpoints do módulo que aliasam pra camelCase.
  let html = `<table class="tabela-frequencia"><thead><tr><th>Nível</th><th>Título</th><th>Ano</th><th>Status</th><th>Conclusão</th></tr></thead><tbody>`;
  lista.forEach(a => html += `<tr><td>${escaparHtmlEbd(a.Nivel)}</td><td>${escaparHtmlEbd(a.Titulo)}</td><td>${escaparHtmlEbd(a.AnoReferencia)}</td><td>${escaparHtmlEbd(a.Status)}</td><td>${escaparHtmlEbd(a.Conclusao) || "-"}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarAuditoriaNivelAcao() {
  const nivel = document.getElementById("auditoriaNivelNivel").value;
  const titulo = document.getElementById("auditoriaNivelTitulo").value.trim();
  const anoReferencia = document.getElementById("auditoriaNivelAno").value;
  const conclusao = document.getElementById("auditoriaNivelConclusao").value.trim();
  const arquivo = document.getElementById("auditoriaNivelDocumento").files[0];
  if (!titulo || !anoReferencia) { mostrarToast("Informe título e ano de referência.", "erro"); return; }
  const body = { nivel, titulo, anoReferencia: Number(anoReferencia) };
  if (conclusao) body.conclusao = conclusao;
  if (arquivo) { body.documentoBase64 = await arquivoParaBase64(arquivo); body.mimeType = arquivo.type; }
  const res = await fetchProtegido(`${API_BASE}/auditoria/niveis`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("auditoriaNivelTitulo").value = "";
    document.getElementById("auditoriaNivelAno").value = "";
    document.getElementById("auditoriaNivelConclusao").value = "";
    document.getElementById("auditoriaNivelDocumento").value = "";
    carregarAuditoriasNiveisAcao();
  }
}

// ==================== ABA: AUDITORIA — PARECER MENSAL DO CONSELHO FISCAL (v4.12) ====================
async function carregarPareceresConselhoAcao() {
  const container = document.getElementById("resultadoPareceresConselho");
  const res = await fetchProtegido(`${API_BASE}/auditoria/pareceres`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhum parecer registrado.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Mês</th><th>Decisão</th><th>Justificativa</th><th>Por</th></tr></thead><tbody>`;
  lista.forEach(p => html += `<tr><td>${escaparHtmlEbd(p.mesReferencia)}</td><td>${p.decisao === "APROVADO" ? "✅ Aprovado" : "❌ Rejeitado"}</td><td>${escaparHtmlEbd(p.justificativa) || "-"}</td><td>${escaparHtmlEbd(p.parecerPorNome)}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarParecerConselhoAcao() {
  const mesReferencia = document.getElementById("parecerMes").value;
  const decisao = document.getElementById("parecerDecisao").value;
  const justificativa = document.getElementById("parecerJustificativa").value.trim();
  const arquivo = document.getElementById("parecerDocumento").files[0];
  if (!mesReferencia) { mostrarToast("Informe o mês de referência.", "erro"); return; }
  const body = { mesReferencia, decisao };
  if (justificativa) body.justificativa = justificativa;
  if (arquivo) { body.documentoBase64 = await arquivoParaBase64(arquivo); body.mimeType = arquivo.type; }
  const res = await fetchProtegido(`${API_BASE}/auditoria/pareceres`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("parecerJustificativa").value = "";
    document.getElementById("parecerDocumento").value = "";
    carregarPareceresConselhoAcao();
  }
}

// ==================== ABA: AUDITORIA — NIF / COAF (v4.12) ====================
async function carregarSinalizacoesNifAcao() {
  const container = document.getElementById("resultadoSinalizacoesNif");
  const res = await fetchProtegido(`${API_BASE}/nif/sinalizacoes`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista)) {
    container.innerHTML = `<p class='subtitle'>${(lista && escaparHtmlEbd(lista.mensagem)) || "Sem acesso a este recurso (restrito à Tesouraria Geral)."}</p>`;
    return;
  }
  if (lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma sinalização registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Tipo</th><th>Descrição</th><th>Fornecedor</th><th>Status</th><th>Quando</th><th>Ações</th></tr></thead><tbody>`;
  lista.forEach(s => {
    let acoes = "-";
    if (s.status === "PENDENTE") {
      acoes = `<button class="btn-link" data-on-click="decidirSinalizacaoNifAcao" data-args-click="${argsAttr(s.sinalizacaoId, "CONFIRMAR")}">Confirmar</button>
               <button class="btn-link btn-link-perigo" data-on-click="decidirSinalizacaoNifAcao" data-args-click="${argsAttr(s.sinalizacaoId, "DESCARTAR")}">Descartar</button>`;
    } else if (s.status === "CONFIRMADA") {
      acoes = `<button class="btn-link" data-on-click="registrarComunicacaoCoafAcao" data-args-click="${argsAttr(s.sinalizacaoId)}">Comunicar ao COAF</button>`;
    }
    html += `<tr><td>${escaparHtmlEbd(s.tipo)}</td><td>${escaparHtmlEbd(s.descricao)}</td><td>${escaparHtmlEbd(s.fornecedorNome) || "-"}</td><td>${escaparHtmlEbd(s.status)}</td><td>${new Date(s.criadoEm).toLocaleString("pt-BR")}</td><td class="acoes-inline">${acoes}</td></tr>`;
  });
  html += "</tbody></table>";
  container.innerHTML = html;
}

async function registrarSinalizacaoNifAcao() {
  const tipo = document.getElementById("nifTipo").value;
  const descricao = document.getElementById("nifDescricao").value.trim();
  const saidaId = document.getElementById("nifSaidaId").value;
  const fornecedorId = document.getElementById("nifFornecedorId").value;
  if (!descricao) { mostrarToast("Descreva o indício de risco.", "erro"); return; }
  const body = { tipo, descricao };
  if (saidaId) body.saidaId = Number(saidaId);
  if (fornecedorId) body.fornecedorId = Number(fornecedorId);
  const res = await fetchProtegido(`${API_BASE}/nif/sinalizacoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) {
    document.getElementById("nifDescricao").value = "";
    document.getElementById("nifSaidaId").value = "";
    document.getElementById("nifFornecedorId").value = "";
    carregarSinalizacoesNifAcao();
  }
}

async function decidirSinalizacaoNifAcao(sinalizacaoId, acao) {
  if (acao === "DESCARTAR" && !(await confirmarAcao("Descartar esta sinalização de risco?", "Descartar"))) return;
  const res = await fetchProtegido(`${API_BASE}/nif/sinalizacoes`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sinalizacaoId, acao }) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarSinalizacoesNifAcao(); carregarComunicacoesCoafAcao(); }
}

async function registrarComunicacaoCoafAcao(sinalizacaoId) {
  const protocolo = await pedirTexto("Comunicação ao COAF", "Protocolo da comunicação (opcional — se não houver, digite um traço \"-\")");
  if (protocolo === null) return;
  const res = await fetchProtegido(`${API_BASE}/nif/comunicacoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sinalizacaoId, protocolo }) });
  const data = await res.json();
  avisarResultado(data);
  if (data.sucesso) { carregarComunicacoesCoafAcao(); carregarSinalizacoesNifAcao(); }
}

async function carregarComunicacoesCoafAcao() {
  const container = document.getElementById("resultadoComunicacoesCoaf");
  const res = await fetchProtegido(`${API_BASE}/nif/comunicacoes`);
  const lista = await jsonDaTela(res, container, "lista");
  if (lista === null) return;
  if (!Array.isArray(lista)) {
    container.innerHTML = `<p class='subtitle'>${(lista && escaparHtmlEbd(lista.mensagem)) || "Sem acesso a este recurso (restrito à Tesouraria Geral)."}</p>`;
    return;
  }
  if (lista.length === 0) {
    container.innerHTML = "<p class='subtitle'>Nenhuma comunicação registrada.</p>";
    return;
  }
  let html = `<table class="tabela-frequencia"><thead><tr><th>Sinalização</th><th>Protocolo</th><th>Prazo 24h</th><th>Observação</th><th>Quando</th></tr></thead><tbody>`;
  lista.forEach(c => html += `<tr><td>#${c.sinalizacaoId}</td><td>${escaparHtmlEbd(c.protocolo) || "-"}</td><td>${c.dentroPrazo24h ? "✅ Dentro do prazo" : "⚠️ Fora do prazo"}</td><td>${escaparHtmlEbd(c.observacao) || "-"}</td><td>${new Date(c.dataComunicacao).toLocaleString("pt-BR")}</td></tr>`);
  html += "</tbody></table>";
  container.innerHTML = html;
}

// ---- Ajudantes de tela compartilhados (escape de HTML, argumentos de ação, URL, datas/moeda e leitura de campo): nasceram na EBD (v6.x) e servem a todo o front — ficam no núcleo ----
function numeroDoCampo(id) {
  const campo = document.getElementById(id);
  const v = campo ? String(campo.value).trim() : "";
  return v === "" ? null : Number(v);
}

// Texto digitado por gente (nome de aluno não-membro, responsável,
// observação) passa por aqui antes de ir pro innerHTML.
function escaparHtmlEbd(texto) {
  return String(texto == null ? "" : texto).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// CSP forte (app/eventos.js): os argumentos de uma ação vão em data-args-<tipo>="${argsAttr(a, b)}" — JSON de verdade (não texto JS), escapado para
// atributo. Nunca é executado: o despachante faz JSON.parse e chama só ação registrada. ARG.elemento/evento/valor/marcado = o antigo this/event/
// this.value/this.checked. Qualquer valor (inclusive de usuário) entra por aqui, nunca cru no atributo. Substitui o antigo argJs (texto JS dentro de
// onclick="f(${argJs(x)})"): onde ele era usado, a conversão passou String(x ?? "") — o mesmo texto que a função recebia antes (nulo virava "").
// Testes permanentes: api/shared/__tests__/frontEscape.test.js (escape) e frontCsp.test.js (nenhum código no HTML).
function argsAttr(...valores) {
  return escaparHtmlEbd(JSON.stringify(valores.map(codificarArgEvento)));
}

// Endereço que vai para href/src: só http(s), blob:, mailto:, tel:, imagem em data: e caminho relativo; "javascript:" e qualquer outro esquema viram "#".
// O escape de HTML sozinho não barra o esquema (um link "javascript:..." continua clicável depois de escapado). Espaço e caractere de controle no meio do
// esquema ("java\tscript:") o navegador ignora — por isso a conferência é feita sem eles.
function urlSegura(url) {
  const u = String(url == null ? "" : url).trim();
  const semControle = u.replace(/[\u0000- \u007f]/g, "");
  const esquema = /^([a-z][a-z0-9+.\-]*):/i.exec(semControle);
  if (esquema && !/^(https?|blob|mailto|tel)$/i.test(esquema[1]) && !/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(semControle)) return "#";
  return escaparHtmlEbd(u);
}

function formatarDataEbd(valor) {
  if (!valor) return "-";
  const [a, m, d] = String(valor).slice(0, 10).split("-");
  return `${escaparHtmlEbd(d)}/${escaparHtmlEbd(m)}/${escaparHtmlEbd(a)}`;
}

function formatarMoedaEbd(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---- CSP forte: AÇÕES QUE O HTML PODE PEDIR (data-on-click="nome" etc.) — app/eventos.js só chama o que está aqui ----
// Lista GERADA a partir de todos os data-on-* do index.html e do script.js (688 ações, ordem alfabética). O teste
// api/shared/__tests__/frontCsp.test.js confere que cada nome usado está aqui e que nada sobra. Ação nova: escreva data-on-click="minhaAcao" no HTML
// e acrescente minhaAcao abaixo (referência direta à função, nunca texto: o despachante não procura nada em window).
registrarAcoes({
  abrirModalAnexos, abrirNotificacao,
  acaoMinhaTarefa, acessarPainel,
  adicionarBlocoPerguntaEnquete, adicionarMembroCCJ,
  adicionarMembroPMO,
  alterarMeuPinAcao, alterarVisibilidadeDocumentoAcao, alternarAjudaContextual,
  alternarLoginPorCodigo, alternarMenuCelular, alternarMeusDadosLGPD, alternarModoLeitura, alternarPainelNotificacoes, alternarPushAcao, alternarSidebar,
  arquivarNotificacao,
  ativarComTeclado,
  atualizarPoliticaRetencao,
  cancelarDelegacaoAcao,
  carregarAlertasComplianceAcao, carregarAuditoria,
  carregarDocumentos,
  carregarIndicadoresAcao,
  carregarRecertificacoesAcao,
  confirmarCodigoAcessoAcao,
  criarDelegacaoAcao,
  criarPinAcao,
  criarSolicitacaoLGPD,
  decidirRecertificacaoAcao,
  decidirSinalizacaoNifAcao,
  desativarCongregacaoDetalheAcao,
  editarCatalogo, editarCongregacaoDetalhe,
  editarDiasRetencaoAcao, editarOrgao,
  encerrarAssentoAcao, encerrarAssentoCLIAcao,
  encerrarEnqueteAcao,
  encerrarSessaoAcao, entrarModulo, enviarAnexoModal,
  enviarMinhaFotoAcao, enviarPresenca, enviarSolicitacaoEdicaoAcao,
  excluirAnexoModal, excluirCatalogo, excluirCongregacaoDetalheAcao,
  excluirDocumentoAcao, excluirOrgao,
  fecharModal, fecharPrimeiroAcesso,
  filtrarCatalogo, filtrarMinhasTarefas,
  gerarPinProvisorioAcao,
  instalarAppAcao, irParaBlocoPainel, irParaResultadoBusca,
  limparFormCongregacaoDetalhe,
  marcarTodasNotificacoesLidas,
  mostrarAbaSecretaria, mostrarSubAbaMeupainel, mostrarTelaPainelInicial,
  mudarPaginaCatalogo, onChangePublicoEnquete,
  onChangeTipoPerguntaEnquete, onChangeVinculanteEnquete, onDigitarBuscaGlobal,
  reativarCongregacaoDetalheAcao,
  registrarAncoragemAcao,
  registrarAuditoriaNivelAcao, registrarAutolancamentoAcao, registrarComunicacaoCoafAcao,
  registrarParecerConselhoAcao,
  registrarPrestacaoContasAcao,
  registrarSinalizacaoNifAcao,
  registrarVersaoTextoMestreAcao,
  removerBlocoPerguntaEnquete, removerMembroComissaoAcao, removerMeuVinculoAcao,
  resolverAlertaComplianceAcao,
  sairDoModulo, sairDoPainel,
  salvarAssento, salvarAssentoCLI,
  salvarCatalogo, salvarCongregacaoDetalhe, salvarConsentimentoLGPD,
  salvarDocumentoAcao,
  salvarEnquete,
  salvarMeusDadosAcao, salvarMeuVinculoAcao,
  salvarOrgao,
  selecionarOrgaoReunioes, solicitarCodigoAcessoAcao,
  solicitarJustificativaAcao,
  trocarMinhaSenha,
  verificarCadeiaAuditoriaAcao,
  voltarParaCheckin,
  votarEnqueteAcao
});
